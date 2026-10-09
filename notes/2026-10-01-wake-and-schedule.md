# Artroom: waking agents on events and on a schedule

2026-10-01. Revision 2, recording hugh's decisions (section 9).
Revision 3, 2026-10-04: reconciled with the reviewed clarification
`plans/008-2026-10-03-wake-and-schedule-clarification.md` and the
attention handoff `plans/007-2026-10-03-attention-runtime-handoff.md`,
under request `50d7806a`. The same day, the planner's direction
`fceb27d0` on that revision's open points was applied. Answers hugh's
question: what is the simple version of "trigger this agent when X
happens in the room", and how can a schedule ("cron") do the same for
daily housekeeping and reporting work that needs an agent?

**Kinds of statement.** Facts about Artroom in revisions 1 and 2 come
from `main` at `8189d66`. Facts added in revision 3 come from `main` at
`e6e6782830e0ca8a68f0d11c4d4ece5e4e98c967`, read on 2026-10-03 for
`plans/007` and `plans/008`, unless the sentence names another source
(the `8189d66` tree, the pi spike or the pi-durable announcement). They
are source observations taken from those reviewed plans. Nobody ran a
live wake, a schedule, an external command or a failure reproduction
for this note. Facts about pi-durable come from its announcement.
Judgements are marked **Judgement**; claims nobody has tested are
marked **Untested**.

**Status of each choice.** This note uses six labels:

- **Exists:** present in the source at the named pin.
- **Adopted:** decided by hugh on 2026-10-01 (decision `154f25d8`,
  section 9).
- **Proposed:** planning direction from the clarification. Review
  `8365e4c4` approved it as planning evidence and the planner adopted
  it as planning direction (`6068751a`). It is not a contract, not a
  schema and not an implementation. Its owners still owe the reviewed
  work (section 10).
- **Direction `fceb27d0`:** the planner's answer of 2026-10-04 to the
  open points of revision 3 (read at commit `508ac63b`). It is planning
  direction. It is not a complete independent review, and it is not
  implemented protocol or runtime.
- **Planned:** owed by a stage in section 8. Not shipped.
- **History:** kept as a dated record. It does not limit the scope.

**What revision 3 changed.** Review `2acf4f43` asked for six
corrections to revision 2. Revision 3 makes each one in place:

1. A wake does not move the receiver's read position, and input
   delivery is not proof that work ran once (section 4).
2. Citing an item acknowledges a notice. It does not complete a review,
   a check or requested work (section 2).
3. A firing has an identity, a pinned task and a recovery rule
   (section 3).
4. Coalescing names the unit that is still outstanding (section 3).
5. Wake budgets say what is counted, and wake secrets are private
   (section 5).
6. The watcher is planned, not shipped (sections 3, 4, 7 and 8).

## 1. Summary

**One pipeline, two sources:**

```
  an act matches a notify rule ─┐
                                ├─► attention item ─► wake ─► the receiver reads ─► ordinary acts ─► the room records
  a schedule comes due ─────────┘    or work unit     (a hint)   and keeps its input   (signed, admitted)   the actual outcomes
```

- **"When X happens" is a `notify` rule** in the room's policy.
  **Exists.** It can target a member, a role, the owners, the holder or
  the reviewers.
- **"At 07:00 every day" is a schedule** kept in the repository. When it
  comes due, the room records a system event, and that event puts an
  attention item in the target's queue. **Adopted, not built.** For an
  action request it also creates a unit of addressed work (**Proposed**,
  section 3).
- **"Trigger this agent" is a wake:** a content-free ping telling the
  agent that its queue has new items. **Adopted, not built.** The agent
  then reads its queue with its own credentials and its own saved
  position, and acts.
- **The queue is the truth; the wake is only a hint.** A lost wake
  loses no item, because the item stays in the queue. But a receiver
  that nothing wakes does not run again by itself. The durable hosted
  receiver must name its catch-up path and budget (section 4). A forged
  wake costs one read.
- **A recorded request is not a finished job.** A firing means the
  request exists. An acknowledgment means the notice was received. Only
  the recorded outcome of the work shows that the work was done.
- **Nothing gains authority.** A rule, a schedule or a wake grants
  nothing. The agent acts under its own membership and delegation, and
  every act is judged at admission as usual.

**Judgement.** This needs no trigger language, no workflow engine and no
per-agent filters. Policy already decides who should act on what; the
schedule only adds time as one more "what".

## 2. Events: "when X happens"

**Exists.** A `notify` rule (R-POL-5) runs after an act is sealed
and puts it in the targets' attention queues. Its targets are a member,
`role:<role>`, `owners`, `holder` or `reviewers`. For example:

```ts
rule({ id: "api-bot", on: "propose", notify: ["@api-reviewer"],
       when: "lane.changed[$match(path, 'src/api/**')]",
       text: "Review the API change for authorization mistakes." })
```

The room also makes attention items on its own. Agents can be woken by
these too: review and check requests, objections, `recut-needed`, lease
expiry, unheld lanes, invalidated evidence, unresolved publications and
revert lanes.

### Acknowledging a notice by citing it

An attention item has `open: false` "once what it asks for has
happened". For a review request that is clear. For a `policy` or `note`
item there is no act that obviously answers it, so an agent cannot say
"received".

**Adopted direction:** an act can answer an item by citing the item's
entry in `because`. `because` already exists on acts, and the log then
shows which act answered which trigger.

**Proposed qualification.** Revision 2 said that any citing act closes
any open item. That was too broad. The rule is now:

- Closing by citation applies only to informational `policy` and `note`
  notices whose declared meaning is acknowledgment.
- Only an admitted act by the addressee, citing that notice, can
  acknowledge it. A citation by another member does not count. An
  unsigned statement by a model does not count.
- The contract must name the eligible notice kinds. That choice is open
  (section 10).

**Obligations keep their own rules.** Review, check, generation, lease
and publication items keep their current authoritative rules:

- A claim can show that work started. A note can show receipt or
  progress. Neither satisfies a review, a check or an addressed work
  request.
- Review and check items follow the actual obligation and its current
  generation. **Source** (`main` at `e6e67828`): the room's read code
  computes whether a review or check request is open from the current
  obligations, not from citations.
- A publication item follows the recorded result and its read-back, not
  a claim that a push succeeded.

**Requested work is separate from its notice.** Section 3 says how a
schedule's request is classified. For an action request, a citing act
marks the notice as received and the work stays outstanding.

**What the browser shows.** It shows these outcomes beside activity, as
the browser and cloud plan (`plans/005`) requires. An acknowledged
notice still shows its unfinished work and any publication debt.

