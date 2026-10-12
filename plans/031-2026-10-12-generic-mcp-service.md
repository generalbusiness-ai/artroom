# One MCP service for every dap application

2026-10-12. Draft 3, for checker review before implementation.
Planned against main `d309b6b9baca9e6a51a1dfb2c7979145463b229c`.
Draft 1 (`ab740346`) received changes requested in review `ca8a00f6`, with
eight corrections; Draft 2 (`41ed9eff`) answered each, and section 14 maps
them. Draft 3 follows Hugh's direction of 2026-10-12 14:37 Eastern: the
tool list is dynamic, one tool per act kind of each definition the room
holds, so an agent picks a verb directly instead of calling a generic
`acts` then `act`. The generic pair stays as a fallback behind a flag.

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
| Tools are complete; resources, prompts, elicitation, Tasks and Apps are enhancements | Kept. Ten generic tools plus one tool per act kind the room holds; nothing else is required (section 3). |
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

So a server that offers founding, reads, one signing tool for each act a
definition in the room declares, generated from the declaration and
carrying every native beside input, and the helpers every composition
needs (wait for a created scope, settle a lost reply, read a text, fetch a
credential once) is complete for every application, present and future,
without a line of code that names an act. Section 10's inventory (W1) lists
every CLI command and page action against the tools that perform it, so
completeness is checked, not asserted.

## 3. The tools

The surface has two parts: ten generic tools that read, wait, settle,
found and fetch a credential, which never change; and one tool per act
kind of each definition the room holds, generated from the declarations
and listed for the caller's role, which change when the room changes.
Names are short; the host namespaces them. Every input and output schema
has an object root. A refusal is a normal result (`isError: false`) with
the scope's `Answer` as structured content; a failure before or beside the
scope's judgment (transport, shape, custody, credential) is a tool error
(`isError: true`) with a structured `{ error, message, next }` (R-API-1 of
`docs/protocol.md`, section 21, kept).

### The generic tools

| Tool | Does | Reads | Annotations |
|---|---|---|---|
| `room` | Orientation: the service, the repository's scopes with their names (directory, membership, rules, destination, inbox), who I am (handle, role, key ID) or that standing is unknown, the active definitions (name, digest), and the lanes the directory lists with number, kind, title and state, bounded at 50 with a cursor. | membership summary, directory summary, rules summary | read-only |
| `scope` | One scope: its definition name and digest, status, head, counts by item type and state, and its live items, bounded; with `declaration: true` the retained definition's bytes, paged by `offset` and `limit` (section 9). | summary; retained for the declaration | read-only |
| `found` | Founds a scope with no existing target: `definition` (a platform name, or a declared definition's JSON or digest), `kind` (the definition's genesis act), `fields`, `idempotencyKey`, and the beside inputs `texts` and `definitions` (the declarations the definition names in its creates). Same custody as an act tool (section 7). Returns the founding answer and the new scope's reference. After an accepted founding the list gains that definition's act tools. | none before; one POST | not read-only, destructive, idempotent under the required key |
| `items` | A page of a scope's items of one type: live or final, with a cursor. | items | read-only |
| `history` | A page of a scope's entries, oldest first, each as one line: seq, time, kind, signer, effects and sends counts; `entry` for one in full. | history | read-only |
| `entry` | One entry in full: its input, fields, effects, sends and hash, paged by bytes when it is large (section 9); a detached text's digest resolves with `text`. | entry | read-only |
| `text` | A retained input by scope and digest: a detached text, or a value in its byte domain; paged by bytes. | retained | read-only |
| `wait` | Waits, at most 60 seconds, until one of: a scope's head reaches a seq; an item of a type reaches a state; the child scopes an entry created exist and are active (read by the entry's sends and the children's genesis cause chain, as the CLI's `createdBy` does). Returns what it saw and whether it timed out. Never writes. | summary; entry and the children's summaries for created scopes; polled at a bounded interval | read-only |
| `settle` | Was the intent under `idempotencyKey` accepted? Reads the custody record and asks the scope; resends nothing. Returns the receipt, `not-found`, `refused` with the recorded refusal, or `unknown` when the record exists and the scope has no receipt yet. | settle | read-only |
| `credential` | The one-time read credential for a `read-token` act the caller signed, from the destination's credential route, with the caller's session. This is the only tool whose output may contain a credential. It returns the credential in one structured field, `credential`, and the remote URL beside it, so a generic local Git helper or the agent's own Git can use it. The server keeps no copy. | credential route | read-only, but its result is secret: the description says so |

