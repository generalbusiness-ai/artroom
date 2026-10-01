/**
 * The handle over HTTPS against the fake room: refusals and errors
 * (R-API-1), idempotent retries (R-IDEM), waits (R-API-5), sessions
 * (R-CRED-7) and resumable cursors (R-API-6, R-API-7, R-API-8).
 */

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { ArtroomError, HttpRoom, Proposal, Refusal, Update } from "@generalbusiness/artroom-contract";
import { connect, generateSigner, isArtroomError, isRefusal } from "../src/index.ts";
import { FakeRoom } from "./support/fake-room.ts";
import { joinAs, sha, startRoom, type Url } from "./support/setup.ts";

let room: FakeRoom;
let url: Url;
beforeEach(async () => {
  ({ room, url } = await startRoom());
});
afterEach(() => room.stop());

function ok<T>(value: T): Exclude<T, Refusal> {
  if (isRefusal(value)) throw new Error(`refused: ${value.rule}: ${value.reason}`);
  return value as Exclude<T, Refusal>;
}

async function caught(p: Promise<unknown>): Promise<ArtroomError> {
  try {
    await p;
  } catch (e) {
    if (isArtroomError(e)) return e;
    throw e;
  }
  throw new Error("expected an ArtroomError");
}

const claimEntries = () => room.entries.filter((e) => e.entry.type === "act" && e.entry.act.envelope.kind === "claim");

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

  test("an unrecorded refusal has no act, and a key that never joined gets no session", async () => {
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

  test("connecting by name is refused for a signing key: names are not signed (R-ID-3)", async () => {
    const { signer } = await generateSigner();
    const err = await caught(connect({ url }, "acme/web", { kind: "key", signer }));
    expect(err.code).toBe("bad-request");
  });

  test("plain http is refused except on this machine", async () => {
    const { signer } = await generateSigner();
    const err = await caught(connect({ url: "http://example.com" as Url }, room.id, { kind: "key", signer }));
    expect(err.code).toBe("bad-request");
  });

  test("a server for another room cannot start a session, because the room ID is signed (R-SIG-5)", async () => {
    const alice = await joinAs(room, "@alice");
    const other = await FakeRoom.create({ name: "other/room" });
    await other.start();
    other.aliases.push(room.id);
    try {
      const err = await caught(connect({ url: other.url as Url }, room.id, { kind: "key", signer: alice.signer }));
      expect(err.code).toBe("unauthenticated");
    } finally {
      await other.stop();
    }
  });
});

describe("idempotent retries (R-IDEM-1, R-IDEM-2, R-IDEM-3, R-IDEM-6)", () => {
  test("a lost response is retried with the same bytes, and the room returns the original record", async () => {
    const alice = await joinAs(room, "@alice");
    room.faults.push({ route: "POST /acts", kind: "drop" });
    const claim = ok(await alice.api.claim({ goal: "g", scope: ["src/**"] }));
    expect(claimEntries()).toHaveLength(1);
    expect(claimEntries()[0]!.seq).toBe(claim.seq);
    expect(room.requests.filter((r) => r.route === "/acts")).toHaveLength(2);
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
    expect(claimEntries()).toHaveLength(1); // it was recorded on the first attempt
    const again = ok(await alice.api.claim({ goal: "g", scope: ["src/**"] }, { idempotencyKey: "claim-1" }));
    expect(again.seq).toBe(claimEntries()[0]!.seq);
    expect(claimEntries()).toHaveLength(1);
  });

  test("the same key with a different act is refused idempotency-mismatch, naming the original", async () => {
    const alice = await joinAs(room, "@alice");
    const first = ok(await alice.api.claim({ goal: "g", scope: ["src/**"] }, { idempotencyKey: "k" }));
    const second = await alice.api.claim({ goal: "other", scope: ["src/**"] }, { idempotencyKey: "k" });
    expect(isRefusal(second) && second.rule).toBe("idempotency-mismatch");
    expect(isRefusal(second) && second.reason).toContain(first.id);
  });

  test("a non-retryable error is thrown at once, without retries", async () => {
    const alice = await joinAs(room, "@alice");
    room.faults.push({ route: "POST /acts", kind: "status", status: 400, body: { name: "ArtroomError", code: "bad-request", message: "no", retryable: false } });
    const err = await caught(alice.api.claim({ goal: "g", scope: ["src/**"] }));
    expect(err.code).toBe("bad-request");
    expect(room.requests.filter((r) => r.route === "/acts")).toHaveLength(1);
  });
});

