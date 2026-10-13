# The hosted MCP endpoint: plan 031, stage 2

Date: 2026-10-13. Status: Draft 1, for checker review. Requested by Hugh on
2026-10-13 at 11:03 Eastern: "the hosted MCP endpoint should be
prioritized", right after the discovery head (request f9ca5f96).

Plan 031 built one MCP service for every dap application and landed it as
`@generalbusiness/dap-mcp` with the `dap mcp` command (main `bd02ecff`).
That service runs as a process on the agent's own machine, signing with a
key in the agent's `ARTROOM_HOME`. Stage 2, named in plan 031 sections 7
and 11, is the same service served from the scope Worker at `POST /mcp`,
for agents on hosts that cannot run a process. This note is its design.

## 1. What the endpoint is

A hosted agent is a member of one repository, enrolled by a controller,
whose signing key lives in the Worker and never leaves it. The agent's
host speaks MCP to `https://<worker>/mcp` with a bearer token. Every call
runs the same `McpService` as `dap mcp` runs locally: the same tools, the
same descriptions, the same custody rules, the same four answers. Only
three ports differ: the signer (a key held in a Durable Object instead of
a file), the reader (an in-process call to the Worker's own routes instead
of HTTP to a remote service), and the custody store (SQLite in that
Durable Object instead of files under `private/mcp-custody`).

Not in this head, though in the same stage: OAuth (plan 031 item 8), the
pinned `diff` and `file` reads, resources and prompts. Each follows as its
own head once the endpoint serves.

## 2. What exists, as read on main `bd02ecff`

- `McpService` (`packages/mcp/src/service.ts`) takes a `ServerPort`:
  `service` (base URL), `fetch`, `signer`, `config`, `custody`, `mode`,
  `now`, `pause`, `every`. Nothing in `service.ts`, `inventory.ts`,
  `custody.ts`, `wire.ts`, `reads.ts` or `catalogue.ts` imports a Node
  module; the only runtime globals are `setInterval`, `setTimeout`,
  `crypto.randomUUID` and `TextEncoder`, all present in a Worker. Every
  Node import is in `node.ts`.
- `Wire.handle(message, session, send, owner)` (`wire.ts`) serves both
  wire revisions and is transport-agnostic. Session IDs, the `GET` stream,
  `DELETE`, HTTP status codes, the Origin check, the per-launch bearer and
  the body bound are in `node.ts`'s loopback server, and are what the
  Worker reimplements over `fetch`.
- The custody contract (`custody.ts`): `lock`, `exclusive`, `read`,
  `write` with read-back, `unresolved`, `segment`, `segmented`; 256
  unresolved identities at most; 2 MiB per record; keys of 1 to 128 bytes.
  `memoryStore` is the smallest implementation; the file store adds locks
  by process liveness and an archive.
- The Worker (`packages/scope/src/worker.ts`) has one Durable Object
  binding, `SCOPES`, SQLite-backed, and no `/mcp` route. Reads take
  `Authorization: Session …` or `Signed …`; writes carry a signed intent and
  no header. Bodies are bounded at 1 MiB. The Worker's credential store
  holds Git host tokens only; it holds no signing keys. The `enrol` act of
  `platform:membership` exists on main; the agent-key invitation link
  exists only on the Start branches (`packages/client/src/agent-key-invitation.ts`
  on `request/demo-start-rename-landed`), not on main.
- Deployment: `packages/scope/wrangler.jsonc`, name `artroom-scope`, with
  the `SESSION_SECRET` and `DEPLOYMENT` variables set outside the file;
  `docs/deploy.md` says a redeploy keeps them with `--keep-vars`.

## 3. The design

### 3.1 Agents, keys and bearers

An **agent** is a record in a new Durable Object class, `McpAgent`, one
object per agent. Creating an agent creates the object, which generates an
Ed25519 key pair with WebCrypto, keeps the private key in its own SQLite
storage, and returns the public key ID. The private key is never returned,
logged or exported; the `credential` tool keeps its meaning (the agent's
own join credential as the membership records it) and does not return the
Worker's key.

A **bearer** is `<agent-id>.<secret>`, where the agent ID is the object's
ID and the secret is 32 random bytes, base64url. The object stores the
SHA-256 of the secret and compares in constant time. The bearer is shown
once, in the response that creates the agent, and never again; a new one
can be issued by the controller, which retires the old one.

