# The hosted MCP endpoint: plan 031, stage 2

Date: 2026-10-13. Status: Draft 3, for checker review (Draft 1 was
20e2344d, Draft 2 d69b46ba; the checker's reviews 6a262c93 and 89ec44b0
are answered in section 10).
Requested by Hugh on 2026-10-13 at 11:03 Eastern: "the hosted MCP
endpoint should be prioritized", right after the discovery head (request
f9ca5f96).

Plan 031 built one MCP service for every dap application and landed it as
`@generalbusiness/dap-mcp` with the `dap mcp` command (main `bd02ecff`).
That service runs as a process on the agent's own machine, signing with a
key in the agent's `ARTROOM_HOME`. Stage 2, named in plan 031 sections 7
and 11, is the same service served from the scope Worker at `POST /mcp`,
for agents on hosts that cannot run a process. This note is its design.

## 1. What the endpoint is

A hosted agent is a member of one repository, of kind `agent` with a
recorded controller, whose signing key lives in the Worker and never
leaves it. The agent's host speaks MCP to `https://<worker>/mcp` with a
bearer token. Every call runs the same `McpService` as `dap mcp` runs
locally: the same tools, the same descriptions, the same custody rules,
the same four answers. Only three ports differ: the signer (a key held in
a Durable Object instead of a file), the reader (an in-process call to the
Worker's own routes instead of HTTP to a remote service), and the custody
store (SQLite in that Durable Object instead of files under
`private/mcp-custody`). The HTTP layer is written once, for the Worker and
for the local loopback server, and validates what the 2026-07-28 revision
requires (section 3.4); that is a change to the local server too.

Not in this head, though in the same stage: OAuth (plan 031 item 8), the
pinned `diff` and `file` reads, resources and prompts. Each follows as its
own head once the endpoint serves. Discovery (request f9ca5f96) is this
head's predecessor.

## 2. What exists, as read on main `bd02ecff`

- `McpService` (`packages/mcp/src/service.ts` 29-49, 178-188) takes a
  `ServerPort`: `service`, `fetch`, `signer`, `config`, `custody`, `mode`,
  `now`, `pause`, `every`. Nothing in `service.ts`, `inventory.ts`,
  `custody.ts`, `wire.ts`, `reads.ts` or `catalogue.ts` imports a Node
  module; the runtime globals are `setInterval`, `setTimeout`,
  `crypto.randomUUID` and `TextEncoder`, all present in a Worker. Every
  Node import is in `node.ts` (24-27).
- `Wire.handle(message, session, send, owner)` (`wire.ts` 145-156) serves
  both wire revisions. The legacy session keeps `told`, the generation
  last listed, set on `tools/list` (191) and compared by `watchLegacy`
  (121-128); the service takes no snapshot at construction (178-188), its
  first `snapshot()` raises nothing (213-215). The loopback server
  (`node.ts` 356-473) reads `Origin`, `Authorization` and
  `Mcp-Session-Id` and nothing else: no `MCP-Protocol-Version`,
  `Mcp-Method` or `Mcp-Name` header is read; an unknown method answers
  `200` with `-32601` (`wire.ts` 198, 262); the revision is chosen by
  `_meta` alone (104-105).
- The custody contract (`custody.ts` 126-143): `lock`, `exclusive`,
  `read`, `write` with read-back, `unresolved`, `segment`, `segmented`;
  `UNRESOLVED_MOST` 256, `RECORD_BYTES` 2 MiB over the canonical record,
  `KEY_BYTES` 128, outcomes spilled to segments past 64 (63-68, 209-218).
  The file store (`node.ts` 112-289) archives terminal records beyond
  1,024 or older than 30 days into indexed 64 MiB files on every terminal
  write (143-203, 257); `read` finds an archived record through the index
  (243-253), so a later call with the same key returns its retained answer
  (`custody.ts` 271-290, 303-308); segments are never deleted.
- The scope Durable Object (`packages/scope/src/object.ts`) serializes
  its work with an in-memory promise chain (`turn.ts` 95-103, 131-132) and
  commits in `transactionSync` (129-132); it uses no
  `blockConcurrencyWhile`.
- `platform:membership` (`packages/platform/src/membership.ts`): a key
  enters only by an invitation signed by an admin (`invite-key` 376,
  `membership.invite`, or the recovery key) and an `enrol` (417) signed by
  the **new** key with `{invitation, secret}`, which becomes `key.id`
  (690-693); an agent member is made by `add-member` (431,
  `membership.manage`) with kind `agent` and a `controller` party that must
  be an active person member (443-452); `revoke-key` and `remove-member`
  need `membership.manage` or the recovery key. The membership never sees
  the secret, only its digest (676-684). The command line mints a person
  invitation as `artroom-invite:` with the secret in the link
  (`commands.ts` 788-812); the Page only consumes a link.
- Signed reads (`signed-reads.ts` 104-128, 293-346) bind `to` (scope ID,
  not incarnation), `actor`, one `read` name, one `arg` and `notAfter`
  under the domain `artroom-read-1`; verification is by any key, with
  eligibility from the key's recent entries. There is no general signed
  statement verifier; each domain in `contract/src/intent.ts` 12-21 and
  `contract/src/session.ts` 19 has its own.
- The Worker (`worker.ts`): one object binding `SCOPES`, no `/mcp` route,
  1 MiB body bound (196, 219-241), join limiter keyed by connecting
  address (`limits.ts` 56; 60 s window, 10 failures). Deployment:
  `packages/scope/wrangler.jsonc`, `SESSION_SECRET` and `DEPLOYMENT`
  outside the file, redeploy with `--keep-vars` (`docs/deploy.md`).
- Platform limits that bind this design: one SQLite row, value, string
  or BLOB at most 2 MB; a statement at most 100 KB; 10 GB per object;
  writes fail with `SQLITE_FULL` at the limit while reads and deletes
  still work; in-memory state is lost on eviction or an uncaught
  exception while SQLite remains; requests to one object interleave at
  `await` points except during storage operations (input gates), and
  responses are held until pending writes persist (output gates);
  `transactionSync` is the atomic read-modify-write; `blockConcurrencyWhile`
  is for the constructor, not per request.
- The Worker test harness: `packages/scope/vitest.worker.config.ts` runs
  the `*.scope.test.ts` files of the MCP package in `workerd` with the
  bindings of `packages/scope/wrangler.test.jsonc` (`SCOPES`, `AS_DEPLOYED`,
  `NET`, `PLATFORM`, SQLite classes). An agent object class is one more
  entry there.

## 3. The design

### 3.1 Objects

Two Durable Object classes, both SQLite-backed:

- **`McpRegistry`**, one per repository, named by the membership scope ID.
  It holds the list of agents of that repository (agent object ID, member
  handle, key ID, state) and the consumed identities of control requests.
  It is the only place that creates an agent object.
- **`McpAgent`**, one per agent, created by the registry with a fresh
  unique ID. It holds the agent's key, its bearer digest, its
  configuration, its legacy sessions, its custody records and segments,
  and its consumed control identities. All MCP traffic for one agent and
  every change to it runs inside this object, so one agent's sessions,
  subscriptions and custody are kept apart from every other agent's by
  construction; the control checks of section 3.2 are what keep the
  control plane apart, and partitioning does not replace them.

The key is an Ed25519 seed of 32 bytes, generated in the object with
`crypto.getRandomValues`, stored as a BLOB in the agent's `agent` row, and
restored on each start by the same `secretSigner(seed)` the local service
and its tests use; no route reads that row, and the key never leaves the
object. The `credential` tool keeps its meaning (the agent's own join
credential as membership retains it) and does not return the seed.

### 3.2 Control requests: who may create, re-issue and retire

A **control request** is a signed statement under a new domain,
`artroom-mcp-control-1`, in `packages/contract/src/session.ts` beside the
read and session domains, with its own verifier beside `verifySignedRead`:

```
{ v: 1, action: "create" | "bearer" | "retire",
  service: <the Worker's origin>,
  membership: <ScopeRef: scope, inc, kind "membership">,
  agent: <agent object ID, or null for create>,
  actor: <KeyId of the signer>,
  body: <digest of the canonical request body>,
  op: <caller-chosen identity, 1 to 128 bytes>,
  notAfter: <time> }
```

carried as `Authorization: Control <b64url canonical JSON>.<sig>` on the
`/mcp/agents` routes. The Worker verifies the signature by `actor`, that
`service` is its own origin, that `membership` names the repository's
membership **with its incarnation**, that `action` matches the route and
`agent` matches the path, that the body's digest matches, and that
`notAfter` is within the intent lifetime. Then it checks **current
authority** by reading the membership through the same in-process reader
the agents use: `actor` must be an active key of an active member, and
that member must either hold `membership.manage` (an admin, stated
explicitly as such in the response and the recipe) or be the recorded
`controller` of the agent member the request names; for `create`, the
controller of the member named in the body. A revoked key, an ended
member, another repository or another incarnation refuse `403` with a
fixed body.

**Reservation before any handoff.** A control request's identity is the
tuple (`actor`, `membership` with incarnation, `action`, `agent`, `body`
digest, `op`), its fingerprint. Before the registry or the agent object
crosses to another object or awaits anything that can fail, it records the
request durably in one `transactionSync`:

- For `create`, the registry inserts a reservation row keyed by `op`:
  the fingerprint, a freshly allocated agent object ID, state `reserved`.
  Two concurrent requests with the same `op` cannot both insert; the
  second reads the row and joins the same reservation. Only then does the
  registry call the agent object, passing `op` and the body.
- The agent object, on its first call, generates the seed and writes it
  with state `enrolling` in one transaction, before building the envelope;
  on a later call with the same `op` it finds the seed and resumes. The
  `enrol` envelope is kept in custody before it is sent, as section 3.3
  says, so a resume after any reset resubmits the exact envelope or
  settles it, never signs a second one; the invitation is therefore
  consumed by one key only, and no enrolled key is stranded.
- When the enrol is decisive and read back, the agent object writes the
  bearer digest, the answer and state `enrolled` in one transaction; the
  registry then writes the answer and state `complete` in one transaction
  **before** replying. A reset anywhere between these steps leaves a
  resumable row, and the next request with the same `op` resumes from it.
- For `bearer` and `retire`, the agent object writes the fingerprint, the
  new bearer digest or the retired state, the deletion of every session,
  the marking of every open stream to close, and the answer, in **one**
  transaction, so the rotation and its answer cannot part.

Replay rules: the same `op` with the same fingerprint returns the stored
answer (including the bearer shown at creation) or resumes the unfinished
work; the same `op` with any other fingerprint, or another action or
target, refuses `409`. Current authority is checked again on every
attempt, including a resume: a controller or admin whose authority ended
between attempts refuses `403`, and the reservation stays, so an admin can
still `retire` the agent. Unfinished reservations are never dropped,
whatever `notAfter` says; completed answers are retained for seven days
past `notAfter` for lost-reply replay, then the `op` refuses `409` as
stale, stated in the error. Signed reads are not reused for any of this:
they bind a read name and argument, not an action, a target or a body.

### 3.3 Enrolment: how the hosted key becomes a member key

Membership admits a key only by an invitation and an `enrol` signed by
that key, so the Worker's key must sign its own `enrol`. The sequence,
which is the membership's own and adds no permission:

1. An admin performs `add-member` with `kind: agent`, the agent's handle
   and `controller` naming an active person member (through the Page, the
   command line's `dap act`, or their own MCP connection; the W1 recipe
   lists the calls).
2. An admin performs `invite-key` for that member with `kind: agent`,
   `inviteHash` the digest of a secret of 32 random bytes minted where
   the admin is, and `inviteEnds`; the invitation's item number is the
   act's result.
3. The controller (or an admin) sends `create` with body
   `{ membership, member, invitation, secret, handle }`: the same
   information as the Start branch's agent-key invitation carries.
4. The registry creates the agent object; the object generates its key,
   builds the `enrol` intent `{invitation, secret}` and keeps the signed
   envelope in its own custody **before** sending, as the command line's
   `join` keeps its envelope privately first; sends it through the
   in-process reader; on `accepted` it reads the membership back and
   confirms the key is active for that member; on an unknown outcome it
   resubmits the exact envelope, as custody does for every act; on a
   refusal (invitation lapsed, wrong secret, key in use) it retires itself
   and the `create` answers with the membership's reason. The secret is
   where the membership puts it: in `enrol`'s signed fields, which the
   membership hashes and retains in its admitted history as native bytes
   (`membership.ts` 417-421, 679-684), and in the envelope custody
   retains as it retains every signed act. The hosted layer keeps no
   further copy: not in the `agent` row, the registry, a log or the
   configuration; and no native byte is changed to make that so.
5. The answer is `{ agent, key, handle, bearer }`, the bearer shown this
   once (and again only by the same `op`, section 3.2).

Revocation is also the membership's own: `revoke-key` or `remove-member`
by an admin makes the key's intents refused everywhere; `retire` by the
controller or an admin retires the bearer, ends every session and closes
every stream of that agent. The recipe does both. A `bearer` request
re-issues the bearer and likewise ends every session and stream, so a
stolen bearer's connections do not outlive the re-issue.

### 3.4 Routes and the HTTP layer

| Route | Authorization | What it does |
|---|---|---|
| `POST /mcp/agents` | `Control`, action `create` | Creates and enrols an agent; answers once per `op` |
| `POST /mcp/agents/<id>/bearer` | `Control`, action `bearer` | New bearer; ends sessions and streams |
| `DELETE /mcp/agents/<id>` | `Control`, action `retire` | Retires the bearer; ends sessions and streams |
| `POST /mcp` | `Bearer <agent-id>.<secret>` | One JSON-RPC request or notification, either revision |
| `GET /mcp` | `Bearer`, `Mcp-Session-Id` | The 2025-11-25 server stream for that session |
| `DELETE /mcp` | `Bearer`, `Mcp-Session-Id` | Ends that 2025-11-25 session |

The HTTP layer is one module, `packages/mcp/src/http.ts`, used by the
Worker's `fetch` and by `node.ts`'s loopback server, so both validate the
same way; `node.ts` keeps its per-launch bearer, loopback bind and 4 MiB
bound, the Worker keeps its 1 MiB bound. The rules, from the 2026-07-28
transport and the 2025-11-25 transport:

- `Origin` present → `403` (both revisions; no CORS headers are sent).
- Bearer missing, malformed, wrong or retired → `401`, constant-time
  compare of the secret's digest, counted per connecting address with the
  join limiter's shape (ten failures per minute, then the limiter's
  refusal).
