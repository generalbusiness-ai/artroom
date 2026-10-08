# I5: issues from the command line, the change that closes one, and verify --all

Branch `claude/issue-edit-page-commands-65qhn7` (the brief's
`i5-edit-page`; this session may push only under the `claude/` name), from
`origin/planner/i5-demo-host` at `13ae305`. Written 2026-10-08 by a builder
working alone in a cloud container, with no workroom, no deployment
credentials and no network beyond GitHub and the npm registry. Plan 019's
GitHub-shaped story for the middle of the demo script
(`notes/2026-10-07-demo-script-draft.md` on `origin/main`, shots 8 to 12).
Nothing here is deployed. No gitseq request was filed: this container has
no workroom.

The brief also carried the task "edit a page". At `13ae305` that task is
already delivered and merged (`notes/2026-10-07-i5-edit-page-delivery.md`),
so this branch builds on it and does not redo it.

Each claim is labelled: **[code]** read from code, **[run]** confirmed by a
run in this container, **[inferred]** inferred and not run.

## 1. What is built

**A. The commands** (`packages/cli/src/commands.ts`, `line.ts`) **[code]**.
No act was invented: each command signs an act that the directory or a
lane of the demo profile already has.

| Command | Signs |
|---|---|
| `artroom issue open --title <t> [--body <b>]` | The directory's `open-issue`, under the issue definition that the rules scope holds active, with its bytes beside the act; then waits for the lane. The body is a detached text. The title is also the issue's one condition (gap 1). |
| `artroom issue comment <issue> <text>` | The issue lane's `comment`. |
| `artroom issue assign <issue> <@member>` | The lane's `assign`, with that one member as the assignee. |
| `artroom issue close <issue>` | `close-own` when the caller opened the issue, `close-any` otherwise; the reason is `completed`. |
| `artroom issues` | Nothing: it reads the directory's rows of kind `issue`, then each issue's own lane, and prints number, state, close reason, title, assignees and lane. |
| `artroom edit ... --closes <issue>`, `artroom merge <change> --closes <issue>` | The change lane's `link-own` (`how` = `keyword`) before the merge. On a published merge the lane's existing `closes` update closes the issue. |
| `artroom verify --all` | Nothing: it replays the register and every scope that the directory's creations reach, one line each, and prints `All consistent: <n> scopes.` or the first finding. |

An issue is named by its number (`3` or `#3`) or its lane's scope ID. A
lane whose creation is refused now ends the wait at once with a line that
says so, for `issue open` and `edit`, where it used to wait 120 reads.
`verify` (one scope and `--all`) now carries the code of the two lane
capabilities, so it replays lanes; for this the command line depends on the
derive package (`package.json` and the lock file changed) **[code]**.

