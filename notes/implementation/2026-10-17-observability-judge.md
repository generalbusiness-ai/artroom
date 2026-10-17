# Judge development

Source request `d13caf1d`, promise `d36bcb78`, under observability
`f57fc4da`. This renews stale `be612eec` / `979cc1cc` on live root
bases only; archive receipt `2643d98e` is historical evidence. The
complete conditions are unchanged. It follows standalone
`e6c47499` / `830b56c2` after the
archive dependency actually landed; the old child was normally retired
by `f641b97c`, with its code and evidence preserved. This is work in
progress on the approved third head. The
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
The standalone implementation passed the gate recorded below. The current
candidate includes the landed archive dependency and needs one composed
gate. It has not received Source review or measured acceptance. The five
prepared P3 slices are preserved separately.

No provider query, credential access, configuration change, deployment,
publication, native answer change or claimed measured latency follows
from this checkpoint. The Cloudflare hold remains in effect.

## Standalone local gate

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

## Landed archive dependency

Archive Source `6d1a1973` received exact approval `f250f501`, ratified by
`9e34d990`. Normal receipt `2643d98e` records Main
`698a3d71337a6a03bdea0dfdac10043dd5cbf011`, tree
`deccfd55aa75809669789fa427e27a52be3c3c0c`. The normal landing and
required workroom push completed. The full archive root remains owed.

The initial `aeafd364` Judge composition incorporated that actual Main.
All thirteen archive leaves were exact, and its twenty-one Judge paths
kept their standalone source bodies except this note. The repaired
freeze below additionally changes the metrics module and two tests;
the thirteen archive leaves remain exact. The earlier standalone
gate did not include the thirteen archive additions. The first composed gate and subsequent repairs are recorded below.
The earlier standalone gate is historical, not combined validation.
Source review must assess the repaired composition’s actual gate outcome
and the bounded failures recorded below. The five P3 slices remain separate, with Judge before
P3 in the latest review order. Calibration and real SQL/health acceptance
remain owed. Cloudflare deployment was still held at that checkpoint;
the latest hosting policy is recorded below.

## Query references

