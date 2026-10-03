/**
 * The checker's two client findings at b7b9d8df (act 43e8fe3b, request
 * a5d64b35):
 *
 * 1. A prepared act is the handle's own. The envelope and the prepared act
 *    hold copies of the target and body, taken before signing and before
 *    `onPrepared`, so nothing the caller does to its own objects afterwards
 *    changes the signed bytes or a bearer's call (R-IDEM-2).
 * 2. An answer about an ended policy version is kept only if no later
 *    activation was learnt of while it was on its way (R-DECL-23).
 *
 * The fake room runs in its declared mode. The real Room is driven with
 * this client in packages/room/test/workerd.
 */

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { ActDeclaration, ActsCatalogue, Claim, RoomApi, RoomWire } from "@generalbusiness/artroom-contract";
import { CODE_REVIEW_ACTS } from "@generalbusiness/artroom-policy/declared";
import { connect, isRefusal, redeem, verifyValue, type HttpRoomClient, type PreparedAct } from "../src/index.ts";
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
const posts = (route: string) => room.requests.filter((r) => r.method === "POST" && r.route === route).length;
const gets = (route: string) => room.requests.filter((r) => r.method === "GET" && r.route === route).length;
const verifies = (p: PreparedAct, key: string) => verifyValue("artroom-envelope-v1", p.signed!.envelope, p.signed!.sig, key as never);

