# I5: the lanes wired to the real rules scope and destination, and the demo profile

Branch `request/i5-lane-wiring`, from `origin/main` at `9b753bf`. Written
2026-10-07 by a builder working alone in a cloud container, with no
workroom, no deployment credentials and no network beyond GitHub and the npm
registry. Plan 024, gate 2. Nothing here is deployed.

Each claim is labelled: **[code]** read from code, **[run]** confirmed by a
run in this container, **[inferred]** inferred and not run.

The design notes that the brief names (the lane forms note, the scope and
replay contract at revision 23, the authority note at revision 28) are not
in this repository's `main` **[run: `find`, `git log --all`]**. I worked from
the text that the source quotes from them: `packages/platform/src/destination.ts`
and `reservation.ts` quote authority revision 28, section 6.5, "`reserve`
names each selected report". The lane definitions' stamp is still
`LANE_FORMS = { revision: 14, commit: "4b3bf5da" }` **[code]**; the fourth
milestone note records revision 15 as the adopted follow-through. I did not
change the stamp, because no adopted revision states the rows I added
(section 6).

## 1. What is built

Every test named here passed in the gate run of section 5 **[run]**.

**A. The change lane sends `reports`.** `merge` takes a field `reports`, the
`report` entry of each report that the manifest selects, at most 32, and
sends it as the sixth field of `reserve` **[code]**. No operand maps a list,
so the merger names the entries and two guards, `reports-not-selected`, bind
them to the manifest's selections both ways; the destination checks order
and count again, exactly (`reportsBound`) **[code]**. Witnesses: T3
(`manifest.scope.test.ts`) refuses a list that leaves one out and one that
names a comment, and asserts the sent `reports` **[run]**; W1 sends a real
selected report and the destination reserves on its commit **[run]**.

To run against the real platform scopes the lane needed five more rows,
each marked "i5 wiring" in `packages/lanes/src/change.ts` **[code]**:

| Row | Why | Found by |
|---|---|---|
| `ask-rules`, a new act: a `tell` `rules-wanted` to the proposal's rules scope | The rules scope sends no update to a lane that did not ask (G11), and no act of the lane asked | Reading `rules-scope.ts` |
| The `rules` handler declares `labels`, `singleControllerException` and `extents`; `checks` becomes optional; the item `rules` keeps `extents` | The real `rules-update` carries them. The lane refused the real update, `bad-field` | Spike run |
| The item `rules`, slot `source`, accepts kind `rules-wanted` beside `publish` | The real update is sent from the entry that records `rules-wanted`. `bad-field` | Spike run |
| The `publication` handler declares `rules`, an integer | The destination's update states the rules revision. `bad-field` | Spike run |
| `review-verdict` takes an optional `extent`; the item `review` keeps it; the `verdicts` collect sends it | Revision 28, section 12.1.4a: a review counts for the one extent that it states | Reading `reservation.ts` |

The change lane digest changed; the pins test and `docs/lanes-reference.md`
were regenerated with `pin.mjs` and `reference.mjs` (section 4) **[run]**.

**One platform repair.** The rules scope's `activate` and the directory's
`open-issue` and `open-pr` read the definition's bytes "beside the intent",
but neither field stated a value place, and the runtime reads a value
beside an intent only at a stated place (`core.ts`, `placesOf`) **[code]**.
So under the deployed class no lane could be activated or created: both
acts answered `dependency-unavailable` **[run]**. Commit `c6fe198` states the
place, in the domain of a definition, on both fields. Three existing
expectations changed (section 6, gap 3). Control: removing the place from
`activate` fails W1 by its assertion, `DISTINGUISHES` **[run]**.

**B and C. The lanes against the real rules scope and destination.**
`packages/lanes/test/support/room.ts` founds a repository on real scopes in
the namespace `PLATFORM` as `founding-real` does; its real directory creates
lanes under digests that its real rules scope activated; every grant is
read from the real membership scope by the production authority **[code]**.
No scope's entry is written by hand and nothing is anchored **[code]**. The
lane holds the extents that the real rules scope sent (C), and a review
states the extent it counts for; the destination classifies the changed set
against the extents it observes **[run, W1]**.

