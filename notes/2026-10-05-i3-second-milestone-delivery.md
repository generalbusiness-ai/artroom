# I3, the second milestone: capability code in the production ports, membership, the platform definitions as data, replay, read sessions and the checker's pure parts

Request `bcf5ec17` (the I3 commission). Branch `request/i3-m2`.
Written 2026-10-05, at head `bf584e0c1` before this note.

**This is a milestone of I3. It is not I3.** The commission `bcf5ec17`
stays open, and so does every duty that sections 4 and 9 list. This
milestone is filed under a request of its own, as milestone F was after
its review `4db3db9b` (the foundation delivery note, section 13). An
approval and a landing here record this milestone only. This note does
not hold the ID of that request: the filing names it.

**It lands after milestone F.** F is the head `2ad870f3b` of
`request/i3-authority-effects`, under review. This branch holds F's whole
history, merged at `bf584e0c1`, and everything built after it. Against F
it changes 214 files, with this note (`git diff --name-only
2ad870f3b...HEAD`, counted): 172 added or changed and 42 deleted.
Against `origin/main` at `b2b62d260` it changes 274 files: 219 added or
changed and 55 deleted (the same command, counted). That count holds
milestone F's files too.

**What a running system gets from it today: nothing is deployed.** No
file of the repository deploys the scope Worker, no session secret is
bound, no adapter of a Git host exists, and the production ports send
nothing outside the service. What changed is what the source can do when
it runs, as tests observe it (section 2). In short:

- The deployed class of a scope has a real authority. A membership scope
  judges its own acts on its own head. Every other scope reads the
  membership scope that it records. This is observed on real scope
  objects, for membership and an inbox.
- Three platform definitions run on the platform package's own rules:
  the inbox, the rules scope and membership. Three do not: the register
  lacks one rule, the directory lacks rules for three marks, and the
  destination lacks rules for ten. So no repository can be founded, and
  **the plan's milestone M1, six founded scopes, is not reached**.
- The production ports hold the code of `hold@1` and `git-read@1`. Under
  the production defaults no grant is read, so a scope under such a
  definition is founded and then admits nothing.
- A replay derives each grant, each preparation and each outcome again.
  **A history that holds an ancestry record replays as `incomplete`,
  never as `consistent`**, because the walk is not derived.
- Read sessions, the limits of a join and the operator's record are
  built. A session that was issued to a key is good until its end, at
  most 600 seconds, after that key is revoked.
- The checker service exists as pure parts. No runner, no container, no
  storage adapter, no Worker and no deployment exists.

## 1. The adopted designs

This is the one statement of the bases. Every other mention in this note
points here, or is dated.

| Design | Revision | Commit | State |
|---|---|---|---|
| Authority, effects and publication note | 24 | `d5616522b72bb53dce4a258fee5a22b7eff40022` | Adopted |
| Scope and replay contract | 19 | `1ca8a59bf6b88f6f38b18b2fe36ae5d2cd2afb7e` | Adopted on 2026-10-05. It replaced revision 18 at `be90ff05` |
| Lane forms and browser flow | 15 | `f4889d470920cabff693b29b3279ed075e5109da` | Adopted |
| Recovery successor | 9 | `cd10946c` | Adopted |

The revisions and commits are given as the commission for this note
states them. The design notes are not in this tree, and I did not read
any of the four. The adoption is of the designs and accepts no source.

**A limit, stated plainly: much of this source was built against earlier
revisions, and says so.** Most steps were built against authority
revision 21 at `f9ec25e4` and contract revision 16 at `54420b41`. Their
file headers and their sections of the deltas note name those revisions,
and are not edited. By a search of `packages/` (`git grep -l`, counted):
9 files name "revision 21" and 6 name "revision 16"; 8 name "revision 24"
and 21 name "revision 19".

Three workers compared their own sections across the revisions and found
the text the same. Their deltas entries say which sections:

- The rules scope: sections 12.1.4 and 3.10 of the authority note and
  rows 27 to 29 of its table of marks are the same in revisions 21 and
  24, and the type `RulesContent` is the same in contract revisions 16
  and 18 (entry EV17). No other section was compared.
- Step 24: sections 3.11, 5.1, 5.3, 5.5, 5.7 and 6.3 of the note, and
  sections 4.3, 5.5 and 6.11 of the contract, are the same in revisions
  21 and 24, and 16 and 18 (the deltas note, section 24).
- Step 25: sections 3.11, 5.5 and 6.3 of the note are the same in
  revisions 21 and 24 (section 25).

**Nobody compared the rest.** Steps 16, 8a, 7, 11, 12, 14, 8, 9, 9b, 9e,
22, 19, 20 and 15 were built against revisions 21 and 16, and no
comparison with revisions 24 and 19 is recorded for them. Nobody
compared contract revision 18 with revision 19 for any section but the
rows that the rows-19 work built. The two pinned lane definitions were
written from lane forms revision 14 (`packages/lanes/src/digests.ts`
says so), and no comparison with revision 15 is recorded. Nothing here
was built against the recovery successor.

What was built on the later revisions: membership's three last rules and
the register's guard, on authority revision 24; the source rows I3-31 to
I3-38, on contract revision 19. The rows-19 work was built before
revision 19 was adopted and is filed after it (the deltas note, section
22, and its dated addition). The extents judgments follow revision 24,
section 12.1.4a, with three later answers of the planner.

## 2. What a developer can do at this head that they could not at F's

Each row is observed in a test, at the gated commit (section 10). "Real
scopes" means scope objects with their own SQLite storage in the test
Worker, on Cloudflare's workerd. "In memory" means derive's judges over
state in memory, with the stand-ins that `docs/testing.md` lists. No row
is a deployment.

