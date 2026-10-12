# One MCP service for every dap application

2026-10-12. Draft 4, for checker review before implementation.
Planned against main `d309b6b9baca9e6a51a1dfb2c7979145463b229c`.
Draft 1 (`ab740346`) received changes requested in review `ca8a00f6`, with
eight corrections; Draft 2 (`41ed9eff`) answered each, and section 14 maps
them. Draft 3 (`1c802763`) followed Hugh's directions of 2026-10-12 14:37
and 14:44 Eastern: a dynamic tool list, one tool per act kind of each
definition the room holds, and both MCP wire revisions. Review `85c4e1b0`
requested seven more corrections; Draft 4 answers them, and section 16
maps them.

Hugh's direction, 2026-10-12 13:50 Eastern: the MCP plan
(`notes/2026-10-01-mcp-plan.md`, revision 4, and plan 009) is reasonable,
but it needs a design that really proves four things:

- (a) every activity is accessible over the MCP surface, driven by the acts
  that are available in the space;
- (b) the tool descriptions are readable enough that an agent chooses
  easily, and the error messages are readable when they are needed;
- (c) a single MCP service supports all dap applications, with no
  per-application MCP code;
- (d) it is efficient.

This note is that design. It keeps the adopted decisions of the MCP plan
and says what each becomes under the scope model (section 1), replaces the
plan's tool list, which was written for the earlier room model, and states
for each of the four claims what proves it (section 10). It changes no
protocol rule. It is to be built in a cloud session on a branch (section
12), with checker review of the head.

## 1. What is kept, what is replaced, what stays owed

The MCP plan was written on 2026-10-01 against the earlier model: a
`RoomApi` with lanes, leases, bearer tokens and fourteen named code-review
tools. That model is parked (`parked/README.md`); the parked `packages/mcp`
is not built or deployed, and no MCP server exists today (`docs/scopes.md`
lists the HTTP routes that do). The I1 to I5 deliveries replaced it with the
scope model: definitions are data, every change is a signed intent judged
by a scope, and a room is a set of scopes (`docs/scopes.md`).

Hugh's decision of 2026-10-01 (`775acdd3`) adopted the MCP amendment's items
1 to 4 at once and items 5 to 9 for stage 2, required `idempotencyKey` on
MCP act tools, placed OAuth in stage 2 before the finals, and adopted
application packs alongside application servers. Plan 009 reconciled the
plan with declared acts. The table says what each adopted or still-owed
outcome becomes here. "Replaced" rows are deliberate replacements proposed
by this note; Hugh confirms them by adopting the note.

| Adopted or owed outcome | Here |
|---|---|
| MCP is a transport, never an authority; every write is one signed intent judged by the scope | Kept. `act` and `found` sign one intent each; the server derives no judgment (section 3). |
| Tools are complete; resources, prompts, elicitation, Tasks and Apps are enhancements | Kept. Thirteen generic tools plus one tool per act declaration the room holds; nothing else is required (section 3). |
| `idempotencyKey` required on act tools | Kept, and required before dispatch: a caller-known key; the server generates none (section 7). |
| Titles, annotations, advertised `outputSchema` on every tool | Kept, with truthful annotations for a generic write (section 3). |
| `waitMs` on long operations | Replaced by the `wait` tool, since the scope model has no `RoomApi` operation handle; a child scope, a timed entry or an outcome is observed by reading (section 3). |
| Stateless server; state with its owners, reached by handles | Kept. Scope IDs, item IDs, cursors and idempotency keys are the handles (section 7). |
| Retries repeat the same prepared meaning | Kept, as exact signed envelopes under exclusive custody (section 7). |
| Context budget, measured in CI | Replaced, by Hugh's direction of 2026-10-12: the list is as long as the acts the room holds and the role may sign, measured per role and reported, with gates on each description and on the whole list in bytes (section 9). The fixed 3,000-token gate of the plan is retired. |
| Fourteen named code-review tools, lanes and leases, the `/v1/rooms/:room/mcp` endpoint, bearer signing by the room, role toolsets | Replaced. They name things that no longer exist. The act tools are generated from the definitions the room holds (section 3). Role toolsets survive as role filtering of that list and an optional selection by definition name. The generic `acts` and `act` route of the plan's section 4 is kept as the fallback. |
| Application packs in `.artroom/mcp/` (item 6) | Replaced. Under the scope model the definition is the pack: an application's acts, fields and guards are data the scope retains, and the server reads them. What a pack would add is authored text, which section 11 proposes as an optional `doc` member of the definition. |
| Application servers composed from a library (L4) | Owed, later. The server package exports its derivation and transports so an application can embed them; no application needs to. |
| New reads `room`, `diff`, `file`, `policy` (item 5); reviewer without a checkout | `room` and `policy` are here (`room`, `scope` of the rules scope). `diff` and `file` at a pinned commit are owed to stage 2: the site route serves HEAD only, and pinned reads need the destination's Git read capability. |
| OAuth (item 8): identify, validate the client and redirect, consent, audience-bound credential, current authority at each call, revocation | Owed to stage 2, hosted. Section 7 keeps the four steps and adds the custody that the scope model needs. Not a prerequisite for the local server. |
| Resources and prompts (item 9) | Owed to stage 2, with URIs mapped to the scope model: `dap://room`, `dap://scope/{id}`, `dap://scope/{id}/entry/{seq}`, `dap://scope/{id}/text/{digest}`; prompts `start`, `work-on`, `review`. Tools stay complete without them. |
| Tasks, MCP Apps, subscriptions, elicitation | Owed, later, as the plan's stage 3. |
| Stateless on the 2026-07-28 specification, with a legacy mode for clients on the previous revision | Kept and widened by Hugh's direction of 2026-10-12: both wire revisions are served, each by its own rules, since some hosts still require the older stateful interface (section 7); W7 drives a real client of each. |
| Cold-agent acceptance on named hosts; conformance suite at a named specification snapshot | Owed after stage 1 lands, by the local builder with real hosts; the cloud session records what it ran and names the SDK and specification versions it conformed to. |
| Bearer roster acts excluded; legacy bearer `check` RPC-only; bound declared check steps through generic `act` | The exclusions were about bearer signing by the room, which does not exist here: every act is signed by the caller's own key. A check step under a definition is an ordinary act. The checker's own obligations stay in the definitions that declare them. |

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

1. a **founding**: a signed intent with `to: null` that founds a scope
   under a definition, with the declarations the definition names and the
   detached texts its fields name (`found` of the client);
2. a **read** of a scope: its summary, items, history, one entry, a retained
   input (a definition, a detached text, a value in a byte domain);
3. a **signed intent** for an act that the scope's definition declares, with
   what travels beside it: detached texts, presented facts, and values in a
   byte domain that a digest field names (`Beside` of the contract);
4. **outside work** that a read or an act hands to a tool the agent already
   has: a Git clone with a read credential, a commit, a push to the
   destination's host.

The command line proves this by construction. Its single-act commands
(`acts`, `act`, `log`, `show`, `verify`) are one read or one intent. Its
founding commands (`install`, `claim`) are a founding and an act. Its
composite commands (`issue open`, `propose`, `edit`, `merge`, `clone`) are
sequences of reads, intents and Git (`packages/cli/src/commands.ts`,
`issueOpen`, `activeDefinition`, `clone`). The page does the same with the
same functions (`packages/page/src/data.ts` imports `heldActs`, `describe`,
`expectedOf` and `valueOf` from the CLI package).

So a server that offers founding, every read of the contract's `ScopeApi`,
capability preparation, one signing tool for each act declaration a
definition in the room declares, generated from the declaration and
carrying every native beside input, and the helpers every composition
needs (wait for a created scope, settle a lost reply, read a text, fetch a
credential once) is complete for every application, present and future,
without a line of code that names an act. Section 10's inventory (W1) lists
every CLI command and page action against the tools that perform it, so
completeness is checked, not asserted.

## 3. The tools

