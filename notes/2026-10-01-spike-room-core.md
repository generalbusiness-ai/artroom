# Spike: room core on Workers and Durable Objects

Date: 2026-10-01. Code: [spikes/room-core/](../spikes/room-core/). Raw
results: [spikes/room-core/results/](../spikes/room-core/results/).

## Summary

- The room core works on Cloudflare as planned. One Durable Object verifies an
  Ed25519 act, evaluates the five rule kinds, diffs trees through the
  Artifacts binding, appends to SQLite and answers.
- **An act that needs no diff takes 68–73 ms p50 and 83–90 ms p90** from this
  machine (Cloudflare colo EWR). A `propose` takes 305 ms p50 for a one-file
  change and 1,035 ms p50 for a 99-file change with a `survive` re-check.
- **The tree diff dominates `propose`.** It costs about 16–20 ms per
  `readTree` call. A one-file change five directories deep takes 145 ms p50
  (12 calls). A 99-file change takes 316–447 ms p50 (108 calls). With tree
  objects cached by hash, the same diff takes 23 ms.
- **Signature verification is cheap:** 0.24 ms p50 deployed.
- **Rule evaluation is cheap with a fixed guard, and too slow with the
  ported one.** The atseq guard walks every intermediate value. On rules that
  read the root (`$$`) inside a filter, that costs 43–49 ms per rule
  deployed. Recording the size of the frozen input once cuts this to 4.4 ms,
  with identical outputs.
- **Deployed CPU is 6–13 times slower than this laptop** (Apple M5 Max) for
  this code, and it varies from request to request. The tail's `cpuTime`
  confirms it. Budget for deployed CPU, not for local runs.
- **The profile is safe enough for the build, with three changes**: memoise
  input sizes, a per-act step and byte budget sized for deployed CPU, and a
  cost charge for host functions such as `$glob`. Without the guard, one
  admitted rule ran until the Durable Object hit its 30 s CPU limit and was
  reset. JSONata's own `timeout` option did not fire in any deployed run.

## What was built

| Part | File | Notes |
|---|---|---|
| Worker | `src/index.ts` | Routes `/r/:room/…` to one Durable Object per room |
| Durable Object `RoomSpike` | `src/room.ts` | Acts `claim`, `propose`, `review`, `land`; SQLite tables for acts, claims, proposals, reviews, evaluations, refusals, attention |
| Rule profile | `src/profile.ts` | Port of atseq `src/runtime/evaluator.ts`, see below |
| Path globs | `src/glob.ts` | `**`, `*`, `?` by dynamic programming; no regular expressions |
| Tree diff | `src/treediff.ts` | `readCommit` twice, then `readTree` recursively, skipping equal hashes |
| Policy | `src/policy.json` | 12 rules: 5 `refuse`, 3 `require`, 1 `survive`, 1 `land`, 2 `notify` |

An act is `{kind, actor, body, nonce}`, signed with Ed25519 over canonical
JSON. `actor` is the raw public key. The room answers with the record or a
`Refusal` `{refused, rule, reason, fix}`. A repeated `(actor, nonce)` returns
the first record, so a client can resend safely.

Every rule evaluation stores its rule, its complete input and its output.
`GET /r/:room/explain?seq=N` evaluates the stored inputs again and compares.

Ported from atseq: the AST admission walk (node, operator and function
allowlists, no caller variables, safe-integer literals, reserved keys), the
evaluate hooks that count steps and nesting, the intermediate byte
inspection, the checked integer `$sum` and the error-code mapping. Added: a
host `$glob(path, patterns)`, a cache of compiled rules, and measurement
modes.

## Method

- **Test repo.** `scripts/setup_repo.sh` imported `expressjs/express` (214
  files, 68 directories, 6 levels) into the `gitseq-spike` namespace as
  `artroom-spike-tree`. It pushed two branches from the imported head:
  `spike-small` changes one file five directories deep; `spike-large` changes
  67 files, deletes 12 and adds 20 in a new nested directory (99 paths). The
  script revoked every repo token afterwards.
