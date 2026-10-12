# Observability for dap: a design

2026-10-12. Draft 3, for checker review. Hugh's direction, 2026-10-12 17:36
Eastern: draft a dated design in `notes/`, send it to the checker, and tell
the planner that it is to be prioritized soon after the demo. Written
against main `013fac7a5`. Draft 1 (`baa0e21e`) received changes requested
in review `12fc5d1a`, with five corrections; Draft 2 (`4f0057ac`)
answered them, and section 9 maps them. Review `efc3882d` requested five
more; Draft 3 answers them, and section 10 maps them.

## 1. What this note decides

Dap keeps a strong audit record and almost no operational telemetry. This
note adds the smallest set of instrumentation that lets an operator answer
"is the service healthy, what is it refusing, and why was this request
slow" from retained data rather than from a live tail, and lets a deploy
be judged by a number. It takes its shape from what the woo project built
over two and a half months (`~/play/woo`, about 10,000 lines across 32
files) and keeps the parts that earned their keep there, sized for dap.

It changes no scope contract rule and no contract type. Correlation lives
in an operational sidecar of the scope's storage, not in a sealed entry
(section 4.4). Everything is deployment configuration, a sink with an
allowlisted schema, counters at places that already compute the numbers,
two reads that already exist plus two new bounded reads, and one command.

## 2. What exists today

From a survey of the active source on 2026-10-12:

| Have | Where | Who reads it |
|---|---|---|
| The record: signed intents, hashed entries, retained inputs; the replay verifier with explicit trusts and coverage | every scope; `packages/replay`; `artroom verify` | any member session; the verifier |
| Per-send outbox: each attempt with its answer before and after the send, the acknowledgment, the result or diagnosis | `packages/scope/src/outbox.ts:148-209`, `sqlite.ts:83-86` | any member session (`outbox`, `outbox/:duty`), paged with `complete` and `next` |
| Outstanding counts: open requests, `delivery-unavailable` requests, open operations and the outcome entries they may still write | `sqlite.ts:242-252` (`outstanding`) | the scope's own budget accounting; not a read |
| Operator record: a bounded, text-free incident table per scope (incarnation conflicts, outcome conflicts, resends; latest 1,024) and two waiting lists (diagnosed, unanswered) | `packages/scope/src/operator.ts:46-70, 146-152`; `reads.ts:365-390` | an admin session only (`incidents`, `waiting`; `sessions.ts:108-110, 326-328`); no page or CLI calls them; undocumented |
| Diagnoses: one JSON line per port failure, `{event, step, name}`, read-nothing policy and a redactor | `packages/scope/src/diag.ts:31-53`; emitted at `operations.ts:408-670` | `wrangler tail` only; nothing retains it |
| Site-route errors: one redacted text line per failed site read | `packages/scope/src/site/route.ts:74-91` | `wrangler tail` only |
| Session configuration validation: a secret of at least 32 bytes and a deployment name, else no session is issued or accepted | `sessions.ts:79-94, 216-235` | the routes, as `sessions-unavailable` |

What is absent: the Worker configuration (`packages/scope/wrangler.jsonc`)
has no observability block, no Analytics Engine dataset, no Logpush and no
tail consumer, so even the diagnoses are not retained. Turn restarts,
timed attempts and the turn's end (`idle`, `busy`, `clock-behind`,
`unavailable`) are computed and discarded (`turn.ts:113-118, 224-242`), as
are the join limiter's `rate-limited` and `busy` answers
(`limits.ts:168-174`). Session issuance and refusals, dispatch counts,
drain passes and stream counts are not counted. There is no health route,
no request identifier, no operations documentation, and no browser
telemetry (the last by design, kept).

## 3. What woo built, and what to take

Woo's instrumentation has four layers: structured metric events on the
console from every Durable Object; a Workers Analytics Engine dual write
with a fixed slot map and an admin panel and an acceptance gate over it;
W3C trace context carried through transcripts and outbox rows with
OTel-shaped spans exported off the reply path; and a hash-chained audit
Durable Object with query and verify. Three of those mattered most,
judging by its notes: the metric events read through the tail during the
performance work, the Analytics Engine dataset with the gate built on it,
and the audit trail with trace correlation.

