/**
 * The handle over HTTPS against the fake room: refusals and errors
 * (R-API-1), idempotent retries (R-IDEM), waits (R-API-5), sessions
 * (R-CRED-7), resumable cursors and the watch (R-API-6, R-API-7, R-API-8),
 * the same handle over a service binding, and no credential in any output
 * (R-WS-4).
 *
 * The fake room is a stand-in: these tests show what the client sends,
 * retries and returns. The Room's own rules are tested in packages/room.
 */

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { ArtroomError, HttpRoom, Proposal, Redeemed, Update, WorkspaceGrant } from "@generalbusiness/artroom-contract";
import { artroomError, connect, generateSigner, isArtroomError, isRefusal, redeem, type HttpRoomClient, type Watch } from "../src/index.ts";
import { withRetries } from "../src/room.ts";
import type { FakeRoom } from "./support/fake-room.ts";
import { caught, FAST, idle, joinAs, ok, sha, startRoom, until, type Url } from "./support/setup.ts";

let room: FakeRoom;
let url: Url;
beforeEach(async () => {
  ({ room, url } = await startRoom());
});
afterEach(() => room.stop());

const claimEntries = () => room.entries.filter((e) => e.entry.type === "act" && e.entry.act.envelope.kind === "claim");
const posts = () => room.requests.filter((r) => r.route === "/acts").length;

async function bearer(): Promise<Redeemed> {
  const { invitation, secret } = await room.invite("@builder", { role: "agent", custody: "room" });
  return ok(await redeem({ url }, room.id, { invitation, secret }));
}

describe("refusals are values; failures are exceptions (R-API-1)", () => {
  test("a stale generation is a recorded refusal value with rule, reason, fix and current", async () => {
    const alice = await joinAs(room, "@alice");
    const claim = ok(await alice.api.claim({ goal: "g", scope: ["src/**"] }));
    ok(await alice.api.propose(claim, { head: sha("a") as never, expectedGeneration: 0, summary: "one" }));
    const stale = await alice.api.propose(claim, { head: sha("b") as never, expectedGeneration: 0, summary: "two" });
    expect(isRefusal(stale)).toBe(true);
    if (!isRefusal(stale)) return;
    expect(stale.rule).toBe("generation-moved");
    expect(stale.reason).toMatch(/generation 1/);
    expect(stale.fix).toBeDefined();
    expect(stale.current?.generation).toBe(1);
    // Recorded (R-ADM-8): the refusal names its entry, and explain reads it.
    expect(stale.act).toMatch(/^act_\d+_[0-9a-f]{8}$/);
    const why = await alice.api.explain(stale.act!);
    expect(why?.outcome).toBe("refused");
  });

  test("a key that never joined gets no session: the failure is an ArtroomError, never an Error", async () => {
    const { signer } = await generateSigner();
    const err = await caught(connect({ url }, room.id, { kind: "key", signer }));
    expect(err.code).toBe("unauthenticated");
    expect(err.message).toMatch(/not-member/);
    expect(err instanceof Error).toBe(false);
  });

  test("a missing record reads as null; a missing operation throws not-found", async () => {
    const alice = await joinAs(room, "@alice");
    expect(await alice.api.lane("act_999_00000000")).toBeNull();
    expect(await alice.api.explain("act_999_00000000")).toBeNull();
    expect(await alice.api.proposal({ lane: "act_999_00000000", generation: 1 })).toBeNull();
    const err = await caught(alice.api.op({ id: "op_land_999", kind: "land" }));
    expect(err).toMatchObject({ name: "ArtroomError", code: "not-found", retryable: false });
  });

  test("before anything is sent: a signing key may not connect by name (R-ID-3), and plain http is refused except on this machine", async () => {
    const { signer } = await generateSigner();
    const before = room.requests.length;
    expect((await caught(connect({ url }, "acme/web", { kind: "key", signer }))).code).toBe("bad-request");
    expect((await caught(connect({ url: "http://example.com" as Url }, room.id, { kind: "key", signer }))).code).toBe("bad-request");
    expect(room.requests.length).toBe(before);
  });
});

