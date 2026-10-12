# The generic MCP service: delivery

This note reports the build of plan 031, "One MCP service for every dap
application" (approved at `a8c6222f`, review `5eb60654`), on branch
`request/mcp-generic`, and the corrections that review `de37ae90` of head
`2db9160b` asked for. The branch started from `planner/mcp-generic-design`,
and `main` was merged in twice, the second time with main's Empty-room,
wordmark, Home and forms heads in `packages/page`, whose bytes stay main's.
Every figure below is labelled by how it was taken: an observed run, a sum
of steps, or a proxy.

## What was built

- **`packages/mcp`**, a new workspace package. It reads a room's
  definitions as data and derives one act tool for each act declaration.
  A tool is bound to the definition name, the native kind and the digest
  of the declaration, which covers everything its text renders: the act,
  the item types it names, the bodies of the rules it names, the
  definition's profile, and for a platform pin its marks' texts.
  Declarations that share a name and differ get variant tools named
  `<name>@<8 hex>`. Fourteen generic tools stand beside them: `room`,
  `inspect`, `create`, `join`, `prepare`, `items`, `steps`, `step`,
  `record`, `sends`, `text`, `wait`, `settle` and `credential`; `actions`
  and `act` are listed in the `--generic` and `--generic=add` modes.
  Descriptions and input schemas are derived from the whole declaration,
  at most 1,000 characters, with a pointer to `inspect` with `describe`
  when guards are left out. Presented facts are closed properties of the
  input schema. A tool whose standing is unknown on some of its
  memberships says so and is never said to be held. Names come from a
  words table that maps names only.
- **Custody** of every signed envelope under the caller's
  `idempotencyKey`, on disk under the config directory before it is sent.
  The outcome given is always the newest decisive one of the current
  attempt. Accepted and mismatch are never sent again; a resubmitted
  refusal is first kept as a new unresolved attempt. At most 256 records
  are unresolved, admitted under a lease shared by every process of the
  directory; a record is at most 2 MiB, and an act that would not fit is
  refused before it is signed; outcomes past 64, or past the byte bound,
  move to a segment file read in bounded slices. Archival is one
  transaction under an archive lease. A lock or lease is broken only when
  its process is gone. A step keeps its first answer and its latest 63.
- **Reads** with one read session per membership, and signed reads where a
  session is refused.
- **Whole-response budgets.** Each result is measured as the client
  receives it, text and structured content together; the text repeats the
  JSON only when that fits. `room` pages all its collections by bytes. The
  searches of `wait` and `credential` keep their position and read at most
  16 entries, or 4 pages, a call.
- **The wire**: JSON-RPC for the 2025-11-25 and 2026-07-28 revisions, over
  stdio and loopback HTTP, with the per-launch bearer, the `Origin` refusal
  and the loopback bind. A body or a line is read within 4 MiB and decoded
  once as UTF-8; a frame is checked before its revision is read; invalid
  frames get bounded JSON-RPC errors; failures of one request are contained.
  Listen subscriptions belong to the client stream they were opened on.
- **Joining through the server alone.** The generic tool `join` takes the
  link `artroom invite` prints. It works from an empty config directory:
  `artroom mcp` makes and keeps the key as `artroom join` does, and serves
  with no service until the first join names one. `join` signs
  membership's `join` with the server's key and keeps the exact request
  under custody, in the config directory's private custody store, before
  sending it. After a lost reply, the same link and key send the same
  request again; it never signs a new one or makes a new key. On
  acceptance it reads the admitted entry, checks that it holds the request
  kept, finds the inbox the join created, and records the service, the
  repository's scopes with the inbox, and the handle in `config.json`; the
  next call lists the room's tools. No result repeats the invitation's
  secret. The server reads the link with
  `packages/client/src/invitation.ts`, since it may not import the command
  line. The command line keeps its own `linkOf`, unchanged, because the
  page's built module bundles the command line and its bytes stay main's;
  `packages/cli/test/invitation-link.test.ts` shows that the two parsers
  read and refuse the same links.
