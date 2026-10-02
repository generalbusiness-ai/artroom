# Bounded-memory log publication

2026-10-02. Request 5a7290b9. Branch `request/log-bounded`, from main
`417a1618`. Checker reviews de5289a5 and 2a43661d found that the Room
built the whole active segment and tree in memory.

## Summary

- The Room no longer holds its log, or a whole segment, to publish it.
  The publisher reads entries from the Room's SQLite in bounded batches
  and streams each segment blob. It makes the same commits as before.
- In Node, the publication of a 66.5 MiB active segment held at most
  17.2 MiB above its baseline after a full GC. The publisher of
  `417a1618` held 203 MiB and could not run in a 128 MB heap.
- Live, on Artifacts, a Room published a 31.5 MiB active segment with
  three entries near the 2 MB row bound. It was reset in the middle of
  staging, resumed from the staged bytes, and the log verified.
- **Condition 2 cannot be met as written on Artifacts.** Artifacts
  refuses any git object over 32 MiB (33,554,432 bytes). Under R-LOG-9 the
  active segment is one blob, so no segment over 32 MiB can be pushed. A
  64.6 MiB active segment was computed and fully staged through the live
  Room, reset and resumed, and then the push was refused. This limit is
  in Artifacts and the contract's layout, not in this change. It needs a
  contract decision (see "Not done").

## Design

### Publisher (lane L, `packages/log/src/publisher.ts`)

- **Entries from a source.** `publish` and `commitFor` take
  `readonly LogEntry[] | EntrySource`. An `EntrySource` has `through` and
  `read(from, limit)`. Arrays are still copied before the first `await`,
  as before. A source reads sealed entries, which never change.
- **Each line is checked on every read.** The publisher canonicalizes
  each entry with lane L's `canonicalize`, exactly as before, and checks
  its seq. A read that returns the wrong number of entries is
  `invalid-input`.
- **A segment blob is streamed.** A git blob's ID is SHA-1 over
  `blob <size>\0` and the bytes, so the size must be known first.
  1. Read the lines one entry at a time and record each line's length.
     This is a `Uint32Array` of at most 1,000 numbers.
  2. Read them again and hash them with an incremental SHA-1. Each length
     must equal the first pass's, or the call fails with `invalid-input`.
  3. To send a part, find the line that holds the part's offset from the
     lengths, read from there, and copy only the part's bytes. Each length
     is checked again.
- **Read limits.** The first pass reads one entry at a time, since sizes
  are not yet known. Later passes read at most `READ_LIMITS` (64 entries,
  1 MiB by the measured lengths), and always at least one entry. One
  entry is bounded by the Durable Object SQLite row limit of 2 MB.
- **Reuse by ID.** The publisher keeps an index of its last commit: the
  blob ID of each segment, the path and blob ID of each retained file, the
  genesis blob, the checkpoint's `through` and `hash`, and the IDs that
  commit's tree holds. A full segment never changes (R-LOG-9), so it is
  reused by ID and never read again.
- **Retained files.** `retained` may hold `RetainedRef`s: kind, digest
  and `load`. A file the parent holds, by the path its digest names, is
  reused by ID and not loaded. A new file is loaded to hash it, and again
  when it is sent. Its length must not change between the two loads.
- **Trees and commit.** These are small and built in memory, with the
  same entries `buildTree` makes, so the IDs are the same.
- **Rewrite checks** (`would-rewrite`), with the parent's index:
  - the cohort does not end before the parent's checkpoint;
  - the cohort's entry at the parent's checkpoint has the checkpoint's
    hash;
  - the published part of the parent's last segment hashes to that
    segment's blob ID. This is checked in pass 2 by a second SHA-1 over
    the prefix.
  The old publisher compared every published line. The new one does not
  read full segments, so a caller's changed copy of one is not detected.
  It cannot be published either, since the segment is reused by ID.
- **`open`** reads the head's trees and `checkpoint.json` only. A head
  without R-LOG-9's layout, or whose segment count does not match its
  checkpoint, is `unexpected-writer`. The Room handles that code as it
  handles its own fence.
- **`commitFor`** stays synchronous. With the publisher's last commit as
  the parent, it reuses the index and makes the rewrite checks. With any
  other parent, it builds every segment from the source and uses only the
  given retained files, as before.
- **Staging** is unchanged: ask what is missing, send parts of at most
  `maxTransfer` (8 MiB) from where each object's staging stopped, then
  push the commit alone. A publication within one transfer is still
  pushed whole.
- **`stats`** counts the publisher's own buffers: the largest read batch,
  the most bytes sent in one call, the largest object built whole, the
  largest segment, and the bytes hashed and sent.

### Room (lane A, `packages/room`)

