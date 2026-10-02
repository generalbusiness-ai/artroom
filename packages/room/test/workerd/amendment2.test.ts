/**
 * Contract amendment 2: the lane A edits of protocol section 27 not covered
 * by the founding suite.
 */

import { describe, expect, it } from "vitest";
import { exports } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import type { ActRecord, AttentionPage, CheckerConfig, Claim, Landing, LogEntry, PolicyDocument, Redeemed, Refusal, RosterRecord, SystemEvent, Update, WorkspaceGrant, WorkspaceOp } from "@generalbusiness/artroom-contract";
import { isArtroomError } from "@generalbusiness/artroom-contract";
import { policy, requireReview, rule } from "@generalbusiness/artroom-policy/helpers";
import type { Room } from "../../src/index.ts";
import { digestJson } from "../../src/crypto.ts";
import { addMember, advance, b64url, call, clock, day, digestBytes, expectRefusal, failure, iso, makeRoom, pushChange, randomBytes, tick, tokenLive, type TestRoom } from "./support.ts";

const entries = async (r: TestRoom): Promise<LogEntry[]> => [...(await r.admin.read({ q: "log", req: { limit: 500 } })).acts];
const events = (log: LogEntry[], type: SystemEvent["type"]) => log.filter((e) => e.entry.type === "system" && e.entry.event.type === type).map((e) => ({ seq: e.seq, event: (e.entry as { event: SystemEvent }).event }));
const inDO = <T>(r: TestRoom, fn: (room: Room) => T | Promise<T>) => runInDurableObject(r.stub as unknown as DurableObjectStub<Room>, fn);

async function activate(r: TestRoom, doc: PolicyDocument): Promise<void> {
  await inDO(r, (room) => room.core.sql.transaction(() => room.core.activate(doc, {}, null, iso(clock.now))));
}

type Wire = {
  bearerAct(bearer: string, act: unknown): Promise<ActRecord | Refusal>;
  bearerRequest(bearer: string, req: unknown): Promise<WorkspaceOp | WorkspaceGrant | Refusal>;
} & Disposable;
const wireFor = (r: TestRoom) => (exports.default as unknown as { room(id: string): Promise<Wire> }).room(r.id);

async function bearer(r: TestRoom, kinds: string[] = ["claim", "propose", "note"]): Promise<Redeemed> {
  const bytes = randomBytes(32);
  const inv = await r.admin.ok<RosterRecord>("roster", null, {
    op: "invite",
    member: "@agent",
    role: "agent",
    custody: "room",
    expiresAt: iso(clock.now + day),
    secretHash: digestBytes(bytes),
    session: { kinds, lanes: "*", ttlSeconds: 3600 },
  });
  return call<Redeemed>(r.stub.redeem({ custody: "room", invitation: inv.id, secret: b64url(bytes) }, "x"));
}

describe("edit 6: bearerAct and bearerRequest on the Worker's RoomWire (R-CRED-10)", () => {
  it("a bearer claims, opens its workspace and gets the token, through the RPC target; never a session request or a roster act", async () => {
    const r = await makeRoom();
    const b = await bearer(r);
    using wire = await wireFor(r);
    const claim = (await wire.bearerAct(b.bearer, { kind: "claim", target: null, body: { goal: "agent", scope: ["src/**"] }, idempotencyKey: "c1" })) as Claim;
    expect(claim.by).toMatchObject({ via: "delegation", member: "@agent" });
    const op = (await wire.bearerRequest(b.bearer, { kind: "workspace", lane: claim.lane, lease: 1 })) as WorkspaceOp;
    expect(op.state).toBe("pending");
    await tick(r);
    const grant = (await wire.bearerRequest(b.bearer, { kind: "workspace-token", lane: claim.lane, lease: 1 })) as WorkspaceGrant;
    expect(tokenLive(r, claim.lane, grant.token)).toBe(true);
    expectRefusal(await wire.bearerRequest(b.bearer, { kind: "workspace-token", lane: claim.lane, lease: 7 }), "lease-fenced");
    let thrown: unknown = null;
    try {
      // Even with a lane and lease, a bearer has no `session` request: its token already is a read credential.
      await wire.bearerRequest(b.bearer, { kind: "session", lane: claim.lane, lease: 1 });
    } catch (e) {
      thrown = e;
    }
    expect(isArtroomError(thrown) && (thrown as { code: string }).code).toBe("bad-request");
    expectRefusal(await wire.bearerAct(b.bearer, { kind: "roster", target: null, body: { op: "remove", member: "@admin" }, idempotencyKey: "r1" }), "delegation-invalid");
  });

  it("section 23, Bearer receipt after revocation: a retry returns the original; after revocation it is unauthenticated and records nothing; a kept signed envelope still returns its original", async () => {
    const r = await makeRoom();
    const b = await bearer(r);
    const act = { kind: "claim", target: null, body: { goal: "agent", scope: ["src/**"] }, idempotencyKey: "lost-receipt" };
    const first = await call<Claim>(r.stub.bearerAct(b.bearer, act));
    expect(await call<Claim>(r.stub.bearerAct(b.bearer, act))).toEqual(first);
    const sessionKey = (await r.admin.read({ q: "members" })).delegations.find((d) => d.id === b.delegation)!.grantee;
    await r.admin.ok("roster", null, { op: "revoke-key", key: sessionKey, reason: "retired" });
    const before = (await entries(r)).length;
    expect((await failure(r.stub.bearerAct(b.bearer, act))).code).toBe("unauthenticated");
    expect((await failure(r.stub.bearerRequest(b.bearer, { kind: "workspace", lane: first.lane, lease: 1 }))).code).toBe("unauthenticated");
    expect((await entries(r)).length).toBe(before);
    // A signed envelope a client kept still replays after its key is revoked (R-IDEM-2).
    const bob = await addMember(r, "@bob", "member");
    const kept = bob.signed("claim", null, { goal: "g", scope: ["docs/**"] });
    const original = await call<Claim>(r.stub.submit(kept));
    await r.admin.ok("roster", null, { op: "revoke-key", key: bob.key, reason: "retired" });
    expect(await call<Claim>(r.stub.submit(kept))).toEqual(original);
  });
});

