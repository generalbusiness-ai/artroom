/**
 * The roster and authority: R-GEN, R-ADM-3 cases (a) to (d), R-ADM-4,
 * R-ADM-5, R-ADM-12 custody by admission path, and R-CRED-3, R-CRED-4 and
 * R-CRED-9 onboarding. Section 23 cases are named in the test titles.
 */

import { describe, expect, it } from "vitest";
import { env, exports } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import type { Claim, Joined, LogEntry, Note, Redeemed, RosterRecord } from "@generalbusiness/artroom-contract";
import type { Room } from "../../src/index.ts";
import {
  addMember,
  b64url,
  call,
  clock,
  Client,
  advance,
  day,
  digestBytes,
  expectOk,
  expectRefusal,
  iso,
  makeRoom,
  newKeyPair,
  randomBytes,
  type TestRoom,
} from "./support.ts";

async function entries(room: TestRoom): Promise<LogEntry[]> {
  return [...(await room.admin.read({ q: "log", req: { limit: 500 } })).acts];
}

async function invite(room: TestRoom, member: `@${string}`, custody: "client" | "room", extra: Record<string, unknown> = {}) {
  const secret = randomBytes(32);
  const rec = await room.admin.ok<RosterRecord>("roster", null, {
    op: "invite",
    member,
    ...(extra["noRole"] ? {} : { role: (extra["role"] as string) ?? "member" }),
    custody,
    expiresAt: iso(clock.now + day),
    secretHash: digestBytes(secret),
    ...(extra["session"] ? { session: extra["session"] } : {}),
  });
  return { id: rec.id, secret: b64url(secret) };
}

async function heldKeyCount(room: TestRoom): Promise<number> {
  return runInDurableObject(room.stub as unknown as DurableObjectStub<Room>, (r: Room) => Number(r.core.sql.all("SELECT COUNT(*) AS n FROM held_keys")[0]!["n"]));
}

async function invitationUsed(room: TestRoom, id: string): Promise<boolean> {
  return runInDurableObject(room.stub as unknown as DurableObjectStub<Room>, (r: Room) => r.core.sql.all("SELECT used FROM invitations WHERE id = ?", id)[0]!["used"] !== null);
}