| Test title (abridged) | Shows | Control that distinguishes |
|---|---|---|
| W1, a source-only change with one approving reviewer for the source extent ... the linked issue closes once | The real lane's merge, with a real selected report, reserved and published by the real destination; the lane records `published` and `merged`; one entry closes the issue, `completed` | Without an approval the lane refuses, `approvals-needed`, and the issue is open before publication **[run]** |
| W2, a mixed change touching the source and the rules extents ... every history then replays ... | `rules-not-met:rules` with the source approval alone; published after rita, who holds `rules.publish`, approves for `rules` | The first merge is the control; for replay, a tampered copy of the lane is a `mismatch` at the merge entry **[run]** |
| W3, a reviewer outside an extent counts for nothing there | Approvals for the wrong extent, or for none, leave `source` unmet: `rules-not-met:source` | The same reviewer's later approval for `source` publishes. Code control: count every stated extent as `source`, W3 fails, `DISTINGUISHES` **[run]** |
| W4, the single-controller exception | rita, the only holder of `rules.publish`, authors a rules change: refused until the rules declare the exception, then reserved with reason `single-controller:rules:@rita:...` | Not declared is refused. Code control: treat it as always declared, W4 fails, `DISTINGUISHES` **[run]** |
| W5, a required check | A checker member with an enrolled key decides a real job `passed`; the destination admits it and publishes. This is the path that `founding-real` states with four scripted entries | A requested job is refused by the lane; a member without `change.check` is refused `unauthorized` **[run]** |

Scenario 5 of the brief, replay, is in W2: each of the seven histories
(register, directory, membership, rules, destination, issue lane, change
lane) is read over HTTP and derived again with the platform rules and the
production capability code, grants `proven`, no anchors. Register,
membership and rules are `consistent`. The other four are `incomplete` for
one reason only, said after every other entry derived with no mismatch:
"the walk of the ancestry record in entry 13 of" the change lane "was not
derived", because the verifier reads no commit **[run]**. See section 6,
gap 5.

**D. The demo profile.** `packages/lanes/src/demo.ts` defines `issueDemo`
(12 of 50 acts) and `changeDemo` (18 of 53), each its full definition with
a subset of its acts and handlers, every kept row the same object, every
item type and timed rule kept **[code]**. They keep the names `issue` and
`change`, because other scopes check the name: the destination takes
`reserve` only from a lane under `change`, and an issue takes `closes` only
from one **[code]**. The pinned files are `definitions/issue-demo.json` and
`change-demo.json`, and `DEMO_DIGESTS` **[code]**. A plain test checks pins,
the strict subset, the counts and validation **[run]**. The story test
("the story on the demo profile ...", `story.scope.test.ts`) runs plan
019's story on a room that activated only the profile: file, comment,
assign; a pull request that closes the issue and touches `AGENTS.md` and a
source file; review requested and given; refused `rules-not-met:rules`; the
controller approves; the merge closes the issue, the assignment kept; an act
outside the profile, `label`, refused `unknown-act`; the rules raised to two
approvals and the next merge refused `approvals-needed` until a second
approval, then published **[run]**.

## 2. Stand-ins and limits

- **The Git host** is a stand-in everywhere: `OutsideDouble` for the
  register and the destination, answering each recorded attempt from the
  actual stored records; `Host` of `graph.ts` for each lane, answering the
  attempts of `hold@1`. No repository exists **[code]**.
- **The changed set** of each publication is stated by the test
  (`Room.changes`); the judge's read answers with the manifest's own tree
  and base, and with each selected report's commit as an ancestor **[code]**.
- **No runner.** In W5 the check's answer is signed by the test with the
  enrolled checker key; no configuration runs **[code]**.
- **No agent.** vic and paul are members. No task, agent key or narrow
  grant is run; plan 019's agent refusal and the split and recombination
  are not in the story **[code]**.
- The clock, transport and readers are the namespace's test ones, as in
  every `PLATFORM` test **[code]**.
- The lanes package's own Worker now binds `PLATFORM`, so the package runs
  these scenarios alone too **[run]**.

## 3. The demo profile and its mapping table

"In profile": the act is a row of `issue-demo` or `change-demo`. "Rules can
add": the act is left out of the profile; a room gets it by activating the
full definition in its rules scope, under which its directory then creates
lanes. No rule refuses it beyond that **[code]**. A lane under the profile
answers an act it lacks `unknown-act` **[run, story]**.

