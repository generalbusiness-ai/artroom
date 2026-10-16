# Wake and schedule note: reconciliation checklist

Request `50d7806a`, input 1. Edited file:
`notes/2026-10-01-wake-and-schedule.md` in worktree
`/Users/hughpyle/play/artroom-worktrees/notes-reconcile` (branch
`request/notes-reconcile`). Line numbers refer to the
edited file (1041 lines). "008" is
`plans/008-2026-10-03-wake-and-schedule-clarification.md`. "007" is
`plans/007-2026-10-03-attention-runtime-handoff.md`. "Rev 2" is the
note at `337a449d`.

## A. Original request `24711ceb`: conditions

| # | Item (source) | Where the reconciled note delivers it | Note |
|---|---|---|---|
| A1 | "one pipeline for event and scheduled triggers built on notify rules and the attention queue" (24711ceb conditions) | §1 Summary, lines 55-91; §2, lines 93-108 | Diagram kept with two sources; tail extended to "receiver reads and keeps its input" and "room records the actual outcomes" per 008 "Direction retained" |
| A2 | "defines schedules" | §3 "What a schedule is", lines 160-192 | JSON example unchanged; field table rewritten for `id`, `cron`, `to`, `scope`, `coalesce` |
| A3 | "defines ... firings" | §3 "How a firing works", lines 293-325; "Slots and firing identity", lines 275-291 | Rewritten: 5 steps became 7; original event fields kept |
| A4 | "defines ... missed ... firings" | §3 "Missed firings", lines 327-337; "Recovery", lines 355-379 | One event per schedule kept as Adopted; detail added as Proposed |
| A5 | "defines ... coalesced firings" | §3 "Coalescing", lines 381-422 | Rewritten: unit-based |
| A6 | "where output goes" | §3 "Reports and housekeeping output", lines 451-460 | Four rows kept; outside-send row and report row extended |
| A7 | "defines waking for a local watcher" | §4 table line 470; source statement lines 474-480; examples lines 482-494; "The local watcher's recovery boundary", lines 658-672 | Rewritten: marked Planned, not shipped |
| A8 | "defines waking for ... a wake address" | §4 table line 471; "The receiver owns its read position", lines 499-528; "Wake delivery rules", lines 674-697 | Rewritten: cursor advisory, route private |
| A9 | "defines waking for ... pi-durable" | §4 table line 472; "pi-durable fit", lines 699-711; "The durable hosted receiver", lines 537-580 | Rewritten: exactly-once claim removed; deduplication marked Untested in the table cell and in the list |
| A10 | "covers loops" | §5 Loops and budget accounting, lines 719-758 | Original three guards unchanged; accounting added as Proposed |
| A11 | "covers ... cost" | §5 Cost, lines 760-761 | Unchanged from original, marked Adopted |
| A12 | "covers ... authority" | §5 Authority, lines 763-768; §1 line 85 | Original kept; two sentences added from 008 §5 |
| A13 | "covers ... secrets" | §5 "Secrets in schedule text", lines 770-777; "Wake secrets and routes", lines 779-797 | Original sentence kept; extended |
| A14 | "covers ... prompt injection" | §5 Prompt injection, lines 805-810 | Original kept; attribution through every receiver added |
| A15 | "says what is recorded where" | §6, lines 812-825 | Original 5 rows kept (2 reworded); 5 rows added |
| A16 | "names the contract changes" | §7, lines 827-859 | Three parts kept; qualifications marked Proposed |
| A17 | "names ... staging" | §8, lines 861-906 | Five stages, order and original owners kept |
| A18 | "passes checker's review" | §9 review history, lines 919-934 | Not satisfied by this edit. Rev 2 received changes review `2acf4f43`. Revision 3 is recorded as "Not yet reviewed" (line 927) |
| A19 | "the simple version of 'trigger this agent when X happens in the room'" (24711ceb text) | Header lines 7-10; §1 lines 65-67; §2 lines 95-108 | Unchanged from original |
| A20 | "valuable in any configuration" (24711ceb text) | §4 three ways, lines 464-472; external cron, lines 433-439 | Kept; "None replaces the others" added from 008 §6 |
| A21 | "especially clean with pi-durable" (24711ceb text) | §4 line 472 and lines 699-711 | Kept as Untested; guarantee corrected |
| A22 | "the scheduled ('cron') version for daily housekeeping and reporting work" (24711ceb text) | §3 examples lines 168-182; lines 216-239 | Examples unchanged; classified per 008 §2 |

