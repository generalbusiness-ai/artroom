/**
 * Declared acts stage 2 (request fd6f00b6): the guards of authority at
 * admission (src/authority.ts) and of the roster reads it uses
 * (src/roster.ts), each held from both sides against real rooms. Every
 * refusal at step 4 is unrecorded (R-ADM-1 step 4, R-ADM-8): each test
 * checks the exact code, that the refusal names no entry, and that the log
 * did not grow.
 *
 * Envelopes of `v2` rooms are signed by the test itself
 * (declared-support.ts), so the file runs in the legacy run only.
 */

import { describe, expect, it } from "vitest";
import type { ActDeclaration, ActRecord, Claim, Redeemed, Refusal, RosterRecord } from "@generalbusiness/artroom-contract";
import { policy } from "@generalbusiness/artroom-policy";
import { activate, act, bindingIn, declaredRoom, headSeq, ok, signed, v2 } from "./declared-support.ts";
import { addMember, b64url, call, Client, clock, day, DECLARED, digestBytes, isRefusal, iso, makeRoom, newKeyPair, pushChange, randomBytes, type TestRoom } from "./support.ts";

const ASK: ActDeclaration = { label: "Ask", targets: { entry: ["comment"] }, body: { text: { type: "text", max: 100 } }, who: { roles: ["member"] } };
const withAsk = (roles: ActDeclaration["who"]["roles"] = ["member"]) => v2((a) => void (a["ask"] = { ...ASK, who: { roles } }));
const tomorrow = () => iso(clock.now + day);

/** The code of an answer: the refusal's rule, or `accepted`. */
const code = (out: unknown): string => (isRefusal(out) ? out.rule : "accepted");

/** What an answer was: the kind of the act it recorded, or the refusal's code and reason. */
const answer = (out: unknown): string => (isRefusal(out) ? `${out.rule}: ${out.reason}` : String((out as ActRecord).kind));

/** A refusal decided before anything is recorded: the exact code and reason, no entry, and the log where it was. */
async function unrecorded(r: TestRoom, seq: number, out: unknown, rule: string, reason?: string): Promise<Refusal> {
  expect(code(out)).toBe(rule);
  if (reason !== undefined) expect((out as Refusal).reason).toBe(reason);
  expect((out as Refusal).act).toBeUndefined();
  expect(await headSeq(r)).toBe(seq);
  return out as Refusal;
}

/** A v2 grant from `by` to a new key: platform kinds and a map of declared kinds to their active bindings. */
async function granted(r: TestRoom, by: Client, kinds: string[], declared: string[]): Promise<Client> {
  const k = newKeyPair();
  const acts: Record<string, string> = {};
  for (const kind of declared) acts[kind] = (await bindingIn(r, kind))!;
  const g = await ok<RosterRecord>(r, by, "roster", null, { op: "delegate", to: k.key, kinds, acts, lanes: "*", expiresAt: tomorrow() }, { binding: null });
  return new Client(r, k, g.id);
}

/** A legacy grant from `by` to a new key, in a v1 room. */
async function grantedV1(r: TestRoom, by: Client, kinds: string[] | "*"): Promise<Client> {
  const k = newKeyPair();
  const g = await by.ok<RosterRecord>("roster", null, { op: "delegate", to: k.key, kinds, lanes: "*", expiresAt: tomorrow() });
  return new Client(r, k, g.id);
}

// ------------------------------------------------------------ a member's own key (R-ADM-3 case a)

