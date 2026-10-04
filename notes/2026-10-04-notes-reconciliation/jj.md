# jj note reconciliation checklist (request 50d7806a)

Edited file: `notes/2026-10-01-research-jj.md` in worktree
`/Users/hughpyle/play/artroom-worktrees/notes-reconcile`, branch
`request/notes-reconcile`. Not committed.

- Before: 247 lines, 12,816 bytes, SHA-256 `8563588cd23c7047eb3572bd61b78b432b87eef85141e467cb08d63b72aa516f` (matches the identity the clarification gives for commit `b3050dc6`).
- After (with the independent check applied): 667 lines, 37,755 bytes, SHA-256 `166871a97f04633e7919cb960dd5b620518271a1e5e1bf65cbb5006943e18d67`.
- Input: `plans/011-2026-10-04-jj-clarification.md`, 25,637 bytes, SHA-256 `cd74665c0e516d30edfdc078d18f2410574d8ec2f6a221d383c62ab175e3139b` (verified).

Line numbers refer to the edited file. "011" means the clarification; "6649" means changes review `6649bb50`.

## A. Original conditions of request 966aeaad

| # | Item (source) | Where delivered (section, lines) | Note |
|---|---|---|---|
| A1 | "Write a sourced note, notes/2026-10-01-research-jj.md" (966aeaad text) | Whole file; section 8, lines 592-639 | Path unchanged; sources extended |
| A2 | "states what each system is for" (text) | Section 1, lines 55-92 | Rewritten: jj not limited to one developer; Artroom orders signed acts |
| A3 | Overlap: change identity (text) | Section 2 line 103; section 3 line 142 | Rewritten with profile limit |
| A4 | Overlap: operation log (text) | Section 2 line 106; section 3 line 144; section 4 lines 221-237 | Rewritten; retention limit added |
| A5 | Overlap: conflicts (text) | Section 2 line 109; section 4 lines 239-285 | Rewritten |
| A6 | Overlap: concurrency (text) | Section 2 line 108; section 3 line 146; section 4 lines 179-219 | Rewritten |
| A7 | Overlap: undo (text) | Section 2 line 107; section 3 line 145; section 5 item 4, lines 447-463 | Rewritten |
| A8 | Overlap: workspaces (text) | Section 2 lines 110, 112-114; section 3 line 147 | Kept; storage limit added |
| A9 | Differ: local tool versus shared sequencer (text) | Section 4 lines 172-219 | Rewritten |
| A10 | Differ: authority (text) | Section 4 lines 172-177, 221-237, 287-294 | Rewritten |
| A11 | Differ: review and policy (text) | Section 4 lines 268-285, 287-294 | Rewritten; existing policy rule credited |
| A12 | "what Artroom could borrow from jj" (text) | Section 5 lines 302-463 | Decisions unchanged; evidence updated |
| A13 | "and what it should not" (text) | Section 5 lines 465-477 | Kept; widened to headers per 011 |
| A14 | "how the plan's section 3 sentence about jj should read" (text) | Section 6 lines 479-515 | Rewritten: 011's text replaces the first proposal |
| A15 | "The note is in notes/" (conditions) | File path | Unchanged from original |
| A16 | "cites jj's own documentation and changelog with versions and dates" (conditions) | Lines 31-37; section 2 lines 116-127; section 8 lines 594-615 | Links pinned to v0.45.1; first retrieval kept as history |
| A17 | "keeps every comparison factual and qualified per the competition's content limits" (conditions) | Lines 57-58, 70-74, 89-92, 137-138; Source and Judgement markers throughout | Kept "neighbour, not a competitor"; blanket claims removed |
| A18 | "separates sourced facts from judgement and from untested claims" (conditions) | Lines 22-30 (definitions); markers throughout | Kept and made explicit per passage |
| A19 | "offered to checker for review before any plan change rests on it" (conditions) | Section 6 lines 481, 511-515 | Unchanged in meaning: plan not edited |
| A20 | Promise bfb563fe: "the jj research note on branch request/research-jj, for checker's review" | Lines 3, 11-13; section 9 line 645 | First version identity kept as history |

