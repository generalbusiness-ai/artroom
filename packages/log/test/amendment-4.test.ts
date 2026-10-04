/**
 * Contract amendment 4 (docs/protocol.md section 30), lane L: layout 2.
 *
 * The shared rules are checked against the contract's reference functions
 * (`packages/contract/examples/log-layout.ts`) at the contract's limits:
 * they are pure functions of numbers and names, so that costs nothing.
 *
 * The acceptance cases of 30.7 publish and verify real logs. Each crosses a
 * limit: the object bound B, 1,000 entries to a segment, 4,096 names to a
 * directory. The rules are the same at any limit, so these cases run at
 * small limits (`at(...)`, `src/layout.ts` `setLayoutLimitsForTests`) and a
 * few entries cross them. The last describe block keeps two cases at the
 * contract's own bound and directory limit, to show that the defaults fit
 * together at their real sizes.
 */

import { afterEach, describe, expect, test, vi } from "vitest";
import type { CheckerConfig, Checkpoint, Decision, LogEntry, MemberId, PolicyDocument, RepoPath, Sha } from "@generalbusiness/artroom-contract";
import { evaluateNotify, policy, rule } from "@generalbusiness/artroom-policy";
import * as ref from "../../contract/examples/log-layout.ts";
import { canonicalize, utf8 } from "../src/canonical.ts";
import { digestBytes, sha256Hex } from "../src/crypto.ts";
import { Malformed, decodeCheckpoint, decodeChunkedLine } from "../src/decode.ts";
import { LOG_REF, ROOT, makeCheckpoint, retain, seal, type Retained } from "../src/entries.ts";
import { MemoryGit, OBJECT_TOO_LARGE, parseCommit } from "../src/git.ts";
import * as layout from "../src/layout.ts";
import { OBJECT_BOUND as B, Placement, twelve } from "../src/layout.ts";
import { LOG_TRANSFER_LIMITS, LogPublisher, PublishError, READ_LIMITS, readPublishedEntries, type EntryLine, type EntrySource, type RetainedRef } from "../src/publisher.ts";
import { verifyLog } from "../src/verify.ts";
import { LogPublisher as Reference } from "./support/publisher-417a1618.ts";
import { L2, RoomSim, Scripted, alice, at, bareRoom, exact, expectSmallTrees, graft, keys, lineOf, note, partsSource, proportional, rewrite, walk } from "./support/layout2.ts";

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
      const sample = names.filter((_, i) => i % 211 === 0 || i === names.length - 1);
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

/** Expect the log on `git` to verify with no failure through entry `through`. */
async function verifies(git: MemoryGit, through: number) {
  const report = await verifyLog(git);
  expect(report.failures).toEqual([]);
  expect(report.verifiedThrough).toBe(through);
  return report;
}

