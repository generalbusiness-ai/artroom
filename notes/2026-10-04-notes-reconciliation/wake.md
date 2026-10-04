# Wake and schedule note: reconciliation checklist

Request `50d7806a`, input 1. Edited file:
`notes/2026-10-01-wake-and-schedule.md` in worktree
`/Users/hughpyle/play/artroom-worktrees/notes-reconcile` (branch
`request/notes-reconcile`). Line numbers refer to the
edited file (973 lines). "008" is
`plans/008-2026-10-03-wake-and-schedule-clarification.md`. "007" is
`plans/007-2026-10-03-attention-runtime-handoff.md`. "Rev 2" is the
note at `337a449d`.

## A. Original request `24711ceb`: conditions

| # | Item (source) | Where the reconciled note delivers it | Note |
|---|---|---|---|
| A1 | "one pipeline for event and scheduled triggers built on notify rules and the attention queue" (24711ceb conditions) | §1 Summary, lines 50-86; §2, lines 88-103 | Diagram kept with two sources; tail extended to "receiver reads and keeps its input" and "room records the actual outcomes" per 008 "Direction retained" |
| A2 | "defines schedules" | §3 "What a schedule is", lines 155-187 | JSON example unchanged; field table rewritten for `id`, `cron`, `to`, `scope`, `coalesce` |
| A3 | "defines ... firings" | §3 "How a firing works", lines 279-311; "Slots and firing identity", lines 261-277 | Rewritten: 5 steps became 7; original event fields kept |
| A4 | "defines ... missed ... firings" | §3 "Missed firings", lines 313-323; "Recovery", lines 324-348 | One event per schedule kept as Adopted; detail added as Proposed |
| A5 | "defines ... coalesced firings" | §3 "Coalescing", lines 350-391 | Rewritten: unit-based |
| A6 | "where output goes" | §3 "Reports and housekeeping output", lines 420-429 | Four rows kept; outside-send row and report row extended |
| A7 | "defines waking for a local watcher" | §4 table line 439; source statement lines 443-449; examples lines 451-463; "The local watcher's recovery boundary", lines 620-634 | Rewritten: marked Planned, not shipped |
| A8 | "defines waking for ... a wake address" | §4 table line 440; "The receiver owns its read position", lines 468-497; "Wake delivery rules", lines 636-659 | Rewritten: cursor advisory, route private |
| A9 | "defines waking for ... pi-durable" | §4 table line 441; "pi-durable fit", lines 661-673; "The durable hosted receiver", lines 499-542 | Rewritten: exactly-once claim removed; deduplication marked Untested in the table cell and in the list |
| A10 | "covers loops" | §5 Loops and budget accounting, lines 681-720 | Original three guards unchanged; accounting added as Proposed |
| A11 | "covers ... cost" | §5 Cost, lines 722-723 | Unchanged from original, marked Adopted |
| A12 | "covers ... authority" | §5 Authority, lines 725-730; §1 line 80 | Original kept; two sentences added from 008 §5 |
| A13 | "covers ... secrets" | §5 "Secrets in schedule text", lines 732-739; "Wake secrets and routes", lines 741-759 | Original sentence kept; extended |
| A14 | "covers ... prompt injection" | §5 Prompt injection, lines 761-766 | Original kept; attribution through every receiver added |
| A15 | "says what is recorded where" | §6, lines 768-781 | Original 5 rows kept (2 reworded); 5 rows added |
| A16 | "names the contract changes" | §7, lines 783-806 | Three parts kept; qualifications marked Proposed |
| A17 | "names ... staging" | §8, lines 808-839 | Five stages, order and original owners kept |
| A18 | "passes checker's review" | §9 review history, lines 852-866 | Not satisfied by this edit. Rev 2 received changes review `2acf4f43`. Revision 3 is recorded as "Not yet reviewed" (line 860) |
| A19 | "the simple version of 'trigger this agent when X happens in the room'" (24711ceb text) | Header lines 7-10; §1 lines 60-62; §2 lines 90-103 | Unchanged from original |
| A20 | "valuable in any configuration" (24711ceb text) | §4 three ways, lines 433-441; external cron, lines 402-408 | Kept; "None replaces the others" added from 008 §6 |
| A21 | "especially clean with pi-durable" (24711ceb text) | §4 line 441 and lines 661-673 | Kept as Untested; guarantee corrected |
| A22 | "the scheduled ('cron') version for daily housekeeping and reporting work" (24711ceb text) | §3 examples lines 163-177; lines 202-225 | Examples unchanged; classified per 008 §2 |

