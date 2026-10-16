# Carry-pass amendment Draft 3: accepted planning contract

2026-10-04. Decision for builder request
`ac8b8fd7ea031d7075da65fce4e81f9ad6b7ec36`, planner promise
`a73048763286bc6e430a33d873de4215549da131`. This request owes a design
decision, no Git artifact or landing. Source incorporation and runtime
implementation remain builder work.

Reviewed the complete Draft 3 at
`90b91f3152960746d166e61e12858181ba700bb9`,
`notes/2026-10-04-carry-pass-amendment.md`: 23,570 UTF-8 bytes,
348 lines, SHA256
`2c74ded975a3d3518b7e47055ccd8b294fc75001cbc680c21c64fb0537a201d5`.
Also reread the complete 014 review and the relevant current protocol
preparation, landing, log and declared-act rules. This is a planning
decision, not an independently reproduced runtime result. Main remains
`e6e6782830e0ca8a68f0d11c4d4ece5e4e98c967`.

## Decision and reasons

Accept Draft 3 as amended by the complete contract text below. That text
is the incorporation copy: it retains every proposed rule and all fifteen
acceptance cases, resolves both open choices, and incorporates the precise
qualifications in this review. It replaces contradictory or underspecified
sentences rather than asking for another planning-only draft. Record
adoption of this entire saved contract in the workroom; incorporation
into source does not itself count as implementation approval.

| Point | Decision and reason |
|---|---|
| A: lifecycle and compatibility | Accept. The independent lifecycle event anchors duties before any pass. System-event types do not reserve declared-act names. Admission-time versioning preserves legacy landings, and an explicit minimum refuses a fully downgraded log. Supported-prefix and mode qualifications below prevent the report from claiming more than it verified. |
| B: order and facts | Accept. One synchronous start fold fixes obligations, candidate order and exclusions under the complete judgment key. Earlier exclusions require actual validated events, negative judgments included. Seal-time facts and a positive result's stopping rule remain distinct from start-time membership. |
| C: ownership | Accept the public attempt and atomically allocated pass as the evaluation epoch. Record replacement before the new integration exists. The incorporation copy explicitly matches actual generation/integration/preparation, couples private engine ownership to the public transfer, retains counters through restart and checks returning workers. No assumption that an older host has vanished substitutes for a guard. |
| D: ends and barriers | Accept the two ends and derived closure. Correct the draft's internal conflict: R-CARRY-18 step 8 barred every check after no-tree, while R-CARRY-19 and its acceptance case expressly allowed it. A current, unclosed no-tree pass can support a check; it cannot support land evaluation or reservation. A closed pass supports neither. |
| E: preview and recovery | Accept. Previews retain their own owner discriminator and have no landing-engine attempt field. Their lifecycle is fixed by the admitted generation-producing act. Recovery remains exempt by recorded purpose/kind, including a legacy recovery thread continuing after v2 activation. |
| F: placement and owners | Accept section 35, amendment 8, R-CARRY-17 through R-CARRY-19. Section 34 is amendment 7 at the reviewed head, and these numbers are unused. The builder incorporates the protocol and shared types through the existing Stage 4/Stage 3 owners; the planner records this decision in plans and the workroom. |

The current intermediate-verifier changes-requested report `63af1ce0`
independently establishes that integrity-only runs must not claim replay
checks. It is evidence for a reporting invariant, not evidence that the
future pass protocol works. This accepted design applies that same
invariant to lifecycle reports. An upgraded log can contain grandfathered
version-1 landings; its current version alone cannot certify their missing
carry judgments. Likewise, a valid unfinished prefix is not a completed
pass or evidence of private worker progress.

## Both open choices decided

| Choice | Decision |
|---|---|
| Every evaluation starts a pass | Yes. Every new evaluation of a prepared, non-recovery version-2 landing starts its public pass in the same ownership transaction, including evaluations triggered by check arrivals and an empty owed order. The pass is the evaluation epoch; allowing an unrecorded evaluation would require a separately specified fence and weaken the current ownership equivalence. Measure empty-pass row cost under existing `92ddf4cc`. Any later optimization needs a concrete reviewed alternative preserving that equivalence, not a silent exception. |
| Preview lifecycle version | Use the admitted act that established the preview's generation. Completion time does not upgrade older preview work retroactively. A later generation admitted after the boundary follows version 2 even if its thread is older. Its PreparedEvent owner remains preview lane/generation, without inventing a landing attempt counter. |

