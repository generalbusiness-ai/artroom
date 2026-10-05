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
stand-in for the code of `hold@1` and `git-read@1`, which is not
delivered. A test that uses it says so in its name or its first comment.
It shows what a definition does once a capability has answered, and
nothing about a real hold, a Git read or a provider.

A scripted membership, `Controls.membership` of the same module, is a
stand-in for the membership scope and for the reference to it that a
scope's genesis will record. The test writes each answer, and no history
stands behind the head it names. With one, the scope's authority is the
real observation read, with the real guards and windows. A test that uses
it says so in its name or its first comment. It shows the observing
scope's side of a read, and nothing about membership.

`standInPlatform`, of the same module, supplies a rule that adds nothing
for each row that a platform definition marks as code. It is a stand-in
for the platform rules, which are not delivered, and no judge runs it. A
test that uses it says so in its name or its first comment. It shows that
a scope is founded and judges its acts once every rule is supplied, and
nothing about any rule.

A scripted peer, `net.peers` of the same module, is a stand-in for a scope
of a platform kind that is not delivered, such as a rules scope or a
destination. The test writes the peer's entry by hand, and nothing judged
it. A test that uses one says so in the same way. It shows the receiver's
side of a delivery, and nothing about the peer.

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
`bytes`, `derive`, `replay`, `client`, `scope` and `lanes`), then one
script (`scripts/active-source.test.mjs`). The script checks that no
active file imports from `parked/` or names a removed format, and that no
platform package depends on the lanes package or imports from it. It prints the head, the tree and
each step's elapsed and CPU time. It also fails on a whitespace error in
what the branch changed. `npm run gate -- --ci` reinstalls first.

The `scope` project runs in the workerd pool, against real Durable Objects
with SQLite storage. The others run in Node. Nothing runs twice.

The ten lane scenarios, `packages/lanes/test/*.scope.test.ts`, run from
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
