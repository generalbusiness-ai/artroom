# @generalbusiness/artroom-scope

The runtime of one Artroom scope: its storage, the commit protocol, the
outbox table and its reads. The target runtime is Cloudflare Workers: one
Durable Object with SQLite storage for each scope, named by the scope's ID.

The scope and replay contract is the authority. Comments cite its sections.
Where the contract was silent, `notes/2026-10-04-i1-contract-deltas.md`
records what was implemented, in its section "The runtime".

This step is one scope by itself. Transport between scopes, the outbox
dispatcher and HTTP routes are the next step. Each has a port or a table
waiting for it, and nothing here guesses at them.

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
| `turn` | `Turns.run(waiting, founding?)`: section 5.2, steps 3 to 7, and section 5.3. `isSigned` and `fetchFacts`: step 1. `Waiting`, `Verdict`, `End`. |
| `core` | `Scope`: `found`, `submit`, `settle`, `alarm`, `checkpoint`, `pinned`. `receiptOf`. The answers `Founded` and `Checkpointed`. |
| `reads` | `Reads`: `summary`, `items`, `history`, `entry`, `outbox`. `ReadBounds` and `READ_BOUNDS`. |
| `object` | `ScopeObject`: the Durable Object class. It wires the store, the ports, the core and the reads, exposes their methods over RPC, and runs an alarm's turn from `alarm()`. It has no HTTP route. |

`@generalbusiness/artroom-scope/testing` is for tests only: a test
authority that calls every grant current, a test readers port, a scripted
clock, a gate that pauses preparation, and a resolver over entries a test
supplies. The main entry does not export it and `object.ts` does not import
it.

## Ports and their production defaults

| Port | Asked for | Production default |
|---|---|---|
| `Clock` | One reading for each call. | The runtime's clock. |
| `Random` | The bytes of a new incarnation. | The runtime's random source. |
| `Authority` | Whether a presented grant is current, in the commit, on the commit's reading. | No grant is current. Every act is refused `unauthorized`. |
| `Resolver` | One foreign entry by fact reference, within the fetch time limit. | Nothing can be read. An act that names a foreign entry is answered `dependency-unavailable`. |
| `Rules` | The results of prepared rule inputs. | Derive's evaluator, `evaluateRules`. |
| `Alarm` | The next wake time. | In `production()`, nothing. `ScopeObject` supplies the object's own alarm. |
| `Definitions` | A declaration by digest or platform name. | A platform name is `unsupported-definition`. A digest is unavailable. |
| `Readers` | Whether a reader may make a read. | Nobody may: every read is `forbidden`. |

So an object deployed with no port replaced can be founded, and then admits
no act and answers no read. The authority note's rules, transport and
sessions each replace one port.

## Storage

One scope has these tables. Every value is canonical JSON in a TEXT column,
whose stored bytes are the canonical bytes.

| Table | Holds |
|---|---|
| `meta` | The scope's record: its reference, status, head and last entry time. |
| `entry` | The history: `seq`, hash, time, canonical bytes and their size. An act entry also has its actor, idempotency key and intent digest: the idempotency index is an index over the history. |
| `item`, `item_count` | The items, and the exact number in each type and state. The index on type, state and ID answers a page from a cursor, so a page costs the rows it returns. |
| `item_slot` | For each slot that a range guard's `where` reads, as `validateDefinition` derived them: the slot's value in each item, indexed by value. It is kept and not yet read, because `StateView.page` takes no `where`. |
| `outbox` | One row for each send: `seq`, ordinal, target, class, message, the held flag, the attempt log, and for a request its result or diagnosis. |
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
budget, its reserve and the alarm's retry delay are temporary values there.

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

Pure derivation is tested in the derive package and is not tested again
here.
