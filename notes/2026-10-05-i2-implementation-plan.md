# I2 implementation plan: the lane forms

Request `efb4e323` (the commission). Written 2026-10-05, before any source
change. Branch `request/i2-lane-forms`, cut from main `6b863c51`, which holds
I1 as landed.

This plan says what I2 builds, which forms can run now, what waits and on
whom, what is removed, how each step is shown to work, and what must be
asked. It is the builder's working plan. It adopts nothing and changes no
contract.

The texts it reads, and the short names used below:

| Short name | Text | Standing, as the commission gives it |
|---|---|---|
| The contract | Scope and replay contract, revision 11, at `996c3e58`, with its companion file | Adopted |
| The lane forms | Lane forms and browser flow, revision 14, at `4b3bf5da` | Adopted |
| The proof plan | Proof and test economy, revision 9, at `85be9f0b` | Adopted |
| The demo contract | Demo contract, revision 4, at `3b6e1ad7` | Adopted |
| Revision 12 | The contract's revision 12, at `aeda54f7` | Under review when this plan was written. Adopted since, as amended at `53f0e183` (act `b2833098`). Request `d56d7f65` owns it. |
| The authority note | Authority, effects and publication, revision 13, at `2709006c` | A historical input. Its successor is request `406983fe`. This plan takes no new authority from it. |

Section numbers with no name are the contract's. A source path that
begins with a package's name, such as `derive/src/validate.ts`, is under
`packages/`. Line numbers are those of main `6b863c51`.

How this plan was made: by reading the texts above in the sections the
commission names, and the landed source of the six packages. The lane
forms' sections 3, 4, 5 to 9, 13 and 14.2 were read in full. Of the
contract: sections 4.1, 6, 7.3, 7.5, 11 and 17 to 17.3a in full, and
others in part. Revision 12's new sections 11.10, 15.3b, 15.6i, 15.9 and
15.10 were read as proposals. Of the proof plan: sections 2, 3, 5, 10.2,
10.3, 11.1 and 12, the fault rows it gives to I2, and the catalogue keys
that rows A2, A3 and A5 name. Of the demo contract: sections 7 to 9.4.
One observed run of install, typecheck and tests was made at `6b863c51`
(section 6). No source was changed.

## 1. What I2 delivers, and what it does not

I2 delivers the two lane definitions, `issue` and `change`, as data, on
the scope substrate.

- The forms of the adopted contract that the two definitions use and that
  the landed validator and derivation do not have yet (section 2).
- The two definitions as canonical data, checked by `validateDefinition`
  at the adopted bounds, with their digests pinned.
- A typed client handle that is built from a declared definition.
- The `settles` declarations, counted in entries.
- Boundary evidence for the seven scenarios the commission lists, with an
  honest label on each.
- The removal that I2 owns, and guides for the forms it delivers.

I2 does not deliver:

- a second lane engine, a port of the earlier workroom acts, or a
  compatibility adapter. A lane is a definition. The platform packages
  import nothing from the lane package;
- any rule that another owner still owes: grants and membership, the
  platform definitions (directory, rules, destination, inbox, task), the
  records, guards, effects and steps of `hold@1`, the `git-read@1`
  capability, forks, tokens, exports, checker dispatch and publication;
- capacity in items, records, bytes or pending requests. I2 counts
  entries only;
- the browser, device, hosted-agent, workspace and publication stories.
  They stay owed as connected acceptance, and no run of two definitions
  stands in for them;
- a deployment, a provider probe, a credential or a registry publication.

**One limit decides the shape of the delivery.** Three acts and seven
handlers of the two definitions use capability forms, and six handlers
receive from platform scopes. Those rows validate as data. They cannot
run until I3 delivers what they read. Most of the change lane is behind
one such row, `propose-manifest`. So the steps of section 7 end at a
reviewed base, and the full I2 delivery is not claimed until the
dependent rows run (section 7.3; question Q8).

## 2. The forms, one by one

The status of each form is one of five.

| Status | Means |
|---|---|
| Runs | The landed validator accepts the form and the landed derivation applies it, as the lane rows write it. |
| Agreed, I2 row | The adopted contract has the form. Section 11.8 names I2 as its first source owner. I2 implements it. |
| Agreed, owed I1 row | The adopted contract has the form. Section 11.8 gives it to I1, and the source at `6b863c51` does not have it. Without it the two definitions do not validate, or would not derive as the contract says. So I2 implements it under the commission's sentence on agreed forms, and records each in its deltas note. |
| Agreed, waits for I3 | The adopted contract has the form. Its rule or its peer belongs to I3. I2 lets the validator read the form. Nothing derives it yet, so a row that uses it cannot run. |
| Undecided | No adopted text decides it. It goes back to its owner as a dated delta. I2 builds nothing that guesses it. |

Rows 8 and 9 are adopted in section 6.2 and have no row of their own in
section 11.8. They are marked "Agreed, I2 row" and are reported to the
contract's owner as a missing row of the source map.

