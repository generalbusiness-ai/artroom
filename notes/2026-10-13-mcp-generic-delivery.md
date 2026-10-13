# The generic MCP service: delivery

This note reports the build of plan 031, "One MCP service for every dap
application" (approved at `a8c6222f`, review `5eb60654`), on branch
`request/mcp-generic`, and the corrections that review `de37ae90` of head
`2db9160b` and review `95c749bb` of head `fbf80dea` asked for. The branch
started from `planner/mcp-generic-design`, and `main` was merged in three
times: the second time with main's Empty-room, wordmark, Home and forms
heads in `packages/page`, whose bytes stay main's; the third time at
`6198b199` or later, with main's documentation, homepage copy and layout,
and `notes/2026-10-12-observability-design.md`, each taken as main has it.
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
- **Whole-result budgets.** Each result is measured whole as the service
  makes it: text, structured content and `isError` together; the text
  repeats the JSON only when that fits. Over 2026-07-28 the wire adds
  `resultType` and the server's information, 110 bytes measured
  separately, which the bounds do not count (the correction of review
  6a86304e, item 3). `room` pages all its collections by bytes. The
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
  next call lists the room's tools. `join`'s own result never repeats the
  invitation's secret. The admitted join holds it, as its signed input, so a
  history read of membership (`step`, `record`) returns it to whoever may
  read that history, as the native record does for any member's session;
  the server does not mask the exact record. The server reads the link with
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
  runs every row of the W1 inventory.
- **Capability steps with no act.** `prepare` without `kind` sends a step
  that has no act, such as `hold@1`'s instance: the step's own intent
  (kind `<capability>:<step>`), to the resource, signed by the server's key
  and kept under custody, its answers kept as the step's.
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

## Corrections of review 95c749bb

| Item | What changed | Witness |
|---|---|---|
| 1. Steps with no act | `prepare` without `kind` sends a capability step with no act under custody | the room story: `hold@1`'s instance, the report's stage and check, then the hand-in, accepted at entry 17, and its settlement, in both modes; the not-staged refusals stay their own witness |
| 2. The full proposal | The `propose` recipe runs in a room of its own under `change-demo3` and its version 3 destination | `recipes.scope.test.ts`: two files, a version naming both, accepted, a merge published; 10 calls in the default mode and 12 in `--generic`; the demo change's `source-shape` refusal is its own check |
| 3. Resubmissions at the bound | A resubmitted refusal becomes unresolved under the capacity lease, persisted there before delivery | `custody.test.ts`: two processes resubmitting refusals at 255 unresolved admit one; the other's refusal stays as it was |
| 4. Every outcome spilled | The decisive outcome is read from the segment's end in bounded slices (made a slice-by-slice search in review b04a53c8, item 3) | `custody.test.ts`: an accepted outcome found with nothing inline, by send and settle, with no signature and no delivery |
| 5. Lease reclamation | A dead owner's lock is broken under a reclaim lock after reading it again; release removes only the releaser's holding (a dead reclaimer blocks recovery since review b04a53c8, item 2) | `custody.test.ts`: four processes reclaim one dead lease, one enters; a release with another token leaves the lock |
| 6. Archival under the lock | Each candidate is read again under its lock and skipped when no longer terminal | `custody.test.ts`: a resubmission between selection and lock stays live and counted |
| 7. A root added elsewhere | The configuration is read on each call and the list derived again when it changed | `budget.test.ts`: a known name at a root added under a second membership is served under it; the witness fails without the check |
| 8. Bounded settlement | settle projects each step's latest answer and pages the steps; prepare returns a projection | `budget.test.ts`: 20 steps of one key in 4 pages within 4 KiB |
| 9. Role text across memberships | Roles named per membership, in the order of their scope IDs | `describe.test.ts`: two memberships with different roles, reordered, give one text and one generation |
| 10. A listen closed early | A listen whose stream closes during its first snapshot installs no watcher | `wire.test.ts`, with a deferred snapshot |
| 11. Frames and reflections | Requests, notifications and responses told apart; invalid or long IDs rejected with id null; reflections capped at 256 characters | `wire.test.ts`, with a real client's call after each case |
| 12. The invitation's secret | The guarantee narrowed to `join`'s own result; the record is not masked | the tool's description, `docs/mcp.md` and this note |
| 13. Prose | `items` says its two traversals; the wire's opening comment no longer claims the SDK serves only the older revision | `docs/mcp.md`, `wire.ts`, the stand-in |

