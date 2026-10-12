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
 *   temporary write renamed into place and read back, a segment of outcomes
 *   per record with an index of line ends, and archive files with an index.
 *   Archival is one transaction under an archive lease: the archive file is
 *   written whole under a temporary name and renamed, then the index, and
 *   only then are the live records removed. Admission against the capacity
 *   runs under a capacity lease. A lease or a lock is broken only when the
 *   process that took it is gone.
 */

import { appendFileSync, chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, readSync, renameSync, statSync, truncateSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import { canonicalize, timeMs } from "@generalbusiness/artroom-bytes";
import type { Signer, Fetch } from "@generalbusiness/artroom-client";
import { CustodyError, TERMINAL, type CustodyRecord, type CustodyStore, type Outcome } from "./custody.ts";
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
  /** A test's fault injection: called at each named point of an archival, where a crash may come. */
  fault?: (point: "archive-written" | "index-published") => void;
}
export const FILE_STORE_BOUNDS: FileStoreBounds = { terminalMost: 1024, ageDays: 30, archiveBytes: 64 * 1024 * 1024 };

/** How long admission waits for the capacity lease before it says the store is locked. */
const LEASE_WAIT_MS = 10_000;

const alive = (pid: number): boolean => { try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === "EPERM"; } };

/**
 * Take a lock file: created exclusively, holding the process and the time. A file whose process is gone is broken and taken;
 * one whose process lives is not. Its time and any deadline it records decide nothing: expiry is never an outcome.
 */
function takeFile(path: string, body: Record<string, unknown>): boolean {
  const take = (): boolean => {
    try { writeFileSync(path, JSON.stringify({ pid: process.pid, ...body }), { mode: 0o600, flag: "wx" }); return true; }
    catch (e) { if ((e as NodeJS.ErrnoException).code === "EEXIST") return false; throw e; }
  };
  if (take()) return true;
  let held: { pid?: unknown } | null = null;
  try { held = JSON.parse(readFileSync(path, "utf8")) as { pid?: unknown }; } catch { held = null; }
  // A file being written has no body yet: its taker lives. Only a whole file naming a process that is gone is broken.
  if (!held || typeof held.pid !== "number" || alive(held.pid)) return false;
  try { unlinkSync(path); } catch { /* another broke it first */ }
  return take();
}

