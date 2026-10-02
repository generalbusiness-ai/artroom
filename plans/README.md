# Credential cleanup handoffs

Focused read-only audit under gitseq request `c01205f5d967ccef69319549dd1734b3e108a8b0`, with promise `51ef2bd2a3829800872ccd25f072cbe28dc961f1`. Started at approved main `72d6abde5c6dfa993ac441884e8f966a903b932f`; reconciled to `bd520fb926f8161a722c6f1e23ae4aac29e41a66` after the separately reviewed A7 landing. That landing's tree equals approved head `84e25a78883e03f7accf1a18d66d8866eea94195`. The Git paths below are unchanged; Room founding line references were refreshed.

The improve skill supplied the handoff format. Four verified fixes were selected under the user's standing autonomous checker instruction. Priorities and effort estimates set review order only. They do not cut scope. Source code was not changed by this audit. These plans have not been implemented or approved for landing.

| Order | Plan | Impact | Effort | Fix risk | Confidence | Status |
|---|---|---|---|---|---|---|
| 1 | [001: Complete token inventories](001-complete-token-inventories.md) | Prevent premature workspace grants and writable “ready” snapshots under incomplete provider replies | M | MED | HIGH | TODO |
| 2 | [002: Unknown fork effects](002-retain-unknown-fork-effects.md) | Preserve late-create cleanup through foreign occupancy | M | LOW | HIGH | TODO |
| 3 | [003: Terminal publication cleanup](003-retry-terminal-publication-tokens.md) | Retry known credential revocation after a successful landing | M | MED | HIGH | DONE, pending re-review after [review 14739925](#review-14739925) ([report](#plan-003-report)) |
| 4 | [004: Founding wake](004-persist-founding-wake.md) | Recover first remote founding effects after host interruption | M | MED | HIGH, static path | TODO |

Plans 001 and 002 touch the same workspace cleanup function; serialize their edits or explicitly reconcile the second head. Plan 004 also touches workspaces.ts and should follow that reconciliation. Plan 003 can proceed independently. Every executor must use a gitseq request/promise, preserve unrelated work, run the stated gates and deliver all artifacts at one exact head for checker review.

## Plan 003 report

Status: DONE, pending checker re-review: review `1473992512c5bf7f973bfb8044cb45edebd7b7c5` requested a change, made as described [below](#review-14739925). Implemented under request `7da437bcb901741837f61bc149a00c723c7c8217` on branch `request/cc-terminal` (the plan suggested `request/terminal-publication-cleanup`; the assignment named this one), from main `bd520fb926f8161a722c6f1e23ae4aac29e41a66`. The head for review is the commit that carries this report. The plan and this README are byte-identical to the copies attached to assert `4efb1ef348723189487e0a383b25db5b71d661f7` when first committed (sha256 `731c4cee…` and `6f8b9717…`). No gitseq delivery is recorded yet; the requester publishes it.

**Premise.** Confirmed before the fix. With the push landing and revocation failing, `nextDue()` returned null after the landing, and a `reconcile()` run anyway, after Artifacts recovered, left the token live. Only the held operation's tokens were ever retried.

**Change.** Two source files, both in scope:

- `core.ts` adds a private table, `artroom_land_token_cleanup (op, n, token, due, backoff)`. `save()` records each known, unrevoked token of any operation that is not active, in the same transaction. That includes `landed`, `aborted` and any future terminal state. A new record is due after 1 s, because the engine has just tried. `tokenRevoked()` deletes the record. `cleanupFailed()` doubles the wait, from 1 s up to 5 min, and never gives the record up. `nextDue()` includes the earliest due time, so the Room's alarm wakes for it. A room stored before this change adopts its ended operations' unrevoked tokens once, at start, under a meta key.
- `engine.ts`: after `reconcile()` has dealt with the held slot and any reservation, it starts a cleanup pass over the due records (at most 20). Since review 14739925 that pass runs beside the publication queue rather than on it; see [below](#review-14739925). Each record is revoked by its own token ID. A stopped instance writes nothing.

What does not change: the slot, receipts, CAS, token TTL, mint attribution and the public `LandOp` shape. A revocation emits no event. Neither a revocation answer nor token expiry changes an operation's state. The only visible difference is that an ended operation's `updatedAt` moves when its token is revoked.

**Gates and tests.**

| Plan gate | Evidence | Result |
|---|---|---|
| Step 1: regression fails before the fix | `R-PUB-3: the push lands but its token's revocation fails; after a restart, before the token expires, the alarm revokes it` | Red on `bd520` ("the known token's revocation is still owed"); green after |
| Done 1: fresh-engine recovery before expiry | Same test: restart on the same SQLite, clock within 60 s, token revoked, one receipt, slot free | Pass |
| Done 2: durable future due time on failure; cleared on success | `a failed cleanup keeps a durable later due time with capped backoff…` (waits 1 s to 300 s, no early retry, restarts keep the schedule, more than 20 min past expiry still owed) | Pass |
| Done 3: receipts, free slot and later publication unchanged | `several ended operations owe revocations across a restart…` (a third landing reserves, pushes with a live token and lands while revocations are owed); all 39 earlier landing tests unchanged | Pass |
| Step 3: one operation's cleanup cannot revoke another's token; no unrelated token | Same test (per-token failures; an unrelated canonical token is never asked for) and `a held publication's tokens stay with its own publication steps…` (two tokens of one operation, each by its own ID) | Pass |
| Step 3: abort-terminal cleanup through an existing definite path only | `an abort that ends without a push, by its existing definite path…` (an abort arrives at mint; `aborted` comes from read-back and `cannotLand`, as before) | Pass |
| Done 4: no expiry or revocation result used as landing evidence | Backoff test (state, log and slot unchanged after hours of failures); abort test (the recorded `abort-attempt` stays `tokenRevoked: false`) | Pass |
| Step 3: real SQLite DO storage and restart | `test-workers/landing-do.test.ts`: `R-PUB-3: … across real restarts the alarm keeps the revocation owed with backoff, and revokes it when Artifacts recovers` (failure made durable by an SQLite trigger; the real scheduled alarm revokes) | Pass |
| Stored rooms | `a room stored before the cleanup records existed…` | Pass |
| Targeted: `node --test packages/git/test/landing.test.ts` | 45 tests | Exit 0 |
| Package types: `npm run typecheck -w @generalbusiness/artroom-git` | (also within root typecheck) | Exit 0 |
| Worker storage: `npm run test:workers -w @generalbusiness/artroom-git` | 9 tests | Exit 0 |
| Root: `npm ci`, `npm run typecheck`, `npm test` | Every workspace, including the Room's workerd suite (382 tests) | Exit 0 |
| Scope: `git diff --name-only bd520f..HEAD` | The four plan paths, plus `plans/003-…md` and `plans/README.md` | As allowed |

The Room's workerd suite prints workerd "code had hung" uncaught-exception messages, but it passes. The same messages appear with main's landing sources (28 there against 26 here), so this change did not cause them.

**Mutation testing.** Each guard was broken in turn, the targeted file was run, and the code was restored. Every mutant turned at least one test red. The Workers DO test was also red for M1, M4, M5, M8, M9, M11, M15, M16 and M17.

| Mutant | Red tests |
|---|---|
| M1 ended operations owe nothing | 5 |
| M2 active operations owe too | held-publication test |
| M3 already-revoked tokens owed | several-operations test |
| M4 new record due at once | 3 |
| M5 `nextDue` ignores records | 5 |
| M6 due time ignored | 2 |
| M7 batch of 0 | 6 |
| M8 failure leaves due time unchanged | 2 |
| M9 no doubling / M10 no cap | backoff test |
| M11 success keeps the record | 5 |
| M12 success clears other operations' records | several-operations test |
| M13 no adoption / M14 adoption at every start | stored-room test |
| M15 `reconcile` skips cleanup | 6 |
| M16 failure not rescheduled / M17 failure treated as revoked | 3 each |
| M18 stopped instance writes its failure | held-publication test |
| M19 revokes the last due record's token | 2 |
| M20 records the first push's token for every push | held-publication test |

A first version of M19 ("revoke the first due record's token") survived. It is equivalent, because each pass removes the first due record. It was replaced by M19 above, and the held-publication test gained an assertion for M20.

**Not covered here.** The two gaps first reported here, the batch size and cleanup running after the held slot, are now pinned (see review 14739925 below). A token whose mint answer is lost before `pushToken` records it remains the canonical mint ownership request's work (`10fcfe4e`). Showing owed revocations to admins remains with the cleanup projection request. A revocation that answers `false` still counts as done, as before. `workspaces.ts` and `cleanForkNow` were not touched.

## Review 14739925

Review `1473992512c5bf7f973bfb8044cb45edebd7b7c5` of head `8a2b82da` requested changes for one P2 availability defect. The cleanup pass ran on the serial queue that `publish` and `reconcile` share, so an old revocation that was sent but never answered held up a later, independently reserved publication. The checker reproduced this, and it was correct.

**Change** (`engine.ts` only; `core.ts`, the durable records and the backoff are unchanged):

- `reconcile()` starts the cleanup pass and does not wait for it. The pass still starts only after the held slot and any reservation have been dealt with (R-PUB-7).
- One pass runs at a time. A pass tries at most the 20 due records it read when it started.
- Each revocation has a timeout, 30 s by default (`REVOKE_TIMEOUT_MS`; tests pass `revokeTimeoutMs`). A timeout or a refusal counts as a failure and takes the durable backoff. A late answer is dropped, so the token stays owed until a later attempt is answered. A timeout is never taken as success.
- A stopped instance still writes nothing. Records, revocation by the record's own ID, and the absence of any event or outcome change are as before.
- `settle()` does not wait for the pass, so a hung revocation cannot hold it up either.
- A Room alarm that starts a pass now sets its next wake before the pass ends. That can add one wake about a second later, which finds nothing owed and sets no other alarm. The Durable Object test shows this.

**Tests added** (`packages/git/test/landing.test.ts`):

| Control | What it shows |
|---|---|
| `review 14739925: an ended operation's revocation that has not answered holds up no later publication…` | The reviewer's case: while a's revocation is unanswered, b prepares, reserves, pushes and lands once, and the slot is free. A second alarm does not send a's revocation again. A restarted room retries it and Artifacts answers. The dead instance's late answer then writes nothing. |
| `…a revocation that does not answer in time counts as failed, with backoff…` | The timeout counts as a failure (backoff 2 s). A late answer leaves the token owed, and the next answered attempt clears it. |
| `…a slow batch of revocations delays no preparation or publication…` | Three slow revocations: a later operation prepares, reserves and lands while the batch waits on its first answer, then the batch completes. |
| `R-PUB-3: one cleanup pass tries at most twenty owed tokens…` | Adapted from the checker's 25-token diagnostic: 20, then the remaining 5 on the next pass. |
| `R-PUB-7: after a restart the held publication is recovered before any ended operation's token is tried` | Revocation order: the held operation's tokens first, then the ended one. |

The existing token tests now wait for the pass with `cleanupDone()`. The Durable Object test now polls for the background pass's result.

**Checker's diagnostics.** The checker's pending-answer test passes against this engine unchanged. Its 25-token test fails unchanged, but only because it checks the result as soon as `reconcile()` returns; the adapted version above waits for the pass and passes.

**Mutation testing.** I ran 27 mutants against `landing.test.ts`: the 20 earlier ones, re-anchored to the new driver, plus 7 new. Every mutant except N6 turned at least one test red.

| Mutant | Red tests |
|---|---|
| N1 pass awaited on the publication queue (the reviewed defect) | 3, including the unanswered-revocation and slow-batch controls |
| N2 no single flight | 2 |
| N3 no timeout | timeout control |
| N4 timeout counted as success | timeout control |
| N5 cleanup started before held recovery | R-PUB-7 control |
| M7b batch of 40 | batch control |
| N6 `settle` does not wait for the pass | none: that wait was removed as unneeded |
| M1–M20 (as before) | each red, 1 to 11 tests |

The Workers DO test was red for M1, M5, M8, M11, M15, M16 and M17 under the new driver.

**Gates** are recorded for the head that carries this section; see the delivery report.

## Evidence and limits

Parent read every cited production path and test pattern. Read-only synthetic provider controls using actual exported Workspaces/SnapshotRepos classes and in-memory SQLite reproduced incomplete inventory acceptance and unknown-duty closure on foreign provenance. They do not establish live provider behavior. Terminal revocation and founding interruption were verified by source control-flow analysis; their plans require meaningful regression tests, including actual DO recovery for founding. No new whole-repository gates, live inference, deployments, remote deletions or credential creation were run as part of the audit. A7's separate exact-head review ran its own gates and fault controls; those are not claimed as audit repros.

## Canonical mint ownership: contract handoff still needed

`packages/git/src/artifacts.ts:110,115` and `publisher/client.ts:84` retry non-idempotent canonical token creation after potentially applied internal errors (see artifacts.ts:60–68). `packages/room/src/logremote.ts:45` mints before its finally block. A lost answer can leave an unnamed token outside a cleanup owner's records; a usable publication answer can also be lost between mint and durable pushToken recording at landing/engine.ts:266–267. The ownership loss is evidenced, but a safe complete recovery design needs a contract decision: canonical inventories do not identify an owner and contain concurrent unrelated tokens. Do not turn this into a blanket revoke-all plan. Request explicit ownership of that design and its implementing lanes. Known tokens need durable handoffs; unknown effects need honest observation/retention or a documented provider completion fence. No unauthorized access or credential disclosure is claimed. Measured 60-second publication and longer pin token TTLs remain adopted behavior.

## Considered and excluded

- Room A6 known-token handoff loss: already owned by implementation request `23b96a18f1cb21e521ed0aa44e4b6cb686644d07`, fixed and independently approved in A7 review `b611030c8a060e6c27d3eedb6e18619489f7e8cb`; do not duplicate it.
- Cleanup attention/read projection: already owned by `c0f0592f3c919ce3be248f73c51dcb7e25d75f07`; the correctness plans must preserve that handoff.
- Unsigned checker jobs: trusted bound producers under adopted R-EXEC-8, with new authority design request `f12cef6bae7bf4c3813241df0624199568f14ddf`; not reported as a current vulnerability.
- Harness canonical token sweeps: development-only code, not production cleanup.
- False revoke results: may mean already revoked or absent; not automatically evidence of a live credential.
- Snapshot legacy unknown creates and founding legacy adoption: existing indefinite debt and durable incarnation handling credited; no duplicate defect.
- An unawaited setAlarm alone: insufficient to claim a crash bug without the Workers storage/output-gate contract. Plan 004's evidenced issue is absence of any wake before the first founding create.
- Provider TTLs, normal CAS/complete-forward behavior and expired credentials: do not change them or treat expiry as proof a push did not land.
- Broad performance, dependencies, UI, general auth review and unrelated roadmap features were outside this focused audit. No direction features were ranked against correctness fixes.

Status values: TODO, IN PROGRESS, DONE (with reviewed exact head and receipt), BLOCKED (with reason), REJECTED (with evidence of independent fix or invalid assumption).
