> **Inactive.** This package is parked source of the earlier model: it is not built, tested, exported, released or deployed. See [`parked/README.md`](../README.md) for what replaces it and when it is removed.

# @generalbusiness/artroom-git

Artroom's git engine: lane forks and tokens, pinned heads, bounded path
diffs, merge previews, and the durable landing operation. It implements lane
B of the [plan](../../notes/2026-10-01-artroom-plan.md) (sections 6, 8 and
9) and the [protocol](../../docs/protocol.md) rules R-LAND, R-PUB, R-PROP,
R-PATH, R-EXEC, R-WS and R-REV-5.

The Room (lane A) hosts it. This package has no Room of its own: it asks the
Room for lane facts and authority through one small interface, and the Room
asks it to reserve, prepare, publish and reconcile.

It depends on `@generalbusiness/artroom-contract` (lane 0) for its types.

## What is in it

| Part | File | What it does |
|---|---|---|
| Landing operation | `src/landing/` | The durable state machine of plan section 8: one SQLite record per landing, reservation in one synchronous transaction, one publication slot, complete-forward recovery, abort attempts |
| Workspaces | `src/workspace/workspaces.ts` | One Artifacts fork per lane; one write token per lease generation, scoped to the fork and expiring with the lease; revoked on release, expiry or take-over |
| Pinning and previews | `src/publisher/client.ts` | Copies a proposed head into the canonical repo and pins it at `refs/artroom/heads/<lane>/<generation>`; merge previews, with the integration commit the landing would push |
| Filtered snapshots | `src/publisher/gitops.ts` (`listTree`, `writeSnapshot`), `container.ts` | For scoped checkers (lane G): the fixed snapshot commit of R-CARRY-15 (exactly the chosen files, no parent, author and committer `Artroom Snapshot <snapshot@artroom.invalid>` at time 0), written into its own new, empty repository at `refs/artroom/snapshot` only. A repository that already has any ref is refused, so nothing is ever added to one (R-CARRY-16) |
| Snapshot repositories | `src/snapshot/repos.ts` | One Artifacts repository per snapshot commit, reused only for it; one read token per job, for that repository only, expiring by the job's deadline (R-CARRY-16). The cleanup ledger follows the workspace one: each create attempt is an in-flight step with its own name, recorded before it is sent and closed only by a definite answer or by seeing (then deleting) its repository; token revocation and repository deletion are owed and retried until Artifacts confirms. A `wake` callback (the Room's alarm) is set before each create. The Artifacts port (`src/artifacts.ts`) has `create` and `delete` for this |
| Path diffs | `src/diff/treediff.ts` | Changed paths through the Artifacts binding: bounded, cached by tree hash, with merge bases, exact renames, and the overlap test that decides whether a preview needs the sandbox |
| Publisher sandbox | `src/publisher/container.ts`, `gitops.ts` | A Durable Object that owns a container with git only. Every git command is hardened; no repository code runs |
| Log remote | `src/publisher/container.ts` (`pushLog`, `readLogRef`), `log-push.ts` | Pushes lane L's log commit to `refs/artroom/log` under a lease, answering with lane L's `PushOutcome`; reads the ref back |
| Gateway and ref fence | `src/publisher/container.ts`, `ref-fence.ts` | The container's only way out. It adds each operation's token and lets a push through only if every ref update is the one that operation allows |
| Publisher entry | `src/publisher/container.ts`, exported as `@generalbusiness/artroom-git/publisher` | `Publisher` and `ArtifactsGateway`, which the Room Worker hosts |
| Measurement harness | `measure/harness/` | Worker `artroom-lb-git`: the publisher, plus a key-protected stand-in Room for live measurements. Not deployed, not gated (see "Live runs") |
| Container image | `container/` | `image.sh` copies `alpine/git` into Cloudflare's registry (no Docker needed); `Dockerfile` for machines with Docker |

## The landing operation

```
accepted → preparing → ready → publishing → landed
                │         │         │
                │         │         └→ unresolved → landed | aborted
                └─────────┴→ retryable | failed
```

