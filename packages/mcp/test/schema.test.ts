/**
 * MCP tool schemas (R-API-9, section 22 point 21): exactly the contract's
 * ten tools, each input schema with exactly the properties of
 * `McpInput<T>`, and descriptions that tell an agent what to do next.
 */

import { describe, expect, expectTypeOf, test } from "vitest";
import type { McpInput, McpToolName } from "@generalbusiness/artroom-contract";
import { listedTools, TOOL_LIST, TOOLS, validate, type Tools } from "../src/index.ts";

/** Every property name of an input type, across the members of a union. */
type InputKeys<T> = T extends unknown ? keyof T : never;
type SchemaKeys<N extends McpToolName> = keyof Tools[N]["inputSchema"]["properties"];

const CONTRACT_TOOLS: readonly McpToolName[] = ["claim", "workspace", "renew", "release", "propose", "note", "review", "land", "attention", "explain"];

describe("the ten tools (R-API-9)", () => {
  test("input schema properties equal the contract's input keys (checked by the compiler)", () => {
    expectTypeOf<SchemaKeys<"claim">>().toEqualTypeOf<InputKeys<McpInput<"claim">>>();
    expectTypeOf<SchemaKeys<"workspace">>().toEqualTypeOf<InputKeys<McpInput<"workspace">>>();
    expectTypeOf<SchemaKeys<"renew">>().toEqualTypeOf<InputKeys<McpInput<"renew">>>();
    expectTypeOf<SchemaKeys<"release">>().toEqualTypeOf<InputKeys<McpInput<"release">>>();
    expectTypeOf<SchemaKeys<"propose">>().toEqualTypeOf<InputKeys<McpInput<"propose">>>();
    expectTypeOf<SchemaKeys<"note">>().toEqualTypeOf<InputKeys<McpInput<"note">>>();
    expectTypeOf<SchemaKeys<"review">>().toEqualTypeOf<InputKeys<McpInput<"review">>>();
    expectTypeOf<SchemaKeys<"land">>().toEqualTypeOf<InputKeys<McpInput<"land">>>();
    expectTypeOf<SchemaKeys<"attention">>().toEqualTypeOf<InputKeys<McpInput<"attention">>>();
    expectTypeOf<SchemaKeys<"explain">>().toEqualTypeOf<InputKeys<McpInput<"explain">>>();
    expectTypeOf<keyof Tools>().toEqualTypeOf<McpToolName>();
  });

  test("exactly the contract's ten names, each calling the method of the same name", () => {
    expect(TOOL_LIST.map((t) => t.name).sort()).toEqual([...CONTRACT_TOOLS].sort());
    for (const t of TOOL_LIST) expect(t.method).toBe(t.name);
    expect(listedTools().map((t) => Object.keys(t).sort())).toEqual(TOOL_LIST.map(() => ["description", "inputSchema", "name"]));
  });

  test("required fields are the contract's required fields", () => {
    const required = Object.fromEntries(TOOL_LIST.map((t) => [t.name, [...(t.inputSchema.required ?? [])].sort()]));
    expect(required).toEqual({
      claim: ["scope"], // the one field both claim forms require
      workspace: ["lane", "lease"],
      renew: ["lane", "lease"],
      release: ["lane", "lease"],
      propose: ["expectedGeneration", "head", "lane", "lease", "summary"],
      note: ["anchor", "text"],
      review: ["generation", "head", "lane", "scope", "text", "verdict"],
      land: ["generation", "head", "lane", "lease"],
      attention: [],
      explain: ["act"],
    });
    for (const t of TOOL_LIST) {
      expect(t.inputSchema.type).toBe("object");
      expect(t.inputSchema.additionalProperties).toBe(false);
      for (const r of t.inputSchema.required ?? []) expect(Object.keys(t.inputSchema.properties ?? {})).toContain(r);
    }
  });

  test("every act tool accepts an idempotency key, except workspace, which is a request (R-IDEM-6)", () => {
    for (const name of ["claim", "renew", "release", "propose", "note", "review", "land"] as const) {
      expect(Object.keys(TOOLS[name].inputSchema.properties)).toContain("idempotencyKey");
    }
  });

  test("each description says what to do next, and on refusal for every act", () => {
    for (const t of TOOL_LIST) {
      expect(t.description.length).toBeLessThan(1000);
      expect(t.description).toMatch(/^[A-Z]/);
    }
    for (const name of ["claim", "workspace", "renew", "release", "propose", "note", "review", "land"] as const) {
      expect(TOOLS[name].description).toMatch(/On refusal: `[a-z-]+`/);
    }
    expect(TOOLS.attention.description).toMatch(/cursor/);
    expect(TOOLS.propose.description).toMatch(/generation-moved/);
    expect(TOOLS.workspace.description).toMatch(/Never print/);
  });
});

describe("input validation", () => {
  const head = "a".repeat(40);
  const lane = "act_7_0c1d2e3f";
  test.each([
    ["claim", { goal: "Fix login copy", scope: ["src/ui/login/**"] }],
    ["claim", { lane, lease: 1, expectedGeneration: 0, scope: ["src/**"] }],
    ["workspace", { lane, lease: 1, waitMs: 20000 }],
    ["propose", { lane, lease: 1, head, expectedGeneration: 0, summary: "Copy fix." }],
    ["note", { anchor: { act: lane }, text: "hi" }],
    ["note", { anchor: { lane, generation: 1, head, path: "src/a.ts", line: 3 }, text: "hi", replyTo: lane }],
    ["review", { lane, generation: 1, head, verdict: "approve", scope: ["src/**"], dependsOn: ["lib/**"], text: "ok" }],
    ["land", { lane, lease: 1, generation: 1, head, waitMs: 60000, idempotencyKey: "land-1" }],
    ["attention", { limit: 20 }],
    ["attention", {}],
    ["explain", { act: lane }],
  ] as const)("accepts a demo-loop %s input", (name, input) => {
    expect(validate(TOOLS[name].inputSchema, input)).toEqual([]);
  });

  test.each([
    ["propose", { lane, head, expectedGeneration: 0, summary: "s" }, /lease: is required/],
    ["propose", { lane, lease: 1, head: "abc", expectedGeneration: 0, summary: "s" }, /head: does not match/],
    ["review", { lane, generation: 1, head, verdict: "maybe", scope: [], text: "" }, /verdict: must be one of/],
    ["land", { lane, lease: 1, generation: 1, head, extra: true }, /extra: is not allowed/],
    ["workspace", { lane, lease: 0 }, /lease: must be at least 1/],
    ["note", { anchor: { lane }, text: "x" }, /required/],
    ["claim", { goal: "g", scope: "src/**" }, /scope: expected array/],
    ["explain", { act: "op_land_1" }, /does not match/],
  ] as const)("refuses a bad %s input", (name, input, problem) => {
    expect(validate(TOOLS[name].inputSchema, input).join("; ")).toMatch(problem);
  });
});