| What | The test that shows it | Where it ran |
|---|---|---|
| Create a membership scope, seat its founder, give the founder a key, invite a member and take the join. Each act of membership is judged on its own head. The join creates the member's inbox, a second real scope. | `scope/test/membership.test.ts`, first test, through the fixture `scope/test/repository.ts` | Real scopes, in the namespace `PLATFORM`. The class is the deployed class with the production authority and the platform package's own rules. Four ports are not production's, and are labelled: a scripted clock, transport that a test can hold, the test readers, and scripted peers. The creator of the membership scope is a stand-in, the office |
| Act at an inbox and have the act judged on a real observation of the signing key, read from the membership scope that the inbox records. After the key is revoked, the next act on a fresh read is refused. Another member's key is not. | The same test | The same |
| See that a version of membership that lacks any one rule founds nothing. | `membership.test.ts`, second test; `platform/test/definitions.test.ts`, second test | Real scopes; and as a plain function |
| Replay a history that real scopes wrote under the production authority. Each grant is derived again from its observation, and the observation's value from membership's history. Eight changed copies are each reported by the name of what they break. | `membership.test.ts`, "replay agrees with the runtime" (the plan's T44) | Real scopes wrote the histories. The verifier read them as bytes over the Worker's read routes |
| Ask a membership scope for a read session with a signed request, and read the scopes of that repository with it, and no other. Open a stream under it. With no secret bound, get no session and no read. | `scope/test/sessions.test.ts`, T15 and T42 | Real scopes, with the real read sessions. The secret is a test secret, made in each test. Both clocks of a session are one scripted clock |
| Send junk-signed joins from one address and be limited, while the invitee joins from another address and an admin's act from the limited address is admitted. | `scope/test/limits.test.ts`, T39, second test | A real membership scope, through the Worker's route. The `busy` case is shown with a stand-in (entry ES15) |
| Read the operator's record and the two lists of requests that wait, and send one waiting request again. | `scope/test/operator.test.ts`, T41 | Real scopes. An incident that writes an entry is shown on an entry made by hand |
| Found a scope under a definition that uses the forms of `hold@1`, with every production default. It then refuses every act and step `unauthorized`, opens no operation and lets no reader read. | `scope/test/founding.test.ts`, "a definition that needs a capability record" | A real scope with the production defaults. The definition is a made-up variant of a lane. It is not run on the two pinned values under production wiring |
| Run a handover, and a manifest with its evidence, on the two pinned lane definitions with the capability's own code: records, steps, guards and the rules of outcomes. | `lanes/test/hold.scope.test.ts`, T4; `manifest.scope.test.ts`, T3; `links.scope.test.ts`, T5b | Real scopes under the pinned digests. The authority is the test authority, a stand-in. The Git host is a stand-in: no repository exists and no commit is read |
| Run the token ledger through the host port at a real scope. A mint whose reply is lost stays `unknown`. Its own late answer makes the token `live`, and only then is the plaintext handed over and the staging sent. | `scope/test/tokens.test.ts`, T19 through the port | A real scope with the code of `hold@1` and the real `TokenDriver`. The host, the gateway's side and the sender of a staging are stand-ins |
| Throw a provider's error that holds credentials at two outside calls, and find no credential and no provider's text in any entry, read, answer, diagnosis or log line. | `scope/test/redaction.test.ts`, T14 | The same fixture |
| Have a real change lane take signed check results: a pass, a fail, an error, a wait that ended and a retry. | `lanes/test/checks.scope.test.ts`, T34 | A real change lane. The results are signed by the checker service's own signer, called as a function. A rules peer and the test capability are scripted. No runner |
| Replay a lane's history with preparations and their outcomes. | `replay/test/verify.test.ts`, witness 18.4 | In memory. Derive's judges wrote both histories. Their creator, each observation of membership and every outside answer are stand-ins |
| Judge the rows and the written rules of the register, the directory, the rules scope and the destination. | `platform/test/register.test.ts`, `directory.test.ts`, `rules-scope.test.ts`, `destination.test.ts` | In memory. The register, the directory and the destination run only with stand-in rules of test support. No real scope ran any of the four |
| Classify a changed set into extents and judge which obligations are met. | `platform/test/extents.test.ts` | Plain functions over data written by hand. Nothing calls them |
| Check out a job's commit and hold it to the job; run one delivery of the checker service. | `checkers/test/runner.test.ts`, T36; `service.test.ts`, T35 | T36 on a real local repository, which is not a host. T35 on stand-ins for the lane, the rules scope, the storage and the runner |

### 2.1 The production wiring, exactly

There are two things that "production" can mean, and tests use both.

**The production defaults**, `production()` in
`packages/scope/src/ports.ts`. The class `ScopeObject` with no wiring has
exactly these. Read in the source:

| Port | At F | Now |
|---|---|---|
| `authority` | Reads no grant | The same: no act that needs a grant is current |
| `capabilities` | Null | `CAPABILITY_CODE`: the code of `hold@1` and `git-read@1` from `derive`, with `tokensPerHold` 2 and no retirement of a root (entry EL5) |
| `owners` | Null | The same value: the rules of the operations that the two capabilities own |
| `readers` | Lets nobody read | The same |
| `outside` | `NO_OUTSIDE` | The same: nothing is sent outside the service |
| `diagnoses` | Did not exist | `toConsole`: one JSON line to the runtime's log |
| `definitions.platform` | The platform package, one definition | The platform package, six definitions |

**The deployed class**, `DeployedScope` in `packages/scope/src/worker.ts`,
which `packages/scope/wrangler.jsonc` names. It adds three things to the
defaults: the namespace as resolver, transport and source of
declarations; the authority `repositoryAuthority`; and the readers port
`sessionReaders`, with the session configuration read from two bindings.
Every other port is the default. So under the deployed class nothing is
sent outside the service either.

**Which platform definitions the package's own rules run.** Each is
asserted with `runnable`, in the test named.

| Definition | Runs on the package's rules | What is missing | Asserted in |
|---|---|---|---|
| `platform:inbox@1` | Yes. One rule | Nothing | `platform/test/definitions.test.ts` |
| `platform:rules@1` | Yes. Three rules | Nothing of its marks. On a real scope its three marked acts are not completed or are refused: the runtime gives a rule no value and no further observation (entry EQ9) | `rules-scope.test.ts` |
| `platform:membership@1` | Yes. Ten rules | Nothing | `definitions.test.ts` |
| `platform:register@1` | No | The rule `create-repository` (entry EJ1) | `register.test.ts` |
| `platform:directory@1` | No | Rules for the marks `create-rules`, `create-destination` and `import-spent` (entries EX4 and EP7) | `directory.test.ts` |
| `platform:destination@1` | No | Rules for ten marks: `resend-due`, `abort-if-behind` and the eight of `outcomes` (entries ER4 to ER9) | `destination.test.ts` |

A version with a mark and no rule runs nothing. So under the production
wiring nothing is founded under the register, and nothing is created
under the directory or the destination. Membership can be created, but
its real creator is the directory, which cannot be: in every test a
stand-in office creates it. A founding under `platform:rules@1` from a
signed intent would be written (entry EQ11), and nothing reads such a
scope as a repository's rules.

**What the deployed class does not do.** A rules scope and a destination
record their membership reference in a way that the authority does not
read yet. An act there that needs a grant is answered
`authority-unavailable` (entry EM21). No test runs a pinned lane under
the production authority: the lane scenarios use the test authority.

## 3. The steps, in one view

Step numbers are the plan's. Its section 2.2, dated, lists the commits
of each. Test counts are by `npx vitest list --json`, run once at the
gated commit and counted by script. Commands run from the repository
root, and `--project <p> <name>` stands for
`npx vitest run --project <p> <name>`.

"Controls" is the number of failure controls that a commit message, the
deltas note or a review note records for the step, counted by reading.
Each recorded control used `scripts/control.mjs` and distinguished,
unless the row says otherwise. **Seven rows record none.** I did not run
controls for them, except the three of step 15 that section 6 reports.

| Step | What is built | Files | Witness and command | Controls |
|---|---|---|---|---|
| 16 | The production ports hold the capability code. An outcome states its owner and kind. The steps read a signed intent by the capability's table. Kinds `delete` and `deletion`; the retained kind `snapshot`; declared maxima and `entry-too-large` | `scope/src/ports.ts`; `derive/src/capability/{hold,gitread}.ts`, `ledger.ts`, `validate/timed.ts`; `contract/src/{entry,capability,bounds}.ts` | `--project scope founding` (6 tests); `--project derive forms-records` (4), `forms-ancestry` (2), `forms-prepare` (4); the lane scenarios T3, T4, T5b: `--project scope manifest`, `hold`, `links` | 1: T4 fails with the snapshot reader made empty |
| 8a | `observed` on an act, an outcome and a result's delivery, and `values` beside an intent, as forms. The judge of an act gives a rule both | `contract/src/{observation,entry,transport}.ts`; `bytes/src/records.ts`; `derive/src/{judge,marks}.ts` | `--project derive forms-marks` (39), "a rule reads a further observation and a value beside the intent" | 1 |
| 7 | Membership as data, with ten rules and its answer to an observation | `platform/src/membership.ts` | `--project platform definitions` (2), T43; `--project platform rules.test` (31), T50, T10, T13 | None recorded |
| 11 | Membership creates a member's inbox. A creation under a platform name pins the runtime's own data and rules | `derive/src/sends.ts`; `scope/src/delivery.ts` | `--project platform rules.test`, the join's entry; `--project scope membership` (4), T40 | None recorded |
| 12 | The deployed class has a real authority | `scope/src/{authority,worker,namespace}.ts`; `derive/src/grant.ts` | `--project scope membership`, T11 and T40 | 3: a revoked key answered as active, the filter not checked, the whole-scope rule removed |
| 14 | A replay derives each recorded grant again. A grant with no freshness proof is a mismatch by default | `replay/src/verify.ts` | `--project scope membership`, T44; `--project replay cli` (5) | 2: the order of heads not judged, the value not derived |
| 8 | The fourth cause, and the founding of a register in the genesis judge | `derive/src/genesis.ts` | `--project derive compose` (19), "a child that an outcome entry creates" | None recorded |
| 9 | The register and the directory as data, with each rule that can be written | `platform/src/{register,directory}.ts` | `--project platform register` (12), `directory` (26): T43, T50, T38 | None recorded |
| 9a, 9d | The rules scope as data, with its three rules | `platform/src/rules-scope.ts` | `--project platform rules-scope` (6): T43, T50 | None recorded |
| 9b, 9e | The destination as data, with eight rules at its acts and handlers. A confirmation opens attempt 1 of each operation that the genesis holds | `platform/src/destination.ts`; `derive/src/{delivery,ledger}.ts` | `--project platform destination` (8) | 1: the first held opening left out (entry ER12) |
| 9f | Nothing | None | None | None |
| 22 | The replay derives a preparation, an outcome and the checks of an ancestry record | `replay/src/verify.ts` | `--project replay verify` (38): witness 18.4, T24 | 5, from entries EU2, EU3, EU4 (two) and EU6 |
| 19, 20 | The host port, the token driver, diagnoses and the redactor | `git/src/host.ts`; `scope/src/{diag,operations}.ts` | `--project git host` (3); `--project scope tokens` (1), T19; `--project scope redaction` (2), T14 | 15, in `notes/2026-10-05-i3-host-review.md`, section 6. One was first inconclusive and was run again after the test was strengthened |
| 15 | Read sessions, the serving limits of a join, the operator's record | `scope/src/{sessions,limits,operator,reads}.ts`; `client/src/session.ts`; `contract/src/session.ts`; `bytes/src/{session,hash}.ts` | `--project scope sessions` (2), T15, T42; `limits` (2), T39; `operator` (2), T41 | None recorded by the step. 3 run for this note (section 6) |
| Rows I3-31 to I3-38 | A list bound of 64; several send marks with `always`; a value place in platform data; the retained kind `value`; what a retry rule is given; the bound on a rule's message. Membership's last three rules | `contract/src/{bounds,platform,read}.ts`; `derive/src/{marks,sends,judge}.ts` and the validator; `platform/src/{membership,register,directory}.ts`; `replay/src/verify.ts` | `--project derive validate` (57), witness 18.44; `forms-marks`, witness 18.45; `--project replay verify`, case 8; `--project lanes` (3), case 7 | 6: three for I3-34, one for I3-33, one each for I3-35 and I3-38 |
| Extents, request `42de9e34` | Judgments over data: the first three extents, `classify`, `judgeExtents` | `platform/src/extents.ts` | `--project platform extents` (7) | 3, for the planner's decision on a link that leaves the tree. None recorded for the first commit |
| 24 | The step `job-read`, a job's read token, the files and the commit of a snapshot | `derive/src/capability/gitread.ts`; `contract/src/capability.ts`; `git/src/{host,snapshot}.ts` | `--project derive forms-prepare`, the last two tests; `--project git snapshot` (3); `--project git host`, second test | 6, in `notes/2026-10-05-i3-snapshot-review.md`, section 5 |
| 25 | The package `packages/checkers`: origin read, configuration, outcome, store, signer, service, the runner's checkout, the runner's boundary | `checkers/src/*`; one statement of `git/src/gateway.ts` | `--project checkers service` (6), T35; `--project checkers runner` (4), T36; `--project scope checks` (1), T34 | 12, in `notes/2026-10-05-i3-checkers-review.md`, section 8 |

The counts of this column sum to 58 recorded controls (55 by the steps
and 3 for this note), all of which distinguished. The sum is by hand.

**The planner's decision on a link that leaves the tree** (commit
`a269c98ba`; entry EV7, parts (a) and (c)). I read the test and found a
case for each thing the planner decided:

