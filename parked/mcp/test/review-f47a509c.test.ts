/**
 * Review f47a509c P2 (security): tool names and input keys are looked up as
 * own properties only. An inherited name such as `constructor`,
 * `__proto__` or `toString` is never a tool, and never a declared input
 * key; both give a structured bad-request, at the runner and through the
 * MCP endpoint.
 */

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { RoomApi } from "@generalbusiness/artroom-contract";
import { callTool, isToolName, TOOLS, validate } from "../src/index.ts";
import { agent, roomWithMcp, rpc, type FakeRoom, type Url } from "./support.ts";

const INHERITED = ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf", "isPrototypeOf", "__defineGetter__"];
const noRoom = {} as RoomApi; // the runner must refuse before it touches the room

describe("the direct runner", () => {
  test("an inherited name is not a tool: a bad-request tool error, never a throw", async () => {
    for (const name of INHERITED) {
      expect(isToolName(name), name).toBe(false);
      const out = await callTool(noRoom, name, {});
      expect(out.isError, name).toBe(true);
      expect(out.structuredContent, name).toMatchObject({ name: "ArtroomError", code: "bad-request", retryable: false });
    }
  });

  test("an input key with an inherited name is not allowed by a closed schema", () => {
    for (const key of INHERITED) {
      const input = JSON.parse(`{"act":"act_1_00000000",${JSON.stringify(key)}:1}`);
      expect(Object.hasOwn(input, key), key).toBe(true);
      expect(validate(TOOLS.explain.inputSchema, input).join("; "), key).toContain(`input.${key}: is not allowed`);
    }
  });

  test("an inherited value never satisfies a required field", () => {
    const input = Object.create({ act: "act_1_00000000" });
    expect(validate(TOOLS.explain.inputSchema, input)).toEqual(["input.act: is required"]);
  });

  test("a non-string name and a throwing room stay inside the boundary", async () => {
    expect((await callTool(noRoom, 42, {})).structuredContent).toMatchObject({ code: "bad-request" });
    const out = await callTool(async () => {
      throw new Error("no room");
    }, "explain", { act: "act_1_00000000" });
    expect(out.structuredContent).toMatchObject({ name: "ArtroomError", code: "internal" });
  });
});

describe("through the MCP endpoint", () => {
  let room: FakeRoom;
  let url: Url;
  beforeEach(async () => {
    ({ room, url } = await roomWithMcp());
  });
  afterEach(() => room.stop());

  test("tools/call of an inherited name answers with a structured bad-request", async () => {
    const a = await agent(room, url);
    for (const name of INHERITED) {
      const res = await rpc(a.mcp, a.bearer, "tools/call", { name, arguments: {} });
      expect(res.status, name).toBe(200);
      expect(res.body.result.isError, name).toBe(true);
      expect(res.body.result.structuredContent, name).toMatchObject({ code: "bad-request" });
    }
  });

  test("an inherited key in the arguments is refused, not run", async () => {
    const a = await agent(room, url);
    for (const key of ["toString", "constructor", "valueOf"]) {
      const res = await rpc(a.mcp, a.bearer, "tools/call", JSON.parse(`{"name":"claim","arguments":{"goal":"g","scope":["src/**"],${JSON.stringify(key)}:{}}}`));
      expect([key, res.body.result.isError]).toEqual([key, true]);
      expect(res.body.result.structuredContent.message).toContain(`input.${key}: is not allowed`);
    }
    expect(room.lanes.size).toBe(0);
  });

  test("values smuggled in through __proto__ are never used: the claim opens a new lane", async () => {
    const owner = await agent(room, url, "@owner");
    const theirs = (await rpc(owner.mcp, owner.bearer, "tools/call", { name: "claim", arguments: { goal: "mine", scope: ["src/**"], idempotencyKey: "owner-claim" } })).body.result.structuredContent;
    room.expire(theirs.lane); // unheld, so a take-over would succeed if the smuggled lane were read
    const a = await agent(room, url);
    const body = `{"name":"claim","arguments":{"goal":"g","scope":["lib/**"],"idempotencyKey":"smuggle-claim","__proto__":{"lane":"${theirs.lane}","expectedGeneration":0}}}`;
    const res = await rpc(a.mcp, a.bearer, "tools/call", JSON.parse(body));
    const out = res.body.result.structuredContent;
    expect(out.refused === true || (out.effect?.type === "opened" && out.lane !== theirs.lane)).toBe(true);
    expect(room.lanes.get(theirs.lane)?.holder).toBeNull();
  });
});

describe("the runner ignores inherited input", () => {
  test("a prototype carrying lane and lease does not turn a new claim into a take-over", async () => {
    const calls: unknown[] = [];
    const room = {
      claim: async (input: unknown) => {
        calls.push(input);
        return { refused: true, rule: "stub", reason: "stub" };
      },
      lane: async () => null,
    } as unknown as RoomApi;
    const args = Object.assign(Object.create({ lane: "act_1_00000000", expectedGeneration: 0, lease: 1 }), { goal: "g", scope: ["src/**"], idempotencyKey: "own-claim" });
    await callTool(room, "claim", args);
    expect(calls).toEqual([{ goal: "g", scope: ["src/**"] }]);
  });
});