## B. Adopted decision `154f25d8` and dated pins kept

| # | Item (source) | Where | Note |
|---|---|---|---|
| B1 | Three-part amendment adopted in staging order (154f25d8; Rev 2 §9.1) | §9 line 845; §7 lines 785-803 | Unchanged decision; part 1 qualified as Proposed |
| B2 | 60 wakes per member per hour, 20 per lane per hour (154f25d8) | §5 lines 683-684; §9 lines 846-847 | Unchanged |
| B3 | 15-minute minimum interval, 20 schedules per room (154f25d8) | §3 field table line 183; §5 lines 722-723; §9 line 847 | Unchanged; "checked between actual slots" added (008 §3) |
| B4 | A schedule may name an application-pack prompt, stage 3 (154f25d8) | §9 lines 848-849; §3 line 185; §8 line 817 | Unchanged |
| B5 | `coalesce` defaults to true (Rev 2 §5; 008 "Direction retained") | §3 line 187 and line 352; §5 line 723 | Unchanged |
| B6 | All five stages and their order (008 "Direction retained") | §8 lines 810-819 | Kept; outcomes column uses 008's still-owed wording |
| B7 | Estimates and contest demo do not reduce scope (2acf4f43; 008) | §8 lines 830-839 | Kept as History, with original figures |
| B8 | Pin: Artroom `main` at `8189d66`; R-POL-5, R-LOG-13, R-ADMIN, R-SEC; contract file paths | Header lines 12-13; §12 lines 929-936 | Unchanged from original |
| B9 | Pin: pi-durable announcement URL | §12 last line (973); header line 17 | Unchanged |
| B10 | Pin: request `3f23ea89` for pi-durable integration | §4 line 441; §8 line 819 | Unchanged; C3 `13dfc613` named beside it |
| B11 | Pin: related notes on `request/mcp-plan` and `request/docs-plan` | §12 "Related notes" | Unchanged |
| B12 | Pin: date 2026-10-01, Revision 2 line | Header line 3; §9 line 843 | Unchanged; Revision 3 line added (lines 4-7) |
| B13 | Judgement and Untested labels (Rev 2) | Lines 80, 407, 458, 649, 822; header lines 12-21 | Kept; Source labels and five status words added (lines 23-34) |

## C. Clarification 008: six corrections

