/**
 * Declared acts stage 2 (request fd6f00b6): regressions from the builder's
 * independent audit of 22ee206d. Each case is a way the Room behaved across
 * a change of vocabulary, or for a kind with a name of its own, that the
 * rules of docs/protocol.md section 33 do not allow. They run in the legacy
 * run only, as declared-fd6f00b6.test.ts does: they sign their own envelopes.
 */

import { describe, expect, it } from "vitest";
import type { ActDeclaration, ActRecord, Claim, PolicyDocument, PolicyDocumentV2, Redeemed, Refusal, RosterRecord } from "@generalbusiness/artroom-contract";
import { CODE_REVIEW_ACTS, codeReviewPolicy, lanes as lanesPart, policy, requireReview } from "@generalbusiness/artroom-policy";
import { activate, act, bindingIn, declaredRoom, headSeq, inDO, ok, signed, v2 } from "./declared-support.ts";
import { addMember, b64url, call, Client, clock, day, DECLARED, digestBytes, expectOk, expectRefusal, iso, makeRoom, newKeyPair, pushChange, randomBytes, tick, type TestRoom } from "./support.ts";

const reviewed = () => policy(requireReview({ paths: "src/**", from: "role:admin", id: "rv" }));
const landing = (r: TestRoom, op: string) =>
  inDO(r, (room) => {
    const v = room.core.landing.view(op as never) as unknown as { state: string; reason?: string; fix?: string };
    return { state: v.state, reason: v.reason, fix: v.fix };
  });

