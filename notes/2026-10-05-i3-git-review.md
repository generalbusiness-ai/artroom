# I3: the review of the retained Git code

Written 2026-10-05, with steps 17 and 21 of the I3 plan
(`notes/2026-10-05-i3-implementation-plan.md`, section 8.3). The I3
commission says: "Retained runner/Git readers require review including
checked parent/object types and safe object-ID arguments." This note is
that review for the Git reader, the Git commands, the push outcome and the
gateway. The runner is step 25's.

"The authority note" is revision 18 at `99bc48e8`. "The proof plan" is
revision 9 at `85be9f0b`. "The facts file" is
`notes/2026-10-04-authority-effects-and-publication/publication-and-authority-facts.md`
at `99bc48e8`. Parked paths are under `parked/`, as they were at
`5e5583e74`. New paths are under `packages/git/`.

Every parked file named here was read in full, at the lines, before
anything moved. No file moved as it was. Each function that is kept was
written again against the checks below, and the rest was dropped. The
tables say which.

## 1. The rules that every part keeps

| Rule | How it is kept | Where |
|---|---|---|
| An object ID is 40 lower-case hex characters, and not the zero ID. | `objectId` and `isObjectId`. Upper case is refused: an ID in an entry is compared as text. | `src/names.ts` |
| SHA-256 repositories are not supported. | No adopted text names the hash function (entry EG1). An ID of 64 hex characters is refused `unsupported-object-format`. A push that announces the SHA-256 object format has 64-character IDs in its commands, and the gateway refuses it as no ref-update command. | `src/names.ts`; `src/gateway.ts` |
| A ref name follows `git check-ref-format`, and is narrower. | `refName`: it begins `refs/` and has a further component; only ASCII letters, digits, `.`, `_`, `-`, `/`; no `..`, no `//`, no trailing `/` or `.`; no component begins with `.` or `-` or ends with `.lock`; at most 255 characters. | `src/names.ts` |
| No value that begins with `-` becomes an option. | An object ID is hex. A ref name begins `refs/`. A remote is an absolute path or a URL. A directory is an absolute path. Each is checked in the function that puts it on a command line, not only by a caller. | `src/names.ts`; `src/program.ts` |
| No credential is in an argument, an environment or a URL (section 5.3). | `remoteUrl` refuses a URL with a user or a password, `credential-in-url`, and a URL with a query or a fragment. The environment of every command is stated whole in `GitProgram`. The gateway alone holds a token. | `src/names.ts`; `src/program.ts`; `src/gateway.ts` |
| A refusal or a failure never holds the refused value or a program's output. | `GitRefusal` holds a fixed reason and a fixed word. `GitFailure` holds a step's name and an exit code. | `src/names.ts`; `src/program.ts` |

## 2. The reader: `log/src/git.ts` and `log/src/gitcli.ts`

### 2.1 What was found

| # | Fault in the parked code | Lines | Fixed by |
|---|---|---|---|
| R1 | A parent line was not checked at all: `parents.push(line.slice(7) as Sha)`. Any text became a parent ID. | `git.ts:139` | `parseCommit` passes each parent through `objectId` before it is used. |
| R2 | Headers were found by a scan of every line, in any order. A second `tree`, `author` or `committer` line replaced the first without an error. Two readers could disagree about which tree a commit has. | `git.ts:137-142` | `parseCommit` reads the headers in Git's order. A repeated or misplaced `tree`, `parent`, `author` or `committer` line is `repeated-header`. |
| R3 | A tree's mode was not kept: anything that was not `40000` was read as `100644`. An executable, a symbolic link and a gitlink were all read as a file. | `git.ts:77` | `parseTree` keeps the mode exactly. A mode that Git does not write is `unknown-mode`. A gitlink is its own kind. |
| R4 | `parseTree` checked `sp < 0` after it had used `sp`, so a tree with no space was read from offset -1. A name was not checked. | `git.ts:72-74` | The space and the NUL are checked before use. A name is not empty, has no `/`, and is not `.` or `..`. |
| R5 | A tree could hold one name twice. | `git.ts:68-81` | Entries are in Git's order and no name is there twice, as a set. The test found that Git's order alone lets a file `a` and a directory `a` both stand, with `a.b` between them. |
| R6 | `readObject` took the type from the store and returned it. No caller could say which type it expected, and nothing compared the bytes with the ID. | `git.ts:151`; `gitcli.ts:87-91` | `Reader.object` takes the expected type. It compares the stated type, then the size, then the SHA-1 of the header and the bytes with the ID that was asked. |
| R7 | The command-line reader put an unchecked ID on three command lines, and an unchecked ref name and remote on others. | `gitcli.ts:64`, `73`, `88-90`, `120` | `repositorySource` checks the ID and the ref name where each becomes input to a command. `gitcli.ts` is not kept. |
| R8 | The command-line reader took a token inside the remote's address, so on the command line, and removed it from errors by a pattern of one host's token format. | `gitcli.ts:1-8`, `17-20` | No remote may carry a credential. No error holds a program's output, so nothing depends on a pattern. |
| R9 | The command-line reader added the caller's whole environment, and read the user's Git configuration. | `gitcli.ts:51` | `GitProgram` states the environment whole and reads no system or global configuration. |
| R10 | The reader's own "reachable" walk took a missing object as present with no content, and recursed with no bound. | `git.ts:325-340` | `Reader.closure` is iterative and bounded, and the first object that is absent ends it. |
| R11 | No size or count had a bound: a commit, a tree, the parents of a commit, a walk. `maxBuffer` was 1 GiB. | throughout | `ReadBounds`, with each number's source (entry EG3). |

