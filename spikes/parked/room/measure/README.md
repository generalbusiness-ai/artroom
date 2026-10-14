# Durable Object rows: the gate and the measurement

> **Test file names below may be out of date.** Each section names the tests as they were when it was written. Request `ecbc722a` later merged and removed many test files; [plans/test-invariants.md](../../../plans/test-invariants.md) is the current map from each invariant to its test.

Request 8bd623cc. A SQLite write in a Durable Object is billed as one row
for the table plus one row for each secondary index the write touches. No
counter in the application sees that, so the gate asks Cloudflare's billing
datasets. This follows woo's gate (woo commits 6d2c425a and 50163fc1).

Where each part stands:

- **Part 2 is built.** That is the gate, its use in the smoke run, the
  scheduled check, and the part 1 driver. Review 28615b74's code findings
  are fixed.
- **Part 1 is measured, on the code before mint lanes B and C.** The acts are in
  [results/row-costs-2026-10-02.md](results/row-costs-2026-10-02.md).
  That includes the four isolated measurements that review 28615b74 asked
  for: a check, an idle alarm tick, an alarm tick with a pending pin, and
  policy activation alone. They were measured on 2026-10-02 and 03, after
  the idle-write fix.
- **One cost is known but not yet measured.** Lane C makes a failing log
  publication mint canonical tokens (see "What remains").
- **Part 3 is set from the table.** The budgets are in
  [../src/budgets.ts](../src/budgets.ts). The idempotency quota follows
  the re-grounded hourly ceiling.

See "What remains".

## Files

| File | What it does |
|---|---|
| [rows.mjs](rows.mjs) | The gate: query, attribution, budgets. Run directly, it is the scheduled check. Plain Node, no `npm ci` needed. |
| [spike-smoke.mjs](spike-smoke.mjs) | Gates its own run when the token is set. `SPIKE_PHASE=rows` is the part 1 driver. |
| [results/row-costs-2026-10-02.md](results/row-costs-2026-10-02.md) | Part 1: the measured table, its method, the index count for each table, and the findings. |
| [../src/budgets.ts](../src/budgets.ts) | Part 3: the budgets the cost requests cite, each justified from the table, in its comment. The room reads only `ALARM`, whose behaviour the workerd tests show; no test repeats the arithmetic of the others (request ecbc722a removed the one that did). |
| [../test/node/rows.cases.ts](../test/node/rows.cases.ts) | Tests against recorded responses in the shapes Cloudflare returns. No live call. |
| [../../../.github/workflows/row-writes.yml](../../../.github/workflows/row-writes.yml) | The hourly check. It does nothing until it is turned on. |

## The token

The token is `ARTROOM_CF_ANALYTICS_TOKEN`. hugh creates it. It is an
account API token for account `6e953d23…`, the spike's account, with two
read permissions and nothing else:

- **Account Analytics: Read.** This covers the GraphQL Analytics API
  (`/client/v4/graphql`) and its datasets `durableObjectsPeriodicGroups`
  (`sum { rowsWritten rowsRead }`) and
  `durableObjectsInvocationsAdaptiveGroups` (`sum { requests }`).
- **Workers Scripts: Read.** This covers the namespace list,
  `GET /accounts/{account}/workers/durable_objects/namespaces`, which maps
  a Worker's name to its namespace IDs on every run. woo's token needed the
  same two permissions.

`CF_ACCOUNT_ID` replaces the account if it is set. By default the gate uses
the spike's account, the same one `spike-smoke.mjs` uses.

## How rows are attributed

For one Worker and one window `[from, to)`:

1. List the account's Durable Object namespaces. Keep the ones whose
   `script` is the Worker. This runs every time, because a redeploy can
   change the IDs.

   Paging stops at a short or empty page. It also stops when
   `result_info.total_pages` says so, but only if that field is present:
   the provider marks the pagination metadata as optional (`morePages`).
2. Run two GraphQL queries for each namespace, filtered by `namespaceId`,
   one for each dataset, and each with its own window:
   - **Storage** (`durableObjectsPeriodicGroups`: rows written and rows
     read). Each sample is stamped with the *start* of its interval, so
     this query starts `SAMPLE_LOOKBACK_MS` (2 minutes) before `from`
     (`sampleQueryStart`, the helper the per-act driver uses too). It ends
     before `to`, which is exclusive. A sample stamped before `to` counts
     in full, even when its interval runs past `to`.
   - **Invocations** (`durableObjectsInvocationsAdaptiveGroups`:
     requests). Each invocation is stamped with its own time. On
     2026-10-02 the values were single seconds (17:36:50, :51, :52 …), not
     whole minutes. So this query is exactly `[from, to)`. An invocation
     before `from` is never evidence for the window.

   Both of these choices can count too much, never too little.
