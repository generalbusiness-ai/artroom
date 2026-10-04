# Collections of Rooms: managing services at scale

Date: 2026-10-02. Request `34cf52b3`, promise `6430ffd4`. A design note
and a draft for Hugh's reading. It adopts nothing. Its purpose is to turn
one discussion into numbered requirements that later requests can cite.

Revised 2026-10-04: reconciled with the reviewed clarification
`plans/012-2026-10-04-collections-clarification.md` under request
`50d7806a`. Section 10 lists, by place, the statements that this
revision corrects.

Corrected 2026-10-04 under the planner's direction `fceb27d0`: six
passages that the clarification left at odds with its own corrections,
and the credit for the pi spike. Section 10 quotes the clarification's
wording that each correction replaces. The clarification itself stays
frozen as reviewed history.

**Status of this note.** Read every statement as one of five kinds.

- **Delivered.** Only Artroom's protocol and code on `main`, at the
  commits pinned in section 8.
- **History.** What a dated source showed when it was read. These
  sources are not delivered Artroom behaviour: the pi-durable spike is a
  bounded local harness; the jam note is a dated design for a planned
  application; the wake note is not landed; the dap snapshot is another
  project's notes and fixtures. Section 8 pins each one. Section 10
  keeps the 2026-10-02 wording that this revision corrects. History is
  evidence about the past. It is not a claim about what runs today.
- **User direction.** Hugh's instructions, recorded in W2 and section 8.
  They direct the work. They deliver nothing.
- **Adopted planning direction.** The planning clarifications 005 to
  008. They are approved or adopted direction and are not delivered
  runtime.
- **Proposed.** Everything else. The grid, the three control mechanisms,
  rules C-1 to C-6, the gaps, the revocation mechanisms and all 41
  requirements are proposals. None is adopted. None is built. No
  measurement of any of them exists.

The labels say where a claim comes from, not whether it is delivered.
[Source] means a named source says it. Beside a rule number or a code
path, the source is the protocol or code at the dated `bd520fb9`
baseline unless the text says otherwise. Beside a note, a spike, a dap
document, a plan or a user instruction, it cites what that source says
and has that source's status from the list above. [Judgement] means a
design choice or opinion of this note. [Untested] means nobody has run
it.

The clarification is complete Draft 2, written under request
`b98775076f5786fc1ba51c261658c3f046de6455` and promise
`7184dd20c75409488194667159dc8b8342095346`. It reconciles all seven
accepted changes in `e1f72af6` / `5f8b438d`. Checker review `2baa8ef7`
approved it as planning evidence, ratification `f78144e4` made that
approval effective, and guidance `b5aab68c` directs this reconciliation.
The approval adopts no mechanism and approves no runtime. Original
request `34cf52b3` / promise `6430ffd4` still owns source-note
integration, and its independent review is still owed.

The clarification read the complete original of this note at
`5b579511c29fb70e488c7cc4370640154c44f41f`: 47,931 UTF-8 bytes, 630
lines, SHA256
`4179cca075e3c9ff2ed83ae7519eea98e23228c71375d7f636f054ea9f65038d`.
When the clarification was written, on 2026-10-04, Artroom main was
`e6e6782830e0ca8a68f0d11c4d4ece5e4e98c967`. The declared-acts integration
candidate was then unlanded and needed functional repair and review. It
is not credited as shipped behaviour here.

