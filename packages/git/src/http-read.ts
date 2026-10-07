/**
 * SHA-1 smart-HTTP upload-pack as a Web-only GitSource. Protocol sources:
 * git-scm.com/docs/gitprotocol-http, gitprotocol-pack, gitformat-pack and
 * gitprotocol-capabilities; zlib framing: RFC 1950/1951. No thin pack,
 * sideband, shallow history, retry or inference of absence from an error.
 * The caller's maxBytes bounds wire, inflated and retained object bytes;
 * it is a transport allowance, not an adopted platform quota.
 */
import { hex } from "@generalbusiness/artroom-bytes";
import { sha1 } from "@noble/hashes/legacy.js";
import { GitRefusal, objectId, refName, remoteUrl, ZERO_ID, type ObjectId } from "./names.ts";
import { idOf, READ_BOUNDS, type GitSource, type ObjectType, type ReadBounds, type RefTarget, type StoredObject } from "./reader.ts";
import { COMMAND_MS } from "./program.ts";
import type { SmartHttpOptions } from "./http.ts";

export interface DecodedObject { id: ObjectId; type: ObjectType; data: Uint8Array }
export interface PackReadOptions { maxBytes: number; bounds?: ReadBounds }
const fail = (what: string) => new GitRefusal("unreadable", what);
const large = (what: string) => new GitRefusal("too-large", what);
const utf8 = new TextEncoder();
const ascii = (b: Uint8Array): string => {
  let s = "";
  for (const byte of b) s += String.fromCharCode(byte);
  return s;
};
const concat = (parts: readonly Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};
function checked(options: PackReadOptions): { maxBytes: number; bounds: ReadBounds } {
  const bounds = { ...(options.bounds ?? READ_BOUNDS) };
  if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes < 32 || Object.values(bounds).some((n) => !Number.isSafeInteger(n) || n <= 0)) throw large("read allowance");
  return { maxBytes: options.maxBytes, bounds };
}
const typeLimit = (type: ObjectType, bounds: ReadBounds) => type === "commit" ? bounds.commitBytes : type === "tree" ? bounds.treeBytes : bounds.blobBytes;

async function readBytes(stream: ReadableStream<Uint8Array> | null, limit: number): Promise<Uint8Array> {
  if (stream === null) throw fail("read body");
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) return concat(chunks);
      total += next.value.length;
      if (total > limit) throw large("read bytes");
      chunks.push(new Uint8Array(next.value));
    }
  } catch (e) {
    await reader.cancel().catch(() => undefined);
    if (e instanceof GitRefusal) throw e;
    throw fail("read body");
  } finally { reader.releaseLock(); }
}

/** DEFLATE framing only; the Web decompressor validates/inflates the slice. */
class Bits {
  position: number;
  constructor(readonly data: Uint8Array, at: number) { this.position = at * 8; }
  take(n: number): number {
    if (this.position + n > this.data.length * 8) throw fail("deflate framing");
    let out = 0;
    for (let i = 0; i < n; i++, this.position++) out |= ((this.data[Math.floor(this.position / 8)]! >>> (this.position % 8)) & 1) << i;
    return out;
  }
  skip(n: number): void {
    if (this.position + n > this.data.length * 8) throw fail("deflate framing");
    this.position += n;
  }
}
type Huffman = Map<number, number>[];
function huffman(lengths: readonly number[]): Huffman {
  const counts = new Array<number>(16).fill(0);
  for (const n of lengths) {
    if (n < 0 || n > 15) throw fail("deflate code");
    if (n > 0) counts[n]!++;
  }
  const next = new Array<number>(16).fill(0);
  let code = 0;
  let available = 1;
  for (let n = 1; n <= 15; n++) {
    available = available * 2 - counts[n]!;
    if (available < 0) throw fail("deflate code");
    code = (code + counts[n - 1]!) * 2;
    next[n] = code;
  }
  const out = Array.from({ length: 16 }, () => new Map<number, number>());
  lengths.forEach((n, symbol) => { if (n > 0) out[n]!.set(next[n]!++, symbol); });
  return out;
}
function symbol(bits: Bits, codes: Huffman): number {
  let code = 0;
  for (let n = 1; n <= 15; n++) {
    code = code * 2 + bits.take(1);
    const found = codes[n]!.get(code);
    if (found !== undefined) return found;
  }
  throw fail("deflate symbol");
}
const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LENGTH_BITS = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_BITS = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CODE_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
const FIXED = huffman(Array.from({ length: 288 }, (_, s) => s < 144 ? 8 : s < 256 ? 9 : s < 280 ? 7 : 8));
const FIXED_DIST = huffman(new Array<number>(32).fill(5));

