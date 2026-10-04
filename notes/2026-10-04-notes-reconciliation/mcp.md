# MCP plan reconciliation checklist (request 50d7806a)

Edited file: `notes/2026-10-01-mcp-plan.md` on `request/notes-reconcile`
(worktree `/Users/hughpyle/play/artroom-worktrees/notes-reconcile`).
1,366 lines after the edit, the independent check and the planner's
direction `fceb27d0`; revision 3 had 582. Line numbers below are in the
edited file.

Inputs: revision 3 at `b5add513`; `plans/009-2026-10-03-mcp-clarification.md`
(35,977 bytes, SHA-256 `c5bd4fbe...e7343`, identity verified); workroom
records `489a992e`, `932ce20e`, `775acdd3`, `fa120186`, `4e542273`,
`5877afdf`, `db41608a`, `c18af03e`, `50d7806a`.

## A. Conditions of the original request 489a992e

| # | Item (source) | Where the reconciled note delivers it | Note |
|---|---|---|---|
| A1 | "concrete, comprehensive, appropriately layered, and flexible enough to support general Artroom applications (not only code rooms, for example the jam room)" (489a992e text) | Header 3-12; section 4 "The layers" 309-331; "The general application route" 333-369; section 8 846-940 | Layers unchanged. General route rewritten: declared acts, not only code-review verbs |
| A2 | "Ground it in the protocol's MCP rules, lane E's MCP server, the current MCP specification and Cloudflare's MCP support" (489a992e text) | Section 2 history 110-146; section 3 227-307; section 15 1315-1366 | Original pins kept (`8189d66`, `69734d4`, versions, URLs). Later pins added and dated |
| A3 | "states what exists today and what is missing" | Section 2 "What exists" 105-225: history tables 110-146, missing list with status 148-162, status table 164-179 | Original list kept as history; a status column and a dated status table added |
| A4 | "defines layers with what each owns" | Section 4 309-331 (diagram 311-318, table 321-327) | Diagram unchanged. Table kept, boundaries added from 009 section 3 |
| A5 | "lists every tool, resource and prompt with its schema shape and layer" | Section 6 "Tools" 578-658 (act tools 591-601, general tools 603-608, request tool 610-619, read tools 621-638, counts 640-646); "Resources" 660-678; "Prompts" 680-696; layer stated in the section title (L1) and in section 8 for L3 | All 18 original tools, 6 resources, 5 prompts kept with input, result and annotations. `acts` and `act` added. Shapes corrected per 009 section 4 |
| A6 | "covers authentication" | Section 5 "Authentication" 418-424; OAuth steps 426-454; "Unchanged" 456-459; "Private reads and owner authority" 502-518 | Bearer and own-key rows unchanged. OAuth row and steps rewritten |
| A7 | "sessions and statelessness" | Summary 84-88; section 3 235-238; section 5 "Wire formats" 404-408; principle 6 575-576; prepared-call owner table 737-743 | Kept. "All state lives in the room" corrected to "state stays with its existing owners" |
| A8 | "notifications and live updates" | Summary 89-90; section 3 push bullet 252-254 and Cloudflare 265-273; section 9 "Real-time" 971-975, "Live operation" 977-982, "Subscriptions (stage 3)" 984-990 | Kept; routing and recovery limit added |
| A9 | "errors and refusals" | Section 5 "Errors" 461-492; history row R-API-1 in 110-129 | Rewritten: three shapes, proposed union covering `ArtroomError` |
| A10 | "idempotency" | Summary 91-94; principle 4 565-571; "Retries and prepared meaning" 719-776; amendment item 3 1030; decision 2 1206 | Required key kept (adopted). Prepared-meaning rules added |
| A11 | "context cost" | Section 10 992-1016; section 5 "Size" 547-550 | Budgets unchanged; marked as project budgets; scope extended to general route and packs |
| A12 | "client support for Claude Code, Codex, pi and pi-durable" | Section 3 "Clients on 2026-10-01" 275-302; section 9 pi-durable 968-969; acceptance 2 1140-1145 | Matrix kept, dated as research. Support is established by named cold-agent runs |
| A13 | "says how an application extends the MCP surface without changing the core" | Section 4 general route 333-369; section 8 packs 846-940; section 9 application servers and library 942-969 | Packs and library kept. Declared-act route added as the first route |
| A14 | "keeps Artroom's invariants" | Summary 66-70; rule 329-331; checks and roster 371-400; "Unchanged" 456-459; credential outputs 494-500; pack safety 912-929; acceptance 5 1152-1170 | Kept. `check` wording corrected under `fa120186`; "no token in any result" corrected |
| A15 | "cites the MCP specification version it targets" | Summary 84; section 3 232-237; sources 1317-1336 | 2026-07-28 kept. "final" corrected to "current, compatible changes possible" |
| A16 | "names the contract or protocol amendments it needs" | Section 11 1018-1066 (nine items 1023-1048, status table 1055-1061) | Nine items kept. Items 1 and 8 reworded. Status per item added |
| A17 | "stages the work" | Section 12 1068-1128 (stage table 1077-1082, moved items 1084-1095, estimate 1097-1099, status 1101-1108, owners 1110-1124) | Four stages kept. Resources and prompts moved from stage 1 to stage 2 |
| A18 | "and passes checker's review" | Section 14 "Records since revision 3" 1224-1248 | Not claimed. Review `4e542273` requested changes; the condition is stated as still open |
| A19 | Promise 932ce20e: "the MCP plan on branch request/mcp-plan, for checker's review" | Header 3-12; sources 1362 | Unchanged; revision 3 pin recorded |