| # | Form | Used by | In the landed source | Status | The contract |
|---|---|---|---|---|---|
| 1 | The members `format`, `profile`, `capabilities`, `genesis`, `items`, `acts`, `receives`, `timed`, `rules`; the profile `restricted@1`; an empty `rules` | Both definitions | `derive/src/validate.ts:179-193` | Runs | 6.1 |
| 2 | The member `name`, and `under` compared with it | Both; every `fact` type and every handler's `from` | Refused as an unknown member, `validate.ts:179`. `under` is compared with the digest: `scope/src/namespace.ts:78`, `derive/src/delivery.ts:154` | Agreed, owed I1 row | 6.1; row "`name` in a definition" |
| 3 | The capability `hold@1` in the list | Both | `validate.ts:199` | Runs | 6.8 |
| 4 | The capability `git-read@1` in the list | Both | Refused, `validate.ts:200` | Agreed, waits for I3 | 6.11; row "Capabilities" |
| 5 | The adopted bounds: 16 item types, 64 act kinds, 12 value slots, 4 `also` names, 24 guards as written, 96 nested and 8 deep, 64 members of a party list, 8 timed rules, 16 rules, 4 presented facts, 32 fields of a send, 256 KiB of definition, 128 foreign entries, sends by kind | `change` has 14 types; both pass 48 acts; `intent` has 10 values; four acts name 4 items; `propose-manifest` has 24 guards and can use 99 entries; `authors` holds 64 | `contract/src/bounds.ts:56-91` holds revision 7's numbers. A party list above 32 is refused, `validate.ts:267`. No bound exists for nesting, timed rules, rules, presented facts or definition bytes | Agreed, owed I1 row | 6.1, 7.5; row "Bounds on a definition" |
| 6 | The field types text, int, bool, time, enum, member, item, scope, digest, commit, tree, and a list of one of them; required and optional fields | Every act | `validate.ts:96-98`, `207-240`; `derive/src/values.ts:34-48` | Runs | 6.2 |
| 7 | `text` with `detached: true` | Bodies, a report's summary | Refused as an unknown member, `validate.ts:97`, `145` | Agreed, I2 row | 6.2; row "Detached text and `redact`" |
| 8 | `fact` with a list of kinds | Every `fact` type | A kind is one text, `contract/src/definition.ts:46`, `validate.ts:227` | Agreed, I2 row | 6.2, "a list is the same form". No row of its own. |
| 9 | A `fact` whose kind is a genesis act, or a handler's message | `conditionsAt` names `file`; `closedBy` names `closes` | A `fact` guard holds for an `act` entry only, `derive/src/guards.ts:154` | Agreed, I2 row | 6.2, "The kind of an entry". No row of its own. |
| 10 | A `fact` whose kind is `timed:` and a rule's key | `job.decidedBy` | Not a kind | Agreed, I2 row | 6.2; row "A kind for a timed entry" |
| 11 | A `fact` whose kind is `hold@1:check` | `manifest.pin`, the presented `pin` | No preparation entry exists | Agreed, waits for I3 | 6.2, 5.5; row "The `preparation` and `settlement` inputs" |
| 12 | The `record` type, as a field, a list element and a value slot | `seal-plan`, `selected`, `rules.checks` | Not a type, `validate.ts:96-98` | Agreed, I2 row | 6.2; row "The `record` field type" |
| 13 | `presents`: a fact presented beside the intent | `propose-manifest` | Refused as an unknown member of an act, `validate.ts:657`. The act input has no `presented`, `contract/src/entry.ts:35` | Agreed, I2 row | 6.4; row "Facts presented beside an intent" |
| 14 | An item type: `many`, `max`, states, `initial`; party, reference and value slots with `fixed`, `required`, `list`, `author` | Every item type | `validate.ts:243-279` | Runs | 6.3 |
| 15 | A reference slot of type `fact` that holds a local entry reference; a local fact in normal form; equality of the two; `fact-mismatch` | Every `terms` guard; `conditionsAt`, `termsAt` | `self` goes into an item slot only, `validate.ts:482-484`. Equality compares bytes, `values.ts:52-54` | Agreed, I2 row | 6.2; row "A local fact" |
| 16 | The hold type of section 6.8: a declared `epoch` slot, `holder` from the signer, a required fixed `under`, and `hold: end` as the effect that sets the final state | `take-hold`, `renew-hold`, `release-hold`, `hold-end`, in both | I1's item form: the definition sets the holder and the final state itself, and the epoch is beside the slots. `validate.ts:524-537`, `689`, `736-737`; `derive/src/effects.ts:116-122`. The lane rows are refused `required-unset` and `timed` | Agreed, owed I1 row | 6.8; row "The item form of `hold@1`" |
| 17 | A hold ends with what it is under | Every commitment that reaches a final state | Not derived | Agreed, I2 row | 6.8; the same row, "the last part, I2" |
| 18 | An act: `step` open or transition, `on`, `grant`, `fields`, the genesis act, `also` by a required item field, expected revisions | Every act | `validate.ts:630-693`; `derive/src/judge.ts:72-178` | Runs | 6.4 |
| 19 | `also` by `via`, by `one`, by an optional field that leaves the name unbound, and by a local fact | `goal`, `current`, `previous`, `earlier`, `request`, `replacement`; the handlers' `export`, `merge` | `by` an item field only, `validate.ts:635-641`. An absent field is refused `no-item`, `judge.ts:129-133` | Agreed, I2 row | 6.4; row "`via`, `one` and unbound names" |
| 20 | `settles`, on an act and on a handler, for an item and for a copy | `check`, `check-error`; the `result`, `publication`, `closes`, `export-settled` handlers | Refused as an unknown member, `validate.ts:657`, `698`. Nothing is reserved for it, `derive/src/reserve.ts:39-50` | Agreed, I2 row | 6.4, 17; row "Capacity accounting; `settles`" |
| 21 | The guards `state`, `signer`, `notIn`, `set`, `unset`, with `of` | Most acts | `validate.ts:343-358`; `guards.ts:130-134` | Runs | 6.5 |
| 22 | `equals` and `differs` over a field, a slot of the guard's subject, the signer and a constant | `already-linked` | `validate.ts:293-308`, `359-361`; `guards.ts:58-63`, `135-136` | Runs | 6.5 |
| 23 | An operand with `of` or `part`; the operands `item`, `element`, `presented`, `scope`, `intent`, `none`, `sender`, `source`, `result` | Most guards of both definitions | An operand has one member and four forms, `validate.ts:294` | Agreed, I2 row | 6.5; row "Operands, parts, list guards, `anyOf`, `reason`" |
| 24 | The operand `update` | The `closes` and `rules` handlers | Not an operand | Agreed, owed I1 row | 6.5; row "The order of a delivery's checks", "the `update` operand" |
| 25 | `none`, `some` and `count` over a range, with a `where` of `equals` and number bounds | `merge-in-progress`, `already-linked` | `validate.ts:362-384`; `guards.ts:72-101` | Runs | 6.5 |
| 26 | `except` in a range; `differs` in a `where`; an operand as `min` or `max` | `propose-manifest`, `review-verdict`, `request-check`, `merge` | Refused, `validate.ts:363`, `370-374` | Agreed, I2 row | 6.5; the same row |
| 27 | `fact` over a field; `before` over a time slot; `ifPresent` on a guard that names a field | `block`, `use-input`, `export-license` | `validate.ts:401-424`; `guards.ts:126`, `147-164` | Runs | 6.5 |
| 28 | `fact` over a presented fact and over an element; `ifPresent` over a presented fact | `propose-manifest` | Refused, `validate.ts:402` | Agreed, I2 row | 6.5; the same row |
| 29 | `reason` on a guard, and a refusal that carries a code and a name | Most refusals of both definitions | A guard takes `of` and `ifPresent` only, `validate.ts:321`. A reason is one code, `contract/src/result.ts:15-31`, `entry.ts:27` | Agreed, I2 row | 4.2, 6.5; the same row |
| 30 | `anyOf`, `each`, `has`, `distinct`, `sameSet`, with nesting and the three results | `accept`, `seal-plan`, `resolve-concern`, `propose-manifest`, `request-check`, `check`, `merge`, `unpin` | Not guards, `validate.ts:94` | Agreed, I2 row | 6.5; the same row, and row "The two rules for effects on one slot" for an unfinished nested guard |
| 31 | The `capability` guard: `staged`, `pin`, `license` and `settled` of `hold`; `ancestry` of `git-read` | `report`, `propose-manifest`; the pin and export handlers | Not a guard, `validate.ts:94` | Agreed, waits for I3 | 6.11; rows "Capabilities" and "The export handlers and the license pattern". `settled` also waits for the task definition (G24). |
| 32 | The effects `state` under a live-state guard; `party` from the signer, a member field or `null`; `ref` from a field, a slot of the same subject or `null`; `value` from a field, a constant or the commit time plus seconds | Most acts | `validate.ts:452-513`; `effects.ts:62-105` | Runs | 6.6 |
| 33 | A source that is any operand: a slot of another subject, `item`, a part, `sender`, `source`, `update`, `result`, a presented fact | `offer`, `propose-terms`, `report`, `use-input`, `propose-manifest`, most handlers | A source has fixed forms, `validate.ts:469`, `486`, `497` | Agreed, I2 row | 6.6; row "`if` and `unless`; a source as an operand" |
| 34 | `value` from `null`; an absent optional source is not applied | The reopen acts; `edit-own`, `edit-any` | `null` is refused, `validate.ts:497`. An absent field records an effect that empties the slot, `effects.ts:75-83`, `99-105` | Agreed, I2 row | 6.6; the same row, "the `null` source" |
| 35 | A party list set whole, from a list field or from a list of operands | `assign`, `comment`, `request-check` | A list takes `add`, `remove` or `null`, `validate.ts:463-465` | Agreed, I2 row | 6.6, "A list slot may be set whole". Its effect record is not listed in section 4.1: question Q4. |
| 36 | `ref` from `self` into a `fact` slot, in any act and in a handler | `file`, `revise`, the close acts, `accept-report`, `check`, the `closes` handler | An `open` act and an item slot only, `validate.ts:482-484` | Agreed, I2 row | 6.2; row "A local fact" |
| 37 | `ref` from `self` in a timed rule | `job-deadline` | The same | Agreed, I2 row | 6.4; row "A kind for a timed entry" |
| 38 | `if` and `unless` on an effect; a state guard in the effect's own `if`; two effects on one slot whose conditions exclude each other | `propose-terms`, `open` in `change`, `check`, `check-error`, the `closes`, `publication` and `export-settled` handlers, the clauses of `reserve` | An effect takes `of` only, `validate.ts:436`. Any two effects on one slot conflict, `validate.ts:548` | Agreed, I2 row | 6.6; rows "`if` and `unless`" and "The two rules for effects on one slot" |
| 39 | `attribute` with a slot and a subject | `report`, `propose-manifest` | `validate.ts:514-522`; `effects.ts:106-115` | Runs | 6.7 |
| 40 | A derived author list in byte order of member identifier | The same | Order of first appearance, `derive/src/attribution.ts:57-59` | Agreed, owed I1 row | 6.7; row "Sources of `attribute`; the order of a derived list" |
| 41 | `attribute` with `with`: a range of items, another subject, each fact of a list, one presented fact | The same | Refused, `validate.ts:515` | Agreed, I2 row | 6.7; the same row, "I2 for the sources" |
| 42 | The base of `attribute` when its subject is unbound | `propose-manifest` from a hold in an issue lane | Not derived | Undecided | The lane forms' gap G27. Owner: the contract. Revision 12 proposes an answer. |
| 43 | `redact` | The four redact acts | Not an effect, `validate.ts:95` | Agreed, I2 row | 6.6; row "Detached text and `redact`" |
| 44 | The `capability` effect: `pin-hold`, `pin-release`, `license`, `settle` | `report`, `refuse-report`, `propose-manifest`; the pin, export and `publication` handlers | Not an effect, `validate.ts:95` | Agreed, waits for I3 | 6.11; row "Capabilities" |
| 45 | `relate` to a scope field, with `item: "self"` | `link-own`, `link-any` | `validate.ts:595-610`; `derive/src/sends.ts:67-76` | Runs | 6.6 |
| 46 | A send's `to`, `item`, field or detail from any operand | `fulfil`, the unlink acts, `merge`, `cancel-merge` | A slot of the primary item only, `validate.ts:556-560`; `sends.ts:26-31` | Agreed, I2 row | 6.6; row "`if` and `unless`; a source as an operand" |
| 47 | `index` with field and constant sources | The goal acts, the pull request acts | `validate.ts:611-614`; `sends.ts:77-81` | Runs | 6.6 |
| 48 | An `index` row goes to the scope's directory; the platform puts `directory` in every `create` of a lane; the order of an entry's sends | Every index row of a concern | It goes to the creator, `sends.ts:79`. For a concern that is its parent lane | Agreed, owed I1 row | 6.6; row "The order of an entry's sends; where an `index` send goes" |
| 49 | `create` with fields from the signer, a field and `self`, and the clauses `applied`, `refused` and `conflict` | `add-concern` | `validate.ts:581-587`; `sends.ts:59-62` | Runs | 6.6, 7.2 |
| 50 | `create` with `definition: "self"` | `add-concern` | A digest or a platform name only, `validate.ts:585` | Agreed, owed I1 row | 6.6; row "A child reads its declared definition from its creator" |
| 51 | `tell` addressed by a reference slot of any subject, written `{ slot, of }` | `drop-concern`, `propose-manifest`, `merge`, `cancel-merge`, the `publication` handler | `to` is the name of a slot of the primary item, `contract/src/definition.ts:150`, `validate.ts:589-591`, `sends.ts:63-66` | Agreed, I2 row | 6.6, "A `tell` is addressed by a reference slot"; row "`if` and `unless`; a source as an operand" |
| 52 | `if` on a `tell` and on a `relate`; a send that is not made takes no ordinal | `fulfil`, `propose-manifest`, the `publication` handler | Refused as an unknown member, `validate.ts:589`, `596` | Agreed, I2 row | 6.6; row "The fan-out, `collect`, a conditional send" |
| 53 | A fan-out: `relate` with `each`, and `of: "each"` | The `publication` handler | Not a form | Agreed, I2 row | 6.6; the same row |
| 54 | `collect` in a field of a send | `merge` | Not a form | Agreed, I2 row | 6.6; the same row |
| 55 | A conditional `index` row | No row. The `closes` handler would use it | Not a form | Undecided | The lane forms' gap G20. Owner: the contract. Revision 12 proposes it. |
| 56 | `notify`, recorded as one `attention` effect | Every act that tells a party; the `result` handler; `job-deadline` | `validate.ts:618-628`; `effects.ts:142-146` | Runs | 6.6 |
| 57 | `notify` with `if` | `check` | Refused as an unknown member, `validate.ts:621` | Agreed, I2 row | 6.6; row "`if` and `unless`" |
| 58 | `attention-unbounded`: one act, handler or timed rule tells at most 64 members | Both; the most is 16 | Not checked | Agreed, owed I1 row | 6.6; row "Bounds on a definition" |
| 59 | The advisory send to each told member's inbox | Every `notify` | Not derived. The contract's disposition of I1's entry 36 leaves it to the inbox definition | Agreed, waits for I3 | 6.6; section 15.6, entry 36 |
| 60 | A handler with `message`, `from`, `also`, guards, effects, sends and attention | Every handler | `validate.ts:696-713`; `derive/src/frame.ts:151-170`, `219-232` | Runs | 6.4 |
| 61 | A handler's `class`, `fields`, `opens` and `copies`; a `relate` handler found by its relationship's name; `type-full` for a copy past the bound | Every handler | Refused as unknown members, `validate.ts:698`. A relationship's handler is named `relate:` and the name, `frame.ts:164`. A message's fields are not declared, `frame.ts:228`. Copies have no bound, `derive/src/delivery.ts:139-142` | Agreed, owed I1 row | 6.4, 7.3; row "A handler's `class`, `fields`, `opens` and `copies`" |
| 62 | A handler whose `from` is a platform scope: `platform:task`, `platform:rules`, `platform:destination`; the kind `publish` | The `rules`, `publication`, `export-license` and `export-settled` handlers | No platform definition exists, `scope/src/ports.ts:109` | Undecided | The lane forms' gap G26: the names are assumed. Owner: the authority note's successor, `406983fe`. |
| 63 | A timed rule with a `state` effect and attention | `job-deadline` | `validate.ts:718-740`; `judge.ts:187-206`; `derive/src/timed.ts:22-38` | Runs | 6.4, 5.2 |
| 64 | Entries reserved for a deadline and its chain, for a sent request and what its clauses start, for a confirmation, for an attempt, and for the closing checkpoint | Both | `reserve.ts:39-75`; `validate.ts:742-788` | Runs | 17.2, rows 1, 2, 5, 7 and 8, in entries |
| 65 | Rule expressions: a `rule` guard and the texts of `rules` | Neither definition declares one | `validate.ts:186-193`, `420-422`; `guards.ts:165-176` | Runs | 6.5. Nothing waits on point R1-8. |

