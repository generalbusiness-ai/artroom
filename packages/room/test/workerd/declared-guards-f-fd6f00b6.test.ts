/**
 * Declared acts stage 2 (request fd6f00b6): guards of the Room's requests,
 * redemption, bearer acts, configuration parser, check jobs and migration
 * that had no test of their own (the guard audit, family F). Each test names
 * the rule it holds the Room to, and carries the nearest case on the other
 * side of the guard as its control. Envelopes are signed by the test itself
 * (declared-support.ts), so the file runs in the legacy run only.
 */
import { describe, expect, it } from "vitest";
import type { ActDeclaration, ActRecord, CheckerService, CheckJob, Claim, LaneId, PolicyDocument, Redeemed, Refusal, RosterRecord } from "@generalbusiness/artroom-contract";
import { policy, requireCheck } from "@generalbusiness/artroom-policy";
import { JOB_RETRY_MS } from "../../src/jobs.ts";
import { ROOM_MIGRATIONS } from "../../src/store.ts";
import { activate, act, bindingIn, declaredRoom, headSeq, inDO, ok, signed, v2 } from "./declared-support.ts";
import { addMember, advance, b64url, call, Client, clock, day, DECLARED, digestBytes, failure, iso, makeRoom, newKeyPair, pushChange, randomBytes, sign, tick, until, type TestRoom } from "./support.ts";

const OTHER = `sha256:${"1".repeat(64)}`;
const versionOf = (r: TestRoom) => inDO(r, (room) => room.core.activePolicy().version);

/** The envelope the room recorded for an entry. */
const envelopeOf = (r: TestRoom, id: string) =>
  inDO(r, (room) => (JSON.parse(String(room.core.sql.all("SELECT body FROM entries WHERE id = ?", id)[0]!["body"])) as { entry: { act: { envelope: Record<string, unknown> } } }).entry.act.envelope);

/** A room-custody invitation signed by the admin under the document in force, and its redemption. */
async function invited(r: TestRoom, member: string, role: string | undefined, session?: unknown) {
  const bytes = randomBytes(32);
  const op = { op: "invite", member, ...(role ? { role } : {}), custody: "room", expiresAt: iso(clock.now + day), secretHash: digestBytes(bytes), ...(session ? { session } : {}) };
  const inv = await ok<RosterRecord>(r, r.admin, "roster", null, op, { binding: null });
  return { id: inv.id, redeem: () => call<Redeemed | Refusal>(r.stub.redeem({ custody: "room", invitation: inv.id, secret: b64url(bytes) }, "x")) };
}
const unused = (r: TestRoom, id: string) => inDO(r, (room) => room.core.sql.all("SELECT used FROM invitations WHERE id = ?", id)[0]!["used"] === null);
const grantOf = async (r: TestRoom, redeemed: Redeemed | Refusal) => (await r.admin.read({ q: "members" })).delegations.find((x) => x.id === (redeemed as Redeemed).delegation);

/** A bearer session of a new agent whose grant covers claim and renew, in the room's vocabulary. */
async function bearerFor(r: TestRoom, declared: boolean, member = "@agent"): Promise<Redeemed> {
  const session = declared ? { kinds: ["renew"], acts: { claim: (await bindingIn(r, "claim"))! }, lanes: "*", ttlSeconds: 3600 } : { kinds: ["claim", "release", "renew"], lanes: "*", ttlSeconds: 3600 };
  return (await (await invited(r, member, "agent", session)).redeem()) as Redeemed;
}
const claimAct = (ikey: unknown, scope = "src/**") => ({ kind: "claim", target: null, body: { goal: "g", scope: [scope] }, idempotencyKey: ikey }) as never;

/** A room thread, as the room opens one for a revert (R-REV-6). */
const revertLane = (r: TestRoom) =>
  inDO(r, (room) => room.core.sql.transaction(() => String(room.core.host().record({ type: "revert-lane", of: "op_land_1" as never, scope: ["lib/**"], reason: "abort-after-landing" } as never).act)));

// ------------------------------------------------------------ workspace requests (R-CRED-5 as amended)

