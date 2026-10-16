# Repo in your AI app: MVP implementation plan

Status: planning note, draft 1, 16 October 2026. It commissions nothing.
It plans the first version of
[the design proposal](2026-10-16-repo-in-your-ai-app.md) ("the proposal")
so that the MCP Apps approach gets a real user test: one owner in their
desktop assistant, two coding agents, and the "Clear completed" scenario
from start to end.

Repo facts cite `path:line` at main `54dcefbcb`. External facts cite a URL
checked on 16 October 2026; each is marked **confirmed** (read on the
owner's own page) or **assumed** (not yet tested, or the sources disagree).

## 0. Choices already settled for this plan

1. **Agents:** existing coding agents (Claude Code and Codex sessions)
   connect through MCP with their own agent keys, as builder and checker
   work today. Hosted agents come later (section 5).
2. **Environment:** nothing is deployed while the Cloudflare freeze
   holds, and no existing Worker changes. The test runs on the owner's
   desktop, in the ChatGPT and Claude desktop apps, against a local room.
3. **Repository:** everything stays inside artroom; no separate demo
   repository (1.3).
4. **Slack** is out. Views use only the open MCP Apps standard; anything
   one host needs in addition is isolated in one module (S2).
5. **Queue:** the MVP moves no sequenced work. Its slices follow that
   sequence and reuse what it delivers (section 6).

## 1. The user test

### 1.1 Who and where

| Role | Who | Connection |
|---|---|---|
| Owner | One person, a room admin. Their own member key is in their `DAP_HOME`. | Claude Desktop starts `dap mcp` over stdio. ChatGPT desktop reaches a second `dap mcp` process on the same `DAP_HOME` (see 1.2). |
| Interface agent | A Claude Code session in its own Git worktree | `dap mcp` over stdio, with its own agent key (`dap invite --kind agent-key`, `notes/2026-10-13-agent-key-cohorts.md:24-27`) |
| Storage agent | A Codex session in its own Git worktree | The same arrangement, with its own key |
| Check runner | A local script with a checker key | Signs `check` results (S7) |

Every act is signed with the key of the person or agent who takes it.
`dap mcp` signs with the key in its configuration directory
(`packages/cli/src/mcp.ts:77-102`). No bearer and no OAuth token stands in
for the owner. When the owner adopts criteria or records a decision in
either host, that act is signed with the owner's own key.

### 1.2 What each desktop host can do locally (external facts)

- **Claude Desktop, confirmed.** It starts local stdio servers from
  `claude_desktop_config.json` or a desktop extension (`.mcpb`) and
  renders their MCP Apps views; the official guide runs the ext-apps
  examples this way
  (https://claude.com/docs/connectors/building/mcp-apps/getting-started.md).
  A connector added by URL is reached from Anthropic's servers and needs a
  public endpoint (https://claude.com/docs/connectors/building/testing.md).
  A stdio server cannot set `_meta.ui.domain`
  (https://claude.com/docs/connectors/building/mcp-apps/troubleshooting.md).
  **Claude Desktop over stdio is the main development host.**
- **ChatGPT desktop, partly confirmed.** Custom MCP servers are reached
  from OpenAI's side
  (https://developers.openai.com/api/docs/guides/custom-mcp-server.md).
  The documented local route is OpenAI's Secure MCP Tunnel: a local
  `tunnel-client` connects outward to a private server over stdio or
  HTTP, for testing
  (https://developers.openai.com/api/docs/guides/secure-mcp-tunnels.md).
  No public endpoint or Cloudflare deployment is involved, and "No
  authentication" is an allowed setting. ChatGPT renders the open
  standard (`text/html;profile=mcp-app`, `_meta.ui.resourceUri`, the
  `ui/*` bridge); `window.openai` is optional
  (https://developers.openai.com/plugins/build/chatgpt-ui.md).
  **Assumed:** which plans may add a custom server (sources disagree:
  Business, Enterprise and Edu only, or also Plus and Pro); that a server
  added on the web works in the desktop app; that the tunnel admits only
  the owner's workspace; and whether "desktop only" stdio plugins
  (https://developers.openai.com/plugins/deploy/desktop-only.md) are open
  to private use. S0 settles these on a real account.
- **No product needed, confirmed.** The ext-apps reference host
  `examples/basic-host` (https://github.com/modelcontextprotocol/ext-apps)
  and MCP Inspector 2.11.0, a "spec-conformant Apps host"
  (https://github.com/modelcontextprotocol/inspector/blob/main/docs/mcp-app-review.md),
  run locally. Automated view witnesses run in these.
- **Standard, confirmed.** MCP Apps is stable at extension version
  `2026-01-26` (`io.modelcontextprotocol/ui`, file
  `specification/2026-01-26/apps.mdx` in the ext-apps repository), with a
  draft beside it. The open SDK is `@modelcontextprotocol/ext-apps` 2.0.3
  (npm, 25 September 2026).

If the tunnel is closed to the test account, the test runs in Claude
Desktop alone, and ChatGPT waits for H1 (section 5). Views and records
are the same.

### 1.3 The repository, in artroom

The interpretation: the demonstration application and its room both live
in artroom.

- **The application.** A new directory `examples/task-list/` holds a very
  small task list. It has a static page, a storage module, `BRIEF.md`
  (the product brief) and tests that run with `node --test`. No such
  application exists yet; a search found only GFM task-list rendering
  (`docs/pages.md:88`). `examples/` already holds `demo-repo/` and
  `lending/`.
- **The room's destination.** A local bare copy of the artroom repository,
  seeded from main, on the owner's disk. Publication writes that copy's
  main. Nothing is pushed to GitHub. The remote host ports are Artifacts
  and GitHub only, and any other host's operations stay recorded and
  unsent (`docs/hosts.md:21-25`). So the local destination is new work
  (S1).
- **The brief** is a file in the repository (`examples/task-list/BRIEF.md`).
  A reviewed change revises it, and its version is the commit. No new
  record type is needed.
- **Adopted criteria** are the issue's `conditions`. Only the requester can
  `revise` them, and each version is an entry (`conditionsAt`,
  `apps/room/lanes/src/issue.ts:43,239-253`).

### 1.4 The scenario, step by step

| Step | Actor | Acts and tools | View | Record |
|---|---|---|---|---|
| 0 | Owner | `file` an issue: "Clear completed" with conditions. `offer` two commitments, interface and storage. | Work | intent, commitments (`issue.ts:26-67`) |
| 1 | Agents | `accept`, then `take-hold` (`issue.ts:382-410,530-550`) | Work | accepted commitments, holds |
| 1 | Storage agent | `ask` addressed to the owner, with goal, alternatives, consequences and a recommendation (S3). `block` its commitment on the ask (`issue.ts:689-709`). | Decision | ask (asked), block (blocked) |
| 1 | Interface agent | Keeps working, and `report`s a staged commit (`issue.ts:551-591`) | Work | report |
| 2 | Owner, new conversation | "What needs my judgment?" calls `needs_you` (S4) | Needs you, then Decision | none; read only |
| 3 | Owner | Asks follow-up questions. The assistant reads the brief, the conditions and the evidence. The owner then `revise`s the conditions with the proposed criteria. | Decision | new `conditionsAt` |
| 3 | Owner | `decide` (S3): choose "keep in history", give a reason, and name the conditions version adopted | Decision | ask (decided) |
| 4 | Storage agent | `wait` for the ask to reach decided (`packages/mcp/src/service.ts:497`), read the decision, `release-block` naming the decide entry, take the hold again, and work | Work | block (released) |
| 4 | Agents | `report`. The owner `accept-report`s (`issue.ts:592-613`), or delegates that to the change. | Work | reports, inputs |
| 5 | Interface agent | `propose-manifest` (`apps/room/lanes/src/change.ts:448-821`) and `request-check`. The check runner records a `check`. The other agent `review-verdict`s. | Change | manifest, job, result, review |
| 5 | Owner | Reads the exact diff, the checks, the reviews and the effect on the conditions. Approves and `merge`s (`change.ts:1271-1391`). | Change | review, merge, publication |
| 5 | Destination | Publishes to the local main and closes the issue (`change.ts:1613-1676`) | Change | merge published, issue closed |

Then the owner opens Claude Desktop, while the earlier steps ran in
ChatGPT, or the other way round. The same records and the same four views
appear.

### 1.5 What counts as a pass

These are the proposal's proof questions (proposal lines 81-84), each with
something an observer can record:

1. **Explain the trade-off.** In a new conversation, the owner states the
   two choices and their consequences. They need no other window and
   paste no context.
2. **Spot a conflict when checks pass.** In a scripted second round, an
   agent proposes a version that deletes cleared tasks. Its checks pass.
   The Change view shows that it conflicts with the recorded decision and
   the adopted conditions. The owner sees this and requests changes.
3. **Resume without copying context.** After the decision, each agent
   resumes in a fresh session. The owner sends no message to either
   agent.
4. **Interruption recovery.** One agent session is killed while it is
   blocked. A replacement session, under a handover, finds the decision
   and finishes the work (`offer-handover`, `issue.ts:447-490`).
5. **Authority holds.** An agent's attempt to `decide` is refused. An
   approval from an old Change card is refused once a newer version
   exists. A merge whose outcome is unknown is never repeated.
6. **Two hosts, one record.** Claude Desktop shows exactly the records
   that ChatGPT showed, at the same heads.

The run note records the observed timings, the number of owner actions,
every refusal, and each point where the owner had to copy context.

## 2. Gap table

| Capability | State | Evidence |
|---|---|---|
| MCP server: stdio and loopback HTTP, two wire revisions, one tool per act, `structuredContent` | exists | `packages/mcp/src/node.ts:309,367`; `wire.ts:31-32`; `catalogue.ts:236-248`; `service.ts:53,102-104` |
| Resources, `ui://` views, MCP Apps metadata | missing | the only capability is tools (`wire.ts:215`); MCP Apps "owed, later" (`plans/031-2026-10-12-generic-mcp-service.md:71`) |
| A view-sized tool set for consumer hosts | partial | `--tools` filters by definition only (`docs/mcp.md:83`) |
| Requests that carry an `Origin` header | refused | 403 on every transport (`http.ts:177`; `node.ts:389`); may matter for the tunnel (S0) |
| OAuth for remote hosts | missing; designed | `notes/2026-10-01-mcp-plan.md:423`; plan 031 line 69. Not needed locally. |
| Local room service | missing | no `dap dev`; "no local host for development" (`notes/2026-10-15-self-contained-applications.md:302-312`); M1 supplies it (`:328-336`) |
| Persistent local Git destination | missing | test stand-ins are in-memory (`packages/scope/test/hosts.ts:1-8`) |
| Full issue lane as MCP tools | partial | the demo profile drops ask, answer, block and release (`apps/room/lanes/src/demo.ts:32-49`); a local founding can use the full digest |
| Agent asks a question and blocks on it | exists | `issue.ts:90-113,634-731` |
| Structured decision: goal, alternatives, consequences, recommendation | missing | `ask` has only `question` and `answer` text (`issue.ts:98-101`); `decision` covers plan concerns only (`:136-150`) |
| Adopt criteria, versioned | exists | `revise`, requester only (`issue.ts:239-253`) |
| Versioned product brief | missing | a repository file (1.3) |
| Only people decide | missing | `answer` is guarded only by the addressee (`issue.ts:655-656`) |
| Agents wait and resume | partial | `wait` up to 60 s (`service.ts:497`); release by hand (`issue.ts:710-731`); a hold ends after 3,600 s (`shared.ts:25-35`) |
| Needs you, per person | partial | attention effects are recorded (`packages/derive/src/effects.ts:514-521`); no delivery to `platform:inbox` (`apps/room/docs/lanes.md:436`) |
| Changed since my last review | missing | no last-seen marker anywhere |
| Exact candidate and review bound to version | exists | `change.ts:59-115,927` |
| Diff and file reads through MCP | missing | deferred (`notes/2026-10-13-hosted-mcp-endpoint.md:33-36`); forge contract 4.5 is design only |
| Checks on the exact tree | partial | the checker runner verifies commit, tree and parent (`packages/checkers/src/runner.ts:1-30`); `request-check` starts no runner |
| Old card cannot approve a newer version | exists | `newer-version` (`change.ts:1287`); `revision-moved` (`packages/derive/src/judge.ts:302`). But MCP fills `expected` from current state (`service.ts:411`), so the card must pass its own revisions. |
| No repeat of an unresolved operation | exists | `merge-in-progress` (`change.ts:1289`); custody by idempotency key (`packages/mcp/src/custody.ts:1-30`) |
| Actual publication result | exists with stand-ins | `change.ts:1613-1676`; a real provider run is unverified (`packages/platform/src/destination.ts:18-20`) |

## 3. Slices

These are the MVP's dependencies, in order. Each names its scope, its
files and the witnesses that tell it from a plausible wrong
implementation. The test placement follows `docs/testing.md:39-56`.

### Prerequisite from the existing sequence: M1's developer half

M1 provides `dap new`, `dap dev` and `dap check`
(`notes/2026-10-15-self-contained-applications.md:328-336`). The MVP
needs `dap dev` to run the scope Worker locally with the MCP route. Its
sketch says "in-memory scopes and live reload" (`:50`). The MVP needs one
thing more: **storage that survives a restart**, because the owner comes
back hours later. That requirement should be added to M1's request now.
It costs M1 little.

### S0. Host probe (small; can use idle capacity now)

- **Scope.** Settle the assumed facts of 1.2 on real accounts before any
  repository code depends on them. Run a throwaway MCP Apps server with
  one view and one write tool from a scratch directory, never a checkout.
  Try it in Claude Desktop over stdio, and in ChatGPT desktop through the
  Secure MCP Tunnel over stdio and loopback HTTP. Record whether each host
  renders the view and calls an app-only tool, whether the tunnel sends
  an `Origin` header or a bearer, which ChatGPT plan was used, and whether
  two processes can share one `DAP_HOME`.
- **Files.** A findings section added to this note. No code.
- **Witnesses:** the view rendered in each host (screenshot and host
  version); the ChatGPT confirmation prompt for the write tool.

### S1. The local room for the test (medium; after M1's `dap dev`)

- **Scope.** An on-disk Git destination port for `dap dev`, seeded from a
  local artroom clone, with local `hold@1` and `git-read@1` ports over
  it. A founding script installs the full `issue` and `change`
  definitions, a rules scope that requires one approval and one check
  named `task-list-tests`, the owner, two agent keys and a checker key.
  Add `examples/task-list/` with `BRIEF.md` and its tests. The port
  belongs in M1 instead if M1's local destination already persists.
- **Files:** `packages/scope/src/` (a local host port beside
  `github-host.ts`), `packages/cli/src/` (`dap dev` options),
  `examples/task-list/`.
- **Witnesses:**
  - after `dap dev` restarts, the room's heads and the local main are
    unchanged;
  - a published merge moves the local main to the exact integration
    commit; a refused one leaves it unchanged;
  - `report` refuses a commit that is not staged in the agent's hold.

### S2. MCP Apps plumbing and the view kit (medium; after S0)

- **Scope.** Declare `resources` and answer `resources/list` and
  `resources/read` on both wire revisions. Serve `ui://dap/needs-you`,
  `ui://dap/work`, `ui://dap/decision` and `ui://dap/change` as
  `text/html;profile=mcp-app`, each one file with inline script and an
  empty CSP. Give view tools `_meta.ui.resourceUri`, and give app-only
  actions `_meta.ui.visibility: ["app"]`, so the model sees a short list.
  Write a small view kit: bridge, item card, action buttons, and the
  absent, stale and unavailable states of forge contract 4.4. Each view
  action calls an act tool through the host bridge, so the view never
  holds a key (forge contract 4.7). The open `@modelcontextprotocol/ext-apps`
  SDK may serve the view side, pinned in a reviewed commit and inlined.
- **Host-specific code** lives in one module, `views/hosts.ts`, and holds
  only `_meta.ui.domain` (ChatGPT requires it for plugins with UI; a
  stdio server in Claude may not set it) and the optional `openai/*`
  aliases.
- **Files:** `packages/mcp/src/wire.ts`, `service.ts`, a new
  `packages/mcp/src/views/`.
- **Witnesses:**
  - `resources/read` returns each view's exact bytes, matching the digest
    pinned in the tool's metadata;
  - an app-only tool is absent from the model's list but callable from
    the view;
  - a view in basic-host shows the stale state when its head is older
    than the current one;
  - without `views/hosts.ts`, all four views still work in basic-host.

### S3. The decision record (medium; in parallel with S2)

- **Scope.** A new revision of the issue definition, as `change3.ts` did
  for change.
  - The `ask` item gains fixed fields: `goal` (a ref to the intent's
    `conditionsAt`), `alternatives` (at most 6, each a title and its
    consequences), `recommendation` (an index), `assumptions`, `evidence`
    (digests) and `brief` (the brief's path and commit).
  - A new `decide` act on the ask, for the addressee only and under a new
    grant `issue.decide` that only person members hold. Its fields are
    `choice` (an index), `reason` and `criteriaAt`, which must name the
    intent's current `conditionsAt`. To adopt new criteria, the owner
    first uses the existing `revise`, then decides.
  - `release-block` also accepts a `decide` entry.

  Agent analysis stays in the ask, human judgment in `decide`, and the
  operation in later acts, as the proposal requires (lines 62-63).
- **Files:** `apps/room/lanes/src/issue3.ts`, `digests3.ts`, the pinned
  bytes, one scenario in `apps/room/lanes/test/*.scope.test.ts`,
  `docs/lanes-reference.md`.
- **Witnesses:**
  - an agent key is refused `decide`, even as the addressee;
  - `decide` naming an earlier `conditionsAt` is refused, and naming the
    current one is accepted;
  - `release-block` naming another ask's decision is refused
    `not-this-ask`;
  - a choice outside the alternatives is refused.

### S4. Needs you, Work, and changes since review (medium; after S2, S3)

- **Scope.**
  - `needs_you`, a read tool computed from current state across the
    room's issue and change scopes, never from a second store (forge
    section 7.2). It lists asks to me that are still asked, reports
    waiting for my acceptance, current manifests waiting for my review or
    merge, and merges whose outcome is unknown. Each entry names the rule
    that put it there and its head. A fixed bound (50 entries, 8 scopes)
    applies, and the result says what the bound left out.
  - `work`, a read tool: each agent's commitment, hold, block, latest
    report and state.
  - `since`: an explicit "mark reviewed" stores the current heads in a
    local file in `DAP_HOME`, and `since` lists the entries after them.
- **Files:** `packages/mcp/src/service.ts`, a new `projections.ts`,
  `docs/mcp.md`.
- **Witnesses:**
  - an ask addressed to someone else never appears in my `needs_you`;
  - a decided ask leaves `needs_you` at the next read with no other act;
  - with 9 scopes, the result says one scope was not read;
  - `since` is empty after "mark reviewed", and one new entry makes it
    one.

### S5. Agent wait and resume protocol (small; after S3)

- **Scope.** No new runtime. A `work-on` prompt (named in
  `plans/031-2026-10-12-generic-mcp-service.md:70`) and an agent guide
  give the loop: claim, ask, block, then `wait` (60 s at most, repeated)
  until the ask is decided; read the decision, release the block, take
  the hold again (a hold lasts 3,600 s), continue. The two agents hold
  separate commitments, so one block never stops the other. A
  replacement agent finds the decision through its commitment's block.
- **Files:** the prompt in `packages/mcp/src/`, a new
  `docs/agents-in-a-room.md`, one lane scenario.
- **Witnesses:**
  - with two commitments and one blocked, the other's report is accepted
    while the block is open;
  - after a handover, the successor releases the block with the original
    decide entry;
  - a `wait` that times out returns the same state and writes nothing.

### S6. Change view and authorized merge (large; after S1, S2)

- **Scope.**
  - A `diff` read tool between exact endpoints (`base` and
    `integration`), read from the destination under a byte bound. Over
    the bound it says "truncated"; it never presents part of a file as
    whole (forge contract 4.5).
  - The Change view shows the manifest's base, integration and tree, the
    checks and reviews of that manifest only, and the conditions and
    decision that the issue links.
  - Every card action carries the item revisions the card displayed. The
    act tool gains an optional `at` that replaces `expectedOf`
    (`service.ts:411`), so an old card is refused `revision-moved`
    instead of being signed against current state.
  - A merge with an unknown outcome shows "outcome unknown" and offers
    only `settle` (`service.ts:499`).
- **Files:** `packages/mcp/src/service.ts`, `shape.ts`, `views/change`,
  `docs/mcp.md`.
- **Witnesses:**
  - a card captured at version 1 that approves after version 2 exists is
    refused; the same approval from a fresh card is accepted;
  - while a merge is `unknown`, a merge from any card is refused
    `merge-in-progress`;
  - replaying a card's action under its idempotency key returns the kept
    outcome and sends nothing;
  - a diff over the bound says "truncated" and names the bound.

### S7. Local check runner (small; after S1)

- **Scope.** A script that takes `request-check` jobs, checks out the
  exact tree with `packages/checkers` (`runner.ts:1-30`), runs
  `node --test examples/task-list`, and signs `check` or `check-error`
  with the checker key, labelled as member-run. The evidence rules design
  (branch `planner/evidence-rules-design-20261016`, not on main) can
  replace that label later; the MVP does not wait for it.
- **Files:** a local entry point in `packages/checkers/src/`.
- **Witnesses:** a job whose tree differs from its commit gives
  `tree-mismatch` and runs nothing; a failing test records a failed
  check, and `merge` is then refused.

### S8. Rehearsal and the user test (medium; last)

- **Scope.** One scripted end-to-end run of section 1.4, with scripts as
  agents, through the MCP tools and basic-host. Then the human test of
  1.5 in Claude Desktop and ChatGPT desktop with two real agent sessions,
  and a run note that labels each measurement by how it was taken.
- **Witnesses:** the six pass items of 1.5, each with its observation.

## 4. Decisions still open, with recommendations

The choices of section 0 are settled. These remain:

1. **Where the product brief lives.** **Recommend a repository file**
   whose version is its commit (1.3), not a new `brief` item type. It is
   versioned and reviewed like any other change, with no new record type.
2. **Decision as an issue revision or a new definition.** **Recommend an
   issue revision (S3).** The ask, the block and the conditions already
   live there, and `release-block` stays within one scope.
3. **Where "changed since review" is kept.** **Recommend a local file in
   `DAP_HOME`** for the MVP. It is per device. A recorded marker, for
   example in `platform:inbox`, can follow when inbox delivery is wired.
4. **ChatGPT if the tunnel is closed to the test account.** **Recommend
   the test in Claude Desktop alone,** with ChatGPT following through H1
   after the freeze, rather than a public endpoint for a local process.
5. **S1's Git port.** **Recommend asking M1 to persist both storage and
   the destination to disk.** S1 then shrinks to the founding script and
   the example.

## 5. Out of scope for the MVP

- Any plan, price, free allowance or paid continuation.
- **Hosted agents** (the Room step of
  `notes/2026-10-15-hosted-agent-teams-design.md`). They later add a
  saved workspace as an Artifacts fork for each hold (`:353-399`), a
  shared spending limit reserved before each model call (`:302-336`), a
  supervised turn loop, and replacement run by the room, not a person.
  External agents bring their own workspaces and spending, so the MVP
  states no spending limit.
- **H1, the remote host connection.** An OAuth 2.1 authorization server
  in front of the hosted endpoint (`@cloudflare/workers-oauth-provider`
  1.2.3, 7 October 2026,
  https://github.com/cloudflare/workers-oauth-provider): client ID
  metadata documents first, PKCE S256, protected resource metadata and an
  audience-bound token. A consent page on the room's own origin maps the
  person to their membership without exporting their key. Both hosts
  require this for remote servers
  (https://developers.openai.com/plugins/build/auth.md;
  https://claude.com/docs/connectors/building/authentication.md). It
  needs a deployment, so it comes after the freeze.
- **Slack.** Slackbot renders MCP Apps views
  (https://docs.slack.dev/ai/slackbot-mcp-client/returning-rich-responses/),
  so S2's views should carry over later.
- Two-way GitHub synchronization, GitHub import
  (`notes/2026-10-15-github-repository-import.md:323-336`), more than one
  destination, and publication to GitHub.
- Read limits within a room; members read the whole record (proposal
  line 88). Inbox delivery, alerts and live subscriptions.
- The deployed services `artroom-scope`, `artroom-rehearsal`,
  `dap-lending` and `dap-home` (`apps/room/wrangler.jsonc:33`;
  `docs/demo.md:63`; `docs/deploy.md:159-187`) are neither changed nor
  used for the test.

## 6. Order, size and how the MVP fits the existing sequence

The existing builder sequence stands as it is:

1. the NOW work: e029 bottlenecks and e871 durability, including the
   archive;
2. hosted Counter slices 1 to 4, in parallel with M1's developer half;
   observability and capacity run alongside;
3. M1's install half and the Counter page.

The MVP slices come after that sequence.

| Order | Slice | Size | Depends on | Can run in parallel with |
|---|---|---|---|---|
| any time | S0 host probe | small | nothing | anything (no repository code) |
| 1 | S2 MCP Apps plumbing and view kit | medium | S0 | S3 |
| 1 | S3 decision record | medium | nothing in the sequence | S2 |
| 2 | S1 local room | medium (small if M1 persists) | M1 `dap dev` | S4, S5 |
| 2 | S4 needs you, work, since | medium | S2, S3 | S1, S5 |
| 2 | S5 wait and resume | small | S3 | S1, S4 |
| 3 | S6 change view and merge | large | S1, S2 | S7 |
| 3 | S7 local check runner | small | S1 | S6 |
| 4 | S8 rehearsal and test | medium | all | none |

How the existing items relate to the MVP:

- **Prerequisite:** M1's developer half (request `74f38c24`). Its
  `dap dev` is the local room service; add the persistence requirement
  to its request now.
- **Helps:** MCP bounded query `8bc5a05a`
  (`notes/2026-10-15-public-item-query-integration.md:364`) gives S4 its
  paging and bounds; without it S4 pages through `items` under its own
  bound. Hosted Counter slices 1 to 4 bring enrollment on the
  invitation-key cohort, where an admin creates each agent member and
  invitation (`notes/2026-10-15-hosted-counter-contracts.md:23-26`); S1's
  founding script can reuse it for the agent keys. Their turn loop is the
  pattern for hosted agents later. Neither is an MVP dependency.
- **Helps later:** M1's install half and M2. M2's declared projections
  and presentation boundary
  (`notes/2026-10-15-self-contained-applications.md:339-353`) are the
  long-term home of `needs_you` and the views; until then S2 builds them
  into `packages/mcp`.
- **Can wait:** observability, capacity and CLI JSON, which are not on
  the MVP path; evidence rules, which can later replace S7's member-run
  label.
- **Idle capacity:** S0 needs no builder; a planner or checker session
  can run it. The `examples/task-list/` part of S1 is small and touches
  nothing in the existing slices.

The order numbers in the table count from the end of the existing
sequence. The critical path is M1 `dap dev`, S1, S6, S8. S2 to S5 need
no `dap dev`: basic-host and workerd scenarios witness them. They can
therefore use builder time that the sequence leaves idle, but they never
take time from it.
