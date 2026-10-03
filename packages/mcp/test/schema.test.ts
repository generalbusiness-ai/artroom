/**
 * MCP tool schemas (R-API-9, section 22 point 21): exactly the contract's
 * ten tools, each input schema with exactly the properties of
 * `McpInput<T>`, and descriptions that tell an agent what to do next.
 */

import { describe, expect, expectTypeOf, test } from "vitest";
import type { McpInput, McpToolName } from "@generalbusiness/artroom-contract";
import { listedTools, NAMED_TOOLS, TOOL_LIST, TOOLS, validate, type Tools } from "../src/index.ts";

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
    // Declared acts stage 5 adds `acts` and `act` beside the ten (below), and the MCP core adds more reads: each of the
    // ten named tools is still here, once, and every listed tool is a contract tool (`keyof Tools`, above).
    const names = TOOL_LIST.map((t) => t.name);
    for (const name of CONTRACT_TOOLS) expect(names.filter((n) => n === name)).toEqual([name]);
    expect(new Set(names).size).toBe(names.length);
    // `operation` calls `RoomApi.op` (and `wait`); every other tool calls the method of its own name (R-API-9).
    for (const t of TOOL_LIST) expect(t.method).toBe(t.name === "operation" ? "op" : t.name);
    // `tools/list` also sends `title` and `annotations` (R-API-13).
    expect(listedTools().map((t) => Object.keys(t).sort())).toEqual(TOOL_LIST.map(() => ["annotations", "description", "inputSchema", "name", "outputSchema", "title"]));
  });

  test("required fields are the contract's required fields", () => {
    const required = Object.fromEntries(TOOL_LIST.filter((t) => (CONTRACT_TOOLS as readonly string[]).includes(t.name)).map((t) => [t.name, [...(t.inputSchema.required ?? [])].sort()]));
    expect(required).toEqual({
      // Every act tool requires `idempotencyKey` (R-API-9, amendment 7). `workspace` is a request and takes none.
      claim: ["idempotencyKey", "scope"], // with the key, the one field both claim forms require
      workspace: ["lane", "lease"],
      renew: ["idempotencyKey", "lane", "lease"],
      release: ["idempotencyKey", "lane", "lease"],
      propose: ["expectedGeneration", "head", "idempotencyKey", "lane", "lease", "summary"],
      note: ["anchor", "idempotencyKey", "text"],
      review: ["generation", "head", "idempotencyKey", "lane", "scope", "text", "verdict"],
      land: ["generation", "head", "idempotencyKey", "lane", "lease"],
      attention: [],
      explain: ["act"],
    });
    for (const t of TOOL_LIST) {
      expect(t.inputSchema.type).toBe("object");
      expect(t.inputSchema.additionalProperties).toBe(false);
      for (const r of t.inputSchema.required ?? []) expect(Object.keys(t.inputSchema.properties ?? {})).toContain(r);
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
  test("accepts each input of the contract's demo loop", () => {
    // As the contract's demo loop now gives them: each act with its key, and waits within 45,000 ms (amendment 7).
    const inputs = [
    ["claim", { goal: "Fix login copy", scope: ["src/ui/login/**"], idempotencyKey: "claim-1" }],
    ["claim", { lane, lease: 1, expectedGeneration: 0, scope: ["src/**"], idempotencyKey: "claim-2" }],
    ["workspace", { lane, lease: 1, waitMs: 20000 }],
    ["propose", { lane, lease: 1, head, expectedGeneration: 0, summary: "Copy fix.", idempotencyKey: "propose-1" }],
    ["note", { anchor: { act: lane }, text: "hi", idempotencyKey: "note-1" }],
    ["note", { anchor: { lane, generation: 1, head, path: "src/a.ts", line: 3 }, text: "hi", replyTo: lane, idempotencyKey: "note-2" }],
    ["review", { lane, generation: 1, head, verdict: "approve", scope: ["src/**"], dependsOn: ["lib/**"], text: "ok", idempotencyKey: "review-1" }],
    ["land", { lane, lease: 1, generation: 1, head, waitMs: 45000, idempotencyKey: "land-1" }],
    ["attention", { limit: 20 }],
    ["attention", {}],
    ["explain", { act: lane }],
    ] as const;
    for (const [name, input] of inputs) expect(validate(TOOLS[name].inputSchema, input), `${name} ${JSON.stringify(input)}`).toEqual([]);
  });

  test("refuses an input with a missing, malformed, out-of-range or unknown field, and names the problem", () => {
    const inputs = [
    ["propose", { lane, head, expectedGeneration: 0, summary: "s" }, /lease: is required/],
    ["propose", { lane, lease: 1, head: "abc", expectedGeneration: 0, summary: "s" }, /head: does not match/],
    ["review", { lane, generation: 1, head, verdict: "maybe", scope: [], text: "" }, /verdict: must be one of/],
    ["land", { lane, lease: 1, generation: 1, head, extra: true }, /extra: is not allowed/],
    ["workspace", { lane, lease: 0 }, /lease: must be at least 1/],
    ["note", { anchor: { lane }, text: "x" }, /required/],
    ["claim", { goal: "g", scope: "src/**" }, /scope: expected array/],
    ["explain", { act: "op_land_1" }, /does not match/],
    ] as const;
    for (const [name, input, problem] of inputs) expect(validate(TOOLS[name].inputSchema, input).join("; "), `${name} ${JSON.stringify(input)}`).toMatch(problem);
  });
});

describe("the two generic tools, beside the ten (R-API-9 as amended; declared acts stage 5)", () => {
  test("input schema properties equal the contract's input keys (checked by the compiler)", () => {
    expectTypeOf<SchemaKeys<"acts">>().toEqualTypeOf<InputKeys<McpInput<"acts">>>();
    expectTypeOf<SchemaKeys<"act">>().toEqualTypeOf<InputKeys<McpInput<"act">>>();
    // The four named reads of the MCP core (amendment 7).
    expectTypeOf<SchemaKeys<"lanes">>().toEqualTypeOf<InputKeys<McpInput<"lanes">>>();
    expectTypeOf<SchemaKeys<"lane">>().toEqualTypeOf<InputKeys<McpInput<"lane">>>();
    expectTypeOf<SchemaKeys<"proposal">>().toEqualTypeOf<InputKeys<McpInput<"proposal">>>();
    expectTypeOf<SchemaKeys<"operation">>().toEqualTypeOf<InputKeys<McpInput<"operation">>>();
  });

  test("acts and act are listed, each calling the method of the same name; the ten named tools are NAMED_TOOLS", () => {
    const names = TOOL_LIST.map((t) => t.name);
    expect(names).toContain("acts");
    expect(names).toContain("act");
    expect(TOOLS.acts.method).toBe("acts");
    expect(TOOLS.act.method).toBe("act");
    // The MCP core adds four named reads to the ten (R-API-9 as amended by amendment 7): fourteen named tools.
    expect([...NAMED_TOOLS].sort()).toEqual([...CONTRACT_TOOLS, "lanes", "lane", "proposal", "operation"].sort());
  });

  test("act requires kind, target, body, binding and idempotencyKey, and nothing else is allowed", () => {
    expect([...TOOLS.act.inputSchema.required].sort()).toEqual(["binding", "body", "idempotencyKey", "kind", "target"]);
    expect(TOOLS.act.inputSchema.additionalProperties).toBe(false);
    const ok = { kind: "take-part", target: null, body: { part: "bass" }, binding: `sha256:${"a".repeat(64)}`, idempotencyKey: "k1" };
    expect(validate(TOOLS.act.inputSchema, ok)).toEqual([]);
    for (const drop of ["kind", "target", "body", "binding", "idempotencyKey"] as const) {
      const { [drop]: _gone, ...rest } = ok;
      void _gone;
      expect(validate(TOOLS.act.inputSchema, rest).join(" "), drop).toContain(`input.${drop}: is required`);
    }
    expect(validate(TOOLS.act.inputSchema, { ...ok, binding: "sha256:short" }).join(" ")).toContain("input.binding");
    expect(validate(TOOLS.act.inputSchema, { ...ok, kind: "Take" }).join(" ")).toContain("input.kind");
    expect(validate(TOOLS.act.inputSchema, { ...ok, target: "lane" }).length).toBeGreaterThan(0);
    expect(validate(TOOLS.act.inputSchema, { ...ok, target: { lane: "act_1_00000000" } })).toEqual([]);
    expect(validate(TOOLS.act.inputSchema, { ...ok, delegation: "act_1_00000000" }).join(" ")).toContain("input.delegation: is not allowed");
  });

  test("acts takes an optional seq or policy version, and nothing else", () => {
    expect(TOOLS.acts.inputSchema.additionalProperties).toBe(false);
    expect(validate(TOOLS.acts.inputSchema, {})).toEqual([]);
    expect(validate(TOOLS.acts.inputSchema, { at: 12 })).toEqual([]);
    expect(validate(TOOLS.acts.inputSchema, { policy: "act_3_0a1b2c3d" })).toEqual([]);
    expect(validate(TOOLS.acts.inputSchema, { at: -1 }).length).toBeGreaterThan(0);
    expect(validate(TOOLS.acts.inputSchema, { policy: "latest" }).length).toBeGreaterThan(0);
  });
});
