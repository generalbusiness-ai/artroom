# Collections of Rooms: managing services at scale

Date: 2026-10-02. Request `34cf52b3`, promise `6430ffd4`. A design note
and a draft for Hugh's reading. It adopts nothing. Its purpose is to turn
one discussion into numbered requirements that later requests can cite.

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

Related work on the board: request `d50ce26d` (the firm's authority chain,
a design note), request `a13a0bf5` (every Room founded with a policy),
assert `d8e11208` (the scope of `d50ce26d`: a Room's admission never reads
another Room; revocation is the only push).

**How to read the labels.** Each claim carries one:

- **[Source]** a fact from Artroom's protocol or code, cited by rule
  number, from `docs/protocol.md` on `main` at `bd520fb9`; or from a dap
  note at `~/play/dap` on `main`;
- **[Judgement]** a design choice or opinion;
- **[Untested]** a claim nobody has run.

Proposed rules in this note are labelled `C-<n>` (collections). They are
not protocol rules. A later amendment would give them `R-` numbers.

## Summary

- **The cell is self-sufficient.** Everything a cell needs to judge an
  act is in its own log before the act: its roster, its policy, the keys
  it pinned, the digests it imported. A control Room never sits in the
  path of a cell's admission. This is what keeps a million cells cheap and
  keeps every log replayable alone. [Judgement]
- **Three control Rooms, three mechanisms.** Identity arrives as a signed
  object verified against a pinned key. Functionality arrives as a
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
  mandates bound the damage with no infrastructure. A deployment-level
  revocation list, consulted at admission and recorded in the receipt,
  makes the stop fast. A targeted push from the firm's own assignment list
  handles the cells where evidence must be invalidated. A per-cell
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
million open engagements at near-zero idle cost. [Judgement] The pi-durable
spike shows one such agent claiming, proposing and landing under a
member's delegation, and resuming after a crash without acting twice
(`notes/2026-10-01-pi-durable.md`). [Source]

**The coordinates are in genesis.** A Room's genesis never changes
(R-GEN-2) and names the room, the repository, the first admin and the
recovery key (R-GEN-1, `Genesis` in `packages/contract/src/roster.ts`).
[Source] An engagement's customer, service and firm never change either,
so they belong there. Nothing about grouping belongs there. [Judgement]

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
| Identity | the firm's Room; the customer's own Room | keys, rosters, mandates | a signed object carried in, verified against a key pinned in the cell's roster | the pinned key at join; each mandate as presented | only by revocation |
| Functionality | catalogue Rooms | policy packs, checker configurations, KPI definitions, starting arrangements | import by digest; a later version is a proposal in the cell | the digest at founding and at every upgrade | never on its own |
| Reporting dimension | grouping Rooms, as many as there are ways to look | classification of cells | none; joined at query time against genesis coordinates | nothing | no |

Three consequences. [Judgement]

- **Identity has two contributors per cell.** The firm supplies its
  representative's mandate. The customer's own Room supplies the
  delegation their agent acts under. The cell treats both by the same
  mechanism, so a customer without an advocate is not structurally behind
  a firm with one. That is dap's structural-disadvantage criterion met by
  construction (`notes/2026-09-20-direction-and-next-steps.md`, §1).
- **Reporting dimensions multiply freely** because they have no
  authority. A firm's service lines, a regulator's categories, finance's
  segments and one person's "every cell where I am the customer" are all
  groupings. The last is dap's **perspective**, so the perspective is a
  reporting dimension and not a control relation. A grouping Room's one
  authority is over its own aggregate: its roster says who may see the
  roll-up.
- **The mechanism follows the object, not the Room.** A firm may keep its
  roster and its packs in one Room. The roster is still imported as
  pinned keys, the packs as digests, and the firm Room's own owner map
  says which members may change which path.

## 3. The rules this design holds to

These are proposed. Each walk-through step in section 4 is judged against
them.

- **C-1. A cell's admission never reads another Room.** Anything a cell
  relies on from elsewhere is recorded in the cell's own log, by digest
  or by signed object, before it is used. The log is replayable alone.
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
  for Cloudflare K2 (request `da2737b2`).
- **C-6. Revocation is the only push**, and it can only remove authority,
  never grant it.

A test for any future control relation: if it wants to put something in
the cell that is not a pinned key, a pinned digest or a sealed
revocation, it is trying to be a control plane.

## 4. Walk-throughs

Each step names the Room acted in, the control Room contributing (or
none), the mechanism, what the cell records, and the protocol rule met or
the gap found. Gaps are numbered `G<n>` and collected at the end of the
section. Requirements in section 6 cite steps as `W<case>.<step>`.

### W1. A code room with a shared checker service and a pi-durable author

The case Artroom is built for, as it stands today. One repository. A
maintainers team. A checker service that one deployment runs for every
room (lane G, `72d6abde`). An author agent in a Durable Object.

