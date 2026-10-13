# A lending library on dap

13 October 2026. **Proposed design, Draft 3. Design only: no source, no
test and no deployment was written or run for this note.** Baseline main
`562357458b0b3f44873efc6c21429194b60a00f7`.

This note designs a small lending library for kitchenware and tools, as a
dap application with a demo script. It lists what must be built. It does
not design the member interface beyond its requirements.

Hugh set the direction on 13 October 2026: keep it as simple as possible;
the library is filled by donations; anyone may return a lent thing; staff
may cancel any thing with an informal reason; the shelf is the room's
repository on the hosting's own Git service, published as pages; members
act through a browser interface built on the design system.

Draft 2 changes the demo script only: Nasruddin's donation of the small
pot carries the description "Baby born when the big pot was with me"
(Hugh, 13 October 2026). The definition is unchanged. Draft 3 adds
Nasruddin's spoken line at step 4 of the script.

## 1. What the library does

A member donates a thing to the library. Any member borrows a thing that
is on the shelf, and any member returns a thing that is lent. Staff
cancel a thing that is broken or lost, and write the reason in their own
words. A cancelled thing is gone for good. A new donation replaces it.

Three places hold the library:

| Place | What it holds | Who writes it |
|---|---|---|
| The lending scope | Every thing, its state, and the journal of acts. This is the authority. | The scope, when it judges a signed act. |
| The repository | One markdown page per thing, under `shelf/`. | The member interface, through the room's change lane, after an act takes effect. |
| The published site | The same pages, rendered and public. | The destination, when it publishes a change. |

## 2. The definition

One declared definition, `lending`, under the `restricted` profile,
version 1. It uses no capabilities, sends, handlers, timed rules or rule
expressions.

### Items

**`library`**: one item, opened at genesis and never changed.

- State: `open`.
- Party: `founder`, fixed, the opener that the application factory
  supplies.

The item exists because a genesis act must open an item, and the factory
supplies the opener as a field, not as a signer.

**`thing`**: many items, with at most 64 live at once. A cancelled thing
is final and no longer counts, so a donation can take its place.

- States: `available` (initial), `lent`, and `gone` (final).
- Parties: `donor`, fixed and required; `borrower`, optional.
- Values:

| Value | Type | Rule |
|---|---|---|
| `name` | text, at most 80 bytes | fixed, required |
| `description` | text, at most 1,000 bytes | fixed, required |
| `reason` | text, at most 280 bytes | optional; set by `cancel` |

### Acts

| Act | Step | Action in `grant` | Fields | Guards | Effects |
|---|---|---|---|---|---|
| `establish` | opens `library` | `lending.establish` | `opener` | none | `founder` is the opener |
| `donate` | opens `thing` | `lending.member` | `name`, `description` | none | `donor` is the signer; sets `name` and `description` |
| `borrow` | changes `thing` | `lending.member` | none | state is `available` | state `lent`; `borrower` is the signer |
| `return` | changes `thing` | `lending.member` | none | state is `lent` | state `available`; clears `borrower` |
| `cancel` | changes `thing` | `lending.staff` | `reason` | state is `available` or `lent` | state `gone`; sets `reason`; clears `borrower` |

Notes on the rules:

- `return` has no signer guard. A neighbour may bring back what another
  member borrowed.
- `cancel` belongs to staff alone. A borrower who breaks a thing tells
  staff, and staff sign the cancellation with the reason as told.
- The scope does not judge the reason or a description. Each is kept as
  the signer's text.
- A member may borrow a thing that they donated.
- No act deletes a thing or edits its name.

### Invariants and where they live

| Invariant | Where it lives |
|---|---|
| Only a thing on the shelf can be borrowed. | The `borrow` guard on state `available`. |
| Only a lent thing can be returned. | The `return` guard on state `lent`. |
| A thing that never entered the library cannot be returned. | `return` changes an existing item. With no item there is nothing to name, so nothing is signed. |
| A cancelled thing has ended. | `gone` is a final state. |
| Only staff cancel. | `cancel` names `lending.staff`; membership says who holds it. |
| The library holds a bounded number of things. | `thing.max`, which counts live items only. |

## 3. Roles

The demo has two participants.

| Participant | Role | Holds |
|---|---|---|
| The neighbour | Founder of the room, and staff | `lending.staff`, `lending.member`, and the room's own administration |
| Nasruddin | Member | `lending.member` |

Both also need the change lane's actions that the one-file edit uses
(section 4). Enrollment alone allows none of these; membership must
grant each one.

## 4. The shelf

Each thing has one page in the room's repository at
`shelf/<thing>.md`, where `<thing>` is the item's identifier as the
lending scope gives it. A page is plain markdown:

```markdown
# Big pot

A heavy copper pot. Holds eight litres.

- Status: lent to @nasruddin
- Donated by: @neighbour
- Record: lending entry <entry identifier>
```

The status line reads `available`, `lent to <member>`, or `gone:` and the
cancellation reason. The last line names the lending entry that the page
reflects, so a reader can compare the page with the record.

There is no index file. The site already answers a folder that has no
index with a list of its markdown files by title, so
`<base-url>/site/<directory>/HEAD/shelf/` lists the things.

**Who writes a page.** The member interface writes it. When a lending act
takes effect, the interface of the member who signed it submits the
thing's page through the room's existing one-file edit: a change with
one file, merged by the same member. The destination publishes the
commit and the site serves it. This is the path that `dap edit` uses
today.

**What this does and does not guarantee.** The lending act and the page
edit are two separate acts. The page can be behind the record: the
interface may close, or the edit may be refused. The page can also be
edited by hand. So the lending scope stays the authority and the shelf is
a published copy. Two things keep the copy honest:

- Each page names the entry it reflects.
- The interface offers "refresh the shelf", which rewrites any page that
  differs from the scope's current state. Any member can run it.

A separate note, *Publication from a fold*, designs the replacement in
which the lending act itself causes the page commit. This demo does not
wait for it.

**What the room must allow.** The `shelf/` paths must sit in an extent
that asks for no approval, so that a page is published on the member's
own merge.

## 5. The record

The record is the lending scope's journal: one entry for each act that
took effect, in order, with its signer. `dap log` reads it and
`dap verify` checks it by replay. It is held in the scope's storage, not
in the repository.

The repository holds a second, narrower record: one commit and one
publication receipt for each page edit.

The demo shows both: the shelf page, and the journal with the
cancellation reason in it. A refused act need not appear in the journal.
The demo shows a refusal as the answer the signer receives.

## 6. The member interface

A browser application, served apart from the published site, because
site pages run no script. It follows the design system (`brand/` and the
adopted page design) and uses the client package, as the Counter's
browser application does. This note states requirements only.

The interface must:

1. Let a person join with an invitation and keep a device key.
2. List the things with their state, read from the lending scope.
3. Let a member donate (name and description), borrow and return.
4. Let staff cancel a thing, with a reason.
5. Show a refusal in plain words, with the reason the scope gave.
6. Write the thing's shelf page after each act that takes effect, and
   offer "refresh the shelf".
7. Link to the published shelf and show the journal.

## 7. The room

The library runs in a room created with the application cohort
(`dap install --cohort application`), on the hosting's own Git service
(host `artifacts`).

The deployment's `ARTIFACTS_CONFIG` setting names one register scope. So
the service that hosts the library must have that setting point at the
library room's register, with the `ARTIFACTS` binding in place. A room
under another register on the same service has no Git host.

Provisioning, in order:

1. Plan and run the install, then claim the room as the neighbour.
2. Publish rules that leave `shelf/` open, and activate a change lane
   definition that has the one-file edit.
3. Validate the `lending` definition under the deployed bounds, and
   activate its digest in the rules scope.
4. Sign `establish-application` for it, with no genesis values beyond
   the opener.
5. Grant `lending.staff` and `lending.member` in membership, and the
   change lane actions that the edit needs.
6. Invite Nasruddin as a member.

## 8. The demo script

The story is Nasruddin and the pot.

| Step | Who       | Act                                                              | Result                                                                                         |
| ---- | --------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1    | Neighbour | `donate` "Big pot"                                               | Takes effect. The shelf shows the pot, available.                                              |
| 2    | Nasruddin | `borrow` the big pot                                             | Takes effect. The shelf shows it lent to Nasruddin.                                            |
| 3    | Nasruddin | `return` the big pot                                             | Takes effect. Available again.                                                                 |
| 4    | Nasruddin | Speaks the line below, and offers to return the small pot too. | Nothing to sign: the small pot is not a thing in the library, so `return` has no item to name. |
| 5    | Nasruddin | `donate` "Small pot", description "Baby born when the big pot was with me" | Takes effect. The record and the shelf page carry the description in Nasruddin's words. The scope does not judge it. |
| 6    | Nasruddin | `borrow` the big pot again                                       | Takes effect.                                                                                  |
| 7    | Nasruddin | Says the pot died.                                               | No act.                                                                                        |
| 8    | Neighbour | `cancel` the big pot, reason "Nasruddin says the pot died"       | Takes effect. The pot is gone; the reason is in the journal and on its page.                   |
| 9    | Neighbour | `donate` "New big pot"                                           | Takes effect. The shelf is replenished.                                                        |

Nasruddin's line at step 4, spoken in the recording and not written to
any record (text supplied by Hugh, from a traditional telling):

> "Oh," responded the Hodja. "While it was in my care your cauldron gave
> birth to a little one. Because you are the owner of the mother
> cauldron, it is only right that you should keep its baby. And in any
> event, it would not be right to separate the child from its mother at
> such a young age."

The small pot's description at step 5 stays the short text shown there.

Two refusals to show beside the story: Nasruddin signs `cancel` and is
refused for lack of `lending.staff`; a second `borrow` of a lent thing is
refused by its guard.

The point of the demo: the record holds what each person did, in order,
and the rules decide what can be done. A person's account of why is kept
as their own signed text, in a description or a reason. The scope judges
none of it: the birth and the death are recorded the same way.

## 9. What must be built

1. **The definition.** `examples/lending/`: the declaration, its
   canonical bytes and its pin, validated, with one scenario test that
   runs the demo script and its refusals against a real scope.
2. **The member interface.** A browser application that meets section 6.
3. **The room.** A provisioning runbook for section 7, run once against
   a deployed service, with what was observed.
4. **The demo script**, as a document for the recording.

## 10. Open points

These are not settled by reading the source. Each is a check for the
builder, not a design choice.

- **Edits in an application room.** The application cohort's directory
  inherits lane creation, and its destination version accepts one-file
  manifests. This was read from the definitions and has not been run.
- **Listing things.** The interface needs a read of the scope's `thing`
  items. The Counter's browser application reads its own items; the same
  read is assumed here and was not checked for a type with many items.
- **Identifiers in a path.** Whether an item identifier is fit for a
  file name as it stands, or needs a stated encoding.
- **Removing a page.** The one-file edit writes a file. This design
  never removes a page: a cancelled thing keeps its page, marked `gone`.

## 11. Out of scope

Due dates and reminders, reservations, quantities, photographs, a search
of the shelf, editing a thing after donation, and more than one library
in a room.
