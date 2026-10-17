/** Internal selected-prefix layout only. No route, alarm, exporter,
 * certificate, provider/write token or history/replay verdict. */
import type { Entry } from "@generalbusiness/dap-contract";
import { DOMAINS } from "@generalbusiness/dap-contract";
import { canonicalize, domainRetainedJSON, entryHash, isEntry, parseStrict, rawRetainedJSON, scopeIdOf, timeMs, utf8 } from "@generalbusiness/artroom-bytes";
import { journalObjectClosure, type JournalClosure } from "./journal-closure.ts";
import { archiveSegments, type ArchiveSegment } from "./journal-segments.ts";
import type { ArchiveRetainedName } from "./journal-path.ts";
import { journalFileTree, journalPhysicalFiles, journalTreeFiles, type JournalRetainedFile } from "./journal-files.ts";
import { journalHead, journalManifest, manifestOfSelection, type JournalManifest } from "./journal-manifest.ts";
import { JournalObjectReader, JournalObjects, journalFormat, journalId, type JournalFormat, type JournalObject, type JournalObjectSource } from "./journal-objects.ts";
import { JOURNAL_SELECTION_BYTES, journalKeyName, journalSelection, sameJournalScope, type JournalEntrySelection, type JournalSelection } from "./journal-selection.ts";
import { JournalLayoutRefusal, JournalWork, refuseJournal, type JournalBudget, type JournalCost, type JournalLayoutLimits, type JournalLayoutReason } from "./journal-work.ts";

export interface JournalInputSource {
  /** Exact selected local position/key only. No head, enumeration, foreign
   * history or text read operation exists on this port. */
  entry(seq: number, limit: number): Promise<string | null>;
  retained(key: ArchiveRetainedName, limit: number): Promise<string | null>;
}
export interface JournalLayoutOptions {
  readonly format: JournalFormat;
  readonly selection: string;
  readonly input: JournalInputSource;
  readonly parent: { readonly id: string; readonly source: JournalObjectSource } | null;
  readonly budget: JournalBudget;
  readonly limits?: Partial<JournalLayoutLimits>;
}
export interface JournalArchive {
  readonly commit: string;
  readonly tree: string;
  readonly manifest: JournalManifest;
  readonly manifestBytes: string;
  readonly objects: readonly JournalObject[];
  readonly selection: JournalSelection;
  readonly newInterval: readonly [number, number];
  /** Ephemeral checked parent Git edges; no certificate or host lease. */
  readonly parentClosure: JournalClosure | null;
  readonly cost: Readonly<JournalCost>;
  readonly layoutWork: Readonly<JournalLayoutLimits>;
}
export type JournalLayoutResult = { readonly ok: true; readonly archive: JournalArchive } | { readonly ok: false; readonly reason: JournalLayoutReason; readonly where?: string };
interface SelectedEntry { readonly descriptor: JournalEntrySelection; readonly entry: Entry; readonly bytes: string }
const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