## B. Adopted decision `154f25d8` and dated pins kept

| # | Item (source) | Where | Note |
|---|---|---|---|
| B1 | Three-part amendment adopted in staging order (154f25d8; Rev 2 §9.1) | §9 line 912; §7 lines 829-856 | Unchanged decision; part 1 qualified as Proposed |
| B2 | 60 wakes per member per hour, 20 per lane per hour (154f25d8) | §5 lines 721-722; §9 lines 913-914 | Unchanged |
| B3 | 15-minute minimum interval, 20 schedules per room (154f25d8) | §3 field table line 188; §5 lines 760-761; §9 line 914 | Unchanged; "checked between actual slots" added (008 §3) |
| B4 | A schedule may name an application-pack prompt, stage 3 (154f25d8) | §9 lines 915-916; §3 line 190; §8 line 870 | Unchanged |
| B5 | `coalesce` defaults to true (Rev 2 §5; 008 "Direction retained") | §3 line 192 and line 383; §5 line 761 | Unchanged |
| B6 | All five stages and their order (008 "Direction retained") | §8 lines 863-872 | Kept; outcomes column uses 008's still-owed wording |
| B7 | Estimates and contest demo do not reduce scope (2acf4f43; 008) | §8 lines 897-906 | Kept as History, with original figures |
| B8 | Pin: Artroom `main` at `8189d66`; R-POL-5, R-LOG-13, R-ADMIN, R-SEC; contract file paths | Header lines 13-14; §12 lines 997-1004 | Unchanged from original |
| B9 | Pin: pi-durable announcement URL | §12 last line (1041); header line 18 | Unchanged |
| B10 | Pin: request `3f23ea89` for pi-durable integration | §4 line 472; §8 line 872 | Pin kept; per direction `fceb27d0` it is credited as landed history (approval `adb239bd`, landing `31da00de`) and C3 `13dfc613` owns the production receiver (lines 472, 872, 879-884) |
| B11 | Pin: related notes on `request/mcp-plan` and `request/docs-plan` | §12 "Related notes" | Unchanged |
| B12 | Pin: date 2026-10-01, Revision 2 line | Header line 3; §9 line 910 | Unchanged; Revision 3 line added (lines 4-7) |
| B13 | Judgement and Untested labels (Rev 2) | Lines 80, 407, 458, 649, 822; header lines 13-22 | Kept; Source labels and five status words added (lines 24-39) |

## C. Clarification 008: six corrections

