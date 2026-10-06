# Testing Artroom

This page says what a test in this repository is for, where it belongs, how
to run tests while you work, and what to run before a review. It replaces
the earlier practice of whole-suite reruns and mutation sweeps, which cost
hours per review and proved little (request `ecbc722a`).

## What a test is for

A test earns its place when it tells a plausible wrong behaviour from the
required behaviour, at a real interface or a meaningful internal boundary,
and so protects something the application relies on.

A test does not earn its place when it:

- repeats the implementation, or rebuilds the expected value with the same
  algorithm;
- checks wiring nothing depends on;
- exercises a combination no input can reach;
- repeats, in a slower place, what a cheaper test already shows;
- exists so that a count is met: one per field, one per condition, one per
  line.

Each witness that the scope contract names, and each row of
[notes/2026-10-04-i1-contract-deltas.md](../notes/2026-10-04-i1-contract-deltas.md)
or of
[notes/2026-10-05-i2-contract-deltas.md](../notes/2026-10-05-i2-contract-deltas.md)
that names one, is an invariant with a stated expected result. Before you
remove or merge a test, check the cases it witnessed, and name the test
that witnesses each one afterwards.

Before you add a test, name the invariant in one sentence. If a test
already witnesses it, strengthen that witness instead of adding another.

## Where a test belongs

Put each test at the cheapest boundary that can show its property.

| The property is about | Test it |
|---|---|
| A pure decision: canonical bytes, a digest, a validator's rule, a judgment, the fold, a bound | as a plain function, in the node tests of `bytes` or `derive`, once |
| What a scope records, refuses or keeps across a restart; the transaction, the clock, the alarm | against a real scope, in the workerd tests of `scope` |
| The order of two things that race | against a real scope, with the test's gate and clock, never with sleeps |
| What passes between scopes: creation, delivery, a diagnosis | against real scopes in one namespace, in the workerd tests of `scope` |
| The Worker's routes and the service binding | in workerd, once for each; do not run a whole suite over both |
| What a verifier reports for a history | over histories in memory, in `replay`; that replay agrees with the runtime, once, in `scope` |
| What a client builds, signs and accepts as an answer | as plain functions in `client`; the handle against the real Worker, in `scope` |
| A form of a definition: that the validator accepts or refuses it, and what the judges derive from it | as a plain function in `derive`, on a small made-up definition, in the `forms-*.test.ts` file of its family |
| That a lane definition is exactly its pinned bytes and digest, meets its bounds, and passes the validator whole | as plain functions in `lanes`, once for both definitions. Do not write a test for one row, one field or one guard of a lane definition. |
| What only the two real lane definitions can show: several commitments and a hold, a plan's concerns, a manifest and its evidence, links, attention, capacity | against real scopes under the two pinned digests, in a scenario of `packages/lanes/test/*.scope.test.ts`, on the one fixture `test/support/graph.ts`. One scenario states one invariant. |

A stand-in proves only the boundary it exposes. A retry, an ordering or a
restart is shown against the thing that really retries, orders or restarts.

The scripted capability of `@generalbusiness/artroom-scope/testing` is a
stand-in for the code of `hold@1` and `git-read@1`. The derive package
has that code, and the production ports hold it. A test that uses the stand-in says so in its name or its first comment.
It shows what a definition does once a capability has answered, and
nothing about a real hold, a Git read or a provider. A step that a test
scripts in it names an action and a window, and derives nothing. It
shows how a step's grant is read and judged, and nothing about the step.

A scripted membership, `Controls.membership` of the same module, is a
stand-in for the membership scope and for the reference to it that a
scope's genesis will record. The test writes each answer, and no history
stands behind the head it names. With one, the scope's authority is the
real observation read, with the real guards and windows. A test that uses
it says so in its name or its first comment. It shows the observing
scope's side of a read, and nothing about membership.

Membership has two stand-ins of its own, in
`@generalbusiness/artroom-platform/testing`. `office` is a made-up
directory that creates one membership scope: it stands for the real
directory and the register. `Roster` is a membership scope in memory
below such an office. A test that uses one says so. It shows
membership's rows and its ten rules, which are all the platform
package's, and nothing about a founding. `lacking`, of the same module,
is a control and no stand-in: membership's version less one rule, for
the rule that a version with a mark and no rule runs nothing.
`PlatformScope`, of the scope package's test Worker, is the deployed
class with the production authority and the platform package's own
rules: a test of real authority runs there, in the namespace `PLATFORM`
(`packages/scope/test/repository.ts` lists what is real in it).

