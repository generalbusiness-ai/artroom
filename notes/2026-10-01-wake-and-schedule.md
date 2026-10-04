# Artroom: waking agents on events and on a schedule

2026-10-01. Revision 2, recording hugh's decisions (section 9). Answers hugh's question: what is the simple
version of "trigger this agent when X happens in the room", and how can
a schedule ("cron") do the same for daily housekeeping and reporting
work that needs an agent?

**Kinds of statement.** Facts about Artroom come from `main` at
`8189d66`. Facts about pi-durable come from its announcement. Judgements
are marked **Judgement**; claims nobody has tested are marked
**Untested**.

## 1. Summary

**One pipeline, two sources:**

```
  an act matches a notify rule ─┐
                                ├─► attention item ─► wake ─► the agent runs ─► ordinary acts
  a schedule comes due ─────────┘    (for a member)   (a hint)   (reads attention)   (signed, admitted)
```

- **"When X happens" is a `notify` rule** in the room's policy. This
  exists. It can target a member, a role, the owners, the holder or the
  reviewers.
- **"At 07:00 every day" is a schedule** kept in the repository. When it
  comes due, the room records a system event, and that event puts an
  attention item in the target's queue. This is new.
- **"Trigger this agent" is a wake:** a content-free ping telling the
  agent that its queue has new items. This is new. The agent then reads
  its queue with its own credentials and acts.
- **The queue is the truth; the wake is only a hint.** A lost wake costs
  latency, never correctness. A forged wake costs one read.
- **Nothing gains authority.** A rule, a schedule or a wake grants
  nothing. The agent acts under its own membership and delegation, and
  every act is judged at admission as usual.

**Judgement.** This needs no trigger language, no workflow engine and no
per-agent filters. Policy already decides who should act on what; the
schedule only adds time as one more "what".

## 2. Events: "when X happens"

**This exists.** A `notify` rule (R-POL-5) runs after an act is sealed
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

**One small addition: closing an item by acting on it.** An attention
item has `open: false` "once what it asks for has happened". For a
review request that is clear. For a `policy` or `note` item there is no
act that obviously answers it, so an agent cannot say "done". Proposed
rule: **an open item closes when its addressee records an act whose
`because` cites the item's entry.** `because` already exists on acts.
A report, a note, a claim or a review can each close the item, and the
log shows which act answered which trigger.

## 3. Schedules: "every day at 07:00"

### What a schedule is

A schedule is an entry in `.artroom/schedules.json`. Like policy, it
lives under `.artroom/**`, so changing it needs an admin's approval
(R-ADMIN), and it is versioned and reviewable with the code.

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
| `id` | Stable name. Each firing is identified as `id@scheduledTime` |
| `cron`, `zone` | Standard five-field cron, evaluated in the given IANA zone. Minimum interval: 15 minutes |
| `to` | The same targets as `notify` |
| `text` | The task, in plain words. It becomes the attention item's text and the agent's prompt |
| `scope` | Optional. With issue tracking (documentation plan D1), the firing opens an unheld lane on this scope addressed to `to`, instead of a bare attention item |
| `coalesce` | If the previous firing's item is still open, do not add another; record the skipped firing instead |

### How a firing works

1. **The room's alarm fires** at the next due time across all schedules
   and leases. A Durable Object has one alarm, so the room multiplexes:
   it always sets the alarm to the earliest pending time, as it already
   does for lease expiry.
2. **The room records a system event,** `scheduled`, signed by the room
   key: the schedule ID, the policy version, the scheduled time and the
   actual time. If `coalesce` skipped it, the event says so.
3. **Attention items** go to the targets, with `why: "schedule"`. With a
   `scope`, the firing opens an unheld lane instead.
4. **The targets are woken** (section 4).
5. **The agent does the work with ordinary acts:** notes, claims,
   proposals, landings. Its acts cite the `scheduled` entry in `because`,
   which closes the item (section 2).