**Meaning is fixed when an act is prepared.** The declared kind and
binding kept with a prepared act decide what it means. A later change
of vocabulary must not give a retained act a new meaning, and must not
allow it to be signed again under a new meaning.

## 3. Schedules: "every day at 07:00"

### What a schedule is

A schedule is an entry in `.artroom/schedules.json`. Like policy, it
lives under `.artroom/**`, so changing it needs an admin's approval
(R-ADMIN), and it is versioned and reviewable with the code.
**Adopted, not built.** The example shows the design from revision 2.
The public field encoding stays with the schedule amendment's owner
(section 10).

```json
{ "schedules": [
  { "id": "daily-housekeeping",
    "cron": "0 7 * * *", "zone": "America/New_York",
    "to": ["role:agent"],
    "text": "Housekeeping: list lanes idle for 2 days, expiring leases, unresolved publications and stale open items. Note each finding on its lane; file an item for anything that needs a person.",
    "coalesce": true },
  { "id": "weekly-report",
    "cron": "0 16 * * FRI", "zone": "America/New_York",
    "to": ["@reporter"],
    "text": "Write this week's report to reports/{date}.md: changes landed, review wait times, refusals by rule. Land it.",
    "scope": ["reports/**"],
    "coalesce": true }
] }
```

| Field | Meaning |
|---|---|
| `id` | Stable name for people. `id@scheduledTime` is a readable shorthand for a firing. It is not the firing's identity (see "Slots and firing identity") |
| `cron`, `zone` | Standard five-field cron, evaluated in the given IANA zone. Minimum interval: 15 minutes (**Adopted**). **Proposed:** checked between actual slots |
| `to` | The same targets as `notify`. **Proposed:** resolved to concrete members when a firing is committed |
| `text` | The task, in plain words. It becomes the attention item's text and the agent's prompt. A schedule may instead name a prompt from an application pack (**Adopted**, decision 3 in section 9) |
| `scope` | Optional. With issue tracking (documentation plan D1), the firing opens an unheld lane on this scope addressed to `to`, instead of a bare attention item. Scope says where work may change files or open a lane. It does not say whether work was requested |
| `coalesce` | If the unit that an earlier firing created is still outstanding, do not add another; record the skipped firing instead (see "Coalescing"). Defaults to true (**Adopted**) |

### What a schedule asks for

**Proposed.** A schedule's request is classified when its task
definition activates. There are two classes:

- **An informational notice.** The requested outcome is acknowledgment.
  The qualified citation rule in section 2 applies.
- **An action request.** The requested outcome is work. It uses the
  recorded work lifecycle and the requested result, with or without a
  file scope.

**Direction `fceb27d0`.** The class belongs to the retained activated
task definition and is validated at activation. It must distinguish an
informational notice from an action that requests a result. Scope is
not the discriminator, because action work without a scope exists. The
exact JSON field or rule encoding stays an explicit choice. Its owner
is the existing public wake and schedule amendment, with C1
(`b538c5ea`) and its work-lifecycle dependencies. It is not an orphan
choice, and it creates no new duplicate task.

A task edit that changes the class is a new activation. The earlier
work stays owed.

**The daily-housekeeping example is an action request without a
scope.** It asks for findings, notes on the affected lanes and items
for anything that needs a person. So:

- The room keeps an addressed work identity linked to that firing and
  to its requested outputs. No lane is required.
- A citing acknowledgment marks the notice as received. The work
  identity stays outstanding.
- A recorded result links the requested notes and items to the firing.
  Or it records that the bounded check found nothing that needed an
  output.
- Its completion, and any acceptance by the requester, use the reviewed
  lifecycle owned by N2 and D1 (section 10).
- A model's assertion, a claim or an unaccepted progress report does
  not complete it. Failure, a pause, an uncertain tool or a missing
  output leaves the unit visibly outstanding and recoverable.

**The weekly-report example is an action request with a scope.** It
asks for a report that lands. It is incomplete while the report is only
claimed, proposed or reported. Required reviews, landing, publication
and requester acceptance stay distinct steps.

Cancellation or supersession can end old work without marking it
successful. N2 and D1 own the concrete contract for addressed work and
the rule for a recorded result, for scoped and non-scoped actions.
This note invents no public acceptance field and no new generic
completion act.

### Activation and task meaning

**Proposed.** A firing belongs to one activated task definition.

- **Each activation has its own generation.** It pins the reviewed
  schedule definition, the meaning used to evaluate cron and zone, and
  the resolved task.
- **A pack prompt is pinned.** A prompt named from an application pack
  binds to the activated pack revision and to the digest of its
  resolved arguments and content. Activation validates and scans the
  resolved task before the schedule can be used (section 5).
- **The task is kept.** The room keeps the materialized public task or
  a verifiable immutable reference to it. If that is unavailable, the
  firing is shown as unresolved. The room does not load the latest
  prompt in its place.
- **An edit makes a new generation.** Editing the schedule or the pack
  task it names activates a new generation. Removal deactivates the old
  one. Reusing the same `id`, or reverting to earlier bytes, still
  makes a new generation.
- **An edit is not retroactive.** Firings already recorded, and their
  pending effects, keep their old meaning. They can be cancelled
  explicitly through the work lifecycle. An edit neither cancels nor
  authorizes them.
- **Each slot belongs to one generation.** The new generation starts at
  its activation frontier and replays nothing from before it. The old
  generation covers due slots through the switch or removal frontier.
  The new one covers slots strictly after it. Unfinished evaluation and
  effects of the old generation are kept for recovery, but no old slot
  is created after the old generation's deactivation frontier.

### Slots and firing identity

**Proposed.**

- **A slot is an absolute UTC instant,** computed from the pinned cron
  and zone meaning.
- **A repeated local time gives two slots.** When a local time occurs
  twice, both matching UTC instants are distinct slots.
- **A missing local time gives no slot.**
- The firing records enough to explain the choice. The evaluator and
  the zone rules must stay reproducible for an unfinished window. The
  format of that pin is a contract choice (section 10).
- **Firing identity.** The stable identity of a firing includes the
  room, the activation generation and the slot or window. The
  `id@scheduledTime` spelling from revision 2 cannot tell apart a
  reused `id` or a changed task. Its public encoding stays with the
  schedule amendment's owner.

### How a firing works

1. **The room's alarm fires** at the next due time across all schedules
   and leases. A Durable Object has one alarm, so the room multiplexes:
   it always sets the alarm to the earliest pending time, as it already
   does for lease expiry. **Proposed:** the shared alarm also covers
   pending calculation and effect recovery, and keeps its lease and
   publication duties.
