# Lane G: the checkers, run live

2026-10-01. Request `e99f67fc`. Package:
[packages/checkers](../packages/checkers/README.md). It builds on lane B
([packages/git](../packages/git/README.md)), which is still under review.

## What was built

- The contract's `Checker` base class and runner wrapper. The checker
  service holds its Ed25519 delegation key as a Worker secret, checks each
  job's binding, runs it in a runner sandbox, and signs the `check` act
  outside the sandbox.
- A runner sandbox: a container with Node.js and git
  (`node:22-bookworm`), separate from the publisher's. It has no internet
  access; a gateway gives it read-only access to the job's one repository
  and GET access to the npm registry.
- Three checkers: `tests`, `types`, and an advisory `llm-review` on Workers
  AI.
- Filtered snapshots for scoped checkers, built by the publisher into a
  per-checker snapshot repository (two new publisher operations in the git
  package).

## Live results

Worker `artroom-lg-checkers`, against a new repo in `gitseq-spike` holding a
small Node project (one function, one test, one TypeScript file, TypeScript
5.9.3 as a dev dependency). One run, from a laptop near New York:
[live-2026-10-01T18-33-28-281Z.json](../packages/checkers/measure/results/live-2026-10-01T18-33-28-281Z.json).

"Check" is the time inside the Worker from the job to the recorded check:
binding, sandbox, checkout, `npm ci`, the command, signing and recording.
"Cold" means the checker's runner container had been stopped; its image was
already on the host.

