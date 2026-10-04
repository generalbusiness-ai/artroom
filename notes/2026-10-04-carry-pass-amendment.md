# Proposed contract amendment: carry passes are recorded

Builder, 2026-10-04. Draft 3, for planning review. Draft 2 answered the
planner's review of draft 1 (`85032553`), points A to F. The review of
draft 2 (`794e6f86`, `plans/014-2026-10-04-carry-pass-draft2-review.md`)
accepted B, D, E and F with qualifications and asked for changes in A and
C. This draft makes them, takes the three decided choices, and keeps all
thirteen acceptance cases. It is not adopted, and nothing here is built. It
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
| A. Enforcement cannot begin at the first pass event | It begins at a `lifecycle` event of its own (R-CARRY-17), which the Room seals once. A log without it makes no pass claim, and verify says so as a limit, never as a pass. New in draft 3: no name is reserved, so no document that is valid today becomes invalid; a caller can require a lifecycle version, and a downgraded log never meets that requirement; the version of a landing is the one at its land act |
| B. The owed order and the fact positions | The order is fixed at the start of the pass. Each judgment's actor and revocation facts are read at its own seal. A direct check that arrives during a pass does not shorten it |
| C. A pass identity must carry its producer fence | New in draft 3: the Room records each preparation attempt when it starts, with a `preparation-started` event, and starts a pass in the same transaction that starts an evaluation. So the engine's attempt and evaluation both have a public counterpart, and a pass may seal only while it is the operation's current pass of the current attempt |
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
4. **The version of a landing is the version at its land act**, for the
   Room and for verify alike. A landing admitted before the event stays
   under version 1 until it ends, also while it is still being prepared
   after the upgrade: the Room seals no `preparation-started`, `prepared`
   or pass event for it, and R-CARRY-19 does not apply to it. A landing
   admitted after the event is under version 2 from its first preparation.
   A preview's version is the version at the act that made its version of
   the thread.
5. A `preparation-started`, `prepared`, `carry-started` or `carry-ended`
   event for a landing or preview that is under version 1 is
   `guard-failed`. So these events cannot appear without the claim that
   makes their absence detectable.
6. This is not a steps version (R-DECL-14). It changes no binding and
   needs no new grant: it changes what the Room records, not what an act
   means.
7. **No name becomes reserved.** `lifecycle`, `preparation-started`,
   `carry-started` and `carry-ended` are types of system event. A system
   event and an act are different types of entry (R-LOG-5), and a declared
   kind is a kind of act. So a document that declares a kind with one of
   these names is as valid as it was, its acts and bindings are what they
   were, and R-DECL-2 does not change. Draft 2 proposed to reserve the
   names; that would have made a valid document invalid with no recorded
   migration, and it is withdrawn.
8. **A reader that does not know a recorded version** stops at that
   `lifecycle` event with the limit `lifecycle-unsupported`, as it does
   for a steps version (R-DECL-14), and reports the log as verified only
   up to the entry before it. It never reads the rest as version 1.

**R-CARRY-18. A carry pass is recorded.**

1. **Attempts are recorded.** Each time the landing engine starts to
   prepare an operation, the first time and each time again (R-LAND-5),
   the Room seals a `preparation-started` event in the transaction that
   changes the operation's attempt: `{ op, attempt }`. The `prepared` event
   of R-DECL-20 names that attempt, so two preparations that build the
   same commit are still two preparations.
2. A carry pass is one run of the carry judgments of R-CARRY-13 for one
   evaluation of one attempt of one landing operation under one policy
   version. **A pass starts when an evaluation starts**: in the one
   transaction in which the engine starts an evaluation of a prepared
   operation, with no await in it, the Room makes these reads and seals
   `carry-started`. The reads: the obligations of the generation, in
   order, and whether each is met on the integration; for each check
   obligation that is not met and has a checker configuration under the
   pass's policy version, the earlier passing checks of that obligation
   and checker on the thread, on another integration, newest first; and,
   for each of those checks, whether a judgment already exists under the
   full key of R-CARRY-13: lane, generation, integration, obligation,
   earlier check and policy version. The event names the operation, the
   attempt, the `prepared` event, the policy version, and a pass number.
   The pass number rises by one for each pass of the operation and is
   stored with the operation, in that same transaction, as the operation's
   current pass. The event lists none of what was read: a reader derives
   it from the log at the event's position.
