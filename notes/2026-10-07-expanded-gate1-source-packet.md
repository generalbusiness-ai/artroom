# Expanded Gate 1 source review packet

Requests: `225da894` (whole Gate 1; producer `f8a56f1c`), `4d8d543f`
(live operations; producer `3be19128`) and `97821ea7` (own-host adapter).
Branch: `request/i5-live-ops-intake`.

This packet inventories the combined candidate for independent source review.
It is no source approval, implementation acceptance, receipt or landing.
The owner still needs a legitimate binding between the implementation and
what its receipt would complete. Full I3, native lane hold and change
publication, profiles, capacity and browser obligations remain open.

## Exact comparison and gate correspondence

| Boundary | Commit or tree |
|---|---|
| Published main comparison base | `e5c641bd2952d7bb09bb7c81d27e4af722779d19` |
| Main tree | `3ce496a4946911665c558cf6680966f741e41577` |
| Inventory snapshot head | `3c5b117918206f20047111916399a58b6894101c` |
| Inventory snapshot tree | `418d0a9da2eb694426ad3b9d015612ca48074821` |
| Gated source commit | `6621284d7f55c275f33dba10f49e4da0ccc9398e` |
| Gated source tree | `a0b0f91c4377c4d9ff4fa5c43cdcc59a34d49030` |
| Packages tree, both gated source and snapshot | `d485f8afd69fa939f75ce30f3c2f5a5e3176e6e3` |
| Scripts tree, both gated source and snapshot | `c7ffb21b9435e2a7985a2bd0492c72dce1047787` |
| Lockfile blob, both gated source and snapshot | `7e6e3a01844fe2d01718f26d17701619056b97e1` |
| Root Vitest configuration blob, both | `a4b4334eaa0cb1e01519a06ee9b558873e1e3694` |
| Previously reviewed GitHub component | `a4e3dbd19af4d77a8999dd1373d33cd4851a7842` |
| Previously reviewed component tree | `50203f58b3ee41224fd9fdb444bbaf43531863a1` |

The only gated-source-to-snapshot change is the added
`notes/2026-10-07-expanded-gate1-delivery.md`. Source and tests are unchanged.
The complete native snapshot comparison has **122 changed tracked paths**.
This packet, and any later delivery/live-witness edits, are outside that
snapshot and must be named by the filing's exact candidate head. At packet
preparation the pending notes are the modified expanded delivery note, the
new expanded live witness, and this new source packet. A final
filing must compare its source trees with the gated trees above; these
hashes do not predict a future complete candidate tree.

Reproduce the complete binary native comparison with:

```sh
git diff --binary e5c641bd2952d7bb09bb7c81d27e4af722779d19 3c5b117918206f20047111916399a58b6894101c
```

The bytes of that command's output, calculated in memory for this packet,
are 1164925 bytes, SHA-256
`e1f6754992e68cc6bd6d423fa17b85fa2e3027989e936b8d7dd8b63fa63a0a7c`.
No patch artifact was filed by this packet preparer. The inventory uses
tracked commit objects; it does not include secrets, caches or node_modules.
For a deletion, the table gives the old blob and marks the candidate absent.

## Source ownership and read boundaries

- The original GitHub component, including signed reads, CLI claim/bootstrap
  and real lane wiring, is frozen at `a4e3dbd19`. Its earlier gated source
  and complete inventory are in
  `notes/2026-10-07-demo-git-host-source-packet.md`; its implementation and
  component live evidence are in the corresponding delivery and witness notes.
- Cloud live operations are delivered at `31cd35577`, with their own
  attribution in `notes/2026-10-07-i5-live-ops-delivery.md`. Merge
  `03425641f` integrates those changes and the builder's exact claim recovery,
  causal read admission, retained resource hash and verified destination
  session repairs. The claim test exercises the actual Worker routes.
- Cloud own-host source is delivered at `c7955c39`, described in
  `notes/2026-10-07-i5-own-host-delivery.md`. The isolated builder repair
  `a7a52112a` checks namespace, creation identity, plaintext custody, token
  scope and reported expiry. Merge `61bb2e140` integrates it with live
  operations. Shared host wiring also changes the GitHub wiring and provider.
- `ea41b9402` awaits the newly asynchronous stream preparation in its existing
  late-answer witness. `e7039003b` reconciles guide pins and fixture wording.
- Native own-host framing fixture `5c981c6d` and repair `e380dcf5` were
  cherry-picked as `4ab27c65d` and `a8ad70ff1`, without unrelated site code.
  `6621284d7` adds the counted-boundary witness and correct fixture byte count.

The expanded delivery note attributes complete incoming delta reads to the
builder and delegated readers. The previous GitHub packet also attributes
its source and generated-definition inspection. Those are their recorded
read claims. This packet preparer read AGENTS.md, docs/testing.md, the
expanded delivery note, the prior packet and delivery note, the new expanded
live witness, relevant cloud note excerpts, Git metadata, the gate log and
selected focused-log endings.
It calculated the inventory from every changed blob. **It did not perform a
new complete source review, inspect every source body or verify the live
runs.** Hashing a blob is not a review of its meaning. An independent reader
must read the exact expanded source and state unreadable dependencies.

## Previous review and full later delta

Independent review `74f5aee6` covered the complete frozen GitHub component
and reported no additional high-confidence code defect. It requested
changes solely because the prepared component receipt would complete
unfinished expanded request `225da894`. Builder accepted that finding at
`c5264fea`. The P3 guide/fixture evidence finding is fixed by `e7039003b`
on the expanded branch: the stale `4ff0` lane pin is replaced by current
`e182`; Room and wiring headers describe the W5 checker signing boundary;
and the historical real-run-owed paragraph is framed as historical evidence.
The receipt-binding gap is recorded by detail
`3bf72be30a1db15f993f6077f883d7d66e9b1122` and event
`efb6db9950231d60dc9174287f3130c5a1cc7012`. No binding choice has been
made. These finding repairs and recorded details grant no approval.

