# Plan 003: Retry token cleanup after publication has landed

> Executor: use gitseq for the request, promise, artifacts and exact-head checker invitation. Do not treat this plan as approval to land.
>
> Drift check: `git diff --stat bd520fb926f8161a722c6f1e23ae4aac29e41a66..HEAD -- packages/git/src/landing/core.ts packages/git/src/landing/engine.ts packages/git/test/landing.test.ts packages/git/test-workers/landing-do.test.ts`. Compare any changed excerpts before proceeding.

## Status

- Priority: P2
- Effort: M; retain the full acceptance cases.
- Risk: MED — cleanup must not change a confirmed landing or hold its slot.
- Confidence: HIGH
- Depends on: none.
- Category: correctness
- Planned at: `bd520fb926f8161a722c6f1e23ae4aac29e41a66`, 2026-10-02
- Audit request: `c01205f5d967ccef69319549dd1734b3e108a8b0`

## Why this matters

After a successful push, a transient revoke failure is caught and readback can confirm landing. The operation becomes terminal and frees the publication slot. Subsequent alarms only inspect active operations or the held slot, so the known token never gets the promised retry even after the provider recovers. Its 60-second expiry bounds credential lifetime, but it does not fulfill R-PUB-3's revocation requirement or clear the retained unrevoked state. No unauthorized publication or credential disclosure is established by this finding.

## Current state

`packages/git/src/landing/engine.ts:292–298` records the push, calls revokeLive, then reads main back. At lines 319–330 revokeLive catches failures with the comment “a later step revokes it”. However reconcile at lines 359–361 only calls it for the held operation. `LandingCore.nextDue` at core.ts:222 scans active operations, and active at lines 148–152 excludes terminal ones. land at lines 769–772 sets `landed`, deletes nextAt and frees the slot. Abort completion has the same exclusion.

```ts
op.state = "landed";
delete op.nextAt;
this.save(op);
this.setSlot({ state: "free", last: publication });
```

The existing test at landing.test.ts:636 sets both `pushDown` and `failRevoke`: the failed push keeps the operation unresolved, so it misses this case. Use its world()/readyAndReserve() fixtures and the crash/restart make() pattern at lines 114 onward. State storage follows the synchronous Sql transaction convention; landing receipts and slot state must remain atomic. R-PUB-2 says token expiry decides nothing about whether a push landed.

## Scope and commands

Only the four drift-check paths, plus this plan's status. Retain public LandOp/receipt shapes, complete-forward behavior, slot ordering, CAS and token TTL. Do not add a canonical inventory sweep, alter token mint attribution, or delay confirmed landing until cleanup succeeds. A private cleanup table/query or additive schema is acceptable in core.ts; if another file is needed, amend scope first.

Use an isolated `request/terminal-publication-cleanup` branch and imperative commit messages. No live pushes or credentials.

| Purpose | Command at repository root | Success |
|---|---|---|
| Targeted tests | `node --test packages/git/test/landing.test.ts` | All pass |
| Package types | `npm run typecheck -w @generalbusiness/artroom-git` | Exit 0 |
| Worker storage tests | `npm run test:workers -w @generalbusiness/artroom-git` | All pass |
| Root gates | `npm run typecheck` and `npm test` | Exit 0 |
| Scope | `git diff --name-only` | Only allowed paths relative to starting head |

## Steps

1. Add a regression where push succeeds, revoke throws and readback lands. Before advancing to expiry, recover the provider and restart the engine on the same SQLite database. Assert a due cleanup exists, the token gets revoked, the receipt remains unique and the slot stays free. **Verify:** the targeted command exposes the missing retry before the fix.
2. Give known token cleanup scheduling independent ownership from active operation and slot state. Reconcile terminal cleanup records as well as held-operation tokens. Retain a durable next-at/backoff on failure; do not leave every failed token immediately due. Successful revocation updates durable ownership without emitting another landing receipt. **Verify:** targeted tests and package typecheck pass.
3. Add multiple terminal operations with cleanup failures, restart, recovered provider and a later legitimate publication. Confirm cleanup for one operation cannot revoke another operation's token. Exercise abort-terminal cleanup only through an already-supported definite completion path; do not invent one from timeout/expiry. Add a real SQLite DO storage/restart control following test-workers/landing-do.test.ts. **Verify:** Worker tests and root gates pass.

## Done criteria

- [ ] Successful-push/failed-revoke regression and fresh-engine recovery pass before credential expiry.
- [ ] Failed cleanup retains a durable future due time; healthy cleanup clears it.
- [ ] Landing receipt count, free slot and later publication behavior are unchanged.
- [ ] No expiry or revoke result is used as evidence that a push did not land.
- [ ] All gates pass; exact-head gitseq delivery and index status are recorded.

## STOP conditions and maintenance

Stop if the design needs to change R-PUB-2/R-PUB-6 or block the slot on cleanup. Stop if durable cleanup requires an unscoped public contract migration. Future terminal states must remain eligible for credential cleanup even when they are ineligible for publication work. Review the retry schedule independently of the publication state machine.
