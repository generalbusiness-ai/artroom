# MCP stage 0: the endpoint is served

Request 8ae3b2dc, stage 0 of the MCP plan (`notes/2026-10-01-mcp-plan.md`
on `request/mcp-plan`, section 12), for Gate 1. On 2026-10-02 the spike
Room Worker started serving lane E's MCP server at `/v1/rooms/:room/mcp`.
A scripted client and a cold Claude Code agent each claimed, proposed and
landed a change through it.

**Endpoint:** `https://artroom-spike-room.inguz.workers.dev/v1/rooms/<room>/mcp`

The Worker is left running (version `2092006a-d2dd-45e0-9dff-26c8c477f09c`,
deployed from `70097fe0`).

## What was built

| Item | Where | What it does |
|---|---|---|
| Worker route | `packages/room/src/worker.ts` | The Worker sends every method on `/v1/rooms/:room/mcp` to the MCP handler before the router. Other paths, including `/mcp/x` and `/mcpx`, still reach the router. |
| `RoomApi`-per-bearer adapter | `packages/room/src/mcp.ts` | The item amendment 2 left without an owner (protocol section 27, "Integration"). It is lane E's client, connected as a bearer session to the Worker's own `RoomWire`. Acts go to `bearerAct` and workspace requests to `bearerRequest`. Reads and `subscribe` carry the token. A missing, unknown, expired or revoked token gets 401 before any tool runs. An unknown room gets a 404 `ArtroomError`, and a malformed room segment gets 400. |
| Advertised `outputSchema` | `packages/mcp/src/tools.ts`, `server.ts` | `tools/list` sends each tool's `outputSchema`. Every root is `type: "object"`. The eight tools that can refuse have `oneOf` their result and `Refusal`, so a refusal's structured content conforms. |
| Instructions | `packages/mcp/src/tools.ts` | 378 characters, under the limit of 512. They stand alone and name `attention` first and the refusal fix. |
| Legacy stateless mode | `packages/mcp/src/worker.ts` | `legacy: "stateless"` is set explicitly. 2025-era clients are served statelessly, and GET and DELETE get 405. |
| Live harness | `packages/room/measure/mcp-stage0.mjs` | Founds a room, drives it through the endpoint, and with `--claude` runs a cold Claude Code agent. Then it cleans up by the shared rules of `measure/cleanup.mjs` (see "Review 66fec276"). |

To deploy the endpoint with the fixes that are live on the spike, this
branch first merged `request/founding-gaps` at `d8312c32`. That branch
brings the deploy script and the first land on an empty repository. The
spike already ran it, and `request/mcp-stage0` would otherwise have rolled
it back. Revision 2 replaces that merge with founding revision 2 and main
`9d0d0cbd` (see "Review 66fec276").

### Two choices to check against the request

- **Titles and annotations are not added.** Section 12 of the plan lists
  them for stage 0. The request says they "wait for the MCP amendment's
  item 2", and this branch follows the request.
- **`attention` and `explain` advertise their result schema without
  `Refusal`.** The request says "each tool's outputSchema as
  oneOf(result, Refusal)". These two tools are reads that never refuse.
  The MCP amendment's R-API-13 (`request/mcp-amendment`) applies `oneOf`
  only to act tools and `workspace`. Both roots are objects, so every
  result still conforms. Adding `Refusal` to these two is a one-line
  change if checker wants the literal reading.

### Compatible with the MCP amendment (stage 1)

- The adapter returns the full `Room` handle: every `RoomApi` method and
  `subscribe`. A test reads `lanes`, `lane`, `proposal`, `op`, `wait` and
  `subscribe` through it with the bearer token. These are the reads the
  amendment's "MCP endpoint's deployment" edit asks for. Stage 1 adds tools
  and changes nothing in the Room.
- The descriptors keep the contract's `McpToolDescriptor` shape, and
  `outputSchema` stays on the descriptor, as R-API-13 has it. Stage 1 adds
  `title`, `annotations` and `toolsets` beside it.

## How an agent connects

An admin invites a member with `custody: "room"`, a role and `session`
kinds, for example
`{ "kinds": ["claim","propose","note","land","release","renew"], "lanes": "*", "ttlSeconds": 3600 }`.
The agent's operator redeems the invitation with
`POST /v1/rooms/<room>/redeem`. The body is
`{ "custody": "room", "invitation": "<id>", "secret": "<secret>" }`. The
response is `Redeemed`. It carries the bearer token, shown once, and `mcp`,
the endpoint URL.

