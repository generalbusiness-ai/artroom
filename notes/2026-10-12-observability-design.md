# Observability for dap: a design

2026-10-12. Draft 1, for checker review. Hugh's direction, 2026-10-12 17:36
Eastern: draft a dated design in `notes/`, send it to the checker, and tell
the planner that it is to be prioritized soon after the demo. Written
against main `013fac7a5`.

## 1. What this note decides

Dap keeps a strong audit record and almost no operational telemetry. This
note adds the smallest set of instrumentation that lets an operator answer
"is the service healthy, what is it refusing, and why was this request
slow" from retained data rather than from a live tail, and lets a deploy
be judged by a number. It takes its shape from what the woo project built
over two and a half months (`~/play/woo`, about 10,000 lines across 32
files) and keeps the parts that earned their keep there, sized for dap.

It changes no scope contract rule. One small contract addition, a trace
context carried beside an intent, is proposed in section 6 and is reviewed
like any other contract change. Everything else is deployment
configuration, a sink, counters at places that already compute the
numbers, two reads that already exist, and one command.

## 2. What exists today

From a survey of the active source on 2026-10-12:

| Have | Where | Who reads it |
|---|---|---|
| The record: signed intents, hashed entries, retained inputs; the replay verifier with explicit trusts and coverage | every scope; `packages/replay`; `artroom verify` | any member session; the verifier |
| Per-send outbox: each attempt with its answer before and after the send, the acknowledgment, the result or diagnosis | `packages/scope/src/outbox.ts:148-209`, `sqlite.ts:83-86` | any member session (`outbox`, `outbox/:duty`) |
| Operator record: a bounded, text-free incident table per scope (incarnation conflicts, outcome conflicts, resends) and two waiting lists (diagnosed, unanswered) | `packages/scope/src/operator.ts:46-70, 146-152`; `reads.ts:365-390` | an admin session only (`incidents`, `waiting`; `sessions.ts:108-110, 326-328`); no page or CLI calls them; undocumented |
| Diagnoses: one JSON line per port failure, `{event, step, name}`, read-nothing policy and a redactor | `packages/scope/src/diag.ts:31-53`; emitted at `operations.ts:408-670` | `wrangler tail` only; nothing retains it |
| Site-route errors: one redacted text line per failed site read | `packages/scope/src/site/route.ts:74-91` | `wrangler tail` only |

What is absent: the Worker configuration (`packages/scope/wrangler.jsonc`)
has no observability block, no Analytics Engine dataset, no Logpush and no
tail consumer, so even the diagnoses are not retained. Turn restarts and
`busy`, `unavailable` and `rate-limited` answers are computed and discarded
(`turn.ts:113-118, 224-242`; `limits.ts:168-174`). Session issuance and
refusals, dispatch counts, drain passes and stream counts are not counted.
There is no health route, no request or trace identifier, no operations
documentation, and no browser telemetry (the last by design, kept).

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

Taken for dap: the metric sink and slot map (`~/play/woo/src/worker/metrics-sink.ts:38-120`),
the rule that Analytics Engine and not the tail is the signal of record
(woo `DEPLOY.md:205-210`), the acceptance envelope as a post-deploy gate
(`scripts/net-metrics-ae.ts:36-59`), the trace context adopted or minted
per request (`src/net/trace.ts:80-131`), and a health route that answers
from real state.

Not taken: the span export pipeline, the separate audit Durable Object and
the browser activity metrics. Dap's record already is the audit trail,
with better correlation keys than a projection of it, and the page has no
analytics by design.

## 4. The design

### 4.1 Retain what is already emitted

Add to `packages/scope/wrangler.jsonc` the Workers observability setting,
enabled, at full head sampling for now, so the diagnoses and site-route
lines are retained by the platform. One setting; no code. The rate is a
deployment choice recorded in `docs/deploy.md`.

### 4.2 A metric sink and a fixed slot map

One module, `packages/scope/src/metrics.ts`, with one function,
`emit(event)`, that writes a data point to an Analytics Engine binding
`METRICS` when the binding is present and does nothing when it is absent
(a test Worker, a deployment that has not bound one). A write never
throws and is never awaited on the reply path.

