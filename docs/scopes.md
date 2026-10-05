# Scopes

This guide describes what the scope substrate delivers: the eight packages
under `packages/` that hold the substrate, the platform definitions and the
Git code. A ninth package, `lanes`, holds the two lane
definitions as data, and [lanes.md](lanes.md) describes it. This guide is
for a technical reader who has not read the design notes. It says what a scope is, how a change to one takes effect,
how scopes work together, how a history is checked, and what is not built
yet.

The scope and replay contract is the authority for the design. Where the
contract was silent, `notes/2026-10-04-i1-contract-deltas.md` and
`notes/2026-10-05-i2-contract-deltas.md` record what was implemented and
why. Nothing in either note is adopted by being built.

## The packages

| Package | Holds | Imports |
|---|---|---|
| `@generalbusiness/artroom-contract` | Types and constant tables. No logic. | Nothing |
| `@generalbusiness/artroom-bytes` | Canonical JSON, SHA-256, encodings, Ed25519, the seven byte domains, and the guard of each identifier. | contract |
| `@generalbusiness/artroom-derive` | The definition validator, the fold, the judges and the rule evaluator. Pure functions. | contract, bytes |
| `@generalbusiness/artroom-platform` | The platform definitions as data, with the rules that no form can say. Today: six, listed under what is built below. | contract, bytes, derive |
| `@generalbusiness/artroom-git` | Everything that touches a Git repository or a Git host: the object reader, the commands, the outcome of a push, and the gateway. It is not part of a scope's commit and no other package imports it. | contract, bytes |
| `@generalbusiness/artroom-scope` | The runtime of a scope on a Cloudflare Durable Object with SQLite storage, and the Worker's routes. | contract, bytes, derive, platform |
| `@generalbusiness/artroom-replay` | An independent check of a history, its report, and the command `artroom-replay`. | contract, bytes, derive |
| `@generalbusiness/artroom-client` | Building and signing an intent, and a typed handle on one scope. | contract, bytes |

Each package's `README.md` lists its modules. The runtime and the verifier
share `derive` and nothing else. The client shares neither. None of the eight
imports the lanes package.

## What a scope is

A scope is one small, independent record with its own rules. It holds:

- a **history**: a list of entries, numbered from 0, each naming the hash
  of the one before it;
- **items**: the things the history is about, each with a type, a state
  and some slots;
- one **definition**: the rules that say which changes are allowed.

Nothing else is state. Items are what the entries fold into. Two scopes
share no storage and no transaction.

A scope has a **kind**, which is one of `directory`, `membership`, `rules`,
`destination`, `inbox`, `task` and `lane`. The substrate treats every kind
alike. Only a directory can be founded by a person; every other scope is
created by another scope.

## Identity and incarnation

A scope's ID is the digest of its **seed**. The seed (`Seed`) says the
scope's kind, its definition, the scope that created it, the one input
that caused it, and an ordinal. So the ID is known before the scope
exists, and two requests to create the same scope name the same scope.

An ID does not say which life of the scope is meant. When a scope writes
its first entry it mints a random **incarnation**. A reference to a scope
(`ScopeRef`) is the ID, the incarnation and the kind together. A message
or an act addressed to another incarnation is refused.

There are four kinds of reference, and each says one thing:

| Reference | Type | Says |
|---|---|---|
| Identity | `ScopeRef` | This scope, this incarnation. Nothing about its state. |
| Fact | `FactRef` | One sealed entry: the scope, the position `seq` and the entry's hash. |
| Grant | `Grant` | Permission that a fact in an authority scope issued. |
| Commitment | `Commitment` | One operation its issuer has promised to complete. |

A position, `seq`, means something only inside its own scope. Across
scopes an entry is always named by a whole fact reference.

Every digest and signature is over a domain tag, a newline and the
canonical JSON of one value. The seven tags are in `DOMAINS`. The seventh,
`artroom-text-1`, is for the digest that names a detached text. No value
contains its own digest: an entry has no field for its own hash.

`@generalbusiness/artroom-bytes` has the one implementation of each:
`canonicalize` and `parseStrict`; `scopeIdOf`, `entryHash`, `intentDigest`,
`definitionDigest`, `textDigest` and the other digests; `signIntent` and `verifySignedIntent`; and the
guards `isDigest`, `isScopeId`, `isIncarnation`, `isKeyId`, `isMemberId`,
`isDutyId`, `isOperationId`, `isPlatformDefinition` and `isScopeKind`.

## Entries

An entry (`Entry`) records exactly one input and what followed from it:

| Field | Holds |
|---|---|
| `at`, `seq`, `prev` | The scope, the position, and the hash of the entry before. |
| `time`, `clamped` | The commit's clock reading, and whether the clock was behind. |
| `input` | The one input. |
| `uses` | Each entry of another scope that was read to judge the input, by fact and content digest. |
| `prepared` | Each rule that was evaluated: its name, the digest of its input, and its result. |
| `effects` | The changes to items, derived from the input. |
| `sends` | The messages to other scopes, derived from the input. |

There are seven inputs:

| Input | What it is |
|---|---|
| `genesis` | The first entry. It records the seed, the kind of its genesis act, and a founding intent or a creation request. |
| `act` | An intent that an actor signed, with the grant it was judged under and the facts that were presented beside it. |
| `delivery` | A message from another scope. |
| `timed` | A deadline that an item held and that has passed. |
| `diagnosis` | The scope's finding that a request it sent could not be delivered. |
| `outcome` | The result of an attempt to write outside the service. A preparation entry opens such an operation under a capability's code. The production runtime has no such code, so it opens none. |
| `checkpoint` | The digest of the whole folded state through a position. |

## Acts and the four answers

An actor changes a scope by signing an **intent** (`Intent`). The intent
names the scope, the act's kind, the item it is on, the revision it
expects that item to have, its fields, an idempotency key and a time,
`notAfter`, after which it is no longer admissible.

A scope answers a submitted intent in one of four ways (`Answer`):

| Answer | Means | What the caller does |
|---|---|---|
| `accepted` | The act is an entry. The answer carries a receipt. | Keep the receipt. |
| `refused` | The act was judged and is not allowed. Nothing was written. The answer names a reason and the head it was judged at. When the guard that failed declares a `reason`, the answer also carries it, as `name`. | Read the reason and the name. A refusal is a statement about that head only. |
| `unavailable` | The act was not judged. | Submit the same signed intent again. |
| `mismatch` | The same actor and key are on an entry with another intent. | Sign a new intent with a new key. |

A **receipt** (`Receipt`) holds the fact of the entry, the effects it
derived, and a duty ID for each message it sent.

The idempotency key belongs to the first intent that was accepted under
it, for the life of the scope. Sending the same signed intent again, at
any time, returns the same receipt and writes nothing. That is how a
caller recovers from a lost reply.

## How a change takes effect

A scope processes one input at a time. Each is a **turn**:

1. Before the turn, each foreign entry the input names is fetched and
   checked against its hash. That covers the facts in its fields and the
   facts presented beside it. Each detached text is checked against the
   digest that names it.
2. **The drain.** Every deadline that has passed is applied first, each as
   its own `timed` entry, in a fixed order: earliest deadline, then lowest
   item ID, then rule name. No other input may pass a due deadline.
3. The head is noted.
4. The rules the input meets are evaluated, outside the commit.
5. **The commit**, in one storage transaction: the clock is read once; the
   head is checked again; the input is judged; the entry is sealed and
   hashed; its row, its sends and its retained inputs are written; and the
   entry is folded into the items.

If another input committed between steps 3 and 5, nothing is written and
the turn starts again. A turn has a bounded number of timed entries and of
restarts. When a bound is spent it ends `unavailable`, with the reason
`busy`, and an alarm continues the drain.

**The clock.** Each commit reads the clock once. If the reading is earlier
than the last entry's time, the clock is **behind**. An entry that judges
a time, such as an act or a timed entry, is then not written, and the
answer is `unavailable` with the reason `clock-behind`. An entry that
judges no time is written with the previous entry's time and
`clamped: true`.

**Room to settle.** A scope has a budget of entries. Some entries create
duties that need a later entry: a deadline needs its timed entry, a
request needs its result, and an item in a state that an act or handler
declares with `settles` needs that act's or handler's entry. Before an
entry that is new work is kept, the
scope counts the entries its pending duties still need, and one for a
closing checkpoint. If they do not all fit, nothing is written and an act
is refused `scope-full`. So a duty that was admitted can always be
recorded as ended. `owed` and `fits`, in `derive`, do the count.

An entry that takes an item or a copy out of the states its form's
`settles` lists is a settling entry. It is written against the reservation
of that duty, and is not asked whether it fits. Every other entry of the
same form is new work, and so is every refusal. The validator derives what
each pending state reserves, and refuses, as `reserve-unbounded`, forms
that settle one another's pending states in a cycle. The count is of
entries only. Items, records, bytes and pending requests are not counted
yet.

The judging is not in the runtime. `judgeAct`, `judgeGenesis`,
`judgeDelivery`, `judgeTimed`, `judgeDiagnosis`, `judgeOutcome` and
`judgeCheckpoint` are pure functions of `derive`: from the folded state,
one input, its retained inputs and one clock reading, to the entry that
input writes or the answer it gets. `applyEntry` is the only code that
changes state. The runtime calls them inside the commit. A verifier calls
the same functions.

