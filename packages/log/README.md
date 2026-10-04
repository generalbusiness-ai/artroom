# @generalbusiness/artroom-log

> **Test file names below may be out of date.** Each section names the tests as they were when it was written. Request `ecbc722a` later merged and removed many test files; [plans/test-invariants.md](../../plans/test-invariants.md) is the current map from each invariant to its test.

This package publishes a room's log to git and verifies it offline. It is
lane L of Artroom. It has two parts:

- **Publication** (`LogPublisher`). The Room calls
  `publish(entries, checkpoint, retained)` for its sealed entries. The
  publisher builds one log commit and pushes it to `refs/artroom/log`. The
  Room then records the commit in a `checkpoint` event (R-LOG-8).
- **Verification** (`verifyLog`, and the command `artroom verify <remote>`).
  It fetches `refs/artroom/log` and checks everything that can be checked
  offline (R-LOG-10).

## Run it

```sh
npm install                          # at the repository root
cd packages/log
npm run test:node                    # all tests, including real git repositories
npm run test:workerd                 # the golden log in workerd (see Tests)
node src/cli.ts verify <remote>      # or: npx artroom-verify <remote>
```

`<remote>` is anything git can fetch from: a local path, `file://`, or an
HTTPS URL. For an Artifacts repository, pass the token in git's environment
(`http.extraHeader`), not in the URL. Exit status: 0 verified, 1 a check
failed, 2 the remote could not be read. Add `--json` for the full report.

## Publication

Each log commit holds the files of R-LOG-9:
- the genesis;
- segments of canonical entries;
- retained replay contexts and policy documents, named by their digest;
- the room-signed checkpoint.

The checkpoint names the commit's layout (R-LOG-16, contract amendment 4).
Without `layout` it is layout 1: R-LOG-9 as first written, with segments
of 1,000 entries. With `layout: { version: 2, from }` it is layout 2,
which keeps every git object the log writes at or under the object bound
B, 8 MiB, a quarter of Artifacts' measured limit:
- a segment closes at 1,000 entries, or, from `from` on, before the next
  line would take it past B (R-LOG-17);
- any file over B is a directory of B-byte chunks at its path. An entry
  whose line is over B is the chunked file `entries/<seq>.jsonl`, and its
  segment holds a `ChunkedLine` instead (R-LOG-18);
- `segments/`, `entries/`, `inputs/`, `policies/` and every chunk
  directory list at most 4,096 names, and split by name groups beyond that
  (R-LOG-19).

The rules are in one module, `src/layout.ts`, which mirrors the reference
functions of `packages/contract/examples/log-layout.ts`; the tests check
that the two agree. The publisher writes whichever layout the checkpoint
it is given names. The Room still writes layout 1 until it adopts layout 2
(lane A, a later request); `artroom verify` reads both.

The publisher follows these rules:

- **Owned cohort.** `publish` copies the canonical entries, the checkpoint
  and the retained files before its first `await`. The commit and the
  publisher's state come only from that copy. A caller that appends to or
  changes its arrays and objects during the push cannot change either.
- **Retained files are kept.** Each commit holds every retained file of the
  earlier commits, plus the new ones. They are named by digest, so they
  never change. `retained` needs to list only new files, and a restarted
  publisher reads the earlier ones back from the ref.

- **Order.** The commit's parent is the previous log commit. Its checkpoint
  names the last entry by seq and hash, never a commit. So nothing refers to
  itself.
- **Fast-forward with a lease.** The push moves the ref only from the commit
  the publisher last wrote (`--force-with-lease` on that exact commit). The
  new commit is always its child.
- **No rewriting.** An entry that is already published must be byte-identical
  in every later call. Otherwise the call fails with `would-rewrite`.