2. **The room captures an evaluation window.** **Proposed.** The
   private due frontier marks the last interval that is conclusively
   accounted for. The window is `(frontier, cutoff]`, inside the bounds
   of the activation. A normal on-time slot produces one firing.
3. **The room records a system event,** `scheduled`, signed by the room
   key: the schedule ID, the policy version, the scheduled time and the
   actual time. If `coalesce` skipped it, the event says so.
   **Proposed:** the event also refers to the activated definition and
   task, and to its slot or window.
4. **Targets are resolved** against the current roster when the firing
   is committed. **Proposed.** The concrete addressed members are kept
   with that firing. A role or team name is not standing permission to
   retarget old work.
5. **Attention items** go to the targets, with `why: "schedule"`. An
   action request also creates its addressed work unit. With a `scope`,
   the firing opens an unheld lane instead.
6. **The targets are woken** (section 4).
7. **The agent does the work with ordinary acts:** notes, claims,
   proposals, landings. Its acts cite the `scheduled` entry in
   `because`. For an informational notice the citation acknowledges
   it. For an action request the citation marks receipt only, and the
   recorded result decides completion.

A recorded firing means that the request exists. It does not mean that
the agent ran or finished.

### Missed firings

If the room was asleep or restarting, the alarm handler finds firings
whose time has passed. It records **one** `scheduled` event per schedule
for the missed window, with the earliest missed time and a count
(**Adopted**). It never runs a backlog of identical jobs.

**Proposed detail.** The summary also records the covered interval and
the actual recording time. The room produces one requested task for
that summary, subject to coalescing. No due slot is silently dropped.

**Direction `fceb27d0`: a missed window that spans an activation
switch.** The activation bounds apply to each missed window. Accounting
is split at the switch:

- Each generation accounts for its own bounded interval. It gets at
  most one summary and one task for its missed slots, subject to that
  generation's coalescing.
- The old and new task meanings are not merged into one request of the
  current generation.
- The boundary slot belongs to one generation only. Unfinished
  evaluation and effects of the old generation recover under their
  retained meaning. No old-generation slot is created after
  deactivation.

This clarifies the reviewed generation and window requirements. It does
not choose a new cron format or storage wire format.

### Recovery

**Proposed.**

- **The window is fixed before calculation.** The room captures and
  keeps the window identity first. If the calculation cannot finish in
  one pass, it saves its progress and resumes the same window. A later
  pass must not enlarge it silently.
- **The clock cannot undo progress.** A clock that moves backwards
  cannot move the accounted frontier back or create a second firing.
  Later windows use the same pinned evaluation meaning.
- **A firing and its effects settle together.** One completed room
  transaction should record the firing, its deterministic room-side
  attention or scoped-work effects, and the settled frontier. After a
  crash, recovery finds that firing and does not record another.
- **Or the effect is kept by key.** If an effect cannot go in that
  transaction, its existing operation owner first keeps a keyed
  completion intent and recovers the same effect. The frontier must not
  look settled while effects are still owed.
- **Creating work is separate from doing it.** Creating an unheld local
  work item is separate from a later claim and from provisioning an
  external fork.
- **One boundary is enough.** This needs one recoverable room boundary.
  It needs no second public outbox and no transaction between the room
  and the agent.

### Coalescing

**Adopted:** `coalesce` defaults to true. Revision 2 tested "the
previous firing's item is still open". That did not say what happens
when one recipient answered and another did not, when the targets
change, or when the firing opened a lane. **Proposed:** coalescing
works on the unit that is still outstanding.

| Form | Unit and behavior |
|---|---|
| Informational bare notice | One outstanding notice unit per activated generation and resolved member. If A acknowledged the earlier notice and B did not, the next firing creates a notice for A and records a coalesced link from B to the earlier notice. Each newly resolved member gets its own unit. A removed recipient gets no new one |
| Action request without a scope | One outstanding addressed work unit per activated generation and resolved member, linked to its firing and requested result. No lane is required. A later firing coalesces against that unit's result and lifecycle (N2 and D1), even if its notice was acknowledged. Each newly resolved member gets its own work unit. Removing a recipient prevents new units. It does not complete or erase old work |
| Scoped work | One shared outstanding work unit per activated generation and resolved task and scope, with the original concrete addressees kept. While it is outstanding, a later firing records a coalesced link to it and opens no new lane. The skipped event names the existing work and its addressees, and the current resolved targets. A change of targets does not reassign or accept old work. N2's explicit reassignment or cancellation is used when needed |

Further rules, all **Proposed**:

- **A new generation asks for new work.** An old generation's
  outstanding units stay visible. They do not block the new
  generation's units.
- **Removal is not success.** Removing a schedule stops future firings.
  It does not say that old work succeeded.
- **Blocked work is shown.** If all addressees lose authority, the
  shared work is shown as blocked, so that an authorized person can
  reassign or cancel it.
- **What decides "outstanding".** For a notice, the qualified
  acknowledgment rule in section 2. For an action request, the
  requested result and the N2 and D1 lifecycle. A claim or a report
  alone does not end it.
- **Example.** A completed the non-scoped housekeeping result. B only
  acknowledged the prompt. The next firing creates new work for A and
  coalesces B's work, which is still owed. The notice state and the
  work state are shown separately.
- **Release.** Accepted completion, cancellation or supersession
  releases a work unit. Cancellation and supersession are recorded as
  unsuccessful terminal outcomes. After release, a later slot may
  create new work.
- **A coalesced summary is accurate.** It says which slots and which
  recipient or work units were skipped, and why. A fan-out that was
  only partly coalesced must not say that every target received new
  work.
- **Turning coalescing off** allows overlapping units on purpose.
  Authority and budgets still apply.

### What is public and what is private

**Proposed.** The public facts are the recorded fired, missed and
coalesced outcomes, their references to the activated definition and
task, their timing and window, and their links to outputs. Evaluation
progress, due frontiers and retry state are private operational state.

### Why schedules belong in the room

External cron needs no room amendment. A GitHub Actions schedule, a
system crontab or a Cloudflare Cron Trigger can start an agent
directly, or start a read adapter that uses the `subscribe` and
`attention` APIs. That is the zero-feature option, and the
documentation should describe it. `artroom watch --once` would also
serve external cron, but that command is **Planned** (stage 1) and is
not shipped (section 4).

**Judgement.** Room-owned schedules are better for shared work:
- they are visible and reviewable in `.artroom/`, not hidden in one
  person's crontab;
- each firing is recorded and attributable, so a report can be traced to
  the schedule that asked for it;
- they go through the same queue and wake path as events, so an agent's
  runner handles both the same way;
- `coalesce` and the wake budget stop pile-ups that a plain crontab
  would cause.

