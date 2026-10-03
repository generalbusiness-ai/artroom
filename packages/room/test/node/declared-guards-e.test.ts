/**
 * Declared acts stage 2 (request fd6f00b6): the room's role question
 * (src/roster.ts `roleMaySign`) with a `v2` document. The room passes the
 * document only for a declared kind (src/authority.ts), so its two guards on
 * the document are reached here by direct calls of the exported function.
 */

import { describe, expect, it } from "vitest";
import type { ActDeclaration, PolicyDocumentV2, Role } from "@generalbusiness/artroom-contract";
import { CODE_REVIEW_ACTS, codeReviewPolicy, defaultPolicy } from "@generalbusiness/artroom-policy";
import { roleMaySign } from "../../src/roster.ts";

const ASK: ActDeclaration = { label: "Ask", targets: { entry: ["comment"] }, who: { roles: ["member"] } };
const declared: PolicyDocumentV2 = { ...codeReviewPolicy(defaultPolicy()), acts: { ...CODE_REVIEW_ACTS, ask: ASK, check: { ...CODE_REVIEW_ACTS["check"]!, who: { roles: ["member"] } } } };
const OTHERS: Role[] = ["maintainer", "member", "agent", "checker"];

describe("the room's role question with a v2 document (R-GEN-4, R-GEN-5 as amended, R-DECL-11)", () => {
  it("a roster act keeps the roster op table, document or none: an admin signs the seven admin ops, every other role only delegate and undelegate, and no role join or rotate-recovery", () => {
    for (const doc of [declared, undefined]) {
      for (const op of ["invite", "set-role", "remove", "revoke-key", "team", "delegate", "undelegate"] as const) {
        expect(roleMaySign("admin", "roster", op, doc), op).toBe(true);
        for (const role of OTHERS) expect(roleMaySign(role, "roster", op, doc), `${role} ${op}`).toBe(op === "delegate" || op === "undelegate");
      }
      for (const op of ["join", "rotate-recovery"] as const) for (const role of ["admin", ...OTHERS] as Role[]) expect(roleMaySign(role, "roster", op, doc), `${role} ${op}`).toBe(false);
    }
  });

  it("a declared kind is decided by the document's who.roles, with admin implicit, not by the legacy table: a kind the legacy vocabulary lacks, and check when the declaration names member and not checker", () => {
    expect(roleMaySign("member", "ask", undefined, declared)).toBe(true);
    expect(roleMaySign("admin", "ask", undefined, declared)).toBe(true);
    expect(roleMaySign("agent", "ask", undefined, declared)).toBe(false);
    expect(roleMaySign("member", "check", undefined, declared)).toBe(true);
    expect(roleMaySign("checker", "check", undefined, declared)).toBe(false);
  });

  it("with no document the legacy table decides: a checker may sign check and a member may not; no role may sign a kind the legacy vocabulary lacks", () => {
    expect(roleMaySign("checker", "check")).toBe(true);
    expect(roleMaySign("member", "check")).toBe(false);
    for (const role of ["admin", ...OTHERS] as Role[]) expect(roleMaySign(role, "ask"), role).toBe(false);
  });
});
