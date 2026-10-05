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
Section 13 is two repairs made after the review's second reading of the
eight (report `947a4116`). Entries 2 and 66 are corrected in place.
Section 14, "The runtime", has entries 79 to 95, from step 3
(`packages/scope`). Section 15 is repairs to the runtime after its reviews;
entries 81 and 94 are corrected in place. Section 16 is two repairs to the
rule evaluator. Section 17, "Composition and transport", has entries 96 to
114, from step 4. Section 18, "A child's definition", has entries 115 to
118, which complete step 4; entry 101 is corrected in place. Section 19,
"Replay", has entries 119 to 129, and section 20, "Client", entries 130 to
136, both from step 5.
Section 21 is three corrections after the static report `a8a34b4d`,
entries 137 to 139.
Section 22 is the two capacity seams of event `cc570904`, entries 140 to
142, closed as the contract's candidate revision 10 decides them; that
revision is not adopted yet. Section 15's table and limits are corrected in
place.

Section 23 is corrections to the client and to replay after two static
readings of step 5 (events `5fc07d88` and `8b8ed665`), entries 143 to 150.

Section 24 is two corrections after the delivery checkpoint `a9f3cb53`,
entries 151 and 152. Section 25 is the repairs after the complete review
`2d706f18`, entries 153 to 155.

Each entry is a place where the contract was silent or needed a concrete
form, what was implemented, and why. Nothing here is adopted by being
implemented. An entry stays open until the contract's owner accepts it,
changes it or removes it.

## 1. Forms added to the contract's types

| # | Where the contract is silent | Implemented | Why |
|---|---|---|---|
| 1 | Section 5.2 names timed rules, and the `timed` input names a rule, but `DeclaredDefinition` has no member that declares one. | `timed: Record<string, TimedRule>`. A rule names an item type (`on`), the live states in which it applies, the value slot of type `time` that holds the deadline, its effects and its attention. | The drain, the `timed` input and `genesis-timed` all need a declared rule to read. |
| 2 | Section 6.8 says a hold ending changes the hold item only. No rule says what a timed rule's effects may name. | A timed rule's effects may change only its own item. It has no signer and no fields. Its effects are total: the validator refuses, as `timed-partial`, an `add` to a party list and an `attribute`, which a full list would refuse in the commit (repair 5), and a time set from the commit clock (section 13). | Section 6.8, applied to every timed rule. A due transition that could be refused would stay due and block the drain. |
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
| 66 | **For review.** How a clause is run in a later entry. | The state keeps the hash of each entry that sent a request. The caller supplies that entry from the scope's own history. The send's form, and the fields, subjects and signer the clause reads, are read again from it. The subjects are read as they are now. If the clause's effects cannot apply now, as when its item has reached a final state, the result is still recorded and nothing changes. The signer a clause reads is the member who signed the origin, with no principal: derivation and the fold agree on that (section 13). | Sections 6.6 and 7.4. A result must be recorded once whatever the item's state has become. |
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

One branch of the second row was missed and is repaired after event
`fb6f8e03`. A genesis whose fields name a foreign fact and then, later in
the byte order of the field names, a local item is refused `no-item`,
because no item exists before a genesis. The named fact had been read by
then, and the written entry recorded the source entry only. The reading of
the fields now returns the facts it read before the missing item, and the
refused genesis records them. The order of the checks, the reason and the
source entry are unchanged. Witness: the same test, with a creation whose
fields name the fact and then an item.

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

## 13. Repairs after the second reading of the eight (947a4116)

The review read the eight repairs again at `a217774c` and found two of
them incomplete. Each is repaired, with a witness that failed before.

| Group | What was still wrong | What changed | Witness |
|---|---|---|---|
| 5 | A timed rule could set a time from the commit clock, with any offset. A very large offset made the time arithmetic throw inside the drain, and the due item stayed due for good. | Three things. The validator refuses, as `timed-partial`, a timed rule that sets a time from the commit clock. It refuses, as `bound`, an offset in any act, handler or clause that is longer than the span a timestamp can name, the years 0000 to 9999. Effect derivation refuses, as `bad-field`, a derived time past the end of the year 9999. So the arithmetic stays in safe integers, nothing throws, and a selected timed transition is still always written. No due item is passed over. | Two validator rows, and an act whose derived time passes the last timestamp: refused, with nothing written. |
| 7 | A clause run in a later entry was derived with the origin's signer and that signer's principal. The fold of the recording entry has no signer. So an `attribute` in the clause could list a principal whom the fold then left out of the item's history. | The clause reads the member who signed the origin, and no principal. Derivation and the fold now see the same thing. | A request whose `applied` clause sets an attributing slot from the signer and takes the item's attribution: the list and the item's history both hold the signer only. |

The rule of group 7, for review: a grant is judged for the entry it is
presented with. A principal joins an attribution history only through an
entry that its grant was judged for. An entry that records a result or a
diagnosis judges no grant, so its clause brings no principal, also when
the member it reads signed the origin under one. This is the behaviour
entry 66 stated. No authority rule is added.

Group 8, the item index: what the review asked to be stated, about cost,
is in the derive package's README under `state`. Nothing was measured and
no gain is claimed.

## 14. The runtime

From step 3, `packages/scope`: one scope on Durable Object storage.

