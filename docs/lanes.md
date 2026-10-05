# Lanes

This guide describes the two lane definitions, `issue` and `change`, which
are in `packages/lanes`. It is for a technical reader who has not read the
design notes. It says what the two definitions are, how to read one row,
how the definitions are pinned, how a client uses one, and what runs today.

Read [scopes.md](scopes.md) first. It says what a scope, an entry, an act
and a definition are. [lanes-reference.md](lanes-reference.md) lists every
row of both definitions in tables. That file is generated from the data.

The design note "Lane forms and browser flow", revision 14, at `4b3bf5da`,
is the authority for every row. Where it or the scope contract was silent,
`notes/2026-10-05-i2-contract-deltas.md` records what was implemented and
why. Nothing in that note is adopted by being built.

## A lane is a definition

A lane is a scope of the kind `lane`. What a lane holds, and which changes
it allows, is decided by its definition, and a definition is data. The
platform packages have no code for an issue or for a change. They import
nothing from the lanes package, and `scripts/active-source.test.mjs` checks
that.

So `packages/lanes` holds no rule and no code that judges. It holds two
values of the contract's type `DeclaredDefinition`, their canonical bytes
and their digests.

| Definition | Carries | Opened by the act |
|---|---|---|
| `issue` | A goal: its conditions, who has promised what, who holds a workspace, what was reported, how the goal was planned and split, its discussion, and whether it is open. | `file` |
| `change` | A proposed change: its versions, each an exact selection of reports and an exact integration commit; its reviews, check jobs and threads; its links to issues; and its merge. | `open` |

The counts, as `packages/lanes/test/definitions.test.ts` asserts them:

| Definition | Item types | Acts | Timed rules | Handlers | Canonical bytes |
|---|---|---|---|---|---|
| `issue` | 12 | 50 | 1 | 7 | 46,160 |
| `change` | 14 | 52 | 2 | 4 | 56,293 |

Neither definition declares a rule expression. Both list two capabilities,
`hold@1` and `git-read@1`.

## The words

Each word below is an item type. The slots named are in the data.

**Commitment.** One promise by one member. It has a `requester`, an
optional `offeree`, a `performer` and an optional `successor`. In `issue`
its states are `offered`, `proposed` and `accepted`, and four final ones:
`declined`, `withdrawn`, `cancelled` and `fulfilled`. Its slot `termsAt` is
a fact: a reference to the entry that stated the terms. The slot is fixed,
so the terms of a commitment never change. A handover changes the
`performer` of the same commitment: `offer-handover` names a successor, and
`accept-handover` makes that member the performer.

**Hold.** A time-limited claim, taken under one accepted commitment by
its performer. It has a `holder`, a reference `under` to the commitment, an
end time `ends` and a counter `epoch`. `take-hold` sets the end 3,600
seconds after the commit's clock reading. The lane forms call that number
an example. The timed rule `hold-end` ends the hold when the time passes.
A hold is separate from its commitment: `hold-end` and `release-hold` each
have one effect, which ends the hold, and neither changes a commitment.
The platform also ends a hold in the entry that takes its commitment to a
final state. `packages/derive/test/forms-hold.test.ts` shows each of
these on a test definition. The workspace and the token that a hold will
stand for are not delivered.

**Plan and concern.** In `issue`, a plan is one way to split the goal. A
concern is one part of a plan. `add-concern` opens a concern and sends a
`create` for a new lane under the same definition (`definition: "self"`).
The concern's states follow that creation: `creating`, then `created`,
`refused` or `conflict` from the result of the request. A concern can be
added only while its plan is `open`. `seal-plan` takes the plan to
`sealed` and makes it the goal's current plan.

**Report and input.** A report is a performer's statement of what was
done: a commit, a tree, claims and evidence, under one commitment. The
commitment's requester accepts or refuses it. An input is an accepted
report that a performer has selected to build on. It names two facts: the
report, and the entry that accepted it.

**Manifest.** In `change`, one version of the proposed change. It holds
the `base`, the `integration` commit and its `tree`, the list `selected`
of exact reports with their acceptances, and the list `decisions`. Every
one of those slots is fixed. A later version is a new manifest item, and
the earlier one becomes `superseded`.

