# secotron.eu

Marketing website for **SECOTRON** — independent IT consultancy (Belgium).
Static [Jekyll](https://jekyllrb.com/) site hosted on **GitHub Pages**, built via
GitHub Actions (`.github/workflows/pages.yml`).

## Local development

```sh
make install   # bundle install
make run       # serve at http://localhost:4000 with livereload
make build     # production build into _site/
```

## Structure

- `en/` — English pages (served at `/`).
- `nl/` — Dutch pages (served at `/nl/`).
- `_layouts/default.html` — shared chrome (nav, footer, SEO, JSON-LD).
- `_data/company.yml` — single source of truth for company identity.
- `_data/i18n.yml` — UI strings + per-language nav URLs.
- `assets/css/main.css` — styling (SECOTRON brand palette).
- `assets/js/` — `particles.js`, `font-toggle.js` (theme + typography switch).

## Bilingual model

Manual i18n: each page sets `lang` and `alt` (the counterpart-language URL) in
front matter; the language switch and `hreflang` tags use `alt`. No plugin, so
the Actions build stays deterministic.

## Before launch — checklist

- [ ] Stand up the Azure contact-form backend — see [`infra/README.md`](infra/README.md).
      Then set `data-endpoint` (Function URL) and `data-sitekey` (Turnstile) in
      `en/contact.html` + `nl/contact.html`. Mail flows `contact@` → `thomas.geens@`.
- [ ] Confirm the LinkedIn URL in `_data/company.yml`.
- [ ] DNS: point `www.secotron.eu` (CNAME → `secotron.github.io`) and apex
      `secotron.eu` (A records to GitHub Pages) — leave MX/SPF/DKIM untouched.
- [ ] Redirect `.be` / `.com` to `https://www.secotron.eu` via registrar URL forwarding.
- [ ] Optional: add cookieless analytics (GoatCounter / Plausible) snippet.
