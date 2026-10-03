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

Design note for review under request `a2cbd459`, following assert `4e4134b4` as corrected by `b2cdc44a` (acts are declared by each application): [notes/2026-10-02-declared-acts.md](../notes/2026-10-02-declared-acts.md).

## Evidence and limits

Parent read every cited production path and test pattern. Read-only synthetic provider controls using actual exported Workspaces/SnapshotRepos classes and in-memory SQLite reproduced incomplete inventory acceptance and unknown-duty closure on foreign provenance. They do not establish live provider behavior. Terminal revocation and founding interruption were verified by source control-flow analysis; their plans require meaningful regression tests, including actual DO recovery for founding. No new whole-repository gates, live inference, deployments, remote deletions or credential creation were run as part of the audit. A7's separate exact-head review ran its own gates and fault controls; those are not claimed as audit repros.

## Canonical mint ownership: contract handoff still needed

`packages/git/src/artifacts.ts:110,115` and `publisher/client.ts:84` retry non-idempotent canonical token creation after potentially applied internal errors (see artifacts.ts:60–68). `packages/room/src/logremote.ts:45` mints before its finally block. A lost answer can leave an unnamed token outside a cleanup owner's records; a usable publication answer can also be lost between mint and durable pushToken recording at landing/engine.ts:266–267. The ownership loss is evidenced, but a safe complete recovery design needs a contract decision: canonical inventories do not identify an owner and contain concurrent unrelated tokens. Do not turn this into a blanket revoke-all plan. Request explicit ownership of that design and its implementing lanes. Known tokens need durable handoffs; unknown effects need honest observation/retention or a documented provider completion fence. No unauthorized access or credential disclosure is claimed. Measured 60-second publication and longer pin token TTLs remain adopted behavior.

Design for review under request `10fcfe4e`: [notes/2026-10-02-canonical-mint-ownership.md](../notes/2026-10-02-canonical-mint-ownership.md), with the contract in [docs/protocol.md](../docs/protocol.md) section 32 (R-MINT-1 to R-MINT-7). Revisions 2 to 5 answer checker reports `9ff903ab` and `851b215b` and their follow-ups. Approved in review `ad6cc052`. Lane A landed at `7be42275` (review `84b71c71`): see [Mint lane A](#mint-lane-a-request-1eda3c5e). Lane B is implemented, pending review: see [Mint lane B](#mint-lane-b-request-78f0971c). Lane C is not yet implemented.

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

Status: DONE, landed at `7be42275`, approved in review `84b71c71`. Gitseq request `1eda3c5e`, branch `request/mint-ledger`, cut from main `b803d210`. It implements lane A of [notes/2026-10-02-canonical-mint-ownership.md](../notes/2026-10-02-canonical-mint-ownership.md) ("Lane A: the ledger"), as approved in review `ad6cc052`, under [docs/protocol.md](../docs/protocol.md) section 32 (R-MINT-1 to R-MINT-7). The head for review is the commit that carries this section.

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
- `reconcile()`: with records in flight, the takeover time moves 60 s ahead when less than 30 s away; with none, it is cleared. Then a revocation pass starts, unless one is running, and is not awaited. Then at most one observation runs, if one is due, and is awaited: its repository lookup and its listing share one deadline, 30 s (`waitMs`) from its start, so the whole observation waits at most 30 s. A revocation pass, which the alarm does not await, waits at most 30 s for its lookup and 30 s for each of up to 20 revocations.
- Revocation pass: at most 20 owed records with `due <= now`, ordered by due time, then row ID. If any of them has a readable expiry that has passed, the pass settles only those, with no revocation call and no wait, in one transaction with one summary write, and ends; `nextDue()` then puts the next pass 1 s later, and that pass revokes the rest. Otherwise the pass looks up the repository, within the wait, and then, immediately before each revocation, checks the record's expiry again: a record whose expiry passed during the lookup or an earlier revocation is settled with no call, on the lookup's failure path too. Each other record is revoked by its ID, waiting at most 30 s, and a failed lookup is a failure for each of them. Those results are written in one transaction at the end of the pass. So every pass makes at most 20 record writes and one summary write. If that transaction fails, every record in the batch takes its backoff, as a failure. Backoff: 1 s doubling to 5 min, never past a readable expiry. When the pass ends, it stores a wake-up for `nextDue()`.
- Observation: only while a record is `unknown`. One repository lookup and one `listTokens()`, sharing one deadline 30 s from the start: a slow lookup leaves less time for the listing, and a lookup that leaves none means no listing is started. The flag is released when either fails or the deadline passes. If the listing has more than 1,000 records, or `completeInventory` refuses it, that is the result and nothing is counted. Otherwise each active, unexpired token is looked up by index and by `known()`. One summary write: the time, the result, the count, and the next due time (a wait doubling from 1 min to 6 h). A new unknown record brings it forward to no sooner than 1 min after the last one.
- `nextDue()`: the earliest of the owed records' minimum due time (not before the current attempt's timeout while a pass waits), the observation time (while any record is unknown; not before its timeout while one is running), and the takeover time (while any record is `sent` or `held`). Each time already passed counts as now plus 1 s. A still-future time counts as itself. So the 1 s step applies only when due <= now, and never postpones a still-future takeover or observation time (approval obligation 2). The Room's `wake` keeps an earlier unrelated alarm.

### Choices where the design left room

These are for the checker to confirm or reject.

1. **The pass writes its results once, at its end** (accepted in review 0ab6dac3). Settlement at a passed expiry must not wait on a lookup (that review), and a pass makes one summary write (the note's bound, which the checker's extra controls on `19f6e389` held to). So a pass that finds expired records settles only those and ends, and the next pass, 1 s later, revokes the rest. This is the simplest way to meet both: one more pass, never a second summary write, and no record waits for a lookup to be settled at its expiry. The note asks both that "counts change in the same transaction as each record" and that a pass makes "at most 20 record writes and one summary write". One transaction at the end of the pass meets both. The cost: a host that stops during a pass loses the answers it got. Those records stay owed and are revoked again, and a revocation that answers `false` counts as done.
2. **A token owed at once is revoked by the next pass, not inside `mint()`.** Its record holds the ID, and `mint()` stores a wake-up for now. Only the failed-handoff case, where no record holds the ID, revokes inline, as the note says.
3. **Backoff stops at a readable expiry**, so an owed record is settled when its expiry passes, not at its next backoff time after that.
4. **Wake-ups after a debt is recorded are best effort** (review 0ab6dac3 notes that lane B must compose `nextDue()` into the Room's next alarm and store it): on a release failure, an unusable answer, a late answer, or the end of a pass. The debt is durable, and the takeover wake-up, stored while the record was `sent` or `held`, already covers it. The wake-up before a send is required, and a failure there sends nothing.
5. **A failed handoff whose revocation also fails** (review 0ab6dac3 notes this; it stays explicit here: recovery may need a new object start) leaves the record `sent`, as the note says ("keeps its earlier state"). On a live host it then stays in flight: the alarm keeps moving the takeover time until the next object start makes it `unknown`. The same holds for a `release()` that cannot record its debt. That throws, and the record stays `held` until the next start makes it `owed`. Both need storage to fail twice in a row.
6. **A new unknown brings the observation forward but does not reset the doubling.** The note says only "brings it forward". Either way there is at most one inventory a minute.
7. **`nextDue()` reads one indexed minimum, one indexed existence check and the summary row**, where the note says "three indexed minimums". The bound is the same.
8. **Additions to the note's API:** `sleep` (tests only, as `SnapshotRepos` and `canonicalTokens` have), `idle()` (as the landing engine's `cleanupDone()`), `errorNote` and its `ErrorStage` type, and the exported constants. `duties()` includes the token ID, never its text, and caps `limit` at 1,000. `withToken` takes no `notAfter`, because only check jobs need one, and they claim the token.
9. **The bounded wait timing out is not retried,** and neither is a transport failure: only `retriable()` classes are, as `withRetry` does today.

### Tests: rule map