describe.skipIf(DECLARED)("a workspace request is judged as for an act with step version on the thread (R-CRED-5 as amended, R-WS-2)", () => {
  const NO_LANE = "act_999_deadbeef" as LaneId;

  it("for a lane that does not exist the signer is judged first, against the acts that make versions: a key of no member is not-member, a role that may sign none is role-forbids, and only a signer who may is told lane-unknown", async () => {
    const r = await declaredRoom();
    const ci = await addMember(r, "@ci", "checker");
    const stranger = new Client(r, newKeyPair());
    for (const kind of ["workspace", "workspace-token"] as const) {
      expect(await stranger.request({ kind, lane: NO_LANE, lease: 1 })).toMatchObject({ refused: true, rule: "not-member" });
      expect(await ci.request({ kind, lane: NO_LANE, lease: 1 })).toMatchObject({ refused: true, rule: "role-forbids", reason: "The role checker may not sign propose." });
      // The control: a signer who may sign the version act learns that the lane does not exist.
      expect(await r.admin.request({ kind, lane: NO_LANE, lease: 1 })).toMatchObject({ refused: true, rule: "lane-unknown", reason: `There is no lane ${NO_LANE}.` });
    }
  });

  it("with two acts that make versions on a thread, the first that authorizes the signer decides: a member who may sign one of them gets the workspace, whichever is declared first; a role that may sign neither is role-forbids", async () => {
    const forMaintainers = (a: Record<string, ActDeclaration>, label: string): ActDeclaration => ({ ...a["propose"]!, label, who: { roles: ["maintainer"] } });
    // `revise` is declared after `propose`. Propose authorizes a member, and the judgment stops there.
    const last = await declaredRoom(v2((a) => void (a["revise"] = forMaintainers(a, "Revise"))));
    const bob = await addMember(last, "@bob", "member");
    const c = await ok<Claim>(last, bob, "claim", null, { goal: "g", scope: ["src/**"] });
    expect(await bob.request({ kind: "workspace", lane: c.lane, lease: 1 })).not.toHaveProperty("refused");
    const ci = await addMember(last, "@ci", "checker");
    expect(await ci.request({ kind: "workspace", lane: c.lane, lease: 1 })).toMatchObject({ refused: true, rule: "role-forbids", reason: "The role checker may not sign revise." });
    // The control, with the order reversed: `draft` is declared before `propose`, refuses a member, and propose then authorizes.
    const first = await declaredRoom(
      v2((a) => {
        const propose = a["propose"]!;
        delete a["propose"];
        a["draft"] = forMaintainers({ propose }, "Draft");
        a["propose"] = propose;
      }),
    );
    const al = await addMember(first, "@al", "member");
    const c2 = await ok<Claim>(first, al, "claim", null, { goal: "g", scope: ["src/**"] });
    expect(await al.request({ kind: "workspace", lane: c2.lane, lease: 1 })).not.toHaveProperty("refused");
    const ci2 = await addMember(first, "@ci", "checker");
    expect(await ci2.request({ kind: "workspace", lane: c2.lane, lease: 1 })).toMatchObject({ refused: true, rule: "role-forbids", reason: "The role checker may not sign propose." });
  });

  it("a thread on which no declared act makes versions refuses a workspace wrong-thread, naming the thread's kind; a lane that does not exist is lane-unknown", async () => {
    const r = await declaredRoom(v2((a) => void (a["propose"] = { ...a["propose"]!, threads: ["room"] })));
    const c = await ok<Claim>(r, r.admin, "claim", null, { goal: "g", scope: ["src/**"] });
    for (const kind of ["workspace", "workspace-token"] as const) {
      expect(await r.admin.request({ kind, lane: c.lane, lease: 1 })).toMatchObject({ refused: true, rule: "wrong-thread", reason: `No declared act makes versions on ${c.lane}, a claim thread.` });
      // The control: the same signer, for a lane the room does not have.
      expect(await r.admin.request({ kind, lane: NO_LANE, lease: 1 })).toMatchObject({ refused: true, rule: "lane-unknown", reason: `There is no lane ${NO_LANE}.` });
    }
  });

  it("a workspace request under a delegation is judged with the version act's binding in force: a grant whose map names propose under it is granted; once the meaning of propose changes, the same grant is delegation-invalid", async () => {
    const r = await declaredRoom();
    const bob = await addMember(r, "@bob", "member");
    const c = await ok<Claim>(r, bob, "claim", null, { goal: "g", scope: ["src/**"] });
    const k = newKeyPair();
    const acts = { claim: (await bindingIn(r, "claim"))!, propose: (await bindingIn(r, "propose"))! };
    const g = await ok<RosterRecord>(r, bob, "roster", null, { op: "delegate", to: k.key, kinds: ["renew"], acts, lanes: "*", expiresAt: iso(clock.now + day) }, { binding: null });
    const delegate = new Client(r, k, g.id);
    expect(await delegate.request({ kind: "workspace", lane: c.lane, lease: 1 })).not.toHaveProperty("refused");
    // The control: the grant names the binding propose had before this activation.
    await activate(r, v2((a) => void (a["propose"] = { ...a["propose"]!, body: { ...a["propose"]!.body, why: { type: "text", max: 10, optional: true } } })));
    expect(await delegate.request({ kind: "workspace", lane: c.lane, lease: 1 })).toMatchObject({ refused: true, rule: "delegation-invalid", reason: "The delegation was granted for an earlier meaning of propose." });
  });

  it("under a v1 document a workspace request is judged as propose, which has no binding: a delegation that lists propose is granted, one that lists only claim is delegation-invalid", async () => {
    const r = await makeRoom();
    const bob = await addMember(r, "@bob", "member");
    const c = await bob.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
    const under = async (kinds: string[]) => {
      const k = newKeyPair();
      const g = await bob.ok<RosterRecord>("roster", null, { op: "delegate", to: k.key, kinds, lanes: "*", expiresAt: iso(clock.now + day) });
      return new Client(r, k, g.id);
    };
    const claimOnly = await under(["claim"]);
    expect(await claimOnly.request({ kind: "workspace", lane: c.lane, lease: 1 })).toMatchObject({ refused: true, rule: "delegation-invalid", reason: `Delegation ${claimOnly.delegation} does not cover propose.` });
    expect(await (await under(["claim", "propose"])).request({ kind: "workspace", lane: c.lane, lease: 1 })).not.toHaveProperty("refused");
  });
});

