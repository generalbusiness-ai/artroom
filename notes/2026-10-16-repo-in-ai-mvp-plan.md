# Repo in your AI app: MVP implementation plan

Status: planning note, draft 4, 16 October 2026. It commissions nothing.
It plans the first version of
[the design proposal](2026-10-16-repo-in-your-ai-app.md) ("the proposal")
for a real user test: one owner in their desktop assistant, two coding
agents, and the "Clear completed" scenario from start to end. Section 7
answers the review of draft 2.

Repo facts cite `path:line` at main `54dcefbcb`. Source at that commit is
not proof of deployment: S0 establishes what the deployed service
supports before any real-run claim. External facts cite pages checked on
16 October 2026, marked **confirmed** or **assumed**.

## 0. Settled choices

1. **Agents:** Claude Code and Codex sessions with their own agent keys,
   through MCP. Hosted agents come later.
2. **No deployment while the Cloudflare freeze holds;** no Worker
   changes. The test runs in the ChatGPT and Claude desktop apps, through
   a local `dap mcp`.
3. **A new room on the existing deployment.** The room is made by a
   signed `dap create` on the scope Worker. Its destination is a fresh
   Artifacts repository in `artroom-demo`, seeded from
   `examples/repo-in-ai/task-list/`. A scratch room serves the rehearsal.
   No local room.
4. **People decide.** Only people approve, decide, review and merge. The
   record and views show each actor as a person, an agent with its
   controller, or a checker.
5. **Questions** are addressed to named people. Approvals count only from
   those people and bind to the exact question text.
6. **Composition:** an extension package installed into the room, by hand
   now, or by M1 install if that is deployed in time. The brief lives in
   the package.
7. **Views** use only the open MCP Apps standard. Slack is out.
8. **Queue:** MVP slices follow the existing builder sequence.

## 1. The user test

### 1.1 Who, where, and with which identities

| Actor | Membership | Connection |
|---|---|---|
| Owner | person, `admin`, founder of the test room. A **dedicated test `DAP_HOME`**, used only for this room. | Claude Desktop starts `dap mcp` over stdio. ChatGPT connects only under S0's access rule. |
| Interface agent | agent, role `agent`, controller the owner | Claude Code with its own key (`dap join <artroom-agent-key:…>`, `docs/cli.md:292`) |
| Storage agent | agent, role `agent`, controller the owner | Codex, arranged the same way |
| Check runner | checker, role `checker` | S7 |

`dap mcp` signs with the key in its configuration directory
(`packages/cli/src/mcp.ts:77-102`).

### 1.2 Desktop hosts (external facts)

| Host | Status | Source |
|---|---|---|
| Claude Desktop runs local stdio servers and renders their MCP Apps views; a URL connector needs a public endpoint; a stdio server cannot set `_meta.ui.domain`. Main host. | confirmed | https://claude.com/docs/connectors/building/mcp-apps/getting-started.md; https://claude.com/docs/connectors/building/testing.md; https://claude.com/docs/connectors/building/mcp-apps/troubleshooting.md |
| ChatGPT desktop reaches local servers through OpenAI's Secure MCP Tunnel (stdio or HTTP, for testing), allows no authentication, and renders the open standard (`window.openai` optional) | confirmed | https://developers.openai.com/api/docs/guides/secure-mcp-tunnels.md; https://developers.openai.com/api/docs/guides/custom-mcp-server.md; https://developers.openai.com/plugins/build/chatgpt-ui.md |
| ChatGPT plan eligibility, and who besides the owner can reach a tunnelled server | assumed; S0 | sources disagree |
| `basic-host` and MCP Inspector 2.11.0 render MCP Apps locally, for automated witnesses | confirmed | https://github.com/modelcontextprotocol/ext-apps; https://github.com/modelcontextprotocol/inspector/blob/main/docs/mcp-app-review.md |
| MCP Apps stable at `2026-01-26` (`io.modelcontextprotocol/ui`); SDK `@modelcontextprotocol/ext-apps` 2.0.3 | confirmed | same repository |

### 1.3 Room, repository and package

**Room.** The owner runs `dap create` on the scope Worker under a register
already installed for Artifacts and `artroom-demo` (`docs/cli.md:206-230`);
a new register would change a Worker setting (`docs/hosts.md:27-30`). The
cohort needs membership `@2`, `@4` or `@5` for agent-key links
(`notes/2026-10-13-agent-key-cohorts.md:24-27`) and destination@3 or later
for `dap propose` (`docs/cli.md:472-482`). The demo cohort (directory@7,
membership@2, rules@4, destination@3) meets both
(`packages/platform/src/directory.ts:87`; `demo-register.ts:9-12`).
Assumed until S0.

