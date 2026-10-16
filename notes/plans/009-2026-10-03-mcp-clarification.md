# MCP for declared applications and durable work

2026-10-03. Draft 2, proposed for independent planning review.
Planned against main `e6e6782830e0ca8a68f0d11c4d4ece5e4e98c967`.
Evidence-only clarification request `7fc05f06`, promise `9e739dea`,
continues original MCP planning `489a992e` / `932ce20e`. It answers all
seven findings in accepted review `4e542273` / ratification `5877afdf`.
Draft 2 corrects Draft 1's overbroad checker exclusion against adopted
transport decision `fa120186`; the remaining capability scope is retained.
Original source-note integration remains owed. This file neither changes
the protocol nor approves a runtime implementation.

The experience is continuous work: a person gives an agent a task, leaves,
then returns to the same work from another device. MCP is one way an agent
or chat host reaches that work. The durable conversation, prepared actions,
coding environment and authoritative Room outcomes have their own owners;
they survive independently of an MCP connection.

## 1. Scope and retained decisions

This is a dated reconciliation of the complete Revision 3 at
`b5add513f4a6a00c6a4772ef9bcb6f4a6cd6680a`,
`notes/2026-10-01-mcp-plan.md`: 32,581 bytes, SHA256
`c79336c71296da583a929b497721ddf97380988373b4e8851287f1fcbd004962`.
Its five layers and full capability scope remain. This clarification
proposes corrections to the contradictory fixed-vocabulary, retry, consent,
caching, status and compatibility statements identified below; it does not
delete the rest of the plan.

Adopted decision `775acdd3` remains:

| Sequence | Retained scope |
|---|---|
| Items 1–4 first | Core/tools and toolsets; descriptor titles and annotations; advertised output schemas; required act idempotency keys; bounded waits |
| Items 5–9 in stage 2 | New Room reads; packs; invitation/delegation toolset configuration; OAuth; resources and prompts |
| OAuth in stage 2 | Before the planned finals milestone, for hosts requiring OAuth and the later MCP App |
| Application extensions | Both repository packs and separately hosted application servers using the library |
| Later enhancements | Tasks, MCP Apps, live subscriptions and overlap elicitation, with tools remaining complete |

The 2026-10-05, 12 and 21 dates and effort estimates in the older note are
planning estimates. They are neither evidence of delivery nor limits on
functionality. The broad MCP plan, browser/cloud stories, manual and
collections are not new first-Jam gates. Builder decides when the acts
and actual blockers permit the first Jam task, with Jam and the full
manual then proceeding in parallel.

## 2. Evidence and current status

Keep three distinct records: what the source says, what has passed review
and landing, and what a deployed client has actually done.

| Evidence | What it establishes | What remains unproved here |
|---|---|---|
| `8189d66` main and lane E `69734d4` | The older note's historical ten-tool baseline | Current runtime or deployment status |
| Main `e6e67828`, protocol section 33 | Application-declared kinds, signed bindings, historical meanings and staged runtime responsibilities are specified | All declared-acts runtime stages being landed |
| Adopted `fa120186`, candidate protocol section 33.10 | Explicit bound declared check steps may use generic MCP `act`; legacy bearer check remains RPC-only and bearer roster is forbidden | Stage 4 checker-service implementation or independent evidence from merely using generic submission |
| Main MCP source | `packages/mcp/src/worker.ts` implements the MCP route adapter; `server.ts`, `tools.ts` and `run.ts` implement the ten-tool source baseline | A particular endpoint being deployed or successful named cold-agent runs |
| Combined branch `request/test-overhead` at `4ec48aa1` | Proposed Stage 2/3/5 and MCP-core composition, including restored useful acceptance witnesses | Functional approval of all four lanes or main incorporation |
| Cost approval at `f6212850` | Bounded test-overhead approval under `ecbc722a` | Functional approval of the restored head or its MCP behavior |
| Reviewed 005 and 007; adopted 008 | Hosted authority, workspace recovery and durable input/wake planning | Shipped coding runtime, OAuth or autonomous watcher |