### 2.2 The review table

One row for each function that is kept from the parked reader. "Checks on
IDs", "on types", "on sizes and counts" and "on arguments" are the four
that the commission and the proof plan's key O15 name.

| Kept as | From | What it parses | Checks on object IDs | Checks on object types | Checks on sizes and counts | Argument safety |
|---|---|---|---|---|---|---|
| `idOf` | `gitObject`, `git.ts:34` | Nothing. It computes an ID: the SHA-1 of `<type> <size>\0` and the content. | The result is 40 lower-case hex by construction. SHA-1 only (entry EG1). | The type is one of `commit`, `tree`, `blob`, `tag`, by its TypeScript type. | The size in the header is the length of the bytes given. | It runs no command. |
| `parseCommit` | `parseCommit`, `git.ts:129` | A commit's content: `tree`, each `parent`, then `author` and `committer`, in that order. It returns the tree and the parents. It reads no author text (section 6.2). A header it does not know, such as `gpgsig`, is passed over. | The tree line and each parent line are full object IDs, checked before use. A parent of 39 characters or in upper case is `bad-object-id`. A parent of 64 characters is `unsupported-object-format`. | None here: a line says nothing of what it names. `Reader.linked` and `Reader.closure` read what the lines name. | At most 64 parents, `too-large`. The bytes are bounded by the caller, `Reader.object`. | It runs no command. |
| `parseTree` | `parseTree`, `git.ts:68` | A tree's content: for each entry the mode, the name as bytes, and the 20 bytes of the ID. | Each entry's ID is 40 hex and not the zero ID. | The mode gives the kind, exactly: `100644`, `100755`, `120000` are a blob, `40000` a tree, `160000` a gitlink. Any other mode is `unknown-mode`. | A mode is at most 6 bytes. The bytes are bounded by the caller. | It runs no command. A name is bytes and is never an argument. |
| `Reader.object` | `GitReader.readObject`, `git.ts:151` | One object from a source. | The ID is checked before the source is asked. The bytes must hash to it: `hash-mismatch`. | The caller states the type. The store's stated type is compared with it before the bytes are read as that type: `wrong-type`. The hash is computed with the expected type, so a store cannot pass a tree as a commit by lying about the type. | The stated size is compared with the bound before the bytes are taken: `too-large`. The bytes must be exactly the stated size: `wrong-size`. That covers "a wrong size" and "excess bytes after a complete object". | The source checks the ID again where it becomes input to a command. |
| `Reader.commit`, `Reader.tree`, `Reader.blob` | The callers of `readObject` in the earlier verifier, deleted by I1 | `object` with the type `commit`, `tree` or `blob`, then `parseCommit` or `parseTree`. | As `object`, and as the parser. | As `object`: a tree is never read as a commit. | Commit 1 MiB, tree 8 MiB, blob 32 MiB. | As `object`. |
| `Reader.linked` | New. The earlier code had no such check. | One commit, with its tree read as a tree and each parent read as a commit. | As above, for each. | **A parent must be a commit: `wrong-type`, named `parent`. The commit's tree must be a tree: `wrong-type`, named `tree`.** | As above, for each. | As `object`. |
| `Reader.ref` | `GitReader.readRef`, `git.ts:153`; `gitcli.ts:62` | The target of one ref, or null when the store says the ref does not exist. | The target is a full object ID, or the read is refused. The earlier code took the first 40 characters of a line unchecked. | None: a ref's target is read with `commit` or `linked` by the caller that needs a commit. | One ref. | The name passes `refName` before the source is asked, and again in the source. A source that cannot answer rejects: unreadable is never absent. |
| `Reader.snapshot` | New, for section 6.2's snapshot. | Every ref under a prefix, with its target, in byte order of the name. | Each target is a full object ID. | None, as `ref`. | At most 100,000 refs, `too-large` (entry EG3). No ref twice. | The prefix and every returned name pass `refName`. One name that does not, refuses the whole list: a list with a ref left out would hide a foreign root. |
| `Reader.closure` | `MemoryGit.reachable`, `git.ts:325`, and the staging check of `StagingArea`, `git.ts:249-253` | The commit, its tree, every tree and blob under it, and the same for every parent, down to the commits the caller names as already known. | Every object is read by `object`, so every ID is checked and every object's bytes hash to its ID. | Each object is read as the type that the line naming it states: a parent as a commit, a tree line and a `40000` entry as a tree, the other entries as blobs. One ID named as two types is read as each. A gitlink ends the check, `gitlink` (entry EG5). | At most 100,000 objects, `too-large`. Iterative: no recursion depth. | As `object`. |
| `repositorySource` | `GitCli.readObject`, `readRef`, `gitcli.ts:62-91` | The output of `git cat-file --batch-check`, `git cat-file <type> <id>` and `git for-each-ref`, for a repository on disk. | The ID passes `objectId` in this function. The answer line must name that ID. | The type word must be one of four before it is an argument of `cat-file`. | The size is read from `--batch-check` before the content is read, and content over the caller's limit is not read. | Argument arrays. The ID goes to `--batch-check` on standard input, and to `cat-file` after the type word. The directory is an absolute path. No remote is contacted: the earlier fetch-on-miss is not kept. |