describe("a prepared act is the handle's own copy of what the caller intended (R-IDEM-2)", () => {
  async function ready() {
    const alice = await joinAs(room, "@alice");
    await room.activate(withAsk());
    const api = alice.api as HttpRoomClient;
    const claim = (await api.claim({ goal: "g", scope: ["src/**"] })) as Claim;
    const other = (await api.claim({ goal: "other", scope: ["docs/**"] })) as Claim;
    return { alice, api, claim, other, binding: (await room.bindingOf("ask"))! };
  }

  for (const change of ["nothing", "its body", "its target", "its body, with a structured clone saved"] as const)
    test(`a generic act signed by a key: after the caller changes ${change}, the kept envelope still verifies and replay returns the original record`, async () => {
      const { alice, api, claim, other, binding } = await ready();
      const body = { text: "original" };
      const target = { act: claim.id };
      let kept: PreparedAct | undefined;
      const first = await api.act("ask", target, body, { binding, idempotencyKey: "kept", onPrepared: (p) => void (kept = change.endsWith("saved") ? structuredClone(p) : p) });
      expect(first).toMatchObject({ kind: "ask", text: "original" });
      // The handle leaves the caller's own objects as they were: it neither keeps nor freezes them.
      expect([Object.isFrozen(body), Object.isFrozen(target)]).toEqual([false, false]);
      if (change.startsWith("its body")) body.text = "second question";
      if (change === "its target") target.act = other.id;
      expect(kept).toMatchObject({ kind: "ask", binding, target: { act: claim.id }, body: { text: "original" } });
      expect(kept!.signed!.envelope).toMatchObject({ target: { act: claim.id }, body: { text: "original" } });
      expect(await verifies(kept!, alice.signer.key)).toBe(true);
      const sent = posts("/acts");
      expect(await api.replay(kept!)).toEqual(first);
      expect(posts("/acts")).toBe(sent + 1);
      expect(room.entries.filter((e) => e.entry.type === "act" && (e.entry.act.envelope.kind as string) === "ask")).toHaveLength(1);
    });

  test("a named act signed by a key: after the caller changes an array it passed in, the kept envelope still verifies and replay returns the original record", async () => {
    const alice = await joinAs(room, "@alice");
    await room.activate(withAsk());
    const api = alice.api as HttpRoomClient;
    const input = { goal: "g", scope: ["src/**"] };
    let kept: PreparedAct | undefined;
    const first = (await api.claim(input, { idempotencyKey: "named", onPrepared: (p) => void (kept = p) })) as Claim;
    expect(Object.isFrozen(input.scope)).toBe(false);
    input.scope.push("docs/**");
    input.goal = "another goal";
    expect(kept!.body).toEqual({ goal: "g", scope: ["src/**"] });
    expect((kept!.signed!.envelope as { body: unknown }).body).toEqual({ goal: "g", scope: ["src/**"] });
    expect(await verifies(kept!, alice.signer.key)).toBe(true);
    expect(await api.replay(kept!)).toEqual(first);
  });

  test("a bearer session, where the room signs: a generic and a named act are each sent again as first prepared, whatever the caller changed", async () => {
    await room.activate(withAsk());
    const binding = (await room.bindingOf("ask"))!;
    const { invitation, secret } = await room.invite("@agent", { role: "agent", custody: "room", kinds: [], acts: { ask: binding, claim: (await room.bindingOf("claim"))! } });
    const b = await redeem({ url }, room.id, { invitation, secret });
    if (isRefusal(b)) throw new Error(b.rule);
    const seen: { body?: unknown; target?: unknown }[] = [];
    const wire = room.wire();
    const rpc = (await connect({ room: async (): Promise<RoomWire> => ({ ...wire, bearerAct: (t, a) => (seen.push(structuredClone(a) as never), wire.bearerAct(t, a)) }) }, room.id, { kind: "bearer", token: b.bearer })) as unknown as HttpRoomClient;
    const input = { goal: "g", scope: ["src/**"] };
    let named: PreparedAct | undefined;
    const claim = (await rpc.claim(input, { idempotencyKey: "n1", onPrepared: (p) => void (named = p) })) as Claim;
    input.scope.push("docs/**");
    expect(named).toEqual({ kind: "claim", target: null, body: { goal: "g", scope: ["src/**"] }, idempotencyKey: "n1" });
    expect(await rpc.replay(named!)).toEqual(claim);
    const body = { text: "q" };
    const target = { act: claim.id };
    let generic: PreparedAct | undefined;
    const first = await rpc.act("ask", target, body, { binding, idempotencyKey: "g1", onPrepared: (p) => void (generic = p) });
    body.text = "another";
    target.act = "act_999_00000000";
    expect(generic).toEqual({ kind: "ask", target: { act: claim.id }, body: { text: "q" }, idempotencyKey: "g1", binding });
    expect(await rpc.replay(generic!)).toEqual(first);
    // Each replay made the same call as its first sending.
    expect(seen.map((a) => [a.target, a.body])).toEqual([
      [null, { goal: "g", scope: ["src/**"] }],
      [null, { goal: "g", scope: ["src/**"] }],
      [{ act: claim.id }, { text: "q" }],
      [{ act: claim.id }, { text: "q" }],
    ]);
  });

  test("the copies are frozen all the way down, so the hook that is handed the prepared act cannot change what is sent", async () => {
    const { api, claim, binding } = await ready();
    let kept: PreparedAct | undefined;
    await api.claim({ goal: "h", scope: ["lib/**"] }, { onPrepared: (p) => void (kept = p) });
    const named = kept!.body as { scope: string[] };
    expect([Object.isFrozen(named), Object.isFrozen(named.scope)]).toEqual([true, true]);
    await api.act("ask", { act: claim.id }, { text: "x" }, { binding, onPrepared: (p) => void (kept = p) });
    expect([Object.isFrozen(kept!.target), Object.isFrozen(kept!.body)]).toEqual([true, true]);
    const sent = posts("/acts");
    const tried = api.act("ask", { act: claim.id }, { text: "x" }, { binding, onPrepared: (p) => void ((p.body as { text: string }).text = "changed in the hook") });
    await expect(tried).rejects.toBeInstanceOf(TypeError);
    expect(posts("/acts")).toBe(sent);
  });

  test("a target or body that is not plain data is bad-request before anything is signed or sent", async () => {
    const { api, claim, binding } = await ready();
    const sent = room.requests.length;
    let hooked = false;
    const onPrepared = () => void (hooked = true);
    await expect(api.act("ask", { act: claim.id }, { text: (() => "x") as never }, { binding, onPrepared })).rejects.toMatchObject({ name: "ArtroomError", code: "bad-request" });
    await expect(api.act("ask", { act: claim.id, extra: Symbol("s") } as never, { text: "x" }, { binding, onPrepared })).rejects.toMatchObject({ name: "ArtroomError", code: "bad-request" });
    await expect(api.claim({ goal: "g", scope: [(() => "src/**") as never] }, { onPrepared })).rejects.toMatchObject({ name: "ArtroomError", code: "bad-request" });
    expect(hooked).toBe(false);
    expect(room.requests.length).toBe(sent);
  });
});

