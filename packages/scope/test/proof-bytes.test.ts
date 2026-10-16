import { expect, test } from "vitest";
import type { Entry, OperationId } from "@generalbusiness/dap-contract";
import { canonicalize, digestBytes, entryHash, utf8 } from "@generalbusiness/artroom-bytes";
import { ProofBytes, PROOF_BYTE_BOUNDS as B } from "../src/proof-bytes.ts";
import { SqliteStore, type Sql } from "../src/sqlite.ts";
import { at, found, rita } from "./support.ts";
import { outsideOf, pushOf } from "./outside.ts";
import { open } from "./operation-opening.ts";
import { namespace } from "../src/namespace.ts";

const sqlOf = (state: DurableObjectState): Sql => ({ exec: (query, ...args) => state.storage.sql.exec(query, ...args), transaction: work => state.storage.transactionSync(work) });

test("native proof source returns only exact admitted entry bytes and checks full identity before bodies", async () => {
  const scope = await found();
  const got = await scope.inside(async (state, instance) => {
    const sql = sqlOf(state), store = new SqliteStore(sql), first = store.stored(0)!, identity = new ProofBytes(sql).identity()!;
    const source = instance as { proofSource(fact: unknown, max: number, milliseconds?: number): { fact: unknown; bytes: string } | null };
    const answer = source.proofSource(identity.genesis, first.size);
    const timed = source.proofSource(identity.genesis, first.size, 10_000);
    const invalidTime = [0, -1, NaN, 10_001].map(ms => source.proofSource(identity.genesis, first.size, ms));
    let bodies = 0;
    const traced = new ProofBytes({ exec(query, ...args) { if (query.startsWith("SELECT bytes FROM entry")) bodies++; return sql.exec(query, ...args); } });
    const refused = [
      traced.exact({ ...identity.genesis, at: { ...identity.genesis.at, kind: "register" } }, first.size),
      traced.exact({ ...identity.genesis, at: { ...identity.genesis.at, inc: `in_${"a".repeat(26)}` } }, first.size),
      traced.exact({ ...identity.genesis, hash: `sha256:${"0".repeat(64)}` }, first.size),
      traced.exact({ ...identity.genesis, seq: 1 }, first.size),
      traced.exact(identity.genesis, first.size - 1), traced.exact(identity.genesis, NaN),
    ];
    const owner = instance as { genesisEligibility(request: () => { key: typeof rita.key; since: number }): Promise<unknown> };
    const eligibility = await owner.genesisEligibility(() => ({ key: rita.key, since: Date.parse(at(0)) }));
    return { answer, timed, invalidTime, expected: { fact: identity.genesis, bytes: first.bytes }, refused, bodies, eligibility };
  });
  expect(got.answer).toEqual(got.expected);
  expect(got.timed).toEqual(got.expected);
  expect(got.invalidTime).toEqual([null, null, null, null]);
  expect(got.eligibility).toEqual({ state: "positive" });
  expect(Object.keys(got.answer!)).toEqual(["fact", "bytes"]);
  expect(got.refused).toEqual(Array(6).fill(null)); expect(got.bodies).toBe(0);
});

/** Synthetic canonical entry padding on real SQLite, not native judgments. */
test("native sender admits truthful UTF8 bytes at the hard bound and refuses B+1 before body transfer", async () => {
  for (const size of [B.body, B.body + 1]) {
    const scope = await found();
    const got = await scope.inside(state => {
      const sql = sqlOf(state), store = new SqliteStore(sql), original = JSON.parse(store.stored(0)!.bytes) as Entry;
      const entry = { ...original, effects: [...original.effects, { effect: "record" as const, capability: "hold@1" as const, kind: "padding", key: [], state: "padded", values: { text: "é😀" } }] };
      const extra = size - utf8(canonicalize(entry)).length;
      entry.effects[entry.effects.length - 1] = { effect: "record", capability: "hold@1" as const, kind: "padding", key: [], state: "padded", values: { text: "é😀" + "x".repeat(extra) } };
      const bytes = canonicalize(entry), hash = entryHash(entry);
      state.storage.sql.exec("UPDATE entry SET bytes=?,hash=?,size=1 WHERE seq=0", bytes, hash); // forged legacy size must not decide
      store.setScope({ ...store.scope()!, head: { seq: 0, hash }, genesis: { ...store.scope()!.genesis, hash } });
      let bodies = 0;
      const proof = new ProofBytes({ exec(query, ...args) { if (query.startsWith("SELECT bytes FROM entry")) bodies++; return sql.exec(query, ...args); } });
      const identity = proof.identity()!, answer = proof.exact(identity.genesis, Number.MAX_SAFE_INTEGER);
      return { bytes: utf8(bytes).length, body: answer ? utf8(answer.bytes).length : null, bodies };
    });
    expect(got.bytes).toBe(size);
    expect(got.body).toBe(size === B.body ? size : null);
    expect(got.bodies).toBe(size === B.body ? 1 : 0);
  }
});