| `issue` act | Grant | Profile |
|---|---|---|
| `file` | `issue.open` | in profile |
| `edit-own` | `issue.edit-own` | in profile |
| `edit-any` | `issue.edit-any` | rules can add |
| `revise` | `issue.revise` | rules can add |
| `label` | `issue.triage` | rules can add |
| `assign` | `issue.triage` | in profile |
| `close-own` | `issue.close-own` | in profile |
| `close-any` | `issue.triage` | in profile |
| `reopen-own` | `issue.close-own` | in profile |
| `reopen-any` | `issue.triage` | rules can add |
| `judge` | `issue.judge` | rules can add |
| `offer` | `issue.request` | in profile |
| `propose-terms` | `issue.promise` | rules can add |
| `accept` | `issue.promise` | in profile |
| `agree` | `issue.request` | rules can add |
| `decline` | `issue.promise` | rules can add |
| `withdraw` | `issue.promise` | rules can add |
| `cancel` | `issue.request` | rules can add |
| `offer-handover` | `issue.promise` | rules can add |
| `accept-handover` | `issue.promise` | rules can add |
| `decline-handover` | `issue.promise` | rules can add |
| `fulfil` | `issue.request` | rules can add |
| `take-hold` | `issue.work` | in profile |
| `report` | `issue.work` | in profile |
| `accept-report` | `issue.request` | in profile |
| `refuse-report` | `issue.request` | rules can add |
| `ask` | `issue.comment` | rules can add |
| `answer` | `issue.comment` | rules can add |
| `settle-ask` | `issue.comment` | rules can add |
| `withdraw-ask` | `issue.comment` | rules can add |
| `block` | `issue.work` | rules can add |
| `release-block` | `issue.work` | rules can add |
| `use-input` | `issue.work` | rules can add |
| `replace-input` | `issue.work` | rules can add |
| `open-plan` | `issue.plan` | rules can add |
| `add-concern` | `issue.plan` | rules can add |
| `seal-plan` | `issue.plan` | rules can add |
| `withdraw-plan` | `issue.plan` | rules can add |
| `resolve-concern` | `issue.plan` | rules can add |
| `drop-concern` | `issue.plan` | rules can add |
| `comment` | `issue.comment` | in profile |
| `edit-comment-own` | `issue.comment` | rules can add |
| `edit-comment-any` | `issue.edit-any` | rules can add |
| `collapse-comment` | `issue.triage` | rules can add |
| `expand-comment` | `issue.triage` | rules can add |
| `redact-comment-own` | `issue.comment` | rules can add |
| `redact-comment-any` | `issue.edit-any` | rules can add |
| `renew-hold` | `issue.work` | rules can add |
| `release-hold` | `issue.work` | rules can add |
| `authorize-export` | `work.export` | rules can add |

Handlers: `result` in profile; `parent-dropped` in profile; `pin-confirm` in profile; `unpin` in profile; `closes` in profile; `export-license` rules can add; `export-settled` rules can add

| `change` act | Grant | Profile |
|---|---|---|
| `open` | `change.open` | in profile |
| `edit-own` | `change.edit-own` | in profile |
| `edit-any` | `change.edit-any` | rules can add |
| `ready-own` | `change.edit-own` | in profile |
| `ready-any` | `change.edit-any` | rules can add |
| `to-draft-own` | `change.edit-own` | rules can add |
| `to-draft-any` | `change.edit-any` | rules can add |
| `close-own` | `change.edit-own` | in profile |
| `close-any` | `change.edit-any` | rules can add |
| `reopen-own` | `change.edit-own` | rules can add |
| `reopen-any` | `change.edit-any` | rules can add |
| `ask-rules` | `change.propose` | in profile |
| `propose-manifest` | `change.propose` | in profile |
| `request-review-own` | `change.edit-own` | in profile |
| `request-review-any` | `change.edit-any` | rules can add |
| `withdraw-review-request-own` | `change.edit-own` | rules can add |
| `withdraw-review-request-any` | `change.edit-any` | rules can add |
| `review-verdict` | `change.review` | in profile |
| `withdraw-review` | `change.review` | rules can add |
| `dismiss-review` | `change.dismiss` | rules can add |
| `request-check` | `change.propose` | in profile |
| `check` | `change.check` | in profile |
| `check-error` | `change.check` | rules can add |
| `comment` | `change.comment` | in profile |
| `open-thread` | `change.comment` | rules can add |
| `resolve-thread-own` | `change.edit-own` | rules can add |
| `resolve-thread-any` | `change.edit-any` | rules can add |
| `reopen-thread-own` | `change.edit-own` | rules can add |
| `reopen-thread-any` | `change.edit-any` | rules can add |
| `link-own` | `change.edit-own` | in profile |
| `link-any` | `change.edit-any` | rules can add |
| `unlink-own` | `change.edit-own` | rules can add |
| `unlink-any` | `change.edit-any` | rules can add |
| `merge` | `change.merge` | in profile |
| `cancel-merge` | `change.merge` | in profile |
| `offer` | `change.request` | in profile |
| `accept` | `change.promise` | in profile |
| `decline` | `change.promise` | rules can add |
| `withdraw` | `change.promise` | rules can add |
| `cancel` | `change.request` | rules can add |
| `offer-handover` | `change.promise` | rules can add |
| `accept-handover` | `change.promise` | rules can add |
| `decline-handover` | `change.promise` | rules can add |
| `take-hold` | `change.work` | in profile |
| `edit-comment-own` | `change.comment` | rules can add |
| `edit-comment-any` | `change.edit-any` | rules can add |
| `collapse-comment` | `change.triage` | rules can add |
| `expand-comment` | `change.triage` | rules can add |
| `redact-comment-own` | `change.comment` | rules can add |
| `redact-comment-any` | `change.edit-any` | rules can add |
| `renew-hold` | `change.work` | rules can add |
| `release-hold` | `change.work` | in profile |
| `authorize-export` | `work.export` | rules can add |