Taken for dap: the metric sink and slot map
(`~/play/woo/src/worker/metrics-sink.ts:38-120`), the rule that Analytics
Engine and not the tail is the signal of record (woo `DEPLOY.md:205-210`),
the acceptance envelope as a post-deploy gate
(`scripts/net-metrics-ae.ts:36-59`), the trace context adopted per request
and validated (`src/net/trace.ts:80-131`), and a health route that
answers from real state.

Not taken: the span export pipeline, the separate audit Durable Object,
the browser activity metrics, and carrying trace context inside the
record. Dap's record already is the audit trail, with better correlation
keys than a projection of it, and the page has no analytics by design.

## 4. The design

### 4.1 Retain what is already emitted

Add to `packages/scope/wrangler.jsonc` the Workers observability setting,
enabled, at full head sampling for now, so the diagnoses and site-route
lines are retained by the platform. One setting; no code. The rate is a
deployment choice recorded in `docs/deploy.md`.

### 4.2 A metric sink with an allowlisted schema

One module, `packages/scope/src/metrics.ts`, with one function,
`emit(event)`, that writes a data point to an Analytics Engine binding
`METRICS` when the binding is present and does nothing when it is absent
(a test Worker, a deployment that has not bound one). A write is never
awaited on the reply path, never throws, and a throwing, slow or absent
binding leaves every answer and every delivery unchanged; W1 witnesses
each.

**The slot map.** Nine blobs and six doubles, fixed, documented, with the
scope ID as the one index. A new axis gets a new slot; an existing slot
never changes meaning, because every query hard-codes them. The map is
versioned: blob 1 carries the kind, and `docs/operations.md` carries the
map as `metrics-v1`; a change of any slot's meaning is `metrics-v2` with a
new dataset. Every number is a non-negative integer below 2^31, or the
write is dropped as tainted; a duration is whole milliseconds; a count is
a count of the things its kind names, never a rate.

| Slot | Holds | Allowed values |
|---|---|---|
| blob 1 | kind | the ten kinds below |
| blob 2 | deployment | the `DEPLOYMENT` setting, already bounded at 128 bytes |
| blob 3 | version | the Worker version ID from the platform's version metadata binding, or `unknown` |
| blob 4 | place | the union of: the fixed route names of `worker.ts`'s table (`found`, `acts`, `preparations`, `settle`, `summary`, `items`, `history`, `entries`, `outbox`, `duty`, `log`, `retained`, `sessions`, `stream`, `incidents`, `waiting`, `credential`, `site`, `page`, `health`, `requests`); the operations `alarm`, `dispatch`, `metrics`; and the diagnosis steps, which are the fixed words the source emits at its diagnosis sites, enumerated in `metrics.ts` as `STEPS` with a test that every `diagnose(` call site's literal is in it; any other value is `other` |
| blob 5 | end | for `turn`: `idle`, `busy`, `clock-behind`, `unavailable`; for every other kind: `ok`, `error`, `issued`, `refused`, `served`, `unavailable`, `dropped` |
| blob 6 | reason | the union of `RefusalReason`, `UnavailableReason`, `MismatchReason`, `ReadRefusal`, `SessionRefusal`, the diagnosis events (`outside-call-failed`, `outside-replies-failed`, `outside-recovery-failed`, enumerated as `EVENTS` with the same call-site test), the operator record kinds, the status classes `2xx`, `3xx`, `4xx`, `5xx`, the drop reasons `budget`, `tainted`, `aggregated`, `sidecar`, and `none` |
| blob 7 | request ID | 16 lowercase hexadecimal characters, server-minted (section 4.4) |
| blob 8 | trace ID | 32 lowercase hexadecimal characters from a validated `traceparent`, or `none` |
| blob 9 | answer | for `turn` on an act, preparation or founding: `accepted`, `refused`, `unavailable`, `mismatch`; otherwise `none` |
| double 1 | sample interval | always 1 as written; the platform's own `_sample_interval` is read at query time |
| double 2 | duration in milliseconds | the route's or the turn's wall time, or 0 |
| double 3 | count a | per kind, below |
| double 4 | count b | per kind, below |
| double 5 | count c | per kind, below |
| double 6 | flag | 0 or 1, per kind |

