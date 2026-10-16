# Hosted agent teams for dap applications

15 October 2026. Discussion draft, revision 2. Not independently reviewed.

Draft request `4b236bb2`, planner promise `4852347a`.
Counter-first revision: request `2b90849c`, promise `65a39bbf`.
Preceding investigation: `cf79fef5`, reported in `65267d24`.
Source baseline: main `3f1c9b2fae26b46d62d66dc53f6366fff7f18b93`.

Hugh's direction is to host agents on Cloudflare and make their setup a
small choice: how many agents, in which roles, attached to which dap app.
Each role selects a model and a system prompt. Room agents need individual
forks that they can initialize and dispose of without manual infrastructure
work. Hugh selected automatic pickup of eligible work within role and budget.

The initial version uses **Workers AI only**, through the trusted host's AI
binding. External inference providers, API-key setup, and AI Gateway are
outside this version. The first demo is a repository-free Counter. The
second is a Room with automatic individual forks and merge-back into the
room's main repository destination.

This note records that direction, a proposed design, the existing platform
basis, and the contracts still needed. It commissions no implementation,
provider operation, or change to the current NOW, SOON, and P1 priorities.
The document is an explanation of the design, not an implemented API guide.

## 1. The experience starts inside the app

An app has a team of agents. An agent has a role and does assignments. A
coding assignment has its own workspace. People continue to use the app's
ordinary work records to direct the team and judge its results.

The proposed **Add agents** form contains these choices:

| Choice | Example | Default behaviour |
|---|---|---|
| App | This Counter | Use the current app, with its identity visible |
| Roles and counts | One or two roles, each with a quantity | Choose role presets and desired counts within app capacity |
| Role configuration | Workers AI model and system prompt | Choose from the app's allowed models; editing creates another revision |
| Budget | Total allowance for each role | Constrain allocations by the app-wide budget and show the remaining balance |

**Attach team** creates the missing agents, enrolls them under authorized
control, and makes them available for eligible work. Agents sleep when
there is nothing to do. Closing the browser does not stop authorized work.

The team view shows actual provisioning progress, agent identities, role
revisions, current assignments, last meaningful progress, spending, and
blockers. It links to the same work, source, and results as the rest of the
app. It follows the [unified room interface](2026-10-15-unified-forge-design.md)
and the existing design system, rather than introducing a separate agent
workflow or requiring people to read raw transcripts.

A row can say **3 requested, 2 ready, 1 needs attention**. A partial setup
must not look complete. The useful controls are **Pause**, **Resume**,
**Finish current work and stop**, and **Stop now and save work**. Destructive
discard of saved work is a separate, explicit choice under retention rules.

For a room, each agent reaches issues, commitments, changes, and evidence
through their canonical records. For a library, counter, or unfamiliar
application, agents use that app's declared operations. Git is optional.

### Demo 1: configure agents in a Counter

The installer or administrator first sets the Counter's allowed Workers AI
models and total inference budget. Those are app settings with an explicit
authority and revision. They are not arbitrary preferences supplied by an
agent or a user's setup form.

A user opens **Agents** in that Counter and configures one role, with an
optional second role. Each role has a quantity, an allowed model, a system
prompt, and a total role budget. Label the budget as covering all agents
in that role, so increasing quantity does not multiply the allowance.
The user sees how those allocations fit within the Counter's remaining
budget before selecting **Attach team**.

The app exposes these proposed settings and effective constraints:

| Setting | Authority and enforcement |
|---|---|
| Allowed model IDs | Installer or administrator selects exact Workers AI IDs from a host-supported, compatible catalog |
| Total inference budget and accounting unit | Installer or administrator sets one shared ceiling for this app instance, across all roles, agents, users, and teams |
| Role quantity | User chooses within app participant capacity and deployment limits |
| Role model and system prompt | User configures behaviour; the model must remain allowed and compatible |
| Total role budget | User allocates a bounded part of the app allowance, shared by that role's agents |

Who may configure agents is itself an app permission. Permission to run the
Counter or configure a role does not grant permission to raise its ceiling
or add an allowed model. One person may hold both administrative and user
permissions, but the operations retain their different authority.

The trusted host intersects the app's allowlist with its supported Workers
AI catalog. It checks the effective policy at setup and before every new
inference call. An empty intersection leaves the setup unavailable, with
no external fallback. Changing a prompt, bypassing the form, or calling a
runtime route directly cannot bypass these checks.

