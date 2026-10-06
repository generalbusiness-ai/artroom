# I3, the third milestone: the register and the directory whole, a founding on real scopes as far as the destination, extents in the rules scope, the destination's rules but two, what an outcome's rule reads, and the replay's fold reuse

Request `bcf5ec17` (the I3 commission). Branch `request/i3-m3`.
Written 2026-10-06, at head `4bc010bb3` before this note.

**This is a milestone of I3. It is not I3, and it is not the plan's
milestone M1.** M1 is six founded scopes. No repository can be founded
whole at this head: the creation of the destination is refused, because
`platform:destination@1` lacks two rules, `first-head` and `receipt`.
The commission `bcf5ec17` stays open, and so does every duty that
sections 4 and 10 list. This milestone is filed under a milestone
request of its own, as the first two were. An approval and a landing
here record this milestone only. This note does not hold the ID of that
request: the filing names it.

**It lands after the second milestone, which has landed.** The second
milestone is on `origin/main` as `48a2b2851`. This branch holds that
commit, merged at `ba0d6ae34`, and `origin/main` has not moved since
(`git fetch origin`, then `git merge-base --is-ancestor origin/main
HEAD`, run for this note). Against `origin/main` the branch changes 65
files, with this note, and deletes none (section 12).

**What a running system gets from it today: nothing is deployed.** No
file of the repository deploys the scope Worker. No adapter of a Git
host exists, and the production ports send nothing outside the service.
What changed is what the source can do when it runs, as tests observe it
(section 2). In short:

- The register and the directory each run on the platform package's own
  rules. Neither has a stand-in rule left.
- A founding runs on real scope objects, from the register's `install`
  through the directory, membership and the rules scope. It stops at the
  creation of the destination, which is answered `retry`,
  `unsupported-definition`. The Git host of that test is a labelled
  stand-in.
- A rules scope and a destination are read by the production authority.
  They hold membership's scope ID. The first read asks by the ID alone,
  and the entry that retains the answer fixes the incarnation.
- The rules scope holds a repository's extents and the declaration of
  the single-controller exception. `classify` and `judgeExtents` are at
  the authority note's revision 26. In a runtime nothing reaches them.
- The destination has 17 rules, and two of its marks have none. Its
  rule `judge` decides, in a deployed scope, only what the evidence and
  the scope's own records decide. **It reserves nothing there.**
- The judges of an outcome and of a result's delivery give a rule
  `observed`, and an outcome's rule the entries in `uses`. The entry
  retains what was read, and a replay derives it again. **No runtime
  reads such an observation.**
- A scope reads a value beside an intent before the turn and keeps it.
  No route reads a value back, and no data of the platform package
  states a place for one.
- A replay derives the value of an observation once for each distinct
  key, and folds each entry of a source once. That answers the checker's
  finding `e2d4e074`.
- **A publication's room is not reserved.** `covered` is an exemption.
  By the authority note's own table, 71 entries of each publication are
  reserved by no admission.

The checker read the snapshot `441727709` of this branch on its own
account, under its request `ad634606`, and reported no blocking finding.
That report is no approval of this source. It ran no code. Its
statements of what it does not credit are the minimum of what this note
says is not built. Two source commits and seven small commits of
corrections follow that snapshot (sections 8 and 9).

## 1. The adopted designs

This is the one statement of the bases. Every other mention in this note
points here, or is dated.

| Design | Revision | Commit | State |
|---|---|---|---|
| Authority, effects and publication note | 26 | `f7175296cd0750df6629b72fc5cd073ed2ec6bff` | Adopted |
| Scope and replay contract | 19 | `1ca8a59bf6b88f6f38b18b2fe36ae5d2cd2afb7e` | Adopted |
| Lane forms and browser flow | 15 | `f4889d470920cabff693b29b3279ed075e5109da` | Adopted |
| Recovery successor | 9 | `cd10946c` | Adopted |
| Scope and replay contract | 20 | `9dbd3039` | **Filed for review. Not adopted.** Nothing here is built on it |

The revisions and commits are given as the commission for this note
states them. The design notes are not in this tree, and I read none of
them. The adoption is of the designs and accepts no source.

**Parts of this branch were built before their basis was adopted, and
their sections of the deltas note say so.** The register, the directory
and the membership reference (entries EY) were built on the authority
note's revision 25, at `a1d18e51`, while it was filed for review. The
extents data (entries FB) and the destination's rules (entries FA) were
built on revision 26 after the checker approved it and before its
adoption was recorded. Each rule is a commit of its own, whose message
names the row that it implements, so that an adoption could change one
row. **Revision 26 is adopted now.** The work of entries FC and FD was
built after that adoption.

**One thing changed between revisions 25 and 26**, as the commission for
this note states it: the clause on the controller of an agent among the
authors, in the single-controller exception, was restored. **The source
keeps that clause.** In `packages/platform/src/extents.ts`,
`judgeExtents` passes the exception when the one controller is among
the authors or controls an agent among them
(`authors.has(one) || owners?.has(one) === true`), and its comment names
"The exception, in the planner's words", as revision 26 restores it
(read in the source). The deltas note, section 29, says that revision 26
keeps section 12.1.5, the destination, unchanged. **Nobody compared the
rows of the register and the directory in revision 25 with revision 26
for this note.** I take it from the commission that they are the same.

Five file headers said that revision 26 was approved or not adopted.
Each now says that it is adopted since (section 9).

**What comes next, and is no credit here.** The contract's revision 20
would replace the `covered` exemption with a checked reservation, state
which subjects an entry observes, and let the rules `first-head` and
`receipt` be written. It is filed for review. None of the three is built
or prepared on this branch.

## 2. What a developer can do at this head that they could not at the second milestone's

Each row is observed in a test, at the gated commit (section 11). "Real
scopes" means scope objects with their own SQLite storage in the test
Worker, on Cloudflare's workerd, in the namespace `PLATFORM`: the
deployed class with the production authority and the platform package's
own data and rules. "In memory" means derive's judges over state in
memory, with the stand-ins that `docs/testing.md` lists. No row is a
deployment. A test title is given by its first words.

