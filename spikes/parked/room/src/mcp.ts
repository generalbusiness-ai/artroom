/**
 * The MCP endpoint, `POST /v1/rooms/:room/mcp` (R-CRED-10, R-API-9): lane
 * E's MCP server, served by this Worker over a `RoomApi` for each bearer
 * token.
 *
 * The `RoomApi` is the adapter amendment 2 left to the lane that wires the
 * deployment (protocol section 27, "Integration"). It is lane E's client
 * connected as a bearer session to this Worker's own `RoomWire`: acts go to
 * `bearerAct`, workspace requests to `bearerRequest`, and reads (`read`,
 * `subscribe`) carry the bearer token. The room signs every act with the
 * session key under the bearer's delegation, and judges the token on every
 * call; this module decides nothing.
 */

import { connect } from "@generalbusiness/artroom-client";
import { isArtroomError, type ArtroomService, type Room, type RoomName, type RoomWire } from "@generalbusiness/artroom-contract";
import { createMcpFetch, type McpCaller } from "@generalbusiness/artroom-mcp/worker";
import type { RoomEnv } from "./config.ts";
import { report, toConsole, type DiagnosisSink } from "./diag.ts";
import { artroomError, HTTP_STATUS, toArtroomError } from "./errors.ts";

export type { McpCaller };

/** The wire the MCP endpoint needs: `RoomWire`, and the authorization behind a bearer, as the room judges it now. */
export interface McpWire extends RoomWire {
  caller(bearer: string): Promise<McpCaller>;
}

/** The MCP route. `:room` is a room ID or a percent-encoded room name (R-API-3). */
const ROUTE = /^\/v1\/rooms\/([^/]+)\/mcp$/;

/** True for the MCP route, whatever the method: the MCP handler answers every method on it. */
export function isMcpRoute(url: URL): boolean {
  return ROUTE.test(url.pathname);
}

function roomOf(request: Request): string {
  const segment = ROUTE.exec(new URL(request.url).pathname)?.[1] ?? "";
  try {
    return decodeURIComponent(segment);
  } catch {
    throw artroomError("bad-request", "The room in the URL is not valid percent-encoding.");
  }
}

/**
 * The handle for one bearer token, over `wire` (R-CRED-10): every `RoomApi`
 * method, and `subscribe` for live updates. Null when the room does not
 * accept the token: unknown, expired or revoked. Any other failure, such as
 * an unknown room, is thrown.
 */
export async function bearerRoom(wire: (room: string) => Promise<RoomWire>, room: string, token: string): Promise<Room | null> {
  const service: ArtroomService = { room: wire };
  try {
    return await connect(service, room as RoomName, { kind: "bearer", token });
  } catch (e) {
    if (isArtroomError(e) && e.code === "unauthenticated") return null;
    throw e;
  }
}

/**
 * The Worker's MCP endpoint. `wire` gives this Worker's `McpWire` for a
 * room ID or name: `RoomWire`, and the authorization behind a bearer, which
 * `tools/list` uses to choose what to show (R-API-14). A failure outside a
 * tool call (an unknown room, a bad URL) is an `ArtroomError` body with its
 * HTTPS status (R-API-1), never a token.
 */
export function mcpEndpoint(wire: (env: RoomEnv, room: string) => Promise<McpWire>, log: DiagnosisSink = toConsole): (request: Request, env: RoomEnv) => Promise<Response> {
  const serve = createMcpFetch<RoomEnv>({
    room: (request, env, bearer) => bearerRoom((r) => wire(env, r), roomOf(request), bearer),
    caller: async (request, env, bearer) => (await wire(env, roomOf(request))).caller(bearer),
  });
  return async (request, env) => {
    try {
      return await serve(request, env);
    } catch (e) {
      // The client sees only `internal`; the Worker's log gets the step and the redacted error (request d268d249).
      if (!isArtroomError(e)) report(log, "mcp-failed", "mcp", e);
      const err = toArtroomError(e);
      return new Response(JSON.stringify(err), { status: HTTP_STATUS[err.code], headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
  };
}
