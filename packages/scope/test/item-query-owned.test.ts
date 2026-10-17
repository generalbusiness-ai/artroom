import { expect, test } from "vitest";
import type { ItemQuery } from "@generalbusiness/dap-contract";
import { canonicalize, encodeItemQueryParameter, itemQueryArgument, utf8 } from "@generalbusiness/artroom-bytes";
import { secretSigner, signedReader } from "@generalbusiness/artroom-client";
import { ItemQueryBudget, type ItemQueryPhase, type ItemQueryCost } from "../src/item-query-budget.ts";
import type { NativeItemQuery } from "../src/item-queries.ts";
import { runInDurableObject } from "cloudflare:test";
import { sessionRoom } from "./support/session-room.ts";
import { mintSession, readerOf } from "../src/sessions.ts";
import { net } from "./net.ts";
import { at, create, rita } from "./support.ts";

/** Passive native SQL observation only while the real object's query runs.
 * Constructor/setup/background work is excluded, not advertised as bounded. */
async function measured(state: DurableObjectState, instance: object, encoded: unknown, reader: unknown, afterSql?: (query: string) => void, allSql = false) {
  const native = state.storage.sql, target = (allSql ? Object.getPrototypeOf(native) : native) as SqlStorage, original = target.exec;
  const descriptor = Object.getOwnPropertyDescriptor(target, "exec");
  const queries: string[] = [], bodies: number[] = [];
  let rowsRead = 0, rowsWritten = 0;
  const budgets = new Map<ItemQueryBudget, ReturnType<ItemQueryBudget["admitted"]>>(), spend = ItemQueryBudget.prototype.spend;
  let phase: ItemQueryPhase | null = null, mode: "signed" | "session" | null = null;
  const actual: Partial<Record<ItemQueryPhase, { calls: number; metadata: number; rows: number; historyBytes: number; definitionBytes: number; foldBytes: number; bodies: number }>> = {};
  target.exec = (function (this: SqlStorage, ...args: Parameters<SqlStorage["exec"]>) {
    const cursor = original.apply(this, args), rows = cursor.toArray();
    queries.push(args[0]); rowsRead += cursor.rowsRead; rowsWritten += cursor.rowsWritten;
    for (const row of rows) if (typeof row["bytes"] === "string" && /FROM entry|kind='entry'/.test(args[0])) bodies.push(utf8(row["bytes"]).length);
    const executing = this === native ? phase : mode === "session" ? "peerPreparation" : "causal";
    if (executing) {
      const cost = actual[executing] ??= { calls: 0, metadata: 0, rows: 0, historyBytes: 0, definitionBytes: 0, foldBytes: 0, bodies: 0 };
      cost.calls++; cost.rows += rows.length;
      const metadata = rows.map(row => Object.fromEntries(Object.entries(row).filter(([key, value]) => {
        if (typeof value !== "string") return true;
        if (key === "bytes") {
          if (/FROM entry|kind='entry'/.test(args[0])) cost.historyBytes += utf8(value).length;
          else cost.definitionBytes += utf8(value).length;
          return false;
        }
        if (key === "record") { if (executing === "page") cost.bodies++; else cost.foldBytes += utf8(value).length; return false; }
        return true;
      })));
      cost.metadata += utf8(canonicalize(metadata)).length;
    }
    afterSql?.(args[0]);
    return { toArray: () => rows } as unknown as ReturnType<SqlStorage["exec"]>;
  }) as SqlStorage["exec"];
  const setPhase = (value: ItemQueryPhase) => { phase = value; };
  ItemQueryBudget.prototype.spend = function (phase: ItemQueryPhase, cost: Partial<ItemQueryCost>) { spend.call(this, phase, cost); mode = this.mode; setPhase(phase); budgets.set(this, this.admitted()); };
  try {
    const result = await (instance as { queryItems(encoded: unknown, reader: unknown): Promise<NativeItemQuery> }).queryItems(encoded, reader);
    return { result, queries, bodies, rowsRead, rowsWritten, actual, admitted: [...budgets.values()] };
  } finally { if (descriptor) Object.defineProperty(target, "exec", descriptor); else Reflect.deleteProperty(target, "exec"); ItemQueryBudget.prototype.spend = spend; }
}

const queryOf = (scope: Awaited<ReturnType<typeof create>>): ItemQuery => ({ v: 1, scope: scope.at, type: "commitment", states: ["accepted"], ids: null, limit: 100, cursor: null });
const header = (query: ItemQuery, now = () => Date.parse(at(0))) => signedReader(secretSigner(rita.secret), query.scope.scope, "query-items", itemQueryArgument(query)!, { now });