describe("waits and sessions (R-API-5, R-CRED-7)", () => {
  test("wait throws timeout when the operation does not arrive in time, and the operation is unchanged", async () => {
    room.workspaceDelay = 1_000_000;
    const alice = await joinAs(room, "@alice");
    const claim = ok(await alice.api.claim({ goal: "g", scope: ["src/**"] }));
    const op = ok(await alice.api.workspace(claim));
    const err = await caught(alice.api.wait(op, { until: ["ready"], timeoutMs: 100 }));
    expect(err.code).toBe("timeout");
    expect((await alice.api.op(op)).state).toBe("pending");
  });

  test("an ended session is replaced on the next read", async () => {
    const alice = await joinAs(room, "@alice");
    room.endSessions();
    expect((await alice.api.members()).members.map((m) => m.handle)).toContain("@alice");
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

  test("attention pages resume exactly after the last item, and the last cursor sees only new items", async () => {
    const alice = await joinAs(room, "@alice");
    const bob = await joinAs(room, "@bob");
    await proposeIn(alice.api, 3);
    const p1 = await bob.api.attention({ limit: 2 });
    expect(p1.items).toHaveLength(2);
    expect(p1.more).toBe(true);
    const p2 = await bob.api.attention({ cursor: p1.cursor, limit: 2 });
    expect(p2.items).toHaveLength(1);
    expect(p2.more).toBe(false);
    expect(p2.cursor).toBeTruthy(); // present even when more is false
    expect(new Set([...p1.items, ...p2.items].map((i) => i.id)).size).toBe(3);
    await proposeIn(alice.api, 1);
    const p3 = await bob.api.attention({ cursor: p2.cursor });
    expect(p3.items.map((i) => i.why)).toEqual(["review-requested"]);
  });

  test("the log is ascending, `after` skips, and its cursor resumes", async () => {
    const alice = await joinAs(room, "@alice");
    await proposeIn(alice.api, 2);
    const all = await alice.api.log({ limit: 500 });
    const seqs = all.acts.map((e) => e.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(all.head).toBe(seqs[seqs.length - 1]);
    const first = await alice.api.log({ after: 2, limit: 3 });
    expect(first.acts.map((e) => e.seq)).toEqual([3, 4, 5]);
    const next = await alice.api.log({ cursor: first.cursor, limit: 3 });
    expect(next.acts[0]!.seq).toBe(6);
    expect(first.publishedThrough).toBeLessThanOrEqual(first.head);
  });

  test("the long poll returns an empty update after waitMs, then the next update after its cursor", async () => {
    const alice = await joinAs(room, "@alice");
    const bob = await joinAs(room, "@bob");
    const quiet = await bob.api.subscribe(undefined, { waitMs: 50 });
    expect(quiet.entries).toHaveLength(0);
    const pending = bob.api.subscribe(quiet.cursor, { waitMs: 5_000 });
    await proposeIn(alice.api, 1);
    const next = await pending;
    expect(next.entries.length).toBeGreaterThan(0);
    const again = await bob.api.subscribe(next.cursor, { waitMs: 50 });
    // Nothing is delivered twice.
    const seen = new Set(next.entries.map((e) => e.seq));
    expect(again.entries.filter((e) => seen.has(e.seq))).toHaveLength(0);
  });

  test("watch reconnects after a dropped socket and resumes from its cursor: nothing lost, nothing twice", async () => {
    const alice = await joinAs(room, "@alice");
    const bob = await joinAs(room, "@bob");
    const start = (await bob.api.subscribe(undefined, { waitMs: 0 })).cursor;
    const updates: Update[] = [];
    const sub = bob.api.watch(start, (u) => updates.push(u));
    const seqs = () => updates.flatMap((u) => u.entries.map((e) => e.seq));
    const until = async (test: () => boolean) => {
      for (let i = 0; i < 200 && !test(); i++) await new Promise((r) => setTimeout(r, 10));
    };
    await until(() => room.socketCount === 1);
    await proposeIn(alice.api, 1);
    await until(() => seqs().length >= 2);
    room.dropSockets();
    await proposeIn(alice.api, 1); // happens while the socket is down
    await until(() => seqs().length >= 4);
    const after = room.entries.filter((e) => e.seq > Number(String(start).slice(1).split(".")[0])).map((e) => e.seq);
    expect(seqs()).toEqual(after);
    expect(sub.cursor).toBe(updates[updates.length - 1]!.cursor);
    sub.close();
    await until(() => room.socketCount === 0);
    expect(room.socketCount).toBe(0);
  });
});

describe("the same handle over a service binding (RPC)", () => {
  test("acts, refusals and reads behave the same over RoomWire", async () => {
    const http = await joinAs(room, "@alice");
    const service = { room: async () => room.wire() };
    const rpc = await connect(service, room.id, { kind: "key", signer: http.signer });
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
});
