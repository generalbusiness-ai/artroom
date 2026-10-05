# Test economy: bytes, client, replay

Request `520ebceb` and note `48030ca2` asked for three things: no test waits on
the wall clock, no table runs twice through two equivalent paths, and no
generic every-field sweep stays in the byte-domain tests. This note says what
changed, which test now witnesses each invariant, and what was left.

## What changed

- The client deadline tests and the replay deadline test use fake timers. The
  test advances the deadline by hand and resolves each pending response or
  read itself. The real timer stays the default in production code. No
  production file changed.
- The client reader's cases moved into their own test, with explicit
  resolution of a pending read and no timer at all.
- The reply-shape table ran over HTTP and over a service binding. It now runs
  once, through the binding. The tests of each transport keep only what is
  about that transport.
- `Gate` in `packages/scope/src/testing.ts` was a poll with a 1 ms timer. It
  is now two promises, one resolved by `pass()` and one by `release()`.
- The preparation limit test in `packages/scope/test/turn.test.ts` waited 10 ms
  of real time. It now runs under fake timers inside the workerd pool, which
  do reach the turn's own `setTimeout`. No port was added.
- `packages/bytes/test/domains.test.ts` is unchanged. Step 2 of the I1 work
  (commit `2ecfbb0ba`) had already removed the every-field digest sweep and
  the signature sweep. See the audit below.

## Audit: invariant, witness before, witness after

Client, `packages/client/test/intent.test.ts`.

| Invariant | Before | After |
|---|---|---|
| Submit and settle replies over HTTP are returned only when they are answers of the route | test 2, the `for` loops over `submit` and `settle` | same test, unchanged |
| The same rows for every operation, found to followDuty, are guarded | test 3, rows run over HTTP and a binding | test 3, rows run through the binding once (`ANSWERS` is one function) |
| No row of the table is empty | `checked` and `rows.every` | `rows.every(...)` (the `checked` count repeated the loops and is gone) |
| followReceipt rejects a reply that is no entry, returns a named refusal, reports a hash mismatch | test 3, both transports | test 3, binding |
| A body that is no JSON, or no UTF-8, is no answer (HTTP) | not witnessed | test 2, two rows |
| A failed fetch or a failed binding call is a TransportError that says so | not witnessed | test 2, two rows |
| Deep nesting is no answer over HTTP; a binding's result is disposed even when the guard throws | test 5 | test 5, unchanged |
| A body is cut at the byte limit, with nothing kept; the error says the outcome is unknown | test 6, first block | "taken in as raw bytes only as far as the limit", `sent` and messages |
| A failed read says it changed nothing | test 6, last line | same new test, last line |
| Deadline error with unknown submitted intent; request aborted (stalled body, silent service) | test 6, `stalled` and `silent`, 10 ms real timers | deadline test, `expired(...)` and `aborted` |
| Response after the deadline: no read starts, body asked to cancel | test 6, `pause(30)` and `pause(40)` | deadline test, `arrive(...)`, `{ reads: 0, cancels: 1 }` |
| A read pending at the deadline that answers later is not taken, no other read follows, cancel is not awaited | test 6, `pause(5)` | deadline test, `answer(...)`, `{ reads: 1, cancels: 1 }` |
| Empty chunks do not keep the deadline's timer from running, and no read follows the deadline | test 6, `pause(10)` | deadline test, last block, with a body that ends itself after 10 000 reads so a spinning reader fails by assertion |
| Chunks taken before the deadline are not given back after it | test 6, `pause(1)` and `abort()` | reader test, first block |
| A chunk or the end of a body answered in the turn of the deadline is not taken | not witnessed | reader test, loop over a chunk and an end |
| An empty chunk between others is passed over | test 6, `parts` | reader test, last lines |

Replay, `packages/replay/test/cli.test.ts`, test 3.

| Invariant | Before | After |
|---|---|---|
| Byte limit: too-large, body cancelled, 5120 requested | test 3 | test 3, unchanged |
| Entry limit: too-large | test 3 | test 3, unchanged |
| A silent service is a SourceError, no report | `seconds: 0.01`, real | deadline test, fake timers |
| A late read is `timeout`, and what it answers is not taken, no other read follows | `setTimeout(5)` | deadline test, `answer(...)` then `[reads, cancels]` is `[1, 1]` |
| A budget of zero scopes leaves nothing to report | test 3 | test 3, unchanged |

