# Acts review before self-hosting

Date: 2026-10-02. Request `9ea217bc`, promise `6d0528df`. A review, not a
plan. It asks one question: are Artroom's verbs stable enough that this
project's own development can move onto Artroom without the verbs
changing under it?

**Why now.** The deployed spike runs the whole loop live over HTTPS and
MCP: claim, workspace, push, propose, independent review, a check by the
deployed checker service, land, attention and verify (request `9f81f372`,
`notes/deploy-spike.md`, "Review and check, live"). That meets the
self-host trigger (assert `aa691b8b`). Request `7a3bbf8f` tracks what else
must be true before the move; this note is its first item.

**How to read the labels.** Each claim carries one:

- **[Source]** a fact from the contract or protocol, cited by file and
  rule, on `main` at `bd520fb9`, or from a note on a named branch;
- **[Judgement]** a design choice or opinion;
- **[Untested]** a claim nobody has run.

## Summary

- **The verb set is small and already stable.** Seven acts, `renew`, nine
  roster ops, three signed requests, ten MCP tools on `main` and fourteen
  in amendment 4, thirteen attention reasons. None has changed name or
  shape since the protocol's first revision; amendments have added fields
  and tools, never renamed. [Source]
- **Sixteen of nineteen development steps map onto existing verbs.** The
  gitseq workroom's loop (request, promise, branch, artifact, review
  request, review, landing, report, assert, ratify, dissent, supersede,
  reassign, wait, verify, roster) maps step by step in section 2. Most
  steps map to one Artroom verb, some to a policy rule, and three do not
  map at all. [Judgement]
- **The three gaps are one decision and two practices.** The decision is
  docs plan D1: work nobody has started, addressed to someone, closable
  without landing. That needs an amendment and this note recommends
  building it. The practices are governance (decisions are files on
  `main`, ratification is an owner review by admins, dissent is a note)
  and who lands (the holder, when obligations are met; nobody merges).
  Neither needs an amendment. [Judgement]
- **Freeze now:** the act kinds and their body fields, the verdicts, the
  roster ops, the attention reasons, the ten MCP tool names and inputs,
  and the refusal codes these acts can return. **Amend before the move:**
  D1 only, as four body fields and one attention reason. Amendment 4 lands
  as already decided. [Judgement]
- **The jam can move first.** It uses `claim`, `release`, `note`,
  `propose`, `land` and policy, and it has no backlog, so it needs nothing
  from D1. It can self-host with zero amendments before D1 lands. The
  platform cannot: it needs D1 for its board. [Judgement]

## 1. The verb set today

### 1.1 The seven acts

`ActKind` in `packages/contract/src/acts.ts`; bodies in the same file;
rules in `docs/protocol.md`. [Source]

| Act | Body | Who may sign | What it does |
|---|---|---|---|
| `claim` | `goal`, `scope[]`, `plan?`, `because?[]`, `purpose?` (`config-recovery`) | maintainer, member, agent; admin for recovery | Opens a lane (R-LANE-1), rescopes it (R-LANE-2) or takes over an unheld one (R-LANE-7) |
| `propose` | `lease`, `expectedGeneration`, `head`, `summary`, `because?[]` | the holder | A new generation at a pinned head (R-PROP-1, R-PROP-2); obligations computed from changed paths (R-PROP-5, R-OBL-5) |
| `note` | `text`, `replyTo?` | any member, and checkers | A statement, optionally in reply to an act; an attention item for the replied-to actor |
| `review` | `head`, `verdict` (`approve` or `object`), `scope[]`, `dependsOn?[]`, `text` | maintainer, member, agent | Evidence bound to `(lane, generation, head)` (R-OBL-1); carries forward under R-CARRY |
| `check` | `obligation`, `check`, `integration`, `input`, `config`, `runner`, volatile flag, result | checker | Machine evidence bound to an integration or snapshot (R-OBL-3, R-EXEC-8) |
| `land` | `lease`, `head` | the holder | Starts the landing operation; the room writes `main` (R-LAND-7, R-PUB-1) |
| `release` | `lease`, `note?` | the holder | Gives up the lane with a handover note (R-LANE-8) |

`because` is a list of `Reason`: an act ID, a commit or an `https` URL
(`packages/contract/src/ids.ts`). It is how an act names what it rests
on. [Source]

### 1.2 Renew, roster ops and signed requests

