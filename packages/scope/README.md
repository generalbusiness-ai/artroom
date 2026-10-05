# @generalbusiness/artroom-scope

The runtime of an Artroom scope: its storage, the commit protocol, delivery
between scopes, the outbox dispatcher, its reads, and the Worker that routes
to it. The target runtime is Cloudflare Workers: one Durable Object with
SQLite storage for each scope, named by the scope's ID in one namespace.

The scope and replay contract is the authority. Comments cite its sections.
Where the contract was silent, `notes/2026-10-04-i1-contract-deltas.md`
records what was implemented, in its sections "The runtime", "Repairs to
the runtime", "Composition and transport" and "A child's definition".

Nothing in this package deploys anything. `wrangler.jsonc` is
configuration only.

## How it is built

The core is small: a log, a fold and a turn. Every decision is made by
`@generalbusiness/artroom-derive`. Its `applyEntry` is the only code that
changes folded state, and its judges are the only code that decides what an
input writes. This package reads the clock, counts the budgets, and writes
what a judge drafts, in one storage transaction for each entry.

| Module | Holds |
|---|---|
| `store` | `Store`: the storage the core needs. It is derive's `StateView` and `StateWriter`, with `transaction`, `append` (an entry and the row of each send), `retain`, and bounded reads of entries, retained inputs and duties. |
| `sqlite` | `SqliteStore`, the one implementation, over `Sql`: `exec` and `transaction`, which a Durable Object's `ctx.storage.sql.exec` and `ctx.storage.transactionSync` satisfy. It keeps nothing in memory but the list of indexed slots. |
| `ports` | `Clock`, `Random`, `Authority`, `Resolver`, `Rules`, `Alarm`, `Definitions`, `SentTexts`, `Readers`, the members `capabilities`, `outside` and `owners`, and `production()`, their defaults. |
| `definitions` | `creates(declared)`: the digests a declaration names in its `create` sends. `namedBy(root, read, validate, limit)`: the declarations a scope retains for its children. |
| `turn` | `Turns.run(waiting, founding?)`: section 5.2, steps 3 to 7, and section 5.3. `isSigned` and `fetchFacts`: step 1. `Waiting`, `Verdict`, `End`. |
| `core` | `Scope`: `found`, `submit`, `settle`, `alarm`, `checkpoint`, `pinned`. `receiptOf`. The answers `Founded` and `Checkpointed`. |
| `sessions` | Read sessions: `sessionsOf`, `mintSession`, `openSession`, `sessionReaders` (the production readers port), `issueSession` (membership's answer to a signed request), `credentialInUrl`, and `Streams` with `relay`, the streams of a scope's head. |
| `limits` | `JoinLimits`: the serving limits of a join at the front of a membership scope. `addressKey`, `isJoin`, `PROPOSED_LIMITS`. |
| `operator` | `OperatorRecord`: the operator's record of a scope, outside its history. `incidentsOf`, `waitingIn`, and `sendAgain`, the instruction to dispatch a waiting request once more. |
| `reads` | `Reads`: `summary`, `items`, `history`, `entry`, `outbox`, and `duty`, one send's row; `operations` and `operation`, the outside operations with their attempts and outcomes; `incidents`, a page of the operator's record, and `waiting`, the two lists of requests that wait. For a verifier: `log`, a history page as stored bytes, and `retained`, one retained input. `ReadBounds` and `READ_BOUNDS`. |
| `delivery` | `Deliveries.deliver(envelope)`: receiving. It reads the source entry through the resolver, checks it against the fact's hash, and runs derive's delivery judge, or its genesis judge for a `create` that reaches an empty store, in the scope's turn. It answers as transport does: `recorded` with a fact, `retry`, `routing` or `source-unverified`. |
| `outbox` | `Dispatcher.run()`: sending. One pass at a time over the sends that are due: a durable record before each dispatch and after its answer, a retry delay that doubles, and a `diagnosis` input through the turn when a request is given up. `Wakes`: one alarm for the earliest deadline, the next dispatch and the next attempt of an outside operation. |
| `operations` | `Operations.run()`: the driver of outside effects, beside the dispatcher. An attempt is recorded by its entry, marked durably before its one request leaves, and never sent twice: one that is found marked with no outcome is recorded `unknown`. An answer becomes an `outcome` input through the turn. `Operations.answered()` takes an answer at any later time. `Outside` is the port, and `NO_OUTSIDE`, the default of `production()`, sends nothing. |
| `diag` | `diagnosis`, `report` and `redact`: one line of the log for a failure at a port that no entry and no answer describes. A diagnosis holds an event and a step, which are fixed words, and an error's name from a fixed list. It reads no message of a thrown value. `redact` replaces what has the syntax of a credential and cuts to a stated length: a second guard, and not a complete one. |
| `authority` | `observing(config)`: the authority port over reads of a membership scope. The read is made before the turn, is counted by run and number, and is kept only in memory: at most one observation for each key, and a revoked answer for the run. `Membership` is the port that reads a membership scope. The production wiring does not use it yet. |
| `namespace` | `namespace(binding)`: the production `Resolver`, `Transport`, `Definitions` and `SentTexts`, each one RPC call on the object a scope ID names. `membershipIn(binding)`: the read of a membership scope, which no object answers yet. `routed`: the resolver of a name, which refuses a wrong address before any judgment. `sourced`: the answer to a read of one entry. `declaredBy`: the answer to a read of one retained declaration. `sentText`: the answer to a read of one detached text that a send of this scope names. |
| `object` | `ScopeObject`: the Durable Object class. It wires the store, the ports, the core, receiving, the dispatcher and the reads, and exposes them over RPC: `found`, `submit`, `settle`, `checkpoint`, the reads, `deliver`, `source`, `declared`, `text`, `dispatch` and `effect`. Its `alarm()` runs the alarm's turn, then a dispatch pass, then a pass of the operations driver. With no transport, which is its default, nothing is dispatched. With the outside port of `production()`, which sends nothing, and no owner rules, nothing is sent outside the service. |
| `worker` (its own entry, `@generalbusiness/artroom-scope/worker`) | `route(request, binding)`: the HTTP routes. `ScopeService`: the same operations over a service binding; it implements the contract's `ScopeApi`, which a client's transport also is. `DeployedScope`: the object class with the namespace as its resolver, its transport and its source of declarations. `api(binding)`: what both call. The default export is the deployed Worker. |

`@generalbusiness/artroom-scope/testing` is for tests only: a test
authority, which is a stand-in that reads no membership scope and calls
every presented grant current, a scripted membership, which is a stand-in
for the membership scope under the real observation read, a test readers
port, a scripted clock, a gate that pauses preparation, a resolver over entries a test
supplies, and, for several scopes in one namespace, a transport that a test
can hold back or make lose an answer. It also has `scriptedCapability`, a
stand-in for the code of `hold@1` and `git-read@1`: it answers each
capability guard and effect from a table that the test supplies, and reads
no hold, no record and no repository. A test that uses it shows what a
definition does once a capability has answered, and nothing about a real
hold, a Git read or a provider. The main entry and `worker.ts` do not import it.

Two more controls of that module serve tests of several scopes. `net.peers`
holds the entries of scripted peers: stand-ins for scopes of a platform
kind that is not delivered, such as a rules scope or a destination. A
receiver reads such an entry as it reads any source entry, and nothing
judged it. `net.sized` gives one scope of the namespace its own bounds, by
the name of its object.

`@generalbusiness/artroom-scope/testing/worker` is this package's test
Worker, `test/worker.ts`, as an export. The lanes package loads it to run
its scenarios alone. From the root, those scenarios run inside this
package's own test project, which the root `vitest.config.ts` arranges:
no file of this package names the lanes package. A scenario's client
calls `api` of `worker.ts` in the test's isolate, and uses the HTTP routes
for a few acts
(`notes/2026-10-05-i2-contract-deltas.md`, entries DK1 to DK4 and DK11).

## Ports and their production defaults

| Port | Asked for | Production default |
|---|---|---|
| `Clock` | One reading for each call. | The runtime's clock. |
| `Random` | The bytes of a new incarnation. | The runtime's random source. |
| `Authority` | Two phases. `read`, before the turn: what the judgment of one act's signer needs, within the fetch time limit. `held`, a method of what was read, in the commit: each grant the act may be judged on, and whether it is current at the commit's reading. It is a function of the folded state, that reading and what was read. `sealed`, optional: the commit tells the port the entry that it wrote on that answer. | The read finds no grant, so none is current. Every act that needs one is refused `unauthorized`. |
| `Resolver` | One foreign entry by fact reference, within the fetch time limit: the entry, `absent` when the object at that name does not hold it, or nothing when it cannot be read now. | Nothing can be read. An act that names a foreign entry is answered `dependency-unavailable`. `DeployedScope` supplies the namespace. |
| `Transport` | One dispatch of one send to the object its address names, answered or not. | None: the sends stay in the outbox. `DeployedScope` supplies the namespace. |
| `Rules` | The results of prepared rule inputs. | Derive's evaluator, `evaluateRules`. |
| `Alarm` | The next wake time. | In `production()`, nothing. `ScopeObject` supplies the object's own alarm. |
| `Definitions` | `read`: a declaration by digest, from the scope that retains it. `platform`: a platform definition by name and version, with the rows of each entry that are code and the rules written for them. | `read`: a digest is unavailable. `DeployedScope` supplies the namespace, which reads a child's declaration from its creator. `platform`: the platform package's definitions. A name it does not hold is `unsupported-definition`. |
| `SentTexts` | A detached text that a delivered message names by digest, from the scope that sent the message. | Unavailable: a delivery that names one is not decided. `DeployedScope` supplies the namespace, which reads the text from the sender. |
| `Readers` | Whether a reader may make a read, by the read's name. `operations` and `operation` are asked as `operations`. It answers yes, no, or one of two names for a session that could not be judged: `sessions-unavailable` and `clock-behind`. | Nobody may: every read is `forbidden`. The deployed class uses read sessions: "Read sessions", below. |
| `capabilities` | The rules of the capability forms this runtime has code for: the records, guards and effects of `hold@1`, and `git-read@1`. Each rule is a pure function of its arguments, the folded state and the input being judged. | `CAPABILITY_CODE`: derive's code of `hold@1` and `git-read@1`, with the floor of 2 tokens for one hold and no retention of a root. A runtime with none does not found or create a scope under a definition that needs one: `unsupported-definition`. The item form of `hold@1`, with its `hold` effect, needs none and runs. |
| `outside` | One request of one attempt of an outside operation, and its answer. | `NO_OUTSIDE`: nothing is sent. Each attempt stays recorded and not sent. |
| `owners` | The rules of the owners of outside operations that this runtime has code for, by owner and kind: derive's `Owners`. | `CAPABILITY_CODE`: the rules of the operations that `hold@1` owns. No operation is opened in production, and the `outside` port sends nothing, so no attempt is sent. |
| `diagnoses` | Where a diagnosis goes. | `toConsole`: one JSON line in the runtime's log. |

So a deployed scope can be founded and can create children, and then
admits no act and answers no read. The authority note's rules and sessions
each replace one port.

## Authority, in two phases

An act's authority is read before the turn and decided in the commit.

1. Before the turn, after the foreign entries are fetched, the core asks
   the authority port to read what the judgment of this signer needs. The
   read is for this one act. The core keeps what it returns in the memory
   of the call and nowhere else. Nothing stores it, so a restart leaves
   none, and no other act is judged on it.
2. In the commit, the core asks what was read which grants it holds, at
   the commit's head and on the commit's one reading. The judge is given
   the answer. It reads nothing.

- A read that fails, is late or gives nothing leaves the act with nothing
  to be judged on. The act is answered `authority-unavailable` at check 9
  of the contract's section 4.2. It is Unavailable: nothing was recorded,
  its key is not consumed, and the same signed intent may be sent again.
  The earlier checks still answer first.
- An act whose key is on a sealed entry is answered from history. Nothing
  is read for it.
- The entry records the one grant that was judged. A replay gives the
  judge that grant and derives the same decision.

`observing`, in `authority.ts`, is the port for a scope whose grants are
judged on membership. Its read is made before the turn, with the scope's
own clock noted first. It is counted by the run and by its number in the
run. What it reads is kept in memory only, so a restart leaves none.

- It keeps at most one observation for each key, for a later act of that
  key inside the window. The observation of a ten-second kind, such as
  taking a hold, serves the one commit that it was read for.
- A read that shows a key revoked, or its member removed, is kept for the
  run. From then on the key is refused at once, whatever a window says.
- In the commit, derive's `judgeGrant` decides. A guard of the observation
  that fails discards it: the act is answered `authority-unavailable`, and
  the next read is made again. A standing that does not hold the action is
  refused `unauthorized`.
- Heads do not go back, also across a restart. The folded state holds,
  for each key and each member that an entry retained an observation of,
  the highest head of membership. The commit discards a read that was
  answered from a lower head. A state that holds none has no member for
  them, so its digest is unchanged.
- A grant's `within` is a scope reference or a filter, `{ membership }`. A
  filter covers a scope when it names the membership scope that the scope
  itself records, with that incarnation. The read asks `{ of, key }`, and
  names no asker. An answer whose `within` is not that filter, with `of`
  as its `membership`, is no answer.
- The entry's grant is built from the observation and retains it, with
  the read and how the entry used it: `fresh`, or `reused` with the entry
  before. The commit tells the port which entry used a read last.

The production port does not use it yet: no scope records its membership
scope, and no membership scope answers a read. Its read finds no grant,
and every act that needs one is refused `unauthorized`.

## A platform definition

A platform definition is code of the runtime. It is pinned by its name and
version, such as `platform:inbox@1`, and no scope retains bytes for it.
One version is its data and its rules, and the platform package supplies
both. The data holds a mark, `{ code, row }`, at each place where a rule is
run, and `code` names the rule. What follows builds the scope contract's
revision 15 and the authority note's revision 20. It was written while
both were filed for review. Both are adopted since. The adoption is of
the designs, and is no review of this source.

- A founding that names a platform definition is run under the platform
  package's data. That data alone is validated with the validator's
  platform option, which reads a mark at seven places and lists it. A
  declaration that an input, a peer or storage gave is validated without
  it. So a declared definition never takes a name that begins
  `platform:`, and never holds a mark.
- The judges run each rule at the check of its mark's place, in a
  commit and again in a replay. A rule is given the folded state before
  the entry, the entry's input, the entry's time, the entries in `uses`,
  the scope's own earlier entries, and what the judge resolved. It is
  given no storage, no network and no other clock. A rule that throws, or
  that returns a value outside what its place allows, leaves the input
  not judged: an act is answered `unavailable`, a delivery gets `retry`,
  and nothing is written.
- The rule of the contract's section 6.1 is of the whole scope. A scope
  is founded under a platform definition only when a rule of the right
  kind is supplied for every mark of its data. When one is missing, the
  founding is refused `unsupported-definition`, and nothing is written. A
  scope that exists under such a definition admits nothing: an act is
  answered `unavailable`, a delivery gets `retry`, no timed entry is
  written, a read is answered `unsupported-definition`, and the
  operations driver sends nothing outside the service.
- `platform:inbox@1` has one mark, `notice-source`, among the effects of
  its `notify` handlers, and the platform package has its rule. So the
  production wiring founds a scope under it. A `notify` writes a notice
  whose `source` the rule set. `codeLost`, of the testing entry, supplies
  the data with no rule. It stands for a runtime that lacks the code.
- An act of a row whose `grant` is a mark is judged by the mark's rule in
  place of the grant check. When the rule passes, the entry records
  `authority: []`.
- A creation under a platform name pins the runtime's own data and
  rules, as a founding does. Nothing of the definition is read from the
  creator. A version that the runtime cannot run whole is answered
  `unsupported-definition`: transport answers `retry`, and nothing is
  recorded.
- The platform package holds the data of `platform:register@1` and of
  `platform:directory@1`, and each rule of the two that can be written.
  The register lacks the rule of one mark, and the directory's data holds
  three marks with no rule (`notes/2026-10-05-i3-contract-deltas.md`,
  entries EJ1, EP6 and EP7, and section 22). So nothing is founded or created under
  either by the production wiring.
- A directory under `platform:directory@1` records its membership
  reference in its slot `repository.membership`. The production authority
  reads it there, from the scope's own folded state.

The founding makes a scope of the kind `directory`, as every founding
does. Derive's genesis judge also founds a register, of the kind
`register`, by an `install` intent under `platform:register`. The scope's
`found` does not build that seed yet.

## A child's definition

No registry holds a declaration. A declaration is immutable bytes named by
its digest, and the scope that may create a child under it retains the
bytes.

- A founding supplies, beside the directory's own declaration, the
  declarations its definition names in `create` sends, and those they name
  in turn. The directory retains each by its digest, with its genesis.
- A child, before its genesis turn, reads the declaration its seed names
  from its creator, by digest, and checks that the bytes are a valid
  declaration with that digest. It reads the declarations it must retain
  for its own children from the same creator.
- A creator that cannot be read, or that retains no such bytes, is
  `dependency-unavailable`. Bytes that are not a valid declaration with
  that digest, and a platform definition, are `unsupported-definition`.
  Transport answers `retry` with that reason, and nothing is recorded.

## Storage

One scope has these tables. Every value is canonical JSON in a TEXT column,
whose stored bytes are the canonical bytes.

| Table | Holds |
|---|---|
| `meta` | The scope's record: its reference, status, head and last entry time. Beside it, the deadline the turn last asked to be woken for. |
| `entry` | The history: `seq`, hash, time, canonical bytes and their size. An act entry also has its actor, idempotency key and intent digest: the idempotency index is an index over the history. |
| `item`, `item_count` | The items, and the exact number in each type and state. The index on type, state and ID answers a page from a cursor, so a page costs the rows it returns. |
| `item_slot` | For each slot that a range guard's `where` reads, as `validateDefinition` derived them: the slot's value in each item, indexed by value. It is kept and not yet read, because `StateView.page` takes no `where`. |
| `outbox` | One row for each send: `seq`, ordinal, target, class, message, the held flag, and for a request its result or diagnosis. The dispatcher's bookkeeping is in three more columns: `attempts`, the attempt log; `next`, when the next attempt is due; and `ack`, the fact transport acknowledged the send with. |
| `inbox` | Each incoming delivery the scope recorded, by source scope, incarnation, entry and ordinal. |
| `folded` | Folded records that are not items: relationship copies, held creations, and the digests of the texts a slot has held. |
| `operation` | The outside operations, folded, by the entry that opened each and its ordinal there, with what each still reserves. |
| `attempt` | One row for each attempt that an entry opened, written with that entry. The driver's bookkeeping is in three columns: `next`, when it looks at the attempt next; `sent`, the time written before its one request left; and `outcome`, the entry that recorded its first outcome. |
| `retained_input` | What an entry names by digest and does not carry: the definition's declaration, the bytes of each foreign entry in a `uses`, and the input of each rule evaluation. A delivered message, a rule's result and an outcome's evidence are inside the entry that records them. |

An entry's row, the fold's changes, its sends and its retained inputs are
written in one transaction. A transaction that does not commit leaves
nothing, in storage or in memory.

## A turn

1. Before the turn, `submit` checks the signature and the shape and fetches
   the foreign entries the fields name. A failure is
   `dependency-unavailable`.
2. A queue admits one input at a time to the drain and snapshot, and to a
   commit.
3. The drain reads the clock and asks derive for the next due transition.
   Each selection costs one timed attempt and is committed by itself.
4. The head is noted.
5. The input's rules are found over the snapshot and evaluated within the
   preparation time limit. This is the one place a turn waits, and the
   queue is free while it does. An input with no rule does not wait at all.
6. The commit is one transaction: one clock reading; the head check; the
   judge, which makes the due check and derives every guard and effect;
   `entryOf`; the hash; the write.
7. A stopped commit is a restart. The timed attempts and the restarts are
   bounded. A turn that spends either ends `busy` and writes nothing more.

After a turn that wrote, that left work due, or that an alarm started, the
alarm is set to the earliest deadline, or a retry delay ahead when that
deadline has already passed.

Every number is a member of the contract's `Bounds`. The scope's entry
budget and the alarm's retry delay are temporary values there.

An entry that is new work (a genesis, an act, a delivered request or
advisory, a `conflict` result, a checkpoint beside a pending duty) is kept
only if every pending duty still has an entry to settle in. An act or a
delivered request that settles what its form declares with `settles` is
not new work: it is written against what its item or copy reserved. Derive's `owed`
counts those entries from the folded state, inside the commit. An act that
does not fit is refused `scope-full`; a delivery is answered `retry`; a
checkpoint is `unavailable`. One entry is reserved for the closing
checkpoint: the checkpoint written when nothing else is pending. The deltas
note, sections 15 and 22, lists what is counted and what is not.

## Between scopes

A send is an outbox row written in the transaction of its entry. A new send
is due at its entry's time.

**Sending.** A dispatch pass runs after each call that may have committed,
without making the caller wait, and from the alarm. For each send that is
due it writes the attempt to the log as unanswered, sets the alarm for the
retry, and only then sends. When the answer comes it writes it over the
record. So an attempt with no recorded completion reads as unanswered.

| Transport answers | The dispatcher |
|---|---|
| `recorded`, with the fact of the entry that recorded the message | Marks the send acknowledged with that fact. This is bookkeeping, not an entry. A request then waits for its result, which arrives as a delivery. |
| `retry`, with any reason, or `source-unverified` | Logs `retry` and sends again after the delay. |
| `routing`: `wrong-incarnation` or `not-found` | Logs it and sends again after the delay. When a request's log holds as many routing refusals as `routingRefusals`, it is given up. |
| No answer within `dispatchSeconds` | Leaves the record `none`. |

A request that is given up becomes a `diagnosis` input with the log, in the
scope's turn. Derive's judge decides the finding from the log alone. After
either finding the request is not sent again. A result, a control and an
advisory are never given up: they are sent until acknowledged.

A held send, of a provisional scope's genesis, is not due until the entry
that records the confirmation clears the flag. No attempt of it starts.

**Receiving.** `deliver(envelope)`:

1. The resolver of the name answers first, from the scope's record:
   `not-found` or `wrong-incarnation`. Nothing was judged or recorded.
2. The source entry is read from the source scope's object, by its scope
   ID. Not readable now: `retry`. Another incarnation, no such entry, or
   bytes that do not match the fact's hash: `source-unverified`.
3. The delivery is judged in the scope's turn, like an act: the queue, the
   drain, the head check and the budgets are the same. A `create` that
   reaches an empty store writes the genesis and mints the incarnation.
4. A first decision and a repeat are both answered `recorded`, with the
   fact of the entry that recorded the message. A scope that cannot decide
   yet answers `retry`. A repeat still reads and checks the source entry.
   It reads no further foreign entry and no text, so one that can no longer
   be had does not hide the answer. A repeated founding is answered the
   same way. A message that no handler receives names nothing to fetch.

The source entry's bytes are retained with the entry that used them.

## Routes

`route` serves these, and `ScopeService` has one method for each. A body is
the contract's own answer.

| Route | Answer | Status |
|---|---|---|
| `POST /v1/scopes`, body `{ founding, definition, definitions?, texts? }` | `Founded` | 201 accepted; 422 refused; 503 unavailable |
| `POST /v1/scopes/:scope/acts`, body `{ signed, grants, texts?, presented? }`. `texts`: each detached text that a field of the intent names by digest. `presented`: the facts presented beside the intent, by name | `Answer` | 200 accepted; 403 refused `unauthorized`; 422 refused otherwise; 409 mismatch; 503 unavailable |
| `POST /v1/scopes/:scope/preparations`, body `{ signed, grants, capability, step }`. One step of a capability, asked for with the signed intent that it prepares for. With no code for the step, as in production, nothing is judged: 503 `unavailable` | `Answer` | as an act |
| `POST /v1/scopes/:scope/settle`, body `{ signed }` | `Settlement` | as a read |
| `GET /v1/scopes/:scope` | The summary | 200; 404 `not-found`; 403 `forbidden`; 409 `wrong-incarnation`, `scope-provisional`; 413 `too-large`; 501 `unsupported-definition`; 503 otherwise |
| `GET /v1/scopes/:scope/items/:type?cursor=` | A page of retained final items | as above |
| `GET /v1/scopes/:scope/history?cursor=` | A page of the history | as above |
| `GET /v1/scopes/:scope/entries/:seq` | One entry | as above |
| `GET /v1/scopes/:scope/outbox?cursor=` | A page of the outbox | as above |
| `GET /v1/scopes/:scope/outbox/:duty` | The outbox status of one send, by its duty ID | as above |
| `GET /v1/scopes/:scope/log?cursor=` | A page of the history as stored: each entry's canonical bytes and hash, for a verifier | as above |
| `GET /v1/scopes/:scope/retained/:kind/:digest` | One retained input: a `definition`, an `entry`, a `rule` input or a detached `text`, by digest. A text that was redacted is `not-found` | as above; 413 past 1 MiB |

A body is at most 1 MiB of bytes, counted while it is read: a larger body
is cancelled and is not held. A body over that, or one that is not a JSON
object in UTF-8, is 400. A path that is not percent-encoded UTF-8 is 400.
A reader is the `Authorization` header, passed to the readers port as it
is. A read session is presented as `Session <token>`.

Four more routes serve what is no history:

| Route | Answer | Status |
|---|---|---|
| `POST /v1/scopes/:scope/sessions`, body a signed session request `{ request, sig }` | `SessionAnswer`: the token and what it names, or a reason. Marked `cache-control: no-store` | 200; 400 `bad-request`; 403 `unauthorized`; 404 `not-found`; 409 `replayed`; 422 `misaddressed`, `expired`; 429 `rate-limited`; 503 `sessions-unavailable`, `clock-behind` |
| `GET /v1/scopes/:scope/stream` | Lines of JSON, `{ at }`: the scope's head when the stream opens and after each commit | 200; as a read otherwise |
| `GET /v1/scopes/:scope/incidents?cursor=` | A page of the operator's record of the scope, for an admin's session | as a read |
| `GET /v1/scopes/:scope/waiting/:list?cursor=` | One page of the list `diagnosed` or `unanswered` of the requests that wait, for an admin's session | as a read |

A request whose URL holds a credential, in its path or its query, is
answered 400 `credential-in-url` before anything is routed. A read with a
session adds two answers: 503 `sessions-unavailable` and 503
`clock-behind`.

## Read sessions

A read session is a credential: whoever holds the token reads. It signs
nothing, controls nothing and gets no other credential (authority note,
section 3.9).

| Question | Answer |
|---|---|
| What it binds | The deployment's name; the membership scope with its incarnation, which is the repository; the member and the device key; the reads of the member's role when it was issued; and an end time at most 600 seconds later, written from membership's clock. |
| How it is issued | A device signs a session request with its own key, to the membership scope. Membership answers from its head: only an active key of an active member gets one. It writes no entry. A request is answered with a session once: membership notes the key and the request's operation identity, outside its history, until the request's `notAfter`. |
| How it is verified | By HMAC-SHA-256 under the deployment's session secret, over the exact claim bytes, compared in constant time. Then the deployment's name, then the membership reference: a scope accepts a session only for the membership scope that it records itself. Then the scope's own clock against the end time, at every read and before every send on a stream. |
| Which clock | Two. Membership's clock wrote the end time, and each reading scope compares it with its own. A scope whose clock reads earlier than its previous entry's time answers `clock-behind` and sends nothing. |
| After a key is revoked or a member is removed | A session already issued is accepted until its end: at most 600 seconds on membership's clock, plus the difference between the two clocks. No new one is issued. Nothing recalls what was read. |
| A reader with no session | `forbidden`, from every read. |
| With no secret | The bindings `SESSION_SECRET`, at least 32 bytes, and `DEPLOYMENT`. With either missing, no session is issued and none is accepted: `sessions-unavailable`. No file of this repository holds a secret. |
| When the secret is replaced | Every session ends at once. |
| A stream | Its session is checked before every send. There is no timer: a stream whose session has ended is sent nothing, and is closed when its next send is due. A reader that goes away is released at once, by the route. |

A join at a membership scope is served through `limits.ts`: serving
limits by the caller's address, held in memory, which no guard reads and
which can never use up, expire or lock an invitation. The operator's
record of a scope, `operator.ts`, is storage outside the history: the
runtime writes an incident there, and no judgment reads it. An operator's
instruction to send a waiting request again is the object's `resend`,
which has no route.

## How to test

```
npm test --workspace @generalbusiness/artroom-scope
npm run typecheck --workspace @generalbusiness/artroom-scope
```

The tests run in the workerd test pool, against the real Durable Object
class and real SQLite storage. `test/worker.ts` binds two classes:
`TestScope`, which is `ScopeObject` with the test ports, and `ScopeObject`
as deployed. `test/support.ts` holds the one fixture: derive's fixture lane
with three small changes, founded as a directory. A restart is the pool's
`evictDurableObject`.

`test/net.ts` holds the fixture for several scopes: derive's desk and
ticket as real objects in a namespace of their own, `NET`, of the class
`NetScope`, which is `DeployedScope` with test ports. The dispatchers carry
every message. A test waits for them with `settle`, moves the shared clock,
and holds back or loses a send through `net`. The test Worker's default
export and its `NetService` entrypoint are the deployed routes over that
namespace.

Pure derivation is tested in the derive package and is not tested again
here.

Three files here hold what needs this package and another together, so
that neither of those imports the runtime in its source:

- `test/replay.test.ts`: histories that real scopes wrote are read through
  the Worker's read routes and replayed by
  `@generalbusiness/artroom-replay`.
- `test/client.test.ts`: a scope handle of
  `@generalbusiness/artroom-client` over the Worker's routes and over its
  service-binding entrypoint.
- `test/conformance.types.ts`: typechecked only. The entrypoint and the
  client's transport satisfy one interface, the contract's `ScopeApi`.
