/** Native metadata sizing before JSON inspection. This is not a complete
 * privacy inventory or permission to select/export payload bodies. */
import type { Bounds, Digest, Head, ScopeRef } from "@generalbusiness/dap-contract";
import { canonicalize, isDigest, isFactRef, isHead, isRecord, isScopeRef, parseStrict, utf8 } from "@generalbusiness/artroom-bytes";
import { admitArchivePin, type ArchiveExportRefusal } from "@generalbusiness/artroom-git/archive-policy";
import { timeMs, type ScopeState } from "@generalbusiness/dap-derive";
import { ARCHIVE_BOUNDS, ArchiveBudget } from "./archive-budget.ts";
import { ARCHIVE_PIN_BYTES, ARCHIVE_SCOPE_METADATA_BYTES, readArchivePin, type ArchivePin } from "./archive-pin.ts";
import type { Sql } from "./sqlite.ts";

/** Reserve up front for the later fixed metadata JSON expressions and
 * operation-owner inspection. Body fetch/parse/hash are charged separately.
 * This intentionally limits dense/large prefixes below the row ceiling. */
export const ARCHIVE_PRIVACY_JSON_PASSES = 64;
const POSITION_METADATA_BYTES = 192;
export type ArchivePrefixReason = ArchiveExportRefusal | "unavailable" | "incomplete" | "mismatch" | "limit";
export class ArchivePrefixStopped extends Error { constructor(readonly reason: ArchivePrefixReason) { super(`archive-${reason}`); } }
const fail = (reason: ArchivePrefixReason): never => { throw new ArchivePrefixStopped(reason); };
export interface ArchivePosition { readonly seq: number; readonly hash: Digest; readonly bytes: number }
export interface ArchivePrefix {
  readonly pin: ArchivePin;
  readonly frame: ScopeState;
  readonly through: Head;
  readonly positions: readonly ArchivePosition[];
  readonly bytes: number;
}
const natural = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0 && !Object.is(n, -0);

/** `expected` and certificates come from native caller-owned context and
 * trusted reviewer configuration, never a request's claimed safe flags. */