3. Add the results up by object. Each object keeps its class and its
   `idFromName` name: a room ID for `Room`, `registry` for `Registry`.
4. Check two budgets: a total for the Worker, and a ceiling for each
   object.

### The sample-interval assumption

This is an **assumption, not a measured guarantee**. Every storage sample
seen on 2026-10-02 covered at most 60 s. A full interval was 60 s, and an
eviction can restart one early, which makes a shorter one. Cloudflare does
not document a maximum.

The gate looks back two minutes, so it counts any sample whose interval
began up to 120 s before `from`. That covers an interval of up to 120 s
that overlaps the window. The checker's 63-second case is counted.

A sample whose interval began more than 120 s before `from` and still ran
into the window would be missed. The gate cannot detect that case. This is
a known limitation.

The extra lookback costs at most one extra sample per object at the start
of a window. That counts too much, which is the direction the gate prefers.

The per-act table makes the same assumption: `windowTable` puts a sample in
the window that holds its start plus 60 s. If intervals were longer, a
window could take a sample that belongs partly to the next act.

A window is owned. If two runs share the spike at the same time, each
run's window also counts the other run's rows. That makes a result too
high, never too low. `windowTable` reports the rows of any object that is
not the measured room in a separate column, so you can see a window that
was not clean.

## Fail closed

Each case below gives an `incomplete` result, never a pass with zero rows.
Each one has a test in `rows.cases.ts`.

| Case | Test |
|---|---|
| No token: nothing is fetched | "no token: nothing is fetched, and the gate is incomplete" |
| A required namespace is missing (`Room`, `Registry`, `Publisher` for `artroom-spike-room`; `RunnerBox` for `artroom-spike-checkers`), or the Worker has no namespace | "a required namespace missing, or none at all" |
| The namespace list fails: unsuccessful, an HTTP error, or not JSON | "an unsuccessful, failed or non-JSON namespace list" |
| The namespace list is truncated (more than 100 pages) | "a namespace list that never ends is truncation" |
| GraphQL errors, no account, a missing dataset, an HTTP error, or a result at the 10,000-row limit | "GraphQL errors, a missing account or dataset, and a result at the row limit" |
| No invocations in the window, or an object with invocations but no periodic sample | "no invocation evidence, or invocations with no periodic sample, is incomplete, not zero rows" |
| A smoke run with `ARTROOM_ROW_GATE=1` and no token fails before it starts | "runs when the token is present, skips without it, and fails closed when demanded without it" |
| A billed value (`rowsWritten`, `rowsRead`, `requests`) is missing, null, negative or not a number, or a row names no object (or, in the samples query, no time) | "1. a missing, null, negative or non-numeric billed value is incomplete, never zero" and "1. the samples query fails closed the same way" |
| A full page of namespaces with no pagination metadata: the next page is read, not skipped | "2. without pagination metadata, pages are read while they come back full" |
| A sample stamped before `from` whose minute overlaps the window: counted, so a 5,000-row write in it fails the gate (including a 63-second interval) | "4. a sample stamped before `from` whose minute overlaps the window is counted; one stamped at `to` is not" |
| An invocation before `from` is not evidence: an otherwise empty window stays incomplete | "an invocation before `from` cannot make an empty requested window complete" |
| A namespace the Worker owns with no id or class: the whole result is incomplete, even when the required classes are present | "an owned namespace without an id or class makes the gate incomplete, even with the required classes present" |
| A credential that crosses the message bound: redacted before the cut, and a token prefix left at the cut is dropped | "a credential crossing the message bound is redacted before the cut, and a partial one at the cut is dropped" |

**Provider errors are reported as metadata only.** A report records a
failure as the stage, the HTTP status, and the provider's numeric error
codes or short code classes (`errorCodes`). It never records the provider's
message, which can echo the request and its token.

The printed report and the webhook payload use the same text. On top of
that, any exception text (from the transport, for example) has the token's
value, `Bearer …` and Artifacts tokens removed (`safeMessage`). The smoke
run also adds the analytics token to the values its `redact` removes.

