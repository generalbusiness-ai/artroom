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
contract package's types. Its tests and scripts also use `bytes` and
`derive`.

## What it exports

| Export | Holds |
|---|---|
| `issue`, `change` | The two definitions. Each is a value of the contract's `DeclaredDefinition`, written `as const`, so a client's declared handle is typed from its rows. |
| `DIGESTS` | The pinned definition digest of each. |
| `LANE_FORMS` | The revision and the commit of the lane forms that the rows were written from. |
| `definitions` | Both declarations as a list. A founder supplies it as the `definitions` of a founding, so that a directory which names the two digests in `create` sends retains their bytes for its children. |
| `LaneDefinition` | The type each value is checked against. |
| `./definitions/issue.json`, `./definitions/change.json` | The canonical bytes of each definition, by path. The main entry reads no file. |

## The files

| File | Holds |
|---|---|
| `src/issue.ts`, `src/change.ts` | The two values. One member is one row. A comment names the section of the lane forms that a group of rows comes from. |
| `src/shared.ts` | The rows that the lane forms state once for both definitions, and that differ only by a grant's prefix or by the definition's name: the `hold` and `export` item types, six discussion acts, three acts on a hold or an export, the timed rule `hold-end`, and the two export handlers. |
| `src/digests.ts` | `DIGESTS` and `LANE_FORMS`. `scripts/pin.mjs` writes it. |
| `definitions/*.json` | The canonical bytes. `scripts/pin.mjs` writes them. |
| `scripts/pin.mjs` | Writes the two byte files and `src/digests.ts` from the values. |
| `scripts/reference.mjs` | Writes `docs/lanes-reference.md` from the values. With `--check` it writes nothing and exits 1 when the file is stale. |
| `test/definitions.test.ts` | Three plain tests: the pins, the counts against the bounds, and validation of both definitions whole. |

## Changing a row

A changed row is a new definition with a new digest. A scope that pinned
the earlier digest keeps it. The rows follow the lane forms: change a row
only when an adopted revision of that note changes it, and then set
`LANE_FORMS` in `src/digests.ts` to the new revision and commit.

```
node packages/lanes/scripts/pin.mjs
node packages/lanes/scripts/reference.mjs
```

`test/definitions.test.ts` fails while the byte files or the digests are
not the ones `pin.mjs` writes. If the validator refuses a row as the lane
forms state it, do not change the row to pass. Record the refusal and
return it to the owner of the lane forms.

## What does not run

Both definitions use forms that need the code of the capabilities `hold@1`
and `git-read@1`. No runtime in this repository has that code. The
validator lists those forms in `ValidDefinition.underived`, and the test
asserts the list. Under the production wiring a scope is not founded or
created under either digest: `unsupported-definition`.

## How to test

```
npm test --workspace @generalbusiness/artroom-lanes
npm run typecheck --workspace @generalbusiness/artroom-lanes
```
