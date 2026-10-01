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