The surface has two parts: thirteen generic tools that read, prepare,
wait, settle, found and fetch a credential, which never change; and one
tool per act declaration of each definition the room holds, generated from
the declarations and listed for the caller's role, which change when the
room changes. Names are short; the host namespaces them. Every input and
output schema has an object root. A refusal is a normal result
(`isError: false`) with the scope's `Answer` as structured content; a
failure before or beside the scope's judgment (transport, shape, custody,
binding, credential) is a tool error (`isError: true`) with a structured
`{ error, message, next }` (R-API-1 of `docs/protocol.md`, section 21,
kept).

### The generic tools

| Tool | Does | Reads | Annotations |
|---|---|---|---|
| `room` | Orientation: the service; the inventory of section 6 (the repository's scopes by name, the configured standalone scopes, and the lanes the directory lists with number, kind, title, state and definition digest, bounded at 50 with a cursor); who I am on each membership the inventory uses (handle, role, key ID) or that standing is unknown there; the active definitions (name, digest); the acts my role does not hold, by tool name. | the inventory's summaries (section 8) | read-only |
| `scope` | One scope: its definition name and digest, status, head, counts by item type and state, and its live items, bounded. With `declaration: true` the retained definition's bytes, paged. With `describe: <kind>` the complete derived text of one act (section 4), paged, for an act whose tool description had to point here. | summary; retained for the declaration | read-only |
| `found` | Founds a scope with no existing target: `definition` (a platform name, or a declared definition's JSON or digest), `kind` (the definition's genesis act), `fields`, `idempotencyKey`, the beside inputs `texts` and `definitions`, and `membership` (the membership scope that standing for the new scope is read from, when the definition is not the platform's register or directory). Same custody as an act tool (section 7). On `accepted`, records the new scope in the configuration's standalone roots (section 6), so every later connection lists its tools. | none before; one POST; the configuration write | not read-only, destructive, idempotent under the required key |
| `prepare` | Asks a scope for one step of a capability for an intent that an act tool will submit: the same target, kind, fields, beside inputs and `idempotencyKey` as that act, plus `capability` and `step`. The intent is built and kept under custody exactly as the act's would be, or reused from custody when the key already has one, so the act that follows submits the same signed intent (`preparationOf` of the client). Returns the scope's answer for the step. | summary, definition; one POST | not read-only, destructive, idempotent under the required key |
| `items` | A page of a scope's items of one type: live or final, with a cursor. | items | read-only |
| `history` | A page of a scope's entries, oldest first, each as one line: seq, time, kind, signer, effects and sends counts; `entry` for one in full. | history | read-only |
| `entry` | One entry in full: its input, fields, effects, sends and hash, paged by bytes when it is large (section 9); a detached text's digest resolves with `text`. | entry | read-only |
| `log` | A page of the history as stored, each entry's canonical bytes, for a verifier or an exact comparison; paged. | log | read-only |
| `outbox` | A page of a scope's sends with the attempts and result of each; or, with `duty`, the status of one send by its duty ID, as a receipt lists them. | outbox; duty | read-only |
| `text` | A retained input by scope, kind and digest: a definition, a foreign entry, a rule's input, a detached text, or a value in its byte domain; paged. | retained | read-only |
| `wait` | Waits, at most 60 seconds, until one of: a scope's head reaches a seq; an item of a type reaches a state; the child scopes an entry created exist and are active (read by the entry's sends and the children's genesis cause chain, as the CLI's `createdBy` does); a send's duty has a result. Returns what it saw and whether it timed out. Never writes. | summary; entry and the children's summaries; duty; polled at a bounded interval | read-only |
| `settle` | What is known about the intent under `idempotencyKey`: the custody record's phase and retained outcome, and, for a record that is not terminal, the scope's settlement for the exact envelope. Resends nothing, signs nothing. Returns `accepted` with the receipt, `refused` with the retained refusal, `unknown`, or `not-found` for a key with no record. | settle | read-only |
| `credential` | The one-time read credential for a `read-token` act the caller signed, from the destination's credential route, with the caller's session. This is the only tool whose output may contain a credential. It returns the credential in one structured field, `credential`, and the remote URL beside it, so a generic local Git helper or the agent's own Git can use it. The server keeps no copy. | credential route | read-only, but its result is secret: the description says so |

### The act tools

**One tool per act declaration.** A tool is bound to exact declarations,
never to a name alone. For each definition in the room's inventory
(section 6) and each act of it that is not its genesis, the server takes
the canonical bytes of that act's declaration (its `ActType` as the
definition retains it, with the item types it names). Definitions with the
same `name` whose declaration of a kind is byte-identical share one tool,
named `<name>.<kind>`: `issue.comment` serves the `issue` definition and
its demo profile alike, because their `comment` rows are the same object.
Where same-name definitions declare a kind differently, there is one tool
per distinct declaration, named with the digest's first eight characters:
`change.propose-manifest@3f0389ba` and `change.propose-manifest@<other>`,
and each description says which definition digests it binds and which
lanes in the inventory run under them. The repository has this case today:
`change.json` and `change3.json` are both named `change`, and their
`propose-manifest` fields are incompatible. A platform definition uses its
short name (`membership.invite-member`, `directory.open-issue`), and a
platform version change that changes a declaration gets a variant the same
way.

**Every descriptor records its binding:** the definition name, the exact
digests it serves, and the digest of the act declaration it was derived
from. Before preparing an intent, the server reads the target's summary and
checks that the target's pinned definition digest is one the descriptor
binds. A target under another digest, under a different-name definition
that happens to declare the same kind, or under a lane whose definition
was retired, is refused as `stale-descriptor` before anything is signed,
with the tool name that does serve that target, and the list is
re-derived. A retained envelope under custody carries the binding it was
prepared under and replays under it, whatever the list says now. So a
tool never signs a different contract from the one its caller read.

**Parameters.** The server's own controls live at the top level and the
act's declared fields live under `fields`, so a declared field can never
collide with a control:

- `target`: the scope the act is on. For a lane definition, the issue or
  change number the directory assigned, or the lane's scope ID; for a
  standalone scope, its scope ID; absent for a platform definition that is
  a singleton in the room (directory, membership, rules, destination,
  inbox), where the server supplies it.
- `on`: the local ID of the item the act is on, derived from the act's
  step and `on` type: required for a `transition`; required for a
  `comment` whose `on` names an item type; absent for an `open` and for a
  `comment` on no item. The schema states which.
- `idempotencyKey` (required; section 7) and `resubmit` (section 7).
- `fields`: the act's declared fields with the schema that section 4
  derives; `texts`, `presented` and `values`, each present only when the
  act declares a detached text, a presented fact, or a digest field with a
  byte domain.

The server resolves the target, reads its summary for `expected`
revisions, checks each field against its declared type, keeps the exact
envelope under custody, and submits. The result is the scope's answer; on
`accepted`, the fact (scope, seq, hash) and the receipt's duty IDs. Child
scopes are read with `wait`.

**Description.** The sentence, fields, presented facts and guards that
section 4 derives, so the agent reads what the act does and what would
refuse it before choosing, and the host validates the input from the
schema. A description that would pass its bound points at
`scope describe` for the rest (section 9).

**What is listed.** For the caller's current standing on each membership
the inventory uses, read at each `tools/list`: every act of every
definition in the inventory that the caller's role on that scope's
membership holds, or that a rule decides. Where standing on a membership
cannot be read, every act of the scopes under it is listed, with the
sentence `your standing here is unknown`: unreadable standing is neither a
denial nor a grant, and the scope judges. Acts a known role does not hold
are not listed; their tool names are in `room`, and a hidden act called
through a variant is judged by the scope, since hiding is never
authorization. The genesis act of a definition is never a tool; `found`
is. `--tools <definition names>` at launch lists only those definitions'
act tools beside the generic ones.

