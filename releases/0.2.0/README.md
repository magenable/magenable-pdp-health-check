# Runtime package — version 0.2.0

`extension.zip` is the verified Manifest V3 runtime package, not the larger Store-preparation or artwork bundle. It contains 10 runtime files and is 45,119 bytes long.

Version 0.2.0 has been submitted to the Chrome Web Store. Its last verified review status is `PENDING_REVIEW`; approval or publication has not been confirmed.

## Install and rebuild

For an unpacked installation, unzip `extension.zip`, open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**. Select the folder containing `manifest.json`.

Build from the repository root with `npm ci` followed by `npm run package`. Compare the generated package's SHA-256 checksum with:

```text
292c11da3e504920e327167decd53804ca8616a1f01d002fc531f51654a97881
```

Do not overwrite this versioned artifact with different runtime bytes. Documentation updates do not change the package or its Store-review status.

This is an experimental diagnostic, not a complete SEO, accessibility, performance, inventory or rich-result eligibility audit. Public source visibility does not grant an open-source licence.

## Privacy and support

- [Privacy policy](https://magenable.com.au/privacy-policy/)
- [GitHub Issues](https://github.com/magenable/magenable-pdp-health-check/issues)