// ------------------------------------------------------------ redemption (R-DECL-17, R-CRED-3)

describe.skipIf(DECLARED)("what a room-custody session is granted across a change of vocabulary (R-DECL-17: intersection, never acquisition)", () => {
  it("an invitation admitted under a v2 document never gains a kind: a session that names no kind, redeemed after the room returned to v1, is refused with a reason and stays unused; it is not given its role's renew", async () => {
    const r = await declaredRoom();
    const none = await invited(r, "@one", "agent", { kinds: [], acts: {}, lanes: "*", ttlSeconds: 3600 });
    const renew = await invited(r, "@two", "agent", { kinds: ["renew"], acts: {}, lanes: "*", ttlSeconds: 3600 });
    await activate(r, policy());
    const seq = await headSeq(r);
    expect(await none.redeem()).toMatchObject({ refused: true, rule: "delegation-invalid", reason: `This invitation's session grants no kind under the room's active policy, version ${await versionOf(r)}.` });
    expect(await headSeq(r)).toBe(seq);
    expect(await unused(r, none.id)).toBe(true);
    // The control: a session that names renew keeps renew, and only renew.
    expect((await grantOf(r, await renew.redeem()))?.kinds).toEqual(["renew"]);
  });

  it("an invitation with no session keeps what it was admitted with under a v1 document: admitted under v1, every legacy kind its role may delegate; admitted under v2 and redeemed after the room returned to v1, renew alone", async () => {
    const legacy = await makeRoom();
    const before = await invited(legacy, "@agent", "agent");
    expect((await grantOf(legacy, await before.redeem()))?.kinds).toEqual(["claim", "propose", "note", "review", "land", "release", "renew"]);
    // The control: the invitation of the same shape, admitted under a v2 document.
    const r = await declaredRoom();
    const after = await invited(r, "@agent", "agent");
    await activate(r, policy());
    expect((await grantOf(r, await after.redeem()))?.kinds).toEqual(["renew"]);
  });

  it("a session of every kind (`*`) from before declared acts, redeemed after the first v2 activation, grants the delegable platform kinds of its role and no declared kind: renew for an agent, nothing for a checker", async () => {
    const r = await makeRoom();
    const star = { kinds: "*", lanes: "*", ttlSeconds: 3600 };
    const agent = await invited(r, "@agent", "agent", star);
    const ci = await invited(r, "@ci", "checker", star);
    // The control: a v1-era session limited to legacy kinds other than renew grants nothing.
    const narrow = await invited(r, "@narrow", "agent", { kinds: ["claim", "propose"], lanes: "*", ttlSeconds: 3600 });
    await activate(r, v2());
    expect(await grantOf(r, await agent.redeem())).toMatchObject({ kinds: ["renew"], acts: {} });
    expect(await grantOf(r, await ci.redeem())).toMatchObject({ kinds: [], acts: {} });
    expect(await grantOf(r, await narrow.redeem())).toMatchObject({ kinds: [], acts: {} });
  });

  it("an invitation that adds a key to an existing member names no role, and its session is granted by the member's role: renew under the v2 document, and renew, no legacy kind, after the room returned to v1", async () => {
    const r = await declaredRoom();
    await addMember(r, "@bob", "member");
    const under2 = await invited(r, "@bob", undefined);
    const under1 = await invited(r, "@bob", undefined);
    expect(await grantOf(r, await under2.redeem())).toMatchObject({ kinds: ["renew"], acts: {} });
    await activate(r, policy());
    expect((await grantOf(r, await under1.redeem()))?.kinds).toEqual(["renew"]);
  });

  it("a client redemption's join is checked at step 1 in the active vocabulary's words (R-ADM-1 as amended): a v: 2 join is refused as a platform kind in a v2 room, and as a wrong version in a v1 room", async () => {
    const join = (r: TestRoom) => {
      const key = newKeyPair();
      const envelope = { v: 2, room: r.id, actor: key.key, kind: "roster", target: null, body: { op: "join", invitation: "act_5_deadbeef", secret: b64url(randomBytes(32)) }, idempotencyKey: "join-1" };
      return { custody: "client", join: { envelope, sig: sign(key.seed, "artroom-envelope-v1", envelope) } } as never;
    };
    const declared = await declaredRoom();
    expect(await failure(declared.stub.redeem(join(declared), "x"))).toMatchObject({ code: "bad-request", message: "envelope.v must be 1 for the platform kind roster." });
    // The control: the same join in a v1 room, in the legacy vocabulary's words.
    const legacy = await makeRoom();
    expect(await failure(legacy.stub.redeem(join(legacy), "x"))).toMatchObject({ code: "bad-request", message: "envelope.v must be 1." });
  });
});

