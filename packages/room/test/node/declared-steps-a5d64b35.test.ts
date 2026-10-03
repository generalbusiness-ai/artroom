/**
 * Declared acts stage 5 (request a5d64b35): the steps' field table that
 * clients use to prepare a generic act (policy `STEP_FIELD_SPECS`) agrees
 * with what this Room's admission checks at step 5 (`checkBody`). For each
 * step: a body built from the table is accepted; each field the table calls
 * required is required by the Room; each it calls optional may be left out;
 * and a value of the wrong type is refused. If the two drift, a form would
 * offer a field the Room refuses, or leave out one it needs.
 */

import { describe, expect, it } from "vitest";
import type { ActDeclaration, PolicyDocumentV2, Step, TargetShape } from "@generalbusiness/artroom-contract";
import { STEP_FIELDS, STEP_FIELD_SPECS, codeReviewPolicy, defaultPolicy, fieldsOf, type StepFieldSpec } from "@generalbusiness/artroom-policy";
import { checkBody, ShapeError } from "../../src/schema.ts";

const sha = "a".repeat(40);
const digest = `sha256:${"0".repeat(64)}`;
const lane = "act_1_00000000";

/** The target each step runs on, and a target value of that shape. */
const ON: Readonly<Record<Step, readonly [TargetShape, unknown]>> = {
  open: ["none", null],
  take: ["thread", { lane }],
  version: ["thread", { lane }],
  release: ["thread", { lane }],
  "hand-over": ["thread", { lane }],
  review: ["version", { lane, generation: 1 }],
  check: ["version", { lane, generation: 1 }],
  land: ["version", { lane, generation: 1 }],
  comment: ["entry", { act: lane }],
};

/** A value that fits a field, and one that cannot. */
function sample(f: StepFieldSpec): unknown {
  switch (f.type) {
    case "int":
      return f.min;
    case "sha":
      return sha;
    case "globs":
      return ["src/**"];
    case "text":
      return "t";
    case "enum":
      return f.values[0];
    case "bool":
      return true;
    case "member":
      return "@bob";
    case "act":
      return lane;
    case "digest":
      return digest;
    case "obligation":
      return "obl_unit";
    case "checker":
      return "unit";
    case "op":
      return "op_land_1";
    case "check-input":
      return { kind: "tree", tree: sha };
  }
}
const wrong = (f: StepFieldSpec): unknown => (f.type === "int" || f.type === "bool" ? "x" : 7);

function docFor(step: Step): PolicyDocumentV2 {
  const [shape] = ON[step];
  const decl: ActDeclaration = {
    label: "X",
    targets: { [shape]: [step] },
    ...(shape === "thread" || shape === "version" ? { threads: ["x"] } : {}),
    who: { roles: ["member"] },
    ...(step === "open" ? { hold: { scope: "body.scope", workspace: true } } : {}),
  };
  return { ...codeReviewPolicy(defaultPolicy()), acts: { x: decl } };
}

const accepted = (step: Step, body: Record<string, unknown>): true | string => {
  try {
    checkBody("x", ON[step][1], body, docFor(step));
    return true;
  } catch (e) {
    if (e instanceof ShapeError) return e.message;
    throw e;
  }
};

describe("STEP_FIELD_SPECS agrees with admission's step fields (R-DECL-5)", () => {
  const steps = Object.keys(STEP_FIELD_SPECS) as Step[];

  it("names exactly the fields of STEP_FIELDS, step by step, in the same order", () => {
    expect(steps.sort()).toEqual(Object.keys(STEP_FIELDS).sort());
    for (const step of steps) expect(Object.keys(STEP_FIELD_SPECS[step]), step).toEqual([...STEP_FIELDS[step]]);
  });

  for (const step of steps)
    it(`${step}: the table's body is admitted; required fields are required; optional ones may be left out; a wrong type is refused`, () => {
      const spec = STEP_FIELD_SPECS[step];
      const full = Object.fromEntries(Object.entries(spec).map(([name, f]) => [name, sample(f)]));
      expect(accepted(step, full), "the full body").toBe(true);
      for (const [name, f] of Object.entries(spec)) {
        const { [name]: _gone, ...rest } = full;
        void _gone;
        const without = accepted(step, rest);
        if (f.optional) expect(without, `${name} left out`).toBe(true);
        else expect(without, `${name} left out`).not.toBe(true);
        expect(accepted(step, { ...full, [name]: wrong(f) }), `${name} of the wrong type`).not.toBe(true);
      }
      // A field the table does not name is not the step's.
      expect(accepted(step, { ...full, stranger: 1 })).not.toBe(true);
      // The form's fields for this declaration are the table's, with the same required marks.
      const fields = fieldsOf(docFor(step).acts["x"]!, ON[step][0])!;
      expect(fields.map((f) => [f.name, f.required])).toEqual(Object.entries(spec).map(([name, f]) => [name, f.optional !== true]));
    });

  it("limits in the table are the Room's: a text one byte over, an int below its minimum, too many globs", () => {
    const release = { lease: 1, note: "n".repeat(8192) };
    expect(accepted("release", release)).toBe(true);
    expect(accepted("release", { ...release, note: "n".repeat(8193) })).not.toBe(true);
    expect(accepted("release", { lease: 0 })).not.toBe(true);
    expect(accepted("version", { lease: 1, expectedGeneration: -1, head: sha })).not.toBe(true);
    const globs = (n: number) => Array.from({ length: n }, (_, i) => `src/${i}/**`);
    expect(accepted("open", { scope: globs(64) })).toBe(true);
    expect(accepted("open", { scope: globs(65) })).not.toBe(true);
    expect(accepted("open", { scope: [] })).not.toBe(true);
    expect(accepted("review", { head: sha, verdict: "maybe", scope: ["src/**"] })).not.toBe(true);
  });
});
