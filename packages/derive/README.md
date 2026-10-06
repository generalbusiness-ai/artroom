# @generalbusiness/artroom-derive

Derivation for an Artroom scope: the definition validator, the state that
entries fold into, the fold, and the judges. Everything in the main entry is
a pure, synchronous function. Nothing reads a clock, storage or a random
source.

The scope runtime calls these inside one storage transaction. A verifier
calls the same functions over a state it folds in memory. So what the
runtime writes and what a verifier derives cannot drift apart.

The scope and replay contract is the authority. Comments cite its sections.
Where the contract was silent, `notes/2026-10-04-i1-contract-deltas.md`
and `notes/2026-10-05-i2-contract-deltas.md` record what was implemented.

The package has two entry points:

- `@generalbusiness/artroom-derive`: everything below but the evaluator.
- `@generalbusiness/artroom-derive/rule`: the evaluator of `rule` guards. It
  is asynchronous and loads the JSONata engine, so it runs in preparation,
  before the commit, and the judges never import it.

## What the main entry exports

| Module | Holds |
|---|---|
| `validate` | `validateDefinition(definition, bounds, profiles?)`: a `ValidDefinition` with its digest, timed types, hold types, the slots each range guard's `where` reads, the chain of timed rules from each state (`deadlines`) and the most a result clause can start (`clauseEntries`); or a list of problems. `PROFILES`, `Profile`. |
| `state` | `StateView` and `StateWriter`; the records of an item (`Item`, `Party` and `Status` are the contract's, exported here again), a relationship copy, a sent request, a consumed delivery, a held creation and an outside operation; `MemoryState`; `StateSnapshot` and `stateDigest`, the digest a checkpoint carries. `StateView.page` is the one paged read: by type and states, in ID order, with the last ID as its cursor. An implementation reads it from an index ordered by type, state and ID, as `MemoryState` does, so a page costs the items it returns. Keeping the index has a cost too. In `MemoryState` a new item has the highest ID and is appended to its bucket. An item that changes state is found in its old bucket by binary search and placed in the new one, and each of those two steps shifts the IDs after it: one old live item that becomes final is inserted before every later ID in that bucket, which is linear in the retained final items of that type and state. A store with an ordered index, such as the scope runtime's SQLite index, pays a logarithmic update instead. Rebuilding a state from its history costs one such update for each entry. None of this has been measured. |
| `fold` | `applyEntry(writer, definition, entry, hash)`, the only code that changes state. `changeItem` and `newItem`, which the judges use on their working copy. `FoldError`. |
| `judge` | `judgeAct`, `judgeTimed`, and `entryOf`, which makes a draft the entry at a head and a reading, or entry 0 for a genesis. The answer types `ActJudgment`, `TimedJudgment` and `Judgment`. |
| `genesis` | `judgeGenesis(view, definition, asked, context)` for a `Founding` (a directory) or a `Creation` (a child). |
| `delivery` | `judgeDelivery(view, definition, delivered, context)` for a request, a result, a control and an advisory. `Delivered`, `Source`, `DeliveryContext`, `sentBy`. |
| `settle` | `judgeDiagnosis`, `judgeOutcome`, `judgeCheckpoint`, and `checkpointOf(view)`. `settleOutcome` is `judgeOutcome` with one more answer, `conflict`. |
| `ledger` | The ledger of outside effects, by section 4.3 of the contract and the ledger rules of the authority note's section 5.4. `operationOpening` and `heldOpenings`: the effects that open an operation and its first attempt. `recordedOutcome` and `outcomeOf`: what one outcome writes, with `selected` and the next attempt derived. `openedBy` and `attemptedBy`: the fold of the two records. `pendingOf`, `operationSettled` and `operationStanding`: what an operation still reserves, and what a reader is told. `tokenPast`: rule 4, as a judgment alone. An owner's part is `OperationRules`, given as `Owners`. The interface is generic. The pure rules of the capability owners, `hold@1` and `git-read@1`, are in this package (`capability/`); the rules of a platform owner are supplied by the platform package; outside adapters are separate and unbuilt. The scope package's wiring of the capability rules to `owners` (`CAPABILITY_CODE`) is no evidence of a live provider. An owner declares there the `closure` of one outcome entry: the entries that the operations it opens reserve. `closureOf` and `reservedBy` read it. |
| `grant` | The grant of an act, judged on an observation of membership, by section 16.1 of the contract and section 3.3 of the authority note. `judgeGrant(use, asked)`: the commit guards of an observation and the grant guard, for check 9. It answers `current` with the grant, `unauthorized`, or `authority-unavailable` when the observation is discarded, each with the guard that failed. `windowOf(definition, kind, act)`: the window of an act, and whether its observation serves one commit. `grantFrom` and `agrees`: the grant that an observation gives, and whether a recorded grant is that one. `observationOf`: the observation of one answer of membership, or null. `revoked` and `prefer`: which of two observations of a key a scope keeps. `RoleTable` and `actionsOf`: the role table as data. `MISMATCHES`: the name a replay reports for a failed guard. The runtime calls these in the commit, and a verifier calls them with what the entry retains. |
| `reserve` | `owed(view, definition, head, owners)`: the entries the pending duties of a state reserve, by section 17.2 of the contract, revision 11, which is adopted: a deadline with its chain of timed rules, an item or a relationship copy that awaits the settlement an act or handler declares with `settles`, a request's result and diagnosis with what its clause can start, a confirmation, each attempt of an outside operation that has no outcome or may still be opened, with the closure that its owner's rules declare for each outcome entry, and the closing checkpoint. The count is of entries only. `fits(view, definition, bounds, input, settled, owners)`: whether the entry just folded is a settling entry, or is new work that leaves them room. `settled` is the judge's word, in `Draft.settles`, that an act or a delivered request took its subject out of the states its form's `settles` lists. A checkpoint beside a pending duty is new work; one with nothing else pending is the closing checkpoint. The validator supplies `deadlines`, `pending`, `pendingCopies` and `clauseEntries`, and refuses, as `reserve-unbounded`, timed rules of one type that lead to one another in a cycle, and forms that settle one another's pending states in a cycle. |
| `rules` | `prepareRules(view, definition, judged)`: for each `rule` guard an input would meet, the rule, its expression, its input and the input's digest. |
| `fields` | How the fields of an input are read: `Reading`, which every judge is given, `readFields`, `readFacts`, and `factsNamed` (the foreign entries a runtime fetches before the turn). A fact that names the judging scope is a local fact: it is not fetched, `readFacts` checks it against the scope's own entry and puts it in normal form, the entry's `seq`, and a wrong hash is `fact-mismatch`. `Own` is the reader of a scope's own sealed entries, which a caller gives in `Reading.own`: the runtime from its stored history, a verifier from the entries it has checked. The fields of a delivered message: `messageFields` and `creationFields`, each read against the declared field types of the handler or the genesis act, and `updateOf`. The `self` mark is read as the sender's fact only in a field of type fact or a list of facts. |
| `operand` | Not exported, but for `operand` and `slotOf` through `guards`. What an operand of the contract's section 6.5 reads, what a part reads inside an entry that a fact names, the kind of an entry, and equality after local facts are put in normal form. A field of this scope's own entry is read by this scope's types, and a field of a foreign entry as its bytes hold it. |
| `handlers` | What the judges share beside that: `bound` (the handler a message runs, found by the message's class and name and the sender's kind, and not found for a sender under another definition than its `from` names, where the caller has read the source entry), `messageFacts` (the foreign entries that a message's declared fields name, which a runtime fetches before the turn), `alsoItems` (the other items an act or handler selects: by a field, through a slot, or as the one item of a type), `overMax`, `runHandler`, `runClause` and `derive`, which every judge of an act, a genesis or a delivery derives its written forms with. `Sent` is what a handler reads of its delivery beside the message's fields. `refusalName` gives the name a failed guard declares. |
| `guards`, `effects`, `sends` | `judgeGuard`, `judgeGuards` (one written list of guards, with its three results), `deriveEffects`, `deriveSends`, the `Judging` value they read, and `ruleInput`. Effect and send derivation answer their result, a refusal, or that the input is not judged. From `sends` also: `directoryOf` (the directory a scope records at its genesis, where its index rows go), and `formOf` (the send form that made one recorded send of an entry, which a result's clause is found by). |
| `timed` | `nextDue(view, definition, asOf)`: the next due transition in the contract's order. |
| `time` | `clockOf(view, reading)`: one commit's reading, whether it is behind, and the time at which a transition is due. `timeMs`, `timeOf`. |
| `attribution` | `historyOf(item, changed, definition, signer)`: an item's attribution history with what the entry's changed holds add. `attribution(history, signer)`: that history, then the signer and the signer's principal. |
| `values` | `isValue` for each field type, `same`, `byteOrder`, and the reference shapes. |
| `capability` | `Capabilities`: the rules of the capability forms that a runtime or a verifier has code for, which a judge is given in `Reading.capabilities` and asks for each `capability` guard and effect. Each rule is given its arguments and `CapabilityGiven`: the folded state before the entry and the input being judged. `implements` is asked for each form, not for a version. The rules of `hold@1` and `git-read@1` are in this package, in `capability/hold` and `capability/gitread`, below. The scope package's production ports are given this pure code: `CAPABILITY_CODE` is the value of both `capabilities` and `owners` in `production()` (`packages/scope/src/ports.ts`). That wires the code and nothing more. The production defaults read no grant, let no reader read and send nothing outside the service, so a scope with only those defaults admits no step and sends no request. The adapters of a Git host and a deployment are owed. `derivable(definition, capabilities)`: whether every form in the definition's `underived` list has code. A runtime answers `unsupported-definition` when it is false. `Recorded`: one change of one record, which an entry holds as a `record` effect. |
| `marks`, `outcomes` | Platform code, by revision 15 of the contract (its sections 4.2, 6.1 and 9.3). It was written before that revision was adopted, and the adoption is of the design: it is no review of this source. `PlatformRule`: one rule, of the kind of one place: `grant`, `also`, `type`, `guard`, `effect`, `send` or `outcome`. `RuleGiven`: the six things a rule is given, and no other. `runnable(definition, rules)`: every mark that the validator listed has a rule of its name and kind; without one the whole scope is `unsupported-definition`. A judge is given the rules in `Reading.platform` and runs each at the check of its mark's place. `RuleFault`: a rule that throws, or returns a value outside what its place allows, leaves the input not judged. `ownersOf` answers the ledger for the operations that the pinned platform definition owns, from the rules that its `outcomes` names. This package holds no platform rule: the platform package has them. |
| `prepare` | The preparation path, by section 5.5 of the contract. `judgePreparation(view, definition, asked, context)`: the judge of one request for a step of a capability, which writes a `preparation` entry or refuses. `Steps`: the rules of the steps that a runtime has code for. `GrantDecision`: the decision on the step's grant, which the runtime makes with `judgeGrant`. `preparationStatus`: what a settlement reports of an intent's preparation. |
| `capability/hold` | The code of `hold@1` over its records, by section 6.11 of the contract and sections 4.2, 5.7 and 6.2 of the authority note. `hasWorkspace(definition)`, `stagedSource`, `holdCapability(options)`, `workspaceEffects`, `boundLicense`, `licenseRefused`, `holdReserves`. Its two options are numbers that the proof plan owns: the most tokens of one hold, with the floor 2, and the retention of a root. It declares the most that each of its effects, steps and outcome rules derives in one entry (`maxima`), and `counted`, of `capability`, adds them into each entry of a definition. The production ports of the scope package hold it. |
| `capability/ancestry`, `capability/gitread` | The ancestry walk, `walk`, and the guard `ancestry` of `git-read@1`, `gitRead(options)`, by section 16.4 of the contract and section 6.2 of the authority note. The same module has the step `job-read` of `git-read@1` (authority note, sections 3.11 and 5.7): the checker's signed request for a job's read token, the `token` record that it makes, and the rules of that token's mint and revocation. `capabilitiesOf` makes one value of the code of several capability versions: their forms, their steps and the rules of their operations. |

## The validator's modules

`validate` is a directory, `src/validate/`. Its `index.ts` reads a
definition's own members and puts the parts in order. Each family of forms
has one module, so that work on one family touches one file.

| Module | Reads |
|---|---|
| `shape` | The readers of untrusted data, and the problems they report. |
| `context` | What the families share: the item types as read, what one act, handler or timed rule may name, and how a subject is resolved. |
| `fields`, `items` | Field types, the declared fields of an act, and when one type may be copied into another; item types and their slots. |
| `operands` | Operands, and the rule for a copy into a slot. |
| `guards` | Guard forms. |
| `effects` | Effect forms, and the rule against two effects on one slot. |
| `hold` | The item form of the hold capability. |
| `capability` | The capabilities a definition lists, a `capability` guard and effect, the part `carried` and the kind of a preparation entry, each checked against the contract package's `CAPABILITIES`. It derives none of them: each is listed in `ValidDefinition.underived`. |
| `sends` | Send and attention forms, and result clauses. |
| `handlers` | Acts and handlers, and the other items each names. |
| `timed` | Timed rules, their graph, and the static size of a timed entry. |
| `capacity` | What a duty reserves, as far as the definition decides it. |
| `sizes` | Upper bounds on canonical bytes. |

## How a commit uses it

1. Read the clock once: `clockOf(view, reading)`.
2. Call the judge of the input: `judgeAct`, `judgeGenesis`, `judgeDelivery`,
   `judgeDiagnosis`, `judgeOutcome`, `judgeCheckpoint` or `judgePreparation`
   (a request for a step of a capability, which writes a `preparation` entry
   or refuses; it is not the asynchronous evaluation of rules below, and the
   drain still judges timed inputs separately with `judgeTimed`). Every judge takes
   the state, the definition, the input, and a context with that one
   reading, the bounds and the retained inputs it needs.
3. For a draft: `entryOf(view, draft, clock)`, hash the entry, then
   `applyEntry(writer, definition, entry, hash)`.

A judge answers one of these. Only the first records anything.

| Answer | Means |
|---|---|
| `write` | Write this draft: the input with its decision, `uses`, `prepared`, `effects`, `sends`, and whether it judges time. |
| `source-unverified` | A source check of a genesis or a delivery failed. |
| `unavailable` | Not judged, with a reason. It is offered again. An entry that judges time is `clock-behind` while the clock is behind. |
| `repeat` (`accepted-before` for an act) | Already recorded, by the entry of that `seq`. |
| `due` | A transition is due. Nothing is written and the drain runs first. |
| `routing` | A delivery addressed to another scope or incarnation. |
| `refused` | An act that is refused, with the head it was judged at, and with the name its failed guard declares, if it declares one; or an input the scope can never write. |
| `mismatch` | An act whose key is on another sealed intent. |

The drain selects with `nextDue` and commits with `judgeTimed`, which
writes only when the selection passes its three checks.

What the caller supplies for each input:

| Input | Beside the clock and bounds |
|---|---|
| An act | Each grant the act may be judged on, with whether it is current, as the commit decided it from what was read before the turn; or null when nothing was read, which is `authority-unavailable`; each fetched foreign entry its fields name; the prepared rule results; `own`, the reader of the scope's own entries, for a local fact. |
| A genesis | The scope's own name and a new incarnation. For a child, the source entry: the creator's entry that holds the `create` send. |
| A delivery | The send's address, source fact, ordinal and message; the source entry as read from the source scope. For a result, this scope's own entry that sent the request. |
| A diagnosis | The request by `seq` and ordinal, the attempt log, and this scope's own entry that sent the request. |
| An outcome, a checkpoint | Nothing more. `checkpointOf(view)` builds the checkpoint a scope may write. |

A provisional child's state names, in `ScopeState.held`, the ordinals of
its genesis entry's sends that are sealed and must not be dispatched. The
entry that records the confirmation empties the list.

## Rules

A definition declares its rule expressions in `rules`, by name. A `rule`
guard names one.

1. Preparation, over the snapshot: `prepareRules(view, definition, judged)`
   judges the input as a commit would, passes over each rule guard, and
   returns what each rule reads. That is exactly the input of the
   contract's section 6.5: the subjects' records, the kind and fields, the
   signer's member, and each fetched fact.
2. `evaluateRules(asked)`, from the `rule` entry point, returns one
   `Prepared` record for each: the rule, the digest of its input, and the
   result. A rule holds only when its expression gives `true`.
3. The judge takes the records in its context. A rule guard reuses one only
   when its digest is the digest of what the rule reads in the commit.
   Otherwise the answer is `unavailable`. The entry records each result its
   guards read, also when the entry records a refusal: a refused genesis, or
   a delivery whose handler refused.

`RULE_PROFILES`, from the `rule` entry point, is a profile table for
`validateDefinition` that also checks each rule's text against the profile.

## Review of the earlier evaluator

The rule evaluator is the restricted JSONata evaluator of the earlier
model, reviewed for its new role and copied into `src/rule/`. It passed.
The earlier files are deleted with the modules this package replaces;
they are in Git history at `b6a9c0b6`, under `packages/policy/src`. The
review asked four questions.

| Question | What was found | Outcome |
|---|---|---|
| Can an expression read a clock? | Every function call must name one of 16 listed functions: `abs`, `ceil`, `floor`, `round`, `count`, `sum`, `min`, `max`, `length`, `exists`, `not`, `lookup`, `append`, `merge`, `contains`, `substring`. `$now`, `$millis`, `$random` and `$eval` are not listed, so the admission check refuses them before anything is evaluated. The engine takes a timestamp when it starts; no admitted expression can observe it. | Passes. A test pins the refusals. |
| Can it read anything beyond its input? | The host passes no bindings. An expression may read the context, the root and the variables it binds itself. The parent operator, wildcards, descendants, lambdas, partial application, function chaining, regular expressions, sorting and transforms are node types outside the allowlist. The keys `__proto__`, `constructor` and `prototype` are refused in the expression and in the input. | Passes. A definition whose slot or field has one of those three names cannot be read by a rule: the rule is then false. |
| Is its work bounded? | Before evaluation: the expression is at most 64 KiB, and its syntax tree at most 4,096 nodes and 64 levels. During evaluation: at most 100,000 steps, 64 active levels, 16,384 items in a sequence, 1 MiB in one intermediate value and 16 MiB inspected in all. The input is at most 256 KiB and 32 levels. The steps are counted by two hooks of the engine, which are internal to it. | Passes, on the pinned engine. The engine's own timeout is not used. The fingerprint below covers the hooks, because it includes step counts. |
| Is it deterministic? | Numbers are safe integers; a fraction or an overflow is refused. Strings are well formed. The input is copied through canonical JSON, so object keys have one order. Every refusal has a stable code. | Passes. |

Changes made in the copy:

- **No budget is shared between rules.** The earlier model charged all the
  rules of one act to one budget and recorded where each started. Here a
  prepared result is identified by the rule and the digest of its input
  alone, so each rule is evaluated by itself, with the budgets above.
- **Results.** The earlier model recorded an evaluation error as a refusal
  with a code. Here a rule is a Boolean guard: any deterministic refusal of
  the profile makes the rule false. A fault of the engine prepares nothing,
  and the input is answered `unavailable`.
- **The engine check.** The earlier code compared the installed package's
  version text and a fingerprint of 13 probes: their results, step counts
  and inspected bytes. The copy keeps the fingerprint, with the same value,
  and computes it with this repository's SHA-256. It drops the comparison
  of the version text, which needed a JSON import. The exact version is
  pinned in `package.json` and the lock file. The check detects drift. It
  is not a boundary against someone who can change the installed code.
- **Vocabulary.** The profile is `restricted@1`. The errors are
  `RuleEvalError` and `RuleRuntimeFailure`.

The earlier package's own test corpus was not run again: the earlier
package is not built or tested here. The fingerprint is unchanged, which shows
that the engine, the budgets and the hooks behave as they did when that
corpus last passed. Three tests of this package pin the points above.

Not copied: `context.ts`, the replay context of the earlier decision
record; `inputs.ts`, a helper for the earlier policy document; and
`integrity.ts`, whose digests the bytes package replaces.

Two limits follow from the profile and are not yet settled by the
contract. A rule's input is at most 256 KiB, and an input may name more
fetched facts than that holds; such a rule is false. Evaluation is
asynchronous, so a rule can never be evaluated inside the commit.

## How to test

```
npm test --workspace @generalbusiness/artroom-derive
npm run typecheck --workspace @generalbusiness/artroom-derive
```

`test/fixtures.ts` holds the one fixture set: a key set, four small
definitions, a scope in memory that judges, seals and folds as a commit
does, and helpers that pass the entries of one scope to another. It is not
exported from the package's main entry. The export
`@generalbusiness/artroom-derive/testing` gives it to the tests of the
packages that build on derive, and to nothing else.

`test/fixtures-f.ts` adds two definitions for the tests of fields and of
the hold type: `board`, and `works`, which is the fixture lane with the
acts that end a commitment and a hold. It is not exported.

Each family of forms has one test file, `test/forms-*.test.ts`: operands,
guards, effects, sends, handlers, fields, the hold type, what travels
beside an intent, and capability forms. Each shows on a small made-up
definition what the validator accepts and refuses and what the judges
derive. The two real lane definitions are validated in the lanes package.