Handlers: `rules` in profile; `publication` in profile; `export-license` rules can add; `export-settled` rules can add

## 4. Digests

| Definition | Before (`origin/main`) | After |
|---|---|---|
| `issue` | `sha256:325cb4f33da9deb1a31d85ba0f1456068d4d9d08009978b779aed70cb08e00ad` | unchanged |
| `change` | `sha256:4ff0c7f681c664a3c2dae22bd0df4a9a1bb239e19bc185db41f7f140d4dfca45` | `sha256:e182f6fb8ebc0525214e6fd9139c6c5e405d9bab2885d7202cd66602f8155a07` (58,429 canonical bytes) |
| `issue-demo` | none | `sha256:82a938c8f54ddcac7974ca688ebea7d51c35d2aa70f4e3729965e9f915bc464e` (23,024) |
| `change-demo` | none | `sha256:8d777c02d4fbd06b9f719c00ff48e59e7f284a44191b1b4a24b9c32c142e27d6` (41,844) |

Two intermediate `change` digests were pinned on this branch and replaced:
`abbc0d78...` (commit `d76ad45`) and `c59b50ae...` (not committed alone)
**[run]**.

## 5. Gate

The command, at the root, with a clean checkout: `npm run gate`. Machine:
a cloud container with 4 CPUs at 2.80 GHz; load average 0.77
before and 1.88 after; installation skipped against the unchanged lockfile;
focused runs had warmed the caches **[run]**.

The final run, at head `8a8cebd3f83bb7ddc90040feb08289c3b4b74133`, tree
`69a6523cfd5cdc252807df329649673848e36f5c`, **failed on one test that this
branch does not touch** **[run]**:

| Step | Exit | Elapsed seconds | CPU seconds |
|---|---|---:|---:|
| Install | skipped | | |
| Whitespace | 0 | 0.0 | 0.0 |
| Typecheck | 0 | 14.1 | 43.8 |
| Tests (test runner) | 1 | 121.9 | 177.1 |

The test runner: 88 files, 729 tests, 728 passed, 1 failed; its own duration
118.23 seconds. The whole command took 136.23 seconds elapsed, 189.09 user
CPU and 32.12 system CPU **[run]**.

The one failure is T36 of `packages/checkers/test/runner.test.ts`: the
runner's `git checkout -q --detach --end-of-options <commit> --` exits 128
with "fatal: only one reference expected, 2 given." under this container's
`git version 2.43.0` (I read its stderr by a temporary log line, then
restored the file) **[run]**. `packages/checkers` and `packages/git` are
unchanged from `origin/main` (`git diff --stat origin/main --` on both is
empty) **[run]**. I infer that T36 fails on `main` in this container too
and passes with a newer Git **[inferred]**; I did not run `main` here.

Because the test runner failed, the gate did not run its last script. I ran it once
alone: `node --test scripts/active-source.test.mjs`, 6 tests, 6 passed
**[run]**.

