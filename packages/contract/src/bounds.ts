/**
 * Every bound of the scope contract's sections 6 and 7.5, and the intent
 * lifetime of section 2.1, as one configurable value.
 *
 * The numbers in `PROPOSED_BOUNDS` are the contract's proposals. They are
 * temporary: measured budgets replace them. Code takes a `Bounds` value and
 * never reads a number from here directly.
 */
export interface Bounds {
  // Section 2.1
  intentLifetimeSeconds: number;   // `notAfter` is at most this long after signing

  // Section 6: a definition
  items: number;                   // item types
  acts: number;
  receives: number;
  textBytes: number;               // one text field
  memberBytes: number;             // one member handle. The contract states none; temporary, and the authority note's to set
  listElements: number;            // one list field or slot; also what one `every` guard reads
  states: number;                  // of one item type
  parties: number;                 // party slots of one item type
  refs: number;                    // reference slots of one item type
  values: number;                  // value slots of one item type
  also: number;                    // other local items one act names
  guards: number;                  // of one act
  effects: number;                 // of one act
  sends: number;                   // of one act
  attention: number;               // of one act

  // Section 6.5: one range guard with a `where`. The contract owes these to the proof plan.
  guardPage: number;               // items in one page of the scan
  guardScan: number;               // items one guard reads before its scan stops unfinished

  // Section 7.5: a running scope
  entryBytes: number;
  usesPerEntry: number;            // foreign entries used by one entry
  sendsPerEntry: number;
  decompositionDepth: number;
  deliveryBatch: number;
  fetchSeconds: number;            // one fetch before the turn
  preparationSeconds: number;
  turnRestarts: number;
  timedAttemptsPerTurn: number;
  routingRefusals: number;         // before a sender stops and writes a diagnosis; a retry policy, not a proof

  // Section 9.2: a scope's budget. The contract owes both to the proof plan (R4). The values are temporary.
  scopeEntries: number;            // entries one scope may hold. An entry that admits duties is refused `scope-full` unless every admitted duty still has an entry to settle in
  // Section 7.4: sending. The contract states none of these; all are retry policies, temporary, and owed to the proof plan.
  dispatchSeconds: number;         // how long a sender waits for the answer to one dispatch before the attempt counts as unanswered
  dispatchRetrySeconds: number;    // the delay before a duty's second attempt; it doubles with each further attempt
  dispatchRetryMaxSeconds: number; // the longest delay between two attempts of one duty
  drainRetrySeconds: number;       // section 5.2: the delay before the alarm that follows a turn which left a transition due; a retry policy
}

export const PROPOSED_BOUNDS: Bounds = {
  intentLifetimeSeconds: 15 * 60,
  items: 12,
  acts: 48,
  receives: 24,
  textBytes: 64 * 1024,
  memberBytes: 256,
  listElements: 32,
  states: 16,
  parties: 8,
  refs: 12,
  values: 8,
  also: 3,
  guards: 16,
  effects: 16,
  sends: 8,
  attention: 8,
  guardPage: 100,
  guardScan: 1000,
  entryBytes: 256 * 1024,
  usesPerEntry: 64,
  sendsPerEntry: 32,
  decompositionDepth: 4,
  deliveryBatch: 64,
  fetchSeconds: 10,
  preparationSeconds: 10,
  turnRestarts: 6,
  timedAttemptsPerTurn: 64,
  routingRefusals: 3,
  scopeEntries: 100_000,
  dispatchSeconds: 30,
  dispatchRetrySeconds: 1,
  dispatchRetryMaxSeconds: 300,
  drainRetrySeconds: 1,
};