| Step | Room | Control Room | Mechanism | Cell records | Rule or gap |
|---|---|---|---|---|---|
| 1. Found the room with the starter pack | the cell | none; the pack comes from `packages/policy` | the pack is compiled into `.artroom/policy.json` on main; entry 1 names its digest | genesis; `policy-activated` with the digest | R-GEN-10, R-POL-9 [Source]. Today the default without a file is the bare R-POL-7 policy; request `a13a0bf5` makes the pack the default |
| 2. Invite the maintainers | the cell | none | invitation with a secret; the key binds at `join` | each `join` | R-GEN-6, R-ADM-3(c) [Source] |
| 3. Register the checker | the cell | the deployment's checker service | the policy names the checker by name and digest; the deployment binds the service | `policy-activated` names every active checker configuration | R-POL-9, R-EXEC-8 [Source]. One service for many rooms is already a collection; the room never reads the service to judge an act |
| 4. A maintainer delegates to the author agent's key | the cell | none | `delegate` roster op from the member key | the delegation | R-CRED-4, R-ADM-5 [Source]. The agent never joins |
| 5. The agent claims, writes, proposes | the cell | none | signed envelopes under the delegation, stored before first send | claim, push, propose | R-ADM-3(b), R-IDEM-2 [Source]; spike criterion 3 [Source] |
| 6. The Room issues a check job | the cell | the checker service | a job over a service binding, unsigned | the `check` act when it returns | R-EXEC-8 [Source]. The checker signs as a member of each room; request `f12cef6b` is the open amendment for a per-job delegation |
| 7. An owner reviews; the agent lands | the cell | none | `review`, `land` | verdict; landing; `main` moves | R-OBL, R-LAND-7, R-PUB-1 [Source] |
| 8. A maintainer's key is compromised | the cell | none | `revoke` as `compromised` | the roster receipt lists invalidated evidence | R-REV-3 [Source]. One room, one act. Section 5 asks what this costs across a million rooms |

Finding: W1 needs nothing from this note. Every step is a rule that
exists or a request on the board. The one collection it already contains,
one checker deployment for every room, obeys C-1 and C-2 today: the room
records the checker's name and digest, and the service never writes into
the room. [Source, Judgement]

### W2. Artroom's own development, self-hosted

Several repositories (the platform, the jam, later the docs), one
maintainers group, one checker deployment, one planner. This is a firm
with a column of its own rooms and no customers.

| Step | Room | Control Room | Mechanism | Cell records | Rule or gap |
|---|---|---|---|---|---|
| 1. Found the platform room and the jam room | each cell | none today | as W1.1 | genesis each | R-GEN-10 [Source]. The two rooms share nothing but the deployment |
| 2. The same maintainers in both | each cell | **the firm**: a maintainers Room would hold the roster once | today: invite into each room separately | two independent rosters | **G2a**: there is no way to say "the members of that Room" in this one. Under C-1 the answer is a signed roster snapshot carried in and pinned, not a live reference |
| 3. The same policy pack in both | each cell | **the catalogue**: `packages/policy` published as a pack | today: the compiled file is committed in each repository | the digest in each `policy-activated` | R-POL-9 [Source]. This is already import by digest. What is missing is the pack's origin: which catalogue, which version |
| 4. The jam needs a rule the pack lacks | the jam cell | the catalogue | the jam proposes its own policy change; if the rule is general, the catalogue gets a request | the jam's `policy-activated` | C-3 [Judgement]. The jam note's rule, zero contract amendments, is the same discipline (`notes/2026-10-01-jam-room.md`) |
| 5. The pack is upgraded in the catalogue | the catalogue | none | an ordinary landing there | nothing in any cell | C-2. No cell changes |
| 6. Each room takes the upgrade | each cell | the catalogue | a proposal that bumps the digest; an agent may author it | `policy-activated` with the new digest | C-3, R-POL-9 [Source]. Review is per room, per the room's own policy |
| 7. The planner wants one board across rooms | none; a read | **a grouping**: "rooms of this project" | a query over the registry and the published logs | nothing | C-4, C-5 [Judgement]. The gitseq workroom does this today for one repository; Artroom's status across rooms needs the registry index, G1 |

Finding: Artroom's own development is the smallest real collection and
already wants all three control Rooms. The firm (step 2) is the gap that
hurts first. [Judgement]

### W3. The jam room

An application in its own repository, depending on Artroom only through
published packages and a deployed room (`notes/2026-10-01-jam-room.md`,
revision 3). [Source]