| # | Where the contract is silent | Implemented | Why |
|---|---|---|---|
| 79 | **For review.** Step 2 says a scope processes one input at a time. Step 6.2 has a head check, which matters only if another input can commit between a snapshot and its commit. | A queue admits one input at a time to steps 3 and 4, and to step 6. Step 5, the evaluation of rules, is outside the queue: it is the one place a turn waits, for up to the preparation time limit. Another input may commit meanwhile, and the head check then sends the first back to step 3. An input with no rule to evaluate does not wait, so its steps 3 to 6 are one section. | With the whole turn in the queue, the head check and the restart budget could never act, and one slow rule would hold every input and every expiry for its time limit. |
| 80 | Where step 6.3's due check is made. | In derive's judges, which the verifier also runs. So an answer that needs no state is given without it: the exact retry of an accepted act gets its receipt, and a mismatch, a bad intent or an expired intent its refusal. Every input that could be written meets the check. | One implementation of the check. Nothing is written past a due expiry. |
| 81 | The scope's budget (section 9.2). | Corrected by section 15: one temporary bound, `scopeEntries`, 100,000, and a count of the entries the admitted duties still need. An entry that admits duties is written only when that count fits beside the entries already written; an act is otherwise refused `scope-full`, with the head it was judged at. Every other answer to an act is unchanged, so an exact retry still gets its receipt. Past `scopeEntries` nothing is written and the turn ends `unavailable`. | The contract owes the numbers and what a full scope does next to R4. |
| 82 | When the alarm is set, and the delay after a spent budget. | After a turn that wrote, that ended without an answer, or that an alarm started: at the earliest deadline any live item holds; or, when that deadline has passed, `drainRetrySeconds` (1, temporary) after the later of the last reading and the last entry's time. With no deadline the alarm is cleared. | Section 5.2: the delay is a retry policy, owed to R4. |
| 83 | How a founding is answered. | `Founded`: `accepted` with the receipt of entry 0, also for the same founding again; `refused` with a reason, where `scope-refused` means the genesis entry was written with its act refused; `unavailable`. No grant is asked for. | Section 7.1 gives the founder a receipt. Who may found a repository is R3's; until then the caller of `found` decides. |
| 84 | What `found` is given as the definition. | A declaration, or the digest or platform name of one, which the definitions port is asked for. The declaration is validated as its canonical bytes parse, with the evaluator's profile table, so a scope reads one value before and after a restart. One that fails, and a platform name, is refused `unsupported-definition`. | Section 6.1. A platform definition is code that does not exist yet. |
| 85 | Which definition a turn runs under when a founding reaches a scope that exists. | The pinned one, always. The definition a founding asks for is used only while the scope has no genesis. | Otherwise a founding call could drain a scope's due items under another definition's rules. |
| 86 | Section 11.6 lists five tables. | Those five, and `meta` for the scope's record, `item_count` for the exact counts, `item_slot` for the `where` index, and `folded` for relationship copies, held creations and outside operations. The idempotency index is three columns of `entry`. A sent request's record is columns of its `outbox` row. Every value is canonical JSON text. | The fold keeps state that is not an item, and section 4.2 calls the key record an index over the history. |
| 87 | Where each retained input of section 9.2 is kept. | `retained_input` holds what an entry names by digest: the declaration, each foreign entry of a `uses`, and each rule input. A delivered message, a rule's result and an outcome's evidence are whole inside their entry, and are retained with it. A foreign entry is kept with the definition name its fetcher gave, which a `fact` guard reads. | One copy of each. Replay needs the name beside the entry (entry 29). |
| 88 | The `where` index. | The slots the validator derived are kept for each item, indexed by type, slot, value, state and ID. Nothing reads the index yet: a range guard still scans pages, because `StateView.page` takes no `where`. | The table is ready for a paged read by slot value, which is a change to derive's interface. |
| 89 | An entry that cannot be written. | An act whose entry would pass the entry size bound is refused `bad-field`. A presented grant that is not the shape of a grant is not presented; one that is not canonical values, if it is the one judged, refuses the act `unauthorized`. An act that names more foreign entries than one entry may use is refused `bad-field` before any is fetched. | The contract names no reason for these. |
| 90 | What preparation reads. | The walk that finds an input's rules uses the reading of step 3 and asks the authority port for its verdicts then. The commit asks again on its own reading. If the two differ, a prepared result does not fit and the answer is `unavailable`. | A rule reads the signer, who comes from the judged grant. Nothing is judged on the earlier reading. |
| 91 | Preparation that fails or runs past its limit. | The answer is `unavailable`, with the reason `unavailable`, and nothing is written. The time limits of a fetch and of preparation are real timers. | Section 4.2 lists the reason and gives it no case. |
| 92 | The shape of each read. | `summary`: the scope's reference, status, definition and last time, its live items by ID, and a count for every type and state of the definition, zero included. `items`: a page of one type's final items, with the last ID as cursor. `history`: a page from a `seq`. `entry`: one by `seq`. `outbox`: a page of duties, with the last duty ID as cursor. The readers port is asked first, so `forbidden` says nothing about what exists. A bad cursor is `not-found`. The page sizes are a configurable value whose defaults are the contract's. | Section 9.1 gives the bounds and no shapes. |
| 93 | Settlement. | It asks no port. The intent must be signed and addressed to this scope: another incarnation is `wrong-incarnation`, anything else that does not match an accepted intent is `not-found`. A founding intent is not settled this way; the same founding again returns its receipt. | Section 4.2: the exact signed intent is the authority for this read. |
| 94 | Inputs this step can take. | A founding, an act, a timed transition and a checkpoint. `checkpoint()` writes one through the head; it reads the whole state, which is not bounded. Step 4 adds deliveries and diagnoses (section 17). An outcome still has no caller: no form opens an operation. | A checkpoint is the one input here that judges no time, so it shows the clamped entry of section 5.3. |
| 95 | How an object knows its name. | From the name it was reached by, which the runtime gives the object. An object reached without a name has none, and a founding of it is refused `source-unverified`. | Section 2.3: the genesis checks the seed's digest against the object's own name. |

## 15. Repairs to the runtime

### Room to settle is counted by admitted duty (event 1f52493c)

The first runtime kept a fixed number of entries, `settlementReserve`, for
entries that settle. That number did not follow what the scope had
admitted. With 12 entries and a reserve of 2, three holds were opened in
entries 1 to 9, the drain wrote two ends as entries 10 and 11, and the third
end had no entry left: an admitted duty could not settle.

The fixed reserve is removed. `owed(view, definition)`, in derive, counts
the entries that the admitted duties of a folded state still need. In the
commit, after an entry is written and folded and before the transaction
ends, `fits` checks that the entries written and the entries owed are
together at most `scopeEntries`. If they are not, the transaction is
abandoned, nothing is kept, and the input is answered: an act and a
founding `scope-full`; a checkpoint `unavailable`. The count reads the
folded state only, inside the commit, so it is under the head check and a
verifier can derive the same number from the same history. It reads
nothing that transport keeps outside the history.

| A duty that is counted | Entries |
|---|---|
| A live item in a state a timed rule applies in | One for each rule of the longest chain of timed rules from that state, whether or not its deadline is set (corrected by entry 142; first written as one for each timed rule on the type, in whatever live state). |
| A request this scope sent, with no result and no `undelivered` diagnosis | Two before any diagnosis: a `delivery-unavailable` diagnosis may be followed by a late result. One after that diagnosis. And, since entry 141, the entries of what its clause can start. |
| A provisional scope | One: the confirmation. |
| An opened attempt of an outside operation | Two before any outcome: `unknown` may be followed by the same attempt's outcome. One after `unknown`. |
| The closing checkpoint | One, except while the head entry is a checkpoint and nothing else is pending (entry 140). |

Entries that are checked, because they admit duties or are new work: a
genesis, an act, a delivery of a request, a delivery of an advisory and,
since section 22, a checkpoint and a `conflict` result.
Entries that are not checked, because their duty was counted when it was
admitted: a timed entry, a delivery of a result or of a control, a
diagnosis and an outcome. Those are refused only at `scopeEntries` itself,
which the count is meant to keep them from reaching.

The planner's case now: with `scopeEntries` 12, two holds are opened in
entries 1 to 6 and a third commitment in entries 7 and 8. The act that
would open the third hold is refused `scope-full`: it would be the tenth
entry and four would be owed. Both ends are then written as entries 9 and
10, and a checkpoint as entry 11. That is the one witness, in the scope
package's turn test, which replaces the earlier budget witness.

What the count does not cover. The code guarantees nothing for these:

- **Bytes.** The count is of entries. Retained inputs, the size of an
  entry and the storage of a scope are not budgeted.
- **Sends by number.** A send that is not a request (a result, a control,
  an advisory) needs no entry in this scope and is not counted. Nothing
  bounds the outbox rows of a scope beyond the sends of each entry.
- **Nested duties.** A delivered request is checked for the duties its own
  entry admits, the requests its handler sends among them. What the
  receivers of those sends will need is theirs to count. A result's clause
  that sends a confirmation admits no entry here.
- **A second result.** A `conflict`, the answer of a second incarnation to
  a creation, is an entry that no count foresaw. Since entry 141 it is new
  work: at capacity it is not recorded and transport answers `retry`.
- **Chains of timed rules.** Since entry 142 a deadline reserves one entry
  for each rule of its chain, and timed rules that lead to one another in a
  cycle are refused `reserve-unbounded`.
