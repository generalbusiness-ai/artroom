/**
 * The server under Node: the two transports and the custody store on files.
 *
 * - **stdio** (`artroom mcp`): one implicit connection. Each line is one
 *   JSON-RPC message. The first request says which revision the client
 *   speaks.
 * - **streamable HTTP on loopback** (`artroom mcp --http 127.0.0.1:<port>`):
 *   a signing boundary, guarded as one. It binds a loopback address only;
 *   refuses any request that carries an `Origin` header, since no browser
 *   origin is a client of a signing server; requires a per-launch bearer,
 *   printed once to the launching host's standard error; and answers 401 or
 *   403 with no body detail.
 * - **custody on files** under `ARTROOM_HOME/private/mcp-custody/`, owner
 *   only: one file per record, an exclusive lock file per identity, a
 *   temporary write renamed into place and read back, an append-only
 *   segment of outcomes per record, and append-only archive files with an
 *   index that is rewritten whole and renamed.
 */

import { appendFileSync, chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, readSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import { canonicalize, timeMs } from "@generalbusiness/artroom-bytes";
import type { Signer, Fetch } from "@generalbusiness/artroom-client";
import { TERMINAL, type CustodyRecord, type CustodyStore, type Outcome } from "./custody.ts";
import type { ConfigPort } from "./inventory.ts";
import { McpService } from "./service.ts";
import type { Mode } from "./catalogue.ts";
import { Wire, newSession, revisionOf, type LegacySession, type Message } from "./wire.ts";

// ---------------------------------------------------------------- custody on files

export interface FileStoreBounds {
  /** Terminal records kept as files before the oldest are archived. */
  terminalMost: number;
  /** Days a terminal record is kept as a file before it is archived. */
  ageDays: number;
  /** The most bytes of one archive file. */
  archiveBytes: number;
}
export const FILE_STORE_BOUNDS: FileStoreBounds = { terminalMost: 1024, ageDays: 30, archiveBytes: 64 * 1024 * 1024 };

/** The custody store under `dir` (`ARTROOM_HOME/private/mcp-custody`). `now` is the clock of a test. */
export function fileStore(dir: string, bounds: FileStoreBounds = FILE_STORE_BOUNDS, now: () => number = Date.now): CustodyStore & { archived(): number } {
  const records = join(dir, "records"), locks = join(dir, "locks"), segments = join(dir, "segments"), archives = join(dir, "archive");
  const ensure = () => {
    for (const d of [dir, records, locks, segments, archives]) { mkdirSync(d, { recursive: true, mode: 0o700 }); chmodSync(d, 0o700); }
  };
  const id = (name: string) => { if (!/^[0-9a-f]{64}$/.test(name)) throw new Error("not a record name"); return name; };
  const recordPath = (name: string) => join(records, `${id(name)}.json`);
  const indexPath = join(archives, "index.json");
  /** Whole file, owner-only, through a temporary name; then read back and compared. */
  const atomic = (path: string, text: string) => {
    const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
    writeFileSync(temporary, text, { mode: 0o600, flag: "wx" });
    renameSync(temporary, path);
    if (readFileSync(path, "utf8") !== text) throw new Error(`${path} read back differs`);
  };
  type Index = Record<string, { file: string; offset: number; length: number }>;
  const index = (): Index => (existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, "utf8")) as Index : {});
  const alive = (pid: number): boolean => { try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === "EPERM"; } };
  const live = (): { name: string; record: CustodyRecord }[] => readdirSync(records).filter((f) => /^[0-9a-f]{64}\.json$/.test(f))
    .map((f) => ({ name: f.slice(0, 64), record: JSON.parse(readFileSync(join(records, f), "utf8")) as CustodyRecord }));

  /** Move the oldest terminal records into the archive: past the count, or past the age. Unresolved records are never moved. */
  const archive = () => {
    const terminal = live().filter((r) => TERMINAL.has(r.record.phase)).sort((a, b) => (a.record.updated < b.record.updated ? -1 : 1));
    const old = now() - bounds.ageDays * 86_400_000;
    const moving = terminal.filter((r, i) => i < terminal.length - bounds.terminalMost || (timeMs(r.record.updated) ?? now()) < old);
    if (moving.length === 0) return;
    const table = index();
    for (const { name } of moving) {
      const text = readFileSync(recordPath(name), "utf8");
      const bytes = Buffer.byteLength(text) + 1;
      let n = 0;
      while (existsSync(join(archives, `archive-${n}.jsonl`)) && statSync(join(archives, `archive-${n}.jsonl`)).size + bytes > bounds.archiveBytes) n++;
      const file = `archive-${n}.jsonl`;
      const path = join(archives, file);
      const offset = existsSync(path) ? statSync(path).size : 0;
      appendFileSync(path, `${text}\n`, { mode: 0o600 });
      table[name] = { file, offset, length: bytes - 1 };
      atomic(indexPath, JSON.stringify(table));
      unlinkSync(recordPath(name));
    }
  };

  return {
    archived: () => Object.keys(index()).length,
    lock: async (name, notAfter) => {
      ensure();
      const path = join(locks, `${id(name)}.lock`);
      const take = (): boolean => {
        try { writeFileSync(path, JSON.stringify({ pid: process.pid, time: new Date(now()).toISOString(), notAfter }), { mode: 0o600, flag: "wx" }); return true; }
        catch (e) { if ((e as NodeJS.ErrnoException).code === "EEXIST") return false; throw e; }
      };
      if (!take()) {
        // A lock is broken only when its process is gone and its time is older than the intent's deadline.
        try {
          const held = JSON.parse(readFileSync(path, "utf8")) as { pid: number; time: string; notAfter: string };
          if (!alive(held.pid) && (timeMs(held.time) ?? 0) < (timeMs(held.notAfter) ?? 0) && now() > (timeMs(held.notAfter) ?? Infinity)) { unlinkSync(path); if (!take()) return null; }
          else return null;
        } catch { return null; }
      }
      return async () => { try { unlinkSync(path); } catch { /* already gone */ } };
    },
    read: async (name) => {
      ensure();
      const path = recordPath(name);
      if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8")) as CustodyRecord;
      // A lookup reads the index, never scans the archive.
      const at = index()[name];
      if (!at) return null;
      const fd = openSync(join(archives, at.file), "r");
      try { const buffer = Buffer.alloc(at.length); readSync(fd, buffer, 0, at.length, at.offset); return JSON.parse(buffer.toString("utf8")) as CustodyRecord; }
      finally { closeSync(fd); }
    },
    write: async (name, record) => {
      ensure();
      atomic(recordPath(name), canonicalize(record));
      // An archived record that is written again lives as a file again; the index entry is dropped.
      const table = index();
      if (table[name]) { delete table[name]; atomic(indexPath, JSON.stringify(table)); }
      if (TERMINAL.has(record.phase)) archive();
    },
    unresolved: async () => { ensure(); return live().filter((r) => !TERMINAL.has(r.record.phase)).sort((a, b) => (a.record.created < b.record.created ? -1 : 1)).map((r) => ({ id: r.name, key: r.record.identity.key, created: r.record.created })); },
    segment: async (name, outcomes) => { ensure(); appendFileSync(join(segments, `${id(name)}.jsonl`), outcomes.map((o) => `${JSON.stringify(o)}\n`).join(""), { mode: 0o600 }); },
    segmented: async (name) => {
      const path = join(segments, `${id(name)}.jsonl`);
      return existsSync(path) ? readFileSync(path, "utf8").split("\n").filter((l) => l.length > 0).map((l) => JSON.parse(l) as Outcome) : [];
    },
  };
}