| # | Item (source) | Where | Note |
|---|---|---|---|
| C1a | Correction 1: receiver's own durable checkpoint; wake cursor advisory only; first page for a new receiver; cursor kinds not interchangeable (008 §1) | §4 "The receiver owns its read position", lines 468-497; delivery rule 1, lines 638-640 | Rewritten in place; Rev 2 text named as unsafe |
| C1b | Correction 1: carry the 007 boundary, items 1 to 4 (008 §1) | §4 "The durable hosted receiver", lines 499-542; "Catch-up", lines 544-590 | New, Proposed, owner C3 |
| C1c | Correction 1: retention or repeated identity proves no command, effect, review or landing; spike is not the proof; Pi announcement separates submission from tools (008 §1) | §4 "What retained input does not prove", lines 593-618; pi-durable fit, lines 664-670; table line 441 | Rewritten; "exactly once" claim removed |
| C1d | Correction 1: watcher `--exec` boundary: start intent, result, uncertain launch, safe retry, durable spool, `--once` remainder (008 §1) | §4 "The local watcher's recovery boundary", lines 620-634 | New, Proposed |
| C1e | Correction 1: workspace saves, signed-act replay, unknown-command settlement keep separate boundaries; no fresh tools after revocation (008 §1) | §4 lines 602-609 | New |
| C2a | Correction 2: closure by `because` only for informational policy or note notices; admitted act by the addressee; eligible kinds named by contract (008 §2) | §2 "Acknowledging a notice by citing it", lines 105-125; §7 item 1, lines 788-793 | Rewritten in place |
| C2b | Correction 2: review, check, generation, lease, publication keep authoritative predicates (008 §2) | §2 lines 127-138 | New, with Source label |
| C2c | Correction 2: schedule classified at activation: informational notice or action request; scope does not decide (008 §2) | §3 "What a schedule asks for", lines 189-200; field table line 186 | New, Proposed |
| C2d | Correction 2: daily housekeeping is a non-scoped action request; work identity, recorded result or no-findings outcome; N2/D1 lifecycle (008 §2; f965c475) | §3 lines 202-218 | New, Proposed |
| C2e | Correction 2: weekly report incomplete until landed; cancellation and supersession not success; no invented acceptance field (008 §2) | §3 lines 220-229 | New |
| C2f | Correction 2: browser shows outcomes beside activity; prepared kind and binding fix meaning (008 §2) | §2 lines 144-151 | New |
| C3a | Correction 3: activation generation; pinned definition, cron/zone meaning, task; pack revision and digest; unresolved if unavailable (008 §3) | §3 "Activation and task meaning", lines 231-245 | New, Proposed |
| C3b | Correction 3: edit, removal, reused ID, reverted bytes; not retroactive; frontier split between generations (008 §3) | §3 lines 246-259 | New, Proposed |
| C3c | Correction 3: slot is a UTC instant; repeated and missing local times; reproducible evaluator; 15-minute check on actual slots (008 §3) | §3 "Slots and firing identity", lines 261-272; line 183 | New, Proposed |
| C3d | Correction 3: `id@scheduledTime` is shorthand; identity is room, generation, slot or window (008 §3) | §3 lines 273-277; field table line 182 | Rewritten in place |
| C3e | Correction 3: private due frontier; window `(frontier, cutoff]`; missed summary with earliest instant, count, interval, recording time; one task; no slot dropped (008 §3) | §3 lines 287-290 and "Missed firings", lines 313-322 | Earliest missed time and count kept as Adopted; covered interval and recording time added as Proposed |
| C3f | Correction 3: window identity kept before bounded calculation; clock regression; shared alarm keeps lease and publication duties (008 §3) | §3 "Recovery", lines 328-334; step 1, lines 281-286 | New, Proposed |
| C3g | Correction 3: firing, effects and frontier in one transaction, or keyed completion intent; no second outbox (008 §3) | §3 "Recovery", lines 335-348 | New, Proposed |
| C3h | Correction 3: public facts versus private operational state; a firing is a request, not completion (008 §3) | §3 lines 310-311 and 393-398; §6 lines 774-775 | New |
| C4a | Correction 4: targets resolved at commit; concrete identities kept (008 §4) | §3 step 4, lines 296-299; field table line 184 | New, Proposed |
| C4b | Correction 4: three coalescing units: informational notice, non-scoped action, scoped work (008 §4 table) | §3 "Coalescing" table, lines 358-362 | New table |
| C4c | Correction 4: old generation does not block new; removal not success; blocked work shown (008 §4) | §3 lines 366-373 | New |
| C4d | Correction 4: what decides openness; A and B example; release; accurate coalesced summary; coalescing off (008 §4) | §3 lines 374-391 | New |
| C5a | Correction 5: rolling 60-minute window; attempt, retry, batch, lane charging; shared lane limit (008 §5) | §5 "How a wake is counted", lines 689-705 | New, Proposed |
| C5b | Correction 5: reservation before send; uncertain send keeps charge; held payload not charged; clock (008 §5) | §5 lines 699-705 | New |
| C5c | Correction 5: exhaustion keeps input and hint; status; coalesced admin alert; alert obeys budgets (008 §5) | §5 "When a budget runs out", lines 707-715 | New; original admin item kept at lines 685-687 |
| C5d | Correction 5: wake limits do not bound watcher command starts or C3 catch-up; debounce changes latency only; own-author rule (008 §5) | §5 lines 717-720; delivery rules 2 and 4, lines 641-650 | New |
| C5e | Correction 5: public route reference versus private endpoints, secrets, generations, diagnostics; token URL unsafe; never in history, log, receipts, diagnostics (008 §5) | §5 "Wake secrets and routes", lines 741-749; §6 lines 776-778; §7 item 3 | Rewritten: Rev 2 put the address itself in the roster |
| C5f | Correction 5: provisioning, routing change, rotation and retirement; HMAC and receiver rate limits; wire format open (008 §5) | §5 lines 750-759; delivery rule 5, lines 651-659 | New |
| C5g | Correction 5: R-SEC on pack prompt and arguments at activation; provenance; credentials out of prompts; N7 separate (008 §5) | §5 lines 732-739; lines 675-677 | Extended |
| C6a | Correction 6: `8189d66` has no CLI watcher; command map at `e6e67828` has no `watch`, `--once`, `--exec`; stage 1 owes it (008 §6; 2acf4f43 item 6) | §4 lines 439 and 443-449; §7 lines 804-806; §8 line 815; §12 | Rewritten in place |
| C6b | Correction 6: external cron can start an agent or read adapter with no amendment; `artroom watch` examples marked future (008 §6) | §3 "Why schedules belong in the room", lines 402-408; §4 lines 451-463 | Rewritten in place |
| C6c | Correction 6: keep all three routes; schedules and HMACs not prerequisites for C3's loop; harness examples need cold-run evidence (008 §6) | §4 lines 433-435 and 461-463; §8 lines 825-828 | New |
| C6d | Correction 6: output: notes, landed reports, D1/N2 work, publication separate; outside sends need authorization; attempt is not delivery (008 §6) | §3 output table, lines 424-429 | Extended |