- **Cost.** The count reads one number for each state of each timed type,
  one aggregate over the requests with no result, and the operations, which
  no form opens yet. Requests diagnosed `undelivered` stay among the rows
  that aggregate reads.

`scopeEntries` stays a temporary value. No number was raised, no duty is
dropped, no expiry is skipped and nothing is evicted.

### A timed entry always fits the entry size bound (report b423c994, finding 1)

A timed rule's attention reason had no bound. A reason longer than the
entry size bound made the end of every hold an entry that could not be
written. The seal threw, the turn ended by an exception, and the hold
stayed due for good.

Three changes, so that every timed entry a validated definition can
produce fits:

| Change | Rule |
|---|---|
| The validator bounds a timed rule's entry. | For each timed rule it computes an upper bound on the canonical bytes of the entry the rule writes, whatever its item holds, and refuses the definition, as `bound`, when that passes `entryBytes`. The bound adds: 768 bytes for the entry without its effects, with the rule's name; 128 bytes for each effect record; each state name, slot name, constant and attention reason as the definition states it; each value copied from a slot at the most its type allows, with a text counted at six bytes for each byte, and a party list at every member its declared `max` allows (corrected by entry 137); and for each attention, every member its party slot can hold. |
| A member handle has a bound. | `memberBytes`, 256, temporary. A field of type `member` is a value only within it. An effect that would put a longer handle in a party slot, from the signer, a fact or an attribution, is refused `bad-field`. So a slot never holds a member the timed bound did not count. |
| The turn has a defined end for a timed draft that cannot be an entry. | The drain stops, the turn ends `unavailable`, nothing is written, the transition stays due and the alarm is set again. No due item is passed over and nothing is dropped from the entry. With the first two changes this is reached only by a fault, such as a scope restarted under a smaller `entryBytes` than its definition was validated under; such a scope's definition no longer validates, and it answers `unavailable`. |

Witness: a validator row, the fixture lane with a reason of `entryBytes`
bytes, refused `bound`. The third change has no witness: no validated
definition reaches it.

Limits. The estimate is an upper bound and is not tight: a definition whose
timed rule copies a large text slot, or tells many long lists, can be
refused though its entries would fit. The contract states no bound on a
member handle; the number is the authority note's to set. Entries that are
not timed are not bounded at validation: an act or a delivery whose entry
is too large is refused or retried when it is judged (entry 89).

### An accepted key answers before any fetch (report b423c994, finding 2)

`submit` fetched the foreign entries an intent names before the turn, and
answered `dependency-unavailable` when one could not be read. So after a
dependency was lost, the exact retry of an accepted intent did not get its
receipt, and another intent under that key did not get its mismatch.

The precedence, stated: the signature and shape; then the accepted-key
index; then, for a key that is not accepted, the fetch and every other
check. When the intent's actor and key are on a sealed entry, `submit`
fetches nothing. The turn still runs, drains what is due, and the act judge
answers from the index, as before: the same receipt for the same intent, a
mismatch for another, `misaddressed` for an intent to another scope. An
intent whose key is not accepted is new work and meets the fetch, the
authority check and the clock unchanged. This is entry 10's decision
applied to step 1 of section 5.2. It is not a promise that a scope answers
during every outage: the answer still waits behind the drain and can be
`busy` or `clock-behind`. `settle` reads the history with no turn and is
unchanged.

Witness: the existing dependency test. After the remark that names a proof
is accepted, the proof is removed from the resolver; the exact retry gets
the same receipt and another intent under the key gets the mismatch.

## 16. Repairs to the rule evaluator (security review, L8 and L9)

Both findings were made against the earlier evaluator and were carried
into the copy in `packages/derive/src/rule/`. Both apply to the new role
and both are repaired, with one witness each in the rule test.

| Finding | What was wrong here | What changed | Witness |
|---|---|---|---|
| L8 | A source nested too deeply for the parser threw a stack overflow, which was reported as a fault of the engine. In the new role a fault prepares nothing, so a definition with such a rule was not refused by the validator: validation threw. | A source the parser cannot hold is outside the profile and is refused `source_complexity`. Brackets nested deeper than the profile's tree depth, 64, are counted outside string literals and refused before the parser runs. A stack overflow in the parser, which nesting without brackets can still cause, is given the same code: a tree that deep is past the depth bound whenever it can be built. | 5,000 nested parentheses, and 60,000 prefix minus signs, are each `source_complexity`. |
| L9 | The check of variable reads has no scopes: a name bound anywhere in the expression counted as bound everywhere. `((false ? ($eval := 1) : 0); $eval)` passed admission and was stopped only when evaluated. | No name of the pinned engine's function table, nor `now` or `millis`, can be bound. The 65 names are listed in `profile.ts` for engine 2.2.2. A read of such a name is then always refused at admission. The check of reads still has no scopes: an ordinary name bound in one branch may be read in another, where it reads nothing, and the rule is false. | That expression is `unsupported_variable` at admission; `($x := 1; $x = 1)` still passes. |

The engine fingerprint is unchanged. The list of names is fixed text for
one engine version; a change of engine must review it, and nothing checks
that automatically.

## 17. Composition and transport

From step 4, in `packages/scope`: receiving, sending, the namespace and the
Worker.