`packages/git/test/mints.test.ts`, 47 tests, named with the note's lane A numbers, "(checker 1)" or "(checker 2)" for review 0ab6dac3's two findings, "(checker 3)" for review 6a979799's two P2 findings, and "(checker 4)" for its P3. Each test is red under at least one mutant below. Without the ledger the file does not load.

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
| (checker 3) | R-MINT-4, R-MINT-7 | a readable expiry that passes while the lookup is held is settled and never revoked, whether the lookup answers or times out; a mixed due batch (two expired, two revocable records) makes one summary write a pass and settles every record within two passes, the second 1 s after the first; a record that expires while an earlier revocation in its pass waits is settled, not revoked, in that pass's one summary write |
| (checker 4) | R-MINT-7 | an observation's lookup and listing share one deadline: a lookup that takes 200 ms of a 300 ms deadline leaves the listing 100 ms, and the observation ends by the deadline; a lookup that uses the whole deadline means no listing is started |
| — | | the bounds are the design's (30 s, 60 s and 30 s, 1 s, 20, 1,000, both backoffs) |

**The scale control (10).** The SQL double wraps `node:sqlite`. It counts the rows each statement returns, and the rows written per table (from `RETURNING` or `changes()`). It also runs `EXPLAIN QUERY PLAN` on every read, update and delete, and records any that scans `artroom_mint` rather than searching an index. Setup: 10,000 unknown records; 890 tokens known to other records; a backlog of 100 owed records, all due; and 10 owed records due earliest whose readable expiry has passed. Those 1,000 tokens are all that is listed. Then 40 alarm turns, each at `nextDue()` and each after a new unknown record. Each turn: at most one `listTokens()`; at most 20 record writes; at most one summary write each for the takeover time, the observation and the pass, and at most one that changes the counts; at most 1,040 rows read; at most 1,000 `known()` calls. Turns that only observe write no record. The first pass settles the 10 expired records with no revocation call, and the next is 1 s later. The five backlog passes after it revoke the next 20 in due order, and after each, `nextDue()` and the stored wake-up are exactly 1 s ahead. Observations are at least 1 min apart, and each counts 0 unaccounted. No statement scans the records. Paging `duties()` 1,000 at a time reaches all 10,040 remaining records once, each page reading at most 1,002 rows. The counts equal `COUNT(*)` per state: all 10,040 are unknown, and none is owed.

### Mutation table