- `logSource(sql, through)` in `src/log.ts` is the `EntrySource`: each
  read is `SELECT body FROM entries WHERE seq > ? ORDER BY seq LIMIT ?`.
- `retainedRefs(digests)` in `src/core.ts` replaces `retainedFiles`: it
  reads each file's kind now and its body only when `load` is called.
- `publish` and `upgradePublication` pass these instead of
  `entriesAfter(sql, -1, n + 1)` and every retained body. The pending
  cohort, its stored commit and the fence are unchanged.
- `src/logremote.ts` encodes object bytes as base64url in one buffer
  (`partB64url`). The shared `b64url` builds its string by concatenation,
  which makes a rope. In Node, encoding one 8 MiB part that way raised the
  heap by 153.6 MiB; `partB64url` raised it by 0.2 MiB. The text is
  identical (`test/node/logremote.test.ts`).
- `PublisherPort` (`src/ports.ts`) now takes an `EntrySource` and
  `RetainedRef`s.

No change was needed in `packages/git`.

## What still grows with the log

These are not hidden. They are held as IDs, not content:

| Item | Size |
|---|---|
| One segment blob ID per 1,000 entries | about 60 bytes each |
| One path and blob ID per retained file, in the index | about 250 bytes each |
| The `inputs/` and `policies/` trees, built whole | 97 bytes per file |
| The pending cohort's list of retained digests (unchanged) | about 75 bytes each |

R-LOG-9 makes `inputs/` one tree object. A room with about 200,000
retained files would hold about 85 MB in these. Streaming those trees
from SQLite would need a cached blob ID per retained file in the Room's
storage. That is a further change to the Room's schema, not made here.

## Tests

Log package (`packages/log/test/bounded.test.ts`, 18 tests):

- **The same commits as `417a1618`.** The old publisher is kept,
  unchanged except for its import paths, as
  `test/support/publisher-417a1618.ts`. Over a log of 3,002 entries,
  published at seq 37, 999, 1000, 2600, 3000 and 3001, every `commitFor`
  and every `publish` of the new publisher equals the old one's. This
  holds from arrays and from sources, staged in 4,093-byte parts and not,
  and with restarts. `commitFor` with another parent also matches. A
  second test rebuilds the commit from R-LOG-9's files with `buildTree`
  and gets the same ID.
- **Bounded reads.** After a publication of 2,500 entries, the next
  publication reads no entry below 2,000. A staged publication reads each
  part's lines from where the part starts, and sends each segment byte
  once. A retained file the parent holds is not loaded.
