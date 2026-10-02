// The landing engine in workerd: Durable Object SQLite transactions, a real
// alarm after a real abort of the Room's instance, and a push that reaches the
// remote while the Room is gone.
import { describe, expect, it } from "vitest";
import { env, exports } from "cloudflare:workers";
import { abortAllDurableObjects, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import type { LaneId, OpId, Sha } from "@generalbusiness/artroom-contract";
import type { FakeRemote, TestRoom } from "./worker.ts";

interface TestEnv {
  ROOM: DurableObjectNamespace<TestRoom>;
  REMOTE: DurableObjectNamespace<FakeRemote>;
}
const e = env as unknown as TestEnv;
const LANE = "act_1001_abcdef01" as LaneId;
const HEAD = "2".repeat(40) as Sha;
const OP = "op_land_1" as OpId;

let n = 0;
async function reservedRoom() {
  const name = `room-${++n}-${Date.now()}`;
  const room = e.ROOM.getByName(name);
  names.set(room, name);
  const remote = e.REMOTE.getByName("canonical");
  await room.setup(LANE, HEAD);
  expect(await room.accept(OP, LANE, HEAD)).toBe("accepted");
  expect(await room.prepare(OP)).toBe("ready");
  expect(await room.reserve(OP)).toBe("reserved");
  return { room, remote };
}

/** Abort every Durable Object instance (storage stays), and get a fresh stub to the same Room. */
async function restart(room: DurableObjectStub<TestRoom>): Promise<DurableObjectStub<TestRoom>> {
  const name = names.get(room)!;
  await abortAllDurableObjects();
  const fresh = e.ROOM.getByName(name);
  names.set(fresh, name);
  return fresh;
}
const names = new Map<unknown, string>();

async function until(f: () => Promise<boolean>): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (await f()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("timed out");
}

const landed = async (room: DurableObjectStub<TestRoom>) => (await room.log()).filter((x) => x.type === "land-outcome").length;

describe("landing in a Durable Object", () => {
  it("R-LAND-7: reservation is one transaction; a failure inside it leaves nothing behind", async () => {
    const room = e.ROOM.getByName("atomic");
    await room.setup(LANE, HEAD);
    await room.accept(OP, LANE, HEAD);
    await room.prepare(OP);
    await room.setFailRecord("land-reserved");
    expect(await room.reserve(OP)).toMatch(/log append failed/);
    expect(await room.view(OP)).toEqual({ state: "ready", slot: "free" });
    await room.setFailRecord(null);
    expect(await room.reserve(OP)).toBe("reserved");
    expect(await room.view(OP)).toEqual({ state: "publishing", slot: "held" });
  });

  it("nested transactions roll back only the inner part (the engine nests them)", async () => {
    expect(await e.ROOM.getByName("nest").nested()).toEqual(["outer"]);
  });

  it("crash before push: the instance is aborted, the alarm completes forward, and the landing is recorded once (R-PUB-7)", async () => {
    let { room, remote } = await reservedRoom();
    const before = await remote.pushes();
    await room.setCrash("token-minted");
    expect(await room.publish()).toMatch(/crash at token-minted/);
    room = await restart(room);
    remote = e.REMOTE.getByName("canonical");
    expect(await runDurableObjectAlarm(room)).toBe(true);
    expect(await room.view(OP)).toEqual({ state: "landed", slot: "free" });
    expect(await remote.pushes()).toBe(before + 1);
    expect(await landed(room)).toBe(1);
    expect(await room.liveTokens()).toBe(0);
  });

  it("crash after push, before the receipt: the alarm reads main back and does not push again (R-PUB-5, R-PUB-7)", async () => {
    let { room, remote } = await reservedRoom();
    await room.setCrash("push-returned");
    expect(await room.publish()).toMatch(/crash at push-returned/);
    const pushes = await remote.pushes();
    room = await restart(room);
    remote = e.REMOTE.getByName("canonical");
    expect(await runDurableObjectAlarm(room)).toBe(true);
    expect(await room.view(OP)).toEqual({ state: "landed", slot: "free" });
    expect(await remote.pushes()).toBe(pushes);
    expect(await landed(room)).toBe(1);
  });

  it("the Room dies with its push still in flight; the push lands afterwards; the alarm records it once", async () => {
    let { room, remote } = await reservedRoom();
    await remote.setHold(true);
    const publishing = room.publish().catch((err: unknown) => err);
    await until(async () => (await remote.pending()).length === 1);
    room = await restart(room);
    remote = e.REMOTE.getByName("canonical");
    expect(await publishing).toBeInstanceOf(Error);
    const [n1] = await remote.pending();
    expect((await remote.release(n1!)).outcome).toBe("landed");
    await remote.setHold(false);
    expect(await runDurableObjectAlarm(room)).toBe(true);
    expect(await room.view(OP)).toEqual({ state: "landed", slot: "free" });
    expect(await landed(room)).toBe(1);
  });

  it("the Room dies with its push in flight; the alarm pushes forward first; the late push fails its lease", async () => {
    let { room, remote } = await reservedRoom();
    await remote.setHold(true);
    const publishing = room.publish().catch((err: unknown) => err);
    await until(async () => (await remote.pending()).length === 1);
    room = await restart(room);
    remote = e.REMOTE.getByName("canonical");
    await publishing;
    const [n1] = await remote.pending();
    await remote.setHold(false);
    expect(await runDurableObjectAlarm(room)).toBe(true);
    expect(await room.view(OP)).toEqual({ state: "landed", slot: "free" });
    const main = await remote.main();
    const late = await remote.release(n1!);
    expect(late.outcome).toBe("landed"); // main already equals the same integration: "up to date"
    expect(await remote.main()).toBe(main);
    expect(await landed(room)).toBe(1);
  });

  it("R-PUB-3: the push lands but its token's revocation fails; across real restarts the alarm keeps the revocation owed with backoff, and revokes it when Artifacts recovers", async () => {
    let { room } = await reservedRoom();
    // The test Room's revoke marks its token row; this trigger makes Artifacts refuse revocations, durably, across restarts.
    const revocations = (stub: DurableObjectStub<TestRoom>, on: boolean) =>
      runInDurableObject(stub, (_room, state) => {
        state.storage.sql.exec(
          on ? "CREATE TRIGGER revoke_down BEFORE UPDATE ON t_tokens BEGIN SELECT RAISE(ABORT, 'Artifacts unavailable (revoke)'); END" : "DROP TRIGGER revoke_down",
        );
      });
    const owed = (stub: DurableObjectStub<TestRoom>) =>
      runInDurableObject(stub, (_room, state) => ({
        rows: state.storage.sql.exec("SELECT op, n, due, backoff FROM artroom_land_token_cleanup").toArray() as { op: string; n: number; due: number; backoff: number }[],
        now: Date.now(),
      }));
    const alarmAt = (stub: DurableObjectStub<TestRoom>) => runInDurableObject(stub, (_room, state) => state.storage.getAlarm());
    const waitUntil = async (t: number) => {
      while (Date.now() < t) await new Promise((r) => setTimeout(r, Math.max(10, t - Date.now())));
    };

    await revocations(room, true);
    expect(await room.publish()).toBe("true");
    expect(await room.view(OP)).toEqual({ state: "landed", slot: "free" });
    expect(await landed(room)).toBe(1);
    expect(await room.liveTokens()).toBe(1);
    let o = await owed(room);
    expect(o.rows.map((r) => [r.op, r.n, r.backoff])).toEqual([[OP, 1, 1000]]);
    expect(o.rows[0]!.due).toBeGreaterThan(o.now - 1000);

    // Restart with Artifacts still refusing. The alarm tries once it is due, fails, and schedules the next try.
    room = await restart(room);
    await waitUntil(o.rows[0]!.due);
    expect(await runDurableObjectAlarm(room)).toBe(true);
    o = await owed(room);
    expect(o.rows.map((r) => [r.op, r.n, r.backoff])).toEqual([[OP, 1, 2000]]);
    expect(o.rows[0]!.due).toBeGreaterThan(o.now);
    expect(await alarmAt(room)).toBe(o.rows[0]!.due);
    expect(await room.liveTokens()).toBe(1);
    expect(await room.view(OP)).toEqual({ state: "landed", slot: "free" });

    // Artifacts recovers; another restart; the scheduled alarm fires by itself, revokes the token and owes nothing more.
    await revocations(room, false);
    room = await restart(room);
    const deadline = o.rows[0]!.due + 10_000;
    while ((await room.liveTokens()) !== 0) {
      if (Date.now() > deadline) throw new Error("the scheduled alarm did not revoke the token");
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(Date.now()).toBeGreaterThanOrEqual(o.rows[0]!.due);
    expect((await owed(room)).rows).toEqual([]);
    expect(await alarmAt(room)).toBeNull();
    expect(await room.view(OP)).toEqual({ state: "landed", slot: "free" });
    expect(await landed(room)).toBe(1);
    expect((await room.log()).map((x) => x.type)).toEqual(["land-reserved", "land-outcome"]);
  });
});

describe("the gateway's fence in workerd", () => {
  type Factory = { ArtifactsGateway(o: { props: unknown }): Fetcher };
  const gw = (exports as unknown as Factory).ArtifactsGateway({
    props: {
      host: "acct.artifacts.cloudflare.net",
      repos: {
        "/git/ns/canon.git": { token: "art_v1_secret", updates: { "refs/heads/main": { old: "a".repeat(40), new: "b".repeat(40) } } },
        "/git/ns/fork.git": { token: "art_v1_secret2", updates: null },
      },
    },
  });
  const pkt = (s: string) => (s.length + 4).toString(16).padStart(4, "0") + s;
  const pushBody = (line: string) => {
    const bytes = new TextEncoder().encode(pkt(`${line}\0 report-status`) + "0000PACK");
    let i = 0;
    return new ReadableStream<Uint8Array>({
      pull(c) {
        if (i >= bytes.length) return c.close();
        c.enqueue(bytes.slice(i, i + 3)); // tiny chunks
        i += 3;
      },
    });
  };
  const post = (path: string, body: ReadableStream<Uint8Array>) =>
    gw.fetch(`https://acct.artifacts.cloudflare.net${path}/git-receive-pack`, { method: "POST", body, headers: { "content-type": "application/x-git-receive-pack-request" } });

  it("refuses a push that would move main anywhere but the allowed update, before any request leaves", async () => {
    const r = await post("/git/ns/canon.git", pushBody(`${"c".repeat(40)} ${"b".repeat(40)} refs/heads/main`));
    expect(r.status).toBe(403);
    expect(await r.text()).toMatch(/does not match/);
    const other = await post("/git/ns/canon.git", pushBody(`${"0".repeat(40)} ${"b".repeat(40)} refs/heads/other`));
    expect(other.status).toBe(403);
  });

  it("refuses a push with a read-only grant, another repository, or another host", async () => {
    expect((await post("/git/ns/fork.git", pushBody(`${"a".repeat(40)} ${"b".repeat(40)} refs/heads/main`))).status).toBe(403);
    expect((await post("/git/ns/elsewhere.git", pushBody(`${"a".repeat(40)} ${"b".repeat(40)} refs/heads/main`))).status).toBe(403);
    expect((await gw.fetch("https://example.com/git/ns/canon.git/info/refs")).status).toBe(403);
  });
});
