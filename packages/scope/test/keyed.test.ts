import { runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";
import type { Item } from "@generalbusiness/artroom-contract";
import { stateDigest } from "@generalbusiness/artroom-derive";
import { SqliteStore } from "../src/sqlite.ts";
import { objectOf } from "./support.ts";

// Scope contract, revision 23, section 17.2a, "An index that an item type declares" (row I3-61; witness 18.53, cases 23 and 25, on
// real storage). The store is the real one, on a Durable Object's SQLite. The items are written by hand, as the fold writes them:
// no entry was judged, and no definition is pinned. It shows the one lookup and that the index is derived state, and nothing of a
// judge.
test("a declared index on real storage: one lookup gives the items of a key in order of item ID, up to the limit; it answers nothing while a row is missing; and a checkpoint's digest holds no row of it", async () => {
  await runInDurableObject(objectOf(`sc_${"k".repeat(51)}a`), (_instance, state) => {
    const store = new SqliteStore({ exec: (query, ...bindings) => state.storage.sql.exec(query, ...bindings), transaction: (closure) => state.storage.transactionSync(closure) });
    const job = (id: number, key: string, status = "queued"): Item => ({ id, type: "job", state: status, revision: 1, opened: null, parties: {}, refs: { ticket: key }, values: {}, attributed: [] });
    const open = (item: Item, indexed = true) => { store.putItem(item); store.addCount(item.type, item.state, 1); if (indexed) store.putIndexed("job", "ticket", JSON.stringify(item.refs["ticket"]), item.id); };
    // A type with no item has a complete index, which holds nothing.
    expect(store.lookup("job", "ticket", '"x"', 9)).toEqual([]);
    for (const [id, key] of [[7, "x"], [3, "x"], [5, "y"], [9, "x"]] as const) open(job(id, key));
    const before = stateDigest(store.all());
    expect([store.lookup("job", "ticket", '"x"', 9), store.lookup("job", "ticket", '"x"', 2), store.lookup("job", "ticket", '"y"', 9), store.lookup("job", "ticket", '"z"', 9)]).toEqual([[3, 7, 9], [3, 7], [5], []]);
    // A key is the whole text: no prefix and no part of it finds an item.
    expect(store.lookup("job", "ticket", '"', 9)).toEqual([]);
    // A change of state moves no row, and a final item keeps its row.
    store.putItem(job(3, "x", "gone"));
    store.addCount("job", "queued", -1);
    store.addCount("job", "gone", 1);
    expect(store.lookup("job", "ticket", '"x"', 9)).toEqual([3, 7, 9]);
    // A slot that was never indexed, and an index that lacks the row of one item, answer no lookup.
    expect(store.lookup("job", "owner", '"x"', 9)).toBeNull();
    open(job(11, "x"), false);
    expect(store.lookup("job", "ticket", '"x"', 9)).toBeNull();
    store.putIndexed("job", "ticket", '"x"', 11);
    expect(store.lookup("job", "ticket", '"x"', 9)).toEqual([3, 7, 9, 11]);
    // The index is in no checkpoint: with four rows more the state has the digest of its items alone.
    const plain = new SqliteStore({ exec: (query, ...bindings) => state.storage.sql.exec(query, ...bindings), transaction: (closure) => state.storage.transactionSync(closure) });
    expect(before).toMatch(/^sha256:/);
    expect(plain.all().items.map((item) => item.id)).toEqual([3, 5, 7, 9, 11]);
    expect(JSON.stringify(plain.all()).includes("keyed")).toBe(false);
  });
});