| # | Where the contract is silent | Implemented | Why |
|---|---|---|---|
| 96 | What travels. Section 4.1's `Envelope` has `to: ScopeId`. | Transport carries derive's `Delivered`: the send's own address, a full reference or a seed, with the source fact, the ordinal and the message. The name of the object is taken from the address: the reference's scope ID, or the seed's digest. | Entry 47: the receiver cannot refuse a wrong incarnation unless the address arrives. |
| 97 | The form of transport's answers (section 7.4). | `recorded` with a fact, for a first decision and for a repeat alike; `retry` with a reason; `routing` with `wrong-incarnation` or `not-found`; `source-unverified`. A `retry` reason is one of the contract's unavailable reasons or `scope-full`. A delivery whose entry cannot be written now, for its size, is answered `retry`. | The task's stated answers. A sender can tell them apart, and none is an entry. |
| 98 | **For review.** Who the resolver of a name is, and what it refuses. | The object at the name, before its scope judges anything, from the scope's record alone. A reference with another kind, or to an empty store: `not-found`. Another incarnation: `wrong-incarnation`. A reference to a scope whose genesis was refused: `not-found`. A seed to an empty store passes only with a `create`. Derive's judge makes the address check again, for the verifier. | Section 7.4 says "the object at that name". A refused scope admits only a repeat of its creation request, which is addressed by its seed; the contract names no answer for any other message to it, and a retry would never end. `not-found` makes such a request end `undelivered`, which is true of it: nothing was or will be recorded. |
| 99 | How a source entry is read (section 7.4). | One RPC call on the object the fact's scope ID names. It answers its own reference, the name of its definition, and the entry's canonical bytes, and asks no reader port. The receiver checks the incarnation in the answer, parses the bytes strictly, and checks the entry against the fact's hash. An object that cannot be reached, or does not answer in the fetch time limit: `retry`. An empty store, another incarnation, no entry at that sequence number, or a hash that differs: `source-unverified`. The resolver port's answer gained `absent` to tell these apart. | Section 7.2: a late result from a lost incarnation "cannot be verified" and is `source-unverified`, which is not the same as a source that is slow. The read is between objects of one namespace, which only the Worker can reach. |
| 100 | The name of a definition, which a `fact` field's `under` and a handler's `from.under` are compared with (entries 29 and 60). | What the scope's seed names: the definition's digest, or its platform name. | It is the one name a scope's history holds for its definition. |
| 101 | Where a new child's declaration comes from. A seed names a definition by digest. | From its creator, which retains it: entries 115 to 118. The first form of this entry read a definitions port that no deployment supplied, so a deployed scope could create no child. | Section 9.2 has a scope retain its definition's bytes by digest; section 5.1 lets immutable things be read before the turn. |
| 102 | What a result's clause and a diagnosis read at run time (entry 66). | The origin entry from this scope's own history, and the foreign entries that entry used, from this scope's retained inputs. Nothing is fetched. | Section 9.2: they are retained so that the judgment can be made again. |
| 103 | A repeat while the source cannot be read. | `retry`. The source entry is read before the repeat is looked up. | Entry 57's order. A cheaper order, the lookup first, would answer a repeat without the source; it is not implemented. |
| 104 | When the dispatcher runs. | After each call that may have committed (a founding, an act, a delivery), started and not waited for by the caller; and from the alarm, after the alarm's turn. One pass at a time; a call during a pass joins it. A pass takes the due sends in batches of `deliveryBatch`, one dispatch at a time. Nothing runs inside a storage transaction. | The caller's answer does not wait on another scope. The alarm, set with the commit, is what makes delivery certain. |
| 105 | How the attempt log is stored (section 7.4). | Three columns of the send's outbox row: `attempts`, a list of `{ at, answer }`; `next`, when the next attempt is due; `ack`, the fact of an acknowledgment. Before a dispatch, the attempt is written with the answer `none`, and the alarm is set for its retry; the answer is written over it afterwards. So an attempt with no recorded completion reads `none`. An acknowledged attempt is logged `acknowledged`, which the contract's `Attempt` does not have; such a send is never diagnosed. `source-unverified` in answer to a send is logged `retry`. | "No recorded completion" and "no answer" are one value in the contract, so one write order gives both. |
| 106 | The retry policy. | Three temporary bounds. `dispatchSeconds`, 30: how long a dispatch waits for its answer. `dispatchRetrySeconds`, 1, and `dispatchRetryMaxSeconds`, 300: the delay before the next attempt, doubled each time up to the longest. A new send is due at its entry's time. | Section 7.4 leaves retransmission to policy. |
| 107 | **For review.** When a sender gives up, and for which sends. | A request, when its log holds `routingRefusals` routing refusals, consecutive or not. The dispatcher then offers a `diagnosis` with the whole log, in the scope's turn. If it is not written now, as when the scope is busy, it is offered again after `drainRetrySeconds`. A result, a control and an advisory are never given up: they are sent, at the longest delay, until acknowledged. | Section 7.5 counts "attempts answered by a routing refusal". Section 7.2: every message "is delivered again until transport acknowledges it", and a diagnosis is of a request. |
| 108 | After a diagnosis. | The request is not sent again, after either finding. Nothing resumes retransmission when a lost history is restored. A request that was acknowledged and whose result never arrives is not noticed. | Section 7.4 says retransmission "resumes" and names no trigger. Both are stated as limits. |
| 109 | One alarm for two wakes. | The alarm is set at the earlier of the deadline the turn asked for, which is kept in `meta`, and the earliest `next` of a send that is due. Only a scope with a transport does this. | The task's stated form. Either wake can be set again without losing the other, also after a restart. |
| 110 | How a held duty is kept from dispatch (entry 54). | The outbox row's `held` flag follows the fold's list in the same transaction, and a held row is not among the due sends. | Section 7.2: no attempt starts before the entry that records the confirmation. |
| 111 | The routes. | The table in the scope package's README. A founding answers 201; an act 200, 403 for `unauthorized`, 422 for another refusal, 409 for a mismatch, 503 when unavailable; a read 200, 404, 403, 409, 413, 501 or 503 by its reason. A body is at most 1 MiB and is a JSON object, or the answer is 400. A reader is the `Authorization` header as sent. | Section 9.1 gives the reads and no transport form. |
| 112 | The service-binding entrypoint. | `ScopeService`: one method for each route, with the scope ID first. It and the routes call one function. | The client of step 5 uses either. |
| 113 | A request to a name that holds no scope. | The object is made, creates its empty tables, and answers `not-found`. | Section 2.3 has no directory lookup on the path. The cost of empty objects is owed to the proof plan. |
| 114 | The size of an attempt log. | Not bounded. Each unanswered or retryable attempt adds a record, at most one every `dispatchRetryMaxSeconds` once the delay is longest. A diagnosis whose log made its entry pass the entry size bound would not be written. | Named as a limit. No bound was invented. |

What step 4 does not do: the client and replay; an operator's act on a
conflict or on `delivery-unavailable`; a source of declarations for a
deployment; any deployment.

## 18. A child's definition

Step 4 left a deployed scope unable to create a child: nothing supplied the
child's declaration by its digest. This closes it with no registry service.
One witness: the parent-and-child tests of the scope package now run with
the production definitions port. Only the authority and the readers are
test ports there, beside the clock and the disturbed transport.

| # | Where the contract is silent | Implemented | Why |
|---|---|---|---|
| 115 | Where a new child's declaration comes from. No registry exists. | **The rule.** A declaration is immutable bytes named by its digest. A scope retains, with its genesis, its own declaration, the declaration of every definition its own names in a `create` send, and of every definition those name in turn. A child, before its genesis turn, reads the declaration its seed names from the creator its seed names, by digest, with one call on the creator's object in the namespace. It checks that the bytes are a valid declaration with that digest. It then reads, from the same creator, the declarations it must retain for its own children. Nothing is recorded until the genesis commits, and the retained bytes are written in that transaction. The creator's incarnation is not checked for this read: the digest is the whole proof, and the source entry read just before it has already checked the incarnation. | Section 5.1: an immutable thing named by digest may be read before the turn. Section 9.2: a scope retains its definition's bytes by digest. A creator that pins a definition with a `create` send is the one party that must already know the child's definition. |
| 116 | How a directory gets the declarations it retains. | A founding takes a third value, `definitions`: a list of declarations. Each one that the directory's definition names, directly or in turn, is validated and retained by its digest. One that is supplied and not named is ignored. One that is named, supplied and not a valid declaration: the founding is refused `unsupported-definition`. **For review:** one that is named and not supplied is not retained, and the founding is still accepted; a creation under it then waits (entry 117). | A founder may not hold every declaration yet, and the fixture lane names a made-up digest. A stricter rule, refusing the founding, is a small change. |
| 117 | The answer when the declaration cannot be used. | The creator cannot be read within the fetch time limit, or retains no bytes under that digest: transport answers `retry`, reason `dependency-unavailable`. The seed names a platform definition, or the bytes are not a valid declaration with that digest: `retry`, reason `unsupported-definition`, which is added to transport's retry reasons. Nothing is recorded in either case. A limit: such a creation is sent again at the longest delay and is never diagnosed, because only routing refusals count toward giving up (entry 107). | The task's two reasons. Transport has no terminal answer but a routing refusal, and inventing one is the contract's to do. |
| 118 | How many definitions one scope retains for its children. | `namedDefinitions`, 16, temporary. A definition that names more, directly and in turn, is `unsupported-definition`: at a founding a refusal, at a creation the retry of entry 117. The bytes of one declaration are not bounded beyond the 1 MiB body of a founding request. | A walk over named definitions needs a stop. The number is owed to the proof plan. |

