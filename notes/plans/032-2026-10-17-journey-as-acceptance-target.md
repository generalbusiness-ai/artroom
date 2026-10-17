# 032: The journey as acceptance target

Planner, 17 October 2026. A sequencing plan. It commissions nothing; each
piece below needs its own request. Source facts cite `path:line` at main
`698a3d713`.

## 1. Direction

The project's direction: flexible shared workroom surfaces inside the
person's AI chat app, supported by cloud-hosted agents and by connections
to other people, built into an offering people can rely on for real work.

One journey is the acceptance target for the next stretch of work:

1. Start a repository change and hand it to cloud agents.
2. Leave, and return from another device.
3. See what needs you, and why.
4. Inspect the diff, steer the work, and get review from the people you
   asked.
5. Confirmed publication.

The journey runs in the desktop AI app, through MCP Apps views, on the
existing deployment. Development needs no new deployment; the hosting
deployment changes when a piece needs it, after its review. The journey
extends
[the MVP plan](../2026-10-16-repo-in-ai-mvp-plan.md) (slices S0 to S9)
and the earlier browser plan
[005](005-2026-10-03-browser-cloud-work.md) (its line 10 states the same
experience).

## 2. Order

### 2a. Finish and stop

- **Archive, to "clone, disconnect, verify to a cutoff".** The internal
  layout (slice A1) landed at main `698a3d713`. Still owed: the Git source
  and clone replay (A2), and the writer (A3), with a local witness that
  clones an archive, disconnects, and verifies history through an explicit
  cutoff (`notes/2026-10-09-shared-language-volatile-acts.md:1824-1838`;
  `notes/implementation/2026-10-17-archive-layout.md:349-357`). Stop there.
  The boundary of this milestone: the local writer, clone, disconnect and
  verify witnesses use synthetic histories or explicitly reviewed fixture
  histories only. Writing a real room's history needs, before any body is
  selected or exported, configured admission of the cohort, inline and
  foreign data (`packages/git/src/archive-policy.ts:1-2`;
  `packages/scope/src/archive-inventory.ts:16-25,59-67`), and the room's
  permission, consent and disclosures
  (`notes/2026-10-09-shared-language-volatile-acts.md`, sections 15.2 and
  15.10). No real policy is configured today
  (`notes/implementation/2026-10-17-archive-layout.md:349-357`), so this
  milestone writes no real history. The read client (A4), the live run
  (A5), broader export, progress and G1 wait; when real history is
  archived, those safeguards come with it, not after it.
- **Observability, then capacity.** Retain and count landed at `e444edf8e`,
  and See (status and health) at `aeebc18cb`. Judge, the third head, is in
  flight on `request/observability-judge-e6c4`
  (`notes/2026-10-12-observability-design.md:529-580`). Then the capacity
  limits: the native judge checks entry budgets, but judging against the budgets
  for bytes, items, records and pending requests is still outstanding
  (`docs/scopes.md:824`). Stop when those four are judged.

### 2b. Main line: the journey

The journey is MVP S0 to S9 plus five pieces, J1 to J5. The MVP plan's
slices keep their scope and witnesses. The five pieces close the gaps
that plan left out or that plan 005 named.

**J1. Signed requests that survive a reload or a device switch.**
Today, an ordinary page act keeps no copy of its signed request. After an
`unavailable` or `mismatch` answer the page says: "Recovery requires the
same signed envelope; this page does not retain it"
(`apps/room/page/src/view.ts:219`). The page keeps custody only for join,
start and connection requests (`apps/room/page/src/join-custody.ts`,
`start-custody.ts`, `connection-custody.ts`). The local MCP server keeps
every signed envelope before it sends it (`packages/mcp/src/custody.ts:1-25`),
but on files on one machine (`packages/mcp/src/node.ts:13,120`). The hosted
endpoint's hosted-store custody serves agents, not people
(`packages/mcp/src/hosted.ts:1-27`). J1 keeps the exact signed request of
every person's act where the person's other device can reach it, and lets
that device settle it without signing a new one. *Done when* a request
sent from one device, with its reply lost, is settled from a second device
after a reload, and nothing is sent twice. *Depends on* MVP S6 (the `at`
binding and `settle`).

