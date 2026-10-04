/**
 * Declared acts in the Room (docs/protocol.md section 33; request fd6f00b6):
 * the Room admits acts from its active document's vocabulary. Under a `v1`
 * document that is the legacy vocabulary; under a `v2` document it is the
 * document's declarations.
 *
 * One group of tests for each invariant, in the order of the rules. The
 * tests found their own `v1` and `v2` rooms and sign their own envelopes,
 * binding included (declared-support.ts), because many of them send a stale
 * envelope on purpose. The shape checks of a `v2` room are pure functions
 * and are tested in test/node/declared-equivalence.test.ts.
 */

import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import type { ActDeclaration, ActRecord, CheckerService, CheckJob, Claim, LaneId, PolicyDocument, PolicyDocumentV2, Redeemed, Refusal, Review, RosterRecord } from "@generalbusiness/artroom-contract";
import { CODE_REVIEW_ACTS, bindingOf, codeReviewPolicy, lanes as lanesPart, policy, requireCheck, requireReview, rule } from "@generalbusiness/artroom-policy";
import { verifyLog } from "@generalbusiness/artroom-log";
import { JOB_RETRY_MS } from "../../src/jobs.ts";
import { redeem } from "../../src/requests.ts";
import { ROOM_MIGRATIONS } from "../../src/store.ts";
import type { Room } from "../../src/index.ts";
import { runInDurableObject } from "cloudflare:test";
import { activate, act, bearer, bindingIn, declaredRoom, delegateOp, delegationOf, entryOf, headSeq, inDO, invited, landing, laneRowOf, LEASE, ok, restarted, reviewed, revertLane, signed, v2 } from "./declared-support.ts";
import { addMember, advance, b64url, call, Client, clock, day, digestBytes, expectOk, expectRefusal, failure, iso, logOf, makeRoom, newKeyPair, pushChange, randomBytes, sign, tick, until, type TestRoom } from "./support.ts";

type Acts = Record<string, ActDeclaration>;

/** A change of the meaning of `claim`: its binding changes (R-DECL-15). */
const shorterLease = (a: Acts) => void ((a["claim"] as { hold: unknown }).hold = { scope: "body.scope", workspace: true, leaseSeconds: 600 });
/** A kind the legacy vocabulary does not have: a question on an entry. */
const ASK: ActDeclaration = { label: "Ask", targets: { entry: ["comment"] }, body: { text: { type: "text", max: 100 } }, who: { roles: ["member", "agent"] } };
const policyVersion = (r: TestRoom) => inDO(r, (room) => room.core.activePolicy().version);
const claimBody = (scope = "src/**") => ({ goal: "g", scope: [scope] });
const keyOf = (signed: { envelope: unknown }) => (signed.envelope as { idempotencyKey: string }).idempotencyKey;
const bearerAct = <T = ActRecord>(r: TestRoom, b: Redeemed, a: { kind: string; target: unknown; body: unknown; idempotencyKey: string; binding?: string }) => call<T | Refusal>(r.stub.bearerAct(b.bearer, a as never));

/** A thread with one version that an admin approved, and the land act that starts its landing. */
async function landed(r: TestRoom, who: Client, path: string) {
  const c = await ok<Claim>(r, who, "claim", null, claimBody(path));
  const head = pushChange(r, c.lane, { [path]: path });
  await ok(r, who, "propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" });
  await ok(r, r.admin, "review", { lane: c.lane, generation: 1 }, { head, verdict: "approve", scope: ["src/**"], text: "ok" });
  const l = (await ok(r, who, "land", { lane: c.lane, generation: 1 }, { lease: 1, head })) as unknown as { op: { id: string } };
  return { lane: c.lane, head, op: l.op.id };
}