- **`artroom mcp`** in the command line, with `--generic`,
  `--generic=add`, `--tools`, `--http`, and `--scope` with `--membership`.
  Its option parsing and `--scope` live in `packages/cli/src/mcp.ts`, so
  `packages/cli/src/commands.ts` is main's, byte for byte.
- **Twelve test files** in `packages/mcp/test`: `inventory`, `describe`,
  `errors`, `budget`, `custody` and `wire` in Node; `room`, `binding`,
  `discovery`, `unfamiliar`, `counter` and `recipes` as stories on the real
  test Worker. Each states its invariant in its first comment. `recipes`
  is new in this round: it runs every row of the W1 inventory.
- **`docs/mcp.md`**, with `docs/mcp-tools.json`, the whole list as sent to
  an admin of the demo room, which a test derives again and compares.
- **`scripts/active-source.test.mjs`** refuses an import in the server's
  source of anything but the contract, the bytes, the client, the platform
  and the derivation, and lets the server's tests name the lanes package
  as the page's do.

## Corrections of review de37ae90

| Item | What changed | Witness |
|---|---|---|
| 1. Custody terminal truth | Resubmission keeps a new unresolved attempt first; accepted and mismatch are never resent; the newest decisive outcome is chosen | `custody.test.ts`: a resubmitted refusal whose reply is lost, then settled; lost, unavailable, then settled answers accepted; a mismatch is never resent |
| 2. Archive and index | One transaction under an archive lease: the archive file renamed into place, then the index, then the live records removed; locked records skipped; leftovers of a crash cleared by the next run | `custody.test.ts`: two child processes archiving at once; a crash, as a process exit, after the archive file and after the index |
| 3. MCP-only onboarding | The `join` tool, an empty config directory served, the room recorded on acceptance | the room story: the second member joins from an empty configuration, through a lost reply |
| 4. Capacity and bytes | Admission under a capacity lease; a byte budget before signing; spilling by size; the step retention rule stated | `custody.test.ts`: two child processes at 255 unresolved admit one; an envelope refused for bytes before signing; a large envelope with its receipt; outcomes spilled, none lost |
| 5. Lock recovery | A lock is broken when its process is gone, whatever its time | `custody.test.ts`: a child process killed during a settlement after notAfter |
| 6. Refresh after remembering | A configuration the server writes makes the next call derive the list again and tells subscribers; the stories no longer list tools before a call | the claim's seat and first key straight after `wait`; a second connection calls a root's act another connection added, with no list call |
| 7. Whole-response budgets | Bounds for the whole response; `room` paged by bytes; text slices measured as sent; segment reads in bounded slices | `budget.test.ts` asserts each response's size against its bound and `room`'s pages |
| 8. History searches | `wait` follows final-item pages across polls; the creation and credential searches keep their position | `budget.test.ts`: completions 100 entries on, and a final item on page 5 |
| 9. Rule and profile meaning | The declaration digest covers rule bodies, profile and marks | `describe.test.ts`: same rows with another rule body or profile; reordered scopes |
| 10. Authority and inputs | Partly unknown standing; presented facts in the schema; a capability range keeps its exception | `describe.test.ts` |
| 11. HTTP bytes and frames | One decode, frame validation first, bounded errors, contained failures | `wire.test.ts`, with a real client's call after each case |
| 12. Subscriptions and bounds | Listens by client stream; SSE lifetime from the response; pruned stdio tasks; bounded lines | `wire.test.ts`: equal IDs, a disconnect and a reconnect, cleanup, sustained stdio traffic |
| 13. Evidence and docs | The W1 recipes executed; a review and exact refusals in the room story; budget witnesses; `propose-file`'s text stated as inline; the SDK rationale corrected | `recipes.scope.test.ts`, `room.scope.test.ts`, `budget.test.ts`; this note |

## The SDK choice

