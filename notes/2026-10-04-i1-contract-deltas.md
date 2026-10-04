# I1 contract deltas

Written 2026-10-04 with step 2 of I1 (`packages/derive`), for independent
design review. Entries 1 to 43 came with the act and timed judges. Entries
44 to 78 came with the judges of a genesis, a delivery, a diagnosis, an
outcome and a checkpoint, and with the rule evaluator. The scope and replay contract, revision 7, is "the contract".
Section numbers are its own.

Section 11 lists eight repairs made after the first static review of this
source (report `d3930ee8`). Entries 2, 29, 31, 39 and 40 are corrected in
place where a repair made them untrue.

Section 12 is one repair made after a supplementary finding of the same
review (event `fbcdc3bd`). Entries 55 and 78 are corrected in place.

Each entry is a place where the contract was silent or needed a concrete
form, what was implemented, and why. Nothing here is adopted by being
implemented. An entry stays open until the contract's owner accepts it,
changes it or removes it.

## 1. Forms added to the contract's types

| # | Where the contract is silent | Implemented | Why |
|---|---|---|---|
| 1 | Section 5.2 names timed rules, and the `timed` input names a rule, but `DeclaredDefinition` has no member that declares one. | `timed: Record<string, TimedRule>`. A rule names an item type (`on`), the live states in which it applies, the value slot of type `time` that holds the deadline, its effects and its attention. | The drain, the `timed` input and `genesis-timed` all need a declared rule to read. |
| 2 | Section 6.8 says a hold ending changes the hold item only. No rule says what a timed rule's effects may name. | A timed rule's effects may change only its own item. It has no signer and no fields. Its effects are total: the validator refuses, as `timed-partial`, an `add` to a party list and an `attribute`, which a full list would refuse in the commit (repair 5). | Section 6.8, applied to every timed rule. A due transition that could be refused would stay due and block the drain. |
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
| 8 | The order of an act's checks. | Signature and shape; addressing; the idempotency index (entry 10); `notAfter`; a due transition; scope status; the act kind and fields; `on`, `also`, aliases and expected revisions; authority; guards; effects and `required-unset`; sends; the live-item `max`; the clock rule. | The task's stated order, with the signature and shape first. |
| 9 | Whether the judge checks the signature, which step 1 of section 5.2 checks before the turn. | It does. | The verifier calls the same judge and must check it (section 9.3). The check is pure. |
| 10 | Whether `notAfter` or the idempotency index is checked first. | **Decided: the idempotency index is checked first.** The exact retry of an accepted intent is answered with its first entry at any time, also after its `notAfter`. Another intent under the same key and actor is a mismatch at any time. Only an intent that was never accepted can be `expired`. | Section 4.2: the key is consumed for the life of the scope, and the record of accepted keys has no expiry and no window. The first version of this entry had the other order and asked for a decision; this is the decision. |
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
| 29 | `fact`: what `where` reads, what `under` names, and the content digest of a use. | In a `where`, operand `a` is a field of the foreign intent and `b` is read in this act. The foreign entry's effects cannot be reached: that is G1. `under` is compared with a name the fetcher supplies beside the entry; the contract does not say how a definition is named. `uses` lists each fetched fact the fields name, by field name in byte order, with the SHA-256 of the entry's canonical bytes as `content`. Every reference is checked whole against the fetched entry, by scope, incarnation, position and hash, before a fact is listed once (repair 4). A fact that was not fetched, or a reference that the fetched entry does not match, is `dependency-unavailable`. | The smallest reading of section 6.5 that the grammar can express. |
| 30 | `rule`: where rules are declared, and the digest of a rule's input. | Replaced by entries 44 and 74 to 78: the definition declares its rules, and the evaluator is reviewed and in place. | The first version of this entry deferred the evaluator. |
| 31 | "A final state has no transition out of it" as a static rule. | A `state` effect on an existing subject needs a `state` guard on that subject that lists no final state. An opening may carry a `state` effect only when the initial state is not final. When effects are derived, an effect of any kind on a subject that was in a final state before the entry is refused `final`, and the fold takes no entry with such an effect (repair 6). So a result clause on such an item changes nothing. A transition whose primary item is in a final state is refused `final`. | The validator cannot otherwise know the subject's state. |
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
| 39 | How attribution's history is kept (section 6.7). | Each item record holds the members ever put in one of its `author` slots, in order. A member made the holder of a hold joins the history of the hold, and of the item the hold's `under` names. That item's revision does not rise for it. The `attribute` effect takes that history as it stands after the effects written before it in the same entry, with the history of each hold under the item that the entry has changed (repair 7); then the signer and the signer's principal, in order of first appearance. | A verifier derives the same list from the same fold, with no scan of retained holds. |
| 40 | When a principal is counted. | When the member put in the slot is the signer of that entry, the grant's principal joins with it. A member whom another signer puts in a slot brings no principal then, because no grant of theirs was judged. Later, when a member of an item's history signs an entry that changes the item, or a hold under it, the principal of the grant judged for that entry joins the history (repair 7). | "Each of those who acted under another member's authority" needs a judged grant. |
| 41 | A directory's status at genesis. | The fold makes a scope with no creator active at its genesis. A child is provisional until an `activate` effect; a refused genesis is terminal. | A seam for the next step. The founding rule is the authority note's. |
| 42 | Handlers. | `ReceiveType` has no form that opens an item, so a handler opens none, and `hold: open` in one is refused. Its message fields are not declared, so the validator does not resolve a field name in a handler. | Section 4.1 allows a handler one item; section 6.4 gives it no way to open it. |
| 43 | Capabilities this runtime does not implement. | `git-read`, and any profile other than `restricted@1`, are refused by the validator. | Section 6.1: a runtime that does not implement a version admits nothing to that scope. |

