# Counter voice recovery before an audio start

Source request: `5976b141b6196546c02d38f1906430e8b8fce074`.
Builder promise: `eabacd9b959160ae682d08323a9c31aafb7da731`.
This child request rests on the original Counter request
`c612acc60c1b02577c7814b8026ad6d398f54023`.

The voice controller reserved a pledge before acquiring its custody lock.
If freshness was lost before the lock was granted, the controller returned
without saving an audio marker. The active pointer and played-turn reservation
then prevented the same fresh pledge from starting.

The controller now releases that reservation only after locked reads establish
empty report and audio-start slots, before any marker write begins. A fresh
eligible observation that arrives while the operation is busy is checked again
after the operation releases busy. Existing identity, authorization, expiry,
capacity, durable-custody, and replay checks still govern the next start.
Occupied custody blocks the operation. A marker write or playback that fails or
becomes uncertain retains its existing block and cannot use this release path.

The existing fake lock, store, and speech fixture now gates the next audio lock.
The new case loses freshness, grants the lock while stale, and publishes the
same fresh pledge while the operation is still busy. The case checks zero stale
effects, then one marker save and exact readback before one playback. Duplicate
fresh observations cannot replay that playback. No audio-completion callback or
native report is supplied by this witness.

The owning browser compiler passed. The whole controller file passed all
27 cases once. A control selected only the new case against the original
production controller from main `e0bf51f381bca0ccbc06ac191f4e5e0d71ecb971`.
The control failed by the expected assertion, and the patched bytes were
restored exactly. The earlier external diagnostic case also failed on unchanged
main, with marker saves expected 1 and actual 0. Its bounded proof is
`0fbd8c882a349c1648c9b6f24aac0e6dba710710337d8a7b8ddcf526fc914c14`.
Those diagnostic results belong to the separate `93ef` and `20c5` diagnosis.

The normal `node examples/counting/scripts/assets.mjs` build passed once.
It generated `counting.js` at 131834 bytes, SHA-256
`5b6e432ff9a4cba360f0551a75f0afffb0e2bc3c7518ba96957050860fa22ba8`,
and the matching Worker asset module. The HTML and CSS bytes are unchanged.

At the first Source freeze, the ordinary gate and independent review remained owed.
The scripted witness proves the controller boundary. It does not establish
browser audibility, deployed Counter completion, or the cause of the observed
live page closure. No browser, native act, deployment, or provider operation was
run for this Source correction.


The ordinary `npm run gate` then passed at
`e3c9333ea38e1664baab835c1f714d0126118b93`, tree
`1fa86b396a257201557aec2249d8c18e1d6d4de4`.
Whitespace, type checks, and tests all exited 0. Installation was skipped by
the existing lock stamp. Vitest reported 1025 passes and two existing optional
skips out of 1027 tests. The repository Node checks passed eight tests, and the
browser Node checks passed 38. All 1320 tracked file hashes remained unchanged.
The outer command took 102.73 seconds of wall time and 164.14 seconds of CPU.

This final amendment changes only this note. The tested code and generated
assets are unchanged. Independent Source review, normal landing, deployment,
and real Counter acceptance remain separate obligations.