## Definitions are data

A definition (`DeclaredDefinition`) is a JSON value. An application writes
no guard code. A scope pins its definition by digest at its genesis, and
it never changes.

A definition states its `name`, which is what a `fact` type's `under`
compares with, and the capabilities it uses. It declares:

- **item types**: states, of which some are final; an initial state; and
  slots. A slot holds a member (a party), a reference or a value;
- **acts**: what an actor may sign. Each has a step (`open` a new item,
  `transition` an existing one, or `comment`), fields, the facts it may be
  presented, the action its grant must name, guards, effects, sends and
  attention;
- **handlers** (`receives`): what a message from another scope does;
- **timed rules**: what happens when a deadline passes;
- **rules**: named expressions that a `rule` guard evaluates.

Here is part of the lane that the tests use
(`packages/derive/test/fixtures.ts`). A commitment is offered and
accepted. A hold is taken under an accepted commitment, by its performer,
and ends by time.

```ts
items: {
  hold: {
    many: true, max: 2,
    states: { held: { final: false }, ended: { final: true } }, initial: "held",
    parties: { holder: { fixed: false, required: true, list: false, author: false } },
    refs: { under: { fixed: true, required: true, to: { type: "item", of: "commitment" } } },
    values: {
      until: { fixed: false, required: true, of: { type: "time" } },
      epoch: { fixed: false, required: true, of: { type: "int", min: 1, max: 1000000 } },
    },
  },
},
acts: {
  "take-hold": {
    step: "open", on: "hold", grant: "hold",
    also: { commitment: { item: "commitment", by: "commitment" } },
    fields: { commitment: { type: "item", of: "commitment", required: true } },
    guards: [
      { of: "also.commitment", state: ["accepted"] },
      { of: "also.commitment", signer: ["performer"] },
      { none: { type: "hold", states: ["held"], where: [{ equals: { a: { slot: "under" }, b: { field: "commitment" } } }] } },
    ],
    effects: [
      { ref: { slot: "under", from: { field: "commitment" } } },
      { value: { slot: "until", from: { time: { plusSeconds: 600 } } } },
      { hold: { do: "open" } },
    ],
    sends: [], attention: [],
  },
},
timed: {
  "hold-end": {
    on: "hold", states: ["held"], deadline: "until",
    effects: [{ hold: { do: "end" } }],
    attention: [{ notify: { slot: "holder", of: "on", when: "after", reason: "hold ended" } }],
  },
},
```

Read it like this. `take-hold` opens a new `hold` item. Its three guards
say: the commitment named in the field is `accepted`; the signer is that
commitment's performer; and no other hold that is still `held` is under
the same commitment. Its effects point the hold at the commitment and set
its end ten minutes after the commit's clock reading. Its `hold: open`
effect makes the signer the holder and sets the hold's epoch to 1. Only a
`hold` effect sets a hold's holder, its epoch or its state. Ten minutes
later the timed rule `hold-end` applies: the hold becomes `ended`, which is
final, its epoch rises, and its holder is told. A hold also ends, in the
same entry, when the commitment it is under reaches a final state.

### The forms

The types of every form are in `packages/contract/src/definition.ts`. This
section says what each family means. The deltas notes say where the
contract was silent and what was built.

**Field types.** A field, a slot or an element has one of these types:
`text`, `int`, `bool`, `time`, `enum`, `member`, `item`, `fact`, `scope`,
`digest`, `commit`, `tree`, `record` and `list`. A `fact` type states the
kinds of entry it takes, as a list, and the name of the definition those
entries are under. A `record` has named members, at least one, each with
a type and whether it is required. An `element` operand names a member of
a record element with a dot, such as `k.item`. A list holds no list.

**The kind of an entry.** A `fact` type and a `fact` guard compare an
entry's kind. An act entry has its intent's kind. A delivered `tell` has
its message's name, and a delivered relationship update its relationship's
name. A timed entry has `timed:` and its rule's name, so the validator
refuses an act kind or a message name that begins `timed:`. A delivered
request that no handler received has no kind. A genesis entry has the kind
that its input records in the member `kind`: the genesis act of the
definition that its scope pins. The scope that writes the genesis sets it
from that definition, and no sender can choose it. Every reader reads the
kind from the entry: the scope itself, another scope that fetched the
entry, and a verifier. So a lane under one definition can name the genesis
of a lane under another, when the type's kinds include that genesis act
and its `under` is that definition's name. The kind and the name are two
checks, and one does not excuse the other. A reader that does not hold the
other definition cannot check the recorded kind itself. It relies on the
other scope's judge, as it does for every member of a fetched entry. This
follows revision 12 of the scope contract, which is adopted
(`notes/2026-10-05-i2-contract-deltas.md`, section 24).

