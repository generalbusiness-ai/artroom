/**
 * The MCP Worker handler inside workerd: the Agents SDK stateless handler,
 * the tools and the validator load and answer in the Workers runtime.
 */

import { expect, test } from "vitest";
import type { Claim, RoomApi } from "@generalbusiness/artroom-contract";
import { listedTools } from "../../src/index.ts";
import { createMcpFetch } from "../../src/worker.ts";

const claim = {
  id: "act_4_0c1d2e3f",
  seq: 4,
  kind: "claim",
  by: { via: "delegation", member: "@builder", role: "agent", key: "key_x", delegation: "act_3_00000000", grantor: "key_y" },
  at: "2026-10-01T00:00:00.000Z",
  flags: [],
  lane: "act_4_0c1d2e3f",
  purpose: "ordinary",
  goal: "g",
  scope: ["src/**"],
  lease: { holder: "@builder", generation: 1, expiresAt: "2026-10-01T00:15:00.000Z" },
  overlaps: [],
  effect: { type: "opened", purpose: "ordinary", lease: { holder: "@builder", generation: 1, expiresAt: "2026-10-01T00:15:00.000Z" } },
} as unknown as Claim;

/** Just enough of a room for two calls. */
const room = { claim: async () => claim } as unknown as RoomApi;

const handler = createMcpFetch<unknown>({ room: async (_r, _e, bearer) => (bearer === "good" ? room : null) });

async function post(bearer: string, body: unknown): Promise<Response> {
  return handler(
    new Request("http://localhost/v1/rooms/room_0123/mcp", {
      method: "POST",
      headers: { host: "localhost", "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${bearer}`, "mcp-protocol-version": "2025-06-18" },
      body: JSON.stringify(body),
    }),
    {},
  );
}

async function json(res: Response): Promise<any> {
  const text = await res.text();
  return JSON.parse(text.trim().startsWith("{") ? text : text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5)).join(""));
}

test("tools/list and tools/call answer in workerd", async () => {
  const list = await json(await post("good", { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }));
  expect(list.result.tools).toEqual(listedTools());
  const res = await json(await post("good", { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "claim", arguments: { goal: "g", scope: ["src/**"] } } }));
  expect(res.result.structuredContent.lane).toBe("act_4_0c1d2e3f");
  expect((await post("bad", { jsonrpc: "2.0", id: 3, method: "tools/list", params: {} })).status).toBe(401);
});
