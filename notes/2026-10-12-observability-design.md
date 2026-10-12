# Observability for dap: a design

2026-10-12. Draft 2, for checker review. Hugh's direction, 2026-10-12 17:36
Eastern: draft a dated design in `notes/`, send it to the checker, and tell
the planner that it is to be prioritized soon after the demo. Written
against main `013fac7a5`. Draft 1 (`baa0e21e`) received changes requested
in review `12fc5d1a`, with five corrections; Draft 2 answers them, and
section 9 maps them.

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

**The slot map.** Eight blobs and six doubles, fixed, documented, with the
scope ID as the one index. A new axis gets a new slot; an existing slot
never changes meaning, because every query hard-codes them.

| Slot | Holds | Allowed values |
|---|---|---|
| blob 1 | kind | the ten kinds below |
| blob 2 | deployment | the `DEPLOYMENT` setting, already bounded at 128 bytes |
| blob 3 | version | the Worker version ID from the platform's version metadata binding, or `unknown` |
| blob 4 | route or operation | one of the fixed route names of `worker.ts`'s table (`found`, `acts`, `preparations`, `settle`, `summary`, `items`, `history`, `entries`, `outbox`, `duty`, `log`, `retained`, `sessions`, `stream`, `incidents`, `waiting`, `credential`, `site`, `page`, `health`, `requests`), never a path |
| blob 5 | answer or end | `accepted`, `refused`, `unavailable`, `mismatch`, `ok`, `error`, `idle`, `busy`, `clock-behind`, `issued`, `served`, `dropped` |
| blob 6 | reason or name | a member of `RefusalReason`, `UnavailableReason`, `MismatchReason`, `ReadRefusal`, `SessionRefusal`, a diagnosis `event`, an operator record kind, or `none` |
| blob 7 | request ID | 16 hexadecimal characters, server-minted (section 4.4) |
| blob 8 | trace ID | 32 hexadecimal characters from a validated `traceparent`, or `none` |
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
| `turn` | `turn.ts` at `#close` | the operation (`acts`, `preparations`, `found`, `alarm`) | the turn's end (`idle`, `busy`, `clock-behind`, `unavailable`) or, for an act, its answer | the answer's reason or `none` | wall time | restarts | timed attempts charged | timed entries written | wrote |
| `route` | `worker.ts` `route` | the route name | `ok` or `error` | the status class as `2xx`..`5xx` | wall time | 0 | 0 | 0 | 0 |
| `session` | `sessions.ts` | `sessions` | `issued` or `refused` | the `SessionRefusal` or `none` | 0 | 0 | 0 | 0 | 0 |
| `signed-read` | `signed-reads.ts` | the read name | `ok` or `refused` | the `ReadRefusal` or `none` | 0 | 0 | 0 | 0 | 0 |
| `join` | `limits.ts` `serve` | `acts` | `served`, `refused` or `unavailable` | `rate-limited`, `busy` or `none` | 0 | windows open | waiting | 0 | 0 |
| `dispatch` | `outbox.ts` `Dispatcher.run` | `dispatch` | `ok` | `none` | 0 | attempts made | acknowledged | given up (diagnosed) | 0 |
| `diagnosis` | `diag.ts` `toConsole` | the diagnosis `step` when it is a fixed word of the source, else `none` | `error` | the diagnosis `event` | 0 | 0 | 0 | 0 | 0 |
| `incident` | `operator.ts` `record` | `incidents` | `error` | the record kind | 0 | 1 | 0 | 0 | 0 |
| `stream` | `object.ts` `serving` | `stream` | `ok` | `none` | 0 | open | released | 0 | 0 |
| `metric-dropped` | `metrics.ts` | `metrics` | `dropped` | `budget` or `tainted` | 0 | dropped count | 0 | 0 | 0 |

`turn`'s blob 5 keeps the turn's internal end and the act's public answer
apart by the operation in blob 4: an `alarm` turn has an end and no
answer; an `acts` turn has the answer, and its end is `idle` unless the
turn ended early, when the end is written instead and the reason says
which. Timed attempts charged (double 4) and timed entries written
(double 5) are different numbers and are both kept.

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

**Write budget.** The platform caps data points per invocation. The sink
writes at most 16 per request and at most 32 per alarm; the seventeenth
and later are counted and written as one `metric-dropped` with reason
`budget` at the end of the invocation. A `turn` is never the dropped one:
the budget is spent on `route` and `turn` first, then the rest in order of
emission.

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
server-minted request ID, 16 hexadecimal characters from a cryptographic
random source, returned in a `dap-request-id` header and written as blob
7 of every event the request produces. Separately, a request that carries
a W3C `traceparent` header has it parsed: a version `00` header with a
32-hex trace ID that is not all zeros, a 16-hex parent span ID and two
flag hex digits is valid; anything else is ignored as if absent, and
nothing is logged about it. A valid trace ID is written as blob 8 and
returned unchanged in the answer's `traceparent` header with a fresh span
ID. The request ID is never replaced by the trace ID, since one trace
spans many requests and a caller's ID can collide or be chosen.
`tracestate` is opaque vendor text: it is not stored anywhere, not
written to the sink, and not echoed. Neither identity reaches a grant, an
idempotency key, a judge or an answer; W1 asserts that a request with and
without each header gets byte-identical answers.