describe.skipIf(DECLARED)("reads follow the step an act ran, not a legacy kind's name", () => {
  it("the update summary of an act that opened a thread names the thread: a legacy claim, a recover open, and a declared opener of another name", async () => {
    const summaryOf = (r: TestRoom, id: string) =>
      inDO(r, async (room) => {
        const { summary } = await import("../../src/reads.ts");
        const { entryById } = await import("../../src/log.ts");
        return summary(entryById(room.core.sql, id)!);
      });
    const legacy = await makeRoom();
    const lc = await legacy.admin.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
    expect((await summaryOf(legacy, lc.id)).lane).toBe(lc.lane);
    const r = await declaredRoom(v2((a) => void (a["start"] = { ...a["claim"]!, label: "Start", threads: ["start", "claim", "room"] })));
    const rec = await ok<Claim>(r, r.admin, "recover", null, { op: "open", goal: "g", scope: [".artroom/policy.json"] }, { binding: null });
    const st = await ok<Claim>(r, r.admin, "start", null, { goal: "g", scope: ["docs/**"] });
    expect((await summaryOf(r, rec.id)).lane).toBe(rec.lane);
    expect((await summaryOf(r, st.id)).lane).toBe(st.lane);
    // An act that opens nothing and targets no thread names none.
    const n = await ok(r, r.admin, "note", { act: st.id }, { text: "hello" });
    expect((await summaryOf(r, n.id)).lane).toBeUndefined();
  });

  it("explain of an act with step version carries its evidence: a legacy propose on a recovery lane, and a recover version", async () => {
    const legacy = await makeRoom();
    const lc = await legacy.admin.ok<Claim>("claim", null, { goal: "repair", scope: [".artroom/policy.json"], purpose: "config-recovery" });
    const lhead = pushChange(legacy, lc.lane, { ".artroom/policy.json": JSON.stringify(policy()) + "\n" });
    const lp = await legacy.admin.ok("propose", { lane: lc.lane }, { lease: 1, expectedGeneration: 0, head: lhead, summary: "s" });
    expect((await legacy.admin.read({ q: "explain", act: lp.id }))?.evidence).toBeDefined();
    const r = await declaredRoom();
    const c = await ok<Claim>(r, r.admin, "recover", null, { op: "open", goal: "g", scope: [".artroom/policy.json"] }, { binding: null });
    const head = pushChange(r, c.lane, { ".artroom/policy.json": JSON.stringify(v2()) + " \n" });
    const p = await ok(r, r.admin, "recover", { lane: c.lane }, { op: "version", lease: 1, expectedGeneration: 0, head, summary: "s" }, { binding: null });
    expect((await r.admin.read({ q: "explain", act: p.id }))?.evidence).toBeDefined();
    // An act that made no version has none.
    expect((await r.admin.read({ q: "explain", act: c.id }))?.evidence).toBeUndefined();
  });

  it("a whole flow under a vocabulary with none of the legacy names: open, workspace, version, comment, review, land, release, with its reads", async () => {
    const base = reviewed();
    const names: Record<string, string> = { claim: "start", propose: "submit", note: "say", review: "approve", check: "attest", land: "ship", release: "drop" };
    const acts: Record<string, ActDeclaration> = {};
    for (const [old, d] of Object.entries(structuredClone(CODE_REVIEW_ACTS) as Record<string, ActDeclaration>)) acts[names[old]!] = { ...d, ...(d.threads ? { threads: ["start", "room"] } : {}) };
    const doc = { ...codeReviewPolicy(base), acts, rules: [...base.rules, { id: "tell", kind: "notify", on: ["submit"], to: ["role:admin"], why: "A submission." }] } as unknown as PolicyDocumentV2;
    const r = await declaredRoom(doc);
    const bob = await addMember(r, "@bob", "member");
    const c = await ok<Claim>(r, bob, "start", null, { goal: "g", scope: ["src/**"] });
    expectOk(await bob.request({ kind: "workspace", lane: c.lane, lease: 1 }));
    const head = pushChange(r, c.lane, { "src/app.ts": "v2" });
    const p = await ok(r, bob, "submit", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" });
    await ok(r, r.admin, "say", { act: p.id }, { text: "hm" });
    await ok(r, r.admin, "approve", { lane: c.lane, generation: 1 }, { head, verdict: "approve", scope: ["src/**"], text: "ok" });
    const l = (await ok(r, bob, "ship", { lane: c.lane, generation: 1 }, { lease: 1, head })) as unknown as { op: { id: string } };
    await tick(r, 6);
    expect((await landing(r, l.op.id)).state).toBe("landed");
    expect((await r.admin.read({ q: "explain", act: p.id }))?.evidence).toBeDefined();
    expect((await r.admin.read({ q: "attention" })).items.map((i) => i.why)).toContain("review-requested");
    const kinds = (await r.admin.read({ q: "log", req: {} })).acts.flatMap((e) => (e.entry.type === "act" ? [e.entry.act.envelope.kind as string] : []));
    expect(kinds).toEqual(expect.arrayContaining(["start", "submit", "say", "approve", "ship"]));
    const c2 = await ok<Claim>(r, bob, "start", null, { goal: "g", scope: ["docs/**"] });
    expect((await ok(r, bob, "drop", { lane: c2.lane }, { lease: 1 })).kind).toBe("drop");
  });
});

describe.skipIf(DECLARED)("a landing in flight is judged again under the active document (R-LAND-7)", () => {
  async function landInFlight(r: TestRoom) {
    const bob = await addMember(r, "@bob", "member");
    const c = await ok<Claim>(r, bob, "claim", null, { goal: "g", scope: ["src/a.ts"] });
    const head = pushChange(r, c.lane, { "src/a.ts": "a" });
    await ok(r, bob, "propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" });
    await ok(r, r.admin, "review", { lane: c.lane, generation: 1 }, { head, verdict: "approve", scope: ["src/**"], text: "ok" });
    const l = (await ok(r, bob, "land", { lane: c.lane, generation: 1 }, { lease: 1, head })) as unknown as { op: { id: string } };
    // The initiator loses the role that may land: a checker may sign only check and note.
    expectOk(await act(r, r.admin, "roster", null, { op: "set-role", member: "@bob", role: "checker" }, { binding: null }));
    return l.op.id;
  }

  it("an initiator who lost the role that may land loses the landing at reservation: with land still declared, with no activation, and when the activation retired the land kind", async () => {
    const kept = await declaredRoom(v2(() => {}, reviewed()));
    const keptOp = await landInFlight(kept);
    await activate(kept, v2((a) => void (a["note"] = { ...a["note"]!, label: "Note again" }), reviewed()));
    await tick(kept, 6);
    expect(await landing(kept, keptOp)).toMatchObject({ state: "retryable", reason: "authority-lost" });
    const none = await declaredRoom(v2(() => {}, reviewed()));
    const noneOp = await landInFlight(none);
    await tick(none, 6);
    expect(await landing(none, noneOp)).toMatchObject({ state: "retryable", reason: "authority-lost" });
    // The land kind is renamed by the activation: there is no step 4a at reservation, so the retired kind is refused there.
    const retired = await declaredRoom(v2(() => {}, reviewed()));
    const retiredOp = await landInFlight(retired);
    await activate(
      retired,
      v2((a) => {
        a["ship"] = { ...a["land"]!, label: "Ship" };
        delete a["land"];
      }, reviewed()),
    );
    await tick(retired, 6);
    const out = await landing(retired, retiredOp);
    expect(out).toMatchObject({ state: "retryable", reason: "authority-lost" });
    expect(out.fix).toContain("no longer declares land");
  });

  it("a landing whose kind was retired is lost even when its initiator kept every role: nothing judges an undeclared kind", async () => {
    const r = await declaredRoom(v2(() => {}, reviewed()));
    const bob = await addMember(r, "@bob", "member");
    const c = await ok<Claim>(r, bob, "claim", null, { goal: "g", scope: ["src/a.ts"] });
    const head = pushChange(r, c.lane, { "src/a.ts": "a" });
    await ok(r, bob, "propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" });
    await ok(r, r.admin, "review", { lane: c.lane, generation: 1 }, { head, verdict: "approve", scope: ["src/**"], text: "ok" });
    const l = (await ok(r, bob, "land", { lane: c.lane, generation: 1 }, { lease: 1, head })) as unknown as { op: { id: string } };
    await activate(
      r,
      v2((a) => {
        a["ship"] = { ...a["land"]!, label: "Ship" };
        delete a["land"];
      }, reviewed()),
    );
    await tick(r, 6);
    expect(await landing(r, l.op.id)).toMatchObject({ state: "retryable", reason: "authority-lost" });
  });

  it("a legacy landing in flight at the first v2 activation: by the member's own key it lands; under a v1-era delegation it loses authority", async () => {
    const run = async (delegated: boolean) => {
      const r = await makeRoom({ policy: reviewed() });
      const bob = await addMember(r, "@bob", "member");
      const k = newKeyPair();
      const g = await bob.ok<RosterRecord>("roster", null, { op: "delegate", to: k.key, kinds: "*", lanes: "*", expiresAt: iso(clock.now + day) });
      const who = delegated ? new Client(r, k, g.id) : bob;
      const c = await who.ok<Claim>("claim", null, { goal: "g", scope: ["src/a.ts"] });
      const head = pushChange(r, c.lane, { "src/a.ts": "a" });
      await who.ok("propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" });
      await r.admin.ok("review", { lane: c.lane, generation: 1 }, { head, verdict: "approve", scope: ["src/**"], text: "ok" });
      const l = (await who.ok("land", { lane: c.lane, generation: 1 }, { lease: 1, head })) as unknown as { op: { id: string } };
      await activate(r, v2(() => {}, reviewed() as PolicyDocument));
      await tick(r, 6);
      return landing(r, l.op.id);
    };
    expect((await run(false)).state).toBe("landed");
    const lost = await run(true);
    expect(lost).toMatchObject({ state: "retryable", reason: "authority-lost" });
    expect(lost.fix).toContain("delegation-invalid");
  });
});

