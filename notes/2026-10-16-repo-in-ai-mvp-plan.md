# Repo in your AI app: MVP implementation plan

Status: planning note, draft 2, 16 October 2026. It commissions nothing.
It plans the first version of
[the design proposal](2026-10-16-repo-in-your-ai-app.md) ("the proposal")
so that the MCP Apps approach gets a real user test: one owner in their
desktop assistant, two coding agents, and the "Clear completed" scenario
from start to end. Draft 2 uses a room on the existing hosted service, a
question with requested approvers, and an extension installed into that
room.

Repo facts cite `path:line` at main `54dcefbcb`. External facts cite a URL
checked on 16 October 2026; each is marked **confirmed** (read on the
owner's own page) or **assumed** (not yet tested, or sources disagree).

## 0. Choices already settled for this plan

1. **Agents:** existing coding agents (Claude Code and Codex sessions)
   connect through MCP with their own agent keys, as builder and checker
   work today. Hosted agents come later (section 5).
2. **No deployment while the Cloudflare freeze holds,** and no existing
   Worker changes. The test runs in the ChatGPT and Claude desktop apps,
   through a local `dap mcp`.
3. **No local room.** The test uses an existing room on the hosted
   service, as a member. Signed acts and data are use, not deployment.
   Local rooms (`dap dev`) are a developer feature for third parties and
   are not part of the MVP.
4. **Repository:** everything stays inside artroom; there is no separate
   demo repository (1.3).
5. **Composition:** the MVP is an extension installed into the existing
   room. The product brief lives in the extension's package (1.3).
6. **Decisions** are questions addressed to named people. Approvals count
   only from those people, bound to the exact text they approved (S3).
7. **Slack** is out. Views use only the open MCP Apps standard; anything
   one host needs in addition is isolated in one module (S2).
8. **Queue:** the MVP moves no sequenced work. Its slices follow that
   sequence and reuse what it delivers (section 6).

## 1. The user test

### 1.1 Who and where

| Role | Who | Connection |
|---|---|---|
| Owner | One person, an admin of the room. Their member key is in their `DAP_HOME`. | Claude Desktop starts `dap mcp` over stdio. ChatGPT desktop reaches a second `dap mcp` on the same `DAP_HOME` (1.2). |
| Interface agent | A Claude Code session in its own Git worktree | `dap mcp` over stdio, with its own agent key (`dap invite --kind agent-key`, `notes/2026-10-13-agent-key-cohorts.md:24-27`) |
| Storage agent | A Codex session in its own Git worktree | The same arrangement, with its own key |
| Check runner | A local script with a checker key | Signs `check` results (S7) |

The room is the artroom room on the existing hosted service. S1
identifies it: its service URL, directory, rules scope and destination.
`dap mcp` runs on each desktop. It reads from that service and sends acts
to it, signed with the key in its configuration directory
(`packages/cli/src/mcp.ts:77-102`). No bearer or OAuth token stands in
for the owner.

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

### 1.3 The extension package, inside artroom

The MVP is one extension, with its source at `examples/repo-in-ai/` in
artroom. It holds:

- the question-and-approval revision of the issue definition (S3), as
  pinned bytes;
- the four views and the tool descriptions (S2, S4, S6);
- the product brief, `BRIEF.md`;
- the example application `task-list/`: a static page, a storage module
  and tests that run with `node --test`. No task-list application exists
  in the repository today; the only hits are GFM task-list rendering
  (`docs/pages.md:88`).

**What works by hand today.** Definitions install into an existing room
through signed acts, with no redeploy (`docs/run-your-app.md:103-147`):
`activate` in the rules scope, then `set-actions` for the roles that may
use the acts. A repository room opens an issue under any definition
digest that its rules have activated. `open-issue` takes a `definition`
field, and its guard requires that definition to be active
(`packages/platform/src/directory.ts:126-145,727-746`). So a new issue
revision needs no host change, provided the deployed service accepts its
forms (S0 checks this). Views and tool descriptions are read by the local
`dap mcp` from the package directory, pinned by digest.

**What M1 adds.** Self-contained apps M1 supplies the manifest with its
three ids, `pack`, and install by URI in one act
(`notes/2026-10-15-self-contained-applications.md:328-336`). Its
developer half (manifest, pack, `dap new`, `dap check`) is local tooling
and is sequenced before the MVP. Its install half (the package store,
generic route and install act) is host code, so it waits for the
deployment freeze. **If the install half is deployed in time, the MVP is
the first real package. Otherwise S8 installs the same parts by hand, in
the same order.**

**The brief** is in the package, so a package version or digest fixes
its version. A question pins the brief digest that it was written
against.

**Adopted criteria** are the issue's `conditions`. Only the requester can
`revise` them, and each version is an entry (`conditionsAt`,
`apps/room/lanes/src/issue.ts:43,239-253`).

**The application's repository** is the room's existing destination. The
example application reaches it through the room's first change, a
reviewed merge. Nothing is pushed to the GitHub repository.

### 1.4 The scenario, step by step

| Step | Actor | Acts and tools | View | Record |
|---|---|---|---|---|
| 0 | Owner | `open-issue` under the S3 digest: "Clear completed", with conditions. `offer` two commitments. | Work | intent, commitments (`issue.ts:26-67`) |
| 1 | Agents | `accept`, then `take-hold` (`issue.ts:382-410,530-550`) | Work | commitments, holds |
| 1 | Storage agent | `ask` a question whose body states the goal and alternatives, and may recommend one. `request-approval` from the owner. `block` its commitment on the question. | Decision | question, approval request, block |
| 1 | Interface agent | Keeps working, and `report`s a staged commit (`issue.ts:551-591`) | Work | report |
| 2 | Owner, new conversation | "What needs my judgment?" calls `needs_you` (S4) | Needs you, then Decision | none (read only) |
| 3 | Owner | Asks follow-up questions and comments on the question. The agent revises the question's text. The owner `revise`s the conditions with the proposed criteria. | Decision | comments, question version 2, new `conditionsAt` |
| 3 | Owner | `approve` question version 2 ("keep in history"), naming the conditions adopted. Then `decide`. | Decision | approval, question (decided) |
| 4 | Storage agent | `wait` for the question to be decided (`packages/mcp/src/service.ts:497`), read it, `release-block` naming the decide entry, take the hold again, and work | Work | block (released) |
| 5 | Interface agent | `propose-manifest` (`apps/room/lanes/src/change.ts:448-821`) and `request-check`. The check runner records `check`. The other agent reviews. | Change | manifest, job, result, review |
| 5 | Owner | Reads the exact diff, the checks, the reviews and the effect on the conditions. Approves and `merge`s (`change.ts:1271-1391`). | Change | review, merge |
| 5 | Destination | Publishes and closes the issue (`change.ts:1613-1676`) | Change | publication, issue closed |

Then the owner opens Claude Desktop, while the earlier steps ran in
ChatGPT, or the other way round. The same records and views appear.

### 1.5 What counts as a pass

These are the proposal's proof questions (proposal lines 81-84), each with
something an observer can record:

1. **Explain the trade-off.** In a new conversation, the owner states the
   choices and their consequences. They need no other window and paste no
   context.
2. **Spot a conflict when checks pass.** In a scripted second round, an
   agent proposes a version that deletes cleared tasks. Its checks pass.
   The Change view shows that it conflicts with the approved question and
   the conditions. The owner requests changes.
3. **Resume without copying context.** Each agent resumes in a fresh
   session. The owner sends no message to either agent.
4. **Interruption recovery.** An agent session is killed while blocked. A
   replacement, under a handover (`issue.ts:447-490`), finds the decision
   and finishes the work.
5. **Authority holds.** These are refused, or do not count: an agent's
   approval, an approval from someone who was not requested, an approval
   of an earlier text of the question, an approval from an old Change
   card, and a repeat of a merge whose outcome is unknown.
6. **Two hosts, one record.** Claude Desktop shows exactly the records
   that ChatGPT showed, at the same heads.

The run note records timings, the number of owner actions, every refusal,
and each point where the owner had to copy context.

## 2. Gap table

"Kind" says where a missing piece goes. **Data** is a definition or a
signed act in the room, with no deployment. **Local** is code in
`dap mcp`, the views or a local script. **Host** needs a deployment and
waits for the freeze.

| Capability | State | Kind | Evidence |
|---|---|---|---|
| MCP server over stdio and loopback HTTP; one tool per act; `structuredContent` | exists | local | `packages/mcp/src/node.ts:309,367`; `catalogue.ts:236-248`; `service.ts:53,102-104` |
| Resources, `ui://` views, MCP Apps metadata | missing | local | the only capability is tools (`wire.ts:215`); MCP Apps "owed, later" (`plans/031-2026-10-12-generic-mcp-service.md:71`) |
| A view-sized tool list | partial | local | `--tools` filters by definition only (`docs/mcp.md:83`) |
| Requests that carry an `Origin` header | refused | local | 403 (`http.ts:177`; `node.ts:389`); matters only for the tunnel over HTTP (S0) |
| Install a definition into an existing room | exists | data | `docs/run-your-app.md:103-147`; `directory.ts:126-145` |
| Package: manifest, pack, install by URI | missing | local (pack); host (install) | M1 (`self-contained-applications.md:328-336`) |
| A question and a block on it | exists | data | `issue.ts:90-113,634-731` |
| A question to named people, versioned text, approvals that count only from them, bound to the exact text | missing | data | `ask` has one addressee and fixed text (`issue.ts:90-101`); the pattern exists in the change lane (below) |
| Requested reviewers, verdict bound to the current version, one verdict per reviewer, replacement through `earlier` | exists in change | data | `change.ts:103-125,859-956` |
| Change lane counts only requested approvers | no | (not needed) | the merge counts any approval (`change.ts:1291-1299`); the MVP leaves the change lane unchanged |
| Comment threads | partial | data | issue `comment` has `replyTo` and `mentions` but no link to a question (`issue.ts:165-177,966-984`) |
| Adopt criteria, versioned | exists | data | `revise` (`issue.ts:239-253`) |
| Agents wait and resume | partial | local | `wait` up to 60 s (`service.ts:497`); release by hand (`issue.ts:710-731`); a hold ends after 3,600 s (`shared.ts:25-35`) |
| Needs you, per person | partial | local | attention is recorded (`packages/derive/src/effects.ts:514-521`); inbox delivery is not wired (`apps/room/docs/lanes.md:436`) and is host code |
| Changed since my last review | missing | local | no marker anywhere |
| Exact candidate, review bound to version | exists | data | `change.ts:59-115,927` |
| Diff through MCP | missing | local | deferred (`notes/2026-10-13-hosted-mcp-endpoint.md:33-36`); Git reads use the one-time credential that the `credential` tool returns (`docs/mcp.md:1010-1014`) |
| Checks on the exact tree | partial | local | the checker runner verifies commit, tree and parent (`packages/checkers/src/runner.ts:1-30`); `request-check` starts no runner |
| Old card cannot approve a newer version | exists, with a client caveat | local | `newer-version` (`change.ts:1287`); `revision-moved` (`packages/derive/src/judge.ts:302`); but MCP signs current revisions (`service.ts:411`) |
| No repeat of an unresolved operation | exists | data | `merge-in-progress` (`change.ts:1289`); custody (`packages/mcp/src/custody.ts:1-30`) |
| OAuth for remote hosts | missing | host | `notes/2026-10-01-mcp-plan.md:423`; not needed locally |

## 3. Slices

Each slice names its kind, scope, files and the witnesses that tell it
from a plausible wrong implementation. Test placement follows
`docs/testing.md:39-56`. **No slice needs host code.** The two host
pieces that would help are M1's install half and inbox delivery. The MVP
works without either.

### S0. Host and service probe (small; can use idle capacity now)

- **Kind:** no repository code.
- **Scope.** Run a throwaway MCP Apps server, with one view and one write
  tool, from a scratch directory. Try it in Claude Desktop over stdio,
  and in ChatGPT desktop through the Secure MCP Tunnel over stdio and
  loopback HTTP. Then point the current `dap mcp` at the hosted service
  and check that every read and act route it uses is answered. Validate
  a draft S3 definition with the deployed service's rules, by activating
  it in a scratch room under the existing register, which writes only
  data.
- **Record:** which ChatGPT plan was used, whether the tunnel sends an
  `Origin` header, whether two processes can share one `DAP_HOME`, and
  any route the deployed service lacks.
- **Witnesses:** the view rendered in each host (screenshot and version);
  every `dap mcp` tool used in 1.4 answering against the hosted service;
  the draft definition accepted or refused, with the stated reason.

### S1. Room setup (small)

- **Kind:** data.
- **Scope.** Identify the artroom room and confirm its rules: one
  approval and one check named `task-list-tests`. Create two agent keys
  and a checker key through agent-key invitations. Give the roles their
  actions with `set-actions`. Record all of this as a runbook.
- **Files:** `examples/repo-in-ai/runbook.md`.
- **Witnesses:**
  - each agent key acts as itself, and its `room` tool shows its role;
  - an agent key holds no approval grant (S3) and is refused one.

### S2. MCP Apps plumbing and the view kit (medium; after S0)

- **Kind:** local.
- **Scope.** Declare `resources` and answer `resources/list` and
  `resources/read` on both wire revisions. Serve `ui://dap/needs-you`,
  `ui://dap/work`, `ui://dap/decision` and `ui://dap/change` as
  `text/html;profile=mcp-app`, read from the installed package and
  checked against its digest. Each view is one file with inline script
  and an empty CSP. Give view tools `_meta.ui.resourceUri`, and give
  app-only actions `_meta.ui.visibility: ["app"]`, so the model sees a
  short list. Write a small view kit: bridge, item card, action buttons,
  and the absent, stale and unavailable states of forge contract 4.4.
  Each view action calls an act tool through the host bridge, so the view
  never holds a key (forge contract 4.7). The open
  `@modelcontextprotocol/ext-apps` SDK may serve the view side, pinned
  in a reviewed commit and inlined.
- **Host-specific code** lives in one module, `views/hosts.ts`, and holds
  only `_meta.ui.domain` (ChatGPT requires it for plugins with UI; a
  stdio server in Claude may not set it) and the optional `openai/*`
  aliases.
- **Files:** `packages/mcp/src/wire.ts`, `service.ts`, a new
  `packages/mcp/src/views/`, and the view sources in
  `examples/repo-in-ai/views/`.
- **Witnesses:**
  - `resources/read` returns each view's exact bytes; a view whose bytes
    differ from the package digest is refused;
  - an app-only tool is absent from the model's list but callable from
    the view;
  - a view in basic-host shows the stale state when its head is older
    than the current one;
  - without `views/hosts.ts`, all four views still work in basic-host.

### S3. Questions with requested approvers (medium; in parallel with S2)

- **Kind:** data. A new revision of the issue definition, activated in
  the room. It uses only guard forms that the change lane already uses.
- **What already exists.**
  - The issue lane has the question, the block on it, release by the
    answer, comments with replies and mentions, and versioned conditions.
  - The change lane has the approval model to copy:
    - a request names one person (`review-request`, `change.ts:116-125`);
    - a verdict counts only for the current version (`:927`);
    - the requested signer is checked (`signer: ["requested"]`, `:933`);
    - one verdict per reviewer per version (`verdict-exists`, `:935-943`);
    - a replacement goes through `earlier` (`:951`);
    - the request is marked `met` (`:952`).
- **The smallest revision.**
  - `ask` loses its single `addressee` and gains a `body` (detached text,
    64 KiB) and `bodyAt`, a ref to the entry that set the current text,
    as `conditionsAt` does for conditions. Goal, alternatives,
    consequences, recommendation and the brief digest are optional
    content of the body; no field enforces them.
  - New acts:
    - `revise-ask`, by the asker, while no decision exists;
    - `request-approval` and `withdraw-approval-request`, by the asker,
      which open an `approval-request` item naming one person and bound
      to the current `bodyAt`;
    - `approve`, which opens an `approval` with a verdict (approve or
      request changes), a comment, and an optional `criteriaAt`;
    - `decide`.
  - Guards on `approve`:
    - the signer is the requested person of an open request for this
      question;
    - the request's `bodyAt` and the approval's `at` both equal the
      question's current `bodyAt`;
    - the asker is not the approver;
    - the grant is `issue.approve`, given only to roles that people
      hold. S1 confirms that the agent keys hold a role without it. If
      the room's roles cannot separate people from agents, only admins
      approve in the MVP.
  - Guards on `decide`: no open request on the current text, no
    request-changes verdict on it, and at least one approval of it.
  - `comment` gains an optional `about` ref to an ask.
  - `release-block` also accepts a `decide` entry.
  - Size: issue then has 14 item types and about 56 acts, within the
    bounds of 16 and 64 (`packages/contract/src/bounds.ts:74-75`).
- **Files:** `apps/room/lanes/src/issue-questions.ts`, its pinned bytes
  in `examples/repo-in-ai/definitions/`, one scenario in
  `apps/room/lanes/test/*.scope.test.ts`, and `docs/lanes-reference.md`.
- **Witnesses:**
  - an approval from a member who was not requested is refused;
  - an approval from an agent key is refused, even if it was requested;
  - after `revise-ask`, an approval naming the earlier text is refused,
    and `decide` needs a new request and approval;
  - `decide` with one request still open is refused;
  - `release-block` naming another question's decision is refused
    `not-this-ask`.

### S4. Needs you, Work, and changes since review (medium; after S2 and S3)

- **Kind:** local.
- **Scope.**
  - `needs_you`, a read tool computed from current state across the
    room's issue and change scopes, never from a second store (forge
    section 7.2). It lists open approval requests addressed to me,
    reports waiting for my acceptance, current manifests waiting for my
    review or merge, and merges whose outcome is unknown. Each entry
    names the rule that put it there and its head. A fixed bound applies
    (50 entries, 8 scopes), and the result says what the bound left out.
  - `work`, a read tool: each agent's commitment, hold, block, latest
    report and state.
  - `since`: an explicit "mark reviewed" stores the current heads in a
    local file in `DAP_HOME`, and `since` lists the entries after them.
