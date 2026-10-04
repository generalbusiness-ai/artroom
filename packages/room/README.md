# @generalbusiness/artroom-room

> **Test file names below may be out of date.** Each section names the tests as they were when it was written. Request `ecbc722a` later merged and removed many test files; [plans/test-invariants.md](../../plans/test-invariants.md) is the current map from each invariant to its test.

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
An idle room has no alarm, and failing work backs off to a 5-minute cap
(see "Request 3da1d82b: idle write storms").

Sealing is synchronous. SHA-256 and Ed25519 signing use `@noble`, so the
room can hash and sign inside the transaction. Verifying a caller's
signature uses WebCrypto, before admission starts.

## Ports

The Room's code talks to other lanes through small interfaces in
[src/ports.ts](src/ports.ts). Every one is wired to the real package.

| Port | What it does | Adapter |
|---|---|---|
| `PolicyPort` | Evaluates `refuse`, `require`, `carry`, `land` and `notify` rules | [src/policy.ts](src/policy.ts) calls lane C's `@generalbusiness/artroom-policy`. It passes the lane purpose, the recovery-key flag, carry facts and the notify directory, so each is in the replay context. One act shares one meter. |
| `LandingPort` and `LandingHost` | The landing operation, and the Room's side of it | Lane B's `Landing` and `LandingRoom`, on the Room's SQLite, with lane B's `ContainerPublisher` and `publicationTokens` over the Room's canonical mint ledger (`RoomCore.mints`, protocol section 32; its alarm step is `mints`). Since mint lane C every other canonical token also goes through that ledger: pinning and previews (`ArtifactsAdapter`), the log remote's reads and pushes (`Remotes.logRemote` receives the ledger), snapshot preparation's canonical read, and check jobs. The lane fork's read token for pinning goes through the fork's own ledger, which lane B's `Workspaces` owns (`workspaces.forkTokens`, request 02836f9a; its alarm step and loop kind are `forkTokens`). `readiness` may await; `revalidate` compares the rebuilt reservation input with the bytes the engine retained. |
| Workspaces | One fork per lane, one token per lease generation | Lane B's `Workspaces`, on the Room's SQLite. The Room records which leases it opened (`ws_leases`), carries renewals to the workspace's deadline, and ends a lease's access when it ends. |
| `ArtifactsPort` | Repository creation at founding, config reads, heads, pinned refs, diffs, previews, filtered snapshots | [src/artifacts.ts](src/artifacts.ts): the Artifacts binding with lane B's `changedPaths`, `treeDiff`, `previewPlan` and `Pinning`. |
| Checker services | Every check job, over the checker's service binding (R-EXEC-8) | `RoomServices.checkers`: in a deployment, the binding `CHECKER_<NAME>` ([src/config.ts](src/config.ts)); the job flow is [src/jobs.ts](src/jobs.ts). |
| `SnapshotPort` | One repository per snapshot commit, and its job tokens (R-CARRY-16) | Lane B's `SnapshotRepos`, on the Room's SQLite, written by the publisher sandbox's `writeSnapshot` (`Remotes.writeSnapshot`). Tests may give another (`RoomServices.snapshots`). |
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

`/v1/rooms/:room/mcp` is the MCP endpoint (R-CRED-10, MCP plan stage 0,
request 8ae3b2dc). The Worker sends it to lane E's MCP handler
(`@generalbusiness/artroom-mcp/worker`) before the router. Its `RoomApi`
for each bearer token ([src/mcp.ts](src/mcp.ts)) is lane E's client
connected as a bearer session to the Worker's own `RoomWire`: acts go to
`bearerAct`, workspace requests to `bearerRequest`, and reads and
`subscribe` carry the token. A missing, unknown, expired or revoked token
is 401 with `WWW-Authenticate` before any tool runs; an unknown room is a
404 `ArtroomError`. Tests: `test/workerd/mcp.test.ts`. The deployed run is
in [notes/mcp-stage0.md](../../notes/mcp-stage0.md).

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

Each schema is at version 1, its base. The Room's earlier versions 2 to 8,
the registry's version 2, and the upgrade paths that only the spike
deployment's state needed were folded into the base when that state was
wiped (decision D5, request 73eccbec; see
[notes/deploy-spike.md](../../notes/deploy-spike.md)). The next change to a
schema is version 2.

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
      repository and this admin key, in the deployment's import namespace.
      A source whose namespace the deployment has no binding for is
      refused here, and at `draft`, with `forbidden`;
   5. binds repository, room ID and name in the registry, in one atomic
      step (R-GEN-13). For an import, the registry also judges the grant's
      `notAfter` there, with its own clock: a first binding at or after it
      is refused. The same binding again succeeds after it, so a retry
      completes;
   6. only then has the room create or read the repository and seal
      entries 0 and 1. The room itself refuses to do this unless the
      registry binds it. A new repository gets one commit on `main`, with
      no files, and no live token, before the genesis is sealed (see
      "Founding gaps").

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
- `OPERATOR_KEYS` lists the operator keys that sign onboarding grants;
- `PUBLIC_URL` has no default: `wrangler deploy --var PUBLIC_URL:https://<host>`.

| Setting | Meaning |
|---|---|
| `LEASE_SECONDS` | Lease length, default 1800 |
| `PUBLIC_URL` | Required, no default: this deployment's `https://` origin, with nothing after the host. Redemption names `<PUBLIC_URL>/v1/rooms/<room>/mcp` in `Redeemed`, and a bearer token goes there. Without a valid one, the Worker and every Room object refuse to start |
| `ROOM_KEY_SECRET` (secret) | Derives each new room's signing key and, for public founding, its repository identity |
| `OPERATOR_KEYS` | Operator key IDs, comma-separated, whose onboarding grants are accepted (R-GEN-12) |
| `PUBLIC_NAMESPACE` | The repository namespace reserved for public founding, default `artroom-public` |
| `ARTIFACTS` (binding) | The Artifacts binding for the public founding namespace |
| `ARTIFACTS_NAMESPACE` | The namespace that binding reaches, default `PUBLIC_NAMESPACE`. If it is not `PUBLIC_NAMESPACE`, public founding is refused |
| `IMPORT_ARTIFACTS` (binding) | Optional: the Artifacts binding for imported repositories. Without it (and `IMPORT_NAMESPACE`), imports are refused at `draft` |
| `IMPORT_NAMESPACE` | The namespace `IMPORT_ARTIFACTS` reaches; the only one a grant may name. It must differ from `PUBLIC_NAMESPACE` (R-GEN-12) |
| `PUBLISHER` (binding) | Lane B's `Publisher` Durable Object class (the git sandbox), one instance per room |
| `ARTIFACTS_HOST` | The Artifacts host the sandbox's gateway lets the container reach, under `ARTIFACTS_NAMESPACE` and `IMPORT_NAMESPACE` |
| `CHECKER_<NAME>` (binding) | A checker's service, by its name in capitals with `-` as `_` (`llm-review` is `CHECKER_LLM_REVIEW`). The Room sends that checker's jobs to its `handle(job)` (R-EXEC-8). [wrangler.jsonc](wrangler.jsonc) binds none yet; with none, a check obligation waits for a check signed some other way |

A spike deployment, `artroom-spike-room` on the `gitseq-spike` namespace, is
configured in [wrangler.spike.jsonc](wrangler.spike.jsonc) and deployed with
`scripts/deploy-spike.sh`. Its live smoke run is `measure/spike-smoke.mjs`.
See [notes/deploy-spike.md](../../notes/deploy-spike.md).

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

A workerd test file costs about a second to load the Room before its first
test runs. So some test files are only a list of case files
(`test/workerd/*.cases.ts`) that share one worker:
`jobs-and-snapshots`, `obligations-and-carry`, `roster-and-redemption`,
`publication-and-workspaces` and `alarms-and-diagnoses`. A case file is
written like any test file, and each test still makes its own room. The
Node tests are grouped the same way (`test/node/*.cases.ts`), in
`pure-parts`, `deploy-and-source-rules` and `measure-scripts`. The
sections below were written when each review landed. They name the tests as
they were then; request ecbc722a later removed tests that another test
already decided, and its report maps each invariant to its witness.

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
| 5. Upgrade of populated storage | retired with the migrations (decision D5); "a store without admission facts …" remains | n/a | n/a |
| `"*"` fixed at the grant | yes: review-8faa2ef9 | n/a | pending |

### Review 1249097f findings

| Case | Room in workerd, real SQLite (test file) | Real B and L integration | Deployed |
|---|---|---|---|
| 1. Upgrade of a stored cohort without its exact commit | yes: review-1249097f | yes (lane L's `commitFor`) | pending |
| 2. Grant deadline at the first binding | yes: review-1249097f | n/a | pending |

### Review 95323c2b findings

| Case | Room in workerd, real SQLite (test file) | Real B and L integration | Deployed |
|---|---|---|---|
| P2. Two integrations with one snapshot commit: each check binds its own landing's integration; a wrong `landOp` is refused | yes: review-95323c2b | yes (lane B's landing engine) | pending |

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
[test/workerd/review-aabda1ed.cases.ts](test/workerd/review-aabda1ed.cases.ts).

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
[test/workerd/review-8faa2ef9.cases.ts](test/workerd/review-8faa2ef9.cases.ts).