function zlibEnd(data: Uint8Array, start: number, expected: number): number {
  const cmf = data[start];
  const flg = data[start + 1];
  if (cmf === undefined || flg === undefined || (cmf & 15) !== 8 || (cmf >>> 4) > 7 || ((cmf * 256 + flg) % 31) !== 0 || (flg & 32) !== 0) throw fail("zlib header");
  const bits = new Bits(data, start + 2);
  let output = 0;
  let final = false;
  while (!final) {
    final = bits.take(1) === 1;
    const kind = bits.take(2);
    if (kind === 0) {
      bits.position = Math.ceil(bits.position / 8) * 8;
      const length = bits.take(16);
      if ((length ^ bits.take(16)) !== 65535) throw fail("deflate stored block");
      bits.skip(length * 8);
      output += length;
    } else {
      if (kind === 3) throw fail("deflate block");
      let literals = FIXED;
      let distances = FIXED_DIST;
      if (kind === 2) {
        const nl = bits.take(5) + 257;
        const nd = bits.take(5) + 1;
        const nc = bits.take(4) + 4;
        if (nl > 286) throw fail("deflate lengths");
        const codeLengths = new Array<number>(19).fill(0);
        for (let i = 0; i < nc; i++) codeLengths[CODE_ORDER[i]!] = bits.take(3);
        const codes = huffman(codeLengths);
        const lengths: number[] = [];
        while (lengths.length < nl + nd) {
          const s = symbol(bits, codes);
          if (s <= 15) lengths.push(s);
          else {
            if (s === 16 && lengths.length === 0) throw fail("deflate repeat");
            const count = s === 16 ? bits.take(2) + 3 : s === 17 ? bits.take(3) + 3 : bits.take(7) + 11;
            if (lengths.length + count > nl + nd) throw fail("deflate repeat");
            const value = s === 16 ? lengths.at(-1)! : 0;
            for (let i = 0; i < count; i++) lengths.push(value);
          }
        }
        if (lengths[256] === 0) throw fail("deflate end code");
        literals = huffman(lengths.slice(0, nl));
        distances = huffman(lengths.slice(nl));
      }
      for (;;) {
        const s = symbol(bits, literals);
        if (s === 256) break;
        if (s < 256) output++;
        else {
          if (s > 285) throw fail("deflate length");
          const length = LENGTH_BASE[s - 257]! + bits.take(LENGTH_BITS[s - 257]!);
          const d = symbol(bits, distances);
          if (d > 29) throw fail("deflate distance");
          const distance = DIST_BASE[d]! + bits.take(DIST_BITS[d]!);
          if (distance > output || distance > 2 ** ((cmf >>> 4) + 8)) throw fail("deflate distance");
          output += length;
        }
        if (output > expected) throw new GitRefusal("wrong-size", "packed object");
      }
    }
    if (output > expected) throw new GitRefusal("wrong-size", "packed object");
  }
  const end = Math.ceil(bits.position / 8) + 4; // zlib Adler-32 trailer
  if (end > data.length || output !== expected) throw new GitRefusal("wrong-size", "packed object");
  return end;
}

class Cursor {
  constructor(readonly data: Uint8Array, public at = 0) {}
  byte(): number {
    const b = this.data[this.at++];
    if (b === undefined) throw fail("pack entry");
    return b;
  }
  variable(first = 0, multiplier = 1): number {
    let n = first;
    for (;;) {
      const b = this.byte();
      n += (b & 127) * multiplier;
      if (!Number.isSafeInteger(n)) throw large("pack size");
      if (b < 128) return n;
      multiplier *= 128;
      if (!Number.isSafeInteger(multiplier)) throw large("pack size");
    }
  }
}

