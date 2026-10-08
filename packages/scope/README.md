# @generalbusiness/artroom-scope

The runtime of an Artroom scope: its storage, the commit protocol, delivery
between scopes, the outbox dispatcher, its reads, and the Worker that routes
to it. The target runtime is Cloudflare Workers: one Durable Object with
SQLite storage for each scope, named by the scope's ID in one namespace.

The scope and replay contract is the authority. Comments cite its sections.
Where the contract was silent, `notes/2026-10-04-i1-contract-deltas.md`
records what was implemented, in its sections "The runtime", "Repairs to
the runtime", "Composition and transport" and "A child's definition".

`wrangler.jsonc` supplies the deployment configuration. A scope Worker is
deployed at <https://artroom-scope.inguz.workers.dev>; the API routes start
at `/v1/scopes`, and the root URL returns 404. A responding Worker alone
does not prove the live repository founding, publication, clone or
authenticated replay required by Demo gate 1.

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
| `signed-reads` | `checkSignedRead`: a read signed by a key with a recent local signed entry or a recent signed root of this scope's cause chain. `rootOf` follows at most four causes through verified source entries. The read covers summary, genesis, that key's signed and causally rooted entries, and their typed retained inputs. At a register, a recent local signer reads the whole history. It grants no stream. |
| `limits` | `JoinLimits`: the serving limits of a join at the front of a membership scope. `addressKey`, `isJoin`, `PROPOSED_LIMITS`. |
| `operator` | `OperatorRecord`: the operator's record of a scope, outside its history. `incidentsOf`, `waitingIn`, and `sendAgain`, the instruction to dispatch a waiting request once more. |
| `reads` | `Reads`: `summary`, `items`, `history`, `entry`, `outbox`, and `duty`, one send's row; `operations` and `operation`, the outside operations with their attempts and outcomes; `incidents`, a page of the operator's record, and `waiting`, the two lists of requests that wait. For a verifier: `log`, a history page as stored bytes, and `retained`, one retained input by kind and digest, with a domain for `value`. `ReadBounds` and `READ_BOUNDS`. |
| `delivery` | `Deliveries.deliver(envelope)`: receiving. It reads the source entry through the resolver, checks it against the fact's hash, and runs derive's delivery judge, or its genesis judge for a `create` that reaches an empty store, in the scope's turn. It answers as transport does: `recorded` with a fact, `retry`, `routing` or `source-unverified`. |
| `outbox` | `Dispatcher.run()`: sending. One pass at a time over the sends that are due: a durable record before each dispatch and after its answer, a retry delay that doubles, and a `diagnosis` input through the turn when a request is given up. `Wakes`: one alarm for the earliest deadline, the next dispatch and the next attempt of an outside operation. |
| `operations` | `Operations.run()`: the driver of outside effects, beside the dispatcher. An attempt is recorded by its entry, marked durably before its one request leaves, and never sent twice: one that is found marked with no outcome is recorded `unknown`. An answer becomes an `outcome` input through the turn. `Operations.answered()` takes an answer at any later time. `Outside` is the port, and `NO_OUTSIDE`, the default of `production()`, sends nothing. The driver matches owner-declared evidence values by domain, digest and canonical byte bound and retains them with the outcome entry. |
| `diag` | `diagnosis`, `report` and `redact`: one line of the log for a failure at a port that no entry and no answer describes. A diagnosis holds an event and a step, which are fixed words, and an error's name from a fixed list. It reads no message of a thrown value. `redact` replaces what has the syntax of a credential and cuts to a stated length: a second guard, and not a complete one. |
| `authority` | `observing(config)`: the authority port over reads of a membership scope. The read is made before the turn, is counted by run and number, and is kept only in memory: at most one observation for each key, and a revoked answer for the run. `Membership` is the port that reads a membership scope; further reads also reach the recorded rules scope. `repositoryAuthority(config)`: the authority of the deployed class. A membership scope judges its own acts on its own head, and every other scope reads the membership scope that it records, with `observing`. A scope that records none reads nothing. |
| `namespace` | `namespace(binding)`: the production `Resolver`, `Transport`, `Definitions` and `SentTexts`, each one RPC call on the object a scope ID names. `membershipIn(binding)`: observation reads of membership and rules scopes, which the objects answer as `observe`. `routed`: the resolver of a name, which refuses a wrong address before any judgment. `sourced`: the answer to a read of one entry. `declaredBy`: the answer to a read of one retained declaration. `sentText`: the answer to a read of one detached text that a send of this scope names. |
| `object` | `ScopeObject`: the Durable Object class. It wires the store, the ports, the core, receiving, the dispatcher and the reads, and exposes them over RPC: `found`, `submit`, `settle`, `checkpoint`, the reads, `deliver`, `source`, `declared`, `text`, `dispatch` and `effect`. Its `alarm()` runs the alarm's turn, then a dispatch pass, then a pass of the operations driver. With no transport, which is its default, nothing is dispatched. With the outside port of `production()`, which sends nothing, nothing is sent outside the service. |
| `worker` (its own entry, `@generalbusiness/artroom-scope/worker`) | `route(request, binding)`: the HTTP routes. `ScopeService`: the same operations over a service binding; it implements the contract's `ScopeApi`, which a client's transport also is. `DeployedScope`: the object class with the namespace as its resolver, its transport and its source of declarations, with `repositoryAuthority` as its authority and read sessions as its readers port. `api(binding)`: what both call. The default export is the deployed Worker. |

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
kind that a test does not run, such as a rules scope or a destination. A
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
| `Authority` | Two phases. `read`, before the turn: what the judgment of one act's signer needs, within the fetch time limit. `held`, a method of what was read, in the commit: each grant the act may be judged on, and whether it is current at the commit's reading. It is a function of the folded state, that reading and what was read. `sealed`, optional: the commit tells the port the entry that it wrote on that answer. | The read finds no grant, so none is current. Every act that needs one is refused `unauthorized`. `DeployedScope` supplies `repositoryAuthority`, which reads the membership scope that the scope records. With none recorded nothing is read, and an act that needs a grant is answered `authority-unavailable`. |
| `Resolver` | One foreign entry by fact reference, within the fetch time limit: the entry, `absent` when the object at that name does not hold it, or nothing when it cannot be read now. | Nothing can be read. An act that names a foreign entry is answered `dependency-unavailable`. `DeployedScope` supplies the namespace. |
| `Transport` | One dispatch of one send to the object its address names, answered or not. | None: the sends stay in the outbox. `DeployedScope` supplies the namespace. |
| `Rules` | The results of prepared rule inputs. | Derive's evaluator, `evaluateRules`. |
| `Alarm` | The next wake time. | In `production()`, nothing. `ScopeObject` supplies the object's own alarm. |
| `Definitions` | `read`: a declaration by digest, from the scope that retains it. `platform`: a platform definition by name and version, with the rows of each entry that are code and the rules written for them. | `read`: a digest is unavailable. `DeployedScope` supplies the namespace, which reads a child's declaration from its creator. `platform`: the platform package's definitions. A name it does not hold is `unsupported-definition`. |
| `SentTexts` | A detached text that a delivered message names by digest, from the scope that sent the message. | Unavailable: a delivery that names one is not decided. `DeployedScope` supplies the namespace, which reads the text from the sender. |
| `Readers` | Whether a reader may make a read, by the read's name. `operations` and `operation` are asked as `operations`. It answers yes, no, or one of two names for a session that could not be judged: `sessions-unavailable` and `clock-behind`. | Nobody may: every read is `forbidden`. The deployed class uses read sessions: "Read sessions", below. |
| `capabilities` | The rules of the capability forms this runtime has code for: the records, guards and effects of `hold@1`, and `git-read@1`. Each rule is a pure function of its arguments, the folded state and the input being judged. | `CAPABILITY_CODE`: derive's code of `hold@1` and `git-read@1`, with the floor of 2 tokens for one hold and no retention of a root. A runtime with none does not found or create a scope under a definition that needs one: `unsupported-definition`. The item form of `hold@1`, with its `hold` effect, needs none and runs. |
| `outside` | One request of one attempt of an outside operation, and its answer. | `NO_OUTSIDE`: nothing is sent. Each attempt stays recorded and not sent. |
| `owners` | The rules of the owners of outside operations that this runtime has code for, by owner and kind: derive's `Owners`. | `CAPABILITY_CODE`: the rules of the operations that `hold@1` and `git-read@1` own. Platform rules can open operations; the default `outside` port sends none, so their attempts stay recorded and not sent. |
| `diagnoses` | Where a diagnosis goes. | `toConsole`: one JSON line in the runtime's log. |

