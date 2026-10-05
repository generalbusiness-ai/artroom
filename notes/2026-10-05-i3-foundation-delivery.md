# I3 milestone F, the foundation: authority forms, outside effects, the Git package and the marks of platform data

Request `bcf5ec17` (the I3 commission). Branch `request/i3-authority-effects`.
Written 2026-10-05, at head `7dc4e2ca7` before this note.

**This is a milestone of I3. It is not I3.** It is also not the plan's
milestone M1. M1 is six founded scopes. M1 waits on an owner's decision
(question EJ1) and on the steps for membership, the register and the
directory (section 3). No milestone is called I3, and the request stays
open. The planner has ruled that a coherent milestone may be reviewed and
land while the request is open (answer `bf020684`, Q9).

**Why a smaller first milestone.** The branch is already large: 144 files,
11,883 lines added and 3,316 removed against `origin/main`
(`git diff --stat origin/main...HEAD`, observed). The reviewer's
preparatory reviews (`52cad0fc`, `92fa170a`, `f55ad7d0`, `514b35a9`) found
five defects in the built code and errors of order in the plan. They are
cheaper to settle now than after more steps rest on them. All are repaired or
restated here (section 1, last table).

**What a running system gets from it today: nothing new runs in
production.** In `production()` (`packages/scope/src/ports.ts`), `authority`
reads no grant, so no act is current; `readers` lets nobody read;
`capabilities` is null, so no step of `hold@1` or `git-read@1` has code;
`outside` is `NO_OUTSIDE`, which sends nothing, and `owners` is null, so no
outcome is judged; `definitions.platform` supplies the platform package, which
holds one definition, `platform:inbox@1`.

Both lane definitions still answer `unsupported-definition`. The witness is
`packages/scope/test/founding.test.ts`, "a definition that needs a capability
record", which uses a made-up variant of a lane definition under production
wiring. For the two pinned values it follows from the capability forms they
list, which `packages/lanes/test/definitions.test.ts` asserts. It is not run
on the pinned values under production wiring.

**The one platform definition that can be founded under the production
wiring is the inbox.** What its test shows, exactly (`founding.test.ts`,
the test of `platform:inbox@1`): with every production default, a founding
that names it is accepted, and one entry, the genesis, is stored. Everything
after that runs in a test namespace with the test authority, a test clock
and a scripted peer for the sending lane (all stand-ins, section 8): an act
is judged, a `notify` writes a notice whose `source` the platform rule set,
a replay with the platform package's rules is consistent, a replay without
them is `unsupported-definition`, and a runtime that has lost the rule founds
nothing and admits nothing. It does not show a real grant, a real lane or a
deployed scope. Under production wiring no act is authorized, because no
grant is current.

## 1. What is built

Step numbers are those of the plan. Commands run from the repository root.
Test counts are from `npx vitest run --project <p> <file>`, observed once at
the head.