Who may create an agent: a member of the repository, proving possession of
a member key the way reads do today, with `Authorization: Signed <signed
read>` over the request. The Worker checks the key against the
repository's membership before creating anything, so a stranger cannot
mint objects. Creation does not enrol: membership authority stays with the
membership scope. The response names the agent's key ID; the controller
then submits the existing `enrol` act of `platform:membership` naming that
key and the agent's handle, through the Page, the command line (`dap act`)
or its own MCP connection. Until the enrol takes effect the bearer works
only for reads the membership allows a stranger, which is none, and every
tool answers as the room does for a non-member.

Revocation has two parts, both the controller's: ending the agent's
membership through the membership scope's own acts, which makes the key's
intents refused everywhere; and `DELETE /mcp/agents/<id>` with the same
`Signed` proof, which retires the bearer and closes the object's streams.
Either alone is effective for its purpose; the recipe does both.

### 3.2 Routes

| Route | Authorization | What it does |
|---|---|---|
| `POST /mcp/agents` | `Signed` by a member | Creates an agent for this repository; returns `{ agent, key, bearer }` once |
| `POST /mcp/agents/<id>/bearer` | `Signed` by a member | Issues a new bearer, retiring the old |
| `DELETE /mcp/agents/<id>` | `Signed` by a member | Retires the bearer and closes streams |
| `POST /mcp` | `Bearer <agent-id>.<secret>` | One JSON-RPC message, either wire revision |
| `GET /mcp` | `Bearer`, and `Mcp-Session-Id` | The 2025-11-25 server stream for that session |
| `DELETE /mcp` | `Bearer`, and `Mcp-Session-Id` | Ends that session |

The Worker's top-level `fetch` routes `/mcp` and `/mcp/agents` to the
agent object named by the bearer or the path; everything about one agent
happens inside its own object, so one agent's sessions, subscriptions and
custody are kept apart from every other agent's by construction, not by
filtering. Requests with an `Origin` header are refused `403`, as the
loopback server refuses them: this is not a browser surface and no CORS
headers are sent. Bodies above 1 MiB are refused `413` through the
Worker's existing bound; a batch is refused as it is locally.

### 3.3 Wire and sessions

`Wire` runs unchanged inside the object. The 2025-11-25 session table
(`id`, negotiated version, initialized flag, declared capabilities, the
last list generation told) is persisted in the object's SQLite, so a
session survives the object being evicted; only its open stream is lost,
and the client reconnects `GET /mcp` with its session ID, as the revision
allows. An unknown session ID answers `404`, which the revision defines as
"initialize again". The 2026-07-28 `subscriptions/listen` stays
per-connection, as in plan 031 section 7, and is dropped when its stream
closes. At most 16 sessions and 4 open streams per agent; the oldest
session ends when a 17th initializes, and a 5th stream is refused with the
reason.

### 3.4 Custody

A SQLite implementation of `CustodyStore` in the agent object: a
`record` table (identity ID, record bytes, phase, times), a `segment`
table for outcome segments, and the unresolved count by query. The object
runs one request at a time, so `lock` and `exclusive` are an in-memory set
and a queue, as `memoryStore` has them, with no cross-process case to
reclaim and so no reclaim lock and no dead-reclaimer operator duty. The
256 unresolved cap, the record size and the key bound are the same values
from the same module. Terminal records are not archived to files; they
stay in the table, which is the archive, with the same age and count
thresholds applied as a retention policy stated in `docs/mcp.md`
(records older than 30 days and beyond the newest 1,024 are deleted on
the next write, outcomes kept in segments as now).

### 3.5 Signing, reading and configuration

The signer is the object's key through WebCrypto. The reader is the
service's own `Reads` with a `fetch` that dispatches in process: a
request whose origin is the Worker's own is answered by calling the
Worker's `route` function directly with the object's binding, so the
agent's reads and acts take the same routes, the same session tokens from
membership and the same signed-read fallback as a remote caller's, with no
network hop and no self-fetch. The `service` in the agent's configuration
is the Worker's public origin, so scope IDs and links read the same as
everywhere else.

The configuration port reads one record per agent: service, handle,
register, repository and roots, written at creation from the Worker's
own deployment (the repository the controller is a member of) and
extended by the `room` tools exactly as the local service extends a
config file; no secret is in it. The list generation and the per-call
derivation are the same code; the budgets of plan 031 section 9 are
measured as the service's `CallResult`, unchanged, and the HTTP framing
is stated separately.

### 3.6 Errors

The four answers are unchanged. The hosted layer adds exactly these, each
with a fixed body that names the next step and nothing from the request:
`401` for a missing or wrong bearer (constant-time compare, counted and
rate-limited per connecting address with the join limiter's shape: ten
failures per minute), `403` for an `Origin`, `404` for an unknown session,
`405` for a method the route does not take, `413` for a body over the
bound, and `409` when a 5th stream is opened. A retired bearer answers
`401`, the same as an unknown one.