| Decided | Case in `extents.test.ts`, "a link that leaves the tree is refused only where the change creates it" |
|---|---|
| Creating such a link is refused | One `new` row: refused, class `authority` |
| Giving a link a target outside the tree is refused | An `old` row inside the tree and a `new` row outside: refused, and the old target is still judged |
| Removing it is allowed, and is a change in the `rules` extent | One `old` row: not refused, `rules` and `source`; one review does not meet it and the controller's does |
| Replacing it with a file is allowed | One `old` row at a path of the infrastructure extent: `rules` and `infrastructure`. `classify` cannot tell this from a removal, and the test says so |
| Replacing it with a link inside the tree is allowed | An `old` row outside and a `new` row inside: `rules`, the path's extents and the new target's |
| An unrelated change in a tree that already holds such a link is not blocked | Two cases with a `both` row: `source` alone, nothing refused, class `content` |

Nothing was missing there. No control distinguishes the last case,
because it was not blocked before the change either (the commit says
so).

## 4. What is not built, step by step

From the deltas note, sections 14 to 25. Nothing here is softened.

| Step | Not built |
|---|---|
| 16 | The scripted capability stays in test support. The scope package's own tests and the lane scenario T8 use it: T8 cannot run on the code at its bound of 16 entries (entry EL9). The three numbers of entry EL5 (2 tokens for a hold, no retirement of a root, 256 derived effects) are a floor and two temporary values that no text proposes. The second shape of `propose-manifest` runs in no scenario |
| 8a | **The scope's runtime reads no `values` beside an intent, makes no further read before a turn, and keeps no value** (entries EM3 and EX6). The judges of an outcome and of a delivery give a rule neither `observed` nor a value. No form states which subjects an entry observes, or their windows (entry EM2) |
| 7 | No entry sets `member.inbox` (entry EM9). A read that shows a member removed does not stop that member's other keys before their own next read (entry EM23). Three searches read every page of a type, with no bound but what the scope holds (entry EM12) |
| 11 | A creation that a genesis sends holds no member `membership` (entry EM17). A `create` that a send mark's rule returns is not given one by the judge either (entry EX9) |
| 12 | A rules scope and a destination read nothing: an act there that needs a grant is `authority-unavailable` (entry EM21). The windows of a task scope |
| 14 | The option `as-recorded` stays, for histories that the test authority wrote, until step 30. The replay command never takes it |
| 8 | `Scope.found` and the Worker build no seed of the kind `register`, so no object founds a register (entry EP2) |
| 9 | The register's rule `create-repository` (entry EJ1). The directory's rules for `create-rules`, `create-destination` and `import-spent`. The judge of an outcome lets no rule send a creation. T38 ran on a directory in memory, below a scripted register, and not on scope objects |
| 9a, 9d | The rules scope's answer to an observation of the rules, and the read (entry EQ8). The plan's T37. No real scope ran one of its rules (entry EQ9). The incarnation of its membership reference is not recorded (entry EQ7). The `rules` update does not fit the pinned `change` lane's handler: read, and not run (entry EQ10) |
| 9b, 9e | `abort-if-behind` of step 9e, and the guard `resend-due`. A second open `judge` is possible and no test asserts it (entry ER2). A refused `withdraw` sets no mark (entry ER10) |
| 9f | **All of it. The destination has no outcome rule.** The eight kinds of `outcomes` have marks and no rule: `first-head`, `judge`, `push`, `mint`, `revoke`, `deciding-read`, `receipt`, `adopt-read`. So the reasons of a judgment, the three classes of send evidence, the receipt and the first head have no witness. The first reason is that an operation names no publication (entries ER5 to ER9) |
| 22 | **The walk of an ancestry record is not derived. A replay of any history that holds an ancestry record answers `incomplete`, at the check entry, and never `consistent`** (entry EU2). So no lane history with a check entry replays as consistent. The replay command is given no capability code, so from the command line every history with a preparation or an outcome is `unsupported-definition` (entry EU1). An observation of the rules is `unsupported-definition` (entry EU5) |
| 19, 20 | No adapter of a real Git host. No production `Custody`: nothing in production holds a plaintext between its sealed entry and its use (entries ET2 and ET6). The driver checks no bound on a token's end time and does not compare an access. An attempt whose token never becomes `live` is never sent and never ends (entry ET7). A diagnosis is written at one place only, the operations driver (entry ET10) |
| 15 | Most kinds of incident are named and nothing finds them (entry ES12). The operator's instruction has no route (entry ES13). The four session operations are HTTP routes and are not in `ScopeApi` (entry ES9). Every number of the limits is a proposal |
| Rows I3-31 to I3-38 | Row I3-36. The store of a value, the scope's read of `values` before the turn, a route that reads one value, and the HTTP source of a replay (entry EX6). The rules of the directory's two send marks (entry EX4). No data of the platform package states a value place (entry EX5). The marks do not state `most` or `refusals` (entry EX1, row I3-21) |
| Extents | **No rules content holds an extent, and nothing calls the extents judgments.** `publish` has no field for one, the item `rules` has no slot, no observation returns one, no mark names a judgment, and no changed set is computed. `classify` is given the paths and the links, and the caller that resolves a link is not built (entries EV1 to EV11). Eleven of the note's fourteen missing forms are owed |
| 24 | **Nothing opens the revocation of a `live` read token** (entry EW7; section 6). The snapshot repository of a filtered check: no record, no creation, no name (entry EW3). No real scope sealed a `job-read` entry in a test |
| 25 | **No runner and no container. No storage adapter. No adapter of `Scopes`, no Worker and no route for a notice. No deployment.** Nothing routes a `live` read token from the driver's `Custody` to a run's gateway. No filtered check and no image |