### Missed firings

If the room was asleep or restarting, the alarm handler finds firings
whose time has passed. It records **one** `scheduled` event per schedule
for the missed window, with the earliest missed time and a count. It
never runs a backlog of identical jobs.

### Why schedules belong in the room

External cron already works without any new feature: a GitHub Actions
schedule, a system crontab or a Cloudflare Cron Trigger can run
`artroom watch --once` or start an agent directly. That is the
zero-feature option, and the documentation should describe it.

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
| A finding about one lane | A `note` on the lane's act | In the log |
| A report to keep | A file such as `reports/2026-10-02.md`, landed through a lane | In the repository and the log. Policy can exempt `reports/**` from review for the reporter, as it can for documentation scopes |
| A new task | An open item (with D1) addressed to a role | In the log, and in the target's queue |
| Something only people outside the room need | Sent by the agent's own tools | Not in the room; the agent should still note that it was sent |

## 4. Waking

The wake path is the same for events and schedules. Three ways, from
least to most infrastructure; all can be used in one room.

| Way | Where the agent runs | How it is woken | New work |
|---|---|---|---|
| **Watcher** | A laptop, a container, a CI job | `artroom watch --as <member> --exec '<command>'` subscribes to the queue and starts the command once per new item, with the item in `$ARTROOM_ITEM` and a ready prompt in `$ARTROOM_PROMPT`. `--once` drains the queue and exits, for external cron | CLI only (lane E). No contract change |
| **Wake address** | Any server: a Worker, a container platform, a vendor's cloud agent | The member's roster entry has an optional wake address: an HTTPS URL or a service binding. The room sends `{ room, member, cursor }` and nothing else | Small amendment: one roster field, delivery rules |
| **pi-durable** | pi-durable harnesses on Cloudflare Durable Objects, next to the room | A wake address that is a service binding to the harness. The harness submits a message to the agent's conversation with `requestId` set to the item ID, so pi-durable runs each item exactly once however often it is woken | The pi-durable integration design (request `3f23ea89`) |

Commands for the watcher, by harness:

| Harness | Example `--exec` |
|---|---|
| Claude Code | `claude -p "$ARTROOM_PROMPT"` |
| Codex | `codex exec "$ARTROOM_PROMPT"` |
| pi | `pi -p "$ARTROOM_PROMPT"` |
| Any script | `./triage.sh` reading `$ARTROOM_ITEM` |

Each agent also needs its room credential (the MCP bearer token or a key
file), configured as for interactive use.

**Wake delivery rules:**
1. **At least once, never with content.** The ping carries a cursor, not
   the item. The agent reads `attention` after that cursor.
2. **Debounced.** Several items within a few seconds produce one wake.
3. **Retried with backoff** while the address fails, then marked
   failing. The room shows, per member, the last wake and whether
   delivery is failing. These are operational facts, not log entries.
4. **Never for the member's own acts.**
5. **Signed.** The ping carries an HMAC with a per-member wake secret,
   so a receiver can drop forged pings cheaply. A forged ping would only
   cause a wasted read, but dropping it saves cost.

**pi-durable fit, in more detail. Untested.** pi-durable's documented
features line up with this design:
- `requestId` exactly-once matches the item ID and the firing ID.
- Steering a busy conversation (`whenBusy: "steer"`) lets a new item
  reach an agent that is already working, rather than queueing a second
  run.
- Its approval hooks can wait for an Artroom review or a person's act
  before the agent lands.
- Background tasks suit long housekeeping runs.

The integration design should confirm each of these.

## 5. Safety

**Loops.** Two agents can wake each other forever: A notes, B replies,
A replies. Guards:
- a **wake budget per member** (default: 60 wakes per hour);
- a **budget per lane** (default: 20 wakes per hour across all members);
- when a budget runs out, wakes stop and an attention item goes to the
  admins: "wake budget exhausted for @x on lane L". Items still queue;
  only wakes stop.

