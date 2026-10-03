/**
 * Declared acts stage 5 (request a5d64b35; the planner's clarification
 * fa120186; docs/protocol.md section 33.10): the generic act, the
 * declarations read and historical rendering, through the real client
 * package over HTTPS and the real MCP endpoint, against this Worker.
 *
 * These tests found their own `v1` and `v2` rooms and choose their own
 * bindings, so they run in the legacy run only, like stage 2's own tests.
 */

import { describe, expect, it } from "vitest";
import { exports } from "cloudflare:workers";
import type { ActDeclaration, ActsCatalogue, AnyEnvelope, Catalogue, Claim, DeclaredRecord, LegacyCatalogue, LogEntry, Proposal, Refusal, RosterRecord } from "@generalbusiness/artroom-contract";
import { isArtroomError, isRefusal } from "@generalbusiness/artroom-contract";
import { delegateOp, expandGrant, meaningOf } from "@generalbusiness/artroom-client";
import { CODE_REVIEW_ACTS, bindingOf, policy, requireCheck, requireReview } from "@generalbusiness/artroom-policy";
import { digestJson } from "../../src/crypto.ts";
import { activate, bindingIn, declaredRoom, headSeq, ok, signed, v2 } from "./declared-support.ts";
import { ASK, ORIGIN, asPolicy, bearer, bearerClient, httpClient, mcpTool, workerFetch } from "./declared-stage5-support.ts";
import { addMember, b64url, call, clock, day, DECLARED, digestBytes, expectOk, iso, makeRoom, newKeyPair, pushChange, randomBytes, tick, type TestRoom } from "./support.ts";