## Corrections of review b04a53c8

Origin's main had not moved since the last merge, so no merge was made in
this round. The planner's amendment is kept.

| Item | What changed | Witness |
|---|---|---|
| 1. Standalone steps have a lifecycle | A record of steps with no act has a terminal phase of its own, `settled`, reached when every step has a decisive answer; it is never accepted. A decisive step is kept and returned again without sending. A lost or unavailable answer leaves the record unresolved, and the same call sends the exact step again. `settle` answers `settled` | `custody.test.ts`, "standalone steps": a decisive step replayed with nothing sent; a restart between sending and the answer, then the answer kept; a lost step sent again byte for byte; new work admitted after 260 completed standalone steps |
| 2. Reclaim-lock recovery | A reclaim lock is never broken. A dead reclaimer's file blocks recovery of that lock: each call is refused as `locked`, naming the file, with the next step for the operator. Node has no atomic conditional replace of a file, so the reviewer's second choice was taken | `custody.test.ts`: a reclaimer that died inside the reclaim section; four processes are refused and the custody call is refused as `locked`, naming the file; once it is removed, one of four processes enters |
| 3. Bounded backward search | The decisive outcome is searched inline, then in the segment one slice of 64 at a time, newest first, stopping at the decisive outcome or at the start of the current attempt | `custody.test.ts`: with 300 lost replies, slices are read from 172, 108, 44 and 0, each at most 64; a record whose outcomes all moved is read in one slice of one |
| 4. Bounded names | Capability and step names longer than 128 bytes are refused as a shape error before anything is kept or sent, and the result echoes less than 200 characters of the name | `budget.test.ts`: 100 KiB names, with and without an act, refused whole in results of at most 613 bytes, observed (bound 4 KiB), with no request and nothing unresolved |
| 5. Notifications | A notification is never answered, on either transport. A request-only method sent as a notification is counted and dropped before dispatch; over HTTP it gets 202 with no body and no session | `wire.test.ts`: over HTTP, notification-shaped `tools/call`, `initialize` and `tools/list` (with a session) and two real notifications each get 202, an empty body, no session header and no scope request, with the real client's call after each; 3 counted. On stdio, the same five write nothing, and the next request gets the only line |
| 6. The cursor's wording | `items` and its reference no longer say a cursor continues only its traversal; they tell callers to continue with the same scope, type and final flag | `docs/mcp.md`, `docs/mcp-tools.json`, regenerated from the descriptors |

## Corrections of review ad2576fb

Origin's main had not moved, so no merge was made in this round. The
planner's amendment is kept.

| Item | What changed | Witness |
|---|---|---|
| P2. Bounded diagnostics | `clip` in `errors.ts` repeats a caller's fragment (a target, a field's name, a key, a scope as given, a tool's name, a link's service or membership) for at most 128 characters, then an ellipsis and the original length, without splitting a surrogate pair. `Finding` clips each such fragment where the sentence is made; `shape.ts` clips each unknown field or presented name where the path is made, and a path is held to 512 characters; `#scope` clips the target it quotes. `failed` holds the whole serialized result within 2 KiB, the smallest tool bound, so it fits whichever tool gave it; past that, only the sentence is cut, and says so, and `error` and `next` stay whole. No accepted input was narrowed | `budget.test.ts`, "oversized targets and field names": a 100 KiB target to `inspect`, to `issue.comment` and to `act`, and a 100 KiB unknown field name to `create`; each whole serialized result within its tool's bound (839, 839, 839 and 805 bytes, observed), the length stated, no 200-character run of the input repeated, nothing posted, nothing unresolved. "an error past its bound is cut in its sentence only": a 10,000-character finding, within 2 KiB, with its kind and next step whole |
| P3. The list figures in the reference | `docs/mcp.md`'s list table taken again from this round's run, and labelled so | `docs/mcp.md`, "The list, per role" |
| P3. credential's wording | The server's instructions say only `credential` returns a credential by design, and that `step` and `record` can show a join's signed invitation; the instructions stay within 512 characters (511) | `service.ts` |