- **Preparation runs in parallel.** `prepare` builds the integration commit
  in the publisher sandbox: the head itself if it fast-forwards main,
  otherwise a merge commit with parents (main, head), the message
  `Land <lane> generation <g>`, and both dates at the later parent's commit
  time. Every input is fixed by (main, head, lane, generation), so a
  preview, a retry and a fresh sandbox all build the same commit. The
  commit is stored in the canonical repo at
  `refs/artroom/integration/<op>/<attempt>`, so checkers and every later
  push use exactly that commit. The Room then answers `readiness`: are the
  obligations met, and do the land rules pass on the prospective
  reservation input (`stage: "reservation"`)? That answer may await (policy
  evaluation, SHA-256), so it runs outside any transaction and is applied
  only if the operation has not moved on meanwhile. On `ready` the engine
  keeps the Room's `RetainedLandInput` (canonical bytes and digest); the
  digest is `ready.landInput`. Each evaluation takes a durable revision, and
  only the latest revision's answer is applied: an older answer that
  arrives late is dropped, whatever it says. A ready operation whose newer
  evaluation is still out is not reserved until it answers.
- **Reservation is the one decision point** (R-LAND-7). `reserve` is one
  synchronous SQLite transaction. It re-checks the lane, the policy version
  and main, and asks the Room to re-check authority and evidence and to
  compare the reservation-stage land input, rebuilt now, byte for byte with
  the retained bytes (`revalidate(op, retained)`; the policy package's
  `matchesRetainedLandInput`). Nothing in it hashes, evaluates policy or
  awaits. Then it takes the next publication number, holds the room's
  single publication slot, and records `land-reserved`. After this the landing
  cannot be cancelled by ordinary acts (R-LAND-8).
- **Publication completes forward** (R-PUB-5). `publish` mints a 60-second
  canonical write token through the canonical mint ledger (`MintLedger`,
  protocol section 32), records its ID and claims it from the ledger in one
  transaction (`pushToken`, which also writes the token's
  `artroom_land_token` row), pushes
  `--force-with-lease=refs/heads/main:<expectedMain>`, revokes the token,
  and reads main back. Only the read-back decides:
  - main is the integration: `landed`; the slot is released;
  - main is still `expectedMain`: `unresolved`; the slot stays held and the
    same push is retried with backoff;
  - main is anything else: `unresolved`, flagged as another writer; pushing
    stops.
- **Nothing is released on elapsed time** (R-PUB-2). Not token expiry, not
  a lost container, not hours of failed retries. See the measurement note
  [2026-10-01-laneB-token-inflight.md](../../notes/2026-10-01-laneB-token-inflight.md):
  revoking a token does not stop a push the receiver has already received.
- **Abort attempts** (R-REV-5). `abort` stops forward pushes at once;
  `enforceAbort` revokes the publication tokens, even while a push is in
  flight, and records `abort-attempt`. The outcome is then `landed` (with a
  revert lane), `aborted` only if every push attempt ended with an outcome
  that shows nothing was applied, or `unresolved`.
- **Crash recovery** (R-PUB-7). `reconcile` is the Room's alarm handler. It
  resolves a held slot first: it revokes tokens a dead instance left live,
  reads main back, and pushes forward if needed. Then it reserves the next
  ready operation and restarts preparations.

### How the Room uses it

```ts
const landing = new Landing({ sql: durableSql(ctx.storage), room, publisher, tokens });

// In the transaction that admits a `land` act (R-LAND-1):
const op = landing.accept({ id, lane, generation, head, act, leaseGeneration, policyVersion });

// In the transactions that admit other acts:
landing.laneChanged(lane, "released");     // or "generation-moved", "lease-changed", …
landing.policyActivated(version);
const after = landing.after();             // stamp `after` on receipts while the slot is held (R-LAND-8)
landing.abort(trigger, key, seq);          // a `compromised` revocation of evidence or the initiator

// Work, from requests or the alarm:
await landing.prepare(op.id);
landing.reserve(op.id);
await landing.publish();
await landing.reconcile();                 // alarm(); then setAlarm(landing.nextDue())

// Reads:
landing.view(op.id);    // the contract's LandOp; never a token
landing.slot();         // the contract's PublicationSlot
landing.status();       // for admins: "publication unresolved since …", push attempts, another writer
```

