# A declared landing policy

Status: design note, draft 3, 16 October 2026. It is illustrative and
commissions no implementation. Repository facts cite `path:line` at main
`aeebc18cb`. Section 8 answers the reviews of drafts 1 and 2.

Agent-coordination systems often hard-code when a change lands: a test
gate, a retry limit, a confidence threshold, a conflict check. The policy
then lives in a coordinator's code, and the repository cannot see it,
version it or review a change to it. This note shows how, in dap, the same
policy can be a definition that the repository's room owns, versions and
reviews, and which parts need support that does not exist yet. It depends
on the [evidence rules design](2026-10-16-evidence-rules-design.md)
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
  with no trusted confidence, the change is escalated.
- **(d) Semantic conflict.** A conflict in meaning with code that changed
  since the previous version escalates the change, even if it is
  otherwise ready.

## 2. What dap has today

| Part | Today | Gap |
|---|---|---|
| Landing | Only a signed `merge` lands: the destination reads exactly that kind (`packages/platform/src/destination-reading.ts:38`) and requires the merger to hold `change.merge` now (`packages/platform/src/reservation.ts:217-222`). It counts only approvals that are independent and from keys that are not compromised (`reservation.ts:233-236,269-274`). | No route by which a non-person lands under a policy while the destination still guarantees a person's eligible approval on every other route. |
| (a) | The merge guards require the rules' approvals, no request for changes, and each required check passed on this version (`apps/room/lanes/src/change.ts:1291-1327`). The destination judges the checks again (`reservation.ts:241-248`). | None. |
| (b) | Each `propose-manifest` supersedes the previous version (`change.ts:448-484,796`). A `count` guard takes a `max` (`packages/contract/src/definition.ts:188`). | A recorded send-back and escalation. |
| (c) | A `rule` guard runs a rule expression in restricted JSONata, with arithmetic and comparison (`packages/derive/src/rule/evaluator.ts:38`), over the act's fields, signer, named subjects and presented facts (`packages/derive/src/guards.ts:113-118`). The entry keeps the rule's input digest and result (`packages/contract/src/entry.ts:109`). | No confidence value: a review has a verdict and a body only (`change.ts:103-115`). No trust value. Too few subjects to bind the inputs (section 4). |
| (d) | The destination refuses a version whose base is not the current head (`reservation.ts:208`), so code that changed forces a new version. Nothing compares meaning. | An analyzer and its recorded result. |

## 3. What fits today: advice and recorded outcomes

A new change-lane revision, activated in a room, and a small local
**landing member** can carry the policy up to the point of landing. A
person still lands every change, through today's `merge`, with the rules'
approvals unchanged.

- **Assessments.** An `assessment` item and the act `assess`, with grant
  `change.assess` for agents. The item stores its **assessor as a party
  set from the signer**, not as a value the signer supplies; an item has
  no implicit creator (`packages/contract/src/read.ts:41-58`). It holds a
  confidence from 0 to 100, the model and its version, and the tree, and
  refers to its version. Guards: the version is current, the tree is that
  version's tree, the signer is not an author (`notIn`, as
  `change.ts:929` uses), and one assessment for each assessor and
  version. Agents do not get `change.review`, and the destination counts
  only `review-verdict` facts (`packages/platform/src/destination.ts:152`),
  so an assessment is never an approval.
- **Dispositions.** A `disposition` item, one for each version, opened by
  two acts with grant `change.dispose`, held by the landing member, a
  checker:
  - `send-back`, with guards in this order: the version is current; it
    has no disposition; a required check failed or changes were
    requested on it; at most 3 versions exist (`attempts-exhausted`).
  - `escalate`, naming a person and one reason from a closed list:
    `attempts-exhausted`, `below-threshold`, `conflict`,
    `evidence-missing`, `policy-met`, `publication-failed`.
- **The landing member** reads the record, works out the policy, and
  records exactly one disposition for each version: `send-back`, or
  `escalate`. When the policy is met, it escalates with `policy-met`, so
  the person sees that the change is ready and why.

This part is data and local code, with no host change. It shows the
policy's value as a declared, reviewed definition, but nothing lands
automatically.

## 4. What automatic landing needs

### 4.1 Authority at the destination

A sound route has two parts that the **destination** tells apart. A
local guard is not enough. If a room set the destination's approvals to
0 and counted approvals in the lane instead, an approval the destination
would exclude would still satisfy the lane. Examples are an approval from
an agent's controller while `ownerMayReview` is false, or one from a
compromised key. So automatic landing needs a new destination version,
with a matching change-lane revision and rules version:

- **Rules** name the landing members, the extents where they may land,
  the trusted assessors, the trust table, the bars, the attempt limit and
  the own-tests check.
- **The human route** needs at least one eligible approval, counted by
  the destination's present rules of independence and key state, in every
  extent. That includes extents whose approvals are 0 for the landing
  route.
- **The landing route** is open only to a named landing member, only in
  its extents. The destination receives the assessment and the
  own-tests job with the reservation, checks that both belong to this
  version and tree, and checks the assessor and the score against the
  rules it observes. A landing member with a person's approval still
  takes the landing route and its checks.

Rooms pinned to today's destination, lane and rules versions keep them.
Nothing changes for them.

### 4.2 Bound inputs