**Not started on this branch:** steps 9c, 10, 13, 18, 26 to 28 and 29 to
32. Steps 9c and 10 wait on entry EJ1. So a founding, six founded
scopes, a fork, a push, a publication and the assembly do not exist.

**Marked seams.** 21 comments in `packages/` hold `I3 merge:` (`grep
-rn`, counted). Each names something that a later step or an owner's
answer must close. They are the source's own list of the gaps above.

## 5. Bytes and digests

**Both lane digests are unchanged.** `packages/lanes/src` and
`packages/lanes/definitions` are identical to `origin/main` (`git diff
--quiet`, run). `git diff 14eab9dc1 HEAD -- packages/lanes/src/digests.ts
packages/lanes/definitions` prints nothing (run). The pins test passed
in the gate, and alone (`npx vitest run --project lanes`, 3 tests, run).
The digests are `issue`
`sha256:325cb4f33da9deb1a31d85ba0f1456068d4d9d08009978b779aed70cb08e00ad`
and `change`
`sha256:4ff0c7f681c664a3c2dae22bd0df4a9a1bb239e19bc185db41f7f140d4dfca45`.
That test also shows both pinned definitions with the same bytes,
digest, reservations and static sizes at a list bound of 32 and of 64.

**Existing entries.** Each section of the deltas note says that no entry
that an earlier source wrote has other bytes. I took that from the note.
**No stored history was derived again**, by the workers or by me. The
witness is that the earlier tests pass. One form changes for an entry
kind that existed at F:

- Every `outcome` entry now holds `owner` and `kind` in its input (entry
  EL1). The deltas note says that no stored history holds an outcome
  entry. That is a statement about this repository's tests and not
  about any deployment, and none exists (section 2).

**State digests.** The deltas note says that no state digest of a state
without the new records changes (sections 14 and 19). I did not
recompute one. The fold gains the head of each subject of `observed`,
which is absent when no rule read one.

**Platform data.** The data of `platform:membership@1`,
`platform:register@1` and `platform:directory@1` changed with the
rows-19 work, so each has another definition digest than it had earlier
on this branch. A platform definition is pinned by name and version, and
no file pins a digest of one. No scope under any of the three was
written by a deployed source.

**New forms**, for anyone who reads or writes these bytes:

| Form | Where | From |
|---|---|---|
| The retained kind `value`, with its member `domain` | `RetainedInput`, `contract/src/read.ts` | Row I3-33 |
| The retained kind `snapshot`; the domain `artroom-snapshot-1` | The same; `bytes/src/domains.ts` | Entry EL7 |
| The member `value: { domain, max }` of a field of type `digest`, in platform data | `contract/src/platform.ts` | Row I3-32 |
| `always` on a send mark; several marks in one list of sends | `SendMark` | Row I3-34 |
| The bound on a list, `listElements`, is 64. It was 32 | `PROPOSED_BOUNDS` | Row I3-31 |
| The bound `derivedEffects`, 256, a temporary value | `Bounds` | Entry EL8 |
| `observed` on an act, an outcome and a delivery of a result; `values` beside an intent | `contract/src/{entry,observation,transport}.ts` | Step 8a |
| `owner` and `kind` in an outcome's input | `contract/src/entry.ts` | Entry EL1 |
| The record `token` of `git-read@1`, with the kinds `mint` and `revoke`; the step `job-read` and its intent | `contract/src/capability.ts` | Entries EW1 and EW4 |
| The kinds `delete` and `deletion` of `hold@1`; the values `retirement` and `deletion` | `derive/src/capability/hold.ts` | Entry EL6 |
| The refusal `entry-too-large`. The read refusals `sessions-unavailable` and `clock-behind`. The unavailable reason `rate-limited`. The Git reasons `bad-path` and `path-conflict`. The refusal names `bad-handle`, `configuration-mismatch` and `not-a-checker` of platform rules | `contract/src/result.ts`; `git/src/names.ts`; the platform package | The deltas note, sections 14, 17, 21, 22 and 24 |
| The session forms: claims of seven members, the token `ars1.`, the tags `artroom-session-1` and `artroom-session-request-1`, `SessionRequest`, `SessionRefusal`, the header `Authorization: Session` | `contract/src/session.ts`; `bytes/src/session.ts` | Entries ES1 to ES3 |
| The reasons of a `check-error`: four of the note and eight of this source | `checkers/src/outcome.ts` | Entry EW14 |
| No act kind and no message name may begin `platform:` or have the form of a step kind | The validator | Entry EL2 |

