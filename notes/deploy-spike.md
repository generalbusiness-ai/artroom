# The spike deployment of the Room

Request 25ecefb8. On 2026-10-02 the Room Worker was deployed to Cloudflare
as `artroom-spike-room`, and a live smoke run took one lane from claim to
landing and verified the published log.

**URL:** <https://artroom-spike-room.inguz.workers.dev>

The Worker is left running. Its routes are the Room's HTTPS API under
`/v1/rooms` (see [packages/room/README.md](../packages/room/README.md),
"Using it").

## What is deployed

| Item | Value |
|---|---|
| Worker | `artroom-spike-room` (workers.dev only, no preview URLs) |
| Config | [packages/room/wrangler.spike.jsonc](../packages/room/wrangler.spike.jsonc) |
| Durable Objects | `Room`, `Registry`, and lane B's `Publisher` (a container Durable Object) |
| Container application | `artroom-spike-room-publisher`, image `artroom-lb-git@sha256:4a54f21b…` (the same digest as `wrangler.jsonc`) |
| Artifacts | binding `ARTIFACTS` to namespace `gitseq-spike`; `ARTIFACTS_HOST` is account 6e953d23…'s host |
| `PUBLIC_NAMESPACE` | `gitseq-spike`, so public founding creates repositories there |
| `OPERATOR_KEYS` | `key_YPyqnnYvpoDxlDj_8mTlI4IHzyZ8002lmXgrV7NuylE` |
| `PUBLIC_URL` | `https://artroom-spike-room.inguz.workers.dev` |
| `ROOM_KEY_SECRET` | a wrangler secret, put from `~/.config/generalbusiness/artroom-spike.env`; never in the repository |

The production config, `packages/room/wrangler.jsonc`, is unchanged. A Node
test (`test/node/deploy.test.ts`) checks that the spike config has the same
Durable Objects, migrations and container image as production, and differs
only in name, namespace, URL and operator key.

## Deploy and redeploy

```sh
packages/room/scripts/deploy-spike.sh
```

It deploys two Workers that bind each other (request 9f81f372): the Room,
`artroom-spike-room`, and lane G's checker service, `artroom-spike-checkers`
(`packages/checkers/wrangler.spike.jsonc`). The Room calls the checkers
through `CHECKER_TESTS`, `CHECKER_TYPES` and `CHECKER_LLM_REVIEW`. The
checker service submits checks through `ROOM`.

The script:

1. checks that the env file exists and is mode 600;
2. reads only `ROOM_KEY_SECRET`, and the checker's key ID from
   `ARTROOM_CHECKER_SEED` (the file is not sourced);
3. runs `wrangler whoami` with hugh's OAuth login
   (`env -u CLOUDFLARE_API_TOKEN npx -y wrangler@latest`);
4. puts `ROOM_KEY_SECRET` on the Room, and `CHECKER_KEY` on the checker
   service, each with `wrangler secret put` on stdin. `CHECKER_KEY` is the
   private JWK of `ARTROOM_CHECKER_SEED`, made by
   `packages/room/scripts/spike-checker-key.mjs jwk`, which writes only to
   a pipe. `secret put` also creates a Worker that does not exist yet;
5. deploys the checker service (its `ROOM` target exists), then the Room
   (its `CHECKER_<NAME>` targets now exist), retrying each once if the
   deploy fails;
6. checks that `GET /v1/rooms/deploy-spike-probe` answers 404 from the
   Room's router.

It prints no secret. Use the same `ROOM_KEY_SECRET` on every deploy: it
derives each room's key and each public repository's identity, so a new
value would orphan existing rooms. Keep `ARTROOM_CHECKER_SEED` too: its key
is a member (role `checker`) of every room it has checked. It is made once,
with hugh's approval, by `spike-checker-key.mjs create`, which appends it to
the env file only if it is absent and prints only the key ID.

On the first deploy, `wrangler secret put` created the Worker. `wrangler
deploy` then uploaded the Worker but stopped while applying the container
application, with a 401 from the containers API. Running the same deploy
again finished it, as wrangler's message advised. This is why the script
retries once.

To remove the deployment: `env -u CLOUDFLARE_API_TOKEN npx -y
wrangler@latest delete artroom-spike-room`. This deletes the Durable
Objects' storage too.

## The smoke run

```sh
node packages/room/measure/spike-smoke.mjs
```

When this was written there was no client or CLI package on main (lane E
landed later, at main `3f44c993`); the script still drives the Room's HTTPS
API directly. It signs envelopes and requests with the
Room's own `src/crypto.ts`. It uses hugh's OAuth for the Artifacts REST API,
to read refs, seed main and clean up. It saves a redacted result in
`packages/room/measure/results/`.

The script ran twice, with the same outcome. The second run is the record:
[spike-smoke-2026-10-02T02-49-37-604Z.json](../packages/room/measure/results/spike-smoke-2026-10-02T02-49-37-604Z.json).
The second run also records token metadata at cleanup, and checks that a
released lane's token no longer works.

| # | Step | Result | Time |
|---|---|---|---|
| 1 | `POST /v1/rooms` with `{ kind: "new" }`: draft | 200; repository `gitseq-spike/89f46098…` | 0.2 s |
| 2 | Sign the genesis; `POST /v1/rooms/found` | 200; room `room_3e534f1b…`; entries 0 (genesis) and 1 (policy-activated) | 2.3 s |
| 3 | The same `found` again | the same room ID | |
| 4 | `GET /v1/rooms/<name>`, no credential | the `RoomRef` | |
| 5 | The repository exists in `gitseq-spike` | yes, created by the Room | |
| 6 | `session` request; `GET /log` with it | 200 | |
| 7 | Lane 1 on the empty repository: claim, workspace (fork), workspace token, clone, push, propose, preview | all succeed; the preview is clean | ~6 s |
| 8 | Lane 1: `land` | **503 `unavailable`**: "The repository could not be read"; nothing recorded (gap 1) | |
| 9 | Lane 1: `release`; then `git ls-remote` with its token | released; git exits 128, so the token is revoked | |
| 10 | Seed main out of band with a 60-second write token, revoked after | pushed | |
| 11 | Lane 2: claim `docs/**`, `README.md` | 200, lane `act_5_a8503d4b` | |
| 12 | Lane 2: `workspace` request, wait for ready | ready, fork `89f46098…--act_5_a8503d4b` | 2.5 s |
| 13 | Lane 2: `workspace-token` | a write token for the fork, expiring with the lease | |
| 14 | Clone the fork, commit `docs/smoke.md`, push | pushed | |
| 15 | Lane 2: `propose` | 200, generation 1, no obligations; the head is pinned through the publisher sandbox | 1.0 s |
| 16 | Lane 2: preview | clean, a fast-forward | |
| 17 | Lane 2: `land` | accepted, `op_land_7` | 0.1 s |
| 18 | Wait for the operation | `landed`; log has `land-evaluated`, `land-reserved`, `land-outcome` | 1.0 s |
| 19 | `main` on the canonical repository | the landed integration | |
| 20 | Wait for log publication | published through entry 10, at `refs/artroom/log` | ~62 s |
| 21 | `artroom verify` (lane L's `packages/log/src/cli.ts`) on the canonical remote, with a read token in git's environment | exit 0; verified through entry 10; 2 policy decisions replayed; no failures | 2 s |
| 22 | Cleanup | see below | |

Publication waits about a minute because the Room publishes when 50 entries
are unpublished, or a minute after the oldest one (`publicationDue`).

### Cleanup

- Lane 2 was released.
- For the canonical repository and both forks, every active token was
  revoked and the repository deleted. No repository of either run is left.
- Every token the script minted (seed, `ls-remote`, verify) was revoked
  after use.
- What remains: the two rooms in the Room's Durable Objects and registry
  (`deploy-spike-smoke-muqd4vut` and `deploy-spike-smoke-muqd7brj`), now
  bound to deleted repositories. The registry never removes a binding, by
  design. The two read sessions expired 15 minutes after the runs; there is
  no API to revoke a session early.

## What was exercised

- Public founding (R-GEN-10, R-GEN-12 `new`, R-GEN-13), including the
  repeat of `found` and lookup by name.
- Signed acts over HTTPS (`/acts`), signed requests (`/requests`), a read
  session, and reads (`/log`, `/ops/:id` with `until`).
- Claim, workspace provisioning through lane B's `Workspaces` (a real
  Artifacts fork and a lease-bound token), propose (pinning through the
  publisher sandbox, bounded diff), the preview, and a landing through lane
  B's engine, with the container's push to `main`.
