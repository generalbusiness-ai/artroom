# I2 contract deltas

Written 2026-10-05, with the steps of I2 (request `efb4e323`), for
independent design review. The scope and replay contract, revision 11, at
`996c3e58`, is "the contract". Section numbers are its own. "The plan" is
`notes/2026-10-05-i2-implementation-plan.md`, and a row number is a row of
its section 2.

Each entry is a place where the contract is silent or needs a concrete
form, what was implemented, and why. Nothing here is adopted by being
implemented. An entry stays open until the contract's owner accepts it,
changes it or removes it. Where a row needed a decision that the contract
does not make, the source fails closed, and the entry says so.

The form follows `notes/2026-10-04-i1-contract-deltas.md`. Entries are
numbered D1, D2 and so on. The plan named D1 to D6 before any source
changed. Each entry has the date it was written.

## 1. The silences the plan named

Written 2026-10-05 with the plan. None is implemented by steps 1 to 3.

| # | Where the contract is silent | Implemented | Why |
|---|---|---|---|
| D1 | The effect record of a party list that is set whole (row 35). The `Effect` list of section 4.1 has `list` records for one member each. | Nothing yet. It is step 5's. The plan's question Q4 asks the contract's owner. | The form is in section 6.6 and its record is not in section 4.1. |
| D2 | How detached texts and presented facts travel beside an intent, and beside a message (rows 7 and 13). | Nothing yet. It is step 9's. | Section 15.6e, entry 111, leaves the routes to the source. |
| D3 | What a runtime does with a capability form that it cannot derive (rows 4, 31 and 44). | Nothing yet. It is step 11's, and waits for the plan's question Q1. Until then the validator refuses each capability form, and `git-read@1` in the list. | Section 6.1 gives `unsupported-definition` for a version that a runtime does not implement. It does not say whether a test may script one. |
| D4 | Rows 8 and 9, the kinds of an entry, are adopted in section 6.2 and have no row in the source map of section 11.8. | Reported. Step 3 implements them, and its section of this note says how. | The source map is the contract's owner's to correct. |
| D5 | Whether a declared definition may state a name that begins `platform:`. | Nothing yet. Step 3 lets a definition state its name, and its section of this note says what it does with such a name. | The plan's question Q5. |
| D6 | What `settles` reserves in entries, for each form (row 20). | Nothing yet. It is step 10's. | Section 17.2 states the rule and no count for each form. |

## 2. Step 1: the contract's types, the capability tables and the bounds

Written 2026-10-05.

| # | Where the contract is silent | Implemented | Why |
|---|---|---|---|
| D7 | Section 11.8 says that source takes up each form after adoption. It does not say what a shared type holds while one package reads the adopted form and another still reads the first delivery's. | `packages/contract/src/definition.ts` holds the types of sections 6.1 to 6.8 and 6.11 as revision 11 writes them. Three forms of the first delivery stay in their unions, each marked "landed form": a handler with no `class`, `fields` or `opens` (`LandedReceiveType`); a party source `{ fact, field }` (`LandedFactSource`); and a `tell` whose `to` is the name of a slot. Each is removed by the step that moves its reader: steps 7, 5 and 6. A `fact` guard keeps revision 7's `where` on its field form, which section 6.5 says stands. The types say what a definition may hold. The validator still decides what a scope may pin, and refuses every form that no source derives. | The derivation source must compile against one type at every commit. A second copy of the types for the transition would drift. A new definition uses no landed form. |
| D8 | Section 6.1 gives bounds on a definition. Section 11.8 says that I1 holds each bound as a configurable value, and does not say which of the new bounds are enforced before the forms they bound exist. | `PROPOSED_BOUNDS` holds revision 11's values: 16 item types, 64 act kinds, 8 timed rules, 16 rules, 12 value slots, 4 `also` names, 24 guards as written, 64 members of a party list, 32 fields of a send, 256 KiB of definition, 128 foreign entries. The validator enforces all of those from this step. These are configured and bound nothing yet, because the validator refuses the forms they bound: 4 presented facts; 96 nested guards, 8 deep; 32 sends of a fan-out; 64 members told by one entry; 104 sends of one entry. The step that delivers each form enforces its bound. | The plan's row 5. A bound on a form that is refused cannot be met or broken. |
| D9 | Section 6.1 bounds "the canonical bytes of one definition" and does not say when the validator checks it, or whether the domain tag counts. | The UTF-8 bytes of the definition's canonical JSON, without the tag and the newline of its digest. The validator checks it first and reports that one problem. A value that has no canonical bytes is refused at the end, as before. | Section 6.1: the bound limits the validator's work. So it is checked before the work. |
| D10 | Section 6.4 lets the size of a timed entry count a party list "at every member that the list can hold", at its `max` or at the bound that the runtime enforces. Section 6.1 now proposes 64 for a party list and 32 for a list value. | A party list with no `max` holds at most the bound, 64. The fold refuses `slot-full` at the list's own `max`, or at 64. The static size of a timed entry counts a party list at its `max`, and a list value at 32. | Section 6.4, "Either is sound, when the fold enforces the bound that the validator counted." Before this step both were counted at 32. Counting a list of 64 at 32 would let a timed entry pass its bound. |
| D11 | Section 6.11 states what `hold@1` and `git-read@1` declare in tables of prose. Section 11.7 asks for a module `capability` and gives it no form. | `packages/contract/src/capability.ts`: the types `Capability`, `CapabilityRecord`, `CapabilityGuard`, `CapabilityEffect`, `CapabilityStep` and `ReservedRequests`, and the table `CAPABILITIES`. For each record kind it holds the states and which are final. For each guard: its arguments and its named refusals. For each effect: each set of arguments that the table allows. For each step: whether it may be `foreign`. For `receiver-pin`: the reserved requests. It does not hold a record's key or the names of its values, because the contract gives them in prose and the authority note owns them. It does not say which arguments are required, or which effects are total, because the tables do not. It holds no rule. | Step 11 checks a `capability` guard or effect against a table. A table that held more than the contract states would invent the authority note's part. |
| D12 | Section 6.6 types `ResultClauses` with `conflict` and says "`conflict` on a creation only". | The type has `conflict` on every request form. The validator refuses it on a `tell` and a `relate`, as it did. | One type, as the contract writes it. The rule is the validator's. |

## 3. Step 2: the validator and the shared frame, split by family

Written 2026-10-05. This step moves source and changes no behaviour, so it
makes no choice that the contract leaves open. It has no entry.