describe("idempotent retries (R-IDEM-1, R-IDEM-2, R-IDEM-3, R-IDEM-6)", () => {
  test("a lost response is retried with the same bytes, and the room returns the original record", async () => {
    const alice = await joinAs(room, "@alice");
    room.faults.push({ route: "POST /acts", kind: "drop" });
    const claim = ok(await alice.api.claim({ goal: "g", scope: ["src/**"] }));
    // The fake room answers a key it has seen only for the same bytes: other bytes would be idempotency-mismatch.
    expect(claimEntries()).toHaveLength(1);
    expect(claimEntries()[0]!.seq).toBe(claim.seq);
    expect(posts()).toBe(2);
  });

  test("a cut-off response body is treated as lost, and retried", async () => {
    const alice = await joinAs(room, "@alice");
    room.faults.push({ route: "POST /acts", kind: "partial" });
    const claim = ok(await alice.api.claim({ goal: "g", scope: ["src/**"] }));
    expect(claimEntries()).toHaveLength(1);
    expect(claim.lane).toBe(claim.id);
  });

  test("a 503 before admission is retried; nothing is recorded twice", async () => {
    const alice = await joinAs(room, "@alice");
    room.faults.push({ route: "POST /acts", kind: "status", status: 503, body: { name: "ArtroomError", code: "unavailable", message: "busy", retryable: true, retryAfterMs: 1 } });
    ok(await alice.api.claim({ goal: "g", scope: ["src/**"] }));
    expect(claimEntries()).toHaveLength(1);
  });

  test("after the retries run out, the error says how to retry, and that retry returns the original", async () => {
    const alice = await joinAs(room, "@alice");
    room.faults.push({ route: "POST /acts", kind: "drop", times: 4 });
    const err = await caught(alice.api.claim({ goal: "g", scope: ["src/**"] }, { idempotencyKey: "claim-1" }));
    expect(err.code).toBe("unavailable");
    expect(err.maybeRecorded).toBe(true);
    expect(err.message).toContain("claim-1");
    expect(posts()).toBe(4); // the first attempt and three retries
    expect(claimEntries()).toHaveLength(1); // it was recorded on the first attempt
    const again = ok(await alice.api.claim({ goal: "g", scope: ["src/**"] }, { idempotencyKey: "claim-1" }));
    expect(again.seq).toBe(claimEntries()[0]!.seq);
    expect(claimEntries()).toHaveLength(1);
  });

  test("a non-retryable error is thrown at once, without retries", async () => {
    const alice = await joinAs(room, "@alice");
    room.faults.push({ route: "POST /acts", kind: "status", status: 400, body: { name: "ArtroomError", code: "bad-request", message: "no", retryable: false } });
    const err = await caught(alice.api.claim({ goal: "g", scope: ["src/**"] }));
    expect(err.code).toBe("bad-request");
    expect(posts()).toBe(1);
  });

  test("the wait before each retry doubles from 200 ms, and the room's retryAfterMs replaces it", async () => {
    // The waits the client chooses, recorded and not waited: every other test here shortens them to 1 ms.
    const waits: number[] = [];
    const record = (ms: number) => (waits.push(ms), 0);
    const failing = (error: ArtroomError) => () => Promise.reject(error);
    await caught(withRetries(failing(artroomError("unavailable", "down")), 3, "k", record));
    expect(waits).toEqual([200, 400, 800]);
    waits.length = 0;
    await caught(withRetries(failing(artroomError("rate-limited", "slow", { retryAfterMs: 30_000 })), 2, "k", record));
    expect(waits).toEqual([5_000, 5_000]);
  });
});

