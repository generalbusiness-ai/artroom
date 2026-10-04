/**
 * The two generic MCP tools, `acts` and `act` (request a5d64b35; R-API-9 and
 * R-CRED-10 as amended, docs/protocol.md section 33.10), against the fake
 * room in its declared mode, and the HTTPS bearer client that reaches them.
 * The real Room is tested in packages/room.
 */

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { ActDeclaration, ArtroomError, Claim, DeclaredRecord, Redeemed, RoomApi } from "@generalbusiness/artroom-contract";
import { connect, isArtroomError, isRefusal, redeem, type HttpRoomClient } from "@generalbusiness/artroom-client";
import { CODE_REVIEW_ACTS } from "@generalbusiness/artroom-policy/declared";
import { callTool, errorResult } from "../src/index.ts";
import { roomWithMcp, rpc, type FakeRoom, type Url } from "./support.ts";

let room: FakeRoom;
let url: Url;
beforeEach(async () => {
  ({ room, url } = await roomWithMcp());
});
afterEach(() => room.stop());

const ASK: ActDeclaration = { label: "Ask", targets: { entry: ["comment"] }, body: { text: { type: "text", max: 200 } }, who: { roles: ["member", "agent"] } };
const withAsk = (ask: ActDeclaration = ASK) => ({ ...CODE_REVIEW_ACTS, ask });
const first = (res: { content: { text: string }[] }) => res.content[0]!.text.split("\n")[0]!;

async function agent(acts: Record<string, string>): Promise<Redeemed> {
  const { invitation, secret } = await room.invite("@agent", { role: "agent", custody: "room", kinds: [], acts });
  const out = await redeem({ url }, room.id, { invitation, secret });
  if (isRefusal(out)) throw new Error(out.rule);
  return out;
}
const tool = async (b: Redeemed, name: string, args: unknown) => (await rpc(b.mcp, b.bearer, "tools/call", { name, arguments: args })).body.result;

describe("acts: the declarations an agent reads before it acts", () => {
  test("a v1 room: the legacy catalogue, and text that says to use the named tools", async () => {
    const { invitation, secret } = await room.invite("@agent", { role: "agent", custody: "room" });
    const b = (await redeem({ url }, room.id, { invitation, secret })) as Redeemed;
    const res = await tool(b, "acts", {});
    expect(res.isError).toBe(false);
    expect(res.structuredContent).toMatchObject({ vocabulary: "artroom-legacy-v1", until: null });
    expect(first(res)).toMatch(/^Policy version act_0_[0-9a-f]{8} is the legacy vocabulary: use the named tools\.$/);
  });

  test("a v2 room: every declared kind with its binding; at and policy read an earlier version; an unknown one is not-found; both is an error", async () => {
    await room.activate(withAsk());
    const b = await agent({ ask: (await room.bindingOf("ask"))! });
    const res = await tool(b, "acts", {});
    expect(res.structuredContent).toEqual(await room.catalogue({}));
    expect(first(res)).toMatch(/declares 8 acts: claim \(Claim\), .*ask \(Ask\)\.$/);
    const since = res.structuredContent.since as number;
    await room.activate({ ...CODE_REVIEW_ACTS });
    const then = await tool(b, "acts", { at: since });
    expect(then.structuredContent.acts.ask).toMatchObject({ binding: res.structuredContent.acts.ask.binding, retired: expect.any(Number) });
    expect(first(then)).toMatch(/ask \(Ask, retired at seq \d+\)/);
    expect((await tool(b, "acts", { policy: res.structuredContent.policy })).structuredContent).toEqual(then.structuredContent);
    const none = await tool(b, "acts", { policy: "act_999_00000000" });
    expect(none.structuredContent).toEqual({ outcome: "not-found" });
    expect(first(none)).toBe("The room retains no such policy version.");
    const both = await tool(b, "acts", { at: since, policy: res.structuredContent.policy });
    expect(both.isError).toBe(true);
    expect(both.structuredContent).toMatchObject({ code: "bad-request" });
  });
});

