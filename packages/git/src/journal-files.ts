/** Archive file/tree mechanics. Logical name preservation is distinct from
 * deterministic physical relocation when a directory begins sharding. */
import { archiveShards, type ArchiveSegment } from "./journal-segments.ts";
import { archiveRetainedPath, type ArchiveRetainedName } from "./journal-path.ts";
import { JournalObjectReader, JournalObjects, type JournalTreeRow } from "./journal-objects.ts";
import { JournalWork, refuseJournal } from "./journal-work.ts";

export const JOURNAL_PATH_BYTES = 1024;
export interface JournalFile { readonly path: string; readonly data: Uint8Array }
export interface JournalRetainedFile { readonly key: ArchiveRetainedName; readonly data: Uint8Array }
function component(name: string): void {
  if (name.length === 0 || name.length > 255 || /[^a-z0-9_.-]/.test(name) || name === "." || name === "..") refuseJournal("tree");
}
function pathParts(path: string, work: JournalWork): string[] {
  if (typeof path !== "string" || !path.startsWith("journal/v1/")) return refuseJournal("tree");
  if (path.length > JOURNAL_PATH_BYTES) return work.stop();
  work.metadata(path.length + 64);
  const parts = path.split("/");
  work.depth(parts.length);
  for (const name of parts) component(name);
  return parts;
}

/** Uses complete logical name sets, never only the newly appended names.
 * Fixed metadata files do not participate in segment/digest sharding. */
export function journalPhysicalFiles(segments: readonly ArchiveSegment[], retained: readonly JournalRetainedFile[], head: Uint8Array, manifest: Uint8Array, work: JournalWork): readonly JournalFile[] {
  work.spend({ files: segments.length + retained.length + 2 });
  work.metadata((segments.length + retained.length + 2) * 128);
  const groups = new Map<string, { kind: "segment" | "retained"; files: Map<string, Uint8Array> }>();
  function add(path: string, data: Uint8Array, kind: "segment" | "retained"): void {
    pathParts(path, work); work.size(data.length);
    const slash = path.lastIndexOf("/"), prefix = path.slice(0, slash + 1), leaf = path.slice(slash + 1);
    let group = groups.get(prefix);
    if (!group) { work.metadata(prefix.length + 128); group = { kind, files: new Map() }; groups.set(prefix, group); }
    if (group.kind !== kind || group.files.has(leaf)) return refuseJournal("tree");
    work.metadata(leaf.length + 128); group.files.set(leaf, data);
  }
  for (const segment of segments) { work.check(); add(segment.path, segment.bytes, "segment"); }
  for (const file of retained) { work.check(); add(archiveRetainedPath(file.key), file.data, "retained"); }
  const out: JournalFile[] = [{ path: "journal/v1/head.json", data: head }, { path: "journal/v1/manifest.json", data: manifest }];
  for (const [prefix, group] of groups) {
    work.check(); work.spend({ names: group.files.size }); work.metadata(group.files.size * 128);
    const names = [...group.files.keys()], shards = archiveShards(names, group.kind);
    for (const { name, path } of shards) {
      work.check();
      if (prefix.length + path.length > JOURNAL_PATH_BYTES) return work.stop();
      work.metadata(prefix.length + path.length + 64);
      out.push({ path: prefix + path, data: group.files.get(name)! });
    }
  }
  work.check();
  return out;
}

interface Directory { files: Map<string, string>; dirs: Map<string, Directory> }
/** Mechanical tree writer, usable with synthetic names independently of
 * the initial native selection caps. It grants no archive admission. */
export function journalFileTree(files: readonly JournalFile[], objects: JournalObjects, work: JournalWork): string {
  if (files.length > work.limits.files) return work.stop();
  const directory = (): Directory => { work.metadata(128); return { files: new Map(), dirs: new Map() }; };
  const root = directory();
  for (const file of files) {
    work.spend({ files: 1 });
    const parts = pathParts(file.path, work), leaf = parts.pop()!;
    let at = root;
    for (const part of parts) {
      work.check();
      if (at.files.has(part)) return refuseJournal("tree");
      let child = at.dirs.get(part);
      if (!child) { work.spend({ names: 1 }); work.metadata(part.length + 128); child = directory(); at.dirs.set(part, child); }
      at = child;
    }
    if (at.dirs.has(leaf) || at.files.has(leaf)) return refuseJournal("tree");
    work.spend({ names: 1 }); work.metadata(leaf.length + 128);
    at.files.set(leaf, objects.make("blob", file.data).id);
  }
  function write(at: Directory, depth: number): string {
    work.depth(depth); work.metadata((at.files.size + at.dirs.size) * 64);
    const rows: JournalTreeRow[] = [];
    for (const [name, child] of at.dirs) rows.push({ name, mode: "40000", id: write(child, depth + 1) });
    for (const [name, id] of at.files) rows.push({ name, mode: "100644", id });
    return objects.tree(rows).id;
  }
  return write(root, 0);
}

/** Walks only the explicitly named parent tree closure. Blob bodies are
 * left unread until the caller has checked the complete expected path set. */
export async function journalTreeFiles(reader: JournalObjectReader, tree: string, work: JournalWork): Promise<ReadonlyMap<string, string>> {
  const files = new Map<string, string>();
  async function visit(id: string, prefix: string, depth: number): Promise<void> {
    work.depth(depth);
    const rows = reader.tree(await reader.read(id, "tree"));
    for (const row of rows) {
      work.check();
      if (prefix.length + row.name.length + (row.mode === "40000" ? 1 : 0) > JOURNAL_PATH_BYTES) return work.stop();
      work.metadata(prefix.length + row.name.length + 64);
      const path = prefix + row.name;
      if (row.mode === "40000") await visit(row.id, path + "/", depth + 1);
      else {
        pathParts(path, work); work.spend({ files: 1 });
        if (files.has(path)) return refuseJournal("tree");
        files.set(path, row.id);
      }
    }
  }
  await visit(tree, "", 0); work.check();
  return files;
}
