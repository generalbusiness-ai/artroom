/**
 * Lane B review f7d273e1 (2): a push carries only the objects its lease
 * does not hold, so the transfer bound limits one cohort, never the
 * accumulated log; a cohort over the bound is refused by name.
 */

import { describe, expect, test } from "vitest";
import type { Sha } from "@generalbusiness/artroom-contract";
import { LOG_REF } from "../src/entries.ts";
import { MemoryGit, encodeCommit, encodeTree, gitObject, type GitObject, type PushOutcome, type TreeEntry } from "../src/git.ts";
import { LOG_TRANSFER_LIMITS, LogPublisher, PublishError, readLogFiles } from "../src/publisher.ts";
import { verifyLog } from "../src/verify.ts";
import { goldenLog } from "./support/room-sim.ts";

/** A MemoryGit that records what each push carried and refuses a push over `bytes`, as the sandbox does. */
class Recording extends MemoryGit {
  readonly sent: GitObject[][] = [];
  bytes = Number.POSITIVE_INFINITY;
  override async push(objects: readonly GitObject[], ref: string, next: Sha, lease: Sha | null): Promise<PushOutcome> {
    this.sent.push([...objects]);
    if (objects.reduce((n, o) => n + o.data.length, 0) > this.bytes) return { ok: false, reason: "unknown", detail: "too large" };
    return super.push(objects, ref, next, lease);
  }
}

/** Every object reachable from `commit` in `git`. */
function reachable(git: MemoryGit, commit: string, out = new Set<string>()): Set<string> {
  const walk = (sha: string) => {
    if (out.has(sha)) return;
    out.add(sha);
    const o = git.objects.get(sha);
    if (!o) return; // missing: the caller checks git.objects
    const text = new TextDecoder().decode(o.data);
    if (o.type === "commit") for (const m of text.matchAll(/^(?:tree|parent) ([0-9a-f]{40})$/gm)) walk(m[1]!);
    if (o.type === "tree") {
      let i = 0;
      while (i < o.data.length) {
        const nul = o.data.indexOf(0, i);
        walk([...o.data.subarray(nul + 1, nul + 21)].map((b) => b.toString(16).padStart(2, "0")).join(""));
        i = nul + 21;
      }
    }
  };
  walk(commit);
  return out;
}

describe("review f7d273e1 (2): incremental transfer", () => {
  test("after the first publication, a push sends nothing the lease already holds, and the result verifies", async () => {
    const git = new Recording();
    const { c1, c2, c3 } = await goldenLog(git);
    expect(git.sent).toHaveLength(3);
    const leases = [null, c1.commit, c2.commit];
    for (const [i, objects] of git.sent.entries()) {
      const held = leases[i] ? reachable(git, leases[i]!) : new Set<string>();
      expect(objects.filter((o) => held.has(o.sha))).toEqual([]);
    }
    expect(git.refs.get(LOG_REF)).toBe(c3.commit);
    expect((await verifyLog(git)).ok).toBe(true);
  });

  test("a publisher reopened from the ref sends only the new objects, and the same commit as one that never stopped", async () => {
    const a = new Recording();
    const ga = await goldenLog(a);
    const continued = await ga.sim.publish(ga.publisher);

    const b = new Recording();
    const gb = await goldenLog(b);
    const reopened = await LogPublisher.open(b);
    const r = await gb.sim.publish(reopened);
    expect(r.commit).toBe(continued.commit);
    expect(b.sent.at(-1)!.map((o) => o.sha).sort()).toEqual(a.sent.at(-1)!.map((o) => o.sha).sort());
    const held = reachable(b, gb.c3.commit);
    expect(b.sent.at(-1)!.filter((o) => held.has(o.sha))).toEqual([]);
  });

  test("a retry after no answer sends the same objects again", async () => {
    const git = new Recording();
    const g = await goldenLog(git);
    git.failNext = ["before"];
    await g.sim.publish(g.publisher);
    const [first, retry] = git.sent.slice(-2);
    expect(retry!.map((o) => o.sha)).toEqual(first!.map((o) => o.sha));
  });

  test("a cohort over the bound, to a remote that cannot stage, is refused as cohort-too-large before anything is sent", async () => {
    const git = new Recording();
    (git as { stage?: unknown }).stage = undefined; // a remote without staging
    const g = await goldenLog(git);
    const pushes = git.pushes;
    const small = await LogPublisher.open(git, { maxTransfer: { objects: LOG_TRANSFER_LIMITS.objects, bytes: 100 } });
    const err = await g.sim.publish(small).then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(PublishError);
    expect(err).toMatchObject({ code: "cohort-too-large", retryable: false });
    expect(git.pushes).toBe(pushes);
    expect(git.refs.get(LOG_REF)).toBe(g.c3.commit);
    const fewer = await LogPublisher.open(git, { maxTransfer: { objects: 2, bytes: LOG_TRANSFER_LIMITS.bytes } });
    await expect(g.sim.publish(fewer)).rejects.toMatchObject({ code: "cohort-too-large" });
  });

  test("a reopened publisher sends everything when the head's tree does not rebuild exactly from its files", async () => {
    // A repository whose only log commit has c3's files, with one retained file stored as executable
    // (100755). The publisher reads it as 100644, so the trees it would rebuild are not ones the remote holds.
    const g = await goldenLog(new MemoryGit());
    const files = await readLogFiles(g.remote, g.c3.commit);
    const git = new Recording();
    const odd = [...files.keys()].find((p) => p.split("/").length > 3)!;
    const build = (dir: string): Sha => {
      const names = new Map<string, TreeEntry>();
      for (const [path, data] of files) {
        if (!path.startsWith(dir)) continue;
        const [name, ...rest] = path.slice(dir.length).split("/");
        if (rest.length) names.set(name!, { name: name!, mode: "40000", sha: build(`${dir}${name}/`) });
        else {
          const blob = gitObject("blob", data);
          git.objects.set(blob.sha, blob);
          names.set(name!, { name: name!, mode: (path === odd ? "100755" : "100644") as TreeEntry["mode"], sha: blob.sha });
        }
      }
      const tree = gitObject("tree", encodeTree([...names.values()]));
      git.objects.set(tree.sha, tree);
      return tree.sha;
    };
    const who = "Other <o@x> 0 +0000";
    const forged = gitObject("commit", encodeCommit({ tree: build(""), parents: [], author: who, committer: who, message: "other\n" }));
    git.objects.set(forged.sha, forged);
    git.refs.set(LOG_REF, forged.sha);

    const reopened = await LogPublisher.open(git);
    const r = await g.sim.publish(reopened);
    // Every object the new head reaches is in the repository: nothing was left out as "already there".
    for (const sha of reachable(git, r.commit)) expect(git.objects.has(sha)).toBe(true);
  });
});
