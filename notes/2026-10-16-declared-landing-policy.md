# A declared landing policy

Status: design note, 16 October 2026. It commissions no implementation.
Repository facts cite `path:line` at main `8412601df`.

Agent-coordination systems often hard-code when a change lands: a test
gate, a retry limit, a confidence threshold, a conflict check. The policy
then lives in a coordinator's code. The repository cannot see it, version
it or review a change to it. This note shows that in dap the same policy
can be a definition that the repository's room owns, versions and
reviews. It builds on the [evidence rules design](2026-10-16-evidence-rules-design.md)
(branch `planner/evidence-rules-design-20261016`) and the
[MVP plan](2026-10-16-repo-in-ai-mvp-plan.md), and repeats neither.

## 1. The example policy

A change written by an agent has one of three outcomes: it **lands**, it
is **sent back** to its author, or it is **escalated** to a person.

- **(a) Test gate.** If a required check fails, the change is sent back.
- **(b) Attempt limit.** After 3 versions, a change that would be sent
  back again goes to a person instead.
- **(c) Confidence.** The change lands automatically only when its
  confidence is above a threshold. Confidence is weighted by trust in the
  agent that wrote it. The threshold is lower when the change's own tests
  passed.
- **(d) Semantic conflict.** If the change conflicts in meaning with code
  that changed since it was written, it goes to a person, even if it is
  otherwise ready.

## 2. What dap has today for each part

| Part | Today | Gap |
|---|---|---|
| Outcomes | A person's `merge` lands a change; a `request-changes` review or a failed required check sends it back; `request-review-any` asks a named person (`apps/room/lanes/src/change.ts:874,907,1271`). Only person roles hold `change.merge` and `change.review` (`packages/platform/src/membership.ts:105-106`). | No automatic landing. That needs an act whose grant goes to a landing member, beside the person's `merge`. |
| (a) | The rules item holds `approvals`, `checks`, `ownerMayReview` and `revision` (`change.ts:201-238`). The merge guards require the approvals (`change.ts:1291-1299`), no request for changes (`:1300-1307`) and every required check passed on this version (`:1308-1327`). The destination copies `requiredChecks` (`packages/platform/src/destination.ts:558`) and judges them again (`packages/platform/src/reservation.ts:241-248`). Reviewer independence follows `ownerMayReview` (`reservation.ts:269-270`). | None. The evidence rules add who may produce a result. |
| (b) | Each `propose-manifest` supersedes the previous version (`change.ts:448-484,796`), so the change's versions are in its own state. A `count` guard takes a `max` (`packages/contract/src/definition.ts:188`; `packages/derive/src/guards.ts:191-199`). | None for counting versions. Counting only send-backs, not every new version, needs a count over superseded reviews and jobs. |
| (c) | A `rule` guard runs a rule expression in restricted JSONata, with arithmetic and comparison (`packages/derive/src/rule/evaluator.ts:38`), over the act's fields, signer, subjects and facts (`guards.ts:113-118`). The entry keeps the rule's name, its input digest and its result (`packages/contract/src/entry.ts:109`). The change lane declares no rules yet (`change.ts:1695`). | No trust value and no confidence value exist. A review has a verdict and a body only (`change.ts:103-115`). |
| (d) | Nothing native. The MVP plan's pass item 2 is a person's or model's comparison. | An analyzer, its recorded result and a way to escalate on it (section 5). |

"People only" for approvals rests on role-kind binding: membership makes
agents with role `agent` and checkers with role `checker`, and grants
follow roles (MVP plan, section 1.4). A guard cannot see member kind, so
the landing act is held by a role, not tested against a kind.

## 3. The policy as data

A new revision of the change lane, activated in the room, carries the
policy. In outline:

- An `auto-merge` act, with grant `change.auto-merge` given only to the
  room's landing member. Its guards are the `merge` guards, plus:
  - `{ count: { type: "manifest", states: ["current", "superseded"], max: 3 }, reason: "attempts-exhausted" }`;
  - `{ rule: "confident", reason: "below-threshold" }`;
  - a guard that the conflict check reports no conflict (section 5).
- The declared rule `confident`. Its source is illustrative; the input
  shape is not the real one:

  ```
  $score := $min(reviews.confidence) * $lookup(trust, author);
  $score >= (ownTestsPassed ? 0.6 : 0.8)
  ```

- When `auto-merge` is refused with `attempts-exhausted`,
  `below-threshold` or a conflict, the landing member signs
  `request-review-any` naming a person. The escalation is then in the
  record, and the person's "needs you" view lists it (MVP plan, S4). The
  person merges with the ordinary `merge`.

