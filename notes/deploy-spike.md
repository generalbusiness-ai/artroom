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