test("native query rejects malformed input and headers before protected SQL and charges cold and warm local signer work", async () => {
  const scope = await create(); await scope.commitment();
  const query = queryOf(scope), encoded = encodeItemQueryParameter(query)!, reader = await header(query);
  await scope.restart();
  const got = await scope.inside(async (state, instance) => {
    const invalid = [];
    for (const [value, who] of [["!", reader], ["A".repeat(10924), reader], [encoded, reader + "!"], [encoded, "Signed " + "A".repeat(2050)], [encoded, null]] as const) invalid.push(await measured(state, instance, value, who));
    return { invalid, cold: await measured(state, instance, encoded, reader), warm: await measured(state, instance, encoded, reader) };
  });
  expect(got.invalid.every(value => !value.result.ok && value.queries.length === 0)).toBe(true);
  for (const value of [got.cold, got.warm]) {
    expect(value.result.ok).toBe(true);
    expect(value.rowsWritten).toBe(0);
    expect(value.admitted).toHaveLength(1);
    const budget = value.admitted[0]!;
    expect(budget.total.calls).toBeGreaterThanOrEqual(value.queries.length);
    expect(budget.total.calls).toBeLessThanOrEqual(360);
    expect(budget.phases.signer!.historyBodies).toBe(1);
    expect(budget.phases.preparation!.genesisBytes).toBe(1024 * 1024);
    expect(value.bodies).toHaveLength(2); // actual signer entry plus actual own genesis
    expect(value.bodies.reduce((sum, bytes) => sum + bytes, 0)).toBeLessThanOrEqual(budget.total.historyBytes);
    expect(budget.phases.causal).toBeUndefined();
    expect(budget.phases.page!.bodies).toBe(1);
    expect(value.result.ok && utf8(value.result.serialized).length).toBe(budget.phases.page!.payloadBytes);
  }
  expect(got.warm.queries.length).toBeLessThanOrEqual(got.cold.queries.length);
});

test("native query keeps unknown signer evidence distinct and rechecks expiry after its last body SQL", async () => {
  const scope = await create(); await scope.commitment();
  const query = queryOf(scope), encoded = encodeItemQueryParameter(query)!, reader = await header(query);
  const got = await scope.inside(async (state, instance) => {
    // Derived-index damage only: genuine immutable entries/genesis stay intact.
    state.storage.sql.exec("DELETE FROM latest_local_signer; DELETE FROM local_signer_control").toArray();
    const rooted = await measured(state, instance, encoded, reader);
    const expiry = await measured(state, instance, encoded, reader, sql => { if (sql.startsWith("SELECT record FROM item")) scope.c.clock.now = at(60); });
    return { rooted, expiry };
  });
  expect(got.rooted.result.ok).toBe(true); // unknown index does not veto own-genesis root
  expect(got.rooted.admitted[0]!.phases.causal!.historyBodies).toBe(16);
  expect(got.rooted.bodies).toHaveLength(2); // preparation and causal genesis both actually loaded
  expect(got.expiry.queries.at(-1)).toMatch(/^SELECT record FROM item/);
  expect(got.expiry.result).toEqual({ ok: false, reason: "forbidden" });
  expect(got.expiry.rowsWritten).toBe(0);
});


test("native composed queries charge actual exact-proof and birth-reference receivers across cold and warm owners", async () => {
  const f = await sessionRoom();
  try {
    const child = f.children[1]!;
    const query: ItemQuery = { v: 1, scope: f.rules, type: "rules", states: ["current"], ids: null, limit: 100, cursor: null };
    const encoded = encodeItemQueryParameter(query)!, reader = await header(query, () => Date.parse(net.clock.now));
    // Directory/register receivers are already constructed by genuine setup.
    // Eviction makes this local query owner cold; receiver constructor and
    // background work remain separately qualified, outside the read envelope.
    await f.life.wait(() => child.restart());
    const observations = await f.life.wait(() => runInDurableObject(child.object, async (instance, state) => {
      const cold = await measured(state, instance, encoded, reader, undefined, true);
      const warm = await measured(state, instance, encoded, reader, undefined, true);
      // Explicitly minted policy input; native issuance is witnessed in the
      // other test file. No live roster/key lookup is promised for a token.
      const token = readerOf(mintSession(f.sessions, { ...f.claims, reads: ["summary", "items"] }));
      const session = await measured(state, instance, encoded, token, undefined, true);
      return { cold, warm, session };
    }));
    for (const [kind, observation] of Object.entries(observations)) {
      expect(observation.result.ok, kind).toBe(true);
      expect(observation.rowsWritten, kind).toBe(0);
      expect(observation.admitted, kind).toHaveLength(1);
      const ledger = observation.admitted[0]!;
      expect(observation.queries.length, kind).toBeLessThanOrEqual(ledger.total.calls);
      for (const [phase, cost] of Object.entries(observation.actual)) {
        const admitted = ledger.phases[phase as ItemQueryPhase]!;
        expect(admitted, `${kind} ${phase}`).toBeDefined();
        expect(cost.calls, `${kind} ${phase} calls`).toBeLessThanOrEqual(admitted.calls);
        expect(cost.metadata, `${kind} ${phase} metadata`).toBeLessThanOrEqual(admitted.metadata);
        expect(cost.historyBytes, `${kind} ${phase} history`).toBeLessThanOrEqual(admitted.historyBytes);
        expect(cost.definitionBytes, `${kind} ${phase} declaration`).toBeLessThanOrEqual(admitted.definitionBytes);
        expect(cost.foldBytes, `${kind} ${phase} fold`).toBeLessThanOrEqual(admitted.foldBytes);
        expect(cost.bodies, `${kind} ${phase} bodies`).toBeLessThanOrEqual(admitted.bodies);
      }
    }
    for (const signed of [observations.cold, observations.warm]) {
      expect(signed.admitted[0]!.phases.causal!.rpcs).toBeGreaterThan(0);
      expect(signed.actual.causal!.historyBytes).toBeGreaterThan(signed.actual.preparation!.historyBytes); // actual caller and ancestor bodies
    }
    expect(observations.session.admitted[0]!.phases.peerPreparation!.calls).toBe(16);
    expect(observations.session.actual.peerPreparation!.calls).toBeGreaterThan(0);
    expect(observations.session.actual.causal).toBeUndefined();
  } finally { f.life.release(); }
});
