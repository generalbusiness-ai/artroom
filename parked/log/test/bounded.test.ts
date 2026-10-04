/**
 * Request 5a7290b9: bounded-memory publication. The publisher reads the
 * log from an `EntrySource` in batches, streams each segment blob (size,
 * then ID, then the bytes of each part), reuses the parent's full segments
 * and retained files by ID, and makes exactly the commits the publisher of
 * main 417a1618 made from the same log.
 *
 * The bounds are options (`maxTransfer`, `read`), and the tests pass small
 * ones. Tests that cross a segment boundary run with segments of 10
 * entries (`at`, `src/layout.ts` `setLayoutLimitsForTests`): the reference
 * publisher reads the same segment size.
 */

import { describe, expect, test } from "vitest";
import type { LogEntry, Sha } from "@generalbusiness/artroom-contract";
import { canonicalize, utf8 } from "../src/canonical.ts";
import { sha256Hex } from "../src/crypto.ts";
import { LOG_REF, segmentPath, type Retained } from "../src/entries.ts";
import { MemoryGit, buildTree, encodeCommit, gitObject, type GitObject, type ObjectType, type PushOutcome, type StageOutcome, type StagePart, type StageWant } from "../src/git.ts";
import { LogPublisher, READ_LIMITS, type EntrySource, type RetainedRef } from "../src/publisher.ts";
import { LogPublisher as Reference } from "./support/publisher-417a1618.ts";
import { verifyLog } from "../src/verify.ts";
import { RoomSim, keys, memberAuthority } from "./support/room-sim.ts";
import { at } from "./support/layout2.ts";

const alice = memberAuthority("@alice", keys.alice.key);

/** A source over `entries` that records every read. `swap` may replace what a read returns. */
function sourceOf(entries: readonly LogEntry[], opts: { swap?: (seq: number, e: LogEntry, reads: number) => LogEntry } = {}) {
  const reads: { from: number; limit: number }[] = [];
  const perSeq = new Map<number, number>();
  const through = entries.length - 1;
  const source: EntrySource = {
    through,
    read(from, limit) {
      reads.push({ from, limit });
      return entries.slice(from, Math.min(from + limit, through + 1)).map((e, i) => {
        const seq = from + i;
        const n = (perSeq.get(seq) ?? 0) + 1;
        perSeq.set(seq, n);
        return opts.swap ? opts.swap(seq, e, n) : e;
      });
    },
  };
  return { source, reads };
}

/** Retained files as references by digest, counting the bodies loaded. */
function refsOf(retained: readonly Retained[], loads: string[] = []): RetainedRef[] {
  return retained.map((r) => ({
    kind: r.kind,
    digest: `sha256:${sha256Hex(utf8(r.body))}` as const,
    load: () => {
      loads.push(r.body);
      return r.body;
    },
  }));
}

/** A note on `lane` with `pad` bytes of text. */
function note(sim: RoomSim, lane: string, pad: number): LogEntry {
  return sim.accept(sim.envelope(keys.alice, "note", lane, { text: `n${sim.entries.length} ${"x".repeat(pad)}` }), alice);
}

/** The reference serialization: the files of R-LOG-9 as one tree, exactly as 417a1618's `build` did. */
function referenceCommit(parent: Sha | null, entries: readonly LogEntry[], retained: readonly Retained[], keptFrom: ReadonlyMap<string, string>, checkpoint: ReturnType<RoomSim["checkpoint"]>): Sha {
  const p = new Reference(new MemoryGit());
  // `Reference.commitFor` with a parent other than its last commit uses only `retained`: pass the kept ones too.
  const kept: Retained[] = [...keptFrom].map(([path, body]) => ({ kind: path.includes("/inputs/") ? "input" : "policy", body }));
  return p.commitFor(parent, entries, checkpoint, [...kept, ...retained]);
}

