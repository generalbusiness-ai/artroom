/** Derived native admission metadata only. No history-body fallback,
 * archive inventory, privacy certificate or export permission. */
import type { Digest, Entry, ScopeRef, Seed } from "@generalbusiness/dap-contract";
import { canonicalize, isDigest, isRecord, isScopeRef, isSeed, parseStrict, scopeIdOf, utf8 } from "@generalbusiness/artroom-bytes";
import type { Sql, SqlValue } from "./sqlite.ts";

export const ARCHIVE_PIN_KEY = "archive-pin-1";
export const ARCHIVE_PIN_BYTES = 1024;
export const ARCHIVE_SCOPE_METADATA_BYTES = 16 * 1024;
export interface ArchivePin {
  readonly format: "artroom-archive-pin-1";
  readonly at: ScopeRef;
  readonly seed: Seed;
  readonly genesis: Digest;
}
const sameScope = (a: ScopeRef, b: ScopeRef): boolean => a.scope === b.scope && a.inc === b.inc && a.kind === b.kind;
const bytesWithin = (n: unknown, max: number): n is number => typeof n === "number" && Number.isSafeInteger(n) && n > 0 && n <= max;
function pinOf(value: unknown): ArchivePin | null {
  if (!isRecord(value) || Object.keys(value).sort().join(",") !== "at,format,genesis,seed" || value["format"] !== "artroom-archive-pin-1" || !isScopeRef(value["at"]) || !isSeed(value["seed"]) || !isDigest(value["genesis"])) return null;
  const at = value["at"], seed = value["seed"];
  if (at.kind !== seed.kind || at.scope !== scopeIdOf(seed)) return null;
  return { format: "artroom-archive-pin-1", at, seed, genesis: value["genesis"] };
}

/** Called only beside a native append. A metadata omission must never
 * refuse an otherwise valid genesis or alter its recorded bytes. */
export function archivePinBytes(entry: Entry, hash: Digest): string | null {
  if (entry.input.type !== "genesis" || entry.seq !== 0 || entry.prev !== null) return null;
  try {
    const pin = pinOf({ format: "artroom-archive-pin-1", at: entry.at, seed: entry.input.seed, genesis: hash });
    if (!pin) return null;
    const bytes = canonicalize(pin);
    return utf8(bytes).length <= ARCHIVE_PIN_BYTES ? bytes : null;
  } catch { return null; }
}

/** At most four SQL calls, two bounded metadata strings and one hash.
 * A future pass must charge/reserve these reads and validation work before
 * calling, and apply its own active/deadline guard around every SQL call.
 * octet_length(column) uses SQLite's stored size metadata rather than
 * parsing a JSON body: https://www.sqlite.org/lang_corefunc.html#octet_length
 * Missing function support is unavailable, never a full-body fallback. */
export function readArchivePin(sql: Pick<Sql, "exec">, expected: ScopeRef): ArchivePin | null {
  if (!isScopeRef(expected)) return null;
  try {
    const sizes = sql.exec("SELECT k, octet_length(v) AS bytes, typeof(v) AS type FROM meta WHERE k IN ('archive-pin-1', 'scope') ORDER BY k LIMIT 2").toArray();
    if (sizes.length !== 2) return null;
    const pinSize = sizes.find(row => row["k"] === ARCHIVE_PIN_KEY), scopeSize = sizes.find(row => row["k"] === "scope");
    if (pinSize?.["type"] !== "text" || scopeSize?.["type"] !== "text" || !bytesWithin(pinSize["bytes"], ARCHIVE_PIN_BYTES) || !bytesWithin(scopeSize["bytes"], ARCHIVE_SCOPE_METADATA_BYTES)) return null;
    const read = (key: string, size: SqlValue): unknown => {
      const rows = sql.exec("SELECT v FROM meta WHERE k = ? AND typeof(v) = 'text' AND octet_length(v) = ? LIMIT 1", key, size).toArray();
      if (rows.length !== 1 || typeof rows[0]!["v"] !== "string") return undefined;
      const text = rows[0]!["v"] as string;
      // Recheck actual returned UTF8 before parsing, even for a bad adapter.
      if (text.length > (size as number) || utf8(text).length !== size) return undefined;
      const value: unknown = parseStrict(text);
      return canonicalize(value) === text ? value : undefined;
    };
    const pin = pinOf(read(ARCHIVE_PIN_KEY, pinSize["bytes"]!));
    if (!pin || !sameScope(pin.at, expected)) return null;
    const scope = read("scope", scopeSize["bytes"]!);
    if (!isRecord(scope) || Object.keys(scope).sort().join(",") !== "at,creator,genesis,head,held,status,time" || !isScopeRef(scope["at"]) || !sameScope(scope["at"], expected) || !isRecord(scope["genesis"]) || scope["genesis"]["hash"] !== pin.genesis) return null;
    const rows = sql.exec("SELECT hash FROM entry WHERE seq = 0 AND typeof(hash) = 'text' AND octet_length(hash) = 71 LIMIT 1").toArray();
    return rows.length === 1 && rows[0]!["hash"] === pin.genesis ? pin : null;
  } catch { return null; }
}
