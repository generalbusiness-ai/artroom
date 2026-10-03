/**
 * Declared acts stage 2 (request fd6f00b6; docs/protocol.md section 33):
 * the Room admits acts from the active declarations.
 *
 * These tests found their own `v1` and `v2` rooms and sign their own
 * envelopes, binding included, so they run in the legacy run only: the
 * declared run's harness conversions (test/workerd/vocabulary.ts) would
 * re-sign the stale envelopes they send on purpose.
 */

import { describe, expect, it } from "vitest";
import type { ActRecord, Claim, LaneId, PolicyDocumentV2, Redeemed, Refusal, RosterRecord } from "@generalbusiness/artroom-contract";
import { CODE_REVIEW_ACTS, bindingOf, lanes as lanesPart, policy, requireReview, rule } from "@generalbusiness/artroom-policy";
import { activate, act, bindingIn, declaredRoom, headSeq, inDO, laneRowOf, LEASE, ok, restarted, signed, v2 } from "./declared-support.ts";
import {
  addMember,
  advance,
  b64url,
  call,
  Client,
  clock,
  day,
  DECLARED,
  digestBytes,
  expectOk,
  expectRefusal,
  failure,
  iso,
  makeRoom,
  newKeyPair,
  pushChange,
  randomBytes,
  tick,
  type TestRoom,
} from "./support.ts";

describe.skipIf(DECLARED)("declared acts stage 2: one vocabulary per document (R-DECL-1)", () => {
  it("a v1 room is the legacy vocabulary: a v: 2 envelope, a binding on v: 1, and recover are bad-request at step 1", async () => {
    const r = await makeRoom();
    const b = await (async () => {
      const d = await declaredRoom();
      return (await bindingIn(d, "claim"))!;
    })();
    const v2Env = await signed(r, r.admin, "claim", null, { goal: "g", scope: ["src/**"] }, { binding: b });
    expect(await failure(r.stub.submit(v2Env))).toMatchObject({ code: "bad-request", message: "envelope.binding is not a field of this type." });
    const v2NoBinding = await signed(r, r.admin, "claim", null, { goal: "g", scope: ["src/**"] }, { binding: null, v: 2 });
    expect(await failure(r.stub.submit(v2NoBinding))).toMatchObject({ code: "bad-request", message: "envelope.v must be 1." });
    const recover = await signed(r, r.admin, "recover", null, { op: "open", goal: "g", scope: [".artroom/**"] }, { binding: null });
    expect((await failure(r.stub.submit(recover))).code).toBe("bad-request");
    // The legacy claim is admitted, and its thread records kind claim and no binding or lease length (R-DECL-9).
    const c = await r.admin.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
    expect(await laneRowOf(r, c.lane)).toMatchObject({ kind: "claim", binding: null, lease_ms: null });
  });

  it("a v2 room admits the code-review acts with their bindings; a thread records its kind, opening binding and lease length (R-DECL-6)", async () => {
    const r = await declaredRoom();
    const c = await ok<Claim>(r, r.admin, "claim", null, { goal: "g", scope: ["src/**"] });
    expect(c).toMatchObject({ kind: "claim", purpose: "ordinary", lease: { generation: 1, expiresAt: iso(clock.now + LEASE) } });
    expect(await laneRowOf(r, c.lane)).toEqual({ kind: "claim", binding: await bindingIn(r, "claim"), lease_ms: LEASE, expires_ms: clock.now + LEASE, purpose: "ordinary" });
    // The platform kinds stay v: 1; a v: 2 envelope of one is bad-request.
    expectOk(await act(r, r.admin, "renew", { lane: c.lane }, { lease: 1 }, { binding: null }));
    const v2Renew = await signed(r, r.admin, "renew", { lane: c.lane }, { lease: 1 }, { binding: (await bindingIn(r, "claim"))! });
    expect(await failure(r.stub.submit(v2Renew))).toMatchObject({ code: "bad-request", message: "envelope.v must be 1 for the platform kind renew." });
  });

  it("the room's binding is the policy package's binding identity (R-DECL-15), for each code-review kind", async () => {
    const doc = v2();
    const r = await declaredRoom(doc);
    for (const kind of Object.keys(CODE_REVIEW_ACTS)) expect(await bindingIn(r, kind)).toBe(await bindingOf(doc, kind));
    expect(await bindingIn(r, "renew")).toBeNull();
  });
});

describe.skipIf(DECLARED)("who may sign: who.roles, admin implicit (R-DECL-11)", () => {
  it("a declared kind's roles decide at step 4, unrecorded; an admin may sign every declared act; renew keeps the legacy table", async () => {
    const r = await declaredRoom(v2((a) => void (a["claim"] = { ...a["claim"]!, who: { roles: ["maintainer"] } })));
    const bob = await addMember(r, "@bob", "member");
    const mo = await addMember(r, "@mo", "maintainer");
    const ci = await addMember(r, "@ci", "checker");
    expect(expectRefusal(await act(r, bob, "claim", null, { goal: "g", scope: ["src/**"] }), "role-forbids").act).toBeUndefined();
    const c = await ok<Claim>(r, mo, "claim", null, { goal: "g", scope: ["src/**"] });
    await ok<Claim>(r, r.admin, "claim", null, { goal: "g", scope: ["docs/**"] });
    expectRefusal(await act(r, ci, "renew", { lane: c.lane }, { lease: 1 }, { binding: null }), "role-forbids");
    expectRefusal(await act(r, ci, "claim", null, { goal: "g", scope: ["lib/**"] }), "role-forbids");
  });
});

describe.skipIf(DECLARED)("step 1 under the document in force (R-ADM-1 as amended)", () => {
  it("admission judges step 1 again under the document it decides with: an envelope of the other vocabulary is bad-request there too", async () => {
    const r = await makeRoom();
    const d = await declaredRoom();
    const env = await signed(d, d.admin, "claim", null, { goal: "g", scope: ["src/**"] });
    const out = await inDO(r, async (room) => {
      const { earlySteps } = await import("../../src/admission.ts");
      try {
        earlySteps(room.core, { ...env, envelope: { ...env.envelope, room: r.id } } as never, "submitted", "x");
        return "decided";
      } catch (e) {
        return (e as { code?: string }).code ?? "threw";
      }
    });
    expect(out).toBe("bad-request");
  });
});