async function namedBytes(work: JournalWork, size: number, where: string, read: () => Promise<string | null>): Promise<string> {
  work.size(size);
  // Reserve the bound before calling the source, including encoding,
  // hashing, canonical parsing and validation work. String length is an
  // early lower bound, so an oversized returned string is not encoded.
  work.budget.spend({ calls: 1, inputWork: size * 8 });
  const bytes = await work.budget.wait(read);
  if (bytes === null) return refuseJournal("missing-input", where);
  if (typeof bytes !== "string" || bytes.length > size || utf8(bytes).length !== size) return refuseJournal("input-mismatch", where);
  return bytes;
}
async function selectedEntries(selection: JournalSelection, input: JournalInputSource, work: JournalWork): Promise<readonly SelectedEntry[]> {
  work.metadata(selection.entries.length * 128);
  const rows: SelectedEntry[] = [];
  for (const descriptor of selection.entries) {
    const where = `entry:${descriptor.seq}`;
    const bytes = await namedBytes(work, descriptor.bytes, where, () => input.entry(descriptor.seq, descriptor.bytes));
    let entry: unknown;
    try { entry = parseStrict(bytes); if (canonicalize(entry) !== bytes) return refuseJournal("input-mismatch", where); }
    catch { return refuseJournal("input-mismatch", where); }
    if (!isEntry(entry) || entry.seq !== descriptor.seq || !sameJournalScope(entry.at, selection.at) || entryHash(entry) !== descriptor.hash || entry.prev !== (rows.at(-1)?.descriptor.hash ?? null)) return refuseJournal("input-mismatch", where);
    if (descriptor.seq === 0) {
      if (entry.input.type !== "genesis" || scopeIdOf(entry.input.seed) !== entry.at.scope || entry.input.seed.kind !== entry.at.kind || entry.input.kind !== entry.at.kind || entry.input.inc !== entry.at.inc) return refuseJournal("input-mismatch", where);
    } else if (entry.input.type === "genesis") return refuseJournal("input-mismatch", where);
    work.check(); rows.push({ descriptor, entry, bytes });
  }
  work.metadata((selection.objects.reduce((n, row) => n + row.consumers.length, 0) + selection.omitted.reduce((n, row) => n + row.consumers.length, 0) + selection.ancestryUnwalked.length) * 32);
  const origins = [
    ...selection.objects.flatMap(row => row.consumers.map(c => c.origin)),
    ...selection.omitted.flatMap(row => row.consumers.map(c => c.origin)),
    ...selection.ancestryUnwalked,
  ];
  // Descriptor hashes were checked above. Bind each preserved reason to
  // its actual native input variant, without running a dependency planner.
  for (const origin of origins) {
    work.check();
    if (rows[origin.at.seq]?.entry.input.type !== origin.input) return refuseJournal("input-mismatch", `origin:${origin.at.seq}`);
  }
  return rows;
}
async function selectedRetained(selection: JournalSelection, input: JournalInputSource, work: JournalWork): Promise<ReadonlyMap<string, JournalRetainedFile>> {
  const rows = new Map<string, JournalRetainedFile>();
  for (const selected of selection.objects) {
    const key = selected.key, where = journalKeyName(key);
    if (key.kind === "entry") return refuseJournal("input", where);
    // Each new native retained read, including a later reconstruction,
    // spends the same pass's attempt allowance. No cache bypass is used.
    work.budget.spend({ attempts: 1 });
    work.metadata(where.length + 128);
    const requested = { ...key };
    const bytes = await namedBytes(work, selected.bytes, where, () => input.retained(requested, selected.bytes));
    const parsed = key.kind === "rule" ? rawRetainedJSON(key.digest, bytes)
      : domainRetainedJSON(key.kind === "value" ? key.domain : key.kind === "definition" ? DOMAINS.definition : DOMAINS.snapshot, key.digest, bytes, { canonical: true, max: selected.bytes });
    if (parsed === undefined || canonicalize(parsed) !== bytes) return refuseJournal("input-mismatch", where);
    work.check(); work.metadata(where.length + 128);
    rows.set(where, { key, data: utf8(bytes) });
  }
  return rows;
}
function segments(rows: readonly SelectedEntry[], work: JournalWork): readonly ArchiveSegment[] {
  const size = rows.reduce((n, row) => n + row.descriptor.bytes, 0) + Math.max(0, rows.length - 1);
  // Grouping owns a segment buffer before the object writer makes its own
  // copy. Reserve that work too, even for a repeated parent-prefix check.
  work.spend({ outputWork: size }); work.input(size, 8); work.metadata(rows.length * 64);
  const out = archiveSegments(rows.map(row => ({ seq: row.descriptor.seq, bytes: row.bytes })), size);
  work.check(); return out;
}
function cutoffSeconds(row: SelectedEntry): number {
  const ms = timeMs(row.entry.time);
  return ms === null ? refuseJournal("timestamp") : Math.floor(ms / 1000);
}
function reason(error: unknown): JournalLayoutReason {
  if (error instanceof JournalLayoutRefusal) return error.reason;
  if (error && typeof error === "object" && "reason" in error && (error.reason === "limit" || error.reason === "timeout" || error.reason === "unavailable")) return error.reason;
  return "unavailable";
}