**Seeding.** `dap clone`, copy `task-list/` in, commit, `dap propose
seed`, `dap merge` (`docs/cli.md:428-509`): UTF-8 text, at most 64 paths
and 64 KiB per file. The founding rules ask no approval for the seed; the
test's rules then ask one approval, S7's check if used, and
`ownerMayReview: true` (1.4).

**Package** `examples/repo-in-ai/`: the S3 issue revision, `change3.json`,
four views, tool descriptions, `BRIEF.md` and `task-list/`. **By hand**
(`docs/run-your-app.md:103-147`): `activate` each definition;
`set-actions`, which replaces a role's whole list, so the runbook reads
and appends; `open-issue` under the activated digest
(`packages/platform/src/directory.ts:126-145,727-750`). **M1's** developer
half (manifest, `pack`, `dap check`) is local; its install half is host
code (`notes/2026-10-15-self-contained-applications.md:328-336`). If that
is deployed in time, the MVP is its first real package.

### 1.4 People, agents and the one counted approval

- **A lane guard cannot see member kind.** Guards read the signer's
  member ID and slots (`packages/derive/src/guards.ts:108-117,183-184`);
  the grant observation holds role, actions and controller, but no kind
  (`packages/contract/src/observation.ts:17-32`).
- **Membership binds role to kind.** `invite-member` makes people;
  `add-member` makes agents (role `agent`, controller an active person)
  and checkers (role `checker`); `set-role` touches people only
  (`packages/platform/src/membership.ts:338-350,415-458`). Grants follow
  roles (`packages/derive/src/grant.ts:306`), and the default table gives
  `change.review` and `change.merge` to person roles only
  (`membership.ts:105-106`). S3's `issue.approve` and `issue.decide` go
  to person roles only.
- **Gap:** `set-actions` is unguarded (`membership.ts:472-477`). S1
  checks the table, and views warn if an agent or checker role holds
  review, merge, approve or decide. **H2** (host, after the freeze): a
  guard form reading the retained observation's role and controller, with
  no membership or cohort change.
- **Tracing:** each entry retains its judged grant and observation,
  including the controller (`packages/contract/src/entry.ts:56`;
  `grant.ts:139-142`); membership records who added each agent.
- **The counted approval on a change is the owner's.** Agents propose and
  comment; they lack `change.review`, and an author is refused
  `author-cannot-review` (`apps/room/lanes/src/change.ts:927-929`). The
  owner controls both agents, and a controller's approval counts only
  when `ownerMayReview` is true
  (`packages/platform/src/reservation.ts:242-246`), so the test's rules
  set it, visibly.
- **dap-spike** (`~/play/dap-spike/notes/2026-09-14-evolving-spaces-design.md`
  section 8) treats assistants as ordinary principals, with no kind or
  controller. Borrowed: capabilities as predicates over the actor (H2's
  shape), authority answerable at each entry, and wrong-principal
  negative controls (`~/play/dap-spike/spike/T3-OBLIGATIONS-REPORT.md:25`).

### 1.5 Agreement, terms and work

- **A question approval approves only the question text.** Criteria are
  adopted by the owner's separate `revise` of the issue's conditions
  (`apps/room/lanes/src/issue.ts:239-253`).
- **Commitment terms are fixed** (`issue.ts:53-67`), so old-terms work is
  never relabelled. After a `revise`, the owner `offer`s new commitments
  carrying the current conditions (`issue.ts:350-363`); each agent
  `accept`s naming the exact terms, and other terms are refused
  `terms-differ` (`issue.ts:382-397`); the owner cancels the old ones
  (`issue.ts:435-446`).
- **Delivery is a change** made with `dap propose` and linked to the
  issue. Reports, holds and `fulfil` (`issue.ts:491-529,551-591`) need hold
  staging and Git-read capabilities whose deployment S0 has not shown. If
  S0 shows them, S5 adds `report`, `accept-report` and `fulfil`.
  Otherwise the Work view says "delivered by change N" and never shows
  "fulfilled".
- **The Work view shows separately** the current conditions, each
  commitment's terms, and each change's linked version.

### 1.6 The scenario