- The revision is chosen by the request: a POST whose body carries
  `_meta["io.modelcontextprotocol/protocolVersion"]` or an
  `MCP-Protocol-Version` header of `2026-07-28` is modern; a POST that is
  `initialize` or carries `Mcp-Session-Id` is legacy; anything else →
  `400` with `-32600`.
- Modern: `MCP-Protocol-Version` is required and must equal the `_meta`
  version → else `400` with `-32020` (`HeaderMismatch`); a version the
  server does not serve → `400` with `-32022` and `supported`;
  `Mcp-Method` is required and must equal `method`; `Mcp-Name` is required
  on `tools/call` and must equal `params.name` after decoding the
  `=?base64?…?=` sentinel, and must contain only header-safe characters
  → else `400` with `-32020`; a method the server does not implement →
  `404` with `-32601`; a notification → `202` with no body; `GET` and
  `DELETE` without `Mcp-Session-Id` → `405`. No tool declares
  `x-mcp-header`, so no `Mcp-Param-*` header is expected, and one that is
  present is ignored as an intermediary would.
- Legacy (2025-11-25 transport): `initialize` mints a session ID; a
  request, `GET` or `DELETE` with an unknown or ended session → `404`; a
  request other than `initialize` without `Mcp-Session-Id` → `400`; an
  `MCP-Protocol-Version` header that is present and not a version the
  server serves (`2025-11-25`, or `2025-03-26` and `2025-06-18` as names
  of the same handling) → `400` before dispatch, on `POST`, `GET` and
  `DELETE` alike ("if the server receives a request with an invalid or
  unsupported MCP-Protocol-Version, it MUST respond with 400 Bad
  Request"); an absent header uses the session's negotiated version, or
  `2025-03-26` for `initialize`, as the revision says a server should
  assume; `Mcp-Method` and `Mcp-Name`, which only the modern revision
  defines, are ignored on a legacy request; a second `GET` for the same
  session replaces the first, which closes without detaching its
  replacement; a notification → `202`; `Last-Event-ID` is ignored, streams
  are not resumable, stated in the response to `GET`.
- Both: a body over the bound → `413`; a batch → `400` with `-32600`; a
  frame that is not a request or notification → `400` with `-32600`.

Every error body is a JSON-RPC error with the request's `id` when one was
parsed and `"id": null` when the id could not be detected (a parse error
or an invalid request), as JSON-RPC 2.0 requires; a fixed message that
names the header or rule by name and never its value, the request text or
any secret; and the code above. The message is for correlation, the code
is the contract. Header safety is judged on the **raw** header value as
received (visible ASCII, space and tab only), before any sentinel
decoding; a sentinel value that does not decode as base64 of valid UTF-8
is a malformed header, `400` with `-32020`.

### 3.5 Wire and sessions

`Wire` runs inside the agent object with one bounded change: today its
legacy session holds a single `told`, which `tools/list` sets to the
listed generation (`wire.ts` 191) and `watchLegacy` also sets just before
it sends a notification (121-128), so one field mixes a list with a
delivery. The change splits it: `listed`, the generation the client last
listed, set only by `tools/list` and written through a persistence hook
the transport supplies (the loopback server supplies one that keeps it in
memory, the Worker one that writes the session row in the same
synchronous transaction as the request); and `notified`, the generation
last written to a given stream, held per stream in memory and never
persisted, because a stream write is not a receipt. The persisted legacy
session row is (`id`, negotiated version, initialized flag, declared
capabilities, `listed`), so a session survives eviction and only its open
stream is lost.

Reconciliation: when a legacy stream opens (first open or reconnect) and
when the object starts, the object computes the current generation and,
if it differs from the session's durable `listed`, writes one
`notifications/tools/list_changed` to that stream and sets the stream's
`notified`; the watcher then continues, notifying a stream only when the
current generation differs from both its `notified` and the session's
`listed`. So a change made while the object was evicted, or while no
stream was open, is told once at the next stream, and told again on a
later stream only if the client has still not listed. When a second `GET`
replaces a session's stream, the old stream's close detaches only the old
stream's subscription, keyed by the stream, never the replacement's.

Modern `subscriptions/listen` is per connection, as plan 031 section 7
says: its state is in memory with the stream and ends with it; a client
whose listen stream closed reopens it and receives the acknowledgement
the revision defines, carrying the subscription ID and the notification
types honored, and nothing from before the reopen is replayed. At most 16
legacy sessions and 4 open streams per agent counting legacy streams and
modern listens together; the oldest session ends when a 17th initializes,
and a 5th stream is refused `409`. Endings are of two kinds and the
witnesses tell them apart: graceful, when `retire`, `bearer` or `DELETE`
ends sessions and closes streams with a final event; and abrupt, when
eviction or an exception drops streams with no event, after which the
session rows are still there.

### 3.6 Custody

A SQLite `CustodyStore` in the agent object, keeping the contract and the
file store's semantics:

- **Records.** A `record` table keyed by identity ID with phase, times and
  the canonical record bytes in **chunks** of at most 1 MiB in a `chunk`
  table (identity, index, bytes), so the 2 MiB record contract fits under
  the platform's 2 MB row ceiling with the row overhead; `write` stores the
  chunks and the row in one `transactionSync`, then reads the chunks back
  and compares the digest before returning, as the file store reads back.
  Outcomes are partitioned by **bytes**, not only by count: the record
  holds outcomes inline while they number at most 64 and their canonical
  bytes stay under 256 KiB; beyond either, outcomes spill in order to a
  `segment` table whose rows are each at most 512 KiB, a single outcome
  larger than that split across consecutive rows by part index, with the
  record's segment index (row count, byte count, last outcome ordinal)
  written in the same transaction as the rows, so every outcome, however
  large or many, is retained and readable in order under the platform's
  2 MB row ceiling, and an interrupted spill leaves no row and no index
  change. The existing 64-outcome rule stays as the count half of this.
- **Archive, not deletion.** On every terminal write, terminal records
  beyond the newest 1,024 or older than 30 days move to an `archive` table
  with the same bytes and an index by identity, in the same transaction;
  `read` consults `record` then `archive`, so a later call with the same
  idempotency key returns its retained answer, never prepares or signs
  again; segments are retained with their record. Nothing is deleted by
  this head; an expiry would be a separate contract and is not proposed.
- **Growth, reservation and full.** Custody has its own budget per
  agent, 1 GiB (stated in `docs/mcp.md`), well under the object's 10 GB;
  control rows, sessions, configuration and the key have a separate
  budget of 16 MiB, so neither can starve the other. The custody budget
  is accounted as `used + reserved`: when an identity is admitted
  (`keep`, `prepare`, the first `step`), the store reserves its
  **completion space** in the same transaction, `RECORD_BYTES` (2 MiB)
  for the record's final form plus 1 MiB for its segments; the
  reservation is released, and the actual bytes counted, when the record
  becomes terminal and archived. Admission refuses `full` with the reason
  `bytes` before anything is signed or sent when `used + reserved` plus
  the new reservation would cross the budget. Because every in-flight
  identity holds its completion space, a result that arrives after
  dispatch (the native `settle` appends a receipt and writes the changed
  record) always has room, whatever other records have done to the
  budget since, so a decisive answer is never lost for lack of space and
  an envelope is never replaced; `SQLITE_FULL` on a write that is within
  budget rolls the transaction back and is answered `full`, existing
  records stay readable, `settle` still works. Recovery is a later
  `export` control action, listed as owed; until then the controller
  retires the agent and creates another.
- **Locks and admission.** The object is single-threaded but interleaves
  at `await`, so the store's `lock` and `exclusive` are real: a promise
  chain per identity and one for admission, as the scope object's `Queue`
  (`turn.ts`), honored by every keep, send, settle and step as `Custody`
  already requires; the 256 admission (count the unresolved, insert the
  record) runs inside one `transactionSync` with no `await`, so two
  admissions at capacity cannot both succeed; publication (chunks, row,
  phase) is one synchronous transaction; a send is made only after that
  transaction and its read-back, and the output gate holds the response
  until the write is durable. Key, configuration, bearer and session
  changes are synchronous transactions too. There is no cross-process
  case, so no reclaim lock and no dead-reclaimer duty.

### 3.7 Signing, reading and configuration

The signer is the object's seed through the existing `secretSigner`. The
reader is the service's own `Reads` with a `fetch` that dispatches in
process: it accepts only a URL whose origin is the Worker's configured
public origin and whose path begins with `/v1/`, builds a `Request` and
calls the Worker's `route` function with the object's binding; any other
URL is refused without a network call, and the agent object makes no
outbound `fetch` at all. The agent's reads, acts and session requests
therefore take the same routes, the same session tokens from membership
and the same signed-read fallback as a remote caller's. Reads through
`route` await outside storage operations, so other requests to the agent
may interleave there; that is why custody holds its own locks (section
3.6).

The configuration port reads the `agent` row: service (the Worker's
public origin), handle, register, repository and roots, written at
creation from the registry's repository and extended by the `room` tools
as the local service extends its config file, in a synchronous
transaction; no secret is in it. The list generation and the per-call
derivation are the same code; the budgets of plan 031 section 9 are
measured as the service's `CallResult`, unchanged; the HTTP framing
overhead is measured once and stated beside the modern metadata figure.

## 4. The Start branch

The Start branches add an agent-key invitation link
(`artroom-agent-key:…`) carrying membership, member, invitation, secret
and handle, by which an agent's own process enrols itself. This head
does not wait for Start and adds no permission: the `create` body carries
the same fields, and the enrolment is the membership's own `invite-key`
and `enrol`. When Start lands, a `create` that takes that link as its body
is a parser, nothing more. The checker's request 34c4 (join parity after
Start) covers the local `join` tool and this route.

