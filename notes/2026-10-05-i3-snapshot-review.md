# I3: the review of the earlier snapshot code

Written 2026-10-05, with step 24 of the I3 plan
(`notes/2026-10-05-i3-implementation-plan.md`, section 8.4). A parked file
moves only after a written review of it. This note is that review for the
three earlier snapshot files, in the pattern of
`notes/2026-10-05-i3-git-review.md`.

"The authority note" is revision 24 at `d5616522b`, adopted. "The deltas" is
`notes/2026-10-05-i3-contract-deltas.md`. Parked paths are under `parked/`,
as they were at `e87645962`. "The host review" is
`notes/2026-10-05-i3-host-review.md`.

No file moved as it was. Three parked files are removed:
`checkers/src/snapshot-commit.ts`, `room/src/snapshot.ts` and
`git/src/snapshot/repos.ts`. The successor of the first two is
`packages/git/src/snapshot.ts`. The third has no successor file: what it
did belongs to the change lane's ledger, and section 4 says what of it is
built and what is not.

## 1. What was read

| Parked file | Lines | Read |
|---|---|---|
| `checkers/src/snapshot-commit.ts` | 70 | In full, at the lines. Removed. |
| `room/src/snapshot.ts` | 57 | In full, at the lines. Removed. |
| `git/src/snapshot/repos.ts` | 512 | In full, at the lines. Removed. |
| The earlier snapshot commands `listTree` and `writeSnapshot` of the publisher's `gitops.ts`, which step 21 removed | 95 | In full, from Git history at `5e5583e74`, lines 446 to 507. The ledger of `parked/README.md` gave them to this step. |
| `checkers/src/runner.ts`, lines 93 to 106: how a runner checked a snapshot that it had fetched | 14 | In full. The file is reviewed whole in `notes/2026-10-05-i3-checkers-review.md`. |
| `git/test/snapshots.test.ts` | 679 | The test names only. It tests `repos.ts` against a fake of the earlier host. It stays, unrun, as other parked tests of removed files do. |
| The host review, fault A3 | | In full. It is the fault that this step must not carry. |

The earlier policy package's `snapshotDigest`, `SnapshotEntry` and
`matchesAny` were deleted by I1 with that package. They are named by the
parked files and were not read.

## 2. The snapshot commit: `checkers/src/snapshot-commit.ts` and `room/src/snapshot.ts`

Two files built the same commit: one for the checker's harness, without a
Git library, and one for the earlier Room, on the earlier log's object
writers. Both took a list of `[path, mode, blob]` and a message, and gave
the ID of a commit with no parent and a fixed identity at time 0.

| # | Fault in the parked code | File and lines | Fixed by |
|---|---|---|---|
| S1 | **A file and a directory of one name overwrote each other.** In the harness file one map held both kinds: `a` then `a/b` replaced the file with a directory, and `a/b` then `a` replaced the directory with a file. In the Room's file two maps held them, so a tree got two entries named `a`, which is no valid tree. Two lists with different files gave one commit, or a commit that Git refuses. | `snapshot-commit.ts` 57-66; `snapshot.ts` 34-43 | `snapshotCommit` refuses `path-conflict` for one path twice, for a file under a file, and for a file where a directory is. Nothing is built. |
| S2 | **The same path twice: the last one won.** No entry was refused. | The same lines | The same refusal. |
| S3 | **A path was not checked.** It was split at `/` and used. An empty part, `.`, `..`, `.git`, a NUL or a newline each went into a tree entry's name. Git refuses to check out a tree with `.git` or `..` in it, so the commit that was signed for was not the tree that a runner would see. | `snapshot-commit.ts` 59; `snapshot.ts` 35 | `part` refuses each, `bad-path`, before any object is built. A path is well-formed text within a stated length and depth. |
| S4 | **A mode was not checked.** Any text became the mode of a tree entry: `40000` made a file entry that Git reads as a directory, and `160000` a gitlink. The Room's file cast the text to the mode type. | `snapshot-commit.ts` 49, 66; `snapshot.ts` 47 | A file's mode is one of `100644`, `100755` and `120000`, written exactly: `unknown-mode`. No directory and no gitlink is taken from a caller. |
| S5 | **A blob ID was not checked.** `bytes(v.blob)` took any text in pairs of characters. An ID of another length gave a tree entry of another length, and so a tree that parses as something else. | `snapshot-commit.ts` 20, 49; `snapshot.ts` 47 | `objectId`, of `names.ts`: 40 lower-case hex characters, and not the zero ID. |
| S6 | **A message was not checked.** A message with a NUL or without its last newline gave a commit that two readers split differently. | `snapshot-commit.ts` 69; `snapshot.ts` 54 | `malformed-commit` for an empty message, one with a NUL, and one that does not end with a newline. |
| S7 | **Two implementations of one function.** A fault fixed in one stayed in the other. They used different hash calls and different orderings of a directory. | Both files | One function, in the package that owns Git objects. Its hash is the reader's `idOf`. |
| S8 | The message named the earlier checker and the earlier digest of the snapshot. Neither form exists in the adopted model. | `snapshot-commit.ts` 14-16; `snapshot.ts` 18-20 | The message is the caller's, checked for form only. No adopted text states one (deltas, entry EW3). |

