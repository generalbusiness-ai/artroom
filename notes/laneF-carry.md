# Lane F: advisory obligations and check carry in the UI

2026-10-01. Lane F (`packages/ui`), follow-up for contract amendment 3
(`bc351fa8`): `docs/protocol.md` sections 29.1 (R-CARRY-13), 29.4 (R-OBL-7),
29.8 "Lane F", and open point 39. Branch `request/laneF-carry`, from `main`
at `fb2bd41`.

## What changed

- **Advisory obligations (R-OBL-7).** The Proposal screen lists a check
  obligation with `advisory: true` under "Advisory checks", apart from
  "Before it can land", and leaves it out of the "N of M met" count. The
  card has an "Advisory" badge and says it never blocks a landing. A failing
  advisory check says "Advisory: this failure does not block a landing." The
  room's lane card counts only blocking obligations and adds "1 advisory
  check, not blocking".
- **Check carry (R-CARRY-13).** `check-carried` events appear in the
  activity feed as one sentence, carried with its reason or not carried with
  why. They are also in `RoomSnapshot.checkCarries`, read from the log by the
  live adapter. Each check obligation lists its judgments ("Judged for
  landing integrations"). Carried check evidence takes its reason from the
  matching event; if no event is loaded, it says so and shows no reason.
- **Per-change history (open point 39).** Not added. README contract gap 10
  records that a live room has no read of a generation's commits.
- **Mock room.** A new `advisory-review` rule asks the `llm-review` checker
  (advisory, volatile) for `src/lib/ratelimit/**`. It fails on generation 2
  of the rate limit and on its landing integration, and the landing still
  lands. Each landing preparation judges each check obligation's latest check
  with the policy runtime's `checkConditions` and seals a `check-carried`
  event. The rate limit's tests check carries at step 24 and does not carry
  at step 28, after main moved. Checker configurations are the contract's
  `CheckerConfig`.
- New module `src/room/checks.ts`: `isAdvisory`, `checkCarriedText`,
  `judgmentsFor`, `carriedBy`. README and screenshots updated; new
  screenshot `proposal-carry-light.png` (step 28).

## Tests

`packages/ui/test/amendment-3.test.tsx`:

- advisory obligations never block (R-OBL-7)
  - the advisory obligation comes from the checker configuration; others are not advisory
  - an advisory obligation is listed apart from what a landing needs, and not counted
  - a failing advisory check reads as advisory, not as a blocked change
  - the room's lane card counts only what blocks, and names the advisory check as not blocking
  - the landing never waits for the advisory check, and lands while it fails
- check carry is shown from its check-carried event (R-CARRY-13)
  - check-carried events appear in the activity feed
  - a carried check shows the reason from its event
  - a check judged and not carried is shown with why
  - carried check evidence takes its reason from the event, not from the evidence record
- a live room
  - describes check-carried events, carried and not, in plain sentences
  - loads check-carried events from the log and shows them in the feed
  - has no per-change history: the contract has no read of a generation's commits (open point 39)

`packages/ui/e2e/smoke.spec.ts`: the walk-through checks a `check-carried`
sentence in the feed; new test "screenshot, check carry and an advisory
check".

## Gates

| Gate | Exit |
|---|---|
| `npm ci` (root) | 0 |
| `npm run typecheck` (packages/ui) | 0 |
| `npm test` (packages/ui): 8 files, 100 tests | 0 |
| `npm run build` (packages/ui) | 0 |
| `npx playwright test` (packages/ui): 7 tests | 0 |
| `npm run typecheck` (root) | 0 |
| `npm test` (root) | 0 |

## Mutation results

Run after the first commit, one mutant at a time with `vitest run` on the
whole UI suite, each reverted with `git checkout` before the next. Every
mutant turned at least one test red (vitest exit 1); the tree was clean and
the suite green afterwards.

| Mutant | Red tests |
|---|---|
| M1 Proposal counts advisory obligations as blocking | an advisory obligation is listed apart from what a landing needs, and not counted |
| M2 Mock landing waits for the advisory check | the landing never waits for the advisory check, and lands while it fails |
| M3 `isAdvisory` always false | a failing advisory check reads as advisory…; an advisory obligation is listed apart…; the room's lane card counts only what blocks… |
| M4 Room lane card counts advisory obligations | the room's lane card counts only what blocks… |
| M5 Carry judgment drops its reason | a carried check shows the reason from its event |
| M6 Carried evidence shows the evidence record's reason, not the event's | carried check evidence takes its reason from the event, not from the evidence record |
| M7 Feed sentence drops the carry reason | describes check-carried events…; check-carried events appear in the activity feed |
| M8 Not-carried judgment drops why | a check judged and not carried is shown with why |
