/**
 * Declared acts stage 5 (request a5d64b35; the planner's clarification
 * fa120186; docs/protocol.md section 33.10): the generic act, the
 * declarations read and the reading of old records, through the real client
 * package over HTTPS and the real MCP endpoint, against this Worker.
 *
 * Each package tests its own half against a double. These tests are the
 * places where the two halves must agree: the binding the client signs and
 * the one the Room computes, the grant the client expands and the one the
 * Room admits, the catalogue the Room serves and what the client and the MCP
 * tools make of it.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { exports } from "cloudflare:workers";
import type { ActDeclaration, ActsCatalogue, AnyEnvelope, Catalogue, Claim, DeclaredRecord, Lane, LegacyCatalogue, LogEntry, Proposal, Refusal, RosterRecord } from "@generalbusiness/artroom-contract";
import { envelopeOf, isArtroomError, isRefusal } from "@generalbusiness/artroom-contract";
import { delegateOp, meaningOf, threadTitle } from "@generalbusiness/artroom-client";
import { CODE_REVIEW_ACTS, bindingOf, policy, requireCheck } from "@generalbusiness/artroom-policy";
import { digestJson } from "../../src/crypto.ts";
import { activate, bearer, bindingIn, declaredRoom, delegateOp as grantOp, headSeq, ok, signed, v2 } from "./declared-support.ts";
import { ASK, ORIGIN, asPolicy, httpClient, mcpTool, workerFetch } from "./declared-stage5-support.ts";
import { addMember, call, clock, day, expectOk, iso, makeRoom, newKeyPair, pushChange, tick, type TestRoom } from "./support.ts";

const withAsk = (ask: ActDeclaration = ASK) => v2((a) => void (a["ask"] = ask));
/** A change of the meaning of `ask`: its binding changes. */
const SHORTER: ActDeclaration = { ...ASK, body: { text: { type: "text", max: 50 } } };
const refusedAs = (out: unknown, rule: string): Refusal => {
  if (!isRefusal(out)) return expect.fail(`expected a ${rule} refusal, got ${JSON.stringify(out).slice(0, 200)}`);
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
  return expect.fail("expected a thrown ArtroomError");
};
const log = async (r: TestRoom): Promise<LogEntry[]> => [...(await r.admin.read({ q: "log", req: { limit: 500 } })).acts];
const activations = async (r: TestRoom) => (await log(r)).filter((e) => e.entry.type === "system" && e.entry.event.type === "policy-activated").map((e) => e.seq);
const envelopeAt = async (r: TestRoom, seq: number) => {
  const e = (await log(r)).find((x) => x.seq === seq)!;
  if (e.entry.type === "system") throw new Error("a system entry");
  return e.entry.act.envelope as unknown as AnyEnvelope;
};
const posts = (seen: readonly { method: string; path: string }[], path: string) => seen.filter((s) => s.method === "POST" && s.path === path).length;
const gets = (seen: readonly { method: string; path: string }[], path: string) => seen.filter((s) => s.method === "GET" && s.path === path).length;
const get = (r: TestRoom, path: string, token?: string) => exports.default.fetch(`${ORIGIN}/v1/rooms/${r.id}/${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
const firstLine = (res: { content: { text: string }[] }) => res.content[0]!.text.split("\n")[0]!;

describe("the declarations read (R-API-3, R-API-9 as amended)", () => {
  it("a v1 room answers with the legacy catalogue, over RPC, HTTPS and the client; a v2 room lists each declared kind with its declaration and binding; at and policy select a retained version", async () => {
    const old = await makeRoom();
    const legacy = (await old.admin.read({ q: "acts" })) as LegacyCatalogue;
    expect(legacy).toEqual({ vocabulary: "artroom-legacy-v1", policy: legacy.policy, since: 1, until: null });
    expect(await (await httpClient(old, old.admin.keys)).acts()).toEqual(legacy);
    const res = await get(old, "declarations", await old.admin.session());
    expect([res.status, await res.json()]).toEqual([200, legacy]);
    // A read needs a session or bearer token, as every read does.
    expect((await get(old, "declarations")).status).toBe(401);

    const doc = withAsk();
    const r = await declaredRoom(doc);
    const c = (await r.admin.read({ q: "acts" })) as ActsCatalogue;
    expect(c).toMatchObject({ vocabulary: "declared", since: 1, until: null, steps: "artroom-steps-v1", lanes: doc.lanes });
    // Platform kinds are not declared, so they are not listed.
    expect(Object.keys(c.acts).sort()).toEqual([...Object.keys(CODE_REVIEW_ACTS), "ask"].sort());
    for (const kind of Object.keys(c.acts)) expect(c.acts[kind], kind).toEqual({ declaration: doc.acts[kind], binding: await bindingOf(doc, kind) });
    for (const q of [{ at: 1 }, { at: 500 }, { policy: c.policy }]) expect(await r.admin.read({ q: "acts", ...q }), JSON.stringify(q)).toEqual(c);
    expect(await r.admin.read({ q: "acts", at: 0 })).toBeNull();
    expect(await r.admin.read({ q: "acts", policy: "act_999_00000000" })).toBeNull();
    const token = await r.admin.session();
    const status = async (query: string) => (await get(r, `declarations?${query}`, token)).status;
    expect([await status("at=0"), await status(`policy=${c.policy}`), await status(`at=1&policy=${c.policy}`), await status("policy=latest"), await status("at=-1"), await status("at=1.5")]).toEqual([404, 200, 400, 400, 400, 400]);
  });
});

describe("a declared act the client has no method for, over HTTPS (R-DECL-16, 33.5 Generic act)", () => {
  it("the client signs v: 2 with the binding the caller read, and never another: after a change of meaning the act is binding-stale and nothing more is sent; a replay of the prepared act gets its record", async () => {
    const r = await declaredRoom(withAsk());
    const bob = await addMember(r, "@bob", "member");
    const c = await ok<Claim>(r, bob, "claim", null, { goal: "g", scope: ["src/**"] });
    const net = workerFetch();
    const api = await httpClient(r, bob.keys, { fetch: net.fetch });
    const { binding } = ((await api.acts()) as ActsCatalogue).acts["ask"]!;
    let kept: Parameters<typeof api.replay>[0] | undefined;
    const out = (await api.act("ask", { act: c.id }, { text: "Why this scope?", urgency: "high" }, { binding, idempotencyKey: "ask-once", onPrepared: (p) => void (kept = p) })) as DeclaredRecord;
    expect(out).toMatchObject({ kind: "ask", text: "Why this scope?", by: { via: "member", member: "@bob", key: bob.key } });
    // The signed envelope in the log is exactly what the caller asked for, with that binding.
    expect(await envelopeAt(r, out.seq)).toMatchObject({ v: 2, kind: "ask", binding, target: { act: c.id }, body: { text: "Why this scope?", urgency: "high" }, actor: bob.key });
    // The handle read the catalogue once, when the caller asked, and not again to act.
    expect([posts(net.seen, "/acts"), gets(net.seen, "/declarations")]).toEqual([1, 1]);
    // What the room refuses is not recorded: an undeclared kind, a body or a target the declaration does not allow.
    const seq = await headSeq(r);
    refusedAs(await api.act("shout", { act: c.id }, { text: "x" }, { binding }), "kind-undeclared");
    expect(refusedAs(await api.act("ask", { act: c.id }, { text: "x", colour: "red" }, { binding }), "invalid-body").reason).toContain("colour");
    expect((await thrown(api.act("ask", { lane: c.lane }, { text: "x" }, { binding }))).code).toBe("bad-request");
    expect(await headSeq(r)).toBe(seq);
    // The meaning changes. The act prepared under the old one is refused with the active binding and policy.
    await activate(r, withAsk(SHORTER));
    const after = await headSeq(r);
    const sent = posts(net.seen, "/acts");
    const stale = refusedAs(await api.act("ask", { act: c.id }, { text: "still?" }, { binding }), "binding-stale");
    const active = (await r.admin.read({ q: "acts" })) as ActsCatalogue;
    expect(stale.current).toEqual({ binding: active.acts["ask"]!.binding, policy: active.policy });
    expect(stale.current!.binding).not.toBe(binding);
    // One submission; no read and no second signature on the caller's behalf.
    expect([posts(net.seen, "/acts"), gets(net.seen, "/declarations")]).toEqual([sent + 1, 1]);
    // The prepared act carries the binding it was signed under. Sent again as it is, it gets the original record (R-IDEM-2).
    expect(kept).toMatchObject({ kind: "ask", binding, idempotencyKey: "ask-once" });
    expect(await api.replay(kept!)).toEqual(out);
    expect((await log(r)).filter((e) => e.entry.type === "act" && (e.entry.act.envelope.kind as string) === "ask")).toHaveLength(1);
    expect(await headSeq(r)).toBe(after);
  });
});

describe("the named methods and the legacy vocabulary (R-API-9 as amended; request conditions 1 and 3)", () => {
  it("the named methods sign v: 1 in a v1 room, and v: 2 with the code-review binding in a v2 room; renew stays v: 1; a handle open while the room moves to v2 reads the catalogue again", async () => {
    const r = await makeRoom();
    const net = workerFetch();
    const api = await httpClient(r, r.admin.keys, { fetch: net.fetch });
    const c1 = expectOk(await api.claim({ goal: "a", scope: ["src/**"] }));
    expect(await envelopeAt(r, c1.seq)).toMatchObject({ v: 1, kind: "claim" });
    expect(await envelopeAt(r, c1.seq)).not.toHaveProperty("binding");
    // The generic act is not for a v1 room: bad-request, and nothing recorded.
    const seq = await headSeq(r);
    expect((await thrown(api.act("claim", null, { goal: "g", scope: ["docs/**"] }, { binding: `sha256:${"a".repeat(64)}` }))).code).toBe("bad-request");
    expect(await headSeq(r)).toBe(seq);
    await activate(r, v2());
    // The handle still holds the v1 vocabulary: its v: 1 claim is refused, unrecorded, and it forgets what it read.
    refusedAs(await api.claim({ goal: "b", scope: ["docs/**"] }), "binding-stale");
    const c2 = expectOk(await api.claim({ goal: "b", scope: ["docs/**"] }));
    expect(await envelopeAt(r, c2.seq)).toMatchObject({ v: 2, kind: "claim", binding: await bindingIn(r, "claim") });
    expect(await envelopeAt(r, expectOk(await api.renew(c2)).seq)).toMatchObject({ v: 1, kind: "renew" });
    const head = pushChange(r, c2.lane, { "docs/a.md": "v2" });
    const proposal = expectOk(await api.propose(c2, { head, expectedGeneration: 0, summary: "s" })) as Proposal;
    expect(await envelopeAt(r, proposal.seq)).toMatchObject({ v: 2, kind: "propose", binding: await bindingIn(r, "propose") });
    expect(await envelopeAt(r, expectOk(await api.release(c2)).seq)).toMatchObject({ v: 2, kind: "release", binding: await bindingIn(r, "release") });
    // One read of the catalogue for each vocabulary served every named act.
    expect(gets(net.seen, "/declarations")).toBe(2);
  });

});

describe("grants (R-DECL-17; request condition 2)", () => {
  it("the client expands a grant before it is signed: * names every kind the role may grant, with the active bindings, and the room admits it; a kind added later is not covered", async () => {
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
    await activate(r, v2((a) => void ((a["ask"] = ASK), (a["shout"] = { ...ASK, label: "Shout" }))));
    const c = await ok<Claim>(r, bob, "claim", null, { goal: "g", scope: ["src/**"] });
    const under = await httpClient(r, k, { delegation: grant.id });
    expect(((await under.act("ask", { act: c.id }, { text: "x" }, { binding: (await bindingIn(r, "ask"))! })) as DeclaredRecord).by).toMatchObject({ via: "delegation", member: "@bob", delegation: grant.id });
    expect(refusedAs(await under.act("shout", { act: c.id }, { text: "x" }, { binding: (await bindingIn(r, "shout"))! }), "delegation-invalid").reason).toContain("does not cover shout");
  });
});

describe("the generic act over the MCP endpoint (R-CRED-10 and R-API-9 as fa120186 amends them)", () => {
  it("a bearer reads the declarations with acts, and performs a kind that has no named tool with act, signed under its delegation; a retry is the original record; a stale binding is never replaced", async () => {
    const r = await declaredRoom(withAsk());
    const b = await bearer(r, "@agent", "agent", { kinds: ["renew"], acts: { claim: (await bindingIn(r, "claim"))!, ask: (await bindingIn(r, "ask"))! } });
    const list = await mcpTool(r, b.bearer, "acts", {});
    expect(list.isError).toBe(false);
    expect(list.structuredContent).toEqual(await r.admin.read({ q: "acts" }));
    expect(firstLine(list)).toContain("ask (Ask)");
    const claim = (await mcpTool(r, b.bearer, "claim", { goal: "g", scope: ["src/**"], idempotencyKey: "claim-1" })).structuredContent as Claim;
    const binding = list.structuredContent.acts.ask.binding as string;
    const args = { kind: "ask", target: { act: claim.id }, body: { text: "Which part?" }, binding, idempotencyKey: "ask-1" };
    const done = await mcpTool(r, b.bearer, "act", args);
    expect(done.isError).toBe(false);
    expect(done.structuredContent).toMatchObject({ kind: "ask", text: "Which part?", by: { via: "delegation", member: "@agent", delegation: b.delegation } });
    expect(await envelopeAt(r, done.structuredContent.seq)).toMatchObject({ v: 2, kind: "ask", binding, delegation: b.delegation });
    // The generic path takes no platform kind and no act without a binding or a key; nothing is recorded.
    const seq = await headSeq(r);
    for (const kind of ["roster", "renew", "recover"]) expect((await mcpTool(r, b.bearer, "act", { kind, target: { lane: claim.lane }, body: { lease: 1 }, binding, idempotencyKey: `p-${kind}` })).structuredContent, kind).toMatchObject({ name: "ArtroomError", code: "bad-request" });
    for (const drop of ["binding", "idempotencyKey"]) {
      const { [drop]: _dropped, ...rest } = args as Record<string, unknown>;
      void _dropped;
      const out = await mcpTool(r, b.bearer, "act", rest);
      expect(out.isError, drop).toBe(true);
      expect(out.content[0]!.text).toContain(`input.${drop}: is required`);
    }
    // Nor is a bearer act taken on POST /acts: that route admits only a signed envelope.
    const raw = await exports.default.fetch(`${ORIGIN}/v1/rooms/${r.id}/acts`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${b.bearer}` }, body: JSON.stringify({ ...args, idempotencyKey: "raw-1" }) });
    expect([raw.status, await raw.json()]).toMatchObject([400, { name: "ArtroomError", code: "bad-request" }]);
    expect(await headSeq(r)).toBe(seq);
    // An exact retry is the original record, also after the kind's meaning has changed.
    await activate(r, withAsk(SHORTER));
    const after = await headSeq(r);
    expect((await mcpTool(r, b.bearer, "act", args)).structuredContent).toEqual(done.structuredContent);
    // A new act under the binding the agent read is binding-stale, and the tool's text says what the active meaning is.
    const stale = await mcpTool(r, b.bearer, "act", { ...args, idempotencyKey: "ask-2" });
    expect(stale.structuredContent).toMatchObject({ refused: true, rule: "binding-stale", current: { binding: await bindingIn(r, "ask") } });
    expect(firstLine(stale)).toContain(`The active binding is ${await bindingIn(r, "ask")}`);
    expect(firstLine(stale)).toContain("Nothing was done.");
    // With the active binding the act is not stale, and the grant, made for the earlier meaning, does not cover it.
    expect((await mcpTool(r, b.bearer, "act", { ...args, binding: await bindingIn(r, "ask"), idempotencyKey: "ask-3" })).structuredContent).toMatchObject({ rule: "delegation-invalid", reason: "The delegation was granted for an earlier meaning of ask." });
    expect(await headSeq(r)).toBe(after);
  });

});