The hosted agents join the Counter as distinct participants and take
eligible turns through its admitted acts. The model receives actual app
context and uses the agent's permitted tools. A scripted counting loop
without real Workers AI calls does not establish the hosted-agent demo.
Race losers reread the board instead of inventing a successful turn.

This demo provisions no repository, Git fork, checkout, or Linux container.
The app's identity, membership, configuration, and work records remain
native dap state. A current installation path that happens to create a
repository is a platform gap, not a Counter requirement or a reason to
create an empty repository for the agents.

The [current Counter](../examples/counting/README.md) uses a commitment to
say a number and a later report of completion. Its browser owns speech
completion separately from model output. The demo design must either supply
a genuine supported output adapter or use an explicitly reviewed headless
Counter definition. A generated number alone must not be reported as
completed speech. This choice does not introduce a repository requirement.

The current commitments definition permits at most 16 non-removed
participants, including humans. Validate configured quantities against the
selected definition and current population. Two role rows do not imply
unlimited agents or grant permission to change the Counter's native rules.

## 2. Separate the identities without making users manage them

The implementation needs distinct records for the following concepts.
These are requirements for a schema design, not newly adopted schemas.

| Record | Meaning and lifetime |
|---|---|
| Role revision | Immutable model selection, system prompt, and declared operating defaults |
| Team configuration | Desired counts of role revisions attached to one exact app, under a controller and budget |
| Agent | Stable participant identity, enrollment, control, and lifecycle |
| Assignment | One unit of app work, its claim, conversation, result, and disposition |
| Execution instance | One current attempt to run an assignment, with a generation that fences old instances |
| Workspace | A particular source fork, checkout, and saved files owned by the assignment |
| Operation | One retained control request, model attempt, tool request, or provider effect and its observed outcome |

An app attachment names the service, exact app or installation, its relevant
scope incarnations, and the authority domain used for enrollment. Display
names and role labels are insufficient identity. A later app upgrade does
not silently reinterpret an already prepared operation.

Start with one active assignment per agent and one app attachment per
agent. A role preset can be reused across apps, but another attachment gets
its own participant and work context. This avoids accidental cross-app
authority and conversation sharing. Multi-app agents are later design work.

An agent's name can remain stable across assignments. Assignment context
stays separate. Saved general memory, if offered, needs an explicit scope,
provenance, access, and retention contract before it crosses assignments.

## 3. Roles choose behaviour; the app grants authority

The two required role fields are **model** and **system prompt**. A useful
role revision also declares its name, purpose, compatible tool needs,
workspace requirement, and defaults for execution limits. The setup form
can keep those defaults behind an inspectable role summary.

Record Workers AI as the fixed inference target, the exact model ID,
supported settings, exact prompt
bytes or a retrievable content identity, revision author, and provenance.
Resolve settings at assignment start and retain the effective revision.
No external provider credential is part of initial role configuration.

Changing a role creates a new revision. By default, new assignments use
the selected new revision and active assignments retain their current one.
An explicit restart can apply the revision to active work after saving its
state and fencing the old instance. A retry of an already prepared action
keeps its original meaning, even after a role change.

A friendly role such as planner, builder, reviewer, or librarian is not a
new membership permission. The app resolves requested capabilities against
the actual member, grants, controller, rules, and current operation. The
role summary shows effective access and any requested access not granted.

In particular, a reviewer prompt does not establish qualified review or
independence. Room rules still govern authorship, controller relationships,
review, checks, and publication. Adding more agents under the same owner
cannot manufacture independent approval. An agent proposing a change does
not receive canonical publication credentials merely because it can edit.

Repository instructions, other participants' text, and tool results retain
their source attribution. They can inform work but cannot grant authority
or change host-enforced limits. The host owns credential use and dispatch.
An app package does not acquire the agent's signing power through a prompt,
presentation component, or executable plugin.

Unavailable or newly disallowed models leave visible pending work. The
initial version has no automatic model substitution. An authorized user can
select another currently allowed Workers AI model through a new role
revision. That change does not raise the app budget or alter tool authority.

## 4. Provision desired counts and recover partial setup

Treat the setup as **ensure this team configuration**, rather than an
unqualified command to add another batch. A deliberate increase from three
to six is a new configuration revision. Repeating the same setup operation
continues its existing allocations.

