/**
 * Lanes and leases (R-LANE), proposals (R-PROP, R-PATH), workspace
 * credentials (R-WS) and alarm-driven lease expiry (R-LANE-8).
 */

import { describe, expect, it } from "vitest";
import { exports } from "cloudflare:workers";
import { runDurableObjectAlarm } from "cloudflare:test";
import type { Claim, Lane, LogEntry, Proposal, Release, Renewal, RosterRecord, WorkspaceGrant, WorkspaceOp } from "@generalbusiness/artroom-contract";
import { addMember, advance, call, clock, Client, day, expectOk, expectRefusal, forkRemote, iso, makeRoom, newKeyPair, pushChange, tick, tokenLive, type TestRoom } from "./support.ts";

const LEASE = 1800 * 1000;

async function claim(_room: TestRoom, who: Client, scope: string[] = ["src/**"]): Promise<Claim> {
  return who.ok<Claim>("claim", null, { goal: "work", scope });
}

async function entries(room: TestRoom): Promise<LogEntry[]> {
  return [...(await room.admin.read({ q: "log", req: { limit: 500 } })).acts];
}

describe("R-LANE lanes and leases", () => {
  it("R-LANE-1: a claim opens a lane at generation 0 and lease generation 1, held by the signer", async () => {
    const room = await makeRoom();
    const c = await claim(room, room.admin);
    expect(c.lease).toEqual({ holder: "@admin", generation: 1, expiresAt: iso(clock.now + LEASE) });
    const lane = (await room.admin.read({ q: "lane", lane: c.lane })) as Lane;
    expect(lane).toMatchObject({ state: "held", generation: 0, lease: { holder: "@admin", generation: 1 } });
  });

  it("R-PATH-3: overlaps with held lanes are reported, conservatively, with certain for literal paths", async () => {
    const room = await makeRoom();
    const bob = await addMember(room, "@bob", "member");
    const a = await claim(room, room.admin, ["src/**"]);
    const b = await claim(room, bob, ["src/app.ts", "docs/**"]);
    expect(b.overlaps).toEqual([{ lane: a.lane, holder: "@admin", mine: "src/app.ts", theirs: "src/**", certain: true }]);
  });

  it("R-LANE-3: only the holder may propose, release or renew; others are refused not-holder", async () => {
    const room = await makeRoom();
    const bob = await addMember(room, "@bob", "member");
    const c = await claim(room, room.admin);
    expectRefusal(await bob.act("renew", { lane: c.lane }, { lease: 1 }), "not-holder");
    expectRefusal(await bob.act("release", { lane: c.lane }, { lease: 1 }), "not-holder");
    expectRefusal(await bob.act("propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head: "a".repeat(40), summary: "s" }), "not-holder");
    expectRefusal(await bob.act("renew", { lane: "act_99_00000000" }, { lease: 1 }), "lane-unknown");
  });

  it("R-LANE-6: an old lease generation is fenced; R-LANE-7: take-over of a held lane is lane-held", async () => {
    const room = await makeRoom();
    const bob = await addMember(room, "@bob", "member");
    const c = await claim(room, room.admin);
    expectRefusal(await room.admin.act("renew", { lane: c.lane }, { lease: 7 }), "lease-fenced");
    expectRefusal(await bob.act("claim", { lane: c.lane }, { scope: ["src/**"], expectedGeneration: 0 }), "lane-held");
    await room.admin.ok<Release>("release", { lane: c.lane }, { lease: 1, note: "over to you" });
    // R-LANE-7: a claim on an unheld lane that carries a lease is fenced.
    expectRefusal(await bob.act("claim", { lane: c.lane }, { scope: ["src/**"], expectedGeneration: 0, lease: 2 }), "lease-fenced");
    const t = await bob.ok<Claim>("claim", { lane: c.lane }, { scope: ["src/**"], expectedGeneration: 0 });
    expect(t.effect.type).toBe("taken-over");
    // Release (2) then take-over (3): the lease generation increases at each.
    expect(t.lease.generation).toBe(3);
    expectRefusal(await room.admin.act("renew", { lane: c.lane }, { lease: 1 }), "not-holder");
    expectRefusal(await bob.act("renew", { lane: c.lane }, { lease: 1 }), "lease-fenced");
    expectOk(await bob.act<Renewal>("renew", { lane: c.lane }, { lease: 3 }));
  });

  it("R-LANE-8: a release keeps the handover note and leaves the lane unheld", async () => {
    const room = await makeRoom();
    const c = await claim(room, room.admin);
    const rel = await room.admin.ok<Release>("release", { lane: c.lane }, { lease: 1, note: "half done; tests next" });
    const lane = (await room.admin.read({ q: "lane", lane: c.lane })) as Lane;
    expect(lane).toMatchObject({ state: "unheld", why: "released", handover: rel.id, leaseGeneration: 2 });
  });

  it("R-LANE-2: the holder rescopes with lease and expectedGeneration; a stale expectedGeneration is generation-moved", async () => {
    const room = await makeRoom();
    const c = await claim(room, room.admin);
    expectRefusal(await room.admin.act("claim", { lane: c.lane }, { scope: ["src/**", "docs/**"], expectedGeneration: 3, lease: 1 }), "generation-moved");
    const r = await room.admin.ok<Claim>("claim", { lane: c.lane }, { scope: ["src/**", "docs/**"], expectedGeneration: 0, lease: 1 });
    expect(r.effect).toMatchObject({ type: "rescoped", scope: ["src/**", "docs/**"] });
  });

  it("R-ADM-11, R-LANE-5: an accepted holder act renews the lease; a recorded refusal does not", async () => {
    const room = await makeRoom();
    const c = await claim(room, room.admin);
    advance(1000 * 1000);
    expectRefusal(await room.admin.act("renew", { lane: c.lane }, { lease: 9 }), "lease-fenced");
    expect(((await room.admin.read({ q: "lane", lane: c.lane })) as Lane & { lease: { expiresAt: string } }).lease.expiresAt).toBe(c.lease.expiresAt);
    const r = await room.admin.ok<Renewal>("renew", { lane: c.lane }, { lease: 1 });
    expect(r.lease.expiresAt).toBe(iso(clock.now + LEASE));
  });

  it("R-LANE-8 and R-LANE-6: the alarm expires the lease, records lease-expired, and fences the old holder", async () => {
    const room = await makeRoom();
    const bob = await addMember(room, "@bob", "member");
    const c = await claim(room, room.admin);
    advance(LEASE + 1000);
    // The Durable Object's own alarm, scheduled on commit, runs the expiry (R-LANE-8).
    expect(await runDurableObjectAlarm(room.stub)).toBe(true);
    const log = await entries(room);
    const expired = log.find((e) => e.entry.type === "system" && e.entry.event.type === "lease-expired")!;
    expect((expired.entry as unknown as { event: unknown }).event).toEqual({ type: "lease-expired", lane: c.lane, holder: "@admin", leaseGeneration: 1 });
    const lane = (await room.admin.read({ q: "lane", lane: c.lane })) as Lane;
    expect(lane).toMatchObject({ state: "unheld", why: "expired", leaseGeneration: 2 });
    expect("handover" in lane).toBe(false); // R-LANE-8: the room never invents a handover note
    expectRefusal(await room.admin.act("renew", { lane: c.lane }, { lease: 1 }), "not-holder");
    const t = await bob.ok<Claim>("claim", { lane: c.lane }, { scope: ["src/**"], expectedGeneration: 0 });
    expect(t.lease.generation).toBe(3);
  });
});

describe("R-PROP proposals", () => {
  it("R-PROP-1, R-PROP-2: propose pins the head; generation n+1; obligations from actual changed paths (R-PROP-5)", async () => {
    const room = await makeRoom();
    const c = await claim(room, room.admin);
    const head = pushChange(room, c.lane, { "src/app.ts": "export const app = 2;\n" });
    const p = await room.admin.ok<Proposal>("propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "bump" });
    expect(p).toMatchObject({ generation: 1, head, pinnedRef: `refs/artroom/heads/${c.lane}/1`, changed: [{ status: "modified", path: "src/app.ts" }] });
    expect(p.preview).toMatchObject({ id: `op_preview_${p.seq}`, state: "pending" });
    expect(room.world.artifacts.refs.get(`refs/artroom/objects/${head}`)).toBe(head);
    await tick(room);
    expect(room.world.artifacts.refs.get(p.pinnedRef)).toBe(head);
    const read = (await room.admin.read({ q: "proposal", ref: { lane: c.lane, generation: 1 } }))!;
    expect(read.preview.state).toBe("clean");
    expectRefusal(await room.admin.act("propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "again" }), "generation-moved");
  });

  it("R-PROP-1: a head not in the lane's fork is head-unknown, recorded", async () => {
    const room = await makeRoom();
    const c = await claim(room, room.admin);
    const head = room.world.artifacts.commit(room.world.artifacts.main!, { "src/app.ts": "x" });
    const r = expectRefusal(await room.admin.act("propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" }), "head-unknown");
    expect(r.act).toBeDefined();
  });

  it("R-PROP-4: a changed path outside the claim is outside-claim, with the fix to extend the claim", async () => {
    const room = await makeRoom();
    const c = await claim(room, room.admin, ["src/**"]);
    const head = pushChange(room, c.lane, { "docs/readme.md": "x", "src/app.ts": "y" });
    const r = expectRefusal(await room.admin.act("propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" }), "outside-claim");
    expect(r.fix).toBe("Extend the claim.");
  });

  it("R-PROP-6: a diff over the bound is refused, recorded, with diff-too-large", async () => {
    const room = await makeRoom();
    const c = await claim(room, room.admin);
    const head = pushChange(room, c.lane, { "src/a.ts": "1", "src/b.ts": "2" });
    room.world.bounds.maxEntries = 2;
    expect(expectRefusal(await room.admin.act("propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" }), "diff-too-large").act).toBeDefined();
  });

  it("R-POL-1: a proposal whose head has an invalid policy file is policy-invalid", async () => {
    const room = await makeRoom();
    const c = await claim(room, room.admin, [".artroom/**"]);
    const head = pushChange(room, c.lane, { ".artroom/policy.json": '{"format":"artroom-policy-v1","format":"dup"}' });
    expectRefusal(await room.admin.act("propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" }), "policy-invalid");
    const head2 = pushChange(room, c.lane, { ".artroom/policy.json": '{"format":"nope"}' });
    expectRefusal(await room.admin.act("propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head: head2, summary: "s" }), "policy-invalid");
  });

  it("R-ADMIN-1: a change under .artroom/** gets obl_admin-approval; R-OBL-2: a non-admin cannot meet it", async () => {
    const room = await makeRoom();
    const bob = await addMember(room, "@bob", "maintainer");
    const c = await claim(room, bob, [".artroom/**", "src/**"]);
    const head = pushChange(room, c.lane, { ".artroom/checkers/unit.json": JSON.stringify({ format: "artroom-checker-v1", volatile: false, timeoutSeconds: 60 }) });
    const p = await bob.ok<Proposal>("propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "checker" });
    expect(p.obligations.map((o) => o.id)).toEqual(["obl_admin-approval"]);
    const carol = await addMember(room, "@carol", "maintainer");
    expectRefusal(await carol.act("review", { lane: c.lane, generation: 1 }, { head, verdict: "approve", scope: [".artroom/**"], text: "ok" }), "not-authorized-reviewer");
    const ok = await room.admin.ok("review", { lane: c.lane, generation: 1 }, { head, verdict: "approve", scope: [".artroom/**"], text: "ok" });
    expect(ok.kind).toBe("review");
  });
});

describe("R-WS workspace credentials", () => {
  async function workspaceReady(room: TestRoom, holder: Client, lane: string, lease = 1): Promise<WorkspaceOp> {
    const op = expectOk(await holder.request<WorkspaceOp>({ kind: "workspace", lane: lane as never, lease }));
    await tick(room);
    return (await holder.read({ q: "op", op: op.id, until: ["ready", "failed"], timeoutMs: 1000 })) as WorkspaceOp;
  }

  it("section 23, B watches A's workspace (R-WS-1, R-WS-2): B sees state, remote and lease generation, no token; B's token request is not-holder", async () => {
    const room = await makeRoom();
    const a = await addMember(room, "@alice", "member");
    const b = await addMember(room, "@bob", "member");
    const c = await claim(room, a);
    const pending = expectOk(await a.request<WorkspaceOp>({ kind: "workspace", lane: c.lane, lease: 1 }));
    expect(pending.state).toBe("pending");
    const bToken = await b.session();
    const seen = await call<WorkspaceOp>(room.stub.read(bToken, { q: "op", op: pending.id }));
    expect(seen.lane).toBe(c.lane);
    await tick(room);
    const ready = await call<WorkspaceOp>(room.stub.read(bToken, { q: "op", op: pending.id, until: ["ready"], timeoutMs: 1000 }));
    expect(ready).toMatchObject({ state: "ready", detail: { remote: forkRemote(room, c.lane), leaseGeneration: 1 } });
    expect(Object.keys((ready as { detail: object }).detail).sort()).toEqual(["leaseGeneration", "remote"]);
    expect(JSON.stringify(ready)).not.toMatch(/token/i);
    expectRefusal(await b.request({ kind: "workspace-token", lane: c.lane, lease: 1 }), "not-holder");
    const grant = expectOk(await a.request<WorkspaceGrant>({ kind: "workspace-token", lane: c.lane, lease: 1 }));
    expect(grant).toMatchObject({ op: pending.id, lane: c.lane, leaseGeneration: 1, remote: forkRemote(room, c.lane) });
    expect(tokenLive(room, c.lane, grant.token)).toBe(true);
  });

  it("R-WS-2: a token before the workspace is ready is workspace-not-ready", async () => {
    const room = await makeRoom();
    const c = await claim(room, room.admin);
    expectRefusal(await room.admin.request({ kind: "workspace-token", lane: c.lane, lease: 1 }), "workspace-not-ready");
  });

  it("section 23, A requests the token with an old lease generation; after its key is revoked; after it is removed; under an expired delegation (R-WS-2)", async () => {
    const room = await makeRoom();
    // Old lease generation: release, then take over again.
    const a = await addMember(room, "@alice", "member");
    const c = await claim(room, a);
    await workspaceReady(room, a, c.lane);
    await a.ok("release", { lane: c.lane }, { lease: 1 });
    await a.ok("claim", { lane: c.lane }, { scope: ["src/**"], expectedGeneration: 0 });
    await workspaceReady(room, a, c.lane, 3);
    expectRefusal(await a.request({ kind: "workspace-token", lane: c.lane, lease: 1 }), "lease-fenced");
    expectOk(await a.request({ kind: "workspace-token", lane: c.lane, lease: 3 }));
    // Under an expired delegation.
    const k = newKeyPair();
    const grant = await a.ok<RosterRecord>("roster", null, { op: "delegate", to: k.key, kinds: ["propose"], lanes: "*", expiresAt: iso(clock.now + 60_000) });
    const delegated = new Client(room, k, grant.id);
    expectOk(await delegated.request({ kind: "workspace-token", lane: c.lane, lease: 3 }));
    advance(120_000);
    expectRefusal(await delegated.request({ kind: "workspace-token", lane: c.lane, lease: 3 }), "delegation-invalid");
    // After its key is revoked.
    await room.admin.ok("roster", null, { op: "revoke-key", key: a.key, reason: "retired" });
    expectRefusal(await a.request({ kind: "workspace-token", lane: c.lane, lease: 3 }), "key-revoked");
    // After it is removed (a second member, with a fresh lane).
    const b = await addMember(room, "@bob", "member");
    const c2 = await claim(room, b, ["docs/**"]);
    await workspaceReady(room, b, c2.lane);
    await room.admin.ok("roster", null, { op: "remove", member: "@bob" });
    expectRefusal(await b.request({ kind: "workspace-token", lane: c2.lane, lease: 1 }), "not-member");
  });

  it("R-WS-3: each lease generation's token is revoked when the lease ends", async () => {
    const room = await makeRoom();
    const c = await claim(room, room.admin);
    await workspaceReady(room, room.admin, c.lane);
    const g = expectOk(await room.admin.request<WorkspaceGrant>({ kind: "workspace-token", lane: c.lane, lease: 1 }));
    expect(tokenLive(room, c.lane, g.token)).toBe(true);
    expect(Date.parse(g.expiresAt)).toBeLessThanOrEqual(Date.parse(((await room.admin.read({ q: "lane", lane: c.lane })) as { lease: { expiresAt: string } }).lease.expiresAt));
    await room.admin.ok("release", { lane: c.lane }, { lease: 1 });
    await tick(room);
    expect(tokenLive(room, c.lane, g.token)).toBe(false);
  });

  it("section 23, A token appears in no attention item, update, log entry, explain, error or cached response (R-WS-4)", async () => {
    const room = await makeRoom();
    const bob = await addMember(room, "@bob", "member");
    const c = await claim(room, room.admin);
    await workspaceReady(room, room.admin, c.lane);
    const g = expectOk(await room.admin.request<WorkspaceGrant>({ kind: "workspace-token", lane: c.lane, lease: 1 }));
    // Act after the grant so that every surface has something to say.
    await room.admin.ok("note", { act: c.id }, { text: "pushed" });
    const head = pushChange(room, c.lane, { "src/app.ts": "v2" });
    await room.admin.ok("propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" });
    await room.admin.ok("release", { lane: c.lane }, { lease: 1 });
    await tick(room);
    const outputs: unknown[] = [];
    const tokenA = await room.admin.session();
    const tokenB = await bob.session();
    const log = await call<{ acts: LogEntry[] }>(room.stub.read(tokenA, { q: "log", req: { limit: 500 } }));
    outputs.push(log);
    for (const e of log.acts) outputs.push(await call(room.stub.read(tokenA, { q: "explain", act: `act_${e.seq}_${e.hash.slice(7, 15)}` as never })));
    outputs.push(await call(room.stub.read(tokenA, { q: "attention" })), await call(room.stub.read(tokenB, { q: "attention" })));
    outputs.push(await call(room.stub.poll(tokenA, undefined, 0)));
    // The released lease's workspace is gone from the view: the answer is not-found, and carries no token either.
    outputs.push(await room.stub.read(tokenB, { q: "op", op: g.op }));
    outputs.push(await call(room.stub.read(tokenB, { q: "lanes" })));
    outputs.push(await room.stub.request(room.admin.signedRequest({ kind: "workspace-token", lane: c.lane, lease: 1 })));
    outputs.push(await room.stub.read("ses_not-a-real-token", { q: "log" }));
    for (const o of outputs) expect(JSON.stringify(o)).not.toContain(g.token);
    // The HTTPS response that carries a grant is never cacheable.
    const res = await exports.default.fetch(`https://artroom.test/v1/rooms/${room.id}/requests`, {
      method: "POST",
      body: JSON.stringify(room.admin.signedRequest({ kind: "workspace-token", lane: c.lane, lease: 1 })),
    });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const httpLog = await exports.default.fetch(`https://artroom.test/v1/rooms/${room.id}/log?limit=500`, { headers: { Authorization: `Bearer ${tokenB}` } });
    expect(httpLog.headers.get("Cache-Control")).toBe("no-store");
    expect(await httpLog.text()).not.toContain(g.token);
  });
});

void day;
