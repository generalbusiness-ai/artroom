/**
 * Request c657d4ba, from simplification review 55563589 (SEC-01, SEC-02,
 * SEC-07): join and redemption hardening.
 *
 * (1) A client-custody redemption issues a read session only for a join it
 *     admitted; a replay of a join copied from the log gets none.
 * (2) A refused join is never recorded, on any path: its body carries the
 *     invitation's secret (R-GEN-6, R-ADM-8).
 * (3) The redemption rate limit keys only a validated invitation, keeps its
 *     counters bounded, gives Workers over a service binding no shared
 *     address, and counts joins on POST /acts and RoomWire.submit too.
 */

import { describe, expect, it } from "vitest";
import { exports } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import type { Joined, LogEntry, RosterRecord, SignedEnvelope } from "@generalbusiness/artroom-contract";
import { policy, rule } from "@generalbusiness/artroom-policy/helpers";
import { generateSigner, join } from "@generalbusiness/artroom-client";
import type { Room } from "../../src/index.ts";
import { MAX_WINDOWS, openWindows, rateLimit, WINDOW_MS } from "../../src/ratelimit.ts";
import {
  advance,
  b64url,
  call,
  clock,
  Client,
  day,
  digestBytes,
  expectRefusal,
  failure,
  iso,
  isRefusal,
  makeRoom,
  newKeyPair,
  randomBytes,
  type TestRoom,
} from "./support.ts";

const base = "https://artroom.test/v1/rooms";
const stub = (r: TestRoom) => r.stub as unknown as DurableObjectStub<Room>;
const inDO = <T>(r: TestRoom, fn: (room: Room) => T | Promise<T>) => runInDurableObject(stub(r), fn);
const count = (r: TestRoom, sql: string) => inDO(r, (room) => Number(room.core.sql.all(sql)[0]!["n"]));
const sessions = (r: TestRoom) => count(r, "SELECT COUNT(*) AS n FROM sessions");
const invitationUsed = (r: TestRoom, id: string) => inDO(r, (room) => room.core.sql.all("SELECT used FROM invitations WHERE id = ?", id)[0]!["used"] !== null);
const entries = async (r: TestRoom): Promise<LogEntry[]> => [...(await r.admin.read({ q: "log", req: { limit: 500 } })).acts];

