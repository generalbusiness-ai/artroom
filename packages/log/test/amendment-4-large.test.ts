/**
 * Contract amendment 4 (docs/protocol.md section 30), lane L: the
 * acceptance cases of 30.7 with entries and files of 8 MiB and more, and
 * the 5 million entry log. Sizes are the amendment's own unless a test
 * says it is scaled.
 */

import { describe, expect, test } from "vitest";
import type { CheckerConfig, Decision, LogEntry, MemberId, PolicyDocument, RepoPath, Sha } from "@generalbusiness/artroom-contract";
import { evaluateNotify, policy, rule } from "@generalbusiness/artroom-policy";
import * as ref from "../../contract/examples/log-layout.ts";
import { canonicalize, utf8 } from "../src/canonical.ts";
import { digestBytes, sha256Hex } from "../src/crypto.ts";
import { LOG_REF, ROOT, makeCheckpoint, retain, seal, type Retained } from "../src/entries.ts";
import { MemoryGit } from "../src/git.ts";
import { ARTIFACTS_OBJECT_LIMIT, OBJECT_BOUND as B, twelve } from "../src/layout.ts";
import { LOG_TRANSFER_LIMITS, LogPublisher, READ_LIMITS, readPublishedEntries, type EntryLine, type EntrySource, type RetainedRef } from "../src/publisher.ts";
import { verifyLog } from "../src/verify.ts";
import { LogPublisher as Reference } from "./support/publisher-417a1618.ts";
import { DEMO_CHECKERS, keys } from "./support/room-sim.ts";
import { L2, RoomSim, alice, bareRoom, exact, expectSmallTrees, lineOf, note, partsSource, rewrite, walk } from "./support/layout2.ts";

const MiB = 2 ** 20;
const hexKey = (n: string) => n.slice(0, 64);

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

/** The demo policy, with one more rule whose reason makes the document about `bytes` long. */
function bigPolicy(bytes: number): PolicyDocument {
  return policy(
    rule({ id: "narrow-claims", on: "claim", refuse: '"**" in act.body.scope', fix: "Claim only the paths you will change.", reason: "A claim on ** covers the whole repository." }),
    rule({ id: "holder-sees-claims", kind: "notify", on: ["claim"], to: ["holder"], why: "You claimed this lane." }),
    rule({ id: "padding", on: "note", refuse: "false", fix: "x".repeat(bytes) }),
  );
}

/** A `notified` event for `lane` with `to` as recipients and the context of a real notify evaluation whose act body is `body`. */
async function notified(sim: RoomSim, lane: string, to: readonly MemberId[], body: unknown = {}): Promise<LogEntry> {
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
  return sim.system({ type: "notified", entry: lane as never, decisions, to });
}

/** Expect the log on `git` to verify with no failure through its last entry. */
async function verifies(git: MemoryGit, through: number) {
  const report = await verifyLog(git);
  expect(report.failures).toEqual([]);
  expect(report.verifiedThrough).toBe(through);
  return report;
}