`room` implements `LandingRoom` (`src/landing/types.ts`): lane facts, the
active policy version, `revalidate` (synchronous) and `readiness`
(asynchronous), `revertScope`, and `record`, which appends a system event to
the log inside the engine's transaction. After a check arrives, the Room
calls `await landing.evaluate(op.id)`. `publisher` is `ContainerPublisher` in a Worker, or
`GitPublisher` over local git in tests. `tokens` is
`publicationTokens({ mints, repo })`, over the room's one `MintLedger` (built
once per object start, so its constructor takes over what a stopped object
left). The host's alarm also runs `mints.reconcile()` and includes
`mints.nextDue()` in its next alarm. `ContainerPublisher` and `Pinning` take
the same ledger (`mints`): since mint lane C, every canonical token they use
(staging an integration, pinning, previews) is minted and revoked through
it. The lane fork's read token for pinning is not a canonical token: since
request 02836f9a it is minted and revoked through the fork's own ledger,
`ForkTokens`, which `Workspaces` builds and owns (`workspaces.forkTokens`)
and `Pinning` takes as `forkTokens`. It follows the same rules, per fork:
a record and a wake-up before each create, a retry only as a new record, a
lost answer kept as unknown and watched, a failed revocation owed by ID.
The host's alarm runs `forkTokens.reconcile()` and includes
`forkTokens.nextDue()` in its next alarm.

## Previews

`Pinning.preview(lane, generation, head)` runs the same planner as the
landing in the sandbox. A clean answer carries `integration`: the head
itself when it fast-forwards main, otherwise the merge commit, which the
preview stores at `refs/artroom/objects/<integration>` (so the preview's
token is a write token, allowed to create exactly that ref). If main has
not moved when the operation is prepared, the landing builds and pushes
that same commit.

## Log remote (lane L)

The publisher's `pushLog` and `readLogRef` are lane L's `GitRemote.push`
and `GitReader.readRef`, as lane A's log remote calls them
(`LogRemoteStub`):

```ts
pushLog({ canonical: { remote, token }, objects: [{ type, data /* unpadded base64url */ }], ref: "refs/artroom/log", next, lease })
  → { ok: true } | { ok: false, reason: "lease-mismatch", current } | { ok: false, reason: "refused", code, detail }
  | { ok: false, reason: "unknown", detail }
readLogRef({ canonical: { remote, token }, ref: "refs/artroom/log" })
  → the commit ID, or null when the ref does not exist; throws when it cannot be read
stageLog({ canonical: { remote }, cohort: next, want: [{ sha, type, size }], parts: [{ sha, type, size, offset, data /* base64url */ }] })
  → { ok: true, missing: [{ sha, have }] } | { ok: false, detail }
```

`stageLog` is lane L's `GitRemote.stage`, for a publication larger than
one call (the active segment alone can be). It needs no token and makes
no network request. A whole object is written after git checks its type
and ID; a part of a larger object is appended, in order, to a staging
file for that cohort. Every call then settles the staging (see Review
de5289a5 below): a complete file is written as an object, ID checked.
A part already stored or out of order is skipped; the answer
says how many bytes of each wanted object are staged, so the caller
resumes there. Staging another cohort discards the previous cohort's
partial files. A restart loses staging; `pushLog` then answers `unknown`
("stage it again") and lane L stages again before its next attempt.
The default call size is 8 MiB: measured live, parts of 6, 8 and 12 MiB
crossed the Durable Object RPC, and 16 MiB parts exhausted a Durable
Object's 128 MB memory.

