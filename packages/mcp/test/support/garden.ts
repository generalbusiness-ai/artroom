/**
 * An application the server has never seen, written here (plan 031, W2 "unfamiliar"): three acts, two item types, a `distinct`
 * guard, a presented fact and a detached text. Its genesis takes the fields the directory's `open-issue` sends a lane it creates
 * (opener, title, number, body, conditions), so the room's own directory creates it under the room's membership.
 */
import type { DeclaredDefinition } from "@generalbusiness/dap-contract";

const slot = { fixed: false, required: false } as const;

export const garden = {
  format: "artroom-definition-1",
  name: "garden",
  profile: { name: "restricted", version: 1 },
  capabilities: [],
  genesis: "start",
  items: {
    plot: {
      many: false, max: 1, initial: "open", states: { open: { final: false } },
      parties: { keeper: { fixed: true, required: true, list: false, author: false } },
      refs: {},
      values: { title: { ...slot, of: { type: "text", max: 256 } }, number: { ...slot, of: { type: "int", min: 1, max: 1000000000 } } },
    },
    bed: {
      many: true, max: 20, initial: "growing", states: { growing: { final: false }, harvested: { final: true } },
      parties: { gardener: { fixed: true, required: true, list: false, author: true } },
      refs: {},
      values: { crop: { ...slot, of: { type: "text", max: 64 } }, rows: { ...slot, of: { type: "list", max: 8, of: { type: "text", max: 32 } } }, note: { ...slot, of: { type: "text", max: 4096, detached: true } } },
    },
  },
  acts: {
    start: {
      step: "open", on: "plot", grant: "issue.open", also: {},
      fields: {
        opener: { type: "member", required: true }, title: { type: "text", max: 256, required: true }, number: { type: "int", min: 1, max: 1000000000, required: false },
        body: { type: "text", max: 65536, detached: true, required: false }, conditions: { type: "list", max: 16, of: { type: "text", max: 4096 }, required: true },
      },
      guards: [],
      effects: [{ party: { slot: "keeper", from: { field: "opener" } } }, { value: { slot: "title", from: { field: "title" } } }, { value: { slot: "number", from: { field: "number" } } }],
      sends: [], attention: [],
    },
    plant: {
      step: "open", on: "bed", grant: "issue.comment", also: {},
      fields: { crop: { type: "text", max: 64, required: true }, rows: { type: "list", max: 8, of: { type: "text", max: 32 }, required: true }, note: { type: "text", max: 4096, detached: true, required: false } },
      guards: [{ distinct: { list: { field: "rows" }, as: "row", key: { element: "row" } }, reason: "rows-repeat" }],
      effects: [{ party: { slot: "gardener", from: { signer: true } } }, { value: { slot: "crop", from: { field: "crop" } } }, { value: { slot: "rows", from: { field: "rows" } } }, { value: { slot: "note", from: { field: "note" } } }],
      sends: [], attention: [],
    },
    tend: {
      step: "transition", on: "bed", grant: "issue.comment", also: {},
      fields: { note: { type: "text", max: 4096, detached: true, required: true } },
      guards: [{ state: ["growing"] }, { signer: ["gardener"], reason: "not-your-bed" }],
      effects: [{ value: { slot: "note", from: { field: "note" } } }],
      sends: [], attention: [],
    },
    harvest: {
      step: "transition", on: "bed", grant: "issue.comment", also: {},
      fields: {},
      presents: { planting: { kind: ["plant"], under: "garden", required: true } },
      guards: [{ state: ["growing"] }, { fact: { presented: "planting" }, reason: "no-planting" }, { equals: { a: { presented: "planting", part: "seq" }, b: { item: "on" } }, reason: "another-bed" }],
      effects: [{ state: "harvested" }],
      sends: [], attention: [],
    },
  },
  receives: {}, timed: {}, rules: {},
} as unknown as DeclaredDefinition;
