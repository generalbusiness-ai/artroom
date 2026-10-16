# Hosted Counter agents: contracts for the first demo

15 October 2026. Planner draft, revision 2. Revision 1 (`abc7dcd0`) had
checker changes requested; this revision answers findings F1 to F3 and
the architecture and clarification notes of that review. Not yet re-reviewed.

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
  admitted entry is the agent's output: the checked integer `n` is the
  number said, and `utterance` is the agent's free text. `fulfill` still
  means speech.
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
| Rule expressions may call `sum` and `lookup`, and use `in`. `$contains` matches substrings, so it cannot check a whole numeral (checker probe, review of `abc7dcd0`) | `packages/derive/src/rule/profile.ts:22-25`, `packages/derive/src/rule/evaluator.ts:38` |
| A text field's `max` counts UTF-8 bytes of well-formed text | `packages/derive/src/values.ts:41` |
| No effect writes a computed value. A computed value enters as a proposal that a rule checks | `docs/roadmap.md:273-276` |
| No deployed Worker configuration has an AI binding | `apps/room/wrangler.jsonc`; only `spikes/pi-durable/wrangler.jsonc:25` |

## 3. The Counter definition and its output

The design forbids reporting a generated number as completed speech
(design, section 1). A hosted agent has no speaker. This note selects a
written utterance as the agent's genuine output.

**Decision: a new declared definition, `counting-utterances`.** It is
`counting-commitments` with these changes, and no others:

- The promise gains a value `utterance`, text of 1 to 1,024 bytes.
- A new act `say`, grant `counting.say`, has exactly the fields, guards,
  rule (`resolution-plan`) and effects of `fulfill`, plus the required
  field `utterance`, which it records on the promise. It settles the
  promise.
- `board.lastFulfilledAt` accepts facts of kind `fulfill` or `say`.

**The number said is the integer field `n`, not text inside the
utterance.** `resolution-plan` already requires `n` to equal the
promise's number and the board's last number plus one
(`commitments.ts:472`), so the scope guarantees the numeral by equality.
The utterance is the agent's own words for that turn. The scope checks
only its bounds: well-formed text of 1 to 1,024 bytes. It places no
condition on digits, letters, punctuation or script. Screens show `n` as
the number and the utterance as the speaker's text, and never parse a
number out of the utterance. The host applies the same check and no
other, through one shared function, so the host never refuses an
utterance the scope would admit, nor submits one it would refuse.

