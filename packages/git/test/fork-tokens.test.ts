// The lane forks' read-token ledger (request 02836f9a): protocol section 32
// (R-MINT-2 to R-MINT-7) applied by analogy to the read token pinning mints
// on a lane fork, owned by the fork's workspaces, not by the canonical mint
// ledger. Each test is named in plans/README.md ("Mint lane F"), with the
// mutation that turns it red. The fork double's createToken can apply and
// then throw, lose its answer, hold its answer, answer late, or refuse
// unchanged; its revocations can fail or be held.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ForkTokens, type ForkRepo } from "../src/workspace/fork-tokens.ts";
import { Workspaces, forkName } from "../src/workspace/workspaces.ts";
import { MINT_CLOCK_ALLOWANCE_MS, MINT_REVOKE_BACKOFF, MINT_REVOKE_BATCH, OBSERVE_WAIT, OVERDUE_STEP_MS, TAKEOVER_AHEAD_MS } from "../src/mints.ts";
import type { ArtifactsNamespace, MintedToken, RepoHandle, TokenInfo } from "../src/artifacts.ts";
import type { Sql, SqlRow } from "../src/sql.ts";
import { Clock, deferred, echoNote, echoing, everyRow, noEcho, nodeSql } from "./support.ts";

class ArtifactsError extends Error {
  readonly code: string;
  readonly numericCode: number;
  constructor(code: string, numericCode: number) {
    super(`${code} (${numericCode})`);
    this.code = code;
    this.numericCode = numericCode;
  }
}

const internal = () => new ArtifactsError("INTERNAL_ERROR", 10400);
const refused = () => new ArtifactsError("INVALID_TTL", 10003);
const reset = () => new Error("the connection was reset");

interface Tok {
  id: string;
  plaintext: string;
  scope: "read" | "write";
  state: TokenInfo["state"];
  expiresAt: number;
}

const full = (t: Tok): unknown => ({ id: t.id, plaintext: t.plaintext, scope: t.scope, expiresAt: new Date(t.expiresAt).toISOString() });

type Plan = "ok" | "apply-throw" | "lose" | "drop" | "refuse" | "hold" | ((t: Tok) => unknown);

/** A create whose answer the test gives later: apply now or late, answer, refuse or lose it. */
class Held {
  readonly gate = deferred<unknown>();
  tok: Tok | null = null;
  readonly fork: Fork;
  readonly ttl: number;
  constructor(fork: Fork, ttl: number) {
    this.fork = fork;
    this.ttl = ttl;
  }
  apply(): Tok {
    return (this.tok ??= this.fork.apply("read", this.ttl));
  }
  answer(shape: (t: Tok) => unknown = full): void {
    this.gate.resolve(shape(this.apply()));
  }
  refuse(): void {
    this.gate.reject(refused());
  }
  lose(): void {
    this.apply();
    this.gate.reject(reset());
  }
}

/** One lane fork in Artifacts, with the binding's token calls. */
class Fork implements ForkRepo {
  readonly tokens: Tok[] = [];
  plans: Plan[] = [];
  readonly creates: { scope: string; ttl: number; at: number }[] = [];
  onCreate: (() => void) | null = null;
  readonly held: Held[] = [];
  readonly revokes: string[] = [];
  revokeError: ((id: string) => Error) | null = null;
  holdRevokes = false;
  readonly heldRevokes: { id: string; gate: ReturnType<typeof deferred<void>> }[] = [];
  lists = 0;
  listing: ((tokens: TokenInfo[]) => unknown) | null = null;
  readonly name: string;
  readonly clock: Clock;
  readonly counter: { n: number };
  constructor(name: string, clock: Clock, counter: { n: number }) {
    this.name = name;
    this.clock = clock;
    this.counter = counter;
  }
  apply(scope: "read" | "write", ttl: number): Tok {
    const id = `tok_${++this.counter.n}`;
    const t: Tok = { id, plaintext: `art_v1_${id}${"x".repeat(24)}?expires=${ttl}`, scope, state: "active", expiresAt: this.clock.t + ttl * 1000 };
    this.tokens.push(t);
    return t;
  }
  async createToken(scope: "write" | "read" = "write", ttl = 86400): Promise<MintedToken> {
    this.creates.push({ scope, ttl, at: this.clock.t });
    this.onCreate?.();
    const plan = this.plans.shift() ?? "ok";
    if (plan === "hold") {
      const h = new Held(this, ttl);
      this.held.push(h);
      return h.gate.promise as Promise<MintedToken>;
    }
    if (plan === "refuse") throw refused();
    if (plan === "drop") throw reset();
    const t = this.apply(scope, ttl);
    if (plan === "apply-throw") throw internal();
    if (plan === "lose") throw reset();
    return (plan === "ok" ? full(t) : plan(t)) as MintedToken;
  }
  async revokeToken(id: string): Promise<boolean> {
    this.revokes.push(id);
    if (this.revokeError) throw this.revokeError(id);
    if (this.holdRevokes) {
      const gate = deferred<void>();
      this.heldRevokes.push({ id, gate });
      await gate.promise;
    }
    const t = this.tokens.find((x) => x.id === id || x.plaintext === id);
    if (!t || t.state !== "active") return false;
    t.state = "revoked";
    return true;
  }
  async listTokens() {
    this.lists++;
    const tokens: TokenInfo[] = this.tokens.map((t) => ({
      id: t.id,
      scope: t.scope,
      state: t.state === "active" && t.expiresAt <= this.clock.t ? "expired" : t.state,
      expiresAt: new Date(t.expiresAt).toISOString(),
    }));
    if (this.listing) return this.listing(tokens) as never;
    return { tokens, total: tokens.length };
  }
  live(id: string): boolean {
    const t = this.tokens.find((x) => x.id === id);
    return !!t && t.state === "active" && t.expiresAt > this.clock.t;
  }
}

/** A Room around one fork token ledger: its SQLite, clock, stored alarm, forks, and the fork owner's records (`known`). */
function room(o: { waitMs?: number; sql?: Sql } = {}) {
  const clock = new Clock();
  const sql = o.sql ?? nodeSql();
  const counter = { n: 0 };
  const forks = new Map<string, Fork>();
  const fork = (name: string) => {
    let f = forks.get(name);
    if (!f) forks.set(name, (f = new Fork(name, clock, counter)));
    return f;
  };
  const r = {
    clock,
    sql,
    fork,
    forks,
    /** Forks whose name another repository holds: the lookup refuses, as the owner's provenance check does. */
    foreign: new Set<string>(),
    /** Token IDs the fork's owner holds (lease tokens, its own owed revocations), by fork. */
    known: new Set<string>(),
    alarm: null as number | null,
    wakes: [] as number[],
    wakeFails: false,
    lookups: [] as string[],
    lookupHangs: false,
    /** Runs at each lookup: room time passing while the fork is looked up, say. */
    onLookup: null as (() => void) | null,
    ledger: null as unknown as ForkTokens,
    start(): ForkTokens {
      r.ledger = new ForkTokens({
        sql,
        fork: async (name) => {
          r.lookups.push(name);
          r.onLookup?.();
          if (r.lookupHangs) return new Promise<ForkRepo>(() => {});
          if (r.foreign.has(name)) throw new Error("not this room's fork");
          return fork(name);
        },
        now: clock.now,
        wake: async (at) => {
          if (r.wakeFails) throw new Error("storage refused the alarm");
          r.wakes.push(at);
          r.alarm = r.alarm === null ? at : Math.min(r.alarm, at);
        },
        known: (f, id) => r.known.has(`${f}/${id}`),
        waitMs: o.waitMs ?? 2_000,
        sleep: async () => {},
      });
      return r.ledger;
    },
  };
  r.start();
  return r;
}