describe("R-GEN roster", () => {
  it("R-GEN-4: a non-admin may not invite (admin-required); R-GEN-5: a checker may not claim (role-forbids)", async () => {
    const room = await makeRoom();
    const bob = await addMember(room, "@bob", "member");
    expectRefusal(await bob.act("roster", null, { op: "invite", member: "@carol", role: "member", custody: "client", expiresAt: iso(clock.now + day), secretHash: digestBytes(randomBytes(32)) }), "admin-required");
    const checker = await addMember(room, "@ci", "checker");
    expectRefusal(await checker.act("claim", null, { goal: "g", scope: ["src/**"] }), "role-forbids");
    expectRefusal(await room.admin.act("roster", null, { op: "rotate-recovery", key: newKeyPair().key }), "recovery-only");
  });

  it("R-GEN-6: an invitation expires within 7 days; for a new member it must set a role", async () => {
    const room = await makeRoom();
    const base = { op: "invite", member: "@x", custody: "client", secretHash: digestBytes(randomBytes(32)) };
    expectRefusal(await room.admin.act("roster", null, { ...base, role: "member", expiresAt: iso(clock.now + 8 * day) }), "invalid-body");
    expectRefusal(await room.admin.act("roster", null, { ...base, expiresAt: iso(clock.now + day) }), "invalid-body");
  });

  it("R-GEN-6: an expired invitation is refused invitation-invalid, and nothing is recorded", async () => {
    const room = await makeRoom();
    const inv = await invite(room, "@late", "client");
    advance(2 * day);
    const before = (await entries(room)).length;
    const r = await new Client(room, newKeyPair()).act("roster", null, { op: "join", invitation: inv.id, secret: inv.secret });
    expectRefusal(r, "invitation-invalid");
    expect((await entries(room)).length).toBe(before);
  });

  it("R-GEN-6: a wrong secret is refused and the invitation stays unused", async () => {
    const room = await makeRoom();
    const inv = await invite(room, "@x", "client");
    expectRefusal(await new Client(room, newKeyPair()).act("roster", null, { op: "join", invitation: inv.id, secret: b64url(randomBytes(32)) }), "invitation-invalid");
    expect(await invitationUsed(room, inv.id)).toBe(false);
  });

  it("R-GEN-8: removing, demoting or revoking the last active admin is refused last-admin", async () => {
    const room = await makeRoom();
    expectRefusal(await room.admin.act("roster", null, { op: "set-role", member: "@admin", role: "member" }), "last-admin");
    expectRefusal(await room.admin.act("roster", null, { op: "remove", member: "@admin" }), "last-admin");
    expectRefusal(await room.admin.act("roster", null, { op: "revoke-key", key: room.admin.key, reason: "retired" }), "last-admin");
  });

  it("R-ID-5: a removed handle is never reused", async () => {
    const room = await makeRoom();
    await addMember(room, "@bob", "member");
    await room.admin.ok("roster", null, { op: "remove", member: "@bob" });
    expectRefusal(await room.admin.act("roster", null, { op: "invite", member: "@bob", custody: "client", expiresAt: iso(clock.now + day), secretHash: digestBytes(randomBytes(32)) }), "invalid-body");
  });

  it("R-GEN-7: teams are principals; members() shows them", async () => {
    const room = await makeRoom();
    await addMember(room, "@bob", "member");
    await room.admin.ok("roster", null, { op: "team", team: "@security", members: ["@bob"] });
    const roster = await room.admin.read({ q: "members" });
    expect(roster.teams["@security"]).toEqual(["@bob"]);
    expect(roster.members.find((m) => m.handle === "@bob")!.teams).toEqual(["@security"]);
    expect(roster.soleAdmin).toBe(true);
  });
});