const withAsk = (ask: ActDeclaration = ASK) => v2((a) => void (a["ask"] = ask));
const refusedAs = (out: unknown, rule: string): Refusal => {
  if (!isRefusal(out)) throw new Error(`expected a ${rule} refusal, got ${JSON.stringify(out).slice(0, 200)}`);
  expect(out.rule).toBe(rule);
  return out;
};
const thrown = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (isArtroomError(e)) return e;
    throw e;
  }
  throw new Error("expected a thrown ArtroomError");
};
const log = async (r: TestRoom): Promise<LogEntry[]> => [...(await r.admin.read({ q: "log", req: { limit: 500 } })).acts];
const envelopeAt = async (r: TestRoom, seq: number) => {
  const e = (await log(r)).find((x) => x.seq === seq)!;
  if (e.entry.type === "system") throw new Error("a system entry");
  return e.entry.act.envelope as unknown as AnyEnvelope;
};
const posts = (seen: readonly { method: string; path: string }[], path: string) => seen.filter((s) => s.method === "POST" && s.path === path).length;
const gets = (seen: readonly { method: string; path: string }[], path: string) => seen.filter((s) => s.method === "GET" && s.path === path).length;
const get = (r: TestRoom, path: string, token?: string) => exports.default.fetch(`${ORIGIN}/v1/rooms/${r.id}/${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

describe.skipIf(DECLARED)("the declarations read (R-API-3, R-API-9 as amended)", () => {
  it("a v1 room answers with the legacy catalogue: no declarations, no bindings; over RPC, HTTPS and the client", async () => {
    const r = await makeRoom();
    const c = (await r.admin.read({ q: "acts" })) as LegacyCatalogue;
    expect(c).toEqual({ vocabulary: "artroom-legacy-v1", policy: c.policy, since: 1, until: null });
    expect(c.policy).toMatch(/^act_1_[0-9a-f]{8}$/);
    const bob = await addMember(r, "@bob", "member");
    const api = await httpClient(r, bob.keys);
    expect(await api.acts()).toEqual(c);
    const res = await get(r, "declarations", await r.admin.session());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(c);
    // A read needs a session or bearer token, as every read does.
    expect((await get(r, "declarations")).status).toBe(401);
  });

  it("a v2 room lists each declared kind with its declaration and binding, the steps version and lanes", async () => {
    const doc = withAsk();
    const r = await declaredRoom(doc);
    const c = (await r.admin.read({ q: "acts" })) as ActsCatalogue;
    expect(c).toMatchObject({ vocabulary: "declared", since: 1, until: null, steps: "artroom-steps-v1", lanes: doc.lanes });
    expect(Object.keys(c.acts).sort()).toEqual([...Object.keys(CODE_REVIEW_ACTS), "ask"].sort());
    for (const kind of Object.keys(c.acts)) {
      expect(c.acts[kind]).toEqual({ declaration: doc.acts[kind], binding: await bindingOf(doc, kind) });
      expect(c.acts[kind]!.binding).toBe(await bindingIn(r, kind));
    }
    // Platform kinds are not declared, so they are not listed.
    expect(Object.keys(c.acts)).not.toContain("renew");
  });

  it("at and policy select a retained version; a seq before the first activation, and an unknown version, are null and 404; both together, or a malformed one, are bad-request", async () => {
    const r = await declaredRoom(withAsk());
    const active = (await r.admin.read({ q: "acts" })) as Catalogue;
    expect(await r.admin.read({ q: "acts", at: 1 })).toEqual(active);
    expect(await r.admin.read({ q: "acts", at: 500 })).toEqual(active);
    expect(await r.admin.read({ q: "acts", policy: active.policy })).toEqual(active);
    expect(await r.admin.read({ q: "acts", at: 0 })).toBeNull();
    expect(await r.admin.read({ q: "acts", policy: "act_999_00000000" })).toBeNull();
    const token = await r.admin.session();
    expect((await get(r, "declarations?at=0", token)).status).toBe(404);
    expect((await get(r, `declarations?policy=${active.policy}`, token)).status).toBe(200);
    expect((await get(r, `declarations?at=1&policy=${active.policy}`, token)).status).toBe(400);
    expect((await get(r, "declarations?policy=latest", token)).status).toBe(400);
    expect((await get(r, "declarations?at=-1", token)).status).toBe(400);
    expect((await get(r, "declarations?at=1.5", token)).status).toBe(400);
  });
});

describe.skipIf(DECLARED)("a declared act the client has no method for, over HTTPS (R-DECL-16, 33.5 Generic act)", () => {
  it("the client signs v: 2 with the binding the caller read; the room admits it and records the act's own kind", async () => {
    const r = await declaredRoom(withAsk());
    const bob = await addMember(r, "@bob", "member");
    const c = await ok<Claim>(r, bob, "claim", null, { goal: "g", scope: ["src/**"] });
    const net = workerFetch();
    const api = await httpClient(r, bob.keys, { fetch: net.fetch });
    const catalogue = (await api.acts()) as ActsCatalogue;
    const { binding } = catalogue.acts["ask"]!;
    const out = (await api.act("ask", { act: c.id }, { text: "Why this scope?", urgency: "high" }, { binding })) as DeclaredRecord;
    expect(out).toMatchObject({ kind: "ask", text: "Why this scope?", by: { via: "member", member: "@bob", key: bob.key } });
    // The signed envelope in the log is exactly what the caller asked for, with that binding.
    expect(await envelopeAt(r, out.seq)).toMatchObject({ v: 2, kind: "ask", binding, target: { act: c.id }, body: { text: "Why this scope?", urgency: "high" }, actor: bob.key });
    // The handle read the catalogue once, when the caller asked, and not again to act.
    expect(gets(net.seen, "/declarations")).toBe(1);
    expect(posts(net.seen, "/acts")).toBe(1);
  });

  it("an undeclared kind is kind-undeclared; a body the declaration does not allow is invalid-body; neither is recorded", async () => {
    const r = await declaredRoom(withAsk());
    const bob = await addMember(r, "@bob", "member");
    const c = await ok<Claim>(r, bob, "claim", null, { goal: "g", scope: ["src/**"] });
    const api = await httpClient(r, bob.keys);
    const binding = (await bindingIn(r, "ask"))!;
    const seq = await headSeq(r);
    refusedAs(await api.act("shout", { act: c.id }, { text: "x" }, { binding }), "kind-undeclared");
    expect(refusedAs(await api.act("ask", { act: c.id }, { text: "x", colour: "red" }, { binding }), "invalid-body").reason).toContain("colour");
    refusedAs(await api.act("ask", { act: c.id }, { text: "x", urgency: "urgent" }, { binding }), "invalid-body");
    refusedAs(await api.act("ask", { act: c.id }, {}, { binding }), "invalid-body");
    // A target the declaration does not accept is refused at step 1.
    expect((await thrown(api.act("ask", { lane: c.lane }, { text: "x" }, { binding }))).code).toBe("bad-request");
    expect(await headSeq(r)).toBe(seq);
  });

  it("the client refuses before sending: no binding, a malformed one, a platform kind", async () => {
    const r = await declaredRoom(withAsk());
    const bob = await addMember(r, "@bob", "member");
    const net = workerFetch();
    const api = await httpClient(r, bob.keys, { fetch: net.fetch });
    const before = net.seen.length;
    const binding = (await bindingIn(r, "ask"))!;
    expect((await thrown(api.act("ask", null, { text: "x" }, {} as never))).message).toContain("binding");
    expect((await thrown(api.act("ask", null, { text: "x" }, { binding: "sha256:abc" }))).code).toBe("bad-request");
    for (const kind of ["renew", "roster", "recover"]) expect((await thrown(api.act(kind, null, {}, { binding }))).message).toContain("platform kind");
    expect(net.seen.length).toBe(before);
  });
});

describe.skipIf(DECLARED)("signed meaning is never changed by the client (R-DECL-16; request condition 2)", () => {
  /** A room with `ask`, a member, an entry to ask about, and the binding the member read. */
  async function prepared(ask: ActDeclaration = ASK) {
    const r = await declaredRoom(withAsk(ask));
    const bob = await addMember(r, "@bob", "member");
    const c = await ok<Claim>(r, bob, "claim", null, { goal: "g", scope: ["src/**"] });
    const net = workerFetch();
    const api = await httpClient(r, bob.keys, { fetch: net.fetch });
    const read = ((await api.acts()) as ActsCatalogue).acts["ask"]!.binding;
    return { r, bob, c, net, api, read };
  }

  const changes: readonly [string, ActDeclaration][] = [
    ["a changed body field limit", { ...ASK, body: { ...ASK.body, text: { type: "text", max: 100 } } }],
    ["a new required body field", { ...ASK, body: { ...ASK.body, topic: { type: "segment" } } }],
    ["a changed target", { ...ASK, targets: { entry: ["comment"], line: ["comment"] }, threads: ["claim"] }],
  ];
  for (const [what, next] of changes)
    it(`${what}: the act prepared under the old meaning is binding-stale, with the active binding and policy; the client sends nothing more`, async () => {
      const { r, c, net, api, read } = await prepared();
      await activate(r, withAsk(next));
      const seq = await headSeq(r);
      const sent = posts(net.seen, "/acts");
      const looked = gets(net.seen, "/declarations");
      const stale = refusedAs(await api.act("ask", { act: c.id }, { text: "still?" }, { binding: read }), "binding-stale");
      const active = (await r.admin.read({ q: "acts" })) as ActsCatalogue;
      expect(stale.current).toEqual({ binding: active.acts["ask"]!.binding, policy: active.policy });
      expect(stale.current!.binding).not.toBe(read);
      // Nothing recorded; one submission; no read and no second signature on the caller's behalf.
      expect(await headSeq(r)).toBe(seq);
      expect(posts(net.seen, "/acts")).toBe(sent + 1);
      expect(gets(net.seen, "/declarations")).toBe(looked);
    });

  it("a changed hold: an opening act prepared before its hold changed is binding-stale; the caller reads again and resubmits deliberately", async () => {
    const r = await declaredRoom();
    const bob = await addMember(r, "@bob", "member");
    const api = await httpClient(r, bob.keys);
    const read = ((await api.acts()) as ActsCatalogue).acts["claim"]!.binding;
    await activate(r, v2((a) => void ((a["claim"] as { hold: unknown }).hold = { scope: "body.scope", workspace: true, leaseSeconds: 600 })));
    const stale = refusedAs(await api.act("claim", null, { goal: "g", scope: ["src/**"] }, { binding: read }), "binding-stale");
    // The caller reads the declaration again, sees the shorter lease, and chooses to go ahead.
    const now = ((await api.acts()) as ActsCatalogue).acts["claim"]!;
    expect(now.binding).toBe(stale.current!.binding);
    expect(now.declaration.hold).toMatchObject({ leaseSeconds: 600 });
    const claim = (await api.act("claim", null, { goal: "g", scope: ["src/**"] }, { binding: now.binding })) as DeclaredRecord;
    expect(claim).toMatchObject({ kind: "claim", lease: { generation: 1, expiresAt: iso(clock.now + 600_000) } });
  });

  it("a label-only or help-only edit leaves the binding equal, and the act prepared before it is admitted", async () => {
    const { r, c, api, read } = await prepared();
    await activate(r, withAsk({ ...ASK, label: "Question", help: "Ask anything.", refusals: { "invalid-body": { reason: "That is not a question.", fix: "Write one." } } }));
    const now = ((await api.acts()) as ActsCatalogue).acts["ask"]!;
    expect(now.binding).toBe(read);
    expect(now.declaration.label).toBe("Question");
    const out = (await api.act("ask", { act: c.id }, { text: "same meaning" }, { binding: read })) as DeclaredRecord;
    expect(out.kind).toBe("ask");
  });

  it("a lost result is retried with the same bytes, and an exact retry after a meaning change returns the original record", async () => {
    const { r, c, net, api, read } = await prepared();
    let kept: Parameters<typeof api.replay>[0] | undefined;
    net.loseNext("/acts");
    const out = (await api.act("ask", { act: c.id }, { text: "once" }, { binding: read, idempotencyKey: "ask-once", onPrepared: (p) => void (kept = p) })) as DeclaredRecord;
    const bodies = net.seen.filter((s) => s.method === "POST" && s.path === "/acts").map((s) => s.body);
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toBe(bodies[0]);
    expect((await log(r)).filter((e) => e.entry.type === "act" && (e.entry.act.envelope.kind as string) === "ask")).toHaveLength(1);
    // The prepared act carries the binding it was signed under, and nothing newer.
    expect(kept).toMatchObject({ kind: "ask", binding: read, idempotencyKey: "ask-once" });
    expect((kept!.signed!.envelope as { binding?: string }).binding).toBe(read);
    // The meaning changes. The exact retry still gets the original record (R-IDEM-2); a new act under the old binding does not.
    await activate(r, withAsk({ ...ASK, body: { text: { type: "text", max: 50 } } }));
    expect(await api.replay(kept!)).toEqual(out);
    refusedAs(await api.act("ask", { act: c.id }, { text: "again" }, { binding: read }), "binding-stale");
  });
});

describe.skipIf(DECLARED)("who may act: roles and grants (R-DECL-11, R-DECL-17; request condition 2)", () => {
  it("a role the declaration does not list is role-forbids; an admin may sign every declared act", async () => {
    const r = await declaredRoom(withAsk({ ...ASK, who: { roles: ["agent"] } }));
    const bob = await addMember(r, "@bob", "member");
    const c = await ok<Claim>(r, bob, "claim", null, { goal: "g", scope: ["src/**"] });
    const binding = (await bindingIn(r, "ask"))!;
    refusedAs(await (await httpClient(r, bob.keys)).act("ask", { act: c.id }, { text: "x" }, { binding }), "role-forbids");
    expect(((await (await httpClient(r, r.admin.keys)).act("ask", { act: c.id }, { text: "x" }, { binding })) as DeclaredRecord).kind).toBe("ask");
  });

  it("a grant is expanded before signing: * names every kind the role may grant, with the active bindings; nothing else is covered", async () => {
    const r = await declaredRoom(withAsk());
    const bob = await addMember(r, "@bob", "member");
    const api = await httpClient(r, bob.keys);
    const catalogue = (await api.acts()) as ActsCatalogue;
    const k = newKeyPair();
    const op = await delegateOp(catalogue, "member", { to: k.key, kinds: "*", lanes: "*", expiresAt: iso(clock.now + day) });
    // A member may sign and delegate the code-review acts but check, and ask; renew is the one platform kind.
    expect(op).toMatchObject({ op: "delegate", kinds: ["renew"] });
    const acts = (op as unknown as { acts: Record<string, string> }).acts;
    expect(Object.keys(acts).sort()).toEqual(["ask", "claim", "land", "note", "propose", "release", "review"]);
    for (const [kind, b] of Object.entries(acts)) expect(b).toBe(catalogue.acts[kind]!.binding);
    const grant = expectOk(await api.roster(op)) as RosterRecord;
    // A kind added after the grant was signed is not covered by it.
    await activate(r, v2((a) => void ((a["ask"] = ASK), (a["shout"] = { ...ASK, label: "Shout" }))));
    const c = await ok<Claim>(r, bob, "claim", null, { goal: "g", scope: ["src/**"] });
    const under = await httpClient(r, k, { delegation: grant.id });
    expect(((await under.act("ask", { act: c.id }, { text: "x" }, { binding: (await bindingIn(r, "ask"))! })) as DeclaredRecord).by).toMatchObject({ via: "delegation", member: "@bob", delegation: grant.id });
    expect(refusedAs(await under.act("shout", { act: c.id }, { text: "x" }, { binding: (await bindingIn(r, "shout"))! }), "delegation-invalid").reason).toContain("does not cover shout");
  });

  it("a kind the role may not grant, or that is not declared, is refused by the client before anything is signed; a list grants only what it names", async () => {
    const r = await declaredRoom(withAsk({ ...ASK, who: { roles: ["member"], delegable: false } }));
    const catalogue = (await r.admin.read({ q: "acts" })) as ActsCatalogue;
    const k = newKeyPair();
    const want = (kinds: "*" | string[]) => delegateOp(catalogue, "member", { to: k.key, kinds, lanes: "*", expiresAt: iso(clock.now + day) });
    expect((await thrown(want(["check"]))).message).toContain("The role member may not grant check.");
    expect((await thrown(want(["ask"]))).message).toContain("The role member may not grant ask.");
    expect((await thrown(want(["merge"]))).message).toContain("merge is not declared");
    expect((await thrown(want(["roster"]))).message).toContain("The role member may not grant roster.");
    expect(await want(["note", "renew"])).toMatchObject({ kinds: ["renew"], acts: { note: catalogue.acts["note"]!.binding } });
    // * leaves out what may not be delegated, and says so by not naming it.
    expect(Object.keys((expandGrant(catalogue, "member", "*") as { grant: { acts: object } }).grant.acts)).not.toContain("ask");
    // In a v1 room the helper returns the legacy shape, kinds as given.
    const legacy = (await (await makeRoom()).admin.read({ q: "acts" })) as Catalogue;
    expect(await delegateOp(legacy, "member", { to: k.key, kinds: "*", lanes: "*", expiresAt: iso(clock.now + day) })).toEqual({ op: "delegate", to: k.key, kinds: "*", lanes: "*", expiresAt: iso(clock.now + day) });
  });

  it("a grant signed before a meaning change and sent after it is binding-stale; an act under a grant made for an earlier meaning is delegation-invalid", async () => {
    const r = await declaredRoom(withAsk());
    const bob = await addMember(r, "@bob", "member");
    const api = await httpClient(r, bob.keys);
    const before = (await api.acts()) as ActsCatalogue;
    const k1 = newKeyPair();
    const k2 = newKeyPair();
    const late = await delegateOp(before, "member", { to: k1.key, kinds: ["ask"], lanes: "*", expiresAt: iso(clock.now + day) });
    const early = expectOk(await api.roster(await delegateOp(before, "member", { to: k2.key, kinds: ["ask"], lanes: "*", expiresAt: iso(clock.now + day) }))) as RosterRecord;
    await activate(r, withAsk({ ...ASK, body: { text: { type: "text", max: 50 } } }));
    const seq = await headSeq(r);
    // The delayed grant names the old binding: refused, unrecorded, naming the active one.
    const stale = refusedAs(await api.roster(late), "binding-stale");
    expect(stale.current?.binding).toBe(await bindingIn(r, "ask"));
    expect(await headSeq(r)).toBe(seq);
    // The grant admitted earlier does not cover the new meaning.
    const c = await ok<Claim>(r, bob, "claim", null, { goal: "g", scope: ["src/**"] });
    const under = await httpClient(r, k2, { delegation: early.id });
    const out = refusedAs(await under.act("ask", { act: c.id }, { text: "x" }, { binding: (await bindingIn(r, "ask"))! }), "delegation-invalid");
    expect(out.reason).toBe("The delegation was granted for an earlier meaning of ask.");
  });
});

describe.skipIf(DECLARED)("the named methods and the legacy vocabulary (R-API-9 as amended; request conditions 1 and 3)", () => {
  it("a v1 room: the named methods sign v: 1 as before; the generic act is bad-request and records nothing", async () => {
    const r = await makeRoom();
    const bob = await addMember(r, "@bob", "member");
    const net = workerFetch();
    const api = await httpClient(r, bob.keys, { fetch: net.fetch });
    const claim = expectOk(await api.claim({ goal: "g", scope: ["src/**"] }));
    expect(await envelopeAt(r, claim.seq)).toMatchObject({ v: 1, kind: "claim" });
    expect((await envelopeAt(r, claim.seq)) as { binding?: unknown }).not.toHaveProperty("binding");
    expectOk(await api.renew(claim));
    // The handle learned the vocabulary once.
    expect(gets(net.seen, "/declarations")).toBe(1);
    const seq = await headSeq(r);
    const e = await thrown(api.act("claim", null, { goal: "g", scope: ["docs/**"] }, { binding: `sha256:${"a".repeat(64)}` }));
    expect(e.code).toBe("bad-request");
    expect(await headSeq(r)).toBe(seq);
  });

  it("a v2 room with the code-review declarations: each named method signs v: 2 with the binding it was built for; renew stays v: 1", async () => {
    const r = await declaredRoom(v2(() => {}, policy(requireReview({ paths: "src/**", from: "role:maintainer", id: "rv" }))));
    const bob = await addMember(r, "@bob", "member");
    const mo = await addMember(r, "@mo", "maintainer");
    const net = workerFetch();
    const api = await httpClient(r, bob.keys, { fetch: net.fetch });
    const claim = expectOk(await api.claim({ goal: "g", scope: ["src/**"] }));
    expect(await envelopeAt(r, claim.seq)).toMatchObject({ v: 2, kind: "claim", binding: await bindingIn(r, "claim") });
    const renewed = expectOk(await api.renew(claim));
    expect(await envelopeAt(r, renewed.seq)).toMatchObject({ v: 1, kind: "renew" });
    const head = pushChange(r, claim.lane, { "src/app.ts": "v2" });
    const proposal = expectOk(await api.propose(claim, { head, expectedGeneration: 0, summary: "s" })) as Proposal;
    expect(await envelopeAt(r, proposal.seq)).toMatchObject({ v: 2, kind: "propose", binding: await bindingIn(r, "propose") });
    const note = expectOk(await api.note({ act: claim.id }, { text: "n" }));
    expect(await envelopeAt(r, note.seq)).toMatchObject({ v: 2, kind: "note", binding: await bindingIn(r, "note") });
    const review = expectOk(await (await httpClient(r, mo.keys)).review({ lane: claim.lane, generation: 1, head }, { verdict: "approve", scope: ["src/**"], text: "ok" }));
    expect(await envelopeAt(r, review.seq)).toMatchObject({ v: 2, kind: "review", binding: await bindingIn(r, "review") });
    const released = expectOk(await api.release(claim));
    expect(await envelopeAt(r, released.seq)).toMatchObject({ v: 2, kind: "release", binding: await bindingIn(r, "release") });
    // One read of the catalogue served every named act of this handle.
    expect(gets(net.seen, "/declarations")).toBe(1);
  });

  it("a room whose claim means something else: the named claim carries the code-review binding, is binding-stale, and is not sent again; the next call reads again", async () => {
    const other = v2((a) => void ((a["claim"] as { hold: unknown }).hold = { scope: "body.scope", workspace: true, leaseSeconds: 600 }));
    const r = await declaredRoom(other);
    const bob = await addMember(r, "@bob", "member");
    const net = workerFetch();
    const api = await httpClient(r, bob.keys, { fetch: net.fetch });
    const seq = await headSeq(r);
    const stale = refusedAs(await api.claim({ goal: "g", scope: ["src/**"] }), "binding-stale");
    expect(stale.current?.binding).toBe(await bindingIn(r, "claim"));
    // What the method signed is the code-review claim's binding under this room's steps and lanes, never the room's own.
    const sent = JSON.parse(net.seen.find((s) => s.method === "POST" && s.path === "/acts")!.body!) as { envelope: { v: number; binding: string } };
    expect(sent.envelope).toMatchObject({ v: 2, binding: await bindingOf({ ...other, acts: CODE_REVIEW_ACTS }, "claim") });
    expect(sent.envelope.binding).not.toBe(await bindingIn(r, "claim"));
    expect(await headSeq(r)).toBe(seq);
    expect(posts(net.seen, "/acts")).toBe(1);
    expect(gets(net.seen, "/declarations")).toBe(1);
    // The same call again is the caller's choice. The handle reads the catalogue again for it, and the answer is the same.
    refusedAs(await api.claim({ goal: "g", scope: ["src/**"] }), "binding-stale");
    expect(gets(net.seen, "/declarations")).toBe(2);
    // The generic act with the room's own binding is how a caller who accepts this room's meaning acts.
    const mine = (await api.act("claim", null, { goal: "g", scope: ["src/**"] }, { binding: (await bindingIn(r, "claim"))! })) as DeclaredRecord;
    expect(mine).toMatchObject({ kind: "claim", lease: { expiresAt: iso(clock.now + 600_000) } });
  });

  it("a room that does not declare a named kind refuses it kind-undeclared; a room that moves to v2 under an open handle is read again", async () => {
    const jam = v2((a) => {
      for (const k of Object.keys(a)) delete a[k];
      a["ask"] = ASK;
    });
    const r = await declaredRoom(jam);
    const api = await httpClient(r, r.admin.keys);
    refusedAs(await api.claim({ goal: "g", scope: ["src/**"] }), "kind-undeclared");
    // A v1 room that activates a v2 document while a handle is open.
    const moving = await makeRoom();
    const net = workerFetch();
    const admin = await httpClient(moving, moving.admin.keys, { fetch: net.fetch });
    const c1 = expectOk(await admin.claim({ goal: "a", scope: ["src/**"] }));
    expect(await envelopeAt(moving, c1.seq)).toMatchObject({ v: 1 });
    await activate(moving, v2());
    // The handle still holds the v1 vocabulary: its v: 1 claim is refused, unrecorded, and it forgets what it read.
    refusedAs(await admin.claim({ goal: "b", scope: ["docs/**"] }), "binding-stale");
    const c2 = expectOk(await admin.claim({ goal: "b", scope: ["docs/**"] }));
    expect(await envelopeAt(moving, c2.seq)).toMatchObject({ v: 2, binding: await bindingIn(moving, "claim") });
    expect(gets(net.seen, "/declarations")).toBe(2);
  });
});

describe.skipIf(DECLARED)("the generic act over the MCP endpoint (R-CRED-10 and R-API-9 as fa120186 amends them)", () => {
  const text = (res: { content: { text: string }[] }) => res.content[0]!.text.split("\n")[0]!;

  it("a bearer reads the declarations with acts, and performs a kind that has no named tool with act, signed under its delegation", async () => {
    const r = await declaredRoom(withAsk());
    const b = await bearer(r, "@agent", "agent", { kinds: ["renew"], acts: { claim: (await bindingIn(r, "claim"))!, ask: (await bindingIn(r, "ask"))! } });
    const list = await mcpTool(r, b.bearer, "acts", {});
    expect(list.isError).toBe(false);
    expect(list.structuredContent).toEqual(await r.admin.read({ q: "acts" }));
    expect(text(list)).toContain("ask (Ask)");
    const claim = (await mcpTool(r, b.bearer, "claim", { goal: "g", scope: ["src/**"] })).structuredContent as Claim;
    const binding = list.structuredContent.acts.ask.binding as string;
    const args = { kind: "ask", target: { act: claim.id }, body: { text: "Which part?" }, binding, idempotencyKey: "ask-1" };
    const done = await mcpTool(r, b.bearer, "act", args);
    expect(done.isError).toBe(false);
    expect(done.structuredContent).toMatchObject({ kind: "ask", text: "Which part?", by: { via: "delegation", member: "@agent", delegation: b.delegation } });
    expect(await envelopeAt(r, done.structuredContent.seq)).toMatchObject({ v: 2, kind: "ask", binding, delegation: b.delegation });
    // An exact retry is the original record, also after the kind's meaning has changed.
    const seq = await headSeq(r);
    expect((await mcpTool(r, b.bearer, "act", args)).structuredContent).toEqual(done.structuredContent);
    await activate(r, withAsk({ ...ASK, body: { text: { type: "text", max: 50 } } }));
    const after = await headSeq(r);
    expect((await mcpTool(r, b.bearer, "act", args)).structuredContent).toEqual(done.structuredContent);
    expect(seq + 1).toBe(after);
    // A new act under the binding the agent read is binding-stale, and the tool's text says what the active meaning is.
    const stale = await mcpTool(r, b.bearer, "act", { ...args, idempotencyKey: "ask-2" });
    expect(stale.isError).toBe(false);
    expect(stale.structuredContent).toMatchObject({ refused: true, rule: "binding-stale", current: { binding: await bindingIn(r, "ask") } });
    expect(text(stale)).toContain(`The active binding is ${await bindingIn(r, "ask")}`);
    expect(text(stale)).toContain("Nothing was done.");
    expect(await headSeq(r)).toBe(after);
  });

  it("a grant that does not name the kind, names an earlier binding, or whose grantor's role lost the kind does not cover the act; the room never replaces the binding", async () => {
    const r = await declaredRoom(withAsk());
    const none = await bearer(r, "@a1", "agent", { kinds: ["renew"], acts: { claim: (await bindingIn(r, "claim"))! } });
    const some = await bearer(r, "@a2", "agent", { kinds: [], acts: { ask: (await bindingIn(r, "ask"))! } });
    const c = await ok<Claim>(r, r.admin, "claim", null, { goal: "g", scope: ["src/**"] });
    const old = (await bindingIn(r, "ask"))!;
    const call = (token: string, binding: string, key: string) => mcpTool(r, token, "act", { kind: "ask", target: { act: c.id }, body: { text: "x" }, binding, idempotencyKey: key });
    expect((await call(none.bearer, old, "k1")).structuredContent).toMatchObject({ rule: "delegation-invalid", reason: expect.stringContaining("does not cover ask") });
    // The meaning changes. The grant was signed for the old binding.
    await activate(r, withAsk({ ...ASK, body: { text: { type: "text", max: 50 } } }));
    const now = (await bindingIn(r, "ask"))!;
    const seq = await headSeq(r);
    // With the new binding the grant does not cover the act; with the old one the act itself is stale. Neither is admitted.
    expect((await call(some.bearer, now, "k2")).structuredContent).toMatchObject({ rule: "delegation-invalid", reason: "The delegation was granted for an earlier meaning of ask." });
    expect((await call(some.bearer, old, "k3")).structuredContent).toMatchObject({ rule: "binding-stale", current: { binding: now } });
    expect(await headSeq(r)).toBe(seq);
    // who.roles is not in the binding: narrowing it keeps the binding and stops the grant covering the kind.
    const r2 = await declaredRoom(withAsk());
    const agent = await bearer(r2, "@a3", "agent", { kinds: [], acts: { ask: (await bindingIn(r2, "ask"))! } });
    const c2 = await ok<Claim>(r2, r2.admin, "claim", null, { goal: "g", scope: ["src/**"] });
    await activate(r2, withAsk({ ...ASK, who: { roles: ["member"] } }));
    expect(await bindingIn(r2, "ask")).toBe(await bindingOf(withAsk(), "ask"));
    const lost = await mcpTool(r2, agent.bearer, "act", { kind: "ask", target: { act: c2.id }, body: { text: "x" }, binding: (await bindingIn(r2, "ask"))!, idempotencyKey: "k4" });
    expect(lost.structuredContent).toMatchObject({ rule: "delegation-invalid", reason: expect.stringContaining("may no longer sign ask") });
  });

  it("platform kinds, acts without a binding, and every act in a v1 room are refused on the generic path; nothing is recorded", async () => {
    const r = await declaredRoom(withAsk());
    const b = await bearer(r, "@agent", "agent", { kinds: ["renew"], acts: { claim: (await bindingIn(r, "claim"))!, ask: (await bindingIn(r, "ask"))! } });
    const claim = (await mcpTool(r, b.bearer, "claim", { goal: "g", scope: ["src/**"] })).structuredContent as Claim;
    const seq = await headSeq(r);
    const binding = (await bindingIn(r, "ask"))!;
    for (const kind of ["roster", "renew", "recover"]) {
      const out = await mcpTool(r, b.bearer, "act", { kind, target: { lane: claim.lane }, body: { lease: 1 }, binding, idempotencyKey: `p-${kind}` });
      expect(out.isError, kind).toBe(true);
      expect(out.structuredContent).toMatchObject({ name: "ArtroomError", code: "bad-request" });
    }
    for (const drop of ["binding", "idempotencyKey", "kind", "target", "body"]) {
      const args: Record<string, unknown> = { kind: "ask", target: { act: claim.id }, body: { text: "x" }, binding, idempotencyKey: "d1" };
      delete args[drop];
      const out = await mcpTool(r, b.bearer, "act", args);
      expect(out.isError, drop).toBe(true);
      expect(out.content[0]!.text).toContain(`input.${drop}: is required`);
    }
    expect(await headSeq(r)).toBe(seq);
    // The room itself refuses a bearer act that names a platform kind with a binding, whoever calls it.
    for (const kind of ["roster", "renew"]) {
      const direct = (await r.stub.bearerAct(b.bearer, { kind, target: null, body: {}, idempotencyKey: `q-${kind}`, binding })) as { error?: { code: string } };
      expect(direct.error?.code, kind).toBe("bad-request");
    }
    // A v1 room: the generic path takes nothing, not the legacy check either, and acts says to use the named tools.
    const v1 = await makeRoom();
    const bytes = randomBytes(32);
    const inv = await v1.admin.ok<RosterRecord>("roster", null, { op: "invite", member: "@old", role: "agent", custody: "room", expiresAt: iso(clock.now + day), secretHash: digestBytes(bytes), session: { kinds: ["claim", "note"], lanes: "*", ttlSeconds: 3600 } });
    const old = await call<{ bearer: string }>(v1.stub.redeem({ custody: "room", invitation: inv.id, secret: b64url(bytes) }, "x"));
    const head = await headSeq(v1);
    for (const kind of ["claim", "check", "note"]) {
      const out = await mcpTool(v1, old.bearer, "act", { kind, target: null, body: { goal: "g", scope: ["src/**"] }, binding, idempotencyKey: `v1-${kind}` });
      expect(out.isError, kind).toBe(true);
      expect(out.structuredContent).toMatchObject({ code: "bad-request" });
    }
    expect(await headSeq(v1)).toBe(head);
    const legacy = await mcpTool(v1, old.bearer, "acts", {});
    expect(legacy.structuredContent).toMatchObject({ vocabulary: "artroom-legacy-v1" });
    expect(text(legacy)).toContain("use the named tools");
    // The named tools still work there, as before.
    expect((await mcpTool(v1, old.bearer, "claim", { goal: "g", scope: ["src/**"] })).structuredContent).toMatchObject({ kind: "claim" });
  });

  it("a bearer act is never taken on POST /acts: that route admits only a signed envelope", async () => {
    const r = await declaredRoom(withAsk());
    const b = await bearer(r, "@agent", "agent", { kinds: [], acts: { ask: (await bindingIn(r, "ask"))! } });
    const c = await ok<Claim>(r, r.admin, "claim", null, { goal: "g", scope: ["src/**"] });
    const seq = await headSeq(r);
    const res = await exports.default.fetch(`${ORIGIN}/v1/rooms/${r.id}/acts`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${b.bearer}` },
      body: JSON.stringify({ kind: "ask", target: { act: c.id }, body: { text: "x" }, binding: await bindingIn(r, "ask"), idempotencyKey: "raw-1" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ name: "ArtroomError", code: "bad-request" });
    expect(await headSeq(r)).toBe(seq);
  });
});