function post(r: TestRoom, path: string, body: unknown, address?: string): Promise<Response> {
  return exports.default.fetch(`${base}/${r.id}/${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...(address ? { "CF-Connecting-IP": address } : {}) },
  });
}

/** The Worker's RPC entrypoint, as a service binding calls it. */
async function rpc(r: TestRoom) {
  return (exports.default as unknown as { room(id: string): Promise<{ redeem(x: unknown): Promise<unknown>; submit(x: unknown): Promise<unknown> } & Disposable> }).room(r.id);
}

async function invite(r: TestRoom, member: `@${string}`, custody: "client" | "room" = "client") {
  const secret = randomBytes(32);
  const rec = await r.admin.ok<RosterRecord>("roster", null, {
    op: "invite",
    member,
    role: custody === "room" ? "agent" : "member",
    custody,
    expiresAt: iso(clock.now + day),
    secretHash: digestBytes(secret),
  });
  return { id: rec.id, secret: b64url(secret) };
}

const joinOf = (r: TestRoom, inv: { id: string; secret: string }, key = newKeyPair()) => new Client(r, key).signed("roster", null, { op: "join", invitation: inv.id, secret: inv.secret });

/** The signed join as anyone who can read the log sees it. */
async function copiedJoin(r: TestRoom, actor: string): Promise<SignedEnvelope> {
  const e = (await entries(r)).find((x) => x.entry.type === "act" && x.entry.act.envelope.actor === actor && (x.entry.act.envelope.body as { op?: string }).op === "join")!;
  return (e.entry as { act: SignedEnvelope }).act;
}

// ------------------------------------------------------------------ (1)

describe("(1) a redemption issues a session only for a join it admitted (SEC-01, R-CRED-9)", () => {
  it("a join copied from the log and replayed through POST /redeem gets no session", async () => {
    const r = await makeRoom();
    const inv = await invite(r, "@bob");
    const key = newKeyPair();
    await call(r.stub.submit(joinOf(r, inv, key)));
    const copied = await copiedJoin(r, key.key);
    const before = await sessions(r);
    const res = await post(r, "redeem", { custody: "client", join: copied }, "203.0.113.9");
    const body = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(409);
    expect(body).toMatchObject({ refused: true, rule: "invitation-invalid" });
    expect(body["session"]).toBeUndefined();
    expect(await sessions(r)).toBe(before);
  });

  it("a replay of a join first admitted through redeem, over the Durable Object and over RPC, gets no session", async () => {
    const r = await makeRoom();
    const inv = await invite(r, "@web");
    const key = newKeyPair();
    const joined = await call<Joined>(r.stub.redeem({ custody: "client", join: joinOf(r, inv, key) }, "198.51.100.1"));
    expect(joined.session.member).toBe("@web");
    const copied = await copiedJoin(r, key.key);
    const before = await sessions(r); // the redemption's, and the admin's read session
    expectRefusal(await call(r.stub.redeem({ custody: "client", join: copied }, "198.51.100.2")), "invitation-invalid");
    using wire = await rpc(r);
    expectRefusal(await wire.redeem({ custody: "client", join: copied }), "invitation-invalid");
    expect(await sessions(r)).toBe(before);
    // The key that joined still gets its session the ordinary way (R-CRED-5), and the act replays as usual (R-IDEM-2).
    expect((await call<RosterRecord>(r.stub.submit(copied))).id).toBe(joined.record.id);
    expect(typeof (await new Client(r, key).session())).toBe("string");
  });

  it("two identical redemptions at once: one is admitted and gets the session, the other gets none", async () => {
    const r = await makeRoom();
    const inv = await invite(r, "@race");
    const join = joinOf(r, inv);
    const out = await Promise.all([call(r.stub.redeem({ custody: "client", join }, "a")), call(r.stub.redeem({ custody: "client", join }, "b"))]);
    expect(out.filter((o) => !isRefusal(o))).toHaveLength(1);
    expect(out.filter((o) => isRefusal(o) && o.rule === "invitation-invalid")).toHaveLength(1);
    expect(await sessions(r)).toBe(1);
  });
});

// ------------------------------------------------------------------ (2)

describe("(2) a refused join is never recorded, on any path (SEC-02, R-GEN-6, R-ADM-8)", () => {
  const noJoin = () => policy(rule({ id: "no-join", kind: "refuse", on: ["roster"], refuse: 'act.body.op = "join"', reason: "No joins", fix: "Later" }));

  it("POST /acts: a join refused by policy at step 9 records nothing, keeps its secret out of the log, leaves the invitation unused", async () => {
    const r = await makeRoom({ policy: noJoin() });
    const inv = await invite(r, "@bob");
    const before = (await entries(r)).length;
    const join = joinOf(r, inv);
    const res = await post(r, "acts", join);
    expect(res.status).toBe(409);
    const refusal = (await res.json()) as { rule: string; act?: string };
    expect(refusal.rule).toBe("no-join");
    expect(refusal.act).toBeUndefined();
    const log = await entries(r);
    expect(log.length).toBe(before);
    expect(JSON.stringify(log)).not.toContain(inv.secret);
    expect(await count(r, "SELECT COUNT(*) AS n FROM idem WHERE result LIKE '%no-join%'")).toBe(0);
    expect(await invitationUsed(r, inv.id)).toBe(false);
    // Not a replay: the same bytes are judged afresh, and still nothing is recorded (R-IDEM-4).
    expectRefusal(await call(r.stub.submit(join)), "no-join");
    expect((await entries(r)).length).toBe(before);
  });

  it("RoomWire.submit over RPC: the same", async () => {
    const r = await makeRoom({ policy: noJoin() });
    const inv = await invite(r, "@bob");
    const before = (await entries(r)).length;
    using wire = await rpc(r);
    expect(await wire.submit(joinOf(r, inv))).toMatchObject({ refused: true, rule: "no-join" });
    expect((await entries(r)).length).toBe(before);
    expect(JSON.stringify(await entries(r))).not.toContain(inv.secret);
  });

  it("control: other acts refused at step 9 are still recorded (R-ADM-8)", async () => {
    const r = await makeRoom({ policy: policy(rule({ id: "no-claims", kind: "refuse", on: ["claim"], refuse: "true", reason: "No claims", fix: "Later" })) });
    const inv = await invite(r, "@bob");
    const bob = new Client(r, newKeyPair());
    await call(r.stub.submit(new Client(r, bob.keys).signed("roster", null, { op: "join", invitation: inv.id, secret: inv.secret })));
    const out = expectRefusal(await bob.act("claim", null, { goal: "g", scope: ["src/**"] }), "no-claims");
    expect(out.act).toMatch(/^act_/);
  });
});

// ------------------------------------------------------------------ (3)

describe("(3) the redemption rate limit (SEC-07, R-CRED-9)", () => {
  it("one invitation's limit holds across POST /acts and POST /redeem", async () => {
    const r = await makeRoom();
    const inv = await invite(r, "@bob");
    const wrong = { id: inv.id, secret: b64url(randomBytes(32)) };
    for (let i = 0; i < 5; i++) expect(((await (await post(r, "acts", joinOf(r, wrong))).json()) as { rule: string }).rule).toBe("invitation-invalid");
    for (let i = 0; i < 5; i++) expectRefusal(await call(r.stub.redeem({ custody: "client", join: joinOf(r, wrong) }, `addr-${i}`)), "invitation-invalid");
    const res = await post(r, "acts", joinOf(r, inv));
    expect(res.status).toBe(429);
    expect((await failure(r.stub.redeem({ custody: "client", join: joinOf(r, inv) }, "addr-x"))).code).toBe("rate-limited");
    expect(await invitationUsed(r, inv.id)).toBe(false);
    // The window ends; the right secret then joins.
    advance(WINDOW_MS);
    expect(isRefusal(await call(r.stub.redeem({ custody: "client", join: joinOf(r, inv) }, "addr-y")))).toBe(false);
  });

  it("a room-custody redemption counts against the same invitation limit as a join on /acts", async () => {
    const r = await makeRoom();
    const inv = await invite(r, "@agent", "room");
    for (let i = 0; i < 10; i++) expectRefusal(await call(r.stub.submit(joinOf(r, { id: inv.id, secret: b64url(randomBytes(32)) }))), "invitation-invalid");
    expect((await failure(r.stub.redeem({ custody: "room", invitation: inv.id, secret: inv.secret }, "addr-z"))).code).toBe("rate-limited");
  });

  it("the invitation ID is validated before keying: an ID the room never issued opens no counter", async () => {
    const r = await makeRoom();
    const before = await inDO(r, (room) => openWindows(room.core));
    // Through redeem, from a fresh address each time: only the invitation could be limited.
    for (let i = 0; i < 12; i++) {
      const join = new Client(r, newKeyPair()).signed("roster", null, { op: "join", invitation: "act_999_00000000", secret: b64url(randomBytes(32)) });
      expectRefusal(await call(r.stub.redeem({ custody: "client", join }, `fresh-${i}`)), "invitation-invalid");
    }
    // And on /acts: an ID never issued, past the limit of 10, and values that are not entry IDs.
    for (const [id, times] of [["act_999_00000000", 12], ["x".repeat(4096), 1], [7, 1], [null, 1], [{}, 1]] as const)
      for (let i = 0; i < times; i++) {
        const join = new Client(r, newKeyPair()).signed("roster", null, { op: "join", invitation: id, secret: b64url(randomBytes(32)) });
        expectRefusal(await call(r.stub.submit(join)), "invitation-invalid");
      }
    // Only the twelve addresses hold windows.
    expect(await inDO(r, (room) => openWindows(room.core))).toBe(before + 12);
  });

  it("Workers over a service binding share no address: more than 20 redemptions over RPC are limited only per invitation", async () => {
    const r = await makeRoom();
    using wire = await rpc(r);
    for (let i = 0; i < 22; i++) {
      const inv = await invite(r, `@m${i}`);
      const out = await wire.redeem({ custody: "client", join: joinOf(r, inv) }).catch((e: { code?: string }) => e);
      expect((out as { code?: string }).code).not.toBe("rate-limited");
      expect(isRefusal(out)).toBe(false);
    }
  });

  it("an HTTPS client address is limited to 20 a minute; an invitation the room never issued is not keyed", async () => {
    const r = await makeRoom();
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) statuses.push((await post(r, "redeem", { custody: "room", invitation: "act_9_00000000", secret: "AAAA" }, "192.0.2.7")).status);
    expect(statuses.slice(0, 20).every((s) => s === 409)).toBe(true);
    expect(statuses[20]).toBe(429);
    expect((await post(r, "redeem", { custody: "room", invitation: "act_9_00000000", secret: "AAAA" }, "192.0.2.8")).status).toBe(409);
  });

  it("the counters are bounded: ended windows are dropped, and a full table refuses new windows until one ends", async () => {
    const r = await makeRoom();
    await inDO(r, (room) => {
      const core = room.core;
      for (let i = 0; i < 50; i++) rateLimit(core, `t:${i}`, 1);
      expect(openWindows(core)).toBeGreaterThanOrEqual(50);
      advance(WINDOW_MS);
      rateLimit(core, "t:after", 1);
      expect(openWindows(core)).toBe(1);
      for (let i = 1; i < MAX_WINDOWS; i++) rateLimit(core, `fill:${i}`, 1);
      expect(openWindows(core)).toBe(MAX_WINDOWS);
      expect(() => rateLimit(core, "one-more", 1)).toThrow(/Too many/);
      expect(openWindows(core)).toBe(MAX_WINDOWS);
      advance(WINDOW_MS);
      rateLimit(core, "one-more", 1);
      expect(openWindows(core)).toBe(1);
    });
  });
});

// ------------------------------------------------------------------ review of 812fb907

describe("the client's join() recovery runs on the caller's clock (review of 812fb907)", () => {
  it("virtual clock: a lost join reply is recovered, and a session request retried after the clock moves is signed again at the moved time", async () => {
    const r = await makeRoom();
    const inv = await invite(r, "@clocked");
    const { signer } = await generateSigner();
    let redemptions = 0;
    const notAfters: number[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      if (String(input).endsWith("/requests")) {
        notAfters.push(Date.parse((JSON.parse(String(init?.body)) as { request: { notAfter: string } }).request.notAfter));
        if (notAfters.length === 1) {
          advance(10 * 60_000); // past the first signature's 300-second window
          return new Response(JSON.stringify({ name: "ArtroomError", code: "unavailable", message: "busy", retryable: true, retryAfterMs: 1, maybeRecorded: false }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          });
        }
      }
      const response = await exports.default.fetch(input, init);
      // The room admitted the join, and the client never sees the answer. The client waits `retryAfterMs` before
      // it tries again, so the lost reply is a 503 that says 1 ms: a thrown network error would wait 200 ms.
      if (String(input).endsWith("/redeem") && ++redemptions === 1)
        return new Response(JSON.stringify({ name: "ArtroomError", code: "unavailable", message: "reply lost", retryable: true, retryAfterMs: 1, maybeRecorded: true }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      return response;
    };
    const out = await join({ url: "https://artroom.test" }, r.id, { invitation: inv.id as never, secret: inv.secret as never, signer }, { fetch: fetcher, retries: 2, now: () => clock.now });
    expect(isRefusal(out)).toBe(false);
    expect((out as Joined).session.member).toBe("@clocked");
    expect(redemptions).toBe(2);
    expect(notAfters).toHaveLength(2);
    expect(notAfters[1]! - notAfters[0]!).toBe(10 * 60_000);
    // One join, signed once: the recovery resubmitted the original bytes.
    const joins = (await entries(r)).filter((e) => e.entry.type === "act" && (e.entry.act.envelope.body as { op?: string }).op === "join" && e.entry.act.envelope.actor === signer.key);
    expect(joins).toHaveLength(1);
  });
});

