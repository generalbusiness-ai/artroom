/**
 * The log (R-LOG), notify after commit (R-LOG-13, R-POL-5), publication
 * (R-LOG-8, R-LOG-9, R-LOG-11), and reads, cursors and subscriptions
 * (R-API-5 to R-API-8).
 */

import { describe, expect, it } from "vitest";
import { exports } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import type { Room } from "../../src/index.ts";
import type { Claim, Explanation, LogEntry, Note, PolicyDocument, Sha, SystemEvent, Update } from "@generalbusiness/artroom-contract";
import { policy, rule } from "@generalbusiness/artroom-policy/helpers";
import { digestJson } from "../../src/crypto.ts";
import { verifyLog, type GitReader } from "@generalbusiness/artroom-log";
import { artifactsErrors } from "../../src/memory/artifacts.ts";
import { addMember, advance, call, expectOk, makeRoom, tick, type TestRoom } from "./support.ts";

const notifying = (): PolicyDocument =>
  policy(rule({ id: "new-lanes", kind: "notify", on: ["claim"], to: ["role:admin"], why: "A new lane was opened." }));

async function entries(room: TestRoom): Promise<LogEntry[]> {
  return [...(await room.admin.read({ q: "log", req: { limit: 500 } })).acts];
}

const idOf = (e: LogEntry) => `act_${e.seq}_${e.hash.slice(7, 15)}`;

