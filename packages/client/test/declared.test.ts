/**
 * Declared acts in the client (docs/protocol.md R-DECL-16, R-DECL-17,
 * R-API-9 as amended): the generic act signs exactly the binding the caller
 * read, the named methods sign the binding they were built for, a bearer's
 * call carries the binding unchanged, and a grant is expanded before it is
 * signed. The fake room runs in its declared mode. The real Room is tested
 * with this client in packages/room/test/workerd.
 *
 * The declared envelope's bytes are in signing.test.ts, the prepared act
 * and its retry in prepared.test.ts, and the catalogue reads in
 * catalogue.test.ts.
 */

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { envelopeOf, type ActDeclaration, type ActsCatalogue, type Binding, type Claim, type DeclaredRecord, type RoomWire } from "@generalbusiness/artroom-contract";
import { CODE_REVIEW_ACTS, bindingOf } from "@generalbusiness/artroom-policy/declared";
import { builtForBinding, connect, delegateOp, expandGrant, generateSigner, invitationSession, isRefusal, redeem } from "../src/index.ts";
import { FakeRoom } from "./support/fake-room.ts";
import { caught, joinAs, startRoom, type Url } from "./support/setup.ts";

let room: FakeRoom;
let url: Url;
beforeEach(async () => {
  ({ room, url } = await startRoom());
});
afterEach(() => room.stop());

const ASK: ActDeclaration = { label: "Ask", targets: { entry: ["comment"] }, body: { text: { type: "text", max: 200 } }, who: { roles: ["member", "agent"] } };
const withAsk = (ask: ActDeclaration = ASK) => ({ ...CODE_REVIEW_ACTS, ask });
const B = (c: string) => `sha256:${c.repeat(64)}` as Binding;
const posts = (route: string) => room.requests.filter((r) => r.method === "POST" && r.route === route).length;
const gets = (route: string) => room.requests.filter((r) => r.method === "GET" && r.route === route).length;
const service = () => ({ room: async (): Promise<RoomWire> => room.wire() });
const lastEnvelope = () => {
  const e = room.entries.at(-1)!.entry;
  if (e.type === "system") throw new Error("a system entry");
  return e.act.envelope as unknown as Record<string, unknown>;
};

describe("the generic act (R-DECL-16)", () => {
  test("over HTTPS with a key: signed v: 2 with the caller's binding; over RPC the same; the catalogue is not read to act", async () => {
    const alice = await joinAs(room, "@alice");
    await room.activate(withAsk());
    const claim = (await alice.api.claim({ goal: "g", scope: ["src/**"] })) as Claim;
    const binding = (await room.bindingOf("ask"))!;
    const reads = gets("/declarations");
    const out = (await alice.api.act("ask", { act: claim.id }, { text: "why?" }, { binding, idempotencyKey: "a1" })) as DeclaredRecord;
    expect(out).toMatchObject({ kind: "ask", text: "why?" });
    expect(lastEnvelope()).toMatchObject({ v: 2, kind: "ask", binding, target: { act: claim.id }, body: { text: "why?" }, idempotencyKey: "a1", actor: alice.signer.key });
    expect(gets("/declarations")).toBe(reads);
    const rpc = await connect(service(), room.id, { kind: "key", signer: alice.signer });
    const viaRpc = (await rpc.act("ask", { act: claim.id }, { text: "again" }, { binding })) as DeclaredRecord;
    expect(viaRpc.kind).toBe("ask");
    expect(lastEnvelope()).toMatchObject({ v: 2, binding });
  });

  test("a stale binding is returned as the room's refusal with the active binding; the handle sends it once and reads nothing", async () => {
    const alice = await joinAs(room, "@alice");
    await room.activate(withAsk());
    const claim = (await alice.api.claim({ goal: "g", scope: ["src/**"] })) as Claim;
    const read = (await room.bindingOf("ask"))!;
    await room.activate(withAsk({ ...ASK, body: { text: { type: "text", max: 50 } } }));
    const sent = posts("/acts");
    const reads = gets("/declarations");
    const entries = room.entries.length;
    const stale = await alice.api.act("ask", { act: claim.id }, { text: "x" }, { binding: read });
    expect(stale).toMatchObject({ refused: true, rule: "binding-stale", current: { binding: await room.bindingOf("ask"), policy: room.policies.at(-1)!.policy } });
    expect(posts("/acts")).toBe(sent + 1);
    expect(gets("/declarations")).toBe(reads);
    expect(room.entries.length).toBe(entries);
    expect(await alice.api.act("shout", { act: claim.id }, { text: "x" }, { binding: read })).toMatchObject({ rule: "kind-undeclared" });
  });

  test("it refuses before sending: no binding, a malformed binding, a platform kind, a bad idempotency key", async () => {
    const alice = await joinAs(room, "@alice");
    await room.activate(withAsk());
    const before = room.requests.length;
    expect((await caught(alice.api.act("ask", null, {}, undefined as never))).message).toContain("binding");
    expect((await caught(alice.api.act("ask", null, {}, { binding: "nope" as Binding }))).code).toBe("bad-request");
    for (const kind of ["renew", "roster", "recover"]) expect((await caught(alice.api.act(kind, null, {}, { binding: B("a") }))).message).toContain(`${kind} is a platform kind`);
    expect((await caught(alice.api.act("ask", null, {}, { binding: B("a"), idempotencyKey: "has space" }))).code).toBe("bad-request");
    expect(room.requests.length).toBe(before);
  });
});