describe.skipIf(DECLARED)("a member's own key: which table decides at step 4 (R-GEN-5 as amended, R-DECL-11)", () => {
  it("under a v1 document the legacy role table decides: a checker's claim is role-forbids, unrecorded; a member's claim and the checker's note are admitted", async () => {
    const r = await makeRoom();
    const bob = await addMember(r, "@bob", "member");
    const ci = await addMember(r, "@ci", "checker");
    const c = await bob.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
    const seq = await headSeq(r);
    await unrecorded(r, seq, await ci.act("claim", null, { goal: "g", scope: ["docs/**"] }), "role-forbids", "The role checker may not sign claim.");
    expect(answer(await ci.act("note", { act: c.id }, { text: "seen" }))).toBe("note");
  });

  it("under a v2 document renew keeps the legacy role table: a checker's renew is role-forbids, unrecorded; the holder's renew is admitted", async () => {
    const r = await declaredRoom();
    const bob = await addMember(r, "@bob", "member");
    const ci = await addMember(r, "@ci", "checker");
    const c = await ok<Claim>(r, bob, "claim", null, { goal: "g", scope: ["src/**"] });
    const seq = await headSeq(r);
    await unrecorded(r, seq, await act(r, ci, "renew", { lane: c.lane }, { lease: 1 }, { binding: null }), "role-forbids", "The role checker may not sign renew.");
    expect(answer(await act(r, bob, "renew", { lane: c.lane }, { lease: 1 }, { binding: null }))).toBe("renew");
  });

  it("a declared kind's who.roles decide: a member outside them is role-forbids, unrecorded; a role they name and an admin are admitted", async () => {
    const r = await declaredRoom(withAsk(["maintainer"]));
    const bob = await addMember(r, "@bob", "member");
    const mo = await addMember(r, "@mo", "maintainer");
    const c = await ok<Claim>(r, r.admin, "claim", null, { goal: "g", scope: ["src/**"] });
    const seq = await headSeq(r);
    await unrecorded(r, seq, await act(r, bob, "ask", { act: c.id }, { text: "?" }), "role-forbids", "The role member may not sign ask.");
    expect(answer(await act(r, mo, "ask", { act: c.id }, { text: "?" }))).toBe("ask");
    expect(answer(await act(r, r.admin, "ask", { act: c.id }, { text: "?" }))).toBe("ask");
  });

  it("a kind named like an inherited property is kind-undeclared for a member as for an admin, unrecorded: constructor is not read from the prototype of the declarations", async () => {
    const r = await declaredRoom();
    const bob = await addMember(r, "@bob", "member");
    const seq = await headSeq(r);
    for (const who of [bob, r.admin]) {
      const env = await signed(r, who, "constructor", null, {}, { binding: `sha256:${"1".repeat(64)}` });
      const w = (await r.stub.submit(env)) as unknown;
      expect(w).toMatchObject({ ok: { refused: true, rule: "kind-undeclared" } });
      await unrecorded(r, seq, (w as { ok: unknown }).ok, "kind-undeclared");
    }
  });

  it("an undeclared kind is left to step 4a whatever its body says: a checker's act of one, with a recover op in its body, is kind-undeclared, not role-forbids", async () => {
    const r = await declaredRoom();
    const ci = await addMember(r, "@ci", "checker");
    const seq = await headSeq(r);
    await unrecorded(r, seq, await act(r, ci, "merge", null, { op: "open", goal: "g", scope: [".artroom/x"] }, { binding: `sha256:${"1".repeat(64)}` }), "kind-undeclared");
    // The control: the same body as recover is the checker's role-forbids.
    await unrecorded(r, seq, await act(r, ci, "recover", null, { op: "open", goal: "g", scope: [".artroom/x"] }, { binding: null }), "role-forbids", "The role checker may not sign recover.");
  });
});

// ------------------------------------------------------------ roster acts (the kind `roster` in kindClass)

describe.skipIf(DECLARED)("roster acts in a v2 room are judged by the roster op table and never by a delegation (R-GEN-4, R-ADM-5)", () => {
  it("a member may delegate and may not invite (admin-required); a delegated key may sign no roster act (delegation-invalid); an admin may not rotate the recovery key (recovery-only); nothing refused is recorded", async () => {
    const r = await declaredRoom();
    const bob = await addMember(r, "@bob", "member");
    const d = await granted(r, bob, ["renew"], ["claim"]);
    const seq = await headSeq(r);
    const invite = { op: "invite", member: "@eve", role: "member", custody: "client", expiresAt: tomorrow(), secretHash: digestBytes(randomBytes(32)) };
    await unrecorded(r, seq, await act(r, bob, "roster", null, invite, { binding: null }), "admin-required", "Only an admin or the recovery key can sign the roster op invite.");
    const again = { op: "delegate", to: newKeyPair().key, kinds: ["renew"], acts: {}, lanes: "*", expiresAt: tomorrow() };
    await unrecorded(r, seq, await act(r, d, "roster", null, again, { binding: null }), "delegation-invalid", "A delegation cannot cover roster acts (delegate).");
    await unrecorded(r, seq, await act(r, r.admin, "roster", null, { op: "rotate-recovery", key: newKeyPair().key }, { binding: null }), "recovery-only", "Only the recovery key can sign rotate-recovery.");
    expect(answer(await act(r, bob, "roster", null, again, { binding: null }))).toBe("roster");
    expect(answer(await act(r, r.admin, "roster", null, invite, { binding: null }))).toBe("roster");
    // Each list of the op table is read whole: an admin's team op, and a member's undelegate of the member's own grant.
    expect(answer(await act(r, r.admin, "roster", null, { op: "team", team: "@crew", members: ["@bob"] }, { binding: null }))).toBe("roster");
    await unrecorded(r, await headSeq(r), await act(r, bob, "roster", null, { op: "team", team: "@gang", members: ["@bob"] }, { binding: null }), "admin-required", "Only an admin or the recovery key can sign the roster op team.");
    expect(answer(await act(r, bob, "roster", null, { op: "undelegate", delegation: d.delegation }, { binding: null }))).toBe("roster");
  });
});