- **Files:** `packages/mcp/src/service.ts`, a new `projections.ts`,
  `docs/mcp.md`.
- **Witnesses:**
  - a request to someone else never appears in my `needs_you`;
  - a met request leaves `needs_you` at the next read with no other act;
  - with 9 scopes, the result says one scope was not read;
  - `since` is empty after "mark reviewed", and one new entry makes it
    one.

### S5. Agent wait and resume protocol (small; after S3)

- **Kind:** local, plus a guide.
- **Scope.** A `work-on` prompt (named in
  `plans/031-2026-10-12-generic-mcp-service.md:70`) and an agent guide
  give the loop: claim, ask, request approval, block, then `wait` (60 s
  at most, repeated) until the question is decided. Then read it,
  release the block, take the hold again (a hold lasts 3,600 s), and
  continue. The agents hold separate commitments, so one block never
  stops the other. A replacement agent finds the decision through its
  commitment's block.
- **Files:** the prompt in `packages/mcp/src/`, and
  `examples/repo-in-ai/agents.md`.
- **Witnesses:**
  - with two commitments and one blocked, the other's report is accepted
    while the block is open;
  - after a handover, the successor releases the block with the original
    decide entry;
  - a `wait` that times out returns the same state and writes nothing.

### S6. Change view and authorized merge (large; after S2)