**The sidecar.** Correlation outlives the request in an operational table
of the scope's storage, `request_index`, beside the outbox and the
operator record and like them never part of a sealed entry, never hashed,
never replayed and never read by the verifier: rows of `(request ID,
trace ID or null, time, seq or null, duty or null)`, written when a turn
seals an entry for the request and when the outbox records a duty the
entry caused. It is a ring of at most 4,096 rows per scope, oldest
replaced, and rows older than seven days are replaced first. One new
read, `requests`, for an admin session only (`ADMIN_READS`), returns the
rows for one request ID or one trace ID, with the head it was read at and
`complete`. Diagnosis entries are unchanged: a diagnosis line on the
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

Each line names the head the reads were made at. A read that was refused
prints `denied` for that column, a read that was unavailable prints
`unknown`, and a page that ended with `next` present after the page bound
prints `more`; none of these is ever shown as zero. The summary has no
outstanding count, so the outbox read is the count. It is the admin
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
2. **The register.** The register's scope ID is the deployment's
   configured `registerScope` (the host configuration that `hostBound` of
   `host-wiring.ts:45-56` already binds to); with no host configured,
   `register` is `unconfigured`. The route asks the register's Durable
   Object, through the service binding, an internal readiness probe that
   is not a read: it answers `ready` when the scope exists and is not
   provisional, `absent` when storage has no scope, `unavailable` on any
   error, and nothing else, with no head, no seq and no data. The probe
   needs no reader and is served by no public route; it is bounded by a
   2 second timeout, after which `unavailable`.
3. **Answer.** `200 {deployment, version, sessions: ok, register: ready}`
   when both hold; `503` naming the first that does not, with those words
   only.

The route is public and cached in the isolate for 5 seconds, so a monitor
polling it costs at most one probe per isolate per 5 seconds; it has no
body, no query and refuses any method but `GET` and `HEAD`. It is what a
deploy script and a monitor poll. The join limiter is not involved.

### 4.7 A post-deploy check

`scripts/deploy-check.mjs` reads the sink's dataset through the Analytics
Engine SQL API and polls `/health`. It is truthful about sampling and
coverage:

- every count is a sum of `_sample_interval`, never a count of rows, so
  the platform's write-time and read-time sampling are weighted back; the
  p95 of `route` wall time is a weighted quantile over
  `_sample_interval`;
- the query is filtered to blob 3 equal to the version just deployed,
  which the script takes from the deploy's output, so a mixed-version
  window judges only the new version;
- the window is the last 15 minutes; the check fails `no-data` when fewer
  than 100 `route` events (weighted) or no `turn` event of that version
  are in it, fails `stale` when the newest event is older than 5 minutes,
  fails `query` when the SQL API answers anything but `200` with rows, and
  fails `health` when `/health` is not `200`;
- the thresholds are an error-class rate above 1 percent, a `route` p95
  above a stated bound, or any `turn` ended `busy`; the bound is first
  set from one observed run on the demo room and recorded in the note
  that delivers it, labelled as observed, as woo's envelope was calibrated
  from a bake; nothing in this note is a measured figure;
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
   4.2; a throwing binding, a slow binding and an absent binding give
   byte-identical answers and deliveries, with the slow one never awaited;
   the `tainted` and `budget` drops; a request with and without each
   header gets byte-identical answers and the right headers back; a
   malformed `traceparent` is ignored; `tracestate` appears nowhere; the
   sidecar fills on a sealed entry and a duty, rings at 4,096, and
   `requests` is refused to a member session and answered to an admin
   session with its head.
2. **See.** `artroom status`, `/health`, `docs/operations.md`. Witnesses,
   W2: the command over the test Worker prints the lines for a room with
   one unanswered send and one incident, shows `denied` for a member and
   the lists for an admin, shows `more` past the page bound and `unknown`
   when a read is unavailable; `/health` answers `503` naming each missing
   or short configuration value and the absent and unavailable register,
   `200` when all hold, refuses `POST`, and makes one probe per 5 seconds
   under repeated polling.
3. **Judge.** `scripts/deploy-check.mjs` with its bounds from one observed
   run on the demo room, and the MCP server's console kinds. Witnesses,
   W3: against recorded SQL answers the script fails on each threshold,
   on `no-data`, on `stale`, on a wrong version, on a query failure and on
   a failing health answer, passes on the observed figures, and its
   weighted counts equal the sums of `_sample_interval` in the recording.

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