At main, the adapter is no longer ownerless. Do not commission another
endpoint task merely because the old snapshot lacked it. Existing MCP
core implementation `9ca1d290` and declared-acts Stage 5 `a5d64b35`
remain the relevant functional owners. Their exact-head approvals and
landing evidence must determine subsequent status.

Source anchors read for this clarification include:

- `packages/mcp/src/worker.ts`: `createMcpFetch` authenticates the bearer,
  bounds the body and creates a stateless handler for a Room URL.
- `packages/mcp/src/run.ts`: `workspace` obtains a grant only after the
  operation is ready and rechecks holder/lease through `workspaceToken`.
- `packages/mcp/src/server.ts`: tool output schemas are advertised.
  `run.ts` also returns structured `ArtroomError`; the plan must account
  for that shape rather than assuming success/refusal is exhaustive.
- Proposed client source at `f6212850`, `packages/client/src/room.ts`:
  `PreparedAct`, `onPrepared`, owned frozen intent and `replay` show the
  prepare-before-send boundary. Proposed MCP `run.ts` routes `acts` and
  `act` without replacing the caller's binding. These are illustrations
  awaiting the original functional reviews, not landed promises.

For example, the candidate's generic runner is:

```ts
return room.act(input.kind, input.target, input.body, {
  binding: input.binding, idempotencyKey: input.idempotencyKey
});
```

The important property is unchanged caller meaning at admission. Future
implementation must reconcile the actual reviewed public API before
copying a source example.

## 3. Layers and the general application route

| Layer | Responsibility | Boundary |
|---|---|---|
| L0 transport | HTTP/stdio, modern and legacy stateless wire formats, authenticated Room binding, protocol errors and tool failures, wire caching and output bounds | Does not decide Room authority or invent act meaning |
| L1 core | Shared descriptors and thin Room calls; general declared-act discovery/submission; code-review conveniences; reads and bounded waits | Does not compose several Room acts into one write |
| L2 role toolsets | Select available descriptors from current role/delegation and optional narrower caller choice | Hiding a tool is not authorization |
| L3 packs | Repository data mapping an application verb to one ordinary Room write or read, plus resources/prompts | Does not execute arbitrary code, define authority or silently change prepared work |
| L4 application servers | Application code, state and other-service integration, composed from the published client/MCP library | Application state cannot override Room outcomes |

The seven named code-review acts are the legacy/code-review application's
vocabulary. They are not the permanent list of application kinds. A Jam
application can declare its own suitable acts under the already specified
declarations model. Its first vocabulary is allowed to change during
self-hosting. A pack exposes that vocabulary; it does not create a second
kind-definition system or require every verb to become `claim` or `note`.

A tools-only caller must be able to:

1. Read the active acts catalogue and, when needed, the retained catalogue
   at a historical policy version or sequence. It sees kind, target/body
   requirements, executable steps, binding and relevant guidance.
2. Choose a declared meaning and prepare `kind`, `target`, `body`,
   `binding` and required `idempotencyKey`.
3. Submit that meaning through the general act route. Room admission
   checks the current declaration, authority, delegation map, target,
   body, lease and policy like an ordinary signed act.
4. Read the receipt, refusal or operation. Historic records are rendered
   using the retained meaning, even after the kind is retired.

Use the existing Stage 5 `acts`/`act` route; do not wait for dynamic
per-kind tools before a declared application can work. Dynamic descriptors
are a convenience built from the same catalogue. A catalogue, annotation,
prompt, cached schema or host click grants no authority. Current
per-kind delegated bindings remain required. Platform kinds use their
specified routes. Bearer roster is always forbidden. Legacy bearer `check`
remains RPC-only, without a named MCP `check` tool; the fixed HTTPS bearer
client's legacy `check` and `roster` methods refuse before sending. Neither
a pack alias nor a generic call bypasses those exclusions.

