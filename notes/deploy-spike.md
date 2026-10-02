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

1. **A room founded with `{ kind: "new" }` cannot land its first lane.** The
   Room creates an empty repository. Claim, workspace, push, propose and the
   preview all work. `land` then fails with 503 `unavailable`, "The
   repository could not be read. … retry with the same idempotency key."
   Retrying does not help: lane B's landing needs a known main
   (`readMainVia` throws "main is missing", and `LandingCore.accept`
   requires main). The smoke run seeded main out of band. Either founding
   should give a new repository an initial commit, or the landing should
   accept an absent main, pushing with a lease on an absent ref. At least
   the error should not say "retry".
2. **Founding leaves a 24-hour write token on the canonical repository.** At
   cleanup, each run's canonical repository had one active token. The
   second run recorded it: scope `write`, created at 02:49:39.234, during
   `found` (the genesis is sealed at 02:49:39.886), expiring 24 hours later.
   It is very likely the token Artifacts returns when a repository is
   created. The Room's `createRepo` ignores the answer and never revokes it. Lane B's `Workspaces`
   handles the same case for forks by an inventory that revokes every
   token; the canonical repository needs the same, right after creation.
3. **A deployment can found publicly or import, not both.** It has one
   Artifacts binding. If `PUBLIC_NAMESPACE` is that namespace, a grant for a
   repository in it is refused ("A grant cannot name a repository in the
   public founding namespace"). If `PUBLIC_NAMESPACE` is another namespace,
   public founding binds the name in the registry and then fails at step 6
   with `unavailable`, for good. This spike keeps production's shape
   (`PUBLIC_NAMESPACE` = `ARTIFACTS_NAMESPACE`), so public founding works and
   imports cannot.
4. **No client on main.** Lane E's client, CLI and MCP are not on main, so
   the smoke run is a script over the HTTPS API. `artroom verify` is lane
   L's CLI, which is on main.
5. **The first deploy needed a retry** for the container application (see
   "Deploy and redeploy").

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
