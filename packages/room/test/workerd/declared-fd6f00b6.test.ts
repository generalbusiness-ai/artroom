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

  it("exact retry across a change of shape: an accepted note on an entry, retried after its declaration lost the entry target, and an accepted claim, retried after the room returned to a v1 document, get their original receipts; nothing else is answered", async () => {
    const r = await declaredRoom();
    const c = await ok<Claim>(r, r.admin, "claim", null, { goal: "g", scope: ["src/**"] });
    const note = await signed(r, r.admin, "note", { act: c.id }, { text: "hello" });
    const first = expectOk(await call<ActRecord | Refusal>(r.stub.submit(note)));
    await activate(r, v2((a) => void (a["note"] = { ...a["note"]!, targets: { line: ["comment"] } })));
    const seq = await headSeq(r);
    expect(await call(r.stub.submit(note))).toEqual(first);
    // A new note on an entry is not in this vocabulary: bad-request at step 1, as before.
    const fresh = await signed(r, r.admin, "note", { act: c.id }, { text: "again" });
    expect((await failure(r.stub.submit(fresh))).code).toBe("bad-request");
    // Another body under the same key is another act, as ever; another signature on the same envelope is not authentic.
    const sameKey = await signed(r, r.admin, "note", { act: c.id }, { text: "other" }, { ikey: (note.envelope as unknown as { idempotencyKey: string }).idempotencyKey });
    expectRefusal(await call(r.stub.submit(sameKey)), "idempotency-mismatch");
    expect((await failure(r.stub.submit({ envelope: note.envelope, sig: fresh.sig } as never))).code).toBe("unauthenticated");
    // The room returns to a v1 document: a v: 2 envelope is bad-request there, but the accepted one keeps its receipt.
    const binding = (await bindingIn(r, "claim"))!;
    const claim = await signed(r, r.admin, "claim", null, { goal: "h", scope: ["docs/**"] });
    const accepted = expectOk(await call<ActRecord | Refusal>(r.stub.submit(claim)));
    await activate(r, policy());
    const seq1 = await headSeq(r);
    expect(await call(r.stub.submit(claim))).toEqual(accepted);
    const late = await signed(r, r.admin, "claim", null, { goal: "i", scope: ["lib/**"] }, { binding });
    expect(await failure(r.stub.submit(late))).toMatchObject({ code: "bad-request", message: "envelope.binding is not a field of this type." });
    // Here step 1 fails before idempotency is asked, so the room looks the retry up itself: only the exact envelope,
    // with its own signature, is answered. Another body under the same key, and another signature, stay bad-request.
    const other = await signed(r, r.admin, "claim", null, { goal: "other", scope: ["docs/**"] }, { binding, ikey: (claim.envelope as unknown as { idempotencyKey: string }).idempotencyKey });
    expect((await failure(r.stub.submit(other))).code).toBe("bad-request");
    expect((await failure(r.stub.submit({ envelope: claim.envelope, sig: late.sig } as never))).code).toBe("bad-request");
    // Nor the exact envelope and signature with an extra outer field: the outer shape is closed for a retry as for a new act.
    expect((await failure(r.stub.submit({ ...claim, extra: 1 } as never))).code).toBe("bad-request");
    expect(await call(r.stub.submit(claim))).toEqual(accepted);
    expect(seq1).toBeGreaterThan(seq);
    expect(await headSeq(r)).toBe(seq1);
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

  it("a grant's plain kinds are bound by the grantor's role: a checker, who may not sign renew, may not grant it by a delegation, nor be invited with a session that lists it; nothing is recorded", async () => {
    const r = await declaredRoom();
    const ci = await addMember(r, "@ci", "checker");
    const k = newKeyPair();
    const seq = await headSeq(r);
    expect(expectRefusal(await act(r, ci, "roster", null, await delegateOp(r, k.key, {}, ["renew"]), { binding: null }), "delegation-invalid").reason).toBe("The role checker may not grant renew.");
    const session = { kinds: ["renew"], acts: {}, lanes: "*", ttlSeconds: 3600 };
    const invite = { op: "invite", member: "@bot", role: "checker", custody: "room", expiresAt: iso(clock.now + day), secretHash: digestBytes(randomBytes(32)), session };
    expect(expectRefusal(await act(r, r.admin, "roster", null, invite, { binding: null }), "invalid-body").reason).toBe("The role checker may not sign every kind the session lists.");
    expect(await headSeq(r)).toBe(seq);
    // The same grant from a role that may sign renew is admitted.
    expectOk(await act(r, r.admin, "roster", null, await delegateOp(r, k.key, {}, ["renew"]), { binding: null }));
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

  it("a room-custody invitation with no session grants renew and no declared kind: its bearer's renew is admitted, and its claim is delegation-invalid, unrecorded, because the delegation covers no declared kind", async () => {
    const r = await declaredRoom();
    const bytes = randomBytes(32);
    const inv = await ok<RosterRecord>(r, r.admin, "roster", null, { op: "invite", member: "@agent", role: "agent", custody: "room", expiresAt: iso(clock.now + day), secretHash: digestBytes(bytes) }, { binding: null });
    const b = await call<Redeemed>(r.stub.redeem({ custody: "room", invitation: inv.id, secret: b64url(bytes) }, "x"));
    const d = (await r.admin.read({ q: "members" })).delegations.find((x) => x.id === b.delegation)!;
    expect(d).toMatchObject({ kinds: ["renew"], acts: {} });
    const seq = await headSeq(r);
    const refused = expectRefusal(await call(r.stub.bearerAct(b.bearer, { kind: "claim", target: null, body: { goal: "g", scope: ["src/**"] }, idempotencyKey: "b1" })), "delegation-invalid");
    expect(refused.reason).toBe(`Delegation ${b.delegation} does not cover claim.`);
    expect(refused.act).toBeUndefined();
    expect(await headSeq(r)).toBe(seq);
    // The same member holds a thread through a second session, whose map names claim. The first session, which was
    // granted renew alone, renews that thread: renew is the one kind it covers.
    const more = randomBytes(32);
    const second = await ok<RosterRecord>(
      r,
      r.admin,
      "roster",
      null,
      { op: "invite", member: "@agent", custody: "room", expiresAt: iso(clock.now + day), secretHash: digestBytes(more), session: { kinds: ["renew"], acts: { claim: (await bindingIn(r, "claim"))! }, lanes: "*", ttlSeconds: 3600 } },
      { binding: null },
    );
    const holder = await call<Redeemed>(r.stub.redeem({ custody: "room", invitation: second.id, secret: b64url(more) }, "x"));
    const c = expectOk(await call<Claim | Refusal>(r.stub.bearerAct(holder.bearer, { kind: "claim", target: null, body: { goal: "g", scope: ["src/**"] }, idempotencyKey: "b2" })));
    advance(60_000);
    const renewed = expectOk(await call<ActRecord | Refusal>(r.stub.bearerAct(b.bearer, { kind: "renew", target: { lane: c.lane }, body: { lease: c.lease.generation }, idempotencyKey: "b3" })));
    expect(renewed).toMatchObject({ kind: "renew", by: { via: "delegation", member: "@agent", delegation: b.delegation }, lease: { expiresAt: iso(clock.now + LEASE) } });
    // Still no declared kind: a release of the thread it just renewed is not covered either.
    expect(expectRefusal(await call(r.stub.bearerAct(b.bearer, { kind: "release", target: { lane: c.lane }, body: { lease: c.lease.generation }, idempotencyKey: "b4" })), "delegation-invalid").reason).toBe(`Delegation ${b.delegation} does not cover release.`);
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

  it("who.delegable is judged at each use: a kind made non-delegable after a grant, its binding unchanged, is no longer covered; the grantor's own key still signs it", async () => {
    const r = await declaredRoom();
    const bob = await addMember(r, "@bob", "member");
    const k = newKeyPair();
    const grant = await ok<RosterRecord>(r, bob, "roster", null, await delegateOp(r, k.key, { claim: (await bindingIn(r, "claim"))! }), { binding: null });
    const before = await bindingIn(r, "claim");
    const d = new Client(r, k, grant.id);
    await ok<Claim>(r, d, "claim", null, { goal: "g", scope: ["src/**"] });
    await activate(r, v2((a) => void (a["claim"] = { ...a["claim"]!, who: { roles: ["maintainer", "member", "agent"], delegable: false } })));
    expect(await bindingIn(r, "claim")).toBe(before);
    const out = expectRefusal(await act(r, d, "claim", null, { goal: "g", scope: ["docs/**"] }), "delegation-invalid");
    expect(out.reason).toBe("claim may not be delegated.");
    expect(out.act).toBeUndefined();
    await ok<Claim>(r, bob, "claim", null, { goal: "g", scope: ["docs/**"] });
  });

  it("an invitation whose session names declared kinds, redeemed after the room returned to a v1 document, is refused binding-stale and stays unused; a session that names only renew is redeemed", async () => {
    const r = await declaredRoom();
    const invite = async (member: string, acts: Record<string, string>) => {
      const bytes = randomBytes(32);
      const session = { kinds: ["renew"], acts, lanes: "*", ttlSeconds: 3600 };
      const inv = await ok<RosterRecord>(r, r.admin, "roster", null, { op: "invite", member, role: "agent", custody: "room", expiresAt: iso(clock.now + day), secretHash: digestBytes(bytes), session }, { binding: null });
      return { id: inv.id, secret: b64url(bytes) };
    };
    const withClaim = await invite("@one", { claim: (await bindingIn(r, "claim"))! });
    const renewOnly = await invite("@two", {});
    await activate(r, policy());
    const seq = await headSeq(r);
    const refused = expectRefusal(await call(r.stub.redeem({ custody: "room", invitation: withClaim.id as never, secret: withClaim.secret }, "x")), "binding-stale");
    expect(refused.reason).toContain("declares no acts");
    expect(refused.current).toEqual({ policy: await inDO(r, (room) => room.core.activePolicy().version) });
    expect(await headSeq(r)).toBe(seq);
    expect(await inDO(r, (room) => room.core.sql.all("SELECT used FROM invitations WHERE id = ?", withClaim.id)[0]!["used"])).toBeNull();
    const b = await call<Redeemed>(r.stub.redeem({ custody: "room", invitation: renewOnly.id as never, secret: renewOnly.secret }, "x"));
    expect((await r.admin.read({ q: "members" })).delegations.find((x) => x.id === b.delegation)!.kinds).toEqual(["renew"]);
  });

  it("an invitation admitted under a v2 document never gains a kind: with no session, redeemed after the room returned to v1, it grants renew and no legacy kind", async () => {
    const r = await declaredRoom();
    const bytes = randomBytes(32);
    const inv = await ok<RosterRecord>(r, r.admin, "roster", null, { op: "invite", member: "@agent", role: "agent", custody: "room", expiresAt: iso(clock.now + day), secretHash: digestBytes(bytes) }, { binding: null });
    await activate(r, policy());
    const b = await call<Redeemed>(r.stub.redeem({ custody: "room", invitation: inv.id, secret: b64url(bytes) }, "x"));
    expect((await r.admin.read({ q: "members" })).delegations.find((x) => x.id === b.delegation)!.kinds).toEqual(["renew"]);
    expectRefusal(await call(r.stub.bearerAct(b.bearer, { kind: "claim", target: null, body: { goal: "g", scope: ["src/**"] }, idempotencyKey: "b1" })), "delegation-invalid");
    // The control: an invitation with no session admitted under a v1 document is the legacy `*`, as it always was.
    const legacy = await makeRoom();
    const lb = randomBytes(32);
    const linv = await legacy.admin.ok<RosterRecord>("roster", null, { op: "invite", member: "@agent", role: "agent", custody: "room", expiresAt: iso(clock.now + day), secretHash: digestBytes(lb) });
    const lr = await call<Redeemed>(legacy.stub.redeem({ custody: "room", invitation: linv.id, secret: b64url(lb) }, "x"));
    expectOk(await call(legacy.stub.bearerAct(lr.bearer, { kind: "claim", target: null, body: { goal: "g", scope: ["src/**"] }, idempotencyKey: "b1" })));
  });

  it("bearer acts carry the named tools' code-review binding: admitted where claim means the code-review claim; where the room's claim differs, delegation-invalid at step 4 under a grant for the room's meaning, and binding-stale at step 4a under a grant for the code-review meaning; a binding the caller names is used as given", async () => {
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
    const changed = () => v2((x) => void ((x["claim"] as { hold: unknown }).hold = { scope: "body.scope", workspace: true, leaseSeconds: 600 }));
    const claim = (ikey: string) => ({ kind: "claim", target: null, body: { goal: "g", scope: ["src/**"] }, idempotencyKey: ikey }) as const;
    const same = await declaredRoom();
    const codeReview = (await bindingIn(same, "claim"))!;
    const a = await grantFor(same);
    const first = expectOk(await call<Claim | Refusal>(same.stub.bearerAct(a.bearer, claim("b1"))));
    // The act the room built carries the code-review binding, which here is the room's own.
    expect(await inDO(same, (room) => (JSON.parse(String(room.core.sql.all("SELECT body FROM entries WHERE id = ?", first.id)[0]!["body"])) as { entry: { act: { envelope: Record<string, unknown> } } }).entry.act.envelope)).toMatchObject({ v: 2, kind: "claim", binding: codeReview });
    // A room whose claim differs, and a grant admitted there, so for the room's meaning: the tool's binding is not
    // the one the grant names, and the delegation does not cover it (step 4, before step 4a).
    const other = await declaredRoom(changed());
    expect(await bindingIn(other, "claim")).not.toBe(codeReview);
    const o = await grantFor(other);
    expect(expectRefusal(await call(other.stub.bearerAct(o.bearer, claim("b1"))), "delegation-invalid").reason).toBe("The delegation was granted for an earlier meaning of claim.");
    // A binding the bearer act names itself is used as given.
    expectOk(await call(other.stub.bearerAct(o.bearer, { ...claim("b2"), binding: (await bindingIn(other, "claim"))! })));
    // The grant names the code-review meaning, and the room's claim changes after it: the tool's binding is the
    // grant's, so step 4 passes, and step 4a refuses it binding-stale with the binding now in force. Not recorded.
    const moved = await declaredRoom();
    const m = await grantFor(moved);
    await activate(moved, changed());
    const seq = await headSeq(moved);
    const stale = expectRefusal(await call(moved.stub.bearerAct(m.bearer, claim("b1"))), "binding-stale");
    expect(stale.reason).toContain(`The act was prepared for claim as ${codeReview}`);
    expect(stale.current).toMatchObject({ binding: await bindingIn(moved, "claim") });
    expect(stale.act).toBeUndefined();
    expect(await headSeq(moved)).toBe(seq);
  });

  it("a bearer session's exact retry across a change of vocabulary gets its original result: the room builds the act as it built it the first time", async () => {
    const redeemed = async (r: TestRoom, session: unknown, signing?: { binding: null }) => {
      const bytes = randomBytes(32);
      const op = { op: "invite", member: "@agent", role: "agent", custody: "room", expiresAt: iso(clock.now + day), secretHash: digestBytes(bytes), session };
      const inv = signing ? await ok<RosterRecord>(r, r.admin, "roster", null, op, signing) : await r.admin.ok<RosterRecord>("roster", null, op as never);
      return call<Redeemed>(r.stub.redeem({ custody: "room", invitation: inv.id, secret: b64url(bytes) }, "x"));
    };
    const claim = { kind: "claim", target: null, body: { goal: "g", scope: ["src/**"] }, idempotencyKey: "retry-1" };
    // From v1 to v2: the first attempt was a v: 1 envelope with no binding.
    const r = await makeRoom();
    const b = await redeemed(r, { kinds: ["claim", "renew"], lanes: "*", ttlSeconds: 3600 });
    const first = expectOk(await call(r.stub.bearerAct(b.bearer, claim as never)));
    await activate(r, v2());
    const seq = await headSeq(r);
    expect(await call(r.stub.bearerAct(b.bearer, claim as never))).toEqual(first);
    expect(await headSeq(r)).toBe(seq);
    // The same key with another body is idempotency-mismatch, as ever; a new act is judged under the v2 document.
    expectRefusal(await call(r.stub.bearerAct(b.bearer, { ...claim, body: { goal: "other", scope: ["src/**"] } } as never)), "idempotency-mismatch");
    expectRefusal(await call(r.stub.bearerAct(b.bearer, { ...claim, idempotencyKey: "new-1", body: { goal: "h", scope: ["docs/**"] } } as never)), "delegation-invalid");
    // From v2 to v1: the first attempt was a v: 2 envelope with the code-review binding.
    const d = await declaredRoom();
    const db = await redeemed(d, { kinds: ["renew"], acts: { claim: (await bindingIn(d, "claim"))! }, lanes: "*", ttlSeconds: 3600 }, { binding: null });
    const dFirst = expectOk(await call(d.stub.bearerAct(db.bearer, claim as never)));
    await activate(d, policy());
    expect(await call(d.stub.bearerAct(db.bearer, claim as never))).toEqual(dFirst);
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

describe.skipIf(DECLARED)("what policy sees of a thread (R-EVAL-3 as amended)", () => {
  it("a refuse rule's input: under a v2 document the lane carries the thread's kind, and null where there is no thread; under a v1 document it carries no kind", async () => {
    const rules = policy(
      rule({ id: "no-notes-on-claims", on: ["note"], refuse: "lane.kind = 'claim'", reason: "No notes on claim threads.", fix: "None." }),
      rule({ id: "lane-has-kind", on: ["claim"], refuse: "$exists(lane.kind) and act.body.goal = 'probe'", reason: "The lane input has a kind.", fix: "None." }),
    );
    const r = await declaredRoom(v2(() => {}, rules));
    const bob = await addMember(r, "@bob", "member");
    const c = await ok<Claim>(r, bob, "claim", null, { goal: "g", scope: ["src/**"] });
    expect(expectRefusal(await act(r, bob, "note", { act: c.id }, { text: "hello" }), "no-notes-on-claims").reason).toBe("No notes on claim threads.");
    // With no thread, the kind is null: present in the input, so `$exists` sees it.
    expect(expectRefusal(await act(r, bob, "claim", null, { goal: "probe", scope: ["docs/**"] }), "lane-has-kind").reason).toBe("The lane input has a kind.");
    // The same rules under a v1 document: the input has no kind, so neither rule refuses.
    const legacy = await makeRoom({ policy: rules });
    const al = await addMember(legacy, "@al", "member");
    const lc = await al.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
    expectOk(await al.act("note", { act: lc.id }, { text: "hello" }));
    expectOk(await al.act("claim", null, { goal: "probe", scope: ["docs/**"] }));
  });

  it("the require, land and notify inputs carry the thread's kind under a v2 document, so a rule of each sort can read it; under a v1 document they carry none, and the same rules do nothing", async () => {
    const rules = policy(
      requireReview({ paths: "src/**", from: "role:admin", id: "rv", when: "lane.kind = 'claim'" }),
      rule({ id: "claims-stay", kind: "land", block: "lane.kind = 'claim'", reason: "Claim threads do not land here.", fix: "None." }),
      rule({ id: "tell-admins", kind: "notify", on: ["claim"], when: "lane.kind = 'claim'", to: ["role:admin"], why: "A claim thread opened." }),
    );
    const told = async (r: TestRoom) => (await r.admin.read({ q: "attention" })).items.filter((i) => i.why === "policy").length;
    const obligations = async (r: TestRoom, lane: LaneId) => (await r.admin.read({ q: "proposal", ref: { lane, generation: 1 } }))!.obligations.map((o) => o.id);
    // v2: each rule reads the kind.
    const r = await declaredRoom(v2(() => {}, rules));
    const bob = await addMember(r, "@bob", "member");
    const c = await ok<Claim>(r, bob, "claim", null, { goal: "g", scope: ["src/**"] });
    await tick(r, 2);
    expect(await told(r)).toBe(1);
    const head = pushChange(r, c.lane, { "src/app.ts": "v2" });
    await ok(r, bob, "propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" });
    expect(await obligations(r, c.lane)).toEqual(["obl_rv"]);
    await ok(r, r.admin, "review", { lane: c.lane, generation: 1 }, { head, verdict: "approve", scope: ["src/**"], text: "ok" });
    expect(expectRefusal(await act(r, bob, "land", { lane: c.lane, generation: 1 }, { lease: 1, head }), "claims-stay").reason).toBe("Claim threads do not land here.");
    // v1: the inputs have no kind, so no one is told, nothing is required, and the version lands.
    const legacy = await makeRoom({ policy: rules });
    const al = await addMember(legacy, "@al", "member");
    const lc = await al.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
    await tick(legacy, 2);
    expect(await told(legacy)).toBe(0);
    const lhead = pushChange(legacy, lc.lane, { "src/app.ts": "v2" });
    await al.ok("propose", { lane: lc.lane }, { lease: 1, expectedGeneration: 0, head: lhead, summary: "s" });
    expect(await obligations(legacy, lc.lane)).toEqual([]);
    const l = await al.ok("land", { lane: lc.lane, generation: 1 }, { lease: 1, head: lhead });
    await tick(legacy, 6);
    expect(await inDO(legacy, (room) => room.core.landing.view((l as unknown as { op: { id: string } }).op.id as never)?.state)).toBe("landed");
  });
});

describe.skipIf(DECLARED)("a declared act's body is the application's own (R-DECL-12, R-DECL-21)", () => {
  it("a declared field named purpose never selects configuration recovery, and a goal declared as a number reaches the thread's row as empty text", async () => {
    const doc = v2(
      (a) => {
        a["claim"] = {
          ...a["claim"]!,
          body: { goal: { type: "int", min: 0, max: 9, requiredFor: ["none"] }, purpose: { type: "enum", values: ["config-recovery", "demo"], optional: true } },
        };
      },
      policy(rule({ id: "no-zero", on: ["claim"], refuse: "act.body.goal = 0", reason: "Rule reason.", fix: "Rule fix." })),
    );
    const r = await declaredRoom(doc);
    const bob = await addMember(r, "@bob", "member");
    // A member, not an admin: under the legacy reading this body would be an admin-only recovery claim.
    const c = await ok<Claim>(r, bob, "claim", null, { goal: 7, purpose: "config-recovery", scope: ["src/**"] });
    expect(c.purpose).toBe("ordinary");
    expect(await laneRowOf(r, c.lane)).toMatchObject({ kind: "claim", purpose: "ordinary" });
    expect(await inDO(r, (room) => room.core.sql.all("SELECT goal FROM lanes WHERE id = ?", c.lane)[0]!["goal"])).toBe("");
    // Policy still judges it, whoever signs: recovery's bypass of refuse rules is not reachable from a declared field.
    expectRefusal(await act(r, r.admin, "claim", null, { goal: 0, purpose: "config-recovery", scope: ["docs/**"] }), "no-zero");
  });

  it("plan, summary and text declared as other types are admitted as declared and never reach the room's rows or records as anything but text: a number plan is no plan, a number summary and a true text are empty text, and an enum text is its own value", async () => {
    const doc = v2((a) => {
      a["claim"] = { ...a["claim"]!, body: { goal: { type: "text", max: 10, requiredFor: ["none"] }, plan: { type: "int", min: 0, max: 9, optional: true } } };
      a["propose"] = { ...a["propose"]!, body: { summary: { type: "int", min: 0, max: 9 } } };
      a["note"] = { ...a["note"]!, body: { text: { type: "bool" } } };
      a["review"] = { ...a["review"]!, body: { text: { type: "enum", values: ["fine", "poor"] } } };
    }, policy(requireReview({ paths: "src/**", from: "role:admin", id: "rv" })));
    const r = await declaredRoom(doc);
    const bob = await addMember(r, "@bob", "member");
    const c = await ok<Claim>(r, bob, "claim", null, { goal: "g", plan: 7, scope: ["src/**"] });
    expect("plan" in c).toBe(false);
    // The declared types are the ones admitted: text where the declaration says a number is invalid-body.
    expectRefusal(await act(r, r.admin, "claim", null, { goal: "g", plan: "a plan", scope: ["docs/**"] }), "invalid-body");
    const head = pushChange(r, c.lane, { "src/app.ts": "v2" });
    expectRefusal(await act(r, bob, "propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "words" }), "invalid-body");
    const p = await ok(r, bob, "propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: 3 });
    expect((p as unknown as { summary: unknown }).summary).toBe("");
    const n = await ok(r, r.admin, "note", { act: p.id }, { text: true });
    expect((n as unknown as { text: unknown }).text).toBe("");
    const rv = await ok(r, r.admin, "review", { lane: c.lane, generation: 1 }, { head, verdict: "approve", scope: ["src/**"], text: "fine" });
    // An enum's value is text already, and is kept as that text.
    expect((rv as unknown as { text: unknown }).text).toBe("fine");
    // A take-over that names a number plan leaves the thread with no plan.
    const take = await ok<Claim>(r, bob, "claim", { lane: c.lane }, { scope: ["src/**"], expectedGeneration: 1, lease: 1, plan: 5 });
    expect("plan" in take).toBe(false);
    const rows = await inDO(r, (room) => ({
      lane: room.core.sql.all("SELECT goal, plan FROM lanes WHERE id = ?", c.lane)[0],
      generation: room.core.sql.all("SELECT summary FROM generations WHERE lane = ?", c.lane)[0],
    }));
    expect(rows).toEqual({ lane: { goal: "g", plan: null }, generation: { summary: "" } });
    // What readers are given is text or nothing, too.
    expect(await r.admin.read({ q: "lane", lane: c.lane })).toMatchObject({ goal: "g" });
    expect((await r.admin.read({ q: "lane", lane: c.lane }) as unknown as { plan?: unknown }).plan ?? null).toBeNull();
    expect(await r.admin.read({ q: "proposal", ref: { lane: c.lane, generation: 1 } })).toMatchObject({ summary: "" });
  });
});

describe.skipIf(DECLARED)("declared field names are the body's own properties (R-DECL-12)", () => {
  it("a field named like an inherited property is absent when the body omits it: optional toString is not read from the prototype, and required valueOf is required", async () => {
    const r = await declaredRoom(
      v2((a) => void (a["claim"] = { ...a["claim"]!, body: { ...a["claim"]!.body, toString: { type: "text" as const, max: 100, optional: true } } })),
    );
    const c = await ok<Claim>(r, r.admin, "claim", null, { goal: "g", scope: ["src/**"] });
    expect(c.kind).toBe("claim");
    expectRefusal(await act(r, r.admin, "claim", null, { goal: "g", scope: ["docs/**"], toString: 7 }), "invalid-body");
    const strict = await declaredRoom(
      v2((a) => void (a["claim"] = { ...a["claim"]!, body: { ...a["claim"]!.body, valueOf: { type: "text" as const, max: 100, requiredFor: ["none"] as const } } })),
    );
    expect(expectRefusal(await act(strict, strict.admin, "claim", null, { goal: "g", scope: ["src/**"] }), "invalid-body").reason).toBe("body.valueOf is required.");
    expectOk(await act(strict, strict.admin, "claim", null, { goal: "g", scope: ["src/**"], valueOf: "v" }));
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
    // An act without wording keeps the platform's.
    expect(expectRefusal(await act(r, bob, "propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head: "a".repeat(40), summary: "s" }), "not-holder").reason).not.toContain("to let go");
    // Unrecorded refusals are worded too: at step 4, step 4a and step 5.
    const worded = await declaredRoom(
      v2((a) => {
        const refusals = { "role-forbids": { reason: "Declared: {kind} is not for you.", fix: "Declared fix." }, "invalid-body": { reason: "Declared invalid {kind}.", fix: "Declared fix." }, "binding-stale": { reason: "Declared stale {kind}.", fix: "Declared fix." } };
        a["claim"] = { ...a["claim"]!, refusals };
      }),
    );
    const ci = await addMember(worded, "@ci", "checker");
    expect(expectRefusal(await act(worded, ci, "claim", null, { goal: "g", scope: ["src/**"] }), "role-forbids")).toMatchObject({ reason: "Declared: claim is not for you.", fix: "Declared fix." });
    expect(expectRefusal(await act(worded, worded.admin, "claim", null, { scope: ["src/**"] }), "invalid-body").reason).toBe("Declared invalid claim.");
    const staleOut = expectRefusal(await act(worded, worded.admin, "claim", null, { goal: "g", scope: ["src/**"] }, { binding: `sha256:${"2".repeat(64)}` }), "binding-stale");
    expect(staleOut.reason).toBe("Declared stale claim.");
    expect(staleOut.current?.binding).toBe(await bindingIn(worded, "claim"));
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

  it("a revert thread opened under a v2 document records the room's lease and the policy's conflict mode; under a v1 document it records neither", async () => {
    const rows = async (r: TestRoom) => inDO(r, (room) => room.core.sql.all("SELECT kind, lease_ms, conflict FROM lanes WHERE revert_of IS NOT NULL"));
    const open = (r: TestRoom) =>
      inDO(r, (room) =>
        room.core.sql.transaction(() => room.core.host().record({ type: "revert-lane", of: "op_land_1" as never, scope: ["src/**"], reason: "abort-after-landing" } as never)),
      );
    const d = await declaredRoom();
    await open(d);
    expect(await rows(d)).toEqual([{ kind: "room", lease_ms: LEASE, conflict: v2().lanes }]);
    const l = await makeRoom();
    await open(l);
    expect(await rows(l)).toEqual([{ kind: "room", lease_ms: null, conflict: null }]);
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
    expect(p).toMatchObject({ kind: "recover", recover: "version", flags: ["config-recovery"] });
    const approve = await ok(r, r.admin, "recover", { lane: legacy.lane, generation: 1 }, { op: "approve", head, verdict: "approve", scope: [".artroom/**"], text: "ok" }, { binding: null });
    expect((approve as unknown as { flags: string[] }).flags).toEqual(expect.arrayContaining(["config-recovery", "sole-admin-self-approval"]));
    const l = await ok(r, r.admin, "recover", { lane: legacy.lane, generation: 1 }, { op: "land", lease: 1, head }, { binding: null });
    // The landing's record names its op as `recover`; its own `op` is the landing operation.
    expect(l).toMatchObject({ kind: "recover", recover: "land", op: { id: expect.stringMatching(/^op_/) } });
    await tick(r, 3);
    expect(await inDO(r, (room) => room.core.landing.view((l as unknown as { op: { id: string } }).op.id as never)?.state)).toBe("landed");
    // The same path on a thread that `recover` opens: open, version, approve and land, each by the admin's own key.
    const opened = await ok<Claim>(r, r.admin, "recover", null, { op: "open", goal: "repair again", scope: [".artroom/**"] }, { binding: null });
    expect(opened).toMatchObject({ kind: "recover", recover: "open", purpose: "config-recovery", goal: "repair again", scope: [".artroom/**"], flags: ["config-recovery"], effect: { type: "opened" } });
    expect(await laneRowOf(r, opened.lane)).toMatchObject({ kind: "recover", binding: null, purpose: "config-recovery" });
    const head2 = pushChange(r, opened.lane, { ".artroom/note.txt": "recovered\n" });
    expectRefusal(await act(r, bob, "recover", { lane: opened.lane }, { op: "version", lease: 1, expectedGeneration: 0, head: head2, summary: "s" }, { binding: null }), "not-holder");
    expect(await ok(r, r.admin, "recover", { lane: opened.lane }, { op: "version", lease: 1, expectedGeneration: 0, head: head2, summary: "again" }, { binding: null })).toMatchObject({ kind: "recover", recover: "version" });
    expect(await ok(r, r.admin, "recover", { lane: opened.lane, generation: 1 }, { op: "approve", head: head2, verdict: "approve", scope: [".artroom/**"], text: "ok" }, { binding: null })).toMatchObject({ kind: "recover", recover: "approve" });
    const l2 = await ok(r, r.admin, "recover", { lane: opened.lane, generation: 1 }, { op: "land", lease: 1, head: head2 }, { binding: null });
    await tick(r, 3);
    expect(await inDO(r, (room) => room.core.landing.view((l2 as unknown as { op: { id: string } }).op.id as never)?.state)).toBe("landed");
    // A new recovery thread: non-admins and delegations are admin-required, recorded; scope outside .artroom is recovery-scope.
    expectRefusal(await act(r, bob, "recover", null, { op: "open", goal: "g", scope: [".artroom/policy.json"] }, { binding: null }), "admin-required");
    const k = newKeyPair();
    const grant = await ok<RosterRecord>(r, r.admin, "roster", null, { op: "delegate", to: k.key, kinds: ["renew"], acts: { claim: (await bindingIn(r, "claim"))! }, lanes: "*", expiresAt: iso(clock.now + day) }, { binding: null });
    expect(expectRefusal(await act(r, new Client(r, k, grant.id), "recover", null, { op: "open", goal: "g", scope: [".artroom/x"] }, { binding: null }), "admin-required").act).toBeDefined();
    expectRefusal(await act(r, r.admin, "recover", null, { op: "open", goal: "g", scope: ["src/**"] }, { binding: null }), "recovery-scope");
    // A recover body is closed per op.
    expectRefusal(await act(r, r.admin, "recover", null, { op: "open", goal: "g", scope: [".artroom/x"], purpose: "config-recovery" }, { binding: null }), "invalid-body");
  });

  it("recover take, note and release: an admin takes over a recovery thread whose lease expired, changes its scope within .artroom, notes on it and releases it; a legacy recovery lane and a recover thread alike", async () => {
    // A legacy recovery lane, open at the first v2 activation, its holder's lease then expired (R-DECL-21, last item).
    const r = await makeRoom();
    const legacy = await r.admin.ok<Claim>("claim", null, { goal: "repair", scope: [".artroom/policy.json"], purpose: "config-recovery" });
    await activate(r, v2());
    const opened = await ok<Claim>(r, r.admin, "recover", null, { op: "open", goal: "second", scope: [".artroom/checkers/**"] }, { binding: null });
    const bob = await addMember(r, "@bob", "member");
    advance(LEASE + 1000);
    await tick(r);
    for (const c of [legacy, opened]) {
      expect((await r.admin.read({ q: "lane", lane: c.lane })) as unknown).toMatchObject({ state: "unheld" });
      // Not a member's to take, recorded as any recovery refusal is.
      expect(expectRefusal(await act(r, bob, "recover", { lane: c.lane }, { op: "take", scope: [".artroom/**"], expectedGeneration: 0 }, { binding: null }), "admin-required").act).toBeDefined();
      const t = await ok<Claim>(r, r.admin, "recover", { lane: c.lane }, { op: "take", scope: [".artroom/**"], expectedGeneration: 0 }, { binding: null });
      expect(t).toMatchObject({ kind: "recover", recover: "take", lane: c.lane, purpose: "config-recovery", scope: [".artroom/**"], flags: ["config-recovery"], effect: { type: "taken-over" } });
      const lease = t.lease.generation;
      // The holder changes the scope with another take; outside .artroom it is recovery-scope.
      expect(await ok<Claim>(r, r.admin, "recover", { lane: c.lane }, { op: "take", scope: [".artroom/policy.json"], expectedGeneration: 0, lease }, { binding: null })).toMatchObject({ recover: "take", effect: { type: "rescoped" } });
      expectRefusal(await act(r, r.admin, "recover", { lane: c.lane }, { op: "take", scope: ["src/**"], expectedGeneration: 0, lease }, { binding: null }), "recovery-scope");
      expect(await ok(r, r.admin, "recover", { act: c.id }, { op: "note", text: "taken over" }, { binding: null })).toMatchObject({ kind: "recover", recover: "note", text: "taken over" });
      expect(await ok(r, r.admin, "recover", { lane: c.lane }, { op: "release", lease, note: "done" }, { binding: null })).toMatchObject({ kind: "recover", recover: "release", note: "done" });
      expect((await r.admin.read({ q: "lane", lane: c.lane })) as unknown).toMatchObject({ state: "unheld" });
    }
    // The legacy thread keeps its kind and records no lease length; the recover thread's kind is recover.
    expect(await laneRowOf(r, legacy.lane)).toMatchObject({ kind: "claim", lease_ms: null, purpose: "config-recovery" });
    expect(await laneRowOf(r, opened.lane)).toMatchObject({ kind: "recover", purpose: "config-recovery" });
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

  it("a document that uses a step or hold setting this room runs only from stage 4 is policy-invalid at propose time: each of the seven, by the parser and through a proposal", async () => {
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
      // Each one through a proposal, where the room refuses it and records the refusal; the document never activates.
      const version = await inDO(r, (room) => room.core.activePolicy().version);
      const out = expectRefusal(await proposeDoc(r, doc), "policy-invalid");
      // The refusal names the document's first problem. A hand-over needs reserveSeconds on the thread it hands over
      // (R-DECL-24), which is itself a stage-4 setting and comes first in that document.
      const named = what === "the step hand-over" ? "hold.reserveSeconds" : what;
      expect(out.reason).toMatch(/^The proposed configuration is invalid: acts\.[a-z]+: /);
      expect(out.reason.endsWith(`${named} is not run by this room until declared acts stage 4.`)).toBe(true);
      expect(out.act).toBeDefined();
      expect(await inDO(r, (room) => room.core.activePolicy().version)).toBe(version);
    }
  });

  it("a workspace or workspace-token request is judged as for an act with step version on the thread (R-CRED-5 as amended): the thread's kind decides whether any act makes versions there, and the holder is found", async () => {
    const r = await declaredRoom(v2((a) => void (a["propose"] = { ...a["propose"]!, threads: ["room"] })));
    const c = await ok<Claim>(r, r.admin, "claim", null, { goal: "g", scope: ["src/**"] });
    for (const kind of ["workspace", "workspace-token"] as const)
      expect(expectRefusal(await r.admin.request({ kind, lane: c.lane, lease: 1 }), "wrong-thread").reason).toBe(`No declared act makes versions on ${c.lane}, a claim thread.`);
    const ok2 = await declaredRoom();
    const c2 = await ok<Claim>(ok2, ok2.admin, "claim", null, { goal: "g", scope: ["src/**"] });
    expectOk(await ok2.admin.request({ kind: "workspace", lane: c2.lane, lease: 1 }));
    await tick(ok2);
    expect(expectOk(await ok2.admin.request<{ lane: string; leaseGeneration: number } | Refusal>({ kind: "workspace-token", lane: c2.lane, lease: 1 }))).toMatchObject({ lane: c2.lane, leaseGeneration: 1 });
    const bob = await addMember(ok2, "@bob", "member");
    for (const kind of ["workspace", "workspace-token"] as const) {
      expectRefusal(await bob.request({ kind, lane: c2.lane, lease: 1 }), "not-holder");
      expectRefusal(await ok2.admin.request({ kind, lane: c2.lane, lease: 2 }), "lease-fenced");
    }
  });

  it("a workspace request: the version act's who.roles decide for a member's own key, as they would for the act", async () => {
    const r = await declaredRoom(v2((a) => void (a["propose"] = { ...a["propose"]!, who: { roles: ["maintainer"] } })));
    const bob = await addMember(r, "@bob", "member");
    const mo = await addMember(r, "@mo", "maintainer");
    const cb = await ok<Claim>(r, bob, "claim", null, { goal: "g", scope: ["src/**"] });
    // Bob holds the thread, but his role may not sign the act that makes versions on it.
    for (const kind of ["workspace", "workspace-token"] as const)
      expect(expectRefusal(await bob.request({ kind, lane: cb.lane, lease: 1 }), "role-forbids").reason).toBe("The role member may not sign propose.");
    const cm = await ok<Claim>(r, mo, "claim", null, { goal: "g", scope: ["docs/**"] });
    expectOk(await mo.request({ kind: "workspace", lane: cm.lane, lease: 1 }));
    // An admin may sign every declared act (R-DECL-11).
    const ca = await ok<Claim>(r, r.admin, "claim", null, { goal: "g", scope: ["test/**"] });
    expectOk(await r.admin.request({ kind: "workspace", lane: ca.lane, lease: 1 }));
  });

  it("a workspace request under a delegation: the grant's map must name the version act, with the binding in force", async () => {
    const r = await declaredRoom();
    const bob = await addMember(r, "@bob", "member");
    const c = await ok<Claim>(r, bob, "claim", null, { goal: "g", scope: ["src/**"] });
    const grant = async (kinds: string[]) => {
      const k = newKeyPair();
      const acts: Record<string, string> = {};
      for (const kind of kinds) acts[kind] = (await bindingIn(r, kind))!;
      const g = await ok<RosterRecord>(r, bob, "roster", null, { op: "delegate", to: k.key, kinds: ["renew"], acts, lanes: "*", expiresAt: iso(clock.now + day) }, { binding: null });
      return new Client(r, k, g.id);
    };
    const claimOnly = await grant(["claim"]);
    const both = await grant(["claim", "propose"]);
    for (const kind of ["workspace", "workspace-token"] as const)
      expect(expectRefusal(await claimOnly.request({ kind, lane: c.lane, lease: 1 }), "delegation-invalid").reason).toBe(`Delegation ${claimOnly.delegation} does not cover propose.`);
    expectOk(await both.request({ kind: "workspace", lane: c.lane, lease: 1 }));
    // The meaning of propose changes: the grant names its earlier binding, so the request is refused as the act would be.
    await activate(r, v2((a) => void (a["propose"] = { ...a["propose"]!, body: { ...a["propose"]!.body, why: { type: "text", max: 10, optional: true } } })));
    for (const kind of ["workspace", "workspace-token"] as const)
      expect(expectRefusal(await both.request({ kind, lane: c.lane, lease: 1 }), "delegation-invalid").reason).toBe("The delegation was granted for an earlier meaning of propose.");
    // The holder's own key needs no grant.
    expectOk(await bob.request({ kind: "workspace", lane: c.lane, lease: 1 }));
  });

  it("a workspace request on a recovery thread is judged as recover is: an active admin's own key, whatever the declarations say", async () => {
    // No declared act makes versions on a recover thread, and none is needed.
    const r = await declaredRoom();
    const bob = await addMember(r, "@bob", "member");
    const c = await ok<Claim>(r, r.admin, "recover", null, { op: "open", goal: "repair", scope: [".artroom/**"] }, { binding: null });
    expectOk(await r.admin.request({ kind: "workspace", lane: c.lane, lease: 1 }));
    const k = newKeyPair();
    const g = await ok<RosterRecord>(r, r.admin, "roster", null, { op: "delegate", to: k.key, kinds: ["renew"], acts: { claim: (await bindingIn(r, "claim"))!, propose: (await bindingIn(r, "propose"))! }, lanes: "*", expiresAt: iso(clock.now + day) }, { binding: null });
    for (const kind of ["workspace", "workspace-token"] as const) {
      expectRefusal(await bob.request({ kind, lane: c.lane, lease: 1 }), "admin-required");
      expectRefusal(await new Client(r, k, g.id).request({ kind, lane: c.lane, lease: 1 }), "admin-required");
    }
    // A checker, whose role could not sign the legacy propose, is refused before that: role-forbids.
    const ci = await addMember(r, "@ci", "checker");
    expectRefusal(await ci.request({ kind: "workspace", lane: c.lane, lease: 1 }), "role-forbids");
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
        // The store as version `from` had it: without the six columns.
        for (const [table, column] of [["lanes", "kind"], ["lanes", "binding"], ["lanes", "lease_ms"], ["lanes", "conflict"], ["delegations", "acts"], ["invitations", "declared"]]) sql.all(`ALTER TABLE ${table} DROP COLUMN ${column}`);
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

  it("migration 4 is idempotent: run again on one store, each of its six columns is there once and no thread's kind changes", async () => {
    const r = await makeRoom();
    const out = await inDO(r, async (room) => {
      const { ROOM_MIGRATIONS } = await import("../../src/store.ts");
      const step = ROOM_MIGRATIONS.find((m) => m.version === 4)!;
      const { DECLARED_COLUMNS } = await import("../../src/store.ts");
      const columns = () => DECLARED_COLUMNS.map(([table, column]) => `${table}.${column}: ${room.core.sql.all("SELECT name FROM pragma_table_info(?) WHERE name = ?", table, column).length}`);
      const before = columns();
      const kinds = () => room.core.sql.all("SELECT id, kind FROM lanes ORDER BY seq");
      const lanes = kinds();
      // The store is at version 4 already: these are the step's second and third runs.
      room.core.sql.transaction(() => step.up(room.core.sql));
      room.core.sql.transaction(() => step.up(room.core.sql));
      return { before, after: columns(), same: JSON.stringify(kinds()) === JSON.stringify(lanes) };
    });
    const six = ["lanes.kind: 1", "lanes.binding: 1", "lanes.lease_ms: 1", "lanes.conflict: 1", "delegations.acts: 1", "invitations.declared: 1"];
    expect(out).toEqual({ before: six, after: six, same: true });
  });
});