describe.skipIf(DECLARED)("step 4a: kind-undeclared and binding-stale, unrecorded (R-DECL-16)", () => {
  it("an undeclared kind is kind-undeclared after authority and before the body check; nothing is recorded", async () => {
    const r = await declaredRoom();
    const before = await headSeq(r);
    // A body no declaration could accept: the kind is judged first.
    const out = expectRefusal(await act(r, r.admin, "merge", null, { anything: true }, { binding: `sha256:${"1".repeat(64)}` }), "kind-undeclared");
    expect(out.reason).toContain("merge");
    expect(out.reason).toContain(await inDO(r, (room) => room.core.activePolicy().version));
    expect(out.act).toBeUndefined();
    expect(await headSeq(r)).toBe(before);
    // Authority first: a key of no member is not-member, whatever the kind.
    const stranger = new Client(r, newKeyPair());
    expectRefusal(await act(r, stranger, "merge", null, {}, { binding: `sha256:${"1".repeat(64)}` }), "not-member");
  });

  it("a v: 1 envelope of a declared kind, and a v: 2 one with another binding, are binding-stale with the current binding and version; the signer signs again under the same key", async () => {
    const r = await declaredRoom();
    const current = (await bindingIn(r, "claim"))!;
    const version = await inDO(r, (room) => room.core.activePolicy().version);
    const before = await headSeq(r);
    const v1 = expectRefusal(await act(r, r.admin, "claim", null, { goal: "g", scope: ["src/**"] }, { binding: null, ikey: "same-intent" }), "binding-stale");
    expect(v1.current).toEqual({ binding: current, policy: version });
    expect(v1.act).toBeUndefined();
    const other = expectRefusal(await act(r, r.admin, "claim", null, { goal: "g", scope: ["src/**"] }, { binding: `sha256:${"2".repeat(64)}`, ikey: "same-intent" }), "binding-stale");
    expect(other.current).toEqual({ binding: current, policy: version });
    expect(await headSeq(r)).toBe(before);
    // Not recorded, so the same idempotency key signs the same intent again under the active binding.
    expectOk(await act(r, r.admin, "claim", null, { goal: "g", scope: ["src/**"] }, { ikey: "same-intent" }));
  });

  it("same-shape change: an act signed under [version], submitted after activation of [version, land], is binding-stale and no landing starts", async () => {
    const r = await declaredRoom();
    const c = await ok<Claim>(r, r.admin, "claim", null, { goal: "g", scope: ["src/**"] });
    const head = pushChange(r, c.lane, { "src/app.ts": "v2" });
    const env = await signed(r, r.admin, "propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" });
    await activate(r, v2((a) => void ((a["propose"] as { targets: unknown }).targets = { thread: ["version", "land"] })));
    const out = expectRefusal(await call(r.stub.submit(env)), "binding-stale");
    expect(out.current?.binding).toBe(await bindingIn(r, "propose"));
    expect(out.current?.binding).not.toBe((env.envelope as unknown as { binding: string }).binding);
    expect(await inDO(r, (room) => room.core.landing.activeViews().length)).toBe(0);
    expect(await inDO(r, (room) => room.core.sql.all("SELECT COUNT(*) AS n FROM generations")[0]!["n"])).toBe(0);
  });

  it("hold change: a claim signed before leaseSeconds or the scope source changed is binding-stale", async () => {
    const r = await declaredRoom();
    const env = await signed(r, r.admin, "claim", null, { goal: "g", scope: ["src/**"] });
    await activate(r, v2((a) => void ((a["claim"] as { hold: unknown }).hold = { scope: "body.scope", workspace: true, leaseSeconds: 600 })));
    expectRefusal(await call(r.stub.submit(env)), "binding-stale");
    const env2 = await signed(r, r.admin, "claim", null, { goal: "g", scope: ["src/**"] });
    await activate(r, v2((a) => void ((a["claim"] as { hold: unknown }).hold = { scope: ["src/**"], workspace: true })));
    expectRefusal(await call(r.stub.submit(env2)), "binding-stale");
  });

  it("unrelated update: a new kind, a changed refuse rule, a new label or wording leave the binding equal, and the act is admitted", async () => {
    const r = await declaredRoom();
    const before = (await bindingIn(r, "claim"))!;
    const env = await signed(r, r.admin, "claim", null, { goal: "g", scope: ["src/**"] });
    const doc = v2(
      (a) => {
        a["claim"] = { ...a["claim"]!, label: "Take a scope", help: "Claim paths.", refusals: { "scope-overlap": { reason: "Overlaps {lane}.", fix: "Narrow it." } } };
        a["ask"] = { label: "Ask", targets: { entry: ["comment"] }, body: { text: { type: "text", max: 100 } }, who: { roles: ["member"] } };
      },
      policy(rule({ id: "no-docs", on: ["propose"], refuse: "false", reason: "Never.", fix: "None." })),
    );
    await activate(r, doc);
    expect(await bindingIn(r, "claim")).toBe(before);
    expectOk(await call(r.stub.submit(env)));
  });

  it("exact retry: an act accepted before an activation, retried after it, gets its original receipt", async () => {
    const r = await declaredRoom();
    const env = await signed(r, r.admin, "claim", null, { goal: "g", scope: ["src/**"] });
    const first = expectOk(await call<Claim | Refusal>(r.stub.submit(env)));
    await activate(r, v2((a) => void ((a["claim"] as { hold: unknown }).hold = { scope: "body.scope", workspace: true, leaseSeconds: 600 })));
    const seq = await headSeq(r);
    expect(await call(r.stub.submit(env))).toEqual(first);
    expect(await headSeq(r)).toBe(seq);
    // A new act of the same envelope under the new binding is a different act: idempotency-mismatch on the same key.
    const again = await signed(r, r.admin, "claim", null, { goal: "g", scope: ["src/**"] }, { ikey: (env.envelope as unknown as { idempotencyKey: string }).idempotencyKey });
    expectRefusal(await call(r.stub.submit(again)), "idempotency-mismatch");
  });
});

