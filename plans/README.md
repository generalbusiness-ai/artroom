# Credential cleanup handoffs

Focused read-only audit under gitseq request `c01205f5d967ccef69319549dd1734b3e108a8b0`, with promise `51ef2bd2a3829800872ccd25f072cbe28dc961f1`. Started at approved main `72d6abde5c6dfa993ac441884e8f966a903b932f`; reconciled to `bd520fb926f8161a722c6f1e23ae4aac29e41a66` after the separately reviewed A7 landing. That landing's tree equals approved head `84e25a78883e03f7accf1a18d66d8866eea94195`. The Git paths below are unchanged; Room founding line references were refreshed.

The improve skill supplied the handoff format. Four verified fixes were selected under the user's standing autonomous checker instruction. Priorities and effort estimates set review order only. They do not cut scope. Source code was not changed by this audit. These plans have not been implemented or approved for landing.

| Order | Plan | Impact | Effort | Fix risk | Confidence | Status |
|---|---|---|---|---|---|---|
| 1 | [001: Complete token inventories](001-complete-token-inventories.md) | Prevent premature workspace grants and writable “ready” snapshots under incomplete provider replies | M | MED | HIGH | DONE, pending review |
| 2 | [002: Unknown fork effects](002-retain-unknown-fork-effects.md) | Preserve late-create cleanup through foreign occupancy | M | LOW | HIGH | DONE, pending review |
| 3 | [003: Terminal publication cleanup](003-retry-terminal-publication-tokens.md) | Retry known credential revocation after a successful landing | M | MED | HIGH | TODO |
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
