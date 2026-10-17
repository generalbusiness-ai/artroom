import { expect, test } from "vitest";
import type { Entry, FactRef, Seed } from "@generalbusiness/dap-contract";
import { canonicalize, entryHash, factRefOf, intentDigest, scopeIdOf, seedDigest, utf8 } from "@generalbusiness/artroom-bytes";
import { useOf } from "@generalbusiness/dap-derive";
import { GenesisProofs, GENESIS_PROOF_BOUNDS as B, type ProofTimer } from "../src/genesis-proof.ts";
import { ProofBytes, type ProofBody, type ProofSource } from "../src/proof-bytes.ts";
import { rootOf } from "../src/signed-reads.ts";
import { PreparationFlights } from "../src/preparation-flight.ts";
import { SqliteStore, type Sql } from "../src/sqlite.ts";
import { at, create, rita, una } from "./support.ts";

const sqlOf = (state: DurableObjectState): Sql => ({ exec: (query, ...args) => state.storage.sql.exec(query, ...args), transaction: work => state.storage.transactionSync(work) });
class Timer implements ProofTimer {
  value = 0;
  readonly tasks = new Set<{ ends: number; run(): void }>();
  now = () => this.value;
  after(ms: number, run: () => void) { const task = { ends: this.value + ms, run }; this.tasks.add(task); return () => { this.tasks.delete(task); }; }
  advance(ms: number) { this.value += ms; for (const task of [...this.tasks]) if (task.ends <= this.value) { this.tasks.delete(task); task.run(); } }
}
const deferred = <T>() => { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
const microtasks = async () => { for (let n = 0; n < 12; n++) await Promise.resolve(); };

/** Explicitly synthetic genesis chain, canonical/hash-linked on actual SQLite.
 * The signed root act is native; no native judgment/replay is claimed for
 * the constructed creations. Only the helper's proof/content behavior. */
function chain(sample: Entry, act: Entry, count: number): Entry[] {
  if (act.input.type !== "act" || sample.input.type !== "genesis") throw new Error("native fixture lacks genesis/act");
  const entries: Entry[] = [act]; let previous = act;
  for (let n = 1; n <= count; n++) {
    const seed: Seed = { ...sample.input.seed, creator: previous.at, cause: previous.input.type === "genesis" ? seedDigest(previous.input.seed) : intentDigest(act.input.signed.intent), ordinal: n };
    const genesis: Entry = { ...sample, at: { ...sample.at, scope: scopeIdOf(seed) }, time: at(n), input: { ...sample.input, seed, founding: null, source: factRefOf(previous), decision: "applied" }, uses: [useOf(factRefOf(previous), previous)] };
    entries.push(genesis); previous = genesis;
  }
  return entries;
}
function install(state: DurableObjectState, entry: Entry) {
  const store = new SqliteStore(sqlOf(state)), current = store.scope()!, hash = entryHash(entry), bytes = canonicalize(entry);
  state.storage.sql.exec("DELETE FROM entry");
  state.storage.sql.exec("INSERT INTO entry(seq,hash,time,bytes,size) VALUES(0,?,?,?,?)", hash, entry.time, bytes, new TextEncoder().encode(bytes).length);
  store.setScope({ ...current, at: entry.at, head: { seq: 0, hash }, genesis: { hash, source: entry.input.type === "genesis" ? entry.input.source : null, n: 0 }, time: entry.time });
}
function scripted(entries: readonly Entry[]) {
  const map = new Map(entries.map(entry => [canonicalize(factRefOf(entry)), { fact: factRefOf(entry), bytes: canonicalize(entry) }]));
  const calls: { fact: FactRef; max: number }[] = [];
  const source: ProofSource = { async read(fact, max) { calls.push({ fact, max }); return map.get(canonicalize(fact)) ?? null; } };
  return { map, calls, source };
}

test("native genesis evidence caches only immutable content and repeats actor/window/request checks", async () => {
  const scope = await create();
  const got = await scope.inside(async state => {
    let bodyQueries = 0;
    const actual = sqlOf(state), bytes = new ProofBytes({ exec(query, ...args) { if (query.startsWith("SELECT bytes FROM entry")) bodyQueries++; return actual.exec(query, ...args); } });
    const proof = new GenesisProofs(bytes, null, new Timer());
    const recent = () => ({ key: rita.key, since: Date.parse(at(0)) });
    const positive = await proof.eligible(recent), bodyAtFirst = bodyQueries;
    const negativeActor = await proof.eligible(() => ({ key: una.key, since: Date.parse(at(0)) }));
    const old = await proof.eligible(() => ({ key: rita.key, since: Date.parse(at(0)) + 1 }));
    let checks = 0;
    const ended = await proof.eligible(() => ++checks === 1 ? recent() : null);
    const returned = await proof.root(); if (returned.kind === "root") returned.root.actor = una.key;
    const immutable = await proof.eligible(recent);
    return { positive, negativeActor, old, ended, immutable, bodyAtFirst, bodyQueries, checks };
  });
  expect(got.positive).toEqual({ state: "positive" }); expect(got.immutable).toEqual(got.positive);
  expect([got.negativeActor, got.old]).toEqual([{ state: "negative" }, { state: "negative" }]);
  expect(got.ended).toEqual({ state: "unknown" }); expect(got.checks).toBe(2);
  expect(got.bodyAtFirst).toBe(1); expect(got.bodyQueries).toBe(1);
});

// Synthetic canonical chain on real SQLite; the peer is an explicitly gated STAND-IN.
// The parent owns the deadline/pending slot, and no late helper result performs SQL or caches content.
test("parent-owned genesis proof inherits remaining time and fences a late peer until its real task settles", async () => {
  const scope = await create(); await scope.commitment();
  const got = await scope.inside(async state => {
    const store = new SqliteStore(sqlOf(state));
    const entries = chain(JSON.parse(store.stored(0)!.bytes), JSON.parse(store.stored(1)!.bytes), 1), start = entries[1]!;
    install(state, start);
    const entered = deferred<void>(), release = deferred<ProofBody | null>(), cleaned = deferred<void>();
    const clock = new Timer(), nativeAfter = clock.after.bind(clock);
    clock.after = (ms, work) => { const cancel = nativeAfter(ms, work); return () => { cancel(); cleaned.resolve(); }; };
    const flights = new PreparationFlights(clock), requests: number[] = [];
    let sqlCalls = 0, peerCalls = 0;
    const actual = sqlOf(state), bytes = new ProofBytes({ exec(query, ...args) { sqlCalls++; return actual.exec(query, ...args); } });
    const source: ProofSource = { async read(_fact, _max, milliseconds) {
      requests.push(milliseconds ?? -1); peerCalls++;
      if (peerCalls === 1) { entered.resolve(); return release.promise; }
      return { fact: factRefOf(entries[0]!), bytes: canonicalize(entries[0]!) };
    } };
    const proof = new GenesisProofs(bytes, source, clock);
    const meter = { attempt() {}, visit() {}, peer(_max: number, milliseconds: number) { if (milliseconds <= 0) throw new Error("unadmitted peer"); } };
    const run = () => flights.run(async owner => { clock.advance(1000); return proof.owned(factRefOf(start), owner, meter); });
    const pending = run(); await entered.promise;
    clock.advance(9000);
    const expired = await pending, before = sqlCalls;
    let extraRan = false;
    const blocked = await flights.run(async () => { extraRan = true; return true; });
    release.resolve({ fact: factRefOf(entries[0]!), bytes: canonicalize(entries[0]!) });
    await cleaned.promise;
    const after = sqlCalls;
    const fresh = await run();
    return { expired, blocked, extraRan, before, after, requests, peerCalls, fresh };
  });
  expect([got.expired, got.blocked, got.extraRan]).toEqual([null, null, false]);
  expect(got.after).toBe(got.before);
  expect(got.requests).toEqual([9000, 9000]);
  expect(got.peerCalls).toBe(2);
  expect(got.fresh?.kind).toBe("root");
});

test("exact genesis chain shares rootOf semantics at four steps and separates complete-none from missing/unsupported", async () => {
  for (const depth of [1, 4, 5]) {
    const scope = await create(); await scope.commitment();
    const got = await scope.inside(async state => {
      const store = new SqliteStore(sqlOf(state)), entries = chain(JSON.parse(store.stored(0)!.bytes), JSON.parse(store.stored(1)!.bytes), depth), start = entries.at(-1)!;
      install(state, start); const scriptedSource = scripted(entries);
      const proof = new GenesisProofs(new ProofBytes(sqlOf(state)), scriptedSource.source, new Timer());
      const result = await proof.root(), beforeCache = scriptedSource.calls.length;
      const cached = await proof.root();
      expect(cached).toEqual(result); expect(scriptedSource.calls.length).toBe(beforeCache);
      const old = await rootOf(start, async use => { const value = scriptedSource.map.get(canonicalize(use.fact)); return value ? JSON.parse(value.bytes) as Entry : null; });
      const unsupported = await new GenesisProofs(new ProofBytes(sqlOf(state)), null, new Timer()).root();
      return { result, old, unsupported, calls: scriptedSource.calls };
    });
    expect(got.result.kind).toBe(depth <= 4 ? "root" : "none");
    if (got.result.kind === "root") expect(got.result.root).toEqual(got.old); else expect(got.old).toBeNull();
    expect(got.unsupported).toEqual({ kind: "unknown" });
    expect(got.calls.length).toBeLessThanOrEqual(4);
    expect(got.calls.every(call => call.max > 0 && call.max < B.bytes)).toBe(true);
  }
});

test("unknown dependency is retried, full content/fact conflict is refused and an incarnation change invalidates content cache", async () => {
  const scope = await create(); await scope.commitment();
  const got = await scope.inside(async state => {
    const store = new SqliteStore(sqlOf(state)), entries = chain(JSON.parse(store.stored(0)!.bytes), JSON.parse(store.stored(1)!.bytes), 1), start = entries[1]!;
    install(state, start); const fixture = scripted(entries); let missing = true;
    const proof = new GenesisProofs(new ProofBytes(sqlOf(state)), { read: (fact, max) => missing ? Promise.resolve(null) : fixture.source.read(fact, max) }, new Timer());
    const unknown = await proof.root(); await microtasks(); missing = false;
    const recovered = await proof.root(); await microtasks();
    const broken = { ...start, uses: [{ ...start.uses[0]!, content: `sha256:${"0".repeat(64)}` as const }] };
    install(state, broken);
    const conflict = await proof.root(); await microtasks();
    const inc = `in_${"a".repeat(26)}` as const;
    const changed: Entry = { ...start, at: { ...start.at, inc }, input: { ...start.input as Extract<Entry["input"], { type: "genesis" }>, inc } };
    install(state, changed);
    const next = await proof.root();
    return { unknown, recovered: recovered.kind, conflict, next: next.kind, calls: fixture.calls.length };
  });
  expect(got.unknown).toEqual({ kind: "unknown" }); expect(got.recovered).toBe("root");
  expect(got.conflict).toEqual({ kind: "unknown" }); expect(got.next).toBe("root"); expect(got.calls).toBe(3);
});

test("absolute completion deadline retains single-flight ownership through never-settling and late peer replies", async () => {
  const scope = await create(); await scope.commitment();
  const got = await scope.inside(async state => {
    const store = new SqliteStore(sqlOf(state)), entries = chain(JSON.parse(store.stored(0)!.bytes), JSON.parse(store.stored(1)!.bytes), 1);
    install(state, entries[1]!); const fixture = scripted(entries), clock = new Timer(), reached = deferred<void>(), late = deferred<ProofBody | null>(); let calls = 0;
    const proof = new GenesisProofs(new ProofBytes(sqlOf(state)), { read(fact, max) { calls++; reached.resolve(); return calls === 1 ? late.promise : fixture.source.read(fact, max); } }, clock);
    const first = proof.root(); await reached.promise;
    let completed = false; void first.then(() => { completed = true; });
    clock.advance(B.milliseconds); await microtasks();
    expect(completed).toBe(true); // observes completion without awaiting a potentially uncooperative source
    const timeout = await first;
    const repeated = await Promise.all(Array.from({ length: 12 }, () => proof.root()));
    const pendingCalls = calls;
    late.resolve(fixture.map.get(canonicalize(factRefOf(entries[0]!)))!); await microtasks();
    const retry = await proof.root();
    return { timeout, repeated, pendingCalls, retry: retry.kind, calls };
  });
  expect(got.timeout).toEqual({ kind: "unknown" }); expect(got.repeated).toEqual(Array(12).fill({ kind: "unknown" }));
  expect(got.pendingCalls).toBe(1); expect(got.retry).toBe("root"); expect(got.calls).toBe(2); // late answer installed no cache
});

test("body capacity counts the genesis and repeated uses spend work even when their bodies are cached", async () => {
  for (const mode of ["exact", "extra-body", "repeated-uses", "uses-search", "conflicting-uses"] as const) {
    const scope = await create(); await scope.commitment();
    const got = await scope.inside(async state => {
      const store = new SqliteStore(sqlOf(state)), act = JSON.parse(store.stored(1)!.bytes) as Entry;
      const creations = chain(JSON.parse(store.stored(0)!.bytes), act, 1), start = creations[1]!;
      const unsigned = (seq: number): Entry => ({ ...act, seq, input: { type: "checkpoint", through: 0, state: act.prev! } });
      const source = unsigned(10), extras = Array.from({ length: mode === "extra-body" ? 14 : 13 }, (_, n) => unsigned(n + 20));
      const uses = [useOf(factRefOf(source), source), ...extras.map(entry => useOf(factRefOf(entry), entry)), useOf(factRefOf(act), act)];
      if (mode === "repeated-uses") uses.splice(1, 0, ...Array.from({ length: B.attempts }, () => useOf(factRefOf(source), source)));
      if (mode === "conflicting-uses") uses.splice(1, 0, { fact: factRefOf(source), content: `sha256:${"0".repeat(64)}` });
      if (mode === "uses-search") uses.unshift(...Array.from({ length: B.visits }, () => useOf(factRefOf(extras[0]!), extras[0]!)));
      const genesis: Entry = { ...start, input: { ...start.input as Extract<Entry["input"], { type: "genesis" }>, source: factRefOf(source) }, uses };
      install(state, genesis); const fixture = scripted([act, source, ...extras]);
      const result = await new GenesisProofs(new ProofBytes(sqlOf(state)), fixture.source, new Timer()).root();
      return { result: result.kind, calls: fixture.calls.length };
    });
    expect(got.result).toBe(mode === "exact" ? "root" : "unknown");
    expect(got.calls).toBe(mode === "uses-search" ? 0 : mode === "repeated-uses" || mode === "conflicting-uses" ? 1 : 15);
  }
});

test("remaining cumulative bytes are offered to the source before another body can be materialized", async () => {
  const scope = await create(); await scope.commitment();
  const got = await scope.inside(async state => {
    const store = new SqliteStore(sqlOf(state)), sample = JSON.parse(store.stored(0)!.bytes) as Entry, nativeAct = JSON.parse(store.stored(1)!.bytes) as Entry;
    const pad = (entry: Entry): Entry => ({ ...entry, effects: [...entry.effects, { effect: "record", capability: "hold@1", kind: "padding", key: [], state: "padded", values: { text: "x".repeat(600_000) } }] });
    const act = pad(nativeAct), start = pad(chain(sample, act, 1)[1]!);
    install(state, start); const body = { fact: factRefOf(act), bytes: canonicalize(act) };
    let asked = 0, sourceBodies = 0;
    // Labelled source stand-in implements the separately native-tested
    // sender contract: admit bytes before handing a body to the consumer.
    const result = await new GenesisProofs(new ProofBytes(sqlOf(state)), { async read(_fact, max) {
      asked = max;
      if (utf8(body.bytes).length > max) return null;
      sourceBodies++; return body;
    } }, new Timer()).root();
    return { result, asked, expected: B.bytes - utf8(canonicalize(start)).length, sourceBodies };
  });
  expect(got.result).toEqual({ kind: "unknown" });
  expect(got.asked).toBe(got.expected); expect(got.asked).toBeLessThan(500_000); expect(got.sourceBodies).toBe(0);
});

test("absolute proof deadline includes the initial bounded scope metadata read", async () => {
  const scope = await create();
  const got = await scope.inside(async state => {
    const actual = sqlOf(state), clock = new Timer(); let initial = true, bodies = 0;
    const bytes = new ProofBytes({ exec(query, ...args) {
      if (query.includes("FROM meta WHERE k='scope'") && initial) { initial = false; clock.advance(B.milliseconds); }
      if (query.startsWith("SELECT bytes FROM entry")) bodies++;
      return actual.exec(query, ...args);
    } });
    const result = await new GenesisProofs(bytes, null, clock).root();
    return { result, bodies };
  });
  expect(got.result).toEqual({ kind: "unknown" }); expect(got.bodies).toBe(0);
});

test("final scope metadata cannot return or cache an overdue root with queued or inline timeout", async () => {
  for (const inline of [false, true]) {
    const scope = await create();
    const got = await scope.inside(async state => {
      const actual = sqlOf(state), clock = new Timer(); let scopes = 0, bodies = 0;
      const bytes = new ProofBytes({ exec(query, ...args) {
        if (query.includes("FROM meta WHERE k='scope'") && ++scopes === 3) {
          if (inline) clock.advance(B.milliseconds);
          else clock.value += B.milliseconds; // the event-loop timer is queued, never preempts synchronous SQL
        }
        if (query.startsWith("SELECT bytes FROM entry")) bodies++;
        return actual.exec(query, ...args);
      } });
      const proof = new GenesisProofs(bytes, null, clock), first = await proof.root();
      await microtasks(); const beforeRetry = bodies;
      const retry = await proof.root();
      return { first, beforeRetry, retry: retry.kind, bodies };
    });
    expect(got.first).toEqual({ kind: "unknown" }); expect(got.beforeRetry).toBe(1);
    expect(got.retry).toBe("root"); expect(got.bodies).toBe(2); // an overdue result never installed immutable content
  }
});

test("eligibility checks request freshness after final metadata on fresh and cached content", async () => {
  for (const cached of [false, true]) {
    const scope = await create();
    const got = await scope.inside(async state => {
      const actual = sqlOf(state), clock = new Timer(); let phase = false, reads = 0;
      const finalRead = cached ? 2 : 4;
      const bytes = new ProofBytes({ exec(query, ...args) {
        if (phase && query.includes("FROM meta WHERE k='scope'") && ++reads === finalRead) clock.value += 1000;
        return actual.exec(query, ...args);
      } });
      const proof = new GenesisProofs(bytes, null, clock);
      if (cached) { await proof.root(); await microtasks(); }
      phase = true; let checks = 0;
      const result = await proof.eligible(() => { checks++; return clock.now() < 500 ? { key: rita.key, since: Date.parse(at(0)) } : null; });
      return { result, checks, reads, finalRead };
    });
    expect(got.result).toEqual({ state: "unknown" }); expect(got.checks).toBe(2); expect(got.reads).toBe(got.finalRead);
  }
});

test("eligibility final metadata shares the initial operation deadline and stops further authentication work", async () => {
  const scope = await create();
  const got = await scope.inside(async state => {
    const actual = sqlOf(state), clock = new Timer(); let reads = 0;
    const bytes = new ProofBytes({ exec(query, ...args) {
      if (query.includes("FROM meta WHERE k='scope'") && ++reads === 4) clock.value += 5000;
      return actual.exec(query, ...args);
    } });
    let checks = 0;
    const result = await new GenesisProofs(bytes, null, clock).eligible(() => {
      if (++checks === 1) clock.value += 6000;
      return { key: rita.key, since: Date.parse(at(0)) };
    });
    return { result, checks, reads };
  });
  expect(got.result).toEqual({ state: "unknown" }); expect(got.checks).toBe(1); expect(got.reads).toBe(4);
});