The later combined delta requires independent review. None of the old
review's read credit applies to these **49 changed paths** from
`a4e3dbd19` to the snapshot. This list includes documents and fixtures as
well as executable source; each current blob is in the complete table below.

```text
M	docs/cli.md
A	docs/deploy.md
A	docs/hosts.md
M	docs/lanes.md
M	docs/scopes.md
A	notes/.keep-i5-own-host
A	notes/2026-10-07-expanded-gate1-delivery.md
A	notes/2026-10-07-i5-live-ops-delivery.md
A	notes/2026-10-07-i5-own-host-delivery.md
M	packages/bytes/src/session.ts
M	packages/cli/src/commands.ts
M	packages/cli/src/line.ts
M	packages/cli/src/store.ts
A	packages/cli/test/claim.scope.test.ts
M	packages/cli/test/story.scope.test.ts
M	packages/client/src/signed-read.ts
M	packages/client/test/signed-read.test.ts
M	packages/contract/src/session.ts
M	packages/git/src/http-read.ts
A	packages/git/test/fixtures/own-host/README.md
A	packages/git/test/fixtures/own-host/info-refs.bin
A	packages/git/test/fixtures/own-host/request-v0.bin
A	packages/git/test/fixtures/own-host/upload-pack.bin
A	packages/git/test/own-host.test.ts
M	packages/lanes/test/support/room.ts
M	packages/lanes/test/wiring.scope.test.ts
M	packages/replay/src/source.ts
M	packages/replay/test/cli.test.ts
A	packages/scope/src/artifacts-host.ts
A	packages/scope/src/artifacts-wiring.ts
M	packages/scope/src/authority.ts
M	packages/scope/src/github-host.ts
M	packages/scope/src/github-wiring.ts
A	packages/scope/src/host-wiring.ts
M	packages/scope/src/object.ts
M	packages/scope/src/operations.ts
M	packages/scope/src/ports.ts
M	packages/scope/src/reads.ts
M	packages/scope/src/sessions.ts
M	packages/scope/src/signed-reads.ts
M	packages/scope/src/worker.ts
A	packages/scope/test/artifacts-host.test.ts
A	packages/scope/test/artifacts-wiring.test.ts
A	packages/scope/test/destination-sessions.test.ts
M	packages/scope/test/github-founding.test.ts
M	packages/scope/test/operations.test.ts
M	packages/scope/test/signed-reads.test.ts
M	packages/scope/test/worker.ts
M	packages/scope/wrangler.jsonc
```

The review should cover exact claim envelope recovery and incarnation
binding; causal root admission and bounded unavailable chains; typed
retained provenance and the client/replay/service hash protocol; whole
register history; destination session authentication before a creator read
and current authority after it; restart progress; own-host guards and
shared wiring; counted pack trailers and narrowly allowed flush framing.
The incoming cloud notes contain older source and test claims. They must
not be treated as evidence that the complete expanded head was reviewed or
deployed.

## Local validation evidence

No tests were run for this packet. The existing final gate log
`/tmp/artroom-expanded-gate1-framing.log` records the exact gated commit and
tree above, zero changed files, all typechecks, **781 tests and six
active-source checks passed**. Raw phase logs are in
`/var/folders/2x/wylr59t17ds36l1l7ng25y7w0000gn/T/tmp.aTqKkzROve`.

Install was skipped against the current lockfile. The log reports whitespace
0.0 seconds, typecheck 3.8 elapsed/11.8 CPU seconds, tests 24.0 elapsed/49.1
CPU seconds. These are phase figures, not observed total command time.
The delivery note reports a shared Mac, Node 26.10.0, Git 2.54.0, warm
focused caches and no sampled load.

| Evidence | Existing log or index | Boundary and result |
|---|---|---|
| Exact claim crash/retry | `/tmp/artroom-live-ops-claim-4d8.log` | Actual Worker claim witness; one focused test passed. |
| Destination sessions/founding | `/tmp/artroom-destination-sessions-focused.log` | Three files, six tests passed. |
| Session preflight control | `/tmp/artroom-destination-session-preflight-control.log` | Invalid/disallowed sessions must cause no directory RPC; assertion distinguished the fault and source was restored. |
| Session creator/incarnation control | `/tmp/artroom-destination-session-peer-control.log` | Incorrect creator answer must not authorize the session; assertion distinguished the fault and source was restored. |
| Signed reads, client/replay and three controls | `/tmp/artroom-live-read-evidence.json` | Index gives source-file SHA-256 values and historical preparation state, not a committed whole-head gate. It names the seven logs below. |
| Integrated own-host boundaries | `/tmp/artroom-own-host-integrated-focused.log` and `/tmp/artroom-own-host-integrated-typecheck.log` | Six files, 20 focused tests passed; separate from the isolated eight own-host tests and six controls reported by the delivery note. |
| Async stream fixture repair | `/tmp/artroom-expanded-gate1-stream-await.log` | Nine focused operation tests passed after awaiting preparation. Original combined failure: `/tmp/artroom-expanded-gate1-61bb2e140.log`. |
| Pack framing | `/tmp/artroom-expanded-framing-focused.log` | Two files, four focused tests passed. |
| Malformed-tail control | `/tmp/artroom-expanded-framing-control.log` | Rejecting malformed tails distinguished the fault by assertion; source was restored. |

The signed-read index names `/tmp/artroom-live-signed-focused.log`,
`/tmp/artroom-live-register-dependency.log`,
`/tmp/artroom-live-read-client-replay.log`,
`/tmp/artroom-live-read-typechecks.log`,
`/tmp/artroom-live-register-control.log`,
`/tmp/artroom-live-carried-control.log` and
`/tmp/artroom-live-entry-admission-control.log`.
Its HEAD field is `a4e3dbd19` with working-source hashes: the note says the
initial eight-test scope pass preceded comment changes and an explicit
unanchored-replay assertion, followed by a passing cofounder rerun. The
three controls reported distinguishes and restored source. The final gate,
rather than this preparation index, binds the final combined source.

