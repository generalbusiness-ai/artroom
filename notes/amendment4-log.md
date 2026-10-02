# Amendment 4 in lanes L and B: layout 2 of the log

2026-10-02. Request f77571a6. Branch `request/a4-log`, from main
`b377f170`. Contract amendment 4 is `docs/protocol.md` section 30.

## Summary

- `packages/log` writes and verifies layout 2 whenever the checkpoint
  names it (`layout: { version: 2, from }`), and layout 1, unchanged,
  whenever it does not. In layout 2 no git object the log writes is over
  B, 8 MiB, whatever the size of an entry or file.
- The rules of layout 2 are in one module, `packages/log/src/layout.ts`.
  It mirrors the reference functions of
  `packages/contract/examples/log-layout.ts`, and the tests compare the two
  over random inputs.
- `packages/git` reports Artifacts' refusal of an over-limit pack, and
  every `[rejected]` or `[remote rejected]` status other than the lease, as
  `refused`, not `unknown`. Lane L's publisher then reads the ref back once,
  fails with `refused`, and does not push the commit again.
- The Room (`packages/room`) is not changed. Its checkpoints carry no
  `layout`, so it still writes layout 1. The log package's API changes are
  additive, so the Room compiles as it is. The only behaviour the Room can
  see now is that a refused push ends a `publish` call after one push with
  the code `refused`. Before, it was retried until `unresolved`. The Room
  still records the code and retries the same cohort on its next call. It
  adopts R-LOG-20 in its own later request (section 30.9, lane A).

## What changed

### Lane L (`packages/log`)

- **`src/layout.ts`: one implementation of the rules.**
  - `Placement` places one entry at a time by R-LOG-17. `segmentStarts`
    is built on it.
  - `chunks` gives the chunks of any file over B (R-LOG-18).
    `chunkedLine` and `placedBytes` give the stub of an entry over B.
  - `shard` is the fan-out of R-LOG-19, and `shardsOf` and `shardPaths`
    are built on it.
  - `fanTrees` is the one tree builder. It builds every directory set
    (`segments/`, `entries/`, `inputs/`, `policies/`) and every chunk
    directory. It reuses a parent tree by ID when no member under it is
    new or changed.
- **Publisher (`src/publisher.ts`).**
  - `plan` writes the layout the checkpoint names. It reuses the parent's
    closed segments and unchanged shard trees. It reads the parent's open
    segment again and places every later entry with `Placement`.
  - A line over B, from `from` on, becomes the chunked file
    `entries/<seq>.jsonl`, with a `ChunkedLine` in its segment. A retained
    file or the genesis over B becomes a chunk directory. One function,
    `file`, plans every file, chunked or not, in one pass. The pass reads
    the file's bytes in parts, for its SHA-256 and for each blob ID.
  - The `Index` keeps each segment's `first` and blob ID, each chunked
    entry, each retained file by path, and each shard tree by path.
  - **Guard.** Every object a layout 2 commit would write is checked
    against B in `plan`, so both `commitFor` and `publish` refuse it, with
    `object-too-large`, not retryable. Objects the parent holds are not
    checked, and nor is a segment that holds only entries before `from`.
  - **Layout chain.** A first commit must have `from` 0. The first
    layout 2 commit after layout 1 must have its parent's `through` plus
    one. Every commit after a layout 2 commit must be layout 2 with the
    same `from`. Anything else is `invalid-input` (`layout-changed`).
  - **Parts.** An `EntrySource` may return an `EntryLine`, a line read in
    parts. A `RetainedRef` may have `bytes` and `read`. Neither is then
    held whole. Each is hashed in parts of at most `READ_LIMITS.bytes`,
    and sent in parts of at most one transfer. The seq and hash of a line
    given in parts are read from the line's fixed end.
  - **The switch.** At the switch every kept retained file over B is
    chunked, so the publisher needs each file's size. It knows the size of
    every blob it has hashed. After `open`, it loads each kept file once.
    So the switch commit needs every retained file the parent holds, as
    the Room already passes them; otherwise it is `invalid-input`.
  - **Refusals.** `PushOutcome` gains
    `{ ok: false, reason: "refused", code, detail }`. After a refusal the
    publisher reads the ref back:
    - at the commit: the commit is confirmed;
    - at the lease: `PublishError` `refused`, not retryable, with
      `refusal`. The commit is not pushed again;
    - anywhere else: `unexpected-writer`. Its `current` names the commit
      at the ref, so the Room can match it against its outstanding
      commits.
  - `LogPublisher.open(remote, opts, head)` builds on a commit the caller
    names as its own, such as a late commit it has just confirmed.
    `readIndex` checks layout 2's shape from trees alone.
  - `MemoryGit` can refuse like Artifacts: `objectLimit`, and `failNext`
    `"refused"`.
  - `makeCheckpoint` takes an optional `layout`.
