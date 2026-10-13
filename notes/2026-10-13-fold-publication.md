# Publication from a fold

13 October 2026. **Proposed design, Draft 2. Design only: nothing here is
built.** One thing was run for this draft, a trial of the lending
definition of section 5 against the validator and the judges in memory;
section 5.4 says what it showed and what it did not. Baseline main
`6afbb5b53`.

This note proposes the simplest way for an application's act to put a
file in its room's repository. Today only the change lane can do that.
The first user is the lending library (`notes/2026-10-13-lending-library.md`
approved as a design by checker report `78b4b447`), whose member
interface shows each shelf page's text and does not publish it until
this is built.

Hugh set the direction on 13 October 2026: "I'd like the fold to be able
to commit this file update to the artifacts repo." He settled three
points: the act produces text output that lands at a path; any
application may write any path for now, because the change is recorded;
and the publication's base needs no new rule.

Draft 2 follows Hugh's decision of 13 October 2026, 15:48 Eastern, that
the lending library publishes its shelf this way and not by a change
made from the browser. It adds section 5, the lending library's use,
with three consequences that he accepted; it settles the open points of
Draft 1 that reading the source could settle (section 9); and it
proposes one act more than the approved lending design has (section
5.3), which needs his word.

## 1. The aim

When an act takes effect in an application scope, the same entry can
state "this text is the content of this path". The room's destination
then commits that file to the published branch and pushes it. The
commit is caused by the entry, and by nothing else.

This replaces the lending design's section 4.1, in which the browser
made a change of its own after each lending act: open a lane, propose,
merge, each step with its own kept request and recovery. Here the
browser signs one act. The page travels in it.

## 2. What exists

- **One-file publication.** The change lane's `propose-file` records a
  path, a digest, a size and up to 65,536 bytes of text. Its `merge`
  tells the destination `reserve`. The destination judges the
  publication, writes the tree with that one file and pushes it, with a
  receipt.
- **Sends in a declared definition.** An act may declare a `tell` to a
  scope held in one of its item's slots, with result clauses for
  `applied`, `refused` and `undelivered`.
- **At-most-once sending.** The operation ledger sends each recorded
  attempt at most once, across restarts, and keeps an `unknown` outcome
  as unknown.
- **The site.** The published branch is served as pages.

## 3. What is missing

1. **The destination does not admit the sender.** Its `reserve` handler
   accepts a lane whose definition is named `change`, and its fields are
   facts of that lane (`merge`, `propose-manifest`, `propose-file`). An
   application scope pins a definition of another name.
2. **An application scope does not know its destination.** The
   application factory passes the genesis fields, the directory and the
   membership. A `tell` needs the destination's reference in a slot.
3. **The outcome has no stated place.** The destination reports each
   publication to the change lane with a `publication` update. An
   application has no handler for it.

## 4. The proposal

### 4.1 A new message, `publish-file`

A new destination version adds one handler:

| Part | Value |
|---|---|
| Message | `publish-file`, class `tell` |
| From | a scope of kind `lane`, under any definition name, that the directory named as one of its applications (section 9.2) |
| Fields | `path`: text, at most 1,024 bytes. `content`: text, at most 65,536 bytes. |
| Opens | a file publication, queued, with the sender and the sending entry as its cause (section 9.2) |
| Judgment | none of the room's review rules apply; see section 6 |
| Result | the file is written at `path` on the branch head that the destination records, in one commit, and pushed, with a receipt |

The handler reuses the destination's queue, its single publication slot,
its push operation and its receipts. It adds no new Git code beyond
what the one-file manifest already uses.

The sending act declares an ordinary `tell`:

```json
{"tell": {
  "to": {"slot": "destination", "of": "also.library"},
  "message": "publish-file",
  "fields": {"path": {"field": "path"}, "content": {"field": "content"}},
  "result": {"refused": [], "undelivered": []}
}}
```

### 4.2 Where the text comes from

The act produces the text; this note adds no form that builds text. The
`path` and `content` of the send come from the send sources a definition
already has: a field of the act, a slot of an item, or a constant.

In the simplest use the signer's client writes the page text into a
field of the act, and the entry carries it to the destination. The scope
does not check that the text agrees with the item's state. What changes
is that the page and the act are one signed entry: the page cannot fall
behind, and the record shows who stated the text and when.

(The reading of "produces text output" as "any existing send source" is
the planner's. A form that renders an item's slots as text would be a
later, separate proposal.)

### 4.3 How the scope learns its destination

The application factory supplies the room's destination reference at
genesis, as it supplies `opener`. A definition that declares a genesis
field named `destination`, of type `scope` and kind `destination`,
receives the directory's own destination there. A caller cannot supply
that field, as it cannot supply `opener`. A definition without the field
is created as today.

### 4.4 The outcome

In this first version the sending scope learns only whether the message
was applied, refused or undelivered, through the `tell` result clauses.
It is not told when the push completes.

The published commit is in the destination's record and in the receipt,
which names the sending entry. A reader goes from the entry to the
commit through the receipt.

A `publication` update to the sender, with a handler the application
declares, is left for a later version.

## 5. The lending library's use

