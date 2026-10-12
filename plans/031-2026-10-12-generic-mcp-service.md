# One MCP service for every dap application

2026-10-12. Draft 1, for checker review before implementation.
Planned against main `d309b6b9baca9e6a51a1dfb2c7979145463b229c`.

Hugh's direction, 2026-10-12 13:50 Eastern: the MCP plan
(`notes/2026-10-01-mcp-plan.md`, revision 4, and plan 009) is reasonable,
but it needs a design that really proves four things:

- (a) every activity is accessible over the MCP surface, driven by the acts
  that are available in the space;
- (b) the tool descriptions are readable enough that an agent chooses
  easily, and the error messages are readable when they are needed;
- (c) one MCP service supports all dap applications, with no per-application
  MCP code;
- (d) it is efficient.

This note is that design. It keeps the decisions of the MCP plan that still
hold under the scope model (section 1), replaces the plan's tool list, which
was written for the earlier room model, and states for each of the four
claims what proves it (section 9). It changes no protocol rule. It is to be
built in a cloud session on a branch (section 11), with checker review of
the head.

## 1. What is kept, and what this note replaces

The MCP plan was written on 2026-10-01 against the earlier model: a `RoomApi`
with lanes, leases, bearer tokens and fourteen named code-review tools. That
model is parked (`parked/README.md`); the parked `packages/mcp` is not built
or deployed, and no MCP server exists today (`docs/scopes.md` lists the HTTP
routes that do). The I1 to I5 deliveries replaced it with the scope model:
definitions are data, every change is a signed intent judged by a scope,
and a room is a set of scopes (`docs/scopes.md`).

Kept from the plan, as adopted on 2026-10-01 (`775acdd3`) and clarified in
plan 009:

| Kept | Where it now lives |
|---|---|
| MCP is a transport, never an authority. Every write is one signed intent, judged by the scope. | Section 3: `act` signs one intent; the server derives no judgment. |
| Tools are complete; resources, prompts and the rest are enhancements. | Section 3: nine tools; nothing else is required. |
| Stateless server. State stays with its owners and is reached by handles. | Section 7: scopes, item IDs, cursors and idempotency keys are the handles. |
| Retries are safe and repeat the same prepared meaning. | Section 7: a retry under the same key resends the same signed envelope. |
| A context budget, measured. | Section 8. |
| Applications extend MCP as data, never as code in the server. | Section 5: a definition is the extension. |

Replaced: the fourteen named tools, the `claim`/`workspace`/`land` loop,
bearer-token signing by the room, toolsets by role, and the `/v1/rooms`
endpoint. None of those names a thing that exists now. The generic
`acts` and `act` pair of the plan's section 4 is the whole design here, not
an escape hatch beside a fixed vocabulary.

## 2. Why one generic service is complete

A dap application is a definition: a JSON value that declares item types,
acts, handlers, timed rules and rules (`docs/scopes.md`, "Definitions are
data"). A room is a set of scopes, each pinned to one definition. The
platform's own scopes (register, directory, membership, rules, destination,
inbox) are definitions of the same form, with a few guards and field types
that are marks for platform code. The Counter is a definition
(`examples/counting/definition.json`). The issue and change lanes are
definitions, and so are their demo profiles.

Every activity in dap is therefore one of:

1. a **read** of a scope: its summary, items, history, one entry, a retained
   input (a definition, a detached text, a value);
2. a **signed intent** for an act that the scope's definition declares, with
   the values and texts that travel beside it;
3. **outside work** that a read or an act hands to a tool the agent already
   has: a Git clone with a read token, a commit, a push to the destination's
   host.

The command line proves this by construction. Its single-act commands
(`acts`, `act`, `log`, `show`, `verify`) are one read or one intent. Its
composite commands (`issue open`, `propose`, `edit`, `merge`, `clone`) are
sequences of reads, intents and Git (`packages/cli/src/commands.ts`,
`issueOpen` and `activeDefinition`). The page does the same with the same
functions (`packages/page/src/data.ts` imports `heldActs`, `describe`,
`expectedOf` and `valueOf` from the CLI package).

So a server that offers reads, the derived list of acts a caller may sign,
one signing submit, and the two or three helpers that every composition
needs (wait for a created scope, settle a lost reply, read a text) is
complete for every application, present and future, without naming any act.
Section 9's inventory (W1) lists every CLI command and page action against
the tools that perform it, so completeness is checked, not asserted.

