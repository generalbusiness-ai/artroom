# The ten terms

These ten terms are the word list for the dap documentation. Every other
page uses them with the meanings below. Each entry says what the term is
in the source and where it lives. Terms that belong to the room, such as
issue, change, review and land, are on the room's page
[The room's terms](../../apps/room/docs/room-terms.md).

## 1. Scope

A **scope** is an actor with its own record. It holds a history of
entries numbered from 0, the items those entries fold into, and one
pinned definition. Its ID is the digest of its seed, and a `ScopeRef`
adds the incarnation and the kind. Two scopes share no storage and no
transaction. The types are in
[scope.ts](../../packages/contract/src/scope.ts).

## 2. Definition

A **definition** is the data that a scope pins at genesis: its item
types, acts, handlers, timed rules and named rule expressions. It is a
JSON value of the type `DeclaredDefinition`, and it is identified by its
digest. `validateDefinition` in `dap-derive` checks it before a scope
pins it. A changed definition is a new definition with a new digest. The
forms are in [definition.ts](../../packages/contract/src/definition.ts).

## 3. Act

An **act** is an action that a definition declares. A participant signs
an intent for one act, on one scope, with its fields and the item
revision the signer expects. The scope judges it against the definition,
its state and what the signer is allowed to do. An act either takes
effect, and the scope writes an entry, or the scope refuses it and names
the reason. The intent is in
[intent.ts](../../packages/contract/src/intent.ts).

## 4. Entry

An **entry** records one input and what followed from it: its effects on
items, its sends, the foreign entries it read and the rules it
evaluated. Each entry names the hash of the one before it. An act that
takes effect returns a receipt that names its entry by scope, position
and hash. The entry and its eight kinds of input are in
[entry.ts](../../packages/contract/src/entry.ts).

## 5. Commitment

A **commitment** is a promise to do one piece of work. In the contract, a
`Commitment` names one exact operation that its issuer has promised to
complete ([scope.ts](../../packages/contract/src/scope.ts)). In a
definition, a commitment is an item that moves from `offered` to
`accepted` to `fulfilled`. The room's issue definition declares that
item, with a requester, an offeree and a performer, and with other final
states for a commitment that is declined, withdrawn or cancelled.

## 6. Hold

A **hold** is a time-limited claim, taken under one accepted commitment
by its performer. A hold item has a holder, a fixed reference `under` to
the commitment, an end time and an `epoch`. Only a `hold` effect opens,
renews or ends it. A timed rule ends it when its time passes, and it also
ends in the entry that takes its commitment to a final state. The
validator checks this shape, and the `hold@1` capability in
[hold.ts](../../packages/derive/src/capability/hold.ts) derives the
records of a hold's workspace.

## 7. Plan and concern

A **plan** is one way to split a goal into parts, and a **concern** is
one part of a plan. Both are items of the room's issue definition, in
[issue.ts](../../packages/lanes/src/issue.ts). A plan is `open` while
concerns are added, then `sealed` as the goal's current plan. Adding a
concern sends a `create` for a new lane under the same definition, and
the concern's state follows that request: `creating`, then `created`,
`refused` or `conflict`.

## 8. Rules

The **rules** scope holds a room's published configuration: which
reviews and checks each part of a repository needs, and which
definitions are active. Its revisions are recorded, and other scopes
observe a revision when they judge against it. A definition's own named
expressions, which a `rule` guard evaluates, are rule guards, not this
scope. The rules scope is in
[rules-scope.ts](../../packages/platform/src/rules-scope.ts).

## 9. Destination

The **destination** is the scope that judges publication to a Git host
and records the outcome. It reads the change's evidence, observes
membership and the rules, and writes outside-operation duties for the
host. For each publication it also writes a receipt commit. It is in
[destination.ts](../../packages/platform/src/destination.ts).

## 10. Replay

**Replay** checks a recorded history without the runtime. It folds the
entries from genesis with the same judges the runtime uses and compares
each result with the stored entry, byte for byte. Its report states the
head it reached, its coverage and what it took on trust. "Consistent"
holds for that coverage and those trusts. It is in
[packages/replay](../../packages/replay/README.md).

## Source and acceptance

Written against main `d309b6b9` from the types in `packages/contract`,
the judges and capability code in `packages/derive`, and the room's
definitions in `packages/lanes` and `packages/platform`. This page
claims no run. The earlier version of this page held the room's beginner
vocabulary. Its review history stays in
[the ledger](../../apps/room/docs/ledger.md).
