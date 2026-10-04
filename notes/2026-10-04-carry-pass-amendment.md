# Proposed contract amendment: carry passes are recorded

Builder, 2026-10-04. Draft 2, for planning review. It answers the
planner's review of draft 1 (`85032553`, attachment
`2026-10-04-carry-pass-planner-review.md`), points A to F, and keeps all
ten acceptance cases. It is not adopted, and nothing here is built. It
closes what [2026-10-03-carry-accounting.md](2026-10-03-carry-accounting.md)
leaves open under declared acts stage 3, condition 2 (request `1e8fee4b`):
verify cannot yet tell that a carry judgment is missing unless a later
judgment carried or a reservation followed.

Proposed place: docs/protocol.md section 35, contract amendment 8,
"Carry-pass accounting", with rules R-CARRY-17 to R-CARRY-19. The number
is checked against the head it is written into.

## What it must give

For every time the Room judges carrying for a landing, a reader of the log
can derive which judgments were owed, in order, and can tell a missing one
from one that was never owed. This must hold when two passes overlap, when
a pass ends early, when facts move while a rule is evaluated, when the
published log ends inside a pass, and when someone removes a whole pass
and reseals the log.

## Answers to the review, in short

| Point | Answer |
|---|---|
| A. Enforcement cannot begin at the first pass event | It begins at a `lifecycle` event of its own (R-CARRY-17), which the Room seals once. A log without it makes no pass claim, and verify says so as a limit, never as a pass |
| B. The owed order and the fact positions | The order is fixed at the start of the pass. Each judgment's actor and revocation facts are read at its own seal. A direct check that arrives during a pass does not shorten it |
| C. A pass identity must carry its producer fence | A pass belongs to one preparation: the `prepared` event it names, and one policy version. It may seal only while that preparation is current |
| D. Closing a pass | Two recorded ends, `complete` and `no-tree`, each with one legal place. Every other end is derived from an event the log already has. Jobs are not in the log; the barriers verify reads are the admitted check and the landing's own events |
| E. Previews and recovery | A preview's preparation owes no pass. A recovery landing owes none either, by a checked exemption |
| F. Scope and owners | Section 35, amendment 8. Stage 4 (`48c021ea`) owns the Room's side with `prepared`; stage 3 (`1e8fee4b`) keeps the verifier and the outcome |

## The rules

**R-CARRY-17. The landing lifecycle version is recorded.**

1. A `lifecycle` system event names the landing lifecycle the Room follows
   from that position: `{ type: "lifecycle", version: 2 }`. Version 2 means
   that the Room seals `prepared` events (R-DECL-20) and records carry
   passes (R-CARRY-18, R-CARRY-19). A log with no `lifecycle` event is
   version 1: neither is recorded.
2. A room founded by a Room that follows version 2 seals the event in the
   founding transaction, after genesis and the first `policy-activated`.
   An older room seals it once, in the first transaction that seals
   anything after the Room is upgraded, and before that entry.
3. The version never goes down, and the event is sealed once per version.
   A second event with the same or a lower version is `guard-failed`.
4. The rules of version 2 apply to every landing whose land act is
   admitted after the event. A landing admitted before it finishes under
   version 1.
5. A `prepared`, `carry-started` or `carry-ended` event at a position where
   the lifecycle version is 1 is `guard-failed`. So these events cannot
   appear without the claim that makes their absence detectable.
6. This is not a steps version (R-DECL-14). It changes no binding and
   needs no new grant: it changes what the Room records, not what an act
   means.

**R-CARRY-18. A carry pass is recorded.**

1. A carry pass is one run of the carry judgments of R-CARRY-13 for one
   preparation of one landing operation under one policy version. The
   preparation is named by its `prepared` event (R-DECL-20), whose owner is
   the operation.
2. The Room starts a pass by sealing `carry-started` in one transaction
   with these reads, and no await between them: the obligations of the
   generation, in order, and whether each is met on the integration; for
   each check obligation that is not met and has a checker configuration
   under the pass's policy version, the earlier passing checks of that
   obligation and checker on the thread, on another integration, newest
   first; and, for each of those checks, whether a judgment already exists
   for the integration and policy version. The event names the operation,
   the `prepared` event, the policy version, and a pass number that rises
   by one for each pass of the operation and is stored with the operation.
   It lists none of what was read: a reader derives it from the log at the
   event's position.
3. **The owed order** is fixed there: obligations in the generation's
   order; within an obligation, checks newest first, leaving out a check
   already judged at the start; the obligation's remaining checks are not
   owed once one of its judgments in this pass carries. A check that was
   already judged is accounted for by its earlier event, which verify
   finds and checks as it checks any `check-carried` event.
