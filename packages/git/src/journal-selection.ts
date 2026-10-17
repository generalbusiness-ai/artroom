/** Bounded serialization of an already selected native inventory. This
 * description is not admission, a privacy certificate or a replay verdict.
 * Consumer records preserve native selection reasons; they select no reads
 * beyond the explicit entry/object descriptors. No producer calls this yet. */
import type { Digest, FactRef, Head, ScopeRef } from "@generalbusiness/dap-contract";
import { DOMAINS, RETAINED_INPUT_BYTES } from "@generalbusiness/dap-contract";
import { canonicalize, isDigest, isFactRef, isScopeRef, parseStrict, utf8 } from "@generalbusiness/artroom-bytes";
import { archiveRetainedPath, type ArchiveRetainedName } from "./journal-path.ts";
import { journalByteOrder } from "./journal-objects.ts";
import { JournalWork, refuseJournal, type JournalCost } from "./journal-work.ts";

export const JOURNAL_SELECTION_BYTES = 1024 * 1024;
const inventoryCeilings: Readonly<JournalCost> = { entries: 4096, attempts: 512, nodes: 64, calls: 16384, metadata: 4 * 1024 * 1024, inputWork: 64 * 1024 * 1024 };
const inputs: readonly string[] = ["genesis", "act", "delivery", "diagnosis", "timed", "preparation", "outcome", "checkpoint"];
const domains: ReadonlySet<string> = new Set(Object.values(DOMAINS));
/** The current native consumer serialization vocabulary, not a second
 * dependency planner. New consumers need an explicit format review. */
const requiredKinds: Readonly<Record<string, readonly string[]>> = {
  declaration: ["definition"], "definition-child": ["definition"],
  "rule-input": ["rule"], "act-value": ["definition", "value"],
  "outcome-value": ["definition", "value"], "outcome-snapshot": ["snapshot"],
};
export interface JournalEntrySelection { readonly seq: number; readonly hash: Digest; readonly bytes: number }
export interface JournalOrigin { readonly at: FactRef; readonly input: string }
export interface JournalConsumer { readonly origin: JournalOrigin; readonly description: string }
export interface JournalSelectedObject { readonly key: ArchiveRetainedName; readonly bytes: number; readonly consumers: readonly JournalConsumer[] }
export interface JournalOmission { readonly kind: "text"; readonly digest: Digest; readonly reason: "detached-text"; readonly consumers: readonly JournalConsumer[] }
export interface JournalSelection {
  readonly at: ScopeRef;
  readonly through: Head;
  readonly entries: readonly JournalEntrySelection[];
  readonly objects: readonly JournalSelectedObject[];
  readonly omitted: readonly JournalOmission[];
  readonly ancestryUnwalked: readonly JournalOrigin[];
  readonly inventoryCost: Readonly<JournalCost>;
}
export const journalKeyName = (key: ArchiveRetainedName | { kind: "text"; digest: Digest }): string =>
  canonicalize(key.kind === "value" ? [key.kind, key.domain, key.digest] : [key.kind, key.digest]);
export const sameJournalScope = (a: ScopeRef, b: ScopeRef): boolean => a.scope === b.scope && a.inc === b.inc && a.kind === b.kind;
export const journalNatural = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && !Object.is(v, -0);
export function journalRecord(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return refuseJournal("input");
  const row = value as Record<string, unknown>, keys = Object.keys(row);
  if (keys.length !== fields.length || keys.some(k => !fields.includes(k))) refuseJournal("input");
  return row;
}
export function journalList(value: unknown, max: number, work: JournalWork): unknown[] {
  work.check();
  if (!Array.isArray(value)) return refuseJournal("input");
  return value.length <= max ? value : work.stop();
}
export function journalOrdered<T>(rows: readonly T[], key: (row: T) => string, work: JournalWork): T[] {
  const pairs = rows.map(row => ({ row, bytes: utf8(key(row)) }));
  work.input(pairs.reduce((n, p) => n + p.bytes.length, 0), Math.ceil(Math.log2(rows.length + 1)) + 2);
  return pairs.sort((a, b) => journalByteOrder(a.bytes, b.bytes)).map(p => p.row);
}
export function journalRetainedKey(value: unknown): ArchiveRetainedName {
  const r = value && typeof value === "object" ? value as Record<string, unknown> : refuseJournal("input");
  journalRecord(r, r["kind"] === "value" ? ["kind", "domain", "digest"] : ["kind", "digest"]);
  if (!isDigest(r["digest"])) return refuseJournal("input");
  let key: ArchiveRetainedName;
  if (r["kind"] === "value") {
    if (typeof r["domain"] !== "string" || r["domain"].length === 0 || r["domain"] === DOMAINS.definition) return refuseJournal("input");
    key = { kind: "value", domain: r["domain"], digest: r["digest"] };
  } else {
    if (r["kind"] !== "definition" && r["kind"] !== "entry" && r["kind"] !== "rule" && r["kind"] !== "snapshot") return refuseJournal("input");
    key = { kind: r["kind"], digest: r["digest"] };
  }
  archiveRetainedPath(key);
  return key;
}
function currentRetained(value: unknown): ArchiveRetainedName {
  const key = journalRetainedKey(value);
  // The wire/path grammar is broader than current native export admission.
  // Parsing a parent key never grants permission to select that cohort.
  if (key.kind === "entry" || (key.kind === "value" && !domains.has(key.domain))) return refuseJournal("input");
  return key;
}