The approved lending definition has five acts and sends nothing. To
publish its shelf this way it changes as follows. The pin changes with
it, so the library's definition, tests and interface are revised once,
when this design is approved.

### 5.1 The definition

| Part | Change |
|---|---|
| `library` | A reference slot `destination`, fixed, set at genesis from the field that the factory supplies (section 4.3). |
| `thing` | A value `page`: the path of the thing's shelf page, text, fixed, set by `donate`. |
| `donate` | Two more fields: `page` and `content`. A rule and a guard on `page` (below). It tells the destination `publish-file` with the `page` and the `content`. |
| `borrow`, `return`, `cancel` | One more field, `content`. Each tells the destination `publish-file` with the thing's stored `page` and the `content`. |
| Every act but `establish` | Names the one `library` item, to read its `destination`. The library never changes, so this adds no contention. |

The guards on a donation's `page`:

- a rule, `shelf-page`, in the restricted expression language: the path
  starts with `shelf/`, ends with `.md`, and holds no `..`;
- no live thing already has that `page`.

So a lending act can write only under `shelf/`, and only the page of the
thing it is about. The wide authority of section 6 remains the
platform's; this definition does not use it.

`content` is at most 4,096 bytes. A page built from the longest name,
description and reason, each escaped, is below that.

### 5.2 Three consequences

Hugh accepted these on 13 October 2026.

1. **The scope does not check the page's text.** The signer's interface
   writes `content`, and the scope sends it as given. A member with a
   seat can sign an act whose page says something the thing's state
   does not. The record shows who stated the text, and the next honest
   act on the thing rewrites the page.
2. **A page cannot name the entry that makes it.** The text is signed
   before the entry exists. The line `Record: ... entry <seq>, hash
   <hash>` of the lending design goes. In its place the page names the
   lending scope and its incarnation, which are known. The tie from a
   commit to its entry is the destination's receipt, which names the
   sending entry.
3. **The path is not the item's number.** A donation's number is not
   known until it is recorded. The interface picks a random name,
   `shelf/<16 characters>.md`, at donation. The thing keeps it, and
   later acts cannot change it. A typed name is still never a path.

### 5.3 A sixth act, to be decided

The lending design's "refresh the shelf" rewrote any page that differed
from the scope. With publication from a fold a page is written only when
an act takes effect, so a page that is wrong, or whose push was refused,
stays so until the next act on that thing. A thing that is `gone` has no
next act.

This note proposes one act more: `publish`, on a thing in any state,
with the field `content`, allowed to `lending.member`. It changes no
state and tells the destination `publish-file` for the thing's page. It
is the repair for a page that is behind or wrong.

The approved design says "keep five acts". Hugh decides whether the
library gains this one. Without it the repair is a change to the file
made by hand, through the room's change lane.

Whether an act can be on an item in a final state was not checked. The
trial of the lending definition met the refusal `final` for an act on a
`gone` thing. If no act can be on one, `publish` covers live things, and
a gone thing's page is right or is repaired by hand.

### 5.4 What was run

One trial, in memory, with the real validator, rule evaluator and
judges, on the lending definition changed as in section 5.1. It had no
factory, no destination and no delivery: the destination reference was
made up.

- The validator accepted the definition.
- A donation with the page `README.md` was refused by the rule.
- A donation with the page `shelf/a1.md` was written. Its entry holds
  one send: a `tell` to the destination, message `publish-file`, with
  that path and the content.
- A second donation with the same page was refused by the guard.
- A `borrow` of that thing was written, and its send carried the stored
  path `shelf/a1.md` and the new content.

This shows that the declared forms can say what section 5.1 needs. It
shows nothing about the factory, the destination's handler, delivery or
a push.

### 5.5 What the browser does

One signed request for each lending act, under the custody the lending
interface already has: kept before it is sent, sent at most once,
settled afterwards only by a read. The interface builds the page text
from the state the act will leave, and sends it as `content`.

The interface shows the lending act's result as now. For the page it
shows what it can read: whether the thing's page is at the published
head. A status for the push itself waits for the later version of
section 4.4.

## 6. Authority

Any application scope may write any path. This is Hugh's decision for
now, on the ground that every such write has a recorded cause: the
sending entry, its signer, the publication and the receipt.

Consequences to state plainly in the documentation:

- An application can overwrite a file in an extent that asks for
  approval when a person changes it, including the rules extent's
  files. The room's review rules do not govern `publish-file`.
- The control is at activation: only a member who holds `rules.activate`
  puts a definition in force, and only a member who holds
  `application.establish` creates a scope under it. A room that does not
  trust a definition does not activate it.

One check is not waived: the destination must accept `publish-file` only
from a scope of its own room. Section 9.2 proposes how.

## 7. What it guarantees

- A file commit made this way is caused by exactly one recorded entry.
- Each recorded attempt is sent at most once. A lost answer leaves the
  outcome `unknown`; nothing is sent again without a new entry.
- The act takes effect first and the push follows, so the published
  page is behind the record by the time of one push. Pushes queue: the
  destination holds one publication at a time.