For Claude Code, this is the exact config file the cold-agent run used. It
holds no secret: Claude Code reads the token from the environment.

```json
{
  "mcpServers": {
    "artroom": {
      "type": "http",
      "url": "https://artroom-spike-room.inguz.workers.dev/v1/rooms/<room>/mcp",
      "headers": { "Authorization": "Bearer ${ARTROOM_BEARER}" }
    }
  }
}
```

```sh
ARTROOM_BEARER=<bearer from Redeemed> claude --mcp-config artroom.json
```

Any other client sends `Authorization: Bearer <token>` on every POST to the
URL. It can speak MCP 2026-07-28 or the 2025 Streamable HTTP format; the
server needs no session. Never commit the token.

## The live runs

Both runs are on the spike, with the official MCP client
(`@modelcontextprotocol/client` 2.0.0). The redacted results are in
`packages/room/measure/results/`.

| Run | Result file | Outcome |
|---|---|---|
| Scripted drive | `mcp-stage0-2026-10-02T03-59-42-473Z.json` | All steps pass in 14.5 s |
| Scripted drive and the cold agent | `mcp-stage0-2026-10-02T04-00-07-005Z.json` | All steps pass in 68 s |

The scripted drive takes these steps, in order:

1. Found a public room, which creates its repository in `gitseq-spike`.
2. Check the route guards: no bearer gets 401 with `WWW-Authenticate:
   Bearer realm="artroom"`, and an unknown bearer gets 401 with
   `error="invalid_token"`.
3. Redeem a room-custody agent, `@mcp-driver`.
4. Connect in legacy mode, as Codex and pi do. The client negotiated
   `2025-11-25` and listed 10 tools, each with an object-rooted output
   schema.
5. Connect pinned to `2026-07-28`, with 378 characters of instructions,
   and list the tools.
6. Claim. The record's authority is `via: "delegation"` with the redeemed
   delegation. A retry with the same `idempotencyKey` returns the same act.
7. Call `workspace`. It returned a ready workspace with a grant in about
   2 s. Clone the fork, commit a one-line file, and push with
   `http.extraHeader`.
8. Propose: generation 1, with no obligations.
9. Propose again on generation 0. The refusal `generation-moved` came back
   as structured content. The MCP client validated it against the
   advertised `oneOf` and accepted it.
10. Land with `waitMs: 45000`. The landing reached `landed` within the
    call, in 1.4 to 1.7 s.
11. Call `attention` with the earlier cursor. It returned "Landing
    op_land_8 is landed."
12. Explain the land act, then release.
13. Clean up. Revoking each agent's key makes its bearer get 401, which
    was checked. Every repository (the canonical one and the lane forks) is
    deleted, with 0 active tokens left. The harness's own read tokens are
    revoked after each use. No test repository is left.

### The cold agent on Claude Code

`claude -p` (Claude Code 2.1.287, model `claude-opus-5-5`) ran in an empty
directory. It had only the config above, `--strict-mcp-config`, user
settings off (`--setting-sources project,local`), and this task:

> You are connected to an Artroom room through the MCP server named
> artroom. Claim a lane, make a one-line change to the repository (add a
> file named claude/hello.md containing one line of your choice), propose
> it, and land it. Use plain git in this directory for cloning and pushing,
> as the artroom tools describe. Finish by releasing the lane, then report
> what you did in two sentences.

The transcript is in
`packages/room/measure/results/mcp-stage0-claude-2026-10-02T04-00-07-005Z.jsonl`,
redacted.

| Measure | Value |
|---|---|
| Outcome | Landed. `main` became `5e5b699a`, the agent's commit, on top of the scripted drive's |
| Time | 51.6 s |
| Turns | 17 |
| Cost | $0.27; 4,043 output tokens |
| Artroom calls | `attention`, `claim`, `workspace`, `propose`, `land` (`waitMs: 60000`), `release`; all in order, once each |
| Refusals | 0 |
| Tool errors | 2. Both were Claude Code's own permission checks on compound Bash commands, not Artroom. The agent then split the commands. |

The agent called `attention` first, as the instructions say. It found the
push command in the `workspace` description. It kept the token out of its
output (`grep -v -F "$TOKEN"`), passed idempotency keys, and wrote a
handover note on release. It needed no guide beyond the tool descriptions
and the instructions.