// ------------------------------------------------------------ bearer acts (R-CRED-3 step 4, R-API-9 as amended)

describe.skipIf(DECLARED)("the envelope the room builds for a bearer act (R-CRED-3 step 4, R-API-9 as amended, R-DECL-16)", () => {
  it("a bearer act may name its binding, and the room signs a v: 2 envelope that carries it; any other extra field is bad-request", async () => {
    // A room whose claim is not the code-review claim: only the binding the caller names is the active one.
    const r = await declaredRoom(v2((x) => void ((x["claim"] as { hold: unknown }).hold = { scope: "body.scope", workspace: true, leaseSeconds: 600 })));
    const own = (await bindingIn(r, "claim"))!;
    const b = await bearerFor(r, true);
    const out = (await r.stub.bearerAct(b.bearer, { ...(claimAct("named-1") as object), binding: own } as never)) as unknown as { ok?: ActRecord };
    expect(out).toMatchObject({ ok: { kind: "claim" } });
    expect(await envelopeOf(r, out.ok!.id)).toMatchObject({ v: 2, kind: "claim", binding: own });
    // The control: a field that is not one of the five.
    expect(await r.stub.bearerAct(b.bearer, { ...(claimAct("named-2", "docs/**") as object), binding: own, because: "extra" } as never)).toMatchObject({
      error: { code: "bad-request", message: "A bearer act has only kind, target, body, idempotencyKey and, for a declared kind, binding." },
    });
  });

  it("under a v1 document a bearer act is a v: 1 envelope with no binding, as it always was; under a v2 document it is v: 2 with the code-review binding of its kind", async () => {
    const legacy = await makeRoom();
    const lb = await bearerFor(legacy, false);
    const first = (await legacy.stub.bearerAct(lb.bearer, claimAct("v1-1"))) as unknown as { ok?: ActRecord };
    expect(first).toMatchObject({ ok: { kind: "claim" } });
    const envelope = await envelopeOf(legacy, first.ok!.id);
    expect(envelope).toMatchObject({ v: 1, kind: "claim" });
    expect(Object.hasOwn(envelope, "binding")).toBe(false);
    // The control: the same act in a v2 room.
    const declared = await declaredRoom();
    const db = await bearerFor(declared, true);
    const second = (await declared.stub.bearerAct(db.bearer, claimAct("v2-1"))) as unknown as { ok?: ActRecord };
    expect(second).toMatchObject({ ok: { kind: "claim" } });
    expect(await envelopeOf(declared, second.ok!.id)).toMatchObject({ v: 2, kind: "claim", binding: await bindingIn(declared, "claim") });
  });

  it("a bearer act whose idempotency key is not a string is bad-request at step 1 (R-ADM-1), under either vocabulary, also when it prints as a key the session has used; nothing is recorded, and the used key's retry gets its receipt", async () => {
    for (const declared of [false, true]) {
      const r = declared ? await declaredRoom() : await makeRoom();
      const b = await bearerFor(r, declared);
      const first = await r.stub.bearerAct(b.bearer, claimAct("a-list"));
      expect(first).toMatchObject({ ok: { kind: "claim" } });
      const seq = await headSeq(r);
      // The store compares a list of one text as that text, so `["a-list"]` finds the entry of "a-list": it is still not that act.
      for (const ikey of [["a-list"], { a: "map" }, 7, null]) {
        const out = (await r.stub.bearerAct(b.bearer, claimAct(ikey))) as unknown as { error?: { code: string; message: string } };
        expect(out, JSON.stringify(ikey)).toMatchObject({ error: { code: "bad-request" } });
        expect(out.error!.message).toContain("envelope.idempotencyKey");
      }
      expect(await r.stub.bearerAct(b.bearer, claimAct("a-list"))).toEqual(first);
      expect(await headSeq(r)).toBe(seq);
    }
  });

  it("a bearer act whose kind is not a string is bad-request at step 1 in the same words under either vocabulary, and a platform kind is a v: 1 envelope with no binding in a v2 room", async () => {
    for (const declared of [false, true]) {
      const r = declared ? await declaredRoom() : await makeRoom();
      const b = await bearerFor(r, declared);
      for (const kind of [["claim"], 7]) {
        const out = (await r.stub.bearerAct(b.bearer, { ...(claimAct("k-1") as object), kind } as never)) as unknown as { error?: { code: string; message: string } };
        expect(out, JSON.stringify(kind)).toMatchObject({ error: { code: "bad-request" } });
        expect(out.error!.message).toContain("envelope.kind");
      }
    }
    const r = await declaredRoom();
    const b = await bearerFor(r, true);
    const c = (await r.stub.bearerAct(b.bearer, claimAct("c-1"))) as unknown as { ok: Claim };
    expect(c).toMatchObject({ ok: { kind: "claim" } });
    advance(60_000);
    const renewed = (await r.stub.bearerAct(b.bearer, { kind: "renew", target: { lane: c.ok.lane }, body: { lease: 1 }, idempotencyKey: "r-1" } as never)) as unknown as { ok?: ActRecord };
    expect(renewed).toMatchObject({ ok: { kind: "renew" } });
    const envelope = await envelopeOf(r, renewed.ok!.id);
    expect(envelope).toMatchObject({ v: 1, kind: "renew" });
    expect(Object.hasOwn(envelope, "binding")).toBe(false);
  });

  it("a used idempotency key with an act of another kind is idempotency-mismatch, naming the original entry, before and after a change of vocabulary (R-IDEM-3)", async () => {
    const r = await makeRoom();
    const b = await bearerFor(r, false);
    const first = (await r.stub.bearerAct(b.bearer, claimAct("same-key"))) as unknown as { ok: Claim };
    expect(first).toMatchObject({ ok: { kind: "claim" } });
    const release = { kind: "release", target: { lane: first.ok.lane }, body: { lease: 1 }, idempotencyKey: "same-key" } as never;
    const mismatch = { ok: { refused: true, rule: "idempotency-mismatch", reason: `This idempotency key was already used for a different act, ${first.ok.id}.` } };
    expect(await r.stub.bearerAct(b.bearer, release)).toMatchObject(mismatch);
    await activate(r, v2());
    expect(await r.stub.bearerAct(b.bearer, release)).toMatchObject(mismatch);
    // The exact retry still gets its original receipt.
    expect(await r.stub.bearerAct(b.bearer, claimAct("same-key"))).toEqual({ ok: first.ok });
  });
});

