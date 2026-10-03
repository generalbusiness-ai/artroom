/**
 * Declared acts stage 2 (request fd6f00b6): the guards of the one source of
 * act kinds (src/vocabulary.ts), each held from both sides. The functions
 * are the policy package's own, so they are called directly, as
 * vocabulary.test.ts calls them.
 *
 * A guard whose absence makes a function throw is asserted through
 * `outcome`, so that the failure is the named expectation, not a stray
 * TypeError.
 */

import { describe, expect, test } from "vitest";
import type { ActDeclaration, PolicyDocumentV2 } from "@generalbusiness/artroom-contract";
import { CODE_REVIEW_ACTS } from "../src/codereview.ts";
import { defaultPolicy } from "../src/helpers.ts";
import { LEGACY_DELEGABLE, ROSTER_OPS, codeReviewPolicy, declarationOf, delegableBy, isDeclared, kindsOf, roleMaySign, shapeOf, stepsOf } from "../src/vocabulary.ts";

const legacy = defaultPolicy();
const declared = (change: (acts: Record<string, ActDeclaration>) => void = () => {}): PolicyDocumentV2 => {
  const acts = structuredClone(CODE_REVIEW_ACTS) as Record<string, ActDeclaration>;
  change(acts);
  return { ...codeReviewPolicy(legacy), acts };
};
const ASK: ActDeclaration = { label: "Ask", targets: { entry: ["comment"] }, who: { roles: ["member"] } };
const withAsk = declared((a) => void (a["ask"] = ASK));

/** What a call gives, or the name of what it throws. */
function outcome<T>(fn: () => T): T | string {
  try {
    return fn();
  } catch (e) {
    return `threw ${(e as Error).name}`;
  }
}

const lane = "act_1_00000000";
const INHERITED = ["toString", "constructor", "__proto__", "hasOwnProperty", "valueOf"];

describe("which vocabulary a document means (R-DECL-1)", () => {
  test("a document declares its acts exactly when its format is artroom-policy-v2", () => {
    expect(isDeclared(declared())).toBe(true);
    expect(isDeclared(legacy)).toBe(false);
  });

  test("a v1 document declares no kind: declarationOf gives null for each legacy kind, and reads no acts of it", () => {
    for (const kind of ["claim", "renew", "merge"]) expect(outcome(() => declarationOf(legacy, kind)), kind).toBeNull();
    expect(declarationOf(declared(), "claim")).toEqual(CODE_REVIEW_ACTS["claim"]);
  });

  test("a kind named like an inherited property is not declared; the same name declared as the document's own is", () => {
    for (const kind of INHERITED) expect(declarationOf(declared(), kind), kind).toBeNull();
    const own = declared((a) => void (a["constructor"] = ASK));
    expect(Object.hasOwn(own.acts, "constructor")).toBe(true);
    expect(declarationOf(own, "constructor")).toEqual(ASK);
  });

  test("a v2 document's kinds are its own declarations and the platform kinds, never the legacy list (R-DECL-21)", () => {
    const only: PolicyDocumentV2 = { ...codeReviewPolicy(legacy), acts: { ask: ASK } };
    expect(kindsOf(only)).toEqual(["ask", "renew", "roster", "recover"]);
    expect(kindsOf(legacy)).toEqual(["claim", "propose", "note", "review", "check", "land", "release", "renew", "roster"]);
  });
});

