/** Bounded native retained-byte mechanism. This helper grants no phase or
 * privacy admission. The owning inventory must finish privacy/root policy
 * before value/rule/snapshot selection; declaration metadata is permitted
 * earlier. No entry-copy or detached-text body can be read here. */
import { DOMAINS, RETAINED_INPUT_BYTES, type Digest } from "@generalbusiness/dap-contract";
import { canonicalize, domainRetainedJSON, rawRetainedJSON, utf8 } from "@generalbusiness/artroom-bytes";
import { checkedRetainedKey, type ProbeDependency, type RetainedKey } from "@generalbusiness/dap-derive";
import { ArchiveBudget } from "./archive-budget.ts";
import { ArchivePrefixStopped } from "./archive-prefix.ts";
import type { Sql } from "./sqlite.ts";

export interface ArchiveRetainedValue { readonly bytes: string; readonly value: unknown }
const nativeDomains: ReadonlySet<string> = new Set(Object.values(DOMAINS));
const natural = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0 && !Object.is(n, -0);
const keyName = (key: RetainedKey): string => JSON.stringify(key.kind === "value" ? [key.kind, key.domain, key.digest] : [key.kind, key.digest]);

export class ArchiveRetainedReader {
  readonly #cache = new Map<string, string>();
  constructor(readonly sql: Pick<Sql, "exec">, readonly budget: ArchiveBudget) {}
  /** An unconfigured potential definition probe may be genuinely absent.
   * Inspect only its native keyed existence before requesting policy; an
   * uncovered present candidate still refuses before any body fetch. */
  definitionPresent(digest: Digest): boolean {
    checkedRetainedKey({ kind: "definition", digest });
    this.budget.spend({ attempts: 1, inputWork: 256 });
    const rows = this.budget.native(this.sql, () => ({ metadata: 32, inputWork: 0 })).exec("SELECT 1 AS present FROM retained_input WHERE kind = 'definition' AND digest = ? LIMIT 1", digest).toArray();
    if (rows.length === 0) return false;
    if (rows.length !== 1 || rows[0]?.["present"] !== 1) return this.budget.stop("unavailable");
    return true;
  }
  /** Every request spends an attempt, including failed probes and cache
   * hits. Decode/hash work is reserved again before repeat validation. */
  read(key: RetainedKey, max: number): ArchiveRetainedValue | null {
    key = checkedRetainedKey(key);
    this.budget.spend({ attempts: 1, inputWork: 256 });
    if (key.kind === "entry") throw new ArchivePrefixStopped("unsupported-foreign-copy");
    // Runtime check as well as the closed TypeScript key; never fall through
    // an unknown future kind into the ordinary retained_input table.
    if (!["definition", "rule", "snapshot", "value"].includes(key.kind)) throw new ArchivePrefixStopped("unavailable");
    if (key.kind === "value" && (!nativeDomains.has(key.domain) || key.domain === DOMAINS.definition)) throw new ArchivePrefixStopped("unsupported-custom-domain");
    if (!natural(max) || max === 0 || max > RETAINED_INPUT_BYTES) return this.budget.stop("limit");
    const cacheKey = keyName(key);
    let bytes = this.#cache.get(cacheKey);
    let size: number;
    if (bytes === undefined) {
      const value = key.kind === "value", where = value ? "domain = ? AND digest = ?" : "kind = ? AND digest = ?", table = value ? "retained_value" : "retained_input";
      const bindings = [key.kind === "value" ? key.domain : key.kind, key.digest];
      const rows = this.budget.native(this.sql, () => ({ metadata: 96, inputWork: 0 })).exec(`SELECT octet_length(bytes) AS size, typeof(bytes) AS type FROM ${table} WHERE ${where} LIMIT 1`, ...bindings).toArray();
      if (rows.length === 0) return null;
      const row = rows[0];
      if (rows.length !== 1 || row?.["type"] !== "text" || !natural(row["size"]) || row["size"] === 0 || row["size"] > max) return null;
      size = row["size"];
      this.budget.spend({ inputWork: size * 32 });
      const body = this.budget.native(this.sql, () => ({ metadata: 0, inputWork: size })).exec(`SELECT bytes FROM ${table} WHERE ${where} AND typeof(bytes) = 'text' AND octet_length(bytes) = ? LIMIT 1`, ...bindings, size).toArray();
      if (body.length !== 1 || typeof body[0]?.["bytes"] !== "string") return this.budget.stop("unavailable");
      bytes = body[0]["bytes"];
    } else {
      // UTF-16 length is a lower bound before allocating UTF-8. The
      // reservation is conservative for up to three bytes per code unit.
      if (bytes.length > max) return null;
      this.budget.spend({ inputWork: bytes.length * 3 * 32 });
      size = utf8(bytes).length;
    }
    if (bytes.length > max || utf8(bytes).length !== size || size > max) return null;
    const parsed = key.kind === "rule" ? rawRetainedJSON(key.digest, bytes)
      : domainRetainedJSON(key.kind === "value" ? key.domain : key.kind === "definition" ? DOMAINS.definition : DOMAINS.snapshot, key.digest, bytes, { canonical: true, max });
    this.budget.check();
    if (parsed === undefined || canonicalize(parsed) !== bytes) return null;
    this.budget.check();
    this.#cache.set(cacheKey, bytes);
    return { bytes, value: parsed };
  }
}

/** Ordered byte-validated probe, after the caller's closed dependency
 * admission. A miss/invalid candidate spends its attempt and selects nothing;
 * the first valid native key wins and later candidates are never fetched. */
export function readArchiveProbe(reader: ArchiveRetainedReader, probe: ProbeDependency, max: number, definitionBytes: number): { key: RetainedKey; value: ArchiveRetainedValue } | null {
  for (const { key } of probe.choices) {
    const value = reader.read(key, key.kind === "definition" ? Math.min(max, definitionBytes) : max);
    if (value) return { key, value };
  }
  return null;
}
