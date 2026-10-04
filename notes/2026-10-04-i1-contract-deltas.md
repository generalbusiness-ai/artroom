# I1 contract deltas

Written 2026-10-04 with step 2 of I1 (`packages/derive`), for independent
design review. The scope and replay contract, revision 7, is "the contract".
Section numbers are its own.

Each entry is a place where the contract was silent or needed a concrete
form, what was implemented, and why. Nothing here is adopted by being
implemented. An entry stays open until the contract's owner accepts it,
changes it or removes it.

## 1. Forms added to the contract's types

| # | Where the contract is silent | Implemented | Why |
|---|---|---|---|
| 1 | Section 5.2 names timed rules, and the `timed` input names a rule, but `DeclaredDefinition` has no member that declares one. | `timed: Record<string, TimedRule>`. A rule names an item type (`on`), the live states in which it applies, the value slot of type `time` that holds the deadline, its effects and its attention. | The drain, the `timed` input and `genesis-timed` all need a declared rule to read. |
| 2 | Section 6.8 says a hold ending changes the hold item only. No rule says what a timed rule's effects may name. | A timed rule's effects may change only its own item. It has no signer and no fields. | Section 6.8, applied to every timed rule. |
| 3 | Nothing says a timed rule must stop being due. | The validator requires a `state` effect that takes the item out of the rule's states. A rule cannot instead clear or move its deadline: the grammar has no form that empties a value slot. | Otherwise the transition is due again as soon as it is applied, and the drain never ends. |
| 4 | Section 6.8 gives the hold capability no shape. | As far as I1 needs: a definition that lists `hold@1` may use the `hold` effect. The hold type is any type that a `hold: open` effect targets. It has a party slot named `holder` that holds one member, and may have a reference slot named `under` that names a local item. Its end time is an ordinary `time` value slot, set by the opening act, under a timed rule whose effects include `hold: end`. The validator requires that rule for every hold type, and requires the opening act to set its deadline slot. Opening sets the epoch to 1. An end raises it. A renewal raises it when the holder after the entry's effects differs from the holder before them. `extent` is checked to name a field or slot and is not recorded. | The task's stated form. The two slot names are a convention this step had to choose. Tokens, workspaces and export are the authority note's. |
| 5 | Section 6.4 says `self` is not expanded in a message, and gives it no form on the wire. | `{ "self": true }` (`SelfMark`). It is not a value of any field type. | The receiver must be able to tell it from every field value. |
| 6 | Section 6.5 owes the work limit of one guard to the proof plan. | Two bounds: `guardPage`, the items in one page of a scan (100), and `guardScan`, the items one guard reads before its scan stops unfinished (1000). Both temporary. | The completeness rule needs a limit to stop at. A verifier passes a limit that never stops. |
| 7 | Section 4.2 names no refusal reason for a failed guard, for missing authority, or for an input that names nothing the scope has. | `guard-failed`, `unauthorized`, `bad-intent`, `misaddressed`, `expired`, `scope-refused`, `unknown-act`, `bad-field`, `no-item`, `final`, `slot-full`, `type-full`, `send-unresolved`. A refusal also carries a `detail` text, such as `guards.2`, which is not part of any entry. | A caller must be able to tell these apart. The contract's own reasons are unchanged. |

The `Effect` union of step 1 is unchanged. What each record means is in
section 4 below.

## 2. The act judge