- **Verification (`src/tree.ts`, `src/verify.ts`).**
  - `readLogCommit` reads a commit in the layout its checkpoint names. In
    layout 2 it follows shard directories with the same walker as
    `readIndex` (`walkSet`). It reassembles chunk directories
    (`readChunks`) and checks every blob outside `segments/` against B.
  - `commitLines` gives the entry lines in both layouts. It resolves each
    `ChunkedLine` and checks segment starts against R-LOG-17.
  - Verify adds `layout-changed`, `segment-bound`, `chunk-mismatch`,
    `object-too-large` and `fan-out`. It compares every segment but the
    last across commits, and requires the last to stay where it starts.
  - `readLogFiles` and `readPublishedEntries` keep their signatures. They
    now return files by logical path, with chunks reassembled.
- **Decoding.** `decodeCheckpoint` accepts `layout` only as exactly
  `{ version: 2, from }`. `decodeChunkedLine` recognises a stub, which
  must be a canonical `ChunkedLine`.

### Lane B (`packages/git`)

- `classifyGitPush` reports a push that fails with
  `remote: artifacts_git_receive_pack_object_too_large` as `rejected`
  (`remote-rejected`), unless a status line for the ref says otherwise.
  Without this, git's "remote end hung up" made it `unknown`.
  `ARTIFACTS_REFUSALS` lists only codes that Artifacts gives before it
  updates any ref.
- `toLogOutcome` maps every `rejected` outcome other than the lease to
  `refused`. The code is the Artifacts code, or else the kind of status.
  `LogPushOutcome` gains the case. The test that it is the same type as
  lane L's `PushOutcome`, both ways, still holds.

## Acceptance cases (30.7)

Test files:
- `packages/log/test/amendment-4.test.ts` (A4);
- `packages/log/test/amendment-4-large.test.ts` (A4L);
- `packages/git/test/push-outcome.test.ts`, `test/gitops.test.ts` and
  `test-log/pushlog.test.ts` (B).

| Case | Test | Notes |
|---|---|---|
| Byte close | A4 "Byte close" | 270 entries of about 65,000 bytes. Segment 0 closes after 129 large entries. Earlier segments are unchanged across two commits. Every blob is at most B (`MemoryGit.objectLimit = B`). Verify passes |
| Count close | A4 "Count close" | 2,100 small entries: segments at 0, 1,000 and 2,000 |
| Edge | A4 "Edge" | An entry that makes segment 0 exactly B bytes is appended. One a byte longer starts a new segment |
| Determinism | A4L "Retained prefix and determinism"; A4 "open on a layout 2 head ... continues it"; A4L "Unpublished old entry" (whole and in parts) | Two publishers, and one before and after a restart, make the same commit. Files sit where `shardsOf` and `chunks` say |
| Old log | A4L "Old log" | Layout 1 with a 20 MiB full segment. It verifies, and is the same commit that publisher `417a1618` makes |
| Switch, large open segment | A4L "Switch, large open segment" | 300 entries, over 20 MiB. The switch commit is layout 2 from W + 1. The segment is unchanged and not sent again. Another publisher computes the same commit |
| Switch, small open segment | A4 "Switch, small open segment" | Three entries open at the switch. The segment continues and closes at 1,000 |
| Unpublished old entry over B | A4L "Unpublished old entry over B" | Entry 1 is a line of exactly 8,388,609 bytes. Segment 0 is entry 0 and the `ChunkedLine`. The chunks are 8,388,608 and 1 bytes. Verify checks entry 1's hash and signature |
| Retained prefix | A4L "Retained prefix and determinism" | 5,000 contexts whose digests start with `ab`, plus a 20 MiB context and a 20 MiB policy. `inputs/ab/` splits again. Each 20 MiB file is three chunks. Verify replays decisions with both |
| Many segments | A4L "Many segments" | 5,000,000 entries; see "Scaled" |
| Large notification | A4L "Large notification" | 200,000 recipients, as a chunked entry given in parts; verified |
| Large revert | A4L "Large revert" | 100,000 paths, as a chunked entry; verified |
| Large activation | A4L "Large activation" | 2,000 checker configurations, a 20 MiB policy (chunked) and 500 `obligations-recomputed` events; verified, decisions replayed |
| Layout regression | A4 "Layout regression" (two tests) | Layout 1 after layout 2; another `from`; a first layout 2 commit whose `from` is not its parent's `through` + 1 |
| Misplaced boundary | A4 "Misplaced boundary" | `segment-bound` |
| Bad chunk | A4L "Bad chunk" (an entry file: a changed byte, and the same bytes cut into other chunks); A4L "Retained prefix" (a chunk of the 20 MiB policy) | `chunk-mismatch` |
| Guard | A4 "Guard" | A faulty placement, injected with a spy, plans a 9 MiB segment. Nothing is stored or pushed; `object-too-large`, not retryable. Lane L's part only: the admin item is lane A's |
| Refused push | A4 "Refused push and recovery"; B "Artifacts' recorded refusal ..."; B test-log "a remote that refuses the pack with Artifacts' code" | Lane B reports `refused` with the code. The ref reads back at the parent, and the commit is not pushed again. The admin item and continued admission are lane A's |
| Refused, by status | A4 "Refused, by status"; B gitops "any other rejection is refused" | |
| Late earlier push | A4 "Late earlier push" (both orders) | C lands first: D is `unexpected-writer` with `current` C, and the publisher opened at C builds on it. D lands first: C's late push is a lease mismatch |
| Late push during the switch | A4 "Late earlier push during the switch" (both orders) | The `from` is one past C's or P's `through`; verify passes |
| Unclear answer | A4 "Unclear answer" | The same commit is pushed again. The one-hour admin item is lane A's |
| Recovery | A4 "Refused push and recovery" | After a refusal, layout 2 on the confirmed parent is accepted, and the refused commit cannot apply. The admin item is lane A's |

