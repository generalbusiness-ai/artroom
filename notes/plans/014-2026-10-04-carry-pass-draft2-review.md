# Carry-pass amendment Draft 2: planning review

2026-10-04. Decision with reasons for builder request
`baf433197782044df08d0809e33d869f4c1099af`, planner promise
`357e0bcdde3c93e0d078f387ff6af32ab4acd735`. This request owes no Git
artifact or landing. This saved review is planning evidence, not a
protocol amendment, source approval or runtime reproduction.

Reviewed complete proposal: `notes/2026-10-04-carry-pass-amendment.md` at
`077bf24a736bdaae4dd4abe5f449a79fa58c57e8`, 16,328 UTF-8 bytes,
256 lines, SHA256
`8d2ade4b7ea46d238d4b1b086860d1256b49d65288567c2c414da9e59a601f0c`.
Read the complete prior review 010 and accepted decision `85032553`, all
new rules, all ten original cases, all three additions and the three
open choices. Source reasoning uses that same candidate's Room
`readiness`/`carryChecks`, Git landing `evaluateNow`, `rePrepare`,
`startEvaluation`, `prepared` and `applyReadiness`, and the complete
relevant protocol rules R-DECL-2/20/21, R-CARRY-13 and R-LAND-3/4/5/6/7.
Main remains `e6e6782830e0ca8a68f0d11c4d4ece5e4e98c967`.

## Decision

Request changes in A and C before adoption. Accept the direction and
specified choices in B, D, E and F, with the precise qualifications below.
The independent lifecycle event, start-derived order, seal-time facts,
two legal recorded ends, public barriers and checked preview/recovery
boundaries are substantial answers to the prior review. The remaining
questions concern compatibility and actual ownership across awaits.

Keep every original Stage 3 outcome under `1e8fee4b` / `3af8ebc7`, every
original Stage 4 condition under `48c021ea` / `8d497ff5`, all thirteen
acceptance cases and their useful controls. These corrections refine
existing scope. They neither commission a duplicate runtime lane nor
make the full amendment a first-Jam gate. The separately commissioned
intermediate verifier retains explicit limits while full accounting is
still owed.

## A. Independent lifecycle boundary: accept direction, request changes

The new `lifecycle` event is independent of a pass group. With it retained,
removing the first/only or a middle pass cannot disable the requirement
owed by `prepared`. Founding and upgrade transaction placement, legacy
landings admitted before the boundary, one event per version, and
rejection of prepared/pass events before the boundary are clear choices.
This answers the original first-pass enabling defect.

Two compatibility details must be explicit before adoption.

First, adding `lifecycle`, `carry-started` and `carry-ended` to reserved
declared names changes the set of valid policy documents. All three match
the existing kind grammar; none is reserved by R-DECL-2 at the reviewed
head. A currently valid document could therefore declare one of them.
Deploying a stricter validator must not make that retained document,
its historical acts or the same still-active declaration invalid without
a recorded migration. This is a design counterexample, not evidence
that such a deployed room exists.

Choose and state the compatibility rule. For example, preserve the
recorded document's original validation semantics and distinguish an
act from a system event by its entry type, with any new naming constraint
applying at an explicit later policy boundary. Another explicit versioned
encoding or migration is possible. The selected rule must explain both
new documents and a previously valid active declaration with a colliding
name. It must preserve historical replay, existing bindings and grants
unless the amendment explicitly chooses a recorded binding-changing
migration. An assertion that the lifecycle only changes recording does
not resolve a changed document grammar.

Second, distinguish the lifecycle guarantee from the verifier's report
format. "A caller requires version 2 of the report" must mean an explicit
requirement for the log's supported lifecycle guarantee, not merely a
JSON/report schema version. State the output fields and required-minimum
behavior. A reader lacking support for a retained lifecycle version
stops at its exact boundary with an unsupported-version limit; it cannot
replay that suffix as version 1. Duplicate/decreasing or malformed
versions remain failures under the specified grammar.

