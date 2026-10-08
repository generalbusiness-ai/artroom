/** Unwired byte-validation adapter. Success is not authorized acquisition,
 * ancestry, publication, a grant or a verified source/admission context. */
import type { Digest } from "@generalbusiness/artroom-contract";
import { digestBytes, isDigest, utf8, wellFormed } from "@generalbusiness/artroom-bytes";
import { editPath, editTree, type DestinationObject, type JudgeChanges } from "@generalbusiness/artroom-platform";
import { GitRefusal, Reader, objectId, type GitReason, type ReadBounds, type TreeEntry } from "@generalbusiness/artroom-git";
import { compareTrees, type TreeComparisonLimits } from "./github-host.ts";

export interface CandidateAllowances {
  inputBytes: number; inputObjects: number; treeEntries: number; depth: number;
  work: number; generatedBytes: number; generatedObjects: number;
  read: ReadBounds;
  comparison: Omit<TreeComparisonLimits, "visit" | "beforeSerialize" | "onLimit">;
}
export interface CandidateInput {
  format: "sha1" | "sha256"; base: string; objects: readonly DestinationObject[];
  file: { path: string; bytes: Uint8Array; digest: Digest; size: number };
}
export type CandidateResult =
  | { result: "candidate"; base: string; tree: string; objects: readonly DestinationObject[]; changes: JudgeChanges }
  | { result: "refused" | "unknown"; reason: GitReason };
class Allowance extends Error {}

