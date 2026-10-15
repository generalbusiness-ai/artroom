import { expect, test } from "vitest";
import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { PROPOSED_BOUNDS } from "@generalbusiness/dap-contract";
import type { ScopeId } from "@generalbusiness/dap-contract";
import { canonicalize, newIncarnation } from "@generalbusiness/artroom-bytes";
import { Scope } from "../src/core.ts";
import { sessionReferencesIn } from "../src/namespace.ts";
import { production } from "../src/ports.ts";
import { PreparationFlights, PREPARATION_MILLISECONDS as B } from "../src/preparation-flight.ts";
import type { ProofTimer } from "../src/genesis-proof.ts";
import { ReadPreparation } from "../src/read-preparation.ts";
import { SessionPreparation } from "../src/session-preparation.ts";
import { mintSession, readerOf, sessionsOf } from "../src/sessions.ts";
import { SqliteStore, type Sql } from "../src/sqlite.ts";
import { net, soon } from "./net.ts";
import { sessionRoom } from "./support/session-room.ts";
import type { PlatformScope } from "./worker.ts";

class Timer implements ProofTimer {
  value = 0;
  readonly tasks = new Set<{ at: number; work(): void }>();
  now = () => this.value;
  after(ms: number, work: () => void) { const task = { at: this.value + ms, work }; this.tasks.add(task); return () => { this.tasks.delete(task); }; }
  advance(ms: number) { this.value += ms; for (const task of [...this.tasks]) if (task.at <= this.value) { this.tasks.delete(task); task.work(); } }
}
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
const microtasks = async () => { for (let n = 0; n < 16; n++) await Promise.resolve(); };
function loader(name: ScopeId, state: DurableObjectState, observe: (query: string) => void = () => {}) {
  const sql: Sql = { exec: (query, ...args) => state.storage.sql.exec(query, ...args), transaction: work => state.storage.transactionSync(work) };
  const store = new SqliteStore(sql), core = new Scope(name, store, production(), PROPOSED_BOUNDS);
  // These generic readers must not be dependencies of the new helper.
  store.scope = store.stored = store.retained = store.page = () => { throw new Error("legacy reader forbidden"); };
  return new ReadPreparation({ exec(query, ...args) { observe(query); return sql.exec(query, ...args); } }, { policy: () => "native-read-support-v1", declared: raw => core.validate(raw), platform: named => core.platform(named) });
}

test("bounded caller authenticates MAC/deployment/read before storage and rejects unrelated or expired sessions before its peer", async () => {
  const f = await sessionRoom();
  try {
    const child = f.children[2]!;
    const got = await f.life.wait(() => runInDurableObject(child.object, async (_instance, state) => {
      let queries = 0, peers = 0;
      const preparation = new SessionPreparation(loader(child.name, state, () => { queries++; }), () => f.sessions, net.clock, { async read() { peers++; return null; } });
      const claims = { ...f.claims, reads: ["summary", "items"] as ("summary" | "items")[] }, valid = readerOf(mintSession(f.sessions, claims));
      const fake = sessionsOf("another synthetic bounded session secret", f.sessions.deployment)!;
      const readers = [valid + "!", readerOf(mintSession(fake, claims)), readerOf(mintSession(f.sessions, { ...claims, deployment: "elsewhere" })), readerOf(mintSession(f.sessions, { ...claims, reads: ["items"] })), "x".repeat(4105), readerOf(mintSession(f.sessions, { ...claims, membership: { ...claims.membership, scope: child.name } })), readerOf(mintSession(f.sessions, { ...claims, ends: net.clock.now }))];
      const results = [];
      for (const reader of readers) { queries = 0; peers = 0; results.push({ allowed: await preparation.eligible(reader, "live"), queries, peers }); }
      return results;
    }));
    expect(got.every(result => !result.allowed && result.peers === 0)).toBe(true);
    expect(got.slice(0, 5).every(result => result.queries === 0)).toBe(true);
  } finally { f.life.release(); }
});

/** Genuine native child histories; only the post-native reply mutations and
 * selected timing/failure boundaries below are scripted. No host is real. */