Revision 1's `$contains` rule is withdrawn: it matched substrings, so
"13" and "x3x" passed for n = 3 (F1). A whole-token rule written in the
restricted profile would be longer and still would not decide what a
numeral is in other scripts; the integer field is the simpler guarantee.

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
in the same room (`application.ts:105-114`). Its genesis names the
Counter by its full ScopeRef, including incarnation, and a short team
tag. The checker's probe showed that the factory carries a declared
`scope` genesis value whole; it does not prove that the named scope is a
Counter of this room, so the host verifies that at attachment (section
7.1).

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
| `set-allocation` | `agents.configure` | `allocated` = old − role's old allocation + new ≤ `ceiling`; may go below the role's charges (section 6) |
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
completes a pledged turn. With `now`, it cancels the local model dispatch
(its charge stays held; section 6) and signs
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
{ signal })` and nothing else. A port carries the model ID, exactly two
messages (the role's system prompt, and one user message with the board
context) and an abort signal. It returns the reply text and the reported
usage, or an error. Tests use a labelled stand-in for the port. No
external provider, gateway or key exists.

**Catalog: a model admission contract.** A versioned host table holds
one entry for each admitted model. Each entry states, and its admission
review justifies:

- **Wire mapping.** The exact input form and parameters the adapter
  sends: messages without `raw`, so the model's own chat template
  applies; the model's own output-limit parameter (for example
  `max_completion_tokens` for the default model and `max_tokens` for
  another, as each model's published schema names it); and how a
  reasoning mode is turned off, where the model has one.
- **Usage mapping.** Where the reply reports input and output tokens, and
  every other charged token category the model's pricing names.
- **`maxInputTokens`.** A finite maximum for the complete provider input
  under that template: the 6,000 content bytes the host allows, plus the
  template's framing and special tokens for the fixed two-message form.
  The entry states its argument (for example, a byte-level tokenizer
  gives at most one token for each content byte, and the template adds a
  counted number of tokens).
- **`maxOutput`.** The output limit sent on every call, 192 tokens for the
  demo, covering every charged output category, reasoning included.
- **Rates.** Neurons per million input and output tokens, copied from the
  published Workers AI pricing on the entry's date.

Admission also needs a recorded test against the real binding: an
adversarial corpus at the byte limit (scripts with many bytes per
character, emoji, long runs of digits and punctuation, and text built to
split badly) in which every reply reports usage in the mapped form,
input tokens at most `maxInputTokens` and output tokens at most
`maxOutput`. A model whose bound cannot be argued and observed this way
is not admitted. The host enforces the 6,000-byte content limit before
each call: the user message drops the oldest utterances until it fits.

**Bound for one attempt.** For entry `e`, the reservation is fixed:
`bound(e) = ceil(maxInputTokens × inRate + maxOutput × outRate)`. Revision
1's universal "bytes + 256" claim is withdrawn (F3).

**Initial catalog (decided 2026-10-15).** Cost-effective models only. The
rates are Workers AI's published Neurons per million tokens, input then
output, read on 15 October 2026; the checker confirmed all four pairs.
Each model still needs its admission entry before it is selectable.

| Model | In | Out | Role |
|---|---:|---:|---|
| `@cf/zai-org/glm-4.7-flash` | 5,500 | 36,400 | Default; used by the earlier agent spike |
| `@cf/meta/llama-3.1-8b-instruct-fp8-fast` | 4,119 | 34,868 | Cheapest instruction model without a reasoning mode |
| `@cf/qwen/qwen3-30b-a3b-fp8` | 4,625 | 30,475 | Second default candidate; reasoning mode off |
| `@cf/google/gemma-4-26b-a4b-it` | 9,091 | 27,273 | Alternative; used by the earlier agent spike |

Larger models (for example the 70B instruction models, about five times
the output rate) and models that need a paid billing method are left out.

**Demo arithmetic.** The planning assumption is at most 512 framing
tokens per model, so `maxInputTokens` ≤ 6,512; an entry whose argued
framing is larger needs this arithmetic redone. Computed by script
(`ceil` of the formula above, `maxOutput` 192):

| Model | Bound for one attempt | Worst turns in 5,000 | Worst turns in 2,500 |
|---|---:|---:|---:|
| Default (GLM) | 43 | 58 | 29 |
| Llama 3.1 8B | 34 | 73 | 36 |
| Qwen3 30B | 36 | 69 | 34 |
| Gemma 4 26B | 65 | 38 | 19 |

"Worst turns" assumes two attempts per turn, each charged at the full
bound. A turn with 2,000 content bytes and 40 output tokens costs at most
24 at reported usage on any of the four. The default `ceiling` stays
5,000 estimated Neurons, half the account's free daily allocation: even
the costliest model in the worst case gives 38 turns, and 19 per role
with two roles at half each, enough for the demo's target of 20. An
admin raises either with `set-policy` or `set-allocation`.

The effective set is the team's `models` intersected with the admitted
catalog. A catalog update never adds to it. An empty set makes setup
unavailable, by name.

**Unit and period.** Decision: the unit is the **estimated Neuron**, an
integer, priced by the catalog version recorded on each reservation. It
is Workers AI's own unit, so no currency estimate is shown. The period is
the life of the attachment. Only `set-policy` gives more allowance, and it
is recorded. Counter `reset`, agent restart, role revision, and retiring
and re-adding roles do not reset spending, because the ledger is keyed by
the full Counter ScopeRef (section 7.1).

**Ledger.** One table in the team object's SQLite holds one row for each
attempt. Its identity is the Counter ScopeRef, the agent's ordinal, and
the board generation and serial that its `commit` proposes, plus the
attempt number. That tuple is fixed before `commit` and is the commit's
idempotency key, so it names one promise once admitted (section 7.3). A
row also records the role, role revision fact, policy revision, model,
catalog version, bound, state and charge. The states are `reserved`,
`calling`, then `settled`, `unresolved` or `released`. The object
serializes every change, so no balance is allocated twice. A new row
needs settled charges plus unresolved and open bounds plus its own bound
to fit both the current `ceiling` and, for its role alone, the role's
`allocation`.

**Settlement.** Charges are never clamped, released or erased once a row
reached `calling`:

- Usage reported in the mapped form, within both maxima: the charge is
  the reported usage at the row's rates.
- Usage absent, malformed (not non-negative safe integers in the mapped
  fields) or above either maximum, or a computed charge above the bound:
  the charge is the larger of the bound and any computable reported
  cost. The object **fences** that model for the team (`model-fenced`):
  no further call to it until a new catalog version re-admits it.
- No reply (timeout, error, abort or restart): the row is `unresolved`,
  charged at its bound for good. An abort or timeout is local
  cancellation only; the provider may still be running and charging, so
  the next attempt may overlap it, and both stay charged.
- A row is `released` only if it never reached `calling`: its `commit`
  was refused, or the recheck before the call failed.

A charge above the bound can leave the app or a role over its limit. The
view then shows the excess, and no reservation fits until an admin raises
the limit.

**Lowering limits.** `set-policy` cannot lower `ceiling` below the sum of
allocations. `set-allocation` may lower a role below what it has already
charged: that is a prospective fence, as the parent design allows for
the ceiling. Nothing is freed or erased. The view shows used, reserved,
and remaining as the allocation minus both, or the amount over. The
allocation sum is a planning rule in the scope; the ledger check at each
reservation is the enforcement.

**Refusal by name.** Waiting reasons: `app-allowance-exhausted`,
`role-allowance-exhausted`, `model-not-allowed`, `model-unsupported`,
`model-fenced`, `controller-inactive`, `counter-full`, `ledger-full`.
The agent waits with its work kept, and no model is called.

**Other finite limits.** For each team: one local dispatch at a time,
30 calls a minute, and 100,000 ledger rows. Provider work abandoned by a
timeout or restart may still run beside the next dispatch; its charge is
already held. For each turn: two attempts at most, the second after a
lost reply or an invalid utterance (section 7.3). For each call: a 12 s
timeout, 6,000 content bytes and the entry's `maxOutput`.

## 7. Runtime and controls

### 7.1 One team object for each attached Counter

The host Durable Object `AgentTeam` is named by the Counter's scope ID. It
holds the attachment (the full team and Counter ScopeRefs, each with its
incarnation), each row's seed and creation fence, kept signed envelopes,
the ledger, assignment records and read positions. A Counter ScopeRef
with the same ID and another incarnation is refused with
`incarnation-mismatch`. Runtime and signer share this one
object, so each prepared act has one custody owner. It is host code, like
the MCP service. The self-contained apps rule against server code in M1
to M3 applies to packaged apps, not to this runtime.

Routes. Each request carries a signed control envelope under a new
domain, `artroom-agents-control-1`, with the same bindings as hosted
control (`hosted.ts:61-77`): action, service, membership ScopeRef,
subject (the Counter ScopeRef and, where it applies, the ordinal), the
actor's key, the body's digest, an operation identity and `notAfter`.
The host verifies the signature and every binding, then checks live
standing, as `hosted.ts:93-102` does:

| Route | Who | Effect |
|---|---|---|
| `POST /agents/teams` `{team}` | holder of `agents.configure` | Attach, after the checks below |
| `POST /agents/teams/<counter>/agents/<ordinal>/enrol` `{link}` | the row's controller | Section 5, steps 3 to 5 |
| `GET /agents/teams/<counter>` | holder of `agents.configure` or `agents.administer` | Rows, progress, assignments, ledger totals and waiting reasons |

**Attachment checks.** The host does not trust the `app` value alone. It
reads the room's directory and requires all of these:

1. The team scope's genesis pins the exact `agent-team` digest, and the
   directory holds an `application` item in state `created` whose
   `definition` is that digest and whose `scope` is the full team ScopeRef
   (`application.ts:80-86`).
2. The same holds for the Counter: an `application` item whose
   `definition` is the `counting-utterances` digest and whose `scope`
   equals the team's `app` value exactly, incarnation included.
3. Both creations name this directory and its membership
   (`application.ts:113`), which is the membership of the signed request.
4. No other team is attached to this Counter, and the tag is unused by
   other teams in the membership.

A second team scope for an attached Counter is refused with
`app-already-attached`. Reattachment reuses the same team scope and
ledger.

### 7.2 How an agent learns it may take a turn

The Counter has no assigned speaker, so the turn is the board's state. A
wake is only a hint to read. Two mechanisms give wakes:

- **Head streams**, on the Counter and team scopes, under one of the
  object's agents' read sessions, renewed before 600 s. They are fast but
  finite: a restart or eviction closes them (`sessions.ts:421-458`).
- **A durable alarm, always set while the Counter is attached.** It reads
  both heads every 5 s while a role is running and the board is open, and
  every 60 s otherwise: board paused or finished, every role paused, or
  no live row. The alarm is Durable Object storage, so it survives
  eviction. Each run reopens any closed stream it can. Its cost is one
  internal head read of each scope, never a model call.

Every wake reads the current heads, so a dropped or repeated wake loses
no work and duplicates none. A team-scope act from any client, including
a generic MCP tool with no browser and no host request, is therefore seen
within 60 s. The team scope sends nothing, so the alarm is what makes
`resume-role` and other controls take effect after a stream is lost (F2).

An agent is eligible when the board is open with no pledge, its
participant row is active, the count is below the target, and it is not
the last speaker or is the only active participant. These are the
browser's conditions (`apps/counter/browser/model.ts:86-89`). The host
adds three: its role is running, its row is wanted (section 7.4), and its
controller is active. For each board state the object picks at most one
eligible agent, the one that spoke least recently, so it never races its
own agents.

### 7.3 One turn

1. Reserve the bound (section 6) under the provisional identity: Counter
   ScopeRef, ordinal, the generation and serial the commit will propose,
   attempt 1. If refused, wait under the named reason.
2. Sign and keep `commit`, with that same tuple as its idempotency key. If
   refused, release the reservation and reread. A lost reply is settled
   through `settle`.
3. When the commit is admitted, bind the reservation to the promise in
   its receipt and record the assignment: the promise, its `until`, the
   role revision fact, the policy revision, and the reservation. After a
   crash between steps 2 and 3, recovery settles the kept commit first:
   admitted binds as here; refused releases. A reservation is never bound
   to a promise that its own commit did not create.
4. Reread the team item. If the model is no longer allowed or the budget
   no longer fits, release the reservation and sign `fail` with
   `process-error`.
5. Mark the row `calling`, then call the model. The input is the system
   prompt, the target, the number to say, and the most recent utterances
   that fit the 6,000-byte limit, up to eight.
6. Keep the reply, then settle the row (section 6). The reply text is the
   utterance; it is valid when the scope's check accepts it (well-formed
   text of 1 to 1,024 bytes). The host does not trim or rewrite it, and
   `n` comes from the promise, never from the text. If the reply is lost
   (timeout, error or restart) or the utterance is invalid, and this was
   the first attempt, 12 s or more remain, the model is not fenced and a
   second reservation fits, make one more attempt with a new reservation
   (attempt 2). The lost attempt's row stays `unresolved`, charged at its
   bound, and its provider work may still be running. Otherwise sign
   `fail` with `interrupted` for a lost reply or `process-error` for an
   invalid one. A model call's output is data until `say` is signed, so a
   retry repeats a charged call, never an action.
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
gets its one retry under step 6 of section 7.3 if it has not used it and
time and budget remain; otherwise the object signs `fail` with
`interrupted` while the promise is pledged, or the timers expire it. Only
then does it read the heads. A retry repeats a model call, never a signed
act.

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
   allocate beyond the ceiling); 3, scope part (one `commit` wins). F1:
   for a promise of n = 3, `say` with `n` 3 is admitted with the
   utterances "3", "13", "x3x", "three!", "३" and an emoji, and records
   each exactly; `say` with `n` 4 is refused; an empty utterance and one
   of 1,025 bytes are refused. The host's shared check gives the same
   answer for each case.
2. **Attachment and enrollment:** the team object, attach and enrol
   routes, key custody, Counter `participate` and `activate`, and `dap
   agents ensure`. Witnesses: 1 (interrupted after `allocate-agent` and
   after enrollment, then resumed: one member and one key for each row);
   14 (controller removed: no new reservation; earlier entries stay); no
   MCP bearer reaches a team agent. Attachment is refused for a team of
   another digest, an `app` that is not a `counting-utterances`
   application of this directory, a Counter incarnation other than the
   application item's, and a second team. A control envelope with a
   changed body, subject or expired `notAfter` is refused.
3. **Model and budget:** adapter port, catalog, ledger and rechecks.
   Witnesses: 7 (concurrent agents exhaust the ceiling; no further
   `commit`; settled rows stay); 8, host part (a model removed between
   `commit` and call is not called); 9, host part (two roles share one
   ceiling; `reset` and reattachment keep the ledger); 6, model part (a
   restart in `calling` leaves one unresolved charged row; the retry
   holds its own reservation). F3, with the labelled stand-in: content
   over 6,000 bytes is cut by dropping the oldest utterances; the entry's
   own output parameter is sent; absent usage, malformed usage and usage
   above either maximum each charge at least the bound, keep the charge
   and fence the model; a cost above the bound is kept unclamped, and no
   later reservation fits. A `set-allocation` below the role's charges,
   made by `dap act` while a reservation is open, keeps that reservation
   and its charge and refuses the next one.
4. **Turn loop and controls:** wakes, eligibility, the turn, pause, drain,
   retire and restart. Witnesses: 2 (a revision during a pledged turn
   keeps its prompt; the next turn uses the new one); 3 (two teams race;
   the loser rereads; no `say` without an admitted `commit`); 4 (dropped
   and repeated stream lines; restart between `commit` and the assignment
   record, which binds the reservation to the admitted promise or
   releases it); 6, act part (a lost `say` reply settles to one entry).
   F2: pause every role, evict the object so its streams close, then
   `resume-role` through a generic MCP tool with no browser and no host
   request; the next eligible turn is taken. Also: an attached team with
   no live rows, then its first `allocate-agent` and enrollment, and its
   first control act.
5. **Client surface:** Counter page changes and the Agents panel (roles,
   counts, allocation against the remaining balance, progress such as
   "3 requested, 2 ready, 1 needs attention", controls). Witness: 5.
   Builder builds it, after the install half of self-contained
   applications M1, on the packaged Counter.
6. **Model admission and deployed journey:** first, each catalog entry's
   admission test against the real binding (section 6); then the `ai`
   binding and a deployment; a target of at least 20 with genuine Workers
   AI calls, one role then two. Witnesses: 10, then 5, 7 and 8 live, and
   a listing that shows no repository, Git token, fork or container
   created for the agents. It waits until the deployment hold is lifted.

Slices 1 to 4 use the labelled model stand-in and labelled stand-in
catalog entries; only slice 6 admits real models and is the demo.

**Out of scope:** Room forks, merge-back and Linux workspaces (cases 11
to 13); external providers and gateways; per-agent limits and model
fallback; multi-app agents, saved memory and agent-created teams;
configurers who are not admins. The repository that room founding creates
today stays: it is a platform gap of the room, not a need of the Counter.

## 9. Decisions made

1. **Output:** the agent's turn is a `say` act. The number said is the
   integer `n`, checked by equality; the utterance is free text with
   bounds only. No audio adapter. Decided 2026-10-15; the numeral form
   answers F1.
2. **Cohort:** the existing invitation-key cohort. The Counter's cap of
   16 bounds capacity, so no platform version is added.
3. **Settings:** a separate `agent-team` scope; grants `agents.administer`
   and `agents.configure` through `set-actions`. The checker accepted this
   owner, with full ScopeRefs and verified factory affiliation.
4. **Enroller:** the configuring admin signs the membership acts and is
   the controller. The host never acts for them.
5. **Custody:** one `AgentTeam` object for each Counter holds keys, ledger
   and runtime. No bearer, no signing route, no sandbox.
6. **Unit and period:** estimated Neurons from a versioned catalog, for
   the life of the attachment.
7. **Order:** reserve before `commit` under the commit's own idempotency
   tuple, so a race loser spends nothing and an admitted turn always has
   its call funded.
8. **Lost model reply:** charged at its bound, then retried once with a
   new reservation if time and budget allow; otherwise the turn fails as
   `interrupted`. Decided 2026-10-15.
9. **Wakes:** head streams as hints, plus an alarm that stays set while
   the Counter is attached, at most 60 s apart. No scope runtime change.
10. **Drain:** derived from `count` by ordinal; no extra act. **Model
    tools:** the utterance is the model's only output.
11. **Page work:** builder builds slice 5. Decided 2026-10-15.
12. **Models and ceiling:** the initial catalog, `maxOutput` 192, 6,000
    content bytes and a 5,000 default ceiling. Decided 2026-10-15; the
    arithmetic is redone in section 6.
13. **Deployment:** slice 6 and the `ai` binding wait until the
    deployment hold is lifted. Decided 2026-10-15.
14. **Admission:** each catalog model carries a finite input and output
    maximum, its wire and usage mapping, and a real-binding test. Usage
    that breaks the entry keeps its charge and fences the model.

## 10. Questions left

The checker answered revision 1's questions in its review of `abc7dcd0`:
the team scope is an acceptable owner; `$contains` does not check a whole
numeral (now replaced); the factory carries a `scope` genesis value whole;
and status reads by live holders of `agents.configure` or
`agents.administer` are consistent with admin-only configuration.

Open for the checker: whether 512 framing tokens is a reasonable
planning cap before each entry states its own (section 6). Open for Hugh:
the admission tests in slice 6 make real Workers AI calls before the
deployment; they need his permission as provider calls, whether or not
the deployment hold covers them.

## Source

Written by the planner from the parent design and the files cited above,
with three read-only surveys of the worktree; key citations were checked
at their lines. Revision 2 adds the checker's review of `abc7dcd0` and
its cited Workers AI model and pricing pages. Nothing was run: no test,
gate, deployment or provider call. The arithmetic in section 6 was
computed by a short script from the stated rates.