### The act tools

**One tool per act kind per definition name.** The tool for the act
`comment` of the definition named `issue` is `issue.comment`; the tool for
`invite-member` of `platform:membership@2` is `membership.invite-member`;
the Counter's `join` is `counting.join`. The name is the definition's
`name` and the act's kind, joined by a dot; a platform definition uses its
short name. A room with thirty issue lanes has one `issue.comment`. Two
definitions with the same name, such as `issue` and its demo profile, share
their tools; the server checks that the target lane's own definition
declares the kind, and refuses readably when it does not.

**Parameters.** The act's fields, each with the JSON Schema that section 4
derives, and only the beside inputs the act declares: `texts` for its
detached text fields, `presented` for its presented facts, `values` for a
digest field with a byte domain. `idempotencyKey` is required (section 7).
`on` is required for a transition, as the item's local ID. A target
parameter names the scope when the definition can have several scopes in
the room: for a lane definition, `issue` or `change` takes the number the
directory assigned or the lane's scope ID; for any other declared
definition, `scope` takes the scope ID. A platform definition that is a
singleton in the room (directory, membership, rules, destination, inbox)
has no target parameter. The server resolves a number to a lane through
the directory's items, reads the target's summary for `expected`
revisions, checks each field against its declared type, keeps the exact
envelope under custody, and submits. The result is the scope's answer; on
`accepted`, the fact (scope, seq, hash) and the receipt's duty IDs. Child
scopes are read with `wait`.

**Description.** The sentence, fields, presented facts and guards that
section 4 derives, so the agent reads what the act does and what would
refuse it before choosing, and the host validates the input from the
schema. The act's full declaration is not in the description; `scope` with
`declaration: true` returns it when an agent needs the exact form.

**What is listed.** For the caller's current standing, read at each
`tools/list`: every act of every platform definition in the room that the
role holds, or that a rule decides; every act of every definition the
rules scope holds active; and every act of the definition of each existing
lane, where that definition is no longer active, so that old lanes stay
workable. Acts the role does not hold are not listed; the generic `acts`
fallback names them with their actions, and a hidden act called anyway is
judged by the scope, since hiding is never authorization. The genesis act
of a definition is never a tool; `found` is. An agent that wants fewer
tools passes `--tools <definition names>` at launch and sees only those
definitions' acts beside the generic tools.

**When the list changes.** The server declares `listChanged` on its tools
capability. It re-derives the list when a read it makes for any call shows
a change in the inputs that the list depends on: the caller's role, the
roster's actions for that role, the rules scope's active definitions, the
set of definitions that lanes in the directory run under, or a scope the
caller founded. It then sends `notifications/tools/list_changed`, and the
host re-fetches. The list depends on authorization and on what the room
holds, never on the history of the connection; two connections of the same
key to the same room at the same moment list the same tools. Changes are
rare in practice (a role change, an activation, a new kind of lane), which
is why a per-connection notification is cheap. The server keeps the last
derived list in memory only to know whether it changed.

**Counts, from the definitions in the repository.** An admin in the demo
room: about 25 platform acts, 12 of the demo issue profile, 19 of the demo
change profile, and the 10 generic tools, about 66 tools. With the full
lane definitions, about 140. A member sees fewer. These are estimates from
counting declarations; the delivery measures the real lists (section 9).

**The generic fallback.** `acts` and `act`, as Draft 2 described them, stay
in the server behind the launch flag `--generic`: `acts` lists the acts of
one scope with the same derived text, including the acts the role does not
hold, and `act` signs one by kind. They are for a host with a tool-count
limit, and for a scope under a definition the list does not show. They are
not listed by default, so an agent never sees two ways to do one thing.

**Server instructions**, at most 512 characters: start with `room`; each
act tool's description says what it does, who may sign it and what would
refuse it; an answer is the scope's decision, and a refusal that names a
guard points at the sentence that explains it; after `accepted`, use `wait`
to see what the entry created; after a lost reply, `settle` with the same
`idempotencyKey` instead of signing again; `credential` is the only tool
that returns a secret, and only for a read token you signed; nothing here
grants authority; what you may sign is what your role holds, and the list
changes when that changes.

