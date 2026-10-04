/**
 * A prepared act and its exact retry (R-IDEM-1, R-IDEM-2, R-DECL-16).
 *
 * A prepared act is the handle's own: the envelope and the prepared act hold
 * copies of the target and body, taken before signing and before
 * `onPrepared`, so nothing the caller does afterwards changes the signed
 * bytes or a bearer's call (review 43e8fe3b). A retry, by `replay` or by
 * repeating a named call with its key, sends what was first built, also
 * after the room's vocabulary changed; changed intent is a new act, which
 * the room refuses under a used key.
 *
 * The fake room runs in its declared mode. It answers a key it has seen only
 * for the same bytes, as the Room does; the Room's own side of this is
 * tested in packages/room.
 */

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { ActDeclaration, Claim, RoomWire } from "@generalbusiness/artroom-contract";
import { CODE_REVIEW_ACTS } from "@generalbusiness/artroom-policy/declared";
import { connect, isRefusal, redeem, verifyValue, type HttpRoomClient, type PreparedAct } from "../src/index.ts";
import { FakeRoom } from "./support/fake-room.ts";
import { caught, FAST, joinAs, startRoom, type Url } from "./support/setup.ts";

let room: FakeRoom;
let url: Url;
beforeEach(async () => {
  ({ room, url } = await startRoom());
});
afterEach(() => room.stop());

const ASK: ActDeclaration = { label: "Ask", targets: { entry: ["comment"] }, body: { text: { type: "text", max: 200 } }, who: { roles: ["member", "agent"] } };
const withAsk = (ask: ActDeclaration = ASK) => ({ ...CODE_REVIEW_ACTS, ask });
const posts = (route: string) => room.requests.filter((r) => r.method === "POST" && r.route === route).length;
const verifies = (p: PreparedAct, key: string) => verifyValue("artroom-envelope-v1", p.signed!.envelope, p.signed!.sig, key as never);
const recorded = (kind: string) => room.entries.filter((e) => e.entry.type === "act" && (e.entry.act.envelope.kind as string) === kind);