## 5. Deployment

`wrangler.jsonc` gains the `REGISTRIES` and `AGENTS` bindings to
`McpRegistry` and `McpAgent` with a SQLite migration (`v2`). No new
variable and no new secret: seeds, bearer digests and envelopes live in
the objects. The redeploy keeps `SESSION_SECRET` and `DEPLOYMENT` with
`--keep-vars`, from a pinned `wrangler` run from a scratch directory, by
the planner, after the head lands. The first live check is an agent
created and enrolled in the hosted demo room by the three steps of
section 3.3, the pinned client's `tools/list` and one `issue.create`
through it, recorded in this note by a note-only head after the
deployment, with the observed call count and the Worker's measured
response bytes.

## 6. Witnesses

All run in the Worker test harness (`vitest.worker.config.ts`, with the
two new classes in `wrangler.test.jsonc`), against the real routes, with
the pinned `@modelcontextprotocol/client` 2.3.1 where a client is named.
Each refusal case asserts the status, the code and that the body carries
nothing from the request. Resets of the object's in-memory state use the
harness's instance reset; storage stays.

- **H1, the whole recipe.** An admin performs `add-member` and
  `invite-key`; the controller sends `create`; the object's `enrol` is
  accepted and the key reads back active; the pinned client, speaking
  2025-11-25 and then pinned to 2026-07-28, lists tools and performs
  `issue.create` and `wait`; the entry is in the lane with the agent's key
  as actor. Then the `enrol` envelope is in custody as accepted and the
  secret is in no hosted row, log or configuration. Handoff: with a reset
  of the registry after its reservation, of the agent object after its
  seed is written, after the envelope is kept, after the native `enrol`
  is accepted but before the registry completes, and after completion but
  before the reply, a repeated `create` with the same `op` resumes and
  answers with the same agent, key, envelope and bearer; two concurrent
  `create` requests with the same `op` produce one agent, one key, one
  envelope and one bearer.
