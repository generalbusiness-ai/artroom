/**
 * The one source of act kinds (src/vocabulary.ts; docs/protocol.md R-DECL-1).
 * A `v1` document means the legacy vocabulary, read from `ARTROOM_LEGACY_V1`;
 * a `v2` document means its own declarations, with the platform kinds beside
 * them. The room's schema, roster and authority ask these functions which
 * kinds exist, what steps a kind runs on a target, who may sign it and what
 * a grant may name.
 */

import { describe, expect, test } from "vitest";
import type { ActDeclaration, PolicyDocumentV2 } from "@generalbusiness/artroom-contract";
import { CODE_REVIEW_ACTS } from "../src/codereview.ts";
import { defaultPolicy } from "../src/helpers.ts";
import { validatePolicy } from "../src/validate.ts";
import { codeReviewPolicy, declarationOf, delegableBy, isDeclared, kindsOf, roleMaySign, shapeOf, stepsOf } from "../src/vocabulary.ts";

const legacy = defaultPolicy();
const declared = (change: (acts: Record<string, ActDeclaration>) => void = () => {}): PolicyDocumentV2 => {
  const acts = structuredClone(CODE_REVIEW_ACTS) as Record<string, ActDeclaration>;
  change(acts);
  return { ...codeReviewPolicy(legacy), acts };
};
const ASK: ActDeclaration = { label: "Ask", targets: { entry: ["comment"] }, who: { roles: ["member"] } };
const withAsk = declared((a) => void (a["ask"] = ASK));

const lane = "act_1_00000000";
const line = { lane, generation: 1, head: "h", path: "p", line: 1 };
/** Names every object inherits. None is a kind unless a document declares it as its own. */
const INHERITED = ["toString", "constructor", "__proto__", "hasOwnProperty", "valueOf"];

describe("which kinds a document means (R-DECL-1, R-DECL-21)", () => {
  test("a v1 document means the legacy kinds and declares none; a v2 document means its own declarations and the platform kinds, never the legacy list", () => {
    expect(isDeclared(legacy)).toBe(false);
    expect(kindsOf(legacy)).toEqual(["claim", "propose", "note", "review", "check", "land", "release", "renew", "roster"]);
    for (const kind of ["claim", "renew", "merge"]) expect(declarationOf(legacy, kind), kind).toBeNull();
    expect(isDeclared(declared())).toBe(true);
    const only: PolicyDocumentV2 = { ...codeReviewPolicy(legacy), acts: { ask: ASK } };
    expect(kindsOf(only)).toEqual(["ask", "renew", "roster", "recover"]);
    expect(declarationOf(declared(), "claim")).toEqual(CODE_REVIEW_ACTS["claim"]);
    expect(declarationOf(declared(), "renew")).toBeNull();
  });

  test("a kind named like an inherited property is not declared; the same name declared as the document's own is", () => {
    for (const kind of INHERITED) expect(declarationOf(declared(), kind), kind).toBeNull();
    const own = declared((a) => void (a["constructor"] = ASK));
    expect(declarationOf(own, "constructor")).toEqual(ASK);
  });

  test("a v1 rule's on names only legacy kinds", () => {
    const doc = (on: string[]) => ({ ...legacy, rules: [{ id: "x", kind: "refuse", on, refuse: "true", reason: "No.", fix: "None." }] });
    expect(validatePolicy(doc(["claim", "roster"])).ok).toBe(true);
    expect(validatePolicy(doc(["recover"])).ok).toBe(false);
    expect(validatePolicy(doc(["merge"])).ok).toBe(false);
  });

  test("codeReviewPolicy keeps the base document's fields and adds the steps version and CODE_REVIEW_ACTS", () => {
    expect(codeReviewPolicy(legacy)).toEqual({ ...legacy, format: "artroom-policy-v2", steps: "artroom-steps-v1", acts: CODE_REVIEW_ACTS });
  });
});

describe("the shape of a target (R-DECL-4)", () => {
  test("null is none; act is an entry; path, line or head a line; generation a version; lane alone a thread; anything else has no shape", () => {
    expect(shapeOf(null)).toBe("none");
    expect(shapeOf({ act: lane })).toBe("entry");
    expect(shapeOf({ act: lane, lane, generation: 1 })).toBe("entry");
    expect(shapeOf(line)).toBe("line");
    for (const name of ["path", "line", "head"]) {
      expect(shapeOf({ lane, generation: 1, [name]: 1 }), name).toBe("line");
      expect(shapeOf({ [name]: 1 }), name).toBe("line");
    }
    expect(shapeOf({ lane, generation: 1 })).toBe("version");
    expect(shapeOf({ generation: 1 })).toBe("version");
    expect(shapeOf({ lane })).toBe("thread");
    for (const target of [{}, { other: 1 }, "lane", 7, true, undefined, [{ lane }], Object.assign([] as unknown[], { lane })]) expect(shapeOf(target), JSON.stringify(target)).toBeNull();
  });
});