describe("a declared check step under another name (fa120186: judge the check primitive, not the word check)", () => {
  it("a bearer whose grant names verify meets the obligation through act; one without it, or with a stale binding, does not; the proposer cannot check its own version; the job, integration and input binding still decide", async () => {
    const unit = { format: "artroom-checker-v2", act: "verify", volatile: false, timeoutSeconds: 60 };
    const doc = v2(
      (a) => {
        delete a["check"];
        a["verify"] = { label: "Verify the build", targets: { version: ["check"] }, threads: ["claim", "room"], who: { roles: ["checker", "agent"] } };
      },
      policy(requireCheck("unit", { paths: "src/**", by: ["@ci", "@dev"], id: "unit-tests" })),
    );
    const r = await makeRoom({ policy: asPolicy(doc), files: { ".artroom/checkers/unit.json": JSON.stringify(unit) } });
    const verify = (await bindingIn(r, "verify"))!;
    const dev = await bearer(r, "@dev", "agent", { kinds: ["renew"], acts: { claim: (await bindingIn(r, "claim"))!, propose: (await bindingIn(r, "propose"))!, verify } });
    const ci = await bearer(r, "@ci", "checker", { kinds: [], acts: { verify } });
    const other = await bearer(r, "@ci2", "checker", { kinds: [], acts: {} });
    // @dev claims and proposes with the named tools.
    const claim = (await mcpTool(r, dev.bearer, "claim", { goal: "work", scope: ["src/**"], idempotencyKey: "claim-1" })).structuredContent as Claim;
    const head = pushChange(r, claim.lane, { "src/app.ts": "v2" });
    expect((await mcpTool(r, dev.bearer, "propose", { lane: claim.lane, lease: 1, head, expectedGeneration: 0, summary: "s", idempotencyKey: "propose-1" })).structuredContent).toMatchObject({ kind: "propose" });
    await tick(r);
    const p = (await r.admin.read({ q: "proposal", ref: { lane: claim.lane, generation: 1 } }))!;
    if (p.preview.state !== "clean") throw new Error("preview not clean");
    const integration = p.preview.integration;
    const body = { obligation: "obl_unit-tests", check: "unit", integration, input: { kind: "tree", tree: r.world.artifacts.commits.get(integration)!.tree }, config: digestJson(unit), runner: `sha256:${"0".repeat(64)}`, volatile: false, ok: true, detail: "42 passed" };
    const state = async () => (await r.admin.read({ q: "proposal", ref: { lane: claim.lane, generation: 1 } }))!.obligations[0]!.state;
    const args = { kind: "verify", target: { lane: claim.lane, generation: 1 }, body, binding: verify, idempotencyKey: "v-1" };
    expect((await mcpTool(r, dev.bearer, "act", { ...args, idempotencyKey: "own-1" })).structuredContent).toMatchObject({ refused: true, rule: "not-authorized-checker" });
    expect((await mcpTool(r, other.bearer, "act", args)).structuredContent).toMatchObject({ rule: "delegation-invalid" });
    // A binding the grant does not name for verify: the grant covers the kind only under the binding it was signed with.
    expect((await mcpTool(r, ci.bearer, "act", { ...args, binding: `sha256:${"9".repeat(64)}`, idempotencyKey: "v-0" })).structuredContent).toMatchObject({ rule: "delegation-invalid" });
    expect((await mcpTool(r, ci.bearer, "act", { ...args, body: { ...body, integration: "1".repeat(40) }, idempotencyKey: "v-2" })).structuredContent).toMatchObject({ rule: "check-binding" });
    expect(await state()).toBe("open");
    expect((await mcpTool(r, ci.bearer, "act", args)).structuredContent).toMatchObject({ kind: "verify", ok: true, by: { via: "delegation", member: "@ci" } });
    expect(await state()).toBe("met");
    // A member's own key over HTTPS: the declaration lists checker and agent, not member.
    const bob = await addMember(r, "@bob", "member");
    refusedAs(await (await httpClient(r, bob.keys)).act("verify", { lane: claim.lane, generation: 1 }, body as never, { binding: verify }), "role-forbids");
  });
});