- **H2, agents kept apart.** Two agents in one repository: one's custody
  records, sessions and listens are invisible to the other; the same
  idempotency key in both creates two distinct records.
- **H3, control authority.** `create`, `bearer` and `retire` by: another
  active member who is neither admin nor controller; the controller;
  an admin; a revoked key; an ended member; a request naming another
  repository, another incarnation, another action than the route, another
  agent than the path, a body whose digest differs; an expired `notAfter`;
  a repeated `op` with the same digest (same answer, including the
  bearer) and with a different digest (`409`). Only the controller and the
  admin succeed, and the answer says which.
- **H4, the bearer and revocation.** A missing, malformed, wrong and
  retired bearer each answer `401` with the fixed body; eleven failures in
  a minute from one address answer the limiter's refusal; after `retire`
  every open stream, legacy and listen, has closed with a final event and
  the sessions are gone; after `bearer` the old bearer answers `401`, the
  new one serves, and the streams and sessions that were open under the
  old one are closed and gone; the `bearer` answer and the rotation are
  found together after a reset between them; after `revoke-key` the
  agent's acts are refused by the scope with the membership's reason and
  custody records it as refused.
- **H5, eviction and reconciliation.** A legacy session lists at
  generation A (`listed` = A); the inventory changes to B with the stream
  open and the stream is notified once (`notified` = B, `listed` still A);
  the object is reset without the client listing; on reconnect the client
  is notified once more, because `listed` is still A; it lists, `listed`
  = B; a further reconnect without a change receives nothing. Separately:
  a change while no stream is open is told once at the next stream; a
  second `GET` for the session closes the first stream and the second
  keeps receiving. A reset with a modern listen open ends it abruptly
  with no event, and a reopened listen is acknowledged with its ID and
  honored types and replays nothing.
