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

## 3. The commands: `git/src/publisher/gitops.ts`

Step 21. The successor is `src/gitops.ts`, on the runner of
`src/program.ts`.

### 3.1 What was found

| # | Fault in the parked code | Lines | Fixed by |
|---|---|---|---|
| G1 | **The push of the branch checked nothing about the commit it sent.** It asked only whether `<id>^{commit}` exists, which a tag of a commit also answers. Not its tree, not its parents, not its closure. | `gitops.ts:258-260`, `517-530` | `Git.send` reads the commit with `Reader.linked` and checks the stated tree, the stated first parent, every object the push would send, and gitlinks, before the push command runs. Section 3.3 has each. |
| G2 | No end-of-options mark stood before a remote or a refspec. The remote was checked only by a caller, in another file. | `gitops.ts:249-251`, `290-292`, `341-343`; `container.ts:126-129` | `--` stands before the remote in `init`, `ls-remote`, `fetch` and `push`. `remoteUrl` is called in `gitops.ts` itself. A revision is always a checked 40-hex ID. |
| G3 | The ref check let a component begin with `.` or `-`, and looked for `.lock` at the end of the whole name only. | `gitops.ts:50`, `72-77` | `refName` (section 1). |
| G4 | An error carried the last 400 characters of Git's standard error. A push's outcome carried 600 characters of its output to every caller. | `gitops.ts:178-186`, `352`; `push-outcome.ts:65` | `GitFailure` holds a step and an exit code. `PushAnswer` holds no text of Git's or of the remote's. |
| G5 | The local repository of a remote was named by replacing characters and keeping the last 120. Two remotes could share one directory. | `gitops.ts:241` | The name is the SHA-1 of the remote's text. |
| G6 | The transports that Git may use, and the check of received objects, were set by a caller or not at all. | `gitops.ts:52-65`; `container.ts:65-70` | `HARDENING` holds `protocol.allow=never` with HTTPS alone, `http.followRedirects=false` and `transfer.fsckObjects=true`, for every command. |
| G7 | Shell scripts ran by `sh -c`, with paths as arguments. | `gitops.ts:535-541`, `562`, `583`, `632-655` | Not kept. No shell runs. |
| G8 | Creating a ref decided "done" from the push's own answer, and after a failed push decided from a read without saying which was which. | `gitops.ts:346-353` | `Git.send` returns what the push told. `classifySend` and `attemptOutcome` judge it, with the gateway's record and the read kept apart. |

### 3.2 The review table

| Kept as | From | What it runs and parses | Checks on object IDs | Checks on object types | Sizes and counts | Argument safety |
|---|---|---|---|---|---|---|
| `GitProgram.run`, `ok` | `GitOps.git`, `ok`, `gitops.ts:211-224` | One `git` process, with the settings of `HARDENING` and a whole environment. | None: it takes arguments from this package only. | None. | A deadline for each command, 120 seconds. | An argument array. No shell. No credential in an argument or the environment. |
| `Git.repository` | `GitOps.repo`, `gitops.ts:240` | `rev-parse --is-bare-repository`, then `init --bare`. | None. | None. | None. | The directory is made from a hash, under an absolute path. `--` before it. |
| `Git.readRef` | `GitOps.lsRemote`, `gitops.ts:290` | `git ls-remote -- <remote> <ref>`: lines of an ID, a tab and a name. Only the line whose name is exactly the ref counts. | The ID is a full object ID, or the read is refused. | None: a ref's target is read as a commit by the caller that needs one. | One ref. | `refName` and `remoteUrl`, then `--`. A remote that cannot be read is a failure, never "absent". |
| `Git.source` | `GitOps.lsRemote`; `GitCli.readObject` | The reader's source for a remote: refs by `ls-remote`, objects from the local repository. | By the reader, and again in `repositorySource`. | By the reader. | By the reader's bounds. | As `readRef`. |
| `Git.fetch` | `GitOps.fetch`, `gitops.ts:249` | `git fetch --no-tags --no-write-fetch-head -- <remote> +<ref>:<ref>`. | Git checks each received object against its ID and form (`transfer.fsckObjects`). | The same. | The deadline. | Each ref passes `refName`. `--` before the remote. |
| `Git.isAncestor` | `GitOps.isAncestor`, `gitops.ts:262` | `git merge-base --is-ancestor <a> <b>`. Exit 0 is yes and exit 1 is no. Any other end is a failure. | Both pass `objectId`. | Git refuses an object that is not a commit, as a failure. | The deadline. | Two 40-hex IDs. |
| `Git.send` | `GitOps.pushWithLease`, `createRef`, `gitops.ts:341-353` | The checks of section 3.3, then one `git push --porcelain --no-verify --force-with-lease=<ref>:<old> -- <remote> <new>:<ref>`. Its output is read by `readAnswer` (section 4). | `old`, `new`, the stated tree, the stated parent and each `have` pass `objectId`. Each ID that `rev-list` prints is checked before it is input to `cat-file`. | Section 3.3. | At most 100,000 objects in one send, `too-large`. The reader's bounds on the commit. | `refName`, `remoteUrl`, `objectId`. One refspec. `--` before the remote. |
| `Git.publish` | `GitOps.pushMain`, `gitops.ts:513-530` | `send`, for a branch, with the reserved base and the reviewed commit. | As `send`. | As `send`. | As `send`. | The ref passes `branchRef`: it begins `refs/heads/`. |