The three earlier choices stay: at most three total evaluations of one
candidate in a pass, the first included; exhaustion ends this work turn
and uses durable bounded retry/alarm scheduling; no land evaluation or
reservation rests on no-tree. A distinct actual preparation attempt has
a distinct public attempt even if it produces the same commit.

## Incorporation copy

Placement: `docs/protocol.md`, section 35, contract amendment 8,
**Carry-pass accounting**, R-CARRY-17 to R-CARRY-19. Recheck numbering at
the final composed source head; a numbering collision is a mechanical
placement correction, not a new semantic choice. Existing rules and
types are amended as listed below.

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
   A preview's version is the version at the admitted act that established
   its generation, not the version at the later completion of preparation.
   A preview of an older generation remains version 1 across the upgrade;
   a new generation admitted afterwards follows version 2, even on an
   older thread.
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
   evaluation of one attempt of one non-exempt landing operation under one
   policy version (the recovery exemption is R-CARRY-19 step 5).
   **A pass starts when an evaluation starts**: in the one
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
   current pass. The first pass number is 1; subsequent numbers have no
   gaps or reuse, across attempts and restarts. A missing number exposes
   a missing pass at the first later public frontier that reveals it.
   The event lists none of what was read: a reader derives it from the log
   at the event's position.
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
   and with it a new pass, on a later turn. The due state is handed to the
   existing durable bounded retry/alarm scheduling; marking it in memory
   or leaving no durable wake is insufficient. It does not start a new
   pass in the same turn. Everything else a judgment reads is fixed by
   what the pass names: the policy version, the generation, the integration, its tree
   and snapshot.
5. **A direct check that arrives during a pass** does not change what the
   pass owes. The order was fixed at the start, and the remaining
   judgments of that obligation are still sealed. They are history; the
   obligation is met by the check either way.
6. **Who may seal.** Each `check-carried` and `carry-ended` event names
   its pass. The Room seals one only if, in the same transaction, the pass
   is the operation's current pass, the operation's attempt is the pass's
   attempt, the operation is being prepared, its actual current generation,
   integration and preparation identity match those bound by the pass,
   the active policy version is the pass's, and the pass has no end.
   The public pass number is the engine's evaluation ownership epoch:
   starting either transfers both in that same transaction, before any
   external read or policy await. A separate private revision, if retained
   as an implementation detail, cannot move ownership without that public
   transfer. A worker that returns from Git or from the policy after the
   engine has started another attempt, or
   another evaluation, finds that its pass is not the current one, or
   that its attempt is not, and seals nothing. This holds in the interval
   after a new attempt starts and before its integration is built: the
   attempt changed in the transaction that sealed `preparation-started`.
   A restart preserves durable counters. Resuming unfinished evaluation
   work starts a new evaluation and records its new pass in the ownership
   transaction before accepting an outstanding result or awaiting more
   work. The earlier unfinished pass is closed by that recorded transfer;
   it is not revived as the new worker's execution. A superseded producer
   cannot reclaim ownership. The guard must hold for any returning
   callback, even if an earlier host or handle remains alive; absence of
   that worker is not the fence.
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
   `decision-extra`. A closed pass never supports a later admitted check,
   land evaluation or reservation. A pass ended `no-tree` may support an
   admitted check, and the permitted job issuance, under R-CARRY-19 step 2
   while it is still current and not closed. It never supports land
   evaluation or reservation.

**R-CARRY-19. A pass is owed by preparation.**

1. For a landing operation under lifecycle version 2 that is not on a
   recovery thread, after the `prepared` event of its current attempt and
   after each `policy-activated` event while it is being prepared, the
   Room seals a `carry-started` for that attempt and policy before any of
   these for the operation: an admitted `check`
   act that names the operation and the integration (R-DECL-20); a
   `land-evaluated` event; a `land-reserved` event.
2. An admitted check that names the operation requires that the latest
   pass of that attempt and policy is current, not closed, and has ended
   `complete` or `no-tree`. The check names that attempt's owner/integration
   as required by R-DECL-20. A `land-evaluated` or `land-reserved` event
   requires that it ended
   `complete` and is not closed. After `no-tree` the operation is prepared
   again or evaluated again; a direct check does not turn that pass into a
   completed one. The Room also issues no check job before the pass has
   ended; verify cannot see jobs, and says so.