### Reports and housekeeping output

Where an agent puts its output decides what the room keeps:

| Output | How | Kept |
|---|---|---|
| A finding about one lane, and its reason | A `note` on the lane's act | In the log |
| A report to keep | A file such as `reports/2026-10-02.md`, landed through a lane | In the repository and the log. Policy can exempt `reports/**` from review for the reporter, as it can for documentation scopes. The reviews that policy requires, the landing and the publication stay separate steps. **Direction `fceb27d0`:** reports follow the normal proposal and landing process and the reviews that current policy requires. A genuine policy exemption may yield no required human review. That is not a transport bypass, and it is not a new universal review obligation |
| A new task | An open item (with D1) addressed to a role. N2 owns the addressed-work lifecycle | In the log, and in the target's queue |
| Something only people outside the room need | Sent by the agent's own tools. Those tools need their own task authorization and their own recovery for an uncertain effect | Not in the room; the agent should still note that it was sent. A record that a send was attempted is not evidence that it was delivered |

## 4. Waking

The wake path is the same for events and schedules. Three ways, from
least to most infrastructure; all can be used in one room. None
replaces the others.

| Way | Status | Where the agent runs | How it is woken | New work |
|---|---|---|---|---|
| **Watcher** | **Planned** (stage 1). Not shipped | A laptop, a container, a CI job | `artroom watch --as <member> --exec '<command>'` subscribes to the queue and starts the command for each new item, with the item in `$ARTROOM_ITEM` and a ready prompt in `$ARTROOM_PROMPT`. `--once` drains the queue and exits, for external cron. It keeps the recovery boundary below | CLI only (lane E). No contract change |
| **Wake address** | **Adopted**, not built (stage 4) | Any server: a Worker, a container platform, a vendor's cloud agent | The member has an optional wake route: an HTTPS URL or a service binding. The room sends a content-free hint that names the room and the member. A cursor, if the hint carries one, is advisory only | Small amendment: one roster field, delivery rules |
| **pi-durable** | **Adopted**, not built (stage 5) | pi-durable harnesses on Cloudflare Durable Objects, next to the room | A wake route that is a service binding to the harness. The harness submits a message to the agent's conversation with a stable `requestId`, so that a repeated wake resubmits the same input. **Untested:** the announcement says pi-durable deduplicates such a submission; the production receiver still owes that proof (see "What retained input does not prove"). This does not make commands run exactly once | The production durable receiver (C3, `13dfc613`), using `plans/007`. **History:** the pi-durable integration design and spike (request `3f23ea89`) is satisfied and landed (approval `adb239bd`, landing `31da00de`). It is not a production receiver |

**Source: the watcher does not exist yet.** The tree at `8189d66` has
no `packages/cli` files. The CLI command map on `main` at `e6e67828`
has `attention` and the ordinary lane and agent commands. It has no
`watch`, no `--once` and no `--exec`. The `subscribe` and `attention`
APIs are the foundation for the watcher. They are not evidence that
the command shipped. Stage 1 still owes the command, its recovery
behavior and its documentation.

Future stage-1 examples for the watcher, by harness. Until the command
is delivered, mark every `artroom watch` example as a future example:

| Harness | Example `--exec` |
|---|---|
| Claude Code | `claude -p "$ARTROOM_PROMPT"` |
| Codex | `codex exec "$ARTROOM_PROMPT"` |
| pi | `pi -p "$ARTROOM_PROMPT"` |
| Any script | `./triage.sh` reading `$ARTROOM_ITEM` |

**Untested.** These spellings are from revision 2. Nobody checked them
against current CLIs. The full manual (N6) owes cold-run evidence for
each harness example.

Each agent also needs its room credential (the MCP bearer token or a key
file), configured as for interactive use.

### The receiver owns its read position

Revision 2 said the ping carries `{ room, member, cursor }` and the
agent reads `attention` after that cursor. That was unsafe.

**Source** (`main` at `e6e67828`, `packages/room/src/reads.ts`; no
runtime counterexample was run):

- An attention read returns the items with `pos > afterPos`, ordered by
  queue position.
- A page returns the position of its last item.
- Cursor kinds are checked: an updates cursor is not an attention
  cursor.
- Queue position is independent of an entry's sequence. An item made
  later about an older entry must still be delivered.

So if a ping carried the newest position and the receiver resumed from
it, the receiver would skip the very items the ping announced. This is
a gap in an unbuilt design, not an observed production defect.

**Proposed rule.**

- The receiver reads with its own durable attention checkpoint.
- A wake cursor, if included, is an advisory high-water mark. It must
  never become an acknowledged read position.
- A receiver with no checkpoint starts with the first attention page.
- Attention, conversation and subscription cursors mean different
  things. They are not interchangeable.
- A wake does not replace the receiver's saved cursor, authorize tools,
  close an attention item or resume a paused task.

**Direction `fceb27d0`.** A cursor in the hint is optional and advisory.
The room and member identity identify the receiver. The receiver
resumes from its own retained, typed attention checkpoint. Including a
cursor in the hint never advances that checkpoint, and never converts a
conversation or subscription cursor into an attention cursor. The
concrete payload encoding stays with the existing wake and C1 owner.

### The durable hosted receiver

**Proposed,** from the approved handoff `plans/007`. It applies to
every durable hosted receiver. The production runtime C3 (`13dfc613`)
owns the work and still owes the evidence.

1. **Save the page and the position together.** In one agent-owned
   transaction, save the page's items and their dispositions with the
   right page position. Record a disposition for every item passed,
   including one already closed or outside the task's configured work.
   Do not advance past an actionable item whose input or disposition
   could not be saved. Continue with bounded pages while there are
   more.
2. **Fence overlapping drainers.** Serialize ingestion, or fence it by
   starting cursor and local selection generation in the same commit. A
   late drainer cannot move a position back or replace a newer
   selection. Its retained work can be retried with the same item
   identities.
3. **Keep a pending input before submitting it.** Its identity includes
   the room, the agent member, the task or conversation, and the
   attention item. The exact encoding is an implementation choice, not
   a new public act field. A retry after either submission crash window
   reuses that identity: a crash before submission, or a crash after
   submission and before the delivery receipt.
4. **Keep the author.** Keep the source entry and the author through
   storage, submission and rendering. Another member's text stays data
   attributed to that author.
5. **Establish the current view on startup or resume.** Establish the
   current principals and the owned work configuration. If visibility
   changed, or continuity is uncertain, run the fresh scan below.
