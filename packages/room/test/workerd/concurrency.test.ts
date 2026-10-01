/**
 * Concurrent admission: a gapless sequence (R-LOG-1), atomic admission
 * (R-ADM-6), idempotent replays under concurrency (R-IDEM-2), and fencing
 * on stale generations and leases (R-LANE-4, R-LANE-6).
 */

import { describe, expect, it } from "vitest";
import { runInDurableObject } from "cloudflare:test";
import type { ActRecord, Claim, Landing, LogEntry, Proposal, Refusal } from "@generalbusiness/artroom-contract";
import { policy, requireReview } from "@generalbusiness/artroom-policy/helpers";
import type { Room } from "../../src/index.ts";
import { digestJson } from "../../src/crypto.ts";
import { addMember, call, Client, expectOk, isRefusal, makeRoom, pushChange, tick, type TestRoom } from "./support.ts";

async function entries(room: TestRoom): Promise<LogEntry[]> {
  return [...(await room.admin.read({ q: "log", req: { limit: 500 } })).acts];
}

function gapless(log: LogEntry[]): void {
  let prev: string | null = null;
  log.forEach((e, i) => {
    expect(e.seq).toBe(i);
    expect(e.prev).toBe(prev);
    const { hash, roomSig, ...content } = e;
    void roomSig;
    expect(digestJson(content)).toBe(hash);
    prev = hash;
  });
}

describe("concurrent admission", () => {
  it("R-LOG-1, R-ADM-6: 60 parallel acts from six members get unique, gapless sequence numbers and one hash chain", async () => {
    const room = await makeRoom();
    const members: Client[] = [room.admin];
    for (const h of ["@m1", "@m2", "@m3", "@m4", "@m5"] as const) members.push(await addMember(room, h, "member"));
    const base = (await entries(room)).length;
    const results = await Promise.all(
      Array.from({ length: 60 }, (_, i) => members[i % members.length]!.act<Claim>("claim", null, { goal: `g${i}`, scope: [`src/p${i}/**`] })),
    );
    const accepted = results.filter((r): r is Claim => !isRefusal(r));
    expect(accepted.length).toBe(60);
    const seqs = accepted.map((r) => r.seq).sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: 60 }, (_, i) => base + i));
    const log = await entries(room);
    expect(log.length).toBe(base + 60);
    gapless(log);
  });

  it("R-IDEM-2: twenty concurrent byte-identical submissions create one entry and return the same record", async () => {
    const room = await makeRoom();
    const s = room.admin.signed("claim", null, { goal: "once", scope: ["src/**"] }, "concurrent-key");
    const before = (await entries(room)).length;
    const results = await Promise.all(Array.from({ length: 20 }, () => call<Claim>(room.stub.submit(s))));
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    for (const r of results) expect(r).toEqual(results[0]);
    expect((await entries(room)).length).toBe(before + 1);
  });

  it("R-LANE-4: concurrent proposes on one generation: exactly one is admitted, the rest are recorded generation-moved", async () => {
    const room = await makeRoom();
    const claim = expectOk(await room.admin.act<Claim>("claim", null, { goal: "g", scope: ["src/**"] }));
    const heads = Array.from({ length: 8 }, (_, i) => pushChange(room, claim.lane, { "src/app.ts": `v${i}` }));
    const results = await Promise.all(heads.map((head, i) => room.admin.act<Proposal>("propose", { lane: claim.lane }, { lease: 1, expectedGeneration: 0, head, summary: `p${i}` })));
    const ok = results.filter((r) => !isRefusal(r)) as Proposal[];
    const refused = results.filter(isRefusal) as Refusal[];
    expect(ok.length).toBe(1);
    expect(ok[0]!.generation).toBe(1);
    expect(refused.length).toBe(7);
    for (const r of refused) {
      expect(r.rule).toBe("generation-moved");
      expect(r.current).toEqual({ generation: 1 });
      expect(r.act).toBeDefined();
    }
    gapless(await entries(room));
  });

  it("R-LANE-6: after a take-over, the old holder's concurrent acts are fenced", async () => {
    const room = await makeRoom();
    const bob = await addMember(room, "@bob", "member");
    const claim = expectOk(await room.admin.act<Claim>("claim", null, { goal: "g", scope: ["src/**"] }));
    await room.admin.ok("release", { lane: claim.lane }, { lease: 1 });
    await bob.ok("claim", { lane: claim.lane }, { scope: ["src/**"], expectedGeneration: 0 });
    const results = await Promise.all([
      room.admin.act("renew", { lane: claim.lane }, { lease: 1 }),
      room.admin.act("release", { lane: claim.lane }, { lease: 1 }),
      bob.act("renew", { lane: claim.lane }, { lease: 1 }),
      bob.act("renew", { lane: claim.lane }, { lease: 3 }),
    ]);
    expect((results[0] as Refusal).rule).toBe("not-holder");
    expect((results[1] as Refusal).rule).toBe("not-holder");
    expect((results[2] as Refusal).rule).toBe("lease-fenced");
    expect(isRefusal(results[3])).toBe(false);
  });

  it("R-ADM-6: when the landing engine writes while an admission awaits policy, the admission decides again before it commits", async () => {
    const room = await makeRoom({ policy: policy(requireReview({ paths: "src/**", from: "role:maintainer", id: "code-review" })) });
    const alice = await addMember(room, "@alice", "member");
    const bob = await addMember(room, "@bob", "maintainer");
    const claim = await alice.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
    const head = pushChange(room, claim.lane, { "src/app.ts": "v2" });
    await alice.ok("propose", { lane: claim.lane }, { lease: 1, expectedGeneration: 0, head, summary: "v2" });
    await bob.ok("review", { lane: claim.lane, generation: 1 }, { head, verdict: "approve", scope: ["src/**"], text: "ok" });
    const landing = await alice.ok<Landing>("land", { lane: claim.lane, generation: 1 }, { lease: 1, head });
    await tick(room);
    // Hold the next admission inside its policy evaluation.
    let open!: () => void;
    room.world.policy.gate = new Promise<void>((r) => (open = r));
    const calls = room.world.policy.calls.refuse;
    const pending = bob.act<ActRecord>("note", { act: landing.id }, { text: "while landing" });
    await new Promise((r) => setTimeout(r, 20));
    // The engine reserves and publishes meanwhile, outside the admission queue.
    await runInDurableObject(room.stub as unknown as DurableObjectStub<Room>, (r: Room) => r.core.landing.reconcile());
    room.world.policy.gate = null;
    open();
    const note = expectOk(await pending);
    expect(room.world.policy.calls.refuse).toBeGreaterThanOrEqual(calls + 2);
    const log = await entries(room);
    gapless(log);
    const reserved = log.find((e) => e.entry.type === "system" && e.entry.event.type === "land-reserved")!;
    expect(note.seq).toBeGreaterThan(reserved.seq);
    expect(await room.admin.read({ q: "op", op: landing.op.id })).toMatchObject({ state: "landed" });
  });
});