describe("acts on a long-lived server: an earlier version is read from the room each time", () => {
  test("a kind retired after the server first read its version is shown retired on the next call, with nothing else read in between", async () => {
    const first = await room.activate(withAsk());
    await room.activate({ ...withAsk(), tell: ASK });
    const b = await agent({});
    // One handle for the life of the server, as the stdio server has.
    const handle = await connect({ url }, room.id, { kind: "bearer", token: b.bearer });
    const before = await callTool(handle, "acts", { policy: first });
    expect(before.structuredContent!["until"]).not.toBeNull();
    expect((before.structuredContent!["acts"] as Record<string, object>)["ask"]).not.toHaveProperty("retired");
    await room.activate({ ...CODE_REVIEW_ACTS });
    const dropped = room.entries.at(-1)!.seq;
    const after = await callTool(handle, "acts", { policy: first });
    expect((after.structuredContent!["acts"] as Record<string, object>)["ask"]).toMatchObject({ retired: dropped });
    const bySeq = await callTool(handle, "acts", { at: before.structuredContent!["since"] as number });
    expect(bySeq.structuredContent).toEqual(after.structuredContent);
  });
});

describe("act: any declared act, with the binding the agent read", () => {
  test("it passes kind, target, body, binding and key to the room unchanged; a retry with the same key is the same record", async () => {
    await room.activate(withAsk());
    const binding = (await room.bindingOf("ask"))!;
    const b = await agent({ ask: binding, claim: (await room.bindingOf("claim"))! });
    const claim = (await tool(b, "claim", { goal: "g", scope: ["src/**"] })).structuredContent as Claim;
    const args = { kind: "ask", target: { act: claim.id }, body: { text: "which?" }, binding, idempotencyKey: "m1" };
    const res = await tool(b, "act", args);
    expect(res.isError).toBe(false);
    expect(res.structuredContent).toMatchObject({ kind: "ask", text: "which?", by: { via: "delegation", member: "@agent" } });
    expect(first(res)).toMatch(/^Done: act_\d+_[0-9a-f]{8}\.$/);
    const sealed = room.entries.at(-1)!.entry;
    expect(sealed.type === "act" && sealed.act.envelope).toMatchObject({ v: 2, kind: "ask", binding, idempotencyKey: "m1" });
    const entries = room.entries.length;
    expect((await tool(b, "act", args)).structuredContent).toEqual(res.structuredContent);
    expect(room.entries.length).toBe(entries);
  });

  test("a stale binding is a refusal whose text names the active binding and says nothing was done; the tool does not act again", async () => {
    await room.activate(withAsk());
    const read = (await room.bindingOf("ask"))!;
    const b = await agent({ ask: read });
    await room.activate(withAsk({ ...ASK, body: { text: { type: "text", max: 50 } } }));
    const now = (await room.bindingOf("ask"))!;
    const entries = room.entries.length;
    const calls = room.requests.filter((r) => r.route === "/mcp").length;
    const res = await tool(b, "act", { kind: "ask", target: null, body: { text: "x" }, binding: read, idempotencyKey: "m2" });
    expect(res.isError).toBe(false);
    expect(res.structuredContent).toMatchObject({ refused: true, rule: "binding-stale", current: { binding: now, policy: room.policies.at(-1)!.policy } });
    expect(first(res)).toContain(`The active binding is ${now}, in policy version ${room.policies.at(-1)!.policy}. Nothing was done. Call acts and read the declaration before you act again.`);
    expect(room.entries.length).toBe(entries);
    expect(room.requests.filter((r) => r.route === "/mcp").length).toBe(calls + 1);
    // Another refusal keeps its plain text: the grant does not name this kind, which authority judges first.
    const other = await tool(b, "act", { kind: "shout", target: null, body: {}, binding: read, idempotencyKey: "m3" });
    expect(first(other)).toMatch(/^Refused \(delegation-invalid\)/);
    expect(first(other)).not.toContain("The active binding is");
  });

  test("the schema refuses a call without a binding or a key before the room is asked; a platform kind is a tool error", async () => {
    await room.activate(withAsk());
    const binding = (await room.bindingOf("ask"))!;
    const b = await agent({ ask: binding });
    const entries = room.entries.length;
    const noBinding = await tool(b, "act", { kind: "ask", target: null, body: { text: "x" }, idempotencyKey: "m4" });
    expect(noBinding.isError).toBe(true);
    expect(noBinding.content[0].text).toContain("input.binding: is required");
    const noKey = await tool(b, "act", { kind: "ask", target: null, body: { text: "x" }, binding });
    expect(noKey.content[0].text).toContain("input.idempotencyKey: is required");
    for (const kind of ["renew", "roster", "recover"]) {
      const res = await tool(b, "act", { kind, target: null, body: {}, binding, idempotencyKey: `m-${kind}` });
      expect(res.isError, kind).toBe(true);
      expect(res.structuredContent).toMatchObject({ name: "ArtroomError", code: "bad-request" });
      expect(res.structuredContent.message).toContain("platform kind");
    }
    expect(room.entries.length).toBe(entries);
  });
});