**Review, job and result.** A review is one member's verdict on one
manifest. A job is one requested check of one manifest, with its tree, its
configuration and a deadline. A result is one checker's recorded outcome
for one job. The `rules` item holds the required approvals and checks, as
the lane received them from a rules scope.

**Link.** In `change`, a statement that this change closes one issue. It
has the issue's scope in `issue`, and two states: `set` and `removed`. The
change lane owns the link. It tells the issue with a relationship update,
and the issue keeps a copy.

**Merge.** In `change`, one request to publish one manifest. The act
`merge` opens it and sends the message `reserve` to the proposal's
destination, with the verdicts and the jobs of that manifest.

## How to read a row

One member of `acts` is one act kind. Read its parts in this order.

| Part | Says |
|---|---|
| `step`, `on` | `open` makes a new item of type `on`. `transition` changes an existing item, which the intent names by its local ID. Neither lane definition uses the third step, `comment`. |
| `also` | Other items of the same scope that the act reads or changes, each under a name. `by` selects one by a field, `via` through a reference slot of another item, and `one` takes the one item of a type that is not `many`. |
| `fields` | What the signer supplies. A field with `required: false` may be left out. A text with `detached: true` travels beside the intent, and the intent holds its digest. |
| `presents` | Facts that are shown beside the intent and are not signed. |
| `grant` | The action that a current grant must name. |
| `guards` | Conditions on the state before the entry. All must hold. A guard with no `of` is about the `on` item. A guard's `reason` is the name that a refusal carries. |
| `effects` | The changes, applied in the order written. An effect with `if` or `unless` is applied only when its own guards allow it. |
| `sends` | Messages to other scopes, written in the same entry. |
| `attention` | Who is told: the members that a party slot holds, before the effects or after them. The entry records them in an `attention` effect. |
| `settles` | Where present: the pending state that this act's entry ends. The scope reserves an entry for it. |

A handler, a member of `receives`, reads the same way. It has no signer
and no grant. In their place it states its `class`, its `message`, the
kind and definition of the scope it receives `from`, the item type it
`opens`, and for a relationship the number of `copies` it keeps.

### An act of `issue`: `accept`

This is the row as it is in `packages/lanes/src/issue.ts`.

```ts
accept: {
  step: "transition", on: "commitment", grant: "issue.promise",
  also: {},
  fields: { terms: { type: "fact", kind: ["file", "revise", "propose-terms"], under: "issue", required: true } },
  guards: [
    { state: ["offered"] },
    { anyOf: [[{ unset: "offeree" }], [{ equals: { a: { signer: true }, b: { slot: "offeree" } } }]], reason: "not-offeree" },
    { equals: { a: { field: "terms" }, b: { slot: "termsAt" } }, reason: "terms-differ" },
  ],
  effects: [
    { state: "accepted" },
    { party: { slot: "performer", from: { signer: true } } },
  ],
  sends: [],
  attention: [{ notify: { slot: "requester", of: "on", when: "after", reason: "accepted" } }],
},
```

Read it like this.

1. It is a transition on a commitment. The intent names the commitment.
2. The signer supplies one field, `terms`: a reference to an entry of the
   kind `file`, `revise` or `propose-terms`, under a definition named
   `issue`.
3. The signer needs a current grant for the action `issue.promise`.
4. Three guards must hold. The commitment is `offered`. Either the
   commitment names no offeree, or the signer is the offeree. And the
   entry that the signer names in `terms` is the entry that the
   commitment's slot `termsAt` holds.
5. If the second guard fails, the act is refused `guard-failed` with the
   name `not-offeree`. If the third fails, the name is `terms-differ`. So
   a member cannot accept terms other than the ones that were offered.
6. Two effects: the commitment becomes `accepted`, and the signer becomes
   its `performer`.
7. Nothing is sent. The commitment's requester is told, with the reason
   `accepted`. `when: "after"` reads the slot as the effects left it.

### An act of `change`: `link-own`

This is the row as it is in `packages/lanes/src/change.ts`.