For each call the caller mints a token of at most 60 seconds (write for
`pushLog`, read for `readLogRef`) and revokes it after.
The sandbox checks the request (only `refs/artroom/log`, commit IDs, at
most 100,000 objects and 8 MiB in one call: `LOG_PUSH_LIMITS`), writes
the objects, and sends nothing unless `next` is a commit, checked by its
exact type, whose only parent is `lease` (none when `lease` is null) and
whose whole history is present. The bound is on one call, not on the
log: lane L's publisher sends only the objects its lease does not hold,
and stages a publication over one call first (below). It then pushes
through the
same lease push as `main`, and the gateway lets through only
`refs/artroom/log: lease → next`. The answer maps the publisher's push
outcome conservatively:
- only a confirmed push is `ok`;
- a lease refusal whose current value was read back is `lease-mismatch`;
- any other refusal is `refused` (contract amendment 4, R-LOG-20): a
  `[rejected]` or `[remote rejected]` status, or an Artifacts code that
  Artifacts answers before it updates any ref (below). `code` is the
  Artifacts code, or the kind of status (`remote-rejected`,
  `non-fast-forward`);
- everything else, including a request refused before git, is `unknown`.

Lane L reads the ref back after every answer but `lease-mismatch`.
`refused` proves only that this attempt did not apply: an earlier attempt
whose answer was lost may still land. Revocation or elapsed time never
proves an unresolved push did not land.

Reading back: live, the Artifacts binding's `log({ ref: "refs/artroom/log" })`
returns nothing even when the ref is there (it resolves branches, tags
and commit IDs). `readLogRef` uses `git ls-remote`, which sees it; the
gateway allows no ref update on that call. Objects are read by ID through
the binding, re-encoded and accepted only if they hash to the ID. Live,
`readCommit` and `readTree` throw (an internal error, not null) for an
object of another type, and `readBlob` returns null for a non-blob, so a
reader must treat a throw as "not this type" and try the next. With that,
lane L's `verifyLog` passed over the binding (the live test was retired by
decision D5; the spike deployment's log publication and `artroom verify`
cover it: [notes/deploy-spike.md](../../notes/deploy-spike.md)).

## Workspaces

```ts
const ws = new Workspaces({ sql, artifacts: env.ARTIFACTS, canonical: "acme-web", namespace: "acme" });
ws.open(lane, leaseGeneration, leaseExpiresAt);   // public WorkspaceOp: pending (call again to renew)
await ws.provision(lane);                          // fork (retrying 10400), settle cleanup owed, mint the lease's token
ws.view(lane);                                     // ready: remote and lease generation, never a token (R-WS-1)
ws.grant(lane, leaseGeneration);                   // the token, after the Room has judged the caller (R-WS-2)
await ws.revoke(lane, leaseGeneration);            // release, expiry or take-over of that lease (R-WS-3)

// The Room's alarm (alongside landing.reconcile()):
await ws.reconcile();                              // run the duties that are due (cleanup, and checks on unanswered steps)
const next = ws.nextDue();                         // set the next alarm to the earlier of this and landing.nextDue()
```

- **One durable protocol for remote steps and cleanup.** Every
  non-idempotent remote step (creating a fork, which comes with a 24-hour
  token; each attempt to mint a lease token; every retry of either) is
  written to SQLite as *in flight* before it is sent. It becomes *answered*
  only on a definite answer: success, or an Artifacts error that says the
  request was refused and changed nothing (`ALREADY_EXISTS`,
  `INVALID_INPUT`, `INVALID_REPO_NAME`, `INVALID_TTL`, `NOT_FOUND`). A
  transport failure or Artifacts' `INTERNAL_ERROR` (10400, seen after a
  fork was created) proves nothing, so the step stays in flight. Cleanup is
  *owed* as an inventory (revoke every active token except the one a ready
  or installing lease recorded) or one known token. An inventory that
  succeeds settles every owed inventory and every step answered before it
  started. A step still in flight is never settled, by a snapshot or by
  elapsed time: it keeps an inventory on a capped backoff (every minute at
  first, then every 30 minutes), which revokes whatever it creates. A known
  token's debt also ends once that token has expired. Each duty ends
  *done*, with its reason.
- **Ready means swept.** Provisioning settles what is owed, mints once per
  attempt (never a hidden retry), records the token, and then runs an
  inventory that started after the token was recorded. Only when that
  succeeds is the workspace ready, so a mint that applied and then answered
  with an error cannot leave a second live token. A step still in flight
  from a stopped host, or one that failed without a definite answer, does
  not block a new lease; its inventories revoke anything it creates.