**The kinds, their places and their slots.** Each is emitted where the
number already exists.

| Kind | Where | blob 4 | blob 5 | blob 6 | double 2 | double 3 | double 4 | double 5 | double 6 |
|---|---|---|---|---|---|---|---|---|---|
| `turn` | `turn.ts` at `#close` | the operation (`acts`, `preparations`, `found`, `alarm`) | the turn's end, always | the answer's reason, or the end's reason, or `none` | wall time | restarts | timed attempts charged | timed entries written | wrote; blob 9 carries the answer, `none` for an alarm |
| `route` | `worker.ts` `route` | the route name | `ok` for a `2xx` or `3xx`, `refused` for a `4xx`, `error` for a `5xx` | the status class | wall time | 0 | 0 | 0 | 0 |
| `session` | `sessions.ts` | `sessions` | `issued` or `refused` | the `SessionRefusal` or `none` | 0 | 0 | 0 | 0 | 0 |
| `signed-read` | `signed-reads.ts` | the read name | `ok` or `refused` | the `ReadRefusal` or `none` | 0 | 0 | 0 | 0 | 0 |
| `join` | `limits.ts` `serve` | `acts` | `served`, `refused` or `unavailable` | `rate-limited`, `busy` or `none` | 0 | windows open | waiting | 0 | 0 |
| `dispatch` | `outbox.ts` `Dispatcher.run` | `dispatch` | `ok` | `none` | 0 | attempts made | acknowledged | given up (diagnosed) | 0 |
| `diagnosis` | `diag.ts` `toConsole` | the diagnosis `step` when it is a fixed word of the source, else `none` | `error` | the diagnosis `event` | 0 | 0 | 0 | 0 | 0 |
| `incident` | `operator.ts` `record` | `incidents` | `error` | the record kind | 0 | 1 | 0 | 0 | 0 |
| `stream` | `object.ts` `serving` | `stream` | `ok` | `none` | 0 | open | released | 0 | 0 |
| `metric-dropped` | `metrics.ts` | `metrics` | `dropped` | `budget`, `tainted`, `aggregated` or `sidecar` | 0 | rows dropped or merged | of them `turn` rows | of them `route` rows | 0 |

A `turn` row always carries the turn's end in blob 5 and, when the turn
judged an input, the input's answer in blob 9, so `idle` with `refused`
and `busy` with `none` are both expressible and never confused. Timed
attempts charged (double 4) and timed entries written (double 5) are
different numbers and are both kept.

**Closure.** The allowlists above are exactly the values the kinds in the
table need, and a test (W1) emits one legitimate row of every kind with
every end and reason the table names and asserts that each is written
unchanged. The fallback is closed too: a `metric-dropped` row is built
from constants and a bounded count, so it always validates and never
drops itself. The local MCP server's console kinds (`tools-list`,
`tool-call`, `custody`) are a separately versioned map, `mcp-metrics-v1`,
in `docs/mcp.md`: blob 1 the kind, blob 4 the tool name or `list`, blob 5
`ok`, `refused`, `error` or `unavailable`, blob 6 the reason or `none`,
blob 7 the request ID, double 2 the duration, doubles 3 to 5 tools,
bytes and reads for a list and reads, pages and bytes for a call; the
hosted endpoint of stage 2 writes those rows to the sink under that map.

**No free text, anywhere.** Every blob is checked against its allowlist or
its exact shape before the write. A value outside its allowlist is not
written, is not truncated and is not redacted: the event is dropped and
one `metric-dropped` with reason `tainted` is written instead. So a secret
can never reach the sink by being placed in a field the sink accepts; the
only field with free shape is the request or trace ID, which must be hex
of exact length. The diagnosis redactor stays where it is, for the
console; the sink never receives a diagnosis's text, only its two fixed
words. The `tainted` witness (W1) passes a token-shaped string, a URL
with userinfo and a PEM header as the reason, the route and the trace ID
and asserts that nothing but `metric-dropped` is written.