Test: "3. a provider error that echoes the token reaches neither the report
nor the webhook: metadata only".

`safeMessage` is local to this plain-Node script. The Room's shared
redactor, `src/diag.ts`, is TypeScript, and the scheduled check runs
without a build. Provider text is never kept anyway: only metadata is.

These cases came from the checker's controls: five on caefe17d and four on
487edd74. All nine controls pass. Each new guard was mutated once to show
that a test goes red.

The end of a window is read only after the wait for the billing data to
settle (`windowEndAfterSettle`, 120 s). Cloudflare stamps a periodic sample
when it sends it, which can be after the write. This is woo's fix in
50163fc1.

## Ceilings

The ceilings were re-grounded on 2026-10-03, after the idle-write fix
(request 3da1d82b). Each is the measured value times a headroom factor,
rounded up to two significant figures. `rows.cases.ts` derives them again
from those figures.

| Budget | Used by | Measured (total / per object) | Headroom | Ceiling (total / per object) | Before the fix |
|---|---|---|---|---|---|
| `SMOKE_BUDGET` | One full smoke run, from its start to 2 minutes after cleanup | 1,270 / 489 (spike-smoke-2026-10-03T00-54-30-069Z: 1,258 by its three rooms, 12 by the registry) | 4 | 5,100 / 2,000 | 9,200 / 2,100, from 2,284 / 508 |
| `HOURLY_BUDGET` | The scheduled check's hour, by default | 2,514 / 1,780 (23:50 to 00:50: the activation measurement, six landings and three open lanes in one room) | 2 | 5,100 / 3,600 | 23,000 / 2,100, from 11,285 / 1,034 |

**Why re-ground.** The smoke run's total fell by 44%, from 2,284 to 1,270:
1,258 by the run's own three rooms and 12 by the registry.
The 983 rows that used to come from idle rooms are gone. In the clean run,
no other room wrote anything. Ceilings left at the old values would no
longer catch a regression of that size.

