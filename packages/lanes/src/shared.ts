/**
 * The rows that the lane forms state once for both definitions (lane forms,
 * revision 14, sections 3.1, 3.4, 3.7, 3.9 and 4.3): the `hold` and `export`
 * item types, six of the seven discussion acts, the acts on a hold that are
 * the same in both lanes, the timed rule that ends a hold, and the two export
 * handlers.
 *
 * A row here is the row of the `issue` definition. Where the two definitions
 * differ in a row only by a grant's prefix or by the definition's name, the
 * row is a function of that prefix or that name. A row that differs in any
 * other way is written in each definition's own file: the `comment` act, which
 * names a thread in `change`, and `take-hold`, which names the pull request.
 *
 * One member is one row. The guards, effects, sends and attention forms of a
 * row are in the order of the row, one to a line; a long form is broken over
 * lines.
 */

import type { ActType, AdoptedReceiveType, DeclaredDefinition, ItemType, TimedRule } from "@generalbusiness/artroom-contract";

/** A lane definition: a declared definition whose handlers are all in the adopted form. */
export type LaneDefinition = Omit<DeclaredDefinition, "receives"> & { receives: Record<string, AdoptedReceiveType> };

/** Sections 3.1 and 4.1: the item types `hold` and `export`. */
export const holdItems = {
  hold: {
    many: true, max: 16, initial: "held",
    states: { held: { final: false }, ended: { final: true } },
    parties: { holder: { fixed: false, required: true, list: false, author: false } },
    refs: { under: { fixed: true, required: true, to: { type: "item", of: "commitment" } } },
    values: {
      extent: { fixed: false, required: false, of: { type: "text", max: 1024 } },
      ends: { fixed: false, required: true, of: { type: "time" } },
      epoch: { fixed: false, required: true, of: { type: "int", min: 1, max: 1000000 } },
    },
  },
  export: {
    many: true, max: 16, initial: "authorized",
    states: { authorized: { final: false }, done: { final: true }, refused: { final: true } },
    parties: {
      from: { fixed: true, required: true, list: false, author: false },
      to: { fixed: true, required: true, list: false, author: false },
      authorizer: { fixed: true, required: true, list: false, author: false },
    },
    refs: { hold: { fixed: true, required: true, to: { type: "item", of: "hold" } } },
    values: {},
  },
} as const satisfies Record<string, ItemType>;

/** Section 3.7: the discussion acts on a comment that exists. `prefix` is `issue` or `change`. */
export const discussionActs = <P extends string>(prefix: P) => ({
  "edit-comment-own": {
    step: "transition", on: "comment", grant: `${prefix}.comment`,
    also: {},
    fields: { body: { type: "text", max: 65536, detached: true, required: true } },
    guards: [
      { state: ["visible", "collapsed"] },
      { signer: ["author"] },
    ],
    effects: [{ value: { slot: "body", from: { field: "body" } } }],
    sends: [],
    attention: [],
  },
  "edit-comment-any": {
    step: "transition", on: "comment", grant: `${prefix}.edit-any`,
    also: {},
    fields: { body: { type: "text", max: 65536, detached: true, required: true } },
    guards: [{ state: ["visible", "collapsed"] }],
    effects: [{ value: { slot: "body", from: { field: "body" } } }],
    sends: [],
    attention: [],
  },
  "collapse-comment": {
    step: "transition", on: "comment", grant: `${prefix}.triage`,
    also: {},
    fields: { reason: { type: "text", max: 1024, required: true } },
    guards: [{ state: ["visible"] }],
    effects: [
      { state: "collapsed" },
      { value: { slot: "collapseReason", from: { field: "reason" } } },
    ],
    sends: [],
    attention: [],
  },
  "expand-comment": {
    step: "transition", on: "comment", grant: `${prefix}.triage`,
    also: {},
    fields: {},
    guards: [{ state: ["collapsed"] }],
    effects: [
      { state: "visible" },
      { value: { slot: "collapseReason", from: null } },
    ],
    sends: [],
    attention: [],
  },
  "redact-comment-own": {
    step: "transition", on: "comment", grant: `${prefix}.comment`,
    also: {},
    fields: {},
    guards: [
      { state: ["visible", "collapsed"] },
      { signer: ["author"] },
    ],
    effects: [
      { state: "redacted" },
      { redact: { slot: "body" } },
    ],
    sends: [],
    attention: [],
  },
  "redact-comment-any": {
    step: "transition", on: "comment", grant: `${prefix}.edit-any`,
    also: {},
    fields: {},
    guards: [{ state: ["visible", "collapsed"] }],
    effects: [
      { state: "redacted" },
      { redact: { slot: "body" } },
    ],
    sends: [],
    attention: [],
  },
} as const satisfies Record<string, ActType>);