**Operands.** An operand is what a guard, an effect or a send reads.

| Operand | Reads | Where |
|---|---|---|
| `{ field }` | A field of the act, or of the message in a handler | Anywhere |
| `{ presented }` | A fact presented beside the intent | An act that declares it |
| `{ slot, of }` | A slot of a subject: `on`, an `also` name, or `each` in a fan-out | Anywhere |
| `{ element }` | The element that an enclosing list form binds | Inside that form |
| `{ item }` | A local reference to a subject's item | Anywhere |
| `{ signer: true }`, `{ intent: true }` | The signer, and the digest of the intent | An act |
| `{ sender: true }` | The scope that sent the message | A handler and a result clause |
| `{ source }` | A part of the verified source entry | A handler |
| `{ update }` | The state, the owner's item or the revision of the update | A `relate` handler |
| `{ result: "reason" }` | The name in a result's reason | A result clause |
| `{ scope: true }`, `{ const }`, `{ none: true }` | This scope's reference, a constant, and nothing | Anywhere |

The validator refuses an operand in a place that does not have it.

**Parts.** A field, a presented fact, a slot or an element that holds a
fact may carry `part`, which reads inside the entry that the fact names.
`ref`, `scope` and `seq` are read from the reference, and nothing is
fetched. `kind`, `intent`, `on`, `{ field }`, `{ opened }` and `{ set }`
are read from the entry's bytes. `{ of, then }` reads a fact that the
entry holds, and then that fact's scope or position. A part that is not
there reads as nothing. It is never an error.

A `{ field }` of this scope's own entry is read by this scope's types. A
`{ field }` of an entry of another scope is the value in that entry's
bytes, with no type applied: the reader does not hold the other
definition, and its own handlers say nothing of that entry. So where a
sender wrote the `self` mark in a message, a reader in another scope reads
the record `{ "self": true }`, and not the sender's entry.

**Local facts.** A fact that names this scope's own entry is not fetched.
It is checked against the scope's own history, and a wrong hash is refused
`fact-mismatch`. It is then compared as the entry's position.

**Guards.** A guard has three results: it holds, it fails, or it is not
completed. A guard that fails refuses the act. A guard that is not
completed, for example because a scan stopped at its work limit, leaves
the act not judged, and the answer is `unavailable`.

| Guard | Holds when |
|---|---|
| `state` | The subject is in a listed state |
| `signer`, `notIn` | The signer is in one of the listed party slots of the subject; or neither the signer nor the signer's principal is in any of them |
| `set`, `unset` | A slot of the subject holds a value, or holds none |
| `equals`, `differs` | Two operands are equal, or are not |
| `some`, `none`, `count` | A range of local items has some, none, or a number between `min` and `max`. A range is a type and states, with `where` clauses, less the items of the `except` subjects |
| `every` | Every item that a list names is in a listed state. The list is a field of the act, or else a slot of the subject. |
| `fact` | A field, a presented fact or an element names an entry of the declared kind and definition |
| `before`, `after` | The commit's clock reading is before, or after, a time slot |
| `rule` | A named rule expression gives true |
| `each` | Its nested guards hold for every element of a list. An empty list holds. |
| `has` | Some element meets its `where` clauses and its nested guards. An empty list fails. |
| `anyOf` | Every guard of at least one alternative holds |
| `distinct` | No two elements have the same key |
| `sameSet` | The keys of a list are exactly the items of a range |
| `capability` | A capability's own rule holds. See "Capability forms". |

Every guard may carry `reason`. It names the refusal and changes no
judgment. One act or handler has at most 24 guards as written, at most 96
counting those nested, and nests them at most 8 deep. Those numbers are
members of `Bounds`.

**Effects.** An effect changes one slot or the state of one subject, and
effects apply in the order written.

- A **source** is any operand. `null` empties a slot. `"self"` fills a
  reference slot with the entry being written. `{ time: { plusSeconds } }` is
  the commit's clock reading plus a constant. A source reads each subject
  as the effects written before it left that subject.
- An effect whose source reads nothing is not applied. So an optional
  field that is absent leaves its slot as it was.
- A **condition**, `if` or `unless`, is a list of guards. It is judged on
  the state before the entry. With `if`, the effect is applied only when
  every guard holds; with `unless`, only when not every guard holds.
- Two effects on one slot of one subject are a conflict, unless their
  conditions exclude each other in a form the validator can check.
- A party list is changed by `add` and `remove`, or is set whole from a
  list of operands. `attribute` sets an author list from the attribution
  history of a subject and from further sources, in byte order of member
  identifier.
