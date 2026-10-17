import { expect, test } from "vitest";
import { PROPOSED_BOUNDS, type Entry, type Item, type Seed } from "@generalbusiness/dap-contract";
import { canonicalize, entryHash, factRefOf, newIncarnation, scopeIdOf, seedDigest } from "@generalbusiness/artroom-bytes";
import { applyEntry, PROFILES, validateDefinition, type RuleGiven } from "@generalbusiness/dap-derive";
import { directoryPartition1, directoryPartitionRules1, partitionGeneration, partitionLane, partitionNumber, PARTITION_COHORT } from "../../platform/src/directory-partitions.ts";
import { SqliteStore, type Sql } from "../src/sqlite.ts";
import { found } from "./support.ts";

// Actual Durable Object SQLite and production lookup code. Item/index rows
// are explicit storage fixtures; no new factory or Authority path ran here.
test("directory partition point reads stay bounded beside 3000 unrelated lane rows and refuse an incomplete index", async () => {
  const scope = await found();
  const got = await scope.inside(state => {
    const actual: Sql = { exec: (query, ...args) => state.storage.sql.exec(query, ...args), transaction: work => state.storage.transactionSync(work) };
    const store = new SqliteStore(actual), sample = store.item(0)!;
    const seed: Seed = { v: 1, kind: "lane", definition: PARTITION_COHORT.partition, creator: null, cause: `sha256:${"0".repeat(64)}`, ordinal: 3000 };
    store.transaction(() => {
      for (let n = 0; n <= 3000; n++) {
        const digest = seedDigest({ ...seed, ordinal: n });
        const item: Item = { ...sample, id: n + 100, type: "lane", state: "listed", refs: { scope: { scope: scopeIdOf({ ...seed, ordinal: n }), kind: "lane", inc: newIncarnation(new Uint8Array(16).fill(7)) } }, values: { seed: digest, number: n + 1 } };
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
    const ids = [partitionGeneration(counted, 1)?.id, partitionNumber(counted, 3001)?.id, partitionLane(counted, scopeIdOf(seed))?.id];
    measuring = false;
    const stats = { rowsRead, rowsWritten, queries: [...queries], plans: [...plans] };
    // SCRIPTED source and direct native rule/fold specimen. The real
    // runtime's Authority/delivery is covered in the native journeys; this
    // storage fixture measures the actual index-update implementation.
    const source = { ...JSON.parse(store.stored(0)!.bytes) as Entry, at: { scope: scopeIdOf(seed), kind: "lane" as const, inc: newIncarnation(new Uint8Array(16).fill(7)) }, seq: 9, time: "2099-01-01T00:00:01Z" };
    const from = factRefOf(source);
    const input = { type: "delivery" as const, from, n: 0, message: { class: "advisory" as const, type: "index" as const, body: { title: "Updated by point lookup" } } };
    const given: RuleGiven = { state: counted, input, time: source.time, uses: [{ fact: from, entry: source, under: "issue" }], own: () => null,
      resolved: { at: store.scope()!.at, self: store.scope()!.head.seq + 1, fields: { title: "Updated by point lookup" }, subjects: new Map(), signer: null, bounds: PROPOSED_BOUNDS },
      observed: () => null, value: () => undefined, placed: () => undefined };
    const ready = directoryPartitionRules1["index-ready"]!, row = directoryPartitionRules1["index-row"]!, numbered = directoryPartitionRules1["index-number"]!;
    if (ready.place !== "guard" || row.place !== "effect" || numbered.place !== "effect") throw new Error("wrong native index rule places");
    const checked = validateDefinition(directoryPartition1, PROPOSED_BOUNDS, PROFILES, { platform: true });
    if (!checked.ok) throw new Error("native partition data is invalid");
    measuring = true;
    const guard = ready.run(given), effects = [...row.run(given), ...numbered.run(given)];
    const updateRuleStats = { queries: queries.slice(stats.queries.length), rowsRead: rowsRead - stats.rowsRead, rowsWritten: rowsWritten - stats.rowsWritten, plans: plans.slice(stats.plans.length) };
    const beforeFold = { queries: queries.length, rowsRead, rowsWritten, plans: plans.length };
    const head = counted.scope()!;
    const update: Entry = { ...source, at: head.at, seq: head.head.seq + 1, prev: head.head.hash, input, uses: [], effects, sends: [] };
    applyEntry(counted, checked.definition, update, entryHash(update));
    measuring = false;
    const updateFoldStats = { queries: queries.slice(beforeFold.queries), rowsRead: rowsRead - beforeFold.rowsRead, rowsWritten: rowsWritten - beforeFold.rowsWritten, plans: plans.slice(beforeFold.plans) };
    const updated = store.item(3100);
    // One missing derived key makes that entire slot unavailable. Reads
    // cannot silently turn incomplete coverage into a missing lane.
    state.storage.sql.exec("DELETE FROM item_key WHERE type='lane' AND slot='seed' AND id=100").toArray();
    state.storage.sql.exec("UPDATE folded SET value='3000' WHERE kind='keyed' AND key=?", canonicalize(["lane", "seed"])).toArray();
    measuring = true;
    const beforeMissing = { queries: queries.length, rowsRead };
    const missing = partitionLane(counted, scopeIdOf(seed));
    const incomplete = directoryPartitionRules1["index-ready"];
    const unavailable = incomplete?.place === "guard" ? incomplete.run(given) : null;
    return { ids, stats, guard, effects, updateRuleStats, updateFoldStats, updated, missing, unavailable,
      incompleteQueries: queries.slice(beforeMissing.queries), additionalRows: rowsRead - beforeMissing.rowsRead };
  });
  expect(got.ids).toEqual([4000, 3100, 3100]);
  expect(got.stats.queries).toHaveLength(12);
  expect(got.stats.rowsRead).toBeLessThanOrEqual(20); expect(got.stats.rowsWritten).toBe(0);
  expect(got.stats.queries.filter(query => query.startsWith("SELECT record FROM item WHERE id"))).toHaveLength(3);
  expect(got.stats.plans.every(plan => !/SCAN|TEMP/i.test(plan))).toBe(true);
  expect(got.guard).toEqual({ holds: true });
  expect(got.effects).toContainEqual({ effect: "value", item: 3100, slot: "title", value: "Updated by point lookup" });
  expect(got.updated).toMatchObject({ values: { number: 3001, title: "Updated by point lookup", seen: { title: 9 } } });
  expect(got.updateRuleStats.queries).toHaveLength(12);
  expect(got.updateRuleStats.rowsRead).toBeLessThanOrEqual(24); expect(got.updateRuleStats.rowsWritten).toBe(0);
  expect(got.updateFoldStats.queries.length).toBeLessThanOrEqual(64);
  expect(got.updateFoldStats.rowsRead).toBeLessThanOrEqual(128); expect(got.updateFoldStats.rowsWritten).toBeLessThanOrEqual(32);
  expect([...got.updateRuleStats.plans, ...got.updateFoldStats.plans].every(plan => !/SCAN|TEMP/i.test(plan))).toBe(true);
  expect(got.unavailable).toEqual({ holds: null, reason: "dependency-unavailable" });
  expect(got.missing).toBeNull(); expect(got.incompleteQueries).toHaveLength(4); expect(got.additionalRows).toBeLessThanOrEqual(8);
});
