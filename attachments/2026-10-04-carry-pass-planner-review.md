# Carry-pass amendment: planning review

2026-10-04. Draft 2: changes requested under builder's evidence-only
planning-review request `49d6d0700a18cbf3738c9da9a71a8493fa754088`,
planner promise `d95e3e224d8480e6d199b15952f06a3a92a1255d`.
This live request owes a decision with reasons, no Git artifact or landing.
It replaces `795d0ad4`, retired by `7a792d51`; the earlier delivery
`2f9952c3` was ineffective because that request inherited a landing duty.

Reviewed proposal: `notes/2026-10-04-carry-pass-amendment.md` at
`b008a326486bb823823a71ecd4778a734c609d7a`, 8,726 UTF-8 bytes,
153 lines, SHA256
`5c0fd23de05d9be49addb06409216e0975aaa60d868240c8682aa1c81a8c47b2`.
The complete proposal and the source boundaries below were read. This is
a planning decision with reasons, not adoption, source approval or a
reproduced verifier failure. Main remains `e6e67828`.

The complete proposal is byte-for-byte unchanged at `947fb909`, including
its ten acceptance cases and three questions. Source `39430e23`, also
present at `048c7411` and `947fb909`, adds a current policy/obligation fence
before sealing a carry and keys kept land evaluations by policy version.
Those repairs are under Stage 2 review `306abff3`; no operative approval
is credited here. Returning from a pass without a public end record is
not the recorded cancellation/supersession required by this amendment.
It does not supply the independent lifecycle anchor or complete-call
accounting. Corrections A–F and all ten acceptance cases still apply.

## 1. Decision and scope

Keep the proposed direction: a recorded pass, a deterministic candidate
order, both positive and negative judgments, explicit stopping, and an
independent preparation fact that makes the pass owed. Request changes
before adopting R-CARRY-17/18. The ten acceptance stories remain; none is
removed to make the proposal easier to satisfy.

The proposal addresses original Stage 3 condition 2 under `1e8fee4b` /
`3af8ebc7`. That condition remains owed. Delivering this review satisfies
the review request's decision-with-reasons requirement only. It does not
complete Stage 3, Stage 4 or builder's first-Jam readiness judgment.

Read sources at `b008a326`: protocol R-CARRY-13/14, R-LAND-4/5/6/7,
R-DECL-14/20/25 and sections 33.8/34; Room `readiness`,
`evaluateLandRules` and `carryChecks`; Git landing engine `evaluateNow`.
The source candidate's actor/revocation fence is subject to the current
Stage 2 delta and Stage 3 reviews. It is not a landed guarantee.

## 2. Required corrections

### A. Enforcement cannot begin at the first pass event

P2. The compatibility paragraph applies the new rules from the first
`carry-started`. Removing the first whole pass, or all pass groups, also
removes that enabling condition. The proposed whole-pass deletion case
can therefore fall back to the old rules precisely when it needs the new
ones. A later surviving pass does not repair coverage of the earlier one.

Require a separately established protocol/feature boundary, independent
of the pass group being checked. Define its authoritative retained
identity, the exact sequence at which it takes effect, the affected
preparations and how a verifier learns it. A missing mandatory marker or
unsupported version must not be interpreted as permission to use the old
semantics. A verifier must report the exact supported prefix and limit.

Existing R-DECL-14 gives one possible versioned model, but introducing a
new steps version also changes every binding and requires regrant. Do
not silently impose that consequence or reuse an existing version for
new semantics. A different platform-feature boundary needs its own
explicit contract and migration story. Bring back the chosen encoding
for review; the phrase "first carry-started" is not an encoding that
meets the requirement.

Retain legacy verification under its actual recorded version and state
its proof limits. After the new boundary, verify must detect deletion of
the first and only pass as well as deletion of a middle pass. It must also
reject deletion or substitution of the mandatory version/witness in a
later prefix that otherwise claims the new guarantee.

### B. Define the owed order and the fact positions separately

P2. Step 2 freezes obligation state, candidates and previously sealed
judgments. Step 4 then re-evaluates on later facts. The verifier wording
says to derive the whole order at `carry-started`, without defining how
later actor, revocation, direct-check or already-judged facts affect it.
These are different positions and need different rules.

State which facts are fixed for a pass and which are rebuilt at a
judgment's sealing position. One coherent choice is to pin candidate
membership and order at the start, while checking current authority and
revocation at each seal; then every retained context and decision must
match that later fold. Define explicitly whether a direct check that
arrives during a pass stops its remaining judgments or leaves the
start-derived work owed. Both producer and verifier must use the same
choice. It cannot be an unrecorded early return.