describe("act: a thread it opened is named as every reader names it", () => {
  const SONG: ActDeclaration = { label: "Start a song", targets: { none: ["open"] }, body: { key: { type: "enum", values: ["c", "d"], optional: true }, title: { type: "text", max: 80 }, year: { type: "text", max: 4, optional: true } }, who: { roles: ["member", "agent"] }, hold: { scope: "body.scope", workspace: true } };

  test("by its goal; with no goal, by the act's label at its own seq and its first text field by name; by its ID alone if the declarations cannot be read", async () => {
    await room.activate({ ...CODE_REVIEW_ACTS, "start-song": SONG });
    const binding = (await room.bindingOf("start-song"))!;
    const b = await agent({ "start-song": binding, claim: (await room.bindingOf("claim"))!, note: (await room.bindingOf("note"))! });
    const song = await tool(b, "act", { kind: "start-song", target: null, body: { year: "1963", title: "Blue Bossa", scope: ["songs/blue-bossa/**"] }, binding, idempotencyKey: "s1" });
    const id = song.structuredContent.id as string;
    expect(first(song)).toBe(`Done: ${id}. It opened thread ${id}: Start a song: Blue Bossa.`);
    // `key` comes first by name, but it is an enum: the thread is named by its first text field, the title.
    const keyed = await tool(b, "act", { kind: "start-song", target: null, body: { key: "d", title: "So What", scope: ["songs/so-what/**"] }, binding, idempotencyKey: "s3" });
    expect(first(keyed)).toBe(`Done: ${String(keyed.structuredContent.id)}. It opened thread ${String(keyed.structuredContent.id)}: Start a song: So What.`);
    const claim = await tool(b, "act", { kind: "claim", target: null, body: { goal: "Rate-limit login", scope: ["src/**"] }, binding: (await room.bindingOf("claim"))!, idempotencyKey: "c1" });
    expect(first(claim)).toBe(`Done: ${claim.structuredContent.id}. It opened thread ${claim.structuredContent.id}: Rate-limit login.`);
    const note = await tool(b, "act", { kind: "note", target: { act: id }, body: { text: "Nice" }, binding: (await room.bindingOf("note"))!, idempotencyKey: "n1" });
    expect(first(note)).toBe(`Done: ${note.structuredContent.id}.`);

    // The act is recorded even if the words for its thread cannot be read: the result is the record, and the thread is named by its ID.
    const alice = await connect({ url }, room.id, { kind: "bearer", token: b.bearer });
    const blind = {
      act: (...a: Parameters<RoomApi["act"]>) => alice.act(...a),
      actsAt: async () => {
        throw new Error("unreachable");
      },
    } as unknown as RoomApi;
    const dark = await callTool(blind, "act", { kind: "start-song", target: null, body: { title: "Footprints", scope: ["songs/footprints/**"] }, binding, idempotencyKey: "s2" });
    expect(dark.isError).toBe(false);
    expect(first(dark)).toBe(`Done: ${String(dark.structuredContent!["id"])}. It opened thread ${String(dark.structuredContent!["id"])}.`);
    // With a goal there is nothing to read.
    const lit = await callTool(blind, "act", { kind: "claim", target: null, body: { goal: "g", scope: ["docs/**"] }, binding: (await room.bindingOf("claim"))!, idempotencyKey: "c2" });
    expect(first(lit)).toMatch(/It opened thread act_\d+_[0-9a-f]{8}: g\.$/);
  });
});

