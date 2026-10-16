# Read operational status and public health

This is the second approved observability stage, under Source child
`1faf0c5b` and promise `ded09cb2`. It depends on the retain/count Source
and incorporates the prepared closed-context correction `e90e1599`.
The first Source review is still pending. No landing, deployment or
provider operation is claimed here.

## Status

`dap status` obtains a fresh room session and starts from the configured
room scopes. It follows confirmed references and recorded creation sends,
with at most 1,000 scopes and 20 history pages per scope. A scope argument
selects one scope without discovery. Summary, outbox, waiting, incident
and correlation reads keep their own native heads. There is no room
snapshot or complete-inventory claim.

Outbox counts distinguish requests without a result from diagnosed
sends. Admin sessions also read both waiting lists and incidents. Members
see those columns as denied. Each list has a 20-page bound. A limit gives
`more; partial`; refusals, transport failures, head drift and nonprogress
keep denied or unknown states instead of counts. A partial summary keeps
its label. Operational rows can change without a native entry.

The command makes no correlation read unless `--request` names exactly
16 lowercase hexadecimal characters. The admin read preserves the retained
window, entry and duty references. A window change between pages gives
unknown. Status requires a session rather than falling back to signed
entry reads. It exits 0 when it produces the report, even if some columns
are partial or unknown; session failure exits 1.

The client adds typed operational reads outside `ScopeApi`, through the
existing HTTP transport. They share its raw reply byte cap, abort deadline,
credential header and response validation. Invalid request selectors and
cursors fail before I/O. A reply for another request ID is rejected.
The native API, signed answers and authority rules remain unchanged.

## Health

`GET /health` and `HEAD /health` accept no query or body. The four public
fields are deployment, version, session configuration status and register
readiness. Existing validated GitHub or Artifacts settings supply the
register selector. Different configured selectors give ambiguous; no
valid selector gives unconfigured. Health exposes no scope ID, head,
data or credential.

The internal Durable Object probe reads scope metadata. An active
register is ready. Uncreated, other valid metadata, malformed metadata
and errors retain their closed states. No provider request, public scope
read, native turn or authority decision is added. Health is 200 only
when sessions are configured and the register is ready, otherwise 503.

A caller waits at most two seconds. One physical probe per isolate stays
reserved until the actual RPC settles, including after caller timeout.
Concurrent callers share it. The result is cached for five seconds from
settlement. The health route is wired through both production Worker
entrypoints; the scope test Worker delegates to the production root.

## Evidence

The health tests cover closed configuration answers, selectors, request
admission, HEAD and the production root route. Actual native SQLite
metadata covers absent and active register and non-register states.
Provisional, refused and malformed metadata are explicit SQL fixtures,
and entry history is compared before and after. The concurrency witness
uses labelled RPC, clock and deadline ports: 50 callers share one probe,
ten later timeouts keep it, then release and the cache boundary are
observed without sleeps. It does not prove provider latency.

The health control releases the physical probe on caller timeout. The
focused baseline passes, and the control fails with ten calls where one
is required. It distinguishes the invariant. The initial root-route test
returned 404 because the test Worker bypassed the production root; its
delegation was corrected. Scope typechecking and the five health/routes
tests pass.

Two client protocol witnesses retain heads, partial pages and refusals,
reject malformed envelopes and mismatched requests, refuse invalid input
before I/O, and cancel an oversized reply before decoding. These are HTTP
protocol stand-ins. The response-guard control distinguishes the malformed
reply invariant. Its first run was classified inconclusive because the
control helper treats Vitest's rejected-promise expectation error as a
thrown error. The same witness now asserts the observed rejection as a
boolean; the control fails that assertion. Both results are retained.

Two scripted CLI read-port witnesses cover per-column heads, member
denials, failures without provider text, explicit correlation access,
partial summaries, page bounds, repeated cursors and head drift. They do
not stand for native authority or factory creation.

The existing native CLI story runs the actual commands, session signing,
membership authority, SQLite scopes and HTTP routes. It reads admin and
member status, discovers at least seven scopes, leaves one authentic
inbox creation unanswered, and reads that pending request. A production
operator record stores a labelled fixture incident about the actual entry,
which status reads back. The story captures the server's actual request
ID from that admitted act. Status without the flag makes zero correlation
reads; the flagged admin read returns the actual entry correlation row.
Its host, clock, config storage and scheduler remain the existing labelled
stand-ins. No hosted journey or provider failure is claimed. The latest
focused story passes.

The first CLI test invocation used `npm test -w @generalbusiness/dap-cli
-- test/status.test.ts`. That script also invokes Node's test runner, so
the added Vitest path reached the wrong runner. Its Vitest phase passed
39 tests and Node config checks passed three cases, but the wrapper failed
on the extra path. The corrected direct pinned Vitest invocation passes
the two focused status tests. A later command used the package-relative
binary from the repository root and exited before starting tests; its
corrected package-directory invocation passed. No complete CLI suite was
repeated, no timeout was widened, and no package was installed for a probe.

An initial typecheck used the obsolete CLI workspace name and did not
run. Corrected client, CLI and scope typechecks pass. The whole workspace
typecheck completed without errors before the latest witness and inherited
context correction. Its result is not a substitute for the final gate.

The first frozen gate at `745c6264b14fb99e93bce3ffe567fe2ffd76307a`,
tree `03fc20d901632b33e483438600af4e9707fd5752`, failed. Original session
1125 closed with exit 1: 1,469 Vitest tests passed, 3 failed and 3 skipped.
The test phase stopped before the Node and Counting phases. Installation,
whitespace and typechecking passed. Test elapsed time was 196.9 seconds,
with 277.8 CPU seconds. The three failures were the MCP command inventory
and stale Page and Counting asset modules after the HTTP client changed.
This remains a failed gate, not a passing union with focused tests.

The MCP inventory now records the new command's explicit operational
MCP gap. The owned Page, Counting and Lending bundles are regenerated
from their current source with the existing pinned esbuild dependency.
Lending also imports the changed HTTP client, although its asset module
was not one of the three gate failures. No rendered UI result follows
from regenerating those assets. A new gate is required for that changed
head.

The corrected focused run passes seven tests across the inventory and
two asset files. A separate direct generator comparison confirms the
Lending Worker module and all three public disk assets match their
current source build. These are generated-byte checks, not browser
interaction evidence.

The final frozen gate and exact-head Source review remain pending. The operations
guide documents the delivered bounds. MCP operational events, deployment
coverage checks, browser telemetry and capacity measurement remain later
stages. Cloudflare remains held.
