# @generalbusiness/artroom-lanes

Artroom's two lane definitions, `issue` and `change`, as data. A lane is a
definition: this package holds no rule and no code that judges.

The design note "Lane forms and browser flow", revision 14, at `4b3bf5da`,
is the authority for every row: its sections 3, 4 and 8.1. Each member of
a definition is one row of that note, written as the row states it. Where
the note or the scope contract was silent,
`notes/2026-10-05-i2-contract-deltas.md` records what was implemented, in
its sections 6, 14 and 17.

[docs/lanes.md](../../docs/lanes.md) is the guide: what the definitions
are, how to read a row, and what runs today.
[docs/lanes-reference.md](../../docs/lanes-reference.md) lists every row.

No platform package depends on this one or imports from it.
`scripts/active-source.test.mjs` checks that. This package depends on the
contract package's types. Its tests and scripts also use `bytes`,
`derive`, `client`, `scope` and `replay`.

## What it exports

| Export | Holds |
|---|---|
| `issue`, `change` | The two definitions. Each is a value of the contract's `DeclaredDefinition`, written `as const`, so a client's declared handle is typed from its rows. |
| `DIGESTS` | The pinned definition digest of each. |
| `issueDemo`, `changeDemo`, `DEMO_DIGESTS` | The demo profile and its pinned digests. |
| `LANE_FORMS` | The revision and the commit of the lane forms that the rows were written from. |
| `definitions` | Both declarations as a list. A founder supplies it as the `definitions` of a founding, so that a directory which names the two digests in `create` sends retains their bytes for its children. |
| `LaneDefinition` | The type each value is checked against. |
| `./definitions/issue.json`, `./definitions/change.json` | The canonical bytes of each definition, by path. The main entry reads no file. |

## The files

| File | Holds |
|---|---|
| `src/issue.ts`, `src/change.ts` | The two values. One member is one row. A comment names the section of the lane forms that a group of rows comes from. |
| `src/shared.ts` | The rows that the lane forms state once for both definitions, and that differ only by a grant's prefix or by the definition's name: the `hold` and `export` item types, six discussion acts, three acts on a hold or an export, the timed rule `hold-end`, and the two export handlers. |
| `src/demo.ts` | The demo profile: `issueDemo` and `changeDemo`, each its full definition with a subset of its acts and handlers, under the same name. |
| `src/digests.ts` | `DIGESTS`, `DEMO_DIGESTS` and `LANE_FORMS`. `scripts/pin.mjs` writes it. |
| `definitions/*.json` | The canonical bytes, of the two definitions and of the two of the demo profile. `scripts/pin.mjs` writes them. |
| `scripts/pin.mjs` | Writes the four byte files and `src/digests.ts` from the values. |
| `scripts/reference.mjs` | Writes `docs/lanes-reference.md` from the values. With `--check` it writes nothing and exits 1 when the file is stale. |
| `test/definitions.test.ts` | Four plain tests: the pins, with the generated reference; the counts against the bounds; validation of both definitions whole; and the demo profile's pins, its strict subset of rows and its validation. |
| `test/*.scope.test.ts` | Eleven scenarios on real scopes under the two pinned digests, T1 to T9 and T34, on the fixture `graph.ts`; five, W1 to W5 (`wiring.scope.test.ts`), and plan 019's story on the demo profile (`story.scope.test.ts`), on a room of real platform scopes (`room.ts`). In the workerd test pool. Each names the stand-ins it uses. |
| `test/support/graph.ts`, `room.ts`, `worker.ts` | The fixture of the scenarios; a room founded on the real platform scopes in the namespace `PLATFORM`, whose real directory creates the lanes; and the test Worker, which is the scope package's `./testing/worker`. |
| `vitest.scope.config.ts`, `wrangler.test.jsonc` | The configuration that runs the scenarios alone. From the root they run inside the `scope` project. Nothing is deployed from either file. |

## Changing a row

A changed row is a new definition with a new digest. A scope that pinned
the earlier digest keeps it. The rows follow the lane forms: change a row
only when an adopted revision of that note changes it, and then set
`LANE_FORMS` in `src/digests.ts` to the new revision and commit. The rows
that `src/change.ts` marks "i5 wiring" are the exception: they are what the
lane needs to run against the real rules scope and destination, and no
adopted revision states them yet
(`notes/2026-10-07-i5-lane-wiring-delivery.md`).

```
node packages/lanes/scripts/pin.mjs
node packages/lanes/scripts/reference.mjs
```

`test/definitions.test.ts` fails while the byte files or the digests are
not the ones `pin.mjs` writes. If the validator refuses a row as the lane
forms state it, do not change the row to pass. Record the refusal and
return it to the owner of the lane forms.

## What runs, and what does not

Both definitions use forms that need the code of the capabilities `hold@1`
and `git-read@1`. The derive package holds that code as pure functions,
and the production ports hold it. The validator lists those forms in `ValidDefinition.underived`, and the test
asserts the list, and that the code has each form. So a scope can be
founded or created under either digest. With only the production defaults
it admits no act and no step, because that authority reads no grant. The
deployed class reads a lane's grants from the membership scope that the
lane records, and no test runs a lane there yet
([docs/lanes.md](../../docs/lanes.md)). A runtime
that lacks the code answers `unsupported-definition`. The scenarios T3, T4
and T5b run on the code itself, with a stand-in for the Git host. The
others use a scripted capability, which is a stand-in.
[docs/lanes.md](../../docs/lanes.md) lists what they show and
the rows that cannot run yet.

## How to test

```
npm test --workspace @generalbusiness/artroom-lanes
npm run typecheck --workspace @generalbusiness/artroom-lanes
```
