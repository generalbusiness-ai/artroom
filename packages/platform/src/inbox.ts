/**
 * `platform:inbox@1`, as data (authority note, revision 16, section 12.1.6).
 * One inbox for each member. It holds that member's attention items, inside
 * the application. No send leaves it, no timed rule exists and no entry
 * starts a duty.
 *
 * One member is one row of the note's tables. The note's cells that begin
 * "Code" are the rules of `rules.ts`, and this definition holds none: the
 * address of a notice (P23) is transport's at dispatch, and a notice's
 * `source` is a record of four values (P22).
 *
 * The note's `max` and text lengths are examples that the proof plan's
 * section 4 owns. They are written as the note has them.
 */

import type { DeclaredDefinition } from "@generalbusiness/artroom-contract";

export const inbox: DeclaredDefinition = {
  format: "artroom-definition-1",
  name: "platform:inbox",
  profile: { name: "restricted", version: 1 },
  capabilities: [],
  genesis: "establish",
  items: {
    // Section 12.1.6, the first row of the item table.
    inbox: {
      many: false, max: 1, initial: "open",
      states: { open: { final: false } },
      parties: { owner: { fixed: true, required: true, list: false, author: false } },
      refs: { membership: { fixed: true, required: true, to: { type: "scope", kind: "membership" } } },
      values: {},
    },
    // The second row. `max` bounds the notices that are not dismissed.
    notice: {
      many: true, max: 1000, initial: "unread",
      states: { unread: { final: false }, read: { final: false }, dismissed: { final: true } },
      parties: {},
      refs: {},
      values: {
        reason: { fixed: true, required: true, of: { type: "text", max: 128 } },
        at: { fixed: true, required: true, of: { type: "time" } },
        item: { fixed: true, required: false, of: { type: "int", min: 0, max: 1000000000 } },
        source: {
          fixed: true, required: true,
          of: {
            type: "record",
            of: {
              scope: { type: "text", max: 64, required: true },
              incarnation: { type: "text", max: 32, required: true },
              seq: { type: "int", min: 0, max: 1000000000, required: true },
              hash: { type: "digest", required: true },
            },
          },
        },
      },
    },
  },
  acts: {
    // `establish`: genesis, by membership's `create` (fields `owner` and `membership`, section 12.1). It opens `inbox`, with its owner.
    establish: {
      step: "open", on: "inbox", grant: "inbox.establish",
      also: {},
      fields: {
        owner: { type: "member", required: true },
        membership: { type: "scope", kind: "membership", required: true },
      },
      guards: [],
      effects: [
        { party: { slot: "owner", from: { field: "owner" } } },
        { ref: { slot: "membership", from: { field: "membership" } } },
      ],
      sends: [],
      attention: [],
    },
    // `mark-read` and `dismiss`: an act, grant `inbox.own`, by the owner of the inbox, on a notice in the stated states.
    "mark-read": {
      step: "transition", on: "notice", grant: "inbox.own",
      also: { inbox: { item: "inbox", one: true } },
      fields: {},
      guards: [{ signer: ["owner"], of: "also.inbox" }, { state: ["unread"] }],
      effects: [{ state: "read" }],
      sends: [],
      attention: [],
    },
    dismiss: {
      step: "transition", on: "notice", grant: "inbox.own",
      also: { inbox: { item: "inbox", one: true } },
      fields: {},
      guards: [{ signer: ["owner"], of: "also.inbox" }, { state: ["unread", "read"] }],
      effects: [{ state: "dismissed" }],
      sends: [],
      attention: [],
    },
  },
  receives: {
    // `notify`, twice: a delivery of an advisory from a lane and from a task. It opens `notice`, `unread`. A handler of class
    // `advisory` sends nothing.
    "notify-from-lane": notify("lane"),
    "notify-from-task": notify("task"),
  },
  timed: {},
  rules: {},
};

function notify(kind: "lane" | "task"): DeclaredDefinition["receives"][string] {
  return {
    message: "notify", class: "advisory", from: { kind }, opens: "notice",
    also: {},
    fields: {
      reason: { type: "text", max: 128, required: true },
      item: { type: "int", min: 0, max: 1000000000, required: false },
    },
    guards: [],
    effects: [
      { value: { slot: "reason", from: { field: "reason" } } },
      { value: { slot: "item", from: { field: "item" } } },
      // `at` is the commit time. `source` is the envelope's source fact (Code P22).
      { value: { slot: "at", from: { time: { plusSeconds: 0 } } } },
      { value: { slot: "source", from: { source: "ref" } } },
    ],
    sends: [],
    attention: [],
  };
}