describe.skipIf(DECLARED)("grants carry the bindings their grantor signed (R-DECL-17)", () => {
  async function delegateOp(_r: TestRoom, to: string, acts: Record<string, string>, kinds: string[] = []) {
    return { op: "delegate", to, kinds, acts, lanes: "*", expiresAt: iso(clock.now + day) };
  }

  it("a grant signed for a meaning that changed before its admission is binding-stale; a kind it does not declare is kind-undeclared; nothing is recorded", async () => {
    const r = await declaredRoom();
    const k = newKeyPair();
    const env = await signed(r, r.admin, "roster", null, await delegateOp(r, k.key, { claim: (await bindingIn(r, "claim"))! }), { binding: null });
    await activate(r, v2((a) => void ((a["claim"] as { hold: unknown }).hold = { scope: "body.scope", workspace: true, leaseSeconds: 600 })));
    const seq = await headSeq(r);
    const stale = expectRefusal(await call(r.stub.submit(env)), "binding-stale");
    expect(stale.current?.binding).toBe(await bindingIn(r, "claim"));
    expectRefusal(await act(r, r.admin, "roster", null, await delegateOp(r, k.key, { merge: `sha256:${"3".repeat(64)}` }), { binding: null }), "kind-undeclared");
    expect(await headSeq(r)).toBe(seq);
    // `*` and a v1-shaped grant are invalid-body in a v2 room.
    expectRefusal(await act(r, r.admin, "roster", null, { op: "delegate", to: k.key, kinds: "*", lanes: "*", expiresAt: iso(clock.now + day) }, { binding: null }), "invalid-body");
  });

  it("the grantor's role and who.delegable bound the map; a grant expanded before a kind was added does not cover it", async () => {
    const r = await declaredRoom(v2((a) => void (a["land"] = { ...a["land"]!, who: { roles: ["maintainer", "member", "agent"], delegable: false } })));
    const bob = await addMember(r, "@bob", "member");
    const k = newKeyPair();
    expectRefusal(await act(r, bob, "roster", null, await delegateOp(r, k.key, { check: (await bindingIn(r, "check"))! }), { binding: null }), "delegation-invalid");
    expect(expectRefusal(await act(r, bob, "roster", null, await delegateOp(r, k.key, { land: (await bindingIn(r, "land"))! }), { binding: null }), "delegation-invalid").reason).toContain("may not be delegated");
    const grant = await ok<RosterRecord>(r, bob, "roster", null, await delegateOp(r, k.key, { claim: (await bindingIn(r, "claim"))!, note: (await bindingIn(r, "note"))! }, ["renew"]), { binding: null });
    // A new kind is declared; the expanded map does not cover it.
    await activate(r, v2((a) => void (a["ask"] = { label: "Ask", targets: { entry: ["comment"] }, body: { text: { type: "text", max: 100 } }, who: { roles: ["member"] } })));
    const d = new Client(r, k, grant.id);
    const c = await ok<Claim>(r, d, "claim", null, { goal: "g", scope: ["src/**"] });
    expectOk(await act(r, d, "renew", { lane: c.lane }, { lease: 1 }, { binding: null }));
    expect(expectRefusal(await act(r, d, "ask", { act: c.id }, { text: "?" }), "delegation-invalid").reason).toContain("does not cover ask");
  });

  it("an exact retry of an admitted grant after a meaning change gets its receipt; acts under it are then delegation-invalid", async () => {
    const r = await declaredRoom();
    const k = newKeyPair();
    const env = await signed(r, r.admin, "roster", null, await delegateOp(r, k.key, { claim: (await bindingIn(r, "claim"))! }), { binding: null });
    const grant = expectOk(await call<RosterRecord | Refusal>(r.stub.submit(env)));
    await activate(r, v2((a) => void ((a["claim"] as { hold: unknown }).hold = { scope: "body.scope", workspace: true, leaseSeconds: 600 })));
    expect(await call(r.stub.submit(env))).toEqual(grant);
    const out = expectRefusal(await act(r, new Client(r, k, grant.id), "claim", null, { goal: "g", scope: ["src/**"] }), "delegation-invalid");
    expect(out.reason).toBe("The delegation was granted for an earlier meaning of claim.");
    expect(out.fix).toBe("Ask the grantor to delegate again.");
  });

  it("an invitation signed before a meaning change and redeemed after it is binding-stale; the invitation stays unused", async () => {
    const r = await declaredRoom();
    const bytes = randomBytes(32);
    const inv = await ok<RosterRecord>(
      r,
      r.admin,
      "roster",
      null,
      {
        op: "invite",
        member: "@agent",
        role: "agent",
        custody: "room",
        expiresAt: iso(clock.now + day),
        secretHash: digestBytes(bytes),
        session: { kinds: ["renew"], acts: { claim: (await bindingIn(r, "claim"))! }, lanes: "*", ttlSeconds: 3600 },
      },
      { binding: null },
    );
    await activate(r, v2((a) => void ((a["claim"] as { hold: unknown }).hold = { scope: "body.scope", workspace: true, leaseSeconds: 600 })));
    const seq = await headSeq(r);
    expectRefusal(await call(r.stub.redeem({ custody: "room", invitation: inv.id, secret: b64url(bytes) }, "x")), "binding-stale");
    expect(await headSeq(r)).toBe(seq);
    expect(await inDO(r, (room) => room.core.sql.all("SELECT used FROM invitations WHERE id = ?", inv.id)[0]!["used"])).toBeNull();
  });

  it("a room-custody invitation with no session grants renew and no declared kind; its bearer's code-review tools carry the code-review binding", async () => {
    const r = await declaredRoom();
    const bytes = randomBytes(32);
    const inv = await ok<RosterRecord>(r, r.admin, "roster", null, { op: "invite", member: "@agent", role: "agent", custody: "room", expiresAt: iso(clock.now + day), secretHash: digestBytes(bytes) }, { binding: null });
    const b = await call<Redeemed>(r.stub.redeem({ custody: "room", invitation: inv.id, secret: b64url(bytes) }, "x"));
    const d = (await r.admin.read({ q: "members" })).delegations.find((x) => x.id === b.delegation)!;
    expect(d).toMatchObject({ kinds: ["renew"], acts: {} });
    expect(expectRefusal(await call(r.stub.bearerAct(b.bearer, { kind: "claim", target: null, body: { goal: "g", scope: ["src/**"] }, idempotencyKey: "b1" })), "delegation-invalid").reason).toContain("does not cover claim");
  });

  it("an invitation's session map is judged when the invitation is admitted (R-DECL-17): a stale binding is binding-stale, an undeclared kind kind-undeclared, a kind the invited role may not sign invalid-body; nothing is recorded", async () => {
    const r = await declaredRoom();
    const invite = async (acts: Record<string, string>) =>
      act(
        r,
        r.admin,
        "roster",
        null,
        { op: "invite", member: "@agent", role: "agent", custody: "room", expiresAt: iso(clock.now + day), secretHash: digestBytes(randomBytes(32)), session: { kinds: ["renew"], acts, lanes: "*", ttlSeconds: 3600 } },
        { binding: null },
      );
    const seq = await headSeq(r);
    const stale = expectRefusal(await invite({ claim: `sha256:${"3".repeat(64)}` }), "binding-stale");
    expect(stale.current?.binding).toBe(await bindingIn(r, "claim"));
    expectRefusal(await invite({ merge: `sha256:${"3".repeat(64)}` }), "kind-undeclared");
    expect(expectRefusal(await invite({ check: (await bindingIn(r, "check"))! }), "invalid-body").reason).toBe("The role agent may not sign every kind the session lists.");
    expect(await headSeq(r)).toBe(seq);
    expectOk(await invite({ claim: (await bindingIn(r, "claim"))! }));
  });

  it("an invitation from before declared acts, redeemed after the first v2 activation, grants only the delegable platform kinds its session covered: one limited to claim and propose grants nothing, one that lists renew grants renew (intersection, never acquisition)", async () => {
    const r = await makeRoom();
    const invite = async (member: string, kinds: readonly string[]) => {
      const bytes = randomBytes(32);
      const inv = await r.admin.ok<RosterRecord>("roster", null, { op: "invite", member, role: "agent", custody: "room", expiresAt: iso(clock.now + day), secretHash: digestBytes(bytes), session: { kinds, lanes: "*", ttlSeconds: 3600 } });
      return { id: inv.id, secret: b64url(bytes) };
    };
    const narrow = await invite("@one", ["claim", "propose"]);
    const wide = await invite("@two", ["claim", "renew"]);
    await activate(r, v2());
    const grantOf = async (i: { id: RosterRecord["id"]; secret: string }) => {
      const b = await call<Redeemed>(r.stub.redeem({ custody: "room", invitation: i.id as never, secret: i.secret }, "x"));
      return (await r.admin.read({ q: "members" })).delegations.find((x) => x.id === b.delegation)!;
    };
    expect(await grantOf(narrow)).toMatchObject({ kinds: [], acts: {} });
    expect(await grantOf(wide)).toMatchObject({ kinds: ["renew"], acts: {} });
  });

  it("bearer acts: the named tools' code-review binding is admitted where claim means the code-review claim, and binding-stale where it does not", async () => {
    const grantFor = async (r: TestRoom) => {
      const bytes = randomBytes(32);
      const inv = await ok<RosterRecord>(
        r,
        r.admin,
        "roster",
        null,
        { op: "invite", member: "@agent", role: "agent", custody: "room", expiresAt: iso(clock.now + day), secretHash: digestBytes(bytes), session: { kinds: ["renew"], acts: { claim: (await bindingIn(r, "claim"))! }, lanes: "*", ttlSeconds: 3600 } },
        { binding: null },
      );
      return call<Redeemed>(r.stub.redeem({ custody: "room", invitation: inv.id, secret: b64url(bytes) }, "x"));
    };
    const same = await declaredRoom();
    const a = await grantFor(same);
    expectOk(await call(same.stub.bearerAct(a.bearer, { kind: "claim", target: null, body: { goal: "g", scope: ["src/**"] }, idempotencyKey: "b1" })));
    const other = await declaredRoom(v2((x) => void ((x["claim"] as { hold: unknown }).hold = { scope: "body.scope", workspace: true, leaseSeconds: 600 })));
    const o = await grantFor(other);
    // The tool's binding is not the one the grant names, so the delegation does not cover it (step 4, before 4a).
    expectRefusal(await call(other.stub.bearerAct(o.bearer, { kind: "claim", target: null, body: { goal: "g", scope: ["src/**"] }, idempotencyKey: "b1" })), "delegation-invalid");
    // A binding the bearer act names itself is used as given.
    expectOk(await call(other.stub.bearerAct(o.bearer, { kind: "claim", target: null, body: { goal: "g", scope: ["src/**"] }, idempotencyKey: "b2", binding: (await bindingIn(other, "claim"))! })));
  });

  it("grants from before declared acts: after the first v2 activation a v1-era * delegation covers renew and no declared kind; one limited to review and check covers nothing", async () => {
    const r = await makeRoom();
    const bob = await addMember(r, "@bob", "member");
    const k1 = newKeyPair();
    const k2 = newKeyPair();
    const star = await bob.ok<RosterRecord>("roster", null, { op: "delegate", to: k1.key, kinds: "*", lanes: "*", expiresAt: iso(clock.now + day) });
    const narrow = await r.admin.ok<RosterRecord>("roster", null, { op: "delegate", to: k2.key, kinds: ["review", "check"], lanes: "*", expiresAt: iso(clock.now + day) });
    const c = await bob.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
    await activate(r, v2());
    const d1 = new Client(r, k1, star.id);
    const d2 = new Client(r, k2, narrow.id);
    const s1 = await act(r, d1, "claim", null, { goal: "g", scope: ["docs/**"] });
    expect(expectRefusal(s1, "delegation-invalid").fix).toBe("Ask the grantor to delegate again.");
    expectOk(await act(r, d1, "renew", { lane: c.lane }, { lease: 1 }, { binding: null }));
    expectRefusal(await act(r, d2, "review", { lane: c.lane, generation: 1 }, { head: "a".repeat(40), verdict: "approve", scope: ["src/**"], text: "ok" }), "delegation-invalid");
    expectRefusal(await act(r, d2, "renew", { lane: c.lane }, { lease: 1 }, { binding: null }), "delegation-invalid");
  });
});