describe("section 23, Log construction (R-LOG-2, R-LOG-8, R-LOG-12, R-LOG-13)", () => {
  it("a new claim, its notified event, and the first two publications, in the order of the worked example; both commits verify", async () => {
    const room = await makeRoom({ policy: notifying() });
    // Steps 1 to 3: genesis, the initial policy, the claim.
    const claim = expectOk(await room.admin.act<Claim>("claim", null, { goal: "g", scope: ["src/**"] }));
    let log = await entries(room);
    expect(log.map((e) => e.seq)).toEqual([0, 1, 2]);
    const receipt = (log[2]!.entry as unknown as { receipt: { effects: { type: string }[]; decisions: unknown[] } }).receipt;
    expect(receipt.effects[0]).not.toHaveProperty("lane"); // R-LOG-12
    expect(receipt.decisions).toEqual([]); // notify is never in the receipt (R-POL-5)
    // Step 4: the lane ID is derived from h(2).
    expect(claim.lane).toBe(idOf(log[2]!));
    // Steps 5 and 6: notify runs after the commit; its outcome is entry 3.
    await tick(room);
    log = await entries(room);
    const notified = log[3]!.entry as unknown as { type: "system"; event: Extract<SystemEvent, { type: "notified" }> };
    expect(notified.event.type).toBe("notified");
    expect(notified.event.entry).toBe(claim.lane);
    expect(notified.event.to).toEqual(["@admin"]);
    expect(notified.event.decisions[0]).toMatchObject({ rule: "new-lanes", kind: "notify", outcome: { result: "notify", to: ["@admin"] } });
    expect(notified.event.decisions[0]!.stamp).toEqual({ profile: "artroom-jsonata-v1", jsonata: "2.2.2", accounting: "artroom-act-budget-v1" });
    // Steps 7 to 9: the first publication, then the checkpoint event naming it.
    const p1 = (await call<{ through: number; commit: Sha }>(room.stub.publishLog()))!;
    expect(p1.through).toBe(3);
    log = await entries(room);
    expect(log[4]!.entry).toEqual({ type: "system", event: { type: "checkpoint", through: 3, hash: log[3]!.hash, commit: p1.commit } });
    const page = await room.admin.read({ q: "log" });
    expect(page.publishedThrough).toBe(3);
    expect(page.head).toBe(4);
    // Step 10: more entries.
    for (let i = 0; i < 5; i++) await room.admin.ok<Note>("note", { act: claim.id }, { text: `note ${i}` });
    // Steps 11 to 13: the second publication; its parent is the first.
    const p2 = (await call<{ through: number; commit: Sha }>(room.stub.publishLog()))!;
    expect(p2.through).toBe(9);
    const c1 = await room.world.log.files(p1.commit);
    const c2 = await room.world.log.files(p2.commit);
    expect(room.world.artifacts.parents(p2.commit)).toEqual([p1.commit]);
    expect(room.world.log.ref).toBe(p2.commit);
    const seg1 = c1.get("artroom-log/v1/segments/000000000000.jsonl")!.split("\n");
    const seg2 = c2.get("artroom-log/v1/segments/000000000000.jsonl")!.split("\n");
    expect(seg1.length).toBe(4);
    expect(seg2.length).toBe(10);
    expect(seg2.slice(0, 4)).toEqual(seg1);
    // `artroom verify` (lane L's verifyLog, with policy replay, R-LOG-10) accepts the log at each commit.
    const repo = room.world.artifacts.canonicalRepo();
    const at = (ref: Sha): GitReader => ({ readObject: (sha) => repo.readObject(sha), readRef: async () => ref });
    const v1 = await verifyLog(at(p1.commit));
    expect(v1).toMatchObject({ ok: true, failures: [], verifiedThrough: 3, publishedThrough: 3 });
    const v2 = await verifyLog(at(p2.commit));
    expect(v2).toMatchObject({ ok: true, failures: [], verifiedThrough: 9, publishedThrough: 9, commits: 2 });
    expect(v2.decisionsReplayed).toBeGreaterThan(0);
    // A tampered entry fails verification.
    const files = Object.fromEntries(c2);
    files["artroom-log/v1/segments/000000000000.jsonl"] = seg2.map((l: string, i: number) => (i === 5 ? l.replace("note 0", "note X") : l)).join("\n");
    const tampered = room.world.log.write(files, p1.commit);
    for (const o of room.world.artifacts.closure(tampered)) repo.objects.add(o);
    expect((await verifyLog(at(tampered))).ok).toBe(false);
    expect((await room.admin.read({ q: "log" })).publishedThrough).toBe(9);
  });

  it("R-LOG-7, R-EVAL-8: every decision's replay context is retained and published under its digest", async () => {
    const room = await makeRoom({ policy: notifying() });
    await room.admin.ok("claim", null, { goal: "g", scope: ["src/**"] });
    await tick(room);
    const p = (await call<{ commit: Sha }>(room.stub.publishLog()))!;
    const files = Object.fromEntries(await room.world.log.files(p.commit));
    const log = await entries(room);
    const decision = (log[3]!.entry as unknown as { event: { decisions: { input: string }[] } }).event.decisions[0]!;
    const ctx = files[`artroom-log/v1/inputs/${decision.input.slice(7)}.json`];
    expect(ctx).toBeDefined();
    const parsed = JSON.parse(ctx!) as { kind: string; directory: unknown };
    expect(parsed.kind).toBe("notify");
    expect(digestJson(parsed)).toBe(decision.input);
    // The active policy document is retained by its digest (R-POL-12).
    const activated = (log[1]!.entry as unknown as { event: { policy: string } }).event;
    expect(files[`artroom-log/v1/policies/${activated.policy.slice(7)}.json`]).toBeDefined();
  });

  it("section 23, A notify rule hits a runtime failure (R-LOG-13): the claim stays recorded; a notified entry is sealed after a retry", async () => {
    const room = await makeRoom({ policy: notifying() });
    room.world.policy.failures.notify = 1;
    const claim = expectOk(await room.admin.act<Claim>("claim", null, { goal: "g", scope: ["src/**"] }));
    await tick(room);
    let log = await entries(room);
    expect(log.length).toBe(3);
    expect(idOf(log[2]!)).toBe(claim.id);
    expect(room.world.policy.calls.notify).toBe(1);
    advance(5_000);
    await tick(room);
    log = await entries(room);
    expect(log.length).toBe(4);
    expect((log[3]!.entry as unknown as { event: { type: string; entry: string } }).event).toMatchObject({ type: "notified", entry: claim.id });
    expect(room.world.policy.calls.notify).toBe(2);
    // The claim entry is unchanged by the later notification.
    expect(log[2]).toEqual((await entries(room))[2]);
  });

  it("R-POL-5: a notified member sees the item in attention with the rule's why", async () => {
    const room = await makeRoom({ policy: notifying() });
    const bob = await addMember(room, "@bob", "member");
    await bob.ok("claim", null, { goal: "g", scope: ["src/**"] });
    await tick(room);
    const items = (await room.admin.read({ q: "attention" })).items;
    expect(items.find((i) => i.why === "policy")).toMatchObject({ rule: "new-lanes", text: "A new lane was opened." });
  });
});

