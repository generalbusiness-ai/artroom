# MCP plan reconciliation checklist (request 50d7806a)

Edited file: `notes/2026-10-01-mcp-plan.md` on `request/notes-reconcile`
(worktree `/Users/hughpyle/play/artroom-worktrees/notes-reconcile`), not
committed. 1,304 lines after the edit and the independent check; revision 3 had 582. Line numbers
below are in the edited file.

Inputs: revision 3 at `b5add513`; `plans/009-2026-10-03-mcp-clarification.md`
(35,977 bytes, SHA-256 `c5bd4fbe...e7343`, identity verified); workroom
records `489a992e`, `932ce20e`, `775acdd3`, `fa120186`, `4e542273`,
`5877afdf`, `db41608a`, `c18af03e`, `50d7806a`.

## A. Conditions of the original request 489a992e

| # | Item (source) | Where the reconciled note delivers it | Note |
|---|---|---|---|
| A1 | "concrete, comprehensive, appropriately layered, and flexible enough to support general Artroom applications (not only code rooms, for example the jam room)" (489a992e text) | Header 3-9; section 4 "The layers" 290-312; "The general application route" 314-350; section 8 800-890 | Layers unchanged. General route rewritten: declared acts, not only code-review verbs |
| A2 | "Ground it in the protocol's MCP rules, lane E's MCP server, the current MCP specification and Cloudflare's MCP support" (489a992e text) | Section 2 history 107-143; section 3 208-288; section 15 1253-1304 | Original pins kept (`8189d66`, `69734d4`, versions, URLs). Later pins added and dated |
| A3 | "states what exists today and what is missing" | Section 2 "What exists" 102-206: history tables 107-143, missing list with status 145-159, status table 161-176 | Original list kept as history; a status column and a dated status table added |
| A4 | "defines layers with what each owns" | Section 4 290-312 (diagram 292-299, table 302-308) | Diagram unchanged. Table kept, boundaries added from 009 section 3 |
| A5 | "lists every tool, resource and prompt with its schema shape and layer" | Section 6 "Tools" 554-623 (act tools 560-570, general tools 572-577, request tool 579-588, read tools 590-607, counts 609-615); "Resources" 625-643; "Prompts" 645-661; layer stated in the section title (L1) and in section 8 for L3 | All 18 original tools, 6 resources, 5 prompts kept with input, result and annotations. `acts` and `act` added. Shapes corrected per 009 section 4 |
| A6 | "covers authentication" | Section 5 "Authentication" 399-405; OAuth steps 407-435; "Unchanged" 437-440; "Private reads and owner authority" 478-494 | Bearer and own-key rows unchanged. OAuth row and steps rewritten |
| A7 | "sessions and statelessness" | Summary 81-85; section 3 216-219; section 5 "Wire formats" 385-389; principle 6 551-552; prepared-call owner table 702-708 | Kept. "All state lives in the room" corrected to "state stays with its existing owners" |
| A8 | "notifications and live updates" | Summary 86-87; section 3 push bullet 233-235 and Cloudflare 246-254; section 9 "Real-time" 921-925, "Live operation" 927-932, "Subscriptions (stage 3)" 934-940 | Kept; routing and recovery limit added |
| A9 | "errors and refusals" | Section 5 "Errors" 442-468; history row R-API-1 in 107-126 | Rewritten: three shapes, proposed union covering `ArtroomError` |
| A10 | "idempotency" | Summary 88-91; principle 4 541-547; "Retries and prepared meaning" 684-741; amendment item 3 980; decision 2 1154 | Required key kept (adopted). Prepared-meaning rules added |
| A11 | "context cost" | Section 10 942-966; section 5 "Size" 523-526 | Budgets unchanged; marked as project budgets; scope extended to general route and packs |
| A12 | "client support for Claude Code, Codex, pi and pi-durable" | Section 3 "Clients on 2026-10-01" 256-283; section 9 pi-durable 918-919; acceptance 2 1088-1093 | Matrix kept, dated as research. Support is established by named cold-agent runs |
| A13 | "says how an application extends the MCP surface without changing the core" | Section 4 general route 314-350; section 8 packs 800-890; section 9 application servers and library 892-919 | Packs and library kept. Declared-act route added as the first route |
| A14 | "keeps Artroom's invariants" | Summary 63-67; rule 310-312; checks and roster 352-381; "Unchanged" 437-440; credential outputs 470-476; pack safety 862-879; acceptance 5 1100-1118 | Kept. `check` wording corrected under `fa120186`; "no token in any result" corrected |
| A15 | "cites the MCP specification version it targets" | Summary 81; section 3 213-218; sources 1255-1274 | 2026-07-28 kept. "final" corrected to "current, compatible changes possible" |
| A16 | "names the contract or protocol amendments it needs" | Section 11 968-1016 (nine items 973-998, status table 1005-1011) | Nine items kept. Items 1 and 8 reworded. Status per item added |
| A17 | "stages the work" | Section 12 1018-1076 (stage table 1027-1032, moved items 1034-1043, estimate 1045-1047, status 1049-1056, owners 1058-1072) | Four stages kept. Resources and prompts moved from stage 1 to stage 2 |
| A18 | "and passes checker's review" | Section 14 "Records since revision 3" 1172-1191 | Not claimed. Review `4e542273` requested changes; the condition is stated as still open |
| A19 | Promise 932ce20e: "the MCP plan on branch request/mcp-plan, for checker's review" | Header 3-9; sources 1300 | Unchanged; revision 3 pin recorded |

