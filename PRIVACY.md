# Privacy policy — PDP Health Check by Magenable

Prepared 28 October 2026 for extension version 0.2.0. **Extension-specific notice for publisher review before Store submission; this does not replace the privacy policy on Magenable's website.** Publisher: Magenable. Contact: support@magenable.com.au.

**Legal address:** 4/74 Armstrong Street, Middle Park, VIC, 3206, Australia (as confirmed by Magenable).

## What the extension reads
Only after you activate the intended tab and click Analyse, the extension reads bounded product-page text, title/metadata, JSON-LD/ProductGroup/supported microdata, product images/controls, public fulfilment/store stock labels and basic DOM observations. The selected page address is used locally to target the analysis and match product identity. It does not access browser history, cookies, passwords or form input values, and is not a background monitor/crawler.

Public product pages are the intended target. Filters/redaction reduce unrelated personal content but cannot reliably classify every possible webpage; do not analyse sensitive/private pages, and review evidence before sharing. Product price/currency and public store labels are not customer payment details or device geolocation.

## Local processing and storage
No page HTML, page URLs or product data are uploaded to Magenable, analytics services or AI providers. Local-only handling still includes website content and current-page address/origin information.

Up to ten reports are held in chrome.storage.session, storing page origin rather than its full path/query/fragment. Reports have a30-minute reuse window, with expired entries pruned on interaction; this is not a guarantee of erasure at exactly30 minutes. Browser-session end or Clear results removes reports. Temporary action/tab/job state supports the manual audit and permission lifecycle.

Scoring preferences and non-identifying aggregate extension-interaction counts are stored in chrome.storage.local until cleared/uninstalled. Counters cover opens, audit lifecycle, finding expansion, copy/export and optional company-link clicks. There is no per-event history, installation identifier, keystroke/cursor monitoring, background browsing timeline, remote analytics or storage.sync.

Clear results & counters deletes reports/counters but preserves weights. Restore defaults resets weights. Uninstall removes extension storage.

## User-controlled copying, exports and links
Only explicit actions copy/export a report. Clipboard/files are then under your control and outside the extension's retention policy. Review/redact them before sharing.

Magenable links open an external website only when clicked, without audit/product data attached; that site's own privacy policy applies. GitHub support is optional, requires a GitHub account to post, and is public. Do not post private information; email support@magenable.com.au instead where appropriate. Material you voluntarily send for support is a separate communication, not an automatic extension upload.

## Limited Use and external services
Handled data is used only for the disclosed user-requested diagnostic, local report/preferences/counters and explicit copy/export. It is not sold, used for advertising, profiling, creditworthiness or unrelated purposes, or automatically transferred for remote human review. The extension's use of handled information is intended to comply with the Chrome Web Store User Data Policy, including Limited Use requirements. It has no external PageSpeed, LLM, telemetry, Magenable backend or private API credential integration.

## Contact and changes
For privacy/support questions contact support@magenable.com.au. This policy is versioned in this public repository. Material changes will be documented here and, where applicable, in release notes/disclosures before new data-sharing functionality is introduced. No registration is needed to use the diagnostic.
