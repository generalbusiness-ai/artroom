/**
 * The HTTP layer of the MCP service, one module for the loopback server of
 * `node.ts` and for the hosted endpoint (notes/2026-10-13-hosted-mcp-endpoint.md,
 * section 3.4). It is written against the Fetch API's `Request` and
 * `Response`, so both validate the same way; each caller supplies its bearer
 * check, its body bound and, for the hosted endpoint, the persistence of a
 * session row.
 *
 * The revision is selected before the method is handled: from the
 * `MCP-Protocol-Version` header when it is present, and otherwise from the
 * request's own content (a `_meta` protocol version, or `initialize`) or from
 * the recorded version of the session the request names; the presence of
 * `Mcp-Session-Id` selects nothing by itself. Exactly `2025-11-25` and
 * `2026-07-28` are served; any other header value is refused before dispatch,
 * on every method. Then one matrix decides every method, its rows tried in
 * order:
 *
 * | Version, as selected | `POST` | `GET` | `DELETE` |
 * |---|---|---|---|
 * | header `2026-07-28` | modern rules; `_meta` must name the same version | `405`, no session consulted | `405`, nothing ended |
 * | header `2025-11-25` | legacy rules: `initialize` mints; any other request needs a session (`400` without, `404` unknown) | session required: `400` without, `404` unknown, else the stream | session required: `400` without, `404` unknown, else the session ends |
 * | header absent, `_meta` names `2026-07-28` | `400` with `-32020`: that revision requires the header | | |
 * | header absent, `initialize` | legacy, from the request's own `protocolVersion` | | |
 * | header absent, `Mcp-Session-Id` names a live session | that session's recorded version: legacy | the stream | the session ends |
 * | header absent, `Mcp-Session-Id` unknown or ended | `404` | `404` | `404` |
 * | header absent, none of the above | `400` with `-32600` | `405` | `405` |
 *
 * A `405` is decided from the header and the method alone: it opens no stream,
 * looks up no session and ends nothing, whatever `Mcp-Session-Id` carries.
 * Every error body is a JSON-RPC error with the request's `id` when one was
 * parsed and `null` otherwise; its message names a header or a rule by name,
 * never a value. Header safety is judged on the raw value as received.
 */

import type { Digest } from "@generalbusiness/dap-contract";
import { LEGACY, MODERN, PROTOCOL_META, SESSION_FULL, UNSUPPORTED_VERSION, Wire, frameOf, isFrame, isNotificationMethod, newSession, type Id, type LegacySession, type Message, type Stream } from "./wire.ts";

/** The 2026-07-28 transport's error for a header that does not match the body. */
export const HEADER_MISMATCH = -32020;
/** The most 2025-11-25 sessions one server holds; a 17th `initialize` ends the oldest. */
export const SESSIONS_MOST = 16;
/** Legacy HTTP sessions expire after 30 minutes without a client request, checked on the next authenticated legacy request. */
export const SESSION_IDLE_MS = 30 * 60 * 1000;
/** The most open streams one server holds, legacy streams and modern listens together; a 5th is refused `409`. */
export const STREAMS_MOST = 4;
export const SERVED: readonly string[] = [MODERN, LEGACY];
const TOO_MANY_STREAMS = -32001;
/** The most canonical bytes a 2025-11-25 client's declared capabilities may hold: a session row is bounded control state. */
export const CAPABILITIES_BYTES = 16 * 1024;
/** Thrown by a transport's `persist` when its store admits no more session state; the session is not issued. */
export class SessionFull extends Error { constructor() { super("No room for another session."); this.name = "SessionFull"; } }

/** A 2025-11-25 session as it is persisted: what survives eviction. Its open stream does not. */
export interface SessionRow { id: string; version: string | null; initialized: boolean; capabilities: Record<string, unknown>; listed: Digest | null; created: number; lastActive?: number }

