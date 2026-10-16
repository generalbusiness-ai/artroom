# Repo in your AI app: MVP implementation plan

Status: planning note, draft 3, 16 October 2026. It commissions nothing.
It plans the first version of
[the design proposal](2026-10-16-repo-in-your-ai-app.md) ("the proposal")
so that the MCP Apps approach gets a real user test: one owner in their
desktop assistant, two coding agents, and the "Clear completed" scenario
from start to end.

Draft 3 makes four changes. It uses a new room on the existing
deployment. Only people approve and decide. Each agent traces to the
person who commissioned it. The MVP is an extension installed into that
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
3. **A new room on the existing deployment.** A signed `dap create`
   (the claim) makes it, on the scope Worker. Its destination is a fresh
   Artifacts repository in the `artroom-demo` namespace. A scratch room
   on the rehearsal deployment serves the rehearsal. Claims and acts are
   data, not deployment. No local room: `dap dev` is a developer feature
   for third parties.
4. **Repository content:** the task-list example from
   `examples/repo-in-ai/` in artroom seeds the new repository (S1). A room
   on the real artroom repository on GitHub comes later (section 5).
5. **People decide.** Only people approve, decide, review and merge. The
   record and the views show who is a person and who is an agent, and
   which person commissioned each agent (1.4).
6. **Decisions** are questions addressed to named people. Approvals count
   only from those people, bound to the exact text they approved (S3).
7. **Composition:** the MVP is an extension installed into the room. The
   product brief lives in the extension's package (1.3).
8. **Slack** is out. Views use only the open MCP Apps standard; anything
   one host needs in addition is isolated in one module (S2).
9. **Queue:** the MVP moves no sequenced work. Its slices follow that
   sequence and reuse what it delivers (section 6).

## 1. The user test

### 1.1 Who and where

| Role | Member kind and role | Connection |
|---|---|---|
| Owner | person, `admin`; the room's founder. Their key is in their `DAP_HOME`. | Claude Desktop starts `dap mcp` over stdio. ChatGPT desktop reaches a second `dap mcp` on the same `DAP_HOME` (1.2). |
| Interface agent | agent, role `agent`, controller the owner | A Claude Code session in its own worktree. `dap mcp` over stdio with its own agent key (`dap join <artroom-agent-key:…>`, `docs/cli.md:292`). |
| Storage agent | agent, role `agent`, controller the owner | A Codex session, arranged the same way |
| Check runner | checker, role `checker` | A local script with a checker key (S7) |

`dap mcp` runs on each desktop. It reads from the scope Worker and sends
acts to it, signed with the key in its configuration directory
(`packages/cli/src/mcp.ts:77-102`). No bearer or OAuth token stands in
for any member.

### 1.2 What each desktop host can do locally (external facts)