**B. The test**, `packages/lanes/test/issues.scope.test.ts`. It lives with
the lanes and not beside `story.scope.test.ts` in the cli package, because
it needs the demo profile's definitions and no other package may name the
lanes package (the gate's layering script), as for the edit test **[code]**.

Title: "an issue opened by a member, commented on by another and assigned
by the admin; a member's edit with --closes is linked and waits for a
merger, the admin's merge publishes it and closes the issue; merge --closes
links a waiting change the same way; a member who did not open an issue
and holds no issue.triage is refused close and assign by name, with nothing
written; issues lists both closed; verify --all prints one line for each
scope of the room and all consistent". Passed alone **[run]**. It shows:

- before the issue definition is active, `issue open` signs nothing;
- una, a member, opens issue #1 with a body: the lane runs the demo
  digest, holds the body's digest, and una is its requester;
- paul, a member, comments; the comment's author is paul;
- una's `issue assign` is `Refused: unauthorized ... Nothing was written.`
  and the lane's head does not move; rita's assign takes effect;
- paul's `issue close 2` on una's second issue is `Refused: unauthorized`,
  nothing written, the issue open;
- `edit --closes 9` (no such issue) is refused before anything is signed:
  the directory's head does not move;
- una's `edit guide/start.md --closes 1` prints `Proposed`, `Linked`, then
  `Refused: unauthorized` for her merge and that the change waits; the
  branch and the issue do not move;
- rita's `merge` publishes the commit, and the issue closes `completed` in
  exactly one entry, a delivery; the assignee stays;
- una's `merge <change> --closes #2` links a waiting change and is refused
  again; rita's merge publishes it and closes issue 2;
- the directory's row for issue 1 still says `open` (section 3);
- `issues` lists `#1  closed (completed) ...; assigned to @una; lane ...`,
  `#2  closed (completed) ...` and `2 issues, 0 open.`;
- `verify --all` prints twelve lines, register, directory, membership,
  rules, destination, four lanes and three inboxes, each `consistent`, and
  `All consistent: 12 scopes.`

Controls, each a change to `commands.ts` made by hand, the test run, and
the file restored; each made the test fail **[run]**:

| Control | Failed with |
|---|---|
| `issue close` always signs `close-own` | paul's refusal reads `guard-failed`, not `unauthorized` |
| `edit` skips the link | the issue stays open after the merge |
| `issues` reads the state from the directory's row | the listing says `open` |
| `verify` without the capability code | `verify --all` exits 1 |

The neighbouring tests pass with the change: `packages/cli/test`
(`story`, `claim`, `clone`) and `packages/lanes/test` (`story`, `edit`)
**[run]**.

**The refusal the brief names.** At `13ae305` `story.scope.test.ts`
already passes: the edit-page delivery settled it (its note, section 6:
both answers are right for their inputs, and the test now sends the bytes
with `--value`). I changed nothing there **[run]**.

**C.** `docs/cli.md`: `issue`, `issues`, `--closes`, `verify --all`, and
two limits; `docs/testing.md`: one sentence for the new scenario.

## 2. The live procedure

On the deployment, from a checkout of this branch, with a room claimed and
a member joined (`docs/cli.md`), as for the edit-page note's section 2:

1. As the admin, publish the rules with no approval for `source`, and
   activate `change-demo` (the edit-page note, steps 1 and 2).
2. Activate the demo issue definition:
   `artroom act activate --on rules --set digest=sha256:82a938c8f54ddcac7974ca688ebea7d51c35d2aa70f4e3729965e9f915bc464e --set name=issue --value packages/lanes/definitions/issue-demo.json`.
3. As the member: `artroom issue open --title "The handbook has no start page" --body "..."`.
   Expect `Opened issue #<n>: ... Its lane is sc_....`
4. As another member: `artroom issue comment <n> "I looked for one too."`;
   expect `Commented: entry ...`.
5. As the admin: `artroom issue assign <n> @<member>`; expect `Assigned: ...`.
   As a member who did not open it: `artroom issue close <n>`; expect
   `Refused: unauthorized, ... Nothing was written.`
6. As the member: `artroom edit guide/start.md --file start.md --closes <n>`.
   Expect `Proposed ...`, `Linked: ...`, `Refused: unauthorized ...` and
   `The change ... waits ...`. As the admin, `artroom merge <change>`:
   expect `Published: commit ...` and the page's address.
7. `artroom issues`: the issue `closed (completed)`.
8. `artroom verify --all`: one line for each scope and the last line.
   Record the lines for shot 12.

A running deployment needs no new Worker for this branch: no scope, route
or platform data changed; only the command line did **[code]**.

## 3. Stand-ins and limits

- **The Git host** in the test is `OwnGit` of
  `packages/scope/test/hosts.ts`, under the production wiring of the
  hosting's own Git service. GitHub's provider is not run here; the
  edit test runs the same publication on both **[code]**.
- **The scheduler** is the test's `pause`, as in the other stories **[code]**.
- **The directory's index does not follow a merge's close.** The issue
  lane's `closes` handler has `sends: []`, so the directory's row keeps
  `state: open` after the merge closes the issue **[run]**. `issues` reads
  each lane, one read per issue, which is slow for a room with many
  issues **[inferred]**.
- **Members cannot merge.** `merge` needs `change.merge`, which only
  admins and maintainers hold (`packages/platform/src/membership.ts`,
  role lists) **[code]**. So "a member's edit with --closes merges and
  publishes" happens as two acts: the member's edit links and waits, and
  an admin's merge publishes and closes **[run]**. Shot 8 of the demo
  script has `@una` merge; as a member that is refused `unauthorized`.
- **Close rules.** The demo profile reserves a close to the opener
  (`close-own`, guard `signer: requester`) or a holder of `issue.triage`
  (`close-any`). It has no rule for an assignee **[code]**.
- **Assign replaces.** `assign` sets the `assignees` list; the command
  gives one member, so it replaces any earlier assignee **[code]**.
- **verify --all** follows creations from the directory's history on. A
  creation that its target refused is listed and reads as not found
  **[inferred; not run]**. The register's other creations are other
  rooms' and are not followed **[code]**.
- **The capability numbers are copied.** The command line builds
  `hold@1` with `tokensPerHold: TOKENS_FLOOR` and no root retention, the
  numbers of `HOLD_VERSION` in `packages/scope/src/ports.ts`. If the
  runtime's numbers change, the command's must change too **[code]**.
- **Lanes replayed consistent.** Shot 12 of the demo script expects the
  lanes and the destination `incomplete` after a change, for the
  ancestry walk that replay cannot derive. With one-file changes
  (`propose-file`), every scope replayed `consistent` **[run]**. A change
  proposed with `propose-manifest`, as in test W2, may still give
  `incomplete` **[inferred]**.

## 4. Gate

The command, at the root, with a clean checkout: `npm run gate`. Machine: a
cloud container with 4 CPUs; load average 0.39 before the final run and
1.08 after **[run]**.

The final run, at head `7e6e104e44cded8edea0f2515a0d6e1c0e8cdd13`, tree
`22e9dc07997d3a934129adcff59558659d7e691d`, **failed on two tests that this
branch does not change** **[run]**:

| Step | Exit | Elapsed seconds | CPU seconds |
|---|---|---:|---:|
| Install | skipped (the lock file was installed) | | |
| Whitespace | 0 | 0.0 | 0.0 |
| Typecheck | 0 | 10.6 | 34.0 |
| Tests (test runner) | 1 | 128.7 | 169.0 |

The test runner: 115 files, 804 tests, 802 passed, 2 failed; its own
duration 126.21 seconds; 147.58 user and 21.46 system CPU seconds. It also
printed two uncaught `EPIPE` errors from `packages/git/test/http.test.ts`,
whose tests passed. Because the test runner failed, the gate did not run
its last script; run alone, `node --test scripts/active-source.test.mjs`
gives 6 tests, 6 passed **[run]**.

The two failures **[run]**:

- **T36** of `packages/checkers/test/runner.test.ts`, which the brief
  foresaw for this container's Git.
- **T39** of `packages/scope/test/limits.test.ts` ("junk-signed joins ...
  and an admin's act from the limited address is admitted"): the head of
  its membership scope was entry 5 where the test had read entry 4 before
  its refused posts, so something was recorded in between. It failed in
  both gate runs on this branch (the first at `2440fe0`). It passed in
  every other run I made: alone three times; the `scope` project alone
  once at the base `13ae305` and once at `7e6e104`; after the issues
  scenario in one worker, five of six (one of two before the scenario
  settled its scopes at its end, four of four after); and the whole root test run once
  more at `7e6e104` with a print added to T39 to name the entry, where it
  did not move. I have not found what writes entry 5, nor whether this
  branch makes it more likely: the edit-page note reports T39 passing in
  its gate at `1920e05`, and I made no gate run at the base. A guess I
  tested and that did not hold: a background dispatch started by T39's
  own posts (a delay of 300 ms before its second read did not make it
  fail, three of three). The issues scenario now settles every scope of
  its room before it ends; that did not stop the second gate failure.

## 5. What is owed

1. **Gap: an issue's conditions.** The brief's `issue open` has no flag
   for conditions, and the lane refuses an issue with none. With
   `conditions: []` the directory took the act and the lane refused its
   creation; the directory recorded the result
   `{"clause":"refused", ..., "outcome":"refused","reason":{"code":"required-unset"}}`
   and its row keeps `"refs":{"scope":null}` **[run]**. The command gives
   the title as the one condition. The lane forms' owner decides whether
   an issue may have no condition, or the command gains a flag.
2. **The directory's index after a close by merge** (section 3). The lane
   forms' owner decides whether `closes` sends an index update.
3. **Members and `change.merge`** (section 3), against shot 8 of the demo
   script. The planner decides whether the demo's editor is a maintainer,
   or the room's rules give members `change.merge`.
4. **T39** fails in the full test run, not alone (section 4). Whoever
   gates this branch locally should run the gate; if T39 fails there too,
   it needs its cause found before landing, since it passed in the
   edit-page gate before this branch.
5. **T36** fails in this container's Git, untouched.

## 6. Decisions followed

- `issue open --title [--body]`, `issue comment`, `issue assign`,
  `issue close` and `issues`, each signing the issue lane's existing acts
  through the demo profile; no act invented **[run]**.
- `edit` and `merge` take `--closes <issue>`; the merge that publishes
  closes the issue as the lane scenario does: by the lane's `closes`
  update, in the issue's own delivery entry **[run]**.
- `verify --all` folds the register and every scope of the room and prints
  one line per scope (kind, scope, entry reached, result) and a last line,
  `All consistent: <n> scopes.` or the first finding **[run]**.
- A refusal writes nothing and is printed as the answer **[run]**.
- Plain English; no product named in documents but GitHub and "the
  hosting's own Git service"; nothing deployed.

## 7. Local T39 fixture diagnosis and repair

2026-10-08. Builder preparation under gitseq request
`0716158cb871b5380755b6d718f9084c82c11eaa`, incoming
`2c702757e414643ee29721e93bee39f2a74a819c`, own base
`13ae305505d910b23d44e524860dc788cbcc5a8f`. No runtime source changed in
that delivery. This follow-up changes only T39's fixture preparation and
this note. No gate, provider operation, deployment or landing was run.

**The reproduced fixture defect.** T39 seats the founder, which sends the
request creating the founder's inbox. It then admits `first-key` and an
invitation and takes its no-write baseline without settling that inbox and
membership. The inbox's real creation result is itself a membership entry,
even though it has no item effects. It can arrive after that baseline.
`ScopeObject.submit` schedules its dispatcher through `#sent` even when
JoinLimits refuses a request before semantic submission. The invariant
being measured therefore included an unrelated unfinished setup duty.

The first natural pair run, issues followed by limits in the same scope
project, passed all three tests. It did **not** reproduce the cloud failure.
To distinguish the fixture premise, temporary diagnostic preparation held
only the real inbox creation transport, took the original head at entry 4,
released transport and let the authoritative dispatchers settle the actual
request. The first release-only probe still passed because that unanswered
attempt's one-second retry was not due under the frozen scripted clock.
The completed control advanced that clock by two seconds, without a wall
sleep. T39 then failed its original exact head assertion, 4 to 5, while the
two forged joins still answered `bad-intent`, the next join was
`rate-limited`, and the invitation remained `invited`.

The control's extra entry was:

| Field | Captured value |
|---|---|
| Membership | `sc_khu2ak6ul6wmqpwoaxg737t2qeqroyhubl4a53236yylqjbvcrhq`, incarnation `in_hejvuwz6bhmkqt7rbk3xvvjfbm` |
| Entry | 5, hash `sha256:2692dad9f99ab029e528575a0db705bd482fd2b4c9b8deacdf3fde39bdfd3c52` |
| Time | `2099-01-01T00:00:02Z` |
| Input | `delivery`, message class `result`, outcome `applied`; answers membership seat entry 2, send 0 |
| Exact source | Inbox `sc_7oabkqtvenw3bwgooxy3ia5sksglgp4drc6ppbrqdrmgzxnzbwra`, incarnation `in_2m33sr6kzfcdxhx225pb2lwka4`, entry 0, hash `sha256:27b0074744bcd09e6636423391040b3400cf98033160a28e38ac09254671726f` |
| Effects/sends | No item effects; one inbox confirmation control |
| Outbox | Duty `2.0` acknowledged; result `{ clause: "applied", seq: 5 }`; `diagnosis: null`. Confirmation duty `5.0` also acknowledged |

These are a controlled run's IDs and bytes, not recovered cloud-failure
records. They prove that the existing fixture permits the reported extra
entry and that the limits refuse correctly in this ordering. They do not
prove which entry the cloud failure actually recorded or that every possible
full-pool interaction is settled. A cross-object RPC exception alone is no
diagnosis: namespace transport catches it and returns an unanswered attempt;
dispatcher diagnosis needs actual routing refusals. Pool abort/context
diagnostics must be distinguished from this sealed delivery result.

**Repair.** Before taking the baseline or posting the forged joins, call
`settle(scope, await scope.created(seat))`: membership and its exact founder
inbox finish their owed creation/result/confirmation through the existing
real delivery boundary. No count is allowed to drift, no runtime write is
suppressed, and all original refusal, invitation-state and exact-head
assertions remain unchanged. The same controlled ordering passed once the
baseline was taken after this settlement. The hold, clock advancement and
diagnostic logging were then removed.

Focused runs on the local macOS checkout with the locked dependencies:

| Run | Result | Vitest duration |
|---|---|---|
| Natural issues + limits, diagnostic logging only on unexpected movement | 3 passed, 2 files | 4.78 s |
| Held inbox, release with retry not yet due | 1 passed, 1 skipped | 1.07 s |
| Held inbox, retry due after scripted clock +2 s, original baseline | Exact-head assertion failed, 1 skipped | 1.03 s |
| Same controlled delivery, settlement before baseline | 1 passed, 1 skipped | 1.13 s |
| Final minimal repair, natural issues + limits, no temporary diagnostics | 3 passed, 2 files | 3.96 s |

The commands were the root Vitest scope project with only
`../lanes/test/issues.scope.test.ts test/limits.test.ts`, or only
`test/limits.test.ts -t "at a real membership"`. No whole suite was
repeated and no mutation sweep was run. Locked `npm ci --ignore-scripts`
changed no package or lock file. The gate and independent review of the
reconciled delivery remain owed, in the existing filing order after the
story page. If a later authorized gate still fails T39, capture its actual
extra input/source and outbox before attributing that failure to this cause.

## 8. Complete discovery before verify --all

2026-10-08, same request and preparation branch, after T39 repair
`332428fc937eb8c022f0704cf88e39e443b12d36`. Read-only intake found that
`roomScopes` stopped after 1,000 history pages even if its last reply named
another cursor. It returned the scopes found so far to `verifyAll`, which
could report `All consistent` without discovering later creations. The
runtime allows 100,000 entries and pages are bounded by bytes as well as
entry count, so 1,000 pages is not proof of complete history coverage.

The command now exits 1 with an explicit `Incomplete` discovery finding,
the exact scope and final next cursor. It never starts whole-room replay
from that partial discovery. No resume feature is claimed. The default
bound remains 1,000 pages per scope; `Context.historyPages` allows a caller
or test to choose a positive integer bound. Existing typed, signed reads,
scope identity handling and child discovery remain unchanged. No provider
or runtime policy changed. `docs/cli.md` now names this refusal.

Invariant: when room creation discovery reaches its page bound with a cursor
left, `verify --all` cannot report a whole-room result. The cheap witness is
`packages/cli/test/verify.test.ts`: the real command and typed signed-read
HTTP transport receive a stand-in service's summary and hand-made history
entries. No scope judged those entries. With small bounds of one and two
pages, it checks the exact refusal and final cursor, including following
the first cursor before reaching the second. This proves discovery coverage,
not scope admission, read authorization or history consistency.

One focused control replaced only `if (pages + 1 === pageLimit)` with
`if (false)`. The unchanged witness failed by its outcome assertion: the
command wrongly proceeded to replay the partial discovered set instead of
refusing discovery and retaining its final cursor. `scripts/control.mjs`
reported **DISTINGUISHES** and restored the source. The stand-in deliberately
offers no replay endpoint; this control demonstrates the wrong boundary
crossing, not a claim that this particular scripted history replays
consistent. There was no sweep or whole-suite repetition.

Validation: the new Node witness passed. CLI typecheck first found an
index-signature property access in the new test, corrected to bracket
access; the CLI source, Node-test and scope-test typechecks then passed.
After that correction one focused run of the Node witness and the existing
real issues journey passed both tests (4.13 s). That existing journey still
reports all twelve discovered room scopes consistent at the unchanged
default bound. No gate, provider operation, deployment or landing ran;
the reconciled delivery still owes its gate and independent review.