**When the list changes, and how a host learns.** The list is a pure
function of the inventory, the definitions it retains and the caller's
standing. The server computes a **generation**: the digest of those inputs
(each scope's definition digest and head of membership, rules and the
directory, the configured roots, and the roster's actions for the caller's
role). The list changes only when the generation changes, which is rare:
a role change, an activation or retirement, a lane under a new
declaration, a scope founded or configured. The server learns of a change
in two ways, and accounts for both (section 8): a read made for any call
that shows a changed generation input; and, while a client has asked to be
told of list changes (section 7), a bounded watch that reads the
generation inputs every 30 seconds and stops when no client is subscribed.
Each wire revision has its own way of telling the client (section 7). Two
connections of the same key to the same configured roots at the same
moment list the same tools, and a restarted connection lists what the
roots and the room hold, never what an earlier connection saw.

**Paging the list.** `tools/list` is paged. A page carries a cursor that
encodes the generation and the position; a cursor whose generation is no
longer current is refused with a `restart` error that tells the client to
list again from the start. Every tool is reachable across the pages;
nothing is dropped to fit (section 9).

**Counts, from the definitions in the repository.** An admin in the demo
room: about 25 platform acts, 12 of the demo issue profile, 19 of the demo
change profile, and the 13 generic tools, about 69 tools. With the full
lane definitions, about 140; with both change declarations in use, more by
the variant count. A member sees fewer. These are estimates from counting
declarations; the delivery measures the real lists (section 9).

**Launch modes.** The default lists the generic tools and the act tools.
`--generic` is for a host with a tool-count limit: it lists the generic
tools plus `acts` and `act`, and no act tools; `acts` lists the acts of
one scope with the same derived text and bindings, and `act` signs one by
kind under the same custody and binding checks, taking the digest the
caller read. `--generic=add` lists both the act tools and the pair, for a
host that wants to compare them. Every activity of section 10 is performed
in the default mode with act tools alone, and in `--generic` mode with the
pair alone; W1 and W2 prove both, and no default recipe calls a hidden
tool.

**Server instructions**, at most 512 characters: start with `room`; each
act tool's description says what it does, who may sign it and what would
refuse it; an answer is the scope's decision, and a refusal that names a
guard points at the sentence that explains it; after `accepted`, use `wait`
to see what the entry created; after a lost reply, `settle` with the same
`idempotencyKey` instead of signing again; `credential` is the only tool
that returns a secret, and only for a read token you signed; nothing here
grants authority; what you may sign is what your role holds, and the list
changes when that changes.

**Annotations are truthful, not reassuring.** Every act tool, `found` and
`prepare` are advertised as not read-only and destructive, because an act
can close, remove or redact declared state. They are advertised as
idempotent only because the key is required and a repeat under the same
key resends the same envelope or returns its retained outcome (section 7).
Every generic read is read-only. `credential`'s description says its
result is a secret.

**Not in the list, on purpose.** No `verify`, no `clone`, no `propose` as
tools. `verify` is a verifier over `log` that an agent runs as a command.
`clone` and `propose` are Git work that the agent does with Git, after
`destination.read-token` and `credential`. Section 10's inventory names
each step.

## 4. Readable descriptions, derived from the whole declaration

