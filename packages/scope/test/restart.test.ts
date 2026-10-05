import { describe, expect, test } from "vitest";
import { SqliteStore } from "../src/index.ts";
import { found, reader, rita, vic } from "./support.ts";

describe("a restart of the scope (sections 2.2 and 5.2)", () => {
  test("the reloaded scope has the same head, items, counts and idempotency index, runs its retained definition, and continues the sequence", async () => {
    const s = await found();
    const offer = s.offer();
    const first = await s.submit(offer);                       // entry 1: commitment 1
    await s.hold();                                            // entries 2 to 4: commitment 2, assigned under the rule, and hold 4
    const before = await s.summary();
    expect([before.at.seq, before.value.items.map((i) => [i.id, i.type, i.state])]).toEqual([4, [[0, "intent", "open"], [1, "commitment", "offered"], [2, "commitment", "accepted"], [4, "hold", "held"]]]);
    const alarm = await s.alarmAt();
    const marks = new WeakSet<object>();
    await s.inside((_state, instance) => { marks.add(instance); });

    await s.restart();
    // The object in memory is a new one; what it answers comes from storage.
    expect(await s.inside((_state, instance) => marks.has(instance))).toBe(false);
    expect([await s.summary(), await s.alarmAt()]).toEqual([before, alarm]);
    // The idempotency index is an index over the stored history: the exact retry gets its first receipt.
    expect([await s.submit(offer), (await s.head()).seq]).toEqual([first, 4]);
    // The next entry follows the head. Its rule is the retained definition's, evaluated again.
    const next = await s.did(rita, "assign", { on: 1, expected: { on: 1 }, fields: { performer: vic.member } });
    expect([next.fact.seq, (await s.entries(5))[0]!.prev]).toEqual([5, before.at.hash]);
  });

  test("a transaction that stops before its commit wrote nothing", async () => {
    const s = await found();
    await s.hold();
    const before = await s.summary();
    // On the object's own storage: one transaction writes what a commit writes for the next entry, and stops before it commits.
    const stopped = await s.inside((state) => {
      const store = new SqliteStore({ exec: (query, ...bindings) => state.storage.sql.exec(query, ...bindings), transaction: (closure) => state.storage.transactionSync(closure) });
      try {
        store.transaction(() => {
          const scope = store.scope()!;
          const hold = store.item(3)!;
          const hash = `sha256:${"0".repeat(64)}` as const;
          store.append({ v: 1, at: scope.at, seq: 4, prev: scope.head.hash, time: scope.time, clamped: false, epoch: 0, input: { type: "timed", item: 3, rule: "hold-end", due: scope.time }, uses: [], prepared: [], effects: [], sends: [] }, hash, "{}", 2);
          store.putItem({ ...hold, state: "ended" });
          store.addCount("hold", "ended", 1);
          store.setScope({ ...scope, head: { seq: 4, hash } });
          throw new Error("stopped");
        });
      } catch (error) {
        return (error as Error).message;
      }
      return "committed";
    });
    expect(stopped).toBe("stopped");
    await s.restart();
    expect([await s.summary(), (await s.entries()).length]).toEqual([before, 4]);
    expect(await s.did(rita, "remark", { on: 0, fields: { text: "after" } })).toMatchObject({ fact: { seq: 4 } });
    expect(await s.stub.entry(reader, 5)).toEqual({ ok: false, reason: "not-found" });
  });
});