| # | Where the contract is silent | Implemented | Why |
|---|---|---|---|
| 8 | The order of an act's checks. | Signature and shape; addressing and `notAfter`; the idempotency index; a due transition; scope status; the act kind and fields; `on`, `also`, aliases and expected revisions; authority; guards; effects and `required-unset`; sends; the live-item `max`; the clock rule. | The task's stated order, with the signature and shape first. |
| 9 | Whether the judge checks the signature, which step 1 of section 5.2 checks before the turn. | It does. | The verifier calls the same judge and must check it (section 9.3). The check is pure. |
| 10 | **For review.** `notAfter` is checked before the idempotency index. | So the exact retry of an accepted intent, sent after its `notAfter`, is answered `expired` and not "accepted before". The receipt is then reached by settlement (section 4.2). | The task's stated order. The other order would return the first entry at any time. The contract should say which it means. |
| 11 | Section 2.1 bounds `notAfter` "after signing". The signing time is not in the intent. | Refused `bad-intent` when `notAfter` is more than the intent lifetime after the commit clock. | The commit clock is the only time a scope has. |
| 12 | Which acts "judge a time condition" (section 5.3). | Every act: its `notAfter` and its grant's expiry are judged on the commit clock. So no act is written while the clock is behind; the answer is `clock-behind`. | Section 9.3 has the verifier check `notAfter` against the entry's time, which a clamped time cannot support. |
| 13 | What an expiry is compared with when the clock is behind. | `notAfter` and a grant's `notAfter` are compared with the previous entry's time. A `before` or `after` guard is not judged; the answer is `clock-behind`. | An expiry judged at the later time errs toward expired. An `after` guard judged on a reading that is behind could fail wrongly. |
| 14 | Whether a time is admissible at its bound. | An intent is expired when the clock is at or past `notAfter`. A grant likewise. `before` holds when the clock is earlier than the slot's time; `after` when it is later; neither holds at the same instant. | Section 4.2: "stops being admissible at its `notAfter`". |
| 15 | Which grant an act entry records, and what "covers this scope" means. | The first presented grant, in the order presented, that names the act's `grant` action, is to the signing key, names this scope and incarnation in `within`, is not past `notAfter`, and has a positive verdict from the authority port. The entry's `authority` holds that one grant. A `within` that is a filter covers nothing in this step. The signer's member is the grant's `subject`; its principal is the grant's `principal`. | One recorded grant gives one signer for guards, effects and attribution. `ScopeFilter` is the authority note's. |
| 16 | The keys of `expected`. | Exactly `on` for a transition and one key for each `also` name; none for the primary item of an `open` or a `comment`. Anything else is `bad-intent`. An `also` entry may not be named `on`. | Section 6.4, made exact. |
| 17 | What a `comment` may have. | No guards, no effects, no sends and no `also`. It may have attention. It may name an item in a final state. | Section 6.4: a comment changes no item and meets no guard. |
| 18 | A scope before its genesis, and a refused scope. | An act to a state with no entry is `unavailable`. An act to a scope whose genesis was refused is refused `scope-refused`. | Section 7.2: a refused child admits nothing, ever. |
| 19 | The genesis kind sent as an act. | Refused `unknown-act`. | Only a genesis entry runs the genesis act. |
| 20 | The live-item `max`, and `many`. | An opening that would make more than `max` live items is refused `type-full`. A type that is not `many` must have `max` 1; nothing else is read from `many`. | Section 6.3 gives the rule and no reason name. |

## 3. Fields and values

| # | Where the contract is silent | Implemented | Why |
|---|---|---|---|
| 21 | The text of a `time` value. | `YYYY-MM-DDTHH:MM:SSZ`, or with exactly three fraction digits when they are not all zero. One instant has one text. A derived time is written in that form. | Canonical bytes need one form. |
| 22 | The values of the other field types. | `member`, `scope` and `fact` are a `MemberRef`, a `ScopeRef` of the stated kind and a `FactRef`, each with exactly its members and a well-formed scope ID and incarnation. `item` is a local ID. `commit` and `tree` are 40 or 64 lowercase hex characters. `text` is bounded in UTF-8 bytes. | The shapes of section 3, checked. |
| 23 | Equality of two operands. | Equal canonical JSON. An absent field and an empty slot are null; an empty list is an unset slot. | One rule for every type. |
| 24 | A field of type `item`, or a list of them. | Each must name an existing item of that type when the act is judged, or the act is refused `no-item`. | A reference to nothing has no meaning for a guard or a send. |
| 25 | Bounds the contract does not state. | None on the number of fields of one act or of timed rules. A `where` has at most as many entries as an act has guards. A send has at most 32 fields. | No number was invented where the entry size already bounds the definition. |
| 26 | Slot names. | One item type may not use one name for two slots of different kinds. | An operand says `slot` without a kind. |

## 4. Guards, effects, sends and attention

