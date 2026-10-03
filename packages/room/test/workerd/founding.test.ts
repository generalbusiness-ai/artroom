/**
 * Founding (R-GEN-10 to R-GEN-13), the registry, one publisher per
 * repository (R-PUB-10) and finding a room's ID (R-API-11): the section 23
 * founding cases. Then the founding gaps the first live deploy found
 * (request b6b51de7): the first landing in a new public room, the creation
 * token's durable revocation, one deployment that founds and imports, the
 * incarnation of each creation attempt (review 3eb7bc44), the wake-up
 * persisted before the first create (plan 004), and the error upgrade in an
 * unfounded room (request d29c09fa).
 */

import { describe, expect, it } from "vitest";
import { env, exports } from "cloudflare:workers";
import { createExecutionContext, evictDurableObject, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import type { Claim, DraftedRoom, Genesis, RoomId, RoomRef } from "@generalbusiness/artroom-contract";
import { EMPTY_TREE_SHA, firstCommit } from "@generalbusiness/artroom-git";
import Artroom from "../../src/worker.ts";
import { draftRoom, foundRoom, roomSeed } from "../../src/founding.ts";
import { roomIdOf } from "../../src/ids.ts";
import { hex } from "../../src/crypto.ts";
import type { RoomEnv } from "../../src/config.ts";
import { FakeArtifactsHost, artifactsErrors, Room, setAlarmDelay, setFault, type Registry } from "../../src/index.ts";
import { land, opOf } from "./core-support.ts";
import { Client, advance, b64url, call, clock, day, expectOk, failure, grant, iso, logOf, makeRoom, newKeyPair, operator, placeRepo, randomBytes, sign, tick, worldFor, type TestRoom, type World } from "./support.ts";

const base = "https://artroom.test/v1/rooms";
const roomEnv = env as unknown as RoomEnv;
const worker = exports.default as unknown as {
  draft(input: unknown): Promise<DraftedRoom>;
  found(genesis: Genesis, sig: string, draft: string): Promise<RoomId>;
};
const reg = () => env.REGISTRY.get(env.REGISTRY.idFromName("registry")) as unknown as DurableObjectStub<Registry>;
const roomStub = (id: string) => env.ROOMS.get(env.ROOMS.idFromName(id)) as unknown as DurableObjectStub<Room>;
const post = (path: string, body: unknown) => exports.default.fetch(`${base}${path}`, { method: "POST", body: JSON.stringify(body) });
const importRepo = () => `acme-import/${hex(randomBytes(16))}`;
const name = () => `acme/${b64url(randomBytes(6))}`;
const kinds = (log: Awaited<ReturnType<typeof logOf>>) => log.map((e) => (e.entry as { event: { type: string } }).event.type);

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

type Keys = ReturnType<typeof newKeyPair>;
const draftInput = (admin: Keys, repo: unknown, roomName = name()) => ({ name: roomName, repo, admin: { handle: "@founder", key: admin.key }, recovery: newKeyPair().key });
const signedBy = (admin: Keys, genesis: Genesis) => sign(admin.seed, "artroom-genesis-v1", genesis);

/** Draft an import of `repo` over RPC, and sign its genesis. */
async function draftImport(repo: string, opts: { admin?: Keys; roomName?: string; notAfter?: string } = {}) {
  const admin = opts.admin ?? newKeyPair();
  const drafted = await worker.draft(draftInput(admin, { kind: "import", grant: grant(repo, admin.key, opts.notAfter) }, opts.roomName));
  return { admin, drafted, sig: signedBy(admin, drafted.genesis) };
}

/** Give the room its own in-memory Artifacts world before it is founded, with main holding one file. */
function prepareWorld(genesis: Genesis): World {
  const world = worldFor(roomIdOf(genesis));
  placeRepo(world, genesis.repo);
  world.artifacts.main = world.artifacts.commit(null, { "README.md": "# imported\n" });
  return world;
}

interface Drafted {
  readonly admin: Keys;
  readonly drafted: DraftedRoom;
  readonly sig: string;
  readonly world: World;
}

/** Draft a public room and register its world; `found` is left to the test. */
async function draftPublic(): Promise<Drafted> {
  const admin = newKeyPair();
  const drafted = await worker.draft(draftInput(admin, { kind: "new" }));
  return { admin, drafted, sig: signedBy(admin, drafted.genesis), world: worldFor(roomIdOf(drafted.genesis)) };
}

const found = (f: { drafted: DraftedRoom; sig: string }) => worker.found(f.drafted.genesis, f.sig, f.drafted.draft);

function testRoom(f: Drafted, id: RoomId): TestRoom {
  const at = { id, stub: roomStub(id) as never };
  return { id, genesis: f.drafted.genesis, stub: at.stub, world: f.world, admin: new Client(at, f.admin), recovery: new Client(at, newKeyPair()), roomKey: f.drafted.genesis.roomKey };
}

/** Claim, push to the lane's fork on `host`, propose and land; returns the head and the operation once settled. */
async function landLane(room: TestRoom, host: FakeArtifactsHost, files: Record<string, string>) {
  const claim = await room.admin.ok<Claim>("claim", null, { goal: "first lane", scope: ["docs/**"] });
  const head = host.commit(host.main, files);
  host.push(claim.lane, head);
  await room.admin.ok("propose", { lane: claim.lane }, { lease: 1, expectedGeneration: 0, head, summary: "first" });
  const l = await land(room.admin, claim.lane, head);
  await tick(room, 3);
  return { lane: claim.lane, head, op: await opOf(room, l.op.id) };
}

/** Lane B's cleanup duties, from inside the room's Durable Object. */
const duties = (id: string) => runInDurableObject(roomStub(id), (room: Room) => room.core.workspaces.duties());
const alarmOf = (id: string) => runInDurableObject(roomStub(id), (_r: Room, state: DurableObjectState) => state.storage.getAlarm());
/** Abort the room's object, as a host that stops; the next stub reaches a fresh one. */
const stop = (id: string) => runInDurableObject(roomStub(id), (_r: Room, state: DurableObjectState) => state.abort("host stopped")).catch(() => undefined);

describe("R-GEN-10, R-GEN-12: founding", () => {
  it("section 23, Isolated public creation over HTTPS: a fresh repository in the public namespace, created after the binding; entries 0 and 1; found again returns the same room", async () => {
    const admin = newKeyPair();
    const res = await post("", draftInput(admin, { kind: "new" }));
    expect(res.status).toBe(200);
    const drafted = (await res.json()) as DraftedRoom;
    expect(drafted.genesis.repo).toMatch(/^artroom-public\/[0-9a-f]{32}$/);
    expect(drafted.genesis.onboarding).toBeUndefined();
    const world = worldFor(roomIdOf(drafted.genesis));
    const body = { genesis: drafted.genesis, sig: signedBy(admin, drafted.genesis), draft: drafted.draft };
    const f = await post("/found", body);
    expect(f.status).toBe(200);
    const { room } = (await f.json()) as { room: RoomId };
    expect(room).toBe(roomIdOf(drafted.genesis));
    // Created in the deployment's Artifacts namespace, under the identity's incarnation for this creation attempt (review 3eb7bc44).
    expect(world.artifacts.namespace).toBe("artroom-public");
    expect(world.artifacts.canonical).toMatch(new RegExp(`^${drafted.genesis.repo.split("/")[1]!}-\\d+$`));
    expect(world.artifacts.repos.has(world.artifacts.canonical)).toBe(true);
    expect(await reg().byRepo(drafted.genesis.repo)).toEqual({ repo: drafted.genesis.repo, room, name: drafted.genesis.name });
    expect(((await (await post("/found", body)).json()) as { room: RoomId }).room).toBe(room);
    const log = await logOf(room);
    expect(kinds(log)).toEqual(["genesis", "policy-activated"]);
    expect((log[1]!.entry as unknown as { event: { checkers: unknown[] } }).event.checkers).toEqual([]);
  });

  it("section 23, Authorized import and Name to ID (R-GEN-11, R-API-11): the genesis carries the operator's grant and the room reads main after the binding; its name gives its ID with no credential; a taken name, or one shaped like a room ID, is refused", async () => {
    const repo = importRepo();
    const roomName = name();
    const f = await draftImport(repo, { roomName });
    expect(f.drafted.genesis.onboarding?.grant).toMatchObject({ repo, operator: operator.key });
    const world = prepareWorld(f.drafted.genesis);
    const room = await found(f);
    expect(world.artifacts.calls.get("readMain")).toBeGreaterThan(0);
    expect(world.artifacts.remoteCalls.get("create")).toBeUndefined();
    expect((await reg().byRepo(repo))?.room).toBe(room);
    const byName = await exports.default.fetch(`${base}/${encodeURIComponent(roomName)}`);
    expect(byName.status).toBe(200);
    expect((await byName.json()) as RoomRef).toEqual({ room, name: roomName });
    expect(((await (await exports.default.fetch(`${base}/${room}`)).json()) as RoomRef).name).toBe(roomName);
    expect((await exports.default.fetch(`${base}/no-such-room`)).status).toBe(404);
    const second = await draftImport(importRepo(), { roomName });
    prepareWorld(second.drafted.genesis);
    await rejects(found(second), "forbidden");
    await rejects(worker.draft(draftInput(newKeyPair(), { kind: "new" }, `room_${"a".repeat(32)}`)), "bad-request");
  });

  it("section 23, Unauthorized existing repository and Canonical-name aliases: a grant by a key that is no operator's, for another admin key, or for the public namespace is forbidden, and one naming a repository by name or URL is bad-request; at found too, with nothing read or bound", async () => {
    const repo = importRepo();
    const admin = newKeyPair();
    const draft = (g: unknown) => worker.draft(draftInput(admin, { kind: "import", grant: g }));
    await rejects(draft(grant(repo, admin.key, undefined, newKeyPair())), "forbidden");
    await rejects(draft(grant(repo, newKeyPair().key)), "forbidden");
    await rejects(draft(grant(`artroom-public/${hex(randomBytes(16))}`, admin.key)), "forbidden");
    for (const alias of ["acme/web", "https://github.com/acme/web"]) await rejects(draft(grant(alias, admin.key)), "bad-request");
    // At found: a genesis edited to carry a non-operator grant, re-signed by the admin.
    const { drafted } = await draftImport(repo, { admin });
    const genesis = { ...drafted.genesis, onboarding: grant(repo, admin.key, undefined, newKeyPair()) };
    const world = worldFor(roomIdOf(genesis));
    await rejects(worker.found(genesis, signedBy(admin, genesis), drafted.draft), "forbidden");
    expect(await reg().byRepo(repo)).toBeNull();
    expect(world.artifacts.calls.size).toBe(0);
  });

  it("section 23, Repository altered after draft (R-GEN-10): a genesis edited after the draft is refused, and nothing is bound or read: another repository is forbidden; another profile, format or room key is bad-request; an edit that is not signed again is unauthenticated", async () => {
    const repo = importRepo();
    const { admin, drafted, sig } = await draftImport(repo);
    const pub = await draftPublic();
    const other = importRepo();
    const edits: [Keys, DraftedRoom, Partial<Genesis>, string][] = [
      [admin, drafted, { repo: other }, "forbidden"],
      [pub.admin, pub.drafted, { repo: other }, "forbidden"],
      [admin, drafted, { profile: { policy: "artroom-jsonata-v1", jsonata: "9.9.9" } }, "bad-request"],
      [admin, drafted, { profile: { policy: "other", jsonata: "2.2.2" } as never }, "bad-request"],
      [admin, drafted, { roomKey: newKeyPair().key }, "bad-request"],
      [admin, drafted, { format: "x" as never }, "bad-request"],
    ];
    for (const [by, d, change, code] of edits) {
      const genesis = { ...d.genesis, ...change } as Genesis;
      const world = worldFor(roomIdOf(genesis));
      await rejects(worker.found(genesis, signedBy(by, genesis), d.draft), code);
      expect([JSON.stringify(change), world.artifacts.calls.size]).toEqual([JSON.stringify(change), 0]);
    }
    await rejects(worker.found({ ...drafted.genesis, createdAt: iso(clock.now + 1000) }, sig, drafted.draft), "unauthenticated");
    for (const r of [repo, other, pub.drafted.genesis.repo]) expect(await reg().byRepo(r)).toBeNull();
  });

  it("section 23, Duplicate import: after the room is founded, the same grant with a new name or recovery key is forbidden; the binding is unchanged", async () => {
    const repo = importRepo();
    const first = await draftImport(repo);
    prepareWorld(first.drafted.genesis);
    const room = await found(first);
    const before = await reg().byRepo(repo);
    for (const change of [{ name: name() }, { recovery: newKeyPair().key }]) {
      const genesis = { ...first.drafted.genesis, ...change };
      await rejects(worker.found(genesis, signedBy(first.admin, genesis), first.drafted.draft), "forbidden");
    }
    expect(await reg().byRepo(repo)).toEqual(before);
    expect(before?.room).toBe(room);
  });

  it("section 23, Simultaneous founding: two founds for one repository at once, with different names and keys: exactly one binds and founds; the other read nothing and has no log", async () => {
    const repo = importRepo();
    const a = await draftImport(repo);
    const b = await draftImport(repo);
    const wa = prepareWorld(a.drafted.genesis);
    const wb = prepareWorld(b.drafted.genesis);
    const results = await Promise.allSettled([found(a), found(b)]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ code: "forbidden" });
    const aWon = results[0]!.status === "fulfilled";
    expect((aWon ? wb : wa).artifacts.calls.size).toBe(0);
    expect(await logOf(roomIdOf((aWon ? b : a).drafted.genesis))).toEqual([]);
  });

  it("section 23, Recovery after binding: step 6 fails after the binding; the grant expires; another founder with a new grant is forbidden; the first founder's retry completes", async () => {
    const repo = importRepo();
    const f = await draftImport(repo, { notAfter: iso(clock.now + 60_000) });
    const world = prepareWorld(f.drafted.genesis);
    world.artifacts.failNext("readMain");
    await rejects(found(f), "unavailable");
    const id = roomIdOf(f.drafted.genesis);
    expect((await reg().byRepo(repo))?.room).toBe(id);
    advance(2 * 60_000);
    const other = await draftImport(repo, { notAfter: iso(clock.now + day) });
    prepareWorld(other.drafted.genesis);
    await rejects(found(other), "forbidden");
    expect(await found(f)).toBe(id);
    expect(await found(f)).toBe(id);
  });

  it("R-GEN-13: the Room itself refuses to found a genesis the registry does not bind, and reads nothing", async () => {
    const { drafted, sig } = await draftImport(importRepo());
    const world = prepareWorld(drafted.genesis);
    const seed = b64url(roomSeed(env as never, drafted.draft));
    const w = (await roomStub(roomIdOf(drafted.genesis)).found(drafted.genesis, sig, seed)) as { error?: { code: string } };
    expect(w.error?.code).toBe("forbidden");
    expect(world.artifacts.calls.size).toBe(0);
  });

  it("R-PUB-10: a room that the registry does not bind to its repository publishes nothing and drives no landing", async () => {
    const r = await makeRoom();
    await r.admin.ok("claim", null, { goal: "g", scope: ["src/**"] });
    await runInDurableObject(r.stub as unknown as DurableObjectStub<Room>, (room: Room) => {
      const core = room.core as unknown as { boundCache: boolean; bound: () => Promise<boolean> };
      core.boundCache = false;
      core.bound = async () => false;
    });
    expect((await failure(r.stub.publishLog())).code).toBe("forbidden");
    expect(r.world.log.ref).toBeNull();
    const reconciles = r.world.artifacts.calls.get("readMain") ?? 0;
    await call(r.stub.tick());
    expect(r.world.artifacts.calls.get("readMain") ?? 0).toBe(reconciles);
  });

  it("request 55be0661 (SEC-04): without a valid PUBLIC_URL neither the Worker nor a Room object starts, so no redemption can name a fallback host", async () => {
    const { PUBLIC_URL: _, ...without } = roomEnv;
    const bad = [without, { ...roomEnv, PUBLIC_URL: "artroom.example.workers.dev" }];
    for (const e of bad) expect(() => new Artroom(createExecutionContext(), e)).toThrow(/PUBLIC_URL must be/);
    expect(() => new Artroom(createExecutionContext(), roomEnv)).not.toThrow();
    await runInDurableObject(roomStub(`hygiene-${crypto.randomUUID()}`), (_room: Room, state: DurableObjectState) => {
      for (const e of bad) expect(() => new Room(state, e)).toThrow(/PUBLIC_URL must be/);
    });
  });
});

