# @generalbusiness/artroom-contract

The types and constants that every Artroom package shares. It has no runtime
logic. The only values it exports are constant tables.

The scope and replay contract is the authority for every type here. Comments
cite its sections.

## What it exports

| Module | Holds |
|---|---|
| `scope` | Identifiers, the seed, the delivery cause, and the four reference classes: identity, fact, grant, commitment. |
| `intent` | The intent an actor signs, and the six byte-domain tags (`DOMAINS`). |
| `entry` | An entry, its inputs, the message classes, sends, derived effects, and the views built after sealing: duty ID, envelope, receipt. |
| `definition` | A declared definition: field and item types, acts, handlers, and every guard, effect, send and attention form. |
| `read` | Read results, cursors, settlement, and the page bounds. |
| `report` | The report a verifier writes. |
| `result` | The four answers to a submitted act, and every refusal and unavailable reason the contract names. |
| `bounds` | Every size and count limit as one `Bounds` value, with `PROPOSED_BOUNDS` as a temporary default. |

Some types belong to the authority note, which is not written yet. They are
`unknown` here and say so: `FreshnessProof`, `ScopeFilter`,
`Commitment.cancelBy`, and the `evidence` of an outcome.

The `Entry` type has no field for its own hash. An entry's hash, and any
reference to the entry, are built after it is sealed.

## How to test

```
npm run typecheck --workspace @generalbusiness/artroom-contract
```

The package has no runtime tests, because it has no runtime logic.
`test/shapes.ts` is typechecked: it writes the four entries of the contract's
section 7.2 and stops compiling if a type drifts.