## D. Event and schedule pipeline, owners and scenarios (008)

| # | Item (source) | Where | Note |
|---|---|---|---|
| D1 | Pipeline: matching act or due schedule (008 "Direction retained") | §1 diagram lines 54-58; §2; §3 | Kept |
| D2 | Pipeline: recorded attention or scoped work | §1 lines 63-66; §3 step 5, lines 300-302 | Rewritten |
| D3 | Pipeline: content-free wake hint | §1 lines 68-75; §4 delivery rule 1 | Kept, qualified |
| D4 | Pipeline: receiver reads and retains input | §4 lines 468-542 | New |
| D5 | Pipeline: agent submits ordinary admitted acts | §1 lines 80-82; §3 step 7, lines 304-308 | Kept |
| D6 | Pipeline: room records the actual outcomes | §1 lines 77-79; §6 line 781 | New |
| D7 | Stage table with still-owed outcomes (008 "Direction retained") | §8 lines 813-819 | Merged with original owners column |
| D8 | Acts work ahead of this correction; builder judges readiness; no Jam gate; Jam and manual proceed together (008) | §8 lines 821-828 | New |
| D9 | Owners, dependencies and unresolved choices table, 8 rows (008) | §10, lines 868-897 | New; 8 rows carried; 1 open-choice row added from 007 (cursor in hint, line 881); class expression stated without an owner at lines 889-893 |
| D10 | Acceptance scenarios, 10 rows (008) | §11 rows at lines 905, 910-918 | New; marked Proposed, not run |
| D11 | Validation limits: focused witnesses, no runtime suite (008) | §11 lines 920-925 | New |
| D12 | Evidence statement: read-only, no live wake or schedule (008 "Evidence used") | Header lines 12-21; §12 | New |
| D13 | Review status of 007 and 008; original request still owed (8365e4c4; 6068751a) | Header lines 28-32; §9 lines 852-866 | New |

## E. Private handoff 007

