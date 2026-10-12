# Publish the approved dap homepages

Request `06fc74f79637a14070d6ba0409faaf3be0a6d6ab`, promise
`89395c9dac2bd7631dc147383daee0de8eb6d463`.

The four static pages preserve the approved `v2-preview` copy, layout, and
styles. Only the preview script and sketch note are removed. Home links to
Room, Counter, Jam, and Documentation. The child pages retain their exact
application links and have no header tabs. Titles and wordmark links match
the request. The build copies the repository's SVG and OpenRunde masters;
no second committed master set exists.

The `dap-home` Wrangler configuration serves the built assets. It declares
`dap.generalbusiness.ai` as a custom domain in the specified zone. The
short deployment section is in `docs/deploy.md`.

## Completed local checks

The owning Node test and normal build each ran once and exited 0 at Source
head `b59b99bfdd82f8afddaa52e5f9f1e6d34ef64c4e`. No packages were installed.
The test checks exact page copy, titles, ordered links, child headers,
shared supporting styles, and master bytes. A read-only census after the
build confirms that all 11 generated assets equal their Source or master.

One local static browser run covers all four routes at 1440, 390, and 320
pixels. All 12 views pass the title, link, font, and header checks. No
horizontal overflow, console warnings or errors, page errors, failed
assets, or external requests were observed. Browser plugin tools were
unavailable in this session, so the run used the previously pinned cached
Playwright and Chromium. External application links were inspected but
never opened. No application, provider, audio, or credential actions ran.

Root directly viewed all 12 approved previews and all 12 actual captures.
The recorded comparison covers copy, layout, typography, palette, geometry,
and spacing. The preview-note removal changes full-page height. The
approved Room capture at 320 pixels has a hovered button underline; the
actual capture is unhovered. No product Source difference was found.

The retained public evidence is under
`/Users/hughpyle/play/artroom-diagnostics/`:

- `dap-home-focused-one/public-result.json`, SHA-256
  `78c8483a51f2188769a47915ebe9e4d38eb94990babc4413e5cf75a8b0d46a0d`.
- `dap-home-source/built-assets-after-root.json`, SHA-256
  `d0f2e18c82b2bf95973ff7de1290d0aec57707f05ed17f51da189fd3a6559cd9`.
- `dap-home-source/browser-one/public-result.json`, SHA-256
  `954e78e04905f68251a20187d73ec19b7ecd4d30f1ba973598be464fda26ce93`.
- `dap-home-source/root-fidelity.json`, SHA-256
  `a8d39a574299245853d032502da3b87f64520df8229fc250ac9adf24b7d99160`.

## Remaining work

The gate and deployment are unrun. Hosted version identity, served-byte
comparison, the served anchor ledger, and checker review remain owed.
These local checks do not complete the full request. This successor adds
only this note; executable Source and built assets remain unchanged.
