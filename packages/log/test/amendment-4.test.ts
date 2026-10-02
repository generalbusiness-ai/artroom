/**
 * Contract amendment 4 (docs/protocol.md section 30), lane L: layout 2.
 * The shared rules against the contract's reference functions
 * (`packages/contract/examples/log-layout.ts`), and the acceptance cases of
 * 30.7 that need no Room and no entry over 1 MiB. The cases with entries or
 * files of 8 MiB and more, and 5 million entries, are in
 * `amendment-4-large.test.ts`.
 */

import { afterEach, describe, expect, test, vi } from "vitest";
import type { Checkpoint, Sha } from "@generalbusiness/artroom-contract";
import * as ref from "../../contract/examples/log-layout.ts";
import { canonicalize, utf8 } from "../src/canonical.ts";
import { Malformed, decodeCheckpoint, decodeChunkedLine } from "../src/decode.ts";
import { LOG_REF, ROOT } from "../src/entries.ts";
import { MemoryGit, OBJECT_TOO_LARGE, parseCommit } from "../src/git.ts";
import * as layout from "../src/layout.ts";
import { OBJECT_BOUND as B, Placement } from "../src/layout.ts";
import { LogPublisher, PublishError, type EntryLine, type EntrySource, type RetainedRef } from "../src/publisher.ts";
import type { LogEntry } from "@generalbusiness/artroom-contract";
import { sha256Hex } from "../src/crypto.ts";
import { verifyLog } from "../src/verify.ts";
import { L2, RoomSim, Scripted, alice, exact, graft, keys, lineOf, note, rewrite, walk } from "./support/layout2.ts";

