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

**For each commit**, it checks that:
- the commit has one parent, the previous log commit;
- every earlier entry and every full segment is unchanged;
- the checkpoint advances, is signed by the room key, and names the last
  entry.

**For each entry**, it checks:
- seq, prev, hash, entry ID and the room signature;
- the genesis and its first admin's signature;
- for each act and recorded refusal:
  - the envelope's signature and room;
  - the recorded authority. Verify replays the roster from earlier entries
    and judges the act by the four cases of R-ADM-3, including revocations
    (R-ADM-4, R-REV-3);
  - the recovery-key flag and idempotency;
  - that no effect or event names its own lane (R-LOG-12);
- that `notified` events name an earlier entry, and no entry twice;
- that `checkpoint` events name an earlier log commit with the same
  `through` and `hash`.

**For each recorded policy decision**, it finds the retained replay context
by the decision's digest, and the policy document by the policy version.
It runs `replay` from the policy package, and requires the same decisions
(R-EVAL-6). It also checks that the decision's profile stamp and policy
version are the ones in force.

**The report** gives:
- the verified prefix: the last good entry and its ID;
- what the room has published;
- the number of decisions replayed;
- each failure, with a named reason;
- what verification cannot prove. That covers acts after the last published
  entry, lane and obligation state, and the room clock.

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

1. **Log commits carry no git signature.** Each commit's integrity rests on
   the room-signed checkpoint in its tree and on the signed entries. A
   `gpgsig` (SSH-format Ed25519) header could be added if git-level
   signature checks are wanted.
2. **Checker configurations are not named by an event.** `policy-activated`
   names the policy document's digest, but not the checker configurations
   that came with it. So verify cannot tell which configuration applied to
   a check.
3. **Lane and obligation state are not re-derived.** Verify checks
   authority and policy decisions, not lane, lease, obligation or landing
   transitions. These are listed under "cannot prove".
4. **Delegation grants are not checked against the grantor's role at grant
   time** (R-ADM-5). Uses of a delegation are checked.
5. **Revocation time.** The roster records revocations by log order; the
   contract has no revocation timestamp. That is enough, because authority
   is judged at admission order.

## Not done

- A Workers-native push adapter. In a Worker, `MemoryGit` hands the objects
  over, and lane B's publisher sandbox will push them. That adapter belongs
  with lane B's code, which is not finished.
- Incremental verification from a trusted earlier checkpoint. Verify always
  starts from genesis.
