# Judge development

Source request `e6c47499`, promise `830b56c2`, under observability
`f57fc4da`. This is work in progress on the approved third head. The
retain/count and See stages are already on Main. The preparation report
is `d7c5ec9d`, under `d1e1942f`.

## Current checkpoint

`scripts/deploy-check-evaluate.mjs` evaluates supplied metrics-v1
observations and health. It makes no network request. The new Node
witness file is included in the existing test command. No package or
lockfile dependency changes.

The evaluator filters the selected deployment, version and fifteen-minute
window. Events multiply double 1 by the sample interval once; additive
counters multiply their already-summed value by that interval once.
The route p95 is the weighted nearest rank of unmerged route durations.
The rank uses integer arithmetic. Errors are route `error` ends; route
refusals are reported separately. Minimum observations, five-minute
freshness, one-percent error and supplied latency bounds remain separate
failure conditions. Missing calibration cannot pass.

Coverage preserves the actual `create`, `acts` and `preparations` HTTP
places. Direct `rpc:` places cannot balance an HTTP shortfall. Pre-turn
routes are excluded. A sampled window or insufficient place resolution
is unknown; recorded loss is incomplete before sampling is considered.
The implementation treats any recorded loss as incomplete so a complete
result can truthfully say "no recorded loss". Busy observations fail
independently. Every result declares paired-route/turn loss, missing
summary and alarm/dispatch limits. The current metric point map has no
SQLite rows-written total; the evaluator returns that field as unknown,
without making it a gate or substituting event counts for storage writes.
Actual storage reporting remains owed.

Six focused Node witnesses use explicitly synthetic observations. They
cover weighted counters and quantiles, exact threshold boundaries,
insufficient data, freshness, errors, latency, busy, critical-loss
precedence, HTTP place balance, sampling, version and health
matching, malformed inputs and a missing supplied bound. These are local
evaluator checks, not recorded SQL responses or an observed demo.

Original direct run `17703c` exited zero, six cases passed. After refining
the synthetic rows to the actual status/summary/flag shapes and rejecting
unknown route or turn places, direct run `060fb1` passed all six. The
final focused run `7bd415` also passed all six after exact percentile-rank
arithmetic and explicit bound reporting.

Two focused controls ran each selected unchanged witness successfully,
then failed an assertion under its one deliberate mutation, and restored
the source:

- Multiplying an additive counter by multiplicity again produced 700
  where the witness requires 14.
- Removing the recorded-loss decision produced unknown instead of
  incomplete for a sampled window with a lost critical turn.

The original control driver `d37011` exited zero. Its logs are
`/tmp/artroom-judge-counter-control.log` and
`/tmp/artroom-judge-coverage-control.log`. Both restore the evaluator to
SHA-256 `af887764de023872283d8cbf3d88a94062103c86cc06efaf6a83277c786e9795`.
There was no sweep or full-suite run.

## Read-only client checkpoint

`scripts/deploy-check.mjs` exports the client and the operator command
described below. The client caller supplies the deployment, version and bound;
the function explicitly does not certify their provenance. It sends one
SQL request for a fixed fifteen-minute window and one independent health
request. The token goes only to the fixed account-scoped Analytics Engine
endpoint. Redirects are errors. Health receives no analytics credential.
Scope indexes, request IDs and trace IDs are not selected from the dataset.
Raw provider answers and exception text are never included in the result.

The client accepts at most 50,000 rows, asks for one extra to detect an
overfull window, and rejects inconsistent row metadata or a declared
truncated result. SQL and health bodies are bounded at 16 MiB and 4 KiB,
respectively, with at most 65,536 stream pieces and a ten-second deadline
per request. The stream is cancelled on refusal, completion or deadline;
the deadline covers both headers and body. No partial response can pass.
These are client refusal bounds, not measurements of platform capacity.

Direct run `45fe94` passed all eight Node cases after adding the client.
Direct run `e4b63c` passed all eight after tightening cancellation and
nonprogress bounds. The two client witnesses use scripted fetch ports
and standard Response streams: they check the fixed query window,
credential separation, successful evaluation, provider failure, truncated
metadata, oversized health and a stream of empty pieces. They query no
account and prove no real SQL execution, timeout latency or hosted health.

## MCP instrumentation checkpoint

`packages/mcp/src/metrics.ts` adds an invocation-local collector using the
existing `AsyncLocalStorage` pattern. Calls own their actual read/session
attempts and page requests. There is no shared before/after counter.
The collector reserves a completion event and a terminal loss summary
within 250 points, rejects unlisted names, reasons and invalid numbers,
and never awaits a reporter. Throwing, rejecting or pending reporters do
not replace returned values or exceptions. Formatter failure drops the
observation; it does not fabricate a native error.

