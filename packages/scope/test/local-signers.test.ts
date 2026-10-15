import { expect, test } from "vitest";
import type { Entry, Input } from "@generalbusiness/dap-contract";
import { canonicalize, entryHash, utf8 } from "@generalbusiness/artroom-bytes";
import { timeMs } from "@generalbusiness/dap-derive";
import { signerOf } from "../src/entry-signer.ts";
import { LocalSigners, SIGNER_INDEX_BOUNDS as B } from "../src/local-signers.ts";
import { SqliteStore, type Sql } from "../src/sqlite.ts";
import { Wakes } from "../src/outbox.ts";
import { at, found, rita, una, vic, type Lane } from "./support.ts";

const sqlOf = (state: DurableObjectState): Sql => ({ exec: (query, ...args) => state.storage.sql.exec(query, ...args), transaction: work => state.storage.transactionSync(work) });
const resetLegacy = (state: DurableObjectState) => {
  state.storage.sql.exec("DELETE FROM latest_local_signer; DELETE FROM local_signer_control").toArray();
  return new SqliteStore(sqlOf(state)); // captures only bounded control, not history
};

test("native append signer evidence preserves every classifier variant, inclusive time and unknown versus negative", async () => {
  const scope = await found(); await scope.hold();
  const entries = await scope.entries(), genesis = entries[0]!, act = entries[1]!;
  if (genesis.input.type !== "genesis" || act.input.type !== "act") return expect.fail("fixture lacks native signed entries");
  expect(signerOf(genesis)).toBe(rita.key);
  const unsigned: Input[] = [
    { ...genesis.input, decision: "refused" }, { ...genesis.input, founding: null },
    { type: "checkpoint", through: 0, state: entryHash(genesis) },
    { type: "timed", item: 0, rule: "rule", due: at(0) },
    { type: "diagnosis", of: { seq: 0, n: 0 }, finding: "undelivered", attempts: [] },
    { type: "outcome", operation: "0:0", attempt: 1, owner: "hold@1", kind: "fixture", result: "unknown", evidence: { basis: "none", body: null } },
    { type: "delivery", from: scope.genesis.fact, n: 0, message: { class: "advisory", type: "notify", body: null } },
  ];
  for (const input of unsigned) expect(signerOf({ ...act, input })).toBeNull(); // pure classifier variants, not judged histories
  expect(signerOf({ ...act, input: { type: "preparation", signed: act.input.signed, authority: [], capability: "hold@1", step: "fixture" } })).toBe(rita.key);
  const native = await scope.inside(state => {
    const index = new SqliteStore(sqlOf(state)).localSigners;
    return [index.proof(rita.key, timeMs(at(0))!), index.proof(una.key, timeMs(at(0))!), index.proof(vic.key, timeMs(at(0))!), index.proof(rita.key, timeMs(at(0))! + 1)];
  });
  expect(native).toEqual([{ state: "positive", seq: 2, time: at(0) }, { state: "positive", seq: 3, time: at(0) }, { state: "negative" }, { state: "negative" }]);
  await scope.inside(state => resetLegacy(state));
  expect(await scope.inside(state => new SqliteStore(sqlOf(state)).localSigners.proof(una.key, timeMs(at(0))!))).toEqual({ state: "unknown" });
  await scope.commitment(); // actual native post-cutoff append, maintained before backfill
  const partial = await scope.inside(state => {
    const index = new SqliteStore(sqlOf(state)).localSigners;
    const before = [index.proof(rita.key, timeMs(at(0))!), index.proof(vic.key, timeMs(at(0))!)];
    const batch = index.maintain();
    return { before, batch, after: [index.proof(rita.key, timeMs(at(0))!), index.proof(una.key, timeMs(at(0))!), index.proof(vic.key, timeMs(at(0))!)] };
  });
  expect(partial.before).toEqual([{ state: "positive", seq: 5, time: at(0) }, { state: "unknown" }]);
  expect(partial.batch).toMatchObject({ rows: 4, pending: false });
  expect(partial.after).toEqual([{ state: "positive", seq: 5, time: at(0) }, { state: "positive", seq: 3, time: at(0) }, { state: "negative" }]);
});

