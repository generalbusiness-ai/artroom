> **Inactive.** This package is parked source of the earlier model: it is not built, tested, exported, released or deployed. See [`parked/README.md`](../README.md) for what replaces it and when it is removed.

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
   `LlmReviewService`, each with `handle(job)`. That is the only way in
   (R-EXEC-8): the production Worker (`src/worker.ts`, `wrangler.jsonc`) has
   no HTTPS route that accepts or builds a job.
2. **The service takes its own copy of the job, then checks its binding**
   (`ownJob`, `checkJob`). The copy is deep and frozen, taken before
   anything else happens; checkout, the run, signing and the after-hook read
   only it, so a caller that changes its job object later changes nothing.
   The job must name a room by its ID and this checker, name a real check
   obligation, carry well-formed commits (`base` included) and digests, the
   configuration's `volatile` and `advisory`, and point at a repository on
   the Artifacts host, in one of the namespaces the deployment accepts
   (`ARTIFACTS_NAMESPACES`, comma-separated: the Room's own, and its import
   namespace if any). An entrypoint will not start if that list is missing,
   empty or malformed. Its `gitAuthEnv` must be exactly one read-only bearer
   header for git. A volatile checker refuses a job that says
   `volatile: false` (R-EXEC-10). Anything else is refused `check-binding`
   before a sandbox starts.
   - **The room is the job's own.** No room is configured: the service
     resolves `job.room` through its `ROOM` binding (the Room Worker's
     `ArtroomService.room`) before a sandbox starts, and submits the check
     there. That room admits it only if it binds a job the room recorded
     (R-OBL-3). Without the binding, nothing runs.
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
   container before any of the job's code runs. If the job pins a runner
   (`job.runner`) and the measured digest differs, the service runs nothing,
   signs nothing, and refuses `check-binding` (R-EXEC-11).
4. **The exact commit is checked out and confirmed** (R-EXEC-4). The runner
   fetches the integration commit (depth 1, so no history) into a new, empty
   repository, checks out what the remote sent, and confirms that `HEAD` is
   the integration and the tree is the job's tree. Nothing runs otherwise.
5. **The checker runs**, inside the sandbox. Commands are argument arrays;
   every exit code is checked. A command's output comes back whole and
   unchanged, up to 8 MiB; over that the service throws `payload-too-large`
   and records nothing (it never truncates output it verifies, such as the
   snapshot listing). Only the check's detail is cut and redacted.
6. **The service signs the check**, outside the sandbox, with its key (an
   Ed25519 key in the secret `CHECKER_KEY`), as a member's own key: it names
   no delegation, so the key must be a member's key in each room whose
   checks it signs. The check binds the lane, generation, obligation,
   integration, input, checker configuration digest and runner digest, and
   states `volatile` as the job does (R-EXEC-10). Its detail shows the
   measured runner digest (`Runner environment: sha256:…`), so that an admin
   can pin it (R-EXEC-11). Detail is cut to 16 KiB and tokens are redacted.
   The signed envelope goes to the job's room.

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
names the repositories, mints the job tokens, and keeps the duties. The
Room does this before it issues filtered jobs (section 29.8); in this
package only the measurement harness (`measure/harness/`) uses it.

## The LLM reviewer

- It reads the change inside the runner (`git diff` of the integration
  against the job's `base`, the main commit it was built on, fetched by its
  ID; R-EXEC-10) and sends it to the model from the checker service. A job
  whose base the runner cannot read is reviewed as the whole tree, and says
  so. The model is set by the variable `LLM_MODEL` (default
  `@cf/meta/llama-3.3-70b-instruct-fp8-fast`). Workers AI needs no external
  key.
- The diff and the model's answer are data. The answer is parsed only as a
  JSON list of at most 20 findings.
- It records a check that always passes, marked `volatile` (a model is not a
  pinned tool, so its check never carries), and a note anchored to that
  check.