| Step | Actor | Acts and tools | View |
|---|---|---|---|
| 0 | Owner | `open-issue` under the S3 digest, with conditions; `offer` two commitments | Work |
| 1 | Agents | `accept`, naming terms | Work |
| 1 | Storage agent | `ask`; `request-approval` from the owner; `block` its commitment | Decision |
| 1 | Interface agent | `dap propose`, linked to the issue | Change |
| 2 | Owner, new conversation | "What needs my judgment?" → `needs_you`, then `context` (S4) | Needs you, Decision |
| 3 | Owner | Follow-up questions; comments. The agent revises the text. The owner `approve`s text version 2, then `decide`s; then `revise`s the conditions. | Decision |
| 4 | Owner, agents | New offers under the new terms. Agents `accept` them. The storage agent `release-block`s, naming the decide entry, and proposes. Old commitments are cancelled. | Work |
| 5 | Checker, owner | Check (S7, if used). The owner reads the diff, checks and conditions, approves, and `merge`s (`change.ts:907-956,1271-1391`). | Change |
| 5 | Destination | Publishes and closes the issue (`change.ts:1613-1676`) | Change |

### 1.7 What counts as a pass

1. **Explain the trade-off.** In a new conversation, without pasting
   context, the owner states the choices and their consequences.
2. **Spot a conflict when checks pass.** A scripted second round
   proposes deletion, and its checks pass. The owner, or the model,
   compares it with the approved text and the conditions and requests
   changes. This is a human or model comparison; no native semantic
   check exists.
3. **Resume without copying context.** Each agent resumes in a fresh
   session of the same member key, and the owner sends no message. This
   is not a test of takeover by a new member.
4. **People decide.** Each of these is refused, paired with an accepted
   person case:
   - an agent's `approve` or `decide`, even when a request names it;
   - an approval from someone who was not requested;
   - an approval of old text;
   - an approval from an old card;
   - a repeated unknown merge.
5. **Traceable agents.** Every agent act in the views names its
   controller, matching the entry's retained observation.
6. **Two hosts, one record.** This item is **pending** if the test runs
   in Claude Desktop alone.

## 2. Gap table

Kind: **data** = a definition or signed act; **local** = `dap mcp`, the
views or a script; **host** = needs a deployment.

| Capability | State | Kind | Evidence |
|---|---|---|---|
| Local MCP over stdio and loopback, one tool per act, `structuredContent` | exists | local | `packages/mcp/src/node.ts:309,367`; `catalogue.ts:236-248`; `service.ts:53,102-104` |
| MCP Apps resources and `ui://` views | missing | local | tools only (`wire.ts:215`); `plans/031-2026-10-12-generic-mcp-service.md:71` |
| New room, seed, install of definitions | exists in source | data | `docs/cli.md:206-230,428-509`; `docs/run-your-app.md:103-147`; deployment unproven until S0 |
| Package and install by URI | missing | local; host | M1 |
| People-only review and merge | exists | data | `membership.ts:105-106,415-458` |
| People-only question approval | missing | data | S3, with person-role grants; H2 is host |
| Agent traced to controller | exists in the record; missing in views | data; local | `entry.ts:56`; `grant.ts:139-142` |
| Question to named people, versioned text, bound approvals | missing | data | `ask` (`issue.ts:90-101`); the pattern is in `change.ts:103-125,859-956` |
| Adopted criteria, fixed terms | exists | data | `issue.ts:53-67,239-253,382-410` |
| Wait and resume | partial | local | `wait` (`service.ts:497`); release by hand (`issue.ts:710-731`) |
| Needs you, changed since review, pinned context | missing | local | no projection; inbox delivery is not wired (`apps/room/docs/lanes.md:436`) |
| Diff | missing | local | `notes/2026-10-13-hosted-mcp-endpoint.md:33-36`; credential reads (`docs/mcp.md:1010-1014`) |
| Isolated check execution | missing locally | local | the runner design needs a container per job (`packages/checkers/src/runner.ts:32-40`; `sandbox.ts:7-33`) |
| Old card and lost reply | exists, with a client caveat | local | `change.ts:1287,1289`; `judge.ts:302`; custody (`custody.ts:1-30`); MCP signs current revisions (`service.ts:411`) |
| OAuth for remote multi-user access | missing | host | `notes/2026-10-01-mcp-plan.md:423` |

## 3. Slices