| What | The test that shows it | Where it ran |
|---|---|---|
| Found a register by an `install`, claim a repository, and have the directory, membership and the rules scope created by the definitions' own rules. Section 2.1 has each step and the stop. | `packages/scope/test/founding-real.test.ts`, "an install founds a register; a founder's claim opens the creation of a repository; ..." | Real scopes. No rule is a stand-in and no entry is made by hand. The Git host is a STAND-IN, `OutsideDouble`. The clock is scripted, and the readers are the test readers, or the real read sessions under a test secret |
| Publish rules at a real rules scope on a grant that the production authority read from membership by its scope ID alone. A read session is refused there before that act and accepted after it, and after a restart. | The same test | The same |
| Replay the four histories that the founding wrote: the register's outcome entry with its creation, the directory's genesis under the fourth cause, and the rules scope's grants. Each is `consistent`, with every grant derived. | The same test, its last part | Real scopes wrote the histories. The verifier read them as bytes over the Worker's read routes |
| See that the register and the directory each lack no rule, and that the destination lacks exactly two. | `packages/platform/test/definitions.test.ts`, "the register and the directory each lack no rule, ..."; the same assertion in `founding-real.test.ts` | A plain function; and beside real scopes |
| Judge the register's founding and the directory's creations and import, by the package's rules. | `packages/platform/test/register.test.ts`, "a founding opens one claim and one creation of three attempts; ..."; `directory.test.ts`, "a directory's genesis, by an outcome entry of its register, ..." | In memory, on the fixtures `Register` and `Directory`. The genesis of each child and each lane's entry are made by hand |
| Have an outcome's rule send a creation with the fourth cause. | `packages/derive/test/forms-marks.test.ts`, "the send of an outcome's mark: its rule gives one request at ordinal 0, ..." (the contract's 18.43) | In memory, on a made-up definition |
| Publish extents at a rules scope and have the three checks of `extents-hold` refuse a list without the fixed minimum, without exactly one catch-all, or with an unknown check. Set and withdraw the declaration of the exception. | `packages/platform/test/rules-scope.test.ts`, "publish keeps the extents that it states, whole, ..." and "the declaration of the single-controller exception is false from the genesis, ..." | In memory, on the fixture `Rulebook`. The directory, the lane and each observation of a member are stand-ins |
| Judge a mixed change by extent: a review counts only for the extent that it states, and an input that is not given fails closed. | `packages/platform/test/extents.test.ts`, "plan 016's mixed change touches three extents ..." and "without the controllers of the authoring agents ..." | Plain functions over data written by hand. No changed set is computed |
| Run the destination's rules for a reservation, a push with its mint and revocation, the deciding read, an abort, a resend and `adopt-head`. | `packages/platform/test/destination.test.ts`, 14 tests | In memory, on the fixture `Branch`. Stand-ins: the rules `first-head` and `receipt`; the reader of a lane's entries; the directory; every observation, every entry of a lane and every answer of a host. Nothing ran on scope objects |
| Have an outcome's rule read a further observation and a foreign entry, and find exactly what was read in the entry. | `packages/derive/test/forms-marks.test.ts`, "an outcome's rule, and the rule of a result's clause, read a further observation, ..." | In memory, on a made-up definition |
| Replay an outcome that retains an observation: each record is derived again, in the ten-second window. | `packages/replay/test/verify.test.ts`, "each observation that an outcome retains in `observed` is derived again, ..." | In memory, on the made-up scope `Gate`. The value of the rules observation is taken from an anchor |
| Send a value beside an intent and have the scope read it for a place of its pinned data and keep it, once. | `packages/scope/test/values.test.ts`, "a value beside an intent, on real storage: ..." | A real scope and real storage, under derive's made-up platform data `gate`. No definition of Artroom states a place |
| Replay a long history of alternating heads with the source folded once. | `packages/replay/test/verify.test.ts`, "two admins who alternate `publish` on membership heads L and H: ..." | In memory, on the platform package's own membership and rules definitions. The office, the registrar and each read are stand-ins |

### 2.1 How far a founding runs, step by step

Read in `packages/scope/test/founding-real.test.ts`, which is one test,
and run in the gate. Every scope is a scope object of the namespace
`PLATFORM`.

1. An `install` intent founds a register under `platform:register@1`.
   Nothing checks who may install: that is the installation design's.
2. A founder's `found` opens a claim and the operation
   `create-repository`, with attempt 1. The entry fixes the directory's
   seed, and so its scope ID.
3. The operations driver sends the one request of attempt 1 to the
   host. No answer comes. The outcome is recorded `unknown`, with the
   body `{ name }` that the register's rule states, and its entry opens
   attempt 2.
4. The host's own answer to attempt 2 is `confirmed` and is selected.
   It sets the claim's `repository` and sends the `create` of the
   directory. Exactly two requests reached the host.
5. The directory's genesis is written under the fourth cause. The
   register records its `applied` result, makes the claim `active` and
   confirms the directory.
6. The directory, now active, sends its three creations. Membership and
   the rules scope each write their genesis. The directory records each
   result, sets each reference, and confirms each.
7. **The first refusal: the creation of the destination is answered
   `retry`, with the reason `unsupported-definition`.** The object that
   its seed names records nothing, and a read of it is `not-found`. The
   duty stays in the directory's outbox, unanswered. The test asserts
   the cause by name: the marks of `platform:destination@1` that have no
   rule are exactly `first-head` and `receipt`.

After the stop, the test seats the founder in membership and runs the
rules scope's first act that needs a grant, a `publish`. That is the
reference fixing of section 6.

**What this does not show.** No repository is created anywhere: the host
is a stand-in. Under the production wiring no port accepts an operation
of the register, so a claim stays `pending` (entry EY10). The directory
creates no lane: its guard `definition-active` needs an observation of
the rules scope, which no runtime reads (entries EM3 and FC6). **Step
10, the removal of the earlier founding, is not built.** A directory
with no creator is still founded by a `found` intent under a declared
definition, as every other test of the scope package does (entry EY13).

### 2.2 Which platform definitions the package's own rules run

| Definition | Runs on the package's rules | What is missing | Asserted in |
|---|---|---|---|
| `platform:inbox@1` | Yes | Nothing | `platform/test/definitions.test.ts` |
| `platform:membership@1` | Yes. Ten rules | Nothing | The same |
| `platform:rules@1` | Yes. Six rules | Nothing of its marks. It has no answer to an observation of the rules. On a real scope, `publish` ran with no check to observe. The acts that need a further observation or a value are not completed there (entries EQ9, FC6 and FC7) | `rules-scope.test.ts`; `founding-real.test.ts` |
| `platform:register@1` | Yes | Nothing of its marks. No production host | `register.test.ts`; `definitions.test.ts`; `founding-real.test.ts` |
| `platform:directory@1` | Yes | Nothing of its marks. `definition-active` is never completed on a deployed scope | `directory.test.ts`; the same two |
| `platform:destination@1` | **No** | The rules `first-head` and `receipt`. It has 17 rules | `destination.test.ts`; the same two |

The production defaults and the deployed class are as the second
milestone's note has them (its section 2.1), with one change: the
deployed class's authority now reads membership for a rules scope and a
destination. Under the deployed class nothing is sent outside the
service.

## 3. What is built, part by part

