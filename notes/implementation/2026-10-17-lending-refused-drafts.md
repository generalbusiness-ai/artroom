# Keep Lending drafts after refusal

Source child `a6cd648c`, promise `a2db9f95`, handles the first of four
nonblocking P3 findings under `6bfce701` / `9253b465`. It starts from Main
`55e1970a5`. Archive review remains priority 1; final composition, gate,
review and landing wait behind the archive candidate.

The renderer previously cleared donation and cancellation inputs after
both a recorded act and a refusal. It also cleared a cancellation reason
after unrelated recorded acts, including publication. A person could lose
the text needed to correct a refusal, or a draft they had not submitted.

The renderer now clears only fields consumed by a recorded act: donation
name and description after donation, or the reason after cancellation.
Refused and unknown outcomes preserve drafts. Publication, borrowing and
returning consume neither form. Native authority, staff controls, request
custody and epoch fencing are unchanged.

## Focused evidence

The browser flow is: the shelf loads, the person types a donation or
cancellation, a scripted gateway returns a refusal, and the real renderer
keeps those values available for correction. The same witness exercises
recorded donation and cancellation, an unrelated recorded publication,
and an unknown outcome.

The Browser plugin is not available. The check uses existing pinned
Playwright 1.63.0 and local Chrome against a loopback fixture, at 1280 by
900 and 390 by 844. The actual main renderer, model, shelf and CSS run.
Gateway, membership, remembered storage and publication ports are explicit
stand-ins. This proves the rendered boundary, not native authority,
custody, signatures, IndexedDB, a service or a hosted publication.

The first fixture attempt (`49459`, exit 1) timed out before the shelf.
Its import matcher used the `/tmp` spelling while esbuild canonicalized
the entry to `/private/tmp`. It is not defect evidence. The fixture now
uses the canonical path and asserts that all four intended ports were
replaced before opening a browser.

The unchanged source then reproduced six assertion failures among twelve
checks (`19916`, exit 1): refused donation and cancellation lost text,
and recorded publication lost an unrelated cancellation reason, in both
viewports. The repair passed all twelve checks (`98216`, exit 0). Page
identity and meaningful content, absence of an error overlay, empty
relevant warning/error logs and interaction results were checked.
Desktop and mobile screenshots were inspected, including the empty
original donation fields and retained repaired donation/reason values.

Browser typechecking and the existing model/custody focus passed
(`84451`, exit 0): nine tests in two files. The existing-lock offline
install (`44183`) exited zero without manifest or lock changes. The owned
asset generator ran; all three disk assets and the Worker module
reproduce exactly. Only the generated JavaScript and Worker module differ.

Original records are retained outside the checkout:

- `/tmp/artroom-lending-refused-drafts-original-browser.log`
- `/tmp/artroom-lending-refused-drafts-matched-original-browser.log`
- `/tmp/artroom-lending-refused-drafts-repaired-browser.log`
- `/tmp/artroom-lending-refused-drafts-matched-original/report.json`
- `/tmp/artroom-lending-refused-drafts-repaired/report.json`
- `/tmp/artroom-lending-refused-drafts-model-custody-focus.log`
- `/tmp/artroom-lending-refused-drafts-types.log`

These references grant no external-file or execution access. A later
Source review will receive its own finite, exact evidence grant. No full
gate or Source approval has occurred for this slice. The other three P3
findings remain owed. All six hosted outputs remain untouched; no provider
operation, deployment or publication ran.