## B. Clarification 011 and accepted corrections

### Correction group 1: concurrency scope

| # | Item (source) | Where delivered | Note |
|---|---|---|---|
| B1 | Operation-view reconciliation stated apart from working-copy mutation (6649 group 1; 011 sections 2, 4) | Section 2 line 108; section 4 lines 184-197 | Rewritten; "lock-free concurrency" row replaced |
| B2 | Git backend "not entirely lock-free"; ordinary I/O failures (011 section 4) | Lines 189-190 | New |
| B3 | Working-copy interface takes a lock for mutation (011 section 4) | Lines 191-193 | New; source added line 581 |
| B4 | No "commands never wait", "writes always succeed" or safe uncoordinated mutation of one working copy (6649 group 1; 011 section 4) | Lines 195-197 | Rewritten; the quote "cannot fail to commit" removed because 011 corrects it |
| B5 | Contrast with sequenced admission kept; a stale or unauthorised act cannot be merged into authority (011 section 4) | Lines 199-213 | Rewritten |
| B6 | Parallel editing remains valuable; proposals, prepared commits, evidence and reservations have distinct fences (011 section 4) | Lines 215-219; section 3 line 146 | Rewritten ("never wait to edit, only to land" removed) |
| B7 | The plan sentence keeps the qualification (6649 group 1; 011 section 6) | Lines 497-503, 505-509 | Rewritten |
| B8 | Short answer no longer says "concurrency without locks" (6649 lines 35-37) | Lines 82-87 | Rewritten |

### Correction group 2: conflict data versus failed integration

| # | Item (source) | Where delivered | Note |
|---|---|---|---|
| B9 | jj conflict stored as ordinary Git objects; root `.jjconflict-*` trees; `jj:trees` header carries the jj meaning (6649 group 2; 011 section 4) | Lines 251-255 | Rewritten |
| B10 | `--allow-conflicts` is an explicit escape from the normal push refusal (011 section 4) | Lines 256-257 | Kept from original, moved |
| B11 | Simplification can happen; no guarantee that arbitrary conflicts resolve themselves (011 section 4) | Lines 247-250 | Rewritten |
| B12 | R-LAND-4 governs an unresolved Git merge; holder owns the recut (011 section 4) | Lines 259-263 | Kept from original |
| B13 | A jj-encoded conflict inside a mergeable head is a separate case; neither tree validity nor R-LAND-4 excludes it (6649 group 2; 011 section 4) | Lines 264-266 | Rewritten; "Artroom cannot publish a conflict: main must be a tree Git tools can use" removed |
| B14 | Existing default-pack `jjConflicts` rule: added or modified paths and rename destinations, on `propose`, before outside-claim, deletions excluded (011 section 4) | Lines 268-273 | New; read in `packages/policy/src/pack.ts` |
| B15 | Changes-only policy decision, not a whole-head scan; legacy content, removals and recovery need their own rules; open point 38 (011 section 4) | Lines 273-279 | New |
| B16 | Application should state a resolved-content requirement in policy and evidence; no widening, no new scan (011 section 4) | Lines 281-285 | New Judgement |
| B17 | The old "probably refused as outside-claim or fail its checks" is not evidence (6649 group 2; 011 section 4) | Section 5 item 1, lines 326-330 | Kept as history, marked |
| B18 | The rule is not to be commissioned again or described as missing (011 section 5 item 1) | Lines 360-366; section 7 line 535 | New |

### Correction group 3: sources and interoperability evidence