// ------------------------------------------------------------ delegations (R-ADM-3 case b)

describe.skipIf(DECLARED)("a delegation covers a legacy kind, and renew, only through its kinds (R-ADM-5, R-DECL-17)", () => {
  it("under a v1 document a grant of note alone does not cover claim: delegation-invalid, unrecorded; a note under it is admitted", async () => {
    const r = await makeRoom();
    const bob = await addMember(r, "@bob", "member");
    const c = await bob.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
    const d = await grantedV1(r, bob, ["note"]);
    const seq = await headSeq(r);
    await unrecorded(r, seq, await d.act("claim", null, { goal: "g", scope: ["docs/**"] }), "delegation-invalid", `Delegation ${d.delegation} does not cover claim.`);
    expect(answer(await d.act("note", { act: c.id }, { text: "seen" }))).toBe("note");
  });

  it("under a v2 document a grant whose kinds do not list renew does not cover it: delegation-invalid, unrecorded; a grant that lists renew renews the grantor's thread", async () => {
    const r = await declaredRoom();
    const bob = await addMember(r, "@bob", "member");
    const c = await ok<Claim>(r, bob, "claim", null, { goal: "g", scope: ["src/**"] });
    const without = await granted(r, bob, [], ["claim"]);
    const withRenew = await granted(r, bob, ["renew"], ["claim"]);
    const seq = await headSeq(r);
    await unrecorded(r, seq, await act(r, without, "renew", { lane: c.lane }, { lease: 1 }, { binding: null }), "delegation-invalid", `Delegation ${without.delegation} does not cover renew.`);
    expect(answer(await act(r, withRenew, "renew", { lane: c.lane }, { lease: 1 }, { binding: null }))).toBe("renew");
  });
});

describe.skipIf(DECLARED)("a declared kind is covered only by the grant's signed map (R-DECL-17)", () => {
  it("a v2 grant whose map does not name claim does not cover it, though the grantor may sign it: delegation-invalid, unrecorded; a grant whose map names it is admitted", async () => {
    const r = await declaredRoom();
    const bob = await addMember(r, "@bob", "member");
    const renewOnly = await granted(r, bob, ["renew"], []);
    const named = await granted(r, bob, [], ["claim"]);
    const seq = await headSeq(r);
    await unrecorded(r, seq, await act(r, renewOnly, "claim", null, { goal: "g", scope: ["src/**"] }), "delegation-invalid", `Delegation ${renewOnly.delegation} does not cover claim.`);
    expect(answer(await act(r, named, "claim", null, { goal: "g", scope: ["src/**"] }))).toBe("claim");
  });

  it("a delegation granted under a v1 document carries no map: the members read shows none, and after the first v2 activation it covers no declared kind, in those words; a v2 grant's map is read back as signed", async () => {
    const r = await makeRoom();
    const bob = await addMember(r, "@bob", "member");
    const old = await grantedV1(r, bob, "*");
    const stored = (await r.admin.read({ q: "members" })).delegations.find((x) => x.id === old.delegation)!;
    expect(Object.hasOwn(stored, "acts")).toBe(false);
    await activate(r, v2());
    const seq = await headSeq(r);
    const out = await unrecorded(r, seq, await act(r, old, "claim", null, { goal: "g", scope: ["src/**"] }), "delegation-invalid", `Delegation ${old.delegation} was granted before this room declared its acts, so it covers no declared kind, claim included.`);
    expect(out.fix).toBe("Ask the grantor to delegate again.");
    // The control: a grant admitted under the v2 document, whose map is empty, is read back with that map.
    const empty = await granted(r, bob, ["renew"], []);
    expect((await r.admin.read({ q: "members" })).delegations.find((x) => x.id === empty.delegation)).toMatchObject({ kinds: ["renew"], acts: {} });
    const after = await headSeq(r);
    await unrecorded(r, after, await act(r, empty, "claim", null, { goal: "g", scope: ["src/**"] }), "delegation-invalid", `Delegation ${empty.delegation} does not cover claim.`);
  });
});