The register and the directory have no stand-in rule: every mark of the
data of each has its rule in the platform package. Two fixtures are in
`packages/platform/test/support-founding.ts`. `Register` is a register in
memory, founded by an install intent. `Directory` is a directory in memory
that such a register created by its own rules: the claim, the selecting
outcome with its `create`, the directory's genesis and the register's
record of the result are all judged. The genesis of each child and each
lane's entry are scripted, made by hand. A test that uses one says so. It
shows the rows and the rules of the two definitions as judgments in
memory. A founding on scope objects is
`packages/scope/test/founding-real.test.ts`, in the namespace `PLATFORM`:
the deployed class, the production authority and the package's own rules,
with a labelled stand-in for the Git host. It runs as far as the creation
of the destination, which `platform:destination@1` cannot yet answer.

The rules scope has four stand-ins, in
`packages/platform/test/support-rules.ts`. `registrar` is a made-up
directory that creates one rules scope. `asker` is a made-up lane that
tells it `rules-wanted`. `Rulebook` is a rules scope in memory below such
a registrar, whose acts are judged on the test authority of derive's
fixture set. `standing` is an observation of a member that the test
writes by hand: no membership scope answered it. A test that uses one
says so. The data and the three rules of `platform:rules@1` are the
platform package's, and none of them is a stand-in. Such a test shows
the rows and the rules as judgments in memory. It shows nothing about a
founding, about a read of membership, or about how a scope receives and
keeps a value beside an intent
(`notes/2026-10-05-i3-contract-deltas.md`, entry EQ9).

The destination has stand-ins of its own, in
`packages/platform/test/support-destination.ts`. `standInRules` is a rule
for each of the ten marks of the destination's data that the platform
package has no rule for (`notes/2026-10-05-i3-contract-deltas.md`,
entries ER4 to ER9): without them nothing is created under
`platform:destination@1`, in a test as in production. `bureau` is a
made-up directory that creates one destination scope. The lane's and the
register's entries are made by hand. `Branch` is a destination scope in
memory below such a bureau. A test that uses one says so. It shows the
destination's rows and its eight real rules, and nothing about an outcome
entry, a push or a founding.

The token ledger has three stand-ins. `TokenHost` and `Vault`, in
`packages/git/test/support/tokens.ts`, stand for a Git host's token
interface and for the gateway's side of the handoff of a plaintext.
`TokenHost` mints and revokes in memory, with a fault for one request: a
refusal, a lost request, a lost reply, or a reply out of form. `Stager`,
in `packages/scope/test/hosted.ts`, answers the one request of an attempt
of a staging as the test wrote it. The fixture `hosted` of that file runs a
real scope on the capability's code, with the git package's real
`TokenDriver` as its port for outside effects. A test that uses one says
so. Such a test shows what the driver and a scope do with a host's
answers, and where a plaintext is. It shows nothing about a real host, a
gateway, a fork or a push. The sealed entries of
`packages/git/test/host.test.ts` are made by hand, and no scope judged
them (`notes/2026-10-05-i3-contract-deltas.md`, entry ET12).

A replay of a history that the test authority wrote says so:
`grants: "as-recorded"`. Its grants hold no freshness proof, and the
report lists them as trusted. The replay command never takes that option.

The replay package has two histories with stand-ins of their own, in
`packages/replay/test/staging.ts`. `Lane` is a staging lane and `Gate` a
scope under made-up platform data. Derive's judges wrote every entry of
both, with the code of `hold@1` and `git-read@1` or with made-up rules.
Three things are stand-ins, and the file labels each: the two entries of
the lane's creator, each observation of membership, and every answer of
the outside system. A replay of them is given an anchor for each of the
first two. Their grants hold a freshness proof, so they are replayed as
`proven`. Such a test shows what a verifier derives from a history. It
shows nothing about a creation, about membership or about a Git host.

