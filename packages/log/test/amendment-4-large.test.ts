/**
 * Contract amendment 4 (docs/protocol.md section 30), lane L: the two
 * acceptance cases of 30.7 kept at the contract's own limits. Every other
 * case runs at small limits in `amendment-4.test.ts`, where the rules are
 * the same. These two show that the defaults fit together at their real
 * sizes: a line just over B = 8 MiB under the default read and transfer
 * limits, and the directory limit of 4,096 names with 5 million entries.
 * Node only: nothing here depends on the runtime.
 */

import { describe, expect, test } from "vitest";
import type { LogEntry, MemberId, RepoPath } from "@generalbusiness/artroom-contract";
import * as ref from "../../contract/examples/log-layout.ts";
import { canonicalize, utf8 } from "../src/canonical.ts";
import { digestBytes } from "../src/crypto.ts";
import { LOG_REF, ROOT, makeCheckpoint, seal } from "../src/entries.ts";
import { MemoryGit } from "../src/git.ts";
import { OBJECT_BOUND as B, twelve } from "../src/layout.ts";
import { LOG_TRANSFER_LIMITS, LogPublisher, READ_LIMITS, type EntryLine, type EntrySource } from "../src/publisher.ts";
import { verifyLog } from "../src/verify.ts";
import { keys } from "./support/room-sim.ts";
import { L2, bareRoom, exact, expectSmallTrees, partsSource, walk } from "./support/layout2.ts";

describe("acceptance cases (30.7) at the contract's limits", () => {
  test("Unpublished old entry over B, at B = 8 MiB and the default limits: its file is chunks of B and 1 bytes, every blob is at most B, the line is hashed in reads of at most 1 MiB and sent in staged parts of at most one transfer, and verify reassembles it", async () => {
    expect(B).toBe(8 * 2 ** 20);
    const sim = bareRoom();
    const git = new MemoryGit();
    git.objectLimit = B; // stricter than Artifacts: every object at most B
    const p = new LogPublisher(git);
    await p.publish(sim.entries, sim.checkpoint(), []); // layout 1, through entry 0
    const one = exact(sim, B + 1, (pad) => sim.system({ type: "revert-lane", of: "op_land_0" as never, scope: ["x".repeat(pad) as RepoPath], reason: "abort-after-landing" }));
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
    const report = await verifyLog(git);
    expect(report.failures).toEqual([]);
    expect(report.verifiedThrough).toBe(1);
  });

  test("Many segments: a log of 5,000,000 small entries; segments/ splits by digit groups; every tree is under 397,312 bytes; a restarted publisher reads the fanned-out index and continues it", async () => {
    // Scaled in content, not in count: the entries between the genesis and the last are one-byte lines
    // given in parts, which the publisher places, hashes and sends without parsing. So verify, which
    // checks every entry's signature, is not run here; its fan-out walk is covered by the retained prefix case.
    const N = 5_000_000;
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
    const p = new LogPublisher(git);
    const r = await p.publish(source, cp, []);
    const { trees } = await walk(git, r.commit);
    expectSmallTrees(trees);
    const segs = trees.filter((t) => t.path.startsWith(`${ROOT}/segments`));
    expect(segs.find((t) => t.path === `${ROOT}/segments`)!.names).toEqual(["000"]);
    expect(segs.find((t) => t.path === `${ROOT}/segments/000`)!.names).toEqual(["000", "001", "002", "003", "004"]);
    const names = Array.from({ length: N / 1000 }, (_, k) => `${twelve(k * 1000)}.jsonl`);
    for (const k of [0, 999, 1000, 4096, 4999]) {
      const dirs = ref.shardsOf(names, names[k]!, (n) => n.slice(0, 12), 3);
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
  });
});
