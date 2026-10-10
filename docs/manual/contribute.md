# Contribute a change to Artroom

For a contributor to this repository, this page helps you keep a task, its source change, its evidence and its independent review together.

**Source manuscript.** Repository instructions are pinned to main `18a1288de937db9852912fa7ac3830f387ca61d4`; product source `0e5954ecfca23f531cfa2ec42be1524bef3bc9a8` cited by the companion guides is incorporated in main `a1277d9c43bdaff1873e61f0a3d2444fc5f72b53`. All commands below are UNRUN for this page. No development setup, public package or hosted acceptance is supplied here.

In a prepared checkout with its reviewed dependencies, inspect your work and select the checks it changes:

```sh
git status --short
npm run test:changed
```

Before a source change is sent for review, run the required gate once at the exact review head:

```sh
npm run gate
```

A documents-only change with unchanged source/tests uses their existing exact tree evidence and does not repeat the product gate. The sample commands here are still pending page-specific CI evidence. [Repository instructions](https://github.com/generalbusiness-ai/artroom/blob/18a1288de937db9852912fa7ac3830f387ca61d4/AGENTS.md), [Testing guide](https://github.com/generalbusiness-ai/artroom/blob/18a1288de937db9852912fa7ac3830f387ca61d4/docs/testing.md)

## Track the task before editing

Use a gitseq request for every task. Record its goal, scope and acceptance conditions, and identify the owner before overlapping another change. Work on an isolated branch/worktree and preserve other people's uncommitted work. A clean checkout is required for landing; cleaning it is not permission to discard someone else's files.

Read the package's current interface and the exact governing contract for the behavior you change. An old guide or parked module is history, not a reason to revive that API. Active packages separate contract/types, bytes, judgments, platform definitions, runtime, client, replay, Git, lanes, checkers, CLI and Page responsibilities. Keep changes at their actual owning boundary.

## Show the behavior at the cheapest useful boundary

Name the invariant before adding a test. Reuse or strengthen a witness that already shows it. Pure decisions belong in Node; storage, admission, ordering and cross-scope behavior require their actual runtime boundary. A labelled stand-in proves only the side it exposes, not a host, deployment or native authority it does not run.

Use focused changed tests while editing. Import-based selection does not catch a document/fixture merely read as a file; name that affected check explicitly when needed. Root configuration changes may select the whole suite. Do not create one test per field or rerun whole suites to meet a count.

When a guard changes, use an honest focused control that fails by the intended assertion without it. An import failure, timeout, thrown error or omitted case is not distinguishing evidence. Do not run mutation sweeps. Once necessary checks pass, additional whole-suite repeats need a new change, failure or unresolved concern.

Keep full terminal results, exact head/tree, case coverage and material limitations. A log tail, diagram, raw hash or successful stand-in is not a stronger outcome than it actually observed. Timing claims identify wall and CPU cost, machine/load/cache and whether they describe one run or a sum.

## Keep dependencies and tools reviewable

Do not install a probe tool into a checkout. Use the pinned scratch-directory method in `AGENTS.md`, so dependency files change only in a reviewed commit. A source gate follows its current locked setup; do not bypass tests, widen deadlines or omit cases to get a green summary. This page does not authorize an installation or extra runtime probe.

## Send a concrete result for independent review

Commit the source and identify the exact artifacts and evidence under the owning request. Describe what changed, what outcome it enables, what checks actually ran and what remains unproved. Use plain English for a technical audience. File supporting artifacts and the primary result through the normal gitseq workflow, then request checker review against that exact head.

An approval of an earlier head cannot approve revised bytes. Fix a requested change on a successor, retain the original result and give the reviewer the new exact artifact. Use normal landing and its receipt only after the required review/conditions; a model saying done is not requester satisfaction or Git publication.

For a documentation change, retain all open manual outcomes, source/release labels and acceptance obligations. A published draft may help a reader while its hosted samples, generated drift checks, style or cold-reader evidence are still owed. No documentation-host choice is needed merely to write accurate Markdown.

Likely stops are a dirty checkout, a changed dependency/configuration, a failed or incomplete check, stale review evidence, conflicting source and an unresolved outside publication. Preserve the actual result, resolve its owner/boundary and proceed with a concrete successor; do not erase the original failure or infer an unknown effect from absence.

This guide covers manual outcome 57 at the stated repository instruction source. It executes nothing and claims no setup, benchmark, gate, approval, landing or full manual acceptance. All four reader areas, 67 page outcomes, extra material and eight acceptance conditions remain open under their existing owners.
