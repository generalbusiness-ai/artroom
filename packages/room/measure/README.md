# Durable Object rows: the gate and the measurement

Request 8bd623cc. A SQLite write in a Durable Object is billed as one row
for the table plus one row for each secondary index the write touches. No
counter in the application sees that, so the gate asks Cloudflare's billing
datasets. This follows woo's gate (woo commits 6d2c425a and 50163fc1).

All three parts are done:

- **Part 2:** the gate, its use in the smoke run, the scheduled check, and
  the part 1 driver.
- **Part 1:** the driver ran against the spike on 2026-10-02. The table, the
  method and the findings are in
  [results/row-costs-2026-10-02.md](results/row-costs-2026-10-02.md).
- **Part 3:** the budgets are in [../src/budgets.ts](../src/budgets.ts).

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
2. Run one GraphQL query per namespace, filtered by `namespaceId` and the
   window. It returns rows written and rows read from the periodic dataset,
   and requests from the invocations dataset, grouped by `objectId`.
3. Add the results up by object. Each object keeps its class and its
   `idFromName` name: a room ID for `Room`, `registry` for `Registry`.
4. Check two budgets: a total for the Worker, and a ceiling for each
   object.

A window is owned. If two runs share the spike at the same time, each
run's window also counts the other run's rows. That makes a result too
high, never too low. `rowTable` reports the rows of any object that is not
the measured room in a separate column, so you can see a window that was
not clean.

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
ARTROOM_CF_ANALYTICS_TOKEN=… SPIKE_PHASE=rows [ROWS_OPEN=3] [ROWS_ONLY=policy] \
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

`ROWS_ONLY=policy` runs only steps 1, 4, 5 and 7.

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
[results/row-costs-2026-10-02.md](results/row-costs-2026-10-02.md). Some
rows cannot be isolated, and the table says so:

- a single alarm tick;
- the pin step, which is inside the propose;
- the check, which is admitted 9 s after its propose;
- the policy activation, which is derived by subtraction.

## What remains

- **Request 99782949 enforces the budgets.** `src/budgets.ts` states each
  limit and the measurement it comes from. Nothing enforces them yet.
- **Remove the idle background.** A cohort that holds only checkpoint
  entries should not be due. A room whose repository is gone should back
  off (`ALARM` in `src/budgets.ts`). Until then, the ceilings above will be
  exceeded as rooms accumulate.
- **Turn on the workflow.** Add the secret `ARTROOM_CF_ANALYTICS_TOKEN` and
  set `ARTROOM_ROW_MONITOR` to `true`. It checks `HOURLY_BUDGET` by
  default.
