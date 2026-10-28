# PDP Health Check by Magenable

A local-first Chrome extension for on-demand ecommerce product-page diagnostics. Version0.2.0 is an experimental pilot, not a Chrome Web Store-approved release or a full SEO/performance/rich-result audit.

## Features
- Manual analysis in Chrome's native side panel; no registration/backend/API key.
-28 checks across metadata/SEO, Product and ProductGroup JSON-LD, a supported Product/Offer microdata subset, content readiness, conversion elements and local technical observations.
- Evidence, recommendations, confidence, coverage and method labels. Best-effort DOM detection is not proof of feature absence; unaligned variant/price/stock comparisons remain Not Evaluated.
- Separate visible delivery/pickup/store stock wording. This is the page's statement, not verified inventory.
- Configurable deterministic scoring, session caching, copy summary and text/JSON exports.
- No runtime AI, HTML upload, remote analytics, automatic crawling or blanket host access.

## Install
Until a Store listing is available, download [the runtime ZIP](releases/0.2.0/extension.zip), unzip it, then Chrome → chrome://extensions → Developer mode → Load unpacked. Choose the directory containing manifest.json.

Open a normal HTTP(S) product page, click the toolbar icon, then Analyse This Page. Click the icon again after changing tabs/navigating. Explicitly reanalyse after page/variant changes. Read coverage and limitations, not just scores. A verification screen cannot be treated as a PDP.

## Build and test
Node24/npm11 and Python3.12 were used for this pilot. Chrome116 is the declared API/build floor, not a certified historical runtime; automated native-panel evidence is Chromium156.0.8078.4.

```sh
npm ci
npm run typecheck
npm run lint
npm test
npx playwright install chromium
npm run build
npm run test:e2e
npm run package
```

Load dist/ unpacked. Generated artifacts, browser profiles and dependencies are not tracked. The included0.2.0 runtime ZIP has SHA256:
`292c11da3e504920e327167decd53804ca8616a1f01d002fc531f51654a97881`

The pilot has170 unit/regression tests and8 native-browser scenarios, including manual permission grants, real report exports, uncertainty/stock scope, security and offline synthetic templates. These are not universal theme/platform/browser certification. No production websites or purchases are exercised by the default suite.

## Privacy and support
- [Privacy policy](PRIVACY.md)
- [Support and reporting guidance](SUPPORT.md)
- [Report a bug](https://github.com/magenable/magenable-pdp-health-check/issues)
- Email: support@magenable.com.au (also available without a GitHub account)
- Website: https://magenable.com.au/
- [Security reporting](SECURITY.md)

Never post credentials, cookies, private/customer URLs, account data or unreviewed screenshots/reports in public issues. Exported data should be reviewed/redacted before sharing.

## Scope and limitations
Metadata/schema checks form the core; rendered observations are best-effort and comparisons require independent aligned evidence. Parent-family recognition is not current-size selection. Hidden/inert templates, unusual controls, frames/shadow roots and unsupported structured formats may be missed. No full schema context/inheritance/RDFa/eligibility validation, mobile-layout simulation, PSI/Web Vitals or guaranteed inventory/search/AI-ranking/conversion improvement. Category and overall scores may be unavailable under evidence gates. No paid functions or accounts.

This public repository is a clean source snapshot, not a mirror of private development history. No open-source licence has been selected or granted; public visibility is not an MIT/Apache licence. Magenable branding remains its owner's property. Contact support@magenable.com.au regarding reuse/licensing.