Scope, `packages/scope/test/turn.test.ts`, "preparation has a time limit".

| Invariant | Before | After |
|---|---|---|
| A preparation that outlasts its limit ends the attempt: answer `unavailable`, head unchanged | real 10 ms timer, rule held at the Gate | same test, the limit passed by `advanceTimersByTimeAsync(10)` |
| A preparation that finishes within its limit is not cut off | not witnessed by this test (the Gate tests of the head check use the default limit) | same test, second act released after 5 fake ms is `accepted` |

Bytes, `packages/bytes/test/domains.test.ts`: nothing removed. The six domain
mappings are one test, each with its tag, newline and canonical payload, and
six distinct digests. Two tests hold expected values written out by hand and
hashed once with Node's `crypto.createHash("sha256")`: one message and one
detached text (`2e10ada0b`). One signed intent has one altered payload, one
wrong key, one wrong domain and one altered signature. Malformed input is
one list answered false. There is no `changed()` helper and no field sweep
in this head, so there was nothing to remove.

`declared.test.ts` has no transport table (it uses a stub transport), so it is
unchanged.

## Controls

All with `scripts/control.mjs`, one change each.

| Change | Result |
|---|---|
| `takeBytes`: remove the check of an already expired exchange | distinguishes. The deadline test fails at `{ reads: 0, cancels: 1 }`, which got `cancels: 0` |
| `takeBytes`: drop `exchange.aborted` after the read | distinguishes. The reader test fails: a late end of the body returned bytes, not `LATE` |
| `takeBytes`: replace the empty-chunk timer turn with a microtask | distinguishes. The deadline test fails: the reply was read as an answer, not a deadline |
| `source.ts`: a timed-out read answers `unavailable` | distinguishes. The replay deadline test expects `timeout` |
| `Gate.pass()` does not wait | distinguishes. Two tests of `turn.test.ts` fail by assertion |
| `turn.ts`: the preparation limit is `seconds * 0` | distinguishes. The in-time act is cut off and the test fails at `accepted`; the head-check test fails too |
| `turn.ts`: the preparation limit is 6 ms longer (a second control) | inconclusive. The late act never ended, the run hung, and I stopped it. The test with 9 fake ms instead of 10 also hung, which shows the fake timer is the one in force |
| `source.ts`: remove `if (all === LATE) return unread("timeout")` | survives. `within` has already answered `timeout`, so the line cannot change a result |
| `takeBytes`: drop `Promise.race` with `expired` | survives in the replay test, for the same reason. In the client reader test it would hang, and was not run |

## Measured

All observed, one run each, a shared machine, warm cache, vitest's own
duration. Before is `77555943b`.

| Run | Before | After |
|---|---|---|
| `--project client` | 8 tests, 270 ms | 10 tests, 149 ms |
| `--project bytes` | 17 tests, 105 ms | 17 tests, 112 ms |
| `--project replay` | 23 tests, 445 ms | 24 tests, 426 ms |
| `npm test` | 282 tests, 6.26 s | 285 tests, 5.81 s |

The test count rises because three tests were split to keep fake timers in
one place. The time falls little: the gain is determinism. The old waits
added at most about 90 ms, and the figures are within the noise of one run.

## Left

- `tick` is gone, not kept: it had no comment giving a reason for a real
  millisecond, and promises do the same job.
- The line `if (all === LATE) return unread("timeout")` in
  `packages/replay/src/source.ts` is dead. The reader answers `LATE` only
  once its exchange is aborted. `within` aborts only after it has resolved its
  own `LATE`, which decides the race first. Nothing else holds the signal. The
  line is kept all the same: `takeBytes` returns `Uint8Array | null | LATE`,
  and without a branch for `LATE` the next line does not typecheck. A
  deletion would need a cast or a branch with an invented answer. The mirror
  condition `got.bytes === LATE` in `packages/client/src/http.ts` is the
  same: its other half, `got === LATE`, is reachable and decides first. Both
  are left as they are, with no production change. The fix, if wanted, is
  for `takeBytes` not to return `LATE` to a caller that has a `within`.