| Step | What | Files | Witness and command |
|---|---|---|---|
| 1 | Types: kind `register`; `Observation`, `ObservationUse`; evidence by basis; records `fork`, `token`, `instance`; steps `instance`, `token`, `retry`, `job-read`; the `preparation` input, which fails closed in the fold and the verifier | `contract/src/{scope,entry,capability,evidence,observation,result}.ts`; `bytes/src/{ids,records}.ts` | Typecheck, and `bytes` domains: `npx vitest run --project bytes domains` (9 tests) |
| 2 | The platform package, with `platform:inbox@1` as data; the validator's `{ platform: true }` option | `platform/src/*`; `derive/src/validate/index.ts` | `npx vitest run --project platform definitions` (1 test): the inbox validates whole with the option, is refused without it, and its marks are listed |
| 3 | The ports in two phases: a read before the turn, a decision in the commit. A platform definition is supplied with its rules; a scope with a rule missing is refused whole (EC4) | `scope/src/{ports,core,turn,testing}.ts`; `derive/src/{judge,capability}.ts` | `npx vitest run --project scope founding` (6) and `answers` (3); `--project derive judge` (47) |
| 4 | Operations and the unknown-duty ledger: an entry opens an operation, an attempt is marked durably before it is sent, a late answer adds one outcome | `derive/src/{ledger,settle,fold,reserve}.ts`; `scope/src/{operations,sqlite,store,reads}.ts` | `--project derive forms-ledger` (3); `--project scope operations` (5), T19 and T20; `--project replay verify` (22), the row for `unsupported-definition` at an outcome entry |
| 5 | The grant guard and the commit guards of an observation, as pure functions | `derive/src/grant.ts` | `--project derive forms-grant` (2), T45 |
| 6 | The observation read: the authority port over reads of membership | `scope/src/authority.ts`, `namespace.ts` | `--project scope authority` (4), T6 and T46 |
| 16a | Preparation: a step is asked with a signed intent and sealed as a `preparation` entry; route `POST /v1/scopes/:scope/preparations`; judged by the grant guard on the observation read | `derive/src/prepare.ts`; `scope/src/core.ts`; `client/src/prepare.ts` | `--project derive forms-prepare` (2); `--project scope routes` (2); `authority`, first test |
| 16b | The rules of `hold@1` over its records: `root`, `pin`, `check`, `receiver-pin`; the guards `staged`, `pin`, `license`, `settled`; workspace records when a judge is given the code | `derive/src/capability/hold.ts` | `--project derive forms-records` (4), T21, T22, T28 |
| 16c | The ancestry walk and the guard `ancestry` of `git-read@1` | `derive/src/capability/{ancestry,gitread}.ts` | `--project derive forms-ancestry` (2), T23 |
| 17 | The Git package, part one: names, program runner and object reader, after review | `git/src/{names,program,reader,node,index}.ts` | `npx vitest run --project git reader` (2), T16 and T17 |
| 21 | The Git package, part two: commands, push outcome, gateway | `git/src/{gitops,push-outcome,gateway}.ts` | `--project git push` (2), T9; `--project git gateway` (2), T27 |
| Marks | Rows I3-1 to I3-11 of the scope contract (below) | `contract/src/platform.ts`; `derive/src/{marks,outcomes}.ts` and the validator; `platform/src/{inbox,rules}.ts` | `--project derive forms-marks` (20); `--project platform definitions`; `--project derive forms-grant`; `--project scope founding` and `authority` |

**Steps 17 and 21: the written review.** `notes/2026-10-05-i3-git-review.md`
reads the parked Git code before anything moved. No file moved as it was. It
lists 11 faults in the reader, 8 in the commands, 6 in the push outcome and 8
in the gateway (counted from its tables). Two matter most: the parked push
checked nothing about the commit it sent (type, parents, closure), and the
parked gateway kept no record of a forward. The new code checks all of that
before it sends, and refuses SHA-256 object IDs by name.

**The marks, rows I3-1 to I3-11** (commits `f4ec55017` to `57d79f478`). A
platform definition's data may hold a mark, `{ code, row }`, where a rule runs.

| Row | What | Witness |
|---|---|---|
| I3-1 to I3-4 | Types of platform data; the validator reads a mark at seven places and lists it; marks are in the data and the table `CODE` is gone; a rule has the kind of its mark's place and is given six things | `forms-marks`, first test; `platform` definitions |
| I3-5 | The inbox writes no effect on `source`; its mark `notice-source` has its rule (P22) | `platform` definitions; `founding`, the inbox test |
| I3-6, I3-7 | The judges run a rule at the check of its mark's place, and a fault writes nothing; a grant rule that passes records an empty authority | `forms-marks`, tests 2 to 4 |
| I3-8, I3-9 | A scope whose every rule is supplied runs every row, and one that lacks a rule runs nothing; the verifier runs the same rules | `founding`, the inbox test |
| I3-10, I3-11 | A grant's `within` is `{ membership }`; the fold holds the highest head for each subject | `forms-grant`, the `within` rows; `authority`, the order of heads across a restart |

**The repairs of the reviewer's five preparatory findings.** Each has its
witness and its control (one change to the source, run with
`scripts/control.mjs`; counts by hand from the commit messages).