Also: "the shared rules agree with the contract's reference functions" (six
tests), the decoding tests, "the publisher refuses ... layout-changed",
"At the switch every retained file moves to its layout 2 path", "a line
or file of exactly B is not chunked; one byte more is", "a layout 2
segment over B ... is object-too-large", and "an EntryLine must be the
entry it stands for".

## What is scaled

- **Many segments.** 5,000,000 entries, the full count. The entries
  between the genesis and the last are one-byte lines, given as
  `EntryLine`s. So the publisher places, hashes and sends 5,000 segments,
  and `segments/` splits into `000/000` to `000/004`. Verify is not run on
  this log, because the lines are not signed entries. Verify's fan-out
  walk is covered by "Retained prefix". A restarted publisher reads the
  fanned-out index. Its next commit encodes only the root, `artroom-log/`
  and `v1/` trees (`stats.treesBuilt` is 3).
- **Refused push and recovery.** Artifacts' 32 MiB limit is scaled to B
  in `MemoryGit.objectLimit`. So the refused layout 1 segment is 9 MiB,
  not 33 MiB. The code path is the same.
- **Large notification and large revert.** The recipients' handles (about
  45 characters) and the paths (about 85 characters) are long enough that
  each event's line passes B. With shorter names, 200,000 recipients or
  100,000 paths make a 3 to 7 MiB line, which is not chunked.
- **Retained prefix.** The 5,000 files are small replay contexts, found by
  trying salts until a digest starts with `ab`.
- Everything else uses the amendment's sizes: 64 KiB entries, 20 MiB
  segments and files, and B + 1 bytes.

## Bounded memory (condition 5)

- No whole segment is held, as before (request 5a7290b9). A chunked
  entry's segment holds its stub. When the segment is sent, the line is
  not read again.
- A chunked file is never held whole when its source gives it in parts.
  It is hashed in parts of at most `READ_LIMITS.bytes` (1 MiB), and sent
  in parts of at most one transfer (8 MiB).
  - "Unpublished old entry over B", in parts: no read of the line is
    larger than one transfer. The hashing reads are at most 1 MiB, and
    `peakObjectBytes` is under 64 KiB.
  - "Retained prefix": `load` is never called, and `peakObjectBytes` stays
    under 400,000 bytes, with two 20 MiB files.
- A source that returns a `LogEntry` object, or a `RetainedRef` with only
  `load`, gives the publisher the whole value. Nothing then holds it in
  parts. The Room does this today. Storing and reading large entries and
  files in parts is lane A's edit 5.

## Mutation table

