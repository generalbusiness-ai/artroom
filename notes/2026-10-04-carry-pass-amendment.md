# Proposed contract amendment: carry passes are recorded

Builder, 2026-10-04. Proposed text for planning review. It is not adopted,
and nothing here is built. It closes what
[2026-10-03-carry-accounting.md](2026-10-03-carry-accounting.md) leaves
open under declared acts stage 3, condition 2 (request `1e8fee4b`): verify
cannot yet tell that a carry judgment which did not carry is missing. The
planner would number it and place it in docs/protocol.md.

## What it must give

For every time the Room judges carrying for a landing, a reader of the log
can derive which judgments were owed, in order, and can tell a missing one
from one that was never owed. This must hold when:

- two passes overlap, because the landing engine asks again before an
  earlier pass ends;
- a pass ends early, because the integration's tree cannot be read, the
  operation is cancelled, or a newer pass replaces it;
- facts move while a rule is evaluated;
- the published prefix ends in the middle of a pass;
- someone removes a whole pass from the log and reseals it.

The last is the hard one. A pass that announces itself can be removed with
its announcement. So the log must already show, by an event that other
rules depend on, that a pass was owed.

## The rules

**R-CARRY-17. A carry pass is recorded.**

1. A carry pass is one run of the carry judgments of R-CARRY-13 for one
   landing operation on one integration under one policy version.
2. Before it judges anything, the Room reads in one step, with no await:
   the obligations of the generation and whether each is met on the
   integration; for each check obligation that is not met and has a checker
   configuration, the earlier passing checks of that obligation and checker
   on the thread, on another integration, newest first; the judgments
   already sealed for the integration and policy version. In the same
   transaction it seals a `carry-started` system event. The event names the
   operation, the pass (a number that rises by one per pass of the
   operation), the lane and generation, the integration and the policy
   version. It does not list the obligations, the checks or the facts: a
   reader derives them from the log at the event's position.
3. Each `check-carried` event names its pass.
4. A judgment is sealed only if the facts it was judged on still hold in
   the sealing transaction. If they moved, nothing is sealed and that check
   is judged again within the pass. (The Room does this since `26872bac`.)
5. A pass seals judgments in the order of step 2: obligations in the
   generation's order, checks newest first, leaving out a check already
   judged, and stopping an obligation at the first check that carries.
6. A pass ends by sealing a `carry-ended` system event that names the
   operation and the pass, and how it ended:
   - `complete`: every judgment of step 5 is sealed;
   - `no-tree`: the integration's tree could not be read; no judgment is
     owed for the obligation it stopped at or for any after it;
   - `superseded`: a newer pass of the same lane, generation, integration
     and policy version has started; no further judgment is owed by this
     pass;
   - `cancelled`: the operation left preparation.
7. A pass seals nothing after its `carry-ended` event. A pass that finds a
   newer `carry-started` for its lane, generation, integration and policy
   version when it comes to seal ends as `superseded`.

**R-CARRY-18. A pass is owed by preparation.**

1. For a landing operation, after the `prepared` event of R-DECL-20 for an
   integration, the Room seals a `carry-started` event for that operation
   and integration before it issues any job for the integration, and before
   it seals a `land-evaluated` event for it.
2. After a policy activation, the same holds for the operations that go
   back to preparation under the new version (R-LAND-5): a `carry-started`
   under the new version comes before any job or `land-evaluated` event for
   that operation and integration.
3. A `land-evaluated` event names the last pass of its operation and
   integration that ended `complete` under the active policy version, and
   that pass has no `carry-started` of the same key after it.

**Amends R-LOG-5**: the system events gain `carry-started` and
`carry-ended`. **Amends R-CARRY-13**: a `check-carried` event names its
pass. **Amends R-LAND-4**, step 3: a `land-evaluated` event names its pass.

**R-LOG-10, verify.** For each `carry-started` event, verify derives the
ordered judgments of step 5 from the fold at the event's position. Then:

- a pass that ends `complete` with a derived judgment that has no
  `check-carried` event of that pass: `decision-missing`, naming the check;
- a `check-carried` event that names no started pass, or a pass that has
  ended, or a check the pass does not owe, or is out of order:
  `decision-extra`;
- a pass that ends `no-tree` or `superseded`: its sealed judgments must be
  a prefix of the derived order; nothing more is owed;
- a `prepared` event of a landing with a later job, check or
  `land-evaluated` event for that operation and integration and no
  `carry-started` between: `decision-missing`, naming the operation;
- a `land-evaluated` event that names no completed pass as R-CARRY-18
  requires: `guard-failed`;
- a pass with no `carry-ended` at the end of the published log owes nothing
  yet. Its sealed judgments must still be a prefix of the derived order.

A log from before this amendment has no pass events. Verify applies these
rules from the first `carry-started` event of a room, and to every
`prepared` event after it. Before that it applies the rules of the earlier
note, as today.

## Acceptance cases

| Case | Expected result |
|---|---|
| A pass with two obligations, the first carried by its second-newest check | Events in order: started; not carried (newest); carried; the second obligation's judgments; ended `complete`. Verify passes |
| The same, with one `check-carried` event that did not carry removed and the log resealed | `decision-missing`, naming the check |
| The whole pass removed, start to end, and resealed, with the land input changed to match | `decision-missing` at the first later event for the operation, naming the operation |
| An advisory obligation whose only earlier check does not carry | One `check-carried` event, not carried; with it removed, `decision-missing` |
| Two overlapping passes | The first ends `superseded` with a prefix of its judgments; the second ends `complete`. Verify passes. A judgment sealed by the first after the second started: `decision-extra` |
| The tree cannot be read | Ended `no-tree`; no `land-evaluated` names that pass; verify passes |
| A fact moves during a rule evaluation | The judgment is sealed once, on the later facts; verify rebuilds the same context |
| The published log ends inside a pass | Verify passes, and reports the pass as unfinished |
| A `check-carried` event that names a pass which had ended | `decision-extra` |
| A log from before the amendment | Verifies as it does today |

## What it costs

Two more system events per pass. A landing with no check obligation to
carry still has a pass, with no judgments: two events. The cost in rows is
to be measured with the `prepared` event's, under the row-writes baseline
(R-DECL-20, request `92ddf4cc`).

## Order of work

1. This text reviewed and numbered by the planner.
2. Built with the `prepared` event in declared acts stage 4 (request
   `48c021ea`), since R-CARRY-18 depends on it: contract types, the Room's
   pass, verify's rules, the acceptance cases as tests.
3. Stage 3's condition 2 is then met for carry judgments, and is recorded
   as met under request `1e8fee4b`.

## Open questions for review

- **The pass number.** A count per operation is the smallest thing that
  orders passes. The checker's guidance also names the attempt and the
  evaluation revision of the landing engine. Those could be recorded as
  well if a reader needs to tie a pass to an engine attempt; verify does
  not need them for the rules above.
- **`cancelled`.** An operation that leaves preparation while a pass is
  waiting on Git cannot always seal an end at that moment. The rule above
  lets the pass seal `cancelled` when it next runs. A room that stops
  before then leaves an unfinished pass, which verify treats as it treats
  the end of a published prefix. Is that acceptable for a pass that is not
  the last thing in the log? The alternative is that the event which moves
  the operation out of preparation ends its open pass by rule, with no
  event of its own.
- **Previews.** R-DECL-20 also seals `prepared` for a clean preview. A
  preview does not carry checks today. This text leaves previews out.