So a scope with only these defaults can be founded, and then admits no
act and answers no read. The deployed class, `DeployedScope`, supplies the
namespace where the table says so, and replaces two more: its authority
reads the membership scope that a scope records, and its readers port is
read sessions. Signed reads provide the limited access before a session
described below. Explicit GitHub configuration also replaces the outside
port, with host authority pinned to one register and its derived
destinations.

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
- Under a definition whose data states rows of `observes`, the same port
  reads the further observations of an act, of an outcome and of a
  delivery of a result (`Authority.further`). Before the turn the scope
  runs the judge's own derivation of the subject list at its head, and
  reads one observation for each subject, each with the next number of
  the run. The commit derives the list again. Where it lacks a subject it
  stops, the scope reads what is missing, and the turn starts again,
  inside the bound on restarts (`Observes`, in `core.ts`). A value that an
  answer names is kept only in a domain that the row states, within its
  `max`. The destination's `judge`, the task result clause, and membership
  acts state their rows. The rules scope answers from its recorded rules,
  with the last publication revision and the digest of its extents; the
  namespace supplies those retained bytes beside the observation.

The production default does not use it: the `authority` of `production()`
reads no grant, and every act that needs one is refused `unauthorized`.
The deployed class, `DeployedScope`, uses it, in `repositoryAuthority`: a
membership scope answers the read (`observe`), and a scope whose genesis
records a membership scope, such as an inbox, is judged on it. A rules
scope and a destination hold membership's scope ID as a fixed value, and
no incarnation at first. The authority's first read there asks by the ID
alone. Guard 1 takes an answer of that ID and of the kind `membership`,
and the entry that retains it fixes the incarnation. From then on the
read states the incarnation, and the recorded reference is checked again
inside the commit (I3 deltas, section 26, entries EM21 and EY7 to EY9).
Before a retained membership observation, a rules scope or destination may
resolve its session reference from the confirmed full membership reference
in its recorded birth directory, after local token, clock and read checks
(`repositorySessionMembership`, in `authority.ts`). Rules additionally checks
that the directory confirms its exact rules reference. This writes no entry
and does not fix grant authority; token or directory incarnation mismatches
remain forbidden. A scope whose entries retain more than one
incarnation of that ID records no reference, and an act there that needs a
grant is answered
`authority-unavailable` (entry EY9).

