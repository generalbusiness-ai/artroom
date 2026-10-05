# Where the time of the scope project goes

Request: cut test overhead. This note measures the `scope` project (the
workerd pool, real Durable Objects with SQLite storage, and the ten lane
scenarios), finds the cause of the slowdown that entry DK11 of
`notes/2026-10-05-i2-contract-deltas.md` names, and records what was
changed.

How each figure was taken is stated beside it. Unless said otherwise: one
shared macOS machine that other sessions also use, warm cache, vitest 4.1.11,
`@cloudflare/vitest-pool-workers` 0.22.0, base commit `f3215a05f` (main at
`b57e8774` plus the test-economy work). A figure from one run is noisy by
about 10 percent. Throwaway probe tests were used for the probes below. They
are not committed.

## 1. The breakdown

### Fixed cost of the pool

Observed, one run each.

| Run | Duration | Of which |
|---|---|---|
| `--project scope answers` (one file, 3 tests) | 0.72 s (wall 1.55 s with `npx` and node start) | import 0.46 s, transform 0.20 s, tests 0.08 s |
| `--project bytes` (17 tests) | 0.12 s (wall 0.96 s) | for comparison |
| `--project scope` (all 54 tests) | 5.05 s | import 0.76 s, transform 0.34 s, tests 4.06 s |

So the pool and its imports cost about 0.7 s whatever runs. The tests are
the rest.

### Per file and per test

Observed. `--reporter=json`, run 3 of 3 at the base commit. Three runs of
the whole project gave a summed test time of 3.91 to 3.94 s.

| File | Tests | Summed ms |
|---|---|---|
| lanes/manifest.scope (T3) | 1 | 512 |
| lanes/links.scope (T5a, T5b) | 2 | 482 |
| scope/compose | 8 | 475 |
| scope/turn | 16 | 413 |
| lanes/plan.scope (T2, T9) | 2 | 379 |
| lanes/capacity.scope (T7, T8) | 2 | 331 |
| scope/replay | 2 | 292 |
| scope/texts | 3 | 248 |
| lanes/hold.scope (T1, T4) | 2 | 247 |
| scope/founding | 5 | 121 |
| scope/client | 2 | 98 |
| lanes/discussion.scope (T6) | 1 | 93 |
| scope/reads | 1 | 71 |
| scope/routes | 2 | 51 |
| scope/answers | 3 | 49 |
| scope/restart | 2 | 49 |

The slowest tests: T3 512 ms, T5b 279, replay "parent and two children"
250, T5a 203, T7 200, T9 196, T2 183.

### Unit costs

Observed in probe tests, one run, after a warm-up, single scope in the
pool, `TestScope` or `NetScope`.

