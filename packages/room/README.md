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
| `ArtifactsPort` | Forks, workspace tokens, heads, pinned refs, diffs and previews | **Not wired.** Tests use [src/memory/artifacts.ts](src/memory/artifacts.ts), a small in-memory git. |
| `PublisherPort` | Publishes the log to `refs/artroom/log` (R-LOG-8) | **Not wired.** It has lane L's `LogPublisher` contract, so the adapter is `() => LogPublisher.open(remote)`. Lane L's package is in review. Tests use a stand-in with the same contract over [src/memory/log.ts](src/memory/log.ts)'s remote, whose faults are transport faults only. |

The Room's side of log publication is durable. Before any remote write it
stores the cohort: the entries through N, the signed checkpoint, the
retained files, and the expected parent (the last commit it confirmed).
Every attempt, even after a restart, publishes that same cohort. The
publisher reads the ref back after an unclear answer and completes forward.
The Room seals the `checkpoint` event and moves `publishedThrough` only
after the publisher confirms the commit. When the publisher reopens, the
ref must hold either the last confirmed commit or one that publishes exactly
the pending cohort; anything else is another writer, and publication stops
and tells the admins.

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
`redeem`, `read` and `subscribe`. Refusals are returned values. Failures are
thrown objects with `name: "ArtroomError"`; their `code` and `retryable`
survive the RPC hop.

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
- WebSocket: `GET /v1/rooms/:room/ws`. Send `{"session": "<token>"}` as the
  first message. Tokens never go in a URL.
- RPC: `subscribe(session, cursor)` returns a byte stream of
  newline-delimited JSON `Update`s.

### Founding a room

The contract has no route for this, so the package adds two:

1. `POST /v1/rooms` with `{ name, repo, admin: { handle, key }, recovery }`
   returns the genesis object to sign and a `draft` value. The Worker
   derives the room key from `ROOM_KEY_SECRET` and the draft.
2. `POST /v1/rooms/found` with `{ genesis, sig, draft }` founds the room.
   Entry 0 is the genesis; entry 1 activates the policy on main, or the
   default (R-GEN-1, R-POL-9).

The same two steps are RPC methods on the Worker: `draft` and `found`.

## Configuration

[wrangler.jsonc](wrangler.jsonc) declares the `Room` and `RoomNames`
Durable Objects with SQLite storage. It is not deployed by this lane.

| Setting | Meaning |
|---|---|
| `LEASE_SECONDS` | Lease length, default 1800 |
| `PUBLIC_URL` | Base URL, used for the MCP endpoint in `Redeemed` |
| `ROOM_KEY_SECRET` (secret) | Derives each new room's signing key |

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
  and lane L's publisher on shared SQLite. **Pending** (phase 2, P1.9): it
  waits for lane B revision 2, lane L revision 2 and amendment 2.
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

1. **Founding.** The contract has no route or method to create a room.
   This package adds `POST /v1/rooms`, `POST /v1/rooms/found` and the RPC
   methods `draft` and `found`.
2. **Bearer acts.** The contract says the room signs an MCP agent's acts,
   but `RoomWire` has no method for it. The Durable Object has
   `bearerAct(bearer, act)` for the MCP package (lane E).
3. **RPC subscriptions carry bytes.** Workers RPC streams carry bytes, so
   `subscribe` returns newline-delimited JSON `Update`s, not a stream of
   objects. The client package decodes it.
4. **Recomputation after activation is not yet an entry.** R-POL-9
   recomputes open proposals' obligations when a policy activates. That
   needs policy evaluation, which is asynchronous, but `policy-activated`
   must be the next entry after the landing (R-PUB-9). So the event records
   `recomputed.proposals` and `fenced`, and always `reopened: 0`. The room
   recomputes from a durable mark; until that finishes, `land` on such a
   proposal is refused `obligation-open`. Each recomputation (new
   obligations, carried and not-carried evidence, decisions) is stored by
   `recordRecomputation`, and its decisions are retained (R-LOG-7).
   Amendment 2's `obligations-recomputed` event will be sealed in that one
   place.
5. **Readiness decisions.** Land rules evaluated during preparation
   (stage `reservation`) are retained, but no entry records their
   decisions. A failure is recorded in the `land-outcome` refusal.
6. **The retry reason when reservation's byte comparison fails.** The
   contract lists no reason for "the land-rule input changed". The room uses
   `obligation-open`.
7. **Unknown note anchors.** A note anchored to an entry that does not
   exist is refused, recorded, with `lane-unknown`; the contract has no
   closer rule.

## Not done

Phase 2 of review aabda1ed (P1.9) waits for lane B revision 2, lane L
revision 2 and contract amendment 2 to be approved:

- the real landing engine (lane B) behind `LandingPort`, replacing the
  in-memory state machine, with shared-SQLite integration tests;
- the real publisher (lane L) behind `PublisherPort`;
- the Artifacts adapter;
- carrying checks across integrations, and filtered checker inputs;
- the Room's authority replay;
- amendment 2's 13 lane A edits (protocol section 27).

Also not done:
- [src/verify.ts](src/verify.ts) does the offline checks of R-LOG-10
  except replaying the roster; lane L's `verifyLog` does that.
- The MCP endpoint (lane E) and the client package's `connect`, `join` and
  `redeem`.
- Attention is a simple projection: review and check requests, objections,
  notes, landing outcomes, lanes left unheld, revert lanes and notify items.
- No deployment, and no measurements on Cloudflare.