`platform:destination@1` now has a rule for every mark, including
`first-head` and `receipt`.
[test/founding-real.test.ts](test/founding-real.test.ts) creates and
confirms a destination under the deployed class, reads real rules and
membership observations, and publishes its first change with a required
passed check. The Git host and source lane entries are scripted, and no
checker runner runs. Under the default outside port nothing is sent to a
host. This witness uses test scopes and establishes no deployed run; it
does not close full I3.

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
  `platform:directory@1`, with a rule for every mark of each
  (`notes/2026-10-05-i3-contract-deltas.md`, section 26). A founding
  under `platform:register@1` founds a register, by an `install` intent.
  Its selecting outcome creates the directory, whose genesis creates
  membership, the rules scope and the destination. Every destination mark
  has a rule, including `first-head` and `receipt`. The real-scope founding
  witness uses a scripted Git host; no production host is exercised. The
  production outside port sends nothing, so under its default wiring no
  repository is created at a host and a claim stays `pending`.
- A directory under `platform:directory@1` records its membership
  reference in its slot `repository.membership`. The production authority
  reads it there, from the scope's own folded state. A rules scope and a
  destination hold membership's scope ID, and the incarnation of the
  observations of it that their entries retain: before the first, the
  authority asks by the ID alone.

A founding under `platform:register@1` makes a scope of the kind
`register`, by an `install` intent: the scope's `found` and the Worker
build the seed's kind from the definition that is named. A founding under
any other definition makes a directory with no creator, by a `found`
intent. That earlier founding stays until a repository's founding by its
register is whole.

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
| `retained_input` | What an entry names by digest and does not carry: the definition's declaration, the bytes of each foreign entry in a `uses`, and the input of each rule evaluation. A delivered message and a rule's result are inside their entry. Outcome evidence carries its body; a value that the body names by digest is in `retained_value`. |
| `item_key` | The indexes that an item type of platform data declares (the contract's revision 23, section 17.2a): one row for each indexed slot of each item, written with the item by the entry that opens it. `StateView.lookup` reads it, after it has read that the index holds a row for every item of the type. The destination declares the publication's `operation` index, used to bind `withdraw` to its holder. |
| `retained_value` | Each value named by an intent place, an observation or an owner's outcome evidence, by domain and digest. It is written with the entry; RPC and HTTP retained reads serve it by domain and digest under the same reader authority and byte bound. |

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
note, sections 15 and 22, lists what is counted and what is not. Branches
and publications hold reservations; the latter also holds the decision
count for `withdraw`. Settling entries draw on those accounts, including a
bound request that is refused. This admission checks entries. Full
admission for items, records, retained bytes and pending requests remains
request `cc570904`; the five-dimensional amounts alone do not prove it.

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
| `POST /v1/scopes/:scope/acts`, body `{ signed, grants, texts?, presented?, values? }`. `texts`: each detached text that a field of the intent names by digest. `presented`: the facts presented beside the intent, by name. `values`: each value that a place of the act names by digest, as its canonical bytes; only an act of a platform definition whose data states a place has one. The rules scope states a place for check configuration | `Answer` | 200 accepted; 403 refused `unauthorized`; 422 refused otherwise; 409 mismatch; 503 unavailable |
| `POST /v1/scopes/:scope/preparations`, body `{ signed, grants, capability, step }`. One step of a capability, asked for with the signed intent that it prepares for. With no code for the step, as in production, nothing is judged: 503 `unavailable` | `Answer` | as an act |
| `POST /v1/scopes/:scope/settle`, body `{ signed }` | `Settlement` | as a read |
| `GET /v1/scopes/:scope` | The summary | 200; 404 `not-found`; 403 `forbidden`; 409 `wrong-incarnation`, `scope-provisional`; 413 `too-large`; 501 `unsupported-definition`; 503 otherwise |
| `GET /v1/scopes/:scope/items/:type?cursor=` | A page of retained final items | as above |
| `GET /v1/scopes/:scope/history?cursor=` | A page of the history | as above |
| `GET /v1/scopes/:scope/entries/:seq` | One entry | as above |
| `GET /v1/scopes/:scope/outbox?cursor=` | A page of the outbox | as above |
| `GET /v1/scopes/:scope/outbox/:duty` | The outbox status of one send, by its duty ID | as above |
| `GET /v1/scopes/:scope/log?cursor=` | A page of the history as stored: each entry's canonical bytes and hash, for a verifier | as above |
| `GET /v1/scopes/:scope/retained/:kind/:digest` | One retained input: a `definition`, an `entry`, a `rule` input, a detached `text` or a `snapshot` of staged refs, by digest. A text that was redacted is `not-found`. For `value`, `?domain=<encoded domain>` is required; another or missing domain is `not-found` | as above; 413 past `ReadBounds.retainedBytes` |

A body is at most 1 MiB of bytes, counted while it is read: a larger body
is cancelled and is not held. A body over that, or one that is not a JSON
object in UTF-8, is 400. A path that is not percent-encoded UTF-8 is 400.
A reader is the `Authorization` header, passed to the readers port as it
is. A read session is presented as `Session <token>`.

Five more routes serve what is no history:

| Route | Answer | Status |
|---|---|---|
| `POST /v1/scopes/:scope/sessions`, body a signed session request `{ request, sig }` | `SessionAnswer`: the token and what it names, or a reason. Marked `cache-control: no-store` | 200; 400 `bad-request`; 403 `unauthorized`; 404 `not-found`; 409 `replayed`; 422 `misaddressed`, `expired`; 429 `rate-limited`; 503 `sessions-unavailable`, `clock-behind` |
| `GET /v1/scopes/:scope/stream` | Lines of JSON, `{ at }`: the scope's head when the stream opens and after each commit | 200; as a read otherwise |
| `GET /v1/scopes/:scope/incidents?cursor=` | A page of the operator's record of the scope, for an admin's session | as a read |
| `GET /v1/scopes/:scope/waiting/:list?cursor=` | One page of the list `diagnosed` or `unanswered` of the requests that wait, for an admin's session | as a read |
| `GET /v1/scopes/:destination/credential/:handle` | A member's read token, `{ token, ends, remote }`, once: only to the session of the key that signed the `read-token` act whose `mint-read` outcome names that handle, and only before its end. The plaintext leaves custody as it is answered. Marked `cache-control: no-store` | 200; 403 `forbidden` for a second read, another key's session, no session, a read at or after the end, or a handle that names nothing; 503 `sessions-unavailable`, `clock-behind` |

A request whose URL holds a credential, in its path or its query, is
answered 400 `credential-in-url` before anything is routed. A read with a
session adds two answers: 503 `sessions-unavailable` and 503
`clock-behind`.

## Read sessions

A read session is a credential: whoever holds the token reads. It signs
nothing and controls nothing (authority note, section 3.9). The one other
credential it reads is a read token that its own key asked for by a
signed `read-token` act at the destination, once (the planner's decision
for I5).

| Question | Answer |
|---|---|
| What it binds | The deployment's name; the membership scope with its incarnation, which is the repository; the member and the device key; the reads of the member's role when it was issued; and an end time at most 600 seconds later, written from membership's clock. |
| How it is issued | A device signs a session request with its own key, to the membership scope. Membership answers from its head: only an active key of an active member gets one. It writes no entry. A request is answered with a session once: membership notes the key and the request's operation identity, outside its history, until the request's `notAfter`. |
| How it is verified | By HMAC-SHA-256 under the deployment's session secret, over the exact claim bytes, compared in constant time. Then the deployment's name, then the membership reference: a scope accepts a session only for the membership scope that it records itself. Then the scope's own clock against the end time, at every read and before every send on a stream. |
| Which clock | Two. Membership's clock wrote the end time, and each reading scope compares it with its own. A scope whose clock reads earlier than its previous entry's time answers `clock-behind` and sends nothing. |
| After a key is revoked or a member is removed | A session already issued is accepted until its end: at most 600 seconds on membership's clock, plus the difference between the two clocks. No new one is issued. Nothing recalls what was read. |
| A reader with no session | `forbidden`, from every read, unless it presents a signed read: "Signed reads", below. |
| With no secret | The bindings `SESSION_SECRET`, at least 32 bytes, and `DEPLOYMENT`. With either missing, no session is issued and none is accepted: `sessions-unavailable`. No file of this repository holds a secret. |
| When the secret is replaced | Every session ends at once. |
| A stream | Its session is checked before every send. There is no timer: a stream whose session has ended is sent nothing, and is closed when its next send is due. A reader that goes away is released at once, by the route. |

## Signed reads

A reader with no session may present a signed read instead
(`signed-reads.ts`; the planner's decisions 61cc5e50, c6499e91,
70a0680e and ca8ad1cf). It is how a key learns enough to ask for a session: the operator
key that signed `install` reads the register, and the key that signed a claim's `found`
reads the register's summary and the genesis and summary of its directory
and the membership, rules and destination scopes that directory creates.
It learns membership's reference before it holds a session.

| Question | Answer |
|---|---|
| The request | `Authorization: Signed <base64url>`: the unpadded base64url of the canonical JSON of `{ request, sig }`. `request` is `{ v: 1, to, actor, read, arg, notAfter }`: the scope ID, the key, the read (`summary`, `history`, `entry`, `log` or `retained`), its argument (`"summary"`; a page's cursor, `"0"` for the first; an entry's position; `retainedReadArgument(kind, digest, domain)`, the resource hash over the exact kind, digest and domain) and a time. |
| The signature | Ed25519 by `actor`, as an intent is signed, over the tag `artroom-read-1`, a newline and the canonical JSON of `request`. |
| The window | The scope's `intentLifetimeSeconds`, 900 by default, on the scope's own clock: the reading is before `notAfter`, and `notAfter` is at most that far ahead. |
| Who may read | Summary needs a recent local signer or recent genesis-root signer. An entry may instead qualify by its own causal root; history and log require at least one eligible root before revealing the head. Local signers are the actors of acts, preparations and applied founding intents. A child genesis has no signer of its own. |
| The cause chain | Starting at each entry, follow at most four causes through entries verified against their fact references. A child genesis follows its creation cause; an outcome follows the local entry that opened its operation; a diagnosis follows the local entry that made its send; a delivery follows its retained source entry. An outcome or diagnosis of another scope ends the chain. The directory's claim is the root for its membership, rules and destination children. The window is measured at the signed root entry's time. |
| What it reads | The summary, genesis, the key's own entries and entries whose causal root the key signed within the window; `retained` serves the actual typed inputs carried by eligible entries, never a digest merely quoted in text. History and log pages keep the `next` and `complete` of the unfiltered page. At a register, a recent local signer reads every history entry and its typed retained inputs. |
| Every other case | `forbidden`, and nothing is written: another read, another argument, another scope, a key with no eligible local or causal signed root, a signature that is not the key's, a time outside the window. A clock behind the previous entry's time: `clock-behind`. No stream. |

The object finds the roots of eligible entries before a signed read and
keeps them in memory; a restart finds them again. An unavailable source
can be read again on a later request. The root does not extend the window or turn the other
entries in the chain into the key's own signed entries.

A session issued by membership created under a register claim may read
that register's whole history and its typed retained inputs, without the
signed-entry window (ca8ad1cf). This grants no register summary or items
permission. Other signed histories remain filtered; their coverage alone
does not establish complete replay of omitted entries. Missing retained
inputs or an unreadable source history can make replay incomplete or report
a missing dependency. Whole register history does not grant access to
another directory's private history, and a fixture replay establishes no
deployed repository journey.

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
class and real SQLite storage. `test/worker.ts` binds four object classes, each in a namespace of its own:
`TestScope`, which is `ScopeObject` with the test ports; `ScopeObject`
with every production default; and `NetScope` and `PlatformScope`, which
are `DeployedScope` with test ports and are described below and in the
file's header. `test/support.ts` holds the one fixture: derive's fixture lane
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

These files keep checks that need this package and another together here,
so neither of those imports the runtime in its source:

- `test/replay.test.ts`: histories that real scopes wrote are read through
  the Worker's read routes and replayed by
  `@generalbusiness/artroom-replay`.
- `test/client.test.ts`: a scope handle of
  `@generalbusiness/artroom-client` over the Worker's routes and over its
  service-binding entrypoint.
- `test/conformance.types.ts`: typechecked only. The entrypoint and the
  client's transport satisfy one interface, the contract's `ScopeApi`.

`test/founding-real.test.ts` also creates and confirms the directory's
membership, rules and destination children under the deployed class. The
destination reads real rules and membership observations and retained
source entries, reserves the first publication, publishes it and writes
its receipt. The test reads its holder and decision counts from SQLite
and replays all five runtime histories over HTTP with proven grants. The
Git host is a scripted port, and the source change lane's manifest, check
opening, check decision and merge entries are scripted and anchored;
the updates to that lane remain
pending. Readers are the test readers except for a separate real session
witness. This is no deployment or production-host check, and does not
close full I3.