/** A bounded canonical text gives layout owned metadata with no mutable
 * caller references. Its cost and original budget must already include
 * the selected native prefix. Neither matching shape nor these counters
 * prove that the caller ran native admission. */
export function journalSelection(bytes: string, work: JournalWork): JournalSelection {
  if (typeof bytes !== "string") return refuseJournal("input");
  if (bytes.length > JOURNAL_SELECTION_BYTES) return work.stop();
  work.metadata(bytes.length * 3); // Reserve UTF-8 and metadata work before encoding/parsing.
  work.input(bytes.length * 3, 8);
  if (utf8(bytes).length > JOURNAL_SELECTION_BYTES) return work.stop();
  let value: unknown;
  try { value = parseStrict(bytes); if (canonicalize(value) !== bytes) return refuseJournal("input"); }
  catch { return refuseJournal("input"); }
  work.check();
  const top = journalRecord(value, ["format", "at", "through", "entries", "objects", "omittedTexts", "ancestryUnwalked", "replay", "retention", "cost"]);
  if (top["format"] !== "artroom-local-inventory-1" || top["replay"] !== "unchecked" || top["retention"] !== "observed-local" || !isScopeRef(top["at"])) return refuseJournal("input");
  const at = { ...top["at"] }, head = journalRecord(top["through"], ["seq", "hash"]);
  if (!journalNatural(head["seq"]) || head["seq"] >= inventoryCeilings.entries || !isDigest(head["hash"])) return refuseJournal("input");
  const through = { seq: head["seq"], hash: head["hash"] };
  const table = new Map<number, JournalEntrySelection>();
  const rawEntries = journalList(top["entries"], inventoryCeilings.entries, work);
  if (rawEntries.length !== through.seq + 1) return refuseJournal("input");
  for (const raw of rawEntries) {
    work.check();
    const r = journalRecord(raw, ["seq", "hash", "bytes"]);
    if (!journalNatural(r["seq"]) || r["seq"] > through.seq || !isDigest(r["hash"]) || !journalNatural(r["bytes"]) || r["bytes"] === 0 || r["bytes"] > work.limits.objectBytes || table.has(r["seq"])) return refuseJournal("input");
    table.set(r["seq"], { seq: r["seq"], hash: r["hash"], bytes: r["bytes"] });
  }
  const entries = [...table.values()].sort((a, b) => a.seq - b.seq);
  if (entries.at(-1)?.hash !== through.hash) return refuseJournal("input");
  function origin(raw: unknown): JournalOrigin {
    const r = journalRecord(raw, ["at", "input"]), fact = r["at"];
    if (!isFactRef(fact) || !sameJournalScope(fact.at, at) || table.get(fact.seq)?.hash !== fact.hash || typeof r["input"] !== "string" || !inputs.includes(r["input"])) return refuseJournal("input");
    return { at: { at: { ...fact.at }, seq: fact.seq, hash: fact.hash }, input: r["input"] };
  }
  function consumer(raw: unknown, key: ArchiveRetainedName): JournalConsumer {
    const mode = raw && typeof raw === "object" ? (raw as Record<string, unknown>)["mode"] : null;
    const r = journalRecord(raw, mode === "required" ? ["mode", "origin", "consumer", "purpose", "key"] : ["mode", "origin", "consumer", "purpose", "choices"]);
    const from = origin(r["origin"]);
    if (mode === "required") {
      const name = r["consumer"];
      if (typeof name !== "string" || !Object.hasOwn(requiredKinds, name) || !requiredKinds[name]!.includes(key.kind) || journalKeyName(currentRetained(r["key"])) !== journalKeyName(key) || r["purpose"] !== (name === "definition-child" ? "archive-closure" : "replay-required")) return refuseJournal("input");
      if ((name === "act-value" && from.input !== "act") || ((name === "outcome-value" || name === "outcome-snapshot") && from.input !== "outcome")) return refuseJournal("input");
    } else if (mode === "probe") {
      if (r["consumer"] !== "observation-value" || r["purpose"] !== "replay-required" || !["act", "delivery", "outcome"].includes(from.input)) return refuseJournal("input");
      let named = false;
      for (const rawChoice of journalList(r["choices"], 64, work)) {
        const choice = journalRecord(rawChoice, ["domain", "key"]), candidate = currentRetained(choice["key"]);
        if (choice["domain"] !== (candidate.kind === "definition" ? DOMAINS.definition : candidate.kind === "value" ? candidate.domain : null)) return refuseJournal("input");
        named ||= journalKeyName(candidate) === journalKeyName(key);
      }
      if (!named) return refuseJournal("input");
    } else return refuseJournal("input");
    return { origin: from, description: canonicalize(raw) };
  }
  const objects = new Map<string, { key: ArchiveRetainedName; bytes: number; consumers: Map<string, JournalConsumer> }>();
  for (const raw of journalList(top["objects"], 1024, work)) {
    work.check();
    const r = journalRecord(raw, ["key", "bytes", "consumers"]), key = currentRetained(r["key"]), name = journalKeyName(key);
    if (!journalNatural(r["bytes"]) || r["bytes"] === 0 || r["bytes"] > RETAINED_INPUT_BYTES) return refuseJournal("input");
    const previous = objects.get(name);
    if (previous && previous.bytes !== r["bytes"]) return refuseJournal("input");
    const chosen = previous ?? { key, bytes: r["bytes"], consumers: new Map<string, JournalConsumer>() };
    const reasons = journalList(r["consumers"], 4096, work);
    if (reasons.length === 0) return refuseJournal("input");
    for (const rawReason of reasons) { const reason = consumer(rawReason, key); chosen.consumers.set(reason.description, reason); }
    objects.set(name, chosen);
    if (objects.size > inventoryCeilings.attempts) return work.stop();
  }
  const omissions = new Map<string, { kind: "text"; digest: Digest; reason: "detached-text"; consumers: Map<string, JournalConsumer> }>();
  for (const raw of journalList(top["omittedTexts"], 8192, work)) {
    work.check();
    const r = journalRecord(raw, ["mode", "origin", "consumer", "key", "archive"]), key = journalRecord(r["key"], ["kind", "digest"]);
    if (r["mode"] !== "text" || r["consumer"] !== "detached-text" || r["archive"] !== "omit" || key["kind"] !== "text" || !isDigest(key["digest"])) return refuseJournal("input");
    const from = origin(r["origin"]), name = journalKeyName({ kind: "text", digest: key["digest"] });
    if (objects.has(name)) return refuseJournal("input");
    const chosen = omissions.get(name) ?? { kind: "text" as const, digest: key["digest"], reason: "detached-text" as const, consumers: new Map<string, JournalConsumer>() };
    const description = canonicalize(raw); chosen.consumers.set(description, { origin: from, description }); omissions.set(name, chosen);
  }
  const ancestryUnwalked = journalList(top["ancestryUnwalked"], inventoryCeilings.entries, work).map(origin);
  if (ancestryUnwalked.some(from => from.input !== "outcome")) return refuseJournal("input");
  const cost = journalRecord(top["cost"], Object.keys(inventoryCeilings)), live = work.budget.admitted(), inventoryCost = {} as JournalCost;
  for (const k of Object.keys(inventoryCeilings) as (keyof JournalCost)[]) {
    const n = cost[k];
    if (!journalNatural(n) || n > inventoryCeilings[k] || !journalNatural(live[k]) || n > live[k]) return refuseJournal("input");
    inventoryCost[k] = n;
  }
  if (inventoryCost.entries < entries.length || inventoryCost.attempts < objects.size) return refuseJournal("input");
  const chosenObjects = journalOrdered([...objects.values()], r => journalKeyName(r.key), work).map(r => ({ key: r.key, bytes: r.bytes, consumers: journalOrdered([...r.consumers.values()], c => c.description, work) }));
  const omitted = journalOrdered([...omissions.values()], journalKeyName, work).map(r => ({ kind: r.kind, digest: r.digest, reason: r.reason, consumers: journalOrdered([...r.consumers.values()], c => c.description, work) }));
  work.check();
  return { at, through, entries, objects: chosenObjects, omitted, ancestryUnwalked, inventoryCost };
}