describe("acceptance cases (30.7): segments", () => {
  test(
    "Byte close: a segment closes before the next line would take it past B; every segment is at most B and could not hold the next entry; earlier segments never change; verify passes",
    at({ objectBound: 16_384 }, async () => {
      const { sim, lane } = await room();
      const git = new MemoryGit();
      git.objectLimit = B;
      const p = new LogPublisher(git);
      while (sim.entries.length < 12) note(sim, lane, 1500);
      const c1 = await p.publish(sim.entries, sim.checkpoint(L2(0)), sim.retained);
      while (sim.entries.length < 22) note(sim, lane, 1500);
      const c2 = await p.publish(sim.entries, sim.checkpoint(L2(0)), sim.retained);
      const first = await walk(git, c1.commit);
      const second = await walk(git, c2.commit);
      const at2 = await starts(git, c2.commit);
      expect(at2.length).toBeGreaterThanOrEqual(3);
      // R-LOG-17, said directly: each segment is at most B, and the entry that starts the next one would not have fitted.
      for (const [k, start] of at2.entries()) {
        const bytes = second.files.get(`${ROOT}/segments/${twelve(start)}.jsonl`)!.length;
        expect(bytes, `segment ${start}`).toBeLessThanOrEqual(B);
        const next = at2[k + 1];
        if (next !== undefined) expect(bytes + 1 + lineOf(sim.entries[next]!), `segment ${start} could not take entry ${next}`).toBeGreaterThan(B);
      }
      const seg0 = `${ROOT}/segments/000000000000.jsonl`;
      expect(second.blobs.get(seg0)).toBe(first.blobs.get(seg0)); // closed, never changed
      await verifies(git, 21);
    }),
  );

  test(
    "Count close: small entries close segments at the entry limit, as in layout 1",
    at({ segmentEntries: 10 }, async () => {
      const { sim, lane } = await room();
      const git = new MemoryGit();
      while (sim.entries.length < 21) note(sim, lane, 20);
      const r = await new LogPublisher(git).publish(sim.entries, sim.checkpoint(L2(0)), sim.retained);
      expect(await starts(git, r.commit)).toEqual([0, 10, 20]);
      await verifies(git, 20);
    }),
  );

  for (const extra of [0, 1])
    test(
      `Edge: an entry that brings the segment to ${extra === 0 ? "exactly B, newlines included, is appended" : "one byte over B starts a new segment"}`,
      at({ objectBound: 16_384 }, async () => {
        const { sim, lane } = await room();
        for (let i = 0; i < 3; i++) note(sim, lane, 2000);
        const before = sim.entries.reduce((n, e) => n + lineOf(e) + 1, 0); // the segment's bytes so far, plus the newline before the next line
        exact(sim, B - before + extra, (pad) => note(sim, lane, pad));
        note(sim, lane, 10);
        const git = new MemoryGit();
        const r = await new LogPublisher(git).publish(sim.entries, sim.checkpoint(L2(0)), sim.retained);
        const { files } = await walk(git, r.commit);
        if (extra === 0) expect(files.get(`${ROOT}/segments/000000000000.jsonl`)!.length).toBe(B);
        expect(await starts(git, r.commit)).toEqual(extra === 0 ? [0, 7] : [0, 6]); // entries 0 to 6 fill it exactly; one byte more and 6 starts the next
        await verifies(git, 7);
      }),
    );

  test(
    "Switch, small open segment: three entries open at the switch continue the segment, which closes at the entry limit",
    at({ segmentEntries: 10 }, async () => {
      const { sim, lane } = await room();
      const git = new MemoryGit();
      const p = new LogPublisher(git);
      while (sim.entries.length < 13) note(sim, lane, 20);
      const w = await p.publish(sim.entries, sim.checkpoint(), sim.retained); // layout 1 through 12: segment 10 holds three entries
      expect(await starts(git, w.commit)).toEqual([0, 10]);
      while (sim.entries.length < 25) note(sim, lane, 20);
      const r = await p.publish(sim.entries, sim.checkpoint(L2(13)), sim.retained);
      expect(await starts(git, r.commit)).toEqual([0, 10, 20]);
      await verifies(git, 24);
    }),
  );
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

  test(
    "open on a layout 2 head reads its shape and continues it: the same commits as a publisher that never stopped",
    at({ segmentEntries: 10 }, async () => {
      const { sim, lane } = await room();
      const a = new MemoryGit();
      const b = new MemoryGit();
      const steady = new LogPublisher(a);
      let restarted = new LogPublisher(b);
      // Inside segment 0, then two segments on, then inside the same open segment.
      for (const n of [5, 25, 28]) {
        while (sim.entries.length < n) note(sim, lane, 30);
        const c = sim.checkpoint(L2(0));
        const r = await steady.publish(sim.entries, c, sim.retained);
        restarted = await LogPublisher.open(b);
        expect(restarted.commitFor(restarted.head, sim.entries, c, sim.retained)).toBe(r.commit);
        expect((await restarted.publish(sim.entries, c, sim.retained)).commit).toBe(r.commit);
        sim.system({ type: "checkpoint", through: r.through, hash: r.hash, commit: r.commit });
      }
      expect((await verifyLog(b)).failures).toEqual([]);
    }),
  );
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

  test(
    "Misplaced boundary: a layout 2 commit whose segment starts differ from R-LOG-17 is segment-bound",
    at({ segmentEntries: 10 }, async () => {
      const { git, r } = await log2(15);
      await rewrite(git, r.commit, (files) => {
        const s0 = `${ROOT}/segments/000000000000.jsonl`;
        const s1 = `${ROOT}/segments/000000000010.jsonl`;
        const a = new TextDecoder().decode(files.get(s0)).split("\n");
        const b = new TextDecoder().decode(files.get(s1)).split("\n");
        files.delete(s1);
        files.set(s0, utf8(a.slice(0, 9).join("\n")));
        files.set(`${ROOT}/segments/000000000009.jsonl`, utf8([a[9]!, ...b].join("\n")));
      });
      const report = await verifyLog(git);
      expect(report.failures.map((f) => f.reason)).toContain("segment-bound");
      expect(report.ok).toBe(false);
    }),
  );

  test(
    "a segment that does not follow on from the one before is segment-bound; a misplaced shard directory is fan-out; a retained file left whole over B is object-too-large",
    at({ segmentEntries: 10, objectBound: 65_536 }, async () => {
      const { git, r } = await log2(15);
      const s1 = `${ROOT}/segments/000000000010.jsonl`;
      const copy = () => {
        const g = new MemoryGit();
        for (const [k, v] of git.objects) g.objects.set(k, v);
        return g;
      };
      const gap = copy();
      await rewrite(gap, r.commit, (files) => {
        files.set(`${ROOT}/segments/000000000011.jsonl`, files.get(s1)!);
        files.delete(s1);
      });
      expect((await verifyLog(gap)).failures.map((f) => f.reason)).toContain("segment-bound");
      await expect(LogPublisher.open(gap)).rejects.toMatchObject({ code: "unexpected-writer" }); // segment 11 is 11 entries after 0

      const shard = copy();
      await rewrite(shard, r.commit, (files) => {
        files.set(`${ROOT}/segments/000/000000000010.jsonl`, files.get(s1)!); // only 2 names: never split
        files.delete(s1);
      });
      expect((await verifyLog(shard)).failures.map((f) => f.reason)).toContain("fan-out");
      await expect(LogPublisher.open(shard)).rejects.toMatchObject({ code: "unexpected-writer" });

      const big = copy();
      await rewrite(big, r.commit, (files) => files.set(`${ROOT}/inputs/${"0".repeat(64)}.json`, new Uint8Array(B + 1)));
      expect((await verifyLog(big)).failures.map((f) => f.reason)).toContain("object-too-large");
    }),
  );
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

  test(
    "Guard: a faulty publisher that plans an object over B stores and pushes nothing, and fails with object-too-large, not retryable",
    at({ objectBound: 4096 }, async () => {
      const { sim, lane } = await room();
      for (let i = 0; i < 3; i++) note(sim, lane, 1500); // over B together: R-LOG-17 would close a segment
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
      expect(() => p.commitFor(null, sim.entries, sim.checkpoint(L2(0)), sim.retained)).toThrow(expect.objectContaining({ code: "object-too-large" }));
      const e = await p.publish(sim.entries, sim.checkpoint(L2(0)), sim.retained).catch((x: unknown) => x as PublishError);
      expect(e).toMatchObject({ code: "object-too-large", retryable: false });
      expect(git.pushes).toBe(0);
      expect(git.objects.size).toBe(0);
      expect(git.refs.get(LOG_REF)).toBeUndefined();
      // Layout 1 is not guarded: a segment over B is what layout 1 writes.
      expect(p.commitFor(null, sim.entries, sim.checkpoint(), sim.retained)).toMatch(/^[0-9a-f]{40}$/);
    }),
  );

  test(
    "Refused push and recovery: a layout 1 commit refused for an object over the remote's limit stays refused (refused, not retryable, not pushed again, the ref at the parent); the next cohort is layout 2 on the confirmed parent, is accepted, and the refused commit cannot apply",
    at({ objectBound: 8192 }, async () => {
      // The remote's limit is B here, so the layout 1 segment that passes it is small.
      const { sim, lane } = await room();
      const git = new MemoryGit();
      git.objectLimit = B;
      const p = new LogPublisher(git);
      for (let i = 0; i < 2; i++) note(sim, lane, 1000);
      const parent = await p.publish(sim.entries, sim.checkpoint(), sim.retained); // layout 1, open segment under the limit
      sim.system({ type: "checkpoint", through: parent.through, hash: parent.hash, commit: parent.commit });
      for (let i = 0; i < 3; i++) note(sim, lane, 1000);
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
      await verifies(git, sim.entries.length - 1);
    }),
  );

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

// ------------------------------------------------- entries and files over B

/** Retained files as references read in parts: never loaded whole. `loads` counts whole loads. */
function refsInParts(retained: readonly Retained[], loads: { n: number } = { n: 0 }): RetainedRef[] {
  return retained.map((r) => {
    const bytes = utf8(r.body);
    return {
      kind: r.kind,
      digest: `sha256:${sha256Hex(bytes)}` as const,
      load: () => {
        loads.n++;
        return r.body;
      },
      bytes: bytes.length,
      read: (o: number, l: number) => bytes.slice(o, o + l),
    };
  });
}

/** The demo policy, with one more rule whose text makes the document over `bytes` long. */
function bigPolicy(bytes: number): PolicyDocument {
  return policy(
    rule({ id: "narrow-claims", on: "claim", refuse: '"**" in act.body.scope', fix: "Claim only the paths you will change.", reason: "A claim on ** covers the whole repository." }),
    rule({ id: "holder-sees-claims", kind: "notify", on: ["claim"], to: ["holder"], why: "You claimed this lane." }),
    rule({ id: "padding", on: "note", refuse: "false", fix: "x".repeat(bytes) }),
  );
}

/** A `notified` event for `lane`, with the context of a real notify evaluation whose act body is `body`. */
async function notified(sim: RoomSim, lane: string, body: unknown): Promise<LogEntry> {
  const r = await evaluateNotify(
    sim.policy,
    {
      kind: "notify",
      act: { id: lane as never, kind: "claim", target: null, body: body as never },
      actor: { member: "@alice" as MemberId, role: "admin", teams: [], delegated: false },
      lane: { id: lane as never, claimed: true, holder: "@alice" as MemberId, scope: [], generation: 0, purpose: "ordinary" },
      proposal: null,
    },
    { roles: {}, reviewers: [] },
  );
  for (const e of r.evaluations) sim.retained.push(retain("input", e.context));
  const decisions: Decision[] = r.evaluations.map((e) => e.decision);
  return sim.system({ type: "notified", entry: lane as never, decisions, to: ["@alice" as MemberId] });
}

/** An entry sealed by the room whose line is exactly `bytes` long. */
const sized = (sim: RoomSim, bytes: number) => exact(sim, bytes, (pad) => sim.system({ type: "revert-lane", of: "op_land_0" as never, scope: ["x".repeat(pad) as RepoPath], reason: "abort-after-landing" }));

/** A copy of a repository's objects, to change apart from it. */
function copyOf(git: MemoryGit): MemoryGit {
  const g = new MemoryGit();
  for (const [k, v] of git.objects) g.objects.set(k, v);
  return g;
}

describe("acceptance cases (30.7): entries and files over B", () => {
  test(
    "Unpublished old entry over B: the switch commit has from 1; segment 0 holds entry 0 and the ChunkedLine for entry 1; its file is chunks of B and 1 bytes; every blob is at most B; verify reassembles it and checks its hash and signature. Read whole or in parts, the commit is the same, and in parts the publisher never holds the line",
    at({ objectBound: 4096 }, async () => {
      const sim = bareRoom();
      const commits: Sha[] = [];
      let parent: Sha | null = null;
      let one: LogEntry | null = null;
      for (const inParts of [false, true]) {
        const git = new MemoryGit();
        git.objectLimit = B; // every object at most B
        const opts = proportional();
        const p = new LogPublisher(git, opts);
        sim.entries.length = 1;
        const w = await p.publish(sim.entries, sim.checkpoint(), []); // layout 1, through entry 0
        parent ??= w.commit;
        expect(w.commit).toBe(parent);
        // Entry 1, sealed before the upgrade and never published: a line of B + 1 bytes.
        if (one) sim.entries.push(one);
        else one = sized(sim, B + 1);
        p.resetStats();
        const parts = partsSource(sim.entries, B);
        const r = await p.publish(inParts ? parts.source : sim.entries, sim.checkpoint(L2(1)), []);
        commits.push(r.commit);
        const { files, blobs } = await walk(git, r.commit);
        const seg = new TextDecoder().decode(files.get(`${ROOT}/segments/000000000000.jsonl`)).split("\n");
        expect(seg).toEqual([canonicalize(sim.entries[0]), ref.chunkedLine(1, B + 1, digestBytes(utf8(canonicalize(one))))]);
        const chunks = [...files].filter(([path]) => path.startsWith(`${ROOT}/entries/000000000001.jsonl/`));
        expect(chunks.map(([path, d]) => [path.slice(-12), d.length])).toEqual([["000000000000", B], ["000000000001", 1]]);
        for (const [path, d] of files) expect(d.length, path).toBeLessThanOrEqual(B);
        expect(blobs.size).toBe(files.size);
        await verifies(git, 1);
        expect(await readPublishedEntries(git, r.commit)).toEqual(sim.entries);
        if (inParts) {
          // The line was never read whole: it was hashed in parts of at most one read, and sent in staged parts of at most one transfer.
          const hashing = parts.reads.slice(0, Math.ceil((B + 1) / opts.read.bytes));
          expect(Math.max(...hashing)).toBeLessThanOrEqual(opts.read.bytes);
          expect(Math.max(...parts.reads)).toBeLessThanOrEqual(opts.maxTransfer.bytes);
          expect(p.stats.peakBatchBytes).toBeLessThanOrEqual(opts.maxTransfer.bytes);
          expect(p.stats.peakObjectBytes).toBeLessThan(B / 2); // trees, the checkpoint and the genesis: never the line
          expect(p.stats.peakSendBytes).toBeLessThanOrEqual(opts.maxTransfer.bytes);
        }
      }
      expect(commits[1]).toBe(commits[0]);
      // A restarted publisher whose open segment holds the chunked entry does not send its chunks again:
      // to a remote that cannot stage, the next publication is one push under one transfer.
      const git = new MemoryGit();
      await new LogPublisher(git, proportional()).publish(sim.entries, sim.checkpoint(L2(0)), []);
      note(sim, "act_0_00000000", 5);
      const noStage = { readRef: (r: string) => git.readRef(r), readObject: (sha: Sha) => git.readObject(sha), push: git.push.bind(git) };
      const reopened = await LogPublisher.open(noStage, proportional());
      await reopened.publish(sim.entries, sim.checkpoint(L2(0)), []);
      expect(reopened.stats.peakSendBytes).toBeLessThan(B);
    }),
  );

  test(
    "a chunked line whose length changes between hashing and sending is refused as changed, and nothing is pushed",
    at({ objectBound: 4096 }, async () => {
      const sim = bareRoom();
      const bytes = utf8(canonicalize(sized(sim, B + 1)));
      let calls = 0;
      const source: EntrySource = {
        through: 1,
        read: (from, limit) =>
          sim.entries.slice(from, from + limit).map((e): LogEntry | EntryLine => {
            if (e.seq !== 1) return e;
            const n = calls++ < 3 ? bytes.length : bytes.length + 1; // measured, tail, hashed: then one byte longer
            return { seq: 1, bytes: n, read: (o, l) => bytes.slice(o, o + l) };
          }),
      };
      const git = new MemoryGit();
      const e = (await new LogPublisher(git, proportional()).publish(source, sim.checkpoint(L2(0)), []).catch((x: unknown) => x)) as Error;
      expect(e).toMatchObject({ code: "invalid-input" });
      expect(e.message).toMatch(/changed while it was read/);
      expect(git.refs.get(LOG_REF)).toBeUndefined();
    }),
  );

  test(
    "Bad chunk: a changed chunk of an entry file is chunk-mismatch, and the verified prefix ends before the entry; so are the same bytes cut at another place",
    at({ objectBound: 4096 }, async () => {
      const sim = bareRoom();
      const git = new MemoryGit();
      const p = new LogPublisher(git);
      await p.publish(sim.entries, sim.checkpoint(), []);
      sized(sim, B + 1);
      const r = await p.publish(sim.entries, sim.checkpoint(L2(1)), []);
      const dir = `${ROOT}/entries/000000000001.jsonl`;
      // A changed byte inside the first chunk: the same length, another digest.
      const changed = copyOf(git);
      await rewrite(changed, r.commit, (files) => {
        const d = files.get(`${dir}/000000000000`)!.slice();
        const at = d.indexOf(0x78, 1000);
        d[at] = 0x79;
        files.set(`${dir}/000000000000`, d);
      });
      const report = await verifyLog(changed);
      expect(report.failures.find((f) => f.reason === "chunk-mismatch")?.seq).toBe(1);
      expect(report.verifiedThrough).toBe(0);
      // The same bytes cut into chunks of other sizes: R-LOG-18 gives B bytes, then the rest.
      const recut = copyOf(git);
      await rewrite(recut, r.commit, (files) => {
        const a = files.get(`${dir}/000000000000`)!;
        const b = files.get(`${dir}/000000000001`)!;
        files.set(`${dir}/000000000000`, a.slice(0, B - 1));
        files.set(`${dir}/000000000001`, new Uint8Array([...a.slice(B - 1), ...b]));
      });
      expect((await verifyLog(recut)).failures.map((f) => f.reason)).toContain("chunk-mismatch");
    }),
  );

  test(
    "Old log, then the switch with a large open segment: a layout 1 log whose segments are over B verifies as before, and is the commit the publisher before this amendment made; the next commit is layout 2 from W + 1, both segments are unchanged, the open one is closed, entry W + 1 starts a new one, and verify passes across the switch",
    at({ objectBound: 4096, segmentEntries: 10 }, async () => {
      const { sim, lane } = await room();
      while (sim.entries.length < 15) note(sim, lane, 500);
      const git = new MemoryGit();
      const p = new LogPublisher(git);
      const w = await p.publish(sim.entries, sim.checkpoint(), sim.retained);
      expect(w.commit).toBe(await new Reference(new MemoryGit()).commitFor(null, sim.entries, sim.checkpoint(), sim.retained));
      const seg0 = `${ROOT}/segments/000000000000.jsonl`;
      const seg10 = `${ROOT}/segments/000000000010.jsonl`;
      const before = await walk(git, w.commit);
      for (const seg of [seg0, seg10]) expect(before.files.get(seg)!.length).toBeGreaterThan(B); // a full one and the open one
      await verifies(git, 14);

      sim.system({ type: "checkpoint", through: w.through, hash: w.hash, commit: w.commit });
      for (let i = 0; i < 2; i++) note(sim, lane, 100);
      p.resetStats();
      const cp2 = sim.checkpoint(L2(w.through + 1));
      const r = await p.publish(sim.entries, cp2, sim.retained);
      // Another publisher, for whom w is not its own parent, places every segment and makes the same commit;
      // the segments over B hold only entries before from, so the guard lets them through.
      expect(new LogPublisher(new MemoryGit()).commitFor(w.commit, sim.entries, cp2, sim.retained)).toBe(r.commit);
      const after = await walk(git, r.commit);
      for (const seg of [seg0, seg10]) expect(after.blobs.get(seg)).toBe(before.blobs.get(seg));
      expect([...after.files.keys()].filter((k) => k.includes("/segments/"))).toEqual([seg0, seg10, `${ROOT}/segments/${twelve(w.through + 1)}.jsonl`]);
      expect(p.stats.sentSegmentBytes).toBeLessThan(B); // the segments over B are reused by ID, not sent
      await verifies(git, sim.entries.length - 1);
    }),
  );

  test(
    "At the switch every retained file moves to its layout 2 path: one over B in the layout 1 parent becomes a chunk directory; a restarted publisher needs every kept file, loads each once to learn its size, and not again after the switch",
    at({ objectBound: 4096 }, async () => {
      const { sim, lane } = await room();
      const big: Retained = { kind: "input", body: `{"budget":{},"input":{"pad":"${"x".repeat(B)}"},"kind":"refuse"}` };
      sim.retained.push(big);
      const git = new MemoryGit();
      const w = await new LogPublisher(git).publish(sim.entries, sim.checkpoint(), sim.retained); // layout 1: one blob of B + 48 bytes
      const name = `${ROOT}/inputs/${sha256Hex(utf8(big.body))}.json`;
      expect((await walk(git, w.commit)).files.get(name)!.length).toBe(B + 48);
      sim.system({ type: "checkpoint", through: w.through, hash: w.hash, commit: w.commit });
      note(sim, lane, 10);
      const restarted = await LogPublisher.open(git);
      expect(() => restarted.commitFor(w.commit, sim.entries, sim.checkpoint(L2(w.through + 1)), [])).toThrow(/needs the retained file/);
      const loads = { n: 0 };
      const refs = sim.retained.map((r): RetainedRef => ({ kind: r.kind, digest: `sha256:${sha256Hex(utf8(r.body))}`, load: () => (loads.n++, r.body) }));
      const r = await restarted.publish(sim.entries, sim.checkpoint(L2(w.through + 1)), refs);
      const loadsAtSwitch = loads.n;
      expect(loadsAtSwitch).toBeGreaterThanOrEqual(sim.retained.length);
      const { files } = await walk(git, r.commit);
      expect(files.has(name)).toBe(false);
      expect([...files.keys()].filter((k) => k.startsWith(`${name}/`)).map((k) => files.get(k)!.length)).toEqual([B, 48]);
      await verifies(git, sim.entries.length - 1);
      // After the switch the kept files are reused by ID and not loaded.
      note(sim, lane, 10);
      await restarted.publish(sim.entries, sim.checkpoint(L2(w.through + 1)), refs);
      expect(loads.n).toBe(loadsAtSwitch);
    }),
  );

  test(
    "a line or file of exactly B is not chunked; one byte more is",
    at({ objectBound: 4096 }, async () => {
      const { sim, lane } = await room();
      const atB: Retained = { kind: "input", body: `{"budget":{},"input":{"pad":"${"x".repeat(B - 48)}"},"kind":"refuse"}` };
      const overB: Retained = { kind: "input", body: `{"budget":{},"input":{"pad":"${"y".repeat(B - 47)}"},"kind":"refuse"}` };
      expect([utf8(atB.body).length, utf8(overB.body).length]).toEqual([B, B + 1]);
      sim.retained.push(atB, overB);
      const e = exact(sim, B, (pad) => note(sim, lane, pad));
      note(sim, lane, 5);
      const git = new MemoryGit();
      git.objectLimit = B;
      const r = await new LogPublisher(git, proportional()).publish(partsSource(sim.entries, B / 2).source, sim.checkpoint(L2(0)), refsInParts(sim.retained));
      const { files } = await walk(git, r.commit);
      expect(files.get(`${ROOT}/inputs/${sha256Hex(utf8(atB.body))}.json`)!.length).toBe(B);
      expect([...files.keys()].filter((k) => k.startsWith(`${ROOT}/inputs/${sha256Hex(utf8(overB.body))}.json/`))).toHaveLength(2);
      expect(files.get(`${ROOT}/segments/${twelve(e.seq)}.jsonl`)!.length).toBe(B); // the line alone, whole
      expect([...files.keys()].some((k) => k.includes("/entries/"))).toBe(false);
      await verifies(git, sim.entries.length - 1);
    }),
  );

  test(
    "a layout 2 segment over B holding entries from from on is object-too-large",
    at({ objectBound: 8192 }, async () => {
      const { sim, lane } = await room();
      note(sim, lane, 3000);
      note(sim, lane, 3000);
      const git = new MemoryGit();
      const r = await new LogPublisher(git).publish(sim.entries, sim.checkpoint(L2(0)), sim.retained);
      expect(await starts(git, r.commit)).toEqual([0, 4]);
      await rewrite(git, r.commit, (files) => {
        const a = files.get(`${ROOT}/segments/000000000000.jsonl`)!;
        const b = files.get(`${ROOT}/segments/000000000004.jsonl`)!;
        files.delete(`${ROOT}/segments/000000000004.jsonl`);
        files.set(`${ROOT}/segments/000000000000.jsonl`, new Uint8Array([...a, 0x0a, ...b]));
      });
      expect((await verifyLog(git)).failures.map((f) => f.reason)).toContain("object-too-large");
    }),
  );

  test("an EntryLine must be the entry it stands for: its end names its seq and hash, and its length never changes", async () => {
    const { sim, lane } = await room();
    note(sim, lane, 10);
    note(sim, lane, 10);
    const lines = sim.entries.map((e) => utf8(canonicalize(e)));
    const n = sim.entries.length - 1;
    const as = (seq: number, bytes: Uint8Array): EntryLine => ({ seq, bytes: bytes.length, read: (o, l) => bytes.slice(o, o + l) });
    const source = (give: (seq: number) => LogEntry | EntryLine): EntrySource => ({ through: n, read: (from, limit) => Array.from({ length: Math.min(limit, n - from + 1) }, (_, i) => give(from + i)) });
    const p = new LogPublisher(new MemoryGit());
    // The last entry given as the line of the one before it.
    expect(() => p.commitFor(null, source((s) => (s === n ? as(n, lines[n - 1]!) : sim.entries[s]!)), sim.checkpoint(L2(0)), sim.retained)).toThrow(expect.objectContaining({ code: "invalid-input" }));
    // The last line with its seq changed: its hash is still the checkpoint's, but it is not entry n.
    const renumbered = utf8(new TextDecoder().decode(lines[n]!).replace(new RegExp(`"seq":${n}}$`), `"seq":${n + 7}}`));
    expect(() => p.commitFor(null, source((s) => (s === n ? as(n, renumbered) : sim.entries[s]!)), sim.checkpoint(L2(0)), sim.retained)).toThrow(expect.objectContaining({ code: "invalid-input" }));
    // A line whose length changes between reads.
    let reads = 0;
    const shifting = (s: number): LogEntry | EntryLine => (s === n - 1 ? as(s, reads++ < 1 ? lines[s]! : new Uint8Array([...lines[s]!, 0x20])) : sim.entries[s]!);
    expect(() => p.commitFor(null, source(shifting), sim.checkpoint(L2(0)), sim.retained)).toThrow(expect.objectContaining({ code: "invalid-input" }));
    // Given rightly, the commit is the same as from the entries.
    expect(p.commitFor(null, source((s) => as(s, lines[s]!)), sim.checkpoint(L2(0)), sim.retained)).toBe(p.commitFor(null, sim.entries, sim.checkpoint(L2(0)), sim.retained));
  });

  test(
    "Retained prefix, large activation and determinism: retained files whose digests share their first two hex characters, past the directory limit, and a replay context and a policy document of more than 2 B. inputs/ splits by the first group and again by the next, no tree lists more than the limit, each large file is three chunks, verify finds and checks each by its digest and replays the decisions made under the large policy; two publishers and a restarted one make the same commit; a file in the wrong shard directory is fan-out; a changed chunk of a retained file is chunk-mismatch",
    at({ objectBound: 4096, directoryEntries: 6 }, async () => {
      const { sim, lane } = await room();
      // Seven replay contexts whose digests all start with "ab": more than one directory lists.
      const prefixed: Retained[] = [];
      for (let s = 0; prefixed.length < 7; s++) {
        const body = `{"budget":{},"input":{"n":${prefixed.length},"s":${s}},"kind":"refuse"}`;
        if (sha256Hex(utf8(body)).startsWith("ab")) prefixed.push({ kind: "input", body });
      }
      sim.retained.push(...prefixed);
      await notified(sim, lane, { pad: "x".repeat(2 * B + 100) }); // a replay context over 2 B
      const big = bigPolicy(2 * B + 100);
      const checkers: Record<string, CheckerConfig> = {};
      for (let i = 0; i < 6; i++) checkers[`checker-${i}`] = { format: "artroom-checker-v1", volatile: false, timeoutSeconds: 60 + i };
      sim.activate(big, checkers); // a policy document over 2 B, and more checker configurations than one directory lists
      await sim.claim(keys.alice, alice, ["docs/**"]); // decided under it
      const sizes = new Map(sim.retained.map((r) => [`${sha256Hex(utf8(r.body))}.json`, utf8(r.body).length]));
      expect([...sizes.values()].filter((n) => n > 2 * B)).toHaveLength(2);

      const cp = sim.checkpoint(L2(0));
      const git = new MemoryGit();
      git.objectLimit = B;
      const p = new LogPublisher(git, proportional());
      const loads = { n: 0 };
      const r = await p.publish(sim.entries, cp, refsInParts(sim.retained, loads));
      expect(loads.n).toBe(0); // read in parts, never loaded whole
      expect(p.stats.peakObjectBytes).toBeLessThan(B);
      // Determinism: another publisher, and the same one after a restart.
      expect(new LogPublisher(new MemoryGit()).commitFor(null, sim.entries, cp, sim.retained)).toBe(r.commit);
      const reopened = await LogPublisher.open(git, proportional());
      expect(reopened.commitFor(null, sim.entries, cp, refsInParts(sim.retained))).toBe(r.commit);
      expect((await reopened.publish(sim.entries, cp, refsInParts(sim.retained))).commit).toBe(r.commit);

      // Where R-LOG-19 puts each file, and R-LOG-18 each chunk.
      const { files, trees } = await walk(git, r.commit);
      expectSmallTrees(trees);
      expect(trees.find((t) => t.path === `${ROOT}/policies`)!.names.every((n) => /^[0-9a-f]{2}$/.test(n))).toBe(true); // nine files: split
      const paths = [...files.keys()];
      for (const x of prefixed) {
        const hex = sha256Hex(utf8(x.body));
        expect(paths, hex).toContain(`${ROOT}/inputs/ab/${hex.slice(2, 4)}/${hex}.json`);
      }
      for (const [name, size] of sizes) {
        if (size <= B) continue;
        const chunks = paths.filter((k) => k.includes(`/${name}/`)).sort();
        expect(chunks.map((k) => [k.slice(-12), files.get(k)!.length]), name).toEqual([["000000000000", B], ["000000000001", B], ["000000000002", size - 2 * B]]);
      }
      const report = await verifies(git, sim.entries.length - 1);
      expect(report.decisionsReplayed).toBeGreaterThan(0);

      // A file moved to a sibling shard directory that exists: fan-out, though its bytes and name are right.
      const moved = copyOf(git);
      const prefixedPaths = paths.filter((k) => /^artroom-log\/v1\/inputs\/ab\/[0-9a-f]{2}\/[0-9a-f]{64}\.json$/.test(k));
      const from = prefixedPaths[0]!;
      const sibling = prefixedPaths.find((k) => k.split("/")[4] !== from.split("/")[4])!.split("/")[4]!;
      await rewrite(moved, r.commit, (f) => {
        f.set(from.replace(/\/ab\/[0-9a-f]{2}\//, `/ab/${sibling}/`), f.get(from)!);
        f.delete(from);
      });
      expect((await verifyLog(moved)).failures.map((x) => x.reason)).toEqual(["fan-out"]);

      // Bad chunk: a changed chunk of the large policy document.
      const policyName = `${sha256Hex(utf8(canonicalize(big)))}.json`;
      const chunk = paths.find((k) => k.includes("/policies/") && k.includes(`${policyName}/`) && k.endsWith("/000000000002"))!;
      await rewrite(git, r.commit, (f) => {
        const d = f.get(chunk)!.slice();
        d[0] = d[0] === 0x78 ? 0x79 : 0x78;
        f.set(chunk, d);
      });
      expect((await verifyLog(git)).failures.map((f) => f.reason)).toContain("chunk-mismatch");
    }),
  );
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

  // Review 74f29c21: the boundary controls. The huge line is the last entry, so the checkpoint names it and
  // the publisher reads its seq and hash from its canonical tail, which the fake serves from a real sealed entry.
  for (const size of [2 ** 32 - 1, 2 ** 32, 2 ** 32 + 1])
    for (const l2 of [true, false])
      test(`boundary control: an EntryLine of ${size} bytes as the last entry reaches the hashing of its body through the real commitFor (layout ${l2 ? 2 : 1})`, () => {
        const sim = bareRoom();
        const last = sim.system({ type: "lease-expired", lane: "act_1_00000000" as never, holder: "@alice" as never, leaseGeneration: 1 });
        const lineBytes = utf8(canonicalize(last));
        const tail = new Uint8Array(512); // the last 512 bytes of the huge line: zeros, then the canonical end of a real entry
        tail.set(lineBytes.slice(-512), 512 - Math.min(512, lineBytes.length));
        const reads: [number, number][] = [];
        const huge: EntryLine = {
          seq: 1,
          bytes: size,
          read: (o, l) => {
            reads.push([o, l]);
            if (o >= size - tail.length) return tail.subarray(o - (size - tail.length), o - (size - tail.length) + l);
            if (reads.length > 2) throw new Error(STOP); // the second read of the body: hashing has begun
            return zeros.subarray(0, l);
          },
        };
        const source: EntrySource = { through: 1, read: (from, limit) => [sim.entries[0]!, huge].slice(from, from + limit) };
        const e = attempt(() => new LogPublisher(new MemoryGit()).commitFor(null, source, sim.checkpoint(l2 ? L2(0) : undefined), []));
        expect(e.message).toBe(STOP);
        expect(reads[0]).toEqual([size - 512, 512]); // the tail, for seq and hash
        expect(reads.slice(1)).toEqual([[0, MiB], [MiB, MiB]]); // then the body, from byte 0, as one line of `size` bytes
      });

  test("boundary control: a line that is 2^32 bytes when measured and 2^32 + 1 when hashed is still refused as changed", async () => {
    const sim = new RoomSim();
    const { lane } = await sim.claim(keys.alice, alice, ["src/**"]);
    note(sim, lane!, 10);
    note(sim, lane!, 10);
    let calls = 0;
    const line = (): EntryLine => ({ seq: 3, bytes: calls++ === 0 ? 2 ** 32 : 2 ** 32 + 1, read: (_o, l) => zeros.subarray(0, l) });
    const source: EntrySource = { through: 4, read: (from, limit) => sim.entries.slice(from, from + limit).map((e): LogEntry | EntryLine => (e.seq === 3 ? line() : e)) };
    const e = attempt(() => new LogPublisher(new MemoryGit()).commitFor(null, source, sim.checkpoint(L2(0)), sim.retained));
    expect(e).toMatchObject({ code: "invalid-input" });
    expect(e.message).toMatch(/was 4294967296 bytes and is now 4294967297/);
  });

  test("eachChunk refuses a size that is not a length", () => {
    for (const n of [NaN, -1, 1.5, Infinity]) expect(() => layout.chunks(n)).toThrow(RangeError);
  });
});

// ------------------------------------------------ at the contract's own limits

describe("acceptance cases (30.7) at the contract's own limits", () => {
  test("Unpublished old entry over B, at B = 8 MiB and the default limits: its file is chunks of B and 1 bytes, every blob is at most B, the line is hashed in reads of at most 1 MiB and sent in staged parts of at most one transfer, and verify reassembles it", async () => {
    expect(B).toBe(8 * 2 ** 20);
    const sim = bareRoom();
    const git = new MemoryGit();
    git.objectLimit = B; // stricter than Artifacts: every object at most B
    const p = new LogPublisher(git);
    await p.publish(sim.entries, sim.checkpoint(), []); // layout 1, through entry 0
    const one = sized(sim, B + 1);
    p.resetStats();
    const parts = partsSource(sim.entries);
    const r = await p.publish(parts.source, sim.checkpoint(L2(1)), []);
    const { files } = await walk(git, r.commit);
    const seg = new TextDecoder().decode(files.get(`${ROOT}/segments/000000000000.jsonl`)).split("\n");
    expect(seg[1]).toBe(ref.chunkedLine(1, B + 1, digestBytes(utf8(canonicalize(one)))));
    const chunks = [...files].filter(([path]) => path.startsWith(`${ROOT}/entries/000000000001.jsonl/`));
    expect(chunks.map(([path, d]) => [path.slice(-12), d.length])).toEqual(ref.chunks(B + 1).map((c) => [c.name, c.bytes]));
    for (const [path, d] of files) expect(d.length, path).toBeLessThanOrEqual(B);
    const hashing = parts.reads.slice(0, Math.ceil((B + 1) / READ_LIMITS.bytes));
    expect(Math.max(...hashing)).toBeLessThanOrEqual(READ_LIMITS.bytes);
    expect(Math.max(...parts.reads)).toBeLessThanOrEqual(LOG_TRANSFER_LIMITS.bytes);
    expect(p.stats.peakBatchBytes).toBeLessThanOrEqual(LOG_TRANSFER_LIMITS.bytes);
    expect(p.stats.peakObjectBytes).toBeLessThan(64 * 1024);
    expect(p.stats.peakSendBytes).toBeLessThanOrEqual(LOG_TRANSFER_LIMITS.bytes);
    await verifies(git, 1);
  });

  test(
    "Many segments, at the directory limit of 4,096 names: a log of 5,000 segments (of 10 entries here, not 1,000); segments/ splits by digit groups where the contract's reference function says; every tree is within the limit and under 397,312 bytes; a restarted publisher reads the fanned-out index and continues it",
    at({ segmentEntries: 10 }, async () => {
      // The entries between the genesis and the last are one-byte lines given in parts, which the publisher
      // places, hashes and sends without parsing. So verify, which checks every entry's signature, is not run
      // here; its fan-out walk is covered by the retained prefix case.
      expect(layout.DIRECTORY_ENTRIES).toBe(4096);
      const N = 50_000;
      const sim = bareRoom();
      const last = seal({ format: "artroom-log-v1", seq: N - 1, prev: sim.entries[0]!.hash, at: sim.at(N - 1), entry: { type: "system", event: { type: "lease-expired", lane: "act_1_00000000" as never, holder: "@alice" as MemberId, leaseGeneration: 1 } } }, keys.room.seed);
      const x = new Uint8Array([0x78]);
      const tiny = (seq: number): EntryLine => ({ seq, bytes: 1, read: (o, l) => x.subarray(o, o + l) });
      const source: EntrySource = {
        through: N - 1,
        read: (from, limit) => {
          const out: (LogEntry | EntryLine)[] = [];
          for (let s = from; s < Math.min(from + limit, N); s++) out.push(s === 0 ? sim.entries[0]! : s === N - 1 ? last : tiny(s));
          return out;
        },
      };
      const cp = makeCheckpoint(sim.room, keys.room.key, keys.room.seed, last, sim.at(N), L2(0));
      const git = new MemoryGit();
      const r = await new LogPublisher(git).publish(source, cp, []);
      const { trees } = await walk(git, r.commit);
      expectSmallTrees(trees);
      const segs = trees.filter((t) => t.path.startsWith(`${ROOT}/segments`));
      expect(segs.find((t) => t.path === `${ROOT}/segments`)!.names).toEqual(["000"]);
      expect(segs.find((t) => t.path === `${ROOT}/segments/000`)!.names).toEqual(["000"]);
      expect(segs.find((t) => t.path === `${ROOT}/segments/000/000`)!.names).toHaveLength(50);
      const names = Array.from({ length: N / 10 }, (_, k) => `${twelve(k * 10)}.jsonl`);
      for (const k of [0, 99, 100, 4096, 4999]) {
        const dirs = ref.shardsOf(names, names[k]!, (n) => n.slice(0, 12), 3);
        expect(dirs).toHaveLength(3);
        expect(segs.find((t) => t.path === [`${ROOT}/segments`, ...dirs].join("/"))!.names).toContain(names[k]);
      }
      const reopened = await LogPublisher.open(git);
      expect(reopened.publishedThrough).toBe(N - 1);
      expect(git.refs.get(LOG_REF)).toBe(r.commit);
      // A child of the head reads only the open segment and reuses every shard directory by ID:
      // only the root, artroom-log/ and v1/ trees are encoded again.
      reopened.resetStats();
      reopened.commitFor(reopened.head, source, cp, []);
      expect(reopened.stats.treesBuilt).toBe(3);
    }),
  );
});
