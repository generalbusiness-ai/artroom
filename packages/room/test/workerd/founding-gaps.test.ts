/**
 * The founding gaps the first live deploy found (request b6b51de7):
 * 1. a newly founded public room lands its first lane: founding gives main
 *    one commit with no files, and a land on a repository with no main does
 *    not say retry;
 * 2. the write token Artifacts returns when the Room creates the repository
 *    is revoked durably, in lane B's cleanup ledger, before the genesis is
 *    sealed, and by the alarm if the founder never returns;
 * 3. one deployment both founds public rooms and imports, with a binding per
 *    namespace; a source with no binding is refused before anything is bound.
 */

import { describe, expect, it } from "vitest";
import { env, exports } from "cloudflare:workers";
import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import type { Claim, DraftedRoom, Genesis, Landing, LandOp, RoomId } from "@generalbusiness/artroom-contract";
import { EMPTY_TREE_SHA, firstCommit } from "@generalbusiness/artroom-git";
import { draftRoom, foundRoom, roomSeed } from "../../src/founding.ts";
import { roomIdOf } from "../../src/ids.ts";
import { hex } from "../../src/crypto.ts";
import type { RoomEnv } from "../../src/config.ts";
import { FakeArtifactsHost, artifactsErrors, setAlarmDelay, setFault, type Registry, type Room } from "../../src/index.ts";
import { Client, advance, call, clock, expectOk, failure, grant, logOf, newKeyPair, placeRepo, randomBytes, sign, tick, worldFor, type TestRoom, type World } from "./support.ts";

const worker = exports.default as unknown as {
  draft(input: unknown): Promise<DraftedRoom>;
  found(genesis: Genesis, sig: string, draft: string): Promise<RoomId>;
};
const reg = () => env.REGISTRY.get(env.REGISTRY.idFromName("registry")) as unknown as DurableObjectStub<Registry>;
const roomStub = (id: string) => env.ROOMS.get(env.ROOMS.idFromName(id)) as unknown as DurableObjectStub<Room>;
const name = () => `gaps/${hex(randomBytes(6))}`;

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

interface Founded {
  readonly admin: ReturnType<typeof newKeyPair>;
  readonly drafted: DraftedRoom;
  readonly sig: string;
  readonly world: World;
}

/** Draft a public room and register its world; `found` is left to the test. */
async function draftPublic(): Promise<Founded> {
  const admin = newKeyPair();
  const drafted = await worker.draft({ name: name(), repo: { kind: "new" }, admin: { handle: "@founder", key: admin.key }, recovery: newKeyPair().key });
  return { admin, drafted, sig: sign(admin.seed, "artroom-genesis-v1", drafted.genesis), world: worldFor(roomIdOf(drafted.genesis)) };
}

function testRoom(f: Founded, id: RoomId): TestRoom {
  const base = { id, stub: roomStub(id) as never };
  return { id, genesis: f.drafted.genesis, stub: base.stub, world: f.world, admin: new Client(base, f.admin), recovery: new Client(base, newKeyPair()), roomKey: f.drafted.genesis.roomKey };
}

async function landOp(room: TestRoom, op: string): Promise<LandOp> {
  return (await room.admin.read({ q: "op", op: op as never })) as LandOp;
}

/** Claim, push to the lane's fork on `host`, propose and land; returns the head and the operation once settled. */
async function landLane(room: TestRoom, host: FakeArtifactsHost, files: Record<string, string>) {
  const claim = await room.admin.ok<Claim>("claim", null, { goal: "first lane", scope: ["docs/**"] });
  const head = host.commit(host.main, files);
  host.push(claim.lane, head);
  await room.admin.ok("propose", { lane: claim.lane }, { lease: 1, expectedGeneration: 0, head, summary: "first" });
  const l = await room.admin.ok<Landing>("land", { lane: claim.lane, generation: 1 }, { lease: 1, head });
  await tick(room, 3);
  return { lane: claim.lane, head, op: await landOp(room, l.op.id) };
}

/** Lane B's cleanup duties, from inside the room's Durable Object. */
async function duties(id: string) {
  return runInDurableObject(roomStub(id), (room: Room) => room.core.workspaces.duties());
}

// ------------------------------------------------------------------ 1. the first landing

