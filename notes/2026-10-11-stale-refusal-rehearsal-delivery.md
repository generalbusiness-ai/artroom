# Stale refusal rehearsal delivery

Bounded child `c151104fdedd8d2e3a3777908825fc4a95199080`, promised by
`c40356ac6fcc3d0f821f5b41ec2e4dd771b4fb9d`, delivers the freeze route below.
Parent request `3f08557547c4df666e44f150fe8d0209d43c8af9` and its original
promise remain open. The parent amendment is `b861b235`. Source composition: `8aa545de532e4454578b96e38e3b5f2baa6ca9cb`,
including landed Page branding from main `3d400d49`.

The rehearsal admits two changes on the same published base before the
winner publishes. The second merge then returns `out-of-date`. The same
proposer opens a distinct change on the fresh head and publishes it. The
refused change remains recorded. This route uses the existing CLI and
native policy. It adds no same-lane replacement rule.

The default sequence has 27 shots and verifies 14 scopes. The optional
manifest sequence has 32 shots and verifies 16 scopes. Capture references
include both the stale change and its fresh replacement.

`Taken.staleRefusal` records elapsed milliseconds only around the stale
`command(ctx, ["merge", stale])` invocation through its expected refusal.
Production uses `performance.now()`. The result and transcript label the
clock method, date, service, and Git host. Elapsed time includes CLI work
and round-trip waiting. It excludes the fresh proposal and publication.
The measurement is local to the runner, not server-only latency or a native
history fact. No live refusal time, hold count, or publication count has
been observed for this route.

## Existing evidence

The chronology correction passed all four native witnesses across the two
host stand-ins. One recorder remained skipped. The owning scripts compiler
passed. The timing change also passed these four witnesses and its owning
compiler. Its default witnesses use an explicitly labelled injected clock to check
read count, recording, and labels. Their constant clock steps alone do not
prove that fresh work stays outside the interval.

These runs use real native scopes, with Git hosting, local Git, and the
scheduler as labelled stand-ins. Both used the exact Page asset composition
and restored the original bytes afterward. They do not prove a hosted run.
The original gate at `932b1a01` skipped installation and passed whitespace,
then failed typecheck on five index-signature accesses in the native witness.
Its test phase did not run. That original failed result remains unchanged:
`stale-composed-gate-one/public-result.json`, SHA256
`534676eef808e46d7330537161f47d64874e38cfc42f82977fb339cc9d9219b9`.

Commit `dbf88cfb` changed only those five accesses to bracket notation.
One full compiler run then passed. The previously unrun test phase passed:
1,028 Vitest cases, with two skips, followed by eight repository Node checks
and 39 browser Node checks. No focused cases or gate were repeated.
Completion evidence: `stale-composed-gate-completion-one/public-result.json`,
SHA256 `b7fa1b91059171dd614088746e135ccaef0d9c7c653ce32f8b18c9087b9c6687`.
This completes the failed and unrun phases. It does not make the original
gate green. Checker decision `c99590a2` accepts that phase completion but
requests stronger runner evidence. That decision is not final approval.

The earlier control changed only the stale proposal's base to the fresh
head and failed by assertion. That proof predates the chronology correction
and is retained as historical evidence, not a control of the composed head.
Original failures and corrected runs remain separate. No check was repeated
for this note.

## Successor runner evidence

Commit `35753cd0` exports the two existing composite helpers and `Found`.
Their production judgments, read handling, and mutation order are unchanged.
Two Node witnesses use explicitly scripted CLI commands, read sessions,
entries, and summaries. One checks that malformed or unknown preparation
answers stop before the next mutation. The other checks refusal and
replacement answers, with separate clock advances for stale and fresh work.
The native chronology witness remains unchanged.

The first successor compiler run passed the scripts closure, then failed
on the scripted fixture's `kind: string` type. Its Node body did not run.
Proof SHA256: `add830116171fa6db4586a2d5c26e43821473a0b35dadda7c08f140fec5f5465`.
Commit `0e76e2bee` corrects only that fixture type to `ScopeRef["kind"]`.
The failed compiler then passed, followed by the two previously unrun Node
witnesses. The unchanged scripts compiler was not repeated. Completion proof
SHA256: `1d43ae87f09af060dad01dc9d417d272839dfafdcaee2dff8714b9f33abe3b18`.

Two compiled controls at `0e76e2bee` distinguish the intended faults. All
four mutant compiler stages passed. Bypassing the preparation result and
stale-refusal gates failed the named no-next-mutation assertions at lines
84 and 114. Moving the timer endpoint past fresh edit work failed the
named timing assertion at line 119: 1,250 ms instead of 250 ms. Both bodies
failed by assertion, and the isolated source was restored exactly.
Control proof SHA256: `2834ee0aefb4c663338327649541153de4b1033c12a811b09aaa781493bc2dd2`.

These are two coherent runner controls, not a proof for every individual
predicate. Scripted answers establish runner stopping and timing behavior.
They establish no native authority, provider behavior, or hosted latency.
Original failures and their completion remain separate. No old control,
whole suite, or gate was repeated for the successor or this note.

Local evidence remains outside the repository:

- `artroom-diagnostics/stale-base-source/public-result.json`
- `artroom-diagnostics/stale-base-chronology/public-result.json`
- `artroom-diagnostics/stale-refusal-timing/public-result.json`

## Remaining work

Checker review and an isolated hosted rehearsal remain owed. The hosted
expected lines and elapsed time remain unobserved and must precede final
child approval and landing. Actual counts must come from that recorded run.
The full same-lane manifest successor remains separate work under Plan 029.
This bounded child does not satisfy or close the parent request and promise.