## B. Requirements and corrections of the clarification (plans/009)

| # | Item (source) | Where the reconciled note delivers it | Note |
|---|---|---|---|
| B1 | L0 transport: wire formats, room binding, protocol errors and tool failures, caching, output bounds; does not decide authority (009 s3) | Layer table 323; section 5 402-550 | Row extended; section rewritten in part |
| B2 | L1 core: shared descriptors, thin calls, declared-act discovery and submission, code-review conveniences, reads, waits; no composing (009 s3) | Layer table 324; section 6 552-785 | Row extended; `acts`/`act` added |
| B3 | L2 role toolsets: select from role/delegation and narrower caller choice; hiding is not authorization (009 s3, s4) | Layer table 325; section 7 787-844 | Table kept; 009's rule for the general route stated in its own terms (803-809); item 7 timing stated |
| B4 | L3 packs: repository data mapping a verb to one ordinary room write or read; no code, no authority, no silent change of prepared work (009 s3, s5) | Layer table 326; section 8 846-940 | Rewritten in part; example carries the key |
| B5 | L4 application servers: code, state, other services, from the published library; state cannot override room outcomes (009 s3, s10) | Layer table 327; section 9 942-969 | Export table unchanged; N3 ownership added |
| B6 | Tools: fourteen core plus four reads remain; `acts` and `act` added; 14/18 are not a cap (009 s4) | 591-646 | Original tables kept; one table added; counts sentence rewritten |
| B7 | Resources: six templates, stage 2; `file` at an authorized pinned commit; extra acts resources optional (009 s4) | 660-678 | Table kept; one cell and two sentences changed |
| B8 | Prompts: five, stage 2; wording follows declared meanings; provenance as task input (009 s4) | 680-696 | Table reworded; provenance paragraph added |
| B9 | Schema shapes: planning summaries; all write schemas require the key; `workspace` is a signed request, not an act tool; waits bounded at 45 s (009 s4) | 580-582, 610-619, 708-717 | Added to the original shapes |
| B10 | Before item 5, start with `attention` and available reads; do not instruct a call to an absent `room` (009 s4) | "Server instructions" 698-706 | Rewritten |
| B11 | Authentication: bearer, own key; OAuth in stage 2 with PRM, audience binding, challenge, CIMD preference, legacy registration (009 s7) | 418-424 | OAuth row rewritten; status column added |
| B12 | OAuth four steps: identify; validate client, redirect, resource; consent; issue and check current authority. Redemption is not client consent; the deliverable must preserve the full journey (009 s7; 4e542273 #4) | 426-454; amendment item 8 1044-1047; acceptance 5 1168-1170 | Rewritten in place; revision 3's sentence named and corrected |
| B13 | Live update: polling baseline; timeouts imply nothing; subscriptions need reviewed routing and recovery; notifications are hints (009 s9; 4e542273 #7) | 89-90; 708-717; 971-990; stage 3 row 1082; 1180-1181 | Added to kept text |
| B14 | Errors: refusal `isError: false`; failure `isError: true` with `ArtroomError`; protocol faults by JSON-RPC; advertised schema covers every shape; proposed disjoint union (009 s6; 4e542273 #3) | 461-492; acceptance 6 1171-1174 | Rewritten; union marked Proposed default |
| B15 | Credential outputs: explicit ready-workspace grant allowed; no token in incidental results, logs, errors, caches (009 s6; 4e542273 #3) | 494-500; `workspace` row 614; acceptance 5 1165-1167 | New paragraph; acceptance wording corrected |
| B16 | Private reads: OAuth or bearer is not an owner/admin device session; revocation lifecycle; MCP adds no owner control (009 s6) | 502-518; "Not shipped" 1258-1259 | New |
| B17 | Retry: key identifies a retry; prepared call retained by its existing owner; no rebinding or re-signing; no new public outbox; stale meaning needs fresh preparation (009 s5; 4e542273 #2) | 91-94; 565-571; 719-776; pack sequence 902-910; acceptance 5 1161-1164 | New section; principle 4 extended |
| B18 | Cost: project budgets 512 / 1,000 / 3,000 / 2,500 / 20 KB; include general route and packs; CI names counter and method (009 s9; 4e542273 #7) | 992-1016; 293-296 | Numbers unchanged; "Codex keeps only that much" corrected |
| B19 | Client support: 2026-07-28 is current, not final; pin SDK/spec snapshot; matrix is dated research; pi-durable is not a client (009 s9; 4e542273 #7) | 229-237; 275-302; dated mentions at 423, 662-663, 682-683, 1080 | Rewritten in place; matrix rows unchanged except "must" to "should" in the Codex limits cell |
| B20 | Caching: hints on discover/list/resource results, not `tools/call`; private, split by authorization; `cacheScope` is not access control; one hour is an upper bound (009 s8; 4e542273 #5) | 244-249; 520-545 | Rewritten in place |
| B21 | Amendment: retain items 1 to 4 now, 5 to 9 in stage 2; a9788a59 and 9ca1d290 remain owed (009 s1, s10; 50d7806a) | 1018-1066; 1242-1248 | Items kept; status table added |
| B22 | Staging: four stages with corrected status boundaries; resources and prompts in stage 2; estimates are not delivery or limits; not first-Jam gates (009 s1, s10; 4e542273 #6) | 1068-1128 | Table rewritten; move recorded at 1034-1039 |
| B23 | General application route: seven acts are the code-review vocabulary; four tools-only steps; use `acts`/`act`; lists vary by authorization and active configuration (009 s3; 4e542273 #1) | 78-83; 333-369; 325; 789-792; 848-860 | New subsection; summary bullet added |
| B24 | Check transport under `fa120186`: legacy bearer check RPC-only, bearer roster forbidden, bound declared check step allowed through generic v2 `act`, qualifications kept (009 s3) | 371-400; 456-459; amendment item 1 1023-1027; acceptance 5 1154-1159 | New subsection; three older statements corrected |
| B25 | Evidence and status: source, reviewed/landed, deployed kept apart; adapter no longer ownerless; do not commission another endpoint task (009 s2; 4e542273 #6) | 52-62; 98-103; 148-225; 1101-1108 | Rewritten; snapshot kept as history |
| B26 | Retained decision `775acdd3`, including later enhancements (009 s1) | 1201-1212 | Decisions unchanged; assert id added |
| B27 | Owners and handoffs table (009 s10) | 1110-1124 | New table, ids as in 009 |
| B28 | Pack rules: `.artroom/mcp/`, restricted schemas, reserved core names, dotted names, pure mapping, stricter annotations, N5 lifecycle, safe provenance in `explain` (009 s5) | 862-933 | Kept and extended |
| B29 | Jam pack sequence: validate, resolve, compute once, persist, dispatch once; key unchanged; `claim`/`note` not prescribed (009 s5) | 877-910 | Example corrected; sequence added |
| B30 | Acceptance: seven groups with corrected witnesses; OAuth and subscription cases; no per-field sweep; bounded verification for later source work (009 s11, s12) | 1130-1197 | Rewritten in place, numbering kept |
| B31 | Unresolved implementation choices, five (009 s11) | 1289-1305 | New subsection |
| B32 | Stop conditions (009 s12) | 1307-1313 | New subsection |
| B33 | Not shipped: OAuth, stage 2 capability, private access, universal durable outbox (50d7806a) | 1250-1263; status tables 148-162, 1055-1061, 1101-1108 | New subsection |
| B34 | Tasks, MCP Apps, elicitation keep their scope without changing authority (009 s9) | 708-717; 778-785; stage 3 row 1082 | Kept; two sentences added |
| B35 | Library exports keep their parts; names reviewed by N3 (009 s10) | 942-956 | Table unchanged |
| B36 | Source/Judgement/Untested separation and history/delivered/adopted/proposed marking (50d7806a) | 43-62; Judgement at 304, 935, 1014; Untested at 1138 | Original marks kept; status words defined and applied |
| B37 | Browser review uses N1's immutable reads (009 s9) | 654 | Added after the independent check |

## Drift and open points

These were the places where the note could not be made to agree with
every input without deciding something. The planner read them at
`508ac63b` and answered them in workroom assert `fceb27d0` (2026-10-04).
That direction resolves editorial questions. It is not a full
independent review, approves no source and closes no original promise.
Each item below says what the direction answered, what was done in the
note, and what is still open and with whom. Line numbers are in the
note after these edits (1,366 lines).

1. **Candidate toolsets differ from the plan's.** Answered by
   `fceb27d0`. The adopted core amendment and runtime have `builder`,
   `reviewer`, `observer` and `all`, with R-API-14's existing defaults,
   eligibility and the explicit selection choice of `3d8a74a9`. Done:
   stated at 833-844 and 1265-1287, with the source marked Candidate.
   Still open: `triager` stays Proposed, a later configurable surface
   with the owners of the original full MCP plan and library. It is not
   added to the pending core release, and that release's refusal of an
   unknown name is unchanged.
2. **Output schema union.** Answered by `fceb27d0`. Main (eight tools)
   and the candidate (nine) are credited at their pins. Done: 481-490.
   Still open: the success / Refusal / ArtroomError model stays
   Proposed; its SDK-compatible encoding is with the existing
   implementation review. Not a new defect and no new test.
3. **Where `acts` and `act` sit in each toolset.** Answered by
   `fceb27d0`. Done: the placement is described from the adopted core
   source (R-API-14, Candidate) with its authority and binding
   qualifications (811-821). Still open: no `triager` placement is
   decided.
4. **Pack mapping to a declared act has no schema.** Answered by
   `fceb27d0`. Done: the example stays visibly schematic, and the note
   says the `claim` example does not deliver the mapping (888-897).
   Still open: the mapping fields and binding resolution, with the
   original pack, library and Jam design owners.
5. **`diff` input.** Answered by `fceb27d0`. Done: `lane` and
   `generation` are dated as revision 3's arguments (634); no interdiff
   arguments are named and the read is not called delivered (654-658).
   Still open: the immutable diff and interdiff input contract and the
   disclosure and size bounds, with N1 `53016b8e`.
6. **`release` annotation.** Answered by `fceb27d0` (items 6 to 8):
   existing fixed annotation requirements are retained. Done: stated at
   584-589; `release` stays destructive (600). Nothing open.
7. **Annotations of `act` and `acts`.** Answered by `fceb27d0`: current
   descriptor values are kept with their qualification. Done: the values
   stay attributed to the candidate's R-API-13 (607-608). Nothing open.
8. **Stage 0 "annotations and titles".** Answered by `fceb27d0`. Done:
   titles and annotations are described under the adopted core items 1
   to 4; the stage 0 row marks revision 3's wording as history (1079),
   and the note says stage 0 did not ship them (584-589, 1091-1095).
   Nothing open.
9. **Stage 0 deployment evidence.** Answered by `fceb27d0`. Done: the
   note says a main source file alone proves no deployment, keeps
   `notes/mcp-stage0.md` as a separate dated report with its pins and
   limits, and says it neither approves the current candidate nor proves
   the broader cold-agent and runtime conditions (189-195; rows at 171
   and 1105). No rerun is commissioned. Still open: the original
   cold-agent and deployed acceptance, with their original owners.
10. **Dates of workroom records.** Answered by `fceb27d0`. Done: the
    records table uses the recorded UTC times (1229-1232): `fa120186`
    2026-10-03T12:56:15Z; `4e542273` 2026-10-04T03:14:25Z; `db41608a`
    2026-10-04T04:44:50Z; `c18af03e` 2026-10-04T04:55:08Z. Plan 009
    keeps its own manuscript date. Records the direction gave no time
    for (`290b3e87`, `9cb05da9`) keep "By 2026-10-04", and the note says
    what "By" means (1238-1240).
11. **Cross-reference repaired.** Answered by `fceb27d0`: keep it. Done:
    unchanged at 45. Nothing open.
12. **Not on this branch.** Answered by `fceb27d0`: keep the canonical
    frozen artifact identity and label availability accurately. Done:
    unchanged at 35-41 and 1363. Also from items 11 and 12: the real
    binary-to-Room case and the expired-bearer stdio case are unshown
    limits, as clarified by `32f5446d`, not two new core-delivery tests
    (181-187). Still open: all seven original core conditions
    (`9ca1d290`) and the full contract binding (`a9788a59`).

From "ALL FOUR": the complete body, the condition and correction maps
above and the frozen input identity are kept; the note has no
branch-local link to the absent frozen file; nothing from plans 005, 006
or 007 or the planner's ledger was brought in. The original planner
promise `932ce20e` stays separate and is not closed by this direction.

Ids: all resolved (`fceb27d0`, `32f5446d`, `489a992e`, `932ce20e`, `db41608a`, `c18af03e`, also
`4e542273`, `775acdd3`, `fa120186`, `50d7806a`, `5877afdf`, `290b3e87`).
`5877afdf` and `290b3e87` are acts (ratify, supersede) with no statement
text. `932ce20e` has no conditions. Artifact `514c43ba` was not inspected
by id; the frozen file was found in the tree of `b15eca8d` as
`attachments/2026-10-03-mcp-clarification-draft2.md`.

## Independent check

An independent reviewer compared revision 4 with plans/009, revision 3,
the request, main and the candidate (`mcp-verify.md`, a scratch report that is not kept in the repository; this section is its summary).
It reported 10 findings. I checked each against the sources. All 10 were
right and all 10 are applied.

| # | Finding | Checked against | What I did (line in the note) |
|---|---|---|---|
| 1 | The withdrawn "stage 2 approval" was of declared-acts stage 2, not a stage of this plan; id cut short | `gs inspect` of `25bede37`, `290b3e87`, `9cb05da9`; `git merge-base --is-ancestor 39430e23` (in `request/test-overhead`, not in `main`) | Row rewritten with `25bede37`, request `fd6f00b6`, head `4ec48aa1`; new row for review `9cb05da9` at `39430e23`, not on main (1233-1234). Pointer added to the status table (174). Ids added to sources (1364) |
| 2 | Toolset table fixed `acts`/`act` per toolset; `triager` entry had no source | 009 lines 218-222; candidate R-API-14 | "General route" column removed. 009's rule stated in its own terms; candidate placement reported as Candidate with its two conditions; no placement for `triager`, and the note says so (793-821) |
| 3 | Toolsets on invitations and delegations called Proposed | `775acdd3`; 009 section 1 | Now "(item 7): Adopted for stage 2 (`775acdd3`), not built"; `triager` stays Proposed (159) |
| 4 | "Eight tools" wrong for the candidate | `packages/mcp/src/tools.ts` on main (eight) and on the candidate (nine, with `act`) | Both places corrected (481-490, 1284-1287) |
| 5 | Two leftover "only by authorization" statements | 009 lines 151-152 | Both now say authorization and the active reviewed configuration, never connection history (325, 789-792) |
| 6 | Client facts undated outside section 3 | 009 section 9 and its stage and acceptance rows | "on 2026-10-01" added at 423, 662-663, 682-683; stage 1 row says "default configuration; on 2026-10-01 that was the legacy mode" (1080) |
| 7 | OAuth owner duty weakened | 009 lines 357-360 | Duty restored: the deliverable must preserve these decisions and the full journey (452-454) |
| 8 | "Browser review uses N1's immutable reads" missing | 009 lines 414-415 | Sentence added (654) |
| 9 | Bounded-verification guidance for later source work missing | 009 section 12; `package.json` and `docs/testing.md` on main and on the candidate | Added (1193-1197). Main has no `gate` or `test:changed` script and no `docs/testing.md`; the candidate has all three |
| 10 | "Already" for a route that is only Candidate | The note's own status tables; 009 line 472-473 | Now "The declared-acts route (Candidate, stage 5) gives ..." (938-940) |

Coordinator rulings applied: (1) finding 2 as above; (2) finding 1 as
above; (3) finding 3; (4) every statement about the candidate is marked
Candidate; "Delivered" is used only for source on `main`.

## Checks run

All from `/Users/hughpyle/play/artroom-worktrees/notes-reconcile` unless a
path is given. No install, test or writing `gs` command was run.

```sh
# identity of the clarification
wc -c /Users/hughpyle/play/artroom/plans/009-2026-10-03-mcp-clarification.md      # 35977
shasum -a 256 /Users/hughpyle/play/artroom/plans/009-2026-10-03-mcp-clarification.md
#   c5bd4fbe66c424e12db24a34baeaa4bad15495adf423412ce1ba8108fc0e7343
git -C /Users/hughpyle/play/artroom ls-tree -r --name-only b15eca8d | grep mcp-clar
#   attachments/2026-10-03-mcp-clarification-draft2.md

# the starting note equals revision 3
git -C /Users/hughpyle/play/artroom log --oneline request/mcp-plan -- notes/2026-10-01-mcp-plan.md
git diff --stat request/mcp-plan -- notes/2026-10-01-mcp-plan.md   # empty before the edit
wc -l -c notes/2026-10-01-mcp-plan.md                               # 582 lines, 32581 bytes before the edit

# workroom records (read only)
gs inspect --json 489a992e | jq -r '.statement | ((.text // "") + "\n--- conditions\n" + (.body.conditions // ""))'
gs inspect --json 932ce20e | jq -r '.statement | ((.text // "") + "\n--- conditions\n" + (.body.conditions // ""))'
gs inspect --json db41608a | jq -r '.statement.text'
gs inspect --json c18af03e | jq -r '.statement.text'
# the same form for 4e542273, 775acdd3, fa120186, 50d7806a; .act for 5877afdf, 290b3e87

# whitespace
git diff --check -- notes/2026-10-01-mcp-plan.md; echo "check-exit $?"   # check-exit 0

# style
grep -n -e $'\u2014' -e $'\u2013' -e 'software scale' notes/2026-10-01-mcp-plan.md   # em dash, en dash, phrase: no output

# links: relative Markdown links
grep -n -o '\]([^)]*)' notes/2026-10-01-mcp-plan.md | grep -v 'http'     # no output: the note has none
# links: backticked paths
grep -o '`[A-Za-z0-9_./-]*/[A-Za-z0-9_./*<>-]*`' notes/2026-10-01-mcp-plan.md | sort -u | tr -d '`' \
  | while read f; do if [ -e "$f" ]; then echo "IN-WORKTREE $f"; else echo "NOT-IN-WORKTREE $f"; fi; done
```

Result of the path check. In the worktree: `docs/protocol.md`,
`notes/2026-10-01-docs-plan.md`, `notes/2026-10-01-jam-room.md`,
`notes/mcp-stage0.md`, `packages/client/src/room.ts`,
`packages/contract/src/transports.ts`, `packages/mcp` (and `README.md`,
`src`, `src/run.ts`, `src/server.ts`, `src/worker.ts`, `test`),
`packages/room/src/mcp.ts`, `plans/README.md`. Not files in the worktree,
and named in the note as living elsewhere:
`plans/009-2026-10-03-mcp-clarification.md` and
`attachments/2026-10-03-mcp-clarification-draft2.md` (artifact at
`b15eca8d`). The rest of the non-matches are not repository files: glob
patterns (`.artroom/**`, `.artroom/mcp/*.json`, `.artroom/mcp/<pack>.json`,
`parts/<part>/**`), MCP method and extension names (`tools/list`,
`server/discover` and the like), branch names (`request/...`), and a path
in another project (`openai/codex`, `codex-rs/features/src/lib.rs`). The
section "MCP core runtime (request 9ca1d290)" of `plans/README.md` exists
only on `request/test-overhead`; the note says so. The 26 external URLs
were not fetched.

After the independent check: `git diff --check -- notes/2026-10-01-mcp-plan.md`
exit 0; the dash and phrase grep gave no output; `wc -l` gives 1,304.

After the planner's direction `fceb27d0`: `git diff --check` on the note
and on this file exit 0; the dash and phrase grep gave no output; `wc -l`
on the note gives 1,366. Line numbers were remapped by script from the
note at `508ac63b` to the working tree, then spot-checked.
