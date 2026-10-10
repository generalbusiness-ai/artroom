# jj note reconciliation checklist (request 50d7806a)

Edited files, on branch `request/notes-reconcile`:
- `notes/2026-10-01-research-jj.md`, the reconciled note;
- `notes/2026-10-01-artroom-plan.md`, one paragraph of section 3 and a dated revision note, on the planner's direction `fceb27d0`.

Line numbers in this checklist are those of the note as it was at commit `b878fee9`. One later rewording, of the sentence about the "latest release" in section 8 (planner note `415314b0`), made that passage one line longer: every line after 626 is now one line lower than the number given here.

The first reconciliation is at commit `508ac63b`. The changes that apply direction `fceb27d0` were in the working tree when this checklist was written, on 2026-10-04; they were committed afterwards, at `b878fee9`.

- Before: 247 lines, 12,816 bytes, SHA-256 `8563588cd23c7047eb3572bd61b78b432b87eef85141e467cb08d63b72aa516f` (matches the identity the clarification gives for commit `b3050dc6`).
- At commit `508ac63b` (with the independent check applied): 667 lines, 37,755 bytes, SHA-256 `166871a97f04633e7919cb960dd5b620518271a1e5e1bf65cbb5006943e18d67`.
- After direction `fceb27d0` (working tree): 689 lines, 39,187 bytes, SHA-256 `066c8106222a22713f3b9128727b8a8209a2375d591082c2c5154c589e18b6d8`.
- Plan after its one-paragraph edit (working tree): 1201 lines, 55,795 bytes, SHA-256 `a91e9fc5fb4c95b2552a46066ad3a375ff4499db38b095fa99c8605c0d0b1f13`.
- Input: `plans/011-2026-10-04-jj-clarification.md`, 25,637 bytes, SHA-256 `cd74665c0e516d30edfdc078d18f2410574d8ec2f6a221d383c62ab175e3139b` (verified).

Line numbers in sections A and B refer to the note in the working tree, after direction `fceb27d0`. "011" means the clarification; "6649" means changes review `6649bb50`.

## A. Original conditions of request 966aeaad

| # | Item (source) | Where delivered (section, lines) | Note |
|---|---|---|---|
| A1 | "Write a sourced note, notes/2026-10-01-research-jj.md" (966aeaad text) | Whole file; section 8, lines 609-659 | Path unchanged; sources extended |
| A2 | "states what each system is for" (text) | Section 1, lines 57-94 | Rewritten: jj not limited to one developer; Artroom orders signed acts |
| A3 | Overlap: change identity (text) | Section 2 line 105; section 3 line 144 | Rewritten with profile limit |
| A4 | Overlap: operation log (text) | Section 2 line 108; section 3 line 146; section 4 lines 225-241 | Rewritten; retention limit added |
| A5 | Overlap: conflicts (text) | Section 2 line 111; section 4 lines 243-290 | Rewritten |
| A6 | Overlap: concurrency (text) | Section 2 line 110; section 3 line 148; section 4 lines 183-223 | Rewritten |
| A7 | Overlap: undo (text) | Section 2 line 109; section 3 line 147; section 5 item 4, lines 455-471 | Rewritten |
| A8 | Overlap: workspaces (text) | Section 2 lines 112, 114-116; section 3 line 149 | Kept; storage limit added |
| A9 | Differ: local tool versus shared sequencer (text) | Section 4 lines 176-223 | Rewritten |
| A10 | Differ: authority (text) | Section 4 lines 176-181, 225-241, 292-299 | Rewritten |
| A11 | Differ: review and policy (text) | Section 4 lines 272-290, 292-299 | Rewritten; existing policy rule credited |
| A12 | "what Artroom could borrow from jj" (text) | Section 5 lines 307-471 | Decisions unchanged; evidence updated |
| A13 | "and what it should not" (text) | Section 5 lines 473-485 | Kept; widened to headers per 011 |
| A14 | "how the plan's section 3 sentence about jj should read" (text) | Section 6 lines 487-531 | Rewritten: 011's text replaces the first proposal |
| A15 | "The note is in notes/" (conditions) | File path | Unchanged from original |
| A16 | "cites jj's own documentation and changelog with versions and dates" (conditions) | Lines 33-39; section 2 lines 118-129; section 8 lines 611-632 | Links pinned to v0.45.1; first retrieval kept as history |
| A17 | "keeps every comparison factual and qualified per the competition's content limits" (conditions) | Lines 59-60, 72-76, 91-94, 139-140; Source and Judgement markers throughout | Kept "neighbour, not a competitor"; blanket claims removed |
| A18 | "separates sourced facts from judgement and from untested claims" (conditions) | Lines 24-32 (definitions); markers throughout | Kept and made explicit per passage |
| A19 | "offered to checker for review before any plan change rests on it" (conditions) | Section 6 lines 489, 520-531 | The note was reviewed before the plan changed. The plan paragraph was then replaced on direction `fceb27d0` (plan lines 199-211) |
| A20 | Promise bfb563fe: "the jj research note on branch request/research-jj, for checker's review" | Lines 3, 11-15; section 9 line 665 | First version identity kept as history |