- `renew` carries `lease` and extends it (R-LANE-5). [Source]
- The nine roster ops (`packages/contract/src/roster.ts`): `invite`,
  `join`, `set-role`, `remove`, `revoke-key` (`retired` or
  `compromised`), `team`, `delegate` (`to`, `kinds`, `lanes`,
  `expiresAt`), `undelegate`, `rotate-recovery`. Admins sign all but
  `join`, `delegate` and `undelegate` (R-GEN-4). [Source]
- Signed requests, which are not acts and are not recorded: `workspace`,
  `workspace-token` and `session` (R-CRED-5, R-WS). [Source]

### 1.3 MCP tools

- On `main`, ten (R-API-9, `packages/mcp/src/tools.ts`): `claim`,
  `workspace`, `renew`, `release`, `propose`, `note`, `review`, `land`,
  `attention`, `explain`. No `check` and no roster op, by design. [Source]
- Amendment 4 (`request/mcp-amendment`, request `a9788a59`, awaiting
  checker's review) makes it fourteen by adding the reads `lanes`, `lane`,
  `proposal` and `operation`, each calling an existing `RoomApi` method,
  and requires `idempotencyKey` on act tools. Hugh adopted this on
  2026-10-01 (MCP plan, section 14). [Source]
- Stage 2 adds `room`, `diff`, `file` and `policy`, which need new reads
  (MCP plan item 5). [Source]

### 1.4 CLI commands

`packages/cli/README.md` and `src/cli.ts`: `login`, `redeem`, `claim`,
`workspace`, `propose`, `note`, `review`, `land`, `wait`, `release`,
`renew`, `attention`, `lane`, `verify`, `agents-md`, `mcp`, `help`. Each
act command is the act of the same name with the same body. [Source]

### 1.5 Attention reasons

`AttentionWhy` in `packages/contract/src/pagination.ts`, thirteen:
`review-requested`, `check-requested`, `objection`, `note`,
`land-outcome`, `recut-needed`, `lease-expiring`, `lane-unheld`,
`evidence-invalidated`, `publication-unresolved`, `revert-lane`,
`policy`, `log-publication-stalled`. These are the verbs in the other
direction: what the room asks of a member. [Source]

### 1.6 Refusals

Refusals are values with a rule, a reason and a fix (R-API-1), and are
recorded. Their codes (`not-holder`, `lane-held`, `lease-fenced`,
`generation-moved`, `obligation-open`, `scope-overlap`,
`idempotency-mismatch`, `delegation-invalid`, `key-revoked`, and the
rest) are part of what a client and an agent prompt depend on, so they
belong in the freeze. [Source, Judgement]

### 1.7 What has changed, and how

Four contract amendments since the protocol's first version. Amendment 1
(policy, `81c31bc7`) added `refuse` rules. Amendment 2 (`82a0b25a`)
closed integration gaps. Amendment 3 (`bc351fa8`) added check jobs and
snapshots, which gave `check` its `integration`, `input`, `config` and
`runner` fields. Amendment 4 (`a9788a59`) adds four read tools. No act
was renamed, removed or re-shaped; fields and tools were added. That is
the stability record the move rests on. [Source]

## 2. The development loop today, mapped

This project runs in a gitseq workroom with three actors (planner,
builder, checker) and a vocabulary of twelve kinds (`gs status`,
`vocabulary.definitions`). The loop is in
`~/play/gitseq/SKILL.md`. Each row is one step of it. "Fit" is
**direct** (one verb, same meaning), **policy** (expressed by a rule in
the pack, not a verb), **practice** (a convention, no verb or rule
needed) or **gap**.

| # | Step today (gitseq) | Artroom verb or rule | Fit | Note |
|---|---|---|---|---|
| 1 | File a `request` to a named actor, with conditions and a target ref | none. A `claim` opens a held lane with a lease and a workspace (R-LANE-1) | **gap (D1)** | Nothing records work nobody has started, or addresses it. Docs plan D1 proposes `claim` with `hold: false` and an addressee |
| 2 | `promise` the request | `claim` as a take-over of the unheld lane (R-LANE-7) | direct, once D1 exists | Today it is a fresh `claim` whose `because` names the request act |
| 3 | Implement on `request/<slug>` in a worktree | `workspace`, then `git push` to the fork; `propose` pins the head (R-PROP-2) | direct | The pinned ref replaces the branch name as the thing reviews bind to |
| 4 | `artifact` per changed path at an exact head, on the promise | one `propose` at the head; changed paths are computed (R-PROP-3); `summary` holds the report text | direct | One act replaces N artifacts. `because: [{ act: <request> }]` keeps the link |
| 5 | `review-request --to <actor>` | the pack's review obligation, raised as `review-requested` in the reviewer's attention, `as` a principal or `owners` (R-OBL-2) | policy | The author does not choose the reviewer; the policy does. For this project that is `role:checker`, which is what happens today anyway |
| 6 | `review` with `approved` or `changes-requested` and a text file | `review` with `approve` or `object` and `text` (R-OBL-1) | direct | A note on a line is `note` with `replyTo`; there is no path-and-line anchor on `main` (section 3, D5) |
| 7 | Revise and republish at a new head | `propose` generation n+1; verdicts carry under R-CARRY-1 when paths allow | direct | Carrying is stricter than today: an approval on untouched paths survives, one on changed paths does not |
| 8 | `merge-plan`, `merge`, `land` by the planner after approval | `land` by the holder once every obligation is met; the room writes `main` (R-LAND-7, R-PUB-1) | practice | The planner stops merging. Approval is not a separate act; it is the obligations being met. See D3 |
| 9 | `report` the tests and conditions met | `propose.summary`, then `land-outcome` in attention | direct | No separate report act. The summary is the report, and it is bound to the head it reports on |
| 10 | `assert` a durable claim; a ratifier adopts it | a file under `notes/` landed on `main`; adoption is the admins' owner review on that path | policy | Decisions are files. See D2 |
| 11 | `propose` a decision for ratification | the same: `propose` and `land` of the file | policy | The word is the same and the meaning is close: an offered change that others must approve |
| 12 | `dissent` against an act, without blocking | `note` with `replyTo` | practice | `review` with `object` blocks landing under `objection-open` (R-POL-7), so an objection is not a dissent. See D2 |
| 13 | `supersede` a request with a replacement | `release` with an outcome (`duplicate-of`, `wont-do`) | **gap (D1)** | Part of D1 |
| 14 | `reassign-if-unclaimed` | re-address an unheld lane | **gap (D1)** | A rescope is holder-only (R-LANE-2) and an unheld lane has no holder. D1 needs one more op |
| 15 | `wait`, `status`, `work --next` | `attention` and `subscribe` (R-API-8); `lanes`, `lane`, `proposal` (amendment 4) | direct | `work --next` prints the command owed; an attention item says `why`, and the CLI prints what to do next |
| 16 | `verify` | `artroom verify` | direct | Ran live in request `9f81f372` |
| 17 | `actor-add`, `role-grant`, `role-revoke` | `invite`, `join`, `set-role`, `remove`, `revoke-key` | direct | |
| 18 | `admission-profile`, `kind-def`, `infra-key`, `seal` | the policy file and checker configurations (R-POL-1, R-POL-9); MCP packs (amendment 4, item 6) for new tool names | policy | gitseq's vocabulary is open and declared in the log; Artroom's acts are closed and policy gives them meaning. This is a stance, not a gap, and the freeze in section 4 states it |
| 19 | `say` (ephemeral chat) and presence | none | practice | Nothing ephemeral exists. Progress reports become `note` acts, which are permanent. See D6 |

Sixteen rows are direct, policy or practice. Three are D1. [Judgement]

## 3. The gaps as decisions

### D1. Work tracking

**The gap.** Rows 1, 13 and 14. A planner's job is to file work for
others and to retire it when it is wrong. Artroom cannot record either.

**Recommendation: build docs plan D1, option 1**, as an amendment with
four body fields and one attention reason:

- `claim` gains `hold?: boolean` (default `true`) and `to?: Principal`.
  With `hold: false` the lane opens unheld, with no lease and no
  workspace, and `to` puts it in that principal's attention. Overlap is
  computed at filing (R-PATH-3), so declared intent reaches the board.
- `release` gains `outcome?: "done-elsewhere" | "wont-do" | { duplicateOf: LaneId }`.
  A lane released with an outcome is closed and cannot be taken over.
- Re-addressing: a `claim` on an unheld lane with `hold: false` and a new
  `to`, signed by the filer or an admin, replaces the addressee. This is
  the one op docs plan D1 did not list, found by row 14.
- A new attention reason, `work-addressed`, with the lane and the goal.

Nothing else: no labels, priorities or custom fields. Scope, goal and
addressee are the filters. The lane's `because` carries the link to a
note or an earlier act. [Judgement]

**What this touches.** The contract (`ClaimBody`, `ReleaseBody`,
`AttentionWhy`), lane A (admission and attention), lane E (one option on
`claim` and `release`, in CLI and MCP), lane F (a filter), lane L (two
body fields in the log). Amendment 4's item 1 carries the new fields to
MCP with no further change (MCP plan, section 11). [Source, Judgement]

**Why not option 2** (claim, then release at once, and document it): it
holds a lease and opens a workspace for work nobody is doing, needs a
scope before the work is understood, cannot be addressed, and cannot be
closed. The planner's board would be a list of released lanes with notes.
[Judgement]

### D2. Governance: decisions, ratification, dissent

**The gap.** Rows 10 to 12. Today a design note is adopted by a ratifier
asserting it, and dissent is a kind of its own.

**Recommendation: no new act.** Three practices and one pack rule:

- A decision is a file on `main`. A design note is adopted when it lands.
  The landing's obligations are the ratification.
- The pack gives `notes/**` and `docs/**` an owner review by the admins
  team, so no note lands without an admin's `approve`. For this project
  that is Hugh, with the planner as a delegated admin for routine notes.
  The sole-admin case is flagged on the record (`sole-admin-self-approval`,
  R-ADMIN-2), which is the right amount of ceremony. [Source]
- Dissent that should not block is a `note` with `replyTo` on the
  proposal. An objection that should block is `review` with `object`. The
  `AGENTS.md` block the CLI prints says which to use. [Judgement]
- A decision that changes the rules is a change to `.artroom/policy.json`,
  which the pack already protects with `obl_admin-approval`
  (`docs/policy-pack.md`). [Source]

**What is lost.** gitseq's `assert` can be ratified without a file
changing. In Artroom, every decision leaves a diff. That is the better
record. [Judgement]

### D3. Who lands

**The gap.** Row 8. Today the planner merges after the checker approves.
In Artroom the holder lands when obligations are met, and the room writes
`main`.

**Recommendation: the holder lands.** The planner's merge step was a
separation of duties that Artroom gives by construction: the author
cannot meet an independent review obligation (R-OBL-2 excludes the
author), and the room refuses `land` while anything is open
(`obligation-open`). If a human gate on `main` is still wanted, it is a
pack rule, `landApproval: role:admin`, not a verb. For this project I
would not add it. [Judgement]

### D4. Reports

Row 9. The reporting artifact's text, "the tests and conditions actually
met", becomes `propose.summary`, which is bound to the head and shown to
reviewers. The request's conditions are in the lane's goal (D1). The
landing's `land-outcome` closes the loop. No change. [Judgement]

### D5. Note anchors

Row 6. The MCP plan's `note` tool takes an anchor of "act, or path and
line at a head" (MCP plan, section 6). The contract's `NoteBody` has
`text` and `replyTo` only. Reviewers today write path references in the
text. **Recommendation: defer.** It is a field addition, not a rename, so
it does not threaten stability, and the move does not need it. File it
when a reviewer first wants it. [Judgement]

### D6. Ephemeral chat

Row 19. The checker reports progress through `say` several times per
review. Artroom has no ephemeral channel. **Recommendation: accept the
loss for now.** Progress that matters goes in `note`; progress that does
not matter goes nowhere. If the volume of notes becomes noise, the UI's
WebSocket (R-API-12) is the place for a live layer that is never
authoritative, which is the jam's live layer by another name
(`notes/2026-10-01-jam-room.md`, section 3). Not an act. [Judgement]

### D7. Choosing a reviewer

Row 5. The author cannot ask a particular person. Policy decides. For
this project the policy says `role:checker`, which is what happens
today. A pack rule could later let `because` name a preferred reviewer
whom the rule then notifies. Not needed for the move. [Judgement]

### D8. `check` stays out of the CLI and MCP

A `check` is signed by a checker key over RPC from a checker service
(R-EXEC-8). The CLI and MCP have no `check`, and that is frozen: a check
that a person or a coding agent could sign would not be machine evidence.
[Source, Judgement]

## 4. Freeze now, amend before the move

**Frozen.** These do not change before development moves, and a change
to any of them afterwards is a contract amendment with a migration note:

- the seven act kinds and their names; `renew`; `roster` and its nine ops;
- every body field listed in section 1.1 and 1.2, with its type;
- `Verdict`: `approve`, `object`;
- the thirteen `AttentionWhy` reasons;
- the ten MCP tool names and inputs on `main`, and the four reads
  amendment 4 adds;
- the CLI command names in section 1.4;
- the refusal codes the acts above can return;
- the exclusions: no `check` and no roster op over MCP or the CLI.

**Amended before the move, as one amendment (working title: amendment
5, work tracking):**

1. `ClaimBody.hold?` and `ClaimBody.to?`, with the unheld-at-filing rule
   and overlap at filing.
2. `ReleaseBody.outcome?`, with the closed-lane rule.
3. Re-addressing an unheld lane by the filer or an admin.
4. `AttentionWhy` gains `work-addressed`.
5. Acceptance cases: file, address, take over, release with each outcome,
   re-address, a take-over refused on a closed lane, and the attention
   items each raises.

**Lands as already decided:** amendment 4, items 1 to 4 (request
`a9788a59`, awaiting review). [Source]

**Not before the move:** D5 (note anchors), D6 (a live layer), D7
(preferred reviewer), stage 2 of the MCP plan. [Judgement]

## 5. The jam's verbs

The jam note's acceptance criterion is zero contract amendments
(`notes/2026-10-01-jam-room.md`, summary). Its mapping (section 1 of
that note) uses: exclusive `claim` on a scope; `release` with a handover
note naming the next soloist; refusal `scope-overlap`; lease expiry;
`note` as a signal; `propose` and `land` of pattern files; `song.json`
on `main`; policy changed mid-session. [Source]

Against section 4: every one of these is in the frozen set. The jam
does not file work for others, so it does not need D1. It does not
ratify decisions, so it does not need D2's pack rule, though it can use
it. It needs nothing from D5 to D7. [Judgement]

So the sequencing result is concrete. **The jam can self-host now**, on
the frozen verbs, before amendment 5 lands. **The platform cannot**: its
planner has no board until amendment 5 lands. Moving the jam first, as
request `7a3bbf8f` item 6 proposes, is therefore not only lower risk but
also earlier. [Judgement]

One thing the jam needs that is not a verb: its checker must be reachable
from the room, which the jam note's first distribution finding says
requires a deployment change (`notes/2026-10-01-jam-room.md`, section 9).
That is a deployment matter for request `7a3bbf8f` item 4. [Source]

## 6. What this note does not decide

- Whether amendment 5 is built by lane A or by whoever takes the first
  self-hosted platform request. The request that adopts this note
  decides.
- The exact `Principal` form of `to` (member, team or role) and whether
  `owners` is allowed.
- Whether re-addressing is a `claim` variant or a new roster-like op. The
  amendment's author decides; this note only requires that the filer and
  an admin can do it.
- The pack for the Artroom repository itself: which paths need which
  reviews, and which checks. That is the `a13a0bf5` default pack plus a
  short admin pass, filed under request `7a3bbf8f` item 2.
- Whether the gitseq workroom's history is imported into the Artroom room
  or linked from it. Linking by URL in `because` is enough to start.

## 7. Sources

- `docs/protocol.md` on `main` at `bd520fb9`: rules cited by number.
- `packages/contract/src/acts.ts`, `roster.ts`, `ids.ts`, `pagination.ts`,
  `envelope.ts`, `transports.ts` at the same head.
- `packages/mcp/src/tools.ts`; `packages/cli/README.md` and `src/cli.ts`.
- `docs/protocol.md` on `request/mcp-amendment`, section 30 and R-API-9.
- `notes/2026-10-01-mcp-plan.md` on `request/mcp-plan`, sections 6, 11 and
  14.
- `notes/2026-10-01-docs-plan.md` on `request/docs-plan`, section 7, D1.
- `notes/2026-10-01-jam-room.md` on `request/jam-room-note`, revision 3.
- `notes/deploy-spike.md` at `09d4bbba`, "Review and check, live".
- `~/play/gitseq/SKILL.md` and `gs status` (`vocabulary.definitions`) in
  this workroom.
- Workroom: assert `aa691b8b`; requests `9f81f372`, `a9788a59`,
  `a13a0bf5`, `7a3bbf8f`, `f4a626c8`.