3. **The owed order** is fixed there: obligations in the generation's
   order; within an obligation, checks newest first, leaving out a check
   already judged at the start; the obligation's remaining checks are not
   owed once one of its judgments in this pass carries. A check that was
   already judged is accounted for by its earlier `check-carried` event
   under the same full key, which verify finds and checks as it checks
   any such event, a judgment that did not carry included. Nothing stands
   in for that event.
4. **Each judgment's facts** are those at its own seal: the checker's role
   and teams, and whether the earlier check is revoked or retired. The
   Room reads them again in the sealing transaction; if they differ from
   what was evaluated, it evaluates that check again. A check is evaluated
   at most three times in one pass, the first time included. After a third
   evaluation whose facts moved, the Room seals no judgment of that check,
   ends its work on the pass, and marks the operation's readiness as due
   in storage, so that the engine's ordinary retry starts a new evaluation,
   and with it a new pass, on a later turn. It does not start one in the
   same turn. Everything else a judgment reads is fixed by what the pass
   names: the policy version, the generation, the integration, its tree
   and snapshot.
5. **A direct check that arrives during a pass** does not change what the
   pass owes. The order was fixed at the start, and the remaining
   judgments of that obligation are still sealed. They are history; the
   obligation is met by the check either way.
6. **Who may seal.** Each `check-carried` and `carry-ended` event names
   its pass. The Room seals one only if, in the same transaction, the pass
   is the operation's current pass, the operation's attempt is the pass's
   attempt, the operation is being prepared, the active policy version is
   the pass's, and the pass has no end. A worker that returns from Git or
   from the policy after the engine has started another attempt, or
   another evaluation, finds that its pass is not the current one, or
   that its attempt is not, and seals nothing. This holds in the interval
   after a new attempt starts and before its integration is built: the
   attempt changed in the transaction that sealed `preparation-started`.
   After a restart the stored current pass and attempt are what they
   were; a worker from before the restart does not exist, and the engine's
   next evaluation starts a new pass.
7. A pass has two recorded ends, each a `carry-ended` event that names the
   pass:
   - `complete`: every judgment of step 3 is sealed. A pass that owes none
     starts and completes with no judgment between.
   - `no-tree`: the integration's tree could not be read. The Room reads
     the tree after `carry-started` and before the first judgment, so this
     end is legal only for a pass with no judgment.
8. **Every other end is derived, with no event of its own.** A pass is
   closed at the first of these after its start: a `carry-started` with a
   higher pass number for the same operation; a `preparation-started` for
   the same operation; a `policy-activated` event; a `land-reserved` or
   `land-outcome` event for the operation. Each of these is sealed in the
   transaction that takes the pass's ownership away in the Room, so the
   log shows the closure at the position where it happened. A worker that
   is still waiting need not return for the pass to be closed. A
   `check-carried` or `carry-ended` event that names a closed pass is
   `decision-extra`. A pass that is closed, or that ended `no-tree`, is
   never the pass a later check or land evaluation rests on.

**R-CARRY-19. A pass is owed by preparation.**

1. For a landing operation under lifecycle version 2 that is not on a
   recovery thread, after the `prepared` event of its current attempt and
   after each `policy-activated` event while it is being prepared, the
   Room seals a `carry-started` for that attempt and policy before any of
   these for the operation: an admitted `check`
   act that names the operation and the integration (R-DECL-20); a
   `land-evaluated` event; a `land-reserved` event.
2. An admitted check that names the operation requires that the latest
   pass of that attempt and policy has ended `complete` or `no-tree`. A
   `land-evaluated` or `land-reserved` event requires that it ended
   `complete` and is not closed. After `no-tree` the operation is prepared
   again or evaluated again; a direct check does not turn that pass into a
   completed one. The Room also issues no check job before the pass has
   ended; verify cannot see jobs, and says so.
3. A `land-evaluated` event names the pass it rests on.
4. A preview's `prepared` event (its owner is a preview) owes no pass. A
   check made for a preview and later used as an earlier check of a
   landing is judged in the landing's pass, as any earlier check is.
