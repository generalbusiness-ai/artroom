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
of steps, or a proxy. Since the composition onto the renamed main, the
package is `@generalbusiness/dap-mcp` and the command is `dap mcp`; the
sections written before it keep the names of their time.

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
spikes/parked/README.md, plans/README.md, package-lock.json, vitest.config.ts
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
spikes/parked/README.md, plans/README.md, package-lock.json and
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

## Corrections of review c790797b

Main had not moved: `git fetch origin && git merge --no-edit origin/main`
found it still at `b69ee8ef` and made no merge. At this round's head `git
diff --name-only origin/main...HEAD` lists 61 paths, every one of them the
branch's own (this round added `packages/mcp/test/shape.test.ts`), and `git
diff --name-only origin/main HEAD` lists no other path. Both of the
planner's amendments are kept.

| Item | What changed | Witness |
|---|---|---|
| P2. A local fact selects its `also` item | `effectiveFields` takes the target scope and, after applying defaults, reads each local fact (one whose scope and incarnation are the target's) as its `seq`, in a declared fact field and in the lists and records that hold one, as derive's `readFacts` puts it in normal form. A foreign fact, of another scope or another incarnation, stays a fact, so its `seq` never names a local item. The server does not verify the fact's hash; the scope does, and refuses `fact-mismatch` for a wrong one. The intent still signs the fact as given, and the meaning's digest is still over the fields as given | `proto.scope.test.ts`, "a local fact selects the also item", on the real test Worker through the generic `act` tool, with `pantry`'s new `verify` (an `also` item `selected` by a required fact field `jarFact` of kind `fill`). Observed in this round: `verify` given the fill that opened jar 2 is accepted, with that exact fact in the signed fields and `expected` holding `on` and `selected` at the jar's revision; an envelope kept by `prepare`, sent after `shake` moved the jar, is refused `revision-moved`. With the old view, observed: `verify` refused `bad-intent`. `shape.test.ts`: a local fact read as its `seq` in a field and a list, a foreign fact with the same `seq` and a fact of another incarnation of the same scope left as facts and selecting nothing, and the given fields unchanged |

**What the kept envelopes show.** In this witness and in the defaulted
selector's of review 16fcc428, `prepare` is used only to keep an envelope
signed with the selected item's revision at that moment. Its capability
step is answered `refused` (`bad-field`), which both tests now assert:
`pantry` declares no capability, and no hold stage is accepted. The witnesses cover the kept envelope and
its later refusal as `revision-moved`, not an accepted native hold stage;
the room story's accepted `hold@1` workflow is the witness of that.

The defaults witness of review 16fcc428 is unchanged. `docs/mcp.md`'s
paragraph on the act input now says a local fact is read as its entry's
position when the server resolves the items an act names.

## Composition onto the renamed main

The checker approved head `a126d71e` (review `e222266f`) on main
`b69ee8ef`. The minimal dap rename then landed alone, as main `b5d15349`,
and this head composes the approved work onto it, in two commits:

- **The merge, `564f578b`.** `git merge --no-edit origin/main`. Four paths
  conflicted: `package-lock.json`, `packages/cli/package.json`,
  `packages/cli/src/line.ts` and `scripts/active-source.test.mjs`. Each was
  resolved by taking main's text and putting back this branch's own
  additions in the new names: the command line's `mcp` in its description,
  its dependency on the server and the usage line `dap mcp ...`; the
  active-source rules' exceptions for `packages/mcp`, matching both the old
  and the new package names as main's rules now do. The lockfile was taken
  as main has it in the merge, so the merge commit alone does not install:
  the server's package still had its old name there.
- **The rename, `292e2206`.** The server's package is
  `@generalbusiness/dap-mcp`, with dap's repository URL
  (`generalbusiness-ai/dap`, directory `packages/mcp`) and homepage. Its
  source, its tests and the command line's `mcp.ts` import `dap-contract`,
  `dap-platform`, `dap-derive` and `dap-lanes`; `artroom-bytes`,
  `artroom-client` and `artroom-scope` keep their names, as main keeps
  them. `packages/client/src/invitation.ts`, which this branch adds,
  imports `dap-contract`. The active-source rule for the server's imports
  allows the new names. User-facing text says `dap mcp`, `dap join`,
  `dap invite` and the rest: the `join` tool's description, the HTTP
  announcement (`dap mcp: serving ...`), `docs/mcp.md`, `docs/mcp-tools.json`
  (regenerated from the descriptors) and the command line's help.
  `docs/mcp.md` says once that `artroom mcp` still runs through the
  command line's alias for one release. `ARTROOM_HOME`, the custody
  directory `private/mcp-custody`, the `artroom-invite:` link, the
  definition domain `artroom-definition-1` and the launcher file
  `bin/artroom.js` keep their names, as the rename keeps them. The
  lockfile was regenerated in this commit by `npx -y npm@12.2.0 install`
  from the root: additions only (183 lines: the `dap-mcp` workspace link
  and the server's pinned development dependencies), no row of main's
  changed. No behaviour changed.

`packages/cli/src/commands.ts` is main's, byte for byte, so the page's
bundle is main's. At this head `git diff --name-only origin/main...HEAD`
lists 61 paths, every one of them the branch's own, and `git diff
--name-only origin/main HEAD` lists no other path.

The observed figures were taken again after the rename. The list is 8
bytes shorter for every role (and 2 tokens fewer, proxy): `join`'s
description says `dap invite` and `dap join` where it said `artroom
invite` and `artroom join`. The reads per tool and their response bytes
are unchanged. In the room story the second member's request count was
288 in the default mode and 283 in `--generic` (observed), within the
range of earlier runs.

## Corrections of review 84d36fa4

The checker reviewed `c28193a5`, which is `bfbffab0` with the planner's
third amendment. The branch was reset to that head (`git reset --hard
origin/request/mcp-generic`) and main, now `fe121d9f`, was merged with
`git merge --no-edit origin/main` at `90aec25c`, with no conflict. Main
had landed, after the rename, the SDK publication note, the practice
script, the 07:00 sprint report, the Home delivery record, the fork
measurement record and the create wording head; main's version of every
path this branch does not own was taken unchanged. At this round's head
`git diff --name-only origin/main...HEAD` lists 61 paths, every one of
them the branch's own, and `git diff --name-only origin/main HEAD` lists
no other path.

| Item | What changed | Witness |
|---|---|---|
| P2. The W1 inventory against the integrated help | The create wording head made the room-creating command `dap create <name>` in the command line's help; the command line still accepts `dap found`, with a message that the alias remains for one release, and `dap claim`, as main has them, and this branch leaves both as they are. `docs/mcp.md` now names `dap create <name>` in its W1 row, says the Page's Create room makes the same calls as `dap create`, and says to set a room up with `dap install` and `dap create`; the recipe test finds the row by that name, and two code comments say `dap create`. Every other `dap` usage line already matched its row. No descriptor text changed, so `docs/mcp-tools.json` is unchanged; the Page still says Create room, so that row's name stays | `inventory.test.ts` on the merged tree: before the change it failed on `dap create` (observed); after it, 5 of 5 pass. On this tree it reads the help's 23 `dap` usage rows, keeps 20 distinct commands, leaves out `dap mcp` and checks 19, every one found in the table (counted by running the test's own selection over `USAGE`). `recipes.scope.test.ts` runs the renamed row |
| P3. The witness's count | The third amendment's paragraph now says 23 usage rows, 20 commands and 19 checked, as the help at `c28193a5` gives them (counted from that head's `line.ts`); the working test is unchanged | this note |

The planner's public gate projection for `c28193a5` carries the same wrong
descriptive number (21 commands, 20 besides `dap mcp`). Its bytes and its
phase results are preserved unchanged. The planner's separate, closed
correction record is at
`~/play/artroom-diagnostics/mcp-generic-gate-c28193a5-correction.md`.
The gate of `c28193a5` is not carried over to this tree; this tree's gate
is run again and reported below.

The observed figures were taken again on this tree and are the same as
after the composition: the list sizes per role, the reads per tool and
their response bytes, and in the room story 229 and 288 requests in the
default mode and 241 and 283 in `--generic`. The `dap create` recipe
takes 5 calls in the default mode and 7 in `--generic` (observed), as
`dap claim` did.

**Paths that differ from main.** After the third merge, and at the head of
the round of review 6a86304e, `git diff --stat origin/main...HEAD` lists
60 files, all this branch's own: the 44 files of `packages/mcp` (this
round added `test/proto.scope.test.ts` and `test/support/pantry.ts`); `packages/cli/package.json`,
`packages/cli/src/line.ts`, `packages/cli/src/main.ts`,
`packages/cli/src/mcp.ts`, `packages/cli/src/store.ts` and
`packages/cli/test/invitation-link.test.ts`;
`packages/client/src/index.ts` and `packages/client/src/invitation.ts`;
`docs/mcp.md`, `docs/mcp-tools.json`, `scripts/active-source.test.mjs`,
`spikes/parked/README.md`, `plans/README.md`, this note, `package-lock.json` (the
new package and its pinned development dependencies) and
`vitest.config.ts` (the mcp project and the mcp stories).

## Discovery of application scopes (request f9ca5f96)

The plan 031 build landed as main `bd02ecff` (review `7fce4467`). This
head continues the branch from that main (`git reset --hard origin/main`)
and adds one thing: an agent finds a Counter, or any application the
room's application factory created, without being handed its scope ID.
It needs no new act and no contract change: the application cohort's
directory (`directory5`, `packages/platform/src/application.ts`) already
records each application it creates as an item of type `application`
(states `creating`, `created`, `refused`, `conflict`; ref `scope` to the
created scope; value `definition`, its digest).

| Item of the request | What changed | Witness |
|---|---|---|
| 1. Hold the directory's applications | `inventory.ts` reads the directory's `application` items from the directory summary it already reads, and holds each one in state `created` whose `scope` is set, as place `application` under the directory's membership, as lanes are held. Its act tools derive from its pinned definition as from any held scope's | `counter.scope.test.ts`: after `application.create`, the list holds `counting.join`, `counting.start`, `counting.spoken` and `counting.leave`, with no configuration |
| 2. `room` and `inspect` | `room` lists the applications beside the lanes, each with its definition name, digest, scope and state, paged with the other collections within 8 KiB; an application still being created is listed as `creating`, with no scope and no tools, and a refused or conflicted creation, final, is not listed, because `room` reads only the directory's live items (corrected in review 2150a3ac). `inspect` reads one by its scope ID. The `room` tool's description names the applications | `counter.scope.test.ts`: `room` lists `{ definition: "counting", digest, scope, state: "created" }`; `inspect` by scope ID. `budget.test.ts`: 60 lanes, 30 applications and 40 roots in 6 pages (owner-observed; the test asserts more than one), each within 8 KiB. That case proves totals and the bound, not inter-page consistency; the continuation witness of review 2150a3ac does |
| 3. `wait` sees a new application | Nothing to change: `wait` on the directory after `application.create` (the directory's `establish-application`) already reports the created scope with its definition, as it reports a created lane | `counter.scope.test.ts`: each story takes the Counter's scope from `wait`'s created list and from `room`, and they agree |
| 4. Hand-configured roots | A root configured with `--scope` stays supported for scopes outside the repository. A root that is also one of the directory's applications is skipped as a root: held once, as the application, and listed once | `counter.scope.test.ts`: with the Counter also written as a root, `room` lists it once among the applications and not among the roots, and the list has one `counting.join`. Writing a root is a configuration change, which the generation counts, as for any root |
| 5. The generation | `generationOf` includes the held applications, each as its scope and digest. An application is held only once created, so a new one changes the generation once | `counter.scope.test.ts`: a subscribed client is told once of a new application (observed: once), and the generation differs before and after |
| 6. The stories and the docs | The Counter story no longer writes a root: it finds the Counter through `room`, and takes part in each launch mode, checked against `docs/mcp.md`'s new section "Taking part in a Counter". A second story creates an application through the tools and asserts `room`, the list, `inspect` and the one list change, with no configuration write. `docs/mcp.md` says which scopes are found, that `--scope` is not needed for an application, and that a new application changes the list | `counter.scope.test.ts`, three tests. Without the source change all three fail (observed) |

**The recipe, observed.** Taking part in a Counter that an admin has
initialized: in the default mode `room`, `counting.join`, `inspect`,
`counting.start`, `inspect`, `counting.spoken`, `inspect`,
`counting.leave`: 8 calls; in `--generic` mode `room`, `actions`, `act`,
`inspect`, `act`, `inspect`, `act`, `inspect`, `act`: 9 calls. The story
asserts the tools and the count against the docs' table in each mode. The
counts cover the operational window, from finding the Counter to leaving,
after the room's setup and the board's initialization; the story's final
reading of the steps is not counted. The `--generic` story's taker is a
second connection that shares Rita's key and configuration, not an
independently admitted member. This
recipe has its own section, after the W1 inventory, because the W1 recipe
test runs one room of the default cohort, and a Counter needs the
application cohort; its witness is the Counter story.

**Observed figures of this head.** The warm reads per tool are unchanged
in the measured context, a room with no applications: the application
rows come from the directory summary that `room` and the list already
read. That holds for the warm context only. The first time the server
sees an application it reads that scope's summary for its pin, and its
definition's bytes once per digest; both are kept. Matching roots and
applications against the held scopes was a scan per row (on the order of
R*S + A*(S+D) comparisons for R roots, A applications, S held scopes and
D active definitions); since review 2150a3ac those lookups use maps. `room`'s warm response is 3,874 bytes, 38 more than before
(the empty `applications` section, in the text and the structured
content). The list is 58 bytes larger for every role (and 9 to 11 tokens
more, proxy), from the `room` description: demo room, admin 146,531 bytes
and 37,745 tokens; maintainer 114,615 and 29,617; member 108,040 and
27,860; agent 102,274 and 26,421; the full lane definitions 339,157 and
88,992; `--generic` 15,236 and 3,581 (observed; the table in "Observed
figures" holds the same). The room story: 229 and
286 requests in the default mode, 241 and 283 in `--generic`, list
changes told 7 (3 while founding) and 4 (observed).

**Paths.** Main moved during this head, with documentation only
(`765c4eb9`: current names and taglines in eighteen Markdown files, none
of them this head's); it was merged at `acf481f5` with no conflict, taking
main's version of every path this head does not change. `git diff
--name-only origin/main...HEAD` then lists 9 paths:
`packages/mcp/src/catalogue.ts`, `packages/mcp/src/inventory.ts`,
`packages/mcp/src/service.ts`, `packages/mcp/test/budget.test.ts`,
`packages/mcp/test/counter.scope.test.ts`,
`packages/mcp/test/support/catalogue.ts`, `docs/mcp.md`,
`docs/mcp-tools.json` and this note.

### Corrections of review 2150a3ac

Main moved again after `765c4eb9`: the Start source, the self-host guide,
the SDK Counter tutorial, the hosted MCP endpoint design note (Draft 5),
the logo head and the 15:00 sprint report, 50 commits to `d3f5aa74`. It
was merged with `git merge origin/main` at `580e05d5`, with no conflict,
taking main's version of every path this head does not change. At this
head `git diff --name-only origin/main...HEAD` lists the same 9 paths as
above, all this head's own, and `git diff --name-only origin/main HEAD`
lists no other path.

| Finding | What changed | Witness |
|---|---|---|
| P2. `room`'s continuation depended on the tool list's generation | `room`'s cursor holds a digest of its collections as laid out (every entry of lanes, applications including `creating` rows, roots, standing, active definitions, act tools not held and scopes not read, in order) and an index, and no longer the generation. A continuation whose layout no longer holds is answered with the first page and `restarted: "The room's collections changed since the cursor was made; this page restarts at the first entry."`. The tool list's generation, and its one change per created application, are unchanged; no `creating` or final row enters it | `budget.test.ts`, "room's continuation across a creating, a created and a refused application": a real continuation inside the roots; a `creating` application added with the generation unchanged (asserted); the continuation restarts, and the walk from the restart returns all 40 roots once, each page within 8 KiB; the same after the application is created, and after a second one is refused and leaves the live items; with nothing moved, a continuation goes on with no restart (observed). With the old cursor the first continuation did not restart (observed: `restarted` undefined) |
| P3. Rows `room` lists | Creating rows are listed as such, with no scope; refused and conflicted rows are final, are not in the live summary, and are not listed. The note's item 2 and `docs/mcp.md` say so; no retained traversal is added | `budget.test.ts` above: the refused application is absent from the walk |
| P3. "Reads per tool are unchanged" | Qualified as the warm, application-free context; first-seen pins and definition bytes stated. `room` looks held scopes and active names up in maps, and the inventory looks application scopes up in a set, in place of a scan per row | `docs/mcp.md` after the warm reads table; this note |
| P3. The recipe's window and the `--generic` taker | The 8 and 9 calls cover finding the Counter to leaving, after setup and initialization, and exclude the final reading of the steps; the `--generic` taker shares Rita's key and configuration | `docs/mcp.md`, "Taking part in a Counter"; this note |
| P3. "Six pages" | Stated as owner-observed; the test asserts more than one page | `docs/mcp.md`; this note |

**What ran in this head.**

| Command | Result |
|---|---|
| `npx vitest run --project scope packages/mcp/test/counter.scope.test.ts --reporter=verbose`, with the source change | `Tests  3 passed (3)` |
| The same, with `packages/mcp/src` as on main | `Tests  3 failed (3)` |
| `npx vitest run --project mcp --reporter=verbose` | `Tests  73 passed (73)` |
| `npx vitest run --project scope packages/mcp/test --reporter=verbose` | `Test Files  7 passed (7)`, `Tests  14 passed (14)` |
| `node --test scripts/active-source.test.mjs` | `# pass 7`, `# fail 0` |
| After the corrections of review 2150a3ac: `npx vitest run --project mcp packages/mcp/test/budget.test.ts -t "continuation across"`, with `service.ts` as before the fix | `Tests  1 failed \| 16 skipped (17)`: `creating: expected undefined to be 'The room's collections changed since…'` |
| The same tree, with the fix: `npx vitest run --project mcp --reporter=verbose`; `npx vitest run --project scope packages/mcp/test --reporter=verbose` | `Tests  74 passed (74)`; `Test Files  7 passed (7)`, `Tests  14 passed (14)`. The figures above are unchanged in this run (observed) |
| `npm run gate`, once, at `35d48657` on main `765c4eb9` (`time` was already installed) | FAILED at the test step: `Tests  4 failed \| 1126 passed \| 2 skipped (1132)`, `Test Files  2 failed \| 199 passed \| 1 skipped (202)`. Install was skipped (node_modules matched the lockfile); whitespace and typecheck passed. The four failures are the checkers failure described in "The T36 checkers failure in the cloud", all `checkout-failed`, three in `runner.test.ts` and one in `reservation-record.test.ts`, and no other. The long-`ARTROOM_HOME` witness runs here, on Linux (it passed in this head's verbose run of the mcp project), and is skipped on Darwin. `scripts/active-source.test.mjs`, run alone afterwards: `# pass 7`, `# fail 0`. |
| `npm run gate` after the corrections of review 2150a3ac, once, at `9a25c45e` on main `d3f5aa74` (`time` was already installed) | FAILED at the test step: `Tests  5 failed \| 1140 passed \| 2 skipped (1147)`, `Test Files  3 failed \| 207 passed \| 1 skipped (211)`. Install was skipped; whitespace and typecheck passed. Four failures are the checkers failure described in "The T36 checkers failure in the cloud", all `checkout-failed`. The fifth is in `packages/scope/test/membership.test.ts`, "an act at an inbox is judged on a real observation of the signing key ...": it read the membership as `provisional` where it expected `active`. This head changes nothing in `packages/scope`, and that test does not use the MCP server; run alone twice afterwards, `npx vitest run --project scope packages/scope/test/membership.test.ts` gave `Tests  4 passed (4)` both times (observed), so under the gate's load it is a timing failure of main's test, reported here and not repaired by this head. The run also logged 3 unhandled `EPIPE` errors from `packages/git/test/support/host.ts`, during `packages/git/test/http-read.test.ts`, also main's. The long-`ARTROOM_HOME` witness runs here, on Linux, and is skipped on Darwin. `scripts/active-source.test.mjs`, run alone afterwards: `# pass 7`, `# fail 0`. The planner's local gate at `f05efdb3` passed (1129 passed, 3 skipped), as the review reports. |

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
| After the corrections of review 84d36fa4, on the merged tree: `npx vitest run --project mcp packages/mcp/test/inventory.test.ts`, before and after the inventory change | before: `Tests  1 failed \| 4 passed (5)`, failing on `dap create`; after: `Tests  5 passed (5)` |
| The same tree: `npx vitest run --project mcp --reporter=verbose`; `npx vitest run --project scope packages/mcp/test --reporter=verbose` | `Tests  73 passed (73)`; `Test Files  7 passed (7)`, `Tests  12 passed (12)` |
| After the composition onto the renamed main, at `292e2206`: `npx vitest run --project mcp --project cli --project client` | `Tests  136 passed (136)` |
| The same: `npx vitest run --project mcp --reporter=verbose` | `Tests  73 passed (73)` |
| The same: `npx vitest run --project scope packages/mcp/test packages/cli/test`, then `packages/mcp/test` alone with `--reporter=verbose` | `Test Files  12 passed (12)`, `Tests  18 passed (18)`; then `Test Files  7 passed (7)`, `Tests  12 passed (12)` |
| The same: typecheck of `packages/mcp` (its three configurations), `packages/cli` and `packages/client`; `node --test scripts/active-source.test.mjs` | no errors; `# pass 7`, `# fail 0` |
| `npx vitest run --project mcp`, after the item of review c790797b | `Tests  73 passed (73)` |
| `npx vitest run --project scope packages/mcp/test`, after the item of review c790797b, again with `--reporter=verbose` | `Test Files  7 passed (7)`, `Tests  12 passed (12)` |
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
| `npm run gate` in the round of review c790797b, once, at `6bfa8e9a` (`time` was already installed) | FAILED at the test step: `Tests  4 failed \| 1124 passed \| 2 skipped (1130)`, `Test Files  2 failed \| 199 passed \| 1 skipped (202)`. Install was skipped (node_modules matched the lockfile); whitespace and typecheck passed. The four failures are the checkers failure below, all `checkout-failed`, three in `runner.test.ts` and one in `reservation-record.test.ts`, and no other. The long-`ARTROOM_HOME` witness runs here, on Linux (it passed in this round's verbose run of `budget.test.ts`), and is skipped on Darwin. `scripts/active-source.test.mjs`, run alone afterwards: `# pass 7`, `# fail 0`. |
| `npm run gate` after the composition onto the renamed main, once, at `3dc0024a` (`time` was already installed) | FAILED at the test step: `Tests  4 failed \| 1124 passed \| 2 skipped (1130)`, `Test Files  2 failed \| 199 passed \| 1 skipped (202)`. Install ran, from the regenerated lockfile, and passed (`exit 0`), and left the tree clean; whitespace and typecheck passed. The four failures are the checkers failure below, all `checkout-failed`, three in `runner.test.ts` and one in `reservation-record.test.ts`, and no other. The long-`ARTROOM_HOME` witness runs here, on Linux (it passed in this composition's verbose run of the mcp project), and is skipped on Darwin. `scripts/active-source.test.mjs`, run alone afterwards: `# pass 7`, `# fail 0`. |
| `npm run gate` after the corrections of review 84d36fa4, once, at `d7ba75c8` on main `fe121d9f` (`time` was already installed; the gate of `c28193a5` is not carried over) | FAILED at the test step: `Tests  4 failed \| 1124 passed \| 2 skipped (1130)`, `Test Files  2 failed \| 199 passed \| 1 skipped (202)`. Install was skipped (node_modules matched the lockfile); whitespace and typecheck passed. The four failures are the checkers failure below, all `checkout-failed`, three in `runner.test.ts` and one in `reservation-record.test.ts`, and no other. The long-`ARTROOM_HOME` witness runs here, on Linux (it passed in this tree's verbose run of the mcp project), and is skipped on Darwin. `scripts/active-source.test.mjs`, run alone afterwards: `# pass 7`, `# fail 0`. |

## The planner's third amendment, after the composition

The checker's review of `bfbffab0` (`65320b8c`) found that the W1
inventory witness in `packages/mcp/test/inventory.test.ts` still selected
the command line's usage lines by the prefix `  artroom `, which the
renamed help no longer prints: the selected command set was empty, so the
loop that checks every command against the inventory table in
`docs/mcp.md` checked nothing, and the green gate did not establish that
condition. The planner changed the prefix to `  dap ` and added two
assertions before the loop: the set holds at least fifteen commands, and
it contains `dap install`, `dap join`, `dap issues`, `dap merge` and
`dap mcp`. With the prefix fixed the witness reads the help's 23 `dap`
usage rows, keeps 20 distinct commands, leaves out `dap mcp`, and checks
19, every one found in the table; the owning test passes (5 of 5 in the
file, observed). Nothing else changed. (This paragraph first said 21
commands, 20 besides `dap mcp`; corrected in the corrections of review
84d36fa4.)

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
| Demo room, admin | 71 | 1 | 146531 | 37745 |
| Demo room, maintainer | 57 | 1 | 114615 | 29617 |
| Demo room, member | 54 | 1 | 108040 | 27860 |
| Demo room, agent | 52 | 1 | 102274 | 26421 |
| Full lane definitions (`issue`, `change`, `change3`), admin | 158 | 2 | 339157 | 88992 |
| Demo room, admin, `--generic` | 16 | 1 | 15236 | 3581 |

The demo room is the six platform scopes on the default cohort, one lane
under `issue-demo` and one under `change-demo`. No single descriptor
exceeds a page. The counts are one more than the first round's: `join`.
The bytes were taken again in the round of review b04a53c8, after the
wording of `items` changed: 63 bytes more per list than before. The runs
of the rounds of reviews ad2576fb, 6a86304e, f7a8d2d4, 16fcc428 and
c790797b gave the same figures. After the composition onto the renamed
main the list was 8 bytes shorter: `join`'s description names `dap invite`
and `dap join`. In the discovery head (request f9ca5f96) it is 58 bytes
longer, as the table shows: `room`'s description names the applications.

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
Worker, in the discovery head (request f9ca5f96). The second member's
request count varies between runs with the timing of `wait`'s polls: in
the default mode 286, 288, 288, 286, 286, 286, 288, 288 and 286, and in
`--generic` 283, 283, 281, 283, 281, 281, 283, 283 and 283, in the runs of
the last nine rounds and heads.

| Mode | List changes told, founder | of them while founding | List changes told, second member | Requests, founder | Requests, second member |
|---|---|---|---|---|---|
| Default | 7 | 3 | 4 | 229 | 286 |
| `--generic` | 7 | 3 | 4 | 241 | 283 |

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

It recurred, in all nine rounds, in the composition onto the renamed main and in the corrections of review 84d36fa4. In each gate run, the same four tests of
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

## The hosted endpoint (request 9b3084d4)

Built locally by the planner, in the worktree `planner/mcp-hosted` from the
discovery head `0728c881`, as notes/2026-10-13-hosted-mcp-endpoint.md
designs it (Draft 5, checker approval 4a0af914, landed as main 77d9cca0).
Hugh, 2026-10-13 15:08 Eastern: no cloud session; the build is local.

| Section of the design | What was built | Witness |
|---|---|---|
| 3.4, the HTTP layer | `packages/mcp/src/http.ts`, one module for the loopback server and the hosted endpoint: the revision selected before the method is handled, from the header, else the request's content or the named session's recorded version; exactly the two commissioned revisions; one method and version matrix; `Mcp-Method` and `Mcp-Name` with the sentinel on the raw value; batches refused; errors with `id` null when undetectable; 16 sessions, 4 streams; `405` with `Allow: POST`. `node.ts` serves loopback HTTP through it, so the loopback server now requires the modern headers too (the wire tests send them) | `test/http.test.ts` (H8 over loopback, 4 tests); `test/hosted.scope.test.ts` H8 through the route |
| 3.5, wire and sessions | `wire.ts`: `told` split into `listed` (durable, set by `tools/list`, written through `Wire.hooks.changed` before the response) and `notified` (per stream, in memory); reconciliation when a stream opens, only for a session that has listed; a replacement `GET` closes the old stream without detaching the watch | H5; `test/wire.test.ts` |
| 3.6, custody | `sqlite-custody.ts`: records in chunks of at most 1 MiB, outcomes in segment rows of at most 512 KiB with split outcomes and an atomic index, an archive that deletes nothing, `used` and `reserved` counters topped up to the completion need before every unresolved write (the write before a send, a refused resubmit, a repeat step), refusing `full` inside the transaction before anything is written; a terminal write consumes its reservation and releases the rest; a storage failure rolls back and settles nothing. `custody.ts` lets a store's own `full` pass through `write` | `test/sqlite-custody.test.ts` (6 tests on Node's SQLite); H6 through the route |
| 3.1 to 3.3, 3.7, objects and control | `hosted.ts`: `HostedRegistry` and `HostedAgent` over a SQLite port; control requests under `artroom-mcp-control-1` (`contract/session.ts`, `bytes/session.ts` `signControl` and `verifyControl`); the checks before any effect, then current authority through the membership's observation read, then the reservation under `op` in one transaction before the handoff; enrolment by the object's own key, kept under custody before sending, read back and confirmed active before the bearer is minted; `bearer` and `retire` in one transaction with every session deleted and every stream closed with a final event; the bearer's digest compared in constant time, failures that name the agent counted per address; a 16 MiB control budget per object with 1 MiB for `retire` alone; answers retained seven days past the original request's deadline, tombstones kept | H1, H2, H3, H4 |
| 5, deployment | `packages/scope/src/worker.ts`: `McpRegistry` and `McpAgent`, `mcpRoute`, `McpEnv`; `wrangler.jsonc`: the bindings `REGISTRIES` and `AGENTS` and migration `v2`; `packages/scope/package.json` depends on `@generalbusiness/dap-mcp`; the test Worker binds `PlatformMcpRegistry` and `PlatformMcpAgent` over `PLATFORM`, with `hostedTest` lending the fixture's clock, its pause and a scripted lost reply | the stories |
| 9, docs | `docs/mcp.md`, "The hosted endpoint": routes, the controller's recipe, the control request, the bearer and its limiter, the two revisions over HTTP as the matrix, budgets and recovery including `key.revoke` as the authority-ending recovery that is not a hosted `retire`, and the observed framing overhead; the loopback section points at the shared rules | `inventory.test.ts` reads the docs |

**The checker's non-blocking points of approval 4a0af914.** A header-less
`GET` or `DELETE` without session context is `405`, stated in the docs'
matrix and in `http.ts`. Version consistency is checked before `Wire` in
both directions: a July header on a body without the July `_meta` and a
November header on July body metadata are both `-32020` (H8). A retired
agent is terminal: its bearer answers `401`, a later `bearer` under a new
`op` answers `409`, and each control operation under a fresh `op` is
charged its row against the control budget, so "retirement is always
possible" holds for as many retirements as the 1 MiB reserve admits, which
is one retirement for an agent, many times over. The operator recipe is in
`docs/mcp.md`. No retained operation and no original outcome is replaced
or forgotten.

**Corrections of review 7e00dc3a (first filing, `c6ef8a4e`).** Nine P2
findings, each repaired in source with a witness through the actual custody
and Worker paths.

| Finding | What changed | Witness |
|---|---|---|
| 1. Concurrent creation could mint a second bearer | The agent object runs its control operations one at a time (a queue), and decides the terminal transition on the durable row as it is then: an agent already enrolled answers its stored answer, one retired answers `409`, and no second bearer is minted for one creation | H1: two concurrent `create` requests under one op answer one agent, one key and one bearer; the registry lists one agent |
| 2. Expired answer bodies stayed in storage | Each object removes every answer body past its retention at the start of its next control operation, in the same transaction, from the control row and from the agent row (which held the bearer shown at creation); the row's fingerprint, deadline and state stay as the tombstone. Expiry is lazy: a copy is removed when that object next acts, so the registry's copy goes at the registry's next `create` | H3: eight days on, a replay is `409` stale and the persisted rows of both objects hold no answer body (read through a test-only hook) |
| 3. A completed control replay closed current streams | `control` returns whether this call committed the action; only a fresh action closes streams and ends sessions. A replay returns the retained answer and disturbs nothing opened since | H4: rotate, open a stream and a listen under the new bearer, replay the rotation: both stay open |
| 4. An unfinished enrolment could not be retired | `retire` is admitted while the agent is `enrolling`, under the same authority check; the creation's terminal transition re-reads the row and never revives a retired agent; `bearer` on an unfinished agent is `409` | H6: an enrolment whose reply is lost is `503` unresolved; an admin retires the reserved agent; the creation's retry is `409` retired |
| 5. Archived refusals could not be archived again | A record written live takes its archived copy's place in the same transaction; archival replaces an earlier copy. The record carries every outcome and its segment rows are never removed, so history is kept | `sqlite-custody.test.ts`: an archived refusal is resubmitted, live again, terminal again and archived again, with both outcomes |
| 6. Reservations at the wrong boundary | `CustodyStore.write` takes `dispatch: true` from custody on the writes that precede a send, a resubmit and a step, whatever the record's phase; the store arms only then, reserving the net growth (the record up to its bound plus one segment row) and refusing `full` before anything is written; a result's write consumes what is held and reserves nothing. `custody.ts` also applies the design's 256 KiB inline threshold | `sqlite-custody.test.ts`: at a saturated budget 65 lost outcomes spill and complete from the held capacity while another dispatch is refused; a step on a terminal act arms and is refused full |
| 7. Modern listens did not close gracefully | The HTTP layer keeps each listen's handle; a graceful ending completes every listen with its result on its own stream and closes the body (`Wire.endStream`); an abrupt one sends nothing | H4: a listen open at `retire` receives its result and the end of its body |
| 8. Concurrent legacy `GET`s could exceed four streams | A stream's slot is taken before the awaited snapshot and released on refusal; a session ended during the snapshot opens nothing | `http.test.ts`: with three streams open and the snapshot held, two concurrent `GET`s on two sessions admit one and refuse one |
| 9. The control body was buffered before its bound | The Worker reads the control body in chunks and cancels at the chunk that passes 64 KiB, before any object is reached; the exact bytes read are what the object digests | H3: a streaming body of unbounded length is `413` and no registry row appears |

Non-blocking: the 256 KiB inline threshold is implemented as above; an
unknown method under the modern revision stays `404` with `-32601` and a
request-only method sent as a notification stays `202` as the matrix
states.

**Corrections of review 2e85245b (second filing, `b3a7b418`).** Seven of
the nine were credited; three P2s remained, each repaired with a witness.

| Finding | What changed | Witness |
|---|---|---|
| 1. The control budget was not an aggregate: session rows and the agent row were not charged | Every persisted row of the control plane is charged by its stored bytes against one budget: a control row (its `op`, fingerprint and answer; an operation reserves 4 KiB first and its answer is charged beyond that), each session row (its JSON as stored, the difference on an update, credited when the session ends), and the agent row's configuration (its growth, so a root added is charged). A session's declared capabilities are bounded at 16 KiB, so a session row is bounded; a session the store cannot keep is not issued (`-32001`, `507`). Expired answer bodies credit their bytes; the tombstone keeps its row. The last 1 MiB stays `retire`'s | The hosted story: with a 64 KiB test budget and an 8 KiB reserve, a 20 KiB capabilities declaration is refused and an 8 KiB one is charged and credited; rotations with distinct 128-byte ops reach the ceiling and the next is `507`; at the ceiling no session is issued; after a reset the used bytes read the same and the next rotation is still refused; `retire` succeeds from the reserve |
| 2. A step on a terminal act released its capacity before the step was sent | The store releases an identity's capacity only when nothing is in flight: not on a write that precedes a dispatch, and not while any step is `sent` or `unknown`. The reservation lives through the step's durable result, a lost answer and a restart | `sqlite-custody.test.ts`: through `Custody.step` on an accepted act with the delivery paused, the reservation is held, a competing identity's dispatch is refused `full`, a lost answer keeps it, a store opened again over the same storage reads it back, the answered step consumes it, and the competitor is admitted |
| 3. A replacement `GET` could exceed four streams | A replacement takes over the incumbent's slot before the awaited snapshot, so the incumbent's cancellation during the await frees nothing for another session; a session that ends during the await opens nothing and its slot is released | `http.test.ts`: four streams open, the snapshot held, the first session's replacement entered, its incumbent cancelled, a fifth session's `GET` refused `409`, the replacement opens, four streams |

**Corrections of review ce968d18 (third filing, `e31a3c54`).** The three
earlier P2s were credited; one new P2, a P3 and the commissioned
witnesses remained.

| Finding | What changed | Witness |
|---|---|---|
| P2. A refused seventeenth `initialize` ended the oldest session first | The new session is admitted first (its capabilities validated, its row kept) and only then does a seventeenth end the oldest; a refused initialize issues no session, keeps nothing and ends nothing; a row the hook kept for a refused one is removed | The hosted story: sixteen sessions, a seventeenth with 20 KiB capabilities refused and all sixteen still served, a seventeenth at a full control budget refused with the earlier session still served, a valid seventeenth ending exactly the oldest |
| P3. Byte bounds and accounting used UTF-16 units | Every bound, debit and credit of the control budget and the capabilities bound use encoded UTF-8 bytes | 6,000 three-byte characters of capabilities are refused though they are 6,000 units |
| H1, the five fences | Test-only faults at the design's five fences (the registry's reservation, the agent's seed, the kept envelope, the accepted enrol before the registry completes, the completed result before the reply), each a thrown reset that drops the object's memory; the creation keeps the envelope with `custody.keep` and reads it back before `send` | For each fence: the request fails with no answer, both objects are reset, the retry under the same op resumes and answers, a further retry answers the same, exactly one `enrol` entry is signed by the agent's key, the registry lists one agent with that key, and the bearer serves |
| H5, the remaining assertions | | A change while no stream is open is told once at the next stream; the replacement is told nothing the session has not listed anew and receives a later change while the closed stream does not; a modern listen across a reset ends with no event, and the reopened listen is acknowledged with its ID and honored types and replays nothing |
| H6 through the endpoint | A test's custody bounds and a scripted write failure on the agent's store | With room for two completion needs, one act is accepted beside the enrolment's record and the next is refused `full` before anything is signed (the scope saw one act), while the first's retained answer is read; a write that fails as a result is written leaves the act admitted by the scope and the record unresolved, `settle` writes the receipt, and the act is never signed twice |
| H7 through the endpoint | | The plan 031 bounds hold through the route: `room`, `inspect`, an act, `steps` and `settle` each within their bound beyond the measured framing |

**Corrections of review 10e33e40 (fourth filing, `e0aa08e5`).** The
earlier P2 and P3 were credited; two P2s and the acceptance obligations
remained.

| Finding | What changed | Witness |
|---|---|---|
| 1. A failed `tools/list` persistence advanced the live `listed` marker | The transport's hook is given the prospective session state and writes the row first; the live session takes the state only once that write succeeded, for a listing and for `notifications/initialized` alike, so live and durable truth stay the same | The hosted story: a listing whose session-row write fails answers a correlated internal error and no list; a reconnect without a reset is told the change once; a listing that succeeds suppresses further reconciliation |
| 2. The completion budget was admitted after signing | `CustodyStore` gains `admit` and `unadmit`: under the exclusive admission, before the envelope is built and signed, a store with a budget reserves the new identity's completion need or refuses `full`; nothing admitted stays reserved when no record came of it | `sqlite-custody.test.ts`: through `Custody.send` with the budget held, the build is never called, no record and no reservation remain, the first identity's envelope is untouched, and after it completes the second is admitted and built once. The endpoint: `settle` for the refused key finds no record |
| H1, the fences | The agent exposes its durable facts to a test hook: its key, its state, the digest of the kept enrol intent, and whether a bearer exists | After each fence the facts are captured; after the retry the key and the kept intent are the same, the bearer exists only after the `complete` fence, and the admitted entry's intent (read through `step`) is the kept one |
| H5, the modern reset | Eviction ends every stream abruptly through the layer, with no event, before the memory is dropped | The old listen's body ends, with no result and no final event |
| The full-budget incumbent | | The session is kept before the budget fills, so the check is unconditional |
| H6 matrix through the endpoint | | A dispatch write that fails leaves the kept envelope, the retry sends it once and a later repeat returns it from the archive; concurrent send and settle on one key leave one decisive outcome; two lost replies with a reset between then settle leave one entry; a scope refusal archived at once is returned by a repeat and sent again by an explicit resubmit; 256 unresolved records (the most) refuse the next by count before anything is sent and a settle admits it; a full registry control budget refuses `create` with no reservation and no agent |
| H7 matrix through the endpoint | | Each response is a successful outcome within its bound beyond the framing: `room`, `inspect`, an act, `settle`, the declaration, `items`, `steps` paged through a continuation |

**Corrections of review 0bab47e6 (fifth filing, `444b0eb6`).** The
prospective-listed and initialized persistence, the modern reset, H1 and
H6 were credited; three P2s remained, each a missing accounting or
lifecycle path, and three nonblocking gaps.

| Finding | What changed | Witness |
|---|---|---|
| 1. The completion capacity could still fail after signing: `admit` discounted a forecast of the record's bytes, the kept rows then consumed that reservation, and the first dispatch's top-up could cross the budget after the envelope was built and signed | The need is counted on the record rows as stored, never on a forecast: the record at its bound with every row's overhead (`chargedOf`), less the record rows as stored, plus one segment row with its overhead; `COMPLETION_BYTES` is that whole cost. `admit` reserves it all before build; what a write stores comes out of the reservation one for one and a shrink of an identity in flight goes back to it, so an admitted identity's stored and reserved bytes sum to its complete cost until its result is written, and the dispatch tops up nothing | `sqlite-custody.test.ts`: an identity in flight holds exactly `COMPLETION_BYTES` between stored and reserved however small its record; at a budget one byte short of a second complete cost, `Custody.send` is refused `full` with the build never called, no record and no reservation, the first identity's holding untouched; at the boundary it is built once, the sum is whole before the build and again at the delivery, the result releases the rest. Named red: on the source at `444b0eb6` the witness fails at the first sum (2,620,925 for 2,621,440) |
| 2. A pending listing could resurrect a deleted session: the listing awaited the page, then persisted a copy of the session it had captured, and `DELETE` (or rotation, retirement) had removed the row meanwhile; the upsert recreated it and a restart restored it | A session that ended carries `ended`; the hook is given the live session and the prospective change, and persists only a session that has not ended. `DELETE`, the seventeenth's eviction, a refused `initialize`, `closeAll` and `abrupt` end their sessions, so a layer discarded with its sessions persists nothing more. The fallback `initialized` of a listing without `notifications/initialized` is now durable before it moves too | The hosted story: a listing's configuration read is held, the session is deleted while it waits (the row credited), the read released; the listing still answers its request, the control budget is as before the session and the session count is 0; after a reset the old ID is `404` for `POST` and `GET`, the budget unchanged, and a fresh session is issued and served. Named red: on the source at `444b0eb6` the budget after the listing is 5,284 for 4,958 |
| 3. A legacy loopback client that disconnected while its stream was opening leaked its slot: the opening held the slot across the snapshot, the server subscribed to the socket's close only after the handler returned, and a close during the await was never seen | The loopback server tracks the socket's close before the handler is awaited and passes an abort signal with the request; the layer's opening releases its slot and attaches no stream when the signal is aborted after the snapshot; a body returned to a closed socket is cancelled at once | `http.test.ts`, over loopback: a GET enters while the snapshot is held, its socket closes, the snapshot is released; the slot count returns to 0 and the session has no stream; four healthy opens then take the four slots. Named red: on `node.ts` at `444b0eb6` the slot is never released |
| Nonblocking: the fallback `initialized` | Durable with the listing's row before the live marker moves (above) | The listing's persistence witnesses |
| Found by the gate: the stdio server dispatches every line of one read at once, and since the fourth filing `notifications/initialized` awaited its hook before the live marker moved, so a `tools/list` in the same read could be refused "Not initialized" | With no persistence hook (stdio, loopback) the live `initialized` marker moves at once, before any other line of the read is dispatched; with a hook, durable first as before | `wire.test.ts`: `notifications/initialized` and `tools/list` dispatched in the same turn, with no hook, list; the first gate at this head's predecessor failed the stdio story on exactly this, and it passes alone and after the change |
| Nonblocking: H6 resubmit | | The custody record under the key is read in the agent object: after the plain repeat, attempt 1 with one outcome; after the explicit resubmit, attempt 2 with two outcomes and the same intent digest, the same envelope sent again |
| Nonblocking: H7 continuation | | The `steps` continuation is followed to exhaustion: more than one page, the last without a cursor, and the pages together equal the directory's whole history as an independent reader pages it, each step once and in order |

**Corrections of review fe82ee58 (sixth filing, `056e1fea`).** The three
P2s of the fifth filing and the stdio ordering were credited; two P2s and
three P3s remained.

| Finding | What changed | Witness |
|---|---|---|
| 1. An aborted replacement lost live capacity: the replacement took the incumbent's slot before the snapshot, and when its client went away it returned with no body, so the incumbent stayed open and uncounted and four incumbents were counted as three | The layer owns capacity across every exit of a replacement: it counts the replacements being opened for a session, and one that exits without opening gives the slot back to the incumbent when the incumbent is still the session's live stream and no later replacement holds it (`http.ts`) | `http.test.ts`, over loopback: four live incumbents, a replacement of the first that goes away while the snapshot is held, the snapshot released; four streams are counted, the first session still has its stream, and a fifth session's GET is refused. Named red: on `http.ts` at `056e1fea` three are counted and the fifth is admitted |
| 2. A result write that failed after the scope had answered was reported as "nothing was sent": the plain storage failure became `unreadable`, and that finding's sentence says nothing was sent, though the envelope was sent, the record stays `sent` and the act may have taken effect | What comes of a dispatch is kept by one method, after the answer or the lost reply; a store that fails there raises `unkept` with the answer (or `lost`), and the finding says the envelope was sent, what the scope answered, that the outcome was not kept, that the act may have taken effect and nothing was sent twice, and that settle under the same key is next (`custody.ts`, `errors.ts`, `service.ts`) | The hosted story: the scope accepts, the result write fails; the result is `custody` with state `unkept` and answer `accepted`, its sentence says the scope answered accepted and the act may have taken effect and never that nothing was sent; the record is read back as `sent`; the scope holds one entry; settle under the same key writes the receipt and a repeat is retained. Named red: at `056e1fea` the state is `unreadable` and the sentence says nothing was sent |
| P3: a late initialized hook | After the row is written, a session that ended meanwhile takes no live marker and no watcher (`wire.ts`) | Covered by the ended-session fence; no asynchronous hosted hook exists to witness, as the report says |
| P3: H7's loops | Each loop asserts that its last page has no cursor, and that the positions paged reach the scope's own head as the last read reported it | The H7 story |
| P3: the overview's `405` | The overview says what the matrix says: `GET` and `DELETE` are served under the 2025-11-25 header only, `400` without a session ID, `404` without a live session; `405` with `Allow: POST` under no header or the 2026-07-28 header (`docs/mcp.md`) | Read |

**Corrections of review 1dcf27be (seventh filing, `b366d97c`).** The
single aborted replacement, the act's outcome-not-kept boundary, the
late-initialized check and the H7 exhaustion were credited; two P2s and
two qualifications remained.

| Finding | What changed | Witness |
|---|---|---|
| 1. Overlapping replacement generations could still leave a live stream uncounted: capacity was counted by stream and replacements by session, so R1 and R2 replacing A, R1 installing B, R3 replacing B and going away, then R2 going away last, left B live and uncounted | One capacity owner per session: the session holds one slot from the moment an opening is admitted, across every opening pending for it and the stream it holds, until it has no stream and no opening pending; a fresh open takes the session's slot or is refused, a replacement takes nothing new, and whatever overlaps and aborts in whatever order, a session with a live stream is counted exactly once (`http.ts`) | `http.test.ts`, over loopback, with one hold per snapshot read: A and three others live; R1 and R2 replace A, each held; R1 released installs B; R3 replaces B, is held, goes away, is released; R2 goes away last and is released; four streams are counted, the session's stream is B and still serves, and a fifth session's GET is refused |
| 2. A preparation step's answer the store could not keep was reported as "nothing was sent": `step` wrote the step as sent, dispatched, received the resource's answer, and a plain write failure became `unreadable` | The step's post-answer write raises `unkept` with the answer (or `lost`) and the step's identity (resource, capability, step); the finding says the step was sent, what the resource answered, that the answer was not kept, that the step may have changed the resource and the act is not submitted, and that the same prepare under the same key, resource, capability and step is the recovery, not settle (`custody.ts`, `errors.ts`, `service.ts`) | The hosted story, on a lane the agent holds a commitment and a hold on: a standalone `hold@1:instance` step the lane accepts, its answer write failing; the message names the step, the lane and `accepted`, never "nothing was sent"; the record read in the object is `sent` with the step `sent`; the lane holds one preparation entry; the same prepare again is answered, the record settles with the same intent and nothing reserved, still one entry. The ordinary form: a report staged and answered, then its check step with the answer write failing; the act stays `prepared` with the check `sent` beside the answered stage; the same prepare again answers it. Named red: at `b366d97c` the message is "unreadable; nothing was sent" |
| A pending GET after `abrupt` | The opening checks `ended` after the snapshot, so a layer discarded while a GET was pending opens nothing on it (`http.ts`) | By the ended check; no live eviction witness is claimed |
| H7's baseline | Beside the head the last read reported, each loop's pages are compared with the native fixture's own reading of the directory, apart from any MCP implementation (the room fixture now names the fixture's inspector reader, which no agent presents): they end at or before the native head and at or past the first page's head | The H7 story |

**What differs from the design's words.** The `create` body is
`{ link }`, the agent-key invitation link itself, rather than its fields
spelled out: it is the same information, already encoded and validated by
`agentKeyInvitationOf`, and it carries the repository references the
agent's configuration needs. The bearer's failures are counted by the
agent they name, per address, because a Worker has no state across
isolates; a request naming no valid agent is `401` and counted nowhere,
which brute-forces no secret. The hosted agent's `service` is the
invitation's, recorded at creation. The watch timer is the runtime's
`setInterval` while a stream holds the object.

**What ran in this head.**

| Command | Result |
|---|---|
| `npx vitest run --config vitest.config.ts` in `packages/mcp` | `Test Files  9 passed (9)`, `Tests  96 passed \| 1 skipped (97)` (observed, after the corrections of reviews 7e00dc3a, 2e85245b, ce968d18, 10e33e40, 0bab47e6, fe82ee58 and 1dcf27be): the wire tests with the modern headers and the same-turn dispatch, H8 over loopback with the concurrent admission, the disconnected opening, the aborted replacement and the overlapping generations, the SQLite store with the archived-refusal, saturated-budget, terminal-step and exact-boundary cases |
| `npx vitest run --project scope packages/mcp/test` | `Test Files  8 passed (8)`, `Tests  25 passed (25)` (observed, after the corrections of review 1dcf27be): the stories, with H1 to H8, the fences, the budget, the ended session and the two outcome-not-kept cases of `hosted.scope.test.ts` |
| `npm run gate`, once, at the exact head | The planner's local gate at the exact reviewed head, on Git 2.54, is a CLOSED public projection at `~/play/artroom-diagnostics/mcp-hosted-gate-<head>/public-result.json` (read-only, with the gate script's own logs and SHA256SUMS), named with its SHA in the review request. Its figures are not written into this head, which would move the head it gates. The gate at the head before the page and counting modules were regenerated failed exactly their two asset-equality tests, as expected for a bytes or contract change, and passed after the regeneration (observed, 1158 passed, 3 skipped). |

**Paths.** The discovery head landed as main `8235c6b3` while this head was
being built, and main moved again to `27bb745f` (the logo and self-host
delivery records), to `2a40db9b` (the Counter preparation note) and to
`dedcb14b` (the architecture diagram, the `dap.js` rename and the
invitation service URL check, the sprint report and the Lending library
baseline) and to `5e11ca03` (the agent-key cohorts, the Counter
documentation, the Library homepage and the fold publication) during
review; main was merged into the branch each time, taking main's version
of every path this head does not change. The merge of `dedcb14b` met
main's Lending route beside this head's hosted route in the Worker's
fetch and kept both; each merge regenerated the page, counting and
lending Worker modules and their built assets, since each bundles the
bytes package this head changes. At the head, `git diff --name-only
origin/main...HEAD` lists this head's own 30 paths and no other (the
thirtieth is the room fixture of the MCP stories, which now names the
fixture's inspector reader).

## What is owed

- **The hosted endpoint** of plan 031's stage 2 is built in this head (the
  section above). Owed after it lands: the planner's deployment of the
  scope Worker with the two new bindings and the migration, the live check
  against the deployment, and a note-only head recording it; the `export`
  control action for a budget-full agent; OAuth, the pinned diff and file
  reads, resources and prompts. The handler stays the minimal one; the SDK
  choice is unchanged.
- **The optional amendment of `docs/cli.md`**, naming `dap mcp` in its
  list of commands and pointing at `docs/mcp.md`. The usage line is in the
  command line; the guide is not amended.
- **`credential`'s reads**: 3 where plan 031 counts 1, as reported above.
- **A dead reclaimer needs an operator.** A reclaim lock is never broken,
  so a process that died inside the short reclaim section leaves its lock
  refused as `locked` until an operator removes the reclaim file named in
  the refusal. Mutual exclusion holds; recovery is manual. Automatic
  recovery would need an atomic conditional replace of a file, which Node
  does not give.
- **Parity of the MCP join with the Start head's join.** Once the Start
  head lands, the MCP `join` tool is to be assessed against its tagged
  agent-key command line join and its `--check` (checker request 34c4).
  The MCP join still uses the invitation-link parser, which is correct for
  the links the room issues today.
- **No gitseq request** was recorded from this session: no gitseq tool was
  available in the cloud container. The requester records one for this
  head.