One step in that result file is uninformative. "The cold agent's lanes,
read with its bearer" lists no lanes, because the default lane listing does
not include a released lane. The landing is shown instead by `main`
(`5e5b699a`) and the agent's own receipts in the transcript. Revision 2
removes that step from the harness.

## Tests and gates

New tests:
- `packages/mcp/test/stage0.test.ts` (7 tests): the instructions; the
  shapes of the advertised schemas; and the official MCP client, pinned to
  2026-07-28 and in legacy mode. The client validates results and refusals
  against the advertised schemas.
- `packages/room/test/workerd/mcp.test.ts` (10 tests, in workerd against
  the real Room Durable Object):
  - the guards: 401 with no bearer, an unknown bearer, or another room's
    bearer; 401 after revocation; 404 for an unknown room; 400 for a bad
    room segment; lookup by room name; the router's 404 for other paths;
    405 for GET;
  - the loop through the tools, signed under the delegation, with an
    idempotent retry;
  - a kind the delegation does not grant, refused as a value;
  - the stage 1 reads through the adapter;
  - the official MCP client in both modes against the Worker.
- `packages/room/test/workerd/http.test.ts`: POST `/mcp` without a bearer
  is now 401, not 404.

The Room typechecks against declarations generated from lane E's client
and MCP packages, as it already does for lane L's log, because those
packages assume the DOM library.

Gates at the final head:
- root `npm run typecheck`: exit 0;
- root `npm test`: exit 0. Every workspace passes. The Room's workerd
  suite has 20 files and 295 tests, and the MCP package has 73 Node tests
  and 1 workerd test;
- `wrangler deploy --dry-run` passes for both `wrangler.jsonc` and
  `wrangler.spike.jsonc`. The bundle is 1,532 KiB, 335 KiB gzipped.

### Mutations

Each mutant changed one committed file. The targeted suites ran against
it, and then the file was restored. The suites were the Room's workerd
`mcp` and `http` tests, and the MCP package's Node and workerd tests.

| Mutant | Result |
|---|---|
| A1 adapter: every failure becomes "unknown token" | killed |
| A2 adapter: an unknown token is thrown, not null | killed |
| A3 adapter: the room segment is not decoded | killed |
| A4 adapter: bad percent-encoding is not caught | killed |
| A5 endpoint: failures escape the handler | killed |
| A6 adapter: the wire ignores the room in the URL | killed |
| R1 route: the Worker does not intercept `/mcp` | killed |
| R2 route: the route pattern is unanchored | survived at first. The handler's own anchored check answered 404 too. Killed after the test checked that `/mcp/x` and `/mcpx` get the router's `ArtroomError` (`ff9e00de`) |
| R3 route: a missing bearer is treated as an empty token | killed |
| R4 route: a null room handle is served | killed |
| R5 route: legacy mode rejected | killed |
| S1 schema: `outputSchema` not advertised | killed |
| S2 schema: the `Refusal` form dropped | killed (the MCP client rejects the refusal) |
| S3 schema: the root not an object (the legacy client gets `{ result }`) | killed |
| S4 instructions over 512 characters | killed |

## What was not done

- Titles and annotations, as the request defers them (see above).
- A conformance suite for 2026-07-28 (plan section 13, item 1). The
  official client in both modes is the only check.
- Cold-agent runs on Codex and pi (stage 1).
- `allowedHostnames` for a custom domain. On `workers.dev` the Agents SDK
  checks the Host header itself. A deployment on its own domain should pass
  the `PUBLIC_URL` host.
- Each MCP request reads the log's first entry once, to bind the handle to
  the room's genesis (R-ID-3). The handle is not disposed. Over the
  Worker's own `RoomWire` that releases nothing, but stage 1 may want to
  cache it.
- `waitMs` still allows up to 300,000 ms. The cold agent used 60,000.
  Stage 1 caps it at 45,000 (R-API-15).
- The room this run founded stays in the registry, as the smoke runs'
  rooms do. Its repositories are deleted.

## Review 66fec276

checker's review of `6abe1ce8` credited the endpoint and requested two
changes.

### P2: the harness could report a clean run with resources left

The finding was right. The old cleanup had four faults:

- It read a refused, thrown or malformed inventory as empty.
- It ignored `cleanup.error` and each revocation's and deletion's own
  result.
- An exception while ending one agent's session stopped the rest of the
  cleanup.
- Its `ok` looked only at `reposLeft` and the agents.

checker's seven controls ran the real cleanup against a fake API. Five of
them exited 0 with the canonical repository or a write token still
present.