function applyDelta(raw: Uint8Array, base: DecodedObject, limit: number): Uint8Array {
  const cursor = new Cursor(raw);
  if (cursor.variable() !== base.data.length) throw new GitRefusal("wrong-size", "delta base");
  const size = cursor.variable();
  if (size > limit) throw large("delta result");
  const out = new Uint8Array(size);
  let at = 0;
  while (cursor.at < raw.length) {
    const op = cursor.byte();
    if (op === 0) throw fail("delta opcode");
    if ((op & 128) !== 0) {
      let offset = 0;
      let count = 0;
      for (let i = 0; i < 4; i++) if ((op & (1 << i)) !== 0) offset += cursor.byte() * 2 ** (8 * i);
      for (let i = 0; i < 3; i++) if ((op & (1 << (i + 4))) !== 0) count += cursor.byte() * 2 ** (8 * i);
      if (count === 0) count = 65536;
      if (offset + count > base.data.length || at + count > size) throw fail("delta copy");
      out.set(base.data.subarray(offset, offset + count), at);
      at += count;
    } else {
      if (cursor.at + op > raw.length || at + op > size) throw fail("delta insert");
      out.set(raw.subarray(cursor.at, cursor.at + op), at);
      cursor.at += op;
      at += op;
    }
  }
  if (at !== size) throw new GitRefusal("wrong-size", "delta result");
  return out;
}

interface Entry { offset: number; raw: Uint8Array; object?: DecodedObject; dependents: Entry[]; baseId?: string }
/** A full, self-contained SHA-1 pack; delta resolution is linear by dependencies. */
export async function decodePack(input: Uint8Array, options: PackReadOptions): Promise<DecodedObject[]> {
  const { bounds, maxBytes } = checked(options);
  if (input.length > maxBytes) throw large("pack bytes");
  const pack = new Uint8Array(input);
  if (pack.length < 32 || ascii(pack.subarray(0, 4)) !== "PACK") throw fail("pack header");
  const content = pack.subarray(0, pack.length - 20);
  if (hex(sha1(content)) !== hex(pack.subarray(pack.length - 20))) throw new GitRefusal("hash-mismatch", "pack trailer");
  const header = new DataView(pack.buffer);
  const version = header.getUint32(4);
  const count = header.getUint32(8);
  if (version !== 2 && version !== 3) throw fail("pack version");
  if (count > bounds.closureObjects) throw large("pack objects");
  const cursor = new Cursor(content, 12);
  const offsets = new Map<number, Entry>();
  const waiting = new Map<string, Entry[]>();
  const ready: Entry[] = [];
  const entries: Entry[] = [];
  let inflated = 0;
  const types: Partial<Record<number, ObjectType>> = { 1: "commit", 2: "tree", 3: "blob", 4: "tag" };
  for (let i = 0; i < count; i++) {
    const offset = cursor.at;
    const first = cursor.byte();
    const kind = (first >>> 4) & 7;
    const type = types[kind];
    if (type === undefined && kind !== 6 && kind !== 7) throw new GitRefusal("wrong-type", "pack entry");
    const size = first < 128 ? first & 15 : cursor.variable(first & 15, 16);
    if (size > (type === undefined ? maxBytes : typeLimit(type, bounds)) || inflated + size > maxBytes) throw large("inflated bytes");
    let baseOffset: number | undefined;
    let baseId: string | undefined;
    if (kind === 6) {
      let b = cursor.byte();
      let distance = b & 127;
      while ((b & 128) !== 0) {
        b = cursor.byte();
        distance = (distance + 1) * 128 + (b & 127);
        if (!Number.isSafeInteger(distance)) throw large("delta offset");
      }
      baseOffset = offset - distance;
      if (distance === 0 || !offsets.has(baseOffset)) throw fail("delta offset");
    } else if (kind === 7) {
      if (cursor.at + 20 > content.length) throw fail("delta base");
      baseId = objectId(hex(content.subarray(cursor.at, cursor.at + 20)), "delta base");
      cursor.at += 20;
    }
    const end = zlibEnd(content, cursor.at, size);
    const raw = await readBytes(new Blob([content.slice(cursor.at, end)]).stream().pipeThrough(new DecompressionStream("deflate")), size);
    if (raw.length !== size) throw new GitRefusal("wrong-size", "pack entry");
    cursor.at = end;
    inflated += size;
    const entry: Entry = { offset, raw, dependents: [] };
    if (type !== undefined) { entry.object = { id: idOf(type, raw), type, data: raw }; ready.push(entry); }
    else if (baseOffset !== undefined) offsets.get(baseOffset)!.dependents.push(entry);
    else {
      entry.baseId = baseId!;
      if (!waiting.has(baseId!)) waiting.set(baseId!, []);
      waiting.get(baseId!)!.push(entry);
    }
    offsets.set(offset, entry);
    entries.push(entry);
  }
  if (cursor.at !== content.length) throw fail("pack trailing data");
  const resolved = new Map<string, DecodedObject>();
  let constructed = ready.reduce((n, entry) => n + entry.object!.data.length, 0);
  for (let i = 0; i < ready.length; i++) {
    const entry = ready[i]!;
    const object = entry.object!;
    if (resolved.has(object.id)) throw fail("repeated pack object");
    resolved.set(object.id, object);
    const children = [...entry.dependents, ...(waiting.get(object.id) ?? [])];
    waiting.delete(object.id);
    for (const child of children) {
      const data = applyDelta(child.raw, object, Math.min(typeLimit(object.type, bounds), maxBytes - constructed));
      constructed += data.length;
      child.object = { id: idOf(object.type, data), type: object.type, data };
      ready.push(child);
    }
  }
  if (ready.length !== count) throw fail("unresolved delta base");
  return entries.map((entry) => entry.object!);
}