- **Retries complete forward.** The same input always gives the same commit.
  After any answer but a lease refusal, the publisher reads the ref back:
  - at the new commit: done;
  - at the old commit, after an unclear answer: it pushes the same commit
    again;
  - at the old commit, after the remote refused the push: it stops with
    `refused` (not retryable; `refusal` gives the remote's code and answer)
    and does not push again (R-LOG-20);
  - anywhere else: it stops with `unexpected-writer` and never forces.
    `current` names the commit the ref holds, so the Room can match it
    against its own outstanding commits.

  When retries run out, the error is `unresolved` and retryable. Calling
  `publish` again with the same input completes forward.
- **The layout follows the parent** (R-LOG-16). A log's first commit has
  `from` 0; the first layout 2 commit after layout 1 has its parent's
  `through` plus one; every commit after a layout 2 commit is layout 2
  with the same `from`. Otherwise the call is `invalid-input`
  (`layout-changed`).
- **The guard** (R-LOG-19). In layout 2, every object the commit would
  write is checked against B when it is planned, so `commitFor` and
  `publish` both refuse an object over B with `object-too-large`, not
  retryable, and nothing is stored or pushed. Objects the parent already
  holds are not written, so are not checked; nor is a segment that holds
  only entries before `from`, which layout 1 wrote.
- **Only what is new is sent, in bounded transfers.** A push carries the
  new commit and the trees and blobs its lease does not already hold: the
  segment the new entries are in, the checkpoint, the trees above them,
  and new retained files. After `LogPublisher.open`, the head's objects are
  rebuilt from its files and trusted only if they rebuild exactly the
  head's tree; otherwise everything is sent. The active segment is one
  blob of up to 1,000 entries, so it alone can exceed one transfer
  (`maxTransfer`, default `LOG_TRANSFER_LIMITS`: 100,000 objects and
  8 MiB, the same as lane B's publisher sandbox). A publication over one
  transfer is staged first (`GitRemote.stage`): the publisher asks which
  objects are missing, sends the next bytes of each from where its staging
  stopped, in parts of at most one transfer (an object larger than that
  goes in chunks), and then pushes the commit with no objects. It asks
  again before every attempt, so a lost answer, a publisher restart and a
  lost staging area are all recovered, and the commit is always the one
  `commitFor` computes. `cohort-too-large` remains only for a remote that
  cannot stage. `MemoryGit` and `GitCli` stage. Tests:
  `test/transfer.test.ts`.
- **Bounded memory** (request 5a7290b9). `entries` may be an
  `EntrySource`: the publisher reads it in batches and never holds the
  log, or a whole segment, at once. The Room passes one over its SQLite.
  - A segment blob is streamed. The first read of its lines, one entry at
    a time, measures each line, so the blob's size, which its git header
    needs, is known. The second read hashes it. Each staged part reads
    its lines again from where the part starts. Later reads take at most
    `READ_LIMITS` (64 entries, 1 MiB by the measured lengths), and at
    least one entry: one entry is bounded only by the 2 MB SQLite row.
  - A full segment of the parent never changes, so it is reused by its
    blob ID and not read. Only the parent's last segment, when it was not
    full, and new segments are read.
  - `retained` may hold `RetainedRef`s (kind, digest and `load`). A file
    the parent already holds is reused by ID and not loaded. A new one is
    loaded to hash it, and again when it is sent. With `bytes` and `read`,
    it is read in parts of at most `READ_LIMITS.bytes` to hash it, and in
    parts of at most one transfer to send it, and never loaded whole.
  - An `EntrySource` may return an `EntryLine` (seq, length and a reader
    of its parts) in place of an entry, so a large line is never held
    whole: it is measured by its length, hashed in parts, and sent in
    parts. The publisher reads its seq and hash from the fixed end of the
    canonical line when it needs them.
  - A chunked file is planned in one pass over its bytes: the SHA-256
    that names it or its `ChunkedLine`, and the blob ID of each chunk. A
    chunk directory the parent already holds is not planned again.
  - `LogPublisher.open` reads the head's trees and `checkpoint.json` only.
  - What still grows with the log, held as IDs: one blob ID per segment,
    one path and ID per retained file and chunked entry, and one ID per
    shard directory. In layout 1 the `inputs/` and `policies/` trees are
    single objects (97 bytes per file); in layout 2 they are fanned out,
    and a tree whose members did not change is reused by ID, not encoded
    again (`stats.treesBuilt`).
  - At the switch to layout 2, every kept retained file over B must be
    chunked, so the publisher needs each file's size. It knows the size of
    every file it hashed; after `open` it loads each kept file once, which
    is why the switch needs every retained file the parent holds (otherwise
    `invalid-input`).
  - A length that differs between two reads of the same line or retained
    file is `invalid-input`, and nothing is pushed.
  - `stats` reports the publisher's own buffers: the largest read batch,
    the most sent in one call, the largest object built whole, the
    largest segment and the bytes hashed and sent.
- **What `would-rewrite` checks.** The cohort must not end before the
  parent's checkpoint; its entry there must have the checkpoint's hash;
  and the published part of the parent's last segment must hash to that
  segment's blob ID, byte for byte. Full segments are reused, never
  rewritten. `commitFor` with the publisher's own last commit as parent
  makes the same checks.
- **The commit, in advance.** `commitFor(parent, entries, checkpoint,
  retained)` returns the exact commit `publish` would write for that
  cohort on `parent`, without pushing. Both use the same owned copy and the
  same git serialization. The Room stores it before any remote write
  (lane A, `PublisherPort.commitFor`).
- **State.** The publisher records `publishedThrough`. `lag(head)` gives
  `head − publishedThrough` (R-LOG-11). `publicationDue` decides when a
  batch is due, by lag or by delay. `LogPublisher.open` resumes from the ref
  after a restart, or, given a `head`, from a commit the caller names as
  its own: a late outstanding commit it has just confirmed (R-LOG-20).

Two adapters implement the git port (`GitRemote`):
- `MemoryGit` is in-memory. It runs in Workers and tests.
- `GitCli` (`./git-cli`, Node only) writes objects into a private staging
  repository and pushes with the git command line. It works with any
  remote, including Artifacts.

The package has its own small git object writer for blobs, trees and
commits, so it does not depend on lane B's unfinished code.

## Verification

`verifyLog` reads every log commit, oldest first, in the layout its
checkpoint names (`src/tree.ts`). In layout 2 it follows shard
directories and reassembles chunked files, so the rest of verification
reads files by the paths R-LOG-9 gives them.

**Decoding.** Every entry, checkpoint and retained file passes through one
decoding boundary (`src/decode.ts`) before any field is read. Content that
is not UTF-8, not strict JSON, or not of the contract's shape is the named
failure `malformed`. The verified prefix ends before the first malformed
entry, or before the first entry that needs a malformed retained file.
Only reading the repository throws, so `artroom verify` exits 2 only when
it cannot read the remote.

**Times.** Every time in the log is RFC 3339 in UTC with `Z`, read by one
function, `parseTime` (`src/time.ts`). It refuses offsets and dates that
roll over, such as 30 February. A time that bounds authority (an entry's
`at`, an invitation's or delegation's `expiresAt`, a grant's `notAfter`)
and is not valid is `malformed`, and the verified prefix ends before that
entry. The roster replay throws on a time that is not finite, so an invalid
time can never pass an expiry check.

**For each commit**, it checks that:
- the commit has one parent, the previous log commit;
- every earlier entry and every full segment is unchanged;
- every retained file matches its digest (`retained-digest`), and decodes
  under its directory's contract (`malformed`): a replay context under
  `inputs/`, JSON under `policies/`. A file under `policies/` is decoded
  again as a policy document or a checker configuration where a
  `policy-activated` event names it. Each decoding, good or bad, is reused
  only for the same contract and digest;
- it publishes every retained file that its own verified entries need, so
  each published prefix can be replayed alone. A missing file fails that
  commit (`policy-missing`, `checker-missing` or `input-missing`, with
  `commit` and the `seq` that needed it). The entries are still verified
  against the latest consistent commit, so the verified prefix does not
  change;
- the checkpoint advances, is signed by the room key, and names the last
  entry;
- every segment except the last is unchanged in the next commit, and the
  last stays where it starts and only grows (`segment-changed`);
- the layout (section 30.6): no layout 1 commit follows a layout 2 commit,
  every layout 2 commit has the same `from`, and the first has its
  parent's `through` plus one, or 0 (`layout-changed`);
- in layout 2: segments start where R-LOG-17 says (`segment-bound`); every
  blob is at most B, except a segment of entries before `from`
  (`object-too-large`); every directory follows R-LOG-19 (`fan-out`); each
  `ChunkedLine` names an entry file whose reassembled bytes have its length,
  digest and seq, and each chunk directory has chunks of B bytes but the
  last (`chunk-mismatch`); a chunked retained file that does not match its
  digest is `chunk-mismatch` too.

**For each entry**, it checks:
- seq, prev, hash, entry ID and the room signature;
- the genesis and its first admin's signature. A genesis for an imported
  repository carries an onboarding grant: it must be signed under
  `artroom-onboarding-v1` by its `operator` key and name the genesis's
  repository and first admin (R-GEN-12);
- that each `policy-activated` event's policy document and checker
  configurations are published, and are what they claim to be (R-POL-9);
- for each act and recorded refusal:
  - the envelope's signature and room;
  - the recorded authority. Verify replays the roster from earlier entries
    and judges the act by the four cases of R-ADM-3, including revocations
    (R-ADM-4, R-REV-3);
  - delegations (R-ADM-5). When a `delegate` is admitted, it must not be
    signed under a delegation, and its kinds must be ones the grantor's role
    may sign, never `roster`. `*` means all of those, fixed at the grant. At
    each use: the grantor's current role, the expiry and revocation;
  - that an accepted `check` names in `config` its checker's digest in the
    active policy version (R-OBL-3);
  - the recovery-key flag and idempotency;
  - that no effect or event names its own lane (R-LOG-12);
- that `notified` events name an earlier accepted act, and no act twice;
- that each `check-carried` event names in `act` an earlier accepted
  `check` of the same lane and obligation (R-CARRY-13);
- that `checkpoint` events name an earlier log commit with the same
  `through` and `hash`.

**For each recorded policy decision**, it finds the retained replay context
by the decision's digest, and the policy document by the policy version.
It runs `replay` from the policy package, and requires the same decisions
(R-EVAL-6). It also checks the decision's profile stamp, and that it names
exactly one policy version, chosen by event kind:
- an act or refusal: the policy in force when it was admitted;
- a `notified` event: the policy in force when the act it names was
  sealed. The room pins that version when it queues the notification, so
  later activations do not change it (R-LOG-13);
- an `obligations-recomputed` event: the version it names, which must be
  the active one (R-POL-9);
- a `land-evaluated` event: the active policy (R-LAND-4);
- a `check-carried` event: the version it names, which an earlier
  `policy-activated` event must have activated (R-CARRY-13).

**The report** gives:
- the verified prefix: the last good entry and its ID;
- for an imported repository, the operator key that signed its onboarding
  grant (`operator`). Whether to trust that key is the reader's decision;
- what the room has published;
- the number of decisions replayed;
- each failure, with a named reason;
- what verification cannot prove (R-LOG-15): acts after the last published
  entry; lanes, leases, obligations and landings; and the room clock;
- how far check carry judgments are accounted for: `carryAccounting` is
  `"partial"` in the JSON report, and "Carry accounting: partial." in the
  text. Verify replays the judgments that are recorded and detects three
  omissions; it does not derive every judgment the room owed, and the
  list of what it cannot prove says what that leaves out (protocol
  R-DECL-25).

When a later commit rewrites history, verify reports it and verifies the
entries of the last consistent commit.

## Tests

How the tests are sized (request ecbc722a):

- **Small limits.** A test that must cross a limit crosses a small one. The
  transfer and read bounds are publisher options. The layout's three limits
  (B, 1,000 entries to a segment, 4,096 names to a directory) are set for
  one test by `setLayoutLimitsForTests` in `src/layout.ts`, which the
  publisher, its index reader and verify all read. The rules are compared
  with the contract's reference functions at the contract's limits, and two
  cases stay at them: one entry of B + 1 bytes under the default read and
  transfer limits, and 5,000 segments at the directory limit of 4,096.
- **One runtime.** The code is the same in Node and in workerd, and the
  Room's workerd tests publish and verify through this package. The
  workerd run holds only `test/golden.test.ts`, which pins one log's commit
  IDs for both runtimes and checks the runtime's text decoder.
- **Rules where they are cheapest.** A rule that is a pure function of one
  entry (the decoder's grammar, the body check) is tested as one. Each
  verification failure keeps one witness through verify. Rules that verify
  rebuilds and compares with the record are shown by honest fixtures
  written by a separate simulator (see `test/declared-obligations.test.ts`).

The files:

- `test/golden.test.ts` covers the walk-through in protocol section 20:
  - genesis, the initial policy, a claim and its `notified` event;
  - publication C1 and its checkpoint event;
  - an invitation, a join, a second claim with its notification, and a
    recorded refusal;
  - publication C2 and its checkpoint event, then C3 so that event is
    published too.

  It also checks that every recorded decision replays, the tree layout, and
  publication: lag, idempotency, retries before and after the ref moves,
  `unresolved` then completing forward, an unexpected writer, rewriting,
  resuming and batching. It pins the commit IDs of one log, and it is the
  one file that also runs in workerd.
- `test/tamper.test.ts` changes a log in one way per case and expects a
  named reason:

  | Change | Reason |
  |---|---|
  | Two entries swapped | `entry-order` |
  | An entry dropped | `seq-gap` |
  | An entry altered | `hash-mismatch` |
  | An entry re-hashed without the room key | `room-signature` |
  | An envelope altered, then resealed by the room | `actor-signature` |
  | A genesis signed by the wrong key | `genesis-signature` |
  | A key used after its revocation | `key-revoked` |
  | A wrong policy decision | `policy-decision-mismatch` |
  | A replay context not published | `input-missing` |
  | A recorded authority that the roster does not give | `authority-mismatch` |
  | An act by a key that never joined | `not-member` |
  | An idempotency key reused | `idempotency-duplicate` |
  | An opened effect that names its own lane | `self-reference` |
  | An entry notified twice | `notified-twice` |
  | A checkpoint event that names an unknown commit | `checkpoint-event-mismatch` |
  | A checkpoint signed by another key | `checkpoint-signature` |
  | A later commit that changes a published entry | `history-rewritten` |

- `test/review-ea4a9bd0.test.ts` covers the findings of review ea4a9bd0
  (see below).
- `test/amendment-2.test.ts` covers the lane L edits of contract
  amendment 2 (see below).
- `test/amendment-3.test.ts` covers the lane L edits of contract
  amendment 3: `check-carried` events (protocol section 29.8).
- `test/review-07d3150e.test.ts` covers the findings of review 07d3150e
  (see below).
- `test/review-a454cbaf.test.ts` covers review a454cbaf and `commitFor`
  (see below).
- `test/bounded.test.ts` covers bounded-memory publication (request
  5a7290b9; see `notes/log-bounded.md`): the same commits as the publisher
  of main 417a1618 (`test/support/publisher-417a1618.ts`, kept as the
  reference serialization) across segment boundaries, staged and not,
  from arrays and sources, with restarts; bounded reads; retained files
  read only when new; the size, order, staging-offset and rewrite guards;
  `open` reading no segment; an entry over the read limit, read alone.
- `test/transfer.test.ts` covers what one transfer may carry: a push sends
  only what its lease does not hold, and a publication over one transfer is
  staged in parts and pushed as the commit alone, through a lost answer, a
  restart and a lost staging area.
- `scripts/memory.ts` measures the publisher's heap with a 66.5 MiB active
  segment against the 417a1618 publisher (results in `scripts/results/`).

- `test/amendment-4.test.ts` covers contract amendment 4 (see below and
  `notes/amendment4-log.md`).
- `test/declared-stage3.test.ts` covers declared acts stage 3: decoding by
  grammar; kind, binding, body and who under the document in force at each
  entry; the legacy rule and the legacy recovery fixture; and the
  evaluation calls a log must record.
- `test/declared-obligations.test.ts` covers the inputs verify rebuilds
  from the fold: a land input's obligations and reviews, a notify
  directory's reviewers, and each carry call.

- `test/gitcli.node.test.ts` (Node only) publishes to a real local git
  repository through the git CLI adapter and checks it:
  - `git fsck --strict` passes;
  - a publisher with a stale view stops at the lease;
  - a publisher reopened from the ref continues it;
  - tokens are redacted.
- `test/cli.node.test.ts` (Node only) runs the `artroom verify` command on
  real repositories: exit 0 on an intact log, with the room's pinned head
  fetched; exit 1 on a rewritten log; exit 2 on a remote it cannot read.

## Live round trip

`scripts/live-roundtrip.sh` runs the golden log against a real Artifacts
repository. It:
1. creates a repository in the `gitseq-spike` namespace;
2. mints a 15-minute write token;
3. publishes three log commits and verifies them from a fresh fetch;
4. runs `artroom verify`;
5. revokes every token on the repository and deletes it.

On 2026-10-01 it passed:
- three commits, each pushed in one attempt;
- 5.2 s to publish and 2.4 s to verify;
- verified through entry 10, with 5 policy decisions replayed;
- both tokens revoked and the repository deleted.

## Contract gaps and open points

Amendment 2 settled four of the five gaps this package first listed:
log commits carry no git signature (R-LOG-14); `policy-activated` names
checker configurations (R-POL-9); delegation grants are checked (R-LOG-10);
no revocation timestamp is needed (open point 35). Lanes, leases,
obligations and landings stay unproven (R-LOG-15, open point 34). One point
is still open:

1. **`*` in a delegation.** The contract says `*` means all delegable
   kinds. R-ADM-5 and R-LOG-10 allow only kinds the grantor's role could
   sign at the grant, but neither says in words what `*` means for a role
   that may not sign every delegable kind. In review 07d3150e the checker
   noted that R-LOG-10's grant scope, bound at admission, supports the
   reading below, and that the Room will be brought into line with it. Verify reads `*` as all kinds the
   grantor's role may sign at the grant. The Room (lane A, `authority.ts`)
   instead judges `*` against the grantor's current role at each use. They
   differ in one case: a member grants `*`, is promoted to checker, and the
   grantee signs `check`. The Room admits it; verify reports
   `delegation-invalid`. The contract should say which is meant.

## Not done

- A Workers-native push adapter. In a Worker, `MemoryGit` hands the objects
  over, and lane B's publisher sandbox will push them. That adapter belongs
  with lane B's code, which is not finished.
- Malformed git structure (a log ref or parent that is not a commit, a
  tree entry that is not a tree) still throws, as a read error does. The
  decoding boundary covers the log's content, not git's object format.
- Incremental verification from a trusted earlier checkpoint. Verify always
  starts from genesis.

## Review ea4a9bd0

Each finding, its fix, and the tests that prove it. All tests are in
`test/review-ea4a9bd0.test.ts` unless named otherwise. Each guard was
broken on purpose and a named test failed.

1. **P1: own the publication cohort before asynchronous I/O.**
   Fix: `LogPublisher.publish` builds a `Cohort` (canonical lines,
   checkpoint text, retained files) synchronously, before the first
   `await`. `done` sets state only from it.
   Tests: "appending and mutating the caller's objects during the push
   changes neither the commit nor the state", and the same "during the
   read". Each also publishes the next cohort and checks it is a new commit
   with the new entry.
2. **P1: check delegation kinds when the grant is admitted.**
   Fix: `RosterReplay.judge` refuses a `delegate` that lists a kind the
   grantor's role may not sign (`delegation-invalid`). `apply` stores `*`
   as `delegableBy(role)` at the grant. Current role, expiry and revocation
   are still judged at each use.
   Tests: "a member grants check, is promoted to checker, the grantee
   checks: delegation-invalid at the grant"; "a member's * covers only the
   member's kinds: after promotion to checker, check is delegation-invalid
   at the use"; "a valid grant used within its kinds verifies"; "an admin
   may grant check, and a later demotion still stops it at the use
   (current role)"; "expiry and revocation are still judged at the use".
3. **P2: report malformed log content instead of throwing.**
   Fix: `src/decode.ts` is the one decoding boundary for entries,
   envelopes, roster bodies, decisions, checkpoints and retained replay
   contexts and policies. Verify reports `malformed` with the last valid
   prefix.
   Tests: "a first entry {"seq":0} is malformed at entry 0; verify does
   not throw"; "a malformed later entry stops the prefix before it"; "a
   line that is not JSON, and one that is not UTF-8, are malformed";
   "malformed signatures: entry, envelope and genesis signatures that are
   not strings"; "a checkpoint whose signature is not a string is
   malformed, not a throw"; "a roster body outside the contract is
   malformed"; "malformed retained data: a replay context and a policy
   document, each where an entry needs it"; "a malformed retained file no
   entry needs fails the commit but not the prefix"; "a genuine read error
   still throws, so the CLI reports it apart from a failed check". The
   command's own exit status, 1 for a failed check and 2 for a remote it
   cannot read, is in `test/cli.node.test.ts`.
4. **P2: preserve previously published replay evidence.**
   Fix: the publisher merges the retained files of the last log commit
   into every later one, and `open` reads them back from the ref.
   Tests: "a publication that omits earlier retained files keeps them, and
   every prefix stays replayable"; "a restarted publisher reads the
   retained files back and keeps them".
5. **P2: replay delayed notifications with their pinned policy.**
   Fix: verify records the policy in force at each entry. A `notified`
   event's decisions must name the policy in force when the act it names
   was admitted, the version the Room queues. An act's decisions must name
   the policy in force at its own admission. A `notified` event may name
   only an accepted act.
   Tests: "an activation between queueing and sealing: the notification
   keeps the act's policy"; "a retry sealed after several activations
   still uses the original version"; "substituting another policy is
   policy-version-mismatch: an older one, a newer one, or a version that
   does not exist"; "a notification may name only an earlier accepted
   act: naming a system entry is notified-unknown"; "an act's own
   decisions still use the policy active at its admission".

## Contract amendment 2

The lane L edits of `docs/protocol.md` section 27, each with its tests. All
tests are in `test/amendment-2.test.ts` unless named otherwise. Each new
guard was broken on purpose and a named test failed.

1. **Replay `obligations-recomputed` and `land-evaluated` decisions.**
   An `obligations-recomputed` event must name the active policy, and its
   decisions replay under it. A `land-evaluated` event's decisions replay
   under the active policy.
   Tests: "both events' decisions replay under the active policy"; "a
   wrong decision in obligations-recomputed: policy-decision-mismatch"; "a
   wrong decision in land-evaluated: policy-decision-mismatch";
   "obligations-recomputed must name the active policy version";
   "land-evaluated decisions must name the active policy version".
2. **Checker configurations.** Each checker that `policy-activated` names
   must be published (`checker-missing`) and be a checker configuration
   (`malformed`); the list must be sorted by name (`malformed`). An
   accepted `check` must name its checker's digest in the active version
   (`check-config-mismatch`). A recorded refusal is not held to it.
   Tests: "the fixture's policy-activated names its checker configuration,
   sorted by name"; "a checker configuration that is not published:
   checker-missing"; "a published checker configuration that is not one:
   malformed"; "checkers not sorted by name: malformed"; "an accepted
   check names its checker's digest in the active version; another digest
   or checker: check-config-mismatch"; "after an activation changes the
   configuration, a check naming the old digest: check-config-mismatch";
   "a recorded refusal of a check is not held to the active digest".
3. **Each `delegate` against the grantor's role.** This was already done at
   the grant for review ea4a9bd0. It matches the amended text: R-ADM-5 is
   unchanged, and R-LOG-10 says "kinds its grantor's role could sign at its
   admission, never `roster`, and was not itself signed under a
   delegation". A `roster` kind in a grant is now `delegation-invalid`, not
   `malformed`. The amendment does not settle `*`, so the grant-time reading
   stays, listed under "Contract gaps and open points".
   Tests: "a delegate that grants roster: delegation-invalid"; "a delegate
   signed under a delegation: delegation-invalid"; and the finding 2 tests
   in `test/review-ea4a9bd0.test.ts`.
4. **`checkers` in the fixture.** `RoomSim.activate(doc, checkers)` names
   them, sorted, and retains each configuration under `policies/`. The
   demo policy has one checker, `test`.
   Tests: the type check, and "the fixture's policy-activated names its
   checker configuration, sorted by name". `test/golden.test.ts` now
   expects two files under `policies/`.
5. **The report lists lanes, leases, obligations and landings as not
   proven.** Test: "cannotProve names each".
6. **`notified` decisions use the version active when the notified entry
   was sealed.** The fix for review ea4a9bd0 finding 5 already does this.
   Tests: the finding 5 tests in `test/review-ea4a9bd0.test.ts`, which
   include the "Notify across an activation" case.
7. **Onboarding grants.** A genesis with `onboarding` must carry a grant
   signed under `artroom-onboarding-v1` by its `operator` key, whose `repo`
   and `admin` equal the genesis's (`onboarding-invalid`). The report names
   the operator key as `operator`, or null.
   Tests: "a grant signed by its operator key, naming the genesis's
   repository and admin, verifies and the report names the operator"; "a
   public founding reports no operator"; "a grant signed by another key:
   onboarding-invalid"; "a grant for another repository, or another first
   admin: onboarding-invalid"; "a grant without its operator field:
   malformed".
8. **Log commit signing.** No change: R-LOG-14 adopts what the package
   does.

## Review 07d3150e

The checker confirmed the five findings of review ea4a9bd0 fixed, and
found two more. Each fix, and the tests that prove it. All tests are in
`test/review-07d3150e.test.ts`. Each new guard was broken on purpose and a
named test failed.

1. **P2: expiry authority failed open on invalid timestamps.**
   Fix: `src/time.ts` holds the one checked time representation,
   `parseTime`. The decoding boundary uses it for every log time: entry
   `at`, invitation and delegation `expiresAt`, genesis `createdAt`, grant
   `notAfter` and checkpoint `at`. An invalid one is `malformed`, and the
   prefix ends before it. `RosterReplay.judge` throws `RangeError` on a time
   that is not finite, rather than skipping expiry. The publisher reads the
   checkpoint time with `parseTime` too.
   Tests: "one checked representation: RFC 3339 in UTC with Z, and no
   rollover"; "a use at the delegation's expiry is delegation-invalid;
   before it, it verifies"; "an entry time that is not a time: malformed,
   and the prefix ends before it (the expired grant cannot be revived)"; "a
   delegation expiry that is not a time: malformed at the grant, so no
   later use is admitted"; "an invitation expiry: malformed when not a
   time; a join at the expiry is invitation-invalid"; "every other log time
   uses the same check: genesis createdAt, grant notAfter, checkpoint at";
   "the roster replay refuses a non-finite admission time instead of
   treating it as unlimited"; "the publisher refuses a checkpoint whose
   time is not RFC 3339 UTC".
2. **P2: earlier published replay evidence was not verified.**
   Fix: verify checks the retained files of every inspected commit: each
   digest in each commit, and each distinct file decoded once, by digest.
   While it walks the entries it records the retained files each one
   needed. Each earlier commit must publish those its own verified entries
   need. A missing one fails that commit, named by `commit`, with the
   entry as `seq`. An unused malformed file fails each commit that
   publishes it. Availability in the latest commit is judged by that
   commit's own files, never by an earlier commit's. Policy evaluation is
   not run again for this.
   Tests: "a later commit cannot supply a policy its parent's entries
   needed: policy-missing names the parent"; "a later commit cannot supply
   a replay context its parent's entries needed: input-missing names the
   parent"; "evidence for entries an earlier commit does not publish is not
   required of it"; "evidence an earlier commit published does not stand in
   for the head's: a child that drops it fails at the entry"; "a bad
   retained digest in an earlier commit is reported even after a child
   removes it"; "a malformed retained file in an earlier commit is
   reported even after a child removes it".

## Review a454cbaf

The checker confirmed both findings of review 07d3150e and every
amendment 2 edit, and found one more defect. Lane A also asked for
`commitFor`. All tests are in `test/review-a454cbaf.test.ts`. Each new
guard was broken on purpose and a named test failed.

1. **P2: distinguish retained-file decoding by directory and type, as
   well as digest.** The same bytes have a different contract under
   `inputs/` (a replay context), under `policies/` (JSON), and as the policy
   document or checker configuration a `policy-activated` event names.
   Verify skipped a file whose digest it had already decoded in another
   directory, so the verdict depended on which commit added the bytes.
   Fix: decodings, good or bad, are cached by contract and digest, never
   by digest alone. A file that does not decode under its directory's
   contract fails each commit that publishes it, whether or not an entry
   needs it. An entry that needs it also fails, at its `seq`.
   Tests:
   - "a policy's bytes added under inputs/ by a child are a malformed input
     at that commit"
   - "the same bytes as a malformed input and a valid policy, in one
     commit: the input fails, the policy still activates"
   - "a malformed input in a parent does not poison the same bytes as a
     policy a child activates"
   - "a valid replay context in a parent does not stand for the same bytes
     named as a policy: malformed at the activation"
   - "a policy document decoded as a policy does not stand for the same
     bytes named as a checker: malformed at the activation"
   - "positives: the same bytes under inputs/ and policies/ where each
     contract allows them"
   - "positives: repeated identical content where each contract allows it"
     (one checker configuration under two names, the same policy activated
     again, and two claims sharing one replay context)
2. **`commitFor`, for lane A.** `LogPublisher.commitFor(parent, entries,
   checkpoint, retained)` matches `PublisherPort.commitFor` in lane A's
   `packages/room/src/ports.ts`. It uses the same owned copy as `publish`
   and one `build` function, so the two cannot drift. When `parent` is the
   commit the publisher last wrote, it includes that commit's retained
   files, as `publish` does. For any other parent it uses only `retained`.
   A Room that passes every retained file it holds gets the same commit
   either way.
   Tests: "a root commit, then a child with retained files, then after a
   restart" (`commitFor` equals the commit `publish` writes, for a root
   commit, a non-root parent with every retained file, a parent with only
   the new retained file, and after `LogPublisher.open`; nothing is pushed
   by `commitFor`); "the parent is part of the commit".

## Contract amendment 4

The lane L edits of `docs/protocol.md` section 30.9, each with its tests.
The tests are in `test/amendment-4.test.ts`. Most run at small limits (see
Tests); "at the contract's own limits" keeps an entry of B + 1 bytes and
5,000 segments. Each guard was broken on purpose and a named test failed
when the edits were made; the table is in `notes/amendment4-log.md`, which
names the tests as they were then.

1. **`plan` writes the layout the checkpoint names.** Segment starts by
   R-LOG-17 (`Placement`), a `ChunkedLine` and a chunked entry file for a
   line over B, chunked retained files and genesis over B, and fanned-out
   directories (`fanTrees`). The `Index` keeps each segment's `first` and
   blob ID, each chunked entry, each retained file by path, and each shard
   tree by path. Closed segments and unchanged shard trees are reused by ID.
   Layout 1 output does not change: every test of `test/bounded.test.ts`
   still compares with `test/support/publisher-417a1618.ts`.
   Tests: "Byte close", "Count close", "Edge", "Switch, small open
   segment", "Old log, then the switch with a large open segment",
   "Unpublished old entry over B", "Retained prefix, large activation and
   determinism", "Many segments", "At the switch every retained file moves
   to its layout 2 path".
2. **A line over B is hashed and sent in parts.** `EntryLine` and
   `RetainedRef.read`. Tests: "Unpublished old entry over B" (read whole or
   in parts, the same commit; in parts no read is the whole line),
   "Retained prefix, large activation and determinism" (no retained file
   loaded whole).
3. **`commitFor` stays synchronous.** With another parent it places every
   segment from the entries and `from`. Tests: "Retained prefix, large
   activation and determinism", "open on a layout 2 head reads its shape
   and continues it".
4. **The guard.** `object-too-large`. Test: "Guard: a faulty publisher
   that plans an object over B stores and pushes nothing".
5. **Refused pushes.** `PushOutcome` gains `refused`; after it the
   publisher reads back: at the commit, done; at the lease, `refused`
   without pushing again; elsewhere, `unexpected-writer` with `current`.
   `MemoryGit` can refuse like Artifacts (`objectLimit`, `failNext`).
   Tests: "Refused push and recovery", "Refused, by status", "a refused
   push that the ref reads back at anyway is confirmed", "Late earlier
   push" (four cases), "Unclear answer".
6. **`open` accepts a named head**, and `readIndex` checks layout 2's shape
   from trees alone. Tests: "Late earlier push ... the Room confirms C and
   builds on it", "a segment that does not follow on ... a misplaced shard
   directory is fan-out" (open refuses it).
7. **Decoding.** `decodeCheckpoint` accepts `layout` only as
   `{ version: 2, from }`; `decodeChunkedLine` recognises a `ChunkedLine`.
   Tests: "a checkpoint's layout is exactly { version: 2, from }", "a
   ChunkedLine is recognised, must be canonical, and never looks like an
   entry".
8. **`artroom verify` and `readLogFiles`** make the checks of 30.6 with
   named reasons. Tests: "Layout regression" (two), "Misplaced boundary",
   "a segment that does not follow on from the one before is
   segment-bound; a misplaced shard directory is fan-out; a retained file
   left whole over B is object-too-large", "a layout 2 segment over B
   holding entries from from on is object-too-large", "Bad chunk" (an entry
   file, and a chunked retained file), "Old log, then the switch".
9. **The cases of 30.7 that need no Room.** All of the above. The large
   revert is the entry of "Unpublished old entry over B", and the large
   activation is part of "Retained prefix, large activation and
   determinism". The reference functions agree with `src/layout.ts`: "the
   shared rules agree with the contract's reference functions".