/** Sections 3.4 and 4.3: the acts on a hold and on an export that are the same in both lanes. The grant `work.export` has no prefix. */
export const holdActs = <P extends string>(prefix: P) => ({
  "renew-hold": {
    step: "transition", on: "hold", grant: `${prefix}.work`,
    also: { commitment: { item: "commitment", via: { slot: "under", of: "on" } } },
    fields: {},
    guards: [
      { state: ["held"] },
      { signer: ["holder"] },
      { state: ["accepted"], of: "also.commitment" },
      { signer: ["performer"], of: "also.commitment" },
    ],
    effects: [
      { hold: { do: "renew" } },
      { value: { slot: "ends", from: { time: { plusSeconds: 3600 } } } },
    ],
    sends: [],
    attention: [],
  },
  "release-hold": {
    step: "transition", on: "hold", grant: `${prefix}.work`,
    also: {},
    fields: {},
    guards: [
      { state: ["held"] },
      { signer: ["holder"] },
    ],
    effects: [{ hold: { do: "end" } }],
    sends: [],
    attention: [],
  },
  "authorize-export": {
    step: "open", on: "export", grant: "work.export",
    also: { hold: { item: "hold", by: "hold" } },
    fields: {
      hold: { type: "item", of: "hold", required: true },
      to: { type: "member", required: true },
    },
    guards: [{ state: ["ended"], of: "also.hold" }],
    effects: [
      { party: { slot: "from", from: { slot: "holder", of: "also.hold" } } },
      { party: { slot: "to", from: { field: "to" } } },
      { party: { slot: "authorizer", from: { signer: true } } },
      { ref: { slot: "hold", from: { item: "also.hold" } } },
    ],
    sends: [],
    attention: [],
  },
} as const satisfies Record<string, ActType>);

/** Sections 3.4 and 4.3: a hold ends by time. */
export const holdTimed = {
  "hold-end": {
    on: "hold", states: ["held"], deadline: "ends",
    effects: [{ hold: { do: "end" } }],
    attention: [],
  },
} as const satisfies Record<string, TimedRule>;

/** Sections 3.9 and 4.3: the two messages about an export. `name` is the definition's name: the field `export` names an `authorize-export` entry under it. */
export const exportHandlers = <N extends string>(name: N) => ({
  "export-license": {
    message: "export-license", class: "tell", from: { kind: "task", under: "platform:task" }, opens: null,
    also: {
      export: { item: "export", by: "export" },
      target: { item: "hold", by: "hold" },
    },
    fields: {
      export: { type: "fact", kind: ["authorize-export"], under: name, required: true },
      checkpoint: { type: "digest", required: true },
      hold: { type: "item", of: "hold", required: true },
      instance: { type: "text", max: 128, required: true },
      k: { type: "int", min: 1, max: 3, required: true },
    },
    guards: [
      { state: ["authorized"], of: "also.export", reason: "export-not-authorized" },
      { state: ["held"], of: "also.target", reason: "target-not-held" },
      { before: { slot: "ends" }, of: "also.target", reason: "target-not-held" },
      { equals: { a: { slot: "holder", of: "also.target" }, b: { slot: "to", of: "also.export" } }, reason: "target-not-held" },
      {
        capability: {
          name: "hold",
          guard: "license",
          with: { export: { item: "also.export" }, from: { sender: true }, checkpoint: { field: "checkpoint" }, hold: { item: "also.target" }, instance: { field: "instance" } },
        },
      },
    ],
    effects: [
      {
        capability: {
          name: "hold",
          do: "license",
          with: {
            export: { item: "also.export" },
            from: { sender: true },
            checkpoint: { field: "checkpoint" },
            hold: { item: "also.target" },
            instance: { field: "instance" },
            k: { field: "k" },
          },
        },
      },
    ],
    sends: [],
    attention: [],
  },
  "export-settled": {
    message: "export-settled", class: "tell", from: { kind: "task", under: "platform:task" }, opens: null, settles: { of: "also.export", in: ["authorized"] },
    also: { export: { item: "export", by: "export" } },
    fields: {
      export: { type: "fact", kind: ["authorize-export"], under: name, required: true },
      final: { type: "enum", of: ["confirmed", "withheld"], required: true },
    },
    guards: [
      { state: ["authorized"], of: "also.export", reason: "export-not-authorized" },
      { capability: { name: "hold", guard: "settled", with: { export: { item: "also.export" }, from: { sender: true }, final: { field: "final" }, by: { source: "ref" } } } },
    ],
    effects: [
      { capability: { name: "hold", do: "settle", with: { export: { item: "also.export" }, by: { source: "ref" } } } },
      { state: "done", of: "also.export", if: [{ equals: { a: { field: "final" }, b: { const: "confirmed" } } }] },
      { state: "refused", of: "also.export", if: [{ equals: { a: { field: "final" }, b: { const: "withheld" } } }] },
    ],
    sends: [],
    attention: [],
  },
} as const satisfies Record<string, AdoptedReceiveType>);
