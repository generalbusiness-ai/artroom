# Use cases

This page is a catalogue of situations that dap is meant to serve. It has
44 numbered cases, one planned demonstration, and the cases that the
[dap-spike](https://github.com/generalbusiness-ai/dap-spike) swept. They
are in five groups, by what each needs from dap. The first group can be
built today. The [roadmap](roadmap.md) describes each missing capability
that this page names.

The cases are proposals. A case in the first group is buildable; only the
three that say **Built** exist. No case claims that an institution has
adopted dap, that an outcome is fair or lawful, or that money is saved.
Cases 01 to 10 extend ten examples from a public thread by Jim Prosser
([opening](https://x.com/jimprosser/status/2108279507660726766),
[conclusion](https://x.com/jimprosser/status/2108279638007107616)); each
of those cards links the reply it extends.

| Group | Cases | What it needs |
|---|---|---|
| [1. Buildable today](#1-buildable-today) | A lending library, 03, 20, 22, 26, 29, 30, 34, 36, 38, 43, 44 | Nothing more for the shared record |
| [2. Nearly buildable](#2-nearly-buildable) | 25, 31, 33, 35 | An application's own messages between scopes, or an outside operation it declares; 25 and 33 also need private views for one part |
| [3. Private views](#3-private-views) | 21, 32, 37, 39, 40, 41, 42 | One record that participants read in part |
| [4. Episodes across organisations](#4-episodes-across-organisations) | 01, 02, 04 to 19, 23, 24, 27, 28 | A personal account, captured evidence in private custody, and parties outside the room |
| [5. Changing rules and boundaries](#5-changing-rules-and-boundaries) | From the dap-spike's sweep, and Tailapps | Rules that change, expressions that compute effects, and scopes that join |

## What the cases share

### Perspectives and closure

An episode, such as a home claim, can span independent decisions: insurer response, contractor undertaking and family accommodation. One person's perspective spans those contexts without acquiring their authority. A shared budget, exclusive sale or room allocation needs an owner or explicit joint rule. Grouping it on screen establishes neither. See the dap-spike's proposed [context and perspective model](https://github.com/generalbusiness-ai/dap-spike/blob/main/notes/2026-09-14-evolving-spaces-design.md).

Keep three records distinct: **personal assertion; imported unchanged source bytes with claimed provenance; and a counterparty's signed act**. Recollection, imported email and signed commitment have different standing. OCR, transcription and agent interpretation add attributed derived readings; they do not upgrade captures into counterparty confirmation. Evidence remains unchanged while conclusions and current standing change. A person gets useful organization alone, then exchanges ordinary messages, then invites one voluntary contribution. This [participation and evidence model](https://github.com/generalbusiness-ai/dap-spike/blob/main/notes/2026-09-20-direction-and-next-steps.md) does not require institutional adoption.

**Prepared, approved, submitted, received, accepted and externally completed differ.** Reviewer completion can leave findings open; merchant refund approval can leave the customer awaiting funds. Someone can close active pursuit as denied, withdrawn, partial or disputed while retaining disagreement. Closure needs a named actor and scope, not universal assent or perfect success. Reopening names new evidence or a changed undertaking without rewriting earlier closure.

Private views can differ. A shared decision rule needs a declared basis readable by the people it binds. Hidden means unreadable, not absent or false. Shared guarantees concern attributable acts, the order in which they take effect, and constraints; they do not establish external truth, fairness, undisclosed perspectives or signing-key holders' competence. The dap-spike's [standing boundary](https://github.com/generalbusiness-ai/dap-spike/blob/main/notes/2026-09-20-direction-and-next-steps.md) and [late seller view](https://github.com/generalbusiness-ai/dap-spike/blob/main/notes/2026-09-15-sale-as-experienced.md) motivate these limits.

### Durability has two axes

First, **what must survive**? Volatile interaction has zero durability and can reset anytime. Cheap durable interaction preserves the complete ordered journal/evidence in a hosted Durable Object or equivalent service; acknowledgment waits for commit. Optional asynchronous Git export remains archive pending. Custodial interaction waits for required journal/evidence/artifacts in Git or another specified custodian before custody confirmation. Snapshots alone are not another tier.

Second, **does confirmation await local application or journal commitment**? “Applied for this session” promises a local result. “Recorded” promises commitment even if interpretation later fails or a guard makes the act ineffective. “Recorded and applied” needs both. A custodian-backed journal contract includes the required custodian/artifact record in its commitment condition; this is not a universal third confirmation stage. External performance stays separate. dap [seals entries and inputs transactionally](../packages/scope/src/turn.ts); the dap-spike's experimental [append/interpretation seam](https://github.com/generalbusiness-ai/dap-spike/blob/main/spike/src/context.ts) shows why a later exception cannot undo a committed append.

One act language carries presence at an existing scope/content URI, messages and decisions, with different survival promises. Promotion captures exact snapshot/version, actor, current authority, audience, conditions and evidence. “Latest” cannot stand for reviewed content. Volatile sessions cannot authorize durable effects whose operation records vanish on reset. dap's [outside-attempt model](../packages/scope/src/operations.ts) preserves possibly sent and unknown outcomes instead of blindly retrying.

Git can hold essential work product, pinned definitions/authority, rebuildable projections, signed journals or longitudinal archives; these roles differ. Sensitive records need appropriate private custody. A hash needs retrievable bytes, access rules and retention. The cards name **live**, **journal** and **custody** content; a recorded pointer does not establish artifact custody.

In each card, **live** work keeps no record, the **journal** is the scope's
record, and **custody** is a kept copy of the documents themselves. The
[roadmap](roadmap.md#durability-levels) names the matching levels live,
recorded and archived.

### Shared application primitives

A reusable declaration needs subjects/contexts, participants and mandates, audiences, exact versions, acts, guards/writes, evidence dependencies, closure conditions and viewer-specific queries. An episode anchor names each status's originating context. Presence and messages address existing scope/content; acceptance changes commitments under the declared rule. Exact identity prevents stale approval.

Common transitions are propose, review, approve, send, receive, accept/reject, perform, observe and close within a named scope. Some transitions never occur: a person can stop after preparation or withdraw a proposal. Corrections append evidence and revise standing. Changed terms require another version-bound decision. Revoked delegation limits future action while preserving acts validly performed earlier. Missing, withheld, unreadable, refused and unanswered are distinct states. A personal disputed conclusion can coexist with a shared recorded decision without forcing a global verdict.

The same interpreter should determine the visible status and whether an act is available. Storage adapters must not weaken a named guard, and a UI must not infer hidden evidence to display completion. This remains design work: the dap-spike's [capability table](https://github.com/generalbusiness-ai/dap-spike/blob/main/notes/2026-09-20-direction-and-next-steps.md) leaves account/capture/anchor unfinished, while its [declaration experiment](https://github.com/generalbusiness-ai/dap-spike/blob/main/spike/lang/README.md) retained a privacy counterexample. Existing experiments support particular seams and fixtures, not a deployed compiler or interchangeable production durability modes.

## 1. Buildable today

Each of these is one shared record that every member of the room reads. Its
rules are guards on acts, and membership grants say who may take each
action. dap runs that today. A fact from outside the room enters as a
participant's signed report.

Every card in this catalogue also describes **live** work that keeps no
record and **custody** of documents. Those parts wait for
[durability levels](roadmap.md#durability-levels) and
[evidence capture and private custody](roadmap.md#evidence-capture-and-private-custody)
in every group, so the notes below name them only where they matter most.

### A lending library

Neighbours share kitchenware and tools. A member donates a thing; any
member borrows a thing that is on the shelf; any member returns a thing
that is lent; staff cancel a thing that is broken or lost and write the
reason. One definition declares the things and their acts, with no timed
rules or capabilities. The shelf is one page for each thing in the room's
repository, published as a site. Each act that changes a thing also
publishes its page through the room's destination, by
[publication from a fold](roadmap.md#publication-from-a-fold).

**Built:** this is [dap-library](../examples/lending/README.md); [Build a lending library](build-a-lending-library.md) walks through it.

### 44 Agents counting with attributed turns and speech

A host agent starts sequential counting by independent browser voice/TTS agents. The scope selects the next number and speaker; agents join or leave, and clients update automatically. Host controls turn rules; speaker controls its playback report; observers know what they received. Under the proposed guards, exact speaker, next number and current turn must match, with deduplication. Roster changes govern the next turn or explicitly pause/cancel the current turn. Speaker closure follows reported playback completion; host closure follows the declared sequence bound; missed hearing can remain reported. Live presence can reset; the journal records number, speaker and turn identity after reported completion. Git is optional selected-run/definition custody, not a commit per number.

**Built:** this is [dap-counter](../examples/counting/README.md). **Also needs:** [durability levels](roadmap.md#durability-levels), for practice that keeps no record.

### 34 Software change review and landing

One developer's agent prepares a patch and checks an exact candidate. Requester knows intent; reviewer knows a subsystem or security concern; maintainer controls integration. Agents implement or inspect within mandates, without multiplying independent approval power. Author closes delivery; reviewer closes a verdict; maintainer closes landing only on confirmed destination evidence. Changed code can invalidate review, and abandoned work can close pursuit honestly. Live exploration and review chatter are disposable. The journal pins request, candidate, checks, findings and authority. Git holds essential code and, where required, review/landing custody. [GitHub review distinctions](https://docs.github.com/en/pull-requests/reference/pull-request-reviews) support separating feedback, approval and requested changes.

**Built:** this is [dap-room](../apps/room/docs/first-change.md). **Also needs:** [a fork for each hold](roadmap.md#a-fork-for-each-hold), so that each performer works in a separate repository.

### 43 Multiagent investigation and delegated tool work

One user's agent decomposes a question and gathers permitted evidence. Implementation, security and user-consequence agents inspect different material; a human owns the final decision; a tool executor holds bounded powers. Under one owner these are work roles, not independent principals. Each investigator can close an assignment while contradictions remain; owner acceptance concerns an exact result and stated conditions. Live chatter and discarded hypotheses can vanish. The journal promotes accepted findings, material blockers, scope changes and delegated commitments. Custody retains results/evidence requiring independent audit. A critic's confident statement is neither veto nor execution authority; agreement among models is not external truth, and unknown tool mutations remain unresolved.

**Also needs:** [outside parties and systems](roadmap.md#outside-parties-and-systems), for a tool executor whose unknown outcome the scope itself reconciles; a participant's report works today.

### 36 Incident response and disputed root cause

An on-call agent summarizes alerts and a tentative timeline. Resolver holds technical evidence; commander sets priorities; liaison knows customer impact; scribe preserves performed acts. Roles can combine. Agents assist those mandates. Commander can close restoration while liaison keeps an impact inquiry open; root cause can remain disputed. Live hypotheses and presence are disposable. The journal promotes decisive observations, delegated remedies and outcomes. Custody retains required postmortem and evidence. A lost response to a remediation never means “nothing happened”; another attempt needs the original operation's recovery rule, not a newly invented identity.

**Also needs:** [durability levels](roadmap.md#durability-levels), for presence and hypotheses that keep no record; [outside parties and systems](roadmap.md#outside-parties-and-systems), for a remediation attempt that the scope sends.

### 03 Grocery budget with household preferences

An agent groups supplied receipts and proposes a basket, extending Prosser's [grocery-budget example](https://x.com/jimprosser/status/2108279543534686703). Household members know different dietary preferences and tolerances; the shopper controls substitutions; retailers control availability and actual charges. A shopping agent cannot treat a calculated cheaper basket as everyone else's assent. The planner closes a proposal when reviewed; household members can accept its constraints; actual purchase and satisfactory use close later. Live baskets and substitutions can disappear. The journal records approved limits, exclusions, replacements and receipt-linked totals. Custody retains selected receipts or order records when reconciliation matters. A lower total can coexist with a rejected substitution.

**Also needs:** [evidence capture and private custody](roadmap.md#evidence-capture-and-private-custody), for receipts.

### 20 Older parent's care rota

One sibling's agent gathers stated availability and exposes an uncovered interval. Parent controls preferences and sharing; siblings have unequal capacity; paid carer owns a separate undertaking. Each agent represents its own person or firm. A helper closes an accepted shift after reporting completion; the parent separately accepts the arrangement. A fully covered rota can coexist with disagreement over burden. Live scheduling moves are disposable. The journal records explicit shifts, conditions, cancellations and responsibility for gaps. Private custody keeps paid-service terms and relevant expense or disputed-completion evidence. Conditional willingness is not a commitment, and a coordinator does not gain authority over the parent through organization.

**Also needs:** [evidence capture and private custody](roadmap.md#evidence-capture-and-private-custody), for the paid service's terms.

### 22 Older parent's move and possessions

A parent-owned agent organizes priorities and a bounded inventory. Parent decides disposition; siblings differ over workload and ownership; movers control transport; housing staff control access. Their agents cannot infer property authority from a catalog. Parent closure concerns selected possessions and destination choices; movers close delivery; siblings close their own undertakings. Missing items or service setup remain open. Live sorting and placement plans can reset. The journal records attributable choices, bounded delegation and handover reports. Private custody keeps accepted inventory, mover terms and selected condition images. Changed consent alters future authority without deleting earlier authorized decisions or making every family member's disagreement disappear.

**Also needs:** [evidence capture and private custody](roadmap.md#evidence-capture-and-private-custody), for the inventory, terms and images.

### 26 Collective bulk purchase and uneven fulfillment

An organizer's agent calculates a tentative allocation from one supplied offer. Households control quantity and maximum obligation; supplier controls acceptance; pickup coordinator knows logistics. Their agents cannot turn sufficient interest into mandates. A household closes joining when its obligation is confirmed; supplier closes the order; organizer still tracks payment, collection and exceptions. One delivered share can close while another remains short. Live pooled quantities and estimates are tentative. The journal records exact commitments, threshold conditions and allocation receipts. Custody retains offer, order and needed payment/delivery evidence. Cancellation or a changed quote has a declared response; aggregate enthusiasm is not consent to spend.

**Also needs:** [evidence capture and private custody](roadmap.md#evidence-capture-and-private-custody), for the offer and the order.

### 29 Renovation scope and variation

An owner's agent compares quote versions and flags ambiguous inclusions. Owner controls priorities; contractor controls undertaking; trades know constraints; adviser can challenge assumptions. Each agent's mandate differs. Parties close agreement only on the exact scope or variation they accept; completion, inspection and payment close later. Missing supplier confirmation or unpriced work remains open. Live layouts and material alternatives can reset. The journal records proposals, explicit acceptance/rejection and changed duties. Custody retains accepted drawings, quotes and relevant annotated images. A contractor replacement ends or changes one engagement; it does not erase the former firm's past undertaking or automatically transfer its responsibility.

**Also needs:** [evidence capture and private custody](roadmap.md#evidence-capture-and-private-custody), for drawings and quotes; a detached text already pins an exact version by digest.

### 30 Renovation punch list after reported completion

An agent groups an owner's dated observations into specific requests. Owner sees unfinished details; contractor may consider the job finished; supplier owns a product response; specialist gives an attributed opinion. Their agents cannot decide cause by consensus. Contractor closes reported work while owner accepts, withdraws or disputes each item. Recurrence can reopen one item; other accepted items stay closed. Live duplicate grouping and draft descriptions are disposable. The journal preserves observations, responses, promised visits and scoped acceptance. Custody retains before/after media, list versions and relevant reports. “Accepted as is” is a legitimate bounded outcome, without pretending a defect was remedied or all interests aligned.

**Also needs:** [evidence capture and private custody](roadmap.md#evidence-capture-and-private-custody), for the media.

### 38 Contract milestone invoice and disputed payment

A freelancer's agent assembles scope, delivered-work evidence and an invoice draft. Performer knows work; client controls agreed acceptance; finance controls payment; an agreed arbiter has only declared powers. Agents represent those limits. Client can accept part; finance can close an instruction while performer awaits funds; the disputed balance remains named. Live negotiation drafts are disposable. The journal records exact terms, changes, acceptance, invoice identity and payment-attempt evidence. Private custody retains contract and accounting artifacts. Unknown payment is reconciled through the provider's contract. Retry guarantees belong to each provider and are bounded; they are not permission to retry without end.

**Also needs:** [outside parties and systems](roadmap.md#outside-parties-and-systems), for a payment attempt that the scope sends; a participant's report works today; [evidence capture and private custody](roadmap.md#evidence-capture-and-private-custody), for the contract.

### From the dap-spike's sweep: buildable today

A discussion channel; a kanban board whose cards everyone reads; a task workflow with handoff and reviews; a workflow with many roles and gates; a workroom of several agents; an inventory.

## 2. Nearly buildable

These need a piece that is designed or partly built: an application that
uses messages between its own scopes, or an outside operation that an
application declares. The mechanism runs today in dap-room's own scopes.
"Nearly" describes the shared record: 25 and 33 also need private views
for one part, as their cards say.

### 33 Room or equipment booking and event dependencies

An organizer's agent finds slots and drafts a request. Resource steward controls capacity; competing bookers need occupancy information; organizer knows purpose; caterer or AV supplier controls another undertaking. Their agents have separate authority. Steward closes an allocated interval; organizer accepts terms; event suppliers and return-condition checks close separately. A free slot is not a reservation. Live availability, layouts and tentative attendees can reset. The journal enforces holds, expiry, non-overlap and confirmed changes, keeping public occupancy separate from private purpose. Custody retains booking terms and required operational records. Real expiry decisions need authoritative recorded clock evidence; a browser timer cannot silently revoke a commitment.

**Needs:** [an application's own messages between scopes](roadmap.md#an-applications-own-messages-between-scopes), for several rooms under one allocator, and for the suppliers' separate undertakings; [private views in one record](roadmap.md#private-views-in-one-record), to keep the purpose private in the same record.

### 25 Shared family purchase or repair budget

An agent compares estimates and possible contributions. Contributors have different resources and benefits; authorized buyer controls ordering; supplier controls quote and delivery; agents propose within each person's limit. One participant's “we agreed” remains an assertion until others confirm. Contributor closure concerns their exact amount and conditions; supplier closure concerns order acceptance; delivery and payment remain separate. Live allocations explore alternatives. The journal records versioned commitments, maximum authority and corrections. Custody retains accepted quote and relevant receipts privately. A price increase requires renewed approval where limits are exceeded, while reasons for a contribution can remain private even when its amount is shared.

**Needs:** [an application's own messages between scopes](roadmap.md#an-applications-own-messages-between-scopes), so that one scope owns the budget; [private views in one record](roadmap.md#private-views-in-one-record), to keep a contributor's reasons private.

### 31 Used-car purchase with inspection and handover

A buyer's agent organizes requirements and seller-provided documents. Buyer and partner control budget; seller knows listing history; inspector supplies a limited report; finance or registration providers control their own processes. Agents cannot turn listing assertions into inspection findings. Buyer and seller close selected terms; payment, document transfer and condition acceptance close separately. Missing paperwork or a conflicting report remains open. Live comparisons and test-drive schedules are tentative. The journal records bounded offers, exact-version acceptance and handover inventory. Private custody retains report, terms, receipts and condition images. Household replacement completion is a declared personal scope, not a claim of universal vehicle fitness.

**Needs:** [an application's own messages between scopes](roadmap.md#an-applications-own-messages-between-scopes), for the inspection as a separate scope that returns its result; [evidence capture and private custody](roadmap.md#evidence-capture-and-private-custody), for the report and terms.

### 35 Release authorization and deployment outcome

A release agent assembles build identity, checks and rollout proposal. Service owner knows availability risk; release manager controls timing; security or support knows other constraints; executor has a named environment mandate. Approval closes readiness judgment, not execution. Confirmed deployment closes that operation while customer validation or follow-up stays open. Live rehearsal is disposable. The journal records authorization, exact build/environment and attempt identity before execution. Custody retains released artifacts and provenance in Git and/or a binary registry. Unknown outcomes require reconciliation; rollback is a new authorized operation. [GitHub environment protection](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments) supplies a concrete approval-before-execution distinction.

**Needs:** [outside parties and systems](roadmap.md#outside-parties-and-systems), for a deployment that the scope sends and reconciles; the model runs today for publication to a Git host; [evidence capture and private custody](roadmap.md#evidence-capture-and-private-custody), for released artifacts.

### From the dap-spike's sweep: nearly buildable

Bookings across several rooms with a capacity for the whole building; two projects that share one budget.

## 3. Private views

These depend on one record in which participants read different parts and
still agree on every shared decision. dap does not have that today: every
member of a room reads the whole record. The dap-spike tested this
property; the [roadmap](roadmap.md#private-views-in-one-record) says what
it found.

### 32 Guitar sale with private competing offers

Seller's agent prepares a listing; a buyer's agent prepares conditions. Seller controls the instrument; buyers have competing interests; inspector owns a scoped assessment; a late co-seller can know the decision without seeing every private bid. One accepted offer closes selection under the declared exclusivity rule. Payment, handover and condition acceptance remain distinct; losing buyers can close pursuit with disappointment. Live listing and offer drafts can vanish. The journal retains offers, withdrawals, counters and one acceptance. Custody keeps selected terms, report and delivery evidence where required. Closing the sale does not disclose private prices or make the fixture's close act proof of external completion.

**Also needs:** [an application's own messages between scopes](roadmap.md#an-applications-own-messages-between-scopes), for the inspection.

### 42 Community budget membership and governance

A member's agent clarifies a proposal and budget alternatives. Members have competing priorities; treasurer knows funds and private standing reasons; committee applies admission rules; steward owns implementation. Agents advise principals rather than becoming extra votes. Motion or membership decision closes only under pinned eligibility, quorum and disclosure rules; spending, access grants and procedural challenges close separately. Live debate is disposable. The journal records proposal versions, authorized votes, dissent and changed standing. Custody retains rule versions and required minutes/accounting evidence. Public outcome need not disclose private reasons. the dap-spike's [Club counterexample](https://github.com/generalbusiness-ai/dap-spike/blob/main/spike/REPORT.md) makes this a validation challenge, not an already proven general policy.

**Also needs:** [rules that change after creation](roadmap.md#rules-that-change-after-creation), for rules that are amended under their own procedure.

### 21 Childcare gap around work

A parent's agent identifies one uncovered interval and drafts feasible questions. Parent and co-parent control arrangements; caregiver controls availability; workplace scheduler controls shifts; agents have distinct permissions. The caregiver can close an availability reply while parent closure awaits the exact handoff and collection authority. Employer shift closure does not settle transport or backup. Live slot alternatives are tentative. The journal preserves interval, named confirmations, pickup permissions, cancellations and actual handoff reports. Restricted custody keeps relevant contacts and permission records. Matching calendars is insufficient, and private child details need not be visible to every participant discussing the parent's work schedule.

### 37 Procurement award and delivery acceptance

A requester's agent drafts requirements and compares quotations. Buyer controls budget; evaluator knows suitability; supplier knows delivery limits; receiver sees actual goods. Their agents cannot sign another organization's acceptance. Award closes selection; supplier acceptance closes its commitment; receiver acceptance closes specified delivered items. Short shipment or quality dispute can remain open after partial acceptance. Live comparisons are tentative. The journal pins requirements, offers, authority, commitments and exceptions. Custody retains awarded terms and required releases or private records. [Open Contracting's release model](https://standard.open-contracting.org/latest/en/schema/reference/) distinguishes planning, tender, award, contract and implementation; a published award is not the supplier's received order or completed delivery.

**Also needs:** [outside parties and systems](roadmap.md#outside-parties-and-systems), for the supplier's own acceptance.

### 39 Hiring application offer and onboarding

A candidate's agent prepares an evidence-based application and offer questions; a recruiter agent organizes criteria. Candidate knows preferences; assessors observe different competencies; manager decides; compensation approver and onboarding staff control separate steps. [OPM structured interviews](https://www.opm.gov/policy-data-oversight/assessment-and-selection/structured-interviews/) motivate consistent criteria rather than multiplying agent opinions. Candidate submission, assessor judgment, employer offer and candidate acceptance close separately; rejection can end this application. Live drafts and alternatives are tentative. The journal pins criteria, submitted versions, judgments, negotiation mandate and setup duties. Restricted custody retains required documents. Provisioned accounts or actual start require external evidence; disputed factual records remain distinguishable from disagreement with the hiring decision.

**Also needs:** [outside parties and systems](roadmap.md#outside-parties-and-systems), for provisioning and the actual start.

### 40 School support plan and implementation

A parent, student or teacher's agent organizes observations and questions. Family knows lived experience; teacher knows classroom demands; specialist interprets evidence; school representative knows resources. These are distinct perspectives, exemplified by the [Department of Education's team roles](https://sites.ed.gov/idea/regs/b/d/300.321), without adopting a universal legal procedure here. Meeting closure differs from plan agreement and delivered support; dissent or insufficient implementation remains open. Live private preparation is disposable. The journal retains reviewed plan, authorized acknowledgments, responsibilities and revision requests. School-appropriate custody retains required official versions. Private notes do not become shared simply because they informed a proposal, and a plan signature does not prove a support occurred.

**Also needs:** [evidence capture and private custody](roadmap.md#evidence-capture-and-private-custody), for the official versions.

### 41 Research review and reproducible result

An author's agent organizes claims, methods and provenance. Coauthor knows an experiment; reviewer checks methods; editor or programme officer decides; data steward controls access. Agents can work from different permitted evidence without acquiring decision authority. Reviewer recommendation closes advice; editor decision closes its scope; reproducibility objections or release duties can remain open. Live analysis and drafts are tentative. The journal pins manuscript, data/software identities, objections, responses and decision. Custody retains submitted/final artifacts and required reproducibility material. [NSF merit review](https://www.nsf.gov/funding/merit-review) distinguishes expert input from funding decisions. Git can hold code; restricted data needs another custodian, and review access is not publication authority.

**Also needs:** [evidence capture and private custody](roadmap.md#evidence-capture-and-private-custody), for restricted data.

### From the dap-spike's sweep: private views

A sale with private offers (case 32 continues it); a single room's bookings with a private purpose; a club with private applications and dues; a kanban board with private cards and a limit on work in progress; poker, which also needs commitments that are later revealed and a trusted dealer.

## 4. Episodes across organisations

Each of these starts as one person's account of an exchange with
organisations that have not joined. Each needs all three of
[evidence capture and private custody](roadmap.md#evidence-capture-and-private-custody),
[outside parties and systems](roadmap.md#outside-parties-and-systems) and
[a personal account across records](roadmap.md#a-personal-account-across-records).
A note under a card names anything further.

### 01 Medical bill inquiry and disputed outcome

A patient's agent compares a supplied bill and coverage records and prepares one question, extending Prosser's [unexpected emergency-care charge](https://x.com/jimprosser/status/2108279519732003163). The patient knows their account; billing staff know charge construction; payer staff control their own response; a helper's agent can assemble evidence without deciding entitlement. Billing staff can close an explanation while the patient awaits a correction or closes pursuit with disagreement. Live work groups possible discrepancies. The journal records reviewed questions, approvals, submissions, receipts and promised responses. Custody retains unchanged bills, selected coverage versions and exact correspondence privately. An assistance decision, corrected charge and received funds are independent outcomes.

### 02 Prescription price comparison and refill continuity

A patient-owned agent normalizes supplied dispensing prices and missing assumptions, extending Prosser's [medicine-cost comparison](https://x.com/jimprosser/status/2108279531765367193). The patient weighs convenience; pharmacies know stock and dispensing conditions; payer staff know their processing; a qualified prescriber controls clinical decisions. Their agents carry administrative mandates. The patient can close comparison without changing anything; pharmacy acceptance does not close actual collection or next refill. Stock, terms and the patient's preferences can change. Live offers remain tentative. The journal retains exact comparisons, authorized inquiries and collection acknowledgments; private custody retains prescriptions and relevant documents. The application does not infer safe substitution or guaranteed savings.

### 04 Card-debt inquiry and repayment arrangement

An agent organizes supplied balances and drafts questions, extending Prosser's [three-card debt scenario](https://x.com/jimprosser/status/2108279555471667421). The borrower knows household capacity; a partner may share payment authority; each lender controls its own offer; lender and borrower agents have different mandates. A lender can close a request after denial while the borrower records disagreement or ends pursuit. An accepted arrangement does not prove a transfer, posted payment or future affordability. Live alternatives explore assumptions. The journal retains proposal versions, limits, approvals and payment references; private custody retains statements and accepted terms. The case illustrates coordination without recommending a financial strategy.

### 05 Motor insurance renewal and continuity

An agent compares supplied renewal and competing terms, extending Prosser's [renewal increase](https://x.com/jimprosser/status/2108279567127572710). The driver values cost and coverage; another owner can have different needs; insurers control offers and issuance; broker agents cannot bind an insurer beyond their mandate. The comparison can close with a decision to stay. Selection, application acceptance, issued coverage and ending the old policy close separately; an unresolved assumption remains visible. Live quotes and questions are provisional. The journal pins terms, effective dates and authorized actions. Private custody keeps policy versions and issuance/cancellation evidence. A selected quote never becomes coverage through a dashboard status.

### 06 Internet negotiation and service change

An agent assembles usage needs and supplied offers, extending Prosser's [internet-charge negotiation](https://x.com/jimprosser/status/2108279579031023631). The subscriber values price; other users need reliability; retention staff can offer terms; installers control activation. Agents ask and compare within granted limits. Staff can close the offer while the subscriber still waits for the actual price or service. A decision to stay can close switching without resolving dissatisfaction. Live alternatives and availability expire. The journal records the exact offer, approved response, dates and equipment-return duties. Custody retains captured terms, order and later bill. Activation, old-account closure and promised savings require separate evidence.

### 07 Repair estimate and accepted vehicle work

A driver's agent compares an itemized estimate and prepares questions, extending Prosser's [vehicle repair estimate](https://x.com/jimprosser/status/2108279590733099153). The driver knows symptoms and constraints; two shops can disagree about required work; an independent specialist supplies a bounded assessment; each shop agent represents its own delivery scope. The driver can close comparison without ordering. A shop's completed work does not establish the driver's acceptance or settle a disputed item. Live comparisons and appointment options remain tentative. The journal records authorized scope, estimate versions, additional-work requests and handover observations. Custody keeps reports, invoices and relevant images. Technical judgments remain attributable to qualified people.

### 08 Assistance application and administrative decision

An agent turns a supplied checklist into missing-evidence questions, extending Prosser's [household assistance example](https://x.com/jimprosser/status/2108279602569433556). Applicant and household contributors control disclosure; a helper knows document logistics; administering staff control decisions. Agents prepare and monitor without declaring eligibility. A helper closes one document task; the applicant closes submission with a receipt; staff later close a decision. Further evidence, corrections or future duties can remain open, and withdrawal can close pursuit. Live draft answers precede review. The journal pins form versions, approved answers and receipts. Private custody retains submitted material and responses under restricted access. Receipt does not mean approval or benefit delivery.

**Also needs:** [private views in one record](roadmap.md#private-views-in-one-record), because each household contributor controls what is disclosed.

### 09 Lease renewal and differing household positions

An agent organizes a renewal proposal, supplied comparisons and maintenance evidence, extending Prosser's [rent-increase example](https://x.com/jimprosser/status/2108279614397464804). Tenant and co-tenant can differ over moving costs; the property representative controls its offer; a tenant adviser supplies a separate interpretation. Agents draft rather than infer legal protection or consent. The manager can close negotiation after issuing terms while tenants decide, accept separately or retain disagreement. Live counteroffers explore possibilities. The journal records exact proposals, authority, responses and accepted conditions. Private custody retains the selected lease and correspondence. Renewal acceptance does not automatically close repair promises, moving arrangements or payment disputes.

### 10 Electricity discrepancy and household explanation

An agent aligns supplied bills, periods and readings, extending Prosser's [electricity-cost increase](https://x.com/jimprosser/status/2108279626309193797). One resident knows occupancy changes; another knows equipment use; provider staff know readings and processing. A provider agent can answer within its authority without settling every causal hypothesis. The resident can close understanding without a complaint; staff can close an inquiry while an agreed balance correction remains open. Live hypotheses and meter views are disposable. The journal records extracted figures, uncertainties, the reviewed question and response. Custody keeps original bills and selected meter images. A photographed reading is an observation, not provider acceptance.

### 11 Duplicate charge or checkout discrepancy

An agent matches a receipt to supplied transactions and prepares a bounded question. The shopper recognizes purchases; a joint payer knows other account use; merchant staff see orders; payment-provider staff see processing states. Their agents cannot infer duplication from equal amounts alone. Merchant closure can mean “adjustment initiated”; shopper closure requires an accepted explanation or observed balance outcome. Goods delivery can remain disputed. Live matching explores hypotheses. The journal records transaction identities, approved claims and adjustment promises. Private custody retains selected receipt and statement bytes. A later correction changes standing without deleting the original apparent discrepancy.

### 12 Subscription cancellation with shared access

An agent identifies an account and drafts the intended cancellation boundary. The subscriber controls the instruction; another household user values continued access; the payer sees charges; supplier staff know account effects. Each agent represents that limited position. The subscriber can close preparation by deciding to keep it. Supplier acknowledgment can close cancellation processing while downloads, final billing or access expiry remain open. Live retention offers and choices are tentative. The journal records the exact approved instruction, acknowledgment and expected access boundary. Custody retains invoices and confirmation bytes. A button click is an attempted action; it is not cancellation evidence by itself.

### 13 Unfamiliar bank fee

An agent links a supplied fee entry to an account document and drafts a neutral question. The customer knows their intended use; a joint holder knows other activity; bank staff control explanation or adjustment; their agents have different evidence. Customer closure can mean understanding, while bank closure means a decision. An approved adjustment or future account change can remain pending. Live interpretations compare document versions. The journal retains the selected entry, uncertainty, reviewed question and attributed answer. Private custody keeps relevant statements and terms. The design does not presume a reversal is available, and denial can legitimately end active pursuit.

### 14 Suspected unauthorized transaction

An agent extracts identifiers and prepares the account holder's own report for a chosen official channel. Account holder and joint holder know what they recognize; merchant and provider investigators hold different evidence. Their agents organize information without asserting that fraud occurred. Provider acknowledgment closes receipt, later investigation closure may still leave the account holder disputing its conclusion. Replacement access or a provisional balance entry can remain open. Live hypotheses stay tentative. The journal preserves the reviewed assertion, report identity and follow-up requests. Restricted custody retains selected statements and responses. Unknown external submission is reconciled before another attempt; credentials are not investigation evidence to share.

### 15 Rental deposit and disputed deductions

An agent organizes move-in/out evidence against a supplied itemization. Renter and co-renter know different condition history; manager controls the itemization; cleaner or repairer supplies observations; agents represent each account. The manager can close its explanation while renters await a partial refund or retain a disputed deduction. Co-renters can close allocation separately. Live image comparisons and annotations are revisable. The journal records attributed condition claims, deduction questions, accepted amounts and receipt references. Private custody keeps dated images, tenancy documents and itemization versions. Photos support observations; they do not establish responsibility or entitlement. Partial reconciliation need not erase remaining disagreement.

### 16 Landlord repair and persistent defect

An agent assembles a defect timeline and drafts one access-constrained request. Tenant knows disruption; manager controls authorization; contractor knows diagnosis and availability; another resident controls their access preference. Their agents cannot turn “job complete” into tenant acceptance. Manager closes assignment, contractor closes a named task and tenant separately checks the result. A recurrence reopens that item, while invoice or key return can remain pending. Live slots and hypotheses are disposable. The journal records reports, access permission, appointment and performed-work claims. Custody retains photos, exact messages and handover evidence. The workflow organizes an exchange without deciding statutory duties or technical cause.

### 17 Energy retrofit scoping and aftercare

An agent organizes supplied usage, property constraints and proposals into questions. Occupant values comfort; owner controls budget; assessor supplies assumptions; installer owns delivery; any programme representative controls its own process. Agents do not collapse these authorities. The assessor closes a report; owner can reject an option or approve exact scope; installation, inspection and actual performance close later. Live scenarios explore assumptions. The journal preserves inputs, questions, selected proposal and authorized changes. Custody retains surveys, photos, contracts and completion records. Projected payback is a hypothesis; changed usage can revise it without altering the original assessment or inventing incentive eligibility.

### 18 Specialist encounter and follow-up

A patient's agent assembles questions and selected uploaded records into an appointment brief. Patient knows goals; clinician supplies assessment; caregiver knows logistics; receptionist controls scheduling. Patient and clinic agents need separate mandates. Patient closure means questions addressed or deliberately deferred; clinic closure means encounter and specified arrangements recorded; caregiver can still await transport confirmation. Live agenda grouping is disposable. The journal records questions sent, acknowledgments and follow-up commitments. Private custody retains exact relevant records and confirmed instructions. Missing reports or differing interpretations remain attributed. Attending the appointment alone does not close the patient's questions or establish that a receiving service accepted a referral.

**Also needs:** [private views in one record](roadmap.md#private-views-in-one-record), for records with restricted readers.

### 19 First week after discharge

An agent extracts administrative contacts, appointments and supply questions from provided discharge material. Patient and family know practical needs; discharge staff know their handoff; receiving provider controls acceptance; supplier controls delivery. Their agents coordinate within independent scopes. Sending documents closes the sender's dispatch, not the receiver's handoff acceptance. Family support shifts and patient questions close separately; inconsistent versions remain open. Live rota alternatives are tentative. The journal records reviewed logistics, named commitments and receipts. Private custody keeps supplied source versions and exact handoff bundle. Incomplete documents remain incomplete; the assistant does not manufacture medical instructions to make the checklist look finished.

**Also needs:** [private views in one record](roadmap.md#private-views-in-one-record), for records with restricted readers.

### 23 Household move and property handover

A resident's agent derives an access and service checklist from supplied agreements. Departing and arriving residents know different condition observations; manager controls keys; movers and utilities control independent services. Their agents answer for those scopes. Key handover and condition acknowledgment can close while one utility change or invoice remains open; manager account closure does not end a resident's dispute. Live sequencing and packing are disposable. The journal records dates, duties, access permissions and attributed condition reports. Custody retains exact forms, images, meter captures and service acknowledgments. This differs from case 15: its central problem is coordinating handover, rather than reconciling a deposit.

### 24 Family trip across independent providers

One traveller's agent assembles constraints and candidate itinerary. Travellers know private budgets and access needs; airline, accommodation and activity providers each control reservations; their agents cannot approve another traveller's participation. Each traveller closes their commitment separately; each provider closes its booking; travel completion and reimbursements close later. A confirmed hotel leaves other dependencies open. Live routes and schedules are tentative. The journal records approvals, cost commitments and captured acknowledgments. Private custody retains exact booking terms and receipts, with identity material restricted. A changed flight reopens affected connections; it does not erase unaffected bookings or prove a refund entitlement.

**Also needs:** [private views in one record](roadmap.md#private-views-in-one-record), for each traveller's budget.

### 27 Home-damage claim and usable-home outcome

An owner's agent assembles photos, inventory and receipts for one insurer question. Owner wants a usable home; insurer controls its response; contractor knows repair scope; family knows accommodation needs. Their agents represent independent undertakings. Insurer closure can mean a decision; owner can accept part and retain dispute; contractor completion and family return close separately. Live photo grouping and inventory drafts are disposable. The journal records reviewed submissions, receipts, corrections and promised replies. Private custody retains the exact evidence bundle, estimates and response bytes. Newly discovered damage changes standing or opens another request without rewriting the earlier record. Submission is not an accepted claim.

### 28 Accident repair and replacement transport

A driver's agent separates insurer requests, shop status and rental arrangements. Driver knows inconvenience; insurer controls its process; shop controls repair; rental provider controls return terms. Agents cannot promise one firm's performance for another. Shop readiness closes a notification, not repair acceptance; insurer response and rental return have separate closure. A supplemented estimate or pickup delay remains named. Live transport options are tentative. The journal records dates, authorized scope changes, handover observations and receipt references. Custody retains estimates, condition images, rental terms and return evidence. An uncertain external notification stays unknown until reconciled, rather than triggering a new rental or payment action automatically.

### From the dap-spike's sweep: episodes across organisations

An insurance claim (case 27 continues it); a hospital episode (cases 18 and 19); trip planning (case 24); feeds, sensors and other outside data sources.

## 5. Changing rules and boundaries

None of the 44 numbered cases has this as its first need. All but the last come from
the dap-spike's
[sweep of its original use cases](https://github.com/generalbusiness-ai/dap-spike/blob/main/notes/2026-09-18-authoring-language-directions.md).

| Case | What it needs |
|---|---|
| A sale that later gains inspection, negotiation, escrow and comment packages | [Rules that change after creation](roadmap.md#rules-that-change-after-creation): a package attached to a running record, and a later package that narrows an earlier one's guard |
| A club that changes its admission policy | The same, with [private views in one record](roadmap.md#private-views-in-one-record) |
| Chess and other games with many rules | [Expressions that compute effects](roadmap.md#expressions-that-compute-effects): a rule can accept or refuse a proposed position, and nobody has yet written a game's rules in the rule language |
| A merger of two organisations' records | [Split and join](roadmap.md#split-and-join) |
| [Tailapps](https://github.com/generalbusiness-ai/tailapps): small analytic pipelines over agent telemetry, each written by a person or an agent and queried with SQL | [Expressions that compute effects](roadmap.md#expressions-that-compute-effects), so that one record updates several rows that the expression computes; tables that answer SQL; and [durability levels](roadmap.md#durability-levels), because the telemetry itself should not be kept. The rule language is close to the one Tailapps uses. A pipeline's life (create, validate, activate) is buildable today, and so is a running total, if the router proposes each new total and a rule checks it |

## Four longer journeys

### Medical billing keeps preparation separate from relief

Case 01 starts with a packet and unanswered question. Patient assertion, extracted amount and helper review remain distinct. Approval binds the exact question; a portal receipt closes submission. A captured response stays source evidence unless the counterparty signs its own act. Patient acceptance of an explanation can coexist with a pending adjustment. A contradictory later bill reopens follow-up while the original survives. Denial can close active pursuit with disagreement retained. Private export supports a new helper without recruiting the institution.

### A home claim contains independent outcomes

Case 27 spans insurer response, repair and accommodation. Voice account, photographs and imported estimate differ from the agent's derived summary. Owner approval binds the submitted bundle. Insurer denial, partially accepted repairs and family return can coexist. Replacing a contractor changes engagement and disclosure, not attribution of old promises. Custody retains decisive media and exact versions, not just a transcript or final snapshot. Each person can end their own pursuit while preserving another outstanding undertaking.

### Software review binds what lands

Case 34's review names candidate A. Repair produces B; the declaration determines which verdicts remain applicable. Maintainer authority names B and destination. An entry that takes effect in the journal differs from required Git custody. dap's [destination observation](../packages/platform/src/destination.ts) establishes publication and a still-owed receipt. Lost integration response stays unknown until observed. Requester dissatisfaction can open another issue after a valid landing, without denying that B landed. This is the distinction between a committed decision, its outside result and each participant's closure.

### Counting makes confirmation observable

Case 44 uses one turn rule in live practice or a retained session. Live acknowledgment confirms local application and can vanish. Journal acknowledgment waits for commit and permits replay. Speech request, reported playback completion and hearing report differ; completion does not prove everyone heard. Pause/resume is a natural conversation act. Connection state is ephemeral; accepted counter/turn records survive. An unknown TTS response needs reconciliation to avoid speaking twice. Asynchronous export says archive pending; custodial confirmation waits for required complete record/artifacts. Automated clients need no manual refresh or staged out-of-turn attempt to demonstrate the useful behavior.

## Source

Written from a draft of 9 October 2026, regrouped on 13 October 2026
against main `d1b845f8`, and revised on 14 October 2026 against main
`f20df342`. The grouping is a design judgement from reading the
documentation and the definitions; no case in it was built or run for
this page, except the three marked **Built**.
