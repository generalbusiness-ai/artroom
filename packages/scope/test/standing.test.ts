/** Real native turns/SQLite; platform data, grant authority and the result
 * source/rule are scripted stand-ins. No directory policy is activated. */
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";
import type { Answer, Entry, Intent, PlatformDefinition, Request, Seed } from "@generalbusiness/dap-contract";
import { PROPOSED_BOUNDS } from "@generalbusiness/dap-contract";
import { entryHash, factRefOf, intentDigest, newIncarnation, scopeIdOf, signIntent } from "@generalbusiness/artroom-bytes";
import { PROFILES, StandingError, standingEntries, validateDefinition } from "@generalbusiness/dap-derive";
import { forged, grantOf } from "@generalbusiness/dap-derive/testing";
import { valid } from "../../derive/test/fixtures.ts";
import { standingData } from "../../derive/test/fixtures-standing.ts";
import type { ScopeObject } from "../src/object.ts";
import { SqliteStore } from "../src/sqlite.ts";
import { controls } from "../src/testing.ts";
import { wired } from "./outside.ts";
import { START, at, objectOf, rita, stubOf } from "./support.ts";

const MADE = "platform:task@1" as PlatformDefinition;

test("C1 native admission reserves before new work, rolls back ordinary/owed marked decreases at B, then accepts valid settlement and retains final counter across restart", async () => {
  const data = standingData(d => {
    // A real nonempty index makes rollback of index state observable.
    d.items.repo.values.serial = { fixed: true, required: true, default: 0, of: { type: "int", min: 0, max: 0 } };
    d.items.repo.indexes = ["serial"];
  });
  const definition = valid(validateDefinition(data, PROPOSED_BOUNDS, PROFILES, { platform: true }));
  let reached = 0, next = 0, extra = 0;
  const founding: Intent = { v: 1, to: null, actor: rita.key, kind: "found", on: null, expected: {}, fields: { source: "standing fixture" }, idempotencyKey: crypto.randomUUID(), notAfter: at(60) };
  const seed: Seed = { v: 1, kind: "directory", definition: MADE, creator: null, cause: intentDigest(founding), ordinal: 0 };
  const name = scopeIdOf(seed), control = controls(name, START);
  control.bounds = { ...PROPOSED_BOUNDS, scopeEntries: 8 };
  const rules = { "settle-counter": { place: "effect" as const, most: 1, run() { reached++; return [{ effect: "value" as const, item: 0, slot: "count", value: next }]; } } };
  wired.set(name, () => ({ transport: null, owners: { rules: () => null, reserves: () => extra }, definitions: { read: () => Promise.resolve({ ok: false, reason: "unavailable" }), platform: named => named === MADE ? { data, rules } : null } }));
  try {
    const stub = stubOf(name), receiver = objectOf(name) as unknown as Pick<ScopeObject, "deliver">, creationAnswer = await stub.create(signIntent(founding, rita.secret), MADE);
    if (creationAnswer.answer !== "accepted") return expect.fail(JSON.stringify(creationAnswer));
    const scope = creationAnswer.receipt.fact.at;
    // A different, fully named scope is a scripted result source, not a live peer.
    const peer = { scope: scopeIdOf({ ...seed, ordinal: 1 }), kind: scope.kind, inc: newIncarnation(new Uint8Array(16).fill(2)) };
    const act = (kind: string, fields: Intent["fields"] = {}): Promise<Answer> => stub.submit(signIntent({ v: 1, to: scope, actor: rita.key, kind, on: 0, expected: { on: revision }, fields, idempotencyKey: crypto.randomUUID(), notAfter: at(60) }, rita.secret), [grantOf(rita, scope, ["set"])]);
    const snapshot = () => runInDurableObject(objectOf(name), (_instance, state) => {
      const store = new SqliteStore({ exec: (query, ...args) => state.storage.sql.exec(query, ...args), transaction: work => state.storage.transactionSync(work) });
      const entries = state.storage.sql.exec<{ bytes: string }>("SELECT bytes FROM entry ORDER BY seq").toArray().map(row => JSON.parse(row.bytes) as Entry);
      return { state: store.all(), entries, index: state.storage.sql.exec("SELECT type, slot, key, id FROM item_key ORDER BY type, slot, key, id").toArray() };
    });
    let revision = 1;
    const initial = await snapshot();
    expect(initial.index).toHaveLength(1);
    expect(initial.entries).toHaveLength(1);
    const selection = await runInDurableObject(objectOf(name), (_instance, state) => {
      const calls: { query: string; args: unknown[]; rows: number }[] = [];
      const store = new SqliteStore({ exec: (query, ...args) => { const rows = state.storage.sql.exec(query, ...args).toArray(); calls.push({ query, args, rows: rows.length }); return { toArray: () => rows }; }, transaction: work => state.storage.transactionSync(work) });
      calls.length = 0; // initialization DDL is not a selector read
      expect(standingEntries(store, definition)).toBe(6);
      const normal = calls.slice(); calls.length = 0;
      const item = store.item(0)!;
      // Inconsistent native count/page: a second body is present while
      // the count still says one. The limit-one page's detector reads two.
      state.storage.sql.exec("INSERT INTO item (id, type, state, record) VALUES (?, ?, ?, ?)", 99, item.type, item.state, JSON.stringify({ ...item, id: 99 }));
      try { expect(() => standingEntries(store, definition)).toThrow(StandingError); }
      finally { state.storage.sql.exec("DELETE FROM item WHERE id = ?", 99); }
      return { normal, ambiguity: calls.filter(call => /^SELECT record FROM item WHERE type/.test(call.query)) };
    });
    expect(selection.normal.filter(call => /^SELECT n FROM item_count/.test(call.query))).toHaveLength(2);
    expect(selection.normal.filter(call => /^SELECT record FROM item WHERE type/.test(call.query)).map(call => [call.args, call.rows])).toEqual([[["repo", "open", -1, 2], 1]]);
    expect(selection.ambiguity.map(call => [call.args, call.rows])).toEqual([[["repo", "open", -1, 2], 2]]);
    expect(await snapshot()).toEqual(initial);
    expect(await act("chatter")).toMatchObject({ answer: "refused", reason: "scope-full" });
    expect(await snapshot()).toEqual(initial);
    expect(await act("advance", { next: 1, peer })).toMatchObject({ answer: "accepted" });
    const full = await snapshot(); revision = full.state.items[0]!.revision;
    expect(full.entries).toHaveLength(2);
    expect(full.state.items[0]!.values["count"]).toBe(1);
    expect(await act("chatter")).toMatchObject({ answer: "refused", reason: "scope-full" });
    expect(await act("set", { next: 0 })).toMatchObject({ answer: "unavailable" });
    expect(await snapshot()).toEqual(full);
    // The owner reservation is a stand-in. Its invalid operand is found
    // after fold by capacity accounting; the transaction must roll back
    // and use the existing unavailable boundary instead of throwing.
    extra = -1;
    try { expect(await act("chatter")).toMatchObject({ answer: "unavailable" }); }
    finally { extra = 0; }
    expect(await snapshot()).toEqual(full);
    const restoreCounter = (bad: boolean) => runInDurableObject(objectOf(name), (_instance, state) => {
      const item = full.state.items[0]!;
      state.storage.sql.exec("UPDATE item SET record = ? WHERE id = 0", JSON.stringify(bad ? { ...item, values: { ...item.values, count: null } } : item));
    });
    await restoreCounter(true);
    try {
      const corrupt = await snapshot();
      expect(await act("chatter")).toMatchObject({ answer: "unavailable" });
      expect(await snapshot()).toEqual(corrupt);
    } finally { await restoreCounter(false); }
    expect(await snapshot()).toEqual(full);
    const origin = full.entries[1]!, request = origin.sends[0]!.message as Request;
    const message = { class: "result", of: { from: factRefOf(origin), n: 0 }, outcome: "applied" } as const;
    const source = forged(peer, 2, { type: "delivery", from: factRefOf(origin), n: 0, message: request, decision: "applied" }, [{ n: 0, to: scope, message }]);
    const from = { at: peer, seq: 2, hash: entryHash(source.entry) };
    control.foreign.set(from.hash, source);
    expect(await receiver.deliver({ to: scope, from, n: 0, message })).toMatchObject({ answer: "retry", reason: "unavailable" });
    expect(reached).toBeGreaterThan(0); // preparation and commit both reach the owed clause
    const badReached = reached;
    expect(await snapshot()).toEqual(full); // entry, acceptance, item, counts, request and index
    await evictDurableObject(objectOf(name));
    expect(await snapshot()).toEqual(full);
    next = 1;
    expect(await receiver.deliver({ to: scope, from, n: 0, message })).toMatchObject({ answer: "recorded" });
    expect(reached).toBeGreaterThan(badReached);
    const settled = await snapshot(); revision = settled.state.items[0]!.revision;
    expect(settled.entries).toHaveLength(3);
    expect(settled.state.requests[0]!.result).not.toBeNull();
    expect(await act("finish")).toMatchObject({ answer: "accepted" });
    const final = await snapshot();
    expect(final.state.items[0]!.state).toBe("done");
    expect(final.state.items[0]!.values["count"]).toBe(1);
    expect(final.index).toEqual(initial.index);
    await evictDurableObject(objectOf(name));
    expect(await snapshot()).toEqual(final);
  } finally { wired.delete(name); }
});


