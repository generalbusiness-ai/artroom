/**
 * The MCP server over stdio, for a local agent. The caller supplies the
 * room handle, usually the CLI's, signing with the user's key file.
 */

import { serveStdio, type ServeStdioOptions, type StdioServerHandle } from "@modelcontextprotocol/server/stdio";
import type { RoomApi } from "@generalbusiness/artroom-contract";
import { createArtroomServer } from "./server.ts";

/** Serves the ten tools on this process's stdin and stdout, or on `options.transport`. */
export function serveArtroomStdio(room: RoomApi | (() => Promise<RoomApi>), options: ServeStdioOptions = {}): StdioServerHandle {
  return serveStdio(() => createArtroomServer(room), options);
}