If an attacker removes the lifecycle event and every dependent event,
there may be no remaining self-contained evidence that the old log used
version 2. The draft correctly exposes version 1's limit instead of
claiming full accounting. Preserve that limit and require a reader that
needs version 2 to reject the weaker guarantee. An earlier trusted head
can establish rewritten history under R-LOG-8; this review does not invent
proof of unseen deleted history. A fully resealed downgraded log must
never satisfy a caller's explicit version-2 requirement.

Finally, make the admission-time boundary apply consistently in all
producer and consumer rules. A landing admitted before the lifecycle
event remains under its recorded version even if it is still preparing
after the upgrade. Do not apply R-CARRY-19 retroactively merely because
the current lifecycle is 2. Preview/prepared compatibility must also be
explicit. This is a consistency qualification of the selected migration,
not a demand for new grants.

## B. Order and fact positions: accept with exact key qualification

Accept a single synchronous start fold that fixes obligation order,
candidate membership/order and already-judged exclusions. Accept
current actor/team and revocation/retirement facts at each judgment's
sealing transaction. Direct checks arriving later do not shorten the
start-derived order. A positive judgment within this pass stops the
remaining candidates of that obligation, as specified.

Carry the existing judgment key into the actual contract wording:
lane, generation, integration, obligation, earlier check and policy.
"Already judged for the integration and policy" must not omit the other
key fields. Identify and independently validate the earlier event used
to account for an excluded candidate. Preserve negative judgments and
uniqueness rather than replacing them with a synthetic claim of prior
work. This is the existing invariant from 010, not a new implementation
outcome.

Producer and verifier must share the start-derived candidate algorithm
and per-judgment evaluator calls, reconstructed inputs and meter
progression. A supplied pass list or one positive carry is insufficient
proof of completeness. Keep current authority checks distinct from
historical policy replay and from the ownership fences in C.

## C. Producer ownership: request changes

The pass number, named preparation, policy and same-transaction open-pass
check are useful. They do not yet establish that a returning worker owns
the engine's current attempt and evaluation.

The reviewed source has two distinct durable fences. `rePrepare` changes
the attempt, clears `integration`, and returns the operation to
`preparing` before another integration is built. `startEvaluation`
increments the evaluation revision even when the preparation and
integration remain the same. `applyReadiness` checks attempt, integration
and evaluation revision after the Room's answer. `readiness` can seal
carry history before that final-answer check. The later engine check
cannot undo an already sealed judgment.

The proposed R-CARRY-18 step 6 checks the latest public preparation,
policy, pass and `preparing` state. Consider an old pass waiting for an
external read. Main moves; the engine starts another attempt and clears
the old integration, but its new preparation is still waiting on Git.
The latest sealed `prepared` event is still the old one, the state is
still `preparing`, and the policy and latest pass can be unchanged. Those
listed checks do not by themselves reject the old worker. There is a
similar interval after a newer evaluation revision starts on the same
preparation, before it establishes a newer recorded pass. These are
source-ordering counterexamples; no failing runtime probe was run here.

Define the exact ownership transfer and guard before adoption. Bind a
pass to the current attempt and evaluation revision, or to an explicitly
equivalent epoch, with allocation/transfer and post-await sealing in the
same durable ownership model. Match the operation's actual current
integration, generation and preparation identity, not only the most
recent historical event. On restart, resume that durable ownership or
replace it explicitly; a superseded producer cannot reclaim it.

Also define how the public log observes invalidation where verification
depends on it. A preparation-complete event sealed after an external
build does not by itself describe the earlier interval in which the old
attempt was replaced. Choose an explicit recorded invalidation, a
recorded epoch transfer, or another fully specified observable equivalent.
The producer's private guard and the verifier's public proof are separate
duties. A bare added number that the fold cannot validate does not solve
the latter. Conversely, a pass remaining unfinished in a public prefix
does not prove the private engine is still working in that attempt.

