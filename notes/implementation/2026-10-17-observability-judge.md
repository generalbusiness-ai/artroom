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

`scripts/deploy-check.mjs` now exports the client. It has no command-line
entry point yet. The caller supplies the deployment, version and bound;
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

## Remaining third-stage work

The command-line interface, deployment-report binding and observed
calibration provenance, actual storage-row reporting, MCP console and hosted events, concurrent
operation-owned read/page counting, successful persisted custody-phase
events, telemetry loss/privacy/equivalence witnesses and live acceptance
remain outstanding. The complete third stage has not passed a gate or
received Source review. One gate is due at its final changed implementation
freeze. Archive review `17dad8da` keeps priority for Source filing and
landing. The five prepared P3 slices are preserved separately.

No provider query, credential access, configuration change, deployment,
publication, native answer change or claimed measured latency follows
from this checkpoint. The Cloudflare hold remains in effect.

## Query references

The planned client uses the existing Workers Analytics Engine SQL API,
whose endpoint and explicit sample-interval weighting are documented by
[Cloudflare](https://developers.cloudflare.com/analytics/analytics-engine/sql-api/).
Its dataset and dialect are distinct from the newer Analytics SQL API.
The [statement reference](https://developers.cloudflare.com/analytics/analytics-engine/sql-reference/statements/)
documents query limits and the JSON response shape. Reading those public
documents did not query an account or establish live SQL compatibility.