describe("the named methods (R-API-9 as amended)", () => {
  test("in a v1 room they sign v: 1; in a v2 room, v: 2 with the built-for binding; renew and roster stay v: 1; one catalogue read per handle", async () => {
    const alice = await joinAs(room, "@alice");
    const c1 = (await alice.api.claim({ goal: "g", scope: ["docs/**"] })) as Claim;
    expect(lastEnvelope()).toMatchObject({ v: 1, kind: "claim" });
    expect(lastEnvelope()).not.toHaveProperty("binding");
    await alice.api.renew(c1);
    expect(gets("/declarations")).toBe(1);
    // A handle made in a v2 room.
    await room.activate(withAsk());
    const again = await connect({ url }, room.id, { kind: "key", signer: alice.signer });
    const reads = gets("/declarations");
    const c2 = (await again.claim({ goal: "g", scope: ["src/**"] })) as Claim;
    const catalogue = (await room.catalogue({})) as ActsCatalogue;
    expect(lastEnvelope()).toMatchObject({ v: 2, kind: "claim", binding: await builtForBinding(catalogue, "claim") });
    expect(lastEnvelope()["binding"]).toBe(catalogue.acts["claim"]!.binding);
    await again.note({ act: c2.id }, { text: "n" });
    expect(lastEnvelope()).toMatchObject({ v: 2, kind: "note", binding: catalogue.acts["note"]!.binding });
    await again.renew(c2);
    expect(lastEnvelope()).toMatchObject({ v: 1, kind: "renew" });
    expect(lastEnvelope()).not.toHaveProperty("binding");
    const { signer } = await generateSigner();
    await again.roster(await delegateOp(again, "member", { to: signer.key, kinds: ["note"], lanes: "*", expiresAt: new Date(room.now() + 3600_000).toISOString() }));
    expect(lastEnvelope()).toMatchObject({ v: 1, kind: "roster" });
    // One read for the named acts, one for the grant builder.
    expect(gets("/declarations")).toBe(reads + 2);
    // A platform kind never needs the catalogue: a handle whose first act is a renewal reads nothing.
    const third = await connect({ url }, room.id, { kind: "key", signer: alice.signer });
    await third.renew(c2);
    expect(lastEnvelope()).toMatchObject({ v: 1, kind: "renew" });
    expect(gets("/declarations")).toBe(reads + 2);
  });

  test("the built-for binding is the code-review declaration's under the room's steps and lanes, never the room's own declaration's", async () => {
    const own: ActDeclaration = { ...CODE_REVIEW_ACTS["claim"]!, hold: { scope: "body.scope", workspace: true, leaseSeconds: 600 } };
    await room.activate({ ...CODE_REVIEW_ACTS, claim: own }, { lanes: "exclusive" });
    const catalogue = (await room.catalogue({})) as ActsCatalogue;
    const built = await builtForBinding(catalogue, "claim");
    expect(built).toBe(await bindingOf({ format: "artroom-policy-v2", steps: "artroom-steps-v1", lanes: "exclusive", acts: CODE_REVIEW_ACTS } as never, "claim"));
    expect(built).not.toBe(catalogue.acts["claim"]!.binding);
    // The room's lanes are part of it: the same declaration under by-scope binds differently.
    expect(built).not.toBe(await builtForBinding({ ...catalogue, lanes: "by-scope" }, "claim"));
    expect(await builtForBinding(catalogue, "ask")).toBeNull();
    const alice = await joinAs(room, "@alice");
    const entries = room.entries.length;
    const stale = await alice.api.claim({ goal: "g", scope: ["src/**"] });
    expect(stale).toMatchObject({ refused: true, rule: "binding-stale", current: { binding: catalogue.acts["claim"]!.binding } });
    expect(room.entries.length).toBe(entries);
    // The refusal made the handle forget what it read: the next call reads again, and is not a resend.
    const reads = gets("/declarations");
    const sent = posts("/acts");
    await alice.api.claim({ goal: "g", scope: ["src/**"] });
    expect(gets("/declarations")).toBe(reads + 1);
    expect(posts("/acts")).toBe(sent + 1);
  });
});

