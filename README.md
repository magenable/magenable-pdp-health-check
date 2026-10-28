# PDP Health Check by Magenable

A local-first Chrome extension for on-demand ecommerce product-page diagnostics.

**Version 0.2.0 has been submitted to the Chrome Web Store. Its last verified review status is `PENDING_REVIEW`; submission does not mean approval or publication.** Until a Store release is confirmed, use the unpacked installation below.

## Features

- Manual analysis in Chrome's native side panel, with no extension account, backend or API key required.
- 28 checks covering page metadata and SEO, Product and ProductGroup JSON-LD, a supported Product/Offer microdata subset, content readiness, conversion elements and local technical observations.
- Findings with supporting evidence, recommendations, confidence levels, evidence coverage and method labels.
- Context-aware price and stock comparisons. Unresolved product, variant, currency or fulfilment alignment remains **Not Evaluated** rather than becoming a confirmed defect.
- Separate visible delivery, pickup and store stock statements. These are website statements, not verified inventory.
- Configurable, deterministic scoring, temporary report caching, summary copying and text/JSON exports.
- No runtime AI, page-HTML uploads, remote analytics, automatic crawling or blanket website access.

## Install and use

Download [the version 0.2.0 runtime ZIP](https://github.com/magenable/magenable-pdp-health-check/blob/main/releases/0.2.0/extension.zip) and unzip it. In Chrome, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the folder containing `manifest.json`.

1. Open a normal HTTP(S) product page.
2. Click the extension's toolbar icon, then **Analyse This Page**.
3. Review the findings, confidence levels, coverage and limitations before acting on recommendations.
4. Click the toolbar icon again after changing tabs or navigating. Explicitly reanalyse after changes to page content, prices or variants.

Restricted pages and security-verification screens cannot be audited as product pages. The extension does not bypass login, CAPTCHA or checkout controls.

## Build and test

The recorded pilot toolchain is Node.js 24, npm 11 and Python 3.12. Chrome 116 is the declared API/build floor, not a certified historical runtime. Automated native-panel tests use Chromium for Testing 156.0.8078.4.

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

Load `dist/` unpacked to test a source build. Dependencies, generated build output, browser profiles and test artifacts are not tracked.

The versioned runtime ZIP contains 10 runtime files. Its SHA-256 checksum is:

```text
292c11da3e504920e327167decd53804ca8616a1f01d002fc531f51654a97881
```

The recorded verification includes 170 unit/regression tests and 8 native-browser scenarios covering user-granted access, report exports, uncertainty, stock context, security and synthetic storefront templates. These results do not certify every theme, platform or browser version. The default suite does not visit production websites or make purchases.

## Privacy and support

Read the [Magenable privacy policy](https://magenable.com.au/privacy-policy/) for local processing, storage and user-controlled sharing information. The website is the canonical policy source; this repository does not maintain a separate policy copy.

For questions, bug reports and licensing enquiries, use [GitHub Issues](https://github.com/magenable/magenable-pdp-health-check/issues). See [support guidance](SUPPORT.md) for useful report details and [security reporting guidance](SECURITY.md) before reporting a vulnerability.

The extension requires no account. Opening a GitHub issue requires a GitHub account. Issues are public: do not post credentials, cookies, customer information, private URLs, personal addresses or unreviewed reports/screenshots.

## Scope and limitations

Metadata and supported schema checks form the core. Rendered-page observations are best-effort, and comparisons require independently aligned evidence. Recognising a ProductGroup family does not establish the selected variant.

Custom widgets, hidden or inert templates, inaccessible frames and shadow roots, and unsupported structured-data formats can limit coverage. This is not a full SEO, accessibility, mobile UX, performance, inventory or rich-result eligibility audit. It does not guarantee rankings, AI citations, conversion improvements or sales. Categories and the overall score may remain unavailable when evidence is insufficient.

## About Magenable

Magenable is an ecommerce and AI consultancy based in Melbourne, Australia. We help businesses improve their online stores through practical strategy, development and optimisation. [Explore Magenable's services](https://magenable.com.au/).

## Repository and licensing

This public repository is a clean source snapshot, not a mirror of private development history. No open-source licence has been selected or granted; public visibility does not grant an MIT or Apache licence. Magenable branding remains its owner's property. Raise reuse or licensing questions through GitHub Issues.