6. **Check before delayed dispatch.** Before acting on a delayed item,
   read the current obligation, task authority, lease and workspace
   epoch. An old proposal, a superseded obligation or lost authority
   can make the request obsolete. The runtime then records that
   disposition. It does not treat the item as successful work.
7. **Stopped tasks stay stopped.** A paused or attention-waiting task
   keeps its inputs and saved work. Its new tools and lease renewals
   stay stopped, as already specified. A wake cannot grant a resume. A
   browser disconnecting does not, by itself, stop authorized hosted
   work.

This uses the durable-input and scheduling owners that C3 already
requires. It adds no second public outbox and needs no transaction
across the room and the agent.

### Catch-up

**Proposed.**

- **After a lost wake.** "The queue is the truth" does not, alone, make
  a receiver run again. An authorized active task's bounded alarm and
  input loop supplies the catch-up: it drains retained inputs and
  checks for new attention. The production design must name that path
  and its budget.
- **After a delivery budget runs out.** The queue stays readable and
  the delivery failure is shown (section 5).
- **After visible work changes.** An acknowledged cursor covers the
  items delivered under the receiver's former view. It does not prove
  that all work visible under a changed role, team or work filter was
  considered. **Source** (`main` at `e6e67828`): attention reads use
  the current member, teams and role with an exclusive queue position.
  The room stores some `role:admin` and team rows, and a role or team
  change need not reissue an older row. Policy role targets expand to
  member handles when evaluated, so this does not describe every role
  notification. These are source observations. They are not an observed
  failure, and they do not claim that the current read contract is
  broken.
- **The fresh scan.** When its principal or work selection changes, the
  receiver runs a bounded, resumable scan of currently visible
  attention, without the ordinary resume cursor. It saves each scan
  page and its position through the same durable-input boundary, and
  keeps a local selection generation with both ingestion and scan
  progress. Scan progress is kept separate from ordinary progress, so
  an earlier scan page cannot move the ordinary cursor back. If the
  selection changes during a scan, the scan restarts for the new
  selection generation.
- **Skipped items are reconsidered.** An item skipped only because of
  the former filter may become pending input. Inputs already submitted
  or completed stay deduplicated. A former filter exclusion is not
  permanent completion.
- **A spent scan budget is pending work.** It is shown and resumed
  through the named alarm path.
- **Pause and revocation still apply.** They still stop new mutating
  tools. Retaining input does not resume a task.
- **Excluding earlier work is a contract choice.** If earlier work is
  to be left out on purpose, that needs an explicit reviewed choice.
  An incremental page does not stand for all current work.
- **How a change is detected.** C3 must name how it detects a change,
  through authoritative current room reads or observed roster changes.
  A content-free wake or an unchanged browser connection is not proof
  that visibility stayed the same. This note adopts no public field
  encoding and no new read contract. The design must not imply that
  `main` already returns a principal revision.

### What retained input does not prove

- Input retention, or a repeated submission identity, does not prove
  that a command, an external side effect, a review or a landing
  completed.
- A delivery record means the input was retained or submitted. The
  conversation may still wait, refuse, pause or ask for attention. Its
  tools still pass through the operation ledger and the current task
  authority, lease and workspace epoch fences.
- Three boundaries are separate: deduplicated conversation input, exact
  replay of a signed act, and reconciliation of a command's effect.
  Workspace saves and unknown-command settlement keep their own
  boundaries from the browser and cloud plan (`plans/005`), C1 and C3.
  A completed command is not a durable workspace checkpoint.
- Retaining input does not grant fresh tools after authority is
  revoked. C1 and C3 already say who can control a task. Revoking
  device A while owner device B stays active can leave hosted work
  active. Removing the owner or its last active key stops new tools,
  broker writes and renewals. A reconnecting device reads the durable
  task and room state. It need not rebuild work from a wake history.
- The production receiver must demonstrate both submission crash
  windows and author provenance at its actual durable boundary.
  **Source** (the pi spike, as read for `plans/007` on 2026-10-03):
  its `Agent.run()` submits a caller-provided `requestId` and waits
  for the answer, and its README lists the autonomous alarm loop and
  the attention bridge as not built. The spike is not that proof.

### The local watcher's recovery boundary

**Proposed.** The watcher needs the same honest boundary for `--exec`.

- Before launching a command, it saves the item's disposition and the
  intent to start the command. Afterwards it saves the result.
- After an uncertain launch or a lost result, it reconciles a retained
  execution handle when it can. Otherwise it shows the uncertain
  command and stops automatic repetition.
- A command explicitly declared safe to retry may be retried. Arbitrary
  shell text is not safe merely because the input identity repeats.
- A watcher that claims interruption recovery needs a durable spool. A
  disposable watcher must state its weaker recovery limit.
- `--once` reports a pending or uncertain remainder when its bounded
  drain cannot finish.

### Wake delivery rules

1. **At least once, never with content.** The ping carries no item. The
   receiver reads `attention` from its own checkpoint. A cursor in the
   ping is advisory only.
2. **Debounced.** Several items within a few seconds produce one wake.
   Debounce and rate limits change latency. They do not erase
   obligations.
3. **Retried with backoff** while the route fails, then marked
   failing. The room shows, per member, the last wake and whether
   delivery is failing, to readers with current authority. These are
   operational facts, not log entries. Every retry counts against the
   budgets (section 5).
4. **Never for the member's own acts.** **Adopted.** Scheduled room
   requests still use the ordinary target and budget rules.
5. **Signed.** The ping carries an HMAC with a per-member wake secret,
   so a receiver can drop forged pings cheaply. A forged ping would only
   cause a wasted read, but dropping it saves cost. Verification and
   the receiver's own rate limits reject invalid or replayed pings. The
   wire format for authentication and freshness is open for contract
   review. The secret is private (section 5).

**pi-durable fit, in more detail. Untested.** pi-durable's documented
features line up with this design:
- A stable `requestId` deduplicates the submission of an input. Its
  identity is scoped to the room, member, task or conversation, and
  item. **Source:** the announcement describes submission deduplication
  separately from interrupted tools: safe calls may rerun, and other
  interruptions are reported. This note does not claim that arbitrary
  command execution is exactly once.
- Steering a busy conversation (`whenBusy: "steer"`) lets a new item
  reach an agent that is already working, rather than queueing a second
  run.
- Its approval hooks can wait for an Artroom review or a person's act
  before the agent lands.
- Background tasks suit long housekeeping runs.

The integration design should confirm each of these.

**A wake is not a notice to a person.** An agent wake is a content-free
runtime hint. A notification to an absent person needs its own reviewed
delivery, consent and disclosure rules. N7 (`64e9d131`) owns that.

## 5. Safety

