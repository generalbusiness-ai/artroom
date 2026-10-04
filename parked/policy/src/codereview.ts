/**
 * The code-review application's declarations (docs/protocol.md section
 * 33.7; notes/2026-10-02-declared-acts.md section 6): the seven acts as
 * `v2` data over the platform steps. They are not the legacy vocabulary,
 * which a `v1` document means; a room adopts these only by activating a `v2`
 * document that contains them. Stage 1: nothing at runtime reads them.
 */

import type { ActDeclaration, KindName } from "@generalbusiness/artroom-contract";

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

const PEOPLE = ["maintainer", "member", "agent"] as const;
/** Every thread in a code-review room is opened by `claim`, or by the room as a revert lane (R-REV-6). */
const THREADS = ["claim", "room"] as const;

export const CODE_REVIEW_ACTS: Readonly<Record<KindName, ActDeclaration>> = deepFreeze({
  claim: {
    label: "Claim",
    targets: { none: ["open"], thread: ["take"] },
    threads: [...THREADS],
    body: {
      goal: { type: "text", max: 1024, requiredFor: ["none"] },
      plan: { type: "text", max: 16384, optional: true },
    },
    who: { roles: [...PEOPLE] },
    hold: { scope: "body.scope", workspace: true },
  },
  propose: {
    label: "Propose",
    targets: { thread: ["version"] },
    threads: [...THREADS],
    body: { summary: { type: "text", max: 8192 } },
    who: { roles: [...PEOPLE] },
  },
  note: {
    label: "Note",
    targets: { entry: ["comment"], line: ["comment"] },
    threads: [...THREADS],
    body: { text: { type: "text", max: 16384 } },
    who: { roles: [...PEOPLE, "checker"] },
  },
  review: {
    label: "Review",
    targets: { version: ["review"] },
    threads: [...THREADS],
    body: { text: { type: "text", max: 16384 } },
    who: { roles: [...PEOPLE] },
  },
  check: {
    label: "Check",
    targets: { version: ["check"] },
    threads: [...THREADS],
    who: { roles: ["checker"] },
  },
  land: {
    label: "Land",
    targets: { version: ["land"] },
    threads: [...THREADS],
    who: { roles: [...PEOPLE] },
  },
  release: {
    label: "Release",
    targets: { thread: ["release"] },
    threads: [...THREADS],
    who: { roles: [...PEOPLE] },
  },
} satisfies Record<KindName, ActDeclaration>);
