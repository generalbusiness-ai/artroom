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
| `ports` | `Clock`, `Random`, `Authority`, `Resolver`, `Rules`, `Alarm`, `Definitions`, `Readers`, and `production()`, their defaults. |
| `definitions` | `creates(declared)`: the digests a declaration names in its `create` sends. `namedBy(root, read, validate, limit)`: the declarations a scope retains for its children. |
| `turn` | `Turns.run(waiting, founding?)`: section 5.2, steps 3 to 7, and section 5.3. `isSigned` and `fetchFacts`: step 1. `Waiting`, `Verdict`, `End`. |
| `core` | `Scope`: `found`, `submit`, `settle`, `alarm`, `checkpoint`, `pinned`. `receiptOf`. The answers `Founded` and `Checkpointed`. |
| `reads` | `Reads`: `summary`, `items`, `history`, `entry`, `outbox`, and `duty`, one send's row. For a verifier: `log`, a history page as stored bytes, and `retained`, one retained input. `ReadBounds` and `READ_BOUNDS`. |
| `delivery` | `Deliveries.deliver(envelope)`: receiving. It reads the source entry through the resolver, checks it against the fact's hash, and runs derive's delivery judge, or its genesis judge for a `create` that reaches an empty store, in the scope's turn. It answers as transport does: `recorded` with a fact, `retry`, `routing` or `source-unverified`. |
| `outbox` | `Dispatcher.run()`: sending. One pass at a time over the sends that are due: a durable record before each dispatch and after its answer, a retry delay that doubles, and a `diagnosis` input through the turn when a request is given up. `Wakes`: one alarm for the earliest deadline and the next dispatch. |
| `namespace` | `namespace(binding)`: the production `Resolver`, `Transport` and `Definitions`, each one RPC call on the object a scope ID names. `routed`: the resolver of a name, which refuses a wrong address before any judgment. `sourced`: the answer to a read of one entry. `declaredBy`: the answer to a read of one retained declaration. |
| `object` | `ScopeObject`: the Durable Object class. It wires the store, the ports, the core, receiving, the dispatcher and the reads, and exposes them over RPC: `found`, `submit`, `settle`, `checkpoint`, the reads, `deliver`, `source`, `declared` and `dispatch`. Its `alarm()` runs the alarm's turn and then a dispatch pass. With no transport, which is its default, nothing is dispatched. |
| `worker` (its own entry, `@generalbusiness/artroom-scope/worker`) | `route(request, binding)`: the HTTP routes. `ScopeService`: the same operations over a service binding; it implements the contract's `ScopeApi`, which a client's transport also is. `DeployedScope`: the object class with the namespace as its resolver, its transport and its source of declarations. `api(binding)`: what both call. The default export is the deployed Worker. |

`@generalbusiness/artroom-scope/testing` is for tests only: a test
authority that calls every grant current, a test readers port, a scripted
clock, a gate that pauses preparation, a resolver over entries a test
supplies, and, for several scopes in one namespace, a transport that a test
can hold back or make lose an answer. The main entry and `worker.ts` do not import it.

## Ports and their production defaults

| Port | Asked for | Production default |
|---|---|---|
| `Clock` | One reading for each call. | The runtime's clock. |
| `Random` | The bytes of a new incarnation. | The runtime's random source. |
| `Authority` | Whether a presented grant is current, in the commit, on the commit's reading. | No grant is current. Every act is refused `unauthorized`. |
| `Resolver` | One foreign entry by fact reference, within the fetch time limit: the entry, `absent` when the object at that name does not hold it, or nothing when it cannot be read now. | Nothing can be read. An act that names a foreign entry is answered `dependency-unavailable`. `DeployedScope` supplies the namespace. |
| `Transport` | One dispatch of one send to the object its address names, answered or not. | None: the sends stay in the outbox. `DeployedScope` supplies the namespace. |
| `Rules` | The results of prepared rule inputs. | Derive's evaluator, `evaluateRules`. |
| `Alarm` | The next wake time. | In `production()`, nothing. `ScopeObject` supplies the object's own alarm. |
| `Definitions` | A declaration by digest or platform name, from the scope that retains it. | A platform name is `unsupported-definition`. A digest is unavailable. `DeployedScope` supplies the namespace, which reads a child's declaration from its creator. |
| `Readers` | Whether a reader may make a read. | Nobody may: every read is `forbidden`. |

So a deployed scope can be founded and can create children, and then
admits no act and answers no read. The authority note's rules and sessions
each replace one port.

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
| `folded` | Folded records that are not items: relationship copies, held creations, outside operations. |
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

An entry that admits duties (a genesis, an act, a delivered request or
advisory) is kept only if every admitted duty still has an entry to settle
in. Derive's `owed` counts those entries from the folded state, inside the
commit. An act that does not fit is refused `scope-full`. The deltas note,
section 15, lists what is counted and what is not.

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
   yet answers `retry`.

The source entry's bytes are retained with the entry that used them.

## Routes

`route` serves these, and `ScopeService` has one method for each. A body is
the contract's own answer.

| Route | Answer | Status |
|---|---|---|
| `POST /v1/scopes`, body `{ founding, definition, definitions? }` | `Founded` | 201 accepted; 422 refused; 503 unavailable |
| `POST /v1/scopes/:scope/acts`, body `{ signed, grants }` | `Answer` | 200 accepted; 403 refused `unauthorized`; 422 refused otherwise; 409 mismatch; 503 unavailable |
| `POST /v1/scopes/:scope/settle`, body `{ signed }` | `Settlement` | as a read |
| `GET /v1/scopes/:scope` | The summary | 200; 404 `not-found`; 403 `forbidden`; 409 `wrong-incarnation`, `scope-provisional`; 413 `too-large`; 501 `unsupported-definition`; 503 otherwise |
| `GET /v1/scopes/:scope/items/:type?cursor=` | A page of retained final items | as above |
| `GET /v1/scopes/:scope/history?cursor=` | A page of the history | as above |
| `GET /v1/scopes/:scope/entries/:seq` | One entry | as above |
| `GET /v1/scopes/:scope/outbox?cursor=` | A page of the outbox | as above |
| `GET /v1/scopes/:scope/outbox/:duty` | The outbox status of one send, by its duty ID | as above |
| `GET /v1/scopes/:scope/log?cursor=` | A page of the history as stored: each entry's canonical bytes and hash, for a verifier | as above |
| `GET /v1/scopes/:scope/retained/:kind/:digest` | One retained input: a `definition`, an `entry` or a `rule` input, by digest | as above; 413 past 1 MiB |

A body is at most 1 MiB of bytes, counted while it is read: a larger body
is cancelled and is not held. A body over that, or one that is not a JSON
object in UTF-8, is 400. A path that is not percent-encoded UTF-8 is 400.
A reader is the `Authorization` header, passed to the readers port as it
is.

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
