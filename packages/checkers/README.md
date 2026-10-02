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
the platform's global inputs (R-CARRY-8). What a scoped runner can read is
set by what its job's repository holds and what its token reaches
(R-CARRY-16), not by what it checks out:

- **The snapshot commit is fixed** (R-CARRY-15): no parent, a tree with
  exactly those files, author and committer `Artroom Snapshot
  <snapshot@artroom.invalid>` at time 0, and the message `Artroom filtered
  snapshot for <checker>` with its digest. Its ID depends only on the
  files, the checker and the digest (`snapshotCommitId` computes it without
  git).
- **One repository per snapshot commit.** Each snapshot commit gets a new,
  empty Artifacts repository, named by the commit and the creation
  attempt (`<prefix>--snap-<commit>-<attempt>`). The publisher
  (`Publisher.writeSnapshot` in the git package) writes that commit into it
  at `refs/artroom/snapshot` and refuses a repository that already has any
  ref. So the repository holds exactly the commit, its trees and its
  blobs, and nothing is added to it later. Jobs for the same snapshot
  commit share its repository. Any other snapshot, including the same
  checker's after its inputs or the integration changed, gets its own.
- **One token per job.** A filtered job's read token is for its
  snapshot's repository only and expires by the job's deadline. The runner
  never learns the canonical repository's token or another snapshot's.
- **Retirement.** When a job ends, its token is revoked. When the last job
  ends, or its deadline passes, the repository is deleted with every token;
  a repository that no job uses is deleted 15 minutes after it was made.
  Both are durable duties, retried until Artifacts confirms; during an
  outage they stay owed, and the repository is not used again.
- **Unknown creates.** A create whose answer is lost is recorded before it
  is sent and stays open until Artifacts answers it definitely or its
  repository is seen, and then deleted. A repository that is merely absent
  does not close it; it is checked again on a backoff for as long as it is
  open. A retry is a new attempt with a new name.
- **Wake-ups.** The cleanup alarm is set before each repository is
  created, and a restarted object sets it from the debt it finds, so a
  host that stops at any point leaves its cleanup scheduled.
- The runner recomputes the snapshot digest from the files it received and
  refuses a file outside the declared paths.
- Like every job, a scoped job runs in its own new container, destroyed
  afterwards.

So a test that reads an undeclared file fails. The file is not in the
working tree, the object store, any history, or the job's repository, and
the job's token and gateway reach no other repository. That holds whatever
the runner asks for, including the known ID of an older snapshot's commit,
tree or blob: the job's repository does not have them. In the live run of
2026-10-02, Artifacts served the job's own unreferenced tree and blob by
ID, and could not serve the older snapshot's objects.

The git package's `SnapshotRepos` does the room's part: it creates and
names the repositories, mints the job tokens, and keeps the duties. In
this package only the harness uses it. A production room (lane A) must do
the same before it issues filtered jobs (section 29.8, lane A item 4).

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

`test/snapshot-isolation.test.ts` runs the publisher's real
`writeSnapshot`, the git package's `SnapshotRepos` and the real runner over
a model of Artifacts in which every repository serves any object it holds by
ID. It covers the acceptance cases of R-CARRY-16: an older, wider snapshot's
commit, trees and excluded blob cannot be read by known ID or seen
advertised; the exact current commit fetches; a configuration that narrows
the inputs gets a new repository; concurrent jobs on different snapshots
reach only their own; and retirement, including an Artifacts outage.

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
prepare snapshot repositories (`artroom-lg--snap-<commit>-<attempt>`, deleted when
their jobs end) and record checks in `HarnessLedger`. They need the
`x-lg-key` header.

To remove the Worker: `env -u CLOUDFLARE_API_TOKEN npx wrangler delete artroom-lg-checkers`.