describe.skipIf(DECLARED)("a grantor's later loss of a kind stops the delegation covering it (R-ADM-5)", () => {
  it("under a v1 document: after the grantor becomes a checker, a claim under the grant is delegation-invalid, unrecorded; a note, which a checker may sign, is still admitted", async () => {
    const r = await makeRoom();
    const bob = await addMember(r, "@bob", "member");
    const d = await grantedV1(r, bob, ["claim", "note"]);
    const c = await d.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
    await r.admin.ok("roster", null, { op: "set-role", member: "@bob", role: "checker" });
    const seq = await headSeq(r);
    await unrecorded(r, seq, await d.act("claim", null, { goal: "g", scope: ["docs/**"] }), "delegation-invalid", "The grantor's role checker may no longer sign claim.");
    expect(answer(await d.act("note", { act: c.id }, { text: "seen" }))).toBe("note");
  });

  it("under a v2 document, for renew: after the grantor becomes a checker, a renew under the grant is delegation-invalid, unrecorded; before, it was admitted", async () => {
    const r = await declaredRoom();
    const bob = await addMember(r, "@bob", "member");
    const d = await granted(r, bob, ["renew"], ["claim"]);
    const c = await ok<Claim>(r, d, "claim", null, { goal: "g", scope: ["src/**"] });
    expect(answer(await act(r, d, "renew", { lane: c.lane }, { lease: 1 }, { binding: null }))).toBe("renew");
    await ok(r, r.admin, "roster", null, { op: "set-role", member: "@bob", role: "checker" }, { binding: null });
    const seq = await headSeq(r);
    await unrecorded(r, seq, await act(r, d, "renew", { lane: c.lane }, { lease: 1 }, { binding: null }), "delegation-invalid", "The grantor's role checker may no longer sign renew.");
  });

  it("under a v2 document, for a declared kind: after an activation takes the grantor's role out of who.roles, the binding unchanged, a claim under the grant is delegation-invalid, unrecorded; before, it was admitted", async () => {
    const r = await declaredRoom();
    const bob = await addMember(r, "@bob", "member");
    const d = await granted(r, bob, [], ["claim"]);
    expect(answer(await act(r, d, "claim", null, { goal: "g", scope: ["src/**"] }))).toBe("claim");
    const before = await bindingIn(r, "claim");
    await activate(r, v2((a) => void (a["claim"] = { ...a["claim"]!, who: { roles: ["maintainer"] } })));
    expect(await bindingIn(r, "claim")).toBe(before);
    const seq = await headSeq(r);
    await unrecorded(r, seq, await act(r, d, "claim", null, { goal: "g", scope: ["docs/**"] }), "delegation-invalid", "The grantor's role member may no longer sign claim.");
  });

  it("the grantor of a declared kind is judged by its who.roles, not by the legacy table: a member's grant of a kind the legacy vocabulary lacks covers it", async () => {
    const r = await declaredRoom(withAsk(["member"]));
    const bob = await addMember(r, "@bob", "member");
    const c = await ok<Claim>(r, bob, "claim", null, { goal: "g", scope: ["src/**"] });
    const d = await granted(r, bob, [], ["ask"]);
    expect(answer(await act(r, d, "ask", { act: c.id }, { text: "?" }))).toBe("ask");
  });
});

// ------------------------------------------------------------ requests judged as an act (R-CRED-5 as amended)

