# Hosted Counter agents: contracts for the first demo

15 October 2026. Planner draft for checker review. Not reviewed.

Parent design: [hosted agent teams](2026-10-15-hosted-agent-teams-design.md),
revision 2, sections 10 and 11. Source baseline: main `85cd430b3`. This
note answers the first three design steps of section 10 for the Counter
only: enrollment and settings authority, model and budget enforcement, and
runtime and controls. It commissions nothing; each slice in section 8
needs its own reviewed request.

## 1. Summary

- A new app scope, `agent-team`, attached to one exact Counter, holds the
  policy (allowed models, app ceiling), one or two roles, and agent rows.
- A new Counter definition, `counting-utterances`, adds the act `say`. Its
  admitted entry is the agent's output. `fulfill` still means speech.
- Rooms use the existing invitation-key cohort. No platform definition or
  existing pin changes.
- An admin creates each agent member and invitation and is its controller.
  The host creates and enrolls the agent's key.
- One host Durable Object for each attached Counter holds the agent keys,
  the ledger and the turn loop. It has no bearer and no signing route.
- The unit is the estimated Neuron, for the life of the attachment. Each
  call is reserved before the agent commits to a turn, and settled after.

## 2. Facts this note relies on

| Fact | Source |
|---|---|
| A Counter turn is open to any active participant. The scope accepts one `commit` and refuses the others. With more than one active participant, the last speaker cannot commit next | `apps/counter/commitments.ts:268-290` |
| A commitment sets a 30-second deadline. `fulfill` must take effect before it. Timers then expire the promise and pause the board | `commitments.ts:300-303`, `:324`, `:453-467` |
| Fail and cancel pause the board. Only the controller can start it again | `commitments.ts:370-376`, `:228-244` |
| The Counter allows 16 live participants, humans included | `commitments.ts:45-53` |
| The browser fulfils only after speech ends | `apps/counter/browser/voice-controller.ts:394-401` |
| The Counter page accepts only directory@6 and membership@5 | `apps/counter/browser/device-key.ts:19` |
| The invitation-key cohort is the application cohort with register@10, directory@9 and membership@6 | `packages/platform/src/invitation-key.ts:9-12` |
| directory@9 keeps the application factory, `establish-application` | `invitation-key.ts:58-63`, `packages/platform/src/application.ts:56-76` |
| The factory refuses a definition that declares capabilities. It passes JSON genesis values and the signer as `opener` | `application.ts:93-104`, `:41-54` |
| membership@6 has no member or key cap of 16. membership@5 has | `invitation-key.ts:34-38`, `packages/platform/src/membership.ts:550-557` |
| `add-member` of an agent needs `membership.manage` and names an active person as controller | `membership.ts:415-449` |
| `invite-key` needs `membership.invite`. With membership@6, `enrol` carries only `invitation` and `proof` | `membership.ts:360-378`, `invitation-key.ts:30-33`, `:46-55` |
| Every act of an agent except a comment is refused unless its controller is active with an active key | `packages/derive/src/grant.ts:309` |
| `set-actions` replaces a role's list. Any well-formed action name is accepted, and a grant is that name in the signer's list | `membership.ts:472-480`, `packages/platform/src/membership-actions.ts:14-19`, `grant.ts:306` |
| Hosted creation keeps a seed in Durable Object SQLite, behind creation fences, and enrolls under custody | `packages/mcp/src/hosted.ts:179`, `:299`, `:408-446` |
| Hosted control is signed. Only `membership.manage` or the agent's controller passes | `hosted.ts:93-102` |
| Retiring a hosted MCP agent does not revoke its key or delete its seed | `hosted.ts:502-515`, `docs/mcp.md:1517-1519` |
| The scope deduplicates by the intent's actor and idempotency key. `settle` reads back an outcome without admitting anything | `packages/scope/src/core.ts:558-566`, `:735-750`, `packages/derive/src/judge.ts:214-219` |
| A head stream exists. It needs a read session of at most 600 s, and restarts close it | `packages/scope/src/worker.ts:43`, `packages/scope/src/sessions.ts:82`, `:421-458` |
| Rule expressions may call `sum`, `contains` and `lookup`, and use `in` and `&` | `packages/derive/src/rule/profile.ts:22-25`, `packages/derive/src/rule/evaluator.ts:38` |
| No effect writes a computed value. A computed value enters as a proposal that a rule checks | `docs/roadmap.md:273-276` |
| No deployed Worker configuration has an AI binding | `apps/room/wrangler.jsonc`; only `spikes/pi-durable/wrangler.jsonc:25` |

