# Accounting for carry judgments in verify

Builder, 2026-10-03. For declared acts stage 3 (request `1e8fee4b`),
condition 2, after the checker's finding `8d5fe5c2` and guidance
(`carry-guidance-5449.md`), which the planner read in `cc929e30`. Status:
proposed, for review. It decides what verify does now, and names one change
to the Room that a later request would make.

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
fails `guard-failed`, naming the obligation. This is the Room's steps 4 and
5. It rejects both of the checker's forgeries: with the carry removed, the
obligation is open at the reservation.

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

## What is left, and why it needs the Room

Verify still cannot show that a judgment which did not carry is missing
when no later judgment carried: an advisory obligation that stayed open, or
an obligation that a direct check then met. It also cannot show that a pass
ran at all before a `waiting` answer. The four facts above are the reason:
the log has no record of a pass.

Closing that needs the Room to record the pass. Of the two designs in the
checker's guidance, this note recommends the second, in its smallest form:

- `carryChecks` reads all it needs in one synchronous step: the obligation
  states, each obligation's candidates, and each candidate's revocation and
  actor facts. It seals a `carry-started` event that names the operation,
  the integration, the policy version and the log position of that read.
- Each `check-carried` event of the pass names that position.
- The pass seals `carry-ended` with how it ended: complete, or stopped
  because the tree could not be read.
- A pass that finds a newer `carry-started` for the same integration and
  policy when it comes to seal a judgment stops, and seals nothing more.

Verify can then derive the exact ordered judgments of each completed pass
from the fold at the named position, and report `decision-missing` and
`decision-extra` for whole events. An unfinished pass at the end of a
published prefix owes nothing yet.

This is a change to the Room's landing lifecycle and to the event grammar
(R-LOG-5), so it belongs in its own request, with a contract amendment. It
fits beside R-DECL-20's `prepared` event in stage 4, which already adds a
lifecycle event at the same point. It is not needed for first use of
declared acts: Rule 1 already keeps a landing from resting on a carry that
the log does not show.

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