// ------------------------------------------------------------ step 4a (R-DECL-16)

describe.skipIf(DECLARED)("step 4a: a kind is declared only by the document's own property, and binding-stale says what the act carried (R-DECL-16)", () => {
  it("`constructor`, a name every object inherits, is kind-undeclared like any other undeclared kind, signed by a member's own key or sent as a bearer act; the room computes no binding for it and records nothing", async () => {
    const r = await declaredRoom();
    const b = await bearerFor(r, true);
    const seq = await headSeq(r);
    const undeclared = (kind: string) => ({ ok: { refused: true, rule: "kind-undeclared", reason: expect.stringContaining(`The kind ${kind} is not declared in the room's active policy`) } });
    expect(await r.stub.submit(await signed(r, r.admin, "constructor", null, {}, { binding: OTHER }))).toMatchObject(undeclared("constructor"));
    expect(await r.stub.bearerAct(b.bearer, { kind: "constructor", target: null, body: {}, idempotencyKey: "c-1" } as never)).toMatchObject(undeclared("constructor"));
    const binding = await inDO(r, (room) => {
      try {
        return room.core.declaredBinding("constructor");
      } catch (e) {
        return `threw ${String(e)}`;
      }
    });
    expect(binding).toBeNull();
    // The control: a name no object inherits is answered the same way.
    expect(await r.stub.submit(await signed(r, r.admin, "merge", null, {}, { binding: OTHER }))).toMatchObject(undeclared("merge"));
    expect(await r.stub.bearerAct(b.bearer, { kind: "merge", target: null, body: {}, idempotencyKey: "m-1" } as never)).toMatchObject(undeclared("merge"));
    expect(await headSeq(r)).toBe(seq);
  });

  it("binding-stale says that a v: 1 act carries no binding, and names the binding a v: 2 act was prepared under", async () => {
    const r = await declaredRoom();
    const current = (await bindingIn(r, "claim"))!;
    const version = await versionOf(r);
    const body = { goal: "g", scope: ["src/**"] };
    expect(await act(r, r.admin, "claim", null, body, { binding: null })).toMatchObject({
      refused: true,
      rule: "binding-stale",
      reason: `The act of claim carries no binding; the active declaration's is ${current}, in policy version ${version}.`,
      current: { binding: current, policy: version },
    });
    // The control: an act that carries another binding is told which.
    expect(await act(r, r.admin, "claim", null, body, { binding: OTHER })).toMatchObject({
      refused: true,
      rule: "binding-stale",
      reason: `The act was prepared for claim as ${OTHER}; the active declaration's binding is ${current}, in policy version ${version}.`,
      current: { binding: current, policy: version },
    });
  });
});