- **H6, custody across resets and interleaving.** A reset between keep
  and send leaves the record prepared and the exact bytes are sent on
  resubmit; a reset between send and answer leaves it unknown and `settle`
  resolves it from the scope; two concurrent `send` and `settle` on the
  same key serialize and leave one decisive outcome; two admissions
  started at 255 unresolved admit exactly one and refuse the other `full`;
  a publication interrupted inside the transaction leaves no row and no
  chunk; a 2 MiB record is written in chunks and read back equal; 120
  refused resubmissions with 20 KiB names on one identity spill past the
  byte bound into ordered segment rows and read back complete, and a spill
  interrupted by a reset leaves the record's index and rows as they were;
  storage filled to the budget with one exact intent outstanding: the
  outstanding intent's accepted result is retained through `settle`, a
  reset and read-back, its envelope unreplaced and the budget unbroken,
  while a new admission is refused `full` before signing; a simulated
  `SQLITE_FULL` within budget refuses `full` with every earlier record
  still readable; a same-key call after archival returns the retained
  answer without signing.
- **H7, budgets and framing.** The plan 031 budget witnesses run through
  the endpoint and hold; the HTTP framing overhead is measured once and
  stated in `docs/mcp.md`.
- **H8, the HTTP layer.** Modern: missing `MCP-Protocol-Version`,
  header and `_meta` differing, an unsupported version (`-32022` with
  `supported`), missing `Mcp-Method`, `Mcp-Method` differing from the
  body, missing and differing `Mcp-Name` on `tools/call`, a sentinel-
  encoded `Mcp-Name` that decodes equal (accepted), a header with a
  control character or a non-ASCII byte in the raw value, a sentinel
  carrying a Unicode name and one carrying leading whitespace (both
  accepted when they decode equal), a sentinel that is not valid base64
  and one that decodes to invalid UTF-8 (`-32020`), an unknown method
  (`404`, `-32601`), a notification (`202`, empty), a parse error and an
  invalid request answered with `"id": null`. Legacy: `POST`, `GET` and
  `DELETE` each with a valid `MCP-Protocol-Version`, with the header
  absent and a known session (served), with an invalid value and with an
  unsupported value (`400` before dispatch); a request without a session
  `400`; an unknown session `404`; `GET` replaces a stream without
  detaching the replacement; `Mcp-Method` and `Mcp-Name` ignored. Both:
  `Origin` `403`, a body over the bound `413`, a batch, a non-frame, a 5th
  stream `409` counting a listen and a legacy stream together, a 17th
  session ending the oldest. The same cases run against the loopback
  server through the shared module.