The fix reuses deploy V3's reviewed rules (reviews 1b868265 and 2485e992)
instead of a second set:

- **One shared module.** `packages/room/measure/cleanup.mjs` holds
  `outcomeOf`, `isRepoRecord`, `isTokenRecord`, `readListing`, `cleanupRun`
  and `smokeOk`. They are moved byte for byte out of `spike-smoke.mjs`,
  which imports them and re-exports them for its own tests.
  `cleanup.d.mts` holds the types.
- **Identities kept before effects.** The harness records the canonical
  repository at draft, before `found` creates it. It records each agent
  before its invitation, with its redemption state. It keeps each token it
  mints until it sees the revocation succeed. It records each fork from the
  workspace grant, and the cold agent's forks from its transcript.
- **Every duty attempted and recorded.** `cleanupMcp` ends each agent's
  bearer session on its own. It revokes the key and checks that the bearer
  is then refused. An exception for one agent is an `unknown` duty, and
  the other agents and the Artifacts cleanup still run.
  - A refused redemption has no session.
  - A redemption whose answer was lost stays unresolved, because its key
    is unknown.

  Then `cleanupRun` revokes the minted tokens and inventories the
  repositories. It still cleans the repositories the run knows it made
  when an inventory is refused, unknown, incomplete or malformed. It then
  inventories again.
- **Nonzero exit on anything unresolved.** `finishRun` is the harness's
  finalizer. It records every duty and its outcome, and treats a cleanup
  that throws as failed. It exits 0 only when all of these hold:
  - the drive finished;
  - every step passed;
  - every duty is `done`;
  - the final inventory proves that no repository is left.

The main block runs only when the file is executed, so the tests import
the real `cleanupMcp`, `sessionEnder` and `finishRun`.

`packages/room/test/node/mcp-stage0.test.ts` has 16 tests, all against a
fake Artifacts API. The checker's seven controls, with the exit code each
now gives:

| Control | Exit | What is recorded |
|---|---|---|
| clean | 0 | every token revoked, both repositories deleted, `reposLeft: []` |
| inventory refused | 1 | `reposLeft: null`; the known repositories are still revoked and deleted |
| cleanup threw | 1 | every duty `unknown`; every known repository still attempted |
| malformed inventory `[{}]` | 1 | `reposLeft: null`; the known repositories are still deleted |
| revoke refused | 1 | the token IDs are unresolved, even though the repositories were deleted |
| delete refused, final inventory known | 1 | both repositories named in `reposLeft` |
| delete refused, final inventory unknown | 1 | `reposLeft: null`, not empty |

The other nine tests cover these cases:
- sessions ended with clean Artifacts (exit 0);
- an exception ending one agent's session, while the later agents and the
  Artifacts cleanup still run;
- a bearer still answered after its key was revoked;
- a failed step, a drive that threw, or no steps;
- a cleanup that throws outside any duty;
- a minted token that is revoked late, or whose revocation is refused;
- `sessionEnder`'s outcomes, including a lost redemption;
- a deletion answered as success while the repository is still listed;
- an exception inside the Artifacts cleanup that no duty catches.

The recorded live runs used the old harness. Their cleanup records show
every repository deleted and every bearer refused afterwards. The old
finalizer, though, would not have caught a failure. No live run was
repeated, as the coordinator asked.

#### Cleanup mutations

The mutants ran after the commit `826479dd`. Each mutant changed one
committed file and ran `test/node/mcp-stage0.test.ts` and
`test/node/spike-smoke.test.ts`, and then the file was restored.

| Mutant | Result |
|---|---|
| C1 an exception for one agent aborts cleanup | killed |
| C2 `cleanupMcp`'s `ok` ignores unresolved session duties | killed |
| C3 `cleanupMcp`'s `ok` ignores the Artifacts outcome | survived at first; killed by the test where a repository is still listed after a claimed deletion (`90ad465e`) |
| C4 a throwing Artifacts cleanup counts as ok | survived at first; killed by the test with an exception outside any duty (`90ad465e`) |
| C5 a throwing cleanup is ok in `finishRun` | killed |
| C6 `finishRun` always exits 0 | killed |
| C7 `finishRun`'s `ok` looks at cleanup only | killed |
| C8 a live bearer counts as ended | killed |
| C9 a lost redemption counts as done | killed |
| C10 a refused key revocation counts as done | killed |
| C11 shared: records need no usable identity | killed |
| C12 shared: without an inventory, known repositories are not cleaned | killed |
| C13 shared: an unknown final inventory reads as empty | killed |
| C14 shared: an answer without `success` counts as done | killed |
| C15 shared: a refused listing is treated as empty | killed |
| C16 shared: a remote exception escapes its duty | killed |
| C17 shared: `ok` ignores a non-empty `reposLeft` | killed |

