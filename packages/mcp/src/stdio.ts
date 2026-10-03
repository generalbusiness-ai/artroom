/**
 * The MCP server over stdio, for a local agent. The caller supplies the
 * room handle, usually the CLI's, signing with the user's key file.
 */

import { serveStdio, type ServeStdioOptions, type StdioServerHandle } from "@modelcontextprotocol/server/stdio";
import type { RoomApi } from "@generalbusiness/artroom-contract";
import { createArtroomServer, type ArtroomServerOptions } from "./server.ts";

export { callerFromRoster, toolsetOf, type McpCaller } from "./toolsets.ts";

/**
 * Serves the tools on this process's stdin and stdout, or on
 * `options.transport`. `caller` gives the caller's authorization, and
 * `toolset` the toolset asked for: the same list as over HTTPS for the same
 * authorization (R-API-14).
 */
export function serveArtroomStdio(room: RoomApi | (() => Promise<RoomApi>), artroom: ArtroomServerOptions, options: ServeStdioOptions = {}): StdioServerHandle {
  return serveStdio(() => createArtroomServer(room, artroom), options);
}
