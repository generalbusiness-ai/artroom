/**
 * What one transfer may carry (lane B reviews f7d273e1 (2) and b618eca1).
 *
 * A push carries only the objects its lease does not hold, so the transfer
 * bound limits one cohort, never the accumulated log. A publication larger
 * than one transfer, even one object (the active segment) larger than one
 * transfer, is staged in bounded parts and then pushed as the commit alone.
 * The commit is the one `commitFor` computes; staging survives a lost
 * answer, a publisher restart and a lost staging area. Only a remote that
 * cannot stage refuses a cohort over the bound, by name.
 *
 * One transfer is an option (`maxTransfer`), so the staging cases run at a
 * transfer of 1 KiB, which the small golden log's segment is several times
 * over.
 */

import { describe, expect, test } from "vitest";
import type { Sha } from "@generalbusiness/artroom-contract";
import { LOG_REF } from "../src/entries.ts";
import { MemoryGit, encodeCommit, encodeTree, gitObject, type GitObject, type PushOutcome, type StageOutcome, type StagePart, type StageWant, type TreeEntry } from "../src/git.ts";
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

/** A MemoryGit that records every stage call and push, and can fail a stage call once. */
class Staging extends MemoryGit {
  readonly calls: { parts: number; bytes: number; missing: { sha: string; have: number }[] }[] = [];
  readonly pushed: GitObject[][] = [];
  failStageAt = -1;
  override async stage(cohort: Sha, want: readonly StageWant[], parts: readonly StagePart[]): Promise<StageOutcome> {
    const lose = this.calls.length === this.failStageAt;
    const r = await super.stage(cohort, want, parts);
    if (lose) {
      this.failStageAt = -1;
      this.calls.push({ parts: -1, bytes: 0, missing: [] });
      throw new Error("simulated: the parts were staged and the answer was lost");
    }
    this.calls.push({ parts: parts.length, bytes: parts.reduce((n, p) => n + p.data.length, 0), missing: r.ok ? [...r.missing] : [] });
    return r;
  }
  override async push(objects: readonly GitObject[], ref: string, next: Sha, lease: Sha | null): Promise<PushOutcome> {
    this.pushed.push([...objects]);
    return super.push(objects, ref, next, lease);
  }
}

const tiny = { objects: 100_000, bytes: 1024 };

/** The golden log, then one more cohort published by a fresh publisher with `opts`; and the same unbounded, for reference. */
async function oneMore(remote: MemoryGit, opts: ConstructorParameters<typeof LogPublisher>[1]) {
  const ref = await goldenLog(new MemoryGit());
  const expected = (await ref.sim.publish(ref.publisher)).commit;
  const g = await goldenLog(remote);
  return { g, expected, publisher: await LogPublisher.open(remote, opts) };
}

describe("review b618eca1: staged publication", () => {
  test("a segment blob larger than one transfer is staged in bounded chunks, then the commit alone is pushed; the commit and the log are as unbounded", async () => {
    const git = new Staging();
    const { g, expected, publisher } = await oneMore(git, { maxTransfer: tiny });
    const before = git.calls.length;
    const r = await g.sim.publish(publisher);
    expect(r.commit).toBe(expected);
    const calls = git.calls.slice(before);
    expect(calls.length).toBeGreaterThan(3);
    expect(calls.every((c) => c.bytes <= tiny.bytes)).toBe(true);
    expect(git.pushed.at(-1)).toEqual([]); // the push carries nothing: everything was staged
    // Some object needed more than one part: a blob larger than one transfer.
    const resumed = calls.flatMap((c) => c.missing).filter((m) => m.have > 0);
    expect(resumed.length).toBeGreaterThan(0);
    // The active segment stays over one transfer: the next one-entry cohort, from the same publisher, is staged in parts too.
    const again = git.calls.length;
    const next = await g.sim.publish(publisher);
    expect(next.through - r.through).toBe(1);
    expect(git.calls.length - again).toBeGreaterThan(3);
    expect(git.calls.slice(again).every((c) => c.bytes <= tiny.bytes)).toBe(true);
    expect(git.pushed.at(-1)).toEqual([]);
    const report = await verifyLog(git);
    expect(report.failures).toEqual([]);
    expect(report).toMatchObject({ ok: true, head: next.commit, commits: 5 });
  });

  test("a lost stage answer: the next attempt asks what is missing and resumes, with the same commit", async () => {
    const git = new Staging();
    const { g, expected, publisher } = await oneMore(git, { maxTransfer: tiny });
    git.failStageAt = git.calls.length + 4;
    const r = await g.sim.publish(publisher);
    expect(r).toMatchObject({ commit: expected, attempts: 2 });
  });

  test("a publisher that stops mid-staging, reopened, resumes from what is staged; a lost staging area is staged again; the same commit", async () => {
    for (const lose of [false, true]) {
      const git = new Staging();
      const { g, expected } = await oneMore(git, { maxTransfer: tiny });
      const first = await LogPublisher.open(git, { maxTransfer: tiny, attempts: 1 });
      git.failStageAt = git.calls.length + 4;
      await expect(g.sim.publish(first)).rejects.toMatchObject({ code: "unresolved" });
      expect(git.refs.get(LOG_REF)).toBe(g.c3.commit);
      if (lose) git.staging.drop(); // the sandbox restarted
      const before = git.calls.length;
      const again = await LogPublisher.open(git, { maxTransfer: tiny });
      expect((await g.sim.publish(again)).commit).toBe(expected);
      const probe = git.calls[before]!;
      expect(probe.parts).toBe(0);
      expect(probe.missing.some((m) => m.have > 0)).toBe(!lose); // resumed, or staged from the start
      expect((await verifyLog(git)).ok).toBe(true);
    }
  });

  test("a remote whose staging makes no progress is not asked forever: the attempt ends, and the publication is unresolved with nothing pushed", async () => {
    const git = new Staging();
    const { g, publisher } = await oneMore(git, { maxTransfer: tiny });
    const stuck = git.stage.bind(git);
    let calls = 0;
    git.stage = async (cohort, want) => {
      calls++;
      return stuck(cohort, want, []); // accepts nothing
    };
    const pushes = git.pushed.length;
    await expect(g.sim.publish(publisher)).rejects.toMatchObject({ code: "unresolved" });
    expect(git.pushed.length).toBe(pushes);
    expect(calls).toBeLessThanOrEqual(5 * 2);
  });

  test("in-memory staging checks each completed object against its ID, and parts against the object", async () => {
    const git = new MemoryGit();
    const data = new Uint8Array(100).fill(7);
    const { sha } = gitObject("blob", data);
    const want = [{ sha, type: "blob" as const, size: 100 }];
    const cohort = "c".repeat(40) as Sha;
    expect(await git.stage(cohort, want, [{ ...want[0]!, offset: 0, data: data.subarray(0, 60) }])).toEqual({ ok: true, missing: [{ sha, have: 60 }] });
    const forged = await git.stage(cohort, want, [{ ...want[0]!, offset: 60, data: new Uint8Array(40) }]);
    expect(forged.ok).toBe(false);
    expect(git.objects.has(sha)).toBe(false);
    expect((await git.stage(cohort, want, [{ ...want[0]!, offset: 0, data: new Uint8Array(101) }])).ok).toBe(false);
    expect(await git.stage(cohort, want, [{ ...want[0]!, offset: 0, data }])).toEqual({ ok: true, missing: [] });
    expect(git.objects.has(sha)).toBe(true);
  });
});