An earlier run, at `6d6433818eed927617e76ad2432b527baf9cc6e7`, failed three
tests: T36 as above; W4, cut off by the 5-second default timeout under the
gate's load; and `compose.test.ts`, by an uncaught runtime error about I/O
across two scope objects, that I attribute to the cut-off W4
**[inferred]**: `compose.test.ts` passed alone, 8 of 8 **[run]**, and passed
in the final run. Commit `8a8cebd` gives every room scenario 60 seconds.
That run took 139.87 seconds elapsed, 187.15 user and 35.46 system CPU.

This note was added after the final run. Source and tests are unchanged by
it; the gated tree is `69a6523cfd5cdc252807df329649673848e36f5c`.

## 6. What is owed

1. **The lane forms' owner** must adopt or replace the five "i5 wiring"
   rows (section 1). Until then the change lane's rows are not all from an
   adopted revision, and `LANE_FORMS` still says revision 14.
2. **A lane-side check of a review's extent.** I wrote a guard that the
   named extent is one of the rules' extents. The validator refused it:
   "acts.review-verdict.also: has 5; at most 4" and
   "acts.review-verdict.guards.9.ifPresent: is for a guard that names a
   field or a presented fact" **[run]**. The lane now keeps any name, and
   the destination counts a name that is no extent of its observed rules for
   none (revision 28, section 12.1.4a, as `reservation.ts` quotes it)
   **[code]**. A form or a bound change is the contract's to decide.
3. **The value place of a definition's bytes** (commit `c6fe198`). With a
   stated place, missing bytes are refused `bad-field` before any guard,
   as the contract refuses any place without its value. The existing test
   of `activate` was titled "without one of them the act is not
   completed", and now the definition's own bytes missing is `bad-field`;
   only a missing closure definition is still not completed. One place
   carries one value, so a definition whose named closure is not empty
   cannot be activated or created through the runtime **[run: the
   `desk`/`ticket` case]**. Both lane definitions have empty closures
   **[code]**. The authority note's owner should decide the refusal and
   how a closure's bytes travel.
4. **No operand maps a list**, so `merge` takes `reports` from the merger
   (section 1). The lane checks membership both ways, not order or count;
   the destination checks both. A send form that maps a list would be a
   contract form; I did not invent one.
5. **Replay of an ancestry walk.** Any history that reaches a lane with a
   proposed manifest replays `incomplete`, because the verifier reads no
   commit (`verify.ts`, section 16.4) **[run]**. The proof plan owns
   whether a verifier reads commits.
6. **`founding-real.test.ts` keeps its four scripted source entries.** I did
   not rewrite that test; W1 and W5 run the same destination path from a
   real lane instead, and the testing guide says so. If the owner wants
   one witness, `founding-real` can be cut to the founding.
7. **Rules updates are pulled.** After a `publish`, a lane holds its old
   copy until someone acts `ask-rules`. The destination always observes
   the current rules, so a merge is judged on them; the lane's own guards
   (`approvals-needed`, the required checks) use its copy **[code]**.
8. Plan 019's agent under a narrow grant, and splitting and recombining,
   are not in the story. The Git host adapter and deployment (gate 1) and
   the client (gate 3) are not part of this work.
9. Redundant filters, noted per `docs/testing.md`: `reservation.ts`
   filters approvals by the row's extent before `judgeExtents` filters
   again by `review.extent === extent.name`; removing either alone changes
   no outcome, and both controls `SURVIVES` **[run]**.
10. **T36 in this container.** The checker runner's checkout fails under
    Git 2.43.0 (section 5). Whoever lands this should run the gate where
    Git is newer, or the checkers' owner should decide whether the runner
    must support 2.43.
11. `package.json` of the lanes package does not export the two new byte
    files by path; the brief allowed `package.json` changes only for a new
    workspace link. The values are exported from the main entry.

## 7. Decisions followed

- Symbolic links (G30): `extents.ts` is unchanged **[code: no diff]**.
- Same-name conditional sends: unchanged; both lane definitions and the
  profile pass the validator **[run]**.
- The single-controller exception takes effect when the one controller is
  among the manifest's authors or controls an agent among them, and only
  when declared: W4 shows the author case and both declarations **[run]**;
  the agent case is not run.
- Demo defaults (plan 019): assignment is optional and never required to
  merge (the story merges with an assignment that no rule reads); any
  member may comment (paul comments); a closes-link closes the issue on
  merge with the link recorded (W1, the story). That these are rules a
  room can change: the story raises the approvals and the next merge needs
  two **[run]**.
- The own/any act pairs are not merged; the act names are the existing
  ones; the profile selects rows of the existing definitions and adds
  none **[code, test]**.