3. A `land-evaluated` event names the pass it rests on.
   Barrier guards are judged in the fold immediately before the barrier
   entry. A valid reservation may then close that pass when its own entry
   is applied; it does not invalidate its own pre-entry guard.
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
`prepared` event whose owner is a landing names its attempt; its preview
owner keeps the lane/generation discriminator and has no landing attempt
field. `preparation-started` names a landing operation only. Previews and
landings under version 1 seal none of the new events); R-CARRY-13 (a
`check-carried` event names its pass, under lifecycle version 2);
R-LAND-4, steps 1 to 3 (the attempt
is recorded when preparation starts; a pass before the checks are
requested; a `land-evaluated` event names its pass); R-LAND-5 (each
re-preparation seals `preparation-started`); R-LOG-10 (below). R-DECL-2
does not change. New contract types: `LifecycleEvent`,
`PreparationStartedEvent`, `CarryStartedEvent`, `CarryEndedEvent`, the
`attempt` field on the landing-owner variant of `PreparedEvent`, and the
`pass` field of two existing events.

## Verify (R-LOG-10)

**The report and what a caller can require.** The report gains
`lifecycle`: the supported version established in the verified prefix
and the position of its event; `{ version: 1, since: null }` if that prefix
has none. An unknown recorded version stops verification at that event
with `lifecycle-unsupported`, before the event is part of the verified
prefix. Its observed value is disclosed by that limit; it cannot become
a claim of supported version-2 coverage.

The report states the selected mode, `full` or `integrity`, and the
position through which each positive claim is established. With replay
disabled, `carryAccounting` is `"none"`: no replayed decisions, derived
calls, Git witnesses or carry completeness are claimed. CLI and JSON
express the same guarantees. Integrity-only success is not full replay
success.

In full mode, `carryAccounting` is `"partial"` for version 1, for a
verified prefix containing grandfathered version-1 non-recovery landings,
or while an
owed pass remains unfinished. The reader separately identifies those
legacy operations and unfinished work. Version 2 does not retroactively
certify version-1 operations. `"complete"` is available only on a
successful full run with a supported retained version-2 boundary, no
version-1 landing needing carry accounting in the reported coverage, and
no unresolved required pass in that coverage. It means complete public
carry accounting for that verified prefix, not completed publication,
every Room transition, private job issuance or present worker progress.
A failure or unsupported suffix cannot be called completely verified;
positive prefix results remain explicitly bounded.

A caller states its minimum recorded lifecycle with `requireLifecycle: 2`
(`--require-lifecycle 2`). A log whose supported lifecycle is lower fails
with `lifecycle-below-required`; an unsupported version remains an
unsupported limit, never a weaker successful fallback. The minimum
option does not enable replay by itself or certify grandfathered
operations: a caller needing full accounting must also select full
mode and inspect coverage and unfinished work.

A log from which the `lifecycle` event and every dependent fact were
removed and which was sealed again is a version-1 log. It reports that
weaker guarantee and never meets the explicit version-2 requirement.
Nothing in that newly presented history alone shows that it once
recorded more. A reader retaining an earlier published head can establish
rewritten history under R-LOG-8. This is the lifecycle of the log, not a
version of the report's format.

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
  operation. This detects a whole required pass removed, the first and
  only one included: what makes it owed is the `prepared` event and the
  lifecycle version, not the pass. A missing pass number also exposes a
  removed middle pass at the first later event that shows the gap;
  report `decision-missing`, naming the operation.
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
unreadable; anything about a version-1 log's missing judgments; or unseen
private execution and history deleted together with every public anchor.
The producer still records every evaluation and enforces every guard.
These proof limits do not excuse a missing recorded duty, candidate,
judgment, pass number or public barrier.

## Acceptance cases

All ten of draft 1 and the three of draft 2 stay, and two are added for
the changes in A and C.