describe("gap 1: a newly founded public room lands its first lane", () => {
  it("founding gives main one commit with no files, fixed by the genesis's time; the first lane lands on it", async () => {
    const f = await draftPublic();
    const id = await worker.found(f.drafted.genesis, f.sig, f.drafted.draft);
    const a = f.world.artifacts;
    const first = await firstCommit(Date.parse(f.drafted.genesis.createdAt));
    expect(a.main).toBe(first.commit);
    expect(a.treeOf(a.main!)).toBe(EMPTY_TREE_SHA);
    expect(a.parents(a.main!)).toEqual([]);
    // The default policy: main has no .artroom/ (R-POL-7).
    expect((await logOf(id)).map((e) => (e.entry as { event: { type: string } }).event.type)).toEqual(["genesis", "policy-activated"]);
    // The same found again: the same room, and main is not touched.
    expect(await worker.found(f.drafted.genesis, f.sig, f.drafted.draft)).toBe(id);
    expect(a.main).toBe(first.commit);
    expect(a.remoteCalls.get("firstCommit")).toBe(1);
    const room = testRoom(f, id);
    const { head, op } = await landLane(room, a, { "docs/first.md": "the first lane\n" });
    expect(op).toMatchObject({ state: "landed", integration: head });
    expect(a.main).toBe(head);
    expect(a.parents(head)).toEqual([first.commit]);
  });

  it("a first commit whose push fails, is refused, or whose answer is lost: found is unavailable, the binding stays, and the same found completes with one first commit", async () => {
    for (const fault of ["fail", "refuse", "lose"] as const) {
      const f = await draftPublic();
      const a = f.world.artifacts;
      if (fault === "fail") a.failRemote("firstCommit");
      else if (fault === "lose") a.loseReply("firstCommit");
      // Refused: the token no longer admits the push, so git answers without creating main. Each round retires the
      // repository and makes it again; after three rounds found gives up.
      else for (let i = 0; i < 3; i++) a.on("firstCommit", () => [...a.repo(a.canonical).tokens.values()].forEach((t) => (t.revoked = true)));
      const r = await (exports.default as unknown as { fetch(u: string, i: RequestInit): Promise<Response> }).fetch("https://artroom.test/v1/rooms/found", {
        method: "POST",
        body: JSON.stringify({ genesis: f.drafted.genesis, sig: f.sig, draft: f.drafted.draft }),
      });
      expect(r.status, fault).toBe(503);
      expect(await logOf(roomIdOf(f.drafted.genesis))).toEqual([]);
      expect((await reg().byRepo(f.drafted.genesis.repo))?.room).toBe(roomIdOf(f.drafted.genesis));
      const id = await worker.found(f.drafted.genesis, f.sig, f.drafted.draft);
      expect(a.main, fault).toBe((await firstCommit(Date.parse(f.drafted.genesis.createdAt))).commit);
      // A lost answer applied: the retry finds main and pushes nothing more.
      expect(a.remoteCalls.get("firstCommit"), fault).toBe({ fail: 2, lose: 1, refuse: 4 }[fault]);
      expect(a.repo(a.canonical).activeTokens(), fault).toEqual([]);
      expect((await logOf(id)).length).toBe(2);
    }
  });

  it("a land on a repository with no main fails with not-found, not retryable, and its message does not say retry; nothing is recorded", async () => {
    // An imported repository with no commits: the Room reads it and never writes it.
    const admin = newKeyPair();
    const repo = `acme-import/${hex(randomBytes(16))}`;
    const drafted = await worker.draft({ name: name(), repo: { kind: "import", grant: grant(repo, admin.key) }, admin: { handle: "@founder", key: admin.key }, recovery: newKeyPair().key });
    const world = worldFor(roomIdOf(drafted.genesis));
    placeRepo(world, repo);
    world.artifacts.canonicalRepo();
    const id = await worker.found(drafted.genesis, sign(admin.seed, "artroom-genesis-v1", drafted.genesis), drafted.draft);
    const room = testRoom({ admin, drafted, sig: "", world }, id);
    const claim = await room.admin.ok<Claim>("claim", null, { goal: "g", scope: ["docs/**"] });
    const a = world.artifacts;
    const head = a.commit(null, { "docs/a.md": "a\n" });
    a.push(claim.lane, head);
    await room.admin.ok("propose", { lane: claim.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" });
    const before = (await logOf(id)).length;
    const e = await failure(room.stub.submit(room.admin.signed("land", { lane: claim.lane, generation: 1 }, { lease: 1, head })));
    expect(e.code).toBe("not-found");
    expect(e.retryable).toBe(false);
    expect(e.message).toMatch(/no main/);
    expect(e.message).not.toMatch(/retry/i);
    expect((await logOf(id)).length).toBe(before);
    expect(a.main).toBeNull();
  });
});

// ------------------------------------------------------------------ 2. the creation token

describe("gap 2: the token Artifacts returns when the Room creates the repository is revoked durably", () => {
  it("before the genesis is sealed, no token is left on the new repository: the create's 24-hour token pushed the first commit and was revoked; nothing else was minted", async () => {
    const f = await draftPublic();
    const a = f.world.artifacts;
    const id = await worker.found(f.drafted.genesis, f.sig, f.drafted.draft);
    const canonical = a.repo(a.canonical);
    expect(canonical.tokens.size).toBe(1);
    expect([...canonical.tokens.values()].every((t) => t.expiresAt - t.createdAt === 86_400_000 && t.revoked)).toBe(true);
    expect(canonical.activeTokens()).toEqual([]);
    expect((await duties(id)).map((d) => [d.kind, d.state, d.doneReason])).toEqual([
      ["repo-create", "done", "sealed"],
      ["token", "done", "revoked"],
      ["inventory", "done", "inventory"],
    ]);
    // The first commit was pushed with the create's own token: nothing was minted on the repository.
    expect(a.remoteCalls.get("createToken")).toBeUndefined();
  });

  it("a create whose answer is lost: its incarnation is abandoned and deleted with the 24-hour token nobody saw; the room is founded on a new one", async () => {
    const f = await draftPublic();
    const a = f.world.artifacts;
    const id = roomIdOf(f.drafted.genesis);
    const base = f.drafted.genesis.repo.split("/")[1]!;
    a.loseReply("create");
    expect(await worker.found(f.drafted.genesis, f.sig, f.drafted.draft)).toBe(id);
    const names = [...a.repos.keys()].filter((n) => n.startsWith(`${base}-`));
    expect(names).toEqual([a.canonical]);
    expect(a.remoteCalls.get("create")).toBe(2);
    expect(a.repo(a.canonical).activeTokens()).toEqual([]);
    expect((await duties(id)).every((d) => d.state === "done")).toBe(true);
  });

  it("if the revocation fails, found does not seal; the alarm revokes the token though the founder never returns, and the same found then completes", async () => {
    const f = await draftPublic();
    const a = f.world.artifacts;
    const id = roomIdOf(f.drafted.genesis);
    // The revocation has no answer: the token stays owed, and the genesis is not sealed.
    a.failRemote("revokeToken", artifactsErrors.transport());
    await rejects(worker.found(f.drafted.genesis, f.sig, f.drafted.draft), "unavailable");
    expect(await logOf(id)).toEqual([]);
    expect(a.repo(a.canonical).activeTokens().length).toBeGreaterThan(0);
    expect((await duties(id)).some((d) => d.state !== "done")).toBe(true);
    // The alarm is set for the debt.
    expect(await runInDurableObject(roomStub(id), (_r: Room, state: DurableObjectState) => state.storage.getAlarm())).not.toBeNull();
    // The alarm's work, with nobody calling found: the token is revoked, and the room is still not founded.
    await call(roomStub(id).tick());
    expect(a.repo(a.canonical).activeTokens()).toEqual([]);
    expect((await duties(id)).filter((d) => d.state === "owed")).toEqual([]);
    expect(await logOf(id)).toEqual([]);
    expect(await worker.found(f.drafted.genesis, f.sig, f.drafted.draft)).toBe(id);
    expect(a.repo(a.canonical).activeTokens()).toEqual([]);
  });

  it("an import creates nothing, mints nothing at founding, and owes nothing", async () => {
    const admin = newKeyPair();
    const repo = `acme-import/${hex(randomBytes(16))}`;
    const drafted = await worker.draft({ name: name(), repo: { kind: "import", grant: grant(repo, admin.key) }, admin: { handle: "@founder", key: admin.key }, recovery: newKeyPair().key });
    const world = worldFor(roomIdOf(drafted.genesis));
    placeRepo(world, repo);
    world.artifacts.main = world.artifacts.commit(null, { "README.md": "# imported\n" });
    const main = world.artifacts.main;
    const id = await worker.found(drafted.genesis, sign(admin.seed, "artroom-genesis-v1", drafted.genesis), drafted.draft);
    expect(world.artifacts.remoteCalls.get("create")).toBeUndefined();
    expect(world.artifacts.remoteCalls.get("createToken")).toBeUndefined();
    expect(world.artifacts.remoteCalls.get("firstCommit")).toBeUndefined();
    expect(world.artifacts.main).toBe(main);
    expect(await duties(id)).toEqual([]);
  });
});

// ------------------------------------------------------------------ 3. one deployment, both modes

describe("gap 3: one deployment founds public rooms and imports", () => {
  it("with a binding per namespace, an imported room reads, forks, lands and publishes in the import namespace, and the public namespace is untouched", async () => {
    // A public room on this deployment first.
    const p = await draftPublic();
    await worker.found(p.drafted.genesis, p.sig, p.drafted.draft);
    // Then an import, in a world whose primary binding is the public namespace and whose second is the import namespace.
    const admin = newKeyPair();
    const repo = `acme-import/${hex(randomBytes(16))}`;
    const drafted = await worker.draft({ name: name(), repo: { kind: "import", grant: grant(repo, admin.key) }, admin: { handle: "@founder", key: admin.key }, recovery: newKeyPair().key });
    const world = worldFor(roomIdOf(drafted.genesis));
    const imports = new FakeArtifactsHost("acme-import", () => clock.now);
    imports.canonical = repo.split("/")[1]!;
    imports.main = imports.commit(null, { "README.md": "# imported\n" });
    world.imports = imports;
    expect(world.artifacts.namespace).toBe("artroom-public");
    const id = await worker.found(drafted.genesis, sign(admin.seed, "artroom-genesis-v1", drafted.genesis), drafted.draft);
    const room = testRoom({ admin, drafted, sig: "", world }, id);
    // The workspace is a fork in the import namespace.
    const claimed = await room.admin.ok<Claim>("claim", null, { goal: "ws", scope: ["src/**"] });
    expectOk(await room.admin.request<{ id: string }>({ kind: "workspace", lane: claimed.lane, lease: 1 }));
    await tick(room, 2);
    expect(imports.remoteCalls.get("fork")).toBe(1);
    const { head, op } = await landLane(room, imports, { "docs/imported.md": "landed in the import namespace\n" });
    expect(op).toMatchObject({ state: "landed", integration: head });
    expect(imports.main).toBe(head);
    const published = await call<{ commit: string }>(room.stub.publishLog());
    expect(imports.logRef).toBe(published.commit);
    // Nothing of this room is in the public namespace.
    expect(world.artifacts.repos.size).toBe(0);
    expect(world.artifacts.remoteCalls.size).toBe(0);
  });

  it("a deployment with no import namespace refuses an import at draft, and says why", async () => {
    const admin = newKeyPair();
    const single = { ...env, IMPORT_NAMESPACE: undefined } as unknown as RoomEnv;
    const input = { name: name(), repo: { kind: "import", grant: grant(`acme-import/${hex(randomBytes(16))}`, admin.key) }, admin: { handle: "@f", key: admin.key }, recovery: newKeyPair().key };
    await expect(draftRoom(single, input, clock.now)).rejects.toMatchObject({ code: "forbidden", message: expect.stringMatching(/does not import repositories.*IMPORT_ARTIFACTS/) });
    // A grant for the public namespace is refused as before.
    const pub = { ...input, repo: { kind: "import", grant: grant(`artroom-public/${hex(randomBytes(16))}`, admin.key) } };
    await expect(draftRoom(env as unknown as RoomEnv, pub, clock.now)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("a deployment whose binding is not the public namespace refuses public founding at draft and at found, before anything is bound", async () => {
    const f = await draftPublic();
    const elsewhere = { ...env, ARTIFACTS_NAMESPACE: "acme-import" } as unknown as RoomEnv;
    const input = { name: name(), repo: { kind: "new" }, admin: { handle: "@f", key: f.admin.key }, recovery: newKeyPair().key };
    await expect(draftRoom(elsewhere, input, clock.now)).rejects.toMatchObject({ code: "forbidden", message: expect.stringContaining("does not found public rooms") });
    await expect(foundRoom(elsewhere, f.drafted.genesis, f.sig, f.drafted.draft)).rejects.toMatchObject({ code: "forbidden" });
    expect(await reg().byRepo(f.drafted.genesis.repo)).toBeNull();
    expect(await reg().lookup(f.drafted.genesis.name)).toBeNull();
    expect(f.world.artifacts.remoteCalls.size).toBe(0);
  });
});

// ------------------------------------------------------------------ review a35b4b61, 3: bindings, not only names

describe("review a35b4b61: a mode needs its binding, checked before anything is bound", () => {
  it("IMPORT_NAMESPACE with no IMPORT_ARTIFACTS binding: draft and found refuse the import, and the registry binds neither the repository nor the name", async () => {
    const admin = newKeyPair();
    const repo = `acme-import/${hex(randomBytes(16))}`;
    const input = { name: name(), repo: { kind: "import", grant: grant(repo, admin.key) }, admin: { handle: "@f", key: admin.key }, recovery: newKeyPair().key };
    const unbound = { ...env, IMPORT_ARTIFACTS: undefined } as unknown as RoomEnv;
    await expect(draftRoom(unbound, input, clock.now)).rejects.toMatchObject({ code: "forbidden", message: expect.stringContaining("no IMPORT_ARTIFACTS binding") });
    // A genesis drafted where the binding exists, then found where it does not.
    const d = await draftRoom(env as unknown as RoomEnv, input, clock.now);
    const id = roomIdOf(d.genesis);
    const world = worldFor(id);
    await expect(foundRoom(unbound, d.genesis, sign(admin.seed, "artroom-genesis-v1", d.genesis), d.draft)).rejects.toMatchObject({ code: "forbidden" });
    expect(await reg().byRepo(repo)).toBeNull();
    expect(await reg().lookup(d.genesis.name)).toBeNull();
    expect(await logOf(id)).toEqual([]);
    expect(world.artifacts.remoteCalls.size).toBe(0);
  });

  it("no ARTIFACTS binding: draft and found refuse public founding, and nothing is bound", async () => {
    const f = await draftPublic();
    const unbound = { ...env, ARTIFACTS: undefined } as unknown as RoomEnv;
    const input = { name: name(), repo: { kind: "new" }, admin: { handle: "@f", key: f.admin.key }, recovery: newKeyPair().key };
    await expect(draftRoom(unbound, input, clock.now)).rejects.toMatchObject({ code: "forbidden", message: expect.stringContaining("no ARTIFACTS binding") });
    await expect(foundRoom(unbound, f.drafted.genesis, f.sig, f.drafted.draft)).rejects.toMatchObject({ code: "forbidden" });
    expect(await reg().byRepo(f.drafted.genesis.repo)).toBeNull();
    expect(await reg().lookup(f.drafted.genesis.name)).toBeNull();
    expect(f.world.artifacts.remoteCalls.size).toBe(0);
  });
});

// ------------------------------------------------------------------ review 3eb7bc44: a late delete never reaches the room's repository

describe("review 3eb7bc44: each creation attempt is its own incarnation, and a delete only ever reaches an abandoned one", () => {
  /** Make the next delete lose its answer before it applies; returns a function that applies it late. */
  function loseNextDelete(a: World["artifacts"]): () => Promise<boolean> {
    const real = a.binding.delete;
    let late: (() => Promise<boolean>) | null = null;
    a.binding.delete = async (name: string) => {
      a.binding.delete = real;
      late = () => real(name);
      throw artifactsErrors.transport();
    };
    return () => late!();
  }

  it("a late delete after the seal and a normal landing, across a restart: the room's repository, its landed main and its log survive", async () => {
    const f = await draftPublic();
    const a = f.world.artifacts;
    const id = roomIdOf(f.drafted.genesis);
    // The first incarnation's create applies and its answer is lost; its delete's answer is lost too.
    a.loseReply("create");
    const lateDelete = loseNextDelete(a);
    expect(await worker.found(f.drafted.genesis, f.sig, f.drafted.draft)).toBe(id);
    const sealed = a.canonical;
    expect((await duties(id)).some((d) => d.kind === "repo-delete" && d.state !== "done")).toBe(true);
    // A restart of the room's Durable Object, then ordinary work: a lane lands.
    await evictDurableObject(roomStub(id));
    const room = testRoom(f, id);
    const { head, op } = await landLane(room, a, { "docs/after.md": "landed before the late delete\n" });
    expect(op).toMatchObject({ state: "landed" });
    // The lost delete applies now: it reaches only the abandoned incarnation.
    await lateDelete();
    expect(a.repos.has(sealed)).toBe(true);
    expect(a.main).toBe(head);
    // The alarm, when the debt is due, settles the abandoned incarnation and leaves the room's repository alone.
    advance(10 * 60_000);
    await tick(room, 2);
    expect((await duties(id)).filter((d) => d.state !== "done")).toEqual([]);
    expect(a.repos.has(sealed)).toBe(true);
    expect(a.main).toBe(head);
    await call(room.stub.publishLog());
    expect(f.world.log.ref).not.toBeNull();
  });

  it("a lost delete that applied, then NOT_FOUND: settled as gone; the room's repository is untouched", async () => {
    const f = await draftPublic();
    const a = f.world.artifacts;
    const id = roomIdOf(f.drafted.genesis);
    a.loseReply("create");
    const real = a.binding.delete;
    a.binding.delete = async (name: string) => {
      a.binding.delete = real;
      await real(name);
      throw artifactsErrors.transport();
    };
    expect(await worker.found(f.drafted.genesis, f.sig, f.drafted.draft)).toBe(id);
    const base = f.drafted.genesis.repo.split("/")[1]!;
    expect([...a.repos.keys()].filter((n) => n.startsWith(`${base}-`))).toEqual([a.canonical]);
    expect((await duties(id)).some((d) => d.kind === "repo-delete" && d.state !== "done")).toBe(true);
    advance(10 * 60_000);
    await tick(testRoom(f, id), 2);
    expect((await duties(id)).filter((d) => d.state !== "done")).toEqual([]);
    expect(a.main).toBe((await firstCommit(Date.parse(f.drafted.genesis.createdAt))).commit);
  });
});

// ------------------------------------------------------------------ plan 004: a wake-up is persisted before the first founding create

describe("plan 004: the founding debt has a persisted alarm before any create is sent, and a fresh object schedules what it finds", () => {
  /** Hold the next create before it applies; `release` lets it apply, and its answer goes to whoever is still waiting. */
  function holdCreate(a: World["artifacts"]): { entered: Promise<string>; release: () => void } {
    const real = a.binding.create;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let enter!: (name: string) => void;
    const entered = new Promise<string>((r) => (enter = r));
    a.binding.create = async (name: string, opts?: { readOnly?: boolean; description?: string; setDefaultBranch?: string }) => {
      a.binding.create = real;
      enter(name);
      await gate;
      return real(name, opts);
    };
    return { entered, release };
  }
  const alarmOf = (id: string) => runInDurableObject(roomStub(id), (_r: Room, state: DurableObjectState) => state.storage.getAlarm());
  /** Abort the room's object, as a host that stops; the next stub reaches a fresh one. */
  const stop = (id: string) => runInDurableObject(roomStub(id), (_r: Room, state: DurableObjectState) => state.abort("host stopped")).catch(() => undefined);
  const failAt = (point: string, times = 1) => {
    let left = times;
    setFault((p) => {
      if (p !== point || left <= 0) return;
      if (--left === 0) setFault(null);
      throw new Error(`interrupted at ${point}`);
    });
  };

  it("the alarm is in storage while the first create is outstanding; after the host stops, a fresh object's alarm alone deletes the late repository and its token; the founder never retries", async () => {
    const f = await draftPublic();
    const a = f.world.artifacts;
    const g = f.drafted.genesis;
    const id = roomIdOf(g);
    // The create is dispatched and never answers: the host stops while waiting for it. (A plain flag, not a promise
    // of the test's: resolving one from inside the object keeps the test pool from aborting the object.)
    const real = a.binding.create;
    let name: string | null = null;
    a.binding.create = async (n: string) => {
      a.binding.create = real;
      name = n;
      return new Promise<never>(() => {});
    };
    // The Worker's founding steps, then the room's found, started inside the object and sent once: the founder never retries.
    await call(reg().bind(g.repo, id, g.name));
    const seed = roomSeed(env as unknown as RoomEnv, f.drafted.draft);
    await runInDurableObject(roomStub(id), (room: Room) => {
      void room.core.found(g, f.sig, seed).catch(() => undefined);
    });
    while (name === null) await new Promise((r) => setTimeout(r, 2));
    const created: string = name;
    // What the object has persisted while the create is outstanding.
    const seen = await runInDurableObject(roomStub(id), async (room: Room, state: DurableObjectState) => ({ alarm: await state.storage.getAlarm(), duties: room.core.workspaces.duties() }));
    expect(seen.duties.map((d) => [d.kind, d.state])).toEqual([["repo-create", "in-flight"]]);
    expect(seen.alarm, "an alarm is persisted before the provider was asked").not.toBeNull();
    await stop(id);
    // The create applies late, with its 24-hour token.
    await real(created);
    expect(a.repo(created).activeTokens()).toHaveLength(1);
    // Only the scheduled alarm, on a fresh object.
    expect(await runDurableObjectAlarm(roomStub(id))).toBe(true);
    expect(a.repos.has(created)).toBe(false);
    expect((await duties(id)).filter((d) => d.state !== "done")).toEqual([]);
    expect(await logOf(id)).toEqual([]);
    expect(a.remoteCalls.get("create")).toBe(1);
  });

  it("an alarm that cannot be stored: no create is sent, the step is closed as never sent, the alarm cache claims nothing, and the same found later completes", async () => {
    const f = await draftPublic();
    const a = f.world.artifacts;
    const g = f.drafted.genesis;
    const id = roomIdOf(g);
    failAt("room:set-alarm"); // the wake-up before the create
    await rejects(worker.found(g, f.sig, f.drafted.draft), "unavailable");
    expect(a.remoteCalls.get("create")).toBeUndefined();
    expect((await duties(id)).map((d) => [d.kind, d.state, d.doneReason])).toEqual([["repo-create", "done", "not-sent"]]);
    expect(await alarmOf(id)).toBeNull();
    // Nothing claimed the rejected alarm. (Debt recorded before a create, and kept, is shown in the git package's
    // workspaces test "plan 004: a wake-up that cannot be stored …".)
    expect(await runInDurableObject(roomStub(id), (room: Room) => (room as unknown as { scheduled: number | null }).scheduled)).toBeNull();
    expect(await worker.found(g, f.sig, f.drafted.draft)).toBe(id);
    expect(a.remoteCalls.get("create")).toBe(1);
  });

  it("an earlier alarm already in storage is kept when the founding wake-up asks for a later one", async () => {
    const f = await draftPublic();
    const a = f.world.artifacts;
    const id = roomIdOf(f.drafted.genesis);
    const earlier = Date.now() + 10 * 60_000; // before the test pool's alarm delay of an hour
    await runInDurableObject(roomStub(id), (_r: Room, state: DurableObjectState) => state.storage.setAlarm(earlier));
    const held = holdCreate(a);
    const founding = worker.found(f.drafted.genesis, f.sig, f.drafted.draft);
    await held.entered;
    expect(await alarmOf(id)).toBe(earlier);
    held.release();
    expect(await founding).toBe(id);
    expect(await alarmOf(id)).toBe(earlier);
  });

  it("wake-ups asked for at once, the earlier first: the earlier alarm stands", async () => {
    const id = roomIdOf((await draftPublic()).drafted.genesis);
    const earlier = Date.now() + 3_600_000;
    const later = earlier + 3_600_000;
    setAlarmDelay(null); // real alarm times, both far enough ahead not to run during the test
    try {
      await runInDurableObject(roomStub(id), async (room: Room) => {
        const wake = (room as unknown as { wake(at: number): Promise<void> }).wake.bind(room);
        await Promise.all([wake(earlier), wake(later)]);
      });
      expect(await alarmOf(id)).toBe(earlier);
    } finally {
      setAlarmDelay(3600_000);
      await runInDurableObject(roomStub(id), (_r: Room, state: DurableObjectState) => state.storage.deleteAlarm());
    }
  });

  it("a fresh object schedules founding debt it finds in an older ledger with no alarm; a fresh unfounded room schedules nothing", async () => {
    const f = await draftPublic();
    const a = f.world.artifacts;
    const id = roomIdOf(f.drafted.genesis);
    a.failRemote("revokeToken", artifactsErrors.transport());
    await rejects(worker.found(f.drafted.genesis, f.sig, f.drafted.draft), "unavailable");
    expect((await duties(id)).some((d) => d.state === "owed")).toBe(true);
    // As an older Room left it: the debt, and no alarm.
    await runInDurableObject(roomStub(id), (_r: Room, state: DurableObjectState) => state.storage.deleteAlarm());
    await stop(id);
    expect(await alarmOf(id), "the fresh object scheduled the debt").not.toBeNull();
    expect(await runDurableObjectAlarm(roomStub(id))).toBe(true);
    expect(a.repo(a.canonical).activeTokens()).toEqual([]);
    expect((await duties(id)).filter((d) => d.state === "owed")).toEqual([]);
    // A room that was never founded has nothing to schedule.
    const quiet = roomIdOf((await draftPublic()).drafted.genesis);
    expect(await alarmOf(quiet)).toBeNull();
  });
});

describe("request d29c09fa: the error upgrade drains in an unfounded room, through recovery and alarms alone", () => {
  const sample = ["legacy", "Founding", "Credential"].join("");

  /** Put a legacy provider text in a workspace step, set the store back to version 1, and reopen the object with no alarm stored. */
  async function legacyReopened(id: string, where: "done" | "any"): Promise<{ founded: boolean; cursor: unknown[]; alarm: number | null; debt: boolean }> {
    await runInDurableObject(roomStub(id), async (room: Room, state: DurableObjectState) => {
      expect(room.core.founded).toBe(false);
      const rows = room.core.sql.all(`SELECT id FROM artroom_ws_duty${where === "done" ? " WHERE state = 'done'" : ""} ORDER BY id`);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) room.core.sql.all("UPDATE artroom_ws_duty SET last_error = ? WHERE id = ?", `Authorization: Bearer ${sample}`, row["id"]!);
      room.core.sql.all("UPDATE schema_version SET v = 1 WHERE id = 1");
      await state.storage.deleteAlarm();
    });
    await runInDurableObject(roomStub(id), (_room: Room, state: DurableObjectState) => state.abort("legacy upgrade")).catch(() => undefined);
    return runInDurableObject(roomStub(id), async (room: Room, state: DurableObjectState) => ({
      founded: room.core.founded,
      cursor: room.core.sql.all("SELECT v FROM meta WHERE k = 'error_scrub'"),
      alarm: await state.storage.getAlarm(),
      debt: room.core.foundingDue() !== null,
    }));
  }

  async function drained(id: string) {
    for (let i = 0; i < 10; i++) if (!(await runDurableObjectAlarm(roomStub(id)))) break;
    return runInDurableObject(roomStub(id), (room: Room) => ({
      founded: room.core.founded,
      cursor: room.core.sql.all("SELECT v FROM meta WHERE k = 'error_scrub'"),
      rows: room.core.sql.all("SELECT last_error FROM artroom_ws_duty"),
    }));
  }

  // The checker's control (review of 18d69cda), as it was run.
  it("checker upgrade: an unfounded room scrubs terminal legacy founding errors using only recovery and alarms", async () => {
    const f = await draftPublic();
    const id = roomIdOf(f.drafted.genesis);
    const a = f.world.artifacts;
    a.failRemote("revokeToken", artifactsErrors.transport());
    await rejects(worker.found(f.drafted.genesis, f.sig, f.drafted.draft), "unavailable");
    advance(60_000);
    expect(await runDurableObjectAlarm(roomStub(id))).toBe(true);
    await runInDurableObject(roomStub(id), (room: Room) => expect(room.core.foundingDue()).toBeNull());
    const before = await legacyReopened(id, "done");
    expect(before.founded).toBe(false);
    expect(before.cursor).toHaveLength(1);
    expect(before.debt).toBe(false);
    expect(before.alarm).not.toBeNull(); // recovery stored the upgrade's alarm, with no founding debt left
    // No founding retry, and no direct call to scrubErrors: the production recovery and alarm route.
    const after = await drained(id);
    expect(JSON.stringify(after.rows), "terminal legacy founding error remains without any cleanup alarm").not.toContain(sample);
    expect(after.cursor).toHaveLength(0);
    expect(after.founded).toBe(false);
  });

  it("with founding debt still owed: the alarm runs both the upgrade and the founding cleanup, and every step's legacy text is gone", async () => {
    const f = await draftPublic();
    const id = roomIdOf(f.drafted.genesis);
    f.world.artifacts.failRemote("revokeToken", artifactsErrors.transport());
    await rejects(worker.found(f.drafted.genesis, f.sig, f.drafted.draft), "unavailable");
    const before = await legacyReopened(id, "any");
    expect(before).toMatchObject({ founded: false, debt: true });
    expect(before.cursor).toHaveLength(1);
    expect(before.alarm).not.toBeNull();
    advance(60_000);
    const after = await drained(id);
    expect(JSON.stringify(after.rows)).not.toContain(sample);
    expect(after.cursor).toHaveLength(0);
    expect(after.founded).toBe(false);
    // The founding debt is settled by the same alarms, as before.
    expect(await runInDurableObject(roomStub(id), (room: Room) => room.core.foundingDue())).toBeNull();
  });
});
