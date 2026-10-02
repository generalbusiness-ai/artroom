/**
 * pi-durable on Durable Object SQLite: the platform facts the facade relies
 * on, then pi-durable 1.0.0's own storage conformance suite run against
 * `SqliteStorage` over the facade, inside a Durable Object.
 */

import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { registerStorageConformance } from "@earendil-works/pi-durable/testing";
import { SqliteStorage } from "@earendil-works/pi-durable/storage/sqlite";
import { DurableObjectSqlite } from "../src/do-sqlite.ts";
import type { Scratch } from "../src/scratch.ts";

const scratch = (name: string) => (env as unknown as { SCRATCH: DurableObjectNamespace<Scratch> }).SCRATCH.get((env as unknown as { SCRATCH: DurableObjectNamespace<Scratch> }).SCRATCH.idFromName(name));

describe("Durable Object SQLite transactions", () => {
  it("refuse SAVEPOINT in SQL, and roll back an async storage.transaction() across awaits", async () => {
    const out = await scratch("probe").probe();
    expect(String(out["savepoint"])).toMatch(/storage\.transaction\(\)/);
    expect(out["asyncTxError"]).toBe("Error: rollback please");
    expect(out["afterAsyncTx"]).toEqual({ n: 0 });
    expect(out["asyncTxWithTimer"]).toBe("ok");
    expect(out["afterTimerTx"]).toEqual({ n: 2 });
  });
});

let n = 0;
registerStorageConformance({ describe, expect, it }, "pi-durable SqliteStorage on Durable Object SQLite", async (use) => {
  await runInDurableObject(scratch(`conformance-${n++}`), async (_instance, state) => {
    const storage = await SqliteStorage.open(new DurableObjectSqlite(state.storage));
    await use(storage);
  });
});