**Write budget, with coverage.** The platform caps data points per
invocation. The sink's budget is that cap less one, the one being
reserved for the terminal `metric-dropped` row, which is therefore always
writable. Within an invocation the sink buffers rows and writes them at
the end: `turn` and `route` rows first, then the rest in order of
emission. When the buffered `turn` rows alone would exceed the budget, as
an alarm that drains many due duties and their give-up turns can, they
are aggregated, not dropped: rows with the same place, end, answer and
reason merge into one row whose doubles are sums, with the merged count
in a `metric-dropped` row of reason `aggregated`, so every turn is still
counted and every `busy` end still appears. Rows of other kinds beyond
the budget are dropped and counted by kind in the terminal row. Nothing
the sink does changes a native effect: the buffer is written after the
native answer is decided, and a failure to write is itself only counted
on the next invocation's terminal row. W1 drives an alarm with more due
duties than the cap and asserts that every turn's end is recoverable from
the written rows, that the sends and entries equal those of a run with no
sink, and that the `metric-dropped` rows name what was merged or
dropped.

**Boundaries of what the sink can tell.** Retention is the platform's
(ninety days of the dataset). Access is the deployment's analytics token,
which the operator holds and the repository never sees (section 4.7).
Cardinality: the one index is the scope ID; blobs carry fixed words,
IDs and no handle, key ID, member reference, text or field value. What
the sink can show about a person is therefore bounded to what the record
already shows to any member: that a scope had activity at a time. That is
the stated boundary, not an absence.

### 4.3 The MCP server's numbers

Plan 031 measures list sizes, list changes and per-call read counts in
tests. The same numbers are emitted at runtime by the local MCP server to
its own console line, `dap.metric {json}`, with the kinds `tools-list`
(tools, bytes, generation changed), `tool-call` (tool, reads, answer,
duration) and `custody` (phase transitions), under the same allowlist
rule. The hosted endpoint of plan 031's stage 2 writes the same kinds to
the sink. No sink or counter is added to the page or the Counter browser.

### 4.4 Correlation: a request ID, a validated trace ID, and a sidecar

**Two identities, never one.** Every request to the Worker gets a
server-minted request ID, 16 lowercase hexadecimal characters from a
cryptographic random source, returned in a `dap-request-id` header and
written as blob 7 of every event the request produces. Separately, a
request that carries a W3C `traceparent` header has it parsed by the
recommendation's rules: exactly four dash-separated fields; the version
`00` in lowercase hex; a 32-character lowercase hex trace ID that is not
all zeros; a 16-character lowercase hex parent ID that is not all zeros;
two lowercase hex flag characters; and nothing after the fourth field for
version `00`. Anything else, including uppercase, a zero parent, a fifth
field or a wrong length, is ignored as if absent, and nothing is logged
or counted about it. A valid trace ID is written as blob 8 and returned
in the answer's `traceparent` header with a fresh 16-hex parent ID and
the flags reduced to the one defined bit, `sampled`, as received; other
flag bits are not propagated. The request ID is never replaced by the
trace ID, since one trace spans many requests and a caller's ID can
collide or be chosen. `tracestate` is opaque vendor text: it is not
stored anywhere, not written to the sink, and not echoed.

**What a trace ID is, and is not.** It is untrusted correlation chosen by
the caller. Its hex shape proves only its shape: 128 bits can encode
anything, so the ID is never treated as a secret, as an identity, or as
evidence that two requests came from one caller, and two callers may
choose the same one or link their requests on purpose. Its boundary is
the sidecar's: admin-only reads, the retained window of section 4.4, and
the sink's retention. Neither identity reaches a grant, an idempotency
key, a judge or an answer. W1 asserts that a request with and without
each header gets a byte-identical answer body, and that the only
differences are the two headers this design adds.