Preserve one judgment per existing lane/generation/integration/obligation/
check/policy key. When a previous judgment is reused, identify the earlier
event and verify its qualification; a newly started pass does not get to
invent another judgment or omit a negative one merely because another
operation touched the same key. Derive the required evaluator calls,
inputs and meter progression, rather than accepting a supplied list as
proof of completeness.

Activation or another preparation must not let an obsolete pass seal a
new current judgment. Identify legitimate retained-policy replay
separately from permission for the producer to keep writing. The current
candidate's carry closure captures policy/configuration/generation while
re-reading actor and revocation facts; that source-review question is
already with the functional checker.

### C. A pass identity must carry its producer fence

P2. A rising pass number is useful identity, but it does not by itself
tie a result to the engine's current attempt or evaluation. The engine
applies readiness with an attempt and evaluation revision after its await.
R-LAND-5 can replace preparation while keeping the operation ID. The new
pass must not allow an earlier asynchronous producer to write between
start and the engine's final-answer fence.

Keep the per-operation pass number, allocated durably and atomically with
the start. Bind it to a retained preparation identity, operation, lane,
generation, integration and policy, plus the producer attempt/revision or
an explicitly equivalent recorded epoch. Define which event supersedes
that epoch when main, policy or preparation changes. The verifier needs
an observable basis for the fence; adding an unchecked number is not
enough.

At every post-await seal, check current ownership of that fence and the
pass's open state in the same transaction as the judgment. After a newer
pass takes ownership, the old pass may record its permitted closure but
may not add a judgment. Cover restart and an old evaluation returning
after replacement, including a replacement with a different integration
or policy. Retain bounded work and retry scheduling: repeated fact
changes cannot turn one pass into an unlimited synchronous retry loop.

### D. Closing a pass needs an exact frontier and lifecycle

P2. "A prefix of the order" is necessary but insufficient for every
early-stop reason. `no-tree` currently supplies no stopped obligation or
read stage. A prefix ending midway through an obligation cannot be
accepted as a tree read failure when that read should have happened
before its first judgment. Define the legal stop frontier and the safe
recorded provider fact/proof limit; do not let the reason exempt arbitrary
missing judgments. A later fetched tree cannot prove that an earlier
provider read succeeded, so disclose that limit honestly.

Decide completion before jobs and later progress. The current producer
finishes `carryChecks` before `oweJobs`; the draft promises only a start
before a job. State the required completed or legitimately stopped pass
before issuing jobs, and a current completed pass before
`land-evaluated`/reservation. A stopped pass cannot become a completed
one merely because a direct check subsequently arrives. A fresh empty
pass may complete when the start fold owes no carry judgments.

Identify the later barriers that a public verifier can actually read.
Issuing a `CheckJob` is not itself one of R-LOG-5's listed system events;
the proposal adds only the two pass events. A private job table or an
unpublished RPC cannot stand in for a sealed later-job witness. If the
verifier's "later job" rule requires another recorded fact, define it and
its producer/consumer ownership. A signed admitted check and a sealed
landing event have their own explicit bindings and are different facts.

Cancellation must not depend on the abandoned worker returning. A
recorded terminal or invalidating operation transition should close its
open passes by a defined derived rule, or seal their closure atomically.
Name the covered events and the treatment of re-preparation; the end
state must be recoverable from the log. A late explicit closure is at
most an idempotent confirmation of that earlier boundary. It cannot
reopen the pass or permit a late judgment.

An unfinished published prefix is valid while its preparation remains
live and has no completion/invalidation boundary. Report it as pending,
without claiming complete accounting. An operation already ended in the
fold is not an indefinitely unfinished pass. An ended `complete` pass,
a valid external stop and a cancelled pass have different obligations;
state and check each one.

### E. Preserve preview and recovery boundaries

P3. Keep previews outside this initial carry-pass amendment, as proposed.
Use the `prepared` event's owner discriminator. A preview check later
used as an earlier candidate is not a job or check of a landing merely
because its generation or integration matches. Do not demand a landing
pass for preview-only work or weaken its own prepared/check binding.

Configuration recovery has no carry or land rules under R-ADMIN-8 and
R-DECL-21. State explicitly whether it records an empty pass for the
preparation grammar or has a checked exemption. Either choice must keep
recovery available and execute no policy rules. "All landings have a
pass" and the existing no-land-evaluated recovery path must agree.

### F. Record scope, adoption and completion accurately

