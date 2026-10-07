/**
 * The pinned demo profile: two smaller definitions, each the full definition
 * with a subset of its acts and handlers (plan 024, gate 2; plan 019's
 * story). Every item type and timed rule is the full definition's, and each
 * act and handler that is kept is the full definition's row, the same
 * object. No row is new and none is changed. The two export handlers are
 * left out with `authorize-export`, which their rows name.
 *
 * Each keeps its definition's name, `issue` or `change`. A name is what
 * another scope checks: the destination takes a `reserve` only from a lane
 * under `change`, an issue takes `closes` only from one, and a manifest
 * names reports of a lane under `issue`. So a lane under the profile works
 * with the platform and with a lane under either full definition. The
 * digests differ, and a rules scope activates each by its own.
 *
 * What the profile leaves out is not refused by any rule: a room that wants
 * more acts activates the full definition, and its directory creates lanes
 * under that digest. `notes/2026-10-07-i5-lane-wiring-delivery.md`, section
 * 3, maps each act of the full definitions to "in profile" or "rules can add".
 */

import { change } from "./change.ts";
import { issue } from "./issue.ts";
import type { LaneDefinition } from "./shared.ts";

const ia = issue.acts;
const ca = change.acts;
/** Every handler but the two export handlers, which name `authorize-export`. */
const { "export-license": _il, "export-settled": _is, ...issueReceives } = issue.receives;
const { "export-license": _cl, "export-settled": _cs, ...changeReceives } = change.receives;

/** `issue`, with 12 of its 50 acts: file, edit, assign, close and reopen, comment, and the commitment, hold and report acts that a manifest selects. */
export const issueDemo = {
  ...issue,
  receives: issueReceives,
  acts: {
    file: ia.file,
    "edit-own": ia["edit-own"],
    assign: ia.assign,
    "close-own": ia["close-own"],
    "close-any": ia["close-any"],
    "reopen-own": ia["reopen-own"],
    comment: ia.comment,
    offer: ia.offer,
    accept: ia.accept,
    "take-hold": ia["take-hold"],
    report: ia.report,
    "accept-report": ia["accept-report"],
  },
} as const satisfies LaneDefinition;

/** `change`, with 18 of its 53 acts: open, edit, ready and close, ask the rules, propose a version, request and give a review, request and answer a check, comment, link to close, merge and cancel it, and the commitment and hold acts that a version needs. */
export const changeDemo = {
  ...change,
  receives: changeReceives,
  acts: {
    open: ca.open,
    "edit-own": ca["edit-own"],
    "ready-own": ca["ready-own"],
    "close-own": ca["close-own"],
    "ask-rules": ca["ask-rules"],
    "propose-manifest": ca["propose-manifest"],
    "request-review-own": ca["request-review-own"],
    "review-verdict": ca["review-verdict"],
    "request-check": ca["request-check"],
    check: ca.check,
    comment: ca.comment,
    "link-own": ca["link-own"],
    merge: ca.merge,
    "cancel-merge": ca["cancel-merge"],
    offer: ca.offer,
    accept: ca.accept,
    "take-hold": ca["take-hold"],
    "release-hold": ca["release-hold"],
  },
} as const satisfies LaneDefinition;