describe("the shape of a target (R-DECL-4)", () => {
  test("null is the shape none, and reading it does not fail", () => {
    expect(outcome(() => shapeOf(null))).toBe("none");
    expect(outcome(() => stepsOf(legacy, "claim", null))).toEqual(["open"]);
  });

  test("a value that is not an object has no shape: a string, a number, a boolean, and undefined", () => {
    for (const target of ["lane", 7, true, undefined]) expect(outcome(() => shapeOf(target)), String(target)).toBeNull();
    expect(outcome(() => stepsOf(legacy, "propose", "lane"))).toBeNull();
  });

  test("an array has no shape, whatever it carries", () => {
    // No JSON document can express an array with a named property, so only a direct call reaches this guard.
    expect(shapeOf(Object.assign([] as unknown[], { lane }))).toBeNull();
    expect(shapeOf(Object.assign([] as unknown[], { act: lane }))).toBeNull();
    expect(shapeOf([{ lane }])).toBeNull();
    // The same properties on an object are a shape.
    expect(shapeOf({ lane })).toBe("thread");
  });

  test("an object with act is an entry, whatever else it carries", () => {
    expect(shapeOf({ act: lane })).toBe("entry");
    expect(shapeOf({ act: lane, lane, generation: 1 })).toBe("entry");
    expect(stepsOf(legacy, "note", { act: lane })).toEqual(["comment"]);
  });

  for (const name of ["path", "line", "head"] as const)
    test(`a target that carries ${name} is a line target, also when it carries no other name of a line`, () => {
      expect(shapeOf({ lane, generation: 1, [name]: 1 })).toBe("line");
      expect(shapeOf({ [name]: 1 })).toBe("line");
      // Without it, the same target is a version.
      expect(shapeOf({ lane, generation: 1 })).toBe("version");
    });

  test("a whole line target is a line, and the legacy note acts on it", () => {
    const line = { lane, generation: 1, head: "h", path: "p", line: 1 };
    expect(shapeOf(line)).toBe("line");
    expect(stepsOf(legacy, "note", line)).toEqual(["comment"]);
  });

  test("an object with generation is a version; with lane alone, a thread; with neither, nothing", () => {
    expect(shapeOf({ lane, generation: 1 })).toBe("version");
    expect(shapeOf({ generation: 1 })).toBe("version");
    expect(shapeOf({ lane })).toBe("thread");
    expect(shapeOf({})).toBeNull();
    expect(shapeOf({ other: 1 })).toBeNull();
  });
});

describe("the steps of a kind on a target (R-DECL-1)", () => {
  test("a legacy kind with no step on any target gives null, and never fails: renew, roster, and a kind the vocabulary does not have", () => {
    for (const kind of ["renew", "roster", "recover", "merge"])
      for (const target of [null, { lane }, { lane, generation: 1 }, { act: lane }]) expect(outcome(() => stepsOf(legacy, kind, target)), kind).toBeNull();
  });

  test("a legacy kind on a target it does not act on gives null, not a list with nothing in it", () => {
    expect(stepsOf(legacy, "propose", null)).toBeNull();
    expect(stepsOf(legacy, "claim", { lane, generation: 1 })).toBeNull();
    expect(stepsOf(legacy, "propose", { lane })).toEqual(["version"]);
  });

  test("a kind named like an inherited property has no legacy step on any shape of target", () => {
    for (const kind of INHERITED)
      for (const target of [null, { act: lane }, { lane, generation: 1, head: "h", path: "p", line: 1 }, { lane, generation: 1 }, { lane }]) expect(outcome(() => stepsOf(legacy, kind, target)), kind).toBeNull();
  });

  test("a v2 document's steps are its declarations', never the legacy dispatch: a kind the legacy vocabulary lacks has its declared steps, and a legacy name only what the document gives it", () => {
    expect(stepsOf(withAsk, "ask", { act: lane })).toEqual(["comment"]);
    const opensOnly = declared((a) => void (a["claim"] = { ...a["claim"]!, targets: { none: ["open"] } }));
    expect(stepsOf(opensOnly, "claim", null)).toEqual(["open"]);
    expect(stepsOf(opensOnly, "claim", { lane })).toBeNull();
    expect(stepsOf(legacy, "claim", { lane })).toEqual(["take"]);
  });
});

