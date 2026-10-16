# Retain native metrics and operational request correlation

This is the first implementation head of the approved observability
plan: retain and count, under child `d2a8b9cf` and promise `f0bb908b`.
It prepares source configuration and instruments the existing runtime.
It makes no Cloudflare change. Status aggregation, health endpoints,
operator CLI and MCP displays, deployment checks and a measured service
capacity envelope remain later work.

## What changes

The room configuration prepares retained console diagnoses at full head
sampling, with platform invocation logs disabled. It names the
`artroom_metrics_v1` Analytics Engine dataset and Worker version metadata.
Existing deployment settings, bindings and secrets require their own
release authorization. No upload, deployment or provider mutation ran.

The metrics-v1 collector checks nine blobs and six doubles, buffers at
most 64 turn groups and reserves one of the platform's 250 points per
invocation for its loss summary. Identical groups accumulate without
losing resolution. Coarsening merges reason, then public answer, then
place. Native ends never merge across kinds. Counter overflow saturates
and counts as critical loss. Invalid values are dropped and counted;
caller text is never truncated into a valid metric value.

Native `Turns.run` marks actual entry and emits every normal return,
including the early missing-definition exit. Its native end stays apart
from the public answer. Timed attempts and actual timed entries have
separate counts. An independent late outside-operation callback gets
its own dispatch context. Internal boolean diagnosis answers have no
public answer. The accumulator writes turn rows before routes and other
kinds, then one summary. A throwing, absent or unresolved metric sink
never owns a native result.

The server uses invocation-local context through AsyncLocalStorage under
the existing `nodejs_compat` flag. Its Node types use the already pinned
26.6.3 version. The lockfile adds that existing development dependency
to scope; it changes no package version. Consumers that typecheck scope
source include Node types. No runtime telemetry SDK was added.

HTTP ingress alone selects `found`, `acts` and `preparations`. Direct
object, ScopeService and MCP-backed public calls use separate `rpc:`
places. This follows technical advice `6659d286`; it prevents extra RPC
turns from masking lost HTTP turns in the later coverage check. An
actual native entry mark travels beside the unchanged result. Missing
metadata enters the existing critical-loss path and never proves a
pre-turn answer. A concurrent call cannot borrow another ingress mark.

Every HTTP response adds a fresh server request ID. Exact lowercase
version 00 trace context is validated separately, with nonzero IDs and
only the sampled flag retained. No tracestate is retained or echoed.
These IDs are untrusted correlation, not an identity or authority.

After a native entry transaction or outbox attempt write, a separate
best-effort sidecar records correlation. It performs complete indexed
seven-day expiry before each write, retains at most 4,096 rows and only
then evicts the oldest retained row if full. Reads exclude expired rows
without relying on another write. No native entry, hash, outbox message,
transport envelope, public answer type or replay format changes.

The `requests` read accepts exactly one request or trace selector,
returns at most 100 newest rows, and states the native head, retained
window and pagination. Invalid selectors reach no namespace or SQL.
New admin sessions have the permission. Members and correctly signed
older admin sessions without that claim remain refused. Its `complete`
means the retained operational window, not proof of request settlement.

The detailed slot map and limits are in [operations.md](../docs/operations.md).

## Evidence boundaries

The collector witnesses exercise all ten kinds, native end separation,
closed values, mixed losses, the 65th group, further answer/place merges,
saturation, multiplicity and flag sums, one terminal summary and priority
within the point cap. They also prove diagnosis correlation never reads a
provider error's message and maps a dynamic step to `other`.

The paired native witness uses two real SQLite namespaces with the same
logical desk and ticket scopes, signed inputs and deterministic test
incarnations. It compares answers, entries, outbox rows, delivered
messages and replies, before and after restart, with the metric sink
recording, throwing or unresolved, and with SQL faults specifically at
the entry and duty sidecar boundaries. Clock, authority, readers and
incarnation randomness are labelled test ports. These are derive's
made-up definitions, not a real platform factory or provider proof.

The alarm witness admits 251 real request acts, then runs the actual
alarm, dispatcher and diagnosis turns against scripted routing refusals.
It compares every entry and outbox row and every sent envelope between
paired namespaces. All 251 internal answer ends and wrote flags remain
recoverable inside the 250-point cap. These identical native groups lose
no resolution, so the summary correctly reports zero group loss. The
separate collector witness forces cross-group coarsening and mixed loss;
it does not invent unreachable public answers inside this native alarm.

A real HTTP founding proves the server-owned native mark and sidecar
correlation. An actual direct act records its distinct RPC place. The
three Worker early-answer sites record pre-turn only when no turn ran.
The missing-metadata and concurrent-ingress test uses an explicitly
labelled RPC protocol stand-in. Actual native turn entry is witnessed
separately. No rendered UI or end-to-end deployed claim is made.

Existing native session, join-limit, signed-read, operator and late-outcome
witnesses also check the corresponding metric outputs. The session test
uses real session claims and authentication; its old-token control has a
valid MAC over the old permission set. The pure sidecar SQLite witnesses
cover a backlog of 500 expired rows, full capacity, all 4,096 rows over
41 pages, time ordering, read exclusion without writes and invalid query
admission with zero SQL calls.

The optional sink cannot attest to a lost terminal row or a lost
route/turn pair. Sampled metrics and coarsened places cannot establish
exact HTTP coverage. No claim of no busy turns, a live provider latency
or the later deployment gate follows from these tests.

## Validation

Focused boundary/regression run: 52 tests pass across nine files. The
native paired fixture, alarm pressure and missing-definition witnesses
pass. The existing late-outcome T19 passes with measurement outside any
HTTP/RPC context. Scope source and test typechecks pass.

New-fixture failures are retained: an invalid founding kind, a
noncanonical made-up peer reference and an incorrect extra index-send
expectation were corrected. An index-signature access and an optional
method annotation were corrected for typechecking. The earlier sidecar
ordering expectation was corrected to compare parsed timestamps. No
existing native guard or timeout was relaxed. No mutation sweep ran.

The one complete gate at the frozen implementation head is pending.
Its original completion, counts and qualifications will be appended
before review; this sentence is not a passing-gate claim.
