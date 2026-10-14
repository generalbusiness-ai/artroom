/**
 * Definitions written for the binding story (plan 031, W2 "binding"). Each is created as a lane by the room's directory, so its
 * genesis takes the fields `open-issue` sends.
 *
 * - `issueLike` is named `issue`, and its act `create` maps by its record word to `issue.create`, beside the directory's
 *   `open-issue`. Its `create` declares fields named like the server's controls: `target` and `idempotencyKey`.
 * - `roomLike` is named `room`, and its act `join` is a byte-identical copy of the inbox's `mark-read` row, under another kind
 *   and another definition name: `room.join`, beside membership's. It also declares `propose-manifest`, the kind the change
 *   definitions declare, under another name.
 */
import type { DeclaredDefinition } from "@generalbusiness/dap-contract";
import { platform } from "@generalbusiness/dap-platform";

const inbox = platform("platform:inbox@1")!.data;
const start = {
  step: "open", on: "plot", grant: "issue.open", also: {},
  fields: {
    opener: { type: "member", required: true }, title: { type: "text", max: 256, required: true }, number: { type: "int", min: 1, max: 1000000000, required: false },
    body: { type: "text", max: 65536, detached: true, required: false }, conditions: { type: "list", max: 16, of: { type: "text", max: 4096 }, required: true },
  },
  guards: [], effects: [{ party: { slot: "keeper", from: { field: "opener" } } }], sends: [], attention: [],
};
const plot = { many: false, max: 1, initial: "open", states: { open: { final: false } }, parties: { keeper: { fixed: true, required: true, list: false, author: false } }, refs: {}, values: {} };
const base = { format: "artroom-definition-1", profile: { name: "restricted", version: 1 }, capabilities: [], genesis: "start", receives: {}, timed: {}, rules: {} };

export const issueLike = {
  ...base, name: "issue",
  items: { plot, note: { many: true, max: 100, initial: "open", states: { open: { final: false } }, parties: {}, refs: {}, values: { target: { fixed: false, required: false, of: { type: "text", max: 64 } } } } },
  acts: {
    start,
    create: {
      step: "open", on: "note", grant: "issue.comment", also: {},
      fields: { target: { type: "text", max: 64, required: true }, idempotencyKey: { type: "text", max: 64, required: false } },
      guards: [], effects: [{ value: { slot: "target", from: { field: "target" } } }], sends: [], attention: [],
    },
  },
} as unknown as DeclaredDefinition;

export const roomLike = {
  ...base, name: "room",
  items: { plot, inbox: inbox.items["inbox"], notice: inbox.items["notice"] },
  acts: {
    start,
    join: inbox.acts["mark-read"],
    "propose-manifest": { step: "comment", on: null, grant: "issue.comment", also: {}, fields: { text: { type: "text", max: 64, required: true } }, guards: [], effects: [], sends: [], attention: [] },
  },
} as unknown as DeclaredDefinition;