The server is a minimal JSON-RPC handler, which plan 031 section 7 allows
when it implements each served revision's required method set. An earlier
version of this note said that `@modelcontextprotocol/server` 2.3.1 serves
the 2025-era revision only statelessly. That was wrong: its README states
that it implements the 2026-07-28 revision, and its package has a
streamable HTTP server transport with optional sessions
(`sessionIdGenerator`). I read its README and the declarations of its
package; I did not build on it.

The handler is kept because it implements both revisions' method sets
(for 2025-11-25: `initialize`, `ping`, `tools/list`, `tools/call`, the
session header, `GET`, `DELETE` and the notifications; for 2026-07-28:
`server/discover`, `tools/list`, `tools/call`, `subscriptions/listen`, the
per-request `_meta` and `resultType`), and because it is witnessed against
the real client, `@modelcontextprotocol/client` 2.3.1, pinned as a
development dependency, over loopback HTTP and over stdio through
`artroom mcp`, once speaking 2025-11-25 (its default) and once pinned to
2026-07-28. A switch to the SDK would need the same witnesses again; it is
listed as owed below, as a choice for the hosted endpoint.

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
unrelated `libc` fields, so they were not used. This round adds no
dependency.

## What ran

In this session, after the last change to what each covers:

| Command | Result |
|---|---|
| `npx vitest run --project mcp` | `Tests  49 passed (49)` |
| `npx vitest run --project scope packages/mcp/test --reporter=verbose` | `Test Files  6 passed (6)`, `Tests  8 passed (8)` |
| `npx vitest run --project cli --project mcp --project page --project client` (after the join change) | `Tests  175 passed (175)` |
| `npx vitest run --project scope packages/mcp/test packages/cli/test/join packages/cli/test/story` (after the join change) | `Tests  8 passed (8)` |
| `npm run typecheck` in `packages/mcp` | no errors |
| `node --test scripts/active-source.test.mjs` | `# pass 7`, `# fail 0` |
| `npm run gate`, once, at the head named in the gate's own line | GATE_RESULT |

## Observed figures

### The list, per role

Observed run of `packages/mcp/test/budget.test.ts`, on the stand-in scope
service. Bytes are the canonical JSON of each `tools/list` result as sent,
and each page is asserted to be at most 256 KiB. Tokens are a proxy:
gpt-tokenizer 3.4.0 with the `o200k_base` encoding. An agent host's own
tokenizer gives other counts.

| Room and role | Tools | Pages | Bytes | Tokens |
|---|---|---|---|---|
| Demo room, admin | 71 | 1 | 145949 | 37612 |
| Demo room, maintainer | 57 | 1 | 114033 | 29484 |
| Demo room, member | 54 | 1 | 107458 | 27727 |
| Demo room, agent | 52 | 1 | 101692 | 26288 |
| Full lane definitions (`issue`, `change`, `change3`), admin | 158 | 2 | 338575 | 88861 |
| Demo room, admin, `--generic` | 16 | 1 | 14654 | 3448 |

The demo room is the six platform scopes on the default cohort, one lane
under `issue-demo` and one under `change-demo`. No single descriptor
exceeds a page. The counts are one more than the first round's: `join`.

### Reads per tool