The discussion it records (2026-10-02, this session's log in the workroom)
reached these positions, each of which this note tests against use cases:

- Artroom's unit for managing services at scale is the **engagement**:
  one Room per customer, service and firm, with a durable agent as the
  firm's representative.
- The administrative layer is a **grid**: columns are services, rows are
  customers, cells are engagements. Grouping on either axis rolls the
  numbers up; drilling in goes from a number to a Room to an act.
- The Rooms that shape a collection are **control Rooms**, and there are
  three kinds: a firm, for identity; a catalogue, for functionality; a
  grouping, for a reporting dimension. Each contributes one kind of thing
  by one mechanism, and none of them commands a cell.
- **Revocation** is the one thing that must reach every cell quickly, and
  may need its own mechanism.

"Reach every cell" means fast refusal at any applicable new admission,
with proactive compromise-effects delivery only to cells with affected
activity/evidence/reservations. It does not mean waking the entire grid.
[Judgement]

Related work on the board: request `d50ce26d` (the firm's authority chain,
a design note), request `a13a0bf5` (every Room founded with a policy),
assert `d8e11208` (the scope of `d50ce26d`: a Room's admission never reads
another Room; revocation is the only push).

**How to read the labels.** Each claim carries one:

- **[Source]** a fact from Artroom's protocol or code, cited by rule
  number, from `docs/protocol.md` on `main` at `bd520fb9`; or from a dap
  note in the dap repository (`~/play/dap`, `main`), read at snapshot
  `9d738e2e71b84ec85cd321bd4d87623ea3fad355`;
- **[Judgement]** a design choice or opinion;
- **[Untested]** a claim nobody has run.

Proposed rules in this note are labelled `C-<n>` (collections). They are
not protocol rules. A later amendment would give them `R-` numbers.
Every proposed requirement is a design obligation, not an implementation
claim. `[Source]` rule citations in walkthroughs refer to the dated
`bd520fb9` baseline unless explicitly stated otherwise. Section 8 pins the
other notes and distinguishes accepted later direction from source delivery.

**Names for other planned work.** This note cites work that other
requests own. It does not define or change that work.

- **005, 006, 007, 008** are the planning clarifications
  `plans/005-2026-10-03-browser-cloud-work.md`,
  `plans/006-2026-10-03-experience-and-developer-adoption.md`,
  `plans/007-2026-10-03-attention-runtime-handoff.md` and
  `plans/008-2026-10-03-wake-and-schedule-clarification.md`. Like the
  clarification, they are in the shared checkout and are not on this
  branch.
- **C1 to C6** are the hosted coding work items listed in 006: C1
  `b538c5ea` (hosted authority and lifecycle contract), C2 `6cdaf20f`
  (real filesystem and process recovery spike), C3 `13dfc613`
  (production durable coding runtime), C4 `18815307` (browser identity
  and repository import), C5 `cfbde32f` (live browser journey) and C6
  `d89fc17f` (joint deployed acceptance). They are written without a
  hyphen. The proposed collection rules C-1 to C-6 are written with one.
- **N1 to N7** are the experience and adoption work items in 006. N2 is
  the full addressed-work lifecycle design.
- **K2** is the future Cloudflare K2 request `da2737b2`.

## Summary

- **The cell is self-sufficient.** Everything a cell needs to judge an
  act is retained locally: its roster, policy, pinned keys and digests,
  and any new revocation proof recorded with the admission receipt. A
  control Room never sits in the path of a cell's admission. External
  revocation infrastructure has the explicit freshness and replay boundary
  in section 5. Replay alone is required; million-cell cost is still
  unmeasured. [Judgement, Untested]
- **Three control Rooms, three mechanisms.** Identity arrives as a signed
  source object that is carried in and then admitted locally as an
  authorized key, pin or grant. A valid signature alone grants nothing
  (REQ-5). Functionality arrives as a
  digest, taken by a proposal in the cell. A reporting dimension never
  arrives at all: it is joined at query time. [Judgement]
- **Ten walk-throughs** (section 4) through dap and Artroom cases show
  that most of the design is composition of rules that exist. They find
  seven gaps. Two are already owned on the board: the firm as a
  keyholding principal and the mandate (G2, request `d50ce26d`), and the
  pack named at founding (G6, with request `a13a0bf5`). Five are new:
  genesis coordinates and a registry index (G1), a revocation path that
  is fast at scale (G3), a KPI fact the cell seals (G4), a standard form
  for a carried object's provenance (G5), and a sale whose bids must be
  hidden from each other, which Artroom cannot express inside one Room
  (G7).
- **Revocation needs two mechanisms together, not one.** Short-lived
  mandates bound stale mandate authority by its remaining lifetime, with
  no infrastructure. They do not bound a fail-closed outage, and there is
  no expiry-only fallback. Deployment revocation state, consulted at
  admission and recorded in the receipt, makes the stop fast only with
  retained completeness and freshness proof.
  Targeted delivery uses evidence of actual affected activity, rather than
  treating assignments as proof that a key acted. A per-cell
  proposal, the mechanism for everything else, fails the timeliness
  requirement outright. [Judgement]
- **Forty-one requirements** (section 6), each traced to a walk-through
  step and stated so that a test can show it holds.

## 1. The grid

**A cell is one engagement.** One customer, one service, one firm, for as
long as it takes. It is an ordinary Room: one repository, one sequencer,
one roster, one policy, one log (R-GEN-1, R-PUB-1). [Source] The record is
the deliverable. The firm's representative is a durable agent in its own
Durable Object that sleeps until something happens, so a firm can hold a
million open engagements at low idle cost. This scale and cost are an
engineering hypothesis requiring REQ-41's evidence. [Judgement, Untested]
The pi-durable note records a bounded local workerd spike
(`notes/2026-10-01-pi-durable.md`). Its setup lists the pinned lane A
Room, with its policy runtime, landing engine, workspace code and log
publisher, and the pinned lane E client, over fake Artifacts and the
publisher sandbox. The Room, client, policy, landing and log logic is
real within that harness. Listing the Room's workspace code does not make
a real hosted coding workspace. The prepared fork push was simulated.
The workspace token path was not exercised. Resumption was driven by the
caller, from retained local resume inputs. The spike demonstrates
prepared-act retry and scripted recovery within that harness. It does
not demonstrate an autonomous production representative, a real coding
environment, real coding-host persistence, provider publication or the
hosted C3 lifecycle. The setup list does not support any claim about the
workspace or token lifecycle. C3 owns production runtime and 007/008 its
input delivery; C2 owns real repository
recovery. [Source]

**The coordinates are in genesis.** A Room's genesis never changes
(R-GEN-2) and names the room, the repository, the first admin and the
recovery key (R-GEN-1, `Genesis` in `packages/contract/src/roster.ts`).
[Source] An engagement's customer, service and firm never change either,
so they belong there. Nothing about grouping belongs there. [Judgement]
Their immutable identity does not make them public. Authorized assertion,
opaque identifiers and bounded permitted indexing/query fields are part
of G1, REQ-1–2 and W10; embedding a sensitive customer name in public
genesis would already disclose it before a registry query. [Judgement]

**Enumeration is the registry's job.** The registry binds repository,
room ID and name, one binding per repository, never removed or moved
(R-GEN-13). [Source] Indexed by the genesis coordinates it answers "which
cells are in this row or this column". A Room never lists its children in
its own log, so no log grows with the collection. [Judgement]

**The grid is a view, not a thing.** Rows and columns are not Rooms. A
row is "every cell whose genesis names this customer". A column is "every
cell whose genesis names this service". The groupings above rows and
columns are where control Rooms come in.

## 2. Three kinds of control Room, one mechanism each

| Kind | Rooms | Contributes | Mechanism into the cell | The cell records | Can change the cell later |
|---|---|---|---|---|---|
| Identity | the firm's Room; the customer's own Room | keys, rosters, mandates | a source object carried in, then locally authorized key/pin/grant admission | own-key join or proposed G2 principal pin; each locally valid mandate/grant | authorized removal only; new keys/rosters require local acts |
| Functionality | catalogue Rooms | policy packs, checker configurations, KPI definitions, starting arrangements | import by digest; a later version is a proposal in the cell | the digest at founding and at every upgrade | never on its own |
| Reporting dimension | grouping Rooms, as many as there are ways to look | classification of cells | none; joined at query time against genesis coordinates | nothing | no |

Three consequences. [Judgement]

- **Identity has two contributors per cell.** The firm supplies its
  representative's mandate. The customer's own Room supplies the
  identity/source evidence and a key that may join or already hold local
  authority. The customer's grant to an agent is then an explicit local
  delegation in each cell; a delegation in the customer's private Room
  does not silently authorize acts in another cell. Both contributions
  are judged against retained local authority. This is a design boundary,
  not proof that an unsupported customer gains usable agency. DAP's
  structural-disadvantage criterion (dap,
  `notes/2026-09-20-direction-and-next-steps.md`, §1) requires a
  coherent current account, understandable next steps, and an account of
  needs met, unmet or supplied by a human. W5 and REQ-15–17 retain those
  outcomes separately from provenance. [Judgement, Untested]
- **Reporting dimensions multiply freely** because they have no
  authority. A firm's service lines, a regulator's categories, finance's
  segments and one person's "every cell where I am the customer" are all
  groupings. The last is dap's **perspective**, so the perspective is a
  reporting dimension and not a control relation. A grouping Room's one
  authority is over its own aggregate. Its roster is one required read
  permission; it does not authorize export of private cell data. Source
  cells must authorize the fields and audience, and the facts store must
  enforce those export/read limits. W10 states this additional boundary.
- **The mechanism follows the object, not the Room.** A firm may keep its
  roster and its packs in one Room. The roster is still imported as
  pinned keys, the packs as digests, and the firm Room's own owner map
  says which members may change which path.

## 3. The rules this design holds to

These are proposed. Each walk-through step in section 4 is judged against
them.

- **C-1. A cell's admission never reads another Room.** Anything a cell
  relies on from elsewhere is retained in the cell's own record, by digest,
  signed object or the bounded revocation witness in section 5, when it
  is used. The log is replayable alone without a mutable external lookup.
  Deployment facts the protocol already allows at admission are the room
  clock and, at founding, the registry (R-GEN-13). C-1 adds at most one
  more, in section 5.
- **C-2. A control Room holds grants and definitions, never commands.**
  No act in a control Room changes a cell.
- **C-3. Taking a new definition is a proposal in the cell**, landed under
  the cell's own policy (R-POL-9). An agent may make the proposal. It may
  not skip review.
- **C-4. Collection membership lives in the registry**, keyed by genesis
  coordinates, never in a Room's log.
- **C-5. Reporting carries copies and never authority.** The same rule as
  the future Cloudflare K2 request `da2737b2`. Export is permitted only by
  the source cell's declared field/audience/retention policy. Copying is
  neither a grant nor permission to disclose a private fact.
- **C-6. Revocation is the only push**, and it can only remove authority,
  never grant it. The cell still verifies issuer authority over the exact
  target and cell scope; a valid signature alone is insufficient.

Review every future control relation against the cell's locally authorized
pin, digest, carried-object provenance or removal proof. Refuse a relation
that pushes commands or new grants outside that local authority. Ordinary
authorized contributions still use the cell's declared acts and policy.
[Judgement]

## 4. Walk-throughs

Each step names the Room acted in, the control Room contributing (or
none), the mechanism, what the cell records, and the protocol rule met or
the gap found. Gaps are numbered `G<n>` and collected at the end of the
section. Requirements in section 6 cite steps as `W<case>.<step>`.

### W1. A code room with a shared checker service and a pi-durable author

The code-profile case at the dated protocol and spike baseline. One repository. A
maintainers team. A checker service that one deployment runs for every
room (lane G, `72d6abde`). An author agent in a Durable Object.

| Step | Room | Control Room | Mechanism | Cell records | Rule or gap |
|---|---|---|---|---|---|
| 1. Found the room with the starter pack | the cell | none; the pack comes from `packages/policy` | the pack is compiled into `.artroom/policy.json` on main; entry 1 names its digest | genesis; `policy-activated` with the digest | R-GEN-10, R-POL-9 [Source]. Today the default without a file is the bare R-POL-7 policy; request `a13a0bf5` makes the pack the default |
| 2. Invite the maintainers | the cell | none | invitation with a secret; the key binds at `join` | each `join` | R-GEN-6, R-ADM-3(c) [Source] |
| 3. Register the checker | the cell | the deployment's checker service | the policy names the checker by name and digest; the deployment binds the service | `policy-activated` names every active checker configuration | R-POL-9, R-EXEC-8 [Source]. One service for many rooms is already a collection; the room never reads the service to judge an act |
| 4. A maintainer delegates to the author agent's key | the cell | none | `delegate` roster op from the member key | the delegation | R-CRED-4, R-ADM-5 [Source]. The agent never joins |
| 5. The agent claims, writes, proposes | the cell | none | signed claim/proposal envelopes under the delegation, stored before first send; a separate prepared Git commit and fork push | admitted claim/propose; Git ref/object outcomes tracked separately | R-ADM-3(b), R-IDEM-2 [Source]; spike criterion 3 is bounded local/simulated-push evidence, not real hosted coding |
| 6. The Room issues a check job | the cell | the checker service | a job over a service binding, unsigned | the `check` act when it returns | R-EXEC-8 [Source]. The checker signs as a member of each room; request `f12cef6b` is the open amendment for a per-job delegation |
| 7. An owner reviews; the agent lands | the cell | none | `review`, `land` | verdict; landing; `main` moves | R-OBL, R-LAND-7, R-PUB-1 [Source] |
| 8. A maintainer's key is compromised | the cell | none | `revoke` as `compromised` | the roster receipt lists invalidated evidence | R-REV-3 [Source]. One room, one act. Section 5 asks what this costs across a million rooms |

Finding: W1 needs nothing from this note. Every step is a rule that
exists or a request on the board. The one collection it already contains,
one checker deployment for every room, obeys C-1 and C-2 today: the room
records the checker's name and digest. The checker does submit a signed
check into the cell; it is judged by the cell's own admission rather than
being a privileged control command. Git push is a different operation.
Production runtime C3, job authority `f12cef6b` / Stage 4 and delivery
007/008 remain owed; the old local spike does not close them.
[Source, Judgement]

### W2. Artroom's own development, self-hosted

Several repositories (the platform, the jam, later the docs), one
maintainers group, one checker deployment, one planner. This is a firm
with a column of its own rooms and no customers.

| Step | Room | Control Room | Mechanism | Cell records | Rule or gap |
|---|---|---|---|---|---|
| 1. Found the platform room and the jam room | each cell | none today | as W1.1 | genesis each | R-GEN-10 [Source]. The two rooms share nothing but the deployment |
| 2. The same maintainers in both | each cell | **the firm**: a maintainers Room would hold the roster once | today: invite into each room separately | two independent rosters | **G2a**: there is no way to say "the members of that Room" in this one. Under C-1 the answer is a signed roster snapshot carried in and pinned, not a live reference |
| 3. The same policy pack in both | each cell | **the catalogue**: `packages/policy` published as a pack | today: the compiled file is committed in each repository | the digest in each `policy-activated` | R-POL-9 [Source]. This is already import by digest. What is missing is the pack's origin: which catalogue, which version |
| 4. The jam needs a rule the pack lacks | the jam cell | the catalogue | the jam proposes its own policy change; a platform gap is addressed through its platform owner | the jam's activated pack and declared bindings | C-3 [Judgement]. The older jam note's fixed vocabulary (`notes/2026-10-01-jam-room.md`) is dated; Hugh allows the acts vocabulary to change during self-hosting. Jam starts when builder judges its first task enabled, not when the complete platform backlog is finished |
| 5. The pack is upgraded in the catalogue | the catalogue | none | an ordinary landing there | nothing in any cell | C-2. No cell changes |
| 6. Each room takes the upgrade | each cell | the catalogue | a proposal that bumps the digest; an agent may author it | `policy-activated` with the new digest | C-3, R-POL-9 [Source]. Review is per room, per the room's own policy |
| 7. The planner wants one board across rooms | none; a read | **a grouping**: "rooms of this project" | a query over the registry and the published logs | nothing | C-4, C-5 [Judgement]. The gitseq workroom does this today for one repository; Artroom's status across rooms needs the registry index, G1 |

Finding: Artroom's own development is the smallest real collection and
already wants all three control Rooms. The firm (step 2) is the gap that
hurts first. [Judgement]
This is a collection-design use case, not a requirement that firm
authority be complete before the first Jam task. Full docs proceed beside
Jam after builder-positive readiness. [Source: current user direction]

### W3. The jam room

An application in its own repository, depending on Artroom only through
published packages and a deployed room (`notes/2026-10-01-jam-room.md`,
revision 3). [Source]

| Step | Room | Control Room | Mechanism | Cell records | Rule or gap |
|---|---|---|---|---|---|
| 1. Found a jam room from the jam pack | the cell | the catalogue: the jam's own pack | import by digest at founding | `policy-activated` | as W1.1 |
| 2. Agent musicians join; the human joins | the cell | none, or each musician's own Room if they have one | invitations; or a delegation from a member to each agent key | joins; delegations | R-GEN-6, R-ADM-5 [Source] |
| 3. Commitments: parts, solo, key, tempo | the cell | none | ordinary locally admitted acts under the jam's declared vocabulary and bindings | each act and its authoritative outcome | the jam note's commitment rule is dated [Source]; the exact future vocabulary may evolve under the declared-act design [Judgement] |
| 4. Playing travels in a live layer | outside the cell | none | never authoritative | nothing | C-5 applies to the live layer exactly as to reporting [Judgement] |
| 5. A second jam room, same musicians | a second cell | **the firm**: the band | today, re-invite | an independent roster | **G2a** again |
| 6. The jam pack gains a feature | the catalogue | none | a landing there | nothing in any jam | C-2 |
| 7. A running jam takes it mid-session | the cell | the catalogue | a proposal; takes effect at the next bar boundary after activation | `policy-activated` | C-3; the jam's timing rule [Source]. dap's T5 question, structure arriving mid-stream, has this answer in Artroom: at an exact log position, by the cell's own act |

Finding: the planned jam illustrates that the live layer and the reporting
layer both carry copies without authority. It is not evidence that the
future application has no platform gaps. The old note and this collection
story do not freeze its vocabulary or impose a new self-host readiness
gate. [Judgement]

### W4. A bounded property claim (dap)

The homeowner, the insurer's adjuster firm, a contractor firm, a rental
car company that stays outside. The dap direction note's participation
ladder, rungs 0 to 3 (§4). [Source] The engagement cell is "this claim,
this homeowner, this insurer". The contractor's work is a second cell,
"this repair, this homeowner, this contractor". The homeowner's
perspective spans both and the rental, which has no cell at all.

| Step | Room | Control Room | Mechanism | Cell records | Rule or gap |
|---|---|---|---|---|---|
| 1. Rung 0: the homeowner starts alone | the homeowner's own Room | none | found it with the personal pack; keep inventories, photos, questions | genesis; notes | R-GEN-10 [Source]. This Room is the customer's identity Room and their account. No other party is needed, which is dap's entry condition |
| 2. Rung 1: one exchange by email with the adjuster | the homeowner's Room | none | the homeowner signs a capture note, or their agent signs with its own explicitly delegated key | capture content and provenance, attributed grantor and performer | dap's three kinds of record, §5 [Source]; `note` [Source]. The adjuster signed nothing; captured source attribution is not a signature by the adjuster, and the agent needs no custody of the homeowner's private key |
| 3. The insurer opens the claim cell | the claim cell | **the firm** (the insurer) founds it from **the catalogue** (the claims pack); the deployment holds the onboarding grant | founding with coordinates: customer = homeowner, service = property claim, firm = insurer | genesis with coordinates; `policy-activated` with the pack digest | R-GEN-10, R-GEN-12 [Source]; **G1**: genesis has no coordinate fields today |
| 4. The firm's representative gains authority | the claim cell | the firm | proposed G2 firm principal is admitted/pinned locally, then supplies a scoped mandate for its agent | principal pin and mandate authority | R-ADM-3(b) [Source] currently needs an active member grantor; R-GEN-7 teams hold no key. Firm principal/mandate semantics remain G2, owned by `d50ce26d`; the agent need not itself join |
| 5. Rung 2: the homeowner is invited | the claim cell | the homeowner's own Room (identity context) | the homeowner's own browser key redeems an invitation with no delegation; the now-active homeowner may separately delegate non-roster task kinds to the agent key | join, then an explicit scoped delegation | R-GEN-6, R-ADM-3(c), R-ADM-5 [Source]. Join and delegation are distinct admissions; the agent does not redeem the join under a delegation |
| 6. The homeowner's agent proposes the inventory | the claim cell | none | `claim`, `propose` under that explicit delegation and its current kind/lane bounds | acts attributed to grantor member, limited by delegation, with performer key | R-ADM-3(b) [Source]. The agent need not join and cannot use this delegation for roster authority. Rung 2 is one contribution; repeated collaboration is rung 3 |
| 7. A fraud model is a required check | the claim cell | the catalogue (the check is in the pack); the deployment (the service) | a check job over a service binding | the `check` | R-EXEC-8 [Source]; `f12cef6b` for the checker's per-job authority |
| 8. The adjuster decides; the pack requires two reviews for a denial | the claim cell | the catalogue | `review` by two firm members or their agents | verdicts | R-OBL [Source]. The rule is in the pack and visible to the homeowner, which is the comprehension rule in dap §2 |
| 9. The adjuster goes on leave; a colleague takes over | the claim cell | the firm | today: release/re-claim moves the lease and revokes its token; G2b proposes a locally authorized firm handover preserving the undertaking and logical lane | handover authority, fresh lease/workspace epoch, retained history and explicit replacement access | R-LANE-8, R-LANE-7 [Source]; **G2b** keeps undertaking/history, not the former person's tokens, callbacks or controls. Saved-work access and unresolved duties follow 005/C1/C3 |
| 10. The contractor firm is engaged | a second cell: the repair | the contractor firm founds it from its own pack; the homeowner is invited | as steps 3 to 5 | its own genesis and roster | Two cells, two firms, one customer. No cell knows of the other |
| 11. The insurer needs the estimate from the repair cell | the claim cell | none | the homeowner's agent has authorized source read/export and local contribution authority, by direct membership or a valid scoped grant, then carries the estimate with its digest/source act ID | source-authorized carried object and local act | C-1/G5 [Judgement]. The claim cell never reads the repair cell; the performer need not join both. Provenance does not itself grant source export permission or destination authority. DAP's T6 supplies a bounded admission fixture, not full source verification |
| 12. The rental company stays outside | no cell | none | the homeowner's Room holds captures of its emails | notes | as step 2 |
| 13. The homeowner's screen shows all three | none; a read | **a grouping**: "cells where customer = me", plus the homeowner's own Room | a query over the registry index and the homeowner's own log | nothing | C-4, C-5. dap's anchor, which the dap spike reports as implemented nowhere (dap, `notes/2026-09-15-sale-as-experienced.md`), is this query |
| 14. The claim closes | the claim cell | the catalogue (the proposed pack's lifecycle rule) | an ordinary final contribution/landing followed by the pack's declared closure state | authoritative final outcome and retained history | R-LAND [Source] supplies landing, not a complete claim-closure pack. G6/N2 must define remaining duties; hosted processes and private payloads follow C1/C3 retention/cleanup, separately from retained public history |
| 15. A year later the homeowner changes insurers | a new claim cell, a different firm | the new firm; the homeowner's Room | the homeowner's agent carries what the homeowner chooses from the old cell and from their own Room | carried objects, each with provenance | C-1, G5. The old cell is untouched; the homeowner retains their copies |

Findings. The claim is the case the whole design was derived from, so it
is no surprise that it is useful as a design check. It exposes G1, G2
and G5; their implementation cost is not established. Step 11 keeps two
independently governed engagements distinct while carrying attributed
evidence. A second firm may also contribute under its own scoped authority
inside a cell, as W6 shows. Shared decisions still need one authoritative
ordered record; attribution and copies alone cannot create agreement.
[Judgement, Untested]

**Handover boundary.** Preserve the firm's undertaking, lane generation,
history and authorized saved bytes. Historical verdicts remain recorded;
whether they still count follows current policy and compromise rules.
The new representative gets only explicitly granted current access. Fence
the old epoch, stop its new writes/renewals, quarantine late callbacks and
settle its unknown external-effect duties before allowing conflicting new
work. Prepared commits are reconciled by immutable OID and guarded fork
readback, not blindly repeated. [Judgement]

Adopted 005 initially has no in-place hosted owner transfer. A holder change
starts a fresh environment; uncommitted handover needs authorized export
and restore. G2b must either fit that model while retaining the logical
undertaking or obtain a separately reviewed firm-owned execution model.
This note does not grant that model, preserve a live process implicitly or
create a duplicate implementation lane. `d50ce26d` coordinates with C1/C3.
[Source: 005 direction; Judgement]

### W5. A care episode (dap)

No advocate. The patient controls their own space, retained copies,
delegation, sharing and continuity across providers, and cannot control
records held elsewhere (dap §6). [Source]

| Step | Room | Control Room | Mechanism | Cell records | Rule or gap |
|---|---|---|---|---|---|
| 1. The patient prepares for one encounter | the patient's own Room | none | found with the personal pack; questions, history, a medication list | notes; files on main | as W4.1 |
| 2. The patient delegates to a family member | the patient's Room | none | `delegate` to the family member's key for note/proposal equivalents and any explicitly required lane-claim step; exclude land and roster authority | the exact scoped delegation | R-ADM-5 [Source]. The family member need not join; a proposal requiring a held lane cannot bypass its claim/lease prerequisites |
| 3. The provider stays outside | no cell | none | captures of the portal's records as notes | captured bytes with claimed source/time and actual capturing actor | dap §5 [Source]. Assertion, capture and confirmation are separate personal-pack record types still to be defined; note attribution/content alone does not establish that distinction. The provider supplied no Artroom signature here |
| 4. A provider that does adopt opens a care cell | the care cell | the provider firm; the care pack | as W4.3 | genesis with coordinates | G1 |
| 5. The medication list lives in the care cell; the patient's Room keeps a copy | both | none | the patient's agent carries each landed change into the patient's Room as a note with provenance | the carried copy | C-1, G5. The patient's retained copy is a copy, and says so |
| 6. The patient's agent proposes a correction | the care cell | the patient's Room (identity) | `propose`; the pack requires a prescriber review | the proposal; the verdict | R-OBL [Source] |
| 7. A second provider, a second cell | a second care cell | the second firm | as step 4 | its own genesis | two columns in one row |
| 8. The patient wants one timeline | none; a read | the grouping "customer = me" | the registry index and the patient's own log | nothing | C-4, C-5. The continuity across providers that dap §6 asks for is this read plus the carried copies in the patient's Room |
| 9. The patient revokes the family member | the patient's Room | none | `undelegate` | the roster op | R-ADM-4 [Source]. One Room, instant. Nothing to push |
| 10. The patient revokes the family member from the care cells too | each care cell where the family member was delegated | none today | one `undelegate` per cell, by the patient's key | each roster op | R-ADM-4 [Source]. Two cells, two acts; fine. A firm with a million cells is section 5 |
| 11. A confirmation is cancelled, corrected or retracted | the patient's own Room; a care cell only for an ordinary authorized contribution | none | retain the original capture/signature; append the changed source or attributed interpretation | separate immutable evidence and current standing, with reason and source/time | Personal-pack judgement; authentic old evidence is not labelled as the current arrangement. REQ-15–17 |
| 12. Sources conflict, or nobody supplies a needed next step | the patient's own Room; the shared decision cell for any actual shared act | none | personal query may describe the patient's selected evidence; a shared decision follows only the cell's locally available authoritative inputs | uncertainty, usable next action when available, and needs met/unmet/human-supplied | DAP direction §5/6 [Source]; personal evidence is not a hidden guard authorizing a shared decision. N2's complete addressed-work/lifecycle remains separately owed |

Findings. The care episode is the purpose test (dap §6), with the claim's
composition gaps and a distinct personal standing need. Artroom's `note`
permits attributed content, but does not by itself classify it as an
assertion, capture or confirmation. The personal pack must state that
three-way distinction and its standing rules; a reader should not infer
them from prose or actor alone. That is a pack matter, not a claim that
the complete personal-account experience is built.
Captured bytes retain their claimed source/time unchanged; extraction and
interpretation are separately attributed. Cancellation, correction,
retraction and conflicting sources change displayed standing without
erasing provenance. The person should see what is reliable now, what is
uncertain, and a usable next step or an explicit unmet need. Symmetric keys
alone do not establish that result. Keep shared decision guards separate
from a person's private query. N2 retains the full addressed-work,
cancellation, correction and handover outcomes. [Source, Judgement, Untested]

### W6. A renovation (dap)

A general contractor already coordinates. dap's moments are where the
owner's interests cross that arrangement: disputed scope, independent
advice, changing contractors, carrying the history forward (dap §6).
[Source]

| Step | Room | Control Room | Mechanism | Cell records | Rule or gap |
|---|---|---|---|---|---|
| 1. The contractor opens the renovation cell | the cell | the contractor firm; the renovation pack | as W4.3 | genesis with coordinates | G1 |
| 2. Scope is the file; changes are proposals | the cell | the pack | `propose`; the pack requires owner review for scope paths | each generation; verdicts | R-OBL, owners by path [Source]. "Owners" here is literal |
| 3. The owner wants independent advice | the cell | a third firm: an inspector | an authorized cell member invites the inspector's human/principal key, then a separate scoped delegation/mandate authorizes its agent for review/note equivalents | join or G2 principal pin; independent firm mandate and performer | R-GEN-6, R-ADM-3(c)/(b), R-ADM-5 [Source]; G2 for firm authority. No delegated roster join; the inspector agent need not join |
| 4. Disputed scope: the owner objects | the cell | none | `review` with `object` | the verdict | R-POL-7's `objection-open` land rule [Source]. A dispute is a recorded state, not an argument |
| 5. The owner changes contractors | the cell, and a new cell | the new firm | the old cell's lane is released; the new firm founds a new cell; the owner carries the history | release; new genesis; carried objects | R-LANE-8 [Source], C-1, G5. **Not** a transfer of the cell: the old firm's cell stays the old firm's, and its log stays whole. The owner's perspective shows both |
| 6. The old contractor's representative is removed | the old cell | the old firm | the firm revokes its representative's delegation | the roster op | R-ADM-4 [Source]. One cell |
| 7. The history is carried forward afterwards | the owner's Room | none | copies with provenance | notes | G5 |

Findings. "Changing contractors" is the step that tempts a transfer of
the Room, and the design says no: a Room is one engagement with one firm,
and the owner's continuity is in their own Room and in the grouping, not
in moving a log between firms. The protocol already says a registry
binding never moves (R-GEN-13; open point 37). [Source, Judgement]

### W7. The sale (dap)

Alice sells a guitar. Bob and Carol bid without seeing each other's
prices. Ivan inspects. Dana joins after the sale. The cited DAP model
allows selected public decision records but refuses Alice's attempted
disclosure of private prices, counters and inspection-request data to
Dana (dap, `notes/2026-09-15-sale-as-experienced.md`). [Source]

| Step | Room | Control Room | Mechanism | Cell records | Rule or gap |
|---|---|---|---|---|---|
| 1. Alice founds the sale | a cell: "this guitar, Alice, no firm" | the catalogue: a sale pack | as W1.1 | genesis | A personal cell with no firm. Coordinates allow a null firm |
| 2. Bob and Carol join | the cell | their own Rooms | invitations | joins | R-GEN-6 [Source] |
| 3. Bob bids; Carol must not see it | the cell | none | a `propose` by Bob | the act, visible to every member | **G7**: a Room's log is visible to its whole roster. Artroom has no per-audience visibility inside one Room. dap's one-series-many-views property is exactly this, and Artroom does not provide it |
| 3'. The multi-Room shape | one private cell per bidder, plus one authoritative decision Room for this sale | none | bid terms stay in private cells; eligible public offer stubs are explicitly carried/registered in the decision Room; that Room orders acceptance once | private bids locally; one sealed authoritative winner in the decision Room; copied decision with retained source witness in each bidder cell | C-1, G5, G7 [Judgement]. A bidder cell does not independently choose a winner. Signing similar copies into two cells does not create uniqueness |
| 4. Ivan inspects | an authorized private cell, or both | none | local review/note equivalent; a report is carried only to its source-permitted audience | attributed report/verdict and any authorized copy | R-OBL [Source]. Reaching both bidders requires source export permission and local admission; Dana receives no forbidden inspection-request content |
| 5. Dana joins after the sale | a separate authorized public-summary cell/read surface | none | only the source-approved listing, public stubs and decision are copied; private price/counter/inspection-request fields are refused | permitted copied facts and exact source provenance; refusal/withheld status for forbidden fields | C-1, G5, G7. Alice's carrier authority does not bypass source export policy. This is a proposed disclosure boundary, not DAP's per-audience view filter |
| 6. Two accepts race | the single decision Room | none | order both intents under a pack guard that only an undecided sale can decide | one winner; the competing attempt is refused or a recorded ineffective outcome if the declared application explicitly supports it | DAP's source example orders o3 first and makes o2 ineffective; this alternative must specify its own recorded/refused outcome seam |
| 7. A decision copy is repeated, conflicts or arrives late | each private bidder cell | none | compare sale/decision-Room identity, source act, digest and locally retained verification witness | same source decision deduplicated; different winner/source rejected; absent/delayed/refused carry remains pending rather than selecting another winner | C-1, G5. No cross-Room admission read; no source witness means no claim that the authoritative decision has been received |

Findings. The sale is the case Artroom does not fit directly, and the
note should say so rather than bend it. Per-audience visibility inside one
log is a dap foundation property and not an Artroom one. The proposed
multi-Room shape can preserve a unique decision only by keeping it in one
authoritative ordered record and treating every other record as a copy.
The public decision identity includes the sale ID, decision Room genesis,
decision act and content digest. The cell's own policy names that source
and the supported verification basis; the full bounded witness is retained
locally before a copy is treated as authoritative source evidence. It
confers no membership or delegated authority. Verification failure,
conflicting copy or an unavailable witness cannot choose another winner.
The encoding and source-witness support remain G5/G7 design work.
[Judgement, Untested]

The DAP source also forbids disclosures to Dana that Alice wanted to make.
One separate Room per private relationship prevents other bidders reading
that Room, but does not by itself prevent an authorized reader copying its
bytes. Proposed source-side export rules can enforce product exports of
private prices/counters/inspection data; they do not recreate DAP's single
series, hidden-position replay, per-audience projection or retroactive
disclosure semantics. No claim that all its privacy/agreement properties
are reproduced follows from provenance. G7 remains undecided. [Source,
Judgement, Untested]

The alternative costs one cell per private relationship, one explicit
decision Room and carries for shared facts. Whether that cost is
acceptable, or whether Artroom should ever gain partial visibility, is a
question this note does not decide (section 7). [Judgement]

### W8. A representative's key is compromised across a firm's collection

The case that motivates section 5. A home-services firm with 100,000 open
engagements. One representative agent's key, or worse the firm's signing
key, is compromised at 09:00.

| Step | Room | Control Room | Mechanism | Cell records | Rule or gap |
|---|---|---|---|---|---|
| 1. The firm learns of the compromise | the firm's Room | none | a `revoke` as `compromised` in the firm's Room | the firm's roster receipt | R-REV-3 [Source], in one Room |
| 2. Every cell must stop admitting affected authority | the firm's affected cell scopes, including idle cells if an affected key attempts admission | the firm | **G3** fast-stop input covers delegated, mandated and authorized direct firm-principal routes, with exact issuer/target/scope checks | the retained fresh complete revocation witness on admission; no work for an idle untouched cell | C-6; existing per-cell revocation is the ordinary fallback, not the one-minute scale mechanism |
| 3. Cells with affected past activity/evidence must apply compromise effects | cells with admitted activity, relevant evidence or live reserved operations under that authority | the firm | an actual-activity index identifies recipients; cell-local sealing applies R-REV-3/5 | first effective revocation plus invalidated evidence/abort duty as applicable | Assignments/mandates alone do not prove activity. A complete acknowledged activity feed or explicit discovery/pending state is required; see section 5. R-REV-3 [Source]; the activity index and feed are proposed [Judgement, Untested] |
| 4. Cells with a reserved landing resting on that key | the few such cells | the firm | the emergency rule | `abort-attempt` | R-REV-5 [Source]. These are the cells where minutes matter |
| 5. Idle cells that the key never touched | most of the 100,000 | none | nothing need happen until the key next tries to act there | nothing | [Judgement]. A push that wakes them is pure cost |
| 6. The audit question afterwards: "where did that key act after 09:00?" | none; an authorized bounded read | the grouping "cells of this firm" | actual published logs/receipts and the acknowledged activity frontier, not just assignment lists | read result with known prefix and any pending discovery/propagation limits | C-5. Each applicable receipt records authority plus the immutable revocation state/proof and its freshness basis |

Findings. Step 2 is the requirement that breaks the per-cell proposal
mechanism: affected authority must stop being admitted in every
applicable cell within the proposed one minute of the deployment service
accepting the authorized revocation, without a member of each cell
signing anything. Submission by the firm and acceptance by that service
are distinct. The one-minute bound is unmeasured. Step 5 is the
requirement that breaks a naive push: most cells should pay nothing.
Step 3 is why a push is still needed for some cells: evidence
invalidation is a change to the cell's state that only the cell can
seal. [Judgement, Untested]

### W9. A pack upgrade across the collection

The claims pack gains a rule: a denial now needs a third review when the
amount exceeds a threshold.

| Step | Room | Control Room | Mechanism | Cell records | Rule or gap |
|---|---|---|---|---|---|
| 1. The catalogue lands the new pack version | the catalogue | none | an ordinary landing under the catalogue's policy | nothing in any cell | C-2 |
| 2. Each open claim cell is offered the upgrade | catalogue observation outside admission, then each cell | the catalogue | an authorized runtime subscriber reads catalogue publication, checkpoints/deduplicates that input and prepares a local digest-bump proposal under each cell's current authority | locally admitted proposal and its catalogue provenance | C-3; C3 and approved 007/008 own durable input delivery. An ordinary cell `notify` rule matches locally available events; it does not read another Room at admission. The agent need not be a direct member if a valid local delegation/mandate applies. This external-source bridge remains unbuilt [Source: approved 007/008; Untested] |
| 3. The cell lands it under its own policy | each cell | none | the pack's own rule for policy changes applies, which may be admin approval | `policy-activated` with the new digest | R-POL-9, R-ADMIN [Source]. Open proposals are recomputed |
| 4. A cell declines or lags | that cell | none | nothing | nothing | A cell on an old pack is a fact the grouping can report, not a fault the catalogue can correct |
| 5. The regulator asks which claims were decided under which pack | none; a read | a grouping | the `policy-activated` digests in each log | nothing | C-5. The digest in the log is the answer |

Findings. Upgrade is slow by design and that is correct, because it is the
mechanism by which the cell's own policy governs the cell. The one piece
of machinery it needs is the firm's runtime learning that the catalogue
changed, through its own authorized source read and durable input bridge.
Every resulting cell act is judged locally with current authority. Wake,
notice acknowledgement or source observation does not grant cell access,
complete an addressed upgrade task or change that cell's policy. Keep
007/008 cursor/visibility/fencing and N2 action-result lifecycle boundaries.
[Judgement, Untested]

### W10. Reporting: an SLA breach rolls up, and a regrouping

| Step | Room | Control Room | Mechanism | Cell records | Rule or gap |
|---|---|---|---|---|---|
| 1. The pack defines an SLA: a proposal must be reviewed within two days | the cell | the catalogue | a reviewed rule/deadline and explicit source export profile naming allowed inputs, fields, audience and retention | attention item and export-policy version; **G4** sealed KPI fact | R-API-8 attention [Source]; deadline/schedule/export contract remains proposed. A private-data expression is not authorized merely by being a KPI |
| 2. The breach is a fact | the cell | none | seal only an output permitted for every reader of the source log; a private output needs an explicitly designed authorized private representation | eligible public fact with room ID, act ID and pack/export-profile digest | G4/G7. No per-audience public-log hiding is assumed |
| 3. Facts stream out | source-authorized read/export, then outside the cell | none | a bounded post-commit exporter sends only approved fields under the source's audience/retention profile | source export identity, field profile, destination/audience, fact digest and expiry | C-5; future K2 request `da2737b2` is not shipped infrastructure or a permission grant |
| 4. The roll-up by service line | outside | a grouping Room | authenticated bounded query joining eligible facts to the grouping head | query result limited by both grouping access and source export/read scope | C-4, C-5. Aggregate-only authorization may omit cell/act identifiers; membership in the grouping alone does not release facts |
| 5. Finance regroups customers into new segments | the grouping Room | none | a proposal that lands there | nothing in any cell | C-2. The roll-up for last quarter can be run at last quarter's grouping head, so the regrouping is retroactive and dated |
| 6. A manager drills from a number to a cell | none; current authorized reads | grouping plus source-cell export permission and cell raw-read authority | expose identifiers only if permitted by the source profile; call the cell's trusted read API with the viewer's current credential | authorized result or explicit unavailable/refused drill-in | C-5. A source may authorize a coarse aggregate for a reader lacking raw cell access; that does not authorize detail or further export. 005/C1 raw-read boundaries remain |
| 7. A private field is requested, or access/retention changes | source cell policy, exporter and facts store | grouping contributes no extra source permission | reject an expression depending on unauthorized source inputs; stop new export/read under changed authority, enforce expiry and record the policy version of existing copies | explicit refusal, eligible retained copies and expiry/access status | G4. Previously authorized readers cannot be made to unread bytes; local storage deletion/read denial and external recipient retention are distinct |

Findings. G4 must include export permission and private-read boundaries,
not just a new fact event. The source cell chooses a versioned projection
of allowed inputs and approved output fields; arbitrary expressions over
private content are excluded unless that source explicitly authorizes the
particular disclosure. Type/size restrictions alone do not prevent a
Boolean KPI encoding a private fact. An example approved SLA profile can
export a breach flag and period bucket; room/act IDs, customer identifiers
and metadata each require their own audience permission. The exporter and
facts store enforce that profile on write, query, onward export and expiry.
[Judgement]

The source Room log is roster-visible at this baseline. Do not put a
private derived value there and rely on a narrower export audience to hide
it. A field eligible for public sealing must be permitted for every source
reader. Supporting a privately released derived value needs an explicit
private representation/read contract under G4/G7; it is unresolved here.
Opaque references must also meet metadata/existence privacy constraints.
[Source, Judgement]

Record who may read each released field, whether a permission is a retained
release or requires continuing source authority, its retention/expiry and
the effect of later access changes. A grouping reader without cell access
gets only facts explicitly released to that audience; raw drill-in still
needs current C1 authority. Stop later export when its permission ends.
Denied current access does not erase knowledge or copies already lawfully
received. Registry coordinate queries likewise require field/audience
permission, bounded pages and limits on sensitive identifiers/counts;
opaque coordinates are preferred until their disclosure is decided. G1's
index is not a public enumeration grant. Facts-store technology remains an
open choice. [Judgement, Untested]

### The gaps

| Gap | What | Owner |
|---|---|---|
| G1 | Genesis has no coordinate fields; the registry has no index by them | this note, section 6 |
| G2 | How a firm is a keyholding principal in a cell; what a mandate is | request `d50ce26d` |
| G2a | A roster shared by several cells, as a signed snapshot carried in | `d50ce26d` |
| G2b | Firm undertaking/logical lane/history and authorized saved work survive a replacement, with fresh execution authority and fenced epochs | `d50ce26d`, coordinating existing C1/C3 |
| G3 | Revocation across a collection, fast, without a member of each cell signing | section 5 |
| G4 | Sealed KPI facts, source-authorized inputs/fields/audience, export/read/retention and access-change semantics | section 6 |
| G5 | Standard carried provenance, immutable capture/interpretation distinction and current standing; qualified decision-source witnesses where needed | section 6 |
| G6 | A pack's origin recorded with its digest: which catalogue, which version | section 6, with `a13a0bf5` |
| G7 | Per-audience visibility inside one Room; the sale | not decided, section 7 |

## 5. Revocation

### What the walk-throughs require

From W8, W5.10, W4.9 and W1.8:

- **Timeliness.** Affected authority must stop being admitted in every
  applicable cell within one minute of the deployment service accepting
  the authorized revocation, measured at admission. This is a proposed
  acceptance bound, not a measured result. Submission by the firm and
  acceptance by that service are separately visible. (W8.2; REQ-25)
- **Scale.** The cost must not be proportional to the size of the
  collection when most cells are idle. (W8.5)
- **No signer per cell.** A member of each cell must not have to sign
  anything. The firm's own act must suffice. (W8.2)
- **Replayable.** A cell's log must still say, for every admitted act,
  what the cell relied on, so a replay reaches the same verdict. (C-1)
- **Audit.** Each affected cell must seal an applicable positive
  revocation and apply the R-REV effects, so "where did it act after
  09:00" has an answer in the logs. Until an authoritative cell result
  exists, delivery is shown as pending or unsealed. Central acceptance,
  targeted delivery or a missing acknowledgement does not prove that
  every cell has sealed. (W8.3, W8.6)
- **Remove only.** The mechanism can only take authority away. It can
  never grant, and so can never become a control plane. (C-6)
- **The ordinary case stays ordinary.** Revoking a family member from two
  cells by two acts (W5.10) must keep working with no new machinery.

### Four mechanisms against them

| Mechanism | Timeliness | Scale | No signer per cell | Replayable | Audit | Remove only |
|---|---|---|---|---|---|---|
| **A. A proposal or roster act per cell** (existing route) | no collection-wide one-minute bound | wakes each addressed cell; fails W8.5 if broadcast | requires ordinary local authority | yes | yes | yes |
| **B. Fan-out push:** deliver the firm's authorized signed revocation object to every cell; each seals it locally | eventual; delivery alone proves no one-minute bound | broadcast wakes idle untouched cells; fails W8.5 | no additional signature by a cell member | yes, with retained authority/object | yes for delivered applicable cells | only with issuer/target/scope checks |
| **C. Short-lived mandates:** the representative presents an unexpired mandate; the firm stops issuing | stale authority is bounded by the remaining lifetime | idle cells need no work | no additional cell-member signature | mandate and judged time are retained | expiry alone does not apply compromise effects | removes the mandate's authority; not every direct-key route |
| **D. Deployment revocation state:** consult a fresh complete authorized state proof for every firm-linked admission route | proposed maximum one minute; unmeasured | bounded admission proof; idle untouched cells need no push | no additional cell-member signature | retain the state/proof, authority and freshness basis; a version label alone fails | seal applicable positive revocation and apply its effects | only with the pinned issuer/recovery and exact scope checks below |

**Judgement: C and D together, with B targeted.**

- **D is the fast stop.** It is the one proposed new deployment fact a
  cell may consult under C-1. It is infrastructure, not a control Room.
  A successful admission retains a bounded proof that the applicable
  complete authorized state did not revoke the authority used. A refused
  route cannot be bypassed by presenting that same firm's affected key
  as a direct principal. [Judgement, Untested]
- **C bounds stale mandate authority.** It does not bound a fail-closed
  outage. If fresh D evidence remains unavailable, an affected route may
  remain unavailable indefinitely, including after its mandate expires.
  There is no implicit expiry-only fallback. Unrelated direct human
  member routes keep their ordinary local authority. Applicable direct
  firm-principal routes remain subject to D. [Judgement]
- **B, targeted, applies compromise effects to actual affected cells.**
  Assignment and mandate issuance help discover candidates; they do not
  prove activity. An acknowledged actual-activity feed covers admitted
  authority, retained evidence and reserved operations. Only an affected
  recipient is woken to seal the revocation and apply R-REV-3/5. Missing
  feed coverage is disclosed as discovery pending; it cannot establish
  a complete audit or the no-untouched-cell-work claim. [Judgement, Untested]
- **A stays as it is** for the ordinary case. [Source]

### D: retained proof, current authority and freshness

The proposed state has an immutable checkpoint identified by deployment,
issuer namespace, recovery epoch, increasing sequence, complete-state
digest, issue time and expiry. A configured deployment signer attests
that it includes every authorized revocation accepted before that issue
time. That completeness service is an explicit new trust assumption;
a firm signature on one object alone cannot attest an absent revocation.
The receipt retains the checkpoint, its authenticated state proof, the
applicable local authority/pin identities and the admission clock witness.
It records successful non-revocation as well as encountered revocation.
Replay needs no current deployment service or mutable state lookup.
[Judgement, Untested]

The encoding must permit a bounded proof of membership or non-membership
in that complete state. A missing object, empty response, unknown version,
partial page or bare list-version label is not a successful proof. Before
adoption, the spike must fix and check the encoding's limits on bytes,
depth, entries, signature work and retained receipt size. If those limits
cannot be met, refuse that proof or revise this design explicitly; do not
silently substitute a partial list. No encoding is implemented here.
[Judgement, Untested]

The cell verifies **both** authenticity and removal authority. Its own
retained pin binds the issuer/recovery epoch to a specific firm principal,
target key or subordinate-key chain, permitted removal type and applicable
cell scope. Firm A cannot revoke firm B, a customer or an unrelated member,
even with a valid A signature. All firm-linked admission routes, including
delegation, mandate and direct principal routes, use that same applicable
state. A subordinate key may not remove a parent or create a wider removal
right. Compromise of the firm's signing key requires a distinct authorized
recovery/revocation pin; possession of the compromised key alone cannot
invent recovery authority or revoke other principals. The exact pin, key
chain, rotation and recovery encoding remains G2's `d50ce26d` work.
Do not permit a route whose applicable principal cannot be identified.
[Judgement]

A checkpoint expires no later than 60 seconds after issue. Define a
conservative clock-skew allowance and use the retained room clock at the
final admission decision; subtract uncertainty from usable lifetime,
rather than extending the one-minute bound. Future-dated, expired,
wrong-epoch, older-than-known-sequence or conflicting checkpoints fail
closed. Retain a monotone known checkpoint frontier per applicable
namespace; a cache is usable only while its exact proof is still fresh
and covers the same authority/scope. A revocation accepted after issue
can use that older certificate only until its original expiry. A
checkpoint issued after acceptance must include the revocation. [Judgement]

Proof acquisition may await infrastructure, but final admission must
check the same current local role, delegation/mandate, principal pin,
scope and recovery epoch as the proof. If any changes while waiting,
restart with current inputs or refuse; do not seal on stale authority.
An unavailable, incomplete, unverifiable or oversized proof is a named
refusal. Cached evidence is not an outage escape beyond its expiry.
The proposed 60-second rule needs measured clock and propagation bounds;
it is not established by calling a store consistent or naming a provider.
[Judgement, Untested]

Require a versioned local authority/feature boundary that makes D evidence
mandatory for an applicable principal, independently of the first proof
receipt being checked. State the activation seq, pinned trust/encoding
version, supported legacy prefix and migration/recovery behaviour before
adoption. Removing the first proof cannot disable that requirement.
Pre-activation retained history keeps its recorded semantics and disclosed
proof limits; it is not rewritten to invent D evidence. [Judgement]

D judges new authority use. An intact exact signed intent already recorded
settles against its original retained receipt, without repeating its effect
or granting authority for a new act. Replay evaluates the proof actually
retained with the original judgement. This proposal grants no renewed
bearer/read access; the explicit grantor-revoked bearer retry decision and
real-Room witness remain with existing `5d41ea36`. Keep these operations
distinct when specifying admission and endpoint authentication. [Judgement]

### B: actual-activity targeting and honest discovery

Record an activity item from an admitted cell receipt, relevant retained
evidence or reserved operation, with its source identity and exact
firm/key/authority lineage. Check that item before treating its cell as an
affected recipient. Assignment records remain a separate discovery input.
Persist delivery identity, the acknowledged feed frontier and pending
retries so a disconnected watcher does not lose the recipient set.
Indexing/discovery runs outside admission and must not become a foreign
Room lookup there. The revocation object supplies removal authority;
the transport and activity item supply none. [Judgement]

Cover the race where activity is admitted within the valid old checkpoint's
remaining minute: every such item must enter the post-commit activity feed
and, if its authority is now revoked, the targeted removal queue. A cell
validates and seals an applicable removal once; duplicate deliveries
are harmless. R-REV-5 requires the existing abort duty for a relevant
reserved operation, not guaranteed rollback of a remote side effect.
Audit reports state the known admission/log frontier, effective removal
and any unknown delivery/discovery outcomes. Without complete acknowledged
coverage, report pending discovery and which guarantee is unproved.
Broadcasting as a fallback would change REQ-27/33 and needs explicit review.
[Source: R-REV-5; Judgement, Untested]

### Contract changes and evidence still needed

D changes admission for all applicable firm-linked routes, the retained
`Authority` receipt and local checkpoint frontier; it adds a deployment
completeness trust pin and a locally sealed authorized removal entry.
It is more than one optional receipt field. Keep current per-cell R-REV
effects and exact signed settlement distinct from current permission to
make a new act or use a bearer endpoint. C1/C3 and G2 remain the lifecycle
owners; this proposal gives the deployment list no agent control grant.
[Judgement]

**Untested.** No one-minute, million-cell, proof-size, retention or delivery
result is supplied. Measure fresh positive/negative admission proof,
stale/unavailable/rollback refusal, issuer-scope and compromised-root
recovery, untouched versus actually affected cells, delayed-feed races
and honest replay/audit. The storage options named in the 2026-10-02
text of this note (section 10) are options, not current provider claims
or a chosen implementation. REQ-41 requires
bounded evidence before adopting these mechanisms; it adds no Jam gate.

## 6. Requirements

Each is traced to the step that produced it and stated so that a test can
show it holds. "Must" is a proposed requirement; "may" is a permission.
All 41 numbers and their original stories remain. Existing local behaviour
is credited in section 8; collection, mandate, export and deployment-proof
requirements are not adopted or implemented by this note. Section 9 maps
the seven review groups to focused acceptance and existing owners.

**Genesis and the registry (G1)**

- **REQ-1.** A genesis may carry coordinates: `customer`, `service` and
  `firm`, each a member handle or a stable external identifier, and each
  may be absent. Its author must have the declared right to assert each
  coordinate; an identifier does not grant authority. Prefer opaque IDs
  and define visibility/retention for personal or commercially sensitive
  coordinates. (W4.3, W7.1; W10.7)
- **REQ-2.** The registry indexes rooms by each coordinate and answers
  "rooms with this customer", "rooms with this service" and "rooms with
  this firm" without reading any room. Every query is authorized for the
  permitted coordinates/result fields, with bounded pagination and no
  unauthorized existence disclosure. Export/index population follows the
  source permissions; grouping membership grants no cell access. (W2.7,
  W4.13; W10.7)
- **REQ-3.** No Room's log lists the rooms of a collection. (C-4; W2.7)
- **REQ-4.** A founding under an onboarding grant may be restricted by
  the grant to a firm and a set of services, so the firm can found cells
  for its own services and no others. (W4.3)

**Identity (G2, owned by `d50ce26d`; stated here so the two notes agree)**

- **REQ-5.** A cell verifies a mandate against a key pinned in its own
  retained authority, and never by reading the firm's Room. G2 must define
  issuer, firm principal, target key, cell/act scope, expiry, key chain and
  authorized recovery pin; final admission also checks applicable fresh
  revocation proof. A valid signature alone grants nothing. (C-1; W4.4,
  W8.2)
- **REQ-6.** A representative can be replaced under the firm's authority
  without losing the logical undertaking, generation history, carried
  evidence or authorized saved work. G2 must define when replacement on
  the same principal can retain the lane without release. Current holder,
  lease, controller and workspace epoch are separately established; never
  transfer old live credentials, process authority or unknown-command
  permission. A different owner needs the C1-authorized export and fresh
  environment path. Existing evidence is not relabelled as newly valid.
  (W4.9; approved 005, C1–C3)
- **REQ-7.** A receipt for a mandated act names the grantor, the mandate
  and the performer, their exact scopes and the retained authority/proof
  identities used. Attribute the legal principal separately from the
  agent that performed it. (W4.4)
- **REQ-8.** Two firms' representatives in one cell act under two
  independent mandates, and neither can act under or revoke the other's
  authority. A principal's own-key join is R-ADM-3 case c without delegation;
  a valid delegated/mandated performer need not join, and cannot gain
  roster authority through its grant. (W6.3; W4.4–6)
- **REQ-9.** A roster shared by several cells is carried into each as a
  signed snapshot with a digest, and a later snapshot is a roster act in
  each cell under its current local authorization. A snapshot is retained
  source evidence, not automatic present authority in every recipient.
  (W2.2, W3.5)

**Functionality (G6)**

- **REQ-10.** Every `policy-activated` event names the pack's digest and,
  where the pack came from a catalogue, the catalogue's room ID and the
  act ID that published that version. (W2.3, W9.5)
- **REQ-11.** A pack version in a catalogue changes no cell. (C-2; W9.1)
- **REQ-12.** A cell takes a new pack version only by a landing in that
  cell under its current policy. (C-3; W9.3)
- **REQ-13.** A `notify` rule may name a catalogue's publication as the
  motivating event, and its recipient has current appropriate local
  authority. An authorized runtime subscriber observes that foreign
  publication outside admission, with C3/007/008 checkpoints, filtering
  and deduplication, then contributes locally. Ordinary `notify` matches
  local inputs and never reads the catalogue at admission. Delivery or
  acknowledgement does not complete the upgrade task. (W9.2)
  [Untested: the external-source bridge and wake runtime are not landed]
- **REQ-14.** A cell on an older pack version is reported, not corrected.
  (W9.4)

**Carried objects (G5)**

- **REQ-15.** A carried object names its source room ID, source act ID
  and content digest in one standard form, in the act that carries it.
  Retain immutable captured bytes/digest, source/time and the author of
  each later interpretation separately. For confirmations/agreements,
  expose corrections, cancellation, retraction and conflicting sources
  as standing at a stated known frontier; authenticity of the old record
  does not mean it remains the arrangement. (W4.11, W4.15, W5.5, W6.7,
  W7.3'; W5.11–12)
- **REQ-16.** A cell admits a carried object on the carrier's authority
  and the cell's current rules, using retained provenance/export evidence.
  The carrier must have an authorized source copy for its audience and
  use; the cell does not read another Room at admission or inherit its
  authority. Cross-source conflicts are exposed for local judgement, not
  silently flattened into a current fact. (C-1; W4.11, W5.12, W10)
- **REQ-17.** A reader can tell a carried object from an act of the cell
  by the record alone, distinguish immutable evidence from interpreted
  current standing, and see the attributed next step and needs met, unmet
  or supplied by a human. Personal querying reveals what a person can do;
  it does not automatically turn private understanding into a shared
  guard or agent control grant. Full addressed-work outcomes remain N2.
  (W5.3, W5.11–12)

**Reporting (G4)**

- **REQ-18.** A pack may define a KPI as an expression over the cell's
  acts, under the policy evaluator's profile and budget. An export profile
  separately defines eligible source inputs, fields, audience, permitted
  expression/output, onward use and retention. Even a Boolean/count can
  reveal a private input; no eligible expression bypasses that profile.
  (W10.1, W10.7)
- **REQ-19.** The cell seals a KPI fact as a system entry naming the room
  ID, the act ID that produced it, the pack/export-profile digest and
  authorized output/audience. Seal only values permitted for all readers
  of that roster-visible source log. A privately released value needs an
  explicit private representation/read contract before support is claimed;
  private inputs are not made public by calling the output a fact.
  (W10.2, W10.7)
- **REQ-20.** An SLA is an obligation with a deadline, and its breach is
  an attention item in the cell before it is a fact anywhere else.
  (W10.1)
- **REQ-21.** The exporter sends only source-authorized declared fact
  fields, never raw content. Authorization covers identifiers, values,
  private KPI inputs and derived disclosures as well as content bytes.
  Receipt and grouping permission alone are insufficient. (W10.3, W10.7)
- **REQ-22.** A roll-up can be computed at any past head of a grouping
  Room from its retained immutable authorized export prefix, with pack/
  profile/source frontier named. Define whether an export is an explicit
  retained release or requires continuing source permission. Apply current
  access/retention rules to historical queries and onward copies; a past
  head is no permission bypass. (W10.5, W10.7)
- **REQ-23.** A grouping Room's roster decides who may read its aggregate;
  the source export policy also authorizes the aggregate's fields/audience.
  A cell's roster decides direct reads inside the cell. Access change stops
  future unauthorized reads/exports and follows declared retention for
  held copies; previously authorized recipients cannot be made to unread
  bytes they already received. Do not claim raw-reader revocation and
  aggregate revocation have identical effects. (W10.6–7)
- **REQ-24.** Drill-in from a fact reaches the cell through the cell's
  own read API with the viewer's current credential. Raw C1 private reads
  retain direct owner/admin-session provenance; agent delegation or coarse
  reporting permission grants no raw workspace/conversation access.
  (W10.6; approved 005)

**Revocation (G3)**

- **REQ-25.** A firm's revocation of a key stops that key's delegated and
  mandated acts and applicable direct firm-principal routes in every
  affected cell within one minute of deployment-service acceptance,
  measured at final admission. Exact issuer/target/cell scope applies;
  unrelated member routes remain ordinary. (W8.2; section 5) [Untested]
- **REQ-26.** No member of a cell signs anything for REQ-25 to hold.
  (W8.2)
- **REQ-27.** A cell with no affected admitted activity, evidence or live
  reserved operation does no proactive work for REQ-25. A subsequent
  attempted admission checks fresh D proof. Assignment/mandate issuance
  does not make an idle cell an affected recipient. Completeness of the
  activity index must be established, or this guarantee is reported
  unproved with discovery pending. (W8.5; section 5) [Untested]
- **REQ-28.** A receipt for a delegated or mandated act records the
  applicable retained complete-state checkpoint, proof, issuer/recovery
  and scope/pin identities, known sequence frontier and clock/freshness
  basis. The same applies to firm-principal admission. Successful absence
  must be proved; recording only a version is insufficient. (C-1; W8.6)
- **REQ-29.** Replay of the cell's log and its retained checkpoint/proof
  bytes reaches the same judgements without a mutable external lookup.
  Oversized, incomplete, expired, future, wrong-epoch or rollback proof
  is refused; a missing witness does not mean not revoked. Bound decoding,
  verification and retention before adoption. Use an independently recorded
  version/activation boundary, not the first proof, to enable the mandatory
  rule; preserve legacy history/settlement and state its proof limit.
  (C-1; section 5) [Untested]
- **REQ-30.** Positive state carries an authorized signed revocation
  object. The cell verifies its signature and the retained local issuer/
  recovery pin's removal right over that exact target and scope. Firm A
  cannot revoke B or a customer. The firm's own compromised signing key
  requires the distinct G2 recovery route; its signature alone creates no
  such right. Deployment completeness and issuer removal authority are
  both required, with separate trust identities. (W8.2; section 5)
- **REQ-31.** A cell seals a received revocation as a system entry the
  first time it effectively applies that authorized object, retaining
  source/proof/authority and suppressing duplicate effects. It applies
  R-REV-3 and, where owed, R-REV-5, including evidence invalidation and
  recorded abort duty. A remote effect is not thereby rolled back. (W8.3)
- **REQ-32.** The firm's Room records each mandate it issues with the cell
  it was issued for as assignment/discovery evidence. A durable actual-
  activity index separately records admitted authority, relevant evidence
  and reserved operations, with validated source identities and acknowledged
  coverage. Only that activity establishes affected recipients. (W8.3)
- **REQ-33.** A targeted push reaches applicable affected cells and no
  untouched cells, including activity admitted during an old checkpoint's
  remaining valid minute. Persist recipient/discovery/acknowledgement
  frontiers and retries; disclose incomplete coverage rather than claiming
  a complete audit. No transport grants authority. (W8.3, W8.5) [Untested]
- **REQ-34.** A mandate carries an expiry, with the lifetime set by the
  pack within G2's bounds. Expiry bounds remaining mandate authority,
  not D's outage duration, and never replaces a current D proof for an
  applicable route. (section 5, C)
- **REQ-35.** With no fresh complete usable D proof, applicable delegated,
  mandated and direct firm-principal acts are refused with a named reason.
  A retained cache is usable only until its original conservative expiry;
  fail-closed unavailability may last indefinitely. Unrelated direct human
  member authority is unaffected. Final admission rechecks local authority
  after any awaited proof acquisition. (section 5, C/D) [Untested]
- **REQ-36.** Deployment revocation state can only remove authority. No
  entry or proof in it grants anything. (C-6)
- **REQ-37.** A revocation by a member in one cell (R-REV-3) continues to
  work unchanged. (W5.10)

**Visibility (G7)**

- **REQ-38.** The proposed multi-cell sale uses one cell per private bid
  relationship plus one authoritative sale-decision Room. Public opaque
  references and source-authorized exports allow that Room to select one
  winner; bid cells cannot each decide independently. Carried outcomes
  name its retained decision identity and have local effect only through
  ordinary recipient authority. Late/duplicate/conflicting acceptance is
  refused or ineffective there; Dana receives no Alice price, counter or
  inspection content. (W7.3', W7.6–7) [Untested]
- **REQ-39.** The note that decides whether Artroom gains per-audience
  visibility inside a Room cites W7 as its motivating case. (section 7)

**Discipline**

- **REQ-40.** Design review refuses a control relation that injects
  commands or authority outside locally authorized pinned keys/digests,
  authorized carried objects or sealed removals with the section 5 proof.
  Runtime catalogue observation and authorized report queries stay outside
  admission. This note grants no foreign Room the power to mutate a cell,
  govern its lease or read private C1 data. (section 3)
- **REQ-41.** Every unmeasured collection mechanism above gets bounded
  evidence before adoption, including requirements not individually tagged
  [Untested]. Preserve original privacy, one-winner, actual-activity,
  recovery and replay invariants; name admitted prefixes and limits. Use
  focused positive/negative controls, not a per-field test sweep or another
  full gate for prose. These are future evidence obligations, not new
  first-Jam gates or a claim that the 41 requirements are implemented.
  (section 5; section 9)

## 7. What this note does not decide

- **Per-audience visibility inside one Room** (G7). The sale shows Artroom
  does not have it at the recorded baseline. Decide whether to add it or
  use private bid cells plus one decision Room. The latter must still prove
  uniqueness, private-term refusal and a bounded retained decision witness;
  carrying a source act ID alone is insufficient. DAP's example motivates
  these constraints, but is no Artroom acceptance result.
- **The mandate, firm/recovery pins and representative handover** (G2).
  Request `d50ce26d` owns their exact shape, authority chain, actor/owner
  attribution, transition ordering and limits. REQ-5–9/25–36 are constraints,
  not a claim that the firm-principal or recovery protocol exists. Same-
  principal replacement and different-owner replacement must reconcile
  with approved 005 before preserving live workspace control is claimed.
  Whether a team may hold a key also stays with `d50ce26d`; at the
  `bd520fb9` baseline a team holds no key (R-GEN-7).
- **The facts store and export format.** The original R2 Iceberg/R2 SQL,
  Analytics Engine and aggregator Durable Object options remain unchosen
  historical options. REQ-18–24 constrain any implementation. Define source
  export fields, expression eligibility, audiences, retention, access-change
  effects and query limits before choosing technology. Future K2
  `da2737b2` starts after Artroom is built; this note does not commission it.
- **The deployment proof encoding, trust, backing store and measured bounds.**
  Section 5 proposes a complete-state checkpoint with bounded membership/
  absence proof and a 60-second expiry. Its deployment signer, authority/
  recovery pin, monotone epochs/sequences, conservative clock allowance,
  byte/work/retention limits and failure grammar need an exact reviewed
  contract and bounded evidence. A KV or Durable Object name proves none
  of those. If the one-minute target cannot be supported, record that
  counterexample and a proposed change rather than declare compliance.
- **The actual-activity feed's complete frontier and outage recovery.**
  Decide its source acceptance/acknowledgement ordering, delayed activity
  race and pending discovery contract without waking untouched cells.
  Mandate issuance is useful discovery, never an activity substitute.
  A fail-closed outage has no maximum derived from mandate lifetime.
- **Carried evidence and personal-account standing** (G5). Define the
  versioned bounded source witness, source access/release policy, cancellation,
  correction, retraction, conflicting interpretations and human-facing
  standing/next-step projection. Captured source bytes remain immutable.
  Querying for understanding, qualifying a shared act and completing N2
  action work have different authority and outcome predicates.
- **Room succession.** A registry binding never moves (R-GEN-13, open
  point 37). W6.5 shows changing contractors does not need it. A
  firm acquired by another firm might, and is out of scope.
- **Cross-Room obligations.** A portfolio Room that requires evidence from
  cells before it lands. Nothing above requires a foreign Room read at
  admission; an authorized carrier with source access/export permission
  and local contribution authority may suffice. Direct membership in both
  Rooms is not required if valid scoped grants apply.
- **Whether the coordinates should be handles or external identifiers**,
  who may assert that two handles are the same customer, and which audience
  may see/index/query that identity. Registry indexing does not grant cell
  read access or export permission.

## 8. Sources

- The original text of this note, before the 2026-10-04 reconciliation:
  `notes/2026-10-02-collections-of-rooms.md` at
  `5b579511c29fb70e488c7cc4370640154c44f41f` on branch
  `request/collections-note`, 47,931 bytes, 630 lines, SHA256
  `4179cca075e3c9ff2ed83ae7519eea98e23228c71375d7f636f054ea9f65038d`.
  Original `34cf52b3` / `6430ffd4` and accepted full changes
  `e1f72af6` / `5f8b438d` retain the whole planning/integration scope.
- The reviewed clarification this revision reconciles with:
  `plans/012-2026-10-04-collections-clarification.md`, complete Draft 2,
  89,844 UTF-8 bytes, 1,105 lines, SHA256
  `7d621bc99d44d8c0b12aa540dc259a814926f0a31f8f1fd816222c3062883cbd`.
  The file is in the shared checkout and is not on this branch. Its
  primary artifact is `ed154082` at frozen head `2bea2e84`. Checker
  review `2baa8ef7` approved it as planning evidence, ratification
  `f78144e4` made the approval effective, and guidance `b5aab68c`
  directs this reconciliation under request `50d7806a`.
- Historical protocol/type citations use
  `bd520fb926f8161a722c6f1e23ae4aac29e41a66`; current landed main is
  `e6e6782830e0ca8a68f0d11c4d4ece5e4e98c967`. At the latter, R-ADM-3
  case b is delegated admission without joining; case c is own-key join
  without delegation. R-REV governs local compromise and its abort duty.
  A successful Git push is a separate external operation, not a Room act.
- `packages/contract/src/roster.ts` (`Genesis`) and
  `packages/contract/src/transports.ts` (`RoomDraft`) are credited at those
  exact snapshots; collection fields/mandates are proposed extensions.
- The composed declared-acts candidate was read at
  `39430e23dcbae8e40df551dc53855a669250a79d`, with later client/report
  changes at `048c74113b19e56e5e3def0a9e0244209f6015dc` and
  `947fb909dba780fc35df3e22e56cd726d2ec6ba1`. It remains unlanded.
  Stage 2 has new exact-head approval `9cb05da9` at `39430e23`;
  withdrawn `25bede37` remains historical. Whole Stage 3 accounting,
  Stage 5 client/UI and MCP integration retain separate outcomes.
- `notes/2026-10-01-pi-durable.md` at exact main `e6e67828`: a bounded
  local workerd spike. Its setup lists the pinned lane A Room, with its
  policy runtime, landing engine, workspace code and log publisher, and
  the pinned lane E client, over fake Artifacts and the publisher
  sandbox. The Room, client, policy, landing and log logic is real within
  that harness. Listing the Room's workspace code does not make a real
  hosted coding workspace: the prepared fork push was simulated, the
  workspace token path was not exercised, and resumption was driven by
  the caller from retained local resume inputs. The spike does not
  establish autonomous production dispatch, provider publication, real
  coding-host persistence or the hosted C3 lifecycle. The setup list
  does not support any claim about the workspace or token
  lifecycle. No runtime was rerun for the clarification or for
  this reconciliation.
- `notes/2026-10-01-jam-room.md`, Revision 3, at
  `d3291cd0b8cd41b58a7643b4b95286bcd1deaf36`. The 2026-10-02 text cited
  it on branch `request/jam-room-note`. Its fixed starter vocabulary
  is dated design. Hugh's later instruction permits vocabulary to evolve
  during self-hosting; the builder judges when the first useful Jam task
  is enabled. The full manual proceeds beside Jam, with backlog remaining.
- `notes/2026-10-01-wake-and-schedule.md`, Revision 2, at
  `337a449daafe1a347cd69fc755b9be1ade7860dc`, not landed. The 2026-10-02
  text cited it on branch `request/wake-and-schedule`. Approved/adopted
  clarifications 007/008 define qualified input/delivery, closure and
  schedule semantics with existing C3 ownership. Planning approval is not
  actual watcher, catalogue bridge or deployed scheduled work.
- `docs/policy-pack.md` at exact main `e6e67828`: the code-room starter
  baseline. Declared application mappings are commitments/current
  unlanded work, not evidence that collection packs are available.
- DAP (`~/play/dap`) exact main `9d738e2e71b84ec85cd321bd4d87623ea3fad355`:
  `notes/2026-09-20-direction-and-next-steps.md`
  (§1, §2, §4, §5, §6), `notes/2026-09-15-sale-as-experienced.md`,
  `notes/2026-09-22-technology-spikes-plan.md` (T3–T7). The sale source
  has one ordered first acceptance and a later ineffective competing
  acceptance; Dana's disclosure refuses Alice's prices, counters and
  inspection content. Direction/T7 retain separate assertion, capture,
  confirmation and changing standing. These are pinned product/fixture
  sources, not claims that Artroom has implemented their complete privacy,
  account or agency model; some DAP client experiences are themselves
  described as unimplemented/aspirational.
- Workroom owners: G2 `d50ce26d` and associated `1ebda917`, founding
  `a13a0bf5`, checker-job authority `f12cef6b`, future K2 `da2737b2`,
  wake source integration `24711ceb` and assert `d8e11208`, which amends
  the scope of the firm-authority design request `d50ce26d`.
  Approved 005/006, frozen 007/008 and their adoption records are retained
  planning authorities, with C1–C6 and N1–N7 implementation still distinct.

## 9. Review reconciliation, dependencies and acceptance

This complete revision responds to all seven accepted `e1f72af6` groups.
It preserves the grid, six constraints, W1–W10, A–D and REQ-1–41. The
table states useful invariant boundaries and concrete focused controls;
it does not request implementation or a runtime run for this prose review.

| Accepted group | Corrected design and retained scope | Acceptance before that future mechanism is adopted |
|---|---|---|
| 1. Fresh replayable authorized revocation and direct-key coverage | C-1/C-6, W8, section 5 D, REQ-5/8/25–31/35–37; G2 owns firm/recovery authority | Admit an unrevoked applicable key with retained fresh complete absence proof; replay solely from saved bytes. Refuse expired, missing, partial, rollback, future or wrong-scope proof. A signed A removal cannot stop B/customer authority. The firm's direct route cannot bypass its valid recovery removal. Change the local pin while proof acquisition waits: old inputs cannot seal. |
| 2. Actual targeting and outage bounds | W8, section 5 B/C, REQ-27/32–35; discovery and delivery remain future | Issue unused mandates to many idle cells and admit relevant activity in two. Only those two receive removal work. Delay the second activity feed item through revocation: it is durably pending, then targeted once; complete audit is not claimed early. Duplicate delivery changes no second effect. D unavailable beyond mandate lifetime still fails closed, while unrelated human authority remains usable. |
| 3. One sale decision and private disclosure | W7, G5/G7, REQ-38–39; preserve both single-Room and multi-Room alternatives | Race two otherwise eligible accepts through one decision authority: one winner, the other refused/ineffective as explicitly declared. A stale/duplicate/conflicting copy cannot decide a second winner. Dana can obtain permitted public stubs/outcome, but price/counter/inspection requests and exported versions are refused. A missing source witness leaves a bid cell pending. |
| 4. Source-authorized reporting and coordinates | C-4/C-5, W10, G1/G4, REQ-1–2/18–24 | Source permits one coarse SLA field to an audience: it can aggregate but cannot read raw/private C1 data or a private-input KPI. Grouping-only permission does not authorize export. A historical query and index/existence query use their declared current/retained-release access rules. Access removal stops the specified future access while saved authorized byte copies are acknowledged. |
| 5. Work continuity with fresh controls and coherent join | W4/W6, G2, REQ-5–9; C1–C3 own actual workspace lifecycle | Replace an authorized same-principal representative: history, evidence and authorized saved edits survive according to the reviewed handover rule. Old holder/epoch/credentials cannot issue new commands or blindly rerun an unknown effect. Different-owner handover creates a fresh authorized environment. Own-key join has no delegation; a valid delegated performer acts without joining and gains no roster power. |
| 6. Changing standing and usable agency | W5, G5, REQ-15–17; N2 retains full action-work lifecycle | Capture one source confirmation, then append cancellation/correction/retraction and a conflicting source. Original bytes/source/time remain identical; current standing, interpretation author, conflict and known frontier are shown. The person can identify their next step and needs met/unmet/human support. Private interpretation neither satisfies a shared guard nor completes requested work by itself. |
| 7. Exact sources, runtime boundaries and all unmeasured requirements | W1–W3/W9, section 8, REQ-10–14/40–41 | Review the dated source identity and actual evidence boundary. A checker signs locally admitted checks; a Git push remains distinct; local pi simulation is not autonomous C3 dispatch. Catalogue input is observed outside admission and contributes only under current local authority. No requirement is credited by its number alone, and no future collection spike becomes a first-Jam prerequisite. |

Existing dependencies are explicit. G2 authority/pin design must agree
with C1/C3 member, delegation, lease, controller and workspace epochs before
firm handover/revocation relies on them. G1 coordinates depend on source
authorization and registry query privacy, rather than merely adding index
fields. G4 export/evaluator eligibility depends on a declared field and
audience contract; storage follows that decision. G5 source witnesses and
standing must fit ordinary declared acts, bound body sizes and N2 outcomes.
G6 founding uses the existing bootstrap owner; external catalogue inputs
reuse C3/007/008 without reading foreign Rooms at admission. G7 needs a
reviewed visibility/one-decision choice and source witness, not independent
winner selection in each private cell. K2 stays after Artroom is built.

Unresolved choices in section 7 are planning gaps. C1–C6, N1–N7, G2,
bootstrap, checker-job authority and wake integration already have work
owners; neither the clarification nor this note recommissions them or
narrows their acceptance. The deployment proof, activity index, KPI
export and private sale alternatives remain proposed collection
mechanisms. Original
`34cf52b3` / `6430ffd4` still owes independently reviewed source integration.

History of the planning task. For the clarification, completion meant
that the full exact dated text was frozen, independently reviewed against
all seven groups and its original scope, and its accepted direction and
result recorded through the live own request. That review verified
frozen/local byte identity and `git diff --check`. It needed no install,
runtime suite, provider action, source edit or benchmark, because the
work was prose. Review `2baa8ef7` records that outcome. This revision
carries the reviewed text into the note. It runs nothing and adopts
nothing.

For future implementation, REQ-41 requires bounded
evidence for the actual selected mechanism and its useful countercases,
followed by normal independent review and landing. Preserve the 10× test
overhead priority and the builder's first-Jam readiness judgement.

## 10. What the 2026-10-02 text said that this revision corrects

This section is history. Nothing in the left column is operative as it
was worded there. Where the same words still appear in the note, the row
says so and says what was added. Each row quotes the original text at
`5b579511`, says why it no longer stands as worded, and names where the
corrected text is. The reasons come from the reviewed clarification and
its seven accepted correction groups (section 9).

The first table lists the places that changed, outside the requirement
statements, and quotes the main statements in each. Within a listed
place, a sentence that is not quoted may also have changed. The second
table gives the complete original statement of every rewritten
requirement. The third table lists the corrections made under the
planner's direction `fceb27d0`, and quotes the clarification's wording
that each one replaces. Places that no table lists are unchanged from
the original, apart from added qualifications, labels and source pins. The
complete original at `5b579511` is the record.

| Where | The 2026-10-02 text said | Why it no longer stands | Corrected in |
|---|---|---|---|
| Summary; section 1 | Self-sufficiency "keeps a million cells cheap". A firm can hold a million open engagements "at near-zero idle cost" | Scale and cost are unmeasured hypotheses | Summary; section 1; REQ-41 |
| Summary, first point | Everything a cell needs to judge an act "is in its own log before the act" | A revocation proof is retained with the admission receipt that uses it | Summary; C-1; section 5 |
| Summary, revocation point | The list "makes the stop fast". "A targeted push from the firm's own assignment list handles the cells where evidence must be invalidated" | The stop is fast only with retained completeness and freshness proof. Assignment is discovery, not activity | Summary; section 5, D and B; REQ-32; REQ-33 |
| Section 1 | "The pi-durable spike shows one such agent claiming, proposing and landing under a member's delegation, and resuming after a crash without acting twice" | The spike is a bounded local harness. Its fork push is simulated, its resumption is driven by the caller, and its workspace token path is not exercised | Section 1; W1.5; section 8 |
| Section 2, identity row | Mechanism: "a signed object carried in, verified against a key pinned in the cell's roster". Records: "the pinned key at join; each mandate as presented". Later change: "only by revocation" | A signature alone grants nothing. Keys, pins and grants need local authorized admission. New keys and rosters need local acts | Section 2 table |
| Section 2, first consequence | The customer's Room "supplies the delegation their agent acts under". The cell treats both contributors "by the same mechanism", so dap's structural-disadvantage criterion is "met by construction" | A delegation in the customer's private Room authorizes nothing in another cell. Equal mechanism is a design boundary, not proof of usable agency | Section 2; W5; REQ-15 to REQ-17 |
| Section 2, second consequence | A grouping Room's roster "says who may see the roll-up" | The roster is one required permission. The source cells must also authorize fields and audience | Section 2; W10; REQ-23 |
| Section 3, C-1 | What a cell relies on is "recorded in the cell's own log, by digest or by signed object, before it is used" | The bounded revocation witness is retained with the admission that uses it | C-1; section 5 |
| Section 3, C-5 | "The same rule as for Cloudflare K2" | The comparison stands, but K2 is future work, and the note now says so. Export also needs the source cell's declared policy | C-5 |
| Section 3, C-6 | Revocation "can only remove authority, never grant it", with no issuer check stated | These words still stand in C-6, and REQ-36 says the same of deployment revocation state. The original stated no issuer check. The cell must also verify issuer authority over the exact target and scope | C-6; REQ-30; REQ-36 |
| Section 3, closing test | A relation is a control plane if it puts in the cell anything "that is not a pinned key, a pinned digest or a sealed revocation" | The test omitted carried objects with provenance and local authorization | Section 3; REQ-40 |
| W1 | "The case Artroom is built for, as it stands today". Step 5 recorded "claim, push, propose" under "signed envelopes". Finding: "the service never writes into the room" | A Git push is not a Room act. The checker does submit a signed check, judged by the cell's own admission. Spike criterion 3 is local, simulated-push evidence | W1 intro, step 5, finding |
| W2.4 | "if the rule is general, the catalogue gets a request". "The jam note's rule, zero contract amendments, is the same discipline" | The jam note's fixed vocabulary is dated. Hugh allows the acts vocabulary to change during self-hosting | W2.4; W2 finding |
| W3.3; W3 finding | Commitments are "ordinary acts" under "the jam's design rule". The finding said "the jam adds nothing new, which is its purpose" | The future vocabulary may evolve. The jam is not evidence of no platform gaps | W3.3; W3 finding |
| W4.2 | "the homeowner's agent captures the reply as a `note` signed by the homeowner" | The agent signs with its own explicitly delegated key and never holds the homeowner's private key | W4.2 |
| W4.4 | "The firm's representative joins the cell". "the firm is a member with a key", with "the firm's key pinned at join" | The firm principal is a proposed G2 mechanism. The agent need not join | W4.4 |
| W4.5; W4.6 | "the homeowner's agent redeems it under a delegation from the homeowner's key" and "is now a member". "Rung 2 is one act; rung 3 is the same acts repeated" | Join and delegation are distinct admissions. The homeowner's own key joins. The agent acts under delegation without joining | W4.5; W4.6; REQ-8 |
| W4.9 | G2b: "the representative replaced under the firm's authority and the lane kept" | Undertaking and history survive. Old tokens, callbacks and controls do not. Plan 005 has no in-place hosted owner transfer | W4.9; handover boundary; REQ-6 |
| W4.11 | "the homeowner's agent, a member of both, carries the estimate". dap's T6 "is the same shape" | The carrier needs source read/export permission and local authority, not membership of both. T6 is a bounded fixture | W4.11; REQ-16 |
| W4.14 | "a final landing; the cell goes idle". "No archive step. The log is permanent and the Durable Object sleeps" | A landing is not a complete closure pack. Remaining duties, cleanup and retention have owners | W4.14 |
| W4 findings | "it is no surprise that it fits". The three gaps "are small". "two firms never share a Room, and the customer's agent is the only bridge". That was called the dap property "views can differ without disagreeing about what was decided", "held by never having two authorities in one place" | Cost is not established. A second firm may contribute inside a cell (W6). Shared decisions need one authoritative ordered record | W4 findings |
| W5.2; W5.3; W5 findings | Delegation "kinds `note` and `propose`, not `land`". "Artroom keeps the first two apart by actor and content". The care episode "needs nothing a claim does not"; "a pack matter, not a contract matter" | A `note` does not classify assertion, capture or confirmation. Changing standing is a distinct need. A proposal that needs a held lane still needs its claim | W5.2; W5.3; new steps W5.11 and W5.12; W5 findings |
| W6.3 | "the inspector's agent joins under its own firm's mandate" | No delegated roster join. The inspector's key or principal joins; the agent acts under a separate scoped grant | W6.3 |
| W7 intro; W7.3'; W7.4; W7.5; W7 findings | Dana "sees what Alice chooses to share". "Agreement about the decision holds because Alice signs the same decision object into both cells". "a carry, not a view filter". The shape "reproduces the decisions, the attribution and the agreement property" | The dap source refuses some disclosures Alice wanted. Similar copies in two cells do not make one decision unique. One authoritative decision Room is needed | W7 intro; W7.3' to W7.5; new steps W7.6 and W7.7; W7 findings; REQ-38 |
| W8.2; W8.3; W8.6 | Scope "100,000 cells"; "A proposal-per-cell takes hours and wakes every Durable Object". "The firm's own assignment log knows which cells these are". The audit reads "the published logs and receipts" | The figure of 100,000 open engagements still stands in the W8 introduction and step 5. Only affected scopes need work. Assignments do not prove activity. The audit needs the acknowledged activity frontier and states its limits | W8.2; W8.3; W8.6; section 5 |
| W9.2; W9 findings | "a `notify` rule in the old pack wakes the firm's agent when the catalogue publishes". The firm's agent is "a member of each" cell. Finding: "that agent is a member of every cell it acts in, so C-1 holds" | Ordinary `notify` matches local inputs. A runtime subscriber observes the catalogue outside admission. The bridge is unbuilt | W9.2; W9 findings; REQ-13 |
| W10.1 to W10.4; W10.6; W10 findings | "the room's alarm raises attention". "a post-commit exporter sends facts, never content". "The reporting layer never holds what the roster would refuse". "Reporting needs exactly one new contract surface, G4, and everything else is composition". The grouping's authority over its own aggregate "is why a grouping can be a Room without becoming a control plane" | A fact can disclose a private input. Export needs a source-authorized profile of fields, audience and retention | W10.1 to W10.4; W10.6; new step W10.7; W10 findings; REQ-18 to REQ-24 |
| The gaps | G2b "with the lane kept". G4 "A KPI fact as a sealed system event naming its defining pack digest". G5 "A standard form for a carried object's provenance: room, act ID, digest" | Each gap is wider than first stated | The gaps table |
| Section 5, timeliness | "within minutes of the firm's revocation" | The proposed bound is one minute from acceptance by the deployment service, and it is unmeasured | Section 5; REQ-25 |
| Section 5, table | A "(today)": "hours; fails". B delivered by "(Queues)": "minutes, eventually". C: "an expiry of, say, fifteen minutes; the representative re-presents a fresh one with each act", scale "free". D: "A deployment revocation list" with "the receipt recording the list version consulted", "seconds to a minute", "one read per delegated admission, cacheable" | No timing is measured. A version label proves no absence. D must cover every firm-linked route. Product names and example lifetimes are not chosen | Section 5 table; REQ-28; REQ-34 |
| Section 5, D | "The list is a transport. A forged entry fails verification in every cell". The cell verifies "against the firm's key pinned in its own roster" | Authenticity is not removal authority. Completeness needs a deployment signer, which is new trust | Section 5, D; REQ-30 |
| Section 5, C | Acts "are refused (fail closed) for at most the mandate lifetime, and direct member acts are unaffected". "The lifetime is a pack setting" | The lifetime statement now stands only in REQ-34, within G2's bounds. A fail-closed outage has no bound from mandate lifetime. Direct firm-principal routes are subject to D | Section 5, C; REQ-34; REQ-35 |
| Section 5, B | "The firm's own Room knows which cells each representative was assigned to". "A push to that list" | Assignment is discovery, not activity | Section 5, B; REQ-32; REQ-33 |
| Section 5, contract | "one more input to admission for delegated acts", "one more field in the receipt's `Authority`", "one new system entry kind" and "a deployment component beside the registry" | D changes more than one optional receipt field | Section 5, contract changes |
| Section 5, untested | "The read cost of D at admission in a Durable Object, the propagation time of the list across a deployment, and whether a KV-backed list's propagation (about a minute) or a Durable Object-backed list's strong consistency is the right trade. A spike would measure these." | A store's name proves no bound. The untested list is now wider, and the store figures are not carried as claims | Section 5; section 7 |
| Section 6, introduction | The original said that "Must" is a requirement, with no qualifier | Every requirement is proposed | Section 6 introduction |
| Section 6, statements | Thirty requirements had shorter statements, and REQ-36 named "The list" | Each of the thirty gained the conditions from its correction group. REQ-36 now names deployment revocation state (third table). No number was removed, merged or reused. REQ-3, 4, 10 to 12, 14, 20, 26, 37 and 39 are unchanged | Section 6; the second table below |
| Section 7 | Visibility "is a platform question with a cost on both sides". "The mandate's shape, and whether a team may hold a key" (the team question still stands in section 7). Facts store: "REQ-18 to REQ-24 hold for any of them". The list's backing store: "KV or a Durable Object. REQ-25 is the measure". Cross-Room obligations: "a carry by a member of both" | The open choices are wider: recovery pins, handover, export format, proof encoding, activity feed and standing | Section 7 |
| Section 8 | Sources pinned by branch name or "at the same head" | Each source now has an exact commit and a stated evidence boundary | Section 8 |

The complete original statement of each rewritten requirement follows.
The right column is the 2026-10-02 text, word for word, with its trace.
It is history. The operative statement of each requirement is in
section 6.

| Requirement | Statement in the 2026-10-02 text |
|---|---|
| REQ-1 | A genesis may carry coordinates: `customer`, `service` and `firm`, each a member handle or a stable external identifier, and each may be absent. (W4.3, W7.1) |
| REQ-2 | The registry indexes rooms by each coordinate and answers "rooms with this customer", "rooms with this service" and "rooms with this firm" without reading any room. (W2.7, W4.13) |
| REQ-5 | A cell verifies a mandate against a key pinned in its own roster, and never by reading the firm's Room. (C-1; W4.4) |
| REQ-6 | A representative can be replaced under the firm's authority without releasing the lane, and the lane's generation, carried evidence and workspace survive. (W4.9) |
| REQ-7 | A receipt for a mandated act names the grantor, the mandate and the performer. (W4.4) |
| REQ-8 | Two firms' representatives in one cell act under two independent mandates, and neither can act under the other's. (W6.3) |
| REQ-9 | A roster shared by several cells is carried into each as a signed snapshot with a digest, and a later snapshot is a roster act in each cell. (W2.2, W3.5) |
| REQ-13 | A `notify` rule may name a catalogue's publication as the event, and the notified member is a member of the cell. (W9.2) [Untested: the wake design is not landed] |
| REQ-15 | A carried object names its source room ID, source act ID and content digest in one standard form, in the act that carries it. (W4.11, W4.15, W5.5, W6.7, W7.3') |
| REQ-16 | A cell admits a carried object on the carrier's authority only. The source room's authority is not consulted and not implied. (C-1; W4.11) |
| REQ-17 | A reader can tell a carried object from an act of the cell by the record alone. (W5.3) |
| REQ-18 | A pack may define a KPI as an expression over the cell's acts, under the policy evaluator's profile and budget. (W10.1) |
| REQ-19 | The cell seals a KPI fact as a system entry naming the room ID, the act ID that produced it and the pack digest that defined it. (W10.2) |
| REQ-21 | The exporter sends facts and never content. (W10.3) |
| REQ-22 | A roll-up can be computed at any past head of a grouping Room. (W10.5) |
| REQ-23 | A grouping Room's roster decides who may read its aggregate; a cell's roster decides who may read inside the cell; the reporting layer holds nothing the cell's roster would refuse. (W10.6) |
| REQ-24 | Drill-in from a fact reaches the cell through the cell's own read API with the viewer's credential. (W10.6) |
| REQ-25 | A firm's revocation of a key stops that key's delegated and mandated acts in every cell within one minute of the list accepting it, measured at admission. (W8.2) [Untested] |
| REQ-27 | A cell the key never acted in does no work for REQ-25. (W8.5) |
| REQ-28 | A receipt for a delegated or mandated act records the revocation list version consulted. (C-1; W8.6) |
| REQ-29 | A replay of the cell's log with the recorded list versions reaches the same verdicts. (C-1) |
| REQ-30 | The list carries the firm's signed revocation object, and a cell verifies its signature against the firm's key pinned in the cell before sealing it. (W8.2) |
| REQ-31 | A cell seals a received revocation as a system entry the first time it consults it, and then applies R-REV-3. (W8.3) |
| REQ-32 | The firm's Room records each mandate it issues with the cell it was issued for, so the firm can name the cells to push to. (W8.3) |
| REQ-33 | A targeted push reaches those cells and no others. (W8.3, W8.5) |
| REQ-34 | A mandate carries an expiry, with the lifetime set by the pack. (section 5, C) |
| REQ-35 | When the list is unavailable, delegated and mandated acts are refused with a named reason and direct member acts are unaffected. (section 5, C) |
| REQ-36 | The list can only remove authority. No entry on it grants anything. (C-6) |
| REQ-38 | A sale with private bids is expressed as one cell per private relationship, and the decision is carried into each with provenance. (W7.3') |
| REQ-40 | Any proposed control relation that puts something in a cell other than a pinned key, a pinned digest, a carried object with provenance or a sealed revocation is refused at design review with that reason. (section 3) |
| REQ-41 | Every requirement above that is marked [Untested] gets a spike before it is adopted. (section 5) |

The corrections made under the planner's direction `fceb27d0`
(2026-10-04) follow. The clarification left each of these passages at
odds with its own, more specific corrections. The planner directed that
the operative text be corrected. The middle column quotes the wording of
`plans/012-2026-10-04-collections-clarification.md` that was replaced,
so the reviewed text stays visible. That file is frozen and unchanged.
Apart from these corrections and the added labels, pins and names key,
sections Summary to 9 carry the clarification's wording.

| Where | The clarification's wording, replaced | Corrected to say | Corrected in |
|---|---|---|---|
| Summary, control mechanisms | "Identity arrives as a signed object verified against a pinned key." | A signed source object is carried in and then admitted locally as an authorized key, pin or grant. A valid signature alone grants nothing | Summary; agrees with the section 2 table and REQ-5 |
| Summary, revocation | "Short-lived mandates bound the damage with no infrastructure. A deployment-level revocation list, consulted at admission and recorded in the receipt, makes the stop fast only with retained completeness and freshness proof." | Mandates bound stale mandate authority by its remaining lifetime. They do not bound a fail-closed outage, and there is no expiry-only fallback. The fast stop is deployment revocation state, not a list | Summary; agrees with section 5, C and D |
| W8 findings | "the firm must be able to stop a key in every cell in minutes without a member of each cell signing anything." | The proposed bound is one minute, in every applicable cell, from acceptance of the authorized revocation by the deployment service. Submission and acceptance are distinct. The bound is unmeasured | W8 findings; agrees with section 5 and REQ-25 |
| Section 5, audit requirement | "Each cell where the key had acted must seal the revocation and apply R-REV-3's effects, so "where did it act after 09:00" has an answer in the logs." | Each affected cell seals an applicable positive revocation and applies the R-REV effects. Delivery is shown as pending or unsealed until an authoritative cell result exists. Central acceptance, targeted delivery or a missing acknowledgement proves no sealing | Section 5, "What the walk-throughs require"; agrees with section 5, B |
| REQ-36 | "The list can only remove authority. No entry on it grants anything." | Deployment revocation state can only remove authority. No entry or proof in it grants anything. Other uses of "list" in the note are unchanged | Section 6 |
| Section 8, workroom owners | "original discussion `d8e11208`" | `d8e11208` is an assert that amends the scope of the firm-authority design request `d50ce26d` | Section 8; agrees with the opening of the note |
| Section 1 and section 8, pi spike | "using pinned sources, fake Artifacts, a simulated push and caller-driven resumption." and "with simulated workspace/push, retained local resume inputs and caller-driven resumption." | The spike's setup lists the real Room and its workspace code over fake Artifacts and the publisher sandbox. That is not a real hosted coding workspace. The fork push was simulated, the workspace token path was not exercised, and resumption was driven by the caller | Section 1; section 8 |