## 6. Forms added to the contract's types, second part

| # | Where the contract is silent | Implemented | Why |
|---|---|---|---|
| 44 | Section 6.5 says a rule is "a named expression in the profile". `DeclaredDefinition` has no member that holds one. | `rules: Record<string, string>`: each rule's name and its expression, in the language of the pinned profile. The validator requires every `rule` guard to name a declared rule. It sets no bound on their number. It checks each expression against the profile only when it is given the evaluator's profile table, which is exported beside the evaluator. | The expressions are part of the meaning a scope pins, so they are in the definition's digest. The judges must not load the engine. |
| 45 | Section 4.3 says an operation and each attempt are recorded before the attempt is sent. No effect or input records that. | An effect record `{ effect: "operation", operation, attempt }`: an entry opens the next numbered attempt of an operation, from 1. No form of a definition produces it yet. | An outcome must name an attempt that an earlier entry opened. What opens one is the authority note's. |
| 46 | Reasons the contract does not name. | `unknown-message`: a delivered request names no handler. `bad-input`: a diagnosis, outcome or checkpoint that does not follow from the scope's state. | A caller must be able to tell these apart. |
| 47 | Section 4.1's `Envelope` has `to: ScopeId`. Section 7.4 has the object at a name refuse a wrong incarnation. | A delivery reaches the judge with the send's own address: a full reference or, for a creation, a seed (`Delivered`). The `Envelope` type is unchanged. | The receiver cannot refuse a wrong incarnation unless the address it was sent to arrives with the message. |
| 48 | What a judge answers when it writes nothing. | One of: `source-unverified`; `unavailable` with a reason; `repeat` with the `seq` of the entry that recorded the input; `due`; `routing` with `wrong-incarnation` or `not-found`; `refused` with a reason, for an input the scope can never write. | Sections 4.2, 5.2 and 7.4, as one type for the runtime and the verifier. |

## 7. Genesis