export interface HttpPort {
  wire: Wire;
  /** The most bytes of one request body. */
  bodyBytes: number;
  /** Whether the `Authorization` header is the expected bearer. Compared in constant time by the caller. */
  authorized(authorization: string | null): boolean | Promise<boolean>;
  /** A fresh session ID. */
  mintSession(): string;
  /** Called with a session's row after issue, initialization, a listing or client activity. Awaited before the response. */
  persist?(row: SessionRow): void | Promise<void>;
  /** Called when a session ends. */
  remove?(id: string): void | Promise<void>;
  now?(): number;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const rpcError = (id: Id | null, code: number, message: string, data?: unknown): Message => ({ jsonrpc: "2.0", id, error: { code, message, ...(data !== undefined ? { data } : {}) } });
const json = (status: number, message: Message, headers: Record<string, string> = {}): Response => new Response(JSON.stringify(message), { status, headers: { "content-type": "application/json", ...headers } });
const bare = (status: number, headers: Record<string, string> = {}): Response => new Response(null, { status, headers });
const notAllowed = (): Response => bare(405, { allow: "POST" });
const unsupported = (id: Id | null): Message => rpcError(id, UNSUPPORTED_VERSION, "Unsupported protocol version.", { supported: SERVED });
const SSE = { "content-type": "text/event-stream", "cache-control": "no-cache" };

/** Whether a raw header value is safe: visible ASCII, space and tab only. */
export const safeHeader = (value: string): boolean => /^[\x20-\x7e\t]*$/.test(value);
const SENTINEL = /^=\?base64\?([A-Za-z0-9+/]*={0,2})\?=$/;

/** An `Mcp-Name` value: the name itself, or the UTF-8 of its `=?base64?…?=` sentinel; null when the sentinel does not decode. */
export function decodeName(value: string): string | null {
  const m = SENTINEL.exec(value);
  if (!m) return value;
  try {
    const text = atob(m[1]!);
    const bytes = Uint8Array.from(text, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch { return null; }
}

export const rowOf = (session: LegacySession): SessionRow =>
  ({ id: session.id!, version: session.version, initialized: session.initialized, capabilities: session.capabilities, listed: session.listed, created: session.created, lastActive: session.lastActive });

type Body = { status: "ok"; value: unknown } | { status: "too-large" } | { status: "parse" };

/** The server's HTTP layer over one `Wire`. One instance per server: the loopback process, or one hosted agent. */
export class McpHttp {
  /** The 2025-11-25 sessions, oldest first. */
  readonly sessions = new Map<string, LegacySession>();
  /**
   * Every holder of a stream slot: each listen stream by its owner, and each 2025-11-25 session that has a live stream or an
   * opening pending. A session holds one slot however many replacements of its stream are being opened at once, so live
   * capacity has one owner across generations; the count is taken before any await.
   */
  readonly #open = new Set<object>();
  /** The listen streams by their owner, so a graceful ending can complete each one. */
  readonly #listens = new Map<object, { end: (final: boolean) => void }>();
  /** How many openings of a session's stream are pending: the session keeps its slot until the last of them exits with no stream. */
  readonly #pending = new Map<LegacySession, number>();
  // Prospective Wire markers and activity updates share the last committed row, not the possibly older live markers.
  readonly #rows = new WeakMap<LegacySession, SessionRow>();
  // Removal follows in-flight writes; once ended, queued updates skip the write. Weak keys retain no ended-session registry.
  readonly #writes = new WeakMap<LegacySession, Promise<void>>();
  constructor(readonly port: HttpPort) {
    // Issuance persists a new session; an update persists only a session that is still live. One that ended while its request
    // was pending (deleted, evicted, retired, or discarded with its layer) is never written again: an ended session's row stays
    // gone, and a restart restores nothing of it.
    port.wire.hooks.changed = (session, next) => this.#persist(session, next);
  }

  #queue(session: LegacySession, work: () => void | Promise<void>): Promise<void> {
    const pending = (this.#writes.get(session) ?? Promise.resolve()).then(work);
    this.#writes.set(session, pending.catch(() => {}));
    return pending;
  }

  #persist(session: LegacySession, next: Partial<SessionRow> = {}): Promise<void> {
    if (session.id === null || session.ended) return Promise.resolve();
    return this.#queue(session, async () => {
      if (session.ended) return;
      const previous = this.#rows.get(session) ?? rowOf(session);
      const row = { ...previous, ...next };
      row.lastActive = Math.max(previous.lastActive ?? previous.created, row.lastActive ?? row.created);
      await this.port.persist?.(row);
      this.#rows.set(session, row);
    });
  }

