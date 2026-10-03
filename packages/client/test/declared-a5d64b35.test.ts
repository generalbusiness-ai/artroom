/**
 * Declared acts in the client (request a5d64b35; docs/protocol.md R-DECL-16,
 * section 33.10): the generic act, the catalogue reads, the named methods'
 * built-for binding, the bearer paths and the grant builders. The fake room
 * runs in its declared mode. The real Room is tested with this client in
 * packages/room/test/workerd/declared-stage5-a5d64b35.test.ts.
 */

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { ActDeclaration, ActsCatalogue, ArtroomError, Binding, Claim, DeclaredRecord, RoomWire } from "@generalbusiness/artroom-contract";
import { CODE_REVIEW_ACTS, bindingOf } from "@generalbusiness/artroom-policy/declared";
import {
  buildDeclaredEnvelope,
  builtForBinding,
  checkBinding,
  connect,
  delegateOp,
  fieldsOf,
  generateSigner,
  governs,
  invitationSession,
  isArtroomError,
  isRefusal,
  meaningOf,
  redeem,
  signEnvelope,
  targetsOf,
  verifyValue,
  type HttpRoomClient,
  type PreparedAct,
} from "../src/index.ts";
import { FakeRoom } from "./support/fake-room.ts";
import { joinAs, startRoom, type Url } from "./support/setup.ts";

let room: FakeRoom;
let url: Url;
beforeEach(async () => {
  ({ room, url } = await startRoom());
});
afterEach(() => room.stop());

const ASK: ActDeclaration = { label: "Ask", targets: { entry: ["comment"] }, body: { text: { type: "text", max: 200 } }, who: { roles: ["member", "agent"] } };
const withAsk = (ask: ActDeclaration = ASK) => ({ ...CODE_REVIEW_ACTS, ask });
const B = (c: string) => `sha256:${c.repeat(64)}` as Binding;

async function caught(p: Promise<unknown>): Promise<ArtroomError> {
  try {
    await p;
  } catch (e) {
    if (isArtroomError(e)) return e;
    throw e;
  }
  throw new Error("expected an ArtroomError");
}
const posts = (route: string) => room.requests.filter((r) => r.method === "POST" && r.route === route).length;
const gets = (route: string) => room.requests.filter((r) => r.method === "GET" && r.route === route).length;
const service = () => ({ room: async (): Promise<RoomWire> => room.wire() });
const lastEnvelope = () => {
  const e = room.entries.at(-1)!.entry;
  if (e.type === "system") throw new Error("a system entry");
  return e.act.envelope as unknown as Record<string, unknown>;
};

describe("the declared envelope (R-DECL-16, R-SIG-1 as amended)", () => {
  test("v: 2 with the binding inside the signed bytes, under the same domain tag; a changed binding breaks the signature", async () => {
    const { signer } = await generateSigner();
    const env = buildDeclaredEnvelope(room.id, { signer }, "ask", B("a"), { act: "act_1_00000000" }, { text: "x" }, "k1");
    expect(env).toEqual({ v: 2, room: room.id, actor: signer.key, kind: "ask", binding: B("a"), target: { act: "act_1_00000000" }, body: { text: "x" }, idempotencyKey: "k1" });
    const signed = await signEnvelope(env, signer);
    expect(await verifyValue("artroom-envelope-v1", signed.envelope, signed.sig, signer.key)).toBe(true);
    expect(await verifyValue("artroom-envelope-v1", { ...signed.envelope, binding: B("b") }, signed.sig, signer.key)).toBe(false);
    expect(await verifyValue("artroom-envelope-v1", { ...signed.envelope, v: 1 }, signed.sig, signer.key)).toBe(false);
    // Under a delegation the envelope names it, as a v: 1 envelope does.
    expect(buildDeclaredEnvelope(room.id, { signer, delegation: "act_9_00000000" }, "ask", B("a"), null, {}, "k2")).toMatchObject({ delegation: "act_9_00000000" });
  });

  test("a binding is sha256: and 64 lowercase hex digits, or the call is refused before anything is built", () => {
    expect(checkBinding(B("a"))).toBe(B("a"));
    for (const bad of [undefined, null, "", "sha256:abc", B("A"), `sha1:${"a".repeat(64)}`, 7]) expect(() => checkBinding(bad)).toThrow(/binding/);
  });
});