**The sidecar.** Correlation outlives the request in an operational table
of the scope's storage, `request_index`, beside the outbox and the
operator record and like them never part of a sealed entry, never hashed,
never replayed and never read by the verifier: rows of `(request ID,
trace ID or null, time, seq or null, duty or null)`.

*Isolation.* A sidecar write is best effort and outside every native
decision: it runs after the sealing transaction has committed and after
the outbox row is written, in its own statement, with any SQL error
caught, counted as a `metric-dropped` row of reason `sidecar`, and
otherwise ignored. A failed, slow, restarted or overflowing sidecar
never rolls back, resubmits, replaces or delays an accepted entry or a
send, and the request's answer is already decided before the write
begins. The correlation is passed to the turn and the dispatcher as an
operational argument beside the native input, and no native message,
type or envelope changes. W1 injects a SQL fault at the entry boundary
and at the duty boundary and asserts the entries, the sends and the
answers equal those of a run with no sidecar.

*Retention.* Two bounds, both enforced on write: a row older than seven
days is deleted by a sweep that runs before each write and removes at
most 256 rows, so idle old rows do expire within seven days of the next
write; and the table holds at most 4,096 rows, the oldest replaced when
it is full. The read says what it covers: the retained window is the
oldest and newest row times, and `complete` means the read exhausted the
retained window, never that a request outside it did not happen or that
anything settled.

*The read.* `requests`, for an admin session only (`ADMIN_READS`), takes
either a request ID or a trace ID, validated to its exact shape before
anything is read, and a cursor; returns at most 100 rows a page, newest
first, with the head it was read at, the retained window and `complete`
or `next`. Diagnosis entries are unchanged: a diagnosis line on the
console carries the request ID as a fourth fixed-shape member, which the
redactor does not touch because it is hex of exact length, and the
sidecar carries the seq of the diagnosis entry. Nothing in `Entry`,
`Duty`, `Beside`, the transport or the replay changes.

### 4.5 The operator surface

`artroom status` reads, for each scope of the repository, with the
caller's session:

- the summary (head, time, counts by type and state);
- the outbox, page by page until `next` is absent, up to 20 pages, and
  reports the sends with no result and the sends with a diagnosis;
- for an admin session, `waiting` for both lists and `incidents` for the
  latest page, each paged the same way;
- for an admin session, nothing of the sidecar unless `--request <id>` is
  given, when `requests` is read for that ID.

Each column names the head its own read was made at, since the reads
are separate and the scope may move between them; the command never
presents one invented snapshot. A read that was refused prints `denied`
for that column, a read that was unavailable prints `unknown`, and a
page that ended with `next` present after the page bound prints `more`
beside the partial count, so a partial count is never shown as a total;
none of these is ever shown as zero. The summary has no outstanding
count, so the outbox read is the count. It is the admin
panel, in the command line, over reads that exist plus one. The page
gains the same view later under the existing admin role rule; it is not
in this delivery.

`docs/operations.md` documents the reads, the command, the slot map and
the kinds, the health route and the post-deploy check.

### 4.6 A health route

`GET /health` answers from validated state, carries no credential and
reads no data:

1. **Configuration.** `sessions` is `ok` only when `sessionsOf(env)` of
   `sessions.ts` returns a configuration, which requires a secret of at
   least 32 bytes and a deployment name of 1 to 128 bytes; otherwise
   `unavailable`, with no detail.
2. **The register.** The selector is deterministic: the `registerScope`
   of the one host configuration the deployment has (`GITHUB_APP_CONFIG`
   or `ARTIFACTS_CONFIG`, the ones `hostBound` of `host-wiring.ts:45-56`
   binds to). With neither, `register` is `unconfigured`; with both
   present and naming different scopes, `ambiguous`; both answer `503`.
   The route asks that scope's Durable Object, through the service
   binding, an internal readiness probe that is not a read: it answers
   `ready` only when storage holds a scope whose status is `active` (the
   native `Status` is `provisional`, `active` or `refused`), `absent` when
   storage has no scope, `not-ready` for `provisional`, `refused` or a
   scope that is not a register, and `unavailable` on any error, with no
   head, no seq and no data. The probe needs no reader and is served by no
   public route. The route waits at most 2 seconds for it; a timeout is
   answered `unavailable` and is an observational limit only, since the
   underlying call may still complete and its result is then discarded.
