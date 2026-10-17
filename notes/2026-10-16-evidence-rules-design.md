# Evidence rules for landing

Request `5648d0ab`, planner promise `b7496f05`. Draft 2. This note is a
design. It commissions no implementation.

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
because each of them pins its data shape. Those versions must also add the
state that the fields depend on, listed in
[What it depends on](#what-it-depends-on).

## What exists today

- A check in the rules has a `name`, a `configuration` digest, a
  `required` flag and a `checker`, which is a member
  (`packages/platform/src/rules-scope.ts:96-108`). Each extent names the
  checks it requires. A change that touches several extents needs every
  check of each one (`packages/platform/src/extents.ts:426-432`).
- `request-check` opens a job for one manifest, bound to the manifest's
  tree and the check's configuration, with a deadline of 1,800 seconds.
  `check` records the outcome and is refused with `not-the-checker` unless
  the check's checker signs it (`apps/room/lanes/src/change.ts:987-1116`,
  the deadline at line 1031).
- The role table gives `change.check` to the `checker` role only
  (`packages/platform/src/membership.ts:107`, and the role's first list at
  line 152). The checker service has its own key. It signs a digest of the
  record of what ran (`packages/checkers/src/outcome.ts:66-81`). It has no
  production adapter yet.
- In the current change lane, required checks run on the destination's
  reservation tree, and the destination refuses with
  `required-check-timeout` when their deadline passes
  (`apps/room/lanes/src/change3.ts:53-79` and
  `packages/platform/src/destination.ts:557-567`). Each result reaches the
  destination bound to its job by the `checked` message
  (`packages/platform/src/destination.ts:601-606`).
- One manifest can select up to 32 accepted reports
  (`apps/room/lanes/src/change.ts:1283`), and its checks run once on its
  one tree. That is batching already.
- A report's `claims` and `evidence` are copied into the record, and
  nothing checks them (`apps/room/lanes/src/issue.ts:551-591`).
- A merged proposal is final. A closed intent can be reopened by its
  requester with `reopen-own`, under the `issue.close-own` grant, or by an
  admin or maintainer with `reopen-any`
  (`apps/room/lanes/src/issue.ts:301-329`). Agents hold `issue.close-own`
  (`packages/platform/src/membership.ts:100`, `:131` and `:151`), so an
  agent can reopen an intent it requested. Nothing opens an intent when a
  published commit fails a check, because no check runs after
  publication.

