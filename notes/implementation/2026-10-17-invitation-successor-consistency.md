# Keep invitation declarations consistent

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
