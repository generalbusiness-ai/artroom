# Credential cleanup handoffs

Focused read-only audit under gitseq request `c01205f5d967ccef69319549dd1734b3e108a8b0`, with promise `51ef2bd2a3829800872ccd25f072cbe28dc961f1`. Started at approved main `72d6abde5c6dfa993ac441884e8f966a903b932f`; reconciled to `bd520fb926f8161a722c6f1e23ae4aac29e41a66` after the separately reviewed A7 landing. That landing's tree equals approved head `84e25a78883e03f7accf1a18d66d8866eea94195`. The Git paths below are unchanged; Room founding line references were refreshed.

The improve skill supplied the handoff format. Four verified fixes were selected under the user's standing autonomous checker instruction. Priorities and effort estimates set review order only. They do not cut scope. Source code was not changed by this audit. These plans have not been implemented or approved for landing.

| Order | Plan | Impact | Effort | Fix risk | Confidence | Status |
|---|---|---|---|---|---|---|
| 1 | [001: Complete token inventories](001-complete-token-inventories.md) | Prevent premature workspace grants and writable “ready” snapshots under incomplete provider replies | M | MED | HIGH | DONE, pending review |
| 2 | [002: Unknown fork effects](002-retain-unknown-fork-effects.md) | Preserve late-create cleanup through foreign occupancy | M | LOW | HIGH | DONE, pending review |
| 3 | [003: Terminal publication cleanup](003-retry-terminal-publication-tokens.md) | Retry known credential revocation after a successful landing | M | MED | HIGH | DONE, pending re-review after [review f060871b](#review-f060871b) ([report](#plan-003-report)) |
| 4 | [004: Founding wake](004-persist-founding-wake.md) | Recover first remote founding effects after host interruption | M | MED | HIGH, static path | DONE, pending review |

Plans 001 and 002 touch the same workspace cleanup function; serialize their edits or explicitly reconcile the second head. Plan 004 also touches workspaces.ts and should follow that reconciliation. Plan 003 can proceed independently. Every executor must use a gitseq request/promise, preserve unrelated work, run the stated gates and deliver all artifacts at one exact head for checker review.

## Evidence and limits

Parent read every cited production path and test pattern. Read-only synthetic provider controls using actual exported Workspaces/SnapshotRepos classes and in-memory SQLite reproduced incomplete inventory acceptance and unknown-duty closure on foreign provenance. They do not establish live provider behavior. Terminal revocation and founding interruption were verified by source control-flow analysis; their plans require meaningful regression tests, including actual DO recovery for founding. No new whole-repository gates, live inference, deployments, remote deletions or credential creation were run as part of the audit. A7's separate exact-head review ran its own gates and fault controls; those are not claimed as audit repros.

## Canonical mint ownership: contract handoff still needed

`packages/git/src/artifacts.ts:110,115` and `publisher/client.ts:84` retry non-idempotent canonical token creation after potentially applied internal errors (see artifacts.ts:60–68). `packages/room/src/logremote.ts:45` mints before its finally block. A lost answer can leave an unnamed token outside a cleanup owner's records; a usable publication answer can also be lost between mint and durable pushToken recording at landing/engine.ts:266–267. The ownership loss is evidenced, but a safe complete recovery design needs a contract decision: canonical inventories do not identify an owner and contain concurrent unrelated tokens. Do not turn this into a blanket revoke-all plan. Request explicit ownership of that design and its implementing lanes. Known tokens need durable handoffs; unknown effects need honest observation/retention or a documented provider completion fence. No unauthorized access or credential disclosure is claimed. Measured 60-second publication and longer pin token TTLs remain adopted behavior.

Design for review under request `10fcfe4e`: [notes/2026-10-02-canonical-mint-ownership.md](../notes/2026-10-02-canonical-mint-ownership.md), with the contract in [docs/protocol.md](../docs/protocol.md) section 32 (R-MINT-1 to R-MINT-7). Revisions 2 to 5 answer checker reports `9ff903ab` and `851b215b` and their follow-ups. Approved in review `ad6cc052`. Lane A is implemented, pending review: see [Mint lane A](#mint-lane-a-request-1eda3c5e). Lanes B and C are not yet implemented.

## Considered and excluded

- Room A6 known-token handoff loss: already owned by implementation request `23b96a18f1cb21e521ed0aa44e4b6cb686644d07`, fixed and independently approved in A7 review `b611030c8a060e6c27d3eedb6e18619489f7e8cb`; do not duplicate it.
- Cleanup attention/read projection: already owned by `c0f0592f3c919ce3be248f73c51dcb7e25d75f07`; the correctness plans must preserve that handoff.
- Unsigned checker jobs: trusted bound producers under adopted R-EXEC-8, with new authority design request `f12cef6bae7bf4c3813241df0624199568f14ddf`; not reported as a current vulnerability.
- Harness canonical token sweeps: development-only code, not production cleanup.
- False revoke results: may mean already revoked or absent; not automatically evidence of a live credential.
- Snapshot legacy unknown creates and founding legacy adoption: existing indefinite debt and durable incarnation handling credited; no duplicate defect. (Both were retired later by decision D5, request 73eccbec.)
- An unawaited setAlarm alone: insufficient to claim a crash bug without the Workers storage/output-gate contract. Plan 004's evidenced issue is absence of any wake before the first founding create.
- Provider TTLs, normal CAS/complete-forward behavior and expired credentials: do not change them or treat expiry as proof a push did not land.
- Broad performance, dependencies, UI, general auth review and unrelated roadmap features were outside this focused audit. No direction features were ranked against correctness fixes.

Status values: TODO, IN PROGRESS, DONE (with reviewed exact head and receipt), BLOCKED (with reason), REJECTED (with evidence of independent fix or invalid assumption).

## Implementation report: plans 001, 002 and 004

Gitseq request `b2509b23e82ae7c5aa31535a31f66c595a72df25`, branch `request/cc-workspace`, from main `bd520fb926f8161a722c6f1e23ae4aac29e41a66`. One commit per plan, in plan order: 001, then 002 on top of it (both change `cleanForkNow`), then 004. Main `a319360a` (checker bindings) was then merged in; it touches none of this branch's paths. The plan files were committed as recorded in assert `4efb1ef3`; their sha256 digests matched before the status lines below were edited. Plan 003 was not part of this request, and its file is not in this tree.

All three plans are **DONE, pending review**. No plan's premise turned out to be wrong, and no STOP condition applied. Nothing was deployed, no live Cloudflare call was made, and no credential was created.

### What changed

**Plan 001: complete token inventories.** `completeInventory` in `packages/git/src/artifacts.ts` accepts a listing only when its records account for its total and every record has a non-empty ID, a known scope and state, and a timestamp-string expiry. Otherwise it throws. The founding validator (`Workspaces.inventoryOf`) now uses it; its rules are unchanged, except that a redundant type check on the total was dropped (the strict count comparison already rejects a missing or non-number total). Workspace cleanup (`cleanForkNow`) and snapshot preparation (`SnapshotRepos.prepare`) also use it. An incomplete or malformed workspace listing leaves every duty owed and on its backoff, so the workspace is never ready and gets no grant. An incomplete snapshot listing issues nothing, and the repository keeps its owed deletion. Each caller keeps its own active and expiry filter. The recorded lease token is still kept, and the creation token is still revoked, only on the proven fork. The binding's `listTokens()` takes no paging parameter, so the pagination STOP condition did not apply. Provider documentation was not consulted, because no live calls were allowed.

**Plan 002: unknown fork effects through foreign occupancy.** When a repository that is not this canonical repo's fork holds a lane fork's name, `cleanForkNow` still settles answered and owed duties: our fork is gone, and so are its tokens. It no longer settles a step that is still in flight. That step keeps its inventory on the existing capped backoff (`cleanFork`'s `finally` advances it), and it does not block a lease. The foreign repository is still only read for provenance (`get` and `info`).

**Plan 004: founding wake before the first create.** `WorkspacesOptions.wake` is a new optional async callback. `createIncarnation` records the create step in one transaction, then awaits `wake(now)` and only then sends the create. If the wake rejects, nothing is sent and the step is closed as `not-sent`; debt recorded earlier is kept. `CoreOptions.wake` passes the callback through, and `Room.wake` persists the alarm. Wake-ups run one at a time, each reads the stored alarm and only ever moves it earlier, and the alarm cache is set only after storage accepts the alarm. `schedule()` now clears its cache when a store is rejected. The Room constructor schedules any founding debt it finds (`blockConcurrencyWhile` with `recover`), so recovery does not need a new found request.

### Tests and gates

Every new test below failed on the code before its fix, except two plan 002 controls (a definite refusal, and an answered create), which check behaviour that had to stay the same. For plan 004, the failures include the Durable Object test: its alarm assertion failed while the first create was held.

| Plan | Gate | Tests or command | Result |
|---|---|---|---|
| 001 | Every malformed or incomplete case, both callers | `workspaces.test.ts`: "plan 001: a fork inventory with …", one test per listing shape (9 shapes: an empty page with a positive total, no total, no list of records, no ID, an empty ID, an unknown scope, an unknown state, an unreadable expiry, an expiry that is not a string). `snapshots.test.ts`: "plan 001: the creation token's revocation fails and the inventory has …", the same 9 shapes | Pass |
| 001 | Lease token kept, creation token ended | the same workspace tests (after recovery the only live token is the lease's), and "an incomplete inventory after the lease token is minted" | Pass |
| 001 | Restart controls; an unrelated canonical token untouched | "an unrecorded token on a released fork, while inventories are incomplete …"; "across a restart, an incomplete inventory never makes a snapshot ready …"; each per-shape workspace test also restarts over the same SQLite | Pass |
| 002 | Late create, restart, foreign isolation, backoff | "plan 002: a fork creation whose answer is lost, a foreign repository at the name …"; "foreign, absent, foreign and ours again …" (8 restarted hosts; the backoff grows and is capped at 30 minutes; the next check is always in the future) | Pass |
| 002 | Definite refusal and an ordinary answered create | "plan 002: a fork creation refused unchanged …"; "an ordinary fork creation that answered, not yet swept …"; the existing provenance and readiness tests | Pass |
| 004 | Actual Durable Object: alarm persisted before the first create; a stopped host's debt is serviced by a fresh object's alarm | `founding-gaps.test.ts`: "the alarm is in storage while the first create is outstanding …" (inspects storage while the create is held, aborts the object, applies the create late, then runs only `runDurableObjectAlarm`) | Pass |
| 004 | Wake failure sends nothing; earliest alarm kept | "an alarm that cannot be stored …"; "an earlier alarm already in storage is kept …"; "wake-ups asked for at once …"; Node: "plan 004: a wake-up that cannot be stored …" and "the founding wake-up is stored after the create step is on record …" | Pass |
| 004 | Older ledger, unfounded room, healthy founding, legacy adoption (since retired by decision D5), sealed isolation | "a fresh object schedules founding debt it finds …"; the existing founding-gaps and founding tests | Pass |
| All | Root and package gates | `npm ci`; `npm run typecheck`; `npm test`; `npm run test:workers -w @generalbusiness/artroom-git` (8 tests); `npm run test:node -w @generalbusiness/artroom-room` (125, after the merge); `npm run test:workerd -w @generalbusiness/artroom-room` (387); `node --test packages/git/test/workspaces.test.ts packages/git/test/snapshots.test.ts` (106); `npm exec -w @generalbusiness/artroom-room -- wrangler deploy --dry-run` (bundles only) | All exit 0, run in that order at the final head of the branch (after main `a319360a` was merged in). Earlier runs were discarded, because another agent shared the scratch directory and a gate script may have been mixed |
| All | Scope | `git diff --name-only bd520fb9..HEAD`: only the plans' drift-check paths and `plans/` | Pass |

One note on the Durable Object test. In the workerd test pool, aborting an object does not complete while an RPC request to it is still in flight, or while its pending work resolves a promise created by the test. Either way the test hangs. So the test performs the Worker's founding steps itself (the registry binding and the seed), starts `room.core.found` inside the object, and polls a plain flag. The founding code path, the storage and the abort are all real.

### Mutation table

Each mutant was applied alone to the merged code and the relevant suites were run (the Node Git tests; for plan 004 also the workerd founding tests); then the file was restored. Every mutant turned at least one test red.

| ID | Mutation | Red tests |
|---|---|---|
| M1 | 001: drop the total-versus-count check | 9 (empty-page and no-total cases for both callers, both restart controls, the post-mint test, founding a35b4b61) |
| M2 | 001: drop the per-record check | 14 |
| M3a, M3b | 001: drop the ID type check, or the non-empty ID check | 2, 2 |
| M4 | 001: drop the scope check | 2 |
| M5 | 001: drop the state check | 3 |
| M6a, M6b | 001: drop the expiry type check, or the expiry parse check | 2, 2 |
| M7 | 001: drop the records-list check | 1 (after the "no list of records" case was added; it first survived) |
| M8 | 001: workspace sweep reads `.tokens` unvalidated | 10 |
| M9 | 001: snapshot preparation reads `.tokens` unvalidated | 10 |
| M10 | 001: founding inventory reads `.tokens` unvalidated | 4 (existing a35b4b61 tests) |
| N1 | 002: settle every duty under a foreign occupant (the old behaviour) | 2 |
| N2 | 002: settle only answered duties | 1 (existing owed-debt test) |
| N3 | 002: settle only owed duties | 2 |
| N4 | 002: remove `cleanFork`'s backoff `finally` | 4 |
| P1 | 004: no wake before the create | 4 (2 Node, 2 workerd) |
| P2 | 004: send the create after a failed wake | 2 |
| P3 | 004: leave the never-sent step in flight | 2 |
| P4 | 004: wake not awaited | 3 |
| P4b | 004: wake moved after the create's answer | 4 |
| P5 | 004: Room wake overwrites an earlier stored alarm | 2 |
| P6 | 004: Room wake sets its cache before storage accepts | 2 |
| P7 | 004: `schedule()` keeps its cache after a rejected store | 1 |
| P8 | 004: no constructor recovery | 1 |
| P9 | 004: wake-ups not serialized | 1 |

The first version of the validator had a type check on the total that no test could turn red. It was removed, because it was redundant, not because it was hard to test. An explicit `recheck` in plan 002's branch duplicated `cleanFork`'s `finally`, and was removed for the same reason.

### Not changed here (for separate requests)

- The Room's snapshot `wake` (`core.ts`, `snapshotRepos`) still calls `committed()`, which issues `setAlarm` without awaiting it. So `SnapshotRepos.prepare` can send a create before the alarm is confirmed in storage. Plan 004 asked for this to be reported, not fixed.
- Constructor recovery covers founding debt only. A founded room still relies on its stored alarm, as before.
- `packages/room/src/jobs.ts` validates its canonical inventory with its own rule, which does not check scope. Future consumers should use `completeInventory`.
- The development harness in `packages/git/src/worker.ts` (now `packages/git/measure/harness/worker.ts`, decision D5) reads listings unvalidated. It is out of scope, as the audit noted.

## Follow-up c9cd4cd8

Gitseq request `c9cd4cd859e9f715a743a674845e1c7e0cc4b994`, branch `request/cc-followup`, from main `93a2552e`. It closes the three gaps the report above left for separate requests. No unrelated token is revoked, and no unknown effect is settled by time or by a clean observation.

| Item | Change | Tests (each failed before the change) | Mutants (each turned the tests red) |
|---|---|---|---|
| 1. The snapshot wake-up is stored before a snapshot create | `core.ts`: `SnapshotRepos` wakes through the Room's persisted alarm (`CoreOptions.wake`), not `committed()`. `repos.ts`: if the wake-up cannot be stored, `prepare` sends nothing, closes the step as `not-sent` and drops its row | `snapshot-repos.test.ts`: "the alarm is in storage while the snapshot create is outstanding …" (with no alarm stored beforehand, the test holds the create, checks storage, aborts the object, applies the create late, and a fresh object's alarm deletes the repository); "a snapshot wake-up that cannot be stored …". `snapshots.test.ts` (Node): "follow-up c9cd4cd8: a wake-up that cannot be stored sends no create …" | Q1: the wake-up is `committed()` again (2 red). Q2: the failed wake-up leaves the step in flight (2). Q3: the create is sent after a failed wake-up (2) |
| 2. A fresh Room object schedules every debt it owns | `room.ts`: `recover()` stores an alarm for `nextAlarm()` in a founded room (snapshot, workspace and job-token cleanup, and the rest of the alarm's work), and for `foundingDue()` before founding | Durable Object restart controls, each with no alarm stored before the restart: "a snapshot repository's owed deletion …" (`snapshot-repos.test.ts`); "a released workspace whose token revocation and inventory are owed …" (`followup-c9cd4cd8.test.ts`); "(2) with no alarm stored, a fresh object stores one, and its alarm observes the unknown mint without settling it" (`job-token-mint.test.ts`). Each also runs the stored alarm and checks the debt is serviced; the unknown mint stays open | Q4: founding-only recovery, as before (3 red). Q5: founded-only recovery (1, the plan 004 founding control) |
| 3. Job inventories use `completeInventory` | `jobs.ts` uses the shared rule, now exported from the Git package's `index.ts`; the note text is unchanged | `job-token-mint.test.ts`: "(3) an inventory with a record of an unknown scope …" and "… a record whose expiry is not a timestamp string …". The old rule counted such a record as a live token | Q6: the old inline rule (2 red). Q7: no validation (3) |

Gates at the exact head of the branch: see the request's report. Not changed here: the development harness listings in `packages/git/src/worker.ts` (now `measure/harness/worker.ts`), which the audit put out of scope.

## Plan 003 report

Status: DONE, pending checker re-review. Reviews `1473992512c5bf7f973bfb8044cb45edebd7b7c5` and `f060871bfd1610447865b3069b3e48efd6f6c349` requested changes, made as described [below](#review-14739925). Implemented under request `7da437bcb901741837f61bc149a00c723c7c8217` on branch `request/cc-terminal` (the plan suggested `request/terminal-publication-cleanup`; the assignment named this one), from main `bd520fb926f8161a722c6f1e23ae4aac29e41a66`. The head for review is the commit that carries this report. The plan and this README are byte-identical to the copies attached to assert `4efb1ef348723189487e0a383b25db5b71d661f7` when first committed (sha256 `731c4cee…` and `6f8b9717…`). No gitseq delivery is recorded yet; the requester publishes it.

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
| Targeted: `node --test packages/git/test/landing.test.ts` | 52 tests, at the head carrying this report | Exit 0 |
| Package types: `npm run typecheck -w @generalbusiness/artroom-git` | (also within root typecheck) | Exit 0 |
| Worker storage: `npm run test:workers -w @generalbusiness/artroom-git` | 10 tests, at the head carrying this report | Exit 0 |
| Root: `npm ci`, `npm run typecheck`, `npm test` | Every workspace, including the Room's workerd suite | Exit 0 |
| Scope: `git diff --name-only bd520f..HEAD` | The four plan paths, plus `plans/003-…md` and `plans/README.md`; since review f060871b also the Room alarm control `packages/room/test/workerd/review-f060871b.test.ts`, which that review asked for | As allowed, with that one test added at the review's request |

The Room's workerd suite prints workerd "code had hung" uncaught-exception messages, but it passes. The same messages appeared with main's landing sources when checked at the first delivery, and their number varies from run to run, so this change did not cause them.

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
- A Room alarm that starts a pass now sets its next wake before the pass ends. *Correction (review f060871b):* this revision said that could add only one wake about a second later. That held only for the Durable Object stand-in, whose revocations answer at once and whose alarm floor is one second. In the production Room, a pass still waiting on Artifacts left the owed record's past due time in `nextDue()`, so every alarm asked for another about 10 ms later. Review f060871b's change, below, fixes that.

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

## Review f060871b

Review `f060871bfd1610447865b3069b3e48efd6f6c349` of head `611edea7` found the repair for review 14739925 sound, and requested changes for two P2 defects. Both reproduced.

1. **Repeated immediate wakes.** While a pass waited on Artifacts, `nextDue()` still returned the owed record's past due time. The production Room's alarm clamps that to about 10 ms ahead, so it kept running its whole work cycle while the pass skipped.
2. **Completion failures.** If Artifacts answered but the completion transaction failed, the throw ended the pass silently. The debt kept its old due time, and the next alarm repeated the revocation at once.

**Change** (`engine.ts` and `core.ts`):

- While a pass is in progress, owed revocations are not due before the current attempt's timeout, that is, the attempt's start plus `REVOKE_TIMEOUT_MS` (30 s). `Landing.nextDue()` passes that time to `LandingCore.nextDue(cleanupNotBefore)`. The time moves with each attempt in the batch, and is cleared when the pass ends.
- Other work that is due still sets an earlier wake. A restarted instance has no pass, so overdue records are due at once.
- When Artifacts answers but the completion transaction fails, that counts as a failure, with the durable backoff, the same as a refusal or a timeout. If storage cannot record even the retry, the record keeps its due time, and the pass goes on with the rest of its batch. The stopped-instance check still comes first, so a dead instance writes nothing.
- Unchanged: single flight, the batch bound, the timeout, the backoff, held-slot priority, a later publication's progress, and revocation by the record's own ID.
- A Room alarm that starts a pass now sets its next wake no later than the pending attempt's timeout. When the pass ends sooner, any record it rescheduled waits for that wake, at most 30 s after the attempt started.

**Tests:**

| Control | What it shows |
|---|---|
| `landing.test.ts`: "review f060871b: while a cleanup pass waits on an answer, the owed revocations are due again when its current attempt times out…" | Two overdue records. `nextDue()` is the attempt's start plus 30 s, and moves when the second attempt starts. An accepted operation still makes it "now". A restarted room owes the record at once. |
| `landing.test.ts`: "review f060871b: a revocation answered whose completion cannot commit counts as a failure with backoff…" | A `BEFORE DELETE` trigger fails completion. Both records take the 2 s backoff, `tokenRevoked` rolls back, and the batch continues. With an `UPDATE` trigger too, both are still tried and keep their due times. After recovery, both complete, with one receipt each. |
| `landing-do.test.ts`: "review f060871b: a failure recording the cleanup duty rolls the landing back…" | Adapted from the checker's SQL fixture, across real Durable Object restarts. A failed duty insert rolls the landing back. A failed completion keeps the debt on its 2 s backoff with `tokenRevoked` false. After recovery, the next attempt completes, with one receipt. |
| `packages/room/test/workerd/review-f060871b.test.ts` | Adapted from the checker's alarm fixture: the production Room with real `Room.alarm` runs. While a revocation is pending: five alarms, one call, no stored alarm under 1 s, and `nextDue` between 1 s and 30 s ahead. After completion: no debt and no landing wake. On a 200 ms timeout: backoff 2 s, the next due time is the record's, and an earlier alarm sends nothing. |

The earlier Durable Object test's last phase now runs the alarm itself, and checks that any wake left is bounded and finds nothing owed. The checker's two original fixtures also pass unchanged against this head.

**Mutation testing.** Every mutant was red on `landing.test.ts`; the extra suites are noted.

| Mutant | Red |
|---|---|
| W1 `nextDue` ignores the pass | wake control; Room control |
| W2 core keeps the overdue time (min instead of max) | wake control; Room control |
| W3 the wake does not move per attempt | wake control (the Room control has one record per pass, so it does not catch this) |
| W5 completion failure not caught | completion control; Durable Object SQL control |
| W6 completion failure counted as done | completion control; Durable Object SQL control |
| W7 an unrecordable retry ends the batch | completion control |
| W9 the pass defers debt an hour past its timeout | wake control; Room control |
| M1–M20, M7b and N1–N5, re-anchored to the new loop | each red, 1 to 13 tests |

**Scope.** The Room control is a new test file outside plan 003's four paths. Review f060871b asked for a production Room alarm control, and the coordinator asked for it explicitly. No Room source changed.

## Mint lane A (request 1eda3c5e)

Status: DONE, pending checker review. Gitseq request `1eda3c5e`, branch `request/mint-ledger`, cut from main `b803d210`. It implements lane A of [notes/2026-10-02-canonical-mint-ownership.md](../notes/2026-10-02-canonical-mint-ownership.md) ("Lane A: the ledger"), as approved in review `ad6cc052`, under [docs/protocol.md](../docs/protocol.md) section 32 (R-MINT-1 to R-MINT-7). The head for review is the commit that carries this section.

**Scope.** Code is added only: `packages/git/src/mints.ts` (new), `packages/git/src/index.ts` (exports), and `packages/git/test/mints.test.ts` (new). No caller changes; lanes B and C do that. This section, and the status line above, are the only other edits. Nothing was deployed, no live Cloudflare call was made, and no credential was created.

### What was built

`MintLedger`, on the Room's SQLite through the package's `Sql` interface (a Durable Object's storage or `node:sqlite`). It creates its own tables, as the other Git package classes do: `artroom_mint` (the records) and `artroom_mint_summary` (one row).

```ts
const mints = new MintLedger({ sql, repo, now, wake, known, waitMs? /* default 30 s */, sleep? /* tests */ });
const t = await mints.mint(purpose, "read" | "write", (sentAt) => ttlSeconds, { notAfter? });
//   t: { id, plaintext, scope, expiresAt, release(), claim() }
await mints.withToken(purpose, scope, ttl, async (t) => …);   // mint, run, release
await mints.reconcile();   // the alarm: keep or clear the takeover time, start a revocation pass, observe if due
mints.nextDue();           // when the alarm should next run, or null
mints.duties({ after, limit });   // one page of records by row ID, with the counts and the observation
await mints.idle();        // tests: the revocation pass and late answers have ended
```

- `repo` is a function that returns the canonical repository (`createToken`, `revokeToken`, `listTokens`), as `canonicalTokens` takes it. Every lookup of it, in `mint()`, the revocation pass and the observation, runs within the bounded wait; a lookup that does not answer in time is that attempt's failure, and one that answers later is dropped, so it starts no provider work. `mint()` looks it up before the record is written, so nothing slow sits between the lifetime and the send. Every provider call (create, revoke, list) is bounded too.
- Every error that a record or the observation keeps goes through `errorNote(stage, error)`: a fixed phrase for the stage, the error's name if it is in a fixed list, an Artifacts code if it is one `artifacts.ts` classifies, and an integer numeric code or HTTP status. No provider message text is stored (review 0ab6dac3). The Room's shared safe-metadata boundary can replace it once the Git package can depend on one.
- `known(tokenId)` is the Room's point lookups in its other records (`job_tokens` and, from lane B, `artroom_land_token`). The ledger checks its own records through an index on token ID.
- Records: `sent`, `held`, `owed` or `unknown`, as in the note's table. A record is deleted when it ends. Row IDs come from `AUTOINCREMENT`, so they are never reused. Every change is `UPDATE … WHERE id = ? AND state = ? RETURNING id` (or the same `DELETE`), and the counts in the summary row change in the same transaction, from the rows that actually changed.
- Before the request: one transaction writes the `sent` record, and moves the takeover time to 60 s ahead if it is less than 30 s away. Then `wake(takeover)` is awaited. Then `ttl(sentAt)` is called, and a second conditional update stores that lifetime and send time on the record (approval obligation 1). Only then is `createToken` called. If any of these fails, the record is deleted and nothing is sent.
- The answer is classified once, as the note says. Usable: a token ID and text, the scope asked, a readable expiry no later than the answer's arrival plus the lifetime asked and no later than `notAfter`, for a caller still waiting. Usable answers become `held` and are returned. A token ID otherwise becomes `owed`, due at once, with its reported expiry or none. A refusal that changed nothing deletes the record. Anything else is `unknown`. Only the `retriable()` classes are retried, up to 5 attempts from 0.5 s, and each attempt is a new record, sent only after the previous one holds its outcome. A caller waits at most 30 s. After that the record is `unknown`, and the answer, whenever it comes, is applied to its own record with no caller. If recording an answer fails, the record keeps its state, the ID is revoked at once, and the record is deleted only when that revocation is answered.
- `release()` revokes by ID, waiting at most 30 s. An answer deletes the record. A refusal, a timeout or a completion that does not commit makes it `owed`, due in 1 s. `claim()` is synchronous: it deletes the `held` record inside the owner's transaction, and throws if the ledger no longer holds it.
- Takeover: the constructor turns every `sent` record into `unknown` and every `held` record into `owed`, due at once, in one indexed update. So a Room builds one ledger per object start.
- `reconcile()`: with records in flight, the takeover time moves 60 s ahead when less than 30 s away; with none, it is cleared. Then a revocation pass starts, unless one is running, and is not awaited. Then at most one observation runs, if one is due, and is awaited (at most 30 s).
- Revocation pass: at most 20 owed records with `due <= now`, ordered by due time, then row ID. Records whose readable expiry has passed are settled first, with no revocation call, in their own transaction, before the repository is looked up. Each other record is revoked by its ID, waiting at most 30 s; the repository is looked up when the first one needs it, within the wait, and a failed lookup is a failure for every record left. Those results are written in one transaction at the end of the pass: at most 20 record writes and one summary write. If that transaction fails, every record in the batch takes its backoff, as a failure. Backoff: 1 s doubling to 5 min, never past a readable expiry. When the pass ends, it stores a wake-up for `nextDue()`.
- Observation: only while a record is `unknown`. One repository lookup and one `listTokens()`, each waited on for at most 30 s; the flag is released when either fails or times out. If the listing has more than 1,000 records, or `completeInventory` refuses it, that is the result and nothing is counted. Otherwise each active, unexpired token is looked up by index and by `known()`. One summary write: the time, the result, the count, and the next due time (a wait doubling from 1 min to 6 h). A new unknown record brings it forward to no sooner than 1 min after the last one.
- `nextDue()`: the earliest of the owed records' minimum due time (not before the current attempt's timeout while a pass waits), the observation time (while any record is unknown; not before its timeout while one is running), and the takeover time (while any record is `sent` or `held`). Each time already passed counts as now plus 1 s. A still-future time counts as itself. So the 1 s step applies only when due <= now, and never postpones a still-future takeover or observation time (approval obligation 2). The Room's `wake` keeps an earlier unrelated alarm.

### Choices where the design left room

These are for the checker to confirm or reject.

1. **The pass writes its results once, at its end** (accepted in review 0ab6dac3; since revised: settlements at a passed expiry are now written first, in their own transaction, so they never wait on a lookup or a revocation. A pass may therefore make two summary writes, one for those settlements and one for its results, and the record writes stay at most 20). The note asks both that "counts change in the same transaction as each record" and that a pass makes "at most 20 record writes and one summary write". One transaction at the end of the pass meets both. The cost: a host that stops during a pass loses the answers it got. Those records stay owed and are revoked again, and a revocation that answers `false` counts as done.
2. **A token owed at once is revoked by the next pass, not inside `mint()`.** Its record holds the ID, and `mint()` stores a wake-up for now. Only the failed-handoff case, where no record holds the ID, revokes inline, as the note says.
3. **Backoff stops at a readable expiry**, so an owed record is settled when its expiry passes, not at its next backoff time after that.
4. **Wake-ups after a debt is recorded are best effort** (review 0ab6dac3 notes that lane B must compose `nextDue()` into the Room's next alarm and store it): on a release failure, an unusable answer, a late answer, or the end of a pass. The debt is durable, and the takeover wake-up, stored while the record was `sent` or `held`, already covers it. The wake-up before a send is required, and a failure there sends nothing.
5. **A failed handoff whose revocation also fails** (review 0ab6dac3 notes this; it stays explicit here: recovery may need a new object start) leaves the record `sent`, as the note says ("keeps its earlier state"). On a live host it then stays in flight: the alarm keeps moving the takeover time until the next object start makes it `unknown`. The same holds for a `release()` that cannot record its debt. That throws, and the record stays `held` until the next start makes it `owed`. Both need storage to fail twice in a row.
6. **A new unknown brings the observation forward but does not reset the doubling.** The note says only "brings it forward". Either way there is at most one inventory a minute.
7. **`nextDue()` reads one indexed minimum, one indexed existence check and the summary row**, where the note says "three indexed minimums". The bound is the same.
8. **Additions to the note's API:** `sleep` (tests only, as `SnapshotRepos` and `canonicalTokens` have), `idle()` (as the landing engine's `cleanupDone()`), `errorNote` and its `ErrorStage` type, and the exported constants. `duties()` includes the token ID, never its text, and caps `limit` at 1,000. `withToken` takes no `notAfter`, because only check jobs need one, and they claim the token.
9. **The bounded wait timing out is not retried,** and neither is a transport failure: only `retriable()` classes are, as `withRetry` does today.

### Tests: rule map

`packages/git/test/mints.test.ts`, 42 tests, named with the note's lane A numbers, and "(checker 1)" or "(checker 2)" for review 0ab6dac3's two findings. Each test is red under at least one mutant below. Without the ledger the file does not load.

| Note | Rules | Tests |
|---|---|---|
| (1) | R-MINT-2 | the record and the stored wake-up in place when `createToken` is called; the lifetime computed after a 20 s wake-up and held on the pre-send record; a failed record write, and a failed wake-up, send nothing and leave no record; the takeover time moves only when under 30 s away |
| (2) | R-MINT-2, R-MINT-5 | applied then `INTERNAL_ERROR`: unknown, and the retry is a new record; the record survives 100 lifetimes, a complete inventory with nothing unaccounted, an incomplete one and a takeover; nothing outside the ledger's records is revoked |
| (3) | R-MINT-3 | a refusal deletes the record, with no retry; a transport failure is unknown, with no retry |
| (4) | R-MINT-3, R-MINT-4 | ID without text owed and revoked by ID; unreadable expiry owed until a revocation is answered; another scope, a longer expiry, or after `notAfter` owed and never returned (an expiry equal to `notAfter` accepted); no ID is unknown; settlement at a readable expiry with no revocation call |
| (5) | R-MINT-3 | an answer held past the wait: error, unknown, then the late ID owed and revoked; a late refusal deletes; a late lost answer stays unknown; a late answer to a record whose unknown state could not be stored is owed, never held |
| (6) | R-MINT-3, R-MINT-4 | failed handoff: record kept, ID revoked at once, record deleted only after the answer; two mints in flight with a claimed row; a stale caller after a takeover gets nothing, and counts stay exact; `claim()` rolls back with its owner |
| (7) | R-MINT-4, R-MINT-7 | takeover: `sent` to unknown, `held` to owed and revoked by ID; the old host's `release` and `claim` do nothing |
| (8) | R-MINT-7 | the takeover time in `nextDue()`, moved on the live host, cleared with nothing in flight; overdue work at now plus 1 s; a still-future takeover, observation or revocation time on time |
| (9) | R-MINT-4, R-MINT-7 | backoff 1 s to 5 min across a takeover; a timeout is a failure and its late answer is dropped; a completion that cannot commit is a failure; a failed or timed-out release is owed; 20 a pass, earliest due first; one pass at a time, not eligible before the attempt's timeout |
| (10) | R-MINT-5, R-MINT-7 | the scale control below; a listing over 1,000 records counts nothing; the observation doubles from 1 min to 6 h, and new unknowns every second give one inventory a minute |
| (checker 1) | R-MINT-7 | a lookup that never answers: `mint()` sends nothing and writes no record; the observation records its result and next time; the pass backs each record off, and a later pass revokes. A lookup that answers only after the wait: backoff recorded, the pass and observation flags released (a new pass or observation starts while the old lookup is out), and the late answer starts no revocation or listing and changes no row. A held lookup never delays settlement at a passed expiry |
| (checker 2) | R-MINT-5 | the checker's control (an accepted token's opaque text echoed in an `Authorization: Bearer` revocation error); every sink (creation, release, the pass, the pass's and the observation's lookups, the listing) with a short opaque text in the message, the name, the code and the status, stores only safe metadata, and neither the rows nor `duties()` contain the text; `errorNote` keeps only allowed names, known codes and bounded integers |
| — | | the bounds are the design's (30 s, 60 s and 30 s, 1 s, 20, 1,000, both backoffs) |

**The scale control (10).** The SQL double wraps `node:sqlite`. It counts the rows each statement returns, and the rows written per table (from `RETURNING` or `changes()`). It also runs `EXPLAIN QUERY PLAN` on every read, update and delete, and records any that scans `artroom_mint` rather than searching an index. Setup: 10,000 unknown records, 900 tokens known to other records, and a backlog of 100 owed records, all due, whose tokens make up the other 100 of the 1,000 listed. Then 40 alarm turns, each at `nextDue()` and each after a new unknown record. Each turn: at most one `listTokens()`; at most 20 record writes; at most one summary write each for the takeover time, the observation and the pass; at most 1,040 rows read; at most 1,000 `known()` calls. Turns that only observe write no record. The five backlog passes revoke the next 20 in due order, and after each, `nextDue()` and the stored wake-up are exactly 1 s ahead. Observations are at least 1 min apart, and each counts 0 unaccounted. No statement scans the records. Paging `duties()` 1,000 at a time reaches all 10,040 remaining records once, each page reading at most 1,002 rows. The counts equal `COUNT(*)` per state: all 10,040 are unknown, and none is owed.

### Mutation table

Each mutant was applied alone to `src/mints.ts` by a script, the mint tests were run, and the file was restored from the commit (`git checkout`). Every mutant turned at least one named test red. T-mutants are the note's mutation targets, O-mutants the approval's two obligations, and G-mutants the other guards. 79 mutants, all red (61 before review 0ab6dac3, and F1 to F18 for its findings). After that review's changes, all 79 were rerun against the final code: the targets of T9a, T9b, G2, G13, G19 and G23 moved and were re-anchored, and T17 and G20 now also break the settlement step before the lookup. The first run left three survivors (T5b, G29, G30). Each was a missing test, not an equivalent mutant, and each now has one: the third (5) test, an assertion in the first (4) test, and one in the scale test. Two tests were then red under no mutant, so G32 and G33 were added to break their guards. G31 was rerun after a fix to the mutant itself, which had broken the syntax.

| Mutant | Mutation | Red tests (number) |
|---|---|---|
| T1a | the wake-up after the send | (1) ×3 |
| T1b | the record after the send (create sent before the record is written) | (1) ×4, (2) |
| T2 | a failed wake-up that still sends | (1) |
| T3a | settling an unknown record by inventory | (2), (7), (10), (checker 1) |
| T3b | settling an unknown record by lifetime | (2), (10) ×2, (checker 1) |
| T3c | settling an unknown record by the owner's end (takeover deletes sent records) | (6) ×2, (7) |
| T4 | a late ID left unknown | (5) ×2, (6) |
| T5a | a late answer given to the caller (no bounded wait on the create) | (5) ×3, (6) ×2 |
| T5b | a late answer treated as for a waiting caller | (5) |
| T6a | a takeover time left out of nextDue() | (8) ×2 |
| T6b | a takeover time not moved ahead by the alarm on the live host | (8) |
| T7 | an observation written to each record | (10) |
| T8 | a new unknown that resets the schedule to under 1 min | (10) ×2 |
| T9a | a revocation batch ordered by newest | (4), (9) ×2, (10) |
| T9b | a revocation batch ordered by row ID only | (9) |
| T10a | an unconditional update by row ID (move) | (5) ×2, (6) |
| T10b | an unconditional delete by row ID (drop) | (5) |
| T11 | a retry under one record (the old hidden withRetry) | (2) |
| T12 | a swallowed revocation failure on release | (8), (9), (checker 2) ×2 |
| T13 | a claim() in its own transaction (deferred out of the owner's) | (6), (7) |
| T14 | notAfter checked after the token is returned (not in the classification) | (4) |
| T15 | ttl computed before the wake-up | (1) ×2 |
| T16a | an overdue nextDue() returned as is | (8), (10) |
| T16b | an overdue nextDue() returned as now plus less than 1 s | (8), (10) |
| T17 | settlement at an unreadable expiry | (4) |
| O1 | the pre-send record does not hold the recomputed lifetime (no second conditional update) | (1) ×2 |
| O2a | the 1 s continuation postpones a still-future time when anything is overdue | (8) |
| O2b | the 1 s continuation applied to a future time too | (8), (checker 1) |
| G1 | a failed wake-up leaves its record | (1) |
| G2 | a refusal leaves the record unknown | (3), (5) |
| G3 | no text check | (4) ×2, (8), (9) ×5, (10), (checker 1) ×3 |
| G4 | no scope check | (4) |
| G5 | no generic expiry check | (4) |
| G6 | no readable-expiry check for use | (4) |
| G7 | takeover in the constructor removed | (6) ×2, (7) |
| G8 | takeover makes held records owed later, not at once | (7) |
| G9 | a late refusal or late ID leaves the unknown count unchanged | (5), (6) |
| G10 | a failed handoff deletes the record before the revocation is answered | (6) |
| G11 | a failed handoff does not revoke the ID | (6) |
| G12 | release revokes a token that is no longer held (claimed) | (6), (7) |
| G13 | no single pass at a time | (9) |
| G14 | owed records eligible while a pass waits on an answer | (9) |
| G15 | a batch of 40 | (9), (10), bounds |
| G16 | backoff does not double | (4), (9), (checker 1) |
| G17 | backoff not capped | (4), (9) |
| G18 | a revocation timeout counts as answered | (9) |
| G19 | a completion that cannot commit is not recorded as a failure | (9) |
| G20 | no settlement at a readable expiry | (4), (checker 1) |
| G21 | backoff carries the next try past a known expiry | (4) |
| G22 | no listing size cap | (10) |
| G23 | an incomplete listing counted | (2) |
| G24 | the takeover time never moved before a send | (1) |
| G25 | no wake-up when a pass ends | (10) |
| G26 | no wake-up for a token owed at once | (4) |
| G27 | a pass's record writes not batched (summary written per record) | (10) |
| G28 | no observation backoff doubling | (10) |
| G29 | observation runs with no unknown records too | (4), (checker 1) |
| G30 | the ledger's own token index not consulted by the observation | (10) |
| G31 | the takeover time not cleared with nothing in flight | (8) |
| G32 | every failure that leaves the outcome unknown is retried, not only the retriable() classes | (3), (8), (10) ×2, (checker 1) ×2 |
| G33 | an answer without a token ID closes the record | (4) |
| F1 | mint's repository lookup unbounded | (checker 1) |
| F2 | the pass's repository lookup unbounded | (checker 1) ×2 |
| F3 | the observation's repository lookup unbounded | (checker 1) ×2 |
| F4 | the lookup's wait not enforced | (checker 1) ×5 |
| F5 | a lookup that answers late still starts provider work | (checker 1) ×5 |
| F6 | expired records settled only inside the pass, behind the lookup | (checker 1) |
| F7 | errorNote keeps the error's message | (checker 2) ×3 |
| F8 | any error name kept | (checker 2) ×2 |
| F9 | any code kept | (checker 2) ×2 |
| F10 | any status kept | (checker 2) ×2 |
| F11 | any numeric code kept | (checker 2) |
| F12 | release stores the provider's text | (checker 2) ×2 |
| F13 | the pass stores the provider's text | (9), (checker 2) |
| F14 | the pass's lookup failure stores the thrower's text | (checker 2) |
| F15 | the observation's lookup failure stores the thrower's text | (checker 2) |
| F16 | the listing failure stores the provider's text | (10), (checker 2) |
| F17 | a create failure stores the provider's text | (checker 2) |
| F18 | an unusable answer's reason quotes the provider's scope | (4) |

### Review 0ab6dac3

Report `0ab6dac3` (changes requested) found two P1 defects at `658d10af`, both reproduced by the checker's controls (`/tmp/artroom-checker-mint-a-v1-controls.ts`).

1. **Confidentiality.** A revocation error that echoed an accepted token's opaque text was stored in `last_error` and shown by `duties()`. A pattern redactor was tried first and rejected by the review: no token format in the contract makes a pattern sufficient. The ledger now stores safe metadata only (`errorNote`, above), at every sink: creation, release, the pass, the repository lookups and the listing. An unusable answer's reason is a fixed phrase ("another scope", not the provider's value).
2. **Availability.** `await repo()` was outside the bounded wait in the observation and the pass (and in `mint()`), so a held lookup held the alarm's observation or the cleanup pass, and its flag, indefinitely. Every lookup is now bounded; a timeout is that attempt's failure with its backoff, the flag is released, and a lookup that answers late is dropped. Records whose readable expiry has passed are settled before any lookup.

The checker's three controls failed at `658d10af` (its log, `/tmp/artroom-checker-mint-a-v1-controls.log`) and pass against this branch's fix (rerun here with only the import paths changed to this worktree). The review accepted choices 1, 2, 3, 6, 7, 8 and 9, and noted 4 and 5, as marked above.

### Gates

Run at the exact head that carries this section; the exit codes are in the delivery report. In this order: `npm run typecheck -w @generalbusiness/artroom-git` and `npm test -w @generalbusiness/artroom-git` (Node); then from the root `npm ci`, `npm run typecheck` and `npm test`; then the note's lane gates: `npm run test:workers -w @generalbusiness/artroom-git`, `npm run test:node -w @generalbusiness/artroom-room`, `npm run test:workerd -w @generalbusiness/artroom-room`, and `npm exec -w @generalbusiness/artroom-room -- wrangler deploy --dry-run` (bundles only; nothing is uploaded).

### Not changed here

Every caller: `canonicalTokens`, the landing engine and core, the publisher client, the log remote, snapshot preparation and check jobs keep their own mints until lanes B and C. The Room does not build a ledger yet, so nothing in production uses it. The package README is unchanged; lane B, which puts the ledger in the Room, can describe it there.
