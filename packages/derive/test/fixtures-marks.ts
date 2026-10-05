/**
 * A made-up value of platform data, for the tests of marks (scope contract,
 * revision 15, sections 4.2 and 6.1; its witnesses 18.38 and 18.39). It is
 * no platform definition of Artroom. Its names are made up.
 *
 * `gate` holds tickets. A ticket is issued with the hash of a secret. The
 * act `enter` uses one, and has a mark at each place of an act:
 *
 * - `grant` is the mark `by-ticket`: no grant judges the act.
 * - The name `ticket` of `also` is the mark `find`, over the tickets.
 * - The field `note`, and the slot `ticket.note`, have the type `even`.
 * - Its guards are one written guard, and then the mark `fresh`.
 * - Its effects are two written effects, and then the mark `key-id`.
 * - Its one send is the mark `refer`, with its clauses as data.
 *
 * `outcomes` names one kind of operation, `probe`, with its mark.
 */

import type { PlatformData } from "@generalbusiness/artroom-contract";

const NO = { parties: {}, refs: {} } as const;
const EVEN = { code: "even", row: "P22", type: "code" } as const;

export const gate: PlatformData = {
  format: "artroom-definition-1",
  name: "platform:gate",
  profile: { name: "restricted", version: 1 },
  capabilities: [],
  genesis: "establish",
  items: {
    gate: { many: false, max: 1, initial: "open", states: { open: { final: false } }, parties: { opener: { fixed: true, required: true, list: false, author: false } }, refs: {}, values: {} },
    ticket: {
      ...NO, many: true, max: 100, initial: "open",
      states: { open: { final: false }, used: { final: true } },
      values: {
        hash: { fixed: true, required: true, of: { type: "digest" } },
        key: { fixed: false, required: false, of: { type: "text", max: 64 } },
        // Place 3, on a slot: the data states no shape, and the rule `even` checks each value that an effect would set.
        note: { fixed: false, required: false, of: EVEN },
      },
    },
  },
  acts: {
    establish: {
      step: "open", on: "gate", grant: "gate.establish", also: {}, fields: { opener: { type: "member", required: true } },
      guards: [], effects: [{ party: { slot: "opener", from: { field: "opener" } } }], sends: [], attention: [],
    },
    issue: {
      step: "open", on: "ticket", grant: "gate.issue", also: {}, fields: { hash: { type: "digest", required: true } },
      guards: [], effects: [{ value: { slot: "hash", from: { field: "hash" } } }], sends: [], attention: [],
    },
    enter: {
      step: "transition", on: "gate",
      // Place 1: the rule stands in place of the grant check.
      grant: { code: "by-ticket", row: "P13" },
      // Place 2: the rule gives one ticket, or none.
      also: { ticket: { code: "find", row: "P18", item: "ticket" } },
      // Place 3, on a field: the same type as the slot, so the copy below is one that the validator can show.
      fields: { secret: { type: "text", max: 64, required: true }, note: { ...EVEN, required: false } },
      // Place 4: the mark is the second guard of the written list.
      guards: [{ state: ["open"], of: "also.ticket", reason: "used" }, { code: "fresh", row: "P14" }],
      // Place 5: the mark is the last effect of the written list.
      effects: [{ state: "used", of: "also.ticket" }, { value: { slot: "note", from: { field: "note" } }, of: "also.ticket" }, { code: "key-id", row: "P14" }],
      // Place 6: the rule gives no request, or one. The clauses are data.
      sends: [{ code: "refer", row: "P21", result: { applied: [], refused: [] } }],
      attention: [],
    },
  },
  receives: {},
  timed: {},
  rules: {},
  // Place 7: the rule for the outcome entries of each kind of operation that this definition owns.
  outcomes: { probe: { code: "probe", row: "P16" } },
};
