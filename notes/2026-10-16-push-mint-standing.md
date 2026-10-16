# D1 push-mint standing

Source request `83bbbd40`, promise `04ce3234`, under NOW `e0292346`.
Technical decision `ba12604d` is adopted. The explicit
`platform:destination@5` cohort refreshes the complete counted key set
before installing a confirmed credential for a regular review-backed
publication's undecided push attempt. No caller or default pin activates
this cohort. Existing `@1` through `@4` definition digests remain unchanged;
NEWEST remains `@3`, and automatic application publication remains `@4`.

## Provenance and decision

The existing passes value slot holds a closed versioned record: the
reservation position, merger and up to 64 counted approving facts, and up
to 32 current required check generations. It keeps actual signer, job,
result and accepted own-decision references. The reservation helper uses
its existing independent-approval, touched-extent and required-check
policy, and preserves the old result shape for existing callers.

Reservation-tree checks are accepted after the initial reservation. Each
native check-admission transition records its actual signer and accepted
result; fencing replaces the old generation and removes its proof. Mint
cannot recover the complete set from reservedAt.observed alone, use a
requested checker or accept a passed boolean as signer provenance.

The provenance reader validates closed metadata before reading exact own
records. It checks scope/incarnation, own hash, accepted owner/kind,
operation/attempt, holder, effect and affiliated membership. A later check
also binds its exact checked delivery, job/result and opening effect. It
reads at most one reservation, 32 accepted decisions and 32 opening entries
per invocation: 65 distinct records, with a per-invocation cache. D1 adds
no history-range scan. Existing publication/cleanup scans remain.

Internal references use closed record shapes, validated by the reader as
full fact references. A foreign-fact field would demand every old checker
body again when an unrelated generation changes. These records preserve
native admitted references for the bounded own-record proof instead. A
request cannot supply the metadata or choose the counted key list. The
existing 12 value slots and global list bound of 64 remain unchanged.

Mint names the complete distinct set through nine keys, with the native
row max9/window10/useonce/withoutwait. Ten keys leave the outcome unwritten;
there is no truncated active prefix. Every key active retains the inherited
token/publishing effects. An inactive key, removed member, inactive
controller or expired standing sets aborting, installs no credential, and
opens this mint's revocation plus one deciding read. Missing, unknown,
unreadable, ambiguous or wrong-frame standing writes no mint outcome.
The gate concerns standing at that entry; it adds no send-time fence,
immediate revocation guarantee or recall of an accepted/in-flight write.

First-head, receipt, reservation-stage and reservation-delete mints name
no D1 key. Closed/aborting targets and already decided served attempts keep
late-token revocation without a membership dependency. Automatic
file-publication keeps its separately authorized inherited journey and is
outside this guarantee. Its file judge DOES set reservedAt; the missing
human reservation observations are the reason for the exclusion. A later
cohort needs a separate reviewed freshness contract for automatic files.
Directory-partition section 4.10 now states these qualifications.

## Closure and deciding read

The mint's declared operation set is revoke/read, with rule maximum two
operations and eight effects. The inactive branch has aborting plus the
two operation/attempt pairs. The reservation judge allows the one added
passes effect: maximum 13 instead of 12. The regular holder has four reads
instead of three, conservatively reserving the three inherited push reads
plus one abort read. It keeps ten revokes: each of the ten possible mints
still has one revoke, and this branch revokes this mint rather than adding
a second token. Relay and gate exclude another abort through aborting.

The new readFor route accepts only an exact @5 confirmed mint outcome:
its own frame/hash, native mint and served push attempt, common holder,
this read's operation/attempt/opening, and this target's aborting effect.
It returns the publication to inherited seenDecides. A read can discover
an effective integration and record published after aborting. An absent or
unprovable ref preserves unresolved semantics and cannot prove cancellation.

## Focused evidence

