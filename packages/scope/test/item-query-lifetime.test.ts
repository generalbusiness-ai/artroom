/** Full query continuation on genuine native child histories. Peer gates,
 * clock/metadata faults and the support switch are labelled test inputs. */
import { expect, test } from "vitest";
import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { PROPOSED_BOUNDS } from "@generalbusiness/dap-contract";
import type { ItemQuery, ScopeId } from "@generalbusiness/dap-contract";
import { canonicalize, encodeItemQueryParameter, itemQueryArgument, newIncarnation, textDigest } from "@generalbusiness/artroom-bytes";
import { secretSigner, signedReader } from "@generalbusiness/artroom-client";
import { timeOf } from "@generalbusiness/dap-derive";
import { Scope } from "../src/core.ts";
import { ItemQueries } from "../src/item-queries.ts";
import { production } from "../src/ports.ts";
import { ReadPreparation } from "../src/read-preparation.ts";
import { SessionPreparation } from "../src/session-preparation.ts";
import { PreparationFlights } from "../src/preparation-flight.ts";
import { namespace, sessionReferencesIn } from "../src/namespace.ts";
import type { ProofSource } from "../src/proof-bytes.ts";
import { mintSession, readerOf, sessionsOf } from "../src/sessions.ts";
import { SqliteStore, type Sql, type SqlValue } from "../src/sqlite.ts";
import { net } from "./net.ts";
import { sessionRoom } from "./support/session-room.ts";
import { rita } from "./repository.ts";
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
class Timer {
  value = 0;
  readonly tasks = new Set<{ at: number; work(): void }>();
  finished = deferred<void>();
  now = () => this.value;
  after(ms: number, work: () => void) {
    const task = { at: this.value + ms, work }, finished = this.finished;
    this.tasks.add(task);
    return () => { this.tasks.delete(task); finished.resolve(); };
  }
  advance(ms: number) { this.value += ms; for (const task of [...this.tasks]) if (task.at <= this.value) { this.tasks.delete(task); task.work(); } }
}
function owner(name: ScopeId, state: DurableObjectState, f: Awaited<ReturnType<typeof sessionRoom>>, source: NonNullable<ConstructorParameters<typeof SessionPreparation>[3]>, timer = new Timer(), afterSql: (query: string) => void = () => {}, proofs: ProofSource | null = null) {
  const raw: Sql = { exec: (query, ...args) => state.storage.sql.exec(query, ...args), transaction: work => state.storage.transactionSync(work) };
  const store = new SqliteStore(raw), core = new Scope(name, store, production(), PROPOSED_BOUNDS);
  let calls = 0, policy = "query-native-policy-v1", supported = true, sessions = f.sessions;
  const statements: string[] = [];
  const sql = { exec(query: string, ...args: SqlValue[]) { calls++; statements.push(query); const cursor = raw.exec(query, ...args); afterSql(query); return cursor; } };
  const preparation = new ReadPreparation(sql, { policy: () => policy, declared: bytes => core.validate(bytes), platform: named => supported ? core.platform(named) : null });
  const sessionPreparation = new SessionPreparation(preparation, () => sessions, net.clock, source);
  const queries = new ItemQueries({ name, sql, preparation, sessionPreparation, localSigners: store.localSigners, proofs, sessions: () => sessions, clock: net.clock, window: PROPOSED_BOUNDS.intentLifetimeSeconds, flights: new PreparationFlights(timer) });
  return { queries, calls: () => calls, statements, policy: () => { policy = "query-native-policy-v2"; }, unsupported: () => { supported = false; }, secret: () => { sessions = sessionsOf("another synthetic bounded query secret", sessions.deployment)!; } };
}
const queryOf = (f: Awaited<ReturnType<typeof sessionRoom>>): ItemQuery => ({ v: 1, scope: f.rules, type: "rules", states: ["current"], ids: null, limit: 100, cursor: null });
const readerOfFixture = (f: Awaited<ReturnType<typeof sessionRoom>>) => readerOf(mintSession(f.sessions, { ...f.claims, reads: ["summary", "items"] }));