| # | Item (source) | Where | Note |
|---|---|---|---|
| E1 | Source observations on attention reads at `e6e67828` and the skip risk (007 "Why this needs a handoff") | §4 lines 470-486 | New, Source label, "no runtime counterexample" kept |
| E2 | pi spike does not settle it: caller-driven `requestId`, alarm loop and attention bridge not built (007) | §4 lines 613-618 | New, Source label; the spike was read for 007, not again for this edit |
| E3 | Delivery flow 1: own attention cursor, first page, advisory hint, distinct cursors (007) | §4 lines 488-497 | New |
| E4 | Delivery flow 2: one transaction, disposition for every item, bounded pages, fencing (007) | §4 items 1-2, lines 505-516 | New |
| E5 | Delivery flow 3: stable identity, provenance, both crash windows (007) | §4 items 3-4, lines 517-525 | New |
| E6 | Delivery flow 4: delivery record is not finished work; tools pass ledger and fences (007) | §4 lines 598-601 | New |
| E7 | Delivery flow 5: read current state before delayed dispatch; record obsolete disposition (007) | §4 item 6, lines 529-533 | New |
| E8 | Lost wake needs a named catch-up path; paused task stays paused; browser disconnect (007) | §4 item 7, lines 534-537; "Catch-up", lines 548-554; §1 lines 72-75 | New; Rev 2 "never correctness" sentence rewritten |
| E9 | Catch-up when visible work changes: fresh scan, separate progress, selection generation, detection, skipped items, budget, explicit exclusion (007) | §4 "Catch-up", lines 555-590 | New |
| E10 | `because` closure does not replace review, check, landing, publication or requester acceptance (007 "Authority and recorded outcomes") | §2 lines 116-142 | Rewritten |
| E11 | Declared kind and binding; three separate boundaries (007) | §2 lines 148-151; §4 lines 602-606 | New |
| E12 | C1/C3 control rules: device A/B revocation, owner removal, reconnect (007) | §4 lines 607-612 | New |
| E13 | N7 human notification is separate (007) | §4 lines 675-677; §10 line 887 | New |
| E14 | Decisions and dependencies table, 7 rows (007) | §10, lines 877-887 | Carried through the 008 owners rows; cursor row at line 881 |
| E15 | Acceptance scenarios, 7 items (007) | §11 rows at lines 905-909 and 911 | New; folded into rows 1-3, 5 and 7; the author-text scenario has its own row (line 908) |
| E16 | No second public outbox, no Room and Agent transaction (007) | §4 lines 540-542; §3 lines 346-348 | New |

## Drift and open points

Items 1 to 6 change meaning and the clarification settles them. They
were rewritten in place. Items 7 to 13 are not settled by the
clarification. The note states them as open or keeps both texts. None
was decided by the editor.

1. **Roster wake field (settled).** Rev 2 §4 and §7 put the wake
   address itself (URL or service binding name) in the member's roster
   entry, in a field named `wake`. 008 §5 makes the endpoint private
   and lets the roster hold only a safe non-secret route reference.
   This narrows adopted part 3 of the amendment. The note keeps the
   adopted `wake` field and marks 008's limits as Proposed (lines 440,
   741-749, 798-802).
2. **Citation closes less (settled).** Rev 2 let any citing act
   ("a report, a note, a claim or a review") close any open item. 008
   §2 limits this to informational notices. This narrows adopted part 1
   (lines 116-125).
3. **Non-scoped firing is no longer only a bare attention item
   (settled).** Rev 2 gave a bare item when there is no `scope`. 008 §2
   adds an addressed work unit for a non-scoped action request (lines
   198-214, 296-298).
4. **pi-durable "exactly once" removed (settled).** Rev 2 said
   pi-durable "runs each item exactly once". Now: deduplicated
   submission only (lines 441, 664-670).
5. **"A lost wake costs latency, never correctness" removed
   (settled).** 007 says the queue alone does not make a receiver run
   again (lines 72-75, 548-552).
6. **"The watcher works today" removed (settled).** (lines 804-806).
7. **Does the ping still carry a cursor? (open).** Rev 2 fixed the body
   as `{ room, member, cursor }`. 008 says "a wake cursor, if
   included". 007 leaves the choice to the wake design. The note says
   the hint names the room and member and that any cursor is advisory,
   and lists the choice as open (lines 440, 881).
8. **How a schedule declares its class (open).** 008 requires
   classification at activation but names no field or rule, and no
   source names an owner for the choice. The note adds no field to the
   JSON example and says only what the sources say (lines 889-893).
9. **Missed window across a generation switch (open).** 008 keeps "one
   event per schedule" for a missed window and also bounds each window
   by its activation. It does not say whether a missed interval that
   spans an edit gives one summary or one per generation. The note
   states both rules and does not resolve this (lines 254-259, 313-323).
10. **Review exemption for `reports/**` (possible conflict).** Rev 2
    says policy can exempt `reports/**` from review for the reporter.
    008 §6 says reports are "reviewed and landed through a lane" and
    scenario 3 says a report "reaches normal review". 008 §2 says
    "required reviews". The note keeps the Rev 2 sentence and adds
    "the reviews that policy requires" (line 427). A reviewer should
    confirm whether the exemption stands.
11. **Stage 5 owner.** Rev 2 names request `3f23ea89`. 008 gives the
    durable receiver to C3 `13dfc613` and does not mention `3f23ea89`.
    The note names both (lines 441, 819).
