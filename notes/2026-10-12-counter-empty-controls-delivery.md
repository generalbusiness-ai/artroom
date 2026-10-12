# Counter hides device-only controls before identity

Request `7832b5c2f71c77ab41e842de83fca5f6034568c3`, promise `4e76e9c52a6f99715d0554798ea8036249126af3`, removes misleading controls from the Counter before a device has an identity. The Record and definition details and Forget this device button are hidden while `p.identity` is absent. Both appear with identity and hide again when identity is cleared. Forget still requires its existing handler.

The branch starts at main `565a39159bf0f0a138014689cec0363e618c2418` without the separate wordmark change. Production changes only the two visibility conditions in `examples/counting/browser/view.ts`. One existing view case now checks absent, present, and cleared identity against the real view and fake DOM, with a forget handler present. Existing acknowledgement assertions remain.

The repository's `examples/counting/scripts/test-browser.mjs` passed all 55 owning cases once through pinned esbuild and Node. The normal Counter asset generator passed once and changed only `browser-build/counting.js` and the generated Worker asset module. HTML, CSS, package files, and the lock remain unchanged. No packages were installed.

Focused evidence: `/Users/hughpyle/play/artroom-diagnostics/counter-empty-controls-source/focused-one/public-result.json`, SHA-256 `13ec6080cf74c1e2da08c3021a7e9c83de35e8c8d1ec48635885d8a48fb0d4cd`. The source diff, actual private logs, compiled witness closure, and dependency proof are retained beside it. These tests use fake DOM, scripted transport, and fake speech. They prove no real browser, deployed native action, or audio.

The ordinary gate is unrun pending full source review. Exact-head checker review, normal main landing, deployment from the landed source to the counting host, and served-page readback remain owed.
