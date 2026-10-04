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
npm run test:changed                 # tests that import what you changed and have not committed
npm run test:changed -- origin/main  # the same, for everything your branch changed
npx vitest run --project room-workerd declared-fd6f00b6   # one project, files whose name matches
npm test --workspace packages/git    # the git package (Node's test runner)
npm test --workspace packages/ui     # the ui package (its own vitest)
```

## Before a review

Run the gate once, at the head you will send.

```
npm run gate
```

It installs only if `package-lock.json` changed since the last install,
typechecks every workspace, and runs every test: one vitest process for
the repository (`vitest.config.ts` at the root, one project per package
and runtime), then the git and ui packages. It prints the head, the tree
and each step's elapsed and CPU time. On an 18-core machine it takes about
30 seconds. `npm run gate -- --ci` reinstalls first.

The Room's tests run against real Durable Objects. One group of them,
`packages/room/test/workerd/declared-run.test.ts`, runs chosen tests of
other files a second time under the code-review `v2` declarations. That is
the declared witness set. Nothing else runs twice.

Do not run it again for a commit that changes only documents; say that the
source and tests are unchanged, and give the two tree hashes.

## Showing that a test distinguishes

When you add or change a guard, show its witness fails without it. Break
the one line by hand and run the one test file:

```
node scripts/control.mjs <source file> '<old text>' '<new text>' -- <package dir> <vitest args>
```

It applies the change, runs the tests, restores the file, and tells you
whether they failed. Read the failure: it should be the assertion you
expect, not a crash, a timeout or a compile error.

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
which the summed test-file time comes. State the machine, the load and the
cache state with any figure. The current figures are in
[plans/README.md](../plans/README.md).