describe("one vocabulary per document (R-DECL-1, R-DECL-6, R-DECL-15)", () => {
  it("a v2 room admits the code-review acts under their bindings and records each thread's kind, binding, lease and conflict mode; a v1 room is the legacy vocabulary and records none", async () => {
    const doc = v2(() => {}, policy(lanesPart("exclusive")));
    const d = await declaredRoom(doc);
    // The room's binding is the policy package's binding identity; a platform kind has none.
    for (const kind of Object.keys(CODE_REVIEW_ACTS)) expect(await bindingIn(d, kind), kind).toBe(await bindingOf(doc, kind));
    expect(await bindingIn(d, "renew")).toBeNull();
    const binding = (await bindingIn(d, "claim"))!;
    const c = await ok<Claim>(d, d.admin, "claim", null, claimBody());
    expect(c).toMatchObject({ kind: "claim", purpose: "ordinary", lease: { generation: 1, expiresAt: iso(clock.now + LEASE) } });
    expect(await laneRowOf(d, c.lane)).toEqual({ kind: "claim", binding, lease_ms: LEASE, expires_ms: clock.now + LEASE, purpose: "ordinary", conflict: "exclusive" });
    expect((await entryOf(d, c.id)).entry.receipt!.effects.find((e) => e["type"] === "opened")).toMatchObject({ kind: "claim", binding });
    // The platform kinds stay v: 1; a v: 2 envelope of one is bad-request.
    expectOk(await act(d, d.admin, "renew", { lane: c.lane }, { lease: 1 }, { binding: null }));
    expect(await failure(d.stub.submit(await signed(d, d.admin, "renew", { lane: c.lane }, { lease: 1 }, { binding })))).toMatchObject({ code: "bad-request", message: "envelope.v must be 1 for the platform kind renew." });
    // The conflict mode is the thread's for its life: a later activation decides only for threads opened after it.
    await activate(d, v2(() => {}, policy(lanesPart("by-scope"))));
    const later = await ok<Claim>(d, d.admin, "claim", null, claimBody("docs/**"));
    expect([(await laneRowOf(d, c.lane)).conflict, (await laneRowOf(d, later.lane)).conflict]).toEqual(["exclusive", "by-scope"]);

    const r = await makeRoom();
    expect(await failure(r.stub.submit(await signed(r, r.admin, "claim", null, claimBody(), { binding })))).toMatchObject({ code: "bad-request", message: "envelope.binding is not a field of this type." });
    expect(await failure(r.stub.submit(await signed(r, r.admin, "claim", null, claimBody(), { binding: null, v: 2 })))).toMatchObject({ code: "bad-request", message: "envelope.v must be 1." });
    expect((await failure(r.stub.submit(await signed(r, r.admin, "recover", null, { op: "open", goal: "g", scope: [".artroom/**"] }, { binding: null })))).code).toBe("bad-request");
    const legacy = await r.admin.ok<Claim>("claim", null, claimBody());
    expect(await laneRowOf(r, legacy.lane)).toMatchObject({ kind: "claim", binding: null, lease_ms: null, purpose: "ordinary", conflict: null });
    const opened = (await entryOf(r, legacy.id)).entry.receipt!.effects.find((e) => e["type"] === "opened")!;
    expect("kind" in opened || "binding" in opened).toBe(false);
    // A reader is still told the thread's kind.
    expect(await r.admin.read({ q: "lane", lane: legacy.lane })).toMatchObject({ kind: "claim" });
    // Admission judges step 1 again under the document it decides with, inside the queue: an activation between
    // the first check and the decision cannot let an envelope of the other vocabulary through.
    const other = await signed(r, r.admin, "claim", null, claimBody("lib/**"), { binding });
    const decided = await inDO(r, async (room) => {
      const { earlySteps } = await import("../../src/admission.ts");
      try {
        earlySteps(room.core, other as never, "submitted", "x");
        return "decided";
      } catch (e) {
        return (e as { code?: string }).code ?? "threw";
      }
    });
    expect(decided).toBe("bad-request");
  });

  it("a room moves from v1 to v2 by landing a v2 document, through validation and the landing engine; its legacy thread then takes declared acts", async () => {
    const r = await makeRoom();
    const c = await r.admin.ok<Claim>("claim", null, { goal: "policy", scope: [".artroom/**"] });
    const head = pushChange(r, c.lane, { ".artroom/policy.json": JSON.stringify(v2()) });
    await r.admin.ok("propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "to v2" });
    await r.admin.ok("review", { lane: c.lane, generation: 1 }, { head, verdict: "approve", scope: [".artroom/**"], text: "ok" });
    const l = (await r.admin.ok("land", { lane: c.lane, generation: 1 }, { lease: 1, head })) as unknown as { op: { id: string } };
    await tick(r, 4);
    expect((await landing(r, l.op.id)).state).toBe("landed");
    expect(await inDO(r, (room) => room.core.activePolicy().doc.format)).toBe("artroom-policy-v2");
    expect(await laneRowOf(r, c.lane)).toMatchObject({ kind: "claim", binding: null, lease_ms: null });
    expectRefusal(await r.admin.act("release", { lane: c.lane }, { lease: 1 }), "binding-stale");
    expectOk(await act(r, r.admin, "release", { lane: c.lane }, { lease: 1 }));
  });
});

describe("who may sign (R-DECL-11)", () => {
  it("a declared kind's who.roles decide at step 4, unrecorded, with admin implicit and never the legacy table; renew keeps the legacy table", async () => {
    const r = await declaredRoom(
      v2((a) => {
        a["claim"] = { ...a["claim"]!, who: { roles: ["maintainer"] } };
        a["ask"] = { ...ASK, who: { roles: ["checker"] } };
      }),
    );
    const bob = await addMember(r, "@bob", "member");
    const ci = await addMember(r, "@ci", "checker");
    const c = await ok<Claim>(r, r.admin, "claim", null, claimBody());
    const seq = await headSeq(r);
    expect(expectRefusal(await act(r, bob, "claim", null, claimBody("docs/**")), "role-forbids").act).toBeUndefined();
    expectRefusal(await act(r, bob, "ask", { act: c.id }, { text: "?" }), "role-forbids");
    expectRefusal(await act(r, ci, "renew", { lane: c.lane }, { lease: 1 }, { binding: null }), "role-forbids");
    expect(await headSeq(r)).toBe(seq);
    // A checker signs a kind the legacy table never let it sign.
    expect((await ok(r, ci, "ask", { act: c.id }, { text: "?" })).kind).toBe("ask");
  });
});

describe("step 4a: kind-undeclared and binding-stale, unrecorded (R-DECL-16)", () => {
  it("an undeclared kind is kind-undeclared after authority and before the body check; a name every object inherits is undeclared too", async () => {
    const r = await declaredRoom();
    const before = await headSeq(r);
    const other = `sha256:${"1".repeat(64)}`;
    // A body no declaration could accept: the kind is judged first.
    const out = expectRefusal(await act(r, r.admin, "merge", null, { anything: true }, { binding: other }), "kind-undeclared");
    expect(out.reason).toBe(`The kind merge is not declared in the room's active policy, version ${await policyVersion(r)}.`);
    expect(out.act).toBeUndefined();
    expectRefusal(await act(r, r.admin, "constructor", null, {}, { binding: other }), "kind-undeclared");
    // Authority first: a key of no member is not-member, whatever the kind.
    expectRefusal(await act(r, new Client(r, newKeyPair()), "merge", null, {}, { binding: other }), "not-member");
    expect(await headSeq(r)).toBe(before);
  });

  it("a v: 1 envelope of a declared kind, and a v: 2 one with another binding, are binding-stale with the current binding and version; the signer signs again under the same key", async () => {
    const r = await declaredRoom();
    const current = { binding: (await bindingIn(r, "claim"))!, policy: await policyVersion(r) };
    const before = await headSeq(r);
    const v1 = expectRefusal(await act(r, r.admin, "claim", null, claimBody(), { binding: null, ikey: "same-intent" }), "binding-stale");
    expect(v1.current).toEqual(current);
    expect(v1.reason).toContain("carries no binding");
    expect(v1.act).toBeUndefined();
    const other = expectRefusal(await act(r, r.admin, "claim", null, claimBody(), { binding: `sha256:${"2".repeat(64)}`, ikey: "same-intent" }), "binding-stale");
    expect(other.current).toEqual(current);
    expect(await headSeq(r)).toBe(before);
    // Not recorded, so the same idempotency key signs the same intent again under the active binding.
    expectOk(await act(r, r.admin, "claim", null, claimBody(), { ikey: "same-intent" }));
  });

  it("an act signed before its meaning changed is binding-stale; an update that leaves the binding equal admits it; an exact retry of an accepted act gets its receipt across both", async () => {
    const r = await declaredRoom();
    const before = (await bindingIn(r, "claim"))!;
    const accepted = await signed(r, r.admin, "claim", null, claimBody());
    const first = expectOk(await call<Claim | Refusal>(r.stub.submit(accepted)));
    const waiting = await signed(r, r.admin, "claim", null, claimBody("docs/**"));
    const late = await signed(r, r.admin, "claim", null, claimBody("lib/**"));
    // A new kind, a changed refuse rule, a new label and wording: none is part of the meaning of claim.
    await activate(
      r,
      v2(
        (a) => {
          a["claim"] = { ...a["claim"]!, label: "Take a scope", help: "Claim paths.", refusals: { "scope-overlap": { reason: "Overlaps {lane}.", fix: "Narrow it." } } };
          a["ask"] = ASK;
        },
        policy(rule({ id: "no-docs", on: ["propose"], refuse: "false", reason: "Never.", fix: "None." })),
      ),
    );
    expect(await bindingIn(r, "claim")).toBe(before);
    expectOk(await call(r.stub.submit(waiting)));
    // The lease length is part of it.
    await activate(r, v2(shorterLease));
    const stale = expectRefusal(await call(r.stub.submit(late)), "binding-stale");
    expect(stale.current?.binding).toBe(await bindingIn(r, "claim"));
    expect(stale.current?.binding).not.toBe(before);
    // Idempotency is asked before step 4a: the accepted envelope gets its original receipt, and nothing is recorded.
    const seq = await headSeq(r);
    expect(await call(r.stub.submit(accepted))).toEqual(first);
    expect(await headSeq(r)).toBe(seq);
    // The same intent under the new binding is other bytes: idempotency-mismatch on the same key.
    expectRefusal(await call(r.stub.submit(await signed(r, r.admin, "claim", null, claimBody(), { ikey: keyOf(accepted) }))), "idempotency-mismatch");
  });

  it("across a change of shape: an exact retry gets its receipt after its declaration lost the target it used, and after the room returned to v1; an act signed before the change is binding-stale; nothing else is answered", async () => {
    const r = await declaredRoom();
    const c = await ok<Claim>(r, r.admin, "claim", null, claimBody());
    const note = await signed(r, r.admin, "note", { act: c.id }, { text: "hello" });
    const first = expectOk(await call<ActRecord | Refusal>(r.stub.submit(note)));
    const unsent = await signed(r, r.admin, "note", { act: c.id }, { text: "signed before" });
    await activate(r, v2((a) => void (a["note"] = { ...a["note"]!, targets: { line: ["comment"] } })));
    expect(await call(r.stub.submit(note))).toEqual(first);
    // Signed for the earlier meaning: step 4a answers before the target is judged, with the binding now in force.
    const stale = expectRefusal(await call<ActRecord | Refusal>(r.stub.submit(unsent)), "binding-stale");
    expect(stale.current?.binding).toBe(await bindingIn(r, "note"));
    // Signed for the meaning in force, on a target that meaning does not take: bad-request, in step 1's words.
    const fresh = await signed(r, r.admin, "note", { act: c.id }, { text: "again" });
    expect((await failure(r.stub.submit(fresh))).code).toBe("bad-request");
    // Another body under the accepted key is another act; another signature on the accepted envelope is not authentic.
    expectRefusal(await call(r.stub.submit(await signed(r, r.admin, "note", { act: c.id }, { text: "other" }, { ikey: keyOf(note) }))), "idempotency-mismatch");
    expect((await failure(r.stub.submit({ envelope: note.envelope, sig: fresh.sig } as never))).code).toBe("unauthenticated");

    // The room returns to a v1 document, where step 1 refuses every v: 2 envelope before idempotency is asked.
    const binding = (await bindingIn(r, "claim"))!;
    const claim = await signed(r, r.admin, "claim", null, claimBody("docs/**"));
    const accepted = expectOk(await call<ActRecord | Refusal>(r.stub.submit(claim)));
    await activate(r, policy());
    const seq = await headSeq(r);
    expect(await call(r.stub.submit(claim))).toEqual(accepted);
    // Only the exact envelope, with its own signature and nothing beside it, is answered.
    const late = await signed(r, r.admin, "claim", null, claimBody("lib/**"), { binding });
    const notAnswered: unknown[] = [
      late,
      await signed(r, r.admin, "claim", null, { goal: "other", scope: ["docs/**"] }, { binding, ikey: keyOf(claim) }),
      { envelope: claim.envelope, sig: late.sig },
      { ...claim, extra: 1 },
      { envelope: { ...(claim.envelope as object), actor: { toString: 1 } }, sig: claim.sig },
      Object.assign([], claim),
      null,
    ];
    for (const submission of notAnswered) expect((await failure(r.stub.submit(submission as never))).code, JSON.stringify(submission).slice(0, 80)).toBe("bad-request");
    expect(await call(r.stub.submit(claim))).toEqual(accepted);
    expect(await headSeq(r)).toBe(seq);
  });
});

describe("grants carry the bindings their grantor signed (R-DECL-17)", () => {
  it("a grant is judged when it is admitted: a stale binding is binding-stale, an undeclared kind kind-undeclared, and the grantor's role and who.delegable bound the map and the platform kinds; nothing refused is recorded", async () => {
    const r = await declaredRoom(v2((a) => void (a["land"] = { ...a["land"]!, who: { roles: ["maintainer", "member", "agent"], delegable: false } })));
    const bob = await addMember(r, "@bob", "member");
    const ci = await addMember(r, "@ci", "checker");
    const k = newKeyPair().key;
    const grant = (who: Client, acts: Record<string, string>, kinds: string[] = []) => act(r, who, "roster", null, delegateOp(k, acts, kinds), { binding: null });
    const b = async (kind: string) => (await bindingIn(r, kind))!;
    const seq = await headSeq(r);
    const stale = expectRefusal(await grant(bob, { claim: `sha256:${"3".repeat(64)}` }), "binding-stale");
    expect(stale.current?.binding).toBe(await b("claim"));
    expectRefusal(await grant(bob, { merge: `sha256:${"3".repeat(64)}` }), "kind-undeclared");
    expect(expectRefusal(await grant(bob, { check: await b("check") }), "delegation-invalid").reason).toBe("The role member may not grant check.");
    expect(expectRefusal(await grant(bob, { land: await b("land") }), "delegation-invalid").reason).toBe("land may not be delegated.");
    // The plain kinds are platform kinds the grantor's role may sign: a checker may not sign renew, so may not grant it,
    // nor be invited with a session that lists it.
    expect(expectRefusal(await grant(ci, {}, ["renew"]), "delegation-invalid").reason).toBe("The role checker may not grant renew.");
    const session = { kinds: ["renew"], acts: {}, lanes: "*", ttlSeconds: 3600 };
    const invite = { op: "invite", member: "@bot", role: "checker", custody: "room", expiresAt: iso(clock.now + day), secretHash: digestBytes(randomBytes(32)), session };
    expect(expectRefusal(await act(r, r.admin, "roster", null, invite, { binding: null }), "invalid-body").reason).toBe("The role checker may not sign every kind the session lists.");
    // `*` is not a grant in a v2 room.
    expectRefusal(await act(r, bob, "roster", null, { op: "delegate", to: k, kinds: "*", lanes: "*", expiresAt: iso(clock.now + day) }, { binding: null }), "invalid-body");
    expect(await headSeq(r)).toBe(seq);
    const granted = expectOk(await grant(bob, { claim: await b("claim"), note: await b("note") }, ["renew"]));
    expect(await delegationOf(r, granted.id)).toMatchObject({ kinds: ["renew"], acts: { claim: await b("claim"), note: await b("note") } });
  });

  it("a grant covers a declared kind only by its map, under the binding it names, while the kind may be delegated and its grantor may sign it: each is judged at every use", async () => {
    const r = await declaredRoom(v2((a) => void (a["ask"] = ASK)));
    const bob = await addMember(r, "@bob", "member");
    const k = newKeyPair();
    const env = await signed(r, bob, "roster", null, delegateOp(k.key, { claim: (await bindingIn(r, "claim"))!, ask: (await bindingIn(r, "ask"))! }, ["renew"]), { binding: null });
    const grant = expectOk(await call<RosterRecord | Refusal>(r.stub.submit(env)));
    const d = new Client(r, k, grant.id);
    const c = await ok<Claim>(r, d, "claim", null, claimBody());
    expect(c.by).toMatchObject({ via: "delegation", member: "@bob", delegation: grant.id });
    expectOk(await act(r, d, "renew", { lane: c.lane }, { lease: 1 }, { binding: null }));
    const refusedAs = async (kind: string, target: unknown, body: unknown) => {
      const seq = await headSeq(r);
      const out = expectRefusal(await act(r, d, kind, target, body), "delegation-invalid");
      expect(out.act).toBeUndefined();
      expect(await headSeq(r)).toBe(seq);
      return out.reason;
    };
    // A kind the map does not name, though the grantor may sign it.
    expect(await refusedAs("note", { act: c.id }, { text: "n" })).toBe(`Delegation ${grant.id} does not cover note.`);
    // who.delegable and who.roles are not part of the binding (R-DECL-15), so they are asked again at each use.
    const ask = (await bindingIn(r, "ask"))!;
    await activate(r, v2((a) => void (a["ask"] = { ...ASK, who: { roles: ["member", "agent"], delegable: false } })));
    expect(await bindingIn(r, "ask")).toBe(ask);
    expect(await refusedAs("ask", { act: c.id }, { text: "?" })).toBe("ask may not be delegated.");
    expectOk(await act(r, bob, "ask", { act: c.id }, { text: "?" }));
    await activate(r, v2((a) => void (a["ask"] = { ...ASK, who: { roles: ["agent"] } })));
    expect(await refusedAs("ask", { act: c.id }, { text: "?" })).toContain("may no longer sign ask");
    // The meaning of claim changes: the grant names the earlier one. Its exact retry still gets its receipt.
    await activate(r, v2(shorterLease));
    expect(await refusedAs("claim", null, claimBody("docs/**"))).toBe("The delegation was granted for an earlier meaning of claim.");
    expect(await call(r.stub.submit(env))).toEqual(grant);
  });

  it("a grant never gains a kind across a change of vocabulary: a v1-era grant covers only renew under v2, and a v2 grant only renew under v1", async () => {
    const r = await makeRoom();
    const bob = await addMember(r, "@bob", "member");
    const k1 = newKeyPair();
    const k2 = newKeyPair();
    const star = await bob.ok<RosterRecord>("roster", null, { op: "delegate", to: k1.key, kinds: "*", lanes: "*", expiresAt: iso(clock.now + day) });
    const narrow = await bob.ok<RosterRecord>("roster", null, { op: "delegate", to: k2.key, kinds: ["claim", "note"], lanes: "*", expiresAt: iso(clock.now + day) });
    const c = await bob.ok<Claim>("claim", null, claimBody());
    await activate(r, v2());
    const d1 = new Client(r, k1, star.id);
    expect(await delegationOf(r, star.id)).not.toHaveProperty("acts");
    expect(expectRefusal(await act(r, d1, "claim", null, claimBody("docs/**")), "delegation-invalid").reason).toContain("was granted before this room declared its acts");
    expectOk(await act(r, d1, "renew", { lane: c.lane }, { lease: 1 }, { binding: null }));
    expectRefusal(await act(r, new Client(r, k2, narrow.id), "renew", { lane: c.lane }, { lease: 1 }, { binding: null }), "delegation-invalid");
    // A grant made under v2, with a map and renew, after the room returns to v1.
    const k3 = newKeyPair();
    const mapped = await ok<RosterRecord>(r, bob, "roster", null, delegateOp(k3.key, { claim: (await bindingIn(r, "claim"))!, release: (await bindingIn(r, "release"))! }, ["renew"]), { binding: null });
    await activate(r, policy());
    const d3 = new Client(r, k3, mapped.id);
    expectRefusal(await d3.act("claim", null, claimBody("docs/**")), "delegation-invalid");
    expectRefusal(await d3.act("release", { lane: c.lane }, { lease: 1 }), "delegation-invalid");
    expectOk(await d3.act("renew", { lane: c.lane }, { lease: 1 }));
  });
});

describe("room-custody sessions across a change of vocabulary (R-DECL-17, R-CRED-3)", () => {
  it("a session's map is judged when its invitation is admitted, and again when it is redeemed: a meaning that changed, or a kind that was retired, is binding-stale and leaves the invitation unused", async () => {
    const r = await declaredRoom(v2((a) => void (a["ask"] = ASK)));
    const claim = (await bindingIn(r, "claim"))!;
    const seq = await headSeq(r);
    const refused = async (acts: Record<string, string>) => act(r, r.admin, "roster", null, { op: "invite", member: "@a0", role: "agent", custody: "room", expiresAt: iso(clock.now + day), secretHash: digestBytes(randomBytes(32)), session: { kinds: ["renew"], acts, lanes: "*", ttlSeconds: 3600 } }, { binding: null });
    expect(expectRefusal(await refused({ claim: `sha256:${"3".repeat(64)}` }), "binding-stale").current?.binding).toBe(claim);
    expectRefusal(await refused({ merge: `sha256:${"3".repeat(64)}` }), "kind-undeclared");
    expect(expectRefusal(await refused({ check: (await bindingIn(r, "check"))! }), "invalid-body").reason).toBe("The role agent may not sign every kind the session lists.");
    expect(await headSeq(r)).toBe(seq);
    const changed = await invited(r, "@a1", "agent", { kinds: ["renew"], acts: { claim } });
    const retired = await invited(r, "@a2", "agent", { kinds: [], acts: { ask: (await bindingIn(r, "ask"))! } });
    const kept = await invited(r, "@a3", "agent", { kinds: ["renew"], acts: { note: (await bindingIn(r, "note"))! } });
    await activate(r, v2(shorterLease));
    const after = await headSeq(r);
    expect(expectRefusal(await changed.redeem(), "binding-stale").current?.binding).toBe(await bindingIn(r, "claim"));
    // The grant's own code for an undeclared kind is kind-undeclared; a redemption answers binding-stale.
    expect(expectRefusal(await retired.redeem(), "binding-stale").reason).toContain("no longer declares ask");
    expect(await headSeq(r)).toBe(after);
    expect([await changed.unused(), await retired.unused()]).toEqual([true, true]);
    const b = expectOk(await kept.redeem());
    expect(await delegationOf(r, b.delegation)).toMatchObject({ kinds: ["renew"], acts: { note: await bindingIn(r, "note") } });
  });

  it("a redemption is granted under the document in force when it is decided, inside the queue: a session with a map, behind a return to v1, is binding-stale and stays unused; one of renew alone is redeemed", async () => {
    const d = await declaredRoom();
    const mapped = await invited(d, "@a1", "agent", { kinds: ["renew"], acts: { claim: (await bindingIn(d, "claim"))! } });
    const renewOnly = await invited(d, "@a2", "agent", { kinds: ["renew"], acts: {} });
    // The redemption arrives while an activation holds the queue: the room returns to a v1 document first.
    const out = await inDO(d, async (room) => {
      let go = () => {};
      const gate = new Promise<void>((resolve) => (go = resolve));
      const first = room.core.serial(async () => {
        await gate;
        room.core.sql.transaction(() => room.core.activate(policy() as never, room.core.activePolicy().checkers, null, iso(clock.now)));
      });
      const redeemed = redeem(room.core, { custody: "room", invitation: mapped.id, secret: mapped.secret }, "x", "https://artroom.test");
      go();
      await first;
      return redeemed;
    });
    const seq = await headSeq(d);
    const refused = expectRefusal(out, "binding-stale");
    expect(refused.reason).toContain("declares no acts");
    expect(refused.current).toEqual({ policy: await policyVersion(d) });
    expect(await mapped.unused()).toBe(true);
    expect(await headSeq(d)).toBe(seq);
    expect((await delegationOf(d, expectOk(await renewOnly.redeem()).delegation)).kinds).toEqual(["renew"]);
  });

  it("an invitation never gains a kind: with no session it grants the delegable platform kinds of its role under the vocabulary it was admitted in, whatever the room is when it is redeemed", async () => {
    // Admitted under v2, where no session means renew alone.
    const d = await declaredRoom();
    const under2 = await bearer(d, "@a1", "agent");
    expect(await delegationOf(d, under2.delegation)).toMatchObject({ kinds: ["renew"], acts: {} });
    const seq = await headSeq(d);
    const claim = expectRefusal(await bearerAct(d, under2, { kind: "claim", target: null, body: claimBody(), idempotencyKey: "b1" }), "delegation-invalid");
    expect(claim.reason).toBe(`Delegation ${under2.delegation} does not cover claim.`);
    expect(await headSeq(d)).toBe(seq);
    const agent = await invited(d, "@a2", "agent");
    const checker = await invited(d, "@ci", "checker");
    await activate(d, policy());
    // Redeemed after the room returned to v1: still renew alone, never the legacy `*`.
    const late = expectOk(await agent.redeem());
    expect((await delegationOf(d, late.delegation)).kinds).toEqual(["renew"]);
    expectRefusal(await bearerAct(d, late, { kind: "claim", target: null, body: claimBody("docs/**"), idempotencyKey: "b1" }), "delegation-invalid");
    // A checker may sign no delegable platform kind: its session would grant nothing, and is refused with a reason.
    const none = expectRefusal(await checker.redeem(), "delegation-invalid");
    expect(none.reason).toContain("grants no kind");
    expect(await checker.unused()).toBe(true);

    // Admitted under v1 and redeemed after the first v2 activation: the intersection with the platform kinds.
    const r = await makeRoom();
    const narrow = await invited(r, "@one", "agent", { kinds: ["claim", "propose"] });
    const wide = await invited(r, "@two", "agent", { kinds: ["claim", "renew"] });
    // The control: with no session, admitted and redeemed under v1, it is the legacy `*`, as it always was.
    const legacy = await bearer(r, "@four", "agent");
    expectOk(await bearerAct(r, legacy, { kind: "claim", target: null, body: claimBody(), idempotencyKey: "b1" }));
    await activate(r, v2());
    expect(await delegationOf(r, expectOk(await narrow.redeem()).delegation)).toMatchObject({ kinds: [], acts: {} });
    expect(await delegationOf(r, expectOk(await wide.redeem()).delegation)).toMatchObject({ kinds: ["renew"], acts: {} });
  });

  it("a bearer act carries the code-review binding of its kind, or the binding the caller names: admitted where that is the room's meaning, binding-stale where the room's meaning has changed since the grant", async () => {
    const r = await declaredRoom();
    const codeReview = (await bindingIn(r, "claim"))!;
    const b = await bearer(r, "@agent", "agent", { kinds: ["renew"], acts: { claim: codeReview } });
    const first = expectOk(await bearerAct<Claim>(r, b, { kind: "claim", target: null, body: claimBody(), idempotencyKey: "b1" }));
    expect((await entryOf(r, first.id)).entry.act!.envelope).toMatchObject({ v: 2, kind: "claim", binding: codeReview, delegation: b.delegation });
    // A platform kind is a v: 1 envelope with no binding.
    const renewed = expectOk<ActRecord>(await bearerAct(r, b, { kind: "renew", target: { lane: first.lane }, body: { lease: 1 }, idempotencyKey: "b2" }));
    expect((await entryOf(r, renewed.id)).entry.act!.envelope).toMatchObject({ v: 1, kind: "renew" });
    expect((await entryOf(r, renewed.id)).entry.act!.envelope).not.toHaveProperty("binding");
    // The room's claim changes after the grant. The tool's binding is the grant's, so step 4 passes, and step 4a
    // refuses it with the binding now in force. Not recorded.
    await activate(r, v2(shorterLease));
    const seq = await headSeq(r);
    const stale = expectRefusal(await bearerAct(r, b, { kind: "claim", target: null, body: claimBody("docs/**"), idempotencyKey: "b3" }), "binding-stale");
    expect(stale.reason).toContain(`The act was prepared for claim as ${codeReview}`);
    expect(stale.current).toMatchObject({ binding: await bindingIn(r, "claim") });
    expect(await headSeq(r)).toBe(seq);
    // A session granted for the room's own meaning names it in each act; the tool's binding is then not the grant's.
    const own = await bearer(r, "@other", "agent", { kinds: [], acts: { claim: (await bindingIn(r, "claim"))! } });
    expect(expectRefusal(await bearerAct(r, own, { kind: "claim", target: null, body: claimBody("docs/**"), idempotencyKey: "c1" }), "delegation-invalid").reason).toBe("The delegation was granted for an earlier meaning of claim.");
    expectOk(await bearerAct(r, own, { kind: "claim", target: null, body: claimBody("docs/**"), idempotencyKey: "c2", binding: (await bindingIn(r, "claim"))! }));
    // An act with no text for its key or kind is refused as a shape, never an internal failure.
    for (const field of ["idempotencyKey", "kind"]) expect((await failure(r.stub.bearerAct(own.bearer, { kind: "claim", target: null, body: claimBody("lib/**"), idempotencyKey: "c3", [field]: { toString: 1 } } as never))).code, field).toBe("bad-request");
  });

  it("a bearer session's retry is built as its first attempt was, across a change of vocabulary: an accepted act and a recorded refusal get their original results; the same key with another act is idempotency-mismatch", async () => {
    // From v1 to v2: the first attempts were v: 1 envelopes with no binding.
    const r = await makeRoom();
    const b = await bearer(r, "@agent", "agent", { kinds: ["claim", "release", "renew"] });
    const theirs = await r.admin.ok<Claim>("claim", null, claimBody("lib/**"));
    const claim = { kind: "claim", target: null, body: claimBody(), idempotencyKey: "retry-1" };
    const release = { kind: "release", target: { lane: theirs.lane }, body: { lease: 1 }, idempotencyKey: "retry-2" };
    const first = expectOk(await bearerAct(r, b, claim));
    const refused = expectRefusal(await bearerAct(r, b, release), "not-holder");
    expect(refused.act).toBeDefined();
    // A bearer act that names a binding is not for a v1 room.
    expect((await failure(r.stub.bearerAct(b.bearer, { ...claim, idempotencyKey: "bound-1", binding: `sha256:${"a".repeat(64)}` } as never))).code).toBe("bad-request");
    await activate(r, v2());
    const seq = await headSeq(r);
    expect(await bearerAct(r, b, claim)).toEqual(first);
    expect(await bearerAct(r, b, release)).toEqual(refused);
    expectRefusal(await bearerAct(r, b, { ...claim, body: { goal: "other", scope: ["src/**"] } }), "idempotency-mismatch");
    // A new act is judged under the v2 document, where the v1-era session covers no declared kind.
    expectRefusal(await bearerAct(r, b, { ...claim, idempotencyKey: "new-1", body: claimBody("docs/**") }), "delegation-invalid");
    expect(await headSeq(r)).toBe(seq);
    // From v2 to v1: the first attempt was a v: 2 envelope with the code-review binding.
    const d = await declaredRoom();
    const db = await bearer(d, "@agent", "agent", { kinds: ["renew"], acts: { claim: (await bindingIn(d, "claim"))! } });
    const dFirst = expectOk<ActRecord>(await bearerAct(d, db, claim));
    await activate(d, policy());
    expect(await bearerAct(d, db, claim)).toEqual(dFirst);
    // Another act under the used key is built for the document in force, and admission names the original entry.
    const other = expectRefusal(await bearerAct(d, db, { ...claim, body: { goal: "other", scope: ["docs/**"] } }), "idempotency-mismatch");
    expect(other.reason).toContain(dFirst.id);
  });
});

describe("threads have kinds, and an act acts only on the kinds its declaration names (R-DECL-6, R-DECL-8, R-DECL-23)", () => {
  it("every step is reached through a declared kind of another name, and the reads follow the step an act ran, not a legacy name", async () => {
    const names: Record<string, string> = { claim: "start", propose: "submit", note: "say", review: "approve", check: "attest", land: "ship", release: "drop" };
    const acts: Acts = {};
    for (const [old, d] of Object.entries(structuredClone(CODE_REVIEW_ACTS) as Acts)) acts[names[old]!] = { ...d, ...(d.threads ? { threads: ["start", "room"] } : {}) };
    const base = reviewed();
    const doc = { ...codeReviewPolicy(base), acts, rules: [...base.rules, { id: "tell", kind: "notify", on: ["submit"], to: ["role:admin"], why: "A submission." }] } as unknown as PolicyDocumentV2;
    const r = await declaredRoom(doc);
    const bob = await addMember(r, "@bob", "member");
    const c = await ok<Claim>(r, bob, "start", null, claimBody());
    expect(c.kind).toBe("start");
    expect((await laneRowOf(r, c.lane)).kind).toBe("start");
    expectOk(await bob.request({ kind: "workspace", lane: c.lane, lease: 1 }));
    const head = pushChange(r, c.lane, { "src/app.ts": "v2" });
    const p = await ok(r, bob, "submit", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" });
    const said = await ok(r, r.admin, "say", { act: p.id }, { text: "hm" });
    await ok(r, r.admin, "approve", { lane: c.lane, generation: 1 }, { head, verdict: "approve", scope: ["src/**"], text: "ok" });
    const l = (await ok(r, bob, "ship", { lane: c.lane, generation: 1 }, { lease: 1, head })) as unknown as { op: { id: string } };
    await tick(r, 6);
    expect((await landing(r, l.op.id)).state).toBe("landed");
    const c2 = await ok<Claim>(r, bob, "start", null, claimBody("docs/**"));
    expect((await ok(r, bob, "drop", { lane: c2.lane }, { lease: 1 })).kind).toBe("drop");
    // The update summary names the thread an act opened; explain carries the evidence of the act that made a version.
    const summaryOf = (id: string) =>
      inDO(r, async (room) => {
        const { summary } = await import("../../src/reads.ts");
        const { entryById } = await import("../../src/log.ts");
        return summary(entryById(room.core.sql, id)!);
      });
    expect((await summaryOf(c.id)).lane).toBe(c.lane);
    expect((await summaryOf(said.id)).lane).toBeUndefined();
    expect((await r.admin.read({ q: "explain", act: p.id }))?.evidence).toBeDefined();
    expect((await r.admin.read({ q: "explain", act: c.id }))?.evidence).toBeUndefined();
    expect((await r.admin.read({ q: "attention" })).items.map((i) => i.why)).toContain("review-requested");
  });

  it("an act on a thread whose kind its declaration does not name is wrong-thread, recorded at step 7; an entry target is not a thread target; recover and the declared acts keep to their own threads", async () => {
    const r = await declaredRoom(
      v2((a) => {
        a["release"] = { ...a["release"]!, threads: ["room"] };
        a["note"] = { ...a["note"]!, threads: ["room"] };
      }),
    );
    const c = await ok<Claim>(r, r.admin, "claim", null, claimBody());
    const wt = expectRefusal(await act(r, r.admin, "release", { lane: c.lane }, { lease: 1 }), "wrong-thread");
    expect(wt.act).toBeDefined();
    expect(wt.reason).toBe(`${c.lane} is a claim thread, which release does not act on.`);
    // A note on an entry of that thread is admitted: `threads` binds the thread, version and line targets only.
    expectOk(await act(r, r.admin, "note", { act: c.id }, { text: "on the entry" }));
    const head = pushChange(r, c.lane, { "src/app.ts": "v2" });
    await ok(r, r.admin, "propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" });
    expectRefusal(await act(r, r.admin, "note", { lane: c.lane, generation: 1, head, path: "src/app.ts", line: 1 }, { text: "on a line" }), "wrong-thread");
    // A room thread takes the acts that name room. Renew, a platform kind, acts on a thread of any kind.
    const room = await revertLane(r, "lib/**");
    expectOk(await act(r, r.admin, "claim", { lane: room }, { scope: ["lib/**"], expectedGeneration: 0 }));
    expectOk(await act(r, r.admin, "renew", { lane: room }, { lease: 1 }, { binding: null }));
    expectOk(await act(r, r.admin, "release", { lane: room }, { lease: 1 }));
    // A configuration-recovery thread takes only recover ops, and recover acts on no other thread, nor on an entry of none.
    const rec = await ok<Claim>(r, r.admin, "recover", null, { op: "open", goal: "repair", scope: [".artroom/policy.json"] }, { binding: null });
    expect(await laneRowOf(r, rec.lane)).toMatchObject({ kind: "recover", binding: null, lease_ms: LEASE, purpose: "config-recovery", conflict: "by-scope" });
    expect(expectRefusal(await act(r, r.admin, "note", { act: rec.id }, { text: "hi" }), "wrong-thread").fix).toContain("recover");
    expectRefusal(await act(r, r.admin, "propose", { lane: rec.lane }, { lease: 1, expectedGeneration: 0, head: "a".repeat(40), summary: "s" }), "wrong-thread");
    expectRefusal(await act(r, r.admin, "recover", { lane: c.lane }, { op: "release", lease: 1 }, { binding: null }), "wrong-thread");
    const roster = String(await inDO(r, (x) => x.core.sql.all("SELECT id FROM entries WHERE lane IS NULL AND seq > 0 ORDER BY seq LIMIT 1")[0]!["id"]));
    expectRefusal(await act(r, r.admin, "recover", { act: roster }, { op: "note", text: "x" }, { binding: null }), "wrong-thread");
    expectOk(await act(r, r.admin, "renew", { lane: rec.lane }, { lease: 1 }, { binding: null }));
  });

  it("a retired opening kind: its held thread with an open version is still reviewed and released by acts that name it; a new act of it is kind-undeclared; a document may name it in threads only where it opened a thread", async () => {
    const r = await declaredRoom(v2(() => {}, reviewed()));
    const bob = await addMember(r, "@bob", "member");
    const c = await ok<Claim>(r, bob, "claim", null, claimBody());
    const head = pushChange(r, c.lane, { "src/app.ts": "v2" });
    await ok(r, bob, "propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" });
    // claim is retired; `open-work` opens threads now, and the others still name claim threads.
    const retired = v2((a) => {
      const claim = a["claim"]!;
      delete a["claim"];
      a["open-work"] = { ...claim, label: "Open work", threads: ["open-work", "room"] };
      for (const k of ["propose", "note", "review", "check", "land", "release"]) a[k] = { ...a[k]!, threads: ["claim", "open-work", "room"] };
    }, reviewed());
    // The validator takes the room's historical opening kinds (R-DECL-24): the document is valid here, and in a room
    // where no claim thread ever opened it is not. Neither `recover` nor an unknown name is such a kind.
    const parse = (x: TestRoom, doc: unknown) => inDO(x, (room) => room.core.parseConfig(JSON.stringify(doc), {}) as { ok: boolean; problems?: string[] });
    const fresh = await declaredRoom(v2((a) => void (a["task"] = { ...a["claim"]!, label: "Task", threads: ["task"] })));
    await ok(fresh, fresh.admin, "recover", null, { op: "open", goal: "repair", scope: [".artroom/**"] }, { binding: null });
    expect(await parse(r, retired)).toMatchObject({ ok: true });
    expect((await parse(fresh, retired)).problems?.join(" ")).toContain("claim is not room, a kind declared here with step open, or a kind that has opened a thread in this room");
    expect((await parse(fresh, v2((a) => void (a["release"] = { ...a["release"]!, threads: ["claim", "recover"] })))).problems?.join(" ")).toContain("recover is not room");
    await activate(r, retired);
    expectRefusal(await act(r, r.admin, "claim", null, claimBody("lib/**"), { binding: `sha256:${"4".repeat(64)}` }), "kind-undeclared");
    expectOk(await act(r, r.admin, "review", { lane: c.lane, generation: 1 }, { head, verdict: "approve", scope: ["src/**"], text: "ok" }));
    expectOk(await act(r, bob, "release", { lane: c.lane }, { lease: 1 }));
    const w = await ok<Claim>(r, bob, "open-work", null, claimBody("lib/**"));
    expect((await laneRowOf(r, w.lane)).kind).toBe("open-work");
  });
});