- **Results are fenced by lease.** Provisioning and cleanup of one fork
  run one at a time, so cleanup never revokes a token being installed, and
  a late error or a late release of an old lease never changes a newer
  lease's workspace.
- **Only a real fork is used.** A repository at the lane's fork name is used
  only if its source is exactly `artifacts:<namespace>/<canonical>`. Any
  other repository there is refused, and cleanup never touches it.
- **A token never outlives the lease.** The lease is read again after every
  await, including a renewal that arrives while the token is being minted.
  A token whose actual expiry runs past the lease, or that was minted for a
  lease that has ended or changed hands, is revoked; a replacement is
  minted only if Artifacts' 60-second minimum still fits. Tokens end 5
  seconds inside the lease. `grant` refuses an expired lease.

## Tests

From the repository root, after `npm install`:

```sh
cd packages/git
npm run typecheck            # wrangler types, then tsc for src and for the Node tests
npm test                     # Node, one process: real git and node:sqlite
```

The tests run in one process (`--test-isolation=none`). They were serial
before for no recorded reason: each test has its own temporary directory
and its own SQLite, and the suite also passed with files in parallel.

- `test/gitops.test.ts` runs the publisher's exact git commands against
  real git and local bare repositories. The repositories are written as
  files by `test/support.ts` (git objects built and hashed in the test
  process), so the processes a test starts are the commands under test,
  git's own answer where it is the oracle, and the controls.
- `test/landing.test.ts` runs the landing engine on real SQLite and the
  canonical repository in memory (`MemoryCanonical`). Each test name
  starts with the plan's acceptance case or the rule it shows.
- `test/git-publisher.test.ts` runs one script through the git publisher
  over real git and through the memory repository, and compares every
  answer, the merge commit included. It also lands a lane through the
  engine and real git, across a restart with a fresh sandbox.
- `test/treediff.test.ts` reads trees from memory and asks git where git
  is the oracle.

Removed with request ecbc722a, because the root gate never ran them:

- `test-workers/` ran the engine in a stand-in Room under workerd. The
  production Room hosts the engine now, and its own workerd tests
  (`packages/room/test/workerd/`) abort the real object and run its
  alarms. The gateway's refusals, which only that suite tested, are in
  `test/ref-fence.test.ts` (`gatewayFetch`).
- `test-log/` ran lane L's publisher through `pushLog` and `stageLog`
  against real git (60 s). `test/gitops.test.ts` now checks that the
  sandbox answers each staging call and the push as lane L's own model of
  a remote (`MemoryGit`) does, and that the two packages' transfer bounds
  are the same numbers. Lane L tests its publisher against that model.

## Live runs

**Status:** measurement only. The harness Worker `artroom-lb-git` was
retired from `src/` to `measure/harness/` and its deployment deleted
(decision D5, request 73eccbec, 2026-10-02). The Room's spike deployment
covers workspaces, pinning, fast-forward landings and log publication
([notes/deploy-spike.md](../../notes/deploy-spike.md)); `live.mjs` (merge
landings and a conflict) and `jj-change-id.mjs` cover what it does not.
The harness is not type-checked or tested by this package's gates.

These need hugh's wrangler login and the harness deployed with a key.

```sh
cd packages/git
env -u CLOUDFLARE_API_TOKEN npx wrangler whoami
umask 077; openssl rand -hex 24 > ~/.artroom-lb-key
printf 'LB_KEY=%s\n' "$(cat ~/.artroom-lb-key)" > /tmp/lb-secrets
env -u CLOUDFLARE_API_TOKEN npx wrangler deploy -c measure/harness/wrangler.jsonc --secrets-file /tmp/lb-secrets
node measure/live.mjs            # forks, tokens, pinning, diffs, previews, two landings, a conflict, release
node measure/jj-change-id.mjs    # does a jj change-id header survive fork, pinning and landing?
env -u CLOUDFLARE_API_TOKEN npx wrangler delete artroom-lb-git
node measure/token-inflight.mjs  # needs no Worker: does revoking or expiring a token stop a push in flight?
```

