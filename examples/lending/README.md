# The lending library

A small lending library for kitchenware and tools, as one declared dap
definition. The design is
[notes/2026-10-13-lending-library.md](../../notes/2026-10-13-lending-library.md).

This directory holds the definition, the shelf page, and the member
interface: its model, request custody, gateway, joining, storage and
screens. The Worker serves the interface at `/lending/`.

**The screens and the browser storage have not been run in a browser.**
They typecheck and bundle. Everything beneath them (the model, the
custody, the gateway and joining) is tested, on real scopes where that
matters. Not built yet: publishing a shelf page (the interface shows each
page's text and says it is not published), the room's runbook, the
online room and the homepage page.

## What is here

| File | What it is |
|---|---|
| `definition.ts` | The `lending` definition: a `library` item and many `thing` items; the acts `establish`, `donate`, `borrow`, `return` and `cancel`. |
| `definition.json` | Its canonical bytes. |
| `pin.ts` | The digest of those bytes, `LENDING_DEFINITION`. |
| `scripts/pin.mjs` | Writes `definition.json` and `pin.ts` from `definition.ts`. Run it after any change to the definition. |
| `shelf.ts` | The shelf page of one thing as markdown, with members' text made literal; and every thing, live or gone, read from the record. |
| `browser/model.ts` | What the member interface shows and may ask for: the view of one read, the act to sign, and a refusal in plain words. |
| `browser/custody.ts` | Custody of one lending request: kept before it is sent, sent at most once, settled afterwards only by a read. |
| `browser/client.ts` | The gateway: one coherent read of the scope (summary, head and record), and `act`, `check`, `resume` and `abandon` over that custody. |
| `browser/join.ts` | Joining with an invitation link under a device key that WebCrypto holds, with the same custody; and finding the room's lending scope in its directory. |
| `browser/storage.ts` | This origin's private storage: the device key, the seat, and the kept requests, in IndexedDB under a Web Lock. |
| `browser/main.ts`, `index.html`, `style.css` | The screens: join, the shelf, donate, borrow, return, cancel, the kept request, each page's text, and the record. |
| `scripts/assets.mjs` | Bundles the interface into `browser-build/` and into the Worker module `packages/scope/src/lending-assets.ts`. Run it after any change to the browser code. The Worker serves it at `/lending/`. |
| `demo-script.md` | The script for the recording. |
| `definition.test.ts` | Plain-function tests: the bytes and the pin, the story of Nasruddin and the pot, and the bounds. Grants are scripted. |

The scenario on real scopes is
`packages/scope/test/lending.test.ts`. It installs the application cohort
with the command line, invites two members, activates the pin, establishes
the application, grants the roles, and plays the story with its refusals.
Its Git host and clock are stand-ins.

The same scenario then drives the gateway against those scopes: an act
that takes effect, a refusal in plain words, and a lost reply. After the
lost reply the request is kept, no second act is signed, it is not sent
again, and after a reload a read settles it as recorded. The library
gains one thing, not two. The gateway's private store and lock are
in-memory stand-ins for the browser's.

The scenario also joins a visitor from an invitation link, under the
application cohort's membership (`platform:membership@4`), with a device
key that WebCrypto holds. The reply to the join is lost: the join is
kept, a second use of the invitation signs nothing, and a read settles
the original. The visitor's device then finds the lending scope in the
directory and donates as `@visitor`. Two facts from this: a join can be
settled with no session, but reading its recorded entry needs one, which
the room gives the new member's key. Membership's record gained one
more entry when the device asked for that session; the test did not
look at what the entry was.

The Counter's request journal could not be reused as it stands: it accepts
only the counting definition's acts. `browser/custody.ts` is a smaller
custody with the same rules. One shared module for both applications
would be better, and is left to the builder.

## The rules in brief

- Any member donates a thing, borrows a thing that is available, and
  returns a thing that is lent. The member who returns it need not be the
  borrower.
- Only staff cancel a thing, with a reason in their own words. A cancelled
  thing is `gone`, which is final.
- The library holds at most 64 live things. A thing that is gone does not
  count.
- The definition uses no rule expression, send, handler, deadline or
  capability.

## What the tests found

Three facts that the interface and the runbook need:

- A thing that is gone leaves the scope's summary, which lists live items
  only. `shelf.ts` reads its end and its reason from the record: the
  `cancel` entry names the thing and carries the reason. The client
  package also has a read of a type's retained final items
  (`ScopeHandle.items`); it was not tried here.
- The lending scope's journal has two entries before the first act: its
  genesis, and the directory's confirmation of the creation. So the first
  donated thing is item 2.
- After `set-actions`, the scenario advances its clock by 301 seconds
  before the first lending act, as the existing application test does, so
  that the earlier grant's reuse window has ended. A shorter wait was not
  tried. A runbook must allow for that window.

## Run the tests

```
npx vitest run --project lending
npx vitest run --project scope packages/scope/test/lending.test.ts
```
