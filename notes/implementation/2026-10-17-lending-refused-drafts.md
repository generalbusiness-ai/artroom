# Lending drafts, confirmed handles and recovery wording

## Current Source

Source request `1203d65d`, promise `e9bcb9a8`, renews
the complete original scope on actual Judge Main
`02a9180357171ad2d15d3dd9e44b1fe8833f3492`, tree `b43a07d1`.
The older Source IDs, dependency waits and gate results below describe
earlier preparation checkpoints. All original attempts remain recorded.

## Earlier preparation

Current Source child `1665d183`, promise `60a826a4`, combines the four
nonblocking P3 findings under `6bfce701` / `9253b465`. It starts from Main
`55e1970a5`. The draft-only child `a6cd648c` / `a2db9f95` produced local
checkpoint `a53744bc`; `c0218075` retires that narrower request toward
the combined outcome before any Source artifact or full gate. The
combined request `57878f81` / `8f268c82` then produced checkpoint
`0d1f382b8`; `8234904a` continues it under the current request, changing
only the local-validation sequence. All original attempts remain.

Archive remains priority 1 for review and landing. During that review,
an exact local composition of archive `c811785ea`, this Lending slice
and invitation slice `8c98c1f73` can receive one frozen integration gate.
This is validation, not approval of an unreviewed dependency. Source
filing and normal landing still wait for archive approval/landing and
exact Main correspondence. A code change from review requires a fresh
implementation freeze and check.

The renderer previously cleared donation and cancellation inputs after
both a recorded act and a refusal. It also cleared a cancellation reason
after unrelated recorded acts, including publication. A person could lose
the text needed to correct a refusal, or a draft they had not submitted.

The renderer now clears only fields consumed by a recorded act: donation
name and description after donation, or the reason after cancellation.
Refused and unknown outcomes preserve drafts. Publication, borrowing and
returning consume neither form. Native authority, staff controls, request
custody and epoch fencing are unchanged.

Post-join discovery now reads this device's active key and member from
authenticated membership before returning an identity. The response must
be complete, bind the full membership scope/incarnation and pin the
current application membership version. Missing, contradictory or
ambiguous key/member rows do not confirm a handle. The renderer stores
the confirmed handle and states confirmation only after discovery.
Existing stored identities and original pending-request bindings are not
migrated or rebound by this change.

The README and demo script distinguish local scripted renderer checks
from the retained hosted runs. Check documentation now says that it
submits no new lending or join act. Its reads may sign and send
read-session authentication. The custody check, act submission and retry
rules are unchanged.

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

The extended rendered witness then reproduced stale handle display in
both viewports (`86493`, exit 1, fourteen passes and two assertion
failures). A scripted discovery returned `@confirmed`, but the renderer
stored and displayed `@advertised`. After the presentation correction,
all sixteen checks passed (`59518`, exit 0), including unavailable
membership without handle confirmation. The final handle screenshots
were inspected at both viewport sizes. These ports remain stand-ins;
the authentication data source is checked separately below.

The existing real Scope/SQLite Lending scenario was strengthened with a
conflicting advertised handle after a native join. Before the discovery
repair it failed (`85371`, exit 1): the identity said `@not-visitor` when
the device's actual authenticated member was `@visitor`. The repaired
scenario passed (`24924`, exit 0); after the final membership-version
guard it passed again (`16336`, exit 0). It also continues through the
visitor's native donation. Scope, membership, sessions, WebCrypto and
SQLite are real; the scenario's existing Git host and clock remain
labelled stand-ins. It proves no hosted provider behavior.

Browser typechecking and the existing model/custody focus passed
(`84451`, exit 0): nine tests in two files. The existing-lock offline
install (`44183`) exited zero without manifest or lock changes. The owned
asset generator ran; all three disk assets and the Worker module
reproduce exactly. Among the generated assets, only JavaScript and the
Worker module differ.

The new membership projection's first test compilation rejected two
attempts to mutate readonly fixture data. Immutable replacement fixtures
fix those errors. Browser types and all nine model/custody cases then
passed (`70081`, exit 0), including missing-key, contradictory handle and
ambiguous-key observations. Final browser and Scope test typechecks
also passed. The owned assets were regenerated after the final changes.

Original records are retained outside the checkout:

- `/tmp/artroom-lending-refused-drafts-original-browser.log`
- `/tmp/artroom-lending-refused-drafts-matched-original-browser.log`
- `/tmp/artroom-lending-refused-drafts-repaired-browser.log`
- `/tmp/artroom-lending-refused-drafts-matched-original/report.json`
- `/tmp/artroom-lending-refused-drafts-repaired/report.json`
- `/tmp/artroom-lending-refused-drafts-model-custody-focus.log`
- `/tmp/artroom-lending-refused-drafts-types.log`
- `/tmp/artroom-lending-p3-original-handle-browser.log`
- `/tmp/artroom-lending-p3-repaired-handle-browser.log`
- `/tmp/artroom-lending-p3-native-original-focus.log`
- `/tmp/artroom-lending-p3-membership-native-focus.log`
- `/tmp/artroom-lending-p3-membership-version-focus.log`
- `/tmp/artroom-lending-p3-membership-types.log`
- `/tmp/artroom-lending-p3-membership-fixtures-types.log`
- `/tmp/artroom-lending-p3-membership-fixtures-model-focus.log`