describe("waits and sessions (R-API-5, R-CRED-7)", () => {
  test("wait throws timeout when the operation does not arrive in time, and the operation is unchanged", async () => {
    room.workspaceDelay = 1_000_000;
    const alice = await joinAs(room, "@alice");
    const claim = ok(await alice.api.claim({ goal: "g", scope: ["src/**"] }));
    const op = ok(await alice.api.workspace(claim));
    const err = await caught(alice.api.wait(op, { until: ["ready"], timeoutMs: 20 }));
    expect(err.code).toBe("timeout");
    expect((await alice.api.op(op)).state).toBe("pending");
  });

  test("an ended session is replaced on the next read", async () => {
    const alice = await joinAs(room, "@alice");
    room.endSessions();
    expect((await alice.api.members()).members.map((m) => m.handle)).toContain("@alice");
  });

  test("the demo loop over HTTPS: join, claim, workspace, propose, review, land, wait", async () => {
    const alice = await joinAs(room, "@alice");
    const bob = await joinAs(room, "@bob");
    expect(alice.api.name).toBe("acme/web");
    const claim = ok(await alice.api.claim({ goal: "Rate-limit login", scope: ["src/api/**"] }));
    const ws = ok(await alice.api.workspace(claim));
    expect((await alice.api.wait(ws, { until: ["ready", "failed"] })).state).toBe("ready");
    ok(await alice.api.workspaceToken(claim));
    const p = ok(await alice.api.propose(claim, { head: sha("a") as never, expectedGeneration: 0, summary: "s" }));
    ok(await bob.api.review(p, { verdict: "approve", scope: ["src/api/**"], text: "ok" }));
    const l = ok(await alice.api.land(claim, p));
    expect((await alice.api.wait(l.op, { until: ["landed", "failed"] })).state).toBe("landed");
  });
});