describe("what policy sees of a thread (R-EVAL-3 as amended)", () => {
  it("under a v2 document the lane input carries the thread's kind, and null where there is no thread, so a rule can read it", async () => {
    const r = await declaredRoom(
      v2(
        () => {},
        policy(
          rule({ id: "no-notes-on-claims", on: ["note"], refuse: "lane.kind = 'claim'", reason: "No notes on claim threads.", fix: "None." }),
          rule({ id: "lane-has-kind", on: ["claim"], refuse: "$exists(lane.kind) and act.body.goal = 'probe'", reason: "The lane input has a kind.", fix: "None." }),
        ),
      ),
    );
    const c = await ok<Claim>(r, r.admin, "claim", null, claimBody());
    expect(expectRefusal(await act(r, r.admin, "note", { act: c.id }, { text: "hello" }), "no-notes-on-claims").reason).toBe("No notes on claim threads.");
    // With no thread, the kind is null: present in the input, so `$exists` sees it.
    expect(expectRefusal(await act(r, r.admin, "claim", null, { goal: "probe", scope: ["docs/**"] }), "lane-has-kind").reason).toBe("The lane input has a kind.");
  });
});

describe("a declared act's body is the application's own (R-DECL-12, R-DECL-21)", () => {
  it("a declared field never reaches a step as a platform field: purpose opens no recovery thread, goal and text of another type are stored as empty text, and a field is present only as the body's own property", async () => {
    const doc = v2(
      (a) => {
        a["claim"] = {
          ...a["claim"]!,
          body: { goal: { type: "int", min: 0, max: 9, requiredFor: ["none"] }, purpose: { type: "enum", values: ["config-recovery", "demo"], optional: true }, toString: { type: "text" as const, max: 100, optional: true }, valueOf: { type: "text" as const, max: 100, optional: true } },
        };
        a["start"] = { label: "Start", targets: { none: ["open"] }, body: { valueOf: { type: "text" as const, max: 100 } }, who: { roles: ["member"] }, hold: { scope: "body.scope", workspace: true } };
        a["note"] = { ...a["note"]!, body: { text: { type: "bool" } } };
        a["ack"] = { label: "Ack", targets: { version: ["review"] }, threads: ["claim"], who: { roles: ["member"] } };
      },
      policy(requireReview({ paths: "src/**", from: "role:admin", id: "rv" }), rule({ id: "no-zero", on: ["claim"], refuse: "act.body.goal = 0", reason: "Rule reason.", fix: "Rule fix." })),
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
    // The declared type is the one admitted.
    expectRefusal(await act(r, bob, "claim", null, { goal: "seven", scope: ["docs/**"] }), "invalid-body");
    // toString and valueOf are not read from the prototype: an optional one is absent, a required one is required.
    expectRefusal(await act(r, bob, "claim", null, { goal: 1, scope: ["docs/**"], toString: 7 }), "invalid-body");
    expect(expectRefusal(await act(r, bob, "start", null, { scope: ["docs/**"] }), "invalid-body").reason).toBe("body.valueOf is required.");
    // The records keep the contract's fields: an opening act with no goal field, a review with no text field and a
    // comment whose text is not text return empty strings.
    const s = await ok<Claim>(r, bob, "start", null, { scope: ["docs/**"], valueOf: "v" });
    expect(s.goal).toBe("");
    const n = await ok(r, r.admin, "note", { act: c.id }, { text: true });
    expect((n as unknown as { text: unknown }).text).toBe("");
    const head = pushChange(r, c.lane, { "src/app.ts": "v2" });
    await ok(r, bob, "propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" });
    const rv = await ok<Review>(r, r.admin, "ack", { lane: c.lane, generation: 1 }, { head, verdict: "approve", scope: ["src/**"] });
    expect(rv.text).toBe("");
    expect(await r.admin.read({ q: "lane", lane: c.lane })).toMatchObject({ goal: "" });
  });
});