## 19. Replay

From step 5, in `packages/replay`, with two reads added to `packages/scope`.

| # | Where the contract is silent | Implemented | Why |
|---|---|---|---|
| 119 | What a verifier reads from a service. Section 9.1 has a history page of entries and no read of a retained input. | Two reads, each behind the read port under its own name. `log`: a history page as it is stored, each entry as its canonical JSON text with the hash stored for it, and the scope's reference and definition name as the service states them; the bounds of a history page. `retained`: one retained input by kind and digest; one over 1 MiB is `too-large` (`RETAINED_INPUT_BYTES`, temporary). Routes: `GET /v1/scopes/:scope/log?cursor=` and `GET /v1/scopes/:scope/retained/:kind/:digest`. | Section 9.4: a verifier checks an entry's bytes and hash before it reads the content. The history read returns parsed entries, and nothing returned a retained input. The stored hash beside the bytes lets a changed byte be found at its own entry. |
| 120 | What a verifier must be given. | The target scope ID, and optionally a known head: a position and a hash. The scope ID is checked as the digest of the genesis's seed, in both modes. With a known head, a history that ends before it is a mismatch at the service's head, and another entry at that position is a mismatch at that entry. The whole history the service serves is checked, through the service's head, not only up to the known head. With no known head the report lists the head under `trusts`. | An independent review found that a rewritten or forked history would otherwise pass. Section 9.5: a verifier with no head from elsewhere is trusting the service's answer, and says so. |
| 121 | What integrity mode checks, exactly. | For the target only: each entry's bytes hash to the hash the source gives; they are canonical JSON in the shape of an entry; `seq` and `prev`; one scope and incarnation throughout; times do not go back, and a clamped entry has the time of the entry before it; the scope ID; the signature of each act and of a founding. No declaration, retained input or source history is read. | Section 9.5 names the chain, the hashes and the signatures. |
| 122 | How a judgment is derived again. | The clock is the entry's recorded time. For a clamped entry the reading is not recorded, so the clock is "behind, as of the recorded time": an entry that judges time cannot then be derived, which is a mismatch. Each recorded grant is given the verdict "current". A delivery's address is the one the retained source entry's send has at that ordinal. A result's and a diagnosis's origin is this scope's own checked entry. The foreign entries are the retained copies of the entry's own `uses`, each checked against its content digest. The bounds are the caller's, or the proposed ones, with the guard scan limit removed. The derived input, `uses`, `prepared`, `effects` and `sends` are compared in that order, then the whole entry. A judge that answers anything but "write", or that fails, is a mismatch at that entry. | Section 9.3. Section 5.3: an entry that judges time is never clamped. Entry 6: a verifier passes a limit that never stops. |
| 123 | "Each rule from its retained inputs" (section 9.3). | Each recorded rule result is evaluated again, with derive's evaluator, over the retained input, whose bytes must hash to the recorded digest. Another result is a mismatch. The judge then checks that the digest is of what the rule reads in that commit. | A recorded result that no evaluation gives would otherwise be taken on trust. |
| 124 | **For review.** How a foreign fact is shown, in what order, and what an anchor covers. | An anchor covers exactly the entry it names, by scope, position and hash; it shows nothing about earlier entries of that scope. Without one, the source is replayed from its genesis up to that entry. The hash of the source's entry at that position is compared with the reference before that entry's content is read, so a changed source entry is reported at the entry that used it. The source's incarnation and kind must be the reference's. The definition name retained with a copy must be the name the source's genesis pins; for an anchored entry it is trusted. A reference to an entry of a scope that is not yet checked that far, while that scope is being checked, is a circle and a mismatch. | Section 9.4. A head of the source as an anchor for earlier entries needs the source's chain between them; it is not implemented. |
| 125 | Which result each failure gets. | A source that cannot be read, or that ends before the entry named: `missing-dependency`, at the entry that used it. A source with another entry there, or another incarnation: `mismatch`, at the entry that used it. A failure inside a source's own replay: that result, at the source's entry. A retained input that is missing, or whose bytes are not what its digest names: `incomplete`. A platform definition: `unsupported-definition`. A declaration that fails validation under the bounds given: `unsupported-definition`, but `genesis-timed` is a `mismatch`. A target that cannot be read at all gives no report: the call fails, and the command exits 2. The check stops at the first finding. | Sections 9.2 to 9.4 name the results and not every case. |
| 126 | The limits, and what coverage means. | Scopes read, entries read, bytes read (entries and retained inputs) and the depth of a chain of foreign facts. Defaults: 64, 100,000, 256 MiB and 16, this package's choice and temporary. A limit reached is `incomplete`. Coverage lists a scope's entries only when they were checked to their end, with every fact they used shown; `from` is always 0. | Section 9.4 asks for limits and owes the numbers to the proof plan. No checkpoint is used as a start, so no coverage begins later. |
| 127 | What replay does not check, beyond section 9.3's third column. | The fact that issued a grant, because the membership contract is not written. An outcome's evidence. Whether an entry left room in the scope's entry budget (`scope-full`): the count depends on a bound the history does not record. Each is listed under `trusts`, or in the package's guide. | Section 9.3 says the verifier checks the grant's issuing fact; that waits for the authority note. |
| 128 | What a report carries beside section 9.5's fields, and the command. | `verify` returns the report and `why`: one sentence on what was found. For a result that is not `consistent`, `target` is the head the check was aiming for. The rendering does not use the word "verified". The command: `artroom-replay <service URL> <scope ID> [--mode integrity|replay] [--head <seq>:<hash>] [--anchor <scope>:<seq>:<hash>]... [--json]`; exit 0 consistent, 1 not consistent, 2 for usage or a target that cannot be read. It sends no reader credential. | A reader needs the reason, and the contract's `Report` has no field for it. |
| 129 | Checkpoints and segments. | A checkpoint entry is derived again by its judge, against the fold through that sequence. A replay always starts at the genesis. The sealed segment of section 9.2 is not built or read. | The task: a checkpoint is checked, never trusted as proof of the prefix. |

## 20. Client

From step 5, in `packages/client` and `packages/contract`.