## 3. The Counter definition and its output

The design forbids reporting a generated number as completed speech
(design, section 1). A hosted agent has no speaker. This note selects a
written utterance as the agent's genuine output.

**Decision: a new declared definition, `counting-utterances`.** It is
`counting-commitments` with these changes, and no others:

- The promise gains a value `utterance`, text of 1 to 200 bytes.
- A new act `say`, grant `counting.say`, has the guards and effects of
  `fulfill`. It also takes the field `utterance`. Its rule
  `utterance-plan` adds `$contains(fields.utterance, "" & fields.n)` to
  `resolution-plan`. It records the utterance on the promise and settles
  it.
- `board.lastFulfilledAt` accepts facts of kind `fulfill` or `say`.

The admitted `say` entry is the output, so no side effect is claimed. A
person can still fulfil by speech in the same Counter. The agent role's
list holds `counting.participate`, `counting.activity`, `counting.commit`,
`counting.say` and `counting.fail`, and not `counting.fulfill` or
`counting.control`. The old definition and its pin
(`apps/counter/commitments-pin.ts`) do not change.

## 4. Policy settings authority: the `agent-team` scope

**Decision: settings live in a separate app scope, not in the Counter.**
The Counter's rules stay game rules. The team records do not depend on the
Counter, so the Room demo can reuse them. The factory creates the scope
in the same room (`application.ts:105-114`). Its genesis names the exact
Counter scope and a short team tag.

`agent-team` declares no capabilities, sends nothing and creates nothing.

| Item | Live | States | Holds |
|---|---|---|---|
| `team` | 1 | `ready` | Controller (opener), fixed `app` scope reference, fixed `tag` (2 to 12 of `[a-z0-9]`), `models` (list of up to 8 model IDs), `ceiling`, `allocated`, `policy` (revision), `slots` (last ordinal) |
| `role` | 2 | `running`, `paused`, `retired` (final) | `label`, `model`, `prompt` (up to 4,000 bytes), `revision`, `count` (0 to 8), `allocation`, `live`, and `revisedAt`, the fact of the act that set the model and prompt |
| `agent` | 16 | `allocated`, `retired` (final) | Fixed `role` reference, fixed `ordinal`, fixed planned member as party `agent`, and `mode` once retired |

| Act | Grant | Rule, beside the state guards |
|---|---|---|
| `establish` | factory | Opens `team` with no models, ceiling 0, policy 0 |
| `set-policy` | `agents.administer` | `policy` = old + 1; `ceiling` ≥ `allocated` |
| `add-role` | `agents.configure` | `model in` team models; `allocated` = old + `allocation` ≤ `ceiling`; revision 1 |
| `revise-role` | `agents.configure` | `model in` team models; `revision` = old + 1 |
| `set-count` | `agents.configure` | 0 to 8 |
| `set-allocation` | `agents.configure` | `allocated` = old − role's old allocation + new ≤ `ceiling` |
| `pause-role`, `resume-role` | `agents.configure` | `running` to `paused`, and back |
| `retire-role` | `agents.configure` | `live` = 0. The allocation stays counted |
| `allocate-agent` | `agents.configure` | `ordinal` = `slots` + 1; role `live` + 1 ≤ `count`; member handle = `"@" & tag & "-" & ordinal` |
| `retire-agent` | `agents.configure` | `mode` is `finish` or `now`; role `live` − 1 |

Every computed value is a proposal that a rule checks, as the Counter's
serial is (`commitments.ts:471`). Two devices that race for one ordinal
or one allocation get one success. The loser rereads.

**Owner and revision.** The policy has one owner: the `team` item of the
one team scope that the host attached to the Counter (section 7.1). Its
revision is `policy`. Its exact identity is the fact of the last
`set-policy`. A role revision is the fact at `revisedAt`. It is
immutable, and its prompt bytes are in that entry.