| Finding | Repair | Witness | Controls |
|---|---|---|---|
| `92fa170a` 1: parked attempts stranded after a restart | A walk with an advancing cursor, a wake while pages remain (`8aaa17973`, EK1) | `operations`, "after a restart the driver walks" | End after one page: distinguishes. Cursor that does not advance: distinguishes |
| `92fa170a` 2: a late answer lost while the turn is unavailable | One answer kept in hand for each sent attempt, offered again each pass (`481f440f9`, EK2) | `operations`, "a late answer that arrives while the scope's turn is unavailable" | Not keeping it: distinguishes. Not offering it again: distinguishes. Removing the driver's own wake: **survives** (the unavailable turn asks for the same wake) |
| `92fa170a` 3: evidence with no body accepted | One guard of shape, `isEvidence`, used by the input guard, the ledger and the driver (`293ea8e7d`, EK3) | `forms-ledger`, a confirmed own answer with no body | The earlier object check in its place: distinguishes |
| `f55ad7d0` 1: a gateway grant had no lifecycle across overlapping calls | One phase for a grant, read again after every wait (`bbff23788`, EK4) | `git gateway`, "a grant has one lifecycle across calls that overlap" | No claim; no check after open's write; no check after the forwarding write: 3 distinguish. The test also fails on the earlier gateway |
| `f55ad7d0` 2: the ancestry check refused its own late answer | The rules of `check` take the basis `own-answer` (`c798917aa`, EK5) | `forms-records`, T21 | The earlier rule: distinguishes |

The reviewer's M1 sequencing finding (`514b35a9`) is a plan error. It is
repaired in the plan (`6fcc49ea0`): every pure rule of a version comes
before its real founding. Three wording points are in `3d06620be`.

## 2. The designs it implements

- The scope and replay contract, revision 16 at `54420b41`: adopted. This
  source implements through revision 15's rows I3-1 to I3-11. Revision 16's
  rows I3-12 to I3-16 are owed.
- The authority, effects and publication note, revision 21 at `f9ec25e4`:
  adopted. The source follows revisions 14 and 18, and revision 20 for the
  marks.

Both heads are given as the commission for this note states them. The design
notes are not in this tree. I did not read revision 16 or 21. The adoption is
of the designs and accepts no source.

**Not implemented from them:** revision 16's rows I3-12 to I3-16; the fence
of the authority note's section 6.8 (not adopted at revision 18; U2, Q12);
everything in section 3.

## 3. What does not run, and who it waits on

| Element | State | Waits on |
|---|---|---|
| Production capabilities (step 16) | Not built. The rules exist in `derive` and the port is null. Unblocked by the adoption of the capability silences EH6 to EH11 | The builder, next |
| Steps 8 and 8a (fourth cause; `observed` and values beside an intent), 7 (membership), 9 (register, directory), 9a and 9d (rules scope), 9b, 9e and 9f (destination) | Not built. Only `platform:inbox@1` exists | The builder |
| The register's rule for the outcome of `create-repository` | Not written, and none is written in its place | EJ1: the scope contract, with the authority note |
| Founding complete and six founded scopes (9c, 10, plan M1) | Not built | EJ1, then steps 7 to 9f |
| Production authority and readers (12); sessions, limits, operator record (15) | Not built | The builder |
| Replay of grants (14); of preparations, outcomes and ancestry records (22) | The verifier takes each recorded grant as current (`replay/src/verify.ts`, read in the source). It answers `unsupported-definition` at a preparation or outcome entry | The builder |
| Steps 18 to 20 (workspace records and fence answer in production, host port, token driver, redaction), 24 and 25 (snapshot, checker service), 26 to 28 (destination attempts, publication), 29 to 32 (assembly) | Not built. `workspaceEffects` runs only when a judge is given the code | The builder; M3 and M4 need M1 and M2 |
| A real Git host, a real runner, device evidence | Not run. HS1 to HS7, H1, H2, H5, H6 and the checker on a real runner are unproved | Separate commissions. This milestone launches none (answer `bf020684`, Q8) |
| Capacity beyond entries and records (items, bytes, pending requests) | Entries only, and records for `hold@1`. Evidence from these counts is labelled partial | Request `cc570904` |
| The rules definition with extents | Not built | Request `42de9e34` |
| Task definition and agent runtime; browser, command line, tool server and cross-device acceptance; old deployments' resources | Not in I3. Nothing of the old resources is touched, listed or settled | IA; I5 and I6; E1 |

**Open questions, with owners** (full text in the deltas note: section 11
for EJ, section 10 for EH).

