/**
 * Fixtures for the forms of fields and of the hold type (scope contract,
 * sections 6.2 and 6.8). `board` is made up for the tests of fields: a job
 * that a timed rule decides, and a plan whose rows are records. `works` is
 * the lane of the shared fixtures with the acts that end a commitment and a
 * hold.
 */

import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { ActType, DeclaredDefinition } from "@generalbusiness/artroom-contract";
import { validateDefinition } from "../src/index.ts";
import { lane, valid } from "./fixtures.ts";

const text = { type: "text", max: 100 } as const;
const slot = { fixed: false, required: false } as const;
const fact = (...kind: string[]) => ({ type: "fact", kind, under: "board" }) as const;
const act = (a: Partial<ActType> & Pick<ActType, "step" | "on" | "grant">): ActType => ({ also: {}, fields: {}, guards: [], effects: [], sends: [], attention: [], ...a });

/** One row of a plan: a job, why it is there, and the entry that asked for it. */
const row = { type: "record", of: { job: { type: "item", of: "job", required: true }, why: { ...text, required: false }, by: { ...fact("ask"), required: false } } } as const;
const rows = { type: "list", of: row, max: 4 } as const;
const mark = { type: "record", of: { label: { ...text, required: true }, weight: { type: "int", min: 0, max: 9, required: false } } } as const;

/**
 * A board of jobs. `ask` opens a job with a deadline. The timed rule
 * `job-deadline` times it out and keeps, in `decidedBy`, the entry that did:
 * its own. `cite` names that entry as a fact. `plan` opens a plan whose rows
 * are records, with a mark that has a default, and `stamp` sets the mark
 * from a constant.
 */
export const board: DeclaredDefinition = {
  format: "artroom-definition-1", name: "board", profile: { name: "restricted", version: 1 }, capabilities: [], genesis: "start",
  items: {
    desk: { many: false, max: 1, states: { open: { final: false } }, initial: "open", parties: { owner: { fixed: true, required: true, list: false, author: false } }, refs: {}, values: {} },
    job: {
      many: true, max: 8, states: { requested: { final: false }, "timed-out": { final: false }, done: { final: true } }, initial: "requested", parties: {},
      refs: { decidedBy: { ...slot, to: fact("timed:job-deadline", "cite") } }, values: { deadline: { fixed: false, required: true, of: { type: "time" } } },
    },
    plan: { many: true, max: 4, states: { drafted: { final: false } }, initial: "drafted", parties: {}, refs: {}, values: { rows: { ...slot, of: rows }, mark: { ...slot, of: mark } } },
  },
  acts: {
    start: act({ step: "open", on: "desk", grant: "start", fields: { opener: { type: "member", required: true } }, effects: [{ party: { slot: "owner", from: { field: "opener" } } }] }),
    ask: act({ step: "open", on: "job", grant: "ask", fields: { deadline: { type: "time", required: true } }, effects: [{ value: { slot: "deadline", from: { field: "deadline" } } }] }),
    cite: act({
      step: "transition", on: "job", grant: "cite", fields: { by: { ...fact("timed:job-deadline"), required: true } },
      guards: [{ state: ["timed-out"] }, { fact: { field: "by" } }, { equals: { a: { field: "by" }, b: { slot: "decidedBy" } }, reason: "not-what-decided-it" }],
      effects: [{ state: "done" }],
    }),
    plan: act({
      step: "open", on: "plan", grant: "plan", fields: { rows: { ...rows, required: true }, mark: { ...mark, required: false, default: { label: "plain" } } },
      effects: [{ value: { slot: "rows", from: { field: "rows" } } }, { value: { slot: "mark", from: { field: "mark" } } }],
    }),
    stamp: act({ step: "transition", on: "plan", grant: "plan", guards: [{ state: ["drafted"] }], effects: [{ value: { slot: "mark", from: { const: { label: "stamped", weight: 2 } } } }] }),
  },
  receives: {},
  timed: { "job-deadline": { on: "job", states: ["requested"], deadline: "deadline", effects: [{ state: "timed-out" }, { ref: { slot: "decidedBy", from: "self" } }], attention: [] } },
  rules: {},
};
export const boardDefinition = valid(validateDefinition(board, PROPOSED_BOUNDS));

// ---------------------------------------------------------------- the hold type

const held = { state: ["held"] } as const;
const standing = { of: "also.commitment", state: ["offered", "accepted"] } as const;
const itsCommitment = { also: { commitment: { item: "commitment", by: "commitment" } }, fields: { commitment: { type: "item", of: "commitment", required: true } } } as const;

/**
 * The lane, with the ways a commitment and a hold end. `withdraw` takes a
 * commitment to a final state. `release` ends a hold by its holder, with the
 * hold effect alone. `abandon` is an act on a hold that withdraws the
 * commitment the hold is under, and sends the hold's epoch as it is after
 * the entry. `quit` does the same and ends the hold itself first.
 * `last-hold` opens a hold under a commitment and withdraws that commitment
 * in the same entry.
 */
export const works: DeclaredDefinition = {
  ...lane,
  name: "works",
  items: { ...lane.items, commitment: { ...lane.items["commitment"]!, states: { ...lane.items["commitment"]!.states, withdrawn: { final: true } } } },
  acts: {
    ...lane.acts,
    withdraw: act({ step: "transition", on: "commitment", grant: "offer", guards: [{ state: ["offered", "accepted"] }, { signer: ["requester"] }], effects: [{ state: "withdrawn" }] }),
    release: act({ step: "transition", on: "hold", grant: "hold", guards: [held, { signer: ["holder"] }], effects: [{ hold: { do: "end" } }] }),
    abandon: act({
      step: "transition", on: "hold", grant: "hold", ...itsCommitment, guards: [held, standing],
      effects: [{ of: "also.commitment", state: "withdrawn" }], sends: [{ index: { fields: { epoch: { slot: "epoch" } } } }],
    }),
    quit: act({ step: "transition", on: "hold", grant: "hold", ...itsCommitment, guards: [held, standing], effects: [{ hold: { do: "end" } }, { of: "also.commitment", state: "withdrawn" }] }),
    "last-hold": act({
      step: "open", on: "hold", grant: "hold", ...itsCommitment, guards: [standing],
      effects: [...lane.acts["take-hold"]!.effects, { of: "also.commitment", state: "withdrawn" }],
    }),
  },
};
export const worksDefinition = valid(validateDefinition(works, PROPOSED_BOUNDS));
