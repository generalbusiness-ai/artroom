# I3: the review of the earlier checker service, runner and signer

Written 2026-10-05, with step 25 of the I3 plan
(`notes/2026-10-05-i3-implementation-plan.md`, sections 6.3 and 8.4). A
parked file moves only after a written review of it. This note is that
review for the earlier checkers package, the earlier Room's jobs module and
the earlier contract's checker types, in the pattern of
`notes/2026-10-05-i3-git-review.md`.

"The authority note" is revision 24 at `d5616522b`, adopted. "The deltas" is
`notes/2026-10-05-i3-contract-deltas.md`. Parked paths are under `parked/`,
as they were at `e87645962`. Line numbers are each file's own.

No file moved as it was. The successor is the package
`packages/checkers`, which uses the reader, the program runner and the
gateway of `packages/git`. Section 7 says what is built and what is not.

## 1. What was read

| Parked file | Lines | Read |
|---|---|---|
| `checkers/src/runner.ts` | 114 | In full, at the lines. Removed. |
| `checkers/src/sandbox.ts` | 232 | In full, at the lines. Removed. |
| `checkers/src/signing.ts` | 75 | In full, at the lines. Removed. |
| `checkers/src/checker.ts` | 262 | In full, at the lines. Removed. |
| `checkers/src/job.ts` | 178 | In full, at the lines. Removed. |
| `checkers/src/worker.ts` | 152 | In full. Removed. |
| `checkers/src/container.ts` | 61 | In full. Removed. |
| `checkers/src/checkers.ts`, `index.ts` | 53, 21 | In full. Removed. |
| `checkers/src/llm.ts` | 131 | In full. Removed. |
| `checkers/src/snapshot-commit.ts` | 70 | Reviewed and removed at step 24 (`notes/2026-10-05-i3-snapshot-review.md`). |
| `room/src/jobs.ts` | 517 | In full, at the lines. Removed. |
| `contract/src/checker.ts` | 128 | In full. Removed. |
| `checkers/wrangler.jsonc`, `container/Dockerfile`, `container/image.sh`, `config/*.json`, `package.json` | 49, 4, 22, 16, 27 | In full. Removed. |
| `checkers/test/*.test.ts`, five files | 1,015 | The 36 test names only, not the bodies. Section 6 maps the cases that the new model keeps. Removed with the package. |
| `checkers/test/containers.ts`, `fixture.ts`, `ledger.ts`, `support.ts`, the stub and the configuration | 699 | Not read. They are fakes of the earlier host and the earlier Room for the tests above. Removed with the package. |
| `checkers/README.md` | 274 | Not read. Removed with the package. |
| `checkers/measure/`, `checkers/wrangler.spike.jsonc` | | **Not read, not moved, not removed.** They are retained paths (the plan's section 6.2). |

## 2. The runner: `checkers/src/runner.ts`

| # | Fault in the parked code | Lines | Fixed by |
|---|---|---|---|
| N1 | **A commit's parents were never read.** The fetch had depth 1, so no parent was in the repository, and nothing compared a parent with the job. The job carried a `base`, and the checkout did not use it. A commit with the right tree and another history passed. This is the bold row of the plan's section 6.3, and part 2 of review row L13. | 80, 86-91 | `checkout` fetches the commit with its parents, reads it with `Reader.linked`, which reads each parent as a commit, and holds its first parent to the job's base: `parent-mismatch`. The base is the manifest's, which is the integration commit's first parent (sections 6.5 and 12.2). |
| N2 | **Nothing was validated inside the checkout.** `job.id` became a path that was given to `rm -rf`. `opts.remote` and `job.integration` were arguments of `git fetch` with no end-of-options mark. The checks were in another module, `job.ts`, and `checkout` was exported and callable without them. | 58, 73, 80 | Every value is checked inside `checkout`, before it is an argument: `remoteUrl`, `objectId`, and a directory that is absolute with no `.` or `..`. An end-of-options mark stands before every remote and revision. With a value that is not in form, no command runs. |
| N3 | **The commit was confirmed by its name only.** The runner checked out `FETCH_HEAD`, which is what the remote chose to send, and compared the text of `rev-parse HEAD` with the job. No object's type or hash was checked by the service, and the fetch did not check objects either. | 49, 83-88 | The commit is fetched by its ID, with `transfer.fsckObjects`, and no ref and no `FETCH_HEAD` is written. Then the reviewed reader reads it: exact type `commit`, so a tag does not pass; its bytes hash to its ID; its tree is a tree. Its closure is checked object by object, down to its parents. |
| N4 | **Two exit codes were not read.** `rev-parse HEAD` and `rev-parse HEAD^{tree}`: only their output was used. A command that failed with a line on its output would have been read as an answer. | 86, 88 | After the checkout, `rev-parse` and `write-tree` are run, and both exit codes are read before either output is. |
| N5 | A failure carried 600 characters of the program's error output into the check's detail, which was signed, recorded and shown. That text can repeat a URL or a header. | 72 | A refusal is a fixed word. `GitFailure` of `packages/git` holds a step's name and an exit code, and never output. |
| N6 | **A checkout that could not be confirmed was recorded as a failed check.** `ok: false`, with the words "nothing ran". The authority note's table says it is an error of the run, and not a failed check. | `checker.ts` 197-198 | `judge`: `check-error`, `checkout-unconfirmed`. |
| N7 | The hardening was five settings. It left system and global configuration, attributes, replace objects and the transfer check as they were. | 49 | `GitProgram` of `packages/git`, with its whole environment and settings. |
| N8 | **The runner was started with variables that no configuration listed**: a home, three `npm_config_` settings, `CI` and Git's own, set by the service. The authority note says the runner is started with exactly the variables of the configuration, and that the digest of them is signed. | 60-70 | `runSteps` gives each step the configuration's variables and no other. `judge` signs no `check` when the variables that the runner was started with are not the configuration's list: `environment-mismatch`. |
| N9 | **A step was judged by its exit code alone, and its output was shown.** `step` returned `ok` for exit 0 and the last 6,000 characters of output, which went into the detail. A judging step that crashed with exit 1 was a failed check. | 110-114; `checkers.ts` 19-39 | A judgment needs the status and the last line that the configuration states, for "passed" or for "failed". Any other end is `judgment-unreadable`. A step before the judging step that does not end with 0 is `step-failed`. No output is in an outcome or in the details. |
| N10 | The filtered snapshot was checked by parsing `ls-tree` and by the earlier policy package's globs. | 93-106 | No successor: a filtered check has no adopted form (deltas, entry EW3). |

What was right and is kept: every command is an argument array; the
commit is confirmed before anything of the tree runs; each job has its own
directory.

## 3. The sandbox: `checkers/src/sandbox.ts`, `container.ts`

| # | Fault in the parked code | Lines | Fixed by |
|---|---|---|---|
| G1 | **The gateway matched a prefix.** A request passed when its path began with the repository's path and a slash. Every other endpoint that the host serves under that path passed with the token. The authority note says: "A prefix match is not enough." | `sandbox.ts` 66 | The runner's gateway is the gateway of `packages/git`, with a grant that only reads. It forwards two requests and no other: `GET <repository>/info/refs?service=git-upload-pack` and `POST <repository>/git-upload-pack`. The path after the repository is compared whole. `sandbox.ts` of the new package has the table. |
| G2 | A push was refused by its path's ending and by one query parameter. Any other request that writes passed, as `POST` under the prefix. | 67-70 | The same: what is not one of the two read requests is refused. `reads-only` for a push, `not-git` for anything else. |
| G3 | **The runner's own headers were forwarded.** The headers of the request were copied, and only `Authorization` was replaced. A cookie or another header that the tree's code set went to the host beside the token. | 71-73 | The gateway drops the request's own credential headers and sets its one header. The test sends a runner's own `Authorization` and `Cookie`, and neither reaches the host. |
| G4 | **A redirect was followed, with the credential.** The request was passed to `fetch` with its default, which follows a redirect. A host's redirect to another path, or to another host when the credential's header is not one that `fetch` strips, carried the token out of the grant. | 73, 80 | `packages/git/src/gateway.ts` now builds the forwarded request with `redirect: "manual"`. The fault was also in that gateway, for every grant. The test reads the mode of each request that reached the host. |
| G5 | The runner could read a package registry, by `GET`, through the same gateway. The authority note gives a runner one repository and no other network. | 45-46, 75-82 | Not carried. A runner reaches its repository and nothing else. A check that installs packages needs an image that holds them (deltas, entry EW16). |
| G6 | **"What ran" was measured by the runner itself.** The runner digest was a hash of the configured image reference and of what `git --version`, `node --version` and `npm --version` printed inside the container. A changed image prints what it likes, and the reference is what was asked for, and not what started. | 173-180 | `RunReport.image` is the content digest of the image that the runner started from, as the container platform reported it for that start. It is never a value that the runner's processes computed. With none: `image-unresolved`. With another: `image-mismatch`. |
| G7 | **The read token travelled in the job.** The Room put the plaintext into `gitAuthEnv` of the job that it sent over the service binding (`room/src/jobs.ts` 467), and the service took it out (`job.ts` 75-81). So the token was in a message, and in the service's memory with the job. | `job.ts` 8-10, 168 | No job, notice or run input holds a token. The plaintext goes from the mint's answer to the gateway's side, after the sealed outcome entry made the token `live` (`packages/git/src/host.ts`). `RunAsk` has three members, and the test reads them. |
| G8 | A command's whole output came back to the service as text, up to 8 MiB, and over that the call threw. | 19-22, 183-200 | The configuration states the output that one run may use. A run that passes it ends `limits-passed`. Only a step's status and its last line come back. |
| G9 | The time limit was a wall-clock timer in the service. | 184-199 | `runSteps` counts the seconds that each step reports against the configuration's limit. Nothing here reads a clock. A real runner's own timer is the deployment's. |

What was right and is kept, as the stated boundary of `sandbox.ts`: one
job, one container, started from the image and destroyed after the job; no
container runs a second job; no internet; the signing key never enters the
runner. The binding of that to a container platform (`container.ts`,
`RunnerHost`) is not carried: a real runner needs a deployment (plan
question Q8).

## 4. The signer: `checkers/src/signing.ts`

| # | Fault in the parked code | Lines | Fixed by |
|---|---|---|---|
| K1 | The byte domain was the earlier envelope's, `artroom-envelope-v1`. | 6, 41-43, 66 | `artroom-intent-1`, the contract's one domain for a signed intent, by `domainBytes` of the bytes package. |
| K2 | Two verifiers. `verifyEnvelope` used the runtime's own Ed25519, and the scopes use one synchronous implementation with strict decoding. Two could disagree on one signature. | 70-75 | No verifier here. The lane judges a signature, with the bytes package's `verify`. |
| K3 | **The signer signed whatever outcome a checker's code returned.** `ok` came from a subclass's `run`, and the base class signed it. Nothing held a pass to a configuration's judging rule, an image or an environment. | 64-67; `checker.ts` 211-239 | `signResult` takes an `Outcome`, which only `judge` and the service's own two error paths make. The service signs `check` only for the image and the variables that the configuration names. |
| K4 | `generateKey` exported a private key, for setup. | 46-51 | Not carried. The key is made and set by the operator (section 5.5). |
| K5 | The idempotency key was `chk-` and the job's ID, so a second attempt of one job had another key, and one job could get two recorded checks. | `checker.ts` 236 | A result names its job's item. The exact signed bytes are sent first on a later submit, so a lane that admitted them answers with their receipt. |

The key's custody is unchanged in kind: one key pair for one member, in the
deployment's secret store, used in the service's process and never given to
a runner. The module takes it as a `ResultSigner`, which gives out the key's
ID and signatures and never the private key. The earlier secret's name,
`CHECKER_KEY`, and the parsing of a JWK are not carried: how a deployment
binds the key is the installation design's.

## 5. The service and the job: `checker.ts`, `job.ts`, `worker.ts`, `checkers.ts`, `llm.ts`, `room/src/jobs.ts`, `contract/src/checker.ts`

| # | Fault in the parked code | Where | Fixed by |
|---|---|---|---|
| J1 | **A job was trusted as it arrived.** `checkJob` checked the job's form and its URL. Nothing read the Room. The origin was that the job came over a service binding. | `job.ts` 116-174 | The origin read (`job.ts` of the new package): the service reads the job's entry from the lane itself, and checks the entry's hash, its kind, the lane's definition against the rules scope, the tree and the name. A notice is bookkeeping, and nothing that it carries is used. |
| J2 | **The configuration's digest said nothing about what ran.** The job carried a digest and three flags copied from the configuration. What ran was the service's own code: `npm ci`, then `npm test`. The bytes were never fetched. | `checker.ts` 211-224; `checkers.ts` | The bytes are fetched from the rules scope by the job's digest, and read only when they hash to it. The steps, the image, the variables and the judging rule are theirs. |
| J3 | **Two deliveries of one job each ran.** The earlier test `G2` asserted it: "two overlapping deliveries of one job each get their own runner". | `checker.ts` 163-180 | At most one run: one write creates the job's record only if it is absent, and a delivery that does not create it starts no runner (`store.ts`). |
| J4 | **An outcome was not kept.** A check that the Room refused was returned to the caller and forgotten. The Room then issued the job again, as a new attempt, and the work ran again. | `checker.ts` 239-240; `jobs.ts` 385-510 | The outcome is kept durably before it is signed, and submitted again until the lane admits it or the job is superseded. The computation is not run again. |
| J5 | A runner that failed was thrown to the caller as "unavailable", and nothing was recorded. A required check then waited with no state. | `checker.ts` 203-207 | Every end of a run has an answer: `check-error`, with its reason. A run whose end cannot be found is `run-lost`. |
| J6 | The detail was the run's output, cut to 16 KiB, with one pattern replaced as a token. A pattern does not know every credential. | `checker.ts` 82-90, 222 | No output is in what is signed, kept or submitted. The details are the record of what ran. |
| J7 | The reviewer by a model always passed, and posted a note. The model's answer was parsed as data, which was right. | `llm.ts` | No successor. A check is a configuration of the rules, and whether it is required is the rules' member. A check that always passes is not a judged pass. |
| J8 | The Room kept its own table of jobs and attempts, and its own table of job tokens, which it settled by the token's end time on its own clock and then deleted. | `jobs.ts` 60-110, 211-330 | The job is an item of the change lane, and its read token a record of `git-read@1`, with operations of the lane's one ledger (step 24). Nothing is settled by time. |
| J9 | The Room re-issued an attempt when one passed its deadline. Each attempt was a new run of the same obligation. | `jobs.ts` 167-200, 385-400 | A retry is a new job, by a member's `request-check`. The service never retries a run. |
| J10 | The deadline and the token's lifetime were computed from `Date` and a margin in the Room. | `jobs.ts` 46-52, 390-392 | The deadline is the job's value, set by the lane's row. The token must end before it, and the mint's outcome rule holds it to that (deltas, entry EW6). |

The earlier contract's `checker.ts` held the types of all of the above: the
job with its URL and its credential, the outcome with its `ok` and its
detail, the runner with its digest, and the abstract `Checker`. None has a
successor in the contract package. The job is the lane's data, and the
types of a run are the checkers package's own.

## 6. The earlier tests, and where each kept case stands now

| Earlier group | Tests | Now |
|---|---|---|
| A job's form and its binding (`job.test.ts`) | 4 | The origin read: `checkers/test/service.test.ts`, the first test. The earlier URL and namespace checks have no successor: a job names no URL. |
| The signed envelope, and what a check binds (`job.test.ts`, `handle.test.ts`) | 3 | `service.test.ts`, the third test: both signed intents verify, and the fields are the lane's. `lanes/test/checks.scope.test.ts`: a real change lane admits them. |
| The checkout confirms `HEAD` and the tree (`git.test.ts`) | 1 | T36, `checkers/test/runner.test.ts`, with the parents. |
| A scoped job reads only its snapshot (`git.test.ts`, `handle.test.ts`) | 4 | No successor (deltas, entry EW3). |
| The token never enters the sandbox (`handle.test.ts`) | 1 | `service.test.ts`, the third test, and `runner.test.ts`, the gateway test. |
| A checkout that cannot be confirmed (`handle.test.ts`) | 1 | `service.test.ts`, the fourth test: an error, and not a failed check. |
| The steps pass only if each exits 0 (`handle.test.ts`, `git.test.ts`) | 2 | `service.test.ts`, the fourth test, and `runner.test.ts`, the third: a judgment needs the judging step's status and last line, and a step that fails before it is an error. No real `npm` is run. |
| No container runs two jobs; one owner of a runner (`sandbox.test.ts`, `handle.test.ts`) | 5 | Stated in `sandbox.ts`. Not tested: no container is run here. |
| Two overlapping deliveries (`handle.test.ts`) | 1 | `service.test.ts`, the second test, with the opposite result: one run. |
| A runner that fails; output over the limit (`handle.test.ts`) | 2 | `service.test.ts`, the second and fourth tests. |
| The Room's refusal is the answer (`handle.test.ts`) | 1 | `service.test.ts`, the last test: the outcome is kept and submitted again. |
| The service signs its own copy of the job (`handle.test.ts`) | 1 | The job is read from the lane, and a notice is not used. `service.test.ts`, the first test. |
| Volatile checkers, a pinned runner digest, many rooms, the reviewer by a model, the production Worker (`handle.test.ts`, `git.test.ts`, `job.test.ts`, `worker.test.ts`) | 10 | No successor: none of those forms is in the adopted model. |

## 7. What is built, and what is not

Built, in `packages/checkers`:

- `job.ts`: the origin read, as a pure function of what the service read.
- `configuration.ts`: a configuration, read from the rules scope's bytes.
- `outcome.ts`: what the checker signs, by what happened, as one pure
  function, and the record of what ran.
- `store.ts`: the record of at most one run for a job, and the kept
  outcome, over a storage port with two conditional writes.
- `signing.ts`: the signer.
- `service.ts`: one delivery of one notice, over three ports.
- `runner.ts`: the checkout, on the `git` program, and the order of the
  steps.
- `sandbox.ts`: the runner's boundary, stated, and the read grant of a
  run's gateway.

**Not built**, each for a stated reason:

- **No runner.** No container is started, and no adapter of `Runner`
  exists. A job on a real runner needs a deployment and its own
  authorization (plan question Q8). `ScriptedRunner` of test support is a
  stand-in that returns a stated end.
- **No storage adapter.** `Durable` has no implementation outside test
  support.
- **No adapter of `Scopes`, and no Worker.** Nothing reads a real lane or a
  real rules scope for the service, and no entry point takes a notice. The
  origin read and the signer are shown against a real change lane's own
  entries in `lanes/test/checks.scope.test.ts`, which calls them as
  functions.
- **Nothing routes a job's read token to a run's gateway.** The driver
  hands a `live` token to `Custody`, and `readGrant` makes the grant. The
  wiring between them is the deployment's.
- **No filtered check** (deltas, entry EW3).
- **No image.** The earlier `Dockerfile` and its copy script are removed.
  An image is named by a configuration, by its content digest.

## 8. Witnesses and controls

| Witness | File | Command |
|---|---|---|
| T34 | `packages/lanes/test/checks.scope.test.ts` | `npx vitest run --project scope checks` |
| T35 | `packages/checkers/test/service.test.ts` | `npx vitest run --project checkers service` |
| T36 | `packages/checkers/test/runner.test.ts` | `npx vitest run --project checkers runner` |

T34 is in the lanes package, and not in `platform/test` as the plan's row
has it: the `change` lane is the lanes package's, and no platform package
may name that package (deltas, entry EW11). It runs on a real change lane,
with a scripted rules peer and the scripted test capability. T35 runs on
stand-ins for the lane, the rules scope, the storage and the runner. T36
runs on a real local repository, which is not a host.

Failure controls, each run once with `scripts/control.mjs`. Each
"distinguishes", by an assertion.

| Guard | Change | The test that failed |
|---|---|---|
| The entry's hash is the fact's | `originOf` does not compare the served hash with the fact. | T35, the first test |
| The definition is active | `originOf` does not read the state of the rules scope's item. | The same |
| The entry is a `request-check` | `originOf` does not read the intent's kind. | The same |
| A delivery waits for the one at work | The service does not read its mark of a run in flight. | T35, "at most one run" |
| A run that is going on is not concluded | The service does not read `running` from the runner's record. | The same |
| No pass for another image | `judge` does not compare the image. | T35, "another image or another environment" |
| No pass for another environment | `judge` does not compare the variables. | The same |
| The bytes hash to the job's digest | `readConfiguration` does not compare the digest. | T35, "the configuration is the rules scope's bytes" |
| The same bytes first | The service signs anew at every submit. | T35, "an outcome is kept until the lane admits it" |
| The first parent is the base (N1) | `checkout` does not compare the first parent. | T36 |
| The tree is the job's | `checkout` does not compare the tree. | T36 |
| A redirect is not followed (G4) | The gateway builds its request with the default mode. | `runner.test.ts`, the gateway test |