### 3.3 How the push checks what it sends

The task for this step states three things that the push must check.
Each is enforced before the push command runs. A failure sends nothing
and returns `ran: false` with the reason.

| What must hold | Enforced by | Refused as |
|---|---|---|
| The commit that is published is the reviewed one: that exact commit ID. | The ID is the caller's, from the destination's row, and is the only source of the refspec's left side. `Reader.linked` reads that ID from the local repository, compares the stored type with `commit` and the bytes' SHA-1 with the ID. A tag of the commit is another ID and another type. | `bad-object-id`, `missing-object`, `wrong-type`, `hash-mismatch` |
| Its tree is the tree that the destination's row states. | The tree line of the commit, as parsed, is compared with the stated tree. The tree is read as a tree. | `tree-mismatch`, `wrong-type` |
| Its parents are what the reservation expects. | The first parent line is compared with the reserved base. Every parent is read as a commit. The same base is the expected old value of the compare-and-set, `--force-with-lease=<branch>:<base>`, so Git sends the update only while the remote advertises the base, and the host's own compare-and-set refuses it when the branch holds anything else (section 12, H1; the row "another writer moves the ref" of the table of sends). | `parent-mismatch`, `wrong-type`; then "not sent" or "refused" |
| The published ref is exactly the destination's branch. | The ref is the caller's, from the destination's row. It passes `branchRef`. It is the only ref of the only refspec. `readAnswer` counts only Git's status line for that ref, and a status line for any other ref makes the send `unknown`. The gateway's grant allows that ref alone, with that old and that new value. | `bad-ref-name`, `not-a-branch`; `not-granted` at the gateway |
| Everything the push carries is here. | `git rev-list --objects <commit> --not <base>` lists what would be sent. Each listed ID is asked for by `cat-file --batch-check`, and one that is missing refuses the send. The base's own closure is the host's: it is the branch's head. | `incomplete`, `too-large` |
| No gitlink. | `git ls-tree -r` of the commit's own tree. | `gitlink` (entry EG5) |

An ambiguous answer is never sent again by this module. `Git.send` runs
the push command once and returns. The gateway forwards one update for a
grant and closes it, so a second push under the same attempt reaches no
host, whatever process asks.

### 3.4 What was dropped, and why

