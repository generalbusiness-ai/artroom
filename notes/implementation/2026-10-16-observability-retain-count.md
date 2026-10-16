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

The detailed slot map and limits are in [operations.md](../../docs/operations.md).

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

The one complete gate at frozen implementation head
`63bb3eada28f9b2df32b0e4ca8a06a9155530eb1`, tree
`1ce69c333f58491b754285802f65424d65bec7ce`, passed. Original session
62481 closed with exit 0: 1,464 Vitest tests passed, 3 skipped, 16 Node
checks and 55 Counting checks passed. Dependency installation passed in
3.4 seconds, whitespace passed, workspace typechecks passed in 10.4
seconds, and tests passed in 283.1 seconds. No suite or gate was repeated.
The original output retains scripted reset, injected retention-fault and
Vitest timeout-cancellation diagnostics; the terminal result is exit 0.
Their presence does not establish a new production failure or diagnose
the earlier D1 gate failures.

At the original reviewed head `4cc96825`, only this reporting note changed
after that frozen gate. All other tracked blobs and modes matched it.
Raw output remains at `/tmp/artroom-observability-63bb3ead-gate.log` and
its gate-owned temporary directory. Those raw paths are not an access
grant. A separately named finite public JSON summary will be the sole
execution-evidence grant for the checker.

The implementation was composed with reviewed D1 Main `5caa62f3` and
the planner's MVP plan Main `3267fbbe`. Existing defaults and every older
platform pin remain. The Source configuration was prepared only; no
Cloudflare release, binding, secret or provider operation occurred.

## Closed async context correction

The checker found that a delayed `Operations.#answer` callback retains
its original AsyncLocalStorage store after the invocation finishes. The
old `operational()` lookup treated that store as active. `Turns.run`
therefore used a closed collector, which silently discarded the metric.
The original passing gate and out-of-context T19 witness did not detect
this inherited-context case.

The correction admits an operational context only while its shared
invocation has users. Native work under a closed context gets the
existing independent dispatch measurement. The closed request identity
is not reused. Native ordering, answers and provider retry rules remain
unchanged.

The new native operations witness lets the production answer callback
register under the original dispatch context. Its 10 ms fixture deadline
closes that invocation, then the original delayed send answer arrives.
The real SQLite turn records `unknown at 2`, then `confirmed at 3`, with
one provider send and a fresh dispatch turn metric. The opening entry,
operation-owner rules and outside provider are the existing labelled
stand-ins. This is local runtime evidence, not a hosted provider check.

The focused baseline passes. Replacing the lifecycle-aware lookup with
the old store lookup fails the metric assertion while the same native
outcome still commits. The control distinguishes this fault. Scope
typechecking passes. The first fixture run expected `alarm` for the
original place; the actual operations driver uses `dispatch`, and that
oracle was corrected. No timeout or native guard changed.

This implementation correction is beyond the original gate's tree.
Its one complete successor gate passed at frozen implementation
`e90e1599b297adaa6328bb3bed64324a87efd31d`, tree
`d969af6fee4552c7ae865668dc2d07e38972ad7d`. Original session 54307
closed with exit 0: 1,465 Vitest tests passed, 3 skipped, 16 Node checks
and 55 Counting checks passed. Dependency installation passed in 2.2
seconds, whitespace passed, typechecking passed in 7.7 seconds, and tests
passed in 217.8 seconds with 305.1 CPU seconds. This gate followed the
implementation correction. No complete suite was repeated at this head.

Only this note changes after the frozen successor gate. All 1,397 other
tracked blobs and modes must match it. Original output is retained in
`/tmp/artroom-observability-e90e1599-gate.log` and the gate-owned temporary
directory. Those paths grant no raw-file access. The exact successor
review will grant one separately pinned public JSON summary. The
scripted fault and cancellation diagnostics remain qualified as in the
original passing gate. Exact-head review and normal landing remain owed.