| # | Item (source) | Where | Note |
|---|---|---|---|
| C1a | Correction 1: receiver's own durable checkpoint; wake cursor advisory only; first page for a new receiver; cursor kinds not interchangeable (008 §1) | §4 "The receiver owns its read position", lines 499-528; delivery rule 1, lines 676-678 | Rewritten in place; Rev 2 text named as unsafe |
| C1b | Correction 1: carry the 007 boundary, items 1 to 4 (008 §1) | §4 "The durable hosted receiver", lines 537-580; "Catch-up", lines 582-628 | New, Proposed, owner C3 |
| C1c | Correction 1: retention or repeated identity proves no command, effect, review or landing; spike is not the proof; Pi announcement separates submission from tools (008 §1) | §4 "What retained input does not prove", lines 631-656; pi-durable fit, lines 702-708; table line 472 | Rewritten; "exactly once" claim removed |
| C1d | Correction 1: watcher `--exec` boundary: start intent, result, uncertain launch, safe retry, durable spool, `--once` remainder (008 §1) | §4 "The local watcher's recovery boundary", lines 658-672 | New, Proposed |
| C1e | Correction 1: workspace saves, signed-act replay, unknown-command settlement keep separate boundaries; no fresh tools after revocation (008 §1) | §4 lines 640-647 | New |
| C2a | Correction 2: closure by `because` only for informational policy or note notices; admitted act by the addressee; eligible kinds named by contract (008 §2) | §2 "Acknowledging a notice by citing it", lines 110-130; §7 item 1, lines 841-846 | Rewritten in place |
| C2b | Correction 2: review, check, generation, lease, publication keep authoritative predicates (008 §2) | §2 lines 132-143 | New, with Source label |
| C2c | Correction 2: schedule classified at activation: informational notice or action request; scope does not decide (008 §2) | §3 "What a schedule asks for", lines 194-214; field table line 191 | New, Proposed |
| C2d | Correction 2: daily housekeeping is a non-scoped action request; work identity, recorded result or no-findings outcome; N2/D1 lifecycle (008 §2; f965c475) | §3 lines 216-232 | New, Proposed |
| C2e | Correction 2: weekly report incomplete until landed; cancellation and supersession not success; no invented acceptance field (008 §2) | §3 lines 234-243 | New |
| C2f | Correction 2: browser shows outcomes beside activity; prepared kind and binding fix meaning (008 §2) | §2 lines 149-156 | New |
| C3a | Correction 3: activation generation; pinned definition, cron/zone meaning, task; pack revision and digest; unresolved if unavailable (008 §3) | §3 "Activation and task meaning", lines 245-259 | New, Proposed |
| C3b | Correction 3: edit, removal, reused ID, reverted bytes; not retroactive; frontier split between generations (008 §3) | §3 lines 260-273 | New, Proposed |
| C3c | Correction 3: slot is a UTC instant; repeated and missing local times; reproducible evaluator; 15-minute check on actual slots (008 §3) | §3 "Slots and firing identity", lines 275-286; line 188 | New, Proposed |
| C3d | Correction 3: `id@scheduledTime` is shorthand; identity is room, generation, slot or window (008 §3) | §3 lines 287-291; field table line 187 | Rewritten in place |
| C3e | Correction 3: private due frontier; window `(frontier, cutoff]`; missed summary with earliest instant, count, interval, recording time; one task; no slot dropped (008 §3) | §3 lines 301-304 and "Missed firings", lines 327-336 | Earliest missed time and count kept as Adopted; covered interval and recording time added as Proposed |
| C3f | Correction 3: window identity kept before bounded calculation; clock regression; shared alarm keeps lease and publication duties (008 §3) | §3 "Recovery", lines 359-365; step 1, lines 295-300 | New, Proposed |
| C3g | Correction 3: firing, effects and frontier in one transaction, or keyed completion intent; no second outbox (008 §3) | §3 "Recovery", lines 366-379 | New, Proposed |
| C3h | Correction 3: public facts versus private operational state; a firing is a request, not completion (008 §3) | §3 lines 324-325 and 424-429; §6 lines 818-819 | New |
| C4a | Correction 4: targets resolved at commit; concrete identities kept (008 §4) | §3 step 4, lines 310-313; field table line 189 | New, Proposed |
| C4b | Correction 4: three coalescing units: informational notice, non-scoped action, scoped work (008 §4 table) | §3 "Coalescing" table, lines 389-393 | New table |
| C4c | Correction 4: old generation does not block new; removal not success; blocked work shown (008 §4) | §3 lines 397-404 | New |
| C4d | Correction 4: what decides openness; A and B example; release; accurate coalesced summary; coalescing off (008 §4) | §3 lines 405-422 | New |
| C5a | Correction 5: rolling 60-minute window; attempt, retry, batch, lane charging; shared lane limit (008 §5) | §5 "How a wake is counted", lines 727-743 | New, Proposed |
| C5b | Correction 5: reservation before send; uncertain send keeps charge; held payload not charged; clock (008 §5) | §5 lines 737-743 | New |
| C5c | Correction 5: exhaustion keeps input and hint; status; coalesced admin alert; alert obeys budgets (008 §5) | §5 "When a budget runs out", lines 745-753 | New; original admin item kept at lines 723-725 |
| C5d | Correction 5: wake limits do not bound watcher command starts or C3 catch-up; debounce changes latency only; own-author rule (008 §5) | §5 lines 755-758; delivery rules 2 and 4, lines 679-688 | New |
| C5e | Correction 5: public route reference versus private endpoints, secrets, generations, diagnostics; token URL unsafe; never in history, log, receipts, diagnostics (008 §5) | §5 "Wake secrets and routes", lines 779-787; §6 lines 820-822; §7 item 3 | Rewritten: Rev 2 put the address itself in the roster |
| C5f | Correction 5: provisioning, routing change, rotation and retirement; HMAC and receiver rate limits; wire format open (008 §5) | §5 lines 788-797; delivery rule 5, lines 689-697 | New |
| C5g | Correction 5: R-SEC on pack prompt and arguments at activation; provenance; credentials out of prompts; N7 separate (008 §5) | §5 lines 770-777; lines 713-715 | Extended |
| C6a | Correction 6: `8189d66` has no CLI watcher; command map at `e6e67828` has no `watch`, `--once`, `--exec`; stage 1 owes it (008 §6; 2acf4f43 item 6) | §4 lines 470 and 474-480; §7 lines 857-859; §8 line 868; §12 | Rewritten in place |
| C6b | Correction 6: external cron can start an agent or read adapter with no amendment; `artroom watch` examples marked future (008 §6) | §3 "Why schedules belong in the room", lines 433-439; §4 lines 482-494 | Rewritten in place |
| C6c | Correction 6: keep all three routes; schedules and HMACs not prerequisites for C3's loop; harness examples need cold-run evidence (008 §6) | §4 lines 464-466 and 492-494; §8 lines 892-895 | New |
| C6d | Correction 6: output: notes, landed reports, D1/N2 work, publication separate; outside sends need authorization; attempt is not delivery (008 §6) | §3 output table, lines 455-460 | Extended |

