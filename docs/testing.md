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

Before you add a test, name the invariant in one sentence. If
[plans/test-invariants.md](../plans/test-invariants.md) already has a
witness for it, strengthen that witness instead of adding another.

## Where a test belongs

Put each test at the cheapest boundary that can show its property.

| The property is about | Test it |
|---|---|
| A pure decision: a shape, a bound, a validator's rule, a role table, a title | as a plain function, in a node test |
| What the Room admits, records, refuses or keeps across a restart | against a real Room, in the workerd tests |
| The order of two things that race | against a real Room, with the test's gates and clock, never with sleeps |
| The Workers runtime itself: WebCrypto, limits, no Node APIs | in workerd, once; do not run a whole suite in two runtimes |
| What a declared vocabulary changes | in the declared witness set (see below), not by running everything twice |
| What a person sees and can do | in the UI tests; the browser suite for the few flows only a browser shows |
| A real subprocess or a real repository | in the checkers and git tests, with one shared fixture where tests only read |

A stand-in proves only the boundary it exposes. A retry, an ordering or a
restart is shown against the thing that really retries, orders or restarts.

## Time, size and setup

- No test waits on the wall clock. Use the test clock, a gate, or an
  injected delay. A retry rule is about the rule, not about seconds
  passing.
- A bound is tested at a small configured limit when the limit is a
  parameter, and at the real limit once.
- Tests that only read may share one room or one fixture per file. Tests
  that write get their own.

## While you work

Run the tests of what you changed, not the repository.

```
npm run test:changed                 # what you changed and have not committed
npm run test:changed -- origin/main  # everything that differs from origin/main
npx vitest run --project room-workerd declared-fd6f00b6   # one project, files whose name matches
npm test --workspace packages/git    # the git package (Node's test runner)
npm test --workspace packages/ui     # the ui package (its own vitest)
```

`npm run test:changed` covers all three test runners
([scripts/test-changed.mjs](../scripts/test-changed.mjs)). The root vitest
run picks the test files that import a changed file, in every package but
git and ui. Those two have their own runners. Each runs whole, in a few
seconds, when a changed file is in the package or in a workspace package it
depends on. The last lines say which of the three ran, and why one did not.

A change to a root file (`package.json`, the lock file, a root
`tsconfig`, the root `vitest.config.ts`) runs every test of all three.

A changed file whose name git would quote, such as a name with a space or
a letter outside ASCII, runs the whole root vitest run, because vitest
cannot read that name. The git and ui packages are still chosen by where
the file is.

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
the repository (`vitest.config.ts` at the root, one project per package
and runtime), then the git and ui packages. It prints the head, the tree
and each step's elapsed and CPU time. It also fails on a whitespace error
in what the branch changed. On an 18-core machine it takes about 30
seconds. `npm run gate -- --ci` reinstalls first.

The Room's tests run against real Durable Objects. One group of them,
`packages/room/test/workerd/declared-run.test.ts`, runs chosen tests of
other files a second time under the code-review `v2` declarations. That is
the declared witness set. Nothing else runs twice.

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

[plans/test-invariants.md](../plans/test-invariants.md) lists, package by
package, the invariants the tests protect and the test that is each one's
witness. Keep it in step: add a line when you add an invariant, and remove
one when you remove its witness. It is by group, not by case.

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

State the machine, the load and the cache state with any figure. The
current figures are in [plans/README.md](../plans/README.md).
