/** Derived signer evidence. No public admission, replay judgment or resolver work. */
import type { Digest, Entry, Head, KeyId, ScopeRef, Timestamp } from "@generalbusiness/dap-contract";
import { canonicalize, entryHash, isDigest, isEntry, isKeyId, isScopeRef, parseStrict, utf8 } from "@generalbusiness/artroom-bytes";
import { isObject, same, timeMs, type ScopeState } from "@generalbusiness/dap-derive";
import { signerOf } from "./entry-signer.ts";
import type { Sql, SqlValue } from "./sqlite.ts";

export const SIGNER_INDEX_BOUNDS = { rows: 128, bytes: 1024 * 1024, controlBytes: 4096, retryMs: 1000 } as const;
type Fault = "generation" | "tail" | "missing-entry" | "metadata" | "unfit-entry" | "entry" | "chain" | "cutoff";
interface Control {
  v: 1; at: ScopeRef; phase: "building" | "ready" | "stopped";
  cutoff: Head; next: number; prev: Digest | null; time: Timestamp | null;
  tail: Head; tailTime: Timestamp; reason?: Fault;
}
type SignerScope = Pick<ScopeState, "at" | "head" | "time"> | null | "unavailable";
interface Metadata { seq: number; hash: Digest; time: Timestamp; size: number; bytes: number }
export type LocalSignerProof = { state: "positive"; seq: number; time: Timestamp } | { state: "negative" | "unknown" };
const integer = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const head = (v: unknown): v is Head => isObject(v) && Object.keys(v).length === 2 && integer(v["seq"]) && isDigest(v["hash"]);
const faults: readonly string[] = ["generation", "tail", "missing-entry", "metadata", "unfit-entry", "entry", "chain", "cutoff"];
const SCHEMA = `
CREATE TABLE IF NOT EXISTS local_signer_control (id INTEGER PRIMARY KEY CHECK (id = 1), value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS latest_local_signer (actor TEXT PRIMARY KEY, generation TEXT NOT NULL, seq INTEGER NOT NULL, time TEXT NOT NULL, hash TEXT NOT NULL) WITHOUT ROWID;
`;
// Hash/time are themselves bounded before being returned to JS. Body size
// comes from the direct TEXT column, not the legacy size assertion.
const META = "seq, CASE WHEN octet_length(hash) = 71 THEN hash ELSE NULL END AS hash, CASE WHEN octet_length(time) <= 32 THEN time ELSE NULL END AS time, size, octet_length(bytes) AS bytes";

