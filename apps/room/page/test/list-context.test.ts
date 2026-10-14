import { expect, test } from "vitest";
import { keyIdOfSecret, newIncarnation } from "@generalbusiness/artroom-bytes";
import { ListContexts, type ListContext, type ListStorage } from "../src/list-context.ts";

// Made-up public contexts. No native permission, membership or browser runs.
const context = (): ListContext => ({ origin: "https://page.test", directory: `sc_${"a".repeat(52)}`,
  membership: { scope: `sc_${"b".repeat(51)}a`, inc: newIncarnation(new Uint8Array(16).fill(2)), kind: "membership" },
  key: keyIdOfSecret(new Uint8Array(32).fill(7)) });
const storage = (): ListStorage & { records: Map<string, string> } => {
  const records = new Map<string, string>();
  return { records, getItem: (key) => records.get(key) ?? null, setItem: (key, value) => { records.set(key, value); } };
};

test("list queries and filters survive redraw and fresh tab-runtime reads without crossing room, membership, device or destination", () => {
  const kept = storage();
  const lists = new ListContexts(() => kept);
  const here = context(), issue = { query: '<script>"guide"</script> & #12', filter: "closed" as const };
  lists.keepState(here, "issue", issue);
  lists.keepState(here, "change", { query: "policy", filter: "merged" });
  // A detail/back redraw uses the same context; a document refresh has a fresh
  // module instance but the same session storage. Query characters stay literal.
  expect(lists.stateOf(here, "issue")).toEqual(issue);
  const refreshed = new ListContexts(() => kept);
  expect(refreshed.stateOf(here, "issue")).toEqual(issue);
  expect(refreshed.stateOf(here, "change")).toEqual({ query: "policy", filter: "merged" });
  for (const elsewhere of [
    { ...here, origin: "https://another.test" }, { ...here, directory: `sc_${"c".repeat(51)}a` as const },
    { ...here, membership: { ...here.membership, inc: newIncarnation(new Uint8Array(16).fill(3)) } },
    { ...here, membership: { ...here.membership, scope: `sc_${"d".repeat(51)}a` as const } },
    { ...here, key: keyIdOfSecret(new Uint8Array(32).fill(8)) },
  ]) expect(refreshed.stateOf(elsewhere, "issue")).toEqual({ query: "", filter: "open" });
  const returned = lists.stateOf(here, "issue"); returned.query = "mutated caller copy";
  expect(lists.stateOf(here, "issue")).toEqual(issue);
  expect([...kept.records.values()].join("")).not.toContain('"secret"');
});

test("invalid or excessive stored list state is ignored; bounded records and a storage failure keep the current tab usable", () => {
  const kept = storage(), here = context();
  const lists = new ListContexts(() => kept);
  lists.keepState(here, "issue", { query: "valid", filter: "all" });
  const recordKey = [...kept.records.keys()][0]!;
  const original = kept.records.get(recordKey)!;
  for (const corrupt of ["not JSON", "x".repeat(128 * 1024 + 1), JSON.stringify([...JSON.parse(original), ...Array(64).fill(JSON.parse(original)[0])])]) {
    kept.records.set(recordKey, corrupt);
    expect(new ListContexts(() => kept).stateOf(here, "issue")).toEqual({ query: "", filter: "open" });
  }
  const rows = JSON.parse(original); rows[0][1].filter = "merged";
  kept.records.set(recordKey, JSON.stringify(rows));
  expect(new ListContexts(() => kept).stateOf(here, "issue")).toEqual({ query: "", filter: "open" });
  rows[0][1] = { query: "q".repeat(513), filter: "open" };
  kept.records.set(recordKey, JSON.stringify(rows));
  expect(new ListContexts(() => kept).stateOf(here, "issue")).toEqual({ query: "", filter: "open" });
  kept.records.clear();
  for (let n = 0; n < 70; n++) lists.keepState({ ...here, origin: `https://p${n}.test` }, "issue", { query: String(n), filter: "open" });
  expect(JSON.parse(kept.records.get(recordKey)!).length).toBe(64);
  expect(new ListContexts(() => kept).stateOf({ ...here, origin: "https://p69.test" }, "issue")).toEqual({ query: "69", filter: "open" });
  const blocked = new ListContexts(() => ({ getItem: () => { throw new Error("Storage denied"); }, setItem: () => { throw new Error("Storage denied"); } }));
  blocked.keepState(here, "issue", { query: "draft search", filter: "closed" });
  expect(blocked.stateOf(here, "issue")).toEqual({ query: "draft search", filter: "closed" });
});
