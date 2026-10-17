# Operational status, metrics and request correlation

The room Worker prepares the `METRICS` Analytics Engine binding and
`VERSION_METADATA` in [its configuration](../apps/room/wrangler.jsonc).
The source configuration enables retained console logs at full head
sampling and disables platform invocation logs, which can include URLs.
These settings take effect only through a separately authorized deployment.

Metrics and correlation are operational data. They grant no authority and
are absent from signed answers, sealed entries, outbox messages and replay.
A missing, failing or slow metric binding does not own a native reply.

## Status reads

`dap status` uses a fresh room session to read the configured register,
directory, membership, rules, destination and caller's inbox. It discovers
other scopes from confirmed references and recorded creation sends.
`dap status membership` selects one configured scope. A scope ID also
selects one scope.

Each scope has a summary with its status, time and type-state counts.
The outbox column counts requests without a result and diagnosed sends.
An admin session also reads both waiting lists and operational incidents.
A member sees those columns as `denied`.

Each list stops after 20 pages. Discovery stops at 1,000 scopes and reads
at most 20 history pages per scope. A count at a page limit is `more;
partial`. A refused read is `denied` when the reason is `forbidden`.
Other refusals, transport failures, repeated cursors and a native head
change between pages produce `unknown`. These states never become zero.
A partial summary keeps its partial label.

Each column prints the head from its own read. The columns are separate
observations. They do not describe one room snapshot, and operational rows
can change without a native entry. Discovery follows the caller's read
permissions and limits. The final scope count is an observation count,
not a complete room inventory.

`dap status --request <16-hex-id>` also reads retained correlation rows
for that server request ID, through the admin session. The selector uses
exactly 16 lowercase hexadecimal characters. This column includes the
retained window and each row's entry or outbox reference. A window change
between pages produces `unknown`. Without `--request`, status makes no
correlation read. Status requires a room session and does not fall back
to signed entry reads.

## Health

`GET /health` returns only `deployment`, `version`, `sessions` and
`register`. `HEAD /health` returns the same status with no body. Query
parameters and request bodies are refused. Other methods return 405.

`sessions` is `ok` when the deployment name and session secret pass the
normal session configuration checks. Otherwise it is `unavailable`.
The register selector comes from the existing GitHub or Artifacts host
configuration. No valid selector gives `unconfigured`. Two different
selectors give `ambiguous`. Two equal selectors use that register.

The internal register probe reads scope metadata, without a scope read
session, provider call or native turn. It returns `ready` for an active
register, `absent` for an uncreated scope, `not-ready` for other valid
metadata, and `unavailable` for an error or malformed metadata. Health
returns 200 only for `sessions: ok` and `register: ready`. All other
configuration or probe results return 503.

Each caller waits at most two seconds for the probe. Concurrent callers
share one physical probe per Worker isolate. A caller timeout keeps that
probe reserved until it settles, so repeated timeouts do not start more
probes. A settled result is cached for five seconds. Health does not
measure provider access, publication readiness or room-wide capacity.

## The metrics-v1 slot map

The dataset is `artroom_metrics_v1`. Its optional index is the scope ID.
Each point has nine blobs and six doubles. All numeric values are whole
numbers from 0 through 2,147,483,647. Durations are milliseconds.

| Blob | Meaning |
|---|---|
| 1 | Kind from the table below |
| 2 | Deployment, at most 128 UTF-8 bytes |
| 3 | Worker version UUID, or `unknown` |
| 4 | Closed operation, route or diagnosis place |
| 5 | Native turn end, or the kind's operational result |
| 6 | Closed reason, `none`, `aggregated` or `summary` |
| 7 | Server request ID, `none` or `mixed` |
| 8 | Validated incoming trace ID, `none` or `mixed` |
| 9 | Public answer for a public native `answer` end; route execution mark; otherwise `none` |