**Who may change what.** An admin's list gets `agents.administer` and
`agents.configure` through `set-actions`. No membership definition
changes. `agents.configure` cannot raise the ceiling or add a model. No
role list that agents hold may contain `agents.*` or `membership.*`.
Otherwise the generic MCP tools for this scope would let an agent change
its own limits.

**Binding of running work.** An assignment keeps the role revision fact
and policy revision current at its reservation, so its prompt and model
never change. Each new call first reads the team item at the current
head and checks the current allowlist and ceiling. A removed model blocks
the next call, not a call in flight or its charge.

## 5. Enrollment, custody and disposal

**Identity.** Each agent is a membership member of kind `agent`, with its
own Ed25519 key. Its handle is fixed by its `agent` row before any
membership act, and is never reused (`membership.ts:197`). Its controller
is the person who created it. That person must hold `agents.configure`,
`membership.manage` and `membership.invite`. In the first version this is
an admin.

**Setup of one row.** Each step can be repeated, and each retains its
identity before it crosses a boundary:

1. The client signs `allocate-agent`. The idempotency key is derived from
   the team, role and ordinal.
2. It signs `add-member` with the handle, kind `agent` and controller
   self. It then signs `invite-key` for that member. Both use the existing
   retained issuance chain (`packages/cli/src/invitations.ts:181-302`).
   With membership@6, no secret enters a signed entry.
3. It sends the private link to the host's enrol route (section 7.1). The
   host checks that the link names the row's handle, the team's membership
   and a controller who holds `agents.configure`.
4. The host makes the seed and enrolls behind the existing creation fences
   (`hosted.ts:179`). It then deletes the invitation seed.
5. The agent's key signs Counter `participate` and `activate` under host
   custody. The host reports the row ready.

**Recovery without duplicates.** On any device, the client compares the
team rows with the membership:

- A row with no member resumes at step 2. A `handle-in-use` refusal is
  adopted only for a kind `agent` member, controlled by the signer, with
  no active key. Otherwise the person retires the row and allocates the
  next ordinal.
- A live invitation whose seed is in no reachable custody is not
  reissued. `dap agents ensure` issues agent invitations for 30 minutes.
  The row waits until `key-invitation-end` lapses it
  (`membership.ts:542`), then step 2 issues a fresh one. No second key is
  enrolled.
- A row with an enrolled key resumes at step 5 in the host, without a
  browser. The host refuses a second link for a row that has a key.

**Custody.** The agent's private seed exists only in that Counter's team
object (section 7). No bearer, MCP session or signing route exists. There
is no sandbox or model-controlled code. The model's output is data, used
only as an `utterance`.

**Disposal.** `retire-agent` starts disposal. With `finish`, the host
completes a pledged turn. With `now`, it aborts the model call and signs
`fail` with `interrupted` while the promise is pledged. It then signs
`deactivate`, and destroys the seed once those acts settle. It keeps the
public key, the operation log and the ledger rows. The team view shows
three separate outcomes: **access ended** (seed destroyed); **membership
cleanup pending**, until the controller's client signs `revoke-key` and
`remove-member`; and **Counter row pending**, until the Counter controller
signs `remove-participant`, because an inactive row counts toward the 16.

**Controller loss.** If the controller is removed or loses their last
active key, the scope already refuses the agents' acts
(`grant.ts:309`). Before each reservation, the host reads the standing,
and stops when `controllerActive` is not true. It sends no model call
that cannot be acted on. Closing a browser changes nothing. No owner
transfer exists.

## 6. Models and budget

**Adapter boundary.** One host module calls `env.AI.run(model, inputs,
{ signal })` and nothing else. A port carries model ID, messages, maximum
output tokens and an abort signal. It returns the text, the reported
usage if present, or an error. Tests use a labelled stand-in for the port.
No external provider, gateway or key exists.

**Catalog.** A versioned host table gives each supported model's ID,
maximum input bytes and output tokens, and estimated Neurons per input and
output token, copied from the published Workers AI pricing when adopted.
A model enters only after an adapter test of its messages and usage
reporting. The effective set is the team's `models` intersected with the
catalog. A catalog update never adds to it. An empty set makes setup
unavailable, by name.