describe("the catalogue reads", () => {
  test("acts() is always read from the room; actsAt() keeps an ended version and answers its whole interval without a read", async () => {
    const alice = await joinAs(room, "@alice");
    expect(await alice.api.acts()).toMatchObject({ vocabulary: "artroom-legacy-v1", since: 0, until: null });
    await room.activate(withAsk());
    const first = (await alice.api.acts()) as ActsCatalogue;
    expect(first.acts["ask"]).toEqual({ declaration: ASK, binding: await room.bindingOf("ask") });
    await alice.api.claim({ goal: "g", scope: ["src/**"] });
    await room.activate({ ...CODE_REVIEW_ACTS });
    const reads = gets("/declarations");
    expect(await alice.api.acts()).not.toEqual(first);
    expect(await alice.api.acts()).toMatchObject({ until: null });
    expect(gets("/declarations")).toBe(reads + 2);
    // The ended version, by seq: read once, then kept for every seq it governs and for its policy version.
    const ended = (await alice.api.actsAt({ seq: first.since }))!;
    expect(ended).toMatchObject({ policy: first.policy, since: first.since, until: expect.any(Number) });
    expect((ended as ActsCatalogue).acts["ask"]).toMatchObject({ retired: ended.until });
    expect(await alice.api.actsAt({ seq: first.since + 1 })).toBe(ended);
    expect(await alice.api.actsAt({ policy: first.policy })).toBe(ended);
    expect(gets("/declarations")).toBe(reads + 3);
    // A seq it does not govern is read; the active version is never kept; an unknown version is null.
    expect(governs(ended, ended.until!)).toBe(false);
    expect(governs(ended, ended.since)).toBe(true);
    expect(governs(ended, ended.since - 1)).toBe(false);
    expect(await alice.api.actsAt({ seq: ended.until! })).toMatchObject({ until: null });
    expect(await alice.api.actsAt({ seq: ended.until! })).toMatchObject({ until: null });
    expect(gets("/declarations")).toBe(reads + 5);
    expect(await alice.api.actsAt({ policy: "act_999_00000000" })).toBeNull();
    // Over RPC the same reads.
    const rpc = await connect(service(), room.id, { kind: "key", signer: alice.signer });
    expect(await rpc.actsAt({ policy: first.policy })).toEqual(ended);
  });

  test("meaningOf reads a kind under one catalogue: declared with its label and retirement, platform, legacy with its end, unknown", async () => {
    await room.activate(withAsk());
    await room.activate({ ...CODE_REVIEW_ACTS });
    const alice = await joinAs(room, "@alice");
    const legacy = (await alice.api.actsAt({ seq: 0 }))!;
    const declared = (await alice.api.actsAt({ seq: legacy.until! }))! as ActsCatalogue;
    expect(meaningOf(declared, "ask")).toEqual({ vocabulary: "declared", policy: declared.policy, kind: "ask", label: "Ask", declaration: ASK, binding: declared.acts["ask"]!.binding, retired: declared.until });
    expect(meaningOf(declared, "claim")).not.toHaveProperty("retired");
    expect(meaningOf(declared, "renew")).toEqual({ vocabulary: "platform", policy: declared.policy, kind: "renew", label: "Renew" });
    expect(meaningOf(declared, "shout")).toEqual({ vocabulary: "unknown", policy: declared.policy, kind: "shout", label: "shout" });
    // An inherited property name is not a declared kind.
    expect(meaningOf(declared, "toString").vocabulary).toBe("unknown");
    expect(meaningOf(legacy, "claim")).toEqual({ vocabulary: "artroom-legacy-v1", policy: legacy.policy, kind: "claim", label: "Claim", retired: legacy.until });
    expect(meaningOf(legacy, "ask")).toMatchObject({ vocabulary: "unknown" });
    expect(meaningOf((await alice.api.acts()) as ActsCatalogue, "claim")).toMatchObject({ vocabulary: "declared", label: "Claim" });
  });

  test("fieldsOf and targetsOf give a form its fields: the steps' own, then the declared ones, required by target", () => {
    const claim = CODE_REVIEW_ACTS["claim"]!;
    expect(targetsOf(claim)).toEqual(["none", "thread"]);
    expect(fieldsOf(claim, "none")!.map((f) => [f.name, f.from, f.required])).toEqual([
      ["scope", "step", true],
      ["goal", "declaration", true],
      ["plan", "declaration", false],
    ]);
    expect(fieldsOf(claim, "thread")!.map((f) => [f.name, f.from, f.required])).toEqual([
      ["scope", "step", true],
      ["expectedGeneration", "step", true],
      ["lease", "step", false],
      ["goal", "declaration", false],
      ["plan", "declaration", false],
    ]);
    expect(fieldsOf(claim, "version")).toBeNull();
    // A hold whose scope is a template fixes the scope: open takes no scope field.
    const part: ActDeclaration = { label: "Take a part", targets: { none: ["open"] }, body: { part: { type: "enum", values: ["bass", "keys"] } }, who: { roles: ["member"] }, hold: { scope: ["parts/{part}/**"] } };
    expect(fieldsOf(part, "none")!.map((f) => f.name)).toEqual(["part"]);
    // Two steps in one act: each step's fields once.
    const add: ActDeclaration = { label: "Add", targets: { thread: ["version", "land"] }, threads: ["take-part"], who: { roles: ["member"] } };
    expect(fieldsOf(add, "thread")!.map((f) => f.name)).toEqual(["lease", "expectedGeneration", "head"]);
  });
});

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

  test("the prepared act carries the binding, and replay sends the same bytes: the original record, also after the meaning changed", async () => {
    const alice = await joinAs(room, "@alice");
    await room.activate(withAsk());
    const claim = (await alice.api.claim({ goal: "g", scope: ["src/**"] })) as Claim;
    const binding = (await room.bindingOf("ask"))!;
    let prepared: PreparedAct | undefined;
    room.faults.push({ route: "POST /acts", kind: "drop" });
    const out = await (alice.api as HttpRoomClient).act("ask", { act: claim.id }, { text: "once" }, { binding, onPrepared: (p) => void (prepared = p) });
    expect(prepared).toMatchObject({ kind: "ask", binding, target: { act: claim.id }, body: { text: "once" } });
    expect((prepared!.signed!.envelope as { binding?: string }).binding).toBe(binding);
    expect(room.entries.filter((e) => e.entry.type === "act" && (e.entry.act.envelope.kind as string) === "ask")).toHaveLength(1);
    await room.activate(withAsk({ ...ASK, body: { text: { type: "text", max: 50 } } }));
    expect(await (alice.api as HttpRoomClient).replay(prepared!)).toEqual(out);
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

  test("replay of a bearer's generic act sends the kept binding, not a newer one", async () => {
    await room.activate(withAsk());
    const binding = (await room.bindingOf("ask"))!;
    const b = await agent({ ask: binding });
    const seen: { binding?: string }[] = [];
    const wire = room.wire();
    const rpc = await connect({ room: async (): Promise<RoomWire> => ({ ...wire, bearerAct: (t, a) => (seen.push(a as never), wire.bearerAct(t, a)) }) }, room.id, { kind: "bearer", token: b.bearer });
    let prepared: PreparedAct | undefined;
    const first = await (rpc as unknown as HttpRoomClient).act("ask", null as never, { text: "q" }, { binding, idempotencyKey: "r1", onPrepared: (p) => void (prepared = p) });
    expect(prepared).toEqual({ kind: "ask", target: null, body: { text: "q" }, idempotencyKey: "r1", binding });
    await room.activate(withAsk({ ...ASK, body: { text: { type: "text", max: 50 } } }));
    expect(await (rpc as unknown as HttpRoomClient).replay(prepared!)).toEqual(first);
    expect(seen.map((a) => a.binding)).toEqual([binding, binding]);
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
});