Each mutant was applied alone to `src/mints.ts` by a script, the mint tests were run, and the file was restored from the commit (`git checkout`). Every mutant turned at least one named test red. T-mutants are the note's mutation targets, O-mutants the approval's two obligations, and G-mutants the other guards. 85 mutants, all red, and every test is red under at least one: 61 before review 0ab6dac3, F1 to F18 for its findings, H1 to H4 for review 6a979799's P2s, and J1 and J2 for its P3. All 85 were rerun against the final code (the table below is that run). After each review, mutants whose target lines had moved were re-anchored (T9a, T9b, G2, G13, G19, G23, F2, F14), and T17 and G20 also break the settlement of expired records before a pass's lookup. The first run left three survivors (T5b, G29, G30). Each was a missing test, not an equivalent mutant, and each now has one: the third (5) test, an assertion in the first (4) test, and one in the scale test. Two tests were then red under no mutant, so G32 and G33 were added to break their guards. G31 was rerun after a fix to the mutant itself, which had broken the syntax.

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
| T9a | a revocation batch ordered by newest | (4), (9) ×2, (10), (checker 3) ×2 |
| T9b | a revocation batch ordered by row ID only | (9) |
| T10a | an unconditional update by row ID (move) | (5) ×2, (6) |
| T10b | an unconditional delete by row ID (drop) | (5) |
| T11 | a retry under one record (the old hidden withRetry) | (2) |
| T12 | a swallowed revocation failure on release | (8), (9), (checker 2) ×2 |
| T13 | a claim() in its own transaction (deferred out of the owner's) | (6), (7) |
| T14 | notAfter checked after the token is returned (not in the classification) | (4) |
| T15 | ttl computed before the wake-up | (1) ×2 |
| T16a | an overdue nextDue() returned as is | (8), (10), (checker 3) |
| T16b | an overdue nextDue() returned as now plus less than 1 s | (8), (10), (checker 3) |
| T17 | settlement at an unreadable expiry | (4) |
| O1 | the pre-send record does not hold the recomputed lifetime (no second conditional update) | (1) ×2 |
| O2a | the 1 s continuation postpones a still-future time when anything is overdue | (8) |
| O2b | the 1 s continuation applied to a future time too | (8), (checker 1) |
| G1 | a failed wake-up leaves its record | (1) |
| G2 | a refusal leaves the record unknown | (3), (5) |
| G3 | no text check | (4) ×2, (8), (9) ×5, (10), (checker 1) ×3, (checker 3) ×3 |
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
| G20 | no settlement at a readable expiry | (4), (10), (checker 1), (checker 3) ×3 |
| G21 | backoff carries the next try past a known expiry | (4) |
| G22 | no listing size cap | (10) |
| G23 | an incomplete listing counted | (2) |
| G24 | the takeover time never moved before a send | (1) |
| G25 | no wake-up when a pass ends | (10) |
| G26 | no wake-up for a token owed at once | (4) |
| G27 | a pass's record writes not batched (summary written per record) | (10), (checker 3) ×2 |
| G28 | no observation backoff doubling | (10) |
| G29 | observation runs with no unknown records too | (4), (checker 1), (checker 3) |
| G30 | the ledger's own token index not consulted by the observation | (10) |
| G31 | the takeover time not cleared with nothing in flight | (8) |
| G32 | every failure that leaves the outcome unknown is retried, not only the retriable() classes | (3), (8), (10) ×2, (checker 1) ×2, (checker 4) ×2 |
| G33 | an answer without a token ID closes the record | (4) |
| F1 | mint's repository lookup unbounded | (checker 1) |
| F2 | the pass's repository lookup unbounded | (checker 1) ×2, (checker 3) |
| F3 | the observation's repository lookup unbounded | (checker 1) ×2 |
| F4 | the lookup's wait not enforced | (checker 1) ×5, (checker 3) |
| F5 | a lookup that answers late still starts provider work | (checker 1) ×5, (checker 3) |
| F6 | expired records settled only inside the pass, behind the lookup | (10), (checker 1), (checker 3) |
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
| H1 | no expiry recheck immediately before revoking | (checker 3) ×2 |
| H2 | no expiry recheck on the lookup's failure path | (checker 3) |
| H3 | expiry judged before the lookup, not after | (checker 3) ×2 |
| H4 | a pass that settles expired records goes on to revoke the rest (two summary writes) | (10), (checker 3) |
| J1 | the listing gets a full wait of its own, not what is left of the shared deadline | (checker 4) |
| J2 | the listing is started with no time left | (checker 4) |

### Review 0ab6dac3

Report `0ab6dac3` (changes requested) found two P1 defects at `658d10af`, both reproduced by the checker's controls (`/tmp/artroom-checker-mint-a-v1-controls.ts`).

1. **Confidentiality.** A revocation error that echoed an accepted token's opaque text was stored in `last_error` and shown by `duties()`. A pattern redactor was tried first and rejected by the review: no token format in the contract makes a pattern sufficient. The ledger now stores safe metadata only (`errorNote`, above), at every sink: creation, release, the pass, the repository lookups and the listing. An unusable answer's reason is a fixed phrase ("another scope", not the provider's value).
2. **Availability.** `await repo()` was outside the bounded wait in the observation and the pass (and in `mint()`), so a held lookup held the alarm's observation or the cleanup pass, and its flag, indefinitely. Every lookup is now bounded; a timeout is that attempt's failure with its backoff, the flag is released, and a lookup that answers late is dropped. Records whose readable expiry has passed are settled before any lookup.

The checker's three controls failed at `658d10af` (its log, `/tmp/artroom-checker-mint-a-v1-controls.log`) and pass against this branch's fix (rerun here with only the import paths changed to this worktree). The review accepted choices 1, 2, 3, 6, 7, 8 and 9, and noted 4 and 5, as marked above.

### Review 6a979799

Report `6a979799` on `19f6e389` (changes requested) found two P2 defects and one P3, the first two with the checker's extra controls (`/tmp/artroom-checker-mint-a-v2-extra-controls.ts`).

1. **P2: expiry not rechecked after the lookup.** A record whose readable expiry passed while the pass's repository lookup was held was revoked afterwards, because its expiry was checked before that wait. The pass now looks up the repository first, then checks each record's expiry immediately before both the no-repository result and the revocation call. A record that expired meanwhile is settled with no call.
2. **P2: two summary writes in a mixed pass.** Settling expired records before the lookup, then writing the revocation results, made two summary writes in one pass, against the note's bound of one. The bound is kept, not amended: a pass that finds expired records settles only those, with one summary write, and ends; the next pass, 1 s later, revokes the rest. This is the simplest way to keep both one summary write a pass and settlement that never waits on a lookup. The scale control now has 10 expired records in its backlog and checks one count write a pass.
3. **P3: the observation's waits.** The report said 30 s, but the lookup and the listing each had 30 s. They now share one deadline, so the whole observation waits at most 30 s, the bound the note adopted and lane B's alarm composition relies on.

The checker's first extra control passes. Its second asserts that a mixed batch (one expired, one revocable record) is fully settled by a single `reconcile()` with one count write. With the design above, its count assertion holds (one write), but its first assertion, `owed === 0` after that one call, fails by design: the revocable record is revoked by the next pass, 1 s later. Both together are not possible while settlement at expiry must not wait on a lookup. The first write must come before the lookup, and the revocation's count change after it. "(checker 3) a mixed due batch …" is the replacement control: one count write in each pass, and every record settled within two passes.

### Gates

Run at the exact head that carries this section; the exit codes are in the delivery report. In this order: `npm run typecheck -w @generalbusiness/artroom-git` and `npm test -w @generalbusiness/artroom-git` (Node); then from the root `npm ci`, `npm run typecheck` and `npm test`; then the note's lane gates: `npm run test:workers -w @generalbusiness/artroom-git`, `npm run test:node -w @generalbusiness/artroom-room`, `npm run test:workerd -w @generalbusiness/artroom-room`, and `npm exec -w @generalbusiness/artroom-room -- wrangler deploy --dry-run` (bundles only; nothing is uploaded).

### Not changed here

Every caller: `canonicalTokens`, the landing engine and core, the publisher client, the log remote, snapshot preparation and check jobs keep their own mints until lanes B and C. The Room does not build a ledger yet, so nothing in production uses it. The package README is unchanged; lane B, which puts the ledger in the Room, can describe it there.

## Mint lane B (request 78f0971c)

Status: DONE, pending checker review. Gitseq request `78f0971c`, branch `request/mint-publication`, cut from main `7be42275` and merged with main `25a7b837` (idle write storms, request `3da1d82b`), so the head for review is the combined one. It implements lane B of [notes/2026-10-02-canonical-mint-ownership.md](../notes/2026-10-02-canonical-mint-ownership.md) ("Lane B: the publication token, and the ledger in the Room"), as approved in review `ad6cc052`, under [docs/protocol.md](../docs/protocol.md) section 32 (R-MINT-1 to R-MINT-7). The head for review is the commit that carries this section.

**Scope.** The note's lane B paths on main's current layout (post-D5): `packages/git/src/artifacts.ts` (`canonicalTokens` removed), `src/index.ts`, `src/landing/engine.ts`, `src/landing/core.ts`, the Git harness at `packages/git/measure/harness/worker.ts`, `packages/git/test/support.ts`, `test/landing.test.ts`, `test-workers/worker.ts` and `test-workers/landing-do.test.ts`, `packages/room/src/core.ts`, and a new Room workerd file, `packages/room/test/workerd/mint-publication-78f0971c.test.ts`. The two package READMEs name the new API where they named `canonicalTokens`. Nothing was deployed, no live Cloudflare call was made, and no credential was created.

### What was built

```ts
// Git package
const tokens = publicationTokens({ mints, repo, waitMs? /* 30 s */, sleep? });   // PublicationTokens
await tokens.mint(`publish:${op}:${n}`); // the ledger's token: { id, plaintext, expiresAt, claim(), release() }; 60 s write, as before
await tokens.revoke(tokenId);            // by ID; lookup, revocation and withRetry's retries share one bounded wait
core.pushToken(op, n, tokenId, claim, expiresAt);  // one transaction: the ID on the attempt, the token's row, claim()
core.tokenRevoked(op, n);                // also deletes the token's row, by its ID
core.knownToken(tokenId);                // one point lookup in artroom_land_token; no operation is read
// FaultPoint "token-answered": after the mint's answer, before pushToken

// Room
core.mints;                // one MintLedger per object start, built with the core
core.steps.mints(due?);    // its own loop work kind, "mints"
core.nextAlarm();          // includes max(mints.nextDue(), the "mints" backoff), unless the canonical repository is gone
```

- **The publication mint.** `PublicationTokens.mint(owner)` is the ledger's `mint(owner, "write", () => 60)`: a `sent` record and the stored wake-up before the create, the lifetime asked after the wake-up, a 30 s bounded wait, and any retry under a new record (lane A). The engine calls it once per push attempt and never retries it. Its owner is `publish:<op>:<n>`.
- **The handoff.** `pushToken` takes `claim` and calls it inside its transaction, after recording the ID on the attempt and inserting the token's `artroom_land_token (token PRIMARY KEY, op, n, expires_at)` row with Artifacts' reported expiry. A rollback leaves the ledger owning the token (still `held`) and no row. The engine then releases the token in the background (revoked by its ID; a failure makes it `owed`), never awaited by the publication queue (R-MINT-4), and rethrows. `cleanupDone()` also waits for those releases (tests).
- **The token rows (R-MINT-7).** `pushToken` writes a row and `tokenRevoked` deletes it, in their own transactions; nothing else does. So a row is kept while a revocation fails, after the operation ends too, until plan 003's cleanup pass or the held operation's own revocation is answered; no row is settled at expiry. A room stored before this change fills the rows once, at its first start, under the meta key `token-index`: one per unrevoked token of an active operation, and one per cleanup record (plan 003's `adoptEndedTokens` runs first, so every ended operation's unrevoked token is there).
- **The fault point.** `token-answered` sits between the mint's answer and `pushToken`. A host that stops there leaves the token with the ledger, `held`; the next object's ledger takes it over (`owed`, due at once) and its alarm revokes it by its ID, while the engine completes the publication forward with a new attempt.
- **Revocation of publication tokens.** `canonicalTokens().revoke` is replaced by `publicationTokens().revoke`: the repository lookup and the revocation, with `withRetry`'s retries of a transient error, inside one bounded wait (30 s). A timeout is a failure, as before for the caller; a later answer is dropped, and nothing is sent after the wait ends: the end is checked when each attempt starts (after a retry's sleep) and after each lookup, immediately before the send (review `d4a4c681`, below).
- **Safe metadata.** A mint that fails is recorded on the push attempt as `token not minted (<errorNote("create failed", e)>)`: the stage, a known error name and code and bounded integers, never the provider's text (lane A's `errorNote`).
- **The Room.** `RoomCore` builds the ledger in its constructor, before the landing engine, with the Room's persisted `wake` (read the stored alarm, store only an earlier one, resolve once stored), the room clock, the canonical repository, and `known(id)`: a primary-key lookup in `job_tokens`, then `landing.core.knownToken(id)`. The landing engine's tokens are `publicationTokens({ mints, repo })`. The `mints` step runs `mints.reconcile()` (takeover time, revocation pass, observation; each checks its own durable due time). `nextAlarm()` includes the ledger's `nextDue()`, so the Room's start-up recovery (`Room.recover`, which stores `nextAlarm()` through `wake`) schedules the ledger's debt with no request, and every alarm stores the earlier of the ledger's time and the Room's other work (`schedule` and `wake` only ever move the stored alarm earlier).
- **The "mints" loop kind (merged with request `3da1d82b`).** The step is its own kind in `LOOP_KINDS`: a failure of the step itself (storage failing in `reconcile`, say) sets `loop_backoff.mints`, 5 s doubling to 5 min, and an alarm that runs earlier for other work skips the step. It is never pending by rows: the ledger times its own work. Like landing's, its backoff ends only when the step runs (`SELF_TIMED`), and `nextAlarm()` uses the later of the ledger's time and the backoff. It needs the canonical repository: while `canonical_gone` is set, the ledger's records are kept, and it is neither run nor scheduled. The other kinds' fences are unchanged.
- **The harnesses.** The Git harness (`measure/harness/worker.ts`) builds its own ledger, includes it in its alarm and schedule, and still type-checks (checked with a scratch tsconfig; the package gates do not cover it). The Git Workers test Room mints through a real ledger over a token table that stands in for Artifacts.