test("full native query retains timed-out pending ownership and releases no late page or cached membership", async () => {
  const f = await sessionRoom();
  try {
    const child = f.children[1]!;
    const got = await f.life.wait(() => runInDurableObject(child.object, async (_instance, state) => {
      const reached = deferred<void>(), release = deferred<void>(), timer = new Timer(), native = sessionReferencesIn(env.PLATFORM);
      let peers = 0;
      const query = owner(child.name, state, f, { async read(directory, request) { const raw = await native.read(directory, request); peers++; if (peers === 1) { reached.resolve(); await release.promise; } return raw; } }, timer);
      const encoded = encodeItemQueryParameter(queryOf(f))!, reader = readerOfFixture(f);
      const first = query.queries.read(encoded, reader); await reached.promise;
      timer.advance(10_000);
      const expired = await first, before = query.calls();
      const busy = await query.queries.read(encoded, reader), during = query.calls();
      release.resolve(); await timer.finished.promise;
      const after = query.calls();
      timer.finished = deferred<void>();
      const fresh = await query.queries.read(encoded, reader); await timer.finished.promise;
      return { expired, busy, before, during, after, fresh, peers, timers: timer.tasks.size };
    }));
    expect(got.expired).toEqual({ ok: false, reason: "unavailable" });
    expect(got.busy).toEqual({ ok: false, reason: "unavailable" });
    expect([got.during, got.after]).toEqual([got.before, got.before]);
    expect(got.fresh.ok).toBe(true); expect(got.peers).toBe(2); expect(got.timers).toBe(0);
  } finally { f.life.release(); }
});

test("native signed query hides a clock fault after causal bodies from an unrelated key", async () => {
  const f = await sessionRoom();
  try {
    const child = f.children[1]!, selection = queryOf(f), originalClock = net.clock.now;
    const unrelated = secretSigner(new Uint8Array(32).fill(5));
    const readers = await Promise.all([unrelated, secretSigner(rita.secret)].map(signer =>
      signedReader(signer, selection.scope.scope, "query-items", itemQueryArgument(selection)!, { now: () => Date.parse(originalClock) })));
    const observations = await f.life.wait(() => runInDurableObject(child.object, async (_instance, state) => {
      const results = [];
      try {
        for (const [index, reader] of readers.entries()) {
          net.clock.now = originalClock;
          let faults = 0, bodies = 0;
          const timer = new Timer(), query = owner(child.name, state, f, sessionReferencesIn(env.PLATFORM), timer, sql => {
            if (sql.startsWith("SELECT bytes FROM entry") || sql.startsWith("SELECT bytes FROM retained_input")) {
              // Capture reads the genesis once before signed admission.
              // The second history body belongs to the causal proof.
              if (++bodies > 1) { faults++; net.clock.now = "SCRIPTED invalid clock after causal body" as typeof net.clock.now; }
            }
          }, namespace(env.PLATFORM).proofs);
          const result = await query.queries.read(encodeItemQueryParameter(selection)!, reader); await timer.finished.promise;
          results.push({ index, result, faults });
        }
      } finally { net.clock.now = originalClock; }
      return results;
    }));
    expect(observations.map(observation => observation.result)).toEqual([
      { ok: false, reason: "forbidden" }, { ok: false, reason: "clock-behind" },
    ]);
    for (const observation of observations) expect(observation.faults).toBeGreaterThan(0);
  } finally { f.life.release(); }
});