## D. Event and schedule pipeline, owners and scenarios (008)

| # | Item (source) | Where | Note |
|---|---|---|---|
| D1 | Pipeline: matching act or due schedule (008 "Direction retained") | §1 diagram lines 59-63; §2; §3 | Kept |
| D2 | Pipeline: recorded attention or scoped work | §1 lines 68-71; §3 step 5, lines 314-316 | Rewritten |
| D3 | Pipeline: content-free wake hint | §1 lines 73-80; §4 delivery rule 1 | Kept, qualified |
| D4 | Pipeline: receiver reads and retains input | §4 lines 499-580 | New |
| D5 | Pipeline: agent submits ordinary admitted acts | §1 lines 85-87; §3 step 7, lines 318-322 | Kept |
| D6 | Pipeline: room records the actual outcomes | §1 lines 82-84; §6 line 825 | New |
| D7 | Stage table with still-owed outcomes (008 "Direction retained") | §8 lines 866-872 | Merged with original owners column |
| D8 | Acts work ahead of this correction; builder judges readiness; no Jam gate; Jam and manual proceed together (008) | §8 lines 888-895 | New |
| D9 | Owners, dependencies and unresolved choices table, 8 rows (008) | §10, lines 940-965 | New; 8 rows carried; 3 open-choice rows with owners from direction `fceb27d0` (hint payload and cursor, class encoding, route cardinality; lines 953-955) |
| D10 | Acceptance scenarios, 10 rows (008) | §11 rows at lines 973, 978-986 | New; marked Proposed, not run |
| D11 | Validation limits: focused witnesses, no runtime suite (008) | §11 lines 988-993 | New |
| D12 | Evidence statement: read-only, no live wake or schedule (008 "Evidence used") | Header lines 13-22; §12 | New |
| D13 | Review status of 007 and 008; original request still owed (8365e4c4; 6068751a) | Header lines 29-33; §9 lines 919-934 | New |

