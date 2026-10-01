# @generalbusiness/artroom-room

The Room is the part of Artroom that decides. It is a Cloudflare Worker and
one Durable Object per repository. The Durable Object keeps the repository's
log in SQLite and is the only sequencer for it: every act gets its place in
the log here, and nowhere else.

The rules this package follows are in [docs/protocol.md](../../docs/protocol.md).
Code comments and test names cite them by number, for example `R-ADM-12`.

## What it does

- **Admits acts.** It checks each signed envelope in the order of R-ADM-1,
  then either records it, records a refusal, or answers without recording.
- **Keeps the roster.** Members, keys, teams, delegations, invitations and
  the recovery key (R-GEN, R-ADM-3).
- **Runs lanes and leases.** Claims, generations, `expectedGeneration`,
  lease generations and fencing. An alarm expires leases (R-LANE).
- **Tracks obligations and evidence.** Reviews and checks, who may give
  them, and whether they still count after a key is revoked (R-OBL, R-REV).
- **Seals and publishes the log.** Each entry is hashed and signed in the
  order of R-LOG-2. The alarm publishes checkpoints to `refs/artroom/log`
  (R-LOG-8).
- **Serves three transports.** RPC for service bindings (`RoomWire`), HTTPS
  routes (`HttpRoutes`), and live updates by long poll, WebSocket and RPC
  stream (R-API-8).

It does not land code itself, evaluate policy expressions itself, or talk to
Artifacts itself. It calls ports for those (see "Ports").

## How admission works

Every act takes the same path, whatever the transport:

1. Steps 1 and 2 (shape, room ID, size, signature) run first. A failure is
   a thrown `ArtroomError`. Nothing is recorded.
2. Steps 3 to 9 run one admission at a time, through a queue. They read
   state and may wait for policy evaluation.
3. Step 10 runs in one synchronous SQLite transaction. It first checks that
   the log head has not moved. Then it passes the **final boundary**: it
   judges the act's authority again with the room clock read now, so a
   delegation or invitation that expired while policy was evaluated is
   refused, unrecorded. A lease past its expiry makes the admission start
   over, and the expiry is sealed first. Then it seals the entry, applies the
   effects and stores the idempotency record. There is no `await` between
   deciding and recording (R-ADM-6).
4. Step 11, `notify`, runs after the commit from a durable queue. Its result
   is a later `notified` entry (R-LOG-13).

The landing engine can write system events while an admission waits for
policy. That is why the head check exists: an admission never commits a
decision made on an older log.

A room-custody redemption is two acts, a `join` and a `delegate` to the
session key. The room decides both before recording either: it judges the
`delegate` on the state after the `join` by applying the `join` in a
transaction it rolls back. Then one transaction seals both, stores the
room-held keys and the bearer hash. A refusal or failure at any point
records nothing and leaves the invitation unused (R-CRED-9).

Obligations have one calculator ([src/obligations.ts](src/obligations.ts)).
Whether a verdict or check qualifies is judged from facts fixed at its
admission (authority, teams, whether it was the author, flags) against the
requirement in force. The projection, sealed `obligations` effects, `land`
admission, readiness and reservation all use it.

Work after a commit is one mechanism: named, idempotent durable steps (lease
expiry, notify, token revocation, pins, previews, workspaces,
recomputation, landing, log publication). The alarm runs them all; a commit
may start one at once. Nothing depends on an in-memory promise surviving.

Sealing is synchronous. SHA-256 and Ed25519 signing use `@noble`, so the
room can hash and sign inside the transaction. Verifying a caller's
signature uses WebCrypto, before admission starts.

## Ports

The Room talks to other lanes through three small interfaces in
[src/ports.ts](src/ports.ts).