These references grant no external-file or execution access. A later
Source review will receive its own finite, exact evidence grant. All four
P3 outcomes still owe exact reviewed landing. All six hosted outputs remain
untouched; no provider operation, deployment or publication ran.

## Frozen integration gate

Original gate `24299` completed at clean commit
`5375fb16bafa658be91b7dba316ae519a6b2a8c6`, tree
`10c77db40030c9b7533b5722c5f3fbdd2a4c7bbf`, and exited zero. Its exact
composition contains archive `c811785ea`, Lending `1d2a6cfde` and invitation
`8c98c1f73`: all thirteen, eleven and six respective path leaves retain
their original mode and blob. There are thirty changed paths against
Main `55e1970a5`, with no additional source changes.

The gate passed whitespace and type checks, 1,562 Vitest tests with three
skips, sixteen Node tests and fifty-five Counting tests. The existing-lock
install took 2.2 seconds, types 7.4 seconds and tests 444.9 seconds.
The original owner terminal is `b7fe0f`, exit 0. Its wrapper log is
`/tmp/artroom-p3-integration-5375-gate.log`; step logs are in
`/var/folders/2x/wylr59t17ds36l1l7ng25y7w0000gn/T/tmp.DHl3BJJKqb`.

This is the one frozen integration gate for both P3 slices. This note and
the invitation note record its result without changing implementation
bytes. It does not replace archive's original gate `79043`, approve an
unreviewed dependency or permit P3 Source filing before archive's reviewed
landing. Exact correspondence with landed Main and independent Source
approval remain required. These paths grant no raw-log or execution access.

Archive self-audit subsequently reproduced acceptance of an unexpected
empty directory in the immediate parent, in both Git formats. Finding
`bdcf6890` and withdrawal `24704f32` hold the old `c811785ea` Source.
The local integration now includes repair `83eb65d9c`. The earlier gate
`24299` remains evidence of its original composition only. A new frozen
integration gate is required for this changed dependency; no P3 Source
filing or landing can precede archive's independent approval and landing.

### Replacement integration gate

Original gate `27928` ran once at clean commit
`d0a4449313db0bb174c1ec780e73c1a0851872c3`, tree
`f693053c4e2c40c057337bb8612d36640cd739a5`, and exited zero. The owner
terminal is `863b1f`. The dependency view already matched the unchanged
lock, so installation was skipped. Whitespace took 0.0 seconds elapsed
and 0.0 CPU; types 7.2 and 26.4; tests 439.1 and 552.3. All 1,563 Vitest
tests passed, with three skips; sixteen Node and fifty-five Counting
tests passed. The wrapper log is
`/tmp/artroom-p3-integration-d0a44493-gate.log`; step logs are under
`/var/folders/2x/wylr59t17ds36l1l7ng25y7w0000gn/T/tmp.77Mz0xZC3i`.

This was macOS 27.0.1 on arm64 with eighteen logical CPUs. Before the
gate, load averages were 1.37, 1.67 and 1.62; the verified-lock stamp
matched. These observations establish no load cause. After completion,
archive's gate-result note from `6d1a1973d` was composed and these two P3
notes record the integration result. Only those three notes may differ
from the passing freeze; all other 1,451 mode/type/blob leaves must match.
Archive's exact review `17dad8da` and finite grant `6e2b59c7` remain
separate. P3 Source filing still waits for its reviewed landing and exact
Main correspondence. No approval or external-file access follows from
this gate record.

### Composition with the CLI runbook follow-up

The independent seven-path CLI/runbook follow-up `03b4ff8a` / `527d0f9b`
was then composed from checkpoint `4e8cd9b1b`. It changes recovery guidance,
runtime documentation and resolver fixtures, with no Lending or invitation
implementation change. All prior composition leaves outside its seven
paths, including all thirteen archive `6d1a1973d` leaves, remain exact.
The composed Page producer ran and its tracked output remained unchanged.

Original gate `51005` ran once at clean commit
`af623e49df8c933ade6dc64c3179fc69c1fae108`, tree
`cfb51d86e2c68b1a68342d7177cf1593ba0f0d60`, and exited zero. Owner
terminal `dd35b4` records completion. Installation was skipped with a
matching verified-lock stamp; whitespace took 0.0 seconds elapsed and
0.0 CPU, types 7.2 and 26.0, tests 446.9 and 557.6. All 1,563 Vitest
tests passed with three skips; sixteen Node and fifty-five Counting
tests passed. On macOS 27.0.1 arm64, eighteen logical CPUs, observed
pre-gate load was 1.29, 1.33 and 1.46. These are not load-cause claims.
The wrapper log is `/tmp/artroom-p3-cli-composed-gate.log`; step logs are
under `/var/folders/2x/wylr59t17ds36l1l7ng25y7w0000gn/T/tmp.dOBREjOuyF`.

This final update changes only the three P3 notes. All 1,452 other
mode/type/blob leaves must remain exact to that passing freeze. Archive's
candidate, grant and independent review remain unchanged. P3 Source
filing and landing still wait for archive approval/landing, exact Main
correspondence and independent exact-head review. Log references grant
no external-file or execution access.

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
GitHub egress waits for the pending direct destination approval.
