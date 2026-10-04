/**
 * The MCP endpoint on Workers: `POST /v1/rooms/:room/mcp` (HttpRoutes),
 * served by the Agents SDK's stateless handler, for 2026-07-28 clients and,
 * in its legacy stateless mode, for 2025-era clients. Each request builds a fresh
 * server bound to the room handle for its bearer token (R-CRED-3).
 *
 * The room Worker supplies `room()`: it checks the bearer and returns a
 * handle whose acts the room signs with the bearer's session key, under its
 * delegation. This package never sees a key.
 */

import { createMcpHandler } from "agents/mcp/server";
import { isArtroomError, type McpToolset, type RoomApi } from "@generalbusiness/artroom-contract";
import { createArtroomServer } from "./server.ts";
import { toolsetOf, type McpCaller } from "./toolsets.ts";

export type { McpCaller };

export interface McpWorkerOptions<Env> {
  /** The handle for this request's bearer token, or null when the token is missing, unknown, expired or revoked. */
  room(request: Request, env: Env, bearer: string): Promise<RoomApi | null>;
  /**
   * The authorization of this request's bearer, read now: its member's
   * current roster role, and the delegation it acts under with the signed
   * grant unchanged. Called for `tools/list` only; a call is judged by the
   * room (R-API-14).
   */
  caller(request: Request, env: Env, bearer: string): Promise<McpCaller>;
  /** Host names the endpoint answers on, for custom domains. Default: localhost and the `workers.dev` host. */
  readonly allowedHostnames?: string[];
}

/** The largest request body the endpoint reads, as the Room's HTTPS routes. */
const MAX_BODY = 1024 * 1024;

/**
 * The request with its body read into memory, counting bytes as they
 * stream in, or null past `MAX_BODY`, where the read stops. A missing or
 * false `Content-Length` makes no difference (request 55be0661).
 */
async function capped(request: Request): Promise<Request | null> {
  if (Number(request.headers.get("content-length") ?? "0") > MAX_BODY) return null;
  if (request.body === null) return request;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  return new Request(request.url, { method: request.method, headers, body: bytes });
}

const ROUTE = /^\/v1\/rooms\/[^/]+\/mcp$/;

/** A failure before any tool runs. `data`, when given, is the `ArtroomError` it stands for. */
function jsonRpcError(status: number, message: string, headers: Record<string, string> = {}, data?: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: data === undefined ? -32001 : -32602, message, ...(data !== undefined ? { data } : {}) }, id: null }), {
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
    // `?toolset=`: the toolset the caller asks for. An unknown name is `bad-request`, and nothing runs (R-API-14).
    let toolset: McpToolset | undefined;
    try {
      const asked = url.searchParams.getAll("toolset");
      if (asked.length > 1) return jsonRpcError(400, "Give one toolset.", {}, { name: "ArtroomError", code: "bad-request", message: "Give one toolset.", retryable: false }); // GM:toolset-one
      toolset = toolsetOf(asked.length === 1 ? asked[0] : undefined); // GM:toolset-query
    } catch (e) {
      if (!isArtroomError(e)) throw e;
      return jsonRpcError(400, e.message, {}, e);
    }
    const bounded = await capped(request);
    if (bounded === null) return jsonRpcError(413, "The request body is larger than 1 MiB.");
    const options = { caller: () => opts.caller(request, env, bearer), ...(toolset !== undefined ? { toolset } : {}) };
    const handler = createMcpHandler(() => createArtroomServer(room, options), {
      route: url.pathname,
      // 2026-07-28 clients, and 2025-era clients (Codex by default, pi) served statelessly: a fresh server per
      // request, no session, and 405 for the 2025 GET and DELETE session operations.
      legacy: "stateless",
      ...(opts.allowedHostnames ? { allowedHostnames: opts.allowedHostnames } : {}),
    });
    return handler.fetch(bounded);
  };
}