A commit with one parent written twice is kept as written. Git's own
tools write none, old histories hold some, and a walk keeps a set of what
it has seen.

### 2.3 What was dropped, and why

| Parked | Why it did not move |
|---|---|
| `encodeTree`, `buildTree`, `encodeCommit` (`git.ts:56-127`) | Writers of objects, for the log's commits. The log has no successor. A step that writes an object, such as the receipt's commit (section 6.10), does it with the `git` program, which checks what it writes. |
| `GitRemote.push`, `PushOutcome`, `OBJECT_TOO_LARGE` (`git.ts:156-205`, `260`) | The log's push. Its successor is section 3 of this note. |
| `StageWant`, `StagePart`, `StageOutcome`, `StagingArea`, `GitRemote.stage` (`git.ts:171-258`) | A transfer of one object in parts, for the log publisher. Staging in I3 is a read of the fork and one new ref (section 6.2), and names no parts. Entry EG2 says what that leaves of the proof plan's table "Interrupted transfer". |
| `MemoryGit` (`git.ts:263-341`) | An in-memory repository with scripted faults. The plan's `MemoryHost` is step 9's, in the platform package's test support, written from the design's text. This one took a missing object as present (R10). |
| `gitcli.ts`, whole | The plan's section 6.3 does not keep it: R7, R8 and R9. Its one use, the log push, has no successor. |
| `web.d.ts` | The package declares Node's types. |

### 2.4 Dependencies of the parked reader

| Dependency | Decision |
|---|---|
| `@noble/hashes` 2.4.0, for SHA-1 | Kept, at the same version. The bytes package already depends on it, so the lock file gains no new external package. It hashes without a runtime's own API, so the reader's checks run the same in Node and in a Worker. |
| `@noble/curves`, `@generalbusiness/artroom-policy` | Dropped. They were the verifier's. |
| `@generalbusiness/artroom-contract`, for the type `Sha` | The type is gone from the contract. `ObjectId` is this package's. The contract is still a dependency, for the evidence types of step 21. |

### 2.5 Witnesses

| Invariant | Test | Command |
|---|---|---|
| T16. An object counts only when its bytes match its ID, its type and its size. A commit's parents and tree and a tree's modes are checked. An ID or a ref name is refused before it is an argument. | `packages/git/test/reader.test.ts`, first test | `npx vitest run --project git reader` |
| T17. A closure is complete object by object. | The same file, second test | The same |

Both run the real `git` program against a repository that the test makes
in the system's temporary directory. That is a local repository, not a
host. Where a row needs a store that answers wrongly, the test wraps the
real source and changes one answer, and says so. Where a row needs a line
that Git's own writer refuses to write, the test builds the object's bytes
and says so.

Failure controls, each run once with `scripts/control.mjs`, each
"distinguishes" by the assertion that states the invariant:

| Change | The assertion that failed |
|---|---|
| `Reader.linked` checks a parent's ID and does not read it as a commit. | `expected 'not refused' to be 'wrong-type: parent'` |
| `refName` allows `..`. | `expected 'not refused' to be 'bad-ref-name'` |
| `refName` allows a component that begins with `-`. | `expected 'not refused' to be 'bad-ref-name'` |
| `Reader.closure` does not read a blob. | `expected { complete: true, objects: 7 } to deeply equal { complete: false, ... }` |
