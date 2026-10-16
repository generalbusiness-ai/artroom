# Evidence rules for landing

Request `5648d0ab`, planner promise `b7496f05`. Design only. This note
commissions no implementation.

A room's rules already say which checks a change needs before it lands.
This note asks three more questions that those rules leave open:

1. **Provenance.** Which kinds of source can evidence have, and who may
   write each kind?
2. **One result for one tree.** When does a result on tree T count for
   every change that lands T?
3. **Stage.** How does a check say when it runs, and how can a fact found
   after landing reopen work?

The first worked case is this repository's own test discipline,
[docs/testing.md](../docs/testing.md), written as a room's rules.

Out of scope: choosing which tests to run, handling flaky tests, scoring
each test's value, and tuning batch sizes. These are jobs for the system
that runs the tests. The note says only what the record keeps for them
(section 7).

## 1. What exists today

| Part | What it does | Source |
|---|---|---|
| A check of the rules | A record with `name`, `configuration` (a digest), `required` and `checker` (a member). The rules hold at most 32. | `packages/platform/src/rules-scope.ts:96-108` |
| An extent's checks | Each extent names the checks that it requires. A change that touches several extents needs every check of every one of them. Nothing is averaged. | `packages/platform/src/extents.ts:39`, `:426-432` |
| A job | `request-check` opens a `job` for one manifest, bound to its `tree` and the check's `configuration`, with a 1,800-second deadline. It is refused with `not-a-check-of-the-rules` unless the rules list that name with that configuration. | `apps/room/lanes/src/change.ts:987-1037` |
| A result | `check` or `check-error` records `outcome` (`passed`, `failed` or `error`) and a `details` digest. It is refused with `not-the-checker` unless the signer is the check's listed checker, and with `not-this-job` unless the tree and configuration match. | `apps/room/lanes/src/change.ts:1038-1116` |
| Who may check | Only the `checker` role holds `change.check`. | `packages/platform/src/membership.ts:13`, `:58` |
| The checker service | A separate service with its own key. It runs one job in one runner, keeps the outcome with the record of the run, and only then signs and submits it. It has no production adapter yet. | `packages/checkers/src/service.ts:1-40`; `notes/2026-10-15-unified-forge-design.md:92` |
| Where required checks are judged | In `change3`, required jobs run on the destination's recorded reservation tree. The lane's own `required-check-not-passed` guard is removed. The destination keeps `requiredChecks` and `passes`, and refuses with `required-check-timeout` when the deadline passes. | `apps/room/lanes/src/change3.ts:52-53`, `:68-75`; `packages/platform/src/destination.ts:556-566`, `:576` |
| Several pieces of work in one landing | One manifest selects up to 32 accepted reports. Its jobs run once, on its one tree. | `docs/lanes-reference.md:129` |
| A retry | A new job may name the job it replaces (`earlier`), and that job becomes `superseded`. A second live job with the same name on the same manifest is refused with `job-exists`, and one waiting job with `retry-pending`. | `apps/room/lanes/src/change.ts:1005-1018`; `apps/room/lanes/src/change3.ts:62-68` |
| Work evidence on a report | A `report` carries `commit`, `tree`, `claims` (up to 32 texts) and `evidence` (up to 32 digests). Nothing checks `claims` or `evidence`; they are copied into the record. | `apps/room/lanes/src/issue.ts:551-591` |
| A person's judgment of conditions | `judge` records `satisfied`, `evidence` and a `note`, signed by the requester. No guard reads `satisfied`. An intent closes when its change merges. | `apps/room/lanes/src/issue.ts:330-346`, `:1085-1125` |
| An outside system's answer | An outcome's evidence has a basis: `own-answer` (the authenticated answer to its own request), `read` (a decisive read) or `none` (the answer was lost). Replay accepts the answer as recorded, and derives only what follows from it. | `packages/contract/src/evidence.ts:16-27`; `packages/replay/README.md:260-264` |
| After landing | A `merged` proposal is final. A person can reopen an intent (`reopen-own`, `reopen-any`). No act reverts a landing. | `apps/room/lanes/src/change.ts:43`; `apps/room/lanes/src/issue.ts:301-329` |
| Changing the rules | The lane's definition is pinned for good, but the rules' values are not: `publish` sends a new revision of the checks and extents, and the lane copies it. | `packages/platform/src/rules-scope.ts:205-206`; `apps/room/lanes/src/change.ts:1560-1605` |

Two landed notes constrain this one. The forge note keeps evidence for
one version apart from evidence about another, and says that a passed
historic check is not current production health
(`notes/2026-10-15-unified-forge-design.md:144`, `:262-275`). The
repository-in-your-AI-app note says that old cards cannot approve a newer
version (`notes/2026-10-16-repo-in-your-ai-app.md:64-65`). Nothing below
departs from either.