The plan's section 2.3, dated, lists the commits of each part. Commands
run from the repository root, and `--project <p> <name>` stands for
`npx vitest run --project <p> <name>`. Test counts are by
`npx vitest list --json`, run once at the gated commit and counted by
script.

"Controls" is the number of failure controls that the deltas note or a
commit message records for the part, counted by reading. Each recorded
control used `scripts/control.mjs` and distinguished, unless the row
says otherwise. **I ran none of them.**

| Part | What is built | Files | Witness and command | Controls |
|---|---|---|---|---|
| EY, the sending side of the fourth cause | The mark of a kind of `outcomes` may hold one `send`. The judge of an outcome runs its rule after the effects. A `create` among its requests has the fourth cause, and the sending side makes the four checks of the opening entry. The evidence check is given the state, and an owner states the body of an outcome that is not known | `derive/src/{outcomes,ledger,marks,sends}.ts`, `validate/index.ts`; `contract/src/platform.ts`; `scope/src/operations.ts` | `--project derive forms-marks` (46 tests), the contract's 18.43 | 2, by the commit message |
| EY, the register and the directory | Every mark of each has its rule. The register: `create-repository`, the send `create-directory`, the effect mark `claim-active`, the bodies of the outcomes of the two cleanups. The directory: `create-rules`, `create-destination`, `import-spent`, the selection of `import` with the send `import-update`, `activeKey` in `worker-standing`, `unsupported-definition` in `definition-active` | `platform/src/{register,directory}.ts` | `--project platform register` (13), `directory` (29), `definitions` (5) | 3, by the commit messages: one for `claim-active`, one for `import-spent`, one for the selection of `import`. The other rules record none |
| EY, the membership reference | A rules scope and a destination hold membership's scope ID. The incarnation is read from the folded state. The first read asks by the ID alone. Guard 1, the production authority and the replay's reader follow | `derive/src/{grant,state}.ts`; `platform/src/{rules-scope,destination,index}.ts`; `scope/src/{authority,sqlite}.ts`; `replay/src/verify.ts` | `--project derive forms-grant` (2); `--project platform definitions`; `--project scope founding-real` (1) | 3, by the commit message |
| EY, a founding on real scopes | A founding under `platform:register@1` founds a register. The path of section 2.1 | `scope/src/{core,worker}.ts`; `scope/test/{founding-real.test,repository,worker}.ts` | `--project scope founding-real`; `--project scope founding` (6) | 2, by the commit messages: the seed's kind, and a null body for an unknown outcome |
| FB, extents data | The slots and fields `extents` and `singleControllerException`; the type rule `extent-list`; the guard `extents-hold` with three refusals; the send mark `rules-update`, with the first definition before a first `publish`. `judgeExtents`: a review counts for the extent that it states. `classify` and `judgeExtents`: each input that no retained form supplies fails closed | `platform/src/{rules-scope,extents}.ts`; `contract/src/observation.ts`; `bytes/src/records.ts` | `--project platform rules-scope` (8), `extents` (10) | 18, by the deltas note, section 28 |
| FA, the destination | Six slots. 17 rules: the rows of its acts and handlers, `abort-if-behind`, `resend-due`, and the outcomes `mint`, `revoke`, `push`, `deciding-read`, `adopt-read` and `judge`. The send `publication-update`. The judgment of one reservation, `judgeReservation`, which calls `classify` and `judgeExtents` | `platform/src/{destination,reservation}.ts`; `derive/src/{effects,ledger}.ts` | `--project platform destination` (14) | 24, by the deltas note, section 29. One survived at first, and distinguishes since its witness was added |
| FC, part 1 | Nothing of a reservation. The number: `publicationRoom` computes 4 and 68, and a test holds the 73, the 71 and the five kinds that state `covered` | `platform/src/destination.ts`; `derive/src/ledger.ts` | `--project platform definitions`, "only five kinds of the destination state ..." | 2, of the 18 below |
| FC, part 2 | The judges of an outcome and of a result's delivery pass `observed`. The judge of an outcome passes the entries in `uses`. Each entry retains what was read. A replay derives each such record again. A version may state where it records its rules reference. The scope reads `values` before the turn and keeps them. The acts route passes `values` | `derive/src/{outcomes,delivery,marks}.ts`; `replay/src/verify.ts`; `platform/src/{destination,index}.ts`; `scope/src/{core,sqlite,store,worker}.ts` | `--project derive forms-marks`; `--project replay verify` (44); `--project platform destination`; `--project scope values` (1) | 16, with the 2 above: 18 by the deltas note, section 30 |
| FD, the replay's fold reuse | Section 8 | `replay/src/{verify,view}.ts`; `derive/src/state.ts` | `--project replay verify`; `--project derive forms-grant`, `forms-handlers` (5) | 5, by the deltas note, section 31.6 |

The counts of this column sum to 75 recorded controls: 10 for EY, 18
for FB, 24 for FA, 18 for FC and 5 for FD. The sum is by hand. The 10
of EY are in commit messages only: the deltas note, section 26, records
no control. Of the eleven commits of the register's and the directory's
rules, eight record a witness and no control.

The file lists are by `git diff --name-only 48a2b2851 HEAD`, read. They
name the files where the part's logic is, and not every file that a
part touched.

## 4. What is not built

From the deltas note, sections 26 and 28 to 31, and from the checker's
report. Nothing here is softened.

