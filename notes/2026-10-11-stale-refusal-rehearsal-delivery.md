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
The composed head has not yet run its gate.

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

One gate on the composed candidate, full review, and an isolated hosted
rehearsal remain owed. Actual counts and elapsed time must come from that
recorded run. The full same-lane manifest successor remains separate work
under Plan 029 and is not satisfied by this fresh-lane freeze route.