The initial closed name map covers the generic tools, `list` and hosted
`enrol`. Dynamic act tool names are outside that map and are dropped with
tainted-loss accounting. No name is redacted into a supported name.
Record phase observations occur only after successful custody writes,
using the phase captured before mutation. Preparation steps have separate
phase observations, as described below.

The CLI's `serve` path now emits `dap.metric` JSON on stderr. Hosted
services and control enrolments use the optional reporter; the production
Worker wires it only when the existing optional METRICS binding is
present. Their point map has the explicit `mcp-metrics-v1` marker in blob
9. The scope evaluator and query exclude that map. There is no new
binding, configuration or provider action.

Focused module run `d3564e` passed four cases; refined run `7d8f0c` also
passed four after containing formatter failures and removing an
ineffective retained-callback check. MCP source typechecking passed.
The existing end-to-end budget and file-custody witnesses were
strengthened: `65f644` passed six selected cases, 44 unselected. The
budget witness compares actual recorded transport requests with the
generic tools' emitted counts and bytes. The custody witness holds one
settlement file write back and verifies that it emits no accepted phase
until persistence succeeds. A focused control `a72a99` passed its
baseline and failed an assertion when the phase hook moved before the
write; source was restored to custody SHA-256
`7637825af9f5da5d5e52584cc8f533355e94b341ca1ff24eb716040c3cb99027`.
The log is `/tmp/artroom-judge-custody-phase-control.log`.

The first native generic-story attempt `61ac9e` exited 1 before any case
because the sandbox refused its loopback listener. The permitted local
workerd attempt, original session 51528, closed zero (`987b48`): one
selected case passed, one unselected, 4.55 seconds total. The full
existing native generic story runs with a throwing reporter; exact room
read outputs also agree across absent, normal, throwing, rejecting and
pending reporters. Its existing Git and scheduler ports remain labelled
stand-ins. This was not a provider or deployment run.

Wiring the hosted callback first exposed a TypeScript callback type error
(`9cb54a`); its point type was corrected. Scope typechecking then passed
(`d9e9f2`), and the refined module/budget/custody selection `f1b3e1`
passed six cases. The local stdio subprocess witness, original session
33755, closed zero (`848c07`): one selected case passed, eleven
unselected. Both pinned wire revisions and generic mode still work;
metric lines are captured on stderr, client protocol errors stay empty,
and the private device seed is absent. Its HTTP scope is a stand-in.

Original hosted H1 session 63354 closed zero (`3e8877`): two selected
native recipes passed, ten unselected, covering both legacy and
invitation-key cohorts. Actual hosted objects, SQLite scopes, enrolment,
both pinned clients and persisted phase counts are exercised. Captured
metric points exclude the invitation seed, bearer and controller seed.
The reporter is an explicit captured port; no Analytics Engine account
write or live sink acceptance is proved. Scope typechecking `012b70`
also passed. Original logs remain in `/tmp/artroom-judge-stdio-focus.log`,
`/tmp/artroom-judge-hosted-h1-focus.log` and
`/tmp/artroom-judge-native-generic-permitted-focus.log`; the refused
sandbox attempt remains `/tmp/artroom-judge-native-generic-focus.log`.

## Preparation phases and operator inputs

Preparation-step phases are now emitted after their successful record
write, separately from the parent record. Custody double 6 distinguishes
record (0) from preparation step (1). The native hosted recovery witness
checks both a standalone step and steps of an unsubmitted act: a failed
answer write emits no answered phase, retry retains the exact intent,
and the native lane keeps one preparation entry. Original local session
40502 closed zero (`6a83d9`): one selected case passed, eleven unselected.

Automatic review initially rejected the single preparation-phase control
as a mutation sweep. No command executed. The retry supplied the explicit
distinction in `docs/testing.md`: one or two focused controls per invariant
are required, while sweeps and whole suites per mutant are prohibited.
That exact focused command was then approved. Original session 63641
closed zero (`dfdc21`): baseline passed, moving the answered-phase hook
before its write failed an assertion, and the source was restored to
custody SHA-256
`97c28dd9b5ce1656a170083285e13c5764a46ff873134457aaf5054f192a5528`.
The original log is `/tmp/artroom-judge-preparation-phase-control.log`.
No approval block remains for that completed control.

The operator command now reads a completed deployment's version from
retained Wrangler version-1 NDJSON output. It requires the project's
4.147.0 pin and refuses uploads, failed commands and ambiguous output.
An explicit calibration file names the observed window, version, weighted
route count, p95, chosen bound and recording digest. These records assert
provenance; the command does not certify an observation or follow the
recording digest. It reports both input-file hashes. It has no token
argument; the read token comes from the operator environment. `--help`
works without an account query.