The planned client uses the existing Workers Analytics Engine SQL API,
whose endpoint and explicit sample-interval weighting are documented by
[Cloudflare](https://developers.cloudflare.com/analytics/analytics-engine/sql-api/).
Its dataset and dialect are distinct from the newer Analytics SQL API.
The [statement reference](https://developers.cloudflare.com/analytics/analytics-engine/sql-reference/statements/)
documents query limits and the JSON response shape. Reading those public
documents did not query an account or establish live SQL compatibility.

## Composed gate failure and counter repairs

The composed freeze was `aeafd364130fedf937101e2c3e960091b105fd00`,
tree `329b8e934d05c5176755c490ec75daa35b108406`. Original gate
session 30828 exited 1 (`d564e9`) at the unchanged clean freeze.
Vitest passed 1,563 cases, skipped three, and failed one: the inherited
archive parent-extension/retry case exceeded its original 5,000 ms
deadline. Node and Counter checks did not run. The gate took 522.236
seconds elapsed and 663.370 child CPU seconds on macOS 27.0.1 arm64,
18 logical CPUs, with load averages 8.114, 6.770 and 5.237. The verified
install stamp skipped installation; typechecking took 8.4 seconds elapsed
and 29.6 CPU seconds; tests took 513.6 and 633.5. The private original
log is `/tmp/artroom-judge-composed-aeafd364-gate.log`.

The unchanged archive case passed alone in original session 87147
(`3c8316`), taking 2,643.907 ms with the same deadline. Its outer command
took 3.42 seconds elapsed and 3.23 CPU seconds at load averages 5.065,
6.173 and 5.727. A small MCP focus overlapped. This does not establish
the timeout’s cause or turn the failed gate into a pass. The first gate
launcher (`a6d14d`, exit 2) failed before starting the gate; it ran no tests.

Composing the P3 continuation cases exposed a separate metric defect:
`/items/<type>` attempts counted as reads but not native pages. Both
original cases failed (session 81911, `3d67d5`): zero pages versus one
and four actual typed-page requests. The Judge concurrent-call witness
also failed before repair (`e91312`). The repaired collector recognizes
typed-item and bounded query-item pages, while retaining the original
fetch arguments and never consuming response bodies. Its concurrent
witness includes history, typed-item, query-item and ordinary entry reads.

Checker advisory `befe2c42` identified a second defect: failure completion
rows replaced accumulated counters with zeros. Before repair, the actual
MCP service’s invalid-list-cursor witness lost eight observed inventory
reads, and the rejecting-operation witness lost three reads and one page
(`963817`, two assertion failures). Failure rows now retain reads/pages
in their kind’s slots, zero unavailable result quantities, and rethrow
the original exception. The list witness uses the actual service and a
labelled HTTP stand-in; neither it nor the counter unit test proves Native
admission or live Analytics Engine delivery.

The affected Node checks passed 63 cases with one existing skip; twelve
wire cases were unrun because the sandboxed loopback setup timed out
(`1a618a`). Running only that file with local server access passed all
twelve (`fe6623`). The P3 continuation cases then passed both (`35e06f`).
MCP source and test typechecks passed (`d965ad`). A discarded exploratory
W5 assertion (`04fd07`) assumed live comments used the final-item route;
its failed premise was removed before the valid witnesses and repair.
All these original outcomes remain recorded. The new source and tests
require one gate at the repaired immutable freeze before Source review.

## Repaired composition gate and remaining timeout residue

Repaired implementation freeze
`f286e00dd8b4c0c8f5534fa339923fb6a088a6ad`, tree
`c50d92340ee772dd4f6e8e2cb0235e2c0b110ab3`, was clean before and
after original gate session 62660. It exited 1 (`0fb468`): 1,563 Vitest
cases passed, three failed, and three were skipped. All metric witnesses
passed. The three failures were original 5,000 ms timeouts in Scope
`lending.test.ts`, Page `source-preview.scope.test.ts`, and Lanes
`manifest.scope.test.ts`. The earlier archive timeout did not recur.
Node and Counter checks were unrun because Vitest failed.

The gate took 554.324 seconds elapsed and 660.537 child CPU seconds on
macOS 27.0.1 arm64 with 18 logical CPUs. Pre-run load averages were
2.897, 2.544 and 3.391. The verified dependency stamp skipped
installation. Typechecking took 7.5 seconds elapsed and 27.3 CPU
seconds; tests took 546.6 and 633.0. The lock hash is unchanged.
The private log is `/tmp/artroom-judge-repaired-f286e00d-gate.log`;
its terminal JSON is beside it. Step logs are in
`/var/folders/2x/wylr59t17ds36l1l7ng25y7w0000gn/T/tmp.78Vpa8opYD`.
These references grant no access to private logs or adjacent files.

Exactly the three timed-out cases then passed together in original
session 12575 (`0824ba`), with unchanged source and deadlines: lending
4,124 ms, source preview 2,514 ms, and manifest 2,431 ms. The outer
command took 11.78 seconds elapsed and 13.45 CPU seconds. This is
narrower evidence, not a passing combined gate or a proven cause.
The bounded residue belongs to the current review’s explicit disposition;
the broader gate-stability request `1d3a13e3` remains open. No whole
suite was repeated and no test deadline, assertion or pool was changed.

The complete Source packet discloses both failed composed gates and
the isolated passes. Exact independent review must decide whether the
remaining timeout residue blocks this candidate. A gate failure is not
waived by this note or by the static advisory. Only this delivery note
changes after the tested freeze; all other 1,457 mode/type/blob/path
leaves, all thirteen landed archive leaves, and all 123 protected
contract/platform/client/lock leaves remain exact. No additional gate
is run for this note-only successor. Actual calibration, live SQL/health
acceptance and storage reporting remain owed.

## Exact review and receipt-read repair

Formal review `7731e1b4` requested changes on exact `1f2aba03`, all
twenty-one files. F1 found that `POST /settle` was missing from the
read-attempt count. A remote native receipt lookup is a read despite
using POST; it does not submit another intent. F2 found `found` in the
active metrics-v1 HTTP place map, where the collector uses `create`.
The map is corrected without renaming any native intent or register act.
The reviewer explicitly found that the disclosed, cause-unknown timeout
residue would not alone block this bounded Source slice. Both composed
gates remain failed; focused/downstream passes are not a green gate.

The new actual MCP service witness failed before the F1 repair
(original session 21783, `268eb9`): after a reply was lost after the
HTTP stand-in recorded the act, settlement recovered its receipt, but
reported one read instead of two. The repair counts `POST /settle` as
one read and zero pages. It still excludes POST creation, intent
submission and preparation. The concurrent unit witness distinguishes a
receipt lookup from `POST /acts`.

The ordinary-act witness now also checks retained terminal custody: a
later settlement makes its normal summary read but no remote receipt
lookup. A second actual-service witness starts with empty configuration
and an unresolved signed creation. Its creation/receipt responses are
explicitly scripted, not Native admission. The first attempted receipt
lookup fails and counts one read; the second resolves the same signed
creation and counts one; the terminal lookup uses the retained answer
and counts zero. Both lookup bodies contain the exact original signed
request, and the successful endpoint matches its derived created scope.
The fixture supplies membership explicitly without an inventory read.

The final two affected files pass 24 cases with one existing skip
(original 32089, `c8e627`); MCP source/test typechecks pass (`7fcc6e`).
The earlier narrower repaired run passed 23 cases (`65b203`) before the
creation witness was added. This changed implementation needs one gate
at its new clean freeze, then fresh exact-head Source review. The
rejected head, all original failures and both finite evidence grants
remain preserved; no earlier approval or static advisory is transferred.

## Receipt-repair gate and delivery

The next implementation freeze is
`3a3e03d03664786e7cfe06ed713936b6118e1849`, tree
`1aa340c9686526727f64c1ea85d2df066da0f20f`. Original gate session
91061 exited 1 (`c9c8c2`) at that same clean head and tree. It passed
1,563 Vitest cases, failed five and skipped three. All metric witnesses
passed. Each failure was an original 5,000 ms timeout: Git archive parent
retry, Git compare-and-set push, Scope application establishment (the
application case), Scope application publication, and Scope lending.
Node and Counter checks were unrun inside the failed gate.

The gate took 626.597 seconds elapsed and 754.833 child CPU seconds on
macOS 27.0.1 arm64, with 18 logical CPUs and pre-run load averages
10.319, 7.431 and 6.933. Installation was skipped against the verified
unchanged lock stamp. Typechecking took 11.3 seconds elapsed and 33.9
CPU seconds; tests took 615.0 and 720.5. Original private log:
`/tmp/artroom-judge-receipt-3a3e03d0-gate.log`; terminal JSON is beside
it. Step logs are in
`/var/folders/2x/wylr59t17ds36l1l7ng25y7w0000gn/T/tmp.8yXI7Vdw9T`.
These are references, not private-file grants.

Exactly the five timed-out cases then passed once, without source,
deadline, assertion or pool changes (original 36186, `21ff51`):
archive parent retry 3,149.1 ms; compare-and-set push 2,142.5 ms;
application establishment 1,193 ms; application publication 2,355 ms;
lending 3,543 ms. Twelve other cases in those files were unselected.
The outer focused command took 12.93 seconds elapsed and 15.94 CPU
seconds on the same machine and installed dependency view; a separate
pre-focus load reading was not captured. The exact downstream Node and
Counter bodies then passed 25 and 55 checks, respectively, in that same
original process. These separate passes are not a passing combined gate
and do not establish a timeout cause. Gate stability remains open.

This delivery successor changes only this note. All other 1,457 frozen
mode/type/blob/path leaves remain exact, including every implementation
and test file. All thirteen archive leaves and all 123 protected leaves
remain exact to Main698. Complete exact-head review must assess both
7731e1b findings and the new bounded timeout residue. No prior Source
approval or gate verdict is transferred. No whole suite is repeated for
the note-only successor.

Planner policy `ef76f5db` lifts the hosting freeze as of 17 October at
09:50 Eastern, requiring approval of the exact deployed head and the
available post-deploy check. Earlier hold statements describe their
checkpoints. This local Source slice itself performs no deployment or
provider query. Actual observed calibration, live SQL/health acceptance,
storage reporting, and full observability acceptance remain owed.