### Choices where the design left room

These are for the checker to confirm or reject.

1. **Recovery may need a new object start** (lane A's choice 5, carried as the checker asked). Three cases. (a) A host that stops between the answer and `pushToken` (the `token-answered` point): on a live host nothing uses the token again, but the record stays `held`, its takeover time kept ahead by each alarm (control "several alarms on a live host"), until a new object takes it over and revokes it. (b) `pushToken` rolls back and the background release's revocation fails: the record becomes `owed` and the ledger's pass revokes it, with no new start needed; only if storage also refuses to record that does it stay `held` until the next start. (c) Lane A's failed handoff whose revocation fails stays `sent` until the next start. All three need either a stopped host or storage failing twice.
2. **A rolled-back `pushToken` releases the token in the background**, not awaited by the publication queue (R-MINT-4), rather than leaving it `held` for a takeover. The note says only that "the token is revoked later"; releasing at once is sooner, and a failed release is still the ledger's debt.
3. **`publicationTokens().revoke` keeps `withRetry`**, inside one 30 s bound. The held operation's revocations and plan 003's cleanup pass behaved this way with `canonicalTokens`, except that the wait was unbounded. A retry is safe for a revocation by ID. Revocations by the ledger itself (lane A) do not retry.
4. **The `mints` loop kind** follows the coordinator's direction on the merge with request `3da1d82b`: a fence after a failure of the step itself, never pending by rows (rows that are unknown for the life of the room would otherwise keep the kind backed off), its backoff ending only when it runs, and held while the canonical repository is gone. The cost: after a step failure, every ledger time (takeover move, revocations, observation) waits for the fence, at most 5 minutes. A record's own backoff is unchanged.
5. **While the canonical repository is gone, the ledger is neither run nor scheduled.** Its revocations and observation cannot succeed, and running them would write a backoff every few minutes forever. Records are kept, never settled.
6. **The step runs last in `runAll`**, after publication, so the observation's bounded wait (at most 30 s) never delays the log.
7. **The landing row stores Artifacts' reported expiry** when the mint gives one; the one-time fill stores NULL, as the operation never recorded it. The expiry is shown nowhere and decides nothing: a landing row ends only with `tokenRevoked`.
8. **A pass's last wake-up stays.** When the last pass of a backlog ends, the alarm already stored for the attempt's timeout (at most 30 s ahead) is kept, because a wake never moves an alarm later; it runs, finds nothing due and writes nothing. The backlog control shows this between the last pass and the lease alarm. Review f060871b accepted the same for the landing's cleanup pass.
9. **The backlog control's "a publication lands meanwhile".** The publication's own landing work is due at once, so while it runs the Room stores an alarm for now, as it always has. The control checks the bounds (no stored alarm under 1 s ahead, none past the held attempt's timeout) before the publication and again after the landing's alarm has run. All the ledger's own wake-ups stay within those bounds throughout.
10. **Pre-existing provider text in the landing record is not changed here.** The engine still stores `message(e)` for a failed read of main (`readBackFailed`), a push that did not answer, and a failed integration. Lane B changed only the mint's failure, which it now owns. A separate request should apply the safe-metadata rule there. (Done by request `d29c09fa`: see [below](#request-d29c09fa-safe-error-metadata-at-durable-sinks).)
11. **Test hooks.** The Room controls run the room clock a week ahead of real time with no alarm delay, so a stored alarm is the room's own time and never fires by itself; they set hooks on one object only (its `schedule`, `storeAlarm`, the engine's `tokens.revoke`, the ledger's `waitMs` and `reconcile`, and the canonical fake's `revokeToken`), and restore the suite's existing clock and alarm delay. The idle control counts rows written through a spy on that object's `Sql`.

### Tests: rule map

Git package, `packages/git/test/landing.test.ts` ("mint lane B …", 10 tests, with the production `publicationTokens` and a real `MintLedger` over a canonical repository double; a restart is a new engine and a new ledger on the same SQLite), and `packages/git/test-workers/landing-do.test.ts` (1 new test, real Durable Object restarts). Room, `packages/room/test/workerd/mint-publication-78f0971c.test.ts` (10 tests, the production Room with real storage and alarms). The note's (1) and (2) are red at `3ac55e96` by construction: there was no ledger to own the token.

| Note | Rules | Tests |
|---|---|---|
| (1) | R-MINT-4, R-MINT-7 | Node: a host stops at `token-answered`; the token is the ledger's alone (`held`, on no attempt, in no row); a restart 10 s later makes it `owed`, due 1 s ahead; the ledger revokes it by its ID once; the publication lands forward with attempt 2, one receipt, no live token, no record, no row. Workers: the same across a real abort, through the alarm alone |
| (2) | R-MINT-2, R-MINT-5 | Applied, then `INTERNAL_ERROR`: one `unknown` record, the ledger's retry is a new record whose token is pushed, the same outcome, slot and receipts, and the applied token never revoked, past its lifetime and an observation. A lost answer: one create (the engine does not retry), one `unknown` record, the attempt's detail is safe metadata only, and the next attempt lands |
| (3) | R-MINT-3, R-MINT-4 | A trigger fails `pushToken`'s save: no ID on the attempt, no row, the ledger still owns the token (its release failed, so `owed`), and its pass revokes it by its ID; the publication lands later with a new token. The release is off the publication queue: `publish` ends while it is unanswered |
| (4) | R-MINT-4, R-MINT-7 | The row: written by `pushToken` with the reported expiry, the ledger's record gone in the same transaction; deleted by the held operation's revocation; kept while revocations fail, after the operation ends and past the token's expiry; deleted by plan 003's cleanup pass. A trigger on the row's insert rolls `pushToken` back (and the ledger's release revokes the token); one on its delete rolls `tokenRevoked` back, and the duty stays until it commits |
| (5) | R-MINT-7 | A stored room with an active operation's unrevoked token and an ended operation's owed token gains both rows at its first start, and not again |
| (6) | R-MINT-5, R-MINT-7 | An observation over a listing of exactly those two tokens counts 0 unaccounted; the SQL spy shows two point lookups in `artroom_land_token` and no statement on `artroom_land_op` |
| (7) | | All earlier landing, plan 003 and review f060871b tests pass unchanged (only `FakeTokens` gained the new interface's fields) |
| (8) no alarm stored | R-MINT-2, R-MINT-7 | With no alarm stored and the Room's own scheduling off on that object, while the publication's create is held: an alarm no later than the takeover time, stored by the ledger's wake. A wake that takes 20 s of room time comes before the lifetime: the record holds 60 s and the post-wake send time, and the token expires 60 s after it (approval obligation 1) |
| (8) answer lost | R-MINT-5, R-MINT-7 | Abort while the create is held; it applies late. The fresh object has the record `unknown` and stores an alarm by the observation's time (1 s ahead); one alarm observes once (1 unaccounted: the late token; the publication's own live token is known by its row), keeps the record, and stores the next observation (60 s) on time; after the lifetime and another observation, still `unknown`, the late token never revoked |
| (8) earlier alarm | R-MINT-4, R-MINT-7 | The token held after `token-answered`; an alarm for other work 20 s later lands the publication and leaves a stored alarm no later than the takeover time; with no alarm stored, the fresh object stores the ledger's (1 s ahead, the only work due), and its alarm takes over and revokes the token by its ID |
| (8) wake not stored | R-MINT-2 | Storage refuses every alarm: no create while publishing, no record, the attempt's detail is safe metadata only; on a fresh object the publication lands |
| (8) live host | R-MINT-7 | Four alarms, 35 s apart, with a long-held token: each moves the takeover time to 60 s ahead; every stored alarm is at least 1 s ahead and no later than the takeover time; the live host's token is not revoked |
| (8) backlog | R-MINT-4, R-MINT-7 | 45 owed records and one unknown; the first revocation held. While held: one call, `nextDue` at the attempt's timeout, the stored alarm between 1 s ahead and that timeout, also after a publication has reserved, pushed and landed and the landing's own alarm has run. The attempt times out with its backoff; the batch's other 19 are revoked; then through alarms alone the next 20, then the last 5 and the held one, earliest due first, each next alarm exactly 1 s after its pass; the lease alarm, earlier than the next observation, is kept; once it has run, the observation's time is stored exactly (approval obligation 2) |
| (8) expiry | R-MINT-4, R-MINT-7 | A ledger record with a readable expiry whose revocations fail is settled at its expiry: no revocation after it, the token never marked revoked. A landing row for a token whose revocations fail stays past its expiry, with plan 003's record, until `tokenRevoked` |
| idle | R-MINT-7 (request 3da1d82b) | A write spy on the object's `Sql`: the `mints` step, `nextDue` and `nextAlarm` write 0 rows with no records, and with an unknown record whose next observation is not due. A job token's ID (a `job_tokens` row) is not counted as unaccounted |
| fence | request 3da1d82b | A failure of the step sets `loop_backoff.mints` (5 s); `nextAlarm` and the stored alarm wait for it though the ledger's time is earlier; an earlier alarm skips the step and keeps the backoff; at its end the step runs, revokes, and clears it |
| gone | request 3da1d82b | With `canonical_gone` set, the step does not run the ledger, its record is kept, and `nextAlarm` is null |

