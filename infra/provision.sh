#!/usr/bin/env bash
# Provision the Azure contact-form backend (HTTP Function + system-assigned
# managed identity granted Microsoft Graph Mail.Send). Idempotent-ish: safe to
# re-run; existing resources are reused.
#
# Prereqs: az CLI logged in to the target subscription, plus Azure Functions Core
# Tools (`func`) for deployment. Run from the repo root: bash infra/provision.sh
#
# After this script: complete the TWO manual steps in infra/README.md
#   1. Cloudflare Turnstile keys.
#   2. Exchange ApplicationAccessPolicy (locks Mail.Send to info@ only).
set -euo pipefail

# ---- Config (Microsoft CAF naming: <type>-<workload>-<env>-<region>) ---------
# Workload: secotron-www  |  Env: prod  |  Region: westeurope (weu)
WORKLOAD="secotron-www"
ENVIRONMENT="prod"
REGION_ABBR="weu"
LOCATION="westeurope"

# Pin to the Sponsorship subscription in the SECOTRON tenant (5e86a914…), where
# the secotron.eu mailboxes live — NOT the same-named sub in the geens.be tenant.
# Managed-identity Graph sendMail only works when compute + mailbox share a tenant.
SUBSCRIPTION_ID="1fa85a0e-0ae3-40fa-8537-adeb4499f8bf"

RG="rg-${WORKLOAD}-${ENVIRONMENT}-${REGION_ABBR}"
FUNCAPP="func-${WORKLOAD}-${ENVIRONMENT}-${REGION_ABBR}"
APPI="appi-${WORKLOAD}-${ENVIRONMENT}-${REGION_ABBR}"
# Storage accounts: no hyphens, lowercase alphanumeric, <=24 chars.
STORAGE="stsecotronwwwprod${REGION_ABBR}"   # stsecotronwwwprodweu (20 chars)

MAIL_FROM="info@secotron.eu"
MAIL_TO="thomas.geens@secotron.eu"
ALLOWED_ORIGINS="https://www.secotron.eu,https://www.secotron.be,https://www.secotron.com,https://secotron.github.io,http://localhost:4000"
TURNSTILE_SECRET="${TURNSTILE_SECRET:-REPLACE_ME}"   # export before running, or edit

GRAPH_APP_ID="00000003-0000-0000-c000-000000000000"  # Microsoft Graph
MAILSEND_ROLE_ID="b633e1c5-b582-4048-a93e-9f11b44c7e96" # Graph app role: Mail.Send

# ---- Resource group + storage + function app --------------------------------
echo "==> Select subscription ($SUBSCRIPTION_ID, SECOTRON tenant)"
az account set --subscription "$SUBSCRIPTION_ID"

echo "==> Resource group"
az group create -n "$RG" -l "$LOCATION" -o none

echo "==> Storage account ($STORAGE)"
az storage account create -n "$STORAGE" -g "$RG" -l "$LOCATION" \
  --sku Standard_LRS --allow-blob-public-access false -o none

echo "==> Application Insights ($APPI)"
az extension add --upgrade -n application-insights -y >/dev/null 2>&1 || true
APPI_KEY=$(az monitor app-insights component create \
  --app "$APPI" -g "$RG" -l "$LOCATION" --kind web \
  --query instrumentationKey -o tsv 2>/dev/null) || true

echo "==> Function app ($FUNCAPP)"
az functionapp create -n "$FUNCAPP" -g "$RG" \
  --storage-account "$STORAGE" \
  --consumption-plan-location "$LOCATION" \
  --runtime node --runtime-version 22 --functions-version 4 \
  --os-type Linux \
  ${APPI_KEY:+--app-insights "$APPI"} \
  --assign-identity '[system]' -o none
# Node 22 (LTS). NOTE: Node 24's Linux Consumption worker image was broken in
# West Europe (container 503'd on start); 22 is stable. Bump only after verifying.

# ---- App settings ------------------------------------------------------------
echo "==> App settings"
az functionapp config appsettings set -n "$FUNCAPP" -g "$RG" --settings \
  MAIL_FROM="$MAIL_FROM" \
  MAIL_TO="$MAIL_TO" \
  ALLOWED_ORIGINS="$ALLOWED_ORIGINS" \
  TURNSTILE_SECRET="$TURNSTILE_SECRET" -o none

# ---- CORS (browser origins allowed to call the function) --------------------
echo "==> CORS"
IFS=',' read -ra ORIGINS <<< "$ALLOWED_ORIGINS"
for o in "${ORIGINS[@]}"; do
  az functionapp cors add -n "$FUNCAPP" -g "$RG" --allowed-origins "$o" -o none || true
done

# ---- Grant Graph Mail.Send to the managed identity --------------------------
echo "==> Grant Graph Mail.Send to managed identity (needs admin rights)"
MI_PRINCIPAL_ID=$(az functionapp identity show -n "$FUNCAPP" -g "$RG" --query principalId -o tsv)
GRAPH_SP_ID=$(az ad sp show --id "$GRAPH_APP_ID" --query id -o tsv)
az rest --method POST \
  --uri "https://graph.microsoft.com/v1.0/servicePrincipals/$GRAPH_SP_ID/appRoleAssignedTo" \
  --headers "Content-Type=application/json" \
  --body "{\"principalId\":\"$MI_PRINCIPAL_ID\",\"resourceId\":\"$GRAPH_SP_ID\",\"appRoleId\":\"$MAILSEND_ROLE_ID\"}" \
  -o none || echo "   (app-role assignment may already exist, or you lack admin rights — see README)"

# The managed identity's application (client) ID — needed for the Exchange
# ApplicationAccessPolicy step in README.md.
MI_APP_ID=$(az ad sp show --id "$MI_PRINCIPAL_ID" --query appId -o tsv)

echo ""
echo "==> Provisioned."
echo "    Function URL : https://$FUNCAPP.azurewebsites.net/api/contact"
echo "    MI appId     : $MI_APP_ID   (use in Exchange ApplicationAccessPolicy)"
echo ""
echo "Next:"
echo "  1) Update data-endpoint in en/contact.html + nl/contact.html to the Function URL."
echo "  2) Set Turnstile keys (README step 1) — site key in the forms, secret in app settings."
echo "  3) Lock Mail.Send to info@ only (README step 2) using MI appId above."
echo "  4) Deploy code:  cd api && npm install && func azure functionapp publish $FUNCAPP"