test("C1 genesis at B minus one refuses with no entry; absent native selection reads only bounded state counts", async () => {
  const data = standingData();
  const definition = valid(validateDefinition(data, PROPOSED_BOUNDS, PROFILES, { platform: true }));
  const founding: Intent = { v: 1, to: null, actor: rita.key, kind: "found", on: null, expected: {}, fields: { source: "B minus one" }, idempotencyKey: crypto.randomUUID(), notAfter: at(60) };
  const seed: Seed = { v: 1, kind: "directory", definition: MADE, creator: null, cause: intentDigest(founding), ordinal: 0 };
  const name = scopeIdOf(seed), control = controls(name, START);
  control.bounds = { ...PROPOSED_BOUNDS, scopeEntries: 7 };
  wired.set(name, () => ({ definitions: { read: () => Promise.resolve({ ok: false, reason: "unavailable" }), platform: named => named === MADE ? { data, rules: { "settle-counter": { place: "effect", most: 1, run: () => [] } } } : null } }));
  try {
    expect(await stubOf(name).create(signIntent(founding, rita.secret), MADE)).toMatchObject({ answer: "refused", reason: "scope-full" });
    const empty = await runInDurableObject(objectOf(name), (_instance, state) => {
      const calls: { query: string; rows: number }[] = [];
      const store = new SqliteStore({ exec: (query, ...args) => { const result = state.storage.sql.exec(query, ...args); const rows = result.toArray(); calls.push({ query, rows: rows.length }); return { toArray: () => rows, one: () => rows[0] } as never; }, transaction: work => state.storage.transactionSync(work) });
      expect(store.scope()).toBeNull();
      const amount = standingEntries(store, definition);
      return { amount, calls, entries: state.storage.sql.exec("SELECT * FROM entry").toArray(), items: state.storage.sql.exec("SELECT * FROM item").toArray() };
    });
    expect(empty.amount).toBe(6);
    expect(empty.entries).toEqual([]); expect(empty.items).toEqual([]);
    expect(empty.calls.filter(call => /^SELECT n FROM item_count/.test(call.query))).toHaveLength(2);
    expect(empty.calls.some(call => /FROM item WHERE/.test(call.query))).toBe(false);
  } finally { wired.delete(name); }
});