| # | Question, in short | Owner |
|---|---|---|
| EJ1 | Where are the clauses of a request that an outcome entry sends, and what is the cause of a scope it creates? | Scope contract, with the authority note |
| EJ2 | Is a creation's member `membership` written by the change that adopts the filter? What does a directory record before its slot is set? | Builder; scope contract |
| EJ3 to EJ6 | A result clause and a mark: does it run a rule again (EJ3); how is it found in a list that holds a mark (EJ4); may a mark be nested or have a default (EJ5); do static counts take the most a rule returns (EJ6, with `cc570904`) | Scope contract |
| EJ7 | Are `at`, `self` and a diagnosis given to a rule? What of `observed` and values? | Builder; scope contract |
| EJ8 to EJ10 | The form of a rule's place, refusals, most and clock (EJ8, authority note); is the sending scope's kind in a notice's `source` (EJ9, authority note); should the commit stop a rule that sets a fixed slot (EJ10, scope contract) | As stated |
| EJ11, EJ13 | Is an effect of an outcome's rule that a check would refuse a fault; if a grant rule passes with a member, where does a later entry read it? (EJ12 is closed: revision 15 states the reason.) | Scope contract |
| EJ14, EJ15 | The replay still takes each grant as current; the subject of an observation of the rules | Builder, steps 14, 22 and 9d |
| EH6 to EH11 | How a step reads its intent; which pin `commit` alone releases; how `ancestry` finds a selected input; the kind of a check entry; the bound on tokens of one hold; which entries make a staging's tokens, a root `retiring` and a fork `deleting` | Answered by the adopted designs, as the commission states. **The source has not yet been changed to follow them.** I did not read the adopted texts |

## 4. Bytes and digests

For anyone who holds data written by earlier source on this line:

- The effect `operation` has a new shape: `{ k, owner, kind, attempts }`.
  The earlier shape was `{ operation, attempt }`. A second effect, `attempt`,
  is new. An operation's ID is now `seq:k`, where it was `op_...`. The
  deltas entry EB1 says no earlier entry holds either effect. I did not
  check that against any stored history.
- The input `preparation` is new.
- An `outcome` input's `evidence` must now be `{ basis, body }`, both own
  members. Evidence with no body is refused (EK3).
- The scope kind and the platform name `register` are new. The refusal
  reason `unsupported-definition` is now one an act can meet.
- A grant's `fresh` is an `ObservationUse`, and its `within` may be a
  filter, `{ membership }`.
- The folded state has three new optional members, `prepared`, `records`
  and `observed`. Each is absent when empty. The commit messages state that
  a state with none has the digest it had. The witness is that the existing
  tests pass unchanged. I did not recompute a digest of an old history.

**Both lane digests are unchanged.** `packages/lanes/src` and
`packages/lanes/definitions` have no change against `origin/main`, and
`digests.ts` is byte for byte the same (checked by `diff`). The pins test
passed in the gate. They are
`issue` `sha256:325cb4f33da9deb1a31d85ba0f1456068d4d9d08009978b779aed70cb08e00ad`
and `change` `sha256:4ff0c7f681c664a3c2dae22bd0df4a9a1bb239e19bc185db41f7f140d4dfca45`.

**No deployed scope exists under this source.** This is a search of the
repository's tracked files, and not proof that nothing is deployed anywhere.
Outside `parked/`, the deploy configurations are `packages/scope/wrangler.jsonc`
(its comment says nothing in the repository deploys it), two test-pool
configurations (`packages/scope/wrangler.test.jsonc` and
`packages/lanes/wrangler.test.jsonc`) and three under `spikes/`. The spikes
build from `vendor/` copies that a setup script takes from pinned earlier
revisions, and which Git ignores, so they name no package of this workspace.
`.github/workflows/row-writes.yml` probes a spike by HTTP and builds nothing.
`packages/scope` imports `platform`. No package imports `git`.

## 5. Removal

Deleted from `parked/` in this milestone (13 files, `git diff --name-status`):

- `parked/log/`, whole: 7 files. Successor: `packages/git`.
- Six files of `parked/git/src/publisher/`: `gitops.ts`, `push-outcome.ts`,
  `ref-fence.ts`, `client.ts`, `container.ts`, `git-publisher.ts`.
  Successor: `packages/git`.