// ------------------------------------------------------------ the configuration parser (R-POL-1, R-DECL-24)

describe.skipIf(DECLARED)("the configuration parser names what it cannot read, and never throws (R-POL-1, R-DECL-24)", () => {
  type Parsed = { ok?: boolean; problems?: string[]; threw?: string };
  const parse = (r: TestRoom, policyText: string | null, checkers: Record<string, string> = {}) =>
    inDO(r, (room): Parsed => {
      try {
        return room.core.parseConfig(policyText, checkers) as unknown as Parsed;
      } catch (e) {
        return { threw: String(e) };
      }
    });
  /** A proposal of these `.artroom/` files, as the room answers it. */
  async function proposed(r: TestRoom, files: Record<string, string>) {
    const c = await ok<Claim>(r, r.admin, "claim", null, { goal: "policy", scope: [".artroom/**"] });
    const head = pushChange(r, c.lane, files);
    const out = await r.stub.submit(await signed(r, r.admin, "propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "policy" }));
    await ok(r, r.admin, "release", { lane: c.lane }, { lease: 1 });
    return out as unknown as { ok?: Refusal | ActRecord };
  }
  const unit = JSON.stringify({ format: "artroom-checker-v2", act: "check", volatile: false, timeoutSeconds: 60 });

  it("a v2 document with a checker configuration that is not JSON: the parser names the file, and a proposal of it is policy-invalid", async () => {
    const r = await declaredRoom();
    const doc = JSON.stringify(v2());
    const parsed = await parse(r, doc, { unit: "{ not json" });
    expect(parsed).toMatchObject({ ok: false, problems: [expect.stringMatching(/^\.artroom\/checkers\/unit\.json is not valid JSON: /)] });
    const out = await proposed(r, { ".artroom/policy.json": doc, ".artroom/checkers/unit.json": "{ not json" });
    expect(out).toMatchObject({ ok: { refused: true, rule: "policy-invalid", reason: expect.stringContaining(".artroom/checkers/unit.json is not valid JSON") } });
    // The control: the same document with a configuration that is JSON.
    expect(await parse(r, doc, { unit })).toMatchObject({ ok: true });
    expect(await proposed(r, { ".artroom/policy.json": doc, ".artroom/checkers/unit.json": unit })).toMatchObject({ ok: { kind: "propose" } });
  });

  it("a policy file that holds null, or any value that is not an object, is reported as an invalid document: the parser does not read a format from it", async () => {
    const r = await declaredRoom();
    for (const text of ["null", "7", '"artroom-policy-v2"', "[]"]) {
      const parsed = await parse(r, text);
      expect(parsed, text).toMatchObject({ ok: false, problems: [expect.any(String)] });
    }
    expect(await proposed(r, { ".artroom/policy.json": "null" })).toMatchObject({ ok: { refused: true, rule: "policy-invalid" } });
    // The control: an object that names the v2 format goes to the acts validator, which reports its missing parts.
    const v2only = await parse(r, '{"format":"artroom-policy-v2"}');
    expect(v2only).toMatchObject({ ok: false });
    expect(v2only.problems!.some((p) => p.startsWith("acts"))).toBe(true);
  });

  it("only a comment on target none is held back for stage 4: the code-review document, whose note comments on an entry and a line and whose claim opens on none, is accepted; a note that also comments on none is refused, for that alone", async () => {
    // A v1 room, whose own document does not pass through the v2 parser.
    const r = await makeRoom();
    expect(await parse(r, JSON.stringify(v2()))).toMatchObject({ ok: true });
    const unanchored = v2((a) => void (a["note"] = { ...a["note"]!, targets: { none: ["comment"], entry: ["comment"], line: ["comment"] } }));
    expect(await parse(r, JSON.stringify(unanchored))).toEqual({ ok: false, problems: ["acts.note: a comment on target none is not run by this room until declared acts stage 4"] });
  });

  it("the historical opening kinds are the kinds that opened threads here, never room nor the platform's recover (R-DECL-8): a document whose threads name recover is refused, though a recovery thread was opened", async () => {
    const r = await declaredRoom(v2((a) => void (a["task"] = { ...a["claim"]!, label: "Task", threads: ["task"] })));
    await ok<Claim>(r, r.admin, "task", null, { goal: "a task", scope: ["docs/**"] });
    await ok<Claim>(r, r.admin, "claim", null, { goal: "g", scope: ["src/**"] });
    await ok<Claim>(r, r.admin, "recover", null, { op: "open", goal: "repair", scope: [".artroom/**"] }, { binding: null });
    await revertLane(r);
    expect(await inDO(r, (room) => room.core.sql.all("SELECT DISTINCT kind FROM lanes ORDER BY kind").map((x) => x["kind"]))).toEqual(["claim", "recover", "room", "task"]);
    const naming = (threads: string[]) => JSON.stringify(v2((a) => void (a["release"] = { ...a["release"]!, threads })));
    expect(await parse(r, naming(["claim", "recover"]))).toMatchObject({ ok: false, problems: [expect.stringContaining("recover is not room, a kind declared here with step open, or a kind that has opened a thread in this room")] });
    // The control: `task`, which this document no longer declares, opened a thread here; `room` is always a thread's kind.
    expect(await parse(r, naming(["claim", "task", "room"]))).toMatchObject({ ok: true });
    // The list itself, read directly: no document can show whether it holds `room`, which the validator accepts by name.
    expect(await inDO(r, (room) => room.core.openingKinds())).toEqual(["claim", "task"]);
  });
});

// ------------------------------------------------------------ check jobs (R-DECL-18)

describe.skipIf(DECLARED)("a refused check makes its job due again only when the refusal is binding-stale (R-DECL-18, R-EXEC-8)", () => {
  const R = `sha256:${"0".repeat(64)}` as const;
  type Job = CheckJob & { kind?: string; binding?: string };
  const jobs = (r: TestRoom) => inDO(r, (room) => room.core.sql.all("SELECT state, outcome, attempt FROM check_jobs ORDER BY rowid") as unknown as { state: string; outcome: string | null; attempt: number }[]);

  /**
   * A v2 room whose `src/**` needs the check `unit`. Its checker service holds
   * its first job until the test has changed the meaning of `check`, then
   * answers every job with a refusal of `rule`, which it makes up itself.
   */
  async function refusedAfterRebinding(rule: string) {
    const base = () => policy(requireCheck("unit", { paths: "src/**", by: "@ci", id: "unit-tests" }));
    const cfg = { format: "artroom-checker-v2", act: "check", volatile: false, timeoutSeconds: 60, runner: R };
    const r = await makeRoom({ policy: v2(() => {}, base()) as unknown as PolicyDocument, files: { ".artroom/checkers/unit.json": JSON.stringify(cfg) } });
    const alice = await addMember(r, "@alice", "member");
    await addMember(r, "@ci", "checker");
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const seen: Job[] = [];
    let answered = 0;
    const service: CheckerService = {
      async handle(job) {
        const n = seen.length;
        seen.push(job as Job);
        if (n === 0) await gate;
        answered++;
        return { refused: true, rule, reason: "The checker made this up.", fix: "None." } as never;
      },
    };
    r.world.checkers["unit"] = service;
    const c = await ok<Claim>(r, alice, "claim", null, { goal: "work", scope: ["src/**"] });
    const head = pushChange(r, c.lane, { "src/app.ts": "v2" });
    await ok(r, alice, "propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "change" });
    await until(async () => seen.length > 0);
    const old = seen[0]!.binding;
    await activate(r, v2((a) => void (a["check"] = { ...a["check"]!, body: { remark: { type: "text", max: 10, optional: true } } }), base()));
    const now = (await bindingIn(r, "check"))!;
    expect(now).not.toBe(old);
    release();
    await until(async () => answered > 0);
    await inDO(r, (room) => room.core.idle());
    const first = await jobs(r);
    advance(JOB_RETRY_MS + 1000);
    await tick(r, 3);
    await inDO(r, (room) => room.core.idle());
    return { first, later: await jobs(r), seen, now };
  }

  it("a job that is refused for another reason while an activation replaced its binding ends as refused, and is not sent again", async () => {
    const { first, later, seen } = await refusedAfterRebinding("check-binding");
    expect(first).toEqual([{ state: "done", outcome: "refused: check-binding", attempt: 1 }]);
    expect(seen.length).toBe(1);
    expect(later).toEqual(first);
  });

  it("the same job refused binding-stale is due again, and its next attempt names the binding in force; refused again under that binding, it ends", async () => {
    const { first, later, seen, now } = await refusedAfterRebinding("binding-stale");
    expect(first).toMatchObject([{ state: "owed", attempt: 1 }]);
    expect(seen.length).toBe(2);
    expect(seen[1]!.binding).toBe(now);
    // The second attempt named the binding in force, so its refusal ends the job.
    expect(later).toEqual([{ state: "done", outcome: "refused: binding-stale", attempt: 2 }]);
  });
});

// ------------------------------------------------------------ migration 4

describe.skipIf(DECLARED)("migration 4 gives a kind only to a thread that has none (R-DECL-6)", () => {
  it("run again on a v2 room's store, it leaves the kind of a thread a declared kind opened, of a recovery thread and of a room thread as they are", async () => {
    const r = await declaredRoom(v2((a) => void (a["task"] = { ...a["claim"]!, label: "Task", threads: ["task"] })));
    await ok<Claim>(r, r.admin, "task", null, { goal: "a task", scope: ["docs/**"] });
    await ok<Claim>(r, r.admin, "recover", null, { op: "open", goal: "repair", scope: [".artroom/**"] }, { binding: null });
    await revertLane(r);
    await ok<Claim>(r, r.admin, "claim", null, { goal: "g", scope: ["src/**"] });
    const out = await inDO(r, (room) => {
      const step = ROOM_MIGRATIONS.find((m) => m.version === 4)!;
      const kinds = () => room.core.sql.all("SELECT kind FROM lanes ORDER BY seq").map((x) => x["kind"]);
      const before = kinds();
      room.core.sql.transaction(() => step.up(room.core.sql));
      return { before, after: kinds() };
    });
    expect(out.before).toEqual(["task", "recover", "room", "claim"]);
    expect(out.after).toEqual(out.before);
  });
});