describe("a prepared act is the handle's own copy of what the caller intended (R-IDEM-2; review 43e8fe3b)", () => {
  async function ready() {
    const alice = await joinAs(room, "@alice");
    await room.activate(withAsk());
    const api = alice.api as HttpRoomClient;
    const claim = (await api.claim({ goal: "g", scope: ["src/**"] })) as Claim;
    const other = (await api.claim({ goal: "other", scope: ["docs/**"] })) as Claim;
    return { alice, api, claim, other, binding: (await room.bindingOf("ask"))! };
  }


  test("a generic act signed by a key: after the caller changes its body and its target, the kept envelope still verifies and replay returns the original record", async () => {
    const { alice, api, claim, other, binding } = await ready();
    const body = { text: "original" };
    const target = { act: claim.id };
    let kept: PreparedAct | undefined;
    const first = await api.act("ask", target, body, { binding, idempotencyKey: "kept", onPrepared: (p) => void (kept = p) });
    expect(first).toMatchObject({ kind: "ask", text: "original" });
    // The handle leaves the caller's own objects as they were: it neither keeps nor freezes them.
    expect([Object.isFrozen(body), Object.isFrozen(target)]).toEqual([false, false]);
    body.text = "second question";
    target.act = other.id;
    expect(kept).toMatchObject({ kind: "ask", binding, target: { act: claim.id }, body: { text: "original" } });
    expect(kept!.signed!.envelope).toMatchObject({ target: { act: claim.id }, body: { text: "original" } });
    expect(await verifies(kept!, alice.signer.key)).toBe(true);
    const sent = posts("/acts");
    expect(await api.replay(kept!)).toEqual(first);
    expect(posts("/acts")).toBe(sent + 1);
    expect(recorded("ask")).toHaveLength(1);
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
    const seen: { body?: unknown; target?: unknown; binding?: string }[] = [];
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
    // The meaning changes: the replay still carries the binding the act was prepared with, not a newer one.
    await room.activate(withAsk({ ...ASK, body: { text: { type: "text", max: 50 } } }));
    expect(await rpc.replay(generic!)).toEqual(first);
    // Each replay made the same call as its first sending. A named act carries no binding: the room adds it.
    expect(seen.map((a) => [a.target, a.body, a.binding])).toEqual([
      [null, { goal: "g", scope: ["src/**"] }, undefined],
      [null, { goal: "g", scope: ["src/**"] }, undefined],
      [{ act: claim.id }, { text: "q" }, binding],
      [{ act: claim.id }, { text: "q" }, binding],
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

describe("a retry sends what was first built, whatever the room's document is now (R-IDEM-2, R-DECL-16)", () => {
  test("persisted before it was sent, replayed after every response was lost, it returns the original record", async () => {
    const alice = await joinAs(room, "@alice");
    let prepared: PreparedAct | undefined;
    room.faults.push({ route: "POST /acts", kind: "drop", times: 4 });
    await caught((alice.api as HttpRoomClient).claim({ goal: "g", scope: ["src/**"] }, { onPrepared: (p) => void (prepared = JSON.parse(JSON.stringify(p))) }));
    expect(prepared?.signed?.envelope.idempotencyKey).toBe(prepared?.idempotencyKey);
    const restarted = (await connect({ url }, room.id, { kind: "key", signer: alice.signer }, FAST)) as HttpRoomClient;
    const again = await restarted.replay(prepared!);
    const claims = room.entries.filter((e) => e.entry.type === "act" && e.entry.act.envelope.kind === "claim");
    // What the new handle sent is what was kept: the recorded envelope is the prepared one, signature and all.
    expect(claims[0]!.entry.type === "act" && claims[0]!.entry.act).toEqual(prepared!.signed);
    expect(claims).toHaveLength(1);
    expect(isRefusal(again) ? again.rule : again.seq).toBe(claims[0]!.seq);
  });

  test("an act prepared for another room is refused before it is sent", async () => {
    const alice = await joinAs(room, "@alice");
    let prepared: PreparedAct | undefined;
    await (alice.api as HttpRoomClient).renew({ lane: "act_1_00000000", lease: { holder: "@alice", generation: 1, expiresAt: "" } }, { onPrepared: (p) => void (prepared = p) });
    const foreign = { ...prepared!, signed: { ...prepared!.signed!, envelope: { ...prepared!.signed!.envelope, room: "room_ffffffffffffffffffffffffffffffff" as const } } };
    expect((await caught((alice.api as HttpRoomClient).replay(foreign as PreparedAct))).code).toBe("bad-request");
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

  test("a named act repeated with its key on the same handle, after a lost answer and a change of vocabulary, sends the same bytes and gets the original record", async () => {
    const alice = await joinAs(room, "@alice");
    const api = await connect({ url }, room.id, { kind: "key", signer: alice.signer }, { retries: 0 });
    const seen = (await api.claim({ goal: "first", scope: ["docs/**"] })) as Claim;
    // The room records the claim; its answer is lost.
    room.faults.push({ route: "POST /acts", kind: "drop" });
    await caught(api.claim({ goal: "g", scope: ["src/**"] }, { idempotencyKey: "claim-1" }));
    const recorded = room.entries.at(-1)!;
    expect(recorded.entry.type === "act" && recorded.entry.act.envelope).toMatchObject({ v: 1, kind: "claim", idempotencyKey: "claim-1" });
    // The room moves to declared acts, and another named act makes the handle read the vocabulary again.
    await room.activate({ ...CODE_REVIEW_ACTS });
    const stale = await api.note({ act: seen.id }, { text: "n" });
    expect(isRefusal(stale) && stale.rule).toBe("binding-stale");
    // The repeat is the act first built, v: 1, not a new v: 2 act under the same key.
    const again = await api.claim({ goal: "g", scope: ["src/**"] }, { idempotencyKey: "claim-1" });
    expect(isRefusal(again)).toBe(false);
    expect((again as Claim).id).toBe(FakeRoom.idOf(recorded));
    expect(room.entries.filter((e) => e.entry.type === "act" && e.entry.act.envelope.idempotencyKey === "claim-1")).toHaveLength(1);
    // Once answered the act is no longer kept: the same key with the same act is built for the room as it is now, and is the room's to judge.
    const later = await api.claim({ goal: "g", scope: ["src/**"] }, { idempotencyKey: "claim-1" });
    expect(isRefusal(later) && later.rule).toBe("idempotency-mismatch");
  });

  test("only the same act is the kept one: the same key with another body is built anew, and the room refuses it", async () => {
    const alice = await joinAs(room, "@alice");
    const api = await connect({ url }, room.id, { kind: "key", signer: alice.signer }, { retries: 0 });
    room.faults.push({ route: "POST /acts", kind: "drop" });
    await caught(api.claim({ goal: "g", scope: ["src/**"] }, { idempotencyKey: "claim-2" }));
    const other = await api.claim({ goal: "another goal", scope: ["src/**"] }, { idempotencyKey: "claim-2" });
    expect(isRefusal(other) && other.rule).toBe("idempotency-mismatch");
  });
});
