/**
 * The two MCP wire revisions, each by its own rules (plan 031, section 7).
 * This is the minimal JSON-RPC handler that the plan allows in place of an
 * SDK when it implements each served revision's required method set in
 * full, as this does. `@modelcontextprotocol/server` 2.3.1 also implements
 * the 2026-07-28 revision, with a streamable HTTP transport that has
 * optional sessions; this handler is kept because it is witnessed against
 * the real client in both revisions over both transports, and a switch
 * would need those witnesses again (the delivery note says so).
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

import type { Digest } from "@generalbusiness/dap-contract";
import { utf8 } from "@generalbusiness/artroom-bytes";
import { INSTRUCTIONS, ListRestart, SERVER_NAME, SERVER_VERSION, type McpService } from "./service.ts";

export const LEGACY = "2025-11-25";
export const MODERN = "2026-07-28";
export const PROTOCOL_META = "io.modelcontextprotocol/protocolVersion";
export const CAPABILITIES_META = "io.modelcontextprotocol/clientCapabilities";
export const SUBSCRIPTION_META = "io.modelcontextprotocol/subscriptionId";
export const SERVER_INFO_META = "io.modelcontextprotocol/serverInfo";
/** The error a 2026-07-28 server answers for a protocol version it does not serve. */
export const UNSUPPORTED_VERSION = -32022;
/** The error a transport answers when its store admits no more session state (the hosted endpoint's control budget). */
export const SESSION_FULL = -32001;
/** The most canonical bytes a 2025-11-25 client's declared capabilities may hold. */
export const CAPABILITIES_MOST = 16 * 1024;
export const TOOLS_TTL_MS = 30_000;

export type Id = string | number;
export interface Message { jsonrpc: "2.0"; id?: Id | null; method?: string; params?: Record<string, unknown>; result?: unknown; error?: { code: number; message: string; data?: unknown } }
export type Send = (message: Message) => void;

const SERVER_INFO = { name: SERVER_NAME, version: SERVER_VERSION };
/** What 2026-07-28 adds to every result. */
const MODERN_ADDED = { resultType: "complete", _meta: { [SERVER_INFO_META]: SERVER_INFO } };
/**
 * The bytes a 2026-07-28 tool result carries beyond the service's CallResult: the members of MODERN_ADDED and one comma. The
 * response bounds hold for the CallResult, as the service makes it; a client of 2026-07-28 receives this many bytes more.
 */
export const MODERN_RESULT_EXTRA = new TextEncoder().encode(JSON.stringify(MODERN_ADDED)).length - 2 + 1;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const reply = (id: Id, result: unknown): Message => ({ jsonrpc: "2.0", id, result });
const error = (id: Id | null, code: number, message: string, data?: unknown): Message => ({ jsonrpc: "2.0", id, error: { code, message, ...(data !== undefined ? { data } : {}) } });

/**
 * One stream of a 2025-11-25 session: where its server-to-client messages go (the stdio stream, or the session's `GET` stream),
 * and `notified`, the generation last written to this stream. A stream write is not a receipt, so `notified` lives with the
 * stream, in memory, and is never persisted.
 */
export interface Stream { send: Send; notified: Digest | null; close(final: boolean): void }

/**
 * The state of one 2025-11-25 session: its ID (null on stdio), the agreed version, whether it is initialized, what the client
 * declared, and `listed`, the generation the client last listed, set by `tools/list` alone and persisted by the transport's
 * hook (`Wire.hooks.changed`) before the response is emitted. `told` was one field for both a list and a delivery; it is split.
 */
export interface LegacySession {
  id: string | null;
  created: number;
  lastActive: number;
  version: string | null;
  initialized: boolean;
  capabilities: Record<string, unknown>;
  listed: Digest | null;
  /** The session's open stream; null while there is none. */
  stream: Stream | null;
  unsubscribe: (() => void) | null;
  /** Set once the session has ended (deleted, evicted, retired, or discarded with its layer): nothing of it is persisted again. */
  ended: boolean;
}