describe("R-ADM-3 authority cases", () => {
  it("(a) direct member: the receipt records via member", async () => {
    const room = await makeRoom();
    const c = expectOk(await room.admin.act<Claim>("claim", null, { goal: "g", scope: ["src/**"] }));
    expect(c.by).toEqual({ via: "member", member: "@admin", role: "admin", key: room.admin.key });
  });

  it("section 23, Unjoined Worker: a delegated key that never joined acts for the grantor; after the grantor's key is revoked, delegation-invalid (R-ADM-3b, R-CRED-4)", async () => {
    const room = await makeRoom();
    const checker = await addMember(room, "@ci", "checker");
    const worker = newKeyPair();
    const grant = await checker.ok<RosterRecord>("roster", null, { op: "delegate", to: worker.key, kinds: ["check", "note"], lanes: "*", expiresAt: iso(clock.now + day) });
    const w = new Client(room, worker, grant.id);
    const note = await w.ok<Note>("note", { act: grant.id }, { text: "checker online" });
    expect(note.by).toEqual({ via: "delegation", member: "@ci", role: "checker", key: worker.key, delegation: grant.id, grantor: checker.key });
    await room.admin.ok("roster", null, { op: "revoke-key", key: checker.key, reason: "retired" });
    expectRefusal(await w.act("note", { act: grant.id }, { text: "again" }), "delegation-invalid");
  });

  it("R-ADM-5: a delegation grants only kinds the grantor's role may sign; a delegated key cannot re-delegate", async () => {
    const room = await makeRoom();
    const member = await addMember(room, "@bob", "member");
    expectRefusal(await member.act("roster", null, { op: "delegate", to: newKeyPair().key, kinds: ["check"], lanes: "*", expiresAt: iso(clock.now + day) }), "delegation-invalid");
    const k = newKeyPair();
    const grant = await member.ok<RosterRecord>("roster", null, { op: "delegate", to: k.key, kinds: ["note"], lanes: "*", expiresAt: iso(clock.now + day) });
    const d = new Client(room, k, grant.id);
    expectRefusal(await d.act("roster", null, { op: "delegate", to: newKeyPair().key, kinds: ["note"], lanes: "*", expiresAt: iso(clock.now + day) }), "delegation-invalid");
    expectRefusal(await d.act("claim", null, { goal: "g", scope: ["src/**"] }), "delegation-invalid");
  });

  it("R-ADM-5: a grantor's later loss of a kind stops the delegation covering it", async () => {
    const room = await makeRoom();
    const bob = await addMember(room, "@bob", "member");
    const k = newKeyPair();
    const grant = await bob.ok<RosterRecord>("roster", null, { op: "delegate", to: k.key, kinds: ["claim"], lanes: "*", expiresAt: iso(clock.now + day) });
    await room.admin.ok("roster", null, { op: "set-role", member: "@bob", role: "checker" });
    expectRefusal(await new Client(room, k, grant.id).act("claim", null, { goal: "g", scope: ["src/**"] }), "delegation-invalid");
  });

  it("section 23, Act under an expired delegation (R-ADM-4): refused delegation-invalid, not recorded", async () => {
    const room = await makeRoom();
    const k = newKeyPair();
    const grant = await room.admin.ok<RosterRecord>("roster", null, { op: "delegate", to: k.key, kinds: ["note"], lanes: "*", expiresAt: iso(clock.now + 60_000) });
    advance(120_000);
    const before = (await entries(room)).length;
    const r = expectRefusal(await new Client(room, k, grant.id).act("note", { act: grant.id }, { text: "late" }), "delegation-invalid");
    expect(r.act).toBeUndefined();
    expect((await entries(room)).length).toBe(before);
  });

  it("section 23, Pre-signed act after its key's revocation (R-ADM-4): refused key-revoked, not recorded", async () => {
    const room = await makeRoom();
    const bob = await addMember(room, "@bob", "member");
    const presigned = bob.signed("claim", null, { goal: "g", scope: ["src/**"] });
    await room.admin.ok("roster", null, { op: "revoke-key", key: bob.key, reason: "retired" });
    const before = (await entries(room)).length;
    expectRefusal(await call(room.stub.submit(presigned)), "key-revoked");
    expect((await entries(room)).length).toBe(before);
  });

  it("section 23, Byte-identical replay after revocation (R-IDEM-2): the original record, no new entry", async () => {
    const room = await makeRoom();
    const bob = await addMember(room, "@bob", "member");
    const s = bob.signed("claim", null, { goal: "g", scope: ["src/**"] });
    const first = await call<Claim>(room.stub.submit(s));
    await room.admin.ok("roster", null, { op: "revoke-key", key: bob.key, reason: "compromised" });
    const before = (await entries(room)).length;
    expect(await call<Claim>(room.stub.submit(s))).toEqual(first);
    expect((await entries(room)).length).toBe(before);
  });

  it("section 23, Recovery key (R-ADM-3d, R-GEN-3): set-role while no admin can act; a claim by it is role-forbids", async () => {
    const room = await makeRoom();
    await addMember(room, "@bob", "member");
    // Lock the only admin out: the recovery key may revoke the last admin's last key (R-GEN-8).
    const lock = await room.recovery.ok<RosterRecord>("roster", null, { op: "revoke-key", key: room.admin.key, reason: "compromised" });
    expect(lock.flags).toContain("recovery-key");
    const r = await room.recovery.ok<RosterRecord>("roster", null, { op: "set-role", member: "@bob", role: "admin" });
    expect(r.by).toEqual({ via: "recovery", member: null, role: null, key: room.recovery.key });
    expect(r.flags).toContain("recovery-key");
    expectRefusal(await room.recovery.act("claim", null, { goal: "g", scope: ["src/**"] }), "role-forbids");
    expectRefusal(await room.recovery.act("roster", null, { op: "delegate", to: newKeyPair().key, kinds: "*", lanes: "*", expiresAt: iso(clock.now + day) }), "role-forbids");
  });

  it("section 23, Locked-out admin restored (R-GEN-3, R-ADMIN-4): the recovery key adds a new key to the admin", async () => {
    const room = await makeRoom();
    await room.recovery.ok("roster", null, { op: "revoke-key", key: room.admin.key, reason: "compromised" });
    expectRefusal(await room.admin.act("claim", null, { goal: "g", scope: ["src/**"] }), "key-revoked");
    const secret = randomBytes(32);
    const inv = await room.recovery.ok<RosterRecord>("roster", null, { op: "invite", member: "@admin", custody: "client", expiresAt: iso(clock.now + day), secretHash: digestBytes(secret) });
    const fresh = new Client(room, newKeyPair());
    const joined = await fresh.ok<RosterRecord>("roster", null, { op: "join", invitation: inv.id, secret: b64url(secret) });
    expect(joined.by).toMatchObject({ via: "join", member: "@admin", role: "admin" });
    expectOk(await fresh.act("claim", null, { goal: "back", scope: ["src/**"] }));
  });

  it("R-GEN-3: only the recovery key can rotate the recovery key", async () => {
    const room = await makeRoom();
    const next = newKeyPair();
    await room.recovery.ok("roster", null, { op: "rotate-recovery", key: next.key });
    expectRefusal(await room.recovery.act("roster", null, { op: "set-role", member: "@admin", role: "admin" }), "not-member");
    expectOk(await new Client(room, next).act("roster", null, { op: "set-role", member: "@admin", role: "admin" }));
  });
});