describe("edit 8: attention pages carry publishedThrough (R-API-9)", () => {
  it("the page's publishedThrough comes from the same read", async () => {
    const r = await makeRoom();
    await r.admin.ok("claim", null, { goal: "g", scope: ["src/**"] });
    expect(((await r.admin.read({ q: "attention" })) as AttentionPage).publishedThrough).toBe(-1);
    await call(r.stub.publishLog());
    expect(((await r.admin.read({ q: "attention" })) as AttentionPage).publishedThrough).toBe(2);
  });
});

describe("edit 9: policy-activated names the checkers (R-POL-9)", () => {
  it("as name and digest pairs, sorted by name", async () => {
    const zeta: CheckerConfig = { format: "artroom-checker-v1", volatile: false, timeoutSeconds: 10 };
    const alpha: CheckerConfig = { format: "artroom-checker-v1", volatile: true, timeoutSeconds: 20 };
    const r = await makeRoom({ files: { ".artroom/checkers/zeta.json": JSON.stringify(zeta), ".artroom/checkers/alpha.json": JSON.stringify(alpha) } });
    const [, activated] = await entries(r);
    expect((activated!.entry as unknown as { event: { checkers: unknown } }).event.checkers).toEqual([
      { name: "alpha", config: digestJson(alpha) },
      { name: "zeta", config: digestJson(zeta) },
    ]);
  });
});

describe("edit 10: obligations-recomputed (R-POL-9)", () => {
  it("section 23, Recompute after activation: reopened 0 at activation; land refused until the event lists the new obligation; a failing require gives blocked", async () => {
    const r = await makeRoom({ policy: policy(requireReview({ id: "rv", paths: "src/**", from: "@bob" })) });
    const bob = await addMember(r, "@bob", "maintainer");
    await addMember(r, "@carol", "maintainer");
    const c = await r.admin.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
    const head = pushChange(r, c.lane, { "src/app.ts": "v2" });
    await r.admin.ok("propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" });
    await bob.ok("review", { lane: c.lane, generation: 1 }, { head, verdict: "approve", scope: ["src/**"], text: "ok" });
    await activate(r, policy(requireReview({ id: "rv", paths: "src/**", from: "@carol" }), requireReview({ id: "extra", paths: "src/**", from: "@carol" })));
    const activated = events(await entries(r), "policy-activated").at(-1)!;
    expect((activated.event as { recomputed: { reopened: number; proposals: number } }).recomputed).toMatchObject({ reopened: 0, proposals: 1 });
    expectRefusal(await r.admin.act("land", { lane: c.lane, generation: 1 }, { lease: 1, head }), "obligation-open");
    await tick(r);
    const recomputed = events(await entries(r), "obligations-recomputed").at(-1)!;
    expect(recomputed.seq).toBeGreaterThan(activated.seq);
    expect(recomputed.event).toMatchObject({ lane: c.lane, generation: 1, obligations: ["obl_rv", "obl_extra"], reopened: ["obl_rv"] });
    expect((recomputed.event as unknown as { decisions: unknown[] }).decisions.length).toBeGreaterThan(0);
    expect((recomputed.event as { policy: string }).policy).toBe(`act_${activated.seq}_${(await entries(r))[activated.seq]!.hash.slice(7, 15)}`);
    // A require rule whose condition fails deterministically blocks landing.
    await activate(r, policy(requireReview({ id: "rv", paths: "src/**", from: "@carol", when: "1" })));
    await tick(r);
    const blocked = events(await entries(r), "obligations-recomputed").at(-1)!;
    expect((blocked.event as { blocked?: { rule: string } }).blocked?.rule).toBe("policy-type-error");
    expectRefusal(await r.admin.act("land", { lane: c.lane, generation: 1 }, { lease: 1, head }), "policy-type-error");
  });
});