describe("old records are read under the declarations of their own seq (R-DECL-23; fa120186)", () => {
  /**
   * One room's history, read by every test of this group and changed by none: a v1 era, then `ask` declared,
   * relabelled with no change of meaning, retired, declared again with another shape, and retired again.
   */
  let h: Awaited<ReturnType<typeof history>>;
  async function history() {
    const r = await makeRoom();
    const bob = await addMember(r, "@bob", "member");
    const legacy = await bob.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
    await activate(r, withAsk());
    const b1 = (await bindingIn(r, "ask"))!;
    const first = await signed(r, bob, "ask", { act: legacy.id }, { text: "first" });
    const x1 = expectOk(await call<DeclaredRecord | Refusal>(r.stub.submit(first)));
    const grant = await ok<RosterRecord>(r, r.admin, "roster", null, grantOp(newKeyPair().key, {}, ["renew"]), { binding: null });
    await activate(r, withAsk({ ...ASK, label: "Question", help: "Ask anything." }));
    const x2 = (await ok(r, bob, "ask", { act: legacy.id }, { text: "second" })) as unknown as DeclaredRecord;
    await activate(r, v2());
    const gone = await signed(r, bob, "ask", { act: legacy.id }, { text: "third" }, { binding: b1 });
    await activate(r, withAsk({ ...ASK, label: "Ask again", body: { text: { type: "text", max: 50 }, topic: { type: "segment" } } }));
    const b4 = (await bindingIn(r, "ask"))!;
    const x4 = (await ok(r, bob, "ask", { act: legacy.id }, { text: "fourth", topic: "scope" })) as unknown as DeclaredRecord;
    const stale = await call<Refusal>(r.stub.submit(gone));
    await activate(r, v2());
    const [v1, a1, a2, a3, a4, a5] = (await activations(r)) as [number, number, number, number, number, number];
    return { r, bob, legacy, first, grant, x1, x2, x4, stale, b1, b4, v1, a1, a2, a3, a4, a5 };
  }
  beforeAll(async () => void (h = await history()));

  it("each seq has its own catalogue: the legacy era, the label in force, the first later version that dropped the kind, and the later meaning of a reused name; an exact retry of an old act returns its record", async () => {
    const { r, bob, legacy, first, x1, x2, x4, stale, b1, b4, v1, a1, a2, a3, a4, a5 } = h;
    const at = (seq: number) => r.admin.read({ q: "acts", at: seq }) as Promise<Catalogue>;
    expect(await at(legacy.seq)).toMatchObject({ vocabulary: "artroom-legacy-v1", since: v1, until: a1 });
    const c1 = (await at(x1.seq)) as ActsCatalogue;
    expect(c1).toMatchObject({ vocabulary: "declared", since: a1, until: a2 });
    expect(c1.acts["ask"]).toEqual({ declaration: ASK, binding: b1, retired: a3 });
    // A label and help edit: the same binding, the label of its own interval, the same retirement.
    const c2 = (await at(x2.seq)) as ActsCatalogue;
    expect(c2).toMatchObject({ since: a2, until: a3 });
    expect(c2.acts["ask"]).toMatchObject({ binding: b1, retired: a3, declaration: { label: "Question", help: "Ask anything." } });
    // The version that dropped it does not list it. The version that declares the name again gives it its new meaning,
    // and its own retirement: the second drop does not move the first.
    expect(Object.keys(((await at(a3)) as ActsCatalogue).acts)).not.toContain("ask");
    const c4 = (await at(x4.seq)) as ActsCatalogue;
    expect(c4).toMatchObject({ since: a4, until: a5 });
    expect(c4.acts["ask"]).toMatchObject({ binding: b4, retired: a5, declaration: { label: "Ask again" } });
    expect(b4).not.toBe(b1);
    // A kind every later version declares has no mark, in any version.
    for (const c of [c1, c2, c4]) expect(c.acts["claim"]).not.toHaveProperty("retired");
    expect(await r.admin.read({ q: "acts", policy: c1.policy })).toEqual(c1);
    // Retry and staleness follow the bytes, not the name: the first ask still gets its record; an act prepared under
    // the first meaning and sent while the name meant something else was stale, naming that binding; now it is undeclared.
    const seq = await headSeq(r);
    expect(await call(r.stub.submit(first))).toEqual(x1);
    expect(stale).toMatchObject({ refused: true, rule: "binding-stale", current: { binding: b4 } });
    refusedAs(await (await httpClient(r, bob.keys)).act("ask", { act: legacy.id }, { text: "q" }, { binding: b4 }), "kind-undeclared");
    expect(await headSeq(r)).toBe(seq);
  });

  it("explain gives each record the meaning of its own seq, and the client reads it the same way: the old label, the retirement, the legacy vocabulary", async () => {
    const { r, legacy, grant, x1, x2, x4, b1, b4, a1, a3, a5 } = h;
    const meaning = async (id: string) => (await r.admin.read({ q: "explain", act: id as never }))!.meaning;
    expect(await meaning(x1.id)).toMatchObject({ vocabulary: "declared", kind: "ask", label: "Ask", binding: b1, retired: a3 });
    expect(await meaning(x2.id)).toMatchObject({ vocabulary: "declared", kind: "ask", label: "Question", binding: b1, retired: a3 });
    expect(await meaning(x4.id)).toMatchObject({ vocabulary: "declared", kind: "ask", label: "Ask again", binding: b4, retired: a5 });
    expect(await meaning(legacy.id)).toEqual({ vocabulary: "artroom-legacy-v1", policy: expect.stringMatching(/^act_1_/), kind: "claim", label: "Claim", retired: a1 });
    // A platform kind is the platform's.
    expect(await meaning(grant.id)).toMatchObject({ vocabulary: "platform", kind: "roster", label: "Roster" });
    // The client reads the catalogue of a record's seq over HTTPS and gives the same answer.
    const api = await httpClient(r, r.admin.keys);
    for (const rec of [x1, legacy, x4]) expect(meaningOf((await api.actsAt({ seq: rec.seq }))!, rec.kind)).toEqual(await meaning(rec.id));
  });
});