- **Kind:** local.
- **Scope.**
  - A `diff` read tool between exact endpoints (`base` and
    `integration`). It fetches with the one-time read credential into a
    local cache and reads under a byte bound. Over the bound it says
    "truncated"; it never presents part of a file as whole (forge
    contract 4.5).
  - The Change view shows the manifest's base, integration and tree, the
    checks and reviews of that manifest only, and the conditions and
    decided questions that the issue links.
  - Every card action carries the item revisions that the card
    displayed. The act tool gains an optional `at` that replaces
    `expectedOf` (`service.ts:411`), so an old card is refused
    `revision-moved` instead of being signed against current state. The
    Decision view uses the same mechanism for approvals.
  - A merge with an unknown outcome shows "outcome unknown" and offers
    only `settle` (`service.ts:499`).
- **Files:** `packages/mcp/src/service.ts`, `shape.ts`, a new `diff.ts`,
  `docs/mcp.md`, and `examples/repo-in-ai/views/change.html`.
- **Witnesses:**
  - a card captured at version 1 that approves after version 2 exists is
    refused; the same approval from a fresh card is accepted;
  - while a merge is `unknown`, a merge from any card is refused
    `merge-in-progress`;
  - replaying a card's action under its idempotency key returns the kept
    outcome and sends nothing;
  - a diff over the bound says "truncated" and names the bound.

