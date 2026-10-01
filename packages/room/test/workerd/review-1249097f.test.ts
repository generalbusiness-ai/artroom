/**
 * Review 1249097f. The checker's two diagnostics asserted the defective
 * outcomes; each test here asserts the correct one, with the further cases
 * the review asked for.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:workers";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import type { Genesis, RoomId } from "@generalbusiness/artroom-contract";
import type { Registry, Room } from "../../src/index.ts";
import type { RoomEnv } from "../../src/config.ts";
import { draftRoom, foundRoom } from "../../src/founding.ts";
import { roomIdOf } from "../../src/ids.ts";
import { hex } from "../../src/crypto.ts";
import { MemoryLogPublisher } from "../../src/memory/log.ts";
import { advance, call, clock, day, failure, grant, iso, makeRoom, newKeyPair, randomBytes, sign, worldFor, type TestRoom } from "./support.ts";

const inside = <T>(r: TestRoom, fn: (room: Room) => T | Promise<T>) => runInDurableObject(r.stub as unknown as DurableObjectStub<Room>, fn);

// ------------------------------------------------------------------ 1.

describe("1. a pending cohort stored by the previous revision is upgraded with its exact commit", () => {
  /** Rewrite the stored cohort in the previous revision's form, and drop the schema version, as that revision left it. */
  async function downgrade(r: TestRoom): Promise<void> {
    await inside(r, (room) => {
      const { v, expected, ...legacy } = room.core.pendingPublication()!;
      void v;
      void expected;
      room.core.sql.all("UPDATE meta SET v = ? WHERE k = 'pending_publication'", JSON.stringify(legacy));
      room.core.sql.all("DROP TABLE schema_version");
    });
    await evictDurableObject(r.stub);
  }

  /** A cohort stored, then a push that never reaches the remote. */
  async function pendingBeforePush(r: TestRoom): Promise<void> {
    await r.admin.ok("claim", null, { goal: "g", scope: ["src/**"] });
    const push = r.world.log.push.bind(r.world.log);
    r.world.log.push = async () => {
      throw new Error("the network is down");
    };
    try {
      expect((await failure(r.stub.publishLog())).code).toBe("unavailable");
    } finally {
      r.world.log.push = push;
    }
    expect(r.world.log.ref).toBeNull();
  }

  /** A cohort stored, then a push that applied but whose answer, and read-back, were lost. */
  async function pendingAfterLostPush(r: TestRoom) {
    await r.admin.ok("claim", null, { goal: "g", scope: ["src/**"] });
    r.world.log.faults.lostPushReply = 1;
    r.world.log.faults.lostReadReply = 1;
    expect((await failure(r.stub.publishLog())).code).toBe("unavailable");
    return r.world.log.ref!;
  }

  const stored = (r: TestRoom) => inside(r, (room) => room.core.pendingPublication());

  it("before the push: the upgraded cohort is published on its parent, and nothing else is", async () => {
    const r = await makeRoom();
    await pendingBeforePush(r);
    const before = (await stored(r))!;
    await downgrade(r);
    const out = await call<{ through: number; commit: string }>(r.stub.publishLog());
    expect(out).toEqual({ through: before.through, commit: before.expected });
    expect(r.world.log.ref).toBe(before.expected);
    expect(r.world.log.commits.get(before.expected as never)!.parent).toBeNull();
    expect((await r.admin.read({ q: "log" })).publishedThrough).toBe(before.through);
  });

  it("after an applied push whose answer was lost: the derived commit is the one on the ref, and recovery completes forward", async () => {
    const r = await makeRoom();
    const own = await pendingAfterLostPush(r);
    const pushes = r.world.log.pushes;
    await downgrade(r);
    expect(await call(r.stub.publishLog())).toEqual({ through: 2, commit: own });
    expect(r.world.log.ref).toBe(own);
    expect(r.world.log.pushes).toBe(pushes);
    expect((await r.admin.read({ q: "log" })).publishedThrough).toBe(2);
  });

  it("the derived commit is stored before any further write, and survives repeated reopening", async () => {
    const r = await makeRoom();
    const own = await pendingAfterLostPush(r);
    await downgrade(r);
    expect(await stored(r)).not.toHaveProperty("v");
    await evictDurableObject(r.stub);
    // The publish after the upgrade fails at the transport: the upgraded cohort is already stored.
    const publish = MemoryLogPublisher.prototype.publish;
    MemoryLogPublisher.prototype.publish = async () => {
      throw new Error("the connection reset");
    };
    try {
      expect((await failure(r.stub.publishLog())).code).toBe("unavailable");
    } finally {
      MemoryLogPublisher.prototype.publish = publish;
    }
    expect(await stored(r)).toMatchObject({ v: 2, expected: own, through: 2 });
    await evictDurableObject(r.stub);
    expect(await stored(r)).toMatchObject({ v: 2, expected: own, through: 2 });
    await evictDurableObject(r.stub);
    expect(await stored(r)).toMatchObject({ v: 2, expected: own, through: 2 });
    expect(await call(r.stub.publishLog())).toEqual({ through: 2, commit: own });
  });

  it("a foreign commit with the same entry lines on the ref is still another writer after the upgrade", async () => {
    const r = await makeRoom();
    const own = await pendingAfterLostPush(r);
    const original = r.world.log.commits.get(own)!;
    const cp = JSON.parse(original.files["artroom-log/v1/checkpoint.json"]!) as Record<string, unknown>;
    const foreign = "f".repeat(40) as never;
    r.world.log.commits.set(foreign, { ...original, files: { ...original.files, "artroom-log/v1/checkpoint.json": JSON.stringify({ ...cp, sig: "invalid-signature" }) } });
    r.world.log.ref = foreign;
    await downgrade(r);
    expect((await failure(r.stub.publishLog())).code).toBe("unavailable");
    expect(await stored(r)).toMatchObject({ v: 2, expected: own });
    expect((await r.admin.read({ q: "log" })).publishedThrough).toBe(-1);
    expect(r.world.log.ref).toBe(foreign);
    const log = await inside(r, (room) => room.core.sql.all("SELECT v FROM meta WHERE k = 'publication_error'"));
    expect(log[0]?.["v"]).toBe("unexpected-writer");
  });

  it("a stored cohort that does not match the log is neither upgraded, published nor discarded", async () => {
    const r = await makeRoom();
    await pendingBeforePush(r);
    await downgrade(r);
    await inside(r, (room) => {
      const p = room.core.pendingPublication()!;
      room.core.sql.all("UPDATE meta SET v = ? WHERE k = 'pending_publication'", JSON.stringify({ ...p, hash: `sha256:${"0".repeat(64)}` }));
    });
    expect((await failure(r.stub.publishLog())).code).toBe("unavailable");
    expect(r.world.log.ref).toBeNull();
    expect(await stored(r)).not.toHaveProperty("v");
  });

  it("a cohort of an unknown version is neither published nor discarded", async () => {
    const r = await makeRoom();
    await pendingBeforePush(r);
    await inside(r, (room) => {
      const p = room.core.pendingPublication()!;
      room.core.sql.all("UPDATE meta SET v = ? WHERE k = 'pending_publication'", JSON.stringify({ ...p, v: 3 }));
    });
    expect((await failure(r.stub.publishLog())).code).toBe("unavailable");
    expect(r.world.log.ref).toBeNull();
    expect(await stored(r)).toMatchObject({ v: 3 });
  });
});

