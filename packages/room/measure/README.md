# Durable Object rows: the gate and the measurement

Request 8bd623cc. A SQLite write in a Durable Object is billed as one row
for the table plus one row for each secondary index the write touches. No
counter in the application sees that, so the gate asks Cloudflare's billing
datasets. This follows woo's gate (woo commits 6d2c425a and 50163fc1).

Part 2 of the request is built: the gate, its use in the smoke run, the
scheduled check, and the driver for part 1. Nothing here has been run
against Cloudflare yet. See "What remains".

## Files

| File | What it does |
|---|---|
| [rows.mjs](rows.mjs) | The gate: query, attribution, budgets. Run directly, it is the scheduled check. Plain Node, no `npm ci` needed. |
| [spike-smoke.mjs](spike-smoke.mjs) | Gates its own run when the token is set. `SPIKE_PHASE=rows` is the part 1 driver. |
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

## Budgets: provisional

`PROVISIONAL_BUDGET` is woo's load-gate budget: **250,000 rows in total and
50,000 per object**. It has not been checked against Artroom. Every result
that uses it says `"provisional": true`. Part 1 replaces it with values from
a clean measured run.

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
ARTROOM_CF_ANALYTICS_TOKEN=… SPIKE_PHASE=rows [ROWS_OPEN=3] \
  node packages/room/measure/spike-smoke.mjs
```

This needs hugh's wrangler OAuth login (Artifacts REST) and the spike env
file (`ARTROOM_OPERATOR_SEED`, `ARTROOM_CHECKER_SEED`), the same as
`SPIKE_PHASE=checks`. It imports one room under the checks policy (one
check, `tests`, and one review). It runs each act once, each in its own
billing window, in this order:

1. Found the room (draft, found, and the first session).
2. Invite, then join.
3. On a lane outside the checked paths: claim, propose (with its pin and
   preview), note, land with no other open preview, release.
4. Land with N open previews, where N is `ROWS_OPEN`.
5. Land a change to `.artroom/policy.json` while N proposals are open.
   This activates the new policy, which recomputes the N proposals and
   resets their previews.
6. On a checked lane: propose (the check job is dispatched), the checker
   service's check, the review.
7. Idle for 120 s: lanes are held and nothing is pending.

After each act the driver waits 15 s, then closes the act's window. A
second window then holds the log publication that the act caused. The Room
publishes a minute after the oldest unpublished entry. The publication
window ends 15 s after the log is published through its head. The steps
that only set things up (workspaces, pushes, other lanes, sessions,
releases) have their own windows of kind `setup`. So every request in the
phase falls in exactly one window.

The run writes the table to `results/row-costs-<run>.md`. The windows, the
reports for each window, and the table are in the run's result, under
`rows`. Each row of the table shows rows written and read for the measured
room's own `Room` object, the registry, and `Publisher` objects, and rows
written by any other object.

These rows are not measured on their own:

- **Policy activation with N open proposals** is the policy landing (5)
  minus the landing with N open previews (4).
- **One alarm tick with nothing pending.** The HTTPS API cannot start an
  alarm. The idle window shows whether an alarm runs at all when nothing is
  due. `nextAlarm` should give only lease expiry, 30 minutes later, so the
  idle window should show no writes.
- **One alarm tick with one pending pin.** The commit that admits a propose
  starts the pin step itself (`core.run("pins")`). While a pin is pending,
  the 5-second alarm loop runs. Both of these are inside the propose
  window. To measure a tick on its own, the Room's `tick()` RPC would have
  to be reached, for example by a test-only route. That is not built.
- **Founding a public room.** The driver founds an import, because the
  rest of the phase needs the checks policy in the first commit. Both kinds
  of founding run `createSchema`, the migrations and the two genesis
  entries. Only a public founding also creates the repository.

Two things are not yet checked against the live API:

- The field `rowsRead` in `durableObjectsPeriodicGroups`. woo queried only
  `rowsWritten`. If GraphQL rejects the field, every query fails closed
  with "GraphQL errors", and the fix is in `STORAGE_QUERY`.
- Whether the periodic samples for one act fall inside its 15-second
  window. The publication window that follows it catches samples that come
  late. If an act window shows invocations but no sample, the gate reports
  it as `incomplete`.

## What remains

1. **After the D5 redeploy, with hugh's token, run the part 1 driver
   once.** Use the command under "Part 1: rows per act". Do not run it
   while another run is using the spike. Check that the `Other written`
   column is 0 or close to it.
2. **Fill in the results.** Keep the `row-costs-<run>.md` table and the
   run's JSON in `results/`. Add a dated section to `notes/deploy-spike.md`
   with the table, this method, and the number of indexes for each table in
   `src/store.ts`. The index counts explain the multiplier between logical
   writes and billed rows.
3. **Set the ceilings.** Run one clean full smoke run with the token set,
   and read `rowGate.totalRowsWritten` and the largest object. Replace
   `PROVISIONAL_BUDGET` with ceilings grounded by that run, with headroom
   for one more run. Use hourly ceilings in the workflow (the
   `--max-rows-written` flags), and turn the workflow on.
4. **Set the budgets for part 3 from the table.** These are the attention
   fan-out cap per item, the idem and attention FIFO quotas, and the alarm
   rate. The other cost requests cite these budgets.