describe("refusal wording from the declaration (R-DECL-13)", () => {
  it("a platform refusal of a declared act takes the declaration's reason and fix, recorded or not, filled only with the room's own facts and bounded; the code stays the room's, and a rule's refusal keeps its own words", async () => {
    const doc = v2(
      (a) => {
        a["release"] = { ...a["release"]!, refusals: { "not-holder": { reason: "{lane} is {holder}'s to let go ({kind}, at {generation}).", fix: "Ask {holder}{reservedFor}." } } };
        a["note"] = { ...a["note"]!, refusals: { "lane-unknown": { reason: "No such entry for {kind}.", fix: "Pick another." }, "policy-type-error": { reason: "Declared {kind} wording.", fix: "Declared fix." } } };
        a["propose"] = { ...a["propose"]!, refusals: { "outside-claim": { reason: "{path}".repeat(85), fix: "Claim it." } } };
        const unrecorded = { "role-forbids": { reason: "lane [{lane}] generation [{generation}]", fix: "{lane}".repeat(80) }, "invalid-body": { reason: "Declared invalid {kind}.", fix: "Declared fix." }, "binding-stale": { reason: "Declared stale {kind}.", fix: "Declared fix." } };
        a["claim"] = { ...a["claim"]!, who: { roles: ["maintainer"] }, refusals: unrecorded };
      },
      policy(rule({ id: "quiet", on: ["note"], refuse: "act.body.text = 'shh'", reason: "Rule reason.", fix: "Rule fix." }), rule({ id: "typed", on: ["note"], refuse: "act.body.text = 'boom' ? 'not a boolean' : false", reason: "Never shown.", fix: "Never shown." })),
    );
    const r = await declaredRoom(doc);
    const bob = await addMember(r, "@bob", "member");
    const c = await ok<Claim>(r, r.admin, "claim", null, claimBody());
    // Recorded, at step 7: the slots are filled, and the entry holds the same words.
    const out = expectRefusal(await act(r, bob, "release", { lane: c.lane }, { lease: 1 }), "not-holder");
    expect(out).toMatchObject({ reason: `${c.lane} is @admin's to let go (release, at 0).`, fix: "Ask @admin." });
    expect((await entryOf(r, out.act!)).entry.receipt!.refusal).toMatchObject({ rule: "not-holder", reason: out.reason, fix: out.fix });
    expect(expectRefusal(await act(r, bob, "note", { act: "act_999_00000000" }, { text: "hi" }), "lane-unknown")).toMatchObject({ reason: "No such entry for note.", fix: "Pick another." });
    // A rule's refusal keeps the rule's words, also when its code is one the declaration words.
    expect(expectRefusal(await act(r, bob, "note", { act: c.id }, { text: "shh" }), "quiet")).toMatchObject({ reason: "Rule reason.", fix: "Rule fix." });
    expect(expectRefusal(await act(r, bob, "note", { act: c.id }, { text: "boom" }), "policy-type-error").reason).not.toContain("Declared");
    // An act with no wording for the code keeps the platform's.
    expect(expectRefusal(await act(r, bob, "propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head: "a".repeat(40), summary: "s" }), "not-holder").reason).not.toContain("to let go");
    // Unrecorded, at steps 4, 4a and 5. A lane and a generation are filled only in the room's own form: the signer's
    // 60,000 bytes are not copied into the refusal.
    expect(expectRefusal(await act(r, bob, "claim", { lane: "A".repeat(60_000), generation: 0 }, claimBody("docs/**")), "role-forbids")).toMatchObject({ reason: "lane [] generation []", fix: "" });
    expect(expectRefusal(await act(r, bob, "claim", { lane: c.lane, generation: 3 }, claimBody("docs/**")), "role-forbids")).toMatchObject({ reason: `lane [${c.lane}] generation [3]`, fix: c.lane.repeat(80) });
    expect(expectRefusal(await act(r, r.admin, "claim", null, { scope: ["docs/**"] }), "invalid-body").reason).toBe("Declared invalid claim.");
    const stale = expectRefusal(await act(r, r.admin, "claim", null, claimBody("docs/**"), { binding: `sha256:${"2".repeat(64)}` }), "binding-stale");
    expect(stale.reason).toBe("Declared stale claim.");
    expect(stale.current?.binding).toBe(await bindingIn(r, "claim"));
    // A template that repeats a slot: the filled text is cut to 8,192 bytes, in the refusal and in the entry.
    const long = `docs/${"d".repeat(200)}/${"e".repeat(200)}/${"f".repeat(200)}/${"g".repeat(200)}/x.md`;
    const head = pushChange(r, c.lane, { [long]: "x" });
    const cut = expectRefusal(await act(r, r.admin, "propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" }), "outside-claim");
    expect(cut.reason).toBe(long.repeat(85).slice(0, 8192));
    expect((await entryOf(r, cut.act!)).entry.receipt!.refusal!.reason).toBe(cut.reason);
  });

  it("a refusal decided at the final boundary is in the declaration's words too: a delegation that expires while the act's policy is evaluated", async () => {
    const r = await declaredRoom(v2((a) => void (a["claim"] = { ...a["claim"]!, refusals: { "delegation-invalid": { reason: "Declared reason for {kind}.", fix: "Declared fix." } } })));
    const bob = await addMember(r, "@bob", "member");
    const k = newKeyPair();
    const grant = await ok<RosterRecord>(r, bob, "roster", null, { ...delegateOp(k.key, { claim: (await bindingIn(r, "claim"))! }), expiresAt: iso(clock.now + 60_000) }, { binding: null });
    const d = new Client(r, k, grant.id);
    // The claim waits in policy evaluation; the delegation expires meanwhile, so the last check before sealing refuses.
    let open = () => {};
    const before = r.world.policy.calls.refuse;
    r.world.policy.gate = new Promise<void>((resolve) => (open = resolve));
    const pending = act(r, d, "claim", null, claimBody());
    await until(async () => r.world.policy.calls.refuse > before);
    advance(61_000);
    r.world.policy.gate = null;
    open();
    const late = expectRefusal(await pending, "delegation-invalid");
    expect(late).toMatchObject({ reason: "Declared reason for claim.", fix: "Declared fix." });
    expect(late.act).toBeUndefined();
  });
});

describe("the lease rule (R-DECL-6, R-DECL-9)", () => {
  /** The deployment's lease changes, as a deploy with another LEASE_SECONDS would make it. */
  const deployLease = (r: TestRoom, ms: number) => inDO(r, (room) => void ((room.core as unknown as { leaseMs: number }).leaseMs = ms));
  type Leased = { lease: { expiresAt: string } } & ActRecord;
  const state = async (r: TestRoom, lane: LaneId) => ((await r.admin.read({ q: "lane", lane })) as unknown as { state: string }).state;

  it("a thread opened under a v2 document records the room's lease and keeps it across a restart and a deployment change, for renewal and expiry; a v1 thread records none and follows the deployment, also once the room is v2", async () => {
    const before = await makeRoom();
    const old = await before.admin.ok<Claim>("claim", null, claimBody("old/**"));
    const oldRoom = await revertLane(before, "old-lib/**");
    await activate(before, v2());
    const c = await ok<Claim>(before, before.admin, "claim", null, claimBody());
    const room = await revertLane(before);
    expect([(await laneRowOf(before, old.lane)).lease_ms, (await laneRowOf(before, c.lane)).lease_ms]).toEqual([null, LEASE]);
    // A thread the room opens itself, for a revert, records its lease and the policy's conflict mode in the same way.
    expect(await laneRowOf(before, oldRoom)).toMatchObject({ kind: "room", lease_ms: null, conflict: null });
    expect(await laneRowOf(before, room)).toMatchObject({ kind: "room", lease_ms: LEASE, conflict: v2().lanes });
    const r = await restarted(before);
    await deployLease(r, 600_000);
    advance(60_000);
    const renew = async (lane: LaneId) => expectOk(await act<Leased>(r, r.admin, "renew", { lane }, { lease: 1 }, { binding: null })).lease.expiresAt;
    expect(await renew(c.lane)).toBe(iso(clock.now + LEASE));
    expect(await renew(old.lane)).toBe(iso(clock.now + 600_000));
    // Any accepted act from the holder renews for the thread's recorded length (R-ADM-11).
    advance(60_000);
    await ok(r, r.admin, "note", { act: c.id }, { text: "still here" });
    expect((await laneRowOf(r, c.lane)).expires_ms).toBe(clock.now + LEASE);
    // A new thread takes the new lease. Each expires at its own length.
    const n = await ok<Claim>(r, r.admin, "claim", null, claimBody("docs/**"));
    expect((await laneRowOf(r, n.lane)).lease_ms).toBe(600_000);
    advance(600_000);
    await tick(r);
    expect([await state(r, n.lane), await state(r, c.lane)]).toEqual(["unheld", "held"]);
    advance(LEASE - 600_000);
    await tick(r);
    expect(await state(r, c.lane)).toBe("unheld");
  });

  it("hold.leaseSeconds is the thread's lease length: renewal, expiry and a take-over use it, and the thread keeps it after the room returns to v1", async () => {
    const r = await declaredRoom(v2((a) => void ((a["claim"] as { hold: unknown }).hold = { scope: "body.scope", workspace: true, leaseSeconds: 60 })));
    const bob = await addMember(r, "@bob", "member");
    const c = await ok<Claim>(r, r.admin, "claim", null, claimBody());
    expect(c.lease.expiresAt).toBe(iso(clock.now + 60_000));
    expect((await laneRowOf(r, c.lane)).lease_ms).toBe(60_000);
    advance(30_000);
    expect(expectOk(await act<Leased>(r, r.admin, "renew", { lane: c.lane }, { lease: 1 }, { binding: null })).lease.expiresAt).toBe(iso(clock.now + 60_000));
    advance(61_000);
    await tick(r);
    expect(await state(r, c.lane)).toBe("unheld");
    const t = await ok<Claim>(r, bob, "claim", { lane: c.lane }, { scope: ["src/**"], expectedGeneration: 0 });
    expect(t.lease.expiresAt).toBe(iso(clock.now + 60_000));
    await activate(r, policy());
    advance(10_000);
    expect((await bob.ok<Leased>("renew", { lane: c.lane }, { lease: t.lease.generation })).lease.expiresAt).toBe(iso(clock.now + 60_000));
    expect((await bob.ok("release", { lane: c.lane }, { lease: t.lease.generation })).kind).toBe("release");
  });
});

describe("recover, the platform kind (R-DECL-21)", () => {
  const open = { op: "open", goal: "repair", scope: [".artroom/**"] };
  const v1 = { binding: null } as const;

  it("an admin's own key opens, versions, approves, lands, takes over, notes on and releases a recovery thread, and each record names its op; a legacy recovery lane takes recover ops after the first v2 activation", async () => {
    const r = await makeRoom();
    const legacy = await r.admin.ok<Claim>("claim", null, { goal: "repair", scope: [".artroom/policy.json"], purpose: "config-recovery" });
    await activate(r, v2());
    expect(expectRefusal(await act(r, r.admin, "claim", { lane: legacy.lane }, { scope: [".artroom/policy.json"], expectedGeneration: 0, lease: 1 }), "wrong-thread").reason).toContain("configuration-recovery");
    const head = pushChange(r, legacy.lane, { ".artroom/policy.json": JSON.stringify(v2()) + "\n" });
    const p = await ok(r, r.admin, "recover", { lane: legacy.lane }, { op: "version", lease: 1, expectedGeneration: 0, head, summary: "repair" }, v1);
    expect(p).toMatchObject({ kind: "recover", recover: "version", flags: ["config-recovery"] });
    expect(p).not.toHaveProperty("op");
    expect((await r.admin.read({ q: "explain", act: p.id }))?.evidence).toBeDefined();
    const approve = await ok(r, r.admin, "recover", { lane: legacy.lane, generation: 1 }, { op: "approve", head, verdict: "approve", scope: [".artroom/**"], text: "ok" }, v1);
    expect(approve).toMatchObject({ kind: "recover", recover: "approve", flags: expect.arrayContaining(["config-recovery", "sole-admin-self-approval"]) });
    // The landing's record names its op as `recover`; its own `op` is the landing operation.
    const l = await ok(r, r.admin, "recover", { lane: legacy.lane, generation: 1 }, { op: "land", lease: 1, head }, v1);
    expect(l).toMatchObject({ kind: "recover", recover: "land", op: { id: expect.stringMatching(/^op_/) } });
    await tick(r, 3);
    expect((await landing(r, (l as unknown as { op: { id: string } }).op.id)).state).toBe("landed");
    // A thread that recover opens: the update summary names it, as it does for any act that opened one.
    const opened = await ok<Claim>(r, r.admin, "recover", null, { ...open, scope: [".artroom/checkers/**"] }, v1);
    expect(opened).toMatchObject({ kind: "recover", recover: "open", purpose: "config-recovery", goal: "repair", scope: [".artroom/checkers/**"], flags: ["config-recovery"], effect: { type: "opened" } });
    expect((await inDO(r, async (room) => (await import("../../src/reads.ts")).summary((await import("../../src/log.ts")).entryById(room.core.sql, opened.id)!))).lane).toBe(opened.lane);
    // Its lease expires; the admin takes it over, changes its scope within .artroom, notes on it and releases it.
    advance(LEASE + 1000);
    await tick(r);
    const take = { op: "take", scope: [".artroom/**"], expectedGeneration: 0 };
    const t = await ok<Claim>(r, r.admin, "recover", { lane: opened.lane }, take, v1);
    expect(t).toMatchObject({ kind: "recover", recover: "take", lane: opened.lane, purpose: "config-recovery", scope: [".artroom/**"], flags: ["config-recovery"], effect: { type: "taken-over" } });
    const lease = t.lease.generation;
    expect(await ok<Claim>(r, r.admin, "recover", { lane: opened.lane }, { ...take, scope: [".artroom/policy.json"], lease }, v1)).toMatchObject({ recover: "take", effect: { type: "rescoped" } });
    expectRefusal(await act(r, r.admin, "recover", { lane: opened.lane }, { ...take, scope: ["src/**"], lease }, v1), "recovery-scope");
    expect(await ok(r, r.admin, "recover", { act: opened.id }, { op: "note", text: "taken over" }, v1)).toMatchObject({ kind: "recover", recover: "note", text: "taken over" });
    expect(await ok(r, r.admin, "recover", { lane: opened.lane }, { op: "release", lease, note: "done" }, v1)).toMatchObject({ kind: "recover", recover: "release", note: "done" });
    expect(await laneRowOf(r, opened.lane)).toMatchObject({ kind: "recover", purpose: "config-recovery" });
    // A declared act's record has no `recover` field.
    expect(await ok<Claim>(r, r.admin, "claim", null, claimBody())).not.toHaveProperty("recover");
  });

  it("who may recover: at step 4 the role table of the legacy act the op stands for, unrecorded, and only when the op is text; at step 7 an active admin's own key, never a delegation, recorded", async () => {
    const r = await declaredRoom();
    const ci = await addMember(r, "@ci", "checker");
    const bob = await addMember(r, "@bob", "member");
    const seq = await headSeq(r);
    expect(expectRefusal(await act(r, ci, "recover", null, open, v1), "role-forbids").act).toBeUndefined();
    // A list that holds the op's name is not that op: step 5 refuses the body, whoever signs. So is an unknown op.
    for (const who of [ci, bob, r.admin]) expectRefusal(await act(r, who, "recover", null, { ...open, op: ["open"] }, v1), "invalid-body");
    expectRefusal(await act(r, ci, "recover", null, { ...open, op: "nope" }, v1), "invalid-body");
    // A target the op does not take is bad-request, thrown at step 1.
    expect((await failure(r.stub.submit(await signed(r, r.admin, "recover", null, { op: "version", lease: 1, expectedGeneration: 0, head: "a".repeat(40), summary: "s" }, v1)))).code).toBe("bad-request");
    expect(await headSeq(r)).toBe(seq);
    // A member could sign the legacy claim, and a checker the legacy note: both reach step 7.
    const held = await ok<Claim>(r, r.admin, "recover", null, open, v1);
    expect(expectRefusal(await act(r, bob, "recover", null, { ...open, scope: [".artroom/x"] }, v1), "admin-required").act).toBeDefined();
    expect(expectRefusal(await act(r, ci, "recover", { act: held.id }, { op: "note", text: "x" }, v1), "admin-required").act).toBeDefined();
    expectRefusal(await act(r, bob, "recover", { lane: held.lane }, { op: "version", lease: 1, expectedGeneration: 0, head: "a".repeat(40), summary: "s" }, v1), "not-holder");
    const k = newKeyPair();
    const grant = await ok<RosterRecord>(r, r.admin, "roster", null, delegateOp(k.key, { claim: (await bindingIn(r, "claim"))! }, ["renew"]), v1);
    expect(expectRefusal(await act(r, new Client(r, k, grant.id), "recover", null, { ...open, scope: [".artroom/x"] }, v1), "admin-required").act).toBeDefined();
    expectRefusal(await act(r, r.admin, "recover", null, { ...open, scope: ["src/**"] }, v1), "recovery-scope");
  });
});

describe("a landing in flight is judged again at reservation, as a new admission would be (R-LAND-7, R-DECL-17, R-DECL-21)", () => {
  it("a landing under a delegation keeps its authority while the binding of its kind is the one the grant names; a landing by the member's own key completes under the declaration it was admitted in; a retired kind takes the authority of every landing", async () => {
    const r = await declaredRoom(v2(() => {}, reviewed()));
    const bob = await addMember(r, "@bob", "member");
    const k = newKeyPair();
    const acts: Record<string, string> = {};
    for (const kind of ["claim", "propose", "land", "release"]) acts[kind] = (await bindingIn(r, kind))!;
    const delegate = new Client(r, k, (await ok<RosterRecord>(r, bob, "roster", null, delegateOp(k.key, acts, ["renew"]), { binding: null })).id);
    // An activation that leaves land as it was.
    const kept = await landed(r, delegate, "src/a.ts");
    await activate(r, v2((a) => void (a["note"] = { ...a["note"]!, label: "Remark" }), reviewed()));
    await tick(r, 6);
    expect((await landing(r, kept.op)).state).toBe("landed");
    // The meaning of land changes while two landings are in flight.
    const own = await landed(r, bob, "src/b.ts");
    const granted = await landed(r, delegate, "src/c.ts");
    const reworded = (a: Acts) => void (a["land"] = { ...a["land"]!, body: { why: { type: "text", max: 10, optional: true } } });
    await activate(r, v2(reworded, reviewed()));
    expect(await bindingIn(r, "land")).not.toBe(acts["land"]);
    await tick(r, 10);
    expect((await landing(r, own.op)).state).toBe("landed");
    const lost = await landing(r, granted.op);
    expect(lost).toMatchObject({ state: "retryable", reason: "authority-lost" });
    expect(lost.fix).toContain("earlier meaning of land");
    // What a new admission says of the same grant now.
    expectRefusal(await act(r, delegate, "land", { lane: granted.lane, generation: 1 }, { lease: 1, head: granted.head }), "delegation-invalid");
    // The kind is retired: there is no step 4a at reservation, so the landing is refused there, whoever signed.
    const last = await landed(r, bob, "src/d.ts");
    await activate(
      r,
      v2((a) => {
        reworded(a);
        a["ship"] = { ...a["land"]!, label: "Ship" };
        delete a["land"];
      }, reviewed()),
    );
    await tick(r, 6);
    const retired = await landing(r, last.op);
    expect(retired).toMatchObject({ state: "retryable", reason: "authority-lost" });
    expect(retired.fix).toContain("no longer declares land");
  });

  it("a recovery landing is judged by the recovery rule alone: it lands across a change of vocabulary that retires its kind, and loses its authority when its signer is no longer an admin (R-ADMIN-8)", async () => {
    const r = await makeRoom();
    const second = await addMember(r, "@root2", "admin");
    const c = await r.admin.ok<Claim>("claim", null, { goal: "repair", scope: [".artroom/**"], purpose: "config-recovery" });
    const head = pushChange(r, c.lane, { ".artroom/note.txt": "x" });
    await r.admin.ok("propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" });
    await second.ok("review", { lane: c.lane, generation: 1 }, { head, verdict: "approve", scope: [".artroom/**"], text: "ok" });
    const l = (await r.admin.ok("land", { lane: c.lane, generation: 1 }, { lease: 1, head })) as unknown as { op: { id: string } };
    // The first v2 document declares no kind named land.
    await activate(
      r,
      v2((a) => {
        a["ship"] = { ...a["land"]!, label: "Ship" };
        delete a["land"];
      }),
    );
    await tick(r, 6);
    expect((await landing(r, l.op.id)).state).toBe("landed");
    const v1 = { binding: null } as const;
    const o = await ok<Claim>(r, r.admin, "recover", null, { op: "open", goal: "g", scope: [".artroom/**"] }, v1);
    const head2 = pushChange(r, o.lane, { ".artroom/more.txt": "y" });
    await ok(r, r.admin, "recover", { lane: o.lane }, { op: "version", lease: 1, expectedGeneration: 0, head: head2, summary: "s" }, v1);
    await ok(r, second, "recover", { lane: o.lane, generation: 1 }, { op: "approve", head: head2, verdict: "approve", scope: [".artroom/**"], text: "ok" }, v1);
    const l2 = (await ok(r, r.admin, "recover", { lane: o.lane, generation: 1 }, { op: "land", lease: 1, head: head2 }, v1)) as unknown as { op: { id: string } };
    await ok(r, second, "roster", null, { op: "set-role", member: "@admin", role: "member" }, v1);
    await tick(r, 6);
    const out = await landing(r, l2.op.id);
    expect(out).toMatchObject({ reason: "authority-lost" });
    expect(out.state).not.toBe("landed");
  });
});

describe("check jobs in a v2 room name the kind and binding to sign (R-DECL-18, R-EXEC-8)", () => {
  const R = `sha256:${"0".repeat(64)}` as const;
  type Job = CheckJob & { kind?: string; binding?: string };
  type Sent = { job: Job; out: unknown };
  const jobs = (r: TestRoom) => inDO(r, (room) => room.core.sql.all("SELECT state, outcome, attempt FROM check_jobs ORDER BY rowid") as unknown as { state: string; outcome: string | null; attempt: number }[]);
  const base = () => policy(requireCheck("unit", { paths: "src/**", by: "@ci", id: "unit-tests" }));
  const reworded = () => v2((a) => void (a["check"] = { ...a["check"]!, body: { remark: { type: "text", max: 10, optional: true } } }), base());

  /**
   * A room whose `src/**` needs the check `unit`, with one proposal, and a checker service that signs exactly what
   * its job names, as packages/checkers does. `before` runs in the service before it signs; `fake` answers instead.
   */
  async function checked(o: { doc?: PolicyDocument; before?: (job: Job, n: number) => Promise<void> | undefined; settle?: boolean; prepare?: (r: TestRoom) => void; fake?: (job: Job) => unknown } = {}) {
    const declared = o.doc === undefined;
    const cfg = declared ? { format: "artroom-checker-v2", act: "check", volatile: false, timeoutSeconds: 60, runner: R } : { format: "artroom-checker-v1", volatile: false, timeoutSeconds: 60, runner: R };
    const r = await makeRoom({ policy: o.doc ?? (v2(() => {}, base()) as unknown as PolicyDocument), files: { ".artroom/checkers/unit.json": JSON.stringify(cfg) } });
    const signing = declared ? {} : ({ binding: null } as const);
    const alice = await addMember(r, "@alice", "member");
    const ci = await addMember(r, "@ci", "checker");
    const seen: Sent[] = [];
    const service: CheckerService = {
      async handle(job) {
        const j = job as Job;
        const n = seen.length;
        seen.push({ job: j, out: undefined });
        await o.before?.(j, n);
        if (o.fake) return (seen[n]!.out = o.fake(j)) as never;
        const body = { obligation: job.obligation, check: job.check, integration: job.integration, input: job.input, config: job.config, runner: job.runner ?? R, volatile: job.volatile, ok: true, detail: "Machine-run check", ...(job.landOp ? { landOp: job.landOp } : {}) };
        const stub = env.ROOMS.get(env.ROOMS.idFromName(r.id)) as never as TestRoom["stub"];
        const envelope = { v: j.binding ? 2 : 1, room: r.id, actor: ci.key, kind: j.kind ?? "check", ...(j.binding ? { binding: j.binding } : {}), target: { lane: job.lane, generation: job.generation }, body, idempotencyKey: `chk-${job.id}`.slice(0, 64) };
        return (seen[n]!.out = await call(stub.submit({ envelope, sig: sign(ci.keys.seed, "artroom-envelope-v1", envelope) } as never))) as never;
      },
    };
    r.world.checkers["unit"] = service;
    const c = await ok<Claim>(r, alice, "claim", null, { goal: "work", scope: ["src/**"] }, signing);
    const head = pushChange(r, c.lane, { "src/app.ts": "v2" });
    o.prepare?.(r);
    await ok(r, alice, "propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "change" }, signing);
    // A test that holds the checker's answer cannot wait for the room to be idle.
    if (o.settle !== false) await inDO(r, (room) => room.core.idle());
    return { r, alice, c, head, seen, signing };
  }

  it("the job carries the check act's kind and its active binding; a check signed with them is admitted, and the landing lands; a v1 room's job names neither", async () => {
    const { r, alice, c, head, seen } = await checked();
    const l = (await ok(r, alice, "land", { lane: c.lane, generation: 1 }, { lease: 1, head })) as unknown as { op: { id: string } };
    await tick(r, 6);
    expect(seen.length).toBeGreaterThan(0);
    for (const s of seen) expect(s.job).toMatchObject({ kind: "check", binding: await bindingIn(r, "check") });
    expect(seen.every((s) => (s.out as ActRecord).kind === "check" && !("refused" in (s.out as object)))).toBe(true);
    expect((await landing(r, l.op.id)).state).toBe("landed");
    const legacy = await checked({ doc: base() });
    expect(legacy.seen.length).toBeGreaterThan(0);
    expect("kind" in legacy.seen[0]!.job || "binding" in legacy.seen[0]!.job).toBe(false);
    expect((legacy.seen[0]!.out as ActRecord).kind).toBe("check");
  });

  it("a check signed under a binding an activation has replaced is binding-stale; its job is due again, and its next attempt names the binding in force", async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    // The first job's check is signed only after the test has changed the meaning of `check`.
    const s = await checked({ before: async (_job, n) => (n === 0 ? gate : undefined), settle: false });
    await until(async () => s.seen.length > 0);
    const old = s.seen[0]!.job.binding!;
    await activate(s.r, reworded());
    const now = (await bindingIn(s.r, "check"))!;
    expect(now).not.toBe(old);
    release();
    await until(async () => s.seen[0]!.out !== undefined);
    await inDO(s.r, (room) => room.core.idle());
    expectRefusal(s.seen[0]!.out, "binding-stale");
    // Not ended as refused: every job the stale check answered is owed again.
    const after = await jobs(s.r);
    expect(after.some((j) => j.outcome === "refused: binding-stale")).toBe(false);
    expect(after.some((j) => j.state === "owed")).toBe(true);
    advance(JOB_RETRY_MS + 1000);
    await tick(s.r, 3);
    await inDO(s.r, (room) => room.core.idle());
    const later = s.seen.filter((x) => x.job.binding === now);
    expect(later.length).toBeGreaterThan(0);
    expect((later[later.length - 1]!.out as ActRecord).kind).toBe("check");
    expect((await jobs(s.r)).every((j) => j.state === "done")).toBe(true);
  });

  it("a job prepared while an activation replaced the binding names the binding in force when it is sent", async () => {
    // The job's read token is held at Artifacts, so the job is being prepared when the meaning of `check` changes.
    let calls = 0;
    const s = await checked({
      settle: false,
      prepare: (r) => {
        const a = r.world.artifacts;
        calls = a.remoteCalls.get("createToken") ?? 0;
        a.holdToken = (repo, scope) => scope === "read" && repo === a.canonical;
      },
    });
    const a = s.r.world.artifacts;
    await until(async () => (a.remoteCalls.get("createToken") ?? 0) > calls);
    expect(s.seen.length).toBe(0);
    await activate(s.r, reworded());
    const now = (await bindingIn(s.r, "check"))!;
    a.holdToken = null;
    await until(async () => s.seen.length > 0 && s.seen[0]!.out !== undefined);
    await inDO(s.r, (room) => room.core.idle());
    // The same attempt, sent once, with the binding of the document now in force; its check is admitted.
    expect(s.seen[0]!.job.binding).toBe(now);
    expect((s.seen[0]!.out as ActRecord).kind).toBe("check");
    expect(await jobs(s.r)).toMatchObject([{ state: "done", attempt: 1 }]);
  });

  it("the Room judges the change of binding itself: a service that answers binding-stale and names another binding as current is not asked again", async () => {
    // The answer is not the Room's own refusal: nothing was submitted, and the binding in force is the one the job named.
    const made = { refused: true, rule: "binding-stale", reason: "made up", current: { binding: `sha256:${"f".repeat(64)}`, policy: "act_1_00000000" } };
    const { r, seen } = await checked({ fake: () => made });
    await tick(r, 3);
    expect(seen.length).toBe(1);
    expect(seen[0]!.job.binding).toBe(await bindingIn(r, "check"));
    expect(await jobs(r)).toEqual([{ state: "done", outcome: "refused: binding-stale", attempt: 1 }]);
    advance(JOB_RETRY_MS + 1000);
    await tick(r, 3);
    expect(seen.length).toBe(1);
  });
});

describe("a document the room cannot store or run is refused before it can activate (R-DECL-24, R-DECL-26)", () => {
  async function proposeDoc(r: TestRoom, doc: unknown, checkers: Record<string, unknown> = {}): Promise<ActRecord | Refusal> {
    const c = await ok<Claim>(r, r.admin, "claim", null, { goal: "policy", scope: [".artroom/**"] });
    const files: Record<string, string> = { ".artroom/policy.json": JSON.stringify(doc) };
    for (const [n, cfg] of Object.entries(checkers)) files[`.artroom/checkers/${n}.json`] = JSON.stringify(cfg);
    const head = pushChange(r, c.lane, files);
    const out = await act(r, r.admin, "propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "policy" });
    await ok(r, r.admin, "release", { lane: c.lane }, { lease: 1 });
    return out;
  }

  it("at propose time a v2 document is judged by the acts validator, its checker configurations, what this room runs and what it can store: policy-invalid, recorded, and the document never activates", async () => {
    const r = await declaredRoom();
    const version = await policyVersion(r);
    const reason = async (doc: unknown, checkers?: Record<string, unknown>) => {
      const out = expectRefusal(await proposeDoc(r, doc, checkers), "policy-invalid");
      expect(out.act).toBeDefined();
      return out.reason;
    };
    expect(await reason(v2((a) => void (a["release"] = { ...a["release"]!, threads: ["claim", "chore"] })))).toContain("chore is not room");
    expect(await reason(v2(), { unit: { format: "artroom-checker-v1", volatile: false, timeoutSeconds: 60 } })).toContain("checkers.unit");
    // A step this room runs only from declared acts stage 4 (test/node/declared-equivalence.test.ts has each one).
    expect(await reason(v2((a) => void (a["propose"] = { ...a["propose"]!, targets: { thread: ["version", "land"] } })))).toBe("The proposed configuration is invalid: acts.propose: version then land in one act is not run by this room until declared acts stage 4.");
    expect(await policyVersion(r)).toBe(version);
    expectOk(await proposeDoc(r, v2(), { unit: { format: "artroom-checker-v2", act: "check", volatile: false, timeoutSeconds: 60 } }));
    // The same parser refuses a document too large to store: over 1,048,576 bytes of canonical JSON, counted also
    // when an owner path named constructor, a legal glob, would hide the size from a canonical writer.
    const sized = (description: string) => ({ ...v2(), owners: { constructor: ["role:admin"] }, rules: [{ id: "describe", kind: "notify", on: ["claim"], to: ["role:admin"], why: "A change.", description }] });
    const parse = (d: object) => inDO(r, (room) => room.core.parseConfig(JSON.stringify(d), {}) as { ok: boolean; problems?: string[] });
    expect(await parse(sized("x".repeat(1_048_576)))).toEqual({ ok: false, problems: ["policy: the document's canonical JSON must be at most 1048576 bytes"] });
    expect((await parse(sized("x"))).ok).toBe(true);
  });
});

describe("the active document as the room keeps it (a resource bound of request fd6f00b6)", () => {
  it("the active document is parsed once per version, not once per kind, and a kept policy cannot be changed by its reader", async () => {
    const doc = v2((a) => {
      for (let i = 0; i < 10; i++) a[`k${i}`] = { label: `K${i}`, targets: { thread: ["version"] }, threads: ["claim"], body: { summary: { type: "text", max: 10 } }, who: { roles: ["member"] } };
    });
    const r = await declaredRoom(doc);
    const acts: Record<string, string> = {};
    for (const k of Object.keys(doc.acts)) if (k !== "check") acts[k] = (await bindingIn(r, k))!;
    const grant = await signed(r, r.admin, "roster", null, delegateOp(newKeyPair().key, acts, ["renew"]), { binding: null });
    type Spied = { all: (q: string, ...v: unknown[]) => unknown; reads?: number; real?: (q: string, ...v: unknown[]) => unknown };
    await inDO(r, (room) => {
      const sql = room.core.sql as unknown as Spied;
      sql.real = sql.all.bind(sql);
      sql.reads = 0;
      sql.all = (q, ...v) => {
        if (q.includes("FROM policies WHERE version")) sql.reads = (sql.reads ?? 0) + 1;
        return sql.real!(q, ...v);
      };
    });
    expectOk(await call<ActRecord | Refusal>(r.stub.submit(grant)));
    const reads = await inDO(r, (room) => {
      const sql = room.core.sql as unknown as Spied;
      sql.all = sql.real!;
      const p = room.core.activePolicy();
      return { reads: sql.reads, frozen: Object.isFrozen(p) && Object.isFrozen(p.doc) && Object.isFrozen((p.doc as unknown as PolicyDocumentV2).acts["claim"]!.targets) };
    });
    expect(reads.reads).toBeLessThanOrEqual(1);
    expect(reads.frozen).toBe(true);
    // A new activation is read at once.
    const before = await bindingIn(r, "note");
    await activate(r, v2((a) => void (a["note"] = { ...a["note"]!, body: { ...a["note"]!.body, mood: { type: "text", max: 10, optional: true } } })));
    expect(await bindingIn(r, "note")).not.toBe(before);
  });
});

describe("a workspace request is judged as the act with step version on the thread (R-CRED-5 as amended)", () => {
  it("the thread's kind, the version act's who.roles and the grant's map decide, as they would for the act; on a recovery thread, an active admin's own key", async () => {
    const r = await declaredRoom(
      v2((a) => {
        a["propose"] = { ...a["propose"]!, who: { roles: ["maintainer", "agent"] } };
        a["task"] = { ...a["claim"]!, label: "Task", threads: ["task"] };
      }),
    );
    const bob = await addMember(r, "@bob", "member");
    const mo = await addMember(r, "@mo", "maintainer");
    const both = ["workspace", "workspace-token"] as const;
    // No declared act makes versions on a task thread.
    const t = await ok<Claim>(r, r.admin, "task", null, claimBody("docs/**"));
    for (const kind of both) expect(expectRefusal(await r.admin.request({ kind, lane: t.lane, lease: 1 }), "wrong-thread").reason).toBe(`No declared act makes versions on ${t.lane}, a task thread.`);
    // Bob holds a claim thread, but his role may not sign the act that makes versions on it.
    const cb = await ok<Claim>(r, bob, "claim", null, claimBody("src/**"));
    for (const kind of both) expect(expectRefusal(await bob.request({ kind, lane: cb.lane, lease: 1 }), "role-forbids").reason).toBe("The role member may not sign propose.");
    // A maintainer may; the holder and the lease are then found as ever.
    const cm = await ok<Claim>(r, mo, "claim", null, claimBody("lib/**"));
    expectOk(await mo.request({ kind: "workspace", lane: cm.lane, lease: 1 }));
    await tick(r);
    expect(expectOk(await mo.request<{ lane: string; leaseGeneration: number } | Refusal>({ kind: "workspace-token", lane: cm.lane, lease: 1 }))).toMatchObject({ lane: cm.lane, leaseGeneration: 1 });
    expectRefusal(await r.admin.request({ kind: "workspace", lane: cm.lane, lease: 1 }), "not-holder");
    expectRefusal(await mo.request({ kind: "workspace", lane: cm.lane, lease: 2 }), "lease-fenced");
    // Under a delegation the grant's map must name the version act, with the binding in force.
    const grant = async (kinds: string[]) => {
      const k = newKeyPair();
      const acts: Record<string, string> = {};
      for (const kind of kinds) acts[kind] = (await bindingIn(r, kind))!;
      return new Client(r, k, (await ok<RosterRecord>(r, mo, "roster", null, delegateOp(k.key, acts, ["renew"]), { binding: null })).id);
    };
    const claimOnly = await grant(["claim"]);
    const withPropose = await grant(["claim", "propose"]);
    for (const kind of both) expect(expectRefusal(await claimOnly.request({ kind, lane: cm.lane, lease: 1 }), "delegation-invalid").reason).toBe(`Delegation ${claimOnly.delegation} does not cover propose.`);
    expectOk(await withPropose.request({ kind: "workspace", lane: cm.lane, lease: 1 }));
    // A recovery thread: no declared act makes versions on it, and none is needed.
    const rec = await ok<Claim>(r, r.admin, "recover", null, { op: "open", goal: "repair", scope: [".artroom/**"] }, { binding: null });
    expectOk(await r.admin.request({ kind: "workspace", lane: rec.lane, lease: 1 }));
    for (const kind of both) {
      expectRefusal(await mo.request({ kind, lane: rec.lane, lease: 1 }), "admin-required");
      expectRefusal(await withPropose.request({ kind, lane: rec.lane, lease: 1 }), "admin-required");
    }
    // The meaning of propose changes: the grant names its earlier binding, so the request is refused as the act would be.
    await activate(r, v2((a) => void (a["propose"] = { ...a["propose"]!, body: { ...a["propose"]!.body, why: { type: "text", max: 10, optional: true } } })));
    for (const kind of both) expect(expectRefusal(await withPropose.request({ kind, lane: cm.lane, lease: 1 }), "delegation-invalid").reason).toBe("The delegation was granted for an earlier meaning of propose.");
    expectOk(await mo.request({ kind: "workspace", lane: cm.lane, lease: 1 }));
  });
});

describe("the same session under the legacy vocabulary and under the code-review declarations (request fd6f00b6, condition 5)", () => {
  type Measured = Record<string, { act: number; settled: number }>;

  /** Count this Room object's rows written, by the cursor's `rowsWritten`, from now on (idle-writes-3da1d82b.test.ts). */
  async function spy(r: TestRoom): Promise<{ rows: number }> {
    const w = { rows: 0 };
    await runInDurableObject(r.stub as unknown as DurableObjectStub<Room>, (room: Room, state: DurableObjectState) => {
      const sql = room.core.sql as { all: (q: string, ...b: unknown[]) => unknown[] };
      sql.all = (q, ...b) => {
        const c = state.storage.sql.exec(q, ...(b as SqlStorageValue[]));
        const rows = c.toArray();
        w.rows += c.rowsWritten;
        return rows;
      };
    });
    return w;
  }

  /** One session of acts. `declared` signs declared kinds under their active bindings; platform kinds are v: 1 in both. */
  async function session(r: TestRoom, declared: boolean): Promise<Measured> {
    const bindingFor = async (kind: string) => (declared ? await bindingIn(r, kind) : null);
    const run = async <T>(c: Client, kind: string, target: unknown, body: unknown): Promise<T> =>
      expectOk(await act(r, c, kind, target, body, { binding: kind === "roster" || kind === "renew" || kind === "recover" ? null : await bindingFor(kind) })) as T;
    const w = await spy(r);
    const out: Measured = {};
    /** `settle` is how many runs of the alarm the act's own work takes; one more run then writes nothing. */
    const measure = async <T>(name: string, fn: () => Promise<T>, settle = 1): Promise<T> => {
      const before = w.rows;
      const result = await fn();
      const acted = w.rows;
      await tick(r, settle);
      out[name] = { act: acted - before, settled: w.rows - before };
      return result;
    };
    const secret = randomBytes(32);
    const inv = await measure("invite (roster)", () => run<RosterRecord>(r.admin, "roster", null, { op: "invite", member: "@bob", role: "member", custody: "client", expiresAt: iso(clock.now + day), secretHash: digestBytes(secret) }));
    const bob = new Client(r, newKeyPair());
    await measure("join (roster)", () => run(bob, "roster", null, { op: "join", invitation: inv.id, secret: b64url(secret) }));
    const c = await measure("claim (open)", () => run<Claim>(bob, "claim", null, { goal: "work", scope: ["src/**"] }));
    const head = pushChange(r, c.lane as LaneId, { "src/app.ts": "v2" });
    await measure("propose (version), with its pin and preview", () => run(bob, "propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" }), 3);
    await measure("note (comment)", () => run(r.admin, "note", { act: c.id }, { text: "a note" }));
    await measure("review", () => run(r.admin, "review", { lane: c.lane, generation: 1 }, { head, verdict: "approve", scope: ["src/**"], text: "ok" }));
    await measure("land, with its landing", () => run(bob, "land", { lane: c.lane, generation: 1 }, { lease: 1, head }), 3);
    expect(await inDO(r, (room) => room.core.landing.activeViews().length)).toBe(0);
    const c2 = await measure("claim (open), a second thread", () => run<Claim>(bob, "claim", null, { goal: "more", scope: ["docs/**"] }));
    await measure("renew", () => run(bob, "renew", { lane: c2.lane }, { lease: 1 }));
    await measure("release", () => run(bob, "release", { lane: c2.lane }, { lease: 1 }));
    await measure("claim (take over)", () => run(r.admin, "claim", { lane: c2.lane }, { scope: ["docs/**"], expectedGeneration: 0 }));
    const k = newKeyPair();
    const acts = declared ? { claim: (await bindingFor("claim"))!, note: (await bindingFor("note"))! } : null;
    await measure("delegate (roster)", () => run(r.admin, "roster", null, acts ? delegateOp(k.key, acts, ["renew"]) : { op: "delegate", to: k.key, kinds: ["renew", "claim", "note"], lanes: "*", expiresAt: iso(clock.now + day) }));
    await measure("configuration-recovery open", () =>
      declared ? run(r.admin, "recover", null, { op: "open", goal: "repair", scope: [".artroom/policy.json"] }) : run(r.admin, "claim", null, { goal: "repair", scope: [".artroom/policy.json"], purpose: "config-recovery" }),
    );
    return out;
  }

  it("the declared path writes no row more than the legacy path for any act, admission alone or with its alarm work; the log of the v2 session publishes and verifies, with every decision replayed", async () => {
    const legacy = await session(await makeRoom({ policy: reviewed() }), false);
    const d = await declaredRoom(v2(() => {}, reviewed()));
    const declared = await session(d, true);
    for (const name of Object.keys(legacy)) {
      expect(declared[name]!.act, `${name}, admission`).toBeLessThanOrEqual(legacy[name]!.act);
      expect(declared[name]!.settled, `${name}, with its alarm work`).toBeLessThanOrEqual(legacy[name]!.settled);
    }
    // Offline verification of the v2 log (packages/log, R-LOG-10): v: 2 envelopes, bindings, thread kinds and the recover op.
    const head = await headSeq(d);
    const p = await call<{ through: number; commit: string }>(d.stub.publishLog());
    expect(p.through).toBe(head);
    const report = await verifyLog(d.world.artifacts.canonicalRepo());
    expect(report.failures).toEqual([]);
    expect(report).toMatchObject({ ok: true, verifiedThrough: p.through, publishedThrough: p.through, room: d.id });
    const recorded = (await logOf(d.id)).reduce((n, e) => {
      const x = e.entry as unknown as { receipt?: { decisions?: unknown[] }; event?: { decisions?: unknown[] } };
      return n + (x.receipt?.decisions?.length ?? 0) + (x.event?.decisions?.length ?? 0);
    }, 0);
    expect(recorded).toBeGreaterThan(0);
    expect(report.decisionsReplayed).toBe(recorded);
  });
});

describe("migration 4: thread kind, binding, lease and conflict mode; grant maps; the invitation's vocabulary", () => {
  it("a room stored at version 3, reopened: the six columns are added, every thread gets its kind, binding and lease stay null, and reopening again changes nothing", async () => {
    const r = await makeRoom();
    const c = await r.admin.ok<Claim>("claim", null, claimBody());
    await r.admin.ok("roster", null, { op: "delegate", to: newKeyPair().key, kinds: ["renew"], lanes: "*", expiresAt: iso(clock.now + day) });
    const room = await revertLane(r);
    await inDO(r, (x) => {
      // The store as version 3 had it: without the six columns.
      for (const [table, column] of [["lanes", "kind"], ["lanes", "binding"], ["lanes", "lease_ms"], ["lanes", "conflict"], ["delegations", "acts"], ["invitations", "declared"]]) x.core.sql.all(`ALTER TABLE ${table} DROP COLUMN ${column}`);
      x.core.sql.all("UPDATE schema_version SET v = 3 WHERE id = 1");
    });
    const read = (x: TestRoom) =>
      inDO(x, (y) => ({
        v: y.core.sql.all("SELECT v FROM schema_version WHERE id = 1")[0]!["v"],
        lanes: y.core.sql.all("SELECT id, kind, binding, lease_ms, conflict FROM lanes ORDER BY seq"),
        delegations: y.core.sql.all("SELECT acts FROM delegations"),
        invitations: y.core.sql.all("SELECT COUNT(*) AS n FROM invitations WHERE declared IS NOT NULL")[0]!["n"],
      }));
    const r2 = await restarted(r);
    const after = await read(r2);
    expect(after).toEqual({
      v: 4,
      lanes: [
        { id: c.lane, kind: "claim", binding: null, lease_ms: null, conflict: null },
        { id: room, kind: "room", binding: null, lease_ms: null, conflict: null },
      ],
      delegations: [{ acts: null }],
      invitations: 0,
    });
    // The legacy lane works as before: renewed by the room's lease.
    expect((await r2.admin.ok<{ lease: { expiresAt: string } } & ActRecord>("renew", { lane: c.lane }, { lease: 1 })).lease.expiresAt).toBe(iso(clock.now + LEASE));
    expect(await read(await restarted(r2))).toEqual(after);
  });

  it("the step is idempotent: run again on a v2 room's store, it adds no column twice and leaves the kind of a thread a declared kind opened, of a recovery thread and of a room thread as they are", async () => {
    const r = await declaredRoom(v2((a) => void (a["task"] = { ...a["claim"]!, label: "Task", threads: ["task"] })));
    await ok<Claim>(r, r.admin, "task", null, claimBody("docs/**"));
    await ok<Claim>(r, r.admin, "recover", null, { op: "open", goal: "repair", scope: [".artroom/**"] }, { binding: null });
    await revertLane(r);
    await ok<Claim>(r, r.admin, "claim", null, claimBody());
    const out = await inDO(r, (room) => {
      const step = ROOM_MIGRATIONS.find((m) => m.version === 4)!;
      const kinds = () => room.core.sql.all("SELECT kind FROM lanes ORDER BY seq").map((x) => x["kind"]);
      const columns = () => room.core.sql.all("SELECT COUNT(*) AS n FROM pragma_table_info('lanes')")[0]!["n"];
      const before = { kinds: kinds(), columns: columns() };
      room.core.sql.transaction(() => step.up(room.core.sql));
      return { before, after: { kinds: kinds(), columns: columns() } };
    });
    expect(out.before.kinds).toEqual(["task", "recover", "room", "claim"]);
    expect(out.after).toEqual(out.before);
  });
});
