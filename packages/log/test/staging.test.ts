/**
 * Lane B review b618eca1: a publication larger than one transfer, even one
 * object (the active segment) larger than one transfer, is staged in
 * bounded parts and then pushed as the commit alone. The commit is the one
 * `commitFor` computes; staging survives a lost answer, a publisher restart
 * and a lost staging area.
 *
 * One transfer is an option (`maxTransfer`), so every case runs at a
 * transfer of 1 KiB, which the small golden log's segment is several times
 * over.
 */

import { describe, expect, test } from "vitest";
import type { Sha } from "@generalbusiness/artroom-contract";
import { LOG_REF } from "../src/entries.ts";
import { MemoryGit, gitObject, type GitObject, type PushOutcome, type StageOutcome, type StagePart, type StageWant } from "../src/git.ts";
import { LogPublisher } from "../src/publisher.ts";
import { verifyLog } from "../src/verify.ts";
import { goldenLog } from "./support/room-sim.ts";

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

