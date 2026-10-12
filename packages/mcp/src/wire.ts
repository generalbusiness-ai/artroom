/**
 * The two MCP wire revisions, each by its own rules (plan 031, section 7).
 * This is the minimal JSON-RPC handler that the plan allows in place of an
 * SDK, because no published SDK serves both: the v2 server package serves
 * 2025-era traffic only statelessly, without sessions or a `GET` stream,
 * and the v1 package does not serve 2026-07-28. It implements each revision's
 * required method set in full.
 *
 * | | 2025-11-25 | 2026-07-28 |
 * |---|---|---|
 * | Handshake | `initialize`, then `notifications/initialized` | none: each request carries `_meta` with its protocol version and client capabilities |
 * | Discovery | `initialize`'s result | `server/discover` |
 * | List changes | `notifications/tools/list_changed` on the session's stream | a tagged notification on the `subscriptions/listen` stream, for a client that opted in |
 * | `tools/list` | paged | paged, with `ttlMs` 30000 and `cacheScope` `private` |
 * | Results | structured content | the same, with `resultType: "complete"` |
 * | Removed | | `ping`, `logging/setLevel`, roots and sampling are not offered |
 *
 * The revision is chosen per request: a request whose `_meta` names a
 * protocol version is served by the newer rules; `initialize`, and a request
 * of an initialized 2025-11-25 session, by the older. The two kinds of
 * per-connection state are kept apart. Neither is authority: every
 * connection of one server is bound to the one key the process signs with.
 */

import type { Digest } from "@generalbusiness/artroom-contract";
import { INSTRUCTIONS, ListRestart, SERVER_NAME, SERVER_VERSION, type McpService } from "./service.ts";

export const LEGACY = "2025-11-25";
export const MODERN = "2026-07-28";
export const PROTOCOL_META = "io.modelcontextprotocol/protocolVersion";
export const CAPABILITIES_META = "io.modelcontextprotocol/clientCapabilities";
export const SUBSCRIPTION_META = "io.modelcontextprotocol/subscriptionId";
export const SERVER_INFO_META = "io.modelcontextprotocol/serverInfo";
/** The error a 2026-07-28 server answers for a protocol version it does not serve. */
export const UNSUPPORTED_VERSION = -32022;
export const TOOLS_TTL_MS = 30_000;

export type Id = string | number;
export interface Message { jsonrpc: "2.0"; id?: Id | null; method?: string; params?: Record<string, unknown>; result?: unknown; error?: { code: number; message: string; data?: unknown } }
export type Send = (message: Message) => void;

const SERVER_INFO = { name: SERVER_NAME, version: SERVER_VERSION };
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const reply = (id: Id, result: unknown): Message => ({ jsonrpc: "2.0", id, result });
const error = (id: Id | null, code: number, message: string, data?: unknown): Message => ({ jsonrpc: "2.0", id, error: { code, message, ...(data !== undefined ? { data } : {}) } });

/** The state of one 2025-11-25 session: the agreed version, whether it is initialized, what the client declared, and what it was last told. */
export interface LegacySession {
  version: string | null;
  initialized: boolean;
  capabilities: Record<string, unknown>;
  told: Digest | null;
  /** Where its server-to-client messages go: the stdio stream, or the session's `GET` stream; null while there is none. */
  stream: Send | null;
  unsubscribe: (() => void) | null;
}

/** The state of one 2026-07-28 listen subscription: its ID (the request's), the types it opted in to, and what it was last told. */
export interface Listen { id: Id; tools: boolean; told: Digest | null; send: Send; unsubscribe: () => void; end: () => void }

export function newSession(): LegacySession {
  return { version: null, initialized: false, capabilities: {}, told: null, stream: null, unsubscribe: null };
}

/** The revision a request is served by. */
export function revisionOf(message: Message, session: LegacySession | null): "modern" | "legacy" | "none" {
  const meta = isRecord(message.params) && isRecord(message.params["_meta"]) ? message.params["_meta"] : null;
  if (meta && typeof meta[PROTOCOL_META] === "string") return "modern";
  if (message.method === "initialize" || (session?.initialized ?? false) || message.method === "notifications/initialized") return "legacy";
  return "none";
}

export class Wire {
  readonly listens = new Map<string, Listen>();
  constructor(readonly service: McpService) {}

  /** Watch the service's list for one 2025-11-25 session, while it has a stream. */
  watchLegacy(session: LegacySession): void {
    if (session.unsubscribe || !session.stream) return;
    session.unsubscribe = this.service.subscribe((generation) => {
      if (session.told === generation || !session.stream) return;
      session.told = generation;
      session.stream({ jsonrpc: "2.0", method: "notifications/tools/list_changed" });
    });
  }

  endLegacy(session: LegacySession): void {
    session.unsubscribe?.();
    session.unsubscribe = null;
    session.stream = null;
  }