```ts
"link-own": {
  step: "open", on: "link", grant: "change.edit-own",
  also: { proposal: { item: "proposal", one: true } },
  fields: {
    issue: { type: "scope", kind: "lane", required: true },
    how: { type: "enum", of: ["keyword", "manual"], required: true },
  },
  guards: [
    { none: { type: "merge", states: ["intended", "committed", "unknown"] }, reason: "merge-in-progress" },
    { state: ["draft", "open", "closed"], of: "also.proposal" },
    { none: { type: "link", states: ["set"], where: [{ equals: { a: { slot: "issue" }, b: { field: "issue" } } }] }, reason: "already-linked" },
    { signer: ["author"], of: "also.proposal" },
  ],
  effects: [
    { ref: { slot: "issue", from: { field: "issue" } } },
    { party: { slot: "linker", from: { signer: true } } },
    { value: { slot: "how", from: { field: "how" } } },
  ],
  sends: [{ relate: { to: { field: "issue" }, name: "closes", item: "self", state: "set", detail: {}, result: {} } }],
  attention: [],
},
```

Read it like this.

1. It opens a new `link` item. It also names `proposal`: the one item of
   that type, because `proposal` is not `many`.
2. The signer supplies the issue's scope, which must be a lane, and how
   the link was made.
3. The signer needs a current grant for the action `change.edit-own`.
4. Four guards must hold. No merge is in progress. The proposal is not
   merged. No link that is still `set` names the same issue. And the
   signer is the proposal's author.
5. Three effects fill the new link's slots from the fields and the
   signer. The link starts in its initial state, `set`.
6. One message is sent, in the same entry: a relationship update named
   `closes`, to the issue, with the state `set`. `item: "self"` names the
   link by the entry that opens it.

The issue's side is the handler `closes` of `issue`. It receives a
relationship named `closes` from a lane under `change`, and keeps a copy
for at most 32 keys. Its effects have conditions: they close the goal
only when the update's state is `merged`. An update with the state `set`
changes no item. The copy is then pending: the handler declares
`settles: { copy: ["set"] }`, so the issue reserves room to record the
update that takes the copy out of `set`.

`unlink-own` is the reverse. It takes the link to `removed` and sends the
same relationship with the state `removed`. The update `merged` is sent by
the handler `publication` of `change`, once for each link that is `set`,
when the publication's outcome is `published`.

## How the definitions are pinned

A scope pins its definition by digest at its genesis. So each lane
definition has one exact digest.

| What | Where |
|---|---|
| The two values | `packages/lanes/src/issue.ts`, `change.ts`, and `shared.ts` for the rows that both state |
| The canonical bytes of each | `packages/lanes/definitions/issue.json`, `change.json` |
| The two digests, with the revision and commit of the lane forms that the rows were written from | `packages/lanes/src/digests.ts`, as `DIGESTS` and `LANE_FORMS` |

The digests at this head:

| Definition | Digest |
|---|---|
| `issue` | `sha256:325cb4f33da9deb1a31d85ba0f1456068d4d9d08009978b779aed70cb08e00ad` |
| `change` | `sha256:4ff0c7f681c664a3c2dae22bd0df4a9a1bb239e19bc185db41f7f140d4dfca45` |

A digest is `definitionDigest` of the bytes package: SHA-256 over the tag
`artroom-definition-1`, a newline and the canonical JSON of the whole
value. There is one implementation.

A digest is exact for one value. Any change of a row, a name or a number
makes a new definition with a new digest. A scope that pinned the earlier
digest keeps it.

When a row changes, a person runs two scripts:

```
node packages/lanes/scripts/pin.mjs         # the two byte files and digests.ts
node packages/lanes/scripts/reference.mjs   # docs/lanes-reference.md
```

`packages/lanes/test/definitions.test.ts` fails while the byte files or
the digests are not the ones that `pin.mjs` writes. Its three tests show
that each definition is exactly its pinned bytes and digest, that the
counts are the ones above, and that both definitions pass
`validateDefinition` whole at the bounds of `PROPOSED_BOUNDS`.

`node packages/lanes/scripts/reference.mjs --check` exits 1 when the
reference file is not the one the script writes.

## How a client uses a definition

The client package has one handle that is typed from any declared
definition. It names no lane.

```ts
import { ScopeHandle, declaredHandle, httpTransport } from "@generalbusiness/artroom-client";
import { issue } from "@generalbusiness/artroom-lanes";

const scope = new ScopeHandle(httpTransport("https://scopes.example"), scopeId, reader);
const opened = await declaredHandle(scope, issue);
if (!opened.ok) throw new Error(opened.reason);

const { signed, beside } = await opened.handle.intent(signer, "accept", { on: commitment, fields: { terms } });
const answer = await opened.handle.submit(signed, grants, beside);
```