describe.skipIf(DECLARED)("a declared check step under another name (fa120186: judge the check primitive, not the word check)", () => {
  const unit = { format: "artroom-checker-v2", act: "verify", volatile: false, timeoutSeconds: 60 };
  const VERIFY: ActDeclaration = { label: "Verify the build", targets: { version: ["check"] }, threads: ["claim", "room"], who: { roles: ["checker", "agent"] } };

  /** A v2 room whose check act is `verify`, with a proposal that owes the check to @ci or @dev. */
  async function checkRoom() {
    const doc = v2(
      (a) => {
        delete a["check"];
        a["verify"] = VERIFY;
      },
      policy(requireCheck("unit", { paths: "src/**", by: ["@ci", "@dev"], id: "unit-tests" })),
    );
    const r = await makeRoom({ policy: asPolicy(doc), files: { ".artroom/checkers/unit.json": JSON.stringify(unit) } });
    const verify = (await bindingIn(r, "verify"))!;
    const alice = await addMember(r, "@alice", "member");
    const c = await ok<Claim>(r, alice, "claim", null, { goal: "work", scope: ["src/**"] });
    const head = pushChange(r, c.lane, { "src/app.ts": "v2" });
    await ok<Proposal>(r, alice, "propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" });
    await tick(r);
    const body = await checkBody(r, c.lane);
    return { r, verify, alice, lane: c.lane, body };
  }

  async function checkBody(r: TestRoom, lane: Claim["lane"]) {
    const p = (await r.admin.read({ q: "proposal", ref: { lane, generation: 1 } }))!;
    if (p.preview.state !== "clean") throw new Error("preview not clean");
    const integration = p.preview.integration;
    const tree = r.world.artifacts.commits.get(integration)!.tree;
    return { obligation: "obl_unit-tests", check: "unit", integration, input: { kind: "tree", tree }, config: digestJson(unit), runner: `sha256:${"0".repeat(64)}`, volatile: false, ok: true, detail: "42 passed" };
  }

  const state = async (r: TestRoom, lane: Claim["lane"]) => (await r.admin.read({ q: "proposal", ref: { lane, generation: 1 } }))!.obligations[0]!.state;

  it("a bearer whose grant names verify meets the obligation through act; one without it, or with a stale binding, does not", async () => {
    const { r, verify, lane, body } = await checkRoom();
    const ci = await bearer(r, "@ci", "checker", { kinds: [], acts: { verify } });
    const other = await bearer(r, "@ci2", "checker", { kinds: [], acts: {} });
    const args = { kind: "verify", target: { lane, generation: 1 }, body, binding: verify, idempotencyKey: "v-1" };
    expect((await mcpTool(r, other.bearer, "act", args)).structuredContent).toMatchObject({ rule: "delegation-invalid" });
    expect((await mcpTool(r, ci.bearer, "act", { ...args, binding: `sha256:${"9".repeat(64)}`, idempotencyKey: "v-0" })).structuredContent).toMatchObject({ rule: "delegation-invalid" });
    expect(await state(r, lane)).toBe("open");
    const done = await mcpTool(r, ci.bearer, "act", args);
    expect(done.structuredContent).toMatchObject({ kind: "verify", ok: true, by: { via: "delegation", member: "@ci" } });
    expect(await state(r, lane)).toBe("met");
    // An exact retry returns the same record.
    expect((await mcpTool(r, ci.bearer, "act", args)).structuredContent).toEqual(done.structuredContent);
    // The exact job, integration, configuration and input binding still decide: a foreign integration is check-binding.
    const wrong = await mcpTool(r, ci.bearer, "act", { ...args, body: { ...body, integration: "1".repeat(40) }, idempotencyKey: "v-2" });
    expect(wrong.structuredContent).toMatchObject({ rule: "check-binding" });
  });

  it("the holder and proposer cannot meet their own check obligation through act; a role the declaration does not list cannot sign it", async () => {
    const doc = v2(
      (a) => {
        delete a["check"];
        a["verify"] = VERIFY;
      },
      policy(requireCheck("unit", { paths: "src/**", by: ["@ci", "@dev"], id: "unit-tests" })),
    );
    const r = await makeRoom({ policy: asPolicy(doc), files: { ".artroom/checkers/unit.json": JSON.stringify(unit) } });
    const verify = (await bindingIn(r, "verify"))!;
    const dev = await bearer(r, "@dev", "agent", { kinds: ["renew"], acts: { claim: (await bindingIn(r, "claim"))!, propose: (await bindingIn(r, "propose"))!, verify } });
    // @dev claims and proposes with the named tools, then tries to check its own proposal.
    const claim = (await mcpTool(r, dev.bearer, "claim", { goal: "work", scope: ["src/**"] })).structuredContent as Claim;
    const head = pushChange(r, claim.lane, { "src/app.ts": "v2" });
    expect((await mcpTool(r, dev.bearer, "propose", { lane: claim.lane, lease: 1, head, expectedGeneration: 0, summary: "s" })).structuredContent).toMatchObject({ kind: "propose" });
    await tick(r);
    const body = await checkBody(r, claim.lane);
    const own = await mcpTool(r, dev.bearer, "act", { kind: "verify", target: { lane: claim.lane, generation: 1 }, body, binding: verify, idempotencyKey: "own-1" });
    expect(own.structuredContent).toMatchObject({ refused: true, rule: "not-authorized-checker" });
    expect(await state(r, claim.lane)).toBe("open");
    // A member's own key over HTTPS: the declaration lists checker and agent, not member.
    const bob = await addMember(r, "@bob", "member");
    refusedAs(await (await httpClient(r, bob.keys)).act("verify", { lane: claim.lane, generation: 1 }, body as never, { binding: verify }), "role-forbids");
  });

  it("the HTTPS bearer client: its fixed check method stays forbidden; its generic act goes to the MCP endpoint; a key-signed check over HTTPS still works", async () => {
    const { r, verify, lane, body } = await checkRoom();
    const ci = await bearer(r, "@ci", "checker", { kinds: [], acts: { verify } });
    const net = workerFetch();
    const api = await bearerClient(r, ci, net.fetch);
    const sent = net.seen.length;
    // The legacy method: refused by the handle before anything is sent, as R-CRED-10 has it.
    const e = await thrown(api.check({ lane, generation: 1 }, body as never));
    expect(e.code).toBe("forbidden");
    expect((await thrown(api.roster({ op: "undelegate", delegation: ci.delegation }))).code).toBe("forbidden");
    expect(net.seen.length).toBe(sent);
    expect(await state(r, lane)).toBe("open");
    // The generic act: one call of the MCP tool, never POST /acts.
    const done = (await api.act("verify", { lane, generation: 1 }, body as never, { binding: verify, idempotencyKey: "http-1" })) as DeclaredRecord;
    expect(done).toMatchObject({ kind: "verify", by: { via: "delegation", member: "@ci" } });
    expect(posts(net.seen, "/mcp")).toBe(1);
    expect(posts(net.seen, "/acts")).toBe(0);
    expect(JSON.parse(net.seen.find((s) => s.path === "/mcp")!.body!).params).toMatchObject({ name: "act", arguments: { kind: "verify", binding: verify, idempotencyKey: "http-1" } });
    expect(await state(r, lane)).toBe("met");
    // A checker's own key over HTTPS, with the exact binding: available as before (R-OBL-3).
    const again = await checkRoom();
    const key = await addMember(again.r, "@ci", "checker");
    const signedCheck = (await (await httpClient(again.r, key.keys)).act("verify", { lane: again.lane, generation: 1 }, again.body as never, { binding: again.verify })) as DeclaredRecord;
    expect(signedCheck).toMatchObject({ kind: "verify", by: { via: "member", member: "@ci" } });
    expect(await state(again.r, again.lane)).toBe("met");
  });
});