The expanded delivery note reports eight isolated own-host tests and six
controls; their raw log paths are not supplied there and were not read by
this packet preparer. The earlier 779-test gate at `ea41b9402` precedes the
framing change and is not evidence for that later code. No repeated gate
or mutation sweep is claimed here.

## Live evidence and receipt binding

Component runs are pinned to their own source: GitHub founding and public
clone from `dfaa5395` (`73507add`); own-host founding and authenticated clone
from integration `714afda4` (`b00cde62`); and the first empty-tree site
response after the framing repair (`60ce7f0f`). None reproduces the exact
combined gated source above. The separately prepared
`notes/2026-10-07-expanded-gate1-live-witness.md` now records an exact
combined-source run at notes-only successor `3c5b117918206f20047111916399a58b6894101c`:
Worker source deployment `a9419198-1212-45dc-9ae9-f2d2b92047be`, an isolated
own-host install/claim, six authenticated replays with exit 0 and consistent
reports, no anchors or missing foreign facts, and a real clone with exit 0.
Its clone HEAD/main is `deb39648e7622493c5e7b80d0213cd443531cdd4`, with
empty tree `4b825dc642cb6eb9a060e54bf8d69288fbee4904`. The packet preparer read
that note; the root builder owns the commands and full replay-log reads.
Durable evidence is indexed by `76b016bc` as reported by the root builder;
final review must bind its complete artifact identifier and exact candidate.
This producer evidence covers founding and bootstrap, not native content
publication or a fresh-person usability signoff. Its operator read token is
a labelled stand-in for the separately commissioned room-token clone flow.

Later clone/site work on the planner's deployed branch is outside this
candidate and needs reconciliation with the new session and retained-resource
hash protocol. The isolated witness preserves that deployment. The filing
must include the exact live-witness note and its deployment/version binding.

The expanded delivery note qualifies unanchored multi-cofounder replay:
whole register history is contiguous, but another directory's private
history is still needed even when its genesis is retained. Explicit fixture
anchors make the fixture replay consistent and do not establish unanchored
live replay. Foreign outcome-origin chains outside the current scope and
O(history) eligibility/carried-input costs remain qualified limits.
Own-host lost creation replies, failed cleanup and name-only identity are
explicit service limits. Tests use the labelled stand-ins stated by their
notes and docs/testing.md; a passing local gate proves no deployment,
provider execution, real runner or complete I3 journey.

Before approval, receipt preparation or landing, bind an exact expanded
successor that satisfies the intended scope, or adopt a separately scoped
GitHub component milestone. Reusing the older component receipt without
that binding does not resolve review `74f5aee6`. The independent review must
name the exact implementation request, receipt consequences, final head and
source trees, and cover the full later delta above. This packet closes no
commission and grants no approval.

## Final documentation reconciliation

Builder corrected current `docs/cli.md` claim guidance to match the gated
implementation: exact saved envelopes and accepted markers, unchanged
deadlines, preserved refused/unavailable steps, checked child references,
legacy retained-record recovery and explicit `--again` replacement. The
cloud live-operations note now labels its narrower claims as historical.
These are documentation-only successors; no executable source changed.
The snapshot table below remains historical; final filing includes these
updated documents and the evidence notes at its exact head.

## Committed evidence and main-plan preservation

Builder committed the delivery update, full live witness and this packet in
`148c32906`, then merged published main at
`840496120d519d280b743d72af7dff396cf1c606`. That merge adds only the unchanged
110-line published-pages plan from `e5c641bd`; it preserves the plan rather
than deleting it. Packages and scripts still exactly match the gated trees.
Compared with the historical inventory snapshot, the only additions are
that plan and the two new evidence notes; the delivery note is updated.
The final review invitation names the final notes-only successor head.

The committed live witness gives raw safe evidence paths and SHA-256 values;
builder read all six reports and the deploy/configuration/install/claim logs
in full. Durable result `76b016bcf9ac18b542f9f45814cc495b9fa0fb55` and binding
request `48ea69f70c696ac0d5ccd47ba7952d42633086fa` remain producer statements,
not source approval. Planner promised the binding decision at `fbec8162`.

## Complete native path inventory

The snapshot table below covers every tracked addition, modification and
deletion versus published main, including documentation, empty markers,
binary fixtures, generated definitions, lockfile and configuration. Each
present row gives its blob, byte count and SHA-256 at `3c5b117918206f20047111916399a58b6894101c`.
The absent published-pages plan is included explicitly. This branch predates
that main-only document; its snapshot absence is not an intentional product
or documentation deletion. The root builder will preserve the current main
plan before final filing. That final comparison must show it present, and
bind the final head and changed-path inventory while confirming unchanged
packages/scripts trees. This packet does not itself merge main or edit the
plan. The packet being written is not part of the earlier snapshot.

