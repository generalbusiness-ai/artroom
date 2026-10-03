/**
 * Declared acts stage 2 (request fd6f00b6): the one source of act kinds
 * (src/vocabulary.ts). A `v1` document means the legacy vocabulary, read
 * from `ARTROOM_LEGACY_V1`; a `v2` document means its declarations. The
 * code-review declarations are checked here against the note's section 6
 * tables, written out independently, so a change to any field is red.
 */

import { describe, expect, test } from "vitest";
import { ARTROOM_LEGACY_V1, type ActDeclaration, type PolicyDocumentV2 } from "@generalbusiness/artroom-contract";
import { CODE_REVIEW_ACTS } from "../src/codereview.ts";
import { defaultPolicy } from "../src/helpers.ts";
import { validatePolicy } from "../src/validate.ts";
import {
  LEGACY_DELEGABLE,
  LEGACY_KINDS,
  LEGACY_ROLE_KINDS,
  ROSTER_OPS,
  codeReviewPolicy,
  declarationOf,
  delegableBy,
  isDeclared,
  kindsOf,
  roleMaySign,
  shapeOf,
  stepsOf,
} from "../src/vocabulary.ts";

const legacy = defaultPolicy();
const declared = (change: (acts: Record<string, ActDeclaration>) => void = () => {}): PolicyDocumentV2 => {
  const acts = structuredClone(CODE_REVIEW_ACTS) as Record<string, ActDeclaration>;
  change(acts);
  return { ...codeReviewPolicy(legacy), acts };
};

describe("the legacy vocabulary, read from its frozen description (R-DECL-1)", () => {
  test("its kinds, role table, delegable kinds and roster ops are ARTROOM_LEGACY_V1's, not copies", () => {
    expect(LEGACY_KINDS).toBe(ARTROOM_LEGACY_V1.envelope.kinds);
    expect(LEGACY_ROLE_KINDS).toBe(ARTROOM_LEGACY_V1.roles);
    expect(LEGACY_DELEGABLE).toBe(ARTROOM_LEGACY_V1.delegation.kinds);
    expect(ROSTER_OPS.admin).toBe(ARTROOM_LEGACY_V1.rosterOps.admin);
    expect(ROSTER_OPS.others).toBe(ARTROOM_LEGACY_V1.rosterOps.others);
    expect(LEGACY_KINDS).toEqual(["claim", "propose", "note", "review", "check", "land", "release", "renew", "roster"]);
  });

  test("a v1 rule's on names only legacy kinds", () => {
    const doc = (on: string[]) => ({ ...legacy, rules: [{ id: "x", kind: "refuse", on, refuse: "true", reason: "No.", fix: "None." }] });
    expect(validatePolicy(doc(["claim", "roster"])).ok).toBe(true);
    expect(validatePolicy(doc(["recover"])).ok).toBe(false);
    expect(validatePolicy(doc(["merge"])).ok).toBe(false);
  });

  test("the legacy dispatch: claim opens on null and takes on a lane; every other act has one step; renew and roster have none", () => {
    expect(stepsOf(legacy, "claim", null)).toEqual(["open"]);
    expect(stepsOf(legacy, "claim", { lane: "act_1_00000000" })).toEqual(["take"]);
    expect(stepsOf(legacy, "propose", { lane: "act_1_00000000" })).toEqual(["version"]);
    expect(stepsOf(legacy, "note", { act: "act_1_00000000" })).toEqual(["comment"]);
    expect(stepsOf(legacy, "note", { lane: "l", generation: 1, head: "h", path: "p", line: 1 })).toEqual(["comment"]);
    expect(stepsOf(legacy, "review", { lane: "l", generation: 1 })).toEqual(["review"]);
    expect(stepsOf(legacy, "check", { lane: "l", generation: 1 })).toEqual(["check"]);
    expect(stepsOf(legacy, "land", { lane: "l", generation: 1 })).toEqual(["land"]);
    expect(stepsOf(legacy, "release", { lane: "l" })).toEqual(["release"]);
    expect(stepsOf(legacy, "renew", { lane: "l" })).toBeNull();
    expect(stepsOf(legacy, "claim", { lane: "l", generation: 1 })).toBeNull();
    expect(stepsOf(legacy, "toString", null)).toBeNull();
  });

  test("roles and grants are the legacy table's", () => {
    expect(roleMaySign(legacy, "checker", "check")).toBe(true);
    expect(roleMaySign(legacy, "checker", "claim")).toBe(false);
    expect(roleMaySign(legacy, "member", "check")).toBe(false);
    expect(roleMaySign(legacy, "agent", "renew")).toBe(true);
    expect(delegableBy(legacy, "member")).toEqual({ platform: ["claim", "propose", "note", "review", "land", "release", "renew"], declared: [] });
    expect(delegableBy(legacy, "checker")).toEqual({ platform: ["note", "check"], declared: [] });
    expect(kindsOf(legacy)).toBe(LEGACY_KINDS);
    expect(isDeclared(legacy)).toBe(false);
    expect(declarationOf(legacy, "claim")).toBeNull();
  });
});