A definition has no description text (`docs/cli.md`, "An act definition has
no description text"). The command line's one-line `describe` is made from
the act's step, item and grant. The MCP server derives more, from the same
declaration, in sentences an agent can act on. The derived text is each act
tool's description and its fields are the tool's input schema; the same
derivation serves the generic `acts` fallback, and the full declaration is
reachable through `scope` so nothing is lost in prose. The derivation is a total function over
the contract's forms (`packages/contract/src/definition.ts`): every guard,
operand, part and field type has a rendering, and an unknown form, which
the validator would have refused, renders as its JSON. It is the same for
every definition, platform or declared.

**The act's sentence.** `<kind>`: `opens a <item>` | `moves a <item>` |
`comments on a <item>` | `comments on no item`; then who may sign: `needs
<action>, which your role (<role>) holds` | `needs <action>, which your role
does not hold` | `needs <action>; your standing is unknown` | `the rule
<code> decides who may sign`. For a transition, the states it leaves and the
states it can reach, read from its `state` guards and its state effects:
`from open or triaged, to closed`.

**Fields.** One line each: name, whether required, the type in words, and
its bounds: `body (required): text, up to 65536 bytes, kept apart from the
entry; give it in texts`; `mentions: list of up to 16 members, as @handle`;
`replyTo: the ID of a comment item on this scope`; `role (required): one of
admin, maintainer, member, agent, checker`; `definition (required): the
digest of a value in the definition domain, up to 262144 bytes; choices
from the rules scope: issue sha256:82a9…, change sha256:d86c…`. A `record`
lists its members; a `list` names its element type and `max`; a `fact`
names its kinds and the definition they are under; a `scope`, `commit` or
`tree` says so. The JSON Schema beside it carries the same facts for a host
that validates.

**Presented facts.** One line each from the act's `presents`: `<name>
(required): a fact of kind <kinds> under <definition>, given in presented`.

**Subjects and operands.** A subject reads as `this <item>` for `on`, `the
<also name>` for an `also`, and `each <as>` inside a list form. An operand
reads as: `the act's <field>`; `the presented <name>`; `the <subject>'s
<slot>`; `the element <as>` or `<as>.<member>`; `the item <subject>`;
`you` for the signer; `the sender`; `the source entry's <part>`; `the
update's <state|item|revision>`; `the result's reason`; `this scope`; `the
intent's digest`; `nothing`; or the constant. A `part` appends `'s <part>`:
`'s scope`, `'s seq`, `'s kind`, `'s field <name>`, `'s opened <type>`,
`'s set <slot> of <item>`, `'s carried <name>`, and `{ of, then }` as `'s
<part>, then its scope|seq`.

**Guards, as sentences with their names.** Each guard becomes one sentence,
keyed by the guard's declared `reason` when it has one, so a refusal
`guard-failed` with that name points at the sentence that explains it. A
nested form indents its nested guards under its own line, to the contract's
depth of 8, and a list form binds its `as` name for the sentences inside
it.

| Guard | Sentence |
|---|---|
| `state` | `<subject> is <state or states>` |
| `signer` | `you are <subject>'s <slot or slots>` |
| `notIn` | `neither you nor your principal is <subject>'s <slots>` |
| `set` / `unset` | `<subject>'s <slot> is set` / `is not set` |
| `equals` / `differs` | `<operand a> equals <operand b>` / `differs from` |
| `some` / `none` / `count` | `some <type> is <states> where <clauses>, except <subjects>` / `no <type> is …` / `between <min> and <max> <type> are …` |
| `every` | `every item in <list operand> is <states>` |
| `fact` | `<operand> names an entry of kind <kinds> under <definition>` |
| `before` / `after` | `now is before <subject>'s <slot>` / `after` |
| `rule` | `the rule <name> holds: <its expression, verbatim>` |
| `each` | `for each <as> in <list operand> [where <clauses>]:` then its guards |
| `has` | `some <as> in <list operand> where <clauses> [has:]` then its guards |
| `anyOf` | `one of:` then each alternative's guards as a group |
| `distinct` | `no two <as> in <list operand> have the same <key operand>` |
| `sameSet` | `the <key operand> of each <as> in <list operand> are exactly the <type> items that are <states> [where <clauses>] [matched by <match clauses>] [in order]` |
| `capability` | `<capability>'s rule <guard> holds, with <args>` |
| platform mark (`code`) | the platform's own one-line text for that mark, from a table in the server keyed by `platform:<name>@<version>` and the mark's code; the table is part of the platform's documentation, not of any application. A mark with no text renders as `the platform rule <code> (row <row>) holds`. |

A `where` clause renders as its guard. Sentences are never cut: a long
guard renders whole in the complete text, which `scope describe <kind>`
returns for any act. A tool description is bounded at 1,000 characters: it
carries the sentence, the fields and as many whole guard sentences as fit,
then one pointer line, `guards <m> to <n> of <n>: see scope describe
<kind>`, which is itself bounded and never contradicts the gate. A refusal
that names a guard is rendered from the complete text, so it always has
its sentence. The pointer names a position range, not the omitted guards'
names, because names are optional and could themselves exceed the bound.

**Worked examples.** These are tool descriptions as `tools/list` sends them.
The delivery renders them in `docs/mcp.md` exactly as the server produces
them, and snapshot-tests them. The first three are
written here by the rules above; the Counter's `join` is written here from
its declaration, and its `spoken` is given to show the limit of derivation.

- `issue.comment` under `issue-demo`: `comment: opens a comment; needs issue.comment,
  which your role (member) holds. Fields: body (required): text up to 65536
  bytes, kept apart from the entry; give it in texts. mentions: list of up
  to 16 members as @handle. replyTo: the ID of a comment item on this
  scope. No guards.`
- `lane.take-hold` of the derive fixture: `take-hold: opens a hold; needs hold,
  which your role (member) holds. Fields: commitment (required): the ID of
  a commitment item on this scope. Guards: the commitment is accepted; you
  are the commitment's performer; no hold is held where the hold's under
  equals the act's commitment.`
- `directory.open-issue` of `platform:directory@2`: `open-issue: opens a lane; needs
  issue.open, which your role (admin) holds. Fields: definition (required):
  the digest of a value in the definition domain, up to 262144 bytes;
  choices from the rules scope: issue sha256:82a9…. title (required): text
  up to <bound>. body: text up to 65536 bytes, kept apart from the entry;
  give it in texts. conditions (required): list of up to 16 texts up to
  4096 bytes. Guards: the definition is active in the rules scope
  (not-activated).`
- `counting.join`: `join: opens a participant; needs counting.join,
  which your role holds. Fields: none. Guards: between 0 and 7
  participants are joined; no participant is joined where the
  participant's agent equals you.`
- `counting.spoken` renders its `rule` guard as `the rule spoken-plan
  holds:` followed by the JSONata expression verbatim. That is exact and
  complete, and it is not easy reading. It is the honest limit of
  derivation for rule guards, and the reason section 11 proposes the
  optional `doc` member. The snapshot test records it as it is.

**Why derivation first, authored text second.** Derivation is complete on
day one for every definition, cannot drift from the declaration, and needs
no per-application code or data. Authored text makes the sentences better.
Section 11 proposes the one small contract change that would let a
definition carry its own `doc` text, optional and ignored by every judge.
The design does not depend on it.

## 5. Readable errors, attributed to their source

Every answer that is not `accepted` becomes a sentence with four parts: what
was asked (scope, kind, on), who said what (the scope's answer, or a finding
of the server before or beside the scope), the head it was judged at when
the answer carries one, and the next step. The next step is fixed per
reason, so an agent can learn it once.

**The server renders only what the judge returned.** A refused answer
carries a reason, an optional guard name, and the head it was judged at
(`packages/contract/src/result.ts`). It does not say which unnamed guard
failed, which field was bad or which item was missing. The server never
guesses: it does not number guards, it does not re-read the scope after the
judgment to infer the failed predicate, and it labels every inference-free
fallback as unattributed. What the server found itself before signing (a
shape error) or beside the scope (transport, custody, credential) is
attributed to the server in the sentence.

| Answer or error | Sentence pattern | Next step |
|---|---|---|
| `refused` `guard-failed` with name | `<scope> refused <kind>: <the guard sentence keyed by name> does not hold (<name>), judged at head <seq>.` | Read the subject with `scope` or `items`; change the field or the state the sentence names; sign again with a new key. |
| `refused` `guard-failed` without name | `<scope> refused <kind>: one of its guards does not hold, judged at head <seq>; the scope does not say which. The act's guards are: <all guard sentences>.` | Read the subjects the sentences name and compare; sign again with a new key. |
| `refused` `unauthorized` | `<scope> refused <kind>: your key holds no current grant for <action>.` | `room` to see your role; ask an admin. |
| `refused` `unknown-act`, `bad-field`, `no-item`, `required-unset` | `<scope> refused <kind>: <reason as the contract defines it>. The scope does not name the field or item. The act declares: <fields and subjects>.` | Read the tool's description again; correct the fields; sign again. |
| `stale-descriptor` (the target's pinned digest is not one the tool binds) | `before signing, the server found that <scope> runs <name> <digest>, which this tool does not serve. Nothing was sent. The tool for that target is <tool>.` | List tools again; call the named tool. |
| `restart` (a `tools/list` cursor from an earlier generation) | `the tool list changed; list again from the start.` | `tools/list` without a cursor. |
| `refused` `revision-moved` | `<scope> refused <kind>: an item this act names changed after it was read, judged at head <seq>.` | Read again, sign again with a new key. |
| `refused` `expired`, `scope-full`, `final`, `slot-full`, `type-full`, `entry-too-large`, `fact-mismatch`, `capability-refused` and the rest of `RefusalReason` | one sentence each from a table in the server, naming the bound or the name the answer carries | stated per reason |
| `unavailable` any reason | `<scope> did not judge <kind> (<reason>). Nothing is known to have been accepted; timed entries may have been written.` | `settle` with the same `idempotencyKey`; do not sign again first. |
| `mismatch` | `your key already signed another intent under this idempotency key on <scope>.` | Use a new key for a new meaning. |
| read refusal (`forbidden`, `not-found`, `wrong-incarnation`, `scope-provisional`, `unsupported-definition`, `history-unavailable`, `too-large`, `unavailable`) | `<scope> did not answer the read: <reason>.` | per reason: `room` for standing; a smaller page; try later |
| `ShapeError`, before signing | `before signing, the server found field <name> <what is wrong>; declared: <type>. Nothing was sent.` | Correct the field. |
| `TransportError`, lost or malformed reply | `the reply from <scope> was lost or malformed; the outcome is unknown. The envelope is under custody.` | `settle` with the same key. |
| custody (section 7) | `the server's record for key <key> on <scope> is <conflicting|full|locked|unreadable|terminal>; nothing was sent.` with, for `full`, at most eight of the oldest unresolved keys | per state: a new key for a new meaning; wait and retry for locked; settle the unresolved records for full; for terminal, the retained outcome is in the result, and `resubmit: true` is the explicit way to send the same envelope again |
| credential | `no read token of yours is readable at <destination>; nothing was returned.` | `act` `read-token` first, then `wait` for its outcome. |

Two rules hold for every message. It never contains a session token, a key
byte, an invitation secret or a read credential, except that `credential`
returns the read credential in its one structured field. And it never
claims more than the answer shows: a refusal category alone does not prove
that nothing was written (`docs/scopes.md`, the four answers).

## 6. One service, every application: the boundary

The server package (`packages/mcp`, new source; the parked package's ledger
row is updated to name this as its successor) imports `contract`, `bytes`,
`client`, `platform` and, for operand and guard rendering, the derive
package's operand helpers. It imports nothing from `lanes`, `examples`,
`page` or `checkers`, and `scripts/active-source.test.mjs` is extended to
refuse such an import. The platform package is allowed because the
platform's six definitions are part of every room, not an application.

The claim is stronger than an import rule. The server's inputs are the
contract's forms, all of them (section 4), and its only knowledge of an
application is what the scope retains; the act tools are generated from
those forms, so a definition the server has never seen gets its tools the
moment the room holds it. So the witness for (c) is an
application the server has never seen: W2 founds a scope under a definition
written inside the test (three acts, two item types, a `distinct` guard, a
presented fact and a detached text), lists its acts, signs them, and reads
the results, with the same server and no change. The Counter is the second
witness, as a scope founded outside the repository model, and the room is
the third.

**The inventory, and where authority is read.** The server's inventory of
scopes is durable and configured, never a memory of a connection:

- the repository of the configuration, when there is one: its directory,
  membership, rules, destination and inbox, and every lane the directory
  lists, each with the definition digest the directory recorded for it;
- the configuration's **standalone roots**: a list of `{ scope, membership }`
  entries in `config.json`, each a scope that is not under the repository
  (a Counter under its cohort, a scope of another room, a scope this key
  founded through `found`) and the membership scope that standing for it
  is read from. `found` appends an entry on `accepted`; `artroom mcp
  --scope <id> --membership <ref>` appends one by hand; the CLI's
  configuration commands own the file as they do today.

Standing is read per membership: the repository's for its scopes and
lanes, and each standalone root's own. A root whose membership answers
nothing has unknown standing: its acts are listed with that sentence,
nothing is hidden and nothing is granted, and the scope judges. A room
with mixed memberships lists each scope's acts under its own standing.
W2's stories found a standalone scope through one connection and assert
that a second connection and a restarted one list its tools; W2's Counter
story configures an existing Counter by hand.

The server never derives authority. Hiding is never authorization. W2
changes a role with `set-role` and activates a definition with `activate`
during the story and asserts that the next `tools/list` and `room` show
the change, and that a client subscribed to list changes was told.

## 7. Transport, identity, custody and credentials

**Where it runs.** Stage 1 is a local server beside the agent, signing with
the key in the agent's own `ARTROOM_HOME`:

- stdio: `artroom mcp`, for hosts that launch a process;
- streamable HTTP on a loopback address: `artroom mcp --http
  127.0.0.1:<port>`, the same server, for hosts that only speak HTTP.

**Loopback HTTP is a signing boundary, and is guarded as one.** A browser
page can reach a loopback address with a valid local `Host` header, so host
checking is not enough. The server: binds loopback only; rejects any
request that carries an `Origin` header, since no browser origin is a
trusted client of a signing server (a configured allow-list is possible
later; the default is none); requires a per-launch bearer that the command
prints once to the launching host's standard error and accepts in
`Authorization`, so a process that did not launch the server cannot sign
with its key; and answers `401` or `403` with no body detail. This follows
the MCP transport specification's requirements on origin validation,
localhost binding and authentication for local servers. W7 witnesses each
rule.

The key is the device key of a person, or an agent key enrolled by the agent
key invitation that the builder's `request/agent-key-node` branch adds
(`artroom join artroom-agent-key:…` into a separate `ARTROOM_HOME`). The
server reads with a session it asks membership for, kept in memory, renewed
before a read when it has ended, as the page does; a signed read is the
fallback where a session is refused. The config file holds no secret, as
now.

Stage 2 is the hosted endpoint on the scope Worker, `POST /mcp`, for hosts
that cannot run a process. It needs a bearer that maps to an agent key held
in the Worker's credential store, enrolled by a controller through the same
agent key invitation, with the actor, the session and the custody record
each bound to that bearer's agent and kept apart from every other bearer's.
That custody is a change to the Worker and its secrets and is not built in
the cloud session. The server module is the same; only the signer, the
reader and the custody store differ.

**Stateless, except what the transport needs.** No state between calls
except the process's in-memory read-session token, the last computed list
generation (kept only to know whether a subscribed client must be told),
the per-connection state each wire revision defines below, and the custody
store. None of it is authority: a call rebuilds what it needs from the
configuration and reads. Cursors, item IDs, scope IDs and idempotency keys
are the handles.

**Custody: the required key and what it binds.** Every act tool, `found`
and `prepare` require `idempotencyKey` from the caller, any string of 1 to
128 UTF-8 bytes the caller will remember, and refuse without one. The
server generates none, because a key the caller does not know cannot be
used to settle after the first MCP reply is lost. The custody store is
`ARTROOM_HOME/private/mcp-custody/`, owner-only, one file per record, named
by a digest of the record's identity:

- **identity:** service origin, the membership scope and incarnation that
  standing is read from, the signer's key ID, the target scope and
  incarnation (or `found` and the definition digest), and the idempotency
  key;
- **binding:** the definition name and digest the target was under and the
  act declaration digest the tool was derived from (section 3);
- **requested meaning:** the digest of the canonical form of what was
  asked: kind, on, fields as given, the texts', values' and presented
  facts' digests and domains;
- **the envelope:** the exact signed intent and its exact beside values,
  bytes as sent; a record is at most 2 MiB, which holds the contract's
  largest input beside an intent;
- **phase and outcomes:** `prepared`, `sent`, `unknown`, `accepted` with
  the receipt, `refused` with the answer; and, after an explicit
  resubmission, every later outcome appended, never replacing an earlier
  one.

Before sending, the server takes an exclusive lock on the record's identity
(a lock file created with `O_EXCL` beside the record, holding the process
ID and time, released on completion and broken only when its process is
gone and its time is older than the intent's `notAfter`), writes the record
to a temporary file, renames it into place, reads it back and compares the
bytes, and only then sends. A second process sharing the store sees the
lock or the record. The rules:

| Situation | What the server does |
|---|---|
| No record under this identity | First preparation: bind, sign, keep, read back, send. |
| A record in `prepared`, `sent` or `unknown` with the same requested meaning | Recovery: resend the same bytes; no new signature. |
| A record with a different requested meaning | Refuse `conflicting`; send nothing; name the recorded kind and target. |
| A record in `accepted` | Terminal: return the retained receipt; send nothing. |
| A record in `refused` | Terminal: return the retained refusal; send nothing. The caller may send the same envelope again only with `resubmit: true`, a deliberate act, because a refused envelope can be accepted later when authority or guards change; both outcomes stay in the record. |
| The identity is locked | Refuse `locked`; send nothing; say to retry after a moment. |
| `settle` | Return the retained outcome for a terminal record; for another, ask the scope's settlement with the recorded envelope and update the phase; sign nothing, send no act. |

**What resolves `unknown`, and what does not.** The scope keeps the
receipt of an accepted intent by actor and key, and its judge answers a
replay of the same envelope with that receipt before it looks at
`notAfter`; its settlement reads the receipt with no turn and no expiry
check (`judge.ts`, `core.ts`). Refusals are not kept by the scope. So:

- a record is resolved only by a definitive answer for the same scope and
  incarnation: `settle` returning a receipt, or a resend answered
  `accepted`, `refused` or `mismatch`;
- `unavailable` on a resend, and `not-found` from `settle`, resolve
  nothing: `not-found` is not a historical refusal, and a timed drain can
  answer `unavailable` before the receipt is looked up; the record stays
  `unknown` and is never evicted;
- the passing of `notAfter` resolves nothing by itself: an accepted-but-lost
  envelope still settles to its receipt after expiry, and an unsent or
  unjudged one answers `expired` only when the scope judges it;
- the server never chooses a new key; a new meaning is the caller's new
  key.

**Capacity and lifecycle.** The store holds at most 256 unresolved records
(`prepared`, `sent`, `unknown`) and refuses a new preparation as `full` when
it is at that bound, naming at most eight of the oldest unresolved keys so
the agent can `settle` them. Terminal records are kept for replay of their
outcomes and, beyond 1,024 of them or 30 days of age, are moved into
append-only archive files of at most 64 MiB each, with an index file (key
identity digest to archive file and offset) rewritten atomically after
each move; a lookup reads the index, never scans. Nothing is deleted by the
server, and no unresolved record is ever archived or evicted. This keeps
the page's join-custody rule, that the original envelope is never
replaced, for every act.

**Credentials.** The read credential of the destination is delivered only by
`credential`, only for a `read-token` act the caller's key signed, read
once with the caller's session from the credential route, and returned in
the one structured field. The server does not keep it, log it or include
it in any other result. `entry` and `history` of the destination show the
`read-token` act and its outcome, which carry no credential by the
destination's own rule. W4 drives a credential through the server and
asserts it appears in `credential`'s result and nowhere else.

**The two MCP wire revisions.** Hugh's direction, 2026-10-12 14:44
Eastern: both revisions are supported, because some agent hosts still
require the older stateful interface. They are two different wires, and
the server implements each by its own rules; it does not simulate one with
the other.

| | 2025-11-25 | 2026-07-28 |
|---|---|---|
| Handshake | `initialize` and `notifications/initialized`; the version is agreed there | No handshake. Each request carries its protocol version and client capabilities in `_meta`; the server answers a version it does not serve with `UnsupportedProtocolVersionError` (`-32022`) |
| Discovery | `initialize` returns server info, capabilities and instructions | `server/discover`, which the server must implement, returns the versions it serves, its capabilities and identity; a client may call it first, and over stdio uses it as a compatibility probe |
| Sessions over streamable HTTP | The server issues `Mcp-Session-Id` at `initialize`; later requests carry it; `DELETE` ends it; an unknown or ended session is answered `404` so the client initializes again | No protocol sessions and no session header; cross-call state is a handle the client passes as an argument |
| Server-to-client stream | `GET` opens the session's stream | No `GET`; a client that wants change notifications posts `subscriptions/listen`, opting in to `toolsListChanged`, and keeps that one long-lived response stream |
| Tool list changes | `notifications/tools/list_changed` on the session's stream, when the client declared it wants them | A tagged notification on the `subscriptions/listen` stream, only for a client that opted in; request-scoped notifications stay on their own request's stream, and nothing is piggybacked on an unrelated response |
| `tools/list` | The list, paged | The list, paged, with `ttlMs` (30,000) and `cacheScope` (`private`, since the list depends on the caller) |
| Results | Structured content with object roots | The same, with `resultType: "complete"` on every result |
| Removed in the newer revision | | `ping`, `logging/setLevel`, roots and sampling; the server does not offer them to a 2026-07-28 client |

The server selects the revision per request: a request with the newer
`_meta` version is served by the newer rules; a request without it that
belongs to an initialized 2025-11-25 session, or that is `initialize`, is
served by the older rules. The two sets of per-connection state are
separate: the older revision's session (negotiated version, initialized
flag, the client's declared capabilities, the last generation it was told
of) and the newer revision's listen subscription (its ID, the opted-in
types, the last generation it was told of). Both are small and neither is
authority. On stdio one implicit connection exists, and the client's first
request says which revision it speaks. Every connection and session of
one server is bound to the one key the process signs with; the hosted
endpoint of stage 2 binds each bearer's sessions and subscriptions to that
bearer's agent and keeps them apart, with a session store for the older
revision. Both revisions carry tools, structured content and output
schemas, so the dynamic list of section 3 works on both, and a client of
either receives the same structured content, never wrapped. The delivery
note names the exact revisions the pinned SDK implements and which
revision each W7 client spoke.

**SDK.** The implementation pins one MCP server SDK version in the reviewed
commit, with the lockfile, and uses its stdio and streamable HTTP transports
for both revisions and its origin validation where it offers one. The
alternative of a minimal JSON-RPC handler is acceptable only if it
implements each served revision's required method set in full (for
2025-11-25: `initialize`, `ping`, `tools/list`, `tools/call`, the session
header, `GET` and `DELETE`, and the notifications; for 2026-07-28:
`server/discover`, `tools/list`, `tools/call`, `subscriptions/listen`, the
per-request `_meta` and `resultType`); the delivery note states the choice
and its reason. The wire tests drive the server through a real client over both
transports, so the choice is not visible to them.