describe.skipIf(DECLARED)("an act signed for an earlier meaning is binding-stale, whatever changed (R-DECL-15, R-DECL-16)", () => {
  it("a note on an entry, signed before its declaration lost the entry target and submitted after: binding-stale with the current binding, not bad-request", async () => {
    const r = await declaredRoom();
    const c = await ok<Claim>(r, r.admin, "claim", null, { goal: "g", scope: ["src/**"] });
    const note = await signed(r, r.admin, "note", { act: c.id }, { text: "hello" });
    await activate(r, v2((a) => void (a["note"] = { ...a["note"]!, targets: { line: ["comment"] } })));
    const out = expectRefusal(await call<ActRecord | Refusal>(r.stub.submit(note)), "binding-stale");
    expect(out.current?.binding).toBe(await bindingIn(r, "note"));
    expect(out.act).toBeUndefined();
  });

  it("a legacy v: 1 take-over, submitted after a v2 activation whose claim only opens: binding-stale", async () => {
    const r = await makeRoom();
    const c = await r.admin.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
    await r.admin.ok("release", { lane: c.lane }, { lease: 1 });
    const take = r.admin.signed("claim", { lane: c.lane }, { scope: ["src/**"], expectedGeneration: 0 });
    await activate(
      r,
      v2((a) => {
        a["adopt"] = { label: "Adopt", targets: { thread: ["take"] }, threads: ["claim", "room"], who: { roles: ["member"] } };
        const { threads: _threads, ...claim } = a["claim"]!;
        void _threads;
        a["claim"] = { ...claim, targets: { none: ["open"] } };
      }),
    );
    expectRefusal(await call<ActRecord | Refusal>(r.stub.submit(take)), "binding-stale");
  });
});