## E. Private handoff 007

| # | Item (source) | Where | Note |
|---|---|---|---|
| E1 | Source observations on attention reads at `e6e67828` and the skip risk (007 "Why this needs a handoff") | §4 lines 501-517 | New, Source label, "no runtime counterexample" kept |
| E2 | pi spike does not settle it: caller-driven `requestId`, alarm loop and attention bridge not built (007) | §4 lines 651-656 | New, Source label; the spike was read for 007, not again for this edit |
| E3 | Delivery flow 1: own attention cursor, first page, advisory hint, distinct cursors (007) | §4 lines 519-528 | New |
| E4 | Delivery flow 2: one transaction, disposition for every item, bounded pages, fencing (007) | §4 items 1-2, lines 543-554 | New |
| E5 | Delivery flow 3: stable identity, provenance, both crash windows (007) | §4 items 3-4, lines 555-563 | New |
| E6 | Delivery flow 4: delivery record is not finished work; tools pass ledger and fences (007) | §4 lines 636-639 | New |
| E7 | Delivery flow 5: read current state before delayed dispatch; record obsolete disposition (007) | §4 item 6, lines 567-571 | New |
| E8 | Lost wake needs a named catch-up path; paused task stays paused; browser disconnect (007) | §4 item 7, lines 572-575; "Catch-up", lines 586-592; §1 lines 77-80 | New; Rev 2 "never correctness" sentence rewritten |
| E9 | Catch-up when visible work changes: fresh scan, separate progress, selection generation, detection, skipped items, budget, explicit exclusion (007) | §4 "Catch-up", lines 593-628 | New |
| E10 | `because` closure does not replace review, check, landing, publication or requester acceptance (007 "Authority and recorded outcomes") | §2 lines 121-147 | Rewritten |
| E11 | Declared kind and binding; three separate boundaries (007) | §2 lines 153-156; §4 lines 640-644 | New |
| E12 | C1/C3 control rules: device A/B revocation, owner removal, reconnect (007) | §4 lines 645-650 | New |
| E13 | N7 human notification is separate (007) | §4 lines 713-715; §10 line 961 | New |
| E14 | Decisions and dependencies table, 7 rows (007) | §10, lines 949-961 | Carried through the 008 owners rows; cursor row at line 953 |
| E15 | Acceptance scenarios, 7 items (007) | §11 rows at lines 973-977 and 979 | New; folded into rows 1-3, 5 and 7; the author-text scenario has its own row (line 976) |
| E16 | No second public outbox, no Room and Agent transaction (007) | §4 lines 578-580; §3 lines 377-379 | New |

## Drift and open points

Items 1 to 6 change meaning and the clarification settles them. They
were rewritten in place. Items 7 to 13 were not settled by the
clarification. The planner read this section at commit `508ac63b` and
answered in workroom assert `fceb27d0` (2026-10-04). Each item below
says what that direction answered and what was done. The direction is
planning direction. It is not a complete independent review, and it is
not implemented protocol or runtime.

1. **Roster wake field. Answered by `fceb27d0` item 1.** Rev 2 §4 and
   §7 put the wake address itself in the member's roster entry, in a
   field named `wake`. 008 §5 makes the endpoint private. Direction:
   008's limits are the current planning guidance; `154f25d8` is the
   historical adopted amendment; the protocol amendment is still owed;
   raw endpoints and secrets are not made public because an earlier
   example used a `wake` field. Done: stated in §7 (lines 833-839);
   the `wake` field wording is kept (lines 852-856).
2. **Citation closes less. Answered by `fceb27d0` item 1.** 008 §2
   limits closure by citation to informational notices. The direction
   makes that the current planning guidance (lines 121-130, 833-839).
3. **Non-scoped firing is no longer only a bare attention item.
   Settled by 008 §2** (lines 207-232, 314-316). Direction item 3
   confirms that action work without a scope exists (lines 205-212).
4. **pi-durable "exactly once" removed. Settled by 008 §1** (lines
   472, 696-703).