/**
 * The state of one 2026-07-28 listen subscription: its ID (the request's), the types it opted in to, and what it was last told.
 * It belongs to the client stream it was opened on (`owner`): two clients may use the same request ID.
 */
export interface Listen { id: Id; owner: object; tools: boolean; told: Digest | null; send: Send; unsubscribe: () => void; end: () => void; closed: boolean }

/** The most characters of anything a client sent that an error repeats, and of an ID this server echoes. */
export const REFLECTED_MOST = 256;
const clip = (v: unknown): string => { const t = typeof v === "string" ? v : JSON.stringify(v) ?? String(v); return t.length > REFLECTED_MOST ? `${t.slice(0, REFLECTED_MOST)}...` : t; };

/**
 * What a frame is, by JSON-RPC 2.0's rules: a request (a method, and an ID that is a string or a number), a notification (a
 * method and no ID), a response (an ID, and a result or an error, and no method), or invalid. An ID of another type, or one longer
 * than 256 characters, is invalid: an error never echoes it.
 */
export function frameOf(v: unknown): "request" | "notification" | "response" | "invalid" {
  if (!isRecord(v) || v["jsonrpc"] !== "2.0") return "invalid";
  const hasId = Object.hasOwn(v, "id");
  const id = v["id"];
  if (hasId && !(typeof id === "number" && Number.isFinite(id)) && !(typeof id === "string" && id.length <= REFLECTED_MOST)) return "invalid";
  if (Object.hasOwn(v, "method")) {
    if (typeof v["method"] !== "string") return "invalid";
    if (v["params"] !== undefined && !isRecord(v["params"]) && !Array.isArray(v["params"])) return "invalid";
    return hasId ? "request" : "notification";
  }
  return hasId && (Object.hasOwn(v, "result") !== Object.hasOwn(v, "error")) ? "response" : "invalid";
}

/** Whether a value is a JSON-RPC 2.0 frame this server reads. Null, scalars, arrays and malformed objects are not. */
export const isFrame = (v: unknown): v is Message => frameOf(v) !== "invalid";

export function newSession(id: string | null = null): LegacySession {
  return { id, created: 0, lastActive: 0, version: null, initialized: false, capabilities: {}, listed: null, stream: null, unsubscribe: null, ended: false };
}

/** The revision a request is served by. */
export function revisionOf(message: Message, session: LegacySession | null): "modern" | "legacy" | "none" {
  const meta = isRecord(message.params) && isRecord(message.params["_meta"]) ? message.params["_meta"] : null;
  if (meta && typeof meta[PROTOCOL_META] === "string") return "modern";
  if (message.method === "initialize" || (session?.initialized ?? false) || message.method === "notifications/initialized") return "legacy";
  return "none";
}

/** The methods this server takes as notifications: those of the protocol's notifications/ namespace. */
export const isNotificationMethod = (method: string): boolean => method.startsWith("notifications/");

export class Wire {
  /** Request-only methods received as notifications, and dropped unrun. */
  ignored = 0;
  /** Open listen subscriptions, by the client stream they belong to, then by request ID. */
  readonly listens = new Map<object, Map<string, Listen>>();
  /**
   * `changed`: a session's persisted fields are about to change (issue, initialization, a listing); the transport writes the
   * row with the prospective state before the response, and the live session takes that state only once the write succeeded.
   */
  readonly hooks: { changed?: (session: LegacySession, next?: Partial<Pick<LegacySession, "initialized" | "listed">>) => void | Promise<void> } = {};
  constructor(readonly service: McpService) {}

  /**
   * Watch the service's list for one 2025-11-25 session. A stream is told of a generation once, and only while the client has
   * not listed it: a change is written to a stream when the generation differs from both the stream's `notified` and the
   * session's `listed`. The watch stays with the session; the stream it writes to is whichever the session holds now.
   */
  watchLegacy(session: LegacySession): void {
    if (session.unsubscribe) return;
    session.unsubscribe = this.service.subscribe((generation) => {
      const stream = session.stream;
      if (!stream || stream.notified === generation || session.listed === generation) return;
      stream.notified = generation;
      stream.send({ jsonrpc: "2.0", method: "notifications/tools/list_changed" });
    });
  }