The scripts make their own repos in the `gitseq-spike` namespace, revoke
every token they mint, and delete their repos. Results are saved, with
tokens redacted, in `measure/results/`, including those of the retired
`pushlog-live.mjs` and `log.live.test.ts`.

## jj change IDs

jj writes a `change-id` header into each commit. It survives the whole lane
path unchanged: the push to the lane's fork, pinning at
`refs/artroom/heads/<lane>/<generation>`, and the landing. Nothing on the
path rewrites a commit: pinning copies objects, and a landing either
fast-forwards main to the head or makes a merge commit whose second parent
is the head. The tests check the raw commit bytes of a commit built with the
header where jj writes it: after pinning from a fork (`test/gitops.test.ts`,
"pinning: …") and as the second parent of a landing's merge commit
(`test/git-publisher.test.ts`, "landing over real git: …"). They use real
git and the real pinning, landing engine and publisher code; the fork and
canonical repo are local bare repos, and the Room and tokens are fakes. The
tests no longer run the jj program: what jj writes is jj's own, and
`measure/jj-change-id.mjs` runs the check with jj against real Artifacts
through the measurement harness; it held on 2026-10-01
(`measure/results/jj-change-id-*.json`).

## Limits and choices

- **Diff bounds** (R-PROP-6): 64 levels, 100,000 tree entries, 2,000
  commits to find a merge base, 8 tree reads in flight. A diff over a bound
  is refused, the same way every time for the same trees.
- **Refusals are stable, and work is bounded.** The diff walks trees level
  by level, in path order, reading at most `concurrency / 2` directories
  ahead of the one being counted, and stops starting reads once a bound is
  crossed. So the same two trees give the same answer, or the same refusal,
  whatever the cache holds and whichever read finishes first.
- **Merge bases** come from git's paint-down walk, then any base that is an
  ancestor of another is removed by following parent links only, so clock
  skew cannot add a redundant base.
- **Renames** are exact (same blob). A rename with edits is listed as a
  deletion and an addition, which names the same two paths.
- **One container per room.** Its operations run one at a time, because
  they share a git directory and the gateway's route. Preparations are
  still logically parallel: several operations can be `preparing` at once
  on the same main.
- **Pinning tokens live 10 minutes**, because a lane's objects can be large
  and an expired token refuses an upload in progress. Publication and
  staging tokens live 60 seconds; their pushes carry almost nothing.

## Contract amendment 4

The lane B edits of `docs/protocol.md` section 30.9.

1. **`refused`.** `LogPushOutcome` gains
   `{ ok: false, reason: "refused", code, detail }`, and `toLogOutcome`
   maps every `rejected` outcome other than a lease refusal to it. The test
   that it is the same type as lane L's `PushOutcome`, both ways, still
   holds.
2. **Artifacts' refusal of the pack.** Artifacts refuses a pack holding an
   object over 33,554,432 bytes with `remote: artifacts_git_receive_pack_object_too_large`
   before it updates any ref; git then reports only that the remote hung
   up, which alone is `unknown`. `classifyGitPush` now reports a push whose
   output has a known Artifacts refusal code on a line of its own, with a
   nonzero exit and no status line for the ref, as `rejected`
   (`remote-rejected`). The known codes are `ARTIFACTS_REFUSALS`; only
   codes Artifacts answers before any ref update belong there, so an answer
   is still never `rejected` when the ref might have changed.

Tests:
- `test/push-outcome.test.ts`: "Artifacts' recorded refusal of an object
  over its limit is rejected (remote-rejected), not unknown", over every
  refusal recorded by the live probes of 2026-10-02
  (`packages/room/measure/logbig/results/logbig-2026-10-02T02-52-36-597Z.json`
  and `object-limit-2026-10-02T02-55-14-470Z.json`); "only a known
  Artifacts code before any ref update is a refusal: a status line for the
  ref, an unknown code, and a zero exit still decide as before".