| Port | What it does | Adapter today |
|---|---|---|
| `PolicyPort` | Evaluates `refuse`, `require`, `carry`, `land` and `notify` rules | **Wired.** [src/policy.ts](src/policy.ts) calls lane C's `@generalbusiness/artroom-policy`. It passes the lane purpose, the recovery-key flag, carry facts and the notify directory, so each is in the replay context. One act shares one meter. |
| `LandingPort` and `LandingHost` | The landing state machine, and the Room's side of it | **Not wired.** The interfaces match lane B's `Landing` class and `LandingRoom` interface, so the adapter is `(sql, host) => new Landing({ sql, room: host, publisher, tokens })`. Lane B's package is not on main yet. Tests use [src/memory/landing.ts](src/memory/landing.ts), which follows lane B's state machine. |
| `ArtifactsPort` | Repository creation at founding, forks, workspace tokens, heads, pinned refs, diffs and previews | **Not wired.** Tests use [src/memory/artifacts.ts](src/memory/artifacts.ts), a small in-memory git. |
| `PublisherPort` | Publishes the log to `refs/artroom/log` (R-LOG-8) | **Not wired.** It has lane L's `LogPublisher` contract, plus `commitFor`: the commit that `publish` would make of a cohort on a given parent, computed by the same Git serialization, with no I/O. The adapter is `() => LogPublisher.open(remote)` once lane L exposes `commitFor`. Lane L's package is in review. Tests use a stand-in with the same contract over [src/memory/log.ts](src/memory/log.ts)'s remote, whose faults are transport faults only. |

The Room's side of log publication is durable. Before any remote write it
stores the cohort: the entries through N, the signed checkpoint, the
retained files, the parent (the last commit it confirmed), and the exact
commit the publisher's serialization makes of them (`commitFor`). Every
attempt, even after a restart, publishes that same cohort. The publisher
reads the ref back after an unclear answer and completes forward. The Room
seals the `checkpoint` event and moves `publishedThrough` only when the
publisher confirms that exact commit. When the publisher reopens, the ref
must hold the parent or that exact commit. Anything else is another
writer, even a commit with the same entry lines, and publication stops and
tells the admins.

A deployment without the landing, Artifacts and publisher adapters can found rooms
and admit roster acts, claims and notes. It treats the canonical repository
as empty, so a new room starts with the default policy. `propose`, `land`
and workspaces fail with `unavailable`, and nothing is recorded.

The Room keeps every platform rule itself, even where lane C also checks
it: authority, roles, lanes and leases, `obl_admin-approval` for
`.artroom/**`, configuration-recovery lanes, custody, idempotency, secrets
and the log.

## Using it

### RPC

`env.ARTROOM.room(idOrName)` returns a `RoomWire`: `submit`, `request`,
`redeem`, `bearerAct`, `bearerRequest`, `read` and `subscribe`. Refusals are
returned values. Failures are thrown objects with `name: "ArtroomError"`;
their `code` and `retryable` survive the RPC hop.

`bearerAct` and `bearerRequest` serve an MCP agent's bearer session
(R-CRED-10). The room judges the token first: an unknown or expired token,
or a revoked delegation or session key, is `unauthenticated`, and nothing is
recorded. It then builds the envelope (session key, delegation, room ID),
signs it and admits it on the `submitted` path, so a retry with the same act
and idempotency key gets the original result while the token is valid.
`bearerRequest` takes `workspace` and `workspace-token` only.

### HTTPS

The routes are the keys of `HttpRoutes`. For example:

```sh
curl -X POST https://<host>/v1/rooms/<room>/acts -d @signed-envelope.json
curl -H "Authorization: Bearer <session>" https://<host>/v1/rooms/<room>/log?after=10
```

A refusal is status 409 with a `Refusal` body. A failure uses the status
table of R-API-1. Every JSON response is `Cache-Control: no-store`.

### Live updates

- HTTPS: `GET /v1/rooms/:room/subscribe?cursor=…&waitMs=…`, a long poll.
- WebSocket: `GET /v1/rooms/:room/ws?cursor=…`, offering the subprotocols
  `artroom.v1` and `artroom.token.<token>` (R-API-12). The room judges the
  token before the upgrade (401 when missing or not valid), answers
  `artroom.v1`, keeps only the token's hash, judges it again before each
  update (closing with 1008 when it ends), and ignores client messages.
