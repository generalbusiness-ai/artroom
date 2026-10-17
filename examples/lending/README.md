# The lending library

The lending library, dap-library, is an application built on dap. Members
donate kitchenware and tools, borrow them and return them, and staff
remove a thing that is lost or broken. It is one declared dap definition,
`lending`. The design is
[notes/2026-10-13-lending-library.md](../../notes/2026-10-13-lending-library.md).

This directory holds the definition, the shelf page, and the member
interface: its model, request custody, gateway, joining, storage and
screens. The Worker serves the interface at `/lending/`.

The fresh final service is online at
[the member interface](https://dap-library-publication-final-1014.inguz.workers.dev/lending/).
Its final Library completed the approved seven-act story in an automated
browser run. The Small pot description is exactly "Baby born when the big
pot was with me", and cancellation records "Nasruddin says the pot died".
Each step has its own written destination receipt and anonymous immutable
page. The original clone and extraction verified actual commits, parents, page
blobs, and receipt bytes. The curated public history is published at commit
`14401f8bd851ce525ac1526ed57d2bceaf36d360`; its index, raw companions,
and current shelf pages passed anonymous readback. Homepage publication
`89750` and the original gate at `f33a7d7f` completed. The
[completion note](../../notes/implementation/2026-10-14-library-publication-completion.md)
keeps that gate separate from the later MCP composition. The journal and
staff-control follow-up still awaits its own validation, gate, and deployment.
These are machine-operated browser profiles, not a human or separate
physical-device acceptance test.

Later [local interface checks](../../notes/implementation/2026-10-17-lending-refused-drafts.md)
use the real renderer with scripted gateway, membership, storage and
publication ports. They show draft retention and handle presentation;
they add no hosted, native authority or physical-device evidence.

The earlier publication rehearsal remains at its original service. It
completed mechanically, but its Small pot description differed from the
approved script. Its browser, publication, and Git extraction evidence remains
real rehearsal evidence, not final-room acceptance. The [runbook](runbook.md)
preserves both earlier rehearsals and records the current provisioning.

Each act that changes a thing also publishes that thing's shelf page.
The member's interface writes the page's text, the act carries it, and
the library tells its destination to publish it at the thing's path,
`shelf/<16 characters>.md`. The design is
[notes/2026-10-13-fold-publication.md](../../notes/2026-10-13-fold-publication.md).
The scope does not check a page's text against the thing; the journal
shows who stated it, and the next act on the thing rewrites the page.

[Build a lending library](../../docs/build-a-lending-library.md) is the
planner's four-step tutorial for the first definition without publication.

The older member interface remains at
<https://dap-lending.inguz.workers.dev/lending/>. The homepage
[Library page](https://dap.generalbusiness.ai/library/) previously linked that
rehearsal. Its four Library links now target the final service and its
verified shelf and public-history routes. Original Home publication `89750`
verified those links and all 13 static readbacks. The updated member
interface reads the signer's active seat and its
role's actions from membership. It offers the reason box and **Cancel this
thing** only when those actions include `lending.staff`. The control stays
hidden while the actions are loading or cannot be read. The native scope
still refuses a nonstaff cancellation as `unauthorized`, including when a
previously observed staff role has changed.

## What is here

| File | What it is |
|---|---|
| `definition.ts` | The `lending` definition: a `library` item that holds the destination and many `thing` items; `publish` refreshes a thing's page without changing it. |
| `definition.json` | The canonical declaration with an authoring LF; remove that LF before `--value`. |
| `pin.ts` | The digest of those bytes, `LENDING_DEFINITION`. |
| `scripts/pin.mjs` | Writes `definition.json` and `pin.ts` from `definition.ts`. Run it after any change to the definition. |
| `shelf.ts` | The shelf page of one thing as markdown, with members' text made literal; and every thing, live or gone, read from the journal. |
| `browser/publication.ts` | Reads a published page and compares its visible text with the page the journal implies, at one observed commit. |
| `test-support.ts` | The in-memory scope, rules and stand-in destination that `definition.test.ts` uses. |
| `browser/model.ts` | What the member interface shows and may ask for: the view of one read, the act to sign, and a refusal in plain words. |
| `browser/custody.ts` | Custody of one lending request: kept before it is sent, sent at most once, settled afterwards only by a read. |
| `browser/client.ts` | The gateway: one coherent read of the scope (summary, head and journal), and `act`, `check`, `resume` and `abandon` over that custody. |
| `browser/join.ts` | Joining with an invitation link under a device key that WebCrypto holds, with the same custody; and finding the room's lending scope in its directory. |
| `browser/storage.ts` | This origin's private storage: the device key, the seat (this member's item in membership), and the kept requests, in IndexedDB under a Web Lock. |
| `browser/main.ts`, `index.html`, `style.css` | The screens: join, the shelf, donate, borrow, return, cancel, the kept request, each page's text, and the journal. |
| `scripts/assets.mjs` | Bundles the interface into `browser-build/` and into the Worker module `examples/lending/worker/assets.ts`. Run it after any change to the browser code. The Worker serves it at `/lending/`. |
| `browser/model.test.ts`, `browser/custody.test.ts`, `browser/publication.test.ts`, `browser/storage.browser.test.ts` | Tests of the model, the custody, the published-page comparison, and the browser storage. |
| `runbook.md` | Current publication-room provisioning, preserved rehearsal, and incomplete six-output observation ledger. |
| `demo-script.md` | The script for the recording. |
| `definition.test.ts` | Plain-function tests: the bytes and the pin, the story of Nasruddin and the pot with the page each act sends, shelf paths, and the bounds. Grants are scripted. |
| `shelf.test.ts` | Tests of the shelf page: members' text made literal, and things that are gone read from the journal. |

The scenario on real scopes is
`packages/scope/test/lending.test.ts`. It installs the application-publication cohort
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
room's membership (`platform:membership@4`), with a device
key that WebCrypto holds. The reply to the join is lost: the join is
kept, a second use of the invitation signs nothing, and a read settles
the original. The visitor's device then finds the lending scope in the
directory and donates as `@visitor`. Two facts from this: a join can be
settled with no session, but reading its recorded entry needs one, which
the room gives the new member's key. Membership's journal gained one
more entry when the device asked for that session; the test did not
look at what the entry was.

**Check** submits no new lending or join act. Reading a recorded result
may first authenticate a read session, which signs and sends a session
request. A post-join membership read confirms the device's active handle
before the interface displays it as confirmed.

The Counter's request journal could not be reused as it stands: it accepts
only the counting definition's acts. `browser/custody.ts` is a smaller
custody with the same rules. One shared module for both applications
would be better, and is left to the builder.

## The application rules in brief

- Any member donates a thing, borrows a thing that is available, and
  returns a thing that is lent. The member who returns it need not be the
  borrower.
- Only staff cancel a thing, with a reason in their own words. A cancelled
  thing is `gone`, which is final.
- The library holds at most 64 live things. A thing that is gone does not
  count, but its page and path stay with it.
- A path starts with `shelf/`, contains 16 characters, and ends with `.md`.
  It belongs to one thing for good; the rule expression `shelf-page` checks its form.
- Donate, borrow, return, and cancel include bounded signed shelf text and
  send it to the room's fixed destination. `publish` can refresh a thing's
  page, including a gone thing, without changing that thing.
- The destination binds the publication to its actual source fact and send
  ordinal. The source signer supplies the text; the scope does not judge
  whether that text describes the thing truthfully.
- An act taking effect and an observed immutable publication are separate.
  A lost reply keeps the original request for **Check** or **Continue**.

## What the tests found

Three facts that the interface and the runbook need:

- A thing that is gone leaves the scope's summary, which lists live items
  only. `shelf.ts` reads its end and its reason from the journal: the
  `cancel` entry names the thing and carries the reason. The client
  package also has a read of a type's retained final items
  (`ScopeHandle.items`); it was not tried here.
- The lending scope's journal has two entries before the first act: its
  genesis, and the directory's confirmation of the creation. So the first
  donated thing is item 2.
- After `set-actions`, the scenario advances its clock by 301 seconds
  before the first lending act, as the existing application test does, so
  that the earlier grant's reuse window has ended. In the deployed
  rehearsal the first lending act took effect 124 seconds after the
  grants, with no wait. That is one observation, not a bound: a runbook
  must still allow for the window.

## Run the tests

```
npx vitest run --project lending
npx vitest run --project scope packages/scope/test/lending.test.ts
```
