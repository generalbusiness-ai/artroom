# A declared landing policy

Status: design note, draft 2, 16 October 2026. It commissions no
implementation. Repository facts cite `path:line` at main `aeebc18cb`.
Section 8 answers the review of draft 1.

Agent-coordination systems often hard-code when a change lands: a test
gate, a retry limit, a confidence threshold, a conflict check. The policy
then lives in a coordinator's code, and the repository cannot see it,
version it or review a change to it. This note shows that in dap the same
policy can be a definition that the repository's room owns, versions and
reviews. It depends on the [evidence rules design](2026-10-16-evidence-rules-design.md)
(unlanded, branch `planner/evidence-rules-design-20261016`) and the
[MVP plan](2026-10-16-repo-in-ai-mvp-plan.md), and repeats neither.

## 1. The example policy

A change written by an agent has one of three outcomes: it **lands**, it
is **sent back** to its author, or it is **escalated** to a person.

- **(a) Test gate.** A failed required check, or a person's request for
  changes, sends the change back.
- **(b) Attempt limit.** An attempt is a version of the change. Versions
  1 to 3 may be sent back. A fourth or later version that would be sent
  back is escalated instead. A version that passes lands, whatever its
  number. Voluntary new versions count as attempts too.
- **(c) Confidence.** The change lands automatically only when an
  advisory confidence, weighted by trust in its authors, is above a bar.
  The bar is lower when the change's own tests passed. Below the bar, or
  with no trusted confidence, the change is escalated, not sent back.
- **(d) Semantic conflict.** A conflict in meaning with code that changed
  since the previous version escalates the change, even if it is
  otherwise ready.

## 2. What dap has today

| Part | Today | Gap |
|---|---|---|
| Landing | Only a signed `merge` lands: the destination reads exactly that kind (`packages/platform/src/destination-reading.ts:38`; `destination.ts:124`) and requires the merger to hold `change.merge` now (`packages/platform/src/reservation.ts:217-222`). The default table gives it to person roles only (`packages/platform/src/membership.ts:105-106`); a room sets its own role lists with `set-actions` (`membership.ts:471-479`). | No fenced automatic route. |
| (a) | The merge guards require the rules' approvals, no request for changes, and each required check passed on this version (`apps/room/lanes/src/change.ts:1291-1327`). The destination judges the checks again (`reservation.ts:241-248`). | None. |
| (b) | Each `propose-manifest` supersedes the previous version (`change.ts:448-484,796`). A `count` guard takes a `max` (`packages/contract/src/definition.ts:188`). | A recorded send-back and escalation. |
| (c) | A `rule` guard runs a rule expression in restricted JSONata, with arithmetic and comparison (`packages/derive/src/rule/evaluator.ts:38`). Its input is the act's fields, signer, named subjects and presented facts, not every item in the scope (`packages/derive/src/guards.ts:113-118`). The entry keeps the rule, its input digest and result (`packages/contract/src/entry.ts:109`). | No confidence value: a review has a verdict and a body only (`change.ts:103-115`). No trust value. |
| (d) | The destination refuses a version whose base is not the current head (`reservation.ts:208`), so code that changed forces a new version. Nothing compares meaning. | An analyzer and its recorded result. |

Two facts of the guard engine shape the design. Guards stop at the first
that fails (`guards.ts:162-170`). A guard whose `also` subject is unbound
is not evaluated (`guards.ts:131-136`), so every required input needs its
own presence guard, or the check fails open.

## 3. The minimum slice: one authority path

### 3.1 Members and grants

- The **landing member** is a checker, made by `add-member` with role
  `checker`. The room appends `change.merge` and `change.dispose` to the
  `checker` role list. No cohort, membership definition or default table
  changes.
- Agents, and the landing member, get `change.assess`. They do not get
  `change.review`, so an assessment is never a counted approval: the
  destination counts only `review-verdict` facts (`destination.ts:152`).
- People keep `change.review` and `change.merge`.

### 3.2 The change-lane revision

A new revision of the change lane, activated in the room, keeps every act
name and field the destination reads, and adds:

