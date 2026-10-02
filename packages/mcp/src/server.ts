/**
 * The MCP server: the ten tools over a `RoomApi`. One factory serves every
 * transport: the stateless Workers handler and the local stdio server.
 */

import { Server } from "@modelcontextprotocol/server";
import type { RoomApi } from "@generalbusiness/artroom-contract";
import { callTool } from "./run.ts";
import { INSTRUCTIONS, TOOL_LIST } from "./tools.ts";

export const SERVER_INFO = { name: "artroom", version: "0.0.0" } as const;

/**
 * What `tools/list` returns: name, description, input schema and output
 * schema, exactly as the descriptors give them. Every output schema's root
 * is an object; a tool that can refuse has `oneOf` its result and `Refusal`,
 * so every result's structured content conforms (R-API-1, MCP 2026-07-28).
 */
export function listedTools() {
  return TOOL_LIST.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema, outputSchema: t.outputSchema }));
}

/** A fresh MCP server bound to one room handle. Create one per request (stateless) or per stdio connection. */
export function createArtroomServer(room: RoomApi | (() => Promise<RoomApi>)): Server {
  const server = new Server(SERVER_INFO, { capabilities: { tools: {} }, instructions: INSTRUCTIONS });
  let handle: Promise<RoomApi> | undefined;
  const api = () => (handle ??= typeof room === "function" ? room() : Promise.resolve(room));
  server.setRequestHandler("tools/list", async () => ({ tools: listedTools() as never }));
  server.setRequestHandler("tools/call", async (request) => {
    const { name, arguments: args } = request.params;
    return (await callTool(api, name, args ?? {})) as never;
  });
  return server;
}