describe("acceptance cases (30.7): large entries and files", () => {
  test("Unpublished old entry over B: the switch commit has from 1; segment 0 holds entry 0 and the ChunkedLine for entry 1; its file is chunks of B and 1 bytes; every blob is at most B; verify reassembles it and checks its hash and signature. Read whole or in parts, the commit is the same, and in parts the publisher's memory stays bounded", async () => {
    const sim = bareRoom();
    const commits: Sha[] = [];
    let parent: Sha | null = null;
    let one: LogEntry | null = null;
    for (const inParts of [false, true]) {
      const git = new MemoryGit();
      git.objectLimit = B; // stricter than Artifacts: every object at most B
      const p = new LogPublisher(git);
      sim.entries.length = 1;
      const w = await p.publish(sim.entries, sim.checkpoint(), []); // layout 1, through entry 0
      parent ??= w.commit;
      expect(w.commit).toBe(parent);
      // Entry 1, sealed before the upgrade and never published: a line of B + 1 bytes.
      if (one) sim.entries.push(one);
      else one = exact(sim, B + 1, (pad) => sim.system({ type: "revert-lane", of: "op_land_0" as never, scope: ["x".repeat(pad) as RepoPath], reason: "abort-after-landing" }));
      p.resetStats();
      const parts = partsSource(sim.entries);
      const r = await p.publish(inParts ? parts.source : sim.entries, sim.checkpoint(L2(1)), []);
      commits.push(r.commit);
      const { files, blobs } = await walk(git, r.commit);
      const seg = new TextDecoder().decode(files.get(`${ROOT}/segments/000000000000.jsonl`)).split("\n");
      const line = utf8(canonicalize(one));
      expect(seg).toEqual([canonicalize(sim.entries[0]), ref.chunkedLine(1, B + 1, digestBytes(line))]);
      const chunks = [...files].filter(([path]) => path.startsWith(`${ROOT}/entries/000000000001.jsonl/`));
      expect(chunks.map(([path, d]) => [path.slice(-12), d.length])).toEqual(ref.chunks(B + 1).map((c) => [c.name, c.bytes]));
      for (const [path, d] of files) expect(d.length, path).toBeLessThanOrEqual(B);
      expect(blobs.size).toBe(files.size);
      await verifies(git, 1);
      expect(await readPublishedEntries(git, r.commit)).toEqual(sim.entries);
      if (inParts) {
        // Bounded memory: the line was never read whole. It was hashed in parts of at most one read,
        // and sent in staged parts of at most one transfer.
        const hashing = parts.reads.slice(0, Math.ceil((B + 1) / READ_LIMITS.bytes));
        expect(Math.max(...hashing)).toBeLessThanOrEqual(READ_LIMITS.bytes);
        expect(Math.max(...parts.reads)).toBeLessThanOrEqual(LOG_TRANSFER_LIMITS.bytes);
        expect(p.stats.peakBatchBytes).toBeLessThanOrEqual(LOG_TRANSFER_LIMITS.bytes);
        expect(p.stats.peakObjectBytes).toBeLessThan(64 * 1024);
        expect(p.stats.peakSendBytes).toBeLessThanOrEqual(LOG_TRANSFER_LIMITS.bytes);
      }
    }
    expect(commits[1]).toBe(commits[0]);
    // A restarted publisher whose open segment holds the chunked entry does not send its chunks again:
    // to a remote that cannot stage, the next publication is one small push.
    const git = new MemoryGit();
    const first = new LogPublisher(git);
    await first.publish(sim.entries, sim.checkpoint(L2(0)), []);
    note(sim, "act_0_00000000", 5);
    const noStage = { readRef: (r: string) => git.readRef(r), readObject: (sha: Sha) => git.readObject(sha), push: git.push.bind(git) };
    const reopened = await LogPublisher.open(noStage);
    await reopened.publish(sim.entries, sim.checkpoint(L2(0)), []);
    expect(reopened.stats.peakSendBytes).toBeLessThan(64 * 1024);
  }, 300_000);

  test("a chunked line whose length changes between hashing and sending is refused as changed, and nothing is pushed", async () => {
    const sim = bareRoom();
    const big = exact(sim, B + 1, (pad) => sim.system({ type: "revert-lane", of: "op_land_0" as never, scope: ["x".repeat(pad) as RepoPath], reason: "abort-after-landing" }));
    const bytes = utf8(canonicalize(big));
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
    const e = (await new LogPublisher(git).publish(source, sim.checkpoint(L2(0)), []).catch((x: unknown) => x)) as Error;
    expect(e).toMatchObject({ code: "invalid-input" });
    expect(e.message).toMatch(/changed while it was read/);
    expect(git.refs.get(LOG_REF)).toBeUndefined();
  }, 300_000);

  test("Bad chunk: a changed chunk of an entry file is chunk-mismatch, and the verified prefix ends before the entry", async () => {
    const sim = bareRoom();
    const git = new MemoryGit();
    const p = new LogPublisher(git);
    await p.publish(sim.entries, sim.checkpoint(), []);
    exact(sim, B + 1, (pad) => sim.system({ type: "revert-lane", of: "op_land_0" as never, scope: ["x".repeat(pad) as RepoPath], reason: "abort-after-landing" }));
    const r = await p.publish(sim.entries, sim.checkpoint(L2(1)), []);
    const dir = `${ROOT}/entries/000000000001.jsonl`;
    const copy = () => {
      const g = new MemoryGit();
      for (const [k, v] of git.objects) g.objects.set(k, v);
      return g;
    };
    // A changed byte inside the first chunk: the same length, another digest.
    const changed = copy();
    await rewrite(changed, r.commit, (files) => {
      const d = files.get(`${dir}/000000000000`)!.slice();
      const at = d.indexOf(0x78, 1000);
      d[at] = 0x79;
      files.set(`${dir}/000000000000`, d);
    });
    const report = await verifyLog(changed);
    expect(report.failures.map((f) => f.reason)).toContain("chunk-mismatch");
    expect(report.failures.find((f) => f.reason === "chunk-mismatch")!.seq).toBe(1);
    expect(report.verifiedThrough).toBe(0);
    // The same bytes cut into chunks of other sizes: R-LOG-18 gives B bytes, then the rest.
    const recut = copy();
    await rewrite(recut, r.commit, (files) => {
      const a = files.get(`${dir}/000000000000`)!;
      const b = files.get(`${dir}/000000000001`)!;
      files.set(`${dir}/000000000000`, a.slice(0, B - 1));
      files.set(`${dir}/000000000001`, new Uint8Array([...a.slice(B - 1), ...b]));
    });
    expect((await verifyLog(recut)).failures.map((f) => f.reason)).toContain("chunk-mismatch");
  }, 300_000);

  test("Old log: a layout 1 log whose full segment is 20 MiB verifies as before, and is the commit the publisher before this amendment made", async () => {
    const sim = new RoomSim();
    const { lane } = await sim.claim(keys.alice, alice, ["src/**"]);
    while (sim.entries.length < 1005) note(sim, lane!, 21_000);
    const git = new MemoryGit();
    const r = await new LogPublisher(git).publish(sim.entries, sim.checkpoint(), sim.retained);
    expect(r.commit).toBe(await new Reference(new MemoryGit()).commitFor(null, sim.entries, sim.checkpoint(), sim.retained));
    const { files } = await walk(git, r.commit);
    expect(files.get(`${ROOT}/segments/000000000000.jsonl`)!.length).toBeGreaterThan(20 * MiB);
    await verifies(git, 1004);
  }, 300_000);

  test("Switch, large open segment: a layout 1 log confirmed through W whose open segment holds 300 entries and 20 MiB; the next commit is layout 2 from W + 1, that segment is unchanged and closed, entry W + 1 starts a new one, and verify passes across the switch", async () => {
    const sim = new RoomSim();
    const { lane } = await sim.claim(keys.alice, alice, ["src/**"]);
    while (sim.entries.length < 303) note(sim, lane!, 70_000);
    const git = new MemoryGit();
    git.objectLimit = ARTIFACTS_OBJECT_LIMIT;
    const p = new LogPublisher(git);
    const w = await p.publish(sim.entries, sim.checkpoint(), sim.retained);
    const seg0 = `${ROOT}/segments/000000000000.jsonl`;
    const before = await walk(git, w.commit);
    expect(before.files.get(seg0)!.length).toBeGreaterThan(20 * MiB);
    sim.system({ type: "checkpoint", through: w.through, hash: w.hash, commit: w.commit });
    for (let i = 0; i < 4; i++) note(sim, lane!, 100);
    p.resetStats();
    const cp2 = sim.checkpoint(L2(w.through + 1));
    const r = await p.publish(sim.entries, cp2, sim.retained);
    // Another publisher, for whom w is not its own parent, places every segment and makes the same commit;
    // the 20 MiB segment holds only entries before from, so the guard lets it through.
    expect(new LogPublisher(new MemoryGit()).commitFor(w.commit, sim.entries, cp2, sim.retained)).toBe(r.commit);
    const after = await walk(git, r.commit);
    expect(after.blobs.get(seg0)).toBe(before.blobs.get(seg0));
    expect([...after.files.keys()].filter((k) => k.includes("/segments/"))).toEqual([seg0, `${ROOT}/segments/${twelve(w.through + 1)}.jsonl`]);
    expect(p.stats.sentSegmentBytes).toBeLessThan(MiB); // the closed 20 MiB segment is reused by ID, not sent
    await verifies(git, sim.entries.length - 1);
  }, 300_000);

  test("At the switch every retained file moves to its layout 2 path: one over B in the layout 1 parent becomes a chunk directory; a restarted publisher loads each kept file once to learn its size and needs every one", async () => {
    const sim = new RoomSim();
    const { lane } = await sim.claim(keys.alice, alice, ["src/**"]);
    const big: Retained = { kind: "input", body: `{"budget":{},"input":{"pad":"${"x".repeat(B)}"},"kind":"refuse"}` };
    sim.retained.push(big);
    const git = new MemoryGit();
    const w = await new LogPublisher(git).publish(sim.entries, sim.checkpoint(), sim.retained); // layout 1: one blob of B + 48 bytes
    const name = `${ROOT}/inputs/${sha256Hex(utf8(big.body))}.json`;
    expect((await walk(git, w.commit)).files.get(name)!.length).toBe(B + 48);
    sim.system({ type: "checkpoint", through: w.through, hash: w.hash, commit: w.commit });
    note(sim, lane!, 10);
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
    note(sim, lane!, 10);
    await restarted.publish(sim.entries, sim.checkpoint(L2(w.through + 1)), refs);
    expect(loads.n).toBe(loadsAtSwitch);
  }, 300_000);

  test("a line or file of exactly B is not chunked; one byte more is", async () => {
    const sim = new RoomSim();
    const { lane } = await sim.claim(keys.alice, alice, ["src/**"]);
    const atB: Retained = { kind: "input", body: `{"budget":{},"input":{"pad":"${"x".repeat(B - 48)}"},"kind":"refuse"}` };
    const overB: Retained = { kind: "input", body: `{"budget":{},"input":{"pad":"${"y".repeat(B - 47)}"},"kind":"refuse"}` };
    expect([utf8(atB.body).length, utf8(overB.body).length]).toEqual([B, B + 1]);
    sim.retained.push(atB, overB);
    const e = exact(sim, B, (pad) => note(sim, lane!, pad));
    note(sim, lane!, 5);
    const git = new MemoryGit();
    git.objectLimit = B;
    const r = await new LogPublisher(git).publish(partsSource(sim.entries).source, sim.checkpoint(L2(0)), refsInParts(sim.retained));
    const { files } = await walk(git, r.commit);
    expect(files.get(`${ROOT}/inputs/${sha256Hex(utf8(atB.body))}.json`)!.length).toBe(B);
    expect([...files.keys()].filter((k) => k.startsWith(`${ROOT}/inputs/${sha256Hex(utf8(overB.body))}.json/`))).toHaveLength(2);
    expect(files.get(`${ROOT}/segments/${twelve(e.seq)}.jsonl`)!.length).toBe(B); // the line alone, whole
    expect([...files.keys()].some((k) => k.includes("/entries/"))).toBe(false);
    await verifies(git, sim.entries.length - 1);
  }, 300_000);

  test("a layout 2 segment over B holding entries from from on is object-too-large", async () => {
    const sim = new RoomSim();
    const { lane } = await sim.claim(keys.alice, alice, ["src/**"]);
    note(sim, lane!, 5 * MiB);
    note(sim, lane!, 5 * MiB);
    const git = new MemoryGit();
    const r = await new LogPublisher(git).publish(sim.entries, sim.checkpoint(L2(0)), sim.retained);
    await rewrite(git, r.commit, (files) => {
      const a = files.get(`${ROOT}/segments/000000000000.jsonl`)!;
      const b = files.get(`${ROOT}/segments/000000000004.jsonl`)!;
      files.delete(`${ROOT}/segments/000000000004.jsonl`);
      files.set(`${ROOT}/segments/000000000000.jsonl`, new Uint8Array([...a, 0x0a, ...b]));
    });
    expect((await verifyLog(git)).failures.map((f) => f.reason)).toContain("object-too-large");
  }, 300_000);

  test("an EntryLine must be the entry it stands for: its end names its seq and hash, and its length never changes", async () => {
    const sim = new RoomSim();
    const { lane } = await sim.claim(keys.alice, alice, ["src/**"]);
    note(sim, lane!, 10);
    note(sim, lane!, 10);
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

  test("Retained prefix and determinism: 5,000 retained files whose digests share their first two hex characters, and a replay context and a policy document of 20 MiB never published. inputs/ splits by the first group and again by the next, no tree lists more than 4,096 entries, each 20 MiB file is three chunks, verify finds and checks each by its digest; two publishers and a restarted one make the same commit, laid out where the reference functions say; a changed chunk of a retained file is chunk-mismatch", async () => {
    const sim = new RoomSim();
    const { lane } = await sim.claim(keys.alice, alice, ["src/**"]);
    // 5,000 replay contexts whose digests all start with "ab".
    const prefixed: Retained[] = [];
    for (let i = 0, s = 0; prefixed.length < 5000; s++) {
      const body = `{"budget":{},"input":{"n":${i},"s":${s}},"kind":"refuse"}`;
      if (sha256Hex(utf8(body)).startsWith("ab")) {
        prefixed.push({ kind: "input", body });
        i++;
        s = -1;
      }
    }
    sim.retained.push(...prefixed);
    await notified(sim, lane!, ["@alice" as MemberId], { pad: "x".repeat(20 * MiB) }); // a 20 MiB replay context
    const big = bigPolicy(20 * MiB);
    sim.activate(big, DEMO_CHECKERS); // a 20 MiB policy document
    await sim.claim(keys.alice, alice, ["docs/**"]); // decided under it
    const sizes = sim.retained.map((r) => utf8(r.body).length);
    expect(sizes.filter((n) => n > 2 * B)).toHaveLength(2);

    const cp = sim.checkpoint(L2(0));
    const git = new MemoryGit();
    git.objectLimit = B;
    const p = new LogPublisher(git);
    const loads = { n: 0 };
    const r = await p.publish(sim.entries, cp, refsInParts(sim.retained, loads));
    expect(loads.n).toBe(0); // read in parts, never loaded whole
    expect(p.stats.peakObjectBytes).toBeLessThan(400_000);
    // Determinism: another publisher, and the same one after a restart.
    expect(new LogPublisher(new MemoryGit()).commitFor(null, sim.entries, cp, sim.retained)).toBe(r.commit);
    const reopened = await LogPublisher.open(git);
    expect(reopened.commitFor(null, sim.entries, cp, refsInParts(sim.retained))).toBe(r.commit);
    expect((await reopened.publish(sim.entries, cp, refsInParts(sim.retained))).commit).toBe(r.commit);

    // Where the reference functions put each file.
    const { files, trees } = await walk(git, r.commit);
    expectSmallTrees(trees);
    const names = (sub: string) => [...new Set(sim.retained.filter((x) => (sub === "inputs") === (x.kind === "input")).map((x) => `${sha256Hex(utf8(x.body))}.json`))];
    for (const sub of ["inputs", "policies"]) {
      const all = names(sub);
      for (const name of all) {
        const dirs = ref.shardsOf(all, name, hexKey, 2);
        const at = [`${ROOT}/${sub}`, ...dirs, name].join("/");
        const size = sizes[sim.retained.findIndex((x) => `${sha256Hex(utf8(x.body))}.json` === name)]!;
        if (size <= B) expect(files.has(at), at).toBe(true);
        else expect([...files.keys()].filter((k) => k.startsWith(`${at}/`)).map((k) => [k.slice(-12), files.get(k)!.length])).toEqual(ref.chunks(size).map((c) => [c.name, c.bytes]));
      }
    }
    const inputDirs = trees.filter((t) => /^artroom-log\/v1\/inputs\/ab\/[0-9a-f]{2}$/.test(t.path));
    expect(inputDirs.length).toBeGreaterThan(200); // inputs/ab/ split again by the next two characters
    expect(trees.find((t) => t.path === `${ROOT}/inputs`)!.names).toContain("ab");

    const report = await verifies(git, sim.entries.length - 1);
    expect(report.decisionsReplayed).toBeGreaterThan(0);

    // A file moved to a sibling shard directory that exists: fan-out, though its bytes and name are right.
    const moved = new MemoryGit();
    for (const [k, v] of git.objects) moved.objects.set(k, v);
    const prefixedPaths = [...files.keys()].filter((k) => /^artroom-log\/v1\/inputs\/ab\/[0-9a-f]{2}\/[0-9a-f]{64}\.json$/.test(k));
    const from = prefixedPaths[0]!;
    const sibling = prefixedPaths.find((k) => k.split("/")[4] !== from.split("/")[4])!.split("/")[4]!;
    await rewrite(moved, r.commit, (f) => {
      f.set(from.replace(/\/ab\/[0-9a-f]{2}\//, `/ab/${sibling}/`), f.get(from)!);
      f.delete(from);
    });
    const misplaced = await verifyLog(moved);
    expect(misplaced.failures.map((x) => x.reason)).toEqual(["fan-out"]);

    // Bad chunk: a changed chunk of the 20 MiB policy document.
    const policyName = `${sha256Hex(utf8(canonicalize(big)))}.json`;
    const chunk = [...files.keys()].find((k) => k.includes(`/policies/`) && k.includes(`${policyName}/`) && k.endsWith("/000000000002"))!;
    await rewrite(git, r.commit, (f) => {
      const d = f.get(chunk)!.slice();
      d[0] = d[0] === 0x78 ? 0x79 : 0x78;
      f.set(chunk, d);
    });
    expect((await verifyLog(git)).failures.map((f) => f.reason)).toContain("chunk-mismatch");
  }, 600_000);

  test("Large notification: a notified event with 200,000 recipients is sealed with every recipient, published as a chunked entry in parts, and verified", async () => {
    const sim = new RoomSim();
    const { lane } = await sim.claim(keys.alice, alice, ["src/**"]);
    // Handles of about 45 characters, so the event's line passes B.
    const to = Array.from({ length: 200_000 }, (_, i) => `@member-${String(i).padStart(6, "0")}.platform-engineering-team` as MemberId);
    const e = await notified(sim, lane!, to);
    expect(lineOf(e)).toBeGreaterThan(B);
    const git = new MemoryGit();
    git.objectLimit = B;
    const p = new LogPublisher(git);
    const { source } = partsSource(sim.entries);
    const r = await p.publish(source, sim.checkpoint(L2(0)), sim.retained);
    expect(p.stats.peakBatchBytes).toBeLessThanOrEqual(LOG_TRANSFER_LIMITS.bytes); // never the whole line
    expect(p.stats.peakObjectBytes).toBeLessThan(400_000);
    const { files } = await walk(git, r.commit);
    expect([...files.keys()].some((k) => k.startsWith(`${ROOT}/entries/${twelve(e.seq)}.jsonl/`))).toBe(true);
    await verifies(git, sim.entries.length - 1);
    const published = await readPublishedEntries(git, r.commit);
    expect((published[e.seq]!.entry as unknown as { event: { to: unknown[] } }).event.to).toHaveLength(200_000);
  }, 300_000);

  test("Large revert: a revert-lane event that lists 100,000 paths is published and verified", async () => {
    const sim = new RoomSim();
    const scope = Array.from({ length: 100_000 }, (_, i) => `packages/platform/src/services/area-${String(i % 500).padStart(3, "0")}/components/module-${String(i).padStart(6, "0")}/implementation.ts` as RepoPath);
    const e = sim.system({ type: "revert-lane", of: "op_land_1" as never, scope, reason: "abort-after-landing" });
    expect(lineOf(e)).toBeGreaterThan(B);
    const git = new MemoryGit();
    git.objectLimit = B;
    await new LogPublisher(git).publish(partsSource(sim.entries).source, sim.checkpoint(L2(0)), sim.retained);
    await verifies(git, sim.entries.length - 1);
  }, 300_000);

  test("Large activation: a policy change with 2,000 checker configurations and a 20 MiB policy document; 500 obligations-recomputed events; each file over B is chunked, and verify replays every decision", async () => {
    const sim = new RoomSim();
    const { lane } = await sim.claim(keys.alice, alice, ["src/**"]);
    const checkers: Record<string, CheckerConfig> = {};
    for (let i = 0; i < 2000; i++) checkers[`checker-${String(i).padStart(4, "0")}`] = { format: "artroom-checker-v1", volatile: false, timeoutSeconds: 60 + i };
    sim.activate(bigPolicy(20 * MiB), checkers);
    for (let i = 0; i < 500; i++) await sim.recomputed(lane!, [`src/file-${i}.ts`]);
    await sim.claim(keys.alice, alice, ["docs/**"]);
    const git = new MemoryGit();
    git.objectLimit = B;
    const r = await new LogPublisher(git).publish(sim.entries, sim.checkpoint(L2(0)), refsInParts(sim.retained));
    const { files, trees } = await walk(git, r.commit);
    expectSmallTrees(trees);
    const chunked = new Set([...files.keys()].filter((k) => /\/policies\/[0-9a-f]{64}\.json\/[0-9]{12}$/.test(k)).map((k) => k.slice(0, -13)));
    expect(chunked.size).toBe(1);
    expect([...files.keys()].filter((k) => /\/policies\/[0-9a-f]{64}\.json$/.test(k)).length).toBeGreaterThanOrEqual(2000);
    const report = await verifies(git, sim.entries.length - 1);
    expect(report.decisionsReplayed).toBeGreaterThan(0);
  }, 600_000);
});

describe("acceptance cases (30.7): 5 million entries", () => {
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
  }, 600_000);
});