## B. Clarification 011 and accepted corrections

### Correction group 1: concurrency scope

| # | Item (source) | Where delivered | Note |
|---|---|---|---|
| B1 | Operation-view reconciliation stated apart from working-copy mutation (6649 group 1; 011 sections 2, 4) | Section 2 line 110; section 4 lines 188-201 | Rewritten; "lock-free concurrency" row replaced |
| B2 | Git backend "not entirely lock-free"; ordinary I/O failures (011 section 4) | Lines 193-194 | New |
| B3 | Working-copy interface takes a lock for mutation (011 section 4) | Lines 195-197 | New; the pinned v0.45.1 working-copy interface is listed in §8, line 617 of the frozen note at `18e2d07731c70c000bbb16c2b26cda9215192de6` (SHA-256 `2b276d1312ba3f0fc605b0f499a4328b65f7fc33ec06c1a30c7fe10c3738b726`) |
| B4 | No "commands never wait", "writes always succeed" or safe uncoordinated mutation of one working copy (6649 group 1; 011 section 4) | Lines 199-201 | Rewritten; the quote "cannot fail to commit" removed because 011 corrects it |
| B5 | Contrast with sequenced admission kept; a stale or unauthorised act cannot be merged into authority (011 section 4) | Lines 203-217 | Rewritten |
| B6 | Parallel editing remains valuable; proposals, prepared commits, evidence and reservations have distinct fences (011 section 4) | Lines 219-223; section 3 line 148 | Rewritten ("never wait to edit, only to land" removed) |
| B7 | The plan sentence keeps the qualification (6649 group 1; 011 section 6) | Lines 506-512, 514-518 | Rewritten |
| B8 | Short answer no longer says "concurrency without locks" (6649 lines 35-37) | Lines 84-89 | Rewritten |

### Correction group 2: conflict data versus failed integration