describe("the same commits as 417a1618", () => {
  test("across segment boundaries, staged and unstaged, from arrays and sources, with restarts: every commitFor and every publish equals the reference", at({ segmentEntries: 10 }, async () => {
    const sim = new RoomSim();
    const claim = await sim.claim(keys.alice, alice, ["src/**"]);
    const ref = new Reference(new MemoryGit());
    const arrays = new LogPublisher(new MemoryGit());
    const srcGit = new MemoryGit();
    const bounds = { maxTransfer: { objects: 100_000, bytes: 4093 }, read: { entries: 3, bytes: 1500 } };
    let sources = new LogPublisher(srcGit, bounds);
    // Publish when through is, in turn: inside segment 0, its last entry, the first of segment 1,
    // a jump over a whole segment, and the first two of segment 3 (restarting before each).
    const stops = [3, 9, 10, 26, 30, 31];
    for (const [i, stop] of stops.entries()) {
      while (sim.entries.length <= stop) {
        if (sim.entries.length % 7 === 0) await sim.claim(keys.alice, alice, [`area${sim.entries.length}/**`]);
        else note(sim, claim.lane!, (sim.entries.length * 7) % 300);
      }
      if (i >= 4) sources = await LogPublisher.open(srcGit, bounds);
      sim.entries.length = stop + 1; // the cohort ends exactly at the stop
      const cp = sim.checkpoint();
      const parent = ref.head;
      const expected = ref.commitFor(parent, sim.entries, cp, sim.retained);
      expect(arrays.commitFor(parent, sim.entries, cp, sim.retained)).toBe(expected);
      expect(sources.commitFor(parent, sourceOf(sim.entries).source, cp, refsOf(sim.retained))).toBe(expected);
      // A parent other than the publisher's last commit: every segment from the entries, only the given files.
      expect(sources.commitFor(null, sourceOf(sim.entries).source, cp, refsOf(sim.retained))).toBe(ref.commitFor(null, sim.entries, cp, sim.retained));
      const r = await ref.publish(sim.entries, cp, sim.retained);
      expect(r.commit).toBe(expected);
      expect((await arrays.publish(sim.entries, cp, sim.retained)).commit).toBe(expected);
      expect((await sources.publish(sourceOf(sim.entries).source, cp, refsOf(sim.retained))).commit).toBe(expected);
      sim.system({ type: "checkpoint", through: r.through, hash: r.hash, commit: r.commit });
    }
    expect(sources.stats.largestSegment).toBeGreaterThan(4093);
    const report = await verifyLog(srcGit);
    expect(report.failures).toEqual([]);
    expect(report).toMatchObject({ ok: true, commits: stops.length, verifiedThrough: 31 });
  }));

  test("the reference serialization rebuilt from R-LOG-9's files gives the same commit (the reference is the layout, not only the old code)", at({ segmentEntries: 10 }, async () => {
    const sim = new RoomSim();
    const claim = await sim.claim(keys.alice, alice, ["src/**"]);
    while (sim.entries.length < 13) note(sim, claim.lane!, 50);
    const cp = sim.checkpoint();
    const p = new LogPublisher(new MemoryGit());
    const files: Record<string, Uint8Array> = {};
    files[`artroom-log/v1/genesis.json`] = utf8(canonicalize((sim.entries[0]!.entry as { event: { genesis: unknown } }).event.genesis));
    files[segmentPath(0)] = utf8(sim.entries.slice(0, 10).map((e) => canonicalize(e)).join("\n"));
    files[segmentPath(10)] = utf8(sim.entries.slice(10).map((e) => canonicalize(e)).join("\n"));
    for (const r of sim.retained) files[`artroom-log/v1/${r.kind === "input" ? "inputs" : "policies"}/${sha256Hex(utf8(r.body))}.json`] = utf8(r.body);
    files[`artroom-log/v1/checkpoint.json`] = utf8(canonicalize(cp));
    const who = `Artroom Room <room@artroom.invalid> ${Math.floor(Date.parse(cp.at) / 1000)} +0000`;
    const tree = buildTree(files).root;
    const commit = gitObject("commit", encodeCommit({ tree, parents: [], author: who, committer: who, message: `artroom log through ${cp.through}\n\nhash ${cp.hash}\n` }));
    expect(p.commitFor(null, sourceOf(sim.entries).source, cp, refsOf(sim.retained))).toBe(commit.sha);
    expect(referenceCommit(null, sim.entries, sim.retained, new Map(), cp)).toBe(commit.sha);
  }));
});