What was right and is kept: the commit is a pure function of its inputs;
it has no parent; its identity and time are fixed; a directory is ordered
as if its name ended with `/`.

## 3. Reading the files: the fault A3, and `listTree`

The earlier host adapter built a snapshot's list from the host's tree
reads, and took a tree that the host did not return as `[]` (the host
review, fault A3). A missing subtree became an empty directory, and the
snapshot got a digest all the same. The earlier publisher's `listTree`
read the list with `git ls-tree -r`, and skipped every entry that was not
a blob without saying so.

| # | Fault | Where | Fixed by |
|---|---|---|---|
| A3 | **A missing tree was read as an empty one.** | `room/src/artifacts.ts` 145 to 153 and 246, removed at step 19 | `snapshotFiles` reads every tree with `Reader.tree`. An absent object is `missing-object`, a corrupt one `hash-mismatch`, another type `wrong-type`. The refusal ends the whole read, and no list is returned. The test removes one loose tree from a real repository and reads again. Its control reads a refused tree as empty, and the test fails by its assertion. |
| L1 | A gitlink was left out of the list in silence. The snapshot then differed from the tree with no sign of it. | `gitops.ts` at `5e5583e74`, line 458 | `gitlink`: the read is refused. |
| L2 | `ls-tree` does not check an object's hash, and its output was split at tabs and spaces with no check of a name. | The same, 453-459 | The reviewed reader checks type, size and hash of each tree, and `parseTree` checks each entry. A name that is not well-formed UTF-8, or that `part` refuses, is `bad-path`. |
| L3 | No bound on the files of one snapshot. | The same | `SNAPSHOT_BOUNDS`: files, trees, path length and depth. Each is a stated constant (deltas, entry EW9). Passing one refuses the read. No shorter list is returned. |

A blob is named and not read by `snapshotFiles`. The commit that
`snapshotCommit` builds names the same blob, and whoever writes that commit
into a repository checks its closure there, object by object, as every send
of `packages/git` does (`Git.send`).

## 4. The snapshot repositories: `git/src/snapshot/repos.ts`

It kept one repository for each snapshot commit at the earlier host, one
read token for each job, and its own cleanup ledger in three tables.

