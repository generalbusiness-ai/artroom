# The lending library

A small lending library for kitchenware and tools, as one declared dap
definition. The design is
[notes/2026-10-13-lending-library.md](../../notes/2026-10-13-lending-library.md).

This directory holds the first part of that design: the definition and its
tests. The member interface, the shelf pages, the room and the online demo
are not built yet.

## What is here

| File | What it is |
|---|---|
| `definition.ts` | The `lending` definition: a `library` item and many `thing` items; the acts `establish`, `donate`, `borrow`, `return` and `cancel`. |
| `definition.json` | Its canonical bytes. |
| `pin.ts` | The digest of those bytes, `LENDING_DEFINITION`. |
| `scripts/pin.mjs` | Writes `definition.json` and `pin.ts` from `definition.ts`. Run it after any change to the definition. |
| `definition.test.ts` | Plain-function tests: the bytes and the pin, the story of Nasruddin and the pot, and the bounds. Grants are scripted. |

The scenario on real scopes is
`packages/scope/test/lending.test.ts`. It installs the application cohort
with the command line, invites two members, activates the pin, establishes
the application, grants the roles, and plays the story with its refusals.
Its Git host and clock are stand-ins.

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
  only. Its end and its reason are read from the record: the `cancel`
  entry names the thing and carries the reason.
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