test("native unresolved-birth session query hides target clock state until full membership affiliation", async () => {
  const f = await sessionRoom();
  try {
    const child = f.children[1]!;
    const observations = await f.life.wait(() => runInDurableObject(child.object, async (_instance, state) => {
      const store = new SqliteStore({ exec: (query, ...args) => state.storage.sql.exec(query, ...args), transaction: work => state.storage.transactionSync(work) });
      const current = net.clock.now, scope = store.scope()!, subject = "query-clock-private-fixture";
      expect(store.incarnations(f.membership.scope)).toEqual([]);
      const results = [];
      try {
        for (const mode of ["unresolved-wrong", "unresolved-match", "unresolved-valid", "known-wrong", "known-match"] as const) {
          // The histories and birth reference are genuine. This observed
          // incarnation and the clock faults are explicit storage inputs.
          if (mode.startsWith("known")) store.putObserved({ of: f.membership, subject, seq: 0 });
          net.clock.now = mode === "unresolved-valid" ? current : timeOf(Date.parse(scope.time) - 1);
          const membership = mode.endsWith("wrong") ? { ...f.membership, inc: newIncarnation(new Uint8Array(16).fill(9)) } : f.membership;
          const reader = readerOf(mintSession(f.sessions, { ...f.claims, membership, reads: ["summary", "items"] }));
          let peers = 0;
          const native = sessionReferencesIn(env.PLATFORM), timer = new Timer();
          const query = owner(child.name, state, f, { async read(directory, request) { peers++; return native.read(directory, request); } }, timer);
          const result = await query.queries.read(encodeItemQueryParameter(queryOf(f))!, reader); await timer.finished.promise;
          results.push({ mode, result, peers });
        }
      } finally {
        net.clock.now = current;
        state.storage.sql.exec("DELETE FROM folded WHERE kind='observed' AND key=?", canonicalize([f.membership.scope, f.membership.inc, subject]));
      }
      return results;
    }));
    expect(observations.map(observation => observation.result.ok ? "ok" : observation.result.reason)).toEqual([
      "forbidden", "forbidden", "ok", "forbidden", "clock-behind",
    ]);
    expect(observations.map(observation => observation.peers)).toEqual([0, 0, 1, 0, 0]);
  } finally { f.life.release(); }
});

test("full native query checks unchanged head, incarnation and support after peer wait and fresh MAC and expiry after last body SQL", async () => {
  const f = await sessionRoom();
  try {
    const child = f.children[1]!;
    const observations = await f.life.wait(() => runInDurableObject(child.object, async (_instance, state) => {
      const saved = state.storage.sql.exec("SELECT v FROM meta WHERE k='scope'").toArray()[0]!["v"] as string, originalClock = net.clock.now;
      const observations = [];
      try {
        for (const fault of ["head", "incarnation", "policy", "support", "expiry", "secret"] as const) {
          state.storage.sql.exec("UPDATE meta SET v=? WHERE k='scope'", saved); net.clock.now = originalClock;
          const native = sessionReferencesIn(env.PLATFORM), timer = new Timer();
          let returned = false, bodiesAtPeer = 0;
          const query = owner(child.name, state, f, { async read(directory, request) {
            const raw = await native.read(directory, request);
            returned = true; bodiesAtPeer = query.statements.filter(sql => sql.startsWith("SELECT record FROM item")).length;
            if (fault === "policy") query.policy();
            if (fault === "support") query.unsupported();
            if (fault === "head" || fault === "incarnation") {
              const scope = JSON.parse(saved);
              if (fault === "head") scope.head = { seq: scope.head.seq + 1, hash: textDigest("SCRIPTED changed native head") };
              else scope.at.inc = newIncarnation(new Uint8Array(16).fill(9));
              state.storage.sql.exec("UPDATE meta SET v=? WHERE k='scope'", canonicalize(scope));
            }
            return raw;
          } }, timer, sql => {
            if (returned && sql.startsWith("SELECT record FROM item")) {
              if (fault === "expiry") net.clock.now = f.claims.ends;
              if (fault === "secret") query.secret();
            }
          });
          const result = await query.queries.read(encodeItemQueryParameter(queryOf(f))!, readerOfFixture(f)); await timer.finished.promise;
          observations.push({ fault, result, last: query.statements.at(-1), bodies: query.statements.filter(sql => sql.startsWith("SELECT record FROM item")).length - bodiesAtPeer });
        }
      } finally { state.storage.sql.exec("UPDATE meta SET v=? WHERE k='scope'", saved); net.clock.now = originalClock; }
      return observations;
    }));
    for (const observation of observations) {
      expect(observation.result, observation.fault).toEqual({ ok: false, reason: observation.fault === "expiry" || observation.fault === "secret" ? "forbidden" : "unavailable" });
      if (observation.fault === "expiry" || observation.fault === "secret") expect(observation.last).toMatch(/^SELECT record FROM item/);
      else expect(observation.bodies, observation.fault).toBe(0);
    }
  } finally { f.life.release(); }
});
