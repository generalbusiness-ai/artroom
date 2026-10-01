// Changed paths between two commits, from Artifacts tree objects only.
// Equal hashes are skipped whole, so the cost follows the size of the change,
// not the size of the repository. Subtrees are read in parallel.
export interface DiffResult {
  paths: string[]; // changed, added or deleted file paths, sorted
  readTrees: number; // readTree calls made
  readCommits: number;
  commitMs: number; // wall time of the two parallel readCommit calls
  treeCallMs: number[]; // latency of each readTree call
}

type Repo = Pick<ArtifactsRepo, "readTree" | "readCommit">;

export async function changedPaths(repo: Repo, from: string, to: string, cache?: Map<string, ArtifactsTreeEntry[]>, limit = Infinity): Promise<DiffResult> {
  let readTrees = 0;
  // Optional cap on readTree calls in flight.
  let inFlight = 0;
  const waiting: (() => void)[] = [];
  const acquire = async () => {
    while (inFlight >= limit) await new Promise<void>((r) => waiting.push(r));
    inFlight++;
  };
  const release = () => {
    inFlight--;
    waiting.shift()?.();
  };
  const treeCallMs: number[] = [];
  const tree = async (hash: string): Promise<ArtifactsTreeEntry[]> => {
    const hit = cache?.get(hash);
    if (hit) return hit;
    readTrees++;
    await acquire();
    const s = performance.now();
    const entries = await repo.readTree(hash).finally(release);
    treeCallMs.push(performance.now() - s);
    if (!entries) throw new Error(`tree ${hash} not found`);
    cache?.set(hash, entries);
    return entries;
  };
  const c0 = performance.now();
  const [a, b] = await Promise.all([repo.readCommit(from), repo.readCommit(to)]);
  const commitMs = performance.now() - c0;
  if (!a || !b) throw new Error(`commit not found: ${!a ? from : to}`);
  const out: string[] = [];

  // Every file under a tree that exists on one side only.
  const all = async (hash: string, prefix: string): Promise<void> => {
    const entries = await tree(hash);
    await Promise.all(entries.map((e) => (e.type === "tree" ? all(e.hash, prefix + e.name + "/") : (out.push(prefix + e.name), undefined))));
  };

  const walk = async (ha: string, hb: string, prefix: string): Promise<void> => {
    if (ha === hb) return;
    const [ea, eb] = await Promise.all([tree(ha), tree(hb)]);
    const ma = new Map(ea.map((e) => [e.name, e]));
    const mb = new Map(eb.map((e) => [e.name, e]));
    const work: Promise<void>[] = [];
    for (const [name, x] of ma) {
      const y = mb.get(name);
      const p = prefix + name;
      if (y && x.hash === y.hash && x.mode === y.mode) continue;
      const xt = x.type === "tree";
      const yt = y?.type === "tree";
      if (xt && yt) work.push(walk(x.hash, y!.hash, p + "/"));
      else {
        if (xt) work.push(all(x.hash, p + "/"));
        else out.push(p);
        if (y) {
          if (yt) work.push(all(y.hash, p + "/"));
          else if (xt) out.push(p);
        }
      }
    }
    for (const [name, y] of mb) {
      if (ma.has(name)) continue;
      const p = prefix + name;
      if (y.type === "tree") work.push(all(y.hash, p + "/"));
      else out.push(p);
    }
    await Promise.all(work);
  };

  await walk(a.treeHash, b.treeHash, "");
  return { paths: [...new Set(out)].sort(), readTrees, readCommits: 2, commitMs, treeCallMs };
}