3. **Answer.** `200 {deployment, version, sessions: ok, register: ready}`
   when both hold; `503 {deployment, version, sessions, register}` naming
   the first failing word otherwise, with those words only.

The route is public. One probe at a time per isolate: concurrent callers
share the in-flight probe's promise, and its result is kept for 5
seconds, so a monitor polling it, or several at once, costs at most one
probe per isolate per 5 seconds; W2 polls it concurrently and asserts the
bound. It has no body, no query and refuses any method but `GET` and
`HEAD`. It is what a deploy script and a monitor poll. The join limiter is
not involved.

### 4.7 A post-deploy check

`scripts/deploy-check.mjs` reads the sink's dataset through the Analytics
Engine SQL API and polls `/health`. It is truthful about sampling and
coverage:

- every count is a sum of `_sample_interval`, never a count of rows, and
  every counter value is a sum of the double times `_sample_interval`, so
  the platform's write-time and read-time sampling are weighted back; the
  p95 of `route` wall time is a weighted quantile over `_sample_interval`;
- the error taxonomy is fixed: an error is a `route` row with end
  `error` (a `5xx`), the denominator is every `route` row of the version
  in the window, both weighted; `refused` rows (`4xx`) are reported
  beside, never counted as errors;
- the query is filtered to blob 3 equal to the version just deployed,
  which the script takes from the deploy's output, so a mixed-version
  window judges only the new version;
- the window is the last 15 minutes; the check fails `no-data` when fewer
  than 100 `route` events (weighted) or no `turn` event of that version
  are in it, fails `stale` when the newest event is older than 5 minutes,
  fails `query` when the SQL API answers anything but `200` with rows, and
  fails `health` when `/health` is not `200`;
- the thresholds are an error rate above 1 percent, a `route` p95 above
  a stated bound, or any `turn` ended `busy`; the bound is first set from
  one observed run on the demo room and recorded in the note that
  delivers it, labelled as observed, as woo's envelope was calibrated
  from a bake; nothing in this note is a measured figure;
- coverage is a gate of its own: any `metric-dropped` row of reason
  `budget` or `sidecar` in the window whose `turn` count is above zero
  fails `coverage`, because a "no busy" pass cannot be claimed when turn
  rows were lost; `aggregated` rows do not fail it, since aggregation
  keeps every end;
- the health check compares the body's `deployment` and `version` with
  the ones just deployed, not only the status code;
- the output states the weighted event count, the coverage (sum of
  `_sample_interval` over rows), the version and the window, so a pass
  says what it saw.

It needs an Analytics Engine read token, a secret in the operator's
environment, never in the repository. The rows-written total of the
Durable Objects is read the same way and reported, not gated, in the
first delivery.

## 5. What is deliberately not done

- No span export, no OTel SDK in process. The data model is OTel-shaped
  where it matters (the trace ID); the pipeline is not built.
- No audit Durable Object. The record is the audit trail.
- No browser telemetry. The page and the Counter stay silent by design.
- No trace context inside any sealed entry, outbox row, transport type or
  replay; correlation is the sidecar of section 4.4.
- No per-member analytics, within the boundary section 4.2 states.
- No dashboard product. The SQL API and the command line are enough until
  there is an operator who is not also the builder.

## 6. No contract change

Draft 1 proposed a `trace` member of `Beside`. Draft 2 withdraws it: a
diagnosis is a sealed input with a fixed schema, and bytes added to it
change hashes and replay, while an unsealed member beside an intent would
still have reached a member-readable outbox row. The sidecar keeps
correlation operational, bounded and admin-only, and leaves every
contract type, every entry and the verifier untouched. Should a sealed
correlation ever be wanted, it is a contract amendment with its own
entry, outbox, transport and replay sections, filed separately.