describe("a thread's kind and what readers call it (R-DECL-6, R-DECL-8, R-DECL-23; section 33.10)", () => {
  /** A kind of the room's own that opens a thread and takes no goal: the thread is named by this act. */
  const SONG: ActDeclaration = {
    label: "Start a song",
    targets: { none: ["open"] },
    body: { title: { type: "text", max: 80 }, key: { type: "text", max: 8, optional: true }, year: { type: "text", max: 4, optional: true } },
    who: { roles: ["member", "agent"] },
    hold: { scope: "body.scope", workspace: true },
  };
  /** The code-review acts, `start-song`, and a `leave` that releases a song thread and no other. */
  const withSong = (song: ActDeclaration = SONG) =>
    v2((a) => {
      a["start-song"] = song;
      a["leave"] = { label: "Leave", targets: { thread: ["release"] }, threads: ["start-song"], who: { roles: ["member", "agent"] } };
    });

  it("the lane reads give each thread's kind, and a reader can tell which acts act on it; a thread with no goal is named by its opening act, in the words in force when it opened", async () => {
    const r = await declaredRoom(withSong());
    const bob = await addMember(r, "@bob", "member");
    const api = await httpClient(r, bob.keys);
    const c = (await api.acts()) as ActsCatalogue;
    const binding = c.acts["start-song"]!.binding;
    const claim = expectOk(await api.claim({ goal: "Rate-limit login", scope: ["src/**"] }));
    const song = (await api.act("start-song", null, { year: "1963", scope: ["songs/blue-bossa/**"], title: "Blue Bossa" }, { binding })) as DeclaredRecord;
    expect(song).toMatchObject({ kind: "start-song", effect: { type: "opened" } });
    const lanes = new Map((await api.lanes()).items.map((l) => [l.lane, l]));
    expect(lanes.get(claim.lane)).toMatchObject({ kind: "claim", goal: "Rate-limit login" });
    expect(lanes.get(song.id)).toMatchObject({ kind: "start-song", goal: "" });
    expect(await api.lane(song.id)).toEqual(lanes.get(song.id));
    // The declared acts that may act on a thread are those whose `threads` name its kind (R-DECL-8), and the room agrees.
    const actsOn = (lane: Lane) => Object.keys(c.acts).filter((k) => c.acts[k]!.declaration.threads?.includes(lane.kind!)).sort();
    expect(actsOn(lanes.get(song.id)!)).toEqual(["leave"]);
    expect(actsOn(lanes.get(claim.lane)!)).toEqual(["check", "claim", "land", "note", "propose", "release", "review"]);
    refusedAs(await api.act("release", { lane: song.id }, { lease: 1 }, { binding: c.acts["release"]!.binding }), "wrong-thread");
    // The label changes. The binding does not, and the thread keeps the name it opened with.
    await activate(r, withSong({ ...SONG, label: "Begin a tune" }));
    expect(await bindingIn(r, "start-song")).toBe(binding);
    const title = async (id: string) => {
      const lane = (await api.lane(id as never))!;
      const opening = (await api.explain(lane.lane))!;
      return threadTitle(lane, { meaning: opening.meaning!, body: envelopeOf(opening.entry)!.body });
    };
    expect(await title(song.id)).toBe("Start a song: Blue Bossa");
    expect(await title(claim.lane)).toBe("Rate-limit login");
    // A thread opened after the change is named in the new words. "First" is by name: the room records a body with
    // its keys sorted, whatever order the caller typed.
    const keyed = (await api.act("start-song", null, { title: "So What", key: "d", scope: ["songs/so-what/**"] }, { binding })) as DeclaredRecord;
    expect(await title(keyed.id)).toBe("Begin a tune: d");
    expect(await api.act("leave", { lane: song.id }, { lease: 1 }, { binding: c.acts["leave"]!.binding })).toMatchObject({ kind: "leave" });
    expect(await api.lane(song.id)).toMatchObject({ kind: "start-song", state: "unheld" });
  });
});