4. **Each judgment's facts** are those at its own seal: the checker's role
   and teams, and whether the earlier check is revoked or retired. The
   Room reads them again in the sealing transaction; if they differ from
   what was evaluated, it judges that check again. It does this at most
   three times for one check, then ends the pass as in step 7. Everything
   else a judgment reads is fixed by what the pass names: the policy
   version, the generation, the integration, its tree and snapshot.
5. **A direct check that arrives during a pass** does not change what the
   pass owes. The order was fixed at the start, and the remaining
   judgments of that obligation are still sealed. They are history; the
   obligation is met by the check either way.
6. Each `check-carried` event names its pass. The Room seals one only if,
   in the same transaction, the pass is open and current: it has no end,
   no later `carry-started` exists for the operation, the `prepared` event
   it names is the operation's latest, the active policy version is the
   pass's, and the operation is still being prepared.
7. A pass has two recorded ends, each a `carry-ended` event that names the
   pass:
   - `complete`: every judgment of step 3 is sealed. A pass that owes none
     starts and completes with no judgment between.
   - `no-tree`: the integration's tree could not be read. The Room reads
     the tree after `carry-started` and before the first judgment, so this
     end is legal only for a pass with no judgment.
   A pass that gives up after step 4's three tries seals nothing more and
   is ended by the next `carry-started`, which the engine owes at once.
8. **Every other end is derived, with no event of its own.** A pass is
   closed at the first of these after its start: a `carry-started` with a
   higher pass number for the same operation; a `prepared` event for the
   same operation; a `policy-activated` event; a `land-reserved` or
   `land-outcome` event for the operation. A worker that is still waiting
   on Git need not return for the pass to be closed. A `check-carried` or
   `carry-ended` event that names a closed pass is `decision-extra`.

**R-CARRY-19. A pass is owed by preparation.**

1. For a landing operation that is not on a recovery thread, after its
   `prepared` event and after each `policy-activated` event while it is
   being prepared, the Room seals a `carry-started` for that preparation
   and policy before any of these for the operation: an admitted `check`
   act that names the operation and the integration (R-DECL-20); a
   `land-evaluated` event; a `land-reserved` event.
2. An admitted check that names the operation requires that the latest
   pass of that preparation and policy has ended `complete` or `no-tree`.
   A `land-evaluated` or `land-reserved` event requires that it ended
   `complete`.
3. A `land-evaluated` event names the pass it rests on.
4. A preview's `prepared` event (its owner is a preview) owes no pass. A
   check made for a preview and later used as an earlier check of a
   landing is judged in the landing's pass, as any earlier check is.
5. A landing on a recovery thread owes no pass, no carry and no
   `land-evaluated` event (R-ADMIN-8, R-DECL-21). Verify applies this
   exemption by the thread's kind, and a `carry-started` for such an
   operation is `decision-extra`.

**Amends** R-LOG-5 (the system events gain `lifecycle`, `carry-started`
and `carry-ended`); R-DECL-2 (those three names are reserved); R-CARRY-13
(a `check-carried` event names its pass, under lifecycle version 2);
R-LAND-4, steps 2 and 3 (a pass before the checks are requested; a
`land-evaluated` event names its pass); R-LOG-10 (below). New contract
types: `LifecycleEvent`, `CarryStartedEvent`, `CarryEndedEvent`, and the
`pass` field of two existing events.

## Verify (R-LOG-10)

Under lifecycle version 1, verify does what it does today, with the three
rules of the earlier note, and its report says: "this log does not record
carry passes; a carry judgment that did not carry may be missing". That is
a stated limit of the log, in the list of what verify could not prove. A
caller that needs pass accounting requires version 2 of the report.

From a `lifecycle` event of version 2, for landings admitted after it:

- For each `carry-started`, verify derives the owed order of R-CARRY-18
  step 3 from the fold at that position, with the evaluator calls, inputs
  and meter each judgment needs.
- A pass that ends `complete` with an owed judgment not sealed in it, in
  order: `decision-missing`, naming the check.
- A `check-carried` event of a pass that the pass does not owe, or out of
  order, or after the pass is closed or ended: `decision-extra`.
- A judgment's context is rebuilt at its own position, as today; a
  difference is `context-mismatch`.
- A pass that ends `no-tree` with a judgment in it: `guard-failed`. Verify
  cannot show that the tree was unreadable; it reports the pass as ended
  by the Room's statement, as a limit.
- A `prepared` event of a landing, or a `policy-activated` event during
  its preparation, followed by an admitted check that names the operation,
  a `land-evaluated` or a `land-reserved` event, with no `carry-started`
  for that preparation and policy between: `decision-missing`, naming the
  operation. This is what detects a whole pass removed, the first and only
  one included: what makes the pass owed is the `prepared` event and the
  lifecycle version, not the pass.
