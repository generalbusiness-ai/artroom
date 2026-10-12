# External Jam wordmark evidence

This note records the external Jam Source and existing evidence for full request
`06c863772e921b9ee724f89d20d2e192f8bee80e`. Evidence child
`013ca270fc0b480528254a6ae168037647febd80`, promised in
`d8f0e154861f04d8273ec74c0d3c71efdaf26462`, owes no Git artifact landing.
The Core branch contains only this note. Independent Source review remains pending.

## Exact external Source

Jam is a separate repository at `/Users/hughpyle/play/artroom-jam`. Its main
worktree is `/Users/hughpyle/play/artroom-jam-worktrees/main`, on `main` at
`7d763a9d62666a83e490adea900ea465f1b60206`. The candidate worktree is
`/Users/hughpyle/play/artroom-jam-worktrees/jam-wordmark-home`.

| Measurement | Full Git object ID |
|---|---|
| Base | `7d763a9d62666a83e490adea900ea465f1b60206` |
| Candidate | `b4b7c764199e5b9758771e43f8132c618858bf32` |
| Candidate tree | `6f4e999396d719205c1834de24602dac69925959` |
| Source used by the existing checks | `fdea16a58e921ad959fc41c0a7fabb70fd279a81` |
| Checked Source tree | `77f8028ac779a39bccafba1126509c2403ba9303` |

The candidate adds only `notes/2026-10-12-wordmark-home-delivery.md` after the
checked Source. Its application, test, and README bytes equal those checked.
Against the base, the candidate changes exactly the four paths below.
The base has 96 tracked leaves. The candidate has 97: three changed existing
leaves, one added note, and 93 unchanged leaves.

| Path | Base bytes | Base SHA-256 | Candidate bytes | Candidate SHA-256 |
|---|---:|---|---:|---|
| `README.md` | 1422 | `d1dc87aba290c0c0e14dc0035b3106c17e163fc3ddbe82efb6622e6673a06c48` | 2414 | `049286a59f33fcaed36edb7e1bade3fc62306d9922937ecaccae3216f05f36ae` |
| `notes/2026-10-12-wordmark-home-delivery.md` | absent | absent | 2069 | `2c5fd91401f3ed73038a44baf9becd0f18d476a9b5f58d1352828e3e4e2e18cd` |
| `page/index.html` | 8232 | `ae1ebf5c7402f72fb5ccc5e2e408f1eaec5e198b05f50556c6adb5cd3c0ae777` | 8291 | `ba8a98398d500f2e8912b1f0e562c3712c6f2d7b4b305c334b274b8b22c25c39` |
| `test/original-demo.test.ts` | 2143 | `4b4bfa5b5b0abff81e29a52fdb26e86db3ab5b40f6f449f5c9a34eca9a0d5ca4` | 2417 | `4085fcf09ab5363c955b2fe3a377c4bbbb87219258d8346ebf2268e0e6fdb3e3` |

`git diff --name-status <base> <candidate>` reproduces the changed-path set.
`git ls-tree -r --name-only <head>` reproduces each leaf count.
`git show <head>:<path> | shasum -a 256` reproduces a file hash.
Each command uses the separate Jam repository and the full IDs above.

The authored HTML wraps both supplied theme wordmarks in one homepage anchor.
Its destination is `https://dap.generalbusiness.ai/`, with accessible name
`dap homepage`. The README opening is the exact adopted paragraph from Core
documentation commit `52180d6448b6f1d919935052f2341f7a678c157f`.
Existing README content remains. Musical Source and dependency files are unchanged.

## Existing checks and their limits

The closed proof is
`/Users/hughpyle/play/artroom-diagnostics/wordmark-home-source/final-closed-result.json`,
SHA-256 `58b22d95be00f775f729fb7890ce28bf4563f4a38b5a43c806d067a40f3d8ff6`.
It records the checked Jam head above alongside separate Page and Counter
evidence. This note does not transfer those applications' results to Jam.
The proof was read in full. Its 21 artifact references and seven capture
references match their recorded hashes.

The retained owning log is
`wordmark-home-source/focused-one/jam-symbolic-case.private.log` under the same
diagnostics directory. It records one selected test passing, with zero failures:
`live/clip demo defaults use the exact application-owned symbolic fixtures and a newly authored onset pattern`.
This is a symbolic and authored-HTML witness. It does not play or render music.
The original packet preserves the selection and its restriction; its earlier
UNRUN build and browser statuses remain historical statements.

`assets-one/jam/public-result.json` records the normal managed asset recipe
at the checked head. The recipe rebuilt authored HTML and the app bundle with
the pinned bundler. The app bundle and all non-HTML managed bytes match their
inherited bytes. The rebuilt app bundle is 48,745 bytes, SHA-256
`8637e95407834c75c47dbd0052471261674824b5e9e3dfb9cfbf2da941dd45e2`.
These are retained build results, not a new build in this note's preparation.

`browser-output-layout-repair-one/public-result.json` records two Jam cases:
desktop light at 1280 by 900, and mobile dark at 390 by 900.
Actual Chromium found one visible anchor in each case, loaded themed artwork,
keyboard focus, and an intercepted click to the exact homepage URL.
Both rows record zero mutation attempts, audio calls, speech calls, errors,
and console entries. No musical control was pressed.

The closed proof preserves the original missing-brand-route startup failure
and the earlier mobile harness failure after two Page rows. Those failures
remain failures. They are not successful Jam rows. The subsequent two Jam
rows had been unrun before that completion.

Jam has no gate command or testing document. Its full `npm test` includes
unrelated waveform tests and remains unrun for this change. These checks do
not prove listening, audio quality, native room participation, a deployed Jam
page, or deployed homepage acceptance. The homepage navigation was intercepted.
No test, build, browser, or gate was run while this Core note was prepared.
Core application Source, tests, generated assets, and dependencies are unchanged.

## Review and delivery boundaries

Jam's `AGENTS.md` requires separation from Core. It says that tracking and
review in an Artroom room wait until Artroom can host the repository.
Jam currently has no Core workroom configuration. This evidence review does
not establish native Jam governance or satisfy that hosting condition.
The current user-authorized external Source obligation remains explicit.
No foreign code, Git objects, signing keys, or configuration are imported into Core.

The Core artifact's `body.path` names this note and `body.commit` names its
Core commit. A checker can review that immutable note and the named foreign
Source as evidence with `gs review --evidence-only`. The guarded verdict's
head remains the Core note commit. Its binding is `evidence-only` and confers
no Core or Jam landing authority. It cannot be used with `gs land` or `gs merge`.

The authorized Jam main operation remains ordinary Git, after the Source
review. Its factual receipt must record the actual repository, target ref,
pre-head, candidate, post-head, tree, command outcomes, and remote readback.
That receipt can become Core report evidence. It is not a Gitseq merge receipt.
No Jam merge, push, or managed deployment is asserted by this note.

An artifact under the no-Git child does not complete that child. An explicit
report and requester ratification remain separate acts. This note neither
closes full request `06c863772e921b9ee724f89d20d2e192f8bee80e` nor discharges
the separate Jam landing, hosted deployment, and served-readback obligations.