| Parked | Why it did not move |
|---|---|
| `pinnedRef`, `objectsRef`, `integrationRef`, `pinObjects`, `pinRef` (`gitops.ts:79-92`, `296-333`) | Names made from a lane and a lease generation, which the plan removes (its section 6.1, last row). A staged root's name is section 6.2's, and step 18 or 24 makes it. Staging is a fetch and one `send` with the old value null. |
| `preview`, `planIntegration`, `integrate`, `mergeTree`, `integrationMessage` (`gitops.ts:146-149`, `269-276`, `355-444`) | The service built the merge commit. In the adopted design the integrator builds it in a hold (section 6.2), and the destination only checks it. |
| `listTree`, `writeSnapshot`, `SNAPSHOT_REF`, `SNAPSHOT_AUTHOR` (`gitops.ts:123-139`, `446-506`) | The filtered snapshot is step 24's, "written again", in `packages/git/src/snapshot.ts`. It is not reviewed here, so it does not move. The earlier text is in Git history at `5e5583e74`. |
| `readLogRef`, `stageLog`, `reconcile`, `stagedSizes`, `pushLog`, `sh`, `LOG_REF` and the stage types (`gitops.ts:151-176`, `278-287`, `532-712`) | The log has no successor (plan section 6.1), and G7. |
| `revParse`, `hasCommit` | G1: a peel to a commit lets a tag pass. `Reader.linked` reads the exact type. |
| `publisher/git-publisher.ts`, whole | An adapter from `GitOps` to `PublisherPort`, an interface of the earlier landing engine. |
| `publisher/client.ts`, whole | The earlier Room's side: `ContainerPublisher` and `Pinning`, over the landing engine's port, the mint ledger's `withToken` and the host's binding. Their successors are the destination's rules (step 27) and the host port (step 19). |
| `publisher/container.ts`, whole | A Durable Object that owns a container, and a Worker entry point whose configuration held each grant with its token. It needs the Workers runtime, names the earlier host, and serves the log push. The real container and its route are the host session's (plan section 5). Section 6 says what that session must supply. |

## 4. The push outcome: `git/src/publisher/push-outcome.ts`

The successor is `src/push-outcome.ts`.

### 4.1 What was found

| # | Fault in the parked code | Lines | Fixed by |
|---|---|---|---|
| P1 | A push was "not sent" (`error`) when Git's standard error matched one of five patterns, and "perhaps sent" when it matched one of six others. Section 6.6, step 4, requires the gateway's record for "not sent". One recorded sample holds a "before" phrase after the pack was sent, and only the order of the two lists saved it. | `push-outcome.ts:25-42`, `84-85` | `classifySend` takes the gateway's record. Standard error decides nothing, but for the host's listed codes (P5). |
| P2 | `landed` was an outcome, from the push's answer alone. | `push-outcome.ts:71-73` | There is no such class. What Git reports is kept as `reported`, and the send is `unknown` until the read. |
| P3 | A forced update, a new ref, a delete and "up to date" were all `landed`. | `push-outcome.ts:71` | `Reported` keeps `updated`, `forced`, `created`, `deleted` and `up-to-date` apart. |
| P4 | `(stale info)`, Git's own check before it sends, and `(stale ref)`, the earlier host's answer, were one refusal, `lease`. | `push-outcome.ts:75` | `stale` is Git's own, and with a record of no forward it is "not sent". A remote's rejection is `remote-rejected`, whatever its words: no host's wording is read. |
| P5 | The earlier host's refusal code was a constant. | `push-outcome.ts:44-61` | `readAnswer` takes the list as a parameter. It is empty until a host is named (entry EG9). |
| P6 | The first status line for the ref decided, and any other line was passed over. | `push-outcome.ts:66-68` | A status line for another ref, or a second for the same ref, sets `others`, and the send is `unknown`. |

### 4.2 The review table

| Kept as | From | What it parses | Checks |
|---|---|---|---|
| `readAnswer` | `classifyGitPush`, `artifactsRefusal`, `push-outcome.ts:55-87` | The stable output of `git push --porcelain`: lines of a flag, a tab, `<from>:<to>`, a tab and a summary. On standard error, only a line `remote: <code>` whose code the caller listed. | The destination ref must equal the ref that was sent, as text. The flag is one of Git's six. The result holds no text of Git's or of the remote's. It takes no ID and runs no command. |
| `classifySend` | `classifyGitPush`, `definitelyNotApplied`, `push-outcome.ts:63-103` | Nothing. It is the table of section 6.6, step 4, over a `PushAnswer` and the gateway's record. | "Not sent" needs a closed grant with no forward. "Refused" needs a closed grant with one forward, an exit code, and the remote's rejection of that ref or a listed code. Everything else, and every contradiction, is `unknown`. |
| `attemptOutcome` | New. The earlier engine decided outcomes itself. | Nothing. It gives the contract's outcome with its evidence by basis. | `refused` with the basis `own-answer`; `confirmed` with the basis `read`, only after the attempt's own report and a read of that ref that shows the value sent; `unknown` with the basis `none` (entries EG6 and EG7). |

`outcomeNote` is dropped: a `PushAnswer` is already safe to record.

## 5. The gateway: `git/src/publisher/ref-fence.ts`

The successor is `src/gateway.ts`.