  endLegacy(session: LegacySession): void {
    session.unsubscribe?.();
    session.unsubscribe = null;
    session.stream = null;
  }

  /** How many listen subscriptions are open, across every client stream. */
  get listening(): number { let n = 0; for (const of of this.listens.values()) n += of.size; return n; }

  /**
   * One message. Returns the response to send, or null for a notification or
   * for a `subscriptions/listen` request, whose stream `send` carries.
   * `owner` is the client stream the message came on: the connection on
   * stdio, the response stream of a `subscriptions/listen` over HTTP.
   */
  async handle(message: unknown, session: LegacySession | null, send: Send, owner: object = send): Promise<Message | null> {
    const kind = frameOf(message);
    if (kind === "invalid") return error(null, -32600, "Invalid Request: a JSON-RPC 2.0 request, notification or response is expected.");
    if (kind === "response") return null;   // a response to a request of ours: the server makes none
    const m = message as Message;
    const notification = kind === "notification";
    // A notification gets no reply, ever. A method that is only a request (initialize, tools/list, tools/call and the rest),
    // received as a notification, is not run: it is counted and dropped before dispatch.
    if (notification && !isNotificationMethod(m.method!)) { this.ignored++; return null; }
    const answer = await this.#dispatch(m, notification, session, send, owner);
    return notification ? null : answer;
  }