const TTL = 600;
const rows = (sql: Sql): SqlRow[] => sql.all("SELECT * FROM artroom_fork_mint ORDER BY id");
function only(sql: Sql): SqlRow {
  const all = rows(sql);
  assert.equal(all.length, 1, `one record, not ${all.length}`);
  return all[0]!;
}
const summary = (sql: Sql): SqlRow => sql.all("SELECT * FROM artroom_fork_mint_summary WHERE k = 1")[0]!;

async function until(f: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 2_000; i++) {
    if (f()) return;
    await new Promise((r) => setImmediate(r));
  }
  throw new Error(`timed out waiting for ${what}`);
}

async function alarm(r: ReturnType<typeof room>): Promise<void> {
  await r.ledger.reconcile();
  await r.ledger.idle();
}

/** Count the rows each statement writes, through SQLite's `changes()`, in all and by table. */
function counting(sql: Sql) {
  const seen = { writes: 0, statements: [] as string[], tables: {} as Record<string, number> };
  const real = sql.all.bind(sql);
  (sql as { all: Sql["all"] }).all = (q, ...b) => {
    const out = real(q, ...b);
    const changed = Number((real("SELECT changes() AS n")[0] ?? {})["n"] ?? 0);
    if (/^\s*(INSERT|UPDATE|DELETE)/i.test(q) && changed > 0) {
      seen.writes += changed;
      seen.statements.push(q.slice(0, 60));
      const table = /^\s*(?:INSERT INTO|UPDATE|DELETE FROM)\s+(\w+)/i.exec(q)?.[1] ?? "?";
      seen.tables[table] = (seen.tables[table] ?? 0) + changed;
    }
    return out;
  };
  return { seen, restore: () => void ((sql as { all: Sql["all"] }).all = real) };
}

// ------------------------------------------------------------------ record and wake-up before the send

test("F1 the record (fork, purpose, lifetime) and a wake-up no later than the takeover time are both stored when createToken is called", async () => {
  const r = room();
  const t0 = r.clock.t;
  let seen: { record: SqlRow; alarm: number | null; takeover: unknown } | null = null;
  r.fork("f-a").onCreate = () => {
    seen = { record: only(r.sql), alarm: r.alarm, takeover: summary(r.sql)["takeover"] };
  };
  const t = await r.ledger.mint("f-a", "pin-objects:h1", TTL);
  const s = seen as unknown as { record: SqlRow; alarm: number | null; takeover: unknown };
  assert.ok(s, "createToken was called");
  assert.equal(s.record["state"], "sent");
  assert.equal(s.record["fork"], "f-a");
  assert.equal(s.record["purpose"], "pin-objects:h1");
  assert.equal(s.record["ttl"], TTL);
  assert.equal(s.takeover, t0 + TAKEOVER_AHEAD_MS);
  assert.ok(s.alarm !== null && s.alarm <= t0 + TAKEOVER_AHEAD_MS);
  assert.deepEqual(r.fork("f-a").creates.map((c) => [c.scope, c.ttl]), [["read", TTL]], "one read token, 600 s, on the fork");
  assert.equal(only(r.sql)["state"], "held");
  assert.equal(only(r.sql)["token"], t.id);
  await t.release();
  assert.equal(rows(r.sql).length, 0, "the answered revocation ends the record");
  assert.deepEqual(r.fork("f-a").revokes, [t.id], "revoked by its ID");
});

test("F2 a failed wake-up sends nothing and leaves no record; a failed record write sends nothing", async () => {
  const r = room();
  r.wakeFails = true;
  await assert.rejects(r.ledger.mint("f-a", "pin-objects:h1", TTL), /storage refused the alarm/);
  assert.equal(r.fork("f-a").creates.length, 0);
  assert.equal(rows(r.sql).length, 0);
  r.wakeFails = false;
  r.sql.all("CREATE TRIGGER no_record BEFORE INSERT ON artroom_fork_mint BEGIN SELECT RAISE(ABORT, 'storage failure'); END");
  await assert.rejects(r.ledger.mint("f-a", "pin-objects:h1", TTL), /storage failure/);
  assert.equal(r.fork("f-a").creates.length, 0);
  assert.equal(rows(r.sql).length, 0);
});

