/**
 * Review f060871b (plan 003): a cleanup pass that waits on Artifacts must not
 * make the production Room ask for an immediate alarm over and over. Adapted
 * from the checker's diagnostic: the unchanged Room and Landing, Durable
 * Object SQLite, real `Room.alarm` runs and the Room's own alarm scheduling.
 * The backoff times pass on the room clock, which the test moves; only the
 * engine's own revocation timeout (set to 20 ms) is a real wait.
 */

import { expect, it } from "vitest";
import { env, exports } from "cloudflare:workers";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import type { Claim, DraftedRoom, Genesis, Landing, LandOp, RoomId } from "@generalbusiness/artroom-contract";
import { roomIdOf } from "../../src/ids.ts";
import { hex } from "../../src/crypto.ts";
import { FakeArtifactsHost, setAlarmDelay, type Room } from "../../src/index.ts";
import { Client, clock, newKeyPair, randomBytes, sign, tick, worldFor, type TestRoom, type World } from "./support.ts";

const worker = exports.default as unknown as {
  draft(input: unknown): Promise<DraftedRoom>;
  found(genesis: Genesis, sig: string, draft: string): Promise<RoomId>;
};
const roomStub = (id: string) => env.ROOMS.get(env.ROOMS.idFromName(id)) as unknown as DurableObjectStub<Room>;

interface Founded {
  readonly admin: ReturnType<typeof newKeyPair>;
  readonly drafted: DraftedRoom;
  readonly sig: string;
  readonly world: World;
}

async function draftPublic(): Promise<Founded> {
  const admin = newKeyPair();
  const drafted = await worker.draft({ name: `cleanup/${hex(randomBytes(6))}`, repo: { kind: "new" }, admin: { handle: "@founder", key: admin.key }, recovery: newKeyPair().key });
  return { admin, drafted, sig: sign(admin.seed, "artroom-genesis-v1", drafted.genesis), world: worldFor(roomIdOf(drafted.genesis)) };
}

function testRoom(f: Founded, id: RoomId): TestRoom {
  const base = { id, stub: roomStub(id) as never };
  return { id, genesis: f.drafted.genesis, stub: base.stub, world: f.world, admin: new Client(base, f.admin), recovery: new Client(base, newKeyPair()), roomKey: f.drafted.genesis.roomKey };
}

/** Claim a lane on `scope`, push to its fork, propose and land; returns the settled operation. */
async function landLane(room: TestRoom, host: FakeArtifactsHost, scope: string, files: Record<string, string>): Promise<LandOp> {
  const claim = await room.admin.ok<Claim>("claim", null, { goal: "a lane", scope: [scope] });
  const head = host.commit(host.main, files);
  host.push(claim.lane, head);
  await room.admin.ok("propose", { lane: claim.lane }, { lease: 1, expectedGeneration: 0, head, summary: "a lane" });
  const l = await room.admin.ok<Landing>("land", { lane: claim.lane, generation: 1 }, { lease: 1, head });
  await tick(room, 3);
  return (await room.admin.read({ q: "op", op: l.op.id as never })) as LandOp;
}

/** Test hooks on the Room's engine: its publication tokens, and the revocation timeout. */
type Hooks = { tokens: { revoke: (id: string) => Promise<boolean> }; revokeTimeoutMs: number };
const hooks = (r: Room) => r.core.landing as unknown as Hooks;
type Probe = { calls: number; release: ((v: boolean) => void) | null; due: number | null; at: number };
const probe = (r: Room) => r as unknown as Probe;

const failing = (r: Room) => {
  hooks(r).tokens.revoke = async () => {
    throw new Error("Artifacts unavailable (revoke)");
  };
};
/**
 * Every revocation waits until the test answers it. Each one also records the engine's next due time while its
 * attempt is running: read in a microtask, after the engine has noted the pass and before any timer can end it.
 */
const pending = (r: Room) => {
  probe(r).calls = 0;
  hooks(r).tokens.revoke = () => {
    probe(r).calls++;
    queueMicrotask(() => {
      probe(r).due = r.core.landing.nextDue();
      probe(r).at = clock.now;
    });
    return new Promise<boolean>((resolve) => {
      probe(r).release = resolve;
    });
  };
};