## 4. The enrolment flow and the Start branch

The Start branches add an agent-key invitation link
(`artroom-agent-key:…`) by which an agent's own process joins and enrols
itself. This head does not wait for Start and does not duplicate it: the
hosted agent is enrolled by the controller's own `enrol` act, which main
already has, naming the key the Worker returns. When Start lands, a
second route, `POST /mcp/agents` with an agent-key invitation in the body
and no `Signed` proof, can create and enrol in one step using the same
parser; it is noted as a follow-up and changes nothing here. The checker's
request 34c4 (join parity after Start) covers both the local `join` tool
and this route.

## 5. Deployment

`wrangler.jsonc` gains the `AGENTS` binding to `McpAgent` with a SQLite
migration (`v2`). No new variable and no new secret: the bearer secrets
and keys live in the objects. The redeploy keeps `SESSION_SECRET` and
`DEPLOYMENT` with `--keep-vars`, from a pinned `wrangler` run from a
scratch directory, by the planner, after the head lands. The first live
check is an agent created and enrolled in the hosted demo room, the
pinned client's `tools/list` and one `issue.create` through it, recorded
in this note by a note-only head after the deployment, with the observed
call count and the Worker's measured response bytes.

## 6. Witnesses

All run in the repository's Worker test harness
(`@cloudflare/vitest-pool-workers`, already a dependency of the MCP
package), against the real routes with the `AGENTS` binding, with the
pinned `@modelcontextprotocol/client` 2.3.1 where a client is named.

- **H1, the whole recipe.** A member creates an agent, enrols its key,
  and the pinned client, speaking 2025-11-25 and then pinned to
  2026-07-28, lists tools and performs `issue.create` and `wait` through
  `POST /mcp`; the entry is in the lane with the agent's key as actor.
- **H2, agents kept apart.** Two agents in one repository: one's custody
  records, sessions and listens are invisible to the other; the same
  idempotency key in both creates two distinct records.
- **H3, the bearer.** A missing, malformed, wrong and retired bearer each
  answer `401` with the fixed body; the compare runs in constant time (the
  compare function is the one the test names); eleven failures in a
  minute from one address answer the limiter's refusal.
- **H4, revocation.** After `DELETE /mcp/agents/<id>` the bearer answers
  `401` and the open stream has closed; after the membership ends the
  agent's acts are refused by the scope with the membership's reason and
  custody records it as refused.
- **H5, eviction.** With the object's in-memory state dropped between
  calls (the harness's instance reset), a 2025-11-25 session continues by
  its ID, `GET /mcp` reopens its stream, and a list change after the reset
  is told once.
- **H6, custody across a reset.** A reset between keep and send leaves
  the record prepared and the exact bytes are sent on resubmit; a reset
  between send and answer leaves it unknown and `settle` resolves it from
  the scope; the 257th unresolved identity is refused `full`.
- **H7, budgets and framing.** The plan 031 budget witnesses run through
  the endpoint and hold; the HTTP framing overhead is measured once and
  stated in `docs/mcp.md` beside the modern metadata figure.
- **H8, the guards.** `Origin` → `403`; a 1 MiB + 1 body → `413`; a batch
  refused; a 5th stream → `409`; a 17th session ends the oldest.

## 7. Costs

One Durable Object per agent, SQLite-backed; per call, the same reads as
the local service (the table in `docs/mcp.md`) made in process. The
object is single-threaded, so one agent's calls serialize; many agents run
in parallel. Storage per agent is bounded by the custody retention policy
and the session cap. No cost falls on the scope objects beyond the reads
and acts an agent makes, which are the same as from any client.

## 8. Division of work and order

1. This note, reviewed by the checker.
2. The build in the cloud session that built plan 031, on
   `request/mcp-generic` from main after the discovery head lands: the
   `McpAgent` object, the routes, the SQLite custody store, the hosted
   section of `docs/mcp.md` with the W1 recipe "take part from a host
   without a process" and its call counts, the witnesses H1 to H8, one
   gate. The cloud session cannot deploy.
3. Checker review of the exact head; landing by the planner.
4. Deployment by the planner, the live check, and the note-only head that
   records it.

## 9. Acceptance

The endpoint serves both wire revisions to the pinned client over
`POST /mcp` with a bearer; one agent cannot see another's state; a bearer
is created only by a member and retired by a member; the service module
is unchanged apart from the three ports; the budgets hold; H1 to H8 pass
in the Worker harness; the gate passes; and the live check on the hosted
Worker is recorded.