`/tmp/artroom-d1-final-platform-focus.log` passes 25 tests across five files.
It includes 15 D1 admission cases, three provenance cases, three reservation
authority cases, two version-catalog cases and two inherited file bounds
cases. Validators, judges and folding are real and in memory. Creator and
lane histories, authority/rules answers and Git replies are scripted.
These cases distinguish active/inactive/unavailable standing for merger,
counted approver and post-reservation checker; replacement generations;
actual accepted nine/ten-key sets; missing own provenance; late cleanup;
all exempt write kinds; relay-first/gate-first closure; and exact read
holder/attempt/mint/frame checks. Tampered own-record controls are labelled
inadmissible fixtures. Existing version golden literals remain exact.

`/tmp/artroom-d1-final-native-focus.log` passes all five native cases. They
use actual @5 birth, turns, SQLite, observation guards, operation driver,
real membership changes and restart. Creator/lane histories, rules answers,
Git replies and retained-reply custody are explicitly scripted stand-ins.
An active key installs the credential. A compromised key aborts after a
restart. Unreadable standing leaves the mint undecided; its original own
reply survives a restart through the scripted custody adapter and is
accepted later without another mint send. No real provider token is issued.

Each native case sets the destination's test entry bound to its actual
written plus reserved count, then proves an ordinary adding act is refused
scope-full with no record/state change. The reserved abort still writes,
draws one read and revoke (remaining read3/revoke9), and the revoke and
read settle at that bound. Effective integration yields published; absent
ref yields unresolved. Restart preserves each resulting state. No scripted
push request reaches the outside adapter in these cases.

The full-root case also uses a real legacy repository directory and real
membership. The root's test bound is its written plus reserved count. An
authentic compromise relay receives retry/scope-full and leaves its history
unchanged; the destination's fresh membership read still detects the key.
The extra @5 child creation remains scripted, so this is not a new directory
cohort, registration or partition rollout. Other native cases use the
labelled office stand-in only for membership's creator.

One bounded negative control replaces the active-set branch condition with
true. `/tmp/artroom-d1-inactive-gate-control.log` fails by assertion: the
compromised key incorrectly installs the token and enters publishing.
The exact pre-control Source is restored (SHA256
`9a1b892e6144f296ca2455e4efa46db862df9f41bc4e676edc1cc74459887f8d`).
The final read route then gained two additional served-attempt/most guards;
the inactive gate is unchanged. The withdrawn candidate's destination Source SHA256 is
`70e0d9aed805b0befd1d33b105e5f95f00e1c687123449e630eb0a08e511420a`.
This is one distinguishing control, not a mutation sweep.

Earlier fixture failures remain failures: missing scripted rules extent
bytes, a noncanonical scripted timestamp, incomplete retained-source lists
and guessed operation ordinals were corrected before the passing runs. The
second-generation refusal also exposed the foreign-fact metadata problem
fixed above. No failed diagnostic is relabelled. The Page asset is regenerated from the version registry, without a rendered
UI change claim. Scope and platform typechecks pass.

## Previous frozen gate and withdrawn review

The first D1 full gate passed at clean Source
`2286345e8e7df6f5e74764053ff2d96d2b9ba077`, tree
`6e7b873583ea4f3087e107b458be446f17240a94`, composed over Main `54dcefbc`.
Its original process closed with exit 0: 1,444 Vitest passes and three
skips (275 files passed, one skipped), 16 Node passes and 55 Counting
passes. There was no gate retry. The wrapper log is
`/tmp/artroom-d1-2286345e-gate.log`; original private step logs are under
`/var/folders/2x/wylr59t17ds36l1l7ng25y7w0000gn/T/tmp.ZoSeVwIX9R`.
These paths identify producer evidence, not a grant to adjacent/raw files.

Step elapsed/CPU seconds were install 3.5/5.3, whitespace 0.0/0.0,
typecheck 9.3/29.9 and test 307.7/419.3. These are step measurements on
the local shared Mac with caffeinate and normal dependency/cache state,
not isolated benchmarks or the whole gate's wall time. The log includes
scripted-reset and retention-fault diagnostics and one Vitest cross-object
abort/timeout diagnostic; the reported terminal and suite outcomes are as
above. This is not a claim of diagnostic-free execution.

