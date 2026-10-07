/**
 * A bounded, SHA-1 smart-HTTP receive-pack client using Web APIs only.
 * Protocol: git-scm.com/docs/gitprotocol-http, gitformat-pack and
 * gitprotocol-pack. This is a transport, not a grant or a publication judge.
 * It never retries an update. The existing classifier still requires a
 * forwarding record and a read after a complete report of that update.
 */
import { sha1 } from "@noble/hashes/legacy.js";
import { GitRefusal, objectId, refName, remoteUrl, ZERO_ID, type ObjectId, type Transport } from "./names.ts";
import { idOf, parseCommit, parseTree, READ_BOUNDS, type ReadBounds, type RefTarget } from "./reader.ts";
import { NOT_RUN, type PushAnswer, type ReadBack, type Reported } from "./push-outcome.ts";
import { COMMAND_MS } from "./program.ts";

export interface RawGitObject { id: ObjectId; type: "commit" | "tree" | "blob"; data: Uint8Array }
export interface ReceiveAdvertisement { refs: RefTarget[]; capabilities: string[] }
export interface HttpUpdate { ref: string; old: ObjectId | null; new: ObjectId | null; objects?: readonly RawGitObject[] }
export interface SmartHttpOptions {
  remote: string;
  /** Caller-chosen buffer allowance for this transport, not a platform quota. */
  maxBytes: number;
  /** An HTTP Authorization value. Kept privately, never in a URL or answer. */
  authorization?: string;
  /** A trusted fetch implementation that honors redirect:error and the signal. */
  fetch?: (request: Request) => Promise<Response>;
  transport?: Transport;
  bounds?: ReadBounds;
  timeoutMs?: number;
}

const utf8 = new TextEncoder();
const bad = (what: string) => new GitRefusal("unreadable", what);
const join = (parts: readonly Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
};
const ascii = (bytes: Uint8Array): string => {
  let out = "";
  for (const b of bytes) out += String.fromCharCode(b);
  return out;
};

/** A bounded stream read, cancelled on overflow or failure. */
async function bytes(stream: ReadableStream<Uint8Array> | null, limit: number): Promise<Uint8Array> {
  if (stream === null) throw bad("HTTP body");
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) return join(chunks);
      size += next.value.length;
      if (size > limit) throw new GitRefusal("too-large", "HTTP body");
      chunks.push(next.value);
    }
  } catch (e) {
    await reader.cancel().catch(() => undefined);
    throw e;
  } finally { reader.releaseLock(); }
}

function packet(line: string): Uint8Array {
  const data = utf8.encode(line);
  return join([utf8.encode((data.length + 4).toString(16).padStart(4, "0")), data]);
}
const FLUSH = utf8.encode("0000");

/** Entire pkt-line stream, including flushes; no trailing or truncated data. */
function packets(data: Uint8Array): (string | null)[] {
  const out: (string | null)[] = [];
  for (let at = 0; at < data.length;) {
    const digits = ascii(data.subarray(at, at + 4));
    if (!/^[0-9a-f]{4}$/.test(digits)) throw bad("pkt-line");
    const size = Number.parseInt(digits, 16);
    if (size === 0) { out.push(null); at += 4; continue; }
    if (size <= 4 || size > 65520 || at + size > data.length) throw bad("pkt-line");
    let line = ascii(data.subarray(at + 4, at + size));
    if (line.endsWith("\n")) line = line.slice(0, -1);
    out.push(line);
    at += size;
  }
  if (out.at(-1) !== null) throw bad("pkt-line");
  return out;
}

/**
 * A non-delta v2 pack containing exactly the supplied objects. The count,
 * each raw object use existing read bounds. The caller explicitly supplies
 * the buffer allowance; this is not a platform quota. Copy before hashing so asynchronous compression cannot
 * send changed caller-owned bytes under an already checked ID.
 */