- It does not guarantee that the text agrees with the scope's state
  (section 4.2), and it does not make the act wait for the push.

## 8. Versions and limits

- A new destination version, a new directory version and an application
  cohort that pins them (section 9.2, point 4). Rooms and scopes that
  exist keep the versions they pinned.
- No change to the `restricted` profile or to the declared forms.
- One file of at most 65,536 bytes of UTF-8 text for each send.
- The destination refuses a new publication while 64 receipts are owed
  (`receipts-owed`). An application that sends a file on every act
  meets this bound under a burst; the act's `refused` clause is where it
  shows.
- A send counts toward the sends of one entry.

## 9. What the source says, and what is still open

Draft 1 listed five open points. The source was read for this draft, at
main `6afbb5b53`, and the lines are named so that a reviewer can check
them. Nothing here was run except the trial of section 5.4.

### 9.1 Settled by reading

1. **Sender in the same room: no check exists today.** The `reserve`
   handler (`packages/platform/src/destination.ts`, from line 366) has
   three guards: the operation fact is in the sender's own scope, no
   publication exists for it, and fewer than 65 receipts are owed. None
   compares the sender with the destination's directory, though the
   `branch` item holds that directory. The later judgment of the
   reservation was not traced. So `publish-file` cannot copy a check
   from `reserve`; it needs its own (section 9.2, point 1).
2. **Names: a declared definition may be named `change`.** A handler's
   `from.under` is compared with the name that the sender's pinned
   definition states (`packages/derive/src/handlers.ts`, line 54;
   `packages/scope/src/namespace.ts`, `nameUnder`). The validator
   refuses only a declared name that begins with `platform:`
   (`packages/derive/src/validate/index.ts`, line 166). Neither the
   rules scope's `activate` nor the application factory refuses the
   name `change`. With point 1 this means an application under a
   declared definition named `change` meets the `from` test of
   `reserve`. Whether it can go further was not traced. This stands
   apart from this proposal and is filed for the builder as a security
   finding of its own.
3. **Admission of the send.** The factory refuses a definition that
   uses a capability, and nothing else of this kind
   (`packages/platform/src/application.ts`, line 91). Its closure of
   dependencies follows `create` sends and passes over a `tell`
   (`packages/platform/src/definition-input.ts`, lines 45 to 50). The
   validator accepted the definition of section 5.1 in the trial. No
   existing test establishes an application that tells. So nothing
   found refuses it, and no run has shown it.
4. **The operation's fact type.** `publication.operation` admits only a
   `merge` entry under a definition named `change`
   (`destination.ts`, line 123). A fact type names one definition, so
   it cannot name "the sending entry of any application".
5. **The factory and the destination's reference.** `opener` is the one
   reserved genesis field (`application.ts`, line 16). The directory's
   `repository` item holds the room's `destination` reference, and the
   path that opens a change already reads it (`directory.ts`, line
   748). The factory does not read it today.
6. **Versions.** The application cohort pins `platform:destination@2`.
   The default cohort pins `@3`.

### 9.2 Proposed answers, for the review

1. **Same room.** The directory tells the destination of each
   application it creates, and the destination keeps one small item for
   each. `publish-file` is accepted only from a scope that such an item
   names. This uses declared forms only, and the destination trusts its
   own directory, as its `import` and `compromised` handlers already do
   by comparing the sender with `branch.directory`. The item type's
   bound is the most applications a room may have that publish.
2. **The cause.** A file publication records its cause as the sender's
   scope reference with the sending entry's number and hash, read from
   the verified source entry. It does not reuse the `operation` slot. A
   separate item type for file publications, beside `publication`,
   keeps the change lane's types as they are.
3. **The factory.** `destination` joins `opener` as a reserved genesis
   field: a caller cannot supply it, and the factory injects the
   repository's destination when the genesis act declares a field of
   that name with type `scope` and kind `destination`.
4. **Versions.** One new destination version with the handler and the
   two item types; one new directory version whose factory injects the
   reference and tells the destination of each application; and an
   application cohort that pins both. Rooms that exist keep what they
   pinned. The lending room is created under the new cohort.

### 9.3 Still open

- **The queue.** The destination holds one publication at a time. Where
  a file publication waits behind a change's publication, and the
  reverse, was not designed. The first version may share the one slot.
- **A push that fails for good.** The sender is not told (section 4.4).
  The page stays behind until the next act, or `publish` (section 5.3).
- **Removing a file.** Not proposed.
- **An act on a final item**, for section 5.3.

## 10. Witnesses a builder would owe

- A real application scope whose act sends `publish-file`; the commit,
  the receipt naming the entry, and the page served by the site.
- The refusals: a sender outside the room; text over the bound; 65
  receipts owed.
- A restart between the entry and the push, showing one push.
- The refusal of a scope that the directory did not name as one of its
  applications, including an application of another room.
- The lending library with its pages written this way: the story of the
  lending design, each page at the published head after its act, the
  rule's refusal of a path outside `shelf/`, and a lost reply to a
  lending act that leaves one entry and one commit.

## 11. Out of scope

Rendering text from item state; more than one file in a send; binary
files; path rules for applications; telling the sender when the push
completes.