describe.skipIf(DECLARED)("a workspace request is judged as the act with step version on the thread (R-CRED-5 as amended)", () => {
  /** What a request was answered: `given`, or the refusal's code and reason. */
  const requested = (out: unknown): string => (isRefusal(out) ? `${out.rule}: ${out.reason}` : "given");

  it("under a delegation it is judged with that act's active binding: a grant whose map names propose is given the workspace; one that names only claim is delegation-invalid", async () => {
    const r = await declaredRoom();
    const bob = await addMember(r, "@bob", "member");
    const c = await ok<Claim>(r, bob, "claim", null, { goal: "g", scope: ["src/**"] });
    const both = await granted(r, bob, [], ["claim", "propose"]);
    const claimOnly = await granted(r, bob, [], ["claim"]);
    expect(requested(await both.request({ kind: "workspace", lane: c.lane, lease: 1 }))).toBe("given");
    expect(requested(await claimOnly.request({ kind: "workspace", lane: c.lane, lease: 1 }))).toBe(`delegation-invalid: Delegation ${claimOnly.delegation} does not cover propose.`);
  });

  it("on a recovery thread it is judged as recover's version op (R-DECL-21): a checker, who could not sign the legacy propose, is role-forbids; a member is admin-required; the admin is given the workspace", async () => {
    const r = await declaredRoom();
    const bob = await addMember(r, "@bob", "member");
    const ci = await addMember(r, "@ci", "checker");
    const c = await ok<Claim>(r, r.admin, "recover", null, { op: "open", goal: "repair", scope: [".artroom/**"] }, { binding: null });
    for (const kind of ["workspace", "workspace-token"] as const) {
      expect(requested(await ci.request({ kind, lane: c.lane, lease: 1 }))).toBe("role-forbids: The role checker may not sign recover.");
      expect(code(await bob.request({ kind, lane: c.lane, lease: 1 }))).toBe("admin-required");
    }
    expect(requested(await r.admin.request({ kind: "workspace", lane: c.lane, lease: 1 }))).toBe("given");
  });
});

// ------------------------------------------------------------ recover at step 4 (R-DECL-21)

describe.skipIf(DECLARED)("recover at step 4: the role table of the legacy act each op stands for (R-DECL-21, R-GEN-5)", () => {
  /** A v2 room with a recovery thread the admin holds, one version on it, a checker and a member. */
  async function recovery() {
    const r = await declaredRoom();
    const bob = await addMember(r, "@bob", "member");
    const ci = await addMember(r, "@ci", "checker");
    const held = await ok<Claim>(r, r.admin, "recover", null, { op: "open", goal: "repair", scope: [".artroom/**"] }, { binding: null });
    const head = pushChange(r, held.lane, { ".artroom/note.txt": "x" });
    await ok(r, r.admin, "recover", { lane: held.lane }, { op: "version", lease: 1, expectedGeneration: 0, head, summary: "s" }, { binding: null });
    const acts: Record<string, readonly [unknown, Record<string, unknown>]> = {
      open: [null, { op: "open", goal: "g", scope: [".artroom/x"] }],
      take: [{ lane: held.lane }, { op: "take", scope: [".artroom/**"], expectedGeneration: 1 }],
      version: [{ lane: held.lane }, { op: "version", lease: 1, expectedGeneration: 1, head, summary: "s" }],
      approve: [{ lane: held.lane, generation: 1 }, { op: "approve", head, verdict: "approve", scope: [".artroom/**"], text: "ok" }],
      land: [{ lane: held.lane, generation: 1 }, { op: "land", lease: 1, head }],
      release: [{ lane: held.lane }, { op: "release", lease: 1 }],
      note: [{ act: held.id }, { op: "note", text: "seen" }],
    };
    const recover = (who: Client, op: string) => act(r, who, "recover", acts[op]![0], acts[op]![1], { binding: null });
    return { r, bob, ci, recover };
  }

  // Step 7's code for a member, who could sign each legacy act: recorded, as a legacy recovery lane's refusals were.
  const MEMBER: Readonly<Record<string, string>> = { open: "admin-required", take: "admin-required", version: "not-holder", approve: "admin-required", land: "not-holder", release: "not-holder" };

  for (const op of ["open", "take", "version", "approve", "land", "release"])
    it(`recover ${op} by a checker, who could not sign the legacy act it stands for, is role-forbids, unrecorded; by a member it reaches step 7 and is recorded`, async () => {
      const { r, bob, ci, recover } = await recovery();
      const seq = await headSeq(r);
      await unrecorded(r, seq, await recover(ci, op), "role-forbids", "The role checker may not sign recover.");
      const out = await recover(bob, op);
      expect(code(out)).toBe(MEMBER[op]);
      expect((out as Refusal).act).toBeDefined();
    });

  it("recover note by a checker, who could sign the legacy note, is not refused at step 4: it reaches step 7 and is admin-required, recorded", async () => {
    const { r, ci, recover } = await recovery();
    const seq = await headSeq(r);
    const out = await recover(ci, "note");
    expect(code(out)).toBe("admin-required");
    expect((out as Refusal).act).toBeDefined();
    expect(await headSeq(r)).toBe(seq + 1);
  });

  it("a recover act with an op the room does not know is left to step 5 for every role: invalid-body, unrecorded, never role-forbids", async () => {
    const r = await declaredRoom();
    const bob = await addMember(r, "@bob", "member");
    const ci = await addMember(r, "@ci", "checker");
    const seq = await headSeq(r);
    for (const who of [r.admin, bob, ci]) await unrecorded(r, seq, await act(r, who, "recover", null, { op: "nope" }, { binding: null }), "invalid-body");
  });

  for (const op of ["constructor", "toString", "__proto__", "hasOwnProperty"])
    it(`a recover op named like an inherited property (${op}) stands for no legacy act: an admin's is invalid-body, unrecorded, as any unknown op is`, async () => {
      const r = await declaredRoom();
      const seq = await headSeq(r);
      await unrecorded(r, seq, await act(r, r.admin, "recover", null, { op }, { binding: null }), "invalid-body");
    });

  it("a recover act whose body is null reaches step 5 and is invalid-body, unrecorded, for an admin and for a checker; the room does not fail at step 4", async () => {
    const r = await declaredRoom();
    const ci = await addMember(r, "@ci", "checker");
    const seq = await headSeq(r);
    for (const who of [r.admin, ci]) {
      const w = (await r.stub.submit(await signed(r, who, "recover", null, null, { binding: null }))) as unknown;
      expect(w).toMatchObject({ ok: { refused: true, rule: "invalid-body" } });
      await unrecorded(r, seq, (w as { ok: unknown }).ok, "invalid-body", "body must be an object.");
    }
    // The control: a body that is an object with a known op is judged by its op.
    await unrecorded(r, seq, await act(r, ci, "recover", null, { op: "open", goal: "g", scope: [".artroom/x"] }, { binding: null }), "role-forbids");
  });
});

