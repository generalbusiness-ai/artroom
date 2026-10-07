/**
 * The `change` definition as data (lane forms, revision 14, at 4b3bf5da, section 4).
 *
 * Every member is one row of the lane forms, written as the row states it.
 * Nothing is added and nothing is cut. The guards, effects, sends and attention
 * forms of a row are in the order of the row, one to a line; a long form is
 * broken over lines. A comment names the section a group of rows comes from.
 * The rows that both definitions share are in `shared.ts`.
 *
 * Rows marked "i5 wiring" are not rows of an adopted lane forms revision. They
 * are what the change lane needs to run against the real rules scope and
 * destination (request i5, plan 024, gate 2): the field `reports` of `merge`
 * and its send, which authority revision 28 asks of a `reserve`; the act
 * `ask-rules`; the fields of the rules scope's `rules` update that the lane
 * did not declare; and the extent that a review counts for. The note
 * `notes/2026-10-07-i5-lane-wiring-delivery.md` lists them for the lane
 * forms' owner.
 *
 * Rows marked "i5 edit" are not rows of an adopted revision either. They are
 * the smallest form of plan 025's "edit a page": the act `propose-file`, the
 * manifest's slots `path`, `digest` and `size`, and the manifest's
 * integration commit and tree made optional. The
 * note `notes/2026-10-07-i5-edit-page-delivery.md` lists them.
 *
 * Some values are the lane forms' examples, and some names are assumed
 * (their section 3): a hold's 3,600 seconds, a job's 1,800 seconds, the text maxima and integer
 * ranges, the refusal names, and the platform definition names.
 */

import { discussionActs, exportHandlers, holdActs, holdItems, holdTimed } from "./shared.ts";
import type { LaneDefinition } from "./shared.ts";