So the room already counts a required check only when it was run on the
exact tree to be published, under the exact configuration the rules name,
and signed by the member the rules name. What the rules cannot say is
**what kind of member that is**. A checker service run by the room and an
agent that holds the `checker` role look the same to the judge.

## 2. Provenance

### The limit of a signature

The record proves who signed a result and what they signed. It cannot
prove that a runner ran. A design that labels evidence as "observed"
says which key signed it and who holds that key. It cannot say more than
that. This note uses the word *source* for that statement.

### Three sources

Each check of the rules gains one field, `source`, with one of three
values:

| `source` | Who signs the result | Who holds the key | What the room can show afterwards |
|---|---|---|---|
| `room` | The checker service | The room's operator, in the service's custody, never in a runner | The signed result, and the service's kept record of what ran, whose digest is the result's `details` (`packages/checkers/src/outcome.ts:66-81`) |
| `outside` | No member. The destination records an outside system's answer as an outcome, with basis `own-answer` or `read`. | The outside system | The recorded answer, under the pinned owner's declarations, as replay already accepts it |
| `member` | The listed checker member, as today | That member | The signed result only |

Rules:

- **E1.** A result counts toward a check only when its signer or outcome
  matches the check's `source` and `checker`. Otherwise the result is
  refused with `wrong-source`. A judge never upgrades a source.
- **E2.** The checker service's key is registered in membership as a
  `checker` that is marked as the room's own service. Only an admin can
  make that registration, and only one key holds the mark at a time. The
  mark is what lets a `room` check name it.
- **E3.** A `report`'s `claims` and `evidence` stay as they are: a
  member's own statement. They never meet a check. A display may show
  them, labelled as claimed.
- **E4.** Today's rules have no `source`. Their checks read as `member`,
  which is exactly what the judge does now. Existing rooms keep their
  meaning.

### Audited member results

A room may want agents to run tests on their own machines, and still make
lying costly. A `member` check may name an audit:
`audit: { check: <name of a room check>, every: <n> }`. The destination
picks the landings to audit by a digest of its own reservation entry. The
author does not know that entry when the change is proposed, so cannot
choose a tree that avoids the audit. Replay derives the same choice. A
picked landing needs both the member's result and the room check's
result. When they disagree, the landing is refused with
`audit-disagrees`, and the record keeps both results under the member's
name.

This is an option, not a recommendation for the first version.
Decision D2 asks whether it is needed.

## 3. One result for one tree

### What already batches

Batching already exists at the manifest. One manifest can select up to 32
accepted reports from different commitments, and its checks run once, on
the reservation tree. A failed check refuses the whole manifest. Splitting
it into smaller manifests is a person's or an agent's next act. dap
records each attempt, and choosing how to split stays outside the rules.

### Reuse across manifests

A result is bound to one manifest (`job.manifest`). A new manifest whose
reservation tree is the same as an earlier one's runs every check again.
This happens after a cancelled merge, a retry, or a manifest that is
superseded without any change of content.

- **E5.** A check of the rules may say `reuse: true`. The rules' author
  states with it that the check's outcome depends only on the tree and the
  configuration.
- **E6.** For a check with `reuse: true`, the destination counts an
  earlier `passed` result when all four of these are equal to the new
  job's: the check `name`, the `tree`, the `configuration` digest and the
  `source`. The earlier signer must also still be the check's listed
  checker in the current revision of the rules. The publication records
  which earlier job it counted.
- **E7.** If the record holds two results for the same name, tree and
  configuration that disagree, reuse stops for that check on that tree.
  The destination refuses with `check-disagrees`, and the next landing
  needs a fresh run. A check that disagrees with itself has shown that it
  depends on more than the tree.
- **E8.** A result never counts for a different tree, even when the
  difference is a file the check does not read. Selecting by changed
  paths is the job of the check's own configuration, not of the room.

Building the next batch on a reservation that has not yet been published
is out of scope. It changes the reservation model, not the evidence
rules.

## 4. Stage

A check says when it runs. Each stage has one owner who opens the job,
and one consequence when it fails.

| `stage` | Runs on | Opened by | When it fails |
|---|---|---|---|
| `work` | A report's `tree` | The performer, before reporting | The requester can refuse the report. Nothing else changes. |
| `landing` (the default, and what every check does today) | The reservation tree | `request-check`, as today | The publication is refused. |
| `published` | The published commit | The destination, after its receipt | The landing stands. The destination sends `regressed` to the lane. |