**J2. Immutable file, diff and interdiff views.** No diff exists in the
page or in MCP. The page shows the file of a one-file proposal only; for a
Git tree it says "File preview is not available yet"
(`apps/room/page/src/view.ts:133-142`). J2 adds MCP App views of a file
at an exact commit, a diff between two exact commits, and an interdiff
between two versions of one change, each bounded and labelled "truncated"
over its bound. Browser parity is optional. *Done when* a reviewer in the
desktop AI app reads the diff of version 2 and the interdiff from version
1, and both name the exact commits they show. *Depends on* MVP S2 and S6,
and the MCP Apps views design (section 4).

**J3. A real checker runner adapter.** The checker service defines
`Runner` but has no adapter for a real runner
(`packages/checkers/src/service.ts:110-115`); "Nothing here starts a
container" (`packages/checkers/src/runner.ts:39-40`). The evidence-rules
design puts the production adapter in its first slice (decision 4,
`notes/2026-10-16-evidence-rules-design.md:332`). J3 is that adapter, built
once and shared: one fresh container per job, no network but the read-only
gateway, signing outside the container. The runner is a room member's
service, so it needs no Worker change. It replaces MVP S7's local stand-in.
*Done when* a real check runs on a proposal's exact tree, a failing test
blocks the merge, and a result for another tree is refused. *Depends on*
nothing beyond current main. The evidence-rules first slice is
commissioned alongside it and uses J3 as its production adapter; J3 comes
after the capacity budgets and does not wait for the archive milestone.

**J4. A production workspace fork and credential adapter for holds.**
`hold@1` derives the records of a hold's workspace
(`packages/derive/src/capability/hold.ts`, `workspaceEffects`), but no
adapter carries them to a real host: "Real lane hold and Git-read host
adapters are not built" (`docs/architecture.md:231`); "A fork for each
hold" is listed as not built (`docs/hosts.md:150-153`). Plan
[029](029-2026-10-11-artifacts-forks.md) designs it. J4 builds that
adapter: a fork per hold, scoped write and read credentials, revocation
when the hold ends. It is also the base for hosted agent teams working on a
repository. *Done when* two agents each push to their own hold's fork, a
token stops working when its hold ends, and the change publishes from the
chosen fork. *Depends on* MVP S0's finding on hold staging. Live use needs
a hosting deployment, made when J4 is reviewed, so the exit test has a
fork per hold.

**J5. The smallest attention loop.** The inbox holds attention items but
"No send leaves it, no timed rule exists and no entry starts a task"
(`packages/platform/src/inbox.ts:3-5`). J5 is one room's "needs you" view
with three clear reasons on each item: what needs me, why it is mine, and
what will settle it. Catch-up must be reliable: after any absence, the
view shows everything that changed since "mark reviewed". Reading an item
stays distinct from completing the work it asks for
(`notes/2026-10-01-wake-and-schedule.md:46`). It builds on MVP S4. *Done
when* each item names its rule and the act that settles it, reading an
item leaves it open, and an absent person returning on another device sees
every item that arrived. *Next step after J5:* notifying an absent person,
and resuming agent work (`wake-and-schedule.md:55`). Schedules and webhook
conditions come later. *Depends on* MVP S2, S3 and S4, and the views
design.

### 2c. In parallel

- **Hosted Counter agents**
  ([contracts](../2026-10-15-hosted-counter-contracts.md), slices in
  section 8). Today the `agent-team` scope has a fixed reference to one
  Counter (line 122). Build the agent setup (count, role, model, and a
  workspace field) so it can later point at the repository room
  without a new scope.
- **M1, developer and install halves**
  ([self-contained applications](../2026-10-15-self-contained-applications.md),
  section 7, lines 328-337):
  publish an app, install it into another host without changing that host,
  and use it through the browser and MCP. S8 uses M1 if it is ready.