// ---------------------------------------------------------------- stdio

/** Serve over standard input and output. Resolves when the input ends. */
export function serveStdio(service: McpService, input: NodeJS.ReadableStream = process.stdin, output: NodeJS.WritableStream = process.stdout): Promise<void> {
  const wire = new Wire(service);
  const session: LegacySession = newSession();
  const write = (message: Message) => { output.write(`${JSON.stringify(message)}\n`); };
  session.stream = write;
  let buffer = "";
  const pending: Promise<void>[] = [];
  return new Promise((resolve) => {
    input.setEncoding?.("utf8");
    input.on("data", (chunk: string | Buffer) => {
      buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      for (let at = buffer.indexOf("\n"); at >= 0; at = buffer.indexOf("\n")) {
        const line = buffer.slice(0, at).trim();
        buffer = buffer.slice(at + 1);
        if (line.length === 0) continue;
        let message: unknown;
        try { message = JSON.parse(line); } catch { write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); continue; }
        pending.push(wire.handle(message, session, write).then((response) => { if (response) write(response); }));
      }
    });
    input.on("end", () => { void Promise.allSettled(pending).then(() => { wire.endLegacy(session); wire.closeAll(); resolve(); }); });
  });
}

// ---------------------------------------------------------------- loopback HTTP

const LOOPBACK = /^(127\.\d{1,3}\.\d{1,3}\.\d{1,3}|::1|\[::1\])$/;
const BODY_BYTES = 4 * 1024 * 1024;

export interface HttpServing { server: Server; url: string; bearer: string; close(): Promise<void> }

/** Whether an address is loopback: 127.0.0.0/8 or ::1. A name such as `localhost` is not taken: it may resolve elsewhere. */
export function isLoopback(host: string): boolean { return LOOPBACK.test(host); }

/**
 * Serve streamable HTTP at `http://<host>:<port>/mcp`. Refuses a host that is
 * not loopback before anything listens. The bearer is made here and given
 * once to `announce`, which the command writes to standard error.
 */
