# Operational metrics and request correlation

The room Worker prepares the `METRICS` Analytics Engine binding and
`VERSION_METADATA` in [its configuration](../apps/room/wrangler.jsonc).
The source configuration enables retained console logs at full head
sampling and disables platform invocation logs, which can include URLs.
These settings take effect only through a separately authorized deployment.

Metrics and correlation are operational data. They grant no authority and
are absent from signed answers, sealed entries, outbox messages and replay.
A missing, failing or slow metric binding does not own a native reply.

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
`answer` with no public answer. HTTP public turns use `found`, `acts` and
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
turn occurred. The later deployment coverage check is a separate stage.

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
