/** Read-only native byte admission for exact causal entry proofs. */
import type { Entry, FactRef, FactUse, Head } from "@generalbusiness/dap-contract";
import { canonicalize, digestBytes, entryHash, isDigest, isEntry, isFactRef, isFactUse, isScopeRef, parseStrict, utf8 } from "@generalbusiness/artroom-bytes";
import { isObject, same } from "@generalbusiness/dap-derive";
import type { Sql, SqlValue } from "./sqlite.ts";

export const PROOF_BYTE_BOUNDS = { body: 1024 * 1024, scope: 4096 } as const;
/** Caller reserves eight conservative calls; the native exact sender executes at most five SQL reads. */
export const EXACT_PROOF_RECEIVER_BOUNDS = Object.freeze({ sqlCalls: 5, calls: 8, metadata: 32 * 1024, milliseconds: 10_000 });
export interface ProofBody { fact: FactRef; bytes: string }
/** Only a trusted native sender can promise admission before materialization. */
export interface ProofSource { read(fact: FactRef, maxBytes: number, milliseconds?: number): Promise<ProofBody | null> }
export type ProofRead = { kind: "body"; value: ProofBody } | { kind: "missing" | "unavailable" };
export interface ProofIdentity { genesis: FactRef; head: Head }
const integer = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
const cap = (n: number): number | null => integer(n) && n > 0 ? Math.min(n, PROOF_BYTE_BOUNDS.body) : null;

/** Both bindings matter: an entry's fact hash is not its raw content digest. */
export function proofEntry(value: ProofBody, fact: FactRef, maxBytes: number, content?: FactUse["content"]): Entry | null {
  try {
    const allowed = cap(maxBytes);
    if (allowed === null || !isFactRef(fact) || !isFactRef(value.fact) || !same(value.fact, fact) || typeof value.bytes !== "string"
      || value.bytes.length > allowed) return null;
    const raw = utf8(value.bytes);
    if (raw.length > allowed || (content !== undefined && digestBytes(raw) !== content)) return null;
    const entry: unknown = parseStrict(value.bytes);
    return isEntry(entry) && same(entry.at, fact.at) && entry.seq === fact.seq && canonicalize(entry) === value.bytes && entryHash(entry) === fact.hash ? entry : null;
  } catch { return null; }
}

export class ProofBytes {
  readonly #sql: Pick<Sql, "exec">;
  readonly #beforeSql: () => void;
  constructor(sql: Pick<Sql, "exec">, beforeSql: () => void = () => {}) { this.#sql = sql; this.#beforeSql = beforeSql; }
  #one(query: string, ...bindings: SqlValue[]) { this.#beforeSql(); return this.#sql.exec(query, ...bindings).toArray()[0] ?? null; }
  /** Admit the entire metadata row, not just the fields later projected. */
  identity(): ProofIdentity | null {
    try {
      const row = this.#one("SELECT CASE WHEN octet_length(v)<=? THEN v ELSE NULL END AS v FROM meta WHERE k='scope'", PROOF_BYTE_BOUNDS.scope);
      if (typeof row?.["v"] !== "string") return null;
      const value: unknown = parseStrict(row["v"]);
      if (!isObject(value) || !isScopeRef(value["at"]) || !["active", "provisional"].includes(value["status"] as string)
        || !isObject(value["genesis"]) || !isDigest(value["genesis"]["hash"])
        || !isObject(value["head"]) || !integer(value["head"]["seq"]) || !isDigest(value["head"]["hash"])) return null;
      return { genesis: { at: value["at"], seq: 0, hash: value["genesis"]["hash"] }, head: { seq: value["head"]["seq"], hash: value["head"]["hash"] } };
    } catch { return null; }
  }
  own(seq: number, maxBytes: number): ProofRead {
    if (!integer(seq) || cap(maxBytes) === null) return { kind: "unavailable" };
    try {
      const current = this.identity();
      if (!current || seq > current.head.seq) return { kind: "unavailable" };
      const row = this.#one("SELECT CASE WHEN octet_length(hash)=71 THEN hash ELSE NULL END AS hash, octet_length(bytes) AS size FROM entry WHERE seq=?", seq);
      if (!row) return { kind: "missing" };
      if (!isDigest(row["hash"]) || !integer(row["size"]) || row["size"] > cap(maxBytes)!) return { kind: "unavailable" };
      const fact = { at: current.genesis.at, seq, hash: row["hash"] };
      if (seq === 0 && fact.hash !== current.genesis.hash) return { kind: "unavailable" };
      const body = this.#one("SELECT bytes FROM entry WHERE seq=? AND octet_length(bytes)=?", seq, row["size"]);
      if (typeof body?.["bytes"] !== "string") return { kind: "unavailable" };
      const value = { fact, bytes: body["bytes"] };
      return proofEntry(value, fact, cap(maxBytes)!) ? { kind: "body", value } : { kind: "unavailable" };
    } catch { return { kind: "unavailable" }; }
  }
  /** Internal RPC sender: no native turn, driver, origin or definition read. */
  exact(fact: unknown, maxBytes: number): ProofBody | null {
    if (!isFactRef(fact) || cap(maxBytes) === null) return null;
    const current = this.identity();
    if (!current || !same(current.genesis.at, fact.at) || fact.seq > current.head.seq) return null;
    // Reject wrong metadata hash before a body can be selected.
    try {
      const row = this.#one("SELECT CASE WHEN octet_length(hash)=71 THEN hash ELSE NULL END AS hash FROM entry WHERE seq=?", fact.seq);
      if (row?.["hash"] !== fact.hash) return null;
      const read = this.own(fact.seq, maxBytes);
      return read.kind === "body" && same(read.value.fact, fact) ? read.value : null;
    } catch { return null; }
  }
  retained(use: FactUse, maxBytes: number): ProofRead {
    if (!isFactUse(use) || cap(maxBytes) === null) return { kind: "unavailable" };
    try {
      const row = this.#one("SELECT octet_length(bytes) AS size FROM retained_input WHERE kind='entry' AND digest=?", use.content);
      if (!row) return { kind: "missing" };
      if (!integer(row["size"]) || row["size"] > cap(maxBytes)!) return { kind: "unavailable" };
      const body = this.#one("SELECT bytes FROM retained_input WHERE kind='entry' AND digest=? AND octet_length(bytes)=?", use.content, row["size"]);
      if (typeof body?.["bytes"] !== "string") return { kind: "unavailable" };
      const value = { fact: use.fact, bytes: body["bytes"] };
      return proofEntry(value, use.fact, cap(maxBytes)!, use.content) ? { kind: "body", value } : { kind: "unavailable" };
    } catch { return { kind: "unavailable" }; }
  }
}