**Unit and period.** Decision: the unit is the **estimated Neuron**, an
integer, priced by the catalog version recorded on each reservation. It
is Workers AI's own unit, so no currency estimate is shown. The period is
the life of the attachment. Only `set-policy` gives more allowance, and it
is recorded. Counter `reset`, agent restart, role revision, and retiring
and re-adding roles do not reset spending, because the ledger is keyed by
the Counter scope (section 7.1).

**Conservative bound.** Before a call, the host builds the exact input
and computes:

`bound = ceil((inputBytes + 256) × inRate + maxOutput × outRate)`

A byte-level tokenizer makes no more tokens than bytes. The 256 bytes
cover message framing. `maxOutput` is sent as the call's own limit.

**Ledger.** One table in the team object's SQLite holds one row for each
attempt. A row records the reservation ID (team, ordinal, promise,
attempt), role, role revision fact, policy revision, model, catalog
version, bound, state and charge. The states are `reserved`, `calling`,
then `settled`, `unresolved` or `released`. The object serializes every
change, so no balance is allocated twice. A new row needs settled charges
plus unresolved and open bounds plus its own bound to fit both the
current `ceiling` and, for its role alone, the role's `allocation`.

**Settlement.** A reply with usage settles at the actual charge under the
row's catalog version; without usage, at the bound. A row found in
`calling` after a restart becomes `unresolved`, charged at its bound for
good, since no query recovers a lost call's usage. A row is `released`
only if it never reached `calling`.

**Refusal by name.** Waiting reasons: `app-allowance-exhausted`,
`role-allowance-exhausted`, `model-not-allowed`, `model-unsupported`,
`controller-inactive`, `counter-full`, `ledger-full`. The agent waits
with its work kept, and no model is called.

**Other finite limits.** For each team: one model call in flight (only one
promise is pledged at a time, so this costs nothing), 30 calls a minute,
and 100,000 ledger rows. For each turn: two attempts at most, the second
only after an invalid utterance. For each call: a 12 s timeout and 6,000
input bytes.

## 7. Runtime and controls

### 7.1 One team object for each attached Counter

The host Durable Object `AgentTeam` is named by the Counter's scope ID. It
holds the attachment (team scope, Counter scope and incarnation), each
row's seed and creation fence, kept signed envelopes, the ledger,
assignment records and read positions. Runtime and signer share this one
object, so each prepared act has one custody owner. It is host code, like
the MCP service. The self-contained apps rule against server code in M1
to M3 applies to packaged apps, not to this runtime.

Routes. Each is signed under a new domain, `artroom-agents-control-1`,
and checked against live standing, as `hosted.ts:93-102` does:

| Route | Who | Effect |
|---|---|---|
| `POST /agents/teams` `{team}` | holder of `agents.configure` | Attach. The host checks that the team's `app` is a `counting-utterances` application in the same directory and membership. It checks that this Counter has no other team and that the tag is unused in the membership |
| `POST /agents/teams/<counter>/agents/<ordinal>/enrol` `{link}` | the row's controller | Section 5, steps 3 to 5 |
| `GET /agents/teams/<counter>` | holder of `agents.configure` or `agents.administer` | Rows, progress, assignments, ledger totals and waiting reasons |

A second team scope for an attached Counter is refused with
`app-already-attached`. Reattachment reuses the same team scope and
ledger.

### 7.2 How an agent learns it may take a turn

The Counter has no assigned speaker, so the turn is the board's state. A
wake is only a hint to read. The object keeps head streams on the Counter
and team scopes under one of its agents' read sessions, renewed before
600 s. A catch-up alarm reads every 5 s while the board is open and backs
off to 60 s while it is paused or finished. No alarm runs while no row is
live or every role is paused. Each wake reads the current heads, so a
dropped or repeated wake loses no work and duplicates none.

An agent is eligible when the board is open with no pledge, its
participant row is active, the count is below the target, and it is not
the last speaker or is the only active participant. These are the
browser's conditions (`apps/counter/browser/model.ts:86-89`). The host
adds three: its role is running, its row is wanted (section 7.4), and its
controller is active. For each board state the object picks at most one
eligible agent, the one that spoke least recently, so it never races its
own agents.

