# Durable Object rows: the gate and the measurement

Request 8bd623cc. A SQLite write in a Durable Object is billed as one row
for the table plus one row for each secondary index the write touches. No
counter in the application sees that, so the gate asks Cloudflare's billing
datasets. This follows woo's gate (woo commits 6d2c425a and 50163fc1).

Where each part stands (review 28615b74 asked for changes):

- **Part 2 is built.** That is the gate, its use in the smoke run, the
  scheduled check, and the part 1 driver. Review 28615b74's code findings
  are fixed.
- **Part 1 is partly done.** The driver ran against the spike on
  2026-10-02. The acts measured are in
  [results/row-costs-2026-10-02.md](results/row-costs-2026-10-02.md). Four
  isolated measurements are **not yet measured**: a check, an idle alarm
  tick, an alarm tick with a pending pin, and policy activation alone. See
  "Not yet measured".
- **Part 3 is provisional.** The budgets in
  [../src/budgets.ts](../src/budgets.ts) come from the acts that were
  measured. The alarm budget will be checked again once the idle tick is
  measured after the idle-write fix.

See "What remains".

## Files

| File | What it does |
|---|---|
| [rows.mjs](rows.mjs) | The gate: query, attribution, budgets. Run directly, it is the scheduled check. Plain Node, no `npm ci` needed. |
| [spike-smoke.mjs](spike-smoke.mjs) | Gates its own run when the token is set. `SPIKE_PHASE=rows` is the part 1 driver. |
| [results/row-costs-2026-10-02.md](results/row-costs-2026-10-02.md) | Part 1: the measured table, its method, the index count for each table, and the findings. |
| [../src/budgets.ts](../src/budgets.ts) | Part 3: the budgets the cost requests cite, each justified from the table. [../test/node/budgets.test.ts](../test/node/budgets.test.ts) checks the derivations. |
| [../test/node/rows.test.ts](../test/node/rows.test.ts) | Tests against recorded responses in the shapes Cloudflare returns. No live call. |
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
Each one has a test in `rows.test.ts`.

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

The ceilings come from a clean measured run on the spike, 2026-10-02. Each
is the measured value times a headroom factor, rounded up to two
significant figures. `rows.test.ts` derives them again from those figures.

| Budget | Used by | Measured | Headroom | Ceiling (total / per object) |
|---|---|---|---|---|
| `SMOKE_BUDGET` | One full smoke run, from its start to 2 minutes after cleanup | 2,284 / 508 (spike-smoke-2026-10-02T18-47-09-470Z) | 4 | 9,200 / 2,100 |
| `HOURLY_BUDGET` | The scheduled check's hour, by default | 11,285 / 1,034 (17:50 to 18:50, with measured runs active and 17 rooms) | 2 | 23,000 / 2,100 |

**Why 4 for a smoke run.** The same act measured within 6 rows across runs.
Most of the margin is for the idle rooms' background: 983 of the 2,284
rows. Every smoke run adds three rooms to it.

**Why 2 for an hour.** That hour already holds the background of 17 rooms
(about 720 rows an hour each). A smaller factor alerts sooner as the
background grows.

Both totals will be exceeded once enough idle rooms exist, until the
background is removed (results, Findings 1 and 2). That is the alert
working; it is not a reason to raise the ceiling.

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

### Not yet measured

Review 28615b74 asked for four isolated measurements, each with billing
evidence: rows written and read, the windows and namespaces it recorded,
and controls. None of the four is done yet:

| Measurement | Status | What blocks it |
|---|---|---|
| A check | **not yet measured** | The checker service admitted its check 9 s after the propose, inside the same one-minute sample, so its cost could not be separated. |
| An idle alarm tick (nothing pending) | **not yet measured** | Alarms do not appear in the invocations dataset. Every idle minute holds a checkpoint publication, so no quiet minute exists to compare with. The idle-write fix changes this figure. |
| An alarm tick with one pending pin | **not yet measured** | On the deployed code, the commit that admits a propose writes the pin itself, so no alarm tick ever finds a pin pending. The approved switch, `PIN_DELAY_MS` (below), is built and tested, but not yet deployed. |
| Policy activation alone, with N open proposals | **not yet measured** | Activation is sealed in the landing's own transaction. Its only figure so far (about 40 written) is one subtraction across two rooms. It has no repetition and no control. |

All four will be measured on the spike after the idle-write fix is
deployed. With that fix, a quiet minute should cost nothing, so an act
stands out against it.

**What every isolated measurement has.**

- **Its own rooms.** Each mode founds rooms of its own, so no other act's
  deferred work falls in its windows. The report tables each room against
  its own samples.
- **Quiet controls.** Each measured act has quiet windows before and after
  it (`quiet`, 5 minutes, or until the act is due). Nothing is sent in a
  quiet window, so it shows the room's background to compare with.
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

- **Off by default.** No config file sets it; `test/node/deploy.test.ts`
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
- **Its tests**, in `test/workerd/pin-delay.test.ts` against the real
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

  `test/node/config.test.ts` covers parsing; any value that is not a whole
  number of milliseconds stops the Room from starting.
- **Evidence that it was unset after its window.** Every full smoke run
  checks that lane 2's propose wrote its pinned ref itself: "the propose
  wrote its pinned ref itself (PIN_DELAY_MS unset)". Nothing reads that
  proposal, so with the switch on the step would fail.

## What remains

- **Measure the four isolated cases** under "Not yet measured", on the
  spike after the idle-write fix is deployed:
  1. Deploy this branch's head with `PIN_DELAY_MS=360000`. Run
     `ROWS_ONLY=pin` with `ROWS_PIN_DELAY_MS=360000`.
  2. Run `ROWS_ONLY=check` and `ROWS_ONLY=activation`. These do not depend
     on the switch.
  3. Unset the switch by redeploying without it, and record when.
  4. Run one clean full smoke with `ARTROOM_ROW_GATE=1`. Its pin step is the
     evidence that the switch is off. Check the ceilings again.
- **Request 99782949 enforces the budgets.** `src/budgets.ts` states each
  limit and the measurement it comes from. Nothing enforces them yet.
- **Remove the idle background.** A cohort that holds only checkpoint
  entries should not be due. A room whose repository is gone should back
  off (`ALARM` in `src/budgets.ts`). Until then, the ceilings above will be
  exceeded as rooms accumulate.
- **Turn on the workflow.** Add the secret `ARTROOM_CF_ANALYTICS_TOKEN` and
  set `ARTROOM_ROW_MONITOR` to `true`. It checks `HOURLY_BUDGET` by
  default.