describe("an answer about an ended version is kept only if no later activation was learnt of meanwhile (R-DECL-23)", () => {
  const TELL: ActDeclaration = { label: "Tell", targets: { entry: ["comment"] }, body: { text: { type: "text", max: 200 } }, who: { roles: ["member", "agent"] } };
  const OLD = { ...withAsk(), tell: TELL };

  /** Version A, ended by a second version that still declares `tell`. `retire` activates a third without it. */
  async function ended() {
    const a = await room.activate(OLD);
    await room.activate({ ...OLD, more: TELL });
    const retire = async () => {
      await room.activate(withAsk());
      return room.entries.at(-1)!.seq;
    };
    return { a, retire };
  }

  /** A handle whose first read of version A is held after the room answered it, until `release`. */
  async function held(over: "https" | "rpc", a: string) {
    let arrived = () => {};
    let release = () => {};
    const seen = new Promise<void>((resolve) => (arrived = resolve));
    const gate = new Promise<void>((resolve) => (release = resolve));
    let holding = false;
    const hold = async () => {
      if (holding) return;
      holding = true;
      arrived();
      await gate;
    };
    let api: RoomApi;
    if (over === "https") {
      const delayed: typeof fetch = async (input, init) => {
        const response = await fetch(input, init);
        if (new URL(input instanceof Request ? input.url : String(input)).searchParams.get("policy") === a) await hold();
        return response;
      };
      api = (await joinAs(room, "@alice", "member", { fetch: delayed })).api;
    } else {
      const alice = await joinAs(room, "@alice");
      const wire = room.wire();
      const read: RoomWire["read"] = async (auth, query) => {
        const out = await wire.read(auth, query);
        if ((query as { policy?: string }).policy === a) await hold();
        return out;
      };
      api = await connect({ room: async (): Promise<RoomWire> => ({ ...wire, read }) }, room.id, { kind: "key", signer: alice.signer });
    }
    return { api, seen, release };
  }

  for (const over of ["https", "rpc"] as const)
    test(`over ${over}: an answer read before a retirement, arriving after the handle saw that activation, is not kept; the next read asks the room and gets the retired mark`, async () => {
      const { a, retire } = await ended();
      const { api, seen, release } = await held(over, a);
      const oldRead = api.actsAt({ policy: a });
      await seen;
      const dropped = await retire();
      const current = await api.acts();
      expect(current.since).toBe(dropped);
      release();
      const old = (await oldRead) as ActsCatalogue;
      // The held answer is what the room said before the retirement, and its caller gets it as it is.
      expect(old.acts["tell"]).not.toHaveProperty("retired");
      const next = (await api.actsAt({ policy: a })) as ActsCatalogue;
      expect(next.acts["tell"]!.retired).toBe(dropped);
      expect(next).not.toBe(old);
      // That answer is kept: the same question is now answered without a read, as in the sequential case.
      const reads = gets("/declarations");
      expect(await api.actsAt({ policy: a })).toBe(next);
      if (over === "https") expect(gets("/declarations")).toBe(reads);
      expect(((await api.actsAt({ policy: a }, { fresh: true })) as ActsCatalogue).acts["tell"]!.retired).toBe(dropped);
    });

  test("a held answer that no activation overtook is kept as before: the next question about its interval is answered without a read", async () => {
    const { a } = await ended();
    const { api, seen, release } = await held("https", a);
    // The handle already knows the latest activation when it asks.
    await api.acts();
    const oldRead = api.actsAt({ policy: a });
    await seen;
    // Reading the active catalogue again while the answer is held tells the handle nothing new.
    await api.acts();
    release();
    const first = (await oldRead) as ActsCatalogue;
    const reads = gets("/declarations");
    expect(await api.actsAt({ policy: a })).toBe(first);
    expect(await api.actsAt({ seq: first.since })).toBe(first);
    expect(gets("/declarations")).toBe(reads);
  });

  test("a handle that learns of any activation while an answer is held does not keep that answer, since it cannot tell which came first", async () => {
    const { a } = await ended();
    const { api, seen, release } = await held("https", a);
    // This handle has seen no activation yet. It learns the latest one while the answer is held; none happened meanwhile.
    const oldRead = api.actsAt({ policy: a });
    await seen;
    await api.acts();
    release();
    const first = (await oldRead) as ActsCatalogue;
    const reads = gets("/declarations");
    const next = await api.actsAt({ policy: a });
    expect(next).toEqual(first);
    expect(next).not.toBe(first);
    expect(gets("/declarations")).toBe(reads + 1);
  });

  test("in sequence, with no answer held: a retirement the handle saw is in the next read of the ended version", async () => {
    const { a, retire } = await ended();
    const api = (await joinAs(room, "@alice")).api;
    expect(((await api.actsAt({ policy: a })) as ActsCatalogue).acts["tell"]).not.toHaveProperty("retired");
    const dropped = await retire();
    await api.acts();
    expect(((await api.actsAt({ policy: a })) as ActsCatalogue).acts["tell"]!.retired).toBe(dropped);
  });
});