| Case | Result | Check time |
|---|---|---|
| Tests on a passing commit, cold | Pass | 4.5 s |
| The same, warm | Pass | 1.7 s |
| Tests on a broken function | Fail (`npm test` exited 1) | 1.9 s |
| A changed test with unchanged source: the tree changed, so the check reran | Fail (the new test's expectation is wrong) | 2.2 s |
| Types on the passing commit, cold (installs TypeScript from the registry) | Pass | 5.4 s |
| Types on a type error, warm | Fail (`tsc` exited 2) | 2.9 s |
| Scoped tests (declared `src/add.js`) where a test reads `src/secret.txt` | Fail: `ENOENT` for `src/secret.txt` | 4.9 s, plus 4.4 s to build the snapshot |
| LLM review of the broken function, cold | Advisory pass, one finding: "Function name 'add' is misleading as it now performs subtraction" | 4.3 s |

The first run after the first deploy took 17.2 s for a cold tests check,
when the image was not yet on the host. (That check failed because of the
test project's own script, since fixed; the time is for the same steps.)

**The runner cannot push or reach anything else** (probe results, run from
inside the runner after checkout, as untrusted code would):

| Attempt | Outcome |
|---|---|
| `git push` to the job's repository | HTTP 403 from the gateway |
| `git ls-remote` of the canonical repo, from a scoped job | HTTP 403: not the job's repository |
| `fetch("https://example.com")` | Blocked: no internet (`EAI_AGAIN`) |
| Look for a token in the environment | None |

**A scoped runner cannot read excluded data**, by any route tried:

| Attempt | Outcome |
|---|---|
| `cat src/secret.txt` | No such file |
| `git cat-file -e <its blob>` | Not in the object store |
| `git fetch <snapshot repo> <its blob>` | The server does not have it |
| `git rev-list --all --count` | 1: the snapshot commit, with no history |

All repos the runs made were deleted, and the runner containers stopped.

## Tests

`cd packages/checkers && npm test`: 13 tests, all passing (25 after the
review below). Mutation checks:
eight guards were broken one at a time (job host, job environment, `HEAD`
confirmation, snapshot digest, declared paths, two room stand-in refusals);
each made a test fail. Two first survived; tests were added for them.

## Contract gaps

1. **No job signature.** The contract says the base class "verifies the job
   came from the room" but defines no signature for jobs. The service
   relies on the service binding (only the room's Worker can call it) and
   checks the job's binding. A `artroom-checkjob-v1` signing domain would
   close this.
2. **`gitAuthEnv` format.** Not specified. This package accepts exactly one
   `http.extraHeader` bearer header, and moves the token into the gateway
   instead of the runner's environment.
3. **Advisory checks.** There is no "advisory" flag on a check or an
   obligation. The LLM reviewer always passes and is volatile; policy must
   give it an obligation that does not block landing.
4. **Job fields.** No base commit for review-style checkers (the reviewer
   uses the integration's first parent), and no `volatile` (each checker
   states its own).
5. **The runner wrapper's `exec`** takes `env` per call, but the contract
   does not say how tools find the gateway's certificate authority; this
   package sets `GIT_SSL_CAINFO` and `NODE_EXTRA_CA_CERTS`.

## Not done

- Binding to the real Room (lane A): the harness's ledger stands in.
- Snapshot repositories are made by the harness; the Room must make and
  name them (one per checker configuration).
- Registry access is open to all of npm (GET only). A pinned mirror would
  make `npm ci` non-volatile in a stricter sense.
- No workerd-only unit tests: the unit tests run in Node with real git; the
  Workers parts ran live.

## Review c46a4491

The checker found four defects. All four are fixed; each fix has a test
that fails if the fix is undone. The design now is: **one new container per
job, one owner per runner, and the service reads only its own copy of the
job.**

| Finding | What was wrong | Fix | Tests (`test/isolation.test.ts`) |
|---|---|---|---|
| G1 | Whole-tree jobs of one checker reused a warm container. Closing a job deleted only its directory, so a job could replace a tool (for example `npm`) or leave a process running, and the next job trusted them. | Every job opens a new `RunnerBox` (`RUNNER.newUniqueId()`), so a new container from the pinned image, destroyed when the job ends. A running container left from before is destroyed, never adopted. The runner digest is measured in the new container before job code runs. | "G1: a job cannot reach the next one: a replaced tool and a surviving process die with its container"; "G1: a runner never reuses a container: reopening after close, or over a leftover one, starts from the image" |
| G2 | Concurrent jobs shared one runner and one outbound grant. A second `open` replaced the first job's gateway; the first `close` revoked the second job's access. | A job never shares a runner (G1). A runner also has one owner: `open` returns an owner token that `exec` and `close` need; a second `open` is refused; a foreign or stale `close` changes nothing; a failed `open` destroys its container. | "G2: one owner per runner…"; "G2: a failed open cleans up…"; "G2: concurrent jobs of one checker each get their own runner and grant…"; "G2: a same-ID retry gets its own runner…"; "G2: two runs of one job ID on one checker each find only their own workspace, across awaits"; "G2: the room stand-in records concurrent submissions of one idempotency key once" |
| G3 | `handle` used the caller's job object throughout, so a caller could change the integration, configuration or input while `npm test` ran, and the service signed the changed fields for the original result. | `handle` takes a deep, frozen copy (`ownJob`) before its first await, and binding, checkout, run, signing and the after-hook read only it. Workspaces are found by the copy's identity, not the job ID; the LLM reviewer's findings travel in its outcome. The harness ledger keeps its own copy of issued jobs. | "G3: the service signs its own copy of the job: changing any field, nested input included…"; "G3: a scoped job's paths and snapshot, and the reviewer's note, come from the service's copy" |
| G4 | `RunnerBox.exec` redacted and cut every output to its last 64 KiB, including the `git ls-tree` listing used to verify a snapshot. A scoped tree of 1,800 files failed, and a file whose name looks like a token was renamed before the digest. | `exec` returns output whole and unchanged up to 8 MiB (stdout and stderr together). Over that it throws an output-limit error, which the service turns into `payload-too-large` (not retryable) and records nothing. Only the check's detail is cut and redacted (`step`, `clip`). | "G4: structured git output is read whole and unchanged: a scoped tree over 64 KiB and a credential-shaped file name verify"; "G4: output over the runner's limit is an explicit payload-too-large error, never a failed check; display detail is still cut and redacted" |

Simplification, as asked:

- The runner's life cycle is in `src/sandbox.ts` (`RunnerHost`,
  `runnerProvider`, `gatewayFetch`), with no Cloudflare types.
  `RunnerBox` and `RunnerGateway` in `container.ts` only bind it to a
  Durable Object. So the tests run the real life cycle over a container
  modelled on the host (`test/fake-container.ts`: each start copies a
  pristine image into a new root; each command is its own process group;
  destroy kills every group).
- All three checkers share one ownership boundary: the job copy that
  `handle` owns, and the session and workspace found by it.
- The production entrypoints submit only to a room bound as `ROOM` (lane A);
  with none bound they refuse to run. Only the `/h/*` harness routes use the
  harness ledger. The `/h/reset` route and container pools are gone.
- Structured results and display are separate: `exec` and `git()` return
  whole output; `step()` keeps a tail and `clip()` cuts and redacts the
  detail.
- The README no longer says that separate job directories share nothing.

**Mutation checks.** Eighteen mutations, one at a time; each made at least
one test fail: close does not destroy; open adopts a leftover container; the
provider reuses one runner; a second open is not refused; close or exec
ignores the owner token; a failed open does not clean up; a shallow copy of
the job; no copy; the copy taken after the first await; `exec` redacts; `exec`
keeps a 64 KiB tail; no output limit; the limit reported as `unavailable`;
the detail not redacted; runs found by job ID; the harness ledger borrowing
issued jobs; and the harness ledger checking for a replay before an await.
The last one first survived (only a timing-dependent test caught it); a
direct test was added.

**Live run** (Worker `artroom-lg-checkers`, namespace `gitseq-spike`):
[live-2026-10-01T23-16-27-377Z.json](../packages/checkers/measure/results/live-2026-10-01T23-16-27-377Z.json).
Every check now runs in a new container, so every time below is a cold
start. A new Durable Object per job (`newUniqueId`) with its own container
works on Cloudflare Containers; containers are destroyed at the end of each
job, so none were left to stop.

| Case | Result | Check time |
|---|---|---|
| Tests on a passing commit, twice | Pass, pass | 3.3 s, 4.1 s |
| Tests on a broken function | Fail | 3.5 s |
| A changed test with unchanged source | Fail | 3.7 s |
| Types pass, types fail (installs TypeScript) | Pass, fail | 5.3 s, 4.9 s |
| Scoped tests, a test reads an excluded file | Fail: `ENOENT` | 4.4 s (+4.3 s snapshot) |
| LLM review | Advisory pass | 2.9 s |
| A job that replaces `npm` in the image (`/usr/local/lib/node_modules/npm/bin/npm-cli.js`: "replaced") and leaves a process rewriting it every second | Pass (its own test script) | 7.3 s |
| The broken function again, after that job | **Fail, with the same runner digest** | 3.9 s |
| Two tests checks of one checker at once (pass and fail) | Pass and fail, as expected | 3.7 s each |
| Scoped tests on 1,800 small files and a file named like a token (1,806 files in the snapshot; listing over 64 KiB) | Pass | 3.8 s (+1.6 s snapshot) |

The runner and scoped-data probes gave the same answers as before (push 403;
another repository 403; no internet; no token in the environment; the
excluded file is not in the tree, the object store or the snapshot
repository; one commit of history). A first run of this script was
discarded: its 1,800-file case declared `src/**`, which put
`src/secret.txt` into the same per-checker snapshot repository that the
scoped probe then fetched from. The script now declares paths that leave
that file out.

Cost: before this repair a warm check took 1.7 s and a cold one 4.5 to
5.4 s. Now every check is cold: 2.9 to 5.3 s in this run, so a check costs
about 2 s more than a warm one did. Reusing containers is not safe (G1); a
cache shared between jobs may only be part of the pinned, read-only image.

Not changed: `packages/git` (lane B's package).


## Review bdcc7cc9

Revision 3. It merges main `fb2bd41` (contract amendment 3, `docs/protocol.md`
section 29) and answers the checker's one finding on revision 2.

### The merge

The merge had no conflicts. The amendment's types made lane G's typecheck
fail, so one commit makes the edits that section 29.8 marks "(type)": lane G
item 3 (`gitAuthEnvFor` returns `GitAuthEnv`) and item 8 (test fixtures and
the harness's jobs carry `base`, `volatile`, `advisory` and `runner`). The
checkers do not act on those fields yet. Items 4 to 7 are left to the later
request.

### P2: a scoped job could read an older snapshot

**What was wrong.** Every snapshot for a checker went into one repository,
`<repo>--snap-<checker>`, and each job's token could read all of it. A job
for the current `src/add.js` snapshot could fetch an older `src/**`
snapshot's commit by its ID and read `src/secret.txt`. A parentless commit,
a fresh runner and a careful checkout did not narrow what the token could
read. The revision 2 live script avoided the case by declaring paths that
never put the excluded file into the shared repository, so it could not
support the README's general claim.

**Fix: R-CARRY-16, as ratified.** Isolation now rests on what the job's
repository holds and what its token reaches:

- **One repository per snapshot commit.** Each snapshot commit gets a new,
  empty repository, named `<prefix>--snap-<commit>`. The publisher writes
  the commit into it at `refs/artroom/snapshot` and nothing else. It
  refuses a repository that already has any ref, so a repository never gets
  a second snapshot or any later object. Pushing one commit into an empty
  repository sends exactly that commit, its trees and its blobs.
- **The fixed commit of R-CARRY-15.** `writeSnapshot` sets author and
  committer to `Artroom Snapshot <snapshot@artroom.invalid>` at time 0, with
  the Room's message (29.8 lane G item 1). `snapshotCommitId` computes the
  same ID without git; the harness uses it, as the Room would, to name the
  repository first and to check what the publisher wrote.
- **Reuse only for the same commit**, with a read token per job, for that
  repository only, expiring by the job's deadline. A token that Artifacts
  returns with a later expiry is revoked and refused.
- **Retirement** is durable. The duty to delete the repository is recorded
  in the transaction that records it, before Artifacts is asked to create
  it. It is due 24 hours after creation, moved by each job's deadline, and
  brought forward when the last job ends. Running it revokes every active
  token and deletes the repository, and only Artifacts' answer to the delete
  settles it. A job's own token is owed revocation when the job ends. Every
  duty is retried with backoff; during an outage it stays owed, and the
  repository is not used for new jobs. A preparation that was interrupted
  is deleted, never finished.
- **The harness** drops the per-checker store (29.8 lane G item 2). It
  prepares, mints and retires through `SnapshotRepos` in `HarnessLedger`,
  whose alarm runs the duties. Repositories are deleted when their job ends.

None of the excluded repairs was used: no ref is hidden, checkout is
unchanged, parentlessness is not relied on, the live run now includes the
wider snapshot, and scoped checks still run.

### The packages/git changes (lane B items 1 to 3, minimal)

Lane B's package is changed here only where this fix needs it. Nothing in
the landing engine or log publishing is touched.

| File | Change |
|---|---|
| `src/artifacts.ts` | `ArtifactsNamespace` gains `create(name, opts)` (a new, empty repository with one write token) and `delete(name)` (true if deleted, false if none). Lane B item 1 |
| `src/publisher/gitops.ts` | `writeSnapshot`: the fixed identity and time; writes only into an empty repository, at `SNAPSHOT_REF` only (`storeRef` is gone). Lane B item 3 |
| `src/publisher/container.ts` | `Publisher.writeSnapshot`: the gateway allows only the creation of `refs/artroom/snapshot` at the commit built |
| `src/snapshot/repos.ts` (new) | `SnapshotRepos`: repositories per snapshot commit, job tokens, and the delete and revoke duties. Lane B item 2 |
| `src/index.ts` | Exports for the above |
| `test/gitops.test.ts`, `test/snapshots.test.ts` (new), `test/workspaces.test.ts` | Tests; the workspace fake gains `create` and `delete` that throw |
| `README.md` | Two rows |

The binding's shapes come from the generated Workers types
(`worker-runtime.d.ts`, `interface Artifacts`): `create(name, opts)` returns
`ArtifactsCreateRepoResult` with a plaintext `token`; `delete(name)` returns a
boolean and "Delete[s] a repository and all associated tokens". A live check
showed that a new repository advertises no refs. The live run used both
through the binding.

The duties are kept in their own tables (`artroom_snap*`), apart from the
workspace duties, so that this change and lane B's other work merge without
touching `workspaces.ts`.

### Tests

`packages/checkers/test/snapshot-isolation.test.ts` turns the checker's
diagnostic into a test of the correct outcome. It uses the real
`GitOps.writeSnapshot`, `SnapshotRepos`, `RunnerHost`, provider, gateway and
checkout, over a model of Artifacts in which every repository serves any
object it holds by ID (`uploadpack.allowAnySHA1InWant`), so a fetch fails
only because the object is not there. In the model a runner's git reaches
repositories by path, not through the gateway, so which repository a runner
can reach is tested at the gateway and at Artifacts' token check.

- "older snapshot, omitted file: the current job cannot read the older
  snapshot's commit, trees or blob by known ID, nor see it advertised (P2,
  R-CARRY-16)". With a control: the older job reads all of them by ID from
  its own repository.
- "exact current commit: the job fetches its own snapshot commit by ID and
  HEAD is that commit (R-CARRY-16, R-EXEC-4)"
- "configuration change that narrows the inputs: the new snapshot gets a
  new repository, and neither job's token reads the other's (R-CARRY-16)"
- "concurrent jobs, different snapshots: each reads only its own
  repository, by ID or by ref (R-CARRY-16)"
- "retirement: when the last job ends the repository and its tokens go; an
  Artifacts outage leaves both owed and retried (R-CARRY-16)"
- "the Room's snapshot commit ID equals the commit the publisher writes, for
  awkward names and modes (R-CARRY-15)"

`packages/git/test/snapshots.test.ts` (fake namespace with outage
switches): one repository per commit with a token per job; tokens bounded
by the deadline, an overlong one revoked; retirement when the last job
ends; retirement during an outage stays owed, blocks reuse and is retried;
the duty recorded before the repository exists, an interrupted preparation
deleted, an unused repository deleted after 24 hours; a publisher that
writes another commit; every token revoked before ready; a job that never
reports its end. `packages/git/test/gitops.test.ts`: "filtered snapshot:
the fixed commit of R-CARRY-15, written into an empty repository at
refs/artroom/snapshot only (R-CARRY-16)", which checks the exact commit
bytes, the single ref, that the repository holds exactly the closure, and
that a second write, or a write into a repository with any ref, is refused
and adds nothing.

`isolation.test.ts` (G3, G4) and the support code now use a repository per
snapshot.

**Mutation checks.** Each guard was broken, one at a time, after the fix
was committed, and the git and checkers snapshot tests were run. Every
mutant made at least one test fail; the tree was clean afterwards.

| Mutant | Failing tests |
|---|---|
| Reuse one repository across different snapshots (the name ignores the commit) | 2 git, 3 checkers (older snapshot, configuration change, concurrent) |
| Write a second commit into an existing snapshot repository (no empty-store check) | the git writer test |
| The old design: a ref per snapshot in a shared store, no empty-store check | the git writer test; 3 checkers |
| Skip recording the retirement duty | 6 git, 7 checkers |
| Mint a token not bounded by the job (24 hours) | 5 git, 7 checkers (the answer check refuses it) |
| 24-hour token and no check of Artifacts' answer | 2 git (deadline-bound token; job that never reports its end) |
| No check of Artifacts' answer only | 1 git (overlong token) |
| Ready without revoking the creation token and others | 1 git |
| A job's end does not owe its token's revocation | 2 git, 1 checkers |
| Retirement settles without Artifacts confirming the delete | 1 git, 1 checkers |

### Gates

At `04b5f58c` (this note's commit changes only this file):

| Gate | Result |
|---|---|
| Root `npm run typecheck` | exit 0 |
| Root `npm test` | exit 0: checkers 31; git (Node) 127; log 100 Node and 95 workerd; policy 190 Node and 189 workerd (1 skipped); ui 88 |
| `packages/git` `npm run test:workers` | exit 0, 8 tests |
| `wrangler deploy --dry-run`, `packages/checkers` | exit 0 |
| `wrangler deploy --dry-run`, `packages/git` | exit 0 |

### Live run

Worker `artroom-lg-checkers` redeployed; namespace `gitseq-spike`:
[live-2026-10-02T01-06-30-089Z.json](../packages/checkers/measure/results/live-2026-10-02T01-06-30-089Z.json).
Every check from revision 2 gave the same result (pass, fail, changed test,
types, scoped `ENOENT`, LLM review, the poison job and the same runner digest
after it, two concurrent checks), in 2.6 to 5.9 s.

- The 1,800-file case now declares `src/**`, so its snapshot (1,808 files)
  holds `src/secret.txt`. It passed.
- **Older, wider snapshot.** The probe built a `src/**` snapshot of the
  same commit (7 files, with `src/secret.txt`) and held a job on it, so its
  repository existed while the `src/add.js` job ran. From inside that job's
  runner:

| Attempt | Outcome |
|---|---|
| Fetch the older snapshot's commit by ID, from the job's repository | Fails (`expected 'packfile'`) |
| Fetch the older snapshot's root tree by ID | Fails |
| Fetch the `src/secret.txt` blob by ID | Fails |
| `git ls-remote` of the older snapshot's repository | 403 at the gateway |
| `git ls-remote` of the job's repository | One ref: `refs/artroom/snapshot` at the job's commit |
| Fetch the job's own commit by ID | Succeeds |
| Control: fetch the job's own root tree and a blob by ID (no ref names them) | Both succeed |

  The control shows that Artifacts serves a repository's objects by ID, so
  the older snapshot's objects failed because the job's repository does not
  have them. (`git show <older>:src/secret.txt` says "path does not exist";
  git says the same in an empty repository.)
- **Retirement.** After the run the harness owed nothing: 16 duties, all
  done, and no `artroom-lg--snap-*` repository was left.
- Push, the canonical repository, the internet and the environment gave the
  same answers as before.

The first run after the deploy failed at its first, whole-tree check with an
error object that the harness printed as `[object Object]`. The harness now
prints such errors in full. The next two runs passed; the failure did not
recur and its cause is not known. That first run's repository was deleted
afterwards. All repositories the runs made were deleted, every token with
them, and the runner containers were destroyed at the end of each job.

### Not done

- The production Room (lane A) must create, name, issue and retire
  snapshot repositories this way (29.8 lane A item 4). Until it does, only
  the harness's filtered jobs have this boundary.
- Lane G items 4 to 8 of 29.8, apart from the type-forced 3 and 8.

## Review 96d1fbc9

Revision 4. The checker credited the isolation fix and found two cleanup
defects. This revision first merges main `4892e114` (jj-refuse, and lane L's
amendment-3 decoder) with no conflicts; both are kept as they are on main.

### P2: an unknown create was settled by absence and time

**What was wrong.** `prepare` sent `create` without recording the attempt.
If the answer was lost, only a timed delete duty was left, and retirement
took "not found" as final: it closed every duty and removed the row. A
create that applied later left a repository and a live write token that
nothing tracked. The checker showed this with a lost reply, more than 24
hours, a restart, and then the old create applying.

**Fix: the workspace ledger's principle.** `SnapshotRepos` now keeps the
same states as `Workspaces` (in flight, owed, done), and never uses time as
proof:

- Every create attempt is its own step, written as in flight before the
  call, with its own repository name `<prefix>--snap-<commit>-<step>`. A
  retry is a new step with a new name. So a late attempt can only create its
  own repository, and can never settle, or be confused with, a later
  attempt's.
- An in-flight create is closed only by a definite answer (success, or an
  error that says nothing changed, such as `INVALID_REPO_NAME`), or by
  seeing its repository exist, which makes its deletion owed now. "Not
  found", "in progress" and no answer keep it open. It is checked again on
  the workspace backoff (`RECHECK_MS`: after 1, 1, 2, 4 and 8 minutes, then
  every 16), for as long as it is open.
- A deletion is owed only for a repository whose creation is known. Only
  there is "not found" final.
- An unfinished or superseded preparation is not retired inline. Its
  deletion is owed now, and the new attempt goes ahead under its own name.
  Readiness is fenced by name: only the attempt's own row can become
  ready, so a stopped host's late callback cannot finish a later attempt.
- A new repository that no job uses is deleted 15 minutes after creation
  (`PREPARE_WINDOW_MS`), not 24 hours. Retirement is still immediate when
  the last job ends, and there is still one token per job.

### P2: the cleanup wake-up came after preparation's effects

**What was wrong.** `HarnessLedger` set its alarm only in `finally`, after
`prepare` and the publisher returned. A host that stopped during the create
or the write left durable debt with no alarm, and a restarted object did
not schedule it either.

**Fix.**
- `SnapshotRepos` takes a `wake` callback and calls it with `nextDue()`
  before each create, after every change that can bring a duty forward
  (a mint with a short deadline, a job's end), and after each reconcile.
  So an alarm at or before the earliest owed duty always exists. The
  wake-up set before the create also covers the write and the inventory
  that follow: it is earlier than anything they owe, and each alarm run sets
  the next. A mint adds no duty: the repository's deletion, already owed
  and scheduled, removes a token whose answer is lost, and that token
  expires by the job's deadline anyway.
- `HarnessLedger` passes its alarm as the wake-up, and arms the persisted
  debt in its constructor (`blockConcurrencyWhile`). The `finally` arming is
  gone.
- `SnapshotRepos` reads the clock at call time.

### Tests

The checker's diagnostics are now tests of the right outcome:
- `laneG-checker-G3-retirement.test.ts` became, in
  `packages/git/test/snapshots.test.ts`: "a create whose answer is lost and
  which applies after 24 hours and a restart is still found and deleted (P2:
  the checker's diagnostic)".
- `laneG-checker-G3-alarm.mjs` became `packages/checkers/test/harness-alarm.test.ts`.
  It loads the real `HarnessLedger` (vitest maps `cloudflare:workers` to
  `test/cloudflare-workers-stub.ts`): "a host stopped during the
  repository's creation …" and "a host stopped during the publisher's write
  has persisted its wake-up, and a restarted object arms and cleans up
  (P2)".

Also new in `packages/git/test/snapshots.test.ts`:
- "every create attempt is its own step and name: a retry succeeds, and the
  lost first attempt applying later never touches it"
- "an unresolved create stays open while absent or in progress, on a capped
  backoff; only a definite refusal settles it without a repository"
- "a wake-up is persisted before every remote effect, and a host stopped at
  any await leaves its debt to be cleaned after a restart". It stops the
  host at the create, the write, the token inventory and the mint. Each
  call applies but never answers, and a new host then drains the alarms.
- "a late callback from a stopped host cannot finish or settle a later
  attempt (fenced by name)". The new attempt is still creating when the old
  host's preparation returns.
- "a job with a short deadline brings the wake-up forward to that deadline"
- "a duty table from revision 3 (no snapshot column) is migrated, and its
  owed deletion still runs"

Earlier tests now expect per-attempt names and the 15-minute window.

**Mutation checks** (each after committing; tree clean afterwards):

| Mutant | Failing tests |
|---|---|
| Absence settles an unresolved create | 2 git (the diagnostic; the backoff test) |
| Elapsed time settles it (after five checks) | 1 git (backoff) |
| Every attempt reuses one name per commit | 6 git (including "every create attempt is its own step" and the fence) |
| No wake-up before the create | 1 git (termination); both harness tests |
| The create step not recorded before the call | 3 git; 1 harness |
| Readiness not fenced by name | 1 git (late callback) |
| A superseded known attempt not owed deletion now | 1 git |
| A definite refusal left in flight | 1 git |
| The restarted Durable Object does not arm its debt | both harness tests |
| The harness passes no wake-up | both harness tests |
| No wake-up after a mint | 1 git (short deadline), after that test was added; it first survived |
| No wake-up after a reconcile | 1 git (short deadline) |
| No migration of the revision 3 table | 1 git |

One mutant was equivalent: removing a second wake-up before the write
changed nothing, because the wake-up before the create is earlier and each
alarm sets the next. That call was removed instead.

### Gates

At `b800dc72` (this note's commit changes only this file):

| Gate | Result |
|---|---|
| Root `npm run typecheck` | exit 0 |
| Root `npm test` | exit 0: checkers 33; git (Node) 134; log 116 Node and 111 workerd; policy 199 Node and 198 workerd (1 skipped); ui 88 |
| `packages/git` `npm run test:workers` | exit 0, 8 tests |
| `wrangler deploy --dry-run`, `packages/checkers` and `packages/git` | exit 0 each |

### Live run

[live-2026-10-02T01-47-35-267Z.json](../packages/checkers/measure/results/live-2026-10-02T01-47-35-267Z.json),
Worker `artroom-lg-checkers`, namespace `gitseq-spike`. Every check gave
the same result as in revision 3, in 2.7 to 5.3 s. The scoped probe again
could not fetch the older, wider snapshot's commit, tree or excluded blob
by ID, while the control fetched the job's own tree and blob by ID. The
names now carry the attempt (for example `…-25`). Afterwards the harness
owed nothing (28 duties, all done) and no snapshot repository was left.

The first run of this revision failed at its first scoped check:
`table artroom_snap_duty has no column named snapshot`. The Durable Object
still had revision 3's table. `SnapshotRepos` now adds the column when it is
missing, with a test, and the next run passed using the migrated table. The
failed run's repository was deleted. No `artroom-lg` repository is left in
the namespace.