- Where the validator cannot know a source's type, the commit checks the
  value against the slot and refuses `bad-field`.

**The hold type.** An item type that a `hold` effect opens is a hold type.
The validator requires its shape: two states, of which one is final; a
`holder`; a fixed reference `under` to a local item; an integer `epoch`;
and one timed rule that ends it. Only a `hold` effect changes the holder,
the epoch or the state. `open` and `renew` take the holder from the
signer. A renewal by the holder moves the end and keeps the epoch. A
renewal by another member raises the epoch. When an entry takes an item to
a final state, every hold under that item ends in the same entry.

**Detached texts.** A `text` type may carry `detached: true`. The intent,
the entry and every effect then hold the digest of the text, and the text
itself travels beside the signed intent. The scope computes the digest,
checks the text against the field's `max`, and keeps the bytes as a
retained input of the kind `text`. A text that is not the one named is
refused `bad-field`. A detached text may be a field or a value slot. A
guard, a rule, an `index` send and a send to a scope that is not a lane
may not read one: the validator refuses that as `redactable-read`.

**Redaction.** A `redact` effect, in an act only, removes the bytes of
every text that its slot has held. The entry lists their digests and is
the tombstone: it says who removed the text, when, and under which grant.
The slot keeps its digest.

**Presented facts.** An act may declare, in `presents`, up to four facts
that are shown beside its intent and are not signed. Each is fetched and
checked as a fact field is. A `fact` guard and an operand may read it, and
the entry records it in its input.

**Capability forms.** A definition may list the capabilities `hold@1` and
`git-read@1`, and may write a `capability` guard, a `capability` effect,
the part `{ carried }`, and a fact kind such as `hold@1:check`. A
preparation entry has such a kind. An outcome entry has none, because its
bytes hold neither the capability nor the step, so a `fact` guard over a
check entry does not hold.
The validator checks each form against what the listed version declares,
in the contract package's `CAPABILITIES`. It derives none of them: a definition
that passes lists each such form in `ValidDefinition.underived`. The derive
package has the rules of `hold@1` over its records and the guard
`ancestry` of `git-read@1`, with the judge of a preparation. The
production ports hold them, so the production runtime can pin such a
definition. A runtime that lacks the code of one form founds and creates
no scope under a definition that uses it,
and answers `unsupported-definition`. A verifier with no such code answers the same. The
item form of `hold@1`, with its `hold` effect, needs no such code and
runs. A test may use `scriptedCapability`, from
`@generalbusiness/artroom-scope/testing`. It is a stand-in: it answers
from a table that the test supplies, and shows nothing about a real hold
or a Git read. The same module has `net.peers`, for scripted peers: entries
that a test writes by hand in place of a platform scope that is not
delivered. A scripted peer shows the receiver's side of a delivery only.

### Validation and bounds

`validateDefinition(definition, bounds)` checks a definition before a
scope pins it. It refuses a form the contract does not define, a name that
resolves to nothing, an opening that leaves a required slot unset, two
effects on one slot, a timed rule whose entry could be too large to write,
and timed rules that lead to one another in a cycle. It returns a
`ValidDefinition`, which is all the judges take.

Every size and count is a member of `Bounds`, and code takes a `Bounds`
value. `PROPOSED_BOUNDS`, in `packages/contract/src/bounds.ts`, is the one
set of numbers. For the bounds of the contract's sections 2.1, 6 and 7.5
it holds the numbers that revision 11 of the scope and replay contract, at
`996c3e58`, states. The contract calls those numbers proposals: measured
budgets replace them. For some members the comment in that file says that
the contract states no number, or owes one to the proof plan: the bound on
a member's handle, the two limits of a guard's scan, the scope's budget of
entries, the number of named definitions, and the retry delays of sending
and of the drain. Those values are this source's own. All of them are
temporary.

A `rule` guard names an expression in a restricted JSONata profile,
`restricted@1`. It can read the act's kind, fields, signer and subjects,
and the fetched entries. It cannot read a clock or anything else. The
ticket fixture has one: `"signer.member != subjects.on.parties.requester.member"`.
A rule is evaluated before the commit, and the entry records the digest of
what it read and its result.

## Composition

Scopes work together by messages. A message is a **send** of an entry: it
is written in the same transaction as the entry, so a message exists if
and only if its entry does.

There are four classes of message:

| Class | Types | Has a result |
|---|---|---|
| Request | `create`, `tell`, `relate` | Yes, exactly one |
| Result | The answer to a request: `applied`, `refused` or `superseded` | No |
| Control | `confirm` | No |
| Advisory | `index`, `notify` | No |