**New members of code interfaces**, which change no bytes:
`Ports.diagnoses`, `Outside.judged`, `OperationRules.ready`,
`RuleGiven.placed`, more arguments of `retries`, and an optional
`domain` of `HistorySource.retained`. The deltas note, section 22,
"Lines for the merge", says what a caller must change.

**One behaviour changes for existing forms.** A scope that runs the code
of `hold@1` with a port that sends a staging now holds the request of a
staging's attempt until that attempt's tokens are `live` (entry ET7).

## 6. Security

**A read session is a credential.** What it binds: the deployment's
name; the membership scope with its incarnation; the member and the
device key; the reads of the member's role at issue; an end time. It is
verified by HMAC-SHA-256 under the deployment's session secret, over the
claim bytes as presented, in constant time, before the claims are
parsed. A scope accepts one only for the membership scope that the scope
itself records. No call is made at a read.

**Its revocation window.** Nothing is checked against membership at a
read. A session that was issued is accepted until its end: at most 600
seconds on membership's clock, plus the difference between that clock
and the reading scope's clock. So a revoked key, or a removed member,
reads for up to that long. No new session is issued to that key. A
changed role takes effect at the next session. Replacing the secret ends
every session at once. The two clocks are one scripted clock in the
tests: nothing is shown about two real clocks (assumption H6).

**Controls run for this note.** The step recorded none, so I ran three
on `scope/src/sessions.ts`, each once with `scripts/control.mjs` against
`sessions.test.ts`. Each distinguished, by an assertion. The MAC
comparison removed: both tests fail. The comparison of the membership
reference removed: T15 fails. The end-time comparison removed: T15
fails. The file was restored each time, and the worktree was clean
before the gate.

**What fails closed.**

- No secret bound, or one shorter than 32 bytes: no session is issued
  and none is accepted. This is the state of the repository's own
  configuration: no file binds a secret.
- A reader with no session: `forbidden` from every read, and no stream.
- A scope that records no membership reference accepts no session: the
  register, and for now the rules scope and the destination.
- A version with a mark and no rule runs nothing.
- An act at a rules scope or a destination that needs a grant:
  `authority-unavailable`.
- A token's reply that cannot be read is no answer: the attempt is
  `unknown`.
- Bytes that are no configuration: `check-error`, and nothing runs.
- A link that a change creates outside the tree: refused.

**What does not fail closed, or is open.**

- **A `live` read token of a job is never revoked by an entry** (entry
  EW7). The authority note gives the revocation to the entry that
  decides the job, and no form lets that entry open it. The token ends
  by its own end time at the host. Its record stays `live`, and the lane
  keeps 6 entries reserved for it for good. A token whose host end time
  is not earlier than the job's deadline is never made `live`: it is
  revoked at once (entry EW6). No host exists to give an end time.
- A token that the host minted and whose reply could not be read may be
  live at the host with no ledger that holds its ID. Nothing revokes it
  (entry ET5).
- A `live` token whose plaintext nobody holds stays `live`, and is not
  revoked on that account (entry ET3).
- The address of a join is the header `CF-Connecting-IP`. Where a caller
  can set it, a caller escapes its own limit and can spend another
  address's window (entry ES11). That no caller can is Cloudflare's
  property, and is not shown here.
- A captured session request that was never answered is good until its
  `notAfter`, at most 900 seconds (entry ES2).
- An invitation's secret in a URL is not always refused: it has no form
  to know it by (entry ES14).
- `ScopeObject.wiring` can be called by a holder of the namespace
  binding. Not tested (entry ES16).
- That a client's disconnect releases a stream on the real platform is
  not shown. No deployment was made (entry ES7).

**Custody of a token's plaintext.** It is in the host's reply, then in
one private map of `TokenDriver` until the scope's driver calls `judged`
for that attempt. It goes to `Custody`, the gateway's side, only when
the sealed outcome entry made that token `live` with the reply's ID. In
every other case it is dropped. It is in no answer, entry, read, log
line or thrown error (`git/test/host.test.ts`, first test; five controls
in the host review). **No production `Custody` exists**: in tests it is
`Vault`, a stand-in. No job, notice or run input holds a token.

**The redaction witness.** T14, `scope/test/redaction.test.ts`: a
provider's error that holds a token, a URL query, userinfo and a bearer
value is thrown at two outside calls, and no entry, read, answer,
diagnosis or log line holds a credential or the provider's text. A
diagnosis has three members of fixed words, and reads nothing of a
thrown value but a name of a fixed list. No rule of the redactor names a
host's token format: a token is caught by syntax only (entry ET11). The
host, the gateway's side and the sender are stand-ins.

**The gateway follows no redirect.** This is a change to a file of step
21, `packages/git/src/gateway.ts`, which milestone F delivered: one
statement with its comment, in commit `35f978143` (3 lines added and 1
removed). The fault it closes: the gateway built its
forwarded request with the default mode, which follows a redirect, so a
host's redirect could carry the credential to another path or another
host, outside the grant. The fault was in F's gateway for every grant,
and in the parked sandbox (the checkers review, fault G4). The request
is now built with `redirect: "manual"`, and a redirect is returned to
the Git client. Witness: `checkers/test/runner.test.ts`, the gateway
test, which reads the mode of each request that reached the host.
Control: the default mode. It distinguishes.

**The join limits.** At the front of the membership scope's object,
before its core. A failed join is counted after its signature check, by
address, and never against an invitation. Proposed numbers: a window of
60 seconds, 10 failures for one address, 4,096 windows, 8 waiting joins,
16 KiB for a join's signed intent. An IPv6 address is keyed by its first
64 bits. A full table drops its oldest window and locks nobody out.
Nothing is stored: a restart forgets every window. An invitation's
secret must have at least 32 bytes. Witness: T39. The numbers are the
proof plan's to measure.