async function parentCutoff(parent: NonNullable<JournalLayoutOptions["parent"]>, format: JournalFormat, selection: JournalSelection, entries: readonly SelectedEntry[], retained: ReadonlyMap<string, JournalRetainedFile>, work: JournalWork): Promise<{ through: number; closure: JournalClosure }> {
  try {
    journalId(format, parent.id);
    const reader = new JournalObjectReader(format, parent.source, work);
    const commit = reader.commit(await reader.read(parent.id, "commit", 1024));
    const actual = await journalTreeFiles(reader, commit.tree, work);
    const headId = actual.get("journal/v1/head.json"), manifestId = actual.get("journal/v1/manifest.json");
    if (!headId || !manifestId) return refuseJournal("parent");
    const headBody = await reader.read(headId, "blob", 1024), manifestBody = await reader.read(manifestId, "blob", JOURNAL_SELECTION_BYTES);
    const head = journalHead(headBody, work), manifest = journalManifest(manifestBody, format, work), n = manifest.through.seq;
    if (!sameJournalScope(head.scope, selection.at) || head.through !== n || head.hash !== manifest.through.hash || n >= selection.through.seq || entries[n]?.descriptor.hash !== head.hash || manifest.parent !== commit.parent || commit.seconds !== cutoffSeconds(entries[n]!)) return refuseJournal("parent");
    // Reasons identify which keys were selected by this earlier local
    // prefix. A parent never grants a cached-prefix or retention proof.
    const oldObjects = selection.objects.filter(row => row.consumers.some(c => c.origin.at.seq <= n));
    const oldOmitted = selection.omitted.filter(row => row.consumers.some(c => c.origin.at.seq <= n));
    work.input(manifestBody.length, 2);
    if (canonicalize(manifest.retained) !== canonicalize(oldObjects.map(row => row.key)) || canonicalize(manifest.omitted) !== canonicalize(oldOmitted.map(row => ({ kind: row.kind, digest: row.digest, reason: row.reason })))) return refuseJournal("parent");
    work.metadata((n + 1) * 64 + oldObjects.length * 128);
    const oldRows = entries.slice(0, n + 1), files = journalPhysicalFiles(segments(oldRows, work), oldObjects.map(row => retained.get(journalKeyName(row.key))!), headBody, manifestBody, work);
    if (actual.size !== files.length || files.some(file => !actual.has(file.path))) return refuseJournal("parent");
    for (const file of files) {
      work.check(); work.input(file.data.length, 2);
      // Fixed files were already read under their stricter bounds.
      const bytes = file.path === "journal/v1/head.json" ? headBody : file.path === "journal/v1/manifest.json" ? manifestBody : await reader.read(actual.get(file.path)!, "blob", file.data.length);
      if (!sameBytes(bytes, file.data)) return refuseJournal("parent", file.path);
    }
    const closure = await journalObjectClosure(reader, parent.id, work);
    work.check(); return { through: n, closure };
  } catch (error) {
    const why = reason(error);
    if (why === "limit" || why === "timeout" || why === "unavailable" || (error instanceof JournalLayoutRefusal && why === "parent")) throw error;
    return refuseJournal("parent");
  }
}

/** Only a complete build can return objects. Every read is explicitly
 * named by the immutable selection or the bounded prior archive closure.
 * A successful result says nothing about export authority or replay. */
export async function buildJournalArchive(options: JournalLayoutOptions): Promise<JournalLayoutResult> {
  try {
    const work = new JournalWork(options.budget, options.limits), format = journalFormat(options.format);
    const selectionBytes = options.selection, input = options.input, suppliedParent = options.parent;
    const prior = suppliedParent === null ? null : { id: suppliedParent.id, source: suppliedParent.source };
    const selection = journalSelection(selectionBytes, work);
    const entries = await selectedEntries(selection, input, work);
    const retained = await selectedRetained(selection, input, work);
    const checkedParent = prior === null ? null : await parentCutoff(prior, format, selection, entries, retained, work);
    const previous = checkedParent?.through ?? -1;
    const parent = prior?.id ?? null, manifest = manifestOfSelection(selection, format, parent, work);
    // The bounded description is an upper bound on the generated key-only
    // manifest. Reserve serialization before creating strings/UTF-8 files.
    const metadataBound = selectionBytes.length * 3 + 2048;
    work.spend({ outputWork: metadataBound }); work.input(metadataBound, 2);
    const manifestBytes = canonicalize(manifest), headBytes = canonicalize({ v: 1, scope: selection.at, through: selection.through.seq, hash: selection.through.hash });
    if (utf8(manifestBytes).length > JOURNAL_SELECTION_BYTES || headBytes.length > 1024) return work.stop();
    const files = journalPhysicalFiles(segments(entries, work), [...retained.values()], utf8(headBytes), utf8(manifestBytes), work);
    const maker = new JournalObjects(format, work), tree = journalFileTree(files, maker, work);
    const commit = maker.commit(tree, parent, cutoffSeconds(entries.at(-1)!));
    const objects = maker.objects(); work.check();
    return { ok: true, archive: { commit: commit.id, tree, manifest, manifestBytes, objects, selection, newInterval: [previous + 1, selection.through.seq], parentClosure: checkedParent?.closure ?? null, cost: work.budget.admitted(), layoutWork: { ...work.used } } };
  } catch (error) {
    const why = reason(error), where = error instanceof JournalLayoutRefusal ? error.where : undefined;
    return { ok: false, reason: why, ...(where === undefined ? {} : { where }) };
  }
}