test("F3 a fork that cannot be looked up (absent, not ours, or no answer in time) gets no request and no record", async () => {
  const r = room({ waitMs: 10 });
  r.foreign.add("f-x");
  await assert.rejects(r.ledger.mint("f-x", "pin-objects:h1", TTL), /not this room's fork/);
  r.lookupHangs = true;
  await assert.rejects(r.ledger.mint("f-a", "pin-objects:h1", TTL), /not reached within 10 ms; nothing was sent/);
  assert.equal(r.fork("f-x").creates.length + r.fork("f-a").creates.length, 0);
  assert.equal(rows(r.sql).length, 0);
});

// ------------------------------------------------------------------ lost answer, hidden retry, refusal

test("F4 lost answer: the create applies and its answer is lost; one unknown record, no retry, and it is kept through lifetimes, inventories (complete and incomplete) and a restart; the applied token is never revoked", async () => {
  const r = room();
  const f = r.fork("f-a");
  f.plans = ["lose"];
  await assert.rejects(r.ledger.mint("f-a", "pin-objects:h1", TTL), /connection was reset/);
  assert.equal(f.creates.length, 1, "a transport failure is not retried: the create may have applied");
  const applied = f.tokens[0]!;
  assert.equal(only(r.sql)["state"], "unknown");
  assert.equal(summary(r.sql)["unknown"], 1);
  for (let i = 0; i < 6; i++) {
    r.clock.advance(TTL * 1000 * 3);
    if (i === 2) f.listing = (tokens) => ({ tokens: tokens.slice(1), total: tokens.length }); // incomplete
    if (i === 3) f.listing = null;
    if (i === 4) r.start(); // a restart
    await alarm(r);
    assert.equal(only(r.sql)["state"], "unknown", `still unknown after pass ${i}`);
  }
  assert.ok(f.lists >= 4, "the fork was observed");
  assert.deepEqual(f.revokes, [], "nothing on the fork is ever asked to be revoked");
  assert.equal(applied.state, "active");
});

test("F5 the hidden retry is gone: an applied create that fails with INTERNAL_ERROR stays an unknown record, and the retry is a new request under a new record; the retry's token is the one used and released", async () => {
  const r = room();
  const f = r.fork("f-a");
  f.plans = ["apply-throw"];
  let seenByRetry: SqlRow[] = [];
  const t = await r.ledger.mint("f-a", "pin-objects:h1", TTL);
  assert.equal(f.creates.length, 2);
  f.onCreate = null;
  seenByRetry = rows(r.sql);
  assert.deepEqual(
    seenByRetry.map((x) => x["state"]),
    ["unknown", "held"],
  );
  assert.notEqual(seenByRetry[0]!["id"], seenByRetry[1]!["id"]);
  assert.equal(t.id, f.tokens[1]!.id, "the retry's token");
  await t.release();
  assert.deepEqual(
    rows(r.sql).map((x) => x["state"]),
    ["unknown"],
    "the first create's outcome stays unknown; only the retry's token was revoked",
  );
  assert.deepEqual(f.revokes, [f.tokens[1]!.id]);
});

test("F5 the retry is sent only after the earlier record holds its outcome", async () => {
  const r = room();
  const f = r.fork("f-a");
  f.plans = ["apply-throw"];
  const states: unknown[][] = [];
  f.onCreate = () => states.push(rows(r.sql).map((x) => x["state"]));
  const t = await r.ledger.mint("f-a", "pin-objects:h1", TTL);
  assert.deepEqual(states, [["sent"], ["unknown", "sent"]]);
  await t.release();
});

test("F6 a refusal that changed nothing deletes the record, with no retry", async () => {
  const r = room();
  const f = r.fork("f-a");
  f.plans = ["refuse"];
  await assert.rejects(r.ledger.mint("f-a", "pin-objects:h1", TTL), /INVALID_TTL/);
  assert.equal(f.creates.length, 1);
  assert.equal(rows(r.sql).length, 0);
  assert.equal(summary(r.sql)["unknown"], 0);
});

// ------------------------------------------------------------------ late apply

test("F7 late apply: the create answers after the caller gave up; no caller gets the text, the record goes unknown then owed by the late ID, and it is revoked by that ID", async () => {
  const r = room({ waitMs: 10 });
  const f = r.fork("f-a");
  f.plans = ["hold"];
  await assert.rejects(r.ledger.mint("f-a", "pin-objects:h1", TTL), /did not answer the fork token request within 10 ms/);
  assert.equal(only(r.sql)["state"], "unknown");
  f.held[0]!.answer();
  await r.ledger.idle();
  const rec = only(r.sql);
  assert.equal(rec["state"], "owed");
  assert.equal(rec["token"], f.tokens[0]!.id);
  assert.equal(rec["last_error"], "no caller is waiting");
  assert.equal(summary(r.sql)["unknown"], 0);
  assert.equal(summary(r.sql)["owed"], 1);
  await alarm(r);
  assert.deepEqual(f.revokes, [f.tokens[0]!.id]);
  assert.equal(rows(r.sql).length, 0);
});

test("F7 late apply with a late refusal: the record is deleted; with the late answer lost: it stays unknown, and the late-applied token is never revoked", async () => {
  const r = room({ waitMs: 10 });
  const f = r.fork("f-a");
  f.plans = ["hold", "hold"];
  await assert.rejects(r.ledger.mint("f-a", "pin-objects:a", TTL));
  await assert.rejects(r.ledger.mint("f-a", "pin-objects:b", TTL));
  f.held[0]!.refuse();
  f.held[1]!.lose();
  await r.ledger.idle();
  assert.deepEqual(
    rows(r.sql).map((x) => [x["purpose"], x["state"]]),
    [["pin-objects:b", "unknown"]],
  );
  r.clock.advance(3 * TTL * 1000);
  await alarm(r);
  assert.equal(only(r.sql)["state"], "unknown");
  assert.deepEqual(f.revokes, []);
});

test("F7 late apply after a restart: the create applies while no host waits for it; the fresh host takes it over as unknown and never revokes the late token", async () => {
  const r = room();
  const f = r.fork("f-a");
  f.plans = ["hold"];
  const lost = r.ledger.mint("f-a", "pin-objects:h1", TTL);
  await until(() => f.held.length === 1, "the create is out");
  // The host stops: its waiting code is gone (the held create never answers it). A fresh host on the same storage.
  r.start();
  assert.equal(only(r.sql)["state"], "unknown");
  assert.equal(only(r.sql)["last_error"], "taken over: the host stopped before an answer was recorded");
  f.held[0]!.apply(); // Artifacts applies it now, and its answer reaches nobody
  for (let i = 0; i < 3; i++) {
    r.clock.advance(OBSERVE_WAIT.firstMs * 2 ** i);
    await alarm(r);
  }
  assert.equal(only(r.sql)["state"], "unknown");
  assert.equal(r.ledger.watch("f-a")?.unaccounted, 1, "watched: the late token is seen, not attributed");
  assert.deepEqual(f.revokes, []);
  void lost.catch(() => undefined);
});

// ------------------------------------------------------------------ answers

test("F8 answers: an ID without text, another scope, an unreadable expiry, or a longer expiry is owed at once and never returned; no ID is unknown", async () => {
  const r = room();
  const f = r.fork("f-a");
  f.plans = [
    (t) => ({ id: t.id, scope: "read", expiresAt: new Date(t.expiresAt).toISOString() }),
    (t) => ({ ...(full(t) as object), scope: "write" }),
    (t) => ({ ...(full(t) as object), expiresAt: "soon" }),
    (t) => ({ ...(full(t) as object), expiresAt: new Date(t.expiresAt + 60_000).toISOString() }),
    (t) => ({ plaintext: t.plaintext, scope: "read", expiresAt: new Date(t.expiresAt).toISOString() }),
  ];
  for (let i = 0; i < 5; i++) await assert.rejects(r.ledger.mint("f-a", `pin-objects:${i}`, TTL));
  assert.deepEqual(
    rows(r.sql).map((x) => [x["state"], x["last_error"], x["expires_at"] === null]),
    [
      ["owed", "no token text", false],
      ["owed", "another scope", false],
      ["owed", "an unreadable expiry", true],
      ["owed", "an expiry later than the lifetime asked", false],
      ["unknown", "an answer without a token ID", true],
    ],
  );
  await alarm(r);
  assert.deepEqual(f.revokes, f.tokens.slice(0, 4).map((t) => t.id), "each owed token revoked by its ID; the unknown one never");
});

// ------------------------------------------------------------------ failed revoke

test("F9 failed revoke: the release's revocation fails; the record is owed by ID with safe metadata, retried with backoff by later alarms, and ended when one is answered", async () => {
  const r = room();
  const f = r.fork("f-a");
  const t = await r.ledger.mint("f-a", "pin-objects:h1", TTL);
  f.revokeError = () => echoing();
  await t.release();
  let rec = only(r.sql);
  assert.equal(rec["state"], "owed");
  assert.equal(rec["token"], t.id);
  assert.equal(rec["last_error"], echoNote("revocation failed"));
  assert.equal(rec["due"], r.clock.t + MINT_REVOKE_BACKOFF.firstMs);
  noEcho("the fork token ledger", everyRow(r.sql));
  const dues: number[] = [];
  for (let i = 0; i < 3; i++) {
    r.clock.t = Number(only(r.sql)["due"]);
    await alarm(r);
    dues.push(Number(only(r.sql)["due"]) - r.clock.t);
  }
  assert.deepEqual(dues, [2_000, 4_000, 8_000], "backoff doubles from 1 s");
  f.revokeError = null;
  r.clock.t = Number(only(r.sql)["due"]);
  await alarm(r);
  assert.equal(rows(r.sql).length, 0);
  assert.equal(f.revokes.length, 5);
  assert.ok(f.revokes.every((id) => id === t.id), "only ever its own ID");
  assert.equal(f.live(t.id), false);
  assert.equal(summary(r.sql)["owed"], 0);
});

test("F9 failed revoke: a late revocation answer is not taken as success; the record stays owed and the next pass revokes again", async () => {
  const r = room({ waitMs: 10 });
  const f = r.fork("f-a");
  const t = await r.ledger.mint("f-a", "pin-objects:h1", TTL);
  f.holdRevokes = true;
  await t.release();
  assert.equal(only(r.sql)["state"], "owed");
  assert.equal(only(r.sql)["last_error"], "revocation: no answer in time");
  f.heldRevokes[0]!.gate.resolve(); // the first revocation answers late
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(only(r.sql)["state"], "owed", "a late answer changes nothing");
  f.holdRevokes = false;
  r.clock.t = Number(only(r.sql)["due"]);
  await alarm(r);
  assert.equal(rows(r.sql).length, 0);
  assert.deepEqual(f.revokes, [t.id, t.id]);
});

test("F9 failed revoke: backoff is capped at 5 min; a readable expiry settles the record with no further call; with no readable expiry it stays owed through 18 h of failures", async () => {
  const r = room();
  const f = r.fork("f-a");
  f.plans = [(t) => ({ ...(full(t) as object), expiresAt: "never" })];
  await assert.rejects(r.ledger.mint("f-a", "pin-objects:unreadable", TTL));
  const t = await r.ledger.mint("f-a", "pin-objects:readable", TTL);
  f.revokeError = () => internal();
  await t.release();
  let waits = 0;
  const end = r.clock.t + 18 * 3600_000;
  while (r.clock.t < end) {
    const due = r.ledger.nextDue();
    assert.ok(due !== null);
    r.clock.t = Math.max(due, r.clock.t + 1);
    await alarm(r);
    waits = Math.max(waits, ...rows(r.sql).map((x) => Number(x["backoff"] ?? 0)));
  }
  assert.equal(waits, MINT_REVOKE_BACKOFF.maxMs);
  assert.deepEqual(
    rows(r.sql).map((x) => [x["purpose"], x["state"]]),
    [["pin-objects:unreadable", "owed"]],
    "the readable expiry settled its record; the unreadable one is never settled by time",
  );
  const calls = f.revokes.filter((id) => id === t.id).length;
  r.clock.advance(3600_000);
  await alarm(r);
  assert.equal(f.revokes.filter((id) => id === t.id).length, calls, "no call after settlement");
});

// ------------------------------------------------------------------ restart between any two steps

test("F10 restart between any two steps: before the wake-up, before the send, while the answer is out, while held, while owed, and during a revocation; nothing is lost and only recorded IDs are revoked", async () => {
  // 1. After the record, before the wake-up is stored: the host stops. The record is unknown: it cannot be told apart from one sent.
  {
    const r = room();
    const gate = deferred<void>();
    const ledger = new ForkTokens({ sql: r.sql, fork: async (n) => r.fork(n), now: r.clock.now, wake: () => gate.promise, known: () => false });
    void ledger.mint("f-a", "pin-objects:1", TTL).catch(() => undefined);
    await until(() => rows(r.sql).length === 1, "the record");
    r.start();
    assert.equal(only(r.sql)["state"], "unknown");
    assert.equal(r.fork("f-a").creates.length, 0);
  }
  // 2. After the wake-up, before the send, and 3. while the answer is out: unknown, and the late token is never revoked.
  {
    const r = room();
    r.fork("f-a").plans = ["hold"];
    void r.ledger.mint("f-a", "pin-objects:2", TTL).catch(() => undefined);
    await until(() => r.fork("f-a").held.length === 1, "the send");
    r.start();
    r.fork("f-a").held[0]!.apply();
    await alarm(r);
    assert.equal(only(r.sql)["state"], "unknown");
    assert.deepEqual(r.fork("f-a").revokes, []);
  }
  // 4. Held (answered, in use): owed at once, and revoked by its ID at the next alarm.
  {
    const r = room();
    const t = await r.ledger.mint("f-a", "pin-objects:4", TTL);
    r.start();
    assert.equal(only(r.sql)["state"], "owed");
    assert.equal(only(r.sql)["last_error"], "taken over: the host that held it stopped");
    assert.equal(r.ledger.nextDue(), r.clock.t + OVERDUE_STEP_MS, "a fresh host schedules the debt 1 s ahead");
    await alarm(r);
    assert.deepEqual(r.fork("f-a").revokes, [t.id]);
    assert.equal(rows(r.sql).length, 0);
  }
  // 5. Owed after a failed release: kept, with its due time, and revoked after the restart.
  {
    const r = room();
    const t = await r.ledger.mint("f-a", "pin-objects:5", TTL);
    r.fork("f-a").revokeError = () => internal();
    await t.release();
    const due = Number(only(r.sql)["due"]);
    r.start();
    assert.equal(only(r.sql)["due"], due);
    assert.equal(r.ledger.nextDue(), due);
    r.fork("f-a").revokeError = null;
    r.clock.t = due;
    await alarm(r);
    assert.equal(rows(r.sql).length, 0);
  }
  // 6. During a revocation (held): the fresh host revokes again by the same ID.
  {
    const r = room();
    const t = await r.ledger.mint("f-a", "pin-objects:6", TTL);
    r.fork("f-a").revokeError = () => internal();
    await t.release();
    r.fork("f-a").revokeError = null;
    r.fork("f-a").holdRevokes = true;
    r.clock.t = Number(only(r.sql)["due"]);
    void r.ledger.reconcile();
    await until(() => r.fork("f-a").heldRevokes.length === 1, "the revocation is out");
    r.fork("f-a").holdRevokes = false;
    r.start();
    assert.equal(only(r.sql)["state"], "owed");
    await alarm(r);
    assert.equal(rows(r.sql).length, 0);
    assert.deepEqual(r.fork("f-a").revokes, [t.id, t.id, t.id]);
  }
});

// ------------------------------------------------------------------ wake-ups and bounded work

test("F11 the takeover time is in nextDue while a token is held; a live alarm moves it ahead; it is cleared when nothing is in flight; overdue work is 1 s ahead, never sooner", async () => {
  const r = room();
  const t0 = r.clock.t;
  const t = await r.ledger.mint("f-a", "pin-objects:h1", TTL);
  assert.equal(r.ledger.nextDue(), t0 + TAKEOVER_AHEAD_MS);
  r.clock.advance(40_000);
  await alarm(r);
  assert.equal(summary(r.sql)["takeover"], r.clock.t + TAKEOVER_AHEAD_MS, "moved ahead on the live host");
  assert.equal(r.ledger.nextDue(), r.clock.t + TAKEOVER_AHEAD_MS);
  await t.release();
  await alarm(r);
  assert.equal(summary(r.sql)["takeover"], null);
  assert.equal(r.ledger.nextDue(), null);
  // Overdue: an owed record whose due time has passed.
  const u = await r.ledger.mint("f-a", "pin-objects:h2", TTL);
  r.fork("f-a").revokeError = () => internal();
  await u.release();
  r.clock.advance(10 * 60_000);
  assert.equal(r.ledger.nextDue(), r.clock.t + OVERDUE_STEP_MS);
});

test("F12 bounded passes: 45 owed revocations on two forks, all due; each pass takes the 20 due earliest, one pass at a time, never awaited by the alarm, and continues 1 s after", async () => {
  const r = room();
  const order: string[] = [];
  for (let i = 0; i < 45; i++) {
    const fk = i % 2 === 0 ? "f-a" : "f-b";
    const t = await r.ledger.mint(fk, `pin-objects:${i}`, TTL);
    r.fork(fk).revokeError = () => internal();
    await t.release();
    r.fork(fk).revokeError = null;
    order.push(t.id);
    r.clock.advance(10);
  }
  for (const f of ["f-a", "f-b"]) r.fork(f).revokes.length = 0;
  // Due in reverse row order: the earliest due goes first.
  r.sql.all("UPDATE artroom_fork_mint SET due = ? - id", r.clock.t);
  r.fork("f-a").holdRevokes = true;
  const calls = () => r.fork("f-a").revokes.length + r.fork("f-b").revokes.length;
  await r.ledger.reconcile(); // the alarm's work returns while a revocation is held: the pass is not awaited
  await until(() => r.fork("f-a").heldRevokes.length === 1, "a held revocation");
  assert.equal(r.ledger.nextDue(), r.clock.t + 2_000, "while a revocation is held, owed records are not eligible before its timeout");
  const before = calls();
  await r.ledger.reconcile(); // a second alarm starts no second pass
  assert.equal(calls(), before, "one pass at a time");
  r.fork("f-a").holdRevokes = false;
  r.fork("f-a").heldRevokes[0]!.gate.resolve();
  await r.ledger.idle();
  const firstPass = [...r.fork("f-a").revokes, ...r.fork("f-b").revokes];
  assert.equal(firstPass.length, MINT_REVOKE_BATCH);
  assert.deepEqual(new Set(firstPass), new Set(order.slice(25)), "the 20 due earliest (the newest rows here)");
  assert.equal(r.ledger.nextDue(), r.clock.t + OVERDUE_STEP_MS, "a backlog continues 1 s after the pass");
  r.clock.advance(OVERDUE_STEP_MS);
  await alarm(r);
  r.clock.advance(OVERDUE_STEP_MS);
  await alarm(r);
  assert.equal(rows(r.sql).length, 0);
  assert.equal(r.fork("f-a").revokes.length + r.fork("f-b").revokes.length, 45);
});

test("F13 watching: each alarm observes at most one fork, the one due earliest, with one write to its watch row; the next observation of a fork is never sooner than 1 min; a fork with no unknown records is not observed", async () => {
  const r = room();
  r.fork("f-a").plans = ["lose"];
  r.fork("f-b").plans = ["lose"];
  await assert.rejects(r.ledger.mint("f-a", "pin-objects:a", TTL));
  r.clock.advance(5);
  await assert.rejects(r.ledger.mint("f-b", "pin-objects:b", TTL));
  const c = counting(r.sql);
  await alarm(r);
  assert.equal(r.fork("f-a").lists + r.fork("f-b").lists, 1, "one fork per alarm");
  assert.equal(r.fork("f-a").lists, 1, "the earliest due first");
  assert.equal(c.seen.tables["artroom_fork_mint_watch"], 1, `one watch row written: ${c.seen.statements.join(" | ")}`);
  assert.equal(c.seen.tables["artroom_fork_mint"], undefined, "no record written");
  c.restore();
  assert.equal(r.ledger.watch("f-a")?.result, "1 live token(s) on the fork not accounted for");
  assert.equal(r.ledger.watch("f-a")?.nextAt, r.clock.t + OBSERVE_WAIT.firstMs);
  await alarm(r);
  assert.equal(r.fork("f-b").lists, 1);
  // A new unknown record on f-a does not bring its observation sooner than 1 min after the last.
  const last = r.ledger.watch("f-a")!.at!;
  r.fork("f-a").plans = ["lose"];
  await assert.rejects(r.ledger.mint("f-a", "pin-objects:c", TTL));
  assert.ok(r.ledger.watch("f-a")!.nextAt! >= last + OBSERVE_WAIT.firstMs);
  // A fork with no unknown records (a late answer settled the only one) is not observed.
  const s = room({ waitMs: 10 });
  s.fork("f-c").plans = ["hold"];
  await assert.rejects(s.ledger.mint("f-c", "pin-objects:d", TTL));
  s.fork("f-c").held[0]!.refuse();
  await s.ledger.idle();
  assert.equal(s.ledger.watch("f-c")?.nextAt, null);
  await alarm(s);
  assert.equal(s.fork("f-c").lists, 0);
  assert.equal(s.ledger.nextDue(), null);
});

test("F13 watching: tokens the owner knows are not counted; an incomplete or oversized listing counts nothing and settles nothing", async () => {
  const r = room();
  const f = r.fork("f-a");
  const lease = f.apply("write", 3600);
  r.known.add(`f-a/${lease.id}`);
  f.plans = ["lose"];
  await assert.rejects(r.ledger.mint("f-a", "pin-objects:a", TTL));
  await alarm(r);
  assert.equal(r.ledger.watch("f-a")?.unaccounted, 1, "the lost token only");
  f.listing = (tokens) => ({ tokens, total: tokens.length + 1 });
  r.clock.advance(OBSERVE_WAIT.firstMs * 2);
  await alarm(r);
  assert.equal(r.ledger.watch("f-a")?.unaccounted, null);
  assert.equal(r.ledger.watch("f-a")?.result, "no inventory: the listing is incomplete or malformed");
  assert.equal(only(r.sql)["state"], "unknown");
});

test("F14 duties: every record is reachable by paging, never with a token's text, and the counts are exact", async () => {
  const r = room();
  for (let i = 0; i < 7; i++) {
    r.fork("f-a").plans = [i % 2 ? "lose" : "ok"];
    const t = await r.ledger.mint("f-a", `pin-objects:${i}`, TTL).catch(() => null);
    if (t) {
      r.fork("f-a").revokeError = () => internal();
      await t.release();
      r.fork("f-a").revokeError = null;
    }
  }
  const seen: number[] = [];
  let after: number | undefined;
  for (;;) {
    const page = r.ledger.duties({ limit: 2, ...(after !== undefined ? { after } : {}) });
    seen.push(...page.records.map((x) => x.id));
    assert.equal(page.owed, 4);
    assert.equal(page.unknown, 3);
    if (page.next === null) break;
    after = page.next;
  }
  assert.equal(seen.length, 7);
  const text = JSON.stringify(r.ledger.duties({ limit: 100 }));
  for (const t of r.fork("f-a").tokens) assert.ok(!text.includes(t.plaintext));
});

// ------------------------------------------------------------------ the fork's owner: Workspaces

class Namespace implements ArtifactsNamespace {
  readonly repos = new Map<string, Fork & Pick<RepoHandle, "info">>();
  readonly counter = { n: 0 };
  readonly clock: Clock;
  constructor(clock: Clock) {
    this.clock = clock;
  }
  add(name: string, source: string | null): Fork {
    const f = Object.assign(new Fork(name, this.clock, this.counter), {
      info: async () => ({ name, remote: `https://artifacts.test/ns/${name}.git`, source }),
    });
    this.repos.set(name, f);
    return f;
  }
  async get(name: string): Promise<RepoHandle> {
    const r = this.repos.get(name);
    if (!r) throw new ArtifactsError("NOT_FOUND", 10404);
    return r as unknown as RepoHandle;
  }
  async create(): Promise<never> {
    throw new Error("not in these tests");
  }
  async delete(): Promise<boolean> {
    return false;
  }
}

function owner(sql: Sql = nodeSql(), clock = new Clock()) {
  const ns = new Namespace(clock);
  ns.add("canon", null);
  const wake = { at: null as number | null, fail: false };
  const make = () =>
    new Workspaces({
      sql,
      artifacts: ns,
      canonical: "canon",
      namespace: "ns",
      now: clock.now,
      sleep: async () => {},
      wake: async (at) => {
        if (wake.fail) throw new Error("no alarm");
        wake.at = wake.at === null ? at : Math.min(wake.at, at);
      },
    });
  return { sql, clock, ns, wake, ws: make(), make };
}

test("F15 the fork's owner: Workspaces builds the ledger, takes over at its start, and checks provenance: a repository at the fork's name that is not this room's fork is never sent a create, a revocation or a listing", async () => {
  const o = owner();
  const lane = "act_1_aaaaaaaa" as never;
  const name = forkName("canon", lane);
  const fork = o.ns.add(name, "artifacts:ns/canon");
  const t = await o.ws.forkTokens.mint(name, "pin-objects:h1", TTL);
  assert.equal(fork.creates.length, 1);
  // The fork's name moves to a foreign repository while the token is held; the host stops.
  const foreign = o.ns.add(name, "artifacts:ns/someone-else");
  const restarted = o.make();
  assert.equal(only(o.sql)["state"], "owed");
  await restarted.forkTokens.reconcile();
  await restarted.forkTokens.idle();
  assert.deepEqual(foreign.revokes, [], "nothing is sent to a repository that is not ours");
  assert.equal(only(o.sql)["state"], "owed");
  assert.match(String(only(o.sql)["last_error"]), /^repository lookup failed: /);
  // Absent: no create, no record.
  o.ns.repos.delete(name);
  await assert.rejects(restarted.forkTokens.mint(name, "pin-objects:h2", TTL), /does not exist/);
  // Our fork back: the owed token is revoked by its ID there.
  o.ns.repos.set(name, fork as never);
  o.clock.t = Number(only(o.sql)["due"]);
  await restarted.forkTokens.reconcile();
  await restarted.forkTokens.idle();
  assert.deepEqual(fork.revokes, [t.id]);
  assert.equal(rows(o.sql).length, 0);
});

test("F16 the fork's sweep (R-WS-3) keeps a read token the ledger holds for a pin in progress, and the pin's own release revokes it after", async () => {
  const o = owner();
  const lane = "act_2_bbbbbbbb" as never;
  const name = forkName("canon", lane);
  const fork = o.ns.add(name, "artifacts:ns/canon");
  assert.equal(o.ws.open(lane, 1 as never, o.clock.t + 3600_000).hasOwnProperty("refused"), false);
  await o.ws.forkTokens.withToken(name, "pin-objects:h1", TTL, async (t) => {
    // The lease ends while the pin runs: the workspace owes an inventory of the fork, and sweeps it now.
    await o.ws.revoke(lane, 1 as never);
    assert.equal(fork.live(t.id), true, "the sweep kept the held pin token");
    assert.ok(fork.lists >= 1, "the sweep listed the fork");
  });
  assert.equal(fork.live(fork.tokens.at(-1)!.id), false, "released after the pin");
  assert.equal(rows(o.sql).length, 0);
});

test("F17 the owner's known lookups and the ledger's due queries use indexes, and a store from before this change gains the owner's indexes at its next start", () => {
  const sql = nodeSql();
  // A stored room's workspace tables, as made before request 02836f9a: no token indexes.
  sql.all(
    "CREATE TABLE artroom_ws (lane TEXT PRIMARY KEY, lease INTEGER NOT NULL, state TEXT NOT NULL, fork TEXT NOT NULL, " +
      "remote TEXT, lease_expires_at INTEGER NOT NULL, token_id TEXT, token_expires_at INTEGER, error TEXT, updated_at INTEGER NOT NULL)",
  );
  sql.all(
    "CREATE TABLE artroom_ws_duty (id INTEGER PRIMARY KEY AUTOINCREMENT, fork TEXT NOT NULL, kind TEXT NOT NULL, " +
      "token_id TEXT, reason TEXT NOT NULL, state TEXT NOT NULL, started_at INTEGER NOT NULL, answered_at INTEGER, expires_at INTEGER, " +
      "attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL, last_error TEXT, done_at INTEGER, done_reason TEXT)",
  );
  sql.all("INSERT INTO artroom_ws_duty (fork, kind, token_id, reason, state, started_at, next_at) VALUES ('f', 'token', 'tid_1', 'released', 'owed', 0, 0)");
  owner(sql);
  const plan = (q: string) =>
    sql
      .all(`EXPLAIN QUERY PLAN ${q}`)
      .map((r) => String(r["detail"]))
      .join("; ");
  assert.match(plan("SELECT 1 AS x FROM artroom_ws WHERE token_id = 'x' AND fork = 'f' LIMIT 1"), /USING INDEX artroom_ws_token/);
  assert.match(plan("SELECT 1 AS x FROM artroom_ws_duty WHERE token_id = 'x' AND fork = 'f' AND state != 'done' LIMIT 1"), /USING INDEX artroom_ws_duty_token/);
  assert.match(plan("SELECT id FROM artroom_fork_mint WHERE token = 'x' LIMIT 1"), /USING (COVERING )?INDEX artroom_fork_mint_token/);
  assert.match(plan("SELECT id, fork, token, expires_at, backoff FROM artroom_fork_mint WHERE state = 'owed' AND due <= 5 ORDER BY due, id LIMIT 20"), /USING INDEX artroom_fork_mint_state/);
  assert.doesNotMatch(plan("SELECT id, fork, token, expires_at, backoff FROM artroom_fork_mint WHERE state = 'owed' AND due <= 5 ORDER BY due, id LIMIT 20"), /TEMP B-TREE/);
  assert.match(plan("SELECT fork, observe_wait FROM artroom_fork_mint_watch WHERE observe_due <= 5 ORDER BY observe_due, fork LIMIT 1"), /USING (COVERING )?INDEX artroom_fork_mint_watch_due/);
  assert.doesNotMatch(plan("SELECT fork, observe_wait FROM artroom_fork_mint_watch WHERE observe_due <= 5 ORDER BY observe_due, fork LIMIT 1"), /TEMP B-TREE/);
  // The sweep's questions, for each token (checker C1, C3): the lease's token, a held pin token, an open create.
  assert.match(plan("SELECT 1 AS x FROM artroom_ws WHERE token_id = 'x' AND fork = 'f' AND state IN ('ready', 'pending') LIMIT 1"), /USING INDEX artroom_ws_token/);
  assert.match(plan("SELECT 1 AS x FROM artroom_fork_mint WHERE token = 'x' AND state = 'held' AND fork = 'f' LIMIT 1"), /^SEARCH artroom_fork_mint USING (COVERING )?INDEX artroom_fork_mint_(token|open) /);
  assert.match(plan("SELECT 1 AS x FROM artroom_fork_mint WHERE fork = 'f' AND state IN ('sent', 'unknown') LIMIT 1"), /USING (COVERING )?INDEX artroom_fork_mint_open/);
  assert.match(plan("SELECT 1 AS x FROM artroom_fork_mint WHERE token = 'x' AND fork = 'f' LIMIT 1"), /^SEARCH artroom_fork_mint USING (COVERING )?INDEX artroom_fork_mint_(token|open) /);
  assert.match(plan("SELECT 1 AS x FROM artroom_ws_duty WHERE token_id = 'x' AND fork = 'f' AND state != 'done' LIMIT 1"), /USING INDEX artroom_ws_duty_token/);
  assert.equal(sql.all("SELECT COUNT(*) AS n FROM artroom_ws_duty")[0]!["n"], 1, "the stored rows are kept");
});

test("F18 the owner without a wake-up store sends no fork token", async () => {
  const sql = nodeSql();
  const ns = new Namespace(new Clock());
  ns.add("canon", null);
  const fork = ns.add(forkName("canon", "act_3_cccccccc" as never), "artifacts:ns/canon");
  const ws = new Workspaces({ sql, artifacts: ns, canonical: "canon", namespace: "ns", sleep: async () => {} });
  await assert.rejects(ws.forkTokens.mint(fork.name, "pin-objects:h1", TTL), /no wake-up can be stored/);
  assert.equal(fork.creates.length, 0);
  assert.equal(rows(sql).length, 0);
});

test("F19 an idle ledger writes nothing: reconcile and nextDue with no records, and with an unknown record whose observation is not yet due", async () => {
  const r = room();
  const sql = r.sql;
  let c = counting(sql);
  await alarm(r);
  r.ledger.nextDue();
  assert.equal(c.seen.writes, 0);
  c.restore();
  r.fork("f-a").plans = ["lose"];
  await assert.rejects(r.ledger.mint("f-a", "pin-objects:a", TTL));
  await alarm(r); // the first observation
  r.clock.advance(30_000);
  c = counting(sql);
  await alarm(r);
  await alarm(r);
  r.ledger.nextDue();
  assert.equal(c.seen.writes, 0, c.seen.statements.join(" | "));
  c.restore();
});

test("F20 the owner's known tokens: the observation does not count the fork's lease token or a token revocation the workspace owes there; it counts the lost read token", async () => {
  const o = owner();
  const lane = "act_4_dddddddd" as never;
  const name = forkName("canon", lane);
  const fork = o.ns.add(name, "artifacts:ns/canon");
  const lease = fork.apply("write", 3600);
  const owed = fork.apply("write", 3600);
  o.ws.open(lane, 1 as never, o.clock.t + 3600_000);
  o.sql.all("UPDATE artroom_ws SET token_id = ? WHERE lane = ?", lease.id, lane);
  o.sql.all("INSERT INTO artroom_ws_duty (fork, kind, token_id, reason, state, started_at, next_at) VALUES (?, 'token', ?, 'released', 'owed', 0, ?)", name, owed.id, o.clock.t + 3600_000);
  fork.plans = ["lose"];
  await assert.rejects(o.ws.forkTokens.mint(name, "pin-objects:h1", TTL));
  await o.ws.forkTokens.reconcile();
  assert.equal(o.ws.forkTokens.watch(name)?.unaccounted, 1);
  assert.deepEqual(fork.revokes, []);
});

test("F21 a failed handoff: the answer cannot be recorded as held; the record is written again as owed by the token's ID, the token is revoked at once, and the record ends only when that revocation is answered; a failed revocation leaves it owed with the ID, revoked by a later alarm (checker C2)", async () => {
  const r = room();
  r.sql.all("CREATE TRIGGER no_held BEFORE UPDATE ON artroom_fork_mint WHEN NEW.state = 'held' BEGIN SELECT RAISE(ABORT, 'storage failure'); END");
  await assert.rejects(r.ledger.mint("f-a", "pin-objects:h1", TTL), /storage failure/);
  assert.deepEqual(r.fork("f-a").revokes, [r.fork("f-a").tokens[0]!.id], "revoked by its ID at once");
  assert.equal(rows(r.sql).length, 0, "the answered revocation ended the record");
  // The revocation fails: the record keeps the ID, owed, through a restart, and a later alarm revokes it.
  r.fork("f-a").revokeError = () => internal();
  await assert.rejects(r.ledger.mint("f-a", "pin-objects:h2", TTL), /storage failure/);
  const id = r.fork("f-a").tokens[1]!.id;
  assert.equal(only(r.sql)["state"], "owed");
  assert.equal(only(r.sql)["token"], id, "the known ID is kept");
  assert.equal(summary(r.sql)["unknown"], 0);
  r.sql.all("DROP TRIGGER no_held");
  r.fork("f-a").revokeError = null;
  r.start();
  assert.equal(only(r.sql)["state"], "owed");
  r.clock.advance(MINT_REVOKE_BACKOFF.firstMs);
  await alarm(r);
  assert.equal(r.fork("f-a").live(id), false);
  assert.equal(rows(r.sql).length, 0);
});

test("F23 a failed handoff when the first owed write fails too: the write is retried, with the ID in hand, before the revocation at once", async () => {
  const r = room();
  const real = r.sql.all.bind(r.sql);
  const failing = new Set(["held", "owed"]);
  (r.sql as { all: Sql["all"] }).all = (q, ...b) => {
    for (const state of failing)
      if (q.startsWith(`UPDATE artroom_fork_mint SET state = '${state}'`)) {
        failing.delete(state);
        throw new Error(`one transient write failure (${state})`);
      }
    return real(q, ...b);
  };
  r.fork("f-a").revokeError = () => internal();
  await assert.rejects(r.ledger.mint("f-a", "pin-objects:h1", TTL), /one transient write failure \(held\)/);
  const id = r.fork("f-a").tokens[0]!.id;
  assert.deepEqual(r.fork("f-a").revokes, [id]);
  assert.equal(only(r.sql)["state"], "owed");
  assert.equal(only(r.sql)["token"], id);
  (r.sql as { all: Sql["all"] }).all = real;
});

test("F22 expiry is checked again before each revocation: a record already past its readable expiry is settled with no lookup and no call; records whose expiry passes during the fork lookup are settled with no call", async () => {
  const r = room();
  const f = r.fork("f-a");
  const owe = async (n: number) => {
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const t = await r.ledger.mint("f-a", `pin-objects:${i}`, TTL);
      f.revokeError = () => internal();
      await t.release();
      f.revokeError = null;
      out.push(t.id);
    }
    return out;
  };
  await owe(1);
  r.clock.advance(TTL * 1000 + 1);
  const lookups = r.lookups.length;
  const calls = f.revokes.length;
  await alarm(r);
  assert.equal(rows(r.sql).length, 0);
  assert.equal(r.lookups.length, lookups, "no lookup");
  assert.equal(f.revokes.length, calls, "no call");
  // Two records due now, whose expiry passes while the fork is looked up.
  await owe(2);
  r.clock.t = Math.max(...rows(r.sql).map((x) => Number(x["due"])));
  const expiry = Math.max(...rows(r.sql).map((x) => Number(x["expires_at"])));
  r.onLookup = () => void (r.clock.t = expiry);
  const before = f.revokes.length;
  await alarm(r);
  r.onLookup = null;
  assert.equal(f.revokes.length, before, "no revocation sent for an expired token");
  assert.equal(rows(r.sql).length, 0);
  assert.equal(summary(r.sql)["owed"], 0);
  // An expired record never waits on another record's revocation: the pass that finds it settles only it, at once.
  await owe(1);
  r.clock.advance(TTL * 1000 - 5_000);
  const [fresh] = await owe(1);
  r.clock.advance(5_000); // the first has expired; the second is due
  f.holdRevokes = true;
  await r.ledger.reconcile();
  assert.deepEqual(
    rows(r.sql).map((x) => x["token"]),
    [fresh],
    "the expired record is settled while no revocation is out",
  );
  assert.equal(f.heldRevokes.length, 0);
  f.holdRevokes = false;
  r.clock.advance(OVERDUE_STEP_MS);
  await alarm(r);
  assert.equal(rows(r.sql).length, 0);
});