5. **"A lost wake costs latency, never correctness" removed. Settled
   by 007** (lines 79-83, 586-590).
6. **"The watcher works today" removed. Settled by 008 §6** (lines
   858-860).
7. **Does the ping still carry a cursor? Answered by `fceb27d0`
   item 2.** A cursor is optional and advisory; room and member
   identify the receiver; the receiver resumes from its own typed
   attention checkpoint. Done: lines 530-535. Still open, with an
   owner: the concrete payload encoding, with the existing wake and C1
   owner (line 953).
8. **How a schedule declares its class. Answered by `fceb27d0`
   item 3.** The class belongs to the activated task definition and is
   validated at activation; scope is not the discriminator. Done: lines
   205-212. Still open, with an owner: the exact JSON field or rule
   encoding, with the existing public wake and schedule amendment, C1
   `b538c5ea` and its work-lifecycle dependencies (line 954). The
   earlier "no source names an owner" paragraph was removed.
9. **Missed window across a generation switch. Answered by `fceb27d0`
   item 4.** Accounting is split at the switch; each generation gets at
   most one summary and task for its own interval. Done: lines 338-354.
   Nothing left open here; no cron or storage format is chosen.
10. **Review exemption for `reports/**`. Answered by `fceb27d0`
    item 5.** Reports follow the normal proposal and landing process
    and the reviews current policy requires; a genuine exemption may
    yield no required human review. Done: line 458. The Rev 2 sentence
    stands.
11. **Stage 5 owner. Answered by `fceb27d0` item 6.** `3f23ea89` is
    satisfied and landed design-and-spike work, credited as history. C3
    `13dfc613` owns the production durable receiver. Wake stage 5 is
    not declared-acts stage 5. Done: lines 472, 872, 879-886.
12. **Per-member secret versus route generation. Answered by
    `fceb27d0` item 7.** "Per-member" is the scope; "generation" is the
    version. Done: lines 798-803. Still open, with an owner: one or
    several active routes per member, with the existing wake, C1 and
    private delivery owner (line 955).
13. **Stage owners. Answered by `fceb27d0` item 8.** Lane letters are
    historical sequencing labels; request identities and the §10 owner
    table track the live work; no one-to-one mapping is assumed. Done:
    lines 875-878.

Other points for the builder:

- `plans/005`, `plans/007` and `plans/008` are untracked files in the
  shared checkout. They are not on `request/notes-reconcile`. The note
  names them by path and by frozen attachment identity, and says where
  they live (§12). Direction `fceb27d0` ("ALL FOUR") accepts a
  canonical reference to a frozen file absent from the branch when its
  availability is labelled, and says not to sweep 005, 006 or 007 in.
- `plans/005` was not read in full. The note only repeats what 008 and
  007 say about it.
- **007 status line. Answered by `fceb27d0` item 8.** The frozen file's
  "pending independent design review" line is history; the approval
  `78be0cd1` and adoption `34c5274b` govern. Done: lines 936-938.
- §12 "Sources" was §10 in Rev 2. Two sections were inserted before it
  (§10 owners, §11 scenarios). Only
  `notes/2026-10-02-collections-of-rooms.md` refers to this note, and
  it does so by path, not by section number.
- The note grew from 292 lines (14,179 bytes) to 1041 lines.
- All workroom ids resolved, including `fceb27d0`, `adb239bd` and
  `31da00de`. `24a58dd6` returned no statement text to my query; it is
  not cited in the note.

## Planner's direction `fceb27d0`

The saved copy of the direction (11,704 characters) equals the text of
workroom assert `fceb27d050514e0cd1be180510e6e138cb6b73c7`. Every item
of its "WAKE CHECKLIST" and its "ALL FOUR" part was applied.