| # | Where the contract is silent | Implemented | Why |
|---|---|---|---|
| 49 | What the judge of a genesis is given. | The name of the object that was reached, an incarnation that the caller minted, and either a seed with a founding intent or the delivery of a `create`. The seed's digest must be the name. A seed that names a definition by digest must name the definition the judge was given; a platform definition's name is not checked here. | Sections 2.2 and 2.3. The judge is pure, so it mints nothing. |
| 50 | **For review.** The founding intent, beyond its signature and digest. | Kind `found`, whatever the definition calls its genesis act; `to` null; no `on` and no `expected`; seed kind `directory`, ordinal 0, creator null. Its `notAfter` is judged on the commit clock, and an expired one is refused and writes nothing. A genesis has no signer: an operand or effect that reads the signer reads nothing. | Section 7.1 leaves the founding rule and the founder's standing to the authority note. |
| 51 | **For review.** A genesis act that refuses, in a directory. | As in a child: the entry is written with decision `refused` and no effect, and the scope is terminal. A field that is not a value of its type refuses in the same way. A proof that fails writes nothing. The genesis input has no reason; a child's result message carries it. | Section 7.2 gives the rule for a child. A directory's name is the digest of its founding intent, so a refused one blocks only that intent. |
| 52 | The ordinals of a deciding entry's sends. | A child's genesis: the result at ordinal 0, then the sends its act declares, from 1. A directory's genesis: its act's sends from 0. A delivery of a request: the handler's sends from 0, then the one result. | Section 7.2's two tables: I.0 sends its result at ordinal 0, and C.20 sends its `create` at ordinal 0 and also a result. |
| 53 | The seed of a scope a genesis creates. | Its cause is the digest of the creating scope's own seed. Its ordinal counts the creations of that entry, from 0. | Section 7.2, the third kind of cause. |
| 54 | How a held duty is represented. | The scope's state holds the ordinals of its genesis entry's sends that must not be dispatched: every send of a provisional genesis but ordinal 0. The entry that records the confirmation empties the list. Their requests are outstanding from the genesis. | Section 7.2. A runtime reads the list before it dispatches. Replay cannot check dispatch timing, as section 9.3 says. |
| 55 | Which foreign entries a genesis or a delivery records in `uses`. | The source entry, with the digest of its canonical bytes; for a child's genesis, applied or refused, then each fact its fields name, once those facts are read. A delivery of a result, and a diagnosis, also record each fact that the clause they run reads (section 12). | Section 9.2: the bytes of a foreign entry that a judgment read are a retained input, and the judge reads the source entry. |
| 56 | What the state keeps of a genesis. | Its hash, and for a child the source fact and ordinal of the creation request. A repeat of that request is answered from the same index as a repeat of any delivery. | The confirmation's three conditions and the repeat both read them. |

## 8. Delivery