## 8. What a call costs, end to end

The measured boundary of a tool call is the whole client-visible MCP
response, structured content and text together, and every HTTP request the
server made to serve it, including session acquisition or renewal and a
signed-read fallback. Nothing is served by dropping valid content: a result
that would exceed its budget is paged, and the page says how to continue.

| Tool | Reads, warm session | Reads, cold or expired session | Response bound |
|---|---|---|---|
| `room` | 3 | 4 (one session request) | 8 KiB; lanes paged at 50 |
| `scope` | 1; 2 with `declaration` | +1 | 8 KiB; the declaration paged at 64 KiB |
| `tools/list` | the generation inputs: membership, directory and rules summaries, and one summary per standalone root; plus one retained read per distinct definition digest not yet read in this process | +1 | one page, at most 256 KiB; see section 9 |
| the watch, while a client is subscribed to list changes | the same generation inputs, once every 30 seconds, and nothing when no client is subscribed | | none |
| `prepare` | 1 read and 1 POST, as the act tool for the same target | +1 | 4 KiB |
| `log`, `outbox` | 1 | +1 | 64 KiB per page |
| an act tool on a singleton platform scope | 1 read and 1 POST; 2 reads when a definition value is fetched from the rules scope | +1 | 4 KiB |
| an act tool on a lane or a declared scope | 2 reads (the directory's items to resolve a number, the target's summary) and 1 POST | +1 | 4 KiB |
| `found` | 0 reads and 1 POST | +1 | 4 KiB |
| `acts` (fallback) | 3; 4 with a definition field | +1 | 64 KiB per page |
| `items`, `history` | 1 | +1 | 64 KiB per page |
| `entry`, `text` | 1 | +1 | 64 KiB per page; an entry up to 256 KiB and a retained input up to 1 MiB are paged by `offset` and `limit` |
| `wait` | 1 per poll for a head or a state; 2 plus one per child for created scopes | +1 | 4 KiB |
| `settle` | 1 | +1 | 4 KiB |
| `credential` | 1 | +1 | 2 KiB |