export class LocalSigners {
  readonly #sql: Sql;
  readonly #scope: () => SignerScope;
  constructor(sql: Sql, scope: () => SignerScope) {
    this.#sql = sql; this.#scope = scope;
    sql.exec(SCHEMA).toArray();
    if (this.#load() === null) {
      const current = scope();
      // Fixed control capture only: no constructor history traversal.
      if (current && current !== "unavailable") this.#save({ v: 1, at: { ...current.at }, phase: "building", cutoff: { ...current.head }, next: 0, prev: null, time: null, tail: { ...current.head }, tailTime: current.time });
    }
  }
  #one(query: string, ...bindings: SqlValue[]): Record<string, SqlValue> | null { return this.#sql.exec(query, ...bindings).toArray()[0] ?? null; }
  #save(c: Control): void { this.#sql.exec("INSERT INTO local_signer_control (id,value) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value", canonicalize(c)).toArray(); }
  #load(): Control | null | "invalid" {
    let row: Record<string, SqlValue> | null;
    try {
      row = this.#one("SELECT CASE WHEN octet_length(value) <= ? THEN value ELSE NULL END AS value FROM local_signer_control WHERE id=1", SIGNER_INDEX_BOUNDS.controlBytes);
    } catch (error) {
      if (error instanceof Error && /no such (?:function|table|column)|malformed|corrupt/i.test(error.message)) return "invalid";
      throw error;
    }
    if (!row) return null;
    if (typeof row["value"] !== "string") return "invalid";
    try {
      const c: unknown = parseStrict(row["value"]);
      if (!isObject(c) || c["v"] !== 1 || !isScopeRef(c["at"]) || !["building", "ready", "stopped"].includes(c["phase"] as string)
        || !head(c["cutoff"]) || !head(c["tail"]) || !integer(c["next"]) || c["next"] > c["cutoff"].seq + 1 || c["tail"].seq < c["cutoff"].seq
        || !(c["prev"] === null || isDigest(c["prev"])) || !(c["time"] === null || typeof c["time"] === "string" && timeMs(c["time"]) !== null)
        || typeof c["tailTime"] !== "string" || timeMs(c["tailTime"]) === null
        || (c["next"] === 0 ? c["prev"] !== null || c["time"] !== null : !isDigest(c["prev"]) || c["time"] === null)
        || (c["phase"] === "ready" && (c["next"] !== c["cutoff"].seq + 1 || c["prev"] !== c["cutoff"].hash))
        || (c["phase"] === "stopped" ? !faults.includes(c["reason"] as string) : c["reason"] !== undefined)
        || canonicalize(c) !== row["value"]
        || Object.keys(c).sort().join() !== ["v", "at", "phase", "cutoff", "next", "prev", "time", "tail", "tailTime", ...(c["reason"] === undefined ? [] : ["reason"])].sort().join()) return "invalid";
      return c as unknown as Control;
    } catch { return "invalid"; }
  }
  #generation(c: Control): string { return canonicalize([c.v, c.at]); }
  #stop(c: Control, reason: Fault): void { c.phase = "stopped"; c.reason = reason; this.#save(c); }
  #metadata(row: Record<string, SqlValue> | null): Metadata | null {
    if (!row || !integer(row["seq"]) || !isDigest(row["hash"]) || typeof row["time"] !== "string" || timeMs(row["time"]) === null
      || !integer(row["size"]) || !integer(row["bytes"]) || row["size"] !== row["bytes"]) return null;
    return row as unknown as Metadata;
  }
  #entry(m: Metadata): Entry | null {
    if (m.bytes > SIGNER_INDEX_BOUNDS.bytes) return null;
    const row = this.#one("SELECT bytes FROM entry WHERE seq=? AND octet_length(bytes)=?", m.seq, m.bytes);
    if (typeof row?.["bytes"] !== "string" || utf8(row["bytes"]).length !== m.bytes) return null;
    try {
      const e: unknown = parseStrict(row["bytes"]);
      return isEntry(e) && canonicalize(e) === row["bytes"] && e.seq === m.seq && e.time === m.time && entryHash(e) === m.hash ? e : null;
    } catch { return null; }
  }
  #keep(c: Control, e: Entry, hash: Digest): void {
    const actor = signerOf(e);
    if (actor === null) return;
    this.#sql.exec("INSERT INTO latest_local_signer (actor,generation,seq,time,hash) VALUES (?,?,?,?,?) ON CONFLICT(actor) DO UPDATE SET generation=excluded.generation,seq=excluded.seq,time=excluded.time,hash=excluded.hash WHERE latest_local_signer.generation=excluded.generation AND latest_local_signer.seq<excluded.seq", actor, this.#generation(c), e.seq, e.time, hash).toArray();
  }
  /** Called only from native append, in the existing sealing transaction. */
  appended(entry: Entry, hash: Digest): void {
    let c = this.#load();
    if (c === "invalid" || c?.phase === "stopped") return;
    if (c === null) {
      if (entry.seq !== 0 || entry.prev !== null || entry.input.type !== "genesis") return;
      c = { v: 1, at: { ...entry.at }, phase: "ready", cutoff: { seq: 0, hash }, next: 1, prev: hash, time: entry.time, tail: { seq: 0, hash }, tailTime: entry.time };
    } else {
      if (!same(c.at, entry.at)) { this.#stop(c, "generation"); return; }
      if (entry.seq !== c.tail.seq + 1 || entry.prev !== c.tail.hash || timeMs(entry.time)! < timeMs(c.tailTime)!) { this.#stop(c, "tail"); return; }
      c.tail = { seq: entry.seq, hash }; c.tailTime = entry.time;
    }
    this.#keep(c, entry, hash); this.#save(c);
  }
  /** Private readiness only. Invalid control is quarantined, never hot-looped. */
  pending(): boolean {
    try { const c = this.#load(); return c !== null && c !== "invalid" && c.phase === "building"; }
    catch { return true; } // transient storage failure re-arms a bounded retry
  }
  status(): { phase: "empty" | "unavailable" | "invalid" | Control["phase"]; next?: number; cutoff?: Head; reason?: Fault } {
    const c = this.#load();
    return c === null ? { phase: this.#scope() === "unavailable" ? "unavailable" : "empty" } : c === "invalid" ? { phase: "invalid" } : { phase: c.phase, next: c.next, cutoff: c.cutoff, ...(c.reason ? { reason: c.reason } : {}) };
  }
  #fault(c: Control): Fault | null {
    const s = this.#scope();
    if (s === "unavailable") return "metadata";
    if (!s || !same(s.at, c.at)) return "generation";
    if (s.head.seq !== c.tail.seq || s.head.hash !== c.tail.hash || s.time !== c.tailTime) return "tail";
    const tail = this.#metadata(this.#one(`SELECT ${META} FROM entry WHERE seq=?`, c.tail.seq));
    const cutoff = this.#metadata(this.#one(`SELECT ${META} FROM entry WHERE seq=?`, c.cutoff.seq));
    const prefix = c.next === 0 ? null : this.#metadata(this.#one(`SELECT ${META} FROM entry WHERE seq=?`, c.next - 1));
    if (tail === null || cutoff === null || (c.next > 0 && prefix === null)) return "metadata";
    if (tail.hash !== c.tail.hash || tail.time !== c.tailTime) return "tail";
    if (cutoff.hash !== c.cutoff.hash) return "cutoff";
    if (c.next > 0 && (prefix!.hash !== c.prev || prefix!.time !== c.time)) return "chain";
    return null;
  }
  /** Tri-state evidence only. Public callers must not receive these diagnostics. */
  proof(actor: KeyId, since: number): LocalSignerProof {
    try {
      const c = this.#load();
      if (!isKeyId(actor) || !Number.isFinite(since) || c === null || c === "invalid" || c.phase === "stopped") return { state: "unknown" };
      if (this.#fault(c) !== null) return { state: "unknown" };
      const row = this.#one("SELECT CASE WHEN octet_length(generation)<=512 THEN generation ELSE NULL END AS generation, seq, CASE WHEN octet_length(time)<=32 THEN time ELSE NULL END AS time, CASE WHEN octet_length(hash)=71 THEN hash ELSE NULL END AS hash FROM latest_local_signer WHERE actor=?", actor);
      if (row) {
        if (row["generation"] !== this.#generation(c) || !integer(row["seq"]) || row["seq"] > c.tail.seq || (row["seq"] <= c.cutoff.seq && row["seq"] >= c.next)) return { state: "unknown" };
        const m = this.#metadata(this.#one(`SELECT ${META} FROM entry WHERE seq=?`, row["seq"]));
        if (!m || m.hash !== row["hash"] || m.time !== row["time"]) return { state: "unknown" };
        const e = this.#entry(m);
        if (!e || !same(e.at, c.at) || signerOf(e) !== actor) return { state: "unknown" };
        if (timeMs(e.time)! >= since) return { state: "positive", seq: e.seq, time: e.time };
      }
      return { state: c.phase === "ready" ? "negative" : "unknown" };
    } catch { return { state: "unknown" }; }
  }
  /** One durable quantum; no resolver, judgment, native entry or outside effect. */
  maintain(): { rows: number; bytes: number; pending: boolean } {
    return this.#sql.transaction(() => {
      const c = this.#load();
      if (c === null || c === "invalid" || c.phase !== "building") return { rows: 0, bytes: 0, pending: false };
      const fault = this.#fault(c);
      if (fault !== null) { this.#stop(c, fault); return { rows: 0, bytes: 0, pending: false }; }
      const selected = this.#sql.exec(`SELECT ${META} FROM entry WHERE seq>=? AND seq<=? ORDER BY seq LIMIT ?`, c.next, c.cutoff.seq, SIGNER_INDEX_BOUNDS.rows).toArray();
      if (selected.length > SIGNER_INDEX_BOUNDS.rows) { this.#stop(c, "metadata"); return { rows: 0, bytes: 0, pending: false }; }
      let rows = 0, bytes = 0, deferred = false;
      for (const raw of selected) {
        const m = this.#metadata(raw);
        if (!m) { this.#stop(c, "metadata"); break; }
        if (m.seq !== c.next) { this.#stop(c, "missing-entry"); break; }
        if (m.seq === Number.MAX_SAFE_INTEGER) { this.#stop(c, "unfit-entry"); break; }
        if (m.bytes > SIGNER_INDEX_BOUNDS.bytes) { this.#stop(c, "unfit-entry"); break; }
        if (m.bytes > SIGNER_INDEX_BOUNDS.bytes - bytes) { deferred = true; break; }
        rows++; bytes += m.bytes; // charge admitted work even when validation stops
        const e = this.#entry(m);
        if (!e || !same(e.at, c.at)) { this.#stop(c, "entry"); break; }
        if (e.prev !== c.prev || (c.time !== null && timeMs(e.time)! < timeMs(c.time)!)) { this.#stop(c, "chain"); break; }
        if (e.seq === 0 && (e.input.type !== "genesis" || e.prev !== null)) { this.#stop(c, "chain"); break; }
        this.#keep(c, e, m.hash); c.next++; c.prev = m.hash; c.time = e.time;
      }
      if (c.phase === "building") {
        if (c.next === c.cutoff.seq + 1) {
          if (c.prev !== c.cutoff.hash) this.#stop(c, "cutoff");
          else { c.phase = "ready"; this.#save(c); }
        } else if (!deferred && selected.length < SIGNER_INDEX_BOUNDS.rows) this.#stop(c, "missing-entry");
        else this.#save(c);
      }
      return { rows, bytes, pending: c.phase === "building" };
    });
  }
}
