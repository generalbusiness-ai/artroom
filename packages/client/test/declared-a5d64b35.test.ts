/**
 * Declared acts in the client (request a5d64b35; docs/protocol.md R-DECL-16,
 * section 33.10): the generic act, the catalogue reads, the named methods'
 * built-for binding, the bearer paths and the grant builders. The fake room
 * runs in its declared mode. The real Room is tested with this client in
 * packages/room/test/workerd/declared-stage5-a5d64b35.test.ts.
 */

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { envelopeOf, type ActDeclaration, type ActsCatalogue, type ArtroomError, type Binding, type Claim, type DeclaredRecord, type Room, type RoomApi, type RoomWire } from "@generalbusiness/artroom-contract";
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
  threadTitle,
  titleOf,
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

describe("an ended version is not final: a later activation can retire its kinds (R-DECL-23)", () => {
  const TELL: ActDeclaration = { label: "Tell", targets: { entry: ["comment"] }, body: { text: { type: "text", max: 200 } }, who: { roles: ["member", "agent"] } };
  const OLD = { ...withAsk(), tell: TELL };

  /**
   * A handle that read version A after it ended, while `tell` was still
   * declared, and kept it. `drop` then activates a version without `tell`,
   * with another `ask` and another `claim`, and returns its seq.
   */
  async function kept(rpc = false) {
    const alice = await joinAs(room, "@alice");
    const api: RoomApi = rpc ? await connect(service(), room.id, { kind: "key", signer: alice.signer }) : alice.api;
    const a = await room.activate(OLD);
    const askA = (await room.bindingOf("ask"))!;
    await room.activate({ ...OLD, more: TELL });
    const first = (await api.actsAt({ policy: a })) as ActsCatalogue;
    expect(first.until).not.toBeNull();
    expect(first.acts["tell"]).not.toHaveProperty("retired");
    const drop = async () => {
      const claim = CODE_REVIEW_ACTS["claim"]!;
      await room.activate({ ...withAsk({ ...ASK, body: { text: { type: "text", max: 100 } } }), claim: { ...claim, body: { ...claim.body, extra: { type: "text", max: 5, optional: true } } } });
      return room.entries.at(-1)!.seq;
    };
    const tellNow = async () => ((await api.actsAt({ policy: a })) as ActsCatalogue).acts["tell"];
    return { alice, api, a, askA, first, drop, tellNow };
  }
  type Kept = Awaited<ReturnType<typeof kept>>;
  const until = async (test: () => boolean) => {
    for (let i = 0; i < 200 && !test(); i++) await new Promise((r) => setTimeout(r, 10));
  };

  test("with no sign of a later activation the handle answers what it kept; { fresh: true } reads again and replaces it", async () => {
    const s = await kept();
    // Reading the active catalogue again, with no new activation, keeps what the handle has.
    await s.api.acts();
    const reads = gets("/declarations");
    expect(await s.api.actsAt({ policy: s.a })).toBe(s.first);
    const dropped = await s.drop();
    // The handle has seen nothing since: it answers the marks it read, and reads nothing.
    expect(await s.api.actsAt({ policy: s.a })).toBe(s.first);
    expect(gets("/declarations")).toBe(reads);
    const fresh = (await s.api.actsAt({ policy: s.a }, { fresh: true })) as ActsCatalogue;
    expect(fresh.acts["tell"]).toMatchObject({ retired: dropped });
    expect(fresh.acts["ask"]).not.toHaveProperty("retired");
    expect(gets("/declarations")).toBe(reads + 1);
    // The fresh answer is the one kept from now on, by policy version and by seq.
    expect(await s.api.actsAt({ policy: s.a })).toBe(fresh);
    expect(await s.api.actsAt({ seq: s.first.since })).toBe(fresh);
    expect(gets("/declarations")).toBe(reads + 1);
  });

  const SIGNS: readonly [string, boolean, (s: Kept) => Promise<void>][] = [
    ["a read of the active catalogue", false, async (s) => void (await s.drop(), await s.api.acts())],
    ["a log page that holds the activation", false, async (s) => void (await s.drop(), await s.api.log())],
    [
      "a read of another version that the activation ended",
      false,
      async (s) => {
        const dropped = await s.drop();
        expect(await s.api.actsAt({ seq: dropped - 1 })).toMatchObject({ until: dropped });
      },
    ],
    [
      "a long-poll update that holds the activation",
      false,
      async (s) => {
        const start = (await s.alice.api.subscribe(undefined, { waitMs: 0 })).cursor;
        await s.drop();
        expect((await s.alice.api.subscribe(start, { waitMs: 1000 })).entries.map((e) => e.kind)).toContain("policy-activated");
      },
    ],
    [
      "a watched update that holds the activation",
      false,
      async (s) => {
        const start = (await s.alice.api.subscribe(undefined, { waitMs: 0 })).cursor;
        const kinds: string[] = [];
        const sub = s.alice.api.watch(start, (u) => kinds.push(...u.entries.map((e) => e.kind)));
        await until(() => room.socketCount === 1);
        await s.drop();
        await until(() => kinds.includes("policy-activated"));
        sub.close();
        expect(kinds).toContain("policy-activated");
      },
    ],
    [
      "an update on the RPC stream that holds the activation",
      true,
      async (s) => {
        const stream = await (s.api as unknown as Room).subscribe();
        const reader = stream.getReader();
        const pending = reader.read();
        await s.drop();
        expect((await pending).done).toBe(false);
        reader.releaseLock();
        await stream.cancel();
      },
    ],
    [
      "a binding-stale refusal of a generic act, which names the active version",
      false,
      async (s) => {
        await s.drop();
        const out = await s.api.act("ask", { act: s.a }, { text: "x" }, { binding: s.askA });
        expect(isRefusal(out) && out.rule).toBe("binding-stale");
      },
    ],
    [
      "a binding-stale refusal of a named act",
      false,
      async (s) => {
        // The handle already read the vocabulary for an earlier named act, so it reads nothing before it signs this one.
        expect(isRefusal(await s.api.claim({ goal: "g", scope: ["docs/**"] }))).toBe(false);
        await s.drop();
        const reads = gets("/declarations");
        const out = await s.api.claim({ goal: "g", scope: ["src/**"] });
        expect(isRefusal(out) && out.rule).toBe("binding-stale");
        expect(gets("/declarations")).toBe(reads);
      },
    ],
  ];

  test.each(SIGNS)("after %s, the handle drops what it kept and the next answer has the room's marks", async (_name, rpc, sign) => {
    const s = await kept(rpc);
    expect(await s.tellNow()).not.toHaveProperty("retired");
    await sign(s);
    const dropped = room.entries.findLast((e) => e.entry.type === "system" && e.entry.event.type === "policy-activated")!.seq;
    expect(await s.tellNow()).toMatchObject({ retired: dropped });
    // The answer it read now is kept in turn.
    expect(await s.api.actsAt({ policy: s.a })).toBe(await s.api.actsAt({ seq: s.first.since }));
  });

  test("a refusal or an update that names no later activation drops nothing", async () => {
    const s = await kept();
    const bob = await joinAs(room, "@bob");
    const start = (await s.alice.api.subscribe(undefined, { waitMs: 0 })).cursor;
    const refused = await s.api.act("ask", { act: s.a }, { text: "x" }, { binding: B("0") });
    expect(isRefusal(refused) && refused.rule).toBe("binding-stale");
    await bob.api.claim({ goal: "g", scope: ["docs/**"] });
    expect((await s.alice.api.subscribe(start, { waitMs: 1000 })).entries.length).toBeGreaterThan(0);
    await s.api.log();
    expect(await s.api.actsAt({ policy: s.a })).toBe(s.first);
  });
});