describe("edit 11: land-evaluated (R-LAND-4)", () => {
  const withLandRule = (block: string): PolicyDocument => ({
    ...policy(),
    rules: [{ id: "gate", kind: "land", block, reason: "Blocked.", fix: "None." }],
  });

  it("section 23, Land rules in preparation: a land-evaluated event for a pass, and for a block followed by failed", async () => {
    for (const [block, outcome] of [["false", "landed"], ['stage = "reservation"', "failed"]] as const) {
      const r = await makeRoom({ policy: withLandRule(block) });
      const c = await r.admin.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
      const head = pushChange(r, c.lane, { "src/app.ts": "v2" });
      await r.admin.ok("propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" });
      const land = await r.admin.ok<Landing>("land", { lane: c.lane, generation: 1 }, { lease: 1, head });
      await tick(r, 3);
      const log = await entries(r);
      const evaluated = events(log, "land-evaluated");
      expect(evaluated.length).toBe(1);
      expect(evaluated[0]!.event).toMatchObject({ op: land.op.id, decisions: [expect.objectContaining({ rule: "gate", kind: "land" })] });
      expect((evaluated[0]!.event as { landInput: string }).landInput).toMatch(/^sha256:/);
      const out = events(log, "land-outcome").at(-1)!;
      expect((out.event as { outcome: { state: string } }).outcome.state).toBe(outcome);
      expect(out.seq).toBeGreaterThan(evaluated[0]!.seq);
    }
  });
});

describe("edit 12: a queued notify keeps its policy version (R-LOG-13)", () => {
  it("section 23, Notify across an activation: the notified decisions name V1 and were made with V1", async () => {
    const v1 = policy(rule({ id: "tell-admins", kind: "notify", on: ["claim"], to: ["role:admin"], why: "V1 rule." }));
    const r = await makeRoom({ policy: v1 });
    const versionV1 = (await r.admin.read({ q: "log" })).acts.map((e) => `act_${e.seq}_${e.hash.slice(7, 15)}`)[1]!;
    r.world.policy.failures.notify = 1;
    const claim = await r.admin.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
    await tick(r);
    await activate(r, policy(rule({ id: "tell-nobody", kind: "notify", on: ["note"], to: ["role:admin"], why: "V2 rule." })));
    advance(5_000);
    await tick(r);
    const notified = events(await entries(r), "notified").at(-1)!.event as unknown as { entry: string; decisions: { rule: string; policy: string }[] };
    expect(notified.entry).toBe(claim.id);
    expect(notified.decisions.map((d) => [d.rule, d.policy])).toEqual([["tell-admins", versionV1]]);
  });
});

describe("R-API-8: the RPC subscription carries bytes", () => {
  it("section 23, RPC subscription: UTF-8 bytes, one JSON Update per line", async () => {
    const r = await makeRoom();
    const token = await r.admin.session();
    using wire = await (exports.default as unknown as { room(id: string): Promise<{ subscribe(s: string): Promise<ReadableStream<Uint8Array>> } & Disposable> }).room(r.id);
    const stream = await wire.subscribe(token);
    await r.admin.ok("claim", null, { goal: "a", scope: ["src/a/**"] });
    await r.admin.ok("claim", null, { goal: "b", scope: ["src/b/**"] });
    const reader = stream.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });
    let text = "";
    const kinds: string[] = [];
    while (kinds.length < 2) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      const lines = text.split("\n");
      text = lines.pop()!;
      for (const line of lines) kinds.push(...(JSON.parse(line) as Update).entries.map((e) => e.kind));
    }
    expect(kinds).toEqual(["claim", "claim"]);
    await reader.cancel();
  });
});