describe("a handle whose room changes vocabulary", () => {
  test("v2 back to v1: the named act is bad-request at step 1, the handle forgets what it read, and the next call signs v: 1", async () => {
    await room.activate(withAsk());
    const alice = await joinAs(room, "@alice");
    await alice.api.claim({ goal: "a", scope: ["src/**"] });
    expect(lastEnvelope()).toMatchObject({ v: 2 });
    await room.activate(null);
    const reads = gets("/declarations");
    const entries = room.entries.length;
    expect((await caught(alice.api.claim({ goal: "b", scope: ["docs/**"] }))).code).toBe("bad-request");
    expect(room.entries.length).toBe(entries);
    const claim = await alice.api.claim({ goal: "b", scope: ["docs/**"] });
    expect(isRefusal(claim)).toBe(false);
    expect(lastEnvelope()).toMatchObject({ v: 1, kind: "claim" });
    expect(gets("/declarations")).toBe(reads + 1);
  });
});

describe("bearer sessions (R-CRED-10 as amended)", () => {
  async function agent(acts: Record<string, string>) {
    const { invitation, secret } = await room.invite("@agent", { role: "agent", custody: "room", kinds: [], acts });
    const out = await redeem({ url }, room.id, { invitation, secret });
    if (isRefusal(out)) throw new Error(out.rule);
    return out;
  }

  test("over RPC a generic act carries the caller's binding to bearerAct unchanged; a named act carries none", async () => {
    await room.activate(withAsk());
    const binding = (await room.bindingOf("ask"))!;
    const b = await agent({ ask: binding, claim: (await room.bindingOf("claim"))! });
    const seen: unknown[] = [];
    const wire = room.wire();
    const spied = { room: async (): Promise<RoomWire> => ({ ...wire, bearerAct: (t, a) => (seen.push(a), wire.bearerAct(t, a)) }) };
    const rpc = await connect(spied, room.id, { kind: "bearer", token: b.bearer });
    const claim = (await rpc.claim({ goal: "g", scope: ["src/**"] })) as Claim;
    expect(seen[0]).toEqual({ kind: "claim", target: null, body: { goal: "g", scope: ["src/**"] }, idempotencyKey: expect.any(String) });
    const out = (await rpc.act("ask", { act: claim.id }, { text: "q" }, { binding, idempotencyKey: "b1" })) as DeclaredRecord;
    expect(seen[1]).toEqual({ kind: "ask", binding, target: { act: claim.id }, body: { text: "q" }, idempotencyKey: "b1" });
    expect(out).toMatchObject({ kind: "ask", by: { via: "delegation", member: "@agent" } });
    // A stale binding is passed as given, and the room refuses: the handle does not look up the active one.
    expect(await rpc.act("ask", { act: claim.id }, { text: "q" }, { binding: B("d") })).toMatchObject({ refused: true });
    expect(seen[2]).toMatchObject({ binding: B("d") });
    expect((await caught(rpc.act("roster", null, {}, { binding }))).code).toBe("bad-request");
  });
});