export async function buildPack(objects: readonly RawGitObject[], options: { maxBytes: number; bounds?: ReadBounds }): Promise<Uint8Array> {
  const bounds = options.bounds ?? READ_BOUNDS;
  const maxBytes = options.maxBytes;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 32 || Object.values(bounds).some((n) => !Number.isSafeInteger(n) || n <= 0)) throw new GitRefusal("too-large", "pack allowance");
  if (objects.length > bounds.closureObjects || objects.length > 0xffffffff) throw new GitRefusal("too-large", "pack objects");
  let total = 0;
  const seen = new Set<string>();
  const verified = objects.map((o) => {
    objectId(o.id, "pack object");
    if (o.type !== "commit" && o.type !== "tree" && o.type !== "blob") throw new GitRefusal("wrong-type", "pack object");
    const limit = o.type === "commit" ? bounds.commitBytes : o.type === "tree" ? bounds.treeBytes : bounds.blobBytes;
    total += o.data.length;
    if (o.data.length > limit || total > maxBytes) throw new GitRefusal("too-large", "pack bytes");
    if (seen.has(o.id)) throw bad("repeated pack object");
    seen.add(o.id);
    const data = new Uint8Array(o.data); // owns bytes even for Uint8Array subclasses
    if (idOf(o.type, data) !== o.id) throw new GitRefusal("hash-mismatch", "pack object");
    if (o.type === "commit") parseCommit(data, bounds);
    if (o.type === "tree") {
      if (parseTree(data).some((entry) => entry.kind === "gitlink")) throw new GitRefusal("gitlink", "pack tree");
    }
    return { type: o.type, data };
  });
  const header = new Uint8Array(12);
  header.set(utf8.encode("PACK"));
  const view = new DataView(header.buffer);
  view.setUint32(4, 2);
  view.setUint32(8, verified.length);
  const parts: Uint8Array[] = [header];
  let size = 32; // header plus SHA-1 trailer
  for (const o of verified) {
    let remaining = o.data.length;
    const type = o.type === "commit" ? 1 : o.type === "tree" ? 2 : 3;
    const entry = [(type << 4) | (remaining % 16)];
    remaining = Math.floor(remaining / 16);
    while (remaining > 0) {
      entry[entry.length - 1]! |= 128;
      entry.push(remaining % 128);
      remaining = Math.floor(remaining / 128);
    }
    const compressed = await bytes(new Blob([o.data]).stream().pipeThrough(new CompressionStream("deflate")), maxBytes - size - entry.length);
    size += entry.length + compressed.length;
    if (size > maxBytes) throw new GitRefusal("too-large", "pack bytes");
    parts.push(Uint8Array.from(entry), compressed);
  }
  if (size > maxBytes) throw new GitRefusal("too-large", "pack bytes");
  const body = join(parts);
  return join([body, sha1(body)]);
}

/** Web fetch over one fixed remote; credentials never leave its origin. */
export class SmartHttpGit {
  readonly #remote: string;
  readonly #authorization: string | undefined;
  readonly #fetch: (request: Request) => Promise<Response>;
  readonly #bounds: ReadBounds;
  readonly #timeoutMs: number;
  readonly #maxBytes: number;