**Loops.** Two agents can wake each other forever: A notes, B replies,
A replies. Guards (**Adopted** values):
- a **wake budget per member** (default: 60 wakes per hour);
- a **budget per lane** (default: 20 wakes per hour across all members);
- when a budget runs out, wakes stop and an attention item goes to the
  admins: "wake budget exhausted for @x on lane L". Items still queue;
  only wakes stop.

**How a wake is counted. Proposed.**
- The window is a rolling 60 minutes in absolute time.
- One attempted outbound delivery to one member's route is one wake.
- Every retry counts, because it uses delivery work.
- A debounced batch counts once per recipient. Two recipients are two
  deliveries.
- Each delivery is charged once to every distinct lane in its batch.
  Work with no lane is charged to the member budget only.
- The lane limit of 20 per hour is shared across recipients and
  delivery routes.
- The attempt is reserved in private durable budget and retry state
  before sending. An uncertain send keeps its charge.
- A hint held back by an exhausted budget was not sent. It is not
  charged until an attempt is reserved.
- A clock that moves backwards cannot free a reservation early. The
  storage algorithm and bounded clock handling belong to the delivery
  owner.

**When a budget runs out. Proposed.**
- The queued input and the pending content-free hint are kept.
- The affected budget and the next eligible time are shown through
  authorized operational status.
- The admin notice is coalesced per affected budget key until capacity
  returns. Retries must not cause a storm of alerts.
- A wake for that alert obeys the same budgets.
- Closing the alert does not allow pending work to be dropped or a
  limit to be bypassed.

**What wake limits do not bound. Proposed.** They do not bound a local
watcher's command starts, or C3's catch-up pages and tools. Those
owners apply the bounded command, input and tool work they already
owe. They keep unfinished work and show a pending remainder.

**Cost.** Schedules have a 15-minute minimum interval and a per-room cap
(default 20 schedules). `coalesce` defaults to true. **Adopted.**

**Authority.** A schedule's `to` and a rule's targets choose who is
asked, not what they may do. An agent asked to land on a scope it may
not touch is refused at admission like anyone else. HMAC
authentication, an admin-approved prompt and text attributed to another
member grant no admission authority. Hints that were already delivered
authorize no tools.

**Secrets in schedule text.** Schedule text is scanned like any act
body (R-SEC), since it becomes part of the log through the `scheduled`
event. **Proposed:** R-SEC also applies to the materialized pack prompt
and its arguments, at activation and before public materialization. A
pack change needs new validation and a new activation. A retry uses the
old retained task meaning. The room keeps who wrote the content and
which reviewed pack supplied it. Model and tool credentials stay out of
public prompts and task history.

**Wake secrets and routes. Proposed.**
- **Public:** the roster may show that a wake route is configured,
  using a safe non-secret route reference.
- **Private operational data:** the actual endpoints, binding
  resolution, HMAC secrets, route generations, provisioning and
  rotation, due, budget and retry records, and delivery diagnostics.
  Private reads follow current authority.
- An HTTPS URL that contains a token is not safe public metadata.
- A secret must never enter roster history, schedules, the public log,
  act receipts or error diagnostics.
- A secret is provisioned through an authenticated private control path
  between the authorized room operator or member and the receiver.
- A routing change needs current authority and makes a new route and
  secret generation. An untrusted hint cannot change a route.
- On replacement, removal or revoked routing authority, the old
  generation is rotated or retired at once and its dispatch retries are
  cancelled. A new route can later catch up from the durable queue.
- Access follows current member and device authority, not possession of
  a route URL.
- **Direction `fceb27d0`:** "per-member" names the scope of authority
  and delivery. "Route and secret generation" names its version.
  Neither settles whether a member has one active route or several.
  That cardinality stays open, with the existing wake, C1 and private
  delivery owner. The requirements for immediate retirement or rotation
  and for current authority stay.

**Prompt injection.** An item's text can come from another member's act
(a note). The prompt that the planned watcher builds marks that text as
data and says which member wrote it. Agents must treat it as a request
from that member, not as an instruction from the room. **Proposed:** every
receiver keeps that attribution through storage, submission, rendering
and retry (section 4).

## 6. What is recorded where

| Fact | Where |
|---|---|
| The rule or schedule | The repository (`.artroom/policy.json`, `.artroom/schedules.json`) |
| That a rule notified someone | The log: `notified` entry (exists) |
| That a schedule fired, or was coalesced or missed, with its activated definition, task reference, window and output links | The log: `scheduled` system event (new) |
| Schedule evaluation progress, due frontiers and retry state | Private room operational state; not in the log |
| That a wake was sent, retried or failed; budget reservations | Private room operational state, shown to authorized readers in the UI; not in the log |
| That a wake route is configured | The roster, as a safe non-secret reference |
| Wake endpoints, secrets and route generations | Private operational data; never in the roster history, the log, receipts or diagnostics |
| The receiver's read position, retained inputs and dispositions | The receiver's own durable state; not in the room |
| What the agent did, and why | The log: its acts, with `because` citing the trigger |
| Whether requested work is done | The log: the recorded result and the work lifecycle (N2, D1), not the acknowledgment |

## 7. Contract changes

One amendment, for checker's review. **Adopted** by decision `154f25d8`
in three parts. The qualifications are **Proposed**; no schema or
source change is adopted by this note.

**Direction `fceb27d0`.** The qualified closure, privacy, generation
and recovery limits of the reviewed and adopted `plans/008` are the
current planning guidance. Decision `154f25d8` is kept as the
historical adopted amendment. The planning requirement is distinct from
the implementation and protocol amendment, which is still owed. Raw
route endpoints and secrets are not made public merely because an
earlier roster example used a `wake` field.

1. **Closing by `because`, qualified:** an eligible informational
   notice is acknowledged when its addressee records an admitted act
   citing the notice's entry. The contract names the eligible notice
   kinds. Review, check, generation, lease and publication items keep
   their current rules. Requested work completes by its recorded
   result, not by citation.
2. **Schedules:** `.artroom/schedules.json` and its schema; activation
   with policy, with a generation and a pinned task; the `scheduled`
   system event and the firing identity; `AttentionWhy` gains
   `schedule`; missed-window, recovery and coalescing rules; limits.
3. **Wake addresses:** an optional `wake` field on a member (URL or
   service binding name) and a per-member wake secret; delivery rules;
   budgets and the admin item when one runs out. **Proposed:** the
   roster shows the route only as a safe non-secret reference, the
   secret is private, and the public encoding of the field is open.

The watcher (section 4) needs none of these. It can be built on
`subscribe` and `attention`, which exist. The watcher itself is
**Planned** and is not shipped.

## 8. Staging

