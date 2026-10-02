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

It does not land code itself, evaluate policy expressions itself, or write
git itself. It hosts lane B's landing engine and workspaces and lane L's log
publisher on its own SQLite, and reaches Artifacts through lane B's helpers
(see "Ports").

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

The Room's code talks to other lanes through small interfaces in
[src/ports.ts](src/ports.ts). Every one is wired to the real package.

| Port | What it does | Adapter |
|---|---|---|
| `PolicyPort` | Evaluates `refuse`, `require`, `carry`, `land` and `notify` rules | [src/policy.ts](src/policy.ts) calls lane C's `@generalbusiness/artroom-policy`. It passes the lane purpose, the recovery-key flag, carry facts and the notify directory, so each is in the replay context. One act shares one meter. |
| `LandingPort` and `LandingHost` | The landing operation, and the Room's side of it | Lane B's `Landing` and `LandingRoom`, on the Room's SQLite, with lane B's `ContainerPublisher` and `canonicalTokens`. `readiness` may await; `revalidate` compares the rebuilt reservation input with the bytes the engine retained. |
| Workspaces | One fork per lane, one token per lease generation | Lane B's `Workspaces`, on the Room's SQLite. The Room records which leases it opened (`ws_leases`), carries renewals to the workspace's deadline, and ends a lease's access when it ends. |
| `ArtifactsPort` | Repository creation at founding, config reads, heads, pinned refs, diffs, previews, filtered snapshots | [src/artifacts.ts](src/artifacts.ts): the Artifacts binding with lane B's `changedPaths`, `treeDiff`, `previewPlan` and `Pinning`. |
| `PublisherPort` | Publishes the log to `refs/artroom/log` (R-LOG-8) | Lane L's `LogPublisher`, opened over a git remote. In a Worker that remote is [src/logremote.ts](src/logremote.ts) over lane B's `LogRemoteStub`: the ref is read by the sandbox's `readLogRef` (the binding's `log({ ref })` returns nothing for `refs/artroom/log`), and an unreadable ref is an error, never an absent one; objects are read through the binding, trying each kind in turn (the binding throws for a commit or tree read of another type), re-encoded and accepted only if they hash to the SHA asked for; pushes go through the sandbox's `pushLog`. Each sandbox call carries a token of at most 60 seconds, revoked afterwards. |

A deployment gives the Room its remotes ([src/config.ts](src/config.ts)):
the Artifacts binding for one namespace (`ARTIFACTS`, `ARTIFACTS_NAMESPACE`),
and lane B's publisher sandbox (`PUBLISHER`, one Durable Object per room).
The Room builds the adapters over them. A room's repository identity is
`<namespace>/<name>`; an identity in a namespace the deployment has no
binding for has no repository here, and founding it is `unavailable`.

Tests give fake remotes instead ([src/memory/artifacts.ts](src/memory/artifacts.ts)):
an Artifacts namespace and a publisher sandbox over real git objects (lane
L's object format), with transport faults, Artifacts error codes, lost
answers, a push held in flight, and another writer. The adapters that run
over them are the real ones.

The Room's side of log publication is durable. Before any remote write it
stores the cohort: the entries through N, the signed checkpoint, the
retained files, the parent (the last commit it confirmed), and the exact
commit the publisher's serialization makes of them (`commitFor`). The
stored cohort has a version. A cohort stored by the previous revision
has no exact commit: before any further write, the Room derives it with
`commitFor` from the cohort's recorded parent, entries, checkpoint and
retained bytes, and stores the upgraded cohort. Every
attempt, even after a restart, publishes that same cohort. The publisher
reads the ref back after an unclear answer and completes forward. The Room
seals the `checkpoint` event and moves `publishedThrough` only when the
publisher confirms that exact commit. When the publisher reopens, the ref
must hold the parent or that exact commit. Anything else is another
writer, even a commit with the same entry lines, and publication stops and
tells the admins.

A deployment without an `ARTIFACTS` binding cannot found a room: founding
reads or creates the repository, and fails with `unavailable`, recording
nothing. Without the publisher sandbox, `propose`, `land`, previews and log
publication fail with `unavailable` in the same way.

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
      repository and this admin key;
   5. binds repository, room ID and name in the registry, in one atomic
      step (R-GEN-13). For an import, the registry also judges the grant's
      `notAfter` there, with its own clock: a first binding at or after it
      is refused. The same binding again succeeds after it, so a retry
      completes;
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

[wrangler.jsonc](wrangler.jsonc) is deployable: the `Room` and `Registry`
Durable Objects, lane B's publisher sandbox (`Publisher`, a container
Durable Object, and its `ArtifactsGateway`, exported from
[src/index.ts](src/index.ts)), and the Artifacts binding. `wrangler deploy
--dry-run` bundles it with these bindings. The workerd test pool reads
[wrangler.test.jsonc](wrangler.test.jsonc) instead, which has neither the
remote binding nor the container; a Node test checks both files.