- It never signs a `review`, so it can never meet a review obligation.
- Its configuration, [config/llm-review.json](config/llm-review.json) (for a
  room's `.artroom/checkers/llm-review.json`), says `advisory: true`, so its
  obligation never blocks a landing (R-OBL-7), and `volatile: true`. The
  `tests` and `types` configurations are beside it.

## Using it from the room

The Room Worker binds each checker as `CHECKER_<NAME>` (lane A's
`checkerBinding`) to this Worker's entrypoint, and this Worker binds the Room
Worker as `ROOM` (see [wrangler.jsonc](wrangler.jsonc)):

```jsonc
// The Room Worker's wrangler.jsonc:
"services": [
  { "binding": "CHECKER_TESTS", "service": "artroom-checkers", "entrypoint": "TestsCheckerService" },
  { "binding": "CHECKER_TYPES", "service": "artroom-checkers", "entrypoint": "TypesCheckerService" },
  { "binding": "CHECKER_LLM_REVIEW", "service": "artroom-checkers", "entrypoint": "LlmReviewService" }
]
// This Worker's wrangler.jsonc:
"services": [{ "binding": "ROOM", "service": "artroom-room" }]
```

One deployment serves every room on its `ROOM` binding: each job names its
room. The stand-in ledger (`test/ledger.ts`) is used only by the tests and
the measurement harness's `/h/*` routes.

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
npm test            # vitest, in Node; about 3 seconds
```

The tests are split by what they need.

`test/job.test.ts` and `test/worker.test.ts` start nothing. They cover the
decisions about a job or an envelope alone (binding, the accepted
namespaces, signing, the model's answer), and the production Worker: no
route, the `ROOM` binding, `ARTIFACTS_NAMESPACES`, and the shipped
configurations.

`test/handle.test.ts` covers what the service does with a job: what it
refuses, runs, signs and sends, and for whom. The provider, `RunnerHost`,
the gateway rule and the checkout are the real ones. The container is in
memory (`MemoryContainer` in `test/containers.ts`): it answers the commands
the service sends from a model repository, and keeps every command and
environment it was given. No test here starts a process. It covers: the
check binds its job and states `volatile` and the runner digest; the kind
and binding a v2 room's job names; the read token reaches the gateway and
never the sandbox; exit codes; a checkout that cannot be confirmed; a
runner pin or a `volatile` flag that does not match; a room for each job;
a new container for every job; the service's own copy of the job; and
output that is whole, or refused over the limit.

`test/sandbox.test.ts` covers the runner's life cycle: one owner for each
runner, and a grant for each job. One test runs real processes in a
container modelled on the host (`ProcessContainer`): a replaced tool and a
process left running do not outlive their container.

`test/git.test.ts` holds what only real git and real npm can show. It
builds one canonical repository for the file and only reads it. It covers:
the checkout is the exact integration with no history; a scoped job cannot
read a file left out of its snapshot by any route, nor an older, wider
snapshot's objects by known ID (R-CARRY-16), with the publisher's real
`writeSnapshot` and the git package's `SnapshotRepos`; the snapshot commit
ID the Room derives is the one the publisher writes; one real `npm ci` and
`npm test`; and the LLM reviewer's diff against the job's base.

Snapshot retirement and the rule of one repository for each snapshot commit
are tested in the git package (`test/snapshots.test.ts`,
`test/gitops.test.ts`).

## Live runs

**Status:** measurement only. The harness Worker `artroom-lg-checkers` was
retired from `src/` to `measure/harness/` and its deployment deleted
(decision D5, request 73eccbec, 2026-10-02). The Room's spike deployment
runs the production checker service (`artroom-spike-checkers`) for the
tests checker on a whole tree ([notes/deploy-spike.md](../../notes/deploy-spike.md));
`measure/live.mjs` covers what it does not: scoped snapshots, the types
checker, the LLM reviewer and the runner's isolation. The harness is not
type-checked or tested by this package's gates.

```sh
cd packages/checkers
env -u CLOUDFLARE_API_TOKEN npx wrangler whoami
CRANE=/path/to/crane ./container/image.sh   # once: copies node:22-bookworm into the registry
# secrets: LG_KEY (harness key) and CHECKER_KEY (Ed25519 private JWK), in a JSON secrets file
env -u CLOUDFLARE_API_TOKEN npx wrangler deploy -c measure/harness/wrangler.jsonc --secrets-file <file>
node measure/live.mjs
env -u CLOUDFLARE_API_TOKEN npx wrangler delete artroom-lg-checkers
```

Live runs use the harness Worker, `artroom-lg-checkers`
(`measure/harness/`), never the production one. The script makes its
own repos in the `gitseq-spike` namespace, deletes
them afterwards, and saves redacted results in `measure/results/`. The
`/h/*` routes it uses play the room: they build jobs, mint read tokens,
prepare snapshot repositories (`artroom-lg--snap-<commit>-<attempt>`, deleted when
their jobs end) and record checks in `HarnessLedger`. They need the
`x-lg-key` header.
