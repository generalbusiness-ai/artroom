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

`cd packages/checkers && npm test`: 13 tests, all passing. Mutation checks:
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