Counts, made by a script over the status column of this table, of 65
rows: 19 run today. 29 are agreed additions with an I2 row. 9 are agreed,
owed I1 rows that I2 also implements. 5 are agreed and wait for I3. 3 are
undecided: rows 42, 55 and 62. So I2 implements 38 forms, and reads the
shape of 5 more without deriving them.

**What the table decides.**

- No row of either definition validates today. The first refusal is the
  member `name` (row 2).
- After the 38 forms, both definitions can validate as data. Every row
  that uses rows 4, 11, 31, 44 or 62 then validates and cannot run.
- Those rows are: `report`, `refuse-report` and the four pin and export
  handlers in `issue`; `propose-manifest` and all four handlers in
  `change`. That is 3 acts and 8 handlers.
- More rows are behind them. Nothing can open a report or a manifest, so
  `accept-report`, `fulfil`, `use-input`, `replace-input` and the `result`
  handler cannot be reached in `issue`. In `change`, the reviews of a
  verdict, every check act, the threads, `merge`, `cancel-merge` and
  `job-deadline` cannot be reached.
- Counted by hand from the rows: 44 of 50 act kinds of `issue` and 38 of
  52 of `change` can be reached with no capability row and no platform
  peer. So can `hold-end` in both, the `parent-dropped` handler, and the
  `closes` handler for `set` and `removed`.
