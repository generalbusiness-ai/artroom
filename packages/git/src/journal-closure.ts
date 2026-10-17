/** Ephemeral integrity of actual Git edges only. Not a persisted closure
 * certificate, native replay/ancestry proof or at-send retention lease. */
import { JournalObjectReader, journalId, type JournalObjectType } from "./journal-objects.ts";
import { JournalWork, refuseJournal } from "./journal-work.ts";

export interface JournalClosure {
  readonly commits: number;
  readonly objects: number;
  readonly edges: number;
  readonly cacheHits: number;
}
interface Seen { readonly type: JournalObjectType; height: number | null }

/** Follows every archive commit parent to a genuinely parentless commit.
 * A tree/blob expands once; each edge/cache lookup still spends work. A
 * cached subtree retains its height so deeper reuse cannot evade depth.
 * Older blobs are opaque: embedded native snapshot IDs are never edges. */
export async function journalObjectClosure(reader: JournalObjectReader, root: string, work: JournalWork): Promise<JournalClosure> {
  const seen = new Map<string, Seen>(), ancestors = new Set<string>();
  let edges = 0, cacheHits = 0, commits = 0;
  function enter(id: string, type: JournalObjectType): { row: Seen; cached: boolean } {
    journalId(reader.format, id);
    work.spend({ objects: 1 });
    work.budget.spend({ attempts: 1, inputWork: id.length * 2 + 128 });
    work.metadata(id.length + 32);
    edges++;
    const previous = seen.get(id);
    if (previous) {
      cacheHits++;
      if (previous.type !== type) return refuseJournal("parent", id);
      return { row: previous, cached: true };
    }
    work.metadata(id.length + 128);
    const row: Seen = { type, height: null };
    seen.set(id, row);
    return { row, cached: false };
  }
  async function object(id: string, type: "tree" | "blob", depth: number): Promise<number> {
    work.depth(depth);
    const { row, cached } = enter(id, type);
    if (cached) {
      if (row.height === null) return refuseJournal("parent", id);
      work.depth(depth + row.height);
      return row.height;
    }
    const body = await reader.read(id, type);
    if (type === "blob") { row.height = 0; return 0; }
    const rows = reader.tree(body);
    let height = 0;
    for (const child of rows) {
      work.check();
      const next = await object(child.id, child.mode === "40000" ? "tree" : "blob", depth + 1);
      height = Math.max(height, next + 1);
    }
    work.depth(depth + height); row.height = height;
    return height;
  }
  let current: string | null = root;
  while (current !== null) {
    work.depth(commits);
    const id = current, { row } = enter(id, "commit");
    if (ancestors.has(id)) return refuseJournal("parent", id);
    work.metadata(id.length + 64); ancestors.add(id);
    const commit = reader.commit(await reader.read(id, "commit", 1024));
    commits++;
    await object(commit.tree, "tree", 0);
    row.height = 0;
    current = commit.parent;
  }
  work.check();
  return { commits, objects: seen.size, edges, cacheHits };
}