// ------------------------------------------------------------------ the checker's controls on 3d1223a1 (C1 to C3)

test("F24 (checker C1, as corrected) while a fork token create on the fork is unsettled, the fork's sweep revokes only tokens whose IDs a record names and leaves every other active token, whatever the time; once the record is settled by its own late answer, the next sweep resumes", async () => {
  const o = owner();
  const lane = "act_21_aaaaaaaa" as never;
  const name = forkName("canon", lane);
  const f = o.ns.add(name, "artifacts:ns/canon");
  o.ws.open(lane, 1 as never, o.clock.t + 3600_000);
  const lease = f.apply("write", 3600);
  o.sql.all("UPDATE artroom_ws SET token_id = ? WHERE lane = ?", lease.id, lane);
  const strayWrite = f.apply("write", 3600);
  const strayRead = f.apply("read", 3600);
  // The pin's create applies, and the host stops before its answer: a fresh host keeps the record unknown, with no ID.
  f.plans = ["hold"];
  const old = o.ws.forkTokens.mint(name, "pin-objects:checker", TTL);
  old.catch(() => undefined);
  await until(() => f.held.length === 1, "the create is out");
  const pin = f.held[0]!.apply();
  const ws = o.make();
  assert.deepEqual([only(o.sql)["state"], only(o.sql)["token"]], ["unknown", null]);
  // The lease ends: its token is owed by its ID and revoked; the sweep leaves every token no record names.
  await ws.revoke(lane, 1 as never);
  assert.deepEqual(f.revokes, [lease.id]);
  for (const t of [strayWrite, strayRead, pin]) assert.equal(f.live(t.id), true);
  // No time resumes it: two hours on (past the pin's lifetime and any allowance), another lease's sweep still leaves them.
  o.clock.advance(2 * 3600_000);
  const later = [f.apply("write", 3600 * 4), f.apply("read", 3600 * 4)];
  assert.equal(ws.open(lane, 2 as never, o.clock.t + 3600_000).hasOwnProperty("refused"), false);
  await ws.revoke(lane, 2 as never);
  assert.deepEqual(f.revokes, [lease.id]);
  for (const t of later) assert.equal(f.live(t.id), true);
  assert.equal(only(o.sql)["state"], "unknown", "the sweep settles nothing in the ledger");
  // The create's own answer arrives late: the record is settled (owed by its ID), and the next sweep resumes.
  f.held[0]!.answer();
  await assert.rejects(old);
  assert.deepEqual([only(o.sql)["state"], only(o.sql)["token"]], ["owed", pin.id]);
  assert.equal(ws.open(lane, 3 as never, o.clock.t + 3600_000).hasOwnProperty("refused"), false);
  await ws.revoke(lane, 3 as never);
  // The unrecorded tokens still active are revoked now; the pin's and the earlier strays have expired by their own lifetimes.
  assert.deepEqual(new Set(f.revokes), new Set([lease.id, ...later.map((t) => t.id)]));
  for (const t of [...later, strayWrite, strayRead, pin]) assert.equal(f.live(t.id), false);
});

