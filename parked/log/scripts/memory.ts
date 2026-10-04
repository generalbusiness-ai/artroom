/**
 * Request 5a7290b9: the publisher's memory when the active segment is over
 * 64 MiB, in Node (V8, the engine workerd runs). It compares the publisher
 * of main 417a1618, given the whole log as an array as the Room gave it,
 * with the bounded publisher reading an `EntrySource`, on the same log.
 *
 * The log: genesis and policy, then claims with envelopes near the 64 KiB
 * bound (R-SIG-6) and three `notified` events near the 2 MB SQLite row
 * bound, so that segment 0 is over 64 MiB. Entries are made from their seq
 * on every read, so the source itself holds only their hashes. Each
 * publisher first publishes through entry 949, then the measured
 * publication takes the segment through entry 999: it stages the whole
 * segment blob in 8 MiB parts, as in the Room.
 *
 * The remote is a sink: it hashes staged parts as they arrive and keeps
 * only small objects. Each part is also encoded as the Room's log remote
 * encodes it (the old `b64url`, or `partB64url`).
 *
 * Measured: V8's heap plus array buffers (`process.memoryUsage`), sampled
 * at every source read, stage call and push, minus the same after a full GC
 * before the publication. `peakMiB` includes garbage not yet collected.
 * `livePeakMiB` is sampled after a full GC at every 8th sample: what the
 * publication still held. `--max-old-space-size` shows which publication
 * fits a given heap.
 *
 *   node --expose-gc scripts/memory.ts [bounded|417a1618]   # writes scripts/results/memory-<time>.json
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { sha1 } from "@noble/hashes/legacy.js";
import type { Checkpoint, LogEntry, Sha } from "@generalbusiness/artroom-contract";
import { canonicalize, utf8 } from "../src/canonical.ts";
import { hex } from "../src/crypto.ts";
import { makeCheckpoint, seal } from "../src/entries.ts";
import { gitObject, type GitObject, type GitRemote, type ObjectType, type PushOutcome, type StageOutcome, type StagePart, type StageWant } from "../src/git.ts";
import { LogPublisher, type EntrySource } from "../src/publisher.ts";
import { LogPublisher as Reference } from "../test/support/publisher-417a1618.ts";
import { RoomSim, keys } from "../test/support/room-sim.ts";
import { b64url } from "../../room/src/crypto.ts";
import { partB64url } from "../../room/src/logremote.ts";

const gc = (globalThis as { gc?: () => void }).gc;
if (!gc) throw new Error("run with node --expose-gc");
const MiB = 1024 * 1024;

// ------------------------------------------------------------ the log, made on demand

const sim = new RoomSim();
const fixed = sim.entries.slice(); // genesis, policy-activated
const THROUGH = 999;
const BIG = new Set([300, 600, 900]);
const hashes: string[] = fixed.map((e) => e.hash);

function content(seq: number, prev: string): Parameters<typeof seal>[0] {
  const at = sim.at(seq);
  if (BIG.has(seq)) {
    // A notified event for the claim before it, with a recipient list near the 2 MB row bound.
    const to = Array.from({ length: 31_000 }, (_, i) => `@member${String(i).padStart(6, "0")}${"m".repeat(48)}`);
    return { format: "artroom-log-v1", seq, prev, at, entry: { type: "system", event: { type: "notified", entry: `act_${seq - 1}_${hashes[seq - 1]!.slice(7, 15)}`, decisions: [], to } } } as never;
  }
  const because = Array.from({ length: 31 }, (_, i) => ({ url: `https://example.com/${seq}/${i}/${"r".repeat(2000)}` }));
  const envelope = { v: 1, room: sim.room, actor: keys.alice.key, kind: "claim", target: null, body: { goal: `claim ${seq}`, scope: [`area${seq}/**`], because }, idempotencyKey: `idem-${seq}` };
  return {
    format: "artroom-log-v1",
    seq,
    prev,
    at,
    entry: {
      type: "act",
      act: { envelope, sig: "s".repeat(86) },
      receipt: { outcome: "accepted", authority: { via: "member", member: "@alice", role: "admin", key: keys.alice.key }, decisions: [], effects: [], flags: [] },
    },
  } as never;
}

function entry(seq: number): LogEntry {
  if (seq < fixed.length) return fixed[seq]!;
  return seal(content(seq, hashes[seq - 1]!), keys.room.seed);
}
for (let seq = fixed.length; seq <= THROUGH; seq++) hashes.push(entry(seq).hash);

const source = (through: number): EntrySource => ({ through, read: (from, limit) => Array.from({ length: Math.min(limit, through - from + 1) }, (_, i) => entry(from + i)) });
const checkpoint = (through: number): Checkpoint => makeCheckpoint(sim.room, keys.room.key, keys.room.seed, entry(through), sim.at(through + 1));

// ------------------------------------------------------------ measuring

let base = 0;
let peak = 0;
let livePeak = 0;
let samples = 0;
/** Every sample adds to `peak`; every 8th first runs a full GC and adds to `livePeak`, what was still reachable. */
function sample(): void {
  if (++samples % 8 === 0) {
    gc!();
    const m = process.memoryUsage();
    livePeak = Math.max(livePeak, m.heapUsed + m.arrayBuffers);
  }
  const m = process.memoryUsage();
  peak = Math.max(peak, m.heapUsed + m.arrayBuffers);
}
function start(): void {
  gc!();
  gc!();
  const m = process.memoryUsage();
  base = m.heapUsed + m.arrayBuffers;
  peak = base;
  livePeak = base;
}