### S7. Local check runner (small)

- **Kind:** local.
- **Scope.** A script that takes `request-check` jobs and checks out the
  exact tree with `packages/checkers` (`runner.ts:1-30`). It runs
  `node --test task-list` and signs `check` or `check-error` with the
  checker key, labelled as member-run. The evidence rules design (branch
  `planner/evidence-rules-design-20261016`, not on main) can replace that
  label later; the MVP does not wait for it.
- **Files:** a local entry point in `packages/checkers/src/`.
- **Witnesses:** a job whose tree differs from its commit gives
  `tree-mismatch` and runs nothing; a failing test records a failed
  check, and `merge` is then refused.

### S8. Package and install (small to medium; after S2 to S7)

- **Kind:** local, or host if M1's install half is used.
- **Scope.** Assemble `examples/repo-in-ai/`: manifest, pinned
  definition, views, tool descriptions, `BRIEF.md` and `task-list/`.
  Use M1's `pack` and `dap check` if they have landed. Install by URI if
  M1's install half is deployed by then. Otherwise run the runbook in this
  order:
  1. `activate` the definition;
  2. `set-actions`;
  3. point `dap mcp` at the package directory;
  4. propose `task-list/` as the room's first change.
- **Witnesses:** a fresh scratch room on the same service reaches the
  state of 1.4 step 0 from the runbook alone; an altered view file is
  refused by its digest.