| # | Item (source) | Where delivered | Note |
|---|---|---|---|
| B9 | jj conflict stored as ordinary Git objects; root `.jjconflict-*` trees; `jj:trees` header carries the jj meaning (6649 group 2; 011 section 4) | Lines 255-259 | Rewritten |
| B10 | `--allow-conflicts` is an explicit escape from the normal push refusal (011 section 4) | Lines 260-261 | Kept from original, moved |
| B11 | Simplification can happen; no guarantee that arbitrary conflicts resolve themselves (011 section 4) | Lines 251-254 | Rewritten |
| B12 | R-LAND-4 governs an unresolved Git merge; holder owns the recut (011 section 4) | Lines 263-267 | Kept from original |
| B13 | A jj-encoded conflict inside a mergeable head is a separate case; neither tree validity nor R-LAND-4 excludes it (6649 group 2; 011 section 4) | Lines 268-270 | Rewritten; "Artroom cannot publish a conflict: main must be a tree Git tools can use" removed |
| B14 | Existing default-pack `jjConflicts` rule: added or modified paths and rename destinations, on `propose`, before outside-claim, deletions excluded (011 section 4) | Lines 272-278 | New; read in `packages/policy/src/pack.ts`; rule id and function name both given |
| B15 | Changes-only policy decision, not a whole-head scan; legacy content, removals and recovery need their own rules; open point 38 (011 section 4) | Lines 278-284 | New |
| B16 | Application should state a resolved-content requirement in policy and evidence; no widening, no new scan (011 section 4) | Lines 286-290 | New Judgement |
| B17 | The old "probably refused as outside-claim or fail its checks" is not evidence (6649 group 2; 011 section 4) | Section 5 item 1, lines 331-335 | Kept as history, marked |
| B18 | The rule is not to be commissioned again or described as missing (011 section 5 item 1) | Lines 365-371; section 7 line 551 | New |

### Correction group 3: sources and interoperability evidence

| # | Item (source) | Where delivered | Note |
|---|---|---|---|
| B19 | jj baseline is pinned v0.45.1, retrieved 2026-10-04 (011 preamble, section 9) | Lines 33-39; section 8 lines 611-621 | Rewritten |
| B20 | Baseline is not a claim about the latest release or every client version (6649 group 3; 011 preamble) | Lines 37-40, 126, 623-627 | Rewritten. The first version's "latest release" is recorded as the claim that note made on 2026-10-01, and is not confirmed (planner note 415314b0) |
| B21 | Original retrieval date 2026-10-01 and the moving `main` links (original note section 8) | Lines 623-632 | Kept as history |
| B22 | `change-id` header default, 0.30.0, 2025-06-04 (original; 011 section 2) | Line 122 | Unchanged pin |
| B23 | `jj gerrit upload`, 0.34.0, 2025-10-01, experimental; not a complete review service (original; 011 section 2) | Line 123 | Pin unchanged; qualifier added |
| B24 | `jj run`, 0.43.0, 2026-07-01 (original; 011 section 2) | Line 124 | Pin unchanged; "edits and conflicts propagate to descendants" kept, marked as read 2026-10-01 and not re-read at the pin |
| B25 | `jj converge`, 0.45.0, 2026-09-02; non-interactive failure possible (original; 011 section 2) | Line 125 | Unchanged pin |
| B26 | Comparison baseline 0.45.1, 2026-09-03 (original; 011 section 2) | Lines 33, 126 | Unchanged pin |
| B27 | Release dates describe the source baseline, not a capability measured in Artroom (011 section 2) | Lines 128-129 | New |
| B28 | Compatibility limits: no Git hooks, partial clones, Git LFS or full submodule working-copy support; commit signing supported (011 section 2) | Lines 131-135 | Rewritten ("no submodules" corrected) |
| B29 | Artroom snapshot pinned for each source claim: main `e6e6782830e0ca8a68f0d11c4d4ece5e4e98c967` (6649 group 3; 011 section 9) | Lines 41-47, 203, 234, 263, 272, 336, 343, 365, 389; section 8 lines 634-647 | New |
| B30 | Historical sources at `b3050dc6`: original note and plan revision 4 (011 section 9) | Lines 11-15; section 8 lines 649-652; section 9 line 665 | Kept as history |
| B31 | "Worth doing" is an adopted direction, not demonstrated current support (6649 group 3) | Lines 318-321, 325 | New |
| B32 | Header test source `packages/git/test/jj-change-id.test.ts`; stand-ins; actual-jj case conditional on install (011 section 5 item 1) | Lines 336-342 | New; replaces "Untested: header survives" |
| B33 | Saved result identity: path, 8,383 bytes, SHA-256 `228e6850...`; two lanes, fast-forward and merge (011 section 5 item 1) | Lines 343-349 | New; bytes and digest re-checked by `shasum` |
| B34 | New merge commit does not itself carry `change-id`; reachable original is not a copied header (6649 group 3; 011 section 5 item 1) | Lines 350-353; section 7 line 597 | New |
| B35 | Evidence boundary: measurement-only Worker, stand-in Room, no production admission; JSON does not pin jj version (011 section 5 item 1) | Lines 354-364 | New |
| B36 | Untested: deployed client compatibility, live review-to-publication, ignored-file and operation-store recovery, device continuity; C2 owns witnesses (011 section 5 item 1) | Lines 372-378 | New |
| B37 | Nothing rerun; saved results credited within their limits (011 preamble, section 9) | Lines 49-51, 685-689 | Rewritten ("Nothing here was measured") |
| B38 | "Local evidence is not shared Room authority or provider proof" (request 50d7806a) | Lines 50-51 | New |
| B39 | Source, Judgement, Untested definitions (011 preamble) | Lines 24-32 | Rewritten; spelling "Judgement" kept |