**The checker sandbox boundary, as stated.** `checkers/src/sandbox.ts`
states it: one job, one container, started from the image and destroyed
after the job; no second job in a container; no network but the job's
own repository, through a gateway whose grant only reads; no package
registry; the signing key never enters the runner; no job, notice or run
input holds a token; the image is the content digest that the container
platform reported for that start.

What is shown: the gateway forwards two read requests of the granted
repository, by their whole path, and nothing else, with a stand-in host
(`runner.test.ts`); the service signs a pass only for the image and the
variables that the configuration names (`service.test.ts`, on stand-ins).

**What is unproven without a runner: every property of the container
itself.** That a container has no other network, that it is destroyed,
that it runs one job, that the key is out of its reach, and that the
reported image digest is the platform's and not the runner's own. No
runner, no container and no deployment exists, so none of these was
run. `ScriptedRunner` returns a stated end and runs nothing.

## 7. The lockfile

One commit changes `package-lock.json`: `97021d46a`, with 21 lines
added and none removed. It adds the workspace link of
`packages/checkers` and that package's own block. `package.json` at the
root is unchanged against F (`git diff 2ad870f3b HEAD -- package.json`,
empty, run).

How to verify:

```
git show --stat 97021d46a
git show 97021d46a -- package-lock.json
git diff 2ad870f3b HEAD -- package-lock.json | grep -c '^+.*"integrity"'
```

**One correction to how this was described to me.** The commission says
that no `resolved` or `integrity` line was added. No `integrity` line
was added (the third command prints 0). One `resolved` line was added:
`"resolved": "packages/checkers"`, beside `"link": true`. It is the
local path of the workspace link, as every workspace package has one. It
names no registry and no URL. The package's block lists three workspace
packages, and `@types/node` 26.6.3 and `vitest` 4.1.11, which the
lockfile already pinned. The commit message says that the entry was made
with `npm install --package-lock-only --offline`. I did not repeat that.

The gate's install step was skipped in my run: the installed modules
were already from this lockfile.

## 8. Removal

Deleted from `parked/` since F: 42 files (`git diff --name-only
--diff-filter=D 2ad870f3b...HEAD`, counted). No file moved as it was.
Each removal followed a written review.

| Step | Removed | Files | The review that preceded it |
|---|---|---|---|
| 15 | `room/src/requests.ts`, `room/src/ratelimit.ts` | 2 | `notes/2026-10-05-i3-limits-review.md` |
| 19, 20 | `git/src/mints.ts`, `room/src/artifacts.ts`, `room/src/diag.ts` | 3 | `notes/2026-10-05-i3-host-review.md` |
| 24 | `checkers/src/snapshot-commit.ts`, `room/src/snapshot.ts`, `git/src/snapshot/repos.ts` | 3 | `notes/2026-10-05-i3-snapshot-review.md` |
| 25 | `checkers/`, less its retained paths (32 files); `room/src/jobs.ts`; `contract/src/checker.ts` | 34 | `notes/2026-10-05-i3-checkers-review.md` |

The parked tests of the removed files stay, unrun, and still import
them. Step 31 reconciles the directory.