/** Synthetic canonical/hash-linked journal extension on real isolated SQLite.
 * No judgment/replay or public authority is claimed for these extra records. */
async function journal(count: number, padding = 0): Promise<Lane> {
  const scope = await found(); await scope.commitment();
  await scope.inside(state => {
    const store = new SqliteStore(sqlOf(state));
    const sample = JSON.parse(store.stored(1)!.bytes) as Entry;
    store.transaction(() => {
      let current = store.scope()!;
      for (let seq = current.head.seq + 1; seq < count; seq++) {
        const entry: Entry = { ...sample, seq, prev: current.head.hash, time: at(seq),
          effects: padding ? [{ effect: "record", capability: "hold@1", kind: "padding", key: [], state: "padded", values: { text: "x".repeat(padding) } }] : sample.effects };
        const bytes = canonicalize(entry), hash = entryHash(entry);
        store.append(entry, hash, bytes, utf8(bytes).length);
        current = { ...current, head: { seq, hash }, time: entry.time }; store.setScope(current);
      }
    });
    resetLegacy(state);
  });
  return scope;
}

test("legacy signer batches bound rows, roll back atomically, resume after eviction and retain newer appends", async () => {
  const scope = await journal(260);
  const rolled = await scope.inside(state => {
    const actual = sqlOf(state), store = new SqliteStore(actual), before = store.localSigners.status();
    const injected: Sql = { ...actual, exec(query, ...args) {
      const result = actual.exec(query, ...args);
      if (query.startsWith("INSERT INTO latest_local_signer")) throw new Error("injected batch rollback");
      return result;
    } };
    let failed = false;
    try { new LocalSigners(injected, () => store.scope()).maintain(); } catch { failed = true; }
    return { failed, before, after: store.localSigners.status(), actors: state.storage.sql.exec("SELECT COUNT(*) AS n FROM latest_local_signer").one()["n"], batch: store.localSigners.maintain() };
  });
  expect(rolled.failed).toBe(true); expect(rolled.after).toEqual(rolled.before); expect(rolled.actors).toBe(0);
  expect(rolled.batch).toMatchObject({ rows: 128, pending: true });
  expect(rolled.batch.bytes).toBeLessThanOrEqual(B.bytes);
  await scope.restart();
  const resumed = await scope.inside(state => {
    const store = new SqliteStore(sqlOf(state)), before = store.localSigners.status();
    return { before, next: store.localSigners.maintain(), last: store.localSigners.maintain(), status: store.localSigners.status(), proof: store.localSigners.proof(rita.key, timeMs(at(259))!) };
  });
  expect(resumed.before).toMatchObject({ phase: "building", next: 128 });
  expect(resumed.next).toMatchObject({ rows: 128, pending: true });
  expect(resumed.last).toMatchObject({ rows: 4, pending: false });
  expect(resumed.status).toMatchObject({ phase: "ready", next: 260 });
  expect(resumed.proof).toEqual({ state: "positive", seq: 259, time: at(259) });
});