The previous review candidate `01c96279` updated only this report after
that gate. The producer verified exact correspondence of all other 1,384
tracked paths before filing. That candidate was then withdrawn as described
below; its gate does not cover the corrected runtime Source.

Cloudflare deployment, version upload, binding, secret and migration changes
remain held. No such operation or real Git-provider mutation ran. The
workroom's owner update `257e9bdb` reopens GitHub pushes only after reviewed
local landings; no D1 push or landing has occurred at this checkpoint.

## Runtime compatibility correction

After filing review `49cd06cb`, the builder found missing closed-version
checks outside the platform package: production host file-judge admission,
recovery and dispatch; reservation snapshots and expiry projection; automatic
file source checks; replay's matching application-origin checks; immutable
site receipt routing; the checker snapshot owner and the Page's head reader.
The host snapshot also treated passes as an array. These were real gaps:
the first native witnesses used a scripted outside adapter. The original
passing gate did not establish production-host compatibility.

The builder withdrew review `49cd06cb` through `9bef4355` before approval or
landing. The checker confirmed no review/approval was filed, and no retired
basis is overridden. The old candidate, public projection and gate remain
historical evidence with their original outcomes. No D1 landing or push ran.

The corrected Source adds explicit @5 to the relevant inherited closed
branches in runtime, replay and Page. It adds @5 to the checker's existing
@3 reservation owner boundary, preserving its previous @4 refusal. No
unknown future version is accepted by these new branches. The snapshot host
uses the shared closed metadata parser and reservation stamp for @5's
current generations; old valid array paths remain unchanged. Existing
platform data, defaults and caller pins remain unchanged. File publication
still has its separate authority journey and remains outside fresh standing.

`/tmp/artroom-d1-runtime-complete-compat-focus.log` passes 13 tests in four
files. It includes all five native D1 cases, with an actual @5 expiry
projection and rejection of a file source lacking immutable factory proof;
six production DestinationHost cases, including direct @5 file inspection
and read-only recovery, and the fenced record-shaped generation reaching
the staged-ref snapshot boundary; one inherited real @4 application
publication/source/replay scenario; and one @5 immutable-publication selector
case. That last case projects actual in-memory judged @5 file/receipt entries
into fresh native SQLite: it proves the integer publication pointer and exact
file reservation are selected without writes, and a pending receipt denies
selection. It is a storage projection fixture, not native admission or HTTP.
Production-host provider, source and membership answers remain scripted;
its missing-stage result is not a full @5 Git snapshot/provider proof.

`/tmp/artroom-d1-checker-compat-focus.log` passes the pure checker owner
boundary case. It transforms the retained @3 snapshot's owner/hash/ref as
an explicitly synthetic cohort-selection control, not a native @5 producer.
It accepts @3/@5 and preserves refusal of @4 and unknown @6.
`/tmp/artroom-d1-editor-compat-focus.log` passes four editor tests, including
both @5 workflows, unchanged older workflow bounds and @6 refusal, with no
mutation when the published base moved. This is a scripted HTTP/function
boundary, not rendered browser evidence. The Page asset is regenerated.

The corrected frozen Source needs its own gate and exact-head review.
The original `2286345e` pass is not carried across these implementation
changes. The historical inactive-gate control concerns the unchanged gate
branch only; it is not a control for the newly corrected host/read paths.


## Corrected frozen gate and bounded diagnosis