5. A landing on a recovery thread owes no pass, no carry and no
   `land-evaluated` event (R-ADMIN-8, R-DECL-21). Verify applies this
   exemption from what the log records of the thread under the vocabulary
   it was opened in: the purpose `config-recovery` of a legacy claim, or
   the platform kind `recover`. A legacy recovery thread that continues
   after a `v2` activation keeps the exemption. A `carry-started` for
   such an operation is `decision-extra`.

**Amends** R-LOG-5 (the system events gain `lifecycle`,
`preparation-started`, `carry-started` and `carry-ended`); R-DECL-20 (a
`prepared` event names its attempt; previews and landings under version 1
seal none of the new events); R-CARRY-13 (a `check-carried` event names
its pass, under lifecycle version 2); R-LAND-4, steps 1 to 3 (the attempt
is recorded when preparation starts; a pass before the checks are
requested; a `land-evaluated` event names its pass); R-LAND-5 (each
re-preparation seals `preparation-started`); R-LOG-10 (below). R-DECL-2
does not change. New contract types: `LifecycleEvent`,
`PreparationStartedEvent`, `CarryStartedEvent`, `CarryEndedEvent`, the
`attempt` field of `PreparedEvent`, and the `pass` field of two existing
events.

## Verify (R-LOG-10)

**The report and what a caller can require.** The report gains
`lifecycle`: the version the log records and the position of its event,
`{ version: 1, since: null }` for a log with none. It keeps
`carryAccounting`, which is `"partial"` under version 1 and `"complete"`
for the landings of a version 2 log. A caller states the guarantee it
needs with an option, `requireLifecycle: 2` (`--require-lifecycle 2` on
the command line). Verification of a log whose lifecycle is lower then
fails, with `lifecycle-below-required`, however the log came to be that
way. So a log from which the `lifecycle` event and everything that
depends on it were removed, and which was sealed again, is a version 1
log: it is reported as one, with its limit, and it never meets a
requirement of version 2. Nothing in such a log shows that it once
recorded more; a reader who holds an earlier published head sees the
rewriting, as for any rewritten history (R-LOG-8). This is the lifecycle
of the log, not a version of the report's format.

Under lifecycle version 1, verify does what it does today, with the three
rules of the earlier note, and its report states the limit that the
intermediate release already prints.

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
- A `check-carried` or `carry-ended` event whose pass is not the latest
  `carry-started` of its operation, or whose attempt is not the
  operation's latest `preparation-started`, or that follows a closing
  event of step 8: `decision-extra`. A `prepared` event that names an
  attempt other than the operation's latest, or a `carry-started` with no
  `prepared` event of its attempt: `guard-failed`.
- A `prepared` event of a landing, or a `policy-activated` event during
  its preparation, followed by an admitted check that names the operation,
  a `land-evaluated` or a `land-reserved` event, with no `carry-started`
  for that attempt and policy between: `decision-missing`, naming the
  operation. This is what detects a whole pass removed, the first and only
  one included: what makes the pass owed is the `prepared` event and the
  lifecycle version, not the pass.
- R-CARRY-19 step 2 not met: `guard-failed`.
- A pass with no end and no closing event at the end of the published log
  is pending. Verify passes, reports it as unfinished, and checks that its
  sealed judgments are a prefix of the owed order.
- A `lifecycle` event removed from a log that keeps a
  `preparation-started`, `prepared` or pass event fails by R-CARRY-17
  step 5, at the first of them. With all of them removed too, the log is
  a version 1 log, as the paragraph above says.

**What verify still cannot prove, and says so:** that the Room issued or
did not issue a check job, since jobs are not in the log; that a tree was
unreadable; and anything about a version 1 log's missing judgments.

## Acceptance cases

All ten of draft 1 and the three of draft 2 stay, and two are added for
the changes in A and C.