describe("R-ADM-12 and R-CRED-9: onboarding and custody by admission path", () => {
  it("section 23, Browser join: Joined; the key is bound at redemption; a second join is invitation-invalid; a bound key is key-in-use", async () => {
    const room = await makeRoom();
    const inv = await invite(room, "@browser", "client");
    const key = newKeyPair();
    const join = new Client(room, key).signed("roster", null, { op: "join", invitation: inv.id, secret: inv.secret });
    const joined = await call<Joined>(room.stub.redeem({ custody: "client", join }, "1.2.3.4"));
    expect(joined.custody).toBe("client");
    expect(joined.member).toBe("@browser");
    expect(joined.key).toBe(key.key);
    expect(joined.record.by).toMatchObject({ via: "join", custody: "client", invitation: inv.id });
    expect(joined.session.member).toBe("@browser");
    const again = new Client(room, newKeyPair()).signed("roster", null, { op: "join", invitation: inv.id, secret: inv.secret });
    expectRefusal(await call(room.stub.redeem({ custody: "client", join: again }, "1.2.3.4")), "invitation-invalid");
    const inv2 = await invite(room, "@other", "client");
    expectRefusal(await new Client(room, key).act("roster", null, { op: "join", invitation: inv2.id, secret: inv2.secret }), "key-in-use");
    const roster = await room.admin.read({ q: "members" });
    expect(roster.members.find((m) => m.handle === "@browser")!.keys[0]).toMatchObject({ id: key.key, custody: "client" });
  });

  it("section 23, MCP redemption (R-CRED-3, R-CRED-9, R-ADM-12, R-SEC-5): a bearer shown once; the log holds the join and the delegate, never the token; acts are bounded by the session", async () => {
    const room = await makeRoom();
    const inv = await invite(room, "@agent", "room", { role: "agent", session: { kinds: ["claim", "note"], lanes: "*", ttlSeconds: 3600 } });
    const before = await heldKeyCount(room);
    const r = await call<Redeemed>(room.stub.redeem({ custody: "room", invitation: inv.id, secret: inv.secret }, "5.6.7.8"));
    expect(r.custody).toBe("room");
    expect(r.member).toBe("@agent");
    expect(r.bearer).toMatch(/^arb_/);
    expect(r.mcp).toBe(`https://artroom.test/v1/rooms/${room.id}/mcp`);
    expect(await heldKeyCount(room)).toBe(before + 2);
    const log = await entries(room);
    const text = JSON.stringify(log);
    expect(text).not.toContain(r.bearer);
    const join = log.find((e) => e.entry.type === "act" && (e.entry.act.envelope.body as { op?: string }).op === "join" && e.entry.act.envelope.actor === r.key)!;
    expect((join.entry as unknown as { receipt: { authority: unknown } }).receipt.authority).toMatchObject({ via: "join", custody: "room", member: "@agent" });
    expect(log.some((e) => e.entry.type === "act" && (e.entry.act.envelope.body as { op?: string }).op === "delegate" && e.entry.act.envelope.actor === r.key)).toBe(true);
    const roster = await room.admin.read({ q: "members" });
    expect(roster.members.find((m) => m.handle === "@agent")!.keys[0]).toMatchObject({ id: r.key, custody: "room" });
    // The bearer acts through the room under the session delegation (R-CRED-3 step 4).
    const claim = await call<Claim>(room.stub.bearerAct(r.bearer, { kind: "claim", target: null, body: { goal: "agent work", scope: ["src/agent/**"] }, idempotencyKey: "agent-1" }));
    expect(claim.by).toMatchObject({ via: "delegation", member: "@agent", delegation: r.delegation });
    expectRefusal(
      await call(room.stub.bearerAct(r.bearer, { kind: "release", target: { lane: claim.lane }, body: { lease: 1 }, idempotencyKey: "agent-2" })),
      "delegation-invalid",
    );
    // The bearer also reads (R-API-3).
    expect((await call<{ acts: unknown[] }>(room.stub.read(r.bearer, { q: "log" }))).acts.length).toBeGreaterThan(0);
    advance(2 * 3600 * 1000);
    const late = (await room.stub.bearerAct(r.bearer, { kind: "note", target: { act: claim.id }, body: { text: "late" }, idempotencyKey: "agent-3" })) as { error?: { code: string } };
    expect(late.error?.code).toBe("unauthenticated");
  });

  it("section 23, Room-custody invitation, self-signed join on POST /acts (R-ADM-12): custody-mismatch, nothing recorded, invitation unused", async () => {
    const room = await makeRoom();
    const inv = await invite(room, "@agent", "room", { role: "agent" });
    const before = (await entries(room)).length;
    const join = new Client(room, newKeyPair()).signed("roster", null, { op: "join", invitation: inv.id, secret: inv.secret });
    const res = await exports.default.fetch(`https://artroom.test/v1/rooms/${room.id}/acts`, { method: "POST", body: JSON.stringify(join), headers: { "Content-Type": "application/json" } });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { rule: string }).rule).toBe("custody-mismatch");
    expect((await entries(room)).length).toBe(before);
    expect(await invitationUsed(room, inv.id)).toBe(false);
  });

  it("section 23, Room-custody invitation, self-signed join over RPC (R-ADM-12): custody-mismatch, nothing recorded, invitation unused", async () => {
    const room = await makeRoom();
    const inv = await invite(room, "@agent", "room", { role: "agent" });
    const before = (await entries(room)).length;
    const join = new Client(room, newKeyPair()).signed("roster", null, { op: "join", invitation: inv.id, secret: inv.secret });
    // Through the Worker's RPC entrypoint (`ArtroomService.room().submit`), as a service binding would call it.
    using wire = await (exports.default as unknown as { room(id: string): Promise<{ submit(a: unknown): Promise<{ rule?: string }> } & Disposable> }).room(room.id);
    expect((await wire.submit(join)).rule).toBe("custody-mismatch");
    // And on the Durable Object directly.
    expectRefusal(await call(room.stub.submit(join)), "custody-mismatch");
    expect((await entries(room)).length).toBe(before);
    expect(await invitationUsed(room, inv.id)).toBe(false);
    // The invitation still works on its own path.
    expect((await call<Redeemed>(room.stub.redeem({ custody: "room", invitation: inv.id, secret: inv.secret }, "x"))).custody).toBe("room");
  });

  it("section 23, Room-custody invitation, client redemption (R-ADM-12, R-CRED-9): custody-mismatch, nothing recorded", async () => {
    const room = await makeRoom();
    const inv = await invite(room, "@agent", "room", { role: "agent" });
    const before = (await entries(room)).length;
    const join = new Client(room, newKeyPair()).signed("roster", null, { op: "join", invitation: inv.id, secret: inv.secret });
    expectRefusal(await call(room.stub.redeem({ custody: "client", join }, "x")), "custody-mismatch");
    expect((await entries(room)).length).toBe(before);
    expect(await invitationUsed(room, inv.id)).toBe(false);
  });

  it("section 23, Client-custody invitation, room redemption (R-ADM-12, R-CRED-9): custody-mismatch, no key made, nothing recorded, invitation unused", async () => {
    const room = await makeRoom();
    const inv = await invite(room, "@browser", "client");
    const before = (await entries(room)).length;
    const keys = await heldKeyCount(room);
    expectRefusal(await call(room.stub.redeem({ custody: "room", invitation: inv.id, secret: inv.secret }, "x")), "custody-mismatch");
    expect(await heldKeyCount(room)).toBe(keys);
    expect((await entries(room)).length).toBe(before);
    expect(await invitationUsed(room, inv.id)).toBe(false);
  });

  it("R-CRED-9: redemption is rate-limited per invitation", async () => {
    const room = await makeRoom();
    const inv = await invite(room, "@x", "room", { role: "agent" });
    let limited = false;
    for (let i = 0; i < 12; i++) {
      const w = (await room.stub.redeem({ custody: "room", invitation: inv.id, secret: b64url(randomBytes(32)) }, `addr-${i}`)) as { error?: { code: string } };
      if (w.error?.code === "rate-limited") limited = true;
    }
    expect(limited).toBe(true);
  });

  it("R-CRED-7: a read session ends when its key is revoked", async () => {
    const room = await makeRoom();
    const bob = await addMember(room, "@bob", "member");
    const token = await bob.session();
    await call(room.stub.read(token, { q: "members" }));
    await room.admin.ok("roster", null, { op: "revoke-key", key: bob.key, reason: "retired" });
    const w = (await room.stub.read(token, { q: "members" })) as { error?: { code: string } };
    expect(w.error?.code).toBe("unauthenticated");
  });

  it("R-CRED-6: a request nonce cannot be replayed, and notAfter is bounded", async () => {
    const room = await makeRoom();
    const req = room.admin.signedRequest({ kind: "session", ttlSeconds: 60 }, "nonce-nonce-nonce-1");
    await call(room.stub.request(req));
    expect(((await room.stub.request(req)) as { error?: { code: string } }).error?.code).toBe("unauthenticated");
    const far = room.admin.signedRequest({ kind: "session", ttlSeconds: 60 }, "nonce-nonce-nonce-2", iso(clock.now + 600_000));
    expect(((await room.stub.request(far)) as { error?: { code: string } }).error?.code).toBe("unauthenticated");
  });
});