Under adopted `fa120186`, a generic `v: 2` act may run a declared check
step through MCP, including the HTTPS bearer client's generic `act`
route. This applies to the check step even when its declared kind has
another name. The caller supplies the exact binding and key; the Room
signs with the session key and delegation without choosing or replacing
that binding. Its signed grant map must cover the exact kind and binding,
and the current role and declaration must permit the action. All ordinary
check guards and R-OBL-3's obligation, checker, integration, input,
configuration and runner qualifications still apply. A holder or proposer
cannot meet their own check obligation. Generic submission alone is not
independent evidence. The generic path refuses v1 acts and platform
kinds, and bearer acts remain excluded from the ordinary signed-envelope
POST route. Key-signed checks retain their specified authority and v2
binding rules. Stage 4 still owns production `CheckJobV2`, service signing
and prepared facts; permitting this transport does not deliver that work.

List results may vary by authorization and the currently active reviewed
application configuration, not by an implicit MCP connection history.
Historical catalogue lookup does not reactivate a retired kind.

## 4. Complete tool, resource and prompt surface

The original fourteen core tools and four additional reads remain the
code-review/common surface. `acts` and `act` add the general application
route already specified by declared acts. The historical 14/18 counts
describe the older plan's tools, not a new cap on the complete surface.
All write schemas require the caller key. Shapes below are planning
summaries; the reviewed contract supplies exact encodings and constraints.

| L1 tool | Input shape | Result/purpose |
|---|---|---|
| `claim` | Goal, scope, optional plan/because; optional lane/lease/expected generation; key | Code-review opening, rescope or takeover and overlaps |
| `propose` | Held lane/lease, exact head, expected generation, summary/because, key | Recorded version, obligations and preview |
| `note` | Entry or pinned line anchor, text/reply, key | Recorded code-review comment |
| `review` | Exact lane/generation/head, verdict, scope/dependencies/text, key | Recorded review; qualifications still checked by Room |
| `land` | Held lane/lease, exact generation/head, key, optional wait | Landing operation, not a guarantee of publication |
| `release` | Held lane/lease, optional handover/outcome where adopted, key | Recorded release, with credential cleanup owed as specified |
| `renew` | Held lane/lease, key | Current lease expiry or refusal |
| `workspace` | Held lane/lease, optional bounded wait | Public operation plus explicit authorized grant only when ready |
| `attention` | Cursor, limit, optional bounded wait | Addressed page, next cursor and publication position |
| `lanes` | Supported state/holder/scope/text filter, cursor/limit | Bounded lane summaries |
| `lane` | Lane ID | Holder, lease, generations, overlap and operation status |
| `proposal` | Lane and generation | Changed paths, obligations/evidence, preview and notes |
| `explain` | Act ID | Recorded rules/inputs/outcome, or an object saying not found |
| `operation` | Operation ID, optional bounded wait | Workspace, preview or landing state |
| `room` (item 5) | No application arguments | Current member/role/delegation summary, policy, lease and publication status |
| `diff` (item 5) | Pinned proposal/base/head identity, optional path and slice cursor | Bounded immutable diff or interdiff under N1's reviewed contract |
| `file` (item 5) | Path, requested commit/main reference, slice cursor | Authorized canonical content resolved to a pinned commit, with limits |
| `policy` (item 5) | No application arguments | Active policy version and understandable rules |
| `acts` | Active, or one historical policy/sequence selector | Current or retained declared meanings/bindings, or not found |
| `act` | Kind, target, body, binding and key | One ordinary admitted declared act, refusal or failure |

`workspace` is a signed request with its existing operation identity;
it is not one of the act tools. Do not make an MCP key into proof that
provisioning, commands or a provider write can be blindly repeated.
Each wait is bounded at 45 seconds in the planned core. Timeouts retain
the handle and unresolved outcome; the caller reads the operation again.