Each mutant was applied to the committed tree, its named tests were run,
and the file was restored. The runner is a script outside the repository.
The first run left three mutants alive: M19, M23 and M32. Each check was
masked by another one in the tests of that time, so the tests were
strengthened (commit "three tests that the first mutation run showed were
masked"). All three were then killed.

| # | Mutant | Killed by |
|---|---|---|
| M1 | `Placement` ignores the byte rule | A4 Byte close, Edge, segmentStarts agreement |
| M2 | Byte rule `>` B becomes `>=` B | A4 Edge |
| M3 | `from` is exclusive | A4 segmentStarts agreement |
| M4 | `placedBytes` counts a line over B whole | A4 chunkedLine/placedBytes, segmentStarts |
| M5 | `isChunked`: a line of exactly B is chunked | A4L exactly B |
| M6 | `chunks`: the last chunk is full size | A4 chunks |
| M7 | `shard` splits at 4,096, not over it | A4 shardsOf |
| M8 | `shard` takes groups from the wrong offset | A4 shardsOf |
| M9 | `fanTrees`: a changed member does not dirty its tree | A4 Byte close |
| M10 | `fanTrees` never reuses a tree | A4L Many segments (`treesBuilt`) |
| M11 | No guard | A4 Guard |
| M12 | Guard does not exempt old segments | A4L Switch, large open segment |
| M13 | A refusal is retried | A4 Refused push, Refused by status |
| M14 | `unexpected-writer` without `current` | A4 Late earlier push |
| M15 | Layout 1 allowed after layout 2 | A4 the publisher refuses |
| M16 | The real line instead of its `ChunkedLine` | A4L Unpublished old entry |
| M17 | A stub sent at the line's length | A4L Unpublished old entry |
| M18 | `file`: a file of exactly B is chunked | A4L exactly B |
| M19 | A chunk directory the parent holds is planned again | A4L Unpublished old entry (a remote that cannot stage; second run) |
| M20 | `readIndex` ignores fan-out problems | A4 a segment that does not follow on |
| M21 | `readIndex` allows layout 2 segment gaps | A4 a segment that does not follow on |
| M22 | Switch keeps kept files of unknown size | A4L At the switch |
| M23 | An `EntryLine`'s end not checked against its seq | A4L EntryLine (second run) |
| M24 | `decodeLayout` accepts any version | A4 layout is exactly |
| M25 | `decodeChunkedLine` accepts non-canonical lines | A4 ChunkedLine is recognised |
| M26 | Verify does not check the layout chain | A4 Layout regression (two) |
| M27 | Verify does not compare starts with R-LOG-17 | A4 Misplaced boundary |
| M28 | Verify does not check a stub's digest | A4L Bad chunk |
| M29 | `readChunks` does not check chunk sizes | A4L Bad chunk |
| M30 | Verify does not check blobs over B | A4 a segment that does not follow on |
| M31 | Verify does not check segments over B | A4L segment over B |
| M32 | `walkSet` does not check a member's shard | A4L Retained prefix (sibling shard; second run) |
| M33 | A changed chunked retained file is `retained-digest` | A4L Retained prefix |
| B1 | Classifier ignores the Artifacts code | B push-outcome |
| B2 | `artifactsRefusal` accepts any code | B push-outcome |
| B3 | `toLogOutcome` maps refusals to unknown | B gitops; B test-log |
| B4 | `toLogOutcome` drops the Artifacts code | B gitops |
| B5 | The Artifacts code wins over a landed status | B push-outcome |

## Gates

Run at the final head, one suite at a time:

| Gate | Result |
|---|---|
| root `npm run typecheck` | GATE-TYPECHECK |
| root `npm test` | GATE-ROOT |
| log, Node (`npm run test:node`) | GATE-LOG-NODE |
| log, workerd (`npm run test:workerd`) | GATE-LOG-WORKERD |
| git, Node (`npm test`) | GATE-GIT-NODE |
| git, workerd (`npm run test:workers`) | GATE-GIT-WORKERD |
| git, `npm run test:log` | GATE-GIT-LOG |

## Follow-ups and open questions

1. **A live check (not run here: another agent owns the spike
   deployment).** Publish layout 2 through the deployed publisher sandbox
   to an Artifacts repository:
   - an entry of B + 1 bytes;
   - a 20 MiB retained file;
   - a layout 1 open segment over 20 MiB at the switch.

   Confirm the pushes are accepted and `artroom verify` passes on a fresh
   fetch. Then push a layout 1 commit with a 33 MiB segment, and confirm
   that lane B reports `refused` with the code over the real sandbox.
2. **Other Artifacts refusal codes.** Only
   `artifacts_git_receive_pack_object_too_large` has been seen. Other
   codes Artifacts gives before any ref update should be added to
   `ARTIFACTS_REFUSALS` only once they are observed.
3. **`error` from `pushLog`** (nothing was sent) is still `unknown` to
   lane L, which reads the ref back and retries. R-LOG-20 counts as
   refusals only the remote's answers, so this is unchanged.
4. **The Room.** The Room is unchanged and writes layout 1. A refused push
   now ends a `publish` call with `refused` after one push; the Room
   records the code and retries the same cohort on its next call. The
   outstanding-commit list, the admin item and the switch to layout 2 are
   lane A's edits.
5. **A `RetainedRef` without `read`**, as the Room gives today, is loaded
   whole to hash it. At the switch after a restart, every kept file is
   loaded to learn its size. Sizes are cached by blob ID, so a file of
   at most B is loaded once for `commitFor` and `publish` together. A
   file over B is loaded again by `publish`. Its old blob is not the one
   written, so its size is not cached under that blob's ID. This happens
   only at the switch.