describe("the steps of a kind on a target (R-DECL-1, R-DECL-4)", () => {
  test("the legacy dispatch: claim opens on null and takes on a lane; every other act has one step; platform and unknown kinds have none", () => {
    expect(stepsOf(legacy, "claim", null)).toEqual(["open"]);
    expect(stepsOf(legacy, "claim", { lane })).toEqual(["take"]);
    expect(stepsOf(legacy, "propose", { lane })).toEqual(["version"]);
    expect(stepsOf(legacy, "note", { act: lane })).toEqual(["comment"]);
    expect(stepsOf(legacy, "note", line)).toEqual(["comment"]);
    expect(stepsOf(legacy, "review", { lane, generation: 1 })).toEqual(["review"]);
    expect(stepsOf(legacy, "check", { lane, generation: 1 })).toEqual(["check"]);
    expect(stepsOf(legacy, "land", { lane, generation: 1 })).toEqual(["land"]);
    expect(stepsOf(legacy, "release", { lane })).toEqual(["release"]);
    // A kind on a target it does not act on gives null, not an empty list.
    expect(stepsOf(legacy, "propose", null)).toBeNull();
    expect(stepsOf(legacy, "claim", { lane, generation: 1 })).toBeNull();
    expect(stepsOf(legacy, "propose", "lane")).toBeNull();
    for (const kind of ["renew", "roster", "recover", "merge", ...INHERITED])
      for (const target of [null, { lane }, { lane, generation: 1 }, { act: lane }, line]) expect(stepsOf(legacy, kind, target), kind).toBeNull();
  });

  test("a v2 document's steps are its declarations', never the legacy dispatch", () => {
    const doc = declared();
    expect(stepsOf(doc, "claim", null)).toEqual(["open"]);
    expect(stepsOf(doc, "claim", { lane })).toEqual(["take"]);
    expect(stepsOf(doc, "note", line)).toEqual(["comment"]);
    expect(stepsOf(doc, "note", null)).toBeNull();
    expect(stepsOf(doc, "land", { lane })).toBeNull();
    expect(stepsOf(doc, "merge", null)).toBeNull();
    // A kind the legacy vocabulary lacks has its declared steps, and a legacy name only what the document gives it.
    expect(stepsOf(withAsk, "ask", { act: lane })).toEqual(["comment"]);
    const opensOnly = declared((a) => void (a["claim"] = { ...a["claim"]!, targets: { none: ["open"] } }));
    expect(stepsOf(opensOnly, "claim", null)).toEqual(["open"]);
    expect(stepsOf(opensOnly, "claim", { lane })).toBeNull();
  });
});

describe("who may sign (R-GEN-5 as amended, R-DECL-11)", () => {
  test("under a v1 document the legacy table decides", () => {
    expect(roleMaySign(legacy, "checker", "check")).toBe(true);
    expect(roleMaySign(legacy, "checker", "claim")).toBe(false);
    expect(roleMaySign(legacy, "member", "claim")).toBe(true);
    expect(roleMaySign(legacy, "member", "check")).toBe(false);
    expect(roleMaySign(legacy, "agent", "renew")).toBe(true);
  });

  test("under a v2 document who.roles decides, with admin implicit; renew and roster keep the legacy table; an undeclared kind is not signable, by an admin either", () => {
    expect(roleMaySign(withAsk, "member", "ask")).toBe(true);
    expect(roleMaySign(withAsk, "admin", "ask")).toBe(true);
    for (const role of ["maintainer", "agent", "checker"] as const) expect(roleMaySign(withAsk, role, "ask"), role).toBe(false);
    // The legacy table is not asked: a checker may not sign check when the declaration omits the role.
    const noChecker = declared((a) => void (a["check"] = { ...a["check"]!, who: { roles: ["member"] } }));
    expect(roleMaySign(noChecker, "checker", "check")).toBe(false);
    expect(roleMaySign(noChecker, "member", "check")).toBe(true);
    for (const role of ["admin", "maintainer", "member", "agent"] as const) expect(roleMaySign(declared(), role, "renew"), role).toBe(true);
    expect(roleMaySign(declared(), "checker", "renew")).toBe(false);
    expect(roleMaySign(declared(), "checker", "roster")).toBe(true);
    for (const role of ["admin", "member"] as const) {
      expect(roleMaySign(withAsk, role, "merge"), role).toBe(false);
      expect(roleMaySign(withAsk, role, "recover"), role).toBe(false);
    }
  });
});

describe("what a grant may name (R-ADM-5 as amended, R-DECL-17)", () => {
  test("under a v1 document: the legacy delegable kinds the grantor's role may sign, never roster, and no declared kind", () => {
    expect(delegableBy(legacy, "checker")).toEqual({ platform: ["note", "check"], declared: [] });
    expect(delegableBy(legacy, "agent")).toEqual({ platform: ["claim", "propose", "note", "review", "land", "release", "renew"], declared: [] });
    expect(delegableBy(legacy, "admin")).toEqual({ platform: ["claim", "propose", "note", "review", "check", "land", "release", "renew"], declared: [] });
  });

  test("under a v2 document: renew if the role may sign it, and the declared kinds the role may sign whose who.delegable is not false", () => {
    const doc = declared((a) => {
      a["ask"] = ASK;
      a["land"] = { ...a["land"]!, who: { ...a["land"]!.who, delegable: false } };
    });
    expect(delegableBy(doc, "member")).toEqual({ platform: ["renew"], declared: ["claim", "propose", "note", "review", "release", "ask"] });
    expect(delegableBy(doc, "agent").declared).toEqual(["claim", "propose", "note", "review", "release"]);
    expect(delegableBy(doc, "checker")).toEqual({ platform: [], declared: ["note", "check"] });
    expect(delegableBy(doc, "admin").declared).toEqual(["claim", "propose", "note", "review", "check", "release", "ask"]);
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
