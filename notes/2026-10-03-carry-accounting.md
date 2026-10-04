# Accounting for carry judgments in verify

Builder, 2026-10-03. For declared acts stage 3 (request `1e8fee4b`),
condition 2, after the checker's finding `8d5fe5c2` and guidance
(`carry-guidance-5449.md`), which the planner read in `cc929e30`. Status:
proposed, for review; revised after the checker's and the planner's first
reading (`060828bb` and the replies). It decides what verify does now, one
fence the Room gains now, and the shape of the amendment that complete
accounting needs.

## The problem

When a landing's integration is ready, the Room judges whether each open
check obligation can be met by an earlier passing check on another
integration. It seals every judgment, carried or not, as a `check-carried`
event (R-CARRY-6 to 14). Verify replays each `check-carried` event it is
given. It does not ask whether an event is missing.

The checker showed two forged logs that verify accepts. Each removes a
whole `check-carried` event that carried, changes the later land input to
say the obligation is not met, and reseals. One has a `prepared` event for
the landing and one does not.

## What the Room does

`RoomCore.readiness` (packages/room/src/core.ts) runs for a landing
operation on a built integration. In order, it:

1. returns early if the version is blocked or a recomputation is due;
2. reads the active policy;
3. awaits `carryChecks`;
4. returns `retry` if a review obligation is open;
5. returns `waiting` if a blocking check obligation is not met;
6. evaluates the land rules at stage `reservation` and seals
   `land-evaluated`, unless the thread is a recovery thread.

`carryChecks` reads every obligation's state once. Then, for each check
obligation that is not met and has a checker configuration, it lists the
earlier passing checks of that obligation and checker on the thread, on
another integration, newest first. It judges each one that has no judgment
yet for this integration and policy version, and stops at the first that
carries. A judgment is keyed by thread, generation, integration,
obligation, check act and policy version. The key does not name the
operation.

Four facts limit what a reader of the log can know:

- **Nothing in the log says when a pass started or ended.** The landing
  engine may call `readiness` again while an earlier call is still waiting
  on Git, and it discards only the earlier call's final answer. Judgments
  the earlier call sealed stay.
- **A pass reads its facts at different times.** The obligation states are
  read once. Each obligation's candidates are read before that obligation's
  Git reads. Revocation and teams are read per candidate.
- **A pass can end early.** If the integration's tree cannot be read,
  `carryChecks` returns without judging, and `readiness` goes on.
- **Two passes can overlap.** One carries the newest check. The other read
  the obligation as open, finds the newest already judged, and judges an
  older one. So a second judgment that carries is legitimate.

So a rule of the form "after event X, exactly these judgments follow" would
reject honest logs.

## What an omission can do

A judgment that carried, removed: the obligation is no longer met on that
integration. The landing cannot then reach its reservation, because step 5
would have answered `waiting`. A log that shows the reservation anyway is
false.

A judgment that did not carry, removed: no evidence is gained. An older
check that carries is still judged on its own conditions. The record is
less complete, but no landing is admitted that should not be.

A judgment added: verify already replays it, and rejects one that names a
check that is not eligible or an outcome the policy does not give.

So the omission that matters for what landed is the first kind, and it is
detectable from the log as it is.

## Decision: what verify does now

Three rules, all derived from the log with no change to the Room. The
first uses one boundary the log does record: a `land-evaluated` event shows
that a `readiness` call for that operation, integration and active policy
reached step 6, so its steps 3 to 5 ran before it.

**Rule 1: no reservation with an open obligation.** At a `land-evaluated`
event, every blocking obligation of the version is met in the fold on that
integration under the active policy: reviews, checks on the integration,
and carries whose events are present and count. If one is not, the event
fails. The failure is `decision-missing`, naming the check, when an earlier
passing check of that obligation has no carry judgment for the integration:
the room owed that judgment before it could evaluate the landing. Otherwise
it is `guard-failed`, naming the obligation. This is the Room's steps 4 and
5. It rejects both of the checker's forgeries: with the carry removed, the
obligation is open at the reservation. An obligation the log cannot decide
(a check on a filtered snapshot with no `prepared` event) is left to the
limit verify already reports.

**Rule 2: nothing skipped on the way to a carry.** At a `check-carried`
event that carried: every earlier passing check of the same obligation and
checker on the thread that is newer than the carried one, and was admitted
before the land act of the operation the event names, already has its own
`check-carried` event for the same integration and policy. If one has none,
the event fails `decision-missing`, naming the check. This holds for every
honest log: the pass went newest first and sealed each judgment before the
next, and every such check was visible to it. Overlapping passes keep the
rule, because a pass skips only checks that are already judged. Checks
admitted after that land act are left out, because the pass may have listed
its candidates before they arrived. This rule needs no boundary.

**Rule 3: one judgment per key.** A second `check-carried` event with the
same key fails `decision-extra`. Verify does this today.

Verify's statement of what it cannot prove changes to say exactly what is
left, below.

## The Room must fence what it seals

Rule 1, and the context comparison verify already makes, both read the fold
at the event's own position. The Room builds a land input, awaits the
policy evaluation, and then seals `land-evaluated`. An act admitted during
that wait, such as a revocation that reopens an obligation, comes before
the event in the log. The event then records an input that the fold at its
position no longer gives. Verify would fail that honest log today with
`context-mismatch`, and with Rule 1 as well. The same is true of a
`check-carried` event: its facts are read before the policy evaluation and
only the judged key is checked again at the seal. The checker and the
planner pointed this out from the source (`060828bb`), with no failing run
at that time. It was then reproduced for the carry event: with the
checker's key revoked while the carry rules were evaluated, the Room sealed
a "carried" event after the revocation. That run is now a test.