/** A seeded generator, so each run checks the same cases. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const cp = (l: ReturnType<typeof L2> | undefined) => ({ layout: l }) as unknown as Checkpoint;

describe("the shared rules agree with the contract's reference functions (examples/log-layout.ts)", () => {
  test("the bound, the directory limit and the segment count are the contract's", () => {
    expect(layout.OBJECT_BOUND).toBe(ref.OBJECT_BOUND);
    expect(layout.ARTIFACTS_OBJECT_LIMIT).toBe(ref.ARTIFACTS_OBJECT_LIMIT);
    expect(layout.DIRECTORY_ENTRIES).toBe(ref.DIRECTORY_ENTRIES);
    expect(layout.SEGMENT_ENTRIES).toBe(ref.SEGMENT_ENTRIES);
    expect(B * 4).toBe(ref.ARTIFACTS_OBJECT_LIMIT);
  });

  test("chunkedLine and placedBytes", () => {
    const d = `sha256:${"ab".repeat(32)}` as const;
    for (const [seq, n] of [[0, 1], [1, B], [7, B + 1], [999_999_999_999, 20 * 2 ** 20]] as const) {
      expect(layout.chunkedLine(seq, n, d)).toBe(ref.chunkedLine(seq, n, d));
      expect(layout.placedBytes(seq, n)).toBe(ref.placedBytes(seq, n));
    }
  });

  test("segmentStarts: random line lengths around the bound, in layout 1, from 0, and from a seq inside the log", () => {
    const r = rng(7);
    const sizes = [() => 1 + Math.floor(r() * 400), () => 60_000 + Math.floor(r() * 5_000), () => B - 2 - Math.floor(r() * 3), () => B + Math.floor(r() * 3), () => Math.floor(B / 2) + Math.floor(r() * 2)];
    for (let run = 0; run < 40; run++) {
      const n = 1 + Math.floor(r() * 2500);
      const lens = Array.from({ length: n }, () => sizes[Math.floor(r() * sizes.length) % (run % 2 ? sizes.length : 2)]!());
      for (const l of [undefined, L2(0), L2(Math.floor(r() * n))]) expect(layout.segmentStarts(lens, cp(l))).toEqual(ref.segmentStarts(lens, cp(l)));
    }
  });

  test("Placement places one entry at a time exactly as segmentStarts", () => {
    const lens = [500, B - 501, 1, 3, B, B + 1, 2, ...Array.from({ length: 1500 }, () => 9)];
    const p = new Placement(L2(2));
    const starts = lens.flatMap((n, seq) => (p.place(seq, n) ? [seq] : []));
    expect(starts).toEqual(ref.segmentStarts(lens, cp(L2(2))));
  });

  test("chunks: names and lengths", () => {
    for (const n of [1, B - 1, B, B + 1, 2 * B, 2 * B + 1, 20 * 2 ** 20, 3 * B])
      expect(layout.chunks(n).map(({ name, bytes }) => ({ name, bytes }))).toEqual(ref.chunks(n));
  });

  test("shardsOf: name sets below, at and over the directory limit, a shared hex prefix, and 5 million entries' segments", () => {
    const hex = (i: number, prefix = "") => (prefix + (i * 2654435761 >>> 0).toString(16).padStart(8, "0") + i.toString(16).padStart(8, "0")).padEnd(64, "0");
    const hexKey = (n: string) => n.slice(0, 64);
    const decKey = (n: string) => n.slice(0, 12);
    const sets: [string[], (n: string) => string, 2 | 3][] = [
      [Array.from({ length: 10 }, (_, i) => `${hex(i)}.json`), hexKey, 2],
      [Array.from({ length: 4096 }, (_, i) => `${hex(i)}.json`), hexKey, 2],
      [Array.from({ length: 4097 }, (_, i) => `${hex(i)}.json`), hexKey, 2],
      [[...Array.from({ length: 5000 }, (_, i) => `${hex(i, "ab")}.json`), `${hex(1, "cd")}.json`], hexKey, 2],
      [Array.from({ length: 5000 }, (_, i) => `${layout.twelve(i * 1000)}.jsonl`), decKey, 3],
      [Array.from({ length: 4097 }, (_, i) => layout.twelve(i)), decKey, 3],
    ];
    for (const [names, key, group] of sets) {
      const sample = names.filter((_, i) => i % 37 === 0 || i === names.length - 1);
      for (const n of sample) expect(layout.shardsOf(names, n, key, group), n).toEqual(ref.shardsOf(names, n, key, group));
    }
  });
});

describe("decoding", () => {
  const base = { format: "artroom-log-v1", room: "room_x", through: 3, hash: `sha256:${"0".repeat(64)}`, at: "2026-10-02T00:00:00.000Z", roomKey: "k", sig: "s" };
  test("a checkpoint's layout is exactly { version: 2, from } with a seq from; absent is layout 1", () => {
    expect(decodeCheckpoint(utf8(canonicalize(base))).layout).toBeUndefined();
    expect(decodeCheckpoint(utf8(canonicalize({ ...base, layout: { version: 2, from: 4 } }))).layout).toEqual({ version: 2, from: 4 });
    for (const bad of [{ version: 3, from: 0 }, { version: 2, from: -1 }, { version: 2, from: "0" }, { version: 2 }, { version: 2, from: 0, extra: 1 }, null, 2])
      expect(() => decodeCheckpoint(utf8(canonicalize({ ...base, layout: bad })))).toThrow(Malformed);
  });

  test("a ChunkedLine is recognised, must be canonical, and never looks like an entry", () => {
    const line = layout.chunkedLine(5, B + 1, `sha256:${"1".repeat(64)}`);
    expect(decodeChunkedLine(line)).toEqual({ chunked: { bytes: B + 1, digest: `sha256:${"1".repeat(64)}` }, seq: 5 });
    expect(decodeChunkedLine('{"at":"x"}')).toBeNull();
    for (const bad of [line.replace('"seq":5', '"seq":5,"x":1'), line.replace("sha256:", "sha1:"), `${line} `, '{"chunked":{"bytes":1,"digest":"sha256:' + "1".repeat(64) + '","x":2},"seq":1}', '{"chunked":'])
      expect(() => decodeChunkedLine(bad), bad).toThrow(Malformed);
  });
});

/** A room with a claimed lane: entries 0 to 2. */
async function room() {
  const sim = new RoomSim();
  const { lane } = await sim.claim(keys.alice, alice, ["src/**"]);
  return { sim, lane: lane! };
}

/** The segment starts of a published commit, from its tree. */
async function starts(git: MemoryGit, commit: Sha): Promise<number[]> {
  const { files } = await walk(git, commit);
  return [...files.keys()].filter((p) => p.startsWith(`${ROOT}/segments/`)).map((p) => Number(p.slice(-18, -6))).sort((a, b) => a - b);
}