### Correction group 4: declared applications and ownership

| # | Item (source) | Where delivered | Note |
|---|---|---|---|
| B40 | Lane and generation are the code-review profile's analogy; declared kinds and recorded bindings are authoritative (6649 group 4; 011 sections 1, 3) | Section 3 line 144, lines 165-172 | Rewritten |
| B41 | Two limits: a lane holds several changes, headers can be duplicate or divergent; Room outcome is separate from an agent's description (011 section 3) | Lines 157-163 | New |
| B42 | Analogies do not equate identity, authority or proof (011 section 3) | Lines 139-140 | New |
| B43 | jj is not limited to a solitary developer; shares through Git remotes (011 section 1) | Lines 62-66, 176-181 | Rewritten ("one person's repository", "one owner") |
| B44 | Native responsibilities only; Gerrit upload shows integration with external review (6649 closing; 011 section 4) | Lines 72-76, 123, 292-299 | Rewritten |
| B45 | Conditional client compatibility; no hosted workspace, durable agent or cross-device continuity established (011 section 1) | Lines 78-82 | Rewritten ("So an agent can use jj inside an Artroom lane") |
| B46 | jj log: writer-supplied metadata; push does not carry operations; no permanent local retention (011 section 4) | Lines 227-232 | Kept; retention limit added |
| B47 | Artroom log: `refs/artroom/log`, independent verifier, proof limits; handle, user name, host name, header or commit signature cannot replace the actor signature, role or binding (011 section 4) | Lines 234-241 | Rewritten |
| B48 | Header is author-supplied display and grouping metadata; proves no signer, equivalence, verdict, authority or carry (6649 group 4; 011 section 5 item 2) | Lines 419-426 | Rewritten |
| B49 | Per-change display exists with mock data under `d0cbb26d`; live `changeHistory` and reads absent (011 section 5 item 2) | Lines 389-407 | New; follows the README; 011's phrase kept only as history, with the planner's correction |
| B50 | Bounds: 2,000 commits, depth 64, 100,000 entries, 2,000 lines, 10,000 bytes per line, 20 million work; blob read precedes bounds (011 section 5 item 2) | Lines 408-413 | New; figures match `packages/ui/README.md` |
| B51 | N1 and C5 reconcile the display; `d0cbb26d` keeps its obligations; no duplicate lane (011 section 5 item 2) | Lines 414-418 | New Judgement |
| B52 | Owners table: header, refusal, UI, live reads, hosted recovery, vocabulary, integration, with request ids (011 section 7) | Section 7 lines 548-556 | New; replaces "each needs its own request" |
| B53 | Hosted jj continuity needs `.jj` operation, store and view state and workspace references in the checkpoint (011 section 7) | Lines 558-571 | New Judgement |
| B54 | That is not a requirement that the first C2 or Jam task use jj (011 section 7) | Lines 573-576 | New |
| B55 | No new commissioning decision or first-Jam gate; Builder decides the Jam start; vocabulary may evolve (011 sections 5, 7) | Lines 318-320, 578-586 | New |
| B56 | Workspaces: other workspaces point to storage in the initial workspace (011 section 2) | Lines 114-116 | New |
| B57 | Eight acceptance scenarios (011 section 8) | Lines 588-602 | New; all eight rows kept |
| B58 | Reuse existing witnesses; focused controls only for changed boundaries (011 section 8) | Lines 604-607 | New |