| Change | Path | Blob at snapshot (old blob for D) | Bytes | SHA-256 |
|---|---|---|---:|---|
| A | `docs/cli.md` | `885202927c996c41db3226041edbf31b2144f3f2` | 9328 | `46842ef736d0630240e24fda6bf5d890f15d0d6f154131ad5d78aab1f73b61c6` |
| A | `docs/deploy.md` | `ac3ceb14e1c2093dea195bdedf038134f557763a` | 5711 | `a93c258eedb2fbea8ad192b58039b388bd7c2813704da6e33073900a275af151` |
| A | `docs/hosts.md` | `cc726a5122616faf18221de4c1837047466376ac` | 5937 | `502bd37479877ae79fab225ca7797352ef39fa944eb3a22e99c472d4b01c369f` |
| M | `docs/lanes-reference.md` | `84096d6ccadf8abc061a721e367283c67fee42c7` | 35492 | `4874ab32d4d0c46915890a97b736950fb081eeed9c0b7d447c1e57495d65fce8` |
| M | `docs/lanes.md` | `e820acc705959eb596b1c0f103652b2e877f3d84` | 24738 | `46bb6673d4d8b7205d77455308d9f7a141d6ae30e4eb1527e42046c8efa8c1ed` |
| M | `docs/scopes.md` | `3f3aba6de6567909dcbb0ed7fd5e832c5db2c5c1` | 52429 | `3d6262cecbd1626430b3d7fd1da953768c8ee176695660a20bd9c522ce4e0c4c` |
| M | `docs/testing.md` | `117cbb65c84bebedb499a8038545964813340b4c` | 27293 | `3c23a68039294e3fe280bb04b178e2264e4848608cbd1ec97a5bb31a66857589` |
| A | `notes/.keep-i5-client` | `e69de29bb2d1d6434b8b29ae775ad8c2e48c5391` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| A | `notes/.keep-i5-lane-wiring` | `e69de29bb2d1d6434b8b29ae775ad8c2e48c5391` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| A | `notes/.keep-i5-own-host` | `e69de29bb2d1d6434b8b29ae775ad8c2e48c5391` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| A | `notes/2026-10-07-demo-git-host-delivery.md` | `a3d5279e5c6dd52b820a86ac527c3f9a9e27bc44` | 19731 | `1226b642601fce80541ccbbbf919e3b1ddfaf0ce5eaa58fcdfa3c68ab3ffa85e` |
| A | `notes/2026-10-07-demo-git-host-live-witness.md` | `049fac12eb962bfdd5255df796312eb7ef617687` | 4267 | `4e555a2f01d3ac696a059152e2327f3e201624d18ae2325c71152e74191483ca` |
| A | `notes/2026-10-07-demo-git-host-source-packet.md` | `1082f61f72e77c39d9efdc51f0021d5822fe0730` | 17612 | `fd48252b77d5583b2126bf57b7312a52b31c3808d6da787367028533ce7cc3eb` |
| A | `notes/2026-10-07-expanded-gate1-delivery.md` | `3fb42dfbd5750405f6ea482a98ec9fe75993ac76` | 8289 | `2cf8a7e5113d52a1d8b3ece45cde8b1f5ee88ad9234b9e7f25dd76041c95f5a1` |
| A | `notes/2026-10-07-i5-claim-live-delivery.md` | `f7d623211b5fba1e06c943530c1bcb459363a6fe` | 12803 | `5735d88d46e742f386e9734b88cc0db0e857c323f1ed99c718345a0d54b6136a` |
| A | `notes/2026-10-07-i5-client-delivery.md` | `ed18ca8b732b07939def4efffc734ffdcacac07c` | 12591 | `bfd3665f384603a46ed33538bf8540909cd60a62e1abee72c4d1c6226f71d1c5` |
| A | `notes/2026-10-07-i5-lane-wiring-delivery.md` | `815307aeccebbdfd760fda1a3e2ee4cb9817c2f4` | 22820 | `f43d9dfef9d519a839b56174cbaf66848905149568d691d365cbd07f8ee903cf` |
| A | `notes/2026-10-07-i5-live-ops-delivery.md` | `651df74b308ac781985655fc46441c1824b18208` | 16560 | `3c43eff04cce152ffd0677a8ced1983a544ed482ca728507ace6553646d7ef6d` |
| A | `notes/2026-10-07-i5-own-host-delivery.md` | `2092ba817d8e2616cc176caaf15a8b3bbf42ebcc` | 13355 | `0222cb36983ccfc4ee2e9bf87f18f1f9bcf7d6a0451e51f5502946c082e85fad` |
| A | `notes/2026-10-07-i5-signed-read-delivery.md` | `98e60d38b22ab1563b23e688896df74bc89cc2d2` | 13632 | `61ebcc2c7a099c015ee3521fb4016520d1877f07b5eefc9e4182c4239b70efea` |
| M | `package-lock.json` | `7e6e3a01844fe2d01718f26d17701619056b97e1` | 126500 | `bd4d9ed101dff266d71008f8a9ac42257093065ab5079cd399e004e40ae3162d` |
| M | `packages/bytes/src/session.ts` | `ddcbfef1b75c16827b9942550311e3e04873f675` | 2764 | `f597fe0f8f22af880cf3abba800f0e23b36870f424c081da6765c3473a2f9ae1` |
| A | `packages/cli/README.md` | `ca5d26320773d8b53da7dfcb12b4a04f2fce66ab` | 1203 | `f9ff4809a86a31578594f0f68d703a0975e00a1a95fe62ae2ba420d531de5ce8` |
| A | `packages/cli/bin/artroom.js` | `cf039327a8f464774bdf5bd46c31798d49fb4124` | 703 | `600d405b47f9f9f4ecc29c639273e98cb749d225e721e434fa0035279dc7c9a7` |
| A | `packages/cli/package.json` | `431b0e6b575c75bf20f6942aa2d7cec965d6fc4f` | 1212 | `52c9cfb9ba298351a3de70bdd8375e24b340f52b6ee7cdfad3d497f66fad15cd` |
| A | `packages/cli/src/commands.ts` | `81b4b65834f1144d641e4d3ed3fb6410c9b8b6d8` | 46703 | `fd7ee62d66730f29913e693341e7a01e61932af329cbaef74e5dcb0079e6dafa` |
| A | `packages/cli/src/files.ts` | `5cc3da703d12b79151f8c1cd98d3006dd7b2048a` | 3240 | `f2717f07449a50ab5d920d0e7e41bebeb74dfb2aebfc237eb5b7bb18b546080a` |
| A | `packages/cli/src/index.ts` | `64af9ee9c87d3047f61a782e1d181a5a394bd930` | 215 | `f329cbabe54877ea927a2d0e892ddf10140d50924b5980d6d1361bad6f0251fb` |
| A | `packages/cli/src/line.ts` | `e85709e367b2c72385911c6e1d780d944c451127` | 4108 | `0d8f7e441580f666f15756be5c8459de2198c264abe4cd37f5802a3984ad4d29` |
| A | `packages/cli/src/main.ts` | `a356b88ac85e52741a7056a4bfe22022dda09e22` | 685 | `8af6aac09ed25bce777958d41cee0ea7d670796d3b781d164c71234b2687c171` |
| A | `packages/cli/src/store.ts` | `518264b723e7c17f03785c811ffe50c712bfe4a7` | 3012 | `def0c3e72792713f27c0d4fa799d8b4d43a9baa139ec9aacc56f448bb0be9ea7` |
| A | `packages/cli/test/claim.scope.test.ts` | `591ddc94daa73e4d458826f63096efd93616150d` | 14953 | `3e70235a8b173371eece193cbf74bf1f9610babf46a3fe707c1dd8c4742c1c6d` |
| A | `packages/cli/test/files.test.ts` | `30354f63cf6d04a7ccedfa324b6dc835b0ac0825` | 6053 | `c70544f56b095a3f8e08ea34cb8e00aff04b5093c54e1c1bc511c6d9e471c516` |
| A | `packages/cli/test/story.scope.test.ts` | `13efa7d1de9e5ea9da847d5a4587a2c3d74592b7` | 14661 | `2f5793c5c3a3b4a6727785ec12fd8745b6e35e2903482625cae78d7168e0f852` |
| A | `packages/cli/tsconfig.json` | `986e302b5c88f0a0d3923514657b50b17e77dec8` | 272 | `864383214964cfc55e8d19d1ffd7f64b35f813cb417061b24e58fd9b0743e3dc` |
| A | `packages/cli/tsconfig.scope.json` | `6ad9c104155cf3c909718cddbe9e927aad6f0f07` | 515 | `6038ad1228eda947afce2779896a13335e32e93c8b78ef2d073d263e26ff71ad` |
| A | `packages/cli/tsconfig.test.json` | `9251db70b2634b9121b8a236fbfebff8a6adb220` | 127 | `ba4a0563118ca2ebc1eaaab34a0ff3574b06e4ebf508ed6d848c309ca73aab72` |
| A | `packages/cli/vitest.config.ts` | `2cc9fbdb0127b3dcefc2f794d5d764d717ee5f1f` | 395 | `5291165a9e5d07978c8ce065a5df83890a9480b7e3615f88cc82550eeaecd8d7` |
| M | `packages/client/src/index.ts` | `77ad6b4dd4ee445eb47b0d630ca333732b804a70` | 240 | `ef5184339d3b508814903c477706c96edeebdcad42a5bfc82ed3cab40101cddd` |
| A | `packages/client/src/signed-read.ts` | `ef9a68e66c42a7b99630f2c002a0feed8339bd61` | 6460 | `1aa6fe35dafe5c53c1ca4f3ba31f1c9540a3b04dcd0640b7857842c3f5dd2a9a` |
| A | `packages/client/test/signed-read.test.ts` | `30b7cc7c99522929759faa6ef47c967764305233` | 5865 | `4b8074f4a12051ad1d3ff59da8a5777cd9e6b7ae57589046c45c9c9835fa1782` |
| M | `packages/contract/src/session.ts` | `7b8c1125d3a8cffa86fbdf4cdd34f95873f0d34a` | 5316 | `10b42a87c4d0aab9ee06990fbe0d76dcf2e280b7be3f637f0adda352d15ff4cb` |
| M | `packages/git/package.json` | `204de74e09ee71d00121d4b32721b5ff700a95a9` | 940 | `c15ff66e0cf6b678c168ebeb7fceadbe210151debf1bb3d8d91f87262f65d256` |
| A | `packages/git/src/github.ts` | `871680b5b013a86d083c5ce6a983772904b5c918` | 16267 | `d78f5a15cfe1b159d64f43752035c9dc43ddbd8d2e3aef1ba56799dfad52a721` |
| A | `packages/git/src/http-read.ts` | `ff3bebef3ba34125565730d31b3390a8b5c74947` | 22431 | `053d0b34f770138076570a7f9b9db2acf339d694a5fae6aa10813628051fa762` |
| A | `packages/git/src/http.ts` | `b729ab8a28da8c536f7543dc9de1416f0d317dfd` | 14250 | `a4d642829ef69e0478fae52bc33cdf64519cfa27a1ed908a3abfe5a8cb545f90` |
| M | `packages/git/src/index.ts` | `653b61145a57902c4c875c00f91d60f7fe1ef0b5` | 1982 | `667788080de71d54aec39fe870ae80843decf026a11b8d2ed44773c9187fbad1` |
| A | `packages/git/test/fixtures/own-host/README.md` | `848596374e97ad83be7f06f2046e48a4a856eb1d` | 1132 | `e8e7f3f71e6a17e04ff032d0da361f777bde1e4e8a82b82e16dd48f51a07ad4d` |
| A | `packages/git/test/fixtures/own-host/info-refs.bin` | `57e69879f605423719c24863e652b7bc51f7055b` | 517 | `a3dcb1daedecf2dca79367a8c1ca45790216d735117d7483b2f37ab1b47b45f4` |
| A | `packages/git/test/fixtures/own-host/request-v0.bin` | `7caf07609a68efd95cc7fe1a125085a08ed019a0` | 63 | `4d895f03afb39210a5f0c81e92f0d1889aabe7280379477c0e892a002ae4126c` |
| A | `packages/git/test/fixtures/own-host/upload-pack.bin` | `062afdd1d6ae4c2dbe8966db224b721c3ea65976` | 376 | `013d88f128e6040ddb34d8a3d84df230ed859d4e42ec9b37289f1473acacce02` |
| A | `packages/git/test/github.test.ts` | `e60298a6f1358b634ad39c8b5082884fc69f8ea0` | 10777 | `a9b8fe0508f425fa2c8ee03b55bba0100d4269e4b2ec6e81496898564f025282` |
| A | `packages/git/test/http-read.test.ts` | `94f6ba2623bc6902823092666df9e746ea7fd3dd` | 8994 | `1ae027052957483d56caccfb56e8dc68bcbbbd9a2a96bc83eafd14129bca7660` |
| A | `packages/git/test/http.test.ts` | `38ea6bc1746d04cbdc2d683858a92361d4565c6e` | 10305 | `bc4d658694d97223a3c62c5bf74e26db9f825fb6d7a764983a4457c0264d2425` |
| A | `packages/git/test/own-host.test.ts` | `4328a6837126c6fb6d0d9d13b13cf24b7a05783a` | 5005 | `87db845e6ea63f2ef63a23073c0af4e57e37ef0ae7eec46b428831a99117b919` |
| M | `packages/lanes/README.md` | `2e678bda0ae2423cb573845750a2a9a63e3f0c41` | 6019 | `739ec5379fef0648716b3b4e36bc1c1aa30e74347ad88d372da504e76f28dcf6` |
| A | `packages/lanes/definitions/change-demo.json` | `fd8f29cbdc4eacedf7efc950fefd0cf4d08da751` | 41844 | `bd78e277ea0b23b3ebb0be81c74bf2474417833ac66b87a4061ddcdacb1cbc9e` |
| M | `packages/lanes/definitions/change.json` | `442f30dcd237c0177d9ea7dee23344f7a1aeb1d9` | 58429 | `468c12498bdb5c943c5230fdad8338aa61592b79caf554b074a780b90177e2e6` |
| A | `packages/lanes/definitions/issue-demo.json` | `bd33ecf9a9bc9f26963533abe7efb3eabfb00250` | 23024 | `975a6beae226c088b72cd15c2e514f3c586eb06e4327443fda36142af01eacbd` |
| M | `packages/lanes/scripts/pin.mjs` | `6bfa86476345e3cf23b2108bef0bb074502990ae` | 2991 | `68d1dcbcccf3d1ef283a26548c68f9b269e0b30b661d71bcb28fdb5afb085499` |
| M | `packages/lanes/src/change.ts` | `dcf2b7863f5235e48d046dab07e3376c9534d19b` | 76475 | `e2ed179223f155a24dc7a038d4aff5bf1ad0eda0edad8720c11ba2331c4d56c2` |
| A | `packages/lanes/src/demo.ts` | `936edd5d58d0fde22d0fdfe51d14d7c5691e4420` | 3223 | `f38461ea6c786b701987b6660b588db76d60ced6ec44ef6b3e80b25bb2c3ab06` |
| M | `packages/lanes/src/digests.ts` | `42fec75fce2ffd0e515f7eb0d3b4933988603187` | 1412 | `80c86d18b0518f2bb59f4c7986ff3567b4f7b552516a6f2c6b9009003baaa193` |
| M | `packages/lanes/src/index.ts` | `05bda92195220f26c45ff53fad6e4587236ed15a` | 1028 | `44d553ba28c35620e6b5d04cd7ddf1532a45803adeb1ba36fa29c433bbaeff63` |
| M | `packages/lanes/test/definitions.test.ts` | `65e7dfd7144a32b65e2363cdcb709ea35d8489b7` | 11414 | `4a5a2424edd0b253e993ba18aa8b4a0a39d7dde79cca8ccfdcb70c9351076ce2` |
| M | `packages/lanes/test/links.scope.test.ts` | `ea2efdfe87fa0537e09fc4dbbf9950779f9d209d` | 10244 | `8ece12bfd16d819888fb1cb326f79389c9082d3306f966951726a6fecbef6e47` |
| M | `packages/lanes/test/manifest.scope.test.ts` | `8babd832fa1685f8c484f689c2ba22d8a10eb355` | 14020 | `c3505f2ae80fa1f1fc030910660860d90f99950a3a716b6fdd91f161e56f90a2` |
| A | `packages/lanes/test/story.scope.test.ts` | `79abfd288a6d0772c1958705d082524db525aa31` | 5441 | `68a244b7df2478205d8f060bbed7522efbb57963470615094f259f12ced4a0d5` |
| M | `packages/lanes/test/support/env.d.ts` | `ef3294544f5fa9dcc903732fa45c11ae4dca1043` | 632 | `ec85c6dd0fcf00d93c73b35cffaa94db334ad44b9f87813d940b748e1ae05ebf` |
| M | `packages/lanes/test/support/graph.ts` | `dbf5b75df38333aa705525c7d9883b7eb64284db` | 31451 | `55de7f825fb47a6c1a0dfbe031b6c5917d4c0091bcfd84523421ca125d3bf512` |
| A | `packages/lanes/test/support/room.ts` | `49330757c2c695d0465c6c5cf71f9d780f5b76f1` | 20220 | `5970f30c002ebce3d05eed44660734bc464dbaa7332467ecdaa77df94faffc1c` |
| M | `packages/lanes/test/support/worker.ts` | `80c52dea4a19ec86fb1a639d075a7680bbf9dafd` | 616 | `e0117c7e1153e5edc4f62b7008b078fef9df24996deab8f66a066fe032c75078` |
| A | `packages/lanes/test/wiring.scope.test.ts` | `bb67ff6dcf75f27c43c2f7de8d6ea7500633e3fa` | 16788 | `677d6b8992d18017c6d9c50842531c88df86565bf6495919bf45d004702eab87` |
| M | `packages/lanes/wrangler.test.jsonc` | `17bc7110334e6da81a93716d11f7e4fefb4b3237` | 781 | `d055de5a3d1862795e67ef38a39b935e2297a5ba56285ec9a254bc50ae497790` |
| M | `packages/platform/src/destination.ts` | `fb6aeb13c31dde693acddb42837bc8d4effb74bd` | 115712 | `e5b184d17c18542951ac120e9d816548eebfb4c498eefae3a88e72fc62bb72e7` |
| M | `packages/platform/src/directory.ts` | `b913acd88086ff0c2e535001eaaafb8d17247d45` | 47321 | `49882b278ce9276c544fa02fdd700f945a8ce49a402b4cfdfc2986f109bb3545` |
| M | `packages/platform/src/index.ts` | `adcd27044ec293b2002ddddc5ed6b9d6208b3a3d` | 7561 | `b5ec1b6620c76c55e5ebb44a06139f81f6c15cd9abf46605383b68bc4085aab4` |
| M | `packages/platform/src/rules-scope.ts` | `6fc49ffabc5dcaec3c4518929232e71a5dd14a1a` | 37402 | `f66d867e24c38eedad69a7d3e56d0943cb92207c0f58e96f0a0d4a4c3e781ada` |
| M | `packages/platform/test/directory.test.ts` | `6ddb8ab8e7ba3780937db6ec240466c929a7ec7e` | 42802 | `eea5f3553171c356e57000a2a98f41f4a5b1a29dd137fc278b407bf33dad2920` |
| M | `packages/platform/test/rules-scope.test.ts` | `28690d0b5d0b2530af08d1933a4314c51a7f5451` | 34680 | `247d2b42be4bfd69314e07185ff584d6c9a9141027c8d0b7fe89ce512bac329c` |
| M | `packages/replay/src/source.ts` | `27f1a5b062e9cb99a7e1089d25e58144df6663e3` | 11864 | `3f11a830354e62c0f24d22bdaa1c4b15e15a5449533e95b799e7f843150d550e` |
| M | `packages/replay/src/verify.ts` | `b1cbbb72711765f7fc958bfdf40d85ecb1a58f5a` | 93226 | `3ecebd2971c8f7ca2a531443d5cf90bdf1eac3c7e06c1d9967e07cf5fe36a6a3` |
| M | `packages/replay/test/cli.test.ts` | `41f9f5ffc38868248d82326df8d44e9dce892afc` | 10296 | `56a66a9781b134b4f34df5c1e61ebda08dc56f81e9f153da7bfeed9a7acd3f2a` |
| M | `packages/scope/README.md` | `b0b89fe8a026d5b1735ad489021c5b0e7449bc59` | 45182 | `7eb6bcfe669348f7628386cd46a813f966673783bc5576c59d6532bf519ba308` |
| M | `packages/scope/package.json` | `d93586567d6aea321d70641bdba76660260bb576` | 1261 | `83d6a88b0c605e591a9fc442d94acd751f6d6fe97fab71b882a9a089397691b0` |
| A | `packages/scope/src/artifacts-host.ts` | `296da2f9b9dc605542eec787dfde7bcddf835862` | 13860 | `af6f423a7cae5f80a7aaa61fb26b699a73228a1cd5c0df1a918d8301a8bce2e6` |
| A | `packages/scope/src/artifacts-wiring.ts` | `6506937922f60eabf53767018e8580da255d2674` | 6697 | `34546b260819e225f84637b08dea1d17f7c6bd3f4146dd09213849dbc1e27f73` |
| M | `packages/scope/src/authority.ts` | `66be71e753c9c8fc964ff6f0dec20407de6eb3ac` | 30256 | `b87481140c652c471c60d65d696a3c6c39519b2a83c7a6451b8e09320a74492a` |
| A | `packages/scope/src/credential-store.ts` | `3e455bd3247bc77307ede62f12ae988b388b4114` | 11852 | `34b47ffe8af1e2d2dfa8b4d16e30b76f34fec17e14dd2c601a54a2e6a70ec897` |
| A | `packages/scope/src/destination-host.ts` | `0c9767d0c2a9a743101b5144ee6dbd7843317c1b` | 23156 | `69f95e4be32b3b90ab40cec03c75a385ace45baadfd198a6ba512e09f77caac3` |
| A | `packages/scope/src/github-host.ts` | `1b65114db13f22140044892e39b63a5e00ea94ef` | 19514 | `6bd865f811466a091a0357990d77a6fc376d5585de5710b792e1867e1ee3ef5b` |
| A | `packages/scope/src/github-wiring.ts` | `41b7d236bc89322dbeecf71cf9d5f097bdf4569b` | 7997 | `5a132a89b8ae998cb7163b0e06596fa760d290732270cee8089ad647e0099c52` |
| A | `packages/scope/src/host-wiring.ts` | `dad4ac155ff5cf39ce7f13ce1ad16537688ad53b` | 6500 | `8c43e6cd3a9a8a3a9ff66f0ce72a6729079bd296bf88998b49dabbe7c9e51a38` |
| M | `packages/scope/src/index.ts` | `a6ee5a2ead252ef6e0d81b6db7571b6114a1735c` | 545 | `4f81cb86f454e867db770f21859db31ffc5e0b6130afb3215098d22941b54d20` |
| M | `packages/scope/src/object.ts` | `873f745b4a7bdd4db03acf4d9f125acafaf8087a` | 26056 | `d18e870f4e2bb976d4b6732c73aa64eedad59cfd2602211338b4f79d2afb1f9e` |
| M | `packages/scope/src/operations.ts` | `3c1090163dc09105cbcfbad2da99ba8d6e28102d` | 37326 | `b51b0c6f0b76fa024bb1005cbc00a10159bfb000315fd5e62a034ce258949952` |
| M | `packages/scope/src/ports.ts` | `0e14893dd9fa752493f8ba3b905c09b110c59f9c` | 18981 | `268cad43c48c8b7bfe939c34e2b5870252c4892cf36650fae678f539af885fcd` |
| M | `packages/scope/src/reads.ts` | `a1b9a9084f52609ab55dbe30a6b5dc15fc9f2074` | 23561 | `a5fa307bfdb00b512b2123006db5a27b61148de17248b2b04d2ada3666cca511` |
| A | `packages/scope/src/register-host.ts` | `726df79f4c5279322cf02c75514e46098f900ec2` | 7865 | `256c42db694eab586cb1d4de7b13c969d18526a6231aee2734b40f732cda5c86` |
| M | `packages/scope/src/sessions.ts` | `eddfc045aad2657a9c78955c9e78abd542060702` | 33045 | `17efdc38ad04dd199b28522880d629eecc64fea1588f0f1cdcf8114799935aaf` |
| A | `packages/scope/src/signed-reads.ts` | `5c83f1e5503579721ae565b43c59c119062fe16f` | 18004 | `3a0ba7c7590c58bfbb3da2ebc57f2ae1e3be5dc6e220fdcbc37203aca7d8a856` |
| M | `packages/scope/src/worker.ts` | `7c74fe60bd8db58774b22fcd7debda089361ef11` | 27457 | `851eba3bdcf88b62fad02e92374720671c109bf3c3be3fa6d939a39303b308ce` |
| A | `packages/scope/test/artifacts-host.test.ts` | `001e4b299b6d91a5de45912eb03dfbe73552bb51` | 18234 | `544c2f502affe882cbbb17ce58706b043fe10a0c7f8d9773309415218510ee8e` |
| A | `packages/scope/test/artifacts-wiring.test.ts` | `96c60778b7b53cfc81ba1a475a175710a0966b32` | 19458 | `874dd5b4615415243b4e7fbe74456bf579d4eb94cdb63bb3696118efe91cf5c0` |
| A | `packages/scope/test/credential-store.test.ts` | `4f25471ed158386750ed70baa44dbb30c301971b` | 7090 | `80438ccf5b69c43976ede62e1f34fe8cc5d23a59e1f9e0a124cf0e860e28a230` |
| A | `packages/scope/test/destination-host.test.ts` | `b2e8208e6f2653db60f667e7182bf3e711336c05` | 20565 | `88a325a1af0819d12a1a8f3231221f8d90f5644570560e0d16ae1a2ccebf63ff` |
| A | `packages/scope/test/destination-sessions.test.ts` | `91a098ac1de996d4d480993ff1bd0a5eb26ba3c1` | 5426 | `6d19c4a02ba74e0b7de1d18a25fff12b63ff8df63515cf5287f863d1e171fcae` |
| M | `packages/scope/test/founding-real.test.ts` | `d8cce53e0f50227e997078361b3b503abd0e09d3` | 36436 | `01d5edf5c15ebab494f4a577b4c45528b8d9e2e8c91ced2001772120d0679603` |
| A | `packages/scope/test/github-founding.test.ts` | `9c46f9f2cb6cfb87d5f48aa13d941808085e51e5` | 20074 | `b3353f97bf00bcf4cf4b271f54640cc66e9f857052eac6568e72c4a875cef4dc` |
| A | `packages/scope/test/github-host.test.ts` | `7b9d38eb1e44bb0cbe4cb5e4a6d53fa4ffb5b6ef` | 11198 | `8275c6b2a652594a8ee371ee6ae39d2c0f5e225b5fa2e4ed5429a80f35d19923` |
| A | `packages/scope/test/github-wiring.test.ts` | `d9b0fc61236f61a13f74e8d3201de515e7bfba24` | 12660 | `8bb4594c03710f0994669845d017af3b39ee4b00f298d057c2b86cb9d66732b6` |
| M | `packages/scope/test/limits.test.ts` | `be0d5ee770c5ca2c1e961f155249a3c111c7d702` | 10156 | `03330d89fc41613e928648df86fa802826cb978dca0763760ab7c2e2ff265dcf` |
| M | `packages/scope/test/operations.test.ts` | `a9fdf6a5ed275ad75eb1463bce922dcd4fb678ee` | 35491 | `68b65ae64fd0b5df4cfdc01acc73f3cff260f475f55da659940e4d2dd29737bc` |
| A | `packages/scope/test/register-host.test.ts` | `ee853209ebd27d881122d1c7d80b283bb3f98b67` | 9230 | `a01caebf445582c6f8c3192c16da9794a5bb0e85819ce8ca684bb45b6f5de487` |
| A | `packages/scope/test/signed-reads.test.ts` | `38b0e653f7f15fbe860b4f0a7f7f372f45b4776d` | 34536 | `5f38ef1e1c118dfadf1b6aafeec6e6bf6ef90316ad05339353f0aa0b654c2642` |
| M | `packages/scope/test/worker.ts` | `7926057341b3a4c917f67d82b9cbb936c59a9400` | 8304 | `1fc1ecb4cdd29fa6226ff492866243e6fd81f872daa6173a02da9c56418f6b9e` |
| M | `packages/scope/wrangler.jsonc` | `9b3093ba3240566c38893919880548c08604e3e7` | 2217 | `6edc4b47ab050d827c17b55dfe49c4f188af5b83875f5a07753c4b0165dc3492` |
| D (absent) | `plans/025-2026-10-07-published-pages.md` | `eeb6fae7f84997e25570e4fcec434c36e83db559` | 6123 | `ece0b335d854eb6fd250a71d867419ced3aebde03707180232667b9bd39ccf6d` |
| M | `scripts/active-source.test.mjs` | `0fca297fe7d6b5fb5a7127211b4273b0fb0b4dac` | 6351 | `a97ba3a10285ad35abf10759d3e892b11b12ff0a270edcc6221b68b8014a2eeb` |
| A | `scripts/demo-git-host.mjs` | `aa17ad0c986202ce2a6a3b8ca6a5d5a6810af794` | 15243 | `2de180e1ee26a61366e45932e548b587b4b6a2aadd4653988552dc94cca3a400` |
| A | `scripts/demo-git-host.test.mjs` | `56300c046fe4e1af566166d6bd00e7167005f6e4` | 5728 | `32ea6773259efd0ece3106f606b6167ae0b12e2545af69af7c01ddc58025d141` |
| M | `vitest.config.ts` | `a4b4334eaa0cb1e01519a06ee9b558873e1e3694` | 2282 | `3c45b601d7cd30a1b219a26eacc7fcff88993709eb72fa2967ac533df57ab9fc` |