describe("acceptance cases (30.7): segments", () => {
  test("Byte close: entries near the 64 KiB envelope bound close a segment before it passes B; every segment is at most B; earlier segments never change; verify passes", async () => {
    const { sim, lane } = await room();
    const git = new MemoryGit();
    git.objectLimit = B;
    const p = new LogPublisher(git);
    const sizes = () => sim.entries.map(lineOf);
    while (sim.entries.length < 140) note(sim, lane, 64_000);
    const c1 = await p.publish(sim.entries, sim.checkpoint(L2(0)), sim.retained);
    while (sim.entries.length < 270) note(sim, lane, 64_000);
    const c2 = await p.publish(sim.entries, sim.checkpoint(L2(0)), sim.retained);
    const want = ref.segmentStarts(sizes(), cp(L2(0)));
    // "After about 128 entries": 3 small entries, then about 128 lines of about 65,000 bytes.
    expect(want[1]! - 3).toBeGreaterThanOrEqual(125);
    expect(want[1]! - 3).toBeLessThanOrEqual(131);
    expect(await starts(git, c2.commit)).toEqual(want);
    const first = await walk(git, c1.commit);
    const second = await walk(git, c2.commit);
    for (const [path, data] of second.files) if (path.includes("/segments/")) expect(data.length, path).toBeLessThanOrEqual(B);
    const seg0 = `${ROOT}/segments/000000000000.jsonl`;
    expect(second.blobs.get(seg0)).toBe(first.blobs.get(seg0)); // closed, never changed
    const report = await verifyLog(git);
    expect(report.failures).toEqual([]);
    expect(report.verifiedThrough).toBe(269);
  }, 120_000);

  test("Count close: small entries close segments at 1,000 entries, as in layout 1", async () => {
    const { sim, lane } = await room();
    const git = new MemoryGit();
    const p = new LogPublisher(git);
    while (sim.entries.length < 2100) note(sim, lane, 20);
    const r = await p.publish(sim.entries, sim.checkpoint(L2(0)), sim.retained);
    expect(await starts(git, r.commit)).toEqual([0, 1000, 2000]);
    expect((await verifyLog(git)).failures).toEqual([]);
  }, 120_000);

  test("Edge: an entry that brings the segment to exactly B, newlines included, is appended; one a byte longer starts a new segment", async () => {
    for (const extra of [0, 1]) {
      const { sim, lane } = await room();
      for (let i = 0; i < 3; i++) note(sim, lane, 2 * 2 ** 20);
      const before = sim.entries.reduce((n, e) => n + lineOf(e) + 1, 0); // the segment's bytes so far, plus the newline before the next line
      exact(sim, B - before + extra, (pad) => note(sim, lane, pad));
      note(sim, lane, 10);
      const git = new MemoryGit();
      const r = await new LogPublisher(git).publish(sim.entries, sim.checkpoint(L2(0)), sim.retained);
      const { files } = await walk(git, r.commit);
      const seg0 = files.get(`${ROOT}/segments/000000000000.jsonl`)!;
      if (extra === 0) {
        expect(seg0.length).toBe(B);
        expect(await starts(git, r.commit)).toEqual([0, 7]); // entries 0 to 6 fill it exactly; 7 starts the next
      } else expect(await starts(git, r.commit)).toEqual([0, 6]);
      expect(await starts(git, r.commit)).toEqual(ref.segmentStarts(sim.entries.map(lineOf), cp(L2(0))));
      expect((await verifyLog(git)).failures).toEqual([]);
    }
  }, 120_000);

  test("Switch, small open segment: three entries open at the switch continue the segment, which closes at 1,000 entries", async () => {
    const { sim, lane } = await room();
    const git = new MemoryGit();
    const p = new LogPublisher(git);
    while (sim.entries.length < 1003) note(sim, lane, 20);
    const w = await p.publish(sim.entries, sim.checkpoint(), sim.retained); // layout 1 through 1002: segment 1000 holds three entries
    expect(await starts(git, w.commit)).toEqual([0, 1000]);
    while (sim.entries.length < 2010) note(sim, lane, 20);
    const r = await p.publish(sim.entries, sim.checkpoint(L2(1003)), sim.retained);
    expect(await starts(git, r.commit)).toEqual([0, 1000, 2000]);
    expect((await verifyLog(git)).failures).toEqual([]);
  }, 120_000);
});