`codeLost`, of the same module, supplies each platform definition with
its data and with no rule, while a test's control says so
(`platformCode`). It stands for a runtime that lacks the rules of a
version. It shows what a scope answers when its pinned definition cannot
be run, and nothing about any rule. Without it the platform definitions
are the platform package's, with their rules, as in production.

A scripted peer, `net.peers` of the same module, is a stand-in for a scope
of a platform kind that the test does not run, such as a rules scope or a
destination. The test writes the peer's entry by hand, and nothing judged
it. A test that uses one says so in the same way. It shows the receiver's
side of a delivery, and nothing about the peer.

The checker service has three stand-ins, in
`packages/checkers/test/support.ts`. `Lane` stands for the scope
namespace: one change lane and its repository's rules scope, with entries
made by hand that no scope judged, and answers to a submit from a script.
`MemoryDurable` stands for the service's durable storage. `ScriptedRunner`
stands for a runner: it returns a stated end and runs nothing. A test that
uses one says so. Such a test shows the service's own side: what it reads
before it runs, what it starts, keeps and signs. It shows nothing about a
lane's judgment, a storage's loss, a container or a real runner. The
runner's checkout is tested on a real local repository, which is not a
host. What a real change lane does with the service's signed results is
one scenario of the lanes, `packages/lanes/test/checks.scope.test.ts`,
which calls the service's origin read and its signer as functions.

## Time, size and setup

- No test waits on the wall clock. Use the test clock, a gate, or an
  injected delay. A retry rule is about the rule, not about seconds
  passing.
- A bound is tested at a small configured limit when the limit is a
  parameter, and at the real limit once.
- Tests that only read may share one scope or one fixture per file. Tests
  that write get their own. The packages share one fixture set, exported by
  `@generalbusiness/artroom-derive/testing`.

## While you work

Run the tests of what you changed, not the repository.

```
npm run test:changed                 # what you changed and have not committed
npm run test:changed -- origin/main  # everything that differs from origin/main
npx vitest run --project scope turn   # one project, files whose name matches
npm test --workspace @generalbusiness/artroom-derive   # one package
```

`npm run test:changed` runs the root vitest run
([scripts/test-changed.mjs](../scripts/test-changed.mjs)), which picks the
test files that import a changed file, in every active package. The last
lines say what ran.

A change to a root file (`package.json`, the lock file, a root
`tsconfig`, the root `vitest.config.ts`) runs every test.

A changed file whose name git would quote, such as a name with a space or
a letter outside ASCII, runs the whole root vitest run, because vitest
cannot read that name.

The selection follows imports. A test that reads a file without importing
it, such as a fixture or a document, is not selected when only that file
changes. The gate runs everything.

## Before a review

Run the gate once, at the head you will send.

```
npm run gate
```

It installs only if `package-lock.json` changed since the last install,
typechecks every workspace, and runs every test: one vitest process for
the repository (`vitest.config.ts` at the root, one project for each of
`bytes`, `derive`, `platform`, `git`, `checkers`, `replay`, `client`,
`scope` and `lanes`), then one script (`scripts/active-source.test.mjs`). The script checks that no
active file imports from `parked/` or names a removed format, and that no
platform package depends on the lanes package or imports from it. It prints the head, the tree and
each step's elapsed and CPU time. It also fails on a whitespace error in
what the branch changed. `npm run gate -- --ci` reinstalls first.

The `scope` project runs in the workerd pool, against real Durable Objects
with SQLite storage. The others run in Node, as one group at the same time,
and the `scope` project runs after them, by itself: it has one worker, and
vitest lets projects share a group only when their worker counts agree. The
`git` project runs the real `git` program, as a client and as a server, on
local repositories, and one file of the `checkers` project runs it for the
runner's checkout. Nothing runs twice.

The eleven lane scenarios, `packages/lanes/test/*.scope.test.ts`, run from
the root inside the `scope` project: the same test Worker, loaded once.
The root `vitest.config.ts` adds them, and no file of the scope package
names the lanes package. The lanes package keeps
`vitest.scope.config.ts` and `wrangler.test.jsonc`, which run the same
files alone, in a Worker of its own with the same classes: for `npm test`
in the package, for `scripts/control.mjs` and for
`scripts/measure-tests.sh`. A scenario's client calls the scope service's
own operations, `api` of `@generalbusiness/artroom-scope/worker`, in the
test's isolate. A few acts go over the Worker's HTTP routes, where the
scenario is about a route. The reason is cost: in the workerd pool a call
through the Worker's entrypoint takes longer the more of them one run has
made (observed; `notes/2026-10-05-i2-contract-deltas.md`, entry DK11).