## 7. Delivery, witnesses and order

One builder request, after the demo, in three heads:

1. **Retain and count.** The observability setting, the sink, the slot
   map, the ten kinds with their slots, the request ID and the trace ID,
   the sidecar table and the `requests` read. Witnesses, W1: the test
   Worker binds a scripted sink; one story over a founded room asserts the
   kinds and every slot each step produces against the table of section
   4.2; one legitimate row of every kind with every end and reason the
   table names is written unchanged, and the fallback row validates; a
   throwing binding, a slow binding and an absent binding give
   byte-identical answer bodies and deliveries, with the slow one never
   awaited; the `tainted` drops; an alarm with more due duties than the
   platform cap leaves sends and entries equal to a run with no sink,
   with every turn's end recoverable from aggregated rows and the
   terminal row naming what was merged; a request with and without each
   header gets a byte-identical answer body and only the two added
   headers differ; `traceparent` cases: valid, uppercase, zero trace ID,
   zero parent ID, wrong length, fifth field, each ignored without a log
   line, and the outgoing header carries only the sampled bit;
   `tracestate` appears nowhere; a SQL fault at the entry boundary and at
   the duty boundary leaves entries, sends and answers unchanged and
   writes one `sidecar` drop row; the sidecar fills on a sealed entry and
   a duty, expires rows older than seven days on the next write, rings at
   4,096, and `requests` is refused to a member session, refuses a
   malformed ID before reading, pages at 100 and reports its window and
   head to an admin session.
2. **See.** `artroom status`, `/health`, `docs/operations.md`. Witnesses,
   W2: the command over the test Worker prints the lines for a room with
   one unanswered send and one incident, shows `denied` for a member and
   the lists for an admin, shows `more` past the page bound and `unknown`
   when a read is unavailable; `/health` answers `503` naming each missing
   or short configuration value, the unconfigured and the ambiguous
   selector, and the absent, provisional, refused, non-register and
   unavailable register, `200` with the deployment and version when all
   hold, refuses `POST`, and under concurrent polling makes one probe per
   5 seconds per isolate with every caller answered.
3. **Judge.** `scripts/deploy-check.mjs` with its bounds from one observed
   run on the demo room, and the MCP server's console kinds. Witnesses,
   W3: against recorded SQL answers the script fails on each threshold,
   on `no-data`, on `stale`, on a wrong version, on a query failure, on a
   failing or mismatched health answer and on `coverage` when a `budget`
   or `sidecar` drop row with turns is in the window, passes on the
   observed figures, and its weighted counts and counter sums equal the
   sums over `_sample_interval` in the recording.

Size, judged against woo's equivalents: head 1 a few hundred lines and
two days; head 2 a day; head 3 a day. Woo's sink and admin panel took two
days once the need was felt (`notes/2026-05-17-admin-stats.md`), and the
gate a week of recalibration; dap's first bounds are set once from an
observed run and tightened later.

## 8. Sources

The survey of 2026-10-12 of `packages/scope/src` (`diag.ts`, `operator.ts`,
`outbox.ts`, `turn.ts`, `limits.ts`, `sessions.ts`, `signed-reads.ts`,
`reads.ts`, `worker.ts`, `object.ts`, `host-wiring.ts`, `sqlite.ts`,
`site/route.ts`), `packages/scope/wrangler.jsonc`,
`packages/contract/src/read.ts` (`Summary`, `Duty`), `packages/replay`,
`docs/deploy.md`, `docs/scopes.md`; the survey of `~/play/woo`
(`spec/operations/observability.md`, `spec/operations/audit.md`,
`spec/reference/cloudflare.md` R10, `src/worker/metrics-sink.ts`,
`src/worker/admin.ts`, `src/net/trace.ts`, `src/net/spans.ts`,
`scripts/net-metrics-ae.ts`, `scripts/net-storage-gate.ts`, `DEPLOY.md`,
`notes/2026-05-17-admin-stats.md`, `notes/2026-07-16-audit-trail-plan.md`,
`notes/2026-07-20-nc8-bake-attempt-1.md`); the W3C Trace Context
recommendation; the Analytics Engine SQL API and limits pages, as the
checker cited them.