export async function serveHttp(service: McpService, host: string, port: number, announce: (line: string) => void = (line) => process.stderr.write(`${line}\n`)): Promise<HttpServing> {
  if (!isLoopback(host)) throw new Error(`${host} is not a loopback address; the server binds 127.0.0.1 or ::1 only.`);
  const bearer = randomBytes(32).toString("base64url");
  const expected = Buffer.from(`Bearer ${bearer}`);
  const wire = new Wire(service);
  const sessions = new Map<string, LegacySession>();
  const bare = (res: ServerResponse, status: number) => { res.writeHead(status); res.end(); };

  const server = createServer((req, res) => { void handle(req, res); });
  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Origin: no browser origin is a client of a signing server.
    if (req.headers["origin"] !== undefined) return bare(res, 403);
    const given = Buffer.from(String(req.headers["authorization"] ?? ""));
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return bare(res, 401);
    if (new URL(req.url ?? "/", "http://loopback").pathname !== "/mcp") return bare(res, 404);
    const sessionId = typeof req.headers["mcp-session-id"] === "string" ? req.headers["mcp-session-id"] : null;
    if (req.method === "DELETE") {
      const session = sessionId ? sessions.get(sessionId) : undefined;
      if (!session || !sessionId) return bare(res, 404);
      wire.endLegacy(session);
      sessions.delete(sessionId);
      return bare(res, 200);
    }
    if (req.method === "GET") {
      // The 2025-11-25 session's stream. A 2026-07-28 client opens none: its stream is subscriptions/listen.
      if (!sessionId) return bare(res, 405);
      const session = sessions.get(sessionId);
      if (!session) return bare(res, 404);
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      res.write(": stream\n\n");
      session.stream = (message) => { res.write(`event: message\ndata: ${JSON.stringify(message)}\n\n`); };
      wire.watchLegacy(session);
      req.on("close", () => { if (sessions.get(sessionId) === session) wire.endLegacy(session); });
      return;
    }
    if (req.method !== "POST") return bare(res, 405);
    let body = "";
    let size = 0;
    for await (const chunk of req) { size += (chunk as Buffer).length; if (size > BODY_BYTES) return bare(res, 413); body += (chunk as Buffer).toString("utf8"); }
    let message: unknown;
    try { message = JSON.parse(body); } catch { res.writeHead(400, { "content-type": "application/json" }); res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })); return; }
    if (Array.isArray(message)) { res.writeHead(400, { "content-type": "application/json" }); res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Batches are not served." } })); return; }
    const m = message as Message;
    const revision = revisionOf(m, sessionId ? sessions.get(sessionId) ?? null : null);
    if (revision === "modern" || (revision === "none" && !sessionId && m.method !== "initialize")) {
      if (m.method === "subscriptions/listen") {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
        const send = (out: Message) => { res.write(`event: message\ndata: ${JSON.stringify(out)}\n\n`); if (out.id !== undefined && (out.result !== undefined || out.error !== undefined)) res.end(); };
        req.on("close", () => { if (m.id !== undefined && m.id !== null) wire.dropListen(m.id); });
        const response = await wire.handle(m, null, send);
        if (response) send(response);
        return;
      }
      const response = await wire.handle(m, null, () => {});
      if (!response) return bare(res, 202);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(response));
      return;
    }
    // 2025-11-25: initialize issues the session; every later request names it, and an unknown one is answered 404.
    let session: LegacySession | undefined;
    let issued: string | null = null;
    if (m.method === "initialize") {
      issued = randomUUID();
      session = newSession();
      sessions.set(issued, session);
    } else {
      if (!sessionId) return bare(res, 400);
      session = sessions.get(sessionId);
      if (!session) return bare(res, 404);
    }
    const response = await wire.handle(m, session, (out) => session!.stream?.(out));
    if (!response) return bare(res, 202);
    res.writeHead(200, { "content-type": "application/json", ...(issued ? { "mcp-session-id": issued } : {}) });
    res.end(JSON.stringify(response));
  }

  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, host.replace(/^\[|\]$/g, ""), () => resolve()); });
  const address = server.address();
  const actual = typeof address === "object" && address ? address.port : port;
  const url = `http://${host.includes(":") && !host.startsWith("[") ? `[${host}]` : host}:${actual}/mcp`;
  announce(`artroom mcp: serving ${url}; bearer (shown once): ${bearer}`);
  return {
    server, url, bearer,
    close: () => new Promise<void>((resolve) => {
      for (const session of sessions.values()) wire.endLegacy(session);
      wire.closeAll();
      server.closeAllConnections?.();
      server.close(() => resolve());
    }),
  };
}

// ---------------------------------------------------------------- the command

export interface ServeOptions {
  service: string;
  signer: Signer;
  config: ConfigPort;
  /** `ARTROOM_HOME`: custody lives under its `private/mcp-custody/`. */
  home: string;
  mode: Mode;
  tools: readonly string[] | null;
  http: { host: string; port: number } | null;
  fetch?: Fetch;
}

/** `artroom mcp`: serve over stdio, or over loopback HTTP. Resolves when stdio ends; an HTTP server serves until the process ends. */
export async function serve(options: ServeOptions): Promise<void> {
  const service = new McpService({
    service: options.service, signer: options.signer, config: options.config, custody: fileStore(join(options.home, "private", "mcp-custody")),
    mode: options.mode, tools: options.tools, ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  if (options.http) {
    await serveHttp(service, options.http.host, options.http.port);
    await new Promise<void>(() => {});
  }
  await serveStdio(service);
}