| Call | Cost |
|---|---|
| one act on a scope (`submit`, including signature check, judge, fold, commit) | 2.2 ms (the test's own signing is 0.26 ms more) |
| one read (`summary`) | 0.56 ms |
| founding a directory (validates the definition) | 7.2 ms |
| the lane office (`graph()`: found, texts, settle) | 30 ms (40 ms the first time) |
| a call on an existing scope, `api(env.NET)` | 0.45 ms |

### What a lane scenario creates

Observed by counting calls to the object (a temporary counter in
`object.ts`, reverted), one run. "Scopes" counts constructions of an
object, so a restart counts again. `found` counts calls of `found`, which
include the office. Reads are summaries, histories, entries and so on.

| Scenario | Scopes | Acts submitted | Deliveries | Reads | Test ms |
|---|---|---|---|---|---|
| T1 hold | 2 | 10 | 4 | 21 | 113 |
| T2 plan | 4 | 6 | 14 | 28 | 183 |
| T3 manifest | 7 | 50 | 26 | 67 | 512 |
| T4 handover | 2 | 14 | 4 | 21 | 134 |
| T5a links | 4 | 7 | 20 | 22 | 203 |
| T5b merge | 4 | 13 | 28 | 43 | 279 |
| T6 discussion | 2 | 4 | 4 | 13 | 93 |
| T7 capacity, copy | 3 | 14 | 14 | 26 | 200 |
| T8 capacity, item | 2 | 15 | 5 | 23 | 131 |
| T9 replay of T2's graph | 0 | 0 | 0 | 49 reads, 48 route calls | 196 |

Every scenario except T9 founds its own office with `graph()` (nine
foundings, about 30 ms each, 0.27 s). T9 reads the graph T2 left. The
others do not share a fixture, because each writes to it. docs/testing.md
says tests that write get their own. I did not change that.

Whole project, same counting: about 235 acts, 220 deliveries, 560 reads,
46 foundings and 85 object constructions in 54 tests. At the unit costs
above these sum to about 2 s. The rest is growth in the cost of making
objects (section 2, second finding) and the calls through the entrypoint
(first finding).

## 2. The cause of the slowdown of DK11

There are two growths. Neither is in the product.

### First finding: calls through the pool's entrypoint

Observed, probe test, one run each, 50 calls per batch, milliseconds per
batch. "Empty route" is `SELF.fetch` of a path that matches nothing, so no
object and no product code run.

| Calls made before | `api(env.NET)` | `API` binding | `SELF.fetch` of a summary | `SELF.fetch` empty route |
|---|---|---|---|---|
| 0 | 25 | 51 | 53 | 27 |
| 50 | 24 | 94 | 91 | 65 |
| 100 | 25 | 194 | 171 | 149 |
| 150 | 23 | 322 | 305 | 272 |
| 200 | 22 | 505 | 470 | 437 |
| 250 | 22 | 734 | 676 | 651 |

Each path run alone. Three further observations, all one run:

- The growth is per path: `SELF` and `API` do not slow each other when run
  alone, and interleaved they follow their own counts.
- It does not recover. It carries across tests and files (the isolate is
  shared), 3 s of idle time did not reduce it, and forcing a garbage
  collection did not.
- The whole growth is before the Worker's handler is entered. Timing inside
  the handler: call to handler entry 27 ms per 50 calls at first, 650 ms
  after 250; time in the handler 0 to 2 ms throughout; handler to caller
  under 1 ms.

The pool's wrapper for an entrypoint (`createWorkerEntrypointWrapper` in
`@cloudflare/vitest-pool-workers`) imports the main module through the
runner object on every call. I timed that import (`moduleRunner.import`)
and `runInDurableObject`, the same plumbing, called from the test: both
stayed flat at 10 to 20 ms per 50. So the growth is in the pool's request
path into an entrypoint from the test, or in workerd, and not in the
import itself. I did not find the exact line. It is not in this
repository. The cost is quadratic in the number of calls: about
`0.0086 N^2` ms for N calls in one run, fitted to the table.

Label: the model is a fit of the table above, an estimate.

### Second finding: making an object gets slower with the number of objects

Observed, probe tests, one run each, 50 new objects per batch, milliseconds
per batch.

| What is made, each on a fresh name | Batch 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| a bare Durable Object, no storage, no product code | 570 (first, with a cold start) | 185 | 250 | 441 | 681 | 1009 |
| a bare Durable Object with one SQLite write | 72 | 146 | 282 | 440 | 790 | 1097 |
| `ScopeObject` (TestScope), one read | 101 | 179 | 263 | 470 | 700 | 1040 |
| `ScopeObject` (NetScope), one read | 96 | 149 | 293 | 461 | 725 | 1003 |

The bare objects have no product code, and they grow like the scope
objects. So this is the pool or workerd and not the scope runtime. It
carries across tests: a second test that made 200 more objects after 800
earlier ones ran at about 600 ms per 50 calls to `found`, and later
batches at 25 to 35 s per 50 foundings (the same objects, with `evict`, and
with acts, grew the same way). A stub on an existing object does not slow.

For the suite this is small. It makes about 85 objects, which is the first
two batches of the table, 2 to 4 ms for each.

### Is any of it in the product?

No. The product was checked directly:

- One scope, 400 acts in batches of 50, observed: 106, 106, 118, 110, 101,
  101, 96 ms per batch (the first batch, 150 ms, includes the warm-up). Flat
  in the length of history. 200 summaries at 400 entries took 84 ms.