describe.skipIf(DECLARED)("redemption and sessions across a change of vocabulary (R-DECL-17, R-CRED-3)", () => {
  const invited = async (r: TestRoom, member: string, role: string, session?: unknown) => {
    const bytes = randomBytes(32);
    const op = { op: "invite", member, role, custody: "room", expiresAt: iso(clock.now + day), secretHash: digestBytes(bytes), ...(session ? { session } : {}) };
    const inv = await ok<RosterRecord>(r, r.admin, "roster", null, op, { binding: null });
    return { id: inv.id, redeem: () => call<Redeemed | Refusal>(r.stub.redeem({ custody: "room", invitation: inv.id, secret: b64url(bytes) }, "x")) };
  };
  const unused = (r: TestRoom, id: string) => inDO(r, (room) => room.core.sql.all("SELECT used FROM invitations WHERE id = ?", id)[0]!["used"] === null);

  it("a session naming a kind that was retired before redemption is refused binding-stale, not the grant's kind-undeclared; the invitation stays unused", async () => {
    const r = await declaredRoom(v2((a) => void (a["ask"] = { label: "Ask", targets: { entry: ["comment"] }, body: { text: { type: "text", max: 100 } }, who: { roles: ["agent"] } })));
    const inv = await invited(r, "@agent", "agent", { kinds: [], acts: { ask: (await bindingIn(r, "ask"))! }, lanes: "*", ttlSeconds: 3600 });
    await activate(r, v2());
    const seq = await headSeq(r);
    const out = expectRefusal(await inv.redeem(), "binding-stale");
    expect(out.reason).toContain("no longer declares ask");
    expect(await headSeq(r)).toBe(seq);
    expect(await unused(r, inv.id)).toBe(true);
  });

  it("a v2-era invitation that grants its session no kind: redeemed under v2, with a delegation that covers nothing; under v1 it is refused with a reason, and stays unused", async () => {
    const under2 = await declaredRoom();
    const a = await invited(under2, "@ci", "checker");
    const redeemed = expectOk(await a.redeem()) as Redeemed;
    expect((await under2.admin.read({ q: "members" })).delegations.find((x) => x.id === redeemed.delegation)).toMatchObject({ kinds: [], acts: {} });
    const under1 = await declaredRoom();
    const b = await invited(under1, "@ci", "checker");
    await activate(under1, policy());
    const seq = await headSeq(under1);
    const out = expectRefusal(await b.redeem(), "delegation-invalid");
    expect(out.reason).toContain("grants no kind");
    expect(await headSeq(under1)).toBe(seq);
    expect(await unused(under1, b.id)).toBe(true);
  });

  it("a delegation granted under v2 with a map and renew covers only renew after the room returns to v1", async () => {
    const r = await declaredRoom();
    const bob = await addMember(r, "@bob", "member");
    const k = newKeyPair();
    const grant = { op: "delegate", to: k.key, kinds: ["renew"], acts: { claim: (await bindingIn(r, "claim"))!, release: (await bindingIn(r, "release"))! }, lanes: "*", expiresAt: iso(clock.now + day) };
    const g = await ok<RosterRecord>(r, bob, "roster", null, grant, { binding: null });
    const c = await ok<Claim>(r, bob, "claim", null, { goal: "g", scope: ["src/**"] });
    await activate(r, policy());
    const d = new Client(r, k, g.id);
    expectRefusal(await d.act("claim", null, { goal: "g", scope: ["docs/**"] }), "delegation-invalid");
    expectRefusal(await d.act("release", { lane: c.lane }, { lease: 1 }), "delegation-invalid");
    expectOk(await d.act("renew", { lane: c.lane }, { lease: 1 }));
  });

  it("a bearer session's exact retry of a recorded refusal, across v1 to v2, gets the original refusal", async () => {
    const r = await makeRoom();
    const bytes = randomBytes(32);
    const inv = await r.admin.ok<RosterRecord>("roster", null, { op: "invite", member: "@agent", role: "agent", custody: "room", expiresAt: iso(clock.now + day), secretHash: digestBytes(bytes), session: { kinds: ["claim", "release", "renew"], lanes: "*", ttlSeconds: 3600 } } as never);
    const b = await call<Redeemed>(r.stub.redeem({ custody: "room", invitation: inv.id, secret: b64url(bytes) }, "x"));
    const c = await r.admin.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
    const release = { kind: "release", target: { lane: c.lane }, body: { lease: 1 }, idempotencyKey: "rel-1" };
    const first = expectRefusal(await call(r.stub.bearerAct(b.bearer, release as never)), "not-holder");
    expect(first.act).toBeDefined();
    await activate(r, v2());
    expect(await call<ActRecord | Refusal>(r.stub.bearerAct(b.bearer, release as never))).toEqual(first);
  });
});