describe("resumable cursors (R-API-6, R-API-7, R-API-8)", () => {
  async function proposeIn(api: HttpRoom, n: number): Promise<Proposal[]> {
    const out: Proposal[] = [];
    for (let i = 0; i < n; i++) {
      const claim = ok(await api.claim({ goal: `g${i}`, scope: [`dir${i}/**`] }));
      out.push(ok(await api.propose(claim, { head: sha(String(i)) as never, expectedGeneration: 0, summary: "s" })));
    }
    return out;
  }
  const seqsOf = (updates: readonly Update[]) => updates.flatMap((u) => u.entries.map((e) => e.seq));
  const since = (cursor: unknown) => room.entries.filter((e) => e.seq > Number(String(cursor).slice(1).split(".")[0])).map((e) => e.seq);

  test("pages resume exactly after the last item: attention by cursor, the log by `after` and by cursor", async () => {
    const alice = await joinAs(room, "@alice");
    const bob = await joinAs(room, "@bob");
    await proposeIn(alice.api, 3);
    const p1 = await bob.api.attention({ limit: 2 });
    expect(p1.items).toHaveLength(2);
    expect(p1.more).toBe(true);
    const p2 = await bob.api.attention({ cursor: p1.cursor, limit: 2 });
    expect(p2.items).toHaveLength(1);
    expect(p2.more).toBe(false);
    expect(new Set([...p1.items, ...p2.items].map((i) => i.id)).size).toBe(3);
    await proposeIn(alice.api, 1);
    // The last cursor sees only what is new.
    expect((await bob.api.attention({ cursor: p2.cursor })).items.map((i) => i.why)).toEqual(["review-requested"]);
    const first = await alice.api.log({ after: 2, limit: 3 });
    expect(first.acts.map((e) => e.seq)).toEqual([3, 4, 5]);
    expect((await alice.api.log({ cursor: first.cursor, limit: 3 })).acts[0]!.seq).toBe(6);
  });

  test("the long poll returns an empty update after waitMs, then the next update after its cursor, and nothing twice", async () => {
    const alice = await joinAs(room, "@alice");
    const bob = await joinAs(room, "@bob");
    const quiet = await bob.api.subscribe(undefined, { waitMs: 5 });
    expect(quiet.entries).toHaveLength(0);
    const pending = bob.api.subscribe(quiet.cursor, { waitMs: 5_000 });
    await proposeIn(alice.api, 1);
    const next = await pending;
    expect(next.entries.length).toBeGreaterThan(0);
    const again = await bob.api.subscribe(next.cursor, { waitMs: 5 });
    const seen = new Set(next.entries.map((e) => e.seq));
    expect(again.entries.filter((e) => seen.has(e.seq))).toHaveLength(0);
  });

  test("watch reconnects after a dropped socket, and after the room ended its session, and resumes from its cursor: nothing lost, nothing twice", async () => {
    const alice = await joinAs(room, "@alice");
    const bob = await joinAs(room, "@bob");
    const start = (await bob.api.subscribe(undefined, { waitMs: 0 })).cursor;
    const updates: Update[] = [];
    const errors: ArtroomError[] = [];
    const sub = (bob.api as HttpRoomClient).watch(start, (u) => updates.push(u), (e) => errors.push(e));
    await until(() => room.socketCount === 1);
    await proposeIn(alice.api, 1);
    await until(() => seqsOf(updates).length >= 2);
    // A network fault: the session is still good.
    room.dropSockets();
    await proposeIn(alice.api, 1); // happens while the socket is down
    await until(() => seqsOf(updates).length >= 4);
    expect(seqsOf(updates)).toEqual(since(start));
    // The room ends the session too, as a key rotation would: the watch replaces it (R-CRED-7; review f47a509c).
    const sessions = room.exposure.sessions.length;
    room.endSessions();
    room.dropSockets();
    await proposeIn(alice.api, 1);
    await until(() => seqsOf(updates).length >= 6);
    expect(seqsOf(updates)).toEqual(since(start));
    expect(room.exposure.sessions.length).toBeGreaterThan(sessions);
    expect(errors).toEqual([]);
    expect(sub.closed).toBe(false);
    expect(sub.cursor).toBe(updates[updates.length - 1]!.cursor);
    sub.close();
    await until(() => room.socketCount === 0);
    expect(room.socketCount).toBe(0);
  });

  test("a revoked bearer stops the watch with an error, once, and it stops trying (review f47a509c)", async () => {
    const b = await bearer();
    const api = await connect({ url }, room.id, { kind: "bearer", token: b.bearer }, FAST);
    const errors: ArtroomError[] = [];
    const sub = (api as HttpRoomClient).watch(undefined, () => {}, (e) => errors.push(e));
    await until(() => room.socketCount === 1);
    room.revokeDelegation(b.delegation);
    room.dropSockets();
    await until(() => errors.length > 0);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.code).toBe("unauthenticated");
    expect(sub.error?.code).toBe("unauthenticated");
    expect(sub.closed).toBe(true);
    const attempts = room.upgrades;
    await idle();
    expect(room.upgrades).toBe(attempts);
    expect(JSON.stringify(errors)).not.toContain(b.bearer);
  });

  test("closing a watch that is waiting to reconnect stops all further attempts; disposing the handle closes its watches", async () => {
    // The watch asks for its backoff when it starts to wait, so the test knows the moment. It waits 30 ms.
    const waits: number[] = [];
    const alice = await joinAs(room, "@alice", "member", { backoff: (ms) => (waits.push(ms), 30) });
    const sub = alice.api.watch(undefined, () => {}) as Watch;
    await until(() => room.socketCount === 1);
    waits.length = 0;
    const attempts = room.upgrades;
    room.dropSockets();
    await until(() => waits.length === 1);
    expect(waits).toEqual([250]);
    sub.close();
    await idle(60);
    expect(room.upgrades).toBe(attempts);

    const other = alice.api.watch(undefined, () => {}) as Watch;
    await until(() => room.socketCount === 1);
    alice.api[Symbol.dispose]();
    expect(other.closed).toBe(true);
    await until(() => room.socketCount === 0);
    expect(room.socketCount).toBe(0);
  });
});

describe("the same handle over a service binding (RPC)", () => {
  const service = () => ({ room: async () => room.wire() });

  test("acts, refusals, reads and the update stream behave the same over RoomWire", async () => {
    const http = await joinAs(room, "@alice");
    const rpc = await connect(service(), room.id, { kind: "key", signer: http.signer });
    expect(rpc.name).toBe("acme/web");
    const claim = ok(await rpc.claim({ goal: "g", scope: ["src/**"] }));
    const stale = await rpc.propose(claim, { head: sha("a") as never, expectedGeneration: 5, summary: "s" });
    expect(isRefusal(stale) && stale.rule).toBe("generation-moved");
    expect((await http.api.lane(claim.lane))?.state).toBe("held");
    const stream = await rpc.subscribe();
    const reader = stream.getReader();
    const pending = reader.read();
    await rpc.renew(claim);
    const first = await pending;
    expect(first.done).toBe(false);
    reader.releaseLock();
    await stream.cancel();
    rpc[Symbol.dispose]();
  });

  test("a bearer's acts go to bearerAct with because kept, its requests to bearerRequest, and roster is refused before anything is sent (R-CRED-10)", async () => {
    const b = await bearer();
    const rpc = await connect(service(), "acme/web", { kind: "bearer", token: b.bearer });
    expect(rpc.id).toBe(room.id);
    const because = [{ url: "https://example.com/issue/1" as const }];
    const claim = ok(await rpc.claim({ goal: "g", scope: ["src/**"], because }));
    expect(claim.by).toMatchObject({ via: "delegation", member: "@builder", delegation: b.delegation });
    const p = ok(await rpc.propose(claim, { head: sha("a") as never, expectedGeneration: 0, summary: "s", because }));
    const sealed = room.entryById(p.id)!;
    expect(sealed.entry.type === "act" && (sealed.entry.act.envelope.body as { because?: unknown }).because).toEqual(because);
    expect(isRefusal(await rpc.workspace(claim))).toBe(false);
    expect((await caught(rpc.roster({ op: "remove", member: "@admin" }))).code).toBe("forbidden");
  });
});