### S9. Rehearsal and the user test (medium; last)

- **Scope.** One scripted run of section 1.4 in a scratch room on the
  same service, with scripts as agents, through the MCP tools and
  basic-host. Then the human test of 1.5 in the artroom room, in Claude
  Desktop and ChatGPT desktop, with two real agent sessions. A run note
  labels each measurement by how it was taken.
- **Witnesses:** the six pass items of 1.5, each with its observation.

## 4. Decisions still open, with recommendations

1. **How an approval binds to the question's text.** **Recommend an entry
   ref (`bodyAt`)**, as for conditions, over a separate version item. It
   adds one ref instead of an item type, and the guard is the same
   equality.
2. **When a question counts as decided.** **Recommend every request on
   the current text met, at least one approval, and no request for
   changes.** A count such as "two of three" can follow as a field of
   the question.
3. **Where "changed since review" is kept.** **Recommend a local file in
   `DAP_HOME`** for the MVP. It is per device. A recorded marker in
   `platform:inbox` can follow when inbox delivery is deployed.
4. **ChatGPT if the tunnel is closed to the test account.** **Recommend
   the test in Claude Desktop alone,** with ChatGPT following through H1
   after the freeze, rather than a public endpoint for a local process.
5. **If the current `dap mcp` needs a route the deployed service lacks**
   (S0). **Recommend keeping the MVP's client changes to routes that the
   deployed service answers,** and naming any gap as waiting for the
   freeze, rather than running an older client.

