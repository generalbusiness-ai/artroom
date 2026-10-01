/**
 * Founding (R-GEN-10 to R-GEN-13), the registry, one publisher per
 * repository (R-PUB-10) and finding a room's ID (R-API-11): the section 23
 * founding cases of contract amendment 2.
 */

import { describe, expect, it } from "vitest";
import { env, exports } from "cloudflare:workers";
import type { DraftedRoom, Genesis, RoomId, RoomRef } from "@generalbusiness/artroom-contract";
import { roomIdOf } from "../../src/ids.ts";
import { hex } from "../../src/crypto.ts";
import { roomSeed } from "../../src/founding.ts";
import { runInDurableObject } from "cloudflare:test";
import { advance, b64url, call, clock, day, grant, iso, logOf, makeRoom, newKeyPair, operator, randomBytes, sign, worldFor, type World } from "./support.ts";
import type { Registry, Room } from "../../src/index.ts";

const base = "https://artroom.test/v1/rooms";
const worker = exports.default as unknown as {
  draft(input: unknown): Promise<DraftedRoom>;
  found(genesis: Genesis, sig: string, draft: string): Promise<RoomId>;
};

const reg = () => env.REGISTRY.get(env.REGISTRY.idFromName("registry")) as unknown as DurableObjectStub<Registry>;
const roomStub = (id: string) => env.ROOMS.get(env.ROOMS.idFromName(id)) as unknown as DurableObjectStub<Room>;

async function post(path: string, body: unknown): Promise<Response> {
  return exports.default.fetch(`${base}${path}`, { method: "POST", body: JSON.stringify(body) });
}

/** Expect a thrown ArtroomError over RPC with this code. */
async function rejects(p: Promise<unknown>, code: string): Promise<void> {
  let thrown: unknown = null;
  try {
    await p;
  } catch (e) {
    thrown = e;
  }
  expect(thrown, `expected ${code}`).toMatchObject({ name: "ArtroomError", code });
}

const importRepo = () => `acme-import/${hex(randomBytes(16))}`;
const name = () => `acme/${b64url(randomBytes(6))}`;

/** Draft, sign and found over RPC; returns the room ID and the pieces used. */
async function foundImport(repo: string, opts: { admin?: ReturnType<typeof newKeyPair>; roomName?: string; notAfter?: string } = {}) {
  const admin = opts.admin ?? newKeyPair();
  const drafted = await worker.draft({
    name: opts.roomName ?? name(),
    repo: { kind: "import", grant: grant(repo, admin.key, opts.notAfter) },
    admin: { handle: "@founder", key: admin.key },
    recovery: newKeyPair().key,
  });
  const sig = sign(admin.seed, "artroom-genesis-v1", drafted.genesis);
  return { admin, drafted, sig };
}

/** Give the room its own in-memory Artifacts world before it is founded, with main holding files. */
function prepareWorld(genesis: Genesis): World {
  const world = worldFor(roomIdOf(genesis));
  world.artifacts.main = world.artifacts.commit(null, { "README.md": "# imported\n" });
  return world;
}