## B. Requirements and corrections of the clarification (plans/009)

| # | Item (source) | Where the reconciled note delivers it | Note |
|---|---|---|---|
| B1 | L0 transport: wire formats, room binding, protocol errors and tool failures, caching, output bounds; does not decide authority (009 s3) | Layer table 304; section 5 383-526 | Row extended; section rewritten in part |
| B2 | L1 core: shared descriptors, thin calls, declared-act discovery and submission, code-review conveniences, reads, waits; no composing (009 s3) | Layer table 305; section 6 528-750 | Row extended; `acts`/`act` added |
| B3 | L2 role toolsets: select from role/delegation and narrower caller choice; hiding is not authorization (009 s3, s4) | Layer table 306; section 7 752-798 | Table kept; 009's rule for the general route stated in its own terms (768-774); item 7 timing stated |
| B4 | L3 packs: repository data mapping a verb to one ordinary room write or read; no code, no authority, no silent change of prepared work (009 s3, s5) | Layer table 307; section 8 800-890 | Rewritten in part; example carries the key |
| B5 | L4 application servers: code, state, other services, from the published library; state cannot override room outcomes (009 s3, s10) | Layer table 308; section 9 892-919 | Export table unchanged; N3 ownership added |
| B6 | Tools: fourteen core plus four reads remain; `acts` and `act` added; 14/18 are not a cap (009 s4) | 560-615 | Original tables kept; one table added; counts sentence rewritten |
| B7 | Resources: six templates, stage 2; `file` at an authorized pinned commit; extra acts resources optional (009 s4) | 625-643 | Table kept; one cell and two sentences changed |
| B8 | Prompts: five, stage 2; wording follows declared meanings; provenance as task input (009 s4) | 645-661 | Table reworded; provenance paragraph added |
| B9 | Schema shapes: planning summaries; all write schemas require the key; `workspace` is a signed request, not an act tool; waits bounded at 45 s (009 s4) | 556-558, 579-588, 673-682 | Added to the original shapes |
| B10 | Before item 5, start with `attention` and available reads; do not instruct a call to an absent `room` (009 s4) | "Server instructions" 663-671 | Rewritten |
| B11 | Authentication: bearer, own key; OAuth in stage 2 with PRM, audience binding, challenge, CIMD preference, legacy registration (009 s7) | 399-405 | OAuth row rewritten; status column added |
| B12 | OAuth four steps: identify; validate client, redirect, resource; consent; issue and check current authority. Redemption is not client consent; the deliverable must preserve the full journey (009 s7; 4e542273 #4) | 407-435; amendment item 8 994-997; acceptance 5 1116-1118 | Rewritten in place; revision 3's sentence named and corrected |
| B13 | Live update: polling baseline; timeouts imply nothing; subscriptions need reviewed routing and recovery; notifications are hints (009 s9; 4e542273 #7) | 86-87; 673-682; 921-940; stage 3 row 1032; 1128-1129 | Added to kept text |
| B14 | Errors: refusal `isError: false`; failure `isError: true` with `ArtroomError`; protocol faults by JSON-RPC; advertised schema covers every shape; proposed disjoint union (009 s6; 4e542273 #3) | 442-468; acceptance 6 1119-1122 | Rewritten; union marked Proposed default |
| B15 | Credential outputs: explicit ready-workspace grant allowed; no token in incidental results, logs, errors, caches (009 s6; 4e542273 #3) | 470-476; `workspace` row 583; acceptance 5 1113-1115 | New paragraph; acceptance wording corrected |
| B16 | Private reads: OAuth or bearer is not an owner/admin device session; revocation lifecycle; MCP adds no owner control (009 s6) | 478-494; "Not shipped" 1201-1202 | New |
| B17 | Retry: key identifies a retry; prepared call retained by its existing owner; no rebinding or re-signing; no new public outbox; stale meaning needs fresh preparation (009 s5; 4e542273 #2) | 88-91; 541-547; 684-741; pack sequence 852-860; acceptance 5 1109-1112 | New section; principle 4 extended |
| B18 | Cost: project budgets 512 / 1,000 / 3,000 / 2,500 / 20 KB; include general route and packs; CI names counter and method (009 s9; 4e542273 #7) | 942-966; 274-277 | Numbers unchanged; "Codex keeps only that much" corrected |
| B19 | Client support: 2026-07-28 is current, not final; pin SDK/spec snapshot; matrix is dated research; pi-durable is not a client (009 s9; 4e542273 #7) | 210-218; 256-283; dated mentions at 404, 627-628, 647-648, 1030 | Rewritten in place; matrix rows unchanged except "must" to "should" in the Codex limits cell |
| B20 | Caching: hints on discover/list/resource results, not `tools/call`; private, split by authorization; `cacheScope` is not access control; one hour is an upper bound (009 s8; 4e542273 #5) | 225-230; 496-521 | Rewritten in place |
| B21 | Amendment: retain items 1 to 4 now, 5 to 9 in stage 2; a9788a59 and 9ca1d290 remain owed (009 s1, s10; 50d7806a) | 968-1016; 1185-1191 | Items kept; status table added |
| B22 | Staging: four stages with corrected status boundaries; resources and prompts in stage 2; estimates are not delivery or limits; not first-Jam gates (009 s1, s10; 4e542273 #6) | 1018-1076 | Table rewritten; move recorded at 1034-1039 |
| B23 | General application route: seven acts are the code-review vocabulary; four tools-only steps; use `acts`/`act`; lists vary by authorization and active configuration (009 s3; 4e542273 #1) | 75-80; 314-350; 306; 754-757; 802-814 | New subsection; summary bullet added |
| B24 | Check transport under `fa120186`: legacy bearer check RPC-only, bearer roster forbidden, bound declared check step allowed through generic v2 `act`, qualifications kept (009 s3) | 352-381; 437-440; amendment item 1 973-977; acceptance 5 1102-1107 | New subsection; three older statements corrected |
| B25 | Evidence and status: source, reviewed/landed, deployed kept apart; adapter no longer ownerless; do not commission another endpoint task (009 s2; 4e542273 #6) | 49-59; 95-100; 145-206; 1049-1056 | Rewritten; snapshot kept as history |
| B26 | Retained decision `775acdd3`, including later enhancements (009 s1) | 1149-1160 | Decisions unchanged; assert id added |
| B27 | Owners and handoffs table (009 s10) | 1058-1072 | New table, ids as in 009 |
| B28 | Pack rules: `.artroom/mcp/`, restricted schemas, reserved core names, dotted names, pure mapping, stricter annotations, N5 lifecycle, safe provenance in `explain` (009 s5) | 816-883 | Kept and extended |
| B29 | Jam pack sequence: validate, resolve, compute once, persist, dispatch once; key unchanged; `claim`/`note` not prescribed (009 s5) | 831-860 | Example corrected; sequence added |
| B30 | Acceptance: seven groups with corrected witnesses; OAuth and subscription cases; no per-field sweep; bounded verification for later source work (009 s11, s12) | 1078-1145 | Rewritten in place, numbering kept |
| B31 | Unresolved implementation choices, five (009 s11) | 1227-1243 | New subsection |
| B32 | Stop conditions (009 s12) | 1245-1251 | New subsection |
| B33 | Not shipped: OAuth, stage 2 capability, private access, universal durable outbox (50d7806a) | 1193-1206; status tables 145-159, 1005-1011, 1049-1056 | New subsection |
| B34 | Tasks, MCP Apps, elicitation keep their scope without changing authority (009 s9) | 673-682; 743-750; stage 3 row 1032 | Kept; two sentences added |
| B35 | Library exports keep their parts; names reviewed by N3 (009 s10) | 892-906 | Table unchanged |
| B36 | Source/Judgement/Untested separation and history/delivered/adopted/proposed marking (50d7806a) | 40-59; Judgement at 285, 885, 964; Untested at 1086 | Original marks kept; status words defined and applied |
| B37 | Browser review uses N1's immutable reads (009 s9) | 623 | Added after the independent check |

## Drift and open points

These are places where the note could not be made to agree with every
input without deciding something. The note records them and decides none.

1. **Candidate toolsets differ from the plan's.** The unlanded contract
   (R-API-14 on `request/test-overhead`, planner decision `3d8a74a9`) has
   no `triager`; its `observer` includes `operation`; `reviewer` is the
   default for the role `checker`; a caller may select any of the four by
   name. The plan (and 009, which says "retain builder, reviewer, triager,
   observer and all") says otherwise. Recorded in the note at 794-798 and
   1208-1225.
2. **Output schema union.** 009 proposes a success / Refusal / ArtroomError
   union. Main advertises `oneOf` result and `Refusal` for eight tools,
   the candidate for nine (the eight and `act`). 009 leaves the encoding
   to an implementation review. Note 447-465, 1222-1225, 1229-1231.
3. **Where `acts` and `act` sit in each toolset.** 009 gives a rule and
   no placement. After the independent check the note states that rule
   in its own terms, reports the candidate R-API-14 placement as
   Candidate with its conditions, and gives no placement for `triager`,
   because no source has one (768-782).
4. **Pack mapping to a declared act has no schema.** 009 gives the
   sequence and says the Jam example is schematic. Neither document
   defines the pack field that names a declared kind or resolves its
   binding. The note keeps the `claim` example for a code-review room,
   with the key added, and names no declared kind (831-846).
5. **`diff` input.** Revision 3: `lane`, `generation`, `path?`, `cursor?`.
   009: "pinned proposal/base/head identity ... diff or interdiff under
   N1's reviewed contract". The note states both (603). The interdiff
   arguments are N1's to define.
6. **`release` annotation.** Revision 3 and the candidate mark `release`
   destructive. 009 does not discuss annotations. Kept as in revision 3.
7. **Annotations of `act` and `acts`.** 009 gives none. The note cites the
   candidate's R-API-13 values and labels them Candidate (576-577).
8. **Stage 0 "annotations and titles".** Revision 3 put them in stage 0.
   Request `8ae3b2dc` deferred them to amendment item 2, and 009 lists
   them with items 1 to 4. The stage 0 row keeps revision 3's wording as
   planned work; a paragraph (1041-1043) records the move. 009's stage
   table does not mention them in either stage.
9. **Stage 0 deployment evidence.** `notes/mcp-stage0.md` on main records
   a spike deployment and a cold Claude Code run on 2026-10-02. 009 says
   main source "proves no deployment" and asks for verification "when
   delivered". The note cites the stage 0 record as that file's own
   claim and does not verify it.
10. **Dates of workroom records.** `gs inspect` gave no readable dates for
    `fa120186`, `4e542273`, `db41608a`, `c18af03e`. The records table
    (1174-1183) says "by 2026-10-03" or "by 2026-10-04", from which
    document first cites each.
11. **Cross-reference repaired.** Revision 3's "Kinds of statement" cited
    section 14 for sources; sources are section 15. Corrected at 42.
12. **Not on this branch.** `plans/009-...md` is untracked in the shared
    checkout and absent from this worktree. The note names it by path and
    by artifact `514c43ba` at `b15eca8d`, not by a link.

Ids: all resolved (`489a992e`, `932ce20e`, `db41608a`, `c18af03e`, also
`4e542273`, `775acdd3`, `fa120186`, `50d7806a`, `5877afdf`, `290b3e87`).
`5877afdf` and `290b3e87` are acts (ratify, supersede) with no statement
text. `932ce20e` has no conditions. Artifact `514c43ba` was not inspected
by id; the frozen file was found in the tree of `b15eca8d` as
`attachments/2026-10-03-mcp-clarification-draft2.md`.

## Independent check

An independent reviewer compared revision 4 with plans/009, revision 3,
the request, main and the candidate (`mcp-verify.md`, beside this file).
It reported 10 findings. I checked each against the sources. All 10 were
right and all 10 are applied.

| # | Finding | Checked against | What I did (line in the note) |
|---|---|---|---|
| 1 | The withdrawn "stage 2 approval" was of declared-acts stage 2, not a stage of this plan; id cut short | `gs inspect` of `25bede37`, `290b3e87`, `9cb05da9`; `git merge-base --is-ancestor 39430e23` (in `request/test-overhead`, not in `main`) | Row rewritten with `25bede37`, request `fd6f00b6`, head `4ec48aa1`; new row for review `9cb05da9` at `39430e23`, not on main (1181-1182). Pointer added to the status table (171). Ids added to sources (1302) |
| 2 | Toolset table fixed `acts`/`act` per toolset; `triager` entry had no source | 009 lines 218-222; candidate R-API-14 | "General route" column removed. 009's rule stated in its own terms; candidate placement reported as Candidate with its two conditions; no placement for `triager`, and the note says so (758-782) |
| 3 | Toolsets on invitations and delegations called Proposed | `775acdd3`; 009 section 1 | Now "(item 7): Adopted for stage 2 (`775acdd3`), not built"; `triager` stays Proposed (156) |
| 4 | "Eight tools" wrong for the candidate | `packages/mcp/src/tools.ts` on main (eight) and on the candidate (nine, with `act`) | Both places corrected (462-466, 1222-1225) |
| 5 | Two leftover "only by authorization" statements | 009 lines 151-152 | Both now say authorization and the active reviewed configuration, never connection history (306, 754-757) |
| 6 | Client facts undated outside section 3 | 009 section 9 and its stage and acceptance rows | "on 2026-10-01" added at 404, 627-628, 647-648; stage 1 row says "default configuration; on 2026-10-01 that was the legacy mode" (1030) |
| 7 | OAuth owner duty weakened | 009 lines 357-360 | Duty restored: the deliverable must preserve these decisions and the full journey (433-435) |
| 8 | "Browser review uses N1's immutable reads" missing | 009 lines 414-415 | Sentence added (623) |
| 9 | Bounded-verification guidance for later source work missing | 009 section 12; `package.json` and `docs/testing.md` on main and on the candidate | Added (1141-1145). Main has no `gate` or `test:changed` script and no `docs/testing.md`; the candidate has all three |
| 10 | "Already" for a route that is only Candidate | The note's own status tables; 009 line 472-473 | Now "The declared-acts route (Candidate, stage 5) gives ..." (888-890) |

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
grep -n '-\|–\|software scale' notes/2026-10-01-mcp-plan.md              # no output

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