Direct Node run `676686` passed nine cases, including the command with
synthetic retained files and scripted fetch. After strict selector types
and ended calibration-window validation, `a7705e` also passed nine. The
actual help command `c9649b` exited zero without reading an account.
These are synthetic command/protocol checks, not Wrangler output from
a real deployment or measured demo calibration.

The exact MCP map and operator inputs are documented in `docs/mcp.md`
and `docs/operations.md`. Static comparison `bc13e1` confirms all eighteen
fixed names and forty-one native reasons match their documented sets;
new local links resolve. The map also documents server reasons, record
and preparation phases, numeric ranges, completion/loss reservations,
context and the deliberate exclusion of dynamic act names. Module run
`58ee26` passed all four cases after rejecting non-string context metadata
without leaking it or replacing the result. MCP and Scope typechecking
`2f4c19` and `066236` passed.

The four affected MCP Node files ran together once. Original session
69789 closed zero (`b6e62c`): sixty-one cases passed and one existing case
skipped, 7.95 seconds total. The log is
`/tmp/artroom-judge-mcp-affected-tests.log`. This is affected-file
verification, not the whole repository gate. Earlier passing and failed
observations remain attributed to their own source checkpoints.

## Remaining third-stage work

Observed demo calibration and live acceptance remain outstanding.
Planner disposition `e93b5353` resolves request `5ddf26c3`: no adopted
storage-row counter exists. The result reports `rowsWritten: null` with
`rowsWrittenReason: "not-measured"`, never turn wrote-count or timed-entry
count. This total does not gate Judge acceptance. `docs/operations.md`
names the intended Durable Objects analytics source as unverified; exact
dataset and field names must be confirmed by introspection on the first
operator run after deployment reopens. Its reader is a follow-up under
`f57fc4da`, delivered with the first post-freeze deploy check. Calibration
rules are unchanged. No provider query, introspection, token or schema
change is authorized or executed by this local delivery.
The local implementation has passed its one final gate, as recorded below;
it has not received Source review or measured acceptance. Archive review
`17dad8da` keeps priority for Source filing and
landing. The five prepared P3 slices are preserved separately.

No provider query, credential access, configuration change, deployment,
publication, native answer change or claimed measured latency follows
from this checkpoint. The Cloudflare hold remains in effect.

## Final local gate

The final implementation freeze is
`7f6ee2bb030e5d96c73d39c0ba35100cd0309b22`, tree
`4ded0ac38e29a6e7b19c5a75161ff2e0880fc8c7`. It has 21 changed paths
and 1,445 tracked leaves against Main `55e1970a5`. All 123 contract,
platform, client and lockfile leaves remain exact. The explicit unmeasured
storage reason passed all nine focused Node cases in run `273906`.
Deferred reader request `23b45732` retains the planner's first post-freeze
delivery requirement.

Original gate session 48171 closed with exit 0 (`8dc6b5`). Vitest passed
1,544 cases and skipped three; the built-in Node checks passed 25 and the
Counter browser checks passed 55. Installation took 2.2 seconds elapsed
and 3.4 CPU seconds; typechecking took 7.4 and 26.3; tests took 432.8
and 524.0. The owner measured 442.7 seconds elapsed for the gate and
554.0 child CPU seconds. This was macOS 27.0.1, arm64, 18 logical CPUs,
with pre-run load averages 1.823, 1.585 and 1.388. Installation used the
existing lock and local dependency cache; it was not a skipped install.
Lock SHA-256 is
`a3dd5689f33c5181b5ff48553fbb3c45b44abf96720ba9935eed40853a3b09bc`.

The gate ended at the same clean head and tree. Its original log is
`/tmp/artroom-judge-7f6ee2bb-gate.log`, with step logs in
`/var/folders/2x/wylr59t17ds36l1l7ng25y7w0000gn/T/tmp.1jkY13EYAM`.
The owner terminal is `/tmp/artroom-judge-7f6ee2bb-gate-terminal.json`.
These private evidence paths are references, not read grants. This
delivery-note update changes no source or test; the gate is not repeated.

## Query references

The planned client uses the existing Workers Analytics Engine SQL API,
whose endpoint and explicit sample-interval weighting are documented by
[Cloudflare](https://developers.cloudflare.com/analytics/analytics-engine/sql-api/).
Its dataset and dialect are distinct from the newer Analytics SQL API.
The [statement reference](https://developers.cloudflare.com/analytics/analytics-engine/sql-reference/statements/)
documents query limits and the JSON response shape. Reading those public
documents did not query an account or establish live SQL compatibility.