- `declaredHandle` reads the scope's summary. It answers a handle only
  when the definition that the scope pins has the digest of the value
  given. Otherwise it answers `definition-mismatch`. So a caller that
  holds `issue` knows the scope runs exactly that definition.
- `intent` takes an act kind of the definition and what the act asks for.
  The compiler checks the kind and the fields against the definition's
  data. Before the signer is asked, each field is checked against its
  declared type, and a value that fails throws `ShapeError`.
- A detached text is given as the text. The intent holds its digest, and
  `beside` holds the text and any presented fact. Send `beside` with the
  signed intent, and send the same three again on a retry.
- The handle checks no guard, no grant and no state. The scope judges.

The package also exports `definitions`, the two declarations as a list. A
founder passes it as the `definitions` of a founding, so that a directory
which names the two digests in `create` sends retains their bytes for its
children.

## What runs today, and what does not

**Under the production wiring, nothing runs.** Both definitions list
`git-read@1`, and both use forms that need the code of `hold@1` or
`git-read@1`. No runtime in this repository has that code. The validator
reads those forms, checks them against the tables in the contract
package, and lists each in `ValidDefinition.underived`. The production
runtime then founds and creates no scope under either definition. It
answers `unsupported-definition`. The verifier answers the same at the
genesis.

That holds for the whole scope, and not only for the rows that use a
capability. The rows that use one are 3 acts and 7 handlers, with one item
type:

| Definition | Rows that need capability code |
|---|---|
| `issue` | The acts `report` and `refuse-report`. The handlers `pin-confirm`, `unpin`, `export-license` and `export-settled`. |
| `change` | The act `propose-manifest`, and the slot `pin` of `manifest`. The handlers `publication`, `export-license` and `export-settled`. |

**What is shown, and how.**

| Shown | By | Label |
|---|---|---|
| Both definitions pass the real validator whole, and are exactly their pinned bytes | `packages/lanes/test/definitions.test.ts` | Real: plain functions, no stand-in |
| For each family of forms: what the validator accepts and refuses, and what the judges derive | The `forms-*.test.ts` files of `packages/derive/test` | Real derivation, on small made-up definitions and not on the lane rows |
| The production wiring founds no scope under a definition that needs a capability record | `packages/scope/test/founding.test.ts` | Real: the object as deployed |
| What a definition does once a capability has answered | The same test, with `scriptedCapability` of `@generalbusiness/artroom-scope/testing` | A stand-in |

The scripted capability is a stand-in and is named as one wherever it is
used. It answers each capability guard and effect from a table that the
test supplies. It reads no hold, no record, no repository and no
provider. A test that uses it shows what a lane row does after a
capability has answered. It shows nothing about a real hold, a Git read, a
pin, a license or an export. The main entry of the scope package and its
Worker entry do not import it.

**What waits, and on whom.**

| Waits | On |
|---|---|
| The capability rows above: the records, guards and effects of `hold@1`, and `git-read@1` | The authority and publication delivery |
| The handlers `rules` and `publication` of `change`: their senders are a rules scope and a destination, under the names `platform:rules` and `platform:destination`, which the lane forms assume | The authority design, for the platform definitions, then the same delivery |
| The export handlers: their sender is a task scope, under the assumed name `platform:task` | The authority design and the hosted agents delivery |
| An index row that reaches a directory, and a notice that reaches an inbox | The authority and publication delivery |
| Grants: who may act under `issue.promise`, `change.merge` and the other actions | The same |
| Capacity in items, records, bytes and pending requests | The proof plan and a later delivery. Today the count is of entries only. |
| Browser pages, the command line and tools for agents | The application delivery |

No row was changed to make it pass. A row that an owner still has to
decide is in the data as the lane forms state it.

## Where things are

| Need | Read |
|---|---|
| Every row, in tables | [lanes-reference.md](lanes-reference.md) |
| The rows themselves | `packages/lanes/src` |
| The package's exports and scripts | `packages/lanes/README.md` |
| What each form means | [scopes.md](scopes.md), "Definitions are data" and "Composition" |
| The source choices behind the forms | `notes/2026-10-05-i2-contract-deltas.md` |