describe("who may sign (R-GEN-5 as amended, R-DECL-11)", () => {
  test("under a v1 document the legacy table decides: a checker may sign check and not claim, a member claim and not check", () => {
    expect(roleMaySign(legacy, "checker", "check")).toBe(true);
    expect(roleMaySign(legacy, "checker", "claim")).toBe(false);
    expect(roleMaySign(legacy, "member", "claim")).toBe(true);
    expect(roleMaySign(legacy, "member", "check")).toBe(false);
  });

  test("renew keeps the legacy table under a v2 document: every role but checker may sign it, though no document declares it", () => {
    for (const role of ["admin", "maintainer", "member", "agent"] as const) expect(roleMaySign(declared(), role, "renew"), role).toBe(true);
    expect(roleMaySign(declared(), "checker", "renew")).toBe(false);
  });

  test("roster keeps the legacy table under a v2 document: every role may sign it", () => {
    // The room asks its own op table for roster acts (room/src/roster.ts), so only a direct call reaches this guard.
    for (const role of ["admin", "maintainer", "member", "agent", "checker"] as const) expect(roleMaySign(declared(), role, "roster"), role).toBe(true);
    expect(declarationOf(declared(), "roster")).toBeNull();
  });

  test("a kind the v2 document does not declare is not signable here, by an admin either; recover is not decided here", () => {
    for (const role of ["admin", "member"] as const) {
      expect(roleMaySign(withAsk, role, "merge"), role).toBe(false);
      expect(roleMaySign(withAsk, role, "recover"), role).toBe(false);
    }
    expect(roleMaySign(withAsk, "admin", "ask")).toBe(true);
  });

  test("a declared kind's who.roles decide for every role but admin: a role they name may sign, a role they omit may not", () => {
    expect(roleMaySign(withAsk, "member", "ask")).toBe(true);
    for (const role of ["maintainer", "agent", "checker"] as const) expect(roleMaySign(withAsk, role, "ask"), role).toBe(false);
    // The legacy table is not asked: a checker may not sign the legacy check when the declaration omits the role.
    const noChecker = declared((a) => void (a["check"] = { ...a["check"]!, who: { roles: ["member"] } }));
    expect(roleMaySign(noChecker, "checker", "check")).toBe(false);
    expect(roleMaySign(noChecker, "member", "check")).toBe(true);
  });
});

describe("what a grant may name (R-ADM-5 as amended, R-DECL-17)", () => {
  test("under a v1 document a grant names the legacy delegable kinds its grantor's role may sign, and no declared kind", () => {
    expect(outcome(() => delegableBy(legacy, "checker"))).toEqual({ platform: ["note", "check"], declared: [] });
    expect(outcome(() => delegableBy(legacy, "agent"))).toEqual({ platform: ["claim", "propose", "note", "review", "land", "release", "renew"], declared: [] });
    expect(outcome(() => delegableBy(legacy, "admin"))).toEqual({ platform: ["claim", "propose", "note", "review", "check", "land", "release", "renew"], declared: [] });
  });

  test("under a v2 document a grant names renew only from a role that may sign renew", () => {
    expect(delegableBy(declared(), "checker").platform).toEqual([]);
    for (const role of ["admin", "maintainer", "member", "agent"] as const) expect(delegableBy(declared(), role).platform, role).toEqual(["renew"]);
  });

  test("under a v2 document a grant names only declared kinds its grantor's role may sign", () => {
    expect(delegableBy(withAsk, "checker").declared).toEqual(["note", "check"]);
    expect(delegableBy(withAsk, "agent").declared).toEqual(["claim", "propose", "note", "review", "land", "release"]);
    expect(delegableBy(withAsk, "member").declared).toEqual(["claim", "propose", "note", "review", "land", "release", "ask"]);
  });
});

describe("the legacy lists, by value (R-ADM-5, R-GEN-3, R-GEN-4)", () => {
  test("a legacy delegation may name each legacy kind but roster", () => {
    expect(LEGACY_DELEGABLE).toEqual(["claim", "propose", "note", "review", "check", "land", "release", "renew"]);
  });

  test("the roster ops an admin may sign, the two every other role may sign, and those of the recovery key", () => {
    expect(ROSTER_OPS.admin).toEqual(["invite", "set-role", "remove", "revoke-key", "team", "delegate", "undelegate"]);
    expect(ROSTER_OPS.others).toEqual(["delegate", "undelegate"]);
    expect(ROSTER_OPS.recovery).toEqual(["invite", "set-role", "remove", "revoke-key", "team", "rotate-recovery"]);
  });
});
