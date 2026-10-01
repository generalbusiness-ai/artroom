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
  push use exactly that commit. The Room then says whether the obligations
  are met (`readiness`).
- **Reservation is the one decision point** (R-LAND-7). `reserve` is one
  synchronous SQLite transaction. It re-checks the lane, the policy version
  and main, asks the Room to re-check authority, evidence and the land input
  (`revalidate`), takes the next publication number, holds the room's single
  publication slot, and records `land-reserved`. After this the landing
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
active policy version, `revalidate` and `readiness`, `revertScope`, and
`record`, which appends a system event to the log inside the engine's
transaction. `publisher` is `ContainerPublisher` in a Worker, or
`GitPublisher` over local git in tests. `tokens` is `canonicalTokens(…)`.

## Workspaces

```ts
const ws = new Workspaces({ sql, artifacts: env.ARTIFACTS, canonical: "acme-web" });
ws.open(lane, leaseGeneration, leaseExpiresAt);   // public WorkspaceOp: pending
await ws.provision(lane);                          // fork (retrying 10400), mint the lease's token
ws.view(lane);                                     // ready: remote and lease generation, never a token (R-WS-1)
ws.grant(lane, leaseGeneration);                   // the token, after the Room has judged the caller (R-WS-2)
await ws.revoke(lane);                             // release, expiry or take-over (R-WS-3)
```

The fork's own creation token is revoked at once. `revoke` lists the fork's
tokens and revokes every active one, so a token minted just before a crash
is caught too.

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
- **Renames** are exact (same blob). A rename with edits is listed as a
  deletion and an addition, which names the same two paths.
- **One container per room.** Its operations run one at a time, because
  they share a git directory and the gateway's route. Preparations are
  still logically parallel: several operations can be `preparing` at once
  on the same main.
- **Pinning tokens live 10 minutes**, because a lane's objects can be large
  and an expired token refuses an upload in progress. Publication and
  staging tokens live 60 seconds; their pushes carry almost nothing.