describe("the layout follows the parent (R-LOG-16)", () => {
  test("the publisher refuses a first commit from other than 0, a first layout 2 commit from other than the parent's through plus one, and layout 1 or another from after layout 2", async () => {
    const { sim, lane } = await room();
    const p = new LogPublisher(new MemoryGit());
    expect(() => p.commitFor(null, sim.entries, sim.checkpoint(L2(1)), sim.retained)).toThrow(/layout-changed/);
    await p.publish(sim.entries, sim.checkpoint(), sim.retained); // layout 1 through 2
    note(sim, lane, 5);
    for (const from of [2, 4]) expect(() => p.commitFor(p.head, sim.entries, sim.checkpoint(L2(from)), sim.retained)).toThrow(/layout-changed/);
    await p.publish(sim.entries, sim.checkpoint(L2(3)), sim.retained);
    note(sim, lane, 5);
    for (const c of [sim.checkpoint(), sim.checkpoint(L2(0)), sim.checkpoint(L2(4))]) {
      const e = (() => {
        try {
          p.commitFor(p.head, sim.entries, c, sim.retained);
        } catch (x) {
          return x as PublishError;
        }
        return null;
      })();
      expect(e?.code).toBe("invalid-input");
      expect(e?.message).toMatch(/layout-changed/);
    }
    expect(() => p.commitFor(p.head, sim.entries, { ...sim.checkpoint(), layout: { version: 3, from: 3 } } as unknown as Checkpoint, sim.retained)).toThrow(PublishError);
  });

  test("open on a layout 2 head reads its shape and continues it: the same commits as a publisher that never stopped", async () => {
    const { sim, lane } = await room();
    const a = new MemoryGit();
    const b = new MemoryGit();
    const steady = new LogPublisher(a);
    let restarted = new LogPublisher(b);
    for (const n of [50, 1200, 1300]) {
      while (sim.entries.length < n) note(sim, lane, 30);
      const c = sim.checkpoint(L2(0));
      const r = await steady.publish(sim.entries, c, sim.retained);
      restarted = await LogPublisher.open(b);
      expect(restarted.commitFor(restarted.head, sim.entries, c, sim.retained)).toBe(r.commit);
      expect((await restarted.publish(sim.entries, c, sim.retained)).commit).toBe(r.commit);
      sim.system({ type: "checkpoint", through: r.through, hash: r.hash, commit: r.commit });
    }
    expect((await verifyLog(b)).failures).toEqual([]);
  }, 120_000);
});