## 7. Costs

One registry object per repository and one agent object per agent,
SQLite-backed; per call, the same reads as the local service (the table in
`docs/mcp.md`) made in process. One agent's calls serialize where custody
requires; many agents run in parallel. Storage per agent is bounded at
1 GiB of custody plus sessions. No cost falls on the scope objects beyond
the reads and acts an agent makes, which are the same as from any client.

## 8. Division of work and order

1. This note, reviewed by the checker.
2. The build in the cloud session that built plan 031, on
   `request/mcp-generic` from main after the discovery head lands: the
   control domain and verifier, the two object classes, the routes, the
   shared HTTP module (and `node.ts` on it), the SQLite custody store, the
   hosted section of `docs/mcp.md` with the W1 recipe "take part from a
   host without a process" and its call counts, the witnesses H1 to H8,
   one gate. The cloud session cannot deploy.
3. Checker review of the exact head; landing by the planner.
4. Deployment by the planner, the live check, and the note-only head that
   records it.

## 9. Acceptance

The endpoint serves both wire revisions to the pinned client over
`POST /mcp` with a bearer, validating what each revision requires; one
agent cannot see another's state; an agent is created, re-issued and
retired only by its controller or an admin under a signed control request
checked against current membership, replay-safe, with lost replies
answered exactly; the hosted key is enrolled by the membership's own
invitation and `enrol`; the service module is unchanged apart from the
three ports; custody keeps every original envelope, result and retained
answer across archival, is atomic in admission and publication, and
refuses `full` without losing anything; a legacy session survives
eviction and is told once of a change made while it was down; the
budgets hold; H1 to H8 pass in the Worker harness; the gate passes; and
the live check on the hosted Worker is recorded.