### 5.1 What was found

| # | Fault in the parked code | Lines | Fixed by |
|---|---|---|---|
| F1 | A packet's length was read by `parseInt`, which takes `0x1f`, a leading space or sign, and upper case. | `ref-fence.ts:63` | Four lower-case hex digits and nothing else. A length of 1 to 4 is refused. |
| F2 | Any path under the repository's prefix was forwarded with the token. A push was known by the path's ending or by a query. | `ref-fence.ts:111-114`, `155-162` | Only three exact paths pass: `info/refs` with one of two exact queries, `git-upload-pack` and `git-receive-pack`. |
| F3 | The fence kept nothing: no record of a forward, no count, no attempt. Any number of matching pushes passed while the route was open. | `ref-fence.ts:131-173`; the facts file, section 3.3 | One grant for an attempt. "Forwarding" is recorded before the forward. One update is forwarded and the grant is closed. |
| F4 | The token was in the configuration of a Worker entry point, given whatever its state. | `ref-fence.ts:132-141`; `container.ts:132-138` | The plaintext is in a private field, in memory. A grant is opened only for a token whose state is `live`. |
| F5 | A refusal's text held the ref name from the request. An upstream's error was thrown on. | `ref-fence.ts:105-107`, `169-171` | A refusal is one of a fixed list of words. A failed forward answers 502 with fixed text. |
| F6 | Several commands passed when each was allowed. Capabilities were taken from any line. A delete was never allowed. | `ref-fence.ts:73-79`, `102-109` | Exactly one command, equal to the grant. Capabilities on the first line only. A delete passes only under a grant whose new value is null. |
| F7 | The caller's own headers were passed on, but for `Authorization`. The credential's scheme was the earlier host's. | `ref-fence.ts:158-159` | `Authorization`, `Proxy-Authorization` and `Cookie` of the caller are dropped. The scheme is a parameter with no default. |
| F8 | The allowed repositories were a host name and a path prefix of the earlier host. | `ref-fence.ts:116-129` | A grant names one repository, as a remote that `remoteUrl` takes. Which repositories a deployment may name is the host port's (step 19). |

### 5.2 The review table

| Kept as | From | What it parses | Checks on object IDs | Sizes and counts | Argument and credential safety |
|---|---|---|---|---|---|
| `readCommands` | `readCommands`, `ref-fence.ts:40-95` | The pkt-lines at the start of a receive-pack body, to the first flush. Each command is `<old> <new> <ref>`. It returns a stream that replays the whole body. | Two IDs of 40 lower-case hex. A SHA-256 push has 64, and is refused. | At most 64 KiB of commands. | The ref passes `refName`. `shallow` and `push-cert` are refused. |
| `Gateway.open` | `Publisher.route`, `container.ts:132-138` | A grant: an attempt, a repository, one update or none, and a token. | `old` and `new` pass `objectId`, and differ. | One open grant for a repository. One grant for an attempt. | `refName`, `remoteUrl`. The token must be `live`. A record is written before the plaintext is kept. |
| `Gateway.forward` | `gatewayFetch`, `checkUpdates`, `ref-fence.ts:102-109`, `152-173` | One HTTP request of Git's smart protocol. | The one command equals the grant: ref, old and new, with the zero ID for null. | One update for a grant. Reads are counted and not bounded. | The credential is set in one header of the forwarded request. It is in no URL. A URL with a user or a password is refused. A compressed push is refused, because its commands cannot be read. |
| `Gateway.close`, `ended` | `Publisher.closeRoute`, `container.ts:140-143` | Nothing. | None. | None. | The plaintext is dropped before the record is written. |

The pack is not read. What a push carries is checked by the sender,
before it sends (section 3.3).

`Gateway.forward` refuses a request whose URL has a user or a password.
A `Request` of the Fetch standard cannot hold such a URL, so no test
reaches that line in Node. It is kept: it costs one comparison, and a
runtime may differ.

### 5.3 Custody, rule by rule