The slot map is fixed and documented: blob 1 is the event kind, blob 2 the
scope ID, blob 3 the route or operation, blob 4 the answer or reason, blob
5 the deployment name; double 1 the sample multiplier (always 1 for now),
double 2 the duration in milliseconds where there is one, double 3 a count
where there is one. The index is the scope ID, one index field, as woo
chose one. A new axis gets a new slot; an existing slot never changes
meaning, because every query hard-codes them. Errors bypass sampling.

The event kinds of the first delivery, each at a place that already has
the number:

| Kind | Where | Fields |
|---|---|---|
| `turn` | `turn.ts` at `#close` | answer (`accepted`, `refused`, `unavailable`, `mismatch`), reason, restarts, timed attempts, wrote, duration |
| `drain` | `turn.ts` `#drain` | timed entries written in the turn |
| `route` | `worker.ts` `route` | route name, status class, duration |
| `session` | `sessions.ts` | issued, refused with reason, expired-on-read |
| `signed-read` | `signed-reads.ts` | allowed, refused with reason |
| `join` | `limits.ts` `serve` | served, `rate-limited`, `busy`, refused |
| `dispatch` | `outbox.ts` `Dispatcher.run` | attempts, answers by kind, given up |
| `diagnosis` | `diag.ts` `toConsole` | the same three fields, so a diagnosis is countable as well as readable |
| `incident` | `operator.ts` `record` | kind |
| `stream` | `object.ts` `serving` | open, released |

Each kind has one line of documentation saying what it means, as woo's O3
list does; the table in `docs/operations.md` (section 7) is that list.
Nothing here reads a key, a token, a secret, a text or a field value; the
diagnosis redactor stays where it is, and the sink is given fixed words
and numbers only. A test asserts that no blob ever exceeds 100 code units
and that no event is written with a member of a name on a deny list
(`secret`, `token`, `key`, `authorization`, `credential`).

### 4.3 The MCP server's numbers

Plan 031 measures list sizes, list changes and per-call read counts in
tests. The same numbers are emitted at runtime by the local MCP server to
its own console line, `dap.metric {json}`, with the kinds `tools-list`
(tools, bytes, generation changed), `tool-call` (tool, reads, answer,
duration) and `custody` (phase transitions). The hosted endpoint of plan
031's stage 2 writes the same kinds to the sink. No sink or counter is
added to the page or the Counter browser.

### 4.4 Correlation: the request identifier and the trace context