describe("R-GEN-10, R-GEN-12: public founding", () => {
  it("section 23, Isolated public creation: a fresh repository in the public namespace, created after the binding; entries 0 and 1; found again returns the same room", async () => {
    const admin = newKeyPair();
    const res = await post("", { name: name(), repo: { kind: "new" }, admin: { handle: "@founder", key: admin.key }, recovery: newKeyPair().key });
    expect(res.status).toBe(200);
    const drafted = (await res.json()) as DraftedRoom;
    expect(drafted.genesis.repo).toMatch(/^artroom-public\/[0-9a-f]{32}$/);
    expect(drafted.genesis.onboarding).toBeUndefined();
    const world = worldFor(roomIdOf(drafted.genesis));
    const body = { genesis: drafted.genesis, sig: sign(admin.seed, "artroom-genesis-v1", drafted.genesis), draft: drafted.draft };
    const f = await post("/found", body);
    expect(f.status).toBe(200);
    const { room } = (await f.json()) as { room: RoomId };
    expect(room).toBe(roomIdOf(drafted.genesis));
    expect(world.artifacts.created.has(drafted.genesis.repo)).toBe(true);
    expect(await reg().byRepo(drafted.genesis.repo)).toEqual({ repo: drafted.genesis.repo, room, name: drafted.genesis.name });
    const again = await post("/found", body);
    expect(((await again.json()) as { room: RoomId }).room).toBe(room);
    const log = await logOf(room);
    expect(log.map((e) => (e.entry as { event: { type: string } }).event.type)).toEqual(["genesis", "policy-activated"]);
    expect((log[1]!.entry as unknown as { event: { checkers: unknown[] } }).event.checkers).toEqual([]);
  });

  it("section 23, Unauthorized existing repository: a public draft whose genesis names an existing repository is forbidden; nothing bound", async () => {
    const admin = newKeyPair();
    const drafted = await worker.draft({ name: name(), repo: { kind: "new" }, admin: { handle: "@founder", key: admin.key }, recovery: newKeyPair().key });
    const other = importRepo();
    const genesis = { ...drafted.genesis, repo: other };
    const world = worldFor(roomIdOf(genesis));
    await rejects(worker.found(genesis, sign(admin.seed, "artroom-genesis-v1", genesis), drafted.draft), "forbidden");
    expect(await reg().byRepo(other)).toBeNull();
    expect(world.artifacts.calls.size).toBe(0);
  });
});