// ------------------------------------------------------------------ 2.

describe("2. an import grant's deadline is judged by the registry's clock, in the same step as the first binding", () => {
  afterEach(() => vi.restoreAllMocks());

  const real = () => env.REGISTRY.get(env.REGISTRY.idFromName("registry")) as unknown as DurableObjectStub<Registry>;

  async function drafted(lifeMs: number) {
    const admin = newKeyPair();
    const repo = `review-import/${hex(randomBytes(16))}`;
    const input = { name: `review-${hex(randomBytes(6))}`, repo: { kind: "import", grant: grant(repo, admin.key, iso(clock.now + lifeMs)) }, admin: { handle: "@founder", key: admin.key }, recovery: newKeyPair().key };
    const d = await draftRoom(env as unknown as RoomEnv, input, clock.now);
    const world = worldFor(roomIdOf(d.genesis));
    world.artifacts.main = world.artifacts.commit(null, { "README.md": "# imported\n" });
    return { repo, genesis: d.genesis as Genesis, draft: d.draft, sig: sign(admin.seed, "artroom-genesis-v1", d.genesis), world };
  }

  /** The registry, with time passing before a bind reaches it. */
  function slowRegistry(delay: { bind: number }): RoomEnv {
    return {
      ...env,
      REGISTRY: {
        idFromName: (n: string) => env.REGISTRY.idFromName(n),
        get: () => ({
          bind: async (repo: string, room: string, n: string, notAfter?: number) => {
            advance(delay.bind);
            return real().bind(repo, room as RoomId, n, notAfter);
          },
        }),
      },
    } as unknown as RoomEnv;
  }

  async function forbidden(p: Promise<unknown>): Promise<void> {
    await expect(p).rejects.toMatchObject({ code: "forbidden" });
  }

  it("a grant that expires during signature verification binds nothing and reads nothing", async () => {
    const d = await drafted(1000);
    const verify = crypto.subtle.verify.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, "verify").mockImplementation(async (...a: Parameters<SubtleCrypto["verify"]>) => {
      advance(600);
      return verify(...a);
    });
    await forbidden(foundRoom(env as unknown as RoomEnv, d.genesis, d.sig, d.draft));
    expect(await real().byRepo(d.repo)).toBeNull();
    expect(d.world.artifacts.calls.size).toBe(0);
  });

  it("a grant that expired between draft and found binds nothing and reads nothing", async () => {
    const d = await drafted(1000);
    advance(2000);
    await forbidden(foundRoom(env as unknown as RoomEnv, d.genesis, d.sig, d.draft));
    expect(await real().byRepo(d.repo)).toBeNull();
    expect(d.world.artifacts.calls.size).toBe(0);
  });

  it("a grant that expires while the bind is on its way is refused by the registry itself", async () => {
    const d = await drafted(1000);
    await forbidden(foundRoom(slowRegistry({ bind: 2000 }), d.genesis, d.sig, d.draft));
    expect(await real().byRepo(d.repo)).toBeNull();
    expect(d.world.artifacts.calls.size).toBe(0);
  });

  it("at notAfter exactly, the grant has expired; a millisecond before, it binds", async () => {
    const late = await drafted(1000);
    await forbidden(foundRoom(slowRegistry({ bind: 1000 }), late.genesis, late.sig, late.draft));
    expect(await real().byRepo(late.repo)).toBeNull();
    const early = await drafted(1000);
    expect(await foundRoom(slowRegistry({ bind: 999 }), early.genesis, early.sig, early.draft)).toBe(roomIdOf(early.genesis));
    expect((await real().byRepo(early.repo))?.room).toBe(roomIdOf(early.genesis));
  });

  it("after the binding, a retry of the same founding completes forward though the grant has expired", async () => {
    const d = await drafted(1000);
    d.world.artifacts.failNext("readMain");
    await expect(foundRoom(env as unknown as RoomEnv, d.genesis, d.sig, d.draft)).rejects.toMatchObject({ code: "unavailable" });
    expect((await real().byRepo(d.repo))?.room).toBe(roomIdOf(d.genesis));
    advance(60_000);
    expect(await foundRoom(slowRegistry({ bind: 1000 }), d.genesis, d.sig, d.draft)).toBe(roomIdOf(d.genesis));
    expect(d.world.artifacts.calls.get("readMain")).toBeGreaterThan(1);
  });

  it("the registry refuses a first binding at or after its deadline, and accepts the same binding again after it", async () => {
    const repo = `review-import/${hex(randomBytes(16))}`;
    const room = `room_${hex(randomBytes(16))}` as RoomId;
    const n = `review-${hex(randomBytes(6))}`;
    await expect(call(real().bind(repo, room, n, clock.now))).rejects.toMatchObject({ code: "forbidden" });
    expect(await call(real().bind(repo, room, n, clock.now + 1))).toBe("bound");
    expect(await call(real().bind(repo, room, n, clock.now - day))).toBe("already-bound");
  });
});

