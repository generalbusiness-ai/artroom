# Evidence rules for landing

Request `5648d0ab`, planner promise `b7496f05`. This note is a design. It
commissions no implementation.

## The problem

A dap room's rules can require checks, such as a test run, before a change
lands. The room counts a result only when three things hold: the check ran
on the exact tree that will be published, it used the configuration the
rules name, and the member the rules name as its checker signed it. Three
things are still missing:

- **The rules cannot say who may produce a result.** A checker service that
  the room runs and an agent that holds the `checker` role look the same
  to the room. A room cannot require that its tests were run, not just
  reported.
- **A result counts for one manifest only.** When a manifest is replaced
  and its tree stays the same, for example after a cancelled merge, every
  check runs again.
- **Checks run only at landing.** There is no place for a cheap check while
  the work is under way. There is also none for a check of the published
  result after it lands.

## Why it matters

Agents propose changes faster than people can review them, so a room's
checks carry more of each decision. If the room cannot tell a run from a
claim, the record is weaker, and keeping that record is what dap is for.
Test runs are also the largest cost of a landing. This repository's own
[testing guide](../docs/testing.md) exists because whole-suite reruns cost
hours for each review.

## The proposal in brief

Each check in the rules gets three new fields:

- `source` says who may produce its result: the room, an outside system,
  or a member.
- `reuse` lets an earlier passed result count again on the same tree.
- `stage` says when the check runs: during the work, at landing, or after
  publication.

A room changes these values the way it changes its checks today, by
publishing a new revision of its rules. Adding the fields at all needs new
versions of the rules scope's data, the change lane and the destination,
because each of them pins its data shape.

## What exists today

- A check in the rules has a `name`, a `configuration` digest, a
  `required` flag and a `checker`, which is a member
  (`packages/platform/src/rules-scope.ts:96-108`). Each extent names the
  checks it requires. A change that touches several extents needs every
  check of each one (`packages/platform/src/extents.ts:426-432`).
- `request-check` opens a job for one manifest, bound to the manifest's
  tree and the check's configuration. `check` records the outcome and is
  refused with `not-the-checker` unless the check's checker signs it
  (`apps/room/lanes/src/change.ts:987-1116`).
- Only the `checker` role may sign a result
  (`packages/platform/src/membership.ts:13`). The checker service has its
  own key. It signs a digest of the record of what ran
  (`packages/checkers/src/outcome.ts:66-81`). It has no production adapter
  yet.
- In the current change lane, required checks run on the destination's
  reservation tree, and the destination refuses with
  `required-check-timeout` when their deadline passes
  (`apps/room/lanes/src/change3.ts:52-75`;
  `packages/platform/src/destination.ts:556-605`).
- One manifest can select up to 32 accepted reports, and its checks run
  once on its one tree. That is batching already.
- A report's `claims` and `evidence` are copied into the record, and
  nothing checks them (`apps/room/lanes/src/issue.ts:551-591`).
- A merged proposal is final. Only a person can reopen an intent
  (`apps/room/lanes/src/issue.ts:301-329`).

The [forge design](2026-10-15-unified-forge-design.md) adds two limits
that this note keeps. Evidence for one version never stands in for
another, and a passed historic check is not current production health.

## Source: who may produce a result

A signature proves who signed a result. It cannot prove that a runner
ran. So `source` names the kind of signer, and what the room can show
afterwards:

| `source` | The result comes from | What the record shows |
|---|---|---|
| `room` | The room's checker service, whose key the room's operator holds | The signed result and the service's record of what ran |
| `outside` | An outside system's answer, which the destination records with basis `own-answer` or `read` (`packages/contract/src/evidence.ts:16-27`) | The answer as recorded, which replay accepts as it does for publication |
| `member` | The member the rules name as checker | The signed result only |

The room refuses a result whose signer does not match the check's source,
with `wrong-source`. Only an admin can mark a checker key as the room's
own service, and one key at a time holds that mark. A check with no
`source`, as every check has today, reads as `member`. So existing rooms
keep their meaning. A report's claims stay claims. They never meet a check.