- **Lifecycle.** The driver (`scripts/driver.mjs`) ran 50 lifecycles of 8 acts:
  claim; propose the small head; a refused self-review; a review scoped to
  `examples/**`; propose the large head (the review goes stale through
  `survive`); a refused land; a second review; land. That is 400 acts. Every
  propose's changed paths matched `git diff --name-only`.
- **Diff.** 50 runs each: small, large, and large with an in-memory tree cache.
  A further 50 runs per concurrency cap for the large diff.
- **CPU.** Deployed Workers freeze `performance.now()` during CPU work, so the
  room's own timers read 0. Each benchmark therefore ran as 50 requests, each
  doing a batch (200 verifies, 100 evaluations or 20 compiles). Per-operation
  time = (Worker wall time around the RPC − median no-op RPC of 14 ms) ÷
  batch size. In the tail, `cpuTime` was 78–99 % of wall time for such
  requests, so these figures overstate CPU by up to a quarter.
  The same benchmarks ran in local `workerd` (`wrangler dev`), where timers
  do advance.
- Runs: local `workerd` 16:25–16:29 UTC; deployed 16:29–16:49 UTC. Follow-up
  runs to 16:59 UTC used a redeploy that added the concurrency cap and a
  Worker-side benchmark for the tail. The driver ran on this machine over one
  reused HTTPS connection.

## Results

### End-to-end act latency (deployed, 50 lifecycles)

| Act | n | p50 ms | p90 ms | max ms |
|---|---|---|---|---|
| claim | 50 | 68.3 | 83.3 | 111.7 |
| propose, 1 path | 50 | 305.3 | 467.1 | 1,108.1 |
| review, refused (self-review) | 50 | 68.4 | 83.9 | 410.1 |
| review | 100 | 68.0 | 88.9 | 261.8 |
| propose, 99 paths, with `survive` | 50 | 1,034.7 | 1,387.0 | 1,622.8 |
| land, refused (stale review) | 50 | 71.8 | 89.8 | 136.7 |
| land | 50 | 70.8 | 90.3 | 555.2 |
| all 400 | 400 | 73.1 | 980.1 | 1,622.8 |

The first call to a new room (create the object, compile 12 rules) took
301 ms; the first claim after it took 76 ms. The earlier echo spike measured
132 ms p50 for a bare append. This driver reuses its HTTPS connection, which
may explain the gap; I did not test that.

The 99-path propose runs two diffs at once (base to head, and old head to new
head for `survive`), so it makes 216 `readTree` calls.

### Signature verification

| Where | p50 ms | p90 ms |
|---|---|---|
| Deployed (import key + verify) | 0.24 | 0.34 |
| Local workerd | 0.03 | 0.035 |

### Rule evaluation (per evaluation, recorded inputs from the lifecycle)

Deployed, wall-derived p50 in ms. "Ported" is the atseq guard as is.
"Memo" records the size of the frozen input once. Steps are the evaluator
visits for that input.

| Kind | Rule | Steps | Ported | Memo | Steps only | No guard | Local, ported |
|---|---|---|---|---|---|---|---|
| refuse | claim-overlap | 6 | 0.28 | 0.23 | | | 0.01 |
| refuse | claim-before-propose | 20 | 0.79 | 0.62 | | | 0.06 |
| refuse | within-claim-scope (99 paths) | 897 | 42.78 | 4.41 | 2.60 | 1.98 | 3.73 |
| refuse | no-self-review | 14 | 0.25 | 0.19 | | | 0.02 |
| refuse | land-own-proposal | 20 | 0.42 | 0.24 | | | 0.04 |
| require | tests-for-code | 704 | 6.51 | 6.35 | 2.63 | 2.28 | 0.72 |
| require | docs-review-for-examples | 407 | 3.35 | 3.19 | | | 0.38 |
| require | one-approval | 4 | 0.74 | 0.64 | | | 0.03 |
| survive | reviewed-paths-unchanged | 706 | 49.36 | 4.37 | 2.21 | 1.71 | 3.59 |
| land | obligations-met | 109 | 1.17 | 0.92 | | | 0.13 |
| notify | owners-see-proposals | 34 | 1.11 | 0.77 | | | 0.10 |
| notify | author-sees-verdicts | 4 | 0.25 | 0.23 | | | 0.02 |

