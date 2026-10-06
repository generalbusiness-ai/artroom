# Capacity S1: initial marker duties and timed bridge cycles

Source milestone `f28a24bc`, under its producer promise `96536dda`.
Branch `request/capacity-marker-cycle`, from published main
`68ffd6371e908880b38c2c2c62d5fca9cbdeb57e`. Written 2026-10-06.
This is a partial source delivery within `cc570904` / `a1bd8c18`.
It closes neither that full follow-through nor all-five capacity.

## Source and witnesses

Source `b486184ac1e61948ee3ce9ff9b1ee36139c7f391` changes three files:
`packages/derive/src/validate/holds.ts`,
`packages/derive/src/validate/capacity.ts`, and
`packages/derive/test/forms-settles.test.ts`. This note is the fourth
changed path. No source path is removed.

An unnamed item's initial and changed states now reserve the shared
marker calculator's state duty and every unfinished marker duty, beside
the deadline. Marked types have no scalar `pending` row; using only that
row had omitted their duties. The shared sum is used once. Written-clause
accounting already included it and is not counted again.

The canonical made-up platform witness has a job whose deadline costs
one entry, marker `a` three, marker `b` one, and state settlement one.
Its item amount is six entries and each tested operation closure is
fourteen. The request amount is eight; the tested holder reserves
twenty-eight entries. Restoring the old lookup gives item one and
operation four and fails an assertion. Its byte amounts still use the
existing entry-size stand-in; no additional budget dimension is enforced
by this correction.

A settling form can reach a cycle through a timed state with no form
that settles that state. The validator now attributes the nonfinite
closure to the active settling forms rather than returning an empty
diagnosis. The canonical negative case uses a settling act and an
acyclic timed graph; its finite control ends the job. Restoring the old
diagnosis admits the nonfinite definition and fails an assertion. These
are validation witnesses on made-up data, not executed provider or
runtime histories.

The existing late-result witness is retained unchanged:
`packages/derive/test/compose.test.ts`, the test beginning at line 419,
“a late result sets a timer again”. It judges two unavailable diagnoses,
two late applied result clauses and the timed entries they rearm, then
the closing checkpoint. Its manual rows end at `[11, 0]`; admission fits
eleven entries and refuses ten. This witnesses that actual clause path
in memory on fixture authority. It is distinct from the new negative
act/timed-cycle validation case. No additional clause variant was made.

## Verification

The worker's focused marker file passed twelve tests. Adjacent checks
passed 143 tests in six files, using:

```sh
npm test --workspace @generalbusiness/artroom-derive -- forms-holds forms-binding forms-final-holder compose validate timed
npm run typecheck --workspace @generalbusiness/artroom-derive
```

Both old-code controls reported `DISTINGUISHES` through the intended
assertions, with the changed file restored. Logs:

- `/tmp/artroom-capacity-marker-cycle-focused.log`
- `/tmp/artroom-capacity-marker-cycle-marker-control.log`
- `/tmp/artroom-capacity-marker-cycle-cycle-control.log`

Initial focused commands could not start because this new worktree had
no usable dependency links. A local link farm then reused installed
third-party packages and this worktree's workspace sources. For those
focused checks no package was installed, no lockfile changed, and shared dependencies were not
modified. The failed setup attempts are not source regressions or test
passes. The final changed-source gate is recorded after it runs.

The final source gate passed at
`db613d1c18139bfa753f0d2f8aa6c7dae570d513`, tree
`58fd599048ccdd3d436b0a53b939042ea25f7ee1`, with a clean checkout:
722 Vitest tests, six Node tests, all workspace typechecks and whitespace.
The gate installed the unchanged locked dependencies because the local
link farm had no installation stamp. Installation took 1.9 seconds
elapsed and 2.2 CPU; typecheck 3.8 elapsed and 9.6 CPU; tests 12.3 elapsed
and 33.4 CPU. The whole command took 18.31 seconds elapsed, 37.83 user
CPU and 7.71 system CPU. These are one observed run on the shared Mac,
not a controlled cost comparison or saving claim. Logs are
`/tmp/artroom-capacity-s1-gate.log` and
`/var/folders/2x/wylr59t17ds36l1l7ng25y7w0000gn/T/tmp.TmoSsa2MFB`.
This annotation changes only this note; the gated packages tree is
`b41af33fe7f3d4b78b9879f6080e718babcfcfb4`. Source and tests are unchanged
after the gate, so no document-only repeat is needed.

## Duties kept open

`cc570904` still owns all 114 original delta dispositions, complete
state/copy/marker/operation/result/timed/cleanup/checkpoint closure and
all five runtime budgets. `Bounds` still has only `scopeEntries` as a
scope budget; holder amounts remain partial in the other dimensions.
R1/R3/R4 retain configuration and diagnostics, erased historical byte
coverage, finite producer evidence maxima, no-final-holder release,
numeric adoption and physical/whole-cost evidence (`f45f1111`). No
missing amount is certified as zero and no new ceiling is adopted here.

All previous reviewed repairs, the unknown membership failure
`bd5a8986`, full I1/I3/IA/I5/I6, actual lane/host/runner/custody/browser/
device/deployment, manual and removal duties remain open. No provider,
account, private process or browser probe was performed. No first-Jam
gate or new capacity engine is introduced. Ordinary complete source
review and witnessed landing are still required for this candidate.
