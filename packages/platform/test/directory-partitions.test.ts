import { expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/dap-contract";
import { scopeIdOf, seedDigest } from "@generalbusiness/artroom-bytes";
import { MemoryState, PROFILES, runnable, standingEntries, validateDefinition, type RuleGiven } from "@generalbusiness/dap-derive";
import { directory10, directoryPartition1, directoryRules10, directoryPartitionRules1, MAX_GENERATIONS, partitionLane, partitionSeedKey, PARTITION_COHORT } from "../src/directory-partitions.ts";

// Pure data/index witnesses. No native creation or Authority is claimed here.
test("root and partition are valid distinct native definitions with complete rule tables and full production standing room", () => {
  for (const [data, rules] of [[directory10, directoryRules10], [directoryPartition1, directoryPartitionRules1]] as const) {
    const checked = validateDefinition(data, PROPOSED_BOUNDS, PROFILES, { platform: true });
    expect(checked.ok ? [] : checked.problems).toEqual([]);
    if (!checked.ok) return;
    expect(runnable(checked.definition, rules)).toBe(true);
    if (data === directory10) expect(standingEntries(new MemoryState(), checked.definition)).toBe(3 * MAX_GENERATIONS);
  }
  expect(Object.keys(directory10.items)).toEqual(["repository", "partition"]);
  expect(Object.keys(directory10.acts)).not.toContain("open-pr");
  expect(Object.keys(directoryPartition1.receives)).toEqual(["index"]);
  expect(directoryPartition1.items["repository"]!.states).toEqual({ open: { final: false } });
  expect(directoryPartition1.acts["seal"]!.settles).toEqual({ of: "on", sets: "sealed", in: ["open"] });
});

test("lane point lookup uses one declared seed key and never scans; incomplete or ambiguous coverage remains unavailable", () => {
  const seed = { v: 1, kind: "lane", definition: PARTITION_COHORT.partition, creator: null, cause: `sha256:${"0".repeat(64)}`, ordinal: 0 } as const;
  const id = scopeIdOf(seed);
  expect(partitionSeedKey(id)).toBe(seedDigest(seed));
  let lookups = 0, bodies = 0;
  let rows: readonly number[] | null = [7];
  const item = { id: 7 };
  const state = { lookup: (type: string, slot: string, key: string, limit: number) => {
    lookups++; expect([type, slot, key, limit]).toEqual(["lane", "seed", JSON.stringify(seedDigest(seed)), 2]); return rows;
  }, item: (n: number) => { bodies++; expect(n).toBe(7); return item; }, page: () => { expect.fail("no fallback scan"); } } as unknown as RuleGiven["state"];
  expect(partitionLane(state, id)).toBe(item);
  expect([lookups, bodies]).toEqual([1, 1]);
  rows = null; expect(partitionLane(state, id)).toBeNull();
  rows = [7, 8]; expect(partitionLane(state, id)).toBeNull();
  rows = []; expect(partitionLane(state, id)).toBeUndefined();
  expect([lookups, bodies]).toEqual([4, 1]);
});