test("proof sender bounds scope metadata and retained bodies before transfer and validates both digest bindings", async () => {
  const scope = await found();
  const got = await scope.inside(state => {
    const sql = sqlOf(state), store = new SqliteStore(sql), first = store.stored(0)!, proof = new ProofBytes(sql), fact = proof.identity()!.genesis;
    const content = digestBytes(utf8(first.bytes)), use = { fact, content };
    store.retain({ kind: "entry", digest: content, bytes: first.bytes, under: "ignored-secret-bearing-label" });
    const valid = proof.retained(use, first.size);
    let bodies = 0;
    const traced = new ProofBytes({ exec(query, ...args) { if (query.startsWith("SELECT bytes FROM")) bodies++; return sql.exec(query, ...args); } });
    const small = traced.retained(use, first.size - 1);
    const wrong = proof.retained({ fact: { ...fact, hash: `sha256:${"0".repeat(64)}` }, content }, first.size);
    state.storage.sql.exec("UPDATE retained_input SET bytes=? WHERE kind='entry' AND digest=?", "x".repeat(B.body + 1), content);
    const oversized = traced.retained(use, B.body);
    const current = store.scope()!;
    state.storage.sql.exec("UPDATE meta SET v=? WHERE k='scope'", canonicalize({ ...current, padding: "x".repeat(B.scope + 1) }));
    const badMeta = traced.exact(fact, B.body);
    return { valid: valid.kind, small, wrong, oversized, badMeta, bodies };
  });
  expect(got.valid).toBe("body");
  expect([got.small, got.wrong, got.oversized]).toEqual(Array(3).fill({ kind: "unavailable" }));
  expect(got.badMeta).toBeNull(); expect(got.bodies).toBe(0);
});

test("internal proof RPC on a restarted scope starts no parked outside driver", async () => {
  const scope = await found(), outside = outsideOf(scope.name);
  outside.accepting = false;
  const [operation] = await open(scope, pushOf(1)) as [OperationId];
  expect(await (scope.object as unknown as { effect(): Promise<number> }).effect()).toBe(0);
  const before = await scope.inside(state => {
    const store = new SqliteStore(sqlOf(state)), first = store.stored(0)!;
    return { fact: new ProofBytes(sqlOf(state)).identity()!.genesis, size: first.size, hash: store.scope()!.head.hash };
  });
  outside.accepting = true; await scope.restart();
  try {
    const value = await (scope.object as unknown as { proofSource(fact: unknown, max: number): Promise<unknown> }).proofSource(before.fact, before.size);
    expect(value).toMatchObject({ fact: before.fact });
    for (let turn = 0; turn < 12; turn++) await Promise.resolve();
    const after = await scope.inside(state => ({ head: new SqliteStore(sqlOf(state)).scope()!.head.hash, sent: state.storage.sql.exec("SELECT sent FROM attempt WHERE seq=1 AND k=0 AND attempt=1").one()["sent"] }));
    expect(after).toEqual({ head: before.hash, sent: null });
    expect(outside.sent).toHaveLength(0);
  } finally {
    // A guard-removal control may have started this stand-in request.
    if (operation) outside.answer(operation, 1, { result: "confirmed", evidence: { basis: "own-answer", body: { commit: "proof-read-control" } } });
  }
});

test("namespace proof capability preflights and never falls back to the materialized generic source", async () => {
  const scope = await found(), fact = await scope.inside(state => new ProofBytes(sqlOf(state)).identity()!.genesis);
  let looks = 0, generic = 0, maximum = 0;
  const peer = { source: async () => { generic++; return null; } };
  const binding = { idFromName: (name: string) => name as unknown as DurableObjectId, get: () => { looks++; return peer; } };
  const source = namespace(binding).proofs;
  expect(await source.read(fact, NaN)).toBeNull(); expect(looks).toBe(0);
  expect(await source.read(fact, B.body)).toBeNull(); expect(generic).toBe(0);
  Object.assign(peer, { proofSource: async (_fact: unknown, max: number) => { maximum = max; return null; } });
  expect(await source.read(fact, Number.MAX_SAFE_INTEGER)).toBeNull();
  expect(maximum).toBe(B.body); expect(generic).toBe(0); expect(looks).toBe(2);
  let remaining: number | undefined;
  Object.assign(peer, { proofSource: async (_fact: unknown, _max: number, ms?: number) => { remaining = ms; return null; } });
  expect(await source.read(fact, B.body, 9000)).toBeNull();
  expect(remaining).toBe(9000);
  const before = looks;
  expect(await source.read(fact, B.body, 10_001)).toBeNull();
  expect(looks).toBe(before);
});