describe("acceptance cases (30.7): verify's layout checks", () => {
  /** A layout 2 log of `n` entries in one commit. */
  async function log2(n: number) {
    const { sim, lane } = await room();
    while (sim.entries.length < n) note(sim, lane, 20);
    const git = new MemoryGit();
    const p = new LogPublisher(git);
    const r = await p.publish(sim.entries, sim.checkpoint(L2(0)), sim.retained);
    return { sim, lane, git, p, r };
  }

  test("Layout regression: a layout 1 commit after a layout 2 commit is layout-changed", async () => {
    const { sim, lane, git, r } = await log2(10);
    note(sim, lane, 5);
    const other = new MemoryGit();
    const c = await new LogPublisher(other).publish(sim.entries, sim.checkpoint(), sim.retained); // layout 1, as another writer would
    await graft(git, other, c.commit, r.commit);
    const report = await verifyLog(git);
    expect(report.failures.map((f) => f.reason)).toContain("layout-changed");
    expect(report.verifiedThrough).toBe(9); // the entries of the last consistent commit
  });

  test("Layout regression: a layout 2 commit with another from is layout-changed; so is a first layout 2 commit whose from is not its parent's through plus one", async () => {
    const { sim, lane, git, r } = await log2(10);
    note(sim, lane, 5);
    const other = new MemoryGit();
    const op = new LogPublisher(other);
    await op.publish(sim.entries.slice(0, 5), makeCp(sim, 4), sim.retained); // layout 1 through 4
    const c = await op.publish(sim.entries, sim.checkpoint(L2(5)), sim.retained); // layout 2 from 5
    await graft(git, other, c.commit, r.commit);
    expect((await verifyLog(git)).failures.map((f) => f.reason)).toContain("layout-changed");

    // A layout 1 parent through 9, then a layout 2 commit from 5 (its parent's through plus one would be 10).
    const g2 = new MemoryGit();
    const first = await new LogPublisher(g2).publish(sim.entries.slice(0, 10), makeCp(sim, 9), sim.retained);
    await graft(g2, other, c.commit, first.commit);
    expect((await verifyLog(g2)).failures.map((f) => f.reason)).toContain("layout-changed");
  });

  test("Misplaced boundary: a layout 2 commit whose segment starts differ from R-LOG-17 is segment-bound", async () => {
    const { git, r } = await log2(1005);
    await rewrite(git, r.commit, (files) => {
      const s0 = `${ROOT}/segments/000000000000.jsonl`;
      const s1 = `${ROOT}/segments/000000001000.jsonl`;
      const a = new TextDecoder().decode(files.get(s0)).split("\n");
      const b = new TextDecoder().decode(files.get(s1)).split("\n");
      files.delete(s1);
      files.set(s0, utf8(a.slice(0, 999).join("\n")));
      files.set(`${ROOT}/segments/000000000999.jsonl`, utf8([a[999]!, ...b].join("\n")));
    });
    const report = await verifyLog(git);
    expect(report.failures.map((f) => f.reason)).toContain("segment-bound");
    expect(report.ok).toBe(false);
  }, 120_000);

  test("a segment that does not follow on from the one before is segment-bound; a misplaced shard directory is fan-out; a segment over B with entries from from on is object-too-large", async () => {
    const { git, r } = await log2(1005);
    const s1 = `${ROOT}/segments/000000001000.jsonl`;
    const gap = new MemoryGit();
    for (const [k, v] of git.objects) gap.objects.set(k, v);
    await rewrite(gap, r.commit, (files) => {
      files.set(`${ROOT}/segments/000000001001.jsonl`, files.get(s1)!);
      files.delete(s1);
    });
    expect((await verifyLog(gap)).failures.map((f) => f.reason)).toContain("segment-bound");
    await expect(LogPublisher.open(gap)).rejects.toMatchObject({ code: "unexpected-writer" }); // segment 1001 is 1,001 entries after 0

    const shard = new MemoryGit();
    for (const [k, v] of git.objects) shard.objects.set(k, v);
    await rewrite(shard, r.commit, (files) => {
      files.set(`${ROOT}/segments/000/000000001000.jsonl`, files.get(s1)!); // only 2 names: never split
      files.delete(s1);
    });
    expect((await verifyLog(shard)).failures.map((f) => f.reason)).toContain("fan-out");
    await expect(LogPublisher.open(shard)).rejects.toMatchObject({ code: "unexpected-writer" });

    const big = new MemoryGit();
    for (const [k, v] of git.objects) big.objects.set(k, v);
    await rewrite(big, r.commit, (files) => files.set(`${ROOT}/inputs/${"0".repeat(64)}.json`, new Uint8Array(B + 1)));
    expect((await verifyLog(big)).failures.map((f) => f.reason)).toContain("object-too-large");
  }, 120_000);
});

/** A layout 1 checkpoint on entry `through`. */
function makeCp(sim: RoomSim, through: number): Checkpoint {
  const keep = sim.entries.slice(through + 1);
  sim.entries.length = through + 1;
  const c = sim.checkpoint();
  sim.entries.push(...keep);
  return c;
}