describe.skipIf(DECLARED)("recover at step 4, and thread settings recorded at open (R-DECL-21, R-DECL-6, R-LOG-6)", () => {
  it("a role that could not sign the legacy act a recover op stands for is refused role-forbids, unrecorded, as its legacy recovery claim is", async () => {
    const legacy = await makeRoom();
    const lci = await addMember(legacy, "@ci", "checker");
    const lseq = await headSeq(legacy);
    expect(expectRefusal(await lci.act("claim", null, { goal: "g", scope: [".artroom/x"], purpose: "config-recovery" }), "role-forbids").act).toBeUndefined();
    expect(await headSeq(legacy)).toBe(lseq);
    const r = await declaredRoom();
    const ci = await addMember(r, "@ci", "checker");
    const bob = await addMember(r, "@bob", "member");
    const seq = await headSeq(r);
    expect(expectRefusal(await act(r, ci, "recover", null, { op: "open", goal: "g", scope: [".artroom/x"] }, { binding: null }), "role-forbids").act).toBeUndefined();
    expect(await headSeq(r)).toBe(seq);
    // A member, who could sign a legacy claim, is judged at step 7 as before: admin-required, recorded.
    expect(expectRefusal(await act(r, bob, "recover", null, { op: "open", goal: "g", scope: [".artroom/x"] }, { binding: null }), "admin-required").act).toBeDefined();
    // An unknown op, and a target its op does not take, keep their codes.
    expectRefusal(await act(r, r.admin, "recover", null, { op: "nope" }, { binding: null }), "invalid-body");
  });

  it("the opened effect names the thread's kind and binding in a v2 room, and the thread records its conflict mode; a v1 room records neither", async () => {
    const effectOf = (r: TestRoom, id: string) =>
      inDO(r, (room) => (JSON.parse(String(room.core.sql.all("SELECT body FROM entries WHERE id = ?", id)[0]!["body"])) as { entry: { receipt: { effects: Record<string, unknown>[] } } }).entry.receipt.effects.find((e) => e["type"] === "opened")!);
    const conflictOf = (r: TestRoom, lane: string) => inDO(r, (room) => room.core.sql.all("SELECT conflict FROM lanes WHERE id = ?", lane)[0]!["conflict"]);
    const r = await declaredRoom(v2(() => {}, policy(lanesPart("exclusive"))));
    const c = await ok<Claim>(r, r.admin, "claim", null, { goal: "g", scope: ["src/**"] });
    expect(await effectOf(r, c.id)).toMatchObject({ kind: "claim", binding: await bindingIn(r, "claim") });
    expect(await conflictOf(r, c.lane)).toBe("exclusive");
    const rec = await ok<Claim>(r, r.admin, "recover", null, { op: "open", goal: "g", scope: [".artroom/policy.json"] }, { binding: null });
    expect(await effectOf(r, rec.id)).toMatchObject({ kind: "recover", binding: null });
    expect(await conflictOf(r, rec.lane)).toBe("by-scope");
    // The mode is the policy's at the time of opening; a later activation does not change a thread's.
    await activate(r, v2(() => {}, policy(lanesPart("by-scope"))));
    const later = await ok<Claim>(r, r.admin, "claim", null, { goal: "g", scope: ["docs/**"] });
    expect(await conflictOf(r, later.lane)).toBe("by-scope");
    expect(await conflictOf(r, c.lane)).toBe("exclusive");
    const legacy = await makeRoom();
    const lc = await legacy.admin.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
    const le = await effectOf(legacy, lc.id);
    expect("kind" in le || "binding" in le).toBe(false);
    expect(await conflictOf(legacy, lc.lane)).toBeNull();
  });

  it("a room moves from v1 to v2 by landing a v2 document, through validation and the landing engine; its legacy thread then takes declared acts", async () => {
    const r = await makeRoom();
    const c = await r.admin.ok<Claim>("claim", null, { goal: "policy", scope: [".artroom/**"] });
    const head = pushChange(r, c.lane, { ".artroom/policy.json": JSON.stringify(v2()) });
    expectOk(await r.admin.act("propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "to v2" }));
    expectOk(await r.admin.act("review", { lane: c.lane, generation: 1 }, { head, verdict: "approve", scope: [".artroom/**"], text: "ok" }));
    const l = expectOk(await r.admin.act("land", { lane: c.lane, generation: 1 }, { lease: 1, head })) as unknown as { op: { id: string } };
    await tick(r, 4);
    expect((await landing(r, l.op.id)).state).toBe("landed");
    expect(await inDO(r, (room) => room.core.activePolicy().doc.format)).toBe("artroom-policy-v2");
    expectOk(await act(r, r.admin, "release", { lane: c.lane }, { lease: 1 }));
  });

  it("a thread a declared kind opened keeps its recorded lease after the room returns to v1, and legacy acts act on it", async () => {
    const r = await declaredRoom(v2((a) => void (a["task"] = { ...a["claim"]!, label: "Task", threads: ["task"], hold: { scope: "body.scope", workspace: true, leaseSeconds: 60 } })));
    const t = await ok<Claim>(r, r.admin, "task", null, { goal: "g", scope: ["docs/**"] });
    await activate(r, policy());
    expect((await r.admin.ok<{ lease: { expiresAt: string } } & ActRecord>("renew", { lane: t.lane }, { lease: 1 })).lease.expiresAt).toBe(iso(clock.now + 60_000));
    expect((await r.admin.ok("release", { lane: t.lane }, { lease: 1 })).kind).toBe("release");
  });
});