**The retained paths** (the plan's section 6.2). Present at the head, by
`test -e`: `parked/room/wrangler.spike.jsonc`,
`parked/checkers/wrangler.spike.jsonc`, `parked/room/scripts/`,
`parked/room/src/mcp.ts`, `.github/workflows/row-writes.yml`, and the
three `measure/` directories. The counts of `parked/README.md` match
`git ls-files` for the three packages it changed: `room` 103, `git` 55,
`checkers` 10 (counted).

**The active-source check passed.** `scripts/active-source.test.mjs` ran
in the gate, in Node's runner: 6 tests passed. It checks that no active
file imports from `parked/` or names a removed format, that no platform
package depends on the lanes package, and what the checkers package may
name. One test file of the lanes package reaches the checkers package by
path, and the check allows that one (entry EW11).

## 9. Open questions, by owner

The deltas note, sections 14 to 25, holds 157 entries (EL 9, EM 26, EP
17, EQ 11, ER 13, EU 7, ET 12, ES 16, EX 10, EV 17, EW 19). Section 13,
the entries EN, is milestone F's. Four entries are closed whole by
section 22 (EM6, EM7, EM8, EM10) and are left out. The counts below are
by a script over the last cell of each of the other 153 rows, which
matches the owner's name. An entry that names two owners is counted
under both, so the counts sum to more than 153. An entry that asks an
owner only to confirm is counted like any other. The script is not in
the repository.

| Owner | Entries that name it | Sections of the deltas note |
|---|---|---|
| The authority note | 95 | 14 to 25 |
| The builder, or the I3 delivery | 45 | 14 to 25 |
| The scope contract | 39 | 14 to 19, 21 to 25 |
| The proof plan (R4), with request `cc570904` | 27 | 14 to 18, 20 to 25 |
| The lane design (R2) | 11 | 16, 17, 18, 23, 24, 25 |
| The installation design (N5) | 11 | 20, 21, 23, 24 |
| IA | 8 | 15, 16, 21, 23 |
| I5 | 3 | 21 |
| The planner | 2 | 23 (EV7 and EV9; parts (a) and (c) of EV7 are decided since) |
| The platform document | 1 | 21 |

**The few that block the most:**

1. **EJ1** (the deltas note, section 11, which is milestone F's; the
   scope contract, with the authority note): where the clauses of a request
   that an outcome entry sends are, and the cause of a scope it creates.
   It gates the register's one missing rule, steps 9c and 10, every
   founding and the plan's M1.
2. **ER6, with ER5 and ER7 to ER9** (the authority note, with the scope
   contract): an operation of the destination names no publication,
   token or commit. No outcome rule of the destination can be written
   until it does. That is all of step 9f, and with it steps 26 to 28.
3. **EX4, with EP6 and EP7** (the authority note's next revision): the
   rows of the directory's two send marks and of `import-spent`. Without
   them no directory is created.
4. **EM1, EM2 and EX6** (the scope contract with the authority note,
   then the builder): the form by which a version states the places of
   an act that name a value and the subjects that an entry observes.
   Until the fields are stated and the runtime reads them, the three
   marked acts of the rules scope cannot complete on a real scope.
5. **EU2** (the scope contract with the authority note, then the
   builder): from where a verifier reads a commit. Until then every lane
   history with a check entry replays as `incomplete`.
6. **EW7** (the scope contract, or R2): a form by which the entry that
   decides a job opens the revocation of its read token.
7. **EV1 to EV3** (the authority note's next revision): the three forms
   without which no rules content holds an extent and nothing calls the
   judgments.
8. **Plan question Q8**, a deployment, and Q6, the host: without them
   there is no runner, no host adapter and no `Custody`.

## 10. The gate and the cost of the tests

**One run of `npm run gate`**, at commit `bf584e0c1`, tree
`4140980c95ccf7f136e34b0d12f5857b7f80594e`, as printed: install
skipped; whitespace 0.0 s elapsed; typecheck 3.5 s elapsed and 9.0 s
CPU; test 11.8 s elapsed and 26.5 s CPU. It printed 497 tests passed in
vitest and 6 in Node's runner. The whole command took 15.7 s elapsed
(the shell's `time`).

It is one observed run, on a shared machine with other sessions active
(Apple silicon; load averages 4.98, 6.02 and 5.82 just before it and
5.12, 6.00 and 5.82 just after), with a warm package cache.

**Counts**, by `npx vitest list --json` at the same commit, counted by
script: 497 tests in 67 files.

| Project | Files | Tests |
|---|---|---|
| `bytes` | 2 | 17 |
| `derive` | 21 | 231 |
| `platform` | 7 | 92 |
| `git` | 5 | 12 |
| `checkers` | 2 | 10 |
| `replay` | 2 | 43 |
| `client` | 2 | 10 |
| `lanes` | 1 | 3 |
| `scope`, with the eleven lane scenarios in seven files | 25 | 79 |

**Against milestone F, as two observed runs.** F's last gated run
printed 341 tests in vitest and 5 in Node's runner, with the test step
at 9.2 s elapsed and 16.6 s CPU (the foundation delivery note, section
12). This run has 156 more vitest tests, and its test step took 2.6 s
longer elapsed and 9.9 s more CPU. The two runs were made at different
times and under different load. This compares two observations and is
not controlled.

**No saving is claimed.** The test run grew. The cost of one edit taken
to review, from a cold install, is not measured here. I did not time
any project alone, and I ran no suite a second time. Beside the gate I
ran one collection (`vitest list`), the pins test alone (3 tests, 0.3
s), and the three controls of section 6, each of which runs one test
file twice.

**The commits after the gated one change notes only.** The gated commit
is the merge `bf584e0c1`. `git rev-parse <commit>:packages` is
`434f4a7e5ad735dfcdec056a6264da21cc9bd2f1` at the gated commit and at
the head that adds this note. The source and the tests are unchanged
between them.

The merge `bf584e0c1` itself brought one notes commit of F
(`2ad870f3b`, section 13 of the foundation delivery note) and no source.
`origin/main` is at `b2b62d260`, where it was at the last merge, so
nothing of it was merged again.

## 11. How each figure was taken

| Figure | How taken |
|---|---|
| The gate's times and its two test counts | Observed, one run, printed by the gate |
| 15.7 s for the whole gate | Observed, the shell's `time` on that run |
| Tests and files by project | Count by script over `vitest list --json`, one collection |
| Tests of one file, in section 3 | The same count |
| 214, 172 and 42 files against F; 42 deleted; 274, 219 and 55 against `origin/main` | Count by `git diff --name-only`, with `wc -l` |
| Controls by step, and their sum of 58 | By reading the commit messages, the deltas note and three review notes. Summed by hand. Not a count by script |
| The three controls of section 6 | Observed, each run once |
| Open questions by owner | Count by script over the deltas tables' last cells |
| The 21 seams | Count by `grep -rn "I3 merge:" packages --exclude-dir=node_modules` |
| Files that name a revision | Count by `git grep -l` under `packages/` |
| The comparison with F | Two observed runs, at different times and loads |
| The ports table, the runnable table | By reading the source, and the assertions of the tests named |
| That no entry's bytes and no state digest change | Taken from the deltas note. Not recomputed |

## 12. Limits of this note

**One delegated author wrote it, in one session, and built none of the
source.** Other workers built the steps, each on a branch of its own.
A worker before me merged them, corrected the guides and headers, and
wrote the plan's section 2.2. That worker was stopped part-way. I found
its 18 commits complete, with nothing half done in the extents change
(section 3). It left a log of a gate run, which I did not read as
evidence and do not cite.

**What I verified by command:** the merge and that it brought notes
only; the gate, once; the pins test; that the lane sources and their
definitions are identical to `origin/main`; the lockfile commit, line by
line; the deleted paths and the retained paths; the counts of the parked
ledger; every count that section 11 calls a count; the `runnable`
assertions of the six platform definitions, by reading the tests; the
ports, by reading `ports.ts` and `worker.ts`; the six cases of the
planner's decision on links, by reading the test; three controls on the
session check.

**What I took from the deltas note and the review notes, and did not
check:** every statement of what a step built and did not build, beyond
the files and tests named; that no entry's bytes and no state digest
change; each recorded control; the comparisons of the revisions; the
content of each open question. I read sections 13 to 25 of the deltas
note once, and the four review notes in part. I read no test body but
those named above, and no source file in full.

**What nobody did:** read the four adopted designs for this note; derive
a stored history again; run anything on a deployment, a Git host, a
container or a real runner; run a control for the steps that record
none (7, 8, 9, 9a and 9d, 11, and the first commit of the extents).

Dated notes are history and are not edited. Where one disagrees with the
code at this head, the code is right. The plan's section 2.2 names
milestone F by its earlier head `783be9a07`; F's head is now
`2ad870f3b`, which differs by notes only.