- Row 42 is used by one shape of one act. I2 applies the rule that
  section 6.4 states for every effect: an effect whose subject is unbound
  is not applied. `manifest.authors` is required, so that shape is refused
  `required-unset`. It fails closed, as the lane forms' section 5.4 says
  it does. That shape waits for I3 in any case.
- Row 62 is carried as data. The handlers name what the lane forms
  assume. No platform peer exists to send to them.

**Silences that I2 must fill.** Where the contract is silent on a
concrete form, I2 records what it implements in
`notes/2026-10-05-i2-contract-deltas.md`, in the form of the I1 deltas
note. Nothing is adopted by being built. Known now:

| # | Silence | What I2 will implement, subject to its owner |
|---|---|---|
| D1 | The effect record of a party list set whole (row 35) | Question Q4 |
| D2 | How detached texts and presented facts travel beside an intent, and beside a message | One more member of the submit operation and of an envelope, each text checked against its digest. The routes are the source's to name (section 15.6e, entry 111). |
| D3 | What a runtime does with a capability form that it cannot derive | Question Q1 |
| D4 | Rows 8 and 9 have no row in section 11.8 | Reported, not decided here |
| D5 | Whether a declared definition may state a name that begins `platform:` | Question Q5 |
| D6 | What `settles` reserves in entries, per form | Section 3, row "Capacity" |

## 3. The source-impact rows of the lane forms' section 14.2

"Now" means inside the steps of section 7.1 and 7.2. Each dependency is a
request or a row of a note.

| Row of section 14.2, or gap | Owner there | Does I2 implement it now | What the rest waits on |
|---|---|---|---|
| The two definitions as data | I2 | Yes: the data, validation at the bounds, the digests. | Nothing for the data. Running: the rows below. |
| The counts, and the two bounds that `propose-manifest` meets | I2, with I1 for the bounds | Yes. The bounds are configured values (row 5). The counts 12, 50, 1, 7 and 14, 52, 2, 4 are asserted once. | The numbers: the proof plan. |
| `closedBy` from `self`; `decidedBy` on a job | I2 | The forms: yes (rows 10, 36, 37). `closedBy` is shown on the issue's side with a scripted source entry (section 6). | `decidedBy` needs a job, so a manifest: I3. The destination's reading of a deciding entry: I3. |
| Index rows, and a concern's number | I2 for the sends; I3 for the directory; I5 for the lists | The sends: yes, addressed to the directory (row 48). | The directory's handler and the number: I3 (G26). |
| The export handlers | I2 for the rows; I3 for the capability; IA for the task scope | The rows as data only. | `hold@1` records and guards: I3. The task definition: G24, `406983fe` with IA. The count of decided license numbers: the contract's section 6.11 has the form; revision 12's point R1-44 asks the authority note's successor one part. |
| The task scope on a hold; the seed of a fork; attempts and late answers | I3, IA, I5 | No. Not I2's. | I3, IA. |
| The pin's handlers and their targets | I2 for the rows; I3 for the pin record and the step `check` | The rows as data only. | The `preparation` input and the pin record: I3. |
| The ancestry guard | I3 for the check; I2 for the guard in two rows; I5 for the words | The guard's form in the two rows, as data only. | `git-read@1`: I3. |
| A check's configuration; what decided a job; the job's states | I2 for the rows; I3 for the rules scope, the checker and the destination | The rows, and the base forms they use. Shown once with labelled stand-ins (section 6, test T3). | A manifest: I3. The `rules` relationship: G26. The dispatch: G22. |
| The merge guard; the reasons on a refused withdrawal; a `reserve` that was never received | I2 for the rows; I3 for the destination | The rows, and the guard's forms. Shown in T3 as far as the lane decides. | The destination: I3. A reason with more than one value: G21. |
| Capacity | I1 for the accounting; I2 for `settles`; I3 for the capability | `settles` in entries: a pending item or copy reserves 1 entry for its settling form, 2 more for each request that form can send at its bounds, and what those clauses can start. A runtime may hold more and never less (section 17.2). | Items, records, bytes and pending requests: request `cc570904` and the builder's later delivery, with the proof plan for every number. The capability's reservations: I3. |
| Settlement with its four bases | I1 for the read; I5 | No. It is the owed row "Settlement at a position" of section 11.8. | I1's follow-through; I5. |
| Mentions | I2 for the rows; I5 for the client's list and the inbox | Yes: the entry tells the mentioned members and nobody else. | The inbox's delivery: I3 (row 59). |
| The agent task page | IA | No. | IA. |
| The demo's coding target | Its own owner | No. | The lane forms' section 17.10. |
| G20 A conditional index row | The contract | No. No row is written, so the directory's row of an issue that a merge closed stays `open`. | Revision 12 proposes the form. Until it is adopted, nothing. |
| G21 A reason with more than one value | The contract, with the authority note | No. The result carries the name `ended`. | The contract's next revision. |
| G22 Telling the checker service of a job | The authority note, with the contract | No. `request-check` sends nothing. | `406983fe`. |
| G24 The task scope's definition | The authority note and IA | No. | `406983fe`, IA. |
| G25 A scan of a detached text | The contract, with the authority note | No. No scope scans. | The contract's next revision. |
| G26 The platform definitions that the rows address | The authority note | No. The names stay as the lane forms assume them. | `406983fe`, then I3. |
| G27 The base of `attribute` for an unbound subject | The contract | No. I2 applies section 6.4's rule and the act fails closed. | Revision 12 proposes the answer. |
| The publication entry's 35 sends and 33 results, with the index row at ordinal 33 and the result at 34 | The contract and the proof plan, with the authority note | The handler row is data as the lane forms write it. No witness asserts a count yet. | The recorded agreement: `d56d7f65` (revision 12 proposes 35), the proof plan's row F23, and `406983fe` for its row O4. The witness also needs a destination: I3. |
| Capacity dimensions | The contract's section 17.1 | Entries only. The delivery note and the guide say so. | `cc570904`; the proof plan for the numbers. |