test("signer byte admission precedes bodies and an unfit or corrupt legacy row stops without false readiness", async () => {
  for (const padding of [600_000, B.bytes + 1]) {
    const scope = await journal(6, padding);
    const got = await scope.inside(state => {
      const actual = sqlOf(state), store = new SqliteStore(actual), bodies: number[] = [];
      const traced: Sql = { ...actual, exec(query, ...args) {
        if (query.startsWith("SELECT bytes FROM entry")) bodies.push(args[0] as number);
        return actual.exec(query, ...args);
      } };
      const index = new LocalSigners(traced, () => store.scope());
      const batch = index.maintain();
      return { batch, bodies: [...bodies], status: index.status(), proof: index.proof(rita.key, timeMs(at(0))!), again: index.maintain() };
    });
    expect(got.batch.bytes).toBeLessThanOrEqual(B.bytes);
    if (padding < B.bytes) {
      expect(got.batch).toMatchObject({ rows: 4, pending: true });
      expect(got.bodies).toEqual([0, 1, 2, 3]);
      expect(got.status).toMatchObject({ phase: "building", next: 4 });
    } else {
      expect(got.status).toMatchObject({ phase: "stopped", reason: "unfit-entry" });
      expect(got.bodies).toEqual([0, 1, 2]);
      expect(got.proof).toEqual({ state: "unknown" });
      expect(got.again).toEqual({ rows: 0, bytes: 0, pending: false });
    }
  }
  const oversized = await journal(4, B.bytes + 1);
  const forged = await oversized.inside(state => {
    state.storage.sql.exec("UPDATE entry SET size=1 WHERE seq=3");
    const actual = sqlOf(state), store = new SqliteStore(actual); let bodies = 0;
    const index = new LocalSigners({ ...actual, exec(query, ...args) {
      if (query.startsWith("SELECT bytes FROM entry")) bodies++;
      return actual.exec(query, ...args);
    } }, () => store.scope());
    const batch = index.maintain();
    return { batch, bodies, status: index.status() };
  });
  expect(forged.bodies).toBe(0);
  expect(forged.batch.pending).toBe(false);
  expect(forged.status).toMatchObject({ phase: "stopped", reason: "metadata" });
});

test("signer migration rejects generation, version, missing, corrupt, backward and cutoff inconsistencies", async () => {
  for (const fault of ["version", "generation", "missing", "corrupt", "backward", "cutoff"]) {
    const scope = await journal(6);
    const got = await scope.inside(state => {
      const sql = state.storage.sql, store = new SqliteStore(sqlOf(state));
      const control = JSON.parse(sql.exec("SELECT value FROM local_signer_control").one()["value"] as string);
      if (fault === "version") { control.v = 2; sql.exec("UPDATE local_signer_control SET value=?", canonicalize(control)); }
      if (fault === "generation") { control.at.kind = "different"; sql.exec("UPDATE local_signer_control SET value=?", canonicalize(control)); }
      if (fault === "cutoff") { control.cutoff.hash = `sha256:${"0".repeat(64)}`; sql.exec("UPDATE local_signer_control SET value=?", canonicalize(control)); }
      if (fault === "missing") sql.exec("DELETE FROM entry WHERE seq=3");
      if (fault === "corrupt") sql.exec("UPDATE entry SET bytes='[]',size=2 WHERE seq=3");
      if (fault === "backward") {
        const entry = JSON.parse(sql.exec("SELECT bytes FROM entry WHERE seq=3").one()["bytes"] as string) as Entry;
        entry.time = at(-1); const bytes = canonicalize(entry);
        sql.exec("UPDATE entry SET bytes=?,hash=?,time=?,size=? WHERE seq=3", bytes, entryHash(entry), entry.time, utf8(bytes).length);
      }
      const batch = store.localSigners.maintain();
      return { batch, status: store.localSigners.status(), proof: store.localSigners.proof(rita.key, timeMs(at(0))!), again: store.localSigners.maintain() };
    });
    expect(got.status.phase).toMatch(/invalid|stopped/);
    expect(got.proof).toEqual({ state: "unknown" });
    expect(got.batch.pending).toBe(false); expect(got.again.pending).toBe(false);
  }
});

test("native history and signer maintenance roll back together and forged signer row metadata grants nothing", async () => {
  const scope = await found(); await scope.commitment();
  const got = await scope.inside(state => {
    const store = new SqliteStore(sqlOf(state)), before = store.scope()!, sample = JSON.parse(store.stored(1)!.bytes) as Entry;
    try {
      store.transaction(() => {
        const entry: Entry = { ...sample, seq: 3, prev: before.head.hash };
        const bytes = canonicalize(entry), hash = entryHash(entry);
        store.append(entry, hash, bytes, utf8(bytes).length); store.setScope({ ...before, head: { seq: 3, hash } });
        throw new Error("injected append rollback");
      });
    } catch { /* rollback is the boundary */ }
    const after = store.scope(), positive = store.localSigners.proof(rita.key, timeMs(at(0))!);
    state.storage.sql.exec("UPDATE latest_local_signer SET seq=100 WHERE actor=?", rita.key);
    return { before, after, missing: store.stored(3), positive, forged: store.localSigners.proof(rita.key, timeMs(at(0))!) };
  });
  expect(got.after).toEqual(got.before); expect(got.missing).toBeNull();
  expect(got.positive).toEqual({ state: "positive", seq: 2, time: at(0) });
  expect(got.forged).toEqual({ state: "unknown" });
});