- **`assessment`** items (at most 64) and the act `assess`
  (`change.assess`). Values: `confidence` (integer 0 to 100), `model`,
  `version`, and `tree`, fixed. Refs: `manifest`, fixed. Guards: the
  manifest is current; `tree` equals the manifest's tree; one assessment
  for each signer and version. An assessment is advisory input only.
- **`disposition`** items (at most 64), one for each version, opened by
  two acts with grant `change.dispose`:
  - `send-back`, with guards in this order: the version is current
    (`newer-version`); it has no disposition (`already-disposed`); a
    required check failed or a request for changes was made on it
    (`no-cause`); at most 3 versions exist (`attempts-exhausted`). It
    notifies the authors.
  - `escalate`, naming a person and a reason (`attempts-exhausted`,
    `below-threshold`, `conflict` or `evidence-missing`), with the first
    two guards above. It notifies that person, and the person's "needs
    you" view (MVP plan, S4) lists it.
- On **`merge`**, two optional fields, `assessment` and `ownTests` (a
  passed job of this version, with a check name the rule names), and one
  guard after all the existing guards, in their existing order:

  ```
  anyOf:
    [ presence of assessment, its manifest = this version,
      rule "auto-landing" ]
    [ count approve reviews on this version, min 1 ]
  reason: landing-not-allowed
  ```

The rule `auto-landing` holds the policy's values: the landing members,
the trusted assessors, a trust table from agent member to 0 to 100, the
bars, and the check name for own tests. Its shape, for illustration:

```
signer in landers and assessment.assessor in assessors
and not(assessment.assessor in authors)
and every author has a trust entry and count(authors) > 0
and assessment.confidence * min(trust of authors) >= (ownTests ? 60 : 80) * 100
```

A missing assessment, an empty author list, an unknown author or an
untrusted assessor makes it false. A rule cannot fail open.

### 3.3 What the landing member does

For each current version whose required checks are decided, it applies
the first matching line, and records one act:

1. A required check failed, or changes were requested: `send-back`; if
   that is refused `attempts-exhausted`, `escalate` with that reason.
2. Conflict evidence is required and missing, stale or not zero:
   `escalate` (`conflict` or `evidence-missing`). Not in this slice.
3. No trusted assessment, or the score is below the bar: `escalate`
   (`below-threshold`).
4. Otherwise: `merge`, naming the assessment and, if any, `ownTests`.

A refusal alone writes nothing. If `merge` is refused, the landing member
records `escalate` with the refusal's reason, so every version ends with
a recorded landing, send-back or escalation.

### 3.4 The fence and the person's path

- The lander's `merge` passes only by the rule. Any other holder of
  `change.merge`, including a second checker, needs at least one person's
  approval on that exact version.
- A person answers an escalation as today: `review-verdict` and then
  `merge`, or a request for changes. The author cannot review
  (`change.ts:927-929`), and `ownerMayReview` still applies
  (`reservation.ts:269-270`).
- Automatic landing needs the rules' `approvals` at 0 for the extents it
  may land in. Extents with approvals above 0, such as `authority` or
  `deployment`, still need a person's approval at the destination, so
  the lander cannot land there.

### 3.5 What kind of work this is

The lane revision and the role lists are **data** activated in a room.
The landing member is **local** code, a small service like MVP S7's,
holding a checker key. No host deployment is planned, but one assumption
is open: that the destination accepts a revised lane that adds items and
`merge` fields, since it is written against the pinned lane's kinds
(`destination.ts:136-146`). A scratch-room probe settles it first. If the
destination refuses, a destination version that accepts the revision is
host work, after the freeze. This slice covers (a), (b) and (c); (d)
waits for section 5, and a room that needs (d) leaves automatic landing
off until then.

One limit: a scope keeps its definition for good, so a new revision
governs changes opened after it. Values that must reach open changes
belong in the rules scope, which answers each `ask-rules` with one update
(`change.ts:437-445`; `packages/platform/src/rules-scope.ts:294-301`).
That needs the new rules version that the evidence rules also need.

## 4. Inputs from outside the room

A rule reads only recorded facts. A rule expression has no clock,
randomness or I/O (`evaluator.ts:1-14`). So anything from outside the
room enters as a signed fact from a named member, with the version of the
tool or model, and the exact version and tree it describes. Guards check
the source and the binding.

