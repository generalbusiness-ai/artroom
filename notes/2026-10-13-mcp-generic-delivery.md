# The generic MCP service: delivery

This note reports the build of plan 031, "One MCP service for every dap
application" (approved at `a8c6222f`, review `5eb60654`), on branch
`request/mcp-generic`. The branch started from `planner/mcp-generic-design`
with `main` merged in. Every figure below is labelled by how it was taken:
an observed run, a sum of steps, or a proxy.

## What was built

- **`packages/mcp`**, a new workspace package. It reads a room's
  definitions as data and derives one act tool for each act declaration,
  bound to the definition name, the native kind and the digest of the
  declaration. Same-name declarations that differ get variant tools named
  `<name>@<8 hex>`. Thirteen generic tools stand beside them: `room`,
  `inspect`, `create`, `prepare`, `items`, `steps`, `step`, `record`,
  `sends`, `text`, `wait`, `settle` and `credential`; `actions` and `act`
  are listed in the `--generic` and `--generic=add` modes. Descriptions and
  input schemas are derived from the whole declaration, at most 1,000
  characters, with a pointer to `inspect` with `describe` when guards are
  left out. Names come from a words table that maps names only.
- **Custody** of every signed envelope under the caller's
  `idempotencyKey`, kept on disk under the config directory before it is
  sent, with identity and meaning digests, the phases of plan 031
  section 7, preparation steps apart from the act, at most 256 unresolved
  records, 64 inline outcomes and a segment file for the rest, and
  append-only archives with an index.
- **Reads** with one read session per membership, and signed reads where a
  session is refused.
- **The wire**: JSON-RPC for the 2025-11-25 and 2026-07-28 revisions, over
  stdio and loopback HTTP, with the per-launch bearer, the `Origin` refusal
  and the loopback bind.
- **`artroom mcp`** in the command line, with `--generic`,
  `--generic=add`, `--tools`, `--http`, and `--scope` with `--membership`.
- **Eleven test files** in `packages/mcp/test`: `inventory`, `describe`,
  `errors`, `budget`, `custody` and `wire` in Node; `room`, `binding`,
  `discovery`, `unfamiliar` and `counter` as stories on the real test
  Worker. Each states its invariant in its first comment.
- **`docs/mcp.md`**, with `docs/mcp-tools.json`, the whole list as sent to
  an admin of the demo room, which a test derives again and compares.
- **`scripts/active-source.test.mjs`** now refuses an import in the
  server's source of anything but the contract, the bytes, the client, the
  platform and the derivation, and lets the server's tests name the lanes
  package as the page's do.

## The SDK choice

The server is a minimal JSON-RPC handler, as plan 031 section 7 allows,
because no pinned SDK version serves both revisions as the plan requires.
`@modelcontextprotocol/server` 2.3.1 serves the 2025-era revision only
statelessly, with no session header and no `GET` stream.
`@modelcontextprotocol/sdk` 1.32.1 has no 2026-07-28 support. The handler
implements each revision's required method set: for 2025-11-25,
`initialize`, `ping`, `tools/list`, `tools/call`, the session header, `GET`,
`DELETE` and the notifications; for 2026-07-28, `server/discover`,
`tools/list`, `tools/call`, `subscriptions/listen`, the per-request `_meta`
and `resultType`.

The wire tests drive the server through a real client,
`@modelcontextprotocol/client` 2.3.1, pinned as a development dependency:
over loopback HTTP and over stdio through `artroom mcp`, once speaking
2025-11-25 (its default) and once pinned to 2026-07-28.

## Dependencies

All pinned exactly in `packages/mcp/package.json`, with the root lockfile
in the same commit as the code that imports them. Runtime: the contract,
bytes, client and platform packages. Development: the derivation, lanes and
scope packages, `@modelcontextprotocol/client` 2.3.1, `gpt-tokenizer`
3.4.0 (the token counter of the budget test), `vitest` 4.1.11,
`@cloudflare/vitest-pool-workers` 0.22.0, `@cloudflare/workers-types`
5.20260815.1 and `@types/node` 26.6.3. The command line depends on the
server. The lockfile was written by `npx -y npm@12.2.0 install`, run from
the checkout's root, which made additions only; npm 10 and 11 rewrote
unrelated `libc` fields, so they were not used.

## What ran

In this session, each after its last change:

| Command | Result |
|---|---|
| `npx vitest run --project mcp` | `Test Files  6 passed (6)`, `Tests  34 passed (34)` |
| `npx vitest run --project scope packages/mcp/test --reporter=verbose` | `Test Files  5 passed (5)`, `Tests  6 passed (6)` |
| `npx vitest run --project scope packages/mcp/test/counter` (after its last change) | `Tests  1 passed (1)` |
| `npm run typecheck` in `packages/mcp` | no errors |
| `node --test scripts/active-source.test.mjs` | `# pass 7`, `# fail 0` |
| `npm run gate`, once, at `1aebbeee` | FAILED at the test step: `Tests  4 failed \| 1075 passed \| 2 skipped (1081)`, `Test Files  2 failed \| 193 passed \| 1 skipped (196)`. Install, whitespace and typecheck passed. The four failures are the checkers failure below. Because `vitest run` failed, `npm test` did not go on to its `node --test` steps; `scripts/active-source.test.mjs` passed when run alone, above. |

## Observed figures

### The list, per role