12. **Per-member secret versus route generation.** Rev 2 has "a
    per-member wake secret". 008 speaks of a "route/secret generation".
    The note keeps "per-member" and adds generations (lines 651, 753).
    Whether one member can have several routes with separate secrets is
    not stated in either text.
13. **Stage owners.** Rev 2 names lanes E, M, A, F and the planner. 008
    names owners by request (C1, C3, D1, N2, N6, N7, "stage 1 CLI/docs
    owners"). The note keeps the Rev 2 lane names in §8 and the 008
    owners in §10. It does not map one set onto the other.

Other points for the builder:

- `plans/005`, `plans/007` and `plans/008` are untracked files in the
  shared checkout. They are not on `request/notes-reconcile` (that
  branch has `plans/001` to `004` and `README.md`). The note names
  them by path and says where they live (§12). If the branch should
  carry them, that is a separate change outside this one-file edit.
- `plans/005` was not read in full. The note only repeats what 008 and
  007 say about it.
- The 007 file's own status line says "pending independent design
  review". The workroom shows approval `78be0cd1` and adoption
  `34c5274b`. The note reports the workroom status and leaves the
  007 bytes alone.
- §12 "Sources" was §10 in Rev 2. Two sections were inserted before it
  (§10 owners, §11 scenarios). Only
  `notes/2026-10-02-collections-of-rooms.md` refers to this note, and
  it does so by path, not by section number.
- The note grew from 292 lines (14,179 bytes) to 973 lines.
- All workroom ids resolved. `24a58dd6` resolved but has an empty
  statement text; it is not cited in the note.

## Independent check

An independent reviewer compared revision 3 with 008, 007, Rev 2 and
the request (`wake-verify.md` in this directory). It reported 14
findings. I checked each against the sources. All 14 were right and
all 14 were applied. Line numbers are in the edited file.

| # | Finding | What I did |
|---|---|---|
| 1 | pi-durable deduplication stated flatly in the wake table | Cell rewritten; deduplication marked **Untested**, proof still owed (line 441) |
| 2 | Earliest missed time and count relabelled Proposed | Restored as Adopted with Rev 2's wording; only covered interval and recording time are Proposed (lines 315-322) |
| 3 | Paused task: "new tools and lease renewals stopped" omitted | Added to item 7 as "stay stopped, as already specified" (lines 535-539). Also added 007's "pause and revocation still stop new mutating tools" (lines 581-582) |
| 4 | Opening said every revision 3 fact names the `e6e67828` pin | Opening rewritten: pin applies unless the sentence names another source; observations come from the reviewed plans (lines 12-21) |
| 5 | "`main` does not return a principal revision today" was an unpinned fact | Replaced with 007's caution: the design must not imply it (lines 589-591) |
| 6 | Proposed qualifications under Adopted labels | Three places marked **Proposed**: work unit (lines 63-67), slot check (line 183), target resolution (line 184) |
| 7 | Owner row dropped "preserve their separately reviewed lifecycle and authority" | Restored in the D1 and N2 row (line 884) |
| 8 | Owner row for the schedule-class choice is in no source | Row removed. A paragraph now says only that neither plan says how the class is expressed or names an owner (lines 889-893). The reviewer's suggested Judgement was not added, per the coordinator's ruling |
| 9 | "Each receiver needs a named catch-up path" wider than the sources | Replaced: the durable hosted receiver must name its catch-up path and budget (lines 72-76) |
| 10 | Order of work omitted test reduction | Added "Test-overhead reduction stays first (`plans/007`)" (lines 821-822) |
| 11 | Two 007 statements shortened | Added "do not claim that the current read contract is broken" (lines 562-565) and the scan-page and selection-generation sentence (lines 566-574) |
| 12 | One 007 scenario and one 008 sentence dropped | Scenario row added (line 908); "Reuse the approved `plans/007` evidence where it is unchanged" added (lines 922-923) |
| 13 | Present-tense watcher sentence in Prompt injection | Now "the planned watcher" (lines 762-763). I did not use the reviewer's "must", which no source states |
| 14 | Adopted field name `wake` gone | §7 item 3 restored to Rev 2's wording; 008's limits follow as Proposed (lines 798-802) |

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
grep -n "-\|software scale" notes/2026-10-01-wake-and-schedule.md
#   no output

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
