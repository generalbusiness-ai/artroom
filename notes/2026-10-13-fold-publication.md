# Publication from a fold

13 October 2026. **Proposed design, Draft 1. Design only: no source, no
test and no deployment was written or run for this note.** Baseline main
`562357458b0b3f44873efc6c21429194b60a00f7`.

This note proposes the simplest way for an application's act to put a
file in its room's repository. Today only the change lane can do that.
The first user is the lending library (`notes/2026-10-13-lending-library.md`
on branch `planner/lending-library-design`), whose shelf pages are
written by its member interface until this is built.

Hugh set the direction on 13 October 2026: "I'd like the fold to be able
to commit this file update to the artifacts repo." He settled three
points: the act produces text output that lands at a path; any
application may write any path for now, because the change is recorded;
and the publication's base needs no new rule.

## 1. The aim

When an act takes effect in an application scope, the same entry can
state "this text is the content of this path". The room's destination
then commits that file to the published branch and pushes it. The
commit is caused by the entry, and by nothing else.

This closes the gap that the lending library's shelf has: there, the
lending act and the page edit are two acts, and the page can fall behind
the record or differ from it.

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
| From | a scope of kind `lane`, under any definition name |
| Fields | `path`: text, at most 1,024 bytes. `content`: text, at most 65,536 bytes. |
| Opens | a `publication`, queued, with the sender as its `lane` and the sending entry as its `operation` |
| Judgment | none of the room's review rules apply; see section 5 |
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

## 5. Authority

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
from a scope of its own room. Section 8 lists it as an open point.

## 6. What it guarantees

- A file commit made this way is caused by exactly one recorded entry.
- Each recorded attempt is sent at most once. A lost answer leaves the
  outcome `unknown`; nothing is sent again without a new entry.
- The act takes effect first and the push follows, so the published
  page is behind the record by the time of one push. Pushes queue: the
  destination holds one publication at a time.
- It does not guarantee that the text agrees with the scope's state
  (section 4.2), and it does not make the act wait for the push.

## 7. Versions and limits

- A new destination version, and a new application cohort that pins it,
  with a new factory version for section 4.3. Rooms and scopes that
  exist keep the versions they pinned.
- No change to the `restricted` profile or to the declared forms.
- One file of at most 65,536 bytes of UTF-8 text for each send.
- The destination refuses a new publication while 64 receipts are owed
  (`receipts-owed`). An application that sends a file on every act
  meets this bound under a burst; the act's `refused` clause is where it
  shows.
- A send counts toward the sends of one entry.

## 8. Open points

Each of these is to be settled before a builder request is filed.

1. **Sender in the same room.** How the destination confirms today that
   a sending lane belongs to its room was not traced. The handler needs
   that check for an application scope, which the directory records as
   an `application` item.
2. **Names.** A handler's `from.under` is compared with the name that the
   sender's definition states. Whether the application factory refuses a
   declared definition named `change`, or any platform name, was not
   checked. If it does not, an application could present itself to the
   existing `reserve` handler. This should be checked whether or not
   this proposal is adopted.
3. **Admission of the send.** The application factory refuses a
   definition that uses a capability. A `tell` uses none, but whether the
   validator and the factory admit a declared definition that tells a
   platform destination was not run.
4. **The operation's fact type.** The destination's publication names
   its `operation` as a `merge` fact of the change lane. The new handler
   needs a type that admits the sending entry of any definition.
5. **Removing a file.** Not proposed. A later field could state it.

## 9. Witnesses a builder would owe

- A real application scope whose act sends `publish-file`; the commit,
  the receipt naming the entry, and the page served by the site.
- The refusals: a sender outside the room; text over the bound; 65
  receipts owed.
- A restart between the entry and the push, showing one push.
- The lending library with its page written this way, replacing the
  interface's edit.

## 10. Out of scope

Rendering text from item state; more than one file in a send; binary
files; path rules for applications; telling the sender when the push
completes.