/** The custody store under `dir` (`ARTROOM_HOME/private/mcp-custody`). `now` is the clock of a test. */
export function fileStore(dir: string, bounds: FileStoreBounds = FILE_STORE_BOUNDS, now: () => number = Date.now): CustodyStore & { archived(): number } {
  const records = join(dir, "records"), locks = join(dir, "locks"), segments = join(dir, "segments"), archives = join(dir, "archive");
  const ensure = () => {
    for (const d of [dir, records, locks, segments, archives]) { mkdirSync(d, { recursive: true, mode: 0o700 }); chmodSync(d, 0o700); }
  };
  const id = (name: string) => { if (!/^[0-9a-f]{64}$/.test(name)) throw new Error("not a record name"); return name; };
  const recordPath = (name: string) => join(records, `${id(name)}.json`);
  const lockPath = (name: string) => join(locks, `${id(name)}.lock`);
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
  const live = (): { name: string; record: CustodyRecord }[] => readdirSync(records).filter((f) => /^[0-9a-f]{64}\.json$/.test(f))
    .flatMap((f) => { try { return [{ name: f.slice(0, 64), record: JSON.parse(readFileSync(join(records, f), "utf8")) as CustodyRecord }]; } catch { return []; } });
  const release = (path: string) => () => { try { unlinkSync(path); } catch { /* already gone */ } };

  /**
   * Move the oldest terminal records into the archive, past the count or the age, as one transaction under the archive lease.
   * Another process archiving holds the lease, and this run moves nothing. A record whose lock another holds is skipped.
   * Order: the archive file, whole, renamed into place; then the index, renamed into place; then the live records removed. A
   * crash before the index is published leaves every record live and the new archive file unreferenced; the next archival
   * removes unreferenced files and temporary names. A crash after it leaves records both live and archived; the live file is
   * read first, and the next archival removes it.
   */
  const archive = (owned: string) => {
    const leasePath = join(archives, "archive.lease");
    if (!takeFile(leasePath, { time: new Date(now()).toISOString() })) return;
    const held: (() => void)[] = [];
    try {
      const table = index();
      const referenced = new Set(Object.values(table).map((e) => e.file));
      for (const f of readdirSync(archives)) {
        if (f.endsWith(".tmp") || (/^archive-\d+\.jsonl$/.test(f) && !referenced.has(f))) unlinkSync(join(archives, f));
      }
      const terminal = live().filter((r) => TERMINAL.has(r.record.phase)).sort((a, b) => (a.record.updated < b.record.updated ? -1 : 1));
      const old = now() - bounds.ageDays * 86_400_000;
      const due = terminal.filter((r, i) => i < terminal.length - bounds.terminalMost || (timeMs(r.record.updated) ?? now()) < old);
      const moving: { name: string; text: string }[] = [];
      for (const { name } of due) {
        if (name !== owned) {
          if (!takeFile(lockPath(name), { time: new Date(now()).toISOString(), archiving: true })) continue;
          held.push(release(lockPath(name)));
        }
        moving.push({ name, text: readFileSync(recordPath(name), "utf8") });
      }
      if (moving.length === 0) return;
      let n = Math.max(-1, ...readdirSync(archives).map((f) => /^archive-(\d+)\.jsonl$/.exec(f)).filter((m) => m !== null).map((m) => Number(m![1]))) + 1;
      let batch: string[] = [];
      let size = 0;
      const flush = () => {
        if (batch.length === 0) return;
        const file = `archive-${n++}.jsonl`;
        const temporary = join(archives, `${file}.${process.pid}.${randomUUID()}.tmp`);
        writeFileSync(temporary, batch.join(""), { mode: 0o600, flag: "wx" });
        renameSync(temporary, join(archives, file));
        for (const pending of entries.splice(0)) table[pending.name] = { file, offset: pending.offset, length: pending.length };
        batch = []; size = 0;
      };
      const entries: { name: string; offset: number; length: number }[] = [];
      for (const { name, text } of moving) {
        const bytes = Buffer.byteLength(text) + 1;
        if (size > 0 && size + bytes > bounds.archiveBytes) flush();
        entries.push({ name, offset: size, length: bytes - 1 });
        batch.push(`${text}\n`);
        size += bytes;
      }
      flush();
      bounds.fault?.("archive-written");
      atomic(indexPath, JSON.stringify(table));
      bounds.fault?.("index-published");
      for (const { name, text } of moving) {
        // Removed only when it is still what was archived.
        if (existsSync(recordPath(name)) && readFileSync(recordPath(name), "utf8") === text) unlinkSync(recordPath(name));
      }
    } finally {
      for (const r of held) r();
      release(leasePath)();
    }
  };

  const segmentPaths = (name: string) => ({ data: join(segments, `${id(name)}.jsonl`), ends: join(segments, `${id(name)}.ends`) });
  /** The end offsets of a segment's lines, `from` up to `to` entries; whole 8-byte entries only. */
  const endsOf = (path: string, from: number, to: number): number[] => {
    if (!existsSync(path) || to <= from) return [];
    const count = Math.floor(statSync(path).size / 8);
    const last = Math.min(to, count);
    if (last <= from) return [];
    const buffer = Buffer.alloc((last - from) * 8);
    const fd = openSync(path, "r");
    try { readSync(fd, buffer, 0, buffer.length, from * 8); } finally { closeSync(fd); }
    return Array.from({ length: last - from }, (_, i) => Number(buffer.readBigUInt64LE(i * 8)));
  };

  return {
    archived: () => Object.keys(index()).length,
    lock: async (name, notAfter) => {
      ensure();
      const path = lockPath(name);
      return takeFile(path, { time: new Date(now()).toISOString(), notAfter }) ? async () => { release(path)(); } : null;
    },
    exclusive: async <T>(work: () => Promise<T>): Promise<T> => {
      ensure();
      const path = join(dir, "capacity.lease");
      const until = Date.now() + LEASE_WAIT_MS;
      while (!takeFile(path, { time: new Date(now()).toISOString() })) {
        if (Date.now() > until) throw new CustodyError({ held: "locked" });
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      try { return await work(); } finally { release(path)(); }
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
      if (TERMINAL.has(record.phase)) archive(name);
    },
    unresolved: async () => { ensure(); return live().filter((r) => !TERMINAL.has(r.record.phase)).sort((a, b) => (a.record.created < b.record.created ? -1 : 1)).map((r) => ({ id: r.name, key: r.record.identity.key, created: r.record.created })); },
    segment: async (name, at, outcomes) => {
      ensure();
      const { data, ends } = segmentPaths(name);
      const kept = endsOf(ends, 0, at);
      if (kept.length < at) throw new Error(`the segment of ${name} holds fewer outcomes than its record counts`);
      // Cut what an interrupted append left past the record's count, in both files, then append.
      const base = at === 0 ? 0 : kept[at - 1]!;
      if (existsSync(data)) truncateSync(data, base); else writeFileSync(data, "", { mode: 0o600 });
      if (existsSync(ends)) truncateSync(ends, at * 8); else writeFileSync(ends, "", { mode: 0o600 });
      const lines = outcomes.map((o) => Buffer.from(`${JSON.stringify(o)}\n`, "utf8"));
      appendFileSync(data, Buffer.concat(lines), { mode: 0o600 });
      const offsets = Buffer.alloc(lines.length * 8);
      let end = base;
      lines.forEach((line, i) => { end += line.length; offsets.writeBigUInt64LE(BigInt(end), i * 8); });
      appendFileSync(ends, offsets, { mode: 0o600 });
    },
    segmented: async (name, from, limit) => {
      const { data, ends } = segmentPaths(name);
      if (limit <= 0 || !existsSync(data)) return [];
      const offsets = endsOf(ends, Math.max(0, from - 1), from + limit);
      const start = from === 0 ? 0 : offsets.shift();
      if (start === undefined || offsets.length === 0) return [];
      const end = offsets.at(-1)!;
      const buffer = Buffer.alloc(end - start);
      const fd = openSync(data, "r");
      try { readSync(fd, buffer, 0, buffer.length, start); } finally { closeSync(fd); }
      return buffer.toString("utf8").split("\n").filter((l) => l.length > 0).map((l) => JSON.parse(l) as Outcome);
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