The decision: an event that records a judgment is sealed only if the facts
it was judged on still hold at the seal.

- **`land-evaluated`.** In the transaction that seals it, the Room builds
  the land input again from the state as it is, under the policy now
  active. If its digest or the policy version differs from what was
  evaluated, nothing is sealed, and the readiness is worked out again from
  the start.
- **`check-carried`.** In the transaction that seals it, the Room builds
  the carry input and its facts again. If they differ from what was judged,
  nothing is sealed, and that check is judged again.

Which facts are fenced, and which stay as they were read, follows from
what each event names and from where verify reads each fact.

| Fact | `land-evaluated` | `check-carried` |
|---|---|---|
| The policy version | Not named in the event. Verify uses the version active at the event's position. Fenced: the event is sealed only under the version that was evaluated. A kept evaluation is used again only under the version that made it | Named in the event. Verify reads the document, the checker configuration, the pinned runner and the owners from the named version, wherever the event is, and accepts an event that names an earlier version. The Room does not rely on that: a pass ends, sealing nothing more, once another version is active, because the operation is prepared again under it (R-LAND-5) |
| Whether the obligation is still the version's | The obligations are part of the land input: fenced | Read again at the seal. After a recomputation has changed or removed the obligation, or its checker, the pass ends. Verify judges the event against the version's obligations as the log gives them at the event's position, and would call it extra |
| The lane and generation | Named through the operation. Their head and changed paths do not change. The obligations' states and the reviews are part of the land input, so they are fenced with it | Named in the event. Pinned by name. A newer generation does not stop the seal; the judgment is of the generation it names |
| The integration, its tree and snapshot | Named. A commit does not change | Named. A commit does not change |
| Whether the evidence is revoked or retired | Part of the land input: fenced | Read at the event's position by verify: fenced |
| The acting member's role and teams | The initiator's, part of the land input: fenced | The checker's, read at the event's position by verify: fenced |
| Whether the obligation is still open | Fenced, as part of the land input | Not fenced. A judgment of an obligation that a direct check met meanwhile is more history, and verify accepts it |
| Whether the check was already judged | | Checked again at the seal, as before |

A sealed `land-evaluated` event is then what verify takes it to be: an
evaluation of the state at its own position, with no blocking obligation
open. It is still not a reservation; `land-reserved` is. The engine's own
fence on the final answer is unchanged.

The checker then found two more places by the same reasoning, each with a
failing run (`7dabf862`, `29551590`). A kept land evaluation was looked up
by operation and input alone, so after an activation that changed only a
rule, the old passing answer was used again and the landing could reserve.
And a held carry judgment was sealed after a recomputation had removed its
obligation, which made an honest `v2` log fail verify. Both are repaired as
the table says. The first was in the Room before this note; the second is
the gap between "the facts that were judged" and "whether the judgment is
still owed".

One test in the Room holds a land evaluation open, admits a revocation that
reopens an obligation, lets the evaluation finish, and shows that no
`land-evaluated` event is sealed for the old input and that the published
log verifies.

## What is left, and why it needs the Room

Verify still cannot show that a judgment which did not carry is missing
when no later judgment carried: an advisory obligation that stayed open, or
an obligation that a direct check then met. It also cannot show that a pass
ran at all before a `waiting` answer. The four facts above are the reason:
the log has no record of a pass.

Closing that needs the Room to record the pass. Of the two designs in the
checker's guidance, this note recommends the second, in its smallest form:

- `carryChecks` reads all it needs in one synchronous step: the obligation
  states, each obligation's candidates, the judgments already sealed, and
  each candidate's revocation and actor facts. It seals a `carry-started`
  event that names the operation, the attempt, the integration, the policy
  version and the log position of that read.
- Each `check-carried` event of the pass names that pass.
- The pass seals `carry-ended` with how it ended: complete; stopped because
  the tree could not be read; superseded by a newer pass for the same
  thread, generation, integration and policy; or cancelled with its
  operation.

Verify can then derive the exact ordered judgments of each completed pass
from the fold at the named position, and report `decision-missing` and
`decision-extra` for whole events. An unfinished pass at the end of a
published prefix owes nothing yet.

The reviewers added a constraint that this note accepts: a pass marker
cannot be its own reason to exist. If the whole group of start, judgments
and end were removed and the log resealed, verify must still see that a
pass was owed. So the pass has to be required by something the log already
shows: the `prepared` event of R-DECL-20, which the Room seals when an
integration is ready and before it issues any job. The rule would be: each
`prepared` event of a landing is followed by a `carry-started` for that
operation and integration before any job is owed or any `land-evaluated`
for it is sealed.

This is a change to the Room's landing lifecycle and to the event grammar
(R-LOG-5). It needs a contract amendment, reviewed before it is built, and
it depends on the `prepared` event, which stage 4 delivers. The planner
has said that complete accounting stays owed under stage 3's condition 2
(`cc929e30`, and the replies to this note). This note does not move it. It
proposes the order: the three rules and the fence now; the amendment text
next, for review; the pass events with `prepared`.

## Tests

In `packages/log/test/declared-stage3.test.ts`, with the simulator:

- the honest log with a carry verifies;
- the carry event removed and the land input changed to match: fails at the
  `land-evaluated` event, `guard-failed`, naming the obligation (the
  checker's first forgery);
- the same with a `prepared` event for the landing (the second forgery);
- two earlier checks, the newer judged not carried and the older carried:
  verifies; with the newer's event removed: `decision-missing`;
- an advisory obligation left open at the reservation: verifies.

Each rule gets one control with `scripts/control.mjs`.