export const change = {
  format: "artroom-definition-1",
  name: "change",
  profile: { name: "restricted", version: 1 },
  capabilities: [{ name: "hold", version: 1 }, { name: "git-read", version: 1 }],
  genesis: "open",
  items: {
    // ---------------------------------------------------------------- section 4.1
    proposal: {
      many: false, max: 1, initial: "draft",
      states: { draft: { final: false }, open: { final: false }, closed: { final: false }, merged: { final: true } },
      parties: {
        author: { fixed: true, required: true, list: false, author: false },
        assignees: { fixed: false, required: false, list: true, max: 10, author: false },
      },
      refs: {
        destination: { fixed: true, required: true, to: { type: "scope", kind: "destination" } },
        rulesScope: { fixed: true, required: true, to: { type: "scope", kind: "rules" } },
      },
      values: {
        title: { fixed: false, required: true, of: { type: "text", max: 256 } },
        body: { fixed: false, required: false, of: { type: "text", max: 65536, detached: true } },
        labels: { fixed: false, required: false, of: { type: "list", of: { type: "text", max: 64 }, max: 20 } },
        number: { fixed: false, required: false, of: { type: "int", min: 1, max: 1000000000 } },
      },
    },
    manifest: {
      many: true, max: 64, initial: "current",
      states: { current: { final: false }, superseded: { final: true } },
      parties: {
        integrator: { fixed: true, required: true, list: false, author: false },
        authors: { fixed: true, required: true, list: true, max: 64, author: false },
      },
      refs: {
        goal: { fixed: true, required: false, to: { type: "fact", kind: ["file", "revise"], under: "issue" } },
        plan: { fixed: true, required: false, to: { type: "fact", kind: ["seal-plan"], under: "issue" } },
        staging: { fixed: true, required: false, to: { type: "scope", kind: "lane" } },
        under: { fixed: true, required: false, to: { type: "item", of: "commitment" } },
        pin: { fixed: true, required: false, to: { type: "fact", kind: ["hold@1:check"], under: "issue" } },
      },
      values: {
        base: { fixed: true, required: true, of: { type: "commit" } },
        // i5 edit: a one-file manifest names no integration commit and no tree. The destination writes the file into the published
        // tree and names both when it reserves the publication.
        integration: { fixed: true, required: false, of: { type: "commit" } },
        tree: { fixed: true, required: false, of: { type: "tree" } },
        // i5 edit: a one-file manifest, which `propose-file` opens: the path in the repository, and the digest and the size of the
        // file's bytes. The bytes are in the field `content` of that act's intent, which no slot holds.
        path: { fixed: true, required: false, of: { type: "text", max: 1024 } },
        digest: { fixed: true, required: false, of: { type: "digest" } },
        size: { fixed: true, required: false, of: { type: "int", min: 0, max: 65536 } },
        selected: {
          fixed: true,
          required: false,
          of: {
            type: "list",
            of: {
              type: "record",
              of: {
                accepted: { type: "fact", kind: ["accept-report"], under: "issue", required: true },
                report: { type: "fact", kind: ["report"], under: "issue", required: true },
              },
            },
            max: 32,
          },
        },
        decisions: { fixed: true, required: false, of: { type: "list", of: { type: "fact", kind: ["resolve-concern"], under: "issue" }, max: 32 } },
        complete: { fixed: true, required: true, of: { type: "bool" } },
      },
    },
    review: {
      many: true, max: 256, initial: "submitted",
      states: { submitted: { final: false }, superseded: { final: true }, withdrawn: { final: true }, dismissed: { final: true } },
      parties: { reviewer: { fixed: true, required: true, list: false, author: false } },
      refs: { manifest: { fixed: true, required: true, to: { type: "item", of: "manifest" } } },
      values: {
        verdict: { fixed: true, required: true, of: { type: "enum", of: ["approve", "request-changes"] } },
        // i5 wiring: the one extent of the rules that the verdict counts for (authority revision 28, section 12.1.4a).
        extent: { fixed: true, required: false, of: { type: "text", max: 64 } },
        body: { fixed: false, required: false, of: { type: "text", max: 65536, detached: true } },
        dismissal: { fixed: false, required: false, of: { type: "text", max: 4096 } },
      },
    },
    "review-request": {
      many: true, max: 64, initial: "open",
      states: { open: { final: false }, met: { final: true }, withdrawn: { final: true } },
      parties: {
        requested: { fixed: true, required: true, list: false, author: false },
        requester: { fixed: true, required: true, list: false, author: false },
      },
      refs: {},
      values: {},
    },
    job: {
      many: true, max: 64, initial: "requested",
      states: { requested: { final: false }, passed: { final: false }, failed: { final: false }, errored: { final: false }, "timed-out": { final: false }, superseded: { final: true } },
      parties: {
        asker: { fixed: true, required: true, list: false, author: false },
        informed: { fixed: true, required: false, list: true, max: 2, author: false },
      },
      refs: {
        manifest: { fixed: true, required: true, to: { type: "item", of: "manifest" } },
        decidedBy: { fixed: false, required: false, to: { type: "fact", kind: ["check", "check-error", "timed:job-deadline"], under: "change" } },
      },
      values: {
        name: { fixed: true, required: true, of: { type: "text", max: 128 } },
        tree: { fixed: true, required: true, of: { type: "tree" } },
        configuration: { fixed: true, required: true, of: { type: "digest" } },
        deadline: { fixed: true, required: true, of: { type: "time" } },
      },
    },
    result: {
      many: true, max: 512, initial: "recorded",
      states: { recorded: { final: true } },
      parties: { checker: { fixed: true, required: true, list: false, author: false } },
      refs: { job: { fixed: true, required: true, to: { type: "item", of: "job" } } },
      values: {
        outcome: { fixed: true, required: true, of: { type: "enum", of: ["passed", "failed", "error"] } },
        reason: { fixed: true, required: false, of: { type: "text", max: 4096 } },
        tree: { fixed: true, required: true, of: { type: "tree" } },
        details: { fixed: true, required: false, of: { type: "digest" } },
      },
    },
    thread: {
      many: true, max: 1000, initial: "open",
      states: { open: { final: false }, resolved: { final: false } },
      parties: { opener: { fixed: true, required: true, list: false, author: false } },
      refs: { manifest: { fixed: true, required: true, to: { type: "item", of: "manifest" } } },
      values: {
        path: { fixed: true, required: true, of: { type: "text", max: 4096 } },
        line: { fixed: true, required: false, of: { type: "int", min: 1, max: 1000000000 } },
        side: { fixed: true, required: false, of: { type: "enum", of: ["base", "change"] } },
      },
    },
    comment: {
      many: true, max: 5000, initial: "visible",
      states: { visible: { final: false }, collapsed: { final: false }, redacted: { final: true } },
      parties: {
        author: { fixed: true, required: true, list: false, author: false },
        mentioned: { fixed: true, required: false, list: true, max: 16, author: false },
      },
      refs: {
        replyTo: { fixed: false, required: false, to: { type: "item", of: "comment" } },
        thread: { fixed: true, required: false, to: { type: "item", of: "thread" } },
      },
      values: {
        body: { fixed: false, required: false, of: { type: "text", max: 65536, detached: true } },
        collapseReason: { fixed: false, required: false, of: { type: "text", max: 1024 } },
      },
    },
    link: {
      many: true, max: 32, initial: "set",
      states: { set: { final: false }, removed: { final: false } },
      parties: { linker: { fixed: true, required: true, list: false, author: false } },
      refs: { issue: { fixed: true, required: true, to: { type: "scope", kind: "lane" } } },
      values: { how: { fixed: true, required: true, of: { type: "enum", of: ["keyword", "manual"] } } },
    },
    merge: {
      many: true, max: 16, initial: "intended",
      states: { intended: { final: false }, committed: { final: false }, unknown: { final: false }, published: { final: true }, refused: { final: true }, aborted: { final: true } },
      parties: { merger: { fixed: true, required: true, list: false, author: false } },
      refs: { manifest: { fixed: true, required: true, to: { type: "item", of: "manifest" } } },
      values: {
        commit: { fixed: false, required: false, of: { type: "commit" } },
        reason: { fixed: false, required: false, of: { type: "text", max: 1024 } },
        withdrawal: { fixed: false, required: false, of: { type: "enum", of: ["asked"] } },
      },
    },
    rules: {
      many: false, max: 1, initial: "current",
      states: { current: { final: false } },
      parties: {},
      // i5 wiring: the real rules scope sends its update from the entry that records a lane's `rules-wanted`, of that kind.
      refs: { source: { fixed: false, required: false, to: { type: "fact", kind: ["publish", "rules-wanted"], under: "platform:rules" } } },
      values: {
        approvals: { fixed: false, required: true, of: { type: "int", min: 0, max: 64 } },
        checks: {
          fixed: false,
          required: false,
          of: {
            type: "list",
            of: {
              type: "record",
              of: {
                name: { type: "text", max: 128, required: true },
                configuration: { type: "digest", required: true },
                required: { type: "bool", required: true },
                checker: { type: "member", required: true },
              },
            },
            max: 32,
          },
        },
        ownerMayReview: { fixed: false, required: true, of: { type: "bool" } },
        revision: { fixed: false, required: true, of: { type: "int", min: 0, max: 1000000000 } },
        // i5 wiring: the extents of the published rules, as the rules scope's update projects them: no patterns, for a lane reads no path.
        extents: {
          fixed: false,
          required: false,
          of: {
            type: "list",
            of: {
              type: "record",
              of: {
                name: { type: "text", max: 64, required: true },
                approvals: { type: "int", min: 0, max: 64, required: true },
                approver: { type: "text", max: 64, required: true },
                checks: { type: "list", of: { type: "text", max: 128 }, max: 32, required: true },
                class: { type: "enum", of: ["content", "deployment", "authority"], required: true },
              },
            },
            max: 8,
          },
        },
      },
    },
    commitment: {
      many: true, max: 16, initial: "offered",
      states: { offered: { final: false }, accepted: { final: false }, declined: { final: true }, withdrawn: { final: true }, cancelled: { final: true } },
      parties: {
        requester: { fixed: true, required: true, list: false, author: false },
        offeree: { fixed: true, required: false, list: false, author: false },
        performer: { fixed: false, required: false, list: false, author: true },
        successor: { fixed: false, required: false, list: false, author: false },
      },
      refs: { termsAt: { fixed: true, required: true, to: { type: "fact", kind: ["offer"], under: "change" } } },
      values: { terms: { fixed: true, required: true, of: { type: "text", max: 4096 } } },
    },

    // ---------------------------------------------------------------- shared rows
    ...holdItems,
  },
  acts: {
    // ---------------------------------------------------------------- section 4.2: The pull request, 11 act kinds
    open: {
      step: "open", on: "proposal", grant: "change.open",
      also: {},
      fields: {
        opener: { type: "member", required: true },
        title: { type: "text", max: 256, required: true },
        body: { type: "text", max: 65536, detached: true, required: false },
        destination: { type: "scope", kind: "destination", required: true },
        rules: { type: "scope", kind: "rules", required: true },
        number: { type: "int", min: 1, max: 1000000000, required: false },
        draft: { type: "bool", required: true },
      },
      guards: [],
      effects: [
        { state: "open", if: [{ equals: { a: { field: "draft" }, b: { const: false } } }] },
        { party: { slot: "author", from: { field: "opener" } } },
        { value: { slot: "title", from: { field: "title" } } },
        { value: { slot: "body", from: { field: "body" } } },
        { ref: { slot: "destination", from: { field: "destination" } } },
        { ref: { slot: "rulesScope", from: { field: "rules" } } },
        { value: { slot: "number", from: { field: "number" } } },
      ],
      sends: [
        {
          index: {
            fields: {
              kind: { const: "pr" },
              title: { field: "title" },
              state: { const: "open" },
              draft: { field: "draft" },
              author: { field: "opener" },
              number: { field: "number" },
            },
          },
        },
      ],
      attention: [],
    },
    "edit-own": {
      step: "transition", on: "proposal", grant: "change.edit-own",
      also: {},
      fields: {
        title: { type: "text", max: 256, required: false },
        body: { type: "text", max: 65536, detached: true, required: false },
        labels: { type: "list", of: { type: "text", max: 64 }, max: 20, required: false },
      },
      guards: [
        { state: ["draft", "open", "closed"] },
        { signer: ["author"] },
      ],
      effects: [
        { value: { slot: "title", from: { field: "title" } } },
        { value: { slot: "body", from: { field: "body" } } },
        { value: { slot: "labels", from: { field: "labels" } } },
      ],
      sends: [{ index: { fields: { title: { field: "title" }, labels: { field: "labels" } } } }],
      attention: [],
    },
    "edit-any": {
      step: "transition", on: "proposal", grant: "change.edit-any",
      also: {},
      fields: {
        title: { type: "text", max: 256, required: false },
        body: { type: "text", max: 65536, detached: true, required: false },
        labels: { type: "list", of: { type: "text", max: 64 }, max: 20, required: false },
      },
      guards: [{ state: ["draft", "open", "closed"] }],
      effects: [
        { value: { slot: "title", from: { field: "title" } } },
        { value: { slot: "body", from: { field: "body" } } },
        { value: { slot: "labels", from: { field: "labels" } } },
      ],
      sends: [{ index: { fields: { title: { field: "title" }, labels: { field: "labels" } } } }],
      attention: [],
    },
    "ready-own": {
      step: "transition", on: "proposal", grant: "change.edit-own",
      also: {},
      fields: {},
      guards: [
        { state: ["draft"] },
        { signer: ["author"] },
      ],
      effects: [{ state: "open" }],
      sends: [{ index: { fields: { draft: { const: false } } } }],
      attention: [],
    },
    "ready-any": {
      step: "transition", on: "proposal", grant: "change.edit-any",
      also: {},
      fields: {},
      guards: [{ state: ["draft"] }],
      effects: [{ state: "open" }],
      sends: [{ index: { fields: { draft: { const: false } } } }],
      attention: [],
    },
    "to-draft-own": {
      step: "transition", on: "proposal", grant: "change.edit-own",
      also: {},
      fields: {},
      guards: [
        { state: ["open"] },
        { none: { type: "merge", states: ["intended", "committed", "unknown"] }, reason: "merge-in-progress" },
        { signer: ["author"] },
      ],
      effects: [{ state: "draft" }],
      sends: [{ index: { fields: { draft: { const: true } } } }],
      attention: [],
    },
    "to-draft-any": {
      step: "transition", on: "proposal", grant: "change.edit-any",
      also: {},
      fields: {},
      guards: [
        { state: ["open"] },
        { none: { type: "merge", states: ["intended", "committed", "unknown"] }, reason: "merge-in-progress" },
      ],
      effects: [{ state: "draft" }],
      sends: [{ index: { fields: { draft: { const: true } } } }],
      attention: [],
    },
    "close-own": {
      step: "transition", on: "proposal", grant: "change.edit-own",
      also: {},
      fields: {},
      guards: [
        { state: ["draft", "open"] },
        { none: { type: "merge", states: ["intended", "committed", "unknown"] }, reason: "merge-in-progress" },
        { signer: ["author"] },
      ],
      effects: [{ state: "closed" }],
      sends: [{ index: { fields: { state: { const: "closed" } } } }],
      attention: [],
    },
    "close-any": {
      step: "transition", on: "proposal", grant: "change.edit-any",
      also: {},
      fields: {},
      guards: [
        { state: ["draft", "open"] },
        { none: { type: "merge", states: ["intended", "committed", "unknown"] }, reason: "merge-in-progress" },
      ],
      effects: [{ state: "closed" }],
      sends: [{ index: { fields: { state: { const: "closed" } } } }],
      attention: [],
    },
    "reopen-own": {
      step: "transition", on: "proposal", grant: "change.edit-own",
      also: {},
      fields: {},
      guards: [
        { state: ["closed"] },
        { signer: ["author"] },
      ],
      effects: [{ state: "open" }],
      sends: [{ index: { fields: { state: { const: "open" }, draft: { const: false } } } }],
      attention: [],
    },
    "reopen-any": {
      step: "transition", on: "proposal", grant: "change.edit-any",
      also: {},
      fields: {},
      guards: [{ state: ["closed"] }],
      effects: [{ state: "open" }],
      sends: [{ index: { fields: { state: { const: "open" }, draft: { const: false } } } }],
      attention: [],
    },

    // i5 wiring: ask the rules scope that the proposal names for its rules. Its handler `rules-wanted` answers with one `rules`
    // update (authority revision 28, section 12.1.4; G11: a rules scope sends no update to a lane that did not ask).
    "ask-rules": {
      step: "transition", on: "proposal", grant: "change.propose",
      also: {},
      fields: {},
      guards: [],
      effects: [],
      sends: [{ tell: { to: { slot: "rulesScope", of: "on" }, message: "rules-wanted", fields: {}, result: {} } }],
      attention: [],
    },

    // ---------------------------------------------------------------- section 4.2: Versions, 1 act kind
    "propose-manifest": {
      step: "open", on: "manifest", grant: "change.propose",
      also: {
        proposal: { item: "proposal", one: true },
        previous: { item: "manifest", by: "previous" },
        hold: { item: "hold", by: "hold" },
        commitment: { item: "commitment", via: { slot: "under", of: "also.hold" } },
      },
      fields: {
        previous: { type: "item", of: "manifest", required: false },
        hold: { type: "item", of: "hold", required: false },
        lane: { type: "scope", kind: "lane", required: false },
        foreignHold: { type: "int", min: 0, max: 1000000000, required: false },
        instance: { type: "text", max: 128, required: true },
        goal: { type: "fact", kind: ["file", "revise"], under: "issue", required: false },
        plan: { type: "fact", kind: ["seal-plan"], under: "issue", required: false },
        selected: {
          type: "list",
          of: {
            type: "record",
            of: { accepted: { type: "fact", kind: ["accept-report"], under: "issue", required: true }, report: { type: "fact", kind: ["report"], under: "issue", required: true } },
          },
          max: 32,
          required: true,
        },
        decisions: { type: "list", of: { type: "fact", kind: ["resolve-concern"], under: "issue" }, max: 32, required: true },
        base: { type: "commit", required: true },
        integration: { type: "commit", required: true },
        tree: { type: "tree", required: true },
        complete: { type: "bool", required: true },
      },
      presents: { pin: { kind: ["hold@1:check"], under: "issue", required: false } },
      guards: [
        { state: ["draft", "open"], of: "also.proposal" },
        { none: { type: "merge", states: ["intended", "committed", "unknown"] }, reason: "merge-in-progress" },
        { none: { type: "manifest", states: ["current"], except: ["also.previous"] }, reason: "not-the-current-version" },
        { state: ["current"], of: "also.previous" },
        {
          anyOf: [
            [
              { differs: { a: { field: "hold" }, b: { none: true } } },
              { equals: { a: { field: "lane" }, b: { none: true } } },
              { equals: { a: { field: "foreignHold" }, b: { none: true } } },
              { equals: { a: { presented: "pin" }, b: { none: true } } },
            ],
            [
              { equals: { a: { field: "hold" }, b: { none: true } } },
              { differs: { a: { field: "lane" }, b: { none: true } } },
              { differs: { a: { field: "foreignHold" }, b: { none: true } } },
              { differs: { a: { presented: "pin" }, b: { none: true } } },
            ],
          ],
          reason: "source-shape",
        },
        { signer: ["holder"], of: "also.hold" },
        { state: ["held", "ended"], of: "also.hold" },
        { state: ["accepted"], of: "also.commitment" },
        { signer: ["performer"], of: "also.commitment" },
        { fact: { presented: "pin" }, ifPresent: true },
        { equals: { a: { presented: "pin", part: "scope" }, b: { field: "lane" } }, reason: "pin-mismatch", ifPresent: true },
        { equals: { a: { presented: "pin", part: { carried: "check.intent" } }, b: { intent: true } }, reason: "pin-mismatch", ifPresent: true },
        { equals: { a: { presented: "pin", part: { carried: "check.commit" } }, b: { field: "integration" } }, reason: "pin-mismatch", ifPresent: true },
        { equals: { a: { presented: "pin", part: { carried: "check.consumer" } }, b: { scope: true } }, reason: "pin-mismatch", ifPresent: true },
        { equals: { a: { presented: "pin", part: { carried: "check.hold" } }, b: { field: "foreignHold" } }, reason: "pin-mismatch", ifPresent: true },
        { equals: { a: { presented: "pin", part: { carried: "check.instance" } }, b: { field: "instance" } }, reason: "pin-mismatch", ifPresent: true },
        { capability: { name: "hold", guard: "staged", with: { commit: { field: "integration" }, under: { item: "also.commitment" }, pin: { presented: "pin" } } } },
        {
          each: {
            list: { field: "selected" },
            as: "s",
            guards: [
              { fact: { element: "s.accepted" } },
              { fact: { element: "s.report" } },
              { equals: { a: { element: "s.report", part: "scope" }, b: { element: "s.accepted", part: "scope" } } },
              { equals: { a: { element: "s.report", part: "seq" }, b: { element: "s.accepted", part: "on" } } },
            ],
          },
          reason: "selection-malformed",
        },
        { fact: { field: "goal" }, ifPresent: true },
        { fact: { field: "plan" }, ifPresent: true },
        {
          anyOf: [[{ equals: { a: { field: "plan" }, b: { none: true } } }], [{ equals: { a: { field: "plan", part: "scope" }, b: { field: "goal", part: "scope" } } }]],
          reason: "plan-not-of-goal",
        },
        {
          each: { list: { field: "decisions" }, as: "d", guards: [{ fact: { element: "d" } }, { differs: { a: { field: "plan" }, b: { none: true } } }] },
          reason: "decision-without-plan",
        },
        {
          anyOf: [
            [{ equals: { a: { field: "complete" }, b: { const: false } } }],
            [{ equals: { a: { field: "plan" }, b: { none: true } } }],
            [
              { equals: { a: { field: "plan", part: "scope" }, b: { field: "goal", part: "scope" } } },
              { equals: { a: { field: "plan", part: { field: "goalAt" } }, b: { field: "goal" } } },
              {
                each: {
                  list: { field: "selected" },
                  as: "s",
                  guards: [
                    {
                      anyOf: [
                        [
                          {
                            has: {
                              list: { field: "plan", part: { field: "required" } },
                              as: "k",
                              where: [{ equals: { a: { element: "k.child" }, b: { element: "s.accepted", part: "scope" } } }],
                            },
                          },
                        ],
                        [
                          {
                            has: {
                              list: { field: "plan", part: { field: "optional" } },
                              as: "k",
                              where: [{ equals: { a: { element: "k.child" }, b: { element: "s.accepted", part: "scope" } } }],
                            },
                          },
                        ],
                      ],
                    },
                  ],
                },
              },
              { distinct: { list: { field: "selected" }, as: "s", key: { element: "s.accepted", part: "scope" } } },
              {
                each: {
                  list: { field: "selected" },
                  as: "s",
                  where: [{ differs: { a: { element: "s.accepted", part: { of: { field: "terms" }, then: "seq" } }, b: { const: 0 } } }],
                  guards: [
                    {
                      has: {
                        list: { field: "decisions" },
                        as: "d",
                        where: [
                          { equals: { a: { element: "d", part: { field: "kind" } }, b: { const: "accepted-as-delivered" } } },
                          { equals: { a: { element: "d", part: { field: "acceptance" } }, b: { element: "s.accepted" } } },
                          { equals: { a: { element: "d", part: { field: "terms" } }, b: { element: "s.accepted", part: { field: "terms" } } } },
                        ],
                      },
                    },
                  ],
                },
              },
              {
                each: {
                  list: { field: "selected" },
                  as: "s",
                  where: [{ differs: { a: { element: "s.accepted", part: { of: { field: "terms" }, then: "scope" } }, b: { element: "s.accepted", part: "scope" } } }],
                  guards: [
                    {
                      has: {
                        list: { field: "decisions" },
                        as: "d",
                        where: [
                          { equals: { a: { element: "d", part: { field: "kind" } }, b: { const: "accepted-as-delivered" } } },
                          { equals: { a: { element: "d", part: { field: "acceptance" } }, b: { element: "s.accepted" } } },
                          { equals: { a: { element: "d", part: { field: "terms" } }, b: { element: "s.accepted", part: { field: "terms" } } } },
                        ],
                      },
                    },
                  ],
                },
              },
              {
                each: {
                  list: { field: "decisions" },
                  as: "d",
                  guards: [
                    { equals: { a: { element: "d", part: "scope" }, b: { field: "plan", part: "scope" } } },
                    {
                      anyOf: [
                        [
                          {
                            has: {
                              list: { field: "plan", part: { field: "required" } },
                              as: "k",
                              where: [{ equals: { a: { element: "k.item" }, b: { element: "d", part: { field: "concern" } } } }],
                            },
                          },
                        ],
                        [
                          {
                            has: {
                              list: { field: "plan", part: { field: "optional" } },
                              as: "k",
                              where: [{ equals: { a: { element: "k.item" }, b: { element: "d", part: { field: "concern" } } } }],
                            },
                          },
                        ],
                      ],
                    },
                    {
                      anyOf: [
                        [{ differs: { a: { element: "d", part: { field: "kind" } }, b: { const: "replaced" } } }],
                        [
                          {
                            anyOf: [
                              [
                                {
                                  has: {
                                    list: { field: "plan", part: { field: "required" } },
                                    as: "k",
                                    where: [{ equals: { a: { element: "k.item" }, b: { element: "d", part: { field: "replacedBy" } } } }],
                                  },
                                },
                              ],
                              [
                                {
                                  has: {
                                    list: { field: "plan", part: { field: "optional" } },
                                    as: "k",
                                    where: [{ equals: { a: { element: "k.item" }, b: { element: "d", part: { field: "replacedBy" } } } }],
                                  },
                                },
                              ],
                            ],
                          },
                        ],
                      ],
                    },
                  ],
                },
              },
              {
                each: {
                  list: { field: "plan", part: { field: "required" } },
                  as: "q",
                  guards: [
                    {
                      anyOf: [
                        [{ has: { list: { field: "selected" }, as: "s", where: [{ equals: { a: { element: "s.accepted", part: "scope" }, b: { element: "q.child" } } }] } }],
                        [
                          {
                            has: {
                              list: { field: "decisions" },
                              as: "d",
                              where: [
                                { equals: { a: { element: "d", part: { field: "concern" } }, b: { element: "q.item" } } },
                                { equals: { a: { element: "d", part: { field: "kind" } }, b: { const: "excluded" } } },
                              ],
                            },
                          },
                        ],
                        [
                          {
                            has: {
                              list: { field: "decisions" },
                              as: "d",
                              where: [
                                { equals: { a: { element: "d", part: { field: "concern" } }, b: { element: "q.item" } } },
                                { equals: { a: { element: "d", part: { field: "kind" } }, b: { const: "replaced" } } },
                              ],
                              guards: [
                                {
                                  anyOf: [
                                    [
                                      {
                                        has: {
                                          list: { field: "plan", part: { field: "required" } },
                                          as: "k",
                                          where: [{ equals: { a: { element: "k.item" }, b: { element: "d", part: { field: "replacedBy" } } } }],
                                          guards: [
                                            {
                                              has: {
                                                list: { field: "selected" },
                                                as: "s",
                                                where: [{ equals: { a: { element: "s.accepted", part: "scope" }, b: { element: "k.child" } } }],
                                              },
                                            },
                                          ],
                                        },
                                      },
                                    ],
                                    [
                                      {
                                        has: {
                                          list: { field: "plan", part: { field: "optional" } },
                                          as: "k",
                                          where: [{ equals: { a: { element: "k.item" }, b: { element: "d", part: { field: "replacedBy" } } } }],
                                          guards: [
                                            {
                                              has: {
                                                list: { field: "selected" },
                                                as: "s",
                                                where: [{ equals: { a: { element: "s.accepted", part: "scope" }, b: { element: "k.child" } } }],
                                              },
                                            },
                                          ],
                                        },
                                      },
                                    ],
                                  ],
                                },
                              ],
                            },
                          },
                        ],
                      ],
                    },
                  ],
                },
              },
            ],
          ],
          reason: "not-complete",
        },
        {
          capability: {
            name: "git-read",
            guard: "ancestry",
            with: {
              commit: { field: "integration" },
              row: { const: "manifest" },
              pin: { presented: "pin" },
              selected: { each: { field: "selected" }, as: "s", value: { element: "s.report", part: { opened: "commit" } } },
              earlier: { items: { type: "manifest", states: ["current", "superseded"] }, slot: "integration" },
            },
          },
        },
      ],
      effects: [
        { party: { slot: "integrator", from: { signer: true } } },
        {
          attribute: {
            slot: "authors",
            of: "also.commitment",
            with: [
              { each: { field: "selected" }, as: "s", list: { element: "s.report", part: { opened: "authors" } } },
              { subject: "also.previous", slot: "authors" },
              { list: { presented: "pin", part: { carried: "check.attribution" } } },
            ],
          },
        },
        { ref: { slot: "goal", from: { field: "goal" } } },
        { ref: { slot: "plan", from: { field: "plan" } } },
        { ref: { slot: "staging", from: { field: "lane" } } },
        { ref: { slot: "under", from: { item: "also.commitment" } } },
        { ref: { slot: "pin", from: { presented: "pin", part: "ref" } } },
        { value: { slot: "base", from: { field: "base" } } },
        { value: { slot: "integration", from: { field: "integration" } } },
        { value: { slot: "tree", from: { field: "tree" } } },
        { value: { slot: "selected", from: { field: "selected" } } },
        { value: { slot: "decisions", from: { field: "decisions" } } },
        { value: { slot: "complete", from: { field: "complete" } } },
        { state: "superseded", of: "also.previous" },
        { capability: { name: "hold", do: "pin-hold", with: { commit: { field: "integration" } } }, if: [{ differs: { a: { field: "hold" }, b: { none: true } } }] },
        { capability: { name: "hold", do: "pin-release", with: { commit: { slot: "integration", of: "also.previous" } } }, if: [{ unset: "staging", of: "also.previous" }] },
      ],
      sends: [
        {
          tell: {
            to: { slot: "staging", of: "on" },
            message: "pin-confirm",
            if: [{ differs: { a: { field: "lane" }, b: { none: true } } }],
            fields: { commit: { field: "integration" } },
            result: {},
          },
        },
        {
          tell: {
            to: { slot: "staging", of: "also.previous" },
            message: "unpin",
            if: [{ set: "staging", of: "also.previous" }],
            fields: { manifest: { item: "also.previous" }, commit: { slot: "integration", of: "also.previous" }, because: { const: "superseded" } },
            result: {},
          },
        },
      ],
      attention: [],
    },

    // i5 edit: a one-file version of the change (plan 025, section 2, "Edit a page"). The signer is the proposal's author, and it is
    // the only version: no hold, no workspace and no report, for the room, not the person, writes the repository. The file's bytes
    // are the field `content`, a text in the signed intent: a detached text would be kept by the lane alone, for a message to a
    // scope that is no lane carries none (section 6.2). The destination reads them from this entry, which `reserve` names as the
    // manifest, checks them against `digest` and `size`, judges the path, writes the file into the published tree and names the
    // commit.
    "propose-file": {
      step: "open", on: "manifest", grant: "change.propose",
      also: { proposal: { item: "proposal", one: true } },
      fields: {
        base: { type: "commit", required: true },
        path: { type: "text", max: 1024, required: true },
        digest: { type: "digest", required: true },
        size: { type: "int", min: 0, max: 65536, required: true },
        content: { type: "text", max: 65536, required: true },
      },
      guards: [
        { state: ["draft", "open"], of: "also.proposal" },
        { signer: ["author"], of: "also.proposal" },
        { none: { type: "merge", states: ["intended", "committed", "unknown"] }, reason: "merge-in-progress" },
        { none: { type: "manifest", states: ["current", "superseded"] }, reason: "one-version" },
      ],
      effects: [
        { party: { slot: "integrator", from: { signer: true } } },
        { party: { slot: "authors", from: [{ signer: true }] } },
        { value: { slot: "base", from: { field: "base" } } },
        { value: { slot: "path", from: { field: "path" } } },
        { value: { slot: "digest", from: { field: "digest" } } },
        { value: { slot: "size", from: { field: "size" } } },
        { value: { slot: "complete", from: { const: true } } },
      ],
      sends: [],
      attention: [],
    },

    // ---------------------------------------------------------------- section 4.2: Reviews, 7 act kinds
    "request-review-own": {
      step: "open", on: "review-request", grant: "change.edit-own",
      also: { proposal: { item: "proposal", one: true } },
      fields: { requested: { type: "member", required: true } },
      guards: [
        { state: ["draft", "open"], of: "also.proposal" },
        { signer: ["author"], of: "also.proposal" },
      ],
      effects: [
        { party: { slot: "requested", from: { field: "requested" } } },
        { party: { slot: "requester", from: { signer: true } } },
      ],
      sends: [],
      attention: [{ notify: { slot: "requested", of: "on", when: "after", reason: "review-requested" } }],
    },
    "request-review-any": {
      step: "open", on: "review-request", grant: "change.edit-any",
      also: { proposal: { item: "proposal", one: true } },
      fields: { requested: { type: "member", required: true } },
      guards: [{ state: ["draft", "open"], of: "also.proposal" }],
      effects: [
        { party: { slot: "requested", from: { field: "requested" } } },
        { party: { slot: "requester", from: { signer: true } } },
      ],
      sends: [],
      attention: [{ notify: { slot: "requested", of: "on", when: "after", reason: "review-requested" } }],
    },
    "withdraw-review-request-own": {
      step: "transition", on: "review-request", grant: "change.edit-own",
      also: { proposal: { item: "proposal", one: true } },
      fields: {},
      guards: [
        { state: ["open"] },
        { signer: ["requester"] },
      ],
      effects: [{ state: "withdrawn" }],
      sends: [],
      attention: [],
    },
    "withdraw-review-request-any": {
      step: "transition", on: "review-request", grant: "change.edit-any",
      also: { proposal: { item: "proposal", one: true } },
      fields: {},
      guards: [{ state: ["open"] }],
      effects: [{ state: "withdrawn" }],
      sends: [],
      attention: [],
    },
    "review-verdict": {
      step: "open", on: "review", grant: "change.review",
      also: {
        manifest: { item: "manifest", by: "manifest" },
        earlier: { item: "review", by: "earlier" },
        request: { item: "review-request", by: "request" },
        proposal: { item: "proposal", one: true },
      },
      fields: {
        manifest: { type: "item", of: "manifest", required: true },
        earlier: { type: "item", of: "review", required: false },
        request: { type: "item", of: "review-request", required: false },
        verdict: { type: "enum", of: ["approve", "request-changes"], required: true },
        body: { type: "text", max: 65536, detached: true, required: false },
        // i5 wiring: the extent that the verdict counts for, by its name in the rules that the rules scope published. The lane does
        // not check the name: a fifth subject of the act is over the bound of four. The destination counts a name that is no extent
        // of the rules it observes for none (authority revision 28, section 12.1.4a).
        extent: { type: "text", max: 64, required: false },
      },
      guards: [
        { state: ["current"], of: "also.manifest" },
        { none: { type: "merge", states: ["intended", "committed", "unknown"] }, reason: "merge-in-progress" },
        { notIn: ["authors"], of: "also.manifest", reason: "author-cannot-review" },
        { signer: ["reviewer"], of: "also.earlier" },
        { equals: { a: { slot: "manifest", of: "also.earlier" }, b: { item: "also.manifest" } }, of: "also.earlier" },
        { state: ["submitted"], of: "also.earlier" },
        { signer: ["requested"], of: "also.request" },
        { state: ["open"], of: "also.request" },
        {
          none: {
            type: "review",
            states: ["submitted"],
            where: [{ equals: { a: { slot: "manifest" }, b: { item: "also.manifest" } } }, { equals: { a: { slot: "reviewer" }, b: { signer: true } } }],
            except: ["also.earlier"],
          },
          reason: "verdict-exists",
        },
      ],
      effects: [
        { party: { slot: "reviewer", from: { signer: true } } },
        { ref: { slot: "manifest", from: { item: "also.manifest" } } },
        { value: { slot: "verdict", from: { field: "verdict" } } },
        { value: { slot: "extent", from: { field: "extent" } } },
        { value: { slot: "body", from: { field: "body" } } },
        { state: "superseded", of: "also.earlier" },
        { state: "met", of: "also.request" },
      ],
      sends: [],
      attention: [{ notify: { slot: "author", of: "also.proposal", when: "after", reason: "reviewed" } }],
    },
    "withdraw-review": {
      step: "transition", on: "review", grant: "change.review",
      also: {},
      fields: {},
      guards: [
        { state: ["submitted"] },
        { signer: ["reviewer"] },
        { none: { type: "merge", states: ["intended", "committed", "unknown"] }, reason: "merge-in-progress" },
      ],
      effects: [{ state: "withdrawn" }],
      sends: [],
      attention: [],
    },
    "dismiss-review": {
      step: "transition", on: "review", grant: "change.dismiss",
      also: {},
      fields: { reason: { type: "text", max: 4096, required: true } },
      guards: [
        { state: ["submitted"] },
        { none: { type: "merge", states: ["intended", "committed", "unknown"] }, reason: "merge-in-progress" },
      ],
      effects: [
        { state: "dismissed" },
        { value: { slot: "dismissal", from: { field: "reason" } } },
      ],
      sends: [],
      attention: [],
    },

    // ---------------------------------------------------------------- section 4.2: Checks, 3 act kinds, and one timed rule
    "request-check": {
      step: "open", on: "job", grant: "change.propose",
      also: {
        manifest: { item: "manifest", by: "manifest" },
        proposal: { item: "proposal", one: true },
        earlier: { item: "job", by: "earlier" },
        rules: { item: "rules", one: true },
      },
      fields: {
        manifest: { type: "item", of: "manifest", required: true },
        earlier: { type: "item", of: "job", required: false },
        name: { type: "text", max: 128, required: true },
        configuration: { type: "digest", required: true },
      },
      guards: [
        { state: ["current"], of: "also.manifest" },
        { none: { type: "merge", states: ["intended", "committed", "unknown"] }, reason: "merge-in-progress" },
        { equals: { a: { slot: "manifest", of: "also.earlier" }, b: { item: "also.manifest" } }, of: "also.earlier" },
        { equals: { a: { slot: "name", of: "also.earlier" }, b: { field: "name" } }, of: "also.earlier" },
        { state: ["requested", "passed", "failed", "errored", "timed-out"], of: "also.earlier" },
        {
          none: {
            type: "job",
            states: ["requested", "passed", "failed", "errored", "timed-out"],
            where: [{ equals: { a: { slot: "manifest" }, b: { item: "also.manifest" } } }, { equals: { a: { slot: "name" }, b: { field: "name" } } }],
            except: ["also.earlier"],
          },
          reason: "job-exists",
        },
        {
          has: {
            list: { slot: "checks", of: "also.rules" },
            as: "k",
            where: [{ equals: { a: { element: "k.name" }, b: { field: "name" } } }, { equals: { a: { element: "k.configuration" }, b: { field: "configuration" } } }],
          },
          reason: "not-a-check-of-the-rules",
        },
      ],
      effects: [
        { party: { slot: "asker", from: { signer: true } } },
        { ref: { slot: "manifest", from: { item: "also.manifest" } } },
        { value: { slot: "name", from: { field: "name" } } },
        { value: { slot: "tree", from: { slot: "tree", of: "also.manifest" } } },
        { value: { slot: "configuration", from: { field: "configuration" } } },
        { value: { slot: "deadline", from: { time: { plusSeconds: 1800 } } } },
        { party: { slot: "informed", from: [{ slot: "author", of: "also.proposal" }, { slot: "integrator", of: "also.manifest" }] } },
        { state: "superseded", of: "also.earlier" },
      ],
      sends: [],
      attention: [],
    },
    check: {
      step: "open", on: "result", grant: "change.check", settles: { of: "also.job", in: ["requested", "timed-out"] },
      also: {
        job: { item: "job", by: "job" },
        rules: { item: "rules", one: true },
        proposal: { item: "proposal", one: true },
      },
      fields: {
        job: { type: "item", of: "job", required: true },
        tree: { type: "tree", required: true },
        configuration: { type: "digest", required: true },
        outcome: { type: "enum", of: ["passed", "failed"], required: true },
        details: { type: "digest", required: false },
      },
      guards: [
        { none: { type: "merge", states: ["intended", "committed", "unknown"] }, reason: "merge-in-progress" },
        { equals: { a: { field: "tree" }, b: { slot: "tree", of: "also.job" } }, reason: "not-this-job" },
        { equals: { a: { field: "configuration" }, b: { slot: "configuration", of: "also.job" } }, reason: "not-this-job" },
        {
          has: {
            list: { slot: "checks", of: "also.rules" },
            as: "k",
            where: [{ equals: { a: { element: "k.name" }, b: { slot: "name", of: "also.job" } } }, { equals: { a: { element: "k.checker" }, b: { signer: true } } }],
          },
          reason: "not-the-checker",
        },
      ],
      effects: [
        { party: { slot: "checker", from: { signer: true } } },
        { ref: { slot: "job", from: { item: "also.job" } } },
        { value: { slot: "outcome", from: { field: "outcome" } } },
        { value: { slot: "tree", from: { field: "tree" } } },
        { value: { slot: "details", from: { field: "details" } } },
        { state: "passed", of: "also.job", if: [{ state: ["requested", "timed-out"], of: "also.job" }, { equals: { a: { field: "outcome" }, b: { const: "passed" } } }] },
        { state: "failed", of: "also.job", if: [{ state: ["requested", "timed-out"], of: "also.job" }, { equals: { a: { field: "outcome" }, b: { const: "failed" } } }] },
        { ref: { slot: "decidedBy", from: "self" }, of: "also.job", if: [{ state: ["requested", "timed-out"], of: "also.job" }] },
      ],
      sends: [],
      attention: [{ notify: { slot: "author", of: "also.proposal", when: "after", reason: "check-failed", if: [{ equals: { a: { field: "outcome" }, b: { const: "failed" } } }] } }],
    },
    "check-error": {
      step: "open", on: "result", grant: "change.check", settles: { of: "also.job", in: ["requested", "timed-out"] },
      also: {
        job: { item: "job", by: "job" },
        rules: { item: "rules", one: true },
      },
      fields: {
        job: { type: "item", of: "job", required: true },
        tree: { type: "tree", required: true },
        configuration: { type: "digest", required: true },
        reason: { type: "text", max: 4096, required: true },
        details: { type: "digest", required: false },
      },
      guards: [
        { none: { type: "merge", states: ["intended", "committed", "unknown"] }, reason: "merge-in-progress" },
        { equals: { a: { field: "tree" }, b: { slot: "tree", of: "also.job" } }, reason: "not-this-job" },
        { equals: { a: { field: "configuration" }, b: { slot: "configuration", of: "also.job" } }, reason: "not-this-job" },
        {
          has: {
            list: { slot: "checks", of: "also.rules" },
            as: "k",
            where: [{ equals: { a: { element: "k.name" }, b: { slot: "name", of: "also.job" } } }, { equals: { a: { element: "k.checker" }, b: { signer: true } } }],
          },
          reason: "not-the-checker",
        },
      ],
      effects: [
        { party: { slot: "checker", from: { signer: true } } },
        { ref: { slot: "job", from: { item: "also.job" } } },
        { value: { slot: "outcome", from: { const: "error" } } },
        { value: { slot: "reason", from: { field: "reason" } } },
        { value: { slot: "tree", from: { field: "tree" } } },
        { state: "errored", of: "also.job", if: [{ state: ["requested", "timed-out"], of: "also.job" }] },
        { ref: { slot: "decidedBy", from: "self" }, of: "also.job", if: [{ state: ["requested", "timed-out"], of: "also.job" }] },
        { value: { slot: "details", from: { field: "details" } } },
      ],
      sends: [],
      attention: [{ notify: { slot: "informed", of: "also.job", when: "after", reason: "check-errored" } }],
    },

    // ---------------------------------------------------------------- section 4.2: Discussion and threads, 12 act kinds
    comment: {
      step: "open", on: "comment", grant: "change.comment",
      also: {},
      fields: {
        body: { type: "text", max: 65536, detached: true, required: true },
        replyTo: { type: "item", of: "comment", required: false },
        thread: { type: "item", of: "thread", required: false },
        mentions: { type: "list", of: { type: "member" }, max: 16, required: false },
      },
      guards: [],
      effects: [
        { party: { slot: "author", from: { signer: true } } },
        { value: { slot: "body", from: { field: "body" } } },
        { ref: { slot: "replyTo", from: { field: "replyTo" } } },
        { ref: { slot: "thread", from: { field: "thread" } } },
        { party: { slot: "mentioned", from: { field: "mentions" } } },
      ],
      sends: [],
      attention: [{ notify: { slot: "mentioned", of: "on", when: "after", reason: "mentioned" } }],
    },
    "open-thread": {
      step: "open", on: "thread", grant: "change.comment",
      also: { manifest: { item: "manifest", by: "manifest" } },
      fields: {
        manifest: { type: "item", of: "manifest", required: true },
        path: { type: "text", max: 4096, required: true },
        line: { type: "int", min: 1, max: 1000000000, required: false },
        side: { type: "enum", of: ["base", "change"], required: false },
      },
      guards: [],
      effects: [
        { party: { slot: "opener", from: { signer: true } } },
        { ref: { slot: "manifest", from: { item: "also.manifest" } } },
        { value: { slot: "path", from: { field: "path" } } },
        { value: { slot: "line", from: { field: "line" } } },
        { value: { slot: "side", from: { field: "side" } } },
      ],
      sends: [],
      attention: [],
    },
    "resolve-thread-own": {
      step: "transition", on: "thread", grant: "change.edit-own",
      also: { proposal: { item: "proposal", one: true } },
      fields: {},
      guards: [
        { state: ["open"] },
        { signer: ["author"], of: "also.proposal" },
      ],
      effects: [{ state: "resolved" }],
      sends: [],
      attention: [],
    },
    "resolve-thread-any": {
      step: "transition", on: "thread", grant: "change.edit-any",
      also: { proposal: { item: "proposal", one: true } },
      fields: {},
      guards: [{ state: ["open"] }],
      effects: [{ state: "resolved" }],
      sends: [],
      attention: [],
    },
    "reopen-thread-own": {
      step: "transition", on: "thread", grant: "change.edit-own",
      also: { proposal: { item: "proposal", one: true } },
      fields: {},
      guards: [
        { state: ["resolved"] },
        { signer: ["author"], of: "also.proposal" },
      ],
      effects: [{ state: "open" }],
      sends: [],
      attention: [],
    },
    "reopen-thread-any": {
      step: "transition", on: "thread", grant: "change.edit-any",
      also: { proposal: { item: "proposal", one: true } },
      fields: {},
      guards: [{ state: ["resolved"] }],
      effects: [{ state: "open" }],
      sends: [],
      attention: [],
    },

    // ---------------------------------------------------------------- section 4.2: Links and merge, 6 act kinds
    "link-own": {
      step: "open", on: "link", grant: "change.edit-own",
      also: { proposal: { item: "proposal", one: true } },
      fields: {
        issue: { type: "scope", kind: "lane", required: true },
        how: { type: "enum", of: ["keyword", "manual"], required: true },
      },
      guards: [
        { none: { type: "merge", states: ["intended", "committed", "unknown"] }, reason: "merge-in-progress" },
        { state: ["draft", "open", "closed"], of: "also.proposal" },
        { none: { type: "link", states: ["set"], where: [{ equals: { a: { slot: "issue" }, b: { field: "issue" } } }] }, reason: "already-linked" },
        { signer: ["author"], of: "also.proposal" },
      ],
      effects: [
        { ref: { slot: "issue", from: { field: "issue" } } },
        { party: { slot: "linker", from: { signer: true } } },
        { value: { slot: "how", from: { field: "how" } } },
      ],
      sends: [{ relate: { to: { field: "issue" }, name: "closes", item: "self", state: "set", detail: {}, result: {} } }],
      attention: [],
    },
    "link-any": {
      step: "open", on: "link", grant: "change.edit-any",
      also: { proposal: { item: "proposal", one: true } },
      fields: {
        issue: { type: "scope", kind: "lane", required: true },
        how: { type: "enum", of: ["keyword", "manual"], required: true },
      },
      guards: [
        { none: { type: "merge", states: ["intended", "committed", "unknown"] }, reason: "merge-in-progress" },
        { state: ["draft", "open", "closed"], of: "also.proposal" },
        { none: { type: "link", states: ["set"], where: [{ equals: { a: { slot: "issue" }, b: { field: "issue" } } }] }, reason: "already-linked" },
      ],
      effects: [
        { ref: { slot: "issue", from: { field: "issue" } } },
        { party: { slot: "linker", from: { signer: true } } },
        { value: { slot: "how", from: { field: "how" } } },
      ],
      sends: [{ relate: { to: { field: "issue" }, name: "closes", item: "self", state: "set", detail: {}, result: {} } }],
      attention: [],
    },
    "unlink-own": {
      step: "transition", on: "link", grant: "change.edit-own",
      also: { proposal: { item: "proposal", one: true } },
      fields: {},
      guards: [
        { state: ["set"] },
        { none: { type: "merge", states: ["intended", "committed", "unknown"] }, reason: "merge-in-progress" },
        { state: ["draft", "open", "closed"], of: "also.proposal" },
        { signer: ["author"], of: "also.proposal" },
      ],
      effects: [{ state: "removed" }],
      sends: [{ relate: { to: { slot: "issue" }, name: "closes", item: { item: "on" }, state: "removed", detail: {}, result: {} } }],
      attention: [],
    },
    "unlink-any": {
      step: "transition", on: "link", grant: "change.edit-any",
      also: { proposal: { item: "proposal", one: true } },
      fields: {},
      guards: [
        { state: ["set"] },
        { none: { type: "merge", states: ["intended", "committed", "unknown"] }, reason: "merge-in-progress" },
        { state: ["draft", "open", "closed"], of: "also.proposal" },
      ],
      effects: [{ state: "removed" }],
      sends: [{ relate: { to: { slot: "issue" }, name: "closes", item: { item: "on" }, state: "removed", detail: {}, result: {} } }],
      attention: [],
    },
    merge: {
      step: "open", on: "merge", grant: "change.merge",
      also: {
        proposal: { item: "proposal", one: true },
        manifest: { item: "manifest", by: "manifest" },
        rules: { item: "rules", one: true },
      },
      fields: {
        manifest: { type: "item", of: "manifest", required: true },
        // i5 wiring: the `report` entry of each report that the manifest selects, in the order of its selections (authority revision
        // 28, section 6.5, "`reserve` names each selected report"). No operand maps a list, so the merger names them, and the guard
        // `reports-not-selected` binds them to the selections. The destination checks the order and the count again, exactly.
        reports: { type: "list", of: { type: "fact", kind: ["report"], under: "issue" }, max: 32, required: true },
      },
      guards: [
        { state: ["open"], of: "also.proposal", reason: "draft" },
        { state: ["current"], of: "also.manifest", reason: "newer-version" },
        { equals: { a: { slot: "complete", of: "also.manifest" }, b: { const: true } }, reason: "not-complete" },
        { none: { type: "merge", states: ["intended", "committed", "unknown"] }, reason: "merge-in-progress" },
        { differs: { a: { slot: "revision", of: "also.rules" }, b: { none: true } }, reason: "rules-unknown" },
        {
          count: {
            type: "review",
            states: ["submitted"],
            where: [{ equals: { a: { slot: "verdict" }, b: { const: "approve" } } }, { equals: { a: { slot: "manifest" }, b: { item: "also.manifest" } } }],
            min: { slot: "approvals", of: "also.rules" },
          },
          reason: "approvals-needed",
        },
        {
          none: {
            type: "review",
            states: ["submitted"],
            where: [{ equals: { a: { slot: "verdict" }, b: { const: "request-changes" } } }, { equals: { a: { slot: "manifest" }, b: { item: "also.manifest" } } }],
          },
          reason: "changes-requested",
        },
        {
          each: {
            list: { slot: "checks", of: "also.rules" },
            as: "k",
            where: [{ equals: { a: { element: "k.required" }, b: { const: true } } }],
            guards: [
              {
                some: {
                  type: "job",
                  states: ["passed"],
                  where: [
                    { equals: { a: { slot: "name" }, b: { element: "k.name" } } },
                    { equals: { a: { slot: "configuration" }, b: { element: "k.configuration" } } },
                    { equals: { a: { slot: "manifest" }, b: { item: "also.manifest" } } },
                  ],
                },
              },
            ],
          },
          reason: "required-check-not-passed",
        },
        // i5 wiring: each named report is a selection's report, and each selection's report is named.
        {
          each: {
            list: { field: "reports" },
            as: "r",
            guards: [{ has: { list: { slot: "selected", of: "also.manifest" }, as: "s", where: [{ equals: { a: { element: "s.report" }, b: { element: "r" } } }] } }],
          },
          reason: "reports-not-selected",
        },
        {
          each: {
            list: { slot: "selected", of: "also.manifest" },
            as: "s",
            guards: [{ has: { list: { field: "reports" }, as: "r", where: [{ equals: { a: { element: "r" }, b: { element: "s.report" } } }] } }],
          },
          reason: "reports-not-selected",
        },
      ],
      effects: [
        { party: { slot: "merger", from: { signer: true } } },
        { ref: { slot: "manifest", from: { item: "also.manifest" } } },
      ],
      sends: [
        {
          tell: {
            to: { slot: "destination", of: "also.proposal" },
            message: "reserve",
            fields: {
              operation: "self",
              manifest: { item: "also.manifest" },
              verdicts: {
                collect: {
                  items: { type: "review", states: ["submitted"], where: [{ equals: { a: { slot: "manifest" }, b: { item: "also.manifest" } } }] },
                  fields: { review: "item", reviewer: "reviewer", verdict: "verdict", extent: "extent" },
                },
              },
              jobs: {
                collect: {
                  items: {
                    type: "job",
                    states: ["requested", "passed", "failed", "errored", "timed-out"],
                    where: [{ equals: { a: { slot: "manifest" }, b: { item: "also.manifest" } } }],
                  },
                  fields: { job: "item", name: "name", state: "state", decidedBy: "decidedBy" },
                },
              },
              links: { collect: { items: { type: "link", states: ["set"] }, fields: { link: "item", issue: "issue" } } },
              // i5 wiring: the sixth field of `reserve`.
              reports: { field: "reports" },
            },
            result: {
              refused: [
                { state: "aborted", if: [{ equals: { a: { result: "reason" }, b: { const: "withdrawn" } } }] },
                { state: "refused", unless: [{ equals: { a: { result: "reason" }, b: { const: "withdrawn" } } }] },
                { value: { slot: "reason", from: { result: "reason" } } },
              ],
              undelivered: [{ state: "refused" }, { value: { slot: "reason", from: { const: "undelivered" } } }],
            },
          },
        },
      ],
      attention: [],
    },
    "cancel-merge": {
      step: "transition", on: "merge", grant: "change.merge",
      also: { proposal: { item: "proposal", one: true } },
      fields: {},
      guards: [
        { state: ["intended"] },
        { unset: "withdrawal" },
      ],
      effects: [{ value: { slot: "withdrawal", from: { const: "asked" } } }],
      sends: [
        {
          tell: {
            to: { slot: "destination", of: "also.proposal" },
            message: "withdraw",
            fields: { operation: { item: "on" } },
            result: { undelivered: [{ value: { slot: "withdrawal", from: null }, if: [{ state: ["intended", "committed", "unknown"] }] }] },
          },
        },
      ],
      attention: [],
    },

    // ---------------------------------------------------------------- section 4.3
    offer: {
      step: "open", on: "commitment", grant: "change.request",
      also: { proposal: { item: "proposal", one: true } },
      fields: {
        offeree: { type: "member", required: false },
        terms: { type: "text", max: 4096, required: true },
      },
      guards: [{ state: ["draft", "open"], of: "also.proposal" }],
      effects: [
        { party: { slot: "requester", from: { signer: true } } },
        { party: { slot: "offeree", from: { field: "offeree" } } },
        { value: { slot: "terms", from: { field: "terms" } } },
        { ref: { slot: "termsAt", from: "self" } },
      ],
      sends: [],
      attention: [{ notify: { slot: "offeree", of: "on", when: "after", reason: "offered" } }],
    },
    accept: {
      step: "transition", on: "commitment", grant: "change.promise",
      also: {},
      fields: { terms: { type: "fact", kind: ["offer"], under: "change", required: true } },
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
    decline: {
      step: "transition", on: "commitment", grant: "change.promise",
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
      step: "transition", on: "commitment", grant: "change.promise",
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
      step: "transition", on: "commitment", grant: "change.request",
      also: {},
      fields: {},
      guards: [
        { state: ["offered", "accepted"] },
        { signer: ["requester"] },
      ],
      effects: [{ state: "cancelled" }],
      sends: [],
      attention: [{ notify: { slot: "performer", of: "on", when: "after", reason: "cancelled" } }],
    },
    "offer-handover": {
      step: "transition", on: "commitment", grant: "change.promise",
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
      step: "transition", on: "commitment", grant: "change.promise",
      also: {},
      fields: { terms: { type: "fact", kind: ["offer"], under: "change", required: true } },
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
      step: "transition", on: "commitment", grant: "change.promise",
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
    "take-hold": {
      step: "open", on: "hold", grant: "change.work",
      also: {
        commitment: { item: "commitment", by: "commitment" },
        proposal: { item: "proposal", one: true },
      },
      fields: {
        commitment: { type: "item", of: "commitment", required: true },
        extent: { type: "text", max: 1024, required: false },
      },
      guards: [
        { state: ["draft", "open"], of: "also.proposal" },
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

    // ---------------------------------------------------------------- shared rows
    ...discussionActs("change"),
    ...holdActs("change"),
  },
  receives: {
    // ---------------------------------------------------------------- section 4.2: Links and merge, 6 act kinds
    rules: {
      message: "rules", class: "relate", from: { kind: "rules", under: "platform:rules" }, opens: "rules", copies: 1,
      also: { proposal: { item: "proposal", one: true } },
      fields: {
        approvals: { type: "int", min: 0, max: 64, required: true },
        checks: {
          type: "list",
          of: {
            type: "record",
            of: {
              name: { type: "text", max: 128, required: true },
              configuration: { type: "digest", required: true },
              required: { type: "bool", required: true },
              checker: { type: "member", required: true },
            },
          },
          max: 32,
          // i5 wiring: optional, for the rules scope leaves it out before its first `publish`.
          required: false,
        },
        ownerMayReview: { type: "bool", required: true },
        // i5 wiring: the other members of the rules scope's `rules` update (its rule `rules-update`). Before the first `publish` it
        // leaves out `checks` and `labels`. A lane that declared none of these refused the real update, `bad-field`.
        labels: { type: "list", of: { type: "text", max: 64 }, max: 32, required: false },
        singleControllerException: { type: "bool", required: false },
        extents: {
          type: "list",
          of: {
            type: "record",
            of: {
              name: { type: "text", max: 64, required: true },
              approvals: { type: "int", min: 0, max: 64, required: true },
              approver: { type: "text", max: 64, required: true },
              checks: { type: "list", of: { type: "text", max: 128 }, max: 32, required: true },
              class: { type: "enum", of: ["content", "deployment", "authority"], required: true },
            },
          },
          max: 8,
          required: false,
        },
      },
      guards: [{ equals: { a: { sender: true }, b: { slot: "rulesScope", of: "also.proposal" } }, reason: "not-the-rules-scope" }],
      effects: [
        { value: { slot: "approvals", from: { field: "approvals" } } },
        { value: { slot: "checks", from: { field: "checks" } } },
        { value: { slot: "ownerMayReview", from: { field: "ownerMayReview" } } },
        { value: { slot: "extents", from: { field: "extents" } } },
        { value: { slot: "revision", from: { update: "revision" } } },
        { ref: { slot: "source", from: { source: "ref" } } },
      ],
      sends: [],
      attention: [],
    },
    publication: {
      message: "publication", class: "relate", from: { kind: "destination", under: "platform:destination" }, opens: null, copies: 16, settles: { of: "also.merge", in: ["intended", "committed", "unknown"] },
      also: {
        merge: { item: "merge", by: "operation" },
        proposal: { item: "proposal", one: true },
        manifest: { item: "manifest", via: { slot: "manifest", of: "also.merge" } },
      },
      fields: {
        operation: { type: "fact", kind: ["merge"], under: "change", required: true },
        outcome: { type: "enum", of: ["committed", "unknown", "published", "refused", "aborted"], required: true },
        commit: { type: "commit", required: false },
        reason: { type: "text", max: 1024, required: false },
        // i5 wiring: the revision of the rules that the destination judged the reservation under, which its update states. A lane
        // that declared no such field refused the real update, `bad-field`.
        rules: { type: "int", min: 0, max: 1000000000, required: false },
      },
      guards: [
        { equals: { a: { sender: true }, b: { slot: "destination", of: "also.proposal" } }, reason: "not-the-destination" },
        { state: ["intended", "committed", "unknown"], of: "also.merge" },
      ],
      effects: [
        { state: "committed", of: "also.merge", if: [{ equals: { a: { field: "outcome" }, b: { const: "committed" } } }] },
        { state: "unknown", of: "also.merge", if: [{ equals: { a: { field: "outcome" }, b: { const: "unknown" } } }] },
        { state: "published", of: "also.merge", if: [{ equals: { a: { field: "outcome" }, b: { const: "published" } } }] },
        { state: "refused", of: "also.merge", if: [{ equals: { a: { field: "outcome" }, b: { const: "refused" } } }] },
        { state: "aborted", of: "also.merge", if: [{ equals: { a: { field: "outcome" }, b: { const: "aborted" } } }] },
        { value: { slot: "commit", from: { field: "commit" } }, of: "also.merge" },
        { value: { slot: "reason", from: { field: "reason" } }, of: "also.merge" },
        {
          state: "merged",
          of: "also.proposal",
          if: [{ equals: { a: { field: "outcome" }, b: { const: "published" } } }, { state: ["draft", "open", "closed"], of: "also.proposal" }],
        },
        {
          capability: { name: "hold", do: "pin-release", with: { commit: { slot: "integration", of: "also.manifest" } } },
          if: [{ equals: { a: { field: "outcome" }, b: { const: "published" } } }, { unset: "staging", of: "also.manifest" }],
        },
      ],
      sends: [
        {
          relate: {
            each: { type: "link", states: ["set"] },
            to: { slot: "issue", of: "each" },
            name: "closes",
            item: { item: "each" },
            state: "merged",
            if: [{ equals: { a: { field: "outcome" }, b: { const: "published" } } }],
            detail: { commit: { field: "commit" }, plan: { slot: "plan", of: "also.manifest" } },
            result: {},
          },
        },
        {
          tell: {
            to: { slot: "staging", of: "also.manifest" },
            message: "unpin",
            if: [{ equals: { a: { field: "outcome" }, b: { const: "published" } } }, { set: "staging", of: "also.manifest" }],
            fields: { manifest: { item: "also.manifest" }, commit: { slot: "integration", of: "also.manifest" }, because: { const: "published" }, merge: { item: "also.merge" } },
            result: {},
          },
        },
        { index: { fields: { merge: { field: "outcome" } } } },
      ],
      attention: [],
    },

    // ---------------------------------------------------------------- shared rows
    ...exportHandlers("change"),
  },
  timed: {
    // ---------------------------------------------------------------- section 4.2: Checks, 3 act kinds, and one timed rule
    "job-deadline": {
      on: "job", states: ["requested"], deadline: "deadline",
      effects: [
        { state: "timed-out" },
        { ref: { slot: "decidedBy", from: "self" } },
      ],
      attention: [{ notify: { slot: "informed", of: "on", when: "after", reason: "check-timed-out" } }],
    },

    // ---------------------------------------------------------------- shared rows
    ...holdTimed,
  },
  rules: {},
} as const satisfies LaneDefinition;
