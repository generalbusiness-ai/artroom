/** Strict, explicit-format archive primitives. Legacy Reader, objectId,
 * idOf, snapshots and provider contracts retain their original behavior. */
import { hex, sha1, sha256, utf8 } from "@generalbusiness/artroom-bytes";
import { JournalWork, refuseJournal } from "./journal-work.ts";

export type JournalFormat = "sha1" | "sha256";
export type JournalObjectType = "blob" | "tree" | "commit";
export interface JournalObject { readonly id: string; readonly type: JournalObjectType; readonly data: Uint8Array }
export interface JournalObjectSource {
  /** limit zero is a metadata probe. Nonempty bodies must not be loaded. */
  object(id: string, limit: number): Promise<{ type: string; size: number; data: Uint8Array | null } | null>;
}
export interface JournalTreeRow { readonly mode: "100644" | "40000"; readonly name: string; readonly id: string }
export interface JournalCommit { readonly tree: string; readonly parent: string | null; readonly seconds: number }
export const JOURNAL_IDENTITY = "Artroom Journal <journal@artroom.invalid>";
export const JOURNAL_MESSAGE = "Archive journal.\n";
/** Unix epoch through the final whole second of native four-digit UTC
 * years. Earlier native times are explicitly unavailable to this encoder. */
export const JOURNAL_LAST_SECOND = 253_402_300_799;
const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const types: readonly string[] = ["blob", "tree", "commit"];
const badName = /[^a-z0-9_.-]/;
export function journalFormat(value: unknown): JournalFormat {
  return value === "sha1" || value === "sha256" ? value : refuseJournal("format");
}
export function journalId(format: JournalFormat, value: unknown): string {
  journalFormat(format);
  const length = format === "sha1" ? 40 : 64;
  if (typeof value !== "string" || value.length !== length || /[^0-9a-f]/.test(value) || /^0+$/.test(value)) refuseJournal("object-id");
  return value;
}
function name(value: string): string {
  if (typeof value !== "string" || (value.length < 1 || value.length > 255 || badName.test(value)) || value === "." || value === "..") refuseJournal("tree");
  return value;
}
export function journalByteOrder(a: Uint8Array, b: Uint8Array): number {
  for (let i = 0, n = Math.min(a.length, b.length); i < n; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return a.length - b.length;
}
function concatenate(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
}
function hash(format: JournalFormat, type: JournalObjectType, data: Uint8Array): string {
  return hex((format === "sha1" ? sha1 : sha256)(concatenate([utf8(`${type} ${data.length}\0`), data])));
}
const rawId = (id: string): Uint8Array => Uint8Array.from(id.match(/../g)!, pair => Number.parseInt(pair, 16));
const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((v, i) => v === b[i]);
const secondsOf = (n: number): number => Number.isSafeInteger(n) && n >= 0 && !Object.is(n, -0) && n <= JOURNAL_LAST_SECOND ? n : refuseJournal("timestamp");

/** A build owns its object bytes. Every repeated construction is charged
 * before copying/hashing; only identical objects deduplicate in the result. */
export class JournalObjects {
  readonly #objects = new Map<string, JournalObject>();
  constructor(readonly format: JournalFormat, readonly work: JournalWork) { journalFormat(format); }
  #reserve(type: JournalObjectType, size: number): void {
    this.work.size(size);
    const header = `${type} ${size}\0`;
    this.work.spend({ objects: 1, outputWork: header.length + size });
    this.work.metadata(256);
    this.work.input(header.length + size, 3);
  }
  make(type: JournalObjectType, input: Uint8Array): JournalObject {
    if (!types.includes(type) || !(input instanceof Uint8Array)) refuseJournal("object-mismatch");
    this.#reserve(type, input.length);
    return this.#keep(type, input);
  }
  #keep(type: JournalObjectType, input: Uint8Array): JournalObject {
    const data = input.slice(), id = hash(this.format, type, data);
    this.work.check();
    const before = this.#objects.get(id);
    if (before) {
      if (before.type !== type || !sameBytes(before.data, data)) refuseJournal("object-mismatch");
      return before;
    }
    const object = { id, type, data };
    this.#objects.set(id, object);
    return object;
  }
  tree(rows: readonly JournalTreeRow[]): JournalObject {
    this.work.spend({ trees: 1, names: rows.length });
    if (rows.length > 4096) refuseJournal("limit");
    // Reserve row metadata before cloning/sorting the caller's list.
    this.work.metadata(rows.length * 512);
    const ordered = rows.map(row => {
      if (row.mode !== "100644" && row.mode !== "40000") refuseJournal("tree");
      name(row.name); journalId(this.format, row.id);
      return { row, key: utf8(row.name + (row.mode === "40000" ? "/" : "")) };
    }).sort((a, b) => journalByteOrder(a.key, b.key));
    const seen = new Set<string>();
    const width = this.format === "sha1" ? 20 : 32;
    let length = 0;
    for (const { row } of ordered) {
      if (seen.has(row.name)) refuseJournal("tree");
      seen.add(row.name);
      length += row.mode.length + 1 + row.name.length + 1 + width;
    }
    this.#reserve("tree", length);
    this.work.input(length);
    const body = new Uint8Array(length);
    let at = 0;
    for (const { row } of ordered) {
      const prefix = utf8(`${row.mode} ${row.name}\0`); body.set(prefix, at); at += prefix.length;
      body.set(rawId(row.id), at); at += width;
    }
    return this.#keep("tree", body);
  }
  commit(tree: string, parent: string | null, seconds: number): JournalObject {
    journalId(this.format, tree);
    if (parent !== null) journalId(this.format, parent);
    const identity = `${JOURNAL_IDENTITY} ${secondsOf(seconds)} +0000`;
    const body = `tree ${tree}\n${parent === null ? "" : `parent ${parent}\n`}author ${identity}\ncommitter ${identity}\n\n${JOURNAL_MESSAGE}`;
    this.#reserve("commit", body.length); // All header/message characters are ASCII.
    return this.#keep("commit", utf8(body));
  }
  /** A result is exposed only by the caller after the complete build fence. */
  objects(): readonly JournalObject[] { this.work.metadata(this.#objects.size * 64); return [...this.#objects.values()]; }
}

/** Reads exact named objects, with a metadata probe before reserving body
 * work. The same original native budget fences both awaited calls. */
export class JournalObjectReader {
  constructor(readonly format: JournalFormat, readonly source: JournalObjectSource, readonly work: JournalWork) { journalFormat(format); }
  async read(id: string, type: JournalObjectType): Promise<Uint8Array> {
    journalId(this.format, id);
    this.work.spend({ objects: 1 });
    this.work.budget.spend({ attempts: 1, calls: 1, metadata: 128, inputWork: 128 });
    const probe = await this.work.budget.wait(() => this.source.object(id, 0));
    if (!probe) return refuseJournal("missing-object");
    if (probe.type !== type || !Number.isSafeInteger(probe.size) || probe.size < 0 || Object.is(probe.size, -0)) refuseJournal("object-mismatch");
    this.work.size(probe.size);
    if (probe.data !== null && (!(probe.data instanceof Uint8Array) || probe.data.length !== 0 || probe.size !== 0)) refuseJournal("object-mismatch");
    this.work.budget.spend({ calls: 1, inputWork: probe.size * 4 + 128 });
    const got = await this.work.budget.wait(() => this.source.object(id, probe.size));
    if (!got || got.type !== type || got.size !== probe.size || !(got.data instanceof Uint8Array) || got.data.length !== probe.size) refuseJournal("object-mismatch");
    const body = got.data.slice();
    if (hash(this.format, type, body) !== id) refuseJournal("object-mismatch");
    this.work.check();
    return body;
  }
  tree(body: Uint8Array): readonly JournalTreeRow[] {
    this.work.size(body.length); this.work.spend({ trees: 1 });
    this.work.input(body.length, 3);
    const width = this.format === "sha1" ? 20 : 32, rows: JournalTreeRow[] = [];
    let previous: Uint8Array | null = null;
    const seen = new Set<string>();
    for (let at = 0; at < body.length;) {
      this.work.check();
      if (rows.length === 4096) refuseJournal("limit");
      this.work.spend({ names: 1 }); this.work.metadata(512);
      const space = body.indexOf(32, at), nul = space < 0 ? -1 : body.indexOf(0, space + 1);
      if (space < 0 || space - at > 6 || nul < 0 || nul - space - 1 > 255 || nul + 1 + width > body.length) refuseJournal("tree");
      let mode: string, filename: string;
      try { mode = text.decode(body.subarray(at, space)); filename = text.decode(body.subarray(space + 1, nul)); } catch { return refuseJournal("tree"); }
      if (mode !== "100644" && mode !== "40000") refuseJournal("tree");
      name(filename);
      const key = utf8(filename + (mode === "40000" ? "/" : ""));
      if (seen.has(filename) || (previous && journalByteOrder(previous, key) >= 0)) refuseJournal("tree");
      seen.add(filename); previous = key;
      const id = hex(body.subarray(nul + 1, nul + 1 + width)); journalId(this.format, id);
      rows.push({ mode, name: filename, id }); at = nul + 1 + width;
    }
    return rows;
  }
  commit(body: Uint8Array): JournalCommit {
    this.work.size(body.length); this.work.input(body.length, 3);
    let value: string;
    try { value = text.decode(body); } catch { return refuseJournal("commit"); }
    const lines = value.split("\n"), parent = lines[1]?.startsWith("parent ") ? lines[1]!.slice(7) : null;
    const offset = parent === null ? 1 : 2;
    if (!lines[0]?.startsWith("tree ")) refuseJournal("commit");
    const tree = journalId(this.format, lines[0]!.slice(5));
    if (parent !== null) journalId(this.format, parent);
    const identity = `${JOURNAL_IDENTITY} `;
    if (!lines[offset]?.startsWith("author " + identity)) refuseJournal("commit");
    const stamp = lines[offset]!.slice(("author " + identity).length);
    const seconds = secondsOf(Number(stamp.slice(0, -6)));
    if (stamp !== `${seconds} +0000`) refuseJournal("timestamp");
    if (lines[offset + 1] !== `committer ${identity}${stamp}` || lines.slice(offset + 2).join("\n") !== `\n${JOURNAL_MESSAGE}`) refuseJournal("commit");
    return { tree, parent, seconds };
  }
}