describe("grants expanded before signing (R-DECL-17)", () => {
  test("delegateOp and invitationSession give the legacy shape in a v1 room and a signed map in a v2 room; problems are thrown, not dropped", async () => {
    const { signer } = await generateSigner();
    const expiresAt = new Date(room.now() + 3600_000).toISOString();
    const alice = await joinAs(room, "@alice");
    expect(await delegateOp(alice.api, "member", { to: signer.key, kinds: ["claim", "note"], lanes: "*", expiresAt })).toEqual({ op: "delegate", to: signer.key, kinds: ["claim", "note"], lanes: "*", expiresAt });
    expect(await invitationSession(alice.api, "agent", { kinds: "*", ttlSeconds: 60 })).toEqual({ kinds: "*", lanes: "*", ttlSeconds: 60 });
    await room.activate(withAsk({ ...ASK, who: { roles: ["member"] } }));
    const c = (await alice.api.acts()) as ActsCatalogue;
    const op = (await delegateOp(c, "member", { to: signer.key, kinds: "*", lanes: "*", expiresAt })) as unknown as { kinds: string[]; acts: Record<string, string> };
    expect(op.kinds).toEqual(["renew"]);
    expect(op.acts).toEqual(Object.fromEntries(["claim", "propose", "note", "review", "land", "release", "ask"].map((k) => [k, c.acts[k]!.binding])));
    // An agent may not sign ask here, and nobody but a checker signs check: neither is in an agent's *.
    const session = (await invitationSession(c, "agent", { kinds: "*", ttlSeconds: 60 })) as unknown as { kinds: string[]; acts: Record<string, string>; lanes: string; ttlSeconds: number };
    expect(Object.keys(session.acts).sort()).toEqual(["claim", "land", "note", "propose", "release", "review"]);
    expect(session).toMatchObject({ kinds: ["renew"], lanes: "*", ttlSeconds: 60 });
    const e = await caught(invitationSession(c, "agent", { kinds: ["note", "ask", "merge"], ttlSeconds: 60 }));
    expect(e.code).toBe("bad-request");
    expect(e.message).toContain("The role agent may not grant ask.");
    expect(e.message).toContain("merge is not declared in policy version");
    expect(e.message).toContain("Nothing was sent.");
    // A checker's grant: check, and no platform kind, since a checker may not renew.
    expect(await invitationSession(c, "checker", { kinds: "*", ttlSeconds: 60 })).toMatchObject({ kinds: [], acts: { check: c.acts["check"]!.binding, note: c.acts["note"]!.binding } });
  });

  test("a kind whose declaration says it may not be delegated is refused by name, and left out of a grant of everything", async () => {
    await room.activate(withAsk({ ...ASK, who: { ...ASK.who, delegable: false } }));
    const c = (await (await joinAs(room, "@alice")).api.acts()) as ActsCatalogue;
    expect(expandGrant(c, "member", ["ask"])).toMatchObject({ ok: false });
    expect(expandGrant(c, "member", "*")).toMatchObject({ ok: true, grant: { acts: expect.not.objectContaining({ ask: expect.anything() }) } });
  });
});

describe("a log entry's envelope (R-DECL-23)", () => {
  test("envelopeOf gives a log entry's envelope in either version, with a declared act's binding, and null for a system entry", async () => {
    const alice = await joinAs(room, "@alice");
    await alice.api.claim({ goal: "g", scope: ["src/**"] });
    await room.activate(withAsk());
    const binding = (await room.bindingOf("ask"))!;
    // A recorded refusal has its envelope too.
    const refused = await alice.api.act("claim", null, { goal: "g", scope: ["/bad"] }, { binding: (await room.bindingOf("claim"))! });
    expect(isRefusal(refused) && refused.act).toBeTruthy();
    await alice.api.act("ask", { act: FakeRoom.idOf(room.entries[1]!) }, { text: "x" }, { binding });
    const page = await alice.api.log();
    const envelopes = page.acts.map(envelopeOf);
    expect(envelopes.filter((e) => e === null)).toHaveLength(page.acts.filter((e) => e.entry.type === "system").length);
    expect(envelopeOf(page.acts.find((e) => e.entry.type === "refusal")!)).toMatchObject({ v: 2, kind: "claim", body: { scope: ["/bad"] } });
    expect(envelopes.find((e) => e?.kind === "claim")).toMatchObject({ v: 1, kind: "claim" });
    expect(envelopes.find((e) => e?.kind === "claim")).not.toHaveProperty("binding");
    expect(envelopes.at(-1)).toMatchObject({ v: 2, kind: "ask", binding });
  });
});