| # | Item (source) | Where delivered | Note |
|---|---|---|---|
| B19 | jj baseline is pinned v0.45.1, retrieved 2026-10-04 (011 preamble, section 9) | Lines 31-37; section 8 lines 594-604 | Rewritten |
| B20 | Baseline is not a claim about the latest release or every client version (6649 group 3; 011 preamble) | Lines 35-38, 124, 606-609 | Rewritten ("0.45.1 latest release" corrected) |
| B21 | Original retrieval date 2026-10-01 and the moving `main` links (original note section 8) | Lines 606-615 | Kept as history |
| B22 | `change-id` header default, 0.30.0, 2025-06-04 (original; 011 section 2) | Line 120 | Unchanged pin |
| B23 | `jj gerrit upload`, 0.34.0, 2025-10-01, experimental; not a complete review service (original; 011 section 2) | Line 121 | Pin unchanged; qualifier added |
| B24 | `jj run`, 0.43.0, 2026-07-01 (original; 011 section 2) | Line 122 | Pin unchanged; "edits and conflicts propagate to descendants" kept, marked as read 2026-10-01 and not re-read at the pin |
| B25 | `jj converge`, 0.45.0, 2026-09-02; non-interactive failure possible (original; 011 section 2) | Line 123 | Unchanged pin |
| B26 | Comparison baseline 0.45.1, 2026-09-03 (original; 011 section 2) | Lines 31, 124 | Unchanged pin |
| B27 | Release dates describe the source baseline, not a capability measured in Artroom (011 section 2) | Lines 126-127 | New |
| B28 | Compatibility limits: no Git hooks, partial clones, Git LFS or full submodule working-copy support; commit signing supported (011 section 2) | Lines 129-133 | Rewritten ("no submodules" corrected) |
| B29 | Artroom snapshot pinned for each source claim: main `e6e6782830e0ca8a68f0d11c4d4ece5e4e98c967` (6649 group 3; 011 section 9) | Lines 39-45, 199, 230, 259, 268, 331, 338, 360, 384; section 8 lines 617-630 | New |
| B30 | Historical sources at `b3050dc6`: original note and plan revision 4 (011 section 9) | Lines 11-13; section 8 lines 632-635; section 9 line 645 | Kept as history |
| B31 | "Worth doing" is an adopted direction, not demonstrated current support (6649 group 3) | Lines 313-316, 320 | New |
| B32 | Header test source `packages/git/test/jj-change-id.test.ts`; stand-ins; actual-jj case conditional on install (011 section 5 item 1) | Lines 331-337 | New; replaces "Untested: header survives" |
| B33 | Saved result identity: path, 8,383 bytes, SHA-256 `228e6850...`; two lanes, fast-forward and merge (011 section 5 item 1) | Lines 338-344 | New; bytes and digest re-checked by `shasum` |
| B34 | New merge commit does not itself carry `change-id`; reachable original is not a copied header (6649 group 3; 011 section 5 item 1) | Lines 345-348; section 7 line 580 | New |
| B35 | Evidence boundary: measurement-only Worker, stand-in Room, no production admission; JSON does not pin jj version (011 section 5 item 1) | Lines 349-359 | New |
| B36 | Untested: deployed client compatibility, live review-to-publication, ignored-file and operation-store recovery, device continuity; C2 owns witnesses (011 section 5 item 1) | Lines 367-373 | New |
| B37 | Nothing rerun; saved results credited within their limits (011 preamble, section 9) | Lines 47-49, 663-667 | Rewritten ("Nothing here was measured") |
| B38 | "Local evidence is not shared Room authority or provider proof" (request 50d7806a) | Lines 48-49 | New |
| B39 | Source, Judgement, Untested definitions (011 preamble) | Lines 22-30 | Rewritten; spelling "Judgement" kept |

### Correction group 4: declared applications and ownership