describe("the HTTPS bearer client (R-CRED-10 as amended)", () => {
  test("its generic act is one call of the act tool; its fixed check and roster methods stay forbidden and send nothing", async () => {
    await room.activate(withAsk());
    const binding = (await room.bindingOf("ask"))!;
    const b = await agent({ ask: binding, claim: (await room.bindingOf("claim"))! });
    const api = await connect({ url }, room.id, { kind: "bearer", token: b.bearer });
    const claim = (await api.claim({ goal: "g", scope: ["src/**"] })) as Claim;
    const acts = room.requests.filter((r) => r.method === "POST" && r.route === "/acts").length;
    const mcp = room.requests.filter((r) => r.route === "/mcp").length;
    const out = (await api.act("ask", { act: claim.id }, { text: "q" }, { binding, idempotencyKey: "h1" })) as DeclaredRecord;
    expect(out).toMatchObject({ kind: "ask", by: { via: "delegation", member: "@agent" } });
    expect(room.requests.filter((r) => r.route === "/mcp").length).toBe(mcp + 1);
    expect(room.requests.filter((r) => r.method === "POST" && r.route === "/acts").length).toBe(acts);
    const sent = room.requests.length;
    const fails = async (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (isArtroomError(e) ? e : null));
    expect((await fails(api.check({ lane: claim.lane, generation: 1 }, {} as never)))?.code).toBe("forbidden");
    expect((await fails(api.roster({ op: "remove", member: "@admin" })))?.code).toBe("forbidden");
    expect(room.requests.length).toBe(sent);
    // A prepared act of a kind with no named tool and no binding is refused here: it is never sent to the act tool without one.
    const unbound = await fails((api as HttpRoomClient).replay({ kind: "ask" as never, target: { act: claim.id }, body: { text: "q" }, idempotencyKey: "h2" }));
    expect(unbound).toMatchObject({ code: "bad-request", message: expect.stringContaining("There is no named tool for ask") });
    expect(room.requests.length).toBe(sent);
  });
});

describe("tool results", () => {
  test("a tool error is a plain object, also when the failure was thrown as an Error instance", () => {
    const thrown = Object.assign(new Error("envelope.v must be 1."), { name: "ArtroomError", code: "bad-request", retryable: false }) as unknown as ArtroomError;
    const res = errorResult(thrown);
    expect(Object.getPrototypeOf(res.structuredContent)).toBe(Object.prototype);
    expect(res.structuredContent).toEqual({ name: "ArtroomError", code: "bad-request", message: "envelope.v must be 1.", retryable: false });
    expect(res.content[0]!.text).toContain("Error (bad-request): envelope.v must be 1.");
    expect(errorResult({ name: "ArtroomError", code: "timeout", message: "late", retryable: true, maybeRecorded: true, retryAfterMs: 50 }).structuredContent).toEqual({
      name: "ArtroomError",
      code: "timeout",
      message: "late",
      retryable: true,
      retryAfterMs: 50,
      maybeRecorded: true,
    });
  });

  test("explain's text names the label the kind had at the record's own seq, and where it was retired", async () => {
    const meaning = { vocabulary: "declared", policy: "act_3_aaaaaaaa", kind: "ask", label: "Ask", declaration: ASK, binding: `sha256:${"b".repeat(64)}`, retired: 9 };
    const explanation = { act: "act_7_0a1b2c3d", kind: "ask", outcome: "accepted", entry: { seq: 7 }, decisions: [], invariants: [], published: true };
    const stub = (m?: unknown) => ({ explain: async () => ({ ...explanation, ...(m ? { meaning: m } : {}) }) }) as unknown as RoomApi;
    expect(first(await callTool(stub(meaning), "explain", { act: "act_7_0a1b2c3d" }))).toBe("act_7_0a1b2c3d: Ask (ask), retired at seq 9, accepted.");
    expect(first(await callTool(stub({ ...meaning, retired: undefined }), "explain", { act: "act_7_0a1b2c3d" }))).toBe("act_7_0a1b2c3d: Ask (ask), accepted.");
    expect(first(await callTool(stub(), "explain", { act: "act_7_0a1b2c3d" }))).toBe("act_7_0a1b2c3d: ask, accepted.");
    expect((await callTool(stub(meaning), "explain", { act: "act_7_0a1b2c3d" })).structuredContent).toMatchObject({ meaning });
  });
});