| # | Where the contract is silent | Implemented | Why |
|---|---|---|---|
| 130 | One declared interface for the service and its clients. | `ScopeApi`, in the contract's `transport.ts`: a founding, an act, a settlement and each read, with the scope ID first. The Worker's service entrypoint implements it, and the client's `Transport` is that type. The shapes it names moved into the contract as types: `Item`, `Party`, `Status`, `Summary`, `Sealed`, `Duty`, `Dispatched`, `Founded`, `RetainedInput` and `LogPage`. The derive and scope packages export them again under their earlier names. A typechecked file asserts both sides. | The client may import neither derive nor scope, and both sides must name one type. |
| 131 | The lifetime of an intent a client builds. Section 2.1 bounds `notAfter` after signing; entry 11 judges it on the commit clock. | `notAfter` is the signing time plus a lifetime, in whole seconds. The default lifetime is five minutes. A lifetime past the bound, 15 minutes by default, is refused before signing. The idempotency key is 16 random bytes as base64url. | A lifetime at the bound is refused whenever the service's clock is behind the signer's. |
| 132 | What a signer is. | A key ID and a function from bytes to a base64url signature. Two are supplied: over a 32-byte secret, and over a WebCrypto key that is not extractable and is not stored. Signatures are checked only by the bytes package. The review of the earlier `keys.ts`, `canonical.ts` and `errors.ts` is in the client's guide: the bytes package replaces all but the non-extractable signer and the fresh key. | Section 11.5: keep after review. One implementation judges a signature. |
| 133 | What a client does when it has no answer. | `submit` rejects with `TransportError` and does not retry. The caller submits the same signed intent again; so after an `unavailable` answer. `settle` reads the receipt later. | Section 4.2: a retry of an accepted intent returns the same receipt, and only the same intent is that retry. |
| 134 | Following a receipt and a duty. | `followReceipt` reads the entry at the receipt's position and computes its hash from the entry; another hash is `hash-mismatch`, a reason outside the read refusals, or `wrong-incarnation` when the entry names another incarnation. `followDuty` uses a new read, the outbox row of one send: `GET /v1/scopes/:scope/outbox/:duty`, under the outbox's read name. | Section 11.5 names both and gives no form. The outbox page's cursor is opaque, so one send needed its own read. |
| 135 | How a client reads a scope's published definition. | The summary names the definition's digest; the `retained` read returns the declaration; the client checks the digest. A platform definition is `unsupported-definition`. | The client does not derive judgments. It learns the acts and their fields by reading. |
| 136 | The two transports. | Over HTTP the body is the answer and the status is not read; a reply that is not an answer is a `TransportError`; a reader that is a text is sent as the `Authorization` header. Over a service binding each operation is one call on the entrypoint, and each result is disposed once read. | Entry 111: a body is the contract's own answer. |

What step 5 does not do: a reader credential for the command or a session
for the client, which are the authority note's; an anchor read from a
repository; export of sealed segments; replay of a platform definition.

## 21. Corrections after the static report a8a34b4d

| # | Where the contract is silent, or the source was wrong | Implemented | Why |
|---|---|---|---|
| 137 | The size of a timed entry that copies a party list (section 15, "A timed entry always fits"). The estimate read every party slot as one member. A timed rule may copy a party list into a reference slot of a matching list type, and the entry then holds every member of the list. | The estimate reads each slot with the type the validator gave it: a party list is a list of members with its declared `max`, or `listElements` when it declares none. A copy of it, and a notice to it, are counted at every member it can hold. | A definition passed whose due transition could become an entry over `entryBytes`, which the turn can never write. Witness, in derive's validator test: the fixture lane with a list of four watchers that the hold's end copies. At `entryBytes` 6,000 it is refused `bound`; before, it passed there. Under the proposed bounds it passes, and its real entry, with the list full of the longest handles, is over 6,000 bytes and within the bound the validator states. |
| 138 | The size of a request body (entry 111). The route read the whole body as text and compared its length in UTF-16 units with the limit. | The budget is 1 MiB of raw bytes, counted while the body is read. A body that declares more in `Content-Length` is not read. One that sends more is cancelled at the chunk that passes the budget. Bytes that are not UTF-8 are no JSON. Each is answered 400 `bad-request`, as before, and no operation is called. | A body of three-byte characters passed at nearly three times the limit, and any oversized body was held whole before it was refused. Witness, in the route test: a founding padded with 400,000 three-byte characters is 400, and is accepted without the padding; a body with no end is cancelled after 1 MiB and one chunk. |
| 139 | A path that is not percent-encoded UTF-8, such as `/v1/scopes/%`. Decoding it threw before any response. | 400 `bad-request`, before any operation. | A request must get a stable answer. Witness: the same route test. |

## 22. Two capacity seams, as the contract's candidate revision 10 decides them

Event `cc570904` names two places where the count of section 15 did not
keep its own promise. The scope contract's candidate revision 10 (`f52573e7`,
sections 17.2, 17.3a and 17.4) decides both, and the source follows it.
That revision is not adopted yet: if it changes, these entries change with
it. The count is still of entries only (section 15, "Bytes").