describe.skipIf(DECLARED)("threads (R-DECL-6, R-DECL-8, R-DECL-23)", () => {
  it("take-over with a new scope: a released claim taken over with a different scope moves its scope and lease generation; an overlap with an exclusive held thread is scope-overlap", async () => {
    const r = await declaredRoom(v2(() => {}, policy(lanesPart("exclusive"))));
    const bob = await addMember(r, "@bob", "member");
    const a = await ok<Claim>(r, r.admin, "claim", null, { goal: "g", scope: ["src/**"] });
    await ok<Claim>(r, r.admin, "claim", null, { goal: "docs", scope: ["docs/**"] });
    await ok(r, r.admin, "release", { lane: a.lane }, { lease: 1 });
    const t = await ok<Claim>(r, bob, "claim", { lane: a.lane }, { scope: ["lib/**"], expectedGeneration: 0 });
    expect(t).toMatchObject({ scope: ["lib/**"], lease: { holder: "@bob", generation: 3 }, effect: { type: "taken-over" } });
    await ok(r, bob, "release", { lane: a.lane }, { lease: 3 });
    expectRefusal(await act(r, r.admin, "claim", { lane: a.lane }, { scope: ["docs/x.md"], expectedGeneration: 0 }), "scope-overlap");
  });

  it("a room thread (a revert lane, R-REV-6) takes the code-review acts that name room: claim, propose, note, review, land and release", async () => {
    const r = await declaredRoom(v2(() => {}, policy(requireReview({ paths: "src/**", from: "role:admin", id: "rv" }))));
    const bob = await addMember(r, "@bob", "member");
    const revert = async () =>
      String(
        await inDO(r, (room) =>
          room.core.sql.transaction(() => room.core.host().record({ type: "revert-lane", of: "op_land_1" as never, scope: ["src/**"], reason: "abort-after-landing" } as never).act),
        ),
      );
    const lane = await revert();
    expect(await laneRowOf(r, lane)).toMatchObject({ kind: "room", lease_ms: LEASE });
    expect(await ok<Claim>(r, bob, "claim", { lane }, { scope: ["src/**"], expectedGeneration: 0 })).toMatchObject({ effect: { type: "taken-over" } });
    const head = pushChange(r, lane as LaneId, { "src/app.ts": "reverted" });
    await ok(r, bob, "propose", { lane }, { lease: 1, expectedGeneration: 0, head, summary: "revert" });
    await ok(r, r.admin, "note", { lane, generation: 1, head, path: "src/app.ts", line: 1 }, { text: "looks right" });
    await ok(r, r.admin, "review", { lane, generation: 1 }, { head, verdict: "approve", scope: ["src/**"], text: "ok" });
    await ok(r, bob, "land", { lane, generation: 1 }, { lease: 1, head });
    const other = await revert();
    await ok(r, bob, "claim", { lane: other }, { scope: ["src/**"], expectedGeneration: 0 });
    await ok(r, bob, "release", { lane: other }, { lease: 1 });
  });

  it("an entry target is not a thread target: a note on an entry of a thread its threads do not name is admitted; on a line of it, wrong-thread", async () => {
    const r = await declaredRoom(v2((a) => void (a["note"] = { ...a["note"]!, threads: ["room"] })));
    const c = await ok<Claim>(r, r.admin, "claim", null, { goal: "g", scope: ["src/**"] });
    expectOk(await act(r, r.admin, "note", { act: c.id }, { text: "on the entry" }));
    const head = pushChange(r, c.lane as LaneId, { "src/app.ts": "v2" });
    await ok(r, r.admin, "propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" });
    expectRefusal(await act(r, r.admin, "note", { lane: c.lane, generation: 1, head, path: "src/app.ts", line: 1 }, { text: "on a line" }), "wrong-thread");
  });

  it("wrong-thread is recorded at step 7: a thread whose kind the act does not name, a declared act on a recovery thread, and recover on an ordinary one", async () => {
    // `release` here acts only on room threads.
    const r = await declaredRoom(v2((a) => void (a["release"] = { ...a["release"]!, threads: ["room"] })));
    const c = await ok<Claim>(r, r.admin, "claim", null, { goal: "g", scope: ["src/**"] });
    const wt = expectRefusal(await act(r, r.admin, "release", { lane: c.lane }, { lease: 1 }), "wrong-thread");
    expect(wt.act).toBeDefined();
    expect(wt.reason).toBe(`${c.lane} is a claim thread, which release does not act on.`);
    const rec = await ok<Claim>(r, r.admin, "recover", null, { op: "open", goal: "repair", scope: [".artroom/policy.json"] }, { binding: null });
    expect(await laneRowOf(r, rec.lane)).toMatchObject({ kind: "recover", binding: null, lease_ms: LEASE, purpose: "config-recovery" });
    expect(expectRefusal(await act(r, r.admin, "note", { act: rec.id }, { text: "hi" }), "wrong-thread").fix).toContain("recover");
    expectRefusal(await act(r, r.admin, "propose", { lane: rec.lane }, { lease: 1, expectedGeneration: 0, head: "a".repeat(40), summary: "s" }), "wrong-thread");
    expectRefusal(await act(r, r.admin, "recover", { lane: c.lane }, { op: "release", lease: 1 }, { binding: null }), "wrong-thread");
    const roster = String(await inDO(r, (room) => room.core.sql.all("SELECT id FROM entries WHERE lane IS NULL AND seq > 0 ORDER BY seq LIMIT 1")[0]!["id"]));
    expectRefusal(await act(r, r.admin, "recover", { act: roster }, { op: "note", text: "x" }, { binding: null }), "wrong-thread");
  });

  it("a retired opening kind: its held thread with an open version can still be reviewed and released by acts that name it; a new act of it is kind-undeclared", async () => {
    const r = await declaredRoom(v2(() => {}, policy(requireReview({ paths: "src/**", from: "role:admin", id: "rv" }))));
    const bob = await addMember(r, "@bob", "member");
    const c = await ok<Claim>(r, bob, "claim", null, { goal: "g", scope: ["src/**"] });
    const head = pushChange(r, c.lane, { "src/app.ts": "v2" });
    await ok(r, bob, "propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" });
    // claim is retired; `open-work` opens threads now, and the others still name claim threads.
    await activate(
      r,
      v2(
        (a) => {
          const claim = a["claim"]!;
          delete a["claim"];
          a["open-work"] = { ...claim, label: "Open work", threads: ["open-work", "room"] };
          for (const k of ["propose", "note", "review", "check", "land", "release"]) a[k] = { ...a[k]!, threads: ["claim", "open-work", "room"] };
        },
        policy(requireReview({ paths: "src/**", from: "role:admin", id: "rv" })),
      ),
    );
    expectRefusal(await act(r, r.admin, "claim", null, { goal: "g", scope: ["lib/**"] }, { binding: `sha256:${"4".repeat(64)}` }), "kind-undeclared");
    expectOk(await act(r, r.admin, "review", { lane: c.lane, generation: 1 }, { head, verdict: "approve", scope: ["src/**"], text: "ok" }));
    expectOk(await act(r, bob, "release", { lane: c.lane }, { lease: 1 }));
    const w = await ok<Claim>(r, bob, "open-work", null, { goal: "g", scope: ["lib/**"] });
    expect(await laneRowOf(r, w.lane)).toMatchObject({ kind: "open-work" });
  });
});