const packet = (line: string) => {
  const data = utf8.encode(line);
  return concat([utf8.encode((data.length + 4).toString(16).padStart(4, "0")), data]);
};
function readPacket(data: Uint8Array, at: number): { line: string | null; next: number } {
  const digits = ascii(data.subarray(at, at + 4));
  if (!/^[0-9a-f]{4}$/.test(digits)) throw fail("upload pkt-line");
  const n = Number.parseInt(digits, 16);
  if (n === 0) return { line: null, next: at + 4 };
  if (n <= 4 || n > 65520 || at + n > data.length) throw fail("upload pkt-line");
  const line = ascii(data.subarray(at + 4, at + n));
  return { line: line.endsWith("\n") ? line.slice(0, -1) : line, next: at + n };
}
interface Advertisement { refs: RefTarget[]; ids: Set<string>; capabilities: string[] }

/**
 * Verified pack objects are cached by exact ID, privately and bounded.
 * A commit want normally supplies its trees/blobs and ancestry in one pack.
 * An uncached nonadvertised want requires the server's advertised allowance;
 * any denial, missing wanted object, bad pack or HTTP failure rejects.
 * Only a complete advertisement can establish a ref's absence.
 */
export class SmartHttpSource implements GitSource {
  readonly #remote: string;
  readonly #authorization: string | undefined;
  readonly #fetch: (request: Request) => Promise<Response>;
  readonly #options: { maxBytes: number; bounds: ReadBounds };
  readonly #timeoutMs: number;
  readonly #objects = new Map<string, DecodedObject>();
  #retainedBytes = 0;
  constructor(options: SmartHttpOptions) {
    this.#remote = remoteUrl(options.remote, options.transport ?? "https").replace(/\/$/, "");
    if (!this.#remote.startsWith("https://") && !this.#remote.startsWith("http://")) throw new GitRefusal("bad-remote", "HTTP read remote");
    this.#authorization = options.authorization;
    this.#fetch = options.fetch ?? ((request) => fetch(request));
    this.#options = checked(options);
    this.#timeoutMs = options.timeoutMs ?? COMMAND_MS;
    if (!Number.isSafeInteger(this.#timeoutMs) || this.#timeoutMs <= 0) throw large("read deadline");
  }
  async #request(path: string, media: string, body?: Uint8Array): Promise<Uint8Array> {
    try {
      const url = `${this.#remote}/${path}`;
      const headers = new Headers({ accept: media, "cache-control": "no-cache" });
      if (this.#authorization !== undefined) headers.set("authorization", this.#authorization);
      if (body !== undefined) headers.set("content-type", "application/x-git-upload-pack-request");
      const response = await this.#fetch(new Request(url, { method: body === undefined ? "GET" : "POST", headers, redirect: "error", credentials: "omit", signal: AbortSignal.timeout(this.#timeoutMs), ...(body === undefined ? {} : { body }) }));
      if (response.status !== 200 || response.redirected || (response.url !== "" && response.url !== url) || response.headers.get("content-type")?.split(";", 1)[0]?.trim() !== media) {
        await response.body?.cancel().catch(() => undefined);
        throw fail("HTTP read response");
      }
      return await readBytes(response.body, this.#options.maxBytes);
    } catch (e) {
      if (e instanceof GitRefusal) throw e;
      throw fail("HTTP read request");
    }
  }
  async #advertisement(): Promise<Advertisement> {
    const data = await this.#request("info/refs?service=git-upload-pack", "application/x-git-upload-pack-advertisement");
    const lines: (string | null)[] = [];
    for (let at = 0; at < data.length;) { const p = readPacket(data, at); lines.push(p.line); at = p.next; }
    if (lines[0] !== "# service=git-upload-pack" || lines[1] !== null || lines.at(-1) !== null || lines.length < 3) throw fail("upload advertisement");
    const refs: RefTarget[] = [];
    const ids = new Set<string>();
    const names = new Set<string>();
    const capabilities: string[] = [];
    for (let i = 2; i < lines.length - 1; i++) {
      const line = lines[i];
      if (line === null || line === undefined) throw fail("upload advertisement");
      const nul = line.indexOf("\0");
      if ((i === 2 && nul < 0) || (i > 2 && nul >= 0)) throw fail("upload capabilities");
      if (nul >= 0) {
        const list = line.slice(nul + 1);
        if (!/^[!-~]+(?: [!-~]+)*$/.test(list)) throw fail("upload capabilities");
        capabilities.push(...list.split(" "));
        if (capabilities.some((c) => c.startsWith("object-format=") && c !== "object-format=sha1")) throw new GitRefusal("unsupported-object-format", "upload advertisement");
      }
      const match = /^([0-9a-f]{40}) (.+)$/.exec(nul < 0 ? line : line.slice(0, nul));
      if (match === null) throw fail("upload ref");
      const [id, name] = [match[1]!, match[2]!];
      if (id === ZERO_ID && name === "capabilities^{}" && lines.length === 4) continue;
      objectId(id, "upload object");
      if (names.has(name)) throw fail("repeated upload ref");
      names.add(name);
      if (names.size > this.#options.bounds.refs) throw large("upload refs");
      ids.add(id);
      if (name === "HEAD") continue;
      if (name.endsWith("^{}")) { refName(name.slice(0, -3), "peeled upload ref"); continue; }
      refs.push({ ref: refName(name, "upload ref"), target: id });
    }
    refs.sort((a, b) => a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0);
    return { refs, ids, capabilities };
  }
  async object(id: ObjectId, limit: number): Promise<StoredObject> {
    objectId(id, "read object");
    if (!Number.isSafeInteger(limit) || limit < 0) throw large("object allowance");
    if (!this.#objects.has(id)) {
      const ad = await this.#advertisement();
      if (!ad.ids.has(id) && !ad.capabilities.some((c) => c === "allow-tip-sha1-in-want" || c === "allow-reachable-sha1-in-want")) throw fail("unadvertised want");
      const selected = ad.capabilities.includes("ofs-delta") ? " ofs-delta" : "";
      const body = concat([packet(`want ${id}${selected}\n`), utf8.encode("0000"), packet("done\n")]);
      if (body.length > this.#options.maxBytes) throw large("upload request");
      const answer = await this.#request("git-upload-pack", "application/x-git-upload-pack-result", body);
      const nak = readPacket(answer, 0);
      if (nak.line !== "NAK") throw fail("upload negotiation");
      const objects = await decodePack(answer.subarray(nak.next), this.#options);
      if (!objects.some((o) => o.id === id)) throw fail("wanted object omitted");
      const additions = objects.filter((o) => !this.#objects.has(o.id));
      const bytes = additions.reduce((n, o) => n + o.data.length, 0);
      if (this.#objects.size + additions.length > this.#options.bounds.closureObjects || this.#retainedBytes + bytes > this.#options.maxBytes) throw large("read cache");
      for (const object of additions) this.#objects.set(object.id, object);
      this.#retainedBytes += bytes;
    }
    const object = this.#objects.get(id)!;
    return { type: object.type, size: object.data.length, data: object.data.length > limit ? null : new Uint8Array(object.data) };
  }
  async ref(name: string): Promise<string | null> {
    refName(name, "read ref");
    return (await this.#advertisement()).refs.find((r) => r.ref === name)?.target ?? null;
  }
  async refs(prefix: string, limit: number): Promise<readonly RefTarget[]> {
    if (!prefix.endsWith("/")) throw new GitRefusal("bad-ref-name", "read prefix");
    refName(`${prefix}x`, "read prefix");
    if (!Number.isSafeInteger(limit) || limit < 0) throw large("ref allowance");
    return (await this.#advertisement()).refs.filter((r) => r.ref.startsWith(prefix)).slice(0, limit + 1);
  }
}