- `test/gitops.test.ts`: "only a landed push is ok, only a read-back lease
  refusal is lease-mismatch, any other rejection is refused; everything
  else is unknown, with the token redacted".
- `test-log/pushlog.test.ts` (removed with request ecbc722a; the two
  tests above remain): "a remote that refuses the pack with Artifacts'
  code: pushLog reports rejected, lane L sees refused with the code, reads
  the ref back at the parent, and does not push again" (a pre-receive hook
  gave the code, so git reported `[remote rejected]`).

Each change was broken on purpose and a named test failed
(`notes/amendment4-log.md`).

## Contract gaps

Things the contract (lane 0) does not yet say, and what this package does
meanwhile:

1. **The Room–engine seam** (`LandingRoom`, `Readiness`) is defined here,
   not in the contract.
2. **Admin view of a held slot.** The plan asks for "publication unresolved
   since …" with what is known. `PublicationStatus` (push attempts and their
   outcomes, another writer seen, abort in progress, last error, next
   attempt) is package-local; the contract has only `PublicationSlot`.
3. **`ReadBack` cannot say "main could not be read".** The engine keeps the
   operation's state and reports `lastError` in `PublicationStatus`.
4. **`publishing` cannot carry an abort.** An abort attempt during
   `publishing` shows in the `abort-attempt` event and in
   `PublicationStatus.aborting`, and on the operation once it is
   `unresolved`, `landed` or `aborted`.
5. **No `RetryReason` for a changed land input at reservation.** The Room
   chooses the reason (the tests use `obligation-open`).
6. **Main or policy moved at reservation.** R-LAND-7 says any mismatch makes
   the operation `retryable`; R-LAND-5 says a main move or a policy
   activation re-prepares it. The engine re-prepares for those two, and
   makes the operation `retryable` for every other mismatch.
7. **A preview decided by paths has no integration.** `PreviewOp.clean`
   requires `integration`. The sandbox preview now carries it, but when
   the paths are disjoint and main has moved, `previewPlan` alone cannot
   name the merge commit; the Room must call `Pinning.preview` for it.
8. **Ref names beyond the pinned ref.** `refs/artroom/objects/<head>` is in
   R-PROP-1; `refs/artroom/integration/<op>/<attempt>` (where an integration
   commit is stored for checkers and for publication) is not in the
   contract.
9. **Workspace operation IDs** are `op_ws_<lane>_<lease generation>`; fork
   names are `<canonical>--<lane>`.

## Review de5289a5

Finding (P2): `stageLog` stored a chunked object only in the call whose
append completed it. If that append applied and its answer was lost, the
complete file stayed in staging; every later call reported the object
missing with all its bytes staged, lane L had nothing left to send, and
the publication stopped for good.

Fix: settling the staging is the recovery step of every call, not a
consequence of the final append. After applying its parts, each
`stageLog` call settles every wanted object of the cohort
(`GitOps.reconcile`):

- stored already (by exact ID, type and size, read back with
  `cat-file --batch-check`): its staging file is removed; a removal that
  fails is retried by the next call;
- staging file of exactly the object's size: git writes it as an object;
  it counts only if git computes the wanted ID, and the file is then
  removed; a write that fails keeps the file for the next call;
- staging file with more bytes than the object, or complete bytes of
  another ID: discarded, and the call fails; the next call reports the
  object with 0 bytes staged, so lane L sends it again from the start;
- an object stored with another type or size: the call fails.

Then the stored set is read back from the repository, and the answer is
built from it. Each step is safe to repeat, so a lost answer, a failed
write, a failed cleanup and a restarted caller over the same container
filesystem all converge on the next call. The cohort, the commit and the
lease do not change, and `pushLog`'s type, parent and closure checks are
as before.

Tests (`test/gitops.test.ts`, "de5289a5: …"): the final append applied
with its answer lost, settled by a new client over the same filesystem,
and the commit then lands; a lost hash-object answer, a failed hash-object
and a failed cleanup; a complete file with wrong or too many bytes; exact
type and size; another batch's staging left alone. `test-log/pushlog.test.ts`
ran the checker's scenario through lane L's real publisher; it was removed
with request ecbc722a.