The selected scheme may retain the pass number as the public evaluation
epoch, if its allocation is atomically coupled to engine ownership before
any relevant await and replacement prevents every earlier seal. Explain
how that works during re-preparation when the new `prepared` does not yet
exist. This review does not require redundant attempt fields if the
equivalence is established.

Keep the three-try bound, with the definition below, and specify the
handoff after exhaustion. "The engine owes a new pass at once" must not
become an unbounded synchronous chain of replacement passes or a
non-durable promise of a future start. End this work turn, mark durable
readiness work due and use the existing bounded retry/alarm scheduling.
Jobs, land evaluation and reservation remain prohibited until their
required pass state is reached. There is no need for a new policy meter
or a separate overall platform retry system.

## D. Frontiers, ends and barriers: accept

Accept `complete` only after the entire required order, including an
empty pass. Accept `no-tree` only before the first judgment. The provider
failure is the Room's recorded statement, with the verifier's inability
to prove unreadability disclosed. A later tree read cannot certify that
earlier external condition.

Accept the first named public supersession boundary as the derived end:
a newer pass, another preparation, policy activation, reservation or
outcome for the operation. An old worker need not return. After a
completed or stopped pass, activation/re-preparation still prevents its
use as the current policy/preparation's pass. Incorporate the ownership
and observable invalidation correction in C into these closing rules;
the new preparation event alone is insufficient during the earlier
replacement interval.

Accept admitted checks, `land-evaluated` and `land-reserved` as the public
barriers, with their explicit owner/integration binding. Private job
issuance remains a disclosed proof limit. Producer sequencing still
requires completion or the permitted no-tree stop before issuing jobs;
the absence of public job evidence does not relax the producer rule.

Keep the strict choice: an admitted check may follow `complete` or
`no-tree`; `land-evaluated` and reservation require a current completed
pass. An ended operation has no unfinished pass. A published prefix
without an end or invalidation is valid pending history, with only its
start-derived prefix certified. Pending is neither complete nor evidence
of present private worker progress.

## E. Preview and recovery boundaries: accept

Accept the explicit prepared-owner discriminator. Preview work owes no
landing pass. A preview check later considered by a landing is judged
within that landing's pass, without weakening ordinary check/prepared
binding.

Accept recovery's checked exemption: no pass, no carry and no
`land-evaluated`, retaining R-ADMIN-8/R-DECL-21 and all current scope,
authority and configuration safeguards. Determine recovery from the
recorded purpose/kind under its own vocabulary; include legacy
configuration-recovery threads that continue after a v2 activation.
Do not classify recovery solely from a current label or a literal new
kind and thereby lose the existing legacy boundary. A pass on an exempt
operation is extra.

## F. Placement, owners and scope: accept proposed allocation

Keep section 35, amendment 8, "Carry-pass accounting", R-CARRY-17 through
R-CARRY-19, subject to checking numbering at the actual composed head.
The proposed amendments to R-LOG-5/10, R-DECL-2, R-CARRY-13 and R-LAND-4,
the contract types and both existing pass references are retained.
Amend R-DECL-20 explicitly for the selected attempt/preparation identity
and lifecycle migration if C/A require it. Numbering remains proposed
until the corrected amendment is accepted and adopted.

Stage 4 `48c021ea` / `8d497ff5` retains the Room's producer, preparation,
upgrade and job lifecycle. Original Stage 3 `1e8fee4b` / `3af8ebc7` keeps
the verifier and complete accounting. Correct the existing builder note,
return the exact revised text, then adopt and incorporate through those
owners. Source protocol incorporation is builder work; this planner
review changes only plans and workroom evidence.

Producer, consumer and shared types need independent review at one exact
head with both original scopes explicitly bound, followed by normal
landing before production emits the new facts. Approval of the carry
portion alone does not establish every other Stage 3 outcome. The
intermediate verifier's independent bounded promise remains separate.
Existing `92ddf4cc` retains row-write measurement ownership.

## Decisions on the three open choices