The [forge design](2026-10-15-unified-forge-design.md#48-execution-evidence-and-external-outcomes)
adds limits that this note keeps. Evidence for one version never stands in
for another. The record keeps four things apart: the exact subject, the
authority that admitted a result, the provider's outcome, and current
health. A passed historic check is not current production health.

## Source: who may produce a result

A signature proves who signed a result. It cannot prove that a runner
ran. So `source` names the kind of signer, and what the room can show
afterwards:

| `source` | The result comes from | What the record shows |
|---|---|---|
| `room` | The room's checker service, whose key the room's operator holds | The signed result and the service's record of what ran |
| `outside` | An outside system's answer, recorded with basis `own-answer` or `read` (`packages/contract/src/evidence.ts:16-27`) | The answer as recorded. Each basis is a class of observation that the effect's owner defines. It is not a receipt that proves itself. |
| `member` | The member the rules name as checker | The signed result only |

The room refuses a result whose signer does not match the check's source,
with `wrong-source`. Only an admin can mark a checker key as the room's
own service, and one key at a time holds that mark. Which scope holds the
mark, and how a rotation of that key takes effect for jobs already
running, is still open. For `outside`, who owns a check-run operation and
what the room trusts in its answer is also open. A check with no `source`,
as every check has today, reads as `member`. So existing rooms keep their
meaning. A report's claims stay claims. They never meet a check.

### Audits

An audit lets agents run their own tests while lying stays costly. A
`member` check at the `landing` stage may say `audit: { check, every }`.

- `check` names a `room` check that is comparable: the same stage and the
  same configuration digest. The audit runs on the same tree as the
  member's result. Rules that name a check with another configuration are
  refused when published. A member's unit tests and the room's
  integration tests can disagree for honest reasons, so a mismatch between
  them is not evidence of a false result.
- The audit's room check always runs fresh. `reuse` does not apply to it:
  rules that set `reuse: true` on a check that an audit names are refused
  when published, and the destination never counts an earlier result as
  the audit's run. An audit compares the member's recorded result with a
  new run, not with another recorded result.
- `every` is a positive whole number with a fixed upper bound in the data
  shape. The first slice accepts only `every: 1`: every landing that the
  check applies to also runs the audit.
- The landing needs both results. When they disagree, the destination
  refuses it with `audit-disagrees`, and the record keeps both results,
  the member's under the member's name. A room result that is missing,
  errored or timed out is not agreement. The landing waits for it and is
  refused at its deadline, as a required check is today.

At `every: 1` an audit saves no run. It builds a record of whether each
member's results match the room's, which is what later sampling would
rely on.

Sampling, with `every` above 1, stays open. A digest of data in the record
cannot pick landings: it adds no randomness, and an author can vary the
inputs, or cancel and retry, until a landing is not picked. Sampling needs
two things that this design does not supply:

- A source of randomness that is committed by a party independent of the
  author, after the member's result and its tree are fixed.
- An identity for each attempt that a cancel or a retry cannot change, so
  that a retried landing of the same tree keeps the draw it already had.

## Reuse: one result for one tree

When a check says `reuse: true`, the rules' author states that its outcome
depends only on the tree and the configuration. The destination then
counts an earlier passed result for the new job when the earlier result is
eligible. An earlier result is eligible when all of these hold:

- It is in the same room.
- It is for the same tree.
- It is for the same check name and configuration digest.
- It has the same source and the same stage.
- It decided a job that the room recorded, and the room admitted it under
  the rules in force at that time.
- Its signer still passes today's checks for this check: the source, the
  checker in the current rules, the role, and freshness.

A result for a different tree, or from a different source, never counts.
`reuse: true` is refused on a `published` check: a published check
observes something that changes over time, such as a deployment's health,
so its result depends on more than the tree.

The destination keeps an index of decided results by that key: room, tree,
check name, configuration, source and stage. It reads the one entry for
the new job's key. It never searches the room's history. The publication
records the earlier job that it counted. The counted result remains that
job's result. The record never shows it as a new run.

Before it counts an earlier pass, the destination compares every admitted
pass and fail under the same eligibility rule, not the passes alone.
When two eligible results for one key disagree, the check depends on more
than the tree. The destination then disables reuse for that key, and a
request to reuse it is refused with `check-disagrees`. A fresh run is not
blocked. It is fenced to the current reservation as every job is today,
and its result counts for that landing on its own. Reuse for that key stays
off. A changed configuration makes a new key. Both earlier results stay in
the record.

Running only the tests that a change affects is the job of the check's
configuration, not of the room.

## Stage: when a check runs

| `stage` | Runs on | If it fails |
|---|---|---|
| `work` | A report's tree, before the performer reports | The requester can refuse the report. A `work` check never meets an extent's checks. |
| `landing` (the default) | The reservation tree, as every check does today | The publication is refused. |
| `published` | The published commit, after the destination's receipt | The landing stands. The lane opens a new intent for the maintainers that names the landing and the failed result. |

A `published` check cannot undo a landing. A rollback is a separate act
that someone must authorize. Opening an intent automatically after a
failed `published` check is new. The intent tells the maintainers. It does
not hold anything.

### Holds

A `published` check may say `holds: true`. Then a failure blocks later
landings in the same extent. The destination records the hold, because
the destination's versioned definition and state are what admit
publications. A hold has a key:

- the check name, its source, its stage and its configuration digest;
- the rules revision in force, which is the hold's generation; and
- the extent.

The hold also records the failed job and the published commit.

**When a hold takes effect.** A `published` check that is still running
does not block later landings. Recording a failure and setting its hold
are one update of the destination's state. The destination orders that
update with its admissions, so every admission that it decides after the
update sees the hold, and none decided before it does. A hold has no
effect on a publication that was already admitted. While a hold stands,
the destination refuses each later landing in that extent with
`extent-regressed`.

**Order.** The destination judges notices by its own recorded publication
sequence, and by the order in which it admitted jobs within one
publication. It never orders by commit hash or job identifier, and never
by the order in which notices arrive.

**What clears a hold.** Only a pass clears a hold, and only a pass from a
job that meets all of these:

- the destination admitted the job under the current rules;
- the job is bound to the hold's exact key; and
- the job's publication is the hold's publication or a later one in the
  destination's sequence.

A pass under another check, source, configuration or rules generation
never clears a hold, whatever its commit or job order. The rest of the
exchange has these rules:

- Each result is bound to its job, as `checked` is today. A duplicate
  notice changes nothing.
- A failure for a publication earlier than one that the same key has
  already passed is recorded, but it does not set a hold.
- A timeout, an error, an unknown outcome or an unavailable observation is
  not a pass. It never clears a hold, and with `holds: true` it sets one,
  with its reason.
- Closing the maintainers' intent, or any other intent, does not clear a
  hold.
- If the rules or the check's configuration change while a hold stands,
  the hold stays. A pass under the new generation does not clear it. An
  admin or maintainer releases it by a transition act that names the old
  hold and the new generation, or by an override.
- An admin or maintainer can release a hold by an override act at the
  destination that names the hold and gives a reason.

The record shows a transition or an override as that act, never as a
pass, and neither says anything about current health.

These rules keep the forge design's four facts apart: the commit is the
subject, the hold and the acts that release it are the authority, the
check's result is the provider's outcome, and none of them states current
health.

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

The `deploy-check` row depends on a deployment contract that does not
exist yet. The forge design lists what that contract must name: the
environment, the release, and the identity and freshness of each health
observation. Until it exists, the row only shows where such a check would
sit.

## What it depends on

| Part | Needs | State |
|---|---|---|
| `room` and `member` sources | New versions of the rules data, the change lane and the destination, which admit a result by its source (`wrong-source`) | Open. Rule values already change by publishing, but these versions do not exist. Where the admin's mark of the room's service key is held, and how its rotation takes effect, is not decided. |
| `reuse` | The same versions, with an index of decided results by key and a mark that disables reuse for a key | Open |
| `work` and `landing` stages | The same versions | Open |
| `room` source in production, and audits at `every: 1` | A production adapter for the checker service | Open. Decision 4 puts it in the first slice. |
| Audits with `every` above 1 | Independent randomness committed after the result, and an attempt identity that cancel and retry cannot change | Open. Not in the first slice. |
| `published` stage and holds | Hold state, its release exchange and the transition act in the destination's new version, and one more message from the destination to the lane | Partly met. Platform scopes already send to the lane. The hold state is new. |
| Holding landings while a `published` check is still running | A mode of `holds` that blocks admissions until the check's result is recorded | Open. Not in the first slice. |
| `outside` source | An operation form for a check run, its owner, and what the room trusts in its answer. Only `hold@1` and `git-read@1` exist. | Open |
| Health checks after a deployment | The deployment contract of the [forge design](2026-10-15-unified-forge-design.md#48-execution-evidence-and-external-outcomes) | Open |
| Showing why a check failed | A store for run logs. `details` is only a digest. | Open: [evidence capture](../docs/roadmap.md#evidence-capture-and-private-custody) |

## Out of scope

This design chooses no tests and does not handle flaky tests or score a
test's value. Those are jobs for the system that runs the tests. The
record will hold what that system needs, though. Two results that disagree
on one tree mark a flaky check. A `published` failure shows which checks
passed a landing that was faulty. Building the next batch on a reservation
that is not yet published changes the reservation model, not these rules.

## Decisions

Hugh took these decisions on 16 October 2026:

1. The next rules version adopts `source` and `reuse`.
2. The same version adds audits of member results.
3. The same version adds the `published` stage, with `holds`.
4. The first slice ships with the checker service's production adapter,
   so that a `room` check has a real source from the start.

The `outside` source, audit sampling, the deployment contract and a store
for run logs stay open (see [What it depends on](#what-it-depends-on)).
This note still commissions no implementation. The slice needs its own
request.

The slice's witnesses would show these things:

- A `member` result is refused for a `room` check.
- Rules with no `source` keep their meaning.
- An audited landing whose two results disagree is refused.
- Rules whose audit names a check with another configuration are refused.
- Rules with `every` other than 1 are refused in the first slice.
- A cancelled and retried landing of the same tree gets a fresh audit
  run, even though an admitted pass from the cancelled reservation exists
  for the same tree, configuration, source and stage.
- Rules that set `reuse: true` on a check that an audit names are refused.
- A reused passed result counts on an equal tree and is refused on a
  different one.
- A passed result from a different source is not eligible for reuse.
- Two results that disagree disable reuse for their key, and a fresh run
  on that tree still counts and lands.
- `reuse: true` on a `published` check is refused.
- A failed `published` check opens an intent, and with `holds: true`
  refuses the next landing in its extent.
- A late pass for an earlier publication does not clear a hold for a
  later one.
- A pass under another configuration or rules generation, on the same or
  a later commit, does not clear a hold.
- A failure that races the next admission is recorded either before it,
  and the admission is refused, or after it, and the publication is
  admitted while the hold applies to the next one. It never takes effect
  in part.
- A duplicate or reordered failure notice does not lose a hold.
- Closing the maintainers' intent, or another intent, does not clear a
  hold.
- A timeout of a `published` check does not clear a hold.
- A recorded override clears a hold and is shown as an override, not a
  pass.

The witnesses belong in the lane scenarios and the destination's judge
tests, where the [testing guide](../docs/testing.md) places them.

## Changes in drafts 2 and 3

Draft 2 answers the checker's review of draft 1.

- **F1, audit selection.** Removed the claim that a digest of the
  reservation entry makes the choice unpredictable. The first slice audits
  every result (`every: 1`). Sampling is open, and the note says what it
  needs. `every` is a positive bounded whole number. An audit compares
  only results with the same tree, stage and configuration. New witnesses
  cover retry and a mismatched configuration.
- **F2, holds.** The destination records a hold in its own state, bound to
  the check, job, configuration, rules revision, published commit and
  extent, before it admits a later publication. New rules say what clears
  a hold and what does not, and an override is a separate act. The
  deploy-check example now depends on the deployment contract. New
  witnesses cover these rules.
- **F3, reuse.** One eligibility rule names the room, tree, check,
  configuration, source, stage and an admitted job, with the signer still
  checked against current rules. Disagreement disables reuse but not a
  fresh run, and both results stay. The destination reads an index by key
  and never searches the room. `published` checks cannot be reused. New
  witnesses cover a fresh run after a conflict and a result from another
  source.
- **F4, sources.** Corrected the reopen claim: a requester, agent or not,
  can reopen its own intent, and the automatic path is new. Corrected the
  `checker` role citation and other line numbers. The dependency table now
  shows the open work, including where the room's service key mark is
  held. The `outside` basis is an owner-defined class of observation, and
  its trust contract stays open.

Draft 3 answers the checker's review of draft 2.

- **F1, hold recovery.** A hold has a key: check, source, stage,
  configuration and rules generation, with the extent. Only a pass from a
  job that the destination admitted under the current rules, bound to that
  key, on the same or a later publication, clears it. A change of rules or
  configuration needs a transition act or an override. Order is the
  destination's own publication sequence. A running `published` check
  does not block landings, a recorded failure blocks every admission
  decided after it, and a hold never reaches back to an admitted
  publication. New witnesses cover a pass under another generation and a
  failure that races an admission.
- **F2, audit and reuse.** An audit's room check always runs fresh, and
  rules that let it be reused are refused. Reuse compares admitted passes
  and fails alike. A new witness covers a retried landing with a pass from
  the cancelled reservation.
