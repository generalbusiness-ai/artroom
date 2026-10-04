/**
 * Helpers for the declared-acts stage 5 tests (request a5d64b35): the real
 * client package and the real MCP endpoint against this Worker, in workerd.
 * Nothing here is a double: `connect` is the client's, the fetch goes to the
 * Worker's own handler, and the room is the Durable Object.
 */

import { exports } from "cloudflare:workers";
import { expect } from "vitest";
import { ed25519 } from "@noble/curves/ed25519.js";
import { connect, type HttpRoomClient } from "@generalbusiness/artroom-client";
import type { ActDeclaration, DelegationId, PolicyDocument, PolicyDocumentV2, Signer } from "@generalbusiness/artroom-contract";
import { clock, type TestRoom } from "./support.ts";
import type { KeyPair } from "../../src/crypto.ts";

export const ORIGIN = "https://artroom.test";

/** One HTTPS request the client made: its method and its path below the room. */
export interface Seen {
  readonly method: string;
  readonly path: string;
  readonly body: string | null;
}

/** A fetch into this Worker that records what the client sent. */
export function workerFetch(): { fetch: typeof fetch; seen: Seen[] } {
  const seen: Seen[] = [];
  const f = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const req = new Request(input as RequestInfo, init);
    const path = new URL(req.url).pathname.replace(/^\/v1\/rooms\/[^/]+/, "");
    const body = req.method === "POST" ? await req.clone().text() : null;
    seen.push({ method: req.method, path, body });
    return exports.default.fetch(req);
  };
  return { fetch: f as typeof fetch, seen };
}

/** A contract `Signer` for a test key: Ed25519 over the bytes the client gives it. */
export const signerOf = (keys: KeyPair): Signer => ({ key: keys.key, sign: async (bytes) => ed25519.sign(bytes, keys.seed) });

/** The client package's handle over HTTPS for a member's own key, or for a key signing under a delegation. */
export async function httpClient(r: TestRoom, keys: KeyPair, opts: { delegation?: DelegationId; fetch?: typeof fetch } = {}): Promise<HttpRoomClient> {
  const signer = signerOf(keys);
  const room = await connect({ url: ORIGIN }, r.id, opts.delegation ? { kind: "delegation", signer, as: opts.delegation } : { kind: "key", signer }, {
    fetch: opts.fetch ?? workerFetch().fetch,
    now: () => clock.now,
    retries: 3,
  });
  return room as HttpRoomClient;
}

/** A room-custody invitation with a session, redeemed: the bearer an MCP agent gets (R-CRED-3 as amended). */
export { bearer } from "./declared-support.ts";

let rpcId = 0;

/** One MCP tool call over this Worker's MCP endpoint, as a 2025-era client sends it. Returns the tool result. */
export async function mcpTool(r: TestRoom, token: string, name: string, args: unknown): Promise<{ isError?: boolean; structuredContent?: any; content: { type: string; text: string }[] }> {
  const res = await exports.default.fetch(`${ORIGIN}/v1/rooms/${r.id}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18", authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method: "tools/call", params: { name, arguments: args } }),
  });
  expect(res.status).toBe(200);
  const text = await res.text();
  const body = JSON.parse(text.trim().startsWith("{") ? text : text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5)).join(""));
  return body.result;
}

/** A kind no client binary has a method for: a question on an entry, with a typed field of its own. */
export const ASK: ActDeclaration = {
  label: "Ask",
  targets: { entry: ["comment"] },
  body: { text: { type: "text", max: 200 }, urgency: { type: "enum", values: ["low", "high"], optional: true } },
  who: { roles: ["member", "agent"] },
  help: "Ask a question about an entry.",
};

/** A `v2` document as a room's own policy file. */
export const asPolicy = (doc: PolicyDocumentV2) => doc as unknown as PolicyDocument;