test("F25 (checker C2) a known create answer survives one failed write and a failed revocation: the ID is kept as owed, and a later alarm on a new host revokes it", async () => {
  const r = room();
  const f = r.fork("f-a");
  const real = r.sql.all.bind(r.sql);
  let failed = false;
  (r.sql as { all: Sql["all"] }).all = (q, ...b) => {
    if (!failed && q.startsWith("UPDATE artroom_fork_mint SET state = 'held'")) {
      failed = true;
      throw new Error("one transient write failure");
    }
    return real(q, ...b);
  };
  f.revokeError = () => internal();
  await assert.rejects(r.ledger.mint("f-a", "pin-objects:checker", TTL), /one transient write failure/);
  const id = f.tokens[0]!.id;
  assert.deepEqual(f.revokes, [id]);
  f.revokeError = null;
  r.start();
  r.clock.advance(1000);
  await alarm(r);
  assert.equal(f.live(id), false, "the known token is revoked by its ID after the restart");
  assert.equal(r.ledger.duties().unknown, 0, "the known answer is never demoted to unknown");
});

test("F26 (checker C3) the sweep asks again before each revocation: while it waits on revoking a token the ledger names, the pin's answer arrives and its token becomes held; the sweep then keeps it", async () => {
  const o = owner();
  const lane = "act_22_bbbbbbbb" as never;
  const name = forkName("canon", lane);
  const f = o.ns.add(name, "artifacts:ns/canon");
  o.ws.open(lane, 1 as never, o.clock.t + 3600_000);
  // A token the ledger names: an earlier pin's, owed after its release failed.
  const earlier = await o.ws.forkTokens.mint(name, "pin-objects:earlier", TTL);
  f.revokeError = () => internal();
  await earlier.release();
  f.revokeError = null;
  f.plans = ["hold"];
  const mint = o.ws.forkTokens.mint(name, "pin-objects:checker", TTL);
  await until(() => f.held.length === 1, "the create is out");
  const h = f.held[0]!;
  h.apply();
  f.holdRevokes = true;
  const sweep = o.ws.revoke(lane, 1 as never);
  await until(() => f.heldRevokes.length === 1, "the sweep's revocation of the named token");
  assert.equal(f.heldRevokes[0]!.id, earlier.id);
  h.answer();
  const token = await mint;
  assert.equal(rows(o.sql).find((x) => x["token"] === token.id)?.["state"], "held");
  f.holdRevokes = false;
  f.heldRevokes[0]!.gate.resolve();
  await sweep;
  const live = f.live(token.id);
  await token.release();
  assert.equal(live, true, "the sweep never revokes a token held by pinning");
});