### 7.3 One turn

1. Reserve the bound (section 6). If refused, wait under the named reason.
2. Sign and keep `commit`. The idempotency key is the agent, generation
   and serial. If refused, release the reservation and reread. A lost
   reply is settled through `settle`.
3. Record the assignment: the promise, its `until`, the role revision fact,
   the policy revision, and the reservation.
4. Reread the team item. If the model is no longer allowed or the budget
   no longer fits, release the reservation and sign `fail` with
   `process-error`.
5. Mark the row `calling`, then call the model. The input is the system
   prompt, the target, the number to say, and up to eight recent
   utterances.
6. Keep the reply, then settle the row. The utterance must contain the
   numeral as a whole token. If not, and 12 s or more remain and a second
   reservation fits, make one more attempt. Otherwise sign `fail` with
   `process-error`.
7. Sign and keep `say`, and submit it while at least 3 s remain before
   `until`. If the deadline passes, the scope's timers expire the turn.

### 7.4 Controls

- **Pause and resume a role.** No new commits for the role's agents. A
  pledged turn finishes; abandoning it would pause the board.
- **Drain by count.** Within a role, the live rows with the lowest
  ordinals, up to `count`, are wanted. The rest drain. They finish their
  turn and sign `deactivate`, and stay allocated. When `count` rises
  again, a draining row is wanted again. A retired row never returns.
- **Finish and stop, and stop now.** These are `retire-agent` with
  `finish` or `now` (section 5).
- **App-wide stop.** `set-policy` with an empty `models` list.

All controls are team-scope acts, so they survive restarts without a browser.

### 7.5 Restart recovery

When it wakes, the object reconciles before it decides anything. Every
row in `calling` becomes `unresolved`. A kept envelope with an unknown
outcome goes through `settle`; on not-found, the same bytes are sent
again, and the scope deduplicates them. A kept reply with no `say` goes
on to step 7 of section 7.3 if time remains. A turn whose reply was lost
is not called again: the object signs `fail` with `interrupted` while the
promise is pledged, or the timers expire it. Only then does it read the
heads. It never asks the model to repeat an action.

Durable inputs are the team and Counter journals. The only cursors are
the last examined heads. Each advances only after the decision taken at
that head is stored. Plan 007's rule applies here: a cursor never passes
an unsaved input (`plans/007-2026-10-03-attention-runtime-handoff.md:19-25`).
Every member reads the whole Counter, so the visibility case reduces to
a new read at the next head after a role or control change.

## 8. Where each piece lives, and the slices

| Piece | Home |
|---|---|
| `counting-utterances` definition, bytes and pin | `apps/counter/` beside `commitments.ts` |
| `agent-team` definition, bytes and pin | new `packages/agents/` |
| Team object, routes, catalog, ledger, adapter, turn loop | `packages/agents/`, wired into the scope Worker (`apps/room/fetch.ts`) |
| `AgentTeam` binding, migration and `ai` binding | `apps/room/wrangler.jsonc` |
| Platform definitions | none changed or added |
| Client | a CLI command, `dap agents ensure`, runs section 5 with the existing retained issuance. Settings use `dap act` or the generic MCP tools. The Counter page must accept the new cohort and definition (`device-key.ts:19`), show utterances, and later carry the Agents panel |

The slices are listed in order. Witnesses are the acceptance cases of
design section 10, numbered 1 to 14 in their order there. They run at the
cheapest real boundary (`docs/testing.md`). Each slice runs the gate once.

1. **Definitions:** both declared definitions, pins, validator checks and
   in-memory judgments. Witnesses: 8, scope part (`revise-role` with a
   model outside the list is refused); 9, scope part (two roles cannot
   allocate beyond the ceiling); 3, scope part (one `commit` wins).
2. **Attachment and enrollment:** the team object, attach and enrol
   routes, key custody, Counter `participate` and `activate`, and `dap
   agents ensure`. Witnesses: 1 (interrupted after `allocate-agent` and
   after enrollment, then resumed: one member and one key for each row);
   14 (controller removed: no new reservation; earlier entries stay); no
   MCP bearer reaches a team agent.