**Cost.** Schedules have a 15-minute minimum interval and a per-room cap
(default 20 schedules). `coalesce` defaults to true.

**Authority.** A schedule's `to` and a rule's targets choose who is
asked, not what they may do. An agent asked to land on a scope it may
not touch is refused at admission like anyone else.

**Secrets.** Schedule text is scanned like any act body (R-SEC), since
it becomes part of the log through the `scheduled` event.

**Prompt injection.** An item's text can come from another member's act
(a note). The prompt the watcher builds marks that text as data and says
which member wrote it. Agents must treat it as a request from that
member, not as an instruction from the room.

## 6. What is recorded where

| Fact | Where |
|---|---|
| The rule or schedule | The repository (`.artroom/policy.json`, `.artroom/schedules.json`) |
| That a rule notified someone | The log: `notified` entry (exists) |
| That a schedule fired, or was coalesced or missed | The log: `scheduled` system event (new) |
| That a wake was sent, retried or failed | Room operational state, shown in the UI; not in the log |
| What the agent did, and why | The log: its acts, with `because` citing the trigger |

## 7. Contract changes

One amendment, for checker's review:
1. **Closing by `because`:** an open attention item closes when its
   addressee records an act citing the item's entry.
2. **Schedules:** `.artroom/schedules.json` and its schema; activation
   with policy; the `scheduled` system event; `AttentionWhy` gains
   `schedule`; missed-window and coalescing rules; limits.
3. **Wake addresses:** an optional `wake` field on a member (URL or
   service binding name) and a per-member wake secret; delivery rules;
   budgets and the admin item when one runs out.

The watcher (section 4) needs none of these to start: it works today on
`subscribe` and `attention`.

## 8. Staging

| Stage | Work | Owner |
|---|---|---|
| 1 | `artroom watch --exec` and `--once`; a documentation page for external cron | Lane E, lane M |
| 2 | The amendment's item 1 (closing by `because`) | Planner, then lane A |
| 3 | Schedules (item 2), with housekeeping and weekly-report examples in the default templates | Planner, then lane A; lane F shows schedules and firings |
| 4 | Wake addresses (item 3) and budgets | Lane A, lane E |
| 5 | pi-durable wake through its integration | Request `3f23ea89` |

**Estimate:** stage 1, 1 day; stage 2, half a day; stage 3, 2 days;
stage 4, 1.5 days.

**For the contest.** A recorded demo of "every morning at 07:00 the
housekeeping agent notes stale lanes and files an item for the person
who must decide" shows coordination over time, which the second judging
criterion rewards. **Judgement:** stage 1 plus stage 3 is enough for
that demo.

## 9. Decisions

hugh decided on 2026-10-01, adopting each proposal:
1. **The amendment** (section 7) is adopted, in the order of section 8.
2. **The defaults** stand: 60 wakes per member and 20 per lane, per
   hour; a 15-minute minimum interval; 20 schedules per room.
3. **A schedule may name a prompt from an application pack** (MCP plan,
   L3), so a long task lives in one place. This comes in stage 3.

## 10. Sources

Artroom, on `main` at `8189d66`:
- `docs/protocol.md`: R-POL-5 (`notify` and its targets), R-LOG-13
  (`notified` entries), R-ADMIN (the `.artroom/**` boundary), R-SEC,
  lease expiry by the room's alarm (section 8)
- `packages/contract/src/pagination.ts`: `AttentionWhy`,
  `AttentionItem.open`
- `packages/contract/src/policy.ts`: `NotifyTarget`

Related notes:
- `notes/2026-10-01-mcp-plan.md` (request/mcp-plan): `attention` with
  `waitMs`, application packs
- `notes/2026-10-01-docs-plan.md` (request/docs-plan): D1, open items

pi-durable: "Pi Durable", Earendil, <https://earendil.com/posts/pi-durable/>