Compiling all 12 rules (parse and admission walk): 6.0 ms deployed, 0.45 ms
local. Compiled rules are cached per isolate.

For the 99-path propose, the 7 rules it evaluates cost about 105 ms deployed
with the ported guard and about 20 ms with memo, for 2,772 steps.

### Tree diff (deployed, inside the Durable Object)

| Case | Paths | `readTree` calls | p50 ms | p90 ms | max ms |
|---|---|---|---|---|---|
| 1 file, 5 levels deep | 1 | 12 | 145 | 193 | 3,502 |
| 99 files | 99 | 108 | 447 | 637 | 1,838 |
| 99 files, trees cached by hash | 99 | 0 | 23 | 39 | 473 |

`env.ARTIFACTS.get()` adds 23–29 ms p50 before the diff, and two parallel
`readCommit` calls take 20–27 ms. One `readTree` takes 16–20 ms when few are
in flight. Capping the calls in flight shows a throughput ceiling of about
300–350 calls per second:

| Cap on calls in flight | 1 | 2 | 4 | 6 | 8 | 16 | none |
|---|---|---|---|---|---|---|---|
| 99-file diff, p50 ms | 1,828 | 924 | 527 | 419 | 357 | 316 | 336 |
| One call, p50 ms | 16 | 16 | 17 | 20 | 22 | 33 | 75 |

### Cold start

- Bundle: 284 KiB (50 KiB gzip); jsonata is 244 KiB of it.
- `wrangler deploy` reported Worker startup of 6–10 ms across four deploys.
- In Node on this machine, loading jsonata takes 3.0 ms and the first
  compile and evaluate 0.9 ms.
- First call to a new room: 301 ms round trip, against 68 ms warm.

## Is the JSONata profile safe enough for the build?

Yes, with the changes below. Without them it is not.

### Determinism

- The allowlist excludes `$now`, `$millis`, `$random`, `$eval`, regular
  expressions, sorting and every other function outside the 16 atseq
  functions plus `$glob`.
- **Replay.** All 301 deployed acts were replayed from their recorded inputs:
  1,051 evaluations, none differed. The local run gave the same counts.
- **Across guard modes.** For every rule, the outputs with the ported guard,
  memo, steps only and no guard were identical to the recorded output.
- **A determinism hazard without the byte guard.** A rule that doubles a
  string 24 times (to 256 MiB) and then searches it returned `false` in 30 ms
  in local workerd. Deployed, the same rule failed inside the engine while
  handling a `RangeError` (`Cannot create property 'position' on string
  'RangeError'`). Byte inspection refuses it on both, at 1 MiB, with
  `value_bytes`. So the byte guard is needed for the same answer everywhere,
  not only for memory.

### Bounds

A rule the profile admits can still be cubic in its input:
`$count(changed[$count($$.changed[$count($$.changed[$ = $$.changed[0]]) > 0]) > 0])`.

| Input paths | Guard | Deployed result | Deployed time |
|---|---|---|---|
| 25 | ported | `inspection_budget` | 3.5 s |
| 25 | memo | `inspection_budget` | 0.67 s |
| 50 | steps only | `step_budget` (100,000) | 0.42 s |
| 100 | none | completed | 21.7 s |
| 100 | none, JSONata `timeout: 100` | completed; the timeout never fired | 24.7 s |
| 150 | none | **CPU limit: object reset** (tail: `exceededCpu` at 30 s CPU, 52 s wall) | 52 s |
| 150 | none, JSONata `timeout: 100` | **CPU limit: object reset** | 49 s |
| 150 | ported | `inspection_budget` (tail: 1.7 s CPU) | 1.9 s |