**Freshness is a native guard, not a timestamp.** An observation item
holds an `until` time, and the `merge` guard list checks
`{ before: { slot: "until" } }` on it. The judge compares that with the
host's clock reading, and answers `clock-behind` when the reading is
behind the history (`guards.ts:229-235`). A presence guard comes first,
because an unbound subject is skipped. Expired, missing or unknown
evidence leaves automatic landing unmet, and the lander escalates with
`evidence-missing`. Two parts are future native forms in a new contract
version: an observation time stamped by the host, and a bound on `until`
from that time. Until then, the source chooses `until`.

## 5. Future thresholds that need outside input

These are examples, not commitments.

| Threshold | Input and producer | How recorded | Rule shape | Needs |
|---|---|---|---|---|
| Semantic conflict | Conflicts between this version and code changed since the previous version's base; an analyzer job | A check result with a number | `conflicts = 0`, else escalate | The check runner (MVP S7); a number on a result, which has only `outcome`, `reason`, `tree`, `details` (`change.ts:144-155`) |
| Trust in rules | A score per agent | A rules-scope value, changed by a reviewed act | lookup by author | The new rules version |
| Performance or size | A benchmark job: p95 latency, bundle size | A result with numbers, and main's recorded value | within 5% of main | The check runner; numbers; main's value |
| Production health | A monitor member | An observation with `until` | no automatic landing while the error budget is spent; escalate | Observability (`notes/2026-10-12-observability-design.md`); the host-stamped time of section 4 |
| Dependencies (optional) | A scanner | A result listing advisories and licences | no new high-severity advisory | The check runner; a bounded list |

## 6. Order and size

| Order | Step | Kind | Size |
|---|---|---|---|
| 1 | Probe: the destination accepts a revised lane | none | small |
| 2 | Lane revision of 3.2; role lists; the landing member | data, local | medium |
| 3 | Evidence rules' version; trust moved to the rules scope | host | medium (own request) |
| 4 | Check runner (MVP S7); numbers on results | local, data | medium |
| 5 | Conflict analyzer; part (d) | local | medium |
| 6 | Host-stamped observations and bounded `until` | host | medium |
| 7 | Production health, after observability | host | medium |

## 7. Witnesses for step 2

- A fourth version with a failed check: `send-back` is refused
  `attempts-exhausted`, and `escalate` names a person. A passing fourth
  version lands.
- `send-back` with no failed check and no request for changes is refused
  `no-cause`.
- The lander's `merge` with no assessment, an untrusted assessor, an
  author's own assessment, an author with no trust entry, or a score
  below the bar is refused `landing-not-allowed`. The same score with
  `ownTests` passed is accepted.
- An assessment for another tree is refused.
- A second checker's `merge` without a person's approval is refused; with
  one, it is accepted.
- An agent cannot sign `merge`, `send-back` or `escalate`.
- The landing entry names its rule input digest; a changed bar governs
  only changes opened after its revision.

## 8. Findings map: review of draft 1

| Finding | Answer in draft 2 |
|---|---|
| F1: `auto-merge` cannot land; `merge` bypass; escalation needs `change.edit-any` | 3.1 to 3.4: the lander signs ordinary `merge`, fenced by one `anyOf` guard; other mergers need a person's approval; own `escalate` and `send-back` acts with `change.dispose`; room role lists only. 3.5 reclassifies: data, local code, and an open probe, with a host fallback. |
| F2: confidence absent; rule input; advisory authority | 3.2: `assessment` in the minimum slice, bound to version and tree, named in `merge`; `change.assess` without `change.review`; missing or untrusted values make the rule false. |
| F3: attempt semantics; guard order; recorded acts | 1(b) and 3.2: the attempt guard is on `send-back`, last; passing versions land. 3.3: every version ends in a recorded act. 7: witnesses fixed. |
| F4: freshness | 4: native `before` guard with a presence guard; host-stamped time and bound named as future native forms. |
| Landing: link layout; dependency | Rebased on `aeebc18cb`; there the MVP plan is still at `notes/2026-10-16-repo-in-ai-mvp-plan.md`, so the link stands. The evidence rules note is declared unlanded. |