  async #dispatch(m: Message, notification: boolean, session: LegacySession | null, send: Send, owner: object): Promise<Message | null> {
    const id = m.id ?? null;
    const revision = revisionOf(m, session);
    try {
      if (revision === "modern") return await this.#modern(m, notification, send, owner);
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
        const capabilities = isRecord(params["capabilities"]) ? params["capabilities"] : {};
        // The declared capabilities are kept with the session, so they are bounded: a session is bounded control state.
        if (utf8(JSON.stringify(capabilities)).length > CAPABILITIES_MOST) return error(id, -32602, `The client's capabilities exceed ${CAPABILITIES_MOST} bytes.`);
        session.capabilities = capabilities;
        try { await this.hooks.changed?.(session); } catch (thrown) { if ((thrown as Error).name === "SessionFull" || /No room for another session/.test(String((thrown as Error).message))) return error(id, SESSION_FULL, "No room for another session."); throw thrown; }
        return reply(id, { protocolVersion: session.version, capabilities: { tools: { listChanged: true } }, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS });
      }
      case "notifications/initialized": {
        // The durable row is written with the prospective state first; the live session changes only once that succeeded. The
        // hook sees the live session, so one that ended while a request was pending is not persisted again. With no hook
        // (stdio, loopback) the live marker moves at once, before any other message of the same read is dispatched.
        const persist = this.hooks.changed;
        if (persist) await persist(session, { initialized: true });
        if (session.ended) return null;   // ended while the row was written: no live marker, no watcher
        session.initialized = true;
        this.watchLegacy(session);
        return null;
      }
      case "notifications/cancelled": return null;
      case "ping": return notification ? null : reply(id, {});
      case "tools/list": {
        // A client that lists without having sent notifications/initialized is taken as initialized; like the listed marker,
        // that is durable first: the row is written with both prospective values before either live marker moves.
        const initialized = session.initialized || (!notification && session.version !== null);
        const persist = this.hooks.changed;
        if (!persist) session.initialized = initialized;
        const page = await this.service.page(params["cursor"]);
        // The listed generation is durable: the row is written with the prospective value before the response is emitted, and
        // the live marker moves only once that write succeeded, so a failed write leaves live and durable truth the same.
        if (persist) await persist(session, { initialized, listed: page.generation });
        session.initialized = initialized;
        session.listed = page.generation;
        return reply(id, { tools: page.tools, ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}) });
      }
      case "tools/call": {
        const result = await this.service.call(String(params["name"]), params["arguments"]);
        return reply(id, result);
      }
      default: return notification ? null : error(id, -32601, `Method not found: ${clip(m.method)}`);
    }
  }

  async #modern(m: Message, notification: boolean, send: Send, owner: object): Promise<Message | null> {
    const id = m.id as Id;
    const params = isRecord(m.params) ? m.params : {};
    const meta = isRecord(params["_meta"]) ? params["_meta"] : {};
    const version = meta[PROTOCOL_META];
    if (version !== MODERN) return notification ? null : error(id, UNSUPPORTED_VERSION, "Unsupported protocol version.", { supported: [MODERN, LEGACY], requested: clip(version) });
    if (m.method === "notifications/cancelled") {
      // Only a listen of the same client stream: another client's request with the same ID is not this one.
      this.listens.get(owner)?.get(JSON.stringify(params["requestId"]))?.end();
      return null;
    }
    if (notification) return null;
    if (!isRecord(meta[CAPABILITIES_META])) return error(id, -32602, `Every ${MODERN} request names the client's capabilities in _meta.`);
    const complete = (result: Record<string, unknown>): Message => reply(id, { ...result, ...MODERN_ADDED });
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
          id, owner, tools, told: null, send, closed: false,
          unsubscribe: () => {},
          end: () => {
            if (ended) return;
            ended = true;
            listen.closed = true;
            listen.unsubscribe();
            this.#forget(owner, key);
            send(reply(id, { resultType: "complete", _meta: { [SUBSCRIPTION_META]: id, [SERVER_INFO_META]: SERVER_INFO } }));
          },
        };
        // A second listen with the same ID on the same stream replaces the first, which ends.
        this.listens.get(owner)?.get(key)?.end();
        if (!this.listens.has(owner)) this.listens.set(owner, new Map());
        this.listens.get(owner)!.set(key, listen);
        if (tools) {
          // The baseline is the list as it is now; only a later change is told. The watch runs before the acknowledgement, so no
          // change between the two is lost.
          try { listen.told = (await this.service.snapshot()).generation; } catch { listen.told = null; }
          // The stream may have closed, or the listen ended, while the snapshot was read: then no watcher is installed at all.
          if (!this.#owns(owner, key, listen)) return null;
          listen.unsubscribe = this.service.subscribe((generation) => {
            if (ended || listen.told === generation) return;
            listen.told = generation;
            send({ jsonrpc: "2.0", method: "notifications/tools/list_changed", params: { _meta: { [SUBSCRIPTION_META]: id } } });
          });
        }
        if (!this.#owns(owner, key, listen)) return null;
        // The acknowledgement names the types the server will send: only tool list changes.
        send({ jsonrpc: "2.0", method: "notifications/subscriptions/acknowledged", params: { _meta: { [SUBSCRIPTION_META]: id }, notifications: tools ? { toolsListChanged: true } : {} } });
        return null;
      }
      default: return error(id, -32601, `Method not found: ${clip(m.method)}`);
    }
  }

  /** Whether this listen is still open and still the one its stream holds under its ID. */
  #owns(owner: object, key: string, listen: Listen): boolean { return !listen.closed && this.listens.get(owner)?.get(key) === listen; }

  #forget(owner: object, key: string): void {
    const of = this.listens.get(owner);
    of?.delete(key);
    if (of && of.size === 0) this.listens.delete(owner);
  }

  /** End every listen of a client stream gracefully: each completes with its result on that stream, and its watchers are removed. */
  endStream(owner: object): void {
    for (const listen of [...(this.listens.get(owner)?.values() ?? [])]) listen.end();
    this.listens.delete(owner);
  }

  /** End every listen of a client stream that closed: no result is sent, as for an abrupt close; its watchers are removed. */
  dropStream(owner: object): void {
    for (const listen of [...(this.listens.get(owner)?.values() ?? [])]) { listen.closed = true; listen.unsubscribe(); }
    this.listens.delete(owner);
  }

  closeAll(): void {
    for (const of of this.listens.values()) for (const listen of of.values()) { listen.closed = true; listen.unsubscribe(); }
    this.listens.clear();
  }
}