export function archivePrefixMetadata(sql: Pick<Sql, "exec">, expected: ScopeRef, through: Head, bounds: Pick<Bounds, "entryBytes" | "sendsPerEntry">, budget: ArchiveBudget, certified: Pick<ReadonlySet<Digest>, "has">): ArchivePrefix {
  budget.check();
  // Reserve validation as well as raw metadata replies, including cache hits.
  budget.spend({ inputWork: 4 * (ARCHIVE_PIN_BYTES + ARCHIVE_SCOPE_METADATA_BYTES) });
  const pinSql = budget.native(sql, () => ({ metadata: ARCHIVE_PIN_BYTES + ARCHIVE_SCOPE_METADATA_BYTES, inputWork: 0 }));
  const pin = readArchivePin(pinSql, expected);
  if (!pin) { budget.check(); return fail("unavailable"); }
  const admittedPin = admitArchivePin(pin.seed.definition, certified);
  if (!admittedPin.ok) return fail(admittedPin.reason);
  if (!natural(through.seq) || !isDigest(through.hash) || !natural(bounds.entryBytes) || bounds.entryBytes === 0) return fail("unavailable");
  // At most one overflow sentinel; never scan an arbitrary future range.
  if (through.seq > ARCHIVE_BOUNDS.entries) return fail("limit");
  const sizeSql = budget.native(sql, () => ({ metadata: 64, inputWork: 0 }));
  const sizes = sizeSql.exec("SELECT octet_length(v) AS size, typeof(v) AS type FROM meta WHERE k = 'scope' LIMIT 1").toArray();
  const size = sizes[0]?.["size"];
  if (sizes.length !== 1 || sizes[0]?.["type"] !== "text" || !natural(size) || size > ARCHIVE_SCOPE_METADATA_BYTES) return fail("unavailable");
  const frameSql = budget.native(sql, () => ({ metadata: size + 128, inputWork: size * 8 }));
  const frames = frameSql.exec("SELECT v FROM meta WHERE k = 'scope' AND typeof(v) = 'text' AND octet_length(v) = ? LIMIT 1", size).toArray(), frameBytes = frames[0]?.["v"];
  if (frames.length !== 1 || typeof frameBytes !== "string" || frameBytes.length > size || utf8(frameBytes).length !== size) return fail("unavailable");
  const frame: unknown = parseStrict(frameBytes);
  if (!isRecord(frame) || Object.keys(frame).sort().join(",") !== "at,creator,genesis,head,held,status,time" || canonicalize(frame) !== frameBytes || !isScopeRef(frame["at"]) || canonicalize(frame["at"]) !== canonicalize(expected) || frame["creator"] !== null && !isScopeRef(frame["creator"]) || canonicalize(frame["creator"]) !== canonicalize(pin.seed.creator) || !isHead(frame["head"]) || !natural(frame["head"].seq) || typeof frame["time"] !== "string" || timeMs(frame["time"]) === null || !["active", "provisional", "refused"].includes(frame["status"] as string)) return fail("unavailable");
  const genesis = frame["genesis"], held = frame["held"];
  if (!isRecord(genesis) || Object.keys(genesis).sort().join(",") !== "hash,n,source" || genesis["hash"] !== pin.genesis || genesis["source"] !== null && !isFactRef(genesis["source"]) || (genesis["source"] === null ? genesis["n"] !== null : !natural(genesis["n"])) || !Array.isArray(held) || held.length > bounds.sendsPerEntry || held.some((n, i) => !natural(n) || n >= bounds.sendsPerEntry || i > 0 && n <= held[i - 1])) return fail("unavailable");
  budget.check();
  const head = frame["head"];
  if (through.seq > head.seq) return fail("incomplete");
  if (through.seq === head.seq && through.hash !== head.hash) return fail("mismatch");
  const limit = Math.min(through.seq + 1, ARCHIVE_BOUNDS.entries + 1);
  const positionsSql = budget.native(sql, () => ({ metadata: limit * POSITION_METADATA_BYTES, inputWork: 0 }));
  // Column byte lengths use SQLite metadata. No entry JSON operation or
  // value projection occurs until the whole input work has been admitted.
  const rows = positionsSql.exec("SELECT seq, CASE WHEN typeof(hash) = 'text' AND octet_length(hash) = 71 THEN hash ELSE NULL END AS hash, CASE WHEN typeof(size) = 'integer' THEN size ELSE NULL END AS size, octet_length(bytes) AS actual, typeof(bytes) AS type FROM entry WHERE seq >= 0 AND seq <= ? ORDER BY seq LIMIT ?", through.seq, limit).toArray();
  if (rows.length > ARCHIVE_BOUNDS.entries) return fail("limit");
  if (rows.length !== through.seq + 1) return fail("incomplete");
  const positions: ArchivePosition[] = []; let bytes = 0;
  for (const [seq, row] of rows.entries()) {
    if (row["seq"] !== seq || !isDigest(row["hash"]) || row["type"] !== "text" || !natural(row["size"]) || row["size"] === 0 || row["size"] > bounds.entryBytes || row["size"] !== row["actual"]) return fail("mismatch");
    bytes += row["size"];
    if (!Number.isSafeInteger(bytes)) return fail("limit");
    positions.push({ seq, hash: row["hash"], bytes: row["size"] });
  }
  if (positions[0]?.hash !== pin.genesis || positions.at(-1)?.hash !== through.hash) return fail("mismatch");
  budget.spend({ entries: positions.length, inputWork: bytes * ARCHIVE_PRIVACY_JSON_PASSES });
  budget.check();
  return { pin, frame: frame as unknown as ScopeState, through, positions, bytes };
}