- R-CARRY-19 step 2 not met: `guard-failed`.
- A pass with no end and no closing event at the end of the published log
  is pending. Verify passes, reports it as unfinished, and checks that its
  sealed judgments are a prefix of the owed order.
- A `lifecycle` event removed from a log that keeps `prepared` or pass
  events fails by R-CARRY-17 step 5. A log with the event and every later
  `prepared` and pass event removed is a version 1 log, and is reported as
  one: its limit is stated, not passed over. A reader who holds an earlier
  published head of the room sees the rewriting, as for any rewritten
  history (R-LOG-8).

**What verify still cannot prove, and says so:** that the Room issued or
did not issue a check job, since jobs are not in the log; that a tree was
unreadable; and anything about a version 1 log's missing judgments.

## Acceptance cases

All ten of draft 1 stay, with the corrected boundaries, and three are
added for point A and point E.

| Case | Expected result |
|---|---|
| A pass with two obligations, the first carried by its second-newest check | Events in order: started; not carried (newest); carried; the second obligation's judgments; ended `complete`. Verify passes |
| The same, with one `check-carried` event that did not carry removed and the log resealed | `decision-missing` at the pass's end, naming the check |
| The whole pass removed, start to end, and resealed, with the land input changed to match: the first and only pass of the log, and a middle pass | `decision-missing` at the next check, `land-evaluated` or `land-reserved` of the operation, naming the operation. Never a fall back to version 1 |
| An advisory obligation whose only earlier check does not carry | One judgment, not carried, in a complete pass; with it removed, `decision-missing` |
| Two overlapping passes | The first is closed by the second's start, with a prefix of its judgments; the second ends `complete`. Verify passes. A judgment of the first sealed after the second started: `decision-extra` |
| The tree cannot be read | Ended `no-tree` with no judgment; a check may follow; no `land-evaluated` rests on it; verify passes and states the limit |
| A fact moves during a rule evaluation | The judgment is sealed once, on the later facts; verify rebuilds the same context. After three moves the pass seals nothing more and a new pass follows |
| The published log ends inside a pass | Verify passes and reports the pass as unfinished. An operation that has a `land-outcome` has no unfinished pass |
| A `check-carried` event that names a pass which has ended or is closed, including by an activation, a new preparation or the operation's outcome | `decision-extra` |
| A log from before the amendment | Verifies as it does today, and its report states the version 1 limit |
| The `lifecycle` event removed, `prepared` and pass events kept | `guard-failed` at the first of them |
| A preview's `prepared` event with checks and no pass | Verifies |
| A recovery landing under version 2 | No pass, no `land-evaluated`; verifies. A `carry-started` for it is `decision-extra` |

Focused controls, as the review groups them: the lifecycle event with
whole-pass removal; ordered completion and the two recorded ends; closure
by a new pass, a new preparation, an activation and an outcome, across a
restart; context at the seal, with version 1, preview and recovery logs.
The held-evaluation tests the Room already has (`acts.test.ts`: "a carry
judgment is sealed only on the facts ...", "a carry pass ends when its
obligation is gone ...", "an activation that overtakes a carry pass ...")
are reused where their meaning still fits.

## What it costs

One `lifecycle` event per room. Two events per pass, and one pass per
preparation and per activation during it, also when nothing is owed. The
cost in rows is measured with the `prepared` event's, under request
`92ddf4cc`, for empty passes, overlap, the two ends and a restart.

## Owners and order

1. This draft reviewed; when accepted, numbered and written into the
   protocol by the planner.
2. Stage 4 (`48c021ea`, promise `8d497ff5`) builds the Room's side: the
   `lifecycle` and `prepared` events, the pass, and the check of step 6.
   Its condition 3 already asks for a working consumer before the Room
   emits new facts.
3. Stage 3 (`1e8fee4b`, promise `3af8ebc7`) builds verify's rules and the
   acceptance cases, at one head with stage 4's events and contract types.
4. An independent review of that head, bound to both requests, and its
   landing, are what record condition 2 as met for carry judgments. Stage
   3's other outcomes stay as they are assessed.

This amendment is not a gate for the first jam task.

## Left open for the reviewer

- **Three tries** in R-CARRY-18 step 4 is a bound chosen for this draft.
  Any small fixed number serves; the point is that a pass cannot loop.
- **`land-evaluated` after `no-tree`.** Step 2 of R-CARRY-19 forbids it.
  The alternative is to allow it when every obligation is met by checks on
  the integration, since then nothing could have been carried. This draft
  takes the stricter rule, because a tree that cannot be read is a sign
  that the integration should be prepared again.
- **The engine's attempt number** (R-LAND-5's `attempts`) is not in the
  pass. The `prepared` event stands for the attempt, because a new attempt
  builds a new integration and seals a new `prepared`. If two attempts can
  share one `prepared` event, the attempt number must be added.