export async function editCandidate(input: CandidateInput, limits: CandidateAllowances): Promise<CandidateResult> {
  limits = { ...limits, read: { ...limits.read }, comparison: { ...limits.comparison } };
  const { format, base, objects: suppliedObjects } = input;
  const file = { ...input.file };
  const no = (result: "refused" | "unknown", reason: GitReason): CandidateResult => ({ result, reason });
  // All allowances are supplied; existing Reader defaults are never selected.
  const numbers = [limits.inputBytes, limits.inputObjects, limits.treeEntries, limits.depth, limits.work, limits.generatedBytes, limits.generatedObjects, limits.read.commitBytes, limits.read.parents, limits.read.treeBytes, limits.read.blobBytes, limits.read.closureObjects, limits.read.refs, limits.comparison.trees, limits.comparison.files, limits.comparison.pathBytes, limits.comparison.depth, limits.comparison.changedPaths, limits.comparison.links, limits.comparison.changedBytes, limits.comparison.linkSteps];
  if (numbers.some((n) => !Number.isSafeInteger(n) || n < 0)) return no("refused", "too-large");
  if (format !== "sha1") return no("refused", "unsupported-object-format");
  if (!wellFormed(file.path) || file.path.length > limits.comparison.pathBytes || utf8(file.path).length > limits.comparison.pathBytes || editPath(file.path) === null) return no("refused", "bad-path");
  if (!(file.bytes instanceof Uint8Array) || !Number.isSafeInteger(file.size) || file.size < 0 || file.bytes.length !== file.size) return no("refused", "wrong-size");
  if (file.bytes.length > limits.inputBytes || suppliedObjects.length > limits.inputObjects) return no("refused", "too-large");
  let work = 0; let entries = 0;
  // Reader preserves GitRefusal across its source boundary; an arbitrary
  // allowance exception there would become unreadable and lose its meaning.
  const spend = (n: number) => { if (!Number.isSafeInteger(n) || n < 0 || n > limits.work - work) throw new GitRefusal("too-large", "candidate work"); work += n; };
  const count = (n: number) => { if (n > limits.treeEntries - entries) throw new Allowance(); entries += n; spend(n); };
  try {
    spend(file.bytes.length);
    const bytes = new Uint8Array(file.bytes);
    if (!isDigest(file.digest) || digestBytes(bytes) !== file.digest) return no("refused", "hash-mismatch");
    objectId(base, "base");
    if (limits.read.closureObjects === 0) throw new Allowance();
    const snapshot = new Map<string, DestinationObject>();
    let total = bytes.length;
    // Snapshot every supplied byte before any await. Metadata is detached too.
    for (const supplied of suppliedObjects) {
      const { id, kind, body } = supplied;
      objectId(id, "candidate object");
      if (!(body instanceof Uint8Array) || !["commit", "tree", "blob"].includes(kind)) return no("unknown", "wrong-type");
      if (snapshot.has(id)) return no("unknown", "unreadable");
      if (body.length > limits.inputBytes - total) throw new Allowance();
      total += body.length; spend(body.length + 1);
      snapshot.set(id, { id, kind, body: new Uint8Array(body) });
    }
    const source = {
      object: async (id: string) => {
        spend(1);
        const object = snapshot.get(id);
        if (!object) return null;
        spend(object.body.length);
        return { type: object.kind, size: object.body.length, data: object.body };
      },
      ref: async (): Promise<null> => { throw new GitRefusal("unreadable", "candidate lists no refs"); },
      refs: async (): Promise<[]> => { throw new GitRefusal("unreadable", "candidate lists no refs"); },
    };
    class BudgetReader extends Reader {
      override async tree(id: string): Promise<TreeEntry[]> {
        const data = await this.object(id, "tree");
        // Count encoded occurrences before the vetted parser allocates entries;
        // this framing scan does not replace any parseTree validation.
        let at = 0; let n = 0;
        while (at < data.length) {
          const sp = data.indexOf(32, at); const nul = sp < 0 ? -1 : data.indexOf(0, sp + 1);
          if (sp < 0 || nul < 0 || nul + 21 > data.length) throw new GitRefusal("malformed-tree", "candidate tree");
          n++; if (n > limits.treeEntries - entries) throw new Allowance(); at = nul + 21;
        }
        count(n); spend(data.length);
        return super.tree(id);
      }
    }
    const reader = new BudgetReader(source, limits.read);
    const commit = await reader.commit(base);
    const rows = new Map<string, TreeEntry[]>();
    const objects = new Set<string>([base]);
    // Required tree closure only. Parent IDs were parsed, not traversed or
    // attributed as historical/published ancestry.
    const visit = async (id: string, type: "tree" | "blob", depth: number): Promise<void> => {
      spend(1);
      if (depth > limits.depth) throw new Allowance();
      if (!objects.has(id)) { if (objects.size >= limits.read.closureObjects) throw new Allowance(); objects.add(id); }
      if (type === "blob") { await reader.blob(id); return; }
      const children = await reader.tree(id); rows.set(id, children);
      for (const child of children) {
        if (child.kind === "gitlink") throw new GitRefusal("gitlink", "candidate basis");
        await visit(child.id, child.kind, depth + (child.kind === "tree" ? 1 : 0));
      }
    };
    await visit(commit.tree, "tree", 0);
    const segments = editPath(file.path)!;
    if (segments.length > limits.depth) throw new Allowance();
    // Conservative exact-shape upper bound before raw editTree's allocations:
    // file blob plus each old ancestor tree and one maximum-width new row.
    let output = bytes.length; let at: string | null = commit.tree;
    for (let i = 0; i < segments.length; i++) {
      const name = utf8(segments[i]!);
      const children: TreeEntry[] = at === null ? [] : rows.get(at)!;
      const found: TreeEntry | undefined = children.find((entry) => entry.name.length === name.length && entry.name.every((byte, k) => byte === name[k]));
      if (found && (i === segments.length - 1 ? !["100644", "100755"].includes(found.mode) : found.kind !== "tree")) return no("refused", "path-conflict");
      output += (at === null ? 0 : snapshot.get(at)!.body.length) + name.length + 28;
      count(children.length);
      spend(children.length * children.length * (1 + children.reduce((max, entry) => Math.max(max, entry.name.length), name.length)));
      at = found?.kind === "tree" ? found.id : null;
    }
    if (segments.length + 1 > limits.generatedObjects || output > limits.generatedBytes) throw new Allowance();
    spend(output);
    const made = editTree("sha1", (id) => snapshot.get(id) ?? null, base, file.path, bytes);
    if (!made) return no("refused", "path-conflict");
    for (const object of made.objects) snapshot.set(object.id, { ...object, body: new Uint8Array(object.body) });
    await visit(made.tree, "tree", 0);
    const comparison = {
      ...limits.comparison,
      onLimit: (): never => { throw new Allowance(); },
      visit: (kind: string, n: number) => { if (kind === "entry") count(n); else spend(n); },
      beforeSerialize: (changes: JudgeChanges) => {
        // Exact canonical length computed from individually bounded strings,
        // before constructing the combined canonical output string.
        const string = (value: string) => { spend(value.length * 6 + 2); return utf8(JSON.stringify(value)).length; };
        const paths = 2 + Math.max(0, changes.paths.length - 1) + changes.paths.reduce((n, path) => n + string(path), 0);
        const links = 2 + Math.max(0, changes.links.length - 1) + changes.links.reduce((n, link) => n + '{"path":,"resolves":,"tree":}'.length + string(link.path) + string(link.tree) + (link.resolves === null ? 4 : 2 + Math.max(0, link.resolves.length - 1) + link.resolves.reduce((m, path) => m + string(path), 0)), 0);
        if (paths + links + String(changes.unreadable).length + '{"links":,"paths":,"unreadable":}'.length > limits.comparison.changedBytes) throw new Allowance();
      },
    };
    const changes = await compareTrees(reader, commit.tree, made.tree, comparison);
    if ("over" in changes) return no("refused", "too-large");
    // Output is candidate data only. No raw source buffers escape the snapshot.
    return { result: "candidate", base: base, tree: made.tree, objects: made.objects.map((object) => ({ ...object, body: new Uint8Array(object.body) })), changes };
  } catch (error) {
    if (error instanceof Allowance || (error instanceof GitRefusal && error.reason === "too-large")) return no("refused", "too-large");
    return no("unknown", error instanceof GitRefusal ? error.reason : "unreadable");
  }
}