No MVP slice needs host code. Test placement follows
`docs/testing.md:39-56`. Witnesses pair each refusal with its accepted
case.

### S0. Deployment and host probe (small; first; idle capacity)

**Kind:** no repository code. **Deployed service:** on the scope Worker
and rehearsal, record the installed registers (host, namespace, cohort;
rehearsal used `github.com`, `docs/demo.md:63`); confirm every route that
`dap mcp` and `dap propose` use; activate a draft S3 definition in a
scratch room; test hold staging and Git reads (1.5). **Hosts:** a
throwaway server from a scratch directory, with one view and one write
tool that writes only a local file, in Claude Desktop over stdio and in
ChatGPT through the tunnel.

**ChatGPT access rule.** ChatGPT gets owner-capable tools only if S0 shows
the throwaway write reachable from the owner's account and **denied**
from another account and from direct requests to the tunnel. A workspace
association, tunnel identifier, first-write prompt or missing inbound
port is not proof. The loopback bearer and `Origin` checks stay
(`packages/mcp/src/http.ts:177`; `node.ts:389`). Otherwise ChatGPT gets
read-only views and the owner writes in Claude Desktop, or ChatGPT is
left out and pass item 6 is pending.

**Witnesses:** register and cohort found; each route answered or named
missing; the draft definition accepted or refused with its reason; the
view in each host; the denial recorded or the fallback chosen.

### S1. Create and seed the room (small; after S0)

**Kind:** data. `dap create`; agent and checker members joined by
agent-key links; activate `change3.json`; seed; publish rules; append
actions; write `examples/repo-in-ai/runbook.md`. **Witnesses:** the seed
matches `task-list/` byte for byte after `git pull`; each agent shows kind
`agent`, role `agent` and the owner as controller; an agent's
`review-verdict` is refused and the owner's accepted; every role keeps
its earlier actions after the append.

### S2. MCP Apps plumbing and view kit (medium; after S0)

**Kind:** local. `resources/list` and `resources/read` on both wire
revisions; `ui://dap/{needs-you,work,decision,change}` as
`text/html;profile=mcp-app`, from the package and checked by digest, one
file each with inline script and an empty CSP; `_meta.ui.resourceUri` on
view tools and `_meta.ui.visibility: ["app"]` on view actions; a kit with
bridge, cards, the absent/stale/unavailable states (forge contract 4.4)
and an **actor chip** (person, agent with controller, checker). Views hold
no keys (forge contract 4.7). Host-specific code is only in
`views/hosts.ts`: `_meta.ui.domain` and the optional `openai/*` aliases.
**Files:** `packages/mcp/src/{wire,service}.ts`, `packages/mcp/src/views/`,
`examples/repo-in-ai/views/`. **Witnesses:** a view with altered bytes is
refused; an app-only tool is hidden from the model but callable from the
view; a stale head shows stale; an agent's entry shows its controller;
all views work in basic-host without `views/hosts.ts`.

### S3. Questions with requested approvers, people only (medium; with S2)

**Kind:** data: an issue revision using only guard forms of the change
lane (requests `change.ts:116-125`; version-bound verdicts `:927-952`).

- `ask` gains `body` (detached, 64 KiB) and `bodyAt` (the entry that set
  the current text), and drops the single addressee.
- New acts: `revise-ask`; `request-approval` and
  `withdraw-approval-request`, bound to `bodyAt`; `approve` (verdict and
  comment); `decide`.
- `approve` (grant `issue.approve`): the signer is the requested member of
  an open request; request and approval name the current `bodyAt`; the
  approver is not the asker.
- `decide` (grant `issue.decide`): no open request and no request-changes
  verdict on the current text, and at least one approval.
- Both grants go to person roles only. `comment` gains `about`;
  `release-block` accepts `decide`. Size: 14 item types, about 56 acts,
  within bounds (`packages/contract/src/bounds.ts:74-75`).

**Files:** `apps/room/lanes/src/issue-questions.ts`, pinned bytes, one
scenario in `apps/room/lanes/test/*.scope.test.ts`,
`docs/lanes-reference.md`. **Witnesses:** a requested agent is refused
`approve`, and the requested person accepted; an agent is refused
`decide`, and the owner accepted; an unrequested member is refused; an
approval of old text is refused after `revise-ask`; `decide` with an open
request is refused; another question's decision is refused
`not-this-ask`.

### S4. Needs you, Work, Decision context, since (medium; after S2, S3)