describe("acceptance cases (30.7): publication outcomes (R-LOG-20)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("Guard: a faulty publisher that plans an object over B stores and pushes nothing, and fails with object-too-large, not retryable", async () => {
    const { sim, lane } = await room();
    for (let i = 0; i < 3; i++) note(sim, lane, 3 * 2 ** 20); // 9 MiB: R-LOG-17 would close a segment
    // The fault: placement by count alone.
    vi.spyOn(Placement.prototype, "place").mockImplementation(function (this: Placement, _seq: number, n: number) {
      const starts = this.count === 0 || this.count === 1000;
      if (starts) this.count = this.bytes = 0;
      this.bytes += (this.count ? 1 : 0) + n;
      this.count++;
      return starts;
    });
    const git = new MemoryGit();
    const p = new LogPublisher(git);
    const objects = git.objects.size;
    expect(() => p.commitFor(null, sim.entries, sim.checkpoint(L2(0)), sim.retained)).toThrow(expect.objectContaining({ code: "object-too-large" }));
    const e = await p.publish(sim.entries, sim.checkpoint(L2(0)), sim.retained).catch((x: unknown) => x as PublishError);
    expect(e).toMatchObject({ code: "object-too-large", retryable: false });
    expect(git.pushes).toBe(0);
    expect(git.objects.size).toBe(objects);
    expect(git.refs.get(LOG_REF)).toBeUndefined();
    // Layout 1 is not guarded: a segment over B is what layout 1 writes.
    expect(p.commitFor(null, sim.entries, sim.checkpoint(), sim.retained)).toMatch(/^[0-9a-f]{40}$/);
  }, 120_000);

  test("Refused push and recovery: a layout 1 commit refused for an object over the limit stays refused (refused, not retryable, not pushed again, the ref at the parent); the next cohort is layout 2 on the confirmed parent, is accepted, and the refused commit cannot apply", async () => {
    // Artifacts' 32 MiB limit is scaled to B here, so the layout 1 segment that passes it is 9 MiB, not 33.
    const { sim, lane } = await room();
    const git = new MemoryGit();
    git.objectLimit = B;
    const p = new LogPublisher(git);
    for (let i = 0; i < 5; i++) note(sim, lane, 2 ** 20);
    const parent = await p.publish(sim.entries, sim.checkpoint(), sim.retained); // layout 1, open segment 5 MiB
    sim.system({ type: "checkpoint", through: parent.through, hash: parent.hash, commit: parent.commit });
    for (let i = 0; i < 4; i++) note(sim, lane, 2 ** 20);
    const refusedCp = sim.checkpoint();
    const refused = p.commitFor(parent.commit, sim.entries, refusedCp, sim.retained);
    const pushes = git.pushes;
    const e = await p.publish(sim.entries, refusedCp, sim.retained).catch((x: unknown) => x as PublishError);
    expect(e).toBeInstanceOf(PublishError);
    expect(e).toMatchObject({ code: "refused", retryable: false, refusal: { code: OBJECT_TOO_LARGE } });
    expect(git.pushes - pushes).toBe(1);
    expect(git.refs.get(LOG_REF)).toBe(parent.commit);
    expect(p.head).toBe(parent.commit);

    // Recovery: layout 2 on the confirmed parent, from one past its through.
    note(sim, lane, 10);
    const d = await p.publish(sim.entries, sim.checkpoint(L2(parent.through + 1)), sim.retained);
    expect(git.refs.get(LOG_REF)).toBe(d.commit);
    expect(parseCommit((await git.readObject(d.commit)).data).parents).toEqual([parent.commit]);
    // A late push of the refused commit leases the parent, which the ref will never hold again.
    expect(await git.push([], LOG_REF, refused, parent.commit)).toMatchObject({ ok: false, reason: "lease-mismatch", current: d.commit });
    const report = await verifyLog(git);
    expect(report.failures).toEqual([]);
    expect(report.verifiedThrough).toBe(sim.entries.length - 1);
  }, 120_000);

  test("Refused, by status: a [remote rejected] status is refused, the ref reads back at the parent, and the commit is not pushed again", async () => {
    const { sim, lane } = await room();
    const git = new MemoryGit();
    const p = new LogPublisher(git);
    const parent = await p.publish(sim.entries, sim.checkpoint(), sim.retained);
    note(sim, lane, 10);
    git.failNext = ["refused"];
    const pushes = git.pushes;
    const e = await p.publish(sim.entries, sim.checkpoint(), sim.retained).catch((x: unknown) => x as PublishError);
    expect(e).toMatchObject({ code: "refused", retryable: false, refusal: { code: "remote-rejected" } });
    expect(git.pushes - pushes).toBe(1);
    expect(git.refs.get(LOG_REF)).toBe(parent.commit);
  });

  test("a refused push that the ref reads back at anyway is confirmed; one that reads back elsewhere is unexpected-writer naming the commit there", async () => {
    const { sim, lane } = await room();
    const git = new MemoryGit();
    const remote = new Scripted(git);
    const p = new LogPublisher(remote);
    const parent = await p.publish(sim.entries, sim.checkpoint(), sim.retained);
    note(sim, lane, 10);
    // An earlier attempt applied: the refusal of the second does not matter, the read-back does.
    remote.script = ["hold", "refuse"];
    const held = p.publish(sim.entries, sim.checkpoint(), sim.retained);
    const e = await held.catch((x: unknown) => x as PublishError);
    expect(e).toMatchObject({ code: "refused" });
    const c = remote.pushed.at(-1)!;
    await remote.land();
    expect(git.refs.get(LOG_REF)).toBe(c);
    // A publisher that knows only the parent finds the ref elsewhere: unexpected-writer, carrying the ref's value.
    note(sim, lane, 10);
    const stale = await LogPublisher.open(remote, {}, parent.commit);
    remote.script = ["refuse"];
    const u = await stale.publish(sim.entries, sim.checkpoint(), sim.retained).catch((x: unknown) => x as PublishError);
    expect(u).toMatchObject({ code: "unexpected-writer", current: c });
  });

  for (const lands of ["C", "D"] as const)
    for (const switching of [false, true])
      test(`Late earlier push${switching ? " during the switch" : ""}: push 1 of C gets no answer, push 2 is refused, D is pushed on P an hour later, then ${lands === "C" ? "push 1 lands first: the Room confirms C and builds on it" : "D lands first: C cannot apply"}; no unexpected writer`, async () => {
        const { sim, lane } = await room();
        const git = new MemoryGit();
        const remote = new Scripted(git);
        const p = new LogPublisher(remote);
        const P = await p.publish(sim.entries, sim.checkpoint(), sim.retained); // layout 1
        sim.system({ type: "checkpoint", through: P.through, hash: P.hash, commit: P.commit });
        note(sim, lane, 10);
        const cpC = sim.checkpoint(); // C is layout 1
        const C = p.commitFor(P.commit, sim.entries, cpC, sim.retained);
        const throughC = sim.entries.length - 1;
        remote.script = ["hold", "refuse"];
        expect(await p.publish(sim.entries, cpC, sim.retained).catch((x: unknown) => (x as PublishError).code)).toBe("refused");
        expect(git.refs.get(LOG_REF)).toBe(P.commit);

        // An hour later: cohort D on P. During the switch, D is layout 2 from P's through plus one.
        note(sim, lane, 10);
        const cpD = switching ? sim.checkpoint(L2(P.through + 1)) : sim.checkpoint();
        let builder: LogPublisher;
        if (lands === "C") {
          remote.script = ["land-then"];
          const e = await p.publish(sim.entries, cpD, sim.retained).catch((x: unknown) => x as PublishError);
          expect(e).toMatchObject({ code: "unexpected-writer", current: C }); // the ref holds C, which the Room wrote
          expect(git.refs.get(LOG_REF)).toBe(C);
          // The Room confirms C, seals its checkpoint event, and builds the next cohort on C.
          sim.system({ type: "checkpoint", through: throughC, hash: sim.entries[throughC]!.hash, commit: C });
          builder = await LogPublisher.open(remote, {}, C);
          const next = await builder.publish(sim.entries, switching ? sim.checkpoint(L2(throughC + 1)) : sim.checkpoint(), sim.retained);
          expect(parseCommit((await git.readObject(next.commit)).data).parents).toEqual([C]);
        } else {
          const d = await p.publish(sim.entries, cpD, sim.retained);
          expect(git.refs.get(LOG_REF)).toBe(d.commit);
          expect(await remote.land()).toMatchObject({ ok: false, reason: "lease-mismatch", current: d.commit }); // C cannot apply
          expect(git.refs.get(LOG_REF)).toBe(d.commit);
        }
        const report = await verifyLog(git);
        expect(report.failures).toEqual([]);
      });

  test("Unclear answer: the connection drops after the pack is sent, and the same commit is pushed again", async () => {
    const { sim, lane } = await room();
    const git = new MemoryGit();
    const remote = new Scripted(git);
    const p = new LogPublisher(remote);
    await p.publish(sim.entries, sim.checkpoint(), sim.retained);
    note(sim, lane, 10);
    remote.script = ["hold"];
    const r = await p.publish(sim.entries, sim.checkpoint(L2(3)), sim.retained);
    expect(r.attempts).toBe(2);
    expect(remote.pushed.slice(-2)).toEqual([r.commit, r.commit]);
  });
});

