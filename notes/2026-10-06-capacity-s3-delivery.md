# Capacity S3: declared openings in settling closures

This partial source milestone belongs to request
`b1593dc72c6ff999b525b2d26cdb435c88802630` and producer promise
`a1256c14f5d2576af0acbf6fe147ae2087ee2958`.

It is prepared in `capacity-form-openings`, branch
`request/capacity-form-openings`, from fixed S2 candidate
`1b71985348f1e78cd955156870f495e7a78584a5`. That isolated preparation was
authorized while S2 acceptance was pending. This note grants no acceptance
of S2 or S3. Root reconciled the branch with receiving main
`6be14650db44d24339f2ed91ed4eddf272d4199e` after S2's normal approval
`0077a079609085f6583a614f712769534b6643d8` and terminal landing receipt
`f0db523e4819ecbb8b37568803e519dfcfcca5ec`. That main retains S1, S2,
the task map and their reports. The separate guide work remains protected;
no guide content is rolled back. The rebase changes no tested source bytes.
No competing merge was started.

## Source change

A written form may open its primary item while settling an existing `also`
subject. Its initial-state duties were already counted, but the opening's
one future item was lost. A `relate` handler may also create its first
relationship copy while settling an existing item. That one possible new
record was absent from the known closure.

The validator now retains the declared primary opening and possible first
copy in `Duties`. These are derived from existing forms, not new definition
members, producer declarations or wire data. The same `entryFor(form)`
contribution supplies both the state/copy and marker bases of S2's shared
Amount calculation. Each opening unit is included once, beside the duties
already counted for the primary item's possible states.

- An open act reserves at most one primary item. A handler declaring
  `opens` may create one or reuse an existing singleton; one is its static
  maximum, not a claim that every delivery creates it.
- A relate handler settling an item may receive a first relationship key,
  so its base includes at most one new record.
- A handler settling its own copy requires that key to exist already. Its
  update reserves no new record for that key.
- Ordinary state and slot changes on existing subjects create neither an
  item nor a relationship key.

No item/record traversal was added. Alternatives still take the
componentwise maximum, separate duties still sum, and completed marks
remain excluded. Scalar entry APIs still project that calculation. Bound
decisions have no declared primary opening; their downstream duties retain
their own amounts without adding the holder's separately owned sends.

The exact changed frontier is:

- `notes/2026-10-06-capacity-s3-delivery.md` (primary delivery note)
- `packages/derive/src/validate/context.ts`
- `packages/derive/src/validate/handlers.ts`
- `packages/derive/src/validate/capacity.ts`
- `packages/derive/src/validate/markers.ts`
- `packages/derive/test/forms-settles.test.ts`

No guide path is changed: its existing description of known terms with
remaining incomplete components remains true. Fixed S2 and the separate
guide branches are unchanged.

## Witness and producer checks

The existing canonical holder fixture is strengthened, not duplicated.
Its larger mark-`a` act opens a final ordinary result item and sends the
existing request. Its shorter relate-handler alternative may create a
first copy. Thus the largest item/request/entry amounts and the largest
record amount come from different alternatives of the same duty.

| Amount | Items | Records | Future requests | Byte units at `entryBytes` |
|---|---:|---:|---:|---:|
| `itm` | 2 | 1 | 1 | 7 |
| `req` | 1 | 1 | 2 | 10 |
| `pulse` | 2 | 2 | 2 | 16 |
| `spawn` | 4 | 2 | 2 | 16 |
| Root holder | 5 | 4 | 5 | 33 |

S2's entry expectations stay `6 / 8 / 14 / 14`, with `28` for the root
holder. Its request and byte assertions remain unchanged. These are
authored fixture counts and current byte stand-ins, not deployment budgets,
measurements or exact canonical retained sizes.

Completing mark `a` removes both its future item and record terms. Existing
state/slot forms retain zero opening contributions. A finite variant of
the same fixture settles its own copy while opening a result: it derives
one entry, one possible item and zero new records. S1's bridge-cycle
refusal, positive finite path and completed-mark controls continue to pass.

One intended control removes the shared opening contribution. Its item /
record pairs become `1/0, 0/0, 0/0, 2/0, 1/0` rather than
`2/1, 1/1, 2/2, 4/2, 5/4`. The intended paired assertion fails while the
entry/request/byte assertions remain unchanged. The control reports
`DISTINGUISHES`; the source is restored. No unrelated-error credit.

Focused commands:

```sh
npm test --workspace @generalbusiness/artroom-derive -- forms-holds forms-binding forms-final-holder forms-settles compose validate timed
npm run typecheck --workspace @generalbusiness/artroom-derive
```

Seven focused files and 155 tests pass; derive source/test typechecking
passes. The control uses `scripts/control.mjs` on the shared `entryFor`
expression in `validate/capacity.ts`, with `--expect 'canonical holder
amounts'`, against `packages/derive/test/forms-settles.test.ts`.

| Check | Log | Elapsed seconds | User seconds | System seconds |
|---|---|---:|---:|---:|
| Local dependency setup | `/tmp/artroom-capacity-s3-setup.log` | 0.02 | 0.01 | 0.00 |
| Focused tests | `/tmp/artroom-capacity-s3-focused.log` | 0.78 | 2.20 | 0.22 |
| Typecheck | `/tmp/artroom-capacity-s3-final-typecheck.log` | 0.44 | 1.06 | 0.16 |
| Missing-term control | `/tmp/artroom-capacity-s3-term-control.log` | 1.36 | 1.49 | 0.28 |

These are separate `/usr/bin/time -p` observations on the user's Mac;
load was not sampled. They make no whole-path or performance claim. Setup
created 89 local links to installed root third-party dependencies and this
worktree's workspace packages. No package install or shared dependency
mutation. The initial typecheck found the fixture helper's subject type
was wider than the contract's `Subject`; it was narrowed before the final
passing checks.

## Remaining ownership

This counts known opening terms only. Capability records, newly opened
holders' complete reservation joins, other item/record terms, retention
and dynamic owner closures remain incomplete, not certified zero. No
capability-record ceiling is inferred from effects. Full `cc570904` / all
114 dispositions, all five Used/reserved axes, runtime/SQLite/replay
admission, scope budgets, public dimension diagnostics, producer maxima,
precision/bigint policy, numeric/physical/whole-cost measurement and product
duties remain open.

No mandatory settlement, late result, closing/rearmed checkpoint, final
holder account or unknown cleanup duty is skipped, evicted or delayed.
No runtime, Used, wire, configuration, quota or producer metadata change.
No provider/private/browser/process probe, deployment or package release.

This worker ran no gate and made no workroom filing. Root owns the sole
gate after reconciliation, complete independent review and normal witnessed
landing/publication. Artifacts for this slice belong only to producer
`a1256c14`, not the full capacity or S2 promises.