The thresholds, the attempt limit and the trust table are values in this
revision. Changing one is a new revision, reviewed as a change to the
rules and activated by an admin. It is not a code edit or a deployment.
Each change scope pins the lane revision it was created under, and each
rule result in an entry names its input digest. So the record shows which
policy and which inputs each landing was judged under.

One limit follows. A scope pins its definition for good
([roadmap](../docs/roadmap.md#rules-that-change-after-creation)), so a
new lane revision governs changes opened after it, not changes already
open. Values that must apply to open changes belong in the rules scope,
as `approvals` does today: an open change asks for the current rules with
`ask-rules` (`change.ts:437-445`), and the rules scope answers each ask
with one update (`packages/platform/src/rules-scope.ts:294-301`). That needs a new rules version, which the
evidence rules need as well, so the two can share it.

## 4. Inputs from outside the room

A rule reads only recorded facts. A rule expression has no clock,
randomness or I/O (`evaluator.ts:1-14`). So anything from outside the
room — an analyzer, a model's judgment, a monitor — enters as a signed,
recorded fact. Each such fact carries:

- the **named source** that signed it, a member whose role the rules
  name;
- the **version** of the tool or model that produced it;
- the **exact subject**: the change version and tree it describes;
- its **freshness**: when it was observed and until when it holds.

A fact for another tree, from another source or past its freshness does
not meet the rule. This follows the evidence rules' `source` field and the
forge design's limit that evidence for one version never stands in for
another.

## 5. Future thresholds that need outside input

These are examples, not commitments.

| Threshold | Input and producer | How recorded | Rule shape | Needs |
|---|---|---|---|---|
| Semantic conflict | Count of semantic or referential conflicts between the change and code changed since its base. An analyzer job on the reservation tree. | A check result with a bounded number, for example `measures: { conflicts: 2 }` | `conflicts = 0`, else escalate | The check runner (MVP S7); a number on a result, which has only `outcome`, `reason`, `tree` and `details` today (`change.ts:144-155`); a check whose failure escalates, not sends back |
| Agent trust | A score per agent, set by people | A governed value in the room's rules, changed only by a reviewed act | `$lookup(trust, author)` | Section 3's table first; later a rules-scope field |
| Reviewer confidence | A model reviewer, an agent member | A signed review with a `confidence` value | `$min(reviews.confidence) >= 0.7` | A review revision with `confidence`; such a review is advisory and is never a person's approval |
| Performance or size budget | A benchmark job: p95 latency or bundle size | A check result with measures, against main's last recorded value | `p95 <= base.p95 * 1.05` | The check runner; measures; a recorded base value for main |
| Production health | Monitoring: the error budget | An observation from a named monitor member, with freshness | No automatic landing while the budget is spent; escalate | Observability (`notes/2026-10-12-observability-design.md`) with freshness bounds; an observation form |
| Dependencies and security (optional) | A scanner | A check result listing new advisories and licences | No new high-severity advisory; no incompatible licence | The check runner; measures or a bounded list |

## 6. What it would take

| Order | Step | Kind | Size |
|---|---|---|---|
| 1 | The change-lane revision of section 3: `auto-merge`, the attempt guard, the `confident` rule and the trust table. Activated in a room; no deploy. | data | small to medium |
| 2 | A review revision with `confidence`, so a model reviewer's signed review can feed the rule. | data | small |
| 3 | The evidence rules' version, with `source`, `reuse` and stages. | host | medium (separate request) |
| 4 | The check runner (MVP S7), so analyzer and benchmark jobs have a trusted source. | local | medium |
| 5 | Measures on a check result, and a check that escalates on failure. | data, with the step 3 versions | small |
| 6 | Recorded observations from outside, with source, version, subject and freshness: the evidence rules' `outside` source and an operation form for a check run. | host | medium |
| 7 | Production health as an observation, after observability. | host | medium |

Step 1 alone makes parts (a), (b) and (c) real, with trust from a table
and confidence from people or agent reviews. Part (d) and the other
thresholds wait for steps 4 to 6.

The witnesses for step 1 would show: an `auto-merge` on a fourth version
is refused, and the escalation request names a person; a score below the
bar is refused, and the same score with own tests passed is accepted; an
agent cannot sign `auto-merge`; a changed threshold takes effect for
changes opened after the new revision is activated; and the landing entry names the
revision and the rule's input digest.