  /**
   * One message. Returns the response to send, or null for a notification or
   * for a `subscriptions/listen` request, whose stream `send` carries.
   */
  async handle(message: unknown, session: LegacySession | null, send: Send): Promise<Message | null> {
    if (!isRecord(message) || message["jsonrpc"] !== "2.0") return error(null, -32600, "Invalid Request");
    const m = message as unknown as Message;
    const id = m.id ?? null;
    if (typeof m.method !== "string") return null;   // a response to a request of ours: the server makes none
    const notification = id === null || id === undefined;
    const revision = revisionOf(m, session);
    try {
      if (revision === "modern") return await this.#modern(m, notification, send);
      if (revision === "legacy") return session ? await this.#legacy(m, session, notification) : error(id, -32600, "This transport has no session for 2025-11-25.");
      if (notification) return null;
      return error(id, -32600, `Not initialized: send initialize (${LEGACY}), or name the protocol version in _meta (${MODERN}).`);
    } catch (thrown) {
      if (thrown instanceof ListRestart) return notification ? null : error(id, -32602, thrown.message, { reason: "restart", next: "Call tools/list without a cursor." });
      return notification ? null : error(id, -32603, "Internal error");
    }
  }

  async #legacy(m: Message, session: LegacySession, notification: boolean): Promise<Message | null> {
    const id = m.id as Id;
    const params = isRecord(m.params) ? m.params : {};
    switch (m.method) {
      case "initialize": {
        const asked = typeof params["protocolVersion"] === "string" ? params["protocolVersion"] : LEGACY;
        session.version = asked === LEGACY ? LEGACY : LEGACY;
        session.capabilities = isRecord(params["capabilities"]) ? params["capabilities"] : {};
        return reply(id, { protocolVersion: session.version, capabilities: { tools: { listChanged: true } }, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS });
      }
      case "notifications/initialized":
        session.initialized = true;
        this.watchLegacy(session);
        return null;
      case "notifications/cancelled": return null;
      case "ping": return notification ? null : reply(id, {});
      case "tools/list": {
        if (!session.initialized && !notification) session.initialized = session.version !== null;
        const page = await this.service.page(params["cursor"]);
        session.told = page.generation;
        return reply(id, { tools: page.tools, ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}) });
      }
      case "tools/call": {
        const result = await this.service.call(String(params["name"]), params["arguments"]);
        return reply(id, result);
      }
      default: return notification ? null : error(id, -32601, `Method not found: ${m.method}`);
    }
  }

  async #modern(m: Message, notification: boolean, send: Send): Promise<Message | null> {
    const id = m.id as Id;
    const params = isRecord(m.params) ? m.params : {};
    const meta = isRecord(params["_meta"]) ? params["_meta"] : {};
    const version = meta[PROTOCOL_META];
    if (version !== MODERN) return notification ? null : error(id, UNSUPPORTED_VERSION, `Unsupported protocol version: ${String(version)}`, { supported: [MODERN, LEGACY], requested: String(version) });
    if (m.method === "notifications/cancelled") {
      const listen = this.listens.get(JSON.stringify(params["requestId"]));
      listen?.end();
      return null;
    }
    if (notification) return null;
    if (!isRecord(meta[CAPABILITIES_META])) return error(id, -32602, `Every ${MODERN} request names the client's capabilities in _meta.`);
    const complete = (result: Record<string, unknown>): Message => reply(id, { ...result, resultType: "complete", _meta: { [SERVER_INFO_META]: SERVER_INFO } });
    switch (m.method) {
      case "server/discover":
        return complete({ supportedVersions: [MODERN, LEGACY], capabilities: { tools: { listChanged: true } }, instructions: INSTRUCTIONS, ttlMs: 0, cacheScope: "private" });
      case "tools/list": {
        const page = await this.service.page(params["cursor"]);
        return complete({ tools: page.tools, ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}), ttlMs: TOOLS_TTL_MS, cacheScope: "private" });
      }
      case "tools/call": return complete({ ...(await this.service.call(String(params["name"]), params["arguments"])) });
      case "subscriptions/listen": {
        const asked = isRecord(params["notifications"]) ? params["notifications"] : {};
        const tools = asked["toolsListChanged"] === true;
        const key = JSON.stringify(id);
        let ended = false;
        const listen: Listen = {
          id, tools, told: null, send,
          unsubscribe: () => {},
          end: () => {
            if (ended) return;
            ended = true;
            listen.unsubscribe();
            this.listens.delete(key);
            send(reply(id, { resultType: "complete", _meta: { [SUBSCRIPTION_META]: id, [SERVER_INFO_META]: SERVER_INFO } }));
          },
        };
        this.listens.set(key, listen);
        // The acknowledgement names the types the server will send: only tool list changes.
        send({ jsonrpc: "2.0", method: "notifications/subscriptions/acknowledged", params: { _meta: { [SUBSCRIPTION_META]: id }, notifications: tools ? { toolsListChanged: true } : {} } });
        if (tools) {
          // The baseline is the list as it is now; only a later change is told.
          try { listen.told = (await this.service.snapshot()).generation; } catch { listen.told = null; }
          listen.unsubscribe = this.service.subscribe((generation) => {
            if (ended || listen.told === generation) return;
            listen.told = generation;
            send({ jsonrpc: "2.0", method: "notifications/tools/list_changed", params: { _meta: { [SUBSCRIPTION_META]: id } } });
          });
        }
        return null;
      }
      default: return error(id, -32601, `Method not found: ${m.method}`);
    }
  }

  /** End a listen subscription whose stream closed: no result is sent, as for an abrupt close. */
  dropListen(id: Id): void {
    const listen = this.listens.get(JSON.stringify(id));
    if (!listen) return;
    listen.unsubscribe();
    this.listens.delete(JSON.stringify(id));
  }

  closeAll(): void {
    for (const listen of [...this.listens.values()]) { listen.unsubscribe(); }
    this.listens.clear();
  }
}