Not covered by the Node tests: the live calls themselves. These are
`mint` recording a token, `revoke` dropping it, `agent` recording itself
before the invitation, and fork recording. They run only against the
deployed spike, and no live run was made for this revision.

### The founding blockers

The branch carried founding `d8312c32`, which review a35b4b61 sent back.
Revision 2 merges `request/founding-gaps` at `a5185fa6` (founding revision
2, now in review) as `fb4335a0`, and then main `9d0d0cbd` as the next
merge commit. Founding revision 2 already contains deploy V3 (`97f42684`)
and main `b5864882`, the bounded-memory log publisher. So the merge of
main had no conflict, and `measure/spike-smoke.mjs` is founding revision
2's version. The cleanup rules then moved out of `spike-smoke.mjs` into
`cleanup.mjs` unchanged, and `spike-smoke.mjs`'s own 17 tests still pass.

The source of this revision needs review as a combined head. The founding
code is founding revision 2's. The MCP route and adapter are unchanged
from `6abe1ce8`.

### Not redeployed

The spike was not redeployed for this revision, as the coordinator asked.
The running Worker (`2092006a`) is still the one built from `70097fe0`,
with founding `d8312c32`. The coordinator will redeploy once from main
after these land.

### Gates for revision 2

The gates ran at `90ad465e`. The only commit after it adds this note.

- Root `npm run typecheck`: exit 0.
- Root `npm test`: exit 0. Every workspace passes, with 1,522 tests passed and 1 existing skip.
  - The Room's Node suite has 11 files and 104 tests, including the 16 new
    ones in `mcp-stage0.test.ts` and the 17 in `spike-smoke.test.ts`.
  - The Room's workerd suite has 21 files and 298 tests, with the
    bounded-memory log tests from main.
  - The MCP package has 73 Node tests and 1 workerd test.
- `wrangler deploy --dry-run` passes for both `wrangler.jsonc` and
  `wrangler.spike.jsonc`: 1,553.78 KiB, 340.78 KiB gzipped. The bundle
  grew 22 KiB from founding revision 2 and the bounded-memory publisher.


## Founding revision 4.2 merged

At the coordinator's request, this branch merges `request/founding-gaps`
at `f493953a` (founding revision 4.2, still in review) on top of revision
2 (`a81f8a05`). It also brings main `9bb700b6`.

- **The conflict.** Founding revision 4.2 changed the cleanup rules inside
  `measure/spike-smoke.mjs`: `incarnationOf`, and `cleanupRun`'s
  `incarnations` option. Revision 2 had moved those rules out of that file
  into `measure/cleanup.mjs`. The resolution keeps founding's
  `spike-smoke.mjs` and moves its cleanup section, byte for byte, into
  `cleanup.mjs`. The only change is that `REPO_PAGE` and `TOKEN_PAGE` are
  now exported, because `spike-smoke.mjs` imports them for its
  incarnation lookup. `spike-smoke.mjs` imports and re-exports the rules,
  and its tests run unchanged.
- **Incarnations in the MCP harness.** Since founding revision 3, a public
  room's repository is an incarnation `<base>-<step>` of its identity, not
  the base name. `mcp-stage0.mjs` now handles it the same way
  `spike-smoke.mjs` does:
  - it keeps the base at draft, before `found`;
  - it finds the room's repository with `incarnationOf` after founding,
    and reads `main` from it;
  - it cleans up with `incarnations: true`. That covers the base name,
    every incarnation and every fork. The incarnation and the known forks
    are the expected repositories when an inventory fails.

  The cold-agent transcript tooling names no canonical repository. It
  collects fork names from the remotes in the transcript, and those are
  already `<incarnation>--<lane>`.

  A new test, with a fake API, deletes the base, both incarnations and a
  fork, and leaves names that only look alike (`<base>x`, `<base>-1x`,
  `<base>-x`). It also shows that without `incarnations` only the base
  name would be cleaned.
- **The MCP route** in `src/worker.ts` and `src/mcp.ts` is unchanged by
  the merge. The Room's workerd MCP tests run in the root gates, and the
  spike dry build bundles the route.

No deploy and no live calls were made.
