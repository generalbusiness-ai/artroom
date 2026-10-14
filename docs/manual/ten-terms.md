# The ten terms

These ten terms are the word list for the dap documentation. Every other
page uses them with the meanings below. Each entry says what the term is
and where it lives in the source. Terms that belong to the room, such as
issue, change, commitment, review and land, are on the room's page,
[The room's terms](../../apps/room/docs/room-terms.md).

## 1. Scope

A **scope** is an actor with its own record. It holds a journal of
entries, the items those entries fold into, and one pinned definition.
Two scopes share no storage and no transaction.

A scope's ID is the digest of its seed, so the ID is known before the
scope exists. When a scope writes its first entry it mints a random
**incarnation**, which tells one life of the scope from another. A
reference to a scope (`ScopeRef`) is the ID, the incarnation and the
kind together. The types are in
[scope.ts](../../packages/contract/src/scope.ts).

## 2. Definition

A **definition** is the data that a scope pins at genesis: its item
types, acts, handlers, timed rules and rule expressions. It is a JSON
value of the type `DeclaredDefinition`. Its **digest**, computed over its
canonical bytes, identifies it, and a scope **pins** that digest for
life. A changed definition is a new definition with a new digest.
`validateDefinition` in `dap-derive` checks a definition before a scope
pins it. The forms are in
[definition.ts](../../packages/contract/src/definition.ts).

The platform's own scopes, such as the directory and membership, have
definitions too. A **cohort** is the set of platform definition
versions that a room is created with, such as `application` or
`application-publication`. A room keeps its cohort's pins; a newer
cohort makes a new room.

## 3. Item

An **item** is one thing a scope holds, of a type that the definition
declares: a library's thing, a Counter's board, an issue's commitment.
An item has a state from its type's list, and slots: parties, which hold
members; references; and values. A final state is one that no act can
leave. Each change to an item raises its revision, and an act names the
revisions it expects.

## 4. Act and action

An **act** is something a definition declares that a participant can
sign, such as `donate` or `merge`. To sign one, a participant makes an
**intent**: the act's kind, the scope and incarnation, the item, its
fields, the revisions the signer expects, an idempotency key and a
deadline, signed with the participant's key. The intent is in
[intent.ts](../../packages/contract/src/intent.ts).

An **action** is a name that a role is granted, such as `lending.member`
or `rules.activate`. Each act's `grant` field names the action its
signer must hold. Membership gives each **role** a list of actions, and
each member a role. Being allowed an action does not replace an act's
guards.

## 5. Entry and journal

An **entry** records one input and what followed from it: its effects on
items, its sends, the foreign entries it read and the rule expressions it
evaluated. Each entry names the hash of the one before it. A scope's
**journal** is its entries in order, numbered from 0, starting with the
genesis entry. The entry and its eight kinds of input are in
[entry.ts](../../packages/contract/src/entry.ts).

The documentation says **record** loosely for everything a scope keeps,
and **history** only for a Git repository's history.

## 6. Takes effect, receipt and refusal

A scope judges each intent against its definition, its state and what
the signer is allowed to do. An act **takes effect** when the scope
writes its entry. The scope then returns a **receipt**, which names the
entry by scope, position and hash. If the act cannot take effect, the
scope **refuses** it, names the reason, and writes no entry for the refused
act. Due deadlines can take effect first, so the journal's head can still
advance before the refusal.

Tools and commands report these outcomes in their own words. The answer
`accepted`, from the command line and MCP, and the judgment `write`,
from the in-memory test scope, both mean the act took effect. Two other
answers say nothing about the outcome: `unavailable`, and a lost reply.
[The life of an act](life-of-an-act.md) says what to do after each.

## 7. Member and keys

A **member** is a person or an agent in a room's membership scope. The
member's **seat** is their member item there, which holds their handle
and role. A member signs with keys that membership has **enrolled** for
them:

- a **device key**, made on each device that joins;
- an **agent key**, enrolled for an agent by an agent-key invitation.

Three other keys have one job each. The **operator key** signs the
install of a register and is its one founder key. The founder's
**first key** is enrolled when the room is claimed. The **recovery key**,
named at the claim, is not a member's key. It can still invite and remove
members and revoke keys, so a room whose admins have lost their keys can
be recovered. Membership is in
[membership.ts](../../packages/platform/src/membership.ts).

## 8. Rules

Two things share the word. The **rules scope** holds a room's published
configuration: which reviews and checks each part of a repository
needs, and which definitions are active. Its revisions are recorded, and
other scopes observe a revision when they judge against it. It is in
[rules-scope.ts](../../packages/platform/src/rules-scope.ts).

A definition's **rule expressions** are named expressions, in a
restricted form of JSONata, that a `rule` guard evaluates. They belong
to one definition and are not the rules scope.

## 9. Destination

A **destination** is the scope that publishes to a room's Git
repository and records each outcome. It publishes a room's merged
changes, after it has judged their reviews and checks against the rules
scope. It also publishes the files that an application's acts send it
with `publish-file`, such as the lending library's shelf pages. Each
publication writes a receipt that names the entry that asked for it. It
is in [destination.ts](../../packages/platform/src/destination.ts).

## 10. Replay

**Replay** checks a recorded journal without the runtime. It folds the
entries from genesis with the same judges the runtime uses and compares
each result with the stored entry, byte for byte. Its report states the
head it reached, its coverage and what it took on trust. "Consistent"
holds for that coverage and those trusts. It is in
[packages/replay](../../packages/replay/README.md).

## Words used in one sense only

- **Step** is an act's form in a definition: `open`, `transition` or
  `comment`. Tutorial steps and the MCP tool `steps`, which lists a
  page of a scope's entries, are named as such where they appear.
- **Enroll** and **enrollment** are spelled the US way. `room.enrol` is
  the name of an MCP tool.

## Source and acceptance

Written against main `5e11ca03` from the types in `packages/contract`,
the judges in `packages/derive`, and the platform definitions in
`packages/platform`. This page claims no run. The earlier version of this
page also defined commitment, hold, plan and concern; they are now on
[The room's terms](../../apps/room/docs/room-terms.md). The review
history of earlier versions stays in
[the ledger](../../apps/room/docs/ledger.md).