**What no source may take as settled.** This follows the last paragraph
of the lane forms' section 14.2, and I2 holds to it.

- A row that names an owned gap is not built by a stand-in that passes.
- Every amount that I2 reserves is derived from the definition at its
  configured bounds, is finite, and is in entries. It is never less than
  section 17.2 asks in that dimension.
- I2 writes no entry against a reservation that another owner declares:
  a bound license request and a publication's one withdrawal are the
  capability's and the destination's. A first license request, and every
  other request that a handler refuses, is new work.
- The rows keep four things apart, and no helper merges them: the entry
  that decided a job and its deadline's timed entry; a late authentic
  answer on a job that timed out; a reserved decision and new work; and
  an outside duty whose outcome is unknown, which no row settles.

## 4. The package layout

### 4.1 Where the definition data lives

One new small package, `packages/lanes`, named
`@generalbusiness/artroom-lanes`.

Why a package, and not a directory of an existing one:

- The existing layout gives each package one role. `derive` and `scope`
  are the platform and must stay free of any lane. A directory inside
  either would make the platform import a lane.
- The contract's section 11.2 says that lane forms live with the
  application. The lane forms' section 12 puts the two definitions in the
  application's repository. That repository does not exist yet (I5). A
  package whose only dependency is the contract's types can move there
  whole.
- Its tests need `derive` and `scope` as test dependencies. No platform
  package depends on it. A new assertion in
  `scripts/active-source.test.mjs` keeps that true.

| File | Holds |
|---|---|
| `packages/lanes/src/issue.ts`, `change.ts` | The two definitions, each one value of the contract's `DeclaredDefinition`. A row of the lane forms is one member. |
| `packages/lanes/src/shared.ts` | The rows that the lane forms state once for both: the discussion acts, the hold and export rows, the two export handlers. Each is a function of the grant prefix and the definition's name. |
| `packages/lanes/src/digests.ts` | The two pinned digests, and the lane forms' revision and commit that the data was written from. |
| `packages/lanes/definitions/issue.json`, `change.json` | The canonical bytes of each definition: what a creator retains and what a rules scope will activate by digest. |
| `packages/lanes/src/index.ts` | Exports the two values, the digests, the bytes, and the list a founder supplies as `definitions`. |
| `packages/lanes/scripts/pin.mjs` | Writes the two byte files and the digests from the values. A person runs it when a row changes. |
| `packages/lanes/test/` | The tests of section 6. |

The data is the rows of the lane forms' sections 3, 4 and 8.1. Nothing is
added and nothing is cut to pass. If `validateDefinition` refuses a row
as written, the row is not changed. The refusal is recorded and returned
to the lane forms' owner as a dated delta.

### 4.2 How digests are computed and pinned

- The digest is `definitionDigest` of the bytes package: SHA-256 over the
  tag `artroom-definition-1`, a newline and the canonical JSON of the
  whole value. There is no second implementation.
- One test computes both digests and both canonical texts from the
  values. It compares them with `digests.ts` and with the two byte files.
  A changed row without a new pin fails that test.