| # | Where the contract is silent | Implemented | Why |
|---|---|---|---|
| 27 | What a slot operand means in a range guard's `where`. | A slot of each item the range covers. A field, the signer and a constant are read from the act. The validator derives, for each such guard, the slots an index must cover. | Section 6.5: "`where` is a list of `equals` over its slots". |
| 28 | `every`: whether `list` is a field or a slot, and an absent list. | A field of that name when the act has one; otherwise a slot of the subject. An absent field fails unless the guard carries `ifPresent`. A listed ID with no item fails. | The form has one name for both. |
| 29 | `fact`: what `where` reads, what `under` names, and the content digest of a use. | In a `where`, operand `a` is a field of the foreign intent and `b` is read in this act. The foreign entry's effects cannot be reached: that is G1. `under` is compared with a name the fetcher supplies beside the entry; the contract does not say how a definition is named. `uses` lists each fetched fact the fields name, by field name in byte order, with the SHA-256 of the entry's canonical bytes as `content`. A fact that was not fetched is `dependency-unavailable`. | The smallest reading of section 6.5 that the grammar can express. |
| 30 | `rule`: where a profile declares its rules, and the digest of a rule's input. | The validator takes a table of profiles by `name@version`; `restricted@1` declares no rule, so a `rule` guard is refused until the evaluator's review. The judge reuses a prepared result only when its `input` digest equals the SHA-256 of the canonical JSON of the subjects' records, the kind, the fields, the signer's member and the fetched entries. Otherwise the answer is `unavailable`. | The plan defers the evaluator. The seam is in place. |
| 31 | "A final state has no transition out of it" as a static rule. | A `state` effect on an existing subject needs a `state` guard on that subject that lists no final state. An opening may carry a `state` effect only when the initial state is not final. A result clause cannot be checked before it runs, so the same rule is checked when effects are derived: a `state` effect on an item in a final state is refused `final`. A transition whose primary item is in a final state is refused `final`. | The validator cannot otherwise know the subject's state. |
| 32 | A fixed slot, statically. | Only an effect of the opening act, on the item it opens, may set a fixed slot. A result clause and a timed rule may not. | Section 6.3. |
| 33 | "Two effects set the same slot". | Any two effects of one list that name one slot of one subject, whatever they do to it, including two list changes and an `attribute`. Each result clause is its own list. | The strict reading. |
| 34 | Party lists. | A list slot takes `add` or `remove` of one member, or `from: null` to empty it. Adding a member already present, or removing one not present, records no effect. A list past its `max` is refused `slot-full`. | An effect record states a change. |
| 35 | `ref` from `self`. | Only in an `open` act, into a slot that refers to an item of the opened type. It records the entry's own `seq`. | Section 6.4. |
| 36 | Attention. | One `attention` effect for each `notify` whose slot holds a member, with the members before or after the effects. No message to an inbox is derived in this step. | Inbox scopes are the authority note's and the lane forms'. |
| 37 | What a send operand reads, and the body of each message. | A slot is a slot of the primary item as the effects left it. A local item reference is sent as the `self` mark when it is the entry being written, otherwise as the fact reference of the entry that opened the item; the item record keeps that hash. An absent value is left out. Bodies: `create` `{ fields }`; `tell` `{ message, fields }`; `relate` `{ name, item, state, detail }`; `index` `{ fields }`. A creation's seed takes its ordinal from the creations of that entry, from 0, and its cause from the intent digest. | Section 6.4 and section 7.2, made concrete. |
| 38 | Where an `index` send goes. | To the scope's creator. A scope with no creator refuses the act `send-unresolved`, as it does a `tell` whose slot holds no scope. | A lane's directory is the scope that created it. |

## 5. State and attribution

| # | Where the contract is silent | Implemented | Why |
|---|---|---|---|
| 39 | How attribution's history is kept (section 6.7). | Each item record holds the members ever put in one of its `author` slots, in order. A member made the holder of a hold joins the history of the hold, and of the item the hold's `under` names. That item's revision does not rise for it. The `attribute` effect takes that history, then the signer and the signer's principal, in order of first appearance. | A verifier derives the same list from the same fold, with no scan of retained holds. |
| 40 | When a principal is counted. | When the member put in the slot is the signer of that entry, the grant's principal joins with it. A member whom another signer puts in a slot brings no principal, because no grant of theirs was judged. | "Each of those who acted under another member's authority" needs a judged grant. |
| 41 | A directory's status at genesis. | The fold makes a scope with no creator active at its genesis. A child is provisional until an `activate` effect; a refused genesis is terminal. | A seam for the next step. The founding rule is the authority note's. |
| 42 | Handlers. | `ReceiveType` has no form that opens an item, so a handler opens none, and `hold: open` in one is refused. Its message fields are not declared, so the validator does not resolve a field name in a handler. | Section 4.1 allows a handler one item; section 6.4 gives it no way to open it. |
| 43 | Capabilities this runtime does not implement. | `git-read`, and any profile other than `restricted@1`, are refused by the validator. | Section 6.1: a runtime that does not implement a version admits nothing to that scope. |