describe("R-API reads, cursors and explain", () => {
  it("R-API-6, R-API-7: log pages ascend, always carry a cursor, and resume exactly after the last item", async () => {
    const room = await makeRoom();
    for (let i = 0; i < 7; i++) await room.admin.ok("claim", null, { goal: `g${i}`, scope: [`src/m${i}/**`] });
    const token = await room.admin.session();
    const first = await call<{ acts: LogEntry[]; cursor: string; more: boolean }>(room.stub.read(token, { q: "log", req: { limit: 4 } }));
    expect(first.acts.map((e) => e.seq)).toEqual([0, 1, 2, 3]);
    expect(first.more).toBe(true);
    const second = await call<{ acts: LogEntry[]; cursor: string; more: boolean }>(room.stub.read(token, { q: "log", req: { cursor: first.cursor as never, limit: 100 } }));
    expect(second.acts[0]!.seq).toBe(4);
    expect(second.more).toBe(false);
    expect(second.cursor).toBeTruthy();
    const empty = await call<{ acts: LogEntry[]; cursor: string; more: boolean }>(room.stub.read(token, { q: "log", req: { cursor: second.cursor as never } }));
    expect(empty.acts).toEqual([]);
    expect((await call<{ acts: LogEntry[] }>(room.stub.read(token, { q: "log", req: { after: 7 } }))).acts.map((e) => e.seq)).toEqual([8]);
    const lanes = await call<{ items: unknown[]; cursor: string; more: boolean }>(room.stub.read(token, { q: "lanes", filter: { limit: 5 } }));
    expect(lanes.items.length).toBe(5);
    expect(lanes.more).toBe(true);
    const rest = await call<{ items: unknown[] }>(room.stub.read(token, { q: "lanes", filter: { cursor: lanes.cursor as never } }));
    expect(rest.items.length).toBe(2);
  });

  it("explain shows the entry, its decisions, the platform invariants and whether it is published", async () => {
    const room = await makeRoom();
    const bob = await addMember(room, "@bob", "member");
    const claim = expectOk(await bob.act<Claim>("claim", null, { goal: "g", scope: ["src/**"] }));
    const ex = (await room.admin.read({ q: "explain", act: claim.id })) as Explanation;
    expect(ex).toMatchObject({ act: claim.id, kind: "claim", outcome: "accepted", published: false });
    expect(ex.invariants).toContainEqual({ rule: "R-ADM-3", held: true, detail: "authority by case member" });
    const refused = await bob.act("renew", { lane: claim.lane }, { lease: 9 });
    const ex2 = (await room.admin.read({ q: "explain", act: (refused as { act: string }).act as never })) as Explanation;
    expect(ex2.outcome).toBe("refused");
    expect(ex2.invariants.some((i) => i.held === false)).toBe(true);
  });

  it("R-API-5: wait times out with timeout when the operation does not reach the state", async () => {
    const room = await makeRoom();
    const c = expectOk(await room.admin.act<Claim>("claim", null, { goal: "g", scope: ["src/**"] }));
    const ws = expectOk(await room.admin.request<{ id: string }>({ kind: "workspace", lane: c.lane, lease: 1 }));
    room.world.artifacts.failRemote("fork", artifactsErrors.notFound());
    const token = await room.admin.session();
    const w = (await room.stub.read(token, { q: "op", op: ws.id as never, until: ["failed"], timeoutMs: 1000 })) as { ok?: { state: string }; error?: { code: string } };
    // The workspace either already failed (the deferred open ran) or the wait times out; both are allowed outcomes of a wait.
    if (w.error) expect(w.error.code).toBe("timeout");
    else expect(w.ok!.state).toBe("failed");
    const w2 = (await room.stub.read(token, { q: "op", op: ws.id as never, until: ["never-a-state"], timeoutMs: 50 })) as { error?: { code: string } };
    expect(w2.error?.code).toBe("timeout");
  });
});