All five stages and their order are **Adopted**. Each outcome is still
owed.

| Stage | Still-owed outcome | Owner |
|---|---|---|
| 1 | `artroom watch --exec` and `--once`, with the recovery boundary in section 4; a documentation page for external cron | Lane E, lane M |
| 2 | The amendment's item 1 (qualified closing by `because`) | Planner, then lane A |
| 3 | Schedules (item 2); recorded fired, missed and coalesced outcomes; housekeeping and weekly-report examples in the default templates; application-pack prompts | Planner, then lane A; lane F shows schedules and firings |
| 4 | Wake addresses (item 3), authentication, delivery status and budgets | Lane A, lane E |
| 5 | pi-durable wake through the durable receiver | C3 `13dfc613`, using `plans/007`. Revision 2 named request `3f23ea89` (**History**, see below) |

**Owners and stage labels. Direction `fceb27d0`.**
- The lane letters in the table (lanes A, E, F and M) are historical
  sequencing labels. Current request identities and the owner table in
  section 10 track the live work. There is no assumed one-to-one
  mapping from a lane to a request, and no duplicate commission.
- Request `3f23ea89` is satisfied and landed design-and-spike work
  (approval `adb239bd`, landing `31da00de`). It is credited as history,
  for its bounded source and evidence. It is not an outstanding
  production receiver implementation. C3 (`13dfc613`) owns the
  production durable receiver, using `plans/007`. The other wake-stage
  obligations stay owed; the completed request does not deliver them.
- The stage numbers here are this note's wake stages. Wake stage 5 is
  not stage 5 of the declared-acts work.

**Order with other work.** Test-overhead reduction stays first
(`plans/007`). The acts work needed for the first Jam task
stays ahead of this planning correction. The builder judges first-task
readiness. This note adds no Jam gate. Jam and the complete manual can
then proceed together; later needs and backlog may remain. Full
schedules, wake routes, HMACs and pack prompts are not prerequisites
for C3's own bounded alarm and input loop, unless its chosen mechanism
needs them.

**Estimate. History.** Revision 2 estimated: stage 1, 1 day; stage 2,
half a day; stage 3, 2 days; stage 4, 1.5 days. These figures predate
the corrections. They do not cap the scope.

**For the contest. History.** A recorded demo of "every morning at
07:00 the housekeeping agent notes stale lanes and files an item for
the person who must decide" shows coordination over time, which the
second judging criterion rewards. **Judgement:** stage 1 plus stage 3
is enough for that demo. A smaller demonstration does not reduce the
scope above.

## 9. Decisions

hugh decided on 2026-10-01, adopting each proposal (recorded as
`154f25d8`):
1. **The amendment** (section 7) is adopted, in the order of section 8.
2. **The defaults** stand: 60 wakes per member and 20 per lane, per
   hour; a 15-minute minimum interval; 20 schedules per room.
3. **A schedule may name a prompt from an application pack** (MCP plan,
   L3), so a long task lives in one place. This comes in stage 3.

Review history since then. Dates are from the workroom's timestamps,
in US Eastern time:

| Date | Event | Result |
|---|---|---|
| 2026-10-03 | Handoff `plans/007`, Draft 2 (changes review `40514a0a` on Draft 1) | Approved by `78be0cd1`; adopted as the private runtime planning handoff by `34c5274b` |
| 2026-10-03 | Review `2acf4f43` of revision 2 at `337a449d` (primary `c44e96df`) | Changes requested: six corrections. The decisions above are kept |
| 2026-10-03 | Clarification `plans/008`, Draft 1 | Changes requested by `f965c475`: classify action requests that have no scope |
| 2026-10-03 | Clarification `plans/008`, Draft 2 (request `45065116`, promise `6a209eaa`) | Approved as planning evidence by `8365e4c4`; adopted as planning direction by `6068751a` |
| 2026-10-04 | This revision 3, under request `50d7806a` | Source note reconciled. Not yet reviewed |
| 2026-10-04 | Planner's direction `fceb27d0` on revision 3's open points, read at `508ac63b` | Applied in this note. It resolves editorial questions. It is not a complete independent review, and it closes no original promise |

The approvals of `plans/007` and `plans/008` cover planning evidence
only. They do not approve a protocol schema, a runtime, a functional
delivery or first-Jam readiness. The original request `24711ceb` and
its promise `19a020af` stay owed until this source note passes its own
review and lands.

**Direction `fceb27d0`.** The status line inside the frozen `plans/007`
file ("pending independent design review") is history. Its actual
approval and adoption, in the table above, govern its status.

## 10. Owners and open choices

Names used here: C1 is the hosted coding authority and lifecycle
contract (`b538c5ea`). C3 is the production durable hosted coding
runtime (`13dfc613`). D1 is issue tracking in the documentation plan.
N2 is the addressed-work and requester-acceptance lifecycle
(`9c43c173`). N6 is the complete manual (`db2fd146`). N7 is attention
delivery to an absent person (`64e9d131`).

| Work or choice | Owner and next evidence |
|---|---|
| Correcting and integrating this source note | Original `24711ceb` and `19a020af`. The clarification was reviewed first; this revision carries it. Completion is not claimed here |
| Public identity of a schedule, firing and wake; eligible notice kinds; authentication and freshness; safe route references | The wake and schedule amendment, reconciled with C1 and with declared acts. The exact public encoding is open |
| The concrete payload encoding of the hint, including an optional cursor | The existing wake and C1 owner (direction `fceb27d0`). A cursor is optional and advisory |
| The JSON field or rule that encodes a schedule's class (notice or action request) | The existing public wake and schedule amendment, with C1 and its work-lifecycle dependencies (direction `fceb27d0`). Open |
| Whether a member has one active wake route or several | The existing wake, C1 and private delivery owner (direction `fceb27d0`). Open |
| Atomic or keyed recovery of firing, effect and frontier; reproducible cron and zone meaning | The stage 3 schedule owner. A bounded design must name its actual storage and evaluator boundary before implementation review |
| Durable receiver, and the alarm and input budget | C3, using approved `plans/007`. It must prove real storage and submission recovery under current authority, not a mock wake |
| Scoped and non-scoped action work; accepted result, reassignment and cancellation | D1 and N2, with the schedule owner. Their separately reviewed lifecycle and authority are preserved. Scope is optional. An acknowledgment does not replace an action result |
| Watcher and harness instructions | Stage 1 CLI and documentation owners, and N6. Distinguish real command support from examples |
| Private control of routes and secrets; authority for raw reads | C1 and the stage 4 delivery owner |
| Notifications to an absent person | N7. An agent's wake configuration gives no consent for delivery to a person |