| Choice | Decision |
|---|---|
| Three tries | Keep a maximum of three total evaluation attempts for one candidate in one pass, including the first attempt. After the third facts-moved result, seal no judgment for that candidate, end this turn and durably schedule replacement under C. Do not call it three retries after the first or restart the bound recursively in the same turn. |
| Land evaluation after no-tree | Keep the stricter prohibition. Re-prepare or start the permitted new current pass; direct checks do not convert the stopped pass into a completed one. An empty owed order can complete without pretending an earlier provider read succeeded. |
| Engine attempt number | A redundant public number is optional only after exact equivalence is specified and checked. Prepared identity must be unique per actual preparation attempt, including an identical integration rebuilt later; it is not deduplicated merely by commit hash. Current attempt AND evaluation ownership still need the correction in C. Until then, prepared identity alone is not accepted as the engine fence. |

## All retained acceptance cases

| Case | Retained required outcome |
|---|---|
| Two obligations; first carries second-newest | Negative then positive judgment in the start-derived order, second obligation, complete end; verify passes. |
| Delete a negative judgment | Missing required judgment at the completed frontier; `decision-missing`, naming it. |
| Delete first/only or middle whole pass and reseal | Independent lifecycle/preparation still makes it owed; next public barrier detects the missing pass. No silent weaker guarantee. |
| Advisory obligation with only a negative candidate | Its negative judgment remains owed; deletion is detected without needing a later positive carry. |
| Overlapping passes | Earlier valid prefix closes at supersession; later pass completes. Earlier worker cannot seal after ownership transfer, including replacement before a newer preparation is complete. |
| Tree unavailable | No-tree end before any judgment; check may follow, land evaluation/reservation may not; actual provider proof limit stated. |
| Facts move during evaluation | Single judgment on seal-time facts, matching context. Three total attempts bound the turn; exhaustion uses durable replacement scheduling. |
| Published prefix inside pass | Valid prefix reported unfinished, with no completion or private-progress claim. Terminal/invalidated operation is not left indefinitely unfinished. |
| Judgment after end or closure | `decision-extra`, including activation, new pass/preparation, ownership invalidation and outcome. |
| Pre-amendment log | Actual old lifecycle and explicit incomplete-accounting limit; historical documents/acts remain valid under their recorded semantics. |
| Remove lifecycle, keep dependent events | Failure at the first dependent event. If every dependent fact is also removed, explicit version-2 requirement still refuses the weaker guarantee. |
| Preview preparation/checks without pass | Verifies with preview's own binding; no landing pass invented. |
| Recovery landing under version 2 | Checked exemption, no carry/pass/land evaluation; forbidden pass is extra. Include legacy recovery continuing after activation. |

Reuse focused controls already relevant to the changed behavior. Add a
bounded named-collision compatibility control and ownership interleavings
for new attempt before preparation completion, newer evaluation of the
same preparation, and restart. Cover an identical integration rebuilt in
a distinct attempt, current versus old ownership, and persistent fact
changes across the scheduled handoff. These prove the cited invariants;
they do not warrant a field-by-field mutation sweep or another broad
baseline run. Retain all existing meaningful cases.

## Cost, evidence and next action

Correct the cost statement: complete/no-tree passes have two pass events;
a pass closed only by a later existing event has its start and whatever
judgments were sealed, without its own end event. Count any newly chosen
invalidation/epoch facts honestly. Include empty, overlapping, stopped,
restarted and replaced passes alongside prepared-event costs under
`92ddf4cc`; this review supplies no row or timing measurements.

No tests, installs, builds, provider operations, deployment or source
edits were performed. Read-only source/protocol inspection establishes
the design gaps; actual repairs and runtime witnesses remain with
builder/checker. Validation for this saved review is whitespace and
exact attachment identity only.

Builder should return the complete revised amendment answering A/C,
incorporating the precise B/D/E/F qualifications and the three choices,
with all thirteen cases retained. After acceptance, record adoption and
source incorporation, then use normal Stage 3/4 review and landing. No
new implementation task or first-Jam gate is created by this decision.
