# Lane L: check-carried events

2026-10-01. Branch `request/laneL-carry`, from main `fb2bd41`. Contract
amendment 3, section 29.8 "Lane L" (R-CARRY-13, R-LOG-10).

## What changed

- `packages/log/src/decode.ts`: `check-carried` is a system event. The
  decoder reads its `lane`, `obligation`, `act`, `policy`, `decisions`,
  `outcome.carried` (a boolean) and, when not carried,
  `outcome.notCarried.act`.
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
  5. Its outcome agrees with the replayed decisions. Otherwise
     `carried-outcome-mismatch`:
     - every decision that names evidence names the event's `act`;
     - `carried` needs at least one decision, and every decision allows
       the carry (`result: "carry"`);
     - `notCarried` needs no decisions, or one that does not allow the
       carry, and `notCarried.act` must equal `act`.
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
- edit 1: a check-carried outcome whose carried is not a boolean: malformed
- outcome: carried with no decisions: carried-outcome-mismatch
- outcome: carried while the decisions refuse: carried-outcome-mismatch
- outcome: not carried while every decision allows the carry:
  carried-outcome-mismatch
- outcome: notCarried.act differing from act: carried-outcome-mismatch
- outcome: a decision whose evidence is another check:
  carried-outcome-mismatch

A forward reference can match the 8 hex digits of a later entry's hash
only by grinding about 2^32 hashes. The "later check" test forges entry 9's
`hash` field to match, so that only the order check stops it.

## Gates

At the outcome commit `25a0e4b`, after `npm ci`:

| Gate | Exit |
|---|---|
| `packages/log`: `npm run typecheck` | 0 |
| `packages/log`: `npm run test:node` (116 tests) | 0 |
| `packages/log`: `npm run test:workerd` (111 tests) | 0 |
| root `npm run typecheck` | 0 |
| root `npm test` | 0 |

## Mutations

Each guard was broken alone, the new test file run, and the file
reverted. All were run again at `25a0e4b`; each went red.

| Mutant | Red test |
|---|---|
| Order check removed (`check.seq >= i`) | a carry naming a later check |
| Lane check removed | a carry naming a check of another lane |
| Obligation check removed | a carry naming a check for another obligation |
| Replay skipped | a decision that differs on replay |
| Replay under the active version, not the named one | the decisions are replayed under the version the event names |
| Known-version guard removed | a carry naming a version no policy-activated event activated |
| Accepted-check kind check removed | a carry naming an act that is not an accepted check |
| `check-carried` removed from the decoder's list | all 16 |
| Decoder's `outcome.carried` boolean check removed | outcome whose carried is not a boolean |
| Evidence check removed (c) | a decision whose evidence is another check |
| `carried` needs a decision: removed (a) | carried with no decisions |
| `carried` needs every decision to allow: removed (a) | carried while the decisions refuse |
| `notCarried` needs a decision that does not allow: removed (b) | not carried while every decision allows the carry |
| `notCarried.act` check removed (b) | notCarried.act differing from act |
| Outcome check not called | all five outcome tests |

## Open points in the contract

- **A carry with no decisions.** On the coordinator's instruction, verify
  refuses a `carried` outcome with no decisions. R-CARRY-13 says
  "`decisions` is empty when a platform condition failed or no rule
  applies", and `Carried.rules` is "empty when only platform conditions
  applied". So when the active policy has no `carry` rule for checks, an
  honest Room seals a carried event with no decisions, and verify fails it
  with `carried-outcome-mismatch`. Either the contract should require at
  least one carry rule decision for a check to carry, or this guard should
  go. It is one line in `carryOutcomeProblem` (`packages/log/src/verify.ts`).
- **Which version the event may name.** R-CARRY-13 says "the policy
  version that judged it: the operation's". Verify requires only that an
  earlier `policy-activated` event activated it, not that it is the active
  version when the event is sealed. A stricter rule needs the contract to
  say so.
- **What is still not checked.** With no decisions (a platform condition
  failed), no replay context is kept, so a `notCarried` outcome's code and
  reason cannot be replayed. Verify does not check that each decision's
  `kind` is `carry`: only a carry decision has `result: "carry"`, and
  replay binds each decision to its retained context.