test("composed birth checks bind cohort, identity and membership while preserving rules/destination target asymmetry", async () => {
  const f = await sessionRoom();
  try {
    const got = [];
    for (const child of f.children.slice(1)) {
      got.push(await f.life.wait(() => runInDurableObject(child.object, async (_instance, state) => {
        const native = sessionReferencesIn(env.PLATFORM), results: { fault: string; allowed: boolean; peers: number }[] = [];
        const reader = readerOf(mintSession(f.sessions, { ...f.claims, reads: ["summary", "items"] }));
        for (const fault of ["correct", "directory", "membership", "cohort", "rules", "schema", "oversized", "malformed", "unavailable", "throw"] as const) {
          let peers = 0;
          const preparation = new SessionPreparation(loader(child.name, state), () => f.sessions, net.clock, { async read(directory, request) {
            peers++; expect(directory).toEqual(f.directory);
            if (fault === "throw") throw new Error("scripted unavailable peer");
            const raw = await native.read(directory, request);
            if (typeof raw !== "string") return expect.fail("native authorized reference unavailable");
            if (fault === "unavailable") return null;
            if (fault === "oversized") return "x".repeat(2049);
            if (fault === "malformed") return "{";
            const reply = JSON.parse(raw), wrong = newIncarnation(new Uint8Array(16).fill(9));
            if (fault === "directory") reply.directory.inc = wrong;
            if (fault === "membership") reply.membership.inc = wrong;
            if (fault === "cohort") reply.definition = "platform:directory@1";
            if (fault === "rules") reply.rules.inc = wrong;
            if (fault === "schema") reply.v = 2;
            return canonicalize(reply);
          } });
          results.push({ fault, allowed: await preparation.eligible(reader, "mixed"), peers });
        }
        return results;
      })));
    }
    expect(got[0]!.map(row => row.allowed)).toEqual([true, false, false, false, false, false, false, false, false, false]);
    expect(got[1]!.map(row => row.allowed)).toEqual([true, false, false, false, true, false, false, false, false, false]);
    expect(got.flat().every(row => row.peers === 1)).toBe(true);
  } finally { f.life.release(); }
});

test("composed pending admission survives timeout, rejects late authority without further SQL and retries only as a new operation", async () => {
  const f = await sessionRoom();
  try {
    const child = f.children[2]!;
    const got = await f.life.wait(() => runInDurableObject(child.object, async (_instance, state) => {
      const timer = new Timer(), flights = new PreparationFlights(timer), reached = deferred<void>(), late = deferred<unknown>(), native = sessionReferencesIn(env.PLATFORM);
      let peers = 0, queries = 0;
      const preparation = new SessionPreparation(loader(child.name, state, () => { queries++; }), () => f.sessions, net.clock, { async read(directory, request) {
        peers++; if (peers === 1) { const reply = await native.read(directory, request); reached.resolve(); await late.promise; return reply; }
        return native.read(directory, request);
      } }, flights);
      const reader = readerOf(mintSession(f.sessions, { ...f.claims, reads: ["summary", "items"] }));
      const first = preparation.eligible(reader, "mixed"); await reached.promise;
      timer.advance(B); expect(await first).toBe(false);
      const countAtTimeout = queries;
      const parked = await Promise.all(Array.from({ length: 16 }, () => preparation.eligible(reader, "mixed")));
      const pending = { peers, queries };
      late.resolve(null); await microtasks(); const afterLate = queries;
      const retry = await preparation.eligible(reader, "mixed"); await microtasks();
      return { parked, pending, countAtTimeout, afterLate, retry, peers, timers: timer.tasks.size };
    }));
    expect(got.parked).toEqual(Array(16).fill(false)); expect(got.pending.peers).toBe(1);
    expect(got.pending.queries).toBe(got.countAtTimeout); expect(got.afterLate).toBe(got.countAtTimeout);
    expect(got.retry).toBe(true); expect(got.peers).toBe(2); expect(got.timers).toBe(0);
  } finally { f.life.release(); }
});