- **E9.** A `work` check is evidence for the requester's judgment. It
  never meets an extent's checks. A `work` result is still signed by its
  check's source, so a `room` work check is a run the room did, not a
  claim.
- **E10.** A `published` check cannot undo a landing. A landing is final,
  and a rollback is another authorized operation (forge note, 4.8). When a
  `published` check fails, the lane opens a new intent that names the
  publication, the check and the failed result, and gives it to the
  maintainers.
- **E11.** A `published` check may say `holds: true`. Then each later
  landing that touches the same extent is refused with
  `extent-regressed`, until a maintainer closes that intent or a later
  `published` result for the same check passes.
- **E12.** Stage, source, reuse and audit are fields of the rules' values.
  A room changes them by publishing a new revision of the rules. That
  already works. Adding the fields at all needs new versions of the rules
  scope's data, the change lane and the destination, because each pins its
  shape.

Each check's 1,800-second deadline is fixed in the lane today. A
`deadline` field for each check, in the rules, would let each stage have
its own budget. It belongs with E12.

## 5. Worked case: this repository's testing rules

[docs/testing.md](../docs/testing.md) asks for three things: test at the
cheapest boundary, run the tests of what you change while you work, and
run the gate once before review. As a room's rules:

| Check | `source` | `stage` | `reuse` | Extent | What it replaces |
|---|---|---|---|---|---|
| `focused` | `member` | `work` | no | none | "Run the tests of what you change while you work" |
| `gate` | `room` | `landing` | yes | `source` | "The gate once before review" |
| `deploy-check` | `room` | `published` | no | `deployment`, `holds: true` | A person checking the deployed service after a push |

What this changes:

- The gate result that counts is the room's run on the reservation tree.
  An agent's own gate run is a claim on its report.
- A retry, or a cancelled merge with the same tree, does not run the gate
  again (E6).
- A failed deployment check stops the next deployment-class landing until
  a maintainer has answered it (E11). It does not block content changes.
- "Do not run mutation sweeps or repeat whole suites" becomes a fact of
  the rules: no check names them, so nothing asks for them.

The rule in testing.md about where a test belongs stays a matter for
review. A rule cannot tell a good test from a bad one.

## 6. Dependencies

| Dependency | State | Why |
|---|---|---|
| Required checks on the exact reservation tree | Met | `change3` and the destination's third version (section 1) |
| Rule values that change after creation | Met | `publish` of the rules (section 1). The new fields need new pinned versions (E12). |
| The checker service | Partly met | It exists and signs, but has no production adapter, and no registration marks its key as the room's own (E2) |
| An application's own messages between scopes | Partly met | Platform scopes already send to the lane. `regressed` (E10) is one more message. |
| Outside parties and systems | Open | An `outside` source needs an operation form for a check run. Only `hold@1` and `git-read@1` exist. |
| Evidence capture and private custody | Open | `details` is a digest. A run's log or output has no store and no stated source. `room` and `member` checks do not need it; showing why a check failed does. |

The `room` and `member` sources, reuse (E5 to E8), and the `landing` and
`work` stages need nothing that is open. `outside` checks, `published`
checks and audits wait on the open rows.

## 7. What the record keeps for later analysis

These rules choose no tests. They keep, for every check, the name, the
tree, the configuration, the source, the stage, the outcome and the
`details` digest, with the landing it took part in. That is enough for
the system that runs the tests to answer later:

- A check that disagrees with itself on one tree and configuration is
  flaky. E7 already acts on this.
- A `published` failure that names a landing shows which checks passed
  that landing and missed the fault.
- How long each check took and how often it failed shows its cost and its
  yield.

None of these reports is part of this design.

## 8. Decisions for Hugh

- **D1.** Adopt the three sources (E1 to E4) in the next rules version.
  Recommended.
- **D2.** Include audits (section 2) in that version, or wait until a
  room lets agents report their own landing checks. Recommended: wait.
- **D3.** Adopt reuse (E5 to E8). Recommended. It is small, and the
  manifest model already gives one run per batch.
- **D4.** Adopt the `published` stage (E10, E11) now, or wait until a
  deployment check exists to try it on. Recommended: wait.
- **D5.** Which delivery should carry the first slice (D1 and D3): the
  checker service's production adapter, or a separate rules version.

## 9. What would follow

Nothing here is commissioned. If D1 and D3 are accepted, the first slice
is one new version each of the rules scope's data, the change lane and
the destination. Its witnesses would show that:

- a `member` result is refused for a `room` check;
- a reused `passed` result counts on an equal tree, and is refused on a
  different tree;
- two results that disagree stop reuse;
- existing rules keep their meaning.

The witnesses belong in the lane scenarios and the destination's judge
tests, as [docs/testing.md](../docs/testing.md) places them.
