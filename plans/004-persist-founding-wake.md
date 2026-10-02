# Plan 004: Persist a cleanup wake before founding remote effects

> Executor: work under a gitseq request and promise and obtain exact-head checker review of every changed artifact. This plan does not authorize landing without that review.
>
> Drift check: `git diff --stat bd520fb926f8161a722c6f1e23ae4aac29e41a66..HEAD -- packages/git/src/workspace/workspaces.ts packages/git/test/workspaces.test.ts packages/room/src/core.ts packages/room/src/room.ts packages/room/test/workerd/founding-gaps.test.ts packages/room/test/node/deploy.test.ts`. Compare changed excerpts before continuing.

## Status

- Status: DONE, pending review. Implemented under gitseq request `b2509b23` on branch `request/cc-workspace`; see the implementation report in [README.md](README.md).
- Priority: P2
- Effort: M; no functionality is cut to fit this estimate.
- Risk: MED — preserve the Room's shared alarm ordering and recovery behavior.
- Confidence: HIGH for the static first-create/no-alarm path; an actual interrupted-DO control is still required.
- Depends on: coordinate workspaces.ts edits with plans 001 and 002.
- Category: correctness and crash recovery
- Planned at: `bd520fb926f8161a722c6f1e23ae4aac29e41a66`, 2026-10-02
- Audit request: `c01205f5d967ccef69319549dd1734b3e108a8b0`

## Why this matters

The first public founding records a repository-create duty before calling the provider, but does not arrange an alarm until that call answers or throws. If the object stops while waiting, the durable ledger can survive without any persisted wake. A fresh object also does not schedule existing founding debt during construction. Cleanup therefore depends on another request revisiting founding. The 24-hour creation token and abandoned repository need autonomous recovery; this finding is based on source analysis, not a reproduced production failure.

## Current state

`packages/git/src/workspace/workspaces.ts:794–799` records the incarnation then immediately awaits create:

```ts
const step = this.beginStep(base, "repo-create");
const name = `${base}-${step}`;
this.sql.all("UPDATE artroom_ws_duty SET fork = ? WHERE id = ?", name, step);
// ...
made = await this.artifacts.create(name, { description: "Artroom room repository", setDefaultBranch: "main" });
```

At `packages/room/src/core.ts:410–416`, the public found path waits for newRepository and calls committed only in its catch (or at final success, line 455). The Workspaces constructor options at core.ts:327 have no wake hook. `packages/room/src/room.ts:51–69` constructs the core without a recovery schedule. Its schedule at lines 197–202 calls storage.setAlarm without returning its completion promise.

SnapshotReposOptions in `packages/git/src/snapshot/repos.ts:72–79` already defines an async wake callback, and prepare awaits it before create at line 311. Use that as a protocol exemplar, not proof that every production wiring already waits for persistence: Room's snapshot hook at core.ts:174 currently only calls committed. This plan focuses on founding; report other wiring gaps separately. Do not assert that an unawaited storage call bypasses Workers output gates without evidence of the platform contract.

Tests use the real Room DO and SQLite. founding-gaps.test.ts:199–212 verifies an alarm after a completed failure response, which misses interruption at the first remote await. The draftPublic()/roomStub()/duties() helpers in that file are suitable fixtures. Workspace Node tests use the synchronous Sql convention: persist the ledger in a transaction, then await scheduling outside it.

## Scope and commands

Only the six drift-check paths and this plan's status. Add an awaited pre-effect wake contract for founding debt and wire it to the Room's alarm. Preserve imports, sealed repository identity, unknown-create retention, incarnation naming and legacy adoption. Do not reset or delete unrelated alarms, deploy, create remote resources or change founding policy. Firm/bootstrap policy work is separate.

Use an isolated `request/founding-pre-effect-wake` branch and normal gitseq artifacts/review. No lockfile or dependencies change.

| Purpose | Command at repository root | Success |
|---|---|---|
| Workspace tests | `node --test packages/git/test/workspaces.test.ts` | All pass |
| Room tests | `npm test -w @generalbusiness/artroom-room` | All pass |
| Package types | `npm run typecheck -w @generalbusiness/artroom-git` and `npm run typecheck -w @generalbusiness/artroom-room` | Exit 0 |
| Root gates | `npm run typecheck` and `npm test` | Exit 0 |
| Dry deployment | `npm exec -w @generalbusiness/artroom-room -- wrangler deploy --dry-run` | Exit 0, no deployment |
| Scope | `git diff --name-only` | Only allowed paths relative to starting head |

## Steps

1. Hold the first public create before its reply. From the actual DO storage inspect the durable duty and alarm while the call is still pending. Assert the alarm is persisted before provider dispatch, not only after a response. Abort the object, use a fresh stub, and drive only scheduled alarm work to reclaim the late-created repository; the founder never retries. **Verify:** Room tests expose the missing first wake before implementation.
2. Add a Workspaces async wake callback and invoke it after recording founding effects and before dispatching them. A failed wake must prevent dispatch and retain recoverable debt. Wire the callback through CoreOptions and Room to persist an alarm for the earliest outstanding work. Keep transaction callbacks synchronous and handle concurrently earlier alarm requests safely. **Verify:** workspace tests, Room tests and package typechecks pass.
3. Schedule persisted founding debt on recovery without requiring a new found request. Cover wake rejection, a fresh unfounded room, an older ledger with already-pending debt, successful founding, and another earlier alarm that must not be overwritten. Keep capped retry/backoff and indefinite unknown-effect observation. **Verify:** root gates, dry deployment and scope check pass.

## Done criteria

- [ ] Actual DO control proves persisted alarm before the first provider create.
- [ ] A stopped host's debt is serviced through a fresh object's alarm without a founder retry.
- [ ] Wake failure sends no provider effect; earliest shared alarm is preserved.
- [ ] Healthy founding, legacy adoption and sealed repository isolation still pass.
- [ ] All gates pass; gitseq exact-head delivery and index status are recorded.

## STOP conditions and maintenance

Stop if the platform's storage/output-gate behavior invalidates the proposed test ordering; report the documented behavior and retain a test of the first-create/no-alarm invariant. Stop if recovery requires changing public founding authority or snapshot/job contracts. Shared alarm caching must never claim successful persistence after a rejected setAlarm. Future provider effects need both durable ownership and a reachable recovery schedule.