- Token revocation on release (R-WS-3).
- Log publication through the sandbox's `pushLog` and `readLogRef`, and
  offline verification with `artroom verify`.

## What was not exercised

- **Checkers and checks.** The room ran the default policy, with no required
  reviews or checks; lane 2's proposal had no obligations. Lane A's
  amendment-3 `CHECKER_<NAME>` bindings are not on main and are not in this
  config.
- **Reviews**, objections and other members: there was one member, the
  founding admin.
- **Imports with an operator grant.** See gap 3. `OPERATOR_KEYS` is set but
  nothing signed a grant.
- **A merge landing.** Lane 2 fast-forwarded main, so the sandbox's merge
  commit, merge previews and conflicts were not exercised.
- Invitations, joins, MCP and bearer redemption, WebSocket and long-poll
  subscriptions, lease expiry, take-over, abort, recovery after a crash, and
  log staging over more than one call (the log was small).
- Concurrent lanes and agents.

## Gaps found

Gaps 1 to 3 are fixed by request b6b51de7 (see "Re-run after the founding
fixes" below, and "Founding gaps" in
[packages/room/README.md](../packages/room/README.md)).

1. **Fixed: a room founded with `{ kind: "new" }` could not land its first
   lane.** The Room created an empty repository; `land` then failed with
   503 `unavailable`, "… retry with the same idempotency key", and retrying
   could not help, because lane B's landing needs a known main. Now
   founding gives `main` one commit with no files before the genesis is
   sealed (R-GEN-12, amended in one sentence), and a `land` on a repository
   with no main fails with `not-found`, not retryable, without "retry".
2. **Fixed: founding left a 24-hour write token on the canonical
   repository.** It was the token Artifacts returns when a repository is
   created. Now the creation is a step in lane B's workspace ledger,
   recorded before the call, and the token is owed revocation from its
   answer; the genesis is sealed only when no token is active on the
   repository, and the alarm retries the debt until Artifacts confirms it.
3. **Fixed: a deployment could found publicly or import, not both.** A
   deployment now takes a second, optional binding, `IMPORT_ARTIFACTS` for
   `IMPORT_NAMESPACE`, and the Room follows its repository's namespace. A
   mode whose binding is absent is refused at `draft` and before the
   registry binding, with the reason (review a35b4b61), so it no longer
   binds a name that can never complete. Since revision 2 the spike has
   both bindings, `gitseq-spike` and `gitseq-spike-import` (approved by
   hugh), and its live run imports a repository as well as founding a public
   room.
4. **No client on main (at the time).** Lane E's client, CLI and MCP were
   not on main then (they landed at `3f44c993`), so the smoke run is a
   script over the HTTPS API. `artroom verify` is lane L's CLI.
5. **The first deploy needed a retry** for the container application (see
   "Deploy and redeploy").

## Re-run after the founding fixes (request b6b51de7)

The spike Worker was redeployed from `request/founding-gaps` with
`scripts/deploy-spike.sh` (same container image; version
`a0797ebb-1dfd-405e-ae34-a9735be127b6`), and the smoke script, changed so
that lane 1 must land and nothing seeds main, ran once:
[spike-smoke-2026-10-02T03-23-17-901Z.json](../packages/room/measure/results/spike-smoke-2026-10-02T03-23-17-901Z.json).
Every step passed.

| Step | Result |
|---|---|
| Draft, found, found again, look up by name | 200; the same room; found took 3.0 s |
| Main after founding | `add07530…`, the Room's first commit (no files), as computed from the genesis's time |
| Active tokens on the new repository after founding | 0 |
| Lane 1: claim, workspace, token, clone, push, propose, preview | all succeed; the preview is a clean fast-forward from the first commit |
| Lane 1: `land` | accepted, then `landed` in 1.4 s; main is lane 1's head |
| Lane 1: release; its token on the fork | released; `git ls-remote` exits 128 |
| Lane 2: the same, on top of lane 1 | `landed`; main is lane 2's head |
| Import drafts signed by the spike operator key | 403: "A grant cannot name a repository in the public founding namespace." and "This deployment does not import repositories: …" |
| Log publication, `artroom verify` | published through entry 14; verify exit 0, 4 decisions replayed, no failures |
| Cleanup | canonical repository and both forks: 0 active tokens, deleted; none left |

Left behind, as before: the room `deploy-spike-smoke-muqeemmx` in the
Room's Durable Objects and registry, bound to a deleted repository, and its
read session, which expires 15 minutes after the run. The import drafts
created, read and bound nothing.

## Revision 2: a live import (request b6b51de7)

The spike config binds `IMPORT_ARTIFACTS` to `gitseq-spike-import` and sets
`IMPORT_NAMESPACE`. The smoke script, after the public founding, creates a
throwaway repository with one commit in `gitseq-spike-import` (with hugh's
OAuth; its creation token pushes the commit and is then revoked), signs an
onboarding grant with the spike operator key (the seed is read from the env
file into the process and never printed), drafts and founds a room on it,
lands a lane, waits for the log and runs `artroom verify`. Cleanup is the
deploy lane's `cleanupRun` (review 2485e992), once per namespace.

| Run | Code | Outcome |
|---|---|---|
| [03:55:25](../packages/room/measure/results/spike-smoke-2026-10-02T03-55-25-370Z.json) | revision 2, before review a35b4b61 | Public founding passed. The import founded and landed, but its log never published: another actor redeployed `artroom-spike-room` at 03:57:21 from a config without the import binding (version `2092006a`), so the import room lost its namespace. |
| [04:03:51](../packages/room/measure/results/spike-smoke-2026-10-02T04-03-51-743Z.json) | the same, redeployed | Every step passed. |
| [04:21:13](../packages/room/measure/results/spike-smoke-2026-10-02T04-21-13-851Z.json) | review a35b4b61 answered, merged with main `b5864882` and `request/deploy-spike` `97f42684`; version `a9f55d45` | Every step and every cleanup duty passed (57 steps). |

These runs predate review 3eb7bc44 (incarnation names). That revision was
not run live: one coordinated redeploy follows.

The 04:21:13 run, on one deployment:

| Step | Result |
|---|---|
| Public founding | main is the Room's first commit, `6ff91167…`; 0 active tokens after founding |
| Lanes 1 and 2 | both landed; lane 1's released token no longer reads its fork |
| Import drafts for the public namespace and for `gitseq-spike-other` | 403, each with its reason |
| Public log | published through entry 14; `artroom verify` exit 0, 4 decisions replayed |
| Import repository | `gitseq-spike-import/9b1e9f52…`, one commit `76ace7c6…`; its creation token revoked, 0 active |
| Import draft and found | 200; the genesis carries the grant by operator `key_YPyq…` |
| Main after founding the import | still `76ace7c6…`: the Room wrote nothing |
| Lane 3 on the import | landed; main is its integration, on `76ace7c6…` |
| Import log | published through entry 8; `artroom verify` exit 0, 2 decisions replayed, reports the operator key |
| Cleanup | both canonical repositories and three forks deleted; every duty done; no repository left |

At cleanup, one active write token was on the public canonical repository:
60 seconds, created at 04:24:33, two minutes after its first publication.
It is the Room's own publishing credential for the next log publication (a
checkpoint entry leaves the log unpublished again), in use or awaiting its
revocation, not a founding token. Cleanup revoked it, then deleted the
repository.

Left behind: the rooms of each run in the Room's Durable Objects and
registry, bound to deleted repositories, and their read sessions, which
expire 15 minutes after each run.

## Gates

Run in this worktree after the changes (the source under `src/` is
unchanged; the new Node test is the spike config check):

| Gate | Exit | Tests |
|---|---|---|
| root `npm run typecheck` | 0 | — |
| root `npm test` | 0 | git 143; log 127 Node and 122 workerd; policy 199 Node and 198 workerd (1 skipped); room 68 Node and 275 workerd; ui 107 |
| `wrangler deploy --dry-run --config wrangler.spike.jsonc` | 0 | bundles with the Room, Registry and Publisher Durable Objects, the Artifacts binding and the Publisher container |

The room workerd suite prints "The Workers runtime canceled this request
because it detected that your Worker's code had hung" 22 times as uncaught
exceptions, but every test passes.

## Review 1b868265

The checker's review of `34d4ba9d` accepted the config, the deploy script
and the smoke evidence, and found one P2: a failed cleanup did not fail the
smoke run. Refused revocations, a refused deletion and repositories left
over were recorded but did not change `ok` or the exit status. A cleanup
exception was caught and ignored. A refused inventory was read as an empty
list (`result ?? []`), so it looked like proof that nothing was left.

**The fix** is in [packages/room/measure/spike-smoke.mjs](../packages/room/measure/spike-smoke.mjs).
The result has one cleanup outcome, `cleanup`, from `cleanupRun`:

- Every piece of cleanup is a duty: revoke each token the run minted and
  did not see revoked; inventory the run's repositories (the canonical one
  and its `<canonical>--<lane>` forks); for each, list its active tokens,
  revoke each one and delete the repository; inventory again.
- Each duty ends `done` (the API answered `success: true`), `refused`
  (`success: false`) or `unknown` (an exception, or an answer without
  `success`).
- A listing counts only if it succeeded, holds an array, fills less than
  one page and reports no larger `total_count`. Otherwise it proves
  nothing, and the remainder (`reposLeft`) is `null`, not empty.
- When the inventory fails, the run still cleans the repositories it knows
  it made: the canonical repository and the forks of its ready workspaces.
- `cleanup.ok` is true only when every duty is done and the final inventory
  proves that no repository of the run is left. An exception from a remote
  call becomes an unknown duty. Any other exception in cleanup leaves the
  result with `cleanup.ok` false and the error recorded.
- The run's `ok` (`smokeOk`) needs main to finish, every step to pass and
  `cleanup.ok`. The exit status is 0 only then.
- `cleanup.unresolved` lists every duty that is not done, with the
  repository name and the token ID. Neither is a secret, and no token value
  is kept. An operator finishes the cleanup with the Artifacts REST API:
  `DELETE /tokens/<id>` and `DELETE /repos/<name>` under
  `accounts/6e953d23…/artifacts/namespaces/gitseq-spike`.

The two earlier result files were recorded before this change. They show
all tokens revoked and no repositories left, but in the old shape.

**Tests**, in [packages/room/test/node/spike-smoke.test.ts](../packages/room/test/node/spike-smoke.test.ts),
run `cleanupRun` against a fake Artifacts REST API and make no live calls.
The first five are the checker's diagnostics, now asserting the correct
outcome:

| Test | What it shows |
|---|---|
| clean | every duty done, nothing left: `ok`; another run's repository is untouched; no token value is kept |
| delete refused | not `ok`; the refusal names the repository; `reposLeft` lists it; `smokeOk` is false |
| revoke refused | not `ok`, though the repository was then deleted; the token ID is kept |
| inventory refused | not `ok`; `reposLeft` is `null`; the known repositories are still cleaned |
| cleanup throws | not `ok`; every duty `unknown` with the cause; `cleanupRun` does not throw |
| a full page, or a larger `total_count` | an incomplete listing proves nothing: not `ok` |
| a token listing refused, or without `success` | not `ok`; the repository is still deleted |
| a deletion answered as success but still listed | not `ok`; `reposLeft` names it |
| a minted token not seen revoked | revoked again; if refused, unresolved by ID |
| no canonical repository | nothing to clean: `ok`, no calls |
| `smokeOk` | false for a failed cleanup, no cleanup, a failed main, a failed step, or no steps |
| `outcomeOf`, `completeListing` | strict classification |