Observed run of `packages/mcp/test/budget.test.ts`. The stand-in counts
every request the server makes. Warm calls hold a read session; each cold
call made exactly one session request more. Warm reads: `room` 3,
`inspect` 1, `inspect` with `describe` 1, with `declaration` 2, `items`,
`steps`, `step`, `record`, `sends`, `text`, one poll of `wait` and
`settle` 1 each, `actions` 1, `issue.comment` 1 read and 1 post,
`issue.create` 2 reads (the definition's bytes from the rules scope) and 1
post, `create` 0 reads and 1 post, `tools/list` 3. `credential` read 3:
the act's entry, the entry with the operation's outcome, and the
credential route. Plan 031 section 8 counts 1 for it; the extra reads find
the handle, which the outcome entry carries. The warm `credential` call
read a second token after the cold call consumed the first, and succeeded.

Also observed in that run: an ended session cost one new session request;
a refused session one request and then signed reads, with the refusal
remembered for a minute; a session refused on a read one signed-read
fallback. A room with two standalone roots, one under a second membership:
`room` warm 6 reads, cold 2 session requests. A room of 60 lanes and 40
roots: `room` in 5 pages, each within 8 KiB. A mint's outcome and a
creation 100 entries after their acts: found in 7 calls and in 7 polls,
with no entry read twice; a final item on the fifth page: found in 2
polls. A 64 KiB live item was served alone and whole on its page; a
continuation across a head move restarted and said so; a 200 KiB retained
text was read whole in 4 calls; with a 2 KiB list page, 35 descriptors were
alone on their pages and all 71 tools were reachable. 70 resubmissions of a
refused envelope: each of the 70 made 1 read and 1 post, and all 70
outcomes are readable. A subscribed client was told 2 times for an
activation and a role change and 0 times for a head advance; each watch run
read 3 summaries.

### The room story

Observed run of `packages/mcp/test/room.scope.test.ts` on the real test
Worker:

| Mode | List changes told, founder | of them while founding | List changes told, second member | Requests, founder | Requests, second member |
|---|---|---|---|---|---|
| Default | 7 | 3 | 4 | 229 | 263 |
| `--generic` | 7 | 3 | 4 | 241 | 259 |

The second member joins from an empty configuration through `join`, after
a reply lost on the way back. The founder reviews the member's version,
approving it, before the merge.

**Capability steps.** No act of any definition in this repository has a
capability whose resource is another scope, and `hold@1`'s steps are
judged by the lane that holds the hold. The story asks for `hold@1`'s
stage and check at another issue lane, and stage at the lane itself, and
asserts the exact answer each time: `refused`, `capability-refused`,
`not-staged`; the hand-in is refused for the same reason. At the other
lane, no hold under the commitment exists. At the lane itself, `hold@1`
stages a report only after the holder's `hold@1:instance` step, which is a
capability step with no act (`packages/lanes/test/hold.scope.test.ts`
shows it accepted), and no tool of this server sends such a step. An
accepted step, and a retry answered with its first entry, are shown only
against scripted answers, in `custody.test.ts`: that shows what the server
keeps, and nothing about `hold@1`'s judgment.

### Call counts per activity

Observed run of `packages/mcp/test/recipes.scope.test.ts` on the real test
Worker: every row of `docs/mcp.md`'s W1 inventory runs through the server
with complete arguments, in the default and `--generic` modes, and the test
checks the tools called, their order and their count against the row.
Opening an issue is 2 calls in the default mode (`issue.create`, `wait`)
and 3 in `--generic` (`actions`, `act`, `wait`); a clone is 3 calls and
Git; `artroom edit` with `--closes` is 10 calls and 12 in `--generic`.
One row shares another row's calls, as the table says: Create room shares
`artroom claim`'s. `artroom propose` runs to the demo change's refusal of
its version, `source-shape`, which the test asserts: the demo change
definition's `propose-manifest` is the hold workflow's, and holds one
version only, and `artroom propose` needs `change3` or `change-demo3` under
a destination at version 3, which the demo room does not run.

## The T36 checkers failure in the cloud

T36_RESULT

## What is owed

- **The hosted endpoint** of plan 031's stage 2: a remote MCP endpoint
  with a bearer per agent, a session store for the 2025-11-25 revision, and
  each bearer's sessions and subscriptions kept apart. Nothing of it is
  built. Whether it builds on `@modelcontextprotocol/server` is open.
- **The optional amendment of `docs/cli.md`**, naming `artroom mcp` in its
  list of commands and pointing at `docs/mcp.md`. The usage line is in the
  command line; the guide is not amended.
- **`credential`'s reads**: 3 where plan 031 counts 1, as reported above.
- **A capability step with no act**, such as `hold@1:instance`: no tool
  sends one, so an accepted `hold@1` stage is not reached through the
  server.
- **`artroom propose` in full**: a room under `change3` with a destination
  at version 3, and Git trees built for it, so the recipe's version is
  accepted and merged.
- **No gitseq request** was recorded from this session: no gitseq tool was
  available in the cloud container. The requester records one for this
  head.
