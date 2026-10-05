/**
 * Every bound of the scope contract's sections 6 and 7.5, and the intent
 * lifetime of section 2.1, as one configurable value.
 *
 * The numbers in `PROPOSED_BOUNDS` are the contract's proposals, as its
 * revision 11 states them. They are temporary: measured budgets replace
 * them. Code takes a `Bounds` value and never reads a number from here
 * directly.
 *
 * A bound is a configured value from the moment it is listed here. A few of
 * them bound forms that no source derives yet. Each says so, and the
 * validator refuses those forms whatever the number is.
 */
export interface Bounds {
  // Section 2.1
  intentLifetimeSeconds: number;   // `notAfter` is at most this long after signing

  // Section 6: a definition
  items: number;                   // item types
  acts: number;
  receives: number;
  timedRules: number;
  rules: number;                   // rule expressions
  definitionBytes: number;         // the canonical bytes of one definition
  textBytes: number;               // one text field
  memberBytes: number;             // one member handle. The contract states none; temporary, and the authority note's to set
  listElements: number;            // the most that the `max` of one list type may state, for every list field and list value slot (section 6.1, revision 19). A count reads the type's `max` or this, and never the length of a value
  partyMembers: number;            // one party list. The fold enforces it, and the size of a timed entry is counted at it
  states: number;                  // of one item type
  parties: number;                 // party slots of one item type
  refs: number;                    // reference slots of one item type
  values: number;                  // value slots of one item type
  also: number;                    // other local items one act names
  presents: number;                // facts that one act declares it is presented beside its intent
  guards: number;                  // of one act or handler, as written; also the clauses of one `where`
  nestedGuards: number;            // of one act or handler, counting those nested in `each`, `has` and `anyOf`
  guardDepth: number;              // how deep a guard may be nested; a guard as written is at depth 1
  effects: number;                 // of one act or handler, and of one result clause
  sends: number;                   // send forms of one act or handler, of which at most one is a fan-out
  fanOut: number;                  // sends of one fan-out: the most live items of the type its range covers
  attention: number;               // attention forms of one act, handler or timed rule
  attentionMembers: number;        // members that the attention forms of one act, handler or timed rule can tell
  sendFields: number;              // fields of one sent message

  // Section 6.5: one range guard with a `where`. The contract owes these to the proof plan.
  guardPage: number;               // items in one page of the scan
  guardScan: number;               // items one guard reads before its scan stops unfinished

  // Section 7.5: a running scope
  entryBytes: number;
  usesPerEntry: number;            // foreign entries used by one entry
  sendsPerEntry: number;           // every send of one entry: those declared, one fan-out, the platform's one result or control, and attention. The validator counts the most that an act or handler can make
  derivedEffects: number;          // the effects that code derives in one entry: a capability's effects, steps, outcomes and a hold's workspace (section 6.1, revision 16). The contract states the bound and no number; temporary, and the proof plan's to set
  decompositionDepth: number;      // the contract states the number and no rule that reads it. No source reads it
  deliveryBatch: number;
  fetchSeconds: number;            // one fetch before the turn
  preparationSeconds: number;
  turnRestarts: number;
  timedAttemptsPerTurn: number;
  routingRefusals: number;         // before a sender stops and writes a diagnosis; a retry policy, not a proof

  // Section 9.2: a scope's budget. The contract owes both to the proof plan (R4). The values are temporary.
  scopeEntries: number;            // entries one scope may hold. An entry that admits duties is refused `scope-full` unless every admitted duty still has an entry to settle in
  namedDefinitions: number;        // the definitions a scope's own definition may name in `create` sends, and those name in turn, whose bytes the scope retains for its children. The contract states none; temporary
  // Section 7.4: sending. The contract states none of these; all are retry policies, temporary, and owed to the proof plan.
  dispatchSeconds: number;         // how long a sender waits for the answer to one dispatch before the attempt counts as unanswered
  dispatchRetrySeconds: number;    // the delay before a duty's second attempt; it doubles with each further attempt
  dispatchRetryMaxSeconds: number; // the longest delay between two attempts of one duty
  drainRetrySeconds: number;       // section 5.2: the delay before the alarm that follows a turn which left a transition due; a retry policy
}

export const PROPOSED_BOUNDS: Bounds = {
  intentLifetimeSeconds: 15 * 60,
  items: 16,
  acts: 64,
  receives: 24,
  timedRules: 8,
  rules: 16,
  definitionBytes: 256 * 1024,
  textBytes: 64 * 1024,
  memberBytes: 256,
  listElements: 64,
  partyMembers: 64,
  states: 16,
  parties: 8,
  refs: 12,
  values: 12,
  also: 4,
  presents: 4,
  guards: 24,
  nestedGuards: 96,
  guardDepth: 8,
  effects: 16,
  sends: 8,
  fanOut: 32,
  attention: 8,
  attentionMembers: 64,
  sendFields: 32,
  guardPage: 100,
  guardScan: 1000,
  entryBytes: 256 * 1024,
  usesPerEntry: 128,
  sendsPerEntry: 104,
  derivedEffects: 256,
  decompositionDepth: 4,
  deliveryBatch: 64,
  fetchSeconds: 10,
  preparationSeconds: 10,
  turnRestarts: 6,
  timedAttemptsPerTurn: 64,
  routingRefusals: 3,
  scopeEntries: 100_000,
  namedDefinitions: 16,
  dispatchSeconds: 30,
  dispatchRetrySeconds: 1,
  dispatchRetryMaxSeconds: 300,
  drainRetrySeconds: 1,
};