**Creating a child.** A scope creates another with a `create` send. The
send is addressed by the child's seed, so the child's ID is fixed before
it exists. The child reads its definition's bytes from its creator, checks
their digest, and writes its genesis. It is then **provisional**: it
admits nothing but a repeat of its creation. Its genesis sends the result
back. The creator records that result and sends a `confirm`. When the
child records the confirmation it is **active**. If the child's genesis
act is refused, the genesis is still written, the result is `refused`, and
the child is terminal.

**Relationship updates.** With a `relate` send, the scope that owns a
relationship tells another scope its state. The receiver keeps a copy,
keyed by the owner, the owner's item and a name. The copy's revision is
the position of the owner's entry. An update is applied only if it is
newer than the copy; an older one is answered `superseded`. So the two
arrival orders end the same. The receiver's definition declares a handler
for the relationship, by its name, and says how many keys it keeps a copy
for. An update for one key more is refused `type-full`, and an update of a
relationship with no handler is refused `unknown-message`. Neither keeps a
copy.

**Handlers.** A handler states its class (`tell`, `relate` or `advisory`),
its message, the kind of scope it receives from, and the fields of the
message. A field the handler does not declare, or a value that is not of
its type, refuses the request `bad-field`. A handler may open one item. A
`relate` handler states `copies`, and may read the update with the
`update` operand. A handler's fields are the message's fields, or for a
`relate` the update's detail.

**Other items.** An act or handler names its other items in `also`. A name
selects its item by a field (`by`), through a slot of another subject
(`via`), or as the one item of a type that is not `many` (`one`). A name
that selects nothing is unbound: its guards are not evaluated and its
effects are not applied.

**Delivery.** Each scope has a dispatcher. It records each attempt before
it dispatches and the answer after, retries with a growing delay, and is
restarted by an alarm. The receiver trusts nothing in a delivery. It reads
the source entry from the source scope, checks its hash, and checks that
the entry holds that send, to that address, with that message. Only then
is the delivery judged, in the receiver's own turn. A delivery that
arrives twice is answered with the entry that recorded it the first time.

A send's **result clauses** say what the sender does when the result
arrives: one list of effects for each of `applied`, `refused`,
`superseded`, `undelivered`, and for a creation `conflict`.

**What a send may say.** A field of a message is read from any operand:
a field, a slot of any subject, the signer, a constant, and in a handler
the sender and the source entry. A `collect` lists one record for each
item of a range. A `tell` is addressed by a slot that holds a scope. A
`tell` or a `relate` with `if` is made only when its guards hold; one that
is not made takes no ordinal. A `relate` with `each` is a fan-out: one
update for each live item of a type, in order of item ID. A `create` may
name `self`, the creating scope's own definition. An `index` row goes to
the scope's directory: its creator, when that is a directory, or the
directory that its creator recorded. The validator bounds what one entry
can send and whom it can tell.

A fan-out covers a type whose `max` is at most 32, and one list of sends
has at most one fan-out; the validator refuses any other as
`fan-out-unbounded`. A result clause of a fan-out send may read `each`
when the update's item is `each`. The range of a fan-out and of a
`collect` is read as a guard's range is: a scan that stops unfinished
leaves the input not judged. A message field that is a detached text
carries the digest. The receiver reads the bytes from the sender before
its turn and checks them.

**Attention.** A `notify` form tells the members that a party slot holds,
as the slot was before the effects or as it is after. The entry records
them in an `attention` effect. A notice may carry `if`, but not in a timed
rule. The attention forms of one act, handler or timed rule can tell at
most 64 members; the validator refuses more as `attention-unbounded`.

**Diagnoses.** When a request cannot be delivered, the sender stops and
writes a `diagnosis` entry with its attempt log. There are two findings.
`undelivered`: every attempt was refused by routing, so the target does
not exist under that name and incarnation; the `undelivered` clause runs
and the request is settled. `delivery-unavailable`: anything else; no
clause runs, the request stays pending, and a late result is still
recorded. A lost answer is never read as proof.

In production the scope namespace is the resolver, the transport, the
source of declarations and the source of the texts that travel beside a
message (`namespace`, in `scope`). There is no registry.

## Reads and settlement

Every read is bounded and says where it was made. A read (`Read<T>`)
returns a value, the head it was read `at`, whether it is `complete`, and
a cursor `next` when there is more; or a refusal with a reason.

| Read | Returns |
|---|---|
| `summary` | The scope's reference, status and definition; its live items; an exact count for every type and state. |
| `items` | A page of the final items of one type. |
| `history` | A page of entries, each with its hash. |
| `entry` | One entry. |
| `outbox` | A page of the scope's sends, with the attempts and result of each. |
| `duty` | The outbox row of one send, by its duty ID. |
| `log` | A page of the history as stored: each entry's canonical bytes. For a verifier. |
| `retained` | One retained input, by kind and digest: a definition, a foreign entry, a rule's input, or a detached text until it is redacted. |