**Annotations are truthful, not reassuring.** Every act tool and `found`
are advertised as not read-only and destructive, because an act can close,
remove or redact declared state. They are advertised as idempotent only
because the key is required and a repeat under the same key resends the
same envelope (section 7). Every generic read is read-only.
`credential`'s description says its result is a secret.

**Not in the list, on purpose.** No `verify`, no `clone`, no `propose` as
tools. `verify` is a verifier over reads that an agent runs as a command.
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
guard renders whole. A description that would pass 1,000 characters ends
its guard list with `and <n> more guards; read the declaration with scope`,
and names the guards it left out by their reason names, so a refusal still
points at a name (section 9 bounds the list by paging where a host
supports it, not by dropping acts).

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
| the target's definition does not declare the kind (a lane under another definition) | `before signing, the server found that <scope> runs <definition>, which has no act <kind>. Nothing was sent.` | `room` to see the lane's kind; use the tool of that definition. |
| `refused` `revision-moved` | `<scope> refused <kind>: an item this act names changed after it was read, judged at head <seq>.` | Read again, sign again with a new key. |
| `refused` `expired`, `scope-full`, `final`, `slot-full`, `type-full`, `entry-too-large`, `fact-mismatch`, `capability-refused` and the rest of `RefusalReason` | one sentence each from a table in the server, naming the bound or the name the answer carries | stated per reason |
| `unavailable` any reason | `<scope> did not judge <kind> (<reason>). Nothing is known to have been accepted; timed entries may have been written.` | `settle` with the same `idempotencyKey`; do not sign again first. |
| `mismatch` | `your key already signed another intent under this idempotency key on <scope>.` | Use a new key for a new meaning. |
| read refusal (`forbidden`, `not-found`, `wrong-incarnation`, `scope-provisional`, `unsupported-definition`, `history-unavailable`, `too-large`, `unavailable`) | `<scope> did not answer the read: <reason>.` | per reason: `room` for standing; a smaller page; try later |
| `ShapeError`, before signing | `before signing, the server found field <name> <what is wrong>; declared: <type>. Nothing was sent.` | Correct the field. |
| `TransportError`, lost or malformed reply | `the reply from <scope> was lost or malformed; the outcome is unknown. The envelope is under custody.` | `settle` with the same key. |
| custody (section 7) | `the server's record for key <key> on <scope> is <absent|conflicting|full|locked|unreadable>; nothing was sent.` | per state: a new key for a new meaning; wait and retry for locked; settle the unresolved records for full |
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

Standing (who I am, which actions my role holds) comes from the membership
scope: the repository's, as the configuration names it; or, for a scope
whose directory records another membership, that one. When standing cannot
be read, `acts` lists every act with `your standing is unknown` and `act`
still signs; the scope judges. Hiding is never authorization. W2 changes a
role with `set-role` and activates a definition with `activate` during the
story and asserts that the next `acts` and `room` show the change.

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
except the process's in-memory session token, the last derived tool list
(kept only to know whether to send `list_changed`), and the custody store
below. Neither the token nor the list is authority: a call rebuilds what it
needs from the configuration and reads. Cursors, item IDs, scope IDs and
idempotency keys are the handles.

**Custody: the required key and what it binds.** Every act tool and `found` require
`idempotencyKey` from the caller, any unique string the caller will
remember, and refuse without one. The server generates none, because a key
the caller does not know cannot be used to settle after the first MCP reply
is lost. The custody store is `ARTROOM_HOME/private/mcp-custody/`, owner-only,
one file per record, named by a digest of the record's identity:

- **identity:** service origin, the membership scope and incarnation that
  standing is read from, the signer's key ID, the target scope and
  incarnation (or `found` and the definition digest), and the idempotency
  key;
- **requested meaning:** the digest of the canonical form of what was
  asked: kind, on, fields as given, the texts', values' and presented
  facts' digests and domains;
- **the envelope:** the exact signed intent and its exact beside values,
  bytes as sent;
- **phase:** `prepared`, `sent`, `accepted` with the receipt, `refused`
  with the answer, `unknown`.

