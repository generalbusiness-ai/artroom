/**
 * The MCP server: the tools over a `RoomApi`. One factory serves every
 * transport: the stateless Workers handler and the local stdio server.
 */

import { Server } from "@modelcontextprotocol/server";
import type { McpToolDescriptor, McpToolset, RoomApi } from "@generalbusiness/artroom-contract";
import { callTool } from "./run.ts";
import { INSTRUCTIONS, TOOL_LIST } from "./tools.ts";
import { toolsFor, type McpCaller } from "./toolsets.ts";

export const SERVER_INFO = { name: "artroom", version: "0.0.0" } as const;

/** What a server needs besides the room handle: who is calling, and the toolset it asked for, if any (R-API-14). */
export interface ArtroomServerOptions {
  /**
   * The caller's authorization, read now. The host that authenticated the
   * request supplies it. It is read again for every `tools/list`, so the
   * list follows a changed role, grant or declaration, and never an
   * earlier call.
   */
  caller(): Promise<McpCaller>;
  /** The toolset the caller asked for. Absent: the default for its authorization. */
  readonly toolset?: McpToolset;
}

/**
 * What `tools/list` sends for each tool: name, title, description, input
 * schema, output schema and annotations, as the descriptor gives them
 * (R-API-13). `method` and `toolsets` stay on the server. Every output
 * schema's root is an object; a tool that can refuse has `oneOf` its result
 * and `Refusal`, so every result's structured content conforms (R-API-1).
 */
export function listedTools(tools: readonly McpToolDescriptor[] = TOOL_LIST) {
  return tools.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, outputSchema: t.outputSchema, annotations: t.annotations })); // GM:list-fields
}

/** A fresh MCP server bound to one room handle. Create one per request (stateless) or per stdio connection. */
export function createArtroomServer(room: RoomApi | (() => Promise<RoomApi>), options: ArtroomServerOptions): Server {
  const server = new Server(SERVER_INFO, { capabilities: { tools: {} }, instructions: INSTRUCTIONS });
  let handle: Promise<RoomApi> | undefined;
  const api = () => (handle ??= typeof room === "function" ? room() : Promise.resolve(room));
  server.setRequestHandler("tools/list", async () => {
    // Read for this request, never kept: the list depends only on the caller's authorization now (R-API-14).
    const [caller, catalogue] = await Promise.all([options.caller(), api().then((r) => r.acts())]); // GM:list-fresh
    return { tools: listedTools(await toolsFor(caller, catalogue, options.toolset)) as never };
  });
  // A call is never checked against the list: a tool that is not shown still runs, and the room judges it (R-API-14).
  server.setRequestHandler("tools/call", async (request) => {
    const { name, arguments: args } = request.params;
    return (await callTool(api, name, args ?? {})) as never;
  });
  return server;
}