Before the first deploy (the file's header says the same):

- the Artifacts namespace (`artroom-public`) must exist on the account,
  and `ARTIFACTS_HOST` must be that account's Artifacts host;
- the container image is lane B's (`packages/git/container/image.sh`);
  use the digest it prints for the account's registry;
- `wrangler secret put ROOM_KEY_SECRET`;
- `OPERATOR_KEYS` lists the operator keys that sign onboarding grants.

| Setting | Meaning |
|---|---|
| `LEASE_SECONDS` | Lease length, default 1800 |
| `PUBLIC_URL` | Base URL, used for the MCP endpoint in `Redeemed` |
| `ROOM_KEY_SECRET` (secret) | Derives each new room's signing key and, for public founding, its repository identity |
| `OPERATOR_KEYS` | Operator key IDs, comma-separated, whose onboarding grants are accepted (R-GEN-12) |
| `PUBLIC_NAMESPACE` | The repository namespace reserved for public founding, default `artroom-public` |
| `ARTIFACTS` (binding) | The Artifacts binding for the deployment's namespace |
| `ARTIFACTS_NAMESPACE` | The namespace that binding reaches, default `PUBLIC_NAMESPACE` |
| `PUBLISHER` (binding) | Lane B's `Publisher` Durable Object class (the git sandbox), one instance per room |
| `ARTIFACTS_HOST` | The Artifacts host the sandbox's gateway lets the container reach, under `ARTIFACTS_NAMESPACE` |

## Running the tests

From the repository root, after `npm install`:

```sh
npm run typecheck
cd packages/room
npm run test:node      # pure parts, in Node
npm run test:workerd   # the Room in workerd, with real Durable Object SQLite
```

The workerd suite runs the Room with the real policy runtime (lane C), lane
B's landing engine, workspaces, pinning and diffs, and lane L's log
publisher, all on the Room's SQLite, over fake remotes. Alarms are scheduled
as usual, but in tests they run only when a test asks (`tick` or
`runDurableObjectAlarm`). The type check uses declarations generated from
lane L's sources (`.types/log`), as the UI does for the policy runtime,
because lane L's sources assume a lib whose `TextDecoder` options differ
from the Workers runtime types.

## Acceptance cases and their evidence

Four kinds of evidence, from weakest to strongest:

- **Unit.** Node tests of the pure parts (`test/node`): canonical bytes,
  keys and signatures, globs, secret scanning, shapes and identifiers. They
  support a row but prove none alone; the column names the Node file that
  covers a piece of the case.
- **Real SQLite.** The Room Durable Object in workerd with its real SQLite
  storage and the real policy runtime (`test/workerd`). Each case has a
  test whose name starts with "section 23", the finding number, or the rule.
- **Real B and L.** The same test, with lane B's landing engine, workspaces,
  pinning and tree diff, and lane L's log publisher, on the Room's shared
  SQLite, over fake Artifacts and sandbox remotes (phase 2b). Since phase
  2b every workerd test runs these adapters, so this column says "yes"
  wherever the case uses landing, workspaces, Artifacts or the log, and
  "n/a" where it uses none of them.
- **Deployed.** On Cloudflare with Artifacts. **Pending** for every case,
  under its own task.

### Section 23

| Case | Unit | Real SQLite (test file) | Real B and L | Deployed |
|---|---|---|---|---|
| Approval with `dependsOn`, helper changes | glob | yes: obligations | yes | pending |
| No `dependsOn`, room default lists `src/lib/**` | glob | yes: obligations | yes | pending |
| No declaration and no default | glob | yes: obligations | yes | pending |
| `package-lock.json` changes | glob | yes: obligations | yes | pending |
| `.artroom/policy.json` changes | glob | yes: obligations | yes | pending |
| Release, new generation, policy activation during preparation | — | yes: landing | yes | pending |
| Paused push; release, new generation, objection, `retired` revocation | — | yes: landing | yes | pending |
| Paused push; `compromised` revocation of evidence | — | yes: landing, phase2b | yes | pending |
| Pre-signed act after its key's revocation | crypto | yes: roster | n/a | pending |
| Act under an expired delegation | — | yes: roster | n/a | pending |
| Byte-identical replay after revocation | canonical | yes: roster | n/a | pending |
| Compromised reviewer's approval | — | yes: obligations | yes | pending |
| Reviewer retired after their review | — | yes: obligations, phase2b | yes | pending |
| Sole admin changes policy | — | yes: landing | yes | pending |
| Locked-out admin restored | — | yes: roster | n/a | pending |
| Policy lockout | — | yes: landing | yes | pending |
| Same lockout, two admins | — | yes: landing | yes | pending |
| B watches A's workspace | — | yes: lanes | yes | pending |
| A requests the token: old lease, revoked key, removed, expired delegation | — | yes: lanes | yes | pending |
| A token appears in no output | secrets | yes: lanes | yes | pending |
| Scoped checker, new test (check carry) | glob | yes: phase2b | yes | pending |
| Browser join | — | yes: roster | n/a | pending |
| MCP redemption | — | yes: roster | n/a | pending |
| Room-custody invitation, self-signed join on `/acts` | — | yes: roster | n/a | pending |
| Room-custody invitation, self-signed join over RPC | — | yes: roster | n/a | pending |
| Room-custody invitation, client redemption | — | yes: roster | n/a | pending |
| Client-custody invitation, room redemption | — | yes: roster | n/a | pending |
| Unjoined Worker | — | yes: roster | n/a | pending |
| Recovery key | — | yes: roster | n/a | pending |
| Log construction | canonical, crypto | yes: log (lane L's `verifyLog`), phase2b | yes | pending |
| A `notify` rule hits a runtime failure | — | yes: log | yes | pending |
| Stage-specific land rule | — | yes: landing | yes | pending |

These section 23 cases are lane B's or lane C/G's, and are proved in those
packages: crash before or after push, two operations preparing in
parallel, the delayed authenticated push, the failing forward retry, token
revocation during a push and the lease race on publication (lane B's
publisher), and a file missing from a scoped checker's inputs (the runner,
lanes C and G). The Room side of several now has a test through lane B's
engine: phase2b's "the instance stops while the push is in flight", "a push
that applied but whose report was lost" and "pushes with no answer".

### Phase 2b cases (P1.9)

| Case | Real SQLite and real B and L (test in phase2b unless named) | Deployed |
|---|---|---|
| Reservation re-validates authority | landing: "R-LAND-7: reservation re-judges the initiator's authority" | pending |
| Reservation re-validates evidence | "a reviewer's key retired between ready and reservation" | pending |
| Reservation compares the retained land input | landing: "Stage-specific land rule and Byte mismatch" | pending |
| Unknown-outcome publication recovery | "a push that applied but whose report was lost"; "the instance stops while the push is in flight"; "pushes with no answer" | pending |
| Abort beside a push in flight | landing: "compromised revocation of evidence"; "an abort whose at-once run was lost" | pending |
| Delayed token cleanup and alarm scheduling | "Artifacts cannot revoke at release" | pending |
| Workspace lease races | "a renewal while the workspace is pending"; "a take-over while the lease token is being minted"; review-aabda1ed P2.6; review-8faa2ef9 2 | pending |
| Policy activation and recompute | "an activation adding a check requirement re-prepares"; amendment2 "Recompute after activation" | pending |
| Scoped check carry | "a scoped check carries"; "does not carry when main changed a global input"; "a whole-tree check does not carry"; "with a policy carry rule in force" | pending |
| Filtered checker inputs | "a filtered input binds only the room's snapshot" | pending |
| Offline replay with lane L's `verifyLog` | "a session … publishes a log that verifies, with every decision replayed"; log "Log construction" | pending |
| Repository identity mapping | "a repository identity in a namespace this deployment has no Artifacts binding for"; founding "Isolated public creation" | pending |
| Fork provenance | "a repository at the lane's fork name that is not a fork" | pending |
| Production log remote (lane B's `readLogRef` and `pushLog`) | "the production log remote, as the live services behave"; "a log ref that cannot be read is an error, never an absent ref"; "an object the binding decodes differently"; every publication test, which runs the production remote over the fakes | pending |
| Previews from lane B's planner | "a fast-forward previews the head itself"; "disjoint paths after main moved: the sandbox's merge commit, which the landing … lands exactly"; "after main moved under them: a clean merge … a conflict" | pending |
| Deployable configuration | Node deploy.test: "binds Artifacts for ARTIFACTS_NAMESPACE, and the publisher sandbox as a container Durable Object"; "the test pool's config has no remote or container binding" | pending |

### Amendment 2 cases (section 23)

| Case | Unit | Real SQLite (test file) | Real B and L | Deployed |
|---|---|---|---|---|
| Isolated public creation | — | yes: founding | yes (repository creation) | pending |
| Unauthorized existing repository | — | yes: founding | n/a | pending |
| Repository altered after draft | — | yes: founding | n/a | pending |
| Authorized import | — | yes: founding | yes | pending |
| Simultaneous founding | — | yes: founding | n/a | pending |
| Duplicate import | — | yes: founding | n/a | pending |
| Canonical-name aliases | ids | yes: founding | yes (identity mapping) | pending |
| Recovery after binding | — | yes: founding | yes | pending |
| Profile, room key or name refused; bound name | ids | yes: founding | n/a | pending |
| Name to ID | — | yes: founding | n/a | pending |
| WebSocket | — | yes: log | n/a | pending |
| RPC subscription | — | yes: amendment2 | n/a | pending |
| Recompute after activation | — | yes: amendment2, phase2b | yes | pending |
| Land rules in preparation | — | yes: amendment2 | yes | pending |
| Byte mismatch | — | yes: landing | yes | pending |
| Notify across an activation | — | yes: amendment2 | yes (lane L's verify replays it) | pending |
| Bearer receipt after revocation | — | yes: amendment2 | n/a | pending |

The MCP case of amendment 2 (`explain`, `attention`, `because`) belongs to
lane E.

### Review aabda1ed findings

| Case | Room in workerd, real SQLite (test file) | Real B and L integration | Deployed |
|---|---|---|---|
| P1.1 Atomic room-custody redemption | yes: review-aabda1ed | n/a | pending |
| P1.2 Revoked key as recovery key | yes: review-aabda1ed | n/a | pending |
| P1.3 Authority expiring during policy evaluation | yes: review-aabda1ed | n/a | pending |
| P1.4 Recomputation under a changed requirement | yes: review-aabda1ed | yes | pending |
| P1.5 Lost push or read-back, restart, foreign writer | yes: review-aabda1ed | yes | pending |
| P2.6 Durable pending workspaces | yes: review-aabda1ed (now lane B's workspaces) | yes | pending |
| P2.7 Sealed effects from the calculator | yes: review-aabda1ed | yes | pending |
| P2.8 Cursors at a page boundary | yes: review-aabda1ed | n/a | pending |

### Review 8faa2ef9 findings

| Case | Room in workerd, real SQLite (test file) | Real B and L integration | Deployed |
|---|---|---|---|
| 1. Recovery accepts only the parent or the exact pending commit | yes: review-8faa2ef9 | yes (lane L's `commitFor`) | pending |
| 2. Lease deadline during fork creation | yes: review-8faa2ef9 | yes | pending |
| 3. Attention made later at an existing head | yes: review-8faa2ef9 | n/a | pending |
| 4. Review reopening in sealed effects | yes: review-8faa2ef9 | n/a | pending |
| 5. Upgrade of populated storage | yes: review-8faa2ef9 | n/a | pending |
| `"*"` fixed at the grant | yes: review-8faa2ef9 | n/a | pending |

### Review 1249097f findings

| Case | Room in workerd, real SQLite (test file) | Real B and L integration | Deployed |
|---|---|---|---|
| 1. Upgrade of a stored cohort without its exact commit | yes: review-1249097f | yes (lane L's `commitFor`) | pending |
| 2. Grant deadline at the first binding | yes: review-1249097f | n/a | pending |

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

## Review 1249097f

The checker's review of `909a3e3f` confirmed the five 8faa2ef9 findings and
the 13 amendment 2 edits, and found two more. Its reproductions now assert
the correct outcomes in
[test/workerd/review-1249097f.test.ts](test/workerd/review-1249097f.test.ts).

| Finding | Fix | Tests (in that file) |
|---|---|---|
| 1. P2 A cohort stored by the previous revision wedged publication | Stored cohorts carry `v: 2`. `publish` upgrades a cohort without a version before the fence and before any write: it derives the exact commit with the publisher's `commitFor` from the recorded parent, entries, checkpoint and retained bytes, and stores it. It infers nothing from the ref and never discards the cohort. A cohort that does not match the log, or has an unknown version, stops publication | before the push…; after an applied push whose answer was lost…; the derived commit is stored before any further write, and survives repeated reopening; a foreign commit with the same entry lines…; a stored cohort that does not match the log…; a cohort of an unknown version… |
| 2. P2 A grant that expired during `found`'s awaits still authorized a first binding | `found` carries the grant's deadline into the registry's `bind`, which judges it with its own clock in the same step as the first binding. `found` reads no clock and no longer looks the binding up first: any time it read could be stale by the binding. The same binding again still succeeds after the deadline | a grant that expires during signature verification…; a grant that expired between draft and found…; a grant that expires while the bind is on its way…; at notAfter exactly…; after the binding, a retry … completes forward…; the registry refuses a first binding at or after its deadline… |

Lane L's `commitFor` includes the stored files of its last written commit
when that commit is the parent. The Room always passes every retained file
it holds, so the result is the same either way.

Each new guard was broken once and the whole workerd suite run against the
change: all 10 mutations were caught. The first version of fix 2 also
judged the deadline in `found`; those checks could not be told apart from
the registry's in any test, so they were removed and the registry is the
one boundary.

## Phase 2b

The checker's P1.9 asked for the real adapters and joint tests. What
changed:

- **The adapters are real** (see "Ports"). The in-memory landing engine,
  log publisher and Artifacts are gone, and so is the Room's own partial
  verifier: lane L's `verifyLog` replaces it in the tests.
- **Readiness awaits.** Lane B's `readiness` may await, so the Room reads
  the integration's configuration and evaluates land rules inside it; the
  decision is sealed as `land-evaluated`, and the engine keeps the
  retained input. Evaluations the Room asks for after a check or a
  recomputation are durable (`land_reeval`), run by the alarm's landing
  step.
- **Abort attempts run at once.** After a `compromised` revocation the Room
  starts lane B's `enforceAbort` beside a push in flight, and the alarm
  runs it again before the engine's queue.
- **Workspaces are lane B's.** Operation IDs are lane B's
  (`op_ws_<lane>_<lease generation>`). A workspace whose lease has ended is
  not shown. A workspace opened by the previous revision is recorded as
  ended (migration 6); lane B's first inventory of the fork revokes its
  tokens when the holder opens it again.
- **Filtered checker inputs** (R-OBL-3, R-CARRY-8, R-CARRY-9). A filtered
  `check` binds only the Room's own snapshot of the integration over the
  checker's declared inputs plus the global inputs.
- **Check carry** (R-CARRY-6 to 10). When lane B prepares a new
  integration, an earlier passing check of the same obligation carries onto
  it if lane C's platform conditions hold: the tree or the filtered
  snapshot is identical, the configuration is the same, the checker is not
  volatile, the key is not revoked, and the runner environment attested now
  is the earlier check's. A carry counts only on the integration and under
  the policy version that judged it. No deployment attests a runner yet, so
  in production checks do not carry (see "Review a711f7b6").
- **The alarm** is set from the earliest of the Room's own work, lane B's
  `landing.nextDue()` and `workspaces.nextDue()`, so it follows lane B's
  capped backoff and never spins.

Lane B's follow-up (request 090a0eca) answered what the Room needed:
`pushLog` and `readLogRef` on the sandbox (`LogRemoteStub`), and previews
that carry their integration: the head for a fast-forward, otherwise the
merge commit the same planner builds for the landing, so a landing on the
same main lands exactly the previewed commit. The fakes mirror lane B's
live findings: the binding's `log({ ref })` returns nothing for
`refs/artroom/log`, and `readCommit` and `readTree` throw for an object of
another type.

Each new guard was broken once and the whole workerd suite run against the
change: all 19 mutations were caught, four after a test was strengthened
(an abort carried out by the alarm; the renewed deadline reaching the
token; a snapshot that leaves out the global inputs; a carry counting only
on its own integration).

## Review a711f7b6

The checker's review of revision 5 (`45c7946f`) requested changes. The fixes
are on top of `80d2351`, which adopted lane B's follow-up. Its
reproductions now fail; the correct outcomes are asserted in
[test/workerd/review-a711f7b6.test.ts](test/workerd/review-a711f7b6.test.ts).

| Finding | Fix | Tests (in that file) |
|---|---|---|
| 1. P1 A stored check carry survived a policy that turns carrying off | Each carry is stored with the policy version that judged it and counts only under that version and on its integration (migration 7). An activation leaves earlier carries uncounted; readiness judges again under the new policy, which carries nothing when `carry.checks` is false or a carry rule applies to checks. Reservation requires every obligation met on the integration. | "an activation with checks: false …"; "an activation with a carry rule that refuses checks …"; "reservation itself refuses a ready landing whose carried check stopped counting"; "reservation requires every obligation met on the integration …"; "the earlier check's key compromised after the carry …"; "the checker configuration changed …"; phase2b "does not carry when main changed a global input" |
| 2. P2 Migration dropped outstanding workspace cleanup | Migration 7 keeps access opened before lane B's workspaces as `legacy`: its recorded token IDs, and an inventory for provisioning whose answer was never recorded. When the lease ends (release, expiry, take-over, with or without reopening) these become lane B's durable cleanup duties, in the transaction that marks it ended; they stay owed until Artifacts confirms them. | "release without reopening …"; "a mint whose answer was never recorded …"; "a recorded token is owed by its ID …"; "expiry without reopening …"; "take-over without reopening …, and with Artifacts down the cleanup stays owed …" |
| 3. P2 An older room had no canonical remote for the landing publisher | Before any landing work, the Room resolves the remote from its bound repository identity through the binding (refusing an answer for any other repository) and stores it. An outage throws and the alarm retries; the publisher never gets a guessed remote. | "the landing completes, with the bound repository's own remote stored"; "a binding that answers for another repository …"; "Artifacts is down: nothing is guessed …" |
| 4a. Lane B's follow-up | Kept as adopted in `80d2351`. | phase2b, as listed under "Phase 2b cases" |
| 4b. Runner digest | Check carry needs a runner environment attested now for the checker (`RoomServices.runnerDigest`); none is attested in production, so nothing carries there (fail closed). | "no runner environment attested …"; "another runner environment attested …"; "the same runner attested …" |
| 4c. Carry rule decisions | No event can seal a `carry` rule's decision on a check (amendment 2). The Room fails closed: when a carry rule applies to checks (`evidence: "check"` or `"any"`), checks do not carry. A rule for reviews only does not stop them. | "a carry rule for reviews only does not stop a check carrying; one for checks does …" |
| 4d. Scoped job flow | When a check obligation waits on an integration for a scoped checker, the Room records the snapshot commit it derives from that integration (the filtered files, no parents, a fixed identity and message; [src/snapshot.ts](src/snapshot.ts)), with its paths and digest. A scoped check whose `integration` is that recorded commit is admitted with exactly that digest and paths, and counts for the integration it was built from. Tested with a contract-shaped fixture: a `CheckJob` as the contract types it and the body lane G's `Checker` builds from it; lane G's service code is not run (its branch is under repair and not a dependency). | "contract-shaped CheckJob fixture …"; "a snapshot commit with another digest, another checker's commit, or an unrecorded commit is check-binding" |
| 4e. Volatile flag | A check whose signed `volatile` differs from its configuration's is `check-binding`, either way. | "a check whose volatile flag contradicts the configuration (volatile: false) …"; "… (volatile: true) …" |

The checker's scoped-job reproduction built its snapshot commit with
another identity and time, so the Room still refuses that commit: only
the commit the Room recorded is admitted. A publisher must write exactly
that commit (contract change 3 below).

Each new guard was broken once and the whole workerd suite run against the
change: 14 of 17 mutations were caught, four after a test was added. Three
are equivalent: requiring an attested runner before lane C's runner
comparison (lane C already refuses a missing one); the early return when
`carry.checks` is false (lane C refuses it, and stored carries are bound to
their policy); and the publisher's missing-remote guard (the remote is
always resolved before landing work).

### Contract changes needed (candidates for amendment 3)

1. **A sealed check-carry decision.** A system event, for example
   `check-carried { op, lane, generation, integration, obligation, act,
   carried | notCarried, decisions }`, sealed when the Room judges a check
   carry at readiness, so `carry` rules can apply to checks and their
   decisions be replayed. Until then checks do not carry while a carry rule
   applies to them.
2. **An attested runner environment.** A way for the Room to know, before
   a check runs, the runner environment digest it would run in: pinned in
   `CheckerConfig`, or attested by the checker service. Until then no check
   carries in production.
3. **The snapshot commit format, and who issues jobs.** The filtered
   snapshot commit a scoped job names: a tree of exactly the filtered files
   at their modes and blobs, no parents, author and committer
   `Artroom Snapshot <snapshot@artroom.invalid> 0 +0000`, and the message
   `Artroom filtered snapshot for <checker>\n\nDigest: <digest>\n`. The Room
   derives and records it; the publisher's `writeSnapshot` (in lane G's copy
   of lane B's package, not in the landed one) must write exactly it; and
   the contract should say that `CheckJob.integration` for a filtered input
   is this commit, and which lane issues jobs.

## Log publication bound

Lane B's follow-up revision 2 bounds one push to `refs/artroom/log` (lane
L's `LOG_TRANSFER_LIMITS`; lane L sends only the objects the lease lacks).
When lane L refuses a cohort with `cohort-too-large`, nothing was sent. The
Room then stores a smaller cohort, half the unpublished entries and at
least one, with the retained files those entries name, a checkpoint for its
last entry, and its exact commit (`commitFor`), before any remote write,
and publishes it. A restart resumes the stored smaller cohort. One entry
that is still too large is never skipped: publication stops with
`publication_error` set to `cohort-too-large` and one attention item for
the admins, and the alarm keeps retrying the same entry.
[test/workerd/log-transfer.test.ts](test/workerd/log-transfer.test.ts):
"is shrunk and published; the published log verifies …", "the smaller
cohort is stored with its exact commit before any remote write, and a
restart resumes it …", "one entry still too large is a surfaced
publication error …".

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
is `land-input-changed`. These remain open:

1. **Unknown note anchors.** A note anchored to an entry that does not
   exist is refused, recorded, with `lane-unknown`; the contract has no
   closer rule (open point 36).
2. **Check carry decisions, runner environments, snapshot commits.** See
   "Contract changes needed" under "Review a711f7b6".

## Not done

- Deployment itself, an operator command to sign onboarding grants, and
  measurements on Cloudflare. The "Deployed" column is pending for every
  case, under its own task.
- The MCP endpoint's `RoomApi` over `bearerAct` and `bearerRequest` (lane
  E), and the client package's `connect`, `join` and `redeem`.
- Attention is a simple projection: review and check requests, objections,
  notes, landing outcomes, lanes left unheld, revert lanes and notify items.