// ------------------------------------------------------------ invitations (R-DECL-17)

describe.skipIf(DECLARED)("an invitation knows the vocabulary it was admitted under (R-DECL-17)", () => {
  const invited = async (r: TestRoom, sign: (op: unknown) => Promise<RosterRecord>) => {
    const bytes = randomBytes(32);
    const inv = await sign({ op: "invite", member: "@agent", role: "agent", custody: "room", expiresAt: tomorrow(), secretHash: digestBytes(bytes) });
    return () => call<Redeemed | Refusal>(r.stub.redeem({ custody: "room", invitation: inv.id, secret: b64url(bytes) }, "x"));
  };
  const kindsOf = async (r: TestRoom, b: Redeemed) => (await r.admin.read({ q: "members" })).delegations.find((x) => x.id === b.delegation)!.kinds;

  it("admitted under a v1 document with no session and redeemed under it, it grants every legacy kind its role may sign, and its bearer claims", async () => {
    const r = await makeRoom();
    const b = (await (await invited(r, (op) => r.admin.ok<RosterRecord>("roster", null, op)))()) as Redeemed;
    expect(isRefusal(b)).toBe(false);
    expect(await kindsOf(r, b)).toEqual(["claim", "propose", "note", "review", "land", "release", "renew"]);
    expect(answer(await call(r.stub.bearerAct(b.bearer, { kind: "claim", target: null, body: { goal: "g", scope: ["src/**"] }, idempotencyKey: "b1" })))).toBe("claim");
  });

  it("admitted under a v2 document with no session and redeemed after the room returned to v1, it grants renew alone, and its bearer's claim is delegation-invalid", async () => {
    const r = await declaredRoom();
    const redeem = await invited(r, (op) => ok<RosterRecord>(r, r.admin, "roster", null, op, { binding: null }));
    await activate(r, policy());
    const b = (await redeem()) as Redeemed;
    expect(isRefusal(b)).toBe(false);
    expect(await kindsOf(r, b)).toEqual(["renew"]);
    expect(code(await call(r.stub.bearerAct(b.bearer, { kind: "claim", target: null, body: { goal: "g", scope: ["src/**"] }, idempotencyKey: "b1" })))).toBe("delegation-invalid");
  });
});