it("review f060871b: a pending cleanup pass gives the Room a bounded future wake, not an immediate one; completion clears it; a timeout puts the debt on its backoff", async () => {
  // The room clock starts at the real time and is moved by the test: a stored alarm's time is then at or after the
  // room's due time on both clocks, and no wait here is a real one.
  const clockBefore = clock.now;
  clock.now = Date.now();
  const f = await draftPublic();
  const id = await worker.found(f.drafted.genesis, f.sig, f.drafted.draft);
  const room = testRoom(f, id);
  const stub = roomStub(id);
  try {
    // A landing whose token revocation fails owes one revocation.
    await runInDurableObject(stub, failing);
    expect((await landLane(room, f.world.artifacts, "docs/a/**", { "docs/a/one.md": "one" })).state).toBe("landed");
    const owed = await runInDurableObject(stub, (r: Room) => r.core.landing.core.tokenCleanup());
    expect(owed).toHaveLength(1);
    clock.now = Math.max(clock.now, owed[0]!.dueAt + 20);

    // 1. Pending: Artifacts never answers. Real alarms, with the Room's real alarm times.
    await runInDurableObject(stub, pending);
    setAlarmDelay(null);
    const seen: { delay: number | null; calls: number; owed: number; landingDue: number | null; now: number }[] = [];
    for (let i = 0; i < 5; i++) {
      // The stored alarm is compared with the real time below. On a busy machine the real time may have passed the
      // room clock since the test began, so the room clock is brought up to it first.
      clock.now = Math.max(clock.now, Date.now());
      await runDurableObjectAlarm(stub);
      seen.push(
        await runInDurableObject(stub, async (r: Room, state: DurableObjectState) => {
          const alarm = await state.storage.getAlarm();
          return { delay: alarm === null ? null : alarm - Date.now(), calls: probe(r).calls, owed: r.core.landing.core.tokenCleanup().length, landingDue: r.core.landing.nextDue(), now: clock.now };
        }),
      );
    }
    setAlarmDelay(3600_000);
    expect(seen.map((o) => o.calls)).toEqual([1, 1, 1, 1, 1]); // one attempt in flight, not repeated
    expect(seen.every((o) => o.owed === 1)).toBe(true);
    for (const o of seen) {
      // Bounded and in the future: by the pending attempt's timeout (30 s), never an immediate wake.
      expect(o.landingDue).not.toBeNull();
      expect(o.landingDue! - o.now).toBeGreaterThan(1_000);
      expect(o.landingDue! - o.now).toBeLessThanOrEqual(30_000);
      expect(o.delay === null || o.delay >= 1_000).toBe(true);
    }

    // 2. Completion: Artifacts answers; the debt is gone and the engine wants no wake for it.
    await runInDurableObject(stub, async (r: Room) => {
      probe(r).release?.(true);
      await r.core.landing.cleanupDone();
    });
    const done = await runInDurableObject(stub, (r: Room) => ({ owed: r.core.landing.core.tokenCleanup(), due: r.core.landing.nextDue(), calls: probe(r).calls }));
    expect(done).toEqual({ owed: [], due: null, calls: 1 });

    // 3. Timeout: a second landing owes a revocation; Artifacts never answers, and the attempt times out.
    await runInDurableObject(stub, failing);
    expect((await landLane(room, f.world.artifacts, "docs/b/**", { "docs/b/two.md": "two" })).state).toBe("landed");
    const owed2 = await runInDurableObject(stub, (r: Room) => r.core.landing.core.tokenCleanup());
    expect(owed2.map((c) => c.backoffMs)).toEqual([1_000]);
    clock.now = Math.max(clock.now, owed2[0]!.dueAt + 20);
    await runInDurableObject(stub, (r: Room) => {
      pending(r);
      hooks(r).revokeTimeoutMs = 20;
    });
    await runDurableObjectAlarm(stub);
    // What the attempt saw while it ran. A read made now could come after the 20 ms timeout on a busy machine.
    const waiting = await runInDurableObject(stub, (r: Room) => ({ due: probe(r).due, now: probe(r).at, calls: probe(r).calls }));
    expect(waiting.calls).toBe(1);
    expect(waiting.due! - waiting.now).toBeLessThanOrEqual(20);
    await runInDurableObject(stub, (r: Room) => r.core.landing.cleanupDone());
    const after = await runInDurableObject(stub, (r: Room) => ({ owed: r.core.landing.core.tokenCleanup(), due: r.core.landing.nextDue(), now: clock.now, calls: probe(r).calls }));
    expect(after.calls).toBe(1);
    expect(after.owed.map((c) => c.backoffMs)).toEqual([2_000]); // a failure, never a success
    expect(after.due).toBe(after.owed[0]!.dueAt);
    expect(after.due! - after.now).toBeGreaterThan(1_000);
    // Before that due time another alarm does not send it again.
    await runDurableObjectAlarm(stub);
    expect(await runInDurableObject(stub, (r: Room) => probe(r).calls)).toBe(1);
  } finally {
    setAlarmDelay(3600_000);
    await runInDurableObject(stub, async (r: Room, state: DurableObjectState) => {
      probe(r).release?.(true);
      await r.core.landing.cleanupDone();
      await state.storage.deleteAlarm();
    });
    clock.now = clockBefore;
  }
});
