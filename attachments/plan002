# Plan 002: Keep unknown fork effects scheduled through provenance changes

> Executor: track work with a gitseq request and promise, and submit every changed artifact at one exact head for checker review. A plan is not a landing approval.
>
> Drift check: `git diff --stat bd520fb926f8161a722c6f1e23ae4aac29e41a66..HEAD -- packages/git/src/workspace/workspaces.ts packages/git/test/workspaces.test.ts`. Reconcile any changed excerpts before proceeding.

## Status

- Priority: P2
- Effort: M; estimates do not reduce scope.
- Risk: LOW — retain debt while leaving the unrelated repository untouched.
- Confidence: HIGH under the adopted unknown-effect contract.
- Depends on: coordinate with plan 001 if it edits the same files; no behavioral dependency.
- Category: correctness and credential cleanup
- Planned at: `bd520fb926f8161a722c6f1e23ae4aac29e41a66`, 2026-10-02
- Audit request: `c01205f5d967ccef69319549dd1734b3e108a8b0`

## Why this matters

A foreign repository observed at the requested name proves that it must not be touched. It does not prove that an earlier unknown fork-create request can never apply. Current cleanup settles that request anyway. If the foreign repository disappears and the outstanding create then applies, its creation write token has no cleanup duty or next alarm. A synthetic provider/in-memory SQLite control reproduces that sequence without altering the unrelated repository.

## Current state

`packages/git/src/workspace/workspaces.ts:17–24` defines unknown non-idempotent effects as `in-flight`: they may apply at any time. `ensureFork` records each create at lines 495–503 before sending it. The exception branch in `cleanForkNow`, at lines 561–564, nevertheless closes all duties:

```ts
if (e instanceof NotOurFork) {
  this.done(duties.map((d) => d.id), "not-our-repository");
  return 0;
}
```

The immediately following absent-repository branch preserves in-flight duties and calls `recheck`; use that as the behavioral exemplar. The outer cleanFork finally also advances overdue checks on capped backoff. Keep the distinction between blocking answered/owed duties and unresolved observations. Tests in workspaces.test.ts use node:test and nodeSql() from test/support.ts; FakeRepo.info has an infoHooks facility for controlling observations.

## Scope and commands

Only change the two drift-check paths and this plan's status. Do not change repository naming, force a replacement, delete or revoke anything on a foreign repository, settle unknown effects by elapsed time, or weaken the positive provenance check. Canonical founding incarnation cleanup and snapshots are outside scope.

Use an isolated `request/unknown-fork-provenance` branch, imperative commit messages and normal gitseq delivery.

| Purpose | Command at repository root | Success |
|---|---|---|
| Targeted tests | `node --test packages/git/test/workspaces.test.ts` | All pass |
| Package types | `npm run typecheck -w @generalbusiness/artroom-git` | Exit 0 |
| Root gates | `npm run typecheck` and `npm test` | Exit 0 |
| Worker integration | `npm run test:workers -w @generalbusiness/artroom-git` | All pass |
| Scope | `git diff --name-only` | Only allowed paths relative to starting head |

## Steps

1. Add a provider control whose fork-create answer is lost before application. Observe a foreign repository at the same name, sweep it, remove it and apply the old request. Assert the foreign repository was never read beyond provenance or changed, the create duty stayed in flight, nextDue remained non-null, and a new instance eventually revokes the late creation token. **Verify:** targeted tests show the current premature `done` failure before editing production code.
2. Split the NotOurFork treatment by duty state. Preserve every in-flight effect and advance its observation with the existing capped backoff. Decide answered/known duty settlement separately using actual ownership evidence; the foreign repository itself is never a cleanup target. Do not classify a current foreign occupant as provider completion evidence. **Verify:** targeted tests and package typecheck pass.
3. Cover repeated foreign/absent/ours observations across restart, a definite unchanged refusal, and a healthy ordinary answered create. Test nextDue is in the future after observation, so retention cannot create a tight alarm loop. Run root and Worker gates. **Verify:** all commands above pass, and no foreign destructive call was recorded by fixtures.

## Done criteria

- [ ] The late-create regression, restarted recovery, foreign-isolation and backoff controls pass.
- [ ] No in-flight duty is marked done solely because a foreign repository is present.
- [ ] Existing workspace readiness and definite-refusal controls still pass.
- [ ] All gates pass and gitseq exact-head artifacts/invitation are submitted.
- [ ] Update the index status.

## STOP conditions and maintenance

Stop if the adopted provider contract includes an explicit, durable completion fence for this exact request that rules out the late effect; report the evidence before changing the state machine. Stop if fixing this requires touching a foreign repository or changing the public grant shape. Name occupancy is an observation, not an operation identity. Future provider reconciliation changes must preserve that distinction.