### Recorded choices: borrow, reject, undecided

| # | Item (source) | Where delivered | Note |
|---|---|---|---|
| B59 | Hugh's 2026-10-01 choices: 1 and 2 worth doing, 3 not pursued, 4 undecided (original section 5; 011 section 5) | Lines 311-316 | Unchanged from original |
| B60 | Borrow item 1: jj as an agent's client, safely (adopted direction) | Lines 323-378 | Rewritten with current evidence |
| B61 | Borrow item 2: change history across generations (adopted direction) | Lines 380-426 | Rewritten with current evidence |
| B62 | Item 3: conflicted preparation, not pursued; changes R-LAND-4 and recut; benefit is a judgement (011 section 5 item 3) | Lines 428-445 | Kept as history; status marked |
| B63 | Item 3: gitseq cascade, 6 of 10 approvals, dated context, not a current rate, Untested kept (011 section 5 item 3) | Lines 447-450 | Kept; qualifier added |
| B64 | Item 3: no implementation, acceptance gate or Jam dependency (011 section 5 item 3) | Lines 452-453 | New |
| B65 | Item 4: undo vocabulary, undecided; four things it must not imply (011 sections 4, 5 item 4) | Lines 455-471 | Rewritten |
| B66 | Reject: reconcile-later for acts (original; 011 "What to avoid borrowing") | Lines 476-479 | Kept; wording aligned |
| B67 | Reject: user names, host names or headers as membership, approval or delegation (original; 011) | Lines 480-485 | Kept; headers added |

### Plan section 3 wording and record

| # | Item (source) | Where delivered | Note |
|---|---|---|---|
| B68 | Plan revision 4 sentence quoted: "jj offers first-class conflicts and an operation log." (original section 6; 011 section 6) | Lines 492-494 | Unchanged quotation, now in the past tense |
| B69 | 011's replacement text, verbatim (011 section 6, lines 313-319) | Lines 506-512 | Replaces the first proposal |
| B70 | First proposal withdrawn; its two broad claims named (6649 group 1) | Lines 496-501 | Kept as history, described not repeated in full |
| B71 | Replacement is a judgement; avoids lock-free, never-wait, always-commit and conflict-exclusion claims; no contract change, no universal compatibility (011 section 6) | Lines 514-518 | New |
| B72 | Plan now carries 011's paragraph as documentation; original promise 966aeaad / bfb563fe stays separate (011 section 6; e7cc8c03; cb4613c9; fceb27d0 item 1 and "ALL FOUR") | Lines 520-531; section 7 line 556 | Rewritten on direction `fceb27d0` |
| B73 | Dated revision line naming plans/011 and request 50d7806a (task) | Lines 7-15 | New; now also names direction `fceb27d0` |
| B74 | Identities: original note, review, clarification, request, promise, primary artifact, approval, guidance (011 preamble; e7cc8c03) | Section 9 lines 663-669 | New |
| B75 | Correction map by group (011 section 9) | Section 9 lines 678-683 | New, mapped to this note's sections |
| B76 | Approval confers no implementation closure, runtime certification, universal compatibility, deployment or Jam gate (e7cc8c03) | Lines 685-689 | New |
| B77 | History, adopted and proposed are told apart (request 50d7806a) | Lines 53-55; status lines 325, 382-383, 430-431, 457, 489; lines 535, 544 | New |

Row counts: section A, 20 rows. Section B, 77 rows. Total 97.

