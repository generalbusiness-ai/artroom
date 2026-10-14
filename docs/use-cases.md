# Use cases

This page lists 45 situations that dap is meant to serve, and the cases
that the [dap-spike](https://github.com/generalbusiness-ai/dap-spike)
swept. They are sorted into five groups by what each one needs from dap.
You can build the first group today. The [roadmap](roadmap.md) describes
each missing piece that this page names.

The cases are proposals. Three of them exist, and their cards say
**Built**. No case claims that an institution uses dap, that an outcome is
fair or lawful, or that anyone saves money.

Cases 01 to 10 extend ten examples from a public thread by Jim Prosser
([opening](https://x.com/jimprosser/status/2108279507660726766),
[conclusion](https://x.com/jimprosser/status/2108279638007107616)). Each of
those cards links the post it extends. Cases 01 to 44 come from a draft of
9 October 2026. Case 45, the lending library, was added later as a demo.

| Group | Cases | What the group needs |
|---|---|---|
| [1. Buildable today](#1-buildable-today) | 03, 20, 22, 26, 29, 30, 34, 36, 38, 43, 44, 45 | Nothing more for the shared record |
| [2. Nearly buildable](#2-nearly-buildable) | 25, 31, 33, 35 | Messages between an application's own scopes, or an outside operation that the application declares. Cases 25 and 33 also need private views for one part |
| [3. Private views](#3-private-views) | 21, 32, 37, 39, 40, 41, 42 | One record that each participant reads only in part |
| [4. Episodes across organisations](#4-episodes-across-organisations) | 01, 02, 04 to 19, 23, 24, 27, 28 | A personal account, captured documents kept privately, and parties outside the room |
| [5. Changing rules and boundaries](#5-changing-rules-and-boundaries) | From the dap-spike's sweep, and Tailapps | Rules that change, expressions that compute what to write, and records that join |

## What the cases have in common

### Many decisions, each with its own owner

A real episode involves several independent decisions. After water
damages a home, the insurer decides on the claim, a contractor agrees to
a repair, and the family arranges somewhere to stay. One person can follow
all three. Following them does not give that person any say in them.

Some things need a single owner or an agreed joint rule: a shared budget,
an item that only one buyer can win, a room that only one booking can
hold. Showing them together on one screen does not settle who decides.
The dap-spike's
[context and perspective model](https://github.com/generalbusiness-ai/dap-spike/blob/main/notes/2026-09-14-evolving-spaces-design.md)
proposes how to keep these apart.

### Three kinds of statement

The record keeps three kinds of statement separate:

- What a person says themselves.
- A document brought in unchanged, with where it came from.
- An act that another party signs.

A memory of a phone call, an imported email and a signed commitment carry
different weight. When an agent reads a document, by OCR, transcription
or summary, its reading is a new statement attributed to the agent. The
reading does not turn the document into the other party's confirmation.

The documents themselves never change. What people conclude from them,
and where each matter stands, can change.

A person can start alone, just organising their own papers. Later they
can exchange ordinary messages, and later still invite one other party
to take part. Nobody else has to adopt dap first. The dap-spike's
[participation and evidence model](https://github.com/generalbusiness-ai/dap-spike/blob/main/notes/2026-09-20-direction-and-next-steps.md)
describes this.

### "Done" means different things to different people

Prepared, approved, submitted, received, accepted and completed are
different states. A reviewer can finish a review that still has open
findings. A merchant can approve a refund that the customer has not yet
received.

Each person closes their own part. One person can stop pursuing a matter
as denied, withdrawn, partly met or disputed, and still record that they
disagree. Closing needs a named person and a named scope. It does not
need everyone to agree or the outcome to be a success. Reopening a matter
names the new evidence or the changed promise, and it leaves the earlier
closing in the record.

### What a shared record does and does not prove

Different people can see different parts of a matter. A rule that binds a
group must have a basis that the group can read. When something is hidden
from you, it is unreadable to you. It is not missing or false.

A shared record proves who did what, in which order each act took effect,
and that each act met the rules. It does not prove that an outside fact
is true, that an outcome is fair, what someone privately thinks, or that
a person holding a signing key was competent. The dap-spike's
[standing boundary](https://github.com/generalbusiness-ai/dap-spike/blob/main/notes/2026-09-20-direction-and-next-steps.md)
and its [late seller view](https://github.com/generalbusiness-ai/dap-spike/blob/main/notes/2026-09-15-sale-as-experienced.md)
show why these limits matter.

### How long things last, and when you get an answer

Each card describes three kinds of content:

- **Live** work keeps no record. Drafts, presence and guesses can vanish
  at any time.
- The **journal** is the scope's record. It keeps every act in order.
- **Custody** is a kept copy of the documents themselves, in Git or with
  another keeper.

The [roadmap](roadmap.md#durability-levels) calls the matching levels
live, recorded and archived. A journal entry that points at a document by
its hash does not keep the document. Keeping it needs the bytes, rules
about who may read them, and a retention period. Sensitive documents need
private custody.

The answer to an act can promise different things. "Applied for this
session" promises a local result only. "Recorded" promises that the act is
in the journal, even if a guard then makes it ineffective. "Recorded and
applied" promises both. dap
[writes each entry and its inputs in one transaction](../packages/scope/src/turn.ts),
so a later error cannot undo an entry that is already recorded.

Work that keeps no record cannot start an outside operation whose record
would vanish on a reset. When an outside operation's answer is lost, dap
[keeps the attempt as possibly sent and unknown](../packages/scope/src/operations.ts)
instead of trying again blindly.

### What a reusable application needs to say

An application in this catalogue needs to declare the following:

- The subjects and the people involved, with what each may do.
- Who can read what.
- Exact versions of documents and terms.
- The acts, the guards on them and what they write.
- Which evidence each act depends on.
- When each part counts as closed.

Common acts are propose, review, approve, send, receive, accept, reject,
perform, observe and close. Some never happen: a person can stop after
preparing, or withdraw a proposal. A correction adds evidence and changes
where a matter stands. Changed terms need a new decision on the new
version. Withdrawing a delegation stops future acts and keeps the acts
already done under it.

Missing, withheld, unreadable, refused and unanswered are different
states. One person's disputed conclusion can stand beside a shared
decision without forcing a single verdict.

The same rules should decide what a screen shows and which acts are
available. A store must not weaken a guard, and a screen must not show a
task as complete from evidence it cannot see. Most of this is still
design work. The dap-spike's
[capability table](https://github.com/generalbusiness-ai/dap-spike/blob/main/notes/2026-09-20-direction-and-next-steps.md)
leaves the personal account, document capture and the cross-record
anchor unfinished. Its
[declaration experiment](https://github.com/generalbusiness-ai/dap-spike/blob/main/spike/lang/README.md)
ended with a privacy counterexample.

## 1. Buildable today

Each case here is one shared record that every member of the room reads.
Its rules are guards on acts, and membership grants say who may take each
act. dap runs all of that today. A fact from outside the room enters as a
participant's signed report.

Every card also describes live work that keeps no record and custody of
documents. Those parts wait for
[durability levels](roadmap.md#durability-levels) and
[evidence capture and private custody](roadmap.md#evidence-capture-and-private-custody)
in every group, so the cards below name them only where they matter most.

### 45 A lending library

Neighbours share kitchenware and tools. A member donates a thing. Any
member borrows a thing that is on the shelf, and any member returns a
thing that is lent. Staff cancel a thing that is broken or lost, and write
the reason. One definition declares the things and their acts, with no
timed rules or capabilities.

The shelf is one page for each thing, in the room's repository, published
as a site. Each act that changes a thing also publishes its page through
the room's destination, by
[publication from a fold](roadmap.md#publication-from-a-fold).

Members use the browser interface. An agent can also be a member and
borrow, return or donate through dap's MCP server, as
[Taking part in the lending library](mcp.md#taking-part-in-the-lending-library)
shows.

**Built:** this is [dap-library](../examples/lending/README.md). [Build a lending library](build-a-lending-library.md) walks through it.

### 44 Agents counting with attributed turns and speech

Agents and people count aloud in turn. Each turn names the next number
and the next speaker. Participants join or leave, and every client shows
the new state without a refresh. Browser participants speak with the
browser's voice. Agents such as Codex CLI sessions take part through
dap's MCP server and speak with their own voices, as
[Taking part in a Counter](mcp.md#taking-part-in-a-counter) shows.

- **Who decides:** the host sets the turn rules. Each speaker reports its
  own playback. Observers report only what they heard.
- **The rules:** a turn needs the right speaker, the right next number
  and the current turn, and a repeat is refused. A roster change applies
  from the next turn, or pauses the current one.
- **When it closes:** a speaker's turn closes when it reports playback
  done. The count closes at the declared final number. A participant can
  still report that they missed a number.
- **What the record keeps:** each number, its speaker and its turn. Live
  presence can reset. Git can keep a chosen run and the definition. It
  does not need a commit per number.

**Built:** this is [dap-counter](../examples/counting/README.md). **Also needs:** [durability levels](roadmap.md#durability-levels), for practice that keeps no record.

### 34 Software change review and landing

This is the most common case, and the one dap-room is built for. A team
of people and agents shares one Git repository. They coordinate the work
on it through issues and changes in one room, and the room keeps one
record of all of it.

- An **issue** holds a goal and its conditions. People and agents offer
  **commitments** to parts of it. A performer takes a time-limited
  **hold** on the work, reports when it is done, and the requester
  accepts the report. A **plan** splits a large goal into parts.
- A **change** proposes files on an exact base. Reviewers judge that
  exact version. The room's rules say which verdicts a change needs and
  who may merge it.
- When two changes start from the same base, the room's destination
  settles them in order. The first one lands. The second is refused as
  out of date, with the reason, and its author proposes it again on the
  new base.
- Agents take part with their own keys, through the `dap` command or
  dap's [MCP server](mcp.md). They take the same acts as people, under
  the same rules, and every act names who took it.

For one change, a developer's agent prepares a patch and checks an exact
candidate.

- **Who decides:** the requester knows the intent. A reviewer knows a
  subsystem or a security concern. The maintainer decides what lands.
  Agents implement or inspect within their mandate, and adding agents
  does not add approval power.
- **When it closes:** the author closes delivery and the reviewer closes
  a verdict. The maintainer closes the landing only on evidence from the
  destination. Changed code can invalidate a review. Abandoned work can
  close honestly as abandoned.
- **What the record keeps:** the request, the candidate, the checks, the
  findings and who had authority. Live exploration and review chatter can
  go. Git holds the code and, where needed, the review and landing
  record.

[GitHub's review states](https://docs.github.com/en/pull-requests/reference/pull-request-reviews)
show why feedback, approval and requested changes stay separate.

**Built:** this is [dap-room](../apps/room/docs/first-change.md). **Also needs:** [a fork for each hold](roadmap.md#a-fork-for-each-hold), so that each performer works in a separate repository.

### 43 Several agents investigating, with delegated tool work

A user's agent splits a question into parts and gathers the evidence it
may use.

- **Who decides:** agents look at implementation, security and impact on
  users. A person owns the final decision. A tool executor holds limited
  powers. Under one owner these are work roles, not independent parties.
- **When it closes:** each investigator closes its assignment, even with
  contradictions left. The owner accepts an exact result under stated
  conditions.
- **What the record keeps:** accepted findings, blockers, scope changes
  and delegated commitments. Chatter and discarded guesses can vanish.
  Custody keeps results that need independent audit.

A critic's confident statement is not a veto. Agreement between models is
not proof of an outside fact. A tool action with an unknown result stays
unresolved.

**Also needs:** [outside parties and systems](roadmap.md#outside-parties-and-systems), so that the scope itself reconciles a tool action with an unknown result. A participant's report works today.

### 36 Incident response and a disputed root cause

An on-call agent summarises alerts and a first timeline.

- **Who decides:** the resolver holds the technical evidence. The
  commander sets priorities. The liaison knows the impact on customers.
  The scribe records what was done. One person can hold several roles.
- **When it closes:** the commander can close the restoration while the
  liaison keeps an impact inquiry open. The root cause can stay disputed.
- **What the record keeps:** decisive observations, delegated fixes and
  their outcomes. Hypotheses and presence can go. Custody keeps the
  postmortem and its evidence.

A lost answer to a fix never means that nothing happened. A second
attempt follows the first attempt's recovery rule. It does not start as
a new operation.

**Also needs:** [durability levels](roadmap.md#durability-levels), for presence and hypotheses that keep no record; [outside parties and systems](roadmap.md#outside-parties-and-systems), for a fix that the scope sends.

### 03 A grocery budget that respects each person's preferences

An agent groups receipts and proposes a basket. This extends Prosser's
[grocery-budget example](https://x.com/jimprosser/status/2108279543534686703).

- **Who decides:** household members know their own diets and limits.
  The shopper decides on substitutions. The shop decides what is in stock
  and what it charges. A cheaper basket that an agent computes is not
  everyone's consent.
- **When it closes:** the planner closes a proposal once it is reviewed.
  Members accept its limits. The purchase, and whether people were happy
  with it, close later.
- **What the record keeps:** agreed limits, exclusions, replacements and
  totals linked to receipts. Custody keeps receipts when reconciling
  matters. A lower total can stand beside a rejected substitution.

**Also needs:** [evidence capture and private custody](roadmap.md#evidence-capture-and-private-custody), for receipts.

### 20 A care rota for an older parent

One sibling's agent collects everyone's availability and shows a gap.

- **Who decides:** the parent decides preferences and what is shared.
  Siblings have unequal time. A paid carer has a separate agreement. Each
  agent acts for one person or one firm.
- **When it closes:** a helper closes a shift by reporting it done. The
  parent accepts the arrangement separately. A full rota can still leave
  disagreement about who carries most of the load.
- **What the record keeps:** shifts, conditions, cancellations and who is
  responsible for each gap. Private custody keeps the paid service's
  terms and evidence for disputed work.

Saying "I could probably do Tuesday" is not a commitment. The person who
organises the rota does not gain authority over the parent.

**Also needs:** [evidence capture and private custody](roadmap.md#evidence-capture-and-private-custody), for the paid service's terms.

### 22 An older parent's move and possessions

An agent that the parent owns sorts priorities and a list of
possessions.

- **Who decides:** the parent decides what happens to each thing.
  Siblings disagree about work and ownership. Movers control transport.
  Housing staff control access. No agent can claim a right to property
  from an inventory.
- **When it closes:** the parent closes decisions on chosen items and
  destinations. Movers close delivery. Each sibling closes their own
  tasks. Missing items or unfinished setup stay open.
- **What the record keeps:** each choice and who made it, delegations
  with their limits, and handover reports. Private custody keeps the
  inventory, the movers' terms and chosen photos.

If the parent changes their mind, future authority changes. Earlier
decisions stay in the record, and so does any family disagreement.

**Also needs:** [evidence capture and private custody](roadmap.md#evidence-capture-and-private-custody), for the inventory, terms and photos.

### 26 A group bulk purchase with uneven delivery

An organiser's agent proposes a split of one supplier's offer.

- **Who decides:** each household decides its quantity and its maximum
  spend. The supplier accepts the order. A coordinator handles pickup.
  Interest alone does not commit anyone.
- **When it closes:** a household joins when its spend is confirmed. The
  supplier closes the order. The organiser still tracks payment, pickup
  and exceptions. One share can be delivered while another is short.
- **What the record keeps:** exact commitments, the minimum-order
  condition and each allocation. Custody keeps the offer, the order and
  any payment or delivery evidence.

A cancellation or a changed quote has a declared response.

**Also needs:** [evidence capture and private custody](roadmap.md#evidence-capture-and-private-custody), for the offer and the order.

### 29 Renovation scope and changes

An owner's agent compares quote versions and marks unclear items.

- **Who decides:** the owner sets priorities. The contractor decides what
  it will do. Trades know their limits. An adviser can challenge
  assumptions.
- **When it closes:** each party agrees only to the exact scope or change
  it accepts. Completion, inspection and payment close later.
  Unconfirmed supplies or unpriced work stay open.
- **What the record keeps:** proposals, each acceptance or rejection, and
  changed duties. Custody keeps accepted drawings, quotes and marked-up
  photos.

Replacing a contractor ends one engagement. It does not erase what the
first firm promised, or move its responsibility to the new firm.

**Also needs:** [evidence capture and private custody](roadmap.md#evidence-capture-and-private-custody), for drawings and quotes. A detached text already pins an exact version by its hash.

### 30 A renovation snag list after the work is reported done

An agent groups the owner's dated observations into specific requests.

- **Who decides:** the owner sees unfinished details. The contractor may
  think the job is done. A supplier answers for its product. A specialist
  gives a signed opinion. Agents cannot decide the cause by voting.
- **When it closes:** the contractor closes reported work. The owner
  accepts, withdraws or disputes each item. A recurring fault reopens
  that item only.
- **What the record keeps:** observations, responses, promised visits
  and what was accepted. Custody keeps before and after photos, list
  versions and reports.

"Accepted as is" is a legitimate outcome. It does not pretend the defect
was fixed.

**Also needs:** [evidence capture and private custody](roadmap.md#evidence-capture-and-private-custody), for the photos.

### 38 A milestone invoice and a disputed payment

A freelancer's agent puts together the agreed scope, evidence of the
work and a draft invoice.

- **Who decides:** the freelancer knows the work. The client accepts it.
  Finance makes the payment. An agreed arbiter has only the powers the
  agreement gives.
- **When it closes:** the client can accept part of the work. Finance can
  issue a payment while the freelancer waits for the money. The disputed
  balance stays named.
- **What the record keeps:** exact terms, changes, acceptances, the
  invoice and each payment attempt. Private custody keeps the contract and
  the accounts.

A payment with an unknown result is reconciled through the payment
provider. Each provider's retry rules have limits. They do not allow
endless retries.

**Also needs:** [outside parties and systems](roadmap.md#outside-parties-and-systems), for a payment that the scope sends. A participant's report works today. [Evidence capture and private custody](roadmap.md#evidence-capture-and-private-custody), for the contract.

### From the dap-spike's sweep: buildable today

The dap-spike's sweep found these cases too:

- A discussion channel.
- A kanban board whose cards everyone reads.
- A task workflow with handoff and reviews.
- A workflow with many roles and gates.
- A workroom of several agents.
- An inventory.

## 2. Nearly buildable

These cases need one piece that is designed or partly built. Either the
application uses messages between its own scopes, or it declares an
outside operation. dap-room's own scopes already work by messages.
"Nearly" refers to the shared record: cases 25 and 33 also need private
views for one part, as their cards say.

### 33 Booking a room or equipment, with event dependencies

An organiser's agent finds free slots and drafts a request.

- **Who decides:** a steward controls capacity. Other bookers need to see
  what is taken. The organiser knows the purpose. A caterer or an
  equipment supplier has its own agreement.
- **When it closes:** the steward closes an allocated slot. The organiser
  accepts the terms. Suppliers and the return check close separately. A
  free slot is not a reservation.
- **What the record keeps:** holds, expiry, no overlaps and confirmed
  changes. Everyone can see that a room is taken. Only some people see
  why. Custody keeps booking terms.

An expiry needs the recorded clock. A browser timer cannot cancel a
commitment.

**Needs:** [an application's own messages between scopes](roadmap.md#an-applications-own-messages-between-scopes), for several rooms under one allocator and for the suppliers' separate agreements; [private views in one record](roadmap.md#private-views-in-one-record), to keep the purpose private.

### 25 A shared family budget for a purchase or repair

An agent compares estimates and what each person might contribute.

- **Who decides:** contributors have different means and benefit
  differently. One authorised buyer places the order. The supplier
  controls the quote and the delivery. Agents propose within each
  person's limit.
- **When it closes:** each contributor closes their exact amount and
  conditions. The supplier closes the order. Delivery and payment close
  separately. One person saying "we agreed" stays a claim until the
  others confirm.
- **What the record keeps:** versioned commitments, each person's
  maximum and corrections. Custody keeps the accepted quote and receipts
  privately.

A price rise above someone's limit needs their approval again. A
contribution's amount can be shared while the reason for it stays
private.

**Needs:** [an application's own messages between scopes](roadmap.md#an-applications-own-messages-between-scopes), so that one scope owns the budget; [private views in one record](roadmap.md#private-views-in-one-record), to keep a contributor's reasons private.

### 31 Buying a used car, with an inspection and handover

A buyer's agent organises requirements and the seller's documents.

- **Who decides:** the buyer and their partner set the budget. The seller
  knows the car's history. An inspector supplies a limited report.
  Finance and registration offices run their own processes. An agent
  cannot turn a seller's claim into an inspection finding.
- **When it closes:** buyer and seller close the terms they agree.
  Payment, papers and accepting the car's condition close separately.
  Missing papers or a conflicting report stay open.
- **What the record keeps:** offers with their limits, acceptance of an
  exact version, and the handover list. Private custody keeps the report,
  the terms, receipts and photos.

**Needs:** [an application's own messages between scopes](roadmap.md#an-applications-own-messages-between-scopes), so the inspection is its own scope that returns a result; [evidence capture and private custody](roadmap.md#evidence-capture-and-private-custody), for the report and terms.

### 35 Approving a release and recording the deployment

A release agent puts together the build identity, the checks and a
rollout plan.

- **Who decides:** the service owner knows the risk. The release manager
  sets the timing. Security and support may have other limits. The
  executor may deploy only to the named environment.
- **When it closes:** approval closes the judgement that the release is
  ready. It does not run it. A confirmed deployment closes that operation
  while customer checks can stay open.
- **What the record keeps:** the approval, the exact build and
  environment, and the attempt's identity before it runs. Custody keeps
  released artifacts and their provenance, in Git or a binary registry,
  or both.

An unknown outcome needs reconciling. A rollback is a new approved
operation.
[GitHub's environment protection](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
is a concrete example of approval before execution.

**Needs:** [outside parties and systems](roadmap.md#outside-parties-and-systems), for a deployment that the scope sends and reconciles. The model runs today for publication to a Git host. [Evidence capture and private custody](roadmap.md#evidence-capture-and-private-custody), for released artifacts.

### From the dap-spike's sweep: nearly buildable

Bookings across several rooms with one capacity for the whole building,
and two projects that share one budget.

## 3. Private views

These cases need one record in which each participant reads a different
part, and everyone still agrees on every shared decision. dap does not
have that today: every member of a room reads the whole record. The
dap-spike tested this property, and the
[roadmap](roadmap.md#private-views-in-one-record) says what it found.

### 32 A guitar sale with private competing offers

The seller's agent prepares a listing. Each buyer's agent prepares that
buyer's conditions.

- **Who decides:** the seller owns the guitar. Buyers compete. An
  inspector gives a limited assessment. A co-seller who joins late can
  see the decision without seeing every private bid.
- **When it closes:** one accepted offer closes the choice, under the
  declared rule that only one offer wins. Payment, handover and accepting
  the condition stay separate. Losing buyers close their own pursuit.
- **What the record keeps:** offers, withdrawals, counter-offers and the
  one acceptance. Custody keeps the chosen terms, the report and delivery
  evidence.

Closing the sale does not reveal the private prices.

**Also needs:** [an application's own messages between scopes](roadmap.md#an-applications-own-messages-between-scopes), for the inspection.

### 42 Membership and governance of a community budget

A member's agent helps write a proposal and its budget options.

- **Who decides:** members have competing priorities. The treasurer knows
  the funds and private reasons about members' standing. A committee
  applies the admission rules. A steward carries out decisions. Agents
  advise their people. They are not extra votes.
- **When it closes:** a motion or a membership decision closes only under
  the pinned rules for eligibility, quorum and disclosure. Spending,
  access and procedural challenges close separately.
- **What the record keeps:** proposal versions, valid votes, dissent and
  changed standing. Custody keeps rule versions, minutes and accounts.

A public outcome need not reveal private reasons. The dap-spike's
[Club counterexample](https://github.com/generalbusiness-ai/dap-spike/blob/main/spike/REPORT.md)
shows that such a policy is still to be validated.

**Also needs:** [rules that change after creation](roadmap.md#rules-that-change-after-creation), for rules that are amended under their own procedure.

### 21 A childcare gap around work

A parent's agent finds one uncovered time and drafts questions that can
be answered.

- **Who decides:** both parents decide arrangements. The carer decides
  their availability. The employer sets shifts. Each agent has its own
  permissions.
- **When it closes:** the carer can close an availability answer. The
  parent closes only when the exact handoff, and who may collect the
  child, are confirmed. A settled shift does not settle transport or
  backup.
- **What the record keeps:** the time, named confirmations, collection
  permissions, cancellations and the actual handoff. Restricted custody
  keeps contacts and permissions.

Matching calendars is not enough. Private details about the child need
not be visible to everyone discussing the parent's shifts.

### 37 A procurement award and accepting the delivery

A requester's agent drafts requirements and compares quotes.

- **Who decides:** the buyer controls the budget. An evaluator judges
  suitability. The supplier knows its delivery limits. The receiver sees
  the goods that arrive. No agent can sign another organisation's
  acceptance.
- **When it closes:** the award closes the choice. The supplier's
  acceptance closes its commitment. The receiver accepts named items. A
  short delivery or a quality dispute can stay open.
- **What the record keeps:** requirements, offers, authority,
  commitments and exceptions. Custody keeps the awarded terms and any
  required public notices.

[Open Contracting's release model](https://standard.open-contracting.org/latest/en/schema/reference/)
separates planning, tender, award, contract and delivery. A published
award is not the supplier's order or a completed delivery.

**Also needs:** [outside parties and systems](roadmap.md#outside-parties-and-systems), for the supplier's own acceptance.

### 39 A job application, offer and onboarding

A candidate's agent prepares an application and questions about an
offer. A recruiter's agent organises the criteria.

- **Who decides:** the candidate knows their preferences. Assessors judge
  different skills. A manager decides. Pay approval and onboarding are
  separate steps with their own owners.
  [Structured interviews](https://www.opm.gov/policy-data-oversight/assessment-and-selection/structured-interviews/)
  argue for consistent criteria, not for more agent opinions.
- **When it closes:** the application, each assessment, the offer and the
  candidate's acceptance close separately. A rejection can end the
  application.
- **What the record keeps:** the criteria, submitted versions, judgements,
  what the negotiator may agree, and setup tasks. Restricted custody keeps
  required documents.

Accounts set up and an actual first day need outside evidence. A dispute
about a fact stays separate from disagreeing with the decision.

**Also needs:** [outside parties and systems](roadmap.md#outside-parties-and-systems), for account setup and the actual start.

### 40 A school support plan and whether it is delivered

A parent's, student's or teacher's agent organises observations and
questions.

- **Who decides:** the family knows daily life. The teacher knows the
  classroom. A specialist interprets evidence. A school representative
  knows the resources. The
  [Department of Education's team roles](https://sites.ed.gov/idea/regs/b/d/300.321)
  are one example of these roles. This card does not adopt a legal
  procedure.
- **When it closes:** a meeting ending is not agreement on a plan, and
  agreement is not support delivered. Dissent or missing support stays
  open.
- **What the record keeps:** the reviewed plan, acknowledgements,
  responsibilities and requests for changes. The school's custody keeps
  official versions.

Private notes stay private even when they shaped a proposal. A signed
plan does not prove the support happened.

**Also needs:** [evidence capture and private custody](roadmap.md#evidence-capture-and-private-custody), for the official versions.

### 41 A research review and a reproducible result

An author's agent organises claims, methods and sources.

- **Who decides:** a coauthor knows an experiment. A reviewer checks the
  methods. An editor or programme officer decides. A data steward
  controls access. Each agent works from the evidence it may see, and
  none of them gains the decision.
- **When it closes:** the reviewer's recommendation closes the advice.
  The editor's decision closes the editor's part. Reproducibility
  objections and data release can stay open.
- **What the record keeps:** the manuscript, the exact data and software
  versions, objections, responses and the decision. Custody keeps the
  submitted and final files, and the material needed to reproduce the
  result.

[NSF merit review](https://www.nsf.gov/funding/merit-review) separates
expert advice from the funding decision. Git can hold code. Restricted
data needs another keeper. Access for review is not permission to
publish.

**Also needs:** [evidence capture and private custody](roadmap.md#evidence-capture-and-private-custody), for restricted data.

### From the dap-spike's sweep: private views

The dap-spike's sweep found these cases too:

- A sale with private offers. Case 32 continues it.
- One room's bookings, with a private purpose.
- A club with private applications and dues.
- A kanban board with private cards and a limit on work in progress.
- Poker, which also needs commitments revealed later and a trusted dealer.

## 4. Episodes across organisations

Each case here starts as one person's account of dealing with
organisations that have not joined. Each needs all three of
[evidence capture and private custody](roadmap.md#evidence-capture-and-private-custody),
[outside parties and systems](roadmap.md#outside-parties-and-systems) and
[a personal account across records](roadmap.md#a-personal-account-across-records).
A note under a card names anything more.

In every card, a summary, a status on a screen or a receipt is not the
same as the outcome. Each person can close their own part, keep their
disagreement, and reopen the matter when new evidence arrives.

### 01 A medical bill inquiry and a disputed outcome

A patient's agent compares a bill with coverage records and prepares one
question. This extends Prosser's
[unexpected emergency-care charge](https://x.com/jimprosser/status/2108279519732003163).

- **Who decides:** the patient knows their account. Billing staff know
  how the charge was built. The insurer's staff decide their own answer.
  A helper's agent can gather evidence but cannot decide what the patient
  is owed.
- **When it closes:** billing can close an explanation while the patient
  waits for a correction, or stops with their disagreement recorded.
- **What the record keeps:** reviewed questions, approvals, submissions,
  receipts and promised answers. Private custody keeps the unchanged
  bills, the coverage versions and the exact letters.

Financial help, a corrected charge and money received are three separate
outcomes.

### 02 Comparing prescription prices and keeping refills going

A patient's agent compares the prices it is given and lists missing
assumptions. This extends Prosser's
[medicine-cost comparison](https://x.com/jimprosser/status/2108279531765367193).

- **Who decides:** the patient weighs convenience. Pharmacies know stock
  and their conditions. The insurer knows its processing. A prescriber
  makes clinical decisions. Agents only do paperwork.
- **When it closes:** the patient can close the comparison and change
  nothing. A pharmacy accepting a prescription does not close collection
  or the next refill.
- **What the record keeps:** exact comparisons, approved inquiries and
  collection receipts. Private custody keeps the prescriptions.

The application does not decide that a substitute is safe, or promise a
saving.

### 04 A card-debt inquiry and a repayment plan

An agent organises the balances it is given and drafts questions. This
extends Prosser's
[three-card debt scenario](https://x.com/jimprosser/status/2108279555471667421).

- **Who decides:** the borrower knows what the household can pay. A
  partner may share authority to pay. Each lender decides its own offer.
- **When it closes:** a lender can close a request by refusing it. The
  borrower records disagreement or stops. An accepted plan does not prove
  that a payment was made or that it is affordable.
- **What the record keeps:** proposal versions, limits, approvals and
  payment references. Private custody keeps statements and accepted
  terms.

The case shows coordination. It does not recommend a financial strategy.

### 05 Renewing car insurance without a gap in cover

An agent compares the renewal with other quotes. This extends Prosser's
[renewal increase](https://x.com/jimprosser/status/2108279567127572710).

- **Who decides:** the driver weighs cost and cover. A second owner may
  need something different. Insurers make offers and issue policies. A
  broker's agent cannot bind an insurer beyond its mandate.
- **When it closes:** the comparison can close with a decision to stay.
  Choosing, the application being accepted, the policy being issued and
  the old policy ending close separately.
- **What the record keeps:** terms, start dates and approved actions.
  Private custody keeps policy versions and issue and cancellation
  evidence.

A chosen quote is not cover just because a dashboard says "selected".

### 06 Negotiating an internet plan and changing service

An agent puts together usage needs and the offers received. This extends
Prosser's
[internet-charge negotiation](https://x.com/jimprosser/status/2108279579031023631).

- **Who decides:** the subscriber cares about price. Other people in the
  home need reliability. Retention staff can offer terms. Installers turn
  the service on.
- **When it closes:** staff can close the offer while the subscriber
  still waits for the new price or service. Deciding to stay closes the
  switch without settling dissatisfaction.
- **What the record keeps:** the exact offer, the approved answer, dates
  and equipment returns. Custody keeps the terms, the order and the next
  bill.

Activation, closing the old account and the promised saving each need
their own evidence.

### 07 A repair estimate and accepting the car work

A driver's agent compares an itemised estimate and prepares questions.
This extends Prosser's
[vehicle repair estimate](https://x.com/jimprosser/status/2108279590733099153).

- **Who decides:** the driver knows the symptoms and limits. Two garages
  can disagree about what is needed. An independent specialist gives a
  limited assessment. Each garage's agent speaks only for that garage.
- **When it closes:** the driver can close the comparison without
  ordering. A garage finishing work does not mean the driver accepts it,
  or settles a disputed item.
- **What the record keeps:** the agreed scope, estimate versions,
  requests for more work and handover notes. Custody keeps reports,
  invoices and photos.

Technical judgements stay attributed to the qualified person who made
them.

### 08 Applying for assistance and the decision

An agent turns a checklist into questions about missing evidence. This
extends Prosser's
[household assistance example](https://x.com/jimprosser/status/2108279602569433556).

- **Who decides:** the applicant and others in the household decide what
  to disclose. A helper handles documents. Staff make the decision. Agents
  prepare and watch. They do not declare eligibility.
- **When it closes:** a helper closes one document task. The applicant
  closes the submission with a receipt. Staff close the decision later.
  More evidence or corrections can stay open. Withdrawing closes the
  pursuit.
- **What the record keeps:** form versions, approved answers and
  receipts. Private custody keeps what was submitted and the replies.

A receipt is not an approval, and an approval is not a payment.

**Also needs:** [private views in one record](roadmap.md#private-views-in-one-record), because each household member controls what they disclose.

### 09 A lease renewal when the household disagrees

An agent organises the renewal offer, comparisons and maintenance
evidence. This extends Prosser's
[rent-increase example](https://x.com/jimprosser/status/2108279614397464804).

- **Who decides:** the two tenants can disagree about the cost of moving.
  The landlord's representative makes the offer. A tenant adviser gives a
  separate view. Agents draft. They do not assume legal protection or
  consent.
- **When it closes:** the manager can close the negotiation by issuing
  terms. Each tenant decides and accepts separately, or keeps their
  disagreement.
- **What the record keeps:** exact proposals, authority, responses and
  accepted conditions. Private custody keeps the lease and letters.

Accepting a renewal does not close repair promises, moving plans or
payment disputes.

### 10 An electricity bill that doesn't add up

An agent lines up the bills, periods and meter readings. This extends
Prosser's
[electricity-cost increase](https://x.com/jimprosser/status/2108279626309193797).

- **Who decides:** one resident knows who was home. Another knows which
  appliances ran. Provider staff know the readings. The provider's agent
  can answer within its authority without settling every theory.
- **When it closes:** a resident can close their understanding without a
  complaint. Staff can close an inquiry while an agreed correction is
  still pending.
- **What the record keeps:** figures, uncertainties, the reviewed
  question and the answer. Custody keeps the original bills and meter
  photos.

A photo of the meter is an observation. It is not the provider accepting
the reading.

### 11 A duplicate charge or a checkout error

An agent matches a receipt with transactions and prepares a limited
question.

- **Who decides:** the shopper recognises purchases. A joint account
  holder knows other spending. Merchant staff see orders. The payment
  provider sees processing. Equal amounts alone do not prove a duplicate.
- **When it closes:** the merchant may close with "refund started". The
  shopper closes when they accept the explanation or see the balance
  change. Delivery can stay disputed.
- **What the record keeps:** transaction identities, approved claims and
  promised refunds. Private custody keeps the receipt and statement.

A later correction changes where the matter stands. It does not delete
the original discrepancy.

### 12 Cancelling a subscription that others use

An agent finds the account and drafts exactly what is to be cancelled.

- **Who decides:** the subscriber gives the instruction. Another person
  at home wants to keep using it. The payer sees charges. The supplier
  knows what cancelling does.
- **When it closes:** the subscriber can decide to keep it. The supplier
  can confirm the cancellation while downloads, the final bill or access
  still end later.
- **What the record keeps:** the approved instruction, the confirmation
  and when access ends. Custody keeps invoices and the confirmation.

Clicking a button is an attempt. It is not proof of cancellation.

### 13 An unfamiliar bank fee

An agent links a fee to the account's terms and drafts a neutral
question.

- **Who decides:** the customer knows how they use the account. A joint
  holder knows other activity. Bank staff explain or adjust.
- **When it closes:** the customer closes when they understand. The bank
  closes with a decision. An adjustment can stay pending.
- **What the record keeps:** the fee entry, the open question, the
  reviewed question and the bank's answer. Private custody keeps
  statements and terms.

The design does not assume a refund is available. A refusal can end the
matter.

### 14 A transaction you don't recognise

An agent pulls out the identifiers and prepares the account holder's own
report to the official channel they choose.

- **Who decides:** the account holder and a joint holder know what they
  recognise. The merchant and the provider's investigators hold different
  evidence. Agents organise information. They do not claim fraud.
- **When it closes:** the provider's acknowledgement closes the report. A
  later investigation can close while the holder still disputes its
  finding. A replacement card or a temporary credit can stay open.
- **What the record keeps:** the reviewed report, its reference and
  follow-up requests. Restricted custody keeps statements and replies.

A report whose sending is unknown is checked before trying again.
Passwords are never shared as evidence.

### 15 A rental deposit and disputed deductions

An agent sets move-in and move-out evidence against the landlord's list
of deductions.

- **Who decides:** the two tenants know different parts of the flat's
  history. The manager decides the deductions. A cleaner or repairer
  reports what they saw.
- **When it closes:** the manager can close its explanation while the
  tenants wait for a partial refund or dispute a deduction. The tenants
  split the refund between themselves separately.
- **What the record keeps:** each condition claim and who made it,
  questions about deductions, agreed amounts and receipts. Private
  custody keeps dated photos, the tenancy papers and each version of the
  list.

Photos support observations. They do not decide who is responsible.

### 16 A landlord repair and a defect that keeps coming back

An agent builds a timeline of the defect and drafts one request that
says when access is possible.

- **Who decides:** the tenant lives with the problem. The manager
  approves work. The contractor diagnoses and schedules. Another resident
  decides access to their own home. "Job complete" is not the tenant's
  acceptance.
- **When it closes:** the manager closes the assignment, the contractor
  closes a named task, and the tenant checks the result. If the defect
  returns, that item reopens.
- **What the record keeps:** reports, access permission, the appointment
  and claims of work done. Custody keeps photos, messages and handover
  evidence.

The workflow organises the exchange. It does not decide legal duties or
the technical cause.

### 17 Planning an energy retrofit and its aftercare

An agent turns usage data, property limits and proposals into
questions.

- **Who decides:** the occupant cares about comfort. The owner sets the
  budget. An assessor states assumptions. An installer does the work. A
  grant programme runs its own process.
- **When it closes:** the assessor closes a report. The owner rejects an
  option or approves an exact scope. Installation, inspection and real
  performance close later.
- **What the record keeps:** inputs, questions, the chosen proposal and
  approved changes. Custody keeps surveys, photos, contracts and
  completion records.

A projected payback is an estimate. Changed usage can revise it without
changing the original assessment.

### 18 A specialist appointment and follow-up

A patient's agent turns questions and chosen records into a brief for
the appointment.

- **Who decides:** the patient knows their goals. The clinician gives the
  assessment. A carer handles transport. Reception books the time.
- **When it closes:** the patient closes when their questions are
  answered or deliberately put off. The clinic closes when the visit and
  next steps are recorded. The carer can still wait for transport.
- **What the record keeps:** questions sent, acknowledgements and
  follow-up commitments. Private custody keeps the relevant records and
  confirmed instructions.

Attending the appointment does not answer the patient's questions, or
prove that a referral was accepted.

**Also needs:** [private views in one record](roadmap.md#private-views-in-one-record), for records with restricted readers.

### 19 The first week after leaving hospital

An agent pulls contacts, appointments and supply questions from the
discharge papers.

- **Who decides:** the patient and family know practical needs.
  Discharge staff know their handover. The next provider decides to
  accept the patient. A supplier delivers equipment.
- **When it closes:** sending documents closes the sender's part. It
  does not close the receiver's acceptance. Family support and the
  patient's questions close separately. Inconsistent versions stay open.
- **What the record keeps:** reviewed logistics, named commitments and
  receipts. Private custody keeps the source documents and the exact
  handover bundle.

Incomplete papers stay incomplete. The agent does not invent medical
instructions to make a checklist look finished.

**Also needs:** [private views in one record](roadmap.md#private-views-in-one-record), for records with restricted readers.

### 23 Moving house and handing over the property

A resident's agent builds an access and services checklist from the
agreements.

- **Who decides:** the outgoing and incoming residents observe different
  conditions. The manager controls keys. Movers and utilities each run
  their own service.
- **When it closes:** handing over the keys and acknowledging the
  condition can close while a utility change or an invoice is still
  open. The manager closing the account does not end a resident's
  dispute.
- **What the record keeps:** dates, duties, access permissions and
  condition reports. Custody keeps forms, photos, meter readings and
  service confirmations.

Case 15 is about reconciling a deposit. This case is about coordinating
the handover.

### 24 A family trip across separate providers

One traveller's agent puts together constraints and a possible
itinerary.

- **Who decides:** each traveller has a private budget and access needs.
  The airline, the hotel and each activity provider control their own
  bookings. No agent can commit another traveller.
- **When it closes:** each traveller closes their own commitment. Each
  provider closes its booking. The trip and any refunds close later. A
  confirmed hotel leaves other bookings open.
- **What the record keeps:** approvals, cost commitments and
  confirmations. Private custody keeps booking terms and receipts, with
  identity documents restricted.

A changed flight reopens the connections it affects. It does not cancel
other bookings or prove a right to a refund.

**Also needs:** [private views in one record](roadmap.md#private-views-in-one-record), for each traveller's budget.

### 27 A home-damage claim and getting back into the house

An owner's agent gathers photos, an inventory and receipts for one
question to the insurer.

- **Who decides:** the owner wants a usable home. The insurer decides on
  the claim. A contractor knows the repair. The family knows where they
  can stay.
- **When it closes:** the insurer can close with a decision. The owner
  can accept part and dispute the rest. The repair and the family's
  return close separately.
- **What the record keeps:** reviewed submissions, receipts, corrections
  and promised replies. Private custody keeps the exact evidence,
  estimates and replies.

Newly found damage opens a new request without rewriting the earlier
record. Submitting a claim is not having it accepted.

### 28 Accident repair and a hire car

A driver's agent keeps insurer requests, garage progress and the hire
car apart.

- **Who decides:** the driver bears the inconvenience. The insurer runs
  its process. The garage repairs. The hire company sets return terms.
  No agent can promise one firm's work on behalf of another.
- **When it closes:** "ready for collection" closes a notice, not the
  driver's acceptance of the repair. The insurer's answer and the hire
  car's return close separately.
- **What the record keeps:** dates, approved scope changes, handover notes
  and receipts. Custody keeps estimates, photos, hire terms and return
  evidence.

A notice with an unknown result stays unknown until checked. It does not
start a new hire or payment by itself.

### From the dap-spike's sweep: episodes across organisations

The dap-spike's sweep found these cases too:

- An insurance claim. Case 27 continues it.
- A hospital stay. Cases 18 and 19 continue it.
- Trip planning. Case 24 continues it.
- Feeds, sensors and other outside data sources.

## 5. Changing rules and boundaries

None of the 45 numbered cases needs this first. All but the last case
here come from the dap-spike's
[sweep of its original use cases](https://github.com/generalbusiness-ai/dap-spike/blob/main/notes/2026-09-18-authoring-language-directions.md).

| Case | What it needs |
|---|---|
| A sale that later gains inspection, negotiation, escrow and comments | [Rules that change after creation](roadmap.md#rules-that-change-after-creation): a package added to a running record, and a later package that tightens an earlier one's guard |
| A club that changes how it admits members | The same, with [private views in one record](roadmap.md#private-views-in-one-record) |
| Chess and other games with many rules | [Expressions that compute effects](roadmap.md#expressions-that-compute-effects). A rule can accept or refuse a proposed position, and nobody has yet written a game's rules in the rule language |
| Merging two organisations' records | [Split and join](roadmap.md#split-and-join) |
| [Tailapps](https://github.com/generalbusiness-ai/tailapps): small pipelines that turn agent telemetry into tables you query with SQL | [Expressions that compute effects](roadmap.md#expressions-that-compute-effects), so one act can update several rows that an expression computes; tables that answer SQL; and [durability levels](roadmap.md#durability-levels), because the raw telemetry should not be kept. The rule language is close to the one Tailapps uses. A pipeline's life (create, validate, activate) is buildable today. So is a running total, if the router proposes each new total and a rule checks it |

## Four cases in more detail

### Medical billing: preparing a question is not getting relief

Case 01 starts with a pile of papers and an unanswered question. What
the patient says, an amount the agent read from a bill, and a helper's
review stay separate. The patient's approval applies to one exact
question. A portal receipt closes the submission.

A reply captured from the portal stays a document. It becomes the
billing office's own act only if the office signs it. The patient can
accept an explanation while an adjustment is still pending. A
contradictory later bill reopens the follow-up, and the first bill stays
in the record. A refusal can close the matter with the disagreement kept.
A private export lets a new helper take over without involving the
hospital.

### A home claim holds several separate outcomes

Case 27 covers the insurer's answer, the repair and where the family
stays. A spoken account, photos and an imported estimate are different
from the agent's summary of them. The owner's approval applies to the
exact bundle submitted.

A refused claim, a partly accepted repair and the family's return can all
be true at once. Replacing a contractor changes who is engaged and who
sees what. It does not change who promised what before. Custody keeps
the key photos and the exact versions, not just a transcript. Each person
can close their own part while another person's matter stays open.

### Software review: the approval names what lands

In case 34 a reviewer approves candidate A. A fix produces candidate B,
and the application's rules decide which verdicts still apply to B. The
maintainer's authority names B and the destination.

An entry in the journal is not the same as the code being in Git. dap's
[destination](../packages/platform/src/destination.ts) records the
publication and the receipt it still owes. A lost answer from the Git
host stays unknown until someone looks. After B lands, the requester can
still be unhappy and open a new issue. That does not undo the landing.
This is the difference between a recorded decision, its outside result
and each person's own closing.

### Counting: you can see when an answer is confirmed

Case 44 runs one turn rule, either as live practice or as a kept
session. A live answer confirms only the local result, and it can vanish.
A journal answer waits for the record, so the session can be replayed.

Asking to speak, reporting that speech finished and reporting that it
was heard are three different things. Speech finishing does not prove
that everyone heard it. Pausing and resuming are ordinary acts in the
conversation. Who is connected is temporary. Accepted numbers and turns
survive. A speech request with an unknown result is reconciled, so that
nobody speaks twice. Clients update on their own, so nobody needs to
refresh the page or stage a turn out of order to show this.

## Source

Written from a draft of 9 October 2026, regrouped on 13 October 2026
against main `d1b845f8`, and revised on 14 October 2026 against main
`f20df342` for plain language. The grouping is a judgement from reading
the documentation and the definitions. No case was built or run for this
page, except the three marked **Built**.