describe("R-API-8 live updates", () => {
  it("HTTPS long poll: an empty update after waitMs; a new entry wakes it; R-LOG-11 states publishedThrough", async () => {
    const room = await makeRoom();
    const token = await room.admin.session();
    const empty = await call<Update>(room.stub.poll(token, undefined, 10));
    expect(empty.entries).toEqual([]);
    expect(empty.publishedThrough).toBe(-1);
    const waiting = call<Update>(room.stub.poll(token, empty.cursor, 5_000));
    await room.admin.ok("claim", null, { goal: "g", scope: ["src/**"] });
    const u = await waiting;
    expect(u.entries.map((e) => e.kind)).toEqual(["claim"]);
    expect(u.entries[0]!.lane).toBe(u.entries[0]!.id);
    const res = await exports.default.fetch(`https://artroom.test/v1/rooms/${room.id}/subscribe?cursor=${encodeURIComponent(u.cursor)}&waitMs=0`, { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as Update).entries).toEqual([]);
  });

  it("RPC subscribe: a stream of updates as newline-delimited JSON", async () => {
    const room = await makeRoom();
    const token = await room.admin.session();
    const stream = (await room.stub.subscribe(token)) as ReadableStream<Uint8Array>;
    const reader = stream.getReader();
    await room.admin.ok("claim", null, { goal: "g", scope: ["src/**"] });
    const { value } = await reader.read();
    const line = new TextDecoder().decode(value).trim().split("\n")[0]!;
    const u = JSON.parse(line) as Update;
    expect(u.entries.map((e) => e.kind)).toEqual(["claim"]);
    await reader.cancel();
  });

  it("section 23, WebSocket (R-API-12): token as a subprotocol, judged before the upgrade; 101 with artroom.v1 only; 401 without a token; 1008 after revocation", async () => {
    const room = await makeRoom();
    const bob = await addMember(room, "@bob", "member");
    const token = await bob.session();
    const url = `https://artroom.test/v1/rooms/${room.id}/ws`;
    const none = await exports.default.fetch(url, { headers: { Upgrade: "websocket", "Sec-WebSocket-Protocol": "artroom.v1" } });
    expect(none.status).toBe(401);
    expect(none.webSocket).toBeNull();
    const badToken = await exports.default.fetch(url, { headers: { Upgrade: "websocket", "Sec-WebSocket-Protocol": "artroom.v1, artroom.token.ses_nope" } });
    expect(badToken.status).toBe(401);
    expect(JSON.stringify(await badToken.json())).not.toContain("ses_nope");
    const res = await exports.default.fetch(url, { headers: { Upgrade: "websocket", "Sec-WebSocket-Protocol": `artroom.v1, artroom.token.${token}` } });
    expect(res.status).toBe(101);
    expect(res.headers.get("Sec-WebSocket-Protocol")).toBe("artroom.v1");
    const ws = res.webSocket!;
    ws.accept();
    const closed = new Promise<number>((resolve) => ws.addEventListener("close", (e: CloseEvent) => resolve(e.code)));
    const next = () => new Promise<Update>((resolve) => ws.addEventListener("message", (m: MessageEvent) => resolve(JSON.parse(m.data as string) as Update), { once: true }));
    const first = next();
    ws.send("ignored by the room");
    await room.admin.ok("claim", null, { goal: "g", scope: ["src/**"] });
    expect((await first).entries.map((e) => e.kind)).toContain("claim");
    // The socket keeps only the token's hash.
    const kept = await runInDurableObject(room.stub as unknown as DurableObjectStub<Room>, (_r: Room, state: DurableObjectState) => JSON.stringify(state.getWebSockets().map((w) => w.deserializeAttachment())));
    expect(kept).not.toContain(token);
    await room.admin.ok("roster", null, { op: "revoke-key", key: bob.key, reason: "retired" });
    expect(await closed).toBe(1008);
  });

  it("R-API-12: ?cursor= resumes from that cursor", async () => {
    const room = await makeRoom();
    const token = await room.admin.session();
    const start = await call<Update>(room.stub.poll(token, undefined, 0));
    await room.admin.ok("claim", null, { goal: "g", scope: ["src/**"] });
    const res = await exports.default.fetch(`https://artroom.test/v1/rooms/${room.id}/ws?cursor=${encodeURIComponent(start.cursor)}`, {
      headers: { Upgrade: "websocket", "Sec-WebSocket-Protocol": `artroom.v1, artroom.token.${token}` },
    });
    expect(res.status).toBe(101);
    const ws = res.webSocket!;
    const got = new Promise<Update>((resolve) => ws.addEventListener("message", (m: MessageEvent) => resolve(JSON.parse(m.data as string) as Update), { once: true }));
    ws.accept();
    expect((await got).entries.map((e) => e.kind)).toEqual(["claim"]);
    ws.close();
  });

  it("attention pages carry a cursor and resume", async () => {
    const room = await makeRoom({ policy: notifying() });
    for (let i = 0; i < 3; i++) await room.admin.ok("claim", null, { goal: `g${i}`, scope: [`src/m${i}/**`] });
    await tick(room);
    const token = await room.admin.session();
    const p1 = await call<{ items: { seq: number }[]; cursor: string; more: boolean }>(room.stub.read(token, { q: "attention", page: { limit: 2 } }));
    expect(p1.items.length).toBe(2);
    expect(p1.more).toBe(true);
    const p2 = await call<{ items: { seq: number }[]; more: boolean }>(room.stub.read(token, { q: "attention", page: { cursor: p1.cursor as never } }));
    expect(p2.items.length).toBe(1);
    expect(p2.items[0]!.seq).toBeGreaterThan(p1.items[1]!.seq);
  });
});
