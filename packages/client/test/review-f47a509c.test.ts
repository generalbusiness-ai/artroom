/**
 * Review f47a509c, client findings. P1: a credential the caller already
 * holds is redacted from the first request on (R-WS-4). P2: a watch
 * replaces an ended read session on reconnect, keeps its cursor, and stops
 * observably when the room no longer accepts its credential (R-CRED-7,
 * R-API-6).
 */

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { ArtroomError, Redeemed, Update } from "@generalbusiness/artroom-contract";
import { connect, isArtroomError, isRefusal, redeem, type Watch } from "../src/index.ts";
import type { FakeRoom } from "./support/fake-room.ts";
import { joinAs, startRoom, type Url } from "./support/setup.ts";

let room: FakeRoom;
let url: Url;
beforeEach(async () => {
  ({ room, url } = await startRoom());
});
afterEach(() => room.stop());

async function caught(p: Promise<unknown>): Promise<ArtroomError> {
  try {
    await p;
  } catch (e) {
    if (isArtroomError(e)) return e;
    throw e;
  }
  throw new Error("expected an ArtroomError");
}

async function bearer(): Promise<Redeemed> {
  const { invitation, secret } = await room.invite("@builder", { role: "agent", custody: "room" });
  const out = await redeem({ url }, room.id, { invitation, secret });
  if (isRefusal(out)) throw new Error(out.rule);
  return out;
}

const echo = (token: string) => ({ name: "ArtroomError", code: "unauthenticated", message: `bad token ${token}`, retryable: false });
const until = async (test: () => boolean, ms = 3000) => {
  for (let i = 0; i < ms / 10 && !test(); i++) await new Promise((r) => setTimeout(r, 10));
};

describe("P1: a held bearer is redacted from the very first request", () => {
  test("a 401 on connect's first read that echoes the bearer reaches the caller redacted", async () => {
    const b = await bearer();
    room.faults.push({ route: "GET /log", kind: "status", status: 401, body: echo(b.bearer) });
    const err = await caught(connect({ url }, room.id, { kind: "bearer", token: b.bearer }));
    expect(err.code).toBe("unauthenticated");
    expect(JSON.stringify(err)).not.toContain(b.bearer);
    expect(err.message).toContain("[redacted]");
  });

  test("a later failure that echoes the bearer is redacted too", async () => {
    const b = await bearer();
    const api = await connect({ url }, room.id, { kind: "bearer", token: b.bearer });
    room.faults.push({ route: "GET /members", kind: "status", status: 401, body: echo(b.bearer) });
    const err = await caught(api.members());
    expect(JSON.stringify(err)).not.toContain(b.bearer);
  });
});

describe("P2: watch reconnects with a valid credential, or stops observably", () => {
  test("after the room ends the session and drops the socket, the watch replaces the session and resumes from its cursor", async () => {
    const alice = await joinAs(room, "@alice");
    const bob = await joinAs(room, "@bob");
    const start = (await bob.api.subscribe(undefined, { waitMs: 0 })).cursor;
    const seen: Update[] = [];
    const errors: ArtroomError[] = [];
    const sub = bob.api.watch(start, (u) => seen.push(u), (e) => errors.push(e)) as Watch;
    const seqs = () => seen.flatMap((u) => u.entries.map((e) => e.seq));
    await until(() => room.socketCount === 1);
    await alice.api.claim({ goal: "a", scope: ["a/**"] });
    await until(() => seqs().length >= 1);
    const sessions = room.exposure.sessions.length;
    room.endSessions();
    room.dropSockets();
    await alice.api.claim({ goal: "b", scope: ["b/**"] });
    await until(() => seqs().length >= 2);
    const after = room.entries.filter((e) => e.seq > Number(String(start).slice(1).split(".")[0])).map((e) => e.seq);
    expect(seqs()).toEqual(after); // nothing lost, nothing twice
    expect(room.exposure.sessions.length).toBeGreaterThan(sessions); // a new session was made
    expect(errors).toEqual([]);
    expect(sub.closed).toBe(false);
    sub.close();
  });

  test("a revoked bearer stops the watch with an error, once, and it stops trying", async () => {
    const b = await bearer();
    const api = await connect({ url }, room.id, { kind: "bearer", token: b.bearer });
    const errors: ArtroomError[] = [];
    const sub = api.watch(undefined, () => {}, (e) => errors.push(e)) as Watch;
    await until(() => room.socketCount === 1);
    room.revokeDelegation(b.delegation);
    room.dropSockets();
    await until(() => errors.length > 0);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.code).toBe("unauthenticated");
    expect(sub.error?.code).toBe("unauthenticated");
    expect(sub.closed).toBe(true);
    const attempts = room.upgrades;
    await new Promise((r) => setTimeout(r, 1200));
    expect(room.upgrades).toBe(attempts);
    expect(JSON.stringify(errors)).not.toContain(b.bearer);
  });

  test("closing during a reconnect backoff stops all further attempts; disposing the handle closes its watches", async () => {
    const alice = await joinAs(room, "@alice");
    const sub = alice.api.watch(undefined, () => {}) as Watch;
    await until(() => room.socketCount === 1);
    room.rejectUpgrades = true; // an outage: every reconnect fails, so the watch is in its backoff
    room.dropSockets();
    const before = room.upgrades;
    await until(() => room.upgrades > before);
    sub.close();
    const attempts = room.upgrades;
    await new Promise((r) => setTimeout(r, 1200));
    expect(room.upgrades).toBe(attempts);
    room.rejectUpgrades = false;

    const other = alice.api.watch(undefined, () => {}) as Watch;
    await until(() => room.socketCount === 1);
    alice.api[Symbol.dispose]();
    expect(other.closed).toBe(true);
    await until(() => room.socketCount === 0);
    expect(room.socketCount).toBe(0);
  });
});
