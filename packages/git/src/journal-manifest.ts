/** Closed archive v1 file schemas. The cumulative manifest indexes the
 * represented tree, distinct from the new interval processed by a pass. */
import type { Digest, Head, ScopeRef } from "@generalbusiness/dap-contract";
import { canonicalize, isDigest, isScopeRef, parseStrict } from "@generalbusiness/artroom-bytes";
import type { ArchiveRetainedName } from "./journal-path.ts";
import { journalFormat, journalId, type JournalFormat } from "./journal-objects.ts";
import { JOURNAL_SELECTION_BYTES, journalKeyName, journalList, journalNatural, journalOrdered, journalRecord, journalRetainedKey, type JournalSelection } from "./journal-selection.ts";
import { JournalWork, refuseJournal } from "./journal-work.ts";

export interface JournalManifest {
  readonly v: 1;
  readonly through: Head;
  readonly parent: string | null;
  readonly format: JournalFormat;
  readonly entries: readonly [0, number];
  readonly retained: readonly ArchiveRetainedName[];
  readonly omitted: readonly { readonly kind: "text"; readonly digest: Digest; readonly reason: "detached-text" }[];
}
export interface JournalHead { readonly v: 1; readonly scope: ScopeRef; readonly through: number; readonly hash: Digest }
const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
export function journalJSON(body: Uint8Array, maximum: number, work: JournalWork): unknown {
  work.size(body.length);
  if (body.length > maximum) return work.stop();
  work.metadata(body.length * 3); work.input(body.length, 8);
  let value: unknown;
  try {
    const bytes = text.decode(body); value = parseStrict(bytes);
    if (canonicalize(value) !== bytes) return refuseJournal("manifest");
  } catch { return refuseJournal("manifest"); }
  work.check();
  return value;
}
export function journalHead(body: Uint8Array, work: JournalWork): JournalHead {
  const r = journalRecord(journalJSON(body, 1024, work), ["v", "scope", "through", "hash"]);
  if (r["v"] !== 1 || !isScopeRef(r["scope"]) || !journalNatural(r["through"]) || r["through"] >= 4096 || !isDigest(r["hash"])) return refuseJournal("manifest");
  return { v: 1, scope: { ...r["scope"] }, through: r["through"], hash: r["hash"] };
}
export function journalManifest(body: Uint8Array, expected: JournalFormat, work: JournalWork): JournalManifest {
  const r = journalRecord(journalJSON(body, JOURNAL_SELECTION_BYTES, work), ["v", "through", "parent", "format", "entries", "retained", "omitted"]);
  const head = journalRecord(r["through"], ["seq", "hash"]), range = journalList(r["entries"], 2, work);
  if (r["v"] !== 1 || journalFormat(r["format"]) !== expected || !journalNatural(head["seq"]) || head["seq"] >= 4096 || !isDigest(head["hash"]) || range.length !== 2 || range[0] !== 0 || range[1] !== head["seq"]) return refuseJournal("manifest");
  const parent = r["parent"] === null ? null : journalId(expected, r["parent"]);
  const retained = journalList(r["retained"], 512, work).map(journalRetainedKey);
  const omitted = journalList(r["omitted"], 8192, work).map(raw => {
    const row = journalRecord(raw, ["kind", "digest", "reason"]);
    if (row["kind"] !== "text" || !isDigest(row["digest"]) || row["reason"] !== "detached-text") return refuseJournal("manifest");
    return { kind: "text" as const, digest: row["digest"], reason: "detached-text" as const };
  });
  const validateOrder = <T>(rows: readonly T[], key: (row: T) => string) => {
    const names = rows.map(key), ordered = journalOrdered(rows, key, work).map(key);
    if (new Set(names).size !== names.length || names.some((name, i) => name !== ordered[i])) return refuseJournal("manifest");
  };
  validateOrder(retained, journalKeyName); validateOrder(omitted, journalKeyName);
  const present = new Set(retained.map(journalKeyName));
  if (omitted.some(key => present.has(journalKeyName(key)))) return refuseJournal("manifest");
  work.check();
  return { v: 1, through: { seq: head["seq"], hash: head["hash"] }, parent, format: expected, entries: [0, head["seq"]], retained, omitted };
}

/** Only keys and explicit policy omissions enter archive files. Native
 * consumer reasons, costs and private bookkeeping stay in selection data. */
export function manifestOfSelection(selection: JournalSelection, format: JournalFormat, parent: string | null, work: JournalWork): JournalManifest {
  journalFormat(format);
  if (parent !== null) journalId(format, parent);
  work.metadata((selection.objects.length + selection.omitted.length) * 128);
  return {
    v: 1, through: { ...selection.through }, parent, format,
    entries: [0, selection.through.seq],
    retained: selection.objects.map(row => ({ ...row.key })),
    omitted: selection.omitted.map(row => ({ kind: row.kind, digest: row.digest, reason: row.reason })),
  };
}