**Mutations.** Each was made on the committed fix, the test file run, and
the change reverted. 20 of 21 were caught, two only after a test was added
(a full-page inventory on its own; names the substring search returns that
are not the run's).

| Mutation | Caught |
|---|---|
| A refusal counts as done | yes (4 tests) |
| An answer without `success` counts as done | yes |
| A refused listing reads as empty (the old `result ?? []`) | yes (3) |
| A listing that fills its page is accepted | yes |
| A larger `total_count` is accepted | yes |
| `ok` ignores unresolved duties | yes (3) |
| `ok` ignores repositories left | yes |
| No final inventory | yes (6) |
| A failed inventory cleans nothing | yes (2) |
| Every repository the search returns is cleaned | yes |
| A listing refusal is classed unknown | yes (2) |
| A token value is kept in the metadata | yes |
| Minted tokens are not retried | yes (2) |
| A revoked minted token stays in the map | yes |
| An unknown token listing skips the deletion | yes (2) |
| `smokeOk` ignores cleanup | yes (2) |
| `smokeOk` ignores a failed main | yes |
| `smokeOk` accepts a run with no steps | yes |
| `smokeOk` ignores a failed step | yes |
| An exception counts as done | yes |
| `ok` treats an unknown remainder (`null`) as empty | no: equivalent. `reposLeft` is null only when the final inventory duty is unresolved, which already fails `ok` |

No redeploy or live run was needed for this change; the Worker is unchanged.

**Gates** at `7486c142`, after merging main `472b2380`. The commit
that adds this text changes only this file.

| Gate | Exit | Tests |
|---|---|---|
| root `npm run typecheck` | 0 | — |
| root `npm test` | 0 | checkers 33; git 162; log 127 Node and 122 workerd; policy 199 Node and 198 workerd (1 skipped); room 81 Node and 275 workerd; ui 141 |

The room workerd suite still prints the 22 "code had hung" messages, with
every test passing.

## Review 2485e992

The checker's review of `ea4c058c` accepted the cleanup outcome and found
one P2: a malformed repository record could prove an empty remainder. Any
successful array was accepted as a complete listing, and the filter that
picked this run's repositories dropped records without a string name. So a
fake API answering `{ success: true, result: [{}] }` to both inventories,
with the canonical repository still present, deleted nothing and still
gave `cleanup.ok: true`, `reposLeft: []` and exit 0.

**The fix.** `readListing` decides a listing's outcome once, from three
facts: `success`, completeness, and whether every record is usable. It
replaces `completeListing`.

- A repository record is usable only if it is an object whose `name` is a
  string in the Artifacts name form (`[A-Za-z0-9._-]`, 1 to 100
  characters). A token record is usable only if its `id` is a string of
  `[A-Za-z0-9_-]`, 1 to 128 characters, so it is safe in
  `DELETE /tokens/<id>`.
- One unusable record makes the whole listing `unknown`, with no items. It
  is never filtered out.
- An unknown inventory leaves `reposLeft` as `null`, and cleanup falls back
  to the repositories the run knows it made.
- An unknown token listing revokes nothing from that listing. The
  repository is still deleted, and the run fails on the `list-tokens`
  duty.
- The filter that tells this run's repositories from others the search
  returns now sees only validated records.

**Tests**, added to `test/node/spike-smoke.test.ts` (17 in all):

| Test | What it shows |
|---|---|
| the checker's case: both inventories answer `[{}]` | not `ok`; `reposLeft` is `null`; both inventories are `unknown`; the canonical repository and the fork are deleted by the fallback; `smokeOk` is false |
| malformed repository records: `{}`, `null`, a number, a string, an array, an empty, numeric, null or slash-containing `name`; alone, and mixed with a valid record before or after | not `ok`; `reposLeft` is `null`; the known repositories are cleaned |
| malformed token records: the same kinds, plus `id`s that are empty, numeric, null, contain `/` or contain a space; alone, and mixed with a valid record | `list-tokens` is `unknown`; no `DELETE /tokens/` call; the repository is still deleted |
| `isRepoRecord`, `isTokenRecord` | the identity rules |
| `readListing` | done with items only for a complete, successful listing of usable records; refused or unknown with no items otherwise |

**Mutations**, made on the committed fix (`61ae5f1a`), each run against the
test file and reverted. This set replaces the previous one for the changed
code: 28 of 29 were caught.

| Mutation | Caught |
|---|---|
| A refusal counts as done | yes (4 tests) |
| An answer without `success` counts as done | yes |
| A refused listing reads as empty | yes (3) |
| A listing without `success` or an array reads as empty | yes (2) |
| A full page is accepted | yes |
| A larger `total_count` is accepted | yes |
| Malformed records are accepted (no identity check) | yes (4) |
| Malformed records are filtered out (the old shape) | yes (4) |
| A repository record needs only to be an object | yes (4) |
| A repository name needs only to be a string | yes (2) |
| A token record needs only to be an object | yes (2) |
| A token ID needs only to be a string | yes (2) |
| The token listing is not identity-checked | yes |
| The inventory is not identity-checked | yes (2) |
| `ok` ignores unresolved duties | yes (4) |
| `ok` ignores repositories left | yes |
| No final inventory | yes (8) |
| A failed inventory cleans nothing | yes (4) |
| Every repository the search returns is cleaned | yes |
| A token value is kept in the metadata | yes |
| Minted tokens are not retried | yes (2) |
| A revoked minted token stays in the map | yes |
| An unknown token listing skips the deletion | yes (3) |
| `smokeOk` ignores cleanup, a failed main, no steps, or a failed step | yes (four mutants) |
| An exception counts as done | yes |
| `ok` treats an unknown remainder (`null`) as empty | no: equivalent, as before. `reposLeft` is null only when the final inventory duty is unresolved |

No live call, redeploy or live run was made for this change.

**Gates** at `61ae5f1a`, after merging main `3f44c993` (lane E). The commit
that adds this section changes only this file.

| Gate | Exit | Tests |
|---|---|---|
| root `npm run typecheck` | 0 | — |
| root `npm test` | 0 | checkers 33; cli 102; client 86 Node and 2 workerd; git 162; log 127 Node and 122 workerd; mcp 66 Node and 1 workerd; policy 199 Node and 198 workerd (1 skipped); room 85 Node and 275 workerd; ui 141 |

The room workerd suite printed the "code had hung" message 23 times this
run (22 before), with every test passing. No room source changed here.

## Redeploy from main c5825470 (2026-10-02)

One coordinated redeploy of the spike from main `c5825470`, which includes
founding gaps revision 4.2 and MCP stage 0 revision 2. It was built in a
fresh detached worktree after `npm ci`, and deployed with
`packages/room/scripts/deploy-spike.sh` using hugh's OAuth. No retry was
needed.

- **Version ID:** `1a33ec82-ba39-4100-aa2b-90e281c0b2bd`, replacing
  `a9f55d45-d4db-4852-bbfb-a9c998f5da31`.
- **Bindings:** `ARTIFACTS` reaches `gitseq-spike` and `IMPORT_ARTIFACTS`
  reaches `gitseq-spike-import`. The publisher image digest is unchanged.
- **Probe:** `GET /v1/rooms/deploy-spike-probe` answered 404.

| Check | Result | Record |
|---|---|---|
| Spike smoke, public and import (`spike-smoke.mjs`) | passed, exit 0, every step ok; strict cleanup `ok`, 0 unresolved, nothing left in either namespace | [spike-smoke-2026-10-02T06-37-51-694Z.json](../packages/room/measure/results/spike-smoke-2026-10-02T06-37-51-694Z.json) |
| MCP stage 0 harness with the cold agent (`mcp-stage0.mjs --claude`) | passed, exit 0, every step ok; cleanup `ok`, 0 unresolved, nothing left | [mcp-stage0-2026-10-02T06-40-59-778Z.json](../packages/room/measure/results/mcp-stage0-2026-10-02T06-40-59-778Z.json), transcript [mcp-stage0-claude-2026-10-02T06-40-59-778Z.jsonl](../packages/room/measure/results/mcp-stage0-claude-2026-10-02T06-40-59-778Z.jsonl) |
| Independent cleanup check | complete listings in both namespaces show no repository for any of the three runs' bases | below |

**What passed, live, for the first time:**

- **Incarnation naming.** Each public room's repository is `<base>-1`, for
  example `edfa5044…-1`, and its forks are `<base>-1--<lane>`.
- **Public room's first commit.** Main is the Room's first commit with no
  files, and no token is left on the new repository. The first lane landed
  on it: gap 1 is closed live.
- **Import.** A grant for the public namespace, and one for a namespace
  with no binding, were each refused with their reason. The import into
  `gitseq-spike-import` founded; the Room wrote nothing to main; a lane
  landed; and `artroom verify` passed and reported the operator key.
- **Log verification.** Both logs verified (public: through entry 14, 4
  decisions replayed; import: through entry 8, 2 decisions replayed).
- **Strict cleanup.** Every duty was `done`, with complete inventories
  before and after, in both namespaces.
- **MCP stage 0, scripted drive.** This was the first live run of the
  incarnation-aware harness, against the incarnation `c23e21dc…-1`:
  - 401 with `WWW-Authenticate`, with no bearer and with an unknown one;
  - room-custody redemption;
  - the tool list in legacy mode and in 2026-07-28 mode;
  - claim, including an idempotent retry; workspace, git push, propose;
  - a refusal that conforms to the advertised output schema;
  - land, attention with its cursor, explain and release.
- **MCP stage 0, cold agent.** Claude Code 2.1.287 (claude-opus-5-5)
  connected to the endpoint and claimed, pushed, proposed, landed (main
  `0339e9ff`) and released in 15 turns. Its two tool errors were local
  permission prompts in its own shell, not Artroom refusals. The harness's
  `landed` list names only the driver's lane, but main is the agent's
  commit, as its own report says.
- **Ending sessions.** Each bearer session was ended by revoking the
  agent's key, and the bearer was then refused.

**Cleanup, confirmed separately.** Complete listings (`success: true`, every
record named, under one page) of `gitseq-spike` and `gitseq-spike-import`,
searched by each run's base (`edfa5044…`, `e6cd66c4…`, `c23e21dc…`), show
0 repositories. Tokens on deleted repositories cannot be listed. Each run's
cleanup listed every repository's active tokens and revoked each before
deleting it (all `done`). The redacted results and the transcript contain
no Artifacts token, bearer or session token. Not ours: `gitseq-spike` holds
133 other repositories, from earlier lanes' runs, which were not touched.

**Not exercised:**

- **Legacy-base adoption.** It needs a registry binding left unfounded by
  an older Worker, and every room here was founded fresh, so the Room's
  `legacyBinding` was false throughout. (Retired since, with the spike's
  state: see "Wipe and retirement (decision D5)".)
- **Checkers and reviews.** No policy required them.
- **Merge landings.** Every landing fast-forwarded main, the cold agent's
  included: main became its own commit, `0339e9ff`.
- **Other paths.** Lease expiry, abort and crash recovery, and logs too
  large to publish in one push.
- **Rooms left behind.** The registry keeps the founded rooms, now bound to
  deleted repositories, by design.

## Review and check, live (request 9f81f372, 2026-10-02)

The spike now runs lane G's checker service. I deployed from
`request/checker-bindings` after merging main `bd520fb9`, which includes
lane A's check-job dispatch, and running `packages/room/scripts/deploy-spike.sh`
with hugh's OAuth. No retry was needed.

| Worker | Version ID | What it has |
|---|---|---|
| `artroom-spike-checkers` (new) | `abfe34a8-5fd8-4910-848c-1bfe6dedd1f6` | `ROOM` bound to `artroom-spike-room`; reads `gitseq-spike` and `gitseq-spike-import`; container application `artroom-spike-checkers-runnerbox` (image `artroom-lg-runner@sha256:17b7fd60…`); `AI`; `CHECKER_KEY` |
| `artroom-spike-room` | `41f61bfe-b980-4988-870b-a56d59b56d4a` | adds `CHECKER_TESTS`, `CHECKER_TYPES` and `CHECKER_LLM_REVIEW`, bound to the checker service's entrypoints |

`CHECKER_KEY` is made from `ARTROOM_CHECKER_SEED`, which was created for
this run with hugh's approval. Its key is
`key__5Feafe6dIDQmeA8IHuU-IyPQFWaQ8MnzskJMmfY11Y`. Each checked room invites
that key as `@checker`, with role `checker`.

**How the room is set up.** It is an import into `gitseq-spike-import`. Its
first commit holds `.artroom/policy.json` and `.artroom/checkers/tests.json`
(the whole tree, not volatile, no runner pinned). The policy requires one
`tests` check by `role:checker` and one review by `role:maintainer`, not
the author, on `src/**` and `test/**`. The repository is a package with no
dependencies, so `npm ci` installs nothing, and it has two `node --test`
tests. The lane adds `src/greet.js` and its test.

| Run | Result | Record |
|---|---|---|
| Spike smoke, all phases (public, import, checks) | passed, exit 0; strict cleanup `ok`, 0 unresolved, nothing left | [spike-smoke-2026-10-02T11-42-51-651Z.json](../packages/room/measure/results/spike-smoke-2026-10-02T11-42-51-651Z.json) |
| MCP stage 0, `--checks` | passed, exit 0; cleanup `ok` (agent sessions ended, repositories gone) | [mcp-stage0-checks-2026-10-02T11-47-36-135Z.json](../packages/room/measure/results/mcp-stage0-checks-2026-10-02T11-47-36-135Z.json) |
| Spike smoke, checks phase again (`SPIKE_PHASE=checks`), recording the check's runner and detail | passed, exit 0; cleanup `ok` | [spike-smoke-2026-10-02T11-49-37-449Z.json](../packages/room/measure/results/spike-smoke-2026-10-02T11-49-37-449Z.json) |

**The flow, as each run showed it:**

1. **Propose.** The proposal owes `obl_check-tests` and
   `obl_independent-review`, both open.
2. **Attention asks.** The reviewer's attention has `review-requested` and
   the checker's has `check-requested`, both open. In the MCP run, the
   reviewer is an MCP agent with role `maintainer`, and it saw its request
   through the `attention` tool.
3. **Gated landing.** `land` while the review is open is refused with
   `obligation-open`, over HTTPS and over MCP. The Room records the refusal.
4. **Dispatch.** The Room issued the job to `artroom-spike-checkers` over
   `CHECKER_TESTS`, with a read token for the integration. In each run the
   checker's signed `check` was admitted about 10 seconds after the
   proposal: `ok: true`, `check: tests`, bound to the integration. The
   third run recorded what ran:

   > Machine-run check "tests": passed. It ran `npm ci`, then `npm test`,
   > in an isolated runner. Runner environment: `sha256:31dd5087…` …
   > `ok 1 - adds` … `ok 2 - greets`
5. **Check met.** The check obligation is met, and the checker's request
   is closed in attention.
6. **Review.** The second member (`@reviewer`, a maintainer; through MCP,
   `@mcp-reviewer`) approves. The review obligation is met, and the request
   is closed.
7. **Land.** The lane lands as a fast-forward, and main is its
   integration. The author's attention has `land-outcome`, `landed`.
8. **Verify.** The log publishes, and `artroom verify` passes (through
   entry 15 over HTTPS and 19 over MCP, 4 decisions replayed, the operator
   key reported). The verified log holds the `check`, the `review`, the
   refused and the accepted `land`, and `land-outcome`.

**Cleanup, confirmed separately.** I listed both namespaces completely, by
each run's repository base: `26cfec8d…` (the public room), `e6f669a5…` and
`e4c483f9…` (the first run's import and checks), `71223cda…` (the
checks-only run) and `6d18169b…` (the MCP run). Each listing showed 0
repositories. Tokens on deleted repositories cannot be listed, but each
run revoked every listed active token before deleting its repository, and
every one of those duties is `done`. The result files contain no Artifacts
token, bearer or session token.

**Also in this lane:**

- `deploy-spike.sh` now deploys both Workers, in the order their mutual
  bindings need.
- `measure/checks.mjs` holds the shared fixtures.
- `spike-smoke.mjs` has the checks phase, and its cleanup covers every
  imported repository with one combined outcome.
- `mcp-stage0.mjs` has `--checks`.
- The room README's "Review 700b74ea" adoption bullet now states the
  registry-ledger rule.

**Not exercised:**

- **Scoped (filtered) checker inputs.** No snapshot repository was made:
  the configuration has no `inputs`.
- **Carry.** No runner is pinned, so no check carried, and only one
  generation was proposed.
- **Failing checks.** A failing check, or a refused one (`check-binding`),
  was not run live.
- **Other checkers.** `types` and `llm-review` are bound but no policy
  asked for them, so no Workers AI call was made.
- **Job failure paths.** Job retries after a lost answer, expired attempts,
  token-mint failures and the Room's unknown-mint duties.
- **Advisory checks**, and checks on a landing whose integration differs
  from the preview's (a merge landing).
- **Many jobs.** More than one job in flight, and checks under load.
- **Legacy-base adoption**, as before (retired since: see below).

**Gates**, on the code that ran live (after merging main `bd520fb9`):

| Gate | Exit | Tests |
|---|---|---|
| root `npm run typecheck` | 0 | — |
| root `npm test` | 0 | checkers 45; cli 102; client 86 Node and 2 workerd; git 193; log 198 Node and 193 workerd; mcp 73 Node and 1 workerd; policy 199 Node and 198 workerd (1 skipped); room 125 Node and 382 workerd; ui 141 |
| `wrangler deploy --dry-run` of both spike configs | 0 | — |

The room workerd suite printed the "code had hung" message 28 times, with
every test passing.

## Wipe and retirement (decision D5, request 73eccbec, 2026-10-02)

hugh's decision D5 retired the Room's migrations 2 to 8, the legacy lease,
the registry's legacy flag, lane B's legacy base adoption and the snapshot
ledger's revision-3 upgrade. Those paths existed only for state the spike
deployment had. So the spike's Durable Objects were wiped, and the code
now starts every store at the folded base schema, version 1. The harness
Workers of lanes B and G were deleted; their code moved to each package's
`measure/harness/`.

**How the state was wiped: by deleting the Worker.** The first attempt was
a delete-class migration in `wrangler.spike.jsonc`: `v3` deleting `Room`
and `Registry`, then `v4` making them again, in one deploy (commit
`bf2d7d46`). Cloudflare refused it: "Cannot apply --delete-class migration
to class 'Room' without also removing the binding that references it"
(code 10061). Nothing changed, except that the deploy script had already
put both secrets again, with the same values, and redeployed the checker
service. A delete-class migration therefore needs two deploys, with the
spike broken in between (no `ROOMS` or `REGISTRY` binding), and would leave
the spike's migrations different from production's for good. Deleting the
Worker deletes the storage of all its Durable Objects, which Cloudflare
documents, and the deploy script then makes it again with production's
migrations. So the spike config was restored to production's (commit
`96ed4fc3`), and:

1. `wrangler delete artroom-spike-room`. Wrangler warned that
   `artroom-spike-checkers` uses it as a service binding; the binding is by
   name, and works again once the Worker exists.
2. `packages/room/scripts/deploy-spike.sh` at `96ed4fc3`. It put
   `ROOM_KEY_SECRET` and `CHECKER_KEY` from the env file, with the same
   values as before (no secret was created or rotated), and deployed the
   checker service. The Room's upload succeeded, but its container
   application did not: twice, wrangler said it "could not finish applying
   its Durable Object-managed Container application settings". Deleting a
   Worker does not delete its container application. The old
   `artroom-spike-room-publisher` application (`18c01d2e…`) was still bound
   to the deleted Worker's `Publisher` namespace, and a new one could not be
   made under its name.
3. `wrangler containers delete 18c01d2e9fa242c1a42846f5a71418dc`, then
   `wrangler deploy --config wrangler.spike.jsonc` at `96ed4fc3`: deployed,
   with a new application, `3388b66b…`. The probe answered 404.

| Worker | Version ID | Replacing |
|---|---|---|
| `artroom-spike-room` | `0392159a-d0eb-4d86-afe2-030dd29b2c14` | `41f61bfe…` (and `876d6113…`, the secret put by the refused attempt) |
| `artroom-spike-checkers` | `7d059f37-c974-4272-9516-a3f21f38c27d` | `abfe34a8…` (and `a579ebf0…`, from the refused attempt, the same checker code) |