describe("the Worker founds rooms", () => {
  it("draft, sign and found through HTTPS; the name resolves to the room ID", async () => {
    const admin = newKeyPair();
    const recovery = newKeyPair();
    const name = `acme/${b64url(randomBytes(6))}`;
    const d = await exports.default.fetch("https://artroom.test/v1/rooms", { method: "POST", body: JSON.stringify({ name, repo: "acme-web", admin: { handle: "@founder", key: admin.key }, recovery: recovery.key }) });
    expect(d.status).toBe(200);
    const { genesis, draft } = (await d.json()) as { genesis: { roomKey: string }; draft: string };
    const { sign } = await import("../../src/crypto.ts");
    const f = await exports.default.fetch("https://artroom.test/v1/rooms/found", { method: "POST", body: JSON.stringify({ genesis, sig: sign(admin.seed, "artroom-genesis-v1", genesis), draft }) });
    expect(f.status).toBe(200);
    const { room } = (await f.json()) as { room: string };
    expect(room).toMatch(/^room_[0-9a-f]{32}$/);
    const names = env.NAMES.get(env.NAMES.idFromName(name)) as unknown as { get(): Promise<string | null> };
    expect(await names.get()).toBe(room);
    expect(JSON.stringify(genesis)).not.toContain("test-room-key-secret");
  });
});
