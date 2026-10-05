# I3 contract deltas

Written 2026-10-05, with the steps of I3 (request `c75205df` for the
scope contract; the successor of request `406983fe` for the authority
note). "The contract" is the scope and replay contract at `53f0e183`.
"The authority note" is revision 16 at `7bc60cf6`. Section numbers are
their own. "The plan" is `notes/2026-10-05-i3-implementation-plan.md`.

Each entry is a place where the two notes differ, or state no member that
a type needs, and what the source holds instead. Nothing here is adopted by
being written. The source holds the narrowest type that fits both texts. An
entry stays open until its owner accepts it, changes it or removes it. The
form follows `notes/2026-10-05-i2-contract-deltas.md`. Entries are
numbered E1, E2 and so on, in the order they were written.

## 1. Step 1: the types

Written 2026-10-05. Step 1 changes types only. It changes no behaviour: the
runtime and the validator still refuse every form below, as the last column
of each entry says where it matters.

| # | Where the texts differ or are silent | Implemented | Owner |
|---|---|---|---|
| E1 | The contract's section 4.1 gives the input `settlement`, with `TerminalBasis`, and gives the entry's `FactUse` an `under`. The source's `Input` has neither, and the plan's step 1 does not list them. | Not added. Reported, as the contract's section 11.10 row 154 already says. | The scope contract (`c75205df`) for the rows; I2 and I3 for the source |
| E2 | The evidence of an outcome. The contract types its basis (`own-answer`, `read`, `none`) and leaves the body to "the owner of the effect". The authority note's section 5.7 says which basis shows each effect, and states no body. The contract's section 9.3 says `unknown` has the basis `none` and no other result has it. | `Evidence` is a union of three records by basis, each with `body: unknown`. The input `outcome` keeps one member with `result` and `evidence` typed apart. The pairing of result and basis is not in the type: it is a check of the verifier (section 9.3), and a union by result would make `derive/src/settle.ts` build two inputs for one. | The authority note's successor, for each body; the contract, for the pairing |
| E3 | The records `fork`, `token` and `instance`. The note's section 5.7 gives their states, with final states in bold, their keys and their values in prose. The contract's table of records gives states and finals, and `CAPABILITIES` holds those two columns only (I2 delta D11). | The three records, with the note's states, and the bold ones as `final`: `fork` `deleted` and `failed`; `token` `ended`; `instance` `past`. No key and no value is typed. | The authority note's successor |
| E4 | Where the read token and the snapshot repository live. The note's section 5.7 lists the record `token` under `hold@1`, and says the job's read token and its snapshot repository "belong to `git-read@1`" (also G4 and section 3.11). It names no record for the snapshot repository and gives no states for it. A definition that lists both capabilities and writes `{ carried: "token.x" }` is refused by the validator when two listed versions declare the kind. | `token` is a record of `hold@1` only. `git-read@1` gets the step `job-read` and no record. The snapshot repository's record is not added: it has no name or states. | The authority note's successor |
| E5 | The input `preparation`. The contract's section 4.1 gives it. A replay's switch over the input type, `replay/src/verify.ts`, has no case for it, and a member of `Input` without a case fails the typecheck there. That file is repaired by another worker in the same period. | `PreparationInput` is written as the contract states it, in `contract/src/entry.ts`, and is not a member of `Input` yet. The step that adds the replay case joins it to `Input`, and adds its guard to `bytes/src/records.ts`, whose table of `Input` types then requires one. | The builder, at the merge with the I2 repair |
| E6 | Whether each new step may be `foreign`. The note's section 5.7 says that each is "a signed request" that the lane records, and does not say whether it may be addressed to another scope. `retry` is in the note's table of steps for the hold capability. | `foreign: false` for `instance`, `token`, `retry` and `job-read`. `retry` is a step of `hold@1`, by the heading of section 5.7. `job-read` is a step of `git-read@1`, by section 3.11. | The authority note's successor |
| E7 | The observation of the rules scope. The note's section 3.3 says it "has the same form, with the rules' revision and content in place of the key's standing". It states no type. | No type is added. `Observation` is membership's only. | The scope contract, with plan row P19 |
| E8 | A grant with no freshness proof. The contract types `Grant.fresh` as `ObservationUse`, and the first delivery's judges take every recorded grant as current (I1 omission; `replay/src/verify.ts`). Two test fixtures build grants with `fresh: null`. | `Grant.fresh` is `ObservationUse`, as adopted. Both fixtures build `fresh` as `null` through one named cast, so no digest in a test moves. `bytes/src/records.ts` reads `fresh` as opaque, as before: no entry that was accepted is refused. Step 3 replaces the stand-in. | The scope contract, for what an entry with no proof means; step 3 |