**Kind:** local.

- **`needs_you`** is computed from current state (forge section 7.2):
  open requests to me, versions awaiting my review or merge, and unknown
  merges. Each entry gives its rule and head, under a bound of 50 entries
  and 8 scopes, and says what it left out.
- **`work`** gives each agent's controller, commitment terms, block and
  changes, beside the current conditions.
- **`context`** gives one question's text versions, requests, approvals,
  comments, the conditions, and the brief as package resource
  `dap://package/brief` (exact bytes and digest, bounded).
- **The Decision view** renders this and makes version-bound `approve`
  and `decide` calls through S6's `at`.
- **`since`** reads heads that an explicit "mark reviewed" stored in
  `DAP_HOME`.

**Witnesses:** another person's request never appears in my list; a met
request leaves it; with 9 scopes, the result says one was not read; the
brief bytes' digest equals the question's pinned digest; `since` is empty
after "mark reviewed" and then shows one new entry; every `work` row names
a controller.

### S5. Agent wait and resume (small; after S3)

**Kind:** local and a guide. A `work-on` prompt
(`plans/031-2026-10-12-generic-mcp-service.md:70`) and
`examples/repo-in-ai/agents.md` give the loop: accept naming terms; ask,
request approval, block; `wait` up to 60 s, repeated, until decided;
accept the new terms, release the block, propose. Resumption is by the
**same member key in a fresh session**. Handover to another member is out
of the MVP: the performer must offer it before the session ends
(`issue.ts:447-467`). **Witnesses:** one block does not stop the other
agent's change; a fresh session resumes from the record alone; `accept`
naming old terms is refused `terms-differ`; a timed-out `wait` writes
nothing.

### S6. Change view, version-bound actions, merge (large; after S2)

**Kind:** local.

- A bounded `diff` between exact endpoints, read with the one-time
  credential. It says "truncated" over the bound.
- The Change view shows base and integration, this version's checks and
  reviews (each reviewer a person), and the linked conditions and decided
  questions.
- Card actions carry the revisions the card displayed: an optional `at`
  replaces `expectedOf` (`service.ts:411`).
- Unknown outcomes offer only `settle` (`service.ts:499`).