A signed-read fallback after a refused session adds one request per read.
The test's instrumented transport counts every request, and the delivery
note reports the counts for the stories as observed figures.

## 9. Budgets

| What | Budget | How measured |
|---|---|---|
| Each tool as sent | description at most 1,000 characters, with the pointer of section 4 when the complete text is longer; a schema is never cut: every declared field is in it, and a schema over 16 KiB is listed whole and reported; instructions at most 512 characters | the canonical JSON the server sends |
| `tools/list` as sent, per role | one page at most 256 KiB, with a cursor to the next; no aggregate cap, every tool reachable; the total bytes and the token count (by a pinned counter named in the note) for an admin, a maintainer, a member and an agent in the demo room, and for an admin with the full lane definitions and both change declarations, measured and reported | the canonical JSON the server sends, for each role in W2's room |
| Tool results | the response bound of section 8, with paging; `idempotencyKey` at most 128 bytes; diagnostics bounded (at most eight keys in a `full` error; sentences from the complete text, paged by `scope describe` when long) | bytes of the whole response |
| List changes | one notification per real change of the generation, delivered by the rules of the client's wire revision, and none otherwise | counted by the test's client over the W2 story |
| Each tool result | the response bound of section 8, with paging | bytes of the whole response |
| Canonical activities | open an issue and learn its number: `acts`, `act`, `wait` (3 calls); comment on it: `act` (1 call, after `acts` once per scope); read an issue with its comments: `scope`, `text` per comment; clone: `act` `read-token`, `wait`, `credential`, then Git (3 calls) | counted from the story tests; reported as a sum of steps |
| `wait` | polls at 1 second, at most 60 seconds | the test's gate and clock, no sleeps |

The list costs what it costs because it is the one place that carries
descriptions, and a host fetches it once and again only after a change,
which is rare: a role change, an activation, a new kind of lane. The
sentences are derived from the definitions the room retains, which the
server reads once per distinct digest per process; a definition's bytes
never change for a digest, so a hosted server may cache them by digest.
`--tools <definition names>` shortens the list for an agent with one job.

## 10. What proves each claim