describe("bounded reads", () => {
  test("after the first publication, only the last segment is read, in batches within the read limit; full segments are reused by ID", at({ segmentEntries: 10 }, async () => {
    const sim = new RoomSim();
    const claim = await sim.claim(keys.alice, alice, ["src/**"]);
    const git = new MemoryGit();
    const read = { entries: 4, bytes: READ_LIMITS.bytes };
    const p = new LogPublisher(git, { read });
    while (sim.entries.length < 25) note(sim, claim.lane!, 20);
    await p.publish(sourceOf(sim.entries).source, sim.checkpoint(), refsOf(sim.retained));
    for (let i = 0; i < 4; i++) note(sim, claim.lane!, 20);
    for (const publisher of [p, await LogPublisher.open(git, { read })]) {
      const { source, reads } = sourceOf(sim.entries);
      const cp = sim.checkpoint();
      const expected = new Reference(new MemoryGit()).commitFor(p.head, sim.entries, cp, sim.retained);
      expect(publisher.commitFor(publisher.head, source, cp, [])).toBe(expected);
      expect(reads.every((r) => r.limit <= read.entries)).toBe(true);
      // The parent's checkpoint names entry 24; segment 20 is the last. Entries 0 to 19 are never read.
      const seqs = reads.flatMap((r) => Array.from({ length: r.limit }, (_, i) => r.from + i));
      expect(Math.min(...seqs)).toBe(20);
    }
  }));

  test("a publication over one transfer reads each part's lines from where the part starts, and lands the reference commit", async () => {
    const sim = new RoomSim();
    const claim = await sim.claim(keys.alice, alice, ["src/**"]);
    while (sim.entries.length < 30) note(sim, claim.lane!, 400);
    const git = new MemoryGit();
    const p = new LogPublisher(git, { maxTransfer: { objects: 100_000, bytes: 4 * 1024 }, read: { entries: 4, bytes: 1 << 20 } });
    const { source, reads } = sourceOf(sim.entries);
    const cp = sim.checkpoint();
    const r = await p.publish(source, cp, refsOf(sim.retained));
    expect(r.commit).toBe(new Reference(new MemoryGit()).commitFor(null, sim.entries, cp, sim.retained));
    // Three passes over the segment (size, ID, bytes) and one read of the checkpoint's entry; never the whole log at once.
    expect(reads.every((x) => x.limit <= 4)).toBe(true);
    const total = reads.reduce((n, x) => n + x.limit, 0);
    expect(total).toBeLessThan(sim.entries.length * 3 + 2 + 40); // a part may start inside a line: that line is read twice
    expect(p.stats.peakSendBytes).toBeLessThanOrEqual(4 * 1024);
    expect(p.stats.largestSegment).toBeGreaterThan(4 * 1024 * 5);
    expect(p.stats.sentSegmentBytes).toBe(p.stats.largestSegment);
    expect(p.stats.peakBatchBytes).toBeLessThan(4 * 2 * 1024);
    expect((await verifyLog(git)).ok).toBe(true);
  });

  test("a retained file the parent holds is not read again; a new one is read to hash it and to send it", async () => {
    const sim = new RoomSim();
    await sim.claim(keys.alice, alice, ["src/**"]);
    const git = new MemoryGit();
    const p = new LogPublisher(git);
    const first: string[] = [];
    await p.publish(sourceOf(sim.entries).source, sim.checkpoint(), refsOf(sim.retained, first));
    expect(first.length).toBe(sim.retained.length * 2); // hashed, then pushed
    const before = sim.retained.length;
    await sim.claim(keys.alice, alice, ["docs/**"]); // retains a new replay context
    const fresh = sim.retained.length - before;
    expect(fresh).toBeGreaterThan(0);
    const loads: string[] = [];
    const cp = sim.checkpoint();
    const parent = p.head;
    const r = await p.publish(sourceOf(sim.entries).source, cp, refsOf(sim.retained, loads));
    expect(new Set(loads)).toEqual(new Set(sim.retained.slice(before).map((x) => x.body)));
    expect(r.commit).toBe(referenceCommit(parent, sim.entries, sim.retained, new Map(), cp));
  });
});

