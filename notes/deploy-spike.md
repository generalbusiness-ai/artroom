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

The script:

1. checks that the env file exists and is mode 600;
2. reads only `ROOM_KEY_SECRET` from it (the file is not sourced);
3. runs `wrangler whoami` with hugh's OAuth login
   (`env -u CLOUDFLARE_API_TOKEN npx -y wrangler@latest`);
4. puts the secret with `wrangler secret put ROOM_KEY_SECRET`, on stdin;
5. deploys `wrangler.spike.jsonc`, retrying once if the deploy fails;
6. checks that `GET /v1/rooms/deploy-spike-probe` answers 404 from the
   Room's router.

It prints no secret. Use the same `ROOM_KEY_SECRET` on every deploy: it
derives each room's key and each public repository's identity, so a new
value would orphan existing rooms.

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

There is no client or CLI package on main yet (lane E), so the script drives
the Room's HTTPS API directly. It signs envelopes and requests with the
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
4. **No client on main.** Lane E's client, CLI and MCP are not on main, so
   the smoke run is a script over the HTTPS API. `artroom verify` is lane
   L's CLI, which is on main.
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
