# Keep invitation declarations consistent

## Current Source

Source request `47b965fb`, promise `1af83575`, renews
the complete original scope on actual Main
`532b1d0d00e05f32cb5e454a0e838b447bff0b12`, tree `c802c528`.
That Main preserves the reviewed Judge and adds the reviewed journey plan.
The older Source IDs, dependency waits and gate results below describe
earlier preparation checkpoints. All original attempts remain recorded.

## Earlier preparation

Source child `cca0370f`, promise `4178faca`, delivers P3 request
`315ae850` under `6b5b1b33`, against Main `55e1970a5`. This is independent
local work during archive review. Archive remains first for landing;
exact Main correspondence and independent Source review remain required.

## What changes

The retained successor comparison now includes the effective membership
pin. An omitted definition still means membership@2, so omitted and
explicit @2 declarations compare equally. A successor cannot change that
effective declaration. The retained agent-link validator also requires
the link's definition to equal the row's effective pin, alongside its
existing actor, controller, fact, secret and repository checks.

The two changes do not alter native membership policy, definitions,
defaults, signing, keys, envelopes or storage formats. Supported @2,
@4, @5 and @6 flows remain usable. No role name is added as authority.
The controller must be the issuing person and hold the required
permissions under the current room policy.

The evidence notes now distinguish authenticated action listings from
subsequent action execution. No independently signed post-enrollment
role action is claimed for every configuration in the existing witness;
the separately recorded Counter take proves its own case only. The
wrong-pin behavior is preserved explicitly: native enrollment can be
admitted and consume the invitation before receipt-pin verification
leaves the original configuration retained unverified. No rollback or
restored invitation is claimed.

## Focused evidence

Before the repair, original run `66176` exited 1 with five assertion
failures. Under each supported pin, a retained link declaring another
pin returned verified instead of blocked. A private successor changing
the implicit @2 declaration to @4 returned unknown instead of blocked.
The positive implicit-to-explicit @2 case already passed. These are
actual interface outcomes, not thrown-error controls.

The repaired CLI source/test/Scope typechecks and all five focused cases
passed in original run `50768`, exit 0. The existing model case now
exercises all four supported pins through real SDK envelopes, native
membership rules in memory, actual CLI file custody and exact receipts.
HTTP sessions, directory projection and inbox confirmation remain
explicit stand-ins; it proves no native runtime or provider behavior.
The completed omitted-@2 record stays verified. Corrupt leaves and
successors are read through controlled Store ports without overwriting
the actual originals. Submit/request tripwires are asserted outside the
fail-closed result, so a caught tripwire cannot hide a call.

The real local Scope enrollment scenario passed separately in `63203`,
exit 0, after CLI source/test/Scope typechecks. Its client act transport
now counts and rejects submissions while checking retained work or
locally refusing another controller. The assertion runs after each
guarded operation, independently of the native head comparisons. Initial
cross-room enrollment still submits and receives a native refusal;
wrong-pin enrollment still admits natively before pin mismatch. Only
the repeated/locally refused operations claim zero act submissions.
Read-session authentication can still sign and send. Scopes, sessions
and SQLite are real; Git host and scheduling remain the original
labelled stand-ins.

The unchanged-lock offline install `31386` exited zero. The owned Page
producer ran because the Page imports invitation custody; its generated
Worker asset module is part of this Source. No manifest, lock or native
catalog bytes changed. Original records use these paths:

- `/tmp/artroom-invitation-successor-original-focus.log`
- `/tmp/artroom-invitation-successor-repaired-focus.log`
- `/tmp/artroom-invitation-successor-types.log`
- `/tmp/artroom-invitation-successor-native-types.log`
- `/tmp/artroom-invitation-successor-native-focus.log`
- `/tmp/artroom-invitation-successor-owned-page-assets.log`

These owner references grant no raw-file, helper or execution access.
Final review receives a separately pinned finite metadata grant. Source
approval and reviewed landing remain owed. Existing hosted outputs and
the original archive/Lending candidates remain unchanged; no provider
operation, deployment or publication ran.

## Frozen integration gate

Original gate `24299` ran once at clean commit
`5375fb16bafa658be91b7dba316ae519a6b2a8c6`, tree
`10c77db40030c9b7533b5722c5f3fbdd2a4c7bbf`, and exited zero. The exact
composition retains all thirteen archive paths from `c811785ea`, eleven
Lending paths from `1d2a6cfde` and six invitation paths from `8c98c1f73`,
with their original modes and blobs. Its thirty changed paths against
Main `55e1970a5` contain no additional source changes.