Resources and prompts remain in stage 2, consistent with adopted item 9:

| L1 resource template | Equivalent read |
|---|---|
| `artroom://room` | `room` |
| `artroom://lane/{lane}` | `lane` |
| `artroom://lane/{lane}/generation/{n}` | `proposal` |
| `artroom://act/{act}` | `explain` |
| `artroom://policy` | `policy` |
| `artroom://file/{at}/{+path}` | `file` at an authorized pinned commit |

| L1 prompt | Arguments and purpose |
|---|---|
| `start` | None; read room/attention, then follow current role and declared meanings |
| `work-on` | Goal; the applicable opening/work/version journey, using code-review conveniences in code rooms |
| `review` | Lane/generation; read pinned proposal/diff and record qualified review |
| `triage` | None; address attention with the applicable work lifecycle |
| `handover` | Lane; record useful handover and release under the active vocabulary |

Before item 5, start with `attention` and the available lane/acts reads;
do not instruct a client to call an absent `room` tool. Extra historical
acts resources may follow as convenience, with `acts` still complete.
Prompt text carries its author/configuration provenance as task input,
not privileged instructions or completion authority (005/007/008).

Retain builder, reviewer, triager, observer and all toolsets, with the
original common tools appropriate to each role. Add the general declared
route wherever that principal can discover/use it; an observer gets reads
only. Exact descriptor selection and pagination must fit the context
budget without hiding the sole usable route to an authorized action.
Invitation toolset declarations and delegation narrowing arrive with item
7 in stage 2; initial default presentation can use current role/authority.

## 5. Prepared meaning, packs and interruption

A required key identifies a retry. It does not preserve the intent unless
the prepared request is kept. Before first dispatch, its existing durable
owner must retain:

- Room and principal/session or signing identity; kind, target, body,
  binding, caller key and exact signed envelope bytes where applicable;
- For a pack, the resolved repository/policy revision, pack revision and
  mapping identity, validated input and resulting prepared Room call;
- For a hosted task, the resolved task/prompt meaning and its inherited
  author provenance, associated with the existing conversation/input and
  operation records.

The own-key client persists the signed prepared object before sending;
after restart it replays the same bytes. A bearer caller persists its
unchanged prepared call, including binding and original session context;
the Room's existing bearer path constructs/signs it under that session.
Neither the transport nor a resumed pack chooses a newer binding or a
new session to make an unresolved call succeed. Retained signed-envelope
settlement without fresh authentication is distinct from a revoked bearer
retry; the reviewed identity/idempotency boundary still decides each.

C3's durable conversation/input/operation ledger owns preparation for
hosted work. A local client/application server owns its persisted prepared
objects. The stateless MCP Worker owns no hidden conversation or retry
session. An ordinary handle may locate a prepared object in that existing
owner, with current access checked. No new public outbox is needed.
An in-memory cache of unanswered calls alone proves no restart recovery.

After a lost reply, replay the retained call or reconcile its recorded
receipt/operation. Do not rerun a mapping from today's pack or rebuild an
envelope from today's catalogue under the old key. After `binding-stale`
or `kind-undeclared`, show the relevant active/retired meaning and let the
caller explicitly choose a fresh preparation and key. Exact retries of
an already admitted act return its original result under R-IDEM/R-DECL-16;
they do not get the new declaration's meaning.

Repository packs stay bounded declarative data in `.artroom/mcp/`, loaded
from reviewed active configuration. Restricted schemas, reserved core
names, dotted application names, a pinned pure mapping profile/budget,
stricter annotations, resources and templated prompts remain. Installation
and evolution reuse N5's reviewed proposal/approval/activation/regrant
lifecycle; editing a prompt or descriptor cannot grant an undeclared kind.
Mapping code cannot call services or compose multiple acts. Application
servers handle extra application state and external work through their
own explicitly owned operations.
Explanation retains the ordinary core outcome and safe pack/mapping
provenance, so a reviewer can trace the verb's meaning without exposing
credentials or raw private task inputs.