| # | Item (source) | Where delivered | Note |
|---|---|---|---|
| B40 | Lane and generation are the code-review profile's analogy; declared kinds and recorded bindings are authoritative (6649 group 4; 011 sections 1, 3) | Section 3 line 142, lines 163-168 | Rewritten |
| B41 | Two limits: a lane holds several changes, headers can be duplicate or divergent; Room outcome is separate from an agent's description (011 section 3) | Lines 155-161 | New |
| B42 | Analogies do not equate identity, authority or proof (011 section 3) | Lines 137-138 | New |
| B43 | jj is not limited to a solitary developer; shares through Git remotes (011 section 1) | Lines 60-64, 172-177 | Rewritten ("one person's repository", "one owner") |
| B44 | Native responsibilities only; Gerrit upload shows integration with external review (6649 closing; 011 section 4) | Lines 70-74, 121, 287-294 | Rewritten |
| B45 | Conditional client compatibility; no hosted workspace, durable agent or cross-device continuity established (011 section 1) | Lines 76-80 | Rewritten ("So an agent can use jj inside an Artroom lane") |
| B46 | jj log: writer-supplied metadata; push does not carry operations; no permanent local retention (011 section 4) | Lines 223-228 | Kept; retention limit added |
| B47 | Artroom log: `refs/artroom/log`, independent verifier, proof limits; handle, user name, host name, header or commit signature cannot replace the actor signature, role or binding (011 section 4) | Lines 230-237 | Rewritten |
| B48 | Header is author-supplied display and grouping metadata; proves no signer, equivalence, verdict, authority or carry (6649 group 4; 011 section 5 item 2) | Lines 411-418 | Rewritten |
| B49 | Per-change display exists with mock data under `d0cbb26d`; live `changeHistory` and reads absent (011 section 5 item 2) | Lines 384-399 | New |
| B50 | Bounds: 2,000 commits, depth 64, 100,000 entries, 2,000 lines, 10,000 bytes per line, 20 million work; blob read precedes bounds (011 section 5 item 2) | Lines 400-405 | New; figures match `packages/ui/README.md` |
| B51 | N1 and C5 reconcile the display; `d0cbb26d` keeps its obligations; no duplicate lane (011 section 5 item 2) | Lines 406-410 | New Judgement |
| B52 | Owners table: header, refusal, UI, live reads, hosted recovery, vocabulary, integration, with request ids (011 section 7) | Section 7 lines 532-540 | New; replaces "each needs its own request" |
| B53 | Hosted jj continuity needs `.jj` operation, store and view state and workspace references in the checkpoint (011 section 7) | Lines 542-554 | New Judgement |
| B54 | That is not a requirement that the first C2 or Jam task use jj (011 section 7) | Lines 556-559 | New |
| B55 | No new commissioning decision or first-Jam gate; Builder decides the Jam start; vocabulary may evolve (011 sections 5, 7) | Lines 313-315, 561-569 | New |
| B56 | Workspaces: other workspaces point to storage in the initial workspace (011 section 2) | Lines 112-114 | New |
| B57 | Eight acceptance scenarios (011 section 8) | Lines 571-585 | New; all eight rows kept |
| B58 | Reuse existing witnesses; focused controls only for changed boundaries (011 section 8) | Lines 587-590 | New |

### Recorded choices: borrow, reject, undecided

| # | Item (source) | Where delivered | Note |
|---|---|---|---|
| B59 | Hugh's 2026-10-01 choices: 1 and 2 worth doing, 3 not pursued, 4 undecided (original section 5; 011 section 5) | Lines 306-311 | Unchanged from original |
| B60 | Borrow item 1: jj as an agent's client, safely (adopted direction) | Lines 318-373 | Rewritten with current evidence |
| B61 | Borrow item 2: change history across generations (adopted direction) | Lines 375-418 | Rewritten with current evidence |
| B62 | Item 3: conflicted preparation, not pursued; changes R-LAND-4 and recut; benefit is a judgement (011 section 5 item 3) | Lines 420-437 | Kept as history; status marked |
| B63 | Item 3: gitseq cascade, 6 of 10 approvals, dated context, not a current rate, Untested kept (011 section 5 item 3) | Lines 439-442 | Kept; qualifier added |
| B64 | Item 3: no implementation, acceptance gate or Jam dependency (011 section 5 item 3) | Lines 444-445 | New |
| B65 | Item 4: undo vocabulary, undecided; four things it must not imply (011 sections 4, 5 item 4) | Lines 447-463 | Rewritten |
| B66 | Reject: reconcile-later for acts (original; 011 "What to avoid borrowing") | Lines 468-471 | Kept; wording aligned |
| B67 | Reject: user names, host names or headers as membership, approval or delegation (original; 011) | Lines 472-477 | Kept; headers added |

### Plan section 3 wording and record