| Part | Not built |
|---|---|
| EY, the sending side | The member `attempts` of an outcome's mark (entry EY1). **A request that an outcome entry sends is reserved by nobody**: `closure` counts the operations that an outcome opens, and no request (section 7) |
| EY, the register | **No production host.** No port accepts an operation of `platform:register@1`, so under the production wiring a claim stays `pending` and no repository is created (entry EY10). The incident for a `refused` creation is not built. A `failed` may follow a `done` after a retried import (entry EY11): seen while the witness was written, and not run as a test |
| EY, the directory | Its guard `definition-active` is never completed on a deployed scope, so a real directory creates no lane (entries EM3 and FC6). `import-spent` walks every entry of the scope |
| EY, the membership reference | The replay does not check the incarnation against the directory's history (entry EY8). Such a scope accepts no read session before its first retained observation (entry EY12). The destination's half ran on no scope object |
| EY, the founding | **It is not whole.** Step 10 is not built. The Git host is a stand-in |
| FB | **No rules scope answers an observation of the rules** (entry FB10): `platform("platform:rules@1")` has no `observed`. So no `publish` is observed back. `RulesContent` has no member `extents` (entry FB2), so no observation could carry an extent. **The pinned `change` lane does not take the `rules` update**: its handler declares three fields, and no pinned lane sends `rules-wanted` (entry FB5). No changed set is computed, no link is resolved, no observation counts the holders of an action, and no entry retains an observation of an authoring agent (entries FB6 and FB7). The plan's T37 |
| FA | **The rules `first-head` and `receipt`** (entries ER9 and FA6). Nothing is created under `platform:destination@1`, in a test as in production, without two stand-in rules. **No port sends a request of the destination**: no host, no gateway and no Git command is reached by any test. A `resend` on a `published` publication is refused `final` (entry FA6). The update `unknown` does not send `seen` (entry FA8). Two searches read a publication's whole life in entries (entry FA5) |
| FA and FC, the rule `judge` | **In a deployed scope it reserves nothing.** Two reasons, each enough: no runtime reads an observation before the turn of an outcome (entry FC6), and the package has no reader of a lane's entries (entry FC5). The package's own rule is given no reader. It decides four things from the evidence and the scope's own records: a publication that is no longer `queued`, `evidence-too-large`, a head that is not the recorded head, and an integration commit that is not in the repository. For any other outcome it has a fault: nothing is written and the publication stays `queued` |
| FA and FC, the fills | **Three inputs of `judge` are filled with the value that fails closed**, each for one missing form. `extents` is null, because `RulesContent` has no member `extents` (the contract's part of form 2): no extent is judged from an observation. `controllers` is null, because no observation counts the holders of `rules.publish` (form 11): no exception is judged. `controllersOfAuthors` is null, because no entry retains an observation of an authoring agent (form 15): the exception is not shown by its second clause, and where `ownerMayReview` is false no review counts. The changed set is the member `changes` of the evidence, which no port produces. **So nothing calls `classify` with a real changed set** |
| FC, part 1 | **The reservation by a publication.** `covered` is an exemption (section 7) |
| FC, part 2 | **No runtime reads an observation** before the turn of an outcome, of a result's delivery or, beyond the signer's own, of an act (entry FC6). `Operations` gives the judge of an outcome no `observed` and no `facts`, and `Scope.submit` gives the judge of an act no `observed`: both are marked `I3 merge:`. **Values have no read route**, and the replay's HTTP source asks for none, so a replay over HTTP of an entry that names a value is `incomplete` (entry FC7). No data of the platform package states a place, so no real act of Artroom reads a value (entry EX5). The replay's branch for a result's delivery has no witness (entry FC8). The value of an observation of the rules is taken on trust from an anchor, and without one the replay ends `unsupported-definition` (entry FC4). An outcome's `uses` names every entry that its judge was given, read or not (entry FC3) |
| FD | The rows of the sweep that are recorded and not changed (below) |

**Whole-history scans that remain**, each with its owner. From the
deltas note, entries FA5 and FD6 and section 31.4; the directory's is
read in `packages/platform/src/directory.ts`. The worst counts of
section 31.4 are by reading, and none was run.

| Where | What it reads for one entry | Owner |
|---|---|---|
| `directory.ts`, `import-spent` | Every entry of the scope, for the `import` operations | The proof plan, with request `cc570904` |
| `destination.ts`, `writesOf` and `mintRevoked` | The entries of a publication's life (entry FA5) | The same: a read of operations by kind, or a slot |
| `directory.ts`, `rowOf`; `destination.ts`, `publications` | Every item of a type, by a value (row 20; entries EP10 and ER11) | The same |
| `standingOf`, membership's answer | Every key item, or every member item, of the source (row 3; entry EM12) | The same |
| `view.ts`, `View.at` | The records that the fold wrote, for a head before the one folded last (row 4) | The builder, with row 3 |
| `verify.ts`, `#prove` | The caller's anchors, for each distinct fact (row 7) | The builder, when a limit on anchors is stated |
| `source.ts`, `MemorySource.retained` | One scope's retained inputs (row 8) | The builder |
| `timed.ts`, `nextDue`; `hold.ts`, `endsUnder` and `heldUnder` | The live items of each timed type, and the live holds of each hold type, up to `max` (rows 12 and 13) | The proof plan, with `cc570904` |
| `lists.ts`, `scan` | In a replay, the items of the type, with no limit (row 14) | The contract's section 9.3, with the proof plan |
| `state.ts`, `MemoryState.records` and `recordCount` | Every capability record, sorted (row 15; entry EF6) | `cc570904`, the proof plan |
| `fold.ts`, the texts of a detached-text slot; `attribution.ts` | The texts held, and the attribution history of an item (rows 16 and 17) | The contract, with the proof plan |
| `state.ts`, `MemoryState.putItem` | The items in one state, as moved array elements (row 18) | The builder: measure first |
| `settle.ts`, `judgeCheckpoint` | The whole folded state, for its digest (row 19) | The contract, with the proof plan |
| `state.ts`, a count of copies by state | Every copy. Only the reserve asks it (entry FD6) | Not named in the deltas note |

**Not started on this branch:** steps 10, 13, 18, 26 to 28 and 29 to
32. So a whole founding, six founded scopes, a fork, a push, a
publication and the assembly do not exist.

**Marked seams.** 22 comments in `packages/` hold `I3 merge:` (`grep
-rn`, counted). They are the source's own list of the gaps above.

**What the checker does not credit.** Its report lists as owed: all
remaining I3; IA, I4, I5 and E1; the application, with the browser, the
command line and agents; all five capacity dimensions and the
platform's maxima; the final receipt and publication; a live host,
runner, storage, Worker, device, recovery, clock and deployment; and
the retained custody and form duties. This note claims none of them.

## 5. Bytes and digests

**Both lane digests are unchanged.** `git diff 48a2b2851 HEAD --
packages/lanes/src/digests.ts packages/lanes/definitions` prints
nothing (run). The one file of `packages/lanes` that differs from
`48a2b2851` is `test/support/graph.ts`, by one line, which the deltas
note calls a comment (`git diff --stat`, run). The pins test passed in
the gate, and alone (`npx vitest run --project lanes`, 3 tests, run).
The digests are `issue`
`sha256:325cb4f33da9deb1a31d85ba0f1456068d4d9d08009978b779aed70cb08e00ad`
and `change`
`sha256:4ff0c7f681c664a3c2dae22bd0df4a9a1bb239e19bc185db41f7f140d4dfca45`,
as the second milestone's note has them.

**Existing entries.** Each of the five sections of the deltas note says
that no entry that an earlier source wrote has other bytes. I took that
from the note. **No stored history was derived again**, by the workers
or by me, and no stored history exists: nothing is deployed. The
witness is that the earlier tests pass. For entry FC the deltas note
names a witness that an entry whose rules read nothing has the bytes it
had.

**State digests.** I did not recompute one. Two things are new in a
folded state, each only under a platform definition whose data changed:
a rules scope has two more values from its genesis, and a destination
has six more slots. No scope under either was written by a deployed
source.

**Platform data.** The data of four platform definitions changed, each
under its one name and version:

| Definition | What changed in its data | Entry |
|---|---|---|
| `platform:register@1` | The outcomes of its three kinds, the send `create-directory`, the effect mark `claim-active` | Section 26 |
| `platform:directory@1` | The row key of the marks `create-rules` and `create-destination`, the selection of `import` with the send `import-update`, the guard `import-spent`, a second refusal of `definition-active` | Section 26 |
| `platform:rules@1` | Two slots, two fields of `publish`, the guard `extents-hold`, the send mark `rules-update` | FB11 |
| `platform:destination@1` | Six slots, two fields of `adopt-head`, the guards `resend-due`, `not-importing` and `not-the-directory`, the send `publication-update` | Section 29 |

So each has another definition digest than it had at the second
milestone. **The digest of a platform definition is pinned nowhere.** A
platform definition is pinned by name and version. No scope under any
of the four was written by a deployed source, and the destination's
version has never been runnable. No data of a platform definition
changed with entries FC or FD. Membership's data did not change. The
code of its answer did: a request that asks by the scope ID alone is
answered by the scope that holds the name, and one that states an
incarnation is answered by that incarnation only
(`packages/platform/src/membership.ts`, read in the diff).

**New forms**, for anyone who reads or writes these bytes:

| Form | Where | From |
|---|---|---|
| `observed` on an outcome entry and on the entry of a result's delivery, written by the judge, only where a rule read an observation | The entry's input | Entry FC; the contract's section 4.1. No deployed rule can read one |
| `uses` on an outcome entry, where its judge was given foreign entries | The entry | Entry FC3 |
| The table `retained_value`: a value by its domain and its digest | The scope's store, `scope/src/sqlite.ts`. It is made empty when an object starts. No row of another table changes | Entry FC7 |
| `send` in the mark of a kind of `outcomes` | Platform data | Entry EY1 |
| `always` on the send mark `rules-update` of the rules scope | Platform data | Entry FB5. The directory's two creations stated `always` at the second milestone already: the diff of `directory.ts` changes their row key and not that member (read) |
| A request's `of` with no incarnation: the scope ID and the kind | `ObservationRequest`. It is no part of any entry | Entry EY7 |
| The slots `extents` and `singleControllerException` of the item `rules`, and the member `singleControllerException` of a `RulesContent` | `platform/src/rules-scope.ts`; `contract/src/observation.ts`; `bytes/src/records.ts` | Section 28 |
| Six slots of the destination, `branch.judging` among them | `platform/src/destination.ts` | Section 29 |
| The detail of the `rules` update: up to six members, with five members of each extent and no pattern | The rules scope's `relate` | Entry FB5 |
| The refusal names `rules-extent-required`, `catch-all-required`, `extent-check-unknown`, `import-not-spent` and `resend-not-due`; `unsupported-definition` as a second refusal of `definition-active`; and the guard reasons `not-importing` and `not-the-directory` in the destination's data | The `refusals` of the platform rules and the destination's data (`git diff 48a2b2851 HEAD`, read) | Sections 26, 28 and 29 |

**New members of code interfaces**, which change no bytes:
`OutcomeRule.ready`, `covered` and `unknown`; more arguments of
`wellFormed`; `StateView.incarnations`; `OutcomeContext.observed` and
`facts`; `DeliveryContext.observed`; `Platform.rulesScope`; an optional
`domain` of `Store.retained`; `verify(source, options, tally?)`. The
deltas note's "Lines for the merge", in each of the five sections, say
what a caller must change.

## 6. Security

Read in the source where the paragraph says so. Nothing here was run on
a deployment.

**The reference fixing.** A rules scope and a destination record
membership's scope ID as a fixed value from their genesis, and no
incarnation. Read in `packages/scope/src/authority.ts`,
`packages/derive/src/grant.ts` and `packages/platform/src/rules-scope.ts`:

- *The first read asks by the ID alone.* The request's `of` is the scope
  ID and the kind, with no incarnation. An answer counts only when its
  `of` is that ID, of the kind `membership`, and its key is the key
  asked (`observedOf`).
- *The entry that retains the answer fixes the incarnation.* The
  reference of that entry's grant is the `of` of the observation
  (`fixedBy`). From then on the incarnation is a function of the folded
  state (`referenceOf`, over `StateView.incarnations`), the read states
  it, and an observation that names another is discarded.
- *It is checked again inside the commit.* `held` reads what the scope
  records at the commit, and judges guard 1 on that: an entry written
  since the read may have fixed an incarnation.
- *More than one incarnation is no reference.* A state that holds two
  for one ID records none, and an act that needs a grant is answered
  `authority-unavailable` (entry EY9).
- *A read session needs a fixed reference.* `fixedMembership` is null
  until an entry retains an observation, so such a scope accepts no
  session before that. The founding test shows 403, then 200, then 200
  after a restart.

**What that leaves open.** The first answer is trusted for its
incarnation: whichever scope answers under that ID first, and passes
guard 1, fixes it. The scope ID is derived from a seed, and a request
that states another incarnation of membership's name is answered by
nobody (the founding test's last assertion on `observe`). A replay
derives the grant from the retained observation. **It does not check
the incarnation against the directory's record of the creation** (entry
EY8).

**What fails closed in `judgeExtents` and `classify`.** Read in
`packages/platform/src/extents.ts`:

- A changed set or links that are null, a count of unreadable paths
  that is not 0, or no count: `rules` is unmet, and no review and no
  exception meets it.
- A path that no extent holds: the change is not met.
- A link that leaves the tree, where the change creates it: refused,
  and never met by a review or by the exception.
- `controllersOfAuthors` null: no exception by its second clause, and no
  review counts where a controller's would be refused. That is every
  review of the `rules` extent, and every review of another extent
  unless `ownerMayReview` is true. **It is wide: under the default
  `ownerMayReview: false`, a caller that gives null counts no review at
  all** (entry FB7).
- `controllers` null: no exception is judged.
- A review that states no extent, or a name that no extent has, counts
  for none.

**The single-controller exception.** Three conditions must all hold
(`judgeExtents`, read): the observed rules declare it, and anything but
`true` is no declaration; exactly one member is a controller; and that
member is among the authors, or controls an agent among them. Then the
reviews of the `rules` extent are met only when that member signed the
`merge`. The checks of the extent stand, and so does every other
obligation and every grant. **A null input grants nothing**: a null
`controllers` gives no exception, and a null `controllersOfAuthors`
gives none by the second clause. The first clause still holds from the
authors and the merger, which is the planner's exception as written. A
refused path is not met by the exception.

**What fails closed in `judge`.** From the deltas note, entries FA9 and
FC6, and section 30.2; I read the two lines of the fills in
`packages/platform/src/destination.ts` and no more of the rule. The
package's own rule is given no reader of a lane's entries. Where the
evidence and the scope's own records do not decide, it has a fault:
nothing is written and the publication stays `queued`. The three fills
of section 4 are null. `singleControllerException` is read from the
observed rules and decides nothing while `extents` is null. **So a
deployed destination, if one existed, would reserve nothing. It would
not reserve wrongly.**

**Unknown outcomes never become inferred successes.** For the register:
a read is never decisive, only the request's own answer settles an
attempt, and an `unknown` outcome opens the next attempt
(`packages/platform/src/register.ts`, read; the founding test, steps 3
and 4). For the directory: an `unknown` attempt of an import counts as
used and selects nothing. For the destination: the `unknown` outcome of
a push leaves only its own answer able to follow, and the deciding read
is evidence in a body and settles no attempt (the deltas note, entry
ER7; `destination.test.ts`, "the unknown outcome of a push leaves only
its own answer able to follow; ...", in memory). A sending side that
returns a creation which names no opening entry is a fault of the rule,
and nothing is written (entry EY5).

**Observations in an outcome.** An entry that retains an observation is
not written clamped, and a replay judges guards 1 and 3 to 6 of each
record, in the ten-second window (entry FC4). The window is this
source's reading of two rows of the authority note: no form states it.
A later row with another window would be judged wrongly here.

**What remains a duty, and is not a claim.** As the checker states it,
and as the second milestone's note has each:

- **Cross-key member removal.** A read that shows a member removed does
  not stop that member's other keys before their own next read (entry
  EM23).
- **Live job-token revocation.** Nothing opens the revocation of a
  `live` read token (entry EW7).
- **Custody.** Nothing in production holds a plaintext between its
  sealed entry and its use (entries ET2 and ET6).
- **Real outside adapters.** No adapter of a Git host, for the token
  ledger, the register or the destination.
- The forms 11 and 15, and the retained record of the relation that
  refuses a controller's review.
- Who may install a register: nothing checks it.

## 7. Capacity

Stated as the checker's challenge left it. **All five capacity
dimensions remain open**, in the checker's words, with "finite
byte/record/request bounds and charged read/hash/fold work". The guide
lists the dimensions as entries, bytes, items, records and pending
requests (`docs/scopes.md`, "What is not delivered yet"). Only entries
are counted, with temporary numbers.

**The register's closure of 12.** Read in
`packages/platform/src/register.ts`: `CREATION_ATTEMPTS` is 3, and
`CLEANUPS` is `2 * (2 * CREATION_ATTEMPTS)`, which is 12. It is the
`closure` of an outcome of `create-repository`: two cleanup operations
of three attempts each, with a first outcome and a late answer for each
attempt. The accounting, made explicit:

| Outcome of `create-repository` | Opens | Sends | Entries |
|---|---|---|---|
| `confirmed` and selected | `revoke-credential`, when the body holds a credential: 6 | The `create` of the directory: 2 for its pending request | At most 8 |
| `confirmed` and not selected | `revoke-credential` and `delete-repository`: 12 | Nothing | At most 12 |
| `refused` or `unknown` | Nothing | Nothing | 0 |

The two branches exclude each other, so both fit the 12. **That is an
accounting by reading, the checker's and mine. The ledger does not make
it.** The ledger compares only the operations that an outcome opens
with `closure`. It counts no request. So the 2 entries of the
directory's creation fit inside the 12 because the selecting branch
never opens the second cleanup, and for no other reason. A closure that
replaces the conservative 12 must state the request and the cleanups
separately. General accounting for a request that an outcome sends is
not built (the deltas note, section 30.1, the sweep). I simulated no
history and ran no test for this.

**The publication exemption, with its 71.** An outcome entry is never
refused for room. The destination's kinds open each other in a circle,
so no closure by kind is finite, and five kinds state `covered`: `mint`,
`push`, `deciding-read`, `adopt-read` and `judge`. **`covered` reserves
nothing. It is an exemption from the closure check.** By the authority
note's table a publication reserves 4 entries while `queued` and 68
from the reservation on. The one entry that is asked whether it fits is
the delivery of the `reserve`, and it is asked for the 2 outcome
entries of the `judge` that it opens. **So one publication may write 71
entries that no admission reserved**, and 72 where its `reserve` opened
no `judge`. `packages/platform/test/definitions.test.ts` holds the 4,
the 68, the 73, the 71 and the five kinds (read: its last test asserts
`room.unreserved` is 71). The test holds the number. It does not make
it a reservation. The table is also no upper bound of what the built
rules write: it has no row for a `resend`, and counts one deciding read
where the rule may open more (the deltas note, section 30.1, rows 4 and
5).

No scope runs under `platform:destination@1`. **Until the reservation
is built, a destination must not be deployed with a budget that its
publications could pass** (entry FC1).

**Also not reserved.** The rows of the authority note's section 5.8 for
membership, the register and the directory: an active key, an active
member, an unused invitation and a claim reserve nothing, because no
platform data declares a reservation and no form says how (the deltas
note, section 30.1). The bytes of a value count against no budget
(entry FC7).

## 8. The checker's finding e2d4e074

**The finding**, as the deltas note, section 31, records it: a replay
kept one folded state for a source scope, and began again from the
genesis whenever an observation named a lower head than the last one.
Two admins who act in turn on cached observations of two heads are
legal, so each pair cost a fold of the source again. The value of an
observation was also answered again for each grant. The planner's
disposition is in event `752a2725`: derive each value once, by the exact
source scope, incarnation, head, definition and subject, or by an
equivalent bounded strategy, and keep every check and every valid
history.

**What answers it** (commits `f9a5ae91c` and `bfde0eec3`):

- The value that a source's history gives is derived once for each
  source scope, incarnation, head, definition and subject, and kept.
  Every retained observation is still compared with the value. What is
  kept is what the history gives, and never that an entry agreed.
- Each entry of a source is folded once into a view that keeps a log of
  writes. The state at an earlier head is built from the log, with no
  second fold. This is the "equivalent bounded strategy": the deltas
  note says why a copy of the state for each named head was not chosen.
- Two searches of the replay and two reads of the state in memory are
  each one lookup or one number (entries FD3 to FD6).

**The two counts**, on the witness history: a membership scope with two
admins whose heads are 5 and 45, and a rules scope with 41 acts
`publish`.

| | Fold applications for the source | Values answered | How taken |
|---|---|---|---|
| The earlier code | 966 | 41 | Observed by the worker, with a counter at two places in the code of `441727709`, in one run. The counter was not committed. I did not repeat it |
| This code | 46 | 2 | Observed by the tally, in the witness, which asserts both as upper limits. It ran in the gate |

The answer for the history, and the mismatch for the same history
changed at one entry, are those that the earlier code gave, taken from
it before the change. Five controls are recorded, each of which
distinguishes. One removes the comparison of an entry whose value is
already kept, and the changed history is then `consistent` where it
must be a mismatch.

**Limits.** The witness history is written by derive's judges in
memory, with stand-ins for the office, the registrar and each read. No
real scope wrote it. The checker left the concern unpromoted at
`441727709` for the reason that no caller provides a complete admitted
history of that shape, and this witness is still not one from a
runtime. The other counts of section 31.3 are by a counter (780 to 40)
or by reading the code (930 to 30, and two of 1,000). Fourteen rows of
the sweep are recorded and not changed (section 4).

## 9. Truth fixes made for this note

Each is a commit of its own, after `c0f7b4521`. Each was checked
against the source first. The checker named the first four as
non-blocking guide corrections.

| # | Where | What was false | Now | Commit |
|---|---|---|---|---|
| 1 | `docs/scopes.md`, the row of hold tokens | "The directory that will create lanes cannot be created yet" | It can be created, by a register's founding. It creates no lane, because `definition-active` is never completed | `d4deec24b` |
| 2 | `docs/scopes.md`, the row of platform definitions, and its package table | "Every other platform name is answered `unsupported-definition`", in the present tense. Two statements that revisions 25 and 26 were not adopted, with no later state | The sentence is marked as history, with what is answered so at this head. Revision 26 is adopted since | `2b83ef9ad` |
| 3 | `packages/scope/README.md`, the authority | A rules scope and a destination record their reference "in a way that the authority does not read yet" | The read by the ID alone, the fixing of the incarnation, the check inside the commit, and three limits | `94c6c2922` |
| 4 | `packages/scope/src/core.ts`, the comment of `prepare` | "That is the production wiring, whose capabilities port is null" | The production ports hold the code of `hold@1` and `git-read@1` | `3474a14a5` |
| 5 | `packages/platform/src/extents.ts`, the comment of `holdsRulesExtent` | "No mark of `publish` runs this yet" | The guard `extents-hold` runs it | `ac3568346` |
| 6 | The headers of `platform/src/{destination,directory,register,rules-scope}.ts` and of `scope/src/authority.ts` | Revision 26 "is approved"; revision 25 "was not adopted when this was written", with no later state | Each adds that revision 26 is adopted since | `c8e7ccac3` |
| 7 | `packages/scope/README.md`, the storage table | "One scope has these tables", without `retained_value` | The row is added | `519fce5c1` |

Commits 4 to 6 change comments only, under `packages/`. They are in the
gated tree.

**Searched and found true at this head**, so not changed: that the
destination lacks two rules and not ten (`docs/scopes.md`,
`docs/testing.md`, `packages/scope/README.md`); that the rules scope
has six rules; that `judge` is given its observations by the judge of
the outcome and no test seals one by hand (`docs/testing.md`); that the
register and the directory have no stand-in rule; `docs/lanes.md` on the
directory. The search was `git grep` over `docs/`, the package READMEs
and `packages/*/src` for the phrases that the earlier state would have
left. It is a search for phrases, and no reading of every sentence.

**Not changed, and dated.** The deltas note's sections and the two
earlier delivery notes are history. Where one disagrees with the code
at this head, the code is right. Section 11 of the deltas note is
titled "prepared ahead of adoption", and sections 26, 28 and 29 say
that their basis was not adopted: each was true when written, and
section 1 of this note has the state now.

## 10. Open questions, by owner

The deltas note, sections 26 and 28 to 30, holds 47 entries with an
owner's cell: EY 13, FB 11, FA 15 and FC 8. Section 31 holds six
entries FD, which are changes and name no owner. The counts are by a
script over the last cell of each of the 47 rows, which matches the
owner's name. An entry that names two owners is counted under both, so
the counts sum to more than 47. An entry that asks an owner only to
confirm is counted like any other. The script is not in the repository.

| Owner | Entries that name it | Which |
|---|---|---|
| The authority note | 23 | EY3, EY9, EY11, EY12; FB1, FB5 to FB7, FB9, FB10; FA6, FA8 to FA14; FC1, FC4 to FC7 |
| The builder, or the I3 delivery | 19 | EY1, EY2, EY8, EY10, EY13; FB5 to FB8; FA1 to FA3, FA7 to FA9, FA15; FC2, FC6, FC8 |
| The scope contract | 13 | EY3 to EY7; FB2, FB3; FA4, FA6; FC3, FC4, FC6, FC7 |
| The proof plan, or request `cc570904` | 7 | FB1, FB6; FA3, FA5; FC1, FC2, FC7 |
| The lane design (R2), or the lane forms | 4 | FB7; FA8, FA9; FC5 |
| The installation design (N5) | 1 | EY10 |
| IA | 1 | FB6 |
| None | 3 | FB4, FB8, FB11. FB8 also names the builder |

The earlier entries that these sections close or leave open are listed
in each section of the deltas note, under "Earlier entries that this
work answers". I did not count them again.

**The few that block the most:**

1. **ER9, with FA6** (the authority note, with the scope contract): the
   two details of the founding commit and the receipt, and where a
   receipt's records live when the publication is final. Without them
   `first-head` and `receipt` are not written, no destination is
   created, no founding is whole, and step 10 and the plan's M1 wait.
   The contract's revision 20 is filed to answer it.
2. **FC6, with EM2** (the scope contract with the authority note, then
   the builder; the contract's point R1-67): the form that states which
   subjects an entry observes. Until it exists no runtime reads an
   observation for an outcome, `judge` reserves nothing, the directory
   creates no lane, and the rules scope's `publish` with a check is not
   completed on a real scope.
3. **FC1, with FA3 and FA5** (request `cc570904`, with the authority
   note and the proof plan): the reservation by a publication. Six
   things that no adopted text states are in the deltas note, section
   30.1.
4. **FC5** (the authority note, with R2): which member of which entry of
   a lane holds each fact that `judge` reads. Without it the package has
   no reader of a lane's entries.
5. **FB2 and FB10, with EQ8** (the scope contract; the authority note):
   the member `extents` of a `RulesContent`, and the rules scope's
   answer to an observation. Without them no extent reaches a judgment.
6. **FB6 and FB7** (the authority note's next revision, with R2, the
   proof plan and IA): the forms 1, 11 and 15, for the changed set, the
   count of controllers and the controller of an authoring agent.
7. **FB5 and FA8** (the I3 source, with the lane forms): the lane rows
   that take the `rules` update and the member `rules` of a publication
   update, with a new digest of the `change` lane.
8. **EY10**, with the plan's question Q6 (the builder, with N5): a host
   adapter for the register. Without it no repository is created.

## 11. The gate and the cost of the tests

**One run of `npm run gate`**, at commit `4bc010bb3`, tree
`135b4aeef1bdd580b14a6567434579b7b5cd8afd`, as printed: install 2.0 s
elapsed and 2.6 s CPU; whitespace 0.0 s elapsed; typecheck 3.3 s
elapsed and 8.7 s CPU; test 10.6 s elapsed and 26.1 s CPU. It printed
537 tests passed in vitest and 6 in Node's runner. The whole command
took 16.2 s elapsed, with 30.6 s user and 7.2 s system CPU (the shell's
`time`). It passed at its first run. I ran no second gate.

**The install step ran.** The gate installs when its stamp does not
match the lockfile, and this worktree had no matching stamp. It ran
`npm ci` from the committed lockfile. `package.json` and the lockfile
are unchanged, and the worktree was clean after it (`git status`, run).

It is one observed run, on a shared machine with other sessions active
(an Apple M5 Max with 18 cores; load averages 3.70, 3.48 and 3.63 just
before it and 6.09, 4.05 and 3.83 just after), with a warm package
cache.

**Counts**, by `npx vitest list --json` at the same source, counted by
script: 537 tests in 69 files. "Change" is against the second
milestone's counts, from its note, section 13.6.

| Project | Files | Tests | Change |
|---|---|---|---|
| `bytes` | 2 | 17 | |
| `derive` | 21 | 238 | 7 more |
| `platform` | 7 | 110 | 17 more |
| `git` | 5 | 14 | |
| `checkers` | 2 | 11 | |
| `replay` | 2 | 49 | 6 more |
| `client` | 2 | 10 | |
| `lanes` | 1 | 3 | |
| `scope`, with the eleven lane scenarios in seven files | 27 | 85 | 2 more, in 2 more files: `founding-real.test.ts` and `values.test.ts` |

**Beside the second milestone, as two observed runs.** The second
milestone's note records its last gate at `082efdf21`: 505 tests in
vitest and 6 in Node's runner, with the test step at 9.6 s elapsed and
23.8 s CPU (its section 13.6). The commission for this note gives that
milestone's landed gate as 505 tests and 10.5 s elapsed for the tests.
I found no record of a 10.5 s run in this tree, so I cite the note's
own figure and name the other as given to me. This run has 32 more
vitest tests. Its test step took 1.0 s longer elapsed and 2.3 s more
CPU than the note's run. The two runs were made at different times and
under different load. This compares two observations and is not
controlled.

**No saving is claimed.** The test run grew. The cost of one edit taken
to review is not measured here. I timed no project alone and ran no
suite a second time. Beside the gate I ran one collection (`vitest
list`) and the pins test alone (3 tests). The deltas note, section 31,
records one root vitest run by the worker at `f9a5ae91c`: 537 tests in
69 files, 9.9 s elapsed.

**The commits after the gated one change notes only.** The gated commit
is `4bc010bb3`. `git rev-parse <commit>:packages` is
`8c61b83088abb3683cee1a8922a1574677bd06cf` there and at the head that
adds this note. The source and the tests are unchanged between them.
The filing states the head and its tree.

## 12. How each figure was taken

| Figure | How taken |
|---|---|
| The gate's times and its two test counts | Observed, one run, printed by the gate |
| 16.2 s for the whole gate, and its CPU | Observed, the shell's `time` on that run |
| Tests and files by project; tests of one file | Count by script over `vitest list --json`, one collection |
| 65 files added or changed against `origin/main`, and none deleted | Count by `git diff --name-only --diff-filter=AM origin/main...HEAD` and `--diff-filter=D`, with `wc -l`, at the head with this note |
| Controls by part, and their sum of 75 | By reading the deltas note and the commit messages. Summed by hand. Not a count by script, and none was run by me |
| Open questions by owner | Count by script over the last cells of the deltas tables |
| The 22 seams | Count by `grep -rn "I3 merge:" packages --exclude-dir=node_modules` |
| 966 and 41 | Observed by the worker of entry FD, with a counter that was not committed, in one run. Taken from the deltas note |
| 46 and 2 | Observed, by the tally that the witness asserts, in the gate |
| 12, 8 and 6 of the register | By reading `register.ts` and the checker's report. A sum of stated attempts, not a run |
| 4, 68, 73 and 71 of a publication | Computed by `publicationRoom` and asserted by a test, from the authority note's table. A reconstruction from a table, not an observed history |
| The worst counts of the sweep | By reading, in the deltas note. None was run |
| The comparison with the second milestone | Two observed runs, at different times and loads |
| The runnable table | By the assertions of the tests named, which ran in the gate |
| That no entry's bytes and no state digest change | Taken from the deltas note. Not recomputed |
| That the lane digests are unchanged | `git diff`, run; the pins test, run |

## 13. Limits of this note

**One delegated author wrote it, in one session, and built none of the
source.** Other workers built the parts, each on a branch of its own or
on this one, and wrote sections 26 and 28 to 31 of the deltas note. I
made the seven commits of section 9 and the plan's section 2.3.

**What I verified by command:** that the branch holds `origin/main`;
the gate, once; the pins test; that the lane digests and definitions
are identical to `48a2b2851`; the counts that section 12 calls a count;
the files of each part, by the diff's list.

**What I verified by reading the source:** the founding test, whole;
the reference fixing, in `authority.ts`, `grant.ts` and `rules-scope.ts`;
`judgeExtents`, whole, with the clause of revision 26; the register's
closure and the rule `create-repository`; `import-spent`; the last test
of `definitions.test.ts` for the 71; the two lines of the fills in
`destination.ts`; that only membership answers an observation
(`platform/src/index.ts`); the refusal names; and each place that
section 9 corrects.

**What I took from the deltas note and the checker's report, and did
not check:** every statement of what a part built and did not build,
beyond the files and tests named; that no entry's bytes and no state
digest change; each recorded control; the counts of the earlier code;
the sweep's rows; the content of each open question. I read sections 26
and 28 to 31 of the deltas note once, whole. I read the rule `judge`,
`judgeReservation`, the judges of an outcome and the replay's view only
through their tests' titles and the deltas note. I read no test body
but the founding test and one test of `definitions.test.ts`.

**What nobody did:** read the adopted designs for this note; compare
revision 25 with revision 26 for the register's and the directory's
rows; derive a stored history again; run anything on a deployment, a
Git host, a gateway, a container or a real runner; run a control for
the commits of the register and the directory that record none.

Dated notes are history and are not edited. Where one disagrees with
the code at this head, the code is right.