### Mutation table

Each mutant was applied alone by a script (`/private/tmp/claude-501/mintB/mutants/run.py`) at the merge head `720a7fd4`, the suites named were run, and the file was restored from the commit (`git checkout`). B-mutants are in the Git package and were run against all three suites: `landing.test.ts` (Node), the Git Workers suite, and the Room file; R-mutants are in the Room and were run against the Room file. T marks the note's lane B mutation targets, O the approval's obligations, F the checker's lessons for this lane, and G the other guards. 32 mutants, all red; every new test is red under at least one. No earlier test went red under any mutant. Review `d4a4c681` added K1 and K2 ([below](#review-d4a4c681)), both red.

| Mutant | Kind | Mutation | Red tests |
|---|---|---|---|
| B1 | T | no `claim` in `pushToken` | Node (1), (2) applied-then-error, (4) row, (6); Workers (1); Room: no alarm stored, answer lost, earlier alarm, live host, expiry |
| B2 | T | `claim` outside `pushToken`'s transaction (before it) | Node (3) trigger, (3) off-queue, (4) triggers |
| B3 | T | the token row written outside `pushToken`'s transaction (after it) | Node (3) off-queue, (4) triggers |
| B4 | T | the token row not deleted by `tokenRevoked` | Node (1), (4) row, (4) triggers, bounded revocation; Workers (1); Room: expiry |
| B5 | T | the fill skipped | Node (5) |
| B6 | T | the fill run at every start | Node (5) |
| B7 | T | `knownToken` reading operation bodies (active operations and cleanup records) | Node (6) |
| B8 | T | the engine retrying the mint itself | Node (2) lost answer |
| B9 | G | the `token-answered` point after `pushToken`, not before | Node (1); Workers (1); Room: earlier alarm, live host |
| B10 | G | no release when `pushToken` does not commit | Node (3) trigger, (3) off-queue, (4) triggers |
| B11 | F | the release awaited on the publication queue | Node (3) off-queue |
| B12 | F | the publication token's revocation unbounded | Node bounded revocation |
| B13 | F | retries of that revocation going on after the bound | Node bounded revocation |
| B14 | F | a failed mint's detail keeping the provider's text | Node (2) lost answer; Room: wake not stored |
| B15 | G | the fill leaving out the cleanup records | Node (5) |
| B16 | G | the token row without the reported expiry | Node (4) row |
| B17 | G | the publication lifetime changed (120 s) | Room: no alarm stored (60 s held, expiry 60 s after the post-wake send) |
| R1 | T | the alarm never runs the ledger (no `mints` step) | Room: backlog, answer lost, expiry, earlier alarm, idle, live host, fence |
| R2 | T | `nextAlarm()` leaving out the ledger | Room: backlog, earlier alarm, live host, fence |
| R3 | T | start-up recovery leaving out the ledger | Room: earlier alarm |
| R4 | G | the ledger's wake not persisted (the commit hook instead of the stored alarm) | Room: no alarm stored, wake not stored |
| R5 | G | a failed wake swallowed | Room: wake not stored |
| R6 | G | `known` leaving out the landing's token rows | Room: answer lost |
| R7 | G | `known` leaving out job tokens | Room: idle |
| R8 | G | a ledger built per alarm (a takeover at every alarm) | Room: earlier alarm, live host |
| R9 | O | the ledger's time replacing an earlier unrelated one | Room: backlog |
| R10 | G | `mints` not self-timed (an early alarm clears its backoff) | Room: fence |
| R11 | G | the `mints` step ignoring its fence | Room: fence, gone |
| R12 | G | `nextAlarm()` ignoring the `mints` fence | Room: fence |
| R13 | G | the ledger run while the repository is gone | Room: gone |
| R14 | G | the ledger scheduled while the repository is gone | Room: gone |
| R15 | G | `mints` pending by rows (the 5-second loop fences it) | Room: backlog, fence |

Lane A's mutants (T1 to T17, O1, O2, G1 to G33, F1 to F18, H1 to H4, J1, J2) guard `mints.ts`, which this lane does not change; its 47 tests pass unchanged in the Node gate.


### Review d4a4c681

Report `d4a4c681` on `af89862b` (changes requested) found one P2. `publicationTokens().revoke` checked whether its bounded wait had ended only when an attempt started, before `await o.repo()`. A repository lookup still out at the deadline, the first or a retry's, therefore sent its revocation when it answered, outside the bounded pass and possibly overlapping a later durable retry. The checker's 25 ms deferred-lookup controls saw one provider call where none was expected, and two where one was.