test("F27 a failed handoff writes the known ID before the revocation at once: a host that stops while that revocation is out leaves the record owed with its ID, and the next host revokes it", async () => {
  const r = room();
  const f = r.fork("f-a");
  r.sql.all("CREATE TRIGGER no_held BEFORE UPDATE ON artroom_fork_mint WHEN NEW.state = 'held' BEGIN SELECT RAISE(ABORT, 'storage failure'); END");
  f.holdRevokes = true;
  void r.ledger.mint("f-a", "pin-objects:h1", TTL).catch(() => undefined);
  await until(() => f.heldRevokes.length === 1, "the revocation at once is out");
  const id = f.tokens[0]!.id;
  assert.equal(only(r.sql)["state"], "owed");
  assert.equal(only(r.sql)["token"], id);
  // The host stops with that revocation unanswered; a fresh host on the same storage.
  r.sql.all("DROP TRIGGER no_held");
  f.holdRevokes = false;
  r.start();
  assert.equal(only(r.sql)["state"], "owed");
  await alarm(r);
  assert.equal(f.live(id), false);
  assert.equal(rows(r.sql).length, 0);
});

test("F28 (checker C4) the expiry upper bound allows for Artifacts' clock (R-MINT-3, MINT_CLOCK_ALLOWANCE_MS): 67 ms and 5,000 ms ahead of the lifetime asked are used; 5,001 ms ahead is owed and never returned", async () => {
  assert.equal(MINT_CLOCK_ALLOWANCE_MS, 5_000);
  const r = room();
  const f = r.fork("f-a");
  const ahead = (ms: number) => (t: Tok) => ({ ...(full(t) as object), expiresAt: new Date(t.expiresAt + ms).toISOString() });
  f.plans = [ahead(67), ahead(5_000), ahead(5_001)];
  const a = await r.ledger.mint("f-a", "pin-objects:67", TTL);
  const b = await r.ledger.mint("f-a", "pin-objects:5000", TTL);
  await assert.rejects(r.ledger.mint("f-a", "pin-objects:5001", TTL), /an expiry later than the lifetime asked/);
  assert.deepEqual(
    rows(r.sql).map((x) => [x["purpose"], x["state"]]),
    [
      ["pin-objects:67", "held"],
      ["pin-objects:5000", "held"],
      ["pin-objects:5001", "owed"],
    ],
  );
  await a.release();
  await b.release();
  await alarm(r);
  assert.equal(rows(r.sql).length, 0);
});