/** A remote that hashes staged objects as their parts arrive and keeps only small ones. */
class Sink implements GitRemote {
  readonly small = new Map<string, { type: ObjectType; data: Uint8Array }>();
  readonly have = new Set<string>();
  readonly refs = new Map<string, Sha>();
  private readonly partial = new Map<string, { h: ReturnType<typeof sha1.create>; at: number }>();
  parts = 0;
  private readonly encode: (b: Uint8Array) => string;
  constructor(encode: (b: Uint8Array) => string) {
    this.encode = encode;
  }
  private keep(o: GitObject): void {
    this.have.add(o.sha);
    if (o.data.length <= MiB) this.small.set(o.sha, { type: o.type, data: o.data });
  }
  async readObject(sha: Sha) {
    const o = this.small.get(sha);
    if (!o) throw new Error(`object ${sha} not kept`);
    return o;
  }
  async readRef(ref: string) {
    return this.refs.get(ref) ?? null;
  }
  async stage(_cohort: Sha, want: readonly StageWant[], parts: readonly StagePart[]): Promise<StageOutcome> {
    sample();
    for (const p of parts) {
      this.parts++;
      this.encode(p.data); // as the Room's log remote does before the RPC
      if (this.have.has(p.sha)) continue;
      if (p.offset === 0 && p.data.length === p.size) {
        const o = gitObject(p.type, p.data.slice());
        if (o.sha !== p.sha) throw new Error("bad object");
        this.keep(o);
        continue;
      }
      let s = this.partial.get(p.sha);
      if (!s) this.partial.set(p.sha, (s = { h: sha1.create().update(utf8(`${p.type} ${p.size}\0`)), at: 0 }));
      if (p.offset !== s.at) continue;
      s.h.update(p.data);
      s.at += p.data.length;
      if (s.at === p.size) {
        if (hex(s.h.digest()) !== p.sha) throw new Error("bad staged object");
        this.partial.delete(p.sha);
        this.have.add(p.sha);
      }
    }
    sample();
    return { ok: true, missing: want.filter((w) => !this.have.has(w.sha)).map((w) => ({ sha: w.sha, have: this.partial.get(w.sha)?.at ?? 0 })) };
  }
  async push(objects: readonly GitObject[], ref: string, next: Sha, lease: Sha | null): Promise<PushOutcome> {
    sample();
    if ((this.refs.get(ref) ?? null) !== lease) return { ok: false, reason: "lease-mismatch", current: this.refs.get(ref) ?? null };
    for (const o of objects) {
      this.encode(o.data);
      this.keep({ type: o.type, data: o.data.slice(), sha: o.sha });
    }
    if (!this.have.has(next)) throw new Error("commit not sent");
    this.refs.set(ref, next);
    return { ok: true };
  }
}