| Step | Room | Control Room | Mechanism | Cell records | Rule or gap |
|---|---|---|---|---|---|
| 1. Found a jam room from the jam pack | the cell | the catalogue: the jam's own pack | import by digest at founding | `policy-activated` | as W1.1 |
| 2. Agent musicians join; the human joins | the cell | none, or each musician's own Room if they have one | invitations; or a delegation from a member to each agent key | joins; delegations | R-GEN-6, R-ADM-5 [Source] |
| 3. Commitments: parts, solo, key, tempo | the cell | none | ordinary acts | each act | the jam's design rule [Source] |
| 4. Playing travels in a live layer | outside the cell | none | never authoritative | nothing | C-5 applies to the live layer exactly as to reporting [Judgement] |
| 5. A second jam room, same musicians | a second cell | **the firm**: the band | today, re-invite | an independent roster | **G2a** again |
| 6. The jam pack gains a feature | the catalogue | none | a landing there | nothing in any jam | C-2 |
| 7. A running jam takes it mid-session | the cell | the catalogue | a proposal; takes effect at the next bar boundary after activation | `policy-activated` | C-3; the jam's timing rule [Source]. dap's T5 question, structure arriving mid-stream, has this answer in Artroom: at an exact log position, by the cell's own act |

Finding: the jam adds nothing new, which is its purpose. It confirms that
the live layer and the reporting layer are the same kind of thing: copies
without authority. [Judgement]

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
| 2. Rung 1: one exchange by email with the adjuster | the homeowner's Room | none | the homeowner's agent captures the reply as a `note` signed by the homeowner | a note, attributed to the homeowner, with the capture as content | dap's three kinds of record, §5 [Source]; `note` [Source]. The adjuster signed nothing, so nothing is attributed to them |
| 3. The insurer opens the claim cell | the claim cell | **the firm** (the insurer) founds it from **the catalogue** (the claims pack); the deployment holds the onboarding grant | founding with coordinates: customer = homeowner, service = property claim, firm = insurer | genesis with coordinates; `policy-activated` with the pack digest | R-GEN-10, R-GEN-12 [Source]; **G1**: genesis has no coordinate fields today |
| 4. The firm's representative joins the cell | the claim cell | the firm | the firm is a member with a key; the adjuster's agent acts under a delegation from that key, carrying a mandate signed in the firm's Room | the firm's key pinned at join; the mandate as presented | R-ADM-3(b) [Source] needs the grantor to be an active member; R-GEN-7 teams hold no key. **G2**: how a firm is a keyholding principal, and what a mandate is. Owned by `d50ce26d` |
| 5. Rung 2: the homeowner is invited | the claim cell | the homeowner's own Room (identity) | an invitation; the homeowner's agent redeems it under a delegation from the homeowner's key | the join; the delegation | R-GEN-6, R-ADM-3(c) [Source]. The homeowner's agent is now a member of the insurer's cell with the pack's rights for the customer role, and no more |
| 6. The homeowner's agent proposes the inventory | the claim cell | none | `claim`, `propose` under delegation | the acts | R-ADM-3(b) [Source]. Rung 2 is one act; rung 3 is the same acts repeated |
| 7. A fraud model is a required check | the claim cell | the catalogue (the check is in the pack); the deployment (the service) | a check job over a service binding | the `check` | R-EXEC-8 [Source]; `f12cef6b` for the checker's per-job authority |
| 8. The adjuster decides; the pack requires two reviews for a denial | the claim cell | the catalogue | `review` by two firm members or their agents | verdicts | R-OBL [Source]. The rule is in the pack and visible to the homeowner, which is the comprehension rule in dap §2 |
| 9. The adjuster goes on leave; a colleague takes over | the claim cell | the firm | today: release the lane and re-claim; the lease generation moves; the workspace token is revoked | release; claim | R-LANE-8, R-LANE-7 [Source]. **G2b**: the firm's undertaking must survive the person. A mandate bound to the firm, not the adjuster, with the representative replaced under the firm's authority and the lane kept |
| 10. The contractor firm is engaged | a second cell: the repair | the contractor firm founds it from its own pack; the homeowner is invited | as steps 3 to 5 | its own genesis and roster | Two cells, two firms, one customer. No cell knows of the other |
| 11. The insurer needs the estimate from the repair cell | the claim cell | none | the homeowner's agent, a member of both, carries the estimate into the claim cell as a `propose` or `note` with its digest and the repair cell's act ID | the carried object | C-1 [Judgement]. The claim cell never reads the repair cell. dap's T6, admission across a boundary with provenance, is the same shape. **G5**: a carried object's provenance (room, act ID, digest) has no standard form |
| 12. The rental company stays outside | no cell | none | the homeowner's Room holds captures of its emails | notes | as step 2 |
| 13. The homeowner's screen shows all three | none; a read | **a grouping**: "cells where customer = me", plus the homeowner's own Room | a query over the registry index and the homeowner's own log | nothing | C-4, C-5. dap's anchor, which the dap spike reports as implemented nowhere (`notes/2026-09-15-sale-as-experienced.md`), is this query |
| 14. The claim closes | the claim cell | the catalogue (the pack's lifecycle rule) | a final landing; the cell goes idle | the landing | R-LAND [Source]. No archive step. The log is permanent and the Durable Object sleeps |
| 15. A year later the homeowner changes insurers | a new claim cell, a different firm | the new firm; the homeowner's Room | the homeowner's agent carries what the homeowner chooses from the old cell and from their own Room | carried objects, each with provenance | C-1, G5. The old cell is untouched; the homeowner retains their copies |

Findings. The claim is the case the whole design was derived from, so it
is no surprise that it fits. The three things it exposes are G1, G2 and
G5, and all three are small. The important confirmation is step 11: two
firms never share a Room, and the customer's agent is the only bridge.
That is the dap property "views can differ without disagreeing about what
was decided", held by never having two authorities in one place.
[Judgement]

### W5. A care episode (dap)

No advocate. The patient controls their own space, retained copies,
delegation, sharing and continuity across providers, and cannot control
records held elsewhere (dap §6). [Source]

| Step | Room | Control Room | Mechanism | Cell records | Rule or gap |
|---|---|---|---|---|---|
| 1. The patient prepares for one encounter | the patient's own Room | none | found with the personal pack; questions, history, a medication list | notes; files on main | as W4.1 |
| 2. The patient delegates to a family member | the patient's Room | none | `delegate` to the family member's key, kinds `note` and `propose`, not `land` | the delegation | R-ADM-5 [Source]. The family member need not join |
| 3. The provider stays outside | no cell | none | captures of the portal's records as notes | notes with the capture | dap §5 [Source]. The patient's assertion, the captured document and a provider's signed act are three different records; Artroom keeps the first two apart by actor and content, and the third does not exist here |
| 4. A provider that does adopt opens a care cell | the care cell | the provider firm; the care pack | as W4.3 | genesis with coordinates | G1 |
| 5. The medication list lives in the care cell; the patient's Room keeps a copy | both | none | the patient's agent carries each landed change into the patient's Room as a note with provenance | the carried copy | C-1, G5. The patient's retained copy is a copy, and says so |
| 6. The patient's agent proposes a correction | the care cell | the patient's Room (identity) | `propose`; the pack requires a prescriber review | the proposal; the verdict | R-OBL [Source] |
| 7. A second provider, a second cell | a second care cell | the second firm | as step 4 | its own genesis | two columns in one row |
| 8. The patient wants one timeline | none; a read | the grouping "customer = me" | the registry index and the patient's own log | nothing | C-4, C-5. The continuity across providers that dap §6 asks for is this read plus the carried copies in the patient's Room |
| 9. The patient revokes the family member | the patient's Room | none | `undelegate` | the roster op | R-ADM-4 [Source]. One Room, instant. Nothing to push |
| 10. The patient revokes the family member from the care cells too | each care cell where the family member was delegated | none today | one `undelegate` per cell, by the patient's key | each roster op | R-ADM-4 [Source]. Two cells, two acts; fine. A firm with a million cells is section 5 |

Findings. The care episode is the purpose test (dap §6) and it needs
nothing a claim does not. Its particular lesson is step 3: Artroom's
`note` already keeps a capture apart from an assertion by its content and
actor, but the three-way distinction dap makes should be a convention the
personal pack states, not something a reader infers. That is a pack
matter, not a contract matter. [Judgement]

### W6. A renovation (dap)

A general contractor already coordinates. dap's moments are where the
owner's interests cross that arrangement: disputed scope, independent
advice, changing contractors, carrying the history forward (dap §6).
[Source]

| Step | Room | Control Room | Mechanism | Cell records | Rule or gap |
|---|---|---|---|---|---|
| 1. The contractor opens the renovation cell | the cell | the contractor firm; the renovation pack | as W4.3 | genesis with coordinates | G1 |
| 2. Scope is the file; changes are proposals | the cell | the pack | `propose`; the pack requires owner review for scope paths | each generation; verdicts | R-OBL, owners by path [Source]. "Owners" here is literal |
| 3. The owner wants independent advice | the cell | a third firm: an inspector | the owner invites the inspector; the inspector's agent joins under its own firm's mandate, with `review` and `note` only | the join; the mandate | R-GEN-6, R-ADM-5 [Source]; G2 for the mandate |
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
prices. Ivan inspects. Dana joins after the sale and sees what Alice
chooses to share (`notes/2026-09-15-sale-as-experienced.md`). [Source]

| Step | Room | Control Room | Mechanism | Cell records | Rule or gap |
|---|---|---|---|---|---|
| 1. Alice founds the sale | a cell: "this guitar, Alice, no firm" | the catalogue: a sale pack | as W1.1 | genesis | A personal cell with no firm. Coordinates allow a null firm |
| 2. Bob and Carol join | the cell | their own Rooms | invitations | joins | R-GEN-6 [Source] |
| 3. Bob bids; Carol must not see it | the cell | none | a `propose` by Bob | the act, visible to every member | **G7**: a Room's log is visible to its whole roster. Artroom has no per-audience visibility inside one Room. dap's one-series-many-views property is exactly this, and Artroom does not provide it |
| 3'. The multi-Room shape | one cell per bidder: "this guitar, Alice and Bob", "this guitar, Alice and Carol" | none | each bid is an act in its own cell; Alice is a member of both; the decision is carried into each | each cell holds its own bid; the decision with provenance | C-1, G5 [Judgement]. Agreement about the decision holds because Alice signs the same decision object into both cells |
| 4. Ivan inspects | a cell, or both | none | `review` or `note` | the verdict | R-OBL [Source]. If Ivan's report must reach both bidders, it is carried into both |
| 5. Dana joins after the sale | a new cell, or a read Alice grants | none | Alice carries what she chooses into a cell Dana can read | carried objects | C-1, G5. "What Alice chooses to share" is a carry, not a view filter |

Findings. The sale is the case Artroom does not fit directly, and the
note should say so rather than bend it. Per-audience visibility inside one
log is a dap foundation property and not an Artroom one. The multi-Room
shape (3') reproduces the decisions, the attribution and the agreement
property, at the cost of one cell per private relationship and a carry
for every shared fact. Whether that cost is acceptable, or whether
Artroom should ever gain partial visibility, is a question this note does
not decide (section 7). [Judgement]

### W8. A representative's key is compromised across a firm's collection

The case that motivates section 5. A home-services firm with 100,000 open
engagements. One representative agent's key, or worse the firm's signing
key, is compromised at 09:00.

| Step | Room | Control Room | Mechanism | Cell records | Rule or gap |
|---|---|---|---|---|---|
| 1. The firm learns of the compromise | the firm's Room | none | a `revoke` as `compromised` in the firm's Room | the firm's roster receipt | R-REV-3 [Source], in one Room |
| 2. Every cell where that key acted must stop admitting it | 100,000 cells | the firm | **G3**: today, one `revoke` act per cell, each signed by a member of that cell. The firm's representative is not a member, so a firm member must sign in each. A proposal-per-cell takes hours and wakes every Durable Object | nothing until each act lands | C-6 says revocation is the only push. Section 5 compares the mechanisms |
| 3. Cells with evidence from that key must reopen obligations | the cells where the key reviewed or checked | the firm | R-REV-3's effects need the cell to seal the revocation | the roster receipt's `invalidated` list | R-REV-3 [Source]. The firm's own assignment log knows which cells these are; the registry does not |
| 4. Cells with a reserved landing resting on that key | the few such cells | the firm | the emergency rule | `abort-attempt` | R-REV-5 [Source]. These are the cells where minutes matter |
| 5. Idle cells that the key never touched | most of the 100,000 | none | nothing need happen until the key next tries to act there | nothing | [Judgement]. A push that wakes them is pure cost |
| 6. The audit question afterwards: "where did that key act after 09:00?" | none; a read | the grouping "cells of this firm" | the published logs and receipts | nothing | C-5. Each receipt records the authority used (R-ADM-3) and, under section 5, what revocation state was consulted |

Findings. Step 2 is the requirement that breaks the per-cell proposal
mechanism: the firm must be able to stop a key in every cell in minutes
without a member of each cell signing anything. Step 5 is the requirement
that breaks a naive push: most cells should pay nothing. Step 3 is why a
push is still needed for some cells: evidence invalidation is a change to
the cell's state that only the cell can seal. [Judgement]

### W9. A pack upgrade across the collection

The claims pack gains a rule: a denial now needs a third review when the
amount exceeds a threshold.

| Step | Room | Control Room | Mechanism | Cell records | Rule or gap |
|---|---|---|---|---|---|
| 1. The catalogue lands the new pack version | the catalogue | none | an ordinary landing under the catalogue's policy | nothing in any cell | C-2 |
| 2. Each open claim cell is offered the upgrade | each cell | the catalogue | an agent per cell, under a firm delegation, proposes the digest bump; or a `notify` rule in the old pack wakes the firm's agent when the catalogue publishes | a proposal per cell | C-3; R-POL-5 and the wake design (`notes/2026-10-01-wake-and-schedule.md`, on `request/wake-and-schedule`) [Source, Untested]. The catalogue cannot notify the cells; the firm's agent, a member of each, watches the catalogue and acts in each cell |
| 3. The cell lands it under its own policy | each cell | none | the pack's own rule for policy changes applies, which may be admin approval | `policy-activated` with the new digest | R-POL-9, R-ADMIN [Source]. Open proposals are recomputed |
| 4. A cell declines or lags | that cell | none | nothing | nothing | A cell on an old pack is a fact the grouping can report, not a fault the catalogue can correct |
| 5. The regulator asks which claims were decided under which pack | none; a read | a grouping | the `policy-activated` digests in each log | nothing | C-5. The digest in the log is the answer |

Findings. Upgrade is slow by design and that is correct, because it is the
mechanism by which the cell's own policy governs the cell. The one piece
of machinery it needs is the firm's agent learning that the catalogue
changed, which is the wake design applied across Rooms, and that agent is
a member of every cell it acts in, so C-1 holds. [Judgement]

### W10. Reporting: an SLA breach rolls up, and a regrouping

| Step | Room | Control Room | Mechanism | Cell records | Rule or gap |
|---|---|---|---|---|---|
| 1. The pack defines an SLA: a proposal must be reviewed within two days | the cell | the catalogue | a rule with a deadline; the room's alarm raises attention | an attention item; **G4**: a KPI fact as a sealed system event, with the pack digest that defined it | R-API-8 attention [Source]; the wake design's schedule [Untested] |
| 2. The breach is a fact | the cell | none | the Room seals the fact | the fact, with room ID, act ID, pack digest | G4 |
| 3. Facts stream out | outside the cell | none | a post-commit exporter sends facts, never content | nothing | C-5; the K2 request `da2737b2` [Source] |
| 4. The roll-up by service line | outside | a grouping Room | a query joining facts to the grouping at its current head | nothing | C-4, C-5 |
| 5. Finance regroups customers into new segments | the grouping Room | none | a proposal that lands there | nothing in any cell | C-2. The roll-up for last quarter can be run at last quarter's grouping head, so the regrouping is retroactive and dated |
| 6. A manager drills from a number to a cell | none; a read | the grouping (its roster says who sees the aggregate); the cell (its roster says who sees inside) | the facts store down to a room ID and act ID, then the cell's own read API with the viewer's credential | nothing | C-5. The reporting layer never holds what the roster would refuse |

Findings. Reporting needs exactly one new contract surface, G4, and
everything else is composition. The grouping Room's only authority is
over its own aggregate, which is why a grouping can be a Room without
becoming a control plane. [Judgement]

### The gaps

| Gap | What | Owner |
|---|---|---|
| G1 | Genesis has no coordinate fields; the registry has no index by them | this note, section 6 |
| G2 | How a firm is a keyholding principal in a cell; what a mandate is | request `d50ce26d` |
| G2a | A roster shared by several cells, as a signed snapshot carried in | `d50ce26d` |
| G2b | A representative replaced under the firm's authority with the lane kept | `d50ce26d` |
| G3 | Revocation across a collection, fast, without a member of each cell signing | section 5 |
| G4 | A KPI fact as a sealed system event naming its defining pack digest | section 6 |
| G5 | A standard form for a carried object's provenance: room, act ID, digest | section 6 |
| G6 | A pack's origin recorded with its digest: which catalogue, which version | section 6, with `a13a0bf5` |
| G7 | Per-audience visibility inside one Room; the sale | not decided, section 7 |

## 5. Revocation

### What the walk-throughs require

From W8, W5.10, W4.9 and W1.8:

- **Timeliness.** A key must stop being admitted in every cell within
  minutes of the firm's revocation, not within the time it takes a
  proposal to land in each cell. (W8.2)
- **Scale.** The cost must not be proportional to the size of the
  collection when most cells are idle. (W8.5)
- **No signer per cell.** A member of each cell must not have to sign
  anything. The firm's own act must suffice. (W8.2)
- **Replayable.** A cell's log must still say, for every admitted act,
  what the cell relied on, so a replay reaches the same verdict. (C-1)
- **Audit.** Each cell where the key had acted must seal the revocation
  and apply R-REV-3's effects, so "where did it act after 09:00" has an
  answer in the logs. (W8.3, W8.6)
- **Remove only.** The mechanism can only take authority away. It can
  never grant, and so can never become a control plane. (C-6)
- **The ordinary case stays ordinary.** Revoking a family member from two
  cells by two acts (W5.10) must keep working with no new machinery.

### Four mechanisms against them

| Mechanism | Timeliness | Scale | No signer per cell | Replayable | Audit | Remove only |
|---|---|---|---|---|---|---|
| **A. A proposal or roster act per cell** (today) | hours; fails | wakes every cell; fails | fails | yes | yes | yes |
| **B. Fan-out push:** the firm's signed revocation object is delivered to every cell in the collection (Queues), and each cell seals it as a system entry | minutes, eventually | wakes every cell, including idle ones; fails W8.5 | yes | yes | yes | yes |
| **C. Short-lived mandates:** every mandate carries an expiry of, say, fifteen minutes; the representative re-presents a fresh one with each act; the firm stops issuing | the window is the lifetime; nothing to deliver | free; idle cells pay nothing | yes | yes: the mandate is in the log | no: a cell sees an expiry, not a compromise, so R-REV-3 does not run | yes |
| **D. A deployment revocation list** consulted at admission for delegated and mandated acts, with the signed revocation object itself as the entry, and the receipt recording the list version consulted | seconds to a minute | one read per delegated admission, cacheable; idle cells pay nothing | yes | yes, if the receipt records what was consulted, as it records the clock | the cell seals the object the first time it sees it, then applies R-REV-3 | yes |

**Judgement: C and D together, with B targeted.**

- **D is the fast stop.** It is the one new deployment fact a cell may
  consult at admission under C-1, beside the clock and the registry. It is
  infrastructure, not a Room. The authority is still the firm's: the list
  carries the firm's signed revocation object, and the cell verifies that
  signature against the firm's key pinned in its own roster before
  sealing it. The list is a transport. A forged entry fails verification
  in every cell. [Judgement]
- **C bounds the damage when D is unavailable.** If the list cannot be
  read, delegated and mandated acts are refused (fail closed) for at most
  the mandate lifetime, and direct member acts are unaffected. The
  lifetime is a pack setting. [Judgement]
- **B, targeted, does the audit work.** The firm's own Room knows which
  cells each representative was assigned to, because issuing the mandate
  was an act there. A push to that list, not to the whole collection,
  makes each such cell seal the revocation and run R-REV-3 even if the key
  never tries to act there again. Cells the key never touched are not
  woken. [Judgement]
- **A stays as it is** for the ordinary case. [Source]

What D changes in the contract, stated so it can be refused if too much:
one more input to admission for delegated acts (R-ADM-3 case b, and the
mandate case `d50ce26d` will add), one more field in the receipt's
`Authority`, one new system entry kind for a sealed revocation received
from the list, and a deployment component beside the registry.
[Judgement]

**Untested.** The read cost of D at admission in a Durable Object, the
propagation time of the list across a deployment, and whether a KV-backed
list's propagation (about a minute) or a Durable Object-backed list's
strong consistency is the right trade. A spike would measure these.

## 6. Requirements

Each is traced to the step that produced it and stated so that a test can
show it holds. "Must" is a requirement; "may" is a permission.

**Genesis and the registry (G1)**

- **REQ-1.** A genesis may carry coordinates: `customer`, `service` and
  `firm`, each a member handle or a stable external identifier, and each
  may be absent. (W4.3, W7.1)
- **REQ-2.** The registry indexes rooms by each coordinate and answers
  "rooms with this customer", "rooms with this service" and "rooms with
  this firm" without reading any room. (W2.7, W4.13)
- **REQ-3.** No Room's log lists the rooms of a collection. (C-4; W2.7)
- **REQ-4.** A founding under an onboarding grant may be restricted by
  the grant to a firm and a set of services, so the firm can found cells
  for its own services and no others. (W4.3)

**Identity (G2, owned by `d50ce26d`; stated here so the two notes agree)**

- **REQ-5.** A cell verifies a mandate against a key pinned in its own
  roster, and never by reading the firm's Room. (C-1; W4.4)
- **REQ-6.** A representative can be replaced under the firm's authority
  without releasing the lane, and the lane's generation, carried
  evidence and workspace survive. (W4.9)
- **REQ-7.** A receipt for a mandated act names the grantor, the mandate
  and the performer. (W4.4)
- **REQ-8.** Two firms' representatives in one cell act under two
  independent mandates, and neither can act under the other's. (W6.3)
- **REQ-9.** A roster shared by several cells is carried into each as a
  signed snapshot with a digest, and a later snapshot is a roster act in
  each cell. (W2.2, W3.5)

**Functionality (G6)**

- **REQ-10.** Every `policy-activated` event names the pack's digest and,
  where the pack came from a catalogue, the catalogue's room ID and the
  act ID that published that version. (W2.3, W9.5)
- **REQ-11.** A pack version in a catalogue changes no cell. (C-2; W9.1)
- **REQ-12.** A cell takes a new pack version only by a landing in that
  cell under its current policy. (C-3; W9.3)
- **REQ-13.** A `notify` rule may name a catalogue's publication as the
  event, and the notified member is a member of the cell. (W9.2)
  [Untested: the wake design is not landed]
- **REQ-14.** A cell on an older pack version is reported, not corrected.
  (W9.4)

**Carried objects (G5)**

- **REQ-15.** A carried object names its source room ID, source act ID
  and content digest in one standard form, in the act that carries it.
  (W4.11, W4.15, W5.5, W6.7, W7.3')
- **REQ-16.** A cell admits a carried object on the carrier's authority
  only. The source room's authority is not consulted and not implied.
  (C-1; W4.11)
- **REQ-17.** A reader can tell a carried object from an act of the cell
  by the record alone. (W5.3)

**Reporting (G4)**

- **REQ-18.** A pack may define a KPI as an expression over the cell's
  acts, under the policy evaluator's profile and budget. (W10.1)
- **REQ-19.** The cell seals a KPI fact as a system entry naming the room
  ID, the act ID that produced it and the pack digest that defined it.
  (W10.2)
- **REQ-20.** An SLA is an obligation with a deadline, and its breach is
  an attention item in the cell before it is a fact anywhere else.
  (W10.1)
- **REQ-21.** The exporter sends facts and never content. (W10.3)
- **REQ-22.** A roll-up can be computed at any past head of a grouping
  Room. (W10.5)
- **REQ-23.** A grouping Room's roster decides who may read its aggregate;
  a cell's roster decides who may read inside the cell; the reporting
  layer holds nothing the cell's roster would refuse. (W10.6)
- **REQ-24.** Drill-in from a fact reaches the cell through the cell's
  own read API with the viewer's credential. (W10.6)

**Revocation (G3)**

- **REQ-25.** A firm's revocation of a key stops that key's delegated and
  mandated acts in every cell within one minute of the list accepting it,
  measured at admission. (W8.2) [Untested]
- **REQ-26.** No member of a cell signs anything for REQ-25 to hold.
  (W8.2)
- **REQ-27.** A cell the key never acted in does no work for REQ-25.
  (W8.5)
- **REQ-28.** A receipt for a delegated or mandated act records the
  revocation list version consulted. (C-1; W8.6)
- **REQ-29.** A replay of the cell's log with the recorded list versions
  reaches the same verdicts. (C-1)
- **REQ-30.** The list carries the firm's signed revocation object, and a
  cell verifies its signature against the firm's key pinned in the cell
  before sealing it. (W8.2)
- **REQ-31.** A cell seals a received revocation as a system entry the
  first time it consults it, and then applies R-REV-3. (W8.3)
- **REQ-32.** The firm's Room records each mandate it issues with the cell
  it was issued for, so the firm can name the cells to push to. (W8.3)
- **REQ-33.** A targeted push reaches those cells and no others. (W8.3,
  W8.5)
- **REQ-34.** A mandate carries an expiry, with the lifetime set by the
  pack. (section 5, C)
- **REQ-35.** When the list is unavailable, delegated and mandated acts
  are refused with a named reason and direct member acts are unaffected.
  (section 5, C)
- **REQ-36.** The list can only remove authority. No entry on it grants
  anything. (C-6)
- **REQ-37.** A revocation by a member in one cell (R-REV-3) continues to
  work unchanged. (W5.10)

**Visibility (G7)**

- **REQ-38.** A sale with private bids is expressed as one cell per
  private relationship, and the decision is carried into each with
  provenance. (W7.3')
- **REQ-39.** The note that decides whether Artroom gains per-audience
  visibility inside a Room cites W7 as its motivating case. (section 7)

**Discipline**

- **REQ-40.** Any proposed control relation that puts something in a cell
  other than a pinned key, a pinned digest, a carried object with
  provenance or a sealed revocation is refused at design review with
  that reason. (section 3)
- **REQ-41.** Every requirement above that is marked [Untested] gets a
  spike before it is adopted. (section 5)

## 7. What this note does not decide

- **Per-audience visibility inside one Room** (G7). The sale shows Artroom
  does not have it. Whether to add it, or to accept one cell per private
  relationship, is a platform question with a cost on both sides.
- **The mandate's shape, and whether a team may hold a key** (G2).
  Request `d50ce26d` owns these, and REQ-5 to REQ-9 are the constraints
  this note places on its answer.
- **The facts store.** R2 Iceberg with R2 SQL, Analytics Engine, or a tree
  of aggregator Durable Objects for the alert path. REQ-18 to REQ-24 hold
  for any of them.
- **The list's backing store.** KV or a Durable Object. REQ-25 is the
  measure.
- **Room succession.** A registry binding never moves (R-GEN-13, open
  point 37). W6.5 shows changing contractors does not need it. A
  firm acquired by another firm might, and is out of scope.
- **Cross-Room obligations.** A portfolio Room that requires evidence from
  cells before it lands. Nothing above needs it, and C-1 makes it a carry
  by a member of both, which may be enough.
- **Whether the coordinates should be handles or external identifiers**,
  and who may assert that two handles are the same customer.

## 8. Sources

- `docs/protocol.md` on `main` at `bd520fb9`: rules cited by number.
- `packages/contract/src/roster.ts` (`Genesis`) and
  `packages/contract/src/transports.ts` (`RoomDraft`) at the same head.
- `notes/2026-10-01-pi-durable.md`: the spike's criteria and results.
- `notes/2026-10-01-jam-room.md` on `request/jam-room-note`, revision 3.
- `notes/2026-10-01-wake-and-schedule.md` on `request/wake-and-schedule`,
  revision 2, not landed.
- `docs/policy-pack.md`: the starter pack.
- dap, `~/play/dap` on `main`: `notes/2026-09-20-direction-and-next-steps.md`
  (§1, §2, §4, §5, §6), `notes/2026-09-15-sale-as-experienced.md`,
  `notes/2026-09-22-technology-spikes-plan.md` (T3 to T7).
- Workroom: requests `d50ce26d`, `1ebda917`, `a13a0bf5`, `f12cef6b`,
  `da2737b2`, `24711ceb`; assert `d8e11208`.