Observed run of `packages/mcp/test/budget.test.ts`, on the stand-in scope
service. Bytes are the canonical JSON of each `tools/list` result as sent.
Tokens are a proxy: gpt-tokenizer 3.4.0 with the `o200k_base` encoding. An
agent host's own tokenizer gives other counts.

| Room and role | Tools | Pages | Bytes | Tokens |
|---|---|---|---|---|
| Demo room, admin | 70 | 1 | 143892 | 37127 |
| Demo room, maintainer | 56 | 1 | 111976 | 28989 |
| Demo room, member | 53 | 1 | 105401 | 27241 |
| Demo room, agent | 51 | 1 | 99635 | 25804 |
| Full lane definitions (`issue`, `change`, `change3`), admin | 157 | 2 | 336518 | 88391 |
| Demo room, admin, `--generic` | 15 | 1 | 13075 | 3073 |

The demo room is the six platform scopes on the default cohort, one lane
under `issue-demo` and one under `change-demo`. No single descriptor
exceeds a page.

### Reads per tool

Observed run of `packages/mcp/test/budget.test.ts`. The stand-in counts
every request the server makes. Warm calls hold a read session; each cold
call made exactly one session request more. Warm reads: `room` 3,
`inspect` 1, `inspect` with `describe` 1, with `declaration` 2, `items`,
`steps`, `step`, `record`, `sends`, `text`, one poll of `wait` and
`settle` 1 each, `actions` 1, `issue.comment` 1 read and 1 post,
`issue.create` 2 reads (the definition's bytes from the rules scope) and 1
post, `create` 0 reads and 1 post, `tools/list` 3. `credential` read 3:
the act's entry, the next entry with the operation's outcome, and the
credential route. Plan 031 section 8 counts 1 for it; the extra reads find
the handle, which the outcome entry carries.

Also observed in that run: an ended session cost one new session request;
a refused session one request and then signed reads, with the refusal
remembered for a minute; a session refused on a read one signed-read
fallback. A room with two standalone roots, one under a second membership:
`room` warm 6 reads, cold 2 session requests. A 64 KiB live item was served
alone and whole on its page; a continuation across a head move restarted
and said so; a 200 KiB retained text was read whole in 4 calls; with a
2 KiB list page, every descriptor larger than the page was alone on its
page and all 70 tools were reachable; 70 resubmissions of a refused
envelope kept all 70 outcomes readable, each costing 1 read and 1 post; a
subscribed client was told 2 times for an activation and a role change and
0 times for a head advance, and each watch run read 3 summaries.

### The room story

Observed run of `packages/mcp/test/room.scope.test.ts` on the real test
Worker:

| Mode | List changes told, founder | of them while founding | List changes told, second member | Requests, founder | Requests, second member |
|---|---|---|---|---|---|
| Default | 7 | 3 | 4 | 200 | 278 |
| `--generic` | 7 | 3 | 4 | 212 | 273 |

In the same story, a capability step of `hold@1` (stage, then check) at a
foreign resource, and the hand-in after it, were answered `refused`,
`capability-refused`, `not-staged` by the real Worker. The story asserts
that answer and that the act's phase stays prepared. The retry of a lost
first-entry step is shown only against scripted answers, in
`custody.test.ts`.

### Call counts per activity

A sum of steps: `docs/mcp.md`, "The W1 inventory", gives every command of
`docs/cli.md` and every page action of `docs/page.md` in the default,
`--generic` and `--generic=add` modes with its count. Opening an issue is 2
calls in the default mode (`issue.create`, `wait`) and 3 in `--generic`
(`actions`, `act`, `wait`); a clone is 3 calls and Git.

## The T36 checkers failure in the cloud

It recurred. In the gate's run, four tests of `packages/checkers` failed
with `checkout-failed`: T36 in `test/runner.test.ts`, the two other
checkout tests there, and the staging test in
`test/reservation-record.test.ts`. This branch changes nothing in
`packages/checkers` or `packages/git`.

The cause, reproduced by hand in a scratch directory: the container's Git
is 2.43.0, which refuses the runner's
`git checkout -q --detach --end-of-options <commit> --` with
`fatal: only one reference expected, 2 given.` The runner reads that exit
code as `checkout-failed`. The failures are the same with the global Git
configuration set aside (`GIT_CONFIG_GLOBAL=/dev/null`), so the container's
signing and proxy settings are not the cause. A Git that accepts
`--end-of-options` before a revision in `checkout` passes them; the fix,
in the runner or in the cloud image's Git, is not this delivery's.

## What is owed

- **The hosted endpoint** of plan 031's stage 2: a remote MCP endpoint
  with a bearer per agent, a session store for the 2025-11-25 revision, and
  each bearer's sessions and subscriptions kept apart. Nothing of it is
  built.
- **The optional amendment of `docs/cli.md`**, naming `artroom mcp` in its
  list of commands and pointing at `docs/mcp.md`. The usage line is in the
  command line; the guide is not amended.
- **A joiner's configuration.** `room.join` through the server needs a
  configuration that names the room and pins its membership. `artroom mcp`
  reads no pins from the config directory, and no command writes them
  without joining, so a member joins with `artroom join` before serving.
- **`credential`'s reads**: 3 where plan 031 counts 1, as reported above.
- **No gitseq request** was recorded from this session: no gitseq tool was
  available in the cloud container. The requester records one for this
  head.
