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
| Pinning and previews | `src/publisher/client.ts` | Copies a proposed head into the canonical repo and pins it at `refs/artroom/heads/<lane>/<generation>`; merge previews |
| Path diffs | `src/diff/treediff.ts` | Changed paths through the Artifacts binding: bounded, cached by tree hash, with merge bases, exact renames, and the overlap test that decides whether a preview needs the sandbox |
| Publisher sandbox | `src/publisher/container.ts`, `gitops.ts` | A Durable Object that owns a container with git only. Every git command is hardened; no repository code runs |
| Gateway and ref fence | `src/publisher/container.ts`, `ref-fence.ts` | The container's only way out. It adds each operation's token and lets a push through only if every ref update is the one that operation allows |
| Harness Worker | `src/worker.ts`, `wrangler.jsonc` | Worker `artroom-lb-git`: the publisher, plus a key-protected stand-in Room for live tests |
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
  otherwise a merge commit. The commit is stored in the canonical repo at
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
  canonical write token, records its ID, pushes
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
`GitPublisher` over local git in tests. `tokens` is `canonicalTokens(…)`.

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
  token; each attempt to mint a lease token) is written to SQLite as *in
  flight* before it is sent, and marked *answered* when its answer (success
  or error) arrives: an answer is the completion fence. Cleanup is *owed* as
  an inventory (revoke every active token except the one a ready or
  installing lease recorded) or one known token. An inventory that
  succeeds settles every owed inventory and every step answered before it
  started. A step still in flight (its host stopped) is never settled by a
  snapshot: it keeps a scheduled inventory every few minutes, which revokes
  whatever it creates, until its bound has passed: send time, plus
  `applyBoundMs` (how long an unanswered request is assumed able to stay
  outstanding; default one hour; an assumption, not an Artifacts
  guarantee), plus the longest life of a token it could create (the TTL
  requested, or 24 hours for a fork's creation token, which the binding
  cannot shorten). Each duty ends *done*, with its reason.
- **Ready means swept.** Provisioning settles what is owed, mints once per
  attempt (never a hidden retry), records the token, and then runs an
  inventory that started after the token was recorded. Only when that
  succeeds is the workspace ready, so a mint that applied and then answered
  with an error cannot leave a second live token. A step still in flight
  from a stopped host does not block a new lease; its inventories revoke
  anything it creates.
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
npm test                     # Node: real git and node:sqlite
npm run test:workers         # workerd: Durable Object SQLite, alarms, instance aborts
```

The Node tests build real repositories with git and run the publisher's
exact git commands against them. Each landing test name starts with the
plan's acceptance case or the rule it shows. The workerd tests run the
engine inside a Durable Object, abort the instance (`abortAllDurableObjects`),
and let the alarm finish the landing.

## Live runs

These need hugh's wrangler login and the Worker deployed with a key.

```sh
cd packages/git
env -u CLOUDFLARE_API_TOKEN npx wrangler whoami
umask 077; openssl rand -hex 24 > ~/.artroom-lb-key
printf 'LB_KEY=%s\n' "$(cat ~/.artroom-lb-key)" > /tmp/lb-secrets
env -u CLOUDFLARE_API_TOKEN npx wrangler deploy --secrets-file /tmp/lb-secrets
node measure/live.mjs            # forks, tokens, pinning, diffs, previews, two landings, a conflict, release
node measure/token-inflight.mjs  # does revoking or expiring a token stop a push in flight?
```

Both scripts make their own repos in the `gitseq-spike` namespace, revoke
every token they mint, and delete their repos. Results are saved, with
tokens redacted, in `measure/results/`.

To remove the Worker: `env -u CLOUDFLARE_API_TOKEN npx wrangler delete artroom-lb-git`.

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
   requires `integration`, but when the paths are disjoint no sandbox runs
   (`previewPlan` returns `disjoint`).
8. **Ref names beyond the pinned ref.** `refs/artroom/objects/<head>` is in
   R-PROP-1; `refs/artroom/integration/<op>/<attempt>` (where an integration
   commit is stored for checkers and for publication) is not in the
   contract.
9. **Workspace operation IDs** are `op_ws_<lane>_<lease generation>`; fork
   names are `<canonical>--<lane>`.