test("a genuine native checkpoint while awaiting a directory and a final expired claim both end composed eligibility", async () => {
  const f = await sessionRoom();
  try {
    const child = f.children[2]!;
    const got = await f.life.wait(() => runInDurableObject(child.object, async (instance, state) => {
      const native = sessionReferencesIn(env.PLATFORM), answers = [];
      for (const fault of ["checkpoint", "expiry"] as const) {
        let checkpoint: unknown = null;
        const claims = { ...f.claims, reads: ["summary", "items"] as ("summary" | "items")[], ends: soon(60) };
        const preparation = new SessionPreparation(loader(child.name, state), () => f.sessions, net.clock, { async read(directory, request) {
          const reply = await native.read(directory, request);
          // Explicit competing native work by the fixture, not a dependency
          // or cost claim of the bounded session path itself.
          if (fault === "checkpoint") checkpoint = await (instance as PlatformScope).checkpoint();
          else net.clock.now = claims.ends;
          return reply;
        } });
        answers.push({ fault, allowed: await preparation.eligible(readerOf(mintSession(f.sessions, claims)), "mixed"), checkpoint });
      }
      return answers;
    }));
    expect(got).toEqual([{ fault: "checkpoint", allowed: false, checkpoint: expect.objectContaining({ answer: "written" }) }, { fault: "expiry", allowed: false, checkpoint: null }]);
  } finally { f.life.release(); }
});

test("malformed or oversized native preparation rows and ambiguous observed incarnations cause no peer or unadmitted body read", async () => {
  const f = await sessionRoom();
  try {
    const child = f.children[2]!;
    const got = await f.life.wait(() => runInDurableObject(child.object, async (_instance, state) => {
      const sql: Sql = { exec: (query, ...args) => state.storage.sql.exec(query, ...args), transaction: work => state.storage.transactionSync(work) };
      const store = new SqliteStore(sql), scope = store.scope()!, genesis = store.stored(0)!, branch = store.page("branch", ["empty", "ready"], null, 1).items[0]!;
      const reader = readerOf(mintSession(f.sessions, { ...f.claims, reads: ["summary", "items"] })), results = [];
      const other = { ...f.membership, inc: newIncarnation(new Uint8Array(16).fill(9)) }, subject = "g2pb-ambiguous-fixture";
      for (const fault of ["scope", "scope-malformed", "genesis", "branch", "branch-malformed", "ambiguous"] as const) {
        // Explicit storage faults over a genuine creation, not judged rows.
        if (fault.startsWith("scope")) sql.exec("UPDATE meta SET v=? WHERE k='scope'", fault === "scope" ? "x".repeat(4097) : "{");
        if (fault === "genesis") sql.exec("UPDATE entry SET bytes=? WHERE seq=0", "x".repeat(1024 * 1024 + 1));
        if (fault.startsWith("branch")) sql.exec("UPDATE item SET record=? WHERE id=?", fault === "branch" ? "x".repeat(256 * 1024 + 1) : "{", branch.id);
        if (fault === "ambiguous") { store.putObserved({ of: f.membership, subject, seq: 0 }); store.putObserved({ of: other, subject, seq: 0 }); }
        let peers = 0, geneses = 0, bodies = 0;
        try {
          const preparation = new SessionPreparation(loader(child.name, state, query => { if (query.startsWith("SELECT bytes FROM entry")) geneses++; if (query.startsWith("SELECT record FROM item")) bodies++; }), () => f.sessions, net.clock, { async read() { peers++; return null; } });
          results.push({ fault, allowed: await preparation.eligible(reader, "mixed"), peers, geneses, bodies });
        } finally {
          sql.exec("UPDATE meta SET v=? WHERE k='scope'", canonicalize(scope));
          sql.exec("UPDATE entry SET bytes=? WHERE seq=0", genesis.bytes);
          sql.exec("UPDATE item SET record=? WHERE id=?", canonicalize(branch), branch.id);
          sql.exec("DELETE FROM folded WHERE kind='observed' AND key IN (?,?)", canonicalize([f.membership.scope, f.membership.inc, subject]), canonicalize([other.scope, other.inc, subject]));
        }
      }
      return results;
    }));
    expect(got.every(result => result.allowed === false && result.peers === 0)).toBe(true);
    expect(got.filter(result => result.fault.startsWith("scope") || result.fault === "genesis").every(result => result.geneses === 0)).toBe(true);
    expect(got.find(result => result.fault === "branch")!.bodies).toBe(0);
    expect(got.find(result => result.fault === "branch-malformed")!.bodies).toBe(1);
  } finally { f.life.release(); }
});