  async #touch(session: LegacySession): Promise<boolean> {
    const lastActive = Math.max(session.lastActive, this.port.now?.() ?? Date.now());
    if (lastActive !== session.lastActive) await this.#persist(session, { lastActive });
    if (session.ended) return false;
    session.lastActive = Math.max(session.lastActive, lastActive);
    return true;
  }

  async #expire(): Promise<void> {
    const now = this.port.now?.() ?? Date.now();
    for (const session of [...this.sessions.values()]) {
      if (now - session.lastActive >= SESSION_IDLE_MS) await this.#end(session, true);
    }
  }

  /** How many streams are open: legacy streams and modern listens together. */
  get streams(): number { return this.#open.size; }

  /** The sessions as persisted, at the object's start. Their streams are gone: the next `GET` reconciles. */
  restore(rows: readonly SessionRow[]): void {
    for (const row of [...rows].sort((a, b) => a.created - b.created)) {
      const session = newSession(row.id);
      session.version = row.version;
      session.initialized = row.initialized;
      session.capabilities = row.capabilities;
      session.listed = row.listed;
      session.created = row.created;
      session.lastActive = row.lastActive ?? row.created;
      this.#rows.set(session, { ...row, lastActive: session.lastActive });
      this.sessions.set(row.id, session);
      if (session.initialized) this.port.wire.watchLegacy(session);
    }
  }

  async handle(request: Request): Promise<Response> {
    if (request.headers.get("origin") !== null) return bare(403);
    if (!(await this.port.authorized(request.headers.get("authorization")))) return bare(401);
    const method = request.method;
    const header = request.headers.get("mcp-protocol-version");
    const sessionId = request.headers.get("mcp-session-id");
    if (method === "GET" || method === "DELETE") {
      // No frame: a header that is not served is -32600 with a null id.
      if (header !== null && !SERVED.includes(header)) return json(400, rpcError(null, -32600, "MCP-Protocol-Version is not a served revision."));
      if (header === MODERN) return notAllowed();
      if (sessionId === null) return header === LEGACY ? json(400, rpcError(null, -32600, "Mcp-Session-Id is required.")) : notAllowed();
      await this.#expire();
      const session = this.sessions.get(sessionId);
      if (!session) return bare(404);
      if (method === "GET" && !(await this.#touch(session))) return bare(404);
      return method === "GET" ? this.#stream(session, request.signal) : this.#end(session, true);
    }
    if (method !== "POST") return notAllowed();
    const body = await this.#body(request);
    if (body.status === "too-large") return bare(413);
    if (body.status === "parse") return json(400, rpcError(null, -32700, "Parse error"));
    const message = body.value;
    if (Array.isArray(message)) return json(400, rpcError(null, -32600, "Batches are not served."));
    if (!isFrame(message)) return json(400, rpcError(null, -32600, "Invalid Request: a JSON-RPC 2.0 request or notification is expected."));
    const m = message;
    const id = m.id ?? null;
    const meta = isRecord(m.params) && isRecord(m.params["_meta"]) ? m.params["_meta"] : null;
    const named = meta && typeof meta[PROTOCOL_META] === "string" ? meta[PROTOCOL_META] : null;
    if (header !== null && !SERVED.includes(header)) return json(400, unsupported(id));
    let revision: "modern" | "legacy";
    if (header === MODERN) revision = "modern";
    else if (header === LEGACY) revision = "legacy";
    else if (named !== null) return named === MODERN ? json(400, rpcError(id, HEADER_MISMATCH, "MCP-Protocol-Version is required.")) : json(400, unsupported(id));
    else if (m.method === "initialize") revision = "legacy";
    else if (sessionId !== null) { if (!this.sessions.has(sessionId)) return bare(404); revision = "legacy"; }
    else return json(400, rpcError(id, -32600, `Not initialized: send initialize (${LEGACY}), or name the protocol version in _meta (${MODERN}).`));
    // Version consistency, in both directions, before anything is dispatched.
    if (revision === "modern" && named !== MODERN) return json(400, rpcError(id, HEADER_MISMATCH, "MCP-Protocol-Version and _meta's protocol version differ."));
    if (revision === "legacy" && named !== null) return json(400, rpcError(id, HEADER_MISMATCH, "MCP-Protocol-Version and _meta's protocol version differ."));
    const notification = frameOf(m) === "notification";
    // A notification is accepted with 202 and no body. One whose method is only a request runs nothing and issues no session.
    if (notification && !isNotificationMethod(m.method!)) { this.port.wire.ignored++; return bare(202); }
    return revision === "modern" ? this.#modern(m, notification, request) : this.#legacy(m, notification, sessionId);
  }

  async #body(request: Request): Promise<Body> {
    if (Number(request.headers.get("content-length") ?? 0) > this.port.bodyBytes) return { status: "too-large" };
    if (!request.body) return { status: "parse" };
    try {
      const reader = request.body.getReader();
      const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });
      let text = "";
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > this.port.bodyBytes) { await reader.cancel(); return { status: "too-large" }; }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
      return { status: "ok", value: JSON.parse(text) };
    } catch { return { status: "parse" }; }
  }

  async #modern(m: Message, notification: boolean, request: Request): Promise<Response> {
    const id = m.id ?? null;
    const methodHeader = request.headers.get("mcp-method");
    if (methodHeader === null || !safeHeader(methodHeader) || methodHeader !== m.method) return json(400, rpcError(id, HEADER_MISMATCH, "Mcp-Method must name the request's method."));
    if (m.method === "tools/call") {
      const name = request.headers.get("mcp-name");
      const params = isRecord(m.params) ? m.params : {};
      const decoded = name !== null && safeHeader(name) ? decodeName(name) : null;
      if (decoded === null || decoded !== params["name"]) return json(400, rpcError(id, HEADER_MISMATCH, "Mcp-Name must name the tool."));
    }
    if (m.method === "subscriptions/listen" && !notification) {
      if (this.#open.size >= STREAMS_MOST) return json(409, rpcError(id, TOO_MANY_STREAMS, `At most ${STREAMS_MOST} streams are open at once.`));
      return this.#listen(m);
    }
    const response = await this.port.wire.handle(m, null, () => {});
    if (!response) return bare(202);
    return json(response.error?.code === -32601 ? 404 : 200, response);
  }

  async #legacy(m: Message, notification: boolean, sessionId: string | null): Promise<Response> {
    const id = m.id ?? null;
    await this.#expire();
    let session: LegacySession;
    let issued: string | null = null;
    if (m.method === "initialize" && !notification) {
      // The new session is admitted first (its capabilities validated and its row kept) and only then does a 17th end the
      // oldest: a refused initialize destroys nothing, and the limit holds once the newcomer is in.
      issued = this.port.mintSession();
      session = newSession(issued);
      session.created = this.port.now?.() ?? Date.now();
      session.lastActive = session.created;
    } else {
      if (sessionId === null) return json(400, rpcError(id, -32600, "Mcp-Session-Id is required."));
      const matched = this.sessions.get(sessionId);
      if (!matched) return bare(404);
      session = matched;
      if (!(await this.#touch(session))) return bare(404);
    }
    const response = await this.port.wire.handle(m, session, (out) => session.stream?.send(out));
    if (issued) {
      // Refused: no session was issued, nothing of it stays, and a row the hook may have kept is removed. A store that could
      // not keep it answers 507.
      if (response?.error) { session.ended = true; this.port.wire.endLegacy(session); await this.port.remove?.(issued); return json(response.error.code === SESSION_FULL ? 507 : 200, response); }
      this.sessions.set(issued, session);
      while (this.sessions.size > SESSIONS_MOST) {
        const oldest = this.sessions.keys().next().value!;
        if (oldest === issued) break;
        await this.#end(this.sessions.get(oldest)!, true);
      }
    }
    if (!response) return bare(202);
    return json(200, response, issued ? { "mcp-session-id": issued } : {});
  }

  /** One server-sent event stream. `onCancel` runs when the client goes away. */
  #sse(onCancel: () => void): { body: ReadableStream<Uint8Array>; send: (text: string) => void; close: () => void } {
    const encoder = new TextEncoder();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    let closed = false;
    const body = new ReadableStream<Uint8Array>({ start: (c) => { controller = c; }, cancel: () => { closed = true; onCancel(); } });
    return {
      body,
      send: (text) => { if (closed) return; try { controller.enqueue(encoder.encode(text)); } catch { closed = true; } },
      close: () => { if (closed) return; closed = true; try { controller.close(); } catch { /* already gone */ } },
    };
  }

  /**
   * The 2025-11-25 session's stream. A second `GET` replaces the first, which closes without detaching its replacement. The
   * session owns its one slot from the moment an opening is admitted, across every opening pending for it and the stream it
   * holds, until it has no stream and no opening pending: a fresh open takes the session's slot or is refused, a replacement
   * takes nothing new, the incumbent's cancellation during a pending opening frees nothing, and however many replacements
   * overlap and abort in whatever order, a session with a live stream is counted exactly once.
   */
  async #stream(session: LegacySession, signal?: AbortSignal): Promise<Response> {
    const fresh = session.stream === null && !this.#pending.has(session);
    if (fresh && this.#open.size >= STREAMS_MOST) return json(409, rpcError(null, TOO_MANY_STREAMS, `At most ${STREAMS_MOST} streams are open at once.`));
    this.#open.add(session);
    this.#pending.set(session, (this.#pending.get(session) ?? 0) + 1);
    // Every exit of this opening: the session keeps its slot while it has a live stream or another opening pending.
    const exit = () => {
      const left = (this.#pending.get(session) ?? 1) - 1;
      if (left > 0) this.#pending.set(session, left); else this.#pending.delete(session);
      if (left === 0 && session.stream === null) this.#open.delete(session);
    };
    // Reconciliation before the stream is attached: a change made while no stream was open, or while the object was evicted, is
    // told once now, unless the client has listed since.
    let generation: Digest | null = null;
    try { generation = (await this.port.wire.service.snapshot()).generation; } catch { generation = null; }
    // The session may have ended, the layer been discarded, or the client gone, while the snapshot was read: then no stream opens.
    if (session.ended || (session.id !== null && !this.sessions.has(session.id))) { exit(); return bare(404); }
    if (signal?.aborted) { exit(); return bare(204); }
    const old = session.stream;
    const sse = this.#sse(() => { if (session.stream === stream) { this.port.wire.endLegacy(session); if (!this.#pending.has(session)) this.#open.delete(session); } });
    const stream: Stream = {
      notified: null,
      send: (message) => sse.send(`event: message\ndata: ${JSON.stringify(message)}\n\n`),
      close: (final) => { if (final) sse.send("event: end\ndata: {}\n\n"); sse.close(); },
    };
    session.stream = stream;
    if (old) old.close(false);   // its cancellation finds another stream on the session, and releases nothing
    exit();
    sse.send(": stream\n\n");
    // A session that has listed is told once of a generation it has not listed; one that never listed has nothing to reconcile.
    if (generation !== null) {
      stream.notified = generation;
      if (session.listed !== null && generation !== session.listed) stream.send({ jsonrpc: "2.0", method: "notifications/tools/list_changed" });
    }
    this.port.wire.watchLegacy(session);
    return new Response(sse.body, { status: 200, headers: SSE });
  }

  /**
   * A 2026-07-28 listen: its own stream, ended by the client, by the subscription's end, or by the server. A graceful ending
   * completes the subscription (its result, as the revision defines) and closes the body; an abrupt one sends nothing.
   */
  #listen(m: Message): Response {
    const owner = {};
    const sse = this.#sse(() => { this.#open.delete(owner); this.#listens.delete(owner); this.port.wire.dropStream(owner); });
    this.#open.add(owner);
    const send = (out: Message) => {
      sse.send(`event: message\ndata: ${JSON.stringify(out)}\n\n`);
      if (out.id !== undefined && (out.result !== undefined || out.error !== undefined)) { sse.close(); this.#open.delete(owner); this.#listens.delete(owner); }
    };
    this.#listens.set(owner, {
      end: (final) => {
        if (final) this.port.wire.endStream(owner);   // each listen completes with its result, written to this stream
        else this.port.wire.dropStream(owner);
        sse.close();
        this.#open.delete(owner);
        this.#listens.delete(owner);
      },
    });
    this.port.wire.handle(m, null, send, owner).then((response) => { if (response) send(response); }, () => send(rpcError(m.id ?? null, -32603, "Internal error")));
    return new Response(sse.body, { status: 200, headers: SSE });
  }

  /** End a session gracefully: its stream closes with a final event, and its row is removed. */
  async #end(session: LegacySession, final: boolean): Promise<Response> {
    const stream = session.stream;
    session.ended = true;
    this.port.wire.endLegacy(session);
    if (stream) stream.close(final);
    if (!this.#pending.has(session)) this.#open.delete(session);   // a pending opening of it exits 404 and releases the slot then
    if (session.id !== null) { this.sessions.delete(session.id); await this.#queue(session, () => this.port.remove?.(session.id!)); }
    return bare(200);
  }

  /**
   * End every stream abruptly, as an eviction or an exception does: the bodies end with no event, and the session rows stay.
   * The layer is discarded with its sessions: a request of it still pending persists nothing more, and the rows as they are
   * restore into the next layer.
   */
  abrupt(): void {
    for (const session of this.sessions.values()) {
      const stream = session.stream;
      session.ended = true;
      this.port.wire.endLegacy(session);
      if (stream) stream.close(false);
    }
    this.#pending.clear();
    for (const listen of [...this.#listens.values()]) listen.end(false);
    this.#open.clear();
  }

  /** End every session and stream gracefully: `retire`, `bearer`, a server's close. Legacy streams get a final event; listens their result. */
  async closeAll(): Promise<void> {
    for (const session of [...this.sessions.values()]) await this.#end(session, true);
    for (const listen of [...this.#listens.values()]) listen.end(true);
    this.port.wire.closeAll();
    this.#open.clear();
  }
}