| Claim | Witness | Where |
|---|---|---|
| (a) complete | **W1 inventory.** `docs/mcp.md` lists every command of `docs/cli.md` and every page action of `docs/page.md` with the tool calls that perform it in the default mode and in `--generic` mode: `install` and `claim` through `found` and `register.claim`, `issue open` with its definition value, `edit` and `propose` with their detached texts and presented facts, `clone` with `destination.read-token`, `wait` and `credential`, `verify` over `log`, send outcomes over `outbox` and `wait`, and a capability step over `prepare` followed by the act tool under the same key. A test asserts that rendering is total over every act of every definition in the repository (the six platform definitions, `issue`, `change`, `change3`, `issue-demo`, `change-demo`, `change-demo3`, `counting` and the unfamiliar test definition), over every guard form and operand of the contract, and that every act that declares `presents` or a byte domain is exercised with that input somewhere in W2. | `packages/mcp/test/inventory.test.ts`; `docs/mcp.md` |
| (a) driven by available acts | **W2 story, room.** Against the real test Worker: `found` the register and the room, publish rules, activate the demo definitions, `set-role` a member, open an issue with its definition value and body text, comment, assign, close, open a change by `propose-file` with its presented facts, review, merge, and one capability step through `prepare` and its act; all through the act tools over an in-process client, and once more through `acts` and `act` in `--generic` mode. The test fetches `tools/list` before each step and asserts that every tool it calls was listed for the caller's role at that moment, that a list-change notification arrived after the activation, the role change and the first lane of a new declaration, and that none arrived otherwise. **W2 story, binding.** Two same-name definitions with incompatible `propose-manifest` (the repository's `change` and `change3`) in one room: two variant tools, each refusing the other's lane as `stale-descriptor`; an old lane under a retired definition still served; a different-name definition declaring the same kind not served by either; a field named like a control under `fields` with no collision; a cached descriptor after an activation refused and the list refreshed. **W2 story, discovery.** A standalone scope founded on one connection is listed by a second connection and by a restarted one; an activation made outside any call reaches an idle subscribed client within the watch interval; a mixed room lists each scope's acts under its own standing; a `tools/list` cursor across a change is refused with `restart`. | `packages/mcp/test/room.scope.test.ts`; `binding.scope.test.ts`; `discovery.scope.test.ts` |
| (c) one service | **W2 story, unfamiliar.** A definition written in the test (three acts, two item types, a `distinct` guard, a presented fact, a detached text) is founded and driven through the same server. **W2 story, Counter.** A Counter scope under its cohort: `join`, `start`, `spoken`, `leave`. No counting import in the server; the import boundary test refuses one. | `packages/mcp/test/unfamiliar.scope.test.ts`; `counter.scope.test.ts`; `scripts/active-source.test.mjs` |
| (b) descriptions | **W3.** The five worked examples of section 4 are snapshot tests of the tool descriptions as `tools/list` sends them, with the expected text in `docs/mcp.md`, so the checker reads what an agent reads. A test renders every guard form and operand of the contract once and asserts no form falls through to raw JSON, and that a description over 1,000 characters names what it left out. | `packages/mcp/test/describe.test.ts` |
| (b) errors | **W4.** Table-driven over every reason of `RefusalReason`, `UnavailableReason`, `MismatchReason` and `ReadRefusal`, plus shape, transport, custody and credential errors: the sentence names the scope, the kind, the head when the answer carries one, the source of the finding, and a next step. Two cases use a definition with two unnamed guards and assert the sentence attributes neither. One case moves an item's state after the judgment and asserts the sentence reports the judged head, not the new state. One story drives a session token, a key, an invitation secret and a read credential through every tool and asserts the credential appears only in `credential`'s structured field and the others nowhere. | `packages/mcp/test/errors.test.ts` |
| (d) efficient | **W5.** The budget tests of section 9 and the read counts of section 8 over the instrumented transport, cold and warm, with an expired and a refused session, created children, pagination of a large retained input, the list for each role with the demo and the full lane definitions, the count of `list_changed` notifications over the story, and standing and activation refresh. The delivery note reports the observed figures. | `packages/mcp/test/budget.test.ts` |
| retries | **W6.** First MCP reply lost (the client never sees the result) and `settle` with the caller's key finds the receipt; the same after the intent's `notAfter` has passed; a resend answered `unavailable` and a `settle` answered `not-found` leave the record `unknown`; a refused record returns its retained refusal after the room's authority changes, and only `resubmit: true` sends the envelope again, keeping both outcomes; two processes preparing the same identity at once, one locked out; the same key with a different meaning refused without sending; a restart between prepare and send resends the same bytes; a full store refuses a new preparation and names at most eight unresolved keys; archive rotation with its index keeps a terminal record findable; no case ever makes a new key. | `packages/mcp/test/custody.test.ts` |
| transports | **W7.** A real client of each wire revision, over stdio and over loopback HTTP: the 2026-07-28 client makes its first request without any handshake, calls `server/discover`, is refused a version the server does not serve with the defined error, posts `subscriptions/listen` opting in to tool list changes and receives the tagged notification after an activation; the 2025-11-25 client initializes, receives a session ID, opens the `GET` stream, receives `notifications/tools/list_changed` there after an activation, and after `DELETE` or an unknown session is answered `404` and initializes again; both list tools, call `room` and an act tool, and receive the same structured content and the same native outcomes under the one key; the HTTP server refuses a request with an `Origin` header, a request without the per-launch bearer, and a bind address that is not loopback; `--generic` lists `acts` and `act` and the default does not. | `packages/mcp/test/wire.test.ts` |

Each test states its invariant in one sentence first (`docs/testing.md`).
The scope tests use the test Worker pool of `packages/scope`, as the CLI's
`claim.scope.test.ts` does. No mutation sweep; a bounded set of controls
where a guard in the server (custody conflict, lock, full store, origin,
bearer, secret in output) needs a paired case.

## 11. Later stages, and one optional contract change

- **Stage 2, hosted.** `POST /mcp` on the scope Worker with agent-key
  custody in the credential store, a bearer per agent, OAuth as the plan's
  four steps for hosts that need it, the pinned `diff` and `file` reads,
  resources and prompts. Needs deployment; local builder.
- **Stage 3, authored text.** A contract amendment that lets a definition,
  an act, a field, a presented fact and a guard carry an optional `doc`
  string, at most 400 characters, that the validator accepts and no judge
  reads. It is part of the canonical bytes, so it is part of the digest; an
  application that adds it activates a new digest. The server prefers `doc`
  where present and derives where absent. This is the one change that makes
  a rule guard such as the Counter's `spoken-plan` read as a person would
  write it, and it stays data.
- **Later.** Tasks, Apps, a live subscription over the stream route, cold
  agent runs on named hosts, a conformance run at a named specification
  snapshot.

## 12. The build

One cloud session, on a branch from the design branch, with the brief in
the planner's scratchpad (`cloud-mcp-prompt.txt`). It delivers:

- `packages/mcp`: the server, the derivation, the custody store, the two
  transports with the loopback guards; `artroom mcp` in the CLI;
- the eleven test files of section 10;
- the `--tools` and `--generic` launch flags;
- `docs/mcp.md`: how to connect an agent host, the tool reference as sent,
  the five worked examples, the W1 inventory, the budgets and the observed
  figures;
- `notes/2026-10-13-mcp-generic-delivery.md`: what was built, what ran, what
  the figures were and how they were taken, the SDK and specification
  versions, and what is owed;
- the parked ledger row for `mcp` updated; the SDK pinned in the lockfile
  in the same commit.

The session cannot reach a deployment or the workroom. The planner files its
head for checker review and lands it after the verdict. The cloud container
is known to fail one Git-version test (`packages/checkers`, T36); the note
says so if it recurs.

## 13. Decisions recorded here

1. A dynamic tool list: one tool per act declaration of each definition
   the room holds, bound to exact digests with variants for same-name
   differences, listed for the caller's role, told to subscribed clients
   on a real change; thirteen generic tools beside them; the generic
   `acts` and `act` pair in `--generic` mode for a host with a tool-count
   limit (section 3). Hugh's direction, 2026-10-12 14:37 Eastern.
2. Descriptions derived from the whole declaration into each tool's
   description and schema, with the declaration reachable through
   `scope`; authored `doc` text is a later, optional amendment (sections 4
   and 11).
3. The server signs with the agent's own key beside the agent, behind an
   origin check and a per-launch bearer on loopback HTTP; the hosted
   endpoint with key custody is stage 2 (section 7).