Owed after this head, in the same stage: OAuth; the pinned `diff` and
`file` reads; resources and prompts; an `export` control action for a
full agent; the one-step `create` from the Start agent-key link.

## 10. Corrections of the reviews

### Review 89ec44b0 (Draft 2 → Draft 3)

| Finding | What Draft 3 does |
|---|---|
| 1. A reset between objects can allocate a second key or strand an enrolled one | Section 3.2: the fingerprint and the allocated agent ID are reserved in one transaction before any handoff; the seed, the kept envelope, the bearer and the answer are each written before the next step; resumes find the same seed and envelope; `bearer` and `retire` write identity, rotation, session deletion and answer in one transaction; replay, conflict, re-checked authority and retention after expiry stated; H1 resets at each step and the concurrent duplicate |
| 2. A write guard conflicts with guaranteed settlement | Section 3.6: completion space reserved at admission (2 MiB + 1 MiB) and released on archival, a separate 16 MiB budget for control, session, configuration and key rows, `full` refused before signing; H6 fills storage with an exact intent outstanding and retains its result |
| 3. Segments bounded by count, not bytes | Section 3.6: inline bound by count and bytes, segment rows of at most 512 KiB, oversized outcomes split by part index, index and rows in one transaction; H6 with 120 refusals of 20 KiB names and an interrupted spill |
| 4. `told` mixes listing with delivery | Section 3.5: a bounded `Wire` change splitting `listed` (durable, set by `tools/list` through a persistence hook) from `notified` (per stream, memory); reconciliation against `listed`; replacement streams not detached; H5 notifies without listing, resets, reconnects, lists |
| 5. Legacy version headers | Section 3.4: an invalid or unsupported `MCP-Protocol-Version` is `400` before dispatch on `POST`, `GET` and `DELETE`; an absent header uses the session's negotiated version; only the modern mirror headers are ignored; H8 cases |
| `id: null`, raw header safety, sentinel cases, listen acknowledgement, eviction vs retirement, stream counting, rotation | Sections 3.4 and 3.5; H4, H5, H8 |
| P3: the secret is in `enrol`'s signed fields and native history | Section 3.3 step 4 and H1 say where the secret is and that the hosted layer keeps no further copy, changing no native byte |