Before sending, the server takes an exclusive lock on the record's identity
(a lock file created with `O_EXCL` beside the record, holding the process
ID and time, released on completion and broken only when its process is
gone and its time is older than the intent's `notAfter`), writes the record
to a temporary file, renames it into place, reads it back and compares the
bytes, and only then sends. A second process sharing the store sees the
lock or the record. The rules:

| Situation | What the server does |
|---|---|
| No record under this identity | First preparation: sign, keep, read back, send. |
| A record with the same requested meaning | Retry: resend the same bytes; no new signature. |
| A record with a different requested meaning | Refuse `conflicting`; send nothing; name the recorded kind and target. |
| The identity is locked | Refuse `locked`; send nothing; say to retry after a moment. |
| `settle` | Read the record; ask the scope with the recorded envelope; update the phase; sign nothing. |
| Phase `unknown` after a lost reply | The record stays until `settle` resolves it; it is never evicted. |

**Capacity and lifecycle.** The store holds at most 256 unresolved records
(`prepared`, `sent`, `unknown`) and refuses a new preparation as `full` when
it is at that bound, naming the oldest unresolved keys so the agent can
`settle` them. Resolved records (`accepted`, `refused`) are kept for replay
and moved, by count beyond 1,024 or by age beyond 30 days, into a monthly
archive file in the same directory, append-only; a retry whose record is in
the archive is still found and still resends the same bytes. Nothing is
deleted by the server. A record whose intent's `notAfter` has passed is
still a record: a retry of it sends the same expired envelope and the scope
answers `expired`, which resolves it; the agent then chooses a new key for
a new meaning. This keeps the page's join-custody rule, that the original
envelope is never replaced, for every act.

**Credentials.** The read credential of the destination is delivered only by
`credential`, only for a `read-token` act the caller's key signed, read
once with the caller's session from the credential route, and returned in
the one structured field. The server does not keep it, log it or include
it in any other result. `entry` and `history` of the destination show the
`read-token` act and its outcome, which carry no credential by the
destination's own rule. W4 drives a credential through the server and
asserts it appears in `credential`'s result and nowhere else.

**SDK.** The implementation pins one MCP server SDK version in the reviewed
commit, with the lockfile, and uses its stdio and streamable HTTP transports
in stateless mode and its origin validation where it offers one. The
alternative of a minimal JSON-RPC handler for `initialize`, `ping`,
`tools/list` and `tools/call` is acceptable if the SDK's bundle or its
transport assumptions do not fit; the delivery note states the choice and
its reason. The wire tests drive the server through a real client over both
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
| `tools/list` | 3 (membership, directory, rules summaries) plus one retained read per distinct definition digest not yet read in this process | +1 | the whole list; see section 9 |
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
| Each tool as sent | description at most 1,000 characters; schema at most 4 KiB; instructions at most 512 characters | the canonical JSON the server sends |
| `tools/list` as sent, per role | measured and reported, not gated by a fixed number: the bytes and the token count (by a pinned counter named in the note) for an admin, a maintainer, a member and an agent in the demo room, and for an admin with the full lane definitions; the whole list at most 256 KiB | the canonical JSON the server sends, for each role in W2's room |
| List changes | one `list_changed` per real change of role, roster actions, active definitions or lane definitions, and none otherwise | counted by the test's client over the W2 story |
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
| (a) complete | **W1 inventory.** `docs/mcp.md` lists every command of `docs/cli.md` and every page action of `docs/page.md` with the tool calls that perform it, including `install` and `claim` through `found` and `act`, `issue open` with its definition value, `edit` and `propose` with their detached texts and presented facts, and `clone` with `credential`. A test asserts that rendering is total over every act of every definition in the repository (the six platform definitions, `issue`, `change`, `issue-demo`, `change-demo`, `counting` and the unfamiliar test definition), over every guard form and operand of the contract, and that every act that declares `presents` or a byte domain is exercised with that input somewhere in W2. | `packages/mcp/test/inventory.test.ts`; `docs/mcp.md` |
| (a) driven by available acts | **W2 story, room.** Against the real test Worker: `found` the register and the room, publish rules, activate the demo definitions, `set-role` a member, open an issue with its definition value and body text, comment, assign, close, open a change by `propose-file` with its presented facts, review, merge; all through the act tools over an in-process client. The test fetches `tools/list` before each step and asserts that every tool it calls was listed for the caller's role at that moment, that a `list_changed` notification arrived after the activation, the role change and the first lane of a new kind, and that none arrived otherwise. | `packages/mcp/test/room.scope.test.ts` |
| (c) one service | **W2 story, unfamiliar.** A definition written in the test (three acts, two item types, a `distinct` guard, a presented fact, a detached text) is founded and driven through the same server. **W2 story, Counter.** A Counter scope under its cohort: `join`, `start`, `spoken`, `leave`. No counting import in the server; the import boundary test refuses one. | `packages/mcp/test/unfamiliar.scope.test.ts`; `counter.scope.test.ts`; `scripts/active-source.test.mjs` |
| (b) descriptions | **W3.** The five worked examples of section 4 are snapshot tests of the tool descriptions as `tools/list` sends them, with the expected text in `docs/mcp.md`, so the checker reads what an agent reads. A test renders every guard form and operand of the contract once and asserts no form falls through to raw JSON, and that a description over 1,000 characters names what it left out. | `packages/mcp/test/describe.test.ts` |
| (b) errors | **W4.** Table-driven over every reason of `RefusalReason`, `UnavailableReason`, `MismatchReason` and `ReadRefusal`, plus shape, transport, custody and credential errors: the sentence names the scope, the kind, the head when the answer carries one, the source of the finding, and a next step. Two cases use a definition with two unnamed guards and assert the sentence attributes neither. One case moves an item's state after the judgment and asserts the sentence reports the judged head, not the new state. One story drives a session token, a key, an invitation secret and a read credential through every tool and asserts the credential appears only in `credential`'s structured field and the others nowhere. | `packages/mcp/test/errors.test.ts` |
| (d) efficient | **W5.** The budget tests of section 9 and the read counts of section 8 over the instrumented transport, cold and warm, with an expired and a refused session, created children, pagination of a large retained input, the list for each role with the demo and the full lane definitions, the count of `list_changed` notifications over the story, and standing and activation refresh. The delivery note reports the observed figures. | `packages/mcp/test/budget.test.ts` |
| retries | **W6.** First MCP reply lost (the client never sees the result) and `settle` with the caller's key finds the receipt; two processes preparing the same identity at once, one locked out; the same key with a different meaning refused without sending; a restart between prepare and send resends the same bytes; a full store refuses a new preparation and names the unresolved keys; archive rotation keeps a resolved record findable for replay. | `packages/mcp/test/custody.test.ts` |
| transports | **W7.** A real MCP client over stdio and over loopback HTTP lists tools, calls `room` and an act tool, and receives a `list_changed` notification after an activation; the HTTP server refuses a request with an `Origin` header, a request without the per-launch bearer, and a bind address that is not loopback; `--generic` lists `acts` and `act` and the default does not. | `packages/mcp/test/wire.test.ts` |

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
- the nine test files of section 10;
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

1. A dynamic tool list: one tool per act kind of each definition the room
   holds, listed for the caller's role, with `list_changed` on a real
   change; ten generic tools beside them; the generic `acts` and `act`
   pair kept as a fallback behind `--generic` (section 3). Hugh's
   direction, 2026-10-12 14:37 Eastern.
2. Descriptions derived from the whole declaration into each tool's
   description and schema, with the declaration reachable through
   `scope`; authored `doc` text is a later, optional amendment (sections 4
   and 11).
3. The server signs with the agent's own key beside the agent, behind an
   origin check and a per-launch bearer on loopback HTTP; the hosted
   endpoint with key custody is stage 2 (section 7).
4. `idempotencyKey` is required and caller-known; retries resend exact
   envelopes under exclusive custody bound to identity and meaning; nothing
   is evicted while unresolved (section 7).
5. The read credential has one channel, `credential`, and no other output
   carries it (section 7).
6. The server renders only what the judge returned; unattributed fallbacks
   say so (section 5).
7. The plan's fixed token gate is replaced by a measured, reported list
   size per role with gates on each tool and on the whole list; nothing is
   dropped to meet them (section 9).
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
| 8. The retained, replaced and outstanding matrix | Section 1's table, including packs, application servers, the four reads, OAuth's steps, resources and prompts, Tasks and Apps, acceptance outcomes, and the token gate kept beside the byte gate; "ten" corrected to the current count throughout. |

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

## 16. Sources read for this note

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
diff); the MCP transport specification's requirements for local servers.
