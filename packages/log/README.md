# @generalbusiness/artroom-log

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
npm run test:workerd                 # the same tests in workerd, except the git CLI ones
node src/cli.ts verify <remote>      # or: npx artroom-verify <remote>
```

`<remote>` is anything git can fetch from: a local path, `file://`, or an
HTTPS URL. For an Artifacts repository, pass the token in git's environment
(`http.extraHeader`), not in the URL. Exit status: 0 verified, 1 a check
failed, 2 the remote could not be read. Add `--json` for the full report.

## Publication

Each log commit holds the files of R-LOG-9:
- the genesis;
- segments of 1,000 canonical entries;
- retained replay contexts and policy documents, named by their digest;
- the room-signed checkpoint.

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
  After an unclear answer, the publisher reads the ref back:
  - at the new commit: done;
  - at the old commit: it pushes the same commit again;
  - anywhere else: it stops with `unexpected-writer` and never forces.

  When retries run out, the error is `unresolved` and retryable. Calling
  `publish` again with the same input completes forward.
- **State.** The publisher records `publishedThrough`. `lag(head)` gives
  `head − publishedThrough` (R-LOG-11). `publicationDue` decides when a
  batch is due, by lag or by delay. `LogPublisher.open` resumes from the ref
  after a restart.

Two adapters implement the git port (`GitRemote`):
- `MemoryGit` is in-memory. It runs in Workers and tests.
- `GitCli` (`./git-cli`, Node only) writes objects into a private staging
  repository and pushes with the git command line. It works with any
  remote, including Artifacts.

The package has its own small git object writer for blobs, trees and
commits, so it does not depend on lane B's unfinished code.

## Verification

`verifyLog` reads every log commit, oldest first.

**Decoding.** Every entry, checkpoint and retained file passes through one
decoding boundary (`src/decode.ts`) before any field is read. Content that
is not UTF-8, not strict JSON, or not of the contract's shape is the named
failure `malformed`. The verified prefix ends before the first malformed
entry, or before the first entry that needs a malformed retained file.
Only reading the repository throws, so `artroom verify` exits 2 only when
it cannot read the remote.

**For each commit**, it checks that:
- the commit has one parent, the previous log commit;
- every earlier entry and every full segment is unchanged;
- the checkpoint advances, is signed by the room key, and names the last
  entry.

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
- a `land-evaluated` event: the active policy (R-LAND-4).

**The report** gives:
- the verified prefix: the last good entry and its ID;
- for an imported repository, the operator key that signed its onboarding
  grant (`operator`). Whether to trust that key is the reader's decision;
- what the room has published;
- the number of decisions replayed;
- each failure, with a named reason;
- what verification cannot prove (R-LOG-15): acts after the last published
  entry; lanes, leases, obligations and landings; and the room clock.

When a later commit rewrites history, verify reports it and verifies the
entries of the last consistent commit.

## Tests

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
  resuming and batching.
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

- `test/gitcli.node.test.ts` (Node only) publishes to a real local git
  repository and checks it:
  - `git fsck` passes;
  - `artroom verify` exits 0 on the log, and 1 after a forced rewrite;
  - a publisher with a stale view stops at the lease;
  - tokens are redacted.

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
   sign at the grant, but neither says what `*` means for a role that may
   not sign every delegable kind. Verify reads `*` as all kinds the
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
   still throws, so the CLI reports it apart from a failed check". In
   `test/gitcli.node.test.ts`: "artroom verify exits 1, not 2, on a log
   whose first entry is malformed".
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