describe("guards", () => {
  async function published() {
    const sim = new RoomSim();
    const claim = await sim.claim(keys.alice, alice, ["src/**"]);
    while (sim.entries.length < 10) note(sim, claim.lane!, 30);
    const git = new MemoryGit();
    const p = new LogPublisher(git);
    await p.publish(sourceOf(sim.entries).source, sim.checkpoint(), refsOf(sim.retained));
    for (let i = 0; i < 5; i++) note(sim, claim.lane!, 30);
    return { sim, git, p, lane: claim.lane! };
  }
  const changed = (e: LogEntry): LogEntry => ({ ...e, at: "2026-10-02T00:00:00.000Z" });
  const longer = (e: LogEntry): LogEntry => ({ ...e, roomSig: `${e.roomSig}A` });

  test("size mismatch: an entry whose length changes between the size pass and the ID pass is invalid-input; nothing is pushed", async () => {
    const { sim, git, p } = await published();
    const pushes = git.pushes;
    // Longer on the second read only: the size pass and the bytes sent see the same entry, the ID pass another.
    const { source } = sourceOf(sim.entries, { swap: (seq, e, n) => (seq === 12 && n === 2 ? longer(e) : e) });
    await expect(p.publish(source, sim.checkpoint(), [])).rejects.toMatchObject({ code: "invalid-input" });
    expect(git.pushes).toBe(pushes);
  });

  test("size mismatch: an entry whose length changes while a part is read is invalid-input; nothing is pushed", async () => {
    const { sim, git } = await published();
    const p = await LogPublisher.open(git, { maxTransfer: { objects: 100_000, bytes: 1500 } });
    const pushes = git.pushes;
    const { source } = sourceOf(sim.entries, { swap: (seq, e, n) => (seq === 11 && n >= 3 ? longer(e) : e) });
    await expect(p.publish(source, sim.checkpoint(), [])).rejects.toMatchObject({ code: "invalid-input" });
    expect(git.pushes).toBe(pushes);
    expect(git.refs.get(LOG_REF)).toBe(p.head);
  });

  test("size mismatch: a retained file whose body changes between hashing and sending is invalid-input; nothing is pushed", async () => {
    const { sim, git, p, lane } = await published();
    const extra = { kind: "input" as const, body: canonicalize({ note: "a new replay context" }) };
    let loads = 0;
    const ref: RetainedRef = { kind: "input", digest: `sha256:${sha256Hex(utf8(extra.body))}`, load: () => (++loads > 1 ? canonicalize({ note: "another, longer replay context" }) : extra.body) };
    note(sim, lane, 30);
    const pushes = git.pushes;
    await expect(p.publish(sourceOf(sim.entries).source, sim.checkpoint(), [ref])).rejects.toMatchObject({ code: "invalid-input" });
    expect(git.pushes).toBe(pushes);
  });

  test("out of order: a source that returns entries out of seq order is invalid-input", async () => {
    const { sim, p } = await published();
    const { source } = sourceOf(sim.entries, { swap: (seq, e) => (seq === 11 ? sim.entries[12]! : seq === 12 ? sim.entries[11]! : e) });
    await expect(p.publish(source, sim.checkpoint(), [])).rejects.toMatchObject({ code: "invalid-input" });
    const short: EntrySource = { through: sim.entries.length - 1, read: (from, limit) => sim.entries.slice(from, from + limit - 1) };
    await expect(p.publish(short, sim.checkpoint(), [])).rejects.toMatchObject({ code: "invalid-input" });
  });

  test("out of order: staging skips a part that does not start where the object's staging stopped, and answers where to resume", async () => {
    const git = new MemoryGit();
    const data = utf8("0123456789".repeat(30));
    const o = gitObject("blob", data);
    const want = [{ sha: o.sha, type: "blob" as const, size: data.length }];
    const cohort = "c".repeat(40) as Sha;
    const part = (offset: number, n: number) => ({ ...want[0]!, offset, data: data.subarray(offset, offset + n) });
    expect(await git.stage(cohort, want, [part(100, 100)])).toEqual({ ok: true, missing: [{ sha: o.sha, have: 0 }] });
    expect(await git.stage(cohort, want, [part(0, 100)])).toEqual({ ok: true, missing: [{ sha: o.sha, have: 100 }] });
    expect(await git.stage(cohort, want, [part(200, 100)])).toEqual({ ok: true, missing: [{ sha: o.sha, have: 100 }] });
    expect(await git.stage(cohort, want, [part(100, 100), part(200, 100)])).toEqual({ ok: true, missing: [] });
    expect(git.objects.get(o.sha)?.data).toEqual(data);
  });

  test("out of order: a remote that drops some parts and lags its answers still gets each part from where it stopped; the reference commit lands", async () => {
    class Lossy extends MemoryGit {
      calls = 0;
      override async stage(cohort: Sha, want: readonly StageWant[], parts: readonly StagePart[]): Promise<StageOutcome> {
        this.calls++;
        return super.stage(cohort, want, this.calls % 5 === 0 ? [] : parts);
      }
    }
    const sim = new RoomSim();
    const claim = await sim.claim(keys.alice, alice, ["src/**"]);
    while (sim.entries.length < 30) note(sim, claim.lane!, 200);
    const git = new Lossy();
    const p = new LogPublisher(git, { maxTransfer: { objects: 100_000, bytes: 1999 }, attempts: 100 });
    const cp = sim.checkpoint();
    const r = await p.publish(sourceOf(sim.entries).source, cp, refsOf(sim.retained));
    expect(r.commit).toBe(new Reference(new MemoryGit()).commitFor(null, sim.entries, cp, sim.retained));
    expect((await verifyLog(git)).ok).toBe(true);
  });

  test("every part of a segment is exactly the reference blob's bytes, wherever it starts and ends", async () => {
    const sim = new RoomSim();
    const claim = await sim.claim(keys.alice, alice, ["src/**"]);
    while (sim.entries.length < 12) note(sim, claim.lane!, (sim.entries.length * 13) % 70);
    const blob = utf8(sim.entries.map((e) => canonicalize(e)).join("\n"));
    const sha = gitObject("blob", blob).sha;
    const seen: Uint8Array[] = [];
    class Capture extends MemoryGit {
      override async stage(cohort: Sha, want: readonly StageWant[], parts: readonly StagePart[]): Promise<StageOutcome> {
        for (const part of parts) if (part.sha === sha) {
          expect(part.data).toEqual(blob.subarray(part.offset, part.offset + part.data.length));
          seen.push(part.data);
        }
        return super.stage(cohort, want, parts);
      }
    }
    // Sizes that share no factor with the lines' lengths: a few bytes, under one line, over one line.
    for (const bytes of [7, 97, 1001]) {
      seen.length = 0;
      const git = new Capture();
      const p = new LogPublisher(git, { maxTransfer: { objects: 100_000, bytes }, read: { entries: 3, bytes: 300 } });
      await p.publish(sourceOf(sim.entries).source, sim.checkpoint(), refsOf(sim.retained));
      expect(seen.reduce((n, d) => n + d.length, 0)).toBe(blob.length);
      expect(git.objects.get(sha)?.data).toEqual(blob);
    }
  });

  test("would-rewrite: when the parent's last segment is full, the entry its checkpoint names is still checked", at({ segmentEntries: 10 }, async () => {
    const sim = new RoomSim();
    const claim = await sim.claim(keys.alice, alice, ["src/**"]);
    while (sim.entries.length < 10) note(sim, claim.lane!, 5);
    const p = new LogPublisher(new MemoryGit());
    expect((await p.publish(sourceOf(sim.entries).source, sim.checkpoint(), refsOf(sim.retained))).through).toBe(9);
    note(sim, claim.lane!, 5);
    // Segment 0 is reused by ID and not read; entry 9, which the parent's checkpoint names, is, by its hash.
    const changed9 = sourceOf(sim.entries, { swap: (seq, e) => (seq === 9 ? { ...e, hash: `sha256:${"0".repeat(64)}` as never } : e) }).source;
    await expect(p.publish(changed9, sim.checkpoint(), [])).rejects.toMatchObject({ code: "would-rewrite" });
    const honest = sourceOf(sim.entries);
    expect((await p.publish(honest.source, sim.checkpoint(), [])).through).toBe(10);
    expect(new Set(honest.reads.flatMap((r) => Array.from({ length: r.limit }, (_, i) => r.from + i)).filter((seq) => seq < 10))).toEqual(new Set([9]));
  }));

  test("would-rewrite: a changed published entry in the last segment, a changed entry at the checkpoint, a shorter log", async () => {
    const { sim, p } = await published();
    const changedAt = (n: number) => sourceOf(sim.entries, { swap: (seq, e) => (seq === n ? changed(e) : e) }).source;
    await expect(p.publish(changedAt(3), sim.checkpoint(), [])).rejects.toMatchObject({ code: "would-rewrite" });
    expect(() => p.commitFor(p.head, changedAt(3), sim.checkpoint(), [])).toThrow(/published history is never rewritten/);
    const hashChanged = sourceOf(sim.entries, { swap: (seq, e) => (seq === 9 ? { ...e, hash: `sha256:${"0".repeat(64)}` as never } : e) }).source;
    await expect(p.publish(hashChanged, sim.checkpoint(), [])).rejects.toMatchObject({ code: "would-rewrite" });
    const shorter = new RoomSim();
    await expect(p.publish(shorter.entries, shorter.checkpoint(), [])).rejects.toMatchObject({ code: "would-rewrite" });
    // Unchanged, the same log publishes.
    expect((await p.publish(sourceOf(sim.entries).source, sim.checkpoint(), [])).through).toBe(14);
  });
});