## 9. Draft 2 against review `12fc5d1a`

| Correction | Where answered |
|---|---|
| 1. A real health and status boundary | Section 4.6: the register by the configured `registerScope`, an internal readiness probe that is not a read and carries no data, sessions by `sessionsOf`'s validation, a 2 second timeout, a 5 second isolate cache, `GET` only. Section 4.5: `status` over the outbox, waiting and incidents reads with heads, completeness and page bounds; `denied`, `unknown` and `more` never shown as zero; admin reads stay admin; the latest 1,024 incidents stay. |
| 2. The complete metric schema | Section 4.2: eight blobs and six doubles allocated per kind, including request and trace IDs, restarts, timed attempts charged, timed entries written and wrote; the turn's end kept apart from the act's answer; fixed route names and value allowlists; tainted values dropped and counted, never truncated or redacted; a write budget; retention, access and cardinality stated as the boundary. |
| 3. Request identity apart from trace context | Section 4.4: a server-minted request ID always; a validated 32-hex trace ID separately or `none`; `tracestate` never stored or echoed; neither reaches a grant, a key, a judge or an answer; W1 asserts identical answers. |
| 4. Operational, not sealed, persistence | Section 4.4's sidecar table and `requests` read; section 6 withdraws the `Beside` member; no entry, outbox row, transport type or replay changes; W1 asserts a throwing, slow or absent sink changes no answer or delivery. |
| 5. A truthful gate | Section 4.7: `_sample_interval` sums and weighted quantiles, the deployed version filtered, minimum observations and expected kinds, `no-data`, `stale`, `query` and `health` failures, coverage in the output, no figure claimed here; the platform's per-invocation cap met by the sink's budget; W3 covers each failure mode against recorded answers. |

## 10. Draft 3 against review `efc3882d`

| Correction | Where answered |
|---|---|
| 1. Close the schema over its own events | Section 4.2: blob 4 and blob 6 unions enumerate every place and reason the kinds table needs, with the diagnosis steps and events enumerated in the source and checked at their call sites; blob 9 separates the act's answer from the turn's end; numeric ranges and count semantics stated; the fallback row is built from constants and always validates; the MCP kinds get a separately versioned map; W1 writes one legitimate row of every kind, end and reason. |
| 2. Coverage under the hard budget | Section 4.2: the budget is the cap less one reserved for the terminal row; rows are buffered and written after the native answer; `turn` rows beyond the budget are aggregated by place, end, answer and reason with summed doubles, never dropped; other kinds are dropped and counted by kind; W1 drives an alarm past the cap with native effects unchanged. Section 4.7: counter values weighted by `_sample_interval`; a fixed error taxonomy and denominator; a `coverage` gate that fails on lost turn rows; the health body's deployment and version compared. |
| 3. Readiness means an active register | Section 4.6: `ready` only for native status `active`; `not-ready` for provisional, refused or a non-register; a deterministic selector with `unconfigured` and `ambiguous`; a shared in-flight probe per isolate with a 5 second result, tested under concurrent polling; the timeout stated as an observational limit. |
| 4. Sidecar isolation and retention | Section 4.4: best-effort writes after the sealing transaction and the outbox write, errors caught and counted, no rollback or resubmission, correlation passed as an operational argument with native messages untouched; a seven-day sweep on write plus the ring; a validated, paged `requests` read with its window, head and `complete` meaning the window; section 4.5 reports per-column heads and partial counts. W1 injects SQL faults at both boundaries. |
| 5. Trace validation and privacy | Section 4.4: exact lowercase version `00` framing with four fields, non-zero trace and parent IDs, the sampled bit only on the way out, invalid context ignored without logging, the witnesses named; a trace ID stated as untrusted correlation with its collision and linking limits and its boundary, never a secret or an identity; answer-body equality distinguished from the two added headers. |