| # | Where the contract is silent | Implemented | Why |
|---|---|---|---|
| 57 | The order of a delivery's checks. | The address; the shape; the source entry; a repeat; a due transition; the scope's status; then the checks of the message's class. | The first four are immutable facts or answer from history. The rest mirror the act judge. |
| 58 | The routing refusals. | A reference with another scope ID or another kind is `not-found`; with another incarnation, `wrong-incarnation`. A seed whose digest is not this scope's ID is `not-found`. A scope with no entry is `not-found` to a delivery; a creation goes to the genesis judge. | Sections 2.3 and 7.4. |
| 59 | What identifies a consumed delivery. | The source scope, its incarnation, the source entry's `seq` and the ordinal, with the source entry's hash beside them. The same hash is a repeat. Another hash at that `seq` is `source-unverified`. | A source scope has one entry at each sequence number. |
| 60 | Which handler a message runs. | A `tell` runs the handler whose `message` is the name the request declares. A `relate` runs the handler whose `message` is `relate:<name>`, if one is declared. An advisory runs the handler whose `message` is its type. Each must be for a scope of the sender's kind. The validator refuses two handlers for one message and kind, and a `tell` send named `relate:…`, `index` or `notify`. A handler's `under` is compared with the name the reader of the source supplies; if it differs, the handler does not run. | The handler an entry ran can then be found again from the entry alone, which a later result needs. |
| 61 | What a handler reads. | Its fields are the message's fields, with each `self` mark read as the envelope's source fact. The contract declares no types for them, so a value is checked against the slot it would fill, and refused `bad-field`. An `also` name is resolved from a field that holds a local ID, or the fact of this scope's own entry that opened the item. | Section 6.4. A sender names a receiver's item by the fact it was given. |
| 62 | A `relate` in the receiver. | The body must name the owner's item as `self` or as a fact of the owner's own scope; otherwise the deciding entry is `refused`, `bad-field`. The copy is changed by an effect record with the owner, item, name, state and revision. A handler for it reads the detail, and `name`, `state` and `item` beside it; those three win over a detail of the same name. If the handler refuses, the update is refused and the copy does not change. | Section 7.3. The update and its handler's effects are one decision. |
| 63 | A `tell` with no handler, or a body that is not the shape of its message. | A deciding entry `refused`: `unknown-message`, or `bad-field`. | Every verified request gets one deciding entry. |
| 64 | An advisory. | Recorded as one entry. It runs a handler for its type if the definition declares one; a handler that refuses leaves the entry with no effect. No `index` effect is derived without a handler. | Section 7.4: "as the receiver's own definition says". The directory's index is a platform definition's. |
| 65 | **For review.** A second result for one request. | The result's outcome must equal the decision of the source entry. A request has one recorded result. A later result from another deciding entry is recorded only as a `conflict`: an applied creation result with another incarnation than the one held. Any other is answered as a repeat of the recorded result. A result that arrives after an `undelivered` diagnosis is answered as a repeat of the diagnosis. | Sections 7.2 and 7.4. The contract does not say what a refused creation followed by another incarnation's answer is, or what a result after a terminal `undelivered` is. |
| 66 | **For review.** How a clause is run in a later entry. | The state keeps the hash of each entry that sent a request. The caller supplies that entry from the scope's own history. The send's form, and the fields, subjects and signer the clause reads, are read again from it. The subjects are read as they are now. If the clause's effects cannot apply now, as when its item has reached a final state, the result is still recorded and nothing changes. A member the clause puts in a slot from the signer brings no principal. | Sections 6.6 and 7.4. A result must be recorded once whatever the item's state has become. |
| 67 | The confirmation. | Beside section 7.2's conditions, the source entry's clause must be `applied`. A confirmation of a scope that is already active, from an entry other than the one recorded, is `source-unverified`. | A `conflict` or `refused` clause sends no confirmation. |
| 68 | Which deliveries judge time (section 5.3). | One whose handler or clause has a `before` or `after` guard, or sets a value from the commit time. It is answered `clock-behind` while the clock is behind. Every other delivery may be written clamped. | The contract's rule, applied to the forms that read the clock. |
| 69 | A `create` that reaches an existing scope from another source entry. | `source-unverified`. | A seed is asked for by one input. |

## 9. Diagnosis, outcome and checkpoint

| # | Where the contract is silent | Implemented | Why |
|---|---|---|---|
| 70 | A diagnosis. | The judge derives the finding from the log; the caller does not state it. The log has at least one attempt. A request has one diagnosis: a second is answered as a repeat. A request with a recorded result is not diagnosed. | Section 7.4. With no attempt, neither finding's condition holds. |
| 71 | An outcome. | It names an attempt that an entry opened (entry 45). `confirmed` and `refused` are final. `unknown` may be followed by an outcome of the same attempt. An outcome of one attempt changes no other attempt. The evidence is carried and not read. An outcome judges no time and may be written clamped. | Section 4.3: a later attempt cannot settle an earlier unknown one. |
| 72 | **For review.** The state a checkpoint digests. | `StateSnapshot`, version 1: the scope's record, with its head; the items; the exact counts that are not zero; the relationship copies; the accepted keys; the sent requests; the consumed deliveries; the held creations; the operations. Each list is in the order of its key, a number by value and a text by its UTF-8 bytes. The digest is the SHA-256 of its canonical JSON, with no domain tag. `through` is the head the checkpoint is written on. | Section 9.2 names the digest and not the value. A seventh byte domain would be the contract's to add. |
| 73 | These three inputs in a scope that is not active. | `scope-provisional` in a provisional scope; refused in a refused one. Each meets the due check first. | Section 7.2: a provisional scope writes only its confirmation. |

