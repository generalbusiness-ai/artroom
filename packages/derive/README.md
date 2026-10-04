# @generalbusiness/artroom-derive

Derivation for an Artroom scope: the definition validator, the state that
entries fold into, the fold, and the judges. Everything is a pure,
synchronous function. Nothing reads a clock, storage or a random source.

The scope runtime calls these inside one storage transaction. A verifier
calls the same functions over a state it folds in memory. So what the
runtime writes and what a verifier derives cannot drift apart.

The scope and replay contract is the authority. Comments cite its sections.
Where the contract was silent, `notes/2026-10-04-i1-contract-deltas.md`
records what was implemented.

## What it exports

| Module | Holds |
|---|---|
| `validate` | `validateDefinition(definition, bounds, profiles?)`: a `ValidDefinition` with its digest, timed types, hold types and the slots each range guard's `where` reads; or a list of problems. `PROFILES`. |
| `state` | `StateView` and `StateWriter`, the item record, and `MemoryState` with `snapshot()`. |
| `fold` | `applyEntry(writer, definition, entry, hash)`, the only code that changes state. `changeItem` and `newItem`, which the judges use on their working copy. `FoldError`. |
| `judge` | `judgeAct`, `judgeTimed`, and `entryOf`, which makes a draft the entry at a head and a reading. |
| `guards`, `effects`, `sends` | `judgeGuard`, `deriveEffects`, `deriveSends`, and the `Judging` value they read. |
| `timed` | `nextDue(view, definition, asOf)`: the next due transition in the contract's order. |
| `time` | `clockOf(view, reading)`: one commit's reading, whether it is behind, and the time at which a transition is due. `timeMs`, `timeOf`. |
| `attribution` | `attribution(item, signer)`. |
| `values` | `isValue` for each field type, `same`, `byteOrder`, and the reference shapes. |

## How a commit uses it

1. Read the clock once: `clockOf(view, reading)`.
2. `judgeAct(view, definition, signedIntent, context)`. The answer is one of:
   write this draft; refused, with a reason and the head judged at;
   unavailable; mismatch; accepted before, with the first entry's `seq`; or
   a transition is due, in which case nothing is written and the drain runs.
3. For a draft: `entryOf(view, draft, clock)`, hash the entry, then
   `applyEntry(writer, definition, entry, hash)`.

The drain selects with `nextDue` and commits with `judgeTimed`, which
writes only when the selection passes its three checks.

The judges of a genesis, a delivery, a diagnosis, an outcome and a checkpoint
are the next step. The fold already applies their entries.

## How to test

```
npm test --workspace @generalbusiness/artroom-derive
npm run typecheck --workspace @generalbusiness/artroom-derive
```

`test/fixtures.ts` holds the one fixture set: a key set, two small
definitions, and a scope in memory that judges, seals and folds as a commit
does. It is not exported from the package's entry.