- Reading `core.ts`: `pinned()` caches the validated definition for the
  life of the object, and a restart reads it once. A turn reads the head
  and the rows it needs through the store, and the idempotency check is by
  key. No call folds the whole state or re-validates the definition.
- Test support: `controls(name)` is a map by name. `Gate` and `ScriptedClock`
  keep no list that grows.

So the DK11 note is right that the cause is not in this source. It was
incomplete in one way: a path that never reaches an object shows the same
growth (here measured with an empty route), and so does `evict`-free object
making. Neither is a product defect, and no product change is justified.
The pool's maintainers could be told of the first finding. I did not file
anything.

## 3. Changes made

### Change 1: read the history over the routes in the test's isolate

The tests that read a history through the replay verifier's `httpSource`
(`replay.test.ts` twice, `founding.test.ts`, `texts.test.ts` for both its
source and its client transport, and lane test T9) each made calls through
`SELF.fetch`. About 150 of the 176 entrypoint calls of a run were these.
They now pass `route(new Request(url, init), env.NET)`: the same function
the Worker's `fetch` runs, over the same namespace, so the HTTP routes, the
status codes and the verifier's reading are still the code under test. What
no longer runs is the pool's entrypoint wrapper, which is not what these
tests are about. `routes.test.ts` and `client.test.ts` keep the one test
for each of the two entrypoint paths, as docs/testing.md asks, and the lane
fixture keeps its `http` transport for the founding, one act and its
presented fact.

Invariants: none removed, none weakened; no assertion changed. The tests'
names and bodies are as before except for the `fetch` they pass.

Observed, three runs of `npx vitest run --project scope`, summed test time
and wall time from the JSON report:

| | Summed test ms | Wall ms (first test start to last end) |
|---|---|---|
| before (3 runs) | 3911, 3932, 3940 | 4750, 4831, 4820 |
| after (3 runs) | 3100, 3115, 3175 | 3887, 3895, 3946 |

About 0.8 s less, 20 percent of the project. The whole `npx vitest run`
(three runs each) went from 5.38 to 5.52 s to 5.11 to 5.14 s, which is less
than the project alone shows. The other projects ran in the same period and
other sessions load the machine, so I do not read more into that figure.

Unlike my fit in section 2, the saving is larger than the model predicts
(0.2 s). I did not find out why. A likely part is that calls through the
entrypoint also cost every other call in the isolate more (the calls to the
runner object), but I did not measure that.

## 4. Ranked: what would reduce the cost further

Estimates, labelled. None done.

| # | Change | Estimated gain | Cost and risk |
|---|---|---|---|
| 1 | Report the first finding (cost of an entrypoint call grows with calls made) to the pool's maintainers, with the probe above. | not for this repository; the suite makes about 30 such calls now | none |
| 2 | Share one lane office across the scenarios that only read it. | at most 0.2 s (eight foundings at 30 ms) | the scenarios write: they would depend on each other's content and order. docs/testing.md says writes get their own. Not recommended. |
| 3 | Make `found` cheaper: the definition is validated and canonicalised at each founding (7 ms). A test that founds many scopes under one made-up definition would gain by sharing the validated value across objects of one isolate (a cache keyed by the definition's digest, in test support only). | about 0.15 s over the 46 foundings (estimate) | a cache in the product is a risk to the rule that a scope reads a definition again after a restart; keep it in test support if at all |
| 4 | Fewer objects per test: several tests build a desk, two tickets and settle them, to show one delivery property. | 2 to 4 ms per object avoided, under 0.2 s in all (estimate) | each is a different invariant; audit first |
| 5 | The 0.7 s of pool start and imports. | none available in this repository | |

The remaining time is real work: about 235 acts at 2.2 ms and 220
deliveries. A further reduction of the scope project below about 3 s needs
fewer acts and deliveries in the scenarios, which means removing or
merging tests. docs/testing.md allows that only with the audit of
invariants, so it is a decision for the owner, not a mechanical edit.