| # | Item (source) | Where delivered | Note |
|---|---|---|---|
| B68 | Plan revision 4 sentence quoted: "jj offers first-class conflicts and an operation log." (original section 6; 011 section 6) | Lines 483-485 | Unchanged quotation |
| B69 | 011's replacement text, verbatim (011 section 6, lines 313-319) | Lines 497-503 | Replaces the first proposal |
| B70 | First proposal withdrawn; its two broad claims named (6649 group 1) | Lines 487-492 | Kept as history, described not repeated in full |
| B71 | Replacement is a judgement; avoids lock-free, never-wait, always-commit and conflict-exclusion claims; no contract change, no universal compatibility (011 section 6) | Lines 505-509 | New |
| B72 | Plan integration still owed under 966aeaad; approval does not edit the plan (011 section 6; e7cc8c03; cb4613c9) | Lines 511-515; section 7 line 540 | Kept in meaning |
| B73 | Dated revision line naming plans/011 and request 50d7806a (task) | Lines 7-13 | New |
| B74 | Identities: original note, review, clarification, request, promise, primary artifact, approval, guidance (011 preamble; e7cc8c03) | Section 9 lines 643-649 | New |
| B75 | Correction map by group (011 section 9) | Section 9 lines 656-661 | New, mapped to this note's sections |
| B76 | Approval confers no implementation closure, runtime certification, universal compatibility, deployment or Jam gate (e7cc8c03) | Lines 663-667 | New |
| B77 | History, adopted and proposed are told apart (request 50d7806a) | Lines 51-53; status lines 320, 377-378, 422-423, 449, 481; lines 519, 528 | New |

Row counts: section A, 20 rows. Section B, 77 rows. Total 97.

## Drift and open points

1. **Plan section 3 wording (not changed; builder to decide).** 011 section 6 asks that the plan's comparison sentence be replaced "when the source note and plan are integrated". The plan, `notes/2026-10-01-artroom-plan.md` lines 191-192, still reads: "jj offers first-class conflicts and an operation log." The exact wording 011 asks for is:

   > jj is a local version control client with a Git backend and history editing tools. Its operation-log views reconcile divergent local operations, while working-copy mutations and backend I/O have separate constraints. Artroom instead records shared, authorized acts and their outcomes. A supported jj client can work in a code lane, with immutable commits and author-supplied change headers carried through the ordinary proposal path; those headers do not confer Room authority or review.

   The note records this as proposed and says the plan edit is still owed under 966aeaad.
2. **Plan revision 4 treats lanes as the general model.** 011 says lane and generation are the code-review profile's analogy and that declared kinds and bindings are authoritative. 011 takes that from workroom decisions and says unlanded candidates are not credited as main behaviour. The plan itself is unchanged. The note marks the general model as a Judgement resting on workroom decisions.
3. **`plans/011-2026-10-04-jj-clarification.md` is not on branch `request/notes-reconcile`.** It is an untracked file in the shared checkout. The note names it by path and by its frozen identity (artifact `9acd28e0` at `5d0d606e`, byte count and digest) and says it is not on this branch. The builder decides whether the plan file lands with this branch.
4. **`plans/README.md` on this branch does not index the C1 to C6 and N1 to N7 directions or plan 005.** 011 section 9 says they are "indexed in `plans/README.md`"; that is the planner's modified copy in the shared checkout. The note attributes the statement to the clarification. Request ids for N1, C1, C2, C3, C5 and C6 in section 7 are copied from 011 and were not resolved in the workroom.
5. **Rule name.** 011 calls the rule `jjConflicts`. In `packages/policy/src/pack.ts` that is the exported function; the rule id is `jj-conflicts` (also the name in `docs/protocol.md` sections 28 and 29.5). The note gives both. No change of meaning.
6. **Status of 011.** The file's own last line says it is "proposed planning evidence awaiting independent review". It was since approved by `e7cc8c03` with guidance `cb4613c9`. The note records the approval.
7. **Statements that rest only on the 2026-10-01 reading.** 011 is silent on these, so they are kept and the note says they were not read again at the v0.45.1 pin (line 36-37, and in the `jj run` row, line 122): `jj run` "edits and conflicts propagate to descendants"; views merged "three ways" with contradictions "recorded, not refused"; descendants rebased onto a conflict; the bookmark "moved from A to B or C" example; the operation log being "unsigned"; a view recording heads, bookmarks and working copies; `jj interdiff`. The quote "cannot fail to commit" stays removed, because 011 corrects it (always-commit claim withdrawn).
8. **Plan revision 4 details kept in section 3 without a fresh check.** `expectedGeneration` as compare-and-swap, "a token scoped to the lease", and "commits are not required to be signed" come from the original note. 011 does not contradict or repeat them. They were not re-verified against main `e6e67828`.
9. **"Competition's content limits" (original condition).** No document stating those limits was among the inputs. The note keeps the original's qualified, sourced comparisons and removes the blanket claims. A reviewer who holds the limits should confirm.
10. **Spelling.** The note keeps "Judgement" and British spelling; 011 uses "Judgment". The quoted plan sentence keeps 011's "authorized" verbatim.
11. **`fef19f77`.** It resolves, but has no statement text. It is a `ratify` act on `6649bb50` with decision "requester declared satisfaction". The note says the review was "ratified in `fef19f77`".
12. **Two lines exceed 72 columns** (501-502, 73 characters). They are the verbatim quotation and were left unwrapped.