describe("no credential in any output (R-WS-4)", () => {
  test("tokens appear only in the grant and the join result: not in reads, updates, explain, errors or debug lines", async () => {
    const lines: string[] = [];
    const a = await joinAs(room, "@alice", "member", { log: (l) => lines.push(l) });
    const session = room.exposure.sessions.at(-1)!; // the read session of alice's handle
    const b = await joinAs(room, "@bob");
    const outputs: unknown[] = [];
    const claim = ok(await a.api.claim({ goal: "g", scope: ["src/**"] }));
    const op = ok(await a.api.workspace(claim));
    outputs.push(await a.api.wait({ id: op.id, kind: "workspace" }, { until: ["ready"] }));
    const grant: WorkspaceGrant = ok(await a.api.workspaceToken(claim));
    const p = ok(await a.api.propose(claim, { head: sha("a") as never, expectedGeneration: 0, summary: "s" }));
    outputs.push(p, await b.api.review(p, { verdict: "approve", scope: ["src/**"], text: "ok" }));
    outputs.push(await a.api.log({ limit: 500 }), await a.api.attention(), await b.api.attention(), await a.api.members());
    outputs.push(await a.api.explain(p.id), await a.api.subscribe(undefined, { waitMs: 0 }), await a.api.lanes());
    outputs.push(await a.api.op({ id: op.id, kind: "workspace" }));
    // A room that misbehaves and echoes the handle's tokens in an error message: the client redacts both.
    room.faults.push({ route: "GET /members", kind: "status", status: 500, body: { name: "ArtroomError", code: "internal", message: `failed with ${grant.token} for ${session}`, retryable: false } });
    try {
      await a.api.members();
    } catch (e) {
      expect(isArtroomError(e)).toBe(true);
      outputs.push(e);
    }
    const text = JSON.stringify(outputs) + lines.join("\n");
    expect(room.secrets().length).toBeGreaterThan(3);
    for (const secret of room.secrets()) expect(text).not.toContain(secret);
    expect(text).toContain("failed with [redacted] for [redacted]");
    expect(lines.length).toBeGreaterThan(5);
    for (const line of lines) expect(line).toMatch(/^(GET|POST) \/[a-z/%_0-9A-Z-]* (\d{3}|no response) \d+ms$/);
  });

  test("a bearer the caller already holds is redacted from the first request on, and in every later failure (review f47a509c)", async () => {
    const b = await bearer();
    const echo = { name: "ArtroomError", code: "unauthenticated", message: `bad token ${b.bearer}`, retryable: false };
    room.faults.push({ route: "GET /log", kind: "status", status: 401, body: echo });
    const first = await caught(connect({ url }, room.id, { kind: "bearer", token: b.bearer }));
    expect(first.code).toBe("unauthenticated");
    expect(JSON.stringify(first)).not.toContain(b.bearer);
    expect(first.message).toContain("[redacted]");
    const api = await connect({ url }, room.id, { kind: "bearer", token: b.bearer });
    room.faults.push({ route: "GET /members", kind: "status", status: 401, body: echo });
    expect(JSON.stringify(await caught(api.members()))).not.toContain(b.bearer);
  });
});
