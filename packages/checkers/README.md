# @generalbusiness/artroom-checkers

Artroom's checkers. A checker is a service that meets a `require` check
obligation with a signed `check` act (plan sections 5, 7 and 9; protocol
rules R-OBL-3, R-CARRY-6 to R-CARRY-10 and R-EXEC).

This package implements the contract's `Checker` base class and runner
wrapper, a runner sandbox, and three checkers:

| Checker | What it runs | Result |
|---|---|---|
| `tests` | `npm ci`, then `npm test` | Passes only if both exit 0 |
| `types` | `npm ci`, then `npx --no-install tsc --noEmit` | Passes only if both exit 0 |
| `llm-review` | Reads the change and asks a model (Workers AI) for findings | Advisory: always passes, posts a note, never blocks landing |

Every check's detail starts with `Machine-run check "<name>"` and says what
ran. The LLM reviewer's note starts with "Machine-generated, advisory
review".

## How a check runs

1. **The room sends a job** (`CheckJob`) over a service binding to the
   checker's entrypoint: `TestsCheckerService`, `TypesCheckerService` or
   `LlmReviewService`, each with `handle(job)`.
2. **The service takes its own copy of the job, then checks its binding**
   (`ownJob`, `checkJob`). The copy is deep and frozen, taken before
   anything else happens; checkout, the run, signing and the after-hook read
   only it, so a caller that changes its job object later changes nothing. The job must be for this
   room and this checker, name a real check obligation, carry well-formed
   commits and digests, and point at a repository on the room's own
   Artifacts host. Its `gitAuthEnv` must be exactly one read-only bearer
   header for git. Anything else is refused `check-binding` before a sandbox
   starts.
3. **A new runner sandbox opens, for this job alone.** It is a container
   with Node.js and git, a different class and image from the publisher.
   Every job gets a new one, started from the pinned image, and it is
   destroyed when the job ends: no container runs two jobs, so nothing one
   job's code does (files written anywhere, tools replaced, processes left
   running) can reach another job. The runner has one owner: the job that
   opened it holds a token that every command and the close need. It starts
   with no internet access. A gateway in the Worker, made for this job's
   grant, is its only way out:
   - the job's one repository, read only: the gateway adds the read token
     and refuses every push;
   - the npm registry, GET and HEAD only, for `npm ci`.

   The token never enters the container, and nothing in the container holds
   a write token or a signing key. The runner digest is measured in the new
   container before any of the job's code runs.
4. **The exact commit is checked out and confirmed** (R-EXEC-4). The runner
   fetches the integration commit (depth 1, so no history) into a new, empty
   repository, checks out what the remote sent, and confirms that `HEAD` is
   the integration and the tree is the job's tree. Nothing runs otherwise.
5. **The checker runs**, inside the sandbox. Commands are argument arrays;
   every exit code is checked. A command's output comes back whole and
   unchanged, up to 8 MiB; over that the service throws `payload-too-large`
   and records nothing (it never truncates output it verifies, such as the
   snapshot listing). Only the check's detail is cut and redacted.
6. **The service signs the check**, outside the sandbox, with its
   delegation key (an Ed25519 key in the secret `CHECKER_KEY`). The check
   binds the lane, generation, obligation, integration, input, checker
   configuration digest and runner digest. Detail is cut to 16 KiB and
   tokens are redacted. The signed envelope goes to the room.

## Scoped inputs

A checker whose configuration declares `inputs` sees only those paths plus
the platform's global inputs (R-CARRY-8):

- The publisher builds a **filtered snapshot**: a commit with no parents
  whose tree holds exactly those files, in a repository that holds only that
  checker's snapshots. `Publisher.listTree` and `Publisher.writeSnapshot` in
  the git package do this.
- The job's `readUrl` is that snapshot repository, and its read token is for
  that repository only. The runner never learns the canonical repository's
  token.
- The runner recomputes the snapshot digest from the files it received and
  refuses a file outside the declared paths.
- Like every job, a scoped job runs in its own new container, destroyed
  afterwards.

So a test that reads an undeclared file fails: the file is not in the
working tree, the object store, any history, or any repository the runner
can reach.

## The LLM reviewer

- It reads the change inside the runner (`git diff` of the integration
  against its first parent) and sends it to the model from the checker
  service. The model is set by the variable `LLM_MODEL` (default
  `@cf/meta/llama-3.3-70b-instruct-fp8-fast`). Workers AI needs no external
  key.
- The diff and the model's answer are data. The answer is parsed only as a
  JSON list of at most 20 findings.
- It records a check that always passes, marked `volatile` (a model is not a
  pinned tool, so its check never carries), and a note anchored to that
  check.
- It never signs a `review`, so it can never meet a review obligation.

## Using it from the room

```ts
// wrangler.jsonc of the room's Worker:
// "services": [{ "binding": "TESTS", "service": "artroom-lg-checkers", "entrypoint": "TestsCheckerService" }]
const result = await env.TESTS.handle(job);   // Result<Check>
```

The entrypoints submit only to the room bound to this Worker as `ROOM` (lane
A's `RoomWire`). Until one is bound they refuse to run. The harness ledger is
used only by the `/h/*` routes.

## Cost of a new container per job

A new container per job means every check starts cold: the live runs before
this design measured 4.5 to 5.4 seconds for a cold check and 1.7 seconds for
a warm one, with the image already on the host. With a new container per
job, checks took 2.9 to 5.3 seconds in the live run of 2026-10-01 (see the
lane note). Reusing a container across jobs is not safe: a job's code
can change the container's files and leave processes running, and the next
job would trust them. A cache shared between jobs may only be part of the
pinned image, which is read only.

To write another checker, extend `Checker` and implement `run(job)`; use
`this.workspace(job)` to run commands in the verified checkout. See
`src/checkers.ts`.

## Tests

From the repository root, after `npm install`:

```sh
cd packages/checkers
npm run typecheck
npm test            # vitest, in Node: real git, real npm, a local runner
```

The tests cover job binding, signing, checkout and its confirmations, the
filtered snapshot and attempts to read excluded data, the tests checker
(pass, fail, a changed test with unchanged source), the room stand-in's
refusals, and the LLM reviewer with a fake model.

`test/isolation.test.ts` runs the real runner life cycle (`RunnerHost`,
`runnerProvider`) over a container modelled on the host
(`test/fake-container.ts`): a job that replaces a trusted tool and leaves a
process running cannot change the next job's result; one owner per runner;
concurrent and repeated jobs each get their own runner and grant; a caller
changing its job mid-run changes nothing signed; large and
credential-shaped snapshot listings verify; and output over the limit is an
explicit error.

## Live runs

```sh
cd packages/checkers
env -u CLOUDFLARE_API_TOKEN npx wrangler whoami
CRANE=/path/to/crane ./container/image.sh   # once: copies node:22-bookworm into the registry
# secrets: LG_KEY (harness key) and CHECKER_KEY (Ed25519 private JWK), in a JSON secrets file
env -u CLOUDFLARE_API_TOKEN npx wrangler deploy --secrets-file <file>
node measure/live.mjs
```

The script makes its own repos in the `gitseq-spike` namespace, deletes
them afterwards, and saves redacted results in `measure/results/`. The
`/h/*` routes it uses play the room: they build jobs, mint read tokens,
build snapshots and record checks in `HarnessLedger`. They need the
`x-lg-key` header.

To remove the Worker: `env -u CLOUDFLARE_API_TOKEN npx wrangler delete artroom-lg-checkers`.