The publisher image digest and the runner image are unchanged. The
registry's earlier rooms are gone: `GET /v1/rooms/<name>` answers 404 for
`deploy-spike-smoke-muqd4vut`, `deploy-spike-smoke-muqeemmx` and
`deploy-spike-checks-muqwhtip`, which earlier runs left bound.

**Harness Workers deleted.** Before deleting, the account's Workers were
listed through the API: the `artroom-` ones were `artroom-lb-git`,
`artroom-lg-checkers`, `artroom-spike-checkers`, `artroom-spike-isogit`,
`artroom-spike-room` and `artroom-spike-sandbox-git`.

| Deleted | What it was | Last version |
|---|---|---|
| Worker `artroom-lb-git` | lane B's harness: `Publisher` and `HarnessRoom` | `7f3cf4f1-0bbd-4611-a2df-5428c6c08c42` |
| Worker `artroom-lg-checkers` | lane G's harness: `RunnerBox`, `Publisher` and `HarnessLedger` | `1abb65b1-45b7-4cc2-a54e-159c7b7c6514` |
| Container application `artroom-lb-git-publisher` (`8608a905…`) | left by the Worker's deletion | — |
| Container applications `artroom-lg-checkers-publisher` (`149e8c52…`) and `artroom-lg-checkers-runnerbox` (`ca74cfd2…`) | the same | — |