describe.skipIf(DECLARED)("refusal wording from the declaration (R-DECL-13)", () => {
  it("a platform refusal of a declared act takes the declaration's reason and fix, slots filled; the code is the room's; a rule's refusal keeps its own", async () => {
    const doc = v2(
      (a) => {
        a["release"] = { ...a["release"]!, refusals: { "not-holder": { reason: "{lane} is {holder}'s to let go ({kind}, at {generation}).", fix: "Ask {holder}{reservedFor}." } } };
        a["note"] = { ...a["note"]!, refusals: { "lane-unknown": { reason: "No such entry for {kind}.", fix: "Pick another." } } };
      },
      policy(rule({ id: "quiet", on: ["note"], refuse: "act.body.text = 'shh'", reason: "Rule reason.", fix: "Rule fix." })),
    );
    const r = await declaredRoom(doc);
    const bob = await addMember(r, "@bob", "member");
    const c = await ok<Claim>(r, r.admin, "claim", null, { goal: "g", scope: ["src/**"] });
    const out = expectRefusal(await act(r, bob, "release", { lane: c.lane }, { lease: 1 }), "not-holder");
    expect(out.reason).toBe(`${c.lane} is @admin's to let go (release, at 0).`);
    expect(out.fix).toBe("Ask @admin.");
    // The recorded refusal carries the same words.
    const entry = await inDO(r, (room) => JSON.parse(String(room.core.sql.all("SELECT body FROM entries WHERE id = ?", out.act!)[0]!["body"])));
    expect(entry.entry.receipt.refusal).toMatchObject({ rule: "not-holder", reason: out.reason, fix: out.fix });
    expect(expectRefusal(await act(r, bob, "note", { act: "act_999_00000000" }, { text: "hi" }), "lane-unknown")).toMatchObject({ reason: "No such entry for note.", fix: "Pick another." });
    expect(expectRefusal(await act(r, bob, "note", { act: c.id }, { text: "shh" }), "quiet")).toMatchObject({ reason: "Rule reason.", fix: "Rule fix." });
    // A rule's deterministic failure has a platform code, and still keeps the rule's own text.
    const typed = await declaredRoom(
      v2(
        (a) => void (a["note"] = { ...a["note"]!, refusals: { "policy-type-error": { reason: "Declared {kind} wording.", fix: "Declared fix." } } }),
        policy(rule({ id: "typed", on: ["note"], refuse: "'not a boolean'", reason: "Never shown.", fix: "Never shown." })),
      ),
    );
    const t = await ok<Claim>(typed, typed.admin, "claim", null, { goal: "g", scope: ["src/**"] });
    const err = expectRefusal(await act(typed, typed.admin, "note", { act: t.id }, { text: "hi" }), "policy-type-error");
    expect(err.reason).not.toContain("Declared");
    // An unrecorded refusal is worded too, and an act without wording keeps the platform's.
    expectRefusal(await act(r, bob, "propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head: "a".repeat(40), summary: "s" }), "not-holder");
  });
});

describe.skipIf(DECLARED)("the lease rule (R-DECL-6, R-DECL-9, R-DECL-15)", () => {
  /** The deployment's lease changes, as a deploy with another LEASE_SECONDS would make it. */
  const deployLease = (r: TestRoom, ms: number) => inDO(r, (room) => void ((room.core as unknown as { leaseMs: number }).leaseMs = ms));

  it("a thread records the room's numeric lease at open and keeps it across a restart and a deployment lease change, for renewal and expiry; a new thread takes the new lease", async () => {
    const before = await declaredRoom();
    const c = await ok<Claim>(before, before.admin, "claim", null, { goal: "g", scope: ["src/**"] });
    expect((await laneRowOf(before, c.lane)).lease_ms).toBe(LEASE);
    const r = await restarted(before);
    await deployLease(r, 600_000);
    expect((await laneRowOf(r, c.lane)).lease_ms).toBe(LEASE);
    advance(60_000);
    const renewed = expectOk(await act<{ lease: { expiresAt: string } } & ActRecord>(r, r.admin, "renew", { lane: c.lane }, { lease: 1 }, { binding: null }));
    expect(renewed.lease.expiresAt).toBe(iso(clock.now + LEASE));
    // Any accepted act from the holder renews for the thread's recorded length (R-ADM-11).
    advance(60_000);
    const note = await ok(r, r.admin, "note", { act: c.id }, { text: "still here" });
    expect((note as unknown as { by: unknown }).by).toBeDefined();
    expect((await laneRowOf(r, c.lane)).expires_ms).toBe(clock.now + LEASE);
    const n = await ok<Claim>(r, r.admin, "claim", null, { goal: "new", scope: ["docs/**"] });
    expect(await laneRowOf(r, n.lane)).toMatchObject({ lease_ms: 600_000, expires_ms: clock.now + 600_000 });
    // Expiry at the recorded length: the new thread expires after 600 s, the old one only after 1,800.
    advance(600_000);
    await tick(r);
    expect((await r.admin.read({ q: "lane", lane: n.lane })) as unknown).toMatchObject({ state: "unheld" });
    expect((await r.admin.read({ q: "lane", lane: c.lane })) as unknown).toMatchObject({ state: "held" });
    advance(LEASE - 600_000);
    await tick(r);
    expect((await r.admin.read({ q: "lane", lane: c.lane })) as unknown).toMatchObject({ state: "unheld" });
  });

  it("hold.leaseSeconds is the thread's lease length: renewal and expiry use it; a take-over keeps it", async () => {
    const r = await declaredRoom(v2((a) => void ((a["claim"] as { hold: unknown }).hold = { scope: "body.scope", workspace: true, leaseSeconds: 60 })));
    const bob = await addMember(r, "@bob", "member");
    const c = await ok<Claim>(r, r.admin, "claim", null, { goal: "g", scope: ["src/**"] });
    expect(c.lease.expiresAt).toBe(iso(clock.now + 60_000));
    expect((await laneRowOf(r, c.lane)).lease_ms).toBe(60_000);
    advance(30_000);
    const renewed = expectOk(await act<{ lease: { expiresAt: string } } & ActRecord>(r, r.admin, "renew", { lane: c.lane }, { lease: 1 }, { binding: null }));
    expect(renewed.lease.expiresAt).toBe(iso(clock.now + 60_000));
    advance(61_000);
    await tick(r);
    expect((await r.admin.read({ q: "lane", lane: c.lane })) as unknown).toMatchObject({ state: "unheld" });
    const t = await ok<Claim>(r, bob, "claim", { lane: c.lane }, { scope: ["src/**"], expectedGeneration: 0 });
    expect(t.lease.expiresAt).toBe(iso(clock.now + 60_000));
  });

  it("a v1 thread keeps today's behaviour: no recorded length, and the room's current lease after a deployment change, also once the room is v2", async () => {
    const before = await makeRoom();
    const c = await before.admin.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
    const r = await restarted(before);
    await deployLease(r, 600_000);
    const renewed = await r.admin.ok<{ lease: { expiresAt: string } } & ActRecord>("renew", { lane: c.lane }, { lease: 1 });
    expect(renewed.lease.expiresAt).toBe(iso(clock.now + 600_000));
    await activate(r, v2());
    expect((await laneRowOf(r, c.lane)).lease_ms).toBeNull();
    await deployLease(r, 900_000);
    const again = expectOk(await act<{ lease: { expiresAt: string } } & ActRecord>(r, r.admin, "renew", { lane: c.lane }, { lease: 1 }, { binding: null }));
    expect(again.lease.expiresAt).toBe(iso(clock.now + 900_000));
  });

  it("a revert thread opened under a v2 document records the room's lease; under a v1 document it records none", async () => {
    const rows = async (r: TestRoom) => inDO(r, (room) => room.core.sql.all("SELECT kind, lease_ms FROM lanes WHERE revert_of IS NOT NULL"));
    const open = (r: TestRoom) =>
      inDO(r, (room) =>
        room.core.sql.transaction(() => room.core.host().record({ type: "revert-lane", of: "op_land_1" as never, scope: ["src/**"], reason: "abort-after-landing" } as never)),
      );
    const d = await declaredRoom();
    await open(d);
    expect(await rows(d)).toEqual([{ kind: "room", lease_ms: LEASE }]);
    const l = await makeRoom();
    await open(l);
    expect(await rows(l)).toEqual([{ kind: "room", lease_ms: null }]);
  });
});

describe.skipIf(DECLARED)("recover, the platform kind (R-DECL-21)", () => {
  it("an admin's own key opens, versions, approves and lands a recovery thread; any other signer is admin-required; a legacy recovery lane takes recover ops after the first v2 activation", async () => {
    const r = await makeRoom();
    const bob = await addMember(r, "@bob", "member");
    const legacy = await r.admin.ok<Claim>("claim", null, { goal: "repair", scope: [".artroom/policy.json"], purpose: "config-recovery" });
    await activate(r, v2());
    expect(expectRefusal(await act(r, r.admin, "claim", { lane: legacy.lane }, { scope: [".artroom/policy.json"], expectedGeneration: 0, lease: 1 }), "wrong-thread").reason).toContain("configuration-recovery");
    const head = pushChange(r, legacy.lane, { ".artroom/policy.json": JSON.stringify(v2()) + "\n" });
    expectRefusal(await act(r, bob, "recover", { lane: legacy.lane }, { op: "version", lease: 1, expectedGeneration: 0, head, summary: "s" }, { binding: null }), "not-holder");
    const p = await ok(r, r.admin, "recover", { lane: legacy.lane }, { op: "version", lease: 1, expectedGeneration: 0, head, summary: "repair" }, { binding: null });
    expect(p).toMatchObject({ kind: "recover", op: "version", flags: ["config-recovery"] });
    const approve = await ok(r, r.admin, "recover", { lane: legacy.lane, generation: 1 }, { op: "approve", head, verdict: "approve", scope: [".artroom/**"], text: "ok" }, { binding: null });
    expect((approve as unknown as { flags: string[] }).flags).toEqual(expect.arrayContaining(["config-recovery", "sole-admin-self-approval"]));
    const l = await ok(r, r.admin, "recover", { lane: legacy.lane, generation: 1 }, { op: "land", lease: 1, head }, { binding: null });
    await tick(r, 3);
    expect(await inDO(r, (room) => room.core.landing.view((l as unknown as { op: { id: string } }).op.id as never)?.state)).toBe("landed");
    // A new recovery thread: non-admins and delegations are admin-required, recorded; scope outside .artroom is recovery-scope.
    expectRefusal(await act(r, bob, "recover", null, { op: "open", goal: "g", scope: [".artroom/policy.json"] }, { binding: null }), "admin-required");
    const k = newKeyPair();
    const grant = await ok<RosterRecord>(r, r.admin, "roster", null, { op: "delegate", to: k.key, kinds: ["renew"], acts: { claim: (await bindingIn(r, "claim"))! }, lanes: "*", expiresAt: iso(clock.now + day) }, { binding: null });
    expect(expectRefusal(await act(r, new Client(r, k, grant.id), "recover", null, { op: "open", goal: "g", scope: [".artroom/x"] }, { binding: null }), "admin-required").act).toBeDefined();
    expectRefusal(await act(r, r.admin, "recover", null, { op: "open", goal: "g", scope: ["src/**"] }, { binding: null }), "recovery-scope");
    // A recover body is closed per op.
    expectRefusal(await act(r, r.admin, "recover", null, { op: "open", goal: "g", scope: [".artroom/x"], purpose: "config-recovery" }, { binding: null }), "invalid-body");
  });
});

describe.skipIf(DECLARED)("R-DECL-24 at propose time, and the stage-4 steps", () => {
  async function proposeDoc(r: TestRoom, doc: unknown, checkers: Record<string, unknown> = {}): Promise<ActRecord | Refusal> {
    const c = await ok<Claim>(r, r.admin, "claim", null, { goal: "policy", scope: [".artroom/**"] });
    const files: Record<string, string> = { ".artroom/policy.json": JSON.stringify(doc) };
    for (const [n, cfg] of Object.entries(checkers)) files[`.artroom/checkers/${n}.json`] = JSON.stringify(cfg);
    const head = pushChange(r, c.lane, files);
    return act(r, r.admin, "propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "policy" });
  }

  it("a v2 document is validated by the acts validator with the room's historical opening kinds; a v1 checker configuration in it is refused", async () => {
    const r = await declaredRoom();
    const bad = v2((a) => void (a["release"] = { ...a["release"]!, threads: ["claim", "chore"] }));
    expect(expectRefusal(await proposeDoc(r, bad), "policy-invalid").reason).toContain("chore is not room");
    expect(expectRefusal(await proposeDoc(r, v2(), { unit: { format: "artroom-checker-v1", volatile: false, timeoutSeconds: 60 } }), "policy-invalid").reason).toContain("checkers.unit");
    expectOk(await proposeDoc(r, v2(), { unit: { format: "artroom-checker-v2", act: "check", volatile: false, timeoutSeconds: 60 } }));
    // A kind that has opened a thread here is a valid name in threads after it is retired (a historical opening kind).
    const withTask = v2((a) => void (a["task"] = { ...a["claim"]!, label: "Task", threads: ["task"] }));
    const t = await declaredRoom(withTask);
    await ok<Claim>(t, t.admin, "task", null, { goal: "a task", scope: ["docs/**"] });
    const retired = v2((a) => void (a["release"] = { ...a["release"]!, threads: ["claim", "task", "room"] }));
    expectOk(await proposeDoc(t, retired));
    // The same document where no task thread ever opened is policy-invalid.
    expect(expectRefusal(await proposeDoc(r, retired), "policy-invalid").reason).toContain("task is not room");
  });

  it("a document that uses a step or hold setting this room runs only from stage 4 is policy-invalid at propose time", async () => {
    const r = await declaredRoom();
    const cases: [string, PolicyDocumentV2][] = [
      ["then land in one act", v2((a) => void (a["propose"] = { ...a["propose"]!, targets: { thread: ["version", "land"] } }))],
      [
        "the step hand-over",
        v2((a) => {
          (a["claim"] as { hold: unknown }).hold = { scope: "body.scope", workspace: true, reserveSeconds: 60 };
          a["pass"] = { label: "Pass", targets: { thread: ["hand-over"] }, threads: ["claim"], who: { roles: ["member"] } };
        }),
      ],
      ["a comment on target none", v2((a) => void (a["note"] = { ...a["note"]!, targets: { none: ["comment"], entry: ["comment"], line: ["comment"] } }))],
      ["a scope template", v2((a) => void ((a["claim"] as { hold: unknown }).hold = { scope: ["src/**"], workspace: true }))],
      ["hold.conflict", v2((a) => void ((a["claim"] as { hold: unknown }).hold = { scope: "body.scope", workspace: true, conflict: "exclusive" }))],
      ["hold.reserveSeconds", v2((a) => void ((a["claim"] as { hold: unknown }).hold = { scope: "body.scope", workspace: true, reserveSeconds: 60 }))],
      ["a hold without a workspace", v2((a) => void ((a["claim"] as { hold: unknown }).hold = { scope: "body.scope" }))],
    ];
    for (const [what, doc] of cases) {
      const parsed = await inDO(r, (room) => room.core.parseConfig(JSON.stringify(doc), {}));
      expect(parsed.ok).toBe(false);
      expect((parsed as unknown as { problems: string[] }).problems.some((p) => p.endsWith(`${what} is not run by this room until declared acts stage 4`))).toBe(true);
    }
    expect(expectRefusal(await proposeDoc(r, cases[0]![1]), "policy-invalid").reason).toContain("version then land in one act is not run by this room until declared acts stage 4");
  });

  it("a workspace request is judged as for an act with step version on the thread (R-CRED-5 as amended)", async () => {
    const r = await declaredRoom(v2((a) => void (a["propose"] = { ...a["propose"]!, threads: ["room"] })));
    const c = await ok<Claim>(r, r.admin, "claim", null, { goal: "g", scope: ["src/**"] });
    expect(expectRefusal(await r.admin.request({ kind: "workspace", lane: c.lane, lease: 1 }), "wrong-thread").reason).toContain("No declared act makes versions");
    const ok2 = await declaredRoom();
    const c2 = await ok<Claim>(ok2, ok2.admin, "claim", null, { goal: "g", scope: ["src/**"] });
    expectOk(await ok2.admin.request({ kind: "workspace", lane: c2.lane, lease: 1 }));
    const bob = await addMember(ok2, "@bob", "member");
    expectRefusal(await bob.request({ kind: "workspace", lane: c2.lane, lease: 1 }), "not-holder");
  });
});

describe.skipIf(DECLARED)("migration 4 (thread kind, binding and lease; grant maps)", () => {
  for (const from of [1, 2, 3] as const)
    it(`a room stored at version ${from}, reopened: the columns are added, every lane gets its kind, binding and lease stay null, and reopening again changes nothing`, async () => {
      const r = await makeRoom();
      const c = await r.admin.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
      const k = newKeyPair();
      await r.admin.ok("roster", null, { op: "delegate", to: k.key, kinds: ["renew"], lanes: "*", expiresAt: iso(clock.now + day) });
      await inDO(r, (room) => {
        const sql = room.core.sql;
        sql.all("INSERT INTO lanes (id, seq, purpose, goal, plan, scope, generation, lease_gen, holder, expires_ms, state, why, handover, revert_of, kind) VALUES ('act_99_aaaaaaaa', 99, 'ordinary', 'r', NULL, '[\"**\"]', 0, 0, NULL, NULL, 'unheld', 'opened-by-room', NULL, 'op_land_1', 'room')");
        // The store as version `from` had it: without the four columns.
        for (const [table, column] of [["lanes", "kind"], ["lanes", "binding"], ["lanes", "lease_ms"], ["delegations", "acts"]]) sql.all(`ALTER TABLE ${table} DROP COLUMN ${column}`);
        sql.all("UPDATE schema_version SET v = ? WHERE id = 1", from);
      });
      const r2 = await restarted(r);
      const after = await inDO(r2, (room) => ({
        v: room.core.sql.all("SELECT v FROM schema_version WHERE id = 1")[0]!["v"],
        lanes: room.core.sql.all("SELECT id, kind, binding, lease_ms FROM lanes ORDER BY seq"),
        delegations: room.core.sql.all("SELECT acts FROM delegations"),
      }));
      expect(after).toEqual({
        v: 4,
        lanes: [
          { id: c.lane, kind: "claim", binding: null, lease_ms: null },
          { id: "act_99_aaaaaaaa", kind: "room", binding: null, lease_ms: null },
        ],
        delegations: [{ acts: null }],
      });
      // The legacy lane works as before: renewed by the room's lease.
      expect((await r2.admin.ok<{ lease: { expiresAt: string } } & ActRecord>("renew", { lane: c.lane }, { lease: 1 })).lease.expiresAt).toBe(iso(clock.now + LEASE));
      // Reopened at version 4, the step does not run again and nothing changes.
      const r3 = await restarted(r2);
      expect(await inDO(r3, (room) => room.core.sql.all("SELECT id, kind, binding, lease_ms FROM lanes ORDER BY seq"))).toEqual(after.lanes);
    });

  it("migration 4 is idempotent: run twice on one store, it adds each column once", async () => {
    const r = await makeRoom();
    const out = await inDO(r, async (room) => {
      const { ROOM_MIGRATIONS } = await import("../../src/store.ts");
      const step = ROOM_MIGRATIONS.find((m) => m.version === 4)!;
      room.core.sql.transaction(() => step.up(room.core.sql));
      return room.core.sql.all("SELECT name FROM pragma_table_info('lanes') WHERE name IN ('kind', 'binding', 'lease_ms') ORDER BY name");
    });
    expect(out).toEqual([{ name: "binding" }, { name: "kind" }, { name: "lease_ms" }]);
  });
});
