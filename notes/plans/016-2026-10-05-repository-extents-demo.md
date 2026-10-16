# Repository extents in the coding demo

2026-10-05. Draft 1. Proposal for request `1cc4283f`, promised in
`60690113`, paired with builder request `42de9e34`. Independent review
and adoption are required. This note changes no source or lane digest.

## The experience

A person starts issue #42 on device A, leaves the hosted agents working,
and returns on device B to review pull request #43. The Files changed
view groups the exact manifest's changes by the repository's configured
extents. Each group shows who may review it, who may authorize its
landing, and whether landing opens an additional outside effect.

The existing issue, contribution, manifest, check, review and publication
journey remains. This adds policy evidence to that journey. Model activity
does not meet an obligation: only the recorded verdicts, authorizations,
checks and outcomes shown for the exact subject do.

## The example policy

The repository's rules name at least three extents. Paths below are demo
examples, not a fixed vocabulary imposed on other installations.

| Extent | Example resources | Review obligation | Holding and landing authority | Additional effect |
|---|---|---|---|---|
| source | Application source and ordinary documentation | One eligible independent source reviewer | Members explicitly authorized for source work; merger also needs publication authority | None |
| infrastructure | Deployment configuration and infrastructure resources | One eligible independent infrastructure reviewer | Members explicitly authorized for this extent and its named destination | Apply the exact accepted configuration to a named demo environment |
| rules | The rules definition, agent instructions such as AGENTS.md and CLAUDE.md, CI and automation definitions, and definition activations | The rules scope's controller must meet the obligation | Only that controller can authorize a rules change's landing | The exact activation, if the proposal changes active policy |

Review authority is distinct from work-holding authority and from effect
authority. A member can hold several of them explicitly. A feature reviewer
does not acquire rules authority by contributing code or by being an admin
under the existing broad role table. The controller is a recorded identity,
not a browser session or the device that happened to create the room.

These are proposed extent semantics. The adopted flat rules value does not
already enforce them. Existing authorship and independent-review restrictions
continue to apply. If the rules controller is also an author or integrator,
the proposal is visibly blocked; controller-only authority must not silently
waive independence. A replacement authorized controller or an explicitly
reviewed recovery policy is needed. The exact handover/recovery act is an
owned design choice, not an implementation convenience.

## Classification and composition

Classification covers the entire difference between the manifest's exact
base and integration tree: additions, modifications, deletions, renames and
resource activations. Both old and new paths participate for a rename.
Automation or instruction files cannot escape the rules extent merely by
moving them. Activation records are resources even when no Git path changes.

The policy must define matches, overlapping extents and unmatched resources.
The proposed default is composition: every matching extent applies, and an
unclassified resource blocks authorization with an understandable reason.
A source fallback must exclude the protected rules and infrastructure sets.
No first-match rule may discard a stronger matching obligation.

One change touching source and infrastructure requires both obligations.
The same independent person may meet both only if explicitly eligible for
both; the demo uses two different people to show the boundary. Each verdict
must have an explicit extent coverage or an equivalent retained policy-derived
coverage. A global approval count cannot stand in for that evidence.

Changing the extent policy is itself a rules-extent change. The currently
active policy judges that proposal; the proposed policy cannot authorize its
own adoption, reclassify away its protected files or remove the obligation
before it is met. Activation has its own recorded authorization and checks.
Any recovery exception must be an explicit reviewed authority rule, not a
branch rule that silently exempts its author.

Classification names the exact policy revision, base, integration commit,
tree and classified resources. Its evidence must survive replay. A user or
model supplying a list of paths is not authoritative. Destination reservation
checks the complete classification and obligations under the policy it
observes, rather than trusting a lane's pre-counted approvals. If the policy,
manifest or base changes, old coverage is not carried by default: the rule
must state and record why any carried evidence remains applicable.

## Demo journey and acceptance witnesses

| Step | What the person does and sees | Required recorded outcome |
|---|---|---|
| Setup | Create or join the room, import the example repository and inspect its three extents | Exact policy and activation checks; member/controller bindings; no credential in the record |
| Issue | File #42 with useful source and infrastructure work and assign authorized agents | Accepted conditions and commitments; a hold refused outside its extent cannot dispatch work there |
| Hosted work | Watch concerns and reports, steer the agent and leave device A | Existing durable conversation/workspace acceptance remains required; no connection-based revocation |
| Assembly | Open #43 from selected contribution facts | Exact base, integration commit, tree and complete extent classification |
| Device B | Return as the same member and open Files changed | Existing identity/device acceptance plus the same recorded extent state; a read session grants no control |
| First review | Source reviewer approves | Source obligation met; infrastructure obligation still unmet; Merge stays blocked |
| Unauthorized review | Source-only reviewer attempts to cover infrastructure | Refused or recorded but not counted, with the exact boundary stated; no infrastructure obligation is met |
| Second review | Infrastructure reviewer approves after the combined check passes | Both obligations met by independent eligible members on the exact manifest |
| Publication | Authorized merger requests landing; lose the Git reply | Existing destination reservation/unknown/publication reconciliation; no blind repeat or premature success |
| Infrastructure effect | Inspect the named environment's update | Separate operation, attempt and outcome for the additional effect, bound to the publication and configuration |
| Completion | Inspect #42 and #43 | Git publication and infrastructure outcome shown separately; requester's acceptance remains its own recorded judgment |