describe.skipIf(DECLARED)("old records are read under the declarations of their own seq (R-DECL-23; fa120186)", () => {
  /**
   * One room's history: a v1 era, then `ask` declared, relabelled with no
   * change of meaning, retired, and declared again with another shape.
   */
  async function history() {
    const r = await makeRoom();
    const bob = await addMember(r, "@bob", "member");
    const legacy = await bob.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
    await activate(r, withAsk());
    const b1 = (await bindingIn(r, "ask"))!;
    const first = await signed(r, bob, "ask", { act: legacy.id }, { text: "first" });
    const x1 = expectOk(await call<DeclaredRecord | Refusal>(r.stub.submit(first)));
    await activate(r, withAsk({ ...ASK, label: "Question", help: "Ask anything." }));
    const x2 = (await ok(r, bob, "ask", { act: legacy.id }, { text: "second" })) as unknown as DeclaredRecord;
    await activate(r, v2());
    const gone = await signed(r, bob, "ask", { act: legacy.id }, { text: "third" }, { binding: b1 });
    await activate(r, withAsk({ ...ASK, label: "Ask again", body: { text: { type: "text", max: 50 }, topic: { type: "segment" } } }));
    const b4 = (await bindingIn(r, "ask"))!;
    const x4 = (await ok(r, bob, "ask", { act: legacy.id }, { text: "fourth", topic: "scope" })) as unknown as DeclaredRecord;
    const versions = (await log(r)).filter((e) => e.entry.type === "system" && e.entry.event.type === "policy-activated").map((e) => e.seq);
    return { r, bob, legacy, first, x1, x2, gone, x4, b1, b4, versions };
  }

  it("each seq has its own catalogue: the legacy era, the label in force, the retirement seq, and the later meaning of a reused name", async () => {
    const { r, legacy, x1, x2, x4, b1, b4, versions } = await history();
    const [v1, a1, a2, a3, a4] = versions as [number, number, number, number, number];
    const at = (seq: number) => r.admin.read({ q: "acts", at: seq }) as Promise<Catalogue>;
    expect(await at(legacy.seq)).toMatchObject({ vocabulary: "artroom-legacy-v1", since: v1, until: a1 });
    const c1 = (await at(x1.seq)) as ActsCatalogue;
    expect(c1).toMatchObject({ vocabulary: "declared", since: a1, until: a2 });
    expect(c1.acts["ask"]).toEqual({ declaration: ASK, binding: b1, retired: a3 });
    // A label and help edit: the same binding, the label of its own interval, the same retirement.
    const c2 = (await at(x2.seq)) as ActsCatalogue;
    expect(c2).toMatchObject({ since: a2, until: a3 });
    expect(c2.acts["ask"]).toMatchObject({ binding: b1, retired: a3, declaration: { label: "Question", help: "Ask anything." } });
    // The kinds that every later document still declares carry no retirement.
    expect(c1.acts["claim"]).not.toHaveProperty("retired");
    // The version that dropped it does not list it; the version that declares the name again gives it its new meaning.
    expect(Object.keys(((await at(a3)) as ActsCatalogue).acts)).not.toContain("ask");
    const c4 = (await at(x4.seq)) as ActsCatalogue;
    expect(c4).toMatchObject({ since: a4, until: null });
    expect(c4.acts["ask"]).toMatchObject({ binding: b4, declaration: { label: "Ask again" } });
    expect(c4.acts["ask"]).not.toHaveProperty("retired");
    expect(b4).not.toBe(b1);
    expect(await r.admin.read({ q: "acts", policy: c1.policy })).toEqual(c1);
    expect(await r.admin.read({ q: "acts" })).toEqual(c4);
  });

  it("explain gives each record the meaning of its own seq: the old label, the retirement, the legacy vocabulary; reuse of the name does not relabel it", async () => {
    const { r, legacy, x1, x2, x4, b1, b4, versions } = await history();
    const [, a1, , a3] = versions as [number, number, number, number, number];
    const meaning = async (id: string) => (await r.admin.read({ q: "explain", act: id as never }))!.meaning;
    expect(await meaning(x1.id)).toMatchObject({ vocabulary: "declared", kind: "ask", label: "Ask", binding: b1, retired: a3 });
    expect(await meaning(x2.id)).toMatchObject({ vocabulary: "declared", kind: "ask", label: "Question", binding: b1, retired: a3 });
    expect(await meaning(x4.id)).toMatchObject({ vocabulary: "declared", kind: "ask", label: "Ask again", binding: b4 });
    expect(await meaning(x4.id)).not.toHaveProperty("retired");
    expect(await meaning(legacy.id)).toEqual({ vocabulary: "artroom-legacy-v1", policy: expect.stringMatching(/^act_1_/), kind: "claim", label: "Claim", retired: a1 });
    // A platform kind is the platform's in every v2 interval.
    const k = newKeyPair();
    const grant = await ok<RosterRecord>(r, r.admin, "roster", null, { op: "delegate", to: k.key, kinds: ["renew"], acts: {}, lanes: "*", expiresAt: iso(clock.now + day) }, { binding: null });
    expect(await meaning(grant.id)).toMatchObject({ vocabulary: "platform", kind: "roster", label: "Roster" });
    // The same answer through the client's read and `meaningOf`, with one read per interval.
    const net = workerFetch();
    const api = await httpClient(r, r.admin.keys, { fetch: net.fetch });
    const viaClient = async (rec: { seq: number; kind: string }) => meaningOf((await api.actsAt({ seq: rec.seq }))!, rec.kind);
    expect(await viaClient(x1)).toEqual(await meaning(x1.id));
    expect(await viaClient(x1)).toEqual(await meaning(x1.id));
    expect(await viaClient(legacy)).toEqual(await meaning(legacy.id));
    expect(await viaClient(x4)).toEqual(await meaning(x4.id));
    // Two ended versions were read once each and kept; the active one is read each time it is asked for.
    expect(gets(net.seen, "/declarations")).toBe(3);
  });

  it("an exact retry of an old act returns its record after the kind was retired and reused; a new act of the old meaning does not", async () => {
    const { r, first, gone, x1, b4 } = await history();
    expect(await call(r.stub.submit(first))).toEqual(x1);
    // Prepared under the first meaning, never admitted, sent after the name was declared again: stale, naming the new binding.
    const seq = await headSeq(r);
    expect(await call<Refusal>(r.stub.submit(gone))).toMatchObject({ refused: true, rule: "binding-stale", current: { binding: b4 } });
    expect(await headSeq(r)).toBe(seq);
  });

  it("while a kind is retired a new act of it is kind-undeclared, and its old records still explain as they were", async () => {
    const r = await declaredRoom(withAsk());
    const bob = await addMember(r, "@bob", "member");
    const c = await ok<Claim>(r, bob, "claim", null, { goal: "g", scope: ["src/**"] });
    const x = (await ok(r, bob, "ask", { act: c.id }, { text: "q" })) as unknown as DeclaredRecord;
    const b = (await bindingIn(r, "ask"))!;
    await activate(r, v2());
    const api = await httpClient(r, bob.keys);
    refusedAs(await api.act("ask", { act: c.id }, { text: "q" }, { binding: b }), "kind-undeclared");
    const e = (await api.explain(x.id as never))!;
    expect(e.kind).toBe("ask");
    expect(e.meaning).toMatchObject({ label: "Ask", binding: b, retired: (await r.admin.read({ q: "acts" }))!.since });
    // The active catalogue no longer lists it: current declarations are for new acts, not for reading old records.
    expect(Object.keys(((await api.acts()) as ActsCatalogue).acts)).not.toContain("ask");
  });

  it("the MCP tools read old records the same way: explain names the label of the record's seq and its retirement; acts takes at", async () => {
    const { r, x1, legacy, b1, versions } = await history();
    const [, , , a3] = versions as [number, number, number, number, number];
    const b = await bearer(r, "@agent", "agent", { kinds: [], acts: {} });
    const why = await mcpTool(r, b.bearer, "explain", { act: x1.id });
    expect(why.structuredContent.meaning).toMatchObject({ label: "Ask", binding: b1, retired: a3 });
    expect(why.content[0]!.text.split("\n")[0]).toBe(`${x1.id}: Ask (ask), retired at seq ${a3}, accepted.`);
    const old = await mcpTool(r, b.bearer, "explain", { act: legacy.id });
    expect(old.content[0]!.text.split("\n")[0]).toMatch(/: Claim \(claim\), retired at seq \d+, accepted\.$/);
    const then = await mcpTool(r, b.bearer, "acts", { at: x1.seq });
    expect(then.structuredContent.acts.ask).toMatchObject({ binding: b1, retired: a3 });
    expect(then.content[0]!.text.split("\n")[0]).toContain(`ask (Ask, retired at seq ${a3})`);
    expect((await mcpTool(r, b.bearer, "acts", { at: 0 })).structuredContent).toEqual({ outcome: "not-found" });
    const both = await mcpTool(r, b.bearer, "acts", { at: 1, policy: then.structuredContent.policy });
    expect(both.isError).toBe(true);
  });
});