async function run(which: "417a1618" | "bounded") {
  const sink = new Sink(which === "bounded" ? partB64url : b64url);
  let result: { commit: string; ms: number; peakMiB: number; livePeakMiB: number; parts: number; stats?: unknown };
  if (which === "bounded") {
    await new LogPublisher(sink).publish(source(949), checkpoint(949), sim.retained);
    // As after a restart: open from the ref, then publish through 999.
    const p = await LogPublisher.open(sink);
    const counted: EntrySource = {
      through: THROUGH,
      read: (from, limit) => {
        sample();
        const r = source(THROUGH).read(from, limit);
        sample();
        return r;
      },
    };
    start();
    const t = Date.now();
    const parts = sink.parts;
    const r = await p.publish(counted, checkpoint(THROUGH), []);
    sample();
    result = { commit: r.commit, ms: Date.now() - t, peakMiB: (peak - base) / MiB, livePeakMiB: (livePeak - base) / MiB, parts: sink.parts - parts, stats: p.stats };
  } else {
    // The Room before: the whole log as an array (entriesAfter(sql, -1, n + 1)), and the publisher it kept.
    const p = new Reference(sink);
    await p.publish(Array.from({ length: 950 }, (_, i) => entry(i)), checkpoint(949), sim.retained);
    start();
    const t = Date.now();
    const parts = sink.parts;
    const entries = Array.from({ length: THROUGH + 1 }, (_, i) => entry(i));
    sample();
    const r = await p.publish(entries, checkpoint(THROUGH), []);
    sample();
    result = { commit: r.commit, ms: Date.now() - t, peakMiB: (peak - base) / MiB, livePeakMiB: (livePeak - base) / MiB, parts: sink.parts - parts };
  }
  return result;
}

const segment = Array.from({ length: THROUGH + 1 }, (_, i) => utf8(canonicalize(entry(i))).length).reduce((n, x) => n + x + 1, -1);
const largest = Math.max(...Array.from({ length: THROUGH + 1 }, (_, i) => utf8(canonicalize(entry(i))).length));
const which = process.argv[2];
const runs = which === "417a1618" || which === "bounded" ? [which] : (["bounded", "417a1618"] as const);
const out: Record<string, unknown> = {
  date: new Date().toISOString(),
  node: process.version,
  segment0Bytes: segment,
  segment0MiB: segment / MiB,
  largestEntryBytes: largest,
  measured: "process.memoryUsage() heapUsed + arrayBuffers during the publication through 999, minus the same after gc() before it, sampled at each source read, stage call and push; peakMiB includes garbage, livePeakMiB is after a full gc() at every 8th sample",
  heapLimit: process.execArgv.find((a) => a.startsWith("--max-old-space-size")) ?? "default",
};
for (const w of runs) out[w] = await run(w);
if (out["bounded"] && out["417a1618"]) out["sameCommit"] = (out["bounded"] as { commit: string }).commit === (out["417a1618"] as { commit: string }).commit;
console.log(JSON.stringify(out, null, 2));
const dir = new URL("./results/", import.meta.url);
mkdirSync(dir, { recursive: true });
writeFileSync(new URL(`memory-${String(out["date"]).replace(/[:.]/g, "-")}.json`, dir), JSON.stringify(out, null, 2) + "\n");