13. **For the planner: 011 misdescribes the per-change display.** 011 section 5 item 2 (lines 252-253) says main's UI README describes "mapped and unmapped comment positions, explicit unknown states". `packages/ui/README.md` at main `e6e67828` does not contain the words "comment" or "unknown". It describes hunk positions: the old hunk's parent lines are mapped into the new parent, and where they do not map one to one the screen says it "could not tell whether the edit moved". The note gives the README's content as Source (lines 384-392) and attributes the other wording to 011 (lines 393-396). The clarification itself is unchanged.
14. **The `jj-conflicts` fix text.** The original note proposed the fix "resolve the jj conflicts, then propose again". The rule on main reads: "Resolve the jj conflicts, so the proposal no longer adds or changes .jjconflict-* paths, then propose again." The note now quotes main (lines 360-364).

All other ids resolved: `966aeaad`, `bfb563fe`, `e7cc8c03`, `cb4613c9`, `6649bb50`, `50d7806a`. Artifact `9acd28e0` and head `5d0d606e` were confirmed through the text of `e7cc8c03` and `git log -1 5d0d606e`; the artifact was not inspected on its own.

## Independent check

Report: `jj-verify.md` in this directory (13 findings). Each was checked against plans/011, the original note at `HEAD`, review `6649bb50` and main `e6e67828`. All 13 were applied. Line numbers are those of the edited note after the changes.

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

All from `/Users/hughpyle/play/artroom-worktrees/notes-reconcile` unless a path is given. Read-only except the edit to the one note.

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
grep -n -e '-' -e '–' -e 'software scale' notes/2026-10-01-research-jj.md   # no output
awk 'length > 72 && substr($0,1,1) != "|" && index($0,"https:")==0 && index($0,"packages/git/measure/results")==0 {print FNR": "length}' notes/2026-10-01-research-jj.md
# 501: 73, 502: 73 (verbatim quotation)
```

Links:

```sh
grep -n -o '\]([^)]*)' notes/2026-10-01-research-jj.md   # no output: the note has no relative Markdown links
grep -o '`[A-Za-z0-9_./-]*/[A-Za-z0-9_./:-]*\.[a-z]*`' notes/2026-10-01-research-jj.md | tr -d '`' | sort -u | while read p; do if [ -e "$p" ]; then echo "OK   $p"; else echo "MISS $p"; fi; done
```

Result: every repository path named in the note exists in the worktree (`docs/protocol.md`, `notes/2026-10-01-artroom-plan.md`, `packages/git/measure/harness/worker.ts`, `packages/git/measure/jj-change-id.mjs`, the saved JSON, `packages/git/test/jj-change-id.test.ts`, `packages/policy/src/pack.ts`, `packages/ui/README.md`, `plans/README.md`), except `plans/011-2026-10-04-jj-clarification.md`, which the note names as not on this branch (section 9, lines 651-652). External links are the pinned and historical jj URLs; they were not fetched.

No runtime suite, install, jj command, web request or gitseq write was run. Nothing was committed.
