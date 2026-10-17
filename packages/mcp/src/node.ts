/**
 * The server under Node: the two transports and the custody store on files.
 *
 * - **stdio** (`dap mcp`): one implicit connection. Each line is one
 *   JSON-RPC message. The first request says which revision the client
 *   speaks.
 * - **streamable HTTP on loopback** (`dap mcp --http 127.0.0.1:<port>`):
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
import { join, relative, sep } from "node:path";
import { Readable } from "node:stream";
import { canonicalize, timeMs } from "@generalbusiness/artroom-bytes";
import type { Signer, Fetch } from "@generalbusiness/artroom-client";
import { CustodyError, TERMINAL, type CustodyRecord, type CustodyStore, type Outcome } from "./custody.ts";
import type { ConfigPort } from "./inventory.ts";
import { McpService } from "./service.ts";
import { MCP_METRIC_SCHEMA, type McpMetricOptions } from "./metrics.ts";
import type { Mode } from "./catalogue.ts";
import { McpHttp } from "./http.ts";
import { Wire, isFrame, newSession, type LegacySession, type Message } from "./wire.ts";

// ---------------------------------------------------------------- custody on files

export interface FileStoreBounds {
  /** Terminal records kept as files before the oldest are archived. */
  terminalMost: number;
  /** Days a terminal record is kept as a file before it is archived. */
  ageDays: number;
  /** The most bytes of one archive file. */
  archiveBytes: number;
  /** A test's fault injection: called at each named point of an archival, where a crash may come. */
  fault?: (point: "candidates-selected" | "archive-written" | "index-published") => void;
}
export const FILE_STORE_BOUNDS: FileStoreBounds = { terminalMost: 1024, ageDays: 30, archiveBytes: 64 * 1024 * 1024 };

/** How long admission waits for the capacity lease before it says the store is locked. */
const LEASE_WAIT_MS = 10_000;

const alive = (pid: number): boolean => { try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === "EPERM"; } };

/** A lock file this process holds: its path, and the token written in it, which names this holding and no other. */
export interface Holding { path: string; token: string }

const readHolding = (path: string): { pid: number; token: string } | null => {
  try {
    const held = JSON.parse(readFileSync(path, "utf8")) as { pid?: unknown; token?: unknown };
    return typeof held.pid === "number" && typeof held.token === "string" ? { pid: held.pid, token: held.token } : null;
  } catch { return null; }
};

function create(path: string, body: Record<string, unknown>): Holding | null {
  const token = randomUUID();
  try { writeFileSync(path, JSON.stringify({ pid: process.pid, token, ...body }), { mode: 0o600, flag: "wx" }); return { path, token }; }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "EEXIST") return null; throw e; }
}

/** Remove a lock file only when it still holds this holding's token: a newer owner's file is never removed. */
export function releaseLock(held: Holding): void {
  if (readHolding(held.path)?.token === held.token) { try { unlinkSync(held.path); } catch { /* already gone */ } }
}

/**
 * The reclaim lock beside a lock file: whoever holds it may remove a dead owner's file. It is taken only by exclusive creation.
 * A reclaim lock left by a process that died inside its short section is never broken here: Node gives no way to replace a file
 * only while it still holds the dead token that was read, and moving it aside could displace a live reclaimer. The lock it
 * guards stays held, and `blockedBy` names the file, for an operator to remove once no process of this store runs.
 */
function takeReclaim(path: string): Holding | null { return create(path, {}); }

/**
 * The reclaim lock that a dead process left beside this lock file, if one blocks its recovery; null otherwise.
 * EPERM is treated as alive, including a PID reused by another user's process, so null does not prove there is no stale lock.
 * For operator recovery, stop every process using this config directory, verify the original holder is gone and identify the
 * unchanged stale lock or reclaim file (with an administrator if process ownership cannot be checked). Only then remove that
 * file, preserving every custody record and archive. If ownership or quiescence is uncertain, leave the lock in place.
 */
export function blockedBy(path: string): string | null {
  const reclaim = `${path}.reclaim`;
  const held = readHolding(reclaim);
  return held && !alive(held.pid) ? reclaim : null;
}

