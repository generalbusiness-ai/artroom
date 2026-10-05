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
| `definition` | A declared definition, as revision 11 of the contract adopts it: its name, field and item types, acts, handlers, timed rules, rule expressions, and every operand, guard, effect, send and attention form. A form marked "landed form" is one the first delivery built before the contract gave it its adopted shape; it is removed when the source that reads it moves. The types say what a definition may hold, not what a runtime derives: the validator of `derive` refuses every form it has no derivation for. |
| `capability` | What a capability version declares: its records, guards, effects and steps. `CAPABILITIES` restates the contract's tables for `hold@1` and `git-read@1` as data. It holds no rule. |
| `read` | Read results, cursors, settlement, and the page bounds. What the reads return: an item, a summary, a sealed entry, a duty of the outbox, a page of the stored log, and a retained input. |
| `transport` | `ScopeApi`: the operations of a scope service as one interface, which the service's entrypoint and a client's transport both satisfy. `Founded`, the answer to a founding. |
| `report` | The report a verifier writes. |
| `result` | The four answers to a submitted act, every refusal and unavailable reason the contract names, and the refusal reasons the derivation step adds. |
| `bounds` | Every size and count limit as one `Bounds` value, with `PROPOSED_BOUNDS` as a temporary default: the values that revision 11 of the contract proposes. |

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
