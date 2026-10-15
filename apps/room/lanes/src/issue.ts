/**
 * The `issue` definition as data (lane forms, revision 14, at 4b3bf5da, sections 3 and 8.1).
 *
 * Every member is one row of the lane forms, written as the row states it.
 * Nothing is added and nothing is cut. The guards, effects, sends and attention
 * forms of a row are in the order of the row, one to a line; a long form is
 * broken over lines. A comment names the section a group of rows comes from.
 * The rows that both definitions share are in `shared.ts`.
 *
 * Some values are the lane forms' examples, and some names are assumed
 * (their section 3): a hold's 3,600 seconds, the text maxima and integer
 * ranges, the refusal names, and the platform definition names.
 */

import { discussionActs, exportHandlers, holdActs, holdItems, holdTimed } from "./shared.ts";
import type { LaneDefinition } from "./shared.ts";

export const issue = {
  format: "artroom-definition-1",
  name: "issue",
  profile: { name: "restricted", version: 1 },
  capabilities: [{ name: "hold", version: 1 }, { name: "git-read", version: 1 }],
  genesis: "file",
  items: {
    // ---------------------------------------------------------------- section 3.1
    intent: {
      many: false, max: 1, initial: "open",
      states: { open: { final: false }, closed: { final: false } },
      parties: {
        requester: { fixed: true, required: true, list: false, author: false },
        assignees: { fixed: false, required: false, list: true, max: 10, author: false },
      },
      refs: {
        parent: { fixed: true, required: false, to: { type: "scope", kind: "lane" } },
        conditionsAt: { fixed: false, required: true, to: { type: "fact", kind: ["file", "revise"], under: "issue" } },
        judgedAt: { fixed: false, required: false, to: { type: "fact", kind: ["file", "revise"], under: "issue" } },
        currentPlan: { fixed: false, required: false, to: { type: "item", of: "plan" } },
        closedBy: { fixed: false, required: false, to: { type: "fact", kind: ["close-own", "close-any", "closes"], under: "issue" } },
      },
      values: {
        title: { fixed: false, required: true, of: { type: "text", max: 256 } },
        body: { fixed: false, required: false, of: { type: "text", max: 65536, detached: true } },
        conditions: { fixed: false, required: true, of: { type: "list", of: { type: "text", max: 4096 }, max: 16 } },
        labels: { fixed: false, required: false, of: { type: "list", of: { type: "text", max: 64 }, max: 20 } },
        closeReason: { fixed: false, required: false, of: { type: "enum", of: ["completed", "not-planned"] } },
        satisfied: { fixed: false, required: false, of: { type: "bool" } },
        number: { fixed: false, required: false, of: { type: "int", min: 1, max: 1000000000 } },
        parentItem: { fixed: true, required: false, of: { type: "int", min: 0, max: 1000000000 } },
        judgeEvidence: { fixed: false, required: false, of: { type: "list", of: { type: "digest" }, max: 32 } },
        judgeNote: { fixed: false, required: false, of: { type: "text", max: 4096 } },
      },
    },
    commitment: {
      many: true, max: 64, initial: "offered",
      states: { offered: { final: false }, proposed: { final: false }, accepted: { final: false }, declined: { final: true }, withdrawn: { final: true }, cancelled: { final: true }, fulfilled: { final: true } },
      parties: {
        requester: { fixed: true, required: true, list: false, author: false },
        offeree: { fixed: true, required: false, list: false, author: false },
        performer: { fixed: false, required: false, list: false, author: true },
        successor: { fixed: false, required: false, list: false, author: false },
      },
      refs: {
        conditionsAt: { fixed: true, required: true, to: { type: "fact", kind: ["file", "revise"], under: "issue" } },
        termsAt: { fixed: true, required: true, to: { type: "fact", kind: ["file", "revise", "propose-terms"], under: "issue" } },
      },
      values: { conditions: { fixed: true, required: true, of: { type: "list", of: { type: "text", max: 4096 }, max: 16 } } },
    },
    report: {
      many: true, max: 64, initial: "reported",
      states: { reported: { final: false }, accepted: { final: true }, refused: { final: true } },
      parties: {
        reporter: { fixed: true, required: true, list: false, author: false },
        authors: { fixed: true, required: false, list: true, max: 64, author: false },
      },
      refs: {
        under: { fixed: true, required: true, to: { type: "item", of: "commitment" } },
        conditionsAt: { fixed: true, required: true, to: { type: "fact", kind: ["file", "revise"], under: "issue" } },
        termsAt: { fixed: true, required: true, to: { type: "fact", kind: ["file", "revise", "propose-terms"], under: "issue" } },
        acceptedAt: { fixed: false, required: false, to: { type: "fact", kind: ["accept-report"], under: "issue" } },
      },
      values: {
        commit: { fixed: true, required: true, of: { type: "commit" } },
        tree: { fixed: true, required: true, of: { type: "tree" } },
        claims: { fixed: true, required: false, of: { type: "list", of: { type: "text", max: 1024 }, max: 32 } },
        evidence: { fixed: true, required: false, of: { type: "list", of: { type: "digest" }, max: 32 } },
        summary: { fixed: false, required: false, of: { type: "text", max: 65536, detached: true } },
        reason: { fixed: false, required: false, of: { type: "text", max: 4096 } },
      },
    },
    ask: {
      many: true, max: 64, initial: "asked",
      states: { asked: { final: false }, answered: { final: false }, settled: { final: true }, withdrawn: { final: true } },
      parties: {
        asker: { fixed: true, required: true, list: false, author: false },
        addressee: { fixed: true, required: true, list: false, author: false },
      },
      refs: {},
      values: {
        question: { fixed: true, required: true, of: { type: "text", max: 4096 } },
        answer: { fixed: false, required: false, of: { type: "text", max: 4096 } },
      },
    },
    block: {
      many: true, max: 32, initial: "blocked",
      states: { blocked: { final: false }, released: { final: true } },
      parties: {},
      refs: {
        commitment: { fixed: true, required: true, to: { type: "item", of: "commitment" } },
        on: { fixed: true, required: true, to: { type: "fact", kind: ["ask"], under: "issue" } },
        releasedBy: { fixed: false, required: false, to: { type: "fact", kind: ["answer"], under: "issue" } },
      },
      values: { reason: { fixed: false, required: false, of: { type: "text", max: 4096 } } },
    },
    plan: {
      many: true, max: 16, initial: "open",
      states: { open: { final: false }, sealed: { final: false }, superseded: { final: true } },
      parties: { planner: { fixed: true, required: true, list: false, author: false } },
      refs: { conditionsAt: { fixed: true, required: true, to: { type: "fact", kind: ["file", "revise"], under: "issue" } } },
      values: {},
    },
    concern: {
      many: true, max: 100, initial: "creating",
      states: { creating: { final: false }, created: { final: false }, refused: { final: true }, conflict: { final: true }, delivered: { final: false }, dropped: { final: true } },
      parties: {},
      refs: {
        plan: { fixed: true, required: true, to: { type: "item", of: "plan" } },
        child: { fixed: false, required: false, to: { type: "scope", kind: "lane" } },
        result: { fixed: false, required: false, to: { type: "fact", kind: ["offer", "propose-terms"], under: "issue" } },
      },
      values: {
        purpose: { fixed: true, required: true, of: { type: "text", max: 4096 } },
        role: { fixed: true, required: true, of: { type: "enum", of: ["required", "optional"] } },
        interface: { fixed: true, required: false, of: { type: "text", max: 4096 } },
      },
    },
    decision: {
      many: true, max: 32, initial: "recorded",
      states: { recorded: { final: true } },
      parties: { decider: { fixed: true, required: true, list: false, author: false } },
      refs: {
        concern: { fixed: true, required: true, to: { type: "item", of: "concern" } },
        replacedBy: { fixed: true, required: false, to: { type: "item", of: "concern" } },
        acceptance: { fixed: true, required: false, to: { type: "fact", kind: ["accept-report"], under: "issue" } },
        terms: { fixed: true, required: false, to: { type: "fact", kind: ["file", "revise", "propose-terms"], under: "issue" } },
      },
      values: {
        kind: { fixed: true, required: true, of: { type: "enum", of: ["replaced", "excluded", "accepted-as-delivered"] } },
        reason: { fixed: true, required: true, of: { type: "text", max: 4096 } },
      },
    },
    input: {
      many: true, max: 32, initial: "selected",
      states: { selected: { final: false }, replaced: { final: true } },
      parties: {
        selector: { fixed: true, required: true, list: false, author: false },
        authors: { fixed: true, required: false, list: true, max: 64, author: false },
      },
      refs: {
        for: { fixed: true, required: true, to: { type: "item", of: "commitment" } },
        report: { fixed: true, required: true, to: { type: "fact", kind: ["report"], under: "issue" } },
        accepted: { fixed: true, required: true, to: { type: "fact", kind: ["accept-report"], under: "issue" } },
      },
      values: {},
    },
    comment: {
      many: true, max: 5000, initial: "visible",
      states: { visible: { final: false }, collapsed: { final: false }, redacted: { final: true } },
      parties: {
        author: { fixed: true, required: true, list: false, author: false },
        mentioned: { fixed: true, required: false, list: true, max: 16, author: false },
      },
      refs: { replyTo: { fixed: false, required: false, to: { type: "item", of: "comment" } } },
      values: {
        body: { fixed: false, required: false, of: { type: "text", max: 65536, detached: true } },
        collapseReason: { fixed: false, required: false, of: { type: "text", max: 1024 } },
      },
    },

    // ---------------------------------------------------------------- shared rows
    ...holdItems,
  },
  acts: {
    // ---------------------------------------------------------------- section 3.2
    file: {
      step: "open", on: "intent", grant: "issue.open",
      also: {},
      fields: {
        opener: { type: "member", required: true },
        title: { type: "text", max: 256, required: true },
        body: { type: "text", max: 65536, detached: true, required: false },
        conditions: { type: "list", of: { type: "text", max: 4096 }, max: 16, required: true },
        number: { type: "int", min: 1, max: 1000000000, required: false },
        origin: { type: "fact", kind: ["add-concern"], under: "issue", required: false },
      },
      guards: [],
      effects: [
        { party: { slot: "requester", from: { field: "opener" } } },
        { value: { slot: "title", from: { field: "title" } } },
        { value: { slot: "body", from: { field: "body" } } },
        { value: { slot: "conditions", from: { field: "conditions" } } },
        { value: { slot: "number", from: { field: "number" } } },
        { ref: { slot: "parent", from: { field: "origin", part: "scope" } } },
        { value: { slot: "parentItem", from: { field: "origin", part: "seq" } } },
        { ref: { slot: "conditionsAt", from: "self" } },
      ],
      sends: [{ index: { fields: { kind: { const: "issue" }, title: { field: "title" }, state: { const: "open" }, author: { field: "opener" }, number: { field: "number" } } } }],
      attention: [],
    },
    "edit-own": {
      step: "transition", on: "intent", grant: "issue.edit-own",
      also: {},
      fields: {
        title: { type: "text", max: 256, required: false },
        body: { type: "text", max: 65536, detached: true, required: false },
      },
      guards: [{ signer: ["requester"] }],
      effects: [
        { value: { slot: "title", from: { field: "title" } } },
        { value: { slot: "body", from: { field: "body" } } },
      ],
      sends: [{ index: { fields: { title: { field: "title" } } } }],
      attention: [],
    },
    "edit-any": {
      step: "transition", on: "intent", grant: "issue.edit-any",
      also: {},
      fields: {
        title: { type: "text", max: 256, required: false },
        body: { type: "text", max: 65536, detached: true, required: false },
      },
      guards: [],
      effects: [
        { value: { slot: "title", from: { field: "title" } } },
        { value: { slot: "body", from: { field: "body" } } },
      ],
      sends: [{ index: { fields: { title: { field: "title" } } } }],
      attention: [],
    },
    revise: {
      step: "transition", on: "intent", grant: "issue.revise",
      also: {},
      fields: { conditions: { type: "list", of: { type: "text", max: 4096 }, max: 16, required: true } },
      guards: [
        { state: ["open"] },
        { signer: ["requester"] },
      ],
      effects: [
        { value: { slot: "conditions", from: { field: "conditions" } } },
        { ref: { slot: "conditionsAt", from: "self" } },
      ],
      sends: [],
      attention: [],
    },
    label: {
      step: "transition", on: "intent", grant: "issue.triage",
      also: {},
      fields: { labels: { type: "list", of: { type: "text", max: 64 }, max: 20, required: true } },
      guards: [],
      effects: [{ value: { slot: "labels", from: { field: "labels" } } }],
      sends: [{ index: { fields: { labels: { field: "labels" } } } }],
      attention: [],
    },
    assign: {
      step: "transition", on: "intent", grant: "issue.triage",
      also: {},
      fields: { assignees: { type: "list", of: { type: "member" }, max: 10, required: true } },
      guards: [],
      effects: [{ party: { slot: "assignees", from: { field: "assignees" } } }],
      sends: [{ index: { fields: { assignees: { field: "assignees" } } } }],
      attention: [{ notify: { slot: "assignees", of: "on", when: "after", reason: "assignees-changed" } }],
    },
    "close-own": {
      step: "transition", on: "intent", grant: "issue.close-own",
      also: {},
      fields: { reason: { type: "enum", of: ["completed", "not-planned"], required: false } },
      guards: [
        { state: ["open"] },
        { signer: ["requester"] },
      ],
      effects: [
        { state: "closed" },
        { value: { slot: "closeReason", from: { field: "reason" } } },
        { ref: { slot: "closedBy", from: "self" } },
      ],
      sends: [{ index: { fields: { state: { const: "closed" } } } }],
      attention: [],
    },
    "close-any": {
      step: "transition", on: "intent", grant: "issue.triage",
      also: {},
      fields: { reason: { type: "enum", of: ["completed", "not-planned"], required: false } },
      guards: [{ state: ["open"] }],
      effects: [
        { state: "closed" },
        { value: { slot: "closeReason", from: { field: "reason" } } },
        { ref: { slot: "closedBy", from: "self" } },
      ],
      sends: [{ index: { fields: { state: { const: "closed" } } } }],
      attention: [],
    },
    "reopen-own": {
      step: "transition", on: "intent", grant: "issue.close-own",
      also: {},
      fields: {},
      guards: [
        { state: ["closed"] },
        { signer: ["requester"] },
      ],
      effects: [
        { state: "open" },
        { value: { slot: "closeReason", from: null } },
        { ref: { slot: "closedBy", from: null } },
      ],
      sends: [{ index: { fields: { state: { const: "open" } } } }],
      attention: [],
    },
    "reopen-any": {
      step: "transition", on: "intent", grant: "issue.triage",
      also: {},
      fields: {},
      guards: [{ state: ["closed"] }],
      effects: [
        { state: "open" },
        { value: { slot: "closeReason", from: null } },
        { ref: { slot: "closedBy", from: null } },
      ],
      sends: [{ index: { fields: { state: { const: "open" } } } }],
      attention: [],
    },
    judge: {
      step: "transition", on: "intent", grant: "issue.judge",
      also: {},
      fields: {
        satisfied: { type: "bool", required: true },
        evidence: { type: "list", of: { type: "digest" }, max: 32, required: false },
        note: { type: "text", max: 4096, required: false },
      },
      guards: [{ signer: ["requester"] }],
      effects: [
        { value: { slot: "satisfied", from: { field: "satisfied" } } },
        { ref: { slot: "judgedAt", from: { slot: "conditionsAt" } } },
        { value: { slot: "judgeEvidence", from: { field: "evidence" } } },
        { value: { slot: "judgeNote", from: { field: "note" } } },
      ],
      sends: [],
      attention: [],
    },

    // ---------------------------------------------------------------- section 3.3
    offer: {
      step: "open", on: "commitment", grant: "issue.request",
      also: { goal: { item: "intent", one: true } },
      fields: { offeree: { type: "member", required: false } },
      guards: [{ state: ["open"], of: "also.goal" }],
      effects: [
        { party: { slot: "requester", from: { signer: true } } },
        { party: { slot: "offeree", from: { field: "offeree" } } },
        { value: { slot: "conditions", from: { slot: "conditions", of: "also.goal" } } },
        { ref: { slot: "conditionsAt", from: { slot: "conditionsAt", of: "also.goal" } } },
        { ref: { slot: "termsAt", from: { slot: "conditionsAt", of: "also.goal" } } },
      ],
      sends: [],
      attention: [{ notify: { slot: "offeree", of: "on", when: "after", reason: "offered" } }],
    },
    "propose-terms": {
      step: "open", on: "commitment", grant: "issue.promise",
      also: { goal: { item: "intent", one: true } },
      fields: { conditions: { type: "list", of: { type: "text", max: 4096 }, max: 16, required: true } },
      guards: [{ state: ["open"], of: "also.goal" }],
      effects: [
        { state: "proposed" },
        { party: { slot: "performer", from: { signer: true } } },
        { party: { slot: "requester", from: { slot: "requester", of: "also.goal" } } },
        { value: { slot: "conditions", from: { field: "conditions" } } },
        { ref: { slot: "conditionsAt", from: { slot: "conditionsAt", of: "also.goal" } } },
        { ref: { slot: "termsAt", from: { slot: "conditionsAt", of: "also.goal" } }, if: [{ equals: { a: { field: "conditions" }, b: { slot: "conditions", of: "also.goal" } } }] },
        { ref: { slot: "termsAt", from: "self" }, unless: [{ equals: { a: { field: "conditions" }, b: { slot: "conditions", of: "also.goal" } } }] },
      ],
      sends: [],
      attention: [],
    },
    accept: {
      step: "transition", on: "commitment", grant: "issue.promise",
      also: {},
      fields: { terms: { type: "fact", kind: ["file", "revise", "propose-terms"], under: "issue", required: true } },
      guards: [
        { state: ["offered"] },
        { anyOf: [[{ unset: "offeree" }], [{ equals: { a: { signer: true }, b: { slot: "offeree" } } }]], reason: "not-offeree" },
        { equals: { a: { field: "terms" }, b: { slot: "termsAt" } }, reason: "terms-differ" },
      ],
      effects: [
        { state: "accepted" },
        { party: { slot: "performer", from: { signer: true } } },
      ],
      sends: [],
      attention: [{ notify: { slot: "requester", of: "on", when: "after", reason: "accepted" } }],
    },
    agree: {
      step: "transition", on: "commitment", grant: "issue.request",
      also: {},
      fields: { terms: { type: "fact", kind: ["file", "revise", "propose-terms"], under: "issue", required: true } },
      guards: [
        { state: ["proposed"] },
        { signer: ["requester"] },
        { equals: { a: { field: "terms" }, b: { slot: "termsAt" } }, reason: "terms-differ" },
      ],
      effects: [{ state: "accepted" }],
      sends: [],
      attention: [],
    },
    decline: {
      step: "transition", on: "commitment", grant: "issue.promise",
      also: {},
      fields: {},
      guards: [
        { state: ["offered"] },
        { anyOf: [[{ unset: "offeree" }], [{ equals: { a: { signer: true }, b: { slot: "offeree" } } }]], reason: "not-offeree" },
      ],
      effects: [{ state: "declined" }],
      sends: [],
      attention: [],
    },
    withdraw: {
      step: "transition", on: "commitment", grant: "issue.promise",
      also: {},
      fields: {},
      guards: [
        { state: ["accepted"] },
        { signer: ["performer"] },
      ],
      effects: [{ state: "withdrawn" }],
      sends: [],
      attention: [{ notify: { slot: "requester", of: "on", when: "after", reason: "withdrawn" } }],
    },
    cancel: {
      step: "transition", on: "commitment", grant: "issue.request",
      also: {},
      fields: {},
      guards: [
        { state: ["offered", "proposed", "accepted"] },
        { signer: ["requester"] },
      ],
      effects: [{ state: "cancelled" }],
      sends: [],
      attention: [{ notify: { slot: "performer", of: "on", when: "after", reason: "cancelled" } }],
    },
    "offer-handover": {
      step: "transition", on: "commitment", grant: "issue.promise",
      also: {},
      fields: { successor: { type: "member", required: true } },
      guards: [
        { state: ["accepted"] },
        { signer: ["performer"] },
      ],
      effects: [{ party: { slot: "successor", from: { field: "successor" } } }],
      sends: [],
      attention: [{ notify: { slot: "successor", of: "on", when: "after", reason: "handover-offered" } }],
    },
    "accept-handover": {
      step: "transition", on: "commitment", grant: "issue.promise",
      also: {},
      fields: { terms: { type: "fact", kind: ["file", "revise", "propose-terms"], under: "issue", required: true } },
      guards: [
        { state: ["accepted"] },
        { signer: ["successor"] },
        { equals: { a: { field: "terms" }, b: { slot: "termsAt" } }, reason: "terms-differ" },
        { none: { type: "hold", states: ["held"], where: [{ equals: { a: { slot: "under" }, b: { item: "on" } } }] }, reason: "hold-held" },
      ],
      effects: [
        { party: { slot: "performer", from: { signer: true } } },
        { party: { slot: "successor", from: null } },
      ],
      sends: [],
      attention: [
        { notify: { slot: "performer", of: "on", when: "before", reason: "handed-over" } },
        { notify: { slot: "requester", of: "on", when: "after", reason: "handed-over" } },
      ],
    },
    "decline-handover": {
      step: "transition", on: "commitment", grant: "issue.promise",
      also: {},
      fields: {},
      guards: [
        { state: ["accepted"] },
        { signer: ["successor"] },
      ],
      effects: [{ party: { slot: "successor", from: null } }],
      sends: [],
      attention: [],
    },
    fulfil: {
      step: "transition", on: "commitment", grant: "issue.request",
      also: {
        report: { item: "report", by: "report" },
        goal: { item: "intent", one: true },
      },
      fields: { report: { type: "item", of: "report", required: true } },
      guards: [
        { state: ["accepted"] },
        { signer: ["requester"] },
        { state: ["accepted"], of: "also.report" },
        { equals: { a: { slot: "under", of: "also.report" }, b: { item: "on" } }, reason: "not-this-commitment" },
        { equals: { a: { slot: "termsAt", of: "also.report" }, b: { slot: "termsAt" } }, reason: "terms-differ" },
      ],
      effects: [{ state: "fulfilled" }],
      sends: [
        {
          relate: {
            to: { slot: "parent", of: "also.goal" },
            name: "result",
            item: { item: "also.goal" },
            state: "delivered",
            if: [{ set: "parent", of: "also.goal" }],
            detail: {
              parentItem: { slot: "parentItem", of: "also.goal" },
              commitment: { item: "on" },
              report: { item: "also.report" },
              acceptance: { slot: "acceptedAt", of: "also.report" },
              conditions: { slot: "conditionsAt" },
              terms: { slot: "termsAt" },
            },
            result: {},
          },
        },
      ],
      attention: [],
    },

    // ---------------------------------------------------------------- section 3.4
    "take-hold": {
      step: "open", on: "hold", grant: "issue.work",
      also: { commitment: { item: "commitment", by: "commitment" } },
      fields: {
        commitment: { type: "item", of: "commitment", required: true },
        extent: { type: "text", max: 1024, required: false },
      },
      guards: [
        { state: ["accepted"], of: "also.commitment" },
        { signer: ["performer"], of: "also.commitment" },
        { none: { type: "hold", states: ["held"], where: [{ equals: { a: { slot: "under" }, b: { item: "also.commitment" } } }] }, reason: "hold-held" },
      ],
      effects: [
        { hold: { do: "open", extent: { field: "extent" } } },
        { ref: { slot: "under", from: { item: "also.commitment" } } },
        { value: { slot: "extent", from: { field: "extent" } } },
        { value: { slot: "ends", from: { time: { plusSeconds: 3600 } } } },
      ],
      sends: [],
      attention: [],
    },
    report: {
      step: "open", on: "report", grant: "issue.work",
      also: { commitment: { item: "commitment", by: "commitment" } },
      fields: {
        commitment: { type: "item", of: "commitment", required: true },
        terms: { type: "fact", kind: ["file", "revise", "propose-terms"], under: "issue", required: true },
        commit: { type: "commit", required: true },
        tree: { type: "tree", required: true },
        claims: { type: "list", of: { type: "text", max: 1024 }, max: 32, required: false },
        evidence: { type: "list", of: { type: "digest" }, max: 32, required: false },
        summary: { type: "text", max: 65536, detached: true, required: false },
      },
      guards: [
        { state: ["accepted"], of: "also.commitment" },
        { signer: ["performer"], of: "also.commitment" },
        { equals: { a: { field: "terms" }, b: { slot: "termsAt", of: "also.commitment" } }, reason: "terms-differ" },
        { capability: { name: "hold", guard: "staged", with: { commit: { field: "commit" }, under: { item: "also.commitment" } } } },
        { capability: { name: "git-read", guard: "ancestry", with: { commit: { field: "commit" }, row: { const: "report" } } } },
      ],
      effects: [
        { party: { slot: "reporter", from: { signer: true } } },
        { ref: { slot: "under", from: { item: "also.commitment" } } },
        { ref: { slot: "conditionsAt", from: { slot: "conditionsAt", of: "also.commitment" } } },
        { ref: { slot: "termsAt", from: { field: "terms" } } },
        { value: { slot: "commit", from: { field: "commit" } } },
        { value: { slot: "tree", from: { field: "tree" } } },
        { value: { slot: "claims", from: { field: "claims" } } },
        { value: { slot: "evidence", from: { field: "evidence" } } },
        { value: { slot: "summary", from: { field: "summary" } } },
        {
          attribute: {
            slot: "authors",
            of: "also.commitment",
            with: [{ items: { type: "input", states: ["selected", "replaced"], where: [{ equals: { a: { slot: "for" }, b: { item: "also.commitment" } } }] }, slot: "authors" }],
          },
        },
        { capability: { name: "hold", do: "pin-hold", with: { commit: { field: "commit" } } } },
      ],
      sends: [],
      attention: [{ notify: { slot: "requester", of: "also.commitment", when: "after", reason: "reported" } }],
    },
    "accept-report": {
      step: "transition", on: "report", grant: "issue.request",
      also: { commitment: { item: "commitment", by: "commitment" } },
      fields: {
        commitment: { type: "item", of: "commitment", required: true },
        terms: { type: "fact", kind: ["file", "revise", "propose-terms"], under: "issue", required: true },
      },
      guards: [
        { state: ["reported"] },
        { equals: { a: { slot: "under" }, b: { item: "also.commitment" } }, reason: "not-this-commitment" },
        { signer: ["requester"], of: "also.commitment" },
        { notIn: ["authors"] },
        { equals: { a: { slot: "termsAt" }, b: { slot: "termsAt", of: "also.commitment" } }, reason: "terms-differ" },
        { equals: { a: { field: "terms" }, b: { slot: "termsAt" } }, reason: "terms-differ" },
      ],
      effects: [
        { state: "accepted" },
        { ref: { slot: "acceptedAt", from: "self" } },
      ],
      sends: [],
      attention: [],
    },
    "refuse-report": {
      step: "transition", on: "report", grant: "issue.request",
      also: { commitment: { item: "commitment", by: "commitment" } },
      fields: {
        commitment: { type: "item", of: "commitment", required: true },
        reason: { type: "text", max: 4096, required: true },
      },
      guards: [
        { state: ["reported"] },
        { equals: { a: { slot: "under" }, b: { item: "also.commitment" } }, reason: "not-this-commitment" },
        { signer: ["requester"], of: "also.commitment" },
      ],
      effects: [
        { state: "refused" },
        { value: { slot: "reason", from: { field: "reason" } } },
        { capability: { name: "hold", do: "pin-release", with: { commit: { slot: "commit" } } } },
      ],
      sends: [],
      attention: [{ notify: { slot: "reporter", of: "on", when: "after", reason: "report-refused" } }],
    },
    ask: {
      step: "open", on: "ask", grant: "issue.comment",
      also: {},
      fields: {
        addressee: { type: "member", required: true },
        question: { type: "text", max: 4096, required: true },
      },
      guards: [],
      effects: [
        { party: { slot: "asker", from: { signer: true } } },
        { party: { slot: "addressee", from: { field: "addressee" } } },
        { value: { slot: "question", from: { field: "question" } } },
      ],
      sends: [],
      attention: [{ notify: { slot: "addressee", of: "on", when: "after", reason: "asked" } }],
    },
    answer: {
      step: "transition", on: "ask", grant: "issue.comment",
      also: {},
      fields: { answer: { type: "text", max: 4096, required: true } },
      guards: [
        { state: ["asked"] },
        { signer: ["addressee"] },
      ],
      effects: [
        { state: "answered" },
        { value: { slot: "answer", from: { field: "answer" } } },
      ],
      sends: [],
      attention: [{ notify: { slot: "asker", of: "on", when: "after", reason: "answered" } }],
    },
    "settle-ask": {
      step: "transition", on: "ask", grant: "issue.comment",
      also: {},
      fields: {},
      guards: [
        { state: ["answered"] },
        { signer: ["asker"] },
      ],
      effects: [{ state: "settled" }],
      sends: [],
      attention: [],
    },
    "withdraw-ask": {
      step: "transition", on: "ask", grant: "issue.comment",
      also: {},
      fields: {},
      guards: [
        { state: ["asked", "answered"] },
        { signer: ["asker"] },
      ],
      effects: [{ state: "withdrawn" }],
      sends: [],
      attention: [],
    },
    block: {
      step: "open", on: "block", grant: "issue.work",
      also: { commitment: { item: "commitment", by: "commitment" } },
      fields: {
        commitment: { type: "item", of: "commitment", required: true },
        on: { type: "fact", kind: ["ask"], under: "issue", required: true },
        reason: { type: "text", max: 4096, required: false },
      },
      guards: [
        { state: ["accepted"], of: "also.commitment" },
        { signer: ["performer"], of: "also.commitment" },
        { fact: { field: "on" } },
      ],
      effects: [
        { ref: { slot: "commitment", from: { item: "also.commitment" } } },
        { ref: { slot: "on", from: { field: "on" } } },
        { value: { slot: "reason", from: { field: "reason" } } },
      ],
      sends: [],
      attention: [],
    },
    "release-block": {
      step: "transition", on: "block", grant: "issue.work",
      also: { commitment: { item: "commitment", by: "commitment" } },
      fields: {
        commitment: { type: "item", of: "commitment", required: true },
        answer: { type: "fact", kind: ["answer"], under: "issue", required: true },
      },
      guards: [
        { state: ["blocked"] },
        { equals: { a: { slot: "commitment" }, b: { item: "also.commitment" } }, reason: "not-this-commitment" },
        { signer: ["performer"], of: "also.commitment" },
        { fact: { field: "answer" } },
        { equals: { a: { field: "answer", part: "scope" }, b: { slot: "on", part: "scope" } }, reason: "not-this-ask" },
        { equals: { a: { field: "answer", part: "on" }, b: { slot: "on", part: "seq" } }, reason: "not-this-ask" },
      ],
      effects: [
        { state: "released" },
        { ref: { slot: "releasedBy", from: { field: "answer" } } },
      ],
      sends: [],
      attention: [],
    },
    "use-input": {
      step: "open", on: "input", grant: "issue.work",
      also: { commitment: { item: "commitment", by: "commitment" } },
      fields: {
        commitment: { type: "item", of: "commitment", required: true },
        accepted: { type: "fact", kind: ["accept-report"], under: "issue", required: true },
        report: { type: "fact", kind: ["report"], under: "issue", required: true },
      },
      guards: [
        { state: ["accepted"], of: "also.commitment" },
        { signer: ["performer"], of: "also.commitment" },
        { fact: { field: "accepted" } },
        { fact: { field: "report" } },
        { equals: { a: { field: "report", part: "scope" }, b: { field: "accepted", part: "scope" } }, reason: "not-the-accepted-report" },
        { equals: { a: { field: "report", part: "seq" }, b: { field: "accepted", part: "on" } }, reason: "not-the-accepted-report" },
      ],
      effects: [
        { party: { slot: "selector", from: { signer: true } } },
        { ref: { slot: "for", from: { item: "also.commitment" } } },
        { ref: { slot: "report", from: { field: "report" } } },
        { ref: { slot: "accepted", from: { field: "accepted" } } },
        { party: { slot: "authors", from: { field: "report", part: { opened: "authors" } } } },
      ],
      sends: [],
      attention: [],
    },
    "replace-input": {
      step: "transition", on: "input", grant: "issue.work",
      also: { commitment: { item: "commitment", by: "commitment" } },
      fields: { commitment: { type: "item", of: "commitment", required: true } },
      guards: [
        { state: ["selected"] },
        { equals: { a: { slot: "for" }, b: { item: "also.commitment" } }, reason: "not-this-commitment" },
        { signer: ["performer"], of: "also.commitment" },
      ],
      effects: [{ state: "replaced" }],
      sends: [],
      attention: [],
    },

    // ---------------------------------------------------------------- section 3.5
    "open-plan": {
      step: "open", on: "plan", grant: "issue.plan",
      also: { goal: { item: "intent", one: true } },
      fields: {},
      guards: [{ state: ["open"], of: "also.goal" }],
      effects: [
        { party: { slot: "planner", from: { signer: true } } },
        { ref: { slot: "conditionsAt", from: { slot: "conditionsAt", of: "also.goal" } } },
      ],
      sends: [],
      attention: [],
    },
    "add-concern": {
      step: "open", on: "concern", grant: "issue.plan",
      also: { plan: { item: "plan", by: "plan" } },
      fields: {
        plan: { type: "item", of: "plan", required: true },
        purpose: { type: "text", max: 4096, required: true },
        role: { type: "enum", of: ["required", "optional"], required: true },
        interface: { type: "text", max: 4096, required: false },
        title: { type: "text", max: 256, required: true },
        body: { type: "text", max: 65536, detached: true, required: false },
        conditions: { type: "list", of: { type: "text", max: 4096 }, max: 16, required: true },
      },
      guards: [
        { state: ["open"], of: "also.plan" },
        { signer: ["planner"], of: "also.plan" },
        {
          count: {
            type: "concern",
            states: ["creating", "created", "refused", "conflict", "delivered", "dropped"],
            where: [{ equals: { a: { slot: "plan" }, b: { item: "also.plan" } } }],
            max: 31,
          },
          reason: "plan-full",
        },
      ],
      effects: [
        { ref: { slot: "plan", from: { item: "also.plan" } } },
        { value: { slot: "purpose", from: { field: "purpose" } } },
        { value: { slot: "role", from: { field: "role" } } },
        { value: { slot: "interface", from: { field: "interface" } } },
      ],
      sends: [
        {
          create: {
            kind: "lane",
            definition: "self",
            fields: { opener: { signer: true }, title: { field: "title" }, body: { field: "body" }, conditions: { field: "conditions" }, origin: "self" },
            result: { applied: [{ state: "created" }, { ref: { slot: "child", from: { sender: true } } }], refused: [{ state: "refused" }], conflict: [{ state: "conflict" }] },
          },
        },
      ],
      attention: [],
    },
    "seal-plan": {
      step: "transition", on: "plan", grant: "issue.plan",
      also: {
        goal: { item: "intent", one: true },
        current: { item: "plan", via: { slot: "currentPlan", of: "also.goal" } },
      },
      fields: {
        goalAt: { type: "fact", kind: ["file", "revise"], under: "issue", required: true },
        required: {
          type: "list",
          of: { type: "record", of: { item: { type: "item", of: "concern", required: true }, child: { type: "scope", kind: "lane", required: false } } },
          max: 32,
          required: true,
        },
        optional: {
          type: "list",
          of: { type: "record", of: { item: { type: "item", of: "concern", required: true }, child: { type: "scope", kind: "lane", required: false } } },
          max: 32,
          required: true,
        },
      },
      guards: [
        { state: ["open"] },
        { signer: ["planner"] },
        { equals: { a: { slot: "conditionsAt" }, b: { slot: "conditionsAt", of: "also.goal" } }, reason: "planned-for-an-earlier-goal" },
        { equals: { a: { field: "goalAt" }, b: { slot: "conditionsAt" } }, reason: "planned-for-an-earlier-goal" },
        { none: { type: "concern", states: ["creating"], where: [{ equals: { a: { slot: "plan" }, b: { item: "on" } } }] }, reason: "concern-creating" },
        {
          sameSet: {
            list: { field: "required" },
            as: "r",
            key: { element: "r.item" },
            ordered: true,
            items: {
              type: "concern",
              states: ["creating", "created", "refused", "conflict", "delivered", "dropped"],
              where: [{ equals: { a: { slot: "plan" }, b: { item: "on" } } }, { equals: { a: { slot: "role" }, b: { const: "required" } } }],
            },
            match: [{ equals: { a: { element: "r.child" }, b: { slot: "child" } } }],
          },
          reason: "plan-list-differs",
        },
        {
          sameSet: {
            list: { field: "optional" },
            as: "r",
            key: { element: "r.item" },
            ordered: true,
            items: {
              type: "concern",
              states: ["creating", "created", "refused", "conflict", "delivered", "dropped"],
              where: [{ equals: { a: { slot: "plan" }, b: { item: "on" } } }, { equals: { a: { slot: "role" }, b: { const: "optional" } } }],
            },
            match: [{ equals: { a: { element: "r.child" }, b: { slot: "child" } } }],
          },
          reason: "plan-list-differs",
        },
        { state: ["sealed"], of: "also.current" },
      ],
      effects: [
        { state: "sealed" },
        { ref: { slot: "currentPlan", from: { item: "on" } }, of: "also.goal" },
        { state: "superseded", of: "also.current" },
      ],
      sends: [],
      attention: [],
    },
    "withdraw-plan": {
      step: "transition", on: "plan", grant: "issue.plan",
      also: { goal: { item: "intent", one: true } },
      fields: {},
      guards: [
        { state: ["sealed"] },
        { equals: { a: { slot: "currentPlan", of: "also.goal" }, b: { item: "on" } }, reason: "not-current-plan" },
      ],
      effects: [
        { state: "superseded" },
        { ref: { slot: "currentPlan", from: null }, of: "also.goal" },
      ],
      sends: [],
      attention: [],
    },
    "resolve-concern": {
      step: "open", on: "decision", grant: "issue.plan",
      also: {
        concern: { item: "concern", by: "concern" },
        plan: { item: "plan", via: { slot: "plan", of: "also.concern" } },
        goal: { item: "intent", one: true },
        replacement: { item: "concern", by: "replacedBy" },
      },
      fields: {
        concern: { type: "item", of: "concern", required: true },
        kind: { type: "enum", of: ["replaced", "excluded", "accepted-as-delivered"], required: true },
        reason: { type: "text", max: 4096, required: true },
        replacedBy: { type: "item", of: "concern", required: false },
        acceptance: { type: "fact", kind: ["accept-report"], under: "issue", required: false },
        terms: { type: "fact", kind: ["file", "revise", "propose-terms"], under: "issue", required: false },
      },
      guards: [
        { state: ["sealed"], of: "also.plan" },
        { equals: { a: { slot: "currentPlan", of: "also.goal" }, b: { item: "also.plan" } }, reason: "not-current-plan" },
        {
          anyOf: [
            [{ equals: { a: { field: "kind" }, b: { const: "excluded" } } }],
            [{ equals: { a: { field: "kind" }, b: { const: "replaced" } } }, { equals: { a: { slot: "plan", of: "also.replacement" }, b: { item: "also.plan" } } }],
            [
              { equals: { a: { field: "kind" }, b: { const: "accepted-as-delivered" } } },
              { fact: { field: "acceptance" } },
              { equals: { a: { field: "acceptance", part: "scope" }, b: { slot: "child", of: "also.concern" } } },
              { equals: { a: { field: "acceptance", part: { field: "terms" } }, b: { field: "terms" } } },
            ],
          ],
          reason: "decision-not-supported",
        },
      ],
      effects: [
        { party: { slot: "decider", from: { signer: true } } },
        { ref: { slot: "concern", from: { item: "also.concern" } } },
        { value: { slot: "kind", from: { field: "kind" } } },
        { value: { slot: "reason", from: { field: "reason" } } },
        { ref: { slot: "replacedBy", from: { item: "also.replacement" } } },
        { ref: { slot: "acceptance", from: { field: "acceptance" } } },
        { ref: { slot: "terms", from: { field: "terms" } } },
      ],
      sends: [],
      attention: [],
    },
    "drop-concern": {
      step: "transition", on: "concern", grant: "issue.plan",
      also: {},
      fields: {},
      guards: [{ state: ["created", "delivered"] }],
      effects: [{ state: "dropped" }],
      sends: [{ tell: { to: { slot: "child" }, message: "parent-dropped", fields: {}, result: {} } }],
      attention: [],
    },

    // ---------------------------------------------------------------- section 3.7
    comment: {
      step: "open", on: "comment", grant: "issue.comment",
      also: {},
      fields: {
        body: { type: "text", max: 65536, detached: true, required: true },
        replyTo: { type: "item", of: "comment", required: false },
        mentions: { type: "list", of: { type: "member" }, max: 16, required: false },
      },
      guards: [],
      effects: [
        { party: { slot: "author", from: { signer: true } } },
        { value: { slot: "body", from: { field: "body" } } },
        { ref: { slot: "replyTo", from: { field: "replyTo" } } },
        { party: { slot: "mentioned", from: { field: "mentions" } } },
      ],
      sends: [],
      attention: [{ notify: { slot: "mentioned", of: "on", when: "after", reason: "mentioned" } }],
    },

    // ---------------------------------------------------------------- shared rows
    ...discussionActs("issue"),
    ...holdActs("issue"),
  },
  receives: {
    // ---------------------------------------------------------------- section 3.5
    result: {
      message: "result", class: "relate", from: { kind: "lane", under: "issue" }, opens: null, copies: 100, settles: { of: "also.concern", in: ["created"] },
      also: {
        concern: { item: "concern", by: "parentItem" },
        goal: { item: "intent", one: true },
      },
      fields: {
        parentItem: { type: "item", of: "concern", required: true },
        commitment: { type: "fact", kind: ["offer", "propose-terms"], under: "issue", required: true },
        report: { type: "fact", kind: ["report"], under: "issue", required: true },
        acceptance: { type: "fact", kind: ["accept-report"], under: "issue", required: true },
        conditions: { type: "fact", kind: ["file", "revise"], under: "issue", required: true },
        terms: { type: "fact", kind: ["file", "revise", "propose-terms"], under: "issue", required: true },
      },
      guards: [
        { equals: { a: { sender: true }, b: { slot: "child", of: "also.concern" } }, reason: "not-the-child" },
        { state: ["created", "delivered"], of: "also.concern" },
      ],
      effects: [
        { state: "delivered", of: "also.concern" },
        { ref: { slot: "result", from: { field: "commitment" } }, of: "also.concern" },
      ],
      sends: [],
      attention: [{ notify: { slot: "requester", of: "also.goal", when: "after", reason: "concern-delivered" } }],
    },
    "parent-dropped": {
      message: "parent-dropped", class: "tell", from: { kind: "lane", under: "issue" }, opens: null,
      also: { goal: { item: "intent", one: true } },
      fields: {},
      guards: [{ equals: { a: { sender: true }, b: { slot: "parent", of: "also.goal" } }, reason: "not-the-parent" }],
      effects: [],
      sends: [],
      attention: [],
    },

    // ---------------------------------------------------------------- section 3.8
    "pin-confirm": {
      message: "pin-confirm", class: "tell", from: { kind: "lane", under: "change" }, opens: null,
      also: {},
      fields: { commit: { type: "commit", required: true } },
      guards: [
        { equals: { a: { source: "kind" }, b: { const: "propose-manifest" } }, reason: "not-a-manifest" },
        { equals: { a: { source: { field: "integration" } }, b: { field: "commit" } }, reason: "not-this-commit" },
        { capability: { name: "hold", guard: "pin", with: { consumer: { sender: true }, intent: { source: "intent" }, commit: { field: "commit" } } } },
      ],
      effects: [{ capability: { name: "hold", do: "pin-hold", with: { consumer: { sender: true }, intent: { source: "intent" }, manifest: { source: "ref" } } } }],
      sends: [],
      attention: [],
    },
    unpin: {
      message: "unpin", class: "tell", from: { kind: "lane", under: "change" }, opens: null,
      also: {},
      fields: {
        manifest: { type: "fact", kind: ["propose-manifest"], under: "change", required: true },
        commit: { type: "commit", required: true },
        because: { type: "enum", of: ["superseded", "published"], required: true },
        merge: { type: "fact", kind: ["merge"], under: "change", required: false },
      },
      guards: [
        { fact: { field: "manifest" } },
        { equals: { a: { field: "manifest", part: "scope" }, b: { sender: true } }, reason: "not-the-owner" },
        { equals: { a: { field: "manifest", part: { field: "integration" } }, b: { field: "commit" } }, reason: "not-this-commit" },
        { capability: { name: "hold", guard: "pin", with: { consumer: { sender: true }, intent: { field: "manifest", part: "intent" }, commit: { field: "commit" } } } },
        {
          anyOf: [
            [
              { equals: { a: { field: "because" }, b: { const: "superseded" } } },
              { equals: { a: { source: { set: { item: { field: "manifest", part: "seq" }, slot: "state" } } }, b: { const: "superseded" } } },
            ],
            [
              { equals: { a: { field: "because" }, b: { const: "published" } } },
              { fact: { field: "merge" } },
              { equals: { a: { field: "merge", part: "scope" }, b: { sender: true } } },
              { equals: { a: { field: "merge", part: { field: "manifest" } }, b: { field: "manifest", part: "seq" } } },
              { equals: { a: { source: { set: { item: { field: "merge", part: "seq" }, slot: "state" } } }, b: { const: "published" } } },
            ],
          ],
          reason: "still-needed",
        },
      ],
      effects: [
        {
          capability: {
            name: "hold",
            do: "pin-release",
            with: { consumer: { sender: true }, intent: { field: "manifest", part: "intent" }, manifest: { field: "manifest" }, by: { source: "ref" } },
          },
        },
      ],
      sends: [],
      attention: [],
    },

    // ---------------------------------------------------------------- section 8.1
    closes: {
      message: "closes", class: "relate", from: { kind: "lane", under: "change" }, opens: null, copies: 32, settles: { copy: ["set"] },
      also: { goal: { item: "intent", one: true } },
      fields: {
        commit: { type: "commit", required: false },
        plan: { type: "fact", kind: ["seal-plan"], under: "issue", required: false },
      },
      guards: [],
      effects: [
        {
          state: "closed",
          of: "also.goal",
          if: [
            { equals: { a: { update: "state" }, b: { const: "merged" } } },
            { state: ["open"], of: "also.goal" },
            {
              anyOf: [
                [{ unset: "currentPlan", of: "also.goal" }],
                [
                  { equals: { a: { field: "plan", part: "scope" }, b: { scope: true } } },
                  { equals: { a: { field: "plan", part: "on" }, b: { slot: "currentPlan", of: "also.goal" } } },
                ],
              ],
            },
          ],
        },
        {
          value: { slot: "closeReason", from: { const: "completed" } },
          of: "also.goal",
          if: [
            { equals: { a: { update: "state" }, b: { const: "merged" } } },
            { state: ["open"], of: "also.goal" },
            {
              anyOf: [
                [{ unset: "currentPlan", of: "also.goal" }],
                [
                  { equals: { a: { field: "plan", part: "scope" }, b: { scope: true } } },
                  { equals: { a: { field: "plan", part: "on" }, b: { slot: "currentPlan", of: "also.goal" } } },
                ],
              ],
            },
          ],
        },
        {
          ref: { slot: "closedBy", from: "self" },
          of: "also.goal",
          if: [
            { equals: { a: { update: "state" }, b: { const: "merged" } } },
            { state: ["open"], of: "also.goal" },
            {
              anyOf: [
                [{ unset: "currentPlan", of: "also.goal" }],
                [
                  { equals: { a: { field: "plan", part: "scope" }, b: { scope: true } } },
                  { equals: { a: { field: "plan", part: "on" }, b: { slot: "currentPlan", of: "also.goal" } } },
                ],
              ],
            },
          ],
        },
      ],
      sends: [],
      attention: [],
    },

    // ---------------------------------------------------------------- shared rows
    ...exportHandlers("issue"),
  },
  timed: {
    // ---------------------------------------------------------------- shared rows
    ...holdTimed,
  },
  rules: {},
} as const satisfies LaneDefinition;
