# Bound MCP continuation hints

## Current Source

Source request `51bde8e4`, promise `a63eef4e`, renews
the complete original scope on actual Main
`532b1d0d00e05f32cb5e454a0e838b447bff0b12`, tree `c802c528`.
That Main preserves the reviewed Judge and adds the reviewed journey plan.
The older Source IDs, dependency waits and gate results below describe
earlier preparation checkpoints. All original attempts remain recorded.

## Earlier preparation

Root request `0adb22dd` / promise `8e69bb20` is delivered through Source
child `4f37b980` / promise `9379959b`, based on Main `55e1970a5`. This is
the separately tracked nonblocking cache follow-up. Archive exact review
`17dad8da` remains first. Source filing and landing wait for archive's
independent approval/landing, exact Main correspondence and normal review.

## Behavior

The two process-local caches each retain at most sixty-four recent hints.
A lookup makes a key recent; insertion evicts the oldest key at the bound.
The internal helper has no package export, configurable capacity or public
diagnostic interface. It retains entry positions or page cursors, never
tool answers, credentials or authority. This is an entry-count bound, not
a measured bound on process heap. Eviction can cause repeated bounded
reads; it provides no guarantee that cold progress survives heavy churn.

Entry searches bind to the service and the immutable opening entry's full
scope, position and hash. A later append therefore preserves progress.
Final-page hints bind to the service, full scope, observed head and query,
including the requested item and states. A different query or head starts
at the first page. If the head moves between summary and final-item reads,
the poll returns no item and a later poll reads again. It cannot report a
page's item under another read's head.

The existing sixteen-entry and four-page per-poll bounds, wait/credential
answer categories, authority checks, custody and one-time credential
behavior are unchanged. Recovery wording explains that eviction restarts
the bounded search. No tool schema, native declaration, version, default,
public export, manifest, lock or hosted output changes.

## Focused evidence

The first two-case focus (`25140`, exit 1) was started before the offline
install (`13279`, exit 0) returned. It is retained as a preliminary attempt,
not the stable original defect witness. The prescribed pool compatibility
step then ran (`2d42ee`, exit 0): it reported `copied:false`, before hash
`8d3d115037c749cce1e8cb26bc70ba08e215aaaa357e4eae9f0c1577277c5855`
and after hash
`cd50d18adce92adb54a3f00410d646b2fe09b3f12c5b833c492bcf5857621b39`.
It was not an unchanged dependency-view claim.

With dependency setup complete, stable original focus `17762` exited 1
with two assertion failures and seventeen unselected cases. After another
query had advanced the shared cursor, waiting for a first-page item timed
out instead of returning that item. After the head advanced, the service
sent the old cursor `8` instead of a first-page request. A separate original
case (`8d7142`, exit 1, one assertion failure) changed the head between the
summary and item read: the old service returned an item labelled with the
earlier head instead of waiting for a consistent observation.

These are actual MCP service calls over the existing labelled in-memory
HTTP stand-in. Native judgment, SQLite and provider behavior are not
proved. The stand-in's cursor is an offset; the head-boundary witness
observes the actual outgoing cursor, without pretending that this fixture
implements Native cursor validation.

The repaired public-call cases passed. The first combined focus (`77400`,
exit 1) also exposed an incorrect final expectation in the new pure cache
test: after its lookups, key 4 was oldest and correctly evicted. Correcting
that expectation and making the expected capacity an independent literal
sixty-four produced five passes (`7f5797`, exit 0).

Two focused controls passed and restored the helper. Removing eviction
(`e06303`, exit 0) changed the expected oldest-key miss to a retained
value: baseline one pass, mutant one assertion failure. Removing lookup
refresh (`c7c832`, exit 0) failed the recently-used-key assertion in the
same way; the wrapper verified exact source SHA256 restoration
`2fa513de33f6f79238c57ef48331b8cd7ea2db83f239b75f43eaeddc6c2a8c41`.
No mutation sweep or whole suite was run for these controls.

Final MCP source/test/Scope-test typechecks passed (`05dc53`, exit 0).
The complete affected budget/cache focus (`94929`, exit 0, owner terminal
`77afad`) passed twenty cases with one existing skip. It preserves the
long-history and one-time credential witnesses; the long search now also
advances the native-looking head between calls and still avoids repeated
search entries. The same-head query, fresh-head request and mid-read head
change cases pass. The owned Page producer (`cdcd76`, exit 0) ran and its
tracked asset module remained byte-for-byte equal to Main.

Original owner logs use `/tmp/artroom-mcp-cache-bound-` followed by
`install.log`, `pool-compat.log`, `original-pages.log`,
`stable-original-pages.log`, `original-mixed-head.log`, `types.log`,
`repaired-focus.log`, `corrected-focus.log`, `eviction-control.log`,
`recency-control.log`, `complete-affected-focus.log`, `final-types.log`,
`final-affected-focus.log` and `owned-page-assets.log`.

These references grant no external-file, helper or execution access. The
focused checkpoint preceded the composition gate below. Independent Source
approval and landing remain owed. No provider operation, deployment,
publication or dependency addition is claimed.

## Frozen composition gate

The six-path cache checkpoint `e50f920d4` was composed with prior passing
P3 successor `e0aba034c`. Every prior leaf outside those six paths remained
exact. The owned Page producer ran in that composition and added no tracked
output change. Against Main `55e1970a5`, the union has exactly forty-three
changed paths and 1,458 tracked leaves.

Original gate `49806` ran once at clean implementation freeze
`52c1a0fc1e44a604977a95698c8014cf0ab04b7d`, tree
`409b91640dd326d867e2a329be5ffe99b3f72358`, and exited zero. Owner terminal
`e291ce` records completion. Installation was skipped with a matching
verified-lock stamp; whitespace took 0.0 seconds elapsed and 0.0 CPU,
types 7.1 and 26.6, tests 445.5 and 556.9. All 1,567 Vitest tests passed
with three skips; sixteen Node and fifty-five Counting cases passed.
The original wrapper is `/tmp/artroom-p3-mcp-composed-gate.log`; step logs
are under `/var/folders/2x/wylr59t17ds36l1l7ng25y7w0000gn/T/tmp.btEhguDtAA`.

This was macOS 27.0.1 arm64 with eighteen logical CPUs and observed
pre-gate load 0.97, 1.14 and 1.26. These observations establish no load
cause. The unchanged lock SHA256 is
`a3dd5689f33c5181b5ff48553fbb3c45b44abf96720ba9935eed40853a3b09bc`.

The final result update changes only the four P3 notes. Source preparation
must verify all 1,454 other mode/type/blob leaves against the passing
freeze. All thirteen archive `6d1a1973d` leaves remain exact; its grant and
review `17dad8da` are unchanged. No repeated gate is needed for the
notes-only successor. Archive approval/landing, exact Main correspondence
and independent P3 review remain prerequisites to Source filing and landing.
These paths grant no raw-log, helper, adjacent-file or execution access.


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
required; no approval is inferred from this gate. Direct GitHub destination
approval is still pending, so no further push or automatic-push landing
is performed. No provider or deployment action is part of this delivery.