| # | Fault in the parked code | Lines | What follows |
|---|---|---|---|
| R1 | **A second ledger.** Three tables of its own, with the states `in-flight`, `owed` and `done`, outside any history. This is fault M1 of the host review, in another file. | 129-141 | No table. The adopted model gives the snapshot repository to the change lane's ledger: a record, a creation with at most 3 attempts, and a deletion (section 3.11). |
| R2 | **An unknown creation was settled by seeing the repository.** `checkCreate` asked the host for the repository by name, and marked the creation `observed`. The plan's section 5 and the note's section 5.4 say that a listing or a read settles no create: only that request's own answer does. | 413-424 | Nothing is settled by a read. A creation is an operation whose attempt stays `unknown` until its own answer. |
| R3 | **A revocation was settled by the local clock.** A failed revocation was marked `expired` when the token's end time, which is the host's, was not later than the Room's reading. No margin. This is fault M3 of the host review. | 462-472 | A read token is a `token` record of `git-read@1`. Its revocation is an operation, and nothing ends it by time (deltas, entry EB4). |
| R4 | **A repository was reused across jobs.** One repository served every job of the same snapshot commit, for up to 24 hours. Section 5.1 gives a snapshot repository to one check job, and never reuses it. | 6-7, 52, 235-239 | Not carried. One for a job. |
| R5 | **A token that outlived the job was minted first and revoked after.** The check was right, and it is kept as a rule: a read token must end before the job's deadline. | 345-365 | The mint's outcome rule of `git-read@1`: a token whose end time at the host is not before the job's deadline is never `live`. It goes from `minting` to `revoking`, with its revocation (`derive/src/capability/gitread.ts`, `useEnded`; deltas, entry EW6). |
| R6 | **The plaintext was returned to the caller.** `mint` gave `SnapshotToken.token`, and the Room put it into the job that it sent to the checker service. | 83-90, 366 | The plaintext goes from the mint's answer to the gateway's side only, after the sealed outcome entry made the token `live` (`packages/git/src/host.ts`). It is in no job and no entry. |
| R7 | **The creation token was revoked by its plaintext, and a failure was dropped.** `.catch(() => false)`. | 292-295 | Not carried. A credential that a creation returns is revoked by its ID, as an operation that the outcome entry opens (section 5.7, "How the base's steps become entries"). |
| R8 | **Readiness rested on an inventory of tokens.** A repository was `ready` when a listing showed no active token. The check that an inventory is complete was right for what it did. The adopted model lists nothing. | 302-308 | Not carried. |
| R9 | Names were made from a prefix, the snapshot commit and a row number. Section 5.1 gives the identity as the change lane, its incarnation and the job. | 23, 254 | Not built: see below. |
| R10 | Waits and backoff were on `Date.now()` and `setTimeout` through the earlier workspace module. | 48, 72-73, 200-213 | No timer here. The scope's driver owns the wait. |

**What is built of it, and what is not.**

- Built: a job's read token, as a record of `git-read@1` that the step
  `job-read` makes, with its mint and its revocation as operations of the
  lane's one ledger, and the driver that sends them
  (`derive/src/capability/gitread.ts`; `packages/git/src/host.ts`). Faults
  R1, R3, R5 and R6 are answered there.
- Built: the files and the commit of a snapshot, as pure functions
  (`packages/git/src/snapshot.ts`).
- **Not built: the snapshot repository itself.** No record, no creation, no
  deletion, no name, and no write of the snapshot commit into a repository.
  The adopted texts say that the step `job-read` opens them "for a filtered
  check". They do not say which check is filtered: a configuration has six
  members and none is a filter. They name no record and give it no states.
  So the step derives none, for any job, and every check reads the
  canonical repository with its read token. This is the deltas' entry EW3,
  with its owner. The earlier `writeSnapshot`, which pushed the commit into
  an empty repository at one ref, has no successor until then. When it is
  written, the push is `Git.send` with `old: null`, which creates a ref
  only if it is absent and checks the closure first.

## 5. Witnesses and controls

| Witness | File | Command |
|---|---|---|
| A row of `forms-prepare`: the step `job-read`, on the capability's own code, and the life of a job's read token | `packages/derive/test/forms-prepare.test.ts`, the last two tests | `npx vitest run --project derive forms-prepare` |
| The files and the commit of a snapshot, on a real local repository | `packages/git/test/snapshot.test.ts` | `npx vitest run --project git snapshot` |
| The driver, for a token of `git-read@1` | `packages/git/test/host.test.ts`, the second test | `npx vitest run --project git host` |

The repository of the snapshot tests is a local repository, not a host.
The host and the gateway's side of the driver's test are stand-ins of test
support, and the entries there are made by hand.

Failure controls, each run once with `scripts/control.mjs`. Each
"distinguishes", by an assertion.

| Guard | Change | The test that failed |
|---|---|---|
| A tree that cannot be read is not empty (A3) | `snapshotFiles` reads a refused tree as `[]`. | `snapshot.test.ts`, "a tree that cannot be read is not an empty tree" |
| A file and a directory of one name (S1) | `snapshotCommit` does not look for a directory of the file's name. | `snapshot.test.ts`, "the snapshot commit is a function of the files" |
| One `job-read` entry for a job | The step does not look for a token of the job. | `forms-prepare.test.ts`, the first `job-read` test |
| The signer is the checker of the rules | The step does not compare the signer. | The same test |
| A token ends before the job's deadline (R5) | `useEnded` reads the job's state only. | `forms-prepare.test.ts`, "a job's read token is never live past its use" |
| A record is read under its own owner | The driver takes a job from a record of either owner. | `host.test.ts`, "a job's read token is a token like any other" |