| Case | Expected result |
|---|---|
| A pass with two obligations, the first carried by its second-newest check | Events in order: started; not carried (newest); carried; the second obligation's judgments; ended `complete`. Verify passes |
| The same, with one `check-carried` event that did not carry removed and the log resealed | `decision-missing` at the pass's end, naming the check |
| The whole pass removed, start to end, and resealed, with the land input changed to match: the first and only pass of the log, and a middle pass | `decision-missing` at the next check, `land-evaluated` or `land-reserved` of the operation, naming the operation. Never a fall back to version 1 |
| An advisory obligation whose only earlier check does not carry | One judgment, not carried, in a complete pass; with it removed, `decision-missing` |
| Two overlapping passes | The first is closed by the second's start, with a prefix of its judgments; the second ends `complete`. Verify passes. A judgment of the first sealed after the second started: `decision-extra`. The Room's own guard: an earlier worker seals nothing after a new evaluation of the same preparation started, after a new attempt started and before its integration is built, and after a restart |
| The tree cannot be read | Ended `no-tree` with no judgment; a check may follow; no `land-evaluated` rests on it; verify passes and states the limit |
| A fact moves during a rule evaluation | The judgment is sealed once, on the later facts; verify rebuilds the same context. After a third evaluation whose facts moved, no judgment of that check is sealed, the turn ends, readiness is marked due, and a later turn starts a new pass |
| The published log ends inside a pass | Verify passes and reports the pass as unfinished. An operation that has a `land-outcome` has no unfinished pass |
| A `check-carried` event that names a pass which has ended or is closed, including by an activation, a new preparation or the operation's outcome | `decision-extra` |
| A log from before the amendment | Verifies as it does today, and its report states the version 1 limit. A landing admitted before the `lifecycle` event and still being prepared after it stays under version 1 |
| The `lifecycle` event removed, `prepared` and pass events kept | `guard-failed` at the first of them. With every dependent event removed as well: a version 1 log, which fails `lifecycle-below-required` for a caller that requires version 2 |
| A document that declares a kind named `carry-started` | Valid before and after; its acts verify; the Room's `carry-started` events are system events and are judged as such |
| The same commit prepared in two attempts | Two `preparation-started` and two `prepared` events; a pass of the first attempt cannot seal after the second attempt starts |
| A preview's `prepared` event with checks and no pass | Verifies |
| A recovery landing under version 2, and a legacy recovery thread that continues after a `v2` activation | No pass, no `land-evaluated`; verifies. A `carry-started` for it is `decision-extra` |

Focused controls, as the review groups them: the lifecycle event with
whole-pass removal; ordered completion and the two recorded ends; closure
by a new pass, a new preparation, an activation and an outcome, across a
restart; context at the seal, with version 1, preview and recovery logs.
The held-evaluation tests the Room already has (`acts.test.ts`: "a carry
judgment is sealed only on the facts ...", "a carry pass ends when its
obligation is gone ...", "an activation that overtakes a carry pass ...")
are reused where their meaning still fits.

## What it costs

One `lifecycle` event per room. One `preparation-started` event per
attempt. One `carry-started` per evaluation of a prepared operation, also
when nothing is owed. One `carry-ended` for a pass that ends `complete` or
`no-tree`; a pass that is closed by a later event has no end event of its
own, only its start and the judgments it sealed. The cost in rows is
measured with the `prepared` event's, under request `92ddf4cc`, for empty
passes, overlap, the two ends, replaced attempts and a restart.

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

## Decided since draft 2

The review of draft 2 decided the three choices that draft left open, and
this draft follows them: a check is evaluated at most three times in one
pass, the first included, and exhaustion ends the turn with readiness
marked due; no land evaluation or reservation rests on a `no-tree` pass;
and the engine's attempt is public, as the `preparation-started` event and
the `attempt` of `prepared`. The evaluation revision is not a separate
public number: a new evaluation and a new pass start in one transaction,
so the pass number is its public counterpart.

## Left open for the reviewer

- **An evaluation with no pass.** This draft has every evaluation of a
  prepared operation start a pass, including those the engine starts
  because a check arrived. A room with many checks on one landing then
  seals many empty passes. The alternative is to start a pass only when
  the attempt or the policy version changed since the last complete pass,
  and to let later evaluations rest on that pass. That is fewer events,
  but it needs a second fence for an evaluation that starts no pass. This
  draft takes the simpler rule and leaves the cost to the measurement.
- **A preview's lifecycle version** is taken from the act that made its
  version of the thread. If previews should instead follow the room's
  version at the time they are prepared, step 4 of R-CARRY-17 changes for
  previews only.