**Change** (`engine.ts` only): the check now runs after the lookup too, immediately before `revokeToken` is sent. The check when an attempt starts stays; it covers a retry whose sleep outlasts the wait. A give-up is a failure for the caller, so the held operation's attempt, or plan 003's cleanup record, keeps the debt for a later bounded pass. Every other bounded provider path was checked for the same gap. The engine's other revocations go through this function. The mint ledger's lookups (`mints.ts`) resolve to nothing when their wait ends, so a late lookup starts no provider work (lane A's F5). The Room passes only the repository function.

| Control (`landing.test.ts`, 200 ms wait) | What it shows |
|---|---|
| "review d4a4c681: a revocation whose repository lookup is still out when the bounded wait ends …" | The first lookup is held past the wait, then answers: no provider call. The landing goes on, its debt and token row stay, and a later cleanup pass revokes the token by its ID with one call |
| "review d4a4c681: a retry whose repository lookup is still out …" | The first attempt fails with a transient error, and the retry's lookup is held past the wait: one call, not two. The debt stays, and a later pass revokes the token |
| "review d4a4c681: a retry whose sleep outlasts the bounded wait …" | The retry's sleep is held past the wait: no further lookup and one call. The debt stays, and a later pass revokes the token |

| Mutant | Mutation | Red tests |
|---|---|---|
| K1 | no check after the lookup (the reviewed head's code) | the first two controls |
| K2 | no check when an attempt starts | the sleep control |

### Gates

Run at the exact head that carries this section, serially, with logs in `/private/tmp/claude-501/mintB/`; the exit codes are in the delivery report. In this order: `npm run typecheck -w @generalbusiness/artroom-git`, `npm test -w @generalbusiness/artroom-git` (Node) and `npm run test:workers -w @generalbusiness/artroom-git`; `npm run typecheck -w @generalbusiness/artroom-room`, `npm run test:node -w @generalbusiness/artroom-room` and `npm run test:workerd -w @generalbusiness/artroom-room`; then from the root `npm ci`, `npm run typecheck` and `npm test`; then `npm exec -w @generalbusiness/artroom-room -- wrangler deploy --dry-run` (bundles only; no credentials, nothing is uploaded). The Git harness is type-checked separately with a scratch tsconfig, as the package gates do not cover `measure/`.

### Not changed here

Lane C's sites keep their own mints: the publisher client's `withToken` (integrate, pinning, previews), the log remote, snapshot preparation's canonical read token and check jobs (`watchMint` and its `mint:` rows). The Room's `known` already includes `job_tokens`, so lane C's claim into that table needs no change here. `mints.ts` is unchanged. Showing the ledger's records to admins stays with the cleanup projection request (`8d249233`).

## Request d29c09fa: safe error metadata at durable sinks

Status: DONE, pending checker review. Gitseq request `d29c09fa`, branch `request/land-errors`, cut from main `574568b2`. Revised for review `f80d6692` (changes requested: legacy rows) and the checker's founding control on `18d69cda`: see [Review f80d6692](#review-f80d6692). The head for review is the commit that carries this section.

**The rule** (review `0ab6dac3`, lane A's standard). A durable or projected error field keeps lane A's `errorNote(stage, error)` and nothing more: a fixed stage phrase, the error's name if it is in a fixed list, an Artifacts code if `artifacts.ts` classifies it, and an integer numeric code or HTTP status. It never keeps the provider's message, even redacted: no token format in the contract lets a pattern find every credential. Operator logs are different. The Room's `diagnose` (`src/diag.ts`, request `d268d249`) logs the error's name and its redacted, bounded message; that is unchanged.

**What changed.** `errorNote` stays in `packages/git/src/mints.ts`, so lane C's edits there merge mechanically. Its `ErrorStage` type gains the new phrases, and the package exports `errorNote`, `ErrorStage` and `knownArtifactsCode` (the error's code if it is a known Artifacts code, else null). `publisher/push-outcome.ts` adds `outcomeNote(outcome)`: `push answered: <outcome>`, the kind of refusal, and an Artifacts refusal code from `ARTIFACTS_REFUSALS`.

### Sinks

Fixed (the stored text before, and now):

| Sink | Where | Before | Now |
|---|---|---|---|
| Landing record `lastError`, main not read back after a push (also `PublicationStatus.lastError`) | `landing/engine.ts` `readBackAndApply` → `core.readBackFailed` | `main could not be read: <message>` | `errorNote("main could not be read", e)` |
| Push attempt `detail`, a push that did not answer | `engine.ts` `publishStep` | `push did not answer: <message>` | `errorNote("push did not answer", e)` |
| Push attempt `detail`, a push that answered | `engine.ts` `publishStep` | git's stdout and stderr from the sandbox (only `art_v…` tokens redacted) | `outcomeNote(answer)` |
| Landing record `lastError`, a failed integration (the engine's catch) | `engine.ts` `prepare` → `core.prepared` | `<message>` | `errorNote("integration failed", e)` |
| `IntegrateResult.detail`, which the record keeps, from the Room's publisher | `publisher/client.ts` `ContainerPublisher.integrate` | `<message>` (token lookup, mint or sandbox error) | `errorNote("integration failed", e)` |
| `IntegrateResult.detail` from the Node publisher | `publisher/git-publisher.ts` | `GitError` message: git's stderr | `errorNote("integration failed", e)` |
| Landing record `lastError`, readiness that cannot be computed | `engine.ts` `evaluateNow` → `core.readinessFailed` | `<message>` (policy runtime, Artifacts reads) | `errorNote("readiness could not be computed", e)` |
| Workspace `artroom_ws.error`, and the failed workspace operation's `error.message` (its view, and act records that hold it) | `workspace/workspaces.ts` `failure` | `Could not provision the workspace: <message>`, token pattern redacted | `errorNote("could not provision the workspace", e)` |
| `artroom_ws_duty.last_error`, a failed or refused remote step | `workspaces.ts` `failedStep`, `answered` | `String(e)`, token pattern redacted | `errorNote("workspace step failed", e)` |
| `artroom_ws_duty.last_error`, cleanup owed after a failure (8 call sites, all through `defer`) | `workspaces.ts` `defer` | the same | `errorNote("workspace cleanup failed", e)`; `defer` now takes the error, not text |
| `artroom_snap_duty.last_error`: a failed create, an unresolved create's check, failed cleanup | `snapshot/repos.ts` create, `recheck`, `defer` | `String(e)`, token pattern redacted | `errorNote("snapshot create failed" / "snapshot create not yet seen" / "snapshot cleanup failed", e)` |
| Room `job_tokens.last_error`, and `jobTokenDuties().status` (operators): a lost mint, an unreadable inventory, a failed revocation | `room/src/jobs.ts` | `redact(String(e))` (`diag.ts`) | `answer lost: errorNote("create failed", e)`, `outcome unknown; errorNote("the token inventory could not be read", e)`, `errorNote("revocation failed", e)` |
| Room `meta.publication_error`, and the code in the caller's `unavailable` message | `room/src/core.ts` `publish` | the thrown error's `code`, any string | a known code (lane L's `PublishErrorCode`, the Room's `unknown-version` and `cohort-mismatch`), else a known Artifacts code, else `transport` |

Left as they are, with the reason:

| Sink | Why it is left |
|---|---|
| `artroom_mint.last_error`, the observation, `MintLedger.duties()` | Lane A: already `errorNote` |
| Push attempt `detail` `token not minted (…)` and `abort attempt before the push started` | Lane B's `errorNote`, and a fixed phrase |
| `job_tokens.last_error` values `ended`, `held`, `minting`, `refused`, `malformed answer`; the observation `N live token(s) … not accounted for at <time>`; the inventory's `… is incomplete or malformed` | The Room's own text, with counts and times. `jobs.ts` no longer runs them through `redact`, as they hold no provider text |
| `notify_queue.last_error` | Fixed phrases: `policy runtime failure`, `runtime failure` |
| `check_jobs.outcome` | `not-needed`, `unbound`, `refused: <rule>`, or a report's ID |
| `reason` and `done_reason` of `artroom_ws_duty` and `artroom_snap_duty`; a refused first commit (`the first commit was refused`) | Fixed codes and phrases |
| A workspace failure from `CleanupOwed` or `NotOurFork` | The Room's own messages: a count, and (since review `f80d6692`) a fixed sentence with no repository names |
| Landing `reason` and `fix`, `land-outcome` events; a `policy-invalid` refusal naming the first configuration problem | Retry and failure codes and the Room's fix text. A configuration problem comes from parsing and validating `.artroom/*.json` in the integration: repository content the members wrote, not provider text |
| Previews' `failed` body | A fixed `ArtroomError` ("The preview could not be computed.") |
| Attention and admin items | Built from fixed templates with IDs, lanes, generations and times; none from an error. `log-publication-stalled` names `NOT_FOUND` and the repository, in fixed text |
| `keys.reason`, `revoked_keys.reason`, a check report's `detail` | Text from signed acts, written by members |
| Operator logs: `RoomCore.diagnose` | A log, not a row or a projection: the error's name and its redacted message (request `d268d249`). The Room tests here check that the diagnoses hold none of the three samples either |
| Fields read at runtime and never stored: `PushOutcome.detail` inside the publisher (pinning reads `[up to date]`, `toLogOutcome` its refusal code), lane L's `PublishError` message and refusal detail (they reach the diagnosis log; `publication_error` keeps the code), `FirstCommitOutcome.detail`, `StageResult.detail`, `GitError` messages, and errors to clients (`toArtroomError` gives unknown errors a fixed message) | Not durable and not projected. `outcomeNote` is applied at the engine, not in the publisher, because pinning and the log push read the publisher's text at runtime |

### Choices for the checker

1. **The publishers return safe metadata**, and the engine stores `IntegrateResult.detail` as it comes. Both publishers and the engine's own catch use `errorNote`; the type says the field is safe metadata only.
2. **Rows written before the rule are upgraded** (review `f80d6692`, which rejected leaving them): every projection checks its value first, and a one-time upgrade rewrites the stored fields in bounded batches. See [Review f80d6692](#review-f80d6692).
3. **Names.** `errorNote`'s list of allowed names is unchanged, so an Artifacts binding error (`ArtifactsError`) reads `an error of another kind`, with its code and numbers.
4. **A publication code that is not known becomes `transport`.** The alarm's backoff and the gone-repository probe (`NOT_FOUND`, a known Artifacts code) are unchanged.
5. **Request `d268d249`'s job-token test** now expects metadata only at its three sinks, and also checks every row of every table and `jobTokenDuties()`.

### Tests

Each test makes the provider throw (or answer) with a message echoing an `art_v1_…` token, an `Authorization: Bearer` header's credential and a URL query's secret (assembled at runtime, so the source holds no credential-shaped literal). Each checks the exact stored metadata, and that none of the three appears in any row of any table or in what is shown.

| File | Tests | Shown and checked |
|---|---|---|
| `packages/git/test/safe-errors.test.ts` (new, 7) | integration (engine catch), integration through `ContainerPublisher`, integration through `GitPublisher` (git stderr), readiness, unanswered push, answered push (and `outcomeNote` for every outcome), main not read back | every row, `view`, `activeViews`, `status`, `slot`, the room's log |
| `packages/git/test/workspaces.test.ts` (3 new) | provisioning that keeps failing (the view, `artroom_ws`, the steps), a refused step (`answered`), failed cleanup (`defer`) | every row, `view`, `duties`, the returned view |
| `packages/git/test/snapshots.test.ts` (2 new) | a failed create, then its check; failed retirement (revoke and delete) | every row, `duties` |
| `packages/room/test/workerd/safe-errors-d29c09fa.test.ts` (new, 5) | the production Room: integration through `ContainerPublisher` then readiness; an answered push with main not read back, then an unanswered push; a publication failing with a credential as its code, with no code, and with a known Artifacts code | every row of every table, the `log`, `attention`, `lanes` and `op` reads, `PublicationStatus`, the operator diagnoses, the caller's error |
| Review `f80d6692` and the checker's founding control (Node 7 more in the three files above; Room 4 more, and 2 in `founding-gaps.test.ts`) | stored rows with old text, reopened; terminal rows; batches; see [Review f80d6692](#review-f80d6692) | every row, the projections before the upgrade, and after it |
| `packages/room/test/workerd/request-d268d249.test.ts` (1 changed) | the lost mint, the unreadable inventory, the failed revocation of job tokens | `job_tokens`, every row of every table, `jobTokenDuties()` |

### Mutation table

Each mutant was applied alone by a script (`/private/tmp/claude-501/landerr/mutants/run.py`) at the committed implementation `e5f990d1`. Git mutants ran against `safe-errors.test.ts`, `workspaces.test.ts` and `snapshots.test.ts`; those the Room reaches also ran, as did the Room mutants, against `safe-errors-d29c09fa.test.ts` and `request-d268d249.test.ts`. The file was restored from the commit after each. 21 mutants, all red; every new test is red under at least one. "The provider's text" below is the error's message, or for M8 the push's output.

| Mutant | Mutation | Red tests |
|---|---|---|
| M1 | `readBackFailed` given the provider's text | Node: main not read back; Room: answered push, main not read back |
| M2 | an unanswered push's detail with the provider's text | Node: unanswered push; Room: the same test |
| M3 | an answered push's detail kept as the publisher gave it | Node: answered push; Room: the same test |
| M4 | the engine's integration catch keeping the provider's text | Node: integration (engine catch) |
| M5 | `readinessFailed` given the provider's text | Node: readiness; Room: integration then readiness |
| M6 | `ContainerPublisher.integrate` returning the provider's text | Node: integration through `ContainerPublisher`; Room: integration then readiness |
| M7 | `GitPublisher.integrate` returning the `GitError` message | Node: integration through `GitPublisher` |
| M8 | `outcomeNote` appending the push's output | Node: answered push; Room: the same test |
| M9 | the workspace failure's message with the provider's text (the old form) | Node: provisioning that keeps failing; a refused step |
| M10 | `failedStep` storing `String(e)` | Node: provisioning that keeps failing |
| M11 | `answered` storing `String(e)` | Node: a refused step |
| M12 | the workspace `defer` storing `String(e)` | Node: failed cleanup |
| M13 | a failed snapshot create storing `String(e)` | Node: a failed create, then its check |
| M14 | the snapshot `recheck` storing `String(e)` | Node: a failed create, then its check |
| M15 | the snapshot `defer` storing `String(e)` | Node: failed retirement |
| M16 | a lost job-token mint storing `String(e)` | Room: job tokens (request d268d249's test) |
| M17 | an unreadable inventory storing `String(e)` | Room: job tokens |
| M18 | a failed job-token revocation storing `String(e)` | Room: job tokens |
| M19 | `publication_error` from the thrown code as it is (the old form) | Room: a code that is provider text |
| M20 | `knownArtifactsCode` keeping any code | Room: a code that is provider text |
| M21 | `publicationCode` keeping any code | Room: a code that is provider text |

Lane A's mutants guard `errorNote` itself (F7: `errorNote` keeping the message).

### Review f80d6692

Report `f80d6692` on `f81a102d` (changes requested) found one P2. New writes were safe, but rows stored before the rule kept the provider's text. Two reopen controls showed it through `PublicationStatus.lastError` and a failed `WorkspaceOp.error.message`, before any retry overwrote them. Ending a row does not erase it: a revoked workspace keeps its error, and a terminal landing record keeps its body.

**One validator** (`packages/git/src/safe-errors.ts`). `isSafeErrorText(text)` accepts exactly the text the sinks now write: `errorNote`'s output, `outcomeNote`'s, lane B's `token not minted (…)`, the job tokens' forms and state words (`held`, `ended`, `minting`, `refused`, `malformed answer`), `CleanupOwed`'s sentence, `NotOurFork`'s sentence, and the replacement phrase. The language has no free-text part: every part is a fixed phrase, a name or code from a fixed list, a bounded integer or a timestamp. So the validator does not try to clean old text. It accepts only text that cannot hold a credential, and anything else is replaced whole. To keep it that way, `NotOurFork`'s message no longer names repositories. `safeErrorText(text, stage)` returns the text if it is safe, else `<stage>: legacy error withheld`, using the stage the text starts with, if any.

**At read.** `PublicationStatus.lastError`, `WorkspaceOp.error.message` (the workspace view, and so the `op` read) and `jobTokenDuties().status` show only what the validator passes. So nothing stored before the rule is shown, from the moment the object opens, whether or not the upgrade has reached that row. Attention and admin items, and the landing views, show no error field.

**At rest.** Room migration 2 starts a one-time upgrade. In its transaction, in O(1), it stores a cursor (`meta.error_scrub`) if any table that could hold an old error has rows, and makes a `publication_error` that is not a known code `transport`. Each alarm then runs one batch (`RoomCore.scrubErrors`, the `errors` step; `nextAlarm` is due at once while the cursor is stored). A batch reads at most `SCRUB_BATCH` (500) rows of one table after the cursor, by its key. It rewrites only the unsafe values, in one transaction with the new cursor. The last batch deletes the cursor. After that the step reads one meta row and writes nothing, and a run over upgraded rows changes nothing. The tables, in order: `artroom_land_op` (every record, terminal ones too: `lastError` and each push's `detail` in the JSON body), `artroom_ws` (`error`, revoked rows too), `artroom_ws_duty` and `artroom_snap_duty` (`last_error`, done rows too), and `job_tokens` (`last_error`). Nothing else changes: ownership, token IDs, expiry and deadlines, `next_ms` and backoff, attempts, unknown and known effects (`mint:` rows stay unknown mints), `held`, cleanup duties and their state. Signed history (entries, records, acts) is never touched. A host without an alarm (tests, the Git harness) can run every batch at once with `scrubLegacyErrors(sql)`.

| Control | What it shows |
|---|---|
| Node: the validator | Every form the sinks write passes; the provider's text, with or without a stage, a known note with text after it, an unknown name or code, a repository name, and the empty string do not |
| Node: reopen a landing record | A held record's `lastError` and push `detail` written with the provider's text; a new engine on the same storage shows `main could not be read: legacy error withheld` in `PublicationStatus` before any step; the upgrade rewrites both fields, and a second run changes nothing |
| Node: a terminal landing record | A landed record's body with old text: the upgrade changes only `lastError` and the push details; state, receipt, tokens, outcomes and timing are as they were |
| Node: safe values stay | A record with safe metadata only is not changed |
| Node: reopen a workspace | A failed workspace's error and its steps' errors with old text: the reopened view shows `could not provision the workspace: legacy error withheld`; after it is revoked, the upgrade still rewrites its row and steps |
| Node: reopen snapshot steps | One old step and one safe step: only the old one changes |
| Node: batches | Seven rows, a batch limit of 3, and a table that does not exist: the cursor moves 3 rows at a time, the missing table is skipped, and the last batch ends the upgrade |
| Room: reopen a stored room | A room put back at version 1 with old text in every field above (landing record and push, failed workspace, a done workspace step, a done snapshot step, three job tokens, `publication_error`) and safe values beside them, then aborted and reopened. Before any batch, `PublicationStatus`, the workspace `op` read and `jobTokenDuties` show only the withheld phrase, and the log, attention and lanes reads hold none of the text. The cursor is stored and the alarm is due. The batches then end with the cursor deleted. Every field is rewritten, the safe ones are unchanged, and the job tokens' expiry, `next_ms`, attempts and kinds are as before. A further run writes nothing, and no row of any table holds the text |
| Room: the job-token view | Rows written with old text after the upgrade are shown withheld; `held` stays `held` |

| Mutant | Mutation | Red tests |
|---|---|---|
| V1 | the validator accepting any string | Node: validator, every reopen control, terminal record, batches; Room: reopen, job-token view |
| V2 | a note's name followed by any text | Node: validator |
| V3 | `answer lost: ` followed by any text | Node: validator; Room: reopen, job-token view |
| V4 | `NotOurFork`'s old sentence, with repository names | Node: validator |
| V5 | the withheld phrase always the fallback stage, never the text's own | Node: validator, landing reopen, snapshot reopen, terminal record; Room: reopen |
| V6 | `PublicationStatus.lastError` shown as stored | Node: landing reopen; Room: reopen |
| V7 | the workspace view's message shown as stored | Node: workspace reopen; Room: reopen |
| V8 | `jobTokenDuties().status` shown as stored | Room: reopen, job-token view |
| S1 | no migration 2 | Room: reopen |
| S2 | migration 2 storing no cursor | Room: reopen |
| S3 | `publication_error` left as stored | Room: reopen |
| S4 | a batch skipping the next table | Room: reopen |
| S5 | the last batch starting again instead of ending | Room: reopen |
| S6 | `nextAlarm` leaving out the upgrade | Room: reopen |
| S7 | a full batch moving to the next table (rows after the limit never reached) | Node: batches |
| S8 | a batch reading with no limit | Node: batches |
| S9 | a landing record's `lastError` not upgraded | Node: landing reopen, terminal record; Room: reopen |
| S10 | push details not upgraded | Node: landing reopen, terminal record; Room: reopen |
| S11 | workspaces' `error` not upgraded | Node: workspace reopen; Room: reopen |
| S12 | workspace steps not upgraded | Node: workspace reopen; Room: reopen |
| S13 | snapshot steps not upgraded | Node: snapshot reopen; Room: reopen |
| S14 | job tokens not upgraded | Room: reopen |
| S15 | every string rewritten, safe or not (the same text, written again) | Node: safe values stay (it counts writes) |
| S16 | a job token's status checked only in parts, never whole | Room: reopen (a safe `outcome unknown; N live token(s)` observation) |

24 mutants, all red, each applied alone by `/private/tmp/claude-501/landerr/mutants/run2.py` at `e5a2efb3` (logs beside it). S15 and S16 were green there. The commit after it adds the write count and the safe observation, and both are red at `a1176a89`.

#### The founding path (checker's control on `18d69cda`)

The checker's control showed a cursor that was never drained. A public founding failed its revocation, and its alarm then settled all the remote debt without sealing the genesis. A version-1 room with a done workspace step holding old text was then reopened. Migration 2 stored the cursor, but an unfounded room's `recover` and `schedule` used only `foundingDue` (null by then), and its alarm ran only `settleFounding`.

**Change.** On the founding path, `recover` and `schedule` now use `RoomCore.unfoundedDue()`: the earlier of the founding debt and the upgrade, which is due at once while its cursor is stored (`scrubDue`). The alarm's work there is `workUnfounded()`: the upgrade's next batch, then the founding cleanup. A failure of one does not stop the other. A founded room already had the upgrade in `nextAlarm` and in `runAll` (the `errors` step). That step is not a loop kind, so it also runs while the canonical repository is gone, and when other steps fail. There is no other alarm path: a room's alarm runs either the founded composition or the founding one, and the registry stores no error fields.

| Control | What it shows |
|---|---|
| `founding-gaps.test.ts`: the checker's control | As the checker ran it, with its file also run as it was (`/private/tmp/claude-501/landerr/checker-founding-control.log`, passed). After the founding debt is settled, a reopened version-1 room with old text in a done workspace step stores an alarm, and alarms alone drain the cursor and rewrite the text. The room stays unfounded |
| `founding-gaps.test.ts`: founding debt still owed | The same with every workspace step holding old text while the revocation is still owed: the same alarms drain the upgrade and settle the founding debt |
| `safe-errors-d29c09fa.test.ts`: a founded room; the canonical repository gone | Old text in a done workspace step, a done snapshot step and a job token, reopened at version 1: recovery stores an alarm, and alarms alone drain the cursor and rewrite all three, also while `canonical_gone` is set |

| Mutant | Mutation | Red tests |
|---|---|---|
| F1 | an unfounded alarm running only `settleFounding` (the reviewed code) | both founding controls |
| F2 | an unfounded `schedule` using only `foundingDue` | both founding controls |
| F3 | an unfounded `recover` using only `foundingDue` | the checker's control |
| F4 | `unfoundedDue` leaving out the upgrade | both founding controls |
| F5 | `workUnfounded` not running the batch | both founding controls |
| F6 | `scrubDue` always null | both founding controls; the Room reopen control |
| F7 | `nextAlarm` leaving out the upgrade | the Room reopen control |
| F8 | the `errors` step doing nothing | a founded room; canonical repository gone |

8 mutants, all red, each applied alone by `/private/tmp/claude-501/landerr/mutants/run3.py` at `db6247c8`.

### Gates

Run at the exact head that carries this section, serially, with logs in `/private/tmp/claude-501/landerr/`; the exit codes are in the delivery report. In this order: `npm run typecheck -w @generalbusiness/artroom-git`, `npm test -w @generalbusiness/artroom-git` (Node) and `npm run test:workers -w @generalbusiness/artroom-git`; `npm run typecheck -w @generalbusiness/artroom-room`, `npm run test:node -w @generalbusiness/artroom-room` and `npm run test:workerd -w @generalbusiness/artroom-room`; then from the root `npm ci`, `npm run typecheck` and `npm test`.