Every route answer carries a `dap-request-id` header, a random identifier
the Worker mints per request, and the same identifier is the `request`
member of every `route`, `turn`, `session` and `diagnosis` event the
request produces. A client that sends a W3C `traceparent` header has it
adopted: its trace identifier is kept as the request identifier, and the
server mints a child span identifier; a request without one gets a minted
trace context (woo's `adoptOrMintTraceContext`). The sampled flag is
carried and not acted on, since nothing exports spans.

For an act, the correlation key that outlives the request is the one dap
already has: the intent digest and the entry position. Section 6 proposes
carrying the trace context beside the intent so the outbox row and the
entry's diagnosis can name it.

### 4.5 The operator surface

Two reads exist and are unused: `incidents` and `waiting`, for an admin
session. The command `artroom status` reads them for each scope of the
repository, with the outbox's outstanding counts from each summary, and
prints one line per scope: head, outstanding sends, waiting requests by
list, incidents by kind in the last page. It is the admin panel, in the
command line, over reads that already exist. The page gains the same view
later under the existing admin role rule; it is not in this delivery.

`docs/operations.md` documents the two reads, the command, the event
kinds, the health route and the post-deploy check. Today they are
documented only in source comments.

### 4.6 A health route

`GET /health` answers from real state, as woo's does from its catalog
epoch: `200` with `{ deployment, sessions: true|false, register: ok|<reason> }`
when `DEPLOYMENT` and `SESSION_SECRET` are set and the register's summary
is readable through the service binding; `503` with the first failing
check named otherwise. It reads no scope but the register, carries no
credential, and is rate-limited by the platform as any route. It is what
a deploy script and a monitor poll.

### 4.7 A post-deploy check

`scripts/deploy-check.mjs` reads the sink's dataset through the Analytics
Engine SQL API for the last fifteen minutes and fails when the `route`
error-class rate exceeds 1 percent, the `turn` p95 duration exceeds a
stated bound, or any `turn` ended `busy`; it also polls `/health`. The
bounds are first set from one observed run on the demo room and recorded
in the note that delivers them, labelled as observed, as woo's envelope
was calibrated from a bake (`net-metrics-ae.ts:36-50`). It needs an
Analytics Engine read token, a secret set in the operator's environment,
never in the repository. The rows-written budget of the Durable Objects
is read the same way and reported, not gated, in the first delivery.

## 5. What is deliberately not done

- No span export, no OTel SDK in process. The data model is OTel-shaped
  where it matters (the trace context); the pipeline is not built.
- No audit Durable Object. The record is the audit trail.
- No browser telemetry. The page and the Counter stay silent by design.
- No per-member analytics. Blobs carry scope IDs and fixed words; never a
  handle, a key ID or a member reference, so the sink cannot become a
  profile of a person.
- No dashboard product. The SQL API and the command line are enough until
  there is an operator who is not also the builder.

## 6. One contract addition, reviewed separately

A `trace` member of `Beside`, optional, holding the W3C `traceparent` and
`tracestate` strings as the client sent or minted them, at most 512 bytes
together. It is not signed, not judged, not retained as an input, and
changes no answer. The scope records it on the outbox row of each send the
entry causes and on a diagnosis entry, so an operator can follow one
request from the route event to the entry to its sends. This is the only
change to a contract type, and it is a separate request so the rest of
the design does not wait on it.

## 7. Delivery, witnesses and order

One builder request, after the demo, in three heads:

1. **Retain and count.** The observability setting, the sink, the slot
   map, the ten event kinds, the request identifier, and the budget tests
   of section 4.2. Witness: the test Worker binds a scripted sink; one
   story over a founded room asserts the kinds and fields each step
   produces, that the deny-list test holds, and that a missing binding
   drops nothing on the floor but the write.
2. **See.** `artroom status`, `/health`, `docs/operations.md`. Witness: the
   command over the test Worker prints the lines for a room with one
   waiting request and one incident; `/health` answers `503` with the
   right name for each missing setting and `200` when all hold.
3. **Judge.** `scripts/deploy-check.mjs` with its bounds from one observed
   run on the demo room, and the MCP server's console kinds. Witness: the
   script against a recorded SQL answer fails on each bound and passes on
   the observed figures.

The contract addition of section 6 is its own request and can land before
or after head 1.

Size, judged against woo's equivalents: head 1 a few hundred lines and a
day or two; head 2 a day; head 3 a day. Woo's sink and admin panel took
two days once the need was felt (`notes/2026-05-17-admin-stats.md`), and
the gate a week of recalibration; dap's first bounds are set once from an
observed run and tightened later.

## 8. Sources

The survey of 2026-10-12 of `packages/scope/src` (`diag.ts`, `operator.ts`,
`outbox.ts`, `turn.ts`, `limits.ts`, `sessions.ts`, `reads.ts`,
`worker.ts`, `object.ts`, `site/route.ts`), `packages/scope/wrangler.jsonc`,
`packages/replay`, `docs/deploy.md`, `docs/scopes.md`; the survey of
`~/play/woo` (`spec/operations/observability.md`, `spec/operations/audit.md`,
`spec/reference/cloudflare.md` R10, `src/worker/metrics-sink.ts`,
`src/worker/admin.ts`, `src/net/trace.ts`, `src/net/spans.ts`,
`scripts/net-metrics-ae.ts`, `scripts/net-storage-gate.ts`, `DEPLOY.md`,
`notes/2026-05-17-admin-stats.md`, `notes/2026-07-16-audit-trail-plan.md`,
`notes/2026-07-20-nc8-bake-attempt-1.md`).