## 10. Rules

| # | Where the contract is silent | Implemented | Why |
|---|---|---|---|
| 74 | The value a rule reads, and its digest. | `{ kind, fields, signer, subjects, facts }`: the kind of the act or handler; its fields with defaults; the signer's member or null; each subject's item record, by subject name; each fetched entry. The digest is the SHA-256 of its canonical JSON. | Section 6.5, as one value. An item record includes its revision, the hash of its opening entry and its attribution history. |
| 75 | How preparation knows which rules an input meets. | `prepareRules` judges the input over the snapshot as a commit would, with each rule guard passed over, and collects what each would read. A rule guard after a guard that fails is not prepared. In the commit, a rule guard with no prepared result for its input digest is `unavailable`. | Section 5.2, steps 5 and 6.4. |
| 76 | The result of a rule that does not evaluate. | A rule holds only when its expression gives `true`. Any other value, and any deterministic refusal of the profile, is false. A fault of the engine prepares nothing. | A rule is a Boolean guard, and the same expression and input always end the same way. |
| 77 | The profile `restricted@1`. | The restricted JSONata evaluator of the earlier model, on the pinned engine, with its budgets unchanged and no budget shared between two rules. The package's README has the review. A rule input over 256 KiB makes the rule false. | A prepared result is identified by the rule and its input digest alone. |
| 78 | What an entry's `prepared` holds. | Exactly the results its guards read, in the order read. This holds for an entry that records a refusal too: a refused genesis, and the deciding entry of a request or the entry of an advisory whose handler refused (section 12). | Section 4.1: "each rule evaluated". |

## 11. Repairs after the first static review (d3930ee8)

An independent static review of this source at `c05e89cf`, report
`d3930ee8`, found eight defects in supported forms. Each is repaired, with
one test that failed before its repair. Revision 8 of the contract, at
`a549aac6`, states the rule behind each. Revision 8 is filed for review and
is not adopted, so only these eight rules are implemented from it, and
none of its other new forms.

| # | Rule (revision 8) | What changed | Witness |
|---|---|---|---|
| 1 | Each operand is validated by itself (section 6.5). | The validator checks both operands of an `equals` or a `differs`, and of each `where` of a `fact` guard, before it combines them. A bare `null` is not an operand. | Validator row: `{ equals: { a: { field }, b: null } }` is refused `shape`. |
| 2 | A slot never holds a value outside its type (section 6.6). | A copy from a declared field or a slot needs a source that is assignable to the slot: the same type, with the text `max`, integer range, enum values, reference kind, and list `max` and elements inside the slot's. The validator refuses another type as `name` and a wider bound as `bound`. A handler's undeclared field is still checked against the slot in the commit and refused `bad-field`. No rule was added for comparing two values. | Validator row: a text field of 200 bytes copied into a slot of 4 is refused `bound`. |
| 3 | A copy preserves its source (section 6.6). | A `ref` effect with a slot source reads the slot of that name, of whatever kind, and the validator checks that slot's type against the destination as in repair 2. Before, it read reference slots only and copied `null` from a value slot. | A reference copied from a value slot is the reference that slot holds. |
| 4 | A fact reference is verified whole (section 6.5). | Every fact reference of every field is checked against the fetched entry, by scope, incarnation, position and hash, before anything is deduplicated. Two references that both pass are equal, so `uses` and the guards' map hold that fact once. | A second field with a verified hash and another scope and position leaves the act not judged; two equal references give one use. |
| 5 | A timed rule's effects are total (section 6.4). | The validator refuses, as `timed-partial`, a timed rule with an `add` to a party list or an `attribute`. No other effect that a timed rule may write can be refused in its commit, and the rule must still take its item out of its states. So a selected transition that passes its three checks is written, and its item is not due again under that rule. `judgeTimed` passes over nothing: a refusal there is a fault and throws. | Validator row: a timed rule that adds the holder to a list with `max` 1 is refused `timed-partial`. |
| 6 | No effect changes an item that was final before the entry (section 6.6). | Effect derivation refuses `final` for an effect of any kind on a subject that was final before the entry, read from the state before the entry and not from the working copy. An entry that takes a live item to a final state keeps its other effects on that item. The fold refuses an entry with an effect on such an item. A final item may still be named in `also` and read. | An edit with a value effect on a kept `also` note is refused `final`; the same edit without that effect is written. |
| 7 | Attribution within an entry, and a principal on later authority (section 6.7). | An `attribute` effect reads the subject's history with the history of each hold under it as the entry's earlier effects left it. The fold uses the same function after the entry. When a member of an item's history signs an entry that changes the item, or a hold under it, the principal of that entry's grant joins the history. | A report that hands its hold to another member lists that member; a note's owner who edits under a grant that names a principal brings that principal. |
| 8 | The index is ordered (section 6.5). | `MemoryState` keeps, for each type and state, the item IDs in ascending order, and `putItem` maintains them. `page` reads from the cursor in each listed state and merges by ID; `more` is exact. `StateView.page` is unchanged, and its comment states the cursor and the cost an implementation owes. No bound on retained items was added and nothing is evicted. | A page of two live notes among 38 retained final ones reads no final note, and pages stay in ID order while a note changes state. |