**Settlement** answers one question: was this exact signed intent
accepted? `settle` returns its receipt or `not-found`. It writes nothing.

The contract's `ScopeApi` is all of these as one interface. The Worker
serves it twice: over HTTP (`route`, with the routes listed in the scope
package's guide) and over a service binding (`ScopeService`).

Who may read is decided by a port, `Readers`. Its production default lets
nobody read.

## Replay, and what a report means

`@generalbusiness/artroom-replay` checks a history without running the
runtime. `verify(source, options)` reads a scope's stored bytes through a
`HistorySource` and returns a report. There are two modes.

- **Integrity** checks the chain, each entry's bytes and hash, that the
  scope ID is the digest of the genesis's seed, and the actors'
  signatures. It derives no judgment.
- **Replay** also folds the history from its genesis and derives every
  entry again with the judges of `derive`, from the recorded input, the
  retained inputs and the recorded time. It compares the result with the
  entry, byte for byte. It checks that the kind which the genesis records
  is the genesis act of the pinned definition, and reports a difference
  as `mismatch`, in words that begin `genesis-kind`. It evaluates each
  rule again from its retained input. For each entry of another scope that was used, it replays that
  scope up to that entry, or takes an **anchor** the caller supplies.

A report (`Report`) states its mode, the head it aimed for, its
**coverage** (which entries of which scopes were checked to their end),
its anchors, its **trusts** (what it took on someone's word), and each
detached text that was **redacted**: a text whose bytes a tombstone
removed is not derived again, and the report names the tombstone. Its
result is one of:

| Result | Means |
|---|---|
| `consistent` | Everything the mode checks holds, for the coverage and trusts stated. |
| `mismatch` | An entry is not what its bytes, its chain, its signature or its replay say. The report names the entry. |
| `missing-dependency` | A history that an entry used cannot be read, and no anchor names the entry. |
| `incomplete` | A retained input is missing, or a limit was reached. A detached text that is gone with no tombstone is a missing input. No claim is made beyond the coverage. |
| `unsupported-definition` | The scope pins a definition this replay has no code for: a platform definition whose data and rules the caller did not give, or gave without the rule of one mark; or a declared one that needs a capability's rules. The package has none of its own. With the rules of a platform definition, the report lists `platform-code` under `trusts`, with the name and the version. |

"Consistent" is always for a stated mode, target, coverage and set of
trusts. It is not "verified". A replay trusts, among other things, the
service's clock, that each read of membership behind a recorded grant
was made as recorded, and, when the caller gives no known head, the
service's word for where the history ends. The grant itself is derived
again, from the observation that it retains and from the membership
scope's history. A grant with no such observation is no grant: the
command line reports its entry as a mismatch. Give a head from a receipt you kept, and a history that is shorter
or different is a mismatch.

Everything a source returns is untrusted. The verifier limits the bytes,
entries and scopes it takes in and the time one read may take.

```
artroom-replay <service URL> <scope ID> [--mode integrity|replay]
    [--head <seq>:<hash>] [--anchor <scope>:<seq>:<hash>]... [--json]
```

It exits 0 for consistent, 1 for any other result, and 2 when the command
was not understood or the target could not be read.

## The client handle

`@generalbusiness/artroom-client` is what an application or an agent uses.

```ts
import { ScopeHandle, httpTransport, signedIntent, webCryptoSigner } from "@generalbusiness/artroom-client";

const signer = await webCryptoSigner();
const scope = new ScopeHandle(httpTransport("https://scopes.example"), scopeId, reader);

const signed = await signedIntent(signer, { to: at, kind: "remark", on: 0, fields: { text: "a remark" } });
const answer = await scope.submit(signed, grants);   // a third argument carries what travels beside the intent
if (answer.answer === "accepted") await scope.followReceipt(answer.receipt);
```

- `signedIntent` builds an intent with a fresh idempotency key and a
  `notAfter` inside the lifetime bound, and signs it. A `Signer` gives out
  a key ID and signatures, never a private key. The value returned is the
  value signed: keep it, and retry with it.
- `ScopeHandle` has `submit`, `settle`, the reads, `definition`, `text`,
  `followReceipt` and `followDuty`. `found` founds a directory. `submit`
  and `found` take, as one more argument, what travels beside the intent:
  the detached texts and, for an act, the presented facts.
- `declaredHandle(scope, definition)` gives a handle that is typed from a
  declared definition. It answers one only when the scope pins the digest
  of the value given. Its `intent` checks each field against its declared
  type before it signs, and gives a detached text's digest to the intent
  and the text to send beside it. It checks no guard.
- A **transport** is the contract's `ScopeApi`. `httpTransport` uses the
  HTTP routes; `bindingTransport` uses a service binding. Each returns a
  reply only when it is an answer of its operation, with every fixed
  record in it as the contract defines it. Over HTTP a reply is read up to
  4 MiB and for at most 30 seconds; both values are temporary. A lost,
  malformed, oversized or late reply is a `TransportError`: the outcome is
  unknown, so submit the same signed intent again.
- `followReceipt` reads the entry a receipt names, checks it against the
  whole fact, and computes the hash itself.

The client derives no judgment. It learns what it may do by reading the
scope's summary and its published definition.

## What is not delivered yet

The substrate stops at a named line. The rest belongs to later deliveries,
and nothing here guesses at it.

| Not delivered | Owner | What the substrate has in its place |
|---|---|---|
| Grants and membership: who may act, how a grant is shown to be current, revocation | The authority design, then the authority and publication delivery | The `Grant` shape and the check that a grant names the action, the key and the scope. Whether a grant is current is asked of a port, `Authority`, in two phases: a read before the turn, and a decision in the commit on what was read. The production default reads no grant, so none is current. The tests use a test authority that is named as one. |
| Who may read, and sessions | The same | The `Readers` port, whose production default lets nobody read. |
| Platform definitions: register, directory, membership, rules, destination, inbox, task | The same | The data and the one rule of `platform:inbox@1`, in `packages/platform`. Its `notify` handlers hold the mark `notice-source`, and the judges run its rule, so a scope is founded under it and records a notice. A runtime or a replay that lacks a rule for a mark answers `unsupported-definition` for the whole scope. This builds the scope contract's revision 15 and the authority note's revision 20. Both are adopted. The adoption is of the designs, and is no review of this source. Every other platform name is answered `unsupported-definition`. Since then `packages/platform` also holds the data and the three rules of `platform:rules@1` (`rules-scope.ts`), which are its whole version. Its rules read an observation and a value beside an intent, and the scope's runtime gives a rule neither yet, so on a real scope its three marked acts are not completed or are refused (`notes/2026-10-05-i3-contract-deltas.md`, entry EQ9). The data of `platform:destination@1` is there too, with eight of its rules. Ten of its marks have no rule, so nothing is created under it yet (`notes/2026-10-05-i3-contract-deltas.md`, section 18). |
| Hold tokens, workspaces and their export | The same | The hold item, its epoch, and its timed end. The records of a hold's workspace are derived by `workspaceEffects` in `packages/derive` when a judge is given the code of `hold@1`, which the production ports hold. No grant is read in production, so no hold is opened there yet. |
| The rules of the `hold@1` and `git-read@1` capabilities in a running scope: their records, guards, effects and steps | The same | The rules are pure functions in `packages/derive` (`src/capability/`, `src/prepare.ts`), with tests on made-up definitions, and the Git reader is `packages/git`. The production ports hold them (`CAPABILITY_CODE`, in `packages/scope/src/ports.ts`). No grant is read in production and nothing is sent outside, so there every act and step is refused `unauthorized` and no attempt is sent. A verifier is not given them yet, and answers `unsupported-definition` for a definition that uses a capability form. The tests of a scope have a scripted stand-in, which is named as one, and the lane scenarios T3, T4 and T5b run on the code itself with a stand-in for the Git host. |
| Publication to a destination, and the evidence of an outside write | The same | The `outcome` input, the numbering of operations and attempts, and the driver in `packages/scope` that records an attempt before it sends it. The outcome input states the owner and the kind of its operation. The production port sends nothing. The rules of the operations of `hold@1` are wired, and no operation is opened in production. |
| Running the two lane definitions, `issue` and `change` | The authority and publication delivery, for the capability rules and the platform scopes that the rows read | The two definitions as data, in `packages/lanes`, validated whole and pinned by digest. Both use capability forms, whose code the production ports hold, so a scope can be founded or created under either. As deployed it admits no act and no step, because no grant is read. Ten test scenarios run them on real scopes with stand-ins that each test names. [lanes.md](lanes.md) says which rows wait and on whom. The fixtures' lane and ticket are made up for tests. |
| The application: browser pages, the command line, tools for agents | The application delivery | The client handle. |
| A deployment | Not authorized | `packages/scope/wrangler.jsonc` is configuration only. Nothing in this repository deploys it. |
| Budgets in bytes, items, records and pending requests; the numbers of every bound | The proof plan | A budget of entries, with temporary numbers. `settles` is counted in entries only. |

The earlier model's source that a later delivery still replaces is in
`parked/`, and `parked/README.md` is its ledger. `docs/protocol.md` and
`docs/policy-pack.md` describe the earlier model and are marked inactive.
