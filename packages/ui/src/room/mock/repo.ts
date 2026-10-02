/**
 * A tiny in-memory git object store for the demo room: blobs, trees and
 * commits with content-derived IDs, read through lane B's `TreeReader`
 * shape. It exists so the per-change history runs the real bounded tree
 * diff over real trees.
 */

import type { TreeEntry } from "@generalbusiness/artroom-git";
import type { CommitStore } from "../changes.ts";
import type { Sha } from "../contract.ts";
import { fakeSha } from "./ids.ts";

type Files = Readonly<Record<string, { readonly text: string; readonly mode: string }>>;

export class MemoryRepo implements CommitStore {
  private readonly blobs = new Map<string, string>();
  private readonly trees = new Map<string, readonly TreeEntry[]>();
  private readonly commits = new Map<string, { treeHash: string; parents: string[]; committedAt: number; files: Files }>();

  /** Make a commit from its parent's files with `edits` applied: text (mode 100644), text and mode, or null to delete. */
  commit(parent: Sha | null, edits: Readonly<Record<string, string | { text: string; mode: string } | null>>, salt: string): Sha {
    const files: Record<string, { text: string; mode: string }> = { ...(parent ? this.commits.get(parent)!.files : {}) };
    for (const [path, content] of Object.entries(edits)) {
      if (content === null) delete files[path];
      else files[path] = typeof content === "string" ? { text: content, mode: "100644" } : content;
    }
    const treeHash = this.tree(files, "");
    const id = fakeSha(`commit:${treeHash}:${parent ?? ""}:${salt}`);
    this.commits.set(id, { treeHash, parents: parent ? [parent] : [], committedAt: this.commits.size, files });
    return id;
  }

  private tree(files: Files, prefix: string): string {
    const here = new Map<string, TreeEntry>();
    const dirs = new Set<string>();
    for (const path of Object.keys(files)) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      const slash = rest.indexOf("/");
      if (slash >= 0) dirs.add(rest.slice(0, slash));
      else {
        const { text, mode } = files[path]!;
        const hash = fakeSha(`blob:${text}`);
        this.blobs.set(hash, text);
        here.set(rest, { name: rest, mode, hash, type: mode === "100755" ? "exec" : "blob" });
      }
    }
    for (const d of dirs) here.set(d, { name: d, mode: "040000", hash: this.tree(files, `${prefix}${d}/`), type: "tree" });
    const entries = [...here.values()].sort((a, b) => (a.name < b.name ? -1 : 1));
    const hash = fakeSha(`tree:${entries.map((e) => `${e.mode} ${e.name} ${e.hash}`).join("\n")}`);
    this.trees.set(hash, entries);
    return hash;
  }

  async readTree(hash: string) {
    return this.trees.get(hash) ?? null;
  }

  async readCommit(hash: string) {
    const c = this.commits.get(hash);
    return c ? { treeHash: c.treeHash, parents: c.parents, committedAt: c.committedAt } : null;
  }

  async readBlob(hash: string) {
    return this.blobs.get(hash) ?? null;
  }
}