The corrected frozen Source is
`8ab35b096dd4cbd953a94107cc963a7f0171cd95`, tree
`44be0be6dc86055ae078138b86533f0eef2977aa`, composed over Main `54dcefbc`.
Its one full gate's original process closed with exit 1. Whitespace and
all typechecks passed. Vitest reported 1,446 passes, three skips and one
failure: the existing native task-data Page witness exceeded its unchanged
five-second timeout. There were 276 passing files, one failed and one
skipped. Node and Counting groups were not reached by that process.
The wrapper is `/tmp/artroom-d1-8ab35b09-gate.log`; private original step
logs are under `/var/folders/2x/wylr59t17ds36l1l7ng25y7w0000gn/T/tmp.uEjkw1NZRS`.
These paths identify evidence, with no grant to adjacent or raw files.

Step elapsed/CPU seconds were whitespace 0.0/0.0, typecheck 12.3/34.0 and
test 345.7/417.9. The dependency install was skipped because its verified
lockfile stamp matched. These are step figures on the shared local Mac,
with caffeinate and normal cache state, not isolated benchmarks. Scripted
reset/retention-fault diagnostics remain in the original log. The timed
out witness reached its fresh-review-faults stage at 4,611 ms after setup,
issue creation, Description and publication/review-choice stages completed;
cleanup ran at 5,010 ms. The evidence does not establish the timeout's cause.

With no Source change, one isolated run of exactly
`apps/room/page/test/task-data.scope.test.ts` passed both tests in 8.49 s
(6.16 s summed test time), with the original default timeout. Its original
process closed 0; log `/tmp/artroom-d1-8ab35b09-task-timeout-diagnostic.log`.
Separately running only the omitted groups passed all 16 Node checks and
55 Counting checks, both original processes closed 0. Logs are
`/tmp/artroom-d1-8ab35b09-node-tests.log` and
`/tmp/artroom-d1-8ab35b09-counting-tests.log`. Their union with the gate
covers all tests successfully at this Source, but it is not a passing gate.
No whole suite or gate was repeated, no timeout was widened, and the
original failure is preserved for review. This report-only successor changes
no implementation, test or generated asset from the corrected gate head.


## Review F1: inherited file supersession

Checker report `4e3bc6d8` requested changes to `5d21f417`. It found the
remaining `fileSupersededOutcome` guard accepted only @4, although @5
inherits that hook and the matching superseded-outcome validation. This
weakened the existing automatic-file journey independently of the human
D1 standing guarantee. The exact-head review found no other blocking issue;
its bounded fixture and failed-gate qualifications remain as stated above.

The guard now explicitly accepts @4 and @5, with future @6 still refused.
The existing pure supersession witness runs for both versions and retains
its unknown-outcome and absent-slot controls. The Page asset is rebuilt
from this Source (JavaScript 670,477 bytes), with no rendered-UI claim.

`/tmp/artroom-d1-supersession-correction-focus.log` passes 13 tests across
three files: six pure file cases, the five existing D1 native standing
cases plus the new native @5 unsent-file case, and the existing genuine @4
application publication/source/replay journey. The new native case admits
two file deliveries from the same source/path around a confirmed file
judge and mint. The actual operation driver records the exact refused
`not-sent`/`supersededBy` result for the older push before a sent mark,
without calling the outside push adapter. The old file becomes superseded,
the durable sent time remains null and restart preserves the resulting state.

`/tmp/artroom-d1-file-unknown-focus.log` separately passes the added native
@5 sent/unknown case (six unrelated cases filtered out). The actual driver
marks and calls the original push once; a scripted lost reply gives an
unknown outcome. A later same-path file and restart leave the original
unresolved with its slot held, its original sent mark and no second push.
This never labels a possibly sent write as not-sent.

Both new cases use real destination@5 birth, admission, turns, SQLite,
operation driver, rules and restart. Their Directory@8/application genesis,
creator and source entries form a complete but scripted immutable proof;
no actual application or Directory factory creates them. Membership is
real; Git answers and lost replies are scripted. They establish the native
receiver/driver boundary, not provider execution or a newly activated cohort.
A new frozen Source gate and exact-head review follow this implementation
correction; the prior failed gate remains preserved and is not relabelled.