### 2d. Exit test: a bounded real working sprint

Run the journey for one bounded sprint on a repository the team needs to
change, as a software-development loop with a few remote participants.
Include a newcomer and a fresh agent that gets only the guide and the task.
The cloud agents may be dap-hosted agent teams or agent sessions running
elsewhere with their own agent keys (MVP section 1.1); either counts.

Measure what plan 022 names
([022](022-2026-10-06-self-hosting-measurement-and-lane-simplification.md),
section 2, line 30): acts used and by whom, refusals by reason, retries
before success, intentions never completed, and stalls with a note for
each. Apply its stop rule (line 22): if the hosted run blocks the
repository's work for more than one sprint, the work returns to plain Git
and the block becomes a platform request.

Decide simplifications only after measuring. That includes the earlier
proposal to remove 36 acts by merging `-own`/`-any` pairs (line 64).

### 2e. Deferred until measured

- **Carrying review approvals to later versions.** The original design
  lets a verdict count for a later version under a `carry` rule
  (`notes/2026-10-01-artroom-plan.md:524-560`). The current merge guard
  counts approvals and change requests only for the exact current
  manifest (`apps/room/lanes/src/change.ts:1290-1306`). Changing who is
  eligible is high risk. The sprint will show whether re-review costs
  enough to justify it. Check reuse follows J3, inside evidence rules.
- **Passkeys.** Needed before any offering to outside users. Not urgent.

## 3. Where the review items land

| Review item | Lands in |
|---|---|
| 1. Finish the development loop, with interruption and return | 2b: MVP S0–S9 with J1, J2, J3, J4 |
| 2. Attention that leads to action | 2b: J5; notification and resumed agent work next |
| 3. Carrying review evidence | 2e: deferred until the sprint measures re-review cost |
| 4. Archive that survives the service | 2a: stop at clone, disconnect, verify to a cutoff |
| 5. Feedback from real use to simplification | 2d: the exit test |
| 6. The app as a developer-owned unit | 2c: M1 developer and install halves |
| 7. Operating work | 2a: Judge, then the four capacity budgets |

## 4. Critical path

- **The MCP Apps views design comes before any view slice.** The 16
  October sprint report listed it as owed by the planner
  (`notes/reports/2026-10-16-sprint-report.md:108`); builder now owns it,
  using web-application and mobile-application design practice, since the
  person returns from a phone as well as the desktop. It covers five
  views: Needs you (with J5's three reasons), Work, Decision, Change, and
  file, diff and interdiff (J2). Each has a desktop and a narrow mobile
  layout, in light and dark, with the major flows shown end to end, as a
  design note with HTML mockups and rendered images reviewed by the
  checker. MVP S2, S4 and S6, and J2 and J5, wait for it.
- **J3 and J4 come before the steps of the journey that run real work.**
  Without J3, no check runs and the view says "no checks ran". Without J4,
  agents share the destination's one repository and the journey cannot
  show a fork per hold.
- J1 needs S6. The exit test needs every piece.

## 5. Settled questions

1. The exit test's cloud agents may be dap-hosted agent teams or agent
   sessions running elsewhere with their own agent keys (section 2d).
2. J4 is deployed when it is reviewed, so the exit test has a fork per
   hold (section 2b).
3. The evidence-rules first slice is commissioned, with J3 as its
   production adapter (section 2b).

## 6. Changes in draft 2

- Review finding F1 (archive boundary): section 2a now states that the
  archive milestone writes only synthetic or reviewed fixture histories,
  and that real history needs admission, consent and disclosures before
  any body is selected. The plans README synopsis says the same.
- Review finding F2 (product names): the hosting deployment and the
  hosted store are named generically.
- "The judge" in section 2a is now "the native judge", to tell capacity
  judging apart from the observability Judge stage.
- The open questions are settled (section 5), and J3 and J4 say so.