test("signer maintenance owns one wake, migrates on activation and yields to native owners after one quantum", async () => {
  const scope = await journal(260); scope.c.clock.now = at(300);
  await scope.restart();
  expect(await scope.alarmAt()).toBe(timeMs(at(301)));
  scope.c.clock.now = at(300.5); await scope.restart();
  expect(await scope.alarmAt()).toBe(timeMs(at(301))); // activation cannot postpone its durable wake
  scope.c.clock.now = at(300);
  const order = await scope.inside(async (state, instance) => {
    const store = new SqliteStore(sqlOf(state));
    const native = instance as { alarm(): Promise<void>; dispatch(): Promise<number> };
    const original = native.dispatch;
    let atDispatch = 0;
    native.dispatch = async () => { atDispatch = store.localSigners.status().next ?? 0; throw new Error("scripted native dispatch failure"); };
    let failed = false;
    try { await native.alarm(); } catch { failed = true; } finally { native.dispatch = original; }
    return { failed, atDispatch, status: store.localSigners.status(), alarm: await state.storage.getAlarm() };
  });
  expect(order.failed).toBe(true); expect(order.atDispatch).toBe(128);
  expect(order.status).toMatchObject({ phase: "building", next: 128 });
  expect(order.alarm).toBe(timeMs(at(301)));
  await scope.inside(async state => {
    const store = new SqliteStore(sqlOf(state)); let seen: string | null = null;
    const wakes = new Wakes(store, { set: time => { seen = time; } }, false);
    await wakes.maintenance.set(at(306)); await wakes.deadline.set(at(304)); wakes.driver(timeMs(at(305)));
    await wakes.set(); expect(seen).toBe(at(304));
    await wakes.maintenance.set(null); expect(seen).toBe(at(304));
    await wakes.deadline.set(null); expect(seen).toBe(at(305));
    await wakes.maintenance.set(at(303)); expect(seen).toBe(at(303));
    wakes.driver(null); await wakes.set(); expect(seen).toBe(at(303));
    await wakes.maintenance.set(null); expect(seen).toBeNull();
  });
});


test("legacy scope metadata is admitted before index construction or proof materializes it", async () => {
  const scope = await found();
  const got = await scope.inside(state => {
    const actual = sqlOf(state);
    const original = state.storage.sql.exec("SELECT v FROM meta WHERE k='scope'").one()["v"] as string;
    const value = JSON.parse(original); value.padding = "x".repeat(B.controlBytes + 1);
    state.storage.sql.exec("UPDATE meta SET v=? WHERE k='scope'", canonicalize(value));
    state.storage.sql.exec("DELETE FROM local_signer_control; DELETE FROM latest_local_signer");
    const transferred: (number | null)[] = [];
    const sql: Sql = { ...actual, exec(query, ...args) {
      const rows = actual.exec(query, ...args).toArray();
      if (/FROM meta WHERE k\s*=\s*'scope'/.test(query)) transferred.push(typeof rows[0]?.["v"] === "string" ? utf8(rows[0]["v"]).length : null);
      return { toArray: () => rows };
    } };
    const store = new SqliteStore(sql);
    const proof = store.localSigners.proof(rita.key, timeMs(at(0))!);
    return { transferred, proof, pending: store.localSigners.pending() };
  });
  expect(got.transferred).toEqual([null]);
  expect(got.proof).toEqual({ state: "unknown" }); expect(got.pending).toBe(false);
});