| Kind | Doubles 1 through 6 |
|---|---|
| `turn` | Multiplicity, duration, restarts, timed attempts charged, timed entries written, wrote count |
| `route` | 1, duration, 0, 0, 0, 0 |
| `session` | 1, 0, 0, 0, 0, 0 |
| `signed-read` | 1, 0, 0, 0, 0, 0 |
| `join` | 1, 0, windows open, joins waiting, 0, 0 |
| `dispatch` | 1, 0, attempts, acknowledgments, diagnoses, 0 |
| `diagnosis` | 1, 0, 0, 0, 0, 0 |
| `incident` | 1, 0, 1, 0, 0, 0 |
| `stream` | 1, 0, open streams, released streams, 0, 0 |
| `metric-dropped` | 1, loss bitmask, lost rows, affected turns, affected critical turns, groups merged |

[metrics.ts](../packages/scope/src/metrics.ts) defines the closed places,
reasons, diagnosis steps and events. Unlisted values and invalid numbers
are dropped and counted, without truncating caller text into a valid row.

A native end is `answer`, `idle`, `busy`, `clock-behind` or `unavailable`.
It stays separate from the public answer. Internal diagnosis turns can end
`answer` with no public answer. HTTP public turns use `create`, `acts` and
`preparations`; direct and MCP-backed calls use their separate `rpc:`
places. A route mark comes from entry into the actual native turn.
Missing execution metadata counts as critical coverage loss.

The collector reserves one of the 250 points per invocation for its
terminal summary. It keeps turn rows first, then routes, then other rows.
Repeated identical turn groups accumulate without losing resolution.
Above 64 groups, or when needed to fit the write budget, it coarsens
reason, then public answer, then place. It never merges different native
ends. Counter sums saturate at the numeric bound.

Loss bits are 1 for budget, 2 for invalid fields, 4 for group coarsening,
8 for sidecar failure and 16 for overflow. A critical turn has an end of
`busy`, `clock-behind` or `unavailable`, an invalid end or a saturated
counter. A terminal row cannot prove its own presence or detect the loss
of both a route and its turn. These metrics alone cannot prove no busy
turn occurred. The deployment coverage check below is a separate stage.

## Check a deployment

The Judge source reads Analytics Engine and public health. It requires a
bound from an observed demo run. The [delivery note](../notes/implementation/2026-10-17-observability-judge.md)
records the outstanding calibration and live API acceptance; synthetic
test rows are not that observation.

```sh
node scripts/deploy-check.mjs \
  --deploy-output /absolute/path/wrangler.ndjson \
  --calibration /absolute/path/observed-calibration.json \
  --deployment demo-deployment \
  --health https://demo.example/health
```

Set `CLOUDFLARE_ACCOUNT_ID` and `DAP_ANALYTICS_READ_TOKEN` in the
operator's environment. The token needs Account Analytics Read. Keep it
out of repository files and command arguments. Only the SQL request gets
it; health receives no analytics credential. The check makes reads only.
Running it still needs the applicable operational scope.

