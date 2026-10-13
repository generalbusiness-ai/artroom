# Existing hosts serve the renamed main snapshot

Request `a4ef664d96f11dcf44dc4a3a75fc5442378a8bf4`, promise
`17ed8d818d115147464a96c638c768d8b882b32d`, refreshes the four existing
hosts from published main. Each host received one deployment from the clean,
isolated snapshot `562357458b0b3f44873efc6c21429194b60a00f7`, tree
`440287ca7467999a2c64f9d27fe931d9bcfc38d7`. The original processes completed
with exit 0; their final Source guards passed.

| Host | Deployed version | Traffic | Matched anonymous reads |
|---|---|---|---|
| `dap-home` | `a2e03804-4234-49aa-b213-1882f617a01b` | 100% | 10 of 10 |
| `artroom-scope` | `00578142-cfce-4689-bb3c-b7f1a37fbf16` | 100% | 22 of 22 |
| `artroom-rehearsal` | `562f9bfa-cca3-47c1-920b-6c88776ce438` | 100% | 22 of 22 |
| `artroom-counting` | `d1b40dcc-5912-4403-9d1e-0ae73f050cbe` | 100% | 22 of 22 |

The Home process ran the normal `homepage/build.mjs` once before its upload.
Its actual builder copies 12 files, including the 352-byte symbol as
`brand/favicon.svg`; the dist SVG and ICO are not inputs to this snapshot's
builder. Ten canonical HTTPS reads matched their bytes, MIME types, cache
policy, and expected HTML titles and links. The existing `dap.generalbusiness.ai`
custom domain and Worker resources were preserved.

Each scope Worker upload preserved the complete observed binding, runtime,
stable-script, and other-resource fingerprints. Core kept nine bindings and
namespace `e38e359db8d14ba5909910e08e16e6eb`; Rehearsal kept eight and
`23afaac62d62446398a8a9411b2dd195`; Counter kept six and
`baba17560b7f488da9f7eb5917a7d36d`. Every namespace still uses `DeployedScope`.
The 22 reads on each host matched the Page, Counter, and brand bytes, MIME
types, Content Security Policy, cache policy, `nosniff`, and referrer policy.
Counter serves its own Worker bundle. Refreshing Core alone would not have
refreshed Counter.

## Approval and deployed Source are distinct

Assigned approval `f1c13392213ec0df5fc4fcadc33348373a2c7c94` covers exact
rename candidate `81a475a519688c370d075d87b4d42b650271a2b5`, tree
`b082cbf59f0d305fa82ab84fb2357caa26d0e1eb`. Requester ratification is
`9b3b7e2a4e13129c8dfc772308e374aecde905c9`; native landing receipt
`5d223c976a69430b7976ab71f66c97ffc6491cf2` records main
`b5d153498879a8e3efc13c87404b9778654e235b` with that exact tree.

The deployed snapshot is the later `56235745` commit. Only three notes differ
from the landed rename: the practice script, SDK publication delivery, and
07:00 sprint report. Executable Source, generated assets, and dependencies
remain the approved rename's bytes. The Scope, Rehearsal, and Counter helper
proofs incorrectly label their snapshot fields `reviewedHead` and
`reviewedTree`. Those fields identify the uploaded snapshot, not a separate
whole-tree approval of `56235745`. The original proofs are retained unchanged;
the exact approval above and the note-only correspondence supply that
qualification. Home's `reviewedHead` correctly identifies `81a475a5`.

The rename's original gate, handle 92820, remains failed with exit 1 and five
transcript failures. Separate bounded completion, handle 4330, passed those
five repaired cases and the originally unrun Node and Counter phases. The
assigned reviewer accepted exact `81a475a5` with this qualification. No single
green gate is synthesized, and no whole gate or suite was repeated for these
note-only descendants or the host refresh.

## Original stops remain recorded

The first Core command stopped at its initial dependency guard with exit 1,
before provider calls or output creation. Its expected dependency view had
wrongly rebased 3,858 external recovery paths into a nonexistent directory
under the snapshot. The corrected view preserves all 3,882 identity hashes,
24 snapshot-local paths, and 12 workspace links. A read-only audit matched
the already materialized closure; materialization was not repeated.

A second Core command stopped with exit 1 because its supplied plan hash was
wrong, also before provider dispatch. Both original stops remain failures of
preconditions. Neither was a deployment failure or a second upload. The later
successful Core process performed the sole Core upload.

## Closed evidence

Root confirmed the original terminal outcomes: Home handle 4693, Core 22167,
Rehearsal 93992, and Counter 23133 all exited 0. Each closed proof retains its
original phase results, deployed version, complete static read vector, and
final guard. Private logs are retained separately and were not read for this
note.

| Closed proof beneath `/Users/hughpyle/play/artroom-diagnostics/` | SHA-256 |
|---|---|
| `existing-host-refresh-562-held/home/output-one/public-result.json` | `78ba30a6e28471f0f94dd35caf65afeed6c89ba628e86d7dc05c65e7a6b4ef7c` |
| `existing-host-refresh-562-held/scope/scope/upload-one/public-result.json` | `182a2d10d588fb10ed6d063e55b2d55b23f82b747a080149be697e605c4ccf80` |
| `existing-host-refresh-562-held/scope/rehearsal/upload-one/public-result.json` | `a68c3c0def89e9b30d598d71ac4915d31ea7318c21f6392194fc35d8c4027075` |
| `counter-normal-refresh-562-held/counting/upload-one/public-result.json` | `78ba5d844d1286d345dab3fd970a6f95ae80c04db059c8efdb04d9b537cf219a` |

These deliveries bind the guarded Source and original upload to actual
provider versions and static readback. Identical older served bytes alone
would not establish the Source commit. No secret values were published;
there were no secret updates, new resources, register repins, native acts,
Start configuration, browser runs, or new human acceptance. Static Home Jam
marketing content was copied by the normal builder, but no Jam application,
provider, or audio action ran.