  constructor(options: SmartHttpOptions) {
    this.#remote = remoteUrl(options.remote, options.transport ?? "https").replace(/\/$/, "");
    if (!this.#remote.startsWith("https://") && !this.#remote.startsWith("http://")) throw new GitRefusal("bad-remote", "HTTP remote");
    this.#authorization = options.authorization;
    this.#fetch = options.fetch ?? ((request) => fetch(request));
    this.#bounds = { ...(options.bounds ?? READ_BOUNDS) };
    this.#timeoutMs = options.timeoutMs ?? COMMAND_MS;
    this.#maxBytes = options.maxBytes;
    if (!Number.isSafeInteger(this.#maxBytes) || this.#maxBytes < 32 || !Number.isSafeInteger(this.#timeoutMs) || this.#timeoutMs <= 0 || Object.values(this.#bounds).some((n) => !Number.isSafeInteger(n) || n <= 0)) throw new GitRefusal("too-large", "HTTP bounds");
  }

  async #request(path: string, media: string, signal: AbortSignal, body?: Uint8Array): Promise<Uint8Array> {
    try {
      const url = `${this.#remote}/${path}`;
      const headers = new Headers({ accept: media, "cache-control": "no-cache" });
      if (this.#authorization !== undefined) headers.set("authorization", this.#authorization);
      if (body !== undefined) headers.set("content-type", "application/x-git-receive-pack-request");
      const request = new Request(url, { method: body === undefined ? "GET" : "POST", headers, redirect: "error", credentials: "omit", signal, ...(body === undefined ? {} : { body }) });
      const response = await this.#fetch(request);
      if (response.status !== 200 || response.redirected || (response.url !== "" && response.url !== url) || response.headers.get("content-type")?.split(";", 1)[0]?.trim() !== media) {
        await response.body?.cancel().catch(() => undefined);
        throw bad("HTTP response");
      }
      return await bytes(response.body, this.#maxBytes);
    } catch (e) {
      if (e instanceof GitRefusal) throw e;
      throw bad("HTTP request");
    }
  }

  async discover(): Promise<ReceiveAdvertisement> {
    const lines = packets(await this.#request("info/refs?service=git-receive-pack", "application/x-git-receive-pack-advertisement", AbortSignal.timeout(this.#timeoutMs)));
    if (lines[0] !== "# service=git-receive-pack" || lines[1] !== null || lines.length < 4 || lines.at(-1) !== null) throw bad("advertisement");
    const refs: RefTarget[] = [];
    const capabilities: string[] = [];
    const seen = new Set<string>();
    for (let i = 2; i < lines.length - 1; i++) {
      const line = lines[i];
      if (line === null || line === undefined) throw bad("advertisement");
      const nul = line.indexOf("\0");
      if ((i === 2 && nul < 0) || (i !== 2 && nul >= 0)) throw bad("capabilities");
      if (nul >= 0) {
        const list = line.slice(nul + 1);
        if (!/^[!-~]+(?: [!-~]+)*$/.test(list)) throw bad("capabilities");
        capabilities.push(...list.split(" "));
        if (capabilities.some((c) => c.startsWith("object-format=") && c !== "object-format=sha1")) throw new GitRefusal("unsupported-object-format", "advertisement");
      }
      const refLine = nul < 0 ? line : line.slice(0, nul);
      const match = /^([0-9a-f]{40}) (.+)$/.exec(refLine);
      if (match === null) throw bad("advertisement");
      const [target, name] = [match[1]!, match[2]!];
      if (target === ZERO_ID && name === "capabilities^{}" && i === 2 && lines.length === 4) continue;
      objectId(target, "advertised object");
      if (seen.has(name)) throw bad("repeated advertised ref");
      seen.add(name);
      if (seen.size > this.#bounds.refs) throw new GitRefusal("too-large", "advertised refs");
      if (name === "HEAD") continue;
      if (name.endsWith("^{}")) { refName(name.slice(0, -3), "peeled ref"); continue; }
      refs.push({ ref: refName(name, "advertised ref"), target });
    }
    return { refs, capabilities };
  }

  async readRef(name: string): Promise<ReadBack> {
    refName(name, "ref");
    return { ref: name, value: (await this.discover()).refs.find((r) => r.ref === name)?.target ?? null };
  }

  /** One exact compare-and-swap command and at most one POST. No force fallback. */
  async send(update: HttpUpdate): Promise<PushAnswer> {
    update = { ...update }; // stable ref command while discovery/compression await
    let pack: Uint8Array;
    try {
      refName(update.ref, "update ref");
      if (update.old !== null) objectId(update.old, "old object");
      if (update.new !== null) objectId(update.new, "new object");
      if (update.old === update.new) return NOT_RUN("same-commit");
      pack = update.new === null ? new Uint8Array() : await buildPack(update.objects ?? [], { maxBytes: this.#maxBytes, bounds: this.#bounds });
    } catch (e) { return NOT_RUN(e instanceof GitRefusal ? e.reason : "unreadable"); }
    let advertised: ReceiveAdvertisement;
    try { advertised = await this.discover(); }
    catch (e) { return NOT_RUN(e instanceof GitRefusal ? e.reason : "unreadable"); }
    if ((advertised.refs.find((r) => r.ref === update.ref)?.target ?? null) !== update.old) return { ...NOT_RUN("unreadable"), ran: true, refusal: null, reported: "stale" };
    if (!advertised.capabilities.includes("report-status") || (update.new === null && !advertised.capabilities.includes("delete-refs"))) return NOT_RUN("unreadable");
    const body = join([packet(`${update.old ?? ZERO_ID} ${update.new ?? ZERO_ID} ${update.ref}\0report-status\n`), FLUSH, pack]);
    if (body.length > this.#maxBytes) return NOT_RUN("too-large");
    const signal = AbortSignal.timeout(this.#timeoutMs);
    const unknown: PushAnswer = { ran: true, refusal: null, exit: null, timedOut: false, reported: null, others: false, code: null };
    try {
      const lines = packets(await this.#request("git-receive-pack", "application/x-git-receive-pack-result", signal, body));
      // Plain report-status only: exactly one unpack line, one status, one flush.
      if (lines.length !== 3 || !lines[0]?.startsWith("unpack ") || lines[0].length <= 7) return unknown;
      const status = lines[1];
      if (status === `ok ${update.ref}` && lines[0] === "unpack ok") {
        const reported: Reported = update.old === null ? "created" : update.new === null ? "deleted" : "updated";
        return { ...unknown, exit: 0, reported };
      }
      if (status?.startsWith(`ng ${update.ref} `) && status.length > update.ref.length + 4) return { ...unknown, exit: 1, reported: "remote-rejected" };
      return unknown;
    } catch { return { ...unknown, timedOut: signal.aborted }; }
  }
}