**Witnesses:** an old card's approval is refused after a newer version,
and a fresh card's accepted; with a merge `unknown`, a merge from any card
is refused; **lost reply:** with `dap mcp` killed after sending and before
the reply, `settle` after a restart reports the outcome and nothing is
sent twice (this replaces draft 1's restart witness); an over-bound diff
says "truncated"; a complete native merge succeeds in the scratch room
with the owner's real approval under real rules and membership.

### S7. Check runner with a trust boundary (medium; optional for the test)

**Kind:** local, following the reviewed runner design. Each job runs in a
fresh local container. Its only network is a local Git gateway that holds
the read token. It holds no signing key, no `DAP_HOME`, no token and no
write path, and it has bounded time and memory. The service process
signs the result through `ResultSigner`, naming job, tree and
configuration digest (`packages/checkers/src/runner.ts:32-40`;
`sandbox.ts:7-33`; `signing.ts:10-24`). Without a container runtime, the
test has no required check, and the view says "no checks ran"; it never
shows a trusted pass.

**Witnesses:** a test that reads `DAP_HOME` or opens a socket fails in the
container; a result for another tree is refused; a failing test records
a failed check, and `merge` is refused.

### S8. Package and install (small to medium; after S2 to S7)

**Kind:** local, or host with M1 install. Assemble `examples/repo-in-ai/`,
with M1's `pack` and `dap check` if they have landed; otherwise use the
runbook of 1.3. **Witnesses:** a fresh scratch room reaches step 0 from
the runbook alone; an altered view is refused by digest.

### S9. Rehearsal and test (medium; last)

Run 1.6 in the scratch room with scripted agents, then the human test of
1.7 in the test room. The run note labels each measurement by how it was
taken. **Witnesses:** the six pass items; item 6 is pending under the
one-host fallback.

## 4. Decisions still open, with recommendations

1. **People-only enforcement:** person-role grants with warnings and the
   S1 check now; H2 after the freeze.
2. **Owner approving their own agents' work:** `ownerMayReview: true`,
   visible in the record. A second person reviewer is the stricter later
   form.
3. **Approval binding:** `bodyAt`, an entry ref, over a version item.
4. **When a question is decided:** every request on the current text
   met, at least one approval, and no request for changes.
5. **ChatGPT access:** S0's denial test, with read-only or Claude-only
   fallbacks.
6. **Checks:** S7's container boundary; without one, no required check.
7. **No suitable register (S0):** wait for the freeze rather than change
   a Worker setting.

## 5. Out of scope

- Plans, prices and paid continuation.
- Local rooms and `dap dev`.
- M1's install half, unless it is deployed in time.
- H2.
- Takeover by a new member.
- Reports, `fulfil` and holds, unless S0 shows they work.
- Slack, inbox delivery, GitHub synchronization, and more than one
  destination.
- **A room on the real artroom repository** on GitHub, after the freeze
  and GitHub import (`notes/2026-10-15-github-repository-import.md:323-336`).
- **Hosted agents:** per-hold forks, a spending limit, a turn loop, and
  room-run replacement (`notes/2026-10-15-hosted-agent-teams-design.md:302-399`).
- **H1: OAuth 2.1 for authenticated multi-user remote access** (host
  code, `@cloudflare/workers-oauth-provider` 1.2.3). Hosts do not all
  require it:
  - Claude's remote connectors also support no authentication, and
    static headers for some organizations
    (https://claude.com/docs/connectors/building/authentication.md);
  - OpenAI custom MCP supports no authentication
    (https://developers.openai.com/api/docs/guides/custom-mcp-server.md).

  OAuth is the proposed route when several people use a hosted endpoint.

## 6. Order and the existing sequence

The builder sequence stands as it is:

1. the NOW work (e029, e871);
2. hosted Counter slices 1 to 4 with M1's developer half, with
   observability and capacity alongside;
3. M1's install half and the Counter page.

The MVP follows that sequence.

| Order | Slices | Kind | Depends on |
|---|---|---|---|
| first | S0 (small) | none | nothing |
| 1 | S1 (small), S2 (medium), S3 (medium) | data, local, data | S0 |
| 2 | S4 (medium), S5 (small), S6 (large), S7 (medium) | local | S4: S2 and S3; S5: S3; S6: S2; S7: S1 |
| 3 | S8 (small to medium) | local, or host if M1 install | S2 to S7 |
| 4 | S9 (medium) | data | all |

- **No hard prerequisite** in the sequence.
- **Helps:** M1's developer half (for S8); MCP bounded query `8bc5a05a`
  for S4's paging (`notes/2026-10-15-public-item-query-integration.md:364`).
- **Not required:** the hosted Counter's enrollment
  (`notes/2026-10-15-hosted-counter-contracts.md:23-26`).
- **Can wait:** observability, capacity, CLI JSON and evidence rules.
- **Idle capacity:** a planner or checker session can run S0, and an
  admin session S1.

## 7. Findings map: review of draft 2

| Finding | Answer in draft 4 |
|---|---|
| General: S0 must establish deployed routes, forms, room and destination; source is not deployment | The status line and S0 part 1 say so. Every "exists" for room actions is marked "in source" until S0. |
| General: the lost-reply witness was dropped with the local room | Restored against the hosted room as S6's lost-reply witness |
| F1: grants in the Change walkthrough | Resolved by draft 3: agents propose and comment, and only the owner reviews and merges. 1.4 names the one counted approval and `ownerMayReview: true` (`reservation.ts:242-246`). S6 witnesses a native merge with real rules. S1 appends to action lists rather than replacing them. |
| F2: conditions revised after commitments; reports | 1.5: approval covers the text only; criteria by `revise`; new offers under new terms; old commitments cancelled, never relabelled. Reports are not used unless S0 shows them working; the views never show "fulfilled". S5 witnesses `terms-differ`. |
| F3: check execution trust | S7: a container boundary per the reviewed runner design, with the signer outside it. Otherwise no required check and no trusted pass shown. |
| F4: who may reach the owner signer; the H1 claim | A dedicated test `DAP_HOME`; S0's access rule needs denial from another account and from direct requests; bearer and `Origin` checks kept; read-only or Claude-only fallback. H1 is corrected in section 5. |
| F5: handover after a kill | S5: resumption by the same member key in a fresh session. New-member takeover is out of the MVP. |
| F6: brief and context path; semantic claim; one-host pass | S4's `context` tool and `dap://package/brief` serve pinned bytes, and the Decision view renders them with version-bound actions. Pass item 2 is labelled a human or model comparison. Item 6 is pending under the fallback. |