Before crossing a durable boundary, retain the authorized configuration,
operation identity, intended agent slots, and child creation identities.
Reuse those identities through enrollment, runtime creation, and lost
responses. A retry must not consume another invitation or enroll another
key for an already allocated slot.

Provisioning is a recoverable sequence, not an atomic transaction across
membership, agent storage, a model provider, and a Git host. Show each
agent's actual progress. Preserve partially created identities and cleanup
duties when configuration changes or authorization disappears mid-setup.

Proposed visible agent states are preparing, ready, working, waiting,
paused, draining, and stopped. Waiting names a reason such as no eligible
work, another participant, unavailable model, exhausted allowance, or
unsupported app. A short status is linked to its durable detail.

Reducing a count normally selects agents to drain, stops new claims, and
lets them finish or save their current assignments. A specific agent can
also be selected. Increasing the count again does not silently reactivate
a retired membership identity or reuse a removed handle.

Target changes are explicit detach and attach operations. They do not move
an existing participant's authority, workspace credentials, or conversation
into another app. Work already in progress retains its original app binding.

## 5. Automatic pickup follows the app's work contract

The default is autonomous pickup of eligible work within the selected role
and budget. A role prompt alone cannot define a reliable work queue.

An app must expose enough information to answer four questions: what work
is available, who may undertake it, how it is claimed, and what counts as a
result. Use the app's existing claim or commitment where possible. If an
app has no corresponding operation, its adapter needs a reviewed admission
contract before it supports automatic pickup. A Counter's native turn or
promise is sufficient ownership for that unit of work. Do not require a
repository issue, a room hold, or another generic claim to count.

The initial dispatch sequence is:

1. Read a bounded page of authorized candidate work and its coverage.
2. Filter by the role's declared selection and actual app eligibility.
3. Claim the work through an admitted app operation. A losing contender
   rereads the outcome and chooses other eligible work.
4. Retain the assignment identity, input provenance, role revision, and
   budget reservation before starting its execution instance.
5. Recheck relevant current authority and assignment ownership before each
   new effectful tool. Fence an expired or replaced execution instance.
6. Report the actual result through the app. A worker's report does not
   replace requester judgment, a qualified review, or publication evidence.

Use app records for handoffs and requests between agents. A private runtime
message is not completion of an app obligation. Initial agents cannot
spawn extra paid agents or increase their own limits through tool calls.

Avoid permanent polling or repeated empty model turns. A wake is a hint to
read, not work authority. Retain inputs before advancing their read cursor,
deduplicate stable input identities, and keep conversation progress separate
from app read progress. Lost wakes need bounded catch-up with backoff while
the agent is active. Paused work remains paused after a wake.

Role, visibility, or work-filter changes need bounded reconsideration of
newly eligible work. An old cursor does not prove the new selection was
covered. Stale or superseded work gets a recorded disposition instead of
being silently treated as finished. Missing data remains distinguishable
from no eligible work.

The app adapter also needs fair selection, claim expiry or explicit
reassignment, and a clear response to an agent that repeatedly fails. The
first design must name those policies. It must not invent a universal
business dependency or completion state for unfamiliar apps.

## 6. The host owns supervision, recovery, and spending

An agent runtime combines a model-and-tool loop with durable supervision.
The existing hosted MCP endpoint supplies a signing and custody boundary.
The runtime must use that boundary or a deliberately reviewed internal
equivalent, with one authoritative owner for each prepared operation.

The runtime retains admitted inputs, visible conversation messages, tool
requests, exact prepared app acts, observed results, checkpoints, current
assignment ownership, and outstanding duties. Conversation compaction keeps
source references and must not turn an uncertain operation into success.

Restart first reconciles durable state. It does not immediately ask the
model to repeat its last action. An app request with a lost answer is
settled through its retained identity. A shell command, Git push, or other
external effect needs its own operation-specific recovery evidence. Reusing
a conversation identifier does not make arbitrary side effects run once.

Pause fences new dispatch and preserves pending work. Stop now also
interrupts execution where supported and records what remains uncertain.
Neither operation pretends to reverse an already admitted action. Cleanup
and settlement can continue under their own retained authority after new
work stops. The design must reserve capacity for that work.

Carry forward the existing [controller and device policy](plans/005-2026-10-03-browser-cloud-work.md):
closing a browser is different from revoking a device key, losing the
controller's last active key, removing the controller, or revoking the
agent. The runtime must map each case to explicit control and dispatch
behaviour. Do not invent operator impersonation or automatic owner transfer.
Preserve existing session-expiry semantics rather than promising a stronger
revocation guarantee without the necessary protocol change.