Deleting the applications too lets `measure/harness/` be deployed again
for a run under the same names. The registry images (`artroom-lb-git`,
`artroom-lg-runner`) are kept: the spike Room and checker service use them.
Not touched: `artroom-spike-isogit` and `artroom-spike-sandbox-git` (the
spikes' own Workers), and the container application
`artroom-lb-logbig-publisher` (`9cf9349e…`), which the deletion of
`artroom-lb-logbig` left behind and which would block that harness's next
deploy the same way. (Retired later the same day under request 167a8ae6:
see "Orphans retired" below.)

**Live smoke**, `packages/room/measure/spike-smoke.mjs`, all phases:

| Run | Result | Record |
|---|---|---|
| 1 | Public and import phases passed (founding, lanes 1 to 3 landed, both logs verified). The checks phase failed at lane 4's `propose`: 503 `unavailable`, "The repository could not be read", after 59 seconds. Cleanup `ok`, 0 unresolved, nothing left. Not reproduced since: see "The 503 at lane 4's propose" below | [spike-smoke-2026-10-02T15-59-44-105Z.json](../packages/room/measure/results/spike-smoke-2026-10-02T15-59-44-105Z.json) |
| 2 | `SPIKE_PHASE=checks`: passed, exit 0. The job was dispatched, the checker's signed check admitted after 10 seconds, the review given, the lane landed, `artroom verify` exit 0 through entry 15 | [spike-smoke-2026-10-02T16-04-47-640Z.json](../packages/room/measure/results/spike-smoke-2026-10-02T16-04-47-640Z.json) |
| 3 | All phases: passed, exit 0, 91 steps ok. Public log verified through entry 14, import through 8, checks through 15; cleanup `ok`, 0 unresolved, nothing left in either namespace | [spike-smoke-2026-10-02T16-06-45-754Z.json](../packages/room/measure/results/spike-smoke-2026-10-02T16-06-45-754Z.json) |

Every Artifacts token the runs minted was revoked and every repository they
made was deleted (each run's strict cleanup). The result files contain no
Artifacts token, bearer or session token.

**Gates** at `bf2d7d46` (the code; `96ed4fc3` changes only the spike config
and its test back to main's):

| Gate | Exit | Tests |
|---|---|---|
| root `npm run typecheck` | 0 | — (again at `96ed4fc3`: 0) |
| root `npm test` | 0 | checkers 43; cli 102; client 86 Node and 2 workerd; git 212; log 198 Node and 193 workerd; mcp 73 Node and 1 workerd; policy 199 Node and 198 workerd (1 skipped); room 125 Node and 379 workerd; ui 141 |
| git `npm run test:workers`, `npm run test:log` | 0, 0 | 8; 12 |
| room `npm run test:node` at `96ed4fc3` | 0 | 125 |
| `wrangler deploy --dry-run` of both spike configs, both production configs and both `measure/harness/` configs | 0 each | — |

### The 503 at lane 4's propose (run 1)

**Not reproduced in 5 runs of the checks phase; cause not found.**

**What produced it.** The message is the Room's pre-admission refusal
(`preAdmission` in [packages/room/src/admission.ts](../packages/room/src/admission.ts)).
For a `propose`, the Room makes these calls before deciding:

1. `headInFork`: read the head from the lane's fork through the Artifacts
   binding.
2. `pinObjects`: mint a 600-second read token on the fork and a write token
   on the canonical repository, then call the room's `Publisher` container
   (start it if it is not running, route its HTTPS through the gateway, and
   run `git fetch` and `git push`).
3. `readMain`, `diff`, `readConfig` when `.artroom/` changed, and
   `changedBetween` for earlier generations.

Any exception from any of these is caught and replaced by this 503. The
exception itself is discarded (`void e`) and never logged. So run 1's
result file records only the status, the message and 59,036 ms, and the
cause was lost. Workers Logs for that minute could not be read: hugh's
OAuth login has no observability scope (the telemetry API answered 403).

**What can take 59 seconds.** Nothing on this path waits that long by
design. `withRetry` sleeps for at most 7.5 seconds in all. Each git
command in the container has a 120-second timeout. The pin tokens last 600
seconds. Candidate causes, none confirmed:

- The `Publisher` container's cold start (`ensure` runs `start`, then an
  `exec`) on a host that had not yet pulled the image. Run 1 began 22
  seconds after the wipe had made a new container application (`3388b66b…`),
  lane 4's `propose` came about 4 minutes after that, and its room was the
  third room to start a container. A platform
  limit near 60 seconds on starting or calling into the container would
  give this timing.
- An Artifacts call (a fork or canonical read, a token mint, or the git
  transfer through the gateway) that hung until a platform limit.

**Whether this change caused it.** Not through its code: nothing on the
propose path changed. `admission.ts`, `packages/room/src/artifacts.ts` and
lane B's publisher are unchanged. The `Workspaces` changes affect only public
founding (`prepareCanonical`, `cleanIncarnation`), and the checks room is an
import. `adoptLegacyBase` ran only at public founding. `SnapshotRepos` is
used only for filtered checks, and this configuration checks the whole
tree. Through the deployment, possibly: the wipe left a brand-new container
application, which matches the first candidate cause.

**Reruns.** After run 1, the checks phase passed five times out of five.
Lane 4's `propose` took 2.2 to 7.1 seconds each time.

| Run | Deployed | Lane 4 propose |
|---|---|---|
| 2: checks only, 16:04 | `96ed4fc3` | 3.4 s |
| 3: full, 16:06 | `96ed4fc3` | 3.1 s |
| 4: full, 16:22 | merge `4a522bd6` | 2.5 s |
| 5: checks only, 16:27 | merge `4a522bd6` | 7.1 s |
| 6: checks only, 16:29 | merge `4a522bd6` | 2.2 s |

During runs 4 to 6, `wrangler tail artroom-spike-room` recorded 1,212
events: 1,203 `ok` and 9 `canceled`, with no exception.

**Pre-existing defect, outside this request:** pre-admission discards the
error it turns into this 503, so a failure like this one cannot be
diagnosed afterwards. Logging the error's name and a redacted message, or
returning a cause code, would have identified the step.

## Orphans retired (request 167a8ae6, 2026-10-02)

Hugh's decision (planner assert `5b65f3ae`): retire what D5 left in place.

**Listed first.** Before deleting, the account's Workers were listed
through the API (Workers Scripts Read token) and its container
applications with `wrangler containers list`. The `artroom-` Workers were
`artroom-spike-checkers`, `artroom-spike-isogit`, `artroom-spike-room` and
`artroom-spike-sandbox-git`. The applications were
`artroom-spike-room-publisher` (`3388b66b…`),
`artroom-spike-checkers-runnerbox` (`93863923…`),
`artroom-lb-logbig-publisher` (`9cf9349e…`) and
`artroom-spike-sandbox-git-gitbox` (`60795e20…`), all with 0 live
instances. The listing showed one resource the request did not name: the
`gitbox` application, created with the `artroom-spike-sandbox-git` Worker
on 2026-10-01. Deleting that Worker alone would have left it behind as
`artroom-lb-logbig` left its publisher, so the planner amended the request
to include it (assert `b92867a5`). Neither spike config under
`packages/room/` or `packages/checkers/` binds to any of the four.

| Deleted | What it was | Last version |
|---|---|---|
| Worker `artroom-spike-isogit` | the sandbox-git spike's isomorphic-git variant (`spikes/sandbox-git/wrangler.iso.jsonc`) | `31f0a19d-958d-4867-b2c2-3a8780961388`, 2026-10-01 |
| Worker `artroom-spike-sandbox-git` | the sandbox-git spike's container variant (`spikes/sandbox-git/wrangler.jsonc`) | `9fd42226-f212-4856-a867-6074b14c6506`, 2026-10-01 |
| Container application `artroom-spike-sandbox-git-gitbox` (`60795e20…`) | that Worker's `GitBox` container | — |
| Container application `artroom-lb-logbig-publisher` (`9cf9349e…`) | left by the deletion of `artroom-lb-logbig` | — |

Each Worker was deleted with `wrangler delete -c <its config> --force`
and each application with `wrangler containers delete <id>`.

**Verified after.** The Workers list now holds `artroom-spike-checkers`
and `artroom-spike-room` only, and the applications list
`artroom-spike-room-publisher` and `artroom-spike-checkers-runnerbox`
only. That is inventory preservation; the runtime check is separate.
The checker service has `workers_dev: false`, so no URL probes it, and
a root-path 404 from the Room's URL is only its route response. The
runtime evidence is the smoke's checks phase, run after the deletions
(`SPIKE_PHASE=checks`, 02:23 UTC, Room `59636ae9` as before): all 32
steps ok, including "the Room dispatched the job, and the checker's
signed check was admitted" (waited 10.4 seconds; the runner ran `npm ci`
and `npm test` and passed), the lane landed, the log was published and
`artroom verify` exit 0 through entry 15. Cleanup `ok`, 0 unresolved,
no repository left. Record:
[spike-smoke-2026-10-03T02-23-15-764Z.json](../packages/room/measure/results/spike-smoke-2026-10-03T02-23-15-764Z.json).
So both services answered, through the Room's own service binding, with
the four resources gone.

Two separate things happened on the account, and they are bounded
differently. The deletions removed the four resources named above and
nothing else: no other Worker, application, namespace, registry image or
token (condition (2) of request 167a8ae6). The verification run, as every
smoke run does, created one throwaway repository and its short-lived
tokens in the spike namespace `gitseq-spike-import` and removed all of
them before it ended (`cleanup ok`, `repositories left []`, `unresolved
0`); that fixture lifecycle is the agreed way to verify the spike at
runtime and is covered by the standing instruction for spike work
(planner amendment `42168fff` on request 167a8ae6). The before and after listings and the four
deletion receipts, with account identifiers reduced to Worker names,
created and modified times, are kept outside the repository for the
review at `/tmp/artroom-builder-orphans-f77ebf20/`.

The spike's source and results stay in the repository under
[`spikes/sandbox-git/`](../spikes/sandbox-git/) and
[`2026-10-01-spike-sandbox-git.md`](2026-10-01-spike-sandbox-git.md);
only the deployments are gone.

## Redeploy from the merge of main `3ac55e96` (plan 003)

Main's plan 003 changes lane B's landing code, which the Room Worker
bundles. So the spike was redeployed with `deploy-spike.sh` from the merge
head `4a522bd6`. No retry was needed, and the probe answered 404.

| Worker | Version ID |
|---|---|
| `artroom-spike-room` | `75758995-b37c-459c-89d1-0005f5d0163d` |
| `artroom-spike-checkers` | `37804f0a-cdd5-4f69-a9fa-27b328596e37` |

| Run | Result | Record |
|---|---|---|
| Full smoke | passed, exit 0; cleanup `ok`, 0 unresolved, nothing left | [spike-smoke-2026-10-02T16-22-10-598Z.json](../packages/room/measure/results/spike-smoke-2026-10-02T16-22-10-598Z.json) |
| Checks phase | passed, exit 0; cleanup `ok` | [spike-smoke-2026-10-02T16-27-36-022Z.json](../packages/room/measure/results/spike-smoke-2026-10-02T16-27-36-022Z.json) |
| Checks phase | passed, exit 0; cleanup `ok` | [spike-smoke-2026-10-02T16-29-50-841Z.json](../packages/room/measure/results/spike-smoke-2026-10-02T16-29-50-841Z.json) |

**Gates** at `4a522bd6`:

| Gate | Exit | Tests |
|---|---|---|
| root `npm run typecheck` | 0 | — |
| root `npm test` | 0 | checkers 43; cli 102; client 86 Node and 2 workerd; git 225; log 198 Node and 193 workerd; mcp 73 Node and 1 workerd; policy 199 Node and 198 workerd (1 skipped); room 125 Node and 380 workerd; ui 141 |
| git `npm run test:workers` | 0 | 10 |


## Idle write storms fixed (request 3da1d82b, 2026-10-02)

The Room change is described in
[packages/room/README.md](../packages/room/README.md), "Request 3da1d82b:
idle write storms". Rows were measured with `rows.mjs` from request
8bd623cc's branch (`request/row-writes`), run read-only from that
worktree with the analytics token. The reports are in
`packages/room/measure/results/rows-idle-*.json`.

**Before the fix**, on `artroom-spike-room` `75758995`:

- `wrangler tail` at 19:06 UTC: only `Room` alarm events. 17 objects,
  each alarmed every 5.0 seconds, every one `ok`, with no fetch or RPC
  events. These alarms are the "12 requests a minute".
- 19:00 to 19:30 UTC, no client: **6,289 rows written** (about 12,600 an
  hour), 1,661,040 read and 6,380 requests. 18 rooms wrote 355 to 377 rows
  each (12 a minute). The earlier hour, 17:50 to 18:50 with measured runs
  active, wrote 11,285.

**Deploy** of `request/idle-writes` `d8d0daa5` with
`packages/room/scripts/deploy-spike.sh` at about 19:35 UTC. No retry was
needed, and the probe answered 404. The same `ROOM_KEY_SECRET` and
`CHECKER_KEY` values were put again; no credential was created or rotated.

| Worker | Version ID | Replacing |
|---|---|---|
| `artroom-spike-room` | `065d3189-c6c6-46d6-b9bb-fdda44bfc6f7` | `75758995…` |
| `artroom-spike-checkers` | `d3677515-097e-40a8-83f2-10f4a9681372` | `37804f0a…` |

**The 18 older rooms were left as they were.** Every one is bound to a
repository that an earlier smoke run deleted. No Durable Object was
deleted: the fix does not need it, and their logs stay readable. On the new
code each one ran its alarm once or twice. The pending checkpoint cohort
failed with `NOT_FOUND`, the Room found the canonical repository gone,
recorded it, and attended its admins once. From 19:35 to 19:39:30 they
wrote 28 to 39 rows each, with 7 to 10 requests. That window includes
about 30 seconds of the old code's 5-second loop before the new version
took over. After 19:40 none of them appears in the billing data again.

**Live smoke**, all phases, `node packages/room/measure/spike-smoke.mjs`,
19:39:57 to 19:43:53 UTC: passed, exit 0, 91 of 91 steps ok. The public,
import and checks logs were published and verified (through entries 14, 8
and 15). Cleanup was `ok`, with 0 unresolved and no repository left.
Every token the run minted was revoked. Record:
[spike-smoke-2026-10-02T19-39-56-933Z.json](../packages/room/measure/results/spike-smoke-2026-10-02T19-39-56-933Z.json).
The run made three rooms (`2ade20c5…`, `836fd4cb…` and `48d4bf60…`, by
object). After the cleanup deleted their repositories, the public room
wrote its last 12 rows, with 1 request, in the sample from 19:43:57. That
was the publication of the cleanup's release, which found the repository
gone. All three rooms wrote 0 in every sample after that.

**After the fix**, the idle hours (the probe requests are two
`GET /v1/rooms/deploy-spike-probe` that I sent at 19:49 to check the tail):

| Window (UTC) | Rows written | Rows read | Requests | Notes |
|---|---|---|---|---|
| 19:44 to 20:44 | 493 | 4,755 | 3 | All 493 are in samples stamped 19:42 to 19:43: the smoke's checks room (443) and its public and import rooms (38 and 8). Cloudflare stamps a sample with the start of its interval, and `rows.mjs` reads from one minute before the window, so the smoke's last minute is counted |
| 19:47 to 20:47 | **0** | 2 | 2 | The two probes, in the Registry. No `Room` object wrote a row |

`rows.mjs` passed both windows against `HOURLY_BUDGET` (23,000 rows, and
2,100 for each object).

**Why the old rooms stopped.** On the old code a pending checkpoint cohort
was retried on the 5-second loop forever. On the new code a failing
publication backs off, and a `NOT_FOUND` for the canonical repository
stops publication and landing until a new entry is sealed. The rooms keep
their pending cohort, their owed cleanup and one open admin item
(`log-publication-stalled`, reason `repository-gone`).

**Alarm wall time.** Before the fix, each alarm of a room with a deleted
repository ran for about 5 seconds of wall time with a few milliseconds of
CPU. The two old rooms' alarms seen just after the deploy did the same
(5.1 and 5.3 s). The wait is outside the Room's code: the most likely
cause is the Artifacts binding's answer for a deleted repository. Workers
Logs could not be read to confirm it.

**Gates** at `d8d0daa5`, logs in `/private/tmp/claude-501/idle/`:

| Gate | Exit | Tests |
|---|---|---|
| room `npm run typecheck` | 0 | — |
| room `npm run test:node` | 0 | 138 |
| room `npm run test:workerd` | 0 | 411, of which 8 are this request's |
| root `npm ci` | 0 | — |
| root `npm run typecheck` | 0 | — |
| root `npm test` | 0 | checkers 43; cli 162; client 88 Node and 2 workerd; git 225; log 198 Node and 193 workerd; mcp 73 Node and 5 workerd; policy 199 Node and 198 workerd (1 skipped); room 138 Node and 411 workerd; ui 141 |
