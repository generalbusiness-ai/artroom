/** Internal partial base acquisition for the existing editor, never a closure or custody proof. */
import { EDIT_PATH_BYTES, editPath, hex, utf8, wellFormed } from "@generalbusiness/artroom-bytes";
import { SmartHttpSource } from "./http-read.ts";
import { GitRefusal, objectId } from "./names.ts";
import { parseCommit, parseTree, READ_BOUNDS, Reader, type TreeEntry } from "./reader.ts";

export interface EditBaseAllowance {
  readonly objects: number;
  readonly bytes: number;
  readonly pathBytes: number;
  readonly depth: number;
  /** Source's fixed owned allowance plus5*bytes and8*pathBytes for this call. Excludes engine metadata. */
  readonly ownedBytes: number;
}
export interface PartialEditBase {
  readonly coverage: "edit-paths";
  readonly format: "sha1";
  readonly commit: string;
  readonly tree: string;
  readonly objects: readonly { id: string; kind: "commit" | "tree"; body: Uint8Array }[];
}
const active = new WeakSet<SmartHttpSource>();
const refuse = (reason: "too-large" | "bad-path" | "path-conflict" | "unreadable", what: string): never => { throw new GitRefusal(reason, what); };

/**
 * Caller retains source ownership for this operation. Its output bodies are
 * already lifetime-charged by isolated mode. The extra reservation covers
 * parsed names/hex keys and encoded paths, not measured peak memory. No new
 * object or ref is written and no production provider contract is changed.
 */
export async function readEditBase(source: SmartHttpSource, format: string, base: string, paths: readonly string[], allow: EditBaseAllowance): Promise<PartialEditBase> {
  allow = { ...allow };
  const bounds = { ...READ_BOUNDS };
  if (format !== "sha1") throw new GitRefusal("unsupported-object-format", "edit base");
  objectId(base, "edit base");
  const sourceBytes = source.isolatedPayloadAllowance;
  if (sourceBytes === null) return refuse("unreadable", "isolated edit source required");
  if (active.has(source)) return refuse("too-large", "concurrent edit base");
  if ([allow.objects, allow.bytes, allow.pathBytes, allow.depth, allow.ownedBytes].some(n => !Number.isSafeInteger(n) || n <= 0) || allow.depth > EDIT_PATH_BYTES) return refuse("too-large", "edit base allowance");
  const reserved = sourceBytes + 5 * allow.bytes + 8 * allow.pathBytes;
  if (!Number.isSafeInteger(reserved) || reserved > allow.ownedBytes) return refuse("too-large", "edit base owned payload");
  if (paths.length === 0 || paths.length > 64) return refuse("bad-path", "edit path cohort");
  interface PathNode { leaf: boolean; children: Map<string, PathNode> }
  const root: PathNode = { leaf: false, children: new Map() };
  let pathBytes = 0;
  // Validate every path and the entire file/folder cohort before any I/O.
  for (const path of paths) {
    if (typeof path !== "string" || path.length > EDIT_PATH_BYTES || !wellFormed(path)) return refuse("bad-path", "edit path");
    if (path.length > allow.pathBytes - pathBytes) return refuse("too-large", "edit path bytes");
    const parts = editPath(path);
    if (parts === null) return refuse("bad-path", "edit path");
    if (parts.length > allow.depth) return refuse("too-large", "edit path depth");
    pathBytes += utf8(path).length;
    if (pathBytes > allow.pathBytes) return refuse("too-large", "edit path bytes");
    let node = root;
    for (const part of parts) {
      if (node.leaf) return refuse("path-conflict", "edit path cohort");
      const key = hex(utf8(part));
      if (!node.children.has(key)) node.children.set(key, { leaf: false, children: new Map() });
      node = node.children.get(key)!;
    }
    if (node.leaf || node.children.size > 0) return refuse("path-conflict", "edit path cohort");
    node.leaf = true;
  }
  active.add(source);
  try {
    const objects = new Map<string, PartialEditBase["objects"][number]>();
    let bytes = 0, requests = 0;
    const reader = new Reader({
      object: async (id, limit) => {
        if (requests >= allow.objects) return refuse("too-large", "edit base objects");
        requests++;
        // The complete retrieval reservation was admitted above. Reserve
        // the largest remaining next body before source I/O and inflation.
        const remaining = Math.min(limit, allow.bytes - bytes);
        const got = await source.object(id, remaining);
        if (got.size > remaining || (got.data !== null && got.data.length > remaining)) return refuse("too-large", "edit base bytes");
        if (got.data !== null) bytes += got.data.length;
        return got;
      },
      ref: () => Promise.reject(new GitRefusal("unreadable", "edit base refs")),
      refs: () => Promise.reject(new GitRefusal("unreadable", "edit base refs")),
    }, bounds);
    const read = async (id: string, kind: "commit" | "tree") => {
      const cached = objects.get(id);
      if (cached) {
        if (cached.kind !== kind) throw new GitRefusal("wrong-type", "edit base object");
        return cached.body;
      }
      const body = await reader.object(id, kind, "edit base object");
      objects.set(id, { id, kind, body }); // only after size/type/hash verification
      return body;
    };
    const commit = parseCommit(await read(base, "commit"), bounds);
    const trees = new Map<string, Map<string, TreeEntry>>();
    const visit = async (id: string, node: PathNode): Promise<void> => {
      let rows = trees.get(id);
      if (!rows) {
        rows = new Map(parseTree(await read(id, "tree")).map(row => [hex(row.name), row]));
        trees.set(id, rows);
      }
      for (const [key, below] of node.children) {
        const row = rows.get(key);
        if (!row) continue; // complete verified tree proves new suffix; no further reads
        if (below.leaf) {
          if (row.mode !== "100644" && row.mode !== "100755") return refuse("path-conflict", "edit path leaf");
        } else {
          if (row.kind !== "tree") return refuse("path-conflict", "edit path ancestor");
          await visit(row.id, below);
        }
      }
    };
    await visit(commit.tree, root);
    return { coverage: "edit-paths", format: "sha1", commit: base, tree: commit.tree, objects: [...objects.values()] };
  } finally { active.delete(source); }
}
