# Stale refusal rehearsal delivery

Request `3f08557547c4df666e44f150fe8d0209d43c8af9`, amended by
`b861b235`. Source composition: `8aa545de532e4454578b96e38e3b5f2baa6ca9cb`,
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
compiler. Its default witnesses use an explicitly labelled injected clock
to distinguish the refusal duration from the whole shot duration.

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
gate green.

The earlier control changed only the stale proposal's base to the fresh
head and failed by assertion. That proof predates the chronology correction
and is retained as historical evidence, not a control of the composed head.
Original failures and corrected runs remain separate. No check was repeated
for this note.

Local evidence remains outside the repository:

- `artroom-diagnostics/stale-base-source/public-result.json`
- `artroom-diagnostics/stale-base-chronology/public-result.json`
- `artroom-diagnostics/stale-refusal-timing/public-result.json`

## Remaining work

Checker review, explicit acceptance of the original failed gate with its
phase completion, and an isolated hosted rehearsal remain owed. Actual
counts and elapsed time must come from that
recorded run. The full same-lane manifest successor remains separate work
under Plan 029 and is not satisfied by this fresh-lane freeze route.
