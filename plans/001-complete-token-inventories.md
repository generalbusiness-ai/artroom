# Plan 001: Require complete token inventories before issuing access

> Executor: use a gitseq request and promise for this work. Follow the steps and verification gates. Submit the exact head and every changed artifact for checker review. This plan is a handoff, not approval to land.
>
> Drift check: `git diff --stat bd520fb926f8161a722c6f1e23ae4aac29e41a66..HEAD -- packages/git/src/artifacts.ts packages/git/src/workspace/workspaces.ts packages/git/src/snapshot/repos.ts packages/git/test/workspaces.test.ts packages/git/test/snapshots.test.ts`. Compare changed code with the excerpts before continuing.

## Status

- Status: DONE, pending review. Implemented under gitseq request `b2509b23` on branch `request/cc-workspace`; see the implementation report in [README.md](README.md).
- Priority: P2
- Effort: M (sequencing only; retain all functionality)
- Risk: MED — the current lease token must survive a workspace sweep.
- Confidence: HIGH
- Depends on: none; coordinate edits to workspaces.ts with plan 002.
- Category: correctness and credential isolation
- Planned at: `bd520fb926f8161a722c6f1e23ae4aac29e41a66`, 2026-10-02
- Audit request: `c01205f5d967ccef69319549dd1734b3e108a8b0`

## Why this matters

A successful listing is insufficient when its records do not account for its total. Workspace cleanup currently accepts an empty page with a positive total, settles creation cleanup, and grants the lease while the fork's original 24-hour write token remains active. Snapshot preparation similarly declares a repository ready after a failed creation-token revocation and an incomplete inventory. This violates its promise that a ready snapshot has no active write token. These are reproduced synthetic provider faults, not evidence that the live provider returned these responses or that an attacker obtained a credential.

## Current state

`packages/git/src/workspace/workspaces.ts:592` discards the total:

```ts
const { tokens } = await withRetry(() => fork.listTokens(), this.retryOpts());
```

It settles owed inventories and answered steps at lines 610–611 after iterating only these records. `packages/git/src/snapshot/repos.ts:330` catches creation-token revocation errors; lines 344–348 sweep only the returned records and mark the snapshot ready:

```ts
for (const t of (await withRetry(() => repo.listTokens(), this.retry)).tokens) {
  if (t.state === "active") await withRetry(() => repo.revokeToken(t.id), this.retry);
}
```

The existing canonical founding validator, `Workspaces.inventoryOf` at workspaces.ts:855–874, rejects missing totals, count mismatches, missing IDs, invalid scope/state and invalid expiry. Match that validation behavior. SQLite access uses the synchronous `Sql` interface in `packages/git/src/sql.ts`; transactions cannot contain awaits. Tests use node:test, strict assert and in-memory `nodeSql()` from test/support.ts. Existing public founding inventory controls are in workspaces.test.ts:1162; snapshot tests begin at snapshots.test.ts:141.

## Scope

Only modify the five paths in the drift check. A small shared validator in artifacts.ts is appropriate. Keep public exports, provider interfaces, TTLs, workspace grants, repository naming, unknown-effect retention, and canonical token ownership unchanged. Do not sweep the shared canonical repository or add live effects. Cleanup visibility belongs to gitseq request `c0f0592f3c919ce3be248f73c51dcb7e25d75f07`.

## Commands and workflow

Use an isolated `request/credential-inventories` branch or checkout. Preserve unrelated changes. Follow the existing imperative commit style, for example “Room jobs: one source for accounted tokens”. Do not install unless the executor's environment requires the existing lockfile; do not change it for this fix.

| Purpose | Command from repository root | Success |
|---|---|---|
| Targeted tests | `node --test packages/git/test/workspaces.test.ts packages/git/test/snapshots.test.ts` | All pass |
| Git package types | `npm run typecheck -w @generalbusiness/artroom-git` | Exit 0 |
| Root gates | `npm run typecheck` and `npm test` | Both exit 0 |
| Worker integration | `npm run test:workers -w @generalbusiness/artroom-git` | All pass |
| Scope | `git diff --name-only` | Only scoped paths and this plan's status, relative to the starting head |

## Steps

1. Add regression tests to workspaces.test.ts and snapshots.test.ts. Supply empty records with a positive total, a missing total, a missing ID, invalid scope/state and invalid expiry. The workspace must not become ready or grant a token; the snapshot must not return a ready repository or mint a job credential. Restore a complete healthy listing and verify recovery. **Verify:** targeted test command above must expose failures before the fix; record their names.
2. Validate the complete raw response before sweeping or settling duties. Reuse the existing canonical validator's rules, retaining caller-specific active/expiry filtering. Incomplete or malformed responses leave debt scheduled. Keep a recorded pending/ready workspace lease token; revoke the other active tokens only on its proven fork. Snapshot preparation must retain its existing deletion debt on failure and recover through the existing incarnation protocol. **Verify:** targeted tests and Git package typecheck exit 0.
3. Add a restart control using the same SQLite database and a new Workspaces/SnapshotRepos instance. Confirm that the incomplete observation never closes cleanup, a later healthy inventory cleans it, and an unrelated canonical token remains untouched. Run root and Worker gates. **Verify:** all commands in the table pass and the working diff stays within scope.

## Done criteria

- [ ] Targeted tests cover every malformed/incomplete case and healthy recovery for both callers.
- [ ] A workspace keeps its recorded lease token while ending its creation token.
- [ ] A snapshot is never issued while inventory evidence is incomplete.
- [ ] Restart controls and all gates pass; no live provider effects were used.
- [ ] Gitseq artifacts and exact-head checker invitation are recorded; index status updated.

## STOP conditions and maintenance

Stop if the provider has a documented pagination contract requiring additional calls: report it and implement full traversal under an amended request rather than treating the first page as complete. Stop if the fix needs a public API or ownership change. Never reinterpret an incomplete page as absence. Future inventory consumers should use the shared validation rule; reviewers should scrutinize retained lease IDs and synthetic fault tests rather than coverage percentages.
