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
   the log head has not moved. If it has, the room decides again. Then it
   seals the entry, applies the effects and stores the idempotency record.
   There is no `await` between deciding and recording (R-ADM-6).
4. Step 11, `notify`, runs after the commit from a durable queue. Its result
   is a later `notified` entry (R-LOG-13).

The landing engine can write system events while an admission waits for
policy. That is why the head check exists: an admission never commits a
decision made on an older log.

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
| `ArtifactsPort` | Forks, workspace tokens, heads, pinned refs, diffs, previews and the log ref | **Not wired.** Tests use [src/memory/artifacts.ts](src/memory/artifacts.ts), a small in-memory git. |

A deployment without the landing and Artifacts adapters still admits
roster acts, claims, notes and reviews. `propose` and `land` fail with
`unavailable`, and nothing is recorded.

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

## Section 23 cases

Each case below has a test whose name starts with "section 23". The file is
in `test/workerd/`.

| Case | Test file |
|---|---|
| Approval with `dependsOn`, helper changes | obligations |
| No `dependsOn`, room default lists `src/lib/**` | obligations |
| No declaration and no default | obligations |
| `package-lock.json` changes | obligations |
| `.artroom/policy.json` changes | obligations |
| Release, new generation, policy activation during preparation | landing |
| Paused push; release, new generation, objection, `retired` revocation | landing |
| Paused push; `compromised` revocation of evidence | landing (landed with a revert lane, and aborted) |
| Pre-signed act after its key's revocation | roster |
| Act under an expired delegation | roster |
| Byte-identical replay after revocation | roster |
| Compromised reviewer's approval | obligations |
| Reviewer retired after their review | obligations |
| Sole admin changes policy | landing |
| Locked-out admin restored | roster |
| Policy lockout | landing |
| Same lockout, two admins | landing |
| B watches A's workspace | lanes |
| A requests the token: old lease, revoked key, removed, expired delegation | lanes |
| A token appears in no output | lanes |
| Browser join | roster |
| MCP redemption | roster |
| Room-custody invitation, self-signed join on `/acts` | roster |
| Room-custody invitation, self-signed join over RPC | roster |
| Room-custody invitation, client redemption | roster |
| Client-custody invitation, room redemption | roster |
| Unjoined Worker | roster |
| Recovery key | roster |
| Log construction | log |
| A `notify` rule hits a runtime failure | log |
| Stage-specific land rule | landing |

These cases belong to other lanes and are not tested here: a new failing
test under `tests/` and a file missing from a scoped checker's inputs
(checks carry: lanes C and G); crash before or after push, two operations
preparing in parallel, the delayed authenticated push, the failing forward
retry, token revocation during a push, and the lease race on publication
(the publisher: lane B); scoped checker, new test (lanes C and G).

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
4. **Recomputation after activation is not an entry.** R-POL-9 recomputes
   open proposals' obligations when a policy activates. That needs policy
   evaluation, which is asynchronous, but `policy-activated` must be the
   next entry after the landing (R-PUB-9). So the event records
   `recomputed.proposals` and `fenced`, and always `reopened: 0`. The room
   then recomputes from a durable mark, and until that finishes a `land` on
   such a proposal is refused `obligation-open`. The decisions are retained
   (R-LOG-7) but no entry records the new obligations. The contract needs an
   event for this.
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

- The landing and Artifacts adapters (see "Ports").
- Carrying checks across integrations. A check counts only on the
  integration it bound. Verdict carrying works through the policy port.
- Filtered snapshots for scoped checkers (R-CARRY-9). A `filtered` check
  input is refused `check-binding`.
- `artroom verify` replaying the roster to re-judge each act's authority.
  [src/verify.ts](src/verify.ts) does the other offline checks of R-LOG-10.
- The MCP endpoint (lane E) and the client package's `connect`, `join` and
  `redeem`.
- Attention is a simple projection: review and check requests, objections,
  notes, landing outcomes, lanes left unheld, revert lanes and notify items.
- No deployment, and no measurements on Cloudflare.