- A digest is exact for one value. Any change of a row, a name or a
  number is a new definition (the proof plan's key O8). The delivery note
  states the two digests and the lane forms' commit they were made from.
- The digests are not final until the lane rows are. An adopted change
  of a row makes new digests. Scopes that pinned the earlier ones keep
  them.

### 4.3 The public client handle

`packages/client/src/declared.ts`: one handle that is built from any
declared definition. The client still derives no judgment.

- `declaredHandle(scope, definition)` reads the scope's published
  definition and refuses unless its digest is the digest of the value
  given. So a caller that holds `issue` from the lane package knows the
  scope runs exactly that definition.
- `intent(signer, kind, asked)` builds and signs one intent. The act
  kinds and the fields of each are typed from the definition's own data.
  It checks the shape of each field against its declared type before it
  signs. It replaces each detached text by its digest and returns the
  texts to send beside the intent. It checks no guard.
- `submit` takes the signed intent, the grants, and what travels beside
  the intent: texts and presented facts (delta D2).
- The handle names no lane. `issue` and `change` need no code in the
  client.

### 4.4 Installation and activation, where I2 owns them

- The lane package exports the two declarations in the form that I1's
  founding takes as `definitions`. A directory that names their digests in
  a `create` retains their bytes for its children.
- `issue` names itself, for a concern (row 50). Its named closure is one
  definition. `change` names none.
- Activation by a rules scope, and the directory that creates lanes, are
  I3's. I2 builds neither. Its tests use a made-up directory, named as a
  test fixture.

### 4.5 Guides

| Guide | Change |
|---|---|
| `docs/lanes.md`, new | The two definitions for a reader who has not read the design notes: how to read a row, what a commitment, a hold, a plan, a manifest and a link are, which rows run and which wait, and on whom. |
| `docs/lanes-reference.md`, new, generated | One table for each definition: every item type, act, handler and timed rule with its fields and grant. Generated from the two values by a script in the lane package, and stamped with the two digests. The pin test fails when the stamp is stale. |
| `docs/scopes.md` | "Definitions are data": the forms of section 2. "What is not delivered yet": the lane row now names two definitions and what waits. Capacity: `settles`, entries only. |
| `docs/testing.md` | The runner list, with the lane package's projects. |
| `packages/lanes/README.md`, new; the guides of `contract`, `bytes`, `derive`, `scope`, `replay` and `client` | Each lists what its package gained. |
| `parked/README.md` | Section 5. |
| `notes/2026-10-05-i2-contract-deltas.md`, `notes/2026-10-05-i2-delivery.md`, new | The dated source choices, and the delivery note. |

`docs/protocol.md` and `docs/policy-pack.md` stay inactive and unedited.
I6 owns them. The delivery note lists the sections that I2's forms
replace.

## 5. Removal

The demo contract's sections 8 and 9.1 to 9.4 give I2 these removals. The
parked ledger, `parked/README.md`, says what I1 did.

| Item the demo contract gives to I2 | State at `6b863c51` | I2 does |
|---|---|---|
| `packages/policy`: the code-review declarations, the policy pack and the helpers, with the exports `./helpers` and `./pack` (sections 8, 9.1, 9.3) | I1 deleted them. The ledger's table "What I1 deleted" lists them. Only `parked/policy/src/admin.ts` is left, and it is I3's. | Records that I1 deleted them. Removes nothing. Restores nothing. |
| The declared-act stage flags in `packages/room/src/declared.ts` (section 8) | I1 deleted `declared.ts`. | Records it. |
| `packages/room/test/workerd/declared-run.test.ts` (section 9.4) | I1 deleted every such test of the Room. | Records it. |
| The pack and code-review tests of `packages/policy/test` (section 9.4) | I1 deleted them. | Records it. |
| `evidence.ts` of the earlier contract (section 9.1; the ledger: "I2 for evidence") | Parked: `parked/contract/src/evidence.ts`. | Deletes it when the `review`, `job` and `result` item types of `change` validate. `parked/contract/src/guards.ts` still names its types. That file is I3's, and the ledger says so. |
| The UI's generation history (section 8) | Parked with the whole of `parked/ui`, which the ledger gives to I5: `src/ui/ChangeHistory.tsx`, `src/room/changes.ts`, `test/change-history.test.tsx`. | Deletes those three files when manifest versions validate, if the planner confirms (Q7). Other parked files still name them, and they go with I5. |
| The subject of a check (section 9.1, `packages/checkers`: "I3; I2") | Parked whole: `parked/checkers`. | Nothing is removed. The `job` item is the new subject. I3 rewrites `job.ts` and `checker.ts` against it. |

I2 claims no removal that belongs to I3 or I5. I8 audits and removes
nothing for I2.

What is retargeted, by file:

| File | Change |
|---|---|
| `package.json` (root) | None. The workspace list is `packages/*`. |
| `package-lock.json` | The new workspace and its links. |
| `packages/lanes/package.json` | New. Exports `.` and the two byte files. |
| `packages/client/package.json`, `packages/scope/package.json` | `client` gains no dependency. `scope` exports its test Worker classes for the lane package's tests, beside `./testing`. |
| `packages/contract/src/index.ts` | Exports the new module `capability` (section 11.7). |
| `vitest.config.ts` (root) | The projects of the lane package: one for plain function tests, one in the Workers runtime pool (section 6.3). |
| `scripts/measure-tests.sh` | One step for each new project. |
| `scripts/active-source.test.mjs` | One more assertion: no file under the six platform packages imports the lane package. |
| `scripts/test-changed.mjs`, `scripts/gate.sh` | None. Both follow imports and the root run. |
| `packages/scope/wrangler.jsonc` | None. I2 adds no binding and no class. |
| The guides | Section 4.5. |

## 6. Evidence

Test economy is the first rule. Each test names one invariant. Pure
derivation is tested once, in `derive`, on small made-up definitions. The
lane package's tests show what only the two real definitions can show.

### 6.1 The shared fixture

One fixture constructor, `packages/lanes/test/support/graph.ts`. Each
test that writes gets its own scopes from it.

| Part | Is | Label |
|---|---|---|
| The definitions | `issue` and `change` from the lane package, by their pinned digests | Real |
| The lanes | Real scopes on Durable Object storage in the Workers runtime pool: one goal, the concerns it creates, one change lane | Real |
| The directory | A made-up declared definition that creates the lanes | A test fixture. The real directory is I3's. |
| The members | The key set of `@generalbusiness/artroom-derive/testing` | Test keys |
| Authority | I1's test authority: every presented grant is current | A stand-in. It proves nothing about real authority. |
| The capability | A scripted test table. By default every capability guard refuses. A test may script named guards to hold | A stand-in. It proves nothing about staging, ancestry, pins or exports. It needs the agreement of question Q1. |
| Platform peers | Handwritten source entries of a rules scope and a destination, served by the test resolver | A scripted peer. It proves the lane's side of a delivery only. |
| The clock | I1's scripted clock, one for the graph | Controlled |
| The scheduler | The dispatchers, driven by the fixture's `settle`; alarms run by the test; transport held or made deaf through I1's `net` | Controlled. No test waits on the wall clock. |

### 6.2 The seven boundary scenarios

Boundaries are the proof plan's: B1 a pure function, B2 one scope on real
storage, B3 several scopes with real calls between them, B9 independent
replay. All files are under `packages/lanes/test/`.

| # | Scenario | The single test | Boundary | Invariant it proves |
|---|---|---|---|---|
| T1 | Several commitments and hold expiry | `hold.scope.test.ts`, "a hold ends by time and the commitment stays": two accepted commitments, a hold under each, the clock moved to the first deadline, the alarm run | B2, the turn | The proof plan's L1 and S6. The timed entry is written before any other input. The hold is `ended` and its epoch rose. The commitment is still `accepted` with the same performer and terms. The other hold is untouched. A withdrawn commitment ends its hold in the same entry (row 17). |
| T2 | Separate child creation causes and duplicate delivery | `plan.scope.test.ts`, "two concerns with equal fields are two children, and a repeat adds nothing": two `add-concern` acts with the same fields; the first creation delivered again | B3, the store and transport | L6, S1 and S2, fault row F1. Two scope IDs, one for each intent. Each concern is `created` once and names its child from the sender. The repeat is answered with the first fact and writes no entry. Each child names its concern by the origin entry. |
| T3 | Exact manifests, selected versions and required evidence | `manifest.scope.test.ts`, "a manifest is complete only by recorded facts, and merges only on its own evidence" | B3 for the fetches. The two capability guards are scripted to hold, and the rules update comes from a scripted peer. | L7, L8, L9, L10 as far as the lane decides; A3; fault row F5. A required concern with no selection and no decision is refused `not-complete`. Changed terms need the parent's recorded decision. A later report in the child changes no manifest. An author's verdict is refused. `merge` is refused until the named checker's `check` passed under the rules' configuration, and its entry carries the exact statement. A `reserve` that no destination receives ends `refused`, `undelivered`, and the lane is free. Not proved: staging, ancestry, the pin, the destination. |
| T4 | Responsibility handover and old-performer refusal | `hold.scope.test.ts`, "a handover changes the performer of the same commitment, and the former performer is refused" | B2 | L2, L3; single-scope order R8. `accept-handover` is refused `hold-held` while the former performer holds, and `terms-differ` for another terms fact. After it the former performer's `take-hold` and `report` are refused at the `signer` guard. The commitment's terms fact is unchanged and its attribution holds both members. |
| T5 | Source-owned close and reopen links, in both arrival orders | `links.scope.test.ts`, two tests. "set then removed, and removed then set, end the same": a real change lane and a real issue lane, with transport held to swap the order. "a merge closes once, and a repeat after a reopen changes nothing": the issue's side, with a scripted change-lane source | B3 for the first. B2 with a scripted peer for the second: a real `merged` update needs a publication, which is I3's. | L11, S10; fault rows F3 and F4; order R9. Each request has one result. The older update is recorded `superseded`. The issue closes once, `closedBy` names its own deciding entry, and a hand close is kept. |
| T6 | Bounded in-application attention | `discussion.scope.test.ts`, "a comment tells the members it names and nobody else" | B2 | The entry holds one `attention` effect with exactly the mentioned members. It sends nothing. A list of 17 mentions is refused. The validator's bound of 64 is one row of a table in `derive`. Not proved: an inbox. |
| T7 | Pending settlement at full capacity for new work | `capacity.scope.test.ts`, "a full issue lane still records the end of a link it holds": the entries bound set small; a link `set`; comments until `scope-full`; then the link removed | B3, the commit | Section 17.3, in entries. New work is refused `scope-full` and its key is not consumed. The update that takes the copy out of `set` is written against the copy's own reservation. A first update for a new key is not decided and is offered again. The closing checkpoint still fits. |

Two more tests complete the list, and no others are planned in the lane
package's store run.

| # | Test | Boundary | Shows |
|---|---|---|---|
| T8 | `capacity.test.ts`, "the first answer on a pending job fits a full lane": the contract's witness 18.9, on the real `change` definition in memory, with the same stand-ins as T3 | B1, with stand-ins | A job reserves its deadline and its first answer. The first `check` is written at a full budget. A second answer is new work. Entries only. |
| T9 | `replay.scope.test.ts`, "replay derives the goal's graph again": the histories that T2 left, read through the routes | B9 over B3 | The verifier and the runtime agree on the new forms, once. The verifier is given the same test capability table, and the report is read with that limit. |

What these tests do not show, stated in the delivery note: real grants;
any platform scope; any capability record; a publication; a deployed
instance; a browser; a device. The proof plan's rows F23 to F28, F30,
F31 and F34 to F36 stay owed with I3. Its `goal` fixture rests on its
`repository` fixture, which is I3's. The fixture here is the part of
`goal` that exists.

### 6.3 Other tests

| Package | Tests | Shows |
|---|---|---|
| `derive` | One table for each family of forms of section 7.1, on small made-up definitions: about 10 tests | Each new form is accepted, refused and derived as section 6 says. The contract's witnesses 18.1, 18.2, 18.11 and 18.12 are rows of these tables. |
| `lanes`, plain | 3 tests: the pins; the counts against the bounds; validation, with the list of forms that cannot be derived yet and the genesis rule (fault row F29's controls) | Both definitions pass the real validator at the adopted bounds, and are exactly the pinned bytes. |
| `bytes`, `scope`, `client`, `replay` | About 6 tests: the text domain's vector; a detached text and a presented fact over the real route; the production wiring answers `unsupported-definition`; the declared handle | What crosses a real boundary for the first time. |

No test is written for one field, one guard or one row of a definition.
The two definitions are not mirrored in expected values: a row is shown
by what the lane then does.

### 6.4 Counts and time: an estimate

Observed at `6b863c51`, one run each, on a shared machine with other
sessions active and a warm package cache: install 2.3 s elapsed,
typecheck 1.8 s, tests 4.1 s. The test run had 203 tests in the root run
and 2 in the script check.

Estimated after I2, and labelled as an estimate until it is observed:

| Figure | Estimate |
|---|---|
| Tests added | 27 to 32: about 10 in `derive`; 4 plain in `lanes`, which are the three of section 6.3 and T8; 9 in the store run of `lanes`; about 6 elsewhere |
| Tests in the gate | 235, more or less 5 |
| Typecheck, elapsed | 2.2 to 2.6 s |
| Tests, elapsed | 5.5 to 7 s |
| The budget | The whole gate stays under 12 s elapsed on this machine, warm. If a step breaks that, the cause is found before review. |

A second project in the Workers runtime pool loads the test Worker once
more. Step 12 measures that. If it adds more than half a second, the
lane package's store tests join the `scope` project's one Worker load,
and the delivery note says so.

The delivery note reports the observed commands, outcomes, elapsed and
CPU time, setup, and the cost from install to review. It names what was
not witnessed. It claims no tenfold gain: the earlier gate checked
another product.

## 7. Steps

Each step is one commit, or a few that end at its milestone. Each ends
with its own witness passing and the tests of what it changed. The gate
runs once, at step 18.

### 7.1 The forms

| Step | Delivers | Files | Witness | Milestone |
|---|---|---|---|---|
| 1 | The contract's types for section 6 as adopted, the module `capability` with what `hold@1` and `git-read@1` declare, and the bounds of row 5 as configured values. The validator still refuses every new form. | `contract/src/definition.ts`, `bounds.ts`, `capability.ts` (new), `index.ts`, `contract/test/shapes.ts`; narrowing only in `derive/src` | Typecheck. The existing tests pass, with the bound cases at the new numbers. | M0: types only. No behaviour changes. |
| 2 | The validator and the shared frame, split into one module for each family, with no change of behaviour. This lets steps 4 to 8 run in parallel. | `derive/src/validate.ts` to `derive/src/validate/*.ts`; `derive/src/frame.ts` to `fields.ts` and `handlers.ts` | The existing tests pass unchanged. | M0 |
| 3 | The base every family reads: operands and parts (rows 23, 24); the local fact (15); the kinds of an entry (8, 9); `reason` and a named refusal (29); `name` and `under` (2). | `derive/src/operand.ts` (new), `guards.ts`, `values.ts`, `validate/guards.ts`; `contract/src/result.ts`, `entry.ts`; `bytes/src/records.ts`; `client/src/answers.ts`; `scope/src/namespace.ts`; `replay/src/verify.ts` | `derive/test/forms-operand.test.ts`: a terms field equals a slot set from `self`; a wrong hash is `fact-mismatch`; each part of a fetched entry; a refusal carries its guard's name. | A definition may state its name. |
| 4 | List guards and ranges (26, 28, 30). | `derive/src/guards.ts`, `lists.ts` (new), `validate/guards.ts` | `forms-guards.test.ts`, with the cases of witness 18.2. | Parallel group A |
| 5 | Effects: sources (33, 34, 35), `self` (36), conditions and the conflict rule (38), attribution sources and order (40, 41), and row 42 failing closed. | `derive/src/effects.ts`, `attribution.ts`, `fold.ts`, `validate/effects.ts` | `forms-effects.test.ts`. | Parallel group A |
| 6 | Sends: any operand (46), the address of a `tell` (51), conditional sends, the fan-out and `collect` (52 to 54), `definition: "self"` (50), the directory (48), `notify` with `if` and the attention bound (57, 58). | `derive/src/sends.ts`, `genesis.ts`, `state.ts`, `validate/sends.ts`; `scope/src/definitions.ts`, `sqlite.ts` | `forms-sends.test.ts`: a fan-out at a configured limit; a concern's row goes to the directory. One case added to `scope/test/compose.test.ts`. | Parallel group A |
| 7 | Subjects and handlers: `via`, `one`, unbound names (19); a handler's `class`, `fields`, `opens`, `copies` (61). The fixtures' handlers move to the new form. | `derive/src/judge.ts`, `handlers.ts`, `delivery.ts`, `validate/handlers.ts`, `derive/test/fixtures.ts` | `forms-handlers.test.ts`: an unbound name skips its guards; a copy past the bound is `type-full`. | Parallel group A |
| 8 | Fields: the `record` type (12), the kind lists as types (8), the timed kind and `self` in a timed rule (10, 37), and the hold type of section 6.8 with its end by what it is under (16, 17). | `derive/src/fields.ts`, `values.ts`, `hold.ts` (new), `timed.ts`, `validate/fields.ts`, `validate/timed.ts` | `forms-fields.test.ts`; `forms-hold.test.ts`, with witness 18.13. | Parallel group A |
| 9 | Beside the intent: detached text, `redact` and the domain `artroom-text-1` (7, 43); `presents` (13); how both travel (delta D2); the replay result for a redacted text. | `bytes/src/domains.ts`, `records.ts`; `contract/src/transport.ts`, `entry.ts`, `read.ts`; `derive/src/effects.ts`, `validate/fields.ts`; `scope/src/core.ts`, `delivery.ts`, `worker.ts`, `store.ts`, `sqlite.ts`; `client/src/http.ts`, `binding.ts`, `handle.ts`, `answers.ts`; `replay/src/verify.ts` | One test in `bytes`. One in `scope`, over the real route: a text is kept under its digest, a mismatch is `bad-field`, a redaction removes the bytes, and replay reports "redacted". | After group A |
| 10 | Capacity: `settles` in entries with its closure (20); a settling act or delivery is written against its own reservation. | `derive/src/reserve.ts`, `validate/capacity.ts`; `scope/src/turn.ts`, `delivery.ts` | One test in `derive/test/compose.test.ts`: a pending item at a full budget, on a made-up definition. | M1: every agreed form that I2 implements is shown on made-up definitions. |
| 11 | Capability forms as the validator reads them (4, 31, 44): checked against the declared tables; a valid definition lists what cannot be derived; the runtime and the verifier answer `unsupported-definition`; the scripted test table. **Waits for the agreement of question Q1.** | `derive/src/validate/capability.ts`, `guards.ts`, `effects.ts`; `scope/src/core.ts`, `testing.ts`; `replay/src/verify.ts` | Rows in the `derive` validation table. One test in `scope/test/founding.test.ts`: the production wiring founds no scope under such a definition. | Both definitions can be read whole. |

Steps 4 to 8 are independent once step 3 has landed. Each owns its own
source modules and its own test file, so five workers can take one each.
Steps 9, 10 and 11 follow in that order.

Step 11 is the one step that waits for an owner. Steps 13, 15 and 16
need it. If the answer to question Q1 refuses a test capability, no
scenario can run on the pinned definitions before I3. Milestone M3 then
moves to section 7.3, and steps 1 to 10, 12 and 14 still stand.

### 7.2 The definitions, the client and the evidence

| Step | Delivers | Files | Witness | Milestone |
|---|---|---|---|---|
| 12 | The lane package with the two definitions as data. Authoring starts as soon as step 1 has landed and runs beside steps 2 to 11: one worker for the shared rows and `issue`, one for `change`. | `packages/lanes/package.json`, `tsconfig*.json`, `vitest.config.ts`, `src/*.ts`; root `vitest.config.ts`, `package-lock.json`, `scripts/measure-tests.sh`, `scripts/active-source.test.mjs` | Typecheck against the contract's types. A one-time extraction of the rows from the lane forms at `4b3bf5da`, compared with the data; its result is recorded in the delivery note and is not a validation. | Parallel group B |
| 13 | Validation and the pins. Any row that the validator refuses is recorded and returned, not changed. | `packages/lanes/definitions/*.json`, `src/digests.ts`, `scripts/pin.mjs`, `test/definitions.test.ts` | The three plain tests of section 6.3. | M2: both definitions validate at the adopted bounds, with exact digests. In production nothing runs. |
| 14 | The declared client handle. | `client/src/declared.ts`, `index.ts`, `client/test/declared.test.ts`, `client/README.md` | Two tests: an intent with a detached text carries its digest; a scope that publishes another digest is refused. | Parallel group C, after steps 9 and 12 |
| 15 | The shared graph fixture, the scripted peers, and the test Worker that the lane package loads. The cost of the second project is measured once. | `packages/lanes/test/support/graph.ts`, `vitest.scope.config.ts`, `wrangler.test.jsonc`; `scope/src/testing.ts`, `scope/package.json` | T1 passes on the fixture. | After steps 11 and 13 |
| 16 | The scenarios T1 to T9. Three workers: T1, T4 and T6 on one lane; T2, T5, T7 and T9 across scopes; T3 and T8 with the stand-ins. | `packages/lanes/test/*.scope.test.ts`, `capacity.test.ts` | The tests themselves. For each new guard of a scenario, one control with `scripts/control.mjs`. | Parallel group D. M3: the reachable rows run on real storage. |
| 17 | Removal and guides. Two workers: the ledger and the parked files; the guides and the generated reference. | Sections 4.5 and 5 | The pin test covers the reference's stamp. The check of active files passes. | Parallel group C |
| 18 | Measurement, the deltas note and the delivery note. The gate, once. Review of the complete source. | `notes/2026-10-05-i2-contract-deltas.md`, `notes/2026-10-05-i2-delivery.md` | `npm run gate`; `scripts/measure-tests.sh`. | M4: the reviewed base. |

Parallel groups, in short: A is steps 4 to 8. B is step 12, beside
everything from step 2 on. C is steps 14 and 17. D is the three parts of
step 16.

Every milestone is recoverable: the branch builds and its tests pass at
each one, and each can be reported by itself. None of M0 to M4 is
reported as I2.

### 7.3 Steps that wait on another owner

| Step | Delivers | Waits on |
|---|---|---|
| W1 | The capability rows run: `report`, `refuse-report`, `propose-manifest`, the pin and export handlers, with the records that back them. The stand-in of section 6.1 is removed from T3 and T8. | I3: `hold@1` in full, `git-read@1`, the `preparation` input. Request `406983fe` first. |
| W2 | The handlers `rules` and `publication` receive from real peers; `merge` reaches a destination; an index row reaches a directory; a notice reaches an inbox. The scripted peers are removed. | I3, after G26. IA and G24 for the export handlers. |
| W3 | The publication entry at its limit: the proof plan's row F23, with the entry's size measured. | The recorded agreement on 35 sends and 33 results (question Q3), and W2. |
| W4 | Capacity in items, records, bytes and pending requests. | `cc570904`, the builder's later delivery, and the proof plan's numbers. |
| W5 | The rows that an owned gap leaves unwritten: a conditional index row, a reason with more values, the checker's dispatch. | G20, G21, G22: their owners. |

The full I2 delivery is filed when W1 and W2 are done, or when the
planner decides otherwise (question Q8).

## 8. Open questions for owners

| # | Question | Owner | The smallest decision |
|---|---|---|---|
| Q1 | A runtime that has the item form of `hold@1`, no capability record and no `git-read@1`: what does it do with `issue` and `change`? This plan takes the contract's rule: the validator reads the forms against section 6.11's tables, and the runtime and the verifier answer `unsupported-definition` for the whole scope. Tests then need a named test table to run the pinned digests at all. | The contract's successor, `d56d7f65`, with `406983fe` | Confirm the rule. Say yes or no to a scripted test capability that is wired like I1's test authority and labelled the same way. Step 11 waits for this. |
| Q2 | The base of `attribute` when its subject is unbound (G27). | `d56d7f65` | Adopt or reject revision 12's proposal. Until then I2 fails closed. |
| Q3 | The publication entry: 35 sends, the index row at ordinal 33, the result at 34, and 33 returned results. | `d56d7f65`, the proof plan for F23, `406983fe` for its row O4 | Record the one count. No I2 witness asserts a count before that. |
| Q4 | How an entry records a party list that is set whole. The `Effect` list of section 4.1 has `list` records for one member and no record for a whole list. | `d56d7f65` | Choose one: `list` records, first each removal and then each addition, in byte order of member identifier; or a new record. I2 would build the first and record it as delta D1. |
| Q5 | May a declared definition state a name that begins `platform:`? | `d56d7f65`, with `406983fe` | Yes or no. I2 would refuse it, and build its platform peers as scripted entries. |
| Q6 | Two points that revision 12 raises about the lane rows. The `renew-hold` row of `change` has no guard on the proposal, and the prose says a hold "runs to its end or is released" after a merge (R1-46). Nothing ends the pending state of a `timed-out` job that nobody answers, so its reserved entry is held and the lane cannot reach its closing checkpoint (R1-45). | The lane forms | For each: confirm the row as written, or change it. I2 writes the rows as they stand. |
| Q7 | Where the data lives, and one removal. The lane forms' section 12 puts the definitions in the application's repository. The demo contract gives I2 the UI's generation history, and the parked ledger gives all of `parked/ui` to I5 and says parked files are not edited. | The planner | Confirm `packages/lanes` in this repository until the application's repository exists. Say whether I2 deletes the three parked files of section 5. |
| Q8 | May the base of section 7.1 and 7.2 be reviewed and land while the request stays open for the steps of section 7.3? | The planner | Yes or no. The plan assumes yes, and reports the base as a milestone, never as I2. |

## 9. What I2 will not do

No deployment, no provider call, no new credential, no registry
publication and no external cleanup. No change to the deployed spike, to
the credentials and resources that E1 settles, to another checkout or to
a stash. No form is declared in source as if that
adopted it. No stand-in is reported as the thing it stands in for.