describe("what readers call a record and a thread (R-DECL-23)", () => {
  test("titleOf: the label at the record's seq and its first field by name, the order the room records, other than scope and because", async () => {
    await room.activate(withAsk());
    const alice = await joinAs(room, "@alice");
    const c = (await alice.api.acts()) as ActsCatalogue;
    const ask = meaningOf(c, "ask");
    expect(titleOf(ask, { text: "Which key?", urgency: "high" })).toBe("Ask: Which key?");
    expect(titleOf(ask, { scope: ["songs/**"], because: [{ act: "act_1_00000000" }], title: "Blue Bossa" })).toBe("Ask: Blue Bossa");
    // The body a caller typed and the record the room keeps (keys sorted) give one title: the first field by name.
    expect(titleOf(ask, { title: "Blue Bossa", key: "c" })).toBe("Ask: c");
    expect(titleOf(ask, { key: "c", title: "Blue Bossa" })).toBe("Ask: c");
    expect(titleOf(ask, { scope: ["songs/**"], because: [] })).toBe("Ask");
    expect(titleOf(ask, {})).toBe("Ask");
    expect(titleOf(ask, null)).toBe("Ask");
    expect(titleOf(ask, ["a"])).toBe("Ask");
    // A value is shown as it is: text, yes or no, a number, a list of text, anything else as JSON.
    expect(titleOf(ask, { swing: true })).toBe("Ask: yes");
    expect(titleOf(ask, { swing: false })).toBe("Ask: no");
    expect(titleOf(ask, { tempo: 132 })).toBe("Ask: 132");
    expect(titleOf(ask, { parts: ["bass", "keys"] })).toBe("Ask: bass, keys");
    expect(titleOf(ask, { at: { bar: 4 } })).toBe('Ask: {"bar":4}');
    // A kind with no meaning there is still named, by its kind.
    expect(titleOf(meaningOf(c, "shout"), { text: "x" })).toBe("shout: x");
  });

  test("threadTitle: the goal when the thread has one; else the opening act's title; else the thread's ID", async () => {
    await room.activate(withAsk());
    const alice = await joinAs(room, "@alice");
    const ask = meaningOf((await alice.api.acts()) as ActsCatalogue, "ask");
    const opening = { meaning: ask, body: { title: "Blue Bossa" } };
    expect(threadTitle({ lane: "act_7_00000000", goal: "Rate-limit login" }, opening)).toBe("Rate-limit login");
    expect(threadTitle({ lane: "act_7_00000000", goal: "" }, opening)).toBe("Ask: Blue Bossa");
    expect(threadTitle({ lane: "act_7_00000000", goal: "" })).toBe("act_7_00000000");
    expect(threadTitle({ lane: "act_7_00000000", goal: "g" })).toBe("g");
  });

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