Use a fresh output file from the project's pinned Wrangler 4.147.0
deployment. [Wrangler's structured output](https://developers.cloudflare.com/workers/wrangler/system-environment-variables/)
is NDJSON selected with `WRANGLER_OUTPUT_FILE_PATH`. The check requires
one version-1 `wrangler-session` for `deploy` and one successful
version-1 `deploy` record. It obtains the Worker version from that record's
`version_id`. A version upload, ambiguous output or `command-failed`
cannot substitute for a completed deployment. The health body's version
and deployment must match those selected for the check.

The calibration is a JSON object with exactly these fields:

| Field | Meaning |
|---|---|
| `format` | `dap-metric-calibration-1` |
| `deployment` | The same public deployment name |
| `version` | The lowercase Worker UUID of the observed calibration run |
| `from`, `through` | Canonical UTC ISO timestamps for its window, at most fifteen minutes; the window has ended |
| `routeCount` | Observed weighted route events, at least 100 |
| `p95Ms` | Observed whole-millisecond route p95 |
| `boundMs` | Chosen whole-millisecond bound, at least that p95 |
| `recordingSha256` | Lowercase SHA-256 of the retained observation |

The baseline may be from an earlier version of the same deployment.
The recording digest is the operator's declared reference: the script
does not follow it or certify that the observation happened. Actual
recording and review are part of delivery. Each input file is bounded at
256 KiB. The result reports both input-file hashes and the calibration.

The query selects the deployed version for a fixed fifteen-minute
window. Event counts sum multiplicity times sample interval; counters
sum their already-aggregated value times sample interval. Multiplicity
is not applied to a counter again. Route p95 is the weighted nearest rank
of unmerged route durations. Refused routes are reported beside errors;
only route `error` ends count toward the one-percent error threshold.

Fewer than 100 weighted routes, no turn, a newest event older than five
minutes, error rate above one percent, p95 above the supplied bound,
any busy turn, failed SQL or mismatched health all fail. Coverage is a
separate gate: recorded loss is incomplete; sampling or unresolved turn
places is unknown. With no sampling or loss, turn-marked HTTP routes
must balance public turns at each of `create`, `acts` and `preparations`.
Pre-turn routes are excluded. RPC, alarm, dispatch and mixed places cannot
balance a missing HTTP turn. The result always declares undetectable
paired loss, missing summaries and alarm/dispatch limits. A complete
result describes observations, never proof that no busy turn occurred.

The client bounds the SQL result at 50,000 rows and 16 MiB, health at
4 KiB, each response at 65,536 pieces and each request at ten seconds.
Overfull, truncated or malformed replies fail instead of judging a partial
window. Redirects are errors. The query omits scope indexes, request IDs
and trace IDs, and excludes the separate
[MCP map](mcp.md#operational-metrics). Raw provider responses and tokens
are not printed. Exit 0 means the observed check passed; 1 means it
failed; 2 means its retained inputs were invalid.

The reported `weightedRows` is the sum of sample intervals over metric
points. SQLite storage rows written remain unmeasured: `rowsWritten` is
`null`, with `rowsWrittenReason: "not-measured"`. This total does not gate
the check. Turn wrote-count and timed-entry count cannot substitute for it.

The intended source is the platform's Durable Objects analytics dataset
for SQLite storage rows written. Its exact dataset and field names are
unverified. The first operator run must confirm them by introspection
after deployment reopens. That reader is a follow-up under observability
request `f57fc4da`, delivered with the first post-freeze deploy check.
No provider query, introspection, token or schema change is part of this
local delivery.

## Request correlation

Every HTTP response adds a server-minted 16-hex `dap-request-id`.
An incoming `traceparent` is accepted only in exact lowercase version 00
form, with nonzero trace and parent IDs. The response keeps the trace ID,
mints a parent ID and keeps only the sampled flag. Invalid trace context
is ignored. `tracestate` is neither retained nor echoed. Trace IDs are
untrusted correlation; a client can repeat one across unrelated requests.

An admin session can read
`GET /v1/scopes/<scope>/requests?request=<16-hex-id>`, or use
`trace=<32-hex-id>` instead. Exactly one selector is required. The read
returns at most 100 newest rows with the current native head, retained
window, `complete` and an optional `next` cursor. A cursor is supplied as
`cursor=<next>`. It proves only coverage of the retained operational window.

The sidecar retains at most 4,096 rows. Each write first deletes all rows
older than seven days, then evicts the oldest retained row only if full.
Every query excludes expired rows even when no writes occur. Expired
bytes can remain until the next write. Writes follow the native entry
transaction or outbox attempt write and cannot roll either back. Several
missing entry-index rows can affect one turn, counted once as an affected
turn. Old admin tokens lack the new permission until a new session is
issued. Member sessions and signed entry reads cannot read this index.
