// The landing engine in workerd: Durable Object SQLite transactions, a real
// alarm after a real abort of the Room's instance, and a push that reaches the
// remote while the Room is gone.
import { describe, expect, it } from "vitest";
import { env, exports } from "cloudflare:workers";
import { abortAllDurableObjects, runDurableObjectAlarm } from "cloudflare:test";
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