Findings:

1. **jsonata-js has no step limit, and its `timeout` option is useless on
   Cloudflare.** The option compares `Date.now()`, which does not advance
   during CPU work in a deployed Worker. Locally the same option stops the
   rule at 101 ms.
2. **The evaluate-entry hook is the only reliable guard.** It counts work, not
   time, so it gives the same answer on every host.
3. **One unguarded rule can stall a room.** The room processes acts one at a
   time. A rule that runs to the 30 s CPU limit blocks every act behind it,
   then the object is reset.
4. **The ported budgets are too large for deployed CPU.** At the atseq limits
   (100,000 steps, 16 MiB inspected), one rule can take 0.4–3.5 s deployed.
   A 12-rule policy could approach the CPU limit on one act.

### What to build

1. **Keep the atseq profile and its hooks**: allowlists, step and nesting
   counts, sequence limit, byte inspection, safe integers only.
2. **Memoise input sizes.** Freeze the owned input and record each
   container's size once. Charge the recorded size when a rule reads it
   again. This keeps atseq's accounting and its outputs, and is 6–11 times
   faster on rules that read `$$` in a filter (`memo` in `src/profile.ts`).
3. **Budget per act, not per rule, sized for deployed CPU.** Suggested:
   25,000 steps and 4 MiB inspected across all rules of one act. Deployed
   costs measured 3–9 µs per step, so the worst case is 75–225 ms of CPU.
   The 99-path propose used 2,772 steps across 7 rules, so this covers
   changes of several hundred paths. A larger change needs a budget that
   grows with the number of changed paths.
4. **Charge host functions.** `$glob` is bounded (patterns of at most 1,024
   characters, at most 256 patterns) but one call can still cost millions of
   character comparisons. Charge steps in proportion to pattern length times
   path length.
5. **Refuse a policy that trips a budget on a sample input** at the time it is
   proposed, so that a costly rule is caught in review rather than in use.

## Other findings for the build

- **Cache tree objects by hash** in the room's SQLite. They are immutable. It
  turns a 447 ms diff into 23 ms when trees repeat, which is common: every
  proposal on a lane shares its base.
- **Keep 8–16 `readTree` calls in flight.** More does not help.
- **Deploys reset live Durable Objects.** Two lifecycle runs started within a
  minute of a deploy failed with "Durable Object reset because its code was
  updated." Acts must stay idempotent by `(actor, nonce)` so that clients can
  resend; the spike's acts are.
- **Measure CPU through the tail,** not with timers. `wrangler tail --format
  json` reports `cpuTime` for Durable Object RPC calls.
- **SQLite was not the cost.** Locally the append transaction took 0 ms p50
  and at most 4 ms; deployed timers cannot see it. The output gate holds the
  answer until the write is durable, so that cost is inside the round trip,
  which stays at 68 ms p50 for acts without a diff.

## Not done

- No `note`, `check` or `release` acts, no merges, no WebSocket and no
  attention queue reads. `land` records the head; it does not move `main`.
- The policy is posted to the room, not read from `.artroom/policy.json` in
  the repo.
- Memo, the per-act budget and the `$glob` charge are measured or proposed
  here; only memo is implemented, as a measurement mode.
- No measurement of many rooms at once, or of throughput beyond one driver.
- The tree diff treats a mode change as a change and does not detect renames.

## Left on Cloudflare

- Artifacts repo `gitseq-spike/artroom-spike-tree` (test data, no active
  tokens).
- The Worker `artroom-spike-room-core` was deleted after the runs.