describe("a v2 document's vocabulary is its declarations (R-DECL-11, R-DECL-17)", () => {
  test("its kinds are the declared ones and the platform kinds", () => {
    expect(kindsOf(declared())).toEqual(["claim", "propose", "note", "review", "check", "land", "release", "renew", "roster", "recover"]);
    expect(declarationOf(declared(), "claim")).toEqual(CODE_REVIEW_ACTS["claim"]);
    expect(declarationOf(declared(), "toString")).toBeNull();
    expect(declarationOf(declared(), "renew")).toBeNull();
  });

  test("who.roles decides, with admin implicit; renew keeps the legacy table; an undeclared kind is not signable here", () => {
    const doc = declared((a) => void (a["ask"] = { label: "Ask", targets: { entry: ["comment"] }, who: { roles: [] } }));
    expect(roleMaySign(doc, "admin", "ask")).toBe(true);
    expect(roleMaySign(doc, "member", "ask")).toBe(false);
    expect(roleMaySign(doc, "checker", "note")).toBe(true);
    expect(roleMaySign(doc, "checker", "claim")).toBe(false);
    expect(roleMaySign(doc, "maintainer", "claim")).toBe(true);
    expect(roleMaySign(doc, "checker", "renew")).toBe(false);
    expect(roleMaySign(doc, "member", "renew")).toBe(true);
    expect(roleMaySign(doc, "admin", "merge")).toBe(false);
  });

  test("a grant names renew if the role may sign it, and the declared kinds the role may sign whose who.delegable is not false", () => {
    const doc = declared((a) => void (a["land"] = { ...a["land"]!, who: { ...a["land"]!.who, delegable: false } }));
    expect(delegableBy(doc, "member")).toEqual({ platform: ["renew"], declared: ["claim", "propose", "note", "review", "release"] });
    expect(delegableBy(doc, "checker")).toEqual({ platform: [], declared: ["note", "check"] });
    expect(delegableBy(doc, "admin").declared).toEqual(["claim", "propose", "note", "review", "check", "release"]);
  });

  test("steps come from the declaration's targets, by the target's shape", () => {
    const doc = declared();
    expect(stepsOf(doc, "claim", null)).toEqual(["open"]);
    expect(stepsOf(doc, "claim", { lane: "l" })).toEqual(["take"]);
    expect(stepsOf(doc, "note", { lane: "l", generation: 1, head: "h", path: "p", line: 1 })).toEqual(["comment"]);
    expect(stepsOf(doc, "note", null)).toBeNull();
    expect(stepsOf(doc, "land", { lane: "l" })).toBeNull();
    expect(stepsOf(doc, "merge", null)).toBeNull();
    expect(shapeOf([1])).toBeNull();
    expect(shapeOf({})).toBeNull();
  });

  test("codeReviewPolicy keeps the base document's fields and adds the steps version and CODE_REVIEW_ACTS", () => {
    const doc = codeReviewPolicy(legacy);
    expect(doc).toEqual({ ...legacy, format: "artroom-policy-v2", steps: "artroom-steps-v1", acts: CODE_REVIEW_ACTS });
    expect(doc.acts).toBe(CODE_REVIEW_ACTS);
  });
});

describe("the code-review declarations are the note's section 6 (docs/protocol.md section 33.7)", () => {
  test("every field of every declaration, written out from the tables", () => {
    const PEOPLE = ["maintainer", "member", "agent"];
    const THREADS = ["claim", "room"];
    expect(JSON.parse(JSON.stringify(CODE_REVIEW_ACTS))).toEqual({
      claim: {
        label: "Claim",
        targets: { none: ["open"], thread: ["take"] },
        threads: THREADS,
        body: { goal: { type: "text", max: 1024, requiredFor: ["none"] }, plan: { type: "text", max: 16384, optional: true } },
        who: { roles: PEOPLE },
        hold: { scope: "body.scope", workspace: true },
      },
      propose: { label: "Propose", targets: { thread: ["version"] }, threads: THREADS, body: { summary: { type: "text", max: 8192 } }, who: { roles: PEOPLE } },
      note: { label: "Note", targets: { entry: ["comment"], line: ["comment"] }, threads: THREADS, body: { text: { type: "text", max: 16384 } }, who: { roles: [...PEOPLE, "checker"] } },
      review: { label: "Review", targets: { version: ["review"] }, threads: THREADS, body: { text: { type: "text", max: 16384 } }, who: { roles: PEOPLE } },
      check: { label: "Check", targets: { version: ["check"] }, threads: THREADS, who: { roles: ["checker"] } },
      land: { label: "Land", targets: { version: ["land"] }, threads: THREADS, who: { roles: PEOPLE } },
      release: { label: "Release", targets: { thread: ["release"] }, threads: THREADS, who: { roles: PEOPLE } },
    });
  });
});
