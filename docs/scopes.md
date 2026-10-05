# Scopes

This guide describes what the scope substrate delivers: the six packages
under `packages/`. It is for a technical reader who has not read the
design notes. It says what a scope is, how a change to one takes effect,
how scopes work together, how a history is checked, and what is not built
yet.

The scope and replay contract is the authority for the design. Where the
contract was silent, `notes/2026-10-04-i1-contract-deltas.md` records what
was implemented and why. Nothing in that note is adopted by being built.

## The packages

| Package | Holds | Imports |
|---|---|---|
| `@generalbusiness/artroom-contract` | Types and constant tables. No logic. | Nothing |
| `@generalbusiness/artroom-bytes` | Canonical JSON, SHA-256, encodings, Ed25519, the six byte domains, and the guard of each identifier. | contract |
| `@generalbusiness/artroom-derive` | The definition validator, the fold, the judges and the rule evaluator. Pure functions. | contract, bytes |
| `@generalbusiness/artroom-scope` | The runtime of a scope on a Cloudflare Durable Object with SQLite storage, and the Worker's routes. | contract, bytes, derive |
| `@generalbusiness/artroom-replay` | An independent check of a history, its report, and the command `artroom-replay`. | contract, bytes, derive |
| `@generalbusiness/artroom-client` | Building and signing an intent, and a typed handle on one scope. | contract, bytes |

Each package's `README.md` lists its modules. The runtime and the verifier
share `derive` and nothing else. The client shares neither.

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
canonical JSON of one value. The six tags are in `DOMAINS`. No value
contains its own digest: an entry has no field for its own hash.

`@generalbusiness/artroom-bytes` has the one implementation of each:
`canonicalize` and `parseStrict`; `scopeIdOf`, `entryHash`, `intentDigest`
and the other digests; `signIntent` and `verifySignedIntent`; and the
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
| `genesis` | The first entry. It records the seed, and a founding intent or a creation request. |
| `act` | An intent that an actor signed, with the grant it was judged under. |
| `delivery` | A message from another scope. |
| `timed` | A deadline that an item held and that has passed. |
| `diagnosis` | The scope's finding that a request it sent could not be delivered. |
| `outcome` | The result of an attempt to write outside the service. No form opens one yet. |
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
| `refused` | The act was judged and is not allowed. Nothing was written. The answer names a reason and the head it was judged at. | Read the reason. A refusal is a statement about that head only. |
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
   checked against its hash.
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
request needs its result. Before an entry that is new work is kept, the
scope counts the entries its pending duties still need, and one for a
closing checkpoint. If they do not all fit, nothing is written and an act
is refused `scope-full`. So a duty that was admitted can always be
recorded as ended. `owed` and `fits`, in `derive`, do the count.

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

A definition declares:

- **item types**: states, of which some are final; an initial state; and
  slots. A slot holds a member (a party), a reference or a value;
- **acts**: what an actor may sign. Each has a step (`open` a new item,
  `transition` an existing one, or `comment`), fields, the action its
  grant must name, guards, effects, sends and attention;
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

`validateDefinition(definition, bounds)` checks a definition before a
scope pins it. It refuses a form the contract does not define, a name that
resolves to nothing, an opening that leaves a required slot unset, two
effects on one slot, a timed rule whose entry could be too large to write,
and timed rules that lead to one another in a cycle. It returns a
`ValidDefinition`, which is all the judges take.

Every size and count is a member of `Bounds`. `PROPOSED_BOUNDS` holds the
contract's proposed numbers. They are temporary.

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
arrival orders end the same.

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

**Diagnoses.** When a request cannot be delivered, the sender stops and
writes a `diagnosis` entry with its attempt log. There are two findings.
`undelivered`: every attempt was refused by routing, so the target does
not exist under that name and incarnation; the `undelivered` clause runs
and the request is settled. `delivery-unavailable`: anything else; no
clause runs, the request stays pending, and a late result is still
recorded. A lost answer is never read as proof.

In production the scope namespace is the resolver, the transport and the
source of declarations (`namespace`, in `scope`). There is no registry.

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
| `retained` | One retained input, by kind and digest: a definition, a foreign entry, or a rule's input. |

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
  entry, byte for byte. It evaluates each rule again from its retained
  input. For each entry of another scope that was used, it replays that
  scope up to that entry, or takes an **anchor** the caller supplies.

A report (`Report`) states its mode, the head it aimed for, its
**coverage** (which entries of which scopes were checked to their end),
its anchors and its **trusts** (what it took on someone's word). Its
result is one of:

| Result | Means |
|---|---|
| `consistent` | Everything the mode checks holds, for the coverage and trusts stated. |
| `mismatch` | An entry is not what its bytes, its chain, its signature or its replay say. The report names the entry. |
| `missing-dependency` | A history that an entry used cannot be read, and no anchor names the entry. |
| `incomplete` | A retained input is missing, or a limit was reached. No claim is made beyond the coverage. |
| `unsupported-definition` | The scope pins a definition this replay has no code for. |

"Consistent" is always for a stated mode, target, coverage and set of
trusts. It is not "verified". A replay trusts, among other things, the
service's clock, that each recorded grant was current, and, when the
caller gives no known head, the service's word for where the history
ends. Give a head from a receipt you kept, and a history that is shorter
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
const answer = await scope.submit(signed, grants);
if (answer.answer === "accepted") await scope.followReceipt(answer.receipt);
```

- `signedIntent` builds an intent with a fresh idempotency key and a
  `notAfter` inside the lifetime bound, and signs it. A `Signer` gives out
  a key ID and signatures, never a private key. The value returned is the
  value signed: keep it, and retry with it.
- `ScopeHandle` has `submit`, `settle`, the reads, `definition`,
  `followReceipt` and `followDuty`. `found` founds a directory.
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
| Grants and membership: who may act, how a grant is shown to be current, revocation | The authority design, then the authority and publication delivery | The `Grant` shape and the check that a grant names the action, the key and the scope. Whether a grant is current is asked of a port, `Authority`, whose production default says no. The tests use a test authority that is named as one. |
| Who may read, and sessions | The same | The `Readers` port, whose production default lets nobody read. |
| Platform definitions: directory, membership, rules, destination, inbox, task | The same | A platform name is answered `unsupported-definition`. The tests run declared definitions. |
| Hold tokens, workspaces and their export | The same | The hold item, its epoch, and its timed end. |
| Git reads, and the `git-read` capability | The same | Nothing. A definition that lists the capability is refused. |
| Publication to a destination, and the evidence of an outside write | The same | The `outcome` input and the numbering of operations and attempts. No form opens an operation. |
| The lane definitions: issue, work and pull request | The lane forms delivery | None. The fixtures' lane and ticket are made up for tests. The forms the lane definitions ask for beyond the contract's grammar are refused by the validator. |
| The application: browser pages, the command line, tools for agents | The application delivery | The client handle. |
| A deployment | Not authorized | `packages/scope/wrangler.jsonc` is configuration only. Nothing in this repository deploys it. |
| Budgets in bytes, items and records; the numbers of every bound | The proof plan | A budget of entries, with temporary numbers. |

The earlier model's source that a later delivery still replaces is in
`parked/`, and `parked/README.md` is its ledger. `docs/protocol.md` and
`docs/policy-pack.md` describe the earlier model and are marked inactive.