`docs/mcp.md` also gains a paragraph on the server's own errors: the
128-character fragments and the 2 KiB bound.

## Corrections of review 6a86304e

Origin's main had not moved when this round's corrections were made. It
moved afterwards (the forms head landed as `2086f60e`), and the planner
merged it into this branch at its head, with no conflict and no change to
the branch's own paths; at the merged head `git diff --name-only
origin/main...HEAD` lists 60 paths, every one under packages/mcp,
packages/cli, packages/client (index.ts, invitation.ts), docs/mcp.md,
docs/mcp-tools.json, this note, scripts/active-source.test.mjs,
parked/README.md, plans/README.md, package-lock.json, vitest.config.ts
or tsconfig, and none elsewhere. The planner's amendment is kept.

| Item | What changed | Witness |
|---|---|---|
| 1. Names kept as own properties | `shape.ts` sets each field, record member, presented fact and `also` alias's expected revision with `defineProperty`, so a lawful name `__proto__` is an own, enumerable property and reaches the intent with its exact name and value. Before, a plain assignment hit the prototype setter: the value vanished, and the scope refused | `proto.scope.test.ts` on the real test Worker, with `support/pantry.ts`, a definition parsed from JSON and admitted by the native validator: a required text field and a record member named `__proto__` (`fill`), an `also` alias named `__proto__` bound by a field (`check`), and a presented fact named `__proto__` (`seal`), each accepted natively, with each name an own property of the entry's intent and of the item's values. With the old assignments, observed in this round: `fill` and `seal` refused with `bad-field`, `check` refused with `bad-intent` |
| 2. A bounded locator for a dead reclaimer | The file store reports the reclaim file relative to itself. The error names it once, in the next step, whole, as `private/mcp-custody/<file>`, relative to `ARTROOM_HOME`; the sentence no longer repeats it, and the absolute path is not in the result. `failed` also checks the result with no sentence: were a next step alone past the bound, it would be cut to fit, with its length | `budget.test.ts`: under a home of 24 components of 90 characters (2204 characters in all), a dead reclaimer's refusal is 999 bytes, observed, and names `private/mcp-custody/capacity.lease.reclaim`; removing that file lets the same call be accepted. A 5,000-character next step is cut to fit within 2 KiB, with its length |
| The gate of this round: the lease witnesses | The first gate of this round, at `80fe2ee9`, failed one witness of its own besides the four checkers tests: after the dead reclaimer's file was removed, two of four children reported `entered`. Each child holds the lease for 300 ms; under the gate's load a child that starts late may enter after another has left, which is lawful. The two lease witnesses counted entries, so they could not tell that apart from two holders at once. Each child now reports when it was inside, just after taking the lease and just before releasing it, and both witnesses assert that at least one entered, that no two holdings overlap, and that the rest were refused. No code of the server changed | `custody.test.ts`: three concurrent runs of the file, 29 of 29 each; with a temporary change that let every child enter, the simultaneous-reclaimers witness failed with 3 overlaps, observed in this round |
| 3. The modern result's overhead | The bounds are stated to hold for the service's CallResult. What 2026-07-28 adds is one constant, `MODERN_RESULT_EXTRA`: 110 bytes | `wire.test.ts`: a real 2026-07-28 `tools/call` carries the CallResult and exactly those bytes more, `resultType` and the server's information; `docs/mcp.md` and the budget test say so |

## Corrections of review f7a8d2d4

Main had moved again: the Home head landed as `02d6ccb7` after the
planner's merge. It was merged into this branch with `git merge --no-edit
origin/main` at `632ba47d`, with no conflict; main's version of every
path this branch does not own was taken unchanged. After that merge, and
at this round's head, `git diff --name-only origin/main...HEAD` lists 60
paths, every one of them the branch's own (packages/mcp, packages/cli,
packages/client's index.ts and invitation.ts, docs/mcp.md,
docs/mcp-tools.json, this note, scripts/active-source.test.mjs,
parked/README.md, plans/README.md, package-lock.json and
vitest.config.ts), and `git diff --name-only origin/main HEAD` lists no
other path. Both of the planner's amendments are kept.

| Item | What changed | Witness |
|---|---|---|
| P2. Only own incoming names | `shape.ts` reads each incoming field, record member and presented fact only when it is an own property (`Object.hasOwn`), and leaves an absent optional name absent, so the scope applies its own default, as derive's `readFields` does. The `also` rule, the field an alias is bound by, and a value's digest field are read the same way. The writes stay own-property writes. No name is banned or renamed | `proto.scope.test.ts`, "optional prototype names left out stay out, through act", on the real test Worker through the generic `act` tool: `stock` with only an empty required record (`{ "box": {} }`), its optional `__proto__`, `constructor` and `toString` (text and record) left out, accepted, with only `box` in the intent and nothing in it; the same names given, accepted, each an own property with its value; `close` with an optional presented fact named `constructor`, with presented left out and with presented `{}`, each accepted. With the old reads, observed in this round: the first `stock` refused before signing as `fields.__proto__ is not a text`, and, with only the presented read restored, the `close` with `{}` refused as `presented.constructor is not a fact` |
| P3(a). The overview's measure | The note's overview, a sentence of `docs/mcp.md` and the budget test's comments now say a result is measured whole as the service makes it, with the 2026-07-28 metadata measured apart | this note, `docs/mcp.md`, `budget.test.ts` |
| P3(b). The marked minimum | `failed` measures each fallback as it would be returned: the sentence's longest marked cut with the next step whole; else the sentence's mark with the next step's longest marked cut; else both marks, a few hundred bytes. It no longer tests the empty sentence in place of its mark | `budget.test.ts`, "an error at the edge of its bound": every next-step length from 700 to 1,100 characters, across the edge where the empty-sentence result fits and the marked one would not, gives a result within 2,048 bytes. The old code returned 2,153 bytes there, observed in this round |

## Corrections of review 16fcc428

Main had moved again: the sprint report landed as `b69ee8ef`. It was
merged into this branch with `git merge --no-edit origin/main` at
`08726e2c`, with no conflict, taking main's version of every path this
branch does not own. After that merge, and at this round's head, `git
diff --name-only origin/main...HEAD` lists 60 paths, every one of them
the branch's own, and `git diff --name-only origin/main HEAD` lists no
other path. Both of the planner's amendments are kept, and the gate lines
the planner wrote are left as they were.

| Item | What changed | Witness |
|---|---|---|
| P2. Expected revisions follow the scope's defaults | `shape.ts` gains `effectiveFields`: each declared field the caller gave, else its declared `default`, read as derive's `readFields` reads them (an own value, else the default; an absent optional with no default stays absent), written with own-property writes. `expectedOf` resolves the act's subjects from that view, for an act tool and for `join`. The intent still signs the fields as given, and the requested meaning's digest is still over them, so the scope applies its defaults itself | `proto.scope.test.ts`, "a defaulted selector", on the real test Worker through the generic `act` tool, with `pantry`'s new `recheck` (an `also` alias named `__proto__` bound by an optional `jar` whose default, 2, is the first jar), `glance` (the same with no default) and `shake` (a transition that moves a jar). Observed in this round: `recheck` with `jar` left out is accepted, with no `jar` in the intent and `expected` holding `on` and `__proto__` at jar 2's revision; with `jar` given as the second jar it is accepted, expecting that jar; an envelope kept by `prepare` with the default's revision, sent after `shake` moved jar 2, is refused `revision-moved`; `glance` with `jar` left out is accepted, expecting `on` only. With the old resolution, observed: the defaulted `recheck` refused `bad-intent` |

`docs/mcp.md` gains a paragraph under the act tool's input: a field left
out is not signed, the scope applies its default, and the server resolves
the items the act names with those defaults applied.

While writing the witness, a transition with no effects was observed not
to move its item's revision, so `shake` writes a value.

**Paths that differ from main.** After the third merge, and at the head of
the round of review 6a86304e, `git diff --stat origin/main...HEAD` lists
60 files, all this branch's own: the 44 files of `packages/mcp` (this
round added `test/proto.scope.test.ts` and `test/support/pantry.ts`); `packages/cli/package.json`,
`packages/cli/src/line.ts`, `packages/cli/src/main.ts`,
`packages/cli/src/mcp.ts`, `packages/cli/src/store.ts` and
`packages/cli/test/invitation-link.test.ts`;
`packages/client/src/index.ts` and `packages/client/src/invitation.ts`;
`docs/mcp.md`, `docs/mcp-tools.json`, `scripts/active-source.test.mjs`,
`parked/README.md`, `plans/README.md`, this note, `package-lock.json` (the
new package and its pinned development dependencies) and
`vitest.config.ts` (the mcp project and the mcp stories).

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
| `npx vitest run --project mcp`, after the item of review 16fcc428 | `Tests  72 passed (72)` |
| `npx vitest run --project scope packages/mcp/test`, after the item of review 16fcc428, again with `--reporter=verbose` | `Test Files  7 passed (7)`, `Tests  11 passed (11)` |
| `npx vitest run --project mcp`, after each item of review f7a8d2d4 | `Tests  72 passed (72)` after the P2 and P3(b), and again after P3(a) (the budget file alone: `Tests  16 passed (16)`) |
| `npx vitest run --project scope packages/mcp/test`, after each item of review f7a8d2d4, the last time with `--reporter=verbose` | `Test Files  7 passed (7)`, `Tests  10 passed (10)` |
| `npx vitest run --project mcp`, after each item of review 6a86304e | `Tests  68 passed (68)` after item 1, `70` after item 2, `71` after item 3 |
| `npx vitest run --project scope packages/mcp/test`, after each item of review 6a86304e, the last time with `--reporter=verbose` | `Test Files  7 passed (7)`, `Tests  9 passed (9)` each time |
| `npx vitest run --project mcp`, after each item of review ad2576fb | `Tests  68 passed (68)` after the P2 and after the P3 |
| `npx vitest run --project scope packages/mcp/test`, after each item of review ad2576fb, the last time with `--reporter=verbose` | `Test Files  6 passed (6)`, `Tests  8 passed (8)` each time |
| `npx vitest run --project mcp`, after each item of review b04a53c8 | `Tests  66 passed (66)` after items 5 and 6 |
| `npx vitest run --project scope packages/mcp/test --reporter=verbose`, after each item of review b04a53c8 | `Test Files  6 passed (6)`, `Tests  8 passed (8)` after items 5 and 6 |
| `npx vitest run --project mcp packages/mcp/test/custody`, twice after the standalone lifecycle | `Tests  29 passed (29)` each time |
| `npx vitest run --project mcp packages/mcp/test/custody`, three more times after the lease change | `Tests  23 passed (23)` each time |
| `npx vitest run --project cli --project mcp --project page --project client` (after the join change of the second round) | `Tests  175 passed (175)` |
| `npx vitest run --project scope packages/mcp/test packages/cli/test/join packages/cli/test/story` (after the join change of the second round) | `Tests  8 passed (8)` |
| `npm run typecheck` in `packages/mcp` | no errors |
| `node --test scripts/active-source.test.mjs` | `# pass 7`, `# fail 0` |
| `npm run gate`, once in the second round, at `3efb954d` | FAILED at the test step: `Tests  4 failed \| 1095 passed \| 2 skipped (1101)`. The four failures are the checkers failure below, and no other. |
| `npm run gate` in this round, first at `350dfb9c` | FAILED at the typecheck: a cast in the role-text witness of `describe.test.ts` (TS2352). Fixed in the next commit, which changes only that cast. |
| `npm run gate` at `9feae202` (a second attempt was cut off when the cloud worker restarted, and was run again) | FAILED at the test step: `Tests  4 failed \| 1104 passed \| 2 skipped (1110)`, `Test Files  2 failed \| 196 passed \| 1 skipped (199)`. Install was skipped (node_modules matched the lockfile); whitespace and typecheck passed. The four failures are the checkers failure below, and no other. Because `vitest run` failed, `npm test` did not go on to its `node --test` steps; `scripts/active-source.test.mjs` passed when run alone: `# pass 7`, `# fail 0`. |
| `npm run gate` in the round of review b04a53c8, once, at `296166a7` (`time` was already installed) | FAILED at the test step: `Tests  4 failed \| 1112 passed \| 2 skipped (1118)`, `Test Files  2 failed \| 196 passed \| 1 skipped (199)`. Install was skipped (node_modules matched the lockfile); whitespace and typecheck passed. The four failures are the checkers failure below, all `checkout-failed`, three in `runner.test.ts` and one in `reservation-record.test.ts`, and no other. `scripts/active-source.test.mjs`, run alone afterwards: `# pass 7`, `# fail 0`. |
| `npm run gate` in the round of review ad2576fb, once, at `324af0e4` (`time` was already installed) | FAILED at the test step: `Tests  4 failed \| 1114 passed \| 2 skipped (1120)`, `Test Files  2 failed \| 196 passed \| 1 skipped (199)`. Install was skipped (node_modules matched the lockfile); whitespace and typecheck passed. The four failures are the checkers failure below, all `checkout-failed`, three in `runner.test.ts` and one in `reservation-record.test.ts`, and no other. `scripts/active-source.test.mjs`, run alone afterwards: `# pass 7`, `# fail 0`. |
| `npm run gate` in the round of review 6a86304e, first at `80fe2ee9` | FAILED at the test step: `Tests  5 failed \| 1117 passed \| 2 skipped (1124)`: the four checkers failures below and the lease witness described in the section on review 6a86304e, which counted entries. |
| `npm run gate` in that round, again at `ac4d5f01`, after the lease witnesses changed and the planner's merge of main was merged in (`time` was already installed) | FAILED at the test step: `Tests  4 failed \| 1119 passed \| 2 skipped (1125)`, `Test Files  2 failed \| 198 passed \| 1 skipped (201)`. Install was skipped (node_modules matched the lockfile); whitespace and typecheck passed. The four failures are the checkers failure below, all `checkout-failed`, three in `runner.test.ts` and one in `reservation-record.test.ts`, and no other. `scripts/active-source.test.mjs`, run alone afterwards: `# pass 7`, `# fail 0`. |
| `npm run gate` in the round of review f7a8d2d4, once, at `50d0796d` (`time` was already installed) | FAILED at the test step: `Tests  4 failed \| 1121 passed \| 2 skipped (1127)`, `Test Files  2 failed \| 198 passed \| 1 skipped (201)`. Install was skipped (node_modules matched the lockfile); whitespace and typecheck passed. The four failures are the checkers failure below, all `checkout-failed`, three in `runner.test.ts` and one in `reservation-record.test.ts`, and no other. The long-`ARTROOM_HOME` witness runs here, on Linux (it passed in this round's verbose run of `budget.test.ts`), and is skipped on Darwin, as the planner's second amendment says. `scripts/active-source.test.mjs`, run alone afterwards: `# pass 7`, `# fail 0`. |
| `npm run gate` in the round of review 16fcc428, once, at `3e3d016f` (`time` was already installed) | FAILED at the test step: `Tests  4 failed \| 1122 passed \| 2 skipped (1128)`, `Test Files  2 failed \| 198 passed \| 1 skipped (201)`. Install was skipped (node_modules matched the lockfile); whitespace and typecheck passed. The four failures are the checkers failure below, all `checkout-failed`, three in `runner.test.ts` and one in `reservation-record.test.ts`, and no other. The long-`ARTROOM_HOME` witness runs here, on Linux (it passed in this round's verbose run of `budget.test.ts`), and is skipped on Darwin. `scripts/active-source.test.mjs`, run alone afterwards: `# pass 7`, `# fail 0`. |

## The planner's second amendment, after the merge

The witness "a dead reclaimer under a long ARTROOM_HOME" builds a home of
more than 2 KiB, lawful on Linux, where the cloud container ran it. macOS
caps a path at 1024 bytes, so on the planner's machine its `mkdir` fails
with `ENAMETOOLONG` before the witness begins. The planner marked it
`skipIf` on `darwin`, with the reason in its comment, and changed nothing
else; on this machine it is skipped, not passed, and the local gate counts
it as a skip.

## The planner's amendment after the second cloud gate

On the planner's machine, Node 26.11.1 prints a `DEP0205` deprecation
warning when the TypeScript loader registers itself, and the custody
witness "two processes at the bound admit one key" read its children's
stderr into the output it compared, so it failed there and passed on the
cloud's Node 22. The planner added `--disable-warning=DEP0205` to the
test's child processes, the flag the command line's own launcher already
passes, and nothing else. The custody tests then passed on Node 26:
`Tests  19 passed (19)`. The gate at this head is reported in the review
request, not in this note, because this note was written in the cloud.

## Observed figures

### The list, per role

Observed run of `packages/mcp/test/budget.test.ts`, on the stand-in scope
service. Bytes are the canonical JSON of each `tools/list` result as sent,
and each page is asserted to be at most 256 KiB. Tokens are a proxy:
gpt-tokenizer 3.4.0 with the `o200k_base` encoding. An agent host's own
tokenizer gives other counts.

| Room and role | Tools | Pages | Bytes | Tokens |
|---|---|---|---|---|
| Demo room, admin | 71 | 1 | 146481 | 37736 |
| Demo room, maintainer | 57 | 1 | 114565 | 29608 |
| Demo room, member | 54 | 1 | 107990 | 27851 |
| Demo room, agent | 52 | 1 | 102224 | 26412 |
| Full lane definitions (`issue`, `change`, `change3`), admin | 158 | 2 | 339107 | 88985 |
| Demo room, admin, `--generic` | 16 | 1 | 15186 | 3572 |

The demo room is the six platform scopes on the default cohort, one lane
under `issue-demo` and one under `change-demo`. No single descriptor
exceeds a page. The counts are one more than the first round's: `join`.
The bytes were taken again in the round of review b04a53c8, after the
wording of `items` changed: 63 bytes more per list than before. The runs
of the rounds of reviews ad2576fb, 6a86304e, f7a8d2d4 and 16fcc428 gave
the same figures.

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
Worker, in the round of review 16fcc428. The second member's request count
varies between runs with the timing of `wait`'s polls: in the default mode
286, 288, 288, 286 and 286, and in `--generic` 283, 283, 281, 283 and 281,
in the runs of the last five rounds.

| Mode | List changes told, founder | of them while founding | List changes told, second member | Requests, founder | Requests, second member |
|---|---|---|---|---|---|
| Default | 7 | 3 | 4 | 229 | 286 |
| `--generic` | 7 | 3 | 4 | 241 | 281 |

The second member joins from an empty configuration through `join`, after
a reply lost on the way back. The founder reviews the member's version,
approving it, before the merge.

**Capability steps.** `hold@1`'s steps are judged by the lane that holds
the hold. The story first asks for stage and check at another issue lane,
and stage at the lane itself, under one key, and asserts the exact answer
each time: `refused`, `capability-refused`, `not-staged`; the hand-in under
that key is refused for the same reason. At the other lane, no hold under
the commitment exists; at the lane itself, nothing was staged.

Then the accepted workflow, under another key, in both modes: the holder's
`hold@1:instance`, a step with no act, sent by `prepare` without `kind`;
the report's stage, accepted; the operations the stage opened (a staging
and two token mints) run by the scheduler while `wait` polls; the check,
accepted; the hand-in, accepted at entry 17; and its settlement, which
shows both steps accepted, apart from the act. `hold@1`'s outside
operations are answered by the lanes' `Host` STAND-IN
(`packages/lanes/test/support/graph.ts`), wired into the story's room
beside the hosting's own Git service: it answers each attempt `hold@1`'s
code opens, and stages no repository and walks no commit.

No act of any definition in this repository has a capability whose
resource is another scope, so no accepted step at a foreign resource
exists to witness.

### Call counts per activity

Observed run of `packages/mcp/test/recipes.scope.test.ts` on the real test
Worker: every row of `docs/mcp.md`'s W1 inventory runs through the server
with complete arguments, in the default and `--generic` modes, and the test
checks the tools called, their order and their count against the row.
Opening an issue is 2 calls in the default mode (`issue.create`, `wait`)
and 3 in `--generic` (`actions`, `act`, `wait`); a clone is 3 calls and
Git; `artroom edit` with `--closes` is 10 calls and 12 in `--generic`.
One row shares another row's calls, as the table says: Create room shares
`artroom claim`'s. `artroom propose` runs in a room of its own under
`change-demo3` and its version 3 destination: two files, a version naming
both, accepted at entry 7, and a merge the room publishes, in 10 calls in
the default mode and 12 in `--generic`. The destination builds the tree;
the agent sends none. Under the demo change definition, whose
`propose-manifest` is the hold workflow's and which holds one version
only, the same steps end in the lane's refusal of the version as
`source-shape`, which the test asserts as a check of its own.

## The T36 checkers failure in the cloud

It recurred, in all eight rounds. In each gate run, the same four tests of
`packages/checkers` failed with `checkout-failed`: T36 in
`test/runner.test.ts`, the two other checkout tests there, and the staging
test in `test/reservation-record.test.ts`. This branch changes nothing in
`packages/checkers` or `packages/git`.

The cause, reproduced by hand in a scratch directory in the first round:
the container's Git is 2.43.0, which refuses the runner's
`git checkout -q --detach --end-of-options <commit> --` with
`fatal: only one reference expected, 2 given.` The runner reads that exit
code as `checkout-failed`. The failures are the same with the global Git
configuration set aside (`GIT_CONFIG_GLOBAL=/dev/null`), so the container's
signing and proxy settings are not the cause. No newer Git was tried here.
The fix, in the runner or in the cloud image's Git, is not this
delivery's.

## What is owed

- **The hosted endpoint** of plan 031's stage 2: a remote MCP endpoint
  with a bearer per agent, a session store for the 2025-11-25 revision, and
  each bearer's sessions and subscriptions kept apart. Nothing of it is
  built. Whether it builds on `@modelcontextprotocol/server` is open.
- **The optional amendment of `docs/cli.md`**, naming `artroom mcp` in its
  list of commands and pointing at `docs/mcp.md`. The usage line is in the
  command line; the guide is not amended.
- **`credential`'s reads**: 3 where plan 031 counts 1, as reported above.
- **A dead reclaimer needs an operator.** A reclaim lock is never broken,
  so a process that died inside the short reclaim section leaves its lock
  refused as `locked` until an operator removes the reclaim file named in
  the refusal. Mutual exclusion holds; recovery is manual. Automatic
  recovery would need an atomic conditional replace of a file, which Node
  does not give.
- **No gitseq request** was recorded from this session: no gitseq tool was
  available in the cloud container. The requester records one for this
  head.
