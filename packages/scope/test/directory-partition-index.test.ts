import { expect, test } from "vitest";
import type { Item, Seed } from "@generalbusiness/dap-contract";
import { canonicalize, scopeIdOf, seedDigest } from "@generalbusiness/artroom-bytes";
import { partitionGeneration, partitionLane, partitionNumber, PARTITION_COHORT } from "../../platform/src/directory-partitions.ts";
import { SqliteStore, type Sql } from "../src/sqlite.ts";
import { found } from "./support.ts";

// Actual Durable Object SQLite and production lookup code. Item/index rows
// are explicit storage fixtures; no new factory or Authority path ran here.
test("directory partition point reads stay bounded beside 3000 unrelated lane rows and refuse an incomplete index", async () => {
  const scope = await found();
  const got = await scope.inside(state => {
    const actual: Sql = { exec: (query, ...args) => state.storage.sql.exec(query, ...args), transaction: work => state.storage.transactionSync(work) };
    const store = new SqliteStore(actual), sample = store.item(0)!;
    const seed: Seed = { v: 1, kind: "lane", definition: PARTITION_COHORT.partition, creator: null, cause: `sha256:${"0".repeat(64)}`, ordinal: 1 };
    store.transaction(() => {
      for (let n = 0; n <= 3000; n++) {
        const digest = seedDigest({ ...seed, ordinal: n });
        const item: Item = { ...sample, id: n + 100, type: "lane", state: n === 1 ? "listed" : "final", values: { seed: digest, number: n + 1 } };
        store.putItem(item); store.addCount(item.type, item.state, 1);
        store.putIndexed("lane", "seed", canonicalize(digest), item.id);
        store.putIndexed("lane", "number", String(n + 1), item.id);
      }
      const partition: Item = { ...sample, id: 4000, type: "partition", state: "active", values: { generation: 1 } };
      store.putItem(partition); store.addCount("partition", "active", 1); store.putIndexed("partition", "generation", "1", partition.id);
    });
    let measuring = false, rowsRead = 0, rowsWritten = 0;
    const queries: string[] = [], plans: string[] = [];
    const counted = new SqliteStore({ transaction: work => state.storage.transactionSync(work), exec: (query, ...args) => {
      const cursor = state.storage.sql.exec(query, ...args), rows = cursor.toArray();
      if (measuring) {
        rowsRead += cursor.rowsRead; rowsWritten += cursor.rowsWritten; queries.push(query);
        plans.push(...state.storage.sql.exec(`EXPLAIN QUERY PLAN ${query}`, ...args).toArray().map(row => String(row["detail"])));
      }
      return { toArray: () => rows };
    } });
    measuring = true;
    const ids = [partitionGeneration(counted, 1)?.id, partitionNumber(counted, 2)?.id, partitionLane(counted, scopeIdOf(seed))?.id];
    measuring = false;
    const stats = { rowsRead, rowsWritten, queries: [...queries], plans };
    // One missing derived key makes that entire slot unavailable. Reads
    // cannot silently turn incomplete coverage into a missing lane.
    state.storage.sql.exec("DELETE FROM item_key WHERE type='lane' AND slot='seed' AND id=100").toArray();
    state.storage.sql.exec("UPDATE folded SET value='3000' WHERE kind='keyed' AND key=?", canonicalize(["lane", "seed"])).toArray();
    measuring = true;
    const missing = partitionLane(counted, scopeIdOf(seed));
    return { ids, stats, missing, incompleteQueries: queries.slice(stats.queries.length), additionalRows: rowsRead - stats.rowsRead };
  });
  expect(got.ids).toEqual([4000, 101, 101]);
  expect(got.stats.queries).toHaveLength(12);
  expect(got.stats.rowsRead).toBeLessThanOrEqual(20); expect(got.stats.rowsWritten).toBe(0);
  expect(got.stats.queries.filter(query => query.startsWith("SELECT record FROM item WHERE id"))).toHaveLength(3);
  expect(got.stats.plans.every(plan => !/SCAN|TEMP/i.test(plan))).toBe(true);
  expect(got.missing).toBeNull(); expect(got.incompleteQueries).toHaveLength(2); expect(got.additionalRows).toBeLessThanOrEqual(4);
});