describe("request b6b51de7: a newly founded public room", () => {
  it("founding gives main one commit with no files, fixed by the genesis's time, pushed with the create's own 24-hour token, which is revoked before the genesis is sealed; the first lane lands on it", async () => {
    const f = await draftPublic();
    const id = await found(f);
    const a = f.world.artifacts;
    const first = await firstCommit(Date.parse(f.drafted.genesis.createdAt));
    expect(a.main).toBe(first.commit);
    expect(a.treeOf(a.main!)).toBe(EMPTY_TREE_SHA);
    expect(a.parents(a.main!)).toEqual([]);
    // The default policy: main has no .artroom/ (R-POL-7).
    expect(kinds(await logOf(id))).toEqual(["genesis", "policy-activated"]);
    // No token is left on the new repository, and nothing else was minted on it.
    const canonical = a.repo(a.canonical);
    expect([...canonical.tokens.values()].map((t) => [t.expiresAt - t.createdAt, t.revoked])).toEqual([[86_400_000, true]]);
    expect(a.remoteCalls.get("createToken")).toBeUndefined();
    expect((await duties(id)).map((d) => [d.kind, d.state, d.doneReason])).toEqual([
      ["repo-create", "done", "sealed"],
      ["token", "done", "revoked"],
      ["inventory", "done", "inventory"],
    ]);
    // The same found again: the same room, and main is not touched.
    expect(await found(f)).toBe(id);
    expect(a.main).toBe(first.commit);
    expect(a.remoteCalls.get("firstCommit")).toBe(1);
    const { head, op } = await landLane(testRoom(f, id), a, { "docs/first.md": "the first lane\n" });
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
      const r = await post("/found", { genesis: f.drafted.genesis, sig: f.sig, draft: f.drafted.draft });
      expect(r.status, fault).toBe(503);
      const id = roomIdOf(f.drafted.genesis);
      expect(await logOf(id)).toEqual([]);
      expect((await reg().byRepo(f.drafted.genesis.repo))?.room).toBe(id);
      expect(await found(f)).toBe(id);
      expect(a.main, fault).toBe((await firstCommit(Date.parse(f.drafted.genesis.createdAt))).commit);
      // A lost answer applied: the retry finds main and pushes nothing more.
      expect(a.remoteCalls.get("firstCommit"), fault).toBe({ fail: 2, lose: 1, refuse: 4 }[fault]);
      expect(a.repo(a.canonical).activeTokens(), fault).toEqual([]);
      expect((await logOf(id)).length).toBe(2);
    }
  });

  it("a land on a repository with no main fails with not-found, not retryable, and its message does not say retry; nothing is recorded", async () => {
    // An imported repository with no commits: the Room reads it and never writes it.
    const repo = importRepo();
    const f = await draftImport(repo);
    const world = worldFor(roomIdOf(f.drafted.genesis));
    placeRepo(world, repo);
    world.artifacts.canonicalRepo();
    const id = await found(f);
    const room = testRoom({ ...f, world }, id);
    const claim = await room.admin.ok<Claim>("claim", null, { goal: "g", scope: ["docs/**"] });
    const a = world.artifacts;
    const head = a.commit(null, { "docs/a.md": "a\n" });
    a.push(claim.lane, head);
    await room.admin.ok("propose", { lane: claim.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" });
    const before = (await logOf(id)).length;
    const e = await failure(room.stub.submit(room.admin.signed("land", { lane: claim.lane, generation: 1 }, { lease: 1, head })));
    expect(e).toMatchObject({ code: "not-found", retryable: false, message: expect.stringMatching(/no main/) });
    expect(e.message).not.toMatch(/retry/i);
    expect((await logOf(id)).length).toBe(before);
    expect(a.main).toBeNull();
  });

  it("if the creation token's revocation fails, found does not seal; with no alarm stored and the founder gone, a fresh object schedules the debt and its alarm revokes the token; the same found then completes. A room never founded schedules nothing", async () => {
    const f = await draftPublic();
    const a = f.world.artifacts;
    const id = roomIdOf(f.drafted.genesis);
    // The revocation has no answer: the token stays owed, and the genesis is not sealed.
    a.failRemote("revokeToken", artifactsErrors.transport());
    await rejects(found(f), "unavailable");
    expect(await logOf(id)).toEqual([]);
    expect(a.repo(a.canonical).activeTokens().length).toBeGreaterThan(0);
    expect((await duties(id)).some((d) => d.state === "owed")).toBe(true);
    expect(await alarmOf(id), "the alarm is set for the debt").not.toBeNull();
    // As an older Room left it: the debt, and no alarm. Then the host stops.
    await runInDurableObject(roomStub(id), (_r: Room, state: DurableObjectState) => state.storage.deleteAlarm());
    await stop(id);
    expect(await alarmOf(id), "the fresh object scheduled the debt").not.toBeNull();
    // The alarm's work, with nobody calling found: the token is revoked, and the room is still not founded.
    expect(await runDurableObjectAlarm(roomStub(id))).toBe(true);
    expect(a.repo(a.canonical).activeTokens()).toEqual([]);
    expect((await duties(id)).filter((d) => d.state === "owed")).toEqual([]);
    expect(await logOf(id)).toEqual([]);
    expect(await found(f)).toBe(id);
    expect(a.repo(a.canonical).activeTokens()).toEqual([]);
    expect(await alarmOf(roomIdOf((await draftPublic()).drafted.genesis))).toBeNull();
  });
});

describe("request b6b51de7 and review a35b4b61: one deployment founds public rooms and imports", () => {
  it("with a binding per namespace, an import creates and mints nothing at founding and owes nothing; it reads, forks, lands and publishes in the import namespace, and the public namespace is untouched", async () => {
    // A public room on this deployment first.
    await found(await draftPublic());
    // Then an import, in a world whose primary binding is the public namespace and whose second is the import namespace.
    const repo = importRepo();
    const f = await draftImport(repo);
    const world = worldFor(roomIdOf(f.drafted.genesis));
    const imports = new FakeArtifactsHost("acme-import", () => clock.now);
    imports.canonical = repo.split("/")[1]!;
    const main = (imports.main = imports.commit(null, { "README.md": "# imported\n" }));
    world.imports = imports;
    expect(world.artifacts.namespace).toBe("artroom-public");
    const id = await found(f);
    for (const call of ["create", "createToken", "firstCommit"]) expect([call, imports.remoteCalls.get(call as never)]).toEqual([call, undefined]);
    expect(imports.main).toBe(main);
    expect(await duties(id)).toEqual([]);
    const room = testRoom({ ...f, world }, id);
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

  it("a mode whose namespace or binding the deployment lacks is refused at draft, saying why, and at found; the registry binds neither the repository nor the name, and nothing is sent", async () => {
    const pub = await draftPublic();
    const admin = newKeyPair();
    const repo = importRepo();
    const importInput = draftInput(admin, { kind: "import", grant: grant(repo, admin.key) });
    const imported = await draftRoom(roomEnv, importInput, clock.now);
    const importWorld = worldFor(roomIdOf(imported.genesis));
    const cases: [string, Partial<Record<keyof RoomEnv, unknown>>, "import" | "new", RegExp][] = [
      ["no import namespace", { IMPORT_NAMESPACE: undefined }, "import", /does not import repositories.*IMPORT_ARTIFACTS/],
      ["no IMPORT_ARTIFACTS binding", { IMPORT_ARTIFACTS: undefined }, "import", /no IMPORT_ARTIFACTS binding/],
      ["a binding that is not the public namespace", { ARTIFACTS_NAMESPACE: "acme-import" }, "new", /does not found public rooms/],
      ["no ARTIFACTS binding", { ARTIFACTS: undefined }, "new", /no ARTIFACTS binding/],
    ];
    for (const [why, change, mode, message] of cases) {
      const lacking = { ...env, ...change } as unknown as RoomEnv;
      const input = mode === "import" ? importInput : draftInput(pub.admin, { kind: "new" });
      await expect(draftRoom(lacking, input, clock.now), why).rejects.toMatchObject({ code: "forbidden", message: expect.stringMatching(message) });
      const d = mode === "import" ? { genesis: imported.genesis, sig: signedBy(admin, imported.genesis), draft: imported.draft } : { genesis: pub.drafted.genesis, sig: pub.sig, draft: pub.drafted.draft };
      await expect(foundRoom(lacking, d.genesis, d.sig, d.draft), why).rejects.toMatchObject({ code: "forbidden" });
    }
    for (const g of [imported.genesis, pub.drafted.genesis]) {
      expect(await reg().byRepo(g.repo)).toBeNull();
      expect(await reg().lookup(g.name)).toBeNull();
      expect(await logOf(roomIdOf(g))).toEqual([]);
    }
    expect(importWorld.artifacts.remoteCalls.size + pub.world.artifacts.remoteCalls.size).toBe(0);
  });
});

describe("review 3eb7bc44: each creation attempt is its own incarnation, and a delete only ever reaches an abandoned one", () => {
  it("a create whose answer is lost, then a delete lost before it applies: the room is founded on a new incarnation; the late delete, after the seal, a restart and a landing, reaches only the abandoned one", async () => {
    const f = await draftPublic();
    const a = f.world.artifacts;
    const id = roomIdOf(f.drafted.genesis);
    a.loseReply("create");
    // The next delete loses its answer before it applies; `late` applies it afterwards.
    const real = a.binding.delete;
    let late: (() => Promise<boolean>) | null = null;
    a.binding.delete = async (repoName: string) => {
      a.binding.delete = real;
      late = () => real(repoName);
      throw artifactsErrors.transport();
    };
    expect(await found(f)).toBe(id);
    const sealed = a.canonical;
    expect((await duties(id)).some((d) => d.kind === "repo-delete" && d.state !== "done")).toBe(true);
    // A restart of the room's Durable Object, then ordinary work: a lane lands.
    await evictDurableObject(roomStub(id));
    const room = testRoom(f, id);
    const { head, op } = await landLane(room, a, { "docs/after.md": "landed before the late delete\n" });
    expect(op).toMatchObject({ state: "landed" });
    await late!();
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

  it("a create whose answer is lost, then a delete that applied and lost its answer: the retry's NOT_FOUND settles it as gone; one repository is left, the room's, with no token and its first commit", async () => {
    const f = await draftPublic();
    const a = f.world.artifacts;
    const id = roomIdOf(f.drafted.genesis);
    a.loseReply("create");
    const real = a.binding.delete;
    a.binding.delete = async (repoName: string) => {
      a.binding.delete = real;
      await real(repoName);
      throw artifactsErrors.transport();
    };
    expect(await found(f)).toBe(id);
    const prefix = `${f.drafted.genesis.repo.split("/")[1]!}-`;
    expect([...a.repos.keys()].filter((n) => n.startsWith(prefix))).toEqual([a.canonical]);
    expect(a.remoteCalls.get("create")).toBe(2);
    expect(a.repo(a.canonical).activeTokens()).toEqual([]);
    expect((await duties(id)).some((d) => d.kind === "repo-delete" && d.state !== "done")).toBe(true);
    advance(10 * 60_000);
    await tick(testRoom(f, id), 2);
    expect((await duties(id)).filter((d) => d.state !== "done")).toEqual([]);
    expect(a.main).toBe((await firstCommit(Date.parse(f.drafted.genesis.createdAt))).commit);
  });
});

describe("plan 004: the founding debt has a persisted alarm before any create is sent", () => {
  it("the alarm is in storage while the first create is outstanding; after the host stops, a fresh object's alarm alone deletes the late repository and its token; the founder never retries", async () => {
    const f = await draftPublic();
    const a = f.world.artifacts;
    const g = f.drafted.genesis;
    const id = roomIdOf(g);
    // The create is dispatched and never answers: the host stops while waiting for it. (A plain flag, not a promise
    // of the test's: resolving one from inside the object keeps the test pool from aborting the object.)
    const real = a.binding.create;
    let created: string | null = null;
    a.binding.create = async (n: string) => {
      a.binding.create = real;
      created = n;
      return new Promise<never>(() => {});
    };
    // The Worker's founding steps, then the room's found, started inside the object and sent once.
    await call(reg().bind(g.repo, id, g.name));
    const seed = roomSeed(roomEnv, f.drafted.draft);
    await runInDurableObject(roomStub(id), (room: Room) => {
      void room.core.found(g, f.sig, seed).catch(() => undefined);
    });
    while (created === null) await new Promise((r) => setTimeout(r, 1));
    const repoName: string = created;
    const seen = await runInDurableObject(roomStub(id), async (room: Room, state: DurableObjectState) => ({ alarm: await state.storage.getAlarm(), duties: room.core.workspaces.duties() }));
    expect(seen.duties.map((d) => [d.kind, d.state])).toEqual([["repo-create", "in-flight"]]);
    expect(seen.alarm, "an alarm is persisted before the provider was asked").not.toBeNull();
    await stop(id);
    // The create applies late, with its 24-hour token.
    await real(repoName);
    expect(a.repo(repoName).activeTokens()).toHaveLength(1);
    // Only the scheduled alarm, on a fresh object.
    expect(await runDurableObjectAlarm(roomStub(id))).toBe(true);
    expect(a.repos.has(repoName)).toBe(false);
    expect((await duties(id)).filter((d) => d.state !== "done")).toEqual([]);
    expect(await logOf(id)).toEqual([]);
    expect(a.remoteCalls.get("create")).toBe(1);
  });

  it("an alarm that cannot be stored: no create is sent, the step is closed as never sent, the alarm cache claims nothing, and the same found later completes", async () => {
    const f = await draftPublic();
    const a = f.world.artifacts;
    const id = roomIdOf(f.drafted.genesis);
    // The wake-up before the create fails once.
    setFault((p) => {
      if (p !== "room:set-alarm") return;
      setFault(null);
      throw new Error("interrupted at room:set-alarm");
    });
    await rejects(found(f), "unavailable");
    expect(a.remoteCalls.get("create")).toBeUndefined();
    expect((await duties(id)).map((d) => [d.kind, d.state, d.doneReason])).toEqual([["repo-create", "done", "not-sent"]]);
    expect(await alarmOf(id)).toBeNull();
    // Nothing claimed the rejected alarm. (Debt recorded before a create, and kept, is shown in the git package's
    // workspaces test "plan 004: a wake-up that cannot be stored …".)
    expect(await runInDurableObject(roomStub(id), (room: Room) => (room as unknown as { scheduled: number | null }).scheduled)).toBeNull();
    expect(await found(f)).toBe(id);
    expect(a.remoteCalls.get("create")).toBe(1);
  });

  it("a wake-up never replaces an earlier alarm: one already in storage is kept when a later one is asked for, and of two asked for at once the earlier stands", async () => {
    const id = roomIdOf((await draftPublic()).drafted.genesis);
    const earlier = Date.now() + 3_600_000;
    setAlarmDelay(null); // real alarm times, all far enough ahead not to run during the test
    try {
      const wakes = (...at: number[]) =>
        runInDurableObject(roomStub(id), async (room: Room, state: DurableObjectState) => {
          const wake = (room as unknown as { wake(at: number): Promise<void> }).wake.bind(room);
          await Promise.all(at.map((t) => wake(t)));
          return state.storage.getAlarm();
        });
      expect(await wakes(earlier, earlier + 3_600_000)).toBe(earlier);
      expect(await wakes(earlier + 60_000)).toBe(earlier);
      expect(await wakes(earlier - 60_000)).toBe(earlier - 60_000);
    } finally {
      setAlarmDelay(3600_000);
      await runInDurableObject(roomStub(id), (_r: Room, state: DurableObjectState) => state.storage.deleteAlarm());
    }
  });
});

describe("request d29c09fa: the error upgrade drains in an unfounded room, through recovery and alarms alone", () => {
  // The checker's control (review of 18d69cda), as it was run.
  it("an unfounded room with no founding debt left, stored at version 1 with a legacy provider text in a finished founding step: the fresh object runs the migrations, stores an alarm for the upgrade, and its alarms remove the text", async () => {
    const sample = ["legacy", "Founding", "Credential"].join("");
    const f = await draftPublic();
    const id = roomIdOf(f.drafted.genesis);
    f.world.artifacts.failRemote("revokeToken", artifactsErrors.transport());
    await rejects(found(f), "unavailable");
    advance(60_000);
    expect(await runDurableObjectAlarm(roomStub(id))).toBe(true);
    // As a room stored before the upgrade: the legacy text, the store at version 1, and no alarm.
    await runInDurableObject(roomStub(id), async (room: Room, state: DurableObjectState) => {
      expect(room.core.founded).toBe(false);
      expect(room.core.foundingDue()).toBeNull();
      const rows = room.core.sql.all("SELECT id FROM artroom_ws_duty WHERE state = 'done' ORDER BY id");
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) room.core.sql.all("UPDATE artroom_ws_duty SET last_error = ? WHERE id = ?", `Authorization: Bearer ${sample}`, row["id"]!);
      room.core.sql.all("UPDATE schema_version SET v = 1 WHERE id = 1");
      await state.storage.deleteAlarm();
    });
    await stop(id);
    const before = await runInDurableObject(roomStub(id), async (room: Room, state: DurableObjectState) => ({
      founded: room.core.founded,
      cursor: room.core.sql.all("SELECT v FROM meta WHERE k = 'error_scrub'").length,
      alarm: await state.storage.getAlarm(),
      debt: room.core.foundingDue() !== null,
      // Mint lane C: the composed chain (scrub at 2, due indexes at 3) ran from version 1 in the unfounded room, and
      // its next alarm is the scrub's work.
      v: room.core.sql.all("SELECT v FROM schema_version WHERE id = 1")[0]!["v"],
      indexes: room.core.sql.all("SELECT name FROM sqlite_master WHERE type = 'index' AND name IN ('job_tokens_due', 'check_jobs_due') ORDER BY name").map((x) => x["name"]),
      scrubFirst: room.core.unfoundedDue() === room.core.scrubDue(),
    }));
    expect(before).toMatchObject({ founded: false, cursor: 1, debt: false, v: 4, indexes: ["check_jobs_due", "job_tokens_due"], scrubFirst: true });
    expect(before.alarm, "recovery stored the upgrade's alarm, with no founding debt left").not.toBeNull();
    // No founding retry, and no direct call to scrubErrors: the production recovery and alarm route.
    for (let i = 0; i < 10; i++) if (!(await runDurableObjectAlarm(roomStub(id)))) break;
    const after = await runInDurableObject(roomStub(id), (room: Room) => ({
      founded: room.core.founded,
      cursor: room.core.sql.all("SELECT v FROM meta WHERE k = 'error_scrub'").length,
      rows: JSON.stringify(room.core.sql.all("SELECT last_error FROM artroom_ws_duty")),
    }));
    expect(after.rows).not.toContain(sample);
    expect(after).toMatchObject({ founded: false, cursor: 0 });
  });
});
