/**
 * The stdio server for a local agent: the same ten tools, over a handle that
 * signs with the user's own key (R-CRED-2), spoken as newline-delimited
 * JSON-RPC.
 */

import { PassThrough } from "node:stream";
import { afterEach, beforeEach, expect, test } from "vitest";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { connect, generateSigner, isRefusal, join } from "@generalbusiness/artroom-client";
import { listedTools } from "../src/index.ts";
import { serveArtroomStdio } from "../src/stdio.ts";
import { FakeRoom, type Url } from "./support.ts";

let room: FakeRoom;
let url: Url;
beforeEach(async () => {
  room = await FakeRoom.create();
  url = (await room.start()) as Url;
});
afterEach(() => room.stop());

test("initialize, list the tools, and claim over stdio", async () => {
  const { invitation, secret } = await room.invite("@alice");
  const { signer } = await generateSigner();
  const joined = await join({ url }, room.id, { invitation, secret, signer });
  expect(isRefusal(joined)).toBe(false);
  const api = await connect({ url }, room.id, { kind: "key", signer });

  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const handle = serveArtroomStdio(api, { transport: new StdioServerTransport(stdin, stdout) });
  const replies = new Map<number, any>();
  let buffer = "";
  stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      const msg = JSON.parse(line);
      if (msg.id !== undefined) replies.set(msg.id, msg);
    }
  });
  const send = async (id: number | undefined, method: string, params: unknown = {}) => {
    stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...(id === undefined ? {} : { id }), method, params })}\n`);
    if (id === undefined) return undefined;
    for (let i = 0; i < 500 && !replies.has(id); i++) await new Promise((r) => setTimeout(r, 10));
    return replies.get(id);
  };

  const init = await send(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
  expect(init.result.serverInfo.name).toBe("artroom");
  expect(init.result.instructions).toMatch(/refusal is an answer/);
  await send(undefined, "notifications/initialized");
  const list = await send(2, "tools/list");
  expect(list.result.tools).toEqual(listedTools());
  const claim = await send(3, "tools/call", { name: "claim", arguments: { goal: "Local work", scope: ["docs/**"] } });
  expect(claim.result.structuredContent).toMatchObject({ kind: "claim", by: { via: "member", member: "@alice" } });
  await handle.close();
});
