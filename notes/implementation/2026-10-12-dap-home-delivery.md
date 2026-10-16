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

## Gate and serving metadata

The one ordinary gate passed at `88140e32e5516d2de8995984fe36bc3ee7492002`: 1,038 Vitest tests passed, two skipped, and both Node commands passed nine and 55 tests. It took 172.28 seconds elapsed and 232.98 seconds of CPU on the local macOS host with existing dependencies. No install ran. Concurrent load was not sampled. Evidence: `dap-home-gate-source/gate-one/public-result.json`, SHA-256 `af4cc1950f149f2183bac0e7c0c365bd06ac5ed1dfcadf82b40521bc9af42167`.

The metadata correction is Source `be15652a696f35a02775c51ab9eb1da1f1056317`. Its existing built-output test passed once, and the normal build exited 0. All 11 public assets retain their prior bytes. The build adds the serving metadata `_headers` with `Cache-Control: public, max-age=0, must-revalidate, no-transform`. The `packages`, `scripts`, and `examples` trees equal the gated head. That gate is reused; the affected producer check and actual edge reads validate the new metadata boundary. Evidence: `dap-home-deploy-source/no-transform-owning-one/public-result.json`, SHA-256 `578673f314e76ba73fdd0d69c6694c71cdabda79611c4fd00d3850b0a8d5d75a`.

[Cloudflare's Web Analytics FAQ](https://developers.cloudflare.com/web-analytics/faq/) confirms that `public, no-transform` prevents automatic beacon insertion. Its [static asset headers reference](https://developers.cloudflare.com/workers/static-assets/headers/) describes `_headers` as serving metadata. No global analytics setting or zone setting changed.

## Hosted result and preserved failures

The primary upload exited 0 and published `83a0a73f-ce9e-4e6b-843a-d35f296a1972`. Its first hosted fetch failed before a response. The original wrapper failure and zero asset rows remain preserved. Read-only diagnosis found the owned custom-domain binding and authoritative DNS records. Exact-host TLS through an authoritative address passed. The local recursive resolver still returned `ENOTFOUND`. The original fetch's cause was not retained, so the diagnosis does not retrospectively prove its exact cause.

The next bounded read reached HTTP 200 with the correct title and anchors, but Cloudflare inserted 367 analytics bytes into the home page. The byte mismatch remains a failed observation. That finding led to the `_headers` correction.

One corrected upload exited 0 and published `770aa9ee-ff4a-4a2c-a8f8-58825022963a`. Its guard rejected the two intended runtime fields, `assets.raw_headers` and `assets.headers`. This failure and its zero asset rows remain preserved. A retained-only qualification proves that the raw header text equals its 69-byte Source and the parsed version-2 rule sets only the approved Cache-Control value. All other runtime fields, bindings, and stable script fields are unchanged.

Fresh read-only metadata confirms version `770aa9ee-ff4a-4a2c-a8f8-58825022963a` at 100% and `dap.generalbusiness.ai` bound to `dap-home` in the approved zone. One read-only completion verifies all 11 public assets against the build. Every response is HTTP 200 with exact bytes, expected MIME, and the four approved cache directives. All four titles and complete anchor ledgers match:

| Route | Bytes | Title |
| --- | ---: | --- |
| `/` | 2,077 | dap |
| `/room/` | 1,264 | dap - room |
| `/counter/` | 1,320 | dap - counter |
| `/jam/` | 2,128 | dap - jam |

The served anchors preserve the homepage, GitHub repository, documentation, and application targets in the request. Application origins are unchanged. Those links were inspected, not visited. The reads use fresh authoritative DNS addresses with the exact domain Host header and SNI, trusted certificates, and hostname verification. No resolver or cache changed, and no TLS check was bypassed. Normal local recursive DNS recovery is not claimed.

The deployment and diagnosis evidence remains private where it contains raw responses. Closed public records are under `/Users/hughpyle/play/artroom-diagnostics/dap-home-deploy-source/`:

- `deploy-primary-one/public-result.json`: primary upload succeeded, original fetch failed, SHA-256 `de4d2c36fb1d61a5daac98d33da0c8756a52f8e63b2f1a3dffd691fba7e99078`.
- `context-retained-public-result.json`: account and zone match; retained projection corrects the original dot-bearing permission-name filter failure, SHA-256 `20a5d9ad1d088bf940068900c0eba14f43c2042025335a3ce804d99902192d77`.
- `domain-diagnosis-one/public-result.json`: authoritative DNS and trusted TLS pass; local resolver fails; DNS-record metadata access is refused with 403/code 10000, SHA-256 `56778dca303881a769293f9cbed5b4f6e0e52bd6e3832d28282631d31cf4037a`.
- `unrun11-one/public-result.json`: original 367-byte analytics mismatch, SHA-256 `ca6c5c108f3f11ce308771052fed228d936153621fd91a8febbd9f4f874501dc`.
- `deploy-corrected-one/public-result.json`: corrected upload succeeded; original metadata guard failed, SHA-256 `b80096ea39b3b2a16866b906f994d461011e9d8fc84106d4779f480cdef8d1a4`.
- `retained-header-qualification-public.json`: exact two-field metadata qualification, SHA-256 `1440aadf60d148a20a221d26489ce32d5c361fc57bea8823ff720cfb453efe96`.
- `header-qualified-read-one/public-result.json`: all 11 bytes and four anchor ledgers pass, SHA-256 `5ea756a1a05a48f777c07fb37d386a0c80b2ca4109aa3706b9236c1d871617ab`.

## Remaining work

Checker review and normal landing remain owed under this request. This successor changes only the delivery note. No test, browser matrix, gate, deployment, or native application action repeats.