| Finding | Fix | Tests (in that file) |
|---|---|---|
| 1. P1 Recovery accepted any commit with the same entry lines | Before any remote write the pending cohort records its parent and the exact commit (`PublisherPort.commitFor`, the publisher's one serialization). The reopen fence accepts only those two; the confirmed commit must be the exact one | a foreign commit with identical entry lines but a different checkpoint / retained / parent…; a publisher whose confirmed commit is not the expected one…; the exact pending commit is stored before any remote write, and lost-response recovery still confirms it, across a restart |
| 2. P2 A workspace became ready after its lease ran out | The lease is current only if held, the same lease generation, and before its deadline by the clock read now; checked before fork creation and again before readiness. A fenced op runs the lease-expiry and token-revocation steps at once | a lease that runs out during fork creation…; a lease already past its deadline before the resume creates no fork |
| 3. P2 Attention made later fell behind live cursors | A monotonic attention position; live, update and page cursors carry it; a publication error wakes subscriptions; earlier cursor forms map to the position before the first item after their point | the admins' publication-unresolved item arrives on a cursor issued before it…; pages stay lossless…; an RPC subscription opened at the live head…; cursors in the earlier (seq, n) form still read… |
| 4. P2 Sealed effects omitted a reopening | Review and check effects carry `opened` and `met` from the one calculator; a duplicate approval still seals none. A check only adds evidence, so it cannot reopen | Bob approves, then objects…; @ci passes, then fails on the same input… |
| 5. P2 Old storage could not reopen | Versioned, transactional, idempotent migrations for the Room and the registry; a missing admission fact reads as "author". The upgrade steps, and their test of populated old stores, were retired when the spike's state was wiped (decision D5); the migration runner and the "author" fallback remain | a store without admission facts is judged as an author… |
| `"*"` delegation followed the grantor's current role | `"*"` is expanded at the grant to the kinds the grantor's role could sign then (the migration that expanded earlier grants was retired by decision D5) | a member grants '*', then is promoted to admin… |

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
[test/workerd/review-1249097f.cases.ts](test/workerd/review-1249097f.cases.ts).

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
  not shown.
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
  in production checks do not carry (see "Review a711f7b6"). Amendment 3
  replaced the attested runner with the configuration's pin, and seals
  every judgment (see "Amendment 3").
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
[test/workerd/review-a711f7b6.cases.ts](test/workerd/review-a711f7b6.cases.ts).

| Finding | Fix | Tests (in that file) |
|---|---|---|
| 1. P1 A stored check carry survived a policy that turns carrying off | Each carry is stored with the policy version that judged it and counts only under that version and on its integration. An activation leaves earlier carries uncounted; readiness judges again under the new policy, which carries nothing when `carry.checks` is false or a carry rule applies to checks. Reservation requires every obligation met on the integration. | "an activation with checks: false …"; "an activation with a carry rule that refuses checks …"; "reservation itself refuses a ready landing whose carried check stopped counting"; "reservation requires every obligation met on the integration …"; "the earlier check's key compromised after the carry …"; "the checker configuration changed …"; phase2b "does not carry when main changed a global input" |
| 2. P2 Migration dropped outstanding workspace cleanup | Migration 7 kept access opened before lane B's workspaces as `legacy` until its lease ended. Retired, with its tests, when the spike's state was wiped (decision D5). | — |
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

## Log publication: staged (lane B follow-up revision 3)

This revision merges `request/laneB-pushlog` at `f953c04c`. One push to
`refs/artroom/log` is bounded (lane L's `LOG_TRANSFER_LIMITS`, now 8 MiB
of decoded bytes, the same as lane B's `LOG_PUSH_LIMITS`). A publication
larger than that is no longer refused. Lane L stages its objects first, in
parts of at most one transfer, splitting an object that is larger than one
transfer, and then pushes the commit with no objects.

What changed in this package:

- **The log remote stages.** [src/logremote.ts](src/logremote.ts)
  implements lane L's `GitRemote.stage`. It forwards to the sandbox's
  `stageLog({ canonical: { remote }, cohort, want, parts })`, with each
  part's data as unpadded base64url, and returns the answer unchanged.
  It needs no token: the sandbox stages into its own repository, and only
  `pushLog` writes to the canonical one, under its 60-second write token.
  The port type `StagingRemote` ([src/ports.ts](src/ports.ts)) makes
  `stage` required, and [src/config.ts](src/config.ts) forwards
  `stageLog` to the publisher Durable Object.
- **The cohort-halving fallback is removed.** Lane L raises
  `cohort-too-large` only for a publication over one transfer on a remote
  that cannot stage. The Room's remote always stages, so nothing reaches
  that error, and the code that stored a smaller cohort, and the admins'
  attention item for a single entry that was still too large, are gone
  from [src/core.ts](src/core.ts). A pending cohort stored by revision 7
  is published as it is. If staging fails or stops making progress, lane L
  pushes nothing and reports `unresolved`. The Room records that as
  `publication_error` and retries the same cohort, as for any other
  publication failure.
- **The memory fake stages too.** `FakeArtifactsHost.logStub.stageLog`
  checks the request with lane B's `decodeLogStage` and passes it to lane
  L's `StagingArea`, one per repository. Completed objects wait in the
  repository's `staged` set. A push adds them to the repository with its
  ref. As git's receiving side does, it refuses a commit whose tree,
  parents or blobs are neither sent, staged nor already held, and the ref
  does not move.
- **Lane L exports `StagingArea`** and its `StageWant`, `StagePart` and
  `StageOutcome` types from `packages/log` (one additive export), so that
  the fake can use them. Nothing else in `packages/log` changed here.

Tests, in [test/workerd/log-transfer.test.ts](test/workerd/log-transfer.test.ts)
(they replace the three halving tests):

| Test | What it shows |
|---|---|
| "is staged in bounded parts and pushed with no objects; the whole cohort publishes to a verified log head" | With a 16,000-byte bound, the whole log publishes in one cohort. It is staged in more than one call, none over the bound, then pushed once with no objects. `verifyLog` passes through the head |
| "an object larger than one transfer is staged in chunks of itself, and publishes" | With a 4,000-byte bound, one object is sent in several parts, at offsets after 0, and the log verifies |
| "the sandbox's push with no objects and nothing staged finds nothing, and the ref does not move" | The fake's push refuses a commit whose objects were never sent or staged |

Mutations, each run against the workerd suite and reverted:

| Mutation | Tests that failed |
|---|---|
| The log remote has no `stage` (forwarding dropped) | the first two above (2) |
| The fake's push ignores staged objects | the first two above (2) |
| The fake's push skips the completeness check | the third (1) |

## Log publication: bounded memory (request 5a7290b9)

The Room no longer loads its log to publish it. Before, `publish` and
`commitFor` were given `entriesAfter(sql, -1, n + 1)`, every entry as an
object, and every retained file's body. With an active segment over
64 MiB, that is several times the Durable Object's 128 MB.

- **Entries** come from `logSource(sql, through)` ([src/log.ts](src/log.ts)),
  lane L's `EntrySource`. The publisher reads them in batches as it needs
  them. A full segment it has published is reused by ID and never read.
- **Retained files** are `RetainedRef`s (`retainedRefs` in
  [src/core.ts](src/core.ts)): kind and digest, and a `load` that reads
  the body only if the parent commit does not hold it.
- **The log remote** ([src/logremote.ts](src/logremote.ts)) encodes each
  part as base64url in one buffer (`partB64url`). `crypto.ts`'s `b64url`
  builds its string by concatenation; in Node an 8 MiB part held 153 MiB
  of heap that way.
- Nothing else changed: the pending cohort, its stored commit and the
  fence are as before. `PublisherPort` now takes an `EntrySource` and
  `RetainedRef`s ([src/ports.ts](src/ports.ts)).

Tests: [test/workerd/log-bounded.test.ts](test/workerd/log-bounded.test.ts)
(reads of at most `READ_LIMITS.entries`, none of a published full segment,
retained bodies only when new, and a verified log) and
[test/node/logremote.cases.ts](test/node/logremote.cases.ts). The live
matrix and memory figures are in `notes/log-bounded.md`; the harness is in
[measure/logbig/](measure/logbig/).

**A limit found live.** Artifacts refuses a push that carries a git object
larger than 32 MiB (`artifacts_git_receive_pack_object_too_large`;
[measure/logbig/object-limit.mjs](measure/logbig/object-limit.mjs)). Under
R-LOG-9 the active segment is one blob, so a segment over 32 MiB cannot be
published to Artifacts at all. The Room stages it and then retries the same
cohort with `unresolved` without end. The layout, or a rule that bounds a
segment's bytes, is a contract question, not changed here.

## Review 95323c2b

The checker's review of revision 6 (`d0b09ca2`) found one P2, and
revision 7 had the same defect. This revision merges main `fb2bd41`
(contract amendment 3) and fixes it. The checker's reproduction now fails;
the correct outcomes are asserted in
[test/workerd/review-95323c2b.cases.ts](test/workerd/review-95323c2b.cases.ts).

**The finding.** Two integrations can share one filtered snapshot commit,
because its ID depends only on the files, the checker and the digest
(R-CARRY-15). The Room records one `check_snapshots` row for each
integration, checker and configuration, so the shared commit has several
rows. Admission (`check()` in [src/admission.ts](src/admission.ts)) and
evidence counting (`underlyingIntegration()` in `src/obligations.ts`)
selected one row by `commit_sha` alone. A fresh check on the second
integration was refused `check-binding`, and a check could count for the
wrong integration.

**The fix.** A check is bound to one canonical integration when it is
admitted, and that binding is stored with the evidence (`canonical`).
Nothing looks the integration up again from the snapshot commit.

- At admission, the candidates are the integrations the Room prepared for
  the check's lane and generation: its clean preview's and its active
  landings'. If the check names `landOp`, only that landing's integration
  is a candidate. A `landOp` that is not an active landing of this
  generation is refused `check-binding`.
- A check that names a recorded snapshot commit must match a row whose
  integration is a candidate, with the same checker, configuration digest,
  snapshot digest and paths (R-CARRY-15 step 5). That row's integration
  is the canonical integration. Rows are not changed, so one snapshot
  commit stays shared by every integration that produced it.
- If more than one candidate row matched (a preview and a landing of one
  generation with different integrations but the same snapshot, and no
  `landOp`), the check is refused rather than given an arbitrary binding.
  The Room records rows only for landing integrations, so this does not
  happen in practice.
- A tree check, or a filtered check that names the integration itself,
  binds the integration it names, which must be a candidate.

Every reader of `check_snapshots` was changed or checked:

| Place | Before | Now |
|---|---|---|
| `check()` admission ([src/admission.ts](src/admission.ts)) | one row by `commit_sha` | rows by `commit_sha`, kept only if their integration is a candidate for this lane, generation and `landOp` |
| `obligationStatus()` ([src/obligations.ts](src/obligations.ts)) | `underlyingIntegration()` | the evidence's stored `canonical` |
| check-failed detection in readiness ([src/core.ts](src/core.ts)) | `underlyingIntegration()` | `canonical` |
| carry candidates in `carryChecks()` ([src/core.ts](src/core.ts)) | `underlyingIntegration()` | `canonical` |
| the admission pre-read ([src/admission.ts](src/admission.ts)) | `underlyingIntegration(c) !== c` | whether any row has that commit: a test of existence, not a choice of row |
| `recordSnapshots()` ([src/core.ts](src/core.ts)) | reads by `(integration, checker, config)` | unchanged |

`underlyingIntegration()` is removed. Evidence admitted before this change
has no stored `canonical`, and is treated as bound to the commit it names.
A scoped check that named a snapshot commit therefore counts for no
integration, and its obligation waits for a new check (fail closed). Lane A
is not yet on main, so no deployed room holds such evidence.

This matches amendment 3's split: the job and its check name the snapshot
commit as `integration`, and the canonical integration is recorded beside
the snapshot (R-CARRY-15 steps 3 and 5). The rest of amendment 3's lane A
edits (sealed carry events, the runner pin, one repository per snapshot,
the new job fields, advisory obligations) are a separate request. The
merge only adds amendment 3's new `CheckJob` fields to the contract-shaped
fixture in `review-a711f7b6.cases.ts`, which the type check requires.

**Tests**, all in `review-95323c2b.cases.ts`, use the reviewer's layout: two
active landings both change `src/app.ts` to v2, and the second also
changes `docs/a.md`, outside the checker's inputs. The two canonical
integrations differ and their snapshot commits are the same.

| Test | What it shows |
|---|---|
| "fresh volatile checks on two integrations with the same snapshot commit …" | Both rows are kept. The second landing's fresh check, naming its own snapshot and `landOp`, is admitted and bound to the second integration, though a lookup by commit finds the first row. It counts there and not on the first integration, and the second landing lands. The first landing, prepared again on the new main, has the same snapshot commit; its own check is bound to its new integration, and it lands. |
| "without landOp, a check naming the shared snapshot commit binds the one integration this generation has" | A check without `landOp` binds the second lane's own integration, and the landing lands |
| "a failing check on the second integration fails the second landing with check-failed" | Readiness finds the failure on the right integration |
| "wrong job or operation: …" | The shared snapshot commit with the other lane's `landOp`, from either side, or with an unknown operation, is `check-binding`. So is a tree check that names the other lane's integration with its own `landOp`. No check evidence is recorded |
| "carry: an earlier check on the shared snapshot commit carries to the lane's new integration, whatever order the snapshot rows are stored in" | After main moves, the earlier check is still a carry candidate for the new integration when the new integration's row is stored first, and it carries by the identical snapshot |

**Mutations.** Each was made on the fix commit, the whole workerd suite
was run, and the change was reverted.

| Mutation | Tests that failed |
|---|---|
| Admission selects the first row by commit alone | "fresh volatile checks …", "without landOp …", "a failing check …" (3) |
| Obligation status looks the integration up by commit | "fresh volatile checks …", "without landOp …" (2) |
| check-failed detection looks the integration up by commit | "a failing check …" (1) |
| Carry candidates look the integration up by commit | "carry: …" (1) |
| The `landOp` restriction and its refusal removed | "wrong job or operation …" (1) |
| `canonical` not stored with the evidence | the four tests above that count a check, and review-a711f7b6's "contract-shaped CheckJob fixture …" (5) |
| The refusal of more than one matching row removed | none: it survives. The case does not arise, as explained above |

**Gates** at `385a106`, the fix commit; the commit that adds this section
changes only this file:

| Gate | Exit | Tests |
|---|---|---|
| root `npm run typecheck` | 0 | — |
| root `npm test` | 0 | git 132; log 105 Node and 100 workerd; policy 190 Node and 189 workerd (1 skipped); room 67 Node and 272 workerd; ui 88 |
| `npm run test:node` (this package) | 0 | 67 in 7 files |
| `npm run test:workerd` (this package) | 0 | 272 in 17 files |
| `npx wrangler deploy --dry-run` with [wrangler.jsonc](wrangler.jsonc) | 0 | bundles with the Room, Registry and Publisher Durable Objects, the Artifacts binding and the Publisher container |

The two merges and amendment 66d6fb14 that follow this fix are gated under
"Gates for revision 8".

## Amendment 66d6fb14: refuse rules before the claim check

This revision merges main `73af785d`, which adds the default pack's
`jj-conflicts` rule and amends R-ADM-1 (docs/protocol.md section 28). For
`propose`, policy `refuse` rules now run inside step 8. They run once the
head is known in the fork (R-PROP-1) and the changed paths are computed
(R-PROP-3) and bounded (R-PROP-6). They run before the configuration-recovery
scope check (R-ADMIN-6), the claim check (R-PROP-4) and configuration
validity (R-POL-1). `require` rules stay at step 9 and share the act's
budget meter. On a configuration-recovery lane both are still skipped
(R-ADMIN-5). The change is in `propose()` in
[src/admission.ts](src/admission.ts). Other kinds of act are unchanged.

So a proposal that adds `.jjconflict-side-0/` at the root of its tree,
outside its claim, is refused with `jj-conflicts`, not `outside-claim`.

Tests, in [test/workerd/amendment-66d6fb14.test.ts](test/workerd/amendment-66d6fb14.test.ts),
under the default pack (`starterPolicy`):

| Test | What it shows |
|---|---|
| "a proposal adding .jjconflict-side-0/ outside its claim is refused with jj-conflicts, from the default policy pack, not outside-claim" | The rule's refusal and fix come first |
| "without the rule, the same proposal is refused by the claim check" | The control: the room's default policy has no such rule |
| "under the pack, a path outside the claim with no jj conflict data is still outside-claim, and a proposal inside it is admitted" | Moving the rules earlier adds refusals only |

Mutation: putting the `refuse` evaluation back after the claim check made
the first test fail (1 of 275); reverted.

## Gates for revision 8

Run at `c2ace91`, which holds the review 95323c2b fix, the merge of lane B
follow-up revision 3, the merge of main `73af785d`, and amendment
66d6fb14. The commit that adds this text changes only this file.

| Gate | Exit | Tests |
|---|---|---|
| root `npm run typecheck` | 0 | — |
| root `npm test` | 0 | git 137; log 111 Node and 106 workerd; policy 199 Node and 198 workerd (1 skipped); room 67 Node and 275 workerd; ui 88 |
| `npm run test:node` (this package) | 0 | 67 in 7 files |
| `npm run test:workerd` (this package) | 0 | 275 in 18 files |
| `npx wrangler deploy --dry-run` with [wrangler.jsonc](wrangler.jsonc) | 0 | bundles with the Room, Registry and Publisher Durable Objects, the Artifacts binding and the Publisher container |

## Review 2a43661d

The checker's review of revision 8 (`18bd7bc`) accepted lane A's own
changes. Its one finding was a deadlock in lane B's staging, inherited
through the merge: finishing a staged object could block. Revision 9 merges
lane B's revision 4 (`request/laneB-pushlog` at `49c2b2d1`), which fixes
it. That merge also brings main `4892e114`, with lane L's decoder for
`check-carried` events. **No lane A source changed.** Lane B reports no
interface change. Lane A's export of `StagingArea` from `packages/log` is
kept, because lane B's branch does not have it.

Gates at `2dac0041`, the merge:

| Gate | Exit | Tests |
|---|---|---|
| root `npm run typecheck` | 0 | — |
| root `npm test` | 0 | git 143; log 127 Node and 122 workerd; policy 199 Node and 198 workerd (1 skipped); room 67 Node and 275 workerd; ui 88 |
| `npm run test:node` (this package) | 0 | 67 |
| `npm run test:workerd` (this package) | 0 | 275 |
| `npx wrangler deploy --dry-run` with [wrangler.jsonc](wrangler.jsonc) | 0 | bundles |

## Amendment 3 (request 23b96a18)

Contract amendment 3 (docs/protocol.md section 29) lists seven edits for
this package (section 29.8, lane A). This request makes all seven. Edits 1,
2, 3, 5, 6 and 7 came first; edit 4, one repository per snapshot commit
(R-CARRY-16), followed once lane G's `SnapshotRepos` landed in
`packages/git`, together with the fixes of review 0f9739dc (see that
section). The tests are in
[test/workerd/amendment3.test.ts](test/workerd/amendment3.test.ts),
[test/workerd/review-0f9739dc.cases.ts](test/workerd/review-0f9739dc.cases.ts)
and [test/workerd/snapshot-repos.cases.ts](test/workerd/snapshot-repos.cases.ts);
each test name starts with its rule or finding.

| Edit | What the Room does | Tests (in that file unless named) |
|---|---|---|
| 1. Check carry is recorded (R-CARRY-13) | `carryChecks` in [src/core.ts](src/core.ts) judges the earlier passing checks of an open check obligation, newest first, until one carries. Each judgment, carried or not, is sealed as a `check-carried` event in the transaction that stores it, with the operation, lane, generation, new integration, obligation, earlier check, policy version, outcome and the `carry` rule decisions. Lane C's `evaluateCarry` judges the platform conditions first and then the carry rules for checks, with one act meter per judgment; their contexts are retained, so `artroom verify` replays them. A judgment is sealed once per earlier check, integration and policy version (`check_judged`). A stored carry names its event and counts only with it; rows from before this change have none and never count. The rule that carry rules for checks stop all check carrying is gone: their decisions are now in the event. | "R-CARRY-13 check carried …"; "… a carry rule for checks refuses it …"; "… a policy activation after the carry …"; "… fail closed …"; "R-CARRY-13, R-LOG-10: artroom verify accepts a log with carried and not-carried events …"; review-a711f7b6 "a carry rule for reviews only …" |
| 2. Runner pin (R-CARRY-14) | The current runner is `CheckerConfig.runner` from the active configuration; `RoomServices.runnerDigest` is removed. A check whose `runner` differs from the pin is refused `check-binding`. A checker with no pin never carries: the event says `runner-changed`, "No runner environment is pinned", with no decisions. Its checks still meet obligations on their own integration. | "R-CARRY-14 the configuration pins R …"; "… the pin changes from R to S …"; "… no runner pinned …"; review-a711f7b6 and phase2b carry tests, now with a pinned configuration |
| 3. Snapshot commit check (R-CARRY-15 step 4) | `snapshotCommit` is kept. Before a filtered job, the Room records the snapshot commit if it has not yet, has the publisher write it into its own repository, and issues the job only if the commit written has the recorded ID. Otherwise it issues nothing and tries again later. Lane B's `SnapshotRepos` makes the same check, and deletes a repository holding anything else. | "R-CARRY-15 the publisher writes the snapshot with another identity …" |
| 4. Snapshot repositories (R-CARRY-16) | The Room runs lane B's `SnapshotRepos` on its own SQLite (`snapshotRepos` in [src/core.ts](src/core.ts)), with repository names starting with the canonical repository's. For a filtered job it gets the repository for the snapshot commit: a new, empty one, into which its publisher sandbox writes the snapshot at `refs/artroom/snapshot` (lane B's `writeSnapshot`, reading the canonical repository with a 300-second read token, minted and revoked through the canonical mint ledger since mint lane C), or the same commit's repository while another job still uses it. Each job attempt mints its own read token for that repository only, expiring by the attempt's deadline, and ends it when the attempt answers or expires; with no job left the repository is retired. Unknown creates, deletions and revocations are durable duties; the alarm runs them (`steps.snapshots`) and is set from them (`nextAlarm`). A snapshot never includes a submodule entry. | snapshot-repos: "older snapshot, omitted file …"; "reuse only for the same snapshot commit …"; "retirement after the last job ends …"; "an unknown create …"; "restart …"; "a submodule entry is never part of a snapshot" |
| 5. Jobs (R-EXEC-8 to R-EXEC-10) | [src/jobs.ts](src/jobs.ts). When a check obligation is open on a clean preview's integration or a landing's, the Room owes one job per owner (that preview or landing operation), integration, obligation and configuration, if the deployment binds a service for that checker (`CHECKER_<NAME>`). The alarm's `jobs` step sends each attempt only to that binding's `handle(job)`, in the background. A whole-tree job reads the canonical repository with a read token minted for the attempt; `gitAuthEnv` is exactly the three variables of `GitAuthEnv`, and `deadline` is the token's expiry. `base` is the landing's `expectedMain`, or the main commit the preview was built on; `volatile`, `advisory` and `runner` come from the configuration whose digest is `config`; a landing's job names it as `landOp`. The job's states and attempts are described under "Review 0f9739dc". | "R-EXEC-8, R-EXEC-9, R-EXEC-10 a whole-tree job carries …"; "R-EXEC-8 no service binding …"; "R-EXEC-8 a job is not issued once its landing has ended"; "… once its obligation is met …"; "… a new job is issued for I2" |
| 6. Advisory obligations (R-OBL-7) | `withAdvisory` in [src/obligations.ts](src/obligations.ts) sets `CheckObligation.advisory` from the configuration, when a proposal is recorded and when obligations are recomputed at activation. Readiness neither waits for an advisory obligation nor fails on its failing check, and leaves its evidence out of the evidence the landing relies on. Reservation does not require it, and the land rule input leaves it out, so an advisory check that arrives after readiness changes nothing reservation compares. A compromised revocation that reopens only an advisory obligation does not make the landing retryable. The obligation still gets an attention item and a job, and its checks are recorded and shown. | "R-OBL-7 the obligation is advisory …"; "… an advisory checker's check fails …"; "… arrives between readiness and reservation …"; "R-OBL-7, R-REV-3 a landing does not rely on advisory evidence …"; "R-OBL-7, R-POL-9 an activation that makes the checker advisory …" |
| 7. Volatile flag (R-EXEC-10) | Unchanged: a signed check whose `volatile` differs from its configuration's is `check-binding`, either way. A job's `volatile` is the configuration's. | "R-EXEC-10 the job's volatile is the configuration's (true) / (false) …"; review-a711f7b6 "a check whose volatile flag contradicts the configuration …" |

The schema has `check_carries.event`, `check_judged` and `check_jobs` for this (migration 8 then, the base schema since decision D5).

**Choices the contract leaves open.**
- A job attempt lives for the checker's `timeoutSeconds` plus 300 seconds;
  its token expires by then (see "Review 90f30a3b"). A token is ended when
  the attempt answers or expires; a canonical token's revocation is a
  durable duty, retried until Artifacts confirms it or the token expires.
- A job the service refuses is not sent again for that owner and
  integration. Its outcome is kept in `check_jobs`.
- A snapshot repository is not kept for reuse after its last job
  (`SnapshotRepos`' default `retainMs` of 0): reuse is for jobs in flight
  at the same time on the same snapshot commit.
- Advisory obligations are left out of the land rule input, so a land rule
  cannot make one block.
- With a pinned runner, a change of pin always changes the configuration
  digest, so the outcome is `config-changed`; `runner-changed` occurs only
  for an unpinned checker.

**Mutations (revision 1).** Each new guard was broken once, the whole workerd suite run,
and the change reverted. 27 of 30 mutations were caught, four of them only
after a test was added or strengthened. Adding the test for advisory
evidence found a defect: a compromised revocation that reopened only an
advisory obligation made the landing retryable. It is fixed.

| Mutation | Tests that failed |
|---|---|
| Carry stored without sealing its event | the four R-CARRY-13 tests that look for an event, and two R-CARRY-14 tests (6) |
| A stored carry counts without its event | "R-CARRY-13 fail closed …" (1) |
| Runner pin ignored at admission | "R-CARRY-14 the configuration pins R …" (1) |
| A checker with no pin carries | "R-CARRY-14 … no runner pinned …"; phase2b "… no runner pinned …"; review-a711f7b6 "no runner environment pinned …" (3) |
| Carry rule decisions left out of the event | three R-CARRY-13 tests (3) |
| Snapshot ID not checked before a filtered job | "R-CARRY-15 …" (1) |
| Filtered jobs owed without snapshot repositories | "R-CARRY-16 without snapshot repositories …" (1) |
| Readiness waits for an advisory obligation | all four R-OBL-7 landing tests (4) |
| A failing advisory check fails the landing | "… an advisory checker's check fails …" (1) |
| Reservation requires an advisory obligation | three R-OBL-7 tests (3) |
| Advisory obligations in the land rule input | "… arrives between readiness and reservation …" (1) |
| Advisory evidence relied on by the landing | "R-OBL-7, R-REV-3 …" (1, after the test was added) |
| A compromised revocation reopening an advisory obligation stops the landing | "R-OBL-7, R-REV-3 …" (1) |
| Advisory not set at proposal / at recomputation | three R-OBL-7 tests / "R-OBL-7, R-POL-9 …" (3, 1) |
| Job `volatile`, `advisory`, `runner` or `base` not from the configuration or landing | the matching R-EXEC-10, R-OBL-7, R-EXEC-8 and R-CARRY-13 job tests (1 to 2 each) |
| `gitAuthEnv` with a fourth variable; a write token; the token not revoked; a deadline after the token's expiry | "R-EXEC-8, R-EXEC-9, R-EXEC-10 a whole-tree job …" (1 each) |
| A job issued for a landing that ended / after its obligation is met | "… once its landing has ended" / "… once its obligation is met …" (1 each, after the tests were added) |
| Jobs owed with no service binding | "R-EXEC-8 no service binding …" (1) |
| Judgments not deduplicated at all (both checks and the `check_judged` key) | "R-CARRY-14 the pin changes …" (1, after it was strengthened) |

Three are equivalent. The current runner taken from the earlier check
instead of the pin: the pin is part of the configuration digest and
admission enforces it, so a changed pin is always `config-changed` first.
Removing only the check before evaluation, or both checks, for a judgment
already sealed: the transaction's check, then the `check_judged` primary
key, still seal it once. One run of the first of these failed a timing test
in concurrency.test.ts under load; it passed when run again, alone and in
the suite.

**Gates (revision 1)** at `455491c8`, the last code commit of revision 1:

| Gate | Exit | Tests |
|---|---|---|
| root `npm run typecheck` | 0 | — |
| root `npm test` | 0 | git 143; log 127 Node and 122 workerd; policy 199 Node and 198 workerd (1 skipped); room 67 Node and 295 workerd; ui 88 |
| `npm run test:node` (this package) | 0 | 67 in 7 files |
| `npm run test:workerd` (this package) | 0 | 295 in 19 files |
| `npx wrangler deploy --dry-run` with [wrangler.jsonc](wrangler.jsonc) | 0 | bundles with the Room, Registry and Publisher Durable Objects, the Artifacts binding and the Publisher container |

## Review 0f9739dc

The checker's review of `8931f596` accepted the sealed carry, the runner
pin and the advisory work, and found two P2s in job delivery. Its
diagnostic asserted both defects; the tests in
[test/workerd/review-0f9739dc.cases.ts](test/workerd/review-0f9739dc.cases.ts)
assert the correct outcomes. This revision also merges main `6f8cacbe`
(lane F's carry UI and jj history) and `5acf29ad` (lane G, with
`SnapshotRepos`), and makes amendment 3's edit 4 (see "Amendment 3").

**The fix: one durable state machine per logical job** ([src/jobs.ts](src/jobs.ts)).
A job belongs to an owner, a clean preview or a landing operation, and is
one row per owner, integration, obligation and configuration:

- `owed`: due at `next_ms`.
- `sent`: attempt `attempt` is with the service until `next_ms`, its
  deadline. Each attempt has its own job ID (`<job>_<attempt>`) and its own
  token, and the row keeps the token's ID.
- `done`: answered, or no longer needed, with its outcome.

Every change to a row is made only for the attempt and state it was read
in, so a late answer, or a second jobs step running at the same time, never
overwrites a newer attempt. The in-memory "running" flag is gone: the row
alone decides. A jobs step that finds a sent attempt past its deadline stops
waiting for its answer, ends its token, and sends a new attempt. Every step
leaves unfinished jobs due in the future: a failed preparation is due again
after 30 seconds, and a room the registry does not bind defers its jobs by 5
minutes. So the alarm is never set in the past.

A job is still needed while its owner is current on that integration (the
preview's integration now, of a generation not landed; or the landing
active on it), the generation is the lane's latest, the configuration is
unchanged and the obligation is open. An advisory job whose landing landed
before the job was sent is still delivered, and a check that names a landed
operation of its generation binds that landed integration (R-OBL-3: "a
landing operation's integration"). A preview job's `base` is the main commit
the preview was built on; it names no `landOp`.

| Finding | Tests (in that file unless named) |
|---|---|
| P2 1. An attempt in flight past its deadline blocked its retry, and left the alarm in the past | "a slow call past its deadline: the next jobs step issues a new attempt with a new token, revokes the expired one, and leaves nothing past due; a late refusal of the first attempt changes nothing"; "the expired attempt's wait is released by the jobs step …"; "two jobs steps at once: one attempt is sent …"; "restart: an attempt in flight when the room stops is issued again at its deadline …"; "a room the registry does not bind issues no job …"; snapshot-repos "an unknown create …" (a failed preparation is due later) |
| P2 2. Previews got no jobs | "preview before land: the preview's job … meets the obligation, and the landing lands on it without another job" (and a landed generation's refreshed preview gets none); "preview refresh after main moves …"; "an owed preview job whose preview moved to another integration is not issued"; "… whose lane moved to a new generation …"; "… whose checker configuration changed …"; "R-OBL-7 an advisory job still queued when its landing lands is delivered …"; snapshot-repos "older snapshot, omitted file" (filtered preview jobs) |

**Mutations.** Each new guard of this revision, edit 4 included, and the
job guards of revision 1 again, was broken once, the whole workerd suite
run, and the change reverted. 30 of 33 mutations were caught, three only
after a test was added (the expired token ended after a restart; two steps
at once; the generation fence alone).

| Mutation | Tests that failed |
|---|---|
| An expired sent attempt is never sent again | 4 |
| The expired attempt's wait is not released | "the expired attempt's wait is released …" (1) |
| The expired attempt's token is not ended by the step | "restart: …" (1, after the assertion was added) |
| A step that lost the race to send still sends | "two jobs steps at once …" (1, after the test was added) |
| One job ID for every attempt | 9 |
| A failed preparation due again at once | snapshot-repos "an unknown create …" (1) |
| A room the registry does not bind leaves its jobs due now | "a room the registry does not bind …" (1) |
| Previews owe no jobs | 10 |
| A preview job's base taken from lane B's preview base | "preview refresh after main moves …" (1) |
| A landed generation's preview owns jobs | "preview before land …"; "R-OBL-7 an advisory job still queued …" (2) |
| A preview job issued for an integration the preview no longer has | "an owed preview job whose preview moved …" (1) |
| A job issued after the lane's generation moved | "… whose lane moved to a new generation …" (1, after the test was split) |
| A job issued after its configuration changed | "… whose checker configuration changed …" (1) |
| An advisory job dropped when its landing landed first; a check naming a landed operation refused | "R-OBL-7 an advisory job still queued …" (1 each) |
| A job issued after its obligation is met | amendment3 "… once its obligation is met …" (1) |
| The Room does not check the written snapshot commit | amendment3 "R-CARRY-15 …" (1) |
| A filtered job's token never ended | four snapshot-repos tests (4) |
| A filtered job reads the canonical repository | 5 |
| Snapshot duties not run by the alarm; the alarm not set from them | snapshot-repos "retirement …" (1 each) |
| A submodule entry in a snapshot | snapshot-repos "a submodule entry …" (1) |
| Job `volatile`, `advisory`, `runner` or `base` not from the configuration or owner | 1, 2, 1 and 4 |
| `gitAuthEnv` with a fourth variable; a write token; a deadline after the token's expiry | 1, 1 and 4 |
| Jobs owed with no service binding | 8 |

Three are equivalent. An answer not fenced by its attempt: the jobs step
releases an expired attempt's wait before it sends the next, so a late
answer is never delivered. A job issued for a landing that ended: of the
ended states, only `aborted` keeps an integration, and an aborted landing
was reserved, which needs every blocking obligation met first. The Room's
port reporting the recorded commit instead of the one written: lane B's
`SnapshotRepos.prepare` refuses a repository holding another commit before
the Room sees it, so the Room's own check (which is tested with another
port) is a second check.

**Gates** at `f283640e`, the last code commit; the commit that adds this
text changes only this file:

| Gate | Exit | Tests |
|---|---|---|
| root `npm run typecheck` | 0 | — |
| root `npm test` | 0 | checkers 33; git 162; log 127 Node and 122 workerd; policy 199 Node and 198 workerd (1 skipped); room 67 Node and 311 workerd; ui 141 |
| `npm run test:node` (this package) | 0 | 67 in 7 files |
| `npm run test:workerd` (this package) | 0 | 311 in 21 files |
| `npx wrangler deploy --dry-run` with [wrangler.jsonc](wrangler.jsonc) | 0 | bundles with the Room, Registry and Publisher Durable Objects, the Artifacts binding and the Publisher container |

## Review 786e9606

The checker's review of revision 2 (`734767c2`) found two P2s in job
dispatch ([src/jobs.ts](src/jobs.ts)). This revision fixes both and merges
main `9bb700b6` (contract amendment 4, bounded-memory log publication, lane
E, the deploy and pi-durable spikes); the one conflict was in `core.ts`'s
imports, where main's `RetainedRef` replaces `RetainedFile`.

| Finding | Fix | Tests (in [test/workerd/review-786e9606.cases.ts](test/workerd/review-786e9606.cases.ts) unless named) |
|---|---|---|
| P2 1. Two jobs steps both read one owed row and used one attempt's ID before either claimed it; the step that lost then ended the winner's token and retired its snapshot repository | A step claims the attempt in the job's row (`owed` to `sent`, the next attempt number, its deadline) before it reads a snapshot or a tree or mints a token. A step that loses the claim prepares nothing. Every credential belongs to one attempt, and its ID is written to the row as soon as it exists, so an expiry or a restart still ends it. A canonical token is minted to expire by the deadline claimed with the attempt. | "filtered / whole-tree: two jobs steps at once on two owed jobs send one attempt each, whose tokens and repositories stay usable until they answer"; "whole-tree: a step held past the attempt's deadline, while the next step issues attempt 2, ends its own token and sends nothing"; "filtered: a job token that cannot be minted leaves the job due again later; the retry reuses the repository written for it"; review-0f9739dc "two jobs steps at once …", "restart …" |
| P2 2. Owner, configuration, generation and obligation were judged only before the asynchronous preparation | After preparation the step checks that the row still holds its attempt, and judges the work again with the same synchronous check it used before (`current`: the owner current on the integration, the lane's latest generation, the same configuration, the obligation open), with no await before the dispatch. Work that changed is marked not needed, and its credentials are ended: the canonical token revoked, or the snapshot job ended, which retires its repository. | eight controls: "whole-tree / filtered preparation, owner / generation / configuration / obligation changed while a read token was being minted" |

The controls run on the real Room Durable Object and SQLite, with lane B's
real `SnapshotRepos`, over the fake Artifacts and sandbox. To stop a step in
the middle of its preparation, the fake's `createToken` can be held in
flight (`FakeArtifactsHost.holdToken`): the controls hold read tokens on
the canonical repository and on snapshot repositories, and meanwhile move
the preview to another integration, propose a new generation, activate a
changed configuration, or meet the obligation with a check signed
elsewhere.

**Mutations.** Each guard was broken once, the whole workerd suite run, and
the change reverted. 10 of 12 mutations were caught, one only after its
control was strengthened.

| Mutation | Tests that failed |
|---|---|
| The step that loses the claim goes on preparing | both "two jobs steps at once on two owed jobs …" (2, after they counted each job's preparation; at first the duplicate dispatch was dropped by the in-flight key, so only a stray token showed it) |
| Dispatch without checking that the row still holds the attempt | "a step held past the attempt's deadline …" (1) |
| A canonical token's ID not written to the row | review-0f9739dc "restart …" (1) |
| No judgment after preparation | the eight preparation controls (8) |
| The credentials of work no longer needed not ended | the eight preparation controls (8) |
| `current` without the configuration / the generation / the open obligation / the preview's current integration | 3 each: the matching preparation controls (whole-tree and filtered), and the earlier test for that fence |
| A canonical token that outlives the claimed deadline | amendment3 "R-EXEC-8, R-EXEC-9, R-EXEC-10 a whole-tree job …" (1) |

Two are equivalent. A snapshot token's marker not written to the row: the
expired attempt's token is then not ended by the step, but `SnapshotRepos`
already owes the repository's deletion by the token's deadline. A failed
preparation not ending its credentials: a preparation fails only before its
token exists (the canonical mint is the last thing that can fail, and
`SnapshotRepos.end` does nothing for a job with no token); the written
repository stays for the retry to reuse, as the control shows, and is
retired when its preparation window closes.

## Review 90f30a3b

The checker's review of revision 3 (`c4ceef41`) credited both races of
review 786e9606 and found one P2: a whole-tree job's canonical token was
asked for a lifetime measured from before the asynchronous mint, its
returned expiry was not checked, and the dispatch boundary did not check
the attempt's deadline. A slow mint therefore gave a token that outlived
the job, and with no second jobs step an attempt past its own deadline was
still sent. This revision fixes it and merges main `1f4f1f0b` (founding:
incarnation-named public founding, legacy adoption, the import namespace's
binding). Lane A's jobs and snapshot repositories now reach the canonical
repository through the Room's namespace-aware binding (`core.artifacts`).

**The fix** ([src/jobs.ts](src/jobs.ts)):

- The claimed deadline is kept, and never extended. The canonical read
  token is asked to expire 5 seconds before it (`TOKEN_MARGIN_S`, as
  `SnapshotRepos.mint` asks), and the token Artifacts returns is checked
  as `SnapshotRepos.mint` checks its own: read-only, a readable expiry, no
  later than the deadline. A token that fails is refused and ended, nothing
  is sent, and the job is due again later.
- The dispatch boundary requires an attempt that is still the row's,
  before its deadline, and still current (owner, generation, configuration,
  obligation). An attempt past its deadline is not sent; its credentials
  are ended and the job is due again later.
- Ending a canonical token is durable. The token is written to
  `job_tokens` before Artifacts is asked to revoke it, and
  stays there, with its attempts and last error, until Artifacts confirms
  the revocation or the token's known expiry has passed. A token whose
  expiry is not known stays until it is revoked. The jobs step retries due
  revocations with backoff (5 seconds, doubling, at most 5 minutes), and the
  alarm is set from them, so a restart keeps the duty.

Tests, in [test/workerd/review-90f30a3b.cases.ts](test/workerd/review-90f30a3b.cases.ts),
on the real Room Durable Object and SQLite with no other jobs step running.
The fake's `createToken` can hold the request before minting
(`holdToken`: the expiry then runs from the late mint) or hold the answer
after minting (`holdTokenReply`: the expiry ran from the request).

| Test | What it shows |
|---|---|
| "healthy mint …" | Sent; the token reads the canonical repository, expires before the deadline, and is revoked after the answer |
| "an answer delayed after the mint, still before the deadline …" | Sent, with a token that expires by the deadline |
| "a mint delayed by less than the room's margin …" | Sent: the margin absorbs a short delay |
| "a mint delayed so that the token would outlive the deadline …" | The token is refused and revoked; nothing is sent; the next attempt is sent with a token that expires by its own deadline |
| "Artifacts answers with a write token" / "… with no readable expiry" | Refused and revoked; nothing is sent |
| "an answer delayed past the attempt's deadline, with no other jobs step …" | Nothing is sent; the token is ended; the job is due again later |
| "cleanup fails, and the room restarts …" | The refused token stays recorded, with its error, retried with backoff while it can still read; after a restart the alarm is set for it; when Artifacts recovers it is revoked and the duty settled |

**Mutations.** Each guard was broken once, the whole workerd suite run, and
the change reverted. All 11 were caught, one after its test was
strengthened.

| Mutation | Test that failed |
|---|---|
| No deadline at the dispatch boundary | "an answer delayed past the attempt's deadline …" |
| A returned token's scope not checked | "Artifacts answers with a write token" |
| A returned token's unreadable expiry accepted | "… with no readable expiry" |
| A returned token that outlives the deadline accepted | "a mint delayed so that the token would outlive the deadline …" |
| No margin under the deadline | "a mint delayed by less than the room's margin …" |
| An attempt past its deadline keeps its credentials | "an answer delayed past the attempt's deadline …" |
| An ended token not recorded before revocation | "cleanup fails, and the room restarts …" |
| A failed revocation dropped while the token can still read | "cleanup fails …" |
| Due revocations not retried by the jobs step | "cleanup fails …" |
| The alarm not set from due revocations | "cleanup fails …" |
| A failed revocation retried at once | "cleanup fails …" (after it asserted the retry is due later) |

### A token mint whose answer is lost (review 1701f73e)

The checker's review of revision 4 (`277c2375`) found that a whole-tree
job's canonical `createToken` can apply at Artifacts while its answer is
lost. What each failure did:

- refused before anything changed (an Artifacts error that says so): no
  token existed; the job was due again later. Correct.
- applied, then the answer lost (a transport error), or no answer at all:
  a live token existed that nothing recorded, revoked or watched. Its
  expiry ran from when Artifacts applied it, so a mint applied late gave a
  token that outlived the attempt's deadline (in the checker's control,
  by 25 seconds). Nothing was sent on it.
- a malformed answer: with no token ID, the same untracked token; with an
  ID but no token text, the job could be sent as `Bearer undefined`.

**The fix** ([src/jobs.ts](src/jobs.ts)). The mint is recorded before
Artifacts is asked (`mint:<job>` in `job_tokens`, with the attempt's
deadline). A usable answer (ID and text) settles the record in the step
that records the token by its ID; a definite refusal settles it at once.
A lost or malformed answer leaves it unresolved, with the error, and
nothing is ever sent on an unknown mint.

Revision 5 then settled an unresolved mint on a clean inventory of the
canonical repository's tokens. Review 013dad0c found that unsafe; see
"Review 013dad0c". The review also accepted the namespace-aware binding:
an imported room's jobs, tokens and snapshot repositories live in its
import namespace. The shared test fixture routes the sandbox's
`writeSnapshot` to the namespace that holds the store, and
`makeRoom({ importNamespace })` founds a room there. Controls in
snapshot-repos ("an imported room's jobs stay in its import namespace",
whole-tree and filtered) fail with the fixture's routing undone, or with
jobs reading through the public binding.

## Review 013dad0c

Since mint lane C (request 5ff58c9a) a whole-tree job's mint is a record
of the Room's canonical mint ledger (`job:<job>`), not a `mint:<job>` row,
and the ledger observes unknown creates; a stored room's open `mint:` rows
move into it once. The rules below are unchanged; see
[plans/README.md](../../plans/README.md), "Mint lane C".

The checker's review of revision 5 (`083543b4`) found one P2: an
unresolved mint was settled when a complete inventory, after the attempt's
deadline, showed no live token the Room could not account for. That shows
absence at that moment, not that the mint can never apply. In the
checker's control, a mint held before Artifacts applied it outlived a
clean inventory; when it then applied with its answer lost, the live token
had no duty left, before and after a restart.

**The fix** ([src/jobs.ts](src/jobs.ts)). A mint whose outcome is unknown
(`mint:<job>` in `job_tokens`) stays an open duty until an answer settles
it: a refusal that changed nothing, or a usable answer, whose token is then
recorded by its ID and revoked through the ended-token debt. No inventory
and no timeout settles it, because nothing bounds when Artifacts applies a
request, and the token's expiry runs from then. The Room never revokes a
canonical token it cannot attribute: the inventory names no owner, and the
repository holds other owners' tokens. What each inventory shows is kept on
the record as an observation ("outcome unknown; N live token(s) … not
accounted for at …"); the record is checked again with backoff, doubling
from 5 seconds to at most every 6 hours, and never stops. A late usable
answer, after the attempt was superseded, still finds the record: its
token is ended by its ID, and the record settles. The open duties are
readable through the Room object's `jobTokenDuties()` operator method (no
attention item fits: the contract's attention kinds have none for it; a
user-facing projection is a separate request). In
practice an unknown mint whose answer never comes stays open indefinitely,
visible there. Source and test comments no longer say that the attempt's
deadline bounds an unknown mint's lifetime.

Controls in [test/workerd/job-token-mint.test.ts](test/workerd/job-token-mint.test.ts),
on the real Room Durable Object and SQLite:

| Test | What it shows |
|---|---|
| "applied, then the answer lost …" | Nothing is sent; the next attempt is sent; past the deadline, and after the lost token has expired, the clean inventory is noted and the duty stays open, visible through `jobTokenDuties`, on the alarm |
| "the checks back off, to at most six hours, and never stop" | Sixteen checks later the record is still there, checked every 6 hours |
| "review 013dad0c: the mint is held past its deadline, a second jobs step … then the mint applies with a lost answer" | The checker's reproduction: attempt 2 is sent and its inventory is clean; then attempt 1's mint applies with its answer lost. Its token is live past the deadline, the duty is still open, survives a restart with its alarm, and stays open after the token has expired |
| "… with a usable answer" | The late token outlives the deadline, so it is refused, revoked, and the duty settles |
| "… with a usable, minted in time answer" | The token was minted in time and only its answer was late: it is never sent, is revoked by its ID because the attempt was superseded, and the duty settles |
| "the room stops while a mint's answer is outstanding …" | The record survives as an open duty, and the next attempt goes on |
| "an inventory that is incomplete is noted as such; a live token the Room knows is not counted against the duty" | Observations only |
| "a malformed answer …", "a refusal that changed nothing settles the mint at once", "an answer still outstanding …" | As before |

**Mutations.** All 8 were caught, one after a test was added: a clean
inventory settling the mint; settling it by the deadline; no cap on the
backoff; a late usable answer not finding the record; a late usable
answer's token not ended (caught after the "minted in time" control was
added: the first late answer was refused by its expiry instead); a lost
answer treated as no token; no record before the call; open duties not
reported.

## Review 271dbd53

The checker's review of revision 6 (`132be1ff`) credited the fix of review
013dad0c and found one P2: when a known token changed owner, the old owner
was released before the new one was written. A usable answer deleted the
mint record before the token's revocation debt was inserted, and
completion marked the job done with no token before it; the insert's error
was then swallowed. One injected persistence failure left a live token
with neither record, across a restart.

**The fix** ([src/jobs.ts](src/jobs.ts)). From the moment its ID is known,
a canonical token is owned by its own `job_tokens` row:

- A usable answer writes the token's row and deletes the mint record in one
  transaction: both happen or neither does. An accepted token's row is due
  at its expiry, which is no later than the attempt's deadline; a refused
  token's row is due at once.
- Ending a token (completion, refusal, a superseded or expired attempt,
  work no longer current) only makes its row due, by a write that is not
  swallowed. Marking a job done or clearing its token no longer releases
  anything: the row keeps the token until Artifacts confirms the
  revocation or the token's known expiry has passed.
- If the transfer itself cannot be written, the mint record stays. While
  the token's ID is still known in memory, the token is revoked at once,
  and only once Artifacts confirms that is the mint record settled;
  otherwise the record stays an open duty.
- The rows are also the one list of tokens the Room accounts for when it
  observes an unknown mint.
- `jobTokenDuties()` tells held tokens from ended ones. It gives a known
  token's real expiry, an unknown mint's as unknown (null), and when each
  record is next checked (`nextCheckAt`).

Controls in [test/workerd/review-271dbd53.cases.ts](test/workerd/review-271dbd53.cases.ts),
on the real Room Durable Object and SQLite. Each injects one failure of the
Room's own SQLite write at a handoff, then aborts the object and checks
that a fresh one still owns the token and revokes it.

| Test | Handoff whose write fails once | Outcome |
|---|---|---|
| "a late usable answer whose token outlives the deadline …" | the checker's first control: ending a refused late token | its row, due at once, survives; the token is revoked after the restart |
| "normal completion …" | the checker's second control: ending the token after the service answered | the job is done, its token still held by its row (shown as `held` with its real expiry), revoked after the restart |
| "an attempt in flight when the room restarts, then expired …" | ending the expired attempt's token | the token's row revokes it |
| "work no longer current at dispatch …" | ending the prepared token | revoked after the restart |
| "the transfer itself fails once …" | the transfer | nothing is sent; the token, known in memory, is revoked, and the mint record settles |
| "the transfer fails once and the revocation fails too …" | the transfer, with Artifacts unable to revoke | the mint record stays an open duty across a restart; nothing is sent |

**Mutations.** All 8 were caught, three after a test was strengthened: the
transfer outside one transaction; no row for the known token; a refused
token's row not due at once (after the test checked it); a failed transfer
not revoking; a failed transfer settling the mint record without a
revocation; completion dropping the token's row; held tokens not counted as
accounted for (after the accounted list became the rows alone); the duty
projection not telling held tokens apart (after the test checked it).

## Founding gaps (request b6b51de7)

The first live deploy (`notes/deploy-spike.md`) found three gaps in
founding. This change closes them.

**1. A new public room lands its first lane.** Founding now gives a new
repository one commit on `main`, with no files. The contract's landing
needs a main: `expectedMain` is a `Sha` in the landing operation and in
`land-reserved`, and the push is a compare-and-swap from it (R-LAND-2,
R-PUB-4). Landing onto a missing main would have changed the contract,
lane B's engine and its sandbox git sequences, so the founding side was
the smaller change. R-GEN-12 said only "fresh, empty"; one sentence now says
that `main` gets a first commit with no files (the only amendment).

- The commit is fixed by the genesis's `createdAt`: the empty tree, author
  and committer `Artroom <room@artroom.invalid>`, a fixed message. A retried
  founding pushes the same commit.
- Artifacts has no call that writes a commit, so the Room pushes the two
  objects itself, with one `git-receive-pack` request that creates
  `refs/heads/main` only if it does not exist (lane B's
  [first-commit.ts](../git/src/first-commit.ts), tested against real git's
  `receive-pack`). Any answer but a clear `ok` is a refusal; `found` then
  reads main, and fails with `unavailable` if it is still missing.
- A `land` on a repository with no main (an empty import, or a room
  founded before this change) fails with `not-found`, `retryable: false`,
  and a message that does not say retry. Nothing is recorded.

**2. The creation token is revoked durably.** Creating the repository is a
step in lane B's workspace ledger, written before the call, like a fork's
creation. Revised by review a35b4b61 (below): the answer's 24-hour write
token pushes the first commit, is kept by value until its revocation is
confirmed, and nothing is ever minted on the canonical repository before
founding. The genesis is sealed only when nothing is owed; until then
`found` is `unavailable`, the same `found` retries, and the Room's alarm
settles the debt before founding, even if the founder never returns.

**3. One deployment founds public rooms and imports.** The contract asks
for both (R-GEN-12): an import's repository must be outside the public
founding namespace, so it needs a second Artifacts binding. `IMPORT_ARTIFACTS`
reaches `IMPORT_NAMESPACE`, the only namespace a grant may name. The Room
resolves its binding from its repository's namespace (`Remotes.bindings`);
lane B's workspaces, landing tokens and sandbox, and lane L's log remote,
follow it. The sandbox's gateway allows both namespaces (`repoPathOf`).
A source whose namespace has no binding is refused at `draft`, and at step
4 of `found` before anything is bound, with `forbidden` and the reason, so
it never leaves a binding that cannot complete. A deployment with one
binding (production's `wrangler.jsonc`) founds public rooms and refuses
imports, saying why. The spike has both bindings since revision 2
(`gitseq-spike` and `gitseq-spike-import`), and its live run founds a public
room and imports a repository on the same deployment.

### Evidence

| Gap | Tests |
|---|---|
| 1 | `test/workerd/founding-gaps.test.ts` (first lane lands; push fails, is refused or its answer is lost; land on no main); `packages/git/test/first-commit.test.ts` (the commit equals `git commit-tree`'s; real `receive-pack` accepts the pack and refuses an existing main; only a clear `ok` counts) |
| 2 | `founding-gaps.test.ts` (no active token at sealing; a lost create; revocation fails, then the alarm settles it before founding); `packages/git/test/workspaces.test.ts`, five canonical-repository cases |
| 3 | `founding-gaps.test.ts` (an import lands and publishes in its own namespace on a deployment that also founds publicly; refusals at draft and found); `test/node/config.cases.ts` (production bindings and log remote); `packages/git/test/ref-fence.test.ts` (sandbox namespaces) |

Each mutation below was made once, and the named suite run; every one
failed at least one test (21 of 21 killed).

| Mutation | A test that failed |
|---|---|
| No first commit at founding | first lane lands on it |
| A refused first commit still founds | push fails, is refused, or its answer is lost |
| Created without a clear `ok` | an answer that is not a clear ok is refused |
| Wrong pack type bits | pushed to an empty repository (real git) |
| Old value not all zeros | a repository whose main exists is never moved |
| Land on no main says `unavailable` and retry | land on a repository with no main |
| The create owes nothing (ledger, and in the Room) | settling revokes it; no token left at sealing |
| The create recorded after its answer | a create whose answer is lost |
| The inventory revokes nothing | no token left at sealing |
| The first commit's token not revoked after use | the first commit's token is revoked after |
| `found` seals while a token is owed | revocation fails, then the alarm |
| No alarm work, or no alarm, before founding | revocation fails, then the alarm |
| The alarm treats the canonical repository as a fork | a later run, by the alarm's reconcile |
| Imports accepted with no import namespace | refuses an import at draft |
| Public founding not checked at `found` | refuses public founding before anything is bound |
| The Room locates, or binds, only the public namespace | an imported room lands in its own namespace |
| The production log remote ignores the namespace | Node: production services |
| The sandbox reaches one namespace | sandbox namespaces |

The gap 2 rows above describe the first revision's ledger. Review a35b4b61
replaced that code (no canonical mint, retirement by deletion, complete
inventories); its own mutations are in "Review a35b4b61".

The live re-runs are in [notes/deploy-spike.md](../../notes/deploy-spike.md).

## Review a35b4b61

The checker found three ways the founding cleanup and checks could still
leave something unaccounted for. Each is now a test of the right outcome.

**1. No canonical mint can be left with an unknown outcome.** The first
version minted a 60-second token for the first commit, and settled a mint
whose answer was lost once an inventory came back empty, although the mint
could still apply. Now no token is minted on the canonical repository before
founding at all: the create's own token pushes the first commit. The ledger
(`Workspaces.prepareCanonical`, `sealCanonical`, `settleCanonical`) keeps
the fork cleanup's distinction between unanswered and finished effects:

- a create whose answer was lost stays in flight. Absence, time or an
  inventory never settle it. It is superseded only when the room is sealed on
  an answered create, because the name is then taken and a late create can
  only be refused;
- whenever the Room cannot vouch for every token on the repository (no
  answered create holds it, its token is spent and main has no first commit,
  the first commit was refused, or an active token nobody owes appears), it
  deletes the repository, with every token on it, and makes it again. Review
  3eb7bc44 changed "again": each attempt now has its own name (below);
- the creation token is kept, by value, in its own table until a revocation
  answers, and `sealCanonical` refuses (so the seal aborts) while anything is
  owed.

**2. An inventory proves absence only when complete.** The binding's
`listTokens` has no paging. An inventory counts only when it has as many
records as its `total` and every record has an ID, a scope, a state and an
expiry. Otherwise founding waits and the inventory stays owed. After
founding, `reconcile`, `nextDue` and `settleCanonical` never act on the
canonical repository, so the Room's own publishing credentials are never
swept.

**3. A mode needs its binding, not only its name.** `draft`, and step 4 of
`found` before `registry.bind`, refuse public founding without an `ARTIFACTS`
binding and imports without an `IMPORT_ARTIFACTS` binding, with `forbidden`
and the reason; nothing is reserved. `productionServices` installs no adapter
for a missing binding. The workerd test config has stand-in values for both
bindings, because the test pool cannot have Artifacts bindings.

| Finding | Tests |
|---|---|
| 1 | `packages/git/test/workspaces.test.ts`: healthy (answered) control; no canonical mint; a lost create that applies late, across a restart and after a successful retry; the alarm deletes a late repository before founding; refused control; unconfirmed revocation; spent token; refused first commit; after founding nothing is touched. `founding-gaps.test.ts`: no `createToken` at founding; a lost create; the alarm before founding |
| 2 | `workspaces.test.ts`: inventories incomplete, without a total, with a record without an ID, with an unknown state; an active token nobody owes |
| 3 | `founding-gaps.test.ts`: `IMPORT_NAMESPACE` without `IMPORT_ARTIFACTS`, and no `ARTIFACTS`, refused at draft and found with the registry checked; the two-binding import control; `test/node/config.cases.ts` |

Mutations, made once each after committing, with the named suite run: 26
of 28 were killed. The checker's three diagnostics are among the tests.

| Mutation | A test that failed |
|---|---|
| The seal does not require a holder with nothing owed | an unconfirmed revocation blocks the seal |
| A repository no answered create holds is adopted | a lost create that applies late, across a restart |
| The inventory ignores its total | an incomplete inventory proves nothing |
| The inventory accepts malformed records | a record that has no ID proves nothing |
| Absence settles a create in flight | a lost create that applies after a successful retry |
| The seal leaves creates in flight open | a lost create that applies late, across a restart |
| An active token nobody owes counts as clean | an active token nobody owes |
| The creation token is marked revoked without revoking it | healthy control |
| A refused first commit is retried with the same token | a refused first commit is retired and made again |
| The alarm retires an unheld repository after founding too | after founding nothing is touched |
| Imports accepted without `IMPORT_ARTIFACTS` | `IMPORT_NAMESPACE` with no binding |
| Public founding accepted without `ARTIFACTS` | no `ARTIFACTS` binding |
| Production installs an adapter for a missing binding | Node: production services |
| The first commit not pushed; created without a clear ok; wrong pack bits; old value not zero; land on no main says retry; no alarm work or scheduling before founding; the import and public checks; namespace routing (Room, log remote, sandbox) | as in "Founding gaps" |

Two survived, and both are equivalent in the Room's flow, kept as defence in
depth: `found`'s check that main is not null after `prepareCanonical` (which
returns only once main holds the first commit), and `sealCanonical`'s check
when run through the Room (which seals only after `prepareCanonical`
settled everything). The second is killed at the ledger level.

## Review 3eb7bc44

**The finding.** After review a35b4b61, a retirement deleted the repository
and made it again under the same name. A delete whose answer was lost could
then apply after a later delete had answered and the room had been sealed
on the new repository, erasing it, even after landings. A later answer is
not proof that an earlier request completed or was cancelled.

**The fix: one name per creation attempt.** A public room's identity stays
`<namespace>/<base>` (R-GEN-12, derived from the draft value), but its
repository is stored under an *incarnation* name, `<base>-<step>`, where
`<step>` is the ID of the create step, recorded before the create is sent.

- A name is created at most once and never reused. A delete is only ever
  owed for an *abandoned* incarnation (one whose create's answer was lost,
  or that the Room could not vouch for). So a late delete, or a late create,
  can only reach an abandoned incarnation, never the one the room is sealed
  on. This holds by construction, without any provider guarantee.
- An abandoned incarnation's delete is retried until Artifacts answers;
  deleting a missing repository is harmless. Seeing the incarnation proves
  its single create applied; after that, NOT_FOUND settles it. A create in
  flight whose repository is absent stays watched, before and after
  founding, and is deleted if it appears.
- These duties never block the seal, and the alarm runs them before founding
  (`settleCanonical`) and after it (`reconcile`, which counts them in
  `nextDue` and `pendingCleanup`). `Workspaces.duties()` lists them for
  operators.
- `sealCanonical(name)` requires that `name` is the holder, is not
  abandoned, and owes nothing.
- The Room records the sealed incarnation (meta `canonical_name`) and locates
  its repository there. Forks, landing, the log and the sandbox follow. A
  room founded before this change keeps its identity's name.
- R-GEN-12 gains one sentence: the deployment may store the repository under
  a name derived from the identity, one per creation attempt and never
  reused.

The checker's cases are tests: a delete whose answer is lost and applies
late, across a restart; the same after the seal and a normal landing (the
repository, its landed main and its log survive), at the ledger level and
through the Room, with a real Durable Object eviction; and a lost delete
followed by NOT_FOUND. The healthy control stays.

Also from the review: the smoke script now reports an unknown token listing
as unknown, using the deploy lane's `readListing`, instead of reading it as
no tokens. The deploy notes' references to lane E (now on main) are dated.
This revision has not been run live.

Mutations, made once each after committing: 32 of 34 were killed.

| Mutation | A test that failed |
|---|---|
| Every attempt reuses the identity's name (ledger, and Room) | healthy control; a refused or lost first commit |
| A delete may be aimed at the holder | healthy control |
| Seeing an incarnation does not settle its create | the late delete after the seal and a landing |
| Absence settles a create in flight | a late create after the seal |
| The seal accepts a name that is not the holder | the seal refuses a non-holder |
| The seal does not require nothing owed | an unconfirmed revocation blocks the seal |
| The Room ignores its sealed incarnation | the first lane lands |
| Prepare leaves abandoned incarnations for later | the late delete across a restart |
| The alarm after founding ignores abandoned incarnations | the late delete across a restart |
| `nextDue` ignores abandoned incarnations | the late delete after the seal and a landing |
| The earlier rows of "Review a35b4b61" and "Founding gaps", rerun | as there |

Two survived, both equivalent: a delete aimed at the sealed incarnation
(`abandonedNames` without excluding it), because the sealed incarnation has
no open duty after the seal and so is never visited; and `found`'s check that
main exists after `prepareCanonical`, which only returns once it does.

## Review 700b74ea

The finding was a public founding begun by a Room older than the
incarnation ledger, which created the repository under its base name and
recorded nothing. The fix adopted that base name durably (a `legacy` create
step, never settled) when the registry binding was an older Worker's (the
registry's `ledger` column, migration 2). Only the spike deployment ever
had such state. The adoption, the registry's `ledger` column and their
tests were retired when that state was wiped (decision D5, request
73eccbec): every room now begins on this ledger, and a public room's
repository is always an incarnation, `<base>-<step>`.

Main `9bb700b6` (amendment 4, the bounded-memory publisher, the deploy
cleanup and pi Workers AI) is merged. This revision has not been run live.

The smoke script no longer takes `genesis.repo`'s name (the identity's base)
for the public room's repository: it finds the sealed incarnation (the
highest `<base>-<step>`, `incarnationOf`) for its founding checks, ref reads
and verify, and its cleanup reaches the base name, every incarnation and
their forks (`cleanupRun` with `incarnations`); `test/node/spike-smoke.cases.ts`
covers both.

## Client and deployment hygiene (request 55be0661)

Request 55be0661 carries findings SEC-04, SEC-05 and SEC-11 of
simplification review 55563589. Each finding was reproduced on main
a6330262, and each has tests that fail there: 13 of 13 in the Room's node
file, 4 of 6 in its workerd file, 2 of 4 in the MCP file, and 58 of 60 in
the CLI's two files. The ones that pass on main pin behaviour that was
already right and must stay so: the Room's declared-length pre-check, an
exact 1 MiB body, the MCP route's 401 before reading, and the read-back of
the whole credential file. (The CLI's "refusal does not repeat the token"
also passes on main, only because `checkGrant` does not exist there.)

The checker's report f593d8f7 found SEC-05 still open at e90cc7c0: the
credential file's first-line mark carried the room's lane and lease
unchecked. That is fixed below, with the redemption's values that the CLI
saves and prints; 29 of the CLI's 60 tests fail at e90cc7c0,
including the checker's own fixture
(packages/cli/test/checker-hygiene-marker.test.ts).

| Finding | Fix | Tests |
|---|---|---|
| SEC-04: `PUBLIC_URL` fell back to `https://artroom.example.workers.dev` (src/room.ts), and wrangler.jsonc set that placeholder. Redemption names that host in `Redeemed.mcp`, and the CLI prints a `claude mcp add` command that sends the bearer token there. | `publicUrl()` in src/config.ts requires an `https://` origin with nothing after the host, and has no default. The Worker entrypoint (src/worker.ts constructor) and every Room object (src/room.ts constructor) call it first, so neither starts without one, for HTTPS or RPC. wrangler.jsonc no longer sets `PUBLIC_URL`; a deploy passes `--var PUBLIC_URL:https://<host>`. | test/node/hygiene-55be0661.cases.ts (the accepted and refused values; wrangler.jsonc has no `PUBLIC_URL` and names no example host; the spike's value is accepted). test/workerd/hygiene-55be0661.test.ts (the Worker and a Room object refuse to start without it, or with a value that is not an origin). |
| SEC-05: the CLI wrote room-supplied values verbatim into the git config file the repository includes (packages/cli/src/git.ts): the workspace remote and token in the setting, and the lane and lease in the first-line comment that marks whose credential it is. A newline in any of them ends its line and adds settings: a remote ending `"]`, newline, `[core]`, newline, `sshCommand = ...`, a token, a `Claim.lane` or a lease with a newline each set `core.sshCommand`. All four were reproduced (the remote and token on main, the lane and lease on e90cc7c0). | Every value written into the file is checked before anything changes, in packages/cli/src/git.ts. `checkGrant`: the remote must be a plain `https://` URL in normal form (no credentials, query, fragment, dot segments or characters outside `A-Za-z0-9._~/-` in the path), and the token may hold only the RFC 6750 token characters and `?` and `=`, up to 4096. `checkMarker`: the lane must be a canonical lane ID (`act_<seq>_<8 hex>`), the lease a whole number, and the installation ID an idempotency key. In packages/cli/src/main.ts, a claim's lane is selected only if canonical; `laneOf` refuses any other `--lane` or stored lane before the destination is reserved; `workspace` checks the grant's remote, token and lease before anything is pending. `configureWorkspace` checks all five again at its own boundary. | packages/cli/test/hygiene-55be0661.test.ts: 14 refused remotes, 10 tokens, 7 lanes, 6 leases and 5 installation IDs, each named; the refusal does not repeat the token; `configureWorkspace` given an injecting remote, token, lane, lease or installation ID refuses and changes nothing; the whole file, written with every admitted character in every field, reads back through git as exactly one setting, every other line is a comment, and the ownership reader reads the mark back exactly; `artroom workspace` given an injecting remote or token exits 1, and a lease from a malicious room (in both the lane and the grant) exits 1, each with no remote, no credential, no `core.sshCommand` and nothing pending, after which a valid workspace installs and releases; a claim answered with an injecting lane exits 1 and selects nothing; an injecting `--lane` is a usage error before the destination is reserved. A redemption with an injecting MCP URL or bearer exits 1, saves nothing and prints no command. packages/cli/test/checker-hygiene-marker.test.ts: the checker's fixture, unchanged. |
| SEC-11: the HTTPS routes read a body whole and then compared its length in UTF-16 units with 1 MiB, so a body without `Content-Length` was read entirely first (src/http.ts). The MCP route had no cap (packages/mcp/src/worker.ts). | Both count bytes as the body streams in and stop reading past 1 MiB: 413 `payload-too-large` on the HTTPS routes, a 413 JSON-RPC error on the MCP route. A declared `Content-Length` over 1 MiB is refused before any read. The MCP route reads the body only after the bearer is accepted. | test/workerd/hygiene-55be0661.test.ts: a 16 MiB stream with no length is refused after at most 1 MiB plus two chunks is pulled (main pulled all 16 MiB); 1.5 MiB of two-byte characters is refused; a large declared length is refused with nothing pulled; exactly 1 MiB is read. packages/mcp/test/workerd/body-cap.test.ts: the same three, an unknown bearer refused with nothing pulled, and exactly 1 MiB handed on. |

**Where this departs from the request.** Item 2 asked that the credential
file be written through `git config` arguments rather than by string
templating. That would put the token in a command argument, which other
users on the machine can read in the process list, and the CLI README
promises the token never is one. The file is still written directly. The
strict patterns are the fix: none of the remote, token, lane, lease or
installation ID patterns admits a character that git config treats
specially (quote, backslash, `#`, `;`, `]`, whitespace, newline), and a test
writes every admitted character in every field and reads the whole file
back through git as one comment mark and exactly one setting.

**Mutants.** Each of 35 guards was broken in turn (the script restores the file
from memory, not from git); every mutant turned at least one of the tests
above red.

| Mutant | Red |
|---|---|
| `publicUrl`: no not-set check | refuses a PUBLIC_URL that is not set |
| `publicUrl`: any protocol | refuses plain http |
| `publicUrl`: no origin-equality check | 8 refusals: not a URL, http, trailing slash, path, query, fragment, credentials, upper-case host |
| Room constructor restores the fallback host | a Room object refuses to start |
| Worker constructor without the check | the Worker refuses to start |
| wrangler.jsonc restores the placeholder | wrangler.jsonc has no PUBLIC_URL |
| HTTPS: no streaming count | the 16 MiB stream; two-byte characters |
| HTTPS: no `Content-Length` pre-check | a declared length is refused before any read |
| HTTPS: main's read-then-measure | the 16 MiB stream; two-byte characters; declared length |
| MCP: no streaming count | the 16 MiB stream |
| MCP: no `Content-Length` pre-check | a declared length is refused before any read |
| MCP: the original request handed on, uncapped | the 16 MiB stream; declared length |
| MCP: body read before authentication | an unknown bearer is 401 before the body is read |
| CLI: no remote pattern | ext::, plain http, credentials, query, fragment |
| CLI: no normal-form check | dot segment; an array remote |
| CLI: no token type check | an array token |
| CLI: no token pattern | 9 token refusals, the refusal not repeating the token, and both injecting-token tests |
| CLI: token class widened to any non-space | quote, backslash, `#`, `;` |
| CLI: no token length bound | more than 4096 characters |
| CLI: `configureWorkspace` skips `checkGrant` | both boundary tests |
| CLI: `workspace` skips `checkGrant` before the destination | both end-to-end tests (a pending entry was recorded) |
| CLI: `checkMarker` accepts any lane | 7 lane refusals; the injecting lane at the boundary |
| CLI: `checkMarker` lease without the integer check | the injecting lease, a string, a fraction, NaN, past a safe integer |
| CLI: `checkMarker` lease without the sign check | a negative lease |
| CLI: `checkMarker` installation ID without the type check | an array |
| CLI: `checkMarker` installation ID without the pattern | the injecting ID, a dot, nothing, more than 64 |
| CLI: `configureWorkspace` skips `checkMarker` | the three boundary tests for the mark |
| CLI: `workspace` skips `checkMarker` before the destination | the malicious-lease test (a pending entry was recorded) |
| CLI: `laneOf` accepts any lane | the injecting `--lane` test |
| CLI: a claim's lane is selected unchecked | the injecting-claim test (the lane was stored) |
| CLI: `checkRedeemed` without the MCP URL pattern | `checkRedeemed` refusals (`ftp:`) |
| CLI: `checkRedeemed` without the normal-form check | `checkRedeemed` refusals (dot segment) |
| CLI: `checkRedeemed` bearer without the type check | `checkRedeemed` refusals (an array) |
| CLI: `checkRedeemed` bearer without the pattern | `checkRedeemed` refusals; the injecting-bearer redeem test |
| CLI: `redeem` skips `checkRedeemed` | both redeem tests (the command was printed and the bearer saved) |

Every room-supplied value the CLI writes into git config, the credential
file, the bearer file or a printed shell command is now checked: the
remote, token, lane and lease above, and a redemption's MCP URL and bearer
token (`checkRedeemed`: the URL must be a plain `http` or `https` URL in
normal form with only characters a shell takes literally, and the bearer
only token characters, before the bearer file or config is written; the
redeem test in packages/cli/test/hygiene-55be0661.test.ts). Other
room-supplied values go only into JSON files (config, journal, owner
record), whose encoding cannot be broken out of.

Not changed, and outside this request: the "Next: artroom ..." hints the
CLI prints name room-supplied IDs, cursors and, for a lane someone else
left, its scope globs, unquoted (packages/cli/src/format.ts and `held` in
main.ts). They are hints to read, not commands the CLI runs, but a pasted
hint from a malicious room could carry shell syntax. Quoting them is a
separate change.

## Request c657d4ba: joins and redemption

From simplification review 55563589 (SEC-01, SEC-02, SEC-07). Each
behaviour was wrong on main `a6330262`; the tests in
`test/workerd/request-c657d4ba.cases.ts` fail there (12 of 13; the 13th is
the control that other refusals are still recorded) and pass here.

| Finding or condition | Fix | Tests |
|---|---|---|
| (1) SEC-01: a client-custody redemption minted a read session for whatever admission returned, including the stored result of a join copied from the log | `admission.ts` `admit` says whether its result is a replay (`submit` wraps it). `redeem` issues a session only for a join that call admitted; a replay is refused `invitation-invalid`, and the key that joined can get a session with a signed request (R-CRED-5) | (1): a copied join replayed through `POST /redeem` gets no session; a replay over the Durable Object and over RPC gets none, while the act still replays and the key still gets a session; two identical redemptions at once give one session |
| (2) SEC-02: a `join` refused at steps 7 to 9 on `POST /acts` or `RoomWire.submit` was sealed with its envelope and `body.secret`, while the invitation stayed usable | `admit` never commits a refused join, on any path; the `recordRefusals` hook is gone | (2): `POST /acts`, refused by a policy rule, records nothing, keeps the secret out of the log and the idempotency table, leaves the invitation unused, and is judged afresh on retry; the same over RPC; control: a refused claim is still recorded |
| (3) SEC-07: the limit keyed unvalidated input, never evicted, put every service-binding caller under one address, and did not count joins on `/acts` | `src/ratelimit.ts`: an invitation is counted only when the room issued it; windows are per room, dropped when they end, and capped at 10,000 (a full table refuses new windows until one ends); a service-binding caller has no address (`Room.redeem` takes `string \| null`; the Worker passes null); `admit` counts every join against its invitation, so `/acts`, `RoomWire.submit` and both redemptions share one limit | (3): one limit across `/acts` and `/redeem`; `/acts` alone; room-custody redemption after joins on `/acts`; an unissued or malformed invitation opens no counter; 22 RPC redemptions are not limited by address; an HTTPS address is limited to 20; ended windows dropped and the cap holds |
| docs/protocol.md amended where R-ADM-8 and R-GEN-6 conflict | R-ADM-8 names the `join` exception; R-GEN-6, R-SEC-4 and R-CRED-9 say the same; section 31 lists the change | — |
| Root gates | See "Gates" below | — |

**Contract.** No types change. A repeated client redemption is now refused
`invitation-invalid` where it used to return `Joined`. The client's `join()`
recovers a lost response itself: it resubmits the same signed join, which
returns the original record (R-IDEM-2), and signs a `session` request with
the key. Its fake room refuses the repeat as the Room does, and
`packages/client/test/redeem.test.ts` covers the recovery. `room.ts`
changed by one line: the type of `redeem`'s `address`.

**Limits are in memory.** A restart of the room's object starts the counts
again. The protocol allows that; it requires the counters to be bounded.

**Mutations**, made one at a time on the committed head; 13 of 13 turned a
test red:

| Mutant | Red tests |
|---|---|
| `redeem` issues a session on a replay | (1), all three |
| `admit` never reports a replay | (1), all three |
| a refused join is recorded | (2), `/acts` and RPC |
| joins on `/acts` are not counted | (3), the three that mix or use `/acts` |
| a room-custody redemption is not counted | (3) room-custody; `roster.cases.ts` per-invitation limit |
| any string invitation is keyed | (3) unissued invitation; HTTPS address |
| a null address is counted | (3) RPC |
| the Worker passes a shared address | (3) RPC |
| ended windows are not dropped | (3) bounded; one limit across paths |
| no cap on windows | (3) bounded |
| the limit allows one more | (3), four tests |
| the address limit is removed | (3) unissued invitation; HTTPS address |
| the client's `join()` does not recover | client: lost join response |

The type check `typeof id !== "string"` in `limitInvitation` is not a
behaviour guard: a join whose invitation is not a string is refused at step
4 either way.

**Review of 812fb907 (report b3445eae): the client's clock.** The checker
found that the client's `join()` recovery signed its `session` request with
`Date.now`, not `ClientOptions.now`. A room on the supplied clock then
refused the request's `notAfter`. `recoverJoin` now takes the caller's
clock and reads it inside each attempt, so every retry of the session
request is signed afresh at the clock's current time. Recovery still
resubmits the original join bytes and idempotency key, still proves
possession of the key with a signed session request, and the Room still
refuses the replayed redemption.

| Test | What it pins |
|---|---|
| `test/workerd/checker-join-recovery.test.ts` (the checker's fixture, unchanged) | Recovery over RPC after an eviction and over HTTPS; "checker: join recovery honors the supplied client clock for its signed session request", which failed at 812fb907 |
| `request-c657d4ba.cases.ts`, "virtual clock: a lost join reply is recovered, and a session request retried after the clock moves is signed again at the moved time" | Against the real Room: the first session request fails retryably after the clock moves ten minutes; the retry's `notAfter` is ten minutes later and is accepted; the log holds one join |
| `packages/client/test/redeem.test.ts`, the two virtual-clock tests | The same two cases against the fake room |

| Mutant in `connect.ts` | Red |
|---|---|
| the session request is signed without the clock (`Date.now`) | the checker's clock test; the client's clock test |
| `Date.now` passed in place of `options.now` | the same two |
| the clock read once, before the retries | both "retried after the clock moves" tests |

The other clock reads in `packages/client/src` already use the injected
clock: `RoomClient` signs requests and judges session expiry with
`this.now()`, and `HttpWire` times calls with `opts.now`. The one remaining
`Date.now` is the default of the exported `signRequest`'s `now` argument,
for callers that have no clock of their own. It stays: every caller in the
package now passes its clock, and making the argument required would change
the public API. Envelopes carry no time, and the retry sleeps are delays,
not clock reads.

The three security repairs are unchanged. Main `7cf6aae0` (plan 003 and the
client hygiene request 55be0661) is merged into this head. The only
conflict was this README, resolved by keeping both report sections;
`room.ts` and `worker.ts` merged without conflict.

**Gates**, at the head of `request/sec-join` that adds this section:
`npm ci`, the client and Room typechecks and suites, the root
`npm run typecheck` and the root `npm test` exit 0. The Room's Node suite
passes 125 tests in 12 files, and its workerd suite 411 tests in 31 files.

## Request 3da1d82b: idle write storms

The row measurements of request 8bd623cc
(`packages/room/measure/results/row-costs-2026-10-02.md` on that branch)
found two storms. The tests are in
[test/workerd/idle-writes-3da1d82b.test.ts](test/workerd/idle-writes-3da1d82b.test.ts).
They run the real Room object through its real `alarm()`, and count its
storage writes with a spy installed on that object only: each SQL cursor's
`rowsWritten`, and each alarm the Room stores.

### What caused them

**An idle room published its own checkpoint every minute.** Each
publication seals a `checkpoint` event, which is itself unpublished
(R-LOG-8). `publicationDue` measured the minute from the first unpublished
entry, which after a publication is always that checkpoint, and `nextAlarm`
asked for an alarm a minute ahead whenever the head was past
`publishedThrough`. So every publication made the next one due: 7 rows a
minute, forever.

**A room whose repository was deleted ran its alarm every 5 seconds.**
Reproduced on main `b803d210` with the test's spy: after the smoke run's
cleanup deletes the fork and the canonical repository, the checkpoint
publication a minute later still stores its cohort (the publisher opened
before the deletion is cached), and its push fails with `NOT_FOUND`. A
pending cohort was on the 5-second loop in `nextAlarm`, with no backoff.
Each run reopened the publisher, failed with `NOT_FOUND` again, wrote
`publication_error` (1 row) and stored the next alarm 5 seconds ahead: 12
rows and 12 alarm runs a minute. The first run wrote 4 rows (the cohort and
the error). This matches the spike: rooms at head 16 published through 15,
writing about 12 rows a minute.

The 12 requests a minute are those alarm runs. `wrangler tail
artroom-spike-room` on the spike (version `75758995`, 2026-10-02 19:06 UTC,
before this change) showed only `Room` alarm events: 17 objects, each
alarmed every 5.0 seconds, all `ok`, with no fetch or RPC events.

### The fix

| Condition | Fix | Test |
|---|---|---|
| An idle room writes no rows | `publicationDueAt` counts only entries that are not `checkpoint` events; an idle room asks for no alarm | "after the last act's publication settles, a founded idle room writes no rows and stores no alarm over 24 simulated hours of alarm ticks" (also 120 forced `alarm()` runs: 0 rows, 0 alarms stored) |
| A checkpoint-only suffix is never due; a real act after it is published promptly | The same; a due publication is asked for 5 s from now at the soonest | "a checkpoint-only unpublished suffix is never due; a real act after it is due a minute later and is published, and then the room is idle again" |
| A failing publication backs off, capped, never every 5 s | `publication_retry` in `meta`: 5 s, doubling to 5 minutes (`ALARM` in [src/budgets.ts](src/budgets.ts)); the alarm does not publish inside it. A refusal by the registry (R-PUB-10) backs off the same way | "a failing publication backs off from 5 s, doubling, to a 5-minute cap …": waits of 5, 10, 20, 40, 80, 160, 300, 300 s; 17 runs in the first hour (the first try and its retries), 12 in each later hour; about one row each. "a publication the registry does not allow (R-PUB-10) backs off the same way" |
| A failing step backs off, capped | Each kind of loop work (ended workspaces' tokens, pins, previews, workspace setup, recomputation, landing with its evaluations, and, since mint lane B, the canonical mint ledger, `mints`; since request 02836f9a, the forks' read-token ledger, `forkTokens`) has its own durable backoff in `loop_backoff`: an alarm that ran it and left it failed or pending sets the next try 5 s later, doubling to 5 minutes; one that ran it cleanly clears it. See "Review 5b7aa2ba" below | "a failing step on the 5-second loop (a pin) backs off to the cap, and the backoff resets once it succeeds" |
| A room whose canonical repository is gone stops, with one admin item, keeping unknown effects and owed cleanup | A publication that fails with `NOT_FOUND` asks Artifacts for the canonical repository itself. If that is `NOT_FOUND` too, `canonical_gone` is stored and admins get one `log-publication-stalled` item with the new reason `repository-gone`. While it is set, publication is due only after a later entry, landing and the canonical mint ledger are neither scheduled nor run (the ledger's records are kept), and the loop does not count work that needs the repository. Nothing is deleted or settled: the pending cohort, the landing engine's owed revocations and pending pins stay. Lane B's fork, snapshot and job-token duties keep their own capped backoff. A confirmed publication clears it, and the item closes | "stops rescheduling work that cannot succeed …" (the alarm stops within 10 minutes; then 2 hours with no alarm and 0 rows); "a later act tries once more …"; "if the repository comes back …" |

`ALARM` is enforced as written in `src/budgets.ts` (copied unchanged from
request 8bd623cc's branch, so the two merge cleanly): 0 rows for an idle
room, the 5-second interval only while work makes progress, and a 5-minute
cap. In the first hour of a failure the ramp adds 5 runs to the 12 that
the cap allows: 17. Lane B's own backoffs (landing retries to 60 s, its
token cleanup and workspace duties to 5 minutes) are unchanged; each is
capped at 5 minutes or less.

**Live.** Deployed to the spike as `artroom-spike-room` `065d3189` on
2026-10-02. Before: 6,289 rows written in 30 idle minutes (18 rooms at 12
rows a minute each). After the smoke run and its cleanup: 0 rows written
by any `Room` object from 19:47 to 20:47 UTC. The 18 older rooms each ran
once or twice after the deploy, found their repository gone, and stopped.
The figures, the windows and the smoke record are in
[notes/deploy-spike.md](../../notes/deploy-spike.md), "Idle write storms
fixed (request 3da1d82b, 2026-10-02)".

**Contract and protocol.** `log-publication-stalled` gains the reason
`repository-gone` (additive; the UI's "Needs you" says what it means).
R-LOG-8 says that unpublished `checkpoint` events alone never make a
publication due; R-LOG-20 describes the gone repository. What a published
log contains, its order and its verification are unchanged.

**With request d268d249 (merge of main `99cc4044`).** Every failure path
this change adds that catches and discards an error logs it through
`RoomCore.diagnose`, as d268d249 does: the canonical-repository probe
(`publication-failed`, step `canonicalProbe`), next to d268d249's own
`publish` line, and every alarm step that fails with an error that is not
an `ArtroomError` (`step-failed`, the step's name; the failing pin is one).
A step that logs its own failure throws an `ArtroomError`, so nothing is
logged twice. While the repository is gone, the alarm's pin and preview
steps do not run, so a stray alarm neither fails nor logs. Each retry logs
at most one line, so the logs back off with the retries.

**Review 5b7aa2ba (checker, changes requested at `12227d41`).** Two P2s,
both fixed; the checker's two controls pass.

1. *A registry lookup outside the failure handler.* `publish` awaited
   `isBound` before its handler, so a registry that threw recorded no
   backoff, and the alarm came back every 5 seconds. Every await on the
   publication path, the lookup included, is now inside the one handler,
   which records the backoff for any failure. A room the registry does not
   bind still fails closed: nothing is pushed, a forced publication still
   answers `forbidden`, and that answer is not logged as a failure; a
   lookup that throws is logged. The parallel place was the landing step:
   `resumeLanding` returned quietly when the room was not bound, and a
   throwing lookup or canonical-remote read left the engine's accepted
   operation due at once. Both now fail the step, which backs off; the
   engine's own failures stay on the engine's own backoff (`landingReached`).
2. *Loop work retried before its backoff.* The backoff was one count,
   applied only to the next alarm time, so an alarm due for other work ran
   every step. Each kind of loop work now has a durable due time, checked
   when the alarm runs (`runAll`): a kind whose backoff has not ended is
   skipped, and every other due step still runs. The next alarm is the
   earliest due time of all work, each kind's included. A commit's own run
   of a step (`run`) is not held back by an earlier failure's backoff.
   While the repository is gone, workspace setup waits too.

One existing test changed with the second fix:
`review-a711f7b6.cases.ts`, "Artifacts is down: … the next alarm completes
it", ticked again at the same instant after the failed read of the
canonical remote. That read now backs the landing step off for 5 s, so the
test moves the clock to the next alarm the room asks for, and the
operation lands there, as the test's name says.

| Test | What it pins |
|---|---|
| "publication on a cold instance whose registry throws …" and "… answers not bound …" | An evicted instance (no cached binding): waits of 5, 10, 20, 40, 80 s; no push; nothing published; one backoff per run; logged only for the throw; published once the registry answers |
| "landing on a cold instance whose registry throws …" and "… answers not bound …" | An accepted operation due at once: no alarm closer than 5 s, at most 8 landing tries in 10 minutes, main unmoved, no push; lands once the registry answers |
| "a failed pin keeps its backoff when a lease expiry fires the alarm 1 s later …" | The checker's case: `pinRef` not called again, the lease expires, the pin's due time unchanged, and the next alarm is the pin's; at that time the pin is tried |
| "… when a notification retry fires the alarm first", "… when a check job's deadline fires the alarm first" | The notification is tried again and the job sent again; the pin is not |
| "workspace setup waits, kept, while the canonical repository is gone" | No fork is asked for; only the lease's expiry is scheduled |

**Mutations**, made one at a time on the code at the head that adds this
review's fixes; 31 of 31 turned a test red. They were run against this
request's tests and `phase2b.cases.ts` (for the engine's own failures):

| Mutant | Red |
|---|---|
| a checkpoint-only suffix counts as unpublished work | idle room; checkpoint suffix; pin step |
| the publication retry does not double | publication backoff; registry refusal |
| the publication retry time is ignored | publication backoff; registry refusal |
| the alarm publishes a pending cohort inside its backoff | gone: stops |
| a gone repository is never detected | all three gone tests |
| a gone repository does not stop publication | gone: stops; gone: a later act |
| landing is scheduled while gone | all three gone tests |
| landing runs while gone | gone: stops |
| the loop schedules the repository's work while gone | all three gone tests; gone: workspace setup |
| the loop backoff does not double | pin step; both cold landing tests |
| the loop backoff is never recorded | pin step; both cold landing tests; the three earlier-alarm cases |
| the loop backoff is never reset | pin step |
| the `repository-gone` item never closes | gone: comes back |
| a due publication is asked for at once | checkpoint suffix |
| an item for every gone failure | gone: a later act |
| a confirmed publication does not clear gone | gone: comes back |
| alarm step failures are not logged | pin step |
| the gone probe is not logged | gone: stops |
| pins run while gone | gone: stops |
| previews run while gone | gone: stops |
| workspace setup runs while gone | gone: workspace setup |
| the registry lookup is outside the publication handler | registry refusal; both cold publication and both cold landing tests |
| a not-bound publication returns without a backoff | registry refusal; cold publication and cold landing, not bound |
| a not-bound answer is logged as a failure | cold publication, not bound |
| the landing step returns quietly when not bound | cold landing, not bound |
| a landing failure before the engine is not counted | both cold landing tests |
| the engine's own failures back the landing step off | `phase2b.cases.ts`: the instance stops while the push is in flight |
| the alarm runs loop work inside its backoff | lease expiry, notification and job deadline cases; cold landing, throws |
| the next alarm ignores a kind's backoff | pin step; lease expiry and job deadline cases |
| the next alarm ignores the landing backoff | both cold landing tests |
| the landing backoff is cleared when it did not run | both cold landing tests |

## Request d268d249: diagnosable pre-admission failures

During the D5 redeploy (request 73eccbec), a `propose` got 503
`unavailable`, "The repository could not be read", after 59 seconds, and
the cause could not be found: `preAdmission` in `src/admission.ts` caught
every error from its reads and discarded it (`void e`). It still answers
the same way, but now it also writes one line to the Worker's log.

**What is logged.** One JSON line through `console.error`, which Workers
Logs keeps (`observability` is on in both Wrangler configurations):

```json
{"event":"pre-admission-failed","step":"propose.pinObjects","name":"ArtifactsError","message":"git fetch https://<credentials>@artifacts.example/ns/repo.git?<query> failed with <token>; Authorization: <redacted>"}
```

`step` names the read that threw:

| Act | Steps, in order |
|---|---|
| `propose` | `propose.headInFork`, `propose.pinObjects`, `propose.readMain`, `propose.diff`, `propose.readConfig` (only when `.artroom/` changed), `propose.changedBetween` (earlier generations) |
| `check` | `check.treeOf`, `check.snapshot` (a scoped check's filtered input) |
| `land` | `land.readMain`, `land.refreshMain` (only when the landing engine has not recorded main) |

`name` is the error's name (or the type of a thrown value that is not an
error), and `message` is its message, redacted and at most 300 characters.
The client still gets exactly the old 503: the same code, message,
`retryable: true` and `maybeRecorded: false`. Admission decisions and
retries do not change: nothing is recorded, and the same signed act is
admitted on retry.

The helper is `src/diag.ts` (`redact`, `diagnosis`, `report`). The Room
calls `RoomCore.diagnose(event, step, error)`, which writes to
`RoomServices.diagnose` when it is given (tests capture records there) and
to the console otherwise. A sink that throws never changes the response.

**Redaction.** `redact` replaces, in this order. Rules 1 to 7 know a
credential by its syntax and redact it whatever its length or entropy.

1. Artifacts tokens, `art_v<n>_…` with any `?expires=<n>`: `<token>`.
2. URL userinfo: `https://<credentials>@host`.
3. Any query string, with or without a scheme: `?<query>`.
4. `Authorization`, `Proxy-Authorization`, `Cookie` and `Set-Cookie`
   values, plain or JSON (`"authorization": …`), to the end of the line:
   `<redacted>`.
5. Every IANA authentication scheme except `token`, which is common in
   prose (`Bearer`, `Basic`, `Digest`, `DPoP`, `Negotiate`, `NTLM`, `OAuth`,
   `AWS4-HMAC-SHA256` and the rest): the credential, at any length, to the
   next space; a parameter list (`Digest username="…", …`) to the end of
   the line.
6. A pair whose name contains token, secret, password, passwd, passphrase,
   pwd, auth, key, signature, sig or credential, as `name=value`,
   `name: value` or JSON `"name": value`: the whole value. A double- or
   single-quoted value is parsed with its backslash escapes, so spaces and
   escaped quotes inside it go too. A value that opens with an escaped
   quote (JSON inside a string) goes to the end of the line. A bare value
   goes to the next space. It fails closed: a quoted value with no closing
   quote, because it is malformed or was cut by the input bound, goes to the
   end of the text.
7. Credentials known by a prefix or a delimiter: GitHub (`ghp_`,
   `github_pat_` and the rest), Slack (`xox?-`), Stripe (`sk_live_` and
   the rest), AWS access key IDs, Google API keys (`AIza`), JSON Web Tokens
   (`eyJ…` with a dot), a Slack webhook's path, and a private key block to
   its END line or, cut, to the end of the text: `<secret>`.
8. Every format detector of the secret scan (`src/secrets.ts`, R-SEC-1),
   as a fallback: `<secret>`. A match that already holds a marker (the
   password detector on `password: <redacted>`) is left as it is.
9. Long tokens the secret scan judges random (`highEntropy`), as a
   fallback: `<secret>`. Commit IDs, key IDs and room IDs stay, because
   diagnoses need them.

The error's name goes through the same redaction as its message. A message
longer than 4,096 characters is cut at the last space before that point,
before redaction, so no part of a token is left at the cut; a quoted value
the cut opens and does not close is redacted to the end (rule 6). The
result is cut to 300 characters. The Room's retained check-job errors
(`src/jobs.ts`: the lost mint's `answer lost`, the unknown mint's
inventory note, a failed revocation) used their own token-only redaction;
they now use this one.

**Thresholds kept.** Only fallbacks keep a length or entropy threshold. The
random-token check needs 32 characters and more than 4.2 bits per
character. The secret scan's detectors keep their format lengths (for
example 36 characters after `ghp_`, three JWT segments of 8 or more);
every syntax they recognise is matched first by rules 4 to 7 at any
length. The 4,096- and 300-character bounds limit text, not credentials.

**Review e6a9016b (changes requested, P1).** The checker found at
`0e058f13` that the pair rule stopped at a space or a quote inside a
value, and the scheme rule ignored credentials shorter than eight
characters: `password: "horse battery staple"`,
`JSON.stringify({ password: 'horse"battery' })` and `Bearer abcd` reached
the diagnosis. Rules 5 and 6 above are the repair, rule 7 removes the
same kind of exemption from prefixed formats, and the fail-closed cases
are new. With `src/diag.ts` put back as it was at `0e058f13`, the new
tests fail: 37 of the 59 Node tests and 13 of the 38 Room tests.

**Parallel places.** Every catch on the act paths that maps an error to a
5xx and discards it was checked.

| Place | Client sees | Now logged as |
|---|---|---|
| `Room` RPC `wire`, every method (`submit`, `request`, `redeem`, `bearerAct`, `bearerRequest`, `read`, `poll`, `found`, `publishLog`, `jobTokenDuties`, `tick`): an error that is not an `ArtroomError` | 500 `internal`, fixed message | `rpc-failed`, step the method's name |
| `Registry.bind` (no services, so to the console directly) | 500 `internal` | `rpc-failed`, `registry.bind` |
| `route` in `src/http.ts` (the Worker's HTTPS routes) | 500 `internal` | `http-failed`, `route` |
| `mcpEndpoint` in `src/mcp.ts`, outside a tool call | 500 `internal` | `mcp-failed`, `mcp` |
| `RoomCore.found`: repository create, main, remote; main's config; sealing the new repository | 503 `unavailable` | `found-failed`, `newRepository`, `readMain`, `canonicalRemote`, `readConfig`, `sealCanonical` |
| Preview computation | the proposal's preview `failed` | `preview-failed`, `preview` |
| Log publication | 503 `unavailable`, with the error's code | `publication-failed`, `publish` |
| `proposal` read completing a pinned ref | 503 `unavailable` | `read-failed`, `completePins` |

`route` and `mcpEndpoint` take the sink as an optional last argument,
console by default. `wire` takes an optional callback for errors that are
not `ArtroomError`s; an `ArtroomError` is not logged, because its own
message already reaches the client.

Left unchanged, with the reason:

| Place | Why |
|---|---|
| `admit` and `redeem`: "The room is busy" after six attempts | No error is discarded: the cause, the log moving under each attempt, is the message |
| `admission.ts` "The diff was not computed" | Not a catch: a missing pre-admission read, an internal invariant |
| Catches that map to 400 or 401 (envelope, request and redemption shapes, JSON bodies, read cursors, room names in URLs, WebSocket tokens and cursors) | Not 5xx: the cause is the client's input, and the message says what is wrong |
| `RoomCore.kick`, `runAll`, `Room.alarm`, the constructor's `recover`, `schedule`, `wake` | Background work, not an act's response. Each step leaves its durable state and the alarm retries it. Logging every retry is a separate decision about volume |
| Job issue and preparation (`src/jobs.ts`), notify evaluation | Background and retried; they keep a `last_error` of safe metadata only (request d29c09fa: `errorNote`, never redacted text) |
| `foundingDue`, `nextAlarm`, `simulate`, founding's `refreshMain` after the seal | Scheduling reads, control flow, or background work retried by the alarm |
| `src/worker.ts` RPC entry (`RoomWireTarget`, `Artroom`) | No catch: `unwire` rethrows the Room's `ArtroomError` to the caller |

**Tests.** `test/workerd/request-d268d249.cases.ts` (38 tests) and
`test/node/diag.cases.ts` (59 tests).

- One test per pre-admission step (10). Each fails the step once at the
  Artifacts port (`failNext`, which now takes the error to throw) or, for
  `land.refreshMain`, on the room's landing engine. It checks that the
  client gets exactly the old 503, that nothing is recorded, that exactly
  one diagnosis names the step and the error's name, and that the same
  signed act succeeds on retry.
- Redaction through a real Room's `propose.pinObjects` failure, with the
  same four controls: an error carrying an Artifacts token with its expiry,
  URL userinfo, a URL query, an Authorization header, a GitHub token and a
  JWT; a 10,000-character message cut to 300; 14 syntax cases, one test
  each (quoted passwords with spaces and with escaped quotes, a JSON
  password, short Bearer and Basic credentials, a short Authorization
  header, a one-character pair, a short GitHub token, a short JWT, a
  private key block, and the checker's three controls verbatim); and a
  credential in the error's name.
- Retained job errors, through the real Room: the canonical repository's
  `createToken`, `listTokens` and `revokeToken` throw an error with every
  syntax case in its message and a Bearer credential in its name. All
  three `last_error` sinks in `src/jobs.ts` are checked: none holds a
  credential. Since request d29c09fa they keep safe metadata only, and
  the test checks that too, with every row of every table.
- Redaction, unit: one case per rule and form (39 cases), the checker's
  three controls through `diagnosis`, a credential in the error's name,
  the input bound cutting a quoted value, identifiers kept, the
  300-character bound, the cut at a space, names of non-errors, and a
  throwing sink.
- One test per parallel place, with the founding steps `readMain`,
  `canonicalRemote` and `readConfig` each tested. The registry test spies
  on `console.error` inside the test only, which also shows that the
  default sink writes one JSON line with exactly `event`, `step`, `name`
  and `message`.

**Mutants**, one at a time, running both new test files (scripts and logs
under `/private/tmp/claude-501/preadm/`). Every mutant turned a test red.

The first 37, on `60f825db`:

| Mutant | Red |
|---|---|
| each of the 10 step labels changed | that step's test (`propose.pinObjects` also the redaction test) |
| `preAdmission` does not log | the 10 step tests and both end-to-end redaction tests |
| each redaction rule removed (8), the expiry part of the token rule, the message not redacted | the unit case for the rule; the end-to-end redaction test for the token, userinfo, query and Authorization rules |
| no 300-character bound; bound 400 | the unit bound test and the end-to-end long-message test |
| no cut at a space | the unit cut test |
| a sink's error escapes | the throwing-sink test |
| `wire` does not report | the RPC test and the registry test |
| the Room's RPC label changed | the RPC test |
| the HTTPS route, MCP endpoint, registry, preview, publication or pin read does not log | that place's test |
| founding labels `readMain`, `canonicalRemote` changed; `readConfig` not logged | that step's founding test |
| `RoomServices.diagnose` ignored | 19 workerd tests |

For review e6a9016b, 35 mutants of the redaction's new guards, on
`bc0a56c9`:

| Mutant | Red |
|---|---|
| no double-quoted value; no single-quoted value | 15; 4 (Node and Room) |
| double or single quotes ignore escapes | 6; 3 (Node and Room) |
| an unclosed quote not to the end; nor one ending in a backslash | the unit fail-closed cases (3; 1) |
| no escaped-JSON value; separator without an escaped quote | the unit JSON-in-a-string case |
| bare value stops at separators (as at `0e058f13`) | the unit separator case |
| bare value needs 8 characters | 7 (Node and Room) |
| header value needs 12 characters | 3 unit cases |
| scheme credential needs 8, or 5, characters | 11 each (Node and Room, the checker's short Bearer included) |
| no scheme parameter list; schemes only Bearer and Basic | the Digest case; the Digest and DPoP cases |
| no `auth` or `passphrase` name | that unit case |
| a detector replaces a marker | 19 |
| no prefix rule; prefix rule needs 20 characters | 7 each (Node and Room) |
| each prefix removed (GitHub classic and fine-grained, Slack, Stripe, AWS, Google) | that unit case (GitHub classic also the Room case) |
| no JWT rule; no webhook rule | 2; 1 |
| no private key block rule; the block not to the end | 3 (Node and Room); the cut-block case |
| the error's name not redacted | the unit and Room name tests |
| each of the three job-error sinks not redacted; the jobs' token-only redactor back | the Room job-error test |

Not covered by a test: the founding labels `newRepository` and
`sealCanonical`. They need a public founding with an injected create
failure, and a new repository that still owes cleanup; the founding tests
own those setups. The code that logs them is the same as for the tested
labels.

**Gates.** Earlier gate counts in this section's history (157 Node and
440 workerd tests) were measured at `264bc6f2`, before main `b803d210`
(D5) was merged; that merge removed 15 workerd tests with the legacy code
it retired. At the head of `request/preadm-diag` that adds this paragraph
(the code is that of `bc0a56c9`; the head changes only this README): the
Room's `npm run typecheck`, `test:node` (197 tests in 14 files) and
`test:workerd` (441 tests in 34 files), and the root `npm ci`,
`npm run typecheck` and `npm test`, exit 0. The workerd output's
`uncaught exception` lines come from rejected RPC calls that tests expect.

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
2. **Check carry decisions, runner environments, snapshot commits.**
   Resolved by contract amendment 3. What is still open is listed under
   "Amendment 3 (request 23b96a18)".

## Not done

- Deployment itself, an operator command to sign onboarding grants, and
  measurements on Cloudflare. The "Deployed" column is pending for every
  case, under its own task.
- Attention is a simple projection: review and check requests, objections,
  notes, landing outcomes, lanes left unheld, revert lanes and notify items.