## 3. The tools

Ten tools. Names are short; the host namespaces them. Every input and
output schema has an object root. A refusal is a normal result
(`isError: false`) with the scope's `Answer` as structured content; a
failure before or beside the scope's judgment (transport, shape, custody) is
a tool error (`isError: true`) with a structured `{ error, message, next }`
(R-API-1 of `docs/protocol.md`, section 21, kept).

| Tool | Does | Reads | Annotations |
|---|---|---|---|
| `room` | Orientation: the service, the repository's scopes with their names (directory, membership, rules, destination, inbox), who I am (handle, role, key ID) and whether my role is known, the active definitions (name, digest), and the lanes the directory lists with number, kind, title and state. | membership summary, directory summary, rules summary | read-only |
| `scope` | One scope: its definition name and digest, status, head, counts by item type and state, and its live items, bounded; a cursor hands the rest to `items`. | summary | read-only |
| `acts` | The acts I may sign on a scope now, each with its sentence, its fields as a JSON Schema, the guards as sentences with their refusal names, and what the act opens or moves. States how many acts my role cannot sign. For a field that names a definition by digest, lists the active definitions as choices. | summary, definition, membership summary; rules summary when a definition field is present | read-only |
| `act` | Signs and submits one act: `scope`, `kind`, `on`, `fields`, optional `idempotencyKey`. Checks each field against its declared type before signing. Detaches a text field given inline and carries it beside the intent. Fetches the bytes of a definition that a digest field names from the rules scope and carries them as a value. Sets `expected` revisions from the summary. Returns the scope's answer; on `accepted`, the fact (scope, seq, hash), and the scopes the entry created when they are readable within a short bound. | summary, definition, rules retained; one POST | not read-only, not destructive, idempotent |
| `items` | A page of a scope's items of one type: live or final, with a cursor. | items | read-only |
| `history` | A page of a scope's entries, oldest first, each as one line: seq, time, kind, signer, effects and sends counts; `entry` for one in full. | history | read-only |
| `entry` | One entry in full: its input, fields, effects, sends and hash; a detached text's digest resolves with `text`. | entry | read-only |
| `text` | A retained detached text by scope and digest, or a value in its byte domain. | retained | read-only |
| `wait` | Waits, at most 60 seconds, until one of: a scope's head reaches a seq; an item of a type reaches a state; an entry's created child scopes exist and are active. Returns what it saw and whether it timed out. Never writes. | summary, polled at a bounded interval; stream route where available | read-only |
| `settle` | Was the intent I sent under `idempotencyKey` accepted? Resends nothing. Returns the receipt, `not-found`, or `unknown` when the custody record exists but the scope answered unavailable. | settle | read-only |

Of the ten, `settle` and `wait` are the two helpers every composition
needs, `text` the one every reader needs. The count that matters for the
budget is the whole list (section 8).

**Server instructions**, at most 512 characters: start with `room`; call
`acts` on a scope before `act` on it; an act's answer is the scope's
decision, and a refusal names the guard that failed and what to change;
after `accepted`, use `wait` to see what the entry created; after a lost
reply, `settle` with the same `idempotencyKey` instead of signing again;
nothing here grants authority; what you may sign is what your role holds.

**Not in the list, on purpose.** No per-act tools. One tool per act gives
the best per-tool description but puts every act of every scope of the room
into `tools/list` on every call (a room with the full change definition has
54 acts on each change lane). It also cannot be stable for a stateless
hosted server. `acts` gives the same descriptions and schemas, for one scope,
when the agent is about to act there, and the agent pays for only those
(section 8). A host that prefers code mode can generate code from `acts`
output.

No `verify`, no `clone`, no `propose` as tools. `verify` is a verifier over
reads that an agent runs as a command; `clone` and `propose` are Git work
that the agent does with Git, after `act` of the destination's `read-token`
and `text` of the credential. Section 9's inventory names each step.

## 4. Readable descriptions, derived from the declaration

