# Lane L: check-carried events

2026-10-01. Branch `request/laneL-carry`, from main `fb2bd41`. Contract
amendment 3, section 29.8 "Lane L" (R-CARRY-13, R-LOG-10).

## What changed

- `packages/log/src/decode.ts`: `check-carried` is a system event. The
  decoder reads its `lane`, `obligation`, `act`, `policy` and `decisions`.
  A `check` envelope's `body.obligation` is now decoded too, because verify
  reads it.
- `packages/log/src/verify.ts`: for each `check-carried` event, verify
  checks, in this order:
  1. `act` names an earlier entry, by seq and hash, that is an accepted
     `check`. Otherwise `carried-unknown`.
  2. That check's lane (`target.lane`) and `body.obligation` equal the
     event's. Otherwise `carried-mismatch`.
  3. The event's `policy` was activated by an earlier `policy-activated`
     event. Otherwise `policy-version-mismatch`.
  4. Its decisions replay under that version (R-EVAL-6). Otherwise
     `policy-decision-mismatch` (or `stamp-mismatch`, `input-missing`,
     `policy-version-mismatch`, as for other decisions).
- `packages/log/test/support/room-sim.ts`: `RoomSim.checkCarried` seals a
  `check-carried` event from a real `evaluateCarry` call, with identical
  trees, and retains its replay context.
- `packages/log/README.md`: the verify list names the new checks and test
  file.

## Tests

`packages/log/test/amendment-3.test.ts`:
- edit 1: a check-carried event with decisions verifies, and its decisions
  are replayed
- edit 1: a check-carried event without its decisions: malformed
- edit 2: a carry rule that refuses: notCarried policy-rejected, and the
  no-carry decision replays
- edit 2: a carry naming a later check: carried-unknown
- edit 2: a carry naming a check of another lane: carried-mismatch
- edit 2: a carry naming a check for another obligation: carried-mismatch
- edit 2: a carry naming an act that is not an accepted check:
  carried-unknown
- edit 2: a decision that differs on replay: policy-decision-mismatch
- edit 2: a carry naming a version no policy-activated event activated:
  policy-version-mismatch
- edit 2: the decisions are replayed under the version the event names,
  not the active one

A forward reference can match the 8 hex digits of a later entry's hash
only by grinding about 2^32 hashes. The "later check" test forges entry 9's
`hash` field to match, so that only the order check stops it.

## Gates

At the implementation commit `55e0e66`, after `npm ci`:

| Gate | Exit |
|---|---|
| `packages/log`: `npm run typecheck` | 0 |
| `packages/log`: `npm run test:node` (110 tests) | 0 |
| `packages/log`: `npm run test:workerd` (105 tests) | 0 |
| root `npm run typecheck` | 0 |
| root `npm test` | 0 |

## Mutations

Each guard was broken alone, the new test file run, and the file reverted.

| Mutant | Red test |
|---|---|
| Order check removed (`check.seq >= i`) | a carry naming a later check |
| Lane check removed | a carry naming a check of another lane |
| Obligation check removed | a carry naming a check for another obligation |
| Replay skipped | a decision that differs on replay |
| Replay under the active version, not the named one | the decisions are replayed under the version the event names |
| Known-version guard removed | a carry naming a version no policy-activated event activated |
| Accepted-check kind check removed | a carry naming an act that is not an accepted check |
| `check-carried` removed from the decoder's list | all 10 |

## Open points in the contract

- **Which version the event may name.** R-CARRY-13 says "the policy
  version that judged it: the operation's". Verify requires only that an
  earlier `policy-activated` event activated it, not that it is the active
  version when the event is sealed. A stricter rule needs the contract to
  say so.
- **The outcome is not replayed.** Verify replays `decisions`, as the
  contract says. It does not check that `outcome` agrees with them (for
  example `carried` beside a `no-carry` decision), that
  `outcome.notCarried.act` equals `act`, or that each decision's `kind` is
  `carry`. With empty decisions (a platform condition failed), no replay
  context is retained, so the outcome cannot be replayed at all.
- **The decisions' evidence.** A decision's `outcome.evidence` comes from
  its replay context. Verify does not compare it with the event's `act`.