describe("opening from the ref", () => {
  test("reads the head's trees and checkpoint only: no segment and no retained file", at({ segmentEntries: 10 }, async () => {
    const sim = new RoomSim();
    const claim = await sim.claim(keys.alice, alice, ["src/**"]);
    while (sim.entries.length < 15) note(sim, claim.lane!, 10);
    const git = new MemoryGit();
    const first = new LogPublisher(git);
    const r = await first.publish(sim.entries, sim.checkpoint(), sim.retained);
    const read: { sha: string; type: ObjectType; size: number }[] = [];
    const counting: MemoryGit = Object.assign(Object.create(git) as MemoryGit, {
      readObject: async (sha: Sha) => {
        const o = await git.readObject(sha);
        read.push({ sha, type: o.type, size: o.data.length });
        return o;
      },
    });
    const p = await LogPublisher.open(counting);
    expect(p).toMatchObject({ head: r.commit, publishedThrough: 14 });
    const blobs = read.filter((x) => x.type === "blob");
    expect(blobs).toHaveLength(1); // checkpoint.json
    expect(blobs[0]!.size).toBeLessThan(1000);
  }));

  test("a head that is not a log commit, or whose segments do not match its checkpoint, is unexpected-writer", async () => {
    const git = new MemoryGit();
    const blob = gitObject("blob", utf8("hello"));
    const tree = buildTree({ "README.md": utf8("hello") });
    for (const o of tree.objects) git.objects.set(o.sha, o);
    const commit = gitObject("commit", encodeCommit({ tree: tree.root, parents: [], author: "x <x@x> 0 +0000", committer: "x <x@x> 0 +0000", message: "m\n" }));
    git.objects.set(commit.sha, commit);
    git.objects.set(blob.sha, blob);
    git.refs.set(LOG_REF, commit.sha);
    await expect(LogPublisher.open(git)).rejects.toMatchObject({ code: "unexpected-writer" });

    // A real log commit, then one whose checkpoint names entries its segments do not hold.
    const sim = new RoomSim();
    const real = new MemoryGit();
    await new LogPublisher(real).publish(sim.entries, sim.checkpoint(), sim.retained);
    const files = new Map<string, Uint8Array>();
    for (const [path, data] of await (await import("../src/publisher.ts")).readLogFiles(real, real.refs.get(LOG_REF)!)) files.set(path, data);
    const cp = JSON.parse(new TextDecoder().decode(files.get("artroom-log/v1/checkpoint.json")!));
    files.set("artroom-log/v1/checkpoint.json", utf8(canonicalize({ ...cp, through: 1000 })));
    const forged = buildTree(Object.fromEntries(files));
    for (const o of forged.objects) real.objects.set(o.sha, o);
    const c2 = gitObject("commit", encodeCommit({ tree: forged.root, parents: [], author: "x <x@x> 0 +0000", committer: "x <x@x> 0 +0000", message: "m\n" }));
    real.objects.set(c2.sha, c2);
    real.refs.set(LOG_REF, c2.sha);
    await expect(LogPublisher.open(real)).rejects.toMatchObject({ code: "unexpected-writer" });
  });
});

