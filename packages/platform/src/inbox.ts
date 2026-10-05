/**
 * `platform:inbox@1`, as data (authority note, revision 16, section 12.1.6).
 * One inbox for each member. It holds that member's attention items, inside
 * the application. No send leaves it, no timed rule exists and no entry
 * starts a duty.
 *
 * One member is one row of the note's tables. A cell of the note that
 * begins "Code" is a mark in this data, at the place where its rule is run
 * (the contract's revision 15, section 6.1), and the rule is in `rules.ts`.
 * The inbox has one: the mark `notice-source`, row P22, among the effects of
 * each `notify` handler. A notice's `source` is a record of four values, and
 * its type is data. No operand builds that record from the parts of a
 * reference, so the data writes no effect on `source`: the mark stands
 * there, and its rule gives the one effect (revision 20, section 12.1.6).
 * The address of a notice (P23) is transport's at dispatch, and derives
 * nothing of an entry, so it has no mark.
 *
 * The note's `max` and text lengths are examples that the proof plan's
 * section 4 owns. They are written as the note has them.
 */

import type { PlatformData } from "@generalbusiness/artroom-contract";
import type { Rules } from "@generalbusiness/artroom-derive";

export const inbox: PlatformData = {
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
  // The operation kinds that this definition owns, each with the mark of the rule for its outcome entries. The inbox opens none.
  outcomes: {},
};

function notify(kind: "lane" | "task"): PlatformData["receives"][string] {
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
      // `at` is the commit time.
      { value: { slot: "at", from: { time: { plusSeconds: 0 } } } },
      // `source` (Code P22): the rule `notice-source` is run here, at its position among the effects, and sets the slot.
      { code: "notice-source", row: "P22" },
    ],
    sends: [],
    attention: [],
  };
}

/**
 * The rules of `platform:inbox@1`, by the name that a mark states (revision
 * 20, section 12.1.8, row 38).
 *
 * `notice-source`, at place 5, row P22. It reads the delivery's `from`,
 * which the entry's own input holds whole. It returns one `value` effect on
 * the notice that the entry opens: `source` is the record of the fact's
 * scope ID, incarnation, position and hash. It names no refusal, and it
 * does not read the clock. The commit checks the value against the slot's
 * type, as it checks a written effect's.
 */
export const inboxRules: Rules = {
  "notice-source": {
    place: "effect", most: 1,
    run: ({ input, resolved }) => {
      if (input.type !== "delivery") throw new Error("notice-source stands in a handler, and reads a delivery");
      const { at, seq, hash } = input.from;
      return [{ effect: "value", item: resolved.self, slot: "source", value: { scope: at.scope, incarnation: at.inc, seq, hash } }];
    },
  },
};
