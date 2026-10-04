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

Design for review under request `10fcfe4e`: [notes/2026-10-02-canonical-mint-ownership.md](../notes/2026-10-02-canonical-mint-ownership.md), with the contract in [docs/protocol.md](../docs/protocol.md) section 32 (R-MINT-1 to R-MINT-7). Revisions 2 to 5 answer checker reports `9ff903ab` and `851b215b` and their follow-ups. Approved in review `ad6cc052`. Lane A landed at `7be42275` (review `84b71c71`): see [Mint lane A](#mint-lane-a-request-1eda3c5e). Lane B landed at `574568b2` (review `1266c4a7`): see [Mint lane B](#mint-lane-b-request-78f0971c). Lane C is implemented, pending review: see [Mint lane C](#mint-lane-c-request-5ff58c9a). Live, lanes B and C made every propose fail, because the ledger's expiry check had no margin for Artifacts' clock: see [Live propose 503 after lanes B and C](#live-propose-503-after-lanes-b-and-c-request-df6ff8d3). The lane fork's read token for pinning, which the design left out of scope, is lane F (request `02836f9a`), implemented, pending review: see [Mint lane F](#mint-lane-f-request-02836f9a).

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

Status: DONE, landed at `574568b2`, approved in review `1266c4a7`. Gitseq request `78f0971c`, branch `request/mint-publication`, cut from main `7be42275` and merged with main `25a7b837` (idle write storms, request `3da1d82b`), so the head for review is the combined one. It implements lane B of [notes/2026-10-02-canonical-mint-ownership.md](../notes/2026-10-02-canonical-mint-ownership.md) ("Lane B: the publication token, and the ledger in the Room"), as approved in review `ad6cc052`, under [docs/protocol.md](../docs/protocol.md) section 32 (R-MINT-1 to R-MINT-7). The head for review is the commit that carries this section.

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

## Mint lane C (request 5ff58c9a)

Status: DONE, pending checker exact-head review of the combined candidate after [review 31ad41d5](#review-31ad41d5), at the head that merges main `df22d771` (request `d29c09fa`, safe error metadata). Gitseq request `5ff58c9a`, branch `request/mint-sites`, cut from main `574568b2`. It implements lane C of [notes/2026-10-02-canonical-mint-ownership.md](../notes/2026-10-02-canonical-mint-ownership.md) ("Lane C: the other canonical sites"), as approved in review `ad6cc052`, under [docs/protocol.md](../docs/protocol.md) section 32 (R-MINT-1 to R-MINT-7). The head for review is the commit that carries this section.

**Scope.** The note's lane C paths on main's current layout: `packages/git/src/publisher/client.ts`, `packages/room/src/artifacts.ts`, `logremote.ts`, `config.ts`, `ports.ts`, `core.ts` (the snapshot path, and the constructor, which now builds the ledger before the Artifacts adapter that needs it), `jobs.ts` and `store.ts` (a schema comment). Two small additions to lane A's `mints.ts`: `adopt()` for the one-time move, and `within` exported for the job tokens' bounded wait. The Git harness (`measure/harness/worker.ts`) and the Room's `measure/logbig/worker.ts` pass the ledger where they build these clients. Tests: a new Room workerd file `test/workerd/mint-sites-5ff58c9a.test.ts`, a node source scan `test/node/mint-sites-scan.test.ts`, and the earlier controls that described the old job mint records, restated through the ledger. The two package READMEs name the change. Nothing was deployed, no live Cloudflare call was made, and no credential was created.

### What was built

| Site | Purpose (ledger record) | Lifetime | Owner after the answer |
|---|---|---|---|
| `ContainerPublisher.integrate` | `integrate:<op>:<attempt>` | 60 s write | the ledger, released after the sandbox call |
| `Pinning.pinObjects`, canonical half | `pin-objects:<head>` | 600 s write | the ledger, released |
| `Pinning.pinRef` | `pin-ref:<lane>:<generation>` | 60 s write | the ledger, released |
| `Pinning.preview` | `preview:<lane>:<generation>` | 60 s write | the ledger, released |
| log remote `readRef` | `log-read:<ref>` | 60 s read | the ledger, released |
| log remote `push` | `log-push:<commit>` | 60 s write | the ledger, released |
| snapshot preparation's canonical read (`core.ts`) | `snapshot:<commit>` | 300 s read | the ledger, released |
| a whole-tree check job (`jobs.ts` `issue`) | `job:<job>_<attempt>` | ends 5 s before the deadline | claimed into `job_tokens` |

- **Released sites** use `mints.withToken(purpose, scope, () => ttl, fn)`: the record and wake-up before the request, a bounded wait, a lost answer kept as `unknown`, and a revocation by ID afterwards whose failure makes the record `owed` (due in 1 s, backed off to 5 min) for a later alarm. Nothing is dropped. The publisher clients take the ledger as `PublisherClientOptions.mints`; the Room's `ArtifactsAdapter` passes it to `Pinning`; `Remotes.logRemote(repo, mints)` receives it, and the Room passes `RoomCore.mints`. The log remote reads the repository's remote before minting, so the token's lifetime is not spent on that lookup.
- **Check jobs.** `issue` calls `mints.mint(job:<id>, "read", (sentAt) => floor((deadline - sentAt) / 1000) - 5, { notAfter: deadline })`. The lifetime is a function of the send time, which the ledger calls after the wake-up is stored, and the pre-send record holds that recomputed lifetime (approval obligation 1). The three deadline checks: (1) the lifetime asked ends 5 s before the deadline, from the post-wake send time; (2) the reported expiry is by the deadline, now the ledger's `notAfter`, checked before any caller gets the token, so a token that would outlive the deadline is never returned or claimed, and the ledger owes its revocation; (3) `issue` still never dispatches at or after the deadline (`core.now() >= deadline`), and ends the token instead. The claim: one transaction writes the `job_tokens` row with the handoff metadata (`token_id = id`, `expires_at = expiresAt`, `next_ms = expiresAt`, `last_error = 'held'`) and calls `claim()`. If that transaction fails, the ledger still holds the token and `release()` revokes it at once (a failure there is owed).
- **`watchMint` and the `mint:<job>` rows are gone.** The ledger's records and its shared observation replace them. A room stored before this change moves its open `mint:` rows into the ledger once, at the object's start (`moveJobMints`, meta key `job_mints_moved`), in one transaction: each becomes an `unknown` record (`job:<job>`, read, `notAfter` = the row's deadline) through `MintLedger.adopt` (one summary write), and the rows are deleted. A room with none only sets the key. After that, each start reads one meta row.
- **Ended job tokens** (`settleToken`) keep their owner rule, as today: a row ends when Artifacts answers its revocation, or once its known expiry has passed, with no revocation; a row with no known expiry is never settled by time. The repository lookup and the revocation now share one bounded wait (30 s, `MINT_WAIT_MS`), the expiry is checked again after the lookup immediately before the send, nothing is sent once the wait has ended, and a late answer changes nothing. A failure is stored as `errorNote("revocation failed", e)`, never the provider's text.
- **The job token pass** (review `b84aead9`). Ended job tokens are revoked by their own pass, not by the jobs step: at most 20 rows due now, earliest due first, read by the index `job_tokens_due (next_ms, token_id)`, which Room migration 3 installs (below, review `993dce7a`). The pass runs in the background, one at a time, and the alarm never awaits it, so the alarm's later steps (snapshots, abort, publication, mints) run while a revocation is held. While a pass waits on an attempt, its rows are not eligible before that attempt's timeout. `jobTokensDue()` gives the earliest eligible time; a time already passed (a backlog) is now plus 1 s, a still-future time is itself, and `nextAlarm()` takes the earlier of it and other work, so an earlier unrelated alarm is kept and a fresh object schedules the debt at start with no request. It is its own loop kind, `jobTokens`, under lane B's `loop_backoff` fence: a failure of its step (reading the batch) takes the kind's backoff, which ends only when the step runs (self-timed), and while the canonical repository is gone it is neither run nor scheduled.
- **The jobs step** issues at most 20 jobs, earliest due first, by the partial index `check_jobs_due (next_ms) WHERE state != 'done'`, also from migration 3; a batch left over is due 1 s later (`jobsDue()`). Each issue's waits are bounded (the ledger's).
- **`jobTokenDuties()`** lists `held` and `revoke` rows only. An unknown job mint is a ledger record, read through `core.mints.duties()`.
- **Safe metadata.** Integrate's detail for any failure, the mint's included, is request `d29c09fa`'s `errorNote("integration failed", e)` (this branch's own `token not minted (…)` form gave way to it at the merge); every ledger record and job token row keeps `errorNote` text only, and `jobTokenDuties()` shows `safeJobStatus` text, as `d29c09fa` made it.
- **The fork read token** in `pinObjects` is unchanged (`withForkToken`, still a hidden retry and a dropped revocation), pending request `02836f9a`. The source scan names it as that pending exception.

### Choices where the design left room

These are for the checker to confirm or reject.

1. **Job tokens are settled at their expiry before any revocation is tried** (standard 3, "re-check expiry right before any revocation"), not only after a failed one, as before. A row due at its expiry (a held token whose attempt ended without its end being written, or an attempt found past its deadline) is deleted with no call: the token no longer reads. Eight earlier controls asserted `revoked === true` for a token past its expiry; they now assert that it no longer reads and that its row has ended (below).
2. **A token owed at once is revoked by the ledger's next pass**, not inside `issue` (lane A's choice 2). Controls that expected a refused job token revoked by the jobs step alone now run the `mints` step.
3. **`moveJobMints` runs in the `RoomCore` constructor, unwrapped**, as lane B's `token-index` fill. A storage failure there fails the object's start, as `createSchema` would; a partial move is impossible (one transaction with the meta key). The moved records' `sent_at` is the move time: the old rows did not keep the send time; the note on each record says so.
4. **The bounded wait for job tokens** is the ledger's constant; `setJobTokenWait(core, ms)` (a per-object `WeakMap`, like `jobs.ts`'s waits) lets the controls use 200 ms on one object. No process global is swapped.
5. **Purposes** are per site and per operation (table above), so admins can tell the records apart in `duties()`; a `job:` purpose is the attempt's job ID.
6. **Ledger writes per mint.** Each released mint writes four record statements (the record, the lifetime asked, the answer, the deletion), as the note's three rows plus lane A's post-wake lifetime update, and a summary write for the takeover time at most every 30 s. A failing log publication mints 11 tokens per retry (lane L's read-backs and pushes), so request 3da1d82b's backoff control now counts the ledger's writes separately and checks they are a fixed number per retry. Request `8bd623cc` may want to measure this.
7. **The `RoomCore` constructor builds the ledger earlier**, before the Artifacts adapter that takes it. Its `known` callback still reads `landing` lazily. This is outside the snapshot path, but unavoidable.

Review `b84aead9` accepted choices 1 to 5, and moved the cost in choice 6 to request `8bd623cc`'s accounting. These were added for its findings:

8. **Job tokens follow the `mints` kind's rules**: self-timed, fenced after a failure of their own step, and held, kept, while the canonical repository is gone. A held row with a known expiry is therefore not settled by time while the repository is gone; it is when the repository returns.
9. **The jobs step stays awaited by the alarm**, as before, but takes at most 20 jobs a step; each issue's provider waits are the ledger's bounded ones. Two writes over due rows stay single statements: a room the registry does not bind pushes every due job's time forward in one `UPDATE`, and the one-time move of `mint:` rows is one transaction at first start. `jobTokenDuties()` (an operator read) still returns every row.
10. **The source scan uses Babel's TypeScript parser** (`@babel/parser`, pinned as a Room dev dependency; it was already installed). The review preferred the TypeScript compiler API, but TypeScript 7, the native compiler this repository uses, ships no in-process parser, only an unstable API that spawns the native binary and parses only files in a project.
11. **Room migration 3 creates the due indexes** (`DUE_INDEXES`, `CREATE INDEX IF NOT EXISTS`), not the base step: a stored room never reruns an earlier step, so only a later one reaches it. Written as version 2, it was renumbered to 3 when request `d29c09fa` landed first with its error scrub at 2 (main `df22d771`, merged here). The composed chain is tested from each stored version: a version-1 room gets the scrub (its cursor stored, then drained by its own step to safe text) and the indexes; a version-2 room gets the indexes only, and the scrub does not run again; a version-3 room reopened changes nothing.
12. **`declare` declarations are scanned too**, not skipped: an ambient context holds only types, which are erased inside it, and TypeScript refuses an initializer there, so scanning them costs nothing and hides nothing.

### Tests: rule map

Room, `packages/room/test/workerd/mint-sites-5ff58c9a.test.ts` (26 tests, the production Room with real storage and alarms), and `packages/room/test/node/mint-sites-scan.test.ts` (3 tests). The note's tests 1 to 4 are red at `3ac55e96` by construction: no site there kept a record.

| Note | Rules | Tests |
|---|---|---|
| (1) | R-MINT-2, R-MINT-5, R-MINT-7 | For each of the eight sites: the site's create applies and its answer is lost. One `unknown` record with the site's purpose; integrate's detail is safe metadata only. Restart: the fresh object schedules the overdue observation exactly 1 s ahead, with no request; two alarms, each followed by the next observation's still-future time, stored exactly (approval obligation 2). The record is kept and observed, and the applied token is never asked to be revoked |
| (2) | R-MINT-4, R-MINT-7 | For each site: its token's first revocation fails. The debt is kept with `errorNote` text (the ledger's `owed` record, or the job's token row); a later alarm revokes it by its ID (two calls in all) and the record ends. Each site's lifetime is as before |
| (3) | R-MINT-5 | A stored room with two open `mint:` rows and a held token row: at the next start, two `unknown` records with the right purposes and deadlines, counts 2/0, the held row kept, the observation scheduled 1 s ahead; a `mint:` row written after the move is not moved by a later start; the moved records are observed, never settled |
| (4) | R-MINT-2, R-MINT-3, R-EXEC-9 | Through `issue` and the production ledger, each with a wake-up that takes 20 s of room time, and each checking the pre-send record: `notAfter` = the deadline and the lifetime computed from the post-wake send time. Wake delay: sent, expiry 5 s before the deadline, handoff metadata. Create delay (20 s): expiry 15 s past the deadline, passes the generic check; owed (`an expiry after notAfter`), never sent, revoked by its ID at the next pass. Answer delay (20 s): claimed and sent. Boundaries: a reported expiry equal to the deadline is accepted and sent, 1 ms later is owed; dispatch at the deadline sends nothing and ends the token, 1 ms before sends it |
| (4) retained | R-EXEC-9, R-MINT-5 | `job-token-mint.test.ts` lines 121–180 (was 123–177), review 013dad0c's control: a mint held past its deadline, attempt 2 sent, then the first applies. Late usable answer: owed, revoked by its ID, never sent. Minted in time, answer late: claimed by the superseded attempt and ended. Lost answer: `unknown` past the deadline and past the lifetime asked, across a restart and an alarm |
| (5) | R-MINT-4 | A job token row whose revocations fail is retried while the token reads, and settled once its expiry passes, with no further call. A job's ledger record with no readable expiry stays `owed` through 18 hours of failing passes. Bounded: a revocation that never answers ends within the wait, its late answer changes nothing; a lookup still out at the end sends nothing, then or later; an expiry that passes during the lookup settles the row with no call |
| bounded | R-MINT-4, R-MINT-7 | 45 ended job token rows due at once, the first revocation held: the alarm returns while it is held and its publication step runs; the rows are ineligible until the attempt's timeout (5 s here), and no stored alarm is under 1 s ahead or past it; the first pass revokes exactly the 20 due earliest; then alarms alone take the next 20 and the last 5, each next alarm exactly 1 s after its pass. A fresh object with no alarm stored schedules overdue rows 1 s ahead and future rows at their own time, after an earlier lease alarm, which runs first; its alarms alone revoke them. The `jobTokens` fence: a failure of the step takes the backoff, an earlier alarm skips the step and keeps it, `nextAlarm` waits for it, then the step runs and clears it; while the repository is gone, a row is kept and nothing is scheduled. 25 jobs due at once: one jobs step takes the 20 due earliest, the rest are due 1 s later |
| upgrade | R-MINT-7 | Twice, from schema version 1 and from version 2: a stored room with neither index, a held job token, a job token row with legacy error text, an owed job and an unknown mint, reopened at version 3: both indexes; every row, the ledger, the log head and meta unchanged; from version 1 the scrub's cursor is stored and its own step drains it to safe text, from version 2 the scrub does not run again and the row keeps its text; the production due queries are each one indexed search (`SEARCH job_tokens USING COVERING INDEX job_tokens_due (next_ms<?)`, `SEARCH check_jobs USING INDEX check_jobs_due (next_ms<?)`), with no temporary B-tree; reopened at version 3, nothing changes |
| (6) | R-MINT-1 | Every production source file is parsed, every node but erased TypeScript syntax visited. Outside the harnesses, `measure/` and tests, `createToken` is reached once each in `mints.ts`, `workspace/workspaces.ts`, `snapshot/repos.ts` and `publisher/client.ts`, and nowhere else; the client's one reach is inside `withForkToken`, used once, for the fork (pending request `02836f9a`). An actual fixture file outside the allowed files (`test/node/fixtures/create-token-forms.ts`) with twenty forms of reach (call, optional call, optional receiver, string index, optional string index, template index, alias, destructuring, renamed and quoted destructuring; and in executable TypeScript, the checker's runtime namespace probe, an enum initializer, `as`, `!`, `satisfies`, an angle-bracket assertion, an instantiation expression, a parameter property, a class field and a decorator) fails on exactly those twenty lines, and not on its type positions, `declare` declarations, interface, type alias or string argument; the checker's namespace probe as a new Room source file fails; at an allowed path it fails on its count; a reach outside `withForkToken` in the client fails |

**Earlier controls restated through the ledger** (same meaning; only what the old `mint:` rows or an inline revocation showed changed): `job-token-mint.test.ts` (all 13: observations and backoff are the ledger's, a malformed answer with an ID is owed and revoked by that ID), `review-90f30a3b.test.ts` (refused tokens are the ledger's and revoked by its pass; cleanup across a restart through the ledger's backoff), `review-271dbd53.test.ts` (a refused token is never the job's; transfer failures leave the ledger owning it), `review-0f9739dc.test.ts` and `review-786e9606.test.ts` (an expired token's row ends with no call), `request-d268d249.test.ts` (the job sinks keep `errorNote` text, and no table holds the injected text, as request `d29c09fa` checks), `mint-publication-78f0971c.test.ts` (its holds and wake controls target the publication's create, now that integrate mints through the ledger too), `idle-writes-3da1d82b.test.ts` (choice 6), `phase2b.test.ts` and `config.test.ts` (the log remote takes the ledger).

### Review b84aead9

Report `b84aead9` on `d24e5a46` (changes requested) found two P2s, both reproduced by the checker.

1. **Job token revocation was not bounded.** A real Room alarm with 45 due, unexpired job token rows sent all 45 revocations, and `issueJobs` scanned and awaited every due row before the alarm's later steps. Now a bounded pass of its own (above, "The job token pass"), and the jobs step takes a bounded batch. Every other loop over due rows this lane added or touched was checked (choice 9).
2. **The source scan missed `repo.createToken?.('read', 60)`** in a new Room source file. The scan now parses every file and counts reaches by syntax (above, (6)). The checker's control, as a new file in `packages/room/src`, fails the scan (checked by hand at this head, then removed); the fixture file holds it as one of its ten forms.

### Review 993dce7a

Report `993dce7a` on `7eb9e36f` (changes requested) credited the bounded background pass and the parser for the original cases, and found two P2s, both reproduced by the checker.

1. **The due indexes never reached a stored room.** They were in the base schema step, which `migrate` skips for a room already at version 1, so an existing room kept scanning and sorting both tables. They are now a Room migration of their own, version 3 after the merge with request `d29c09fa`'s scrub at 2 (choice 11), and the "upgrade" control reopens a version-1 room and checks the plans. The checker's control (`/tmp/artroom-checker-mint-c-v2-upgrade-control.test.ts`) asserts a fresh room is at version 1, which is no longer true; with that line changed to set version 1, it passes against this head.
2. **The scan skipped every TypeScript node** but five expression kinds, so a runtime namespace hid a reach. The traversal is inverted: only an explicit set of erased syntax is skipped, the emitted TypeScript nodes are listed, and an unknown TypeScript node stops the scan (choice 12 for `declare`). The checker's probe (`/tmp/artroom-checker-mint-c-v2-scan-probe.ts`), copied into `packages/room/src`, fails the scan (checked by hand at this head, then removed), and it is in the fixture. The checker's scan control file carries its own copy of the old scan, so it stays red by design.

### Merge with main `df22d771` (request `d29c09fa`)

Request `d29c09fa` landed first, and its approval `d1f23589` asked the combined candidate to reconcile the migration history. Conflicts, and how each was settled:

- `packages/room/src/store.ts`: the scrub stays version 2, and the due indexes are version 3 (choice 11).
- `packages/git/src/index.ts`: both exports, `within` and `knownArtifactsCode`.
- `packages/git/src/publisher/client.ts`: `d29c09fa`'s integrate detail, `errorNote("integration failed", e)`, which covers a failed mint as well; this branch's `minted` flag went.
- `packages/room/src/jobs.ts`: this branch's (the ledger replaced `watchMint` and the `mint:` rows), with `d29c09fa`'s `safeJobStatus` in `jobTokenDuties()`.
- `request-d268d249.test.ts`: this branch's ledger-based form, under `d29c09fa`'s name.

Three of `d29c09fa`'s tests met this branch's design and were adapted, keeping their meaning. Its reopen control ("on reopen no projection shows the text …") now starts from a room stored before both lanes, so its legacy `mint:` rows move into the mint ledger at the start, as unknown records with a fixed note; the control checks those four records and that no table holds the text, and the store ends at version 3. Its operators' view control no longer writes a `mint:` row, which can no longer arise. Its Git control builds `ContainerPublisher` with a stand-in ledger, now required.

### Review 31ad41d5

Report `31ad41d5` on `e03a9c95` resolved both P2s of review `993dce7a` (60 mutations red; choices 11 and 12 appropriate) and asked only for the combined candidate with request `d29c09fa`, now landed. Its requirements, and where each is met:

- **Landed migration 2 kept, due indexes as 3** (choice 11; the merge above).
- **Both stored versions, with an in-progress scrub and a restart.** The "upgrade" control runs from version 1 (the scrub starts, its own step drains it, the indexes are installed) and from version 2 (indexes only; the scrub does not rerun). A new control starts a room at version 2 with the scrub's cursor stopped mid-table in `job_tokens` and legacy rows after it: migration 3 adds the indexes and leaves the cursor; production alarms alone resume the scrub from the cursor (the rows after it are made safe, the row before it is not revisited), finish it and remove the cursor; ownership and deadlines are kept; a restart changes nothing. Both indexes are used: each due query is one indexed search, no sort.
- **Cleanup still finishes through production alarms, before and after founding.** `d29c09fa`'s founded control ("in a founded room the upgrade drains …", with and without the repository) and its two unfounded controls (`founding-gaps.test.ts`, "the error upgrade drains in an unfounded room …") pass on the combined head, and now also check that the chain reached version 3 with both indexes; the unfounded ones check that `unfoundedDue()` is the earlier of the founding debt and the scrub's work (the scrub's, due at once).
- **No landed sink or guard dropped.** Every line `d29c09fa` added to the files both lanes touch was checked against the combined head. Kept as landed: in `mints.ts`, `knownArtifactsCode` and the stage list; in `client.ts`, integrate's `errorNote("integration failed", e)`; in `core.ts`, `publicationCode` (known codes only), the `errors` step, `scrubErrors`, `scrubDue`, `unfoundedDue` and the scrub in `nextAlarm`; in `store.ts`, migration 2, `PUBLICATION_CODES`, `safeJobStatus`, `ROOM_SCRUB_TABLES` with `job_tokens`; in `index.ts`, the safe-error exports; in `jobs.ts`, `jobTokenDuties()`'s `safeJobStatus` read guard and the failed revocation's `errorNote("revocation failed", e)` (in `settleToken`'s bounded form). Gone by design: `jobs.ts`'s three `mint:` sinks (the lost mint's `answer lost: …`, `watchMint`'s inventory note, and its import of `completeInventory`), because the mint ledger replaced those records; the ledger's own sinks are `errorNote` throughout (lane A).

### Mutation table

Each mutant was applied alone by a script (`/private/tmp/claude-501/mintC/mutants/run.py`) at the merge `6a40738a` (M1 to M4 again at `dc01cd19`, with the controls added for review `31ad41d5`), the suites named were run, and the file was restored from the commit (`git checkout`). Every mutant ran against the lane C workerd file, the restated controls (`job-token-mint`, `review-90f30a3b`, `review-271dbd53`, `request-d268d249`, `review-786e9606`, `review-0f9739dc`), request `d29c09fa`'s Room controls (`safe-errors-d29c09fa`, and `founding-gaps` for M1 to M4) and the source scan. T marks the note's lane C mutation targets, O the approval's two obligations, G the other guards, B the bounded passes of review `b84aead9` (its four named guards are B1 batch, B2 ordering, B6 in-flight eligibility and B4 continuation), S the source scan's enforcement and traversal, and M the due indexes' migration (review `993dce7a`: S6 to S9 break the new traversal guard, M1 to M3 the upgrade; review `31ad41d5`: M4 the composed chain). 56 mutants, all red, and every test in the lane C workerd file and the source scan is red under at least one. Earlier runs, at `62048db6` (29 mutants), `fe68473e` (44), `3ed73ae2` (48) and `37eab909` (55), are kept beside it: G14 survived the first (no control checked that the log push still landed with its write token; "(2) the log remote's push" now does), and the scan's first, regex form, mutant S1 then, was replaced with the parser-based scan. Lane A's own mutants of `mints.ts` (including O2a, the 1 s step postponing a future time when anything is overdue) stay with lane A's 47 tests, which pass unchanged.

| Mutant | Kind | Mutation | Red tests |
|---|---|---|---|
| T1a | T | a site calls `createToken` directly (pinRef) | (1) and (2) pinRef; (6) three scan tests (the count, the client's one reach, a reach outside `withForkToken`) |
| T1b | T | a site calls `createToken` directly (the log remote, as before lane C) | (1); (2) readRef and push; (6) |
| T1c | T | a site calls `createToken` directly (snapshot preparation, as before lane C) | (1) and (2) snapshot; (6) |
| T1d | T | a site calls `createToken` directly (a check job, with its own deadline check) | 26 tests: (1), (4) every case, (5) settlement, all of `job-token-mint` but the refusal, review-90f30a3b (4), review-271dbd53 (2), review-786e9606, request-d268d249, (6) |
| T2a | T | a dropped revocation failure (publisher client: the record given up, revoked outside the ledger, failure swallowed) | (2) integrate, pinObjects, pinRef, preview |
| T2b | T | a dropped revocation failure (the log remote) | (2) readRef and push |
| T2c | T | a dropped revocation failure (snapshot preparation) | (2) snapshot |
| T2d | T | a dropped revocation failure (a job token row deleted when its revocation fails) | (2) check job; (5) all four job-token controls; request-d268d249 |
| T3a | T | the move run at every start | (3) |
| T3b | T | the move not run at all | (3) |
| T4 | T | `issue`'s `notAfter` left out of the job's mint | 17 tests: (4) every case; `job-token-mint` (9, the 013dad0c control among them); review-90f30a3b (2); review-271dbd53 |
| T5 | T | `issue`'s check for a passed deadline before dispatch removed | (4) dispatch boundary; `job-token-mint` "an answer still outstanding …"; review-90f30a3b "an answer delayed past the attempt's deadline …" |
| O1 | O | the lifetime computed before the wake-up, so the pre-send record does not hold the lifetime recomputed after it | (4) all five cases |
| O2 | O | the 1 s continuation applied to a still-future time too (`nextDue`) | (1) (the next observation stored exactly); review-90f30a3b "cleanup fails, and the room restarts" |
| G1 | G | the claim before the `job_tokens` transaction, not inside it | review-271dbd53 both transfer controls |
| G2 | G | no release when the claim does not commit | review-271dbd53 both transfer controls |
| G3 | G | handoff metadata: `next_ms` not the reported expiry | (4) wake delay; review-271dbd53 (2) |
| G4 | G | no expiry recheck after the lookup, before the send (job tokens) | (5) "an expiry that passes during the lookup …" |
| G5a | G | a job token revocation not bounded | (5) "a revocation that never answers …" |
| G5b | G | a job token revocation's lookup not bounded (a late lookup still sends) | (5) "a repository lookup still out …" |
| G6 | G | a job token revocation failure stores the provider's text | (2) check job; (5) two; request-d268d249 |
| G7 | G | the move drops the deadline (`notAfter`) | (3) |
| G8 | G | the move keeps the old rows | (3) |
| G9 | G | adopted records not counted (unknown count, observation) | (3) |
| G10 | G | integrate stores the provider's text for a failed mint (its `d29c09fa` sink) | (1) integrate; `safe-errors-d29c09fa` |
| G11 | G | no margin under the deadline for a job's lifetime | (2) check job lifetime; (4) all five; review-90f30a3b "a mint delayed by less than the room's margin" |
| G12 | G | the pinning token's lifetime changed (600 s to 60 s) | (2) pinObjects |
| G13 | G | the snapshot read's lifetime changed (300 s to 600 s) | (2) snapshot |
| G14 | G | the log push minted as a read token | (2) push; the three job token controls that publish the log |
| B1 | B | the job token pass unbounded (1,000 a pass) | bounded: 45 rows |
| B2 | B | the job token pass ordered by token ID, not due time | bounded: 45 rows; the fence; upgrade (the plan) |
| B3 | B | the job token pass awaited by its alarm step | bounded: 45 rows (the alarm does not return while the revocation is held) |
| B4 | B | a job token backlog returned as is (no 1 s continuation) | bounded: 45 rows; fresh object |
| B5 | B | the 1 s step applied to a still-future job token time too | bounded: 45 rows; fresh object |
| B6 | B | job token rows eligible while a pass waits on an answer | bounded: 45 rows |
| B7 | B | the job token step ignores its fence | the fence |
| B8 | B | `nextAlarm` ignores the job token fence | the fence |
| B9 | B | job tokens not self-timed (an early alarm clears the backoff) | the fence |
| B10 | B | job tokens run while the repository is gone | the fence |
| B11 | B | job tokens scheduled while the repository is gone | the fence |
| B12 | B | the jobs step unbounded (1,000 a step) | bounded: 25 jobs |
| B13 | B | the jobs step in row order, not due order | bounded: 25 jobs; upgrade (the plan) |
| B14 | B | a jobs batch left over returned as is (no 1 s continuation) | bounded: 25 jobs |
| S1 | S | the scan: property accesses not counted (the checker's optional call passes) | (6) all five |
| S2 | S | the scan: destructuring not counted | (6) the fixture; the count at an allowed path |
| S3 | S | the scan: element access by a string not counted | (6) the fixture; the count at an allowed path |
| S4 | S | the scan's enforcement removed (no file is checked) | (6) the production scan; the fixture; the namespace probe; the allowed-path count |
| S6 | S | the traversal guard as before review `993dce7a` (every TypeScript node skipped but assertions) | (6) the fixture; the namespace probe; the allowed-path count |
| S7 | S | namespaces treated as erased | (6) the fixture; the namespace probe; the allowed-path count |
| S8 | S | enum members treated as erased | (6) the fixture; the allowed-path count |
| S9 | S | parameter properties treated as erased | (6) the fixture; the allowed-path count |
| M1 | M | the due indexes' migration (3) removed | upgrade (from 1 and from 2); mid-scrub at 2; `d29c09fa`'s founded (2) and unfounded (2) upgrade controls and its reopen control (each now checks version 3) |
| M2 | M | the upgrade guard broken: the due indexes only in the base step, which a stored room never reruns | as M1 |
| M4 | M | the composed chain broken: the due indexes folded into step 2 (as numbered before the merge), which a version-2 room never reruns | upgrade (from 2); mid-scrub at 2; and, as the version ends at 2, the controls M1 names |
| M3 | M | the job token index without its tie-break (a sort for the order) | upgrade (the plan); mid-scrub at 2 (the plan) |
| S5 | S | the fork exception not held to `withForkToken` | (6) a reach outside `withForkToken` |

### Gates

Run at the exact head that carries this section, serially, with logs in `/private/tmp/claude-501/mintC/`; the exit codes are in the delivery report. In this order: `npm run typecheck -w @generalbusiness/artroom-git`, `npm test -w @generalbusiness/artroom-git` (Node) and `npm run test:workers -w @generalbusiness/artroom-git`; `npm run typecheck -w @generalbusiness/artroom-room`, `npm run test:node -w @generalbusiness/artroom-room` and `npm run test:workerd -w @generalbusiness/artroom-room`; then from the root `npm ci`, `npm run typecheck` and `npm test`; then `npm exec -w @generalbusiness/artroom-room -- wrangler deploy --dry-run` (bundles only; no credentials, nothing is uploaded). The Git harness is type-checked separately with a scratch tsconfig, as the package gates do not cover `measure/`.

### Not changed here

The fork read token in `pinObjects` (request `02836f9a`). `MintLedger`'s behaviour (lane A) and the publication token (lane B). Showing the ledger's records to admins stays with the cleanup projection request (`8d249233`). Requests `8bd623cc` (row writes) and `d29c09fa` (error sinks) touch `core.ts` and `jobs.ts`; this branch will merge main when they land.

## Live propose 503 after lanes B and C (request df6ff8d3)

Status: DONE, pending checker exact-head review. Gitseq request `df6ff8d3` (planner to builder), branch `request/live503`, cut from main `d3f7d3a8`, whose source equals `965c911a`. The head for review is the commit that carries this section. Main `b44601dd` (row writes `58a2f0a0`, the declared-acts note) was merged in afterwards. Only `notes/deploy-spike.md` conflicted, and both sides' sections are kept. The merge touches none of this fix's files. The spike still runs the build of `0753d7de`, which does not have the row-write changes.

**The defect.** After the spike was redeployed from main `965c911a` (Room version `5ad0e3f2`), every `propose` failed in under a second with 503 `unavailable`, "The repository could not be read. Nothing was recorded; retry with the same idempotency key." The log was never published either. Reproduced at 03:03 UTC on `5ad0e3f2`: the full smoke failed 12 steps, the same 12 as the planner's run (all four proposes, the landings after them, and both log publications and verifications). Cleanup was `ok`.

### Diagnosis

**The step and its cause, from the Room's own diagnosis.** A temporary deploy (Room `e46f42bd`) put the diagnosis that `preAdmission` logs into the 503's message. Every propose gave:

```
{"event":"pre-admission-failed","step":"propose.pinObjects","name":"Error",
 "message":"Artifacts' answer cannot be used (an expiry later than the lifetime asked); the token is owed revocation"}
```

That is the mint ledger's check on the answer to the canonical write token that `Pinning.pinObjects` asks for (`pin-objects:<head>`, 600 s). R-MINT-3 lets a token be used only if its reported expiry is no later than the answer's arrival plus the lifetime asked. A second temporary deploy (Room `b70de69e`) added the margin to the message. For the four proposes of one run, Artifacts' expiry was **67, 44, 41 and 45 ms** later than the Room's arrival time plus 600 s. Artifacts sets the expiry by its own clock and the Room reads the arrival by its own, and Artifacts' clock was ahead. The check had no margin, so every canonical mint failed: pinning, and also previews, integration, publication and log reads and pushes. That is why the logs were not published. The tests could not see this: the in-memory Artifacts and the Room share one clock.

Mint lanes B and C caused the failure only by moving these mints into the ledger. Lane A's check was never run against live Artifacts before this deployment. The other suspects did not apply: the token-create answer had the shape, the scope and a readable expiry, and the ledger's tables and indexes were in place.

**Why the tail showed no diagnosis.** The line was logged, but the Durable Object's trace events reached `wrangler tail` late, and not on the propose's own event:

- In both tails (the planner's, and mine from 03:03 UTC), the Room `submit` event of each failing propose was missing while the tail ran. The Worker's `POST /acts` event with status 503 was there. (The planner's run from 02:54 UTC was still in its checks phase when mine began; its events are in my tail too.)
- When the temporary deploy shut down the `5ad0e3f2` objects at about 03:14 UTC, the tail received a batch of their held events, some from 10 minutes before. It included failing proposes' `submit` events, with no logs, and Room alarm events that carried the lines. Each `pre-admission-failed` line came on the alarm event that started while that propose was still running: the ledger stores a wake-up at once for an owed token, so the alarm starts during the propose. For example, my run's lane 3 propose ran from `1790996955205` for 283 ms, its room's alarm started at `…955367`, and the line is stamped `…955398`. The `publication-failed` lines with the same message came on later alarm events. Some failing proposes' events had still not arrived when the tail stopped.
- On the measurement build, a probe line logged at the start of each `submit` appeared on the `submit` events that arrived. So console output from the Room does reach the tail.

So the diagnosis goes to the Worker's log as request `d268d249` intended. No sink other than the console is wired in production (`services.diagnose` is set only by tests). The catch is not bypassed. The delay and the attribution to another event are the Durable Object runtime's, and this request does not change them. To read a Room's diagnoses, keep the tail running until the object stops (a redeploy stops it), and look at every `Room` event, alarms included, not only the propose's. Why the runtime held these events for so long was not established.

### The fix

`packages/git/src/mints.ts`: the generic check allows `MINT_CLOCK_ALLOWANCE_MS` (5,000 ms, exported from the package) past the arrival plus the lifetime asked. That is about 75 times the largest margin measured, and the same 5 s as the deadline margins (`TOKEN_MARGIN_S`). An answer whose expiry is later than that still makes the token owed and unused. `notAfter` (a check job's deadline) has no allowance. A check job asks for a lifetime that ends 5 s before its deadline, so a fast clock up to that size is already covered there.

R-MINT-3 in [docs/protocol.md](../docs/protocol.md) section 32 and the design note's "The answer" now state the allowance. No other Room record compares a reported expiry with the lifetime asked: workspace and snapshot tokens are checked against their lease end and deadline, with 5 s margins.

### Tests

| Test | On `965c911a`'s source | On the fix |
|---|---|---|
| Room, `test/workerd/live-propose-df6ff8d3.test.ts`, "67 ms ahead, as live": Artifacts' clock 67 ms ahead of the Room's. Two proposes are admitted, both lanes land (the second through a sandbox merge), the log publishes, and no ledger record or active canonical token is left | red: `ArtroomError: The repository could not be read. Nothing was recorded; retry with the same idempotency key.` at the first propose, as live | green |
| Room, same file: an expiry a minute past the lifetime asked is still refused. The propose is `unavailable`, the diagnosis names `propose.pinObjects` and the reason, and the `pin-objects` record is owed | green | green |
| Git, `test/mints.test.ts`, "(4) Artifacts' clock ahead …": 67 ms and exactly 5,000 ms past are usable, 5,001 ms is owed, 1 ms past `notAfter` is owed, and all four tokens are revoked by ID | red: the module has no `MINT_CLOCK_ALLOWANCE_MS` (without that import, the mutant "no allowance" below is the old code) | green |
| Git, the existing "(4) … a longer expiry …" test: the longer expiry is now 5,001 ms past, not 1 ms | — | green |

The Room test's skew is set on the in-memory Artifacts' own clock (`now`), which sets token expiries and expiry states. No process global is swapped.

**Mutants**, each applied alone to `packages/git/src/mints.ts` and restored, with the Git ledger tests and the Room file run each time:

| Mutant | Mutation | Red |
|---|---|---|
| no allowance | the check as before (`> arrival + ttl`) | Git: the new test. Room: "67 ms ahead" |
| no check | the generic check removed | Git: the new test and "(4) … a longer expiry …". Room: "a minute past" |
| boundary | `>=` for `>` | Git: the new test (exactly 5,000 ms) |
| allowance on `notAfter` | `notAfter` also given 5 s | Git: the new test (1 ms past `notAfter`) |

### Live

| When (UTC) | Room version | Checker version | What |
|---|---|---|---|
| 02:41 (planner) | `5ad0e3f2` | `7cc7e16e` | main `965c911a` |
| 03:03 | `5ad0e3f2` | `7cc7e16e` | reproduced: 12 FAIL, cleanup `ok` |
| 03:14 | `e46f42bd` | `9b21cfc4` | temporary: the diagnosis in the 503 |
| 03:22 | `b70de69e` | `0b4fd37d` | temporary: the measured margin in the 503, a probe line in `submit` |
| 03:34 | `6d15d828` | `c18342a3` | the fix, `0753d7de` (source as at this head) |

Each deploy used `packages/room/scripts/deploy-spike.sh`, with no retry. The same `ROOM_KEY_SECRET` and `CHECKER_KEY` values were put again; no credential was created or rotated. Neither temporary change is in any commit.

**The smoke on the fix**, all phases, `node packages/room/measure/spike-smoke.mjs`, 03:35:10 to 03:39:12 UTC: passed, exit 0, 91 of 91 steps ok. The four proposes took 1.1 to 3.1 s. The public, import and checks logs were published and verified (through entries 14, 8 and 15). Cleanup was `ok`, with 0 unresolved and no repository left. A tail of that run recorded 239 events from `6d15d828`, all `ok`, with no log line and no exception. Record: [spike-smoke-2026-10-03T03-35-10-310Z.json](../packages/room/measure/results/spike-smoke-2026-10-03T03-35-10-310Z.json). The spike is left running this fix.

**A cleanup that needed finishing.** The first temporary run (03:15 UTC) stopped after the public phase, when hugh's wrangler OAuth access token expired mid-run: Artifacts REST answered `10000 Authentication error`, so the smoke's cleanup could not run and reported `ok false`. After `wrangler whoami` refreshed the login, the same `cleanupRun` from `measure/cleanup.mjs` deleted the run's canonical repository and two forks, with no active token on them, and its final listing showed nothing left. Neither spike namespace has a smoke repository left. Later runs refreshed the login first.

### Gates

Run at the exact head that carries this section, serially; the exit codes are in the delivery report. `npm run typecheck`, `npm test`, `npm run test:workers` and `npm run test:log` in `@generalbusiness/artroom-git`; `npm run typecheck`, `npm run test:node` and `npm run test:workerd` in `@generalbusiness/artroom-room`; then from the root, under bash, `npm ci`, `npm run typecheck` and `npm test`.

### Not changed here

How the Durable Object runtime delivers trace events. Sending diagnoses from the stateless Worker as well, so they show at once, would need the Room to pass them over RPC; that is a separate request if wanted.

## Declared acts stage 1 (request 245986cb)

Status: implemented, pending review. Gitseq request `245986cb` (planner to builder), stage 1 of 7 in section 8.5 of [notes/2026-10-02-declared-acts.md](../notes/2026-10-02-declared-acts.md), approved as design in review `1808ae17`, under hugh's assert `4e4134b4` as corrected by `b2cdc44a`. Branch `request/decl-stage1`, cut from main `b44601dd`. The head for review is the commit that carries this section. Nothing was pushed or deployed, and no Cloudflare credential was used.

The request cited some sections by an earlier revision's numbers. As the coordinator corrected: the acts validator is the note's section 3.4, the recovery decision 3.5, the evaluator decision 3.8, and the amendment inventory 8.2. This work follows those sections.

### What was added

- **Protocol.** [docs/protocol.md](../docs/protocol.md) section 33, contract amendment 6: rules R-DECL-1 to R-DECL-26 (33.2); every "Amend" of the note's section 8.2, plus R-SIG-1, R-SIG-5, R-ADM-3, R-CRED-10 and R-POL-12, in one table (33.3); every new refusal code, event and outcome in one table (33.4), including `kind-undeclared`, `binding-stale`, `wrong-thread`, `scope-fixed`, `reserved`, `check-unroutable`, `prepared`, `reservation-ended`, `handed-over`, `hold-unending`, the verify failures, `git-unwitnessed`, and the verifier's unsupported-version outcomes `steps-unsupported` and `profile-unsupported`; acceptance cases by stage (33.5); the stage-2 suite criterion (33.6); the types and data (33.7); conditions and stages (33.8); open points 46 to 48 (33.9). Assert `e7307f81`'s two passages are quoted in the section's opening and stated as rules in R-DECL-17 (intersection, never acquisition) and 33.6 (the four fixture conversions, none permission to weaken an assertion).
- **The note.** The wording of commit `d126b9d2` (branch `declared-acts-wording`) is applied to the landed note, unchanged: the `v1`-era grant intersection rule in section 2.3.2, and the four listed fixture conversions in sections 6 and 8.5. The note and the protocol now agree.
- **Contract.** `packages/contract/src/declarations.ts`: the declaration types (`ActDeclaration` and its parts: targets and steps, `threads`, `body` fields, `who`, `hold`, refusal wording and slots, `help`), `PolicyDocumentV2` with `acts`, `steps` and `profile`, `CheckerConfigV2` with `act`, the binding (`Binding`, `BindingSubject`, `BindingField`, `BindingHold`), grant maps (`GrantMap`, `DelegateOpV2`, `InvitationSessionV2`, `DelegationV2`), `DeclaredEnvelope` (`v: 2` with `binding`), `DeclaredBearerAct`, the platform kinds and `RecoverOp`, `CheckJobV2`, `DeclaredPolicyLane`, `PreparedEvent`, `ReservationEndedEvent`, `HandedOverEffect`, `CheckUnroutable` and its attention item, `ActsCatalogue`, and the verify outcome names. `packages/contract/src/legacy.ts`: `ARTROOM_LEGACY_V1`, the legacy vocabulary as deep-frozen data, and `ARTROOM_LEGACY_V1_DIGEST` (`sha256:ea4361a697d1c7e1bf7ecdfe6576b81ecbad48aee78b857e0a7958dfa14b3937`). `PlatformRule` gains the five new refusal codes. The seven typed records and every existing type are unchanged.
- **Policy.** `packages/policy/src/acts.ts`: the acts validator `validatePolicyV2` (with the room's historical opening kinds and the head's checker configurations as context) and `validateCheckerConfigV2`, 73 guards, each one statement marked `// G:<id>`. `binding.ts`: `bindingSubject`, `bindingOf`, `bindingsOf`. `codereview.ts`: `CODE_REVIEW_ACTS`, the note's section 6 declarations as deep-frozen data. All are exported; nothing at runtime calls them. `validate.ts` now exports its helpers (`Problems`, `documentFields`, `checkerFields`, `result`) so the two validators share one implementation; `validatePolicy` and `validateCheckerConfig` check the same things in the same order with the same messages.
- **Tests.** `packages/policy/test/declared-acts.test.ts`, 104 tests (in workerd one node-only test is skipped), and the jam fixture `packages/policy/test/support/jam.ts`, copied from note section 7.1.

### Decisions for hugh (note 3.5 and 3.8)

Written as the note recommends, since hugh has not decided otherwise: a platform kind `recover` for configuration recovery in `v2` rooms (R-DECL-21), and a policy document that names its evaluator profile, changed only by activation, with the genesis naming the initial profile (R-DECL-22, amending R-GEN-1, R-GEN-10 and R-EVAL-4). If hugh decides otherwise before review, only those two rules change.

### Where this departs from the note, and why

1. **`recover` has a seventh op, `take`.** The note lists six. R-ADMIN-5 and R-LANE-7 let an admin take over a recovery lane today, and a legacy recovery lane still open at the first `v2` activation needs that path once its holder's lease expires.
2. **`kind-undeclared` is decided first in step 4a, not at step 5** (open point 47). The note puts the binding check between steps 4 and 5, and a binding can be compared only with a declared kind. Both steps are unrecorded.
3. **An absent `leaseSeconds` binds to the string `"room"`** (point 46, now settled). The room's lease is deployment configuration (`LEASE_SECONDS`); resolving it to a number in the binding would let a deploy change bindings, which note 3.9 forbids. After the checker's question in review, the numeric value is resolved when a thread opens and recorded on the thread, and R-DECL-6 and R-DECL-9 use that recorded value for the thread's life, so a deployment lease change affects only threads opened afterwards. The binding still excludes the number; the test "the subject resolves every default" pins `leaseSeconds: "room"`, and mutant `B:lease-default` turns it red.
4. **The binding resolves required-ness.** A body field's `optional` and `requiredFor` become one list, `required`, of the act's targets where the field is required, so writing a default out never changes a binding. Lists otherwise keep their written order.
5. **`threads` exactly when needed.** The validator also refuses `threads` on an act with no `thread`, `version` or `line` target, where it would mean nothing.
6. **Reservation lengths.** An absent `reserveSeconds` means the thread cannot be handed over, and a `hand-over` naming a declared opening kind without one is refused (guard `handover-reserve`). The note gave no default.
7. **Bounds the note left to the amendment** (R-DECL-26): at most 64 kinds and 32 fields per act; label, help and wording lengths; field-name and enum-value grammars (an enum value must be able to fill a scope slot).
8. **Scope slots** must name a `segment` or `enum` field that is required on target `none`, so a slot is never empty at `open`.
9. **"Body field names do not reuse a step's field names"** is read per act, for the act's own steps. Read across all steps, it would refuse the note's jam `signal`, whose `to` field is also `hand-over`'s.
10. **New types sit beside the existing unions.** `SystemEvent`, `LaneEffect`, `FailReason`, `AttentionWhy`, `RosterOp`, `Envelope` and `CheckJob` are unchanged: the UI and CLI switch exhaustively over some of them, so widening them now would force code changes that stage 1 excludes. Each new type names the stage that joins it. `PlatformRule` was widened, because nothing switches over it.
11. **The legacy description is of main `b44601dd`**, not `df22d771`. Between the two, admission differs only by the spike-only `PIN_DELAY_MS` switch (request `8bd623cc`), which admits the same acts.
12. **The contract package has no test runner,** so the digest test lives in the policy package, which depends on the contract. The digest uses the same `digestJson` that records decision inputs.

### Rule map

| Rule | Contract | Validator guards and functions | Tests (`declared-acts.test.ts`) |
|---|---|---|---|
| R-DECL-1 | `ARTROOM_LEGACY_V1`, `ARTROOM_LEGACY_V1_DIGEST`, `PolicyDocumentV2` | `doc-format`, `doc-object`, `doc-keys` | the legacy digest; frozen to the leaves; `G:doc-*` |
| R-DECL-2 | `KindName`, `PlatformKind` | `kind-grammar`, `kind-reserved` (`RESERVED_KINDS`) | `G:kind-grammar`; `G:kind-reserved` (`prepared`, `recover`) |
| R-DECL-3 | `ActDeclaration` | `decl-object`, `decl-keys`, `label`, `help` | `G:decl-*`, `G:label`, `G:help` |
| R-DECL-4 | `TargetShape`, `Step`, `StepList` | `targets-nonempty`, `target-shape`, `target-steps` (`STEPS_FOR_TARGET`) | `G:target-*` (wrong target, third step, pair on `version`) |
| R-DECL-5 | `Step` | `field-reserved` (`STEP_FIELDS`) | `G:field-reserved` |
| R-DECL-6, R-DECL-23 | `ThreadKind` | none (stage 2) | none |
| R-DECL-7 | `HoldDeclaration.scope` | `hold-scope`, `template-chars`, `slot-field`, `template-glob` | `G:hold-scope`, `G:template-*`, `G:slot-field` |
| R-DECL-8 | `ActDeclaration.threads` | `threads-required`, `threads-unused`, `threads-list`, `threads-known` | `G:threads-*`; a historical opening kind is valid |
| R-DECL-9 | `HoldDeclaration` | `hold-required`, `hold-unused`, `hold-object`, `hold-keys`, `hold-conflict`, `hold-lease`, `hold-workspace` | `G:hold-*` |
| R-DECL-10 | `reserveSeconds`, `HandedOverEffect`, `ReservationEndedEvent` | `hold-reserve`, `handover-reserve` | `G:hold-reserve`, `G:handover-reserve` |
| R-DECL-11 | `ActDeclaration.who` | `who-object`, `who-keys`, `roles-list`, `roles-admin`, `roles-known`, `roles-checker`, `delegable` | `G:who-*`, `G:roles-*`, `G:delegable` |
| R-DECL-12 | `DeclaredField` | `body-object`, `body-count`, `field-name`, `field-reserved`, `field-object`, `field-type`, `field-keys`, `text-max`, `globs-max`, `int-range`, `enum-values`, `optional-bool`, `optional-and-requiredfor`, `requiredfor-targets` | `G:body-*`, `G:field-*`, one test per type limit |
| R-DECL-13 | `RefusalWording`, `RefusalSlot` | `refusals-object`, `refusal-code`, `wording-object`, `refusal-keys`, `wording-length`, `wording-slot`, `wording-brace` | `G:refusal*`, `G:wording-*` |
| R-DECL-14 | `StepsVersion` | `doc-steps`; the binding's `steps` | `G:doc-steps`; the steps version changes the binding |
| R-DECL-15 | `Binding`, `BindingSubject`, `BindingField`, `BindingHold` | `bindingSubject`, `bindingOf` | the subject resolves every default; label, help, wording and `who` leave it unchanged; writing a default out leaves it unchanged; each change of meaning changes it; an explicit conflict ignores `lanes`; one kind's change leaves the others unchanged; it is the SHA-256 of canonical JSON |
| R-DECL-16, R-DECL-17 | `DeclaredEnvelope`, `DeclaredBearerAct`, `GrantMap`, `DelegateOpV2`, `InvitationSessionV2`, `DelegationV2`; `PlatformRule` | types only (stage 2) | typecheck |
| R-DECL-18 | `CheckerConfigV2`, `CheckJobV2` | `checker-shape`, `checker-object`, `checker-keys`, `checker-format`, `checker-act`, `checker-declared`, `checker-step`, `checker-role`, `checker-body` | `G:checker-*` (no `act`, undeclared, `signal`, `review`, roles, a required field, the v1 format); the code-review `check` act may be named |
| R-DECL-19, R-DECL-20 | `CheckUnroutable`, `CheckUnroutableAttention`, `PreparedEvent` | types only (stage 4) | typecheck |
| R-DECL-21 | `RecoverOp`, `RecoverTargets`, `RecoverEnvelope` | `recover` reserved; rules may name it | `G:kind-reserved` (`recover`); rules may name platform kinds |
| R-DECL-22 | `ProfileVersion`, `PolicyDocumentV2.profile` | `doc-profile` | `G:doc-profile` |
| R-DECL-24 | none | all of `validatePolicyV2`, including `acts-object`, `acts-count`, `rule-on`, `sound-version`, `sound-handover` and the warning `warn-unending` | the code-review and jam documents validate; one `G:` test per guard; a node-only test fails if any guard marker lacks a test |
| R-DECL-25 | `DeclaredVerifyFailure`, `VerifyProofLimit`, `VerifyUnsupported` | none (stages 3 and 6) | typecheck |
| R-DECL-26 | `DECLARATION_BOUNDS` (policy) | the bound guards above | the bound tests above |

### Mutation table

Each mutant was applied alone by `/private/tmp/claude-501/-Users-hughpyle-play-gitseq/3a928963-7b06-44e6-b22a-1b24ab3c0e34/scratchpad/mutate.py`, after the implementation was committed (`21260cac`). It edits one call site, runs `npx vitest run --config vitest.config.ts test/declared-acts.test.ts` in `packages/policy` (node), records the failing tests from the JSON reporter, and writes the file's original bytes back; it never runs `git checkout`. `git status --porcelain` was empty afterwards. A `G:` mutant turns the guard's report (`p.add`, `p.keys` or `warnings.push`) into `void`, so the guard still decides but reports nothing; `G:rule-on` makes the `on` predicate accept any string. `B:` mutants are in `binding.ts`, `L:` in `legacy.ts`, `C:` in `codereview.ts`.

**91 mutants, all red.** Every `G:` mutant turned its own named test red. None survived, and none broke the test file's loading.

| # | Mutant | Mutation | Tests turned red |
|---|---|---|---|
| 1 | `G:doc-object` | `p.add` at the guard becomes `void` | G:doc-object refuses a document that is not an object |
| 2 | `G:doc-keys` | `p.keys` at the guard becomes `void` | G:doc-keys refuses an unknown document field |
| 3 | `G:doc-format` | `p.add` at the guard becomes `void` | G:doc-format refuses format v1 with acts |
| 4 | `G:doc-profile` | `p.add` at the guard becomes `void` | G:doc-profile refuses an unknown profile |
| 5 | `G:doc-steps` | `p.add` at the guard becomes `void` | G:doc-steps refuses an unknown steps version |
| 6 | `G:acts-object` | `p.add` at the guard becomes `void` | G:acts-object refuses acts that are not an object |
| 7 | `G:acts-count` | `p.add` at the guard becomes `void` | G:acts-count refuses 65 kinds |
| 8 | `G:rule-on` | the `on` predicate accepts any string | G:rule-on refuses a rule on an undeclared kind |
| 9 | `G:kind-grammar` | `p.add` at the guard becomes `void` | G:kind-grammar refuses a kind with a capital letter |
| 10 | `G:kind-reserved` | `p.add` at the guard becomes `void` | G:kind-reserved refuses a reserved kind; G:kind-reserved refuses the platform kind recover |
| 11 | `G:decl-object` | `p.add` at the guard becomes `void` | G:decl-object refuses a declaration that is not an object |
| 12 | `G:threads-known` | `p.add` at the guard becomes `void` | G:threads-known refuses a misspelt thread kind; G:threads-known refuses a kind that never opened a thread here |
| 13 | `G:handover-reserve` | `p.add` at the guard becomes `void` | G:handover-reserve refuses a hand-over onto a hold without reserveSeconds |
| 14 | `G:decl-keys` | `p.keys` at the guard becomes `void` | G:decl-keys refuses an unknown declaration field |
| 15 | `G:label` | `p.add` at the guard becomes `void` | G:label refuses an empty label |
| 16 | `G:help` | `p.add` at the guard becomes `void` | G:help refuses help over 4,096 bytes |
| 17 | `G:targets-nonempty` | `p.add` at the guard becomes `void` | G:targets-nonempty refuses no targets |
| 18 | `G:target-shape` | `p.add` at the guard becomes `void` | G:target-shape refuses an unknown target shape |
| 19 | `G:target-steps` | `p.add` at the guard becomes `void` | G:target-steps refuses a step on the wrong target; G:target-steps refuses a third step; G:target-steps refuses version then land on a version target |
| 20 | `G:threads-required` | `p.add` at the guard becomes `void` | G:threads-required refuses a thread act without threads |
| 21 | `G:threads-unused` | `p.add` at the guard becomes `void` | G:threads-unused refuses threads on an act with no thread target |
| 22 | `G:threads-list` | `p.add` at the guard becomes `void` | G:threads-list refuses a repeated thread kind |
| 23 | `G:body-object` | `p.add` at the guard becomes `void` | G:body-object refuses a body that is not an object |
| 24 | `G:body-count` | `p.add` at the guard becomes `void` | G:body-count refuses 33 body fields |
| 25 | `G:who-object` | `p.add` at the guard becomes `void` | G:who-object refuses no who |
| 26 | `G:who-keys` | `p.keys` at the guard becomes `void` | G:who-keys refuses an unknown who field |
| 27 | `G:roles-list` | `p.add` at the guard becomes `void` | G:roles-list refuses roles that are not a list |
| 28 | `G:roles-admin` | `p.add` at the guard becomes `void` | G:roles-admin refuses admin listed explicitly |
| 29 | `G:roles-known` | `p.add` at the guard becomes `void` | G:roles-known refuses an unknown role |
| 30 | `G:roles-checker` | `p.add` at the guard becomes `void` | G:roles-checker refuses checker on an act with step version |
| 31 | `G:delegable` | `p.add` at the guard becomes `void` | G:delegable refuses delegable that is not a boolean |
| 32 | `G:hold-required` | `p.add` at the guard becomes `void` | G:hold-required refuses an opening act without a hold |
| 33 | `G:hold-unused` | `p.add` at the guard becomes `void` | G:hold-unused refuses a hold on an act without step open |
| 34 | `G:refusals-object` | `p.add` at the guard becomes `void` | G:refusals-object refuses refusals that are not an object |
| 35 | `G:refusal-code` | `p.add` at the guard becomes `void` | G:refusal-code refuses wording for an unknown refusal code |
| 36 | `G:wording-object` | `p.add` at the guard becomes `void` | G:wording-object refuses wording that is not an object |
| 37 | `G:refusal-keys` | `p.keys` at the guard becomes `void` | G:refusal-keys refuses wording with an unknown field |
| 38 | `G:field-name` | `p.add` at the guard becomes `void` | G:field-name refuses a field name with a capital first letter |
| 39 | `G:field-reserved` | `p.add` at the guard becomes `void` | G:field-reserved refuses a field named like its step's field; G:field-reserved refuses a field named because |
| 40 | `G:field-object` | `p.add` at the guard becomes `void` | G:field-object refuses a field that is not an object |
| 41 | `G:field-type` | `p.add` at the guard becomes `void` | G:field-type refuses an unknown field type |
| 42 | `G:field-keys` | `p.keys` at the guard becomes `void` | G:field-keys refuses a parameter its type does not have |
| 43 | `G:text-max` | `p.add` at the guard becomes `void` | G:text-max refuses text over 16 KiB |
| 44 | `G:globs-max` | `p.add` at the guard becomes `void` | G:globs-max refuses globs over 64 |
| 45 | `G:int-range` | `p.add` at the guard becomes `void` | G:int-range refuses an int with min over max |
| 46 | `G:enum-values` | `p.add` at the guard becomes `void` | G:enum-values refuses a repeated enum value; G:enum-values refuses an enum value that cannot fill a scope |
| 47 | `G:optional-bool` | `p.add` at the guard becomes `void` | G:optional-bool refuses optional that is not a boolean |
| 48 | `G:optional-and-requiredfor` | `p.add` at the guard becomes `void` | G:optional-and-requiredfor refuses both optional and requiredFor |
| 49 | `G:requiredfor-targets` | `p.add` at the guard becomes `void` | G:requiredfor-targets refuses requiredFor naming a target the act lacks |
| 50 | `G:hold-object` | `p.add` at the guard becomes `void` | G:hold-object refuses a hold that is not an object |
| 51 | `G:hold-keys` | `p.keys` at the guard becomes `void` | G:hold-keys refuses an unknown hold field |
| 52 | `G:hold-conflict` | `p.add` at the guard becomes `void` | G:hold-conflict refuses an unknown conflict mode |
| 53 | `G:hold-lease` | `p.add` at the guard becomes `void` | G:hold-lease refuses a lease under 10 seconds; G:hold-lease refuses a lease over 24 hours |
| 54 | `G:hold-reserve` | `p.add` at the guard becomes `void` | G:hold-reserve refuses a reservation over 10 minutes; G:hold-reserve refuses a reservation of 0 seconds |
| 55 | `G:hold-workspace` | `p.add` at the guard becomes `void` | G:hold-workspace refuses workspace that is not a boolean |
| 56 | `G:hold-scope` | `p.add` at the guard becomes `void` | G:hold-scope refuses an empty template; G:hold-scope refuses a scope source naming another body field |
| 57 | `G:template-chars` | `p.add` at the guard becomes `void` | G:template-chars refuses a template glob over 256 characters |
| 58 | `G:slot-field` | `p.add` at the guard becomes `void` | G:slot-field refuses a slot naming a text field; G:slot-field refuses a slot naming an optional field |
| 59 | `G:template-glob` | `p.add` at the guard becomes `void` | G:template-glob refuses a template that is not a glob once filled |
| 60 | `G:wording-length` | `p.add` at the guard becomes `void` | G:wording-length refuses an empty reason; G:wording-length refuses a fix over 512 bytes |
| 61 | `G:wording-slot` | `p.add` at the guard becomes `void` | G:wording-slot refuses a slot that is not a refusal slot |
| 62 | `G:wording-brace` | `p.add` at the guard becomes `void` | G:wording-brace refuses a brace that opens no slot |
| 63 | `G:sound-version` | `p.add` at the guard becomes `void` | G:sound-version refuses reviews with no act that makes versions |
| 64 | `G:sound-handover` | `p.add` at the guard becomes `void` | G:sound-handover refuses a hand-over with no act that can take the thread |
| 65 | `G:warn-unending` | `warnings.push` at the guard becomes `void` | the jam's declarations validate with in-key.json; propose-rules holds end only by expiry; G:warn-unending reports an opening kind no act can end, without refusing |
| 66 | `G:checker-shape` | `p.add` at the guard becomes `void` | G:checker-shape refuses a v1 checker configuration in a v2 document; G:checker-act refuses a checker configuration with no act |
| 67 | `G:checker-declared` | `p.add` at the guard becomes `void` | G:checker-declared refuses a checker naming an undeclared kind |
| 68 | `G:checker-step` | `p.add` at the guard becomes `void` | G:checker-step refuses a checker naming signal; G:checker-step refuses a checker naming review |
| 69 | `G:checker-role` | `p.add` at the guard becomes `void` | G:checker-role refuses a check act checkers may not sign |
| 70 | `G:checker-body` | `p.add` at the guard becomes `void` | G:checker-body refuses a check act with a required body field |
| 71 | `G:checker-object` | `p.add` at the guard becomes `void` | G:checker-object refuses a configuration that is not an object |
| 72 | `G:checker-keys` | `p.keys` at the guard becomes `void` | G:checker-keys refuses an unknown configuration field |
| 73 | `G:checker-format` | `p.add` at the guard becomes `void` | G:checker-shape refuses a v1 checker configuration in a v2 document; G:checker-format refuses artroom-checker-v1 directly |
| 74 | `G:checker-act` | `p.add` at the guard becomes `void` | G:checker-act refuses a checker configuration with no act |
| 75 | `B:label` | the subject includes `label` | the subject resolves every default; label, help, refusal wording and who leave the binding unchanged |
| 76 | `B:who` | the subject includes `who` | the subject resolves every default; label, help, refusal wording and who leave the binding unchanged |
| 77 | `B:kind` | the subject drops the kind's name | the subject resolves every default; a step list, body field, scope source, hold setting, threads, kind or steps version changes it |
| 78 | `B:steps` | the subject ignores the document's steps version | a step list, body field, scope source, hold setting, threads, kind or steps version changes it |
| 79 | `B:targets` | the subject drops the step lists | the subject resolves every default; a step list, body field, scope source, hold setting, threads, kind or steps version changes it |
| 80 | `B:threads` | the subject drops `threads` | the subject resolves every default; a step list, body field, scope source, hold setting, threads, kind or steps version changes it |
| 81 | `B:body` | the subject drops the body fields | the subject resolves every default; a step list, body field, scope source, hold setting, threads, kind or steps version changes it |
| 82 | `B:hold` | the subject drops the hold | the subject resolves every default; writing a default out leaves the binding unchanged; a step list, body field, scope source, hold setting, threads, kind or steps version changes it |
| 83 | `B:conflict-default` | an absent conflict ignores the policy's lanes | a step list, body field, scope source, hold setting, threads, kind or steps version changes it |
| 84 | `B:lease-default` | an absent lease resolves to the deployment default | the subject resolves every default |
| 85 | `B:reserve-default` | an absent reservation resolves to 0 | the subject resolves every default |
| 86 | `B:workspace-default` | an absent workspace resolves to true | writing a default out leaves the binding unchanged |
| 87 | `B:optional` | `optional` no longer clears `required` | the subject resolves every default; a step list, body field, scope source, hold setting, threads, kind or steps version changes it |
| 88 | `B:required-for` | `requiredFor` is ignored | the subject resolves every default |
| 89 | `L:data` | one value of the legacy description changes | the legacy vocabulary's digest is the one the contract states |
| 90 | `L:freeze` | the legacy description is not frozen | the legacy vocabulary is frozen, to the leaves |
| 91 | `C:freeze` | the code-review declarations are not frozen | the code-review declarations are frozen, to the leaves |

### Gates

Run under bash at the implementation commit `21260cac`, serially, with exit codes checked. The branch then merged main `a6fcce54` (request `df6ff8d3`: R-MINT-3 amended in place in section 32, which does not touch section 33 or its numbering). The gates were run again at the merge head, which is the head for review; its counts are in the delivery report, since main's merge adds tests to the git and room packages. Main `b44601dd`'s counts were measured in the same worktree before any change.

| Gate | Exit | Result | Main `b44601dd` |
|---|---|---|---|
| `npm ci` (root) | 0 | installed | 0 |
| `npm run typecheck` (root) | 0 | every workspace | 0 |
| `npm test` (root) | 0 | 2,275 passed, 2 skipped | 2,068 passed, 1 skipped |
| `npm run typecheck` in `packages/contract` | 0 | | |
| `npm run typecheck` in `packages/policy` | 0 | src and tests | |
| `npm test` in `packages/policy` | 0 | node 303 passed; workerd 301 passed, 2 skipped | node 199; workerd 198, 1 skipped |
| `git diff --check origin/main` | 0 | clean | |

Per package, root `npm test` (node, then workerd where a package has both): checkers 43; cli 162; client 88 and 2; log 198 and 193; mcp 73 and 5; policy 303 and 301 (+2 skipped); room 237 and 529; ui 141. Every count except policy's equals main's. Policy's difference is exactly the 104 new tests; the extra workerd skip is the node-only guard-coverage test. No existing test was changed.

### Not changed here

The room, log, client, MCP, CLI, checkers and UI packages, and `examples/`, are unchanged: nothing reads the new types or data yet. The version witness type (note 4.3, stage 6) is not defined here; its shape belongs to that stage. `LICENSE`, `NOTICE` and `AGENTS.md` are untouched.

## Mint lane F (request 02836f9a)

Status: DONE, pending checker exact-head review. Gitseq request `02836f9a`, branch `request/fork-token`, cut from main `965c911a`, with main `58a2f0a0` merged in (merge `31ec8a77`; see [The merge with main 58a2f0a0](#the-merge-with-main-58a2f0a0)), then request `df6ff8d3`'s branch at `6e585cf9` (merge `012ea686`) and, once that landed, main `a6fcce54` (merge `f2421024`, no further content). This revision answers the checker's preliminary findings C1 to C4 on `3d1223a1`: see [Review findings C1 to C4](#review-findings-c1-to-c4-on-3d1223a1). The approved mint ownership design ([notes/2026-10-02-canonical-mint-ownership.md](../notes/2026-10-02-canonical-mint-ownership.md), "Out of scope", review `ad6cc052`) left one token outside every ledger: the 600-second read token that `Pinning.pinObjects` mints on the lane's fork. It had a hidden retry (`withRetry` around a create that may have applied) and a dropped revocation. This lane gives it a ledger owned by the fork's owner, and applies [docs/protocol.md](../docs/protocol.md) section 32 (R-MINT-2 to R-MINT-7) to it by analogy. The head for review is the commit that carries this section.

**Scope.** New: `packages/git/src/workspace/fork-tokens.ts` (the ledger), `packages/git/test/fork-tokens.test.ts` (28 Node tests) and `packages/room/test/workerd/fork-token-02836f9a.test.ts` (7 Durable Object tests). Changed: `packages/git/src/workspace/workspaces.ts` (builds and owns the ledger, checks provenance for it, asks it about each token in the fork's sweep, two token indexes), `publisher/client.ts` (`withForkToken` removed; `Pinning` takes the ledger), `mints.ts` (exports `MINT_RETRY`, the retry limits, unchanged; `MINT_ID_WRITE_ATTEMPTS`, and the canonical ledger's failed handoff keeps the known ID, for C2), `docs/protocol.md` (R-MINT-3 amended for C2), `packages/git/test/mints.test.ts` (the canonical test (6) restated, one added), `index.ts` (exports), the Git harness (`measure/harness/worker.ts`), `packages/room/src/artifacts.ts` and `core.ts` (the adapter passes the ledger; a `forkTokens` step and loop kind; `nextAlarm`), the source scan (`test/node/mint-sites-scan.test.ts`), and the two package READMEs. No Room migration. Nothing was deployed, no live Cloudflare call was made, and no credential was created, rotated or used.

### Who owns the fork

A lane fork has no durable store of its own. It is an Artifacts repository, and the only object that creates, provisions, sweeps and records it is the Room, through lane B's `Workspaces` on the Room's SQLite (`artroom_ws`, `artroom_ws_duty`). So `Workspaces` is the fork's lifecycle owner, and the ledger belongs to it: `Workspaces` builds a `ForkTokens` in its constructor and exposes it as `workspaces.forkTokens`. Its tables (`artroom_fork_mint`, `artroom_fork_mint_watch`, `artroom_fork_mint_summary`) sit beside the workspace tables. The canonical `MintLedger`, its tables and its records are not used: a fork token never appears in `room.core.mints.duties()` (R1 checks this).

### What was built

- **Before the create.** `mint(fork, purpose, ttl)` first looks the fork up through its owner, within the bounded wait (30 s, `MINT_WAIT_MS`). The owner checks provenance (`Workspaces.ourFork`): a repository at the fork's name that is not this room's fork, an absent fork, or one still being created is refused, and nothing is sent to it. Then one transaction writes the record as `sent` (fork, purpose `pin-objects:<head>`, read, 600 s, send time) and moves the takeover time 60 s ahead if it is less than 30 s away. Then the wake-up is awaited. If the record or the wake-up cannot be stored, the record is deleted and nothing is sent. After the wake-up, the record is checked to be still `sent`, then the create is sent and waited on for at most 30 s.
- **The answer** is classified once, whenever it arrives. Usable: a token ID and text, read scope, and a readable expiry no later than the answer's arrival plus the lifetime asked plus `MINT_CLOCK_ALLOWANCE_MS` (5 s; R-MINT-3's clock-skew contract, request `df6ff8d3`), for a caller still waiting; the record becomes `held`. A token ID otherwise: `owed`, due at once, with its reported expiry or none. A refusal that changed nothing (`refusedUnchanged`): the record is deleted. Anything else, including a transport failure, `INTERNAL_ERROR`, an answer without an ID and the 30 s wait running out: `unknown`. A late answer is applied to its own record only, by its row ID and expected state, and never reaches a caller. If an answer with a token ID cannot be recorded, the ID is written durably as owed, with at most 3 bounded writes (`MINT_ID_WRITE_ATTEMPTS`), before the token is revoked at once by that ID; an answered revocation ends the record, a failed one leaves it owed with its ID. Only if storage refuses every write does the record keep its earlier state (R-MINT-3 as amended; C2).
- **Retries.** The hidden retry is gone. Only `retriable()` errors (`INTERNAL_ERROR`, `UPSTREAM_UNAVAILABLE`) are retried, with the canonical ledger's limits (5 attempts, from 0.5 s), and each attempt is a new record, sent only after the earlier record holds its outcome (`unknown`). A transport failure or a lost answer is not retried.
- **Release.** `withToken` revokes the token by its ID however the pin ends, waiting at most 30 s. An answer deletes the record. A failure, a timeout or a completion that does not commit makes it `owed`, due in 1 s; a late answer to that revocation changes nothing.
- **Takeover.** The constructor (so each object start, in a founded room at `recover()`, which reaches it through `nextAlarm()`) turns every `sent` record into `unknown` and every `held` record into `owed`, due at once, in one indexed update.
- **The alarm.** `reconcile()` keeps or clears the takeover time, starts a revocation pass (not awaited), and observes at most one fork (awaited, bounded). A pass takes at most 20 owed records due now, earliest due first, then by row ID (index `artroom_fork_mint_state`); one runs at a time; while it waits on an answer, owed records are not eligible before that attempt's timeout. A pass that finds expired records settles only those, with no lookup and no call, and ends. Otherwise each fork in the batch is looked up once, bounded and with provenance; each record's readable expiry is checked again immediately before its revocation; results are written in one transaction. Backoff: 1 s doubling to 5 min, never past a readable expiry. A record with no readable expiry is never settled by time.
- **Watching unknown creates.** Each fork with unknown records has one watch row: its count of unknown records and its observation. An alarm observes at most one fork, the one due earliest (index `artroom_fork_mint_watch_due`): one bounded lookup and listing, `completeInventory`, at most 1,000 records, and a count of live tokens that nobody attributes by ID. A token counts as attributed if a ledger record names it (index `artroom_fork_mint_token`), or if the fork's owner holds it: the lane's lease token (`artroom_ws.token_id`) or a token revocation the workspace owes (`artroom_ws_duty.token_id`). Both are point lookups on two new indexes. Each observation makes one write, to that fork's watch row. The next is due after a wait doubling from 1 min to 6 h; a new unknown record never brings it sooner than 1 min after the last; a fork whose unknown records were all settled by their own late answers is not observed. No record is written, settled or revoked by an observation.
- **`nextDue()`** is the earliest of the owed records' due time, the earliest fork observation, and the takeover time while a record is `sent` or `held`. A time already passed counts as now plus 1 s; a still-future time counts as itself.
- **The fork's sweep** (R-WS-3; plans 001 and 002) asks about each token immediately before its revocation, after every earlier await. It keeps the lease's recorded token and a token the ledger holds for a pin in progress. While any fork token create on that fork is `sent` or `unknown`, it revokes only tokens whose IDs a record names (the ledger's records, or the workspace's owed token duties) and leaves every other active token; no time ends this, only the record's own answer (C1, C3).
- **The Room.** `ArtifactsAdapter` passes a delegate to `workspaces.forkTokens` to `Pinning` (the workspaces are built once the room is founded). The alarm runs the ledger as its own step and loop kind, `forkTokens`: self-timed like `mints`, so a failure of the step takes that kind's backoff, which ends only when the step runs. `nextAlarm()` includes `forkTokens.nextDue()`, after that backoff. The kind is not in `NEEDS_REPOSITORY`: forks are separate repositories, so the ledger runs and is scheduled while the canonical repository is gone, as workspace cleanup is.
- **Safe metadata.** Every stored error is `errorNote(stage, e)`, using the existing stages.
- **The source scan** allows `workspace/fork-tokens.ts` one reach of `createToken`, as `mints.ts`, `workspaces.ts` and `snapshot/repos.ts` have; `publisher/client.ts` now reaches it nowhere, and a reach put back there fails the scan.

### Where the fork ledger differs from section 32, and why

| Rule | Canonical ledger | Fork ledger | Why |
|---|---|---|---|
| R-MINT-1 | Owner: `MintLedger`, the Room's canonical records | Owner: `Workspaces`, the fork's lifecycle owner; its own tables | The request's condition; R-MINT-1 says fork tokens are not canonical mints |
| R-MINT-2 | Lifetime computed after the wake-up, then stored by a second update | Lifetime (fixed, 600 s) recorded with the record before the wake-up; after the wake-up the record is only checked to be still `sent` | There is no `notAfter`, so a slow wake-up cannot carry the lifetime past any bound. One write fewer per mint |
| R-MINT-2 | One repository, looked up before the record | The fork is looked up, with provenance, before the record; every create, revocation and listing goes through the same check | A fork's name can be held by another repository (plan 002); nothing is ever sent to it |
| R-MINT-3 | Scope asked; lifetime bound with `MINT_CLOCK_ALLOWANCE_MS`; `notAfter` with no allowance | Read scope only; the same lifetime bound with the same allowance; no `notAfter` | Pinning asks for one kind of token, and no fork token has a deadline. The fork check follows R-MINT-3's clock-skew contract (C4) |
| R-MINT-4 | `claim()` hands a token to another owner | No handoff: the caller always releases | Pinning uses the token only for the length of one sandbox call |
| R-MINT-5 | Never revokes a token it cannot match by ID; never sweeps the canonical repository | The ledger never revokes a token it cannot match by ID, and neither does the fork's sweep while one of the ledger's creates on that fork is `sent` or `unknown`: R-WS-3's cleanup of unrecorded tokens is suspended on that fork, not inferred around, until the record is settled by its own answer | The fork has a sweep the canonical repository does not (R-WS-3). A create takes no label, and nothing bounds when it applies (R-MINT-6, open points 42 and 43), so no listing, timing or lifetime can tell its token apart |
| R-MINT-5, R-MINT-7 | One shared observation of the canonical repository | One watch row per fork; at most one fork observed per alarm, earliest due first | Each fork is its own repository with its own listing |
| R-MINT-7 | A known ID's keyed record is the ledger row, `job_tokens` or `artroom_land_token` | The ledger row (indexed by token ID); a lease token is keyed by `artroom_ws.token_id`, a workspace's owed revocation by `artroom_ws_duty.token_id` | The two workspace indexes make those point lookups |
| R-MINT-7 | Not scheduled while the canonical repository is gone | Scheduled and run while it is gone | Forks are not the canonical repository |
| Migrations | Lane C's indexes are Room migration 3 | No Room migration. The ledger's tables and indexes, and the two workspace indexes, are made by their owners' constructors (`CREATE … IF NOT EXISTS`), which run at every object start, so a stored room gains them at its first start after this change (F17) | These tables are the Git package's, not the Room schema's, as `artroom_mint` is. No legacy rows exist: the old code kept no record of fork tokens, so nothing needs to be moved |

The exposure bound (R-MINT-6) is the same: an unknown or late-applied fork read token lasts at most its 600 s lifetime from when Artifacts applies it (open point 44). No lifetime changes.

### Choices for the checker

1. **The retry stays, as new records.** The request asked to remove the hidden retry; R-MINT-2 allows a retry as a new request with its own record, and the canonical half of the same pin retries that way. Removing every retry would make a transient `INTERNAL_ERROR` fail the proposal (the design rejected that for canonical sites). Each retry leaves its unknown predecessor kept and watched.
2. **The step runs while the canonical repository is gone** (table above).
3. **The pause covers `sent` creates too**, not only `unknown` ones: a create still out may already have applied, and its token has no recorded ID until the answer comes. This is stricter than the checker's wording, never looser.
4. **The owner's two indexes** are on existing workspace tables, made in the constructor. Building them over a stored room's `artroom_ws_duty` (which keeps settled rows) is a one-time cost at the first start.
5. **A record left `sent` because the host stopped between the record and the send** becomes `unknown` at the next start, though nothing was sent. The ledger cannot tell it from one sent, so it keeps it, as the canonical ledger does.
6. **C2 is applied to the canonical `MintLedger` as well.** R-MINT-3 is the canonical rule, so once it is amended the canonical ledger must keep it: its failed handoff now writes the known ID as owed, with the same bounded writes, before the revocation at once. Its test (6) is restated and a second added.

### Tests: rule map

Node: `packages/git/test/fork-tokens.test.ts`, 34 tests (F1 to F28), against a fork double whose create can apply and then throw, lose its answer, hold its answer, answer late or refuse, and whose revocations can fail or be held; F15 to F18 and F20 go through the real owner, `Workspaces`. Room: `packages/room/test/workerd/fork-token-02836f9a.test.ts`, 8 tests (R1 to R8), real Room objects with Durable Object storage and stored alarms, alarms run only through `runDurableObjectAlarm`, hooks on one object or one world's fake repositories, and in R6 a write spy on that object's SQL only. Without this lane the Node file does not load and every Room test fails (there is no `workspaces.forkTokens`).

| Condition or rule | Tests |
|---|---|
| Recorded durably before its create; a wake-up stored first (R-MINT-2) | F1, F2, F3, F18, R5 |
| Owned by the fork's own ledger, not the canonical one | F15, F16, F17, F20, R1, the source scan |
| No hidden non-idempotent retry; a retry is a new record (R-MINT-2) | F4, F5 (two), F6 |
| Lost answer (R-MINT-3, R-MINT-5) | F4, R1, R6 |
| Late apply (R-MINT-3, R-MINT-5, R-MINT-6) | F7 (late ID, late refusal, late loss; applied after a restart), R4 |
| Failed revoke: owed by ID, bounded and backed-off retry, a late success not taken as success (R-MINT-4) | F9 (three), F12, F22, R2, R7 |
| Restart between any two steps (R-MINT-4, R-MINT-7) | F10 (after the record, after the wake-up, while the answer is out, while held, while owed, during a revocation), F7, F15, F21, R3, R4 |
| Never settled by time or inventory; never revokes an unattributed token (R-MINT-5) | F4, F7, F8, F13, R1, R4 |
| Answers that cannot be used (R-MINT-3) | F8 |
| A failed handoff: the known ID written durably before any revocation, bounded writes (R-MINT-3 as amended; C2) | F21, F23, F25, F27; canonical: `mints.test.ts` (6), two tests |
| Wake-ups, takeover, overdue step (R-MINT-7) | F10, F11, F12, R1, R3, R4, R7 |
| Bounded, indexed, earliest-first work; one write per observation; idle writes nothing (R-MINT-7) | F12, F13, F17, F19, F22, R6 |
| Provenance; the owner's known tokens and sweep | F15, F16, F20 |
| The fork's sweep paused while a create is unsettled; no time resumes it; it resumes after the record's own answer (C1) | F24 |
| The sweep asks again before each revocation (C3) | F26 |
| The clock allowance on the lifetime bound (C4) | F28 (67 ms, 5,000 ms accepted; 5,001 ms owed), R8 (both halves of `pinObjects` 67 ms ahead, propose admitted) |
| Safe metadata at the sinks | F9, R2 |
| Duties pageable, without token text (R-MINT-5) | F14 |

### The merge with main 58a2f0a0

Main `58a2f0a0` (request `8bd623cc`, row-write measurements, after the orphan retirement record `d3f7d3a8`) changed `nextAlarm()` in `packages/room/src/core.ts`: one bounded existence check for pins on the default path, and one delayed-pin due read, passed into `loopPendingKinds`, when `PIN_DELAY_MS` is set. The merge was textually clean (merge `31ec8a77`; `git diff --check origin/main` is clean). In the merged `nextAlarm()`, the fork token ledger is its own term of the same earliest-first minimum, beside the delayed pin, the mint ledger, the error upgrade, the job-token pass and the check jobs.

The composed scheduler is tested in `packages/room/test/workerd/pin-delay.test.ts`, "set, composed with mint lane F (request 02836f9a) …", beside main's lane C composition test. With each ledger's due time set directly: the fork token ledger wins when it is earliest; each of the other five wins when earlier than it; its own `forkTokens` backoff holds it, and only it (the pins', mint ledger's and job-token pass's backoffs do not); and the repository-gone fence (`canonical_gone`) holds the pin, the mint ledger and the job-token pass but not the fork token ledger, whose own backoff still holds it while the repository is gone. So two things hold the fork token ledger's candidate back: its own backoff after a failure of its step, and a room not yet founded (`nextAlarm()` reads no workspaces then; before founding the Room schedules `unfoundedDue()` instead). Mutants K1 to K5 were run again against both Room files, with K6 and K7 added (below).

### Review findings C1 to C4 on 3d1223a1

The checker's preliminary findings on `3d1223a1`, with its controls in `checker-fork-controls.test.ts`. All three controls failed on `3d1223a1` as reported, and pass on the fixed code (run against `9209c8c8`; C1's and C3's interleavings are now F24 and F26, below). Each fix has committed tests and named mutants.

- **C1. The fork's sweep revoked a lost-answer token.** A pin's create whose answer is lost leaves an `unknown` record with no ID; `Workspaces.revoke` then swept the fork and revoked that token, which no record attributes. The guidance was corrected twice (planner assert `66f8b350` and its two corrections; the latest supersedes a request-time fence). A create takes only a scope and a lifetime, an inventory cannot identify it by timing, and nothing bounds when it applies (R-MINT-6), so no window, label or elapsed time can settle the question. The rule now: while any fork token create on a fork is `sent` or `unknown`, the sweep revokes only tokens whose IDs a record names (the fork ledger's records, or the workspace's owed token duties, such as an ended lease's token) and leaves every other active token, for as long as the record stays unsettled. The record settles only by its own create's answer (a late answer, as before) or a documented provider fence; never by time or inventory. **R-WS-3's cleanup of unrecorded tokens is suspended on such a fork, not inferred around.** R-WS-3's purpose, that an ended lease's access ends, still holds: the lease's own token is recorded by ID (`artroom_ws.token_id`, then an owed token duty) and is revoked through the pause. What the pause leaves are tokens no record names: their exposure is bounded only by each token's own lifetime, from when Artifacts applied it (R-MINT-6). When the record is settled, the fork's next sweep (the next lease end or provisioning) revokes the unrecorded tokens still active. F24: the pause, no time-based resume two hours later, the late answer, and the resumed sweep. Mutants N1 (no pause), N1t (a time-based resume), N7 (the pause revokes nothing, not even named tokens).
- **C2. A known ID was lost when its write failed.** One write failure recording `held`, then a failed revocation at once, left the record `sent` and so `unknown` after a restart, with the token live. Now the ID is written durably as owed, with at most 3 bounded writes (`MINT_ID_WRITE_ATTEMPTS`), before any revocation; then the revocation at once; a failure leaves the record owed with its ID for the alarm. R-MINT-3 in `docs/protocol.md` is amended, extending request `df6ff8d3`'s landed text: once an ID is received it is written durably before any revocation is attempted, a failed write is retried with the ID in hand, the retries are bounded, and if storage refuses every one the Room cannot guarantee that the duty survives and the record's earlier state governs; the earlier failed-write clause now applies only before an ID is known. The canonical `MintLedger` follows the same rule (choice 6). F21 now asserts the ID is kept; F23 (the write retried), F25 (the checker's control), F27 (a host stop while the revocation is out); canonical `mints.test.ts` (6) restated and one added. Mutants N4, N5 (fork), M1, M2 (canonical), L27.
- **C3. The sweep revoked a pin's token that became held while it waited.** The sweep took its keep set once, at the listing. It now asks about each token immediately before its revocation, after every earlier await. With C1's pause, the checker's own control no longer reaches its interleaving (the pause leaves its unrecorded write token), so F26 reproduces it with a token the ledger names: the sweep waits on revoking that token, the pin's answer arrives, and the pin's token, now held, is kept. Mutant N2 (the decisions taken once at the listing) survives alone, by causality: an unrecorded token that could become held belongs to a create that was already open at the listing, so the pause already left it; with the pause removed too (N12), F24 and F26 are red. The recheck is kept as the standing rule (cancellation checked after every await, before every send), not as the only guard.
- **C4. The fork check repeated the exact upper bound.** Artifacts stamps expiries up to 67 ms ahead of the Room's clock (request `df6ff8d3`), so the fork half of `pinObjects` refused a valid token. `ForkTokens.classify` now allows `MINT_CLOCK_ALLOWANCE_MS` on the lifetime bound, as R-MINT-3 says; a fork token has no absolute deadline, so there is no `notAfter` to keep. The canonical ledger's allowance and its deadline protection are request `df6ff8d3`'s, merged here. F28 (67 ms and 5,000 ms accepted, 5,001 ms owed and never returned), R8 (a real Room: both halves 67 ms ahead, the propose admitted with its head pinned, neither ledger left with a record). Mutants CK1 (fork allowance dropped), CK2 (canonical allowance dropped), CK3 (allowance applied to the canonical deadline). Request `df6ff8d3`'s own Room control for an expiry a minute past the bound (`live-propose-df6ff8d3.test.ts`) assumed the canonical half was refused; with this lane the fork's read token is minted first, with the same check, so it is that token which is refused and owed in the fork ledger, and the canonical create is never sent. The control is reconciled to that, keeping its meaning (commit `5d9926cf`).

### Mutation table

Each mutant was applied alone by a script (`mutants.py` in the scratch directory) to the committed tree; the named suites were run (N: `fork-tokens.test.ts`; R: the lane's Room file; P: `pin-delay.test.ts`; S: the source scan; M: the canonical `mints.test.ts`), and each file was restored from its committed text. The script stops if the tree is not clean after a mutant. The run recorded here is at `f2421024`; the code and the suites it ran are the same at this revision's head, which changed only request `df6ff8d3`'s Room control, outside those suites: 59 mutants, 58 red. N2 survives alone, as explained under C3; N12 (N2 with the pause also removed) is red. Every test in both new files is red under at least one mutant.

History. A first run at `adceb503` (44 mutants) left L30 alive; F22 was extended for it. After the merge with main `58a2f0a0`, K1 to K5 were run again with P, and K6 and K7 added. For C1 to C4, N1 to N7, M1, M2 and CK1 to CK3 were added. One run during this revision is discarded: its two-edit mutant N12 saved a half-mutated file as the original and left N1 in the worktree, so the mutants after it ran on a wrong tree. The worktree was restored from the commit, the script fixed (each file saved once, before any edit; the run stops on a dirty tree), and every mutant run again; the commit itself was never affected.

| Mutant | File | Mutation | Suites | Red tests |
|---|---|---|---|---|
| L1 | `fork-tokens.ts` | no wake-up stored before the send | N, R | F1, F2, F10, F18, R5 |
| L2 | `fork-tokens.ts` | a failed wake-up still sends | N, R | F2, F18, R5 |
| L3 | `fork-tokens.ts` | the hidden retry back: the create retried under one record | N, R | F5 |
| L4 | `fork-tokens.ts` | any failure retried, not only a transient one | N, R | F4, F13, F14, F19, F20, R1, R6 |
| L5 | `fork-tokens.ts` | an unknown record settled by time (its lifetime) | N, R | F4, F7, R1, R4 |
| L6 | `fork-tokens.ts` | an unknown record settled by a clean inventory | N, R | F4, F7, R1, R4 |
| L7 | `fork-tokens.ts` | the observation revokes tokens no record names (a sweep) | N, R | F7, F8, F10, F20, R4 |
| L8 | `fork-tokens.ts` | a late answer's ID left unknown | N, R | F7, F13, F24 |
| L9 | `fork-tokens.ts` | a late refusal leaves the record unknown | N, R | F7, F13 |
| L10 | `fork-tokens.ts` | a failed revocation dropped (the record deleted) | N, R | F9, F10, F11, F12, F14, F22, F26, R2, R7 |
| L11 | `fork-tokens.ts` | a revocation with no answer in time taken as answered | N, R | F9 |
| L12 | `fork-tokens.ts` | no backoff growth after a failed revocation | N, R | F9 |
| L13 | `fork-tokens.ts` | settlement at an unreadable expiry | N, R | F8, F9 |
| L14 | `fork-tokens.ts` | no takeover at a host's start | N, R | F7, F10, F15, F24, R3, R4 |
| L15 | `fork-tokens.ts` | the takeover time left out of nextDue | N, R | F11 |
| L16 | `fork-tokens.ts` | the takeover time not moved ahead by a live alarm | N, R | F11 |
| L17 | `fork-tokens.ts` | overdue work returned as is (no 1 s step) | N, R | F10, F11, F12, R1, R3, R4, R7 |
| L18 | `fork-tokens.ts` | an overdue step under 1 s | N, R | F10, F11, F12, R1, R3, R4, R7 |
| L19 | `fork-tokens.ts` | a pass ordered by row ID, not due time | N, R | F12 |
| L20 | `fork-tokens.ts` | an unbounded pass (1,000 a pass) | N, R | F12 |
| L21 | `fork-tokens.ts` | the pass awaited by the alarm's work | N, R | F12 |
| L22 | `fork-tokens.ts` | owed records eligible while a pass waits on an answer | N, R | F12 |
| L23 | `fork-tokens.ts` | observations not earliest due first | N, R | F13 |
| L24 | `fork-tokens.ts` | an observation written to each record | N, R | F13 |
| L25 | `fork-tokens.ts` | a new unknown record brings the observation sooner than 1 min after the last | N, R | F13 |
| L26 | `fork-tokens.ts` | a fork with no unknown records still observed | N, R | F13 |
| L27 | `fork-tokens.ts` | a failed handoff: the token not revoked at once | N, R | F21, F23, F25, F27 |
| L28 | `fork-tokens.ts` | no expiry check after the fork lookup, before the revocation | N, R | F22 |
| L29 | `fork-tokens.ts` | no expiry check before each later revocation | N, R | F22 |
| L30 | `fork-tokens.ts` | settlement at expiry looks the fork up first (no settle-only pass) | N, R | F22 |
| L31 | `fork-tokens.ts` | the fork lookup not bounded | N, R | F3 |
| L32 | `fork-tokens.ts` | the create not bounded | N, R | F7, F13 |
| L33 | `fork-tokens.ts` | a failed revocation stores the provider's text | N, R | F9, R2 |
| L34 | `fork-tokens.ts` | a refusal that changed nothing kept as unknown | N, R | F6, F7, F13 |
| O1 | `workspaces.ts` | the owner: provenance not checked before a request to the fork | N, R | F15 |
| O3 | `workspaces.ts` | the owner: its known token lookups dropped | N, R | F20 |
| O4 | `workspaces.ts` | the owner: its token indexes not made | N, R | F17 |
| O5 | `workspaces.ts` | the owner: with no wake-up store, the fork token is still sent | N, R | F18 |
| N1 | `workspaces.ts` | C1: no pause: while a create on the fork is unsettled, the sweep still revokes tokens no record names | N, R | F24 |
| N1t | `fork-tokens.ts` | C1: a time-based resume (the pause ends once the lifetime plus the allowance has passed since the send) | N, R | F24 |
| N7 | `workspaces.ts` | C1: while paused, the sweep revokes nothing, not even tokens a record names | N, R | F26 |
| N2 | `workspaces.ts` | C3: the sweep's keep decisions taken once at the listing, not asked again before each revocation | N, R | **survived** (see C3) |
| N12 | `workspaces.ts` | C3 with the pause also removed: N1 and N2 at once | N, R | F24, F26 |
| N3 | `workspaces.ts` | the sweep does not keep a token the ledger holds for a pin in progress | N, R | F16, F26 |
| N4 | `fork-tokens.ts` | C2 (fork): the known ID not written before the revocation at once | N, R | F21, F23, F25, F27 |
| N5 | `fork-tokens.ts` | C2 (fork): the ID's write not retried (one attempt) | N, R | F23 |
| M1 | `mints.ts` | C2 (canonical): the known ID not written before the revocation at once | M, R | mints (6) |
| M2 | `mints.ts` | C2 (canonical): the ID's write not retried (one attempt) | M, R | mints (6) |
| CK1 | `fork-tokens.ts` | C4: the clock allowance dropped from the fork token's upper bound | N, R | F28, R8 |
| CK2 | `mints.ts` | C4 (canonical half): the clock allowance dropped from the canonical token's upper bound | M, R | R8, mints (4) |
| CK3 | `mints.ts` | C4 (canonical half): the clock allowance applied to the absolute deadline (notAfter) too | M, R | mints (4) |
| C1 | `client.ts` | pinObjects mints the fork token directly, outside the ledger (as before) | S, R | R1, R2, R3, R4, R5, R6, R8, source scan (3) |
| K1 | `core.ts` | the Room: the forkTokens step does nothing | R, P | R1, R2, R3, R4, R6, R7 |
| K2 | `core.ts` | the Room: nextAlarm leaves out the fork ledger | R, P | R1, R7, P (composed with mint lane F) |
| K3 | `core.ts` | the Room: the step ignores its fence | R, P | R7 |
| K4 | `core.ts` | the Room: nextAlarm ignores the fence | R, P | R7, P (composed with mint lane F) |
| K6 | `core.ts` | the Room: the fork ledger's candidate fenced while the canonical repository is gone | R, P | P (composed with mint lane F) |
| K7 | `core.ts` | the Room: the fork ledger's candidate takes another kind's backoff (the mint ledger's) | R, P | R7, P (composed with mint lane F) |
| K5 | `core.ts` | the Room: the fork ledger's kind not self-timed | R, P | R7 |

### Gates

Run serially under bash at `5d9926cf` (the code head of this revision; this head differs from it only in this file), by `gates.sh` in the scratch directory, each exit code recorded. The same gates run again at this head; their exit codes are in the delivery report. Earlier revisions passed the same gates at `873b5044` and `ab936154`.

| Gate | Exit | Tests |
|---|---|---|
| `npm ci` | 0 | |
| `npm run typecheck` (root) | 0 | |
| `npm test` (root) | 0 | every workspace's `test` |
| `npm run typecheck -w @generalbusiness/artroom-git` | 0 | |
| `npm test -w @generalbusiness/artroom-git` (Node) | 0 | 340 passed, 0 failed (the 34 of `fork-tokens.test.ts` and the restated canonical (6) tests among them) |
| `npm run test:workers -w @generalbusiness/artroom-git` | 0 | 11 passed |
| `npm run typecheck -w @generalbusiness/artroom-room` | 0 | |
| `npm run test:node -w @generalbusiness/artroom-room` | 0 | 237 passed (17 files) |
| `npm run test:workerd -w @generalbusiness/artroom-room` | 0 | 540 passed (42 files; the 8 of `fork-token-02836f9a.test.ts`, the composed `pin-delay.test.ts` test and request `df6ff8d3`'s controls among them) |
| `npm exec -w @generalbusiness/artroom-room -- wrangler deploy --dry-run` | 0 | bundles only; nothing uploaded |
| The Git harness: `tsc` with a scratch tsconfig over `src` and `measure/harness/worker.ts` | 0 | |
| The Git harness: `wrangler deploy --dry-run -c measure/harness/wrangler.jsonc` | 0 | bundles only; nothing uploaded |
| `git diff --check origin/main` | 0 | |

The tree was clean before and after the gates.

### Not changed here

- The fork's sweep rule (R-WS-3, plans 001 and 002), apart from asking before each revocation, keeping held pin tokens, and the pause while a fork token create is unsettled (C1, C3). R-WS-3's text is not amended; the pause is recorded here and in `fork-tokens.ts` and `workspaces.ts`. If the checker wants it in R-WS-3, that is a contract change for its own request.
- The protocol text, apart from R-MINT-3's amendment for C2. Section 32 stays about canonical mints; this section records the analogy. If the checker wants R-MINT-1 to name the fork ledger, that is a contract change for its own request.
- The lease token mint in `workspaces.ts`, and snapshot repository tokens.
- Showing the fork ledger's records to admins: `forkTokens.duties()` pages them, as `mints.duties()` does, for the cleanup projection request (`8d249233`).

## Declared acts stage 2 (request fd6f00b6)

Status on 2026-10-04: approved. Review `9cb05da9` approved the head `39430e23` (ratified `93974c40`), after the repairs described under "State at the integration head". An earlier approval, `25bede37`, was withdrawn. All of it is on the integration branch `request/test-overhead`; nothing has landed on main. The line below is the earlier status, kept as history.

Earlier status: implemented, pending review. Gitseq request `fd6f00b6` (planner to builder), stage 2 of 7 in section 8.5 of [notes/2026-10-02-declared-acts.md](../notes/2026-10-02-declared-acts.md), under [docs/protocol.md](../docs/protocol.md) section 33 (stage 1, landed at `815e3383`) and the planner's clarification, assert `869d9aad`. Branch `request/decl-stage2`, cut from main `815e3383` and merged with main `a04c774b` (mint lane F). The head for review is the commit that carries this section. Nothing was pushed or deployed, and no Cloudflare credential was used.

The Room now admits acts from its active document's vocabulary. Under a `v1` document that is the legacy vocabulary, on the code path it had. Under a `v2` document it is the document's declarations. The code-review declarations ship as data, and a room adopts them only by activating a `v2` document (R-DECL-1); a room with no policy file still gets the R-POL-7 default, which is `v1`.

### State at the integration head (written after the rest of this section)

Stage 2 is now reviewed on `request/test-overhead`, the one integration branch for stages 2, 3 and 5 and the MCP core (assert `dae9a1f3`). The branch `request/decl-stage2` stays at `35797f84` and receives no more commits. Read this subsection first. Below it, "The two runs", "Mutation table" and the test names in "Conditions" describe a test layout that request `ecbc722a` replaced; the rest stands.

**Source.** Stage 2 changed 21 source files and `docs/protocol.md`. Sixteen are byte-identical on the integration branch to `35797f84`:

- `packages/room/src/`: `admission.ts`, `authority.ts`, `core.ts`, `declared.ts`, `jobs.ts`, `ports.ts`, `roster.ts`, `schema.ts`, `store.ts`;
- `packages/policy/src/`: `acts.ts`, `validate.ts`, `vocabulary.ts`;
- `packages/checkers/src/`: `checker.ts`, `job.ts`;
- `packages/contract/src/`: `errors.ts`, `roster.ts`.

Five carry later edits by stage 5 and the MCP core, reviewed under those requests: `packages/room/src/model.ts`, `reads.ts` and `requests.ts`, `packages/contract/src/lanes.ts`, and `packages/policy/src/index.ts`. The two `packages/log` lists this section says stage 3 owns are delivered by stage 3 on the same branch, so `artroom verify` reads a `v2` room's log here, and the Room test that publishes and verifies a `v2` session runs.

**Conditions.**

| Condition of request `fd6f00b6` | State |
|---|---|
| (1) one source of kinds; dispatch by step; wording; the two new refusals; exact retry | Delivered. Witnesses in the map |
| (2) the lease rule, with storage, renewal and restart | Delivered. "the lease rule" |
| (3) the whole suite under both vocabularies, every conversion listed | Superseded by `ecbc722a`: the declared witness set (32 tests under `v2`) and the direct tests of what `v2` changes. Not claimed as met |
| (4) a mutation of each declaration field and each new guard | Superseded by `ecbc722a`, not met. The run stopped at 199 of 594 mutants and is kept as partial. Each repaired defect keeps one witness |
| (5) row writes | The local comparison is a test ("the same session ..."). The live measurement is its own request, `92ddf4cc`, still owed |
| (6) migration 4 from every stored version | Delivered, from versions 1, 2 and 3 |
| (7) gates, report, one exact head | The gate of [docs/testing.md](../docs/testing.md), once, at the head sent |

**Acceptance cases of section 33.5, stage 2.** Each witness is a test in [packages/room/test/workerd/declared-fd6f00b6.test.ts](../packages/room/test/workerd/declared-fd6f00b6.test.ts), named by the start of its title, unless another file is given.

| Case | Witness |
|---|---|
| Same-shape change | "a change of an act's targets or of its scope source ..." |
| Hold change: lease length; scope source | "an act signed before its meaning changed ..."; "a change of an act's targets or of its scope source ..." |
| Unrelated update | "an act signed before its meaning changed ..." |
| Exact retry | the same test, and "across a change of shape ..." |
| Grants: signed before a change of its kind | "a grant is judged when it is admitted ...", its last part |
| Grants: a map expanded before a kind was added | `declared-stage5-a5d64b35.test.ts`: "the client expands a grant before it is signed ..." |
| Grants: exact retry of an admitted grant | "a grant covers a declared kind only by its map ..." |
| Grants: an invitation redeemed after a change | "a session's map is judged when its invitation is admitted ..." |
| Grants from before declared acts: `*`; limited to `review` and `check` | "a grant never gains a kind across a change of vocabulary ..." |
| Take-over with a new scope, both parts | "take-over with a new scope ..." |
| Retired opening kind | "a retired opening kind ..." |
| Legacy suite; code-review suite | Superseded: see condition (3) |

Seven of these parts were missing or weakened after the test reduction and are restored (see the known gaps of the Room in [test-invariants.md](test-invariants.md)).

**Defects found in review.** Review found 36 defects in stage 2 before this branch. Each is repaired and has one witness, listed by number in [test-invariants.md](test-invariants.md), "The 36 repaired defects of declared acts stage 2".

**Still owed, outside this review.** A `v1` document too large for one stored row, and a storage failure while preparing a landing (`6d4b227c`). A bearer session's exact retry after its grantor's key is retired (`5d41ea36`). The full check-job lifecycle of R-DECL-18, which stage 4 owns (`48c021ea`, assert `fcbdf07e`). The live row-write measurement (`92ddf4cc`).

### What packages/log keeps, and why

Condition 1 names five hard-coded kind lists. Three are replaced here: `room/src/schema.ts`, `room/src/roster.ts` and `policy/src/validate.ts` now read the legacy kinds from the frozen description `ARTROOM_LEGACY_V1`, through `packages/policy/src/vocabulary.ts`. The other two, `log/src/decode.ts` and `log/src/roster.ts`, are delivered by stage 3 (request `1e8fee4b`), which owns all of `packages/log` under assert `869d9aad`. An earlier commit on this branch swapped those two lists for imports; commit `2cd97b88` removed that, and this head's `packages/log` is byte-identical to main's.

Two things follow until stage 3 lands, and both are stated here rather than hidden:

- `artroom verify` cannot read a `v2` room's log. Seven existing Room tests assert that verify accepts a published log. They pass in the legacy run. The declared run leaves them out by title (`NEEDS_STAGE_3_VERIFY` in [packages/room/vitest.workers.declared.config.ts](../packages/room/vitest.workers.declared.config.ts)). Stage 3's head, built on this one, must turn them on.
- So the code-review suite criterion of section 33.6 is met here for 533 tests and is open for those seven.

### What was built

- **One source of kinds.** `packages/policy/src/vocabulary.ts`: the legacy kinds, role table, delegable kinds and roster ops read from `ARTROOM_LEGACY_V1`; the platform kinds `renew`, `roster` and `recover`; and, for either kind of document, `kindsOf`, `shapeOf`, `stepsOf`, `roleMaySign`, `delegableBy`, `declarationOf` and `isDeclared`. `codeReviewPolicy(base)` gives a `v2` document with the base document's fields and `CODE_REVIEW_ACTS`.
- **Step 1 by vocabulary** (`room/src/schema.ts`). In a `v1` room: the legacy kinds and `v: 1` only, as before. In a `v2` room: any kind of the grammar, `v: 2` with a binding for a declared kind, `v: 1` for a platform kind. Admission judges step 1 again under the document it decides with, since an activation may land between receipt and decision.
- **Step 4, who may sign** (`room/src/authority.ts`). A declared kind is judged by `who.roles`, with `admin` implicit (R-DECL-11). A delegation covers a declared kind only through its signed map, and only for the binding its grantor signed (R-DECL-17). `renew` and `roster` keep the legacy table.
- **Step 4a** (`room/src/admission.ts`). After authority and before the body check: an undeclared kind is `kind-undeclared`; an envelope that is not `v: 2` with the active declaration's binding is `binding-stale`, naming the current binding and policy version. Neither is recorded. Idempotency runs before it, so an exact retry of an accepted act gets its original receipt (R-DECL-16).
- **Step 5, bodies.** A declared act's body is closed against its declared fields, its steps' fields and `because` (R-DECL-12). `recover` and the `v2` grant shapes are the platform's.
- **Steps 7 to 10 by step.** `decide` dispatches by step, not by kind: the legacy kinds, the declared kinds and `recover` ops run the same handlers. `renew` and `roster` keep their own.
- **Threads** (R-DECL-6, R-DECL-8, R-DECL-23). A thread records its kind, the opening act's binding and its lease length. An act on a thread whose kind its `threads` does not name is refused `wrong-thread`, recorded at step 7. A configuration-recovery thread takes only `recover` ops, and `recover` acts only on one.
- **The lease rule** (R-DECL-6, R-DECL-9, R-DECL-15). In a `v2` room a thread records its numeric lease when it opens: the hold's `leaseSeconds`, or the room's lease at that moment. Renewal, take-over and expiry use the recorded value. A thread opened under the legacy vocabulary records none and keeps the room's current lease, as today.
- **`recover`** (R-DECL-21). The platform kind, with ops `open`, `take`, `version`, `approve`, `land`, `release` and `note`, each running its step with the legacy recovery rules. A legacy recovery lane still open at the first `v2` activation takes `recover` ops.
- **Grants** (R-DECL-17). In a `v2` room a `delegate` op and a room-custody session name platform kinds plainly and declared kinds in a signed map from kind to binding, never `*`. The map is judged when the grant is admitted, and again at each act. Grants from before declared acts cover no declared kind.
- **Refusal wording** (R-DECL-13). A platform refusal of a declared act takes the declaration's `reason` and `fix` for its code, with slots filled from facts the room already reports. The code is the room's. A rule's refusal keeps its own wording.
- **Validation at propose time** (R-DECL-24). A `v2` document is validated by the acts validator with the room's historical opening kinds and its `artroom-checker-v2` configurations.
- **Migration 4** (`room/src/store.ts`). Columns `lanes.kind`, `lanes.binding`, `lanes.lease_ms` and `delegations.acts`. Every stored lane gets its kind: `room` for a revert lane, `claim` otherwise.
- **Contract.** `Refusal.current` gains `binding` and `policy`, for `binding-stale`. The stored delegation type gains its optional map.

### Choices where the design left room

1. **A document this Room cannot run yet does not activate.** The stage 1 validator accepts steps and hold settings that stage 4 builds: two steps in one act, `hand-over`, a comment on target `none`, a scope template, `hold.conflict`, `hold.reserveSeconds`, and a hold without a workspace. `stagedProblems` (`room/src/declared.ts`) refuses each as `policy-invalid` at propose time, naming the act. Stage 4 removes these guards as it builds each primitive.
2. **A grant for another meaning is `delegation-invalid` at step 4**, not `binding-stale` at step 4a. Authority is judged first, and a delegation that names another binding does not cover the act. The grant's own admission, and an invitation's redemption, are `binding-stale`, as section 33.5 states.
3. **Bearer acts carry the code-review binding by default.** The named MCP tools were each built for one code-review declaration. A bearer act that names no binding is given that declaration's binding under the room's steps version and `lanes`. A room whose declaration differs refuses it `binding-stale`. The room never gives an act the meaning of its own declaration on the caller's behalf. A bearer act may name its binding, which is then used as given.
4. **An invitation without a `v2` session grants no declared kind.** That holds for one from before declared acts and for a new one with no session. It grants only the delegable platform kinds of what it covered. Its session map, when it has one, is judged at the invitation's admission and again at redemption.
5. **A record's `kind` is the act's own kind.** A `recover` record also carries its `op`.
6. **Thread kinds.** A thread a `recover` open creates has kind `recover`. Lanes stored before migration 4 get kind `claim`, a legacy recovery lane included, since a `claim` opened it. The historical opening kinds given to the validator leave out `room` and `recover`.
7. **A revert thread opened under a `v2` document records the room's lease**, since it has no opening declaration. Under a `v1` document it records none.
8. **A workspace request** is judged as for an act with step `version` on the thread: `propose` under the legacy vocabulary, `recover` on a recovery thread, and otherwise a declared act with step `version` whose `threads` names the thread's kind.
9. **Optional declared fields.** `goal`, `summary` and `text` may be absent where a declaration makes them optional. The stored columns then hold an empty string.

### What a `v2` room cannot do yet

No deployed room should activate a `v2` document before the later stages land:

- The client, CLI and the checker service still sign `v: 1` envelopes (stages 4 and 5). A `v2` room refuses them `binding-stale`.
- Check jobs do not carry their act's binding (R-DECL-18, stage 4).
- `artroom verify` does not read `v: 2` envelopes or `v2` documents (stage 3).

### Conditions

| Condition | Where | Tests |
|---|---|---|
| (1) one source of kinds; dispatch by step; wording; `kind-undeclared`, `binding-stale`; exact retry | `policy/src/vocabulary.ts`; `room/src/{schema,roster,authority,admission,declared}.ts`; the two log lists are stage 3's (above) | `policy/test/vocabulary.test.ts`; `room/test/node/declared-equivalence.test.ts`; `declared-fd6f00b6.test.ts`: the first four `describe` blocks, the wording test, the exact-retry test |
| (2) the lease rule, with storage, renewal and restart | `admission.ts` (`claimNew`, `leaseMsOf`, `renewLease`), `core.ts` (revert threads), `store.ts` | `declared-fd6f00b6.test.ts`: the four lease tests; the migration tests |
| (3) no behaviour change for the code-review application | the legacy run and the declared run | see "The two runs" |
| (4) a mutation of each declaration field and each new guard | | see "Mutation table" |
| (5) row writes | | see "Row writes" |
| (6) migration 4, upgrade-tested from every stored version | `store.ts` (`declaredColumns`, `ROOM_MIGRATIONS`) | `declared-fd6f00b6.test.ts`: a room stored at version 1, 2 and 3, reopened; run twice on one store |
| (7) gates, report, one exact head | | see "Gates" |

The stage 2 acceptance cases of section 33.5, each with its test in [packages/room/test/workerd/declared-fd6f00b6.test.ts](../packages/room/test/workerd/declared-fd6f00b6.test.ts):

| Case | Test |
|---|---|
| Same-shape change | "same-shape change: an act signed under [version], submitted after activation of [version, land], is binding-stale and no landing starts" |
| Hold change | "hold change: a claim signed before leaseSeconds or the scope source changed is binding-stale" |
| Unrelated update | "unrelated update: a new kind, a changed refuse rule, a new label or wording leave the binding equal, and the act is admitted" |
| Exact retry | "exact retry: an act accepted before an activation, retried after it, gets its original receipt" |
| Grants, the four parts | "a grant signed for a meaning that changed before its admission is binding-stale; ..."; "the grantor's role and who.delegable bound the map; a grant expanded before a kind was added does not cover it"; "an exact retry of an admitted grant after a meaning change gets its receipt; acts under it are then delegation-invalid"; "an invitation signed before a meaning change and redeemed after it is binding-stale; the invitation stays unused" |
| Grants from before declared acts | "grants from before declared acts: after the first v2 activation a v1-era * delegation covers renew and no declared kind; one limited to review and check covers nothing"; "an invitation from before declared acts, redeemed after the first v2 activation, grants only the delegable platform kinds its session covered ..." |
| Take-over with a new scope | "take-over with a new scope: ..." |
| Retired opening kind | "a retired opening kind: ..." |
| Legacy suite; code-review suite | the two runs, below |

### The two runs

`npm test` in `packages/room` now runs the workerd suite twice.

**The legacy run** (`vitest.workers.config.ts`) is the existing suite against the legacy vocabulary. It passes: 580 tests. These are the only edits to existing test files:

- **The stored schema version is 4, not 3.** Condition 6 gives this stage migration 4, so the tests that pin the latest version change with it. This is not one of the four conversions; it is listed here so the checker can judge it. `founding-gaps.test.ts`: two assertions, in "request d29c09fa: the error upgrade drains in an unfounded room ...". `mint-sites-5ff58c9a.test.ts`: five assertions, in "mint lane C: the due indexes reach a room stored before them (review 993dce7a)". `safe-errors-d29c09fa.test.ts`: two assertions and one comment.
- **Three expected values pass through a harness function** that returns its argument unchanged in the legacy run. `amendment2.test.ts`, "edit 9: policy-activated names the checkers": two configuration digests through `configDigest`. `amendment3.test.ts`, "R-EXEC-8 to R-EXEC-10": one configuration digest through `configDigest`. `review-8faa2ef9.test.ts`, "'*' is fixed at the grant": a delegation's kinds through `coveredKinds`.
- **`support.ts`** builds envelopes, policy files and checker files through the harness (`vocabulary.ts`), which changes nothing in the legacy run.

**The declared run** (`vitest.workers.declared.config.ts`) is the same suite against the code-review `v2` declarations. Every room's document is the test's own document as `v2` with `CODE_REVIEW_ACTS`. The harness applies the four conversions of section 33.6 and no others, and logs each one per test as it applies it. It passes 533 tests and does not run 47.

| Conversion | Tests | Files |
|---|---|---|
| 1. Bindings on envelopes of declared kinds | 383 | 34 |
| 2. Recovery tests as `recover` ops | 4 | 1 |
| 3. Checker configurations as `artroom-checker-v2` naming `"act": "check"` | 127 | 18 |
| 4. Signed grant maps on `delegate` ops and room-custody sessions | 29 | 8 |

Every converted test is listed one by one, with its conversion, in [declared-stage2-conversions.md](declared-stage2-conversions.md). The list is 543 entries, so it has its own file. It is written by a script from the run's own log, and it also lists the 126 tests that needed no conversion and the 47 the declared run does not run.

In the declared run the same three expected values are converted, by the same conversions: the two digest sites name the `artroom-checker-v2` configuration's digest (conversion 3), and `coveredKinds` reads a grant's map kinds, then its plain kinds, which is the legacy expansion's order (conversion 4). No assertion is removed or loosened.

The 47 tests the declared run does not run are the seven verify tests above, and this stage's own 40 workerd tests (`declared-fd6f00b6.test.ts` and `declared-rows-fd6f00b6.test.ts`). Those found their own `v1` and `v2` rooms and sign their own envelopes, stale ones on purpose, which the harness would otherwise sign again.

### Row writes

Condition 5 asks that the measurement harness show no new rows per act on the declared path. The harness, `packages/room/measure/rows.mjs`, reads Cloudflare's billing datasets for the deployed spike, driven by `spike-smoke.mjs`. A declared session there needs the spike to run this code under a `v2` document. That is a deployment of unreviewed admission code, which this request does not authorize, so it was not done.

This stage measures the same quantity locally instead. `declared-rows-fd6f00b6.test.ts` runs one session in a `v1` room and the same session in a `v2` room. It adds SQLite's `rowsWritten` for every statement of the Room object, which is the figure Cloudflare bills: the table row and each index row a write touches. It asserts that the declared path writes no more rows than the legacy path for any act, for admission alone and with the alarm work the act causes. The checker or planner should say whether this meets condition 5, or whether a live reading on the spike is owed after review, with hugh's authorization to deploy.

| Act | Legacy: admission | Declared: admission | Legacy: with its alarm work | Declared: with its alarm work |
|---|---|---|---|---|
| invite (roster) | 9 | 9 | 9 | 9 |
| join (roster) | 13 | 13 | 13 | 13 |
| claim (open) | 9 | 9 | 9 | 9 |
| propose (version), with its pin and preview | 53 | 53 | 55 | 55 |
| note (comment) | 11 | 11 | 11 | 11 |
| review | 10 | 10 | 10 | 10 |
| land, with its landing | 15 | 15 | 81 | 81 |
| claim (open), a second thread | 9 | 9 | 9 | 9 |
| renew | 8 | 8 | 8 | 8 |
| release | 12 | 12 | 12 | 12 |
| claim (take over) | 8 | 8 | 8 | 8 |
| delegate (roster) | 9 | 9 | 9 | 9 |
| configuration-recovery open | 9 | 9 | 9 | 9 |

The counts are equal for every act. Migration 4 adds no index, and its columns are written in the row the act already writes.

### Mutation table

Each mutant was applied alone by a script kept outside the repository (`run.py` beside `mutants.py`). For each one it checks that the text to change occurs exactly once, writes the mutated file, runs four test sets, collects the failing tests from vitest's JSON reports, and writes the file's original bytes back. It never runs `git checkout`, and `git status --porcelain` was empty when it finished. The four sets are: `policy` (node: `vocabulary.test.ts` and `declared-acts.test.ts`); `room-node` (`declared-equivalence.test.ts` and `schema.test.ts`); `room-legacy` (the whole legacy workerd run); `room-declared` (the whole declared workerd run).

54 mutants (`C:`) each change one field of one code-review declaration in `packages/policy/src/codereview.ts`: every label, target, `threads` entry, body field, `who` and `hold` of the seven acts. 82 mutants (`G2:`) each change one guard. 74 of them are the statements marked `// G2:<id>` in `packages/policy/src/vocabulary.ts` and `packages/room/src`. The other eight mutate a marked statement in a second way, or a line beside one: the two legacy lists in `vocabulary.ts`, the checker configurations given to the validator, the lease recorded at open (twice), the entry exemption of the thread check, `recover` naming no thread, and a rule's own wording.

**136 mutants, all red, each by at least one assertion failure.** No red is a timeout. One mutant, `G2:legacy-kinds`, also stops `landing.test.ts` from loading; it has 21 assertion failures besides. Every mutant but one turns red a test in this stage's own test files or in stage 1's `declared-acts.test.ts`. The one, `G2:workspace-recover`, is caught by the four converted recovery tests of the declared run.

Three guards had no test when first mutated, and each now has one in `declared-fd6f00b6.test.ts`:

- `G2:session-grant` and `G2:session-intersection` survived the first full run, at `67735791`.
- `G2:grant-platform` survived the second, at `2cd97b88`. The first run had counted it red, but only because an unrelated concurrency test failed once in that run. That was a false red, so the red tests of every mutant in the final run were checked by file, as above.

The table is the run at `2cd97b88`, with `G2:grant-platform` run again at `b6002634`, where its test was added. The merge of main `a42c4d83` after that adds two notes and no source. The last column names up to two of the red tests, this stage's own first.

| # | Mutant | Mutation | Tests turned red | Named tests |
|---|---|---|---|---|
| 1 | `C:claim.label` | claim's label `Claim` becomes `Claims` | 1 (1 policy) | `vocabulary.test.ts`: the code-review declarations are the note's section 6 (docs/protocol.md section 33.7) every field of every declaration, written out from the tables |
| 2 | `C:claim.targets.none` | claim loses target `none` (`open`) | 519 (8 policy, 3 room-node, 33 room-legacy, 475 room-declared) | `declared-acts.test.ts`: accepted documents (R-DECL-24) the code-review declarations validate, with a checker naming check, and no warnings; `declared-acts.test.ts`: accepted documents (R-DECL-24) rules may name declared kinds and platform kinds; and 517 more |
| 3 | `C:claim.targets.thread` | claim loses target `thread` (`take`) | 517 (8 policy, 2 room-node, 32 room-legacy, 475 room-declared) | `declared-acts.test.ts`: accepted documents (R-DECL-24) the code-review declarations validate, with a checker naming check, and no warnings; `declared-acts.test.ts`: accepted documents (R-DECL-24) rules may name declared kinds and platform kinds; and 515 more |
| 4 | `C:claim.threads.claim` | claim's `threads` is `["room"]` | 12 (2 policy, 4 room-legacy, 6 room-declared) | `declared-acts.test.ts`: the binding identity (R-DECL-15) the subject resolves every default; `vocabulary.test.ts`: the code-review declarations are the note's section 6 (docs/protocol.md section 33.7) every field of every declaration, written out from the tables; and 10 more |
| 5 | `C:claim.threads.room` | claim's `threads` is `["claim"]` | 4 (3 policy, 1 room-legacy) | `declared-acts.test.ts`: the binding identity (R-DECL-15) the subject resolves every default; `declared-acts.test.ts`: the binding identity (R-DECL-15) a step list, body field, scope source, hold setting, threads, kind or steps version changes it; and 2 more |
| 6 | `C:claim.body.goal.type` | claim's `goal` is `globs`, not `text` | 514 (6 policy, 1 room-node, 32 room-legacy, 475 room-declared) | `declared-acts.test.ts`: accepted documents (R-DECL-24) the code-review declarations validate, with a checker naming check, and no warnings; `declared-acts.test.ts`: accepted documents (R-DECL-24) rules may name declared kinds and platform kinds; and 512 more |
| 7 | `C:claim.body.goal.max` | claim's `goal` max is 1023, not 1024 | 3 (2 policy, 1 room-node) | `declared-acts.test.ts`: the binding identity (R-DECL-15) the subject resolves every default; `vocabulary.test.ts`: the code-review declarations are the note's section 6 (docs/protocol.md section 33.7) every field of every declaration, written out from the tables; and 1 more |
| 8 | `C:claim.body.goal.requiredFor` | claim's `goal` loses `requiredFor: ["none"]` | 16 (4 policy, 1 room-node, 5 room-legacy, 6 room-declared) | `declared-acts.test.ts`: refused documents: each guard (R-DECL-24) G:optional-and-requiredfor refuses both optional and requiredFor; `declared-acts.test.ts`: the binding identity (R-DECL-15) the subject resolves every default; and 14 more |
| 9 | `C:claim.body.plan.type` | claim's `plan` is `globs`, not `text` | 3 (2 policy, 1 room-node) | `declared-acts.test.ts`: the binding identity (R-DECL-15) the subject resolves every default; `vocabulary.test.ts`: the code-review declarations are the note's section 6 (docs/protocol.md section 33.7) every field of every declaration, written out from the tables; and 1 more |
| 10 | `C:claim.body.plan.max` | claim's `plan` max is 16383, not 16384 | 3 (2 policy, 1 room-node) | `declared-acts.test.ts`: the binding identity (R-DECL-15) the subject resolves every default; `vocabulary.test.ts`: the code-review declarations are the note's section 6 (docs/protocol.md section 33.7) every field of every declaration, written out from the tables; and 1 more |
| 11 | `C:claim.body.plan.optional` | claim's `plan` is no longer optional | 403 (4 policy, 1 room-node, 21 room-legacy, 377 room-declared) | `declared-acts.test.ts`: the binding identity (R-DECL-15) the subject resolves every default; `declared-acts.test.ts`: the binding identity (R-DECL-15) writing a default out leaves the binding unchanged; and 401 more |
| 12 | `C:claim.who.maintainer` | claim's `who.roles` loses `maintainer` | 6 (2 policy, 2 room-node, 2 room-declared) | `vocabulary.test.ts`: a v2 document's vocabulary is its declarations (R-DECL-11, R-DECL-17) who.roles decides, with admin implicit; renew keeps the legacy table; an undeclared kind is not signable here; `vocabulary.test.ts`: the code-review declarations are the note's section 6 (docs/protocol.md section 33.7) every field of every declaration, written out from the tables; and 4 more |
| 13 | `C:claim.who.member` | claim's `who.roles` loses `member` | 189 (2 policy, 2 room-node, 6 room-legacy, 179 room-declared) | `vocabulary.test.ts`: a v2 document's vocabulary is its declarations (R-DECL-11, R-DECL-17) a grant names renew if the role may sign it, and the declared kinds the role may sign whose who.delegable is not false; `vocabulary.test.ts`: the code-review declarations are the note's section 6 (docs/protocol.md section 33.7) every field of every declaration, written out from the tables; and 187 more |
| 14 | `C:claim.who.agent` | claim's `who.roles` loses `agent` | 24 (1 policy, 2 room-node, 3 room-legacy, 18 room-declared) | `vocabulary.test.ts`: the code-review declarations are the note's section 6 (docs/protocol.md section 33.7) every field of every declaration, written out from the tables; `declared-equivalence.test.ts`: the code-review declarations let each role sign, and grant, what the legacy table does (R-DECL-11) each role and kind: the same answer; and 22 more |
| 15 | `C:claim.hold.scope` | claim's `hold.scope` is the template `["**"]`, not `body.scope` | 508 (2 policy, 31 room-legacy, 475 room-declared) | `declared-acts.test.ts`: the binding identity (R-DECL-15) the subject resolves every default; `vocabulary.test.ts`: the code-review declarations are the note's section 6 (docs/protocol.md section 33.7) every field of every declaration, written out from the tables; and 506 more |
| 16 | `C:claim.hold.workspace` | claim's `hold.workspace` is false | 509 (3 policy, 31 room-legacy, 475 room-declared) | `declared-acts.test.ts`: the binding identity (R-DECL-15) the subject resolves every default; `declared-acts.test.ts`: the binding identity (R-DECL-15) a step list, body field, scope source, hold setting, threads, kind or steps version changes it; and 507 more |
| 17 | `C:claim.hold.leaseSeconds` | claim's hold gains `leaseSeconds: 1800` | 3 (2 policy, 1 room-legacy) | `declared-acts.test.ts`: the binding identity (R-DECL-15) the subject resolves every default; `vocabulary.test.ts`: the code-review declarations are the note's section 6 (docs/protocol.md section 33.7) every field of every declaration, written out from the tables; and 1 more |
| 18 | `C:propose.label` | propose's label becomes `Proposal` | 1 (1 policy) | `vocabulary.test.ts`: the code-review declarations are the note's section 6 (docs/protocol.md section 33.7) every field of every declaration, written out from the tables |
| 19 | `C:propose.targets.thread` | propose's step on `thread` is `release`, not `version` | 513 (5 policy, 1 room-node, 32 room-legacy, 475 room-declared) | `declared-acts.test.ts`: accepted documents (R-DECL-24) the code-review declarations validate, with a checker naming check, and no warnings; `declared-acts.test.ts`: accepted documents (R-DECL-24) rules may name declared kinds and platform kinds; and 511 more |
| 20 | `C:propose.threads.claim` | propose's `threads` is `["room"]` | 261 (1 policy, 7 room-legacy, 253 room-declared) | `vocabulary.test.ts`: the code-review declarations are the note's section 6 (docs/protocol.md section 33.7) every field of every declaration, written out from the tables; `declared-fd6f00b6.test.ts`: threads (R-DECL-6, R-DECL-8, R-DECL-23) an entry target is not a thread target: a note on an entry of a thread its threads do not name is admitted; on a line of it, wrong-thread; and 259 more |
| 21 | `C:propose.threads.room` | propose's `threads` is `["claim"]` | 3 (1 policy, 2 room-legacy) | `vocabulary.test.ts`: the code-review declarations are the note's section 6 (docs/protocol.md section 33.7) every field of every declaration, written out from the tables; `declared-fd6f00b6.test.ts`: threads (R-DECL-6, R-DECL-8, R-DECL-23) a room thread (a revert lane, R-REV-6) takes the code-review acts that name room: claim, propose, note, review, land and release; and 1 more |
| 22 | `C:propose.body.summary.max` | propose's `summary` max is 8191, not 8192 | 2 (1 policy, 1 room-node) | `vocabulary.test.ts`: the code-review declarations are the note's section 6 (docs/protocol.md section 33.7) every field of every declaration, written out from the tables; `declared-equivalence.test.ts`: the code-review declarations judge bodies as the legacy vocabulary does (R-DECL-12, step 5) propose: every case gets the same outcome and message |
| 23 | `C:propose.body.summary.optional` | propose's `summary` becomes optional | 2 (1 policy, 1 room-node) | `vocabulary.test.ts`: the code-review declarations are the note's section 6 (docs/protocol.md section 33.7) every field of every declaration, written out from the tables; `declared-equivalence.test.ts`: the code-review declarations judge bodies as the legacy vocabulary does (R-DECL-12, step 5) propose: every case gets the same outcome and message |
| 24 | `C:propose.who.agent` | propose's `who.roles` loses `agent` | 14 (1 policy, 2 room-node, 11 room-declared) | `vocabulary.test.ts`: the code-review declarations are the note's section 6 (docs/protocol.md section 33.7) every field of every declaration, written out from the tables; `declared-equivalence.test.ts`: the code-review declarations let each role sign, and grant, what the legacy table does (R-DECL-11) each role and kind: the same answer; and 12 more |
| 25 | `C:note.label` | note's label becomes `Comment` | 1 (1 policy) | `vocabulary.test.ts`: the code-review declarations are the note's section 6 (docs/protocol.md section 33.7) every field of every declaration, written out from the tables |
| 26 | `C:note.targets.entry` | note loses target `entry` | 24 (1 policy, 2 room-node, 5 room-legacy, 16 room-declared) | `vocabulary.test.ts`: the code-review declarations are the note's section 6 (docs/protocol.md section 33.7) every field of every declaration, written out from the tables; `declared-equivalence.test.ts`: the code-review declarations judge bodies as the legacy vocabulary does (R-DECL-12, step 5) note: every case gets the same outcome and message; and 22 more |
| 27 | `C:note.targets.line` | note loses target `line` | 515 (6 policy, 2 room-node, 32 room-legacy, 475 room-declared) | `declared-acts.test.ts`: accepted documents (R-DECL-24) the code-review declarations validate, with a checker naming check, and no warnings; `declared-acts.test.ts`: accepted documents (R-DECL-24) rules may name declared kinds and platform kinds; and 513 more |
| 28 | `C:note.threads.claim` | note's `threads` is `["room"]` | 2 (1 policy, 1 room-declared) | `vocabulary.test.ts`: the code-review declarations are the note's section 6 (docs/protocol.md section 33.7) every field of every declaration, written out from the tables; and 1 more |
| 29 | `C:note.threads.room` | note's `threads` is `["claim"]` | 3 (1 policy, 2 room-legacy) | `vocabulary.test.ts`: the code-review declarations are the note's section 6 (docs/protocol.md section 33.7) every field of every declaration, written out from the tables; `declared-fd6f00b6.test.ts`: threads (R-DECL-6, R-DECL-8, R-DECL-23) a room thread (a revert lane, R-REV-6) takes the code-review acts that name room: claim, propose, note, review, land and release; and 1 more |
| 30 | `C:note.body.text.max` | note's `text` max is 16383, not 16384 | 2 (1 policy, 1 room-node) | `vocabulary.test.ts`: the code-review declarations are the note's section 6 (docs/protocol.md section 33.7) every field of every declaration, written out from the tables; `declared-equivalence.test.ts`: the code-review declarations judge bodies as the legacy vocabulary does (R-DECL-12, step 5) note: every case gets the same outcome and message |
| 31 | `C:note.who.checker` | note's `who.roles` loses `checker` | 6 (3 policy, 2 room-node, 1 room-declared) | `vocabulary.test.ts`: a v2 document's vocabulary is its declarations (R-DECL-11, R-DECL-17) who.roles decides, with admin implicit; renew keeps the legacy table; an undeclared kind is not signable here; `vocabulary.test.ts`: a v2 document's vocabulary is its declarations (R-DECL-11, R-DECL-17) a grant names renew if the role may sign it, and the declared kinds the role may sign whose who.delegable is not false; and 4 more |
| 32 | `C:note.who.member` | note's `who.roles` loses `member` | 10 (2 policy, 2 room-node, 2 room-legacy, 4 room-declared) | `vocabulary.test.ts`: a v2 document's vocabulary is its declarations (R-DECL-11, R-DECL-17) a grant names renew if the role may sign it, and the declared kinds the role may sign whose who.delegable is not false; `vocabulary.test.ts`: the code-review declarations are the note's section 6 (docs/protocol.md section 33.7) every field of every declaration, written out from the tables; and 8 more |
| 33 | `C:review.label` | review's label becomes `Approve` | 1 (1 policy) | `vocabulary.test.ts`: the code-review declarations are the note's section 6 (docs/protocol.md section 33.7) every field of every declaration, written out from the tables |
| 34 | `C:review.targets.version` | review's step on `version` is `check`, not `review` | 49 (2 policy, 1 room-node, 3 room-legacy, 43 room-declared) | `declared-acts.test.ts`: refused documents: each guard (R-DECL-24) G:checker-step refuses a checker naming review; `vocabulary.test.ts`: the code-review declarations are the note's section 6 (docs/protocol.md section 33.7) every field of every declaration, written out from the tables; and 47 more |
| 35 | `C:review.threads.claim` | review's `threads` is `["room"]` | 45 (1 policy, 1 room-legacy, 43 room-declared) | `vocabulary.test.ts`: the code-review declarations are the note's section 6 (docs/protocol.md section 33.7) every field of every declaration, written out from the tables; `declared-rows-fd6f00b6.test.ts`: condition 5: rows written per act, legacy and declared (request fd6f00b6) the declared path writes no row more than the legacy path for any act, admission alone or with its alarm work; and 43 more |
| 36 | `C:review.threads.room` | review's `threads` is `["claim"]` | 3 (1 policy, 2 room-legacy) | `vocabulary.test.ts`: the code-review declarations are the note's section 6 (docs/protocol.md section 33.7) every field of every declaration, written out from the tables; `declared-fd6f00b6.test.ts`: threads (R-DECL-6, R-DECL-8, R-DECL-23) a room thread (a revert lane, R-REV-6) takes the code-review acts that name room: claim, propose, note, review, land and release; and 1 more |
| 37 | `C:review.body.text.max` | review's `text` max is 16383, not 16384 | 2 (1 policy, 1 room-node) | `vocabulary.test.ts`: the code-review declarations are the note's section 6 (docs/protocol.md section 33.7) every field of every declaration, written out from the tables; `declared-equivalence.test.ts`: the code-review declarations judge bodies as the legacy vocabulary does (R-DECL-12, step 5) review: every case gets the same outcome and message |
| 38 | `C:review.body.text.optional` | review's `text` becomes optional | 2 (1 policy, 1 room-node) | `vocabulary.test.ts`: the code-review declarations are the note's section 6 (docs/protocol.md section 33.7) every field of every declaration, written out from the tables; `declared-equivalence.test.ts`: the code-review declarations judge bodies as the legacy vocabulary does (R-DECL-12, step 5) review: every case gets the same outcome and message |
| 39 | `C:review.who.maintainer` | review's `who.roles` loses `maintainer` | 43 (1 policy, 2 room-node, 40 room-declared) | `vocabulary.test.ts`: the code-review declarations are the note's section 6 (docs/protocol.md section 33.7) every field of every declaration, written out from the tables; `declared-equivalence.test.ts`: the code-review declarations let each role sign, and grant, what the legacy table does (R-DECL-11) each role and kind: the same answer; and 41 more |
| 40 | `C:check.label` | check's label becomes `Checked` | 1 (1 policy) | `vocabulary.test.ts`: the code-review declarations are the note's section 6 (docs/protocol.md section 33.7) every field of every declaration, written out from the tables |
| 41 | `C:check.targets.version` | check's step on `version` is `review`, not `check` | 514 (6 policy, 1 room-node, 32 room-legacy, 475 room-declared) | `declared-acts.test.ts`: accepted documents (R-DECL-24) the code-review declarations validate, with a checker naming check, and no warnings; `declared-acts.test.ts`: accepted documents (R-DECL-24) rules may name declared kinds and platform kinds; and 512 more |
| 42 | `C:check.threads.claim` | check's `threads` is `["room"]` | 53 (2 policy, 51 room-declared) | `declared-acts.test.ts`: the binding identity (R-DECL-15) the subject resolves every default; `vocabulary.test.ts`: the code-review declarations are the note's section 6 (docs/protocol.md section 33.7) every field of every declaration, written out from the tables; and 51 more |
| 43 | `C:check.threads.room` | check's `threads` is `["claim"]` | 3 (2 policy, 1 room-legacy) | `declared-acts.test.ts`: the binding identity (R-DECL-15) the subject resolves every default; `vocabulary.test.ts`: the code-review declarations are the note's section 6 (docs/protocol.md section 33.7) every field of every declaration, written out from the tables; and 1 more |
| 44 | `C:check.who.checker` | check's `who.roles` is empty | 137 (4 policy, 2 room-node, 1 room-legacy, 130 room-declared) | `declared-acts.test.ts`: accepted documents (R-DECL-24) the code-review declarations validate, with a checker naming check, and no warnings; `declared-acts.test.ts`: built-in data (R-DECL-1, section 33.7) the code-review check act is one a checker configuration may name; and 135 more |
| 45 | `C:land.label` | land's label becomes `Merge` | 1 (1 policy) | `vocabulary.test.ts`: the code-review declarations are the note's section 6 (docs/protocol.md section 33.7) every field of every declaration, written out from the tables |
| 46 | `C:land.targets.version` | land's step on `version` is `review`, not `land` | 107 (1 policy, 2 room-node, 2 room-legacy, 102 room-declared) | `vocabulary.test.ts`: the code-review declarations are the note's section 6 (docs/protocol.md section 33.7) every field of every declaration, written out from the tables; `declared-equivalence.test.ts`: the code-review declarations judge bodies as the legacy vocabulary does (R-DECL-12, step 5) land: every case gets the same outcome and message; and 105 more |
| 47 | `C:land.threads.claim` | land's `threads` is `["room"]` | 102 (1 policy, 1 room-legacy, 100 room-declared) | `vocabulary.test.ts`: the code-review declarations are the note's section 6 (docs/protocol.md section 33.7) every field of every declaration, written out from the tables; `declared-rows-fd6f00b6.test.ts`: condition 5: rows written per act, legacy and declared (request fd6f00b6) the declared path writes no row more than the legacy path for any act, admission alone or with its alarm work; and 100 more |
| 48 | `C:land.threads.room` | land's `threads` is `["claim"]` | 3 (1 policy, 2 room-legacy) | `vocabulary.test.ts`: the code-review declarations are the note's section 6 (docs/protocol.md section 33.7) every field of every declaration, written out from the tables; `declared-fd6f00b6.test.ts`: threads (R-DECL-6, R-DECL-8, R-DECL-23) a room thread (a revert lane, R-REV-6) takes the code-review acts that name room: claim, propose, note, review, land and release; and 1 more |
| 49 | `C:land.who.member` | land's `who.roles` loses `member` | 83 (1 policy, 2 room-node, 2 room-legacy, 78 room-declared) | `vocabulary.test.ts`: the code-review declarations are the note's section 6 (docs/protocol.md section 33.7) every field of every declaration, written out from the tables; `declared-equivalence.test.ts`: the code-review declarations let each role sign, and grant, what the legacy table does (R-DECL-11) each role and kind: the same answer; and 81 more |
| 50 | `C:release.label` | release's label becomes `Let go` | 1 (1 policy) | `vocabulary.test.ts`: the code-review declarations are the note's section 6 (docs/protocol.md section 33.7) every field of every declaration, written out from the tables |
| 51 | `C:release.targets.thread` | release's step on `thread` is `take`, not `release` | 31 (2 policy, 1 room-node, 6 room-legacy, 22 room-declared) | `declared-acts.test.ts`: accepted documents (R-DECL-24) the code-review declarations validate, with a checker naming check, and no warnings; `vocabulary.test.ts`: the code-review declarations are the note's section 6 (docs/protocol.md section 33.7) every field of every declaration, written out from the tables; and 29 more |
| 52 | `C:release.threads.claim` | release's `threads` is `["room"]` | 28 (3 policy, 3 room-legacy, 22 room-declared) | `declared-acts.test.ts`: accepted documents (R-DECL-24) the code-review declarations validate, with a checker naming check, and no warnings; `declared-acts.test.ts`: the binding identity (R-DECL-15) writing a default out leaves the binding unchanged; and 26 more |
| 53 | `C:release.threads.room` | release's `threads` is `["claim"]` | 3 (2 policy, 1 room-legacy) | `declared-acts.test.ts`: the binding identity (R-DECL-15) writing a default out leaves the binding unchanged; `vocabulary.test.ts`: the code-review declarations are the note's section 6 (docs/protocol.md section 33.7) every field of every declaration, written out from the tables; and 1 more |
| 54 | `C:release.who.member` | release's `who.roles` loses `member` | 15 (2 policy, 2 room-node, 5 room-legacy, 6 room-declared) | `vocabulary.test.ts`: a v2 document's vocabulary is its declarations (R-DECL-11, R-DECL-17) a grant names renew if the role may sign it, and the declared kinds the role may sign whose who.delegable is not false; `vocabulary.test.ts`: the code-review declarations are the note's section 6 (docs/protocol.md section 33.7) every field of every declaration, written out from the tables; and 13 more |
| 55 | `G2:binding-field` | the envelope allows `binding` in a `v1` room too | 1 (1 room-legacy) | `declared-fd6f00b6.test.ts`: declared acts stage 2: one vocabulary per document (R-DECL-1) a v1 room is the legacy vocabulary: a v: 2 envelope, a binding on v: 1, and recover are bad-request at step 1 |
| 56 | `G2:v1-version` | a `v1` room accepts envelope `v: 2` | 2 (1 room-node, 1 room-legacy) | `schema.test.ts`: R-SIG-4 envelopes accepts a closed envelope and refuses unknown fields, wrong versions and malformed IDs; `declared-fd6f00b6.test.ts`: declared acts stage 2: one vocabulary per document (R-DECL-1) a v1 room is the legacy vocabulary: a v: 2 envelope, a binding on v: 1, and recover are bad-request at step 1 |
| 57 | `G2:v2-version` | a `v2` room accepts envelope `v: 3` | 1 (1 room-node) | `declared-equivalence.test.ts`: the code-review declarations judge envelopes and targets as the legacy vocabulary does (step 1) a v2 room: a kind of the grammar passes step 1 whatever it is; v: 2 needs a binding; a platform kind is v: 1; recover targets follow the op |
| 58 | `G2:kind-grammar` | the kind grammar check accepts any name that starts with a letter | 1 (1 room-node) | `declared-equivalence.test.ts`: the code-review declarations judge envelopes and targets as the legacy vocabulary does (step 1) a v2 room: a kind of the grammar passes step 1 whatever it is; v: 2 needs a binding; a platform kind is v: 1; recover targets follow the op |
| 59 | `G2:platform-v1` | a platform kind may be `v: 2` | 2 (1 room-node, 1 room-legacy) | `declared-equivalence.test.ts`: the code-review declarations judge envelopes and targets as the legacy vocabulary does (step 1) a v2 room: a kind of the grammar passes step 1 whatever it is; v: 2 needs a binding; a platform kind is v: 1; recover targets follow the op; `declared-fd6f00b6.test.ts`: declared acts stage 2: one vocabulary per document (R-DECL-1) a v2 room admits the code-review acts with their bindings; a thread records its kind, opening binding and lease length (R-DECL-6) |
| 60 | `G2:binding-format` | the binding's format is not checked | 1 (1 room-node) | `declared-equivalence.test.ts`: the code-review declarations judge envelopes and targets as the legacy vocabulary does (step 1) a v2 room: a kind of the grammar passes step 1 whatever it is; v: 2 needs a binding; a platform kind is v: 1; recover targets follow the op |
| 61 | `G2:binding-v1` | a `v: 1` envelope may carry a binding | 1 (1 room-node) | `declared-equivalence.test.ts`: the code-review declarations judge envelopes and targets as the legacy vocabulary does (step 1) a v2 room: a kind of the grammar passes step 1 whatever it is; v: 2 needs a binding; a platform kind is v: 1; recover targets follow the op |
| 62 | `G2:declared-target` | a declared act's target is checked against no declaration | 7 (7 room-node) | `declared-equivalence.test.ts`: the code-review declarations judge envelopes and targets as the legacy vocabulary does (step 1) claim: each target gets the same outcome and message; `declared-equivalence.test.ts`: the code-review declarations judge envelopes and targets as the legacy vocabulary does (step 1) propose: each target gets the same outcome and message; and 5 more |
| 63 | `G2:recover-target` | a `recover` op that takes no target accepts one | 1 (1 room-node) | `declared-equivalence.test.ts`: the code-review declarations judge envelopes and targets as the legacy vocabulary does (step 1) a v2 room: a kind of the grammar passes step 1 whatever it is; v: 2 needs a binding; a platform kind is v: 1; recover targets follow the op |
| 64 | `G2:required-on` | `requiredFor` makes a field required on every target | 13 (2 room-node, 5 room-legacy, 6 room-declared) | `declared-equivalence.test.ts`: the code-review declarations judge bodies as the legacy vocabulary does (R-DECL-12, step 5) claim: every case gets the same outcome and message; `declared-equivalence.test.ts`: the code-review declarations judge bodies as the legacy vocabulary does (R-DECL-12, step 5) the declared field types, each with its limits (R-DECL-12); and 11 more |
| 65 | `G2:declared-fields` | declared body fields are not checked against their types | 6 (5 room-node, 1 room-declared) | `declared-equivalence.test.ts`: the code-review declarations judge bodies as the legacy vocabulary does (R-DECL-12, step 5) claim: every case gets the same outcome and message; `declared-equivalence.test.ts`: the code-review declarations judge bodies as the legacy vocabulary does (R-DECL-12, step 5) propose: every case gets the same outcome and message; and 4 more |
| 66 | `G2:step-fields` | the steps' own fields are not checked | 9 (7 room-node, 2 room-declared) | `declared-equivalence.test.ts`: the code-review declarations judge bodies as the legacy vocabulary does (R-DECL-12, step 5) claim: every case gets the same outcome and message; `declared-equivalence.test.ts`: the code-review declarations judge bodies as the legacy vocabulary does (R-DECL-12, step 5) propose: every case gets the same outcome and message; and 7 more |
| 67 | `G2:because` | `because` is not checked | 1 (1 room-node) | `declared-equivalence.test.ts`: the code-review declarations judge bodies as the legacy vocabulary does (R-DECL-12, step 5) the two differences on purpose: claim's purpose, and because on every act |
| 68 | `G2:field-text` | a `text` field's max is ignored | 6 (5 room-node, 1 room-declared) | `declared-equivalence.test.ts`: the code-review declarations judge bodies as the legacy vocabulary does (R-DECL-12, step 5) claim: every case gets the same outcome and message; `declared-equivalence.test.ts`: the code-review declarations judge bodies as the legacy vocabulary does (R-DECL-12, step 5) propose: every case gets the same outcome and message; and 4 more |
| 69 | `G2:field-int` | an `int` field's range is ignored | 1 (1 room-node) | `declared-equivalence.test.ts`: the code-review declarations judge bodies as the legacy vocabulary does (R-DECL-12, step 5) the declared field types, each with its limits (R-DECL-12) |
| 70 | `G2:field-enum` | an `enum` field accepts any string | 1 (1 room-node) | `declared-equivalence.test.ts`: the code-review declarations judge bodies as the legacy vocabulary does (R-DECL-12, step 5) the declared field types, each with its limits (R-DECL-12) |
| 71 | `G2:field-globs` | a `globs` field's max is fixed at 64 | 1 (1 room-node) | `declared-equivalence.test.ts`: the code-review declarations judge bodies as the legacy vocabulary does (R-DECL-12, step 5) the declared field types, each with its limits (R-DECL-12) |
| 72 | `G2:field-member` | a `member` field accepts any string | 1 (1 room-node) | `declared-equivalence.test.ts`: the code-review declarations judge bodies as the legacy vocabulary does (R-DECL-12, step 5) the declared field types, each with its limits (R-DECL-12) |
| 73 | `G2:field-act` | an `act` field accepts any string | 1 (1 room-node) | `declared-equivalence.test.ts`: the code-review declarations judge bodies as the legacy vocabulary does (R-DECL-12, step 5) the declared field types, each with its limits (R-DECL-12) |
| 74 | `G2:field-segment` | a `segment` field accepts slashes and glob characters | 1 (1 room-node) | `declared-equivalence.test.ts`: the code-review declarations judge bodies as the legacy vocabulary does (R-DECL-12, step 5) the declared field types, each with its limits (R-DECL-12) |
| 75 | `G2:field-fixed` | a `segment` field is not marked fixed-format for the secret scan | 1 (1 room-node) | `declared-equivalence.test.ts`: the code-review declarations judge bodies as the legacy vocabulary does (R-DECL-12, step 5) the declared field types, each with its limits (R-DECL-12) |
| 76 | `G2:recover-op` | an unknown `recover` op is not refused | 1 (1 room-node) | `declared-equivalence.test.ts`: the code-review declarations judge envelopes and targets as the legacy vocabulary does (step 1) recover bodies are the legacy recovery acts' fields, by op |
| 77 | `G2:grant-kinds` | a grant's plain kinds are not limited to delegable platform kinds | 1 (1 room-node) | `declared-equivalence.test.ts`: the code-review declarations judge envelopes and targets as the legacy vocabulary does (step 1) grants in a v2 room are platform kinds and a signed map, never * |
| 78 | `G2:grant-map` | a grant map's bindings are not checked for format | 1 (1 room-node) | `declared-equivalence.test.ts`: the code-review declarations judge envelopes and targets as the legacy vocabulary does (step 1) grants in a v2 room are platform kinds and a signed map, never * |
| 79 | `G2:grant-shape` | a `v2` grant may omit its map | 1 (1 room-node) | `declared-equivalence.test.ts`: the code-review declarations judge envelopes and targets as the legacy vocabulary does (step 1) grants in a v2 room are platform kinds and a signed map, never * |
| 80 | `G2:who-roles` | a declared kind is judged by the legacy role table, not `who.roles` | 3 (3 room-legacy) | `declared-fd6f00b6.test.ts`: who may sign: who.roles, admin implicit (R-DECL-11) a declared kind's roles decide at step 4, unrecorded; an admin may sign every declared act; renew keeps the legacy table; `declared-fd6f00b6.test.ts`: threads (R-DECL-6, R-DECL-8, R-DECL-23) a retired opening kind: its held thread with an open version can still be reviewed and released by acts that name it; a new act of it is kind-undeclared; and 1 more |
| 81 | `G2:delegation-v1-era` | a `v1`-era delegation is not refused for a declared kind | 1 (1 room-legacy) | `declared-fd6f00b6.test.ts`: grants carry the bindings their grantor signed (R-DECL-17) grants from before declared acts: after the first v2 activation a v1-era * delegation covers renew and no declared kind; one limited to review and check covers nothing |
| 82 | `G2:delegation-covers` | a delegation whose map lacks the kind is not refused | 2 (2 room-legacy) | `declared-fd6f00b6.test.ts`: grants carry the bindings their grantor signed (R-DECL-17) the grantor's role and who.delegable bound the map; a grant expanded before a kind was added does not cover it; `declared-fd6f00b6.test.ts`: grants carry the bindings their grantor signed (R-DECL-17) a room-custody invitation with no session grants renew and no declared kind; its bearer's code-review tools carry the code-review binding |
| 83 | `G2:delegation-binding` | a delegation whose map names another binding is not refused | 2 (2 room-legacy) | `declared-fd6f00b6.test.ts`: grants carry the bindings their grantor signed (R-DECL-17) an exact retry of an admitted grant after a meaning change gets its receipt; acts under it are then delegation-invalid; `declared-fd6f00b6.test.ts`: grants carry the bindings their grantor signed (R-DECL-17) bearer acts: the named tools' code-review binding is admitted where claim means the code-review claim, and binding-stale where it does not |
| 84 | `G2:undeclared-class` | an undeclared kind is judged at step 4 by the legacy table | 1 (1 room-legacy) | `declared-fd6f00b6.test.ts`: step 4a: kind-undeclared and binding-stale, unrecorded (R-DECL-16) an undeclared kind is kind-undeclared after authority and before the body check; nothing is recorded |
| 85 | `G2:step1-recheck` | step 1 is not judged again under the document in force | 1 (1 room-legacy) | `declared-fd6f00b6.test.ts`: step 1 under the document in force (R-ADM-1 as amended) admission judges step 1 again under the document it decides with: an envelope of the other vocabulary is bad-request there too |
| 86 | `G2:4a-platform` | step 4a also demands a binding of platform kinds | 299 (22 room-legacy, 277 room-declared) | `declared-fd6f00b6.test.ts`: declared acts stage 2: one vocabulary per document (R-DECL-1) a v2 room admits the code-review acts with their bindings; a thread records its kind, opening binding and lease length (R-DECL-6); `declared-fd6f00b6.test.ts`: who may sign: who.roles, admin implicit (R-DECL-11) a declared kind's roles decide at step 4, unrecorded; an admin may sign every declared act; renew keeps the legacy table; and 297 more |
| 87 | `G2:undeclared` | an undeclared kind passes step 4a | 2 (2 room-legacy) | `declared-fd6f00b6.test.ts`: step 4a: kind-undeclared and binding-stale, unrecorded (R-DECL-16) an undeclared kind is kind-undeclared after authority and before the body check; nothing is recorded; `declared-fd6f00b6.test.ts`: threads (R-DECL-6, R-DECL-8, R-DECL-23) a retired opening kind: its held thread with an open version can still be reviewed and released by acts that name it; a new act of it is kind-undeclared |
| 88 | `G2:stale` | a stale or missing binding passes step 4a | 3 (3 room-legacy) | `declared-fd6f00b6.test.ts`: step 4a: kind-undeclared and binding-stale, unrecorded (R-DECL-16) a v: 1 envelope of a declared kind, and a v: 2 one with another binding, are binding-stale with the current binding and version; the signer signs again under the same key; `declared-fd6f00b6.test.ts`: step 4a: kind-undeclared and binding-stale, unrecorded (R-DECL-16) same-shape change: an act signed under [version], submitted after activation of [version, land], is binding-stale and no landing starts; and 1 more |
| 89 | `G2:grant-platform` | a grant may name a platform kind its role may not sign | 1 (1 room-legacy) | `declared-fd6f00b6.test.ts`: grants carry the bindings their grantor signed (R-DECL-17) a grant's plain kinds are bound by the grantor's role: a checker, who may not sign renew, may not grant it by a delegation, nor be invited with a session that lists it; nothing is recorded |
| 90 | `G2:grant-undeclared` | a grant map naming an undeclared kind is admitted | 2 (2 room-legacy) | `declared-fd6f00b6.test.ts`: grants carry the bindings their grantor signed (R-DECL-17) a grant signed for a meaning that changed before its admission is binding-stale; a kind it does not declare is kind-undeclared; nothing is recorded; `declared-fd6f00b6.test.ts`: grants carry the bindings their grantor signed (R-DECL-17) an invitation's session map is judged when the invitation is admitted (R-DECL-17): a stale binding is binding-stale, an undeclared kind kind-undeclared, a kind the invited role may not sign invalid-body; nothing is recorded |
| 91 | `G2:grant-delegable` | a grant map may name a kind the role may not grant, or one that is not delegable | 3 (2 room-legacy, 1 room-declared) | `declared-fd6f00b6.test.ts`: grants carry the bindings their grantor signed (R-DECL-17) the grantor's role and who.delegable bound the map; a grant expanded before a kind was added does not cover it; `declared-fd6f00b6.test.ts`: grants carry the bindings their grantor signed (R-DECL-17) an invitation's session map is judged when the invitation is admitted (R-DECL-17): a stale binding is binding-stale, an undeclared kind kind-undeclared, a kind the invited role may not sign invalid-body; nothing is recorded; and 1 more |
| 92 | `G2:grant-stale` | a grant map with a stale binding is admitted | 3 (3 room-legacy) | `declared-fd6f00b6.test.ts`: grants carry the bindings their grantor signed (R-DECL-17) a grant signed for a meaning that changed before its admission is binding-stale; a kind it does not declare is kind-undeclared; nothing is recorded; `declared-fd6f00b6.test.ts`: grants carry the bindings their grantor signed (R-DECL-17) an invitation signed before a meaning change and redeemed after it is binding-stale; the invitation stays unused; and 1 more |
| 93 | `G2:session-grant` | an invitation's session map is not judged at its admission | 1 (1 room-legacy) | `declared-fd6f00b6.test.ts`: grants carry the bindings their grantor signed (R-DECL-17) an invitation's session map is judged when the invitation is admitted (R-DECL-17): a stale binding is binding-stale, an undeclared kind kind-undeclared, a kind the invited role may not sign invalid-body; nothing is recorded |
| 94 | `G2:wording` | a declaration's refusal wording is never used | 1 (1 room-legacy) | `declared-fd6f00b6.test.ts`: refusal wording from the declaration (R-DECL-13) a platform refusal of a declared act takes the declaration's reason and fix, slots filled; the code is the room's; a rule's refusal keeps its own |
| 95 | `G2:rule-wording` | a rule's refusal takes the declaration's wording too | 1 (1 room-legacy) | `declared-fd6f00b6.test.ts`: refusal wording from the declaration (R-DECL-13) a platform refusal of a declared act takes the declaration's reason and fix, slots filled; the code is the room's; a rule's refusal keeps its own |
| 96 | `G2:thread-kind` | the thread-kind check passes every thread | 2 (2 room-legacy) | `declared-fd6f00b6.test.ts`: threads (R-DECL-6, R-DECL-8, R-DECL-23) an entry target is not a thread target: a note on an entry of a thread its threads do not name is admitted; on a line of it, wrong-thread; `declared-fd6f00b6.test.ts`: threads (R-DECL-6, R-DECL-8, R-DECL-23) wrong-thread is recorded at step 7: a thread whose kind the act does not name, a declared act on a recovery thread, and recover on an ordinary one |
| 97 | `G2:entry-exempt` | an entry target is judged as a thread target | 1 (1 room-legacy) | `declared-fd6f00b6.test.ts`: threads (R-DECL-6, R-DECL-8, R-DECL-23) an entry target is not a thread target: a note on an entry of a thread its threads do not name is admitted; on a line of it, wrong-thread |
| 98 | `G2:recovery-thread` | a declared act on a recovery thread is not refused | 2 (2 room-legacy) | `declared-fd6f00b6.test.ts`: threads (R-DECL-6, R-DECL-8, R-DECL-23) wrong-thread is recorded at step 7: a thread whose kind the act does not name, a declared act on a recovery thread, and recover on an ordinary one; `declared-fd6f00b6.test.ts`: recover, the platform kind (R-DECL-21) an admin's own key opens, versions, approves and lands a recovery thread; any other signer is admin-required; a legacy recovery lane takes recover ops after the first v2 activation |
| 99 | `G2:recover-ordinary` | `recover` is admitted on any thread | 1 (1 room-legacy) | `declared-fd6f00b6.test.ts`: threads (R-DECL-6, R-DECL-8, R-DECL-23) wrong-thread is recorded at step 7: a thread whose kind the act does not name, a declared act on a recovery thread, and recover on an ordinary one |
| 100 | `G2:recover-no-thread` | `recover` naming no thread is not refused | 1 (1 room-legacy) | `declared-fd6f00b6.test.ts`: threads (R-DECL-6, R-DECL-8, R-DECL-23) wrong-thread is recorded at step 7: a thread whose kind the act does not name, a declared act on a recovery thread, and recover on an ordinary one |
| 101 | `G2:lease-record` | an opening act with no `leaseSeconds` records no lease | 3 (3 room-legacy) | `declared-fd6f00b6.test.ts`: declared acts stage 2: one vocabulary per document (R-DECL-1) a v2 room admits the code-review acts with their bindings; a thread records its kind, opening binding and lease length (R-DECL-6); `declared-fd6f00b6.test.ts`: threads (R-DECL-6, R-DECL-8, R-DECL-23) wrong-thread is recorded at step 7: a thread whose kind the act does not name, a declared act on a recovery thread, and recover on an ordinary one; and 1 more |
| 102 | `G2:lease-hold` | `hold.leaseSeconds` is ignored at open | 1 (1 room-legacy) | `declared-fd6f00b6.test.ts`: the lease rule (R-DECL-6, R-DECL-9, R-DECL-15) hold.leaseSeconds is the thread's lease length: renewal and expiry use it; a take-over keeps it |
| 103 | `G2:lease-v1` | a `v1` thread records a lease length too | 2 (2 room-legacy) | `declared-fd6f00b6.test.ts`: declared acts stage 2: one vocabulary per document (R-DECL-1) a v1 room is the legacy vocabulary: a v: 2 envelope, a binding on v: 1, and recover are bad-request at step 1; `declared-fd6f00b6.test.ts`: the lease rule (R-DECL-6, R-DECL-9, R-DECL-15) a v1 thread keeps today's behaviour: no recorded length, and the room's current lease after a deployment change, also once the room is v2 |
| 104 | `G2:lease-of` | renewal and expiry always use the room's current lease | 2 (2 room-legacy) | `declared-fd6f00b6.test.ts`: the lease rule (R-DECL-6, R-DECL-9, R-DECL-15) a thread records the room's numeric lease at open and keeps it across a restart and a deployment lease change, for renewal and expiry; a new thread takes the new lease; `declared-fd6f00b6.test.ts`: the lease rule (R-DECL-6, R-DECL-9, R-DECL-15) hold.leaseSeconds is the thread's lease length: renewal and expiry use it; a take-over keeps it |
| 105 | `G2:thread-kind-record` | every thread is recorded as kind `claim` | 3 (3 room-legacy) | `declared-fd6f00b6.test.ts`: threads (R-DECL-6, R-DECL-8, R-DECL-23) wrong-thread is recorded at step 7: a thread whose kind the act does not name, a declared act on a recovery thread, and recover on an ordinary one; `declared-fd6f00b6.test.ts`: threads (R-DECL-6, R-DECL-8, R-DECL-23) a retired opening kind: its held thread with an open version can still be reviewed and released by acts that name it; a new act of it is kind-undeclared; and 1 more |
| 106 | `G2:binding-record` | the opening binding is not recorded | 1 (1 room-legacy) | `declared-fd6f00b6.test.ts`: declared acts stage 2: one vocabulary per document (R-DECL-1) a v2 room admits the code-review acts with their bindings; a thread records its kind, opening binding and lease length (R-DECL-6) |
| 107 | `G2:recover-open` | a `recover` open is not a configuration-recovery open | 6 (2 room-legacy, 4 room-declared) | `declared-fd6f00b6.test.ts`: threads (R-DECL-6, R-DECL-8, R-DECL-23) wrong-thread is recorded at step 7: a thread whose kind the act does not name, a declared act on a recovery thread, and recover on an ordinary one; `declared-fd6f00b6.test.ts`: recover, the platform kind (R-DECL-21) an admin's own key opens, versions, approves and lands a recovery thread; any other signer is admin-required; a legacy recovery lane takes recover ops after the first v2 activation; and 4 more |
| 108 | `G2:grant-store` | a grant's signed map is not stored | 17 (5 room-legacy, 12 room-declared) | `declared-fd6f00b6.test.ts`: grants carry the bindings their grantor signed (R-DECL-17) the grantor's role and who.delegable bound the map; a grant expanded before a kind was added does not cover it; `declared-fd6f00b6.test.ts`: grants carry the bindings their grantor signed (R-DECL-17) an exact retry of an admitted grant after a meaning change gets its receipt; acts under it are then delegation-invalid; and 15 more |
| 109 | `G2:staged-pair` | a two-step act is not refused at propose time | 1 (1 room-legacy) | `declared-fd6f00b6.test.ts`: R-DECL-24 at propose time, and the stage-4 steps a document that uses a step or hold setting this room runs only from stage 4 is policy-invalid at propose time |
| 110 | `G2:staged-handover` | `hand-over` is not refused at propose time | 1 (1 room-legacy) | `declared-fd6f00b6.test.ts`: R-DECL-24 at propose time, and the stage-4 steps a document that uses a step or hold setting this room runs only from stage 4 is policy-invalid at propose time |
| 111 | `G2:staged-unanchored` | a comment on target `none` is not refused at propose time | 1 (1 room-legacy) | `declared-fd6f00b6.test.ts`: R-DECL-24 at propose time, and the stage-4 steps a document that uses a step or hold setting this room runs only from stage 4 is policy-invalid at propose time |
| 112 | `G2:staged-template` | a scope template is not refused at propose time | 1 (1 room-legacy) | `declared-fd6f00b6.test.ts`: R-DECL-24 at propose time, and the stage-4 steps a document that uses a step or hold setting this room runs only from stage 4 is policy-invalid at propose time |
| 113 | `G2:staged-conflict` | `hold.conflict` is not refused at propose time | 1 (1 room-legacy) | `declared-fd6f00b6.test.ts`: R-DECL-24 at propose time, and the stage-4 steps a document that uses a step or hold setting this room runs only from stage 4 is policy-invalid at propose time |
| 114 | `G2:staged-reserve` | `hold.reserveSeconds` is not refused at propose time | 1 (1 room-legacy) | `declared-fd6f00b6.test.ts`: R-DECL-24 at propose time, and the stage-4 steps a document that uses a step or hold setting this room runs only from stage 4 is policy-invalid at propose time |
| 115 | `G2:staged-workspace` | a hold without a workspace is not refused at propose time | 1 (1 room-legacy) | `declared-fd6f00b6.test.ts`: R-DECL-24 at propose time, and the stage-4 steps a document that uses a step or hold setting this room runs only from stage 4 is policy-invalid at propose time |
| 116 | `G2:fill` | refusal wording slots are not filled | 1 (1 room-legacy) | `declared-fd6f00b6.test.ts`: refusal wording from the declaration (R-DECL-13) a platform refusal of a declared act takes the declaration's reason and fix, slots filled; the code is the room's; a rule's refusal keeps its own |
| 117 | `G2:parse-declared` | a `v2` document is never parsed by the acts validator | 507 (32 room-legacy, 475 room-declared) | `declared-fd6f00b6.test.ts`: declared acts stage 2: one vocabulary per document (R-DECL-1) a v1 room is the legacy vocabulary: a v: 2 envelope, a binding on v: 1, and recover are bad-request at step 1; `declared-fd6f00b6.test.ts`: declared acts stage 2: one vocabulary per document (R-DECL-1) a v2 room admits the code-review acts with their bindings; a thread records its kind, opening binding and lease length (R-DECL-6); and 505 more |
| 118 | `G2:historical` | the validator is given no historical opening kinds | 1 (1 room-legacy) | `declared-fd6f00b6.test.ts`: R-DECL-24 at propose time, and the stage-4 steps a v2 document is validated by the acts validator with the room's historical opening kinds; a v1 checker configuration in it is refused |
| 119 | `G2:checkers-v2` | the validator is given no checker configurations | 1 (1 room-legacy) | `declared-fd6f00b6.test.ts`: R-DECL-24 at propose time, and the stage-4 steps a v2 document is validated by the acts validator with the room's historical opening kinds; a v1 checker configuration in it is refused |
| 120 | `G2:staged` | staged problems are not refused | 1 (1 room-legacy) | `declared-fd6f00b6.test.ts`: R-DECL-24 at propose time, and the stage-4 steps a document that uses a step or hold setting this room runs only from stage 4 is policy-invalid at propose time |
| 121 | `G2:binding-cache` | the binding cache is not reset on a new policy version | 6 (6 room-legacy) | `declared-fd6f00b6.test.ts`: step 4a: kind-undeclared and binding-stale, unrecorded (R-DECL-16) same-shape change: an act signed under [version], submitted after activation of [version, land], is binding-stale and no landing starts; `declared-fd6f00b6.test.ts`: step 4a: kind-undeclared and binding-stale, unrecorded (R-DECL-16) hold change: a claim signed before leaseSeconds or the scope source changed is binding-stale; and 4 more |
| 122 | `G2:revert-lease` | a revert thread never records the room's lease | 2 (2 room-legacy) | `declared-fd6f00b6.test.ts`: threads (R-DECL-6, R-DECL-8, R-DECL-23) a room thread (a revert lane, R-REV-6) takes the code-review acts that name room: claim, propose, note, review, land and release; `declared-fd6f00b6.test.ts`: the lease rule (R-DECL-6, R-DECL-9, R-DECL-15) a revert thread opened under a v2 document records the room's lease; under a v1 document it records none |
| 123 | `G2:session-map` | a `v2` session's signed map is dropped at redemption | 10 (2 room-legacy, 8 room-declared) | `declared-fd6f00b6.test.ts`: grants carry the bindings their grantor signed (R-DECL-17) an invitation signed before a meaning change and redeemed after it is binding-stale; the invitation stays unused; `declared-fd6f00b6.test.ts`: grants carry the bindings their grantor signed (R-DECL-17) bearer acts: the named tools' code-review binding is admitted where claim means the code-review claim, and binding-stale where it does not; and 8 more |
| 124 | `G2:session-intersection` | a session with no map is granted every delegable platform kind | 1 (1 room-legacy) | `declared-fd6f00b6.test.ts`: grants carry the bindings their grantor signed (R-DECL-17) an invitation from before declared acts, redeemed after the first v2 activation, grants only the delegable platform kinds its session covered: one limited to claim and propose grants nothing, one that lists renew grants renew (intersection, never acquisition) |
| 125 | `G2:bearer-binding` | a bearer act's own binding is ignored | 1 (1 room-legacy) | `declared-fd6f00b6.test.ts`: grants carry the bindings their grantor signed (R-DECL-17) bearer acts: the named tools' code-review binding is admitted where claim means the code-review claim, and binding-stale where it does not |
| 126 | `G2:bearer-builtfor` | a bearer act's default binding is the room's own declaration's | 1 (1 room-legacy) | `declared-fd6f00b6.test.ts`: grants carry the bindings their grantor signed (R-DECL-17) bearer acts: the named tools' code-review binding is admitted where claim means the code-review claim, and binding-stale where it does not |
| 127 | `G2:workspace-kinds` | a workspace request ignores the thread's kind | 1 (1 room-legacy) | `declared-fd6f00b6.test.ts`: R-DECL-24 at propose time, and the stage-4 steps a workspace request is judged as for an act with step version on the thread (R-CRED-5 as amended) |
| 128 | `G2:workspace-recover` | a workspace request on a recovery thread is not judged as `recover` | 4 (4 room-declared) | `landing.test.ts`: R-ADMIN configuration recovery and sole-admin approval section 23, Policy lockout: the sole admin repairs the policy through a configuration-recovery lane; policy-activated follows; `landing.test.ts`: R-ADMIN configuration recovery and sole-admin approval R-ADMIN-5 is the Room's own rule: with a policy port that ignores the lane purpose, recovery-lane acts are still not judged by policy; and 2 more |
| 129 | `G2:migration-add` | migration 4 adds its columns without checking they are absent | 27 (14 room-legacy, 13 room-declared) | `declared-fd6f00b6.test.ts`: migration 4 (thread kind, binding and lease; grant maps) migration 4 is idempotent: run twice on one store, it adds each column once; and 26 more |
| 130 | `G2:migration-backfill` | migration 4 gives every stored lane kind `claim` | 3 (3 room-legacy) | `declared-fd6f00b6.test.ts`: migration 4 (thread kind, binding and lease; grant maps) a room stored at version 1, reopened: the columns are added, every lane gets its kind, binding and lease stay null, and reopening again changes nothing; `declared-fd6f00b6.test.ts`: migration 4 (thread kind, binding and lease; grant maps) a room stored at version 2, reopened: the columns are added, every lane gets its kind, binding and lease stay null, and reopening again changes nothing; and 1 more |
| 131 | `G2:admin-implicit` | `admin` is not implicit in `who.roles` | 231 (2 policy, 2 room-node, 22 room-legacy, 205 room-declared) | `vocabulary.test.ts`: a v2 document's vocabulary is its declarations (R-DECL-11, R-DECL-17) who.roles decides, with admin implicit; renew keeps the legacy table; an undeclared kind is not signable here; `vocabulary.test.ts`: a v2 document's vocabulary is its declarations (R-DECL-11, R-DECL-17) a grant names renew if the role may sign it, and the declared kinds the role may sign whose who.delegable is not false; and 229 more |
| 132 | `G2:delegable` | `who.delegable: false` is ignored | 2 (1 policy, 1 room-legacy) | `vocabulary.test.ts`: a v2 document's vocabulary is its declarations (R-DECL-11, R-DECL-17) a grant names renew if the role may sign it, and the declared kinds the role may sign whose who.delegable is not false; `declared-fd6f00b6.test.ts`: grants carry the bindings their grantor signed (R-DECL-17) the grantor's role and who.delegable bound the map; a grant expanded before a kind was added does not cover it |
| 133 | `G2:declared-steps` | a declared act's steps are always its `thread` target's | 398 (1 policy, 20 room-legacy, 377 room-declared) | `vocabulary.test.ts`: a v2 document's vocabulary is its declarations (R-DECL-11, R-DECL-17) steps come from the declaration's targets, by the target's shape; `declared-fd6f00b6.test.ts`: declared acts stage 2: one vocabulary per document (R-DECL-1) a v2 room admits the code-review acts with their bindings; a thread records its kind, opening binding and lease length (R-DECL-6); and 396 more |
| 134 | `G2:kinds-of` | a `v2` document's kinds leave out the platform kinds | 2 (1 policy, 1 room-declared) | `vocabulary.test.ts`: a v2 document's vocabulary is its declarations (R-DECL-11, R-DECL-17) its kinds are the declared ones and the platform kinds; and 1 more |
| 135 | `G2:legacy-kinds` | the legacy kinds leave out `renew` | 21 (1 policy, 1 room-node, 20 room-legacy, 1 room-declared) | `vocabulary.test.ts`: the legacy vocabulary, read from its frozen description (R-DECL-1) its kinds, role table, delegable kinds and roster ops are ARTROOM_LEGACY_V1's, not copies; `declared-equivalence.test.ts`: the code-review declarations judge envelopes and targets as the legacy vocabulary does (step 1) a v2 room: a kind of the grammar passes step 1 whatever it is; v: 2 needs a binding; a platform kind is v: 1; recover targets follow the op; and 19 more |
| 136 | `G2:legacy-roles` | the legacy role table lets a checker sign only `check` and `roster` | 5 (2 policy, 2 room-node, 1 room-legacy) | `vocabulary.test.ts`: the legacy vocabulary, read from its frozen description (R-DECL-1) its kinds, role table, delegable kinds and roster ops are ARTROOM_LEGACY_V1's, not copies; `vocabulary.test.ts`: the legacy vocabulary, read from its frozen description (R-DECL-1) roles and grants are the legacy table's; and 3 more |

### Gates

Run under bash at `b0c280b9`, the merge of main `a42c4d83`, serially, with exit codes checked. The head for review adds this section, the conversions list and the removal of one blank line at the end of a test support file. The gates were run again at that head, and the review request states the result.

| Gate | Exit | Result |
|---|---|---|
| `npm ci` (root) | 0 | installed |
| `npm run typecheck` (root) | 0 | every workspace |
| `npm test` (root) | 0 | 3,240 passed, 49 skipped |
| `git diff --check origin/main` | 2 at `b0c280b9`, then 0 | at `b0c280b9` it reported one blank line at the end of `packages/room/test/workerd/declared-support.ts`; the next commit removes that line and the check is clean |

Per package, in the order root `npm test` runs them (node, then workerd where a package has both): checkers 43; cli 162; client 88 and 2; git 340; log 198 and 193; mcp 73 and 5; policy 313 and 311 (+2 skipped); room 258 node, 580 legacy workerd, 533 declared workerd (+47 not run); ui 141.

Main `a04c774b` had 2,626 passed and 2 skipped (review `daba6bca`), and `a42c4d83` adds only notes. The difference is this stage's: policy +10 node and +10 workerd (`vocabulary.test.ts`); room +21 node (`declared-equivalence.test.ts`), +40 legacy workerd (`declared-fd6f00b6.test.ts`, 39, and `declared-rows-fd6f00b6.test.ts`, 1), and the whole declared run, 533 passed and 47 not run. Skipped tests are counted as vitest reports them: the declared run's 47, and policy's 2 node-only tests in workerd.

### Not changed here

`packages/log`, the client, MCP, CLI, checkers and UI packages, `docs/protocol.md`, the design note and `examples/` are unchanged. The Worker entry, wrangler configuration and deployed spike are unchanged. `LICENSE`, `NOTICE` and `AGENTS.md` are untouched.

## Declared acts stage 3 (request 1e8fee4b)

Status on 2026-10-04: open. The latest review, at `947fb909`, requested changes: complete carry accounting is owed and stays owed under this request. The verifier as delivered is under review as a bounded release of its own (request `42342e35`, below). All of it is on the integration branch `request/test-overhead`; nothing has landed on main. The line below is the earlier status, kept as history.

Earlier status: implemented, pending review. Gitseq request `1e8fee4b` (planner to builder), stage 3 of 7 in section 8.5 of [notes/2026-10-02-declared-acts.md](../notes/2026-10-02-declared-acts.md), approved as design in review `1808ae17`, as clarified by the planner's assert `869d9aad` in answer to the checker's request `41892cb2`. Branch `request/decl-stage3`, with main `a04c774b` merged. The head for review is the commit that carries this section. Nothing was pushed or deployed, and no Cloudflare credential was used.

This branch changes `packages/log` and this file, and nothing else.

### State at the integration head (written after the rest of this section)

Stage 3 is now reviewed on `request/test-overhead`, the integration branch (assert `dae9a1f3`), where it is composed with stage 2. The branch `request/decl-stage3` stays at `5449d19c`. Read this subsection first. Below it, "Mutation table" and the test names describe a layout that request `ecbc722a` replaced; "Prerequisite and composition" is done: the head contains stage 2, and the Room test that publishes and verifies a `v2` session runs.

**Where each part is reviewed.** `packages/log` and the two notes are reviewed under this request. The changes to `packages/room/src/core.ts` described below are stage 2's source and are reviewed under stage 2 (request `fd6f00b6`, review request `5612131b` at `39430e23`). Each lane has its review request at a head of its own on this branch; the source of `packages/log` has not changed since `26872bac`.

**Not complete.** Condition 2 asks verify to detect omitted, extra and substituted evaluation calls. For carry judgments it now does so in part. Complete accounting needs the Room to record each carry pass, which is a contract amendment. The design is [notes/2026-10-03-carry-accounting.md](../notes/2026-10-03-carry-accounting.md). The planner has said it stays owed under this request.

**Repaired since `5449d19c`**, each from a checker finding:

| Finding | What was wrong | Repair | Witness in `packages/log/test` |
|---|---|---|---|
| `c666e41e` (3): a recorded recover refusal failed replay | Verify judged `recover` by the legacy role table's entry for `recover`, which only an admin has. The Room judges it by the legacy act the op stands for, so a member's `recover` with op `open` is recorded as an `admin-required` refusal | `roster.ts` judges the op's legacy act. `verify.ts` accepts a `recover` act only from an admin's own key | `declared-stage3.test.ts`: "a recover op is judged by the role table ..." |
| `c666e41e` (4): a check kind of another name could not be carried | Verify looked for the literal kind `check` | It records each accepted act that ran the check step under the vocabulary at its own seq | `declared-stage3.test.ts`: "a check-carried event names an earlier act ..." |
| `8d5fe5c2`: a whole carry event removed, with the land input changed to match, verified | Verify replayed the events it was given and did not ask what was missing | Rule 1: at `land-evaluated`, every blocking obligation is met in the fold, else `decision-missing` naming the check that was owed a judgment, or `guard-failed` naming the obligation. Rule 2: at a carry, every newer passing check the pass could see already has its judgment, else `decision-missing` | `declared-obligations.test.ts`: "a reservation rests only on what the log shows ...", with the checker's two forged logs |

**A change to the Room, from the same review.** The checker and the planner saw in the source (`060828bb`) that the Room builds a land input, awaits the rules, and then seals `land-evaluated`. An act admitted during that wait comes before the event in the log, so the event could record an input that the log at its position no longer gives. The same held for `check-carried`. This was reproduced: with the checker's key revoked during a carry evaluation, the Room sealed "carried" after the revocation. Now `packages/room/src/core.ts` reads the facts again in the sealing transaction. If they moved, it seals nothing and judges again. Witnesses in `packages/room/test/workerd/acts.test.ts`: "a land evaluation is sealed only for the state at its own place in the log ...", and "a carry judgment is sealed only on the facts at its own place in the log ...". `core.ts` is a stage 2 file, so this delta is also for the stage 2 reviewer.

**Two more repairs in the Room, from the review of that delta** (changes requested, `a7688a71`). Both were found by the checker with a failing run:

| Finding | What was wrong | Repair | Witness in `acts.test.ts` |
|---|---|---|---|
| `7dabf862` (P1) | A kept land evaluation was looked up by operation and input digest alone. After an activation that changed only a land rule, the input was the same, the old passing answer was used, and the landing could reserve under a policy that blocks it. This was in the Room before stage 2's first approval | The kept evaluation records the policy version that made it, and is used only under that version. A row kept before this names none and is never used | "a kept land evaluation is used only under the policy version that made it ..." |
| `29551590` (P1) | A held carry judgment was sealed after a recomputation had removed its obligation. Verify, reading the version's obligations at that position, failed the honest `v2` log with `decision-extra` | In the sealing transaction the Room reads the version's obligations again. If another policy version is active, or the obligation or its checker is no longer the version's, the pass ends and seals nothing more | "a carry pass ends when its obligation is gone ..."; "an activation that overtakes a carry pass ..." |

The first two of those tests also run under the `v2` declarations in the declared witness set, where the published log is verified. Three controls distinguish: the policy match of the kept evaluation; the end of the pass, in the legacy run and under `v2`. Stage 2's approval `25bede37` was withdrawn by the checker (`290b3e87`) because the first defect was already present at that head.

I then read the rest of the Room's landing code for the same pattern, a read, an await and a seal. The recomputation of obligations runs in the Room's one queue with admission (`RoomCore.serial`), so no act is admitted between its reads and its seal. Readiness and the carry pass do not run in that queue, which is why they need the fences. After its awaits, readiness uses the policy it read at the start to list obligations and owe jobs; a guard that started it again under a newer version changed no outcome in a test, because the carry pass ends first and the engine prepares the operation again, so it was not added.

**The log's test simulator** sealed `land-evaluated` with an obligation open, which the Room never does. It now waits as the Room does, and two fixtures were regenerated (`declared-carry.json`, `declared-snapshot.json`). Real Room logs were unaffected: the Room and CLI suites, which verify logs the Room wrote, pass unchanged.

**Controls**, each one change with `scripts/control.mjs`, each "distinguishes": the recover role lookup; the check-step lookup; the admin-only acceptance of `recover`; Rule 1 as a whole; Rule 1's owed-carry branch; Rule 2; the land fence; the carry fence; the policy match of a kept land evaluation; the end of a carry pass.

**The legacy recovery replay, its negative half** (review `6263fdec`). The acceptance case asks that a verifier changed to judge the `v1`-era entries under the `v2` declarations fails. The test showed this for the judging function only. `packages/log/test/declared-legacy-negative.test.ts` now runs the whole shipped verifier over the whole published log with one thing replaced in its module graph, the vocabulary a `v1` document means, and it fails at the first `v1`-era envelope, entry 2, with `binding-stale`. No seam was added to the source for this.

**Still open in this request.** Complete carry accounting, above. The planner's review of the proposed amendment asked for changes A to F (`85032553`); the revision is owed, then the build with the `prepared` event.

### Prerequisite and composition (assert 869d9aad)

- **Stage 3 owns all of `packages/log`** (point 1). Stage 2's condition 1 named two fixed lists there, in `decode.ts` and `roster.ts`. They are delivered here: both files now read the legacy vocabulary's kinds, role table, delegable kinds and roster ops from its one frozen description, the contract's `ARTROOM_LEGACY_V1`. Stage 2's branch no longer touches `packages/log`.
- **This head does not contain stage 2** (point 2). It is the stage 3 work on main `a04c774b`. The head that is reviewed for landing must contain reviewed stage 2. After stage 2 lands, the builder merges main into this branch, reconciles `packages/log`'s imports with the shared policy vocabulary exports where that still applies, and turns on the seven Room tests listed as `NEEDS_STAGE_3_VERIFY` in `packages/room/vitest.workers.declared.config.ts` on the stage 2 branch. Those seven tests are not shown passing at this head: the file that lists them is not on this branch.
- **A private trial of the composition, not gate evidence.** In a scratch worktree the builder merged stage 2's head `2cd97b88` with this work and turned the seven tests on. It found one disagreement between the two stages, which is stage 2's to settle. Under a `v2` document this verifier builds the policy lane with the thread's kind (`DeclaredPolicyLane`; R-EVAL-3 as amended in protocol section 33.3; note section 8.1, "`PolicyLane` gains the kind"). Stage 2's Room does not add it (`RoomCore.policyLane`). So every `v2` log the stage 2 Room writes fails here at its first policy call: `context-mismatch`, "they differ at input.lane.kind". With that one field added to the Room's lane input under a `v2` document, the Room's whole suite passed in the trial: the declared run 540 passed and 39 skipped (stage 2's 533 and the seven), the legacy run 579. The finding was passed to the stage 2 lane. The trial is the only place the real Room's `v2` logs have met this verifier; the fixtures here come from a simulator.

### What was built

- **`decode.ts`.** Kinds decode by the R-SIG-4 grammar, in envelope `v: 1` or, with a binding, `v: 2`. Grant maps, `recover` ops, and `prepared` and `reservation-ended` events decode. A retained `v2` document and `artroom-checker-v2` configuration decode. A document that names a steps version or evaluator profile the verifier does not carry is `Unsupported`, not malformed.
- **`declared.ts`.** Kind, binding, target and body are judged under the document in force at each entry's seq: the legacy vocabulary under a `v1` document; under a `v2` document the declarations and the steps version it names (`STEPS_V1`, with each step's own fields), `recover` by its ops, and grants by their shape.
- **`roster.ts`.** Who may sign is judged under the vocabulary in force: the legacy table, or `who.roles` with `admin` implicit. Grants made under a `v2` document carry signed maps, checked at the grant and at each use. It now also answers what evidence validity asks: a key's revocation.
- **`fold.ts`.** The thread fold: threads, holders, lease generations, scopes, versions, landing operations, `prepared` events. New in this delivery: each version keeps the obligations its `require` call made, the policy version that made them, and the verdicts carried onto it; each accepted review and check is an evidence row with the facts fixed at its admission (the member's teams, whether the member was an author, its flags, and for a check the integration it counts for); each `check-carried` event is a judgement, and a carry when it carried.
- **`obligations.ts`** (new). Verify's own port of the Room's obligation rules: the one qualification rule, evidence validity after a revocation, the sole-admin flag, the status of a review obligation (latest qualifying approvals here, then carried verdicts, against `count`) and of a check obligation (a passing check on the integration, or a carry onto it under the policy in force), advisory obligations, the land input's `obligations` and `reviews`, a notify directory's `reviewers`, and the verdicts a `carry` call is owed for.
- **`calls.ts`.** A call session. Verify makes the calls admission had to make, in order, on one act meter, with the evaluator's own functions, and compares each with the recorded call in its place: `decision-missing`, `context-mismatch`, `policy-decision-mismatch`, and `decision-extra` for a recorded call left over. Verify decides which calls are owed and where admission stops; the evaluator decides which rules apply inside a call.
- **`verify.ts`.** The wiring. For an act: `refuse`; for a version `require`, then one `carry` call for each earlier verdict that is owed one, then `land` when the act also lands. For a land act: `refuse`, then `land` at stage `land`. For `land-evaluated`: `land` at stage `reservation`, with checks counted for the event's integration. For `obligations-recomputed`: `require` by the proposer, then a `carry` call for each carried verdict whose obligation still holds, with `policy.same` false; a failed `require` keeps the earlier obligations. For `notified`: `notify`, with the reviewers as they stood when the act was sealed. For `check-carried`: the judgement must be owed, its input and facts are rebuilt, and its recorded outcome is the evaluator's. Under a `v1` document the same calls are made and not compared, so the fold follows a room across its first `v2` activation; a `v1` entry is judged by replay alone, as before, and reports as before.
- **`cli.ts`, `gitcli.ts`.** `artroom verify` fetches the room's pinned version heads, prints proof limits, and exits 1 when the log names a version the verifier does not carry.

### Conditions

| Condition of request 1e8fee4b | Code | Tests |
|---|---|---|
| (1) Decoding accepts any kind of the grammar. Kind, body and who are judged under `D(s)` and the steps version the retained document names, with `artroom-legacy-v1` for `v1` entries and `v: 1` envelopes. `steps-unsupported` and `profile-unsupported` are the verifier's own limits | `decode.ts`, `declared.ts`, `roster.ts`, `verify.ts` | `declared-stage3.test.ts`: "condition 1: decoding by grammar" (grammar kinds, the malformed shapes); "condition 1: decoding by grammar, and kind, binding, body and who under D(s)" (the activating log, `kind-undeclared` twice, `binding-stale` twice, the legacy rule three times, bodies and targets, `recover` ops, grants, `who.roles`); "condition 1: the steps version and profile named by the retained document" (two steps versions, `steps-unsupported`, `profile-unsupported`) |
| (2) Verify derives the required evaluation calls per step from the evaluator's own code, rebuilds each call's inputs and budget progression from the folded state, and reports `decision-missing`, `decision-extra` and `context-mismatch`. The prepared event is checked where present | `calls.ts`, `fold.ts`, `obligations.ts`, `verify.ts` | `declared-stage3.test.ts`: "condition 2: required evaluation calls, derived and rebuilt from the fold" and its two inner groups. `declared-obligations.test.ts`: all of it. See "What is still the retained context's" below: for those fields, in those cases, condition 2 is not met and stays open |
| (3) Fixtures | `test/fixtures/`, `scripts/` | The list below |
| (4) Every new guard has a named red mutation. No existing test is edited | The `// V:<id>` markers | The mutation table below. `git diff --stat a04c774b -- packages/log/test` lists 17 files, every one of them added |
| (5) Root, log and policy gates green at the exact head. Report here. One exact head | | The gates table below |

### Fixtures (condition 3)

Each is a room-signed log. `scripts/declared-fixtures.ts` writes ten of them with the simulator in `test/support/declared-room.ts`; `scripts/v1-fixture.ts` wrote the eleventh once, at `815e3383`, before verify changed. Forged variants are made from them in the tests and resealed with the room key.

| Fixture | What it holds | Condition 3 item |
|---|---|---|
| `declared-activates-kind` | A `v2` room whose landed policy change activates a document adding the kind `standup` and changing `note`'s meaning; refuse, require, land and notify calls; the repository's objects | A fresh-clone replay of a log whose document activates a kind (also through `artroom verify` on a real repository, `declared-stage3.node.test.ts`); `kind-undeclared` on a forged entry; `binding-stale` on a forged entry; the forged logs that delete a refuse, require, land or notify call and substitute a false context |
| `v1-log-815e3383` | A `v1` log and the report main `815e3383`'s verifier gave it | An old `v1` log verifying unchanged |
| `declared-two-steps` | Two steps versions, the second a test-only name | A log spanning two steps versions |
| `declared-legacy-recovery` | A `v1` room locked by its policy: the recovery claim, propose, flagged approval, land, outcome, the activation of a `v2` document, and the release as a `recover` op | The whole legacy recovery sequence |
| `declared-refusals` | Recorded refusals at each place admission stops, and a blocked recomputation | Where admission stops |
| `declared-profile` | A document naming a profile no verifier carries | `profile-unsupported` |
| `declared-check-prepared` | A check whose integration a `prepared` event names | The prepared event, where present |
| `declared-grants` | Grants across the first `v2` activation | R-DECL-17 in verify |
| `declared-carry` | 116 entries, six threads: a verdict carried to a version with the same tree, judged again at two recomputations, replaced by its reviewer's objection; checks counted by integration, carried by `check-carried` events and judged again after an activation; an advisory, a volatile and a failing check; two checkers with one configuration digest; a verdict that does not carry; an objection that is owed no call; an author's own approval; a policy that changes who qualifies; a revoked checker key; a sole admin's self-approval and a second admin; a recomputation whose `require` fails | The forged logs for the land input's obligations and reviews, the notify directory's reviewers, and each carry call owed, omitted, extra or falsified (assert 869d9aad, point 3) |
| `declared-carry-plain` | A verdict carried with no carry rule, so with no recorded decision; then a verdict that is not carried because the new version has no obligation for it | A carry derived with nothing recorded; undecided carries without Git objects |
| `declared-snapshot` | A scoped checker: a `prepared` event records the snapshot commit for a landing's integration; the same with no `prepared` event; a version with no check obligation | A filtered check's integration; a judgement with no obligation |

The simulator admits acts as the Room's admission does. Its obligation rules are a port of the Room's `obligations.ts` in `test/support/room-obligations.ts`, kept apart from verify's own `src/obligations.ts`, so the fixtures are not made by the code they test. Extending the simulator left the seven fixtures of the earlier commits byte for byte the same.

### Stage 6 work brought forward, and what stage 6 still owns

Brought forward here, as condition 2 asks and assert 869d9aad point 3 confirms: the thread fold; the obligation and evidence fold; the required calls for `refuse`, `require`, `carry`, `land` and `notify`, with every input rebuilt and the budget carried from call to call; the comparison of a version's changed paths with Git objects where they are present, and the `git-unwitnessed` limit where they are not; the check against `prepared` events where they are present; and a fixture that spans two steps versions.

Stage 6 still owns (assert 869d9aad, point 4), and nothing here stands in for it:

- **Derived effects.** The fold takes receipt effects as recorded. The `obligations` effects of receipts, and the `obligations` and `reopened` lists of an `obligations-recomputed` event, are not compared with the statuses verify derives (`effect-mismatch`). Lane, lease and landing transitions are not re-derived.
- **The first refusal.** Whether the platform guard behind a recorded refusal really failed, and whether an accepted act passed its platform guards (`refusal-mismatch`, `guard-failed`): for example a review by a member who qualifies for no obligation, a check with a wrong binding, or a land with an open review obligation. Verify re-judges every piece of evidence when it counts obligations, so such a review or check meets nothing here; it is not yet a failure in itself.
- **Witness and prepared-event requirements.** `witness-missing` and `git-mismatch` as named failures. Today a context that hides a change Git shows fails as `context-mismatch`.
- **Streaming and bounds,** and the ordering of clock events such as `lease-expired`.
- **The adversarial fixtures of note section 4.7** and their honest controls, as a set.
- **Retained steps versions** and the cases of note section 3.9: a deployment that adds a steps version with no activation, and an exact retry across the move.
- **The real Room, to a published log, to a fresh clone.** It waits for stage 4, which emits `prepared` and `reservation-ended`.

### What is still the retained context's

Assert 869d9aad, point 3, named four things the earlier commits of this branch took from the context the room retained. Each is now rebuilt from the fold:

| Field | Now | Tests |
|---|---|---|
| A land input's `obligations` | Rebuilt: the version's obligations, each blocking one, and whether the evidence meets it, for the integration asked about | "a land input's obligations are rebuilt", 13 forged contexts |
| A land input's `reviews` | Rebuilt: each qualifying reviewer's latest verdict, here or carried, by act ID | "a land input's reviews are rebuilt", 6 forged contexts |
| A notify directory's `reviewers` | Rebuilt: the thread's latest version's qualifying reviewers when the act was sealed | "a notify directory's reviewers are rebuilt", 6 forged contexts |
| Each carry call's evidence, policy comparison and facts, and which verdicts one is owed for | Rebuilt and derived: an omitted call is `decision-missing`, a call for evidence owed none is `decision-extra`, a falsified field is `context-mismatch` | "carry calls for verdicts are derived, and their inputs rebuilt", 17 tests; "check-carried events are rebuilt", 9 tests |

What the log does not carry is still taken from the retained context of the matching call. Each case is reported in `VerifyReport.limits` as `git-unwitnessed`, with the entry and what was taken. For these fields, in these cases, condition 2 is not met:

1. **The paths changed since an earlier verdict's head** (`changedSince`), when the Git objects of the two heads are absent. They decide whether the verdict carries. With a recorded carry call for the verdict, the paths are that call's and everything else in it is rebuilt. With none, whether the verdict carried on the platform's conditions alone is undecided: the version keeps it as undecided, and a later land input takes from the retained context only whether the obligation is met and whether the verdict is listed; the listed verdict's content is still the fold's. Next change: stage 6's version witness (the receipt of a version names its witness's digest, protocol section 33.3 on R-LOG-6), extended to the changes since each carried verdict; or fetching the heads.
2. **A version's base and changed paths**, when the Git objects are absent. This is the limit the earlier commits already reported. Same next change.
3. **The integration a check on a filtered snapshot counts for**, when no `prepared` event names its snapshot commit. A land input for one integration then takes that obligation's `met` from the retained context, if no other evidence meets it. Next change: stage 4, when the Room seals `prepared` events; verify can then require one (`witness-missing`).
4. **A check carry's new tree and filtered snapshot**, when no `prepared` event names the integration and, for the tree, its Git commit is absent. Next change: stage 4, as above.
5. **Whether a `check-carried` judgement was owed.** The Room judges carrying a check when a landing is prepared, which the log does not time, so an omitted judgement cannot be derived. A judgement that is recorded is checked: it must name a landing of the version, a check obligation the version has, an earlier passing check of that checker on another integration, and must not repeat. A carry that is not recorded meets no obligation, so leaving one out gains nothing. No next change is proposed; it is stated in the report's `cannotProve`.
6. **The admin obligation of a version no recorded context names.** Its changed paths are then unknown, and whether it has `obl_admin-approval` is taken from its receipt's `obligations` effect, as recorded. Next change: stage 6's derived effects and version witness.
7. **Entries under a `v1` document.** Their calls are made to keep the fold, and not compared: R-DECL-1 keeps the legacy judgement as it was.

### Choices where the design left room

1. **One derivation for both vocabularies.** Under a `v1` document verify makes the same calls and compares nothing. The alternative, taking a `v1` version's obligations from its receipt, cannot work: a receipt lists obligation IDs, not who may meet them.
2. **The admin obligation is decided in one place,** from the version's witness. The `require` call lists it too when it knows the paths; that listing is ignored.
3. **Undecided carries are kept as undecided,** not guessed. A later carry call for such a verdict is accepted if recorded and not required if absent.
4. **`git-unwitnessed` is the one proof limit the contract names** (`VerifyProofLimit`). It is used for the missing `prepared` event too, with a detail that says so. Whether the contract should name a second limit is a question for the planner; no contract file is changed here.
5. **A `prepared` event binds a check on a filtered snapshot by its snapshot commit or by its integration.** The earlier commit accepted only the second, which would have refused a scoped check that names the snapshot commit, as R-CARRY-15 lets it.
6. **A recorded context of another kind is no context for a call.** The rebuilt digest then fails to match it. The earlier separate guard for this is removed: nothing could tell it from the digest comparison.
7. **The legacy lists come from the contract's `ARTROOM_LEGACY_V1`,** not from stage 2's policy exports, so stage 3 does not depend on stage 2's code. Both read the same frozen data.
8. **Forged calls are made consistent.** `forgeCall` runs the evaluator on the false context and records its decisions, so replaying the record finds nothing and only the rebuilt context shows the forgery.
9. **Five guards have two mutants.** Removing each of these guards makes verify throw on the state the guard excludes. That mutant is red by the exception. A second mutant keeps the guard firing with the wrong answer, and is red by a test's own assertion.

### Mutation table

Each mutant was applied alone by `/private/tmp/claude-501/-Users-hughpyle-play-artroom/af183959-fa1e-41f2-aa7f-1fb81256fb3a/scratchpad/mut3/run.py`, after the code was committed (`e969587a`). The runner checks that the mutant's text occurs exactly once, writes the mutated file, runs `npx vitest run --config vitest.config.ts test/declared-stage3.test.ts test/declared-stage3.node.test.ts test/declared-obligations.test.ts` in `packages/log` (node), records the failing tests and how each failed from the JSON reporter, and writes the file's original bytes back in a `finally`. It never runs `git checkout`. `git status --porcelain` was empty afterwards. A guard written as one `if` statement on its marked line gets the mutation "its condition never holds". The others are written out in `mutants.py` beside the runner, and described in the table.

**97 mutants over 92 guards, all red.** None is red by a timeout or by a test file that failed to load. 92 are red by a test's own assertion. Five are red only by an exception that verify throws once the guard is gone (`V:carried-obligation`, `V:d-steps`, `V:grant-declared`, `V:target`, `V:unsupported`); each of those guards has a second mutant, marked `#2`, that is red by assertion.

The first run, 93 mutants at `013ed88d`, left four survivors. What was done about each:

- `V:admin-obligation`: the `require` call's own listing of the admin obligation made the guard redundant. The obligation is now decided in one place (choice 2).
- `V:check-binding`: no fixture had two checkers with the same configuration digest, so the configuration check hid it. The carry fixture's later policies add one, with a test.
- `V:context-kind`: the digest comparison reported the same failure. The guard was removed (choice 6).
- `V:d-policy-v2`: the validation at activation reported the same failure. A test now names the guard by its own detail.

| # | Mutant | File | Mutation | Tests turned red |
|---|---|---|---|---|
| 1 | `V:accepted-refused` | `verify.ts` | an act accepted although a rule refuses it passes | condition 2: required evaluation calls, derived and rebuilt from the fold where admission stopped: recorded refusals guard-failed: an act accepted although a refuse rule refuses it |
| 2 | `V:activation-valid` | `verify.ts` | an activated `v2` document is not validated in the room's context | condition 2: required evaluation calls, derived and rebuilt from the fold malformed: an activated v2 document whose threads name a kind that never opened a thread here |
| 3 | `V:admin-obligation` | `obligations.ts` | the platform's admin obligation is never derived | honest logs verify, with every input rebuilt from the fold declared-carry verifies on a fresh replay with the Git objects, with no proof limit; honest logs verify, with every input rebuilt from the fold declared-carry verifies without the Git objects; each input it could not rebuild is reported git-unwitnessed; and 29 more |
| 4 | `V:advisory` | `obligations.ts` | an advisory check obligation is listed as blocking | honest logs verify, with every input rebuilt from the fold declared-carry verifies on a fresh replay with the Git objects, with no proof limit; honest logs verify, with every input rebuilt from the fold declared-carry verifies without the Git objects; each input it could not rebuild is reported git-unwitnessed; and 33 more |
| 5 | `V:because` | `declared.ts` | the guard's condition never holds | condition 1: decoding by grammar, and kind, binding, body and who under D(s) body and target under the declaration in force (body-invalid) standup: a because that is not a list of reasons |
| 6 | `V:binding` | `declared.ts` | the guard's condition never holds | condition 1: decoding by grammar, and kind, binding, body and who under D(s) binding-stale: a note signed under the earlier document's note binding, sealed after its meaning changed; condition 1: decoding by grammar, and kind, binding, body and who under D(s) binding-stale: a v: 1 envelope of a declared kind under a v2 document; and 2 more |
| 7 | `V:body-closed` | `declared.ts` | the guard's condition never holds | condition 1: decoding by grammar, and kind, binding, body and who under D(s) body and target under the declaration in force (body-invalid) standup: a field the declaration does not have |
| 8 | `V:body-object` | `declared.ts` | the guard's condition never holds | condition 1: decoding by grammar, and kind, binding, body and who under D(s) body and target under the declaration in force (body-invalid) standup: a body that is not an object |
| 9 | `V:canonical-snapshot` | `verify.ts` | the guard's condition never holds | honest logs verify, with every input rebuilt from the fold declared-snapshot: a check on a snapshot commit counts for the integration a prepared event records it for; with no prepared event that is reported; a check on a filtered snapshot (R-CARRY-15, R-DECL-20) context-mismatch: with the prepared event, a land context that says the check does not count; and 1 more |
| 10 | `V:carried-obligation` | `verify.ts` | the guard's condition never holds; verify then throws on the state the guard excludes | a check-carried judgement for an obligation the version does not have (declared-snapshot, third thread) decision-extra: a judgement that carries the first version's check to the second, which has no such obligation |
| 11 | `V:carried-obligation#2` | `verify.ts` | the guard accepts the judgement instead of failing it | a check-carried judgement for an obligation the version does not have (declared-snapshot, third thread) decision-extra: a judgement that carries the first version's check to the second, which has no such obligation |
| 12 | `V:carried-once` | `verify.ts` | the guard's condition never holds | check-carried events are rebuilt (R-CARRY-6 to R-CARRY-14) decision-extra: the same judgement recorded twice for one check, integration and policy |
| 13 | `V:carried-op` | `verify.ts` | the guard's condition never holds | check-carried events are rebuilt (R-CARRY-6 to R-CARRY-14) decision-extra: a judgement naming a landing of another version |
| 14 | `V:carried-other-integration` | `verify.ts` | the guard's condition never holds | check-carried events are rebuilt (R-CARRY-6 to R-CARRY-14) decision-extra: a judgement for a check that already counts for the integration |
| 15 | `V:carried-outcome` | `verify.ts` | the guard's condition never holds | check-carried events are rebuilt (R-CARRY-6 to R-CARRY-14) carried-outcome-mismatch: the recorded outcome is not the one the evaluator gives: a volatile check recorded as carried |
| 16 | `V:carried-passing` | `verify.ts` | the guard's condition never holds | check-carried events are rebuilt (R-CARRY-6 to R-CARRY-14) decision-extra: a judgement for a failing check |
| 17 | `V:carried-replaced` | `obligations.ts` | the guard's condition never holds | honest logs verify, with every input rebuilt from the fold declared-carry verifies on a fresh replay with the Git objects, with no proof limit; honest logs verify, with every input rebuilt from the fold declared-carry verifies without the Git objects; each input it could not rebuild is reported git-unwitnessed; and 6 more |
| 18 | `V:carry-candidates` | `obligations.ts` | acts counted for check obligations are carry candidates too | honest logs verify, with every input rebuilt from the fold declared-carry verifies on a fresh replay with the Git objects, with no proof limit; honest logs verify, with every input rebuilt from the fold declared-snapshot: a check on a snapshot commit counts for the integration a prepared event records it for; with no prepared event that is reported; and 41 more |
| 19 | `V:carry-extra` | `calls.ts` | the guard's condition never holds | carry calls for verdicts are derived, and their inputs rebuilt (R-CARRY-1 to R-CARRY-5) decision-extra: a carry call recorded for a verdict whose reviewed scope changed, where the evaluator decides nothing |
| 20 | `V:carry-holds` | `verify.ts` | the guard's condition never holds | honest logs verify, with every input rebuilt from the fold declared-carry-plain: a verdict carried by the platform's conditions alone is derived, with no recorded decision; a verdict is carried only to obligations the new version has (declared-carry-plain, second thread) the honest log: the second version has no obligation, a later policy requires the review again, and the land input lists only the new approval; and 1 more |
| 21 | `V:carry-policy` | `obligations.ts` | a check carry counts under any policy version (the condition never holds) | honest logs verify, with every input rebuilt from the fold declared-carry verifies on a fresh replay with the Git objects, with no proof limit; honest logs verify, with every input rebuilt from the fold declared-carry verifies without the Git objects; each input it could not rebuild is reported git-unwitnessed; and 13 more |
| 22 | `V:check-binding` | `obligations.ts` | the guard's condition never holds | honest logs verify, with every input rebuilt from the fold declared-carry verifies on a fresh replay with the Git objects, with no proof limit; honest logs verify, with every input rebuilt from the fold declared-carry verifies without the Git objects; each input it could not rebuild is reported git-unwitnessed; and 9 more |
| 23 | `V:check-config` | `obligations.ts` | the guard's condition never holds | honest logs verify, with every input rebuilt from the fold declared-carry verifies on a fresh replay with the Git objects, with no proof limit; honest logs verify, with every input rebuilt from the fold declared-carry verifies without the Git objects; each input it could not rebuild is reported git-unwitnessed; and 13 more |
| 24 | `V:check-integration` | `obligations.ts` | a check counts for any integration | honest logs verify, with every input rebuilt from the fold declared-carry verifies on a fresh replay with the Git objects, with no proof limit; honest logs verify, with every input rebuilt from the fold declared-carry verifies without the Git objects; each input it could not rebuild is reported git-unwitnessed; and 29 more |
| 25 | `V:check-ok` | `obligations.ts` | a failing check counts | honest logs verify, with every input rebuilt from the fold declared-carry verifies on a fresh replay with the Git objects, with no proof limit; honest logs verify, with every input rebuilt from the fold declared-carry verifies without the Git objects; each input it could not rebuild is reported git-unwitnessed; and 15 more |
| 26 | `V:checker-format-v1` | `verify.ts` | a `v1` document's checker format is not checked | condition 2: required evaluation calls, derived and rebuilt from the fold malformed: a v1 document activated with an artroom-checker-v2 configuration |
| 27 | `V:context` | `calls.ts` | the guard's condition never holds | a land input's obligations are rebuilt (R-POL-6, R-OBL-1 to R-OBL-7) context-mismatch: a land act whose context says a check obligation is met, when no check on that integration meets it; a land input's obligations are rebuilt (R-POL-6, R-OBL-1 to R-OBL-7) context-mismatch: a land act whose context leaves an open obligation out; and 45 more |
| 28 | `V:d-binding` | `decode.ts` | the guard's condition never holds | condition 1: decoding by grammar (R-SIG-4 as amended, R-DECL-2, R-DECL-16) malformed: a v: 2 envelope without a binding; condition 1: decoding by grammar (R-SIG-4 as amended, R-DECL-2, R-DECL-16) malformed: a v: 2 envelope whose binding is not a digest |
| 29 | `V:d-binding-v1` | `decode.ts` | the guard's condition never holds | condition 1: decoding by grammar (R-SIG-4 as amended, R-DECL-2, R-DECL-16) malformed: a binding in a v: 1 envelope |
| 30 | `V:d-kind` | `decode.ts` | the guard's condition never holds | condition 1: decoding by grammar (R-SIG-4 as amended, R-DECL-2, R-DECL-16) malformed: a kind outside the grammar |
| 31 | `V:d-map-key` | `decode.ts` | the guard's condition never holds | condition 1: decoding by grammar (R-SIG-4 as amended, R-DECL-2, R-DECL-16) malformed: a grant map key outside the grammar |
| 32 | `V:d-map-kinds` | `decode.ts` | a `v2` grant's platform kinds are not checked | condition 1: decoding by grammar (R-SIG-4 as amended, R-DECL-2, R-DECL-16) malformed: a v2 grant naming a declared kind plainly |
| 33 | `V:d-map-value` | `decode.ts` | the guard's condition never holds | condition 1: decoding by grammar (R-SIG-4 as amended, R-DECL-2, R-DECL-16) malformed: a grant map value that is not a binding; condition 1: decoding by grammar (R-SIG-4 as amended, R-DECL-2, R-DECL-16) malformed: a session map value that is not a binding |
| 34 | `V:d-platform-v2` | `decode.ts` | the guard's condition never holds | condition 1: decoding by grammar (R-SIG-4 as amended, R-DECL-2, R-DECL-16) malformed: a platform kind in a v: 2 envelope |
| 35 | `V:d-policy-v2` | `decode.ts` | the guard's condition never holds | stage 3 guards whose failure another guard would also report: each is named by its own detail malformed: a retained v2 document that is not a policy document is named so where it is decoded |
| 36 | `V:d-prepared` | `decode.ts` | a `prepared` event's integration, base and tree are not decoded | condition 1: decoding by grammar (R-SIG-4 as amended, R-DECL-2, R-DECL-16) malformed: a prepared event without its integration |
| 37 | `V:d-prepared-owner` | `decode.ts` | a preview owner's generation is not decoded | condition 1: decoding by grammar (R-SIG-4 as amended, R-DECL-2, R-DECL-16) malformed: a prepared event whose owner names no generation |
| 38 | `V:d-profile` | `decode.ts` | the guard's condition never holds | condition 1: the steps version and profile named by the retained document profile-unsupported: a document naming a profile the verifier lacks stops at the first entry under it; not a failure |
| 39 | `V:d-recover-op` | `decode.ts` | the guard's condition never holds | condition 1: decoding by grammar (R-SIG-4 as amended, R-DECL-2, R-DECL-16) malformed: a recover op that is not one |
| 40 | `V:d-reservation` | `decode.ts` | a `reservation-ended` event's lane is not decoded | condition 1: decoding by grammar (R-SIG-4 as amended, R-DECL-2, R-DECL-16) malformed: a reservation-ended event without its lane |
| 41 | `V:d-session` | `decode.ts` | the guard's condition never holds | condition 1: decoding by grammar (R-SIG-4 as amended, R-DECL-2, R-DECL-16) malformed: a session map value that is not a binding |
| 42 | `V:d-steps` | `decode.ts` | the guard's condition never holds; verify then throws on the state the guard excludes | condition 1: the steps version and profile named by the retained document steps-unsupported: a verifier without the second version stops at the first entry that needs it; not a failure |
| 43 | `V:d-steps#2` | `decode.ts` | the guard names `profile-unsupported` instead | condition 1: the steps version and profile named by the retained document steps-unsupported: a verifier without the second version stops at the first entry that needs it; not a failure |
| 44 | `V:d-v` | `decode.ts` | the guard's condition never holds | condition 1: decoding by grammar (R-SIG-4 as amended, R-DECL-2, R-DECL-16) malformed: an envelope format other than 1 or 2 |
| 45 | `V:declared-kind` | `declared.ts` | the guard's condition never holds | condition 1: decoding by grammar, and kind, binding, body and who under D(s) kind-undeclared: a forged entry of a kind no document declares; condition 1: decoding by grammar, and kind, binding, body and who under D(s) kind-undeclared: an act of the new kind sealed before the activation that declares it |
| 46 | `V:declared-required` | `declared.ts` | the guard's condition never holds | condition 1: decoding by grammar, and kind, binding, body and who under D(s) body and target under the declaration in force (body-invalid) standup: a declared field missing |
| 47 | `V:declared-type` | `declared.ts` | the guard's condition never holds | condition 1: decoding by grammar, and kind, binding, body and who under D(s) body and target under the declaration in force (body-invalid) standup: a declared field over its limit |
| 48 | `V:delegation-covers` | `roster.ts` | the coverage check is skipped: any delegation covers the act | condition 1: decoding by grammar, and kind, binding, body and who under D(s) grants carry the bindings their grantor signed (R-DECL-17) a v1-era grant covers no declared kind after the first v2 activation; condition 1: decoding by grammar, and kind, binding, body and who under D(s) grants carry the bindings their grantor signed (R-DECL-17) a declared kind the grant's map does not name; and 1 more |
| 49 | `V:evidence-author` | `verify.ts` | no reviewer or checker is recorded as an author | honest logs verify, with every input rebuilt from the fold declared-carry verifies on a fresh replay with the Git objects, with no proof limit; honest logs verify, with every input rebuilt from the fold declared-carry verifies without the Git objects; each input it could not rebuild is reported git-unwitnessed; and 17 more |
| 50 | `V:evidence-revoked` | `obligations.ts` | the guard's condition never holds | honest logs verify, with every input rebuilt from the fold declared-carry verifies on a fresh replay with the Git objects, with no proof limit; honest logs verify, with every input rebuilt from the fold declared-carry verifies without the Git objects; each input it could not rebuild is reported git-unwitnessed; and 4 more |
| 51 | `V:extra` | `calls.ts` | a recorded call left over is accepted | carry calls for verdicts are derived, and their inputs rebuilt (R-CARRY-1 to R-CARRY-5) decision-extra: a carry call recorded for an objection, which is owed none; carry calls for verdicts are derived, and their inputs rebuilt (R-CARRY-1 to R-CARRY-5) decision-extra: the owed carry call recorded twice; and 4 more |
| 52 | `V:git-witness` | `verify.ts` | the retained context's changes are taken even when Git shows more | condition 2: required evaluation calls, derived and rebuilt from the fold context-mismatch: a version's contexts replaced by plausible false ones, leaving out .artroom/policy.json, digests recomputed |
| 53 | `V:grant-binding` | `roster.ts` | a grant covers the kind whatever binding it names | condition 1: decoding by grammar, and kind, binding, body and who under D(s) grants carry the bindings their grantor signed (R-DECL-17) an act under a grant made for an earlier meaning of its kind |
| 54 | `V:grant-declared` | `roster.ts` | the guard's condition never holds; verify then throws on the state the guard excludes | condition 1: decoding by grammar, and kind, binding, body and who under D(s) grants carry the bindings their grantor signed (R-DECL-17) a grant naming a kind the document does not declare: kind-undeclared |
| 55 | `V:grant-declared#2` | `roster.ts` | the guard names `delegation-invalid` instead | condition 1: decoding by grammar, and kind, binding, body and who under D(s) grants carry the bindings their grantor signed (R-DECL-17) a grant naming a kind the document does not declare: kind-undeclared |
| 56 | `V:grant-delegable` | `roster.ts` | the guard's condition never holds | condition 1: decoding by grammar, and kind, binding, body and who under D(s) grants carry the bindings their grantor signed (R-DECL-17) a grant of a kind that may not be delegated: delegation-invalid |
| 57 | `V:grant-platform` | `roster.ts` | the guard's condition never holds | condition 1: decoding by grammar, and kind, binding, body and who under D(s) grants carry the bindings their grantor signed (R-DECL-17) a grant of a platform kind the grantor's role may not sign |
| 58 | `V:grant-role` | `roster.ts` | the guard's condition never holds | condition 1: decoding by grammar, and kind, binding, body and who under D(s) grants carry the bindings their grantor signed (R-DECL-17) a grant of a kind the grantor's role may not sign: delegation-invalid |
| 59 | `V:grant-shape-declared` | `declared.ts` | the guard's condition never holds | condition 1: decoding by grammar, and kind, binding, body and who under D(s) grants carry the bindings their grantor signed (R-DECL-17) a grant in the legacy shape under a v2 document: body-invalid |
| 60 | `V:grant-shape-legacy` | `declared.ts` | the guard's condition never holds | condition 1: decoding by grammar, and kind, binding, body and who under D(s) grants carry the bindings their grantor signed (R-DECL-17) a grant with a signed map under a v1 document: body-invalid |
| 61 | `V:grant-stale` | `roster.ts` | the guard's condition never holds | condition 1: decoding by grammar, and kind, binding, body and who under D(s) grants carry the bindings their grantor signed (R-DECL-17) a grant naming a binding that is not the one in force: binding-stale; condition 1: decoding by grammar, and kind, binding, body and who under D(s) grants carry the bindings their grantor signed (R-DECL-17) a room-custody session naming a binding that is not the one in force: binding-stale |
| 62 | `V:invite-session` | `roster.ts` | the guard's condition never holds | condition 1: decoding by grammar, and kind, binding, body and who under D(s) grants carry the bindings their grantor signed (R-DECL-17) a room-custody session naming a binding that is not the one in force: binding-stale |
| 63 | `V:land-op` | `verify.ts` | a `land-evaluated` event for an unknown operation is accepted | condition 2: required evaluation calls, derived and rebuilt from the fold guard-failed: a land-evaluated event for an operation no land act started |
| 64 | `V:land-reviews` | `obligations.ts` | every latest verdict is listed, qualifying or not | honest logs verify, with every input rebuilt from the fold declared-carry verifies on a fresh replay with the Git objects, with no proof limit; honest logs verify, with every input rebuilt from the fold declared-carry verifies without the Git objects; each input it could not rebuild is reported git-unwitnessed; and 10 more |
| 65 | `V:legacy-kind` | `declared.ts` | the guard's condition never holds | condition 1: decoding by grammar, and kind, binding, body and who under D(s) the legacy rule: recover is not a kind of a v1 room |
| 66 | `V:legacy-v1` | `declared.ts` | the guard's condition never holds | condition 1: decoding by grammar, and kind, binding, body and who under D(s) the legacy rule: a v: 2 envelope under a v1 document was never admitted (body-invalid) |
| 67 | `V:missing` | `calls.ts` | a required call with no recorded call in its place is accepted | carry calls for verdicts are derived, and their inputs rebuilt (R-CARRY-1 to R-CARRY-5) decision-missing: a propose whose carry call is deleted, where the earlier verdict is owed one; carry calls for verdicts are derived, and their inputs rebuilt (R-CARRY-1 to R-CARRY-5) decision-missing: a propose that records one of the two carry calls it owes; and 9 more |
| 68 | `V:outcome` | `calls.ts` | the guard's condition never holds | condition 2: required evaluation calls, derived and rebuilt from the fold policy-decision-mismatch: a recorded outcome that is not the one the rebuilt call makes |
| 69 | `V:prepared` | `verify.ts` | a check is not compared with the `prepared` events | a check on a filtered snapshot (R-CARRY-15, R-DECL-20) guard-failed: a check naming a snapshot the prepared event does not record for its checker; condition 2: required evaluation calls, derived and rebuilt from the fold the prepared event, where present (R-DECL-20) guard-failed: a check bound to an integration that no prepared event for its version names |
| 70 | `V:recompute-blocked` | `verify.ts` | the recorded block is not compared with the rebuilt call | condition 2: required evaluation calls, derived and rebuilt from the fold where admission stopped: recorded refusals refusal-mismatch: a recomputation whose require call fails, recorded without its block |
| 71 | `V:recompute-keeps` | `verify.ts` | a blocked recomputation takes the failed call's empty obligations | honest logs verify, with every input rebuilt from the fold declared-carry verifies on a fresh replay with the Git objects, with no proof limit; honest logs verify, with every input rebuilt from the fold declared-carry verifies without the Git objects; each input it could not rebuild is reported git-unwitnessed; and 1 more |
| 72 | `V:recompute-version` | `verify.ts` | a recomputation of a version the log never proposed is accepted | condition 2: required evaluation calls, derived and rebuilt from the fold where admission stopped: recorded refusals guard-failed: a recomputation of a version the log never proposed |
| 73 | `V:recover-closed` | `declared.ts` | the guard's condition never holds | condition 1: decoding by grammar, and kind, binding, body and who under D(s) recover ops (R-DECL-21) release: a field the op does not have |
| 74 | `V:recover-required` | `declared.ts` | the guard's condition never holds | condition 1: decoding by grammar, and kind, binding, body and who under D(s) recover ops (R-DECL-21) release: a required field missing |
| 75 | `V:recover-target` | `declared.ts` | the guard's condition never holds | condition 1: decoding by grammar, and kind, binding, body and who under D(s) recover ops (R-DECL-21) release: a target the op does not take |
| 76 | `V:recover-type` | `declared.ts` | the guard's condition never holds | condition 1: decoding by grammar, and kind, binding, body and who under D(s) recover ops (R-DECL-21) release: a field of the wrong type |
| 77 | `V:refusal-after` | `verify.ts` | a refusal decided after the refuse rules passes although a rule refuses first | condition 2: required evaluation calls, derived and rebuilt from the fold where admission stopped: recorded refusals refusal-mismatch: an outside-claim refusal although the refuse rules, which ran first, refuse it |
| 78 | `V:refusal-rule` | `verify.ts` | the recorded refusal's rule is not compared | condition 2: required evaluation calls, derived and rebuilt from the fold where admission stopped: recorded refusals refusal-mismatch: a recorded policy refusal naming a rule that is not the one that refuses |
| 79 | `V:review-approves` | `obligations.ts` | the guard's condition never holds | honest logs verify, with every input rebuilt from the fold declared-carry verifies on a fresh replay with the Git objects, with no proof limit; honest logs verify, with every input rebuilt from the fold declared-carry verifies without the Git objects; each input it could not rebuild is reported git-unwitnessed; and 22 more |
| 80 | `V:review-count` | `obligations.ts` | an obligation needs one approval more than its count | honest logs verify, with every input rebuilt from the fold declared-carry verifies on a fresh replay with the Git objects, with no proof limit; honest logs verify, with every input rebuilt from the fold declared-carry verifies without the Git objects; each input it could not rebuild is reported git-unwitnessed; and 64 more |
| 81 | `V:review-principal` | `obligations.ts` | the guard's condition never holds | honest logs verify, with every input rebuilt from the fold declared-carry verifies on a fresh replay with the Git objects, with no proof limit; honest logs verify, with every input rebuilt from the fold declared-carry verifies without the Git objects; each input it could not rebuild is reported git-unwitnessed; and 10 more |
| 82 | `V:review-self` | `obligations.ts` | an author's own verdict qualifies | honest logs verify, with every input rebuilt from the fold declared-carry verifies on a fresh replay with the Git objects, with no proof limit; honest logs verify, with every input rebuilt from the fold declared-carry verifies without the Git objects; each input it could not rebuild is reported git-unwitnessed; and 17 more |
| 83 | `V:reviewers` | `obligations.ts` | every reviewer is listed, qualifying or not | honest logs verify, with every input rebuilt from the fold declared-carry verifies on a fresh replay with the Git objects, with no proof limit; honest logs verify, with every input rebuilt from the fold declared-carry verifies without the Git objects; each input it could not rebuild is reported git-unwitnessed; and 8 more |
| 84 | `V:reviewers-then` | `verify.ts` | the reviewers count evidence sealed after the act | honest logs verify, with every input rebuilt from the fold declared-carry verifies on a fresh replay with the Git objects, with no proof limit; honest logs verify, with every input rebuilt from the fold declared-carry verifies without the Git objects; each input it could not rebuild is reported git-unwitnessed; and 20 more |
| 85 | `V:scope-fixed` | `declared.ts` | the guard's condition never holds | stage 3 guards whose failure another guard would also report: each is named by its own detail body-invalid: a scope on a thread whose scope is fixed is a problem, by name; a thread whose scope is fixed by a template (R-DECL-7) open carries no scope, and a scope is refused; take on such a thread carries none either |
| 86 | `V:sole-admin` | `obligations.ts` | the guard's condition never holds | honest logs verify, with every input rebuilt from the fold declared-carry verifies on a fresh replay with the Git objects, with no proof limit; honest logs verify, with every input rebuilt from the fold declared-carry verifies without the Git objects; each input it could not rebuild is reported git-unwitnessed; and 2 more |
| 87 | `V:step-required` | `declared.ts` | the guard's condition never holds | condition 1: decoding by grammar, and kind, binding, body and who under D(s) body and target under the declaration in force (body-invalid) propose: a step's field missing; a thread whose scope is fixed by a template (R-DECL-7) open carries no scope, and a scope is refused; take on such a thread carries none either |
| 88 | `V:step-type` | `declared.ts` | the guard's condition never holds | condition 1: decoding by grammar, and kind, binding, body and who under D(s) body and target under the declaration in force (body-invalid) propose: a step's field of the wrong type |
| 89 | `V:stop-after-refuse` | `calls.ts` | the guard's condition never holds | condition 2: required evaluation calls, derived and rebuilt from the fold where admission stopped: recorded refusals the refusals log verifies: a refuse rule, outside-claim after the refuse rules, obligation-open before policy, a landing blocked by a recomputation; condition 2: required evaluation calls, derived and rebuilt from the fold where admission stopped: recorded refusals decision-missing: an outside-claim refusal without the refuse call that ran before it; and 4 more |
| 90 | `V:stop-blocked` | `calls.ts` | a land refused with its version's block is taken as refused by a rule | condition 2: required evaluation calls, derived and rebuilt from the fold where admission stopped: recorded refusals the refusals log verifies: a refuse rule, outside-claim after the refuse rules, obligation-open before policy, a landing blocked by a recomputation |
| 91 | `V:target` | `declared.ts` | the guard's condition never holds; verify then throws on the state the guard excludes | condition 1: decoding by grammar, and kind, binding, body and who under D(s) body and target under the declaration in force (body-invalid) standup: a target the declaration does not accept |
| 92 | `V:target#2` | `declared.ts` | the guard accepts the target | condition 1: decoding by grammar, and kind, binding, body and who under D(s) body and target under the declaration in force (body-invalid) standup: a target the declaration does not accept |
| 93 | `V:thread-known` | `verify.ts` | the guard's condition never holds | an act that names a thread or entry the log never had guard-failed: a note on an entry the log never had, which the room refuses as lane-unknown |
| 94 | `V:unsupported` | `verify.ts` | a version the verifier lacks is not recognised; verify then throws on the state the guard excludes | condition 1: the steps version and profile named by the retained document steps-unsupported: a verifier without the second version stops at the first entry that needs it; not a failure; condition 1: the steps version and profile named by the retained document profile-unsupported: a document naming a profile the verifier lacks stops at the first entry under it; not a failure |
| 95 | `V:unsupported#2` | `verify.ts` | the stop is not reported | condition 1: the steps version and profile named by the retained document steps-unsupported: a verifier without the second version stops at the first entry that needs it; not a failure; condition 1: the steps version and profile named by the retained document profile-unsupported: a document naming a profile the verifier lacks stops at the first entry under it; not a failure |
| 96 | `V:who-grantor` | `roster.ts` | the guard's condition never holds | condition 1: decoding by grammar, and kind, binding, body and who under D(s) grants carry the bindings their grantor signed (R-DECL-17) the grantor's role, changed since the grant, may no longer sign the kind |
| 97 | `V:who-roles` | `roster.ts` | the guard's condition never holds | condition 1: decoding by grammar, and kind, binding, body and who under D(s) who.roles: a member signing the check act, which only checkers may sign (role-forbids) |

### Gates

Run under bash, serially, with exit codes checked, in a clean worktree at `e969587a`, the last code commit. `git status --porcelain` was empty before and after. The head for review adds only this section: `git diff --stat e969587a HEAD` lists `plans/README.md` alone. Main `a04c774b`'s root count is the checker's, from review `daba6bca` of head `4d2614a7`, whose tree main `a04c774b` has: 2,626 passed and 2 skipped. Its per-package counts are from the same suite run on the stage 2 branch after it merged that main, where `packages/log` is main's.

| Gate | Exit | Result | Main `a04c774b` |
|---|---|---|---|
| `npm ci` (root) | 0 | installed | 0 |
| `npm run typecheck` (root) | 0 | every workspace | 0 |
| `npm test` (root) | 0 | 2,942 passed, 2 skipped | 2,626 passed, 2 skipped |
| `npm run typecheck` in `packages/log` | 0 | src and tests | |
| `npm test` in `packages/log` | 0 | node 357 passed; workerd 350 passed | node 198; workerd 193 |
| `npm run typecheck` in `packages/policy` | 0 | src and tests | |
| `npm test` in `packages/policy` | 0 | node 303 passed; workerd 301 passed, 2 skipped | the same |
| `git diff --check origin/main` | 0 | clean | |

Per package, root `npm test` (node, then workerd where a package has both): checkers 43; cli 162; client 88 and 2; git 340; log 357 and 350; mcp 73 and 5; policy 303 and 301 (+2 skipped); room 237 and 540; ui 141. Every count except log's equals main's. Log's difference is the three new test files: `declared-stage3.test.ts`, `declared-obligations.test.ts`, and `declared-stage3.node.test.ts`, which runs on node only. The Room's own suite, which verifies the logs the real Room writes under `v1` documents, passes unchanged against this verifier.

### Not changed here

The contract, `docs/protocol.md`, and the policy, room, git, client, MCP, CLI, checkers and UI packages are unchanged. No existing test is edited: every file this branch changes under `packages/log/test` is new. `LICENSE`, `NOTICE` and `AGENTS.md` are untouched.

## Declared acts stage 5 (request a5d64b35)

### State at the integration head (written after the rest of this section)

Stage 5 is now reviewed on `request/test-overhead`, the integration branch (assert `dae9a1f3`), where it is composed with stage 2 (approved at `4ec48aa1`, review `25bede37`), stage 3 and the MCP core. The branches `request/decl-stage5` and `request/decl-stage5-ui` stay at `db73dddc` and `5dc0d044`. Read this subsection first. It replaces the status paragraph and the four "must change before review" points below, which described a provisional head.

**What changed since those four points were written.**

- *"It is provisional."* No longer. The head contains stage 2 as reviewed, and the gate of [docs/testing.md](../docs/testing.md) runs at it. It is not composed on main, because main does not have stage 2 yet: the four lanes land together from this branch.
- *"Its mutation evidence does not meet the standard."* That standard is superseded by request `ecbc722a` (review `b1738122`), not met. The guard counts in "The state of the evidence" are lists of where to look, not work owed. The mutation table below is history.
- *"The repairs are tested against stand-in rooms."* Still true of most of them, and stated as a limit below.
- *"The whole-head gates are owed."* Run at the head sent; the review request gives the result.

**Conditions of the request.**

| Condition | State |
|---|---|
| (1) every stage 5 surface: the declarations read, the generic signed act, the MCP `act` and `acts` tools, CLI submission and discovery, a UI that prepares and submits an application act | Delivered, as amended by `98a292d4`: the UI's generic form and adapter are delivered and tested as components; the authenticated page entry against a live room belongs to `cfbde32f` |
| (2) signed meaning preserved: no silent rebind, exact retries, grant maps expanded before signing | Delivered. Witnesses in the map, under Client and Room |
| (3) an act the client binary does not know, over HTTPS and MCP, and the listed refusals | Delivered. The stage 5 acceptance cases of the protocol (section 33.10) each have a witness; an audit of them against the test code found one part missing after the test reduction, since restored |
| (4) stage ownership and the read-route seam | "Edits to files other stages own", below, stands |
| (5) named red mutations; gates; one exact head | The mutation part is superseded by `ecbc722a`. Gates and one head: as above |

**Findings.** Reviewers recorded twenty findings on this lane before this branch. Eighteen were repaired and confirmed by a reviewer then; each has a section under "Since `b7b9d8df`". Two were open and are repaired on this branch:

| Finding | What was wrong | Repair | Witness |
|---|---|---|---|
| `61b68774`, `11c564ce`: the client's refusal of input that is not plain data changed | The client copied a target or body before checking it. A class instance was copied into a plain object and sent. A nested `Uint8Array` threw a raw `TypeError` | The value is checked as it is copied, by the rule the signer's canonical form uses, and every failure is `bad-request`. Nothing is signed or sent (see `b2043423` below for the one-pass copy) | `packages/client/test/prepared.test.ts`: "a target or body that is not plain data ...", a table of fourteen values |
| `4872a4a1`: a finishing run always said the saved act "was sent again" | When the journal already held the answer, nothing was sent | The message now says which happened: "That act was sent again as it was saved", or "That act had already been answered, and this is its result. Nothing was sent" | `packages/cli/test/declared.test.ts`: "a saved act whose answer the journal already holds ..." |

A third finding came from the review of this head's parent `c38c23ce`, and is repaired here:

| Finding | What was wrong | Repair | Witness |
|---|---|---|---|
| `6bf8d38a` (P2): the client dropped the oldest unanswered named act when a 65th had no answer | A later repeat of the dropped key was built again under the vocabulary then in force: another act under the same key, refused `idempotency-mismatch` | A handle drops none. With 64 unanswered, a new named act is refused `rate-limited` before it is signed or sent, until one is answered | `packages/client/test/prepared.test.ts`: "a handle that holds 64 acts with no answer ..." |

| `b2043423` (P2): the plain-data check read a getter once and the copy read it again | A getter could answer plain text to the check and a class instance to the copy, which was then signed and sent as a plain object | The check and the copy are one pass. Each property is read once, through its descriptor, and what is read is what is copied. A getter is refused and never called | the same table test, rows "a getter" and "a nested getter"; it also asserts the getter was not called |

Two more came from the review of `736f4953` (changes requested, `0b33e8cc`), and are repaired:

| Finding | What was wrong | Repair | Witness |
|---|---|---|---|
| Item 1 (P2): two new acts started together both passed the bound of 64 | The bound was checked before the first await and the place taken after the answer | A call takes its place before its first await and gives it up when it ends. The bound counts acts unanswered and acts under way | `packages/client/test/prepared.test.ts`: "two new acts started together cannot both take the last place ..." |
| Item 2 (P2): a failed read of the room's acts unmounted the form that owned an unresolved act | When the acts could be read again the form was fresh: the uncertainty and the same-act retry were gone, and a new act could be sent first | The Acts screen owns the unresolved act and its status. While the acts cannot be read the page says so, sends no new act, and still offers "Ask again, the same act" and "Leave it" | `packages/ui/test/acts-screen.test.tsx`: "an unresolved act outlasts a failed read of the room's acts ..." |

A further finding, `2ee996f4` (P2), was recorded during that review and is repaired: a different act sent under a key the handle holds got the room's `idempotency-mismatch`, and the handle then forgot the original act, so that a later repeat of the original was built again and refused. The handle now changes what it keeps under a key only on an outcome of that very act. Witness: `packages/client/test/prepared.test.ts`, "a different act sent under a held key does not replace the act that is kept ...". One control distinguishes.

The review of `7931d5e8` (changes requested, `12b1e0a9`) added one: while the room's acts could not be read, "Send it with the new meaning" still sent a new act, under a banner that said none would be sent. The button is now disabled then, and its handler sends nothing. Witness: `packages/ui/test/acts-screen.test.tsx`, "confirming the new meaning sends nothing while the room's acts cannot be read, and sends once they can". Two controls distinguish, one for the button and one for the handler. The form's other routes to a new act were read again: the submit is guarded, and "Ask again, the same act" sends only the kept act.

The review of `9451aa24` (changes requested, `17ce6443`) found one more case of the same kind: two different acts started together under a key the handle did not yet hold. Whichever lost its answer first became the kept act, and the other could not replace it, so a repeat of the act the room had accepted was built again and refused. A key now carries one intent at a time, decided before anything is awaited or signed: a second call with the same key and the same intent shares the first call's outcome, and one with another intent is refused `bad-request` with nothing signed or sent. Witnesses in `packages/client/test/prepared.test.ts`: "a key carries one intent at a time ..." and "the same act started twice together under one key is one act ...". Three controls distinguish: the shared call, the one intent per key, and the count of places before any await.

The review of `2ba30aa8` (changes requested, `26231a05`) found that the shared outcome was entered too late. The handle entered the key with no promise, and then started the act. Starting the act can run the caller's `onPrepared` hook at once: a bearer session awaits nothing before the hook, and neither does a key handle that repeats an act it kept. A hook that made the same call again got `undefined` where a promise is declared. The room still recorded one act. The promise is now made and entered before the act starts, so such a call gets the first call's promise. The one intent per key, the shared call, the count of places and the cleanup are unchanged. A hook must not await the call it repeats, because that promise settles only after the hook returns; the option's description says so. Witnesses in `packages/client/test/prepared.test.ts`: "a hook that makes the same call again, before it returns, gets the first call's promise", once for a bearer session on a new key (one hook and one `bearerAct` call on the room's wire, not an HTTP POST), with the same call after the first returned as its control, and once for a key on an act the handle kept. Control, by hand: on the source of `2ba30aa8` both tests fail ("expected undefined to be an instance of Promise"; "expected undefined to be Promise") and the other 106 client tests pass; with the repair all 108 pass. `scripts/control.mjs` was not used, because restoring the earlier order takes more than one replaced passage.

The authenticated UI entry is no longer in this request. The planner's decision `bdd0ebd5` (scope amendment `98a292d4`) moves the live Acts page entry and its real-browser, real-Room witness to request `cfbde32f`, which depends on `18815307` for the browser's credential. Stage 5 keeps authenticated access by the client, HTTPS, MCP and the command line, the generic typed form and its LiveRoom adapter with their component tests, and every other original condition.

One consequence of the first repair: a bearer session now refuses input that is not plain data too. Before, only a key handle did, at signing; a bearer would have sent it as JSON.

Each repair before the one for `26231a05` has one control with `scripts/control.mjs` that distinguishes. That last repair has the control by hand described above.

**Limits, restated.**

- Most repairs since `b7b9d8df` are shown against the client's stand-in room and the UI's memory room. The real Room is exercised by `packages/room/test/workerd/declared-stage5-a5d64b35.test.ts` (the declarations read, bindings, named methods, grants, the MCP `act` tool, old records), and four cases that were also shown against a real Room before the test reduction are now shown only against the stand-in (listed in the Room's known gaps in [test-invariants.md](test-invariants.md)).
- The UI has never run against a real Room with a `v2` document, and the Acts page is not wired to a live room. It has no `because` input and no `recover` or platform kinds. The review screens keep the review application's words.
- The browser suite (`npm run e2e` in `packages/ui`) is outside the gate and was last run at `c74f3696`.
- `recover` has no client surface. The checker service still signs `v: 1`; stage 4 changes that.

**Below, stale.** "For the planner or hugh", points 9 and 10, say stage 2 has moved and the MCP core lacks later commits; this head composes all of them. The UI's "Not done" list says a lost answer is not retried from the form; it is, since `f606dd89`. The quoted CLI message under `bdc35c53` is the "sent again" wording only.

Status on 2026-10-04: approved. Review `b90f2211` approved the head `6b877f6b` (ratified `0ddc47f5`), for the request as amended: the authenticated UI entry moved to request `cfbde32f`. All of it is on the integration branch `request/test-overhead`; nothing has landed on main. The line below is the earlier status, kept as history.

Earlier status: implemented, provisional, not for review. Gitseq request `a5d64b35` (planner to builder), stage 5 of 7 in section 8.5 of [notes/2026-10-02-declared-acts.md](../notes/2026-10-02-declared-acts.md), with the planner's acceptance clarification `fa120186` and timing amendment `41a5a2b4`. Branch `request/decl-stage5`. Nothing was pushed or deployed, and no Cloudflare credential was used. No reviewer has approved any head of this branch.

How to read this section. The parts from "What was built" to "The UI" describe the composed head `b7b9d8df` as it was reported then: the stage 5 lane's work, the UI lane's work (`request/decl-stage5-ui`, `5dc0d044`), and the stage 2 code as it stood at `15fa7f4c`. They are not rewritten, except choices 19, 20 and 22, a note at the head of the mutation table and of the old gates, and the last list, "For the planner or hugh". The part "Since `b7b9d8df`" has one section for each finding the checker or the planner made on that head or a later one, with its repair. Where the two parts disagree, the later one is right.

Four things are true of the present head and must change before review:

- **It is provisional.** It sits on the stage 2 code of `15fa7f4c`. Stage 2 is not landed and has changed since. The head for review is composed again on main after stage 2 lands, with every gate and every acceptance test run again there.
- **Its mutation evidence does not meet the standard now in force** (the checker's `b256f7a0`). An independent reading of the source found 174 guards with no mutant outside the UI and 201 in the UI, and existing mutants that do not compile: 33 outside the UI and, by reading, 16 in it. See "The state of the evidence".
- **The repairs since `b7b9d8df` are tested against stand-in rooms**, the fake room of the client's tests and the UI's memory room, unless a section says otherwise. They are not shown against a real Room, over real HTTPS or MCP.
- **The whole-head gates are owed again.** Root `npm ci` and `npm test` have not been run at the present head. Each repair ran the tests of the packages it changed and the root typecheck. See "Gates since `b7b9d8df`".

Stage 3 is not in this head either: `packages/log` is unchanged, and `artroom verify` does not read a `v2` room's log until stage 3 lands. The MCP core runtime (request `9ca1d290`) is on its own branch and is not in this head.

### What was built

- **The declarations read.** `ReadQuery` `{ q: "acts" }` over RPC and `GET /v1/rooms/:room/declarations` over HTTPS, in `packages/room/src/reads.ts` (`catalogue`) and `http.ts`. With no selector it answers with the active policy version. `at` is an entry's seq and answers with the version in force there, `D(s)`. `policy` names a version. A `v2` version answers with each declared kind's declaration and binding, the steps version and `lanes`. A `v1` version answers with the legacy catalogue, which has no declarations and no bindings. Each declared kind carries `retired`, the seq of the first later activation that dropped it.
- **A record's meaning at its own seq.** `meaningOf(catalogue, kind)` gives the label, declaration, binding and retirement in force for a record. The Room's `explain` read carries it as `Explanation.meaning`.
- **The generic act.** `RoomApi.act(kind, target, body, { binding, idempotencyKey })` in `packages/client/src/room.ts`. It signs envelope `v: 2` with exactly what the caller gave. It refuses a missing or malformed binding and a platform kind before sending.
- **The named methods in a `v2` room.** With a key, the handle reads the catalogue once, then signs each code-review act as `v: 2` with the binding of the declaration it was built for, under the room's steps version and `lanes`. In a `v1` room they sign `v: 1` as before.
- **Bearer acts.** Over RPC the caller's binding goes to `bearerAct` unchanged. Over HTTPS the generic act is one call of the MCP tool `act`. The HTTPS bearer client's `check` and `roster` methods stay refused.
- **Grants.** `delegateOp` and `invitationSession` (`packages/client/src/grants.ts`) build the op in the room's active vocabulary. `expandGrant` turns `*` or a list of kinds into platform kinds and a signed map of the active bindings.
- **MCP.** The tools `acts` and `act`, in their own block of `packages/mcp/src/tools.ts`, beside the ten named tools, which are unchanged.
- **CLI.** `artroom acts [KIND] [--at SEQ | --policy VERSION]` and `artroom act KIND --binding B …`, journaled like the other act commands. `artroom log` and `artroom explain` show a declared kind with the label of the record's own seq.
- **A table of the steps' fields.** `STEP_FIELD_SPECS` in `packages/policy/src/steps.ts`: each step's own body fields with their types, so a form or the CLI can ask for them. `fieldsOf(declaration, shape)` lists an act's fields on a target.
- **What a handle keeps.** `actsAt` answers from an ended version the handle read before. A later activation can still set `retired` on that version's kinds, so the handle drops what it kept when it sees a later activation. `actsAt(at, { fresh: true })` always reads the room.
- **A thread's kind.** `Lane.kind`, on the `lane` and `lanes` reads: the kind of the act that opened the thread.
- **A thread's name.** `titleOf` and `threadTitle` in `packages/policy/src/catalogue.ts`. The CLI and the MCP tool `act` print the name when an act opens a thread.
- **A typed envelope accessor.** `envelopeOf(entry)` in `packages/contract/src/guards.ts`.
- **Protocol.** [docs/protocol.md](../docs/protocol.md) section 33.10, appended. It amends R-API-3, R-API-9, R-CRED-10, R-DECL-16, R-DECL-17 and R-DECL-23, adds the stage 5 acceptance cases and the types, and adds open points 49 to 52. No rule is renumbered and no earlier text is edited.

The API the UI lane builds on is summarized in the session scratch file `stage5-api.md`; everything it names is in the files above.

### Conditions

| Condition of `a5d64b35` | State | Where and how shown |
|---|---|---|
| (1) Every stage 5 surface | Met at this head | Read, client, HTTPS, MCP, CLI and UI: built and tested. The ten named MCP tools remain. The MCP core (`a9788a59`) is separately owed; see "Composing with the MCP core" |
| (2) Signed meaning preserved | Met | The client, the MCP tool and the CLI never read a binding to act, never replace one and never sign again. Tests: "signed meaning is never changed by the client" (Room, 6), "a changed meaning is shown, never adopted for the user" (CLI, 3), the stale test of the MCP suite. Exact retries after an activation return the original record. Grants carry the grantor's bindings and are expanded before signing. Credential custody and redaction are unchanged |
| (3) An honest act unknown to the client, and the listed cases | Met | See "Acceptance cases", and "The UI" for the UI's cases |
| (4) Ownership and the read-route seam | Met | See "Edits to files other stages own" |
| (5) Mutations, tests, gates, one composed head | Part met | Mutations and gates below, at this composed head. **Open: the one exact head for review**, which needs stage 2 landed on main |

| Point of `fa120186` | State | Where and how shown |
|---|---|---|
| Historical readers use `D(s)` | Met for the client, MCP, CLI and UI | "old records are read under the declarations of their own seq" (Room, 5 tests): activation, retirement, later name reuse with a changed shape, a label-only change, legacy records, exact old retries |
| The generic bound check over the MCP endpoint | Met | "a declared check step under another name" (Room, 3 tests), "the generic act over the MCP endpoint" (Room, 4 tests). R-CRED-10 and R-API-9 are amended at this head in section 33.10 |
| The first jam task need not use this path | Not a code matter | Nothing here makes it depend on it |

### Acceptance cases

All of these run the real client package and the real MCP endpoint against the Worker and its Durable Object, in [packages/room/test/workerd/declared-stage5-a5d64b35.test.ts](../packages/room/test/workerd/declared-stage5-a5d64b35.test.ts) (38 tests). Nothing in them is a double.

| Case of section 33.10 | Tests |
|---|---|
| Generic act, over HTTPS | "the client signs v: 2 with the binding the caller read; the room admits it and records the act's own kind" |
| Generic act, over MCP | "a bearer reads the declarations with acts, and performs a kind that has no named tool with act, signed under its delegation" |
| Changed meaning: body, targets | "a changed body field limit …", "a new required body field …", "a changed target …" |
| Changed meaning: hold | "a changed hold: an opening act prepared before its hold changed is binding-stale; the caller reads again and resubmits deliberately" |
| Label-only edit | "a label-only or help-only edit leaves the binding equal, and the act prepared before it is admitted" |
| Lost result; exact retry | "a lost result is retried with the same bytes, and an exact retry after a meaning change returns the original record" |
| Undeclared kind | "an undeclared kind is kind-undeclared; a body the declaration does not allow is invalid-body; neither is recorded" |
| Role and grant | "a role the declaration does not list is role-forbids; …"; "a grant that does not name the kind, names an earlier binding, or whose grantor's role lost the kind does not cover the act; …" |
| Expanded grant; delayed grant | "a grant is expanded before signing: …"; "a grant signed before a meaning change and sent after it is binding-stale; …" |
| Legacy controls | "a v1 room: the named methods sign v: 1 as before; the generic act is bad-request and records nothing"; "a v1 room answers with the legacy catalogue …" |
| Named methods in a `v2` room | "a v2 room with the code-review declarations: each named method signs v: 2 with the binding it was built for; renew stays v: 1"; "a room whose claim means something else: …" |
| Generic check | "a bearer whose grant names verify meets the obligation through act; one without it, or with a stale binding, does not"; "the holder and proposer cannot meet their own check obligation through act; …"; "the HTTPS bearer client: its fixed check method stays forbidden; its generic act goes to the MCP endpoint; a key-signed check over HTTPS still works" |
| Excluded on the generic path | "platform kinds, acts without a binding, and every act in a v1 room are refused on the generic path; nothing is recorded"; "a bearer act is never taken on POST /acts: …" |
| Old records | the five tests of "old records are read under the declarations of their own seq" |
| Dropped twice | "each version that declared the kind is marked with the first later version that did not: an earlier version is not moved to the second drop" |
| Retired after the read | Client: "with no sign of a later activation the handle answers what it kept; { fresh: true } reads again and replaces it", and eight tests "after …, the handle drops what it kept and the next answer has the room's marks", one for each sign. MCP: "a kind retired after the server first read its version is shown retired on the next call, with nothing else read in between" |
| Thread kind | "the lane reads give each thread's kind: claim in a v1 room; in a v2 room the kind of the act that opened it" |
| Thread name | "a thread with no goal is named by its opening act, in the words in force when it opened: label and first field"; "the act tool names the thread it opened the same way; a thread with a goal is named by its goal"; CLI: "an act that opens a thread names it as every reader does: its goal, or the act's label and first field" |

Unit tests beside them, against the fake room in its declared mode: client 33 ([declared-a5d64b35.test.ts](../packages/client/test/declared-a5d64b35.test.ts)), MCP 10 and 4 schema tests, CLI 20. The UI suite has 195 tests. A Room node test, 11 tests, checks that `STEP_FIELD_SPECS` agrees with admission's step 5 for every step: [declared-steps-a5d64b35.test.ts](../packages/room/test/node/declared-steps-a5d64b35.test.ts).

### Choices where the design left room

1. **The route is `/declarations`, not `/acts`.** `POST /v1/rooms/:room/acts` submits an act. A `GET` on the same path for a different thing would share its path in logs and in tests that count submissions. The read query and the MCP tool are still named `acts`, as R-API-9 has them.
2. **A `v1` version answers with a legacy catalogue.** Section 33.7's `ActsCatalogue` had a `steps` field and no `v1` form. The read returns `{ vocabulary: "artroom-legacy-v1", policy, since, until }`, so a client learns the room's vocabulary from the same read.
3. **`retired` is the first later activation that dropped the kind, and reuse does not clear it.** A record made under a version keeps that version's meaning. The binding and policy version tell a reused name's two meanings apart.
4. **The Room computes `explain`'s meaning.** One implementation serves the client, the CLI, the MCP tool and the UI.
5. **The named methods read the catalogue once per handle.** A handle cannot know the room's vocabulary without asking, and it must not sign `v: 1`, be refused, and sign again by itself. So the first named act of a handle with a key costs a session request and one read, in every room. `renew` and `roster` cost nothing more. After a `binding-stale` or `kind-undeclared` refusal, or a `bad-request`, the handle forgets what it read; the caller's next call reads again.
6. **The client depends on the policy package, through an export that loads no evaluator.** The binding identity lives in `packages/policy`. The client imports `@generalbusiness/artroom-policy/declared`, which pulls in the binding functions, the code-review declarations, the vocabulary functions and the catalogue helpers, and not the expression engine. The client, MCP and CLI TypeScript configurations move from `ES2022` to `ES2024`, which the policy sources need.
7. **A table of step fields for clients, checked against the Room.** Admission's step checks are code. A form needs data. `STEP_FIELD_SPECS` is that data, and the Room node test fails if the two drift.
8. **`artroom act` requires `--binding`.** The CLI could read the active binding for the user. It does not: a user who read a declaration yesterday would then act under today's meaning without being told. `artroom acts KIND` prints the binding and the command.
9. **A binding that is not the active one is refused by the CLI before signing**, with the refusal the room would give. The room still judges every act it is sent, including one whose meaning changes between the CLI's read and its send; that case is tested.
10. **What the room knows is read for the user**: the lease, the lane's generation, and a version's head, as the named commands read them. The binding is never among them.
11. **After `binding-stale` the CLI lists what changed** when one of the last eight policy versions holds the kind under the binding the user gave. Otherwise it says the change cannot be listed.
12. **`expandGrant` refuses; it does not narrow.** A listed kind the role may not grant is an error naming it. `*` means what the role may grant, and says so by what it lists.
13. **`LogEntry` is unchanged.** Widening it would change `packages/log`, which stage 3 owns. Readers call `envelopeOf(entry)`, which gives the envelope as `AnyEnvelope`. Open point 51.
14. **No Room change was needed for the bearer transport.** Stage 2's `bearerAct` already signs a caller's binding as given. The exclusions follow from step 1: a platform kind in `v: 2` and a `v: 2` envelope in a `v1` room are `bad-request`. The tests pin both.
15. **An MCP tool error is now a plain object.** A failure the Room throws over RPC reaches the MCP server as an `Error` instance, which MCP rejects as structured content. Before the generic `act`, no tool reached a thrown `bad-request` from the Room. `errorResult` now copies the error's own fields.
16. **The AGENTS.md block is unchanged.** It is pinned by a snapshot and teaches the named loop. The MCP server's instructions gain one sentence about `acts` and `act`, within their 512 characters.
17. **A handle drops kept catalogues on evidence, not on a timer.** It cannot know of an activation it has not seen. Every answer that shows one drops the kept versions: `acts()`, another `actsAt()` answer, a `log()` page, an update, and a refusal that names the active policy version. A handle that has seen nothing may answer old marks, and `fresh` is the way to be sure.
18. **The MCP tool `acts` always reads fresh.** A stdio server keeps one handle for its life, and an agent's call is a question to the room.
19. **A thread with no goal is named by its opening act's first text field by name.** This is the planner's decision `c37653e1`, built at `3a03d405`; it replaces "first field by name", under which the demo's songs were both "Start a song: c". The room keeps bodies and policy documents as canonical JSON with sorted keys, and records neither the order a caller typed nor the order a declaration lists its fields. `titleOf` sorts, so the typed body and the record give one name. "Text" is the field's declared type under the declaration of the opening act's own seq. With no text field present, the first field by name is used, as before. Open point 52 is updated to say so.
20. **The CLI prints an act in the words of the declarations at the act's own seq.** After the room answers, `artroom act` reads `D(out.seq)` and takes the label and the thread's name from it and from the body the journal kept, for a new act and for one finished from the journal alike (`ff266354`; the checker's `0b9119de`, the planner's `b22d29ee` and `23ae8924`). Before that commit it used the catalogue read while the act was prepared, which is the wrong one when a label changes before admission, and it printed no thread line for an act finished from the journal. The read is for display only. If it fails, the act is still done: the kind is printed in place of the label, and the thread is named by its goal or its ID. With `--json` nothing is read.
21. **The MCP tool `act` reads the declarations only for a thread with no goal**, and only at the record's seq. If that read fails, the act is still reported as done and the thread is named by its ID.
22. **A saved act is named as the act it is.** The CLI's journal finds a saved generic act by its idempotency key, not by its kind. A run that names the key with another kind finishes the saved act with the saved bytes. Its receipt names the saved act, from the record's own kind, and the run is told on the error stream that no act of the kind it typed was made (`bdc35c53`). The other choice, to refuse the run because the kinds differ, would leave an act that the room has recorded without its local steps done.

### Edits to files other stages own

- **Stage 2's files.** Two. `packages/policy/src/index.ts`: two added export lines, for the catalogue helpers and the steps table. `packages/room/src/model.ts`: one added line in `laneView`, `kind: row.kind`, with its comment. No other file stage 2 changed is edited. This work reads stage 2's `vocabulary.ts` and its test helpers (`declared-support.ts`).
- **Stage 3's files.** None. `packages/log` is byte-identical to the stage 2 candidate's.
- **The MCP core's files** (`a9788a59`, the planner's). `packages/contract/src/transports.ts`: additive, apart from six lines that had to change in place (`Explanation.kind`, the end of the `ReadQuery` union, `RoomWire.submit`, `RoomWire.bearerAct` and its comment, and the body of `POST /acts`). The two new `McpTools` entries are in their own block after the ten. The contract index gains four names in its transports export list: `ActsNotFound`, `AnyBearerAct`, `CatalogueAt` and `GenericActOptions`, and `envelopeOf` in its guards list. Its MCP exports are otherwise untouched.
- **Main's Room files.** `packages/room/src/reads.ts` (the read and `explain`'s meaning) and `packages/room/src/http.ts` (the route). No migration.
- **The UI lane's files.** Eight, at composition: `src/room/contract.ts`, `src/room/acts.ts`, `src/room/live/describe.ts`, `src/room/live/live-room.ts`, `src/room/mock/memory-room.ts`, `src/screens/Acts.tsx`, `src/ui/format.ts`, and the tests `acts-fields.test.ts`, `acts-screen.test.tsx` and `declared-rendering.test.tsx`. See "Composition".

### The UI lane's four questions

The UI lane finished at `5dc0d044` and asked four things of this lane.

| Question | Answer | What was done |
|---|---|---|
| An ended catalogue is not final: a later activation can set `retired`. Is the handle's cache correct? | It was not. The handle kept an ended version for good. | The handle now drops what it kept when it sees a later activation, and `actsAt` takes `{ fresh: true }`. Ten client tests and one MCP test. The UI reads `acts()` on each snapshot, which is one of the signs, so its next `actsAt` is current |
| The `Lane` read carries no thread kind. | A small additive change. | `Lane.kind` added to the contract and to the Room's `laneView`. One Room test, which also shows the room refusing an act whose `threads` omits the kind. The full Room suite passes with it |
| A thread opened by an application's act has an empty `goal`. What do readers show? | One rule for every reader: the goal, else the opening act's label and first field, else the lane's ID. | `threadTitle` and `titleOf`. The CLI and the MCP tool `act` print it when an act opens a thread. Neither prints a thread's goal anywhere else. Three Room tests, one CLI test, one MCP test, two client tests |
| Log entry envelopes are typed as `v: 1`. | A typed accessor is a small additive change. Widening `LogEntry` is not: it reaches `packages/log`. | `envelopeOf(entry)`. One client test. The CLI's log uses it |

At composition the UI was changed to use all four: it calls `threadTitle`, reads `Lane.kind`, reads envelopes with `envelopeOf`, and keeps no earlier catalogue of its own. See "Composition".

### Composition

The head is three lines of work joined.

| Step | Commit | What |
|---|---|---|
| Merge the UI lane | `9386487e` | `request/decl-stage5-ui` at `5dc0d044`, `packages/ui` only. No conflict |
| The UI uses the four additions | `8fc6ae0c` | See below |
| Merge the repaired stage 2 | `f7839217` | `22ee206d`. One conflict |
| The defect classes, in stage 5's code | `ec16786b`, `2578faef` | See below |
| Merge stage 2 again | `498ee159` | `71584cbc`, nine findings of an independent audit. No conflict |
| The fake room follows it | `1a3d43a6` | The `opened` effect carries the thread's kind and binding in a `v2` room |
| Merge stage 2 a third time | `cd5e494f` | `15fa7f4c`: the room's retry lookup requires the closed outer shape. No conflict |
| The fake room follows it | `27421448` | Its retry lookup requires the same shape |

**The conflict.** `plans/README.md`: both branches append a section at the end. Both are kept, stage 2's first. No source file conflicted.

**What changed in the UI.**

- `laneGoal` calls `threadTitle`. Four expectations in the UI's tests changed with it, in `acts-screen.test.tsx` (two) and `declared-rendering.test.tsx` (two): a song thread is named "Start a song: c", not "Start a song: Blue Bossa". New guard `G5U:thread-name`.
- The Acts form finds the threads an act may act on from `Lane.kind`. The stand-in room gives a lane its kind. Guard `G5U:thread-filter`, re-anchored.
- Log envelopes are read with `envelopeOf` in `live-room.ts`, `describe.ts` and the stand-in room. No cast of an envelope remains in the live adapter.
- The live adapter keeps no earlier catalogue. The active catalogue of the last load answers for the entries it governs (`G5U:governs`, re-anchored). Earlier versions are asked of the handle, which drops what it kept when it sees a later activation. `G5U:catalogue-refresh` now guards the statement that takes each load's active catalogue.

**What the repaired stage 2 changed, and what stage 5 needed.** Stage 5's tests passed on each merged head with no change. At `71584cbc` the Room's `reads.ts` and `model.ts`, which both lines edit, merged with no conflict. A declared kind's target is now judged after step 4a, so an act prepared for a removed target shape is `binding-stale`, as section 33.10's acceptance case already says. Two Room tests were added to show the repairs through the client: a prepared declared act replayed after the room returned to a `v1` document gets its original record, and a bearer's named act repeated with its key after the room moved to declared acts gets its original record.

**The same classes of defect, looked for in stage 5's own code.**

| Class | Where it was looked for | Found | Fix and test |
|---|---|---|---|
| A presence test that reads through the prototype | `catalogue.ts`, the client, the MCP runners, the CLI, the Room's read, the UI | The CLI's `missing` took a required field named `constructor` or `toString` as given | Own properties only. CLI test "a field named like an inherited property is the body's own or it is missing; a change of such a field is listed as one". Mutant `G5:cli-missing-own` |
| The same | | The CLI's `meaningChanges` listed a new or removed field of such a name as changed | Own properties only. The same test. Mutants `G5:cli-changes-own`, `G5:cli-changes-own-after` |
| The same | | The UI read a form value and a field's problem by name through the prototype (`readBody`, the Acts form, the stand-in room) | `own(o, name)`. UI test "its value is the form's own or it is empty: a required one is asked for, an optional one is left out, a given one is sent". Mutant `G5U:own-name` |
| A retry rebuilt under the document now in force | The client's `replay`, the CLI journal, the MCP tool `act`, the HTTPS bearer client | Those four send the act as first built. One other place did not: a named act repeated with its key on the same handle was built again under the vocabulary then read | The handle keeps a named act it got no answer for, and sends those bytes when the same act is repeated with its key. Client tests "a named act repeated with its key on the same handle …" and "only the same act is the kept one …". Mutants `G5:named-retry-kept`, `G5:named-retry-keep`, `G5:named-retry-same`, `G5:named-retry-answered` |
| A declared field given a platform meaning | `threadTitle`, the CLI's output, the MCP results, the UI's review screens | The CLI filled a declared field named `expectedGeneration`, `lease` or `head` from the room as if it were the step's | Only a step's own field is read for the user. CLI test "only a step's own field is read from the room …". Mutant `G5:cli-step-field-only` |
| The same | | The UI showed a review step's field named `text` as the review's text whatever its type | Text only. UI test "a review or a comment under an application's own name is still evidence …", extended. Mutant `G5U:review-text` |
| The same | | `threadTitle`, the CLI's thread line and the MCP tool `act` take a thread's goal only when it is text. No defect |  |
| A grant or invitation that gains a kind across a change of vocabulary | `expandGrant`, the grant builders, the fake room | `expandGrant` names every kind and binding it grants and refuses a kind that may not be delegated. No defect | Client test "a kind whose declaration stops being delegable is not covered by a grant made before …" |
| The same | | The fake room's `v2` mode did not follow the repaired Room in four places | It now answers an exact retry before a step 1 failure, refuses a `v2` session under a `v1` document, gives an invitation admitted under `v2` with no session only the platform kinds, and judges `who.delegable` at each use. Client tests "a prepared declared act replayed after the room returned to the legacy vocabulary …" and "a session signed under a v2 document is refused under a v1 one, and the invitation stays unused". The fake room is a test double and has no mutants |

**Mutation at the composed head.**

- Stage 5: 129 mutants, 128 red by assertion, 1 survivor: `G5:cli-binding-given`. The survivor is the equivalent mutant described under "Mutation table". Eight mutants are new, for the guards in the table above. At this head 38 mutants were run again: the eight new ones, every mutant whose guarded statement changed since the full run, the mutants of the title rule, and every mutant of a Room file, because the Room's code under them changed with the merge. The Room-file mutants were run once more after the second merge and are red. The other results are those of the full run at `477dda2f`.
- The UI: 51 mutants, all run again at this head, 51 red by assertion, 0 survivors. The UI lane's table below lists its 48. Three are new here: `G5U:thread-name`, `G5U:own-name` and `G5U:review-text`. Four were re-anchored: `G5U:governs`, `G5U:catalogue-refresh`, `G5U:thread-filter` and `G5U:built-for-binding`.

**Gates at the composed head.**

Run one after another at commit `27421448`, from 12:21 to 12:29 local on 2026-10-03, with nothing else running in the worktree. An earlier run was stopped by a process kill on the machine at 12:08 and by two merges of stage 2 after it; no result of an interrupted run is recorded here. The commit that adds this text changes `plans/README.md` only; `git diff --check` and `git status` were run again after it.

| Gate | Exit | Result |
|---|---|---|
| `npm ci` (root) | 0 | installed |
| `npm run typecheck` (root, every package) | 0 | |
| `npm test` (root, every package) | 0 | checkers 43; CLI 182; client 121 and 2; log 198 and 193; MCP 87 and 5; policy 313, and 311 with 2 skipped; Room node 270, workerd legacy run 642, workerd declared run 533 with 109 skipped; UI 195 |
| `git diff --check 15fa7f4c` | 0 | no whitespace errors |
| `git status --porcelain` | | empty |

No test failed. The declared run skips the files that found their own rooms, as stage 2's own tests do; the stage 5 integration file is one of them.

### Composing with the MCP core

`a9788a59` adds four read tools and a descriptor shape with titles, annotations and toolsets. It is on branch `request/mcp-amendment` and not on main. This stage does not merge it. To compose:

- `acts` and `act` are written in today's descriptor shape. The core's merge adds its fields to them as to the ten. Which toolsets list `act` and `acts` is the core's contract to say, not this stage's.
- The tests that pinned exactly ten tools now pin the ten named tools and these two by name, so four more reads do not break them. They are listed below.
- The core makes `idempotencyKey` required on act tools. `act` already requires it.
- The core's branch calls itself amendment 4 and uses section 30.2, which on main are the log-objects amendment. It needs renumbering before it meets section 33.

### Existing tests changed

Each is a change of a pinned tool list, made as the coordinator asked. No other existing test file changed.

- `packages/mcp/test/schema.test.ts`, "exactly the contract's ten names, each calling the method of the same name": the list equality becomes "each of the ten is listed once, and no name is listed twice". "required fields are the contract's required fields": the same exact table, taken over the ten.
- `packages/mcp/test/stage0.test.ts`: the list of tools that can refuse gains `act`.
- `packages/cli/test/cli.test.ts`, "artroom mcp serves the ten tools over stdio from the real bin": the list equality becomes "each of the ten once, and `acts` and `act`".
- `packages/room/test/workerd/mcp.test.ts`: two `toHaveLength(10)` become "contains the ten and the two".
- `packages/client/test/support/fake-room.ts`, the test double: policy versions, `activate`, the `acts` read, `v: 2` envelopes with step 4a, grant maps, a bearer act's binding, a lane's `kind`, and a declared kind of the room's own that opens a thread.

### Mutation table

**This evidence does not meet the standard now in force.** The checker's finding `b256f7a0` on stage 2 applies to every lane: each new guard needs a mutant that passes the whole workspace's typecheck and turns a named assertion red, one mutant for each condition, with the tested head, the compiler's result and every failure message kept. The table below was made before that, at `477dda2f` and `b9ecd3af`. It is kept as a record of what was run and is not offered as proof. The same holds for the UI lane's mutation table further down. See "The state of the evidence" under "Since `b7b9d8df`".

121 mutants, each one text edit to one guard, run against five test sets: the client, MCP and CLI node suites, the Room's steps test, and the Room's stage 5, MCP and HTTP workerd tests. 120 fail at least one test by an assertion. 1 survives. No mutant failed only by a timeout, a load failure or a missing report. The runner writes each file's original bytes back in a `finally`, and `git status --porcelain` was empty after the run.

The run was made at commit `477dda2f`. It left seven survivors. Six had no test, and commit `b9ecd3af` adds one for each; those six mutants were run again and are red. Only tests changed between the two commits, so the other results stand.

| Part | File | Mutants | Red | Survive |
|---|---|---|---|---|
| The Room's read and explain | `packages/room/src/reads.ts` | 11 | 11 | 0 |
| The Room's route | `packages/room/src/http.ts` | 3 | 3 | 0 |
| The MCP runners | `packages/mcp/src/run.ts` | 13 | 13 | 0 |
| The MCP descriptors | `packages/mcp/src/tools.ts` | 2 | 2 | 0 |
| The client handle | `packages/client/src/room.ts` | 25 | 25 | 0 |
| The client's envelope | `packages/client/src/envelope.ts` | 2 | 2 | 0 |
| The client's bearer paths | `packages/client/src/bearer.ts` | 3 | 3 | 0 |
| The client's grant builders | `packages/client/src/grants.ts` | 2 | 2 | 0 |
| The catalogue helpers | `packages/policy/src/catalogue.ts` | 24 | 24 | 0 |
| The steps' field table | `packages/policy/src/steps.ts` | 3 | 3 | 0 |
| The CLI commands | `packages/cli/src/main.ts` | 20 | 19 | 1 |
| The CLI's fields and text | `packages/cli/src/declared.ts` | 9 | 9 | 0 |
| The CLI's output | `packages/cli/src/format.ts` | 2 | 2 | 0 |
| The Room's lane view | `packages/room/src/model.ts` | 1 | 1 | 0 |
| The envelope accessor | `packages/contract/src/guards.ts` | 1 | 1 | 0 |
| **Total** | | **121** | **120** | **1** |

**The survivor.** `G5:cli-binding-given`: `artroom act` sends the active binding in place of the one the user gave. It is an equivalent mutant. The statement before it (`G5:cli-stale`) returns a refusal unless the two are equal, so no input reaches the send with different values. The mutant of that earlier guard is red.

**A mutant that was replaced.** `G5:cli-field-unknown` first kept an unknown `--set` field as text. That is also equivalent: the check of the whole body two lines later refuses the same field with the same words. The mutant now drops the unknown field without a word, and is red.

<details><summary>Every mutant</summary>

| Mutant | What it does | Tests that fail |
|---|---|---|
| `G5:read-one-selector` | The read accepts at and policy together | 1 |
| `G5:read-policy-format` | A malformed policy version is looked up, not refused | 1 |
| `G5:read-at-format` | A negative or fractional seq is looked up, not refused | 1 |
| `G5:read-at` | At always answers with the latest version | 7 |
| `G5:read-at-order` | At answers with the first version at or before the seq, not the last | 5 |
| `G5:read-until` | Every version says it is still active | 5 |
| `G5:read-legacy` | A v1 version answers as a declared catalogue with no acts | 8 |
| `G5:read-retired` | No kind is ever marked retired | 5 |
| `G5:read-retired-first` | Retired is the last version that dropped the kind, not the first | 1 |
| `G5:read-binding` | The catalogue's binding is the digest of the declaration, not of the binding subject | 18 |
| `G5:explain-at-seq` | Explain reads a record's meaning under the active version | 4 |
| `G5:route-acts-missing` | A version the room does not retain is 200 with null | 1 |
| `G5:route-at` | The route ignores ?at | 2 |
| `G5:route-policy` | The route ignores ?policy | 1 |
| `G5:acts-not-found` | Acts answers a missing version with another shape | 2 |
| `G5:acts-both` | The acts tool accepts at and policy together | 2 |
| `G5:acts-at` | The acts tool ignores at | 3 |
| `G5:act-binding` | The act tool replaces the agent's binding with the active one | 6 |
| `G5:act-key` | The act tool drops the agent's idempotency key | 3 |
| `G5:headline-stale` | A stale refusal's text does not name the active binding | 2 |
| `G5:headline-meaning` | Explain's text shows the kind, never the label of its seq | 2 |
| `G5:headline-retired` | Explain's text does not say a kind was retired | 2 |
| `G5:error-plain` | A tool error's structured content is the thrown object itself | 2 |
| `G5:tool-binding-required` | The act tool's schema does not require a binding | 3 |
| `G5:tool-key-required` | The act tool's schema does not require an idempotency key | 3 |
| `G5:named-platform-v1` | Renew and roster get a binding in a v2 room | 1 |
| `G5:named-legacy-v1` | The named methods sign v: 2 in a v1 room | 101 |
| `G5:named-forget` | The handle keeps a catalogue the room said was stale | 3 |
| `G5:named-forget-vocabulary` | The handle keeps a vocabulary the room no longer uses | 1 |
| `G5:named-v2` | The named methods sign v: 1 in a v2 room | 20 |
| `G5:named-once` | The named methods read the catalogue for every act | 5 |
| `G5:generic-platform` | The generic act sends a platform kind | 5 |
| `G5:generic-binding` | The generic act signs the active binding in place of the caller's | 10 |
| `G5:replay-binding` | A bearer's prepared act is sent without its binding | 14 |
| `G5:catalogue-cache` | ActsAt answers every question with the first version it kept | 5 |
| `G5:catalogue-keep-ended` | ActsAt keeps the active version too | 1 |
| `G5:binding-required` | A missing or malformed binding is signed | 3 |
| `G5:declared-v2` | The declared envelope says v: 1 | 49 |
| `G5:mcp-bearer-generic` | The HTTPS bearer client's generic act goes to a named tool | 4 |
| `G5:mcp-bearer-unnamed` | A kind with no named tool and no binding is sent to the act tool | 1 |
| `G5:rpc-bearer-binding` | Over RPC a bearer's generic act drops its binding | 14 |
| `G5:grant-problems` | A grant with a problem is built as an empty grant | 2 |
| `G5:grant-legacy-shape` | In a v1 room the grant is built in the v2 shape | 2 |
| `G5:meaning-legacy` | A legacy record does not say where the v1 era ended | 3 |
| `G5:meaning-legacy-kinds` | Any kind is a legacy kind under a v1 version | 1 |
| `G5:meaning-platform` | A platform kind is read as unknown | 2 |
| `G5:meaning-own` | An inherited property name is read as a declared kind | 1 |
| `G5:meaning-label` | A declared record shows its kind's name, not its label | 6 |
| `G5:meaning-retired` | A declared record does not say its kind was retired | 5 |
| `G5:governs` | A version governs the seq of the next activation | 3 |
| `G5:governs-since` | A version governs entries before it began | 3 |
| `G5:fields-fixed-scope` | An open with a scope template still asks for a scope | 1 |
| `G5:fields-step` | Every step field is required | 17 |
| `G5:fields-required` | RequiredFor is ignored | 1 |
| `G5:fields-once` | A field two steps share is listed twice | 1 |
| `G5:built-for` | A named method carries the room's own declaration's binding | 2 |
| `G5:built-for-lanes` | The built-for binding ignores the room's lanes | 1 |
| `G5:grant-star` | * asks for every declared kind, grantable or not | 3 |
| `G5:grant-binding` | The grant map names a fixed binding | 4 |
| `G5:grant-refuse` | A kind the role may not grant is dropped without a word | 2 |
| `G5:grant-platform` | Renew is never granted | 3 |
| `G5:steps-lease-optional` | The table says take requires a lease | 2 |
| `G5:steps-note-max` | The table says release requires a note | 1 |
| `G5:steps-review-scope` | The table says a review's scope is optional | 1 |
| `G5:cli-binding-required` | Artroom act runs without --binding | 1 |
| `G5:cli-binding-format` | A malformed --binding is used | 1 |
| `G5:cli-legacy` | Artroom act runs in a v1 room | 1 |
| `G5:cli-undeclared` | An undeclared kind is a usage error, not a refusal | 1 |
| `G5:cli-stale` | A binding that is not the active one is signed and sent | 1 |
| `G5:cli-target` | A target the declaration does not accept is sent | 1 |
| `G5:cli-lease` | The lease read for the user is wrong | 1 |
| `G5:cli-generation` | The generation read for the user is wrong | 1 |
| `G5:cli-head` | A version's head is not read for the user | 1 |
| `G5:cli-not-holder` | Someone who does not hold the lane gets a usage error, not the refusal | 1 |
| `G5:cli-missing` | An act with a required field missing is sent | 1 |
| `G5:cli-binding-given` | Artroom act sends the active binding, not the one given | none: equivalent, see above |
| `G5:cli-acts-one` | Artroom acts accepts --at and --policy together | 1 |
| `G5:cli-log-version` | The log reads every entry under the first version it fetched | 1 |
| `G5:cli-log-meaning` | The log shows no labels | 1 |
| `G5:cli-stale-old` | What changed is listed against the previous version, whatever the user read | 1 |
| `G5:cli-stale-help` | After binding-stale the active meaning is not printed | 2 |
| `G5:cli-int` | A whole number out of its range is sent | 1 |
| `G5:cli-bool` | Anything but true is false | 1 |
| `G5:cli-enum` | An enum value outside its list is sent | 1 |
| `G5:cli-field-unknown` | --set with an unknown field is dropped without a word | 1 |
| `G5:cli-body-unknown` | --body with an unknown field is sent | 1 |
| `G5:cli-kind-label` | A legacy record prints a label too | 3 |
| `G5:cli-kind-retired` | The log does not say a kind was retired | 2 |
| `G5:cli-refusal-current` | A stale refusal does not print the active binding | 2 |
| `G5:cli-explain-meaning` | Explain does not print the meaning's policy version and binding | 1 |
| `G5:cli-changes-body` | A changed field is not listed | 1 |
| `G5:cli-changes-hold` | A changed hold is not listed | 1 |
| `G5:cache-drop` | A later activation drops nothing the handle kept | 8 |
| `G5:cache-later` | An activation the handle already knew drops what it kept | 2 |
| `G5:cache-refusal` | A refusal that names the active version is not a sign of an activation | 2 |
| `G5:cache-update` | An update with an activation is not a sign | 3 |
| `G5:cache-log` | A log page with an activation is not a sign | 1 |
| `G5:cache-active` | A read of the active catalogue is not a sign | 1 |
| `G5:cache-read` | A read of another version is not a sign | 3 |
| `G5:cache-fresh` | Fresh answers from what the handle kept | 2 |
| `G5:cache-replace` | A fresh answer does not replace the kept one | 1 |
| `G5:cache-saw-named` | A named act's refusal is not looked at for an activation | 1 |
| `G5:cache-saw-generic` | A generic act's refusal is not looked at for an activation | 1 |
| `G5:cache-saw-poll` | A long-poll update is not looked at | 1 |
| `G5:cache-saw-watch` | A watched update is not looked at | 1 |
| `G5:cache-saw-stream` | An update on the RPC stream is not looked at | 1 |
| `G5:title-order` | The first field is the first one typed, not the first by name | 3 |
| `G5:title-first` | Scope may name a record | 5 |
| `G5:title-first-because` | Because may name a record | 1 |
| `G5:title-bool` | A yes or no value is shown as true or false | 1 |
| `G5:title-goal` | A thread with a goal is named by its opening act | 5 |
| `G5:title-opening` | A thread with no goal is named by its ID | 5 |
| `G5:lane-kind` | Every thread reads as a claim thread | 1 |
| `G5:envelope-of` | A recorded refusal has no envelope | 1 |
| `G5:cli-thread` | Artroom act does not name the thread it opened | 1 |
| `G5:cli-thread-goal` | Artroom act names a thread that has a goal by the act | 1 |
| `G5:cli-thread-opened` | Artroom act prints a thread line for an act that opened nothing | 1 |
| `G5:mcp-thread` | The act tool names a thread with no goal by its ID | 2 |
| `G5:mcp-thread-opened` | The act tool says an act opened a thread when it did not | 1 |
| `G5:mcp-thread-goal` | The act tool names a thread that has a goal by the act | 2 |
| `G5:acts-fresh` | The acts tool answers an earlier version from what the handle kept | 1 |

</details>

### Gates of the lane's own head

These gates are of old heads. No whole-head gate has been run at the present head; see "Gates since `b7b9d8df`".

These are the gates before composition. The gates of the composed head are under "Composition".

Run one after another at commit `b9ecd3af`, in the worktree, with nothing else running there. The commit that adds this section changes `plans/README.md` only; `git diff --check` and `git status` were run again after it.

| Gate | Exit | Result |
|---|---|---|
| `npm run typecheck` (root, every package) | 0 | |
| `npm test` (root, every package) | 0 | checkers 43; CLI 180; client 116 and 2; log 198 and 193; MCP 87 and 5; policy 313, and 311 with 2 skipped; Room 269, 615, and 533 with 82 skipped; UI 141 |
| client `npm run typecheck` | 0 | |
| client `npm test` | 0 | 116 in node, 2 in workerd |
| MCP `npm run typecheck` | 0 | |
| MCP `npm test` | 0 | 87 in node, 5 in workerd |
| CLI `npm run typecheck` | 0 | |
| CLI `npm test` | 0 | 180 |
| Room `npm run typecheck` | 0 | |
| Room `npm test` | 0 | node 269; workerd, legacy run 615; workerd, declared run 533 passed and 82 skipped |
| `git diff --check 2cd97b88` | 0 | no whitespace errors |
| `git status --porcelain` | | empty |

No test failed and none was skipped that the stage 2 candidate does not skip. The declared run skips the files that found their own rooms, as stage 2's own tests do; the stage 5 integration file is one of them.

The UI count there is the stage 2 candidate's UI, before the UI lane was merged.

### Not changed here

`packages/log`, `packages/git`, `packages/checkers` and `packages/ui`; the Room's admission, schema, authority, store and migrations; the design note; the Worker entry and wrangler configuration; the deployed spike. `LICENSE`, `NOTICE` and `AGENTS.md` are untouched.

### The UI (companion lane, branch `request/decl-stage5-ui`)

> **Changed at composition.** This subsection is the UI lane's report as written at `5dc0d044`. Four things in it are no longer true of the composed head. Choice 4: the adapter keeps no earlier catalogue; the handle does, and drops them on a later activation. Choice 8: the thread's name comes from `threadTitle`. Choice 9: the thread list reads `Lane.kind`. The four items under "Asked of the companion lane" are answered in "The UI lane's four questions" and done. The suite has 195 tests and 51 mutants at the composed head. The gates of the composed head are under "Composition".


Status on 2026-10-04: reviewed as part of stage 5, approved in review `b90f2211` at `6b877f6b`. The live Acts page entry and its real-browser witness are owed under request `cfbde32f`. All of it is on the integration branch `request/test-overhead`; nothing has landed on main. The line below is the earlier status, kept as history.

Earlier status: implemented on the stage 5 API commit `2eeb7e72`, as two commits, head `5dc0d04400336c31523054f765d16382960c3c91`. It changes only `packages/ui`. It is provisional in the same way as the rest of stage 5: it sits on the stage 2 candidate and is recomposed on main after stage 2 lands. Nothing was pushed or deployed.

#### What was built

- **Reads in the adapter.** `RoomSnapshot.catalogue` is the active policy version's declarations and bindings, or null when the transport cannot read them. `RoomAdapter` gains `readCatalogue()`, `catalogueAt(seq)` and `act(kind, target, body, binding)`. The UI still takes an `HttpRoom` from its caller and still has one contract import site (`src/room/contract.ts`). The live adapter calls the handle's `acts`, `actsAt` and `act`. A live room's Policy screen now shows the active version and the entry it took effect at.
- **Records under D(s)** (`src/room/live/describe.ts`, `live-room.ts`, `src/room/acts.ts`). Each act and each recorded refusal is read under the catalogue that governs its own seq, one read per policy version in the loaded window. A feed entry carries its `meaning`: the label in force at its seq, the policy version, the binding, the target in words, each body field by name, and the seq where the kind was retired.
- **The feed and the why panel** (`screens/Room.tsx`, `ui/bits.tsx`, `ui/WhyDialog.tsx`). A declared record shows who, its label, its target and its fields. A retired kind shows "Retired at seq N". A record of a kind the policy did not declare shows its kind and fields and says so. The why panel has a section "What it meant at entry N". It uses the meaning the Room computed (`Explanation.meaning`) when there is one.
- **The Acts screen** (`screens/Acts.tsx`, route `#/acts`, key `4`). It lists the active declarations with label, help, who may sign and what each acts on. For a chosen act it builds a form from `fieldsOf(declaration, shape)`: one input per field by type, required and optional marked, the limits stated. It checks the limits before sending and sends once, with the binding of the declarations the person chose the act from.
- **The second demo room** (`?app=setlist`). It is the live adapter over an in-memory room (`mock/memory-room.ts`) whose policy declares five acts for a band's setlist (`mock/setlist.ts`): start a song, add a part, cue, sign off, wrap up. A second policy version renames one, reshapes another and drops a third. None is a code-review verb. The declarations validate under `validatePolicyV2` and use every declared field type.

#### Choices

1. **A code-review sentence is chosen by binding, not by name.** A record whose binding equals `builtForBinding(catalogue, kind)` keeps the sentence it always had ("@ash claimed ..."). Any other declared record is shown generically, as "who: label." with its fields. A room that declares its own `claim` gets the generic rendering.
2. **Legacy records are unchanged.** A record under a `v1` document, and `renew` and `roster` in every room, keep their sentences and get no field list in the feed. Their meaning, with the seq where the `v1` policy was replaced, is in the why panel.
3. **When declarations cannot be read, nothing is guessed.** Only a `v: 1` envelope of one of the nine legacy kinds is read as a legacy record. Anything else says its meaning could not be read. The snapshot still loads, with `catalogue: null`.
4. **Earlier catalogues are read again after an activation.** A new policy version can retire a kind of an ended version, so an ended version's catalogue is not final. The adapter keeps catalogues only while the active policy version is unchanged.
5. **Evidence by step.** Reviews, checks and notes for the Proposal screen are rebuilt by the step a record ran under its own declaration (`review`, `check`, `comment`), so an application's own name for a review still counts. A comment with no `text` field is not a note.
6. **A stale act is never resent by the UI.** On `binding-stale` the form reads the declarations again, lists what changed (fields, steps, targets, threads, hold), and waits. "Send it with the new meaning" validates the form against the new declaration first. If a new required field is empty, nothing is sent.
7. **An open form keeps the declarations it was opened with.** A snapshot refresh behind it changes nothing in it. Only the person's confirmation replaces them.
8. **A thread opened by an application's act has no goal.** The Room screen names it by that act's label and first field, read under the act's own entry.
9. **The thread list in a form** offers threads whose opening act's kind is in the declaration's `threads`. The kind comes from the loaded feed, because `Lane` carries no kind. A thread whose opening entry is outside the loaded window is offered too.
10. **A change that arrives during a load is not lost.** The live adapter loads once more after it. Before, an update in that window was dropped until the next one.

#### Tests

53 new tests in three files; the 141 existing tests are unchanged and pass.

| Case | Test file | Tests |
|---|---|---|
| Activation: label, target and typed fields | `declared-rendering.test.tsx` | "an act of an application's own kind is a sentence with the label, and its typed fields by name"; "the feed shows the record's label, target and fields, and the thread is named by the act that opened it" |
| Retirement | `declared-rendering.test.tsx` | "retirement: a record of a kind a later policy dropped says where it was retired, and still shows its label and fields" |
| Name reuse with a changed shape | `declared-rendering.test.tsx` | "name reuse with a changed shape: the old record keeps the old meaning and its retirement; the new record has the new one" |
| Label-only change | `declared-rendering.test.tsx` | "label-only change: the old record shows the old label, a new one the new label, under one binding" |
| Legacy record | `declared-rendering.test.tsx` | "a legacy record keeps the sentence it always had, after the room moves to declared acts"; "a platform act reads the same in every room" |
| Unknown kind | `declared-rendering.test.tsx` | "a kind the policy in force did not declare: its kind, its fields, and a plain statement"; "when the room cannot give its declarations, only a v: 1 record of a legacy kind is read as one"; "a kind it has no sentence for falls back to the plain statement" |
| Sentence by binding | `declared-rendering.test.tsx` | "a v2 room with the code-review declarations keeps the review sentences; a room that means something else by claim does not" |
| Evidence by step | `declared-rendering.test.tsx` | "a review or a comment under an application's own name is still evidence for the review screens, by its step" |
| The why panel | `declared-rendering.test.tsx` | "it shows what the kind meant at that entry, its fields, and that a later policy dropped it"; "the meaning the room computed is the one shown" |
| Each field type and its limits | `acts-fields.test.ts` | ten tests under "reading one field": required and optional, text (bytes), int (range), a step's int, bool, enum, globs, member, act and segment, a step's commit, an unknown type |
| Body, targets, record view, what changed | `acts-fields.test.ts` | nine tests, among them "a body is built only when every field reads", "targets by shape", "a new required field, a changed limit and a removed field are each named" |
| The list of acts | `acts-screen.test.tsx` | "every declaration is listed with its label, help, who may sign and what it acts on, in the room's words"; "a room on the built-in review acts says so, and offers no form"; "an address that names an act the room does not declare says so" |
| The form, by field type | `acts-screen.test.tsx` | four tests under "the form is built from the declaration: one input per field, by type" |
| Limits before sending | `acts-screen.test.tsx` | "the declared limits are checked first: a wrong field is named and nothing is sent"; "a target that is missing is named and nothing is sent" |
| A submit with the binding | `acts-screen.test.tsx` | "a good act is sent once, with exactly the binding of the declarations the person was looking at, and is then in the feed" |
| Refusal wording as given | `acts-screen.test.tsx` | "a refusal shows the room's rule with the reason and fix as the declaration worded them"; "an act the viewer's role may not sign is refused by the room, and the refusal is shown" |
| Binding-stale | `acts-screen.test.tsx` | "nothing is resubmitted until the person confirms; the form says what changed; a new required field stops the resend"; "confirming sends once more, with the new binding, when the form still fits the new meaning"; "the person can decline: nothing more is sent and the list returns" |
| Kind-undeclared | `acts-screen.test.tsx` | "the kind is gone (kind-undeclared): the form says so, reads the acts again and sends nothing more" |
| A non-code-review application, end to end | `declared-rendering.test.tsx`, `acts-screen.test.tsx`, `e2e/smoke.spec.ts` | "its feed, threads and acts are in its own words, and none of the review verbs appears"; "a person prepares and sends an act of an application that is not code review, and sees it recorded"; the browser test "a room that declares its own acts" |
| The application itself | `acts-fields.test.ts` | "both policy versions validate with no problem"; "it shares no kind with the code-review seven, and uses every declared field type" |

No existing assertion was changed. The browser test run rewrote the committed screenshots, because the top bar has a new item, and added three (`declared-room-light`, `declared-acts-light`, `declared-form-light`).

#### Mutation table

Each mutant was applied alone by `scratchpad/mut5ui/run.py` at the final source. It edits one guard, runs the whole UI suite (`npx vitest run`) with the JSON reporter, records the failing tests, and writes the file's original bytes back in a `finally`. It never runs `git checkout`. A failure counts only if it is an assertion failure; a timeout or a file that fails to load is flagged apart. Each guard is one statement marked `// G5U:<id>`, and a check before the run confirmed 48 markers and 48 mutants, each applying exactly once.

**48 mutants, all red by assertion.** None survived. No red was a timeout or a load failure.

| # | Guard | File | Mutation | Red by assertion | A test it turned red |
|---|---|---|---|---|---|
| 1 | `G5U:required` | `room/acts.ts` | An empty required field is accepted | 4 | `acts-fields.test.ts`: reading one field: each type, with its declared limits a required field left empty is a problem; an optional one is left out of the body; and 3 more |
| 2 | `G5U:optional-absent` | `room/acts.ts` | An empty optional field is sent as an empty string | 3 | `acts-fields.test.ts`: reading one field: each type, with its declared limits a required field left empty is a problem; an optional one is left out of the body; and 2 more |
| 3 | `G5U:text-max` | `room/acts.ts` | The text limit counts characters, not bytes | 1 | `acts-fields.test.ts`: reading one field: each type, with its declared limits text: the limit is in bytes, and the text is sent as typed |
| 4 | `G5U:int-whole` | `room/acts.ts` | A value that is not a whole number is accepted | 1 | `acts-fields.test.ts`: reading one field: each type, with its declared limits int: whole numbers only, inside the declared range |
| 5 | `G5U:int-min` | `room/acts.ts` | An int below the minimum is accepted | 2 | `acts-fields.test.ts`: reading one field: each type, with its declared limits int: whole numbers only, inside the declared range; and 1 more |
| 6 | `G5U:int-max` | `room/acts.ts` | An int above the maximum is accepted | 3 | `acts-fields.test.ts`: reading one field: each type, with its declared limits int: whole numbers only, inside the declared range; and 2 more |
| 7 | `G5U:bool` | `room/acts.ts` | A bool accepts any text | 1 | `acts-fields.test.ts`: reading one field: each type, with its declared limits bool: yes or no, nothing else |
| 8 | `G5U:enum` | `room/acts.ts` | An enum accepts any text | 2 | `acts-fields.test.ts`: reading one field: each type, with its declared limits enum: one of the declared values; and 1 more |
| 9 | `G5U:globs-max` | `room/acts.ts` | The count of path patterns is not limited | 1 | `acts-fields.test.ts`: reading one field: each type, with its declared limits globs: one per line, blank lines dropped, no more than the declared count |
| 10 | `G5U:member` | `room/acts.ts` | A member field accepts any text | 1 | `acts-fields.test.ts`: reading one field: each type, with its declared limits member, act and segment are fixed formats |
| 11 | `G5U:act` | `room/acts.ts` | An entry field accepts any text | 1 | `acts-fields.test.ts`: reading one field: each type, with its declared limits member, act and segment are fixed formats |
| 12 | `G5U:segment` | `room/acts.ts` | A segment accepts slashes and pattern characters | 1 | `acts-fields.test.ts`: reading one field: each type, with its declared limits member, act and segment are fixed formats |
| 13 | `G5U:sha` | `room/acts.ts` | A commit field accepts any text | 1 | `acts-fields.test.ts`: reading one field: each type, with its declared limits a step's commit is 40 hex digits |
| 14 | `G5U:unknown-type` | `room/acts.ts` | A field of an unknown type is sent as text | 1 | `acts-fields.test.ts`: reading one field: each type, with its declared limits a field type this page does not know is refused, never guessed |
| 15 | `G5U:body-problems` | `room/acts.ts` | A body is built although a field has a problem | 3 | `acts-fields.test.ts`: reading a whole body and a target a body is built only when every field reads; each problem is named by its field; and 2 more |
| 16 | `G5U:target-lane` | `room/acts.ts` | A missing thread is accepted | 2 | `acts-fields.test.ts`: reading a whole body and a target targets by shape; and 1 more |
| 17 | `G5U:target-generation` | `room/acts.ts` | A version that is not a positive whole number is accepted | 1 | `acts-fields.test.ts`: reading a whole body and a target targets by shape |
| 18 | `G5U:target-entry` | `room/acts.ts` | An entry target that is not an entry ID is accepted | 1 | `acts-fields.test.ts`: reading a whole body and a target targets by shape |
| 19 | `G5U:record-fields` | `room/acts.ts` | A record's field values are dropped | 11 | `acts-fields.test.ts`: a record under the meaning in force at its own seq (R-DECL-23) the label, the retirement, the target in words and every field by name; because is left to the reasons; and 10 more |
| 20 | `G5U:record-label` | `room/acts.ts` | A record shows its kind where its label belongs | 13 | `acts-fields.test.ts`: a record under the meaning in force at its own seq (R-DECL-23) the label, the retirement, the target in words and every field by name; because is left to the reasons; and 12 more |
| 21 | `G5U:record-retired` | `room/acts.ts` | A record never says its kind was retired | 6 | `acts-fields.test.ts`: a record under the meaning in force at its own seq (R-DECL-23) the label, the retirement, the target in words and every field by name; because is left to the reasons; and 5 more |
| 22 | `G5U:changes-steps` | `room/acts.ts` | Changed steps are not reported | 1 | `acts-fields.test.ts`: what changed between two meanings of one kind changed steps, a new and a lost target, the threads and the hold |
| 23 | `G5U:changes-added` | `room/acts.ts` | A new field is not reported | 2 | `acts-fields.test.ts`: what changed between two meanings of one kind a new required field, a changed limit and a removed field are each named; and 1 more |
| 24 | `G5U:changes-field` | `room/acts.ts` | A changed field is not reported | 2 | `acts-fields.test.ts`: what changed between two meanings of one kind a new required field, a changed limit and a removed field are each named; and 1 more |
| 25 | `G5U:changes-removed` | `room/acts.ts` | A removed field is not reported | 1 | `acts-fields.test.ts`: what changed between two meanings of one kind a new required field, a changed limit and a removed field are each named |
| 26 | `G5U:sentence-default` | `room/live/describe.ts` | The sentence table invents a sentence for a kind it was not written for | 1 | `declared-rendering.test.tsx`: the sentence table is only for the kinds it was written for a kind it has no sentence for falls back to the plain statement, whatever vocabulary it is read under |
| 27 | `G5U:unread-legacy-only` | `room/live/describe.ts` | With no readable declarations, a v: 2 record is read as a legacy one by its name | 1 | `declared-rendering.test.tsx`: a record whose kind had no meaning is shown plainly, never dropped when the room cannot give its declarations, only a v: 1 record of a legacy kind is read as one |
| 28 | `G5U:built-for-sentence` | `room/live/describe.ts` | A record under the code-review declaration loses its sentence | 1 | `declared-rendering.test.tsx`: the code-review sentences belong to the code-review declarations, by binding and not by name a v2 room with the code-review declarations keeps the review sentences; a room that means something else by claim does not |
| 29 | `G5U:declared-sentence` | `room/live/describe.ts` | A declared record is given a review sentence by its name | 11 | `acts-screen.test.tsx`: sending an act a good act is sent once, with exactly the binding of the declarations the person was looking at, and is then in the feed; and 10 more |
| 30 | `G5U:unknown-shown` | `room/live/describe.ts` | An undeclared kind is not said to be undeclared | 1 | `declared-rendering.test.tsx`: a record whose kind had no meaning is shown plainly, never dropped a kind the policy in force did not declare: its kind, its fields, and a plain statement |
| 31 | `G5U:refusal-label` | `room/live/describe.ts` | A refused declared act is named by its kind, not its label | 1 | `declared-rendering.test.tsx`: the code-review sentences belong to the code-review declarations, by binding and not by name a v2 room with the code-review declarations keeps the review sentences; a room that means something else by claim does not |
| 32 | `G5U:meaning-attached` | `room/live/describe.ts` | Feed entries carry no meaning | 9 | `acts-screen.test.tsx`: the form is built from the declaration: one input per field, by type segment, globs, a thread to act on, and the version step's own fields; and 8 more |
| 33 | `G5U:refresh-again` | `room/live/live-room.ts` | A change that arrives during a load is lost | 2 | `acts-screen.test.tsx`: the form is built from the declaration: one input per field, by type the thread list offers only threads the act may act on; and 1 more |
| 34 | `G5U:catalogue-unavailable` | `room/live/live-room.ts` | A room that cannot give its declarations fails the whole load | 3 | `declared-rendering.test.tsx`: a record whose kind had no meaning is shown plainly, never dropped when the room cannot give its declarations, only a v: 1 record of a legacy kind is read as one; and 2 more |
| 35 | `G5U:governs` | `room/live/live-room.ts` | Every record is read under the first catalogue that was read | 3 | `declared-rendering.test.tsx`: old records keep the meaning they had label-only change: the old record shows the old label, a new one the new label, under one binding; and 2 more |
| 36 | `G5U:meaning-at-seq` | `room/live/live-room.ts` | Records are read under the active declarations | 5 | `declared-rendering.test.tsx`: old records keep the meaning they had label-only change: the old record shows the old label, a new one the new label, under one binding; and 4 more |
| 37 | `G5U:built-for-binding` | `room/live/live-room.ts` | The code-review sentence is chosen by the kind's name, not its binding | 1 | `declared-rendering.test.tsx`: the code-review sentences belong to the code-review declarations, by binding and not by name a v2 room with the code-review declarations keeps the review sentences; a room that means something else by claim does not |
| 38 | `G5U:catalogue-refresh` | `room/live/live-room.ts` | Earlier catalogues are never read again after an activation | 2 | `declared-rendering.test.tsx`: old records keep the meaning they had retirement: a record of a kind a later policy dropped says where it was retired, and still shows its label and fields; and 1 more |
| 39 | `G5U:explain-meaning` | `room/live/live-room.ts` | The meaning the room computed is ignored | 1 | `declared-rendering.test.tsx`: the why panel reads a record under its own entry's policy the meaning the room computed is the one shown |
| 40 | `G5U:act-binding` | `room/live/live-room.ts` | The adapter rebinds the act to the active meaning by itself | 3 | `acts-screen.test.tsx`: a meaning that changed behind the form (binding-stale) nothing is resubmitted until the person confirms; the form says what changed; a new required field stops the resend; and 2 more |
| 41 | `G5U:evidence-by-step` | `room/live/live-room.ts` | A declared review is not evidence | 1 | `declared-rendering.test.tsx`: activation: a declared record shows its label, its target and its fields a review or a comment under an application's own name is still evidence for the review screens, by its step |
| 42 | `G5U:thread-filter` | `screens/Acts.tsx` | Every thread is offered, whatever its kind | 1 | `acts-screen.test.tsx`: the form is built from the declaration: one input per field, by type the thread list offers only threads the act may act on |
| 43 | `G5U:no-send-on-problems` | `screens/Acts.tsx` | The act is sent although a field or the target is wrong | 3 | `acts-screen.test.tsx`: sending an act the declared limits are checked first: a wrong field is named and nothing is sent; and 2 more |
| 44 | `G5U:send-binding` | `screens/Acts.tsx` | A confirmed resend carries the binding the form first held | 1 | `acts-screen.test.tsx`: a meaning that changed behind the form (binding-stale) confirming sends once more, with the new binding, when the form still fits the new meaning |
| 45 | `G5U:gone` | `screens/Acts.tsx` | A kind that is gone is shown as an ordinary refusal | 1 | `acts-screen.test.tsx`: a meaning that changed behind the form (binding-stale) the kind is gone (kind-undeclared): the form says so, reads the acts again and sends nothing more |
| 46 | `G5U:stale-no-resend` | `screens/Acts.tsx` | A stale act is sent again at once, with nobody asked | 3 | `acts-screen.test.tsx`: a meaning that changed behind the form (binding-stale) nothing is resubmitted until the person confirms; the form says what changed; a new required field stops the resend; and 2 more |
| 47 | `G5U:confirm-resend` | `screens/Acts.tsx` | Confirming the new meaning sends nothing | 2 | `acts-screen.test.tsx`: a meaning that changed behind the form (binding-stale) nothing is resubmitted until the person confirms; the form says what changed; a new required field stops the resend; and 1 more |
| 48 | `G5U:form-holds-catalogue` | `screens/Acts.tsx` | An open form follows every refresh of the declarations | 1 | `acts-screen.test.tsx`: a meaning that changed behind the form (binding-stale) nothing is resubmitted until the person confirms; the form says what changed; a new required field stops the resend |

#### Gates

Run at head `5dc0d04400336c31523054f765d16382960c3c91`, under bash, with exit codes checked.

| Gate | Exit | Result |
|---|---|---|
| `npm ci` (root) | 0 | installed |
| `npm run typecheck` in `packages/ui` | 0 | generates the policy declarations, then checks the UI |
| `npm test` in `packages/ui` | 0 | 14 files, 194 passed (141 before, 53 new) |
| `npm run typecheck` (root) | 0 | every workspace |
| `npm run e2e` in `packages/ui` (not a requested gate) | 0 | 9 passed, 1 new |
| `git diff --check` | 0 | clean |

The root `npm test` was not run by this lane; the companion lane runs it on the composed branch.

#### Not done

- The form has no input for `because`.
- The form does not send `recover` or the platform kinds.
- A lost answer is not retried from the form. The adapter passes no idempotency key and leaves retries to the handle.
- The page is still not wired to a live room: `main.tsx` runs the two demo rooms, and `LiveRoom` takes a handle from its caller (README gap 9).
- The Room, Proposal and Needs-you screens keep the review application's words ("lane", "claim", "generation").
- The in-memory room is a stand-in. It has no signatures, expiring leases, policy rules, landing or idempotency. The UI has not been run against the real Room with a `v2` document.
- Stage 4's steps and hold settings are described by `fieldsOf` already, but no test here exercises them.

#### Asked of the companion lane

The API gave everything the UI needed to build. Four things would remove a workaround or a risk:

1. **An ended catalogue is not final.** `retired` on a kind of an ended version changes when a later activation drops that kind. The API summary says the client handle keeps ended versions. If it keeps them for good, a reader sees a stale answer after a later activation. The UI drops its own catalogues when the active policy version changes; the handle should do the same, or say that `actsAt` may be stale.
2. **A thread's kind is not in the `lanes` read.** `Lane` has no `kind`, so the form finds the threads an act may act on from the opening entry in the loaded feed. A `kind` on `Lane` (R-DECL-6) would make that exact.
3. **A thread opened by an application's act has an empty `goal`.** The UI names it from the opening act. Nothing is needed if that is the intended reading.
4. **The review screens read declared records through casts.** A record of a declared act with step `review`, `check` or `comment` has the fields of a `Review`, `Check` or `Note`, but the log entry's envelope is typed as the `v: 1` `Envelope`. The UI reads it as `AnyEnvelope` and casts.

Nothing here needs the planner or hugh to decide.

### Since `b7b9d8df`

The sections that follow are in the order the findings were made. Each names the act that records the finding, the commit that repairs it, its tests and its mutants. Each mutant named in these sections was run with the newer runners (`mut5/run2.py` and the UI harness's runner): it passes the root typecheck, is red by a named assertion, and its file was restored.

| Finding | Recorded as | Repaired at |
|---|---|---|
| The UI read inherited functions for fields named `toString` or `valueOf`; a lost answer was shown as a refusal; an explicit refresh left historical meaning stale | checker `fb27de86` | `f606dd89` |
| The client kept the caller's own target and body objects; an older historical read repopulated the cache | checker `43e8fe3b` | `3e6241df` |
| A delayed catalogue read overwrote a newer activation; browser case 9 | checker `fcd7391d` | `4567a490`, `5590c318` |
| Which field names a thread | planner `c37653e1` | `3a03d405` |
| A failed read undid a confirmed activation | planner `0fd98c41` | `624dbb9f` |
| The CLI printed the label read at preparation | checker `0b9119de`, planner `b22d29ee` | `ff266354` |
| An act finished from the journal printed the raw kind and no thread | planner `23ae8924`, corrected by `c6f6ad78` | `ff266354` |
| The same catalogue object let an earlier error clear availability | checker `8df737b8`, planner `80bef90a` | `c74f3696` |
| A saved act was printed under the kind the finishing run typed | both reviewers, in the workroom | `bdc35c53` |

### The checker's preliminary UI findings (act `fb27de86`)

The checker read the UI at `5dc0d044` and recorded three defects, each with baselines that pass and assertions that fail. This branch had already repaired the first and the third when it was composed; it had no tests of its own for them. The second was open. All three now have tests in [packages/ui/test/review-fb27de86.test.tsx](../packages/ui/test/review-fb27de86.test.tsx), with the checker's baselines beside them, at `8f3615d5` (repairs and tests in `f606dd89`, the README in `8f3615d5`). The checker's own fifteen probes, run once against this branch, pass.

| # | Defect | Rule | Repair | Tests |
|---|---|---|---|---|
| 1 | A legal field named `toString` or `valueOf` read the inherited function: an optional one left out threw, a required one left out threw, and the form showed the function as the field's value and as its problem | R-DECL-12 | `own(map, name)` reads form values, problems and bodies by own property only (`packages/ui/src/room/acts.ts`, `src/screens/Acts.tsx`). The names stay legal. A sweep of `packages/ui/src` found no other lookup by a declared name that reads a plain object: historical kinds are kept in a map with no prototype, and field changes are compared through `Map` | "a field named toString or valueOf": three baselines; left out when optional; one named problem when required; the control starts empty with no problem; a required one shows only its own problem, sends nothing, and is then sent under its own name |
| 2 | An answer that was lost was shown as "The room did not take the act", though the room had recorded the act | R-IDEM-2 | The form keeps what it sent as one intent: target, body, binding and an idempotency key it makes. When the error says `maybeRecorded`, the form says the outcome is unresolved and offers "Ask again, the same act", which sends that intent unchanged with the same key. While unresolved it sends no other act and shows no Send button. The adapter passes the key to the room and reads the room again after an act, also when the answer was lost. A failure that says nothing of a record keeps the old wording | "an answer that was lost is not a rejection": two baselines; unresolved, never "not taken"; the page reads the room again with change notices held back; asking again is the same act and key, one entry; an act the room never saw is recorded once; no new act while unresolved; asking again after the meaning changed is `binding-stale`, shown, not resent |
| 3 | After an explicit read of the declarations, the catalogue kept for `D(s)` was the old one, with `until: null`. A later act was read under the old policy, and a retired kind had no retired mark | R-DECL-23 | `readCatalogue` replaces the catalogue that `governing` answers from, as a load does | "an explicit read of the declarations is what D(s) is answered from": the unchanged case answers from what is kept and asks the room nothing; after an activation a later act is read under the new policy and an earlier entry under the old one, whose interval now ends; after a retirement the old catalogue has its end and the retired mark |

The stand-in room (`MemoryRoom`) had no idempotency, so asking again could not be tested against it. It now answers a key as R-IDEM-2 to R-IDEM-4 say: the same act returns its record, another act is `idempotency-mismatch`, and a refusal it did not record leaves the key free. Four tests hold it to that.

What this does not show. The retry is tested against the stand-in room, not over HTTPS or MCP against a real Room: that the transport's uncertain error and the Room's replay meet is the client's and the Room's tests' to show. The form keeps the intent in memory only; closing the page loses it, and the README says so.

**Mutants.** The UI runner is brought to the stage 2 standard (checker's `b256f7a0`): with each mutant applied it runs the root `npm run typecheck`, then the UI suite, and records the tested head and tree, the typecheck's exit and errors, every red test with its full failure message, the file's SHA-256 before and after, and `git status`. Fifteen mutants are new, each a compiling fault, and two existing ones (`G5U:act-binding`, `G5U:send-binding`) follow their moved statements. `G5U:governs` failed the typecheck as first written (an unused import) and is rewritten to compile. These, with `G5U:own-name` and `G5U:catalogue-refresh`, were run at `8f3615d5`: 20 mutants, all typecheck, all red by a named assertion, every file restored. The other 46 mutants of the UI inventory have not been run under the new runner; some use a literal `false`, which may not typecheck. The whole inventory is owed at the final composed head.

| Mutant | What it does | Typecheck | A red assertion |
|---|---|---|---|
| `G5U:governs` | every record is read under the active catalogue | 0 | 7 red. `review-fb27de86.test.tsx`: "after an activation and an explicit read, an act accepted later is read under the new policy, and an earlier entry under": `AssertionError: expected 'act_2_2eeb2724' to be 'act_1_3f90684a' // Object.is equality` |
| `G5U:catalogue-refresh` | the first active catalogue read answers for good, also after an activation | 0 | 2 red. `declared-rendering.test.tsx`: "old records keep the meaning they had retirement: a record of a kind a later policy dropped says where it was retired, a": `AssertionError: expected { vocabulary: 'declared', …(7) } to match object { label: 'Wrap up', retired: 4, …(1) }` |
| `G5U:act-binding` | the adapter rebinds the act to the active meaning by itself | 0 | 4 red. `review-fb27de86.test.tsx`: "asking again after the meaning changed is answered binding-stale: the form shows the new meaning and sends nothing by it": `AssertionError: expected null not to be null` |
| `G5U:send-binding` | a confirmed resend carries the binding the form first held | 0 | 1 red. `acts-screen.test.tsx`: "a meaning that changed behind the form (binding-stale) confirming sends once more, with the new binding, when the form s": `AssertionError: expected null not to be null` |
| `G5U:own-name` | a field named like an inherited property reads the inherited value | 0 | 5 red. `review-fb27de86.test.tsx`: "the control of an optional field toString starts empty, with no problem shown, and the act is sent without it": `AssertionError: expected [Function toString] to be '' // Object.is equality` |
| `G5U:own-form-value` | a field's control starts with whatever the form state inherits under its name | 0 | 2 red. `review-fb27de86.test.tsx`: "the control of an optional field toString starts empty, with no problem shown, and the act is sent without it": `AssertionError: expected [Function toString] to be '' // Object.is equality` |
| `G5U:own-form-problem` | a field shows as its problem whatever the problem map inherits under its name | 0 | 2 red. `review-fb27de86.test.tsx`: "the control of an optional field toString starts empty, with no problem shown, and the act is sent without it": `AssertionError: expected <p class="small tone-bad" …(1)></p> to be null` |
| `G5U:unresolved` | a lost answer is shown as a rejection | 0 | 5 red. `review-fb27de86.test.tsx`: "an act the room recorded, whose answer was lost, is shown as unresolved, never as not taken": `AssertionError: expected null to be <div class="notice warn" …(1)>…(1)</div> // Object.is equality` |
| `G5U:same-intent` | asking again sends the act under a new idempotency key | 0 | 3 red. `review-fb27de86.test.tsx`: "an act the room recorded, whose answer was lost, is shown as unresolved, never as not taken": `AssertionError: expected 'ui-f4f3b733e5300fe769c248b4d2c448f8' to be 'ui-65b4c6c986ae785a942133567fc700b2' // Object.is equality` |
| `G5U:ask-again-kept` | asking again reads the form again and sends a new act | 0 | 2 red. `review-fb27de86.test.tsx`: "asking again sends exactly the same act with the same key: the room answers with the record it made and records nothing ": `AssertionError: expected null not to be null` |
| `G5U:unresolved-no-new` | the form sends a new act while an answer is unresolved | 0 | 1 red. `review-fb27de86.test.tsx`: "while the answer is unresolved the form sends no new act": `AssertionError: expected [ { kind: 'start-song', …(3) }, …(1) ] to have a length of 1 but got 2` |
| `G5U:unresolved-no-send-button` | the Send button stays while an answer is unresolved | 0 | 1 red. `review-fb27de86.test.tsx`: "while the answer is unresolved the form sends no new act": `AssertionError: expected <button …(2)></button> to be null` |
| `G5U:new-key` | every act the form sends has the same idempotency key | 0 | 1 red. `review-fb27de86.test.tsx`: "two keys are two acts": `AssertionError: expected 'ui-' to match /^ui-[0-9a-f]{32}$/` |
| `G5U:act-key` | the adapter drops the caller's idempotency key | 0 | 3 red. `review-fb27de86.test.tsx`: "an act the room recorded, whose answer was lost, is shown as unresolved, never as not taken": `AssertionError: expected 'ui-41a1aadfa699514a395c85ac2f1f6b6a' to be undefined // Object.is equality` |
| `G5U:act-refresh` | the page does not read the room again after an act | 0 | 1 red. `review-fb27de86.test.tsx`: "the page reads the room again after a lost answer, also when the room sends it no notice of the change": `AssertionError: expected [] to have a length of 1 but got +0` |
| `G5U:catalogue-read` | an explicit read of the declarations does not replace the catalogue that D(s) is answered from | 0 | 2 red. `review-fb27de86.test.tsx`: "after an activation and an explicit read, an act accepted later is read under the new policy, and an earlier entry under": `AssertionError: expected 'act_1_3f90684a' to be 'act_2_2eeb2724' // Object.is equality` |
| `G5U:mock-same-act` | the stand-in room refuses a retry of the same act under its key | 0 | 3 red. `review-fb27de86.test.tsx`: "asking again sends exactly the same act with the same key: the room answers with the record it made and records nothing ": `AssertionError: expected null not to be null` |
| `G5U:mock-mismatch` | the stand-in room answers another act under a used key with the first act's record | 0 | 1 red. `review-fb27de86.test.tsx`: "another act under a used key is idempotency-mismatch, and records nothing": `AssertionError: expected { id: 'act_2_bd5e356e', seq: 2, …(5) } to match object { refused: true, …(1) }` |
| `G5U:mock-recorded-only` | the stand-in room keeps a refusal it did not record under the key | 0 | 1 red. `review-fb27de86.test.tsx`: "a refusal the room did not record leaves the key free: the corrected act under it is admitted": `AssertionError: expected true to be false // Object.is equality` |
| `G5U:mock-kept` | the stand-in room keeps nothing under a key, so a retry is admitted a second time | 0 | 4 red. `review-fb27de86.test.tsx`: "asking again sends exactly the same act with the same key: the room answers with the record it made and records nothing ": `AssertionError: expected null not to be null` |

### The checker's client findings (act `43e8fe3b`)

The checker read the client at `b7b9d8df` and recorded two defects, each with controls that pass and named assertions that fail. Both are repaired at `3e6241df`, with tests in [packages/client/test/review-43e8fe3b.test.ts](../packages/client/test/review-43e8fe3b.test.ts). The tests are written for this branch and cover the checker's eight cases; its fixtures were read, not copied, and its local diagnostic patches were not adopted.

| # | Defect | Rule | Repair | Tests |
|---|---|---|---|---|
| 1 | A prepared act held the caller's own target and body objects, and its signed envelope held the same objects. A caller that changed or reused them after a successful act changed the kept envelope: the signature no longer verified, and `replay` was `unauthenticated` instead of the original record | R-IDEM-2, R-SIG-5 | `ownedIntent` (`packages/client/src/room.ts`) takes the handle's own copy of the target and body, frozen all the way down, before the envelope is built, signed or given to `onPrepared`. `act` and the named methods both use it, for a key and for a bearer session. The caller's objects are left as they were, neither kept nor frozen. A target or body that is not plain data is `bad-request` before anything is signed or sent | "a generic act signed by a key: after the caller changes ..." (four cases: nothing, its body, its target, its body with a structured clone saved); "a named act signed by a key ..."; "a bearer session, where the room signs ..."; "the copies are frozen all the way down ..."; "a target or body that is not plain data is bad-request ..." |
| 2 | `actsAt` kept an answer about an ended policy version though the handle had learnt of a later activation while the answer was on its way. The answer could have been read before that activation, and keeping it brought back `retired` marks older than what the handle knew: the next `actsAt` gave no `retired` mark, while `{ fresh: true }` gave it | R-DECL-23 | `actsAt` notes the latest activation the handle knows before it reads. If that has changed when the answer arrives, by any other answer, the answer is returned to its caller and not kept. An answer's own `until` does not count against it, so the sequential case is kept as before | "over https / over rpc: an answer read before a retirement, arriving after the handle saw that activation, is not kept ..."; "a held answer that no activation overtook is kept as before ..."; "a handle that learns of any activation while an answer is held does not keep that answer ..."; "in sequence, with no answer held ..." |

Two choices, for the checker to judge:

- **The overtaken answer is still returned to the caller that asked.** It is what the room said when it was read, as any read that races an activation is. Only keeping it was wrong.
- **A handle that knew of no activation when it asked, and learns of the latest one while the answer is held, does not keep the answer either**, even when no activation happened in between. The handle cannot tell the two cases apart, and the cost is one more read.

The nine mutants of these repairs, and `G5:catalogue-keep-ended`, whose statement the second repair changed, were run at `3e6241df` by the new runner (`run2.py` beside `mutants.py`), which records for each mutant the tested head and tree, the root `npm run typecheck` exit and errors with the mutant applied, every red test with its full failure message, and the file's SHA-256 before and after with `git status`. All ten pass the typecheck and are red by a named assertion; each file was restored. The results are `results-43e8fe3b.json`.

| Mutant | Fault | Typecheck | Red tests | A named red |
|---|---|---|---|---|
| `G5:act-owned` | a generic act keeps and signs the caller's own target and body objects | 0 | 4 | "a bearer session, where the room signs: a generic and a named act are each sent again as first prepared, whate...": `AssertionError: expected { kind: 'ask', …(4) } to deeply equal { kind: 'ask', …(4) }` |
| `G5:named-owned` | a named act keeps and signs the caller's own target and body objects | 0 | 3 | "a bearer session, where the room signs: a generic and a named act are each sent again as first prepared, whate...": `AssertionError: expected { kind: 'claim', target: null, …(2) } to deeply equal { kind: 'cl` |
| `G5:intent-target` | the target is not copied: the handle keeps, and freezes, the caller's own object | 0 | 5 | "a generic act signed by a key: after the caller changes its body, the kept envelope still verifies and replay ...": `AssertionError: expected [ false, true ] to deeply equal [ false, false ]` |
| `G5:intent-body` | the body is not copied: the handle keeps, and freezes, the caller's own object | 0 | 6 | "a generic act signed by a key: after the caller changes its body, the kept envelope still verifies and replay ...": `AssertionError: expected [ true, false ] to deeply equal [ false, false ]` |
| `G5:intent-plain` | a target or body that is not plain data fails with an error that is not bad-request | 0 | 1 | "a target or body that is not plain data is bad-request before anything is signed or sent": `Error: expected Error: An act's target and body must be p… to match object { name: 'Artroo` |
| `G5:intent-frozen` | the handle's copy is not frozen | 0 | 1 | "the copies are frozen all the way down, so the hook that is handed the prepared act cannot change what is sent": `AssertionError: expected [ false, false ] to deeply equal [ true, true ]` |
| `G5:intent-frozen-deep` | only the outside of the handle's copy is frozen | 0 | 1 | "the copies are frozen all the way down, so the hook that is handed the prepared act cannot change what is sent": `AssertionError: expected [ false, false ] to deeply equal [ true, true ]` |
| `G5:cache-overtaken` | an answer overtaken by a later activation is kept | 0 | 3 | "a handle that learns of any activation while an answer is held does not keep that answer, since it cannot tell...": `AssertionError: expected { vocabulary: 'declared', …(6) } not to be { vocabulary: 'declare` |
| `G5:cache-overtaken-always` | no answer about an ended version is ever kept | 0 | 15 | "a held answer that no activation overtook is kept as before: the next question about its interval is answered ...": `AssertionError: expected { vocabulary: 'declared', …(6) } to be { vocabulary: 'declared', ` |
| `G5:catalogue-keep-ended` | actsAt keeps the active version too | 0 | 1 | "is always read from the room; actsAt() keeps an ended version and answers its whole interval without a read": `AssertionError: expected 7 to be 8 // Object.is equality` |

`frozen` skips `null` and values that are not objects. That condition cannot be weakened and still compile, since `Object.values` takes an object; the named and bearer tests send a `null` target through it.

What this does not show. The tests run against the fake room over its local HTTPS routes and its RPC wire, not a real Room. The checker's own eight cases ran against a real Room at `b7b9d8df`; a rerun of those at this head is the checker's. The whole stage 5 inventory has not been run by the new runner: a typecheck-only pass of all 138 mutants at `3e6241df` shows 105 pass the root typecheck and 33 do not (listed in `typecheck-fails-3e6241df.md` beside the harness, mostly a name left unused or narrowing lost by a literal deletion). Those 33 are not evidence until each is rewritten as a compiling behavioural fault, and the 46 UI mutants not yet run by the new UI runner are in the same position. The full run at the final composed head is owed.

### The checker's review fcd7391d (UI at `f606dd89`): answers out of order, and the browser suite

**Finding 1 (P2), repaired at `4567a490`, tests corrected at `5590c318`.** A load and an explicit read each ask the room for its active catalogue, and the older question can be answered last. `readCatalogue`, `load` and `refresh` each published their answer as it came. So an answer read before an activation replaced the later catalogue the page had already confirmed: the snapshot went back a policy version, and `catalogueAt` read a record accepted after the activation under the earlier policy, through `governing`'s fast path.

The repair is in `packages/ui/src/room/live/live-room.ts`, and uses the idea of the client's `actsAt` repair (`3e6241df`):

- A catalogue's age is the seq of its activation (`since`), which only grows. No catalogue is older than any.
- `confirm` takes a completed answer only if it is not older than what the adapter holds. A lost answer ("not available") has no age of its own: it stands only if nothing was confirmed while it was on its way, judged against the age held when the question was asked.
- `load` and `readCatalogue` both publish through `confirm`. A load is also published under the catalogue held when it finishes (`current`), since an explicit read can confirm a later activation after the load read its own.
- The late caller of `readCatalogue` is given the catalogue the page holds, not the older one its own question read. The client's `actsAt` returns the overtaken answer to its caller; the two differ here on purpose, because this read is "what is active now".

Tests: `packages/ui/test/review-fcd7391d.test.ts`, 12 tests against the stand-in room with its change notices held back. They cover the checker's six cases (two regressions and four controls, the two historical-read controls among them) and six more: a newer answer to an older question is taken; a lost answer after a later activation does not blank the catalogue, from an explicit read and from a load; a lost answer with nothing confirmed in between still gives "not available"; a load still reading when a later activation is confirmed is published under the later one; a load that could not read the catalogue is published with the one an explicit read confirmed.

Mutants (UI harness, results in `mut5ui-composed/results-fcd7391d.json`, run at `5590c318`; each passes the root typecheck, is red by a named assertion and was restored):

| Mutant | Fault | A red assertion |
|---|---|---|
| `G5U:catalogue-older` | an answer from before a confirmed activation replaces the later catalogue | "an answer from before an activation the page has confirmed does not bring the earlier catalogue back" |
| `G5U:catalogue-overtaken` | a lost answer blanks the catalogue though a later activation was confirmed meanwhile | "a lost answer that arrives after a later activation was confirmed does not blank the catalogue" |
| `G5U:catalogue-read-age` | an explicit read judges a lost answer by what is held when it arrives | the same test |
| `G5U:catalogue-refresh-age` | a load judges a lost answer by what is held when it arrives | "a load whose catalogue answer is lost after a later activation was confirmed keeps that catalogue" |
| `G5U:refresh-current` | a load is published under the catalogue it read | "a load that has read its catalogue, and is still reading when a later activation is confirmed, is published under the later one" |
| `G5U:catalogue-age` | no catalogue counts as newer than any | "with no activation in between, two reads answered out of order leave the same catalogue", and 41 more |
| `G5U:catalogue-refresh` (moved) | the first catalogue read answers for good | 3 assertions |
| `G5U:catalogue-read` (moved) | an explicit read does not replace the catalogue | 6 assertions |

A first run at `4567a490` had three of these red by a `TypeError` on null, not by an expectation; the tests were changed to compare through a null-safe helper and the run repeated. That first run is kept as `results-fcd7391d-at-4567a490.json`.

**Finding 2, the browser suite: cause found, not repaired; it needs a decision outside `packages/ui`.** The suite is still 8 of 9 at `5590c318` (`mut5ui-composed/e2e-5590c318.log`). The declared-room case fails at its first assertion, `smoke.spec.ts:199`, which expects a thread named "Start a song: Footprints"; the page shows "Start a song: c".

The cause is not the form and not a lost input. It is the thread name rule itself. Section 33.10 of the protocol, and `titleOf` in `packages/policy/src/catalogue.ts`, name a thread with no goal by its opening act's label and "its first body field by name". The demo's `start-song` has the fields `key`, `swing`, `tempo` and `title`, so the first by name is `key`, and the name is "Start a song: c". Both demo songs are in the key of c, so the Room screen shows two threads with the same name. The browser case was written at `0eb42cb2`, when the name used the title; the rule was changed at `8fc6ae0c` and four UI unit tests were written to expect "Start a song: c" (`declared-rendering.test.tsx:106, 351`; `acts-screen.test.tsx:118, 140`). The browser suite was not run then.

So the browser case and the rule contradict each other, and the page follows the rule. Nothing in `packages/ui` can satisfy both: the case fixes the field names (`title`, `key`, `tempo`, `scope`), and every reader must use the one rule. The expectation was not changed.

A private, uncommitted copy of the case with the two names the rule gives ("Start a song: c", first match, and "Start a song: d" for the song the form sends) passes to the end (`e2e-5590c318-private-rule-titles.log`). So the two thread names are the only failing assertions of the case: the acts list, the form, its two validation messages, the recorded entry and the feed all pass.

The decision owed: either the rule changes so that a song is named by its title, or the browser case and the screenshots change to the rule's names. The first seems right, since the rule as written gives two threads one name. One rule that needs no typed order and passes every existing CLI and MCP test: the first field by name whose declared type under `D(s)` is `text`, and the first field by name only when the act has no text field. That changes `titleOf` and its callers in `packages/policy`, the text of section 33.10, and the four UI unit expectations above.

### The planner's decision c37653e1: which field names a thread (`3a03d405`)

The planner decided the question the last section left open (act `c37653e1`). A thread with no goal is named by its opening act's label and its first text field by name. This replaces "first field by name", under which both demo songs were called "Start a song: c", because `key`, an enum, sorts before `title`.

**The rule, as built in `titleOf`** (`packages/policy/src/catalogue.ts`, the helper every reader shares):

1. A thread's non-empty goal still comes first (`threadTitle`, unchanged).
2. Otherwise the opening act's label at its own seq, then the value of the first present body field by name that the act's own declaration at that seq types as `text`. `scope` and `because` are never taken.
3. With no such field present, the first present field by name, of any type, as before.
4. With no declaration at hand (a legacy, platform or unknown kind, or a caller that has only a label), the first field by name, as before.
5. With no opening act at hand, the thread's ID, as before.

"Text" is the declared type, not the type of the value. The declaration is the one of the record's own seq: callers pass the `meaning` that `meaningOf` gives under `actsAt({ seq })`, or the `meaning` that `explain` returns. No declaration member is added, no binding changes, and the helper still imports no evaluator.

**One choice for review.** `titleOf` reads only the act's declared fields, not its steps' fields. The step an opening act runs is `open`, which brings only `scope`, and `scope` never names a thread. So there is no step-owned text field to carry, and the helper takes no target shape. Section 33.10 says this. If a later steps version gives an opening step a text field, the helper needs the target shape then.

**What changed**

- `packages/policy/src/catalogue.ts`: `titleOf` and `threadTitle` accept a meaning with an optional `declaration`; `textFields` lists a declaration's text fields by own name.
- `packages/ui`: an entry's meaning (`EntryMeaning`) carries the declaration of its seq, so `laneGoal` can pass it to the shared helper. Four unit expectations now name songs by title.
- `packages/cli/src/main.ts`, `packages/mcp/src/run.ts`: comments only; both already pass the meaning of the act's own catalogue.
- `docs/protocol.md` section 33.10, the acceptance row "Thread name", and open point 52; the READMEs of policy, client, CLI, MCP and UI.
- `packages/room/test/workerd/declared-stage5-a5d64b35.test.ts` is unchanged and still passes: its song declares `key` as text, so "first by name" and "first text field by name" agree there. Its title still says "label and first field".

**Tests**

- `packages/client/test/thread-names-c37653e1.test.ts`, 9 tests: an enum before a text field; one body under two declarations with the types exchanged, and the same string in both fields; typed order against canonical order; an absent optional text field; an act with no text field; `scope` and `because`; a field named `valueOf`; legacy, platform, unknown and label-only fallbacks; a thread opened before a document that relabels the act and exchanges its field types, read through `actsAt({ seq })`.
- `packages/ui/test/thread-names-c37653e1.test.ts`, 3 tests: the page names a song by its title; a thread keeps its name after a later document retypes the fields; an act with no text field.
- The CLI and MCP title tests each gain an enum field that sorts first, and assert the title is used.

**Mutants at `624dbb9f`** (all pass the root typecheck, each red by a named assertion, each file restored)

| Mutant | Fault | Red assertions | First named test |
|---|---|---|---|
| `G5:title-text` | a text field is never preferred | 9 | CLI: "an act that opens a thread names it as every reader does ..." |
| `G5:title-text-type` | every declared field counts as text | 9 | CLI: the same |
| `G5:title-fallback` | with no text field present, the label alone | 7 | client: "threadTitle: the goal when the thread has one ..." |
| `G5:title-order` (moved) | first typed, not first by name | 6 | CLI: the same |
| `G5:title-first` (moved) | `scope` may name a record | 3 | client: "titleOf: the label at the record's seq ..." |
| `G5:title-first-because` (moved) | `because` may name a record | 2 | client: the same |
| `G5U:record-declaration` | an entry's meaning carries no declaration | 7 | UI: "the title names the song, though the enum field key comes first by name" |
| `G5U:thread-name` (rewritten to compile) | a thread with no goal is named by its ID | 7 | UI: the same |

Results: `mut5/results-c37653e1.json` and `mut5ui-composed/results-0fd98c41.json`. Two conditions have no mutant because they exist only for the type checker: `meaning.declaration ? ... : null` and `declaration.body ?? {}`. The label-only and no-body tests run through both.

**Browser suite at `624dbb9f`: 9 of 9.** Case 9, "a room that declares its own acts", passes through form validation, acceptance and its final lane checks, with its "Footprints" and "So What" assertions unchanged. Cases 1 to 8 pass as before. Log: `mut5ui-composed/e2e-c37653e1.log`.

### The planner's review 0fd98c41: a failed read must not undo a confirmed activation (`624dbb9f`)

The planner's review of `4567a490` found two cases that the repair for `fcd7391d` left open. Both are in the stand-in room and concern what the page shows, not Room admission.

1. The page holds a catalogue, confirms a later activation, a record is accepted under it, and then a read fails. An older answer, held since before the activation, then arrives. The page took it: the earlier catalogue came back, and the later record was read under the earlier policy.
2. A load has read a catalogue and is still reading. A later activation is confirmed, then a read fails. The load finishes and was published with the catalogue it had read.

**Cause.** The page compared a late answer only with the catalogue it held. A failed read left it holding none, which lost the knowledge of what it had confirmed.

**Repair** (`packages/ui/src/room/live/live-room.ts`)

- The page keeps `confirmed`, the seq of the newest activation it has read, apart from the catalogue it holds. It only grows. An answer older than that is never taken, also while the page holds no catalogue.
- A failed answer stands only if no other answer was taken while it was on its way. This is judged by the catalogue held when the question was asked, so a successful read of the same version also outranks an older failure.
- A load is always published under the catalogue held when it finishes, or with none after a failed read. The page stays honestly without a catalogue until a read succeeds.

**Tests:** `packages/ui/test/review-0fd98c41.test.ts`, 6 tests: the two cases; an older answer of the same age gives the catalogue back; a failed read does not blank a catalogue another read gave meanwhile; a newer answer restores the catalogue; the same load with no failed read is published under the later catalogue. The planner's four fixtures and the checker's six race fixtures, copied in unchanged for one run and removed, all pass (10 of 10).

**Mutants at `624dbb9f`** (all pass the root typecheck, each red by a named assertion, each file restored)

| Mutant | Fault | Assertion reds | First named test |
|---|---|---|---|
| `G5U:catalogue-confirmed` | the page never remembers what it confirmed | 3 | "with a later activation confirmed in between, it does not bring the earlier catalogue back ..." |
| `G5U:catalogue-forget` | a failed read forgets what was confirmed | 1 | the same |
| `G5U:catalogue-older` | an older answer replaces the later catalogue | 3 | the same |
| `G5U:catalogue-overtaken` | a failed answer blanks the catalogue though another was taken | 2 (and 1 error) | fcd7391d: "a lost answer that arrives after a later activation was confirmed ..." |
| `G5U:refresh-current` | a load is published under the catalogue it read | 4 | "it is not published with the earlier catalogue it read: the page still holds none" |
| `G5U:catalogue-read-age` | a failed explicit read is compared at arrival | 1 (and 1 error) | fcd7391d: the same lost-answer test |
| `G5U:catalogue-refresh-age` | a failed load read is compared at arrival | 1 | fcd7391d: "a load whose catalogue answer is lost after a later activation was confirmed ..." |
| `G5U:catalogue-refresh`, `G5U:catalogue-read`, `G5U:governs` (unchanged text, rerun) | as before | 4, 8, 9 (and 1, 9, 5 timeouts) | thread-name and catalogue tests |

`G5U:catalogue-age` is gone with the function it changed. Results: `mut5ui-composed/results-0fd98c41.json`.

**Gates at `624dbb9f`**

| Gate | Result |
|---|---|
| Root `npm run typecheck` | 0 |
| policy tests | 313 node; 311 workerd, 2 skipped |
| client tests | 143 node; 2 workerd |
| CLI tests | 182 |
| MCP tests | 87 node; 5 workerd |
| UI unit suite | 243 |
| UI build | 0 |
| Browser suite | 9 of 9 |
| `git diff --check` | clean |

Root `npm test` and the Room suites were not run. The other UI and stage 5 mutants were not rerun; 33 of the 138 in `mut5` still fail the root typecheck (`mut5/typecheck-fails-3e6241df.md`).

**Limits.** All of this is tested against the stand-in room, not a real Room over HTTPS or MCP. After a failed read the page shows no catalogue until the next successful read; it does not ask again by itself. An application with two text fields gets the earlier name and cannot choose the other (open point 52).

### The checker's review 0b9119de and the planner's b22d29ee: the CLI printed the label read at preparation (`ff266354`)

**Finding (P2).** `artroom act` took the label and the thread's name from the declarations it read while it prepared the act. A label is no part of a binding, so a label-only activation between that read and the act's admission leaves the act valid. It was then admitted under one label and printed under another. The checker's fixture showed "Open a score: Nardis" printed for an act admitted under "Begin a tune". Its paired control showed that the latest label is wrong too: an activation after admission must not change what the accepted act is called.

**Repair** (`packages/cli/src/main.ts`)

- After the room answers, `recordedMeaning` reads the declarations in force at the record's own seq (`actsAt({ seq })`) through the run's one handle, and the `Done` line and the thread's name come from that meaning.
- The thread is named from the prepared act's body, which `journaled` now returns. That is the body that was signed and sent.
- With `--json` the record is printed and nothing is read.
- A read that fails, or a room that has no declarations for that seq, changes only the words: the command still succeeds, `Done:` names the kind, and the thread is named by its goal or its ID. Nothing is signed or sent again.

`packages/cli/README.md` says all of this. Choices 19 and 20 above are rewritten to match; they had still described the earlier rule and the catalogue read at preparation.

**Tests** (`packages/cli/test/review-0b9119de.test.ts`, the first seven)

| Test | What it holds |
|---|---|
| with no activation in between, the words are those the user read | the control |
| a label changed after the act was prepared and before it was admitted: the act is printed under the new label, which governs it | the finding; one act, the binding unchanged |
| a label changed after the act was admitted: the act keeps the label it was admitted under, not the latest | the paired control |
| the words are read once, after the answer, at the record's seq; --json prints the record and reads no words | one read of the active declarations to prepare, one of `?at=<seq>`; none of the second with `--json` |
| a failed read after the answer leaves the act done: the kind and the thread's ID are printed, and nothing is sent again | exit 0, one act, and the same key again gives the original record |
| a room that has no declarations to give for that seq: the kind is printed, never the latest label | the null answer |
| a thread that has a goal is named by it, with or without the words | the goal needs no declaration |

### The planner's 23ae8924, as corrected by c6f6ad78: an act finished from the journal (`ff266354`)

**Finding (P3, presentation).** A command finished from the journal printed `Done: start-song, recorded as …` and no thread line, with or without a later activation. The planner's correction and the checker's `7488b311` class this as presentation only: five sends of the same bytes gave one act and one thread, and that must stay so. Enriching the display was allowed, not required, and must use the saved intent and `D(out.seq)`, add no read to the preparation of the resend, and keep the receipt when the words cannot be read.

**Repair.** The same code as the section above: the display no longer depends on anything the first run read. The saved act goes back exactly as before, through `resubmit`, with no session and no read. Only after its answer is known does the CLI open a session and read `D(out.seq)`. If no session can be opened, as for a key that is no longer a member's, the receipt is still printed with the kind and the thread's ID.

**The read count is reconciled, not dropped.** The existing test "an act whose answer was lost is resent unchanged …" counted every `GET /declarations` and expected none. It now records each such read with its query and expects exactly one, `?at=<the record's seq>`: no read of the active declarations, which is what preparation reads, and one read for the words.

**Tests** (the last three of `review-0b9119de.test.ts`)

| Test | What it holds |
|---|---|
| the saved act goes back unchanged, and the receipt has the label and the thread's name from the body the journal kept | five identical signed bodies, one act, one thread; reads are exactly `?at=<seq>` |
| after a later label-only activation the finished act still has the label it was admitted under | `D(out.seq)`, not the latest |
| when no session can be opened to read the words, the saved act is still finished and its receipt given | every session request refused; exit 0; kind and ID printed; no declarations read; the journal holds nothing more |

**Mutants for both CLI sections** (run at `c74f3696` with `mut5/run2.py`; results in `mut5/results-0b9119de.json`)

| Mutant | The fault | Typecheck | Red tests | A red assertion |
|---|---|---|---|---|
| `G5:cli-thread` | artroom act names the thread it opened by its ID though it read the act's words | 0 | 6 | an act finished from the journal is printed as a new one is (R-IDEM-2, R-DECL-23) after a later label-only activation the finished act still has the l: AssertionError: expected 'Thread: act_4_66dcc492 (lane act_4_66…' to match /^Thread: Start a song: Footprints \(l…/ |
| `G5:cli-thread-line` | artroom act prints no thread line for the thread it opened | 0 | 10 | an act finished from the journal is printed as a new one is (R-IDEM-2, R-DECL-23) when no session can be opened to read the words, the saved act is st: AssertionError: expected [ Array(1) ] to deeply equal [ …(2) ] |
| `G5:cli-thread-goal` | artroom act names a thread that has a goal by the act | 0 | 2 | the words cannot be read: the receipt is still given (R-DECL-23, R-IDEM-2) a thread that has a goal is named by it, with or without the words: AssertionError: expected 'Thread: act_4_dbbd5381 (lane act_4_db…' to match /^Thread: Rate-limit login \(lane act_…/ |
| `G5:cli-thread-opened` | artroom act prints a thread line for an act that opened nothing | 0 | 1 | artroom act: any declared act, under the binding the user read the lease, the generation and a version's head are read from the room when left out, as: AssertionError: expected 'Done: Release (release), recorded as …' to match /^Done: Release \(release\), recorded …/ |
| `G5:cli-recorded-seq` | artroom act prints an act in the latest words, not those of its own seq | 0 | 8 | an act finished from the journal is printed as a new one is (R-IDEM-2, R-DECL-23) after a later label-only activation the finished act still has the l: AssertionError: expected 'Done: Begin a tune (start-song), reco…' to match /^Done: Start a song \(start-song\), r…/ |
| `G5:cli-recorded-null` | when the room has no declarations for the act's seq, artroom act prints the latest label | 0 | 1 | the words cannot be read: the receipt is still given (R-DECL-23, R-IDEM-2) a room that has no declarations to give for that seq: the kind is printed, : AssertionError: expected [ …(2) ] to deeply equal [ …(2) ] |
| `G5:cli-recorded-unread` | a failed read of the words turns a recorded act's receipt into an error | 0 | 3 | an act finished from the journal is printed as a new one is (R-IDEM-2, R-DECL-23) when no session can be opened to read the words, the saved act is st: AssertionError: expected 2 to be +0 // Object.is equality |
| `G5:cli-recorded-json` | artroom act --json reads the words it does not print | 0 | 1 | artroom act prints the act as recorded, in the words of its own seq (R-DECL-23) the words are read once, after the answer, at the record's seq; --json: AssertionError: expected [ '', '?at=5' ] to deeply equal [ '' ] |
| `G5:cli-label` | artroom act prints the kind where the label belongs | 0 | 10 | an act finished from the journal is printed as a new one is (R-IDEM-2, R-DECL-23) after a later label-only activation the finished act still has the l: AssertionError: expected 'Done: start-song, recorded as act_4_0…' to match /^Done: Start a song \(start-song\), r…/ |
| `G5:cli-prepared-body` | artroom act names a thread without the body that was sent | 0 | 6 | an act finished from the journal is printed as a new one is (R-IDEM-2, R-DECL-23) after a later label-only activation the finished act still has the l: AssertionError: expected 'Thread: Start a song (lane act_4_7da2…' to match /^Thread: Start a song: Footprints \(l…/ |

All ten pass the root typecheck, are red by a named assertion, and were restored (`git status` empty after each). Four were in the inventory before and are rewritten for the new code (`G5:cli-thread`, `G5:cli-thread-goal`, `G5:cli-thread-opened` unchanged in text, and `G5:cli-thread-line`, which replaces a literal `if (false)`); six are new.

### The checker's review 8df737b8, accepted by the planner's 80bef90a: the same catalogue object (`c74f3696`)

**Finding (P3).** A failed read of the active catalogue leaves the page without one only if no other answer was taken while it was on its way. The page told that by comparing the catalogue it held with the one it held when the question was asked. A custom room handle may return the same readonly object for two reads of an unchanged catalogue; the contract does not promise a new one. A later successful read then looked like no read at all, and the earlier failure cleared it. The built-in HTTP handle parses a new object from each answer and was not affected.

**Repair** (`packages/ui/src/room/live/live-room.ts`). The page counts the answers it takes (`taken`). `load` and `readCatalogue` note the count when they ask, and `confirm` lets a failed answer stand only if the count has not moved. Object identity is no longer used. What was confirmed still outlasts a failed read, so the repaired lower-activation cases of `0fd98c41` stay closed, and their tests pass unchanged.

**Tests** (`packages/ui/test/review-8df737b8.test.ts`, 6 tests; the room is the stand-in, with a handle that reuses the object when the catalogue is unchanged)

| Test | What it holds |
|---|---|
| an explicit read that fails late does not blank the catalogue a later read gave, when the handle gives the same object again | the finding |
| the same, when the handle gives a new object | the control: only the identity differs |
| with no answer taken meanwhile, a failed read honestly leaves the page without a catalogue, also for a handle that reuses objects | the honest-null control; the next answer is taken |
| a load whose read fails late is published under the catalogue an explicit read gave meanwhile, same object, and new object | the load path, both ways |
| with no answer taken meanwhile, the load is published with no catalogue | the load's honest-null control |

**Mutants** (run at `c74f3696` with the UI runner; results in `mut5ui-composed/results-8df737b8.json`)

| Mutant | The fault | Typecheck | Red by assertion | A red assertion |
|---|---|---|---|---|
| `G5U:catalogue-refresh` | the first active catalogue read answers for good, also after an activation | 0 | 5 | a load whose read of the catalogue fails late (R-DECL-23) with no answer taken meanwhile, the load is published with no catalogue: AssertionError: expected { vocabulary: 'declared', …(6) } to be null |
| `G5U:catalogue-read` | an explicit read of the declarations does not replace the catalogue that D(s) is answered from | 0 | 14 | a failed read and an answer taken while it was on its way (R-DECL-23) an explicit read that fails late does not blank the catalogue a later read gave,: AssertionError: expected 'Start a song' to be 'A later meaning' // Object.is equality |
| `G5U:catalogue-overtaken` | a lost answer blanks the catalogue though another answer was taken while it was on its way | 0 | 6 | a failed read and an answer taken while it was on its way (R-DECL-23) an explicit read that fails late does not blank the catalogue a later read gave,: AssertionError: expected null to deeply equal { vocabulary: 'declared', …(6) } |
| `G5U:catalogue-older` | an answer from before a confirmed activation replaces the later catalogue | 0 | 3 | an older answer that arrives after a newer read failed (R-DECL-23) with a later activation confirmed in between, it does not bring the earlier catalog: AssertionError: expected { vocabulary: 'declared', …(6) } to be null |
| `G5U:catalogue-confirmed` | the page never remembers which activation it has confirmed | 0 | 3 | an older answer that arrives after a newer read failed (R-DECL-23) with a later activation confirmed in between, it does not bring the earlier catalog: AssertionError: expected { vocabulary: 'declared', …(6) } to be null |
| `G5U:catalogue-forget` | a failed read forgets the activation the page had confirmed | 0 | 1 | an older answer that arrives after a newer read failed (R-DECL-23) with a later activation confirmed in between, it does not bring the earlier catalog: AssertionError: expected { vocabulary: 'declared', …(6) } to be null |
| `G5U:catalogue-read-age` | an explicit read compares a lost answer with the answers taken when it arrives, not when it was asked | 0 | 3 | a failed read and an answer taken while it was on its way (R-DECL-23) an explicit read that fails late does not blank the catalogue a later read gave,: AssertionError: expected null to deeply equal { vocabulary: 'declared', …(6) } |
| `G5U:catalogue-refresh-age` | a load compares a lost answer with the answers taken when it arrives, not when it was asked | 0 | 3 | a load whose read of the catalogue fails late (R-DECL-23) it is published under the catalogue an explicit read gave meanwhile, when the handle gives a: AssertionError: expected null to deeply equal { vocabulary: 'declared', …(6) } |
| `G5U:catalogue-taken` | the page does not count the answers it takes, so a failed read blanks a catalogue a later read gave | 0 | 6 | a failed read and an answer taken while it was on its way (R-DECL-23) an explicit read that fails late does not blank the catalogue a later read gave,: AssertionError: expected null to deeply equal { vocabulary: 'declared', …(6) } |
| `G5U:catalogue-asked-read` | an explicit read that fails always finds an answer taken meanwhile, and never leaves the page without a catalogue | 0 | 6 | a failed read and an answer taken while it was on its way (R-DECL-23) with no answer taken meanwhile, a failed read honestly leaves the page without a: AssertionError: expected { vocabulary: 'declared', …(6) } to be null |
| `G5U:catalogue-asked-load` | a load whose read fails always finds an answer taken meanwhile, and is published with the earlier catalogue | 0 | 1 | a load whose read of the catalogue fails late (R-DECL-23) with no answer taken meanwhile, the load is published with no catalogue: AssertionError: expected { vocabulary: 'declared', …(6) } to be null |

All eleven pass the root typecheck, are red by a named assertion, and were restored. Three are new (`G5U:catalogue-taken`, `G5U:catalogue-asked-read`, `G5U:catalogue-asked-load`); five follow their changed statements; `G5U:catalogue-older`, `G5U:catalogue-confirmed` and `G5U:catalogue-forget` are unchanged and were run again because they sit in the same function. Some mutants also made other tests fail by a timeout or a thrown error (`G5U:catalogue-refresh`: timeout; `G5U:catalogue-read`: timeout; `G5U:catalogue-overtaken`: error; `G5U:catalogue-read-age`: error; `G5U:catalogue-taken`: error; `G5U:catalogue-asked-load`: timeout); those are not counted.

**Gates at `c74f3696`**

| Gate | Result |
|---|---|
| Root `npm run typecheck` | 0 |
| CLI typecheck; CLI tests | 0; 192 passed |
| UI typecheck; UI unit tests | 0; 249 passed |
| UI build | 0 |
| Browser suite | 9 of 9 (`mut5ui-composed/e2e-8df737b8.log`): the scenario; the reviewer's queue; keyboard; screenshots light and dark; the jj recut history; check carry; phone width; the declared room's feed, acts and form |
| `git diff --check` | clean |

Root `npm test` and the Room suites were not run for these three commits.

**Limits**

- Every test here runs against the fake room over its local HTTPS routes, or the UI's stand-in room. None shows a real Room's admission, or the words read over MCP for a bearer session.
- The words are read after the journal entry is finished. A run stopped between the two prints nothing; the same command with the same key then gets the original record from the room and prints it.
- One read more is made for each successful `artroom act` that prints words. A record does not name its policy version, so the CLI cannot tell without a read whether the catalogue it prepared with still governs.
- The section of `plans/README.md` on the branch still has the earlier choices 19 and 20; this draft has the corrected ones.

### The reviewers' finding at `c74f3696`: a saved act finished under another kind's name (`bdc35c53`)

Both reviewers reproduced this at `c74f3696` and reported it in the workroom; neither had recorded it as an act when the repair was made.

**What was wrong.** The CLI's journal finds a saved `artroom act` by its idempotency key and the command `act`, not by the kind. A run that names the key again with another kind finishes the saved act: the saved bytes go back unchanged, and one act and one thread exist. That part was right. But the receipt added at `ff266354` took the kind from the finishing run's arguments. A saved `start-song` finished by a run that typed `start-tune` was printed as "Begin a different tune (start-tune)", on the "Done" line and the "Thread" line, and with the kind typed when the words could not be read.

**The repair** (`packages/cli/src/main.ts`).

- The receipt's kind is the record's own kind (`DeclaredRecord.kind`). The label is read for that kind at the record's seq, and the fallback names that kind.
- The thread is still named from the body the journal kept.
- A run that names another kind than the saved act's is told so, on the error stream, in text and `--json` alike: "This idempotency key belongs to a saved start-song act. That act was sent again as it was saved; no start-tune act was made." The exit code is the saved act's. A run that names the same kind, or a new act, is told nothing.
- If the room refuses the saved act when it is sent again, the explanation after `binding-stale` is for the saved kind and the binding the saved act was prepared under, not for what the run typed.
- No read is added, and the replayed bytes are unchanged.

**Tests** (`packages/cli/test/saved-kind-a5d64b35.test.ts`, 6 tests, against the fake room over its local HTTPS routes):

- the changed kind with the words read: the saved act's label, kind and thread name; the line on the error stream; five identical sends, one act, one thread, no act of the typed kind;
- the changed kind with every read session refused: "Done: start-song" and the thread by its ID, and the same line;
- `--json`: the record is the saved act's, and the line is on the error stream;
- control: the same kind with another body finishes the saved act with the saved body, and nothing more is said;
- control: a new act of the other kind under its own key is that kind's;
- a saved act that never reached the room, whose meaning then changed: `binding-stale`, explained for `start-song` under the saved binding, with what changed.

The ten tests of `review-0b9119de.test.ts` pass unchanged. No test asserts a count of reads on a path where the client may ask again.

**Mutants.** Run at `bdc35c53` with `mut5/run2.py`; results in `mut5/results-saved-kind.json`. Each passes the root typecheck, is red by a named assertion, and was restored.

| Mutant | The fault | Red by |
|---|---|---|
| `G5:cli-saved-kind` | the finishing run takes the kind it typed for the saved act's kind | "the saved act's meaning changed before it reached the room ...": the line is missing |
| `G5:cli-saved-kind-told` | a run that named another kind is not told | the same assertion, and the three "is told" assertions |
| `G5:cli-saved-kind-told-only` | every act is told it finished a saved act | "control: the same kind with another body ...": expected no such line |
| `G5:cli-stale-saved-kind` | a refused saved act is explained for the kind typed | "... start-song now means" not found |
| `G5:cli-stale-saved-binding` | the change is looked up under the binding typed | "What changed since the meaning you read" not found |
| `G5:cli-recorded-kind-words` | the label is read for the kind typed | expected "Done: Start a song (start-song)", got "Done: Begin a different tune (start-s…" |
| `G5:cli-recorded-kind-shown` | the receipt shows the kind typed beside the label | got "Done: Start a song (start-tune)" |
| `G5:cli-recorded-kind-fallback` | with no words read, the receipt names the kind typed | "when the words cannot be read ...": the two lines differ |

Six mutants of the same lines were run again and are red: `G5:cli-label` (its text moved), `G5:cli-thread`, `G5:cli-recorded-seq`, `G5:cli-recorded-null`, `G5:cli-recorded-unread` and `G5:cli-recorded-json`.

**Gates at `bdc35c53`**: CLI tests 198 passed; CLI typecheck 0; root typecheck 0; `git diff --check` clean.

**Limits.** The tests use the fake room. The line is printed for a changed kind only: a run that names the same kind with another body or target is told nothing, as before. The refused-saved-act case is tested for `binding-stale` only.

### The state of the evidence

Condition 4's kind of evidence, a mutant for every new guard, is not complete for this stage.

- **Guards with no mutant.** Two independent readings of the stage's source diff against the mutant inventories, made at `624dbb9f`, are kept outside the repository (`guard-audit-stage5-core.md` and `guard-audit-stage5-ui.md`, beside the harnesses). Outside the UI: 349 guards read, 126 covered, 174 with no mutant, 66 of those with no test that would fail, 20 judged equivalent or unreachable. In the UI: 349 guards read, 63 covered, 201 with no mutant (151 in the UI and 50 in its stand-in room), 93 of those with no test that would fail, 57 judged equivalent or unreachable. Nothing in either reading was compiled or run.
- **Mutants that do not compile.** A typecheck of every mutant of `mut5` at `3e6241df` found 33 of 138 that fail the root typecheck. In the UI inventory, 16 of 74 are likely to fail by reading, and 45 of 74 have no recorded typecheck. None of these is rewritten yet. A mutant that does not compile shows nothing.
- **What is to the standard.** Only the mutants named in the sections above, which were written and run with each repair.
- **One survivor of the old table**, `G5:cli-binding-given`, is an equivalent mutant: the line before it forces the two values to be equal.

Closing this is owed before review: a compiling fault and a named red for each guard, a test with its control where none exists, the equivalence claims checked against the code, and one run of every mutant at the head for review.

### Gates since `b7b9d8df`

No gate below is a whole-head gate. Each was run by the repair that the commit makes.

| Commit | What was run | Result |
|---|---|---|
| `f606dd89`, `8f3615d5` | UI unit suite, UI typecheck, `git diff --check` | 222 passed; 0; clean |
| `3e6241df` | client node and workerd, client typecheck, MCP, CLI, root typecheck, `git diff --check` | 134 and 2 passed; 0; 87 passed; 182 passed; 0; clean |
| `5590c318` | UI unit suite, UI typecheck, root typecheck, UI build, browser suite | 234 passed; 0; 0; 0; 8 of 9 (case 9 failed on the thread name, see `c37653e1`) |
| `624dbb9f` | root typecheck; policy; client; CLI; MCP; UI unit; UI build; browser suite; `git diff --check` | 0; 313 node, 311 workerd with 2 skipped; 143 and 2; 182; 87 and 5; 243; 0; 9 of 9; clean |
| `c74f3696` | root typecheck; CLI typecheck and tests; UI typecheck and tests; UI build; browser suite; `git diff --check` | 0; 0 and 192 passed; 0 and 249 passed; 0; 9 of 9; clean |
| `bdc35c53` | root typecheck; CLI typecheck and tests; `git diff --check` | 0; 0 and 198 passed; clean |

Not run at the present head: root `npm ci`, root `npm test`, the Room suites, and the browser suite after `bdc35c53` (which changes `packages/cli` only). The Room's stage 5 test file still has a title that says "label and first field"; its assertions pass.

### For the planner or hugh

1. **`recover` has no client surface** (open point 49). The request does not name it. Without it, configuration recovery in a `v2` room needs a hand-signed envelope.
2. **The checker service still signs `v: 1`**, and its notes are `v: 1` too. That is stage 4's, as `fa120186` says. Until then a `v2` room gets checks from members' own keys or from a bearer through `act`.
3. **The cost of the catalogue read for the named methods** (choice 5): two requests per handle before its first named act, in every room. If that is too much for the CLI, the vocabulary could be kept in its room configuration; that is a small follow-up, not done here.
4. **Which field names a thread** (open point 52) is decided: the planner's `c37653e1` prefers the first text field by name, built at `3a03d405`. An application still cannot choose the field; a declaration that names it would be a new member of the declaration, and is not proposed here.
5. **The demo's songs** are now named by their titles, "Start a song: Footprints" and "Start a song: So What", under that decision.
6. **Toolsets for `acts` and `act`** come from the planner's MCP core contract. This stage does not assign them.
7. **A named act repeated from a new handle after a change of vocabulary** is built under the vocabulary then in force, because a new handle has nothing kept. The room answers `idempotency-mismatch` and names the first act. Nothing is recorded twice. The CLI is not affected: its journal keeps the signed bytes. A stdio MCP server that restarts between the two calls is.
8. **The Acts form offers every thread to an act whose declaration names no `threads`.** The room refuses such an act on any thread (`wrong-thread`). This is the UI lane's choice and is left as it was.
9. **Stage 2 has moved since this branch was composed on `15fa7f4c`.** It is not landed. This branch is composed again on main after it lands. Among stage 2's later changes, a `recover` record now names its op in `recover`, not `op`, and check jobs name their kind and binding; neither is read by this stage's code, by inspection only.
10. **The MCP core runtime** (request `9ca1d290`) was built from `b7b9d8df` on its own branch and does not have the commits since.

## MCP core runtime (request 9ca1d290)

### State at the integration head (written last)

The MCP core is now reviewed on `request/test-overhead`, the integration branch (assert `dae9a1f3`), composed with stage 2 (approved at `4ec48aa1`, review `25bede37`), stage 3 and stage 5. The branch `request/mcp-core-runtime` stays at `729fb330`. Read this subsection first, then "State at `8b46e825`", which is still right about what was built and repaired. This subsection replaces that note's "Stopped, and owed" list and the provisional status below it.

**What changed since `8b46e825`.**

- The head contains stage 2 as reviewed and stage 5 as sent for review, and the gate of [docs/testing.md](../docs/testing.md) runs at it. It is not composed on main: the four lanes land together from this branch.
- The mutation run (39 of 76) and the guard audit are superseded by request `ecbc722a` (review `b1738122`), not met and not owed. The mutation table below is history.
- The test reduction merged this lane's tests. `packages/cli/test/mcp-core-9ca1d290.test.ts` and `packages/mcp/test/workerd/worker.test.ts` are gone; their invariants are in `packages/cli/test` and `packages/mcp/test/mcp-core-9ca1d290.test.ts`, and the Room's MCP route is in `packages/room/test/workerd/worker.test.ts`. [test-invariants.md](test-invariants.md) names the witnesses, under MCP, CLI and Room.

**Conditions of the request.**

| Condition | State |
|---|---|
| (1) R-API-9, 13, 14, 15 and the section 34.2 edits: fourteen named tools, `act` and `acts`, the four reads | Delivered |
| (2) titles, output schemas, fixed annotations, the length bounds | Delivered |
| (3) toolsets and discovery | Delivered, with the planner's decisions of `3d8a74a9` |
| (4) `idempotencyKey` required for every act tool; lost-result retries | Delivered |
| (5) `waitMs` on four tools; waiting holds nothing | Delivered, with the stream repair below |
| (6) stage 5's behaviour kept | Kept; stage 5's own review is `f7a3c7fb` |
| (7) composition, artifacts, one head, review | This head. The planner republishes the contract artifacts (`a9788a59`, `ee3d9036`) at the reviewed head; that is the planner's to do |

**Findings.** Two, both repaired before this branch, and neither yet confirmed by a reviewer:

| Finding | Repair | Witness in `packages/mcp/test/mcp-core-9ca1d290.test.ts` |
|---|---|---|
| Checker `48765af0` (P2): an attention wait cancelled a native stream while its own reader held the lock, so the source was never cancelled | The wait cancels a native stream through its reader and releases the lock (`dbcf3a7f`, `8b46e825`) | "a native stream, a page that already has items ..."; "a native stream, the wait runs out ..."; "a native stream, an item arrives ..."; "the client's decoded stream, in the same three cases ..."; "a source whose cancel fails does not fail the tool ..." |
| Checker `18438fd0` (caveat): the stdio revocation test did not ask the same server for a second list | It now does, with the command line's own callback and no fallback (`dbcf3a7f`) | "over stdio the caller is read again for each list: after the delegation is revoked, the next list on the same server is an error and shows no tool" |

The same caveat noted that a credential saved before the delegation ID was kept uses its key's latest delegation that is not revoked. That is unchanged, and is written in R-API-14 and the MCP README.

**Limits, restated.** No test runs the real `artroom mcp` binary against the real Room, or an expired bearer over stdio. The Room method `caller(token)` is a seam outside `RoomWire`; the planner accepted the seam in `3d8a74a9` without certifying the roster inference behind it.

**Below, stale.** "For the planner or hugh", points 1 to 4, were answered by `3d8a74a9`; point 5 is the republishing above. The condition table's "Part met" for condition 7 names main's notes and a review not yet started.

### State at `8b46e825` (written after the section below)

The rest of this section describes `b359e278` and is no longer current. It is kept until the head for review exists. This note says what changed since, and what was stopped.

**Done at this head**

- **Recomposed on stage 5's head `bdc35c53`.** Two merges of `request/decl-stage5`: `575caa60` (at `624dbb9f`) and `3a33b1c6` (at `bdc35c53`). One conflict, in `docs/protocol.md` at the end of section 33.10: stage 5's open point 52 is kept as it now reads, and section 34 follows it unchanged. No rule is renumbered.
- **The planner's five decisions (`3d8a74a9`)**, in `ca9cd4c1`:
  1. The caller seam is kept and written down in R-API-14, section 34.2 and the MCP README. It is not a `RoomApi` or `RoomWire` method. `artroom redeem` now keeps the redemption's delegation ID, and `artroom mcp` reads the list under exactly that delegation. `callerFromRoster` refuses a session that names a delegation another key granted, and a key that names a delegation not granted to it. A credential saved before the ID was kept still uses its key's latest delegation.
  2. R-API-14 says a caller may select another named toolset, any of the four. The override decides the default only, and every selected list has the same filter.
  3. Section 34.2's command-line item names the caller wiring and `--toolset` as required work.
  4. Section 23's row "MCP descriptors" gives both vectors: sixteen tools for an admin under a `v2` document, fifteen, with no generic `act`, under `v1`.
  5. No provisional head closes the runtime scope `9ca1d290` or the contract scope `a9788a59`.
- **Checker finding `48765af0`** (P2, condition 5), in `dbcf3a7f` and `8b46e825`: an attention wait cancelled a native update stream while its own reader held the lock, which the stream refuses, so the source was never cancelled. The wait now cancels a native stream through its reader and releases the lock. The client's decoded stream is cancelled as before.
- **Checker caveat `18438fd0`**, in `dbcf3a7f`: the stdio revocation test now asks one server for a second list after the revocation, with the command line's own callback and no fallback to an earlier roster.
- **Controls the decision lists as owed**, added against the real Room in `ca9cd4c1` and `acd6917a`: adapter parity for a `v2` bearer, a `v1` bearer and a member's own key; revocation by undelegate, by revoke-key and by removing the member; a checker's own key; the admin list under both documents; selecting a larger toolset with no gain.

**Checked at this head**

- Root `npm run typecheck`: exit 0.
- MCP package tests: 149 node and 5 workerd passed. The command line's `mcp-core` and `cli` test files: 14 passed. The Room's `mcp-core` and `mcp` test files, legacy run: 31 passed. The client's AGENTS.md test: 3 passed.

**Stopped, and owed**

- **The mutation run is partial.** The inventory is now 76 mutants: the 61 of `b359e278`, of which nine did not pass the workspace typecheck and were rewritten as compiling faults, and fifteen new ones. A run of all 76 at `8b46e825` was stopped after 39, on the planner's request `ecbc722a`. All 39 pass the root typecheck with the mutant applied, are red by a named assertion, and were restored. The other 37 have no result at this head. An earlier complete run of the then 71 at `acd6917a` had the same outcome for all 71; that head is two source commits and one merge behind this one. Runner, inventory and results are in the session scratch directory `mutmcp` (`run2.py`, `mutants.py`, `results2.json`, `results2-acd6917a.json`).
- **Root `npm ci` and `npm test` were not run at this head.** They last passed at `09651d3e`, before the stream repair and the second merge.
- **The mutation table and gates below are those of `b359e278`.** They are not evidence for this head.
- **The guard-by-guard audit** of this lane's source diff against the inventory has not been done.
- **Not shown by any test here:** the real `artroom mcp` binary against the real Room, and an expired bearer over stdio.
- The final integration still follows reviewed stage 5 on main.

Status on 2026-10-04: changes requested (`bc0d7f6b`, at `50216bb1`). What it asked for: the grantor rule, since approved under request `5d41ea36`; and the planner's four contract artifacts republished at the final composed head, with a review bound to both scopes. That republication and review are still owed. All of it is on the integration branch `request/test-overhead`; nothing has landed on main. The line below is the earlier status, kept as history.

Earlier status: implemented, provisional, not yet for review. Gitseq request `9ca1d290` (planner to builder): the runtime of the adopted MCP core, composed with the planner's contract (`request/mcp-core-current`, `1d9ac5ad`) and with stage 5's generic surfaces. Branch `request/mcp-core-runtime`. Code head `217f01f6`; the commit that adds this section changes only this file. Nothing was pushed or deployed, and no Cloudflare credential was used.

Two things are true of this head and must change before review:

- **It is provisional.** It stands on stage 5's composed head `b7b9d8df` and on the stage 2 code head `15fa7f4c`. Neither has landed. The final integration follows reviewed stage 5 on main: this work is composed again there, and every gate and test is run again at that head.
- **Main is not merged.** Main is five planning notes ahead of this head, all under `notes/`. No source file differs.

This runtime is not needed by the first jam development task and is not a jam-readiness gate.

### What was built

- **Sixteen tools.** The fourteen named tools and the generic `acts` and `act`, in one fixed order: `claim`, `workspace`, `propose`, `note`, `review`, `land`, `renew`, `release`, `attention`, `explain`, `lanes`, `lane`, `proposal`, `operation`, `acts`, `act`. In [packages/mcp/src/tools.ts](../packages/mcp/src/tools.ts).
- **Four reads through `RoomApi`.** `lanes`, `lane`, `proposal` and `operation`, in [packages/mcp/src/run.ts](../packages/mcp/src/run.ts). An unknown lane, proposal or operation is `{ outcome: "not-found", what }`. For `operation`, only the lookup's `not-found` becomes that result. Every other failure stays an error.
- **Descriptors.** Each tool has a title, an advertised output schema, fixed annotations and its toolsets. `tools/list` sends name, title, description, input schema, output schema and annotations. `method` and `toolsets` stay on the server. The longest description is 730 characters. The instructions are 480.
- **Toolsets.** [packages/mcp/src/toolsets.ts](../packages/mcp/src/toolsets.ts): the one eligibility predicate (`eligible`), the default (`defaultToolset`), the list (`toolsFor`) and the name check (`toolsetOf`). The Worker handler reads `?toolset=`. `artroom mcp` takes `--toolset`.
- **The caller's authorization.** `tools/list` needs the caller's role and its delegation's signed grant. `RoomApi` has no method that says who is calling, so the host supplies it (`McpCaller`). The Room reads it for a bearer token (`callerOf` in [packages/room/src/requests.ts](../packages/room/src/requests.ts)). The command line builds it from the roster (`callerFromRoster`). See choice 1.
- **Required keys.** Every act tool's schema requires `idempotencyKey`: `claim`, `propose`, `note`, `review`, `land`, `renew`, `release` and `act`. The input is checked against the schema before any runner is called. A call without a key is `bad-request`, and its message says to add any unique string and to reuse it to retry.
- **Waits.** `waitMs` is a whole number from 0 to 45,000 on `attention`, `workspace`, `land` and `operation`. `attention` waits on the handle's subscription for an item for the caller. `operation` waits for `until`, by default the kind's finished states. At the limit each returns what is true now.
- **AGENTS.md.** The MCP form of the generated block says that every act needs an `idempotencyKey` and that a retry reuses it. [packages/client/src/agents-md.ts](../packages/client/src/agents-md.ts).
- **READMEs.** [packages/mcp/README.md](../packages/mcp/README.md) and one paragraph of [packages/cli/README.md](../packages/cli/README.md).

### Conditions

| Condition of `9ca1d290` | State | Where and how shown |
|---|---|---|
| (1) R-API-9, 13, 14 and 15 and every section 34.2 edit: fourteen named tools plus `act` and `acts`; the four reads through `RoomApi`, with structured results for unknown IDs | Met at this head | "Section 34.2 edits" below. MCP: "lanes, lane, proposal and operation read through RoomApi" (3 tests). Room: "the four reads answer from the room; unknown IDs are structured not-found results; …" |
| (2) Titles, conforming output schemas for success and refusal, fixed annotations, descriptions of at most 1,000 characters, instructions of at most 512; conservative fixed hints for `act`; `acts` read-only | Met | MCP: "descriptors: sixteen tools, each with a title, an output schema and fixed annotations" (5 tests). One of them makes a success and a refusal of every act tool and of `workspace` and checks each against the tool's own advertised schema. Room: a `propose` refused `outside-claim` fits the schema `tools/list` sent |
| (3) Toolsets, defaults from authorization, filtering, the `toolset` query, `bad-request` for an unknown name; a deterministic list that does not depend on earlier calls; unlisted calls still judged by the room; `acts` in every set, `act` in builder, reviewer and all; no act tool in observer; a checker covered without review or claim authority; no grant expanded, no intent rebound | Met, with one seam to decide: choice 1 | MCP: "toolsets: what tools/list shows follows the caller's authorization" (12 tests), "listing is not permission" (2). Room: "tools/list at the Worker's MCP endpoint" (6), "the Room gives its MCP endpoint the caller's authorization" (2), "a call the list does not show is still the room's to judge" (2). CLI: "artroom mcp --toolset" (3) |
| (4) Required `idempotencyKey` in schema and at run time for every act tool, `act` included; missing-key refusal; lost-result retries with one effect and the original result; revocation and receipt rules kept; AGENTS.md updated | Met | MCP: "every act tool requires idempotencyKey" (13 tests). Room: "every act tool requires idempotencyKey; a retry gives one effect and the original result" (2), which also shows `unauthenticated` for a retry after revocation. Client: "the MCP block says that every act needs an idempotencyKey and that a retry reuses it" |
| (5) `waitMs` a finite integer from 0 to 45,000 on four tools; defaults kept; caller-specific attention waits; `operation`'s `until` and default finished states; fresh current state on timeout; nothing held while waiting | Met | MCP: "waitMs is a whole number from 0 to 45,000" (10 tests), "attention with waitMs waits for an item for the caller" (7). Room: "waiting is a bounded read that holds nothing in the room" (3): the log's head and the lane's row are equal before and after each wait |
| (6) Stage 5's binding and history behaviour, custody, the `v1` controls and the `fa120186` guards and tests are kept; stage 4's check-service jobs stay separate | Met | Every existing test passes at this head; see "Gates". No stage 5 or stage 2 guard was edited. "Existing tests changed" lists each change. Nothing here touches check-service jobs |
| (7) Main, the four contract paths, section 34 and amendment 7, and stage 5's section 33 reconciled; changed paths and one exact head reported; independent review; tests, named red mutations and gates | Part met | Reconciled at this head: see "Reconciliation" and "Edits to the planner's four paths". Mutations and gates below. **Open:** main's five notes are not merged; the one exact head for review needs stage 5 landed on main; independent review has not started; the planner republishes its artifacts at the final head |

### Section 34.2 edits

| Edit of section 34.2 | Where |
|---|---|
| Lane E 1: `title`, `annotations` and `toolsets` on each descriptor; `idempotencyKey` required on every act tool; `maximum: 45000` on every `waitMs` | `packages/mcp/src/tools.ts`: the constants `READ`, `WRITE` and `CHANGES`, each descriptor, `MAX_WAIT_MS` and `waitMs()` |
| Lane E 2: descriptors and runners for `lanes`, `lane`, `proposal` and `operation`; `McpNotFound`; `operation` uses `op`, then `wait`, and reads again on a timeout | `tools.ts` (descriptors) and `run.ts` (`RUN.lanes`, `RUN.lane`, `RUN.proposal`, `RUN.operation`) |
| Lane E 3: `tools/list` sends `title`, `outputSchema` and `annotations`; `oneOf` result and `Refusal`; a test that validates a success and a refusal | `packages/mcp/src/server.ts` (`listedTools`). The test is in `packages/mcp/test/mcp-core-9ca1d290.test.ts` |
| Lane E 4: `attention` with `waitMs` | `run.ts`: `RUN.attention` and `watchAttention` |
| Lane E 5: the shared predicate and default in HTTPS and stdio; `?toolset=`; ineligible act tools dropped from discovery; every tool still callable; exact retries kept | `toolsets.ts`; `server.ts` (`tools/list` reads the caller and the declarations for each request, and `tools/call` never consults the list); `worker.ts` (the query); `stdio.ts`; `packages/cli/src/main.ts` (`artroom mcp`) |
| Lane E 6: instructions of at most 512 characters; descriptions of at most 1,000 | `tools.ts`: `INSTRUCTIONS` is 480; the longest description, `act`, is 730 |
| Lane E 7: the generated AGENTS.md block | `packages/client/src/agents-md.ts` |
| Lane E 8: `act` and `acts` composed with all of the above; conservative hints for `act`; `acts` read-only; no grant or intent rebound | `tools.ts` (`act` uses `CHANGES`, `acts` uses `READ`, and both carry toolsets); `toolsets.ts` (the generic act is listed by existence, and the signed map is only read) |
| CLI 1: rebuild against the amended MCP package | Done. One source change was also needed, against the section's "no source change": choice 2 |
| The MCP endpoint's deployment: the adapter serves `lane`, `lanes`, `proposal`, `op` and `wait` over `RoomWire.read`, and the attention wait over `RoomWire.subscribe` | `packages/room/src/mcp.ts` already builds the client's bearer handle on the Worker's own `RoomWire`. The new Room tests run the four tools and the attention wait through it. The endpoint also gives the server the caller's authorization (`McpWire.caller`) |
| Other lanes: no change for the four reads | None was made for the reads. The Room gained one read for toolsets: choice 1 |

### Choices where the design left room

1. **The host says who is calling.** `RoomApi` has no method for the caller's own role or grant, and the contract was not widened here. `createArtroomServer` takes `caller()`, and calls it for each `tools/list`. The Room has a new method `caller(token)`, which judges the token exactly as a read does and returns the member's role and the delegation's `kinds` and signed `acts` as recorded. It is not part of `RoomWire`: only the Worker's own MCP endpoint reaches it (`McpRoomWire` in `packages/room/src/worker.ts`). The command line builds the same value from the `members` read: a key file is the member's own key; a bearer file acts under the delegation its room-held key granted. One MCP test shows the two give equal values.
2. **`artroom mcp` changed.** Section 34.2 says the command line needs no source change. It needed six lines: the stdio server must be told the caller, and `--toolset` is the stdio form of `?toolset=`. An unknown name is refused before the room is asked for anything.
3. **Under a delegation, the role is the grantor's member's.** Admission judges a delegated act by the grantor's role, so discovery does too.
4. **A caller may name any of the four toolsets.** R-API-14 says a caller "may ask for fewer" and that the query "selects another toolset". The named set is filtered by the same eligibility, so asking for `all` shows no act tool the caller could not use. The observer override applies to the default only.
5. **An unknown toolset is HTTP 400.** The body is a JSON-RPC error with code -32602 and the `ArtroomError` `bad-request` in `data`. It is checked after the bearer. Every method on that URL is refused, `tools/call` too, so a mistyped URL never half works. An empty value and a repeated parameter are unknown names.
6. **The order.** The ten tools keep their order. The four reads follow them, then `acts` and `act`.
7. **The message for a missing key** is the input check's own message with one sentence added: "Add any unique string as idempotencyKey, and reuse the same one to retry this call." Stage 5's assertion on "input.idempotencyKey: is required" still holds.
8. **A named act tool is listed only while its built-in binding is the active one.** In a room whose `claim` means something else, `claim` is not listed and `act` is. `renew` is listed by the legacy role table and a plain grant, in every room.
9. **`workspace` and the reads are never filtered.** `workspace` is a request. The room's own checks judge it.
10. **`operation`'s finished states.** `landed`, `aborted`, `retryable` and `failed` for a landing; `ready` and `failed` for a workspace; `clean`, `conflict` and `failed` for a preview. An empty `until` means the default. `land` still waits for a terminal or slot-holding state, as before.
11. **The attention wait opens its watch before it reads the page**, so an item that arrives between the two is seen. With `waitMs` of 0 the tool makes one read and no subscription, as before. A handle with no subscription waits out the time and reads again.
12. **The wait limit is the schema's.** The input is copied through JSON and checked against the schema before any runner runs. JSON has no NaN or Infinity; an in-process caller that passes one gets `bad-request`.
13. **The HTTPS bearer client is unchanged.** It always sent a key, and it sends `waitMs: 0`.
14. **In a `v1` room an admin is shown fifteen tools.** R-API-14 says the generic `act` is not listed under a `v1` document. Section 23's row "MCP descriptors" says sixteen for an admin; that holds in a `v2` room.

### Reconciliation with stage 5's text

Section 34 and stage 5's section 33.10 do not contradict each other on any point of meaning. Two sentences of section 33.10 spoke of things section 34 now settles, and were changed to agree:

- The R-API-9 row said `acts` returns `ActsNotFound` "because MCP structured content must be an object". R-API-9 now says the object shape is Artroom's own choice, not a limit of MCP. The row now says so.
- The same row said "The ten named tools are unchanged. The descriptor shape (titles, annotations, toolsets) and any further read tools are the MCP core's". It now says the ten are unchanged, that section 34 adds four named reads, and that the descriptor shape, the toolsets that list `act` and `acts`, their fixed hints, the required key and the wait limit are section 34's.

Nothing else in section 33.10 or in R-CRED-10 was edited. R-API-9's own text already says there is no named `check` or `roster` tool and sends a generic declared check to R-CRED-10 as stage 5 amended it. No rule was renumbered.

### Edits to the planner's four paths

The merge is `b9e959cd`. No later commit touches these paths.

| Path | Edit |
|---|---|
| `docs/protocol.md` | One conflict: both branches append a section. Both are kept, section 33.10 first, then section 34. Then the two sentences above, in section 33.10's R-API-9 row. Section 34 and R-API-13 to R-API-15 are as the planner wrote them |
| `packages/contract/src/transports.ts` | One conflict, in `McpTools`: both branches add members at its end. Both are kept: `lanes`, `lane`, `proposal`, `operation`, then `acts`, `act`. `ActsNotFound`, `McpNotFound`, `McpToolsets` and `McpToolAnnotations` follow. One comment line changed: stage 5's "the two generic tools, beside the ten named ones" now says fourteen and cites both sections. No type was changed |
| `packages/contract/src/index.ts` | None. It merged without conflict |
| `packages/contract/examples/demo-loop.ts` | None. It merged without conflict |

### Existing tests changed

No assertion was weakened. Each change follows from a required key, the 45,000 limit or a toolset.

| File | Change |
|---|---|
| `packages/mcp/test/support.ts` | `roomWithMcp` gives the handler the bearer's caller. New helper `keyed`, which adds a fresh key to an act tool's arguments when a test names none |
| `packages/mcp/test/schema.test.ts` | `operation` calls `op`. `tools/list` entries have six fields. The seven named act tools' required lists include `idempotencyKey`. The demo-loop inputs carry keys, and the `land` input waits 45,000, not 60,000. `NAMED_TOOLS` is fourteen. Four compile-time checks added for the new tools |
| `packages/mcp/test/server.test.ts` | `call` uses `keyed`. "lists exactly the ten tools …" is now "lists the agent's tools …": the builder list, each tool equal to its descriptor |
| `packages/mcp/test/stage0.test.ts` | The listed names are the builder list. Two `propose` calls carry keys |
| `packages/mcp/test/stdio.test.ts` | The server is given a caller. The list is the builder list. The `claim` call carries a key |
| `packages/mcp/test/amendment-2.test.ts` | `call` uses `keyed`. The `renew` after revocation carries a key |
| `packages/mcp/test/review-f47a509c.test.ts` | Three `claim` inputs carry keys |
| `packages/mcp/test/workerd/worker.test.ts` | The handler is given a caller, and its stub room answers `acts`. The list is every tool but `act`. The `claim` call carries a key |
| `packages/mcp/test/workerd/body-cap.test.ts` | The handler is given a caller |
| `packages/cli/test/harness.ts` | The handler is given the bearer's caller |
| `packages/cli/test/cli.test.ts` | "artroom mcp serves the ten tools over stdio …": the list is the builder list, a call of the unlisted `lanes` is added, and the `claim` carries a key |
| `packages/room/test/workerd/mcp.test.ts` | `LISTED` is the builder list without `act`, since the suite runs under both vocabularies. `tool` adds a key where a test names none. Two official-client calls carry keys |
| `packages/room/test/workerd/declared-stage5-a5d64b35.test.ts` | Five named-tool calls carry keys: four `claim` and one `propose` |
| `packages/client/test/support/fake-room.ts` (a test double) | `bearerCaller`, as the Room's `caller`. `lanes` filters by `touches`. A checker may sign its own `roster` ops, as the Room's role table says, so a checker's invitation can be redeemed |

New test files: `packages/mcp/test/mcp-core-9ca1d290.test.ts` (52 tests), `packages/room/test/workerd/mcp-core-9ca1d290.test.ts` (16 tests, in the legacy run; they found their own `v1` and `v2` rooms, as stage 2's and stage 5's do), `packages/cli/test/mcp-core-9ca1d290.test.ts` (3 tests), and one test added to `packages/client/test/agents-md.test.ts`.

### Mutation table

Each new guard is one statement marked `// GM:<id>`. The runner and results are in the session scratch directory `mutmcp` (`run.py`, `mutants.py`, `results.json`). For each mutant the runner applies one text edit, runs the suites that cover the file's package, and writes the file's bytes back. A red counts only when a test fails by an assertion. A test that times out or fails by another thrown error is counted apart.

61 mutants over 48 marked guards. 61 turn at least one named test red by an assertion. Survivors: none. The first run left one survivor, `readonly-direct`: no test had an own-key caller with nothing eligible. A test was added ("the default comes from the roster role …" now checks a checker's own key in a room that declares nothing for it), and the mutant was run again and is red. 4 mutants also made one test fail by a thrown error or a timeout; those failures are not counted as reds, and each of those mutants has assertion reds besides.

| Mutant | What it does | Reds | One test that goes red |
|---|---|---|---|
| `key-claim` (`mcp/tools.ts`) | Claim no longer requires a key | 5 | mcp: "every act tool requires idempotencyKey (R-API-9) the schema requires it for the eight act tools, act included, and for no other tool" |
| `key-renew` (`mcp/tools.ts`) | Renew no longer requires a key | 4 | mcp: "every act tool requires idempotencyKey (R-API-9) the schema requires it for the eight act tools, act included, and for no other tool" |
| `key-release` (`mcp/tools.ts`) | Release no longer requires a key | 4 | mcp: "every act tool requires idempotencyKey (R-API-9) the schema requires it for the eight act tools, act included, and for no other tool" |
| `key-propose` (`mcp/tools.ts`) | Propose no longer requires a key | 4 | mcp: "every act tool requires idempotencyKey (R-API-9) the schema requires it for the eight act tools, act included, and for no other tool" |
| `key-note` (`mcp/tools.ts`) | Note no longer requires a key | 4 | mcp: "every act tool requires idempotencyKey (R-API-9) the schema requires it for the eight act tools, act included, and for no other tool" |
| `key-review` (`mcp/tools.ts`) | Review no longer requires a key | 4 | mcp: "every act tool requires idempotencyKey (R-API-9) the schema requires it for the eight act tools, act included, and for no other tool" |
| `key-land` (`mcp/tools.ts`) | Land no longer requires a key | 4 | mcp: "every act tool requires idempotencyKey (R-API-9) the schema requires it for the eight act tools, act included, and for no other tool" |
| `key-act` (`mcp/tools.ts`) | Act no longer requires a key | 4 | mcp: "act: any declared act, with the binding the agent read the schema refuses a call without a binding or a key before the room is asked; a platform ki…" |
| `key-advice` (`mcp/run.ts`) | A missing key is not told how to add one | 9 | mcp: "every act tool requires idempotencyKey (R-API-9) claim without a key is bad-request, says how to add one, and the room is never asked" |
| `wait-max` (`mcp/tools.ts`) | Waits up to 300,000 ms are accepted | 5 | mcp: "waitMs is a whole number from 0 to 45,000 (R-API-15) exactly four tools take waitMs, each with the same bounds" Also 1 test failed by a thrown error or a timeout, not counted. |
| `wait-whole` (`mcp/tools.ts`) | `waitMs` need not be a whole number | 6 | mcp: "waitMs is a whole number from 0 to 45,000 (R-API-15) exactly four tools take waitMs, each with the same bounds" |
| `wait-from-zero` (`mcp/tools.ts`) | A negative waitMs is accepted | 6 | mcp: "waitMs is a whole number from 0 to 45,000 (R-API-15) exactly four tools take waitMs, each with the same bounds" |
| `attention-default` (`mcp/run.ts`) | Attention with no waitMs opens a watch and reads twice | 1 | mcp: "attention with waitMs waits for an item for the caller (R-API-15) with no waitMs, or 0, it is one read and no subscription" |
| `attention-nonempty` (`mcp/run.ts`) | Attention waits although the page has items | 1 | mcp: "attention with waitMs waits for an item for the caller (R-API-15) a page that already has items returns at once, without waiting" |
| `attention-reread` (`mcp/run.ts`) | Attention returns the first, empty page after the wait | 6 | mcp: "attention with waitMs waits for an item for the caller (R-API-15) over the long poll: updates without attention items do not end the wait; the one …" |
| `attention-items` (`mcp/run.ts`) | Any update ends the attention wait on a stream, not only one with items for the caller | 1 | mcp: "attention with waitMs waits for an item for the caller (R-API-15) through the endpoint: an empty page, then a note notifies the caller: the page wi…" |
| `attention-items-poll` (`mcp/run.ts`) | Any update ends the attention wait on the long poll | 1 | mcp: "attention with waitMs waits for an item for the caller (R-API-15) over the long poll: updates without attention items do not end the wait; the one …" |
| `op-not-found-all` (`mcp/run.ts`) | Every failure of the operation read becomes not-found | 1 | mcp: "lanes, lane, proposal and operation read through RoomApi (R-API-9) operation: only the lookup's not-found becomes a result; unauthenticated, forbid…" |
| `op-not-found-none` (`mcp/run.ts`) | An unknown operation is an error, not a result | 4 | mcp: "descriptors: sixteen tools, each with a title, an output schema and fixed annotations (R-API-13) a success and a refusal of every act tool and of w…" |
| `op-until-ignored` (`mcp/run.ts`) | Operation ignores the caller's until | 1 | mcp: "waitMs is a whole number from 0 to 45,000 (R-API-15) operation reads once with no waitMs; with one it waits for until, by default the kind's finish…" |
| `op-until-default` (`mcp/run.ts`) | Operation's default until is not the kind's finished states | 1 | mcp: "waitMs is a whole number from 0 to 45,000 (R-API-15) operation reads once with no waitMs; with one it waits for until, by default the kind's finish…" |
| `op-wait-zero` (`mcp/run.ts`) | Operation waits although waitMs is 0 | 1 | mcp: "waitMs is a whole number from 0 to 45,000 (R-API-15) operation reads once with no waitMs; with one it waits for until, by default the kind's finish…" |
| `op-wait-reached` (`mcp/run.ts`) | Operation waits although the state is already reached | 1 | mcp: "waitMs is a whole number from 0 to 45,000 (R-API-15) operation reads once with no waitMs; with one it waits for until, by default the kind's finish…" |
| `op-timeout-swallow` (`mcp/run.ts`) | Every failure of the operation wait is answered with the current state | 1 | mcp: "waitMs is a whole number from 0 to 45,000 (R-API-15) operation at waitMs returns the operation's current state, read afresh, and not an error; anot…" |
| `op-timeout-error` (`mcp/run.ts`) | An operation wait that times out is an error | 3 | mcp: "waitMs is a whole number from 0 to 45,000 (R-API-15) operation at waitMs returns the operation's current state, read afresh, and not an error; anot…" |
| `lane-not-found` (`mcp/run.ts`) | An unknown lane is null, not a structured result | 4 | mcp: "descriptors: sixteen tools, each with a title, an output schema and fixed annotations (R-API-13) a success and a refusal of every act tool and of w…" |
| `proposal-not-found` (`mcp/run.ts`) | An unknown proposal says what: lane | 4 | mcp: "descriptors: sixteen tools, each with a title, an output schema and fixed annotations (R-API-13) a success and a refusal of every act tool and of w…" |
| `hint-conservative` (`mcp/tools.ts`) | Act, land and release are advertised as not destructive | 2 | mcp: "descriptors: sixteen tools, each with a title, an output schema and fixed annotations (R-API-13) the annotations are the rule's table, and act's ar…" |
| `list-annotations` (`mcp/server.ts`) | Tools/list sends no annotations | 5 | mcp: "descriptors: sixteen tools, each with a title, an output schema and fixed annotations (R-API-13) tools/list as an admin shows the fourteen named to…" |
| `list-title` (`mcp/server.ts`) | Tools/list sends no title | 3 | mcp: "descriptors: sixteen tools, each with a title, an output schema and fixed annotations (R-API-13) tools/list as an admin shows the fourteen named to…" |
| `list-server-fields` (`mcp/server.ts`) | Tools/list sends the server-side toolsets | 2 | mcp: "descriptors: sixteen tools, each with a title, an output schema and fixed annotations (R-API-13) tools/list as an admin shows the fourteen named to…" |
| `act-toolsets` (`mcp/tools.ts`) | The observer toolset lists act | 3 | mcp: "descriptors: sixteen tools, each with a title, an output schema and fixed annotations (R-API-13) each descriptor's toolsets are the rule's table: a…" |
| `list-fresh` (`mcp/server.ts`) | A server keeps the first caller and declarations it read | 1 | mcp: "toolsets: what tools/list shows follows the caller's authorization (R-API-14) the list is the same before and after other calls, and it is read afr…" |
| `toolset-unknown` (`mcp/toolsets.ts`) | An unknown toolset name is accepted | 2 | mcp: "toolsets: what tools/list shows follows the caller's authorization (R-API-14) an unknown toolset name is bad-request, over HTTPS and for stdio, and…" Also 1 test failed by a thrown error or a timeout, not counted. |
| `toolset-query` (`mcp/worker.ts`) | The toolset query is ignored | 8 | mcp: "toolsets: what tools/list shows follows the caller's authorization (R-API-14) an unknown toolset name is bad-request, over HTTPS and for stdio, and…" Also 1 test failed by a thrown error or a timeout, not counted. |
| `toolset-one` (`mcp/worker.ts`) | Two toolset parameters are accepted | 2 | mcp: "toolsets: what tools/list shows follows the caller's authorization (R-API-14) an unknown toolset name is bad-request, over HTTPS and for stdio, and…" |
| `platform-grant` (`mcp/toolsets.ts`) | Renew is listed without a grant for it | 7 | mcp: "toolsets: what tools/list shows follows the caller's authorization (R-API-14) the generic act is listed by existence: platform-only grants and an a…" |
| `platform-role` (`mcp/toolsets.ts`) | Renew is listed for a role that may not sign it | 3 | mcp: "toolsets: what tools/list shows follows the caller's authorization (R-API-14) a caller may ask for another toolset; the list is that set, filtered …" |
| `legacy-grant` (`mcp/toolsets.ts`) | A v1 delegation's kinds do not filter the named tools | 4 | mcp: "toolsets: what tools/list shows follows the caller's authorization (R-API-14) tools/list as an agent; with ?toolset=reviewer; as a bearer whose del…" |
| `legacy-role` (`mcp/toolsets.ts`) | The v1 role table does not filter the named tools | 1 | mcp: "toolsets: what tools/list shows follows the caller's authorization (R-API-14) the generic act is listed by existence: platform-only grants and an a…" |
| `generic-v1` (`mcp/toolsets.ts`) | The generic act is listed under a v1 document | 10 | mcp: "toolsets: what tools/list shows follows the caller's authorization (R-API-14) tools/list as an agent; with ?toolset=reviewer; as a bearer whose del…" |
| `who` (`mcp/toolsets.ts`) | Who.roles does not decide eligibility | 5 | mcp: "toolsets: what tools/list shows follows the caller's authorization (R-API-14) the default comes from the roster role: all for admin and maintainer,…" |
| `who-admin` (`mcp/toolsets.ts`) | Admin is not implicit | 3 | mcp: "descriptors: sixteen tools, each with a title, an output schema and fixed annotations (R-API-13) tools/list as an admin shows the fourteen named to…" |
| `delegable` (`mcp/toolsets.ts`) | A kind that may not be delegated is eligible for a delegated caller | 2 | mcp: "toolsets: what tools/list shows follows the caller's authorization (R-API-14) discovery follows a changed role, a changed who and a declaration tha…" |
| `map-binding` (`mcp/toolsets.ts`) | A stale signed binding counts as current | 6 | mcp: "toolsets: what tools/list shows follows the caller's authorization (R-API-14) the generic act is listed by existence: platform-only grants and an a…" |
| `map-entry` (`mcp/toolsets.ts`) | A kind the signed map does not name is eligible | 13 | mcp: "toolsets: what tools/list shows follows the caller's authorization (R-API-14) tools/list as an agent; with ?toolset=reviewer; as a bearer whose del…" |
| `built-for` (`mcp/toolsets.ts`) | A named tool is listed although its built-in binding is not the active one | 1 | mcp: "toolsets: what tools/list shows follows the caller's authorization (R-API-14) a named act tool is shown only while the room's declaration of its ki…" |
| `readonly-override` (`mcp/toolsets.ts`) | A delegation with no eligible act kind keeps its role's toolset | 8 | mcp: "toolsets: what tools/list shows follows the caller's authorization (R-API-14) a checker: its own key; delegated with one eligible declared check ki…" |
| `readonly-direct` (`mcp/toolsets.ts`) | An own-key caller with no eligible act kind gets observer | 1 | mcp: "toolsets: what tools/list shows follows the caller's authorization (R-API-14) the default comes from the roster role: all for admin and maintainer,…" |
| `checker-default` (`mcp/toolsets.ts`) | A checker's default is builder | 5 | mcp: "toolsets: what tools/list shows follows the caller's authorization (R-API-14) the default comes from the roster role: all for admin and maintainer,…" |
| `default-all` (`mcp/toolsets.ts`) | An admin's default is builder | 4 | mcp: "descriptors: sixteen tools, each with a title, an output schema and fixed annotations (R-API-13) tools/list as an admin shows the fourteen named to…" |
| `set-member` (`mcp/toolsets.ts`) | Every toolset lists every tool | 25 | mcp: "toolsets: what tools/list shows follows the caller's authorization (R-API-14) the default comes from the roster role: all for admin and maintainer,…" |
| `act-filter` (`mcp/toolsets.ts`) | Act tools are listed whatever the caller may sign | 22 | mcp: "toolsets: what tools/list shows follows the caller's authorization (R-API-14) the default comes from the roster role: all for admin and maintainer,…" |
| `act-existence` (`mcp/toolsets.ts`) | The generic act is listed with no eligible kind | 14 | mcp: "toolsets: what tools/list shows follows the caller's authorization (R-API-14) tools/list as an agent; with ?toolset=reviewer; as a bearer whose del…" |
| `roster-revoked` (`mcp/toolsets.ts`) | A revoked delegation named by ID is a caller | 1 | mcp: "toolsets: what tools/list shows follows the caller's authorization (R-API-14) HTTPS and stdio give the same list for the same authorization" |
| `agents-key` (`client/agents-md.ts`) | The MCP block keeps the old retry advice | 1 | client: "the MCP block says that every act needs an idempotencyKey and that a retry reuses it (R-API-9, amendment 7)" |
| `cli-toolset` (`cli/main.ts`) | Artroom mcp ignores --toolset | 1 | cli: "artroom mcp --toolset (R-API-14) a member's key: the builder list by default, the reviewer list with --toolset reviewer, and a tool the list omits …" |
| `cli-caller` (`cli/main.ts`) | A bearer file is treated as the member's own key | 1 | cli: "artroom mcp --toolset (R-API-14) a redeemed bearer: the list follows the session's delegation, as it does at the MCP URL" |
| `caller-judged` (`room/requests.ts`) | The caller read does not judge the token | 1 | room: "the Room gives its MCP endpoint the caller's authorization (R-API-14) an unknown token, and a bearer whose key was revoked, are unauthenticated; to…" |
| `caller-grant` (`room/requests.ts`) | The caller read drops the signed map | 5 | room: "the Room gives its MCP endpoint the caller's authorization (R-API-14) a bearer: its member's role now, and its delegation's signed grant unchanged;…" Also 1 test failed by a thrown error or a timeout, not counted. |
| `caller-delegation` (`room/requests.ts`) | The caller read presents a bearer as the member's own key | 7 | room: "the Room gives its MCP endpoint the caller's authorization (R-API-14) a bearer: its member's role now, and its delegation's signed grant unchanged;…" |

### Gates

Run one after another in this worktree at the code head, each as its own command, with its exit code checked. The commit that adds this section changes no file a test or the compiler reads; the typecheck and the whitespace check were run again after it.

| Gate | Exit | Result |
|---|---|---|
| `npm ci` | 0 | Installed from the lockfile, which is unchanged |
| `npm run typecheck` | 0 | All eleven workspaces |
| `npm test` | 0 | 3,167 vitest tests passed and 127 skipped, in these runs: checkers 43; cli 185; client 122 and 2; log 198 and 193; mcp 139 and 5; policy 313, and 311 with 2 skipped; room node 270, room legacy run 658, room declared run 533 with 125 skipped; ui 195. `packages/git` runs under the Node test runner: 340 passed. No test failed |
| `git diff --check b7b9d8df` | 0 | No whitespace error |

The declared run's skips are the tests that found their own rooms (stage 2's, stage 5's and this request's 16) and the seven that need stage 3's `artroom verify`. Policy's 2 skips are as before.

### Not changed here

`packages/log`, `packages/policy`, `packages/git`, `packages/ui`, `packages/checkers` and the Room's admission are unchanged. The Room's only source changes are the caller read (`requests.ts`, `room.ts`) and its use by the MCP endpoint (`mcp.ts`, `worker.ts`). No migration. The contract is as the merge left it.

### For the planner or hugh

1. **The caller read.** Choice 1 adds a Room read that the contract does not name. The planner may want it in the contract instead, for example as a read query a session or bearer token may make about itself. That would let every host use one source, and would remove the command line's rule for finding a bearer's delegation in the roster.
2. **Asking for a larger toolset.** Choice 4 lets an agent name `all`. If "fewer" was meant strictly, the name check is the place to refuse it.
3. **Section 34.2's CLI line** says no source change is required. One was: choice 2.
4. **Section 23's "MCP descriptors" row** holds only in a `v2` room: choice 14.
5. **The planner's artifacts.** The planner republishes them at the final head. That head does not exist yet: it needs stage 5 reviewed and landed, then this branch composed on main.

## Installable packed packages (request 7e82100b)

Status on 2026-10-04: approved. Review `81478e2d` approved the head `1e444739` (ratified `99d8496b`), after the repair for review `59605d51`. The candidate packed from `1b40b7ec` is not the final release: the release is packed again from the commit that lands. Gitseq request `7e82100b` (planner to builder, replacing `64dc6f04`), promise `1eb5788c`, under the planner's note `plans/013-2026-10-04-first-jam-release.md` (decision `b6dd55dc`). On `request/test-overhead`. Nothing was published to a registry, and no provider was contacted.

**What this is.** Six packages that a repository outside this one can install: contract, policy, client, mcp, log and the `artroom` command. It is the installability the first jam task needs. The public-package starter and its conformance route stay owed under request `f3299ab4`. Publishing to a public registry is the owner's decision and is not part of this.

**How it works.** [docs/release.md](../docs/release.md) is the instruction. Inside the repository each package's `exports` and `bin` still name TypeScript source, so the tests, the typecheck and the Workers run the source as before; no test or resolution setting changed. npm does not rewrite `exports` or `bin` from `publishConfig` when it packs (tried with npm 11.19.1), so the release script writes the tarball's manifest itself: it builds `src` to `dist` (JavaScript and declarations), copies `dist`, the README, `LICENSE` and `NOTICE` into a staging directory outside the repository, turns each `./src/x.ts` export into its built file and declaration, drops scripts and development dependencies, and packs there. No source file changed.

**The release candidate.** Version `0.1.0-dev.1`, built and packed from source commit `1b40b7ec1ca8051900233123f95ac85c8a69fe81` (tree `6c8c82edc031d9b739277981b607dacb42930aaa`, clean), with Node 26.10.0 and npm 11.19.1, in a clean checkout:

```
npm ci
npm run release:pack -- /Users/hughpyle/play/artroom-releases/candidates/1b40b7ec
npm run release:check -- /Users/hughpyle/play/artroom-releases/candidates/1b40b7ec
```

| Package | Tarball | Bytes | SHA-256 |
|---|---|---|---|
| `@generalbusiness/artroom-contract` | `generalbusiness-artroom-contract-0.1.0-dev.1.tgz` | 51,379 | `834e61bad0d625cdbd85b7cc16c8fe17d0abd17c87e86f00671c7ca7e1fe23ef` |
| `@generalbusiness/artroom-policy` | `generalbusiness-artroom-policy-0.1.0-dev.1.tgz` | 75,663 | `1ae1d1be10fc804c4f9687f4eb2187cd46bf720034de4604cf1b7c49e3feaedb` |
| `@generalbusiness/artroom-client` | `generalbusiness-artroom-client-0.1.0-dev.1.tgz` | 51,184 | `98c9183ab73d4f13750da8ea97af3bf5fb7b91202455260e034839edd048d24a` |
| `@generalbusiness/artroom-mcp` | `generalbusiness-artroom-mcp-0.1.0-dev.1.tgz` | 34,476 | `8a69286e0d285c245b4731318686785e0125b6c01d8e28540eb907673f60b8aa` |
| `@generalbusiness/artroom-log` | `generalbusiness-artroom-log-0.1.0-dev.1.tgz` | 126,796 | `6f27164e7e4939ff6b24e0817d2e1de159938e26eed6f559394301b01d807d5d` |
| `@generalbusiness/artroom-cli` | `generalbusiness-artroom-cli-0.1.0-dev.1.tgz` | 227,449 | `40084846d1cb32ffedb426c92be54a4e93395d877552c5688173ee7866d64e41` |

Packing the same source twice gave the same bytes: a trial run from the working tree, and this run from a clean checkout, have the same six hashes. The contract, policy and MCP tarballs have the bytes they had in the candidate packed from `980618d1`. The client and log tarballs differ because their source changed on the branch since then. The command's tarball differs for that reason and because it now carries the licence texts.

This is a candidate. The release the jam installs is packed again from the commit that lands on main.

**Third-party code in the command (review `59605d51`).** The finding: the command's tarball is one bundled file holding other packages' code, and it carried only Artroom's own `LICENSE` and `NOTICE`. The repair:

- The tarball now holds `THIRD-PARTY-NOTICES.txt`: for each package in the bundle, its name, version, declared licence and the complete text of the licence file that package ships. npm installs it with the command.
- The bundle holds more than the finding named. The MCP server package's published build already contains a schema validator and its helpers, and the bundle takes them with it. Nine packages are recorded:

| Package | Version | Declared licence | How it is in the bundle |
|---|---|---|---|
| `@modelcontextprotocol/core` | 2.0.0 | MIT | bundled directly |
| `@modelcontextprotocol/server` | 2.0.0 | MIT | bundled directly |
| `ajv` | 8.18.0 | MIT | embedded in the published build of `@modelcontextprotocol/server` |
| `ajv-formats` | 3.0.1 | MIT | embedded in the published build of `@modelcontextprotocol/server` |
| `content-type` | 1.0.5 | MIT | embedded in the published build of `@modelcontextprotocol/server` |
| `fast-deep-equal` | 3.1.3 | MIT | embedded in the published build of `@modelcontextprotocol/server` |
| `fast-uri` | 3.1.0 | BSD-3-Clause | embedded in the published build of `@modelcontextprotocol/server` |
| `json-schema-traverse` | 1.0.0 | MIT | embedded in the published build of `@modelcontextprotocol/server` |
| `zod` | 4.4.3 | MIT | bundled directly |

- The record is `release/third-party`: `packages.json` and one licence file per package, copied unchanged from the published package at that exact version, with its SHA-256. For the six that are installed here at the recorded version, the installed licence file has the same hash. `ajv` 8.18.0 and `fast-uri` 3.1.0 are installed here at other versions, so their files were fetched from npm's public registry at the embedded versions. No package ships a separate notice file.
- Nobody lists the bundle's contents by hand. The scripts read them from the bundle: the bundler's comment for each module file, and, where such a file has a source map, the packages and versions the map names. `release:pack` stops if the bundle and the record differ in either direction. `release:check` makes the same comparison on the bundle inside the tarball, compares the notices file in the tarball and in the installed package with the text built from the record, and checks each licence text is in it. The release manifest records the nine with their licence hashes.
- The command is still self-contained, with no runtime dependency, and the scope is still six packages. The five libraries are compiled, not bundled, so their tarballs hold only Artroom code.

Controls, by hand, each restored afterwards: one byte added to a recorded licence text failed the gate's test ("does not have the recorded SHA-256"); a package removed from the record made the comparison, and `release:check` on a packed tarball, fail by naming it ("the bundle contains fast-uri 3.1.0 (embedded in @modelcontextprotocol/server), which release/third-party/packages.json does not record").

Limits of this repair: the embedded packages are found through the source maps the MCP server package publishes; a bundled package that embedded other code and published no source map would not be found this way. The record says what each package declares and ships. It is not legal advice.

**Where it is.** The directory `/Users/hughpyle/play/artroom-releases/candidates/1b40b7ec/` on the development machine holds the six tarballs, `release-manifest.json`, the consumer's lock file (`consumer-package-lock.json`), the lock file of the command installed alone (`cli-only-package-lock.json`) and the check's output (`release-check.log`). The manifest, the two lock files and the log are also attached to the review request in the workroom. The jam repository installs from that directory by file path. This is a local route, chosen because the first jam task runs on this machine; it is not a public release.

**The consumer check** (`npm run release:check`, [scripts/check-release.mjs](../scripts/check-release.mjs)): 55 checks passed, in 7 seconds. It copies [release/consumer](../release/consumer) to a fresh directory outside the repository and:

- installs the six tarballs with npm, with a saved lock file that names each by file and integrity, no link, and no other Artroom package (239 packages with third-party dependencies, from the public registry);
- imports each of the 14 library subpaths from plain Node;
- typechecks the fixture under NodeNext and under bundler resolution, with ordinary settings, and runs it compiled;
- runs `artroom-verify` to its usage line;
- installs the command's tarball alone in a second fresh directory, where it is the only package, reads the third-party licence texts from the installed package, and runs `npx artroom --help`;
- checks, for each tarball, its identity against the manifest, that every export, declaration and bin is a file in it, that `LICENSE` and `NOTICE` are there, that the command's tarball has the licence text of every package in its bundle, that it holds only built files, and its version, internal dependencies and `engines`.

This shows the packages install and load. It does not show Room admission: no room was contacted.

**Subpaths.** All 14 load under plain Node; none is for a Worker only. contract, policy and client import no Node or Cloudflare module and also run in a browser and a Worker. `mcp`'s `./stdio` and `log`'s `./git-cli` and its command need Node. `mcp`'s `./worker` is written for a Worker and also loads under Node.

**In the gate.** `scripts/release-manifest.test.mjs`, four tests in about 0.1 s, reads the six manifests, the build configurations and the third-party record: one nonzero version, exact dependencies between the six, a command with no runtime dependency, every export and bin naming a source file the build covers, and recorded licence texts that have their recorded hashes. Four hand-made controls each failed the test they should: a version mismatch, an export naming a missing source file, an Artroom runtime dependency on the command, and a build that leaves out the bin's source. The pack-and-install check is outside the gate because it installs from the network.

**Changed.** The six package manifests (version, exact internal versions, `engines`, `files`, a `build` script for the five libraries; the command's Artroom packages moved to development dependencies, since its bundle holds what it runs); a `tsconfig.build.json` in each library; `packages/ui/package.json`, two lines, so that the workspace still links contract and policy at the new version; `package-lock.json`; the root `package.json` (two release scripts, and the manifest test in `npm test`); `scripts/pack-release.mjs`, `scripts/check-release.mjs`, `scripts/release-lib.mjs`, `scripts/release-manifest.test.mjs`; `scripts/test-changed.mjs` (runs the manifest test when a manifest changed); `release/consumer/`; `docs/release.md`; a short "Installing" section in five READMEs; [docs/testing.md](../docs/testing.md) and [test-invariants.md](test-invariants.md). For review `59605d51`: `release/third-party/` (the record and nine licence files), `.gitattributes` (the licence files are kept byte for byte), the three release scripts and their test, `scripts/test-changed.mjs` (a change to the record runs the test), `docs/release.md` and one row in `plans/test-invariants.md`.

**Limits.**

- The declarations keep `.ts` in relative specifiers; TypeScript rewrites only the JavaScript. They typecheck for a consumer on TypeScript 7.0.2, and did in one trial on 5.9.3. Earlier versions are untried.
- A consumer that uses bundler resolution without Node's types needs `ESNext.Disposable` in its `lib`, because the contract's declarations use `Disposable`.
- Running `npm pack` in a library's own directory still packs the source-pointing manifest. The release instruction warns against it; nothing prevents it.
- The contract package has no README, so its tarball has none.
- Not tried: `npm ci` in a consumer from the saved lock file, and a global install of the command.

**Gates.** The review request gives the gate's result at the head sent. The packaging source is that of `1b40b7ec`; the head for review adds only this section. The earlier candidate, packed from `980618d1`, is still at `/Users/hughpyle/play/artroom-releases/0.1.0-dev.1/`; it lacks the licence texts and is not to be installed.

## Intermediate verifier release (request 42342e35)

Status: implemented, pending review. Gitseq request `42342e35` (planner to builder, replacing `34c87678`), promise `4e66accc`, under the planner's note `plans/013-2026-10-04-first-jam-release.md` (decision `a6824b80`). On `request/test-overhead`.

**What this is.** Main cannot read a `v2` room's log. This delivery is the verifier that the integration branch has, sent for review as a bounded release of its own so that reviewed declared-acts code can reach main. It is not declared acts stage 3. Request `1e8fee4b` and promise `3af8ebc7` stay open and promised, and this section claims none of their conditions as complete.

**What a review of this release assesses.** The delivered verifier, as it is:

| Scope | What is delivered | Where to read |
|---|---|---|
| Stage 3 condition 1 | Decoding by grammar; kind, binding, body, target and `who` judged under the document in force at each entry; the legacy rule for `v1`; a steps version or profile the verifier lacks reported as a limit | The stage 3 section, "What was built"; map rows under Log |
| The delivered part of condition 2 | The calls admission had to make are derived per entry, and their inputs and budget rebuilt from the fold; a missing, extra or differing call is named. For check carries: recorded judgments are replayed; a duplicate, a carry that skipped a newer check, and a land evaluation with a blocking obligation open are refused | The stage 3 section, "State at the integration head"; [notes/2026-10-03-carry-accounting.md](../notes/2026-10-03-carry-accounting.md) |
| Condition 3's fixtures | The fresh-clone replay with a forged undeclared kind; the old `v1` log; two steps versions; the legacy recovery sequence, with its negative half run over the whole log by a verifier with the wrong vocabulary (`declared-legacy-negative.test.ts`); forged logs with a call removed or a context changed; a forged stale binding | Map rows under Log |
| Conditions 4 and 5 | As reconciled by request `ecbc722a`: useful witnesses and one-change controls, the gate once at the head, changed paths disclosed. No mutation count | [docs/testing.md](../docs/testing.md) |

**What changed for this release.** The verifier's own output now states the limit of its carry accounting, as the commission asks:

- `VerifyReport.carryAccounting` is `"partial"`, for a program.
- The list `cannotProve` replaces its one line about carry with two entries. The first says what is done and what is not: recorded judgments are replayed and three omissions are detected, but verify cannot show a missing judgment that did not carry when no later one carried, a missing whole pass, the order, inputs and budget of the judgments, or an extra judgment that belongs to no pass, and the log does not record waiting, cancellation, repeated preparation or what a recovery landing skipped. The second says what a verified prefix means and does not mean.
- `artroom-verify` prints "Carry accounting: partial." and each of those entries, whether verification passed or failed. Its first line on success is now "Verified. Every check this verifier makes passed; what it cannot prove is listed below."
- R-DECL-25 in [docs/protocol.md](../docs/protocol.md) and the log package's README say the same.

Witness: `packages/log/test/cli.node.test.ts`, "the report says, for a program and for a person, that carry judgements are accounted for only in part ...".

**Two repairs from the review of `391d20cd`** (changes requested, `63af1ce0`):

| Finding | What was wrong | Repair | Witness |
|---|---|---|---|
| The report claimed checks that `--no-replay` skips | With replay off, verify skips every policy evaluation, yet the list of what it cannot prove still said that decisions and carry judgments were replayed and calls derived, and `carryAccounting` said `partial`. A log with a judgment that a full run refuses passed, under those claims | The report has `mode`: `full` or `integrity`. In an integrity run `carryAccounting` is `none`, and the statements about replay, derived calls, Git witnesses and carry are replaced by one that says none of it was done and what such a run lets through. The text output prints the mode | `declared-obligations.test.ts`: "with replay off the report says so ..."; `cli.node.test.ts` |
| A signed legacy check with no `input` made verify throw | The decoder checked a legacy check's obligation, checker and configuration, not the `input` and `integration` that verify reads later, so a `TypeError` escaped and the command printed no report | The decoder requires both. Such an entry is `malformed` at its seq, with the verified prefix, with replay on or off | `amendment-3.test.ts`: "a signed check with no input, or no integration, is malformed at its entry ..." |

Controls: the decoder's check; the mode and its statements. Each distinguishes.

**One repair from the review of `f2582a68`** (changes requested, `7df5edb5`; the planner's note `plans/016-2026-10-04-verification-mode-clarification.md` gives the wording rule). The integrity run's description denied work the run still does. It said no Git object was read to witness a version, and that a land evaluation with an obligation open passes. Both were wrong:

- With replay off, verify still reads Git objects for a version's changed paths.
- It still refuses a land evaluation while the admin-approval obligation is open. That obligation is known without replay, from the receipt that opened it or from the document and the changed paths. Obligations that rules open are known only by replay, so the integrity run does not see those.
- It still checks that a check names its checker's configuration and, where a prepared event exists, an integration and input the event names; and that each check-carried event names an earlier accepted check of the same lane and obligation and an activated policy, with an outcome of the right shape.

No check was added or removed. The report now says this. The integrity run's statement has two entries. The first says what was not done: no decision evaluated, no call, input or budget checked, no carry judgment replayed or accounted for, no land input rebuilt; and the run "does not detect" the forgeries that need those. The second names the checks that still ran, says the landing guard is not a replay of the land input and sees only the admin-approval obligation, and says what the run did with Git objects. Where Git objects and a version's retained proposal context were both present, it compared the context's changed paths with Git's and took Git's list where the context left a change out. That comparison goes one way and refuses nothing: it does not reject a change the context has and Git lacks, and it does not show that the context's base is the merge base. The run did not rebuild or compare the complete rule context or its budget, and it refuses no context mismatch; only a full run does. The wording at `f8d8980a` said no recorded context was compared with Git objects. Review `925790d7` (changes requested) showed from the source that this was too broad, and this is the correction. It changes text only. The categorical "passes this run" is gone. The command's mode line, the `mode` field's description, the log package's README and R-DECL-25 say the same. `mode` and `carryAccounting` are unchanged.

Witnesses in `packages/log/test/declared-obligations.test.ts`:

- "with replay off the report says so ...", extended: the report has neither denial, names the kept checks, and a reader that records each object read shows the run read the objects of the proposal heads.
- "with replay off the guard on landings still runs, as the report says ...": a forged land evaluation with admin approval open is refused `guard-failed` with replay off; the same forgery for an obligation a rule opens passes with replay off and is refused with replay on.

No source control was run for this repair: it changes text, and the two tests show behaviour that was already there. Before the change the first test fails on the two denials.

**A second repair at the same head, raised by the planner while that review ran** (chat, 2026-10-04; source-qualified by the planner, then run here). Verify reads some parts of a retained context by their shape, before or without replaying it: a proposal's `base` and `changed` list for the Git comparison above, a carry context's `changedSince`, and a land input's `obligations` and `reviews`. The decoder checked only that a retained context has a known kind, an input and a budget. A retained context whose `changed` list held `null`, kept under its own digest in a resealed log, made verify throw a `TypeError`, with replay on or off, when the Git objects were present. The decoder now checks those parts: such a context is `malformed`. In a full run the failure is at the entry that names the context, with the verified prefix before it. In an integrity run the entry is not judged by its context, and the retained file is still reported `malformed`, so the run fails with a report.

Witness: `declared-obligations.test.ts`, "a retained context that verify reads by shape is malformed when that shape is wrong, in a report and not a throw", four cases, each paired with the same log unchanged, which verifies in both modes. Control, by hand, with the decoder as it was at `342d67c3`: all four fail. The `null` item throws the `TypeError`. The other three (a `changed` that is not a list, a renamed path with no `from`, a land input whose obligations hold `null`) did not throw before: a full run refused them as `context-mismatch`, and they are now `malformed`. With the repair all four pass, and the other 301 log tests pass unchanged, which shows the fixtures' own contexts have these shapes. This is a check of the fields verify reads, not a complete schema for retained contexts. The logs are signed synthetic logs; they do not show that a real Room would record such a context.

**The argument that needs its own review.** [notes/2026-10-03-carry-accounting.md](../notes/2026-10-03-carry-accounting.md), "What an omission can do" (2026-10-03), argues that a removed judgment which did not carry cannot admit a landing that should not be admitted. That is an argument from the source, not something a test shows, and stage 2's approval does not establish it. The verifier's output does not rely on it and does not repeat it: it says only what verify checks and what it does not.

**Still owed, in full, under `1e8fee4b` / `3af8ebc7`.** Complete carry accounting: every pass and every judgment the Room owed, missing, extra and substituted, with all ten acceptance cases of the carry-pass amendment and the planner's points A to F. The planner accepted draft 3 of the amendment as amended by `plans/015-2026-10-04-carry-pass-draft3-decision.md` (report `7634a884`, ratified `6693d748`); that complete copy governs when it is built. The Room's side, with the `prepared` event, is stage 4's (`48c021ea`). Stage 6 keeps the derivation of lane, lease and landing transitions.

**Gates.** The review request gives the gate's result at the head sent.

## Bearer sessions end with their grantor (request 5d41ea36)

Status on 2026-10-04: approved. Review `65df0958` approved the head `87cd5804` (ratified). All of it is on the integration branch `request/test-overhead`; nothing has landed on main. The line below is the earlier status, kept as history.

Earlier status: implemented, pending review. Gitseq request `5d41ea36` (builder's own, found while reducing the Room's tests), on `request/test-overhead`. The MCP core's review (`bc0d7f6b`) asked for it to be completed.

**The rule (condition 1).** The room judges a token the same way for a read, an act and a request. A session ends when its token is unknown or expired, its session key is revoked, its delegation is revoked or expired, the key of the delegation's grantor is revoked for any reason, or its member is no longer active. After that, an exact retry of an act the session made earlier is `unauthenticated`: the room signs nothing for the session, so there is no envelope to replay. A signed envelope that someone kept is not a session matter: submitted as its own bytes, it gets its record (R-IDEM-2). A change of the member's role, or of what the delegation's kinds mean, does not end the session; it is judged when a new act is admitted. R-CRED-10 in [docs/protocol.md](../docs/protocol.md) now says this. That sentence is contract text, so it is for the planner to accept.

**What was wrong.** `judgeBearer` in `packages/room/src/requests.ts` checked the token, the delegation and the session key. It did not check the grantor's key or the member's state, which the read path (`authenticateHash`) checks. After a member's room-held key was retired, the session's reads answered `unauthenticated` while `bearerAct` still returned the original record for an exact retry. Nothing new could be recorded.

**The change.** `judgeBearer` calls `authenticateHash`: one judgment. No other source changed.

**One existing test changed.** `review-aabda1ed.cases.ts`, "response-loss recovery ...", made a new act with a stranded session after its member key was retired, and expected the refusal `delegation-invalid` from admission. The session has ended by then, so the answer is now `unauthenticated`, before anything is signed. The test says so.

**Witness.** `packages/room/test/workerd/worker.test.ts`, against a real Room: "a bearer session ends with its grantor ...". The grantor's key is revoked as `retired`, so that the delegation itself stays unrevoked and only the grantor's revocation can end the session; a `compromised` revocation revokes the delegation too and would hide the omission. Then the MCP list, an exact retry and a workspace request are all `unauthenticated`, nothing is recorded, and the first act's signed envelope, taken from the log and submitted, returns the first record. A second session whose member is removed gets the same answer.

**Control.** One, with `scripts/control.mjs`: the old three checks in place of the one judgment. The test fails by its assertion ("expected a failure, got" the first record). Distinguishes.

## Test overhead (request ecbc722a)

Status on 2026-10-04: approved. Review `b1738122` approved the head `f6212850` (ratified). All of it is on the integration branch `request/test-overhead`; nothing has landed on main. The line below is the earlier status, kept as history.

Earlier status: implemented, pending review. Gitseq request `ecbc722a` (planner to builder, relaying the project owner's new highest priority), promise `1c6bf45c`. Branch `request/test-overhead`. Nothing was pushed or deployed.

The request: cut Artroom's test overhead at least ten times. Remove every test that does not prove a useful invariant, make the expensive useful tests cheap, measure before and after, and stop the exhaustive mutation sweeps.

**What the head is.** The work could not start from main, because the cost was in the lanes under review. So the branch first composes them: declared acts stage 2 (`35797f84`), stage 3 (`5449d19c`), stage 5 (`db73dddc`) and the MCP core runtime (`729fb330`), merged at `a1990c94`. Only this file conflicted. That composed head is the baseline. None of those lanes is reviewed or landed, and this request does not review them: their functional outcomes and their open findings stay owed under their own requests.

### The result

The target is judged by two figures, elapsed pipeline time and aggregate process CPU, for the complete gate and for one edit taken to review. That is the request's criterion 3 as amended by `da68c9a9` and ratified by `67d58f37`: the amendment withdraws the demand for observed worker lifetimes, which the planner's wording had added, and keeps both ten-times targets.

| Judged against the target | Before | After | Times less |
|---|---|---|---|
| Complete gate, elapsed | 410.4 s (sum of the old gate's steps) | 33.9 s (one observed gate) | 12.1 |
| Complete gate, CPU | 830.1 s | 78.0 s | 10.6 |
| The same, both sides as sums of separately timed steps: elapsed | 410.4 s | 40.7 s | 10.1 |
| The same: CPU | 830.1 s | 87.0 s | **9.5, short of ten** |
| One edit taken to review, elapsed | 925.7 s (reconstructed) | 41.3 s | 22 |
| One edit taken to review, CPU | 2,092 s (reconstructed) | 98.0 s | 21 |

The one shortfall is CPU when both sides are sums of separately timed steps: 9.5. The gate as it is actually run is one command with one root vitest process, and against the old pipeline it is 10.6 times less CPU. Both figures are given so that the reader can choose; the limits of each are listed below the next table.

Five kinds of figure appear in this section. They answer different questions and are kept apart:

- **Elapsed**: how long a person waits.
- **CPU**: user and system seconds, summed over every process a step started.
- **Single-worker suite time**: the elapsed time of each suite's command when it is given one worker and runs one file at a time. This is the nearest observation of what the test workers cost when nothing runs side by side. It is the whole command, so it includes the runner's own start and, in workerd, the pool and the runtime. It is not an observed worker lifetime, and it is not how the gate normally runs.
- **Printed worker subtotal**: vitest's own totals of import, test, setup and environment time over all test files in the normal parallel run, plus the git runner's duration. It leaves out the rest of a worker's life, and parallel load inflates it. The ui package's vitest prints shares, not seconds, so its part is its summed test-file time (2.7 s before, 0.9 s after).
- **Summed test-file time**: the test durations in vitest's reports. It leaves out imports and setup.

The steps were timed with [scripts/measure-tests.sh](../scripts/measure-tests.sh), each one alone under `/usr/bin/time`, one after another. One 18-core machine, shared with other sessions: the one-minute load was 5 to 18 during the baseline and 6 to 18 during the after run. `node_modules` was already installed both times.

| The complete gate | Elapsed | CPU | Printed worker subtotal | Summed test-file time | Tests run |
|---|---|---|---|---|---|
| Before, at `a1990c94`: the sum of 17 steps (`npm ci`, typecheck, each suite) | 410.4 s | 830.1 s | 990.8 s | 787 s | 4,339 |
| After, at `641ebb43`: the sum of the same steps, 16 now | 40.7 s | 87.0 s | 51.4 s | 37 s | 2,000 |
| After, at `a31d84ba`: one whole gate, observed (`npm run gate -- --ci`) | 33.9 s | 78.0 s | 49.1 s | | 2,000 |
| After, at `a31d84ba`: one whole gate with no install, observed (`npm run gate`) | 29.3 s | 70.6 s | | | 2,000 |

By the same method on both sides, the sum of steps, the gate costs 10.1 times less elapsed time and 9.5 times less CPU. The printed worker subtotal is 19.3 times less and the summed test-file time 21 times less. One whole gate as it is now run is 12.1 times less elapsed and 10.6 times less CPU than the baseline sum. The tests alone went from 391.6 s and 791.4 CPU seconds to 29.8 s and 63.7: 13.2 and 12.4 times.

**Every suite with one worker, as a serial comparison.** `scripts/measure-tests.sh <dir> --serial` ran every suite with one worker, one file at a time, at both heads. The one-minute load was 3 to 17 during the baseline run and 3 during the after run.

| Every suite, one worker each | Sum of the suites' elapsed time | CPU |
|---|---|---|
| Before, at `a1990c94`, 15 suites | 742.2 s | 691.2 s |
| After, at `64a379c2`, 14 suites | 59.7 s | 64.8 s |

That is 12.4 times less. The largest parts before were the log package in workerd (299.2 s) and in Node (115.1 s), the git package (71.2 s), the Room's two workerd runs (68.0 s and 60.8 s) and the CLI (51.5 s). The largest part after is the Room's workerd run, 26.6 s: with one worker, one isolate makes every room, and the pool's nested proxies (see "Found on the way") cost most there. With the gate's four workers the same run takes 6 s.

What these comparisons are, and are not:

- **The baseline is a sum of steps, not one observed run.** The old gate was `npm ci`, the typecheck and `npm test --workspaces`, which ran these same suites one after another, so the sum is close to what a person waited. No single uninterrupted baseline gate was timed.
- **The like-for-like row is the second.** It is also a sum of steps, each started with a warm file cache from the step before.
- **The last two rows are single observed runs** of the gate command, under `/usr/bin/time`. They include the one-process root run, which the baseline could not have. The fourth was taken during the edit cycle below, with a one-minute load of 19.
- **No worker lifetime was measured, and none is claimed.** The single-worker figure is the elapsed time of whole commands in a configuration the gate does not use. The printed subtotal covers only the phases vitest prints. Under the amendment neither decides the target; they show where the time is.
- **CPU is the weakest ratio**, 9.5 by the sum of steps and 10.6 for the observed gate. The typecheck and the install are unchanged (about 23 CPU seconds together) and are now more than a quarter of the gate.

By step, elapsed seconds, CPU seconds and tests run:

| Step | Before: elapsed | CPU | tests | After: elapsed | CPU | tests | Times less: elapsed | CPU |
|---|---|---|---|---|---|---|---|---|
| `checkers` | 36.5 | 33.8 | 48 | 2.6 | 2.2 | 35 | 14.2 | 15.2 |
| `cli` | 8.8 | 21.8 | 201 | 1.5 | 3.7 | 132 | 5.8 | 6.0 |
| `client-node` | 6.7 | 4.5 | 144 | 0.8 | 1.3 | 99 | 8.2 | 3.6 |
| `client-workerd` | 1.0 | 1.2 | 2 | 1.0 | 1.2 | 2 | 1.0 | 1.0 |
| `git` | 72.3 | 56.5 | 340 | 5.3 | 4.0 | 308 | 13.6 | 13.9 |
| `log-node` | 32.0 | 137.2 | 369 | 2.1 | 15.2 | 267 | 15.0 | 9.1 |
| `log-workerd` | 194.2 | 328.1 | 362 | 1.4 | 1.7 | 12 | 140.7 | 191.9 |
| `mcp-node` | 2.5 | 4.0 | 149 | 1.1 | 1.6 | 103 | 2.2 | 2.5 |
| `mcp-workerd` | 1.4 | 2.1 | 5 | removed | removed | 0 | | |
| `policy-node` | 1.0 | 4.7 | 355 | 0.8 | 1.9 | 209 | 1.2 | 2.5 |
| `policy-workerd` | 2.4 | 5.7 | 353 | 1.5 | 2.4 | 48 | 1.6 | 2.3 |
| `room-node` | 1.7 | 8.4 | 403 | 1.0 | 2.6 | 165 | 1.7 | 3.3 |
| `room-workerd` | 15.6 | 90.9 | 819 | 6.3 | 19.7 | 410 | 2.5 | 4.6 |
| `room-declared` | 13.9 | 80.3 | 540 | 3.0 | 3.5 | 33 | 4.7 | 22.7 |
| `ui` | 1.6 | 12.2 | 249 | 1.2 | 2.8 | 177 | 1.3 | 4.4 |
| **all test steps** | **391.6** | **791.4** | **4339** | **29.8** | **63.7** | **2000** | **13.2** | **12.4** |
| `npm run typecheck` | 6.5 | 14.2 | | 6.2 | 13.4 | | 1.0 | 1.1 |
| `npm ci` | 12.2 | 24.5 | | 4.6 | 9.9 | | | |

`npm ci` is the same command both times; its two figures differ only by the machine's load and cache.

The Room's workerd step was timed again at `a31d84ba`, after a review correction removed a workaround from its harness (see "Review corrections" below): 6.1 s and 6.5 s elapsed, 19.3 and 20.1 CPU seconds, against 5.9 and 6.1 s, 18.4 and 18.5, with the workaround.

**One edit, taken to review.** The same place both ways: the two guards of the refusal-text bound in `packages/room/src/declared.ts`. In the after run the edit itself changes only the comment beside each guard, so that the affected tests are selected and pass. The faults are the two controls that follow, each of which breaks one guard and restores it.

| | Elapsed | CPU |
|---|---|---|
| Before, as stage 2 was run: put together from measured parts | 925.7 s | 2,092 s |
| After, measured at `a31d84ba` | 41.3 s | 98.0 s |

That is 22 times less elapsed time and 21 times less CPU.

The before figure is a reconstruction, not one continuous run. Its parts were each measured: one mutant per guard under the old runner, with the root typecheck and five test sets for each (104.9 s, 432.0 CPU seconds for the two), and the baseline gate counted twice (410.4 s, 830.1 CPU seconds each), because the old practice ran the gate at the code head and again at the report head.

The after figure is the sum of four commands, run one after another with the edit in place. The one-minute load was 19.

| Command | Result | Elapsed | CPU |
|---|---|---|---|
| `npm run test:changed` | root run: 12 files, 457 tests passed; git and ui not affected | 9.3 s | 24.1 s |
| `node scripts/control.mjs packages/room/src/declared.ts 'return clipBytes(text, WORDING_FILLED_BYTES);' 'return text;' --expect 'refusal wording' -- packages/room --config vitest.node.config.ts test/node/declared-equivalence.test.ts` | distinguishes: 14 pass before; the named test fails by its assertion | 1.4 s | 1.7 s |
| the same, with `'if (bytes > max) break;'` changed to `'if (bytes > max + 1) break;'` | distinguishes, by the same test | 1.4 s | 1.7 s |
| `npm run gate` | passed: 2,000 tests | 29.3 s | 70.6 s |

The single-worker comparison for the edit cycle is known only in part. After, with one worker: the affected tests took 28.8 s (`npx vitest run --changed --maxWorkers=1 --no-file-parallelism`, the same 12 files), the two controls 1.4 s each, and the gate's suites 59.7 s: 91.3 s. Before, the two gates' suites alone are 1,484 s with one worker. The two mutants' test sets were not run with one worker, so the before figure is a lower bound and the ratio, 16 times, is "at least".

The comparison understates what stage 2 really cost: over one day its review loop ran 1,799 mutant runs, 24 hours of runner time, and six root gates, and the inventory was still not complete when the run was stopped.

### Where the time was, and what changed

- **The log package was 59 percent of all CPU.** Four test files, each run in Node and again in workerd, built logs at real limits: 20 MiB files, a search over 1.3 million digests, a 64 MiB staging case. The layout rules are now shown at small limits set for the test, with the 8 MiB segment bound and the 4,096-entry directory bound still shown at real size. workerd runs one file, which pins a log's commit IDs for both runtimes.
- **The git package** started about 4,930 git processes and ran its files one at a time. Test repositories are now written as files, the landing engine runs on a repository in memory that is compared with real git by one script, and waits are bounded at 10 to 40 ms.
- **The checkers** ran a real `npm ci` and `npm test` 30 times and built a git fixture per test. Those run once; what the service decides, signs and sends is tested against a container in memory, with the provider, gateway and checkout still real.
- **The Room's suite ran twice**, once as written and once under the `v2` declarations. The second run is now a witness set in one file: 32 chosen tests and one test of the run itself. The other files share isolates, so the Worker is loaded once per worker and not once per file, and 52 files became 11.
- **Real waits are gone**: the client's backoff (6 s), the CLI's dropped-reply cases (1.4 s each), a 2 s ledger timeout, lock tests with waits of up to 3 s. Each now uses an injected delay, a gate or the test clock.
- **Policy** ran its whole suite in two runtimes; workerd now runs the three files that are about the runtime.
- **One process.** `npm test` at the root is one vitest run with a project per package and runtime, where there were fifteen runs.

### What was removed

2,339 of 4,339 run tests are gone, and 2,000 remain. No test was removed for being slow. The reasons, by group, are in [test-invariants.md](test-invariants.md), with the witness that still protects each invariant. In broad terms:

- **The same thing twice:** the log and policy suites in a second runtime (about 660 tests); the Room's whole suite under a second vocabulary (507).
- **One test per condition:** the tests written in the last days of stage 2 so that every mutant of every guard had a red test (about 300 in the Room, 146 in policy), merged into the tests of each invariant.
- **Tests of test code:** the stand-in rooms of the UI and the client, the checkers' room stand-in.
- **Tests of other programs:** git's and npm's own behaviour.
- **Review-by-review repeats:** files added one finding at a time that pinned the same rule again; each of the 36 defects repaired in stage 2 keeps one witness.

About 260 kept witnesses were checked by breaking the source by hand, one change at a time, and seeing the named test fail by its assertion. About ten did not distinguish. Two were repaired, one assertion that claimed more than it tested was removed, and the rest are listed in the map as known gaps.

### How to work now

[docs/testing.md](../docs/testing.md) is the guidance, and `AGENTS.md` points to it. In short: name the invariant; test it at the cheapest boundary that can show it; run `npm run test:changed` while working; run `npm run gate` once at the head sent for review; show that a new witness distinguishes with `scripts/control.mjs`, one change at a time. There is no mutation sweep.

- **`npm run test:changed`** covers the three test runners. The root vitest run picks the test files that import a changed file. The git and ui packages each run whole when a changed file is in the package or in a package it depends on. Its last lines say which ran.
- **`scripts/control.mjs`** runs the tests unchanged first, which must pass, then with the one change. It answers "distinguishes" only when a test failed by an assertion. A run that did not start, did not compile, timed out or failed only by a thrown error is "inconclusive", with its own exit code, and is not evidence.
- **`npm run gate`** checks whitespace, typechecks every workspace and runs every test. The UI build (`vite build`) and the browser suite (`npm run e2e` in `packages/ui`, one file) were not part of the gate before this work and are not part of it now. Neither was changed, and neither is in any figure above.

### Earlier demands that this request replaces

The request says to reconcile the earlier blanket demands and record them as superseded, not as met.

| Earlier demand | Where | Now |
|---|---|---|
| The Room's whole suite passes unchanged against the legacy vocabulary and again against the `v2` declarations, with every converted test listed one by one | stage 2, condition 3; protocol section 33.6 | Superseded. The declared witness set runs 32 chosen tests under `v2`, and one more test checks that each of the four conversions was applied. 507 tests no longer run under `v2`. Section 33.6 says so. `plans/declared-stage2-conversions.md` is removed |
| A mutation of each declaration field and each new guard turns a test red | stage 2, condition 4; taken up for stages 3 and 5 and the MCP core | Superseded, not met. The stage 2 run of 594 mutants was stopped at 199, and its output is kept as partial. The stage 3 and stage 5 audits (502 and 375 guards with no mutant) are kept as lists of where to look, not as work owed. The MCP run stopped at 39 of 76 |
| Every repaired reviewer finding keeps its test | all lanes | Kept, as one witness per finding |
| Root gates at the exact head, and again at the report head | all lanes | The gate runs once, at the head sent. A commit that changes only documents carries the tree hashes instead |
| The live row-write measurement on the provider | request `92ddf4cc` | Unchanged, still owed |

The stage 2, 3, 5 and MCP sections above were written before this request. They name test files, counts and mutation tables that this work merged or removed, and those parts are superseded by this section; [test-invariants.md](test-invariants.md) is the current map.

### Seams added to source

None changes behaviour: `ClientOptions.backoff` (client); `Io.retries`, `Io.stdio` and `gitCommand.run` (CLI); a re-export of `StdioServerTransport` (MCP); `setLayoutLimitsForTests` (log); and the body of `ArtifactsGateway.fetch` moved, unchanged, to `gatewayFetch` (git).

### Found on the way

- **A minor defect, not fixed here:** `judgeBearer` in the Room does not check the grantor key's revocation as the read path does. After a room-held key is retired, a bearer's exact retry still returns the original record, while reads answer `unauthenticated`. Nothing is recorded. It has its own request, `5d41ea36`.
- **A tool defect, not worked around:** `@cloudflare/vitest-pool-workers` 0.22.0 nests one more proxy on its wrapper class for each Durable Object an isolate constructs, so a room cost 9 ms at first and 64 ms after 450 rooms in one isolate. With four workers no isolate makes that many, and the cost is under half a second for the suite.
- **Tests that did not test:** the client's watch close-during-backoff test and session-token redaction test passed with the source broken; both are repaired. The mint-site scan missed a computed key under a type assertion; fixed in the test. One existing Room test (R-ADM-6) failed now and then under load because it slept 20 ms; it now waits for the policy call.

### What this does not show

- **The figures are from one shared machine.** Elapsed time moved up to twofold from minute to minute with other sessions' load. CPU time is steadier, and the paired runs in each package's notes agree with the table. A quiet machine would give smaller numbers on both sides.
- **Not every step fell ten times.** The Room's first run is 2.5 times less elapsed and 4.6 times less CPU, the CLI about 6 times, the client, policy, UI and MCP 2 to 4 times. Their floor is the cost of starting a vitest run (0.5 to 1 s each) and, in the Room, real Durable Objects: about 9 ms a room and 2.4 ms an admitted act, 30 ms a test. The gate as a whole passes ten times because the two largest costs fell 14 to 190 times.
- **The second-vocabulary run is much smaller.** A fault that only shows when some other legacy test runs under `v2` would no longer be caught by the suite. The direct tests of what `v2` changes are the protection.
- **The removed tests were judged, not proved, redundant.** Each removal has a reason and a surviving witness in the map, and a sample of witnesses was checked by breaking the source. The checker's focused counterexamples are the independent test of that judgement.
- **The lanes are not reviewed.** A green gate here says the composed head passes its reduced suite. It does not approve stage 2, 3 or 5 or the MCP core.
- **The browser suite** (`packages/ui/e2e`) is outside the gate, as before, and was not changed.

### Review corrections

The checker read the work before it was sent for review and recorded preliminary findings (`259df8d7`, at `0608e2e8`). Each is corrected at `a31d84ba`:

| Finding | Correction |
|---|---|
| The Room's test harness replaced the global `Proxy` to flatten the pool's nested wrappers, matching by the handler's source text. The checker showed an ordinary nested proxy whose result this changes | The workaround is removed. It saved under half a second. The harness now changes nothing in the runtime |
| `npm run test:changed` ran only the root vitest run, which leaves out git and ui | It now runs all three runners, and says which ran ([scripts/test-changed.mjs](../scripts/test-changed.mjs)) |
| `scripts/control.mjs` counted a run that never started, or failed to load, as a distinguishing control | It needs a passing run first, and separates "distinguishes", "survives" and "inconclusive". Tried on twelve cases, among them a missing directory, a missing configuration, a change that does not compile, a thrown error and a test file that does not exist: each is inconclusive |
| The 33.8 s gate figure was a sum of separately measured parts, and the edit-cycle "before" was a reconstruction, neither labelled | The table now separates sums of steps from observed runs, and the edit cycle states its parts |
| CPU and summed test-file time do not show worker time | Worker time is its own column |
| The map's known gaps still called the whole `v2` suite a criterion | The line now says the demand is superseded, and what gap remains |
| The measurement script ended with "done" whatever happened | It names failed steps and fails |

The checker then reviewed `15680192` and asked for changes (`3965e230`, with the checks in `0d7ccc8f`). Each is corrected at `64a379c2`:

| Finding | Correction |
|---|---|
| `scripts/control.mjs` answered "survives" when every test was skipped after the change | A run with fewer tests than the passing run before it is inconclusive |
| It answered "distinguishes" when one test failed by an assertion and another timed out | Any timeout makes the run inconclusive. The assertion is still printed, as partial evidence |
| `npm run test:changed` selected no root test for a change to the lock file or a root `tsconfig`, and reported the root run as passed | A root file now runs every test of all three runners |
| A new file with a name git quotes was not matched to its package, and vitest could not read it | Names are read from git with `-z`. Such a name runs the whole root vitest run; git and ui are still chosen by where the file is, and now match it |
| The worker figure was a subtotal of printed phases, presented as worker time | It is named a subtotal. A single-worker run of every suite at both heads is added as a serial comparison, not as worker time. The amendment `da68c9a9` then set the target on elapsed time and CPU, and the result is stated against it |
| The edit cycle's edit is comment text; its faults are the controls | Stated |

### After the approval: acceptance cases restored

The checker approved this work at `f6212850` (review `b1738122`). While preparing stage 2 for its own review I then compared every acceptance case of the protocol (sections 23, 29.6, 30.7 and 33.5) with the test code, which the reduction had not done case by case. The reduction had removed or weakened the witnesses of fifteen parts of those cases. All were present before it. This is a defect of the approved head, and the approval does not cover its repair.

Each part is restored, in the smallest form that shows it, in the head that carries this subsection. The parts and their files are listed under the Room's known gaps in [test-invariants.md](test-invariants.md). In short: seven parts of stage 2 in the Room's declared-acts tests; two validator rows in policy; one generic-check case of stage 5; two log layout cases; two checker isolation cases; one client subscription case.

| Since `f6212850` | |
|---|---|
| Source | unchanged |
| Tests | 2,000 became 2,006. Thirteen files in the packages' test directories changed; no file was added |
| Test helpers | `expectRefusal`, `expectOk` and four like them now fail with `expect.fail`, so a failed result check is an assertion and the control helper can count it |
| Guidance | [docs/testing.md](../docs/testing.md) says that an acceptance case is an invariant, and that its witness is removed only with its replacement named |
| The gate, one observed run with no install | 28.4 s elapsed, 67.8 CPU seconds; it was 29.3 s and 70.6 before, so the cost did not move beyond the run-to-run spread |

Controls run on the restored witnesses, each by `scripts/control.mjs` with one change: the take-over overlap check in the Room (distinguishes); the three-step target rule in the policy validator (distinguishes); the recomputed-decision replay and the chunked-entry bound in the log (both distinguish); the checker gateway's repository check (distinguishes). The token checks of the two checker cases rest on the test's stand-in for Artifacts and on `packages/git`, and have no control in the checkers' source.

Some cases are still shown at a lower level than before the reduction, such as by the evaluator and not also through a Room. Those are kept as they are and listed in the same known gaps, so that a reviewer can judge them.

### Gates

Run with `npm run gate -- --ci` at `a31d84ba`: install exit 0; whitespace exit 0 (`git diff --check` against the base on main); typecheck exit 0, every workspace; test exit 0, 2,000 tests passed (1,515 in the root vitest run, with 69 more skipped where the witness set loads a file and runs only its chosen tests; 308 in git; 177 in ui); `git status` empty. After `a31d84ba` the source and tests are unchanged; later commits change three scripts, the guidance and this section. The gate was run again at that head, and the review request states the result.