Whitespace, types, 1,562 Vitest tests with three skips, sixteen Node tests
and fifty-five Counting tests passed. The existing-lock install took
2.2 seconds, types 7.4 seconds and tests 444.9 seconds. The original owner
terminal is `b7fe0f`, exit 0. The wrapper log is
`/tmp/artroom-p3-integration-5375-gate.log`; step logs are in
`/var/folders/2x/wylr59t17ds36l1l7ng25y7w0000gn/T/tmp.DHl3BJJKqb`.

This note and the Lending note add evidence only after that freeze.
The shared gate does not replace archive's own gate or approve that
dependency. P3 Source filing and landing still wait for archive's reviewed
landing and exact correspondence with Main. Log references grant no
raw-file, helper or execution access.

Archive self-audit later reproduced acceptance of an unexpected empty
directory in the immediate parent in both Git formats. Finding `bdcf6890`
and withdrawal `24704f32` hold the old `c811785ea` Source. This local
composition includes repair `83eb65d9c`; the earlier integration gate
`24299` validates its original composition only. This changed dependency
requires a new frozen integration gate, then archive's independent
approval and landing before P3 Source filing or landing.

### Replacement integration gate

Original gate `27928` ran once at clean commit
`d0a4449313db0bb174c1ec780e73c1a0851872c3`, tree
`f693053c4e2c40c057337bb8612d36640cd739a5`, and exited zero. Owner
terminal `863b1f` records completion. The dependency view matched the
unchanged lock, so installation was skipped. Whitespace took 0.0 seconds
elapsed and 0.0 CPU; types 7.2 and 26.4; tests 439.1 and 552.3. All 1,563
Vitest tests passed with three skips; sixteen Node cases and fifty-five
Counting cases passed. The original wrapper log is
`/tmp/artroom-p3-integration-d0a44493-gate.log`; step logs are under
`/var/folders/2x/wylr59t17ds36l1l7ng25y7w0000gn/T/tmp.77Mz0xZC3i`.

This was macOS 27.0.1 on arm64 with eighteen logical CPUs, pre-gate load
averages 1.37, 1.67 and 1.62, and a matching verified-lock stamp. These are
observations, not load causation. The successor composes archive's final
gate-result note from `6d1a1973d` and updates only the two P3 notes.
All 1,451 other mode/type/blob leaves must match the passing freeze.
Archive review `17dad8da` and finite grant `6e2b59c7` remain separate;
independent approval, archive landing and exact Main correspondence still
precede P3 Source filing. These references grant no raw-file or execution
access and claim no Source approval or landing.

### Composition with the CLI runbook follow-up

Independent CLI/runbook follow-up `03b4ff8a` / `527d0f9b` adds exactly seven
paths from `4e8cd9b1b` to the completed composition. Invitation and Lending
implementation bytes remain unchanged, as do all thirteen archive leaves.
The composed owned Page producer adds no tracked output change.

Original gate `51005` completed once at clean commit
`af623e49df8c933ade6dc64c3179fc69c1fae108`, tree
`cfb51d86e2c68b1a68342d7177cf1593ba0f0d60`, with exit zero; owner terminal
`dd35b4`. Installation was skipped with a matching verified-lock stamp.
Whitespace took 0.0 seconds elapsed and 0.0 CPU; types 7.2 and 26.0; tests
446.9 and 557.6. All 1,563 Vitest tests passed, with three skips, followed
by sixteen Node and fifty-five Counting passes. The machine was macOS
27.0.1 arm64 with eighteen logical CPUs and observed pre-gate load 1.29,
1.33 and 1.46; no load cause is inferred.

The original wrapper log is `/tmp/artroom-p3-cli-composed-gate.log`; step
logs are under `/var/folders/2x/wylr59t17ds36l1l7ng25y7w0000gn/T/tmp.dOBREjOuyF`.
Only the three P3 notes change after that freeze. All 1,452 other
mode/type/blob leaves must be exact. Archive review `17dad8da` and its
unchanged candidate remain separate; archive approval/landing and exact
Main correspondence still precede P3 Source filing. These references
grant no external-file or execution access and imply no Source approval.

### Composition with bounded MCP continuation hints

