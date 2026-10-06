# Capacity S2: known future-request amounts

This partial source milestone belongs to request
`7b9e535ffc8aa46d2d018d99d3ff360e046b4344` and producer promise
`67e1d574112a0bd79ba6ca25892a056ec93fc45b`. Its base is published main
`42e73eb7ff22c050c05709ab64649d48031120ec`, which includes approved S1
`b12419603ebaf7422757319c3be19750c60be6a7` and the receiving task map.

A settlement that will send a request must reserve that future request,
its diagnosis and result, and the result's foreign source entry. S1 kept
the entries of these closures, but reconstructing an `Amount` from the
entry count lost the pending-request unit and the result-source bytes.
S2 carries those known terms through the existing closure calculation.

## Changed source

The capacity and marker calculations now compose `Amount` values with the
existing sum, multiplication and componentwise maximum. Each subject's
alternative states take a maximum before separate subjects are summed.
Distinct state and marker duties are summed; alternatives of one duty take
the componentwise maximum. Completed marks remain excluded from later
closures. The existing finite/cycle checks remain in that traversal.

`markerReservations` is the shared marker traversal. `markerAmounts`,
`itemAwaits`, `markerOwed` and the existing numeric capacity fields retain
their entry APIs as projections. `dutyAmounts` carries the known terms
from validation into holder, item, operation, request and bound-decision
calculations. Bound decisions count downstream changed-state duties;
their own sends still draw on the holder's separately reserved requests.

The request unit here is **Reserved future work**, not an actual Used
pending request. No runtime Used accounting or admission rule changes.
Bytes use the existing `entryBytes` stand-in: two local entries and one
foreign result-source entry for a future request. They are not predictions
of canonical retained sizes, deployment budgets or adopted new numbers.

The exact changed frontier is:

- `notes/2026-10-06-capacity-s2-delivery.md` (primary delivery note)
- `packages/derive/src/held.ts`
- `packages/derive/src/markers.ts`
- `packages/derive/src/validate/capacity.ts`
- `packages/derive/src/validate/markers.ts`
- `packages/derive/src/validate/holds.ts`
- `packages/derive/src/validate/index.ts`
- `packages/derive/test/forms-settles.test.ts`
- `packages/derive/README.md`

The README correction is limited to its held and marker rows. Their prior
entries-only description of the pure state calculation became inaccurate;
runtime admission remains entries-only. That causal extra path was recorded
under producer `67e1d574` before editing. The separate guide branch is unchanged.

## Witness and focused checks

The existing canonical holder witness remains the one fixture. Its entries
stay `6 / 8 / 14 / 14`, and the root holder stays at `28`. The known terms
now carried by `itm`, `req`, `pulse`, `spawn` and the root holder are:

| Amount | Future requests | Byte units at `entryBytes` |
|---|---:|---:|
| `itm` | 1 | 7 |
| `req` | 2 | 10 |
| `pulse` | 2 | 16 |
| `spawn` | 2 | 16 |
| Root holder | 5 | 33 |

The one old scalar-reconstruction control preserves the entry assertions
but fails the intended request assertion: `0 / 2 / 0 / 0 / 2` instead of
`1 / 2 / 2 / 2 / 5`. It reports `DISTINGUISHES`, with no unrelated-error
credit. The source file is restored afterwards. Completed-mark release and
S1's timed bridge refusal and positive finite path continue to pass.

Focused commands, run in `capacity-request-amounts`:

```sh
npm test --workspace @generalbusiness/artroom-derive -- forms-holds forms-binding forms-final-holder forms-settles compose validate timed
npm run typecheck --workspace @generalbusiness/artroom-derive
```

The focused run passes seven files and 155 tests. Derive source and test
typechecking passes. The scalar control uses `scripts/control.mjs` on
`validate/holds.ts`, with `--expect 'canonical holder amounts'`, against
`packages/derive/test/forms-settles.test.ts`. No whole-suite run or mutation
sweep was made.

| Check | Log | Elapsed seconds | User seconds | System seconds |
|---|---|---:|---:|---:|
| Local dependency link verification | `/tmp/artroom-capacity-s2-setup.log` | 0.01 | 0.01 | 0.00 |
| Focused tests | `/tmp/artroom-capacity-s2-focused.log` | 0.81 | 2.27 | 0.25 |
| Derive typecheck | `/tmp/artroom-capacity-s2-final-typecheck.log` | 0.47 | 1.12 | 0.17 |
| Scalar reconstruction control | `/tmp/artroom-capacity-s2-scalar-control.log` | 1.46 | 1.55 | 0.32 |

These are separate `/usr/bin/time -p` observations on the user's Mac with
installed dependencies reused; load was not sampled. They are no whole-path
measurement or improvement claim. The first local link creation was not
CPU-timed; the setup row measures its later idempotent verification, which
created no missing links. Workspace links point into this worktree and
third-party links reuse root dependencies. No install or shared dependency
mutation occurred. An initial typecheck found one remaining numeric map
type in the lifted calculation; it was corrected before the passing checks.

## Remaining ownership

This transports known terms only. Missing item-opening, record, capability
and other retained-input terms remain incomplete, not certified zero.
Full owner closures, producer evidence maxima, all five Used/reserved
dimensions, SQLite and replay byte accounting, scope budgets, checked
arithmetic, public dimension diagnostics and runtime admission remain the
full `cc570904` owners. Numeric, physical and whole-cost measurements and
all 114 original dispositions remain open. S2 neither implements nor adopts
the separate capacity decision proposal.

No mandatory settlement, late result, closing/rearmed checkpoint, unknown
cleanup or final-holder account duty is skipped, evicted or delayed. No
wire, budget defaults, bigint policy, producer metadata, runtime, SQLite or
replay source changes. No provider/private/browser probe or deployment.

The sole final source gate, complete independent review and normal witnessed
landing/publication remain with root. No gate or workroom write was performed
by this source worker; this note records focused producer evidence only.