### The app ceiling governs all role and agent allowances

Set finite limits for active agents, concurrent assignments, model calls,
input and output tokens, execution time, workspace resources, and cumulative
spending. The team view shows used, reserved, and remaining allowance, plus
usage whose provider outcome is unresolved.

All concurrent agents reserve against one authoritative app-wide allowance,
with nested role and optional per-agent limits. User and team boundaries
cannot each spend the full app balance. Allocations, spent usage, unresolved
reservations, and releases must be reconciled without allocating the same
remaining balance twice. Retries each need their own admitted reservation.
For the initial allocation model, each role budget includes that role's
spent usage and pending reservations. Total role allocations across the
app cannot exceed the app ceiling. Before a call, spent usage plus pending
reservations plus the new reservation must fit both the role allocation
and the app ceiling. Do not add spent usage to an allocation again when
displaying the app's allocated total.
Bound retries and queue them with backoff. Idle agents do not call a model
merely to decide whether to remain idle.

A budget has one explicit accounting unit and period. The initial schema
must select that unit, such as a fixed inference-credit unit with a
versioned conservative model-cost schedule. Workers AI's published
[pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
uses model-specific rates and Neuron accounting. Its account-wide free
allocation is not a fresh free allowance for each Counter.

Reserve a defensible upper cost before dispatch from bounded input and
output limits and the selected model's schedule. Reconcile actual usage
where available. A lost inference reply retains an unresolved charge
reservation. An agent cannot repeat the call for free. Until a strict
currency bound is established, label currency displays as estimates and
enforce the chosen credit, token, call, time, and concurrency ceilings.
Delayed account usage reports cannot be the only enforcement mechanism.

The installer or administrator sets the app ceiling. A user distributes
allowance within that ceiling. Agents cannot extend either limit. Reducing
the ceiling below spent or reserved usage fences new inference, preserves
the outstanding charges, and requires an explicit administrative decision.
Removing a model blocks new calls without erasing in-flight results or
their costs. Revalidate policy revisions at the host dispatch boundary.

Counter reset, agent restart, role replacement, detach, and reattachment do
not reset spending. Replenishment or a new budget period is an authorized,
recorded operation. An exhausted allowance leaves work saved and visibly
waiting. Inference budgets are distinct from hosting or sandbox resource
limits; the first Counter demo has no workspace cost to hide in its budget.

## 7. Coding workspaces are isolated and disposable

For the second demo, every configured Room agent automatically receives
access to its own private Cloudflare Artifacts fork of the room's main
repository destination. Provision the initial fork as part of attaching
the agent. Show the agent as preparing until its workspace is ready.
The user does not manually create repositories or distribute tokens.

Bind access to the current assignment or workspace instance and the
agent's actual role. Create a Linux checkout for coding or command work as
needed. Preserve workspace ownership when an initial hold is attached, so
that a hold does not accidentally allocate a second fork. A different
unrelated coding assignment gets a fresh workspace unless an explicit
handoff preserves prior work with a new current instance and credentials.

This is a source fork, not a copy of room membership, rules, issues, or
changes. It is also distinct from a conversation fork and the proposed
portable dap clone. The participants collaborate through the shared app.
The Counter has no source fork or Linux container. Other non-repository
apps need neither. The Room demo's automatic per-agent forks do not make
Git a prerequisite for the common agent runtime.

The agent-facing operations are conceptually **Start workspace** and
**Dispose workspace**. These are proposed capabilities, not current command
or MCP tool names. Each operation retains an identity and reports actual
progress. Retrying it refers to the same resource and operation.

### Initialization binds an exact base and owner

Before calling a provider, record the app, assignment, agent, hold where
applicable, current instance generation, exact base commit, intended fork
name, and creation attempt. A mutable branch name alone is not the base.
Resolve that base from the room's configured main destination and recorded
head. Do not fork a cached unrelated repository or an arbitrary model URL.
Room provisioning must define a workspace owner before the first business
assignment, then bind the selected assignment without duplicating ownership.

Create the fork, establish readiness through the actual provider contract,
verify the selected base, and account for the fork's initial write token.
Issue only scoped, short-lived workspace access under private custody.
Keep canonical publication credentials in the trusted host. A fork push
shows an operation under its custody; it does not independently prove the
identity of the process that pushed.

Start the execution environment from a pinned image and check out the
selected commit. Record relevant toolchain and environment identity for
reproducible checks. Unstaged edits and untracked files need a saved-work
checkpoint if they must survive loss of the container. A Git commit alone
does not preserve every file or running process.

Disposal requested during initialization fences use immediately. A late
creation answer remains owned cleanup work. Unknown creation does not
justify blindly creating another fork or deleting whatever later occupies
the intended name.

### Disposal releases access before removing retained evidence

The disposal sequence stops new use, saves required work, reconciles
outstanding effects, revokes credentials, and requests authorized retirement.
Actual storage deletion waits for the required retention and pin conditions.
The visible result distinguishes access ended, cleanup pending, and deletion
confirmed. Disposal of an RPC handle is not deletion of repository storage.

Published, rejected, cancelled, and abandoned contributions can all be
referenced by the app's history. Before deleting their only fork, retain the
commit and tree closure, required payloads, source provenance, and exact
check bindings somewhere with the necessary read authority. A digest alone
does not retain the object bytes. Retention is not restricted to work that
eventually merges.

Retention needs verified complete closure and a stated storage guarantee
for the exact repository. A ref advertisement or successful partial Git
read does not prove that guarantee. The unresolved host-retention boundary
in the [repository import design](2026-10-15-github-repository-import.md)
also matters when deciding whether a disposable fork holds the only copy.

Keep versioned report and check subjects exact. A later fork head does not
replace the commit that was reviewed. Cross-fork inspection and integration
staging must preserve canonical publication rules. The room's current
destination assumptions cannot be bypassed by pushing an agent's fork.

The existing [hold capability](../packages/derive/src/capability/hold.ts)
ends token use and has explicit retirement guards. Ending a hold does not
delete its fork. Automation needs an authorized scheduler and retained
cleanup duties that respect those guards.

[Plan 029](plans/029-2026-10-11-artifacts-forks.md) is the starting point,
but requires revision before implementation. Its immediate-deletion wording
and readiness probe do not match this lifecycle or the observed API. The
[fork measurement](implementation/2026-10-13-fork-cost-measurement.md) observed readiness
through successful access and found no status in `info`. Its small run is
neither a provisioning SLA nor a measurement of large-fork storage cost.

### Demo 2 must merge fork work into the main destination

Creating a fork and showing an agent's diff is insufficient. The Room must
consume that fork's contribution and publish an admitted integration into
its canonical main destination. The required flow is:

1. An agent edits and commits in its own fork. Its report names the exact
   fork, commit, tree, base, and current workspace ownership.
2. The host reads and verifies that contribution and retains the required
   Git closure. Fork access remains distinct from canonical write authority.
3. An authorized integration process combines selected contributions against
   the current canonical base and constructs an exact integration commit.
   The implementation must supply merge computation and object transfer;
   Artifacts is not assumed to perform a server-side merge.
4. The Room applies its review, check, reservation, and publication rules to
   the exact selected content and integration. Evidence must match the final
   commit and tree under the applicable rules.
5. The trusted publication owner writes the admitted integration and verifies
   the canonical result. A lost response remains unresolved until reconciled.
6. Required source and evidence stay readable after workspace disposal.

Main advancing after the fork was created requires explicit integration or
conflict resolution against the newer base. It cannot justify overwriting
main or silently reusing checks for changed content. Conflict or unavailable
evidence leaves work waiting for the relevant person or agent.

The demo's terminal witness is a verified canonical head containing the
agent's intended change and a Room publication receipt linked to its fork
report and qualifying evidence. A fresh authorized read of main must show
the result. A push to the agent's fork, a local merge, or an unverified
publication request does not satisfy that outcome.

## 8. Cloudflare execution and storage choices

The initial inference path is the trusted Worker's
[Workers AI binding](https://developers.cloudflare.com/workers-ai/configuration/bindings/),
using the selected allowed model through `env.AI.run()`. No external API
provider, custom inference endpoint, provider-key form, gateway route, or
gateway-dependent budget service belongs in these two demos.

The proposed separation is a trusted host for identity, control, and
dispatch, with optional isolated execution for coding. The host must not
give a model-generated process its own signing seed, a general app bearer,
or account-wide provider authority. A narrow broker can perform authorized
operations on its behalf while preserving operation custody.

Current [Cloudflare harness documentation](https://developers.cloudflare.com/agents/harnesses/)
separates the model-and-tool loop from durable runtime services. It lists
Think, Pi in beta, and OpenCode as experimental. Compare only candidates
that can use Workers AI directly and meet dap's inherited runtime contracts.
Keep the first Counter harness small, with bounded app tools and no shell.
The old Pi
spike is useful evidence about a bounded harness, not production autonomy.

[Durable execution](https://developers.cloudflare.com/agents/runtime/execution/durable-execution/)
offers recovery mechanisms. Dap still needs exact tool settlement and
assignment ownership across restarts. A framework checkpoint is not proof
that an external command or publication completed.

[Cloudflare sandboxes](https://developers.cloudflare.com/sandbox/) provide
Linux execution for Git, builds, and tests, and a separate Dynamic Worker
option for narrower generated-code tasks. Ordinary app agents can use
trusted app tools without a Linux environment. Do not add a container to
every idle participant.

Sandbox files need explicit persistence across instance shutdown. Use the
documented [lifetime model](https://developers.cloudflare.com/sandbox/concepts/lifetime/)
and supported snapshots or backup mechanisms. A stopped process is not a
saved running process. Snapshot limits and expiry make snapshots recovery
material, not an indefinite archive. Pin and recheck the chosen API and its
release status during the implementation design.

| Data | Proposed home | Required boundary |
|---|---|---|
| Agent control, assignment ownership, cursors, and operation status | Durable Object storage | Bounded rows, indexes, history growth, and completion reserve |
| Git source, submitted commits, and retained source closure | Artifacts, with explicit retained roots | Exact identity, read authority, verified closure, and deletion policy |
| Large private logs, saved files, and checkpoint payloads | R2 where needed | Access control, integrity, retention, and references kept in control records |
| Workers AI binding and app signing authority | Trusted host custody | Host-enforced model and budget policy; no authority exported to model-controlled code |
| Running processes and temporary checkout | Sandbox container | Isolated execution, resource limits, and recoverable saved work |

R2 storage is not Git reachability. Private runtime data is not automatically
part of a room journal archive or portable clone. Those features need their
own explicit export, access, privacy, and retention decisions. Keeping data
in a Durable Object also does not make its history unlimited.

The host maintains a compatible subset of the
[Workers AI model catalog](https://developers.cloudflare.com/workers-ai/models/).
Catalog availability is distinct from the Counter's allowed-model setting.
The app administrator chooses within host support; a catalog update cannot
silently add models to an app's allowlist. Model-specific input, output,
structured-result, and tool-use behaviour need adapter validation before
a model becomes selectable. An arbitrary model name is not sufficient.

The implementation design must name finite CPU, memory, disk, concurrency,
model-rate, request, and storage budgets. Recheck current provider limits
against representative repositories. Forks distribute some repository
traffic but still share namespace control-plane limits. Published pricing
does not settle fork storage accounting or whole-assignment cost.

Desired agent count is distinct from running execution capacity. If the
account, model provider, or team allowance cannot currently run every ready
agent, show the queue and limiting resource. Provisioning must not promise
instantaneous capacity or silently exceed the selected allowance.

Network access and package installation are declared workspace needs.
Allow only necessary destinations through the trusted host where practical.
Credentials remain outside model-controlled code. Logs and model inputs
have explicit disclosure rules, including what the selected provider sees.

## 9. What the repository already supplies

These are source observations at the baseline above, not a claim about a
current hosted deployment or a completed acceptance journey.

| Area | Existing basis | Required addition or qualification |
|---|---|---|
| Agent identity | [Hosted registry and agent](../packages/mcp/src/hosted.ts) allocate distinct keys, enrollment, configuration, and SQLite custody | Model loop, runtime supervision, team counts, and role revisions |
| Hosted controls | [Worker routes](../packages/scope/src/worker.ts) serve create, bearer rotation, retirement, and MCP traffic | Public authorized roster, team reconciliation, and pause or drain controls |
| App operations | [MCP inventory](../packages/mcp/src/inventory.ts) discovers configured repository and application scopes | Repository-free Counter enrollment and attachment authority; roots alone do not grant it |
| Counter settings | [Current commitments definition](../examples/counting/commitments.ts) has a fixed controller and target, board state, participants, and promises | No allowed-model list or inference budget today; add versioned app-owned settings and trusted runtime enforcement without changing old pins |
| Permissions | [Membership](../packages/platform/src/membership.ts) records agent controllers and permission roles | Friendly role presets must map to effective authority without changing its meaning |
| Task opening | [Directory](../packages/platform/src/directory.ts) records `open-task` | Its source explicitly says the `platform:task@1` child is not runnable in this package |
| Workspace records | Hold capability records instances, tokens, and retirement conditions | Fork creation and head-read outcome rules, provider wiring, and autonomous cleanup remain incomplete |
| Artifacts provider | [Current adapter](../packages/scope/src/artifacts-host.ts) implements repository and destination operations | No production per-hold fork adapter in its exposed namespace interface |
| Earlier runtime research | [Pi spike](../spikes/pi-durable/README.md) and browser-cloud plans | Caller-driven fake-provider evidence does not establish real autonomous execution |

Existing hosted creation consumes a repository-bound agent invitation.
Configured MCP roots do not turn it into repository-free Counter enrollment.
The first demo therefore needs an explicit supported app identity and
enrollment path, plus protected app settings that the runtime can validate.
This is a required platform change, not merely a different setup screen.
New settings require a new supported Counter definition or app version.
Do not edit the meaning of existing immutable definition pins.

Hosted MCP retirement invalidates its bearer and ends sessions. It does
not itself revoke the membership key, delete custody, dispose a workspace,
or cancel a provider effect. The new lifecycle must explicitly coordinate
those different operations and retain their separate outcomes.

The [current task map](plans/023-2026-10-06-connected-story-current-tasks.md)
assigns hosted runtime outcomes to C1 and IA (`b538c5ea`, amended by
`d55da8ef`, with design milestone `b01321d3`). It marks the old C3 request
stale and carries useful outcomes into IA, I5, and I6. Inspect those exact
records and amendments before commissioning a successor implementation.
Do not revive an obsolete engine from an earlier plan's path names.

Carry forward the [durable input handoff](plans/007-2026-10-03-attention-runtime-handoff.md)
and [wake clarification](plans/008-2026-10-03-wake-and-schedule-clarification.md).
The older handoff's proposed-status header is historical; the later
clarification records its independent approval. Their current scope
mapping still needs reconciliation in the runtime contract.

The approved [application direction](2026-10-15-self-contained-applications.md)
requires shared projections for screens, MCP, and agents, with host-held
authority and isolated presentations. Reuse that direction. This feature
must not create another room-only tool vocabulary or execute an unfamiliar
package merely to interpret its records.

## 10. Concrete next design steps

The owners below are roles to assign when the work is commissioned. They
are not new promises or a change to current builder priorities.

| Step | Owner role | Output | Readiness condition |
|---|---|---|---|
| Establish Counter demo contracts | Planner with Counter and platform owners; checker | Repository-free enrollment, policy-settings authority, selected Counter definition and output semantics, one or two role rows | No repository dependency; existing immutable definitions remain unchanged; settings have an exact owner and revision |
| Specify Counter model and budget enforcement | Runtime and Counter owners; checker | Direct Workers AI adapter, compatible catalog, app allowlist, app-wide ledger, nested role allocations, and conservative call reservations | Direct API bypass, concurrent teams, model removal, and budget reduction cannot bypass app constraints |
| Specify Counter runtime and controls | Runtime and client owners; checker | Role revisions, desired counts, roster, native turn pickup, durable inputs, recovery, pause, and stop | Genuine Workers AI agents participate within the selected Counter rules and current capacity without duplicated identities or turns |
| Commission and demonstrate Counter | Planner/requester with builder; checker | Separate reviewed implementation requests and a real deployed Counter journey | One-role setup and optional second-role setup work under app constraints; interruption, budget exhaustion, and browser-off recovery are demonstrated |
| Refresh Room fork and integration contracts | Git, Room, and runtime owners; checker | Revised plan 029, automatic per-agent forks of the main destination, scoped access, cross-fork reads, merge computation, exact evidence, and cleanup | Fork creation, verified merge-back, and retained evidence are specified as one complete journey |
| Commission and demonstrate Room | Planner/requester with builder; checker | Separate reviewed implementation requests reusing the Workers AI runtime, with real source edits and canonical publication | A contribution from an automatically provisioned agent fork reaches the verified main destination under Room rules |

Counter is the first demo and readiness milestone. Room follows it as the
second demo. Forks, Linux coding environments, and merge-back are not gates
for demonstrating the repository-free Counter. Runtime and lifecycle
contracts already planned under C1 and IA still apply, with their ownership
reconciled before implementation. Selecting a harness is a bounded part of
the Counter runtime design, not a cross-provider platform project.

Build these two complete journeys before expanding to additional apps,
agent-created subteams, cross-app memory, or multiple concurrent tasks per
agent. An unfamiliar-app fixture can test separation later, but it does
not replace either named demo.

The acceptance journey needs the following distinguishing cases:

- Repeat setup and interrupt it after allocation and after enrollment.
  Recovery resumes the same intended agents without hidden duplicates.
- Change a role revision while one assignment is running. Existing work and
  prepared acts retain their exact bindings. New work uses the new revision.
- Race two agents for one exclusive assignment. The app records one owner,
  and the loser can pick up other work without an invented completion.
- Drop and duplicate a wake, change visibility, and restart during input
  retention. Bounded catch-up preserves inputs and separate progress cursors.
- Close the browser during work, then return from another authorized device.
  The same assignment, saved progress, and observed outcomes remain visible.
- Lose a model reply or tool reply after dispatch. Recovery preserves the
  unresolved attempt and does not automatically repeat its external effects.
- Exhaust a shared allowance with concurrent agents. Further dispatch stops
  within the stated reservation policy, while settlement and saved work remain.
- Reject a model outside the Counter's allowlist through both the setup
  form and a direct runtime request. Remove a model during work and verify
  that no new call uses it under the old policy.
- Use two roles or teams against one Counter budget. Their combined spent,
  reserved, and unspent allocated allowance cannot exceed the app policy. Counter
  reset and reattachment do not grant new spending.
- Show the Counter's complete journey with genuine Workers AI calls and
  no created repository, Git token, fork, or coding container.
- Attach Room agents and automatically initialize their separate forks
  from the configured main destination. Their issue and review records
  stay shared, and their canonical write authority remains host-held.
- Commit a real change in an agent fork and merge it through the Room.
  Verify the canonical result, qualifying evidence, and publication receipt.
  Move main meanwhile and demonstrate explicit integration or conflict handling.
- Dispose during creation, during an unknown push, and after an unmerged
  report. Cleanup stays pending where necessary, and retained evidence survives.
- Revoke an agent or remove its controller. New affected operations stop
  under the specified session and controller policy; earlier outcomes persist.

Synthetic fixtures can inform the design. They do not establish deployment,
model quality, actual provider cleanup, workspace durability, or usability.
Implementation verification follows [the repository testing policy](../docs/testing.md):
focused witnesses at real boundaries, meaningful controls, and one gate
before review. This draft contains no runtime change to test.

## 11. Decisions still needed before implementation

The discussion direction is settled: Cloudflare hosting, role-based counts,
Workers AI as the only initial inference target, model and system prompt
per role, and automatic eligible pickup within budget. Counter comes first,
with one or two user-configured roles constrained by app-admin allowed models
and an app-wide total budget. Counter has no repository. Room comes second,
with automatic individual forks and a verified merge-back to its main
destination. External providers and gateways are deferred.

The following choices remain design work:

- The first direct Workers AI harness, supported model subset and settings,
  deployment pins, and acceptable dependency release status. The initial
  version has no automatic model fallback.
- Exact repository-free Counter enrollment, controller and settings authority,
  selected definition, and genuine output-completion semantics.
- Native Counter turn pickup and deadlines, and later discovery, claim expiry,
  fairness, and reassignment for Room commitments.
- Whether runtime and signer share an object or use a restricted internal
  port, with one custody owner and no broad bearer inside the sandbox.
- Budget unit and period, app-wide allocation and reservation schema,
  conservative Workers AI charge bounds, and unresolved inference usage.
- Initial per-agent Room workspace ownership before the first assignment,
  attachment to holds without duplicate forks, cross-fork transfer and merge
  computation, canonical staging, and exact review or check reuse conditions.
- Saved-work format, checkpoint timing, private conversation access, export,
  retention duration, and preservation of never-merged contributions.
- The authority and liveness mechanism for eventual cleanup after pause,
  revocation, partial provisioning, or loss of the original controller.

Provider references were checked on 15 October 2026. Exact schemas,
numerical budgets, runtime selection, and implementation scope require their
own reviewed decisions. The next adoption should resolve those contracts
without making the ordinary user manage the underlying durable machinery.