The UTC-slot, activation, coalescing and budget rules above are
planning direction. The exact schema and the provider mechanisms are
open. No new implementation request follows from this note.

## 11. Acceptance scenarios for the eventual implementation

**Proposed.** None of these has been run.

| Scenario | Required outcome |
|---|---|
| Lost and duplicate hints, both submission crash windows, a late drainer, and changed principals or filter | The real receiver keeps its own checkpoint, one retained input identity and the original author. The bounded scans and fences of `plans/007` recover pending input. A storage failure leaves the earlier cursor intact. The hint never moves the acknowledged cursor. No claim that an effect completed follows |
| More items than one page, with a new item about an older entry; a restart between pages; overlapping drainers finishing out of order | Every required item has a durable disposition. The read position skips neither the later queue item nor the rest of the page. A stale page cannot move back the progress or the newer selection generation |
| An open team item at queue position 10 before the agent joins the team; a direct item at position 20 with the ordinary cursor saved | Joining makes item 10 visible without reissue. The fresh scan retains and submits it once. A restart or repeated scan reuses its identity and does not move the ordinary cursor back. A change of work filter reconsiders a formerly skipped item. A spent scan budget resumes. Revocation before dispatch prevents new mutating tools |
| Another member's text delivered through the real receiver's storage and submission boundary, then interrupted and retried | The durable input keeps the source entry and the author. The conversation receives it as that author's data, not as room authority |
| An input delayed until its proposal is superseded or authority is revoked; a wake after a pause; the browser closed while the task is active | The runtime records why it cannot act. It counts no obligation as met and starts no new mutating tool. The paused task stays paused. Closing the browser does not pause the task |
| An arbitrary watcher command interrupted around launch or result | A saved start intent and the actual execution or result boundary show the uncertainty. An unclassified command is not launched again automatically. A safe retry stays possible |
| A claim or note cites a review, check, publication or action request | Acknowledgment and progress stay separate from qualified room outcomes and requester acceptance. A report file reaches normal review, landing and publication. An uncertain command or act stays unsettled until its own reconciliation gives evidence |
| Schedule activation, edit, removal and a reused ID during a pending window | Old work keeps its task meaning and effects. Generations and frontiers prevent duplicated or retroactively changed firings. Pending evaluation resumes without silently changing the window |
| A restart after a firing and before its attention, work or frontier completes | The same recorded firing and keyed effects settle. No duplicate task and no forgotten due window. Lease and publication alarms are still served |
| A repeated or missing local time, and a long missed interval | UTC slots follow the pinned meaning. A bounded calculation resumes and records one accurate missed summary and task, with the earliest time, the count and the covered interval |
| A answered and B did not; target membership changes; shared scoped work stays open | Per-member notice and action fan-out, and shared-work coalescing, give accurate output links. New membership does not reassign old work. Cancellation or supersession is not success |
| Daily housekeeping has no scope: A completes its recorded findings and outputs, B only acknowledges the prompt | A's next work unit is created. B's outstanding work is coalesced and visible despite the acknowledgment. The result links the required lane notes and person items, or a qualified no-findings outcome, to its firing. A restart, failure or pause does not erase owed output. No lane and no invented public acceptance field is required |
| A failed and retried multi-lane fan-out, and an exhaustion alert | Member and lane attempt accounting survives an uncertain send. Limits stay at the adopted values. Alerts coalesce. Pending hints and input stay visible and recoverable |
| Route or secret rotation, revoked authority, a delayed hint and a changed pack prompt | The old dispatch generation is retired. Hints grant no tools. Public history and diagnostics hold no secret. An old firing uses its pinned, scanned task with author provenance |

Validate the eventual implementation with focused witnesses at these
durability, authority and effect boundaries, at the actual agent
storage and submission boundary and the room read boundary. A mock
wake alone cannot prove durable delivery. Reuse the approved
`plans/007` evidence where it is unchanged. This note needs no runtime
suite, install, repeated root gate or per-field mutation inventory.

## 12. Sources

Artroom, on `main` at `8189d66` (revisions 1 and 2):
- `docs/protocol.md`: R-POL-5 (`notify` and its targets), R-LOG-13
  (`notified` entries), R-ADMIN (the `.artroom/**` boundary), R-SEC,
  lease expiry by the room's alarm (section 8)
- `packages/contract/src/pagination.ts`: `AttentionWhy`,
  `AttentionItem.open`
- `packages/contract/src/policy.ts`: `NotifyTarget`
- This tree has no `packages/cli` files (review `2acf4f43`)

Artroom, on `main` at `e6e6782830e0ca8a68f0d11c4d4ece5e4e98c967`
(read 2026-10-03, for revision 3):
- `packages/room/src/reads.ts`: attention reads with exclusive queue
  positions and current principals; review and check openness from
  actual obligations and generation
- the CLI command map: `attention` and ordinary lane and agent
  commands; no `watch`, `--once` or `--exec`

Reviewed planning evidence. This note writes `plans/007` and
`plans/008` as short names for the first two files below. On 2026-10-04
the `plans/` files named here are in the planner's working copy and
are not on this branch. The frozen copies of the first two are
attachments in the workroom:
- `plans/008-2026-10-03-wake-and-schedule-clarification.md`: 26,682
  bytes, SHA-256
  `bb4eedbd29bae8834a903471c144dded1a32f8dc7e440edda32382ecd073facc`;
  primary `3ee468ec` at `649b7cd8`,
  `attachments/2026-10-03-wake-and-schedule-clarification-draft2.md`
- `plans/007-2026-10-03-attention-runtime-handoff.md`: 14,606 bytes,
  SHA-256
  `6b0cb9cd9f8079ed0ff21d5b3d13bb3838bfb2c5678f8a930cbf7f40d068ca5d`;
  primary `c85631b5`, attachment commit `7f3cb69d`,
  `attachments/2026-10-03-attention-runtime-handoff-draft2.md`
- Revision 2 of this note at
  `337a449daafe1a347cd69fc755b9be1ade7860dc`: 14,179 bytes, SHA-256
  `6754f5d87b280441adfcee0f7874ae97a79af6005cd8f987a3d5289def764598`
- `plans/005-2026-10-03-browser-cloud-work.md` (short name
  `plans/005`): named by the clarification for browser outcomes and
  workspace boundaries. It was not reconciled into this note

Related notes:
- `notes/2026-10-01-mcp-plan.md` (request/mcp-plan): `attention` with
  `waitMs`, application packs
- `notes/2026-10-01-docs-plan.md` (request/docs-plan): D1, open items

pi-durable: "Pi Durable", Earendil, <https://earendil.com/posts/pi-durable/>
