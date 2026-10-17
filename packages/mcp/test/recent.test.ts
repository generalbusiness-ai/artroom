import { expect, test } from "vitest";
import { Recent } from "../src/recent.ts";

// Invariant: only 64 recent continuation hints survive, and reading one keeps
// it recent even when its stored cursor is undefined. No result is cached.
test("continuation hints evict the oldest entry and retain recently used entries at the bound", () => {
  const cache = new Recent<number | undefined>();
  const capacity = 64;
  cache.set("0", undefined);
  for (let i = 1; i < capacity; i++) cache.set(String(i), i);
  expect(cache.get("0")).toBeUndefined();
  cache.set(String(capacity), capacity);
  expect(cache.get("1")).toBeUndefined();
  for (let i = 2; i <= capacity; i++) expect(cache.get(String(i))).toBe(i);
  cache.delete("2");
  cache.set("next", 100);
  expect(cache.get("0")).toBeUndefined();
  expect(cache.get("3")).toBe(3);
  cache.set("last", 101);
  // After touching 0 and 3, 4 is oldest and must be evicted.
  expect(cache.get("4")).toBeUndefined();
});
