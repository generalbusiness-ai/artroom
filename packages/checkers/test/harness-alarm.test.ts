// Review 96d1fbc9, second P2: the harness's Durable Object (`HarnessLedger`,
// the real class from src/worker.ts) persists its cleanup wake-up before
// preparation's remote effects, and a restarted object arms the debt it
// finds. Termination is modelled by a call that never answers, and a restart
// by a new object over the same durable SQL.
import { afterEach, test, vi } from "vitest";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import type { Sha } from "@generalbusiness/artroom-contract";
import { FakeArtifacts, Fixture } from "./support.ts";

const workerPath = "../src/harness.ts";
const C1 = "1".repeat(40) as Sha;

afterEach(() => vi.useRealTimers());

/** A Durable Object's storage over one SQLite database; each object records its own alarm calls. */
function storage(db: DatabaseSync) {
  const alarms: number[] = [];
  return {
    alarms,
    ctx: {
      storage: {
        sql: { exec: (q: string, ...a: (string | number | null)[]) => ({ toArray: () => db.prepare(q).all(...a) }) },
        transactionSync<T>(fn: () => T): T {
          db.exec("SAVEPOINT t");
          try {
            const r = fn();
            db.exec("RELEASE t");
            return r;
          } catch (e) {
            db.exec("ROLLBACK TO t");
            db.exec("RELEASE t");
            throw e;
          }
        },
        async setAlarm(at: number) {
          alarms.push(at);
        },
      },
      blockConcurrencyWhile: <T>(fn: () => Promise<T>) => fn(),
    },
  };
}

const owed = (db: DatabaseSync) => db.prepare("SELECT kind, state, next_at FROM artroom_snap_duty WHERE state != 'done' ORDER BY id").all() as { kind: string; state: string; next_at: number }[];
const settle = () => new Promise((r) => setTimeout(r, 20));

async function world() {
  const f = new Fixture();
  const artifacts: FakeArtifacts = f.artifacts;
  await artifacts.create("canon");
  const db = new DatabaseSync(":memory:");
  const { HarnessLedger } = (await import(workerPath)) as { HarnessLedger: new (ctx: unknown, env: unknown) => any };
  return { f, artifacts, db, HarnessLedger };
}

for (const point of ["create", "write"] as const) {
  test(`a host stopped during ${point === "create" ? "the repository's creation" : "the publisher's write"} has persisted its wake-up, and a restarted object arms and cleans up (P2)`, async () => {
    const { f, artifacts, db, HarnessLedger } = await world();
    try {
      let entered!: () => void;
      const reached = new Promise<void>((r) => (entered = r));
      const stall = <T>() => (entered(), new Promise<T>(() => {}));
      const env = {
        ARTIFACTS: {
          get: (n: string) => artifacts.get(n),
          delete: (n: string) => artifacts.delete(n),
          // The create applies; with `point` "create" its answer never arrives.
          create: async (n: string, o: unknown) => {
            const made = await artifacts.create(n);
            void o;
            return point === "create" ? stall() : made;
          },
        },
        PUBLISHER: { getByName: () => ({ writeSnapshot: () => stall() }) },
      };
      const first = storage(db);
      const original = new HarnessLedger(first.ctx, env);
      await settle();
      assert.deepEqual(first.alarms, [], "no debt, no alarm");
      void original.prepareSnapshot({ commit: C1, canonical: "canon", files: [], message: "m" });
      await reached;
      // The host stops here. Its debt and its wake-up are both already durable.
      const debt = owed(db);
      assert.ok(debt.length >= 1);
      assert.ok(first.alarms.length >= 1, "the alarm was set before the effect");
      assert.ok(first.alarms.at(-1)! <= Math.max(Math.min(...debt.map((d) => d.next_at)), Date.now() + 1000));
      // A new object over the same storage arms the debt it finds, with no alarm call from before.
      const second = storage(db);
      const recovered = new HarnessLedger(second.ctx, env);
      await settle();
      assert.equal(second.alarms.length, 1, "the restarted object armed the persisted debt");
      assert.equal((await recovered.snapshotDuties()).pending, debt.length);
      // The alarm fires as often as it is set, until nothing is owed.
      vi.useFakeTimers({ toFake: ["Date"] });
      for (let i = 0; i < 6 && (await recovered.snapshotDuties()).pending > 0; i++) {
        vi.setSystemTime(Math.max(Date.now(), second.alarms.at(-1)!) + 1);
        await recovered.alarm();
      }
      assert.equal((await recovered.snapshotDuties()).pending, 0);
      assert.deepEqual(artifacts.created.filter((n) => n !== "canon" && artifacts.has(n)), [], "the repository it made is deleted");
    } finally {
      f.dispose();
    }
  });
}