A definition has no description text (`docs/cli.md`, "An act definition has
no description text"). The command line's one-line `describe` is made from
the act's step, item and grant. The MCP server derives more, from the same
declaration, in sentences an agent can act on. The derivation is a pure
function of the act's declaration, the item types it names and the caller's
standing; it is the same for every definition, platform or declared.

**The act's sentence.** `<kind>`: `opens a <item>` | `moves a <item>` |
`comments on a <item>` | `comments on no item`; then who may sign: `needs
<action>, which your role (<role>) holds` | `needs <action>, which your role
does not hold` | `the rule <code> decides who may sign`. For a transition,
the states it leaves and the states it can reach, read from its `state`
guards and its state effects: `from open or triaged, to closed`.

**Fields.** One line each: name, whether required, the type in words, and
its bounds: `body (required): text, up to 65536 bytes, kept apart from the
entry; give it inline`; `mentions: list of up to 16 members, as @handle`;
`replyTo: the ID of a comment item on this scope`; `role (required): one of
admin, maintainer, member, agent, checker`; `definition (required): the
digest of an active definition; choices: issue
sha256:82a9…, change sha256:d86c…`. The JSON Schema beside it carries the
same facts for a host that validates.

**Guards, as sentences with their names.** Each guard becomes one sentence,
and the sentence is keyed by the guard's declared `reason` when it has one,
so a refusal `guard-failed` with name `not-activated` points at the sentence
that explains it:

| Guard | Sentence |
|---|---|
| `state` | `the <subject> is <state or states>` |
| `signer` | `you are the <subject>'s <slot>` |
| `notIn` | `neither you nor your principal is the <subject>'s <slots>` |
| `set` / `unset` | `the <subject>'s <slot> is set` / `is not set` |
| `equals` / `differs` | `<operand a> equals <operand b>` / `differs from` |
| `some` / `none` / `count` | `some <type> is <states> where <clauses>` / `no <type> is …` / `between m and n <type> are …` |
| `every` / `each` / `has` | `every item in <list> is <states>` / `for each element of <list>, …` / `some element of <list> …` |
| `fact` | `<field> names an entry of kind <kinds> under <definition>` |
| `before` / `after` | `now is before <slot>` / `after <slot>` |
| `rule` | `the rule <name> holds: <its expression, verbatim>` |
| `anyOf` | `one of: (…) or (…)` |
| `capability` | `<capability>'s own rule holds` |
| platform mark (`code`) | the platform's own one-line text for that mark, from a small table in the server keyed by `platform:<name>@<version>` and the mark's code; the table is part of the platform's documentation, not of any application |

Operands read as `the act's <field>`, `the <subject>'s <slot>`, `you`,
`this scope`, a constant, or `nothing`. A sentence that would exceed 200
characters is cut at a clause boundary with `…`; the schema keeps the full
form.

**Worked examples** (the delivery must show these four exactly as the
server renders them, in `docs/mcp.md`):

- `comment` of `issue-demo`: `comment: opens a comment; needs issue.comment,
  which your role (member) holds. Fields: body (required): text up to 65536
  bytes, given inline; mentions: list of up to 16 members as @handle;
  replyTo: the ID of a comment on this scope. No guards.`
- `take-hold` of the derive fixture: three guard sentences: `the commitment
  named by the field commitment is accepted`; `you are that commitment's
  performer`; `no hold is held under that commitment`.
- `open-issue` of `platform:directory@2`: `opens a lane; needs issue.open,
  which your role (admin) holds. Fields: definition (required): the digest
  of an active issue definition; choices: issue sha256:82a9…; title
  (required): text up to <bound>; body: text up to 65536 bytes, given
  inline; conditions (required): list of up to 16 texts. Guards: the
  definition is active in the rules scope (not-activated).`
- `join` of `counting`: as the derivation renders it; the delivery note
  reports whether the Counter's rule guards read well or need the optional
  `doc` member of section 10.

**Why derivation first, authored text second.** Derivation is complete on
day one for every definition, cannot drift from the declaration, and needs
no per-application code or data. Authored text makes the sentences better.
Section 10 proposes the one small contract change that would let a
definition carry its own `doc` text, optional and ignored by every judge,
and names it as stage 3. The design does not depend on it.

## 5. Readable errors

Every answer that is not `accepted` becomes a sentence with four parts: what
was asked (scope, kind, on), what the scope answered (the answer and its
reason, and the guard name when there is one), the head it was judged at,
and the next step. The next step is fixed per reason, so an agent can learn
it once:

| Answer or error | Sentence pattern | Next step |
|---|---|---|
| `refused` `guard-failed` with name | `<scope> refused <kind>: <guard sentence> does not hold (<name>), judged at head <seq>.` | Read the subject with `scope` or `items`; change the field or the state the sentence names; sign again with a new key. |
| `refused` `guard-failed` without name | same, with the guard's position: `guard 3 of 3`. | same |
| `refused` `unauthorized` | `your key holds no current grant for <action> on <scope>.` | `room` to see your role; ask an admin. |
| `refused` `unknown-act`, `bad-field`, `no-item`, `required-unset` | names the field or item and its declared type. | `acts` on this scope; correct the field. |
| `refused` `revision-moved` | `an item this act names changed since it was read.` | Read again, sign again. |
| `refused` `expired`, `scope-full`, `final`, `slot-full`, `type-full`, `entry-too-large` | one sentence each, naming the bound where there is one. | stated per reason |
| `unavailable` any reason | `<scope> did not judge <kind> (<reason>). Nothing is known to have been accepted; timed entries may have been written.` | `settle` with the same `idempotencyKey`; do not sign again first. |
| `mismatch` | `your key already signed another intent under this idempotency key.` | Use a new key for new meaning. |
| read refusal `forbidden` | `your session cannot read <scope>.` | `room` to check standing; a scope outside the repository needs its own session. |
| `ShapeError` (before signing) | `field <name> <what is wrong>; declared type: <type>.` | Correct the field. |
| `TransportError` (lost reply) | `the reply from <scope> was lost or malformed; the outcome is unknown.` | `settle` with the same key. |
| custody (section 7) | `the record of your earlier intent under <key> is <absent|full|unreadable>.` | A new key for new meaning; never guess. |

Two rules hold for every message. It never contains a session token, a key
byte, an invitation secret or a credential: a test asserts this over every
tool's output and error for a story that uses all of them. And it never
claims more than the answer shows: a refusal category alone does not prove
that nothing was written (`docs/scopes.md`, the four answers).

## 6. One service, every application: the boundary

The server package (`packages/mcp`, new source; the parked package's ledger
row is updated to name this as its successor) imports `contract`, `bytes`,
`client`, `platform` and, for guard rendering, the derive package's operand
helpers. It imports nothing from `lanes`, `examples`, `page` or `checkers`,
and `scripts/active-source.test.mjs` is extended to refuse such an import.
The platform package is allowed because the platform's six definitions are
part of every room, not an application.

Standing (who I am, which actions my role holds) comes from the membership
scope: the repository's, as the configuration names it; or, for a scope
founded outside the repository model such as a Counter under its cohort, the
membership that the scope's directory records. When standing cannot be read,
`acts` lists every act with `authority unknown` and `act` still signs; the
scope judges. Hiding is never authorization.

Witness (W2 in section 9): one story test runs the same server, with no
configuration difference but the room, against a repository room with an
issue lane under `issue-demo`, and against a Counter scope under
`counting`, and performs one real activity in each through `room`, `acts`,
`act` and `wait` only.

## 7. Transport, identity and retries

**Where it runs.** Stage 1 is a local server beside the agent, signing with
the key in the agent's own `ARTROOM_HOME`:

- stdio: `artroom mcp`, for hosts that launch a process;
- streamable HTTP on a loopback address: `artroom mcp --http 127.0.0.1:<port>`,
  the same server, for hosts that only speak HTTP. It binds loopback only
  and refuses any other host header.

The key is the device key of a person, or an agent key enrolled by the agent
key invitation that the builder's `request/agent-key-node` branch adds
(`artroom join artroom-agent-key:…` into a separate `ARTROOM_HOME`). The
server reads with a session it asks membership for, kept in memory,
renewed before a read when it has ended, as the page does; a signed read is
the fallback where a session is refused. The config file holds no secret,
as now.

Stage 2 is the hosted endpoint on the scope Worker, `POST /mcp`, for hosts
that cannot run a process. It needs a bearer that maps to an agent key held
in the Worker's credential store, enrolled by a controller through the same
agent key invitation. That custody is a change to the Worker and its secrets
and is not built in the cloud session (it cannot deploy). The server code is
the same module; only the signer and the reader differ.

**Stateless.** No state between calls except the process's in-memory
session token and the custody file below. A call rebuilds what it needs from
the configuration and reads. Cursors, item IDs, scope IDs and idempotency
keys are the handles.

**Retries and prepared meaning.** `act` takes an optional `idempotencyKey`.
When given, the server keeps, before sending, the exact signed envelope and
its beside values in an owner-only, bounded, append-only file
`private/mcp-intents.jsonl` in `ARTROOM_HOME`, keyed by the idempotency key
and the scope. A second `act` with the same key resends that envelope and
does not sign again. `settle` reads the same record and asks the scope. A
key that is absent, or a record that is full (bound: 256 records, 1 MiB) or
unreadable, is reported as the custody error of section 5 and nothing is
sent. This is the page's join custody pattern applied to every act. Without
`idempotencyKey` the server makes a fresh key, returns it in the answer, and
keeps the same record, so a lost reply is still settleable.

**SDK.** The implementation pins one MCP server SDK version in the reviewed
commit, with the lockfile, and uses its stdio and streamable HTTP transports
in stateless mode. The alternative of a minimal JSON-RPC handler for
`initialize`, `ping`, `tools/list` and `tools/call` is acceptable if the
SDK's bundle or its transport assumptions do not fit the Worker; the
delivery note states the choice and its reason. The wire tests (section 9)
drive the server through a real client over both transports, so the choice
is not visible to them.

## 8. Efficiency

Budgets, each measured by a test that fails over budget, with the method
named so the number is reproducible:

| What | Budget | How measured |
|---|---|---|
| `tools/list` as sent, all ten tools with schemas | 8 KiB of UTF-8 JSON; each description at most 1,000 characters; instructions at most 512 | bytes of the canonical JSON the server sends; a named tokenizer's count is recorded in the delivery note as an observed figure, not a gate |
| `acts` output | at most 16 KiB for the full change definition (54 acts); the 19-act demo profile under 6 KiB | bytes of the result's text content |
| `room` output | 8 KiB, lanes bounded at 50 with a cursor | bytes |
| Reads per tool call | `room` 3, `scope` 1, `acts` at most 4, `act` at most 3 reads and 1 POST, `wait` bounded by its interval, others 1 | an instrumented transport in the test counts calls |
| Canonical activities | open an issue and learn its number: `acts`, `act`, `wait` (3 calls); comment on it: `act` (1 call, after `acts` once per scope); read an issue with its comments: `scope`, `text` per comment | counted from the story test; reported as a sum of steps |
| `wait` | polls at 1 second, at most 60 seconds; uses the stream route when the session allows | the test's gate and clock, no sleeps |

`acts` costs what it costs because it is the one place that carries
descriptions. An agent calls it once per scope it works on, not once per
act. The sentences are derived at call time from the definition the scope
retains, which the server reads once per call; a hosted server may cache a
definition by digest, since a digest's bytes never change.

## 9. What proves each claim

| Claim | Witness | Where |
|---|---|---|
| (a) complete | **W1 inventory.** `docs/mcp.md` lists every command of `docs/cli.md` and every page action (`docs/page.md`) with the tool calls that perform it, and for Git steps, the act and read that hand the agent what Git needs. A test asserts that the sentence and schema derivation is total over every act of every definition in the repository: the six platform definitions, `issue`, `change`, `issue-demo`, `change-demo` and `counting`. | `packages/mcp/test/inventory.test.ts`; `docs/mcp.md` |
| (a) driven by available acts | **W2 story, room.** Against the real test Worker: found a room, publish rules, activate the demo definitions, open an issue, comment, assign, close, open a change by `propose-file`, review, merge; all through the tools over an in-process client. `acts` before each `act`, and the test asserts that every kind it signs was listed. | `packages/mcp/test/room.scope.test.ts` |
| (c) one service | **W2 story, Counter.** The same server, a Counter scope: `join`, `start`, `spoken`, `leave`. No counting import in the server; the import boundary test refuses one. | `packages/mcp/test/counter.scope.test.ts`; `scripts/active-source.test.mjs` |
| (b) descriptions | **W3.** The four worked examples of section 4 are snapshot tests whose expected text is in `docs/mcp.md`, so the checker reads what an agent reads. A test bounds every description and sentence. | `packages/mcp/test/describe.test.ts` |
| (b) errors | **W4.** Table-driven: for each refusal reason, unavailable reason, mismatch, read refusal, shape error, transport error and custody error, the sentence names the scope, the kind, the head where there is one, and a next step. One story drives a session token, a key, an invitation secret and a read credential through the server and asserts none appears in any output or error. | `packages/mcp/test/errors.test.ts` |
| (d) efficient | **W5.** The budget tests of section 8. The delivery note reports the observed byte sizes and read counts from one run, labelled as observed. | `packages/mcp/test/budget.test.ts` |
| retries | **W6.** With a transport scripted to lose the reply, `act` twice under one key sends byte-identical envelopes; `settle` then finds the receipt; a full custody file blocks a send. | `packages/mcp/test/custody.test.ts` |
| transports | **W7.** A real MCP client over stdio and over loopback HTTP lists tools and calls `room`; the HTTP server refuses a non-loopback host header. | `packages/mcp/test/wire.test.ts` |

Each test states its invariant in one sentence first (`docs/testing.md`).
The scope tests use the test Worker pool of `packages/scope`, as the CLI's
`claim.scope.test.ts` does. No mutation sweep; a bounded set of controls
where a guard in the server (custody full, non-loopback host, secret in
output) needs a paired case.

## 10. Later stages, and one optional contract change

- **Stage 2, hosted.** `POST /mcp` on the scope Worker with agent-key
  custody in the credential store, bearer per agent, same server module.
  Needs deployment; local builder.
- **Stage 3, authored text.** A contract amendment that lets a definition,
  an act, a field and a guard carry an optional `doc` string, at most 400
  characters, that the validator accepts and no judge reads. It is part of
  the canonical bytes, so it is part of the digest; an application that adds
  it activates a new digest. The server prefers `doc` where present and
  derives where absent. This is the one change that makes descriptions as
  good as a person would write, and it stays data.
- **Later.** OAuth for hosts that cannot set a header; resources for
  `docs/manual`; prompts for the composite activities of W1; a live
  subscription over the stream route.

## 11. The build

One cloud session, on a branch from main, with the brief in the planner's
scratchpad (`cloud-mcp-prompt.txt`). It delivers:

- `packages/mcp`: the server, the derivation, the custody, the two
  transports; `artroom mcp` in the CLI;
- the eight test files of section 9;
- `docs/mcp.md`: how to connect an agent host, the tool reference as sent,
  the four worked examples, the W1 inventory, the budgets and the observed
  figures;
- `notes/2026-10-13-mcp-generic-delivery.md`: what was built, what ran, what
  the figures were and how they were taken, and what is owed;
- the parked ledger row for `mcp` updated; the SDK pinned in the lockfile
  in the same commit.

The session cannot reach a deployment or the workroom. The planner files its
head for checker review and lands it after the verdict. The cloud container
is known to fail one Git-version test (`packages/checkers`, T36); the note
says so if it recurs.

## 12. Decisions recorded here

1. Generic tools only; no per-act tools (section 3).
2. Descriptions derived from the declaration; authored `doc` text is a
   later, optional amendment (sections 4 and 10).
3. The server signs with the agent's own key beside the agent; the hosted
   endpoint with key custody is stage 2 (section 7).
4. Retries are kept as exact signed envelopes in a bounded private file,
   as the page's join custody does (section 7).
5. Budgets are bytes, measured, with token counts reported as observed
   figures (section 8).

What would send this back for a design correction, as the plan's "When to
stop" says: a need to re-sign automatically, to hold a key the agent did not
enroll, to add an act kind in the server, or to describe an act from
anything but its declaration and its optional `doc`.

## 13. Sources read for this note

`notes/2026-10-01-mcp-plan.md` (sections 1, 4, 6, 10, 14);
`plans/009-2026-10-03-mcp-clarification.md`; `docs/protocol.md` section 21
and section 34; `docs/scopes.md`; `docs/cli.md`; `docs/page.md`;
`docs/testing.md`; `packages/cli/src/commands.ts` (`heldActs`, `describe`,
`expectedOf`, `act`, `issueOpen`, `activeDefinition`);
`packages/page/src/data.ts` (`actsOn`); `packages/contract/src/result.ts`;
`packages/platform/src/membership.ts` (roles and actions),
`directory.ts` (`open-issue`), `rules-scope.ts` (`keep-configuration`,
`activate`); `packages/scope/src/worker.ts` (routes); `parked/mcp/src`
(`server.ts`, `worker.ts`, `stdio.ts`); `examples/counting`;
`request/agent-key-node` (`agent-key-invitation.ts`, its `docs/cli.md`
diff).