Changed artifact outside the note: `notes/2026-10-01-artroom-plan.md`. Lines 56-60 hold the dated revision note. Lines 199-205 hold 011's paragraph, and lines 207-211 hold its planning and untested qualifications. Nothing else in the plan is changed.

## Drift and open points

The planner answered items 1 to 14 in workroom assert `fceb27d0` (2026-10-04). Each item below gives the point, the answer and what was done. Line numbers refer to the note in the working tree.

1. **Plan section 3 wording.** The plan said "jj offers first-class conflicts and an operation log." **Answered by fceb27d0, item 1:** include the narrowly bounded plan edit in this delivery, as documentation. **Done:** plan lines 199-205 now carry 011 section 6's paragraph, lines 207-211 its planning and untested qualifications, and lines 56-60 a dated revision note. The note's section 6 says so (lines 489-490, 524-531). Nothing else in the plan is changed.
2. **Plan revision 4 treats lanes as the general model.** **Answered, item 2:** keep the older lane account as the code-review profile and as history, beside the recorded general declared-act direction; do not call unlanded candidate behaviour current main behaviour. **Done:** note lines 165-172. The plan's lane text is unchanged.
3. **`plans/011` is not on this branch.** **Answered, items 3-4 and "ALL FOUR":** frozen planning files are not branch-local source; keep canonical identities and say what is actually available. **Done:** note section 9 gives the artifact identity and says the file is not on this branch (lines 663-674). The file is not copied in.
4. **`plans/README.md` on this branch does not index C1 to C6, N1 to N7 or plan 005.** **Answered, items 3-4:** the dirty planner index is not branch-local source; do not copy it or assume missing paths exist; C1 and N1 keep the incorporation of plans 005 and 006. **Done:** note lines 654-659 and 563-564. **Still open, owner C1 `b538c5ea` and N1 `53016b8e`:** incorporation of plans 005 and 006. The request ids for N1, C1, C2, C3, C5 and C6 remain copied from 011.
5. **Rule name.** **Answered, items 5-12:** the function `jjConflicts` and the rule id `jj-conflicts` are distinct, correct names. **Done:** note lines 273-274 and 636-637 give both.
6. **Status of 011.** **Answered, items 5-12:** keep historical and adoption distinctions. **Done, no change needed:** the note records Draft 1, its approval `e7cc8c03` and guidance `cb4613c9` (lines 667-668).
7. **Statements that rest only on the 2026-10-01 reading.** **Answered, items 5-12:** keep the dated v0.45.1 evidence limits; no source remeasurement and no new interoperability claim. **Done, no change needed:** the note says which reading these rest on (lines 38-39, and the `jj run` row, line 124). The quote "cannot fail to commit" stays removed.
8. **Plan revision 4 details in section 3 not re-verified against main.** **Answered, items 5-12:** no source remeasurement is supplied. **Done, no change needed:** they stay attributed to plan revision 4 (lines 153-155). **Still open, no owner named in the direction:** a check of `expectedGeneration`, the lease-scoped token and unsigned commits against main, if a reviewer wants one.
9. **"Competition's content limits".** **Answered, items 5-12:** keep the original conditions. **Done, no change needed.** **Still open, owner the reviewer of this delivery:** no document stating the limits was among the inputs.
10. **Spelling.** Editorial; the direction does not change it. The note keeps "Judgement"; the quoted paragraph keeps "authorized".
11. **`fef19f77`.** A `ratify` act with no statement text. No change needed.
12. **Two lines exceed 72 columns** (510-511). They are the verbatim quotation.
13. **011 misdescribes the per-change display.** **Answered, item 13:** the main UI README maps old parent-relative hunk positions into the new parent, and where the mapping is not one to one it says it could not tell whether the edit moved; it also describes author-supplied history, unmatched divergent IDs and a bounded mock display, with no live `changeHistory` data. The frozen 011 phrase was inaccurate. **Done:** the operative text gives the README's content (note lines 389-398, 405-413). 011's phrase is quoted only as history, with a pointer to the planner's correction (lines 399-404). The frozen bytes of 011 are unchanged.
14. **The `jj-conflicts` fix text.** **Answered, item 14:** keep the actual fix text from main; do not commission the guard again. **Done, no change needed:** note lines 365-371.