A room might let agents run their own tests and still make lying costly.
A `member` check could name a `room` check to audit with. The destination
would pick a share of landings by a digest of its own reservation entry,
which the author cannot predict. A picked landing would need both results,
and a disagreement would refuse it. I recommend waiting until a room
actually lets agents report their own landing checks.

## Reuse: one result for one tree

When a check says `reuse: true`, the rules' author states that its outcome
depends only on the tree and the configuration. The destination then
counts an earlier passed result when these match the new job:

- the check's name;
- the tree;
- the configuration digest;
- the source.

The earlier signer must still be the check's checker in the current rules.
The publication records which earlier job it counted.

Two results for the same name, tree and configuration that disagree show
that the check depends on more than the tree. The destination then stops
reuse for that check on that tree, refuses with `check-disagrees`, and the
next landing needs a fresh run. A result never counts for a different
tree. Running only the tests that a change affects is the job of the
check's configuration, not of the room.

## Stage: when a check runs

| `stage` | Runs on | If it fails |
|---|---|---|
| `work` | A report's tree, before the performer reports | The requester can refuse the report. A `work` check never meets an extent's checks. |
| `landing` (the default) | The reservation tree, as every check does today | The publication is refused. |
| `published` | The published commit, after the destination's receipt | The landing stands. The lane opens a new intent for the maintainers that names the landing and the failed result. |

A `published` check cannot undo a landing. A rollback is a separate act
that someone must authorize. A `published` check may say `holds: true`.
The room then refuses each later landing in the same extent with
`extent-regressed`, until a maintainer closes that intent or the check
passes again.

The lane fixes each check's deadline at 1,800 seconds. A `deadline` field
in the rules would give each stage its own time budget. It belongs in the
same new versions.

## Worked case: this repository's testing guide

The [testing guide](../docs/testing.md) asks you to run the tests of what
you change while you work, and to run the gate once before review. Written
as a room's rules:

| Check | `source` | `stage` | `reuse` | Extent |
|---|---|---|---|---|
| `focused` | `member` | `work` | no | none |
| `gate` | `room` | `landing` | yes | `source` |
| `deploy-check` | `room` | `published` | no | `deployment`, with `holds: true` |

The gate result that counts is then the room's run on the reservation
tree. An agent's own gate run is a claim on its report. A retry on the
same tree does not run the gate again. A failed deployment check stops the
next deployment landing, but not content changes. No check names mutation
sweeps, so nothing asks for them. Which boundary a test belongs at stays a
question for review, because a rule cannot tell a useful test from a
useless one.

## What it depends on

| Part | Needs | State |
|---|---|---|
| `room` and `member` sources, `reuse`, the `work` and `landing` stages | New versions of the rules data, the change lane and the destination | Nothing open. Rule values already change by publishing. |
| `room` source in production | A production adapter for the checker service | Open |
| `published` stage | One more message, from the destination to the lane | Partly met. Platform scopes already send to the lane. |
| `outside` source | An operation form for a check run. Only `hold@1` and `git-read@1` exist. | Open |
| Showing why a check failed | A store for run logs. `details` is only a digest. | Open: [evidence capture](../docs/roadmap.md#evidence-capture-and-private-custody) |

## Out of scope

This design chooses no tests and does not handle flaky tests or score a
test's value. Those are jobs for the system that runs the tests. The
record will hold what that system needs, though. Two results that disagree
on one tree mark a flaky check. A `published` failure shows which checks
passed a landing that was faulty. Building the next batch on a reservation
that is not yet published changes the reservation model, not these rules.

## Decisions for Hugh

1. Adopt `source` and `reuse` in the next rules version. I recommend it.
   It is a small change.
2. Add audits of member results now, or wait. I recommend waiting.
3. Add the `published` stage now, or wait until a deployment check exists
   to try it on. I recommend waiting.
4. Ship the first slice with the checker service's production adapter, or
   on its own.

If you accept decision 1, the first slice's witnesses would show four
things:

- a `member` result is refused for a `room` check;
- a reused passed result counts on an equal tree and is refused on a
  different one;
- two results that disagree stop reuse;
- rules with no `source` keep their meaning.

The witnesses belong in the lane scenarios and the destination's judge
tests, where the [testing guide](../docs/testing.md) places them.
