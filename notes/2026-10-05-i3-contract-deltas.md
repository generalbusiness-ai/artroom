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
| E5 | The input `preparation`. The contract's section 4.1 gives it. A replay's switch over the input type had no case for it, and a member of `Input` without a case fails the typecheck. | Done at step 1. `PreparationInput` is a member of `Input`, as the contract states it. Until step 16a builds preparation, each place fails closed. The runtime has no route that writes one. `bytes/src/records.ts` has a guard for it, with the same bounds as an act's (a signed intent, grants, a capability name, a step). A form with a member missing or added is no entry. `derive/src/fold.ts` throws a `FoldError` for it, as for an entry it cannot derive. No judge takes it, so none writes one. `replay/src/verify.ts` stops at it with `unsupported-definition` (see E13). `scope` and `client` have no table or switch over `Input`, so they needed no change. Step 16a replaces the throw in the fold and the stop in the verifier. | The builder, at step 16a |
| E6 | Whether each new step may be `foreign`. The note's section 5.7 says that each is "a signed request" that the lane records, and does not say whether it may be addressed to another scope. `retry` is in the note's table of steps for the hold capability. | `foreign: false` for `instance`, `token`, `retry` and `job-read`. `retry` is a step of `hold@1`, by the heading of section 5.7. `job-read` is a step of `git-read@1`, by section 3.11. | The authority note's successor |
| E7 | The observation of the rules scope. The note's section 3.3 says it "has the same form, with the rules' revision and content in place of the key's standing". It states no type. | No type is added. `Observation` is membership's only. | The scope contract, with plan row P19 |
| E8 | A grant with no freshness proof. The contract types `Grant.fresh` as `ObservationUse`, and the first delivery's judges take every recorded grant as current (I1 omission; `replay/src/verify.ts`). Two test fixtures build grants with `fresh: null`. | `Grant.fresh` is `ObservationUse`, as adopted. Both fixtures build `fresh` as `null` through one named cast, so no digest in a test moves. `bytes/src/records.ts` reads `fresh` as opaque, as before: no entry that was accepted is refused. Step 3 replaces the stand-in. | The scope contract, for what an entry with no proof means; step 3 |
| E13 | What a verifier without preparation rules answers for a `preparation` entry. Section 9.3 gives the entry rules and does not say what a verifier that lacks them reports. It says that a capability version or form the verifier does not implement gives `unsupported-definition` (sections 6.1 and 9.3, the table of capability guards and effects). | `unsupported-definition`, at the preparation entry. It is never `consistent`. The contract says it at a scope's genesis, so a verifier that knew the capability would give it there. This verifier does not read a step's capability, so it answers at the entry. | The scope contract |

## 2. Step 2: the platform package and the inbox

Written 2026-10-05. The package holds the table of rules as a type, empty,
and `inbox` as its first definition. The note's section 12.1.6 is the text
that the rows follow.

| # | Where the texts differ or are silent | Implemented | Owner |
|---|---|---|---|
| E9 | The note says a platform definition is code with one fixed meaning (the contract's section 6.1), and also that source holds as much of it as data as it can (section 12.1). Neither says that the validator reads such data. The plan's question Q10 asks. | `validateDefinition` takes a fourth parameter, `{ platform?: boolean }`. With `platform: true` a name that begins `platform:` is not refused. Nothing else changes with it, and a definition from an input is validated without it. Only `packages/platform` passes it, which `scripts/active-source.test.mjs` does not yet check: it checks who may name the package. The plan assumes yes to Q10. | The scope contract (`c75205df`), with the authority note's successor |
| E10 | A notice's `source`. The note's section 12.1.6 gives it a record of four values (`scope`, `incarnation`, `seq`, `hash`) and says it is the envelope's source fact, "Code P22". A fact reference has the members `at`, `seq` and `hash`. | The row is written as the note states it: `{ value: { slot: "source", from: { source: "ref" } } }`. The validator accepts it, because the source of a part read from the reference has no stated type there. The commit would refuse it, by reading `effects.ts` (`fits` and `held`, lines 170 and 68): a fact reference is no value of that record type. This was read and not run. So the inbox needs one rule, row P22, and the plan's step 2 says it needs none. The test asserts that the definition validates, and no more. | The scope contract, for the form of P22; the builder, for the rule |
| E11 | The genesis act's grant. A definition's act has a `grant`, "always required" (the contract's section 6.4). The note's table states none for `establish`: "Genesis, by membership's `create`", no guard. | `grant: "inbox.establish"`, after the lane definitions' own `file` (`issue.open`). A genesis is judged by no signer, so nothing reads it. | The authority note's successor |
| E12 | The handler names. The note writes "`notify`, twice: from `{ kind: "lane" }` and from `{ kind: "task" }`". A handler's key is the definition's own name. The note gives the notice's `item` as "(fixed)" and not required. | The keys are `notify-from-lane` and `notify-from-task`. Each handler's `message` is `notify`. `item` is a field of the message that is not required, and a value slot that is not required. | The authority note's successor |

## 3. Step 3: the ports, re-shaped

Written 2026-10-05. Step 3 changes how three ports are asked: authority,
definitions and capabilities. It changes no entry's bytes and no digest.
The prefix EA marks this step's entries.

| # | Where the texts differ or are silent | Implemented | Owner |
|---|---|---|---|
| EA1 | E8 says "Step 3 replaces the stand-in": the two fixtures that build a grant with `fresh: null`. A real proof is an `ObservationUse`, which needs the read of step 6 and the guards of step 5, and would change the bytes of every act entry in a test. | Not replaced. Both fixtures keep `fresh: null` through the same named cast. The entry of an act still records the presented grant, byte for byte. | The builder, at steps 5 and 6 |
| EA2 | The contract's section 4.2 puts `authority-unavailable` in the Unavailable class. The source's `UnavailableReason` did not have it. | Added to `UnavailableReason`, and to the client's table of the reasons it accepts. No entry holds an Unavailable reason. | None: the contract states it |
| EA3 | What the commit is given of a read. The contract's section 16.1 says the grant is built from the observation, and the grant guard reads the grant and the commit clock. The note's section 3.3 gives the guards. Neither says what the commit holds while grants are still presented beside the intent, as `submit` takes them. | The port has two phases. `read`, before the turn, returns a `Standing`. Its one method, `held`, is asked in the commit with the folded state and the commit's reading, and answers each grant the act may be judged on, with whether it is current. The judge keeps its own check of the grant: the key, the action, the scope and `notAfter`. The test authority, a stand-in, answers the presented grants as current. The production port answers no grant. The grant of step 5, built from an observation, is one such answer. | The builder, at steps 5 and 6 |
| EA4 | What a failed read answers, and when. The contract's section 5.2, step 1, answers a failed fetch `dependency-unavailable` before the turn. Section 16.1 says a read that did not finish gives no observation, and the act is answered `authority-unavailable`. Section 4.2 puts authority at check 9. No text gives the read a time limit of its own. | The read has the fetch time limit of step 1. A read that fails, is late or gives nothing does not end the request: the turn runs, and the judge answers `authority-unavailable` at check 9. So checks 1 to 8 still answer first. For an act whose key is on a sealed entry nothing is read, as step 1 says of every fetch, and check 3 answers. | The scope contract (`c75205df`), for the limit |
| EA5 | "The observation is discarded and read again" (the note's section 3.3: guard 1, guard 3, a negative age). The texts do not say whether the second read is made for the same request, or how many times. | Not built. `held` may answer null, which is `authority-unavailable`: the act is not judged, and the caller's retry reads again. No read is kept between two acts yet, so no case reaches this. A seam in `scope/src/core.ts` marks where a kept read learns which entry used it last. | The authority note's successor, for the rule; the builder, at step 6 |
| EA6 | A platform definition of which the runtime has the data and lacks a rule. The contract's section 6.1 says a runtime that does not implement a version "admits nothing to that scope", and, for a capability form with no code, that the whole scope is refused: "a scope runs every turn under its whole pinned definition, or none". The plan's step 3 asks that such a scope is founded and runs the rows that are data. The two differ. | As the plan's step asks. The scope is founded, and runs the rows that are data. It derives nothing of an entry that the platform package marks as code: it judges no input of that kind and writes no entry of it. A genesis act that is marked founds no scope. The stricter reading is one line: refuse the founding when any entry is marked. **Decided, and changed: entry EC4.** The rule is of the whole scope, and what this cell says is no longer what the source does. | The scope contract (`c75205df`), to rule; the builder. Ruled: EC4 |
| EA7 | What the scope answers for an input of a marked row. `Answer` has no `unsupported-definition`: the contract's section 4.2 gives that reason to a founding. | An act: Unavailable `unavailable`, the answer of a scope whose whole definition the runtime cannot run. A delivery: transport's `retry`, with the reason `unsupported-definition`, and the sender keeps the duty. A timed rule: the transition stays due, the turn ends `unavailable`, and no input passes it. A founding: Refused `unsupported-definition`. The check of a delivery reads the message's own name and the pinned definition, and is made before the source entry is read. So a message of a marked row that would fail its source check is answered `retry` too. Since entry EC4 these are the answers only in a scope whose every rule is supplied, where no judge runs one yet (EC6). A scope with a rule missing answers as EC4 says. | The scope contract |
| EA8 | How a platform rule's result joins its row. The plan's section 4.2 says a rule may refuse and may add effects and sends. P22 must replace an effect that the commit refuses (E10), and P13 must replace check 9. No text says how either joins the data. | No judge runs a rule. The definitions port supplies the rules with the definition, and the core reads only which entries are marked. So an entry that is marked is not derived, also when its rules are supplied. The platform package gains `CODE`, the table of the marked entries, with `notify` of the inbox under P22. Still open after the adoption of revisions 14 and 18: entry EC6 has the question. | The builder, at steps 7 and 11; the scope contract, for the form of P22 |
| EA9 | Who may found a scope under a platform definition. The note's section 12.1 gives no creator to the register alone. A founding makes a scope of the kind `directory` with no creator, under whatever definition it names. | A founding may name any platform definition that the platform package holds, and the scope's kind is `directory`. Today that is the inbox, and the plan's witness for this step founds one. A creation under a platform name is not built: it is answered `unsupported-definition`, as before. | The builder, at steps 8 and 9 |
| EA10 | What a capability rule is given, and what `implements` is asked. The contract's section 9.3 says a rule derives from "the arguments, the folded records and the entries in `uses`". Section 6.1 says the rule on missing code "is a rule on the forms that a definition uses, and not on the name of a version alone". The source asked `implements` for a version, and gave a rule its arguments only. | `implements` is asked for one form: the version, the kind of form and its name. A guard and an effect are given, beside their arguments, the folded state before the entry and the input as the judge read it. The scripted capability of test support, a stand-in, reads neither. The verifier's one call follows. | The authority note's successor, for the rules of `hold@1` and `git-read@1` |

## 4. Step 4: operations

Written 2026-10-05, by the worker of step 4. Entries have the prefix EB.
"Item n" is an item of the contract's section 4.3. "Rule n" is a ledger
rule of the authority note's section 5.4. The pure rules are in
`packages/derive/src/ledger.ts`, and the driver is in
`packages/scope/src/operations.ts`.

| # | Where the texts differ or are silent | Implemented | Owner |
|---|---|---|---|
| EB1 | The source's `operation` effect was `{ operation, attempt }`, with an ID of the form `op_...`. The contract's section 4.1 gives two effects, `operation` and `attempt`, and the ID `seq:k`. | Both effects and the ID are as the contract states them, in `contract/src/entry.ts` and `scope.ts`, with their guards in `bytes/src/ids.ts` and `records.ts`. No entry of any earlier source holds either effect, so no entry's bytes change. The rest of the contract's `Effect` list (`Local`, `"self"`) is not taken up here. | The scope contract (`c75205df`) |
| EB2 | Item 7 says an owner "may declare" that a kind selects. Item 2 names "the owner's retry rule". Item 4 names a read "that the effect's owner defines as decisive". The `operation` record has no member for any of them, and no form declares them. | They are code: `OperationRules`, by owner and kind, given to the judge as `Owners`. It holds `selects`, `read`, `retries`, the selection guard, the check of the evidence's form and what an outcome derives. With no rules for an owner, an outcome of its operations is not judged (`unavailable`), and the driver sends none of its attempts. No owner's rules are delivered by this step. | The authority note's successor, for each owner's rules (plan row P16); the builder, in the steps that add an owner |
| EB3 | Item 3 says the late answer is "from that attempt's own answer". Item 4 lets `confirmed` and `refused` have the basis `read`. Rule 2 also names "a completion fence established for that kind of effect", which has no form (the note's point O11, gap G1; the contract's R1-38). | A second outcome of an attempt must have the basis `own-answer`. A read is accepted only as an attempt's first outcome, and only where the owner's rules say a read is decisive. No fence settles anything. So an attempt that is `unknown` stays `unknown` until its own answer, as section 11.1 requires. | The scope contract, for R1-38; the authority note's successor, for G1 |
| EB4 | Rule 4 settles a token by its end time. The contract has no basis for such an outcome (O12; G2; R1-39). The plan's row T19 names it. | `tokenPast` is the judgment alone: the reading is later than the end time by the margin, and the clock is not behind. It settles no attempt and writes nothing. T19's sentence about a token is witnessed only as that pure function, in `forms-ledger.test.ts`. | The scope contract, for R1-39; step 18, for the `token` record |
| EB5 | Item 6 answers a contradiction `outcome-conflict`, and leaves the incident to R3. `RefusalReason` has no such member. Item 6 does not say what makes two answers the same. | `settleOutcome` answers `conflict` with the entry that is contradicted, and writes nothing. `judgeOutcome`, which a replay calls, gives `bad-input` for it. The driver answers `{ recorded: "conflict", seq }`. No incident is recorded: the operator's record is step 15's. Two answers are the same when the result and the digest of the evidence are the same, so the folded state keeps that digest for each outcome. An `unknown` that is offered for an attempt with any outcome is a repeat. | The scope contract, for the reason's name; the authority note's successor, for the incident |
| EB6 | Section 17.2, row 5, reserves "the records and operations that its outcomes derive, such as a cleanup", which "the owner declares". No adopted effect states them at the opening. | Not reserved. `owed` counts entries only: 2 for each attempt with no outcome or still to be opened, and 1 for each attempt whose latest outcome is `unknown`. It counts every attempt that may still be opened, whatever the retry rule will say, which is more than the closure and never less. An outcome entry that opens a cleanup raises what is reserved, and is not asked whether that fits. The evidence for capacity is partial: entries only, and without the closure. Changed at the merge: entry EC2. | Request `cc570904`; the owners' rules (P16) |
| EB7 | Item 2 does not say whether an attempt's late answer may open the next attempt. No text bounds the number of attempts an opening may state. | The outcome entry of the last attempt opened may open the next one, whether it is that attempt's first outcome or its late answer. An earlier attempt's late answer opens none. An opening states at least 1 attempt, and no upper bound is checked. | The scope contract; R4, for a bound |
| EB8 | Rule 7 asks for a backoff "to a cap", and the texts give no number for it or for how long an answer is waited for. | The dispatcher's bounds: attempt n is first looked at `dispatchRetrySeconds` doubled n - 2 times after its opening entry, up to `dispatchRetryMaxSeconds`; attempt 1 at once. An answer is waited for `dispatchSeconds`. After a restart, an attempt that is marked as perhaps sent is recorded `unknown` when that time has passed since the mark, and not earlier. | R4 |
| EB9 | Section 9.1 lists operations only inside a preparation status. It has no read of a scope's operations, which the operator's lists need. | Two reads, `operations` (a page, optionally only those not settled) and `operation` (one, by ID). Each row is the folded operation, its state as a preparation status gives it, and the driver's bookkeeping, marked as no history. The page bound is the outbox page's, and a reader who may read the outbox may read these, because `ReadName` is in a file that step 3 owns. Changed at the merge: entry EC1. | The scope contract, for the row and its bound; the builder, at the merge |
| EB10 | No text states the port for an outside effect. | `Outside`, in `operations.ts`: `accepts(owner, kind)`, `send(request)` and `late(deliver)`. The request names the scope, the operation, the attempt, the owner, the kind and the sealed entry that opened the operation. An answer is `confirmed` or `refused` with decisive evidence, or null. There is no third answer for "not sent": a gateway's record that nothing was forwarded is a `refused` answer that the port gives. The production default sends nothing. An answer for an attempt that is not marked as sent is refused. An answer in hand that cannot be written yet is kept in memory, and one lost with the process leaves the attempt `unknown`. `outside` and `owners` are members of `Wiring` for now. Changed at the merge: entry EC1. | The builder, at the merge and in step 19 |
| EB11 | Section 9.3 gives the outcome row its checks. A replay passes no owner rules. | The judge now makes the checks of that row that need no owner: the attempt was opened, at most two outcomes, the basis pairing, and the derived `selected` and next attempt. `replay/src/verify.ts` is not changed. It gives the judge no `owners`, so a history with an outcome entry is reported as a mismatch there until step 22 passes them or answers `unsupported-definition`. No source writes such a history yet. Changed at the merge: entry EC3. | The builder, at step 22 |
| EB12 | Item 1 says the confirmation of a provisional scope opens attempt 1 of each operation that its genesis holds. | `heldOpenings` derives those effects. The judge of a confirmation does not call it yet: no genesis can declare an operation until an owner's rules exist. | The builder, with the first definition whose genesis opens an operation (step 9) |

## 5. The merge of steps 3 and 4

Written 2026-10-05, by the worker that merged the two steps. Entries have
the prefix EC. "Revision 14" is the scope contract at `fa6417e6`, and
"revision 18" is the authority note at `99bc48e8`. Both are adopted since
the sections above were written, and where they differ from revisions 13
and 16 they are the authority here.

| # | Where the texts differ or are silent | Implemented | Owner |
|---|---|---|---|
| EC1 | EB9 and EB10 left two seams for the merge: the port for outside effects and the owners' rules were members of `Wiring`, and the two reads of operations were asked as `outbox`. No text states either. | `Ports` holds `outside` and `owners`, and `production()` gives `NO_OUTSIDE` and null. `Wiring` has no member for them. `ReadName` gains `operations`, and both reads ask the readers port by that name. | The scope contract, for the read's row and bound (EB9); the builder, in step 19, for the host port |
| EC2 | Section 17.2, row 5, reserves what an operation's outcomes derive, and says "the owner declares them". The `operation` effect has no member for it (section 4.1), so the entry that opens an operation cannot state it. | The owner's code declares it: `OperationRules.closure`, the most entries that the operations which one outcome entry of that kind opens reserve, with their own closures. `owed` is given the owners' rules, and reserves that closure with each outcome entry an operation may still write. An outcome whose owner would open more than it declared writes nothing (`unavailable`). So what is used and reserved never rises with an outcome entry, also when it opens a cleanup. With no rules for an owner the closure is 0, and no outcome of its operations is judged. The count is partial: entries only, and it reserves the closure for every outcome entry, which is more than a closure and never less. Witness: `derive/test/forms-ledger.test.ts`, the first test. A replay does not count capacity, so nothing of a verifier changes. | Request `cc570904`, for the form and the other dimensions; the owners' rules (P16) |
| EC3 | What a verifier with no owner rules reports at an outcome entry. EB11 left it a `mismatch`. Revision 14 states it: section 9.3, point E13, and the table of section 9.4 give `unsupported-definition` at that entry, never `consistent`, for an outcome entry of an operation that the verifier does not derive. | `replay/src/verify.ts` stops at an `outcome` entry with `unsupported-definition`, as it does at a `preparation` entry. It makes none of that row's checks first, so an outcome entry that names no opened attempt gets the same answer. Witness: one row of the table "not consistent" in `replay/test/verify.test.ts`. Step 22 gives the verifier the owners' rules. | None: the contract states it. The builder, at step 22 |
| EC4 | EA6: the plan's step 3 asked that a scope be founded under a platform definition that has a row marked as code and no rule for it, and run the rows that are data. The contract's section 6.1 says that a runtime which does not implement a version "admits nothing to that scope", and that "a scope runs every turn under its whole pinned definition, or none". Revision 14's answer on E9 (section 15.6n) keeps a platform definition as "code with one fixed meaning", inside the rule of section 6.1. | The builder's decision, as the contract's author: section 6.1 stands as written for a platform definition too. A platform definition with an entry marked as code, for which a row has no rule supplied, is `unsupported-definition` for the whole scope. `Scope.platform` answers null for it. So a founding is refused and writes nothing. A scope that exists under it has no definition that the runtime can run: an act is `unavailable`, a delivery gets `retry`, no timed entry is written, a read is `unsupported-definition`, and the operations driver sends nothing (EC5). A creation under a platform name was refused before and still is (EA9). The production wiring supplies no rule, and the inbox marks `notify` (P22, E10). So it founds no scope under the inbox, or under any platform definition, until step 11 writes that rule. Witness: `scope/test/founding.test.ts`, the test of `platform:inbox@1`, which also keeps the control that the platform option is reached from no input. Its founded case uses `standInPlatform`, of test support: a stand-in rule that adds nothing, labelled, which proves nothing about P22. | The scope contract (`c75205df`); decided by the builder |
| EC5 | The one writer that step 3 could not gate: the operations driver, which sends a request and then offers its outcome. No text gives an outcome entry of a platform operation a kind that the platform package's table of marked entries could name: section 6.2 gives a kind to an act, a genesis, a delivery of a request, a timed entry, and a preparation with its outcomes, by capability and step. | The driver does not ask `Scope.lacks`. It asks the rule of EC4: when the pinned definition is one the runtime cannot run, a pass sends nothing and offers nothing, and each attempt stays recorded with no wake-up until a runtime that can run the definition restarts the object. The code of an outcome is its owner's rules (EB2), and with none nothing is sent, as before. Witness: `scope/test/operations.test.ts`, the third test, with the scripted capability, a stand-in, as the code that is lost. | The authority note's successor, for the kind of an outcome entry of a platform operation, if a row ever needs one |
| EC6 | EA8, read again against the adopted revisions: how a platform rule's result joins the data row of its entry. What the texts state. Revision 18, section 12.1: "A cell that begins \"Code\" is a rule that the platform's code holds because no form says it", and section 12.1.8: the rule "is specified by the table that uses it". Revision 14, section 15.3c: the rule "is then code of the platform definition's version", "every entry that such code writes still has this contract's forms, and a verifier derives it again with the same code"; for P13, the act "records an empty `authority`, and its guards are the code's"; for P22, a slot "is typed by that definition's code". Section 15.6n, on E10: the commit's refusal of the inbox's data row "is right", and whether a notice's `source` is typed by code or is a record of a fact reference's members is left open. What no text states: (1) whether a rule replaces the one guard or effect that its cell marks, runs after the data row and adds to it, or replaces the derivation of the whole row; (2) what the data holds at a marked place, and whether the validator and the judges skip a form that is marked, as the inbox's `source` effect, which validates and which the commit refuses; (3) where a rule runs in the order of the checks of section 4.2, as P13 must stand in place of check 9; (4) in what order the rules of an entry with several rows run. | Not built, and nothing is invented. No judge runs a rule, in `derive/src/judge.ts` or `handlers.ts`, and a replay runs none. The seam is marked in `scope/src/core.ts` (`Scope.platform`). Until it is decided, an entry that is marked is not derived, also in a scope whose every rule is supplied: `Scope.lacks`, with the answers of EA7. That leaves one partial run, against the words of EC4: a scope whose rules are all supplied and none run. Only test support reaches it today (`standInPlatform`). The first real rule, P22 in step 11, reaches it in production unless this is decided first. No later step can run a rule before it is: steps 7, 9 to 9c and 11 each need one. | The authority note's successor (request `837943bb`, its revision 19), for questions 1, 2 and 4; the scope contract, for question 3 and for the form of P22 (E10) |

## 6. Step 5: the grant guard

Written 2026-10-05, by the worker of steps 5 and 6. Entries have the
prefix ED. The texts are the adopted ones: the contract's revision 14 and
the authority note's revision 18. The note's revision 19 at `c3f2f103` is
under review, and nothing is built that only it states. The pure
functions are in `packages/derive/src/grant.ts`. Their witness is
`packages/derive/test/forms-grant.test.ts` (plan row T45).

| # | Where the texts differ or are silent | Implemented | Owner |
|---|---|---|---|
| ED1 | The form of the read. The note's section 3.3 says a scope "asks the membership scope, by the reference fixed in its own genesis, for the standing of one key", and that "membership answers from its head". It types the observation, and no request and no answer. | `ObservationRequest` is `{ of, key }`: the membership reference and the key, and no other member. `ObservationAnswer` is the observation without `at`, which is the asking scope's own clock. `observationOf` makes the observation from an answer and that reading. An answer with a member missing, added or of another form is no answer. | The authority note's successor; the builder, at step 7 |
| ED2 | The grant guard asks that "`within` covers this scope". The contract types a grant's filter as `ScopeFilter` and leaves it to the note. The note says only "where: this repository, or one task". No form says what a filter is or how it covers a scope. | One value covers a scope: that scope's own reference, with its incarnation. Any other value covers nothing. The judge of an act already reads a grant's `within` so. A consequence for step 7: the request does not say who asks, so a membership scope cannot answer a `within` that names the asking scope. Until the filter has a form, no act is authorized on a real answer. | The authority note's successor |
| ED3 | Which acts of a declared definition are "taking or renewing a hold", the ten-second kinds of section 3.3. The note names `take-hold` and `renew-hold`, which are names of the lane definitions. No form of a definition states a window. The contract's guard 5 reads "the window that the definition states". | `windowOf` reads the definition: an act with a `hold` effect that opens or renews is a ten-second kind, whatever its name. The other ten-second kinds of the note are no acts of a lane: a mint and a staging are preparation steps (step 16a), and an export and a private read are the task scope's. | The authority note's successor |
| ED4 | The window of an act in a scope that is no lane, directory or inbox. Revision 18 states 300 seconds for "an ordinary act in a lane, the directory or an inbox", and 60 for "a control of an agent task". It states none for an act in the rules scope, the destination or the register, and does not say which acts of a task are controls. Membership judges its own acts locally (section 3.1). | `windowOf` answers null for every other kind of scope. No read is then made, and the act is answered `authority-unavailable`. Revision 19 proposes rows for membership, the rules scope and the task scope. A seam marks the place. | The authority note's successor (its revision 19) |
| ED5 | An observation on a clock that is behind. The contract's section 4.2 puts authority at check 9 and the clock at check 14. The note's section 3.12, case 4c, has a reading earlier than `at` and earlier than the previous entry, and answers `clock-behind`. By the order of checks alone that act would be `authority-unavailable`, for a negative age. | With the clock behind, the guards on the age and on a clock that has moved are not judged, because the reading shows no passage of time. A standing that holds the action passes check 9, the judge answers `clock-behind` at check 14, and nothing is written. The runtime then discards the observation, so a retry reads again. A grant's `notAfter` is compared with the previous entry's time, as section 4.2 says. A standing that does not hold the action is still refused `unauthorized` first. | The scope contract (`c75205df`) |
| ED6 | "For an agent, `controllerActive` is true, or the action is a comment." No form says which member is an agent or which action is a comment. | An agent is an observation whose `controller` or `controllerActive` is not null. A comment is one of two names, `issue.comment` and `change.comment`, from the table of section 3.2: the list `COMMENTS`. | The authority note's successor |
| ED7 | The role table. Section 3.2 writes `membership.*` and `rules.*`, and says a name that ends `.*` "covers each action of that prefix". Three rows hold a condition, such as "For tasks they control". The table is a value of the membership scope at one head. | The guard reads the observation's `actions` only, and each is a whole name: `actions.includes(action)`, as the judge of an act reads a grant. `.*` is read as the table's shorthand, which membership writes out. `RoleTable` and `actionsOf` are the table as data. The table's first value is membership's (step 7), and no source holds it. A cell with a condition has no form: it needs the filter of ED2. | The authority note's successor; the builder, at step 7 |
| ED8 | Which answer each failed condition gets, and in what order. The contract says the guards of an observation are made "before it reads the value", and that one that fails "is discarded and read again". The note keeps a revoked answer "whatever its window". Section 4.2 gives check 9 two answers. | `judgeGrant` answers in this order. An observation of another membership scope or incarnation: discarded. An observation of another key than the signer's: `unauthorized`. A revoked key or a removed member: `unauthorized`, also past the window. Then the guards: a ten-second kind that is not `fresh`, a wrong `use` or `prior`, a clock that has not moved, an age outside the window, an older head. Each discards, and the act is `authority-unavailable`. Then the value: the key's state, the action, `within`, `notAfter`, the controller. Each refuses `unauthorized`. A key in the state `unknown` is refused, and its observation is kept like any other. | The scope contract, for the two answers of check 9 |
| ED9 | Guard 1 of section 3.3, "`read.run` is the scope's present run", as a pure function. | It is not one. A run's observations live in memory and in the call that read them, so none exists after a restart, and a check of a run against itself could change no outcome. In a history the rule is `run-returned`, over the order of entries: step 14. | The builder, at step 14 |

## 7. Step 6: the observation read

Written 2026-10-05, by the same worker. The read is
`packages/scope/src/authority.ts`. Its witness is
`packages/scope/test/authority.test.ts` (plan rows T6 and T46), on a real
scope with a scripted membership, which is a stand-in.

| # | Where the texts differ or are silent | Implemented | Owner |
|---|---|---|---|
| ED10 | EA5: "the observation is discarded and read again". The texts do not say whether the second read is made for the same request, or how many times. | Once, before the turn. When a scope holds an observation of the key, the read phase judges its guards at the reading it notes. If one would fail, it reads again for the same act. A guard that fails later, in the commit, discards the observation and answers `authority-unavailable`. Nothing is read in the commit. The caller's retry reads again. | The authority note's successor |
| ED11 | EA4: no text gives the read its own time limit. | The fetch time limit of step 1 is kept, as EA4 set it. An answer that comes after the limit is not used for that act. It is still kept for a later act of the key: its `at` is when the read began, so its age leaves nothing out. | The scope contract (`c75205df`) |
| ED12 | The order of heads holds "across runs too" (section 16.1, rule 3). The folded state holds no head of a retained observation, and a scope's memory holds only its present run. | In the commit the guard is judged against the entries that this run wrote, from memory. After a restart a read that was answered from a lower head than an entry of an earlier run retains is not found by the runtime. A replay finds it, as `observation-older`. To find it in the commit, the folded state must hold the highest head for each subject. That is a change to the fold, which this step does not own. | The builder, with `derive/src/state.ts` and step 14 |
| ED13 | Where a scope's membership reference comes from. The contract's section 6.6 says it is a function of the genesis entry, set by the creator in the body of a `create`. No source writes or reads that member yet. For the rules scope and the destination the incarnation is fixed by "the first entry that retains an observation" (the note's section 12.1), which no source does. | `observing` is given a function that answers the reference, or null. With null nothing is read. Test support answers a reference by hand, and says so. The production wiring is step 12's, and `production()` still reads no grant. | The builder, at steps 9 and 12 |
| ED14 | What the commit tells the port. EA3 gave the port two phases. Guard 3 of section 3.3 needs the latest entry that retains a read, and a commit that wrote nothing "is not a use". | `Standing` gains an optional `sealed`, which the commit calls inside its transaction with the entry that it wrote. `Asked` gains `window`, which the core reads from the pinned definition. `held` may discard, from what the port holds for reuse, an observation that failed a guard. It changes nothing else. A transaction that fails after `sealed` breaks the object, and its memory with it. | The builder |
| ED15 | Which read an act is judged on when the scope holds one and also reads. The note keeps "at most one observation of a key for reuse", and says a ten-second observation "is read for that input and used by that commit only". | An act that made a read is judged on that read. An act that made none is judged on the held one. A read of an ordinary kind is kept if no held one has a higher head. A read of a ten-second kind is not kept, unless it shows a revocation. After an entry retains an observation, a held one from a lower head is dropped, as the contract's rule 3 asks. A revoked answer that any read has seen is judged in place of every other answer, also one read for the act. | The authority note's successor |
| ED16 | What a read counts. `n` "counts the reads of membership, and of the rules scope, that the scope began in that run". | Every read that began takes a number, also one that got no answer or no usable answer. So the numbers that the entries of a run retain rise and may have gaps. A read of the rules scope, and a read for the member `observed`, are not built: they are the platform definitions'. | The builder, at steps 23 and 26 |
| ED17 | Plan row T46 names the whole clock table of section 3.12. | Witnessed here for what one scope with an observation can show: an act stopped by a clock that is behind, and read again before a retry; a checkpoint written clamped; a timed entry written with membership silent. The rows of a delivery, an outcome, a stream and a token wait for the scopes that have them. | The builder, in the steps of those scopes |

## 8. Steps 16a to 16c: preparation, the records of `hold@1`, and ancestry

Written 2026-10-05, by the worker of steps 16a, 16b and 16c. Entries have
the prefix EF. "Revision 14" is the scope contract at `fa6417e6`, and
"revision 18" is the authority note at `99bc48e8`. Both are adopted and are
the authority here. The code is in `packages/derive/src/prepare.ts` and
`packages/derive/src/capability/`. The production capabilities port is
still null, so nothing below runs in production until step 16 wires it.
Every count of capacity below is of entries only: the other four
dimensions are request `cc570904`'s, and evidence that rests on these
counts is partial.

| # | Where the texts differ or are silent | Implemented | Owner |
|---|---|---|---|
| EF1 | A request that names no step. Section 5.5 gives a preparation's checks, and no reason for a request whose capability the definition does not list, or whose step the version does not declare. No text names the route, or the form of its answer. | Refused `bad-field`, and nothing is written. The route is `POST /v1/scopes/:scope/preparations`, with the body `{ signed, grants, capability, step }`. Its answer has the forms of an act's `Answer`. A repeat is `accepted`, with the receipt of the first entry. A receipt of a preparation entry has `intent: null`, as `receiptOf` gives every entry that is no act. With no code for a step the answer is Unavailable `unavailable`, as for a scope whose definition the runtime cannot run (EA7). | The scope contract (`c75205df`) |
| EF2 | How a step reads its request from the signed intent. The authority note's section 6.2 says a `propose-manifest` intent names the lane, the hold and the instance "in its `source` field", and that a staging's source is "the hold's item ID; the hold's current instance; the commit". Section 5.7 says the steps `instance` and `token` are asked with a signed request that "names the hold, the task scope with its incarnation, and a new instance ID", and states no field. Neither pinned lane has a field `source`. `report` of `issue` has `commit` and `commitment`, and no hold and no instance. `propose-manifest` of `change` has `integration`, `hold`, `lane`, `foreignHold` and `instance`. | No reading is built in. `HoldReads` is a required option of `holdCapability`, with one reader for `stage` and `check`, one for `instance` and one for `token`. Null from a reader refuses the step. The test fixture has its own reader. Step 16 cannot run a real `stage` for `report` of `issue` until an owner says where that intent names its hold and its instance. | The authority note's successor (request `837943bb`), with I2 for the lane rows |
| EF3 | The action and the refusal names of a step. The contract gives `stage` "the grant of the act that opens the hold type", and `check` "the act's own grant, in its ordinary window". The note gives `instance` and `token` "the grant", and names no action. For a `check` of an intent that is addressed to another scope, the act is not this scope's. The note names three refusals of a step: `not-staged`, `no-workspace` and `holder-changed`. It states other judgments with no name: the hold is `held`, the signer's member is the holder, the instance named is `current`, the `fork` is `selected`, the instance ID is new. | Every step of a hold is judged on the grant of the one act that opens the hold's type. A `check` for this scope's own act is judged on that act's grant. Both windows are given to the grant decision, which the caller supplies: no window is judged in `prepare.ts`. A named refusal is `capability-refused` with its name. A judgment with no name is `guard-failed`, with no name. `stage` refuses `not-staged` for every failed judgment of the hold and the instance, and `guard-failed` when a live root already holds the commit under the commitment, which the step `check` reuses. "For an agent, with `controllerActive`" is the grant guard's (plan step 5). That the commitment is `accepted` and the signer is its performer is not judged at the step: no form of the capability names that state or that slot, and both lane rows judge it at the act. | The authority note's successor |
| EF4 | The kinds of the operations of `hold@1`, and their attempts. The contract names `stage` and `check`. The note names no kind for a fork's creation, the read of a head, a mint or a revocation. | `HOLD_KINDS`: `stage`, `check`, `fork`, `head`, `mint`, `revoke`. `HOLD_ATTEMPTS`: 3, 1, 3, 1, 1 and 3, from sections 5.1 and 5.8 and gap G3. Rules are built for `stage`, `check`, `mint` and `revoke`. A fork's creation and the read of a head are opened by `workspaceEffects` and have no rules, so no outcome of them is judged and none is sent: they are step 18's. The steps `retry` and `job-read` have no code. | The authority note's successor; the builder, at steps 18 and 24 |
| EF5 | A record's key, the names of its values, and what a `record` effect states. The texts give them in prose (I2 delta D11). The contract's `Effect` has `values` and does not say whether it is the whole record or the change. The evidence of a mint and of a check has no stated body (E2). | Each `record` effect states its record's state and its values whole, so that an entry is read alone and a `carried` part reads all of it. The fold keeps the record as stated, with `seq`, the entry that last recorded it. Keys: `root` `[number]`; `pin` `[consumer, intent]`; `check` `[intent, root]`; `receiver-pin` `[export]`; `fork` `[hold]`; `token` `[number]`; `instance` `[hold, instance]`. Values: `root` `commit, hold, instance, under, intent, consumer, operation`; `pin` `root, commit, admitted, released, by, check`; `check` `intent, commit, consumer, lane, hold, instance, root, attribution, record`; `receiver-pin` `checkpoint, hold, instance, holder, task, k, decided, by`; `fork` `seed, operation, id, name`; `token` `purpose, hold, instance, mint, id, ends, revocation`; `instance` `hold, task, epoch`. A number is the count of its kind plus one. The body of a `confirmed` mint is `{ token, ends }`. The body of a `confirmed` check is `{ record }`: the ancestry record, or null for a read that was cut short, which makes the record `too-large`. | The authority note's successor |
| EF6 | A bound on the records of one kind. Section 6.11 says the scope indexes records by kind and state, and section 9.1 pages a read of them by 100. No text bounds what a rule reads. | `StateView.records` gives every record of a kind, by state and by one value. A rule's read is bounded only by what the scope holds. `sqlite.ts` reads by the index of kind and state, and compares the value in the rows it gets. | Request `cc570904`; the proof plan |
| EF7 | The tokens of one hold. Revision 18, section 5.7, "The fan-out of one entry", asks for a bound on the tokens of one hold that may be `live` or `minting` at once, before an entry that ends a hold is built, and proposes no number. | `HoldOptions.tokensPerHold`, required, with no default. The step `token` is refused `guard-failed` at the bound. Section 5.3, rule 4, needs two. The fan-out of one end is then at most that many records and revocations. The bound on one entry's effects is still owed. | The proof plan, with `cc570904` |
| EF8 | The seed of a fork, in the capability's own terms. Section 5.2 gives it as "the commit of the latest report" of the commitment whose root is `live`, or the current manifest's. No form of the capability names an item type, and `from` is `report`, `manifest` or `destination-head`. No text says which entry makes a fork `deleting`. | The seed is the commit of the latest act of this scope that was admitted on a `live` root under the hold's commitment and still holds its pin: a refused report and a superseded or published manifest have released theirs. `from` is the type of the item that the admitting entry opened, when that is `report` or `manifest`; another type is no seed. `fact` is the admitting entry. With none, the seed is the destination's head, read by an operation. A fork's deletion is not derived. | The authority note's successor |
| EF9 | `pin-release` with `commit` alone. The contract lets the effect be written with `commit`, and a pin's key is the consumer and the intent. `refuse-report` of `issue`, and `propose-manifest` and `publication` of `change`, write that form from another entry than the one that admitted the act, so no intent is at hand. | It releases this scope's own pin that is `held` on that commit, and only when exactly one exists. With two, as after two reports of one commit, it releases none: a pin that stays keeps its root, which is the safe side. | The authority note's successor, with I2 for the rows |
| EF10 | What the guard `ancestry` judges in the commit. Section 6.2's guards 3 and 6 need "an input that is `selected` under the source commitment at this commit". The guard's arguments are `commit`, `row`, `pin`, `selected` and `earlier`, and `report` of `issue` writes `commit` and `row` only. No commit object is retained, so "reachable from the recorded head" cannot be derived in a commit. | A local record with a `selected-report` stop, or with the basis `input`, is refused `ancestry-stale`: the commit cannot judge it. `walk` takes the selected inputs as a given list, so its caller must supply them. In the commit the guard judges guards 1 to 6 as far as they read the lane's records and the retained snapshot, and guard 7. That `published` is recorded exactly when the commit is reachable, that no stop is reachable, and that every commit of a prior check's F is carried unless it is, are derived by `walk` and again by a replay, and not in the commit. | The authority note's successor; the builder, at step 22 |
| EF11 | What `license` and `settled` read. "That hold is the checkpoint's" names no member that the lane holds. "The task scope that the ended hold records" does not say which instance when a hold had several. "Whose own effects make the release of this export final" names no effect. | The task scope of a hold is the task of its latest instance. `license` judges the source, the receiving hold's present instance and the pin, and nothing more of the checkpoint. A pin that is `released` refuses `export-not-authorized`. `settled` requires that the source entry is of that task scope and holds a `state` effect to the final state. That the item is the release of this export rests on the entry holding the send, which the delivery's source check shows. | The authority note's successor, with IA for `platform:task@1` |
| EF12 | The hash function of a commit ID, and what the walk verifies of an object. No text fixes one, and a `commit` value is 40 or 64 lower-case hex characters. | One walk has one length, that of its start. An ID of the other length is refused. `walk` checks every ID, every object's type and every parent line. It does not hash an object: `derive` has no SHA-1, and that check is the Git reader's (plan row T16). A walk that cannot read gives `unreadable`, with one of `bad-object-id`, `mixed-hash`, `missing-object`, `not-a-commit`, `malformed-commit`, `bad-snapshot` and `no-live-root`. Those are names of the function's result and of no refusal. | The proof plan, key O15; the builder, at step 17 |
| EF13 | Three smaller points of the walk and the guard. The refusal `unnamed-work` is "with the commit". No text orders F or the stops, or says which prior check answers when a commit has several. Reachability has no bound. | A guard answers with a name alone, so the commit is not carried. F and the stops are in the order of a breadth-first walk by parent lines, with the start first. The latest prior check answers, for a stop and for the basis `own-check`. `bounds.reads` is an optional limit of the caller on the commits read in all, and gives `too-large`. It is no number of the texts. | The scope contract, for the refusal; the authority note's successor |
| EF14 | What each record reserves, and which entry makes some states. Section 5.8 gives a root that is `creating` "for each attempt its two tokens", and no entry makes those tokens' records. No form or step records a root `retiring`, or moves a root whose every attempt was refused. | `holdReserves`, in entries: a `pin` that is `provisional` or `held`, 3; a `receiver-pin` that is `standing`, 3 less `decided`; a `root` that is `creating`, 3, for the pin; a `root` that is `retiring`, 1; a `token` that is `live`, 6; a `fork` that is `creating`, 42; a `fork` that is `selected`, 6. The closure of `stage` is the check, 2, and that of `mint` is the revocation, 6. The fork and read tokens of a staging are not derived and not reserved: they reserve as tokens when a step makes their records. A root that no attempt created stays `creating`. No retirement is built. | Request `cc570904`; the authority note's successor |
| EF15 | Types that the steps needed outside their modules. | `CapabilityGiven` also gives the pinned definition and the scope's own history (`derive/src/capability.ts`). `Owners` has an optional `reserves` (`derive/src/ledger.ts`). The store keeps records and the index (`scope/src/sqlite.ts`), and the object has `prepare` (`scope/src/object.ts`). The port's type states no steps, so `stepsOf` reads them from the capabilities value. `Preparing` types the operation beside `ScopeApi`. `PreparationStatus` is in `derive`. The snapshot's domain tag is a constant of `ancestry.ts`, and `RetainedInput` has no kind for a snapshot. | The builder, at step 16 |
| EF16 | The kind of a check entry. `propose-manifest` of `change` presents a pin of the kind `hold@1:check`. `kindOf`, in `derive/src/operand.ts`, gives an outcome entry no kind. | Not changed: the file is not these steps'. `holdCapability` answers that it does not implement a form `kind`, so `change` stays `unsupported-definition` until a judge gives a preparation entry and its outcome entries their kind. | The builder, at step 16 |

## 9. Steps 17 and 21: the Git package

Written 2026-10-05, by the worker of steps 17 and 21. Entries have the
prefix EG. "Revision 18" is the authority note at `99bc48e8`, adopted, and
section numbers are its own. "The review" is
`notes/2026-10-05-i3-git-review.md`. The source is `packages/git`. Nothing
here changes the bytes of an entry, a state digest or a pinned digest: the
package writes no entry.

| # | Where the texts differ or are silent | Implemented | Owner |
|---|---|---|---|
| EG1 | The hash function of the canonical repository. No adopted text names it. Section 6.2 puts a commit ID in a staged ref's name and in the ancestry record, as text. Every recorded fact of the facts file is a SHA-1 repository. Git also has a SHA-256 object format, whose IDs are 64 hex characters. | SHA-1 only. An object ID is 40 lower-case hex characters and not the zero ID. An ID of 64 hex characters is refused `unsupported-object-format`, wherever it is met: as an argument, in a commit's `tree` or `parent` line, as a ref's target. The gateway refuses a push whose commands hold such IDs, as no ref-update command. | The authority note's successor, with the installation design, which names the host (plan question Q6) |
| EG2 | The proof plan's table "Interrupted transfer" (key O15) has four rows: a part at the wrong offset, a transfer cut between parts, a lost reply to the final append, and a lost reply to the store step. They describe the earlier log's transfer of one object in parts, which the proof plan itself retires. It says the tables are run "against the staging path I3 selects". Section 6.2 selects a read of the fork and one new ref, and names no parts. | The parts protocol is not moved (the review, section 2.3). T17 shows the one row that the selected path has: a transfer that stopped leaves a commit that resolves by its ID with an object absent under it, and the closure is then not complete, object by object. Git's own transfer checks each received object (`transfer.fsckObjects`), and the reader checks each again. The three rows about parts and appends have no path in I3 and no test. | The proof plan (R4), for the rows; the C2 successor, for the checkpoint store, which the table also names |
| EG3 | Bounds on what is read from a repository. The contract's bounds hold none. Section 6.2 proposes 4,096 commits for the ancestry walk and 64 for its lists, and proposes none for the snapshot (U18) or for reachability (U17, U21). Git sets no length for a ref name. | Stated constants, each a parameter: `READ_BOUNDS` (a commit 1 MiB and 64 parents, a tree 8 MiB, a blob 32 MiB, a closure check 100,000 objects, a snapshot 100,000 refs), `MAX_REF_NAME` 255, `SEND_OBJECTS` 100,000 for what one push sends, and `COMMAND_MS` 120 seconds for one command. Past one, the answer is `too-large` or a failed command, and nothing is judged. The walk's own bound is step 16c's. | The proof plan (R4) |
| EG4 | Which ref names are allowed. Section 6.2 gives the staged ref's form and section 6.10 the receipt's. Section 12.1.5 holds the destination's `branch` as a value, and no text says which characters a branch may have. | `refName` follows `git check-ref-format` and is narrower: ASCII letters, digits, `.`, `_`, `-` and `/` only, and no component that begins with `-`. A repository whose branch has another character cannot be a destination's branch here. | The authority note's successor, for the branch's form; the installation design |
| EG5 | A gitlink: a tree entry that names a commit of another repository. Section 6.2 and section 6.5 ask that a commit's "whole closure" is in the canonical repository. A gitlink's commit is never there. The plan's section 6.3 says gitlinks are refused. | `Reader.closure` ends at a gitlink: not complete, `gitlink`. `Git.send` refuses a commit whose own tree holds one, at any depth, before anything is sent. It does not read the trees of the other commits that one push sends. | The authority note's successor |
| EG6 | Which attempt a read confirms. Section 5.7 says a branch update, a receipt, a staged ref and a first head are "shown to have happened by" a read of the ref. Section 6.6 says the read "does not say which attempt did it", and that attempts whose evidence was unknown "are not given an answer". The contract lets `confirmed` have the basis `read`, and step 4's rule accepts a read only as an attempt's first outcome (entry EB3). No text says which attempt gets it (the note's point O11; R1-38). | `attemptOutcome`, in `push-outcome.ts`: an attempt is `confirmed`, with the basis `read`, only when its own whole answer reported the update and a read of that ref then shows exactly the value it sent. A lost reply is `unknown` whatever the read shows. A send that was not sent, or that the host refused, is `refused` with the basis `own-answer`. | The scope contract, for R1-38; the authority note's successor, for O11 |
| EG7 | The body of the evidence. Entry E2 left `body: unknown`, for "the step that records an effect of its owner". No text states a body for a push. | Three bodies, each plain data. `own-answer`: `{ ref, send, why }`, where `send` is `not-sent` or `refused`. `read`: `{ ref, value, reported }`. `none`: null, as the operations driver writes it. No body holds text of Git's or of a host's. Step 27 owns the destination's `wellFormed` rule, and may narrow them. | The authority note's successor |
| EG8 | What a gateway is shown before it takes a plaintext. Section 5.7 says the driver gives it "only after the outcome entry is sealed, and only when that entry made the token `live`". A gateway reads no entry, and no text says what it is given. | `Gateway.open` takes the token's ID, its state as the sealed entry left it, and the plaintext. Any state but `live` is refused `token-not-live`, and nothing is kept. That the entry is sealed is the driver's to hold (step 19). | The authority note's successor; the builder, at step 19 |
| EG9 | What is the host's own: how a token is presented, and which answers come before any ref is updated. The earlier code fixed both to the earlier host. The plan's question Q6 is open. | Both are parameters. `GatewayOptions.credential` has no default. `GitOptions.refusals` is empty, so no code of a host makes a send `refused`. | The operator, under the installation design (Q6) |
| EG10 | Where the gateway's record lives. Section 6.1 says it records "durably and before it forwards". Section 6.6 reads that record as evidence. No text says which store holds it or who reads it after a restart. | A port, `GrantRecords`, with one method. A write resolves only when the record is durable. The gateway counts the forward when it records "forwarding", so a record never says less was forwarded than was. A record that cannot be written forwards nothing. There is no production store: test support has one in memory, labelled. | The authority note's successor; the builder, at step 27 |
| EG11 | Requests that update nothing. Git's client reads the refs before a push, may fetch, and sends an empty probe before a large push. Section 6.1 says the gateway "forwards one update for a grant and then closes it", and does not mention them. | They are forwarded with the credential while the grant is open, counted as `reads`, and not bounded. Only the three paths of Git's smart HTTP protocol pass. After the one update the grant is closed and nothing passes. | The authority note's successor |
| EG12 | Remotes that are not a host. Section 5.3 is about a host over HTTPS. The plan's tests, and the runner's checkout (step 25), use a repository on the same machine. | A transport `local`, which also takes an absolute path and a plain-HTTP URL of `127.0.0.1`. The default is `https`. No production entry passes `local`. | The builder |

## 10. The merge of steps 16a to 16c, the seams it closed, and what step 16 waits for

Written 2026-10-05, by the integrator of I3. Entries have the prefix EH.
"The contract" is the scope contract's revision 14 at `fa6417e6`, and "the
authority note" is revision 18 at `99bc48e8`. Both are adopted, and section
numbers are their own. "The lane forms" are revision 14 at `4b3bf5da`. The
lane data is `packages/lanes/definitions/issue.json` and `change.json`, read
by a script and not changed. The production capabilities port is still
null: nothing below runs in production, and no pinned digest, state digest
or sealed entry changes.

Entries EH1 to EH5 are the choices of the merge and of the seams that
needed no owner's decision. Entries EH6 to EH12 are what step 16 waits
for: wiring the production capabilities port, and removing the scripted
capability.

| # | Where the texts differ or are silent | Implemented | Owner |
|---|---|---|---|
| EH1 | The window of a step's observation. The contract's section 6.11 gives `stage` "a ten-second observation" and `check` "the act's own grant, in its ordinary window". The authority note's section 5.7 gives `instance` and `token` ten seconds. The table of windows in its section 3.3 is by act and by kind of scope. It has no row for a step, and none for a `check` of an intent that is addressed to another scope, whose act the staging lane does not hold. No text says what a commit does when its judge asks another action or window than the one the read was made for. | A step's rules name a window of the grant guard: `WINDOWS.once`, or `WINDOWS.ordinary` for `check`, whatever the kind of the scope. `PreparationWindow` and its constant are removed. The scope reads the observation before the turn with that action and window, and the commit decides with `judgeGrant` through the authority port. A commit whose judge asks another action or window is answered `authority-unavailable`. The port learns of a preparation entry that retains its read as it does of an act's, so heads do not go back. Witness: the first test of `packages/scope/test/authority.test.ts`, with a scripted step, a stand-in of test support that derives nothing. Control: with the read made on the ordinary window the test fails by its assertion. | The authority note's successor (request `837943bb`) |
| EH2 | Where an entry holds what a hold's workspace derives. The contract's section 4.1, "The order of an entry's effects, exactly", gives five groups, and attention is the last. The authority note's section 5.7 says the code of `hold@1` "runs after the entry's declared effects". Neither places its effects among the five groups. No text says how a judge is given this code, or the binding of a reserved request. | The effects stand after the ends of the holds that end with what they are under, and before attention. `Capabilities` has two optional members: `workspace`, which is `workspaceEffects`, and `bound`, which is `boundLicense` with `licenseRefused`. `holdCapability` supplies both. Rules without them, and no rules, change no entry: the scripted capability and production are as they were, and the lane scenarios pass unchanged. The timed judge is now given the capabilities value. Witness: `forms-records`, the workspace test, with a control. | The scope contract (`c75205df`), for the order; the builder, for the members |
| EH3 | The kind of an outcome entry. The contract's section 6.2, "Which entries have a kind, exactly", gives "a preparation entry, and each outcome entry of its operation" the capability and the step, and says that a kind is read from the entry's own bytes by every reader. An outcome input holds the operation's ID, the attempt, the result and the evidence (section 4.1). It holds neither the capability nor the step. After a staging, the operation `check` is opened by the outcome entry of `stage`, and by no preparation entry (section 6.11, "How R3's order of steps maps onto entries", step 4). So the kind of a check entry is in no bytes that a reader of a fetched entry has. | `kindOf` gives a preparation entry the kind of its capability and its step, from its input. It gives an outcome entry none. `holdCapability` still answers that the form `kind` has no code, so `change` is still `unsupported-definition` under the capability's code. Witness: `forms-prepare`, the kind of the sealed entry. This replaces the reading of EF16, which named the builder. | The scope contract (`c75205df`) |
| EH4 | A bound license request that is refused before the handler's guards for a reason that the table of the authority note's section 4.2 does not list: `unknown-message`, for a sender under another definition than the handler's `from` names. The text says the first decision of a bound request uses its entry "whatever it decides". No text says which listed capability a judge asks. | Every refusal of a bound request is a settling entry whose one effect is the record that sets `decided`. The judge asks each listed capability version whose `reserved` table, in the contract package, declares a `tell` of that message name. An applied bound request is a settling entry too. Witness: `forms-records`, the license test, through `judgeDelivery` on a handler of the fixture, with a control. | The authority note's successor |
| EH5 | Where the preparation operation is declared, and how a client sends one. | `prepare` is an operation of the contract package's `ScopeApi`. The service class, the client's HTTP transport and its service binding have it, and `sendPreparation` takes a transport. Witness: the route test, through the HTTP route and the service binding. | The builder |

What step 16 waits for. "Verified" says what was checked here, against
the lane data and the adopted texts. "Kind" is one of: a fault of the lane
rows; a silence of a text; a reading error of the worker of steps 16a to
16c.

| # | Item | Verified | Kind, and owner | The smallest decision |
|---|---|---|---|---|
| EH6 | From EF2. How a step reads its request from the signed intent. The worker reported that `report` of `issue` has no hold and no instance, and that neither lane has a field `source`. | Yes, in the data. `report` has the fields `claims`, `commit`, `commitment`, `evidence`, `summary`, `terms` and `tree`. No act of either lane has a field `source`. The authority note's section 6.2 says that a `propose-manifest` intent names the lane, the hold and the instance "in its `source` field". The lane forms, sections 4.2 and 5.4, say that this `source` is four fields, `hold`, `lane`, `foreignHold` and `instance`, in one of two shapes, and the data has them. For a report, section 6.2 states the source and does not say that the intent names its hold or its instance. Both lanes guard `take-hold` with `hold-held`: no other hold under the commitment is `held`. So a commitment has at most one held hold, and that hold has at most one `current` instance. For `instance` and `token`, section 5.7 says "a signed request", and section 4.2 gives a direct request eight members that are not those of an intent. No text states a kind or a field for either. | Not a fault of the lane rows. A silence of the authority note, and a name that the two notes use differently. For `propose-manifest`, "neither lane has a `source` field" is true of the bytes and is a reading error as a finding: the lane forms state the four fields. Owner: the authority note's successor (`837943bb`). | Three statements. For `report`: the hold is the one held hold under the commitment that the intent names, and the instance is that hold's `current` instance. No row changes. For `propose-manifest`: the commit is the field `integration`, and the source is `hold` and `instance`, or `lane`, `foreignHold` and `instance`, as the lane forms have it. The staging lane of the second shape does not pin `change`, so it reads these by name. For `instance` and `token`: the kind and the fields of the signed intent that asks for each. |
| EH7 | From EF9. `refuse-report`, `propose-manifest` and `publication` write `pin-release` with `commit` alone, and a pin's key is the consumer and the intent. | Yes. `issue`: `refuse-report`, effect 2, with the report's slot `commit`. `change`: `propose-manifest`, effect 15, with the previous manifest's slot `integration`; `publication`, effect 8, with the merged manifest's slot `integration`. The contract's section 6.11 gives the effect two forms of arguments, and `commit` alone is one. It gives a pin the key "the consumer's scope reference... and the digest of the intent". It does not say which pin `commit` alone names in an entry that did not admit the act. Two reports of one commit may both be `reported`, each with a `held` pin. | Not a fault of the lane rows: they write a form that the contract gives. A silence of the rule behind the form. Owner: the authority note's successor, which is the authority for the rules of `hold@1`, with the scope contract for the form. | One rule. The smallest that changes no row: the pin that `commit` alone names is this scope's own pin that is `held` on that commit and whose admitting entry opened the item that the commit was read from. A pin's value `admitted` is that entry, and an item's ID is the `seq` of the entry that opened it. The rule must then be given the entry's subjects, which is a change of source and of no form. Until then EF9 stands: with two held pins on one commit none is released, and each keeps its root and its 3 reserved entries. |
| EH8 | From EF10. `report` writes `ancestry` with `commit` and `row` only, while guard 6 and the basis `input` need the commitment's selected inputs. | In part. The data is as reported. The lane forms, section 5.5, give `report` no `selected` and no `earlier` on purpose: the argument `selected` is "the commit of each selected report" of a manifest, and it is not the inputs of a commitment. The same section says that guards 2 to 6 "hold against this lane's records and items at this commit". So the guard reads the lane's `input` items from the state, and needs no argument for them. What no text says is by which names the code of `git-read@1` finds them: `issue` has the item type `input`, the state `selected`, and the slots `for` and `report`, and no capability form names an item type (the authority note's section 5.7). The second part of EF10 is as reported: guards 3 to 5 judge reachability from the record's `head`, "in the commit", and a commit holds no commit object. | Not a fault of the lane rows. A reading error as far as the argument `selected` is concerned. A silence of the authority note for the rest. Owner: the authority note's successor; the builder, at step 22, for the replay. | Two statements. How the guard finds a selected input of the source commitment: by the stop's `input` fact, as an item of this scope, with the state and the slot that the note names. And where reachability is judged: by the walk at the check and again by a replay, and not in the commit that admits the act; or which commit objects a scope retains so that the commit can judge it. Until then a record with a `selected-report` stop or the basis `input` is refused `ancestry-stale`, so `use-input` gives no way forward. |
| EH9 | From EF16. `propose-manifest` presents a pin of the kind `hold@1:check`. | Yes. `change`: `acts.propose-manifest.presents.pin.kind` and the manifest's slot `pin` both list `hold@1:check`. The lane forms, section 3.8, say that the pin entry is the outcome entry of the step `check`, and the contract's section 16.3 says the same. That entry's kind is in no bytes that the change lane has: entry EH3. | Not a fault of the lane rows, and no reading error. A silence of the scope contract. Owner: the scope contract (`c75205df`). EF16 named the builder, and the builder cannot decide it. | One rule on bytes. Either the kind of an outcome entry is derived from what the entry holds, such as the capability and the kind of the one record of a check entry, which changes no entry. Or the outcome input states the owner and the kind of its operation, which adds members to an input. No outcome entry of a capability is sealed anywhere today. |
| EH10 | From EF7. The tokens of one hold that may be `live` or `minting` at once. | Yes. The authority note's section 5.7, "The fan-out of one entry is not bounded by the budget", asks for the bound "before such an entry is built" and proposes no number. Section 5.3, rule 4, needs two. The judges now build such an entry when they are given the code (EH2), and no production port gives it to them. | A silence that the note states itself. Owner: the proof plan, with request `cc570904`. | One number for `tokensPerHold`, at least 2, and the count of `record` effects and revocations of one ending entry against the bound on one entry. |
| EH11 | From EF14. What each record reserves, and which entry makes some states. | Yes. The authority note's section 5.8 reserves, for a `root` that is `creating`, "for each attempt its two tokens", and no step and no row of section 5.7 makes a `token` record for a staging. Section 6.2, "Retiring a root", says "S records `retiring` in an entry" and names no input, no step and no signer for it. Section 5.7 says a fork's deletion "follows" the end and names no entry that makes the fork `deleting`. Capacity is counted in entries only. | A silence of the authority note, and work that request `cc570904` owns. Owner: the authority note's successor; `cc570904` for the other four dimensions. | For each of the three: which entry makes the record or the state, and by which input. Until then a staging's tokens are not derived and not reserved, no root is retired, and no fork is deleted. Step 16 can wire the port without them only if the owner accepts that. |
| EH12 | What step 16 itself must build once EH6 to EH11 are decided. None of it needs an owner. | Read from the seams marked `I3 merge:` in `packages`. | The builder | The capabilities port's type gains the steps, and `stepsOf` goes. The production ports hold `capabilitiesOf(holdCapability(...), gitRead(...))` and the same value as `owners`. The contract package's `DOMAINS` gains `artroom-snapshot-1`, and `RetainedInput` a kind for a snapshot, which the scope stores before the check entry that names its digest. The scripted capability and its users go. The replay is given the same rules at step 22, and the operations driver sends the attempts at step 19. |

## 11. Marks and rules, prepared ahead of adoption

Written 2026-10-05, by the worker of the source rows I3-1 to I3-11. Entries
have the prefix EJ. "Revision 15" is the scope contract at `7f1ea903c`, and
"revision 20" is the authority note at `4ef1a5e37`. Both are filed for
review and are not adopted. This source builds what they state, so that it
can be merged after adoption with whatever the review changes. Until then
nothing here is in force. Section numbers are those of the two texts. The
rows are those of revision 15's section 11.13.

Added 2026-10-05, with the repairs of section 12: both revisions are
adopted since, at those two commits. The paragraph above and the entries
below stay as they were written. The adoption is of the two designs. It is
no review and no acceptance of this source, and each question below stays
with its owner.

Each entry is a place where a proposed text is silent, cannot be built as
it stands, or differs from the other, with what the source holds. Each
ends with the question for its owner. No entry's bytes, no state digest and
neither lane digest changes.

| # | Where the texts differ or are silent | Implemented | Owner, and the question |
|---|---|---|---|
| EJ1 | Row I3-6, place 7. Section 6.1 gives `outcomes` one mark for each operation kind, `{ code, row }`, and says that the rule returns "the entry's effects and sends, as places 5 and 6". A request of place 6 has clauses, "the mark's own, as data". An outcome's mark has none. A creation also needs a cause, and section 7.2 has no cause for a scope that an outcome entry creates. Revision 20's section 12.1 has the register's selecting outcome send the `create` of a directory, and its row 33 has the outcome of `judge` send a `relate`. | A request that an outcome's rule sends has no clause: its result is recorded and changes nothing. A `create` among them is a fault of the rule, so nothing is written. So the register's `create`, and any clause of the `relate` of `judge`, cannot be built from these texts. | Revision 15, with revision 20. Where are the clauses of a request that an outcome entry sends written, and what is the cause of a scope that it creates? |
| EJ2 | Row I3-10. Section 16.1 covers a scope by "the reference that the scope itself records", read "from its own history". Section 6.6 puts that reference in the body of a `create`, and says that this changes the bytes of every creation message. No source writes the member, and the row may change no entry. | `covers` takes the reference as an argument. The judges of an act and of a preparation are given it. The runtime gives the reference that its authority port read from, which test support still answers by hand (entry ED13). A replay reads the genesis: the member `membership` of the creation's body, or the scope itself for a membership scope (`membershipOf`). A scope that records none is covered by no filter. So a replay of an act that was judged on a filter reports a mismatch until a creation writes the member. | The builder, at the steps that create scopes. Revision 15: is the member written by the same change that adopts the filter, and what does a directory, which is founded and not created, record before its slot `repository.membership` is set? |
| EJ3 | Row I3-2, place 2. A result clause runs in a later entry, with the subjects "as that entry resolved them" (section 6.6). A name that a mark selects was resolved by a rule, from the input and the state of the entry that made the send. No text says how the later entry binds it again. | The validator lets no clause name an `also` name that a mark selects, or one that is reached through it. It is refused as a name that selects nothing there. In a clause such a name is unbound. | Revision 15. Does a clause run the rule again, and on which input and state? |
| EJ4 | Row I3-2, place 6. A result names its request by ordinal, and a send that is not made takes none. The source finds the form of a recorded send by the message's type and name. A rule's request states neither in the data. | A written list of sends holds at most one mark. With one, each written send of the list is always made exactly once: no `if`, no fan-out, no unbound subject, and no `index` send. The form of a recorded send is then found by counting. Any other list is refused, `shape`. | Revision 15. How is the clause of a result found again in a list that holds a mark? |
| EJ5 | Row I3-2, place 3. The listing writes the mark as "the type of a field, or of a slot". It does not say whether an element of a list or a member of a record may have one, or whether a marked field or slot takes a default. | A mark is the type of a field of an act or of a handler, or of a reference slot or a value slot, and of nothing nested. A default on one is refused: only the rule could check it. A constant, and a source of a written type, are not assignable to it. A timed rule that copies such a slot is refused, because the type states no bound on its bytes. | Revision 15, to confirm or widen. |
| EJ6 | Row I3-2, and point R1-59. Section 6.1 says that "the static size of the row counts" the most that each rule returns. The point is open, and no form states that most in the data. | The rule table states `most` for a rule at an effect, and a rule that returns more has a fault. The static counts take nothing from it: what an effect mark can set is not in a row's reservations (section 17.2), and a mark counts as one form and one send against the bounds. No delivered platform definition has a timed rule, so nothing is under-reserved today. | Revision 15 and request `cc570904`, with R1-59. |
| EJ7 | Row I3-4. Section 6.1 gives a rule six things. Item 2 names `observed`, and item 4 names the values beside an intent and the retained bytes of a definition. The source's `Input` has no `observed`, and `Beside` has no value. Item 2 does not name a diagnosis, whose entry runs the `undelivered` clause. Item 6 does not name the entry's own position. | `RuleGiven` has the state, the input, the time, the entries in `uses`, the scope's own entries, and `resolved`. The input is the act, the genesis, the delivery, the outcome or the diagnosis, as it arrived. `resolved` holds the fields, the subjects, the signer and the bounds, and also `at` and `self`: the scope's reference and the `seq` of the entry being written. A rule needs them to return an effect on the item that its entry opens. `observed`, values and definition bytes are not given, because no source holds them. | The builder, when `observed` and values beside an intent are built. Revision 15, to confirm `at`, `self` and the diagnosis. |
| EJ8 | Row I3-4. Revision 20's table of marks gives each rule a place, what it reads, what it returns and its refusals, in prose. Section 6.1 makes "a refusal name that its specification does not state" a fault, and asks of each rule "whether it reads the commit's reading". | A rule states its `place`, and where it has them its `refusals`, its `most` and `clock`. An entry for which a rule with `clock` was run judges time. A rule at `grant` is not run when a grant is held, so this is by the rules that ran, and not by the row as written. Every act judges time in any case. | Revision 20, for the form in which a version states these. |
| EJ9 | Row I3-5. Section 12.1.6 says the four values "are those of the delivery's `from`, which the entry's own input holds whole, with the kind of the sending scope". The record has four members, and none is the kind. | The rule gives `{ scope, incarnation, seq, hash }` from the delivery's `from`. The kind is not recorded. | Revision 20. Is the kind of the sending scope meant to be in the record? |
| EJ10 | Row I3-6, check 11. Section 6.1 lists the checks on the joined list, and the faults of a rule. It does not place every case. | A refusal, as for a written effect: a value outside its slot's type (`bad-field`), a member whose handle is too long, a full party list, an item that was final before the entry, a required slot unset, and a type at its `max`. A fault: an effect outside the eight forms, an effect on no item, a slot or a state that the type does not declare, a second opening, an opening in another state than the initial one, a value for a detached text, an operation that the definition does not own or out of its ordinal, an attempt that is not the first of an operation of this entry, and a conflict with another effect. A rule may set a fixed slot of an item that existed before the entry: the commit has no check on that for a written effect either. | Revision 15. Should the commit stop a rule that sets a fixed slot after the opening? |
| EJ11 | Row I3-6, place 7. Section 4.2 says "an outcome that does not follow is `bad-input`". It does not say what an outcome's rule may return that the entry cannot hold. | An outcome entry is never refused. So an effect of its rule that a check would refuse is a fault, and nothing is written. An operation that the outcome opens is stated in `opens`, and is no member of its effects. With a rule whose `clock` is set, the outcome judges time. | Revision 15, to confirm. |
| EJ12 | Row I3-6. Section 4.2 lets a guard that is a mark refuse `unsupported-definition`. `RefusalReason` did not have that code, and a client refused it in the answer to an act. | `RefusalReason` has it. The bytes package's table and the client accept it. The row of the client's test that used it as a reason no act can meet now uses a made-up one. | None: revision 15 states it. |
| EJ13 | Row I3-7. Section 4.2 says the genesis judge "runs its rule" at a founding. It does not say what a founding writes when the rule does not pass. A rule may pass "with the member that the act's forms read as the signer". The fold reads an entry's signer from `authority[0]`. | A founding that the rule does not pass is refused `unauthorized`, and nothing is written: no refused genesis. A member that a rule gives is the signer of that judgment, with no principal. The entry records `authority: []`, so the fold, and a clause of a request that the act sent, read no signer from it. Every rule of revision 20 passes with no member. | Revision 15. If a rule ever passes with a member, where does a later entry read that member? |
| EJ14 | Row I3-9. Section 9.3 says a replay reports `platform-code` "with the name and the version". The report's `trusts` is a list of texts. | One text for each platform definition whose rules ran: `platformCode(named)`. An outcome entry of an operation that the pinned definition owns is judged. One of another owner is still `unsupported-definition` (entry EC3). The replay still takes each recorded grant as current, so `observation-older` and the value of an observation are not checked: that is plan step 14. | The builder, at steps 14 and 22. |
| EJ15 | Row I3-11. Section 16.1 counts a key's observation under its key and under its member, "if that revision is adopted", and gives the rules one subject. | The fold keeps a head for the key and for the member of each retained observation, by observed scope and incarnation. The rules have no subject yet: no source reads them. Before the turn, the port still decides whether to read again from the heads of its own run, and the commit decides on the folded state. A state that holds no head has no member for them. | The builder, with the read of the rules scope. |

The text contradicts itself in one place that matters to a reader of the
rows. Revision 15's section 11.13 says "Its rows are numbered I3-1 to
I3-9", and then lists eleven and counts eleven.

## 12. Repairs after the reviewer's two static readings

Written 2026-10-05, by the worker of the repairs. Entries have the prefix
EK. The readings are the reviewer's finished reports `92fa170a` (at
`ae3ea555`) and `f55ad7d0` (at `5d05de6f`). The adopted designs are now
the scope contract's revision 15 at `7f1ea903c` and the authority note's
revision 20 at `4ef1a5e37`. Each entry is a source choice that a repair
made where the texts state no form. No entry's bytes, no state digest and
neither lane digest changes.

| # | Where the texts are silent | Implemented | Owner |
|---|---|---|---|
| EK1 | The authority note's section 5.4, rule 7, bounds a pass and keeps no wake-up for an attempt that cannot be sent. No text says how such attempts are found again after a restart. The driver looked at one batch of them, once, and what was due could use that batch up. | A walk, in memory, for each life of the object. Each pass takes what is due, at most one batch, and one page of the attempts with no time to look at them next, at most one batch, after the row that the walk reached. A page that is not full ends the walk. While pages remain the driver asks to be woken at once, by a wake that `Wakes` keeps in memory beside the three stored ones. An attempt that still cannot be sent stays as it is recorded, and the durable mark of a send is as before. A restart begins the walk again. A scope whose definition cannot be run ends the walk at once. Witness: `operations.test.ts`, "after a restart the driver walks". | The builder |
| EK2 | Entry EB10 says that an answer in hand that cannot be written yet is kept in memory. The contract's section 4.3, item 3, and rule 2 of the authority note's section 5.4 say what a late answer is. No text says what the driver does with one that arrives while the scope's turn is unavailable, after the `unknown` entry has closed the attempt's row. The driver offered it once and dropped it. | The driver keeps at most one answer in hand for each attempt that was sent: the `outcome` input as first offered, with its operation, its attempt and its evidence. `answered` answers `unavailable` and keeps it. Each pass offers the answers in hand again, oldest first, at most one batch, whether the attempt's row is open or closed, and stops at the first that cannot be written yet. While one is in hand the driver asks to be woken after the delay of a turn that left work due, by the wake in memory of entry EK1. An answer leaves the driver's hand when the scope has judged it: written, a copy, a contradiction or no answer. Nothing on this path sends. A process that ends loses the answers in hand: the outside system's answer is then gone, and the attempt stays `unknown`, a duty, until that request's own answer is given again. A scope whose definition cannot be run asks for no wake-up for them. Witness: `operations.test.ts`, "a late answer that arrives while the scope's turn is unavailable". In that witness the turn that was unavailable asks for a wake-up at the same time, so the test does not tell the driver's own wake from it. | The authority note's successor, for whether an answer in hand must be durable |
| EK3 | The contract's section 4.1 gives `Evidence` two members, `basis` and `body`. Entry E2 left the body to the owner. No check required the body to be present: an outcome whose evidence had a basis and no body was written where the owner's rules had no `wellFormed`. | One guard of shape, `isEvidence` in the bytes package: a basis that the contract names and a body, both own members, and no other member. Any value is a body, and an absent one is not. The guard of an `outcome` input uses it, so a verifier refuses an entry without it. The ledger's `outcomeOf` uses it before the pairing of result and basis, and refuses with `bad-input`. The driver's check of a port's answer uses it, so such an answer is no answer and the attempt is `unknown`. The pairing rule, and the owner's checks of meaning and authenticity, are as they were. Witness: `forms-ledger.test.ts`, the mint's own answer with no body. | None: the contract states the form |
| EK4 | The authority note's sections 5.3 and 6.1 say what a gateway records and forwards for one grant. They do not say what holds when calls of one gateway overlap. Entry EG10 counts the forward when "forwarding" is recorded. The gateway read a grant's state before a wait and did not read it again after: two forwards of the granted update could both be sent under a record of one, `open` could keep the plaintext of a grant that was closed while its record was written, and a close during the write of "forwarding" came before the request left. | One phase for a grant, in memory: `opening`, `open`, `reserved`, `sent`, `closed`. Every call reads it again after each wait, and moves it with no wait between. The first forward that has read the one granted update takes `reserved`, and a second is refused `grant-used`. The request is built, with the credential, and given to the host in the step that makes "forwarding" durable, so a close is wholly before it or wholly after. A close takes `closed` and drops the plaintext at once, and writes its record after the write in flight. A grant closed while it opens is refused with a new reason, `grant-closed`, and gets no plaintext. A grant closed while `reserved` sends nothing, and its record ends `closed`, `forwarded: 0`, after the durable "forwarding" record: if that last write fails, the durable record still says "forwarding", which is `unknown` and never less than was sent. A grant closed after `sent` keeps `forwarded: 1`. A read that follows the claim is refused. Witness: `gateway.test.ts`, "a grant has one lifecycle across calls that overlap". The limit of entry EG10 stands: the phase is in memory, and there is no production store. | The authority note's successor, for the reason's name; the builder, at step 27, for the store |
| EK5 | The authority note's section 5.7, "Evidence of each outside effect", says the ancestry read is shown by "that read's own answer", and that its evidence is the ancestry record. The rules of the operation `check` took a `confirmed` outcome only with the basis `read`. The ledger lets only the basis `own-answer` follow an `unknown` (section 5.4, rule 2). So a check that was first `unknown` could never record its own late answer. | The rules of `check` take `confirmed` and `refused` with the basis `own-answer`, and no read is decisive for that kind. The body of a `confirmed` check is as entry EF5 has it: `{ record }`, the ancestry record or null. The late answer after an `unknown` is the ledger's, unchanged. The rules of `stage` are not changed: which attempt a read confirms is the note's point O11 (entry EG6). Witness: `forms-records.test.ts`, T21, the first check by its own answer and the second check `unknown` and then answered late. | None: the note states the basis |

## 13. Repairs after the review of milestone F

Written 2026-10-05, by the worker of the repairs. Entries have the prefix
EN. The review is the reviewer's verdict `fe34edbe` at `5635689ee`:
changes requested, with two findings. The adopted designs are now the
scope contract's revision 16 at `54420b41` and the authority note's
revision 21 at `f9ec25e4`. Each entry is a source choice that a repair
made where the texts state no form.

No form of an entry, an input or an answer changes. Neither lane digest
changes: no file of `packages/lanes/src` or `packages/lanes/definitions`
is touched. No member of the folded state changes. What changes is what
the commit derives from a rule's output in the cases of EN2 to EN8. The
one delivered rule, `notice-source` of the inbox, returns one `value`
effect on the item that its entry opens, and meets none of those cases.
This rests on reading that rule and on the unchanged tests. No stored
history was derived again. The same holds for the sentence that opens
section 12, "no entry's bytes, no state digest": it rested on the commit
messages and on unchanged tests, and no stored history was recomputed.

Entry EN9 and the table EN-sweep 3 were added later on 2026-10-05, after
the reviewer's verdict `b0aabc02` at `a0bd0b593`: changes requested, with
one finding, on entry EN5. The adopted contract is then revision 18 at
`be90ff05`. The paragraph above holds for EN9 as well: no form of an
entry, an input or an answer changes, neither lane digest changes, and
the folded state has no new member. EN9 changes one thing that the commit
derives: an entry in which one mark opens an operation and a later mark
opens its first attempt was not judged, and is now written. The one
delivered rule opens no operation.

| # | Where the texts are silent | Implemented | Owner |
|---|---|---|---|
| EN1 | Entry EK2 offered the answers in hand oldest first and stopped at the first that could not be written. `unavailable` covers a turn that is busy, and also a cause of one input alone: an owner with no rule, an outcome that would open more than its owner declared (`ledger.ts`, `outcomeOf`), a fault of a rule (`settle.ts`). No text orders the answers in hand. One answer that stayed unavailable for its own cause kept every later answer from the scope. | An answer that cannot be written goes to the back of the line, as the same input of the same attempt. The cause is not asked, so no form carries it. A pass offers the first batch of the line, and each of them, whatever the one before it answered. An answer with n others before it is offered within floor(n / batch) + 1 passes, because none is ever put before it. Its operation keeps what it reserved, since no entry was written. No pass asks for a wake-up at once on an answer's account: the next is after `drainRetrySeconds`, on the scope's clock, as before. So an answer that fails again for its own cause costs one turn in each ceil(held / batch) delays, until it is judged or the process ends. The number of retries has no bound. This supersedes "oldest first" and "stops at the first" of EK2. Witness: `operations.test.ts`, "an answer in hand that stays unavailable". Controls: the old stop, and a line that does not turn. Both distinguish. | The builder. The authority note, for whether a retry of an answer that fails for its own cause should back off or end. |
| EN2 | Entry EJ10 let a rule set a fixed slot of an item that existed before the entry. The contract's section 6.3 says only an effect of the entry that opens an item sets one of its fixed slots. Section 6.1 does not say whether a rule's effect that breaks it is refused or a fault. | A fault. A party, list, ref or value effect of a rule on a fixed slot, also one that empties it, is a fault of the rule unless the item is the one that the entry opens: the item whose ID is the entry's `seq`. The validator refuses a written effect that could do it, so no input makes one, as for a slot that the type does not declare. The input is not judged and nothing is written. In a result clause the entry is a later one, so a rule there sets no fixed slot of the item that the request's entry opened. This supersedes the last sentence of EJ10. Witness: `forms-marks.test.ts`, the row "a fixed slot of an item that existed before the entry", and the entry in which the same rule sets the hash of a ticket that it opens. Controls: the guard removed, and the guard without its exception. Both distinguish. | The contract, to confirm that it is a fault. |
| EN3 | Section 6.8 says only a `hold` record changes the holder, the epoch and the state of a hold. The validator refuses a written effect that sets one of them, or that sets a hold's end from anything but the commit time, and an opening of a hold type that is not the primary item of an act. Nothing asked the same of a rule's effects. | A rule's `state` effect on a hold, and its effect on the slot `holder`, `epoch` or the hold's end, is a fault. So is a rule's opening of a hold type. No rule returns a `hold` record, so a rule changes none of these. The end is the deadline of the timed rule that ends the hold type. Witness: `forms-marks.test.ts`, "what a rule returns", five rows. Controls: each of the two guards removed. Both distinguish. | The contract, to confirm. |
| EN4 | Section 6.3: adding a member who is in a list, or removing one who is not, records no effect. A rule's `list` effect was recorded whatever the list held. | Such an effect of a rule is not recorded, as for a written effect. Witness: the same test, the entry with two additions of one member. Control: the skip removed. It distinguishes. | The contract, to confirm. |
| EN5 | Section 4.3, item 2: the entry that opens an operation opens attempt 1. A rule could return the `operation` record alone. The fold takes it, and the operation is then a duty that nothing sends. | A rule that opens an operation and leaves it with no first attempt in the entry has a fault. A genesis is not asked: item 1 lets a provisional genesis hold an operation with no attempt, and which genesis does is not built (entry EB12). Witness: the same test, one row. Control: the guard removed. It distinguishes. **Corrected by entry EN9:** as first written the question was asked at the end of each mark's rule, in `join`. It is now asked once, of the entry's joined effects, after every mark of the list has joined, in `deriveEffects`. | The builder, at step 9b, for the genesis. |
| EN6 | The validator lets a written `relate` name `self` as its item only in an entry that opens an item. A rule's `relate` could name `self` in any entry. | `self` is the item of a rule's `relate` only when the entry opens an item, by its row or by a rule. Otherwise the request is not in the contract's form: a fault. Witness: the same test, one row, and the entry in which the rule opens a ticket and relates it. Control: the guard removed. It distinguishes. | The contract, to confirm. |
| EN7 | Section 6.8: a hold ends with the item that it is under. The ends were derived for the subjects of the row. A rule may take an item that is no subject to a final state. | The ends are derived over the subjects and over each item that a rule changed. Witness: the same test, the entry in which a rule ends ticket 3 and pass 5 ends with it. Control: the ends over the subjects alone. It distinguishes. | The builder |
| EN8 | Section 6.3: an opening that would pass the type's `max` is refused `type-full`. The check was made for an act and a handler. An outcome's rule and a rule in a result clause could open an item past it. Section 7.5 bounds the sends of one entry, and the validator counts that for a row. An outcome entry has no row. | An outcome's rule that opens an item past `max` has a fault, as entry EJ11 has it for every check that would refuse. A clause's rule that does changes nothing, and the result is recorded, as for any clause whose effects cannot apply now. An outcome's rule that returns more requests than `sendsPerEntry` has a fault. Witness: `forms-marks.test.ts`, "an item that a rule opens counts against its type's `max`". It is the first witness of an outcome's rule that derives effects and requests. Controls: each of the three guards removed. Each distinguishes. | The contract, to confirm. R4, for the bound on what an outcome derives. |
| EN9 | The texts are not silent here: this corrects entry EN5 after the reviewer's verdict `b0aabc02` at `a0bd0b593`. Section 4.3, item 2, says the entry that opens an operation opens attempt 1. Section 6.1, "The joined lists are checked as one", says the checks on effects are made on the entry's joined list, and the type of a rule at an effect asks no complete pair of one rule's list (the contract's revision 18 at `be90ff05`, read at lines 2443 to 2460 and 3331 to 3350 and at "An operation that a rule opens"). The check of EN5 ran at the end of each mark's rule. So when one mark opened an operation and a later mark opened its first attempt, the first mark had a fault before the second was run. | The question is asked once, after every form of the written list is derived, so after every mark has joined: `paired`, in `deriveEffects` of `effects.ts`. It asks of each operation that a rule of the entry opened whether the joined effects hold its first attempt. An operation without one is a fault of the rule that opened it: the input is not judged and nothing is written. A genesis is not asked, as in EN5 (entry EB12). The checks that stay where each effect joins: the operation's owner, kind and ordinal and its stated attempts, and that an attempt is attempt 1, `opened` and not selected, of an operation that stands earlier in the entry's effects and has no attempt yet. One consequence: a refusal by a form later in the list (`final`, `bad-field`, `slot-full`) is answered before the question is asked, as it is before `required-unset`. A result clause and an outcome go through the same function, so the same holds there. An outcome's rule returns no `operation` among its effects, and the ledger opens each of its operations with attempt 1 (`operationOpening`). Witness: `forms-marks.test.ts`, "the first attempt of an operation is asked of the entry's joined effects": two marks, one that opens operation 0 and one that opens its attempt 1, and the entry is written with both; and two marks, one that opens operation 0 alone and one that opens operation 1 with its attempt, which is a fault and writes nothing. Controls: the question asked after each mark again, and the question removed. Both distinguish. | None: the contract states it. The builder, at step 9b, for the genesis. |

**EN-sweep. Each static check on a written form, and where the commit
makes it of a rule's output.** The validator files are those of
`packages/derive/src/validate`. "Join" is `join`, in `effects.ts`. "Mark
branch" is the branch for a mark in `deriveSends`, in `sends.ts`. "Given"
is `given`, in `outcomes.ts`, which runs both for an outcome's rule. A
gap that is closed names its entry.

| The validator's check on a written form | For a rule's output | Gap |
|---|---|---|
| An effect is one of the written forms (`effects.ts`) | Join: one of the eight members, in the contract's shape (`isEffect`, `BY_RULE`). `record`, `redact`, `hold`, `attention`: a fault | None |
| A condition `if` or `unless`; a capability effect and its arguments | A mark has no condition (static). A rule returns no `record` | None |
| The subject is named and bound | Join: the item exists in this scope, or the entry opens it. Any item of any type may be named (the contract's row P24) | None |
| The slot is of the item's type, and of the effect's kind | Join: a fault | None |
| A fixed slot is set only at the opening (`effects.ts`; `handlers.ts`, the one item of a type that is not `many`) | Join | Closed: EN2 |
| A value is of the slot's type, with its list `max` and its bounds; a detached text only from a detached source | Join: `held`, or the type's rule for a type that is a mark. `bad-field`. A value for a detached text: a fault | None |
| A `ref` of `self` to the item that the entry opens | Join refuses it `bad-field`: the item is not in the state yet. Narrower than a written effect | None. Recorded here |
| A state is declared; the subject is shown live | Join: an undeclared state is a fault; an item that was final before the entry refuses `final` | None |
| A party list: one member added or removed, or set whole, within `max` | Join: a `party` with a member on a list slot is a fault; an addition past `max` refuses `slot-full` | None |
| A change of a list that changes nothing (section 6.3; derivation, not the validator) | Join | Closed: EN4 |
| No two effects set one slot or the state of one item, but successive list changes | Join, `sets`, on the effects that are applied: a fault | None. A list that a written effect sets whole, and an attribution, are recorded as `list` records, so a rule's `list` change after one is taken as successive. The contract's sentence is about the entry's effects, which these are. For the contract to confirm |
| A hold's state, holder and epoch are the hold effect's; its end is the commit time plus a constant; a hold is opened as the primary item of an act (`hold.ts`, `handlers.ts`) | Join | Closed: EN3 |
| A hold ends with what it is under (section 6.8; derivation) | `deriveEffects`, over the subjects and what a rule changed | Closed: EN7 |
| `attribute` and its sources; `redact` | A rule returns neither. A member in an `author` slot joins the attribution in `changeItem`, as for a written effect | None |
| Every required slot is set by the opening (`handlers.ts`) | `deriveEffects`, for the item that the row or a rule opens: `required-unset`. In an outcome, a fault | None |
| An opening within the type's `max` (the commit's `type-full`) | `derive`, for an act and a handler. `runClause` and Given | Closed: EN8 |
| At most `effects` written effects in a list | An effect rule: `most`, a fault past it. An outcome's rule: none. The bound on the derived effects of one entry is R4's (revision 16, section 6.1), and no number exists | Open, recorded: R4 and request `cc570904` |
| Attention is bounded by the slots' `max` (`sends.ts`) | A rule returns no notice. A notice reads the slots as a rule left them, and a rule's addition is within the slot's `max` | None |
| A `create`: a scope kind, a definition, fields | Mark branch: the shape of a `Send` and of a seed (`isSend`), with this scope as creator, the input's cause and the next ordinal. Given: no creation in an outcome | None of the validator's. See "beside the family" below for a lane's directory |
| A `tell`: addressed by a slot that holds a scope | Mark branch: `to` is a scope reference. A rule may address any scope (the contract's row P16) | None |
| A `relate`: a scope, a local item, a name and a state; `self` only in an entry that opens an item; no two with one key | Mark branch: the shape, the item is one of this scope's, and one key once (`duplicate-relation`, with the written sends) | Closed for `self`: EN6 |
| At most `sendFields` fields in a message; no detached text to a scope that is no lane | Not checked. A rule holds no text's bytes, and a digest is a value. The entry's size bounds the message | Open, recorded: the contract, for whether a rule's message has a bound of its own |
| A fan-out is over live items of a bounded type; at most one in a list | A mark gives no request or one, and a list holds one mark (static) | None |
| At most `sendsPerEntry` sends in an entry (`handlers.ts`) | A row counts a mark as one send (static). Given | Closed for an outcome: EN8 |
| The clauses of a request; the clause of a result is found again | The mark's own clauses are data (static). A request of an outcome has no clause, and its result changes nothing (`runClause`) | None |
| A handler of class advisory sends nothing | A mark in its sends is refused with the list (static) | None |
| An operation: its owner, its kind, its ordinal and its attempts (no written form opens one) | Join: the owner is the pinned definition, the kind is one of `outcomes`, the ordinal is the next, and attempt 1 is of an operation of this entry. Given: the same for `opens`, within the owner's declared closure | Closed for a missing first attempt: EN5, as corrected by EN9 |
| The entries that an opening reserves (section 17.2) | An act and a handler are asked whether they fit, after the fold. An outcome is held to its owner's closure. A result clause is not asked, and what a mark in it can open is in no reservation | Open, recorded: entry EJ6, the contract and request `cc570904` |
| A guard that is a mark; a type that is a mark | `guardByRule` and `ofCodedType`: the answer's shape, and a refusal's name among those the rule states. A fault otherwise | None |
| A timed rule's effects are total | A timed rule holds no mark (static) | None |

**Beside the family, found and not changed.** These are no static check of
the validator, so they are recorded and left to their owners.

- A written `create` of a lane is given the directory by the derivation
  (section 6.6). A rule's `create` of a lane is taken as the rule wrote it,
  with or without that member. No delivered rule creates a scope. Owner:
  the builder, at step 9, with the member `membership` (entry EJ2).
- An opening may state any number of attempts (entry EB7). Owner: the
  authority note.

**EN-sweep, the loops. Can one row's own lasting failure hold back the
rows behind it?**

| The loop | How the next rows are chosen | Starves |
|---|---|---|
| `operations.ts`, the attempts that are due (`store.unsent`) | By the time to look at each, earliest first. A row that cannot be judged is put off to the pass's time plus `drainRetrySeconds`, which is later than every row that is due now | No |
| `operations.ts`, the walk of attempts with no time (`store.parked`) | After the row that the walk reached (entry EK1) | No |
| `operations.ts`, the answers in hand (`#replies`) | The first batch of the line | It did. Closed: EN1 |
| `operations.ts`, the requests of one pass | Each is sent and answered by itself (`Promise.all`) | No |
| `outbox.ts`, the sends that are due (`store.outgoing`) | By the time of the next attempt, earliest first. Each dispatch is put off by its delay before it is sent | No. A send whose transport does not answer delays the rest of its batch by at most `dispatchSeconds`, because a batch is dispatched in turn |
| `outbox.ts`, a diagnosis (`#giveUp`) | A diagnosis that is not written is put off to the pass's time plus `drainRetrySeconds` | No |

One thing is the same in three of these and is not changed. A row, a
diagnosis or an answer that fails for a cause of its own is tried again
after `drainRetrySeconds`, for as long as it fails. The delay is on the
scope's clock and is never zero, so nothing spins. The number of tries
has no bound, and for a row and a diagnosis the wake-up is stored, so it
outlives a restart. No text states a backoff or an end for them. Owner:
the authority note.

**EN-sweep 3. Each check of a rule's output, where it runs, and whether
the contract states it of one rule's list or of the entry's joined
effects.** Written 2026-10-05, with entry EN9. It is filed as part of
EN9. The reviewer found the first-attempt check of EN5 at the wrong
boundary. This table asks the same question of every check that the
repairs `493ce09c1`, `7da1185c0` and `da809c8bc` added, and of every
other check that runs for each mark or each rule, in `effects.ts`,
`sends.ts`, `handlers.ts`, `outcomes.ts` and `marks.ts` of
`packages/derive/src`. The contract is revision 18 at `be90ff05`.
"Join" is `join` in `effects.ts`. "Given" is `given` in `outcomes.ts`.
"So far" means the entry's effects in their order up to that effect: the
opening, the written effects and the effects of every earlier mark. One
row is the finding. No other row needed a change of source.

| The check | Where it runs, as read | The contract states it of | Found |
|---|---|---|---|
| A rule returns a list of at most `most` effects | Join, once for each mark, on that rule's list | One rule (section 6.1, "the most effects and sends that each rule returns") | None |
| Each effect is one of the eight members, in the contract's shape | Join, each effect | Each effect | None |
| An operation's owner and kind, and that it states at least one attempt | Join, each effect | Each operation (section 6.1, "An operation that a rule opens") | None |
| An operation's ordinal is the next | Join, each effect, counted over the effects so far. The workspace's operations are numbered after every form, from the same count | The entry (section 4.3, item 1) | None |
| An attempt is attempt 1, `opened`, not selected, of an operation of this entry that has none yet | Join, each effect, read from the effects so far. So an attempt of one mark completes an operation of an earlier mark. An attempt that stands before its operation is a fault: the fold reads the effects in order, and has no operation to give it to | The entry, in the order of its effects | None |
| Each operation that a rule opens has its first attempt | It ran in Join, at the end of each mark | The entry's joined effects (section 4.3, item 2; section 6.1) | **Found by the reviewer. Fixed: EN9.** It now runs once, after every form |
| A rule's opening: at most one item in the entry, its ID is the entry's `seq`, its initial state, no hold type | Join, each effect. It reads whether the row opens an item, and whether any earlier mark did | The entry ("An entry opens at most one item, whatever opens it") | None |
| The opening is within its type's `max` (EN8) | Once for the entry, after all its effects: `derive` for an act and a handler, `runClause`, and Given | The entry | None of this family. The count is the live items before the entry and one more, also for a written opening, since I1 (I1 delta 20). An entry that ends an item of a type at its `max` and opens another is therefore refused. Not changed. For the contract to say whether that is meant |
| The item of an effect exists | Join, each effect: a subject, an item that an earlier effect of the entry changed or opened, or an item of the state | The entry, in the order of its effects (section 6.3, "Opening, exactly") | None. An effect on the opened item that stands before its opening is a fault, as the fold has no item yet |
| A fixed slot is set only of the item that the entry opens (EN2) | Join, each effect. The item whose ID is the entry's `seq`, whether the row or any earlier mark opened it | The entry that opens the item (section 6.3) | None |
| Only the hold capability sets a hold's state, holder, epoch and end (EN3) | Join, each effect | Each effect (section 6.8) | None |
| No effect changes an item that was final before the entry | Join, each effect. It reads the item as it was before the entry, whatever the entry's earlier effects did | The entry (section 6.6) | None |
| A declared state; a slot of the effect's kind; a member's handle; a value of the slot's type; no value for a detached text | Join, each effect. A type that is a mark is asked of its rule for each effect that sets the slot | Each effect (section 6.1, "for each effect that would set the slot") | None. A `ref` to the item that the entry opens is refused `bad-field`, because the type check reads the state before the entry. EN-sweep records it, and the contract's row I3-27 owns it |
| A list change that changes nothing is not recorded (EN4) | Join, each effect. It reads the list as every earlier effect of the entry left it, a written one or a rule's | The entry's effects in their order (section 6.3) | None |
| An addition is within the list's `max` | Join, each effect, on the list as left so far | The entry | None. Two marks together cannot pass it |
| No two effects set one slot, or the state, of one item, but successive list changes | `sets`, one table for the entry: each written effect and each rule's effect, as it is applied. A second mark that sets what an earlier mark set has the fault | The entry's joined list | None |
| A hold ends with what it is under (EN7) | Once, after every form, over the subjects and every item that any rule changed | The entry | None |
| Every required slot of the opened item is set | Once, after every form and the capability's effects | The entry (section 6.3) | None |
| A rule at a send gives no request, or one, in the contract's form | The mark branch of `deriveSends`, each mark | One rule (place 6) | None |
| A creation names this scope, the input's cause and the next ordinal | The mark branch. One counter for the written creations and the rules' | The entry (section 7.2) | None |
| `self` is the item of a `relate` only in an entry that opens an item (EN6) | The mark branch. `opening` is given by the caller from the whole derivation of effects: the row's opening, or any mark's | The entry | None |
| No two relationships with one key | One set for the list, written sends and marks | The entry | None |
| At most `sendsPerEntry` sends in an entry (EN8) | For a row, the validator, which counts a mark as one send, and a list holds at most one mark. For an outcome, Given, on every request of the rule. The ledger adds no send to an outcome entry (`outcomeOf`) | The entry (section 7.5) | None. No two marks share a count |
| A field whose type is a mark; a name of `also` that a mark selects | `fieldOutsideType`, each field. `selectedBy`, each name, and then one check that no two names select one item | Each field (check 7); each name, and the set of names (check 8) | None |
| A grant rule's answer; a guard rule's answer and its refusal's name | `grantByRule`, one mark for an act. `guardByRule`, each guard mark at its position | One rule (places 1 and 4) | None |
| A rule that reads the clock | `ruleFor`, each rule. One flag for the entry | The entry ("an entry of a row with such a rule judges time") | None |
| An outcome's rule: no `operation` or `attempt` among its effects, no creation | Given, on all that the rule gave. An outcome entry derives nothing else from a rule | The entry | None |
| An outcome's openings: the owner, the kind and the attempts of each; all of them within the owner's closure | Given, each opening. The ledger sums them all (`outcomeOf`) and opens each with its attempt 1 | Each opening; the entry for the closure (section 17.2, row 5) | None |
| An outcome's effects and requests meet the checks of a mark | Given runs `deriveEffects` once, with the effects as one mark, and `deriveSends` once, with one mark for each request. So each row above holds as for an entry with marks, and the question of EN9 is asked at the end of it | The entry | None |
| A result clause's rule | `runClause` runs `deriveEffects` once over the clause's forms, with every mark among them, and then asks the type's `max` once. A clause sends nothing | The entry that runs the clause | None |
| The entries that an opening reserves | After the fold, for an act and a handler, on the whole entry. A result clause is not asked | The entry (section 17.2) | Open as before, and not of this family: entry EJ6 |
| The effects that one entry derives from rules, as a number | No check. Each rule has its `most`. An outcome's rule has none | The entry (revision 16, "A declared maximum for everything that derives") | Open as before: R4 and request `cc570904`. Until a number exists, two marks cannot pass a bound, because there is none |
| A mark's own `most`: the kinds of operation that its rule may open, at most one of each in one entry, and the type that it may open | Not built. The rule table states one number for a rule at an effect (entry EJ6) | One mark, counted for the entry | Not of this repair. Owed: the contract's rows I3-21 and I3-22 |

## 14. Step 16: the capability decisions of revisions 16 and 21, and the production capabilities

Written 2026-10-05, by the worker of step 16. Entries have the prefix EL.
"The contract" is the scope contract's revision 16 at `54420b41`, and "the
authority note" is revision 21 at `f9ec25e4`. Both are adopted, and section
numbers are their own. Revisions 17 and 22 are under review, and nothing
here builds what only they state. Entries EH6 to EH11 of section 10 are
decided by those two texts and are built here, with the contract's source
rows I3-12 to I3-15. The production ports now hold the capability code.

What changes in bytes. Every outcome entry holds the two members `owner`
and `kind` in its input, as the contract's section 4.1 states. No stored
history holds an outcome entry. No other entry that a source wrote before
changes, no state digest of a state without the new records changes, and
neither lane digest changes.

Each entry is a place where an adopted text is silent or could not be built
as written, with what the source holds, and it ends with the question for
its owner.

| # | Where the texts differ or are silent | Implemented | Owner, and the question |
|---|---|---|---|
| EL1 | Rows I3-12 and I3-13. Section 4.1 says the judge sets `owner` and `kind`, and that an outcome "offered with other values" is `bad-input`. It does not say whether an offer may state none, or what a copy of a recorded answer is when it names another kind. | `OutcomeOffered`: an offer may leave both out, and the driver does. The judge reads both from the operation in the folded state. An offer that states another value is `bad-input`, also when it would be a repeat. The fold refuses an outcome entry whose input names another owner or kind than its operation. `kindOf` gives an outcome entry `owner:kind`, and `holdCapability` has the form `kind` for a step that it has code for. A replay has no rules of an owner yet, so witness 18.41, case 7, is not run (plan step 22). | The scope contract. Is a copy of a recorded answer that names another kind `bad-input`, as built, or a repeat? |
| EL2 | Row I3-14. Section 6.2 also asks the validator to refuse a name with the form of a step kind (row 14 of section 11.11, owed by I2). Without it an act could be named `hold@1:check`, and the form `kind` would be unsafe to implement. No text says whether the prefix rule holds for platform data. | Both rules, in `validate/timed.ts`, at the four places of the `timed:` rule. The prefix `platform:` is refused with the platform option too. No name of either pinned lane or of the inbox data is refused. | The scope contract. Does the rule on `platform:` hold for the data of a platform definition, as built? |
| EL3 | EH6. Section 5.7 gives `bad-field` for a field that the table does not name, or a missing one. It names no refusal for an intent of a step with no act whose `kind` is another, whose `on` is set or whose `expected` is not empty. It does not say what "has the field" means for a field of another type, or bound a commit. | Such an intent is `bad-field`. An instance ID is a text of 1 to 128 bytes. For `stage` and `check`, a field is present when the intent has the member. A commit is an object ID of 40 or 64 hex characters, `lane` a scope reference, and a hold an item of a hold type of this scope: any other value reads nothing, and the step is refused `not-staged`. With nothing read, the grant asked is that of the act that opens the definition's hold type. In `check`, rows 1 and 2 read the commitment from the hold named, which may have ended. | The authority note's successor. Is `bad-field` the refusal of an intent whose `kind`, `on` or `expected` is not as the table states? |
| EL4 | EH7. Section 5.7 says the code is given "the subject of the slot operand". An operand may read a slot with a part. | `CapabilityGiven.from` holds, for each argument of an effect that is written as a slot with no part, the ID of the item it was read from. A slot operand with a part gives none, so it names no pin. | The authority note's successor, to confirm. |
| EL5 | EH10. Section 5.7 makes the bound on a hold's tokens "a value of the capability's version" whose number is R4's, with the floor 2. Section 6.2 leaves the retention of a root to R4. The contract's section 6.1 adds a bound on the derived effects of one entry to section 7.5, and proposes no number. | `tokensPerHold` stays a required option of `holdCapability`, with no default, and a value below 2 throws. It is no member of `Bounds`: it is a value of the version, and a scope's bounds are set for each scope. `rootRetentionSeconds` is a required option, a number or null, and with null no root is retired. The production ports state both as `HOLD_VERSION`: 2, the floor, and null. `Bounds.derivedEffects` is the section 7.5 bound, with the temporary value 256. No text proposes 2, null or 256. | The proof plan (R4), with `cc570904`. What are the three numbers? Until then a production hold has at most 2 tokens and no root is retired. |
| EL6 | EH11. Section 5.7 names no kind for the delete of a staged ref or for the deletion of a fork, no value by which a root or a fork names that operation, and no values of a token that is for a root. It says the request of an attempt "is sent only when both are `live`". Section 5.8 counts 59 entries for a root that is `creating`. | Kinds `delete` and `deletion`, each with 3 attempts. A root that is `retiring` gains the value `retirement`, and a fork that is `deleting` the value `deletion`. A token of an attempt has the values `purpose` (`fork-read` or `staging`), `root`, `operation`, `attempt`, `mint`, `id`, `ends` and `revocation`, and no `hold`. The use of such a token has ended when its attempt has a `confirmed` or a `refused` outcome. The action of `retire` is `ledger.retry`. The retention is counted from the time of the entry that last recorded the root, which is the one that made it `live`. The closure that `stage` declares for one outcome entry is 40 entries, so an opened staging reserves 246: the ledger reserves one closure for each outcome entry that may be written, which is more than the section's 59 and never less. The driver sends an attempt whether or not its tokens are `live`: that rule is the driver's (plan step 19), and the seam is marked in `hold.ts`. | The authority note's successor, for the names and the values. `cc570904`, for whether the ledger should reserve the exact closure of each outcome instead of the largest. |
| EL7 | The contract's sections 2.1, 9.2 and 16.4 state the byte domain of a snapshot, that its bytes are a retained input, and that they are stored before the entry that names the digest. Section 9.6 says `RetainedInput.kind` has no snapshot "yet", and states no name for the kind. No text says how the bytes reach the scope. | The kind `snapshot`. Its bytes are the pairs in byte order of ref, as canonical JSON, under the digest in `artroom-snapshot-1` (`DOMAINS.snapshot`, `snapshotDigest`). The answer of an attempt may carry them (`EffectAnswer.retain`). The driver checks each against its digest and stores it in the commit of the outcome entry. An answer whose evidence names a snapshot that was not given, and that the scope does not retain, is no answer: the attempt is `unknown`. The owner's rule says which digests the evidence names (`OperationRules.retains`). The judge gives the guard `ancestry` the snapshots that the scope retains (`Reading.snapshot`), so `gitRead` takes no reader. | The scope contract. Is the kind named `snapshot`? |
| EL8 | Row I3-15. Section 6.1 says each piece of code declares three maxima and that "the validator counts them". The validator holds no capability code. The section does not say how many holds one entry may end, which makes the count of the workspace, or what a value with no declaration is in a test. `entry-too-large` was no reason in the source. | The code declares its maxima (`Capabilities.maxima`): 1 effect for each written effect of `hold@1`, each step, each outcome rule, the bound request, and 1 + 3N for one hold of an entry. `counted` adds them into each act, handler and timed rule of a definition, and takes the workspace once for each hold that may be live: the sum of `max` over the hold types. That is 16 times 7 for both pinned lanes, so 113 and 114 at most. The scope does not pin a definition that does not fit `derivedEffects`: `unsupported-definition`. Code that returns more than it declared throws, and the input is not judged; an outcome that would hold more is not written. A preparation or an act past the bound is refused `entry-too-large`, which is now a `RefusalReason`. The entry's size is still checked on its bytes when it is sealed, and is still answered `bad-field` there. A value with no `maxima` is not counted: only the scripted stand-in is one. The maxima of platform rules are not counted (entry EJ6). | The scope contract. How many holds may one entry end with what they are under: all that are live, as counted, or one for each commitment? The builder, for the answer `entry-too-large` at the size bound. |
| EL9 | Entry EH12 lists what step 16 builds. Three parts are not as it says. | `stepsOf` stays: the two interfaces `Capabilities` and `Steps` each have an `implements`, and one port type for both is left for step 22, with the seam marked. The scripted capability stays in test support: the scope package's own tests and the lane scenario T8 use it, and T8 cannot run on the code at its bound of 16 entries, because a fork that is `creating` reserves 42. `packages/scope/src/object.ts` still says in a comment that no owner has rules: the file is another worker's. A replay is not given the code, so a history that a lane wrote on the code is `unsupported-definition` to a verifier until step 22, and T9 replays histories that were written on the stand-in. The second shape of `propose-manifest` is not run in any scenario (I2 delta DK6). | The builder, at steps 19 and 22. |

## 15. Steps 8a, 7, 11, 12 and 14: the forms that rules read, membership, and the grant in a replay

Written 2026-10-05, by the worker of those steps. Entries have the prefix
EM. The adopted designs are the scope contract's revision 16 at `54420b41`
and the authority note's revision 21 at `f9ec25e4`. Their revisions 17 (at
`5a15b9b0`) and 22 (at `55e41dfc`) are under review: they were read as
proposals, and nothing is built that only they state. Section numbers are
those of the two adopted texts. Each entry ends with the question for its
owner. Neither lane digest changes, and no entry that an earlier source
wrote has other bytes.

### 13.1 Step 8a: `observed`, and a value beside an intent

The forms are built as the contract's sections 4.1, 6.2 and 16.1 state
them: the member `observed` of an act, of an outcome and of a delivery of
a result, with the three kinds of observation; the three forms of a read's
request; and `values` in `Beside`. The bytes package guards each. A rule
is given two readers, and the judge of an act writes what a rule read.
Witness: `packages/derive/test/forms-marks.test.ts`, "a rule reads a
further observation and a value beside the intent".

| # | Where the texts differ or are silent | Implemented | Owner, and the question |
|---|---|---|---|
| EM1 | Section 6.2 says that a value is named by "a place of the act that the platform definition's specification states, with the one domain of that place". The scope "computes the digest of each value in each domain that the act's places state", reads "at most as many values as the act's places can name", and none "longer than the bound of its domain". No form of platform data states a place, a domain or a bound: a mark is `{ code, row }`. | A rule reads a value itself: `value(domain, digest, most)`, with the domain and the bound of its place in the rule's code. The judge matches each value at hand by its digest in that domain. Bytes that are not the canonical form of a JSON value, and a value longer than `most`, are none at hand. The entry's draft names each value that a rule read, with its bytes, for the scope to keep. A place that requires a value and has none is refused by the rule that reads it: a guard at a mark may refuse `bad-field`, or answer that it is not completed. The judge does not bound how many values are at hand, because it knows no place. | The scope contract, with the authority note. In what form does a version state the places of an act that name a value, with the domain and the bound of each, so that a scope can bound what it reads before the turn? |
| EM2 | Section 16.1, guard 5, judges an observation's age inside "the window that the definition states for this entry and this subject". The authority note's section 3.3 states each window in a table of entries. No form of platform data states which subjects an entry observes, or the window of each. | A rule reads an observation by its subject: `observed({ key })`, `observed({ member })` or `observed({ asked })`. The judge is given the observations at hand, which the scope must have read before the turn and judged by the six guards, and writes each one that a rule read, in ascending order of `read.n`. One that no rule reads is not written. The fold holds the head of each subject of `observed` too, with the rules as the one subject `rules`. | The scope contract, with the authority note. In what form does a version state, for an entry, the subjects that it observes and the window of each, so that a scope can make the reads before the turn and a replay can judge the age? |
| EM3 | The plan's step 8a owns `scope/src/core.ts` and the store, and the judges of a result's delivery and of an outcome. Those modules belong to another step now. | Built: the judge of an act (`derive/src/judge.ts`), which takes `observed` and `values` in its context. Not built, and marked `I3 merge:` in `derive/src/marks.ts`: the two other judges give a rule no `AtHand` and write no `observed`; the scope makes no further read, reads no `values` beside an intent and keeps none. Until then a rule that reads either is given none in those places, and where its specification says so its guard is not completed, `dependency-unavailable`. No delivered rule reads either: the inbox's and membership's read neither. | The builder, at the merge. The lines are in the delivery report of these steps. |
| EM4 | Section 6.2, "Retention", keeps a value "as one retained input, under its domain and its digest". The contract's `RetainedInput` has four kinds, and none is a value with a domain. Section 9.3 makes a replay without the bytes `incomplete`. | No kind is added. The draft of an act names each value that a rule read (`Draft.values`), and no store keeps one. A replay gives the judge no value, so an entry whose rule read one is not derived again: a `mismatch`, and not the `incomplete` that the contract states. No source writes such an entry. | The scope contract, for the kind and its member for the domain; the builder, with the store. |
| EM5 | The contract's revision 16 gives the `outcome` input two more members, `owner` and `kind` (section 4.1, "The kind of an outcome entry"; it decides the deltas EH3 and EH9). | Not built here. `observed` is added to the outcome input as the source has it, with four other members. The two members change the bytes of every outcome entry, and are the ledger's. | The builder, with the step that owns `derive/src/ledger.ts` and `operand.ts`. |

### 13.2 Step 7: membership

`packages/platform/src/membership.ts` holds `platform:membership@1` as
data, row for row from the authority note's section 12.1.3; the seven
rules that the note's table of marks names for membership (section 12.1.8,
rows 14 to 22, 24 to 26, g, h and i); and `standingOf`, its answer to an
observation read. The scope object answers the read as `observe`.

**Membership cannot be founded under the production wiring yet.** Three
places of its rows state something that no form can say and that the
note's table of marks does not list: entries EM6, EM7 and EM8. Each is a
mark in the data, with its entry here as the mark's `row`, and the
platform package has no rule for it: the note names none, and none is
invented. By the whole-scope rule of the contract's section 6.1, a version
with a mark and no rule runs nothing. So `Scope.platform` answers null for
`platform:membership@1`, and nothing is founded or created under it.
Test support has a labelled stand-in for each of the three
(`packages/platform/test/support.ts`, `standIns`), so that the rows and the
seven real rules are witnessed. When the note's owner names each rule, it
moves from test support into the package.

Witnesses: `packages/platform/test/definitions.test.ts` (T43, with the
list of marks and what is runnable) and `packages/platform/test/rules.test.ts`
(T50, membership's table; T10; T13; the answer to an observation).

| # | Where the texts differ or are silent | Implemented | Owner, and the question |
|---|---|---|---|
| EM6 | The row `establish` opens the roster with "the role table of section 3.2 as its five lists". Each list is `{ type: "list", of: { type: "text", max: 64 }, max: 32 }`, and the contract's bound on a list is 32 elements. With `.*` written out as section 3.2 says, and each action that a role holds under a condition listed as section 3.3 says, the table gives an admin 34 actions (counted by `actionsIn("admin")`, and asserted in `rules.test.ts`). So the row cannot set an admin's list from the table. The same bound holds `set-actions`. | The data keeps the row: five lists of at most 32. The place that sets them at `establish` is a mark, `role-table`, with no rule in the package. `ROLE_TABLE` is the table of section 3.2 as data, row for row. The stand-in rule of test support sets each role's list from it, and an admin's without the four actions on one task (`work.export`, `task.control`, `task.read-private`, `task.operate`), which leaves 30. That choice is nobody's yet. It fails closed: an admin whose list lacks an action is refused that action. | The authority note, with the proof plan for the bound. Which is it: a longer list, a table with fewer names for an admin, or another form for the role table? And which 32 names does an admin hold first, if the list stays? |
| EM7 | The item `member` has the party `member`, fixed and required. The rows `seat`, `invite-member` and `add-member` open a member from a handle: the founding handle, a text of the roster, or the field `handle`, a text. No form makes a member reference from a text and this scope's reference, and the table of marks lists no rule for it. | A mark at place 5 in each of the three rows, `member-of`, with no rule in the package. The stand-in gives one `party` effect: the member is the handle, in this membership scope. | The authority note. Is this a rule of version 1, under which name and row? Or is the field of the two acts a member reference, with the value `handle` read from it by a form that the contract then owes? |
| EM8 | The rows `invite-member` and `add-member` state, among their guards, "The handle fits section 3.1, or `bad-field`". A text type states a length only, and no guard form reads the characters of a text. The table of marks lists no rule for it. The register's check of `founderHandle` is the same. | A mark at place 4 in the two rows, `handle-form`, with no rule in the package. The stand-in holds for `@`, then lowercase ASCII letters, digits and hyphens, with no hyphen first or last, in at most 256 bytes, and refuses with the code `bad-field`. | The authority note. Is this a rule of version 1, under which name, and with which refusal name beside the code? |
| EM9 | The rows `seat`, `join` and `add-member` send "`create` of that member's inbox", and state no clause. The item `member` has the reference slot `inbox`, and the address of a notice is read from it (row 39 of the table of marks). In `join` the member is selected by a mark of `also`, and a clause may not name such a name (entry EJ3, which the contract's revision 17 would confirm). | The three sends have no clause: the result is recorded and changes nothing. No entry sets `member.inbox`. A reader finds a member's inbox by the seed of the `create`, which the sending entry holds. | The authority note. Which entry sets `member.inbox`: an `applied` clause, and then how does the clause of `join` name the member? |
| EM10 | The row `first-key` opens a key for "the seated member", and says "The seated member exists". It states no field and no selection. The recovery key may invite a member before `first-key`, so the seated member is not the only member item. | The intent names the member in a field `member`, of type `item`. Two written guards hold it to the seated one: it is `active`, and its `handle` equals `roster.foundingHandle`. | The authority note, to confirm or to state the selection. |
| EM11 | The row `enrol` selects the invited key "by a mark of `also`, as `also.key`, and not as `on`". An act that is no comment has a primary item (the contract's section 6.4; the validator refuses `on: null`), and a comment has no guard and no effect. The row names the key's member as `also.member`, which is reached by the key's reference slot. The judge asks an expected revision for each subject that no mark selects. | `enrol` is a transition on the roster. Its intent names the roster in `on`, and `expected` has two keys: `on`, the roster's revision, and `member`, the revision of the invited key's member. It has none for the key. So the device that enrols must be told both revisions with its invitation, and an entry that moves either makes the intent `revision-moved`. Nothing is learned from that answer without the secret: with no invitation bound the member is unbound too. | The authority note, with the contract. What is the primary item of `enrol`, and must the new device state the member's revision? |
| EM12 | Three things search items by a value: the rule `by-invitation` (the key items, for the signing key), the rule `last-admin-kept` (the active admins and a member's active keys) and the answer to an observation (the key item of a key, and a controller's member item). The folded state is indexed by type, state and ID. A member has at most 10,000 live keys, and retained final items are not bounded. | Each reads every page of the type in the states that it needs. The read is bounded only by what the scope holds, as entry EF6 says of a capability's records. An act of membership is one commit, so this is in the commit's transaction. | The proof plan, with request `cc570904`. A bound, or an index of key items by `id`. |
| EM13 | The hash of an invitation's secret (P18). The slot `inviteHash` is a `digest`. No text states the byte domain. | The digest of the secret as a text, in `artroom-text-1` (`textDigest`). The inviting act carries the digest, and the join carries the secret. No domain is added. Check 1 of section 3.6, that the secret has at least 32 bytes, is made before the request reaches a scope, and is not here: it is a serving check (plan step 15). | The authority note. The domain of an invitation's hash. |
| EM14 | An observation of a key has a member, a member state of `active` or `removed`, a role and actions. The key's state may be `unknown`, and such a key has no member. No text says what the other members then hold. | The answer names the member `@-`, which is no handle by section 3.1, with `memberState: "active"`, the role `""` and no action. `removed` is not used there: the grant guard keeps a removed answer for the run, and an unknown key may still be enrolled. The guard refuses on the key's state. | The authority note, with the contract, which types the record. |
| EM15 | The rows `remove-member` and `revoke-key` state a `state` effect to a final state and no guard on the item's state. The validator asks for one that lists no final state (the contract's section 6.3). | `{ state: ["active"] }` in both: an active member is removed, and an active key is revoked. An invitation ends by its own end time. | The authority note. May an invitation be withdrawn by one of these acts? |
| EM16 | The row `join` has two written guards on the invitation: its state, named `invitation-used`, and its end time, named `invitation-expired`. The timed rule `member-invitation-end` makes an invitation `lapsed` at that end time, and no act passes a transition that is due (the contract's section 5.2, step 6.3). So the timed entry is always written before a join at or after the end time is judged. | As the rows state. A join on an invitation that has ended is refused, and by the guard on its state: `invitation-used`. The guard `invitation-expired` is never the one that fails. Section 3.6, check 7, gives the two cases two names. | The authority note. A guard that names a `lapsed` invitation `invitation-expired`, or one name for both. |

### 13.3 Step 11: the inbox that membership creates

Membership's rows `seat`, `join` and `add-member` send the `create` of a
member's inbox, under `platform:inbox@1`, whose one rule (`notice-source`,
P22) was built with the marks. Two things were needed for a platform scope
to create another, and both are outside the modules that the plan gives
this step. Witnesses: `packages/platform/test/rules.test.ts`, the join's
entry; and, on real scopes, the scenario of step 12
(`packages/scope/test/membership.test.ts`), with the plan's T40.

| # | Where the texts differ or are silent | Implemented | Owner, and the question |
|---|---|---|---|
| EM17 | The contract's section 6.6 says that the body of a `create` is `{ fields, directory, membership }`, that `membership` is "the reference of the membership scope that the creating scope records", and that the platform puts it in every `create`. No source wrote the member (entries ED13 and EJ2). The contract's revision 17, a proposal, would give it to the step that builds the creations of a directory. | `derive/src/sends.ts`, in the one place that builds a written `create`: the member is the membership scope that the creating scope records. A membership scope records itself, so its creation of an inbox holds its own reference, with its incarnation. Any other scope reads its own genesis entry (`membershipOf`). A scope that records none creates without the member, so no creation of a scope that knows no membership scope has other bytes: the lane scenarios and both lane digests are unchanged. A membership scope is created without it. A creation that a genesis sends holds none yet: marked `I3 merge:` there, for the step of the real directory. | The scope contract, to confirm that a membership scope names itself. The builder, at step 9, for a genesis. |
| EM18 | A creation under a platform name was answered `unsupported-definition` (entry EA9), and the plan gives `scope/src/delivery.ts` to step 9. | In `scope/src/delivery.ts`, `#declared`: a seed that names a platform definition pins the runtime's own data and rules, as `Scope.platform` supplies them for a founding. No bytes are read from the creator and none are retained for it. The genesis is judged with those rules. A version that the runtime cannot run whole is `unsupported-definition`: transport answers `retry`, nothing is recorded, and the creator keeps the duty. | The builder: the file is the plan's step 9's, and this is the part of it that step 11 needs. |

### 13.4 Step 12: the production authority

`DeployedScope`, the scope's object as it is deployed, now has a real
authority port: `repositoryAuthority`, in `scope/src/authority.ts`. A
membership scope judges its own acts on its own head. Every other scope
reads the membership scope that its own genesis records, through the
namespace, with the observation read of step 6. No grant that a caller
presents is read. The readers port keeps its refusing default: section 3.9
admits a reader only by a read session, which is plan step 15.

Witness: `packages/scope/test/membership.test.ts`, on real scopes in a
namespace of deployed objects, with no test authority (the plan's T11 and
T40). Its stand-ins are listed in `packages/scope/test/repository.ts`: the
three rules of entries EM6 to EM8, the office that creates the membership
scope, a scripted lane for a notice, and the test readers.

| # | Where the texts differ or are silent | Implemented | Owner, and the question |
|---|---|---|---|
| EM19 | The authority note's section 3.3 says of an act of membership: "None, and no read", and "The entry retains an `Observation` that the commit builds from the folded state at the head before it, with `at` as the commit's reading and the use `fresh`". An `ObservationUse` also has `read: { run, n }`, and the contract's section 16.1 lets no two entries hold one read as `fresh`. No text says what `read` is for an observation that no read made, or which window judges it. | `ownStanding`: each act of a membership scope that names an action takes the next number of the scope's run, as a read would. The commit builds the observation with `standingOf`, which is also what the scope answers to others, and judges it with the grant guard as a ten-second kind: `fresh`, with an age of zero. | The authority note, with the contract, to confirm the number and the kind. |
| EM20 | `windowOf` held revision 18's windows, with a seam for the table of revision 20 (entry ED4). Revision 21 is adopted. | The table of section 3.3 as adopted, for the scopes that exist: 300 seconds for an act that is judged on a grant in a lane, the directory, an inbox, the rules scope or the destination; 10 seconds for a row with a `hold` effect that opens or renews, or whose `grant` is `work.export` or `change.check` (entry ED3, as decided); none for membership and for the register. A task scope's windows are not built: nothing is read for an act there. | The builder, with IA, for the task scope. |
| EM21 | Section 3.3, "Where it records its membership reference", has four rows. Two are built: a membership scope is itself, and a lane, an inbox and a task scope hold the member `membership` of their creation. A directory holds it in its slot `repository.membership`. The rules scope and the destination hold the scope's ID and fix the incarnation in the first entry that retains an observation. | For those three kinds the production authority reads nothing, and an act that needs a grant is answered `authority-unavailable`. Marked `I3 merge:` in `repositoryAuthority`. A scope that was founded and not created, as every directory of today's tests, records none either. | The builder, at steps 9, 9a and 9b. |
| EM22 | An observation read names no asker, and "membership could not check such a statement" (section 3.3). No text says which caller may reach the read. | `observe` is a method of the scope's object, called by another object of the one scope namespace. It has no HTTP route and is no operation of `ScopeApi`. It answers only a request of one of the two forms that membership answers, with exactly its members, and the readers port is not asked. | The authority note, to confirm that an observation is answered to every scope of the namespace. |
| EM23 | Section 3.3 keeps "a read that shows the key `retired` or `compromised`, or its member `removed`" for the run. From revision 20 that is read of the member too: a read that shows a member removed stops every key of that member (the seam in `observing`). | Not changed in this step: the kept answer is by key. A key of a removed member is refused on its own read, because membership answers `memberState: "removed"` for every key of that member (row 23 of the table of marks). What is not built is that one such read stops the member's other keys before their own next read. | The builder. |

### 13.5 Step 14: the grant in a replay

`packages/replay/src/verify.ts` no longer takes a recorded grant as
current. For each act that records a grant it derives the grant again with
derive's own functions: `agrees`, `windowOf` and `judgeGrant`, on the
entry's time, with the latest earlier entry that retains the read and the
highest head that the earlier entries retain. It then derives the value of
the observation from the membership scope's history at the observed head.
It reports `observation-older`, `observation-reused`,
`observation-not-moved` and `run-returned` by name, and lists
`observation-read` under `trusts`. This closes entry EJ14, and the part of
row I3-11 of the contract's section 11.13 that is a replay's.

Witness: `packages/scope/test/membership.test.ts`, "replay agrees with the
runtime" (the plan's T44): histories that real scopes wrote under the
production authority are consistent, and eight copies, each changed in one
way, are each reported at the entry and by the name of what they break.

| # | Where the texts differ or are silent | Implemented | Owner, and the question |
|---|---|---|---|
| EM24 | Entries E8 and EA1: test fixtures build grants with `fresh: null`, and the replay took every recorded grant as current. The contract's section 15.6n, on E8, says: "A grant without one is no grant, and bytes that hold one are no entry. A fixture that builds `fresh` as `null` is a labelled stand-in". Such a fixture cannot be given a real proof: a proof is an observation of a membership scope, and its value is checked against that scope's history, which the test authority does not have. | `Options.grants`. `proven`: a grant with no freshness proof is a `mismatch` at its entry. The replay command always asks for that. `as-recorded`: such a grant is taken as current, and the report lists `authority`, whose text now says that it is a stand-in's and proves nothing about authority. A grant that holds a proof is derived again in both. No fixture, no test history, no pinned value and neither lane digest changes. Ten calls of the verifier in tests of the replay and scope packages now state `grants: "as-recorded"`, and the two tests of the command anchor the facts that such a history would reach. One more replay of such a history was in a file of another step, `packages/lanes/test/plan.scope.test.ts`. Since the merge with step 16 that call states the option too, and the default of the library call is `proven`. The option ends with the test authority (plan step 30). | The builder, at the merge. The scope contract, for the guard of the fixed record of a grant in the bytes package, which still reads `fresh` as opaque for the same reason. |
| EM25 | Section 16.1, "Replay", derives "the value, from the history of the scope that the record is `of`, at `head`". No text says which code gives the value. | It is code of the observed scope's platform version, beside its rules: `Platform.observed`, which for membership is `standingOf`, the function that the scope answers a read with. The verifier is given it with the data and the rules (`Coded.observed`). It folds the checked entries of the membership scope through the observed head and compares the answer, with the recorded `at`, with the retained observation, byte for byte. The head is proved as a foreign fact is: by replay of the membership scope, or by an anchor. With an anchor the value is not derived, and the report lists the anchor. Without either the report is `missing-dependency`. A membership scope's observation of itself is of the head before the entry, at the entry's time, and is derived from the replay's own state. A platform version with no such code is `unsupported-definition`. | The scope contract, to confirm that the answer is code of the version, reported under `platform-code`. |
| EM26 | Section 9.3 gives the same checks to the grant of a preparation entry and to each record of `observed`. | For `observed`: that each record is `fresh` or `reused` as the earlier entries make it, the clock has moved, the runs do not return and no head goes back. Its window and its value are not derived: no form states the window of an entry and a subject (entry EM2), and no source writes such a record. A preparation entry still ends a replay as `unsupported-definition` (entry E13), so its grant is not reached. | The builder, at plan step 22, for a preparation; with the first rule that reads `observed`, for the rest. |

## 16. Steps 8 and 9: the fourth cause, the register and the directory

Written 2026-10-05, by the worker of those two steps. Entries have the
prefix EP. The adopted designs are the scope contract's revision 16 at
`54420b41` and the authority note's revision 21 at `f9ec25e4`. No later
revision was read. Section numbers are those of the two adopted texts.
Each entry ends with the question for its owner. Neither lane digest
changes, and no entry that an earlier source wrote has other bytes.

`packages/derive/src/genesis.ts` has the fourth cause and the founding of
a register. `packages/platform/src/register.ts` and `directory.ts` hold
`platform:register@1` and `platform:directory@1` as data, row for row
from the authority note's sections 12.1.1 and 12.1.2, with each rule that
the note's table of marks names for them (section 12.1.8, rows 2 to 13,
a, c and d), but one.

**Neither can be founded or created under the production wiring.**

- The register lacks one rule, `create-repository`, which waits on entry
  EJ1. Its mark stands in `outcomes`, and the package has no rule of that
  name.
- The directory's data holds two marks for places that the note's rows
  state, that no form can say, and that its table of marks does not list:
  entries EP6 and EP7. Each has the entry here as its `row`, and no rule.

By the whole-scope rule of the contract's section 6.1, `Scope.platform`
answers null for both names. Test support has a labelled stand-in for each
of the three (`packages/platform/test/support-founding.ts`), so that the
rows and the written rules are witnessed.

Witnesses: `packages/derive/test/compose.test.ts`, the row "a child that an
outcome entry creates"; `packages/platform/test/register.test.ts` and
`directory.test.ts` (the plan's T43 and T50 for the two definitions, and
T38). T38 is on a directory in memory, below a scripted register, with
derive's own judges. It is not on scope objects: no directory can be
created there yet.

| # | Where the texts differ or are silent | Implemented | Owner, and the question |
|---|---|---|---|
| EP1 | The contract's section 7.2, the fourth row of the causes: the child checks that the outcome's "operation was opened by an earlier entry of that scope whose input is an act with that intent digest". No text says how the child reads that earlier entry. A foreign entry is read by its fact (section 7.4), and an operation's ID gives a position and no hash. | The opening entry is one that the creation names by a fact among its fields, and that is at hand as a fetched entry. It is of the creator, at the position that the operation's ID names, before the outcome, and it holds the `operation` record of that ordinal. The source entry seals the message, and so that fact's hash. A creation that names no such entry is `source-unverified`, and nothing is written. The register's `create` names it as `claim`. The scope fetches it as it fetches every fact that a creation's fields name, and a replay finds it in the genesis's `uses`. | The scope contract. Is the opening entry always named by a field of the creation, or is it read in another way? |
| EP2 | The contract's section 7.1 founds the register by an `install` intent, with a seed of the kind `register`. The first delivery founds a directory with no creator, by a `found` intent, as its stand-in. The plan gives step 8 `derive/src/genesis.ts` only. | The genesis judge founds a register: the kind `register`, an intent of the kind `install`, and the definition `platform:register`, each only with the other two. A directory with no creator is founded by `found`, as before, and never under the register's definition. `Scope.found` and the Worker still build a seed of the kind `directory`, so no object founds a register yet: marked for the merge in the delivery report. | The builder, at step 9c: `scope/src/core.ts` and `worker.ts` build the seed's kind from the definition that is named. |
| EP3 | Section 12.1.1 gives the claim a fixed, required slot `policy`. The row `found` states no source for it. Section 3.8, step 1, says "the founding policy value used". | A written effect: `policy` of the claim is `register.policy`, read from `also.register`. So the act names the register, and the founder's intent states the register's revision in `expected`. The register item never changes, so that revision is always 1. | The authority note, to confirm the source. |
| EP4 | Section 12.1.1 states the attempts of `revoke-credential` and `delete-repository`, and nothing of their evidence or of what their outcomes derive. | Each rule selects nothing and derives nothing. Another attempt follows a `refused` or an `unknown`, to the stated number. No read is decisive: only the request's own answer settles an attempt. The body of the evidence is not checked. | The authority note. Is a read of the host decisive for a deletion or a revocation, and what does each body hold? |
| EP5 | Section 12.1, "Messages between scopes", gives the register's `create` a field `founding`, the founder's signed intent. No field type holds a signed intent. It is no field value either: it holds `null` members, and the judge gives a rule of a marked type only a field value. Section 12.1.2 opens the repository "with its fixed slots from the creation's fields", and `founder` and `register` are no field of that list. | The data declares no field `founding`. A creation that carries one is refused `bad-field`, as for any undeclared field. The founder's intent is in the claim's entry, which the creation names by its fact and the genesis retains. `register` is the scope of the claim's fact, by the part `scope`. `founder` is the value that the claim's entry set as the claim's `founder`, by the part `set`. Both are written forms. | The authority note, with the contract. Does the `create` carry the signed intent, and in which form? Are the two slots read from the claim as here? |
| EP6 | Section 12.1 gives the `create` of the rules scope the field `membership`, and that of the destination `import`, `membership` and `rules`. Sections 12.1.4 and 12.1.5 type them: a scope ID for each of the two scopes, and a truth value for `import`. The directory derives each ID "from the seed that it sends". No form of a send gives the scope ID of a seed that the same entry sends, or whether a slot is set. The table of marks lists no rule for either send, and its row 1 gives the reader's side only. A written list of sends holds at most one mark (entry EJ4). | The destination's `create` is a mark at place 6, `create-destination`, with its clauses as data and no rule in the package. The `create` of the rules scope is written with the two fields that a form can say, `branch` and `directory`, and without `membership`. So a rules scope that requires that field refuses its genesis until this is decided. The stand-in of test support gives the destination's request, with the IDs as the digests of the seeds of creations 0 and 1. | The authority note, with the contract. In what form does a creation of a genesis carry the scope ID of a sibling, and a truth value for a slot that is set? May a list hold two marks, when each written send is made once? |
| EP7 | The row `retry-import` states the guard "The import's stated attempts are used, and none is `confirmed`". No guard form reads an operation, and the table of marks lists only the effect of the row (row 11). | A mark at place 4, `import-spent`, with no rule in the package. The stand-in holds when an import exists, each has all its stated attempts opened and settled, and `imported` is not set. Its refusal is `import-not-spent`. The folded state has no read of the operations of one kind, so the stand-in walks the scope's own entries. | The authority note. Is this a rule of version 1, under which name and with which refusal name? The proof plan, for a read of operations by kind. |
| EP8 | The rows `open-issue` and `open-pr` state the field `definition`, and "`kind`, `title` and `state` from the act". The lane's `create` carries "R2's genesis fields". The rows state no other field of the act. | The acts declare `definition`, `title` and `body`, a detached text, and for an issue `conditions`, for a pull request `draft`: the fields of the genesis acts of the two pinned lanes that a requester supplies. The rule `create-lane` sends them with `opener`, the signer as the directory judged it, and `number`. For a pull request it adds `destination` and `rules` from the repository. `kind` and `state` are constants of each row. A lane definition whose genesis takes other fields is not created by these rows. | The authority note, with the lane design. Which fields do the two acts declare? |
| EP9 | The row "An outcome of `import`" says "the copy's own answer, with the imported head", and "The last `refused`: the same, state `failed`". It states no body for the evidence, and does not say which refusal is the last. Its `relate` has no clause (entry EJ1). | The evidence of a `confirmed` import is `{ commit }`, a commit ID of 40 or 64 hex characters. Any other body is `bad-input`. No read is decisive. The last refusal is the one after which every stated attempt is opened and refused, so that no answer can still confirm the import. An `unknown` attempt keeps it open. The update is of the `repository` item, to `repository.destination`, with the detail `commit` for `done` and none for `failed`. | The authority note. The body of the evidence, and the meaning of "the last". |
| EP10 | The rule `index-row` selects "the row whose `scope` is the sender". The folded state is indexed by type, state and ID, and the type `lane` holds up to 100,000 live rows. | It reads every page of the rows. The read is bounded only by what the scope holds, as entry EM12 says of membership. | The proof plan, with request `cc570904`. A bound, or an index of rows by `scope`. |
| EP11 | Row 10 of the table of marks gives `worker-standing` one refusal, and does not say what it answers when the entry would lack the worker's observation. Rows 9 and 27 say "not completed". | Not completed, `dependency-unavailable`, when no observation of the worker is at hand, or it is of another scope than `repository.membership`. `worker-not-active` when the worker is of another membership scope, is not active, or is an agent whose controller is not the signer while the signer's role is not `admin`. The signer's role is read from the observation in the grant that was judged. | The authority note, to confirm. |
| EP12 | The rule `index-row` keeps a field "only when the source entry's position is higher than the one in `seen` for that field". The record `seen` has six members. The row's `kind` and `author` have none, and a lane's index row also carries `number`. | `kind` and `author` are taken when the row holds none, and are then kept. `number` is never taken from a lane: a row has the number that the directory allocated. `first` and `latest` are the earliest and the latest of the source entries' times, which is the same as by position because the times of one history do not go back. The list `assignees` is set whole, as removals and additions. | The authority note, to confirm, or to give `kind` and `author` a position. |
| EP13 | The rows of the directory read `also.repository`, and the rule `next-number` changes it. An act states the revision of each subject that no mark selects. | `open-issue`, `open-pr` and `open-task` state the repository's revision in `expected`. Each row that is opened moves it. So of two such acts that were signed on one revision, the second is answered `revision-moved` and is signed again. | The authority note, with the proof plan. Is one lane opened for each revision of the repository meant? |
| EP14 | The contract's section 6.6 puts `membership`, "the membership scope that the creating scope records", in the body of every `create`. Derive reads a scope's reference from its genesis entry (`membershipOf`), and a directory records it in a slot (authority note, section 3.3). | The rule `create-lane` builds its whole request, and sets the member from `repository.membership`. The production authority reads the slot too (`repositoryAuthority`, with `directoryMembership`). Not built, in modules of other steps: a written `create` of a directory, which is the task's, holds no such member, and a replay still reads a directory's reference from its genesis, so an act of a directory that was judged on a filter would not verify. The task's `create` carries the reference as a field. | The builder, at the merge: `derive/src/sends.ts` (`recordedMembership`) and `replay/src/verify.ts`. |
| EP15 | Row 9 gives `definition-active` one refusal, `not-activated`. Section 12.1.2 answers `dependency-unavailable` when the bytes "cannot be read or do not hash". The contract's section 7.2 refuses bytes that do not validate, `unsupported-definition`. | Bytes that hash to the digest and do not validate in this runtime are not completed, `dependency-unavailable`: the row states no refusal name for them. The same for an observation of another scope than `repository.rules`, and for a closure that is larger than its bound. The scope makes no further read and reads no value before a turn yet (entry EM3), so in a deployed scope this guard is never completed. | The authority note, with the contract. Is `unsupported-definition` a refusal of this rule? |
| EP16 | The row `index` says "An advisory from a scope whose recorded directory is not this scope changes nothing". A rule is not given the sender's genesis, and a guard reads the source entry and not its scope's seed (the contract's section 7.2, "One thing such an answer would need"). | No check in the row. What holds it is the platform's address: a lane's runtime sends an `index` row only to the directory that it records, and the receiver checks that the source entry holds that send to this scope. A lane of another repository that records this directory would be listed. | The authority note, with the contract (gap G7). |
| EP17 | The row `open-task` creates a scope under `platform:task@1`, which is IA's. The contract's section 7.2 refuses a founding whose closure names a platform version that the runtime does not implement. | The row is data, whole. The source does not check the platform names of a definition's `create` sends, at a founding or at a creation. So the directory would be created with this row, and the task's creation would wait, `unsupported-definition`, at the task's own object. | The builder, with IA. |

**What step 9 leaves for step 9c.** The rule of `create-repository`, when
entry EJ1 is answered, with the clauses that `DIRECTORY_CLAUSES` keeps as
data. The judge of an outcome still lets no rule send a creation
(`derive/src/outcomes.ts`). The seed of a register in `Scope.found` (entry
EP2). The three decisions of entries EP5 to EP7, after which the
directory's two stand-ins leave test support.

## 17. Steps 9a and 9d: the rules scope

Written 2026-10-05, by the worker of those two steps. Entries have the
prefix EQ. The adopted designs are the scope contract's revision 16 at
`54420b41` and the authority note's revision 21 at `f9ec25e4`. Later
revisions were not used, and the extents design is not part of this.
Section numbers are those of the two adopted texts. Each entry ends with
the question for its owner. Neither lane digest changes, and no entry that
an earlier source wrote has other bytes.

`packages/platform/src/rules-scope.ts` holds `platform:rules@1` as data,
row for row from the authority note's section 12.1.4, and the three rules
that the note's table of marks names for it (section 12.1.8, rows 27 to
29): `checkers`, `configuration-bytes` and `definition-bytes`, each a
guard. The data holds those three marks and no other. So the package's
rules are the whole version, and `platform:rules@1` is runnable with no
stand-in. A mark states one key in `row`: `configuration-bytes` has `P18`,
where the note's cell names P18 and P21.

**What is not shown.** The rules are witnessed as judgments in memory,
with derive's real judges. No real scope ran one: entry EQ9. The rules
scope's answer to an observation of the rules, which the plan's row 9d
also names, is not built: entry EQ8. The plan's T37 is not shown.

Witnesses: `packages/platform/test/rules-scope.test.ts` (T43 for the rules
definition; T50, the rules scope's table, with cases a to d of section
12.1.4 and cases 1 to 3 of the contract's witness 18.35). Its stand-ins
are in `packages/platform/test/support-rules.ts`, each labelled.

| # | Where the texts differ or are silent | Implemented | Owner, and the question |
|---|---|---|---|
| EQ1 | `keep-configuration` with no value at hand under its digest. The contract's section 6.2 says that a place which requires a value and has none "is refused `bad-field`" (also its witness 18.35, cases 2 and 3). The note's row 28 makes the check a guard, whose refusal is named `configuration-mismatch`, and a guard's code is `guard-failed`. | Both: the name is `configuration-mismatch` in every refusal of the rule. The code is `bad-field` when no value at hand has the digest in `artroom-check-configuration-1`: none came, other bytes came, the bytes are not canonical, or the value is past the bound. The code is `guard-failed` when the value is at hand and its `image` is no content digest. | The authority note, with the contract. Is that the code of each case? |
| EQ2 | The bound on one value of `artroom-check-configuration-1`. The contract's section 6.2 reads no value "longer than the bound of its domain", and its section 15.3a leaves the number to the proof plan. No text states one. Its witness 18.35 uses 32 KiB and calls it made up. | `CONFIGURATION_BYTES`, 32 KiB, a temporary value in the rule's code, as entry EM1 has the bound of a place. A definition's bytes are bounded by the judge's `definitionBytes`. | The proof plan. The number. |
| EQ3 | `activate` when bytes are not supplied, and its refusals. The contract's section 6.2 would refuse `bad-field` for a place with no value, and names the closure's digests as places. The note's row 29 says "Not completed, `dependency-unavailable`, when a definition of the closure is not supplied", and states one refusal: `unsupported-definition`, "for bytes that do not validate". The contract's witness 18.35 says that "the whole of `activate`" is the authority note's. The row gives no refusal for bytes that state another name, and none for a closure past the bound. | The note's row. Not completed, `dependency-unavailable`, when the definition's own bytes or those of a definition of its closure are not at hand under their digest. Refused with the code and the name `unsupported-definition` when a definition of the closure, or the definition, does not validate without the platform option; when the closure names more definitions than the judge's `namedDefinitions`, counted as a scope's own closure is; and when the definition states another name than the field `name`. No name is added. | The authority note. Is a definition whose own bytes are missing not completed, or `bad-field`? Which refusal has a definition that states another name? |
| EQ4 | "The `image` is a content digest" (sections 3.11 and 12.1.4). No text states the form of that digest. Section 3.11 calls the other members of a configuration "a proposal for R2 and R4 to agree". The item `configuration` has a value `name`, and a configuration has a member `name`. | `image` is a digest in the contract's form: `sha256:` and 64 hex digits. The value is a record. No other member is checked, and the member `name` is not compared with the field `name`, which sets the item's value. | The authority note, with the lane design and the proof plan. The form of an image's digest, the members that are checked, and whether the two names must agree. |
| EQ5 | The item table gives `definition` the party `activator` and `configuration` the party `keeper`, each fixed and required. The rows `activate` and `keep-configuration` state no effect that sets one. The rows state no field. `publish` "sets `approvals`, `ownerMayReview`, `checks` and `labels` from the fields". | Each party is the signer: `{ party: { slot, from: { signer: true } } }`. `keep-configuration` and `activate` have the fields `digest` and `name`, both required. `publish` has the four fields, all required, so every `publish` states the rules whole. `establish` has the fields `branch`, `directory` and `membership`, as the table of messages lists them, and `membership` is a text of at most 64 bytes: a scope ID. | The authority note, to confirm. |
| EQ6 | The row `retire-definition` states `{ state: "retired" }` and "Guards: None". The validator asks, for a `state` effect, a guard on the state that lists no final state (the contract's section 6.3). | `{ state: ["active"] }`, as entry EM15 for membership. | The authority note, to confirm. |
| EQ7 | Entry EM21, for the rules scope. Section 3.3 and section 12.1 say that the rules scope holds "the membership scope's ID, from the directory's seed, in the creation's fields", and that "the incarnation is fixed by the first entry that retains an observation". Row 1 of the table of marks gives it no mark: guard 1 of an observation reads both. No text says which incarnation the scope asks for in its first read: a read's request names the observed scope with its incarnation. Row 27 says what `checkers` reads, and does not say what it does with an observation of another scope. A check's `checker` is a member reference, which names a membership scope with an incarnation. | The ID is the value `rules.membership`, set by the genesis from the field `membership` and fixed. `membershipId` reads it from the folded state. The incarnation is not recorded by this step: no fold holds "the first entry that retains an observation", and the production authority still reads nothing for a rules scope. `checkers` fails closed in three places. A checker that the field names in another membership scope than the recorded one, or in another incarnation than the observation's, is `not-a-checker`. An observation whose `of` is not the recorded scope is treated as missing: not completed. The checks are read in the order of the list, and the first that does not pass decides. | The builder, at the merge, for guard 1 and the fold (`scope/src/authority.ts`, `repositoryAuthority`). The authority note: how does the scope learn the incarnation for its first read? |
| EQ8 | The plan's row 9d names "the rules scope's answer to an observation of the rules, and its read (entry EJ15)". A `RulesObservation` has `revision`: "the position of the latest `publish` at that head; 0 when there is none" (section 3.3). Section 12.1.4 says "the revision of the rules is this entry's position", and gives the item `rules` no slot for it. An item's `revision` is a count of its changes, and no position. So the answer is no function of the folded state, which is what `Platform.observed` is given. | Not built: no answer, no read, and nothing in `scope/src/namespace.ts`, `authority.ts` or `derive/src/grant.ts`. `platform("platform:rules@1")` has no `observed`, so a rules scope answers no observation. Nothing is invented. One written form would give it: a reference slot of type `fact`, kind `publish`, that `publish` sets from `self`, as `key.revokedBy` is set in membership. The lane's `rules.source` is such a fact. | The authority note, for the slot or another source of the revision. The builder, for the read, with entry EJ15. |
| EQ9 | Entries EM1 to EM4 and EM21: the scope's runtime makes no further read before a turn, reads no `values` beside an intent and keeps none, and reads no observation for an act of a rules scope. The plan's step 8a owns that, and it is not built. | Not built here. On a real scope under the production authority every act of a rules scope that needs a grant is answered `authority-unavailable`. With a test authority, `keep-configuration` is refused `bad-field`, named `configuration-mismatch`; `activate` is not completed; and `publish` with at least one check is not completed. `establish`, `publish` with no check, `retire-definition` and `rules-wanted` run. A replay does not derive again an entry whose rule read a value (entry EM4). | The builder, at the merge. |
| EQ10 | The `rules` update, against the pinned `change` lane (`packages/lanes/src/change.ts`, the handler `rules`). Read, and not run. The update's detail has `labels`, as section 12.1.4 writes it, and the lane's handler declares `approvals`, `checks` and `ownerMayReview` only: a field that a handler does not declare is refused (`readFields`). The handler requires `checks`, and before the first `publish` the slot is unset. The handler sets `source` from the update's source entry, as a fact of kind `publish` under `platform:rules`, and the source entry of the update is the entry that recorded `rules-wanted`, whose kind is not `publish`. No pinned lane sends `rules-wanted`. | The row as the note writes it. No lane data is read or changed here, and neither lane digest moves. So the update is witnessed at the rules scope only, with a made-up lane that sends the `tell`. | The lane design, with the authority note. Which side changes: the detail, the handler's fields, and the kind that `source` names? |
| EQ11 | Section 12.1 says that a rules scope is created by "the directory's genesis, creation 1". The production wiring founds a scope under any platform definition that it can run, from a signed intent, as it does for the inbox (entry EC4). With the three rules, `platform:rules@1` is such a definition. | Not changed: a founding under `platform:rules@1` would be written, with the founder's own fields. Nothing reads such a scope as a repository's rules: a directory records the rules scope that its own `create` made. | The builder, with the step that makes the register the one founding (plan steps 9 and 9c). |

## 18. Steps 9b, 9e and 9f: the destination

Written 2026-10-05, by the worker of those steps. Entries have the prefix
ER. The adopted designs are the scope contract's revision 16 at `54420b41`
and the authority note's revision 21 at `f9ec25e4`. Neither file is in
this worktree's `notes/`: both were read from those commits. Section
numbers are their own. "The table of marks" is the note's section 12.1.8.
The fence of section 6.8 is not adopted, and nothing here names one.

`packages/platform/src/destination.ts` holds `platform:destination@1` as
data, row for row from section 12.1.5, with `outcomes`, and eight rules:
`declare-first-head`, `open-first-head`, `open-judge`, `publication-of`,
`open-withdrawn`, `open-branch-read`, `reopen-publish` and `collect-list`.

**The destination cannot be created under the production rules.** Ten
marks of its data have no rule: `abort-if-behind` (step 9e), `resend-due`
(a guard that the table of marks does not list), and the eight rules of
`outcomes` (step 9f). The adopted texts do not let any of them be written
whole, and none is invented or written in part. By the whole-scope rule of
the contract's section 6.1 the version runs nothing. **Step 9f is not
built**: no rule of an outcome entry exists, so the reasons of section 6.5,
the three classes of send evidence, the receipt and the first head have no
witness. Entries ER5 to ER9 say what each waits for.

No entry that an earlier source wrote has other bytes, and neither lane
digest changes: no file of `packages/lanes` is touched. One judgment
changes, in `packages/derive`: entry ER12.

Witnesses: `packages/platform/test/destination.test.ts` (T43 for the
destination; T50, the destination's first table; section 12.2; the cases a
to e of section 12.1.5). Its stand-ins are in
`packages/platform/test/support-destination.ts`, each labelled.

| # | Where the texts differ or are silent | Implemented | Owner, and the question |
|---|---|---|---|
| ER1 | The note names two kinds of operation, `first-head` and `judge` (rows 30 to 33). For the rest it says "a push, its mint, its revocation; the deciding read; the receipt", and "the read that `adopt-head` opens" (the row of outcomes of section 12.1.5; row e). `outcomes` is keyed by kind, and each mark states a rule's name. Row 33 names the rule `judge`, and no other rule of place 7 is named. | The kinds `push`, `mint`, `revoke`, `read`, `receipt` and `adopt-read`. `mint` and `revoke` are the names that `hold@1` uses. The rule names in the marks: `first-head`, `push`, `mint`, `revoke`, `deciding-read`, `receipt`, `adopt-read`. The row of each is P16, and of `judge` P19. None of the eight rules is written. | The authority note. The six kinds and the seven rule names. |
| ER2 | Row 32 opens `judge` "when the slot is empty and the branch is `ready`", "for the oldest queued publication". The slot stays empty until the outcome of `judge`. So a second `reserve` before that outcome opens a second `judge`, and an `operation` effect has no member that names a publication (ER6). The note states no number of attempts for `judge`. | The row as written: the rule reads `branch.slot` and the branch's state, and nothing of the operations. `judge` states 1 attempt, as "a credentialed read" does in G3. A second open `judge` is possible, and is not asserted by any test. What its outcome judges is step 9f's. | The authority note. Should `open-judge` hold while an earlier `judge` has no outcome, and by which record does it know? How many attempts has `judge`, and what opens it again after an `unknown`? |
| ER3 | Row b gives the fields `verdicts` and `jobs` of `reserve` the mark `collect-list`, "up to the `max` of the sender's type". The row `reserve` states no type for `links`. A declared list of records that each hold a `fact` would have every link's entry fetched, and section 6.5 counts no such fetch. No type holds a fact reference that is not fetched. The platform package does not depend on the lanes package. | `links` has the same mark, at a third field, which the table of marks does not list. The rule checks the list by its field: at most 256 verdicts, 64 jobs and 32 links, the `max` of `review`, `job` and `link` in `packages/lanes/src/change.ts`, written as `COLLECT_MOST`. Each record has exactly the members that the lane's `merge` row collects: a verdict `review`, `reviewer`, `verdict`; a job `job`, `name`, `state` and, when something decided it, `decidedBy`; a link `link`, `issue`. A record with another member, a missing one or a value of another kind makes the message `bad-field`. If the lane's row or a `max` changes, this rule must change with it. | The authority note, with R2. The type of `links`. Whether the bounds and the members are read from the sender's pinned definition, and by which form. |
| ER4 | The row `resend` has the guard "The publication is `unresolved`, or it is `published` with a receipt that is not written; and the stated attempts of that operation are used". No guard form reads an operation, the table of marks lists no rule at place 4 for it, and no slot of `publication` names its operations (ER6). Row 37 opens "one new operation", and the row `judge` opens a push "with its mint". | `{ state: ["unresolved", "published"] }` is written. The rest is a mark at place 4, `resend-due`, with this entry as its row and no rule. `reopen-publish` is the row as written: one operation with 1 attempt and its attempt 1. It is the push when the publication is `unresolved` and the receipt's write when it is `published`. It opens no mint. | The authority note. The rule of the guard, its name and its refusal. Whether a `resend` opens the mint of its one attempt. |
| ER5 | Row 35, `abort-if-behind`: "the effects of section 6.8, with the abort attempt and the revocation as `operation` effects". Four things are not stated. (1) The kind of "the abort attempt": the row of outcomes names no such kind, and section 5.8 counts "1 entry for an abort". (2) Which token is live: section 6.1 says G holds "a record for each attempt" and "the token ledger", and section 12.1.5 declares no item and no record for either, so a revocation cannot name a token. (3) "It opens no further attempt": the ledger opens attempt n + 1 in the outcome entry of attempt n when the owner's `retries` allows, and `retries(result, operation)` is given no state, so it cannot know of an abort. (4) Which entry is the reservation's: no slot names it, so it is found only by reading the scope's own history from the publication's opening on. | Not written. The mark stands in the data with no rule. The handler's fields are those of membership's notice: `key`, a text; `member`, a member; `entry`, a fact of `revoke-key` under `platform:membership`, which is fetched. Its one guard is the row's, with no refusal name, because the row states none. | The authority note, for (1), (2) and (4). The scope contract, for whether a retry rule is given the state. |
| ER6 | An `operation` effect has an owner, a kind and a number of attempts (the contract's section 4.1). The rows of section 12.1.5 open operations "for the oldest queued publication", "for that publication's push", and for a token. Nothing says for which publication, token or commit an operation is. `hold@1` keeps a record that names its operation. The destination's two item types have no such slot, and "no row reduced" lets none be added. | Nothing. It is the first reason that no rule of `outcomes` is written: an outcome's rule is given the operation and the state, and cannot tell which publication to change. A withdrawn publication makes "the oldest queued" at the outcome another one than at the opening. | The authority note, with the scope contract. A slot of `publication` that holds its operations, a member of the opening, or a reading of the entry that opened the operation. |
| ER7 | Section 6.6, step 6: the read "and only that" decides. The integration commit: `published`. The base: `unresolved`, and "open attempt n+1". The ledger opens attempt n + 1 only in the outcome entry of attempt n of the same operation, accepts a read only as an attempt's first outcome, and lets only that attempt's own answer follow an `unknown` (entries EB3, EB7 and EG6). So a read that is another operation cannot open the next attempt of a push, and a lost reply that the read shows as landed ends the publication while its attempt stays `unknown` (the note's point O11; the contract's R1-38). Who opens the mint of attempt n + 1, the revocation of each token and the deciding read is not stated either. | Nothing. The rules `push`, `mint`, `revoke` and `deciding-read` are not written. The witness that the task names, "the unknown outcome of a push leaves only its own answer able to follow", is the ledger's rule and is witnessed for the ledger in `derive/test/forms-ledger.test.ts`. It is not shown for a push of the destination, because that needs the rule `push`. | The scope contract, for R1-38; the authority note, for O11 and for which entry opens each of the four operations of one attempt. |
| ER8 | Row 33, `judge`: its evidence "is the read of the branch's head and of the integration commit's closure", and it reads `observed` and "the fetched entries in `uses`". No text states the body of that evidence. The judge of an outcome gives a rule no `observed` and no `uses`, and writes neither (entry EM3; `derive/src/outcomes.ts`). The `relate` that it sends has no clause (entry EJ1). Checks 3 to 7 of section 6.5 read entries of a lane under `change` by their effects and their intents, "the manifest is complete" is R2's section 5.2, and "independent of the authors" is section 3.10: no form reads those from a fetched entry. | Not written, also not as a function beside the rule: a rule that reads forms nobody has stated would be invented. The mark stands in `outcomes` with no rule. | The builder, for `observed` and `uses` in the judge of an outcome (EM3). The authority note, for the body of the evidence, and for how each check of section 6.5 reads the lane's entries. |
| ER9 | Section 12.2 gives the founding commit "a fixed platform identity that names G's scope ID" and "a fixed sentence and the claim's fact", and section 6.10 gives the receipt "a commit whose one file is the receipt". The bytes of neither are stated. The outcome of `first-head` makes the branch `ready` only when "the branch holds that commit", and with no import "that commit" is the founding commit. The row says the outcome "opens the receipt's operations", and does not list them. | Not written. The rules `first-head`, `receipt` and `adopt-read` have marks and no rule. The rule `declare-first-head` and `open-first-head` open the operation, with 3 attempts (section 12.2), and state no commit, because an opening has no member for one (ER6). | The authority note. The exact commit objects, and the operations of a receipt. |
| ER10 | The row `withdraw` sets `withdrawDecided` "on the first decision that is bound", "whatever it decides", and case d says of a refused one "The mark is set". The contract's section 7.4 says a refused deciding entry "applies no effect of its handler", and its section 6.11 gives the one effect of a refused bound request to a capability's code. None of the seven places of a mark adds an effect to a refused delivery. The row also says `opens: "publication"`, "only when none exists". A rule's opening is a fault in a handler whose `opens` is set. | The mark is set by a written effect when the bound `withdraw` is applied, which is while the publication is `queued`. A refused `withdraw` sets nothing: case d is witnessed with the mark still false, and the test says so. So the count of decisions of section 5.8 is not kept for a refusal, and a second `withdraw` after a refused one is decided the same way. The handler's `opens` is null, and the rule `open-withdrawn` opens the item. The two refusals are two written guards on the state, named `reserved` and `ended`. The final update while `queued` has the relationship state `not-reserved` and the detail `operation` and `outcome`. | The authority note, with the scope contract. By which place does platform code give a refused deciding entry its one effect? |
| ER11 | The rule `publication-of` finds a publication by its operation. The state is indexed by type, state and ID, and retained final publications are not bounded. | It reads every page of the type, in every state. As entry EM12. | The proof plan, with request `cc570904`. A bound, or an index by the operation. |
| ER12 | Entries EB12 and EN5: the confirmation of a provisional scope opens attempt 1 of each operation that its genesis holds, and no judge did. `heldOpenings` took the genesis entry, which the judge of a confirmation is not given. | `packages/derive/src/delivery.ts`: the judge of a confirmation adds the effects of `heldOpenings`. `packages/derive/src/ledger.ts`: `heldOpenings(view)` reads the operations `0:0`, `0:1` and so on from the folded state. A scope whose genesis holds no operation writes the confirmation that it wrote before. A rule in a genesis is still not asked for a first attempt, whether or not the scope is provisional. The room of the held operation is counted from the genesis by `owed`, as for any operation. Witness: `destination.test.ts`, the founding with no import. Control: the first held opening left out. It distinguishes. | The builder. This closes EB12. |
| ER13 | Small places where a row states less than a form needs. | The grant of `establish` is `destination.establish`, which nothing reads, as for membership. Every field of `establish` and of `reserve` is required. The third guard of `import` and the guard of `compromised` have no refusal name. `adopt-head` has no field: section 6.9 says it "records who adopted what and why", and the row states no field for why. The guard of `reserve` on an existing publication is named `withdrawn` in every state, as the row writes it. | The authority note, to confirm each or to state the form. |

**What was not run.** No Git command, no host, no gateway and no provider.
The stand-in rules of test support let a test reach a `ready` branch and a
`reserved` publication. They show nothing about rows 33, 35 and e.

## 19. Step 22: replay of preparation, outcomes and an ancestry record

Written 2026-10-05, by the worker of step 22. Entries have the prefix EU.
"The contract" is the scope contract's revision 16 at `54420b41`, and "the
authority note" is revision 21 at `f9ec25e4`. Both are adopted, and section
numbers are their own. The code is in `packages/replay/src/verify.ts`.

No entry's bytes change, no state digest changes and neither lane digest
changes: the step writes no entry. It changes only what a verifier reports
for a history.

**What a replay now proves.** For a preparation entry: the signature, in
both modes; the action and the window that the step asks of its grant;
the grant, from the observation that it retains, by the same guards as an
act's; the step's guards over the folded state; that no earlier entry
prepared the same intent, capability and step; and the records and
operations that it derives. For an outcome entry: that its owner and kind
are those of its operation; the checks of the contract's section 4.3 on
the attempt, the basis and the evidence's form; `selected`; the next
attempt; and every effect, request and operation that the owner's rule
derives, with the guards of section 13 above on a platform rule's output
(entries EN2 to EN8, and EJ11): an output that the commit refuses as a
fault writes no entry in a replay, so a history that holds it is a
`mismatch`. For an ancestry record: that the scope retains the snapshot
that the record names, under its digest, and that the count is the
snapshot's; and, at the act whose guard `ancestry` reads the record, the
guard's verdict, from the record, that snapshot and the lane's earlier
entries. For each record of `observed` of an act: guards 1 and 3 to 6 of
the contract's section 16.1, and the value. This closes entries E13 and
EC3 for a verifier that is given the code, the replay's part of EM26, and
the replay's part of EP14 for a directory. The default of `grants` is
`proven` (entry EM24), and every test of this step replays under it.

**What a replay still trusts.** The report lists each under `trusts`.
What an outcome entry says the outside system answered: that an answer
was that attempt's own, and that a read returned what was recorded. That
the Git host returned the snapshot and the head of an ancestry record.
That the outside
effects of a preparation were dispatched only after its entry was
sealed. That each read behind an observation was made, and when. That
the rules which the replay ran for a platform definition are the rules
of that name and version. With an anchor for an observed head, the value
of the observation.

**What a replay does not claim.** The walk of an ancestry record. A
history that holds one is `incomplete`, and never `consistent` (entry
EU2).

**What was not run, and the limits of the witnesses.** No real scope
wrote a history of this step: the two histories are written in memory by
derive's judges (`packages/replay/test/staging.ts`), and their creator,
their membership and every outside answer are labelled stand-ins. The
value of an observation in a preparation's grant and in `observed` is
witnessed only on the anchor's path: the derivation from a history is the
code that derives an act's grant, which T44 witnesses. No history under
`platform:directory@1` was replayed: the reader of its slot is witnessed
on a made-up version, and that the directory's version supplies its own
reader is one assertion in `packages/platform/test/directory.test.ts`.

| # | Where the texts differ or are silent | Implemented | Owner, and the question |
|---|---|---|---|
| EU1 | The contract's section 9.3 has a verifier derive a preparation with the capability's rules for the step, and an outcome with its owner's rules. No text says how a verifier is given either, and entry EL9 left one port type for the forms and the steps to this step. | `Options.capabilities` carries the steps when the value has them, read by derive's `stepsOf`, as the runtime reads its port. `Options.owners` is new, and carries the rules of the owners that are capabilities. The rules of a pinned platform definition come with `Options.platform`, as before. A preparation of a step with no code, and an outcome of an owner and kind with no rules, are `unsupported-definition` at that entry, before any other check of it. An outcome that names no opened operation is asked by the owner and kind that its input states. The one port type is not built: `stepsOf` stays, with its seam. The replay command supplies no code, so from the command line every such history is `unsupported-definition`. | The builder: the command's code, with step 30; the one port type, in `derive/src/prepare.ts` and `scope/src/ports.ts`. |
| EU2 | The contract's sections 9.3 and 16.4 say a verifier derives the walk of an ancestry record again, "from the commit's parents", and answers `incomplete` when "a commit that the walk needs can no longer be read". A verifier's source serves entries and retained inputs, and no commit. No text says from where a replay reads a commit by its ID. `walk` also takes the selected inputs of the commitment, each with its report's commit, and no source builds that list (entry EF10). No source calls `walk` outside a test. | Decided by the builder on 2026-10-05: the contract is followed. The walk is not derived, so a replay of a history that holds an ancestry record is `incomplete`, at the check entry, with words that name the walk. It is never `consistent`, and no trust is listed in its place. Every other check runs first and gives its mismatch first: the snapshot is read by its digest, `incomplete` at once when the bytes are gone; its digest and count are checked; and at the act that reads the record the guard `ancestry` is derived with that snapshot. The answer for the walk is given last, after the whole history is read, so the coverage lists the check entry although its walk was not derived. `staged-ref-read` is still listed. The verifier has no port for commits: one that only refused would change nothing, and none is added before the texts say what it serves. Witness: T24, in `replay/test/verify.test.ts`, with a history without a check entry that is `consistent`. Control: the last answer removed. It distinguishes. So T24 as the plan words it, "gives the same judgment", holds for every entry and not for the result. | Owed, by the scope contract with the authority note: from where a verifier reads a commit by its ID, and how it finds the selected inputs with their commits. Owed, by the builder, once that is stated: a source of commits (the Git package's reader) and the walk in the replay. Until then no lane history with a check entry replays as `consistent`. |
| EU3 | The contract's section 9.3 has the verifier check "the snapshot's digest and count". The commit of a check entry checks the snapshot's bytes against its digest (`scope/src/operations.ts`) and does not compare the count: the guard `ancestry` does, at the act. | The replay compares the count at the check entry, and a difference is a `mismatch` there. So a check entry that the service wrote with a wrong count is a `mismatch` in a replay, and the act that it would have served is refused by the service. Witness: one row of `replay/test/verify.test.ts`. Control: the check removed. It distinguishes. | The builder, for `hold@1`: should the evidence of a check be refused as not well formed when its count is not its snapshot's? |
| EU4 | Entries EM2 and EM26: no form states the window of an entry and a subject, for a record of `observed`. The table of the authority note's section 3.3, with its four added rows, states each window in prose. Every row that states a window for an observation that an act retains states the window of that act's own grant: `publish` at the rules scope, and `open-issue`, `open-pr` and `open-task` at the directory. | For an act, the window of each record of `observed` is `windowOf` for that act. With none stated the entry is a `mismatch`. Guard 1 is the scope's own membership reference, guard 3 that a ten-second kind is `fresh`, guard 5 the age, and the value is derived as a grant's is, for a key and for a member. The judges of an outcome and of a delivery are given no `observed` and derive none, so such an entry that holds the member is a `mismatch` at the comparison of its input. Witness: `replay/test/verify.test.ts`, "each observation that an act retains". Controls: guard 1 removed, and guard 5 removed. Both distinguish. | The scope contract, with the authority note: the form of EM2. The builder, with the first rule that reads `observed` in an outcome (step 9f, the reservation, at ten seconds) and in a delivery of a result. |
| EU5 | Guard 1 of the contract's section 16.1 lets a record of `observed` be of the scope's "rules reference". No text says where each kind of scope records that reference, and no platform version has an answer to a read of the rules. | An entry that retains an observation of the rules is `unsupported-definition` at that entry. It is never `consistent`. | The authority note. Where does a scope record its rules reference? The builder, with the read of the rules scope (step 9d; entry EJ15). |
| EU6 | Entry EP14, and EM21. The authority note's section 3.3 has four rows for where a scope records its membership reference. The replay read every scope's from its genesis. | A platform version may state where its scopes record the reference: `Coded.membership`, a function of the folded state before the entry, which the platform package supplies for `platform:directory@1` as `directoryMembership`. The replay reads it there, as `repositoryAuthority` does, and from the genesis otherwise. Before the slot is set a directory records none, and a grant there is a `mismatch`. Not built: the rules scope and the destination, whose reference is an ID in the creation's fields with the incarnation fixed by the first entry that retains an observation. The production authority reads nothing for them either, so no history holds a grant there. `derive/src/sends.ts` is not changed. Witness: `replay/test/verify.test.ts`, on a made-up version. Control: the read of the version's reader removed. It distinguishes. | The builder, at steps 9a and 9b, for the two kinds; at the merge, for `derive/src/sends.ts`. The scope contract, to confirm that where a version records the reference is code of the version, reported under `platform-code`. |
| EU7 | The contract's section 9.5 fixes labels for `trusts`, among them `own-answer`, `host-read` and `staged-ref-read`. The package's `trusts` are sentences, and one sentence stood for every outcome. Section 9.3 also lists, for a preparation, that its outside effects were dispatched only after it was sealed, and gives it no label. | The sentence for outcomes names the two labels and is listed once for any outcome, whatever its basis. Two sentences are added: for a preparation's dispatch, and `staged-ref-read`. | The scope contract: a label for a preparation's dispatch. The builder: whether `trusts` should list the labels alone. |

## 20. Steps 19 and 20: the host port, the token ledger's driver and the redaction witness

Written 2026-10-05, by the worker of those steps. Entries have the prefix
ET. The adopted designs are the scope contract's revision 16 at `54420b41`
and the authority note's revision 21 at `f9ec25e4`, read from those
commits. Section numbers are the authority note's. "The review" is
`notes/2026-10-05-i3-host-review.md`.

`packages/git/src/host.ts` holds `GitHost`, the host's two calls for a
token, and `TokenDriver`, the port that gives the scope's ledger one answer
for one attempt of a mint or of a revocation. `packages/scope/src/diag.ts`
holds the diagnoses and the redactor. No adapter for a real host is built,
and `production()` still sends nothing outside the service.

No form of an entry, an input or an answer changes. No entry that an
earlier source wrote has other bytes, and neither lane digest changes: no
file of `packages/lanes` is touched. Three interfaces of code gain an
optional member or a member with a default: `Outside.judged`,
`OperationRules.ready` and `Ports.diagnoses`. One behaviour changes for a
scope that runs the code of `hold@1` with a port that sends a staging: the
request of an attempt of a staging, and of a staged ref's delete, now waits
until that attempt's tokens are `live` (entry ET7). The lane scenarios pass
unchanged. That rests on one run of the `derive` and `scope` projects, and
on no recomputed history.

Entries EL1 to EL9 and ER5 to ER7 are not answered here. Where the port or
the driver would need one of their answers, the entry below says what is
missing and what the source does without it.

Witnesses: `packages/git/test/host.test.ts`;
`packages/scope/test/tokens.test.ts` (T19 through the port);
`packages/scope/test/redaction.test.ts` (T14). The review lists the
stand-ins and the fifteen failure controls.

| # | Where the texts differ or are silent | Implemented | Owner, and the question |
|---|---|---|---|
| ET1 | Section 5.7, "The plaintext": the driver gives the plaintext to a gateway "only after the outcome entry is sealed, and only when that entry made the token `live`". Entry EB10 states the port for outside effects, and it has no way to tell a port that an entry is sealed. | `Outside.judged`, optional. The scope's driver calls it for each decisive answer that the scope has judged, after the turn has ended: with the sealed outcome entry when the answer wrote one, and with null when it wrote none, because it was a copy, a contradiction or no answer. An answer that cannot be written yet is not judged, and the port is told when it is. `TokenDriver` reads the entry itself: the outcome is that attempt's `confirmed` one, and its `token` record is `live` with the ID of the reply. A port that fails in `judged` changes nothing, and is diagnosed. | The builder. The authority note, to confirm that the sealed entry is what a port reads. |
| ET2 | Section 5.3 says a token is held "in memory, passed to the gateway", and section 5.7 that the plaintext goes "to the gateway of the instance that the request names". `Gateway.open` takes a plaintext with the grant of one attempt (entry EG8). No text says what holds the plaintext of a `live` token between its sealed entry and the grant of the attempt that uses it, or how a gateway is found for a token that is for a root. | A port, `Custody`, with one method, `take`, which is given the token's number, its ID, its end time, its purpose, what it is for, and the plaintext. After `take` returns, the driver holds nothing. There is no production `Custody`: test support has `Vault`, labelled. Nothing here opens a grant. | The authority note. The builder, at step 27, for the gateway's store and the route from a token to a gateway. |
| ET3 | What is owed for a `live` token whose plaintext nobody holds. Three ways lead there: the process ends between the mint's answer and the sealed entry; `Custody.take` fails; the host's reply holds an ID and an end time and no plaintext. No text names the case. | The record stays `live`. Nothing is minted again and nothing is revoked on that account: the token is revoked when its use ends, by its ID, as any other. For a token of a staging's attempt this leaves the attempt as it is: section 5.7 sends it when both tokens are `live`, and it would then be sent with a token that no gateway holds. The driver logs `custody-failed` in fixed words for the second way. The first and the third leave no trace beyond the record. | The authority note. Should such a token be revoked at once, and by which entry? |
| ET4 | Which owners' tokens the driver serves. The destination's data names the kinds `mint` and `revoke` (entry ER1). Its definition declares no record for a token, so a request cannot name one (entries ER5 and ER6). | `TokenDriver.accepts` answers true for `hold@1` and the kinds `mint` and `revoke`, and for nothing else. A request reads the `token` record of `hold@1` in the sealed entry that opened the operation, by the member `mint` or `revocation`. With no such record, or more than one, nothing is sent and the attempt is answered `refused`, as not sent. So no token of a publication, a receipt or a first head is minted here. | The authority note, with entries ER5 and ER6. |
| ET5 | The form of a token's ID, and what a reply that cannot be read is. Section 5.7 says a mint is shown "by that request's own answer, with the token's ID and end time". No text states the ID's form. The earlier ledger took a reply with an ID and an unreadable expiry as a known token, and revoked it by its ID. | An ID is 1 to 200 characters of ASCII letters, digits, `.`, `_`, `:` and `-`: the form that `Gateway.open` takes. An end time is a timestamp of the contract's one form. A reply with no such ID, with no such end time, or whose ID holds its own plaintext, is no answer: the attempt is `unknown`, and nothing of the reply is kept. Such a token may be live at the host, and no ledger then holds its ID, so nothing revokes it (section 5.4, rule 5). It ends at the host's own end time. Witness: `host.test.ts`, the second test, whose last list shows three such tokens. | The authority note, for whether an ID with no readable end time is `confirmed`. The installation design, for the ID's form at the chosen host (plan question Q6). |
| ET6 | What the host is asked for. Section 5.3 gives each credential a lifetime in words: "the shortest the host allows", "less than the hold", "minutes". It gives each a reach: one fork, one ref, read or write. No text states a number, or the form of the request: which repository, which access, which lifetime. The sealed `token` record holds a purpose and what the token is for, and no repository: a fork's ID at the host is in another record, which the port is not given. Entry EL5 leaves the bound on a hold's tokens to R4. | `MintAsk` holds only what the sealed entry records: the scope, the operation, the attempt, the token's number, its purpose, and the hold with its instance or the root with its operation and attempt. A host's adapter must find the repository, the access and the lifetime from those, and none exists. The driver checks no bound on the end time that the host gives, and does not compare an access with one that was asked. The earlier ledger's three checks are not carried (the review, fault M11). | The authority note, for the request's form and for what an end time past the bound is. R4, for the numbers. The installation design, for the host. |
| ET7 | Section 5.7, "Which entry makes a token": the request of an attempt of a staging "is sent only when both are `live`", and each attempt of a staged ref's delete has one staging token, "made as the tokens of a staging are". Entry EL6 left the rule to the driver. No text says what ends an attempt whose token never becomes `live`: its mint was refused, so the token is `ended`, or its mint is `unknown`. | `OperationRules.ready`, optional: a pure function of the state, the operation and the attempt's number. The scope's driver asks it before it marks an attempt as sent. False: the attempt stays recorded and not sent, with no wake-up. The next outcome entry that the driver writes starts its walk again, which looks at every such attempt once more. `hold@1` states it for `stage` and `delete`: every token that the attempt's opening made is `live`, and they are as many as the kind has. An attempt whose token never becomes `live` is never sent. It has no outcome, so its operation stays `pending` and keeps what it reserved, and its root stays `creating`. | The authority note. Is such an attempt recorded `refused`, as not sent, so that the next attempt is opened with new tokens? |
| ET8 | A revocation that the host answers with "no such token is live". Section 5.7's table of evidence says that this answer shows the attempt did nothing. Its table of records says that only a `confirmed` revocation makes the token `ended`, "so does rule 4 of section 5.4, whose form is point O12". | The driver answers `refused`, with the basis `own-answer` and the body `{ token, send: "refused", why: "not-live" }`. The code of `hold@1` then leaves the record `revoking` and opens the next attempt, as it does for any refusal. After three attempts the token is still `revoking`. Witness: `tokens.test.ts`, where the host has revoked the token and the first reply was lost. | The authority note. Is a token that the host says is not live `ended`? |
| ET9 | How that request's own answer reaches the scope after its attempt was recorded `unknown`. Rule 2 names "that request's own authenticated answer". No text says how a host delivers an answer again, or how it is shown to be that attempt's own. | `TokenDriver.answered(ask, reply)`: the request as it was sent, and the host's reply. The driver reads the reply as it reads one of `send`, and gives the answer to the function that the scope's driver supplied (`Outside.late`). The scope refuses an answer for an attempt that was never sent. That the reply is the host's, and that request's own, is trusted, as entry EB10 says of every answer. A revocation's late answer is taken too: the earlier ledger dropped it (the review, fault M7). | The authority note, with the installation design. |
| ET10 | What a diagnosis holds, how long it is, and where one is written. The proof plan's key O3 asks for "no credential and no provider text" in a diagnosis, and that it "is within the stated length in the stated unit". No text states the length, the unit or the members. | Three members: `event`, `step` and `name`. No message of a thrown value is read (the review, fault D3). Each member is at most 100 UTF-16 code units, and a redacted text at most 300: the earlier code's number, with its unit now stated. `Ports.diagnoses` is the sink, and the production default writes one JSON line to the runtime's log. One place writes a diagnosis: the operations driver, when its port throws. The outbox dispatcher, the observation read and the other ports discard a failure as before, with no line. | The proof plan (R4), for the length and the unit. The builder, for the other places. |
| ET11 | The token format of the Git host. The earlier redactor's first rule knew the earlier host's. | No rule of `redact` names a host's token format. A host's token is caught only by a rule of syntax: a header, a scheme, a pair, a URL's userinfo or query, or a long random run. That is why a diagnosis reads no provider's text. | The installation design (plan question Q6). |
| ET12 | The plan's row T19 names `scope/test/operations.test.ts`, and its row for step 19 says "T19 runs through it". The plan's section 5 names `MemoryHost`, in the platform package's test support, with one table of faults for the model and for a local repository. | The tests of the made-up owner stay in `operations.test.ts`, unchanged. T19 through the port is a new file, `scope/test/tokens.test.ts`, on the fixture `scope/test/hosted.ts`. `TokenHost`, in `packages/git/test/support/tokens.ts`, is the token half of a host stand-in: it mints and revokes, with a fault for one request. It has no ref and takes no push. The scope's tests import it by its path, because the git package exports no test support, and they name the git package, which the scope's manifest does not list. | The builder, at the merge: an export `./testing` of the git package, and the scope's manifest. The builder, at steps 9c and 26, for `MemoryHost`. |

## 21. Step 15: read sessions, the serving limits and the operator's record

Step 15 builds rows 9, 25, 29 and 31 of the plan's section 3.2: read
sessions bound to one repository (`scope/src/sessions.ts`,
`client/src/session.ts`), the serving limits of a join after a review of
the parked limiter (`scope/src/limits.ts`;
`notes/2026-10-05-i3-limits-review.md`), and the operator's record with
the two lists of requests that wait (`scope/src/operator.ts`, three reads
in `scope/src/reads.ts`). `parked/room/src/requests.ts` and `ratelimit.ts`
are deleted. The adopted texts are the authority note at revision 21
(`f9ec25e4`) and the scope contract at revision 16 (`54420b41`).

**A read session is a credential. What the source states of it:**

| Question | Answer |
|---|---|
| What it binds | The deployment's name; the membership scope with its incarnation; the member and the device key; the reads of the member's role at issue; an end time. |
| Which clock | Two. Membership's clock writes the end time, 600 seconds after its reading at issue. Each reading scope compares that time with its own clock, at every read and before every send on a stream. |
| How it is verified | HMAC-SHA-256 under the deployment's session secret, over the exact claim bytes, in constant time, before the claims are parsed. Then the deployment's name. Then the membership reference: only for the membership scope that the scope itself records. Then the clock, the end time and the read's name. No call is made. |
| A revoked key, a removed member | Nothing is checked at a read. A session already issued is accepted until its end: at most 600 seconds on membership's clock, plus the difference between the two clocks (assumption H6). No new session is issued to that key. A changed role takes effect at the next session. |
| A reader with no session | `forbidden` from every read, and no stream. |
| No secret bound, or one shorter than 32 bytes | No session is issued and none is accepted: `sessions-unavailable`. A reader that presents no session is still `forbidden`. This is the deployed default: no file binds a secret. |
| A replaced secret | Every session ends at once. |

No entry that an earlier source wrote has other bytes, and neither lane
digest changes: no file of `packages/lanes`, `packages/derive` or
`packages/platform` is touched. Three types of the contract package gain
members, and one file is new there: entries ES1 to ES3.

Witnesses: `packages/scope/test/sessions.test.ts` (T15, T42),
`limits.test.ts` (T39), `operator.test.ts` and T19 of
`operations.test.ts` (T41). The test secret is generated in each test and
is in memory only.

| # | Where the texts differ or are silent | Implemented | Owner, and the question |
|---|---|---|---|
| ES1 | Section 3.9 says what a token names and that it "is authenticated with a deployment secret". Section 5.3 says it is presented "in a request header". No text states the token's bytes, the function that authenticates it, the header, or how a deployment names itself and binds the secret. | Claims of exactly seven members, as canonical JSON. HMAC-SHA-256 over the tag `artroom-session-1`, a newline and those bytes. The token is `ars1.`, the claim bytes and the MAC, each in base64url. It is presented as `Authorization: Session <token>`. The secret is the binding `SESSION_SECRET`, a text whose UTF-8 bytes are the key: the 32 bytes of section 5.5 are counted on those. The name is the binding `DEPLOYMENT`. `packages/contract/src/session.ts` and `packages/bytes/src/session.ts` are new, and `hmacSha256` is added to `packages/bytes/src/hash.ts`, from the hash library that the package already has. | The authority note, sections 3.9 and 5.5, to state the form or confirm this one. N5, for the names of the two bindings and how an operator sets them. |
| ES2 | "A device asks membership for a read session with a signed request." No form is stated. Section 4.2 gives one form for a signed direct request, to a task scope or a lane. The contract's section 8.2, row 24, keeps "Request nonce unseen", local and with a time bound, for a scope that takes signed requests. | `SessionRequest`: `v`, `to` (the membership scope with its incarnation), `actor`, `action: "read-session"`, `operation` and `notAfter`: the members of a direct request, less a resource and a body, which a session request has none of. It is signed over the tag `artroom-session-request-1`, which is no tag of an intent. `notAfter` is at most 900 seconds ahead (W8). A request is answered with a session once: membership notes the key and the operation identity in a table of its object, outside the history, until `notAfter`, and only after every other check passed. One key holds at most 64 such rows. A request that was captured and never answered is still good until its `notAfter`. | The authority note, section 3.9: the form, whether a request is single use, and the bound on `notAfter`. |
| ES3 | Section 5.5 names `sessions-unavailable` and section 3.9 names `clock-behind` as answers to a session read. Section 3.6 names `rate-limited` as a serving answer. `ReadRefusal` and `UnavailableReason` have none of the three. No text names the refusals of a session request, but "refused for a revoked key". | `ReadRefusal` gains `sessions-unavailable` and `clock-behind`. `UnavailableReason` gains `rate-limited`. The tables of `packages/bytes/src/records.ts` and `packages/client/src/answers.ts` follow. A session request is refused with `SessionRefusal`: `sessions-unavailable`, `bad-request`, `not-found`, `misaddressed`, `clock-behind`, `expired`, `unauthorized`, `replayed`, `rate-limited`. Where an act has the same check the name is the act's. | The contract, to accept the three members. The authority note, for the names of a session request's refusals. |
| ES4 | A token names "what may be read, which is this repository's scopes that the member's role may read". The table of section 3.2 gives each role its actions, and no text says which scope or which read a role may or may not read. Section 12 gives the admin page to "a member whose role holds `membership.*`". | Every session is given the eight reads of the contract's section 9.1 and of entry EB9, in every scope of its repository. A session of a role that holds both `membership.invite` and `membership.manage` is also given `incidents` and `waiting`. The reads are fixed at issue, from the role's actions at membership's head: a changed role is seen at the next session. A scope that records no membership reference accepts no session: the register; and the rules scope and the destination, until the step that gives each its reference (the "I3 merge" note in `authority.ts`). | The authority note: a role's reads, if any role is to read less. IA, for what a session reads of a task scope: the minimal projection of section 5.9. |
| ES5 | Section 3.9 refuses a new session "for a revoked key". It does not speak of a removed member, of a key that membership does not hold, or of an agent whose controller is not active. | None of the four is issued a session: `unauthorized`. For an agent this is narrower than the text states. A checker's key is issued one like any member's. | The authority note, to confirm the agent's row or to remove it. |
| ES6 | Section 3.9 does not order the checks of a session, name the answer for a session that has ended, or bound an end time that is far ahead of the reading scope's clock. | The order is at the head of `sessions.ts`. `clock-behind` is answered only to an authentic session of this repository. A session that has ended, a forged one and one of another repository are all `forbidden`. At the bound a session has ended (G14). A reading scope accepts any end time that its clock has not reached: the 600 seconds are membership's to write, and the difference between two clocks is assumption H6. | The authority note, to confirm. The platform document, for H6. |
| ES7 | Section 3.9 speaks of "a stream" and of "every send on a stream". No text says what a public stream sends, how it is framed, or what its route is. W6 says "No timer: the comparison is made at each read." The proof plan's row "Authority ends" says "The stream ends at the stated bound." | `GET /v1/scopes/:scope/stream`: lines of JSON, `{ at }`, the scope's head when the stream opens and after each commit. A session that may read the summary may open one. The session is checked before every send. By W6 there is no timer: a stream whose session has ended is sent nothing more, and is closed, with no byte, when its next send is due or when another stream is opened. A clock that is behind closes it too. **Observed in the workerd pool:** a cancel of a body that crossed from the scope's object to the Worker's route is not passed back to the object (30 calls later the subscription was still held), and an eviction of an object waits on its open stream. So the route owns the reader's side (`relay`): its body's cancel calls the object's `release`, with the stream's own ID, and T15 shows a restart by an abort. | The proof plan, key O12: whether a client's disconnect on the real platform runs the route's cancel for long enough to make the release call. It is not shown: no deployment was made. A release that never comes leaves a subscription until its session's check fails. I5, for the client's side and the content that a page needs. |
| ES8 | No text bounds the streams of a scope, the rows of the operator's record, or the session requests that one key may have outstanding. | 64 streams for one scope, and a further one is answered `unavailable`. 1,024 rows of one scope's record, of which the oldest are dropped. 64 noted requests for one key. Each is a constant in source. | The proof plan, for each number. |
| ES9 | The contract's `ScopeApi` has no operation for a session, a stream, the operator's record or the two lists. `packages/scope/test/conformance.types.ts` holds the service entrypoint to exactly that interface. | The four are HTTP routes, and methods of the scope's object. The service entrypoint has none of them, so a caller over the service binding asks for a session over HTTP and presents it as its reader. The client's `requestSession` is over HTTP only. | The contract, section 9.1: whether `ScopeApi` gains these. I5, for a client in another Worker. |
| ES10 | Section 3.6 proposes three limits "with no number", and leaves the window, the two bounds and the key of an IPv6 address to I3. It says that checks 1 and 2 "are made before the request reaches a scope", and that each fails `bad-intent`. An act's refusal carries `judgedAt`, the scope's head. | `PROPOSED_LIMITS`: a window of 60 seconds, 10 failures for one address, 4,096 windows, 8 waiting joins, and 16 KiB for a join's signed intent. An IPv6 address is keyed by its first 64 bits. The limits are at the front of the membership scope's object, before the scope's core: the object has the head that the answer needs, and no state of the scope is read for a request that fails check 1 or 2. A join is an act of kind `join` or `enrol` at a scope of kind `membership`. The 32 bytes of an invitation's secret are checked there: the definition's field has a most of 256 bytes and no least. The fixture's secret in `packages/scope/test/repository.ts` is lengthened to pass it. | The proof plan, for the numbers. The authority note: whether the definition's field should state the least, so that a replay can see it. |
| ES11 | Section 3.6 keys the limit by "client address". No text says where a service learns it. | The header `CF-Connecting-IP` of the request, as the serving platform sets it. A caller over the service binding has no address, and nothing is counted for it. That no caller can set the header is the platform's property and is not shown here: where a caller can set it, a caller escapes its own limit and can spend another address's window. | N5: the header of each platform that a deployment may run on. |
| ES12 | Section 12, G13, lists what an incident is and says it is written "by the runtime that found it". It does not say where the operator's record is stored, or how one deployment's record is read as a whole. | One table in the storage of each scope's object, with a mark beside it, outside the history. A row is a kind from a fixed list and references of fixed forms, so it can hold no credential and no text. Two kinds are found now: `outcome-conflict`, told by the operations driver, with no entry; and `incarnation-conflict`, read from the entry of a creation's result that ran `conflict`. The other kinds of G13 are named and nothing finds them yet: a ref that holds another value, a branch that another writer moved and a token that no ledger owns are the destination's (steps 9e and 9f, entries ER5 to ER9); a `pin-confirm` with no pin and an `unpin` for a pin released as `never-admitted` are refusals of `hold@1` that no code reports as incidents; and no component reports a `bad-input`. There is no read of all scopes at once: the operator's page reads scope by scope. | I3, steps 9e, 9f and the hold's handlers, to call `OperatorRecord.found`. N5 and I5, for the operator's page and who an operator is. |
| ES13 | G17 lists two cases "by the sending scope's own bounded read of its sends", and says an operator's instruction "names one such duty by its entry and ordinal". It does not say how an operator is authenticated, or whether the instruction is for both lists. | `waiting`: one call passes over one page of the outbox and answers the rows of that page that are in the list, which may be none, with a cursor. A request that transport acknowledged is listed until its result is recorded, however recent: nothing is judged by age. `resend` takes a duty ID of either list, dispatches the same envelope once, adds the attempt to that send's log, records an acknowledgment as the dispatcher does, and writes one row of the record before the envelope leaves. It writes no entry. It has no route: it is a method of the object, reached over the namespace binding. | N5: the operator's authentication and the route or tool for the instruction. The proof plan, for any automatic policy. |
| ES14 | Section 5.3 refuses "a read-session token or an invitation's secret in its URL's path or query". An invitation's secret has no form to know it by. | A URL is refused `credential-in-url` when its path or a query value holds a token's form, or a query parameter is named `session`, `token`, `secret`, `authorization` or `access_token`. The routes read a secret from a body only, so one in a URL is never used, and is not always refused. | The authority note, to accept the limit or to give the secret a form. |
| ES15 | Plan rows T39 and T41. | Two parts are shown at a narrower boundary than a real scope. `busy` is shown with a stand-in for membership's judgment that a test can hold: nothing in a real membership scope's turn can be held. An incident that writes an entry is shown on an entry made by hand: a second incarnation for one seed cannot be made in one namespace. | The proof plan, if either needs a real boundary. |
| ES16 | Not a difference of the texts. `ScopeObject.wiring` is a method of the object's class, so a holder of the namespace binding can call it, and what it returns names the source of the session configuration. | Nothing. Such a holder is the deployment's own Worker, which holds the secret binding itself. It was not tested. | The builder: whether the wiring should move out of reach of a call, as a hardening. |

**What was not run.** No deployment, no provider and no real platform
clock. The two clocks of a session are one scripted clock in the tests:
they show each scope's comparison, and nothing about the difference
between two real clocks.

## 22. The source rows I3-31 to I3-38 of the contract's revision 19, and membership under its own rules

Written 2026-10-05, by the worker of those rows. Entries have the prefix
EX. The authority note is at revision 24 (`d5616522b`), which is adopted.
The scope contract is at revision 19 (`1ca8a59bf`), which the checker has
approved and the planner has **not yet adopted**. This source builds what
revision 19 states, so that it can be filed after the adoption with
whatever the adoption changes. Until then nothing of revision 19 is in
force, and this work is not filed. The parts that rest on the adopted
revision 24 alone are the three rules of membership, the register's guard
and the answer to EM16. Everything else here rests on revision 19.

**Added on 2026-10-05, later.** The planner has adopted the scope
contract's revision 19 at `1ca8a59bf6b88f6f38b18b2fe36ae5d2cd2afb7e`
(request `6e6ef421`). It replaces revision 18 as the contract in force. The
paragraph above was true when it was written. This work was built before
that adoption and is filed after it, with the second milestone of I3. The
adoption is of the design, and accepts no source.

No entry that an earlier source wrote has other bytes. Neither lane digest
changes: `packages/lanes/test/definitions.test.ts` shows both pinned
definitions with the same bytes, digest, reservations and static sizes at
a list bound of 32 and of 64. The data of `platform:membership@1`,
`platform:register@1` and `platform:directory@1` changes. A platform
definition is pinned by name and version and no file pins a digest of it,
and no scope under any of the three was written by a deployed source.

**What is built, by row.**

| Row | Built | Witness |
|---|---|---|
| I3-31 | `listElements` is 64: the most that the `max` of a list type may state. Each count reads the type's `max` or the bound. | `derive/test/validate.test.ts` (18.44, cases 1 to 3); `lanes/test/definitions.test.ts` (case 7) |
| The authority note's rows o to r | `role-table`, `member-of` and `handle-form` are rules of `platform/src/membership.ts`, and the register has `handle-form` on `founderHandle`. The five lists hold 64. No stand-in rule of membership is left: `platform:membership@1` runs on the package's rules. | `platform/test/rules.test.ts`, `definitions.test.ts`, `register.test.ts`; `scope/test/membership.test.ts`, on real scopes under the production wiring |
| I3-34 | A send mark may state `always`. A list holds several marks when at most one does not state it. The judge finds each form by counting. A rule with `always` that gives none has a fault. The directory's genesis holds the marks `create-rules` and `create-destination`. | `derive/test/forms-marks.test.ts` (18.45, cases 1 to 5); `platform/test/directory.test.ts` |
| I3-32 | A field of type `digest` of an act may state `value: { domain, max }`, in platform data. The judge matches the value by those members at check 7, and a rule reads it by its field. | `derive/test/forms-marks.test.ts` (18.45, cases 6 and 7) |
| I3-33 | The retained kind `value` with its member `domain`, in the contract and in the guard of `bytes`. A replay reads each value that a place names, and is `incomplete` without the bytes. **The store, and the scope's read of `values` before the turn, are not built: entry EX6.** | `replay/test/verify.test.ts` (18.45, case 8), in memory |
| I3-35 | The rule that decides a further attempt is given what every rule is given. The owners' rules of a capability are given the state and the outcome as well. | `derive/test/forms-marks.test.ts` |
| I3-36 | Not built, as the row says: it waits on the authority note's rows. | None |
| I3-37 | Nothing to build. Each confirmed entry was read against the source: entry EX9. | None |
| I3-38 | A request of a rule whose message has more fields than the bound on the fields of one send is a fault. | `derive/test/forms-marks.test.ts` |

**Earlier entries that this work answers.** Each line is dated 2026-10-05.
The earlier sections stay as they were written.

- **EM6, closed.** The note's revision 24 keeps all 34 names and makes the lists 64. `role-table` is a rule of the package, with the five lists of its section 3.2, "The table, counted". The stand-in list of 30 is deleted.
- **EM7, closed.** `member-of` is a rule of the package, at place 5, under the row P26.
- **EM8, closed.** `handle-form` is a rule of the package, at place 4, under the row P27, refused `bad-field` and named `bad-handle`. The register has the same rule on `founderHandle`.
- **EM10, closed.** The note's revision 24 confirms the selection as built. Nothing changed.
- **EM16, closed for the answer.** A join on a `lapsed` invitation is answered `invitation-expired`. The written guards are the source's, until the note states them: entry EX3.
- **EJ4, updated.** A list may hold several marks when at most one does not state `always` (the contract's revision 19, decision D19-7). The rule that every written send of such a list is always made exactly once stands.
- **EP6, updated.** Decided by the contract's revision 19: several marks, and no operand for a sibling's scope ID. The directory's genesis holds both marks, and the creation of the rules scope carries `membership`. The two rules are still not written: entry EX4.
- **EM1, updated.** The form is built: `value: { domain, max }` on the field. No platform data of this package states it yet, so the three rules that read a value still hold the domain and the bound in their code: entry EX5.
- **EM4, updated.** The kind is built, and a replay without the bytes is `incomplete` for a value that a place names. No store keeps one yet: entry EX6.
- **EM3, unchanged.** The scope still reads no `values` beside an intent: entry EX6.
- **ER5, closed for its question to the contract, which is its part 3.** A retry rule is given the state. Parts 1, 2 and 4 of the entry are the authority note's, and stay open.

| # | Where the texts differ or are silent | Implemented | Owner, and the question |
|---|---|---|---|
| EX1 | The contract's revision 19, section 15.3f, says of each of the three marks what it "states": `most: { effects: 5 }`, `most: { effects: 1 }` and `refusals: ["bad-handle"]`. That is the form of row I3-21, which this base does not have: here a mark is `{ code, row }`, and the rule table states `most` and `refusals` (entry EJ8). | The three marks are `{ code, row }`, with the rows P10, P26 and P27. Each rule states its `most` or its `refusals`, as every rule of this base does. | The I3 delivery, with row I3-21: the three marks gain the members when that row is built. |
| EX2 | Row p says that `member-of` has no refusal: "A text that is no handle was refused before". It does not say what the rule does when it is given one all the same. A membership scope's `seat` reads the founding handle that its creator sent, and only the register's rule checked that one. | A fault of the rule: the input is not judged, and nothing is written. So no member is opened with an ID that is no handle. A membership scope whose creator sent a founding handle that is no handle can never seat its founder. | The authority note. Is a fault right there, or does `establish` check the founding handle? |
| EX3 | Revision 24 answers EM16 for the name, and says "The written guard that says it is owed: this note's next revision." So no text states the guards. | Three guards on the invitation, in this order: its state is `invited` or `lapsed`, or `invitation-used`; the commit is before `inviteEnds`, or `invitation-expired`; its state is `invited`, or `invitation-expired`. So an invitation that was used is `invitation-used` also after its end time, and one that ended unused is `invitation-expired`. An invitation of a member that was later removed is `invitation-used`. The same three stand in `enrol`. | The authority note's next revision, to state the guards or to take these. |
| EX4 | The contract's revision 19 states the form for two send marks in a genesis, and says that "the specification of the rule states the derivation" of a sibling's scope ID. The authority note's table of marks lists no rule for either send, and the contract's section 15.8 lists "`always` on the send marks of a genesis that creates its siblings, and how each rule derives a sibling's scope ID" as owed by that note. The name `create-rules` is in the contract's witness 18.45 only, on made-up data. | The directory's genesis holds a written `create` of membership, and the marks `create-rules` and `create-destination`, both with `always: true` and with the row `EP6`. The package has no rule for either, so `platform:directory@1` is still not runnable: three marks lack rules. The stand-ins of test support give each request, with a sibling's scope ID as the digest of the seed of creation 0 or 1. With them the real rules scope's genesis is written and records the ID. | The authority note's next revision: the two rows, with their names, `always`, and the derivation. |
| EX5 | The contract's section 6.2 says "Which fields state the member is the specification's", and its section 15.8 lists those rows as owed by the authority note. "A place that requires a value and has none at hand is refused `bad-field`": it does not say which places require one. No text bounds `max`, but for a definition. | No data of the platform package states `value`. `keep-configuration`, `activate` and `definition-active` read a value by the stand-in reader `value(domain, digest, most)`, which stays, labelled. The new reader is `placed(field)`. Every place whose field the intent sets requires its value: with none at hand the act is refused `bad-field` at check 7, before any rule. The entry's draft names the value of each place, whether a rule read it or not. The validator takes the member on a field of an act only, of type `digest`, with a domain that is not empty and a `max` of at least 1, one `max` for one domain, and no `default`. It checks `max` against no bound. A value in `artroom-definition-1` is read as the kind `definition` in a replay. The closure of such a definition is not read as places. | The authority note, for the fields. The contract, to confirm "requires", and whether a place may have a default. R4, for a bound on `max`. |
| EX6 | Row I3-33: "A scope keeps each value that an entry names." Row I3-32: "The scope bounds what it reads before the turn by those members." Section 9.2: "A read of one value asks by the kind, the domain and the digest." | **Not built.** `scope/src/core.ts` reads no `values` beside an intent and gives the judge none. No store keeps a value: `retained_input` is keyed by kind and digest, and a value needs its domain. No route reads one value, and the replay's HTTP source answers a read of the kind `value` as not found, so a replay over HTTP of an entry that names a value is `incomplete`. The reason it was left: no data of the package states a place, so no real scope could show the store or the read, and code with no witness was not added. The static size of an entry form does not count a place at its `max` either (section 17.2). EM2 is not needed for any of it. | The I3 delivery, when the authority note's rows state the fields: the read before the turn, a table for values, the read route with the domain, and the HTTP source. The capacity work `cc570904`, for the count. |
| EX7 | Revision 19 says that the configured bound is the most that a list type's `max` may state, and that the `kind` list of a `fact` type holds at most the bound. The source reads the same configured value in two more places: a list of names in a form, such as the states of a guard, and the states of a `copy`. | All four read `listElements`, which is 64. No pinned row is near either number. | The contract's next revision: whether those two lists are this row's, or have a bound of their own. |
| EX8 | Row I3-35 gives the retry rule "what every rule is given". The owners' rules of a capability are no platform rule, and `retries` of `hold@1` is the same member of the ledger's interface. | A platform rule's `retries` takes the six things as its third argument. The ledger's `retries` takes the state and the outcome as its third and fourth. No rule that exists reads either: each still answers a constant. So the destination's `abort-if-behind` (entry ER5, part 3) can now be written, and is not. | None for the form. The authority note, for the rule. |
| EX9 | Row I3-37 lists 15 entries as built, by the word of this note, and says that no file was read for them. | Each was read against the source at this head, by a second reader, and six were read again by the worker (EN2, EN3, EN4, EN6, EL1 and EL2, with EL7 and EQ1 in the course of the work). No test was run for the check. 14 are as the contract confirms them. EP5 is confirmed in two parts and not traced in the third: no field type holds a signed intent, and the directory's data declares no field `founding`; that a `create` which carries one is refused was not traced. Two things were seen beside the rows, and neither contradicts one. For EM17: a `create` that a rule of a send mark returns is sent as the rule built it, so the platform adds `membership` to a written `create` only, and a creation that a genesis sends holds none (the contract leaves that one to the builder). For EN8: in a clause, any effect of a rule that a check would refuse leaves the clause with no effect, and the result is recorded; the opening past `max` is one case of that. | The builder, for the two observations: whether a `create` from a send mark's rule should be given `membership` by the judge, as a written one is. |
| EX10 | The note's section 12.1.8 leaves one check to I3: whether the validator takes a constant list, so that the role table could be data. | Checked, for the validator only: membership's data with the mark replaced by five written `value` effects, each from a constant list, validates (`platform/test/definitions.test.ts`). No entry was derived from that data. The row stays a rule. | The authority note: whether to write the table as data. |

**Lines for the merge.**

- `RuleGiven` has one more member, `placed(field)`. A test that builds a `RuleGiven` by hand needs `placed: () => undefined`.
- `OutcomeRule.retries` and `OperationRules.retries` take more arguments. A rule that ignores them is unchanged. A test that calls one with two arguments needs a third.
- `HistorySource.retained` takes an optional fifth argument, `domain`.
- `packages/platform/src/rules-scope.ts` is not touched. When the authority note states which of its fields name a value, its three reads become `placed(field)`, and the data states `value` on those fields.
- `@generalbusiness/artroom-platform/testing` no longer exports `standIns`, `withStandIns`, `TASK_ACTIONS` or `isHandle`. It exports `lacking`, a control. The platform package exports `isHandle` and `FIRST_ACTIONS`.
- `platformNet.standIns` of the scope package's test Worker is gone. `platformNet.without` names one rule of membership to leave out.

**What was not run.** No deployment and no provider. No real scope holds
data with a value place or with two send marks under the package's own
rules: both are shown by derive's judges on made-up data, and the
directory's two marks by stand-in rules. The gate was not run.

## 23. Request `42de9e34`: extents

Written 2026-10-05, by the worker of that request. Entries have the
prefix EV. The design is the authority note's revision 24 at `d5616522b`,
section 12.1.4a, with the scope contract's revision 18 at `be90ff05`.
Later revisions were not used: the contract's revision 19, which states
`RulesContent.singleControllerException`, is under review and nothing
here builds on it. Three later answers of the planner were given to the
worker by the builder, and are applied as they were given: on when the
exception may be declared (entry EV11), on the grant of an effect class
(entry EV9) and on symbolic links (entry EV7). Neither lane digest
changes, no file under `packages/lanes` changes, and no entry that an
earlier source wrote has other bytes. `platform:rules@1` is not changed:
its data, its three marks and its digest are as section 17 left them.

**What is built.** `packages/platform/src/extents.ts`: judgments over
data, and nothing else.

- `Extent`, member for member as the note lists it, and `firstExtents`:
  the three extents of the first definition, from a repository's
  `approvals` and `checks`.
- `holdsRulesExtent`: the fixed minimum of the `rules` extent.
- `matches`, a pattern against a path, and `classify`: the extents that a
  changed set touches under one rules content, with the planner's decision
  on symbolic links.
- `judgeExtents`: which touched extents are met, from the reviews, the
  passed checks, the authors, the landing actor and the controllers as
  they are given, with the rule of the `rules` extent and its one
  exception.

**What is not built.** The note says that the rows of the rules scope
change only when its missing forms 1 to 3 exist, and that until then I3
builds the rules scope with one bar for a repository. So:

- No rules content holds an extent. `publish` has no field for one, the
  item `rules` has no slot, and no observation of the rules returns one.
- Nothing calls these functions. The destination's reservation, which
  will, is the plan's steps 22 and 26.
- No changed set is computed. `classify` is given the paths and the links.
- No activation records what it checked, beyond what `activate` already
  retains: entry EV16.

The note lists 14 missing forms. Three are answered by the planner (5, 6
and 7). Eleven are owed, and each is an entry here: EV1 to EV11.

Witnesses: `packages/platform/test/extents.test.ts`, six tests. They are
judgments over data written by hand. A member's actions are those of the
role table of section 3.2. No scope ran, and nothing is shown about a
reservation, a read of a repository or a replay.

| # | Where the texts differ or are silent | Implemented | Owner, and the question |
|---|---|---|---|
| EV1 | The missing form 1: the typed body of the evidence of `judge`, with the touched extents and a path for each, and the bound on the trees that one changed set may read. | Not built. `classify` is given the changed paths, and answers the touched extents in the order of the rules, each with the first changed path in byte order that shows it. That is a function's result and no form of an entry. No source computes a changed set: `packages/git/src/reader.ts` parses a commit and a tree, and no source compares two trees. | The authority note's next revision, with the proof plan for the bound and IA for the reader. |
| EV2 | The missing form 2: the value `extents` of the item `rules`, the field of `publish`, and `extents` in a `RulesContent` that was asked as "rules". | Not built. `Extent` is a type in source, and `firstExtents` is a function. The bounds of the listing (8 extents, a name of 64 bytes that is unique, 32 patterns of 256 bytes) are those of a typed field, and nothing checks them here but the constant `EXTENTS_MOST`, which nothing reads. `judgeExtents` takes the extents as an input. | The authority note, for the rows. The contract, for the type and for the size of `content` (its point R1-61). |
| EV3 | The missing form 3: the mark of `publish` for the fixed minimum, and the part of the rule `judge` that checks each extent. | The two judgments exist as functions: `holdsRulesExtent` and `judgeExtents`. No mark names either, no rule of a version runs either, and `publish` is not refused `rules-extent-required`. | The authority note, in its table of marks, when the rows change. |
| EV4 | The missing form 4: the `change` lane cannot read an obligation of an extent. | Not built, and not this request's: no file under `packages/lanes` changes. | R2, in the lane forms' successor (the request `fdc3d7e2`). |
| EV5 | The missing form 8: a path that differs only by a Unicode form. | A pattern folds the 26 ASCII letters and nothing else, as the note states. | The proof plan, with IA. |
| EV6 | The missing form 9: whether the controller of the rules scope is a role of its own. | The controller is a member who holds `rules.publish` (`CONTROLLER`). | N5. |
| EV7 | The missing form 10, a symbolic link. The note says "its target is not followed". The planner's later decision, as the builder gave it: a path's extent is judged by the path and every path that a link at it resolves to within the tree; a target change is a change in every extent that the old and the new target fall in; a link that resolves outside the tree, or cannot be resolved, is refused as a rules-extent change. The decision does not say who resolves a link, in which trees, or what a change to a link's target file is. | `classify` is given the links of the trees as rows of a path and the paths that it resolves to, or null. The caller resolves them, and that caller is not built. Four readings are the worker's. (a) The other direction: a changed path that a link resolves to, or that is below it, is also judged at the link's path with the rest. So a change to the file that `AGENTS.md` links to touches `rules`. The decision does not state it, and without it the note's own example of form 10 stays open. (b) "Refused" is read as not met, with `rules` named, whatever the reviews, and the class `authority`. (c) That holds for a link of any tree that was given, so a change that removes such a link is refused too, and a repository that already holds one cannot change that path. (d) Links below links are followed for as many passes as there are links, and a change that still gives new paths is refused. Not closed: where a link resolves to a directory, the paths below that directory which the change does not touch are not judged at the link, because no tree is read here. | The planner, with IA: to confirm (a) and (b), and to say how a repository removes a link that leaves the tree (c). The authority note, for the form of the links in the evidence, with form 1. |
| EV8 | The missing form 11: an observation that says how many active members with an active key hold one action. | Not built. `judgeExtents` takes `controllers`, the members, or null. With null no exception is judged. | The authority note's next revision, with the contract for the form of the observation. |
| EV9 | The missing form 12: a destination for an effect that is not a branch, with a grant on it, an entry for the effect and a witness of a preview. And the planner's later answer, as the builder gave it: a grant for an effect class is a grant that covers the one destination, which a repository-wide grant satisfies until a grant can name a destination. | For a touched extent of the class `deployment` or `authority`, `judgeExtents` asks that the landing actor holds `change.merge` (`LANDING`), as the second row of the note's table has it. The declared destination, the witness of a preview and the replayable entry are records of the destination itself, and nothing here judges them. No effect beyond the branch is modelled. | The planner, with N5 and IA. |
| EV10 | The missing form 13: an act of membership that gives one action to one member. | Not built. A reviewer is given with the actions that the member holds, and an extent's `approver` is one of them. No extent names a member. | The authority note's next revision, with its section 3.4. |
| EV11 | The missing form 14: the declaration of the single-controller exception. And the planner's later answer, as the builder gave it: it may be declared while more than one controller exists, and takes effect only while membership shows exactly one controller who is the author. | Not built as a value. `judgeExtents` takes `singleControllerException`, a boolean. Nothing sets it, and nothing here refuses a declaration. The three conditions are judged as the note states them. | The authority note's next revision, for the rows. The contract, for the type of `RulesContent`. |
| EV12 | "The first definition": "the numbers are examples". The `rules` row says "at least 1". The rows of `rules` and `infrastructure` give the checks as "those that the repository names", and the patterns as these "and what a repository adds". | `rules` asks 1 approval. `rules` and `infrastructure` name no check. No pattern is added. `infrastructure` and `source` take the repository's `approvals`, and `source` names the checks that the rules mark `required`. | The proof plan, for each number. |
| EV13 | "A pattern". The note does not say what `**` means inside a name, as in `a**b`, or what an empty name of a pattern matches. A path is "as bytes", and the functions take strings. | `**` matches any number of names only when it is a whole name of the pattern. In any other name each `*` matches any bytes of one name. An empty name matches an empty name alone. The match is by the code units of two strings, which is the match by bytes for well-formed text. A path whose bytes are no text has no string: the caller must refuse it, and that caller is not built. | The authority note, to state the two cases. IA, for a path that is no text, with form 1. |
| EV14 | "One extent, `source`, has no pattern: it holds every changed path that no other extent matches." The note does not say whether that is by the name or by the empty list, what holds when a repository's rules have no such extent, or what holds when they have two. Plan 016 proposes that an unclassified resource blocks. | By the empty list: every extent with no pattern holds each judged path that no pattern of the rules matches. With no such extent that path is unclassified, and the change is not met. `unmet` names no extent for it. | The authority note. Whether `publish` must refuse rules with no such extent, and the reason that a publication then gives. |
| EV15 | The rule of the `rules` extent, in its details. | The extent is known by its name, `rules` (`RULES_EXTENT`). A review counts for it only from a member who holds its `approver` and `rules.publish`: the fixed minimum makes them one. The exception is used only where the counted reviews do not meet the extent. It stands for the reviews alone: the extent's own checks are still asked ("its checks", in the note's list of what stands). The answer names the one controller. The record of the landing, with the two heads, the revision and the words "single-controller", is the destination's and is not built. A refused path makes `rules` unmet also where the rules name no extent `rules`. | The authority note, to confirm that the checks of the `rules` extent stand under the exception. |
| EV16 | Condition (4) of the request: "Activation of a rules definition records what it checked, as the proof plan's O9 row asks". The note says of O9 that it "is accepted as R4's catalogue states it, for the rules definition that is still owed" (its section 13). No text states a form for the record of an activation's checks. Plan 016 asks that an activation "retain what was checked and the observed head". | Nothing new. What exists is section 17's: the entry of `activate` retains each value that its guard read, which is the definition's bytes and those of its named closure, each under its digest (`packages/platform/test/rules-scope.test.ts`, the cases of `activate`). The grant's observation is retained by the scope as for any act. No record names a check of an extent, or a judgment of the definition against the extents. | The proof plan, for what O9 asks an activation to record. The authority note, with the contract, for its form. |
| EV17 | `packages/platform/src/rules-scope.ts` was built against the authority note's revision 21 and the contract's revision 16. Revisions 24 and 18 are adopted. | Compared, by a diff of the two texts of each: section 12.1.4, section 3.10 and the rows 27 to 29 of the table of marks are the same in revisions 21 and 24, and the type `RulesContent` is the same in revisions 16 and 18. Revision 24 adds section 12.1.4a, which changes no row. So `rules-scope.ts` is not changed, and its header still names revision 21. No other section was compared. | The builder: whether the header's revision is to be updated at the merge. |

**Added on 2026-10-05: EV7, parts (a) and (c), are decided.** The planner
decided both, by an assertion of that date that rests on request
`42de9e34`, as the builder gave it to the worker. The table above is as it
was written.

- **EV7 (a), confirmed as built.** A change to a file is judged at its own
  path and at the path of every link in the tree that resolves to it,
  through links below links. No source changed for it.
- **EV7 (c), changed.** Only two things are refused: creating a link that
  leaves the tree or cannot be resolved, and giving a link a target that
  does. Removing such a link is allowed, and is judged as a change in the
  `rules` extent and in the extents of the link's own path. Replacing it
  with a regular file or with a link inside the tree is allowed, and is
  judged in the `rules` extent, in the extents of the path and, for a link,
  in those of the new target. A tree that already holds such a link blocks
  no other change: the link is never followed.
- **What changed in source.** `classify` could not tell a link of the old
  tree from one of the new. `TreeLink` gains the member `tree`: `old`,
  `new` or `both`. The caller states it, and that caller is still not
  built. `classify` stays a pure function.
- **Two readings are the worker's.** A removal and a replacement with a
  regular file give `classify` the same rows, one `old` row, so it judges
  them alike. Rules that name no extent `rules` hold no such removal: the
  path is unclassified, and the change is not met.
- **Witness and controls.** `packages/platform/test/extents.test.ts`, the
  test "a link that leaves the tree is refused only where the change
  creates it", with one case for each of create, retarget to outside,
  remove, replace with a file, replace with a link inside the tree, and an
  unrelated change. Three controls by `scripts/control.mjs`, and each
  distinguishes: the refusal for a link of either tree, the `rules` extent
  not shown for a removal, and the path not unclassified where no extent
  `rules` exists. The unrelated change was not blocked before this change
  either, so no control distinguishes that case.
- **Still open.** Reading (b), that "refused" is not met with `rules`
  named and the class `authority`, was not part of this decision. Who
  resolves a link, and in which form the evidence carries the rows, stay
  with entry EV1.

## 24. Step 24: the step `job-read`, the read token and the snapshot

Written 2026-10-05, on `request/i3-checkers`. "The authority note" is
revision 24 at `d5616522b`, and "the contract" is revision 18 at
`be90ff05`: both adopted. The source under this step was built against
revisions 21 and 16. For this step the two pairs do not differ: sections
3.11, 5.1, 5.3, 5.5, 5.7 and 6.3 of the note, and sections 4.3, 5.5 and
6.11 of the contract, have the same text in both (compared by `diff`,
section by section).

The step adds the code of `job-read` to `git-read@1`
(`packages/derive/src/capability/gitread.ts`), one record to that
capability's table (`packages/contract/src/capability.ts`), the second
owner to the token driver (`packages/git/src/host.ts`), and the files and
the commit of a snapshot (`packages/git/src/snapshot.ts`). The review of
the three parked snapshot files is
`notes/2026-10-05-i3-snapshot-review.md`. No lane definition changes, and
neither pinned digest moves. An entry changes its bytes only where a scope
seals a `job-read` preparation, which no scope did before.

| # | Where the texts differ or are silent | Implemented | Owner, and the question |
|---|---|---|---|
| EW1 | The form of the intent that asks for `job-read`. Section 5.7, "The steps with no act", gives the intents of `instance`, `token` and `retire`, and says: "The step `job-read` is step 24's, and its form is not stated here." Sections 3.11 and 5.7 say only that it "names the job's fact". | In the form of that table: `kind` is `git-read@1:job-read`, `to` is the change lane, `on` is null, `expected` is empty, and `fields` is exactly `job`, the fact of the `request-check` entry. Anything else is `bad-field`. The grant is `change.check`, on an observation that serves the one commit (section 3.3, the table of entries). | The authority note, to state the row or to change it. |
| EW2 | By which names the step finds the job and the lane's copy of the rules. The note says "the job is `requested`" and "the checker that the lane's copy of the rules names for that check". A capability's code is given the state and the definition, and no row passes it an item. | Version 1 reads them by the names of the `change` lane's forms, as the guard `ancestry` reads a selected input by `selected` and `for` (entry EH8): an item of the type `job` that the fact's entry opened, its state `requested`, its values `name` and `deadline`; and the one item of the type `rules`, whose value `checks` is a list of records with a `name` and a `checker`. A definition without them has no job that the step can read. A copy that names the check twice names no checker. | The authority note, with R2 for the lane's names. |
| EW3 | "For a filtered check, the snapshot repository's record and its creation, with at most 3 attempts." No adopted text says which check is filtered: a configuration has the members `name`, `image`, `environment`, `steps`, `judged` and `limits`, and none is a filter. The record has no name, no key and no states (entry E4). No text gives the name of the repository, the ref that holds the snapshot, the message of its commit, or what a job's `tree` is for a filtered check. | **Not built.** The step derives no snapshot repository, for any job, and every check reads the canonical repository with its read token. `packages/git/src/snapshot.ts` has the two pure parts: the files of a tree that a caller's rule keeps, and the commit that holds exactly a list of files. It names no filter form, creates nothing and sends nothing. The commit's message is the caller's. Its identity is the earlier fixed line, at time 0. | The authority note, for the record, its states, its name and which check is filtered. R2 and R4, for a member of a configuration that says so. |
| EW4 | The record of a job's read token. Section 5.7 says it is a record "of the same form" as `token`, and that it belongs to `git-read@1`. Entry E4 added none, because no step built it. The note names no kind for its mint and its revocation, and writes its purpose as "check read". | `git-read@1` declares the record `token`, with the four states of the `token` of `hold@1`, and `ended` final. Its key is a number from this capability's own counter. Its values are `purpose`, which is `check-read`; `job`, the job's fact; `before`, the job's deadline; `mint`, `id`, `ends` and `revocation`, as a token of `hold@1` has them. The kinds are `mint`, with 1 attempt, and `revoke`, with at most 3. A definition that lists both capabilities and writes `{ carried: "token.x" }` is still refused by the validator, because two listed versions declare the kind. No lane writes one. | The authority note, for the record's values and the kinds. The contract, for its table of records. |
| EW5 | "It is the first such entry for that job: a repeat is answered with the first, and mints nothing." The lane indexes a preparation by the intent's digest, the capability and the step. A second intent for the same job, with another key, is not in that index. | The same signed intent again is answered with the first entry, by the index. Another intent for the same job is refused `guard-failed`, and mints nothing. It is not answered with the first entry: the judge of a preparation has no answer that names another intent's entry. | The authority note, with the contract's section 5.5: is the second intent refused, or answered with the first entry? |
| EW6 | When a job's read token may be `live`. "It ends before the job's deadline, by its own end time at the host." "The entry that decides the job, a `check` or a `check-error`, opens its revocation. The deadline's timed entry opens nothing." Section 5.7 states "a mint that is answered after its use has ended" for a token of a hold and of an attempt, and not for a job's. No refusal of the step, and no refusal of the lane's rows, has a name in the note. | The mint's outcome, by that attempt's own answer. `confirmed` while the job is `requested` or `timed-out`, with an end time earlier than the job's deadline: `live`. `confirmed` otherwise: `revoking`, straight from `minting`, with its revocation, and never `live`. So a token that the host would still honour at the deadline is revoked at once. `refused`: `ended`. `unknown`: it stays `minting`, and nothing is minted again. The four refusals of the step are `guard-failed`, with a detail (entry EF3). | The authority note, to confirm each row and to name the refusals. |
| EW7 | **Nothing opens the revocation of a `live` read token.** The note gives it to the entry that decides the job. `check` and `check-error` are rows of the lane's data. `git-read@1` declares no effect, so no row can write one, and the judges derive a capability's own effects only for an entry with `hold` effects (`derive/src/effects.ts`). The same is true of a retry that supersedes the job, of which the note does not speak. | Not built. A `live` read token ends by its own end time at the host. Its record stays `live`, and it keeps 6 entries reserved for a revocation that no entry opens (section 5.8). Each job that was given a token therefore holds 6 entries of the lane's room for good. The seam is marked `I3 merge:` in `gitread.ts`. | The contract, for a form by which a capability derives effects at an entry that changes an item it reads, or R2, for an effect of `git-read@1` that the two rows write. With the authority note, for the retry. |
| EW8 | Entry ET4: the token driver serves `hold@1` only. Section 5.3 gives a check read token the same custody as every other. `MintAsk` names no repository (entry ET6), and no lifetime. | `TokenDriver.accepts` also answers true for `git-read@1` and the kinds `mint` and `revoke`. A record is read under the request's own owner, so a record of one capability is never read as the other's. `TokenFor` gains `{ job }`, and `MintAsk` gains `before`, the job's deadline, for a host to mint a token that ends before it. The plaintext goes to `Custody` only when the sealed entry made the token `live`, as for every token. Which repository a read token reads is the host adapter's to state. | The builder, for the adapter and the runner's gateway as `Custody`. The installation design, for the host (plan question Q6). |
| EW9 | Bounds and names of a snapshot. No text bounds the files of a snapshot, the length of a path or its depth, or says which paths a tree may hold. | `SNAPSHOT_BOUNDS`: 20,000 files, 20,000 trees, 4,096 bytes of one path, 64 parts. Each is a parameter. A part of a path is refused when it is empty, `.`, `..`, `.git` in any case, or holds a control character. Two reasons are new in `GitReason`: `bad-path` and `path-conflict`. | The proof plan, for the numbers. |
| EW10 | Section 5.8 says that a job's read token "is reserved by the step `job-read` that asks for it, as the row for a `token` says". | `gitRead().reserves`: 6 entries for each `live` token, and the closure of the mint holds the same while it is `minting`. `capabilitiesOf` now gives one value the steps and the owners' rules of every part, and adds their reserves. Entries only: the other dimensions are request `cc570904`'s. | The builder, with `cc570904`. |

**What was not run.** No host, no gateway and no runner. The step's rules
are shown as pure functions on a made-up lane with the names of entry EW2
(`derive/test/forms-prepare.test.ts`), and the driver on entries made by
hand with a stand-in host (`git/test/host.test.ts`). No real scope sealed
a `job-read` entry in a test: step 25's scenario of the `change` lane runs
its checks without a read token.

## 25. Step 25: the checker service

Written 2026-10-05, on `request/i3-checkers`, with the same two adopted
texts as section 24. Sections 3.11, 5.5 and 6.3 of the authority note have
the same text at revision 24 as at revision 21.

The step adds the package `packages/checkers`, and removes the earlier
checkers package but its retained paths, the earlier Room's jobs module and
the earlier contract's checker types, after their review
(`notes/2026-10-05-i3-checkers-review.md`). A new workspace package needs
an entry in the lockfile, as the Git package did at step 17. That entry is
a commit of its own: the workspace link and the package's block, and no new
external dependency. No entry of any scope changes its bytes, and neither
pinned digest moves. One line of `packages/git/src/gateway.ts` changes: a
forwarded request follows no redirect (entry EW16).

| # | Where the texts differ or are silent | Implemented | Owner, and the question |
|---|---|---|---|
| EW11 | The plan's row T34 puts the check results table in `platform/test/checks.scope.test.ts`. The table is about rows of the `change` lane, which is the lanes package's, and no platform package may name that package. The plan names the files `job.ts`, `signing.ts`, `service.ts`, `runner.ts` and `sandbox.ts`. | T34 is `packages/lanes/test/checks.scope.test.ts`, on the lanes' one fixture, and its command is the plan's. It imports the checker service's origin read and signer by path, so the lanes package states no new dependency. The package also has `configuration.ts`, `outcome.ts` and `store.ts`. `scripts/active-source.test.mjs` holds the package to contract, bytes and git, and lets that one test file reach it. | The builder: a dependency of the lanes package on the checkers package, in its manifest, at the merge or later. |
| EW12 | The form of each member of a configuration. Section 3.11 lists six members and says that they are "a proposal for R2 and R4 to agree". Only `image` has a stated type. The rules scope's rule checks `image` and no other member. | `Configuration`, the narrowest reading of the table: `name`, a text; `image`, a digest; `environment`, a list of `{ name, value }` with each name once; `steps`, a list of lists of arguments, at least one; `judged`, `{ passed, failed }`, each `{ status, line }`, and the two differ; `limits`, `{ seconds, outputBytes }`. The value has exactly those members. Bytes in any other form are no configuration: `check-error`, `configuration-unavailable`, and nothing runs. The bounds on each member are this package's. | R2 and R4, with the authority note, for the forms. The proof plan, for the bounds. |
| EW13 | The details of a result, and three members of `RunProvenance`. The note says that the record "is part of the result's details" and states nothing else of them. It types `image.resolved` as a digest, and its table has the case "No resolved value". A step has a `name`, and a configuration's step is "a list of arguments". No domain is stated for the digest of the details or of the environment. | The details are `{ provenance }` and nothing else. No output of a run is in them. `image.resolved` is null when the platform reported none. A step's name is its position in the configuration, counted from 1, as text. `run` is a name that the service draws at random when it makes the job's record. Both digests are the SHA-256 of the value's canonical bytes, with no domain tag. With no configuration there are no details. | The authority note, for the details, the step's name and the two domains. |
| EW14 | The reason of a `check-error`. The note gives four words: `configuration-unavailable`, `image-mismatch`, `image-unresolved` and `run-lost`. For the other rows of "What the checker signs" it says "with that reason" or "naming the step". The lane's field is a text of at most 4,096 bytes. | Seven more fixed words, and one form: `environment-mismatch`, `checkout-unconfirmed`, `runner-not-started`, `runner-lost`, `limits-passed`, `report-malformed`, `judgment-unreadable`, and `step-failed:<n>`, where n is the step's position. A reason is never a run's output. | The authority note, with R2, for the words. |
| EW15 | How the checker service reaches scopes, and which rules scope is "the repository's". No text gives the form of a notice, the read by which the rules scope serves a kept configuration's bytes, or how the service knows the rules scope of a lane. The contract's `RetainedInput` has no kind for a value beside an intent. | The service is configured with one rules scope, for the one repository that its key is a checker of (section 5.5, "One key for one member"). No notice and no lane names it. `Scopes` is the port: seven calls, of which five are reads. No adapter of it exists. A notice is `{ lane, job, name, tree }`, and nothing of it is used but what to read. The base and the integration commit of a job are read from the manifest's own entry, which the job's entry names. | The builder, for the adapter and the Worker, with a deployment (plan question Q8). The contract, for the read of a kept value. |
| EW16 | The runner's network, and the gateway. The note gives a runner one repository through its gateway, and "the exact rule is an item of I3's review". The earlier sandbox also let a runner read a package registry. The gateway of `packages/git` built its forwarded request with the default redirect mode. | The runner's gateway is the Git package's gateway with a grant whose `update` is null: two read requests of the granted repository pass, by their whole path, and nothing else. A registry is not carried: a runner has no other network, so a check that installs packages needs an image that holds them. The gateway now forwards with `redirect: "manual"`, for every grant: a redirect is returned to the Git client and never followed with the credential. One gateway serves one run. | R4, with the authority note: may a check reach a registry, and through what? The builder: the gateway's change is in a file of step 21. |
| EW17 | "At most one run for a job" rests on "one write that creates the record only if it is absent", and a lost run is found "because the host or the runner's own record was lost". No text says how a delivery tells a run that another delivery is about to start from a run that was lost. | Three things, in this order. The durable record, by a write that creates it only if it is absent. A mark in the memory of the process that made the record, from that write to the run's end: a delivery that finds it waits. And the runner's own record of the run: `running`, the run's end, or nothing, which is `run-lost`. So a second process that receives the same job, between the first one's record and its runner's start, would conclude `run-lost` while the first goes on to run. No second run starts in that case either, and no pass is signed for the job: the kept outcome is the error. A deployment that sends one job's notices to one process does not meet the case. With no read token no runner starts, and that is `run-lost` too: the request for the token is not asked again. | The builder, with a deployment (plan question Q8): one process for one job's deliveries, or a runner whose record exists from the moment the job's record does. |
| EW18 | Submitting a kept outcome again. "A result the lane refused for now, for example during a merge, is submitted again later." No text says with which bytes, or how the service learns that a job is superseded. | A later delivery of the same job submits again. It sends the exact bytes of the last submit first, so a lane that admitted them answers with their receipt. If they are not accepted it reads the job's state and the revisions that the act names, signs anew and submits. A job that it reads as `superseded` is submitted no more. Nothing here submits by itself, on a timer. T34 shows what the real lane does with a late or a second answer: the rows of `change` admit it as history, and the job and its deciding entry stay. | The authority note, to confirm. The builder, for what causes a later delivery. |
| EW19 | What the checkout is held to. The plan's T36 says "the commit, its tree and its parents against the job". A job fixes a manifest and a tree. The manifest holds the integration commit and its base, "which is the first parent" (sections 6.5 and 12.2). No text says what a job states of a second parent. | The commit is the manifest's integration commit, its tree is the job's tree, and its first parent is the manifest's base. Every parent is read as a commit. A second parent is not compared with anything. The fetch has depth 2, so that the parents are there to read. The work tree is made with the Git package's settings, under which a symbolic link is written as a file. | The authority note, with R2: does a job fix more of a merge commit's parents? |

**What is not built.** No runner and no container: `Runner` has no adapter,
and the stand-in of test support returns a stated end. No storage: `Durable`
has no adapter. No adapter of `Scopes`, no Worker and no route for a
notice. Nothing routes a `live` read token from the driver's `Custody` to a
run's gateway. No filtered check (entry EW3). No image. Each needs a
deployment, which is not authorized here (plan question Q8). The review's
section 7 has the same list.

**What was not run.** No container, no real runner, no host and no
deployment. The checkout was run against a local repository with the real
`git` program, which shows what Git's objects do and nothing about a host.
The service was run on stand-ins for the lane, the rules scope, the storage
and the runner. The lane's side of a result was run on a real change lane,
with a scripted rules peer and the scripted test capability.

## 26. Steps 9 and 9c: the register and the directory whole, the membership reference of two scopes, and a founding on real scopes

Written 2026-10-05, on `request/i3-founding`, by the worker of those
steps. Entries have the prefix EY. The scope contract is at revision 19
(`1ca8a59bf`), which is adopted. The authority note's adopted revision is
24 (`d5616522b`).

**The basis of this work was not adopted when it was built.** It builds
the authority note's revision 25, at
`a1d18e51745b26beb85ba00ea12af5cbafde1e7e`, Part A of its section 13.15.
That revision was filed for review and was neither approved nor adopted.
Nothing of it is in force for a source until it is adopted, and a review
may change a row. This work is prepared ahead and is to be filed only
after that adoption, with whatever the adoption changes. So each rule is
a commit of its own, whose message names the row that it implements.
Section numbers below are those of revision 25. The parts that rest on
adopted texts alone are named so.

No entry that an earlier source wrote has other bytes. Neither lane
digest changes, and `packages/lanes` is not touched but for one comment
of its test support. The data of `platform:register@1` and of
`platform:directory@1` changes. A platform definition is pinned by name
and version, no file pins a digest of either, and no scope under either
was written by a deployed source.

**What is built.**

| Part | Built | Rests on | Witness |
|---|---|---|---|
| The outcome's send | The mark of a kind of `outcomes` may hold one `send`, a send mark with clauses of effect marks. The judge of an outcome runs its rule after the effects. A `create` among them has the fourth cause, and the sending side makes the four checks of the opening entry. The clause of the result is found by the kind of the outcome entry. | The contract's revision 19, adopted: section 6.1, "A request of an outcome's rule, and its clauses"; section 7.2; row I3-23 | `derive/test/forms-marks.test.ts`, the contract's 18.43 |
| The register | `create-repository`, its send `create-directory`, the effect mark `claim-active`, and the bodies of the outcomes of the two cleanups. Every mark has its rule. | Revision 25, section 12.1.1 | `platform/test/register.test.ts`, `definitions.test.ts` |
| The directory | `create-rules`, `create-destination`, `import-spent`, the selection of `import` with its send `import-update`, `activeKey` in `worker-standing`, and the refusal `unsupported-definition` of `definition-active`. Every mark has its rule. No stand-in rule is left. | Revision 25, section 12.1.2 | `platform/test/directory.test.ts`, `definitions.test.ts` |
| The membership reference of a rules scope and of a destination | The ID is the fixed value. The incarnation is read from the folded state. The first read asks by the ID alone. Guard 1, the production authority and the replay's reader follow. | Revision 25, section 12.1, "Where the rules scope and the destination record their membership reference" | `derive/test/forms-grant.test.ts`; `platform/test/definitions.test.ts`; `scope/test/founding-real.test.ts` |
| A founding on real scopes | A founding under `platform:register@1` founds a register. The whole path from the `install` to the rules scope runs on the deployed class. | The adopted texts for the seed's kind (entry EP2). Revision 25 for every rule that the path runs. | `scope/test/founding-real.test.ts` |

**How far a founding runs, exactly.** On Durable Objects of the namespace
`PLATFORM`, which is the deployed class with the production authority and
the platform package's own data and rules:

1. An `install` founds a register under `platform:register@1`.
2. A founder's `found` opens a claim and the operation
   `create-repository`.
3. The operations driver sends the one request of attempt 1 to the host.
   No answer comes. The outcome is `unknown`, with the body `{ name }`,
   and opens attempt 2.
4. The own answer of attempt 2 is `confirmed` and selected. It sets the
   claim's `repository` and sends the `create` of the directory.
5. The directory's genesis is written under the fourth cause, provisional.
   The register records its `applied` result, makes the claim `active`
   and confirms the directory.
6. The directory, now active, sends its three creations. Membership and
   the rules scope write their genesis, the directory records each result
   and sets each reference, and confirms each.
7. **The creation of the destination is not decided.** The object that
   its seed names records nothing, and transport answers `retry`,
   `unsupported-definition`. A runtime with this package lacks a rule for
   ten marks of `platform:destination@1`: `resend-due`,
   `abort-if-behind`, `first-head`, `judge`, `push`, `mint`, `revoke`,
   `deciding-read`, `receipt` and `adopt-read`. Those are the plan's
   steps 9e and 9f.

So a founding is not whole, and **step 10, the removal of the earlier
founding, is not built.** A directory with no creator is still founded by
a `found` intent under a declared definition, as every other test of the
scope package does.

The Git host of that witness is a STAND-IN: `OutsideDouble`, of
`packages/scope/test/outside.ts`, wired as the register's outside port.
It answers an attempt with what the test wrote. The production outside
port sends nothing, so under the production wiring a claim stays
`pending` and no repository is created (entry EY10).

**Earlier entries that this work answers.** Each line is dated 2026-10-05.
The earlier sections stay as they were written. "Revision 25" is the
unadopted revision named above.

- **EJ1, closed for the source, on revision 25.** The contract's revision 17 decided the form. Revision 25 states the rule `create-repository` whole. Both are built. The stand-in rule is deleted.
- **EP1, the sending side, closed.** The judge of an outcome lets the rule of the mark's `send` give a `create`. It makes the same four checks as the child, on the scope's own history, and requires a fact of the opening entry among the fields. A creation that fails one is a fault, and nothing is written (entry EY5).
- **EP2, closed.** `Scope.found` and the Worker build the seed's kind from the definition that is named: `register` under the register's platform definition, and `directory` under any other.
- **EP4, closed, on revision 25.** No read is decisive, as built. The body of every outcome of `revoke-credential` is `{ credential }` and of `delete-repository` is `{ id }`, each the one that the opening entry's body holds, and the source checks it.
- **EP6, closed, on revision 25.** The two rules are written, under the key P20. A sibling's scope ID is `scopeIdOf` of the sibling's seed. The body of each creation is in entry EY3.
- **EP7, closed, on revision 25.** `import-spent` is a rule of the package, under the key P29, refused `import-not-spent`. An `unknown` attempt counts as used. The stand-in, which waited for every attempt to be `confirmed` or `refused`, is deleted.
- **EP9, closed, on revision 25.** The kind `import` selects one result, guarded by `repository.imported`. The body of a `refused` or an `unknown` outcome is an empty record. The update is the request of the send `import-update`. One case is in entry EY11.
- **EP11, closed, on revision 25.** `worker-standing` reads `activeKey`. A worker whose observation does not show `activeKey: true` is refused `worker-not-active`. The row says "its `activeKey` is false": a null there is refused too, which is the narrower reading.
- **EP15, closed, on revision 25.** `definition-active` states two refusals. Bytes that hash to their digest and do not validate, and a closure of more definitions than the bound, are refused `unsupported-definition`, with that name and that code.
- **EX4, closed, on revision 25.** As EP6. `platform:directory@1` lacks no rule, and `platform/test/definitions.test.ts` asserts it for the register and the directory.
- **EM21, closed for the rules scope and the destination, on revision 25.** The production authority reads where a platform version records the reference from the platform table. The first read of the two kinds asks by the ID alone, and the entry that retains the answer fixes the incarnation.
- **EQ7, closed, on revision 25.** `rulesMembership` reads the ID with the incarnation of the retained observations, from the folded state. The rule `checkers` is confirmed as built, and is not changed.
- **EU6, closed for the reader, on revision 25.** The replay reads the reference of a rules scope and of a destination with the same two functions. An entry that retains the first observation fixes the incarnation for itself. The check against the directory's history is not built (entry EY8). The contract is still asked to confirm that this function is reported under `platform-code`.

| # | Where the texts differ or are silent | Implemented | Owner, and the question |
|---|---|---|---|
| EY1 | The contract's row I3-23: "An outcome's mark holds `attempts`, and may hold one `send`". Its `Mark` also holds `most`, `refusals` and `clock` (rows I3-21 and I3-22), which this base does not have: a mark is `{ code, row }`, and the rule table states the rest (entries EJ8 and EX1). The note's table of marks gives the send "7, the send" as its place. | The mark of a kind holds `send`, and no `attempts`. The rule that opens the operation states its attempts, as before. An `OutcomeRule` may state `most`, as the ledger's rules do, and `create-repository` and `import` state the note's numbers. The validator lists the send as a mark of the kind `send`, place 6, at `outcomes.<kind>.send`, and the mark of its clause as an effect. A send of an outcome's mark that states `always` is refused: the row says "no request or one". | The I3 delivery, with rows I3-21 and I3-22: `attempts` joins the mark with the other members. |
| EY2 | The contract says that an outcome's row writes no send and that its mark holds "at most one request". Place 7 of its table of places still says that the rule gives "the entry's effects and sends". The stand-in rules of the destination's outcomes, in test support, return requests from `derives`. | Both stand. Where the mark holds a `send`, `derives` returns no request, or it has a fault, and the entry's one request is at ordinal 0. Where it holds none, `derives` may return requests with no clause, and never a creation, as before. Marked `I3 merge:` in `derive/src/outcomes.ts`. | The builder, at step 9f: when every kind of the destination has its send mark, `derives` returns no request at all. |
| EY3 | Revision 25, section 12.1.2, "No member `membership` in these two creations": "the body of each of these two creations holds `{ fields, directory }`". The contract's section 6.6 has the platform put `directory` in a `create` of a lane. The source's judge gives the written `create` of membership, in the same entry, the body `{ fields }`. Each of the two creations carries `directory` as a field. | The body of each of the two creations is `{ fields }`, as the judge builds the first creation of the same genesis. A child of a directory reads its directory from its seed's creator, so no reader misses the member. | The authority note, with the contract. Does the body of a creation that a genesis sends hold the member `directory`, for all three? |
| EY4 | Revision 25 states a body for every result of the register's and the directory's operations, an `unknown` one too: `{ name }`, `{ credential }`, `{ id }`, an empty record. A body names what the scope's records hold. The contract's place 7 says that the rule decides "whether the evidence is well formed", and not what it is given. The runtime's driver offered every `unknown` outcome with the body null, so such an outcome could never be written, and no further attempt would be opened. | `wellFormed` is given what the retry rule is given (the contract's row I3-35, for that rule). An owner's rules may state `unknown`: the body of an outcome that is not known, as a function of the state and of the scope's own entries. The driver asks it in place of null, and the judge checks the body like every other. An owner that states none is as before. | The scope contract. Is the evidence check given the state, and where does the body of an `unknown` outcome come from? |
| EY5 | The contract's section 7.2 says what the child answers when a creation names no opening entry: `source-unverified`. It does not say what the creator does with a rule that returns such a creation. | A fault of the rule: the outcome is not judged, and nothing is written. The fact among the fields is compared whole: this scope, the position that the operation's ID states, and the hash of that entry. The same for a creation from the outcome of an operation that no act opened. | The scope contract, to confirm. |
| EY6 | Revision 25: the send `create-directory` gives a request "on the selecting outcome, and on no other", and `import-update` "when `selected`". A rule at a send is given the six things, and `selected` is none of them: the ledger derives it. | Each send rule makes the ledger's judgment again on the same state: the result is `confirmed`, the operation has selected nothing, and the owner's guard holds. The guard is the same expression as the outcome rule's `holds`. | The scope contract. Is the rule of an outcome's send given `selected`? |
| EY7 | Revision 25, "The first read": "It asks membership by its scope ID alone", and cites the contract's row I3-18, which is about the scope part of a read route. The contract's `ObservationRequest` has `of: ScopeRef`, with an incarnation. | A request's `of` may be a reference with no member `inc`: the scope ID and the kind. Membership answers it as it answers a full reference of its own, and the answer's `of` holds its incarnation. The request is no part of any entry. | The scope contract. The form of a request that names no incarnation. |
| EY8 | Revision 25: "A replay checks it against the directory's history: the `applied` clause of the directory's `create` recorded the same reference". | **Not built.** The replay derives the value of each retained observation from the history of the scope that its `of` names, at the recorded head, as before. It does not read the directory of a rules scope to compare the incarnation with `repository.membership`. | The builder, with the replay's coverage. How does a replay of a rules scope reach its directory's entry that recorded the result? |
| EY9 | Revision 25 takes the incarnation "from the first such entry on", and says that the folded state holds a head for each subject with its `of`. The folded state holds no order of entries. Guard 1 lets an entry retain one incarnation only, so a valid history holds one. | `StateView.incarnations(scope)`: the incarnations of the retained observations of one scope ID. One: the reference has it. None: the reference has no incarnation. More than one: the scope records no reference, and an act that needs a grant is answered `authority-unavailable`. | The authority note, to confirm the last case. |
| EY10 | The outside port for the register's operations. The plan's host port (step 19) serves the token ledger. No text gives the request of `create-repository`, `revoke-credential` or `delete-repository` at a host. | No production port accepts an operation of `platform:register@1`. The driver gives a port the entry that opened the operation and the attempt's number, and `repositoryName` gives the attempt's own name from the claim's `seed`. The witness uses the labelled stand-in host. The incident for a `refused` creation or a name that is taken is not built: it is no effect of an entry. | The builder, with the installation design (N5): the host adapter of the register, and the operators' record. |
| EY11 | Revision 25, "The last `refused`": the `refused` outcome after which every attempt that the operation states is opened and refused sends `failed`. It does not say what follows when another `import` operation was selected before. | As the row states. So when a retried import was `confirmed` and told the destination `done`, and the late answer of an attempt of the first operation then makes that operation's last `refused`, the destination is told `failed` after `done`. Seen while the witness was written, and not run as a test. | The authority note. Is `failed` sent when `repository.imported` is set? |
| EY12 | Revision 25, section 3.9 with this block: a scope accepts a read session that names the membership reference which the scope records, with its incarnation. A rules scope records no incarnation before its first retained observation. | Such a scope accepts no read session until an entry of it retains an observation of membership. The witness shows the refusal and then the acceptance. | The authority note. Is that right, or is a session checked by the scope ID alone there? |
| EY13 | The earlier founding. A directory with no creator is founded by a `found` intent under any definition that is not the register's, `platform:directory@1` too. | Not removed (step 10). By reading, and not run: a founding under `platform:directory@1` with no creator passes the seed check, and its genesis is then written `refused`, `bad-field`, because the intent holds no `claim`. It makes no repository. | The builder, at step 10. |

**Lines for the merge.**

- `PlatformData.outcomes` is a record of `OutcomeMark`, which may hold `send`.
- `OutcomeRule.wellFormed` takes a third argument, and `OperationRules.wellFormed` a third and a fourth. A rule that ignores them is unchanged. A test that calls one with two arguments needs more. Both may state `unknown`.
- `StateView` has one more method, `incarnations`. `MemoryState` and `SqliteStore` have it. A view that a test builds by hand needs it.
- `GrantAsked.membership`, `Platform.membership`, `Coded.membership` and `recordedMembership` use `RecordedRef`, which may hold no incarnation. `fixedMembership` is the reference with its incarnation, for read sessions.
- `ObservationRequest.of` is an `ObservedScope`.
- `rules-scope.ts` gains `referenceOf` and `rulesMembership`, and `destination.ts` gains `destinationMembership` and `destinationRulesScope`. The workers of steps 9a, 9b, 9d and 9e were also told to read the membership reference as section 12.1 states it. One pair of functions must stay.
- The platform package no longer exports `DIRECTORY_CLAUSES`. It exports `repositoryName` and `directoryIdOf`. `support-founding.ts` holds no rule: `registerStandIns` and `directoryStandIns` are gone.
- `PlatformScope`, of the scope package's test Worker, takes the ports that a test wired for a name (`wired`, of `outside.ts`).
- `scope/test/founding-real.test.ts` names the ten marks of the destination that have no rule. Each step that writes one shortens the list, and the test then fails by that assertion until the list is edited. Marked `I3 merge:` there.
- `scope/test/founding.test.ts` no longer expects `unsupported-definition` for a founding under `platform:directory@1`, which is runnable. It asks for `platform:task@1`.

**What is not built.** Step 10. The destination's rules (steps 9e and
9f), so no founding is whole. The replay's check of an incarnation
against the directory's history (entry EY8). A read of the rules scope
before a turn, so `destinationRulesScope` has no caller, and the
directory's guard `definition-active` is still never completed on a
deployed scope (entries EM3 and EX6). The member `attempts` of an
outcome's mark (entry EY1). A production host for the register (entry
EY10). The capacity of an outcome entry that sends a request, and of the
entry that records its result: request `cc570904`.

**What was not run.** No deployment and no provider. No host: the Git
host of the witness is a stand-in. The gate was not run.

## 27. Repairs after review 25e00e2a of the second milestone

Numbered 2026-10-06, at the merge of the third milestone: the second
milestone's delivery note,
`notes/2026-10-05-i3-second-milestone-delivery.md`, cites these entries
as section 26 of its own branch, where section 26 here (entries EY) was
not present.

Written 2026-10-05, on `request/i3-m2`, after the review at head
`d0354e266`. The repairs and their witnesses are in
`notes/2026-10-05-i3-second-milestone-delivery.md`, section 13. This
section holds what the repairs and their sweeps found and did not change,
each with its owner. No entry of any scope changes its bytes, and neither
pinned digest moves.

| # | Where the texts differ or are silent | Implemented | Owner, and the question |
|---|---|---|---|
| EZ1 | The form and the size of what a runner returns. Section 3.11 says what the checker signs for each end of a run, and states no form for a report and no bound on one. | `readReport`, in `packages/checkers/src/outcome.ts`: exactly six members, each variable exactly `name` and `value`, each step exactly `status` and `line`; strings well formed; a status a safe integer and not negative zero. `REPORT_BOUNDS`: at most 1,024 variables, 1,024 steps and 64 KiB for one string. A report outside any of these is `report-malformed`. So a runner that adds a member to its report gets an error and no judgment. The three numbers are this package's. | The authority note, with R2 and R4: the form of a report, and its bounds. The proof plan, with request `cc570904`: the numbers. |
| EZ2 | What the checker service logs of a lane's answer to a submit. The service's log is "fixed words only". | Not changed. `service.ts` logs `refused` with the answer's `reason`, as the `Scopes` port gave it. The contract's reasons are fixed words. Nothing checks that an adapter gave one of them. The log of the read-token request is now one of four fixed words. | The builder, with the adapter of `Scopes`, which is not built (plan question Q8): the adapter reads an answer by the contract's guard, or the service does. |
| EZ3 | The request that a host delivers with a late reply. `TokenDriver.answered(ask, reply)` takes the request "as it was sent". No text says who keeps that request or in what form it comes back. | Not changed. The reply is read member by member, once. The request is not checked: one that is no `MintAsk` or `RevokeAsk` makes the call reject, and a plaintext is kept under the scope that the request names. The operation and the attempt are checked by the scope's driver, which refuses an attempt that was never sent. | The builder, with the adapter of `GitHost`, which is not built (plan question Q6). |
| EZ4 | The size of one retained snapshot. The contract's table of reads has no row for a retained input, and `RETAINED_INPUT_BYTES`, 1 MiB, is the history page's bound, and temporary. Nothing bounds a snapshot where it is stored. | Not changed. A snapshot that comes with an answer is stored whole in the commit of its outcome entry. One over 1 MiB is then `too-large` to every reader, so a verifier cannot read it and the replay of that entry is `incomplete`. The test's snapshot of 6,991 staged refs is over the bound. | The scope contract: the bound on one retained input, and whether the scope refuses at the commit what no reader could read. The proof plan, with request `cc570904`: the number. |
| EZ5 | A snapshot's bytes. `RetainedInput.bytes` "is canonical JSON text". `snapshotRead` reads the pairs in any order and with any spacing, and the digest is of the sorted pairs. | Changed in the driver: an answer whose snapshot is not its canonical bytes is no answer (`packages/scope/src/operations.ts`, `snapshotsOf`). Not changed in the verifier: `snapshotRead` still accepts such bytes from a source, because the digest of the pairs is what the record names. | The scope contract: whether a retained input whose bytes are not canonical is a mismatch for a verifier. |
| EZ6 | The acknowledgment of a send. The dispatcher writes the fact that transport answered with, as canonical text (`packages/scope/src/sqlite.ts`, `acknowledge`). | Not changed, and outside the sweep that the review asked for. Transport under the deployed class is another object of the same service, and its answer is the service's own. An answer whose fact has no canonical bytes would make the pass fail after the attempt was recorded, and the send would be dispatched again at each delay. | The builder: the dispatcher reads a transport's answer by the contract's guard before it writes it. |
| EZ7 | The bounds of the inputs of `classify` and `matches`. An extent has at most 32 patterns of at most 256 bytes. No text bounds the changed set, the links of a tree, the paths that a link resolves to, or the length of a path: the caller that computes them is not built (entries EV1 to EV3). | Two loops that were quadratic are now linear in what they look at (the delivery note, section 13.3). Not changed: `nameMatches` takes the product of the lengths of one pattern name and one path name; a judged path is looked up once for each distinct length of a path that some link resolves to; and a path is matched against each pattern of each extent. Each is a product of two inputs, of which the rules bound one. | The authority note's next revision, with the forms of entries EV1 to EV3: the bounds of a changed set and of the links. The proof plan, with request `cc570904`: the numbers. |
| EZ8 | The work of one read of a snapshot's files. `SNAPSHOT_BOUNDS` bounds the trees that one read walks, at 20,000, and the reader bounds one tree's bytes. | Not changed. `snapshotFiles` reads a tree again each time another tree names it, so the work is the number of trees walked, within the bound, times one tree's bytes. Nothing is remembered between two walks of the same tree. | The builder, with the step that calls `snapshotFiles`, which is not built (entry EW3). The proof plan, with request `cc570904`: the bound on the bytes of one read. |
| EZ9 | The listing of a remote's refs. `GitSource.refs(prefix, limit)` states a limit. | Not changed. `Git.source` in `packages/git/src/gitops.ts` reads the whole answer of `ls-remote` for the prefix and then keeps `limit + 1` rows. The work is linear in what the remote answers, and the bound is applied after the read. | The builder, with the adapter of a host (plan question Q6): a listing that stops at the bound. |
| EZ10 | The witness of a snapshot's read. The review asked for an authenticated HTTP source that reads an actual retained snapshot. | `packages/scope/test/sessions.test.ts`: a real read session, the Worker's route and the replay's own HTTP source read a snapshot that a commit of a real membership scope stored. The entry of that commit is made by hand: no outcome entry names the snapshot, and no outside system answered. No test reads over HTTP a snapshot that a lane's own outcome entry stored. | The builder, with entry EU2: when the ancestry walk is derived, the replay of a real lane's check entry reads its snapshot over the route. |
| EZ11 | Value reads. Row I3-33 adds the retained kind `value`, kept by its domain and its digest. | Not changed: entry EX6 defers it by name, and stands. The scope stores no value, the store has no column for a domain, the read route serves five kinds and not `value`, and the replay's HTTP source asks for none. | As entry EX6. |

**What was not run.** Nothing was run on a deployment, a host, a
container or a real runner. The streams of finding 2 were read inside the
object's own isolate, and not over a network.

## 28. Request `42de9e34`, the data side: the rules scope holds extents

Written 2026-10-05, on `request/i3-extdata`, by the worker of that part.
Entries have the prefix FB. The scope contract is at revision 19
(`1ca8a59bf`), which is adopted. The lane forms note is at revision 15
(`f4889d47`), which is adopted.

**The basis of this work is approved, and its adoption was not recorded
when it was built.** It builds the authority note's revision 26, at
`f7175296`: sections 12.1.4 and 12.1.4a, rows w, x and y of the table of
further marks, and the rows of steps 9a and 9d in "What revision 25 lets
the I3 source do next" as revision 26 corrects them. The checker approved
that revision. The planner's adoption of it is expected and was not
recorded when this was written. So each row is a commit of its own, whose
message names the row that it implements. Section numbers below are those
of revision 26.

No entry that an earlier source wrote has other bytes. Neither lane digest
changes, and no file under `packages/lanes` changes: the lane side of
extents is a later change with its own digest. The data of
`platform:rules@1` changes: entry FB11.

**What is built.**

| Part | Built | Row of revision 26 | Witness |
|---|---|---|---|
| The slot and the field `extents`, and the type rule `extent-list` | `rules-scope.ts`; `isExtents` in `extents.ts` | Section 12.1.4, "Two more value slots", "Two more fields", "An extent, with its bounds"; row w; the missing form 2 | `rules-scope.test.ts`, the test of the extents, with case i; `extents.test.ts`, the test of a list of extents |
| The guard `extents-hold`, with its three refusals | `rules-scope.ts` | Section 12.1.4, "The three checks of `extents-hold`"; row x; the missing form 3 | `rules-scope.test.ts`, the test of the extents, cases f, g and h |
| The slot and the field `singleControllerException`, and the member of `RulesContent` | `rules-scope.ts`; `packages/contract/src/observation.ts`; `packages/bytes/src/records.ts` | Section 12.1.4, the same two tables; the missing form 14; the contract's row I3-36 | `rules-scope.test.ts`, the test of the declaration, with case j |
| The send mark `rules-update` | `rules-scope.ts` | Section 12.1.4, "The `rules` update"; row y | `rules-scope.test.ts`, the test of `rules-wanted`, cases d and k |
| The first definition before a first `publish` | `extentsOf` in `rules-scope.ts`, with `firstExtents` | Section 12.1.4, "Before the first `publish`" | The same test, case k |
| A review counts for the extent that it states | `judgeExtents` | Section 12.1.4a, "Which reviews count for an extent" | `extents.test.ts`, the test of the mixed change |
| The inputs that no retained form supplies fail closed; a path that is no text | `classify`, `judgeExtents` | Section 12.1.4a, "A path that is no text", "What makes the relation replayable", and the missing forms 1, 11 and 15 | `extents.test.ts`, the test of the inputs |

`firstExtents` and `holdsRulesExtent` were compared with the note's row
"The first definition" and with "Its fixed minimum", member for member,
and are not changed. `matches` was compared with "A pattern, in two
cases" and is not changed; one more assertion shows `a**b`.

**What is not built.**

- No rules scope answers an observation of the rules: entry FB10. So no
  `publish` is "observed back" by an observation. What is shown is the
  scope's own state and the `rules` update.
- `RulesContent` has no member `extents`: entry FB2.
- Nothing here calls `classify` or `judgeExtents`. The destination's rule
  `judge` will, and it is another worker's.
- No changed set is computed, no link is resolved, no observation counts
  the holders of an action, and no entry retains an observation of an
  authoring agent. Each is an input: entries FB6 and FB7.
- The pinned `change` lane does not take the update: entry FB5.

Controls, each by `scripts/control.mjs` and each distinguishes: 18 in
all. One for the stated extent of a review; six for the inputs that fail
closed; one for the rule `extent-list` and one for a bound of `isExtents`;
three for `extents-hold`, one for each check; two for the declaration, of
which one shows that the record check takes no member `extents`; four for
`rules-update` and `extentsOf`.

| # | Where the texts differ or are silent | Implemented | Owner, and the question |
|---|---|---|---|
| FB1 | The rule `extent-list`. The note bounds each text in bytes and each list by a count. It does not say how a value that is no list, a record with a seventh member, or a number that is no integer is answered. | `isExtents`: a list of 1 to 8 records, each with exactly the six members. A text is counted in the bytes of its UTF-8 form. `approvals` is a safe integer from 0 to 64. Anything else is not of the type, and the act is `bad-field`, with no name. A `publish` with no field `extents` is `bad-field` too: the field is required. The bound "a `publish` that would not fit an entry is refused by that limit" is the scope's and is not witnessed here. | The authority note, to confirm. The proof plan, for the numbers. |
| FB2 | The member `extents` of a `RulesContent` that was asked as "rules". The note asks the contract for it (its ask 1), and the contract's revision 19 does not state it. | Not added. The type has no such member, and the record check of an observation refuses a content that holds one, so no entry retains an observation of the rules with extents. What a reader of the rules gets meanwhile: from an observation, nothing of the extents, and today no observation at all (entry FB10); from the rules scope's own state, the extents whole, by `extentsOf`, which is code of the version for the answer to use when the member exists; and for a lane, the `rules` update, with five members of each extent and no pattern. So the destination judges no extent from an observation, as the note says. | The contract, for the type and for the size of `content` (its point R1-61). |
| FB3 | The contract says that the record which was asked as "rules" holds `singleControllerException` "under a rules definition whose item `rules` states a value of that name", and has no such member under another. The source has one type `RulesContent` for every definition. | The member is optional in the type and in the record check, and is a truth value where it is present. `platform:rules@1` states the value from its genesis, so an answer under it always holds the member; no answer exists yet (entry FB10). `judgeExtents` takes anything but `true` as no declaration. | The contract, to confirm that one type with an optional member is its "two fixed records". |
| FB4 | The rule `extents-hold`. The note says that it reads the fields `extents` and `checks`, "as read", and that the first check that fails gives its name. | As written. Check 3 compares each name of an extent's `checks` with the member `name` of each record of the field `checks`. The guard stands third, after the written guard and `checkers`. Where `checkers` is not completed and `extents-hold` would refuse, the judge answered the refusal: that is the judge's order of a refusal and a guard that is not completed, it was seen once while the witness was written, and no test here states it. | None. |
| FB5 | The mark `rules-update`. The note says "the mark `rules-update`, with empty clauses" and "one request, in every entry of the row". It says that `checks` is left out before the first `publish`, and gives `labels` as "the slot". The slot `labels` is unset before the first `publish` too, and a message holds no absent value. | The mark is `{ code: "rules-update", row: "P28", result: {}, always: true }`: `always` is the contract's form for "exactly one request in every entry of its row". The rule gives one `relate` to the scope of the delivery's `from`, named `rules`, of the item `rules`, in the state `current`. `labels` and `checks` are each left out while unset, as the written `relate` of the earlier row left them out. `extents` is five members of each extent of `extentsOf`. The pinned `change` lane still takes none of this: its handler declares three fields, and no pinned lane sends `rules-wanted` (entry EQ10 stands until the lane rows of the lane forms' section 18.4 are built, with their digest). | The authority note, to confirm `always` and `labels`. The I3 source, for the lane side. |
| FB6 | The missing form 1. No retained input holds the changed set, the link rows or the count of paths that are no text. "A path that is no text" says that such a change is not met, with `rules` named. | Three explicit inputs of `classify`: `changed`, `links` and, new, `unreadable`. `Touched` has one more member, `unreadable`. A count that is not 0 makes `rules` unmet, with the class `authority`, and no review and no exception meets it. A caller that gives null for the changed set or the links, or gives no count, gets `unreadable: null`, which `judgeExtents` reads as not met too; so does a `Touched` with no such member. To fail closed a caller gives null. A changed set that is given and is empty says that the change touches no path, and nothing is asked. | The authority note's next revision, with the proof plan and IA, for the form. The builder, at the merge: a call of `classify` with three arguments is now judged as not stated. |
| FB7 | The missing form 15, and the open row of section 13.16: from which retained record the destination reads the controller of an authoring agent, for the exception's second clause and where it refuses a review. | `controllersOfAuthors` is a list or null. Null says that nothing shows the relation. Then the exception is not passed by the second clause: an agent's change under the one controller is not met, `rules`. The first clause still holds from the authors and the merger. And no review counts where a controller's would be refused: for the `rules` extent always, and for every other extent unless `ownerMayReview` is true. That is the side that fails closed, and it is wide: under the default `ownerMayReview: false` a caller that gives null counts no review at all. An empty list is a statement that no author is an agent with a controller. Only a caller that holds an observation of each author may make it. | The authority note's next revision, with R2, for the retained record. The builder, for what the destination's rule gives meanwhile. |
| FB8 | "Which reviews count for an extent": a verdict states one extent, or none. | `ExtentsAsked.reviews` is a list of `Review`: a `Holder` with the member `extent`. A review counts for an extent only when it states that extent's name. One with null, with no member, or with a name that no extent has counts for none. | None. The builder, at the merge: the type of `reviews` has one more required member. |
| FB9 | "A link that leaves the tree is never met, by a review or by the exception", and the order of the names in `reason`. | Where a path is refused or is no text, `rules` is not met and its `exception` is null, whatever the three conditions say. `unmet` is in the order of the rules, and holds `rules` at its place also where the change touches no path of that extent. For rules with no extent named `rules`, which no rules scope can hold, the name is last. A path that no extent holds still names no extent, as section 23 has it: under a rules scope none can arise. | The authority note, to confirm the place of `rules` in the text where the change touches no path of it. |
| FB10 | Entry EQ8: the answer of a rules scope to an observation needs the position of the last `publish`, which no slot holds. Revision 26 lists EQ8 among the entries that it carries with nothing decided. | Not built, as before. `platform("platform:rules@1")` has no `observed`. The declaration and the extents are in the folded state for that answer to read: the value `singleControllerException`, and `extentsOf`. | The authority note, for the source of the revision. |
| FB11 | The rows of `platform:rules@1` change under one name and version. The note says that no deployed scope runs under it, so no second version is named. | The data's digest changes. The folded state of a rules scope has two more values from its genesis: `extents`, unset, and `singleControllerException`, false. The entry of `rules-wanted` sends an update with more members. A `publish` with the four older fields alone is refused `bad-field`. No file pins a digest of this data, and no source wrote a rules scope's history that a replay must read again. The one caller that changed is the real founding's `publish`, in `packages/scope/test/founding-real.test.ts`, which states the extents of the first definition. | None. |

**Earlier entries that this work answers, each dated 2026-10-05.** The
tables of sections 17 and 23 are as they were written.

- **EV2** (the missing form 2). Built as rows: the slot, the field and
  the bounds, by the rule `extent-list`. The member of `RulesContent`
  stays owed by the contract: entry FB2.
- **EV3** (the missing form 3). Built for `publish`: the marks
  `extent-list` and `extents-hold`, and the refusal
  `rules-extent-required` with two more. The part of `judge` is the
  destination's.
- **EV11** (the missing form 14). Built: the slot, the field and the
  member of `RulesContent`. `publish` has no guard on the number of
  controllers.
- **EV12**. `firstExtents` is the default before a first `publish`, by
  `extentsOf`.
- **EV13**. Confirmed as built. The rule `extent-list` refuses a pattern
  with an empty name. A path that is no text is an input: entry FB6.
- **EV14**. `publish` refuses a list that has not exactly one extent with
  no pattern, named `catch-all-required`. `classify` assumes it and still
  fails closed for a list that is no such list.
- **EV15**. Confirmed: the checks of the `rules` extent stand under the
  exception. A refused path is not met by the exception: entry FB9.
- **EV7**, reading (b). Decided by the planner as the stricter reading,
  and `judgeExtents` holds it: entry FB9.
- **EV1**. The type `Changes` of the note has the three inputs of
  `classify`, of which `unreadable` is new here: entry FB6. Nothing
  computes them.
- **EV17**. The header of `rules-scope.ts` names revision 26.
- **EQ5**. `publish` has six fields. Five are required, and the
  declaration is optional with the default false.
- **EQ8**. Carried by revision 26, and not built: entry FB10.
- **EQ10**. The update's detail has up to six members. The lane's side is
  not built: entry FB5.

## 29. Steps 9b, 9e and 9f: the destination, on the authority note's revision 26

Added 2026-10-06, at the merge of the third milestone with section 28.
`packages/platform/src/reservation.ts` now gives `classify` the count
`changes.unreadable` of the evidence as its fourth argument, gives
`judgeExtents` each review with the extent that it states, and gives
`controllersOfAuthors` as it was read, null where no form supplies it
(entries FB6 to FB8). `judgeExtents` is still called once for each
touched extent. The answers of entries FA9 and FA10 do not change, and
the witnesses of `destination.test.ts` pass unchanged.

Written 2026-10-06, on `request/i3-dest2`, by the worker of those steps.
Entries have the prefix FA. The scope contract is at revision 19
(`1ca8a59bf`), which is adopted.

**The basis of this work was approved, and its adoption was not recorded
when it was built.** It builds the authority note's revision 26, at
`f7175296`: its section 12.1.5, "The destination, decided in revision
25", which revision 26 keeps unchanged (Part B of its section 13.15).
The checker approved revision 26. The planner's adoption was expected
and was not recorded. Nothing of it is in force for a source until it
is adopted, and an adoption may change a row. So each rule is a commit
of its own, whose message names the row that it implements. Section
numbers below are those of revision 26.

No entry that an earlier source wrote has other bytes. Neither lane
digest changes, and `packages/lanes` is not touched. The data of
`platform:destination@1` changes. A platform definition is pinned by
name and version, no file pins a digest of it, and no scope under it was
ever written: the version has never been runnable.

**What is built.**

| Part | Built | From | Witness |
|---|---|---|---|
| Step 9b | The six slots. `open-judge` opens one `judge` at a time, by `branch.judging`. `collect-list` checks three lists, and a verdict may state `extent`. `adopt-head` has the fields `commit` and `why`. The guards `not-importing` and `not-the-directory`. A refused `withdraw` sets nothing, as built before. | Section 12.1.5: "Six more slots", "The rule `open-judge`", "The three lists of `reserve`", "Small places" | `platform/test/destination.test.ts` |
| Step 9e | `abort-if-behind`. `resend-due`, refused `resend-not-due`. `reopen-publish` opens the mint of its attempt. | "The rule `abort-if-behind`", "The guard and the effect of `resend`" | The same |
| Step 9f | The rules `mint`, `revoke`, `push`, `deciding-read` and `adopt-read`. The send `publication-update`. An entry that opens the first head opens its attempt's mint. The judgment of a reservation, `judgeReservation`, and the rule `judge` around it. | "Who opens the mint, the revocation and the deciding read", "The evidence of a write", "What each rule of an outcome yields", "What `seen` decides for a push"; section 6.5 | The same |

**What is not built.**

- The rules `first-head` and `receipt`. They wait on the two details that
  the note asks of the contract (entry ER9; section 12.1.5, "The founding
  commit, and the receipt"). They are marks with no rule. So
  `platform:destination@1` lacks two rules, and nothing is created under
  it.
- The reading of `observed` and of the entries in `uses` for the rule
  `judge` (entry FA9). So in a runtime the rule `judge` reserves nothing.
- A port that sends a request of the destination. No host, no gateway
  and no Git command is reached by any test of this work.
- The reservation of room by a publication (entry FA3).

**How far a founding runs now.** As far as before: steps 1 to 6 of
section 26, on real scope objects. Step 7 is unchanged in what happens:
the creation of the destination is not decided, and transport answers
`retry`, `unsupported-definition`. What changed is why. The runtime
lacks a rule for two marks of `platform:destination@1`, `first-head` and
`receipt`, where it lacked ten. `scope/test/founding-real.test.ts` names
the two. Step 10 is still not built.

**Earlier entries that this work answers.** Each line is dated
2026-10-06. The earlier sections stay as they were written.

- **ER1, closed.** Revision 26 confirms the eight kinds and the eight rule names, as built.
- **ER2, closed, on revision 26.** `open-judge` reads `branch.judging`, opens none while a `judge` is open, and sets it. `judge` has 1 attempt, and its one outcome is `confirmed`.
- **ER3, closed, on revision 26.** Three lists with the mark `collect-list`. The numbers and the members are constants of the rule. A verdict may state `extent`.
- **ER4, closed for a push, on revision 26.** `resend-due` is written, under the key P29, refused `resend-not-due`. `reopen-publish` opens the mint. The half for a `published` publication cannot run (entry FA6).
- **ER5, closed, on revision 26.** The four answers are built: the abort is the entry of `compromised`; the live token is the slot `token`; the rule for a further attempt reads `aborting`; the reservation entry is at `reservedAt`.
- **ER6, closed, on revision 26.** Each rule finds what its operation is for from the opening entry and the six slots. Two searches read more than one entry (entry FA5).
- **ER7, closed for this note's half, on revision 26.** Who opens the mint, the revocation and the deciding read is built. A read is evidence in a body and settles no attempt. The witness that section 18 could not write is written: the unknown outcome of a push of the destination leaves only its own answer able to follow.
- **ER8, built in part.** The body of the evidence is checked member for member. The judgment of each check is written. The reading of `observed` and `uses` is not (entry FA9).
- **ER9, open.** The two rules wait. One more thing stands against `receipt` (entry FA6).
- **ER10, confirmed.** Nothing changed in the source. Case d is witnessed with free room: written, `refused`, `reserved`, and the mark not set.
- **ER13, closed, on revision 26.** The two names and the two fields are built. The other four places are confirmed as built.
- **EX8, closed.** The rule for a further attempt of a push is given the state and reads `aborting`.
- **EY2, answered.** No rule of this package returns a request from `derives`: each kind that sends has the send mark `publication-update`. The line of `derive/src/outcomes.ts` that still lets a kind with no send mark return requests is left, because no kind needs it and none uses it. The builder may remove it.
- **EY4, built for the destination.** `revoke` states the body of an outcome that is not known, from the context of its request, and checks every body against the same function. `push` states `{ send: "unknown", seen: "failed" }` (entry FA7).
- **EM3 and EU4, still owed.** What now waits on them: the rule `judge`, and the key behind a publication, which `abort-if-behind` reads from the `observed` of the reservation entry.

| # | Where the texts differ or are silent | Implemented | Owner, and the question |
|---|---|---|---|
| FA1 | Revision 26 was approved and not adopted when this was built. | Built on it, with each rule in its own commit. The header of `platform/src/destination.ts` says so. | The builder: file after the adoption, with whatever it changes. |
| FA2 | Section 12.1.5, "The send waits for the mint". The ledger's `OperationRules` has `ready`, which the driver asks before it marks an attempt as sent. A platform rule of an outcome had no such member. | `OutcomeRule.ready`, passed through by `ownersOf`. It reads the folded state alone. For a push: the mint of that attempt has an outcome, of any result. Where the mint is `refused` or not known, the port has no token and answers `refused`, `not-sent`. | The builder, to confirm. The port is not built. |
| FA3 | An outcome entry is never refused for room, so the ledger refuses an outcome whose openings reserve more than the `closure` that its owner declares for the kind. `closure` is one number for a kind, and the count is taken again for each operation that is opened. The kinds of the destination open each other in a circle: a `judge` opens a push, whose outcome opens the next `judge`; a `read` opens a receipt, whose outcome opens a `read`. No finite number is the closure of one, so every such outcome would be left not written. The note reserves by another duty: a publication reserves 4 entries when it is `queued` and 68 when it is `reserved` (section 5.8, the two rows of the destination). | `OperationRules.covered` and `OutcomeRule.covered`: the operations that an outcome of the kind opens are reserved by another duty, and the ledger makes no closure check for it. `mint`, `push`, `deciding-read`, `adopt-read` and `judge` state it. **The count by the publication is not built.** A destination reserves, for each open operation, its own outcome entries and nothing for what they open. So a destination could pass its budget of entries by the operations that outcomes open. Witness: control 13, which removes the exemption, leaves the outcome of `judge` not written. | The builder, with request `cc570904`: the reservation of the two rows of section 5.8, counted from the folded state. Until then the exemption is weaker than the note. No scope runs under the version. |
| FA4 | Section 12.1.5: `branch.judging` is "set to the `queued` publication with the lowest item ID. That may be the one that the entry itself opens". The effects of a rule are checked against the state before the entry, which does not hold that item, so the reference was refused `bad-field`. | `derive/src/effects.ts`: a rule's value for a slot of the type `item` may be the entry's own position, when the item that the entry opens is of the slot's type. A written effect is checked as before. Witness: the `reserve` that opens `judge`; control 14. | The scope contract, to confirm that a reference may name the item that its own entry opens. |
| FA5 | Section 12.1.5, "What an operation is for": the push and receipt operations of a publication are read "in the folded state". The folded state gives an operation by its ID alone, and no slot lists a publication's operations. The note asks the proof plan for "a read of operations by kind". The token that `compromised` revokes is "the mint that the slot `token` named before the entry", and the entry holds only the emptying. | Two searches over this scope's own entries. `writesOf` reads from `reservedAt` to the entry that is written, and takes the operations of the reservation entry, of each `resend` on the publication, and of the entry that made it `published`. `mintRevoked` reads back from the entry of `compromised` to `reservedAt` for the last entry that set the slot. Each is as long as the publication's life in entries. As entry ER11. | The proof plan, with request `cc570904`: a read of operations by kind, or a slot. |
| FA6 | The contract's section 6.6: no effect changes an item that was final before the entry, and an act on a final item is refused `final`. `published` is a final state of `publication`. Section 12.1.5 has three things change a `published` publication, or act on it: the slot `token`, "for an attempt of its push or of its receipt"; the slot `receipt`, which becomes `written` or `conflict`; and `resend` on a `published` publication. It also says that the receipt of the first head changes no slot, so no slot names the token of its attempts. | A mint of a receipt's attempt is never live: its `confirmed` outcome opens the token's revocation at once. Where the first outcome of a push attempt comes for a publication that is already final, the revocation is opened and the slot is not emptied. No other entry opens one for that token. A `resend` on a `published` publication is refused `final`, before its guards: witnessed. `receipt: "owed"` is set in the entry that publishes, which is allowed. | The authority note, with the contract. Where do the receipt's records live, when the publication is final? |
| FA7 | The evidence of an `unknown` outcome of a write is `{ send: "unknown", seen }`, where `seen` is what the read back saw. The driver offers an `unknown` outcome when its port gives no answer, with the body that the owner's rule states from the scope's own records (entry EY4). A port's answer is `confirmed` or `refused` only, so a port that has a read back and no answer of the send cannot give it. Revision 26 records the duty: the driver must supply deterministic evidence of the request's context. | The rule `push` states `{ send: "unknown", seen: "failed" }`: the send is not known, and no read back is at hand. Nothing is then decided, and the deciding read follows. The pairing is built where a rule compares a body with its request: `revokedToken` gives the token ID of a revocation from this scope's own entries, and the evidence check, the body of an outcome that is not known, and a port all read it. | The builder: an answer of a port that is not known and still holds a body. |
| FA8 | "The send `publication-update`": the detail is `operation`, `outcome`, `commit`, `reason` and `rules`. Three things are not stated. The relationship state of the update. Which member holds `seen`, for the update `unknown`, "with `seen`". And where `rules`, "the revision of the rules that the destination observed for the reservation", is read after the reservation: no slot holds it. | The state is the publication's state, as the written update of a `withdraw` has it. `seen` is in no member, and is not sent. `rules` is read from the rules observation that the reservation entry retains, at `reservedAt`, and is left out where the entry retains none. The pinned `change` lane has no field `rules` in its handler, so an update with it would be refused there: the lane rows of the lane forms' section 18.4 are owed with it. | The authority note, for the first two. I3, with the lane forms, for the lane rows. |
| FA9 | "The evidence of `judge`, and what the rule reads": the rule reads `observed`, and the entries in `uses` "each by its bytes". The judge of an outcome gives a rule neither (entries EM3 and EU4). And the note names no member of a lane's entry: which field of a `propose-manifest` intent is the base, how the authors of section 3.10 and the completeness of R2's section 5.2 are read. The evidence also names no commit: the rule trusts that the runtime read the manifest's integration commit. | `judgeReservation`, in `platform/src/reservation.ts`: the judgment of every check from one explicit input, `ReservationRead`, which is what the two would say. The rule `judge` takes a reader of it. **The package's own rule is given none.** It judges what the evidence and this scope's own records decide: a publication that is no longer `queued`, `evidence-too-large`, a head that is not the recorded head, and an integration commit that is not in the repository. For any other outcome it has a fault: nothing is written and the publication stays `queued`. Four inputs that no form supplies are filled with the value that fails closed: `extents`, null; `singleControllerException`, false; `controllers`, null (form 11); `controllersOfAuthors`, null (form 15), under which no review counts where the second point of independence is asked. | The builder, for `observed` and `uses` in the judge of an outcome. The authority note, with R2, for how each fact is read from a lane's entry. |
| FA10 | Section 6.5, the first table. Five places where it does not say which reason, or what follows. | (1) The head just read is not the recorded head: `out-of-date`. The row says "or section 6.9 when the two differ", and section 6.9 states no outcome for a publication that is not reserved. (2) Within the fourth row, `evidence-invalid` is said before `rules-not-met`. (3) An approval by a key that is compromised, or that is not observed, is not counted. A verdict whose entry is not what the statement says is `evidence-invalid`. (4) With extents, a live request for changes, and a path that no extent holds, are `rules-not-met`, alone. (5) A review counts for the extent that it states: `judgeExtents` is called once for each touched extent, with the reviews that state it, so that file is not changed. | The authority note, to confirm each. |
| FA11 | "`most`": "the largest is the outcome of `judge` that reserves: 10 effects". By the same table the first outcome of a push attempt that publishes holds more: the revocation and the emptied slot, four effects of `published`, the receipt and its mint, and the next `judge` with `judging`. That is 14. The note also says that the counts beyond the three that it states are owed before each rule is built. | Each rule states what the table gives: `judge` 10, `push` 14, `deciding-read` 11, `adopt-read` 5, `mint` 2, `revoke` 0; `open-judge` 3, `declare-first-head` 2, `open-first-head` 4. | The authority note: the counts, and the sentence on the largest. |
| FA12 | The row `adopt-read`: "`seen` is that commit: `branch.head` is the commit". The act is admitted only while no publication holds the slot. Its read is answered later, and a `judge` may reserve in between. | Where a publication holds the slot when the read is answered, the outcome changes nothing. Witnessed. | The authority note. Is that the wanted order? |
| FA13 | "What `seen` decides", the last row: after a commit of another writer, "an admin's `resend` or `adopt-head` is the way forward". `resend-due` holds only when "every attempt that each of its push operations states is opened and has an outcome". After another writer's commit the ledger opens no further attempt, so two of three are never opened. | As the row of `resend-due` states. So a `resend` is not due there, and `adopt-head` is the one way forward. Witnessed. An outcome of a push whose `seen` is `absent` is taken as that last row too. | The authority note. Is a `resend` due when no further attempt can be opened? |
| FA14 | "The deciding read", and its row. | A read is opened by an outcome of a push only where no attempt of that push is open after the entry. No count is kept of the reads of one publication, so a late answer after the last attempt opens another. Each yields nothing once the publication is final. The rule's evidence check reads the state: a `seen` that is the base, while not every attempt is refused, does not follow. The read of a first head, and of a receipt's ref, is not judged: it waits with `first-head` and `receipt`. The send mark stands at `mint`, `revoke` and `receipt`, as row n lists them, and its rule gives no request there. | The authority note, to confirm. |
| FA15 | The witnesses of this work run in memory. | `destination.test.ts` uses three labelled stand-ins beside the bureau and the lane: the rules `first-head` and `receipt`; the reader of a reservation; and the `observed` of the reservation entry, which the test seals by hand. Nothing ran on scope objects: the version is not runnable there. | The builder, at the merge with entries EM3 and EU4. |

**Controls.** One for each guard, through `scripts/control.mjs`, on
`packages/platform test/destination.test.ts`. 24 were run. Each
distinguishes: a test failed by an assertion with the one change
applied. Three were run a second time, after their witness was
strengthened or their text was corrected: 2, 3 and 24. Control 23
survived once, and distinguishes since the witness of an accepted send
was added.

**Lines for the merge.**

- `OutcomeRule` gains `ready` and `covered`, and `OperationRules` gains `covered`. A rule that states neither is unchanged.
- `derive/src/effects.ts`: one line in the check of a rule's effect (entry FA4).
- `platform/src/destination.ts` exports `destinationRulesWith`, `Reads` and `revokedToken`. `destinationRules` is `destinationRulesWith` with no reader. The package's index exports `revokedToken`, and the judgment and the types of the new file `reservation.ts`.
- `platform/src/reservation.ts` imports `classify`, `judgeExtents` and four constants from `extents.ts`, and changes nothing there. If `judgeExtents` comes to read a verdict's extent itself, the one call for each touched extent in `judgeReservation` stays right, and may become one call.
- `support-destination.ts`: `standInRules` holds two rules. `Branch` holds its own rules, with its reader, in place of the exported `rules`.
- `scope/test/founding-real.test.ts` names the two marks that lack rules. Marked `I3 merge:` there.
- Between the first commit of this work and the commit of its witnesses, `destination.test.ts` is stale. The commit of `abort-if-behind` holds one helper that nothing reads until the next commit, so the typecheck fails at that one commit.

**What was not run.** No deployment, no provider, no host, no gateway
and no Git command. The gate was not run.

## 30. The reservation by a publication, and what an outcome's rule reads

Written 2026-10-06, on `request/i3-m3`, by the worker of these two
parts. Entries have the prefix FC. The authority note is at revision 26
(`f7175296`), the scope contract at revision 19 (`1ca8a59bf`) and the
lane forms at revision 15. All three are adopted.

No entry that an earlier source wrote has other bytes. Neither lane
digest changes, and `packages/lanes` is not touched. No data of a
platform definition changes. Two things are new in what a scope may
write, and one in what it stores:

- An outcome entry, and the entry of a result's delivery, may now hold
  the member `observed`, written by the judge. It is the contract's
  form of revision 14 (section 4.1), and no judge wrote it before. It
  is written only where a rule read an observation, and no deployed
  rule can: nothing gives one at hand (entry FC6). An outcome entry may
  now name foreign entries in `uses`, where its judge was given some.
  An entry whose rules read nothing has the bytes it had: witnessed.
- The store has one more table, `retained_value`. It is made empty when
  an object starts, beside the tables that exist. No row of another
  table changes.

### 30.1 Part 1: the reservation by a publication is not built

**Reported first.** The adopted texts do not state enough to build it
whole, so it is not built, and nothing was invented in its place.
`covered` is kept as it was: an exemption. It is now counted and held.

What the note states, and is enough for a count: the two rows of the
destination in section 5.8, 4 entries while `queued` and 68 from the
reservation on, both reserved "when" the `reserve` is delivered, which
"is admitted only with the room of this row and the next"; that a
`reserve` to a full destination "waits", and transport answers "retry";
that what is not used is released.

What no adopted text states, each needed before a count can be held:

| # | Missing | Why the count cannot be built without it | Owner |
|---|---|---|---|
| 1 | How the amount is derived from the folded state. The contract's section 17.1 makes both amounts "functions of the folded state", with one exception for a request's origin entry. What a publication has left of its 68 depends on which of its operations are opened and answered. The folded state gives an operation by its ID, and no slot and no index lists a publication's operations (entry FA5). | Without it a publication's reservation cannot fall as its entries are written, and cannot be released when its last duty ends: the end of that duty is not readable from its item. A count that cannot be released would fill a destination. | The proof plan, with request `cc570904`: "a read of operations by kind, or a slot", as entry FA5 asks. |
| 2 | The form in which a platform definition declares a reservation of its own. The contract's section 17.5 leaves "the reservations of platform definitions" to the authority note, "in the same form". That note's row P11 says of the form: "No form says it." | `settles` is the one written form, and it reserves for an act that takes its subject out of the listed states in its own entry. A publication's entries are outcomes. | The capacity work under `cc570904`, with the authority note (row P11). |
| 3 | When a publication's last duty has ended, for one that is final. Its receipt's records are on an item that takes no effect (entry FA6), a mint that is answered late opens a revocation after the publication is final, and an attempt that is `unknown` keeps its operation unsettled (the contract's point R1-38). | The release. | The authority note, with the contract: entries FA6 and ER7. |
| 4 | The count of reads. The table reserves "1 entry for the read that decides". The rule as built opens a read after each outcome of a push that decides nothing while no attempt is open, and one more by `abort-if-behind` (entry FA14, which asks the note to confirm). The ledger also counts 2 entries for a `judge`, where the table counts 1. | The amount: the table is not an upper bound of what the built rules write. | The authority note: entry FA14. |
| 5 | What a `resend` reserves. It is new work, and section 5.8 has no row for it. Its push or receipt has one attempt, with a mint, a revocation and perhaps a read. | The amount for an act that the table does not name. | The authority note. |
| 6 | The rule `receipt`, whose 31 entries are nearly half of the 68. It is not written (entry ER9). | What draws on that part. | The authority note, with the contract: entry ER9. |

The contract's own rule points the same way: its validator refuses, as
`reserve-unbounded`, a definition in which "settling forms create each
other's pending states in a cycle" (section 17.2). The destination's
kinds do, by kind: a `judge` opens a push whose outcome opens the next
`judge`, and a `read` opens a receipt whose outcome opens a `read`. So
no closure by kind exists, and only a count by publication can be
finite.

**What is built instead: the number, held by a test.**

- `publicationRoom`, in `platform/src/destination.ts`, computes the two
  rows from the stated attempts, as section 5.8 counts them: 4 and 68.
- The one entry of a publication that is new work is the delivery of
  its `reserve`. The ledger asks it for the 2 outcome entries of the
  `judge` that it opens, of which the table counts 1, and for nothing
  that the outcome opens. So, by the note's own table, **one
  publication may write 71 entries that no admission reserved**, and 72
  where its `reserve` opened no `judge`. Each is written by an outcome
  entry, which is never asked whether it fits. That is beside what
  rows 4 and 5 above add, which the table does not count.
- `platform/test/definitions.test.ts` asserts the 4, the 68, the 73 of
  a new `reserve`, the 71, and that exactly five kinds of the
  destination state `covered` and no other definition's rule does. So
  neither the exemption nor the number grows unseen.
- `OperationRules.covered`, in `derive/src/ledger.ts`, says in capitals
  that it reserves nothing.

| # | Where the texts differ or are silent | Implemented | Owner, and the question |
|---|---|---|---|
| FC1 | The six rows above. | Not built. `covered` is an exemption, counted: 71 entries of each publication, by the note's table. No scope runs under `platform:destination@1`, which lacks two rules. | Request `cc570904`, with the authority note and the proof plan, for rows 1 to 3. The authority note for rows 4 to 6. Until then a destination must not be deployed with a budget that its publications could pass. |
| FC2 | The sweep of this family, below. Two findings are not a flag. | Not changed. | The builder, with `cc570904`. |

**The sweep: every place where a capacity check is not made, and what
stands behind it.** Read in `derive/src/reserve.ts`, `ledger.ts`,
`delivery.ts`, `handlers.ts`, and `scope/src/turn.ts`, `operations.ts`,
`outbox.ts`, `delivery.ts` and `core.ts`. No test of mine witnesses a
row but the first of `covered`.

| Where | What is not asked | By | What stands behind it |
|---|---|---|---|
| `fits`: a timed entry | Whether it fits | The input's type | Counted in `owed`: the chain of each live item in a timed state. A checked reservation. |
| `fits`: a diagnosis, and a result's delivery that is no `conflict` | Whether it fits | The input's type | Counted: 2 entries for each pending request, and the largest clause. An effect mark in a clause counts nothing there (entry EJ6; the contract's row on what a mark in a clause reserves, which is open). |
| `fits`: a delivery of a control | Whether it fits | The input's type | Counted: 1 entry for a provisional scope. The attempt 1 that it opens for each held operation was counted from the genesis. |
| `fits`: an outcome | Whether it fits | The input's type | Its own entry is counted with its operation. What it opens: the closure that its owner declares, checked in `outcomeOf`; or `covered`, which checks nothing (entry FC1). |
| `fits`: the judge's `settles` | Whether it fits | A flag of the draft | Derived, and counted: the form declares `settles`, its subject was in a listed state and leaves them; or a pending record of `hold@1` binds the request, and `Owners.reserves` counts that record. A checked reservation. |
| **A request that an outcome entry sends** | Its 2 entries, and what its clause starts | Nothing: no check exists | **Not reserved by anyone.** `closure` counts the operations that an outcome opens, and no request. The pending request is counted only from the entry that sent it, which was not asked. This holds for the register's `create` of the directory, which section 5.8 puts in the claim's row, and for the three updates of a publication, which are inside the 71. |
| **The rows of section 5.8 for membership, the register and the directory** | What an active key, an active member, an unused invitation and a claim reserve | Nothing: no form | **Not reserved.** No platform data declares `settles`, and `ownersOf` passes a capability's `reserves` only. It is row 2 of the table above, for every platform definition. |
| The driver, the outbox, a delivery and a checkpoint, at `scopeEntries` | Nothing is exempt | A floor | An entry that settles is not written at the last position either. It is a stop, and no exemption. |

### 30.2 Part 2: what an outcome's rule reads, and a value beside an intent

**What is built.**

| Part | Built | From | Witness |
|---|---|---|---|
| The judge of an outcome | It takes `observed` and `facts`. Each rule of the outcome is given both, as items 2 and 4 of what a rule is given. The entry's input holds each observation that a rule read, in the order of `read.n`, and no member when none was read. Its `uses` names each foreign entry at hand. It is not written clamped when it retains an observation. | The contract's sections 4.1, 6.1 and 16.1 | `derive/test/forms-marks.test.ts`, the test of an outcome's rule and of a result's clause |
| The judge of a result's delivery | It takes `observed`, the rule of the clause that runs reads it, and the entry holds what was read. | The same | The same test |
| The replay of both | Each record of `observed` is derived again: guards 1 and 3 to 6, the runs, and the value. The judge is given the recorded observations and the retained copy of each entry in `uses`. | Section 16.1, "Replay" | `replay/test/verify.test.ts`, the test of an outcome's observations. The branch for a result's delivery has no replay witness: entry FC8. |
| The rules reference | A version may state where its scopes record it: `Platform.rulesScope` and `Coded.rulesScope`. The destination states `branch.rules`, with the incarnation of its retained observations. | The authority note's section 12.1, the table of where the destination records its references | The same replay test, on made-up data |
| The destination's rule `judge` | It reads its observations itself, through the judge: the key that signed the `merge` entry in `uses`, the rules, the key behind each approval, and the key behind the result of each required check. | Section 12.1.5, the table "The rule reads" | `platform/test/destination.test.ts` |
| A value beside an intent | The scope reads `values` before the turn, for the places that its pinned data states and the intent sets. It keeps each value that the entry names under its domain and its digest. The acts route passes `values`. | The contract's section 6.2, "What the member bounds, before the turn"; section 9.2; rows I3-32 and I3-33 | `scope/test/values.test.ts`, on real storage, with made-up platform data |

**What it buys, in the witnesses in memory.** `Branch` of test support
gives the judge of the outcome what is at hand, as a runtime would. The
reservation entry's `observed` is the judge's, and no test seals one by
hand. `abort-if-behind` finds the merger's key in it. The update's
`rules` is read from it. One stand-in of entry FA15 is gone, and one is
narrower.

**What is not built, exactly.**

- No runtime reads an observation before the turn of an outcome, of a
  result's delivery or, beyond the signer's own, of an act: entry FC6.
  So in a deployed scope the rule `judge` still writes only what the
  evidence and the scope's own records decide.
- The package has no reader of a lane's entries: entry FC5.
- No route reads a value, and the replay's HTTP source asks for none:
  entry FC7.
- No data of the platform package states a place, so no real act of
  Artroom reads a value yet: entry EX5 stands.

**The fills that remain in the destination's `judge`.** Each fails
closed, and each is exactly one missing form.

| Input of the judgment | Filled with | The missing form | Owner |
|---|---|---|---|
| `extents` | Null: the rules hold no extent, so no extent is judged from an observation | The member `extents` of a `RulesContent`: the contract's part of form 2 (entry FB2) | The contract |
| `controllers` | Null: no exception is judged | Form 11, the count of the holders of `rules.publish` | The authority note, with the contract |
| `controllersOfAuthors` | Null: the exception is not shown by its second clause, and where `ownerMayReview` is false no review counts | Form 15, the observation of an author | The authority note, with R2 |

`singleControllerException` is no longer a fill: the rule reads it from
the observed rules (form 14, given). It decides nothing while `extents`
is null. The changed set of form 1 is no fill of the rule: it is the
member `changes` of the evidence, which no port produces yet. Beside
the three fills, the manifest, the soundness of each verdict and the
two entries of each check are read by the stand-in reader of a lane's
entries, and by nothing in production (entry FC5).

**How far a founding runs.** As far as before: steps 1 to 6 of section
26, on real scope objects. The creation of the destination is answered
`retry`, `unsupported-definition`, because `platform:destination@1`
lacks the rules `first-head` and `receipt`. Nothing of this section
moves that stop. `scope/test/founding-real.test.ts` says what would
still stand between a destination that exists and a reservation.

**Every judge, against what a rule may read and what the entry
retains.** Read in `derive/src/judge.ts`, `genesis.ts`, `delivery.ts`,
`handlers.ts`, `settle.ts`, `outcomes.ts`, `prepare.ts` and
`replay/src/verify.ts`.

| Judge | Runs platform rules | Passes `observed` | Passes `values` | Retains what was read | A replay derives it | A runtime supplies it |
|---|---|---|---|---|---|---|
| Act | Yes | Yes | Yes | `observed` in the input; the values in the draft, for the scope | Yes: the guards, the window of the act's grant, the value; each placed value | `values`: yes, from this section. `observed`: no (entry FC6) |
| Outcome | Yes | Yes, from this section | No: none travels beside an outcome | `observed` in the input; `uses` | Yes, from this section: the ten-second window | No (entry FC6) |
| Delivery of a result | Yes, in the clause | Yes, from this section | No | `observed` in the input | Yes, in source; not witnessed (entry FC8) | No |
| Delivery of a request or an advisory | Yes, in the handler | No: the input may hold none (section 4.1). A rule that reads one is given none. | No: no value travels beside a message | Nothing | The bytes guard refuses such an entry | Nothing to supply |
| Delivery of a control | No | No | No | Nothing | Nothing | Nothing |
| Diagnosis | Yes, in the `undelivered` clause | No: the input may hold none | No | Nothing | Nothing | Nothing |
| Genesis | Yes | No: the input may hold none | No: a founding takes texts only | Nothing | Nothing | Nothing |
| Preparation | No: a step is a capability's code | No. Its grant holds the one observation. | No | The grant | Yes, as before | The signer's read, as before |
| Timed | No: the validator takes no mark in a timed rule | No | No | Nothing | Nothing | Nothing |
| Checkpoint, settlement | No | No | No | Nothing | Nothing | Nothing |

**Earlier entries that this work answers.** Each line is dated
2026-10-06. The earlier sections stay as they were written.

- **FA3, still open, and now counted.** The reservation by a publication is not built: entry FC1 says what no text states. The exemption is held to 71 entries of the note's table by a test.
- **FA9, built for the builder's half.** The judge of an outcome gives a rule `observed` and the entries in `uses`, and writes both. The rule `judge` reads its observations itself. The other half stands: how an entry of a lane is read by its bytes (entry FC5).
- **FA15, answered in part.** The `observed` of the reservation entry is the judge's. The reader that a test writes is of a lane's entries alone. The rules `first-head` and `receipt` are still stand-ins, and nothing ran on scope objects.
- **EM3, closed for derive; the runtime half is entry FC6.** The judges of an outcome and of a result's delivery build what is at hand and write `observed`. The scope reads `values` and keeps them. The scope makes no further read of an observation.
- **EM2, unchanged.** The form is still open, as the contract's point R1-67. Entry FC6 says what waits on it.
- **EU4, closed for the window of an outcome and of a result's delivery.** Entry FC4 states the rule taken from the texts. The form of EM2 is still asked.
- **EU5, closed for the destination.** Its version states where it records its rules reference. For any other version an observation of the rules is still `unsupported-definition`.
- **EM26, closed for `observed` outside an act.** The same checks are made for an outcome and for a result's delivery.
- **EX6, built in part.** The read before the turn and the table for values are built. The read route and the HTTP source are not: entry FC7.
- **EZ11, updated.** The scope stores a value, in a table of its own. The read route still serves five kinds.
- **EQ9, updated.** A rules scope's three marked acts are still not completed or refused on a real scope: no data of `platform:rules@1` states a place, and no observation is read.

| # | Where the texts differ or are silent | Implemented | Owner, and the question |
|---|---|---|---|
| FC3 | What the `uses` of an outcome holds. Section 17.2 says "An outcome retains what its owner declares", and no form lets an owner declare a foreign entry. For an act the entry names every foreign entry that a declared field names, read or not. An outcome has no field. | The judge names every foreign entry that it was given, in the order given, and a rule is given each. More than the bound on the foreign entries of one entry leaves the outcome not written. A replay gives the judge the retained copy of each entry that the recorded `uses` name, so it cannot tell an entry that no rule read from one that a rule read. For `observed` it can, and does. | The contract. Does an outcome's `uses` hold exactly the entries that its rules read, as `observed` does, or those that its owner declares, and by which form? |
| FC4 | The window of a record of `observed` in an outcome and in a result's delivery (entry EU4). No form states it (point R1-67). The authority note's section 3.3 states windows in a table of entries. | Ten seconds, and `fresh`, for both: `WINDOWS.once`. The reason: both rows of that table that are of such an entry state it, "10 seconds (W3), each. `fresh`." for the outcome of `judge` and for the delivery of a license result, and the contract's own table of section 16.1 states the same of both. A replay judges guard 3 and guard 5 so. The value of an observation of the rules needs the rules scope's answer to a read, which no version has (entry FB10): with an anchor for that head it is taken on trust, and without one the replay ends `unsupported-definition`. | The contract, with the authority note: the form of R1-67. Until it exists, a later row with another window would be judged wrongly here. |
| FC5 | Section 12.1.5, "The rule reads": the entries in `uses`, "each by its bytes", for "the manifest's entry, each verdict's entry, and the opening and the deciding entry of each required check". It names no member of a lane's entry. It also says of the three lists that "nothing in the three lists is a fact that the destination fetches", while section 6.5 counts "each verdict's entry, and two entries for each required check" among what one reservation fetches, and the source's `collect-list` takes `review`, `job`, `decidedBy` and `link` as facts. | The rule reads the signer of the `merge` entry itself: the entry that `publication.operation` names, whose input is an act. Everything else of a lane's entries comes from a reader, `LaneRead`, which the package does not write: the manifest's base, integration commit, tree, reports, authors and completeness; whether each verdict's entry is that verdict, and which key signed it; and what the two entries of each check show. A key is read only for an approval and for a required check. | The authority note, with R2. Which member of which entry holds each fact? Is a verdict's entry the entry that the fact in `review` names, and is it fetched at the reservation? |
| FC6 | Section 16.1: the scope reads each observation "before its turn", for "the entries that its specification names". The subjects are not operands: "The reservation reads each key behind a counted verdict", which an entry in `uses` gives. The contract leaves the form open (point R1-67): a member of the row, "one more place, for a rule that names the subjects before the turn", or prose alone. | Not built in `scope/src`. `Operations` gives the judge of an outcome no `observed` and no `facts`, and `Scope.submit` gives the judge of an act no `observed`. Each is marked `I3 merge:`. A rule that needs one has a fault or is not completed, which fails closed. Nothing was invented: any reader here would be the undecided place. | The contract, with the authority note: point R1-67. The builder, after it: the read, its numbers in the run, the six guards before the judge, and the answer of a rules scope (entries FB10 and EQ8). |
| FC7 | Entry EX6. The contract says that a read of one value "asks by the kind, the domain and the digest", and states no form of the route for a domain. No row of the authority note states a field with `value`. | Built: `valuesBeside` and `valuesOf` in `scope/src/core.ts`, the table `retained_value`, and `values` on the acts route. At most as many values are read as the intent sets places, in the order given, and none past the largest `max` among them. A value in the domain of a definition is kept as a `definition`. Not built: the read route, and the replay's HTTP source, so a replay over HTTP of an entry that names a value is still `incomplete`. Not counted: the bytes of a value against a budget, which no source counts (the contract's section 17.5). | The contract, for the route's form. The authority note, for the fields. `cc570904`, for the bytes. |
| FC8 | A result's delivery that retains an observation. The one row that needs it is the task scope's license result, which is IA's. | Built in derive and in the replay, with the ten-second window. Witnessed in derive. The replay's branch has no witness: no fixture history holds such a delivery, and one was not built for a row that no delivered definition has. | The builder, with the first definition that has such a row. |

**Controls.** One for each new guard, through `scripts/control.mjs`.
18 were run, and each distinguishes: a test failed by an assertion with
the one change applied.

| # | The change | Witness |
|---|---|---|
| 1 | `covered: true` on the rule `revoke` | `platform test/definitions.test.ts` |
| 2 | The read of the receipt left out of the 68 | The same |
| 3 | The outcome's input without `observed` | `derive test/forms-marks.test.ts` |
| 4 | The outcome's `uses` empty | The same |
| 5 | An outcome that retains an observation written clamped | The same |
| 6 | A rule of an outcome given nothing at hand | The same |
| 7 | A result's delivery without `observed` | The same |
| 8 | A result's delivery that retains one written clamped | The same |
| 9 | The replay without the guards of an outcome's `observed` | `replay test/verify.test.ts` |
| 10 | The replay's judge given no `observed` | The same |
| 11 | Guard 1 of an observation of the rules | The same |
| 12 | The incarnation fixed by the entry's own observation | The same |
| 13 | `controllersOfAuthors` as an empty list | `platform test/destination.test.ts` |
| 14 | No key read for an approval | The same |
| 15 | No observation of the merger | The same |
| 16 | The judge of an act given no `values` | `scope test/values.test.ts` |
| 17 | The value not kept | The same |
| 18 | No bound on how many values are read | The same |

**Lines for the merge.**

- `OutcomeContext` gains `observed` and `facts`, and `DeliveryContext` gains `observed`. `runClause` has one more optional argument. A caller that gives none is unchanged.
- `platform/src/destination.ts`: `Reads` now returns a `LaneRead`, and the rule builds the `ReservationRead`. `publicationRoom` is new. The index exports `publicationRoom` and the type `LaneRead`.
- `Platform` and the replay's `Coded` gain `rulesScope`. `platform("platform:destination@1")` states it.
- `Store.retained` and `Store.retainedSize` take an optional `domain`. `SqliteStore` has the table `retained_value`.
- `support-destination.ts`: `Branch.read` is a `Hand`, and `Branch.outcome` and `answered` take no `observed`.
- Marked `I3 merge:`: `scope/src/operations.ts`, at the call of `settleOutcome`; `scope/src/core.ts`, in `submit`; `derive/src/marks.ts`, at `AtHand`; `derive/src/ledger.ts`, at `covered`; `platform/src/destination.ts`, at `NOT_AT_HAND`.

**What was not run.** No deployment, no provider, no host, no gateway
and no Git command. The gate was not run.

## 31. Review finding e2d4e074: the value of an observation is derived once, and a sweep of the replay's repeated work

Written 2026-10-06, on `request/i3-m3`, by the worker of this finding.
Entries have the prefix FD. The disposition is the planner's, in event
`752a2725`: derive each historical observation value once, by the exact
source scope, incarnation, head, definition and subject, or by an
equivalent bounded strategy, and keep every check and every valid
history.

No entry has other bytes. No history that was valid has another answer,
and a history that was a mismatch is the same mismatch at the same
entry: the order of the checks is as it was. Neither lane digest
changes, and no data of a platform definition changes. The branch was
brought up to `origin/main` first (`48a2b2851`, the landing of the
second milestone): the merge changed no file, because the branch held
that milestone's tree already.

### 31.1 The finding, against the source

The source agrees with the finding. `#viewAt` of `replay/src/verify.ts`
kept one folded state for a source, and began again from the genesis
whenever an observation named a lower head than the last one. Two
admins who publish in turn, one on a cached observation of head L and
one on a cached observation of head H, are legal: guard 7 of an
observation holds the head of each key and member, and not of the
scope. So each pair cost L + 1 fold applications and then H - L more.
The value was also answered again for each grant, though a reused read
has the bytes of the one before it.

### 31.2 What changed

| # | What | Where |
|---|---|---|
| FD1 | The value that a source's history gives is derived once for each source scope, incarnation, head (position and hash), definition and subject, and kept. The head is proved for every entry, as before. Every retained observation is compared with the value, whether it was derived for that entry or for an earlier one: what is kept is what the history gives, and never that an entry agreed. An observation that a membership scope retains of itself is answered from the state that the replay holds, with no fold, as before: each entry names another head. | `Verifier.#standing`, `#values` |
| FD2 | Each entry of a source is folded once into a view of that scope, in order, as far as the highest head that an observation names. The view keeps a log: every write of the fold, by record, with the position of the entry that made it. The state at the head folded last is the view. The state at an earlier head is built from the log, as the last write of each record at or before that head, and the state built last is kept. The disposition says to keep the states at the heads that the history names. A copy of a state for each named head costs a copy of the source's state for each, and a head may be named for the first time after the fold has passed it, so the log is kept instead: it is the equivalent bounded strategy, and it serves any head in any order. | `replay/src/view.ts`, `Verifier.#viewAt` |
| FD3 | The run of a retained observation is looked up in a set, once for each observation that is not of the run of the entry before it. The earlier code searched a list of every run. | `Verifier.#inRun` |
| FD4 | The texts that a scope owes are kept by digest, each with the first entry that names it, in the order of the history. A tombstone looks up each text that it lists. The earlier code searched the list of every owed text for each `redact` effect, twice. | `Run.owed`, `Verifier.#replay` |
| FD5 | The state in memory keeps, for each observed scope ID, the incarnations of the heads that it holds. A rules scope and a destination read them for each entry that is judged on a grant. The earlier code read every observed head. | `MemoryState.incarnations` |
| FD6 | The state in memory keeps the number of copies of each relationship name and kind of owner. The first update for each key reads it. The earlier code read every copy. A count by state, which only the reserve asks, still reads every copy. | `MemoryState.copies` |

`verify` takes an optional third argument, a `Tally`, and `MemoryState`
an optional tally. Each counts steps for a test, as `matches` and
`classify` of the platform package do. No test times anything.

### 31.3 The counts on the witness history

The history is of the platform package's own membership and rules
definitions, written by derive's judges: a membership scope with two
admins, whose head is 5 (L) when the second has joined and 45 (H) after
40 more entries; and a rules scope with 41 acts `publish`, 20 by each
admin in turn on a cached read of H and of L, and one more on a new
read of H. The office, the registrar and the reads are stand-ins of the
platform package's test support: no scope read membership, and each
observation is membership's own answer from its state at the head
named.

| | Fold applications for the source | Values answered | How taken |
|---|---|---|---|
| The earlier code | 966 | 41 | Observed, with a counter at each of the two places in the code of `441727709`, in one run of the witness history. The counter was not committed. |
| This code | 46 | 2 | Observed, by the tally, in the witness. One state was built from the log. |

The witness asserts that the folds are at most the entries of the
source, 46, and the values at most the distinct heads and keys that the
grants name, 2, and states both counts. The answer for the history, and
the mismatch for the same history changed at one entry, are those that
the earlier code gave, taken from it before the change.

For entry FD3, on 40 acts each on a read of a run of its own: 40
lookups for the rules scope, where the earlier code made 780
comparisons (observed, with a counter, in the same way). For FD4, FD5
and FD6 the earlier count is by reading the code: 930 comparisons for
30 owed texts and their one tombstone, now 30 lookups; 1,000 heads read
for one answer, now 3 steps; 1,000 copies read for one count, now 1
step.

### 31.4 The sweep: work for one replayed entry that grows with a history

By reading `replay/src` and `derive/src`, at this head. N is the number
of entries of a history. "Changed" names the entry above. Every other
row is recorded and not changed, with its owner. The worst count is by
reading, and none was run.

| # | The loop | Its bound | Worst count over N entries | Changed, or the owner |
|---|---|---|---|---|
| 1 | `verify.ts`, `#viewAt`: the fold of a source for a head | Was: the head's position, for each head lower than the last. Now: each entry of the source once. | Was N times the source's length. Now the source's length. | Changed: FD2 |
| 2 | `verify.ts`, `#standing`: the answer of the source's definition | Was: one for each retained observation. Now: one for each distinct key of FD1. | One answer for each distinct key. | Changed: FD1 |
| 3 | The answer itself, `standingOf` of the platform package: it reads every key item, or every member item, of the source's state | The items of the type that the source holds, retained final ones too | Distinct keys times the source's items | Entry EM12: the proof plan, with request `cc570904`. A bound, or an index of key items by `id`. |
| 4 | `view.ts`, `View.at`: a state built from the log, for a head before the one folded last | The records that the fold wrote. One build for each run of questions about one earlier head. | Distinct keys times the source's records, when new keys alternate among earlier heads. Of the order of row 3, which each such key pays in any case. | The builder, with row 3: an index for the answer would let it read the log directly. |
| 5 | `verify.ts`, `#inRun`: the run among the runs seen | Was: the runs so far. Now: one lookup. | Was N squared over 2. Now N. | Changed: FD3 |
| 6 | `verify.ts`, the tombstone of owed texts | Was: the owed texts, for each `redact` effect. Now: the texts that the effect lists. | Was the square of the texts. Now the texts listed. | Changed: FD4 |
| 7 | `verify.ts`, `#prove`: the caller's anchors, searched for each distinct fact | The anchors that the caller gave | Distinct facts times anchors. No history sets the number of anchors. | The builder, when a limit on anchors is stated: an index by scope, position and hash. |
| 8 | `source.ts`, `MemorySource.retained`: a search of one scope's retained inputs | The retained inputs that the caller holds for the scope | Reads times retained inputs, for a source in memory. The HTTP source searches nothing. | The builder. It is the source of tests and of a caller that holds the histories. |
| 9 | `verify.ts`: the copies of used entries against the foreign facts of one entry | 128 foreign entries for one entry (`usesPerEntry`) | N times a constant | None needed. |
| 10 | `state.ts`, `MemoryState.incarnations`, read through `rulesMembership`, `destinationMembership` and `destinationRulesScope` for each act and preparation | Was: every observed head. Now: the incarnations of one scope ID, which a valid history holds one of. | Was N times the subjects observed. Now N. | Changed: FD5 |
| 11 | `state.ts`, `MemoryState.copies`, at `delivery.ts`, the first update for a key | Was: every copy. Now: one number. | Was N times the copies kept. Now N. | Changed: FD6 |
| 12 | `timed.ts`, `nextDue`: the live items of each timed rule's type. The replay asks before every entry that is not timed, and each judge asks once more. | Eight timed rules times the type's `max`. The validator states no upper limit on `max`. | N times `max` | The proof plan, with request `cc570904`: a limit on `max`, or an index by deadline, which the runtime's commit would use too. |
| 13 | `hold.ts`, `endsUnder`, and `capability/hold.ts`, `heldUnder`: the live holds of each hold type | The type's `max` | N times `max` | As row 12. |
| 14 | `lists.ts`, `scan`: the items that a range guard covers | For an entry that a runtime wrote: 1,000 items (`guardScan`), because the same scan finished there. The replay sets no limit (section 9.3), so for a history that no runtime wrote: the items of the type. | N times 1,000 for a valid history. N times the items for one that is not. | The contract's section 9.3, with the proof plan: whether a replay may stop at the bound and report. |
| 15 | `state.ts`, `MemoryState.records` and `recordCount`: every capability record is sorted for each read. The code of `hold@1` and `git-read@1` reads them at a step, at an outcome and at a `hold` effect that ends or changes a hold. | The records that the scope holds, which no text bounds | N times the records, times a logarithm | Entry EF6: request `cc570904`, the proof plan. An index by kind would leave the read of one kind unbounded, so nothing was changed here. |
| 16 | `fold.ts`, the texts that a detached-text slot has held: searched and copied for each `value` effect on the slot | The texts held and not redacted. No text bounds them. | The square of the writes to one slot | The contract, with the proof plan: a bound on the texts that a slot holds before a redaction. The fold is the runtime's too. |
| 17 | `attribution.ts`, the attribution history of an item: copied and searched for each effect that adds to it | The members of the history. No text bounds them. | N times the members | As row 16: a bound on an item's attribution history. |
| 18 | `state.ts`, `MemoryState.putItem`: the index of a type and state is an array, and an item that changes state is moved in it | The items in that state | N times the items, as moved array elements | The builder: measure before a change. |
| 19 | `settle.ts`, `judgeCheckpoint`: the digest of the whole folded state | The state | Checkpoints times the state | The contract (a checkpoint carries the digest of the state), with the proof plan. |
| 20 | `directory.ts`, `rowOf`, and `destination.ts`, `publications`: a search of every item of a type by a value | The items of the type | N times the items | Entries EP10 and ER11. They are the platform package's, and are listed because a judge runs them. |

Not on a replay's path, by reading: `MemoryState.outstanding` and a
count of copies by state, which only `fits` asks, and a replay does not
ask it; `MemoryState.preparations`, which only a read asks.

### 31.5 What a replay now keeps

| Record | How many | Its size |
|---|---|---|
| A value, in `#values` | One for each distinct key of FD1: at most the observations that the checked entries retain | The answer of the source's definition: an observation without `at` |
| A write, in a view's log | One for each write of the fold, for each entry of a source up to the highest head that an observation names. Only a scope that another scope observes has a view. | A reference to the record that the fold wrote. The checked entries were already kept whole. |
| A built state, in a view | One for each view: the one built last | The records of the source at that head |
| A run, in `Run.runs` | One for each run that an entry names, as before | Its name |
| An owed text, in `Run.owed` | One for each distinct owed text, where the list held one for each naming | A digest and a fact reference |
| An incarnation list and a copy count, in `MemoryState` | One for each observed scope ID, and one for each relationship name and kind of owner | A short list, and a number |

All are within the replay's limit on entries and on bytes read. None is
written anywhere.

### 31.6 Witnesses and controls

- `replay test/verify.test.ts`: the alternating history, with the earlier code's answer and the counts; the same history changed at one entry whose head and key are already derived; 40 runs; a view against a fold from the genesis, at every head of seven histories, asked from the last head down; and 30 owed texts with one tombstone.
- `derive test/forms-grant.test.ts`, for FD5, and `derive test/forms-handlers.test.ts`, for FD6.
- Every earlier case of the replay package passes unchanged.

Five controls, through `scripts/control.mjs`. Each distinguishes: a
test failed by an assertion with the one change applied.

| # | The change | The witness that failed |
|---|---|---|
| 1 | A kept value is never found, so each grant derives its own | The alternating history: 41 values where at most 2 are allowed |
| 2 | An entry whose value is already kept is not compared | The changed history: `consistent` where the earlier code said `mismatch` at entry 42 |
| 3 | A view reads the last write before the head, and not at it | The view against the fold, and both histories |
| 4 | An incarnation is noted only for the first head of a scope ID | `forms-grant.test.ts` |
| 5 | A copy is counted at each update, and not once for a key | `forms-handlers.test.ts` |

### 31.7 Lines for the merge

- `verify(source, options, tally?)`, and the type `Tally`. A caller that gives none is unchanged.
- `MemoryState` takes an optional tally. `View`, of the replay package, extends it and is not exported from the package's index.
- `Rulebook`, of the platform package's test support, takes the membership scope ID as an optional second argument. `histories` of the replay's `test/world.ts` is exported.
- `Run.owed` is a map, `Run.runs` a set with the last run, and `Run.viewed` a `View`.

**Documents.** No sentence of `docs/` or of a package README says that
the second milestone is not landed or is under review, so none was
changed. `packages/replay/README.md` says what FD1 and FD2 do.

**What was run.** The replay, derive and platform projects while
working; every workspace's typecheck; `git diff --check`;
`scripts/active-source.test.mjs`; and the root vitest run once, at
`f9a5ae91c`: 69 files and 537 tests passed in 9.9 seconds elapsed and
25.5 CPU seconds, one observed run, on an Apple M5 Max with 18 cores, a
load average of 4 from other sessions, and warm caches. The gate was
not run. No deployment, no provider, no host and no gateway.