The independently queued MCP cache follow-up `4f37b980` / `9379959b`
adds exactly six paths from `e50f920d4` to the prior passing composition.
Original gate `49806` passed once at clean
`52c1a0fc1e44a604977a95698c8014cf0ab04b7d`, tree
`409b91640dd326d867e2a329be5ffe99b3f72358`; owner terminal `e291ce`.
All 1,567 Vitest cases passed with three skips, followed by sixteen Node
and fifty-five Counting passes. The [cache implementation note](2026-10-17-mcp-continuation-cache-bound.md)
records phase costs, observed machine/cache state and original attempts.

Only the four P3 notes change after this freeze; all 1,454 other
mode/type/blob leaves must match. All thirteen archive `6d1a1973d` leaves
remain exact. Source filing and landing still wait for archive review
`17dad8da`, its reviewed landing, exact Main correspondence and independent
P3 approval. No external-file or execution access follows from this record.


## Actual Judge Main composition

Archive6d1 and local Judge0f35 are independently reviewed and landed in
actual Main02a. This five-slice preparation incorporates that Main. The
Judge implementation, including operation-owned receipt/page/failure
counters, is preserved; the three intended shared paths are MCP guidance,
service cache hints and their budget witnesses. This incorporation adds no native policy, signed-data change, key/config
migration or dependency. No deployment is performed.

The actual-service HTTP stand-in checks cover both final-page query/head
continuation and receipt recovery after a lost reply. Four coupled cases
passed in original run34507 (`48122e`). The fixture retains observation,
metrics and lost-reply wrapping together. Those cases prove transport and
cache accounting, not Native admission. The subsequent Main incorporation
changes only the Judge delivery note relative to that checked composition.

The earlier P3 gate at52c1 passed before this Judge composition. It is
historical evidence; one new gate is due at the final changed composition
freeze before complete exact-path Source review. The approved Judge slice
retains its three failed gates and cause-unknown timeout qualifications;
those are neither waived nor counted as a passing combined P3 gate. All
five P3 scopes and their earlier evidence remain intact. No provider,
deployment, publication or unreviewed branch push is performed. Further
At that checkpoint, GitHub egress waited for direct destination approval.
Hugh has since approved repository pushes and planner deployments to
Cloudflare as needed. Reviewed Main and Gitseq were pushed successfully;
this P3 delivery performs no deployment.


## Passing final composition gate

The clean implementation freeze was
`39572e24115702e78e7e309a1ace958f886d8f40`, tree
`fd00a9ed16e64fbe9343869e633bc179abc81f05`. Original session 64174
closed with exit 0 (`1126ed`), at the same clean head and tree. The single
pipeline passed 1,575 Vitest cases and skipped three; Node passed 25 and
Counter passed 55. It took 587.393 seconds elapsed and 702.399 child CPU
seconds on macOS 27.0.1 arm64, 18 logical CPUs, with pre-run load
2.616/4.841/5.456. Existing-lock installation took 2.6 s elapsed/3.9CPU,
typechecking 8.2 s/28.1CPU, and tests 576.2 s/670.1CPU. The lock remained
unchanged. These are one run’s observations, not a diagnosis or a saving
claim. Private log: `/tmp/artroom-p3-judge-39572e24-gate.log`; step logs:
`/var/folders/2x/wylr59t17ds36l1l7ng25y7w0000gn/T/tmp.nYIMzv1BCH`.
Path references grant no private-file or execution access.

After that gate, the reviewed Main532 journey plan/index and these five
delivery notes were incorporated. No runtime, test, dependency or asset
body changes after the tested freeze. Final Source reports compare the
complete 31-path P3 scope against actual Main532, with two report bindings
for the shared MCP guide. The final tree carries the Main plan exactly;
all tested runtime/test leaves remain exact. No gate is repeated for the
document-only successor. The original failed Judge gates remain failed,
with their cause and broader gate stability unresolved. This new passing
P3 run does not rewrite them or satisfy operational/root acceptance.

Fresh Source commissions preserve every original P3 condition and evidence.
The earlier pre-plan commissions were normally retired after the new
promises became effective. Complete independent exact-head review remains
required; no approval is inferred from this gate. Hugh has directly
approved repository pushes. Reviewed landing may proceed after exact-head
approval. Planner may deploy to Cloudflare as needed; no provider or
deployment action is part of this delivery.