| Rule | Text | Kept by |
|---|---|---|
| The plaintext goes to a gateway only after the outcome entry is sealed, and only when that entry made the token `live`. | Section 5.7, "The plaintext" | `open` takes the token's state as its sealed entry left it, and refuses any state but `live`, `token-not-live`. The gateway cannot read an entry. What it is shown is entry EG8. |
| For a token that the entry made `revoking`, the plaintext is dropped. | Section 5.7 | The same refusal. Nothing of a refused grant is kept. |
| The plaintext is never in an entry, a log, an error or a URL. | Sections 5.3 and 5.7 | It is in one private field. `GrantRecord` has no member for it. A refusal, a log event and a response are fixed words. |
| Git in the container holds none. | Section 5.3 | `GitProgram` states its environment whole. `remoteUrl` refuses a credential in a remote. |
| Revoked after the attempt. An unconfirmed revocation stays a duty. | Section 5.3, the table | The gateway drops the plaintext when the grant closes. The revocation at the host is the ledger's operation by the token's ID (step 19), and is not sent from here. |
| A token's use ends: the hold ends, the holder changes, or a new instance. | Section 5.7; section 5.3, rules 5 and 6 | `ended(tokenId)` closes every grant with that token and drops the plaintext. The caller is the driver that sealed the entry. |
| A second token replaces the first only after the gateway has confirmed that it holds the second. | Section 5.3, rule 4 | `open` resolves with the grant's record only after its record is written and the plaintext is held. That resolved value is the confirmation. A lost confirmation is the caller's to treat as lost. |

## 6. What the production host port needs

The host session is a separate commission. Nothing here starts one. This
package defines the ports and refuses by having no production
implementation of them: nothing in `packages/` constructs a `Gateway` or
a `Git` outside a test.

| Port | Defined in | What the host session, or a later step, must supply |
|---|---|---|
| `Exec` | `src/program.ts` | A runner inside the publisher's container that takes an argument array, gives the process exactly the stated environment, and stops it at the deadline. `nodeExec` is that for Node. |
| `GitSource` | `src/reader.ts` | Nothing more for a container: `Git.source` is the implementation. A host with a read interface of its own may supply another, and the reader checks whatever it returns. |
| `GrantRecords` | `src/gateway.ts` | A durable store for the gateway's record, whose write resolves only when it is durable (entry EG10). |
| `GatewayOptions.upstream` | `src/gateway.ts` | The request to the host. The container's only way out must be the gateway. |
| `GatewayOptions.credential` | `src/gateway.ts` | The header by which the chosen host takes a token. |
| `GitOptions.refusals` | `src/gitops.ts` | The chosen host's codes that it answers before it updates any ref, each with its measurement. |
| The transport | `src/names.ts` | `https`. Which repositories of the host a deployment may name. A certificate bundle, by `ProgramOptions.env`. |
| Assumptions H1 and H2 | The authority note, section 12 | That the host refuses an update whose old value is wrong, and that a read after a write shows it. The tests here show Git's own server code, on this machine, and say nothing of a host. |

## 7. Witnesses of step 21

| Invariant | Test | Command |
|---|---|---|
| The classes of a send and the outcome of an attempt, as one table of a pure function. | `packages/git/test/push.test.ts`, first test | `npx vitest run --project git push` |
| T9. Every send is the same compare-and-set, checked before it is sent and sent once. | The same file, second test | The same |
| T27. The gateway holds one grant for an attempt, records that it is forwarding before it forwards, forwards once and closes. No credential is in an argument, a URL, a record, a log or an error. | `packages/git/test/gateway.test.ts` | `npx vitest run --project git gateway` |

T9 runs the real `git` program, as client and as server, on this
machine. The server is `git http-backend` over a real bare repository,
behind the package's real gateway: a labelled stand-in for a host
(`test/support/host.ts`). It can let another writer move the ref before
the update arrives. The table's expected values are in `test/support/sends.ts`, from
the authority note's text. The plan also runs that table against
`MemoryHost`, which is step 9's and is not in this worktree: the table is
exported for it, with a mark in the source.

T27 is pure. The host is a function in the test.

Failure controls, each run once with `scripts/control.mjs`, each
"distinguishes" by the assertion that states the invariant:

| Change | Test | What failed |
|---|---|---|
| `Git.send` does not compare the first parent with the reserved base. | T9 | The row "its first parent is not the reserved base" was sent. |
| The gateway records "forwarding" with no forward counted. | T9 and T27 | T9: the table of the rows that ran read "not sent" and `refused`, not `unknown`. T27: the grant's record after a forward did not equal `forwarded: 1`. |
| `Git.send` runs the push again when it fails. | T9 | A row ran the push command twice. |
| The gateway passes on the host's error. | T27 | `expected 'threw Error: upstream 500 for https:/…' not to contain` the plaintext. |
| The gateway opens a grant for a token that is not `live`. | T27 | `expected [ 'opened', ... ] to deeply equal [ 'token-not-live', ... ]` |