All other ids resolved: `966aeaad`, `bfb563fe`, `e7cc8c03`, `cb4613c9`, `6649bb50`, `50d7806a`, `fceb27d0`. Artifact `9acd28e0` and head `5d0d606e` were confirmed through the text of `e7cc8c03` and `git log -1 5d0d606e`; the artifact was not inspected on its own.

## Independent check

Report: `jj-verify.md` (13 findings), a scratch report of the independent reader, which is not kept in the repository; this section is its summary. Each was checked against plans/011, the original note at `HEAD`, review `6649bb50` and main `e6e67828`. All 13 were applied. Line numbers in this table are those of the note at commit `508ac63b`.

| # | Finding | Checked against | What was done (lines) |
|---|---|---|---|
| 1 | README credited with "comment positions" and "unknown states" it does not contain | `grep -c -i comment` and `unknown` on `packages/ui/README.md`: 0 and 0; README lines 149-172 | Source text now follows the README; 011's wording attributed to 011 (384-396); drift item 13 |
| 2 | Plan 005 imperatives restated as existing behaviour | 011 lines 343-345 | "should apply", "should be preserved" (545-548) |
| 3 | `jj run` propagation sentence removed without a correction | Original line 60; 011 line 78 silent | Restored, marked read 2026-10-01 and not re-read at the pin (122) |
| 4 | Quoted fix text was not the rule's text | `packages/policy/src/pack.ts` line 44 | Exact fix text quoted; source pinned; imperatives split out as Judgement (360-366) |
| 5 | Review 6649bb50 said to find "no shared authority" too broad | Review text: listed under what is supported, as native responsibilities | Attribution corrected (487-492) |
| 6 | Leftover "applies, if at all, before publication" | 011 lines 175-176; `docs/protocol.md` open point 38 | Replaced by a pointer to item 3, not pursued (284-285) |
| 7 | Blanket rule turned judgements into Source | Original line 105; 011 lines 195-200 | Rule narrowed to section 2 tables and "Source: jj" lists (27-29); Judgement labels added (70, 87, 174, 298, 324) |
| 8 | One Artroom Source label named no snapshot | `docs/protocol.md` on main, log publication and R-LOG-10 | Label now names `docs/protocol.md` at main `e6e67828` (230) |
| 9 | Table facts dropped where 011 is silent | Original lines 57-58 | "three ways", "recorded, not refused" and descendants rebased restored (108-109) |
| 10 | "No guarantee" became "can remove" | 011 lines 144-145 | Reworded to the no-guarantee form (226-228) |
| 11 | Two boundary sentences of 011 omitted | 011 lines 357-358, 380-381 | Both added (566-567, 589-590) |
| 12 | 2026-10-01 statements presented as re-read at the pin | 011 lines 22-23, 392 | Sentence added on which reading they rest on (36-37) |
| 13 | "Permanent" dropped from two Artroom statements | Original lines 78, 107 | Restored (145, 208-209) |

Rulings applied: `jj run` statement restored and dated; "cannot fail to commit" stays removed; README wording is the Source and 011's wording is attributed; the fix text is quoted from main; 011's imperatives are kept as requirements; judgements are labelled one by one; the review finding is attributed correctly. No new claim was added.

## Checks run

All from `/Users/hughpyle/play/artroom-worktrees/notes-reconcile` unless a path is given. Read-only except the edits to the note, to one paragraph of the plan, and to this checklist.

Identity:

```sh
wc -c /Users/hughpyle/play/artroom/plans/011-2026-10-04-jj-clarification.md
# 25637
shasum -a 256 /Users/hughpyle/play/artroom/plans/011-2026-10-04-jj-clarification.md
# cd74665c0e516d30edfdc078d18f2410574d8ec2f6a221d383c62ab175e3139b
git branch --show-current            # request/notes-reconcile
wc -l -c notes/2026-10-01-research-jj.md      # before: 247 lines, 12816 bytes
shasum -a 256 notes/2026-10-01-research-jj.md # before: 8563588c...aa516f
shasum -a 256 packages/git/measure/results/jj-change-id-2026-10-01T21-57-04-695Z.json
# 228e6850ca56ab674f4ab70c1043bb0d8c815c3b72a42b9f3c746b940856d5bc (8383 bytes)
git merge-base --is-ancestor e6e6782830e0ca8a68f0d11c4d4ece5e4e98c967 HEAD   # true
```

Workroom reads:

```sh
gs inspect --json 966aeaad | jq -r '.statement | ((.text // "") + "\n--- conditions\n" + (.body.conditions // ""))'
# the same for bfb563fe, 6649bb50, fef19f77, 50d7806a
gs inspect --json e7cc8c03 | jq -r '.statement.text'
gs inspect --json cb4613c9 | jq -r '.statement.text'
```

Source spot checks (read only): `grep -n -i jjconflict packages/policy/src/pack.ts`; `sed -n 2649,2680p docs/protocol.md`; `sed -n 149,206p packages/ui/README.md`; `grep -n -i 'MCP URL' notes/2026-10-01-artroom-plan.md`; `grep -n -i 'fast-forward\|merge' packages/git/measure/results/jj-change-id-2026-10-01T21-57-04-695Z.json` (`mergeCarriesChangeId: false`).

Whitespace:

```sh
git diff --check -- notes/2026-10-01-research-jj.md   # no output, exit 0
```

Style:

```sh
grep -n -e '-' -e '–' -e 'software scale' notes/2026-10-01-research-jj.md
# The earlier "no output" claim is incorrect: the frozen dated note
# contains literal hyphens, for example on line 3. Not rerun here.
awk 'length > 72 && substr($0,1,1) != "|" && index($0,"https:")==0 && index($0,"packages/git/measure/results")==0 {print FNR": "length}' notes/2026-10-01-research-jj.md
# 510: 73, 511: 73 (verbatim quotation)
```

Links:

```sh
grep -n -o '\]([^)]*)' notes/2026-10-01-research-jj.md   # no output: the note has no relative Markdown links
grep -o '`[A-Za-z0-9_./-]*/[A-Za-z0-9_./:-]*\.[a-z]*`' notes/2026-10-01-research-jj.md | tr -d '`' | sort -u | while read p; do if [ -e "$p" ]; then echo "OK   $p"; else echo "MISS $p"; fi; done
```

Result: every repository path named in the note exists in the worktree (`docs/protocol.md`, `notes/2026-10-01-artroom-plan.md`, `packages/git/measure/harness/worker.ts`, `packages/git/measure/jj-change-id.mjs`, the saved JSON, `packages/git/test/jj-change-id.test.ts`, `packages/policy/src/pack.ts`, `packages/ui/README.md`, `plans/README.md`), except `plans/011-2026-10-04-jj-clarification.md`, which the note names as not on this branch (section 9, lines 672-674). External links are the pinned and historical jj URLs; they were not fetched.

After direction `fceb27d0`:

```sh
gs inspect --json fceb27d0 | jq -r '.statement.text'   # resolves; matches the saved direction text
git diff --check                                        # no output, exit 0
git diff notes/2026-10-01-artroom-plan.md | grep '^[+-]'   # one revision note added; one sentence replaced by two paragraphs
```

The same style and link checks were run again on the note, with the same results.

No runtime suite, install, jj command, web request or gitseq write was run. When these checks were run, on 2026-10-04, the changes for direction `fceb27d0` were not yet committed; they were committed afterwards, at `b878fee9`.