Add two companion pull requests in the same browser journey. A source-only
or documentation-only change publishes through ordinary Git review and
records no additional extent effect. A rules change touches the policy,
agent instructions and a CI definition: feature approval alone never enables
landing, and only the rules controller can supply the required authorization.
The controller's successful case uses work authored and integrated by others.
Show an unauthorized active device refused and one revoked device unable to
submit a new authorization while the same member's other active key retains
its recorded authority.

The browser must distinguish waiting for a reviewer, unavailable authority,
policy not met, publication in progress, publication confirmed, effect queued,
effect unknown, effect confirmed and effect refused. An unknown infrastructure
effect does not undo Git publication or justify relanding the code. Unrelated
lanes continue; a repeated exact user action recovers its durable result.

## Additional infrastructure effects and recovery

Git publication is already an outside effect for every extent. “None” above
means no additional extent-specific effect; it never means Git has no outside
destination or uncertain-outcome protocol.

The infrastructure policy declares an explicit destination, configuration
digest, authorized effect owner and operation kind. The demo destination is
a separately named test environment, not production. A real local controlled
adapter can prove the protocol boundary; any provider-hosted claim requires
its own evidence. Nothing in this note authorizes deployment to an account.

Open the additional operation only from the recorded qualifying publication,
with one stable identity. Seal the attempt before dispatch. A lost answer is
unknown and retains credentials/resource custody and closure reservations.
Reconcile the exact operation using that destination's stated evidence and
idempotency contract. Never assume an unchanged read proves the earlier
request cannot arrive. Retry only when safe under the explicit contract;
otherwise require reconciliation or an authorized loss/abandonment decision.

Recovery shows a host interruption before dispatch, a lost answer after
dispatch, and a late answer. Resume from durable state without opening a
second logical effect or repeating an uncertain command. Cancellation after
dispatch does not undo it. Compensation is a separate explicitly authorized
operation if the destination supports it; no rollback is invented. Checkpoint
restore alone cannot settle the outside effect. This reuses the common ledger
and the five capacity dimensions, not a second effect engine.

## Exact dependencies and required successors

Read scope: targeted current clauses, not fresh whole-package review.

| Adopted source | Relevant rows | What stands; what this story still needs |
|---|---|---|
| R4 revision 9, `85be9f0b`, invariants O9; main sections 4.2, 9.4, 9.5 and R4-7 | Activation observations, visible rules-not-met, repair after membership changes | Replace the conditional flat-policy witness with this full demo acceptance. Activation must retain what was checked and the observed head; it cannot guarantee future independent reviewers. |
| R0 revision 4, `3b6e1ad7`, steps 9–15 and section 4.1 | Assembly, exact reviews/checks, device B, changed base, unknown publication, requester acceptance | Preserve all existing outcomes; add the extent rows and companion changes. The baseline's “no production push” remains. |
| R2 revision 14, `4b3bf5da`, sections 7.1 and 7.3 | Member-based verdicts, authorship exclusion, global approval count and required checks; destination has final say | Extent-specific coverage and obligations are missing from this flat model. Name the successor form/transport decision before dependent source. Lane digests remain unchanged under the current commission; any unavoidable lane-data change needs a separate reviewed successor. |
| R3 revision 20, `4ef1a5e3`, sections 3.2, 3.10, 6.5 and 12.1.4 | Broad rules roles, independence, destination rejudgment, flat publish/rules-wanted/RulesContent | Needs customizable extent resources, review/hold/effect authority, recorded rules controller, exact classification and extent-aware reservation. Current flat observations cannot silently carry the new policy. R3 owns the authority successor with R1/R2 for forms. |
| R1 revision 15, `7f1ea903`, rule marks, retained observations and replay | Pure derivation, retained inputs, membership binding, whole-version refusal | Any new policy/coverage/classification input must have a bounded declared retained form; no unrecorded Git/network read in a commit. R1 owns needed form decisions. |
| I3 `bcf5ec17`, paired `42de9e34`; capability successor `a23dc307`; capacity `cc570904` | Platform rules, publication ledger, retained Git inputs and whole closure | EH decisions and complete pure rules precede real bootstrap. Additional effect openings/owners/closure need explicit design and implementation; static counts alone prove no capacity acceptance. |

The first rules definition cannot be described as implementing extents until
these missing forms and authority conditions are reviewed and adopted. This
note is the acceptance target and dependency inventory, not those detailed
protocol amendments. Builder records each missing form with its owner;
implementation remains under the existing I3 commission. No broad compatibility
layer or restored legacy policy pack is implied.

## Open choices and evidence owed

Decide in the successors: the extent selector language and resource identity;
the signed policy/controller binding and its handover/recovery; explicit review
coverage versus retained derivation; complete diff/classification evidence;
effect triggering and destination contract; activation check envelope; bounds
for matches, coverage, evidence and effect closure. No provider is selected.

Acceptance needs one complete recorded browser issue-to-pull-request run with
the mixed, source-only and rules-change cases above, plus the infrastructure
interruption variants through the real effect boundary. Component witnesses
may share compact fixtures; they cannot substitute for the browser journey.
Exact source receives ordinary review and landing before runtime acceptance.
Useful-invariant test economy remains highest priority. This adds no numerical
test quota or fixed Jam gate, and does not close any original hosted/browser/
device story merely by specifying its extent-policy portion.