The `lanes` project is the three tests of
`packages/lanes/test/definitions.test.ts`. They read the two byte files
under `packages/lanes/definitions`, and `docs/lanes-reference.md`,
without importing them. So, by the rule above, a change to one of those
files alone is not selected by `npm run test:changed`; the gate runs it.
Two sets of generated files follow the lane definitions:
`packages/lanes/src/digests.ts` with the byte files, written by
`packages/lanes/scripts/pin.mjs`, and `docs/lanes-reference.md`, written
by `packages/lanes/scripts/reference.mjs`. The pins test fails while
either is stale.

Nothing under `parked/` is installed, typechecked or tested.
[parked/README.md](../parked/README.md) says what is there.

Do not run it again for a commit that changes only documents; say that the
source and tests are unchanged, and give the two tree hashes.

## Showing that a test distinguishes

When you add or change a guard, show its witness fails without it. Break
the one line and run the one test file:

```
node scripts/control.mjs <source file> '<old text>' '<new text>' [--expect '<part of the test name>'] -- <package dir> <test args>
```

It runs the tests unchanged, which must pass. Then it applies the change,
runs them again and restores the file. It gives one of three results:

| Result | Exit | Meaning |
|---|---|---|
| distinguishes | 0 | a test failed by an assertion with the change applied |
| survives | 1 | every test still passed: they do not see this fault |
| inconclusive | 2 | nothing was shown: the tests did not start, did not pass before the change, did not load or compile with it, ran fewer tests than before, had any timeout, or failed only by a thrown error |

A helper that checks a result, such as `expectRefusal`, fails with
`expect.fail`, not with a thrown `Error`, so that a test which fails there
has failed by an assertion.

Only the first is evidence. With `--expect`, the test you name must be one
of those that failed by an assertion, or the result is inconclusive. The
helper prints each failed test and the first line of its failure. Read
them: the assertion should be the one that states the invariant. The
helper cannot judge that for you.

There is no mutation sweep. Do not write one mutant per field or per
condition, and do not run whole suites per mutant. One or two honest
controls for each invariant you touch are the evidence. If a guard cannot
change any outcome, because another check always decides first, say which
check, and consider deleting the guard.

## The invariant map

[plans/test-invariants.md](../plans/test-invariants.md) maps the earlier
model's tests, which are removed. It is the proof plan's to replace. Until
then each test's name states its invariant, and the two deltas notes name
the witness of each decision.

## For reviewers

Review the change, the invariants it touches and their witnesses. Probe
with a few focused counterexamples of your own. Run the gate once at the
head under review. Do not rebuild a per-field or per-guard inventory.

## Measuring the cost

`scripts/measure-tests.sh <output directory>` times each step
of the gate alone: elapsed seconds, and CPU seconds summed over every
process the step started. It also keeps each step's vitest report, from
which the summed test-file time comes. It fails if a step fails. A sum of
its steps is a sum of separate runs, not the time of one gate: for that,
time `npm run gate` itself, which also prints each of its steps.

The cost of the tests is judged by two figures, for the whole gate and for
one edit taken to review (request `ecbc722a`, as amended by `da68c9a9`):

- **elapsed**: how long the pipeline takes, which is how long a person
  waits;
- **CPU**: user and system seconds over every process the pipeline
  started, which is what the machine spent.

Other figures help to find where the time is. Say what each one is:

- **summed test-file time**: the test durations in vitest's reports. It
  leaves out imports and setup;
- **printed phase totals**: vitest's import and test totals over all test
  files. Parallel load inflates them;
- **single-worker suite time**: `scripts/measure-tests.sh <dir> --serial`
  runs each suite with one worker. Its figure is the elapsed time of the
  whole command in a configuration the gate does not use. Do not call it
  worker time.

A sum of separately timed steps is a sum; say so, and do not present it as
one observed run.

State the machine, the load and the cache state with any figure.
