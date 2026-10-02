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
| 004 | Older ledger, unfounded room, healthy founding, legacy adoption, sealed isolation | "a fresh object schedules founding debt it finds …"; the existing founding-gaps and founding tests | Pass |
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
- The development harness in `packages/git/src/worker.ts` reads listings unvalidated. It is out of scope, as the audit noted.

## Follow-up c9cd4cd8

Gitseq request `c9cd4cd859e9f715a743a674845e1c7e0cc4b994`, branch `request/cc-followup`, from main `93a2552e`. It closes the three gaps the report above left for separate requests. No unrelated token is revoked, and no unknown effect is settled by time or by a clean observation.

| Item | Change | Tests (each failed before the change) | Mutants (each turned the tests red) |
|---|---|---|---|
| 1. The snapshot wake-up is stored before a snapshot create | `core.ts`: `SnapshotRepos` wakes through the Room's persisted alarm (`CoreOptions.wake`), not `committed()`. `repos.ts`: if the wake-up cannot be stored, `prepare` sends nothing, closes the step as `not-sent` and drops its row | `snapshot-repos.test.ts`: "the alarm is in storage while the snapshot create is outstanding …" (with no alarm stored beforehand, the test holds the create, checks storage, aborts the object, applies the create late, and a fresh object's alarm deletes the repository); "a snapshot wake-up that cannot be stored …". `snapshots.test.ts` (Node): "follow-up c9cd4cd8: a wake-up that cannot be stored sends no create …" | Q1: the wake-up is `committed()` again (2 red). Q2: the failed wake-up leaves the step in flight (2). Q3: the create is sent after a failed wake-up (2) |
| 2. A fresh Room object schedules every debt it owns | `room.ts`: `recover()` stores an alarm for `nextAlarm()` in a founded room (snapshot, workspace and job-token cleanup, and the rest of the alarm's work), and for `foundingDue()` before founding | Durable Object restart controls, each with no alarm stored before the restart: "a snapshot repository's owed deletion …" (`snapshot-repos.test.ts`); "a released workspace whose token revocation and inventory are owed …" (`followup-c9cd4cd8.test.ts`); "(2) with no alarm stored, a fresh object stores one, and its alarm observes the unknown mint without settling it" (`job-token-mint.test.ts`). Each also runs the stored alarm and checks the debt is serviced; the unknown mint stays open | Q4: founding-only recovery, as before (3 red). Q5: founded-only recovery (1, the plan 004 founding control) |
| 3. Job inventories use `completeInventory` | `jobs.ts` uses the shared rule, now exported from the Git package's `index.ts`; the note text is unchanged | `job-token-mint.test.ts`: "(3) an inventory with a record of an unknown scope …" and "… a record whose expiry is not a timestamp string …". The old rule counted such a record as a live token | Q6: the old inline rule (2 red). Q7: no validation (3) |

Gates at the exact head of the branch: see the request's report. Not changed here: the development harness listings in `packages/git/src/worker.ts`, which the audit put out of scope.

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