## 5. Out of scope for the MVP

- Any plan, price, free allowance or paid continuation.
- **Local rooms:** `dap dev`, local storage and a local Git destination.
  These are developer features for third parties.
- **M1's install half, if it is not deployed in time.** It is host code.
  S8 installs by hand instead.
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
  audience-bound token. A consent page on the room's origin maps the
  person to their membership without exporting their key. Both hosts
  require this for remote servers
  (https://developers.openai.com/plugins/build/auth.md;
  https://claude.com/docs/connectors/building/authentication.md). It is
  host code and waits for the freeze.
- **Slack.** Slackbot renders MCP Apps views
  (https://docs.slack.dev/ai/slackbot-mcp-client/returning-rich-responses/),
  so S2's views should carry over later.
- Requested-approver counting in the change lane; changes to platform
  definitions; inbox delivery.
- Two-way GitHub synchronization, GitHub import
  (`notes/2026-10-15-github-repository-import.md:323-336`), more than one
  destination, and publication to GitHub.
- Read limits within a room; members read the whole record (proposal
  line 88).

## 6. Order, size and how the MVP fits the existing sequence

The existing builder sequence stands as it is:

1. the NOW work: e029 bottlenecks and e871 durability, including the
   archive;
2. hosted Counter slices 1 to 4, in parallel with M1's developer half;
   observability and capacity run alongside;
3. M1's install half and the Counter page.

The MVP slices come after that sequence.

| Order | Slice | Size | Kind | Depends on | Parallel with |
|---|---|---|---|---|---|
| any time | S0 probe | small | none | nothing | anything |
| 1 | S1 room setup | small | data | S0 | S2, S3 |
| 1 | S2 MCP Apps plumbing and views | medium | local | S0 | S1, S3 |
| 1 | S3 questions with approvers | medium | data | S0 (forms check) | S1, S2 |
| 2 | S4 needs you, work, since | medium | local | S2, S3 | S5, S6, S7 |
| 2 | S5 wait and resume | small | local | S3 | S4, S6, S7 |
| 2 | S6 change view and merge | large | local | S2 | S4, S5, S7 |
| 2 | S7 check runner | small | local | S1 | S4, S5, S6 |
| 3 | S8 package and install | small to medium | local (host if M1 install) | S2 to S7; M1 developer half if landed | none |
| 4 | S9 rehearsal and test | medium | data | all | none |

How the existing items relate to the MVP:

- **No hard prerequisite** in the sequence. Draft 1's dependence on
  `dap dev` is removed.
- **Helps:**
  - M1's developer half (manifest, `pack`, `dap check`) turns S8 into
    packaging rather than a runbook.
  - MCP bounded query `8bc5a05a`
    (`notes/2026-10-15-public-item-query-integration.md:364`) gives S4 its
    paging and bounds; without it, S4 pages through `items` under its own
    bound.
  - Hosted Counter slices 1 to 4 bring enrollment on the invitation-key
    cohort, where an admin creates each agent member and invitation
    (`notes/2026-10-15-hosted-counter-contracts.md:23-26`), and a turn
    loop that hosted agents later follow. Neither is required: S1 uses
    agent-key invitations.
- **Helps if deployed in time:** M1's install half, which makes S8 one
  install act.
- **Helps later:** M2's declared projections and presentation boundary
  (`notes/2026-10-15-self-contained-applications.md:339-353`), the
  long-term home of `needs_you` and the views.
- **Can wait:** observability, capacity and CLI JSON, which are not on
  the MVP path; evidence rules, which can later replace S7's member-run
  label.
- **Idle capacity:** S0 needs no builder; a planner or checker session
  can run it. S1 is a runbook that an admin session can do.

The order numbers count from the end of the existing sequence. The
critical path is S0, S3, S4 or S6 (whichever is longer; S6 is the
larger), S8, S9. Nothing on it needs a deployment.