| Case | Expected result |
|---|---|
| A pass with two obligations, the first carried by its second-newest check | Events in order: started; not carried (newest); carried; the second obligation's judgments; ended `complete`. Verify passes |
| The same, with one `check-carried` event that did not carry removed and the log resealed | `decision-missing` at the pass's end, naming the check |
| The whole pass removed, start to end, and resealed, with the land input changed to match: the first and only pass of the log, and a middle pass | `decision-missing` at the next check, `land-evaluated` or `land-reserved`, or the earlier event exposing a pass-number gap, naming the operation. Never a fall back to version 1 |
| An advisory obligation whose only earlier check does not carry | One judgment, not carried, in a complete pass; with it removed, `decision-missing` |
| Two overlapping passes | The first is closed by the second's start, with a prefix of its judgments; the second ends `complete`. Verify passes. A judgment of the first sealed after the second started: `decision-extra`. The Room's own guard: an earlier worker seals nothing after a new evaluation of the same preparation started, after a new attempt started and before its integration is built, and after a restart |
| The tree cannot be read | Ended `no-tree` with no judgment; a check may follow while the pass is current and not closed; no land evaluation or reservation rests on it; verify passes and states the limit |
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

## Owners, dependencies and order of work

| Owner | Work retained |
|---|---|
| Builder, original Stage 4 `48c021ea` / `8d497ff5` | Incorporate this entire accepted contract into protocol and shared types; implement lifecycle upgrade, preparation attempts, pass ownership/closure, prepared owners and job sequencing. Preserve every other original Stage 4 condition. |
| Builder, original Stage 3 `1e8fee4b` / `3af8ebc7` | Implement complete public carry accounting, all fifteen cases and the original ten case families/points A–F, evaluator calls/inputs/meter and accurate machine/CLI coverage. Preserve all other original Stage 3 outcomes. |
| Existing row-cost owner `92ddf4cc` | Measure lifecycle, attempt, prepared and pass costs for empty, complete/no-tree, overlapping, replaced and restarted work. No timing or row measurement is supplied by this review. |
| Independent checker | Review producer, consumer and shared types at one exact composed head with both original scopes explicitly bound. Reuse unchanged qualified evidence and focused controls; file normal guarded conclusions. |
| Builder, normal integration owner `dae9a1f3` | Incorporate the reviewed source through normal landing and deployment. Record actual completion against the original obligations; a planning decision or a carry-only verdict does not close every Stage 3/4 outcome. |

Adoption of this design is distinct from source incorporation, runtime
completion, independent approval, landing and production emission. Stage
4's existing condition 3 requires a working consumer before the producer
emits new facts. Deliver shared types and both sides at one reviewable
head; do not deploy a producer whose consumer cannot read its new events.

The intermediate verifier remains a separately bounded delivery under
`42342e35` / `4e66accc`, with partial accounting and honest selected-mode
limits. Its existing two P2 repairs stay in that commission. Neither
this amendment nor its full producer/consumer work becomes a first-Jam
gate. Builder's existing `b4ef9b7a` readiness judgment still controls
self-hosting once reviewed main, ordinary deployment and matching
installable packages remove the actual blockers. Jam and the full Artroom
manual can then proceed in parallel, with Jam free to evolve its own
declared acts vocabulary.

No duplicate runtime task is commissioned. The already adopted browser,
durable workspace and cross-device stories in 005, their six builder
tasks, full developer-adoption work in 006, both MCP commitments and all
other original outcomes keep their recorded owners and acceptance.

## Verification and remaining uncertainty

This review resolves the design choices; implementation remains owed.
Useful evidence must distinguish current from superseded ownership,
same-commit different attempts, a returning old handle across restart,
three facts-moved evaluations followed by durable handoff, current
no-tree checks versus forbidden land/closed-pass use, mixed lifecycle
history, and full versus integrity reporting. Keep all fifteen table
cases and existing meaningful controls. These are invariant controls,
not justification for a combinatorial mutation sweep or repeated whole
baseline runs.

Pass numbers must be validated as a sequence, not merely accepted as
opaque supplied values. A retained prepared/lifecycle anchor detects the
first required pass removed at its public barrier; a retained later pass
number can expose a removed middle pass earlier. The reader cannot infer
private executions from a wholly rewritten history without retained
anchors. Preserve the minimum-version refusal and earlier-head history
comparison rather than claiming such unseen evidence.

No tests, dependency installation, build, provider operation, deployment
or source edit was performed by this planner. Validation of this saved
review is complete-text inspection, whitespace and attachment identity.
Independent runtime findings cited above remain the checker's findings.