P3. Keep the proposed numbers R-CARRY-17/18 for a revised draft. At the
reviewed composed head, section 34 already holds amendment 7 for MCP;
the proposed placement is section 35, amendment 8, "Carry-pass
accounting", subject to checking the actual integration head before
numbering. Amend R-CARRY-13, R-LOG-5/10 and R-LAND-4 explicitly, reserve
the two system names under R-DECL-2, and map the new contract types,
retained/version boundary, upgrade path and acceptance cases. Numbering
here is a proposal, not adoption.

Keep current owners: Stage 4 `48c021ea` / `8d497ff5` owns the prepared
producer and integrated Room/job lifecycle; original Stage 3 `1e8fee4b` /
`3af8ebc7` retains the verifier and complete-call accounting outcome.
Coordinate the shared event/types/consumer seam at one reviewed head;
do not silently transfer or close the original Stage 3 promise. Stage 4's
condition 3 already requires a working consumer before production emits
new facts. No duplicate implementation request is required by this review.

Only independent review of the complete new producer/consumer behavior,
with both original scopes explicitly bound and its main landing verified,
can establish the carry portion of condition 2. Stage 4 landing alone
does not establish all Stage 3 evaluator/call/budget outcomes. Record the
specific outcome and any remaining original acceptance separately.

## 3. Answers to the three open questions

| Question | Proposed decision for the revised contract |
|---|---|
| Per-operation pass number | Keep it as durable identity, and require the preparation/fence binding in C. A count alone is insufficient. Reuse the engine's actual attempt/revision where possible; do not infer authority from an unbound field. |
| Cancellation while an external read is outstanding | Derive closure from a named recorded terminal/invalidation boundary, or record it atomically there. The old worker need not return. Published-prefix pending is valid only before such a boundary. |
| Previews | Exclude preview-owned preparation from this amendment initially, with an explicit owner distinction and ordinary preview/check guards retained. |

These are planning recommendations accompanying changes requested. The
revised exact contract, its activation encoding and recovery treatment
still need acceptance before implementation relies on them.

## 4. Retained acceptance and focused controls

Retain every original story, with the corrected boundaries:

| Original story | Required observable result |
|---|---|
| Two obligations; first uses second-newest check | Complete start-derived order, negative then positive judgment, second obligation, current completed pass; verifies |
| Remove a negative judgment | Required judgment missing at the completed pass's verified frontier; `decision-missing` |
| Remove the whole pass and reseal | First/only and middle pass deletion detected under the independently recorded active semantics, without falling back to legacy |
| Advisory obligation with only a non-carried candidate | Negative judgment remains owed; deletion is detected even when no positive carry is later gained |
| Overlap | Legitimate prefix and supersession verify; an obsolete pass's later judgment is `decision-extra` |
| Tree unavailable | A legally placed, identified stop verifies with its actual provider/Git proof limit; it cannot be named as a completed current pass |
| Facts change during evaluation | One judgment on the defined later facts, with matching reconstructed context; no stale or duplicate seal |
| Published prefix inside a live pass | Verify reports valid pending work, without claiming completion or accepting later work forbidden by its pending state |
| Judgment after end | `decision-extra`, including end derived from a recorded cancellation or replacement |
| Pre-amendment log | Old recorded semantics and disclosed proof limits retained; new semantics never enabled solely by seeing the first pass |

Group focused positive/negative controls around four useful boundaries:
independent activation plus whole-group deletion; ordered completion and
legal stops; replacement/cancellation/restart fences; current context and
legacy/preview/recovery compatibility. Reuse the already delivered honest
overlap, missing-tree and held-evaluation evidence when its meaning and
dependencies still fit. Include direct-check arrival, policy activation
and different-integration replacement as the relevant changes require.
Do not commission a per-field mutation sweep or rerun the old baseline.

## 5. Review evidence and next action

No test, installation, external side effect or source edit was performed
for this review. Its findings follow from the complete proposed grammar
and the cited source ordering. The first-pass deletion is a design
counterexample, not a newly run failing fixture. Builder's reported
carry/revocation reproduction and candidate controls remain their
separate evidence, subject to functional review.

Planner writes only this review and the planning index. Whitespace and
exact frozen attachment readback verify the saved review. Builder should
revise the existing amendment note with A–F, retain its full ten-story
scope, choose the explicit activation encoding, and return the exact
revision for planner review. After acceptance, integrate through the
existing Stage 3/4 owners and normal independent review/landing. The
row-write effect stays under existing `92ddf4cc`, including empty passes,
overlap, stops and restart; this review makes no row or cost measurement.
The full amendment is not a new first-Jam gate. Builder retains that
readiness decision, and the manual proceeds beside Jam when work starts.