### Review 6a262c93 (Draft 1 → Draft 2)

| Finding | What Draft 2 does |
|---|---|
| 1. Any member could mutate; signed reads bind reads, not actions | Section 3.2: a signed control request under its own domain binding action, target agent, membership with incarnation, body digest, expiry and a replay-safe `op`; current authority checked against membership on every mutation; admin power explicit; H3 covers other members and repositories, changed action, body and target, revoked controllers and lost replies |
| 2. `enrol` is signed by the new key with invitation and secret; a controller cannot enrol an arbitrary key | Section 3.3: `add-member`, `invite-key`, then the object's own key signs `enrol` with the envelope kept first, read back, and resubmitted exactly on an unknown outcome; no new permission; H1 |
| 3. Deletion is not custody | Section 3.6: archive table, same bytes, indexed, read by `read`; segments retained; nothing deleted; a growth bound with a `full` answer that preserves originals and sends nothing unsaved; `export` owed |
| 4. Interleaving at `await` | Section 3.6: identity and admission queues honored by every operation; admission and publication in `transactionSync`; read-back before send; output gates; H6's overlapping, capacity and interrupted cases |
| 5. Legacy reconnect loses a change made while down | Section 3.5: `told` durable and meaning "last listed"; reconciliation on stream open and object start; stream write distinguished from receipt; H5 changes the list while down |
| 6. The 2026-07-28 headers | Section 3.4: one shared HTTP module validating `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name` with the sentinel, `-32020`, `-32022`, `404` with `-32601`, `202`; legacy separate; H8 negatives |
| Key representation, reader restriction, invalidation, stream ownership | Sections 3.1, 3.3, 3.5, 3.7 |
| Retention rule, growth, 2 MB rows, storage full | Section 3.6: chunks of 1 MiB, archive by count or age, 1 GiB bound, `SQLITE_FULL` → `full`, H6 |
| Fixed bodies and protocol correlation | Section 3.4: JSON-RPC error with the request's `id`, the code, and a message naming the header or rule, never a value |