- RPC: `subscribe(session, cursor)` returns a byte stream of
  newline-delimited JSON `Update`s.

Every attention item has a position that increases in the order items are
made. Cursors carry it, so an item made later about an earlier entry (for
example, the admins' item when publication stops) still reaches every
cursor issued before it. Cursors in the earlier `(seq, n)` form still
work; nothing after their point is skipped, though an item made later about
an earlier entry may be delivered twice.

### Storage upgrades

The Room's and the registry's SQLite schemas change only through numbered
migrations ([src/store.ts](src/store.ts), [src/registry.ts](src/registry.ts)).
Every opening runs the steps above the stored version, each in its own
transaction with its version, so a crash leaves a whole version. Each step
is also safe to run twice.

### Founding a room

Founding is two steps with no credential (R-GEN-10). Over RPC they are the
Worker's `draft` and `found` (`ArtroomFounder`).

1. `POST /v1/rooms` with a `RoomDraft`: name, repository source, first
   admin and recovery key. The source is `{ "kind": "new" }` for a fresh
   repository, or `{ "kind": "import", "grant": … }` with an operator's
   signed onboarding grant (R-GEN-12). The answer is the genesis to sign
   and a `draft` value. `draft` creates, reads and binds nothing.
2. `POST /v1/rooms/found` with `{ genesis, sig, draft }`. The Worker:
   1. validates every genesis field again, including the profile and the
      `jsonata` version;
   2. checks the room key against the draft value;
   3. verifies the first admin's signature;
   4. authorizes the repository: for `new`, it must be the fresh identity
      derived from the draft value in the public namespace; for `import`,
      the grant must be signed by a configured operator key, for this
      repository and this admin key, unexpired unless this is a retry;
   5. binds repository, room ID and name in the registry, in one atomic
      step (R-GEN-13);
   6. only then has the room create or read the repository and seal
      entries 0 and 1. The room itself refuses to do this unless the
      registry binds it.

A failure in steps 1 to 5 binds nothing. A failure in step 6 is
`unavailable`; the binding stays, and the same `found` again completes the
founding or returns the same room ID.

The **registry** is one Durable Object per deployment. It never moves or
removes a binding, so a repository has one room, one name, one sequencer and
one publisher. The room publishes the log and drives landing (minting
canonical write tokens) only when the registry binds it (R-PUB-10).
`GET /v1/rooms/:room`, with a name or an ID and no credential, returns the
room's `RoomRef` (R-API-11). A name in the form of a room ID is refused.

Until the Artifacts adapter (phase 2b), a repository identity has the form
`<namespace>/<32 hex characters>`; a name or URL is refused as
`bad-request`.

## Configuration

[wrangler.jsonc](wrangler.jsonc) declares the `Room` and `Registry`
Durable Objects with SQLite storage. It is not deployed by this lane.

| Setting | Meaning |
|---|---|
| `LEASE_SECONDS` | Lease length, default 1800 |
| `PUBLIC_URL` | Base URL, used for the MCP endpoint in `Redeemed` |
| `ROOM_KEY_SECRET` (secret) | Derives each new room's signing key and, for public founding, its repository identity |
| `OPERATOR_KEYS` | Operator key IDs, comma-separated, whose onboarding grants are accepted (R-GEN-12) |
| `PUBLIC_NAMESPACE` | The repository namespace reserved for public founding, default `artroom-public` |

## Running the tests

From the repository root, after `npm install`:

```sh
npm run typecheck
cd packages/room
npm run test:node      # pure parts, in Node
npm run test:workerd   # the Room in workerd, with real Durable Object SQLite
```

The workerd suite uses the real policy runtime (lane C), the in-memory
landing engine and the in-memory Artifacts. Alarms are scheduled as usual,
but in tests they run only when a test asks (`tick` or
`runDurableObjectAlarm`).

## Acceptance cases and their evidence

Four kinds of evidence, from weakest to strongest:

- **Unit.** Node tests of the pure parts (`test/node`): canonical bytes,
  keys and signatures, globs, secret scanning, shapes and identifiers. They
  back every row below but prove no row alone.
- **Room in workerd, real SQLite.** The Room Durable Object with its real
  SQLite storage, the real policy runtime (lane C), and in-memory doubles
  for landing, Artifacts and the log publisher (`test/workerd`). Each case
  below has a test whose name starts with "section 23" or with the finding
  number.
- **Real B and L integration.** The same cases with lane B's landing engine
  and lane L's publisher on shared SQLite, and the Artifacts adapter.
  **Pending** (phase 2b): it waits for lane B revision 2 and lane L
  revision 2.
- **Deployed.** On Cloudflare with Artifacts. **Pending** for every case.

"n/a" means the case does not involve landing, Artifacts or the publisher.

### Section 23

| Case | Room in workerd, real SQLite (test file) | Real B and L integration | Deployed |
|---|---|---|---|
| Approval with `dependsOn`, helper changes | yes: obligations | n/a | pending |
| No `dependsOn`, room default lists `src/lib/**` | yes: obligations | n/a | pending |
| No declaration and no default | yes: obligations | n/a | pending |
| `package-lock.json` changes | yes: obligations | n/a | pending |
| `.artroom/policy.json` changes | yes: obligations | n/a | pending |
| Release, new generation, policy activation during preparation | yes: landing | B pending | pending |
| Paused push; release, new generation, objection, `retired` revocation | yes: landing | B pending | pending |
| Paused push; `compromised` revocation of evidence | yes: landing | B pending | pending |
| Pre-signed act after its key's revocation | yes: roster | n/a | pending |
| Act under an expired delegation | yes: roster | n/a | pending |
| Byte-identical replay after revocation | yes: roster | n/a | pending |
| Compromised reviewer's approval | yes: obligations | B pending | pending |
| Reviewer retired after their review | yes: obligations | B pending | pending |
| Sole admin changes policy | yes: landing | B pending | pending |
| Locked-out admin restored | yes: roster | n/a | pending |
| Policy lockout | yes: landing | B pending | pending |
| Same lockout, two admins | yes: landing | n/a | pending |
| B watches A's workspace | yes: lanes | Artifacts pending | pending |
| A requests the token: old lease, revoked key, removed, expired delegation | yes: lanes | Artifacts pending | pending |
| A token appears in no output | yes: lanes | Artifacts pending | pending |
| Scoped checker, new test (check carry) | — | C/G; Room part pending (P1.9) | pending |
| Browser join | yes: roster | n/a | pending |
| MCP redemption | yes: roster | n/a | pending |
| Room-custody invitation, self-signed join on `/acts` | yes: roster | n/a | pending |
| Room-custody invitation, self-signed join over RPC | yes: roster | n/a | pending |
| Room-custody invitation, client redemption | yes: roster | n/a | pending |
| Client-custody invitation, room redemption | yes: roster | n/a | pending |
| Unjoined Worker | yes: roster | n/a | pending |
| Recovery key | yes: roster | n/a | pending |
| Log construction | yes: log (and Node: verify helpers) | L pending | pending |
| A `notify` rule hits a runtime failure | yes: log | n/a | pending |
| Stage-specific land rule | yes: landing | B pending | pending |

These section 23 cases belong to other lanes and have no Room test: a new
failing test under `tests/` and a file missing from a scoped checker's
inputs (lanes C and G); crash before or after push, two operations
preparing in parallel, the delayed authenticated push, the failing forward
retry, token revocation during a push, and the lease race on publication
(lane B's publisher).

### Amendment 2 cases (section 23)

| Case | Room in workerd, real SQLite (test file) | Real B and L integration | Deployed |
|---|---|---|---|
| Isolated public creation | yes: founding | Artifacts pending (repository creation) | pending |
| Unauthorized existing repository | yes: founding | n/a | pending |
| Repository altered after draft | yes: founding | n/a | pending |
| Authorized import | yes: founding | Artifacts pending; lane L's verify of the grant pending | pending |
| Simultaneous founding | yes: founding | n/a | pending |
| Duplicate import | yes: founding | n/a | pending |
| Canonical-name aliases | yes: founding | Artifacts pending (identity format) | pending |
| Recovery after binding | yes: founding | Artifacts pending | pending |
| Profile, room key or name refused; bound name | yes: founding | n/a | pending |
| Name to ID | yes: founding | n/a | pending |
| WebSocket | yes: log | n/a | pending |
| RPC subscription | yes: amendment2 | n/a | pending |
| Recompute after activation | yes: amendment2 | L pending (replay) | pending |
| Land rules in preparation | yes: amendment2 | B pending | pending |
| Byte mismatch | yes: landing | B pending | pending |
| Notify across an activation | yes: amendment2 | L pending (verify replays V1) | pending |
| Bearer receipt after revocation | yes: amendment2 | n/a | pending |

The MCP case of amendment 2 (`explain`, `attention`, `because`) belongs to
lane E.

### Review aabda1ed findings

| Case | Room in workerd, real SQLite (test file) | Real B and L integration | Deployed |
|---|---|---|---|
| P1.1 Atomic room-custody redemption | yes: review-aabda1ed | n/a | pending |
| P1.2 Revoked key as recovery key | yes: review-aabda1ed | n/a | pending |
| P1.3 Authority expiring during policy evaluation | yes: review-aabda1ed | n/a | pending |
| P1.4 Recomputation under a changed requirement | yes: review-aabda1ed | B pending (landing part) | pending |
| P1.5 Lost push or read-back, restart, foreign writer | yes: review-aabda1ed | L pending | pending |
| P2.6 Durable pending workspaces | yes: review-aabda1ed | Artifacts pending | pending |
| P2.7 Sealed effects from the calculator | yes: review-aabda1ed | B pending (landing part) | pending |
| P2.8 Cursors at a page boundary | yes: review-aabda1ed | n/a | pending |

### Review 8faa2ef9 findings

| Case | Room in workerd, real SQLite (test file) | Real B and L integration | Deployed |
|---|---|---|---|
| 1. Recovery accepts only the parent or the exact pending commit | yes: review-8faa2ef9 | L pending (needs `commitFor`) | pending |
| 2. Lease deadline during fork creation | yes: review-8faa2ef9 | Artifacts pending | pending |
| 3. Attention made later at an existing head | yes: review-8faa2ef9 | n/a | pending |
| 4. Review reopening in sealed effects | yes: review-8faa2ef9 | n/a | pending |
| 5. Upgrade of populated storage | yes: review-8faa2ef9 | n/a | pending |
| `"*"` fixed at the grant | yes: review-8faa2ef9 | n/a | pending |

## Mutation spot-checks

Each rule below was broken once, and the matching suite run against the
change. Every mutation made at least one named test fail.

| Mutation | A test that failed |
|---|---|
| No head re-check in the commit transaction (R-ADM-6) | R-ADM-6: the admission decides again before it commits |
| Custody not checked against the admission path (R-ADM-12) | both self-signed join cases of section 23 |
| Idempotency replays without comparing bytes (R-IDEM-3) | R-IDEM-3: idempotency-mismatch |
| No secret scan (R-SEC-1) | R-SEC-1 to R-SEC-3 |
| No `after-reservation` flag (R-LAND-8) | section 23, Paused push |
| No byte comparison at reservation (R-LAND-7) | section 23, Stage-specific land rule |
| No lease fencing (R-LANE-6) | R-LANE-6: an old lease generation is fenced |
| Compromised evidence still counts (R-REV-1) | section 23, Compromised reviewer's approval |
| Policy `refuse`, `require` or `land` rules run on a recovery lane (R-ADMIN-5, 6, 8) | R-ADMIN-5 is the Room's own rule |
| Workspace token for a non-holder (R-WS-2) | section 23, B watches A's workspace |
| No notify queue (R-LOG-13) | section 23, Log construction |
| Expired delegations accepted (R-ADM-4) | section 23, Act under an expired delegation |
| No lease expiry in the alarm (R-LANE-8) | R-LANE-8: the alarm expires the lease |
| Sessions survive key revocation (R-CRED-7) | R-CRED-7 |
| No last-admin check (R-GEN-8) | R-GEN-8 |
| Flagged approval counts with two admins (R-ADMIN-2) | section 23, Sole admin changes policy |
| No abort attempt (R-REV-5) | both R-REV-5 cases |
| Authors may review their own lane (R-OBL-2) | R-OBL-2: self-review |
| No outside-claim check (R-PROP-4) | R-PROP-4 |
| Duplicate JSON keys accepted (R-SIG-3) | Node: refuses duplicate keys |
| Overlap misses a real overlap (R-PATH-3) | Node: never misses an overlap |

## Review aabda1ed

The checker's review of `315a8576` requested changes. The eight
reproductions now assert the correct outcomes in
[test/workerd/review-aabda1ed.test.ts](test/workerd/review-aabda1ed.test.ts).

| Finding | Fix | Tests (in that file) |
|---|---|---|
| P1.1 A refused room redemption consumed the invitation | The `join` and the session `delegate` are decided first (the `delegate` on a rolled-back simulation of the state after the `join`), then sealed together with the room-held keys and the bearer hash in one transaction. A refused client-custody redemption records nothing too. | a policy refusal of the session grant…; a policy runtime failure…; an interruption at redemption:after-join / after-delegate…; response-loss recovery…; a client-custody redemption refused by policy… |
| P1.2 A revoked key could become the recovery key | `rotate-recovery` refuses any revoked key, bound or not; the recovery case of R-ADM-3 checks revocation as a backstop | rotation to an unbound compromised key and an unbound retired key…; rotation to a member's key…; a fresh key still becomes the recovery key…; backstop… |
| P1.3 A delegation expiring during policy evaluation still authorized the act | The final boundary judges authority again with the clock read now, inside the write transaction; leases past due are expired before each decision and force a fresh decision at the boundary | a delegation that expires while policy is evaluated…; an invitation that expires…; a lease that runs out…; time passing without any log change… |
| P1.4 Activation kept old qualifications | One qualification rule judged from recorded admission facts against the current requirement; recomputation re-runs `require` and `carry` and is recorded by `recordRecomputation` | the checker's case…; a raised count…; qualification uses the role recorded at admission…; owners…; self-approval…; checker configuration…; carried reviews are re-judged…; a carried verdict is re-qualified…; a landing prepared before the activation… |
| P1.5 A lost push reply wedged publication | A durable pending cohort with its expected parent, retried until the publisher confirms the commit; a fence on reopen against foreign commits; `PublisherPort` has lane L's `LogPublisher` contract | a lost push reply…; lost push and read-back replies…; restart…; an unexpected writer… |
| P2.6 Pending workspaces were never resumed | Workspaces are a durable alarm step: the same op and lease are resumed; the op fails as fenced if the lease ended before or during the fork's creation; a failed `ensureFork` keeps it pending for up to five attempts | interrupted before ensureFork…; interrupted after the fork was created…; a lease that ends while the fork is being created…; a lease that ended before the resume… |
| P2.7 A repeated approval sealed a false `obligations` effect | Effects come from the one status calculator, before and after the act | a repeated approval seals no met effect…; an approval after the same member's objection… |
| P2.8 Attention cursors skipped items at a page boundary | Attention items have a `(seq, n)` position; page and update cursors carry it; an update cursor tracks entries and attention separately; earlier seq-only cursors still work | two items from one entry…; overlapping principals…; an update cursor never passes unseen attention…; an earlier attention cursor… |

Each new guard was broken once and the review's tests run against the
change: all 23 mutations were caught. Two survived at first (carried
verdicts not re-qualified; no fence before creating a fork) and gained
tests. One guard that could not be reached (re-comparing the `delegate`'s
policy input inside the redemption transaction) was removed: the queue and
the log-head check already exclude any change between decision and commit.

## Contract amendment 2

Amendment 2 (protocol section 27) listed 13 edits for this package. Each is
made, and each new guard was broken once against its tests: all 29
mutations were caught (one at the second attempt, after a test was
strengthened).

| Edit | What the Room does | Tests |
|---|---|---|
| 1. `found` re-validates and runs R-GEN-10 in order | [src/founding.ts](src/founding.ts): six ordered steps; nothing read, minted, sealed or bound before authorization and binding | founding: "a different profile or jsonata version…", "an edited genesis not re-signed…", "the Room itself refuses to found a genesis the registry does not bind…" |
| 2. Repository source | `new`: a fresh identity from the draft value in the public namespace, created at step 6; `import`: an operator grant, checked at `draft` and `found`, carried as `genesis.onboarding` | founding: "Isolated public creation", "Unauthorized existing repository" (both), "Authorized import", "Repository altered after draft", "an import grant naming … the public founding namespace" |
| 3. Registry | `Registry` Durable Object binds repository, room ID and name atomically; the same binding again succeeds; room-ID-shaped names are `bad-request` | founding: "Simultaneous founding", "Duplicate import", "Canonical-name aliases", "Recovery after binding", "a name in the form of a room ID…" |
| 4. One publisher per repository | Publication and the landing step run only for the bound room | founding: "a room that the registry does not bind … publishes nothing and drives no landing" |
| 5. `GET /v1/rooms/:room` | `RoomRef` from the registry, no credential | founding: "Name to ID" |
| 6. `bearerAct`, `bearerRequest` | On the Worker's `RoomWire` target, which now implements `RoomWire` whole; R-CRED-10 judging and retries | amendment2: "a bearer claims, opens its workspace…", "Bearer receipt after revocation" |
| 7. WebSocket by subprotocol | Judged before the upgrade; `artroom.v1`; `?cursor=`; hash only; client messages ignored | log: "WebSocket (R-API-12)…", "?cursor= resumes…" |
| 8. `publishedThrough` in attention | `AttentionPage` | amendment2: "the page's publishedThrough comes from the same read" |
| 9. `checkers` in `policy-activated` | Name and digest pairs, sorted by name | amendment2: "as name and digest pairs, sorted by name" |
| 10. `obligations-recomputed` | Sealed by `recordRecomputation`, with decisions, obligations, `reopened` and `blocked` | amendment2: "Recompute after activation" |
| 11. `land-evaluated` | Sealed when preparation's land-rule evaluation is stored, pass or block | amendment2: "Land rules in preparation" |
| 12. Notify across an activation | A queued notify uses the version stored with it | amendment2: "Notify across an activation" |
| 13. `land-input-changed` | Reservation's byte mismatch; in the in-memory engine's table | landing: "Stage-specific land rule and Byte mismatch" |

The RPC subscription case ("RPC subscription", amendment2) checks that the
stream is UTF-8 with one `Update` per line.

## Review 8faa2ef9

The checker's review of `a5a3406a` requested changes. Its reproductions now
assert the correct outcomes in
[test/workerd/review-8faa2ef9.test.ts](test/workerd/review-8faa2ef9.test.ts).

| Finding | Fix | Tests (in that file) |
|---|---|---|
| 1. P1 Recovery accepted any commit with the same entry lines | Before any remote write the pending cohort records its parent and the exact commit (`PublisherPort.commitFor`, the publisher's one serialization). The reopen fence accepts only those two; the confirmed commit must be the exact one | a foreign commit with identical entry lines but a different checkpoint / retained / parent…; a publisher whose confirmed commit is not the expected one…; the exact pending commit is stored before any remote write, and lost-response recovery still confirms it, across a restart |
| 2. P2 A workspace became ready after its lease ran out | The lease is current only if held, the same lease generation, and before its deadline by the clock read now; checked before fork creation and again before readiness. A fenced op runs the lease-expiry and token-revocation steps at once | a lease that runs out during fork creation…; a lease already past its deadline before the resume creates no fork |
| 3. P2 Attention made later fell behind live cursors | A monotonic attention position; live, update and page cursors carry it; a publication error wakes subscriptions; earlier cursor forms map to the position before the first item after their point | the admins' publication-unresolved item arrives on a cursor issued before it…; pages stay lossless…; an RPC subscription opened at the live head…; cursors in the earlier (seq, n) form still read… |
| 4. P2 Sealed effects omitted a reopening | Review and check effects carry `opened` and `met` from the one calculator; a duplicate approval still seals none. A check only adds evidence, so it cannot reopen | Bob approves, then objects…; @ci passes, then fails on the same input… |
| 5. P2 Old storage could not reopen | Versioned, transactional, idempotent migrations for the Room and the registry. Earlier attention keeps its order and gains positions; pending workspaces keep their attempts; earlier evidence gets admission facts that can only remove eligibility; a missing fact reads as "author" | a populated store in the a5a3406a schema / fa836d61 schema reopens, twice…; a store without admission facts is judged as an author… |
| `"*"` delegation followed the grantor's current role | `"*"` is expanded at the grant to the kinds the grantor's role could sign then; earlier `"*"` grants are expanded by migration from the role in the grant's receipt | a member grants '*', then is promoted to admin… |

Each new guard was broken once and the whole workerd suite run against the
change. 19 of 21 mutations were caught, five of them only after a test was added
or strengthened (expiry sealed in the same alarm run; the poll woken, not
timed out; a live subscription; a publisher whose commit differs from
`commitFor`; migrated items whose ID text order differs from `(seq, n)`).
Two mutations are equivalent: a check effect without `opened` (a check
cannot reopen an obligation), and running every migration step on each
opening (each step is idempotent by design). One guard that could not be
reached (comparing the pending commit again when sealing) was removed.

## Secrets

The room scans every string in an act's body before recording it
(R-SEC-1). It refuses a match with `secret-detected`, names the field and
the detector, and never repeats the value.

**Detection is incomplete.** A secret it misses becomes part of a signed,
published log that anyone with access can clone, and it cannot be removed.
The only remedy is to rotate the credential (R-SEC-6).

Workspace, bearer and session tokens are never stored. The room keeps only
a hash of each bearer and session token, and only the ID of each workspace
token. Room-held private keys stay in Durable Object storage and are never
returned, logged or published.

## Contract gaps

Contract amendment 2 resolved the six gaps this package first listed:
founding is in the contract (R-GEN-10 to R-GEN-13), bearer acts and requests
are `RoomWire` methods (R-CRED-10), the RPC subscription carries bytes
(R-API-8), recomputation and readiness decisions are the
`obligations-recomputed` and `land-evaluated` events, and the byte mismatch
is `land-input-changed`. One remains open:

1. **Unknown note anchors.** A note anchored to an entry that does not
   exist is refused, recorded, with `lane-unknown`; the contract has no
   closer rule (open point 36).

## Not done

Phase 2b waits for lane B revision 2 and lane L revision 2 to be approved:

- the real landing engine (lane B) behind `LandingPort`, replacing the
  in-memory state machine, with shared-SQLite integration tests;
- the real publisher (lane L) behind `PublisherPort`, which needs lane L
  to expose `commitFor` from its one Git serialization;
- the Artifacts adapter, including repository creation at founding and the
  mapping of repository identities;
- carrying checks across integrations, and filtered checker inputs;
- the Room's authority replay.

Amendment 2's 13 lane A edits are done (see "Contract amendment 2"). The
deployment still needs an operator command to sign onboarding grants, and
the MCP endpoint's `RoomApi` over `bearerAct` and `bearerRequest`.

Also not done:
- [src/verify.ts](src/verify.ts) does the offline checks of R-LOG-10
  except replaying the roster; lane L's `verifyLog` does that.
- The MCP endpoint (lane E) and the client package's `connect`, `join` and
  `redeem`.
- Attention is a simple projection: review and check requests, objections,
  notes, landing outcomes, lanes left unheld, revert lanes and notify items.
- No deployment, and no measurements on Cloudflare.