- **Guards.** A line whose length changes between the size and ID
  passes, or while a part is read, and a retained file whose length
  changes, are each `invalid-input` with nothing pushed. Out-of-order
  entries and a short read are `invalid-input`. In-memory staging skips a
  part at the wrong offset and says where to resume. A remote that drops
  every fifth stage call still gets the right commit. Every part of a
  segment equals the reference blob's bytes, for part sizes 1, 2, 3, 97,
  1,000, 1,001 and 4,096 bytes. `would-rewrite` covers a changed
  published entry, a changed hash at the checkpoint (including when the
  parent's last segment is full) and a shorter log.
- **`open`** reads one blob (`checkpoint.json`), and refuses a non-log
  head and a head whose segments do not match its checkpoint.
- **Large entries.** An active segment over one transfer with an entry
  near the 64 KiB envelope bound, and an entry of 1.9 MB among small ones,
  which is read alone.

Room package: `test/workerd/log-bounded.test.ts` publishes 1,012
entries with a retained replay context per note, then 6 more. No read
takes more than `READ_LIMITS.entries`; the second publication reads no
entry below seq 1,000; only the 5 new replay contexts are loaded; the
log verifies. `test/node/logremote.test.ts` checks `partB64url`.

## Mutation tests

Each mutant was applied, the named tests run, and the file restored.
Scripts: `logbounded-mutants.py` and `logbounded-room-mutants.py` in the
session scratchpad. All 17 were killed.

| Mutant | Killed by |
|---|---|
| M1 size: the ID pass ignores a changed line length | size mismatch between the size and ID passes |
| M2 size: a part's read ignores a changed line length | size mismatch while a part is read |
| M3 size: a retained file's send ignores a changed length | a retained file whose body changes |
| M4 order: a source's seq order is not checked | out of order: a source that returns entries out of order |
| M5 chunks: in-memory staging accepts a part at any offset | out of order: staging skips a part at the wrong offset |
| M6 chunks: a part starts one line late | the 417a1618 comparison; every part equals the reference bytes |
| M7 chunks: every part is sent from offset 0 | 10 tests, including the staging tests |
| M8 serialization: the parent's last segment is reused while it grows | 16 tests, including the 417a1618 comparison |
| M9 serialization: the segment ID omits the line separators | 32 tests |
| M10 serialization: the parent's retained files are not kept | commitFor after a restart; bounded reads |
| M11 rewrite: the published prefix of the last segment is not checked | published history is never rewritten (2) |
| M12 rewrite: the entry at the parent's checkpoint is not checked | would-rewrite when the parent's last segment is full |
| M13 open: segments are not checked against the checkpoint | a head whose segments do not match its checkpoint |
| R1 Room: the stored commit computed without retained files | 10 Room workerd tests |
| R2 Room: a confirmed commit other than the stored one is accepted | review 8faa2ef9's test |
| R3 Room: `partB64url` drops the last partial group | `partB64url` test |
| R4 Room: `logSource` reads from the seq before the one asked | 3 Room workerd tests |

Two first mutants survived and changed the tests: a total-size check
duplicated the per-line check (the total check was removed), and the
order and checkpoint tests could be passed by another guard (the tests
now isolate each guard). A first form of M6, a part starting one line
early, is equivalent: it only reads one more line.

## Memory

### Node (V8, the engine workerd runs)

`packages/log/scripts/memory.ts` publishes the same log with both
publishers. Segment 0 is 66.5 MiB: claims near the 64 KiB envelope
bound and three `notified` events of 1,984,433 bytes. Each publisher
publishes through entry 949, then the measured publication takes the
segment through entry 999 and stages it in 8 MiB parts. The remote is a
sink that hashes parts and keeps only small objects. It also encodes
each part as the Room's log remote does.

Measured: `process.memoryUsage()` heap used plus array buffers, sampled
at every source read, stage call and push, minus the same after a full
GC before the publication. "Live" samples run a full GC first, every 8th
sample.

| Publisher | Live peak | Peak with garbage | Heap limit | Result |
|---|---|---|---|---|
| Bounded, `EntrySource` | 17.2 MiB | 60.7 MiB | default | same commit |
| Bounded, `EntrySource` | 11.9 MiB | 52.8 MiB | 48 MB | completed |
| 417a1618, whole log as an array | 203.3 MiB (at stage calls only) | 743.3 MiB | default | same commit |
| 417a1618, whole log as an array | — | — | 128 MB | aborted: heap out of memory |

Results: `packages/log/scripts/results/memory-2026-10-02T02-25-36-938Z.json`,
`memory-2026-10-02T02-26-02-597Z.json` (48 MB) and
`memory-2026-10-02T02-26-24Z-417a1618-heap128.txt`.

### Live, in the Room's Durable Object

workerd does not expose heap use: `process.memoryUsage()` returned all
zeros in the deployed Room. What was measured instead:

- **The publisher's own buffers** (`stats`, read from the live Room after
  each publication): the largest read batch was 2,013,297 bytes (one
  entry near the row bound, read alone); the most sent in one call was
  8,388,608 bytes; the largest object built whole was 564 bytes; the
  largest segment was 67,741,983 bytes and was never held.
- **What the code holds at its peak**, by construction: one read batch
  (at most one 2 MB entry, or 1 MiB of entries) with its parsed objects
  and strings; one 8 MiB part; its base64url buffer and string (11.2 MB
  each); and the RPC's copy of the request. That is about 45 MB of
  buffers, plus the index and trees, which are small here.
- **Outcomes**: `wrangler tail` captured 2,695 events across all runs.
  None was `exceededMemory` or `exceededCpu`. Two were `canceled` (a
  sandbox call cut short when the Room was reset), and one was the
  harness's own `aborted` reset. The most CPU in one Room invocation was
  11.4 s, in the 64.6 MiB publication (the 30 s default applies). Summary:
  `packages/room/measure/logbig/results/tail-summary-2026-10-02.json`.

The old publisher was not deployed for comparison. The Node figures
above show it cannot fit 128 MB at this size.

## Live matrix

Harness: `packages/room/measure/logbig/`. `worker.ts` is the real Room
Worker (Room, Registry, lane B's Publisher sandbox, the Artifacts
binding) with a key-protected `/lb/` route, deployed as
`artroom-lb-logbig` on namespace `gitseq-spike`. Claims go through the
Room's real admission, with envelopes near 64 KiB. The three large
entries are `notified` events sealed through the Room's own
`sealSystem`, since a real one that large needs about 31,000 members.
Publication is the Room's own `RoomCore.publish`. The harness defers
alarms, so the driver decides when to publish. A reset is `ctx.abort()`
after the second staging call that carries parts.

All runs were on 2026-10-02. Each founded a room, which created its own
repository. Each revoked every token on that repository and deleted it.
The Worker was deleted afterwards (`wrangler delete`).