- **Claude Desktop, confirmed.** It starts local stdio servers from
  `claude_desktop_config.json` or a desktop extension (`.mcpb`), and
  renders their MCP Apps views. The official guide runs the ext-apps
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
  The documented local route is OpenAI's Secure MCP Tunnel. A local
  `tunnel-client` connects outward to a private server over stdio or
  HTTP, for testing
  (https://developers.openai.com/api/docs/guides/secure-mcp-tunnels.md).
  No public endpoint or Cloudflare deployment is involved, and "No
  authentication" is an allowed setting. ChatGPT renders the open
  standard: `text/html;profile=mcp-app`, `_meta.ui.resourceUri` and the
  `ui/*` bridge. `window.openai` is optional
  (https://developers.openai.com/plugins/build/chatgpt-ui.md).
- **Assumed for ChatGPT, settled by S0 on a real account:**
  - which plans may add a custom server (sources disagree: Business,
    Enterprise and Edu only, or also Plus and Pro);
  - that a server added on the web works in the desktop app;
  - that the tunnel admits only the owner's workspace;
  - whether "desktop only" stdio plugins
    (https://developers.openai.com/plugins/deploy/desktop-only.md) are
    open to private use.
- **No product needed, confirmed.** Two local MCP Apps hosts run the
  automated view witnesses:
  - the ext-apps reference host `examples/basic-host`
    (https://github.com/modelcontextprotocol/ext-apps);
  - MCP Inspector 2.11.0, a "spec-conformant Apps host"
    (https://github.com/modelcontextprotocol/inspector/blob/main/docs/mcp-app-review.md).
- **Standard, confirmed.** MCP Apps is stable at extension version
  `2026-01-26` (`io.modelcontextprotocol/ui`, file
  `specification/2026-01-26/apps.mdx` in the ext-apps repository), with a
  draft beside it. The open SDK is `@modelcontextprotocol/ext-apps` 2.0.3
  (npm, 25 September 2026).

If the tunnel is closed to the test account, the test runs in Claude
Desktop alone, and ChatGPT waits for H1 (section 5).

### 1.3 The room, its repository and the extension package

**The room.** The owner runs `dap create` against the scope Worker,
under a register already installed there for the Artifacts host and the
`artroom-demo` namespace. The command signs `found`, waits for the
directory, membership, rules scope and destination, then takes the
founder's seat as the first admin (`docs/cli.md:206-230`). This is data.
A new register would need a new Worker setting, which is a deployment
(`docs/hosts.md:27-30`). So S0 must find a register that is already
installed.

**The cohort is the register's.** The MVP needs:

- a membership version in the agent-key pin set (`@2`, `@4` or `@5`,
  `notes/2026-10-13-agent-key-cohorts.md:24-27`);
- a destination at version 3 or later, for `dap propose`
  (`docs/cli.md:472-484`).

The demo cohort meets both: directory@7, membership@2, rules@4 and
destination@3 (`packages/platform/src/directory.ts:87`;
`packages/platform/src/demo-register.ts:9-12`). Every membership version
records each member's kind and an agent's controller (1.4). **Assumed:**
the scope Worker has a demo-cohort register on Artifacts. If it has
none, any installed register whose cohort meets both needs will serve. If
none exists, the room waits for the freeze.

**Seeding the repository** uses current commands only:

1. The owner runs `dap clone` (`docs/cli.md:428-470`).
2. The owner copies `examples/repo-in-ai/task-list/` into the clone and
   commits it on a branch.
3. The owner runs `dap propose seed` and then `dap merge`.

The seed must fit the limits of `dap propose`: UTF-8 text, at most 64
paths, and at most 65,536 bytes per file (`docs/cli.md:506-509`). The
founding rules ask for no approval for the seed. The owner then
publishes the test's rules: one approval and one check named
`task-list-tests`.

**The extension package** has its source at `examples/repo-in-ai/` in
artroom. It holds:

- the issue revision (S3), as pinned bytes;
- `change3.json`, the manifest-list change definition that `dap propose`
  needs (`docs/cli.md:479-482`);
- the four views and the tool descriptions;
- the product brief, `BRIEF.md`;
- `task-list/`.

**What works by hand today:** definitions install into an existing room
through signed acts (`docs/run-your-app.md:103-147`):

- `activate` adds a definition to the rules scope;
- `set-actions` gives roles their actions;
- `open-issue` opens a lane under any activated digest
  (`packages/platform/src/directory.ts:126-145,727-746`).

Views and tool descriptions are read by the local `dap mcp` from the
package directory, and are pinned by digest.

**What M1 adds:** the manifest, `pack`, and install by URI in one act
(`notes/2026-10-15-self-contained-applications.md:328-336`). Its
developer half is local tooling, sequenced before the MVP. Its install
half is host code and waits for the freeze. **If the install half is
deployed in time, the MVP is the first real package. Otherwise S8
installs the same parts by hand, in the same order.**

**The brief** is in the package, and a question pins the digest of the
brief that it was written against. **Adopted criteria** are the issue's
`conditions`, revised by the requester; each version is an entry
(`apps/room/lanes/src/issue.ts:43,239-253`).

### 1.4 People and agents in the record

**Can a lane guard see the signer's kind and controller? No.**

- What a lane guard sees:
  - a guard reads the signer's member ID (`signer`, `notIn`) and the
    subjects' slots (`packages/derive/src/guards.ts:183-184`);
  - a written `rule` reads the act's kind, fields, signer, subjects and facts, and
    nothing of membership (`guards.ts:108-117`);
  - the grant check reads the role's action list (`grant.ts:306`). It
    also refuses an agent whose controller is not active
    (`packages/derive/src/grant.ts:309`).
- What the grant observation holds:
  - role, actions, `controller` and `controllerActive`, but **no member
    kind** (`packages/contract/src/observation.ts:17-32`);
  - membership builds it (`packages/platform/src/membership.ts:803-849`).

**But membership binds role to kind, and grants follow roles.**

- `invite-member` makes a person (`membership.ts:338-350`).
- `add-member` makes only agents and checkers:
  - it requires an agent's controller to be an active person;
  - it fixes the role to `agent` or `checker` (`membership.ts:415-447`).
- `set-role` acts only on persons, and sets only `admin`, `maintainer` or
  `member` (`membership.ts:452-458`).
- So the roles `admin`, `maintainer` and `member` are held only by
  people.
- The default table already gives `change.review` only to those roles,
  and `change.merge` only to `admin` and `maintainer`
  (`membership.ts:105-106`). Agents cannot review or merge today.
- **For the MVP:** the new actions `issue.approve` and `issue.decide` go
  to the person roles only, by `set-actions`. The witnesses of S3 then
  hold with no host code. This does not limit approval to admins: any
  person role may approve.

**The remaining gap.**

- `set-actions` has no guard (`membership.ts:472-477`). An admin could
  add an approval action to `agentActions`.
- That act is recorded in the membership journal. The MVP shows it
  instead of preventing it:
  - `dap mcp` reads the role table at each view;
  - the Decision and Change views warn when an agent or checker role
    holds `issue.approve`, `issue.decide`, `change.review` or
    `change.merge`;
  - S1 checks the table.
- **The later hardening (H2) is host code:** a lane guard form that
  reads the signer's retained grant observation, requiring no controller
  and a person role. Role and controller are already in that
  observation, so the membership definition and cohort do not change.
  Only derive changes; after a deployment, a further issue revision
  activated in the same room uses the form. A guard on `set-actions`
  itself would be a new membership version. An existing room keeps its
  cohort pins, so that would need a new room. H2 avoids it.

**Tracing an agent to its person.**

- Every act entry retains the grant that was judged
  (`packages/contract/src/entry.ts:56`). The grant retains its
  observation (`grant.ts:139-142`), which names the agent's
  `controller` at signing time.
- The membership journal records who added the agent (the `add-member`
  signer) and its kind.
- Views label every actor as person, agent (with its controller's handle)
  or checker. They read this from membership and from each entry's
  retained observation (S2, S4, S6).

**What dap-spike did** (`~/play/dap-spike/notes/2026-09-14-evolving-spaces-design.md`):

- Section 8 defines a principal as "the identity that signs events".
- Capabilities are predicates over the actor and state, for example
  `offer.author == actor`. Grants and revocations are visible events, so
  "was Bob authorized to make event #42" is determinate.
- Assistants are "ordinary principals" (line 186), and there is no
  person or agent kind and no controller.

What to borrow:

- the determinacy, which dap already has through retained observations;
- the capability-as-predicate shape, which is what H2 adds;
- from its obligations report, a negative control signed by the wrong
  principal (`~/play/dap-spike/spike/T3-OBLIGATIONS-REPORT.md:25`).
  S3's witnesses pair each refusal with the accepted person case.

### 1.5 The scenario, step by step

| Step | Actor | Acts and tools | View | Record |
|---|---|---|---|---|
| 0 | Owner | `open-issue` under the S3 digest: "Clear completed", with conditions. `offer` two commitments. | Work | intent, commitments (`issue.ts:26-67`) |
| 1 | Agents | `accept` (`issue.ts:382-410`) | Work | commitments, each performer with its controller |
| 1 | Storage agent | `ask` a question; its body gives the goal and alternatives, and may recommend one. `request-approval` from the owner. `block` its commitment on the question. | Decision | question, request, block |
| 1 | Interface agent | Keeps working. `dap propose` from its branch, linked to the issue (`docs/cli.md:472`). | Change | change, version 1 |
| 2 | Owner, new conversation | "What needs my judgment?" calls `needs_you` (S4) | Needs you, then Decision | none (read only) |
| 3 | Owner | Asks follow-up questions and comments. The agent revises the question. The owner `revise`s the conditions with the proposed criteria. | Decision | comments, text version 2, new `conditionsAt` |
| 3 | Owner | `approve` text version 2 ("keep in history"), naming the conditions. Then `decide`. | Decision | approval, decided question |
| 4 | Storage agent | `wait` until decided (`packages/mcp/src/service.ts:497`), read it, `release-block` naming the decide entry, then propose its change | Work, Change | block released, change |
| 5 | Check runner and agents | `request-check`; the runner signs `check`. Agents comment; they cannot review. | Change | job, result, comments |
| 5 | Owner | Reads the exact diff, checks and the effect on the conditions. Approves (`review-verdict`) and `merge`s (`apps/room/lanes/src/change.ts:907-956,1271-1391`). | Change | review, merge |
| 5 | Destination | Publishes to the Artifacts repository and closes the issue (`change.ts:1613-1676`) | Change | publication, issue closed |

Then the owner opens Claude Desktop, while the earlier steps ran in
ChatGPT, or the other way round. The same records and views appear.

### 1.6 What counts as a pass

These are the proposal's proof questions (proposal lines 81-84), each with
something an observer can record:

1. **Explain the trade-off.** In a new conversation, the owner states the
   choices and their consequences, without another window or pasted
   context.
2. **Spot a conflict when checks pass.** In a scripted second round, an
   agent proposes deleting cleared tasks, and its checks pass. The Change
   view shows the conflict with the approved question and the conditions.
   The owner requests changes.
3. **Resume without copying context.** Each agent resumes in a fresh
   session. The owner sends no message to either agent.
4. **Interruption recovery.** An agent session is killed while blocked. A
   replacement, under a handover (`issue.ts:447-490`), finds the decision
   and finishes the work.
5. **People decide.** Each of these is refused, and each is paired with
   an accepted person case:
   - an approval or decision signed by an agent key, even one named in a
     request;
   - an approval from a person who was not requested;
   - an approval of an earlier text;
   - an approval from an old Change card;
   - a repeat of a merge whose outcome is unknown.
6. **Traceable agents.** Every agent act in the views names the agent's
   controller. The same controller is in that entry's retained grant
   observation.
7. **Two hosts, one record.** Claude Desktop shows exactly what ChatGPT
   showed, at the same heads.

The run note records timings, the number of owner actions, every refusal,
and each point where the owner had to copy context.

## 2. Gap table

"Kind" says where a missing piece goes:

- **data:** a definition or signed act in the room, with no deployment;
- **local:** code in `dap mcp`, the views or a local script;
- **host:** needs a deployment, and waits for the freeze.

| Capability | State | Kind | Evidence |
|---|---|---|---|
| MCP server over stdio and loopback HTTP; one tool per act; `structuredContent` | exists | local | `packages/mcp/src/node.ts:309,367`; `catalogue.ts:236-248`; `service.ts:53,102-104` |
| Resources, `ui://` views, MCP Apps metadata | missing | local | the only capability is tools (`wire.ts:215`); MCP Apps "owed, later" (`plans/031-2026-10-12-generic-mcp-service.md:71`) |
| `Origin` header | refused | local | 403 (`http.ts:177`; `node.ts:389`); matters only for the tunnel over HTTP (S0) |
| New room and repository on the existing deployment | exists | data | `docs/cli.md:206-230`; one claim makes one Artifacts repository (`docs/hosts.md:60-71`) |
| Seed by propose and merge | exists | data | `docs/cli.md:472-509` (text only, 64 paths, 64 KiB per file) |
| Install a definition into a room | exists | data | `docs/run-your-app.md:103-147`; `directory.ts:126-145` |
| Package: manifest, pack, install by URI | missing | local (pack); host (install) | M1 (`self-contained-applications.md:328-336`) |
| Person/agent kind and agent controller recorded | exists | data | `membership.ts:245-256,415-447` |
| Only people review or merge | exists | data | role-kind binding and the default table (`membership.ts:105-106,452-458`) |
| Only people approve or decide questions | missing | data | new actions in person roles only (S3); hardening H2 is host |
| A lane guard on member kind | missing | host | no guard form reads it (`guards.ts:108-184`); H2 |
| Agent traced to its controller in each entry | exists | data | `entry.ts:56`; `grant.ts:139-142`; `observation.ts:27-28` |
| Actors shown as person or agent with controller | missing | local | views (S2, S4, S6) |
| A question and a block on it | exists | data | `issue.ts:90-113,634-731` |
| A question to named people, versioned text, approvals bound to it | missing | data | `ask` has one addressee and fixed text (`issue.ts:90-101`); the pattern is in the change lane (`change.ts:103-125,859-956`) |
| Comment threads on a question | partial | data | issue `comment` has `replyTo` and `mentions` (`issue.ts:165-177,966-984`) |
| Adopt criteria, versioned | exists | data | `revise` (`issue.ts:239-253`) |
| Agents wait and resume | partial | local | `wait` up to 60 s (`service.ts:497`); release by hand (`issue.ts:710-731`) |
| Needs you; changed since my last review | missing | local | attention is recorded (`packages/derive/src/effects.ts:514-521`); inbox delivery is not wired (`apps/room/docs/lanes.md:436`) and would be host |
| Diff through MCP | missing | local | deferred (`notes/2026-10-13-hosted-mcp-endpoint.md:33-36`); reads use the one-time credential (`docs/mcp.md:1010-1014`) |
| Checks on the exact reserved tree | partial | local | the runner checks the staged reservation ref (`docs/cli.md:488-496`; `packages/checkers/src/runner.ts:1-30`) |
| Old card cannot approve a newer version | exists, with a client caveat | local | `newer-version` (`change.ts:1287`); `revision-moved` (`judge.ts:302`); MCP signs current revisions (`service.ts:411`) |
| No repeat of an unresolved operation | exists | data | `merge-in-progress` (`change.ts:1289`); custody (`packages/mcp/src/custody.ts:1-30`) |
| OAuth for remote hosts | missing | host | `notes/2026-10-01-mcp-plan.md:423`; not needed locally |

## 3. Slices

Each slice names its kind, scope, files and witnesses. Test placement
follows `docs/testing.md:39-56`.

- **No MVP slice needs host code.**
- Three host pieces would help, and each has a data or local substitute:
  - M1's install half (S8 installs by hand);
  - inbox delivery (S4 computes from state);
  - the H2 guard (role binding and warnings, 1.4).

### S0. Host and service probe (small; can use idle capacity now)

- **Kind:** no repository code.
- **Scope:**
  - Run a throwaway MCP Apps server, with one view and one write tool,
    from a scratch directory. Try it in Claude Desktop over stdio, and in
    ChatGPT desktop through the Secure MCP Tunnel.
  - On the scope Worker and on rehearsal, find an installed register:
    its host, namespace and cohort. Rehearsal used `github.com` for the
    contest demo (`docs/demo.md:63`), so a claim there may create a
    GitHub repository. Record which.
  - Check that every `dap mcp` tool used in 1.5 is answered by the
    deployed service.
  - Activate a draft S3 definition in the scratch room.
- **Witnesses:**
  - the view rendered in each host (screenshot and version);
  - the register and cohort found on each deployment;
  - the draft definition accepted, or refused with its reason.

### S1. Create and seed the room (small)

- **Kind:** data.
- **Scope:**
  - `dap create` under the register that S0 found.
  - Two agent members with the owner as controller, and a checker, each
    joined by an agent-key link.
  - Activate `change3.json`.
  - Seed by propose and merge (1.3).
  - Publish the test's rules.
  - Check that `agentActions` and `checkerActions` hold no review,
    merge, approve or decide action.
  - Record all of this in `examples/repo-in-ai/runbook.md`.
- **Witnesses:**
  - the room's `remote` names the `artroom-demo` namespace;
  - after `git pull`, the seed's files match the package's `task-list/`
    byte for byte;
  - each agent's member item shows kind `agent`, role `agent` and the
    owner as controller;
  - an agent's `review-verdict` is refused for want of `change.review`,
    while the owner's is accepted.

### S2. MCP Apps plumbing and the view kit (medium; after S0)

- **Kind:** local.
- **Scope:**
  - Declare `resources`, and answer `resources/list` and
    `resources/read` on both wire revisions.
  - Serve `ui://dap/needs-you`, `ui://dap/work`, `ui://dap/decision` and
    `ui://dap/change` as `text/html;profile=mcp-app`, from the package
    and checked against its digest. Each view is one file with inline
    script and an empty CSP.
  - Give view tools `_meta.ui.resourceUri`. Give app-only actions
    `_meta.ui.visibility: ["app"]`, so the model sees a short list.
  - Build a view kit:
    - a bridge, an item card and action buttons;
    - the absent, stale and unavailable states of forge contract 4.4;
    - an **actor chip** that shows person, agent with its controller's
      handle, or checker, read from membership and checked against the
      entry's retained observation.
  - View actions call act tools through the host bridge, so a view never
    holds a key (forge contract 4.7).
- **Host-specific code** lives in one module, `views/hosts.ts`. It holds
  only `_meta.ui.domain` (ChatGPT requires it for plugins with UI; a
  stdio server in Claude may not set it) and the optional `openai/*`
  aliases.
- **Files:**
  - `packages/mcp/src/wire.ts` and `service.ts`;
  - a new `packages/mcp/src/views/`;
  - `examples/repo-in-ai/views/`.
- **Witnesses:**
  - a view whose bytes differ from the package digest is refused;
  - an app-only tool is absent from the model's list but callable from
    the view;
  - the stale state shows when a view's head is older than the current
    one;
  - an agent's entry shows its controller's handle, and a person's shows
    none;
  - without `views/hosts.ts`, all four views work in basic-host.

### S3. Questions with requested approvers, people only (medium; with S2)

- **Kind:** data. A new issue revision, activated in the room, that uses
  only guard forms the change lane already uses.
- **What exists:**
  - The issue lane has the question, the block, release by the answer,
    comments with replies and mentions, and versioned conditions.
  - The change lane has the approval model:
    - a request names one person (`change.ts:116-125`);
    - a verdict counts only for the current version (`:927`);
    - the requested signer is checked (`:933`);
    - there is one verdict per reviewer per version (`:935-943`);
    - a verdict replaces an earlier one through `earlier` (`:951`);
    - the request is marked `met` (`:952`).
- **The smallest revision:**
  - `ask` loses its single `addressee` and gains a `body` (detached text,
    64 KiB) and `bodyAt`, a ref to the entry that set the current text,
    as `conditionsAt` does for conditions. The goal, alternatives,
    consequences, recommendation and brief digest are optional content of
    the body.
  - New acts:
    - `revise-ask`;
    - `request-approval` and `withdraw-approval-request`, which open or
      close an `approval-request` naming one member, bound to `bodyAt`;
    - `approve`, with a verdict, a comment and an optional `criteriaAt`;
    - `decide`.
  - `approve` needs grant `issue.approve`. Its guards:
    - the signer is the requested member of an open request on this
      question;
    - the approval and the request both name the current `bodyAt`;
    - the asker is not the approver.
  - `decide` needs grant `issue.decide`. Its guards: no open request on
    the current text, no request-changes verdict on it, and at least one
    approval of it.
  - Both grants are given only to person roles (1.4). A request may name
    an agent, but that agent's `approve` fails its grant.
  - `comment` gains an optional `about` ref to a question;
    `release-block` also accepts a `decide` entry.
  - Issue then has 14 item types and about 56 acts, within the bounds of
    16 and 64 (`packages/contract/src/bounds.ts:74-75`).
- **Files:**
  - `apps/room/lanes/src/issue-questions.ts`;
  - the pinned bytes in `examples/repo-in-ai/definitions/`;
  - one scenario in `apps/room/lanes/test/*.scope.test.ts`;
  - `docs/lanes-reference.md`.
- **Witnesses**, each with its paired accepted case:
  - an agent key named in a request is refused `approve` (grant), and
    the requested person is accepted;
  - an agent key is refused `decide`, and the owner is accepted;
  - an approval from a person who was not requested is refused;
  - after `revise-ask`, an approval naming the earlier text is refused,
    and the new text's approval is accepted;
  - `decide` with one request still open is refused;
  - `release-block` naming another question's decision is refused
    `not-this-ask`.

### S4. Needs you, Work, and changes since review (medium; after S2 and S3)

- **Kind:** local.
- **Scope:**
  - `needs_you` lists open approval requests to me, current manifests
    waiting for my review or merge, and merges whose outcome is unknown.
    - It is computed from current state, never from a second store
      (forge section 7.2).
    - Each entry names its rule and head.
    - It has a fixed bound of 50 entries and 8 scopes, and says what the
      bound left out.
  - `work` shows each agent's commitment, block, changes and state, with
    its controller.
  - `since`: an explicit "mark reviewed" stores the current heads in a
    local file in `DAP_HOME`, and `since` lists the entries after them.
- **Files:** `packages/mcp/src/service.ts`, a new `projections.ts`,
  `docs/mcp.md`.
- **Witnesses:**
  - a request to someone else never appears in my `needs_you`;
  - a met request leaves `needs_you` at the next read;
  - with 9 scopes, the result says one scope was not read;
  - `since` is empty after "mark reviewed", and one new entry makes it
    one;
  - every `work` row for an agent names its controller.

### S5. Agent wait and resume protocol (small; after S3)

- **Kind:** local, plus a guide.
- **Scope:**
  - A `work-on` prompt (named in
    `plans/031-2026-10-12-generic-mcp-service.md:70`) and an agent guide
    give the loop: accept, ask, request approval, block, then `wait`
    (60 s at most, repeated) until the question is decided. Then read the
    decision, release the block, and propose the change.
  - One block never stops the other agent's commitment.
  - A replacement agent finds the decision through its commitment's
    block.
- **Files:** the prompt in `packages/mcp/src/`, and
  `examples/repo-in-ai/agents.md`.
- **Witnesses:**
  - with one of two commitments blocked, the other agent's change is
    proposed and reviewed;
  - after a handover, the successor releases the block with the
    original decide entry;
  - a `wait` that times out writes nothing.

### S6. Change view and authorized merge (large; after S2)

- **Kind:** local.
- **Scope:**
  - A `diff` read tool between exact endpoints. It fetches with the
    one-time read credential and reads under a byte bound. Over the
    bound it says "truncated" (forge contract 4.5).
  - The Change view shows:
    - the version's base and integration;
    - checks and reviews of that version only, each reviewer as a
      person;
    - the conditions and decided questions linked to the issue;
    - the warning of 1.4 if an agent role holds review or merge.
  - Every card action carries the item revisions that the card
    displayed. An optional `at` replaces `expectedOf`
    (`service.ts:411`), so an old card is refused `revision-moved`. The
    Decision view uses the same mechanism.
  - A merge with an unknown outcome offers only `settle`
    (`service.ts:499`).
- **Files:**
  - `packages/mcp/src/service.ts`, `shape.ts` and a new `diff.ts`;
  - `docs/mcp.md`;
  - `examples/repo-in-ai/views/change.html`.
- **Witnesses:**
  - a card captured at version 1 that approves after version 2 exists
    is refused, and a fresh card's approval is accepted;
  - while a merge is `unknown`, a merge from any card is refused
    `merge-in-progress`;
  - replaying a card's action under its idempotency key sends nothing;
  - a diff over the bound says "truncated" and names the bound.

### S7. Local check runner (small)

- **Kind:** local.
- **Scope:** a script that takes check requests, fetches the staged
  reservation ref, and checks the integration ID, tree and first parent
  with `packages/checkers` (`docs/cli.md:488-496`). It runs the
  task-list tests and signs `check` or `check-error` with the checker
  key. The evidence rules design (branch
  `planner/evidence-rules-design-20261016`) can later add source and
  audit fields.
- **Witnesses:**
  - a mismatched stage gives `reservation-stage-mismatch` and runs
    nothing;
  - a failing test records a failed check, and `merge` is then refused.

### S8. Package and install (small to medium; after S2 to S7)

- **Kind:** local, or host if M1's install half is used.
- **Scope:** assemble `examples/repo-in-ai/`. Use M1's `pack` and
  `dap check` if they have landed. Install by URI if M1's install half is
  deployed. Otherwise follow the runbook in this order:
  1. `activate` the definitions;
  2. `set-actions`, person roles only for approve and decide;
  3. point `dap mcp` at the package;
  4. seed the repository.
- **Witnesses:**
  - a fresh scratch room reaches the state of 1.5 step 0 from the
    runbook alone;
  - an altered view file is refused by its digest.

### S9. Rehearsal and the user test (medium; last)

- **Scope:**
  - Run 1.5 once in the scratch room, with scripts as agents.
  - Then run the human test of 1.6 in the new room, in Claude Desktop
    and ChatGPT desktop, with two real agent sessions.
  - Write a run note that labels each measurement by how it was taken.
- **Witnesses:** the seven pass items of 1.6.

## 4. Decisions still open, with recommendations

1. **People-only enforcement for the MVP.** **Recommend the role binding
   of 1.4,** with the warnings and the S1 check. Commission H2 after the
   freeze.
2. **Binding an approval to the text.** **Recommend an entry ref
   (`bodyAt`)** over a separate version item. It is one ref instead of an
   item type, with the same equality guard.
3. **When a question is decided.** **Recommend every request on the
   current text met, at least one approval, and no request for changes.**
4. **The "changed since review" marker.** **Recommend a local file in
   `DAP_HOME`** for the MVP. It is per device.
5. **ChatGPT if the tunnel is closed to the test account.** **Recommend
   the test in Claude Desktop alone,** with ChatGPT through H1 later.
6. **If no suitable register is installed** (S0). **Recommend waiting for
   the freeze** rather than changing a Worker setting. Install a
   demo-cohort register on Artifacts in the first deployment window.

## 5. Out of scope for the MVP

- Any plan, price, free allowance or paid continuation.
- **Local rooms:** `dap dev`, local storage and a local Git destination.
- **A room on the real artroom repository** on GitHub
  (`generalbusiness-ai/dap`). This comes after the freeze and after
  GitHub repository import
  (`notes/2026-10-15-github-repository-import.md:323-336`).
- **M1's install half, if it is not deployed in time.** S8 installs by
  hand.
- **H2, the lane guard on the signer's standing.** Host code, after the
  freeze (1.4).
- **Hosted agents** (the Room step of
  `notes/2026-10-15-hosted-agent-teams-design.md`). They later add:
  - a saved workspace as an Artifacts fork for each hold (`:353-399`);
  - a shared spending limit reserved before each model call
    (`:302-336`);
  - a supervised turn loop;
  - replacement run by the room, not a person.

  External agents bring their own workspaces and spending.
- **H1, the remote host connection.** An OAuth 2.1 authorization server
  in front of the hosted endpoint. This is host code, after the freeze.
  - It would use `@cloudflare/workers-oauth-provider` 1.2.3 (published
    7 October 2026, https://github.com/cloudflare/workers-oauth-provider).
  - It would offer client ID metadata documents first, PKCE S256,
    protected resource metadata and an audience-bound token.
  - A consent page on the room's origin would map the person to their
    membership without exporting their key.
  - Both hosts require this for remote servers
    (https://developers.openai.com/plugins/build/auth.md;
    https://claude.com/docs/connectors/building/authentication.md).
- **Slack.** Slackbot renders MCP Apps views
  (https://docs.slack.dev/ai/slackbot-mcp-client/returning-rich-responses/),
  so S2's views should carry over later.
- Inbox delivery, two-way GitHub synchronization, and more than one
  destination.
- Read limits within a room: members read the whole record (proposal
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
| 1 | S1 create and seed | small | data | S0 | S2, S3 |
| 1 | S2 MCP Apps and views | medium | local | S0 | S1, S3 |
| 1 | S3 questions, people only | medium | data | S0 (forms check) | S1, S2 |
| 2 | S4 needs you, work, since | medium | local | S2, S3 | S5, S6, S7 |
| 2 | S5 wait and resume | small | local | S3 | S4, S6, S7 |
| 2 | S6 change view and merge | large | local | S2 | S4, S5, S7 |
| 2 | S7 check runner | small | local | S1 | S4, S5, S6 |
| 3 | S8 package and install | small to medium | local (host if M1 install) | S2 to S7 | none |
| 4 | S9 rehearsal and test | medium | data | all | none |

How the existing items relate to the MVP:

- **No hard prerequisite** in the sequence.
- **Helps:**
  - M1's developer half (manifest, `pack`, `dap check`) turns S8 into
    packaging rather than a runbook.
  - MCP bounded query `8bc5a05a`
    (`notes/2026-10-15-public-item-query-integration.md:364`) gives S4 its
    paging. Without it, S4 pages through `items` under its own bound.
  - Hosted Counter slices 1 to 4 bring enrollment on the invitation-key
    cohort (`notes/2026-10-15-hosted-counter-contracts.md:23-26`) and the
    turn loop for later hosted agents. Neither is required: S1 uses
    agent-key links.
- **Helps if deployed in time:** M1's install half, which makes S8 one
  act.
- **Helps later:** M2's declared projections and presentation boundary
  (`notes/2026-10-15-self-contained-applications.md:339-353`), the
  long-term home of `needs_you` and the views.
- **Can wait:** observability, capacity, CLI JSON and evidence rules.
- **Idle capacity:** S0 needs no builder; a planner or checker session
  can run it. An admin session can run S1 from its runbook.

The order numbers count from the end of the existing sequence. The
critical path is S0, S3, S6 (the largest), S8, S9. Nothing on it needs a
deployment, unless S0 finds no suitable register.