**Retained-paths check** (the plan's section 6.2). Present at the head, by
`test -e`: `parked/room/wrangler.spike.jsonc`,
`parked/checkers/wrangler.spike.jsonc`, `parked/room/scripts/`,
`parked/room/src/mcp.ts`, `.github/workflows/row-writes.yml`, and the three
`measure/` directories (`checkers`, `git`, `room`). No deleted path is on the
list. `parked/git/src/publisher/log-push.ts` stays for step 27.
File counts in `parked/README.md` match `git ls-files` (checked).

Still parked, and for which step: `room` (10, 13, 15, 19, 31; `mcp.ts` to I5;
`measure/` to I4; the spike files to E1); `policy` (13); `contract` (25, 28);
the rest of `git`: landing (28), workspaces and fork tokens (18), mint ledger
and `artifacts.ts` (19), snapshot (24), `log-push.ts` (27); `checkers` (25,
less `measure/` and the spike configuration); `mcp`, `cli`, `ui` (I5);
`release` (I6).

## 6. Evidence

Test files added or strengthened, and the invariant each proves (from the
test names):

| File | Invariant |
|---|---|
| `derive/test/forms-grant.test.ts` | The window and its edge, whose answer it is, a revocation, a reuse, the order of heads; the window is the definition's; `within` and the answer's form |
| `derive/test/forms-ledger.test.ts` | A late answer adds one outcome and rewrites none; only an attempt's own answer settles an unknown; an operation opens at most its stated attempts and reserves the room of every outcome; evidence needs a body. Holds the outcome test moved from `compose.test.ts`, with its cases |
| `derive/test/forms-prepare.test.ts` | A step is one entry with the intent, the one grant, the capability and the step; each refusal in the order of an act's checks |
| `derive/test/forms-records.test.ts` | Staging is sealed before any outside write; a pin ends in one state in both orders; a license is decided once; the check takes its own late answer |
| `derive/test/forms-ancestry.test.ts` | The start is never a stop; an own ref never hides a foreign one; published history is never listed; the guard |
| `derive/test/forms-marks.test.ts` | A mark is accepted at seven places and nowhere else; a rule runs at its place's check; a grant mark stands in place of the grant check; a fault of a rule writes nothing |
| `git/test/reader.test.ts` | An object counts only when bytes, ID, type and size agree; parents, tree and modes are checked; a closure is complete object by object |
| `git/test/{push,gateway}.test.ts` | A send is not sent, refused or unknown by the gateway's record and Git's report; a lost reply stays unknown; one compare-and-set, sent once; one grant forwards once, records "forwarding" first, leaks no credential, and has one lifecycle across overlapping calls |
| `platform/test/definitions.test.ts` | The inbox validates whole with the option, is refused without it, and its marks are listed |
| `scope/test/authority.test.ts` | Admission inside a window and reuse; heads ordered across a restart; a revocation takes effect at once; the clock table |
| `scope/test/operations.test.ts` | T19: record before send, send at most once, `unknown` not settled by a restart or time; T20: an idle ledger writes nothing; late answer kept; restart walk; a definition the runtime cannot run sends nothing |
| `scope/test/founding.test.ts` (strengthened) | The inbox: founded under production, runs under a test namespace, replay both ways, lost rule admits nothing |
| `scope/test/{answers,routes}.test.ts`, `replay/test/verify.test.ts` (strengthened) | No read leaves an act not judged; one route for a step; a preparation or outcome entry is `unsupported-definition` in a verifier without rules, never `consistent` |
| `bytes/test/domains.test.ts`, `client/test/intent.test.ts`, `derive/test/{judge,forms-capability}.test.ts`, `contract/test/shapes.ts`, `scripts/active-source.test.mjs` | The operation ID form; the reason an act may meet; the no-read case; the record kept by the fold; the types; what the two new packages may name |

**Controls run** (counted by hand from the commit messages; each used
`scripts/control.mjs`; "distinguishes" means a test failed by an assertion):
50 distinguished, 1 survived, none inconclusive. By step: step 2, 1; step 3, 2
and 2 more with the whole-scope rule; step 4, 3 and 3 more at the merge;
step 5, 2; step 6, 2; step 16a, 1; 16b, 4; 16c, 5; the workspace and the
license seams, 1 each; step 17, 4; step 21, 5; the marks I3-6, I3-7, I3-8,
I3-10 and I3-11, 1 each; the five repairs, 9. Rows I3-1 to I3-5 and I3-9
state no control. **Survived:** removing the driver's own wake (EK2): the
unavailable turn asks for the same wake, so the test cannot tell them apart.
`git/test/gateway`: no change makes a closed grant forward twice, because
three checks each stop it alone, so none was run (the review's section 7).

**Not witnessed** (collected from the deltas note, the review and the commit
messages):

- Real grants or membership; a real hold, staging or fork; a Git host, its
  answers (H1, H2) and its words when a connection fails; a real runner.
- Which attempt a read confirms beyond the stated rule (EG6, O11); a fence
  that settles an attempt (EB3); a token's end time as an outcome (EB4), but
  as the pure function `tokenPast`.
- Capacity in items, bytes and pending requests; static counts of a rule's
  most (EJ6); a staging's tokens, a root `retiring` and a fork `deleting`
  (EF14, EH11): not derived and not reserved.
- `heldOpenings` in the judge of a confirmation (EB12).
- Replay of grants, of `observation-older`, of a filter-covered act, of
  preparations and outcomes (EC3, EJ2, EJ14; steps 14 and 22). The
  reachability of an ancestry record is not judged in the commit (EF10, EH8).
  `run-returned` (ED9). The clock rows of a delivery, an outcome, a stream and
  a token (ED17).
- Three rows of the interrupted-transfer table (parts and appends): no path
  in I3, no test (EG2). The gateway's record has no production store (EG10,
  EK4). An answer in hand that a process loses leaves the attempt `unknown`
  (EK2).

## 7. Cost

All figures are observed at the head, on one shared machine (Apple silicon,
other sessions active; one-minute load 2.6 to 4.3 across these runs), with a
warm package cache. Install was skipped by the gate (the lock file matched the
last install), so there is no install figure.

One run of `npm run gate`, as printed: install skipped; whitespace 0.0 s
elapsed; typecheck 2.7 s elapsed and 7.3 s CPU; test 7.8 s elapsed and 16.3 s
CPU. It printed 337 tests passed in vitest (50 files) and 5 in Node's runner.

`npx vitest run`, three runs, duration printed: 6.74 s, 6.78 s, 6.69 s (all
337 passed). The same run without the `git` project, three runs: 5.41 s,
5.26 s, 5.20 s (331 tests).

By project, `npx vitest run --project <name>`, one run each, duration printed:

| Project | Files | Tests | Duration |
|---|---|---|---|
| `derive` | 21 | 209 | 0.55 s |
| `scope` | 18 | 64 | 4.23 s |
| `git` | 3 | 6 | 1.98 s |
| `platform` | 1 | 1 | 0.17 s |

**Main's figures.** `/Users/hughpyle/play/artroom-worktrees/land-main` is not
at `origin/main` (it is at `c373f078c`, and `origin/main` is `872d2537c`),
so I did not run main there. The last recorded figure is in `vitest.config.ts`
and commit `22157a0d4`: the whole vitest run about 4.5 s (observed on an
earlier occasion, three runs, a shared machine). The plan's gate at
`50bba45c` printed 282 tests in vitest and 3 in Node's runner. `origin/main`
has 38 test files and this branch has 50 (counted with `git ls-tree`).

**The test run grew with this milestone.** Against the recorded 4.5 s, the
whole run is about 2.2 s longer (6.7 s). The two figures were taken on
different days and under different load, so this compares observations and is
not controlled. Vitest tests went from 282 (at the branch's cut) to 337, which
is 55 more. The `scope` project takes 4.2 s of the run and runs alone after the
Node group. The `git` project adds about 1.4 s (6.7 s with it, 5.3 s without,
both observed). It runs real processes: a send runs about fifteen. `derive`
and `platform` are small. **No saving is claimed.** The cost of one edit taken
to review, from a cold install, is not measured here.

## 8. Stand-ins

Each stand-in proves only the boundary it exposes.

| Stand-in | Where | What it does not prove |
|---|---|---|
| The test authority; the scripted membership, `Controls.membership` | `scope/src/testing.ts` | That a grant is current by any real read, or that a membership scope answered. The first calls presented grants current. No history stands behind the second's head |
| The scripted capability and the scripted step | the same | A real hold, a Git read or a provider. A step it scripts names an action and a window and derives nothing |
| `codeLost` | the same | Any rule. It supplies each platform definition with its data and no rule, and stands for a runtime that lacks the rules |
| Scripted peers, `net.peers` | the same | That the peer was judged. The test writes its entry by hand. The lane that sends the inbox's `notify` is one |
| The local Git client and server; a function for the host's endpoint | `git/test/support/host.ts`; `gateway.test.ts` | A host. The server is `git http-backend` over a local bare repository, behind the package's own gateway. It shows Git's compare-and-set and nothing about H1 or H2, a reply's form or a network failure |
| Test keys | `@generalbusiness/artroom-derive/testing` | A key made on a device and kept there |

## 9. What comes next in I3

In this order:

1. Step 16: wire the production capabilities, following the adopted answers
   to EH6 to EH11, and remove the scripted capability. Then step 22 (replay).
2. Steps 8, 8a, 7 and 9 to 9f: membership and the rules of the six versions.
   EJ1 gates step 9c, step 10 and six founded scopes: ask its two owners.
3. Steps 12, 14 and 15: production authority and readers, the grant in a
   replay, sessions, limits and the operator's record.
4. Steps 18 to 20, then M3 (24, 25), M4 (26 to 28) and the assembly (29 to
   32). Revision 16's rows I3-12 to I3-16, once their text is read.

## 10. Statements elsewhere that this milestone overtook

Dated notes are history and are not edited. Where one disagrees with the code
at this head, the code is right. In the deltas note: EA8 (the table `CODE` is
gone, I3-3); EC4 (the witness no longer uses `standInPlatform`, and the
production wiring now founds the inbox, I3-5); EC6 (judges run a rule since
I3-6 and I3-8); ED2 and ED7 (a filter has a form, I3-10); ED12 (the commit
finds a lower head after a restart, I3-11). **ED9 and ED12 also say "a replay
finds it". It does not: the verifier takes each grant as current (EJ14).** In
the plan: section 2.1 marks step 16 "Waiting", and its M1 row lists acts that
need steps 7 to 9f. This note supersedes both.

**Guides corrected in this commit.** `docs/scopes.md`: the package count and
table (adds `platform` and `git`; `scope` imports `platform`), the `outcome`
input and publication rows (a preparation opens operations under a
capability's code), the platform row (revisions 15 and 20 are adopted), the
hold-token row. `docs/lanes.md`, `docs/lanes-reference.md` and
`packages/lanes/README.md`: "no runtime has that code" now says `derive` holds
it and no production port is given it (the reference is written by
`packages/lanes/scripts/reference.mjs`, which was changed and run).
`docs/testing.md`: the project list adds `platform` and `git`, and says the
Node projects run as one group before `scope`. `packages/contract/README.md`:
only `Commitment.cancelBy` is still `unknown`; `observation` and `evidence`
are listed. `packages/git` and `packages/platform` have no README.

## 11. After review fe34edbe: the repairs

Written 2026-10-05. The reviewer's verdict `fe34edbe`, at `5635689ee`, asked
for changes: two findings, and two points of reporting. Both findings are
borne out by the source. The repairs were made with the contract's revision
16 and the authority note's revision 21 as the adopted designs. Each source
choice is an entry EN of the deltas note, section 13.

**Finding 1: one answer in hand could hold back every other** (`dfacf6596`,
EN1). The driver offered the answers in hand oldest first and stopped at the
first that the scope could not write. A scope answers `unavailable` for a
busy turn, and also for a cause of one input: an owner with no rule, an
outcome that would open more than its owner declared, a fault of a rule. An
answer with such a cause was offered first in every pass, and none behind it
was ever offered. Now an answer that cannot be written goes to the back of
the line, as the same input of the same attempt, and the pass goes on to the
next. The cause is not asked, so no form carries it. **The fairness
property:** an answer with n others before it is offered within
floor(n / batch) + 1 passes, because none is ever put before it. **What
bounds the retries:** nothing bounds their number. No pass asks for a wake-up
at once on an answer's account. The next is after `drainRetrySeconds` on the
scope's clock, so an answer that fails again costs one turn in each
ceil(held / batch) delays, until it is judged or the process ends. Witness:
`scope/test/operations.test.ts`, "an answer in hand that stays unavailable",
with a batch of 1: two attempts closed on `unknown`, both late answers in
hand, the older one's owner at fault. The later answer is written at the
second pass. The older stays in hand, its operation stays a duty, and it is
written as it arrived once its owner declares the cleanup. Controls: the old
stop, and a line that does not turn. Both distinguish. With a batch of 1 the
two controls fail in the same way.

**Finding 2: a rule could change a fixed slot of an existing item**
(`493ce09c1`, EN2). A rule's effect on a fixed slot is now a fault of the
rule unless the item is the one that the entry opens. The input is not judged
and nothing is written. Witness: `derive/test/forms-marks.test.ts`, the row
"a fixed slot of an item that existed before the entry", and the entry in
which the same rule sets the hash of a ticket that it opens. Controls: the
guard removed, and the guard without its exception. Both distinguish.

**The sweep for finding 2's family** (`7da1185c0`, `0d132a8c1`; EN3 to EN8).
Each static check of the validator on a written effect or send was set
against what the commit checks of a rule's output. The whole table is in the
deltas note, entry EN-sweep. Beside finding 2, in the first row, six more
entries were not checked of a rule's output, and are now:

| What the validator asks of a written form | Of a rule's output, now | Entry |
|---|---|---|
| A fixed slot is set only at the opening | A fault | EN2 |
| Only the hold effect sets a hold's state, holder, epoch and end; a hold is opened by an act | A fault | EN3 |
| A list change that changes nothing is not recorded | Not recorded | EN4 |
| The entry that opens an operation opens attempt 1 | A fault. A genesis is not asked (EB12) | EN5 |
| `self` is the item of a `relate` only in an entry that opens one | A fault | EN6 |
| A hold ends with the item that it is under | Also when a rule ends an item that is no subject | EN7 |
| An opening within its type's `max`; at most `sendsPerEntry` sends | Also in an outcome (a fault) and in a result clause (it changes nothing) | EN8 |

Witnesses: two tests of `forms-marks.test.ts`, with one row or one entry for
each. Nine controls, one for each guard. Each distinguishes. Three places
stay open and are recorded with their owners: no bound on the effects that an
outcome's rule derives (R4), no bound of its own on the fields of a rule's
message (the contract), and no reservation for what a mark in a result clause
opens (entry EJ6). One reading is left for the contract to confirm: a rule's
`list` change after a list that a written effect set whole is taken as
successive. Two things beside the family are recorded and not changed:
a rule's `create` of a lane is not given the directory, and an opening may
state any number of attempts.

**The sweep for finding 1's family.** Every loop of `operations.ts` and
`outbox.ts` that takes a bounded batch was read (the deltas note, the second
table of EN-sweep). Only the answers in hand were chosen in an order that a
failing row did not leave. The due attempts, the due sends and the diagnoses
are chosen by time, and a row that fails is put off past everything that is
due. The walk goes on by the row it reached. One property is shared and not
changed: a row, a diagnosis or an answer that fails for its own cause is tried
again after `drainRetrySeconds` for as long as it fails.

**The two points of reporting.** Section 4 keeps its qualification: that a
state with no new member has the digest it had rests on the commit messages
and on unchanged tests, and no stored history was recomputed. This note has no
other sentence that says "no state digest changes". The deltas note has one,
at the head of its section 12, and its section 13 now gives it the same
qualification. The plan's sentence that called revisions 16 and 21 "under
review" has a dated correction after it.

**Bytes and digests.** No form of an entry, an input or an answer changes.
Neither lane digest changes. The folded state has no new member. What the
commit derives from a rule's output changes in the cases above. The one
delivered rule, `notice-source`, meets none of them. This rests on reading
that rule and on the unchanged tests: no stored history was derived again.

**The gate.** One run of `npm run gate`, at head `c3c4806e3`, tree
`65bb1731f6ae175d38fa003ae4097fbaaca6427a`, as printed: install skipped;
whitespace 0.0 s elapsed; typecheck 2.9 s elapsed and 7.6 s CPU; test 9.0 s
elapsed and 18.3 s CPU. It printed 340 tests passed in vitest and 5 in Node's
runner. One observed run, on a shared machine with other sessions active
(load averages 4.72, 4.16 and 3.74 just before it), with a warm package
cache. The three tests added are the 3 more than section 7 states. The pins
test passed in that run, and `node notes/2026-10-05-07-i1-story/run.mjs`
exits 0. The commit that adds this section changes notes only. The source and
the tests are unchanged from the gated head: `packages` is the tree
`8282a39a14dd4cb2d7baa51d314e5ea73f89c4fa` at both.