3. **Model and budget:** adapter port, catalog, ledger and rechecks.
   Witnesses: 7 (concurrent agents exhaust the ceiling; no further
   `commit`; settled rows stay); 8, host part (a model removed between
   `commit` and call is not called); 9, host part (two roles share one
   ceiling; `reset` and reattachment keep the ledger); 6, model part (a
   restart in `calling` leaves one unresolved charged row, no second call).
4. **Turn loop and controls:** wakes, eligibility, the turn, pause, drain,
   retire and restart. Witnesses: 2 (a revision during a pledged turn
   keeps its prompt; the next turn uses the new one); 3 (two teams race;
   the loser rereads; no `say` without an admitted `commit`); 4 (dropped
   and repeated stream lines; restart between `commit` and the assignment
   record); 6, act part (a lost `say` reply settles to one entry).
5. **Client surface:** Counter page changes and the Agents panel (roles,
   counts, allocation against the remaining balance, progress such as
   "3 requested, 2 ready, 1 needs attention", controls). Witness: 5.
6. **Deployed journey:** the `ai` binding and a deployment; a target of at
   least 20 with genuine Workers AI calls, one role then two. Witnesses:
   10, then 5, 7 and 8 live, and a listing that shows no repository, Git
   token, fork or container created for the agents.

Slices 1 to 4 use the labelled model stand-in; only slice 6 is the demo.

**Out of scope:** Room forks, merge-back and Linux workspaces (cases 11
to 13); external providers and gateways; per-agent limits and model
fallback; multi-app agents, saved memory and agent-created teams;
configurers who are not admins. The repository that room founding creates
today stays: it is a platform gap of the room, not a need of the Counter.

## 9. Decisions made

1. **Output:** a written utterance in a new `say` act, checked by the
   scope, with no claimed side effect (section 3).
2. **Cohort:** the existing invitation-key cohort. The Counter's cap of
   16 bounds capacity, so no platform version is added.
3. **Settings:** a separate `agent-team` scope; grants `agents.administer`
   and `agents.configure` through `set-actions`.
4. **Enroller:** the configuring admin signs the membership acts and is
   the controller. The host never acts for them.
5. **Custody:** one `AgentTeam` object for each Counter holds keys, ledger
   and runtime. No bearer, no signing route, no sandbox.
6. **Unit and period:** estimated Neurons from a versioned catalog, for
   the life of the attachment.
7. **Order:** reserve before `commit`, so a race loser spends nothing and
   an admitted turn always has its call funded.
8. **Lost model reply:** charged at its bound, never repeated; the turn
   fails as `interrupted`.
9. **Wakes:** existing head streams as hints, plus a bounded catch-up
   alarm. No scope runtime change.
10. **Drain:** derived from `count` by ordinal; no extra act. **Model
    tools:** the utterance is the model's only output.

## 10. Decisions left for Hugh or the checker

1. **Hugh:** is a written utterance an acceptable Counter turn for an
   agent? The alternative is an audio adapter, using Workers AI speech
   synthesis and stored audio.
2. **Hugh:** who builds slice 5. On 8 October, Hugh decided that builder
   makes no page or UI changes.
3. **Hugh:** release of the Cloudflare deployment hold, and the `ai`
   binding, for slice 6.
4. **Hugh:** the catalog's models (candidate: the Pi spike's model,
   `spikes/pi-durable/src/live.ts:26`; a second shows a two-model
   allowlist) and the demo's default ceiling.
5. **Hugh:** after a lost reply, should the turn retry, paid by a second
   reservation, instead of failing and pausing the board?
6. **Checker:** whether a team scope kept unique by the host is an exact
   enough owner, or the settings must move into the Counter definition.
7. **Checker:** whether `$contains` with `&` behaves as section 3 needs,
   and whether a factory genesis value may be a `scope` reference
   (`application.ts:35-39` does not exclude it).
8. **Checker:** whether the byte bound on input tokens holds for each
   catalog model, and who may read spending through the status route.

## Source

Written by the planner from the parent design and the files cited above,
with three read-only surveys of the worktree; key citations were checked
at their lines. Nothing was run: no test, gate, deployment or provider call.
