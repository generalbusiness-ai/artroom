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
}

export const PROPOSED_BOUNDS: Bounds = {
  intentLifetimeSeconds: 15 * 60,
  items: 12,
  acts: 48,
  receives: 24,
  textBytes: 64 * 1024,
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
};
