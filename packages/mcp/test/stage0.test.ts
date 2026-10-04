/**
 * MCP plan stage 0 (request 8ae3b2dc): advertised output schemas and both
 * wire formats, checked with the official MCP client.
 * After `tools/list`, the client validates every structured result against
 * the tool's advertised `outputSchema`, and throws if one does not conform,
 * so these tests fail when a result (a refusal included) falls outside its
 * schema.
 */

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { Client, StreamableHTTPClientTransport, type VersionNegotiationMode } from "@modelcontextprotocol/client";
import type { Claim, JsonSchema, Redeemed } from "@generalbusiness/artroom-contract";
import { INSTRUCTIONS, listedTools, TOOLS, validate } from "../src/index.ts";
import { agent, roomWithMcp, type FakeRoom, type Url } from "./support.ts";

let room: FakeRoom;
let url: Url;
beforeEach(async () => {
  ({ room, url } = await roomWithMcp());
});
afterEach(() => room.stop());

// `act`, the generic declared act (declared acts stage 5), can refuse as the named act tools can.
const REFUSING = ["claim", "workspace", "propose", "note", "review", "land", "renew", "release", "act"] as const;
const head = (c: string) => c.repeat(40);

async function client(a: Redeemed, mode: VersionNegotiationMode): Promise<Client> {
  const c = new Client({ name: "artroom-stage0-test", version: "0.0.0" }, { versionNegotiation: { mode } });
  await c.connect(new StreamableHTTPClientTransport(new URL(a.mcp), { requestInit: { headers: { authorization: `Bearer ${a.bearer}` } } }));
  return c;
}

describe("advertised output schemas (MCP plan section 5)", () => {
  test("every tool advertises an object-rooted outputSchema; a tool that can refuse is oneOf its result and Refusal", () => {
    const listed = listedTools();
    expect(listed.map((t) => t.name)).toEqual(Object.keys(TOOLS));
    for (const t of listed) {
      expect(t.outputSchema.type).toBe("object");
      const forms = (t.outputSchema.oneOf ?? []) as readonly JsonSchema[];
      const refusal = forms.find((f) => f.required?.includes("refused"));
      if ((REFUSING as readonly string[]).includes(t.name)) {
        expect(forms).toHaveLength(2);
        expect(refusal?.required).toEqual(["refused", "rule", "reason"]);
      } else {
        expect(refusal).toBeUndefined();
      }
    }
  });

  test("a refusal fits each refusing tool's schema and no other form of it", () => {
    const r = { refused: true, rule: "lease-fenced", reason: "The lease ended.", fix: "Claim the lane again." };
    for (const name of REFUSING) expect(validate(TOOLS[name].outputSchema, r, name)).toEqual([]);
    expect(validate(TOOLS.attention.outputSchema, r).length).toBeGreaterThan(0);
  });
});

describe.each([
  ["2026-07-28", { pin: "2026-07-28" } as VersionNegotiationMode],
  ["legacy stateless (2025)", "legacy" as VersionNegotiationMode],
])("the official MCP client, %s", (_label, mode) => {
  test("connects, gets the instructions, and lists the tools with their output schemas unwrapped; results and refusals conform to them; failures are tool errors", async () => {
    const a = await agent(room, url);
    const c = await client(a, mode);
    try {
      if (mode === "legacy") expect(c.getProtocolEra()).not.toBe("2026-07-28");
      else expect(c.getNegotiatedProtocolVersion()).toBe("2026-07-28");
      expect(c.getInstructions()).toBe(INSTRUCTIONS);
      const { tools } = await c.listTools();
      // An agent's bearer gets the builder toolset (R-API-14). The room's document is `v1`, so `act` is not listed.
      expect(tools.map((t) => t.name)).toEqual(["claim", "workspace", "propose", "note", "land", "renew", "release", "attention", "explain", "lane", "proposal", "operation", "acts"]);
      for (const t of tools) expect(t.outputSchema).toEqual(TOOLS[t.name as keyof typeof TOOLS].outputSchema);

      // The client validates structured content against the tool list it has now cached, as hosts do.
      const claimed = await c.callTool({ name: "claim", arguments: { goal: "Fix login copy", scope: ["src/ui/**"], idempotencyKey: "c1" } });
      expect(claimed.isError).toBe(false);
      const claim = claimed.structuredContent as unknown as Claim;
      expect(claim).toMatchObject({ kind: "claim", lease: { generation: 1 } });
      const held = { lane: claim.lane, lease: claim.lease.generation };

      const proposed = await c.callTool({ name: "propose", arguments: { ...held, head: head("a"), expectedGeneration: 0, summary: "one", idempotencyKey: "p1" } });
      expect(proposed.structuredContent).toMatchObject({ kind: "propose", generation: 1 });

      // A refusal is structured content the client accepts, never wrapped in `{ result }`.
      const refused = await c.callTool({ name: "propose", arguments: { ...held, head: head("b"), expectedGeneration: 0, summary: "two", idempotencyKey: "p2" } });
      expect(refused.isError).toBe(false);
      expect(refused.structuredContent).toMatchObject({ refused: true, rule: "generation-moved" });
      expect((refused.content as { text: string }[])[0]!.text).toMatch(/^Refused \(generation-moved\): .+ Fix: /);

      const page = await c.callTool({ name: "attention", arguments: {} });
      expect(page.structuredContent).toMatchObject({ items: expect.any(Array), publishedThrough: expect.any(Number) });
      const unknown = await c.callTool({ name: "explain", arguments: { act: "act_999_00000000" } });
      expect(unknown.structuredContent).toEqual({ act: "act_999_00000000", outcome: "not-found" });

      const bad = await c.callTool({ name: "propose", arguments: { lane: claim.lane } });
      expect(bad.isError).toBe(true);
      expect(bad.structuredContent).toMatchObject({ name: "ArtroomError", code: "bad-request" });
    } finally {
      await c.close();
    }
  });
});