For a Jam pack, the mapping sequence is: validate `part` and the required
caller `idempotencyKey`; resolve the retained pack's declared application
act and binding; compute its target/body once; persist the prepared object;
dispatch once. The key is copied unchanged into the Room call and is not
omitted by the mapping. This is schematic until Jam chooses its first
declared vocabulary; `claim`/`note` is not prescribed for all Jam verbs.

Uncertain command/provider outcomes remain C2/C3 reconciliation work.
Retrying an act, deduplicating attention input and deciding whether an
external effect occurred are separate operations. MCP Tasks or wait
timeouts cannot turn an unknown external outcome into safe repetition.

## 6. Results, credential outputs and authority

Keep R-API-1's distinction: an ordinary Room refusal is a result with
`isError: false`; a tool execution failure is `isError: true` and carries
the safe `ArtroomError`; protocol faults use the selected SDK's JSON-RPC
error mechanism. Advertised structured output must cover every returned
shape. MCP requires conformity when an output schema is advertised.
[Tools specification](https://modelcontextprotocol.io/specification/2026-07-28/server/tools).

Proposed default: advertise a disjoint success / Refusal / ArtroomError
union, keeping existing flat Artroom shapes and a brief text form. Match
the selected SDK's supported schema representation and exact contract;
do not assert `oneOf` exclusivity unless the branches really distinguish
themselves. If a reviewed SDK requires a different tool-error representation,
state it explicitly and preserve the R-API-1 semantics across transports.
An implementation review settles the exact schema change; this plan is
not evidence of a reproduced schema failure in an approved adapter.

An explicit ready-workspace grant is an authorized credential output.
It must be available to the current eligible holder/lease through that
specific grant boundary. Incidental tool/read results, ordinary text,
attention, public logs, errors, prompts, resource caches and app debug
state must not contain its token. Pending/failed workspaces issue none.
Keep positive grant and negative unauthorized/disclosure scenarios;
“no token in any result” would incorrectly ban the useful grant itself.

OAuth/bearer authority is not a direct owner/admin device session. The
approved initial raw private workspace/transcript/command reads require
direct-key provenance and current owner/admin authority at the trusted
Room boundary. A member handle, generic MCP read, OAuth consent or
delegation does not satisfy that requirement. Other participants receive
the approved minimal status. Task controls retain their separately signed,
resource/action/body-bound authority. MCP cannot add owner-control power.

Browser disconnection does not stop authorized active hosted work.
Revoking a device key, removing the owner or ending a delegation follows
C1/C3's explicit lifecycle and current-authority checks. OAuth refresh,
cached descriptors and a surviving MCP connection cannot reverse those
effects or silently substitute a new owner. Workspace epochs, leases and
physical credential cleanup remain their existing owners' responsibilities.

## 7. OAuth: identification, consent and Room admission

Retain stage 2 OAuth, Protected Resource Metadata, canonical Room-resource
audience binding, the metadata-bearing bearer challenge, CIMD preference
and needed legacy-client registration compatibility. The join page may
host these steps but must distinguish them:

1. Authenticate the person as the relevant member, or explicitly redeem
   an invitation to join/enroll under the Room's rules.
2. Validate the requesting client, exact redirect URI and Room resource.
   Show the client identity/provenance, destination hostname, Room and
   requested scopes. An invitation redemption is not client consent.
3. Obtain consent to that client/resource/scope combination. A denial or
   invalid request issues no token. Reuse remembered consent only within
   its validated identity/resource/destination/scope boundary.
4. Issue the audience-bound credential under the chosen existing Room
   principal/delegation model. Validate expiry/audience/scopes, then check
   current Room member/key/delegation authority at each relevant operation.

The pinned provider separates sign-in from client consent and validates
safe redirects. Its resource-server handler must enforce operation scopes;
token validation does not supply Artroom role or owner-control policy.
[Consent page](https://github.com/cloudflare/workers-oauth-provider/blob/v1.2.1/docs/consent-page.md),
[resource servers](https://github.com/cloudflare/workers-oauth-provider/blob/v1.2.1/docs/resource-servers.md).

Token audience Room A cannot be used for Room B. OAuth tokens are not passed
through to Artifacts, model providers or arbitrary application services.
The exact scope vocabulary, refresh/revocation mechanics and mapping to
Room principal/delegation remain a bounded design deliverable of the MCP
owner with C1/N3. They must preserve these decisions and the full OAuth
journey rather than assuming the provider package completes it.

## 8. Wire caching and data access

For 2026-07-28, complete `server/discover`, `tools/list`, `prompts/list`,
`resources/list`, `resources/templates/list` and `resources/read` results
carry `ttlMs`/`cacheScope`. That rule does not make `tools/call` generally
cacheable. Interim `input_required` and requests resumed through
`inputResponses`/`requestState` are not cacheable.
[Caching specification](https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/caching).

Use private caching for authenticated Room discovery/lists/resources,
separated by authorization context and by result-affecting Room, policy,
toolset, URI/arguments and cursor. This is an Artroom disclosure policy;
`cacheScope` itself enforces no Room authorization. A positive TTL is a
freshness hint and does not promise continued authority after revocation.
Immutable repository data does not make disclosure permission permanent.

Keep moving state immediately stale. The older one-hour descriptor TTL
is a candidate upper bound, not a license to reuse authority for an hour.
The owner must define invalidation/current-authority checks for its actual
cache. Any authorized immutable-content cache behind a read tool is a
separate application optimization; do not label its tool response wire
cacheable solely because it contains a pinned commit. Credential grants
and raw private resources are not placed in a reusable shared cache.

## 9. Clients, context and live operation

Target MCP 2026-07-28 and the retained legacy stateless wire mode. On this
date the official version page calls 2026-07-28 current, with compatible
changes possible; it is not final. Pin the deployed SDK/spec snapshot and
record the accepted versions in conformance evidence.
[Versioning](https://modelcontextprotocol.io/docs/2026-07-28/learn/versioning).

The older Claude Code/Codex 0.160/pi 1.0 matrix remains dated research.
Do not promote its flags, exact limits, transport defaults, prompt support,
OAuth coverage or Apps support into current delivery claims. Named client
version/configuration and fresh-agent evidence establish Artroom support.
pi-durable is a runtime/framework choice, not another MCP client whose
features can be inferred from pi. Its caller-driven spike does not prove
an autonomous hosted agent; C3 owns that implementation.

Artroom retains conservative budgets: self-contained instructions within
512 characters; descriptions under 1,000 characters; builder descriptors
under 3,000 tokens and other toolsets under 2,500; text results under 20 KB
with explicit bounded slices/cursors. These are project budgets. Official
OpenAI guidance says the first 512 characters should stand alone; it does
not establish a universal hard truncation at that position.
[Official OpenAI MCP guidance](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

The budget includes the general declared route and loaded pack tools.
Keep tools-only access complete through selection/pagination and concise
schemas rather than exposing an unbounded catalogue all at once. CI
checks the actual shared descriptor representation using the documented
token counter, and reports version/method. Browser review uses N1's
immutable reads; prompts/resources/apps improve access but are optional.

Polling stays the reliable agent baseline: attention cursor, bounded waits,
operation handles and ordinary authoritative reads. A timeout or disconnect
does not imply pause, cancellation, completion or a failed side effect.
Durable input delivery, fresh visibility scans and catch-up follow 007/008
under C3, independent of the wire connection.

Stage 3 still includes live `subscriptions/listen`. It needs a reviewed
Room-to-handler routing/recovery design: Cloudflare notification routing
belongs to a handler instance and is isolate-local; a fresh per-fetch
handler cannot notify an older handler's stream.
[Handler API](https://developers.cloudflare.com/agents/model-context-protocol/apis/handler-api/).
Module-scope reuse alone proves no delivery across isolates. On reconnect,
the client reconciles from Room cursors/reads; notifications are hints,
not replay, authority or work completion. Real-time Jam/UI work retains
the Room WebSocket route and its applicable recovery contract.

Tasks present existing long-operation handles and status, without changing
what finished or who may cancel. MCP Apps retain the proposed Proposal and
Needs-you screens using the UI components. Elicitation may help choose an
overlapping lane, but consent/review/landing remain properly authorized
Room operations. A host's unsupported extension leaves the equivalent
tools journey available.

## 10. Dependencies and implementation ownership

| Existing owner | Required handoff |
|---|---|
| Original MCP `489a992e` / `932ce20e` | Reviewed dated reconciliation, then coherent source-note/index integration through normal source review/landing |
| MCP amendment `a9788a59` and core `9ca1d290` | Retain adopted items 1–4; reconcile descriptor schemas, required keys, bounded waits and transport implementation at the exact composed head |
| Declared Stage 5 `a5d64b35` | General catalogue/act routing, client prepared meaning, historical display, allowed bound declared check steps and legacy/platform transport exclusions under `fa120186`; functional review remains separate |
| N1 `53016b8e` | Reviewable immutable proposal/diff/interdiff/file reads; pin identities, bound results and enforce authorized disclosure |
| N3 `f3299ab4` | Public SDK/MCP library, starter application, onboarding/dev loop/exported fixtures and named harness integration; no private Room imports |
| N4 `5fee04f4` and N6 `db2fd146` | Current contextual guidance and the complete manual, including every named harness, retry/refusal/recovery path |
| N5 `f1af7cfd` | Pack/application installation, checker deployment, evolution/regrant, held-work exit and historical meaning |
| C1 `b538c5ea` and C3 `13dfc613` | Current identity/authority, durable conversation and prepared-object ownership; signed controls, private reads and revocation lifecycle |
| C2 `6cdaf20f`, C4 `18815307`, C5 `cfbde32f`, C6 `d89fc17f` | Real workspace recovery, browser identity/journey, integrated deployed acceptance and matching user docs |
| 007/008 and wake `24711ceb` | Durable input/wake/schedule meaning and bounded catch-up, with notice closure distinct from requested action results |

L4 library retains separable `coreTools`, `packTools`, `toMcpResult`, handler
construction and transport-independent descriptors/runners, with exact
names/exports reviewed by N3. Apps may compose their own namespaced tools
and re-export the core under current Room delegation. Their state and
external-operation ledgers remain theirs, with every Room write normally
admitted. No new duplicate implementation request is created by this map.

| Stage | Complete retained deliverable and status boundary |
|---|---|
| 0 endpoint | Credit the adapter source and its existing owner; verify actual deployed routing/authentication and named cold Claude Code evidence when delivered |
| 1 core | Items 1–4, common fourteen-tool surface plus declared routing at its existing stage; role defaults, waits, schema/result/error agreement, context budget, Codex and pi cold runs and guides |
| 2 open surface | Items 5–9: four reads, packs and configured toolsets, all six resources/five prompts, published library, OAuth across named hosts and first suitable declared Jam pack |
| 3 enhancements | Tasks, UI Apps, reviewed subscription routing/recovery and overlap elicitation, with tools/polling fallback |

Resources/prompts are removed from the older stage 1 row only to honor
adopted item 9's stage 2 placement. Their functionality remains owed.
A deliberate sequencing change must be recorded rather than silently
rewriting the decision. Stage 2 breadth is independent of builder's
first-Jam judgment; Jam may start using the suitable acts/client route.

## 11. Acceptance and unresolved choices

Retain all seven original acceptance groups, with these corrected witnesses:

| Group | Scenario and observable result |
|---|---|
| Wire conformance | Modern and legacy stateless calls conform at a named SDK/spec snapshot; disclose the selected published suite or bounded spec-derived cases if none exists |
| Cold agents | Fresh Claude Code, Codex default configuration and pi agents get only URL, scoped credential and guide, make a useful change and follow review/landing/publication; stage 2 reviewer reads code without checkout; record versions, turns, tokens, refusals and outcomes |
| Tools complete | Repeat the useful journey with resources/prompts/elicitation/Apps/subscriptions unavailable; declared applications still discover and submit their own acts |
| Context | Actual role/pack descriptors and instructions satisfy the conservative budgets with the named measurement method |
| Authority/retry/credentials | Hidden calls receive ordinary admission; legacy bearer check and bearer roster stay excluded from MCP, including aliases; a differently named declared check step succeeds through generic v2 `act` with qualified evidence and its exact current grant, while absent/stale binding, insufficient role, self-check and v1/platform calls are refused; one pack call produces one act with the caller key; lost reply/restart then pack/declaration change replays identical prepared meaning; stale meaning requires explicit fresh preparation; ready holder gets explicit grant while unauthorized/incidental/cache/log/error paths disclose none |
| Schema drift | Every advertised structured success/refusal/error shape matches contract and shared runner across HTTP/stdio; normal and error text remains understandable |
| Jam pack | Installed by ordinary reviewed configuration acts, maps the chosen declared vocabulary and works from the named agent; upgrade/history/regrant retains old meaning and unresolved work |

Add focused OAuth positive/negative consent and wrong-Room/current-revocation
cases to that authority group. Add an honest disconnect/reconnect case to
subscriptions when implemented. These are useful boundary witnesses in
their existing implementation tasks, not a per-field sweep or a new large
cross-product suite. Carry unchanged reviewed source/evidence only when
its dependencies and witness meaning are unchanged.

Unresolved implementation choices stay explicit:

1. Exact descriptor/error union encodings supported by the selected SDK,
   with flat Artroom results and public-schema conformance preserved.
2. Pack activation/mapping storage and prepared-handle encoding in the
   existing owner; general discovery already supplies the required route.
3. OAuth scope names, principal/delegation mapping and refresh/revocation
   mechanism under the current trusted Room authority contract.
4. Actual private-cache lifetime/invalidation and subscriber routing across
   isolates, with fresh authority and Room catch-up maintained.
5. Named current client configurations, the conformance runner and exported
   context counter. Historical documentation alone cannot answer these.

## 12. Source integration and bounded verification

Planner writes only this file and the planning index. The note is reviewed
as frozen evidence; source edits remain with the commissioned owner.
Before integrating, compare the old source note and current contract to
the evidence above. Apply all seven corrections throughout the complete
note, including summary, tables, examples, acceptance and decisions, so
contradictory old statements are not left active elsewhere.
Preserve `fa120186` throughout that reconciliation: a valid bound declared
check step is allowed through generic MCP, while legacy and platform
exclusions and independent-check qualifications remain explicit.

For prose, `git diff --check` must exit 0; verify the saved/frozen bytes,
hash and current provenance. No install, runtime gate or conformance run
is required to review this design. A future source implementation uses
`docs/testing.md` and its current package configuration: at the reviewed
combined candidate `npm run gate` runs whitespace, typecheck and selected
complete tests; `npm run test:changed` selects changed boundaries. Main
does not yet have those scripts, so inspect the actual integrated head
before issuing either command. Record exact commands/results and use
focused semantic controls for changed authority/meaning boundaries.

Stop and bring back a concrete design correction if integration requires
automatic re-signing, client-consent omission, widened raw private access,
an excluded MCP write, a second vocabulary or unowned public retry state.
Do not treat an SDK limitation or an absent client feature as permission
to narrow the adopted capability scope. Planning approval closes only the
dated clarification; original source integration, functional approvals,
deployment and cold-agent acceptance require their own recorded results.
