/**
 * A publication larger than one transfer (lane B follow-up revision 3). Lane
 * L stages its objects in bounded parts through the log remote's `stage`,
 * which forwards to the sandbox's `stageLog`, and then pushes the commit with
 * no objects; the push finds the staged objects. Through the real publisher
 * and log remote, over the fakes.
 */

import { describe, expect, it } from "vitest";
import { evictDurableObject } from "cloudflare:test";
import type { Claim, LogEntry } from "@generalbusiness/artroom-contract";
import type { LogPushRequest, LogStageRequest } from "@generalbusiness/artroom-git";
import { verifyLog } from "@generalbusiness/artroom-log";
import { call, makeRoom, type TestRoom } from "./support.ts";

const entries = async (r: TestRoom): Promise<LogEntry[]> => [...(await r.admin.read({ q: "log", req: { limit: 500 } })).acts];
const published = async (r: TestRoom) => (await r.admin.read({ q: "log" })).publishedThrough;
/** Plain prose, so the secret scan has nothing to find. */
const prose = (n: number) => Array.from({ length: n }, (_, i) => `line ${i} of a long note about the plan.`).join(" ");
/** Decoded length of unpadded base64url. */
const decoded = (s: string) => Math.floor((s.length * 3) / 4);

/** Record what crosses the sandbox's log routes: each staging call's parts, and each push's object count. */
function watch(r: TestRoom) {
  const stub = r.world.artifacts.logStub as { stageLog: (q: LogStageRequest & { canonical: { remote: string } }) => Promise<unknown>; pushLog: (q: never) => Promise<unknown> };
  const stages: { offset: number; bytes: number; sha: string }[][] = [];
  const pushes: number[] = [];
  const stage = stub.stageLog;
  const push = stub.pushLog;
  stub.stageLog = async (q) => {
    stages.push(q.parts.map((p) => ({ offset: p.offset, bytes: decoded(p.data), sha: p.sha })));
    return stage(q);
  };
  stub.pushLog = async (q: never) => {
    pushes.push((q as LogPushRequest).objects.length);
    return push(q);
  };
  return { stages, pushes };
}

/** A room whose log holds `notes` notes of about `size` characters each after its claim. */
async function busyRoom(notes: number, size: number) {
  const r = await makeRoom();
  const c = await r.admin.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
  for (let i = 0; i < notes; i++) await r.admin.ok("note", { act: c.id }, { text: prose(size / 40) });
  // A new instance opens its publisher with the bound the test sets.
  await evictDurableObject(r.stub);
  return { r, c };
}

describe("a publication larger than one transfer", () => {
  it("is staged in bounded parts and pushed with no objects; the whole cohort publishes to a verified log head", async () => {
    const { r } = await busyRoom(12, 2_000);
    const head = (await entries(r)).at(-1)!.seq;
    const bound = 16_000;
    r.world.logTransfer = { objects: 100_000, bytes: bound };
    const seen = watch(r);
    const p = await call<{ through: number; commit: string }>(r.stub.publishLog());
    // One cohort, the whole log: nothing was split or left behind.
    expect(p.through).toBe(head);
    expect(await published(r)).toBe(head);
    expect(r.world.log.ref).toBe(p.commit);
    expect(await verifyLog(r.world.artifacts.canonicalRepo())).toMatchObject({ ok: true, failures: [], verifiedThrough: head, publishedThrough: head });
    // Staged in more than one call, none over the bound; then one push that carried no objects.
    const withParts = seen.stages.filter((s) => s.length > 0);
    expect(withParts.length).toBeGreaterThan(1);
    for (const s of withParts) expect(s.reduce((n, x) => n + x.bytes, 0)).toBeLessThanOrEqual(bound);
    expect(seen.pushes).toEqual([0]);
    expect(r.world.artifacts.canonicalRepo().staged.size).toBe(0);
  });

  it("an object larger than one transfer is staged in chunks of itself, and publishes", async () => {
    const r = await makeRoom();
    const c = await r.admin.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
    await call(r.stub.publishLog());
    const big = await r.admin.ok("note", { act: c.id }, { text: prose(400) });
    const bound = 4_000;
    r.world.logTransfer = { objects: 100_000, bytes: bound };
    await evictDurableObject(r.stub);
    const seen = watch(r);
    const p = await call<{ through: number; commit: string }>(r.stub.publishLog());
    expect(p.through).toBe(big.seq);
    // Some object's later bytes went in a part of their own.
    const parts = seen.stages.flat();
    const chunked = parts.filter((x) => x.offset > 0);
    expect(chunked.length).toBeGreaterThan(0);
    expect(parts.filter((x) => x.sha === chunked[0]!.sha).length).toBeGreaterThan(1);
    expect(seen.pushes).toEqual([0]);
    expect(await verifyLog(r.world.artifacts.canonicalRepo())).toMatchObject({ ok: true, failures: [], verifiedThrough: big.seq });
  });

  it("the sandbox's push with no objects and nothing staged finds nothing, and the ref does not move", async () => {
    const r = await makeRoom();
    await call(r.stub.publishLog());
    const repo = r.world.artifacts.canonicalRepo();
    const before = repo.refs.get("refs/artroom/log")!;
    const orphan = r.world.artifacts.commit(null, { "unsent.txt": "never staged" });
    const outcome = await repo.push([], "refs/artroom/log", orphan, before);
    expect(outcome).toMatchObject({ ok: false, reason: "unknown" });
    expect(repo.refs.get("refs/artroom/log")).toBe(before);
  });
});