| # | The contract's candidate rule | Implemented | Where the source stops short, and the witness |
|---|---|---|---|
| 140 | The closing checkpoint (section 17.2, row 8). One entry is reserved, once for the scope, from the genesis on, except while the head entry is a checkpoint and no other duty is pending. A checkpoint written with no other duty pending is the closing checkpoint and uses the reservation. A checkpoint beside a pending duty, or on a head that is a checkpoint, is new work. The next entry that is not a checkpoint arms the reservation again. | `owed(view, definition, head)` leaves the checkpoint out exactly in that case, read from the head entry's input and the other duties; no flag is kept. `fits` asks every checkpoint: one beside a pending duty needs a free entry, and the closing one fits because its entry was reserved. A checkpoint that does not fit is answered `unavailable`. Before, the count owed one checkpoint at every head and let every checkpoint into that entry. | Witnesses, in the scope's turn test: the fourth witness of section 17.4 with 6 entries (a checkpoint beside the pending hold is not written; after the hold's end the closing checkpoint is entry 5) and with 7 (it is written into the free entry, and the closing checkpoint is entry 6); and with 3 entries, a remark after a closing checkpoint is refused `scope-full` while a second checkpoint is written. The size of a checkpoint entry in bytes is not reserved. |
| 141 | A request's clauses (section 17.2, row 1). A request reserves its 2 entries and the largest, over its clauses `applied`, `refused`, `superseded` and `undelivered`, of the closures of the duties the clause can create: a deadline, when an effect can set a state a timed rule lists, or that rule's deadline slot. Each request reserves it for itself. A `conflict` is not reserved: it is new work. | The validator derives `clauseEntries`: for each clause, one deadline for each subject, at the chain of the state it sets or of the rule whose deadline slot it sets; the largest over the clauses. Each open request reserves it beside its entries, before and after a `delivery-unavailable` diagnosis. A delivery of a `conflict` result is asked like new work, and at capacity transport answers `retry`. | **For review.** `clauseEntries` is one number for the definition: the largest over every request send, not the amount of each request's own send. The folded state does not hold which send form a request came from. So a request may reserve more than its own closure, never less. Duties of rows 3 and 6 do not exist in this source, so a clause creates deadlines only. Witness, in derive's composition test: the fifth witness of section 17.4, on the fixture ticket: the act reserves 8 and is asked for 11 entries with the two this fixture starts with; the rows after it are 7, 5, 4, 3, 2, 1 and 0 reserved, and written and reserved are 11 in every row. |
| 142 | A chain of timed rules (sections 17.2, row 2, and 17.3a). Rule r leads to rule s when r can set a state that the `states` of s list. A deadline reserves one entry for each rule of its longest chain. Rules of one type that lead to one another in a cycle are refused `reserve-unbounded`. | The validator derives `deadlines`: for each timed type and each live state a timed rule applies in, the longest chain from that state. `owed` counts that for each item in that state. A cycle is refused `reserve-unbounded`. An item in a live state that no timed rule lists reserves nothing; the act, handler or clause that puts it under a rule is counted then. | The static rule of section 17.3a, the type's `max` times its longest chain plus one, is not used: the count is by duty, in the commit, and is never more than that sum. `reserve-unbounded` has this one case here: no form of this source has `settles`, and every retained input has a bound. Witnesses: the table of section 17.3a on the fixture ticket (a chain of 2 reserves 2, and both timed entries are written from it); one validator row for the cycle. |

What stays open. The count is of entries only: items, records, pending
requests and bytes are not counted. Sends that are not requests, and the
duties of other scopes, are as section 15 lists them.

## 23. Corrections to the client and to replay after two static readings of step 5

From events `5fc07d88` and `8b8ed665`. Each row has one witness.

| # | Where the contract is silent, or the source was wrong | Implemented | Why, and the witness |
|---|---|---|---|
| 143 | What a client's transport may return as an answer (entry 136). The HTTP transport returned any JSON object that had the member `answer` or `ok`. | For each operation, a reply is returned only if it is an answer of that operation: the discriminant is one the contract names; the reason is one the contract names for that answer; an `accepted` has a receipt with a whole fact; an act's refusal has the head it was judged at; a read has its position, `complete` and a value of the route's shape. Anything else is a `TransportError`. Both transports apply it. The tables of reasons are typed against the contract's unions, so a new reason does not compile until it is listed. | `{ answer: null }`, `{ ok: "yes" }` and an `accepted` with no receipt were outcomes. The check is of shape only; whether a receipt is of this history is entry 144's. Witness: the client's intent test, eleven replies refused and six returned. |
| 144 | Following a receipt (entry 134). The incarnation was compared only after the hash had failed, so a receipt with a true position and hash and another incarnation was followed as good. | The entry read is checked against the whole fact: scope, kind and position, then incarnation, then the hash computed here. Another incarnation is `wrong-incarnation`; another scope, kind or position is `reference-mismatch`, a new reason beside `hash-mismatch`. | Section 3: a fact reference is one scope, incarnation, position and hash. Witness: the handle test in the scope package, over both transports. |
| 145 | The intent a client signs (entry 131). The intent held the caller's own objects while the signer was awaited. | The intent is read once into its canonical bytes and parsed back from them before the signer is called. The signed bytes and the returned intent are that one value. A value with no canonical form is refused before signing. | A form edited while a signer waits for a person changed the returned intent after its bytes were fixed, and the result failed its own signature. Witness: the intent test, with a signer that answers when released. |
| 146 | What a verifier takes in from a source (entry 126). `httpSource` read a whole body as text, parsed it and built the page before any limit counted, and had no deadline. | A read is given what it may take in: raw reply bytes, and for a page a number of entries. `httpSource` reads the body by chunks, cancels at the chunk that passes that amount, and decodes nothing of such a reply. The verifier allows what is left of its byte limit, and at most 4 MiB for one page or one retained input and 200 entries for one page. The byte limit now counts raw reply bytes as read. A page is kept only if it is the entries from the position asked, in order. | Every reply is untrusted. Units and defaults are in the package's guide; all are temporary. Witness: the command test, with a body that has no end and a page of three entries where two are allowed; and a row of the verifier's table for the byte limit. |
| 147 | A deadline for one read, and what each failure is called. | 30 seconds for one read (`READ_SECONDS`, temporary); the request is aborted. A deadline passed is a read error: `verify` rejects with `SourceError`, the command exits 2, and there is no report. A limit reached is `incomplete` with the coverage so far. A limit that stops the first read of the target, such as a limit of no scopes, is a read error too, where before it escaped as an exception of another kind. | A report states coverage; with nothing read there is none to state. Witness: the same command test. |
| 148 | The retained read on the service (entry 119). The whole text was loaded, and its bytes built, before the 1 MiB refusal. | The stored size is asked of SQLite first, and an input over the bound is `too-large` before any of it is read. | The bound was on the response and not on what the read held. Witness: a line of the scope's reads test. |
| 149 | Replay and the entry size bound (section 7.5). Replay compared derivation and never the entry's size. | In replay mode an entry whose canonical bytes are more than `entryBytes` of the bounds given is a `mismatch` at that entry, before it is derived or folded. Integrity mode reads no bounds and does not check it. | The runtime seals no such entry, so a history with one was not written under those bounds though it derives. It is separate from the traversal's byte limit, which is `incomplete`, and from the entry budget of entry 127. Witness: a row of the verifier's table. The rendering now says its checks were made "within the coverage stated below". |
| 150 | Which Node runs the `artroom-replay` executable. `src/bin.ts` is TypeScript under a bare `node`, and `engines` allowed all of Node 22. | `engines` of the replay package is `^22.18.0 \|\| >=23.6.0`: where Node runs a TypeScript file with no flag, by its documentation. No build or bootstrap is added. | Run here under Node 26.10.0 only; nothing is claimed as checked for another version. Witness: the command test starts the executable with the Node that runs the tests, and reads its usage and exit code 2. |

## 24. Corrections after the delivery checkpoint a9f3cb53

From event `e1ce2d76` and the planner's static reading of the client. The
scope contract's revision 10 (`f52573e7`) is now the adopted revision
(workroom act `85c18b66`), so where section 22 says "candidate" and "not
adopted yet", read "adopted".

| # | Where the contract is silent, or the source was wrong | Implemented | Why, and the witness |
|---|---|---|---|
| 151 | The work of reading the graph of timed rules (entry 142). The cycle check kept every reference of a frontier, and the longest chain was computed again for every path, so the work grew with the number of paths: 16 states with four rules for each of 15 transitions is 60 rules and 4^14 paths from one rule. | `timedGraph` in the validator builds, once, the list of rules that apply in each state of each type. One traversal (Tarjan's strongly connected components, with its own stack) enters each rule once and follows each lead once. A rule among several that reach one another is refused `reserve-unbounded`. Otherwise a rule's chain is one more than the longest chain it leads to, computed once when the rule is left. The reserve of a state, and of a deadline slot a result clause sets, are read from those lengths. | No rule changes: the same definitions pass, the same rules are refused, and the chain lengths, `deadlines` and `clauseEntries` are the same. No bound on timed rules is added. The function reports its work as rules entered and leads followed. Witness, in the validator test: that graph validates, with a reserve of 15 at `s0` down to 1 at `s14`, in 60 rules and 224 leads; with one rule from `s14` back to `s0`, 57 rules are refused and the four into the final state are not, in 61 rules and 232 leads. Compared here, and not kept as a test: the earlier loops and this function gave the same cycles and lengths on 3,000 random graphs of up to 9 rules. |
| 152 | What a client's transport may return, to the depth of each result (entry 143). A reply passed with the right discriminant, reason and position while its value lacked members the contract requires: a receipt with no `epoch`, an item with no `opened`, slots or `attributed`, a summary with no `time`, a duty with no `acknowledged`, `result` or `diagnosis`, an entry with only a hash beside it. A scope kind, a status, a message class, a retained kind and a definition name were any text. | For every operation, on both transports, the value must have every member the contract requires of it, each of its kind: a receipt, an item, a summary, a sealed entry with the members of an entry, a duty, a log page and a retained input. Names from a closed set are checked against it, in tables typed against the contract's unions. A read's refusal may carry a `detail` only if it is a scope or a fact reference. | The handle hands the reply on under the contract's type, so a caller would read a missing member as present. When this entry was written the check stopped at the contract's own members, and what an effect, an input or a slot holds was not read; entry 154 reads them. Witness: the client's intent test, a second test beside the one of entry 143: for found, submit, settle, summary, items, history, entry, outbox and followDuty, on each transport, the replies that are returned and each reply with one required member removed; and followReceipt over a reply that is no entry. The handle test in the scope package passes the real service's replies through the same checks. |

The delivery note (`notes/2026-10-05-i1-delivery.md`, sections 1 and 5) now
says that revision 10 is the adopted contract, that entries 1 to 114 are
disposed of in it, and that entries 115 to 150 are owed to its successor
(request `108ea663`). It counts the two entries of this section. Its section
6 still names two rows as owned by "revision 10, when adopted"; those rows
are not changed here. They are corrected with the repairs of section 25.

## 25. Repairs after the complete review 2d706f18

Three findings of the complete review of head `97518f68`. Each row has its
witness.

| # | Where the contract is silent, or the source was wrong | Implemented | Why, and the witness |
|---|---|---|---|
| 153 | Names. The validator accepts any non-empty name, and so `__proto__`, `constructor` and `toString`. Two records were built by assigning `record[name]`: the fields `readFields` returns, and the validator's `deadlines`. For `__proto__` that assignment sets the prototype and adds no name. Many reads were `record[name]`, which for a name the record does not hold returns what every object inherits. | One convention, stated at `own` in derive's `values.ts`. A record keyed by a chosen name is built so that each name is an own property: by a parse, `Object.fromEntries`, a spread or a computed key. It is read with `own(record, name)`, which returns only an own property. Changed: `readFields`, `factsNamed`, `readFacts`, `bound`, `runHandler` and `runClause` in `frame.ts`; every read of a field, a slot, an item type and a state in `effects.ts`, `fold.ts`, `guards.ts`, `sends.ts`, `attribution.ts`, `judge.ts`, `genesis.ts` and `timed.ts`; in `validate.ts` the `deadlines` table, the field-shape table, the profile table, the genesis act, and the checks for a required and an empty key; the guards' exact-key check in `values.ts`; and the act and item type lookups of the scope package's `core.ts`, `delivery.ts` and `reads.ts`. No name is refused. `readFacts` and `factsNamed` now pass over a field that has no declared type, as a handler's message field has none. | Section 6.6: a slot never holds a value outside its type; section 17.2: a deadline reserves its chain. A text field named `__proto__` lost its value and its slot held an object; an item type named `__proto__` reserved nothing for its timed rules. Not changed: a test of a fixed grammar key on a record that came from a parse (`"field" in operand`), which no inherited name satisfies; the replay and client packages, where no such read was found; and the rule profile, which reserves `__proto__`, `constructor` and `prototype` as keys of a rule's input, so a `rule` guard over such a field is false (`reserved_key`). Witness, in derive's timed test, from parsed JSON: an item type, an act, a field, a value slot, a state and a timed rule named `__proto__`, and a second rule named `constructor`. The act is written with the text in the slot. The opening reserves two entries and the closing checkpoint: with the two entries the fixture starts with it fits in 6 entries and not in 5, both transitions are written, and a fold of the entries gives the same state. Without the change the test fails at its first line. The bytes test now reads `__proto__` as an own key at two depths. |
| 154 | What a client's transport may return, inside each result (entries 143 and 152). A reply passed while a fixed record inside it was malformed: an effect with no item or with a name the contract does not have; an act input with no signed intent or authority; an input of an unknown type; a use, a prepared result, a send, an attributed member or a party given as `{}`. One table of refusals served a founding and an act, so an act could be answered `source-unverified` or `unsupported-definition`. | The guards are in one file, `packages/bytes/src/records.ts`, beside the identifier guards: one guard for each fixed record of the contract. A record passes when it is a variant the contract names, with every member that variant requires, each of its kind, and no other member. Covered: `ScopeRef`, `FactRef`, `MemberRef`, `Head`, `Seed`, `Intent`, `SignedIntent`, `Grant`, `Message` in its four classes, `Send`, `Effect` in its twelve names, `Input` in its seven types and a delivery by its message's class, `FactUse`, `Prepared`, `Attempt`, `Entry`, `Sealed`, `Receipt`, `Item` with each party, reference, value and attributed member, `Summary`, `Duty`, `LogPage`, `RetainedInput` and `Read`. A timestamp is checked by `timeMs`, which moved to the bytes package with `timeOf`; derive exports both as before. The client's `answers.ts` keeps only what is its own: the answers of each operation, each with exactly its members, and a refusal table for an act (`RefusalReason`) and one for a founding (with `source-unverified` and `unsupported-definition`). No second copy: derive's `isScopeRef`, `isMemberRef`, `isFactRef`, `isLocalId`, `isIntent` and its seed check, the scope's grant check and replay's entry check are now these guards. | The handle hands a reply on under the contract's type. **What stays opaque**, because the contract gives it to another owner or to the application: the body of a request or an advisory; the evidence of an outcome; a grant's `within` and `fresh`; the value of each field of an intent and of an `index` effect; whether a slot's value is of the type its definition declares (it is checked to be a text, an integer, a truth value, a reference, or a list of those); and the text of a stored entry in a log page and of a retained input, which a reader hashes and parses itself. The check is of shape: it verifies no signature, proves no receipt, and judges nothing. Three checks became stricter where they were shared: a seed's `definition` must be a digest or a platform name, where the genesis judge took any text; a grant's `key` must be a key ID and a grant has no other member, where the scope took any text; and replay's entry check reads every record of an entry, where it read the input's outer members. Every existing test passes unchanged. Witness: the rows the review names, added to the client's second reply test, on both transports: a receipt with the effect `{ effect: "state" }` and with an unknown effect; an act refused `source-unverified` and `unsupported-definition`, and a founding refused `source-unverified`, which is returned; an entry whose input is `{ type: "act" }` or of an unknown type, and whose `uses`, `prepared` or `sends` hold `{}`; an item with `attributed: [{}]` and with a party `{}`. With the earlier checker the test fails at the first of them. The handle test in the scope package passes the real service's replies through the same guards. |
| 155 | What a client's HTTP transport takes in, and how long it waits (entry 136). It awaited the whole body as text with no bound, and a request or a body that never ended left the call pending for ever. | The body is read as raw bytes, chunk by chunk. At the chunk that passes 4 MiB (`REPLY_BYTES`) the body is cancelled, and nothing of it is joined, decoded or parsed. One request with its whole reply has 30 seconds (`REPLY_SECONDS`); then it is aborted through the signal given to `fetch`. Both are named values of the client's `http.ts`, both temporary, and a caller may give others. Each case is a `TransportError`. For a founding and an act every `TransportError` of this transport now ends: "The outcome of the submitted intent is unknown: it may have been recorded. The same signed intent may be sent again." For a read it says nothing was read. The reader is written once, in the bytes package's `take.ts` (`takeBytes` and `within`): it is small and uses only a byte stream, a timer and an abort signal, which the package's `web` declarations now state. The replay package's `httpSource` reads through the same two functions, and its own copy and its own declarations are removed. The `Fetch` a caller may supply now returns a `body` stream and no `text()`. | Every reply is untrusted, and the correction of the adapters owed a bound on what is taken in and on the wait. 4 MiB is four times the contract's 1 MiB bound on a history page and on a retained input, because a JSON reply escapes the text it carries; replay allows itself the same. Not done: the transport over a service binding has no limit and no deadline, and no caller's own cancellation signal is taken; both stay with the owners of the whole-call policy. A `fetch` that ignores the signal is not stopped, but nothing more of its body is kept. Witness, in the client's intent test: a body with no end is cancelled after 4,096 bytes and one chunk; a body that starts and never ends, and a service that never answers, are each given up after 10 milliseconds with the signal aborted; each error carries the sentence above; and a failed read says that nothing was read. The replay command's own test of its limits passes unchanged over the shared reader. |