| Item | Direction (close paraphrase) | Where in the note |
|---|---|---|
| 1 | 008's closure, privacy, generation and recovery limits are current planning guidance; `154f25d8` is the historical adopted amendment; protocol amendment still owed; endpoints and secrets not public | §7 lines 833-839; label defined at lines 34-37 |
| 2 | Hint cursor optional and advisory; payload encoding with the wake and C1 owner | §4 lines 530-535; §10 line 953 |
| 3 | Class belongs to the activated task definition, validated at activation; encoding open with a named owner | §3 lines 205-212; §10 line 954 |
| 4 | Split missed-window accounting at an activation switch | §3 lines 338-354 |
| 5 | Reports follow normal proposal and landing and the reviews policy requires | §3 line 458 |
| 6 | `3f23ea89` is landed history; C3 owns the production receiver; wake stage 5 is not declared-acts stage 5 | §4 line 472; §8 lines 872 and 879-886 |
| 7 | Per-member is scope, generation is version; route cardinality open with a named owner | §5 lines 798-803; §10 line 955 |
| 8 | Lane letters are historical labels; 007's status line is history | §8 lines 875-878; §9 lines 936-938 |
| All four | Keep complete bodies, maps and frozen identities; label availability; no unrelated 005, 006, 007 work | §12 "Sources"; this checklist. The history table records the direction at line 928 |

## Independent check

An independent reviewer compared revision 3 with 008, 007, Rev 2 and
the request (`wake-verify.md`, a scratch report that is not kept in the repository; this section is its summary). It reported 14
findings. I checked each against the sources. All 14 were right and
all 14 were applied. Line numbers are in the edited file.

| # | Finding | What I did |
|---|---|---|
| 1 | pi-durable deduplication stated flatly in the wake table | Cell rewritten; deduplication marked **Untested**, proof still owed (line 472) |
| 2 | Earliest missed time and count relabelled Proposed | Restored as Adopted with Rev 2's wording; only covered interval and recording time are Proposed (lines 329-336) |
| 3 | Paused task: "new tools and lease renewals stopped" omitted | Added to item 7 as "stay stopped, as already specified" (lines 573-577). Also added 007's "pause and revocation still stop new mutating tools" (lines 619-620) |
| 4 | Opening said every revision 3 fact names the `e6e67828` pin | Opening rewritten: pin applies unless the sentence names another source; observations come from the reviewed plans (lines 13-22) |
| 5 | "`main` does not return a principal revision today" was an unpinned fact | Replaced with 007's caution: the design must not imply it (lines 627-629) |
| 6 | Proposed qualifications under Adopted labels | Three places marked **Proposed**: work unit (lines 68-72), slot check (line 188), target resolution (line 189) |
| 7 | Owner row dropped "preserve their separately reviewed lifecycle and authority" | Restored in the D1 and N2 row (line 958) |
| 8 | Owner row for the schedule-class choice is in no source | Historical first-pass disposition before direction `fceb27d0`: the row was removed and the paragraph then at line 962 said neither plan named an owner. That disposition was superseded by the named schedule-class owner in §10, line 954, under the direction; see drift item 8. The reviewer's suggested Judgement was not added |
| 9 | "Each receiver needs a named catch-up path" wider than the sources | Replaced: the durable hosted receiver must name its catch-up path and budget (lines 77-81) |
| 10 | Order of work omitted test reduction | Added "Test-overhead reduction stays first (`plans/007`)" (lines 888-889) |
| 11 | Two 007 statements shortened | Added "do not claim that the current read contract is broken" (lines 600-603) and the scan-page and selection-generation sentence (lines 604-612) |
| 12 | One 007 scenario and one 008 sentence dropped | Scenario row added (line 976); "Reuse the approved `plans/007` evidence where it is unchanged" added (lines 990-991) |
| 13 | Present-tense watcher sentence in Prompt injection | Now "the planned watcher" (lines 806-807). I did not use the reviewer's "must", which no source states |
| 14 | Adopted field name `wake` gone | §7 item 3 restored to Rev 2's wording; 008's limits follow as Proposed (lines 851-855) |

## Checks run

All from `/Users/hughpyle/play/artroom-worktrees/notes-reconcile`
unless a path is given.