| Result file | Run | Outcome |
|---|---|---|
| `logbig-2026-10-02T02-47-47-450Z.json` | 64 MiB target, publish every ~100 entries | Publications through 26.4 MiB succeeded. At 32.6 MiB every push failed (`unresolved`), and the same cohort was retried to the end |
| `logbig-2026-10-02T02-52-36-597Z.json` | Same, with a push probe | The probe gave Artifacts' answer: `artifacts_git_receive_pack_object_too_large` |
| `object-limit-2026-10-02T02-55-14-470Z.json` | One blob per push | Accepted: 30 MiB, 32 MiB − 1 KiB and 32 MiB exactly. Refused: 32 MiB + 1 byte and 33 MiB random, 32 MiB + 1 byte and 40 MiB of text |
| `logbig-under32-2026-10-02T02-57-56-937Z.json` | under32, timed reset | After the reset, one transient `INTERNAL_ERROR`; the driver then stopped (it had no retry) |
| `logbig-under32-2026-10-02T03-00-07-677Z.json` | under32, timed reset | The reset came after the publication finished: not mid-publication |
| `logbig-under32-2026-10-02T03-03-22-033Z.json` | **under32, reset after the 2nd staging call** | **Passed** (below) |
| `logbig-over64-2026-10-02T03-05-39-537Z.json` | over64 | After the reset, one transient `transport` error; the driver did not retry |
| `logbig-over64-2026-10-02T03-07-24-727Z.json` | over64 | Reset and refusal as below; the publisher's counters were lost with its failure, so the harness now keeps them |
| `logbig-over64-2026-10-02T03-12-22-931Z.json` | over64 | Run straight after a redeploy; the version change reset the Room during its first publication and the steps fell out of order |
| `logbig-over64-2026-10-02T03-14-06-002Z.json` | **over64, reset after the 2nd staging call** | **Staged, reset, resumed; then refused by Artifacts** (below) |

### under32: passed

- 420 claims and three entries of 2,013,297 bytes: an active segment of
  429 entries and 33,035,085 bytes (31.5 MiB).
- Publications at seq 102, 204, 306 and 407 took 5.3 to 15.9 s.
- The publication through 428 was reset after its second staging call.
  The pending cohort was stored before the reset.
- After the reset, the Room published the same pending commit
  (`resumedSameCommit: true`). It sent 16,257,869 bytes of the segment:
  the segment less the two 8 MiB parts staged before the reset.
- One more publication (the checkpoint event) took 16.2 s.
- `artroom verify` on a fresh fetch: exit 0, verified through 429, 6
  commits, no failures. The ref was the last commit.

### over64: Room side passed; Artifacts refused the push

- 960 claims and three entries of 2,013,297 bytes: an active segment of
  966 entries and 67,741,983 bytes (64.6 MiB).
- The Room computed the cohort's commit, began staging, and was reset
  after the second staging call.
- After the reset, the same pending cohort was staged from where it
  stopped: 50,964,767 bytes sent, the segment less two parts. The
  publication took 32.5 s.
- The push was refused: `artifacts_git_receive_pack_object_too_large`.
  Each later attempt found nothing missing, sent 0 bytes, and was
  refused again. The Room keeps `unresolved` and retries the same cohort.
- The log published before it (through 101) verified.

## Gates

Run at the head that adds these notes; later commits change only these
notes. All exited 0.

| Gate | Tests |
|---|---|
| root `npm run typecheck` | — |
| root `npm test` | everything in the rows below marked "in root", plus policy 199 Node and 198 workerd (1 skipped), and ui 88 |
| log `test:node` (in root) | 145 (127 before) |
| log `test:workerd` (in root) | 140 (122 before) |
| git `test`, Node (in root) | 143 |
| git `test:workers`, workerd | 8 |
| git `test:log`, lane L's publisher through `pushLog` | 11 |
| room `test:node` (in root) | 68 (67 before) |
| room `test:workerd` (in root) | 276 (275 before) |

## Not done

- **An active segment over 32 MiB cannot be published to Artifacts.**
  Artifacts refuses any git object over 32 MiB, and R-LOG-9 makes the
  active segment one blob of up to 1,000 entries. With entries near the
  64 KiB envelope bound, a segment passes 32 MiB at about 500 entries.
  The Room then retries the same cohort as `unresolved` for ever, and the
  log stops being published. This needs a contract decision: for
  example, a segment that closes at a byte bound as well as at 1,000
  entries. Until then, condition 2's "active segment over 64 MiB" can be
  exercised only up to the push, as above.
- The `unresolved` loop does not tell anyone why. Lane B's `pushLog`
  maps the refusal to `unknown`. A named, non-retryable outcome would let
  the Room attend its admins, as it does for another writer.
- The index, the `inputs/` and `policies/` trees and the pending
  cohort's digest list still grow with the number of retained files (see
  "What still grows with the log").
- No live heap figure: workerd reports zeros for `process.memoryUsage()`.
