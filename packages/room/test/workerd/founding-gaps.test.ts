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
import { runInDurableObject } from "cloudflare:test";
import type { Claim, DraftedRoom, Genesis, Landing, LandOp, RoomId } from "@generalbusiness/artroom-contract";
import { EMPTY_TREE_SHA, firstCommit } from "@generalbusiness/artroom-git";
import { draftRoom, foundRoom } from "../../src/founding.ts";
import { roomIdOf } from "../../src/ids.ts";
import { hex } from "../../src/crypto.ts";
import type { RoomEnv } from "../../src/config.ts";
import { FakeArtifactsHost, artifactsErrors, type Registry, type Room } from "../../src/index.ts";
import { Client, call, clock, expectOk, failure, grant, logOf, newKeyPair, placeRepo, randomBytes, sign, tick, worldFor, type TestRoom, type World } from "./support.ts";

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
      // Refused: the token no longer admits the push, so git answers without creating main.
      else a.on("firstCommit", () => [...a.repo(a.canonical).tokens.values()].forEach((t) => (t.revoked = true)));
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
      expect(a.remoteCalls.get("firstCommit"), fault).toBe(fault === "lose" ? 1 : 2);
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
  it("before the genesis is sealed, no token is left on the new repository: the create's 24-hour token and the first commit's are both revoked, each recorded first", async () => {
    const f = await draftPublic();
    const a = f.world.artifacts;
    const id = await worker.found(f.drafted.genesis, f.sig, f.drafted.draft);
    const canonical = a.repo(a.canonical);
    expect(canonical.tokens.size).toBeGreaterThanOrEqual(2);
    expect([...canonical.tokens.values()].some((t) => t.expiresAt - t.createdAt === 86_400_000)).toBe(true);
    expect(canonical.activeTokens()).toEqual([]);
    expect((await duties(id)).map((d) => [d.kind, d.state])).toEqual([
      ["repo-create", "done"],
      ["inventory", "done"],
      ["mint", "done"],
      ["token", "done"],
    ]);
  });

  it("a create whose answer is lost: the step was recorded before it was sent, so the same found revokes the 24-hour token nobody saw", async () => {
    const f = await draftPublic();
    const a = f.world.artifacts;
    const id = roomIdOf(f.drafted.genesis);
    a.loseReply("create");
    await rejects(worker.found(f.drafted.genesis, f.sig, f.drafted.draft), "unavailable");
    expect((await duties(id)).map((d) => [d.kind, d.state])).toEqual([["repo-create", "in-flight"]]);
    expect(a.repo(a.canonical).activeTokens().length).toBe(1);
    expect(await worker.found(f.drafted.genesis, f.sig, f.drafted.draft)).toBe(id);
    expect(a.repo(a.canonical).activeTokens()).toEqual([]);
    expect((await duties(id)).every((d) => d.state === "done")).toBe(true);
  });

  it("if the revocation fails, found does not seal; the alarm revokes the token though the founder never returns, and the same found then completes", async () => {
    const f = await draftPublic();
    const a = f.world.artifacts;
    const id = roomIdOf(f.drafted.genesis);
    // Listing fails: the inventory cannot confirm, so the debt stays.
    a.failRemote("listTokens", artifactsErrors.transport());
    a.failRemote("revokeToken", artifactsErrors.transport(), artifactsErrors.transport());
    await rejects(worker.found(f.drafted.genesis, f.sig, f.drafted.draft), "unavailable");
    expect(await logOf(id)).toEqual([]);
    expect(a.repo(a.canonical).activeTokens().length).toBeGreaterThan(0);
    expect((await duties(id)).some((d) => d.state !== "done")).toBe(true);
    // The alarm is set for the debt.
    expect(await runInDurableObject(roomStub(id), (_r: Room, state: DurableObjectState) => state.storage.getAlarm())).not.toBeNull();
    // The alarm's work, with nobody calling found: the token is revoked, and the room is still not founded.
    await call(roomStub(id).tick());
    expect(a.repo(a.canonical).activeTokens()).toEqual([]);
    expect((await duties(id)).every((d) => d.state === "done")).toBe(true);
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
