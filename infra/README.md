# Contact-form backend (Azure)

The contact form is a static page that POSTs JSON to an **Azure Function**, which
sends the enquiry by email through **Microsoft Graph `sendMail`**.

```
Browser form ──POST JSON──▶ Azure Function (HTTP, anonymous)
                              │  verifies Cloudflare Turnstile token
                              │  honeypot + per-IP throttle + origin + input caps
                              │  auth: system-assigned managed identity (no secrets)
                              ▼
                            Microsoft Graph  /users/info@secotron.eu/sendMail
                              ▼
                            email to thomas.geens@secotron.eu  (reply-to = enquirer)
```

- **From:** `info@secotron.eu` · **To:** `thomas.geens@secotron.eu`
- Hardcoded sender + recipient in code → it is **not an open relay**. Worst-case
  abuse is junk landing in the inbox, which Turnstile + throttle prevent.

## Security scoping — why this is safe
Graph `Mail.Send` is an *application* permission that, by default, lets the
identity send as **any** mailbox in the tenant. We constrain it two ways:
1. Code only ever sends from `MAIL_FROM` (info@) to `MAIL_TO` (thomas.geens@).
2. **Exchange `ApplicationAccessPolicy`** restricts the identity so Graph itself
   refuses any mailbox other than `info@` (step 2 below). Defence in depth.

## Resources (Microsoft CAF naming)
Workload `secotron-www`, environment `prod`, region West Europe (`weu`).

| Resource | Name |
| --- | --- |
| Resource group | `rg-secotron-www-prod-weu` |
| Function app | `func-secotron-www-prod-weu` |
| Storage account | `stsecotronwwwprodweu` |
| Application Insights | `appi-secotron-www-prod-weu` |

Function endpoint: `https://func-secotron-www-prod-weu.azurewebsites.net/api/contact`

## One-time setup

### 0. Prerequisites
- Mailboxes exist in Microsoft 365: `info@secotron.eu` (a **shared mailbox** is
  ideal — no license needed) and `thomas.geens@secotron.eu`.
- Tools: `az` (logged into the Sponsorship sub), Azure Functions Core Tools (`func`),
  Node 20.
- You have admin rights to grant a Graph app role (Application Administrator,
  Privileged Role Administrator, or Global Administrator).

### 1. Cloudflare Turnstile keys (free)
1. Cloudflare dashboard → **Turnstile** → **Add site**.
2. Domains: `secotron.eu`, `secotron.be`, `secotron.com`, `localhost`.
3. Copy the **Site Key** (public) and **Secret Key** (private).

The **Site Key** is never hard-coded — it's injected into `data-sitekey` at build
time from `site.turnstile_sitekey`:
- **Production (GitHub Actions):** add a repo **Variable** (Settings → Secrets and
  variables → Actions → *Variables*) named `TURNSTILE_SITEKEY`. The workflow writes
  it into `_config.ci.yml` and merges it at build.
- **Local:** keep it in `.envrc.local` as `export TURNSTILE_SITEKEY=…`; `make serve`
  generates `_config.local.yml` from it automatically (both git-ignored).

The **Secret Key** is private and lives only in the Function app setting
`TURNSTILE_SECRET` (keep it in `.envrc.local`; `provision.sh` reads it from the
environment — run it via `direnv exec . bash infra/provision.sh`).

### 2. Provision Azure
```sh
export TURNSTILE_SECRET="<your turnstile secret>"
bash infra/provision.sh
```
Note the printed **Function URL** and **MI appId**.

### 3. Point the site at the Function
In `en/contact.html` and `nl/contact.html`, set `data-endpoint` to the printed
Function URL (`https://<app>.azurewebsites.net/api/contact`). Rebuild the site.

### 4. Lock Mail.Send to info@ only (Exchange Online PowerShell)
Run in Exchange Online PowerShell (`Connect-ExchangeOnline`), using the **MI appId**
from step 2:
```powershell
# Group containing only the mailbox(es) the app may send as
New-DistributionGroup -Name "SecotronAppSenders" -Type Security `
  -Members info@secotron.eu

New-ApplicationAccessPolicy -AppId <MI-appId> `
  -PolicyScopeGroupId SecotronAppSenders@secotron.eu `
  -AccessRight RestrictAccess `
  -Description "Restrict Graph Mail.Send to info@ only"

# Verify (should be Granted for info@, Denied for any other mailbox)
Test-ApplicationAccessPolicy -Identity info@secotron.eu -AppId <MI-appId>
```
(Policy propagation can take up to ~30 min.)

### 5. Deploy the function code
```sh
cd api
npm install
func azure functionapp publish func-secotron-www-prod-weu
```

## Test
```sh
curl -i -X POST https://<app>.azurewebsites.net/api/contact \
  -H "Origin: https://www.secotron.eu" -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"t@example.com","message":"hi","cf-turnstile-response":"x"}'
# Expect 400 captcha_failed (token invalid) — proves validation runs.
```
Then submit the real form in a browser (valid Turnstile) and confirm the email
arrives at `thomas.geens@secotron.eu` with reply-to set to the enquirer.

## Observability
Telemetry → **Application Insights** (`appi-secotron-www-prod-weu`).
- Each request logs a correlated set (`[<rid>] contact: received|turnstile|graph
  sendMail ok|done …`) with timings, Turnstile `error-codes`, Graph status/request-id.
- Custom event `ContactProcessed` (`outcome`, `reason`, `durationMs`) + metric
  `ContactDurationMs`. Sampling disabled. Ingestion lag ~2–5 min.
- View: Portal → Function App → Application Insights → Live Metrics / Logs, e.g.
  `traces | where message contains "contact:" | order by timestamp desc`.

## Cost
Consumption plan: free grant of 1M executions/month. At your volume the form is
effectively free. (Application Insights, if enabled, has a small free tier too.)

> Dependency note: the form relies on this subscription staying active. If the
> Sponsorship sub is ever reclaimed, the form stops working — the page still shows
> the direct email address as a fallback.
