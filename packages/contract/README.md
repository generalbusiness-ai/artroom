# @generalbusiness/artroom-contract

The types and constants that every Artroom package shares. It has no runtime
logic. The only values it exports are constant tables.

The scope and replay contract is the authority for every type here. Comments
cite its sections.

## What it exports

| Module | Holds |
|---|---|
| `scope` | Identifiers, the seed, the delivery cause, and the four reference classes: identity, fact, grant, commitment. |
| `intent` | The intent an actor signs, and the byte-domain tags (`DOMAINS`). |
| `entry` | An entry, its inputs, the message classes, sends, derived effects, and the views built after sealing: duty ID, envelope, receipt. `Reason` is what a refused delivery records: a code and, where one exists, a name. |
| `definition` | A declared definition, as revision 11 of the contract adopts it: its name, field and item types, acts, handlers, timed rules, rule expressions, and every operand, guard, effect, send and attention form. No form of the first delivery is left beside its adopted shape: each was removed when the source that read it moved. `ReceiveType` is the adopted form of a handler, and `AdoptedReceiveType` is another name for it. The types say what a definition may hold, not what a runtime derives: the validator of `derive` refuses every form it has no derivation for. |
| `platform` | The data of a platform definition, by revision 15 of the contract, which is adopted since this was written: `Mark`, `PlatformData`, and the forms of an act, a handler and an item type that may hold a mark. Types of platform data only: `DeclaredDefinition` does not change. |
| `observation` | `Observation`, `ObservationUse` and the request and answer of the read of membership, by section 16.1 of the contract. |
| `evidence` | The evidence of an outcome, by its basis: `own-answer`, `read` and `none`. Each holds a `body` that the owner of the effect types. |
| `capability` | What a capability version declares: its records, guards, effects and steps. `CAPABILITIES` restates the contract's tables for `hold@1` and `git-read@1` as data. It holds no rule. |
| `read` | Read results, cursors, settlement, and the page bounds. What the reads return: an item, a summary, a sealed entry, a duty of the outbox, a page of the stored log, and a retained input. |
| `transport` | `ScopeApi`: the operations of a scope service as one interface, which the service's entrypoint and a client's transport both satisfy. `Founded`, the answer to a founding. |
| `report` | The report a verifier writes. |
| `result` | The four answers to a submitted act, every refusal and unavailable reason the contract names, and the refusal reasons the derivation step adds. A refused act carries the code and, when the failed guard declares one, a name. |
| `bounds` | Every size and count limit as one `Bounds` value, with `PROPOSED_BOUNDS` as a temporary default: the values that revision 11 of the contract proposes. |

One type is still `unknown` here, because the authority note does not give
it a form: `Commitment.cancelBy`. A grant's `fresh` is an `ObservationUse`,
its `within` may be a `ScopeFilter`, which is `{ membership }`, and the
evidence of an outcome is typed by its basis, with a body that its owner
types.

The `Entry` type has no field for its own hash. An entry's hash, and any
reference to the entry, are built after it is sealed.

## How to test

```
npm run typecheck --workspace @generalbusiness/artroom-contract
```

The package has no runtime tests, because it has no runtime logic.
`test/shapes.ts` is typechecked: it writes the four entries of the contract's
section 7.2 and stops compiling if a type drifts.