describe("a large active segment, from a source", () => {
  test("an active segment over one transfer, with an entry near the read limit: bounded batches and parts, the reference commit, verified", async () => {
    const sim = new RoomSim();
    const claim = await sim.claim(keys.alice, alice, ["src/**"]);
    const bounds = { maxTransfer: { objects: 100_000, bytes: 8 * 1024 }, read: { entries: 64, bytes: 8 * 1024 } };
    // A claim whose reasons carry its line close to one read.
    const because = Array.from({ length: 3 }, (_, i) => ({ url: `https://example.com/${i}/${"r".repeat(2000)}` }));
    sim.accept(sim.envelope(keys.alice, "claim", null, { goal: "A large claim", scope: ["big/**"], because }), alice);
    const big = utf8(canonicalize(sim.last)).length;
    expect(big).toBeGreaterThan(6 * 1024);
    expect(big).toBeLessThan(bounds.read.bytes);
    while (sim.entries.length < 40) note(sim, claim.lane!, 1024);
    const git = new MemoryGit();
    const pushed: GitObject[][] = [];
    const orig = git.push.bind(git);
    git.push = async (objects, ref, next, lease): Promise<PushOutcome> => {
      pushed.push([...objects]);
      return orig(objects, ref, next, lease);
    };
    const p = new LogPublisher(git, bounds);
    const cp = sim.checkpoint();
    const r = await p.publish(sourceOf(sim.entries).source, cp, refsOf(sim.retained));
    expect(r.commit).toBe(new Reference(new MemoryGit()).commitFor(null, sim.entries, cp, sim.retained));
    expect(pushed.at(-1)).toEqual([]);
    expect(p.stats.largestSegment).toBeGreaterThan(6 * bounds.maxTransfer.bytes);
    expect(p.stats.peakSendBytes).toBeLessThanOrEqual(bounds.maxTransfer.bytes);
    expect(p.stats.peakBatchBytes).toBeLessThanOrEqual(bounds.read.bytes);
    expect((await verifyLog(git)).ok).toBe(true);
  });

  test("an entry over the read limit, among small ones, is read alone: no read holds more than the byte limit or one entry", async () => {
    const sim = new RoomSim();
    const claim = await sim.claim(keys.alice, alice, ["src/**"]);
    const read = { entries: 64, bytes: 4096 };
    for (let i = 0; i < 20; i++) note(sim, claim.lane!, 10);
    const to = Array.from({ length: 120 }, (_, i) => `@member${String(i).padStart(6, "0")}${"m".repeat(48)}` as never);
    sim.system({ type: "notified", entry: claim.lane!, decisions: [], to });
    const huge = utf8(canonicalize(sim.last)).length;
    expect(huge).toBeGreaterThan(read.bytes);
    for (let i = 0; i < 10; i++) note(sim, claim.lane!, 10);
    const git = new MemoryGit();
    const p = new LogPublisher(git, { read });
    const cp = sim.checkpoint();
    const r = await p.publish(sourceOf(sim.entries).source, cp, refsOf(sim.retained));
    expect(r.commit).toBe(new Reference(new MemoryGit()).commitFor(null, sim.entries, cp, sim.retained));
    expect(p.stats.peakBatchBytes).toBe(huge); // the large entry, read alone
    expect((await verifyLog(git)).ok).toBe(true);
  });
});