No single change makes the gateway forward a second update for a closed
grant, and none was run. Three checks each stop it alone: a closed grant
is no longer in the set of open grants, its state is not `open`, and its
plaintext is dropped.

Observed, one run of the package's three test files, `npx vitest run` in
`packages/git`, warm, on a shared machine with other sessions active:
vitest printed a duration of 2.6 seconds, and 3.6 seconds of test bodies
summed across the files. The command was not timed from outside. T9 is
nearly all of it: each push is several processes.

## 8. Test cost of the Git package

The tests of this package were cut for cost without losing an invariant.
What changed, and which test now witnesses what:

- A fixture object is written straight into the object directory, as Git
  writes a loose object, with Node's own SHA-1 (not the package's). That
  costs no process. `confirm` asks the real `git` once for each fixture
  repository whether it reads every object written, with the type and size
  written. Refs are written as loose ref files.
- `reader.test.ts` builds one repository in `beforeAll`. Its second test
  removes one loose object that the first does not read. A stand-in that
  changes one answer of the real source reads the real answers once,
  and not again for each row.
- T9 builds its canonical repository with no process, reads refs from the
  files, and runs only the rows of the send table that Git or its server
  decides. The two rows that lose a reply or a request moved to the
  first test of `push.test.ts`.

| Row of the send table (`sends.ts`) | Invariant | Witness before | Witness after |
|---|---|---|---|
| The update is applied and its answer arrives | One forward; confirmed by a read; class unknown with basis `read` | T9, real push | T9, real push (unchanged) |
| Another writer moves the ref first | The host's own compare-and-set refuses; class `refused`, basis `own-answer` | T9, real push | T9, real push (unchanged) |
| The ref has left the base when the client reads it | Nothing is sent (`reached` 0); class `not-sent`, outcome `refused` | T9, real push | T9, real push (unchanged) |
| The update is applied and its reply is lost | Class `unknown`, outcome `unknown`, basis `none`, though the read shows the commit | T9, real push, host fault `lost-after` | First test: `classifySend` of Git's recorded report of a lost reply with one forward, then `attemptOutcome` with a read of the commit; compared with the row in `SENDS`. The gateway's 502 for a failed upstream, with the record showing one forward: T27 |
| The request is lost before it arrives | Class `unknown`, outcome `unknown`, basis `none`, the read shows the base | T9, real push, host fault `lost-before` | The same, with a read of the base |
| A lost request causes no second push (an attempt that asks again forwards nothing) | A closed grant forwards nothing, and Git's report is `ran`, not reported | T9, after the row `lost-before` | T9, on a new branch at the base after the first attempt closed: no update and no request reached the host, and the closed record is unchanged. A forward would have been applied. T27 shows the same for the gateway alone |

What is not witnessed now by a real client and server: Git's own words
when a connection fails after or before an update. The first test uses
the report as recorded for the earlier classifier. The real report of a
refused request (the gateway answers 403 to an attempt under a closed
grant) is still read from a real client, in T9.

Measured, `npx vitest run --project git`, observed, warm, shared machine
with other sessions active. The package's processes are counted by a
throwaway `git` wrapper on `PATH`, not committed.

| | Before | After |
|---|---|---|
| Reader, first test: processes | 49 | 36 (of which 1 is `confirm` for the file) |
| Reader, second test: processes | 77 | 55 (of which 1 is `confirm`) |
| T9: processes | 243 | 177 |
| T9 alone, observed in the verbose report | 2.43 to 2.46 s | 1.82 to 1.92 s |
| Reader tests, observed in the verbose report | 0.37 s and 0.63 s | 0.28 s and 0.43 s |
| `npx vitest run --project git`, three runs, duration printed | 2.55, 2.54, 2.57 s | 2.04, 1.93, 1.93 s |
| The same, summed test time printed | 3.46 to 3.49 s | 2.58 to 2.75 s |

Most of what is left in T9 is the package's own: the reader runs two
`cat-file` processes for each object, and a send runs about fifteen
processes. That is production behaviour and was not changed.