4. `idempotencyKey` is required and caller-known; recovery resends exact
   envelopes under exclusive custody bound to identity, binding and
   meaning; a terminal outcome is returned, never silently resent;
   `resubmit` is explicit; nothing unresolved is evicted; no key is ever
   chosen by the server (section 7).
5. The read credential has one channel, `credential`, and no other output
   carries it (section 7).
6. The server renders only what the judge returned; unattributed fallbacks
   say so (section 5).
7. The plan's fixed token gate is replaced by a measured, reported list
   size per role with a gate on each description and on each list page;
   nothing is dropped to meet them (section 9). Hugh's direction,
   2026-10-12 14:37 Eastern.
9. Both MCP wire revisions are served, each by its own rules (section 7).
   Hugh's direction, 2026-10-12 14:44 Eastern.
8. Packs and the application-server topology of the plan are replaced as
   section 1 states; Hugh's adoption of this note confirms the replacement.

What would send this back for a design correction, as the plan's "When to
stop" says: a need to re-sign automatically, to hold a key the agent did not
enroll, to add an act kind in the server, to infer a diagnostic the judge
did not return, or to describe an act from anything but its declaration and
its optional `doc`.

## 14. Draft 2 against review `ca8a00f6`

| Correction | Where answered |
|---|---|
| 1. Founding and every native beside input | `found` tool; `act`'s `texts`, `presented`, `values` with domain and digest checks; W1 totality over `presents` and domains; W2 founds and uses each (sections 2, 3, 10). |
| 2. Credential delivery versus the output prohibition | One channel, `credential`; the prohibition applies to every other output; W4 asserts both (sections 3, 5, 7). |
| 3. Only judge-returned diagnostics | Section 5's rule and table: no ordinals, no re-judging, unattributed fallbacks say so; W4's unnamed-guard and moved-state cases. |
| 4. Required caller keys and custody semantics | Section 7: required key, identity and meaning binding, exclusive lock, atomic write and read-back, conflict refusal, no eviction of unresolved records, archive rotation; W6's six cases. |
| 5. Total rendering and an unfamiliar application | Section 4 covers every guard form, operand and part, with nesting and binding, and attaches the declaration; the Counter's `join` is derived here and `spoken` shows the limit; W2 adds the unfamiliar definition and standing and activation changes. |
| 6. End-to-end bounds that preserve output | Section 8's per-tool read counts cold and warm, child discovery moved to `wait`, whole-response measurement, byte paging for large values; lifecycle witnesses in W5; custody capacity and archival in section 7. |
| 7. Truthful annotations and the loopback boundary | Section 3's annotations; section 7's origin rejection, per-launch bearer and loopback bind; W7. |
| 8. The retained, replaced and owed matrix | Section 1's table, including packs, application servers, the four reads, OAuth's steps, resources and prompts, Tasks and Apps, acceptance outcomes, and the token gate, which Draft 2 kept and which Hugh's later direction (section 15) replaced; the tool count corrected throughout. |

## 15. Draft 3 after Draft 2

Hugh, 2026-10-12 14:31 and 14:37 Eastern, asked how a generic surface finds
and invokes acts, said the indirection concerned him, and asked whether a
dynamic tool list that reflects the acts in the connection is viable; on
the planner's answer (viable, one tool per act kind per definition name,
role filtered, changing rarely, with the generic pair as a fallback) he
decided for it and noted that the rare list changes make the cost to a
host's cache acceptable. Draft 3 rewrites section 3, adjusts sections 1, 2,
4, 5, 6, 7, 8, 9, 10 and 13, and keeps everything Draft 2 answered for
review `ca8a00f6`: the corrections about founding, beside inputs, the
credential channel, judge-only diagnostics, custody, total rendering,
end-to-end bounds, the loopback boundary and the retained matrix apply to
the act tools exactly as they applied to `act`.

## 16. Draft 4 against review `85c4e1b0`

| Correction | Where answered |
|---|---|
| 1. Bind a generated tool to the exact target declaration | Section 3, "One tool per act declaration" and "Every descriptor records its binding": tools bound to canonical act declarations, variants by digest for same-name differences (the repository's `change` and `change3` named as the case), the binding checked by name and digest before preparing, `stale-descriptor` without signing, replays under their original binding, controls apart from `fields`, `on` derived for every step. W2 binding story. |
| 2. Account for the native preparation and read surface | `prepare`, `log` and `outbox` tools in section 3; `wait` on a duty; W1 maps `verify`, send outcomes and a capability step; W2 performs one step through `prepare` and its act under one key. |
| 3. Authoritative discovery and invalidation | Section 6: the durable inventory (repository, lanes, configured standalone roots that `found` and `--scope` append), standing per membership, unknown standing listed without denial or grant; section 3: the generation, the bounded watch for subscribed clients, paged `tools/list` with generation cursors and `restart`; section 8 accounts for the watch. W2 discovery story. |
| 4. Reconcile default and fallback modes | Section 3 "Launch modes": default lists act tools; `--generic` replaces them with the pair; `--generic=add` lists both; W1 and W2 prove every activity in the default mode with act tools alone and in `--generic` mode with the pair alone; standing refresh through `room`; section 14's token-gate wording corrected. |
| 5. Preserve terminal outcomes and correct expiry | Section 7: terminal records return their retained outcome and are never resent without `resubmit: true`, both outcomes kept; what resolves `unknown` and what does not, from the scope's own replay and settlement rules; expiry resolves nothing by itself; no automatic key. W6's added cases. |
| 6. Complete output under the bounds | Section 9: a 256 KiB page bound with cursors and no aggregate cap; schemas never cut, over-size ones listed whole and reported; the bounded pointer of section 4 and `scope describe` for complete text; the key bounded at 128 bytes; diagnostics bounded; section 7: record size, archive files, atomic index, no deletion. W5 measures the defined behaviour. |
| 7. Separate the two wire revisions truthfully | Section 7's table from the 2026-07-28 changelog and the 2025-11-25 transport rules: no handshake, per-request `_meta`, `server/discover`, `subscriptions/listen`, `ttlMs` and `cacheScope`, `resultType`, removed methods; against `initialize`, session header, `GET`, `DELETE`, `404`, `notifications/tools/list_changed`; separate per-connection state; the minimal-handler alternative must implement each revision in full. W7 drives a real client of each. |

## 17. Sources read for this note

`notes/2026-10-01-mcp-plan.md` (sections 1, 4, 5, 6, 10, 11, 12, 13, 14);
`plans/009-2026-10-03-mcp-clarification.md`; decision `775acdd3`; review
`ca8a00f6`; `docs/protocol.md` section 21 and section 34; `docs/scopes.md`;
`docs/cli.md`; `docs/page.md`; `docs/testing.md`;
`packages/contract/src/intent.ts`, `definition.ts`, `result.ts`,
`transport.ts` (`Beside`), `bounds.ts`; `packages/cli/src/commands.ts`
(`heldActs`, `describe`, `expectedOf`, `act`, `issueOpen`,
`activeDefinition`, `clone`); `packages/cli/src/files.ts` (private
records); `packages/page/src/data.ts` (`actsOn`) and `join-custody.ts`;
`packages/client/src/handle.ts` (`found`), `session.ts`;
`packages/platform/src/membership.ts`, `directory.ts`, `rules-scope.ts`;
`packages/scope/src/worker.ts` (routes); `parked/mcp/src`;
`examples/counting/definition.json` (`join`, `spoken`, rules);
`request/agent-key-node` (`agent-key-invitation.ts`, its `docs/cli.md`
diff); `packages/client/src/prepare.ts`; `packages/derive/src/judge.ts`
(replay before expiry) and `packages/scope/src/core.ts` (`settle`);
`packages/lanes/definitions/change.json` and `change3.json`
(`propose-manifest`); the MCP 2026-07-28 changelog and the 2025-11-25
transport specification.