describe("lengths past 32 bits and sizes that are not lengths (review of 04797d8c)", () => {
  const MiB = 2 ** 20;
  const zeros = new Uint8Array(MiB); // every fake read is a view of this: nothing large is allocated
  const STOP = "stop: the test reads no further";

  /** A room whose entry 3 is a line of `bytes` given in parts; `read` records each read and decides how far reading may go. */
  async function hugeLine(bytes: number, readable: (offset: number) => boolean) {
    const sim = new RoomSim();
    const { lane } = await sim.claim(keys.alice, alice, ["src/**"]);
    note(sim, lane!, 10);
    note(sim, lane!, 10);
    const reads: [number, number][] = [];
    const huge: EntryLine = {
      seq: 3,
      bytes,
      read: (o, l) => {
        reads.push([o, l]);
        if (!readable(o)) throw new Error(STOP);
        return zeros.subarray(0, l);
      },
    };
    const source: EntrySource = { through: 4, read: (from, limit) => sim.entries.slice(from, from + limit).map((e): LogEntry | EntryLine => (e.seq === 3 ? huge : e)) };
    return { sim, source, reads };
  }
  const attempt = (f: () => unknown): Error => {
    try {
      f();
    } catch (e) {
      return e as Error;
    }
    throw new Error("expected a throw");
  };

  test("a line given in parts of 2^32 + 9 bytes keeps its exact length: in layout 2 it is a ChunkedLine and its file is hashed chunk by chunk from byte 0, B bytes to the first chunk", async () => {
    const size = 2 ** 32 + 9;
    expect(layout.segmentStarts([1000, 1000, 1000, size, 1000], cp(L2(0)))).toEqual(ref.segmentStarts([1000, 1000, 1000, size, 1000], cp(L2(0))));
    expect(layout.chunks(size).length).toBe(513);
    const { sim, source, reads } = await hugeLine(size, (o) => o < B); // the first chunk only
    const e = attempt(() => new LogPublisher(new MemoryGit()).commitFor(null, source, sim.checkpoint(L2(0)), sim.retained));
    expect(e.message).toBe(STOP); // it got as far as reading the second chunk: no wrap, no false "changed" refusal
    expect(reads.slice(0, 8)).toEqual(Array.from({ length: 8 }, (_, k) => [k * MiB, MiB]));
    expect(reads.at(-1)).toEqual([B, MiB]);
  });

  test("in layout 1 the same line is hashed into its segment, from byte 0", async () => {
    const { sim, source, reads } = await hugeLine(2 ** 32 + 9, () => false);
    const e = attempt(() => new LogPublisher(new MemoryGit()).commitFor(null, source, sim.checkpoint(), sim.retained));
    expect(e.message).toBe(STOP);
    expect(reads).toEqual([[0, MiB]]);
  });

  test("a segment whose lengths sum past a safe integer is invalid-input before any byte is read", async () => {
    const sim = new RoomSim();
    const { lane } = await sim.claim(keys.alice, alice, ["src/**"]);
    note(sim, lane!, 10);
    note(sim, lane!, 10);
    note(sim, lane!, 10);
    const reads: number[] = [];
    const big = (seq: number): EntryLine => ({ seq, bytes: 2 ** 52, read: (o) => (reads.push(o), zeros.subarray(0, 0)) });
    const source: EntrySource = { through: 5, read: (from, limit) => sim.entries.slice(from, from + limit).map((e): LogEntry | EntryLine => (e.seq === 3 || e.seq === 4 ? big(e.seq) : e)) };
    const e = attempt(() => new LogPublisher(new MemoryGit()).commitFor(null, source, sim.checkpoint(), sim.retained));
    expect(e).toMatchObject({ code: "invalid-input" });
    expect(e.message).toMatch(/safe integer/);
    expect(reads).toEqual([]);
  });

  test("a retained file given in parts must have a length that is a safe integer, and a reader: otherwise invalid-input, never a commit", async () => {
    const sim = new RoomSim();
    const body = canonicalize({ budget: {}, input: {}, kind: "refuse" });
    const digest = `sha256:${sha256Hex(utf8(body))}` as const;
    const read = (o: number, l: number) => utf8(body).slice(o, o + l);
    const p = new LogPublisher(new MemoryGit());
    for (const bad of [{ bytes: NaN, read }, { bytes: -1, read }, { bytes: 1.5, read }, { bytes: Infinity, read }, { bytes: 2 ** 53, read }, { read }, { bytes: 3 }]) {
      const r = { kind: "input", digest, load: () => body, ...bad } as RetainedRef;
      expect(attempt(() => p.commitFor(null, sim.entries, sim.checkpoint(L2(0)), [r])), JSON.stringify(bad)).toMatchObject({ code: "invalid-input" });
    }
    const good: RetainedRef = { kind: "input", digest, load: () => body, bytes: utf8(body).length, read };
    expect(p.commitFor(null, sim.entries, sim.checkpoint(L2(0)), [good])).toBe(p.commitFor(null, sim.entries, sim.checkpoint(L2(0)), [{ kind: "input", body }]));
  });

  test("eachChunk refuses a size that is not a length", () => {
    for (const n of [NaN, -1, 1.5, Infinity]) expect(() => layout.chunks(n)).toThrow(RangeError);
  });
});