describe("R-GEN-12: imports need an operator's grant", () => {
  it("section 23, Authorized import: the genesis carries the grant; the room reads main after the binding", async () => {
    const repo = importRepo();
    const { drafted, sig } = await foundImport(repo);
    expect(drafted.genesis.onboarding?.grant).toMatchObject({ repo, operator: operator.key });
    const world = prepareWorld(drafted.genesis);
    const room = await worker.found(drafted.genesis, sig, drafted.draft);
    expect(world.artifacts.calls.get("readMain")).toBeGreaterThan(0);
    expect(world.artifacts.calls.get("createRepo")).toBeUndefined();
    expect((await reg().byRepo(repo))?.room).toBe(room);
  });

  it("section 23, Unauthorized existing repository: a grant by a non-operator key, or for another admin key, is forbidden at draft and at found; nothing read or bound", async () => {
    const repo = importRepo();
    const admin = newKeyPair();
    const draft = (g: unknown) => worker.draft({ name: name(), repo: { kind: "import", grant: g }, admin: { handle: "@founder", key: admin.key }, recovery: newKeyPair().key });
    await rejects(draft(grant(repo, admin.key, undefined, newKeyPair())), "forbidden");
    await rejects(draft(grant(repo, newKeyPair().key)), "forbidden");
    // At found: a genesis edited to carry a non-operator grant, re-signed by the admin.
    const { drafted } = await foundImport(repo, { admin });
    const genesis = { ...drafted.genesis, onboarding: grant(repo, admin.key, undefined, newKeyPair()) };
    const world = worldFor(roomIdOf(genesis));
    await rejects(worker.found(genesis, sign(admin.seed, "artroom-genesis-v1", genesis), drafted.draft), "forbidden");
    expect(await reg().byRepo(repo)).toBeNull();
    expect(world.artifacts.calls.size).toBe(0);
  });

  it("section 23, Repository altered after draft: the genesis edited to name another repository, keeping the grant, is forbidden; nothing bound", async () => {
    const repo = importRepo();
    const { admin, drafted } = await foundImport(repo);
    const other = importRepo();
    const genesis = { ...drafted.genesis, repo: other };
    const world = worldFor(roomIdOf(genesis));
    await rejects(worker.found(genesis, sign(admin.seed, "artroom-genesis-v1", genesis), drafted.draft), "forbidden");
    expect(await reg().byRepo(other)).toBeNull();
    expect(await reg().byRepo(repo)).toBeNull();
    expect(world.artifacts.calls.size).toBe(0);
  });

  it("section 23, Canonical-name aliases: a grant naming a repository by name or URL is bad-request; two grants for one identity found one room", async () => {
    const admin = newKeyPair();
    for (const alias of ["acme/web", "https://github.com/acme/web"])
      await rejects(worker.draft({ name: name(), repo: { kind: "import", grant: grant(alias, admin.key) }, admin: { handle: "@f", key: admin.key }, recovery: newKeyPair().key }), "bad-request");
    const repo = importRepo();
    const first = await foundImport(repo);
    prepareWorld(first.drafted.genesis);
    await worker.found(first.drafted.genesis, first.sig, first.drafted.draft);
    const second = await foundImport(repo);
    prepareWorld(second.drafted.genesis);
    await rejects(worker.found(second.drafted.genesis, second.sig, second.drafted.draft), "forbidden");
  });

  it("section 23, Duplicate import: after R is founded, the same grant with a new name or recovery key is forbidden; the binding is unchanged", async () => {
    const repo = importRepo();
    const admin = newKeyPair();
    const first = await foundImport(repo, { admin });
    prepareWorld(first.drafted.genesis);
    const room = await worker.found(first.drafted.genesis, first.sig, first.drafted.draft);
    const before = await reg().byRepo(repo);
    for (const change of [{ name: name() }, { recovery: newKeyPair().key }]) {
      const genesis = { ...first.drafted.genesis, ...change };
      await rejects(worker.found(genesis, sign(admin.seed, "artroom-genesis-v1", genesis), first.drafted.draft), "forbidden");
    }
    expect(await reg().byRepo(repo)).toEqual(before);
    expect(before?.room).toBe(room);
  });

  it("section 23, Simultaneous founding: two founds for one repository at once, with different names and keys: exactly one binds and founds", async () => {
    const repo = importRepo();
    const a = await foundImport(repo);
    const b = await foundImport(repo);
    const wa = prepareWorld(a.drafted.genesis);
    const wb = prepareWorld(b.drafted.genesis);
    const results = await Promise.allSettled([worker.found(a.drafted.genesis, a.sig, a.drafted.draft), worker.found(b.drafted.genesis, b.sig, b.drafted.draft)]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const no = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(ok.length).toBe(1);
    expect(no.length).toBe(1);
    expect(no[0]!.reason).toMatchObject({ code: "forbidden" });
    // The loser read nothing and has no sequencer.
    const loser = ok[0] === results[0] ? wb : wa;
    expect(loser.artifacts.calls.size).toBe(0);
    const loserId = roomIdOf(ok[0] === results[0] ? b.drafted.genesis : a.drafted.genesis);
    expect(await logOf(loserId)).toEqual([]);
  });

  it("section 23, Recovery after binding: step 6 fails after the binding; the grant expires; another founder is forbidden; the retry completes", async () => {
    const repo = importRepo();
    const { drafted, sig } = await foundImport(repo, { notAfter: iso(clock.now + 60_000) });
    const world = prepareWorld(drafted.genesis);
    world.artifacts.failNext("readMain");
    await rejects(worker.found(drafted.genesis, sig, drafted.draft), "unavailable");
    const id = roomIdOf(drafted.genesis);
    expect((await reg().byRepo(repo))?.room).toBe(id);
    advance(2 * 60_000);
    const other = await foundImport(repo, { notAfter: iso(clock.now + day) });
    prepareWorld(other.drafted.genesis);
    await rejects(worker.found(other.drafted.genesis, other.sig, other.drafted.draft), "forbidden");
    expect(await worker.found(drafted.genesis, sig, drafted.draft)).toBe(id);
    expect(await worker.found(drafted.genesis, sig, drafted.draft)).toBe(id);
  });
});

describe("R-GEN-10, R-GEN-11: genesis and names", () => {
  it("section 23: a different profile or jsonata version, or a room key that is not the draft's, is bad-request; nothing bound", async () => {
    const repo = importRepo();
    const { admin, drafted } = await foundImport(repo);
    for (const change of [{ profile: { policy: "artroom-jsonata-v1", jsonata: "9.9.9" } }, { profile: { policy: "other", jsonata: "2.2.2" } }, { roomKey: newKeyPair().key }, { format: "x" }]) {
      const genesis = { ...drafted.genesis, ...change } as Genesis;
      await rejects(worker.found(genesis, sign(admin.seed, "artroom-genesis-v1", genesis), drafted.draft), "bad-request");
    }
    expect(await reg().byRepo(repo)).toBeNull();
  });

  it("an edited genesis not re-signed is unauthenticated; nothing bound", async () => {
    const repo = importRepo();
    const { drafted, sig } = await foundImport(repo);
    const genesis = { ...drafted.genesis, createdAt: iso(clock.now + 1000) };
    await rejects(worker.found(genesis, sig, drafted.draft), "unauthenticated");
    expect(await reg().byRepo(repo)).toBeNull();
  });

  it("section 23: a name in the form of a room ID is bad-request; a second room with a bound name is forbidden", async () => {
    const admin = newKeyPair();
    await rejects(worker.draft({ name: `room_${"a".repeat(32)}`, repo: { kind: "new" }, admin: { handle: "@f", key: admin.key }, recovery: newKeyPair().key }), "bad-request");
    const taken = name();
    const first = await foundImport(importRepo(), { roomName: taken });
    prepareWorld(first.drafted.genesis);
    await worker.found(first.drafted.genesis, first.sig, first.drafted.draft);
    const second = await foundImport(importRepo(), { roomName: taken });
    prepareWorld(second.drafted.genesis);
    await rejects(worker.found(second.drafted.genesis, second.sig, second.drafted.draft), "forbidden");
  });

  it("the Room itself refuses to found a genesis the registry does not bind, and reads nothing (R-GEN-13)", async () => {
    const repo = importRepo();
    const { drafted, sig } = await foundImport(repo);
    const world = prepareWorld(drafted.genesis);
    const seed = b64url(roomSeed(env as never, drafted.draft));
    const w = (await roomStub(roomIdOf(drafted.genesis)).found(drafted.genesis, sig, seed)) as { error?: { code: string } };
    expect(w.error?.code).toBe("forbidden");
    expect(world.artifacts.calls.size).toBe(0);
  });
});

describe("R-API-11: name to ID", () => {
  it("section 23, Name to ID: GET /v1/rooms/<name> with no credential gives the RoomRef; an unknown name is not-found", async () => {
    const roomName = name();
    const { drafted, sig } = await foundImport(importRepo(), { roomName });
    prepareWorld(drafted.genesis);
    const room = await worker.found(drafted.genesis, sig, drafted.draft);
    const res = await exports.default.fetch(`${base}/${encodeURIComponent(roomName)}`);
    expect(res.status).toBe(200);
    expect((await res.json()) as RoomRef).toEqual({ room, name: roomName });
    expect(((await (await exports.default.fetch(`${base}/${room}`)).json()) as RoomRef).name).toBe(roomName);
    expect((await exports.default.fetch(`${base}/no-such-room`)).status).toBe(404);
  });
});

describe("R-PUB-10: one publisher per repository", () => {
  it("a room that the registry does not bind to its repository publishes nothing and drives no landing", async () => {
    const r = await makeRoom();
    await r.admin.ok("claim", null, { goal: "g", scope: ["src/**"] });
    await runInDurableObject(r.stub as unknown as DurableObjectStub<Room>, (room: Room) => {
      const core = room.core as unknown as { boundCache: boolean; bound: () => Promise<boolean> };
      core.boundCache = false;
      core.bound = async () => false;
    });
    const p = (await r.stub.publishLog()) as { error?: { code: string } };
    expect(p.error?.code).toBe("forbidden");
    expect(r.world.log.ref).toBeNull();
    const reconciles = r.world.artifacts.calls.get("readMain") ?? 0;
    await call(r.stub.tick());
    expect(r.world.artifacts.calls.get("readMain") ?? 0).toBe(reconciles);
  });
});