/**
 * Take a lock file: created exclusively, holding the process, a token and the time. A file whose process is gone is broken, one
 * reclaimer at a time: under the reclaim lock, the file is read again, removed only if it is still the dead owner's, and taken.
 * One whose process lives is not broken. Its time and any deadline it records decide nothing: expiry is never an outcome.
 */
export function takeLock(path: string, body: Record<string, unknown>): Holding | null {
  const held = create(path, body);
  if (held) return held;
  const seen = readHolding(path);
  // A file being written has no body yet: its taker lives. Only a whole file naming a process that is gone is broken.
  if (!seen || alive(seen.pid)) return null;
  const reclaim = takeReclaim(`${path}.reclaim`);
  if (!reclaim) return null;
  try {
    const again = readHolding(path);
    if (again && again.token === seen.token && !alive(again.pid)) { try { unlinkSync(path); } catch { /* gone */ } }
    return create(path, body);
  } finally { releaseLock(reclaim); }
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
  /** A file of this store as an error names it: relative to the store, never the absolute path, whose length the home sets. */
  const shown = (path: string) => relative(dir, path).split(sep).join("/");
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

  /**
   * Move the oldest terminal records into the archive, past the count or the age, as one transaction under the archive lease.
   * Another process archiving holds the lease, and this run moves nothing. A record whose lock another holds is skipped.
   * Order: the archive file, whole, renamed into place; then the index, renamed into place; then the live records removed. A
   * crash before the index is published leaves every record live and the new archive file unreferenced; the next archival
   * removes unreferenced files and temporary names. A crash after it leaves records both live and archived; the live file is
   * read first, and the next archival removes it.
   */
  const archive = (owned: string) => {
    const lease = takeLock(join(archives, "archive.lease"), { time: new Date(now()).toISOString() });
    if (!lease) return;
    const held: Holding[] = [];
    try {
      const table = index();
      const referenced = new Set(Object.values(table).map((e) => e.file));
      for (const f of readdirSync(archives)) {
        if (f.endsWith(".tmp") || (/^archive-\d+\.jsonl$/.test(f) && !referenced.has(f))) unlinkSync(join(archives, f));
      }
      const terminal = live().filter((r) => TERMINAL.has(r.record.phase)).sort((a, b) => (a.record.updated < b.record.updated ? -1 : 1));
      const old = now() - bounds.ageDays * 86_400_000;
      const due = terminal.filter((r, i) => i < terminal.length - bounds.terminalMost || (timeMs(r.record.updated) ?? now()) < old);
      bounds.fault?.("candidates-selected");
      const moving: { name: string; text: string }[] = [];
      for (const { name } of due) {
        if (name !== owned) {
          const lock = takeLock(lockPath(name), { time: new Date(now()).toISOString(), archiving: true });
          if (!lock) continue;
          held.push(lock);
        }
        // Read again under the lock: a record resubmitted since it was selected is unresolved now, and is not archived.
        let text: string;
        try { text = readFileSync(recordPath(name), "utf8"); } catch { continue; }
        if (!TERMINAL.has((JSON.parse(text) as CustodyRecord).phase)) continue;
        moving.push({ name, text });
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
      for (const lock of held) releaseLock(lock);
      releaseLock(lease);
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
      const held = takeLock(path, { time: new Date(now()).toISOString(), notAfter });
      if (held) return async () => { releaseLock(held); };
      const stale = blockedBy(path);
      if (stale) throw new CustodyError({ held: "locked", stale: shown(stale) });
      return null;
    },
    exclusive: async <T>(work: () => Promise<T>): Promise<T> => {
      ensure();
      const path = join(dir, "capacity.lease");
      const until = Date.now() + LEASE_WAIT_MS;
      let held = takeLock(path, { time: new Date(now()).toISOString() });
      while (!held) {
        const stale = blockedBy(path);
        if (stale) throw new CustodyError({ held: "locked", stale: shown(stale) });
        if (Date.now() > until) throw new CustodyError({ held: "locked" });
        await new Promise((resolve) => setTimeout(resolve, 5));
        held = takeLock(path, { time: new Date(now()).toISOString() });
      }
      try { return await work(); } finally { releaseLock(held); }
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

/** The most bytes of one line on stdio, and of one HTTP body: a whole envelope of the largest act fits with room to spare. */
const FRAME_BYTES = 4 * 1024 * 1024;

/**
 * Serve over standard input and output. Resolves when the input ends. Each line is one frame, read as bytes and decoded once as
 * UTF-8. A line longer than the bound is answered with one error and skipped to its end, never truncated into another frame. Each
 * request runs as its own task, removed when it settles; a failure in one is answered and contained.
 */
export function serveStdio(service: McpService, input: NodeJS.ReadableStream = process.stdin, output: NodeJS.WritableStream = process.stdout): Promise<void> {
  const wire = new Wire(service);
  const session: LegacySession = newSession();
  const owner = {};
  const write = (message: Message) => { try { output.write(`${JSON.stringify(message)}\n`); } catch { /* the output is gone */ } };
  session.stream = { send: write, notified: null, close: () => {} };
  let parts: Buffer[] = [];
  let held = 0;
  let skipping = false;
  const pending = new Set<Promise<void>>();
  const frame = (bytes: Buffer) => {
    let message: unknown;
    try { message = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
    catch { write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); return; }
    const task: Promise<void> = wire.handle(message, session, write, owner)
      .then((response) => { if (response) write(response); }, () => { write({ jsonrpc: "2.0", id: isFrame(message) ? message.id ?? null : null, error: { code: -32603, message: "Internal error" } }); })
      .finally(() => { pending.delete(task); });
    pending.add(task);
  };
  const tooLong = () => write({ jsonrpc: "2.0", id: null, error: { code: -32600, message: `A frame longer than ${FRAME_BYTES} bytes is not read.` } });
  return new Promise((resolve) => {
    input.on("data", (chunk: string | Buffer) => {
      let data = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk;
      for (let at = data.indexOf(10); at >= 0; at = data.indexOf(10)) {
        const tail = data.subarray(0, at);
        data = data.subarray(at + 1);
        if (skipping) { skipping = false; parts = []; held = 0; continue; }
        if (held + tail.length > FRAME_BYTES) { parts = []; held = 0; tooLong(); continue; }
        const line = Buffer.concat([...parts, tail]);
        parts = []; held = 0;
        if (line.toString("latin1").trim().length > 0) frame(line);
      }
      if (data.length === 0 || skipping) return;
      held += data.length;
      if (held > FRAME_BYTES) { skipping = true; parts = []; held = 0; tooLong(); return; }
      parts.push(Buffer.from(data));
    });
    input.on("end", () => { void Promise.allSettled([...pending]).then(() => { wire.endLegacy(session); wire.closeAll(); resolve(); }); });
  });
}

// ---------------------------------------------------------------- loopback HTTP

const LOOPBACK = /^(127\.\d{1,3}\.\d{1,3}\.\d{1,3}|::1|\[::1\])$/;

export interface HttpServing { server: Server; url: string; bearer: string; wire: Wire; http: McpHttp; close(): Promise<void> }

/** Whether an address is loopback: 127.0.0.0/8 or ::1. A name such as `localhost` is not taken: it may resolve elsewhere. */
export function isLoopback(host: string): boolean { return LOOPBACK.test(host); }

/**
 * Serve streamable HTTP at `http://<host>:<port>/mcp`. Refuses a host that is
 * not loopback before anything listens. The bearer is made here and given
 * once to `announce`, which the command writes to standard error. Every
 * request is validated by the shared HTTP layer (`http.ts`), as the hosted
 * endpoint's are: this server only binds the socket, checks the bearer and
 * carries the bytes.
 */
export async function serveHttp(service: McpService, host: string, port: number, announce: (line: string) => void = (line) => process.stderr.write(`${line}\n`)): Promise<HttpServing> {
  if (!isLoopback(host)) throw new Error(`${host} is not a loopback address; the server binds 127.0.0.1 or ::1 only.`);
  const bearer = randomBytes(32).toString("base64url");
  const expected = Buffer.from(`Bearer ${bearer}`);
  const wire = new Wire(service);
  const http = new McpHttp({
    wire, bodyBytes: FRAME_BYTES, mintSession: randomUUID,
    authorized: (authorization) => { const given = Buffer.from(authorization ?? ""); return given.length === expected.length && timingSafeEqual(given, expected); },
  });
  const bare = (res: ServerResponse, status: number) => { res.writeHead(status); res.end(); };
  const json = (res: ServerResponse, status: number, message: Message) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(message)); };
  // Every failure of one request is contained here: an aborted body, a parser or a handler that throws, a write to a closed
  // socket. Nothing rejects unhandled and no other request waits on it.
  const server = createServer((req, res) => {
    req.on("error", () => { /* an aborted upload: the handler sees the end of the body */ });
    res.on("error", () => { /* the client is gone */ });
    handle(req, res).catch(() => {
      try { if (!res.headersSent) json(res, 500, { jsonrpc: "2.0", id: null, error: { code: -32603, message: "Internal error" } }); else res.end(); } catch { /* gone */ }
    });
  });
  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Origin and bearer first, then the path: no detail about this server leaves before the bearer is checked.
    if (req.headers["origin"] !== undefined) return bare(res, 403);
    const given = Buffer.from(String(req.headers["authorization"] ?? ""));
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return bare(res, 401);
    if (new URL(req.url ?? "/", "http://loopback").pathname !== "/mcp") return bare(res, 404);
    // The socket's close is tracked before the handler is awaited: a client that goes away while a stream is being opened is
    // seen by the layer through the request's signal, and a body the handler returns to a closed socket is cancelled at once,
    // so it holds no stream slot and no watcher.
    const gone = new AbortController();
    let closed = false;
    res.on("close", () => { closed = true; gone.abort(); });
    let request: Request;
    try {
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
      const withBody = req.method === "POST";
      request = new Request(`http://loopback${req.url ?? "/"}`, { method: req.method ?? "GET", headers, signal: gone.signal, ...(withBody ? { body: Readable.toWeb(req) as unknown as ReadableStream, duplex: "half" } : {}) } as RequestInit);
    } catch { return json(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32020, message: "A header is not well formed." } }); }
    const response = await http.handle(request);
    if (closed) { await response.body?.cancel().catch(() => undefined); return; }
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (!response.body) { res.end(); return; }
    const reader = response.body.getReader();
    res.on("close", () => { void reader.cancel().catch(() => undefined); });
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (res.writableEnded) break;
      res.write(value);
    }
    res.end();
  }

  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, host.replace(/^\[|\]$/g, ""), () => resolve()); });
  const address = server.address();
  const actual = typeof address === "object" && address ? address.port : port;
  const url = `http://${host.includes(":") && !host.startsWith("[") ? `[${host}]` : host}:${actual}/mcp`;
  announce(`dap mcp: serving ${url}; bearer (shown once): ${bearer}`);
  return {
    server, url, bearer, wire, http,
    close: async () => {
      await http.closeAll();
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
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
  metrics?: McpMetricOptions;
}

/** `dap mcp`: serve over stdio, or over loopback HTTP. Resolves when stdio ends; an HTTP server serves until the process ends. */
export async function serve(options: ServeOptions): Promise<void> {
  const service = new McpService({
    service: options.service, signer: options.signer, config: options.config, custody: fileStore(join(options.home, "private", "mcp-custody")),
    mode: options.mode, tools: options.tools, ...(options.fetch ? { fetch: options.fetch } : {}),
    metrics: options.metrics ?? { report: point => { console.error(`dap.metric ${JSON.stringify({ schema: MCP_METRIC_SCHEMA, ...point })}`); } },
  });
  if (options.http) {
    await serveHttp(service, options.http.host, options.http.port);
    await new Promise<void>(() => {});
  }
  await serveStdio(service);
}