```sh
# identity of the inputs
wc -c /Users/hughpyle/play/artroom/plans/008-2026-10-03-wake-and-schedule-clarification.md
#   26682
shasum -a 256 /Users/hughpyle/play/artroom/plans/008-2026-10-03-wake-and-schedule-clarification.md
#   bb4eedbd29bae8834a903471c144dded1a32f8dc7e440edda32382ecd073facc
shasum -a 256 /Users/hughpyle/play/artroom/plans/007-2026-10-03-attention-runtime-handoff.md
#   6b0cb9cd9f8079ed0ff21d5b3d13bb3838bfb2c5678f8a930cbf7f40d068ca5d (matches approval 78be0cd1 / 34c5274b)
git -C /Users/hughpyle/play/artroom show 337a449d:notes/2026-10-01-wake-and-schedule.md | shasum -a 256
#   6754f5d87b280441adfcee0f7874ae97a79af6005cd8f987a3d5289def764598 (matches 008 and review 2acf4f43)
git -C /Users/hughpyle/play/artroom log --oneline request/wake-and-schedule -- notes/2026-10-01-wake-and-schedule.md
#   337a449d, 51f11a31

# workroom reads (read-only)
gs inspect --json <id> | jq -r '.statement | ...'
#   ids: 24711ceb 19a020af 8365 3ee468ec 6068751 2acf4f43 154f25d8 f965c475
#        50d7806a 34c5274b 78be0cd1 40514a0a 45065116 6a209eaa 3f23ea89
#        13dfc613 9c43c173 64e9d131 db2fd146 b538c5ea 24a58dd6
gs inspect --json <id> | jq -r '.statement.timestamp'   # then date -r, for the §9 dates

# whitespace
git diff --check -- notes/2026-10-01-wake-and-schedule.md
#   no output, exit 0

# banned text
grep -n -e '-' -e 'software scale' -- notes/2026-10-01-wake-and-schedule.md
# Corrected syntax only; not rerun for this maintenance. The earlier
# "no output" claim is not valid evidence: the dated note contains
# literal hyphens (for example, its date).

# paths and links named in the note
f=notes/2026-10-01-wake-and-schedule.md
grep -o '`[^`]*`' $f | tr -d '`' | grep -E '^(notes|plans|docs|packages|attachments)/' | sort -u |
  while read p; do if [ -e "$p" ]; then echo "IN WORKTREE  $p";
  elif [ -e "/Users/hughpyle/play/artroom/$p" ]; then echo "SHARED ONLY  $p";
  else echo "NOT A FILE   $p"; fi; done
grep -no '\]([^)]*)' $f      # Markdown relative links: none
grep -no '<http[^>]*>' $f    # one URL: https://earendil.com/posts/pi-durable/ (not fetched)
```

Result of the path check:

| Path in the note | Result |
|---|---|
| `docs/protocol.md`, `packages/contract/src/pagination.ts`, `packages/contract/src/policy.ts`, `packages/room/src/reads.ts`, `notes/2026-10-01-mcp-plan.md`, `notes/2026-10-01-docs-plan.md` | Exist in the worktree. The first three also exist at `8189d66` (`git ls-tree -r --name-only 8189d66`) |
| `packages/cli` | Exists in the worktree. `git ls-tree -r --name-only 8189d66 \| grep -c '^packages/cli/'` gives 0, as the note says |
| `plans/008-2026-10-03-wake-and-schedule-clarification.md`, `plans/007-2026-10-03-attention-runtime-handoff.md` | Shared checkout only (untracked). The note says they are not on this branch (§12) |
| `plans/005-2026-10-03-browser-cloud-work.md` | Shared checkout only (untracked). The note says so (§12) |
| `plans/005`, `plans/007`, `plans/008` | Short names, defined in §12 |
| `attachments/2026-10-03-...-draft2.md` (two) | Workroom attachment paths quoted from approvals `8365e4c4` and `78be0cd1`; not files in the worktree; the note says they are workroom attachments |

Not run: any runtime suite, install, provider action or test. The
attachment bytes in the workroom were not fetched; identity rests on
the local file hashes matching the hashes quoted in the approvals.