Decisions made in these repairs, for review:

- **Repair 4.** Revision 8 refuses a reference that does not match its
  entry with a new reason, `fact-mismatch`. That reason is a new form and
  is not implemented. Such a reference is answered
  `dependency-unavailable`, as a single mismatched reference already was.
- **Repair 5.** Revision 8 also lets `hold: end` alone take an item out of
  a rule's states, and names capability effects that are not total.
  Neither is implemented: a `state` effect is still required, and `hold`
  is the only capability.
- **Repair 6.** Every written effect on a subject that was final is
  refused, also one that would record no change, such as an `add` of a
  member already in the list.
- **Repair 7.** The history is still kept with each entry and not derived
  from retained history. Revision 8 allows either when both rules hold.
- **Repair 8.** The search for the next due transition still reads one
  page of live items for each timed rule. A type's `max` bounds that
  page. Revision 8's separate index of live timed items in due order is
  not implemented.

## 12. Repair after the supplementary finding (fbcdc3bd)

The review found that an entry which records a refusal, or a later clause,
did not record everything its judgment read. One repair, with two tests
that failed before it.

| What was lost | What changed | Witness |
|---|---|---|
| A rule result that a guard read before a written refusal. | A refusal from the guards, effects or sends of a genesis act or a handler carries the prepared results read so far. A refused genesis, the deciding entry of a refused request, and the entry of an advisory whose handler refused each record them in `prepared`. | A child genesis and a delivered request, each under a rule whose prepared result is false: the written entry holds that result. |
| The facts a refused genesis read. | Once the named facts are read, a refused genesis records them in `uses` after the source entry, as an applied one does. A genesis refused before that point, for a field that is not a value of its type, records the source entry only. | A child genesis whose `fact` guard is false: the entry holds the source entry and the named fact. |
| The facts a later clause read. | A clause with effects reads every fact that the origin entry's fields name. The entry that records it, a delivery of a result or a diagnosis, now records those facts in `uses`, after the source entry and without repeating it. A clause with no effects reads none. | A diagnosis whose `undelivered` clause runs for an origin that names a fact: the diagnosis entry holds that fact. |

Not changed: a refused act writes no entry and records nothing. The
decision, the effects and the sends of every entry are as before.

What this repair claims. The failure was evidence missing from the entry
that made the judgment. For a refused genesis that is also a missing
retained input: the creator may pass a fact reference on without reading
it, so no other scope's entry need hold it. For a later clause the origin
entry already recorded the same facts, so its history was not made
impossible to derive; the entry now states what it read. A verifier may
also be able to compute a rule result again from the rule and its input,
so not every refusal under a rule was impossible to replay before.