The `merge` act already binds three `also` subjects: proposal, version and
rules. The assessment would be the fourth. The own-tests job would be a
fifth, beyond the bound of 4 (`definition.ts:86-88`;
`packages/contract/src/bounds.ts:88`;
`packages/derive/src/validate/handlers.ts:61`). A rule cannot look up a
job by an ID it is given. So binding both needs one of these:

- authenticated fact inputs, which the judge checks natively against the
  version, tree, check name and configuration; or
- a raised subject bound, in a new contract version.

### 4.3 The outcome of a landing

An accepted `merge` does not land the change. It opens a merge item in
state `intended`; `committed` and `unknown` are not final, and only the
destination's `published` outcome marks the change merged
(`change.ts:190-193,1613-1650`). The landing member therefore treats an
accepted merge as **pending**. It observes the existing operation, and
after a lost reply or an `unknown` outcome it settles that operation,
never sending the merge again. The mapping is closed:

| Result | Disposition |
|---|---|
| `published` | Landed. No disposition. |
| `refused` or `aborted` | `escalate`, `publication-failed` |
| Merge refused `newer-version` | None; judge the newer version |
| Merge refused `merge-in-progress` | None; observe that operation |
| Merge refused `changes-requested` or `required-check-not-passed` | `send-back`, or `escalate`, `attempts-exhausted` |
| Any other refusal | `escalate`, `evidence-missing` |

## 5. Inputs from outside the room

A rule reads only recorded facts. A rule expression has no clock,
randomness or I/O (`evaluator.ts:1-14`). So anything from outside the room
(an analyzer, a model, a monitor) enters as a signed fact from a named
member, with its tool or model version, and the exact version and tree it
describes. Guards check the source and the binding, not the expression.

**Freshness is a native guard, not a timestamp.** An observation holds an
`until` time, and the native `before` guard compares it with the host's
clock reading, answering `clock-behind` when the reading is behind the
history (`guards.ts:229-235`). A presence guard must come first, because
a guard on an unbound subject is skipped (`guards.ts:131-136`). Expired,
missing or unknown evidence leaves automatic landing unmet. An
observation time stamped by the host, and a bound on `until` from it, are
future native forms. Until then, the source chooses `until`.

These future thresholds are examples, not commitments:

| Threshold | Producer | Recorded as | Rule shape | Needs |
|---|---|---|---|---|
| Semantic conflict | Analyzer job | A check result with a number | `conflicts = 0`, else escalate | Check runner (MVP S7); numbers on a result, which has only `outcome`, `reason`, `tree`, `details` (`change.ts:144-155`) |
| Trust | People, by a reviewed act | A rules value | lookup by author | The rules version of 4.1 |
| Performance or size | Benchmark job | Result numbers and main's value | p95 or size within 5% of main | Check runner; numbers |
| Production health | Monitor member | An observation with `until` | no automatic landing while the error budget is spent | Observability (`notes/2026-10-12-observability-design.md`); host-stamped time |
| Dependencies (optional) | Scanner | A bounded list of advisories | no new high-severity advisory | Check runner |

## 6. Order and size

| Order | Step | Kind | Size |
|---|---|---|---|
| 1 | Section 3: assessments, dispositions, the landing member | data, local | medium |
| 2 | Evidence rules' version | host | medium (own request) |
| 3 | Section 4: destination version with both routes; rules with the policy's values; bound inputs | host, contract | large (own design) |
| 4 | Check runner (MVP S7); numbers on results | local, data | medium |
| 5 | Conflict analyzer: part (d) | local | medium |
| 6 | Host-stamped observations; bounded `until` | host | medium |
| 7 | Production health, after observability | host | medium |

## 7. Witnesses for step 1

- A fourth version with a failed check: `send-back` is refused
  `attempts-exhausted`, and `escalate` names a person.
- `send-back` with no failed check and no request for changes is refused.
- An assessment by an author, or for another tree, is refused; its
  assessor is the signer.
- An agent cannot sign `review-verdict`, `merge`, `send-back` or
  `escalate`; a person's `merge` needs today's approvals.
- An escalation reason outside the list is refused.

Step 3's design adds its own witnesses: the landing member with a
person's approval still meets the landing checks; a non-landing member
with only an ineligible approval is refused; and after a lost reply the
landing member settles without sending again.

## 8. Findings map

| Review | Finding | Answer in draft 3 |
|---|---|---|
| Draft 1 | F1: `auto-merge` cannot land | Section 4.1: automatic landing needs a destination version; no new merge kind. |
| Draft 1 | F2: no confidence value | Section 3: `assessment`, with the assessor stored as a signer party, separate from approval. |
| Draft 1 | F3: attempt semantics | 1(b); the attempt guard is last on `send-back`. |
| Draft 1 | F4: freshness | Section 5: native `before` with a presence guard; host-stamped time named as future. |
| Draft 2 | F1: the approval branch is no fence | Removed. 4.1 names the destination support: an eligible-approval floor on the human route and a checked landing route. Old pins unchanged. |
| Draft 2 | F2: five subjects; assessor not stored | 4.2 names the bound and the support needed. Section 3 stores the assessor as a signer party. |
| Draft 2 | F3: open outcomes | 4.3: pending until `published`; settle, never resend; a closed mapping. Section 3's reasons are a closed list. |