Two limits apply to every figure here:
- **The lookback is an assumption.** These totals assume that no storage
  sample covers more than 120 s, which is how far the gate looks back.
  That is an assumption about the provider, not a measurement ("The
  sample-interval assumption").
- **Invocations per minute cannot be rebuilt.** The run files do not keep
  the invocation rows, so those figures cannot be checked again from the
  saved data.

**Why 4 for a smoke run.** The same act measured within 6 rows across runs.
The margin also covers the run's variable timing, such as landing retries.

**Why 2 for an hour.** That hour was a deliberately busy one. An ordinary
hour on the spike is now 0 rows when it is idle.

## The smoke run

```sh
ARTROOM_CF_ANALYTICS_TOKEN=… node packages/room/measure/spike-smoke.mjs
```

- **The token is set.** After cleanup, the run waits 120 s. It then checks
  the `artroom-spike-room` Worker from the run's start to the end of that
  wait. The result is in `rowGate` in the result file. The run passes only
  if the gate passes.
- **The token is not set.** The gate is skipped. The result says
  `"state": "skipped"` and gives the reason.
- **`ARTROOM_ROW_GATE=1` and no token.** The run fails before it makes
  anything.

## The scheduled check

```sh
ARTROOM_CF_ANALYTICS_TOKEN=… node packages/room/measure/rows.mjs \
  [--worker artroom-spike-room] [--from ISO] [--to ISO] \
  [--max-rows-written N] [--max-rows-written-per-object N]
```

By default the window is the hour that ended ten minutes ago, because the
billing data is late. The exit codes are:

| Exit | Meaning |
|---|---|
| 0 | Pass |
| 1 | No token, or an error |
| 2 | Over budget |
| 3 | Incomplete |

On any failure, the check also posts the JSON report to
`ARTROOM_ROW_ALERT_WEBHOOK_URL` if that variable is set.

`.github/workflows/row-writes.yml` runs this check every hour, at minute 17.
To turn it on:

1. Add the secret `ARTROOM_CF_ANALYTICS_TOKEN`.
2. Optionally, add the secret `ARTROOM_ROW_ALERT_WEBHOOK_URL`.
3. Set the repository variable `ARTROOM_ROW_MONITOR` to `true`.

Each run first sends one request to the Room (a lookup of a name that does
not exist). This gives the next run's window invocation evidence when the
spike is otherwise idle. The first run after you turn it on may report
`incomplete` because no probe has run yet. A failed job is the alert. Any
other scheduler, such as cron, can run the same command.

The checker Worker, `artroom-spike-checkers` (`RunnerBox`), is not checked
by default. To check it, run the command with
`--worker artroom-spike-checkers`.

## Part 1: rows per act

```sh
ARTROOM_CF_ANALYTICS_TOKEN=… SPIKE_PHASE=rows [ROWS_OPEN=3] [ROWS_ONLY=pin|check|activation] \
  node packages/room/measure/spike-smoke.mjs
```

This needs hugh's wrangler OAuth login and the spike env file. It imports
one room under the checks policy and runs each act once, each in its own
billing window, in this order:

1. Found the room.
2. Invite, then join. The checker and a second admin also join.
3. On a lane outside the checked paths: claim, propose, note, land, release.
4. Land with N open previews.
5. Land a change to `.artroom/policy.json` while N proposals are open. The
   second admin approves it first, because a change to `.artroom/` owes
   `obl_admin-approval`.
6. On a checked lane: propose, the check, the review.
7. Idle for 5 minutes.

`ROWS_ONLY` runs instead one of the isolated measurements below, each in
rooms of its own.

Cloudflare sends one periodic sample a minute for each object, stamped with
the start of its interval. So the driver leaves 150 s of quiet after each
act (90 s after setup steps). The report then reads the samples
(`querySamples`) and gives each sample to the window that holds its
interval's end. An act's rows are its window's total minus the window's
quiet-minute baseline (`windowTable`).

The run renews the admin's read session after 20 minutes. If the run has
taken over 45 minutes, it refreshes the OAuth token before cleanup. It
writes `results/row-costs-<run>.md`, and puts the windows, samples and
table in the run's JSON.

The table and its method are in
[results/row-costs-2026-10-02.md](results/row-costs-2026-10-02.md).

### Isolated measurements

Review 28615b74 asked for four isolated measurements, each with billing
evidence: rows written and read, the windows and namespaces recorded, and
controls. All four were measured on the spike from 2026-10-02 22:02 to
2026-10-03 00:52 UTC, after the idle-write fix (Room code `e50e062a`). The
figures, the run files and the evidence are in
[results/row-costs-2026-10-02.md](results/row-costs-2026-10-02.md),
"Isolated measurements".

**Which code these figures are for.** They were measured on Room code
`e50e062a`: main `25a7b837` plus this lane. Since then this branch has
merged main `574568b2` (mint lane B), `df22d771` (safe error metadata) and
`965c911a` (mint lane C).

Mint lanes B and C route pinning, previews, landing pushes and log
publication through the canonical mint ledger, which writes ledger rows
for each token it mints. So these figures may be higher on the merged code
and are not yet re-measured:
- the pin tick;
- the propose;
- the landings;
- publication;
- policy activation;
- the smoke total behind `SMOKE_BUDGET`.

Two paths are outside those changes:
- **The idle tick.** Lane B's own test shows an idle mints step writes
  nothing.
- **The manual check's admission.** It sends no job and mints no token.

Their rows read may still differ. Re-measure all of them on a deploy of
this head, and ground the ceilings again then.

How to read the table:
- **Raw or adjusted.** "Raw window" is the room's total in the act's
  window. "Less the baseline" subtracts the room's mean per sample in the
  quiet control windows.
- **Invocations per minute** cannot be rebuilt: the run files do not keep
  the invocation rows.
- **The 120-second lookback** is an assumption about the provider, not a
  measurement.

| Measurement | Rows written | Rows read | Controls |
|---|---|---|---|
| A check, admitted on its own | Raw window: 17 in both runs. Less the quiet-control baseline: 16.6 and 17. | Raw window: 349 in both runs. Less the baseline: 319.6 and 346.8. | Quiet windows of 5 minutes before and after. They wrote 0, except the first run's "before" window, which held that run's pin tick (2 written, 147 read). |
| An idle alarm tick (nothing pending) | 0 | 202 | Quiet windows before and after: 0 written and 0 read. |
| An alarm tick with one pending pin | 2 (including deleting the switch's due-time row) | 136 | Quiet windows before and after: 0. |
| Policy activation with N open proposals, measured as policy landing minus plain landing in the same room | N = 0: 12.7 on average (2 to 20). N = 3: 33.3 on average (31 to 37). So about 7 for each open proposal. | N = 0: 823 (581 to 1,021). N = 3: 905 (617 to 1,102). | The plain landing next to each policy landing, three repetitions each. |

**What every isolated measurement has.** These are the driver's modes, as
they ran.

- **Its own rooms.** Each mode founds rooms of its own, so no other act's
  deferred work falls in its windows. The report tables each room against
  its own samples.
- **Controls.**
  - In the `pin` and `check` modes, each measured act has quiet windows
    before and after it (`quiet`: 5 minutes, or until the act is due).
    Nothing is sent in a quiet window, so it shows the room's background.
    When a run has quiet windows, `windowTable` uses them as the baseline.
  - In the `activation` mode, the control for each policy landing is the
    plain landing next to it, in the same room.
- **Billing evidence.** The run's JSON keeps the rows written and read in
  each window, the window's times and room, the namespace IDs queried, and
  the raw per-minute samples. The results Markdown repeats the table and
  the namespaces.

**The modes:**

- **`ROWS_ONLY=pin`: a tick with a pending pin, and an idle tick.** Deploy
  the Room with the spike-only `PIN_DELAY_MS` (below) first, and give the
  driver the same value as `ROWS_PIN_DELAY_MS`, at least 360000.

  *Lane A, the pending pin.* The propose leaves its pin pending, and writes
  the switch's due time: one `meta` row, so 2 rows written. That cost stays
  in the propose's window. A quiet window follows while the pin is pending.
  Then the tick window holds the alarm that completes the pin at its due
  time. That tick also deletes the switch's due time (2 rows), so the
  ordinary pending-pin tick is the window less those 2 rows.

  *Lane B, the idle tick.* A read of the proposal (a setup window) writes
  B's pin early. The alarm stored for B's due time then fires with nothing
  to do. That is the idle tick, with quiet windows before and after it.

  The pinned refs are read from the repository, not from the Room: absent
  before A's due time, present after it, and present after B's read.
- **`ROWS_ONLY=check`: a check.** The room's policy also requires a
  `manual` check on `lib/**` (`manualCheckProject`). The spike binds no
  service for it, so no job is sent. A fresh member of role `checker`
  signs the check after 5 quiet minutes, with the configuration digest read
  from the `policy-activated` entry.
- **`ROWS_ONLY=activation`: policy activation with N open proposals.** Two
  rooms, with N = 0 and with N = `ROWS_OPEN` open proposals. In each, three
  times: land a plain change, then land a change to `.artroom/policy.json`,
  approved by a second admin. Then:
  - activation(N) = policy landing − plain landing, from adjacent windows
    in the same room;
  - the cost per open proposal = (activation(N) − activation(0)) / N.

  Report the spread over the three repetitions.

### The pin switch (`PIN_DELAY_MS`)

Hugh approved this as a spike-only switch (assert 66a41558).

- **Off by default.** No config file sets it; `test/node/deploy.cases.ts`
  checks the production, spike and test configs. With it unset, the
  propose's commit writes the pin at once, as before.
- **Set only by an explicit measurement step:**

  ```sh
  PIN_DELAY_MS=360000 packages/room/scripts/deploy-spike.sh  # measurement window
  packages/room/scripts/deploy-spike.sh                       # unset it afterwards
  ```

  The script prints which of the two it did.
- **What it does when set.** The propose records the pin's due time in
  `meta`, and the pin is written when it is due. The alarm wakes for that
  due time, not on the 5-second loop. A read of the proposal still writes
  the pin, because a proposal read must find its pinned ref (R-PROP-1).
  Whenever a pin is written, its due time is deleted, even after the switch
  is unset.
- **Its tests**, in `test/workerd/pin-delay.cases.ts` against the real
  Durable Object:
  - unset, the pin is written by the commit, with no tick and no due time;
  - set, it is not written before its due time, the next alarm is exactly
    that time, and at that time the alarm writes it and deletes the due
    time;
  - set, a read writes it;
  - set, it survives a restart, and the fresh object's stored alarm writes
    it when due;
  - unset after a delayed pin, the restarted object writes it at once and
    cleans up.

  `test/node/config.cases.ts` covers parsing; any value that is not a whole
  number of milliseconds stops the Room from starting.
- **Rows read when scheduling a backlog of pending pins** (the checker's
  control on `48b1fee9`).

  | Code | Switch | Pending pins | Rows `nextAlarm` reads for pins | 150,000 pending |
  |---|---|---|---|---|
  | main (`df22d771`) | — | 5,000 | 5,000 (one scan) | no error |
  | this lane at `48b1fee9` | unset | 5,000 | 10,000 (two scans) | `RangeError` (`Math.min(...)` over every row) |
  | this lane now | unset | 5,000 | 1: one bounded existence check (`LIMIT 1`), which stops at the first pending pin | no error |
  | this lane now | set | 5,000 | 5,001: one aggregate (`MIN`) over the pins' due-time rows, plus the index's end-of-range row; no pins scan | no error |

  With the switch unset, scheduling takes main's path with its existence
  check bounded (`LIMIT 1`): `nextPinDue` is null and reads nothing, and no
  pins are scanned twice. With it set, `nextAlarm` reads the due time once
  and passes it to `loopPendingKinds`. When the room starts,
  `datePendingPins` gives each pending pin with no due time (one admitted
  before the switch was set) a due time of now, so the aggregate sees every
  pending pin.

  Tests:
  - `test/workerd/pin-backlog.test.ts` used only main's interfaces, so it
    ran on main (one full scan) and on this lane (bounded). Request
    ecbc722a removed it: `pin-delay.cases.ts` holds the bounded-read cases,
    which also stand for the 150,000-pin case named below.
  - `test/workerd/pin-delay.cases.ts` covers:
    - the reads, with the switch unset and set;
    - 150,000 pending pins;
    - dating at start, and that a start with the switch off writes nothing;
    - the composition of the delayed pin, the mint ledger and the error
      upgrade (main `df22d771`): the earliest wins, and the
      repository-gone fence holds the pin and the ledger but not the
      upgrade;
    - a room before founding, whose start dates no pins and whose
      founding schedule is unchanged.

  Each of nine mutants went red:
  - an unbounded existence check;
  - restoring the spread;
  - reading due times with the switch off;
  - a second scan in `nextAlarm`;
  - the off path using due times;
  - dating with the switch off;
  - no error-upgrade due time;
  - each repository-gone fence (two mutants).
- **Its window on the spike.**

  | Deploy | Time (UTC) | Room version |
  |---|---|---|
  | Set to 360000 (Room code `e50e062a`) | 2026-10-02 22:02:51 | `474f4529` |
  | Unset | 2026-10-02 23:12:45 | `59636ae9` |

  `ROWS_ONLY=pin` ran inside the window. The first `ROWS_ONLY=check` run
  (22:39) also ran inside it. Its pin tick fell in a control window, and
  its check figure matches the later run.
- **Under the switch, a landing did not finish.** The first
  `ROWS_ONLY=activation` run started at 23:00, inside the window. Its first
  landing (`op_land_9`) was accepted, but was not `landed` 300 s later, and
  its pin was not due until 360 s after the propose. I stopped that run,
  cleaned up its repositories, unset the switch, and ran `check` and
  `activation` again. The landing's dependence on the pin was not
  investigated further, because the switch is for measurement only. The
  driver now records the HTTP status of an operation it waited for and
  did not see finish.
- **Evidence that it was unset after its window.** Every full smoke run
  checks that lane 2's propose wrote its pinned ref itself: "the propose
  wrote its pinned ref itself (PIN_DELAY_MS unset)". Nothing reads that
  proposal, so with the switch on the step would fail.

## What remains

- **Re-measure on a deploy of this head.** The landing, publication, pin
  and smoke figures predate mint lanes B and C (see "Isolated
  measurements"). Then ground `SMOKE_BUDGET` and `HOURLY_BUDGET` again.
- **Measure the lane C publication-token cost** when lanes B and C are
  deployed. After mint lane C lands (checker's review b84aead9), a failing
  log publication mints 11 canonical tokens each time it retries. Each mint
  writes 4 ledger records, so a retry costs about 44 rows (11 × 4, before
  index multipliers). The idle-write fix's backoff bounds the retries to
  about 12 an hour, so the expected cost is about 528 rows an hour for each
  room whose publication is failing. **Not yet measured.** Lane C is not on
  main yet, so it cannot run on the spike.
- **Request 99782949 enforces the budgets.** `src/budgets.ts` states each
  limit and the measurement it comes from. Nothing enforces them yet.
- **Turn on the workflow.** Add the secret `ARTROOM_CF_ANALYTICS_TOKEN` and
  set `ARTROOM_ROW_MONITOR` to `true`. It checks `HOURLY_BUDGET` by
  default.
