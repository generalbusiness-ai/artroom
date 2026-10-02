/**
 * The MCP endpoint on Workers: `POST /v1/rooms/:room/mcp` (HttpRoutes),
 * served by the Agents SDK's stateless handler. Each request builds a fresh
 * server bound to the room handle for its bearer token (R-CRED-3).
 *
 * The room Worker supplies `room()`: it checks the bearer and returns a
 * handle whose acts the room signs with the bearer's session key, under its
 * delegation. This package never sees a key.
 */

import { createMcpHandler } from "agents/mcp/server";
import type { RoomApi } from "@generalbusiness/artroom-contract";
import { createArtroomServer } from "./server.ts";

export interface McpWorkerOptions<Env> {
  /** The handle for this request's bearer token, or null when the token is missing, unknown, expired or revoked. */
  room(request: Request, env: Env, bearer: string): Promise<RoomApi | null>;
  /** Host names the endpoint answers on, for custom domains. Default: localhost and the `workers.dev` host. */
  readonly allowedHostnames?: string[];
}

const ROUTE = /^\/v1\/rooms\/[^/]+\/mcp$/;

function jsonRpcError(status: number, message: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message }, id: null }), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** A Worker `fetch` for the MCP route. Other paths return 404, so it can sit behind a router. */
export function createMcpFetch<Env>(opts: McpWorkerOptions<Env>): (request: Request, env: Env) => Promise<Response> {
  return async (request, env) => {
    const url = new URL(request.url);
    if (!ROUTE.test(url.pathname)) return jsonRpcError(404, "Not found.");
    const bearer = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
    if (bearer === undefined) {
      return jsonRpcError(401, "Send the bearer token from your invitation as `Authorization: Bearer <token>`.", { "www-authenticate": 'Bearer realm="artroom"' });
    }
    const room = await opts.room(request, env, bearer);
    if (room === null) {
      return jsonRpcError(401, "The bearer token is unknown, expired or revoked. Ask an admin for a new MCP invitation.", { "www-authenticate": 'Bearer realm="artroom", error="invalid_token"' });
    }
    const handler = createMcpHandler(() => createArtroomServer(room), {
      route: url.pathname,
      ...(opts.allowedHostnames ? { allowedHostnames: opts.allowedHostnames } : {}),
    });
    return handler.fetch(request);
  };
}
