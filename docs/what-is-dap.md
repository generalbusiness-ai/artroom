# What is dap?

A durable action platform for people and agents.

dap is a framework for building collaborative applications for people and
agents. A scope is an actor that holds an ordered record and judges signed
acts against its definition, and an application is a set of definitions.
This page explains what the framework does, the actor model it is built
on, and the four applications built with it.

## A framework for shared work with a record

Collaborative work needs three things: rules about who may do what, a
record of what was done, and a way for someone else to check that record.
dap keeps the three apart.

An application states its rules as data, in **definitions**. dap supplies
the rest: a runtime that judges each request against those definitions,
a record that keeps every request that took effect, and a verifier that
derives the same judgments again from the record. The application writes
no judging code. The guarantee dap offers is the integrity of the record
and the consistency of the state: every entry is chained to the one before
it by hash, and the current state is exactly what the entries fold into.

The participants are people and agents alike. Each one signs requests
with a device key. A member's authority comes from a membership scope,
not from the client they use. A conversation that says "done" is useful
context. The recorded entry is the evidence.

## The actor model

dap is an event-sourced actor model. The actor is the **scope**.

A scope holds an ordered record of **entries**, numbered from 0, each
naming the hash of the one before. It pins one definition at its first
entry and keeps it for life. The definition names the scope's **item
types**, the **acts** a participant may sign, the guards each act must
meet, the effects it has on items, and the messages it sends.

A participant signs an **intent**: a request for one act on one scope,
with its fields, the item revision the signer expects, and a deadline.
The scope handles one input at a time. For each, it checks the signer's
authority, evaluates the act's guards on its current state, and then does
one of these:

- The act takes effect. The scope writes one entry, folds it into its
  items, and returns a **receipt** that names the entry by scope, position
  and hash.
- The scope refuses the act and names the reason and the head it judged
  at.
- The scope answers that it is unavailable. That answer confirms nothing,
  so the caller keeps the signed intent and checks the record before
  signing anything new.
- The scope answers `mismatch` when the same key already used the
  intent's idempotency key for a different intent.

The current state is the fold of the entries. Nothing else is state. So a
verifier that has the entries, the definition and the inputs the scope
retained can fold them again and compare the result with the record, entry
by entry.

Scopes share no storage and no transaction. They compose by messages. A
send is written in the same entry as the act that caused it, so a message
exists if and only if its entry does. The receiver reads the source entry,
checks its hash, and judges the delivery in its own turn, as it judges an
act. A scope can create other scopes this way: a room's directory creates
its membership, rules and destination scopes, and each of those keeps its
own record.

[The architecture of a dap application](architecture.md) follows these
parts in more detail, and [Scopes](scopes.md) describes the runtime in
full.

## Applications are sets of definitions

dap gives no verb a universal meaning. "Review", "merge", "join" and
"speak" are words that an application declares. An application is a set
of definitions, and the scopes that run them. Four applications are built
on dap.

**dap-room** brings a repository's work together. A room has a membership
scope, a rules scope, issue and change lanes, and a destination that
publishes to a Git host. A change proposes an exact version of the work.
Reviews and checks name the version they judge. The rules scope says
which reviews and checks count for which parts of the repository. When a
change meets them, the destination publishes it and records the outcome.
The Git-backed review flow is a feature of dap-room, not of dap. Its
pages are in [apps/room/docs](../apps/room/docs), starting with
[Join a room and publish one text change](../apps/room/docs/first-change.md).

**dap-counter** keeps a shared count. Participants join a board, commit
to say the next number, and speak it aloud. The scope checks every proposal:
the full roster, the arithmetic and whose turn it is. The source is in
[apps/counter](../apps/counter). The tutorial
[Build a counter](build-a-counter.md) builds a smaller version of its
definition.

**dap-library** is a lending library for kitchenware and tools. Each
thing is an item that is available, lent or gone. Members donate,
borrow and return things. Only staff remove a thing, with a reason in
their own words, and a thing that is gone stays in the record. The source
is in [examples/lending](../examples/lending). The tutorial
[Build a lending library](build-a-lending-library.md) writes its first
definition. Its current definition also publishes each thing's page to
the room's repository. The member interface is deployed in a rehearsal
room; publication is built and not yet run on a deployed room.

**dap-jam** lets musicians improvise together in a room. Its record holds
themes, interpretations, instrument claims and patterns, and a live layer
plays the patterns. It lives in its own
[repository](https://github.com/generalbusiness-ai/artroom-jam), with
its design in the [jam room note](../notes/2026-10-01-jam-room.md). The
jam's page is deployed. Recording its musical acts in native dap scopes
is later work.

The four show why application vocabulary belongs to the application. A
sketch that sounds good in the jam is a musical outcome, not a code
review. A spoken number in the Counter is a fact about a turn, not a
publication. A returned pot in the library is a change of state, not a
promise kept.

## How you take part today

There is no hosted sign-up. You enter a room in one of two ways:

- Open an invitation link that one of its members gave you. The client
  makes a new device key and joins with it.
- Load the configuration file and device key that the command line keeps
  for a member who has already joined.

[The dap command](cli.md) describes invitations and joining from the
command line. [The page](../apps/room/docs/page.md) describes both paths
in the room's browser page.

## Read the answer before the next step

- Keep a receipt. It locates the exact entry.
- Read a refusal at the head where it was judged. It names missing
  authority, an outdated revision or an unmet rule.
- Treat a lost reply as unresolved. Check the record with the original
  signed intent before you sign another.

## Source and acceptance

Written against main `d309b6b9`; the dap-library paragraph against main
`70729eac`. Sources:
[the entry and its inputs](../packages/contract/src/entry.ts),
[the four answers](../packages/contract/src/result.ts),
[the judges](../packages/derive/src/index.ts),
[the Counter definition](../apps/counter/definition.ts),
[the lending definition](../examples/lending/definition.ts), and
[the jam room design](../notes/2026-10-01-jam-room.md). This page claims
no run. Independent review and acceptance of this version are owed. The
[ledger](../apps/room/docs/ledger.md) keeps the review history of the
earlier version.
