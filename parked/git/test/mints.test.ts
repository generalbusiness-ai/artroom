// The canonical mint ledger (protocol section 32, R-MINT-1 to R-MINT-7): lane A
// of notes/2026-10-02-canonical-mint-ownership.md. Test numbers and names
// follow the note's lane A list, (1) to (10); each test is red with no ledger,
// or with a mutation named in plans/README.md ("Mint lane A"). The repository
// double's createToken can apply and then throw, lose its answer, hold its
// answer, answer late, or refuse unchanged.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MINT_CLOCK_ALLOWANCE_MS,
  MINT_ID_WRITE_ATTEMPTS,
  MINT_LISTING_MAX,
  MINT_REVOKE_BACKOFF,
  MintLedger,
  errorNote,
  TAKEOVER_AHEAD_MS,
  type LedgerToken,
  type MintRepo,
  type MintScope,
} from "../src/mints.ts";
import type { MintedToken, TokenInfo } from "../src/artifacts.ts";
import type { Sql, SqlRow } from "../src/sql.ts";
import { Clock, deferred, nodeSql } from "./support.ts";

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
  scope: MintScope;
  state: TokenInfo["state"];
  expiresAt: number;
}

/** A full answer, as Artifacts gives it. */
const full = (t: Tok): unknown => ({ id: t.id, plaintext: t.plaintext, scope: t.scope, expiresAt: new Date(t.expiresAt).toISOString() });

/** An answer with the token's ID and expiry, but no text: owed at once. */
const idOnly = (t: Tok): unknown => ({ id: t.id, scope: t.scope, expiresAt: new Date(t.expiresAt).toISOString() });

/** What one createToken call does. */
type Plan =
  | "ok" //          applies and answers
  | "apply-throw" // applies, then INTERNAL_ERROR (retriable)
  | "lose" //        applies, then a transport failure: the answer is lost
  | "drop" //        a transport failure; nothing applies
  | "refuse" //      refused, nothing changed
  | "hold" //        the answer waits for the test (`Repo.held`)
  | ((t: Tok) => unknown); // applies; the test shapes the answer

/** A create whose answer the test gives later: apply now or late, answer, refuse or lose it. */
class Held {
  readonly gate = deferred<unknown>();
  readonly repo: Repo;
  readonly scope: MintScope;
  readonly ttl: number;
  tok: Tok | null = null;
  constructor(repo: Repo, scope: MintScope, ttl: number) {
    this.repo = repo;
    this.scope = scope;
    this.ttl = ttl;
  }
  apply(): Tok {
    return (this.tok ??= this.repo.apply(this.scope, this.ttl));
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

class Repo implements MintRepo {
  readonly clock: Clock;
  readonly tokens: Tok[] = [];
  n = 0;
  plans: Plan[] = [];
  defaultPlan: Plan = "ok";
  /** Every create asked: scope, lifetime (s), room time. */
  readonly creates: { scope: MintScope; ttl: number; at: number }[] = [];
  /** Runs when a create is asked, before anything applies. */
  onCreate: (() => void) | null = null;
  readonly held: Held[] = [];
  /** Every revocation asked, by ID, in order. */
  readonly revokes: string[] = [];
  revokeDown = false;
  /** While set, every revocation fails with this error. */
  revokeError: ((id: string) => Error) | null = null;
  holdRevokes = false;
  readonly heldRevokes: { id: string; gate: ReturnType<typeof deferred<void>> }[] = [];
  lists = 0;
  listing: ((tokens: TokenInfo[]) => unknown) | null = null;

  constructor(clock: Clock) {
    this.clock = clock;
  }

  apply(scope: MintScope, ttl: number): Tok {
    const id = `tok_${++this.n}`;
    const t: Tok = { id, plaintext: `art_v1_${id}${"x".repeat(24)}?expires=${ttl}`, scope, state: "active", expiresAt: this.clock.t + ttl * 1000 };
    this.tokens.push(t);
    return t;
  }

  async createToken(scope: "write" | "read" = "write", ttl = 86400): Promise<MintedToken> {
    this.creates.push({ scope, ttl, at: this.clock.t });
    this.onCreate?.();
    const plan = this.plans.shift() ?? this.defaultPlan;
    if (plan === "hold") {
      const h = new Held(this, scope, ttl);
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
    if (this.revokeDown) throw internal();
    if (this.revokeError) throw this.revokeError(id);
    if (this.holdRevokes) {
      const gate = deferred<void>();
      this.heldRevokes.push({ id, gate });
      await gate.promise;
    }
    const t = this.tokens.find((x) => x.id === id);
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

  /** A token another owner holds on the canonical repository. */
  foreign(): Tok {
    return this.apply("read", 86400);
  }

  live(id: string): boolean {
    const t = this.tokens.find((x) => x.id === id);
    return !!t && t.state === "active" && t.expiresAt > this.clock.t;
  }
}

/** A Room around one ledger: its SQLite, clock, stored alarm and other records (`known`). */
function room(o: { waitMs?: number; sql?: Sql; clock?: Clock } = {}) {
  const clock = o.clock ?? new Clock();
  const sql = o.sql ?? nodeSql();
  const repo = new Repo(clock);
  const r = {
    clock,
    sql,
    repo,
    /** Token IDs other Room records hold. */
    known: new Set<string>(),
    knownCalls: 0,
    /** The stored alarm: a wake keeps an earlier one. */
    alarm: null as number | null,
    wakes: [] as number[],
    wakeFails: false,
    /** While set, looking up the repository never answers. */
    lookupHangs: false,
    /** While set, looking up the repository answers only when this gate opens. */
    lookupGate: null as ReturnType<typeof deferred<void>> | null,
    lookups: 0,
    /** Room time one wake takes to store. */
    wakeTakesMs: 0,
    ledger: null as unknown as MintLedger,
    /** A new host on the same storage. */
    start(): MintLedger {
      r.ledger = new MintLedger({
        sql,
        repo: () => {
          r.lookups++;
          if (r.lookupHangs) return new Promise<MintRepo>(() => {});
          const gate = r.lookupGate;
          return gate ? gate.promise.then(() => repo) : Promise.resolve(repo);
        },
        now: clock.now,
        wake: async (at) => {
          if (r.wakeFails) throw new Error("storage refused the alarm");
          clock.advance(r.wakeTakesMs);
          r.wakes.push(at);
          r.alarm = r.alarm === null ? at : Math.min(r.alarm, at);
        },
        known: (id) => {
          r.knownCalls++;
          return r.known.has(id);
        },
        waitMs: o.waitMs ?? 2_000,
        sleep: async () => {},
      });
      return r.ledger;
    },
  };
  r.start();
  return r;
}

const ttl60 = () => 60;

function rows(sql: Sql): SqlRow[] {
  return sql.all("SELECT * FROM artroom_mint ORDER BY id");
}

function only(sql: Sql): SqlRow {
  const all = rows(sql);
  assert.equal(all.length, 1, `one record, not ${all.length}`);
  return all[0]!;
}

function summary(sql: Sql): SqlRow {
  return sql.all("SELECT * FROM artroom_mint_summary WHERE k = 1")[0]!;
}

async function until(f: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 2_000; i++) {
    if (f()) return;
    await new Promise((r) => setImmediate(r));
  }
  throw new Error(`timed out waiting for ${what}`);
}

/** Run the alarm's work and wait for the revocation pass it started. */
async function alarm(r: ReturnType<typeof room>): Promise<void> {
  await r.ledger.reconcile();
  await r.ledger.idle();
}

// ------------------------------------------------------------------ (1)

test("(1) the record and the stored wake-up are both in place when createToken is called, and the record holds the lifetime asked", async () => {
  const r = room();
  const t0 = r.clock.t;
  let seen: { record: SqlRow; alarm: number | null; takeover: unknown } | null = null;
  r.repo.onCreate = () => {
    seen = { record: only(r.sql), alarm: r.alarm, takeover: summary(r.sql)["takeover"] };
  };
  const token = await r.ledger.mint("publish:op:1", "write", ttl60);
  assert.ok(seen, "createToken was called");
  const s = seen as { record: SqlRow; alarm: number | null; takeover: unknown };
  assert.equal(s.record["state"], "sent");
  assert.equal(s.record["purpose"], "publish:op:1");
  assert.equal(s.record["scope"], "write");
  assert.equal(s.record["ttl"], 60, "the record holds the lifetime asked before the request is sent");
  assert.equal(s.takeover, t0 + TAKEOVER_AHEAD_MS);
  assert.ok(s.alarm !== null && s.alarm <= t0 + TAKEOVER_AHEAD_MS, "a wake-up no later than the takeover time is stored before the send");
  assert.equal(r.repo.creates[0]!.ttl, 60);
  assert.equal(token.scope, "write");
  assert.equal(only(r.sql)["state"], "held");
});

test("(1) the lifetime is computed after the wake-up is stored: a 20 s wake-up shortens it, and the pre-send record holds the lifetime actually asked", async () => {
  const r = room();
  const deadline = r.clock.t + 100_000;
  r.wakeTakesMs = 20_000;
  const asked: number[] = [];
  let recorded: SqlRow | null = null;
  r.repo.onCreate = () => {
    recorded = only(r.sql);
  };
  const token = await r.ledger.mint("job:j1_1", "read", (sentAt) => {
    asked.push(sentAt);
    return Math.floor((deadline - sentAt) / 1000);
  }, { notAfter: deadline });
  assert.deepEqual(asked, [deadline - 80_000], "ttl is called with the time after the wake-up");
  assert.equal(r.repo.creates[0]!.ttl, 80);
  const rec = recorded as SqlRow | null;
  assert.equal(rec?.["ttl"], 80, "the record holds the recomputed lifetime when createToken is called");
  assert.equal(rec?.["sent_at"], deadline - 80_000);
  assert.ok(token.expiresAt <= deadline);
});

test("(1) a failed record write sends nothing and leaves no record", async () => {
  const r = room();
  r.sql.all("CREATE TRIGGER no_record BEFORE INSERT ON artroom_mint BEGIN SELECT RAISE(ABORT, 'storage failure'); END");
  await assert.rejects(r.ledger.mint("publish:op:1", "write", ttl60), /storage failure/);
  assert.equal(r.repo.creates.length, 0);
  assert.equal(rows(r.sql).length, 0);
  assert.equal(r.wakes.length, 0);
});

test("(1) a failed wake-up sends nothing and leaves no record", async () => {
  const r = room();
  r.wakeFails = true;
  let ttlCalls = 0;
  await assert.rejects(
    r.ledger.mint("publish:op:1", "write", () => {
      ttlCalls++;
      return 60;
    }),
    /storage refused the alarm/,
  );
  assert.equal(r.repo.creates.length, 0);
  assert.equal(ttlCalls, 0, "no lifetime is computed before the wake-up is stored");
  assert.equal(rows(r.sql).length, 0);
  assert.equal(r.ledger.nextDue(), null);
});

test("(1) each send stores its wake-up; the takeover time moves only when it is less than 30 s away", async () => {
  const r = room();
  const t0 = r.clock.t;
  r.repo.defaultPlan = "hold";
  const a = r.ledger.mint("a", "read", ttl60);
  await until(() => r.repo.held.length === 1, "a");
  r.clock.advance(10_000);
  const b = r.ledger.mint("b", "read", ttl60);
  await until(() => r.repo.held.length === 2, "b");
  assert.deepEqual(r.wakes, [t0 + 60_000, t0 + 60_000], "50 s away: kept, and waited for again");
  r.clock.advance(21_000);
  const c = r.ledger.mint("c", "read", ttl60);
  await until(() => r.repo.held.length === 3, "c");
  assert.equal(r.wakes[2], t0 + 31_000 + 60_000, "29 s away: moved to 60 s from now");
  for (const h of r.repo.held) h.answer();
  for (const t of await Promise.all([a, b, c])) await t.release();
});

// ------------------------------------------------------------------ (2)

test("(2) applied, then INTERNAL_ERROR: the record is unknown and the retry is a new record; the unknown record survives lifetimes, inventories and a takeover; nothing outside the ledger's records is revoked", async () => {
  const r = room();
  const other = r.repo.foreign(); // another owner's token on the canonical repository
  r.known.add(other.id);
  const stranger = r.repo.foreign(); // a token no Room record names
  r.repo.plans = ["apply-throw", "ok"];
  const seen: string[][] = [];
  r.repo.onCreate = () => seen.push(rows(r.sql).map((x) => `${x["id"]}:${x["state"]}`));
  const token = await r.ledger.mint("publish:op:1", "write", ttl60);
  assert.deepEqual(seen, [["1:sent"], ["1:unknown", "2:sent"]], "the retry is a new record, sent only once the first holds its outcome");
  assert.equal(r.repo.creates.length, 2);
  const applied = r.repo.tokens.find((t) => t.id !== other.id && t.id !== stranger.id && t.id !== token.id)!;
  assert.ok(r.repo.live(applied.id), "the first create applied");
  await token.release();
  assert.deepEqual(rows(r.sql).map((x) => [x["id"], x["state"]]), [[1, "unknown"]]);
  assert.equal(r.ledger.duties().unknown, 1);

  // The first observation counts the applied token, and settles nothing.
  await alarm(r);
  const first = r.ledger.duties().observation;
  assert.equal(first.unaccounted, 2, "the lost create's token and the stranger's");
  assert.equal(only(r.sql)["state"], "unknown");

  // The lifetime asked passes many times over, with alarms throughout.
  for (let i = 0; i < 100; i++) {
    r.clock.advance(60_000);
    await alarm(r);
  }
  assert.ok(!r.repo.live(applied.id), "the lost token has expired");
  assert.equal(only(r.sql)["state"], "unknown", "elapsed time and lifetimes never settle an unknown record");

  // A complete inventory with nothing unaccounted.
  await r.repo.revokeToken(stranger.id);
  r.repo.revokes.length = 0;
  r.clock.advance(7 * 3600_000);
  await alarm(r);
  assert.equal(r.ledger.duties().observation.unaccounted, 0);
  assert.equal(only(r.sql)["state"], "unknown", "a clean inventory never settles it");

  // An incomplete one.
  r.repo.listing = (tokens) => ({ tokens, total: tokens.length + 1 });
  r.clock.advance(7 * 3600_000);
  await alarm(r);
  assert.match(String(r.ledger.duties().observation.result), /incomplete or malformed/);
  assert.equal(r.ledger.duties().observation.unaccounted, null);
  assert.equal(only(r.sql)["state"], "unknown");

  // A takeover.
  r.start();
  await alarm(r);
  assert.equal(only(r.sql)["state"], "unknown", "a takeover never settles it");
  assert.equal(r.ledger.duties().unknown, 1);
  assert.deepEqual(r.repo.revokes, [], "no token outside the ledger's records is ever asked to be revoked");
  assert.ok(r.repo.live(other.id));
});

// ------------------------------------------------------------------ (3)

test("(3) a refusal that changed nothing deletes the record, with no retry", async () => {
  const r = room();
  r.repo.plans = ["refuse", "ok"];
  await assert.rejects(r.ledger.mint("publish:op:1", "write", ttl60), (e: unknown) => (e as { code?: string }).code === "INVALID_TTL");
  assert.equal(r.repo.creates.length, 1, "no retry");
  assert.equal(rows(r.sql).length, 0);
  const d = r.ledger.duties();
  assert.equal(d.unknown, 0);
  assert.equal(d.owed, 0);
});

test("(3) a transport failure that may have applied is unknown, and is not retried", async () => {
  const r = room();
  r.repo.plans = ["lose", "ok"];
  await assert.rejects(r.ledger.mint("log:push", "write", ttl60), /connection was reset/);
  assert.equal(r.repo.creates.length, 1);
  assert.equal(only(r.sql)["state"], "unknown");
});

// ------------------------------------------------------------------ (4)

test("(4) an ID without text is owed and revoked by that ID", async () => {
  const r = room();
  r.repo.plans = [(t) => ({ id: t.id, scope: t.scope, expiresAt: new Date(t.expiresAt).toISOString() })];
  await assert.rejects(r.ledger.mint("preview:l1", "write", ttl60), /no token text/);
  const rec = only(r.sql);
  assert.equal(rec["state"], "owed");
  assert.equal(r.wakes[r.wakes.length - 1], r.clock.t, "a wake-up for its revocation, due now");
  assert.equal(rec["token"], "tok_1");
  assert.equal(r.ledger.duties().owed, 1);
  await alarm(r);
  assert.deepEqual(r.repo.revokes, ["tok_1"]);
  assert.equal(rows(r.sql).length, 0);
  assert.equal(r.ledger.duties().owed, 0);
  assert.equal(r.repo.lists, 0, "with no unknown record, no inventory is read");
});

test("(4) an unreadable expiry is owed with no expiry, and stays owed through any time until a revocation is answered", async () => {
  const r = room();
  r.repo.plans = [(t) => ({ ...(full(t) as object), expiresAt: "soon" })];
  await assert.rejects(r.ledger.mint("pin:l1", "write", () => 600), /unreadable expiry/);
  assert.equal(only(r.sql)["expires_at"], null);
  r.repo.revokeDown = true;
  for (let i = 0; i < 40; i++) {
    r.clock.advance(3600_000);
    await alarm(r);
  }
  assert.equal(only(r.sql)["state"], "owed", "never settled by time");
  assert.equal(r.repo.revokes.length, 40, "and still revoked by its ID on each pass");
  r.repo.revokeDown = false;
  r.clock.advance(300_000);
  await alarm(r);
  assert.equal(rows(r.sql).length, 0, "the answered revocation ends it");
});

test("(4) another scope, a longer expiry, or an expiry after notAfter that passes the generic check is owed at once and never returned", async () => {
  const r = room();
  const iso = (ms: number) => new Date(ms).toISOString();
  r.repo.plans = [
    (t) => ({ ...(full(t) as object), scope: "write" }),
    (t) => ({ ...(full(t) as object), expiresAt: iso(t.expiresAt + MINT_CLOCK_ALLOWANCE_MS + 1) }),
  ];
  await assert.rejects(r.ledger.mint("read:a", "read", ttl60), /another scope/);
  await assert.rejects(r.ledger.mint("read:b", "read", ttl60), /later than the lifetime asked/);
  // A 60 s token passes the generic check, but outlives the bound.
  const notAfter = r.clock.t + 30_000;
  await assert.rejects(r.ledger.mint("job:j1_1", "read", ttl60, { notAfter }), /after notAfter/);
  assert.deepEqual(rows(r.sql).map((x) => [x["state"], x["token"]]), [["owed", "tok_1"], ["owed", "tok_2"], ["owed", "tok_3"]]);
  await alarm(r);
  assert.deepEqual(r.repo.revokes, ["tok_1", "tok_2", "tok_3"]);
  // The boundary: an expiry equal to notAfter is accepted.
  const exact = await r.ledger.mint("job:j1_2", "read", ttl60, { notAfter: r.clock.t + 60_000 });
  assert.equal(exact.expiresAt, r.clock.t + 60_000);
  await exact.release();
});

test("(4) Artifacts' clock ahead of the Room's (request df6ff8d3): an expiry 67 ms past the arrival plus the lifetime asked, as on the spike, and one exactly the allowance past, are usable; 1 ms more is owed; notAfter has no allowance", async () => {
  assert.equal(MINT_CLOCK_ALLOWANCE_MS, 5_000);
  const r = room();
  const iso = (ms: number) => new Date(ms).toISOString();
  r.repo.plans = [
    (t) => ({ ...(full(t) as object), expiresAt: iso(t.expiresAt + 67) }),
    (t) => ({ ...(full(t) as object), expiresAt: iso(t.expiresAt + MINT_CLOCK_ALLOWANCE_MS) }),
    (t) => ({ ...(full(t) as object), expiresAt: iso(t.expiresAt + MINT_CLOCK_ALLOWANCE_MS + 1) }),
    (t) => ({ ...(full(t) as object), expiresAt: iso(t.expiresAt + 1) }),
  ];
  const live = await r.ledger.mint("pin-objects:h1", "write", () => 600);
  assert.equal(live.expiresAt, r.clock.t + 600_000 + 67, "the reported expiry, as Artifacts gave it");
  const edge = await r.ledger.mint("pin-objects:h2", "write", () => 600);
  await assert.rejects(r.ledger.mint("pin-objects:h3", "write", () => 600), /later than the lifetime asked/);
  // 1 ms past a check job's deadline passes the generic check with its allowance, and is still refused.
  await assert.rejects(r.ledger.mint("job:j1_1", "read", ttl60, { notAfter: r.clock.t + 60_000 }), /after notAfter/);
  assert.deepEqual(rows(r.sql).map((x) => [x["purpose"], x["state"]]), [["pin-objects:h1", "held"], ["pin-objects:h2", "held"], ["pin-objects:h3", "owed"], ["job:j1_1", "owed"]]);
  await live.release();
  await edge.release();
  await alarm(r);
  assert.deepEqual(r.repo.revokes, ["tok_1", "tok_2", "tok_3", "tok_4"]);
  assert.equal(rows(r.sql).length, 0);
});

test("(4) no ID is unknown", async () => {
  const r = room();
  r.repo.plans = [(t) => ({ plaintext: t.plaintext, scope: t.scope, expiresAt: new Date(t.expiresAt).toISOString() })];
  await assert.rejects(r.ledger.mint("log:read", "read", ttl60), /without a token ID/);
  assert.equal(only(r.sql)["state"], "unknown");
  assert.equal(r.ledger.duties().unknown, 1);
});

test("(4) an owed record with a readable expiry whose revocations keep failing is settled once that expiry passes, with no revocation recorded and no further call", async () => {
  const r = room();
  r.repo.plans = [(t) => ({ id: t.id, scope: t.scope, expiresAt: new Date(t.expiresAt).toISOString() })];
  await assert.rejects(r.ledger.mint("preview:l1", "write", ttl60));
  const expires = Number(only(r.sql)["expires_at"]);
  r.repo.revokeDown = true;
  while (r.clock.t < expires - 5_000) {
    r.clock.t = Math.min(Number(only(r.sql)["due"]), expires - 5_000);
    await alarm(r);
  }
  const calls = r.repo.revokes.length;
  assert.ok(calls >= 2);
  assert.equal(only(r.sql)["state"], "owed");
  assert.equal(Number(only(r.sql)["due"]), expires, "the backoff never carries it past its known expiry");
  r.clock.t = expires;
  await alarm(r);
  assert.equal(rows(r.sql).length, 0, "settled at its known expiry");
  assert.equal(r.repo.revokes.length, calls, "no further revocation call");
  assert.equal(r.repo.tokens[0]!.state, "active", "no revocation recorded: Artifacts never revoked it");
  assert.equal(r.ledger.duties().owed, 0);
});

// ------------------------------------------------------------------ (5)

test("(5) a held answer past the wait: the caller gets an error and the record is unknown; the late answer's ID makes it owed, revoked by that ID, and no caller gets the text", async () => {
  const r = room({ waitMs: 10 });
  r.repo.plans = ["hold"];
  let got: LedgerToken | null = null;
  const p = r.ledger.mint("publish:op:1", "write", ttl60).then((t) => (got = t));
  await assert.rejects(p, /did not answer the token request within 10 ms/);
  assert.equal(only(r.sql)["state"], "unknown");
  assert.equal(r.ledger.duties().unknown, 1);
  r.repo.held[0]!.answer();
  await r.ledger.idle();
  assert.equal(got, null, "no caller gets the token");
  const rec = only(r.sql);
  assert.equal(rec["state"], "owed");
  assert.equal(rec["token"], "tok_1");
  assert.deepEqual([r.ledger.duties().unknown, r.ledger.duties().owed], [0, 1]);
  await alarm(r);
  assert.deepEqual(r.repo.revokes, ["tok_1"]);
  assert.equal(rows(r.sql).length, 0);
});

test("(5) a late refusal deletes the unknown record; a late lost answer leaves it unknown", async () => {
  const r = room({ waitMs: 10 });
  r.repo.plans = ["hold", "hold"];
  await assert.rejects(r.ledger.mint("a", "read", ttl60));
  await assert.rejects(r.ledger.mint("b", "read", ttl60));
  assert.equal(r.ledger.duties().unknown, 2);
  r.repo.held[0]!.refuse();
  r.repo.held[1]!.lose();
  await r.ledger.idle();
  assert.deepEqual(rows(r.sql).map((x) => [x["purpose"], x["state"]]), [["b", "unknown"]]);
  assert.equal(r.ledger.duties().unknown, 1);
});

test("(5) a late answer to a record whose given-up state could not be stored is still never held: its ID is owed", async () => {
  const r = room({ waitMs: 10 });
  r.sql.all("CREATE TRIGGER no_unknown BEFORE UPDATE ON artroom_mint WHEN NEW.state = 'unknown' BEGIN SELECT RAISE(ABORT, 'storage failure'); END");
  r.repo.plans = ["hold"];
  await assert.rejects(r.ledger.mint("publish:op:1", "write", ttl60), /did not answer/);
  assert.equal(only(r.sql)["state"], "sent", "the given-up state could not be stored");
  r.repo.held[0]!.answer();
  await r.ledger.idle();
  assert.deepEqual([only(r.sql)["state"], only(r.sql)["token"]], ["owed", "tok_1"], "no caller waits, so the token is owed, not held");
});

// ------------------------------------------------------------------ (6)

test("(6) a failed handoff (a trigger rejects the update), as amended for request 02836f9a: the ID in hand is written durably as owed before the revocation at once; an answered revocation ends the record; a failed one leaves it owed with the ID, revoked by a later alarm on a new host", async () => {
  const r = room();
  r.sql.all("CREATE TRIGGER no_hold BEFORE UPDATE ON artroom_mint WHEN NEW.state = 'held' BEGIN SELECT RAISE(ABORT, 'storage failure'); END");
  r.repo.holdRevokes = true;
  const p = r.ledger.mint("publish:op:1", "write", ttl60);
  p.catch(() => undefined);
  await until(() => r.repo.heldRevokes.length === 1, "the revocation");
  assert.equal(r.repo.heldRevokes[0]!.id, "tok_1", "revoked by the answer's ID, at once");
  assert.deepEqual([only(r.sql)["state"], only(r.sql)["token"]], ["owed", "tok_1"], "the ID is on record before the revocation is out");
  r.repo.heldRevokes[0]!.gate.resolve();
  await assert.rejects(p, /storage failure/);
  assert.equal(rows(r.sql).length, 0);

  // When that revocation fails, the record stays owed with the ID, through a new host, until a later alarm revokes it.
  r.repo.holdRevokes = false;
  r.repo.revokeDown = true;
  await assert.rejects(r.ledger.mint("publish:op:2", "write", ttl60), /storage failure/);
  assert.deepEqual([only(r.sql)["state"], only(r.sql)["token"]], ["owed", "tok_2"]);
  assert.equal(summary(r.sql)["unknown"], 0);
  r.sql.all("DROP TRIGGER no_hold");
  r.repo.revokeDown = false;
  r.start();
  assert.equal(only(r.sql)["state"], "owed");
  r.clock.advance(MINT_REVOKE_BACKOFF.firstMs);
  await alarm(r);
  assert.equal(r.repo.live("tok_2"), false);
  assert.equal(rows(r.sql).length, 0);
});

test("(6) a failed handoff where storage refuses the ID's write: it is retried, a bounded number of times, before the revocation; if every retry is refused the record keeps its earlier state, the stated limit", async () => {
  const r = room();
  const real = r.sql.all.bind(r.sql);
  let owedWrites = 0;
  let refuse = 0;
  (r.sql as { all: Sql["all"] }).all = (q, ...b) => {
    if (q.startsWith("UPDATE artroom_mint SET state = 'held'")) throw new Error("storage failure");
    if (q.startsWith("UPDATE artroom_mint SET state = 'owed'")) {
      owedWrites++;
      if (refuse > 0) {
        refuse--;
        throw new Error("storage failure");
      }
    }
    return real(q, ...b);
  };
  r.repo.revokeDown = true;
  // Two writes refused, the third taken: owed with the ID, before the revocation.
  refuse = 2;
  await assert.rejects(r.ledger.mint("publish:op:1", "write", ttl60), /storage failure/);
  assert.equal(owedWrites, 3);
  assert.deepEqual([only(r.sql)["state"], only(r.sql)["token"]], ["owed", "tok_1"]);
  assert.deepEqual(r.repo.revokes, ["tok_1"]);
  real("DELETE FROM artroom_mint");
  real("UPDATE artroom_mint_summary SET owed = 0, unknown = 0 WHERE k = 1");
  // Every write refused: MINT_ID_WRITE_ATTEMPTS tries, then the revocation at once; the record keeps its earlier state.
  owedWrites = 0;
  refuse = 1000;
  await assert.rejects(r.ledger.mint("publish:op:2", "write", ttl60), /storage failure/);
  assert.equal(owedWrites, MINT_ID_WRITE_ATTEMPTS);
  assert.equal(only(r.sql)["state"], "sent");
  assert.deepEqual(r.repo.revokes, ["tok_1", "tok_2"]);
  (r.sql as { all: Sql["all"] }).all = real;
});

test("(6) two mints in flight: a late completion of one never changes the other's row, or a row another owner has claimed", async () => {
  const r = room({ waitMs: 40 });
  r.sql.all("CREATE TABLE owner (token TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)");
  r.repo.plans = ["hold", "hold"];
  const a = r.ledger.mint("a", "read", ttl60);
  a.catch(() => undefined);
  const b = r.ledger.mint("b", "read", ttl60);
  await until(() => r.repo.held.length === 2, "both creates");
  r.repo.held[0]!.apply(); // a's create applies first (tok_1); its answer comes late
  r.repo.held[1]!.answer();
  const tb = await b;
  r.sql.transaction(() => {
    r.sql.all("INSERT INTO owner (token, expires_at) VALUES (?, ?)", tb.id, tb.expiresAt);
    tb.claim();
  });
  await assert.rejects(a, /did not answer/);
  r.repo.held[0]!.answer();
  await r.ledger.idle();
  assert.deepEqual(rows(r.sql).map((x) => [x["purpose"], x["state"], x["token"]]), [["a", "owed", "tok_1"]]);
  assert.deepEqual(r.sql.all("SELECT token FROM owner").map((x) => x["token"]), [tb.id]);
  await alarm(r);
  assert.deepEqual(r.repo.revokes, ["tok_1"], "the claimed token is never revoked by the ledger");
  await tb.release();
  assert.deepEqual(r.repo.revokes, ["tok_1"], "a claimed token is not the caller's to release");
});

test("(6) a stale caller: a usable answer that arrives after a takeover is never returned; the count of unknown records stays exact", async () => {
  const r = room({ waitMs: 40 });
  r.repo.plans = ["hold"];
  const old = r.ledger;
  const p = old.mint("publish:op:1", "write", ttl60);
  p.catch(() => undefined);
  await until(() => r.repo.held.length === 1, "the create");
  r.start(); // a new host takes over while the old caller still waits
  assert.equal(only(r.sql)["state"], "unknown");
  r.repo.held[0]!.answer();
  await assert.rejects(p, /cannot be used/);
  assert.equal(only(r.sql)["state"], "owed");
  assert.deepEqual([r.ledger.duties().unknown, r.ledger.duties().owed], [0, 1]);

  // The old caller's timeout after a takeover changes nothing it no longer owns.
  r.repo.plans = ["hold"];
  const q = old.mint("publish:op:2", "write", ttl60);
  q.catch(() => undefined);
  await until(() => r.repo.held.length === 2, "the second create");
  r.start();
  await assert.rejects(q, /did not answer/);
  assert.equal(r.ledger.duties().unknown, 1, "counted once, by the takeover");
});

test("(6) claim() runs inside the owner's transaction: a rollback leaves the ledger owning the token", async () => {
  const r = room();
  r.sql.all("CREATE TABLE owner (token TEXT PRIMARY KEY)");
  const t = await r.ledger.mint("job:j1_1", "read", ttl60);
  assert.throws(() =>
    r.sql.transaction(() => {
      r.sql.all("INSERT INTO owner (token) VALUES (?)", t.id);
      t.claim();
      throw new Error("the owner's transaction fails");
    }),
  );
  await Promise.resolve();
  await new Promise((res) => setImmediate(res));
  assert.equal(only(r.sql)["state"], "held", "the ledger still owns it");
  assert.deepEqual(r.sql.all("SELECT token FROM owner"), []);
  r.sql.transaction(() => {
    r.sql.all("INSERT INTO owner (token) VALUES (?)", t.id);
    t.claim();
  });
  assert.equal(rows(r.sql).length, 0);
  assert.throws(() => t.claim(), /no longer holds/);
});

// ------------------------------------------------------------------ (7)

test("(7) takeover: sent becomes unknown, held becomes owed and is revoked by its ID on the next reconcile()", async () => {
  const r = room();
  r.repo.plans = ["ok", "hold"];
  const held = await r.ledger.mint("publish:op:1", "write", ttl60);
  const sent = r.ledger.mint("log:push", "write", ttl60);
  sent.catch(() => undefined);
  await until(() => r.repo.held.length === 1, "the second create");
  const old = held;
  r.start();
  assert.deepEqual(rows(r.sql).map((x) => [x["purpose"], x["state"], x["due"]]), [
    ["publish:op:1", "owed", r.clock.t],
    ["log:push", "unknown", null],
  ]);
  assert.deepEqual([r.ledger.duties().owed, r.ledger.duties().unknown], [1, 1]);
  await alarm(r);
  assert.deepEqual(r.repo.revokes, [held.id]);
  assert.deepEqual(rows(r.sql).map((x) => x["state"]), ["unknown"]);
  await old.release();
  assert.throws(() => old.claim());
  assert.deepEqual(r.repo.revokes, [held.id], "the old host's release asks for nothing");
});

// ------------------------------------------------------------------ (8)

test("(8) the takeover time is in nextDue() while a record is in flight; a run on the live host moves it 60 s ahead; it is cleared when nothing is in flight", async () => {
  const r = room();
  assert.equal(r.ledger.nextDue(), null);
  r.repo.plans = ["hold"];
  const t0 = r.clock.t;
  const p = r.ledger.mint("publish:op:1", "write", ttl60);
  await until(() => r.repo.held.length === 1, "the create");
  assert.equal(r.ledger.nextDue(), t0 + 60_000, "sent: the takeover time");
  r.clock.t = t0 + 60_000;
  await alarm(r);
  assert.equal(r.ledger.duties().takeoverAt, t0 + 120_000, "the alarm on the live host moves it 60 s ahead");
  assert.equal(r.ledger.nextDue(), t0 + 120_000);
  r.repo.held[0]!.answer();
  const t = await p;
  r.clock.t = t0 + 120_000;
  await alarm(r);
  assert.equal(r.ledger.duties().takeoverAt, t0 + 180_000, "held: still in flight, still moved");
  assert.equal(r.ledger.nextDue(), t0 + 180_000);
  await t.release();
  await alarm(r);
  assert.equal(r.ledger.duties().takeoverAt, null, "nothing in flight: cleared");
  assert.equal(r.ledger.nextDue(), null);
});

test("(8) nextDue(): overdue work is due 1 s after now, never sooner; a still-future takeover, observation or revocation time is returned on time", async () => {
  // An overdue revocation alone: now plus exactly 1 s, however overdue.
  const r = room();
  r.repo.plans = [idOnly];
  await assert.rejects(r.ledger.mint("a", "write", () => 86_400));
  assert.equal(r.ledger.nextDue(), r.clock.t + 1_000, "due now: now plus 1 s");
  r.clock.advance(10_000);
  assert.equal(r.ledger.nextDue(), r.clock.t + 1_000, "overdue by 10 s: still now plus 1 s");

  // With a still-future takeover time 400 ms away: that time, not later.
  r.repo.plans = ["hold"];
  const p = r.ledger.mint("b", "read", ttl60);
  await until(() => r.repo.held.length === 1, "the create");
  const takeover = Number(r.ledger.duties().takeoverAt);
  r.clock.t = takeover - 400;
  assert.equal(r.ledger.nextDue(), takeover);
  r.repo.held[0]!.answer();
  await (await p).release();

  // A future revocation time alone: that time exactly.
  const f = room();
  const held = await f.ledger.mint("c", "write", ttl60);
  f.repo.revokeDown = true;
  await held.release();
  const due = Number(only(f.sql)["due"]);
  f.clock.advance(400);
  assert.equal(f.ledger.nextDue(), due, "600 ms ahead: on time, not postponed to now plus 1 s");

  // With a still-future observation time 300 ms away and an overdue revocation: the observation time.
  const o = room();
  o.repo.plans = ["lose"];
  await assert.rejects(o.ledger.mint("d", "read", ttl60));
  await alarm(o); // observes now; the next is due in 1 min
  const observeAt = Number(o.ledger.duties().observation.nextAt);
  o.repo.plans = [idOnly];
  await assert.rejects(o.ledger.mint("e", "write", () => 86_400));
  o.clock.t = observeAt - 300;
  assert.equal(o.ledger.nextDue(), observeAt);
});

// ------------------------------------------------------------------ (9)

test("(9) a failed revocation stays owed with backoff, 1 s doubling to 5 min, across takeovers", async () => {
  const r = room();
  r.repo.plans = [(t) => ({ id: t.id, scope: t.scope, expiresAt: new Date(t.expiresAt).toISOString() })];
  await assert.rejects(r.ledger.mint("a", "write", () => 30 * 86_400));
  r.repo.revokeDown = true;
  const waits: number[] = [];
  for (let i = 0; i < 12; i++) {
    const before = Number(only(r.sql)["due"]);
    r.clock.t = Math.max(before, r.clock.t);
    if (i === 5) r.start(); // a takeover keeps the schedule
    await alarm(r);
    const rec = only(r.sql);
    waits.push(Number(rec["due"]) - r.clock.t);
    assert.equal(rec["backoff"], waits[waits.length - 1]);
    // Not tried again before it is due.
    await alarm(r);
  }
  assert.deepEqual(waits, [1, 2, 4, 8, 16, 32, 64, 128, 256, 300, 300, 300].map((s) => s * 1000));
  assert.equal(r.repo.revokes.length, 12);
  assert.match(String(only(r.sql)["last_error"]), /revocation failed/);
});

test("(9) a timed-out revocation counts as failed; its late answer is dropped; the next answered attempt ends the record", async () => {
  const r = room({ waitMs: 10 });
  r.repo.plans = [(t) => ({ id: t.id, scope: t.scope, expiresAt: new Date(t.expiresAt).toISOString() })];
  await assert.rejects(r.ledger.mint("a", "write", () => 86_400));
  r.repo.holdRevokes = true;
  await alarm(r);
  assert.equal(only(r.sql)["state"], "owed");
  assert.equal(only(r.sql)["backoff"], 1_000);
  r.repo.heldRevokes[0]!.gate.resolve(); // the late answer
  await new Promise((res) => setTimeout(res, 10));
  assert.equal(only(r.sql)["state"], "owed", "a late answer is dropped");
  r.repo.holdRevokes = false;
  r.clock.advance(1_000);
  await alarm(r);
  assert.equal(rows(r.sql).length, 0);
});

test("(9) a completion that cannot commit counts as a failure, with backoff", async () => {
  const r = room();
  r.repo.plans = [(t) => ({ id: t.id, scope: t.scope, expiresAt: new Date(t.expiresAt).toISOString() })];
  await assert.rejects(r.ledger.mint("a", "write", () => 86_400));
  r.sql.all("CREATE TRIGGER no_delete BEFORE DELETE ON artroom_mint BEGIN SELECT RAISE(ABORT, 'storage failure'); END");
  await alarm(r);
  const rec = only(r.sql);
  assert.equal(rec["state"], "owed");
  assert.equal(rec["backoff"], 1_000);
  assert.match(String(rec["last_error"]), /did not commit/);
  assert.equal(r.ledger.duties().owed, 1);
  r.sql.all("DROP TRIGGER no_delete");
  r.clock.advance(1_000);
  await alarm(r);
  assert.equal(rows(r.sql).length, 0);
  assert.equal(r.ledger.duties().owed, 0);
});

test("(9) a release whose revocation fails or times out is owed, not swallowed, due in 1 s; a late answer is dropped", async () => {
  const r = room({ waitMs: 10 });
  const a = await r.ledger.mint("a", "write", ttl60);
  r.repo.revokeDown = true;
  await a.release();
  let rec = only(r.sql);
  assert.deepEqual([rec["state"], rec["due"], rec["backoff"]], ["owed", r.clock.t + 1_000, 1_000]);
  assert.ok(r.alarm !== null && r.alarm <= r.clock.t + 1_000, "a wake-up no later than its due time");
  r.repo.revokeDown = false;
  r.clock.advance(1_000);
  await alarm(r);
  assert.equal(rows(r.sql).length, 0);

  const b = await r.ledger.mint("b", "write", ttl60);
  r.repo.holdRevokes = true;
  await b.release();
  rec = only(r.sql);
  assert.equal(rec["state"], "owed");
  r.repo.heldRevokes[0]!.gate.resolve();
  await new Promise((res) => setTimeout(res, 10));
  assert.equal(only(r.sql)["state"], "owed");
});

test("(9) at most 20 records a pass, earliest due first, then by row ID", async () => {
  const r = room();
  r.repo.plans = Array.from({ length: 21 }, () => (t: Tok) => ({ id: t.id, scope: t.scope, expiresAt: new Date(t.expiresAt).toISOString() }));
  for (let i = 0; i < 21; i++) {
    await assert.rejects(r.ledger.mint(`m${i + 1}`, "write", () => 86_400));
    r.clock.advance(10);
  }
  // The first record's revocation fails once, so its due time passes the 21st's.
  const failFirst = r.repo.revokeToken.bind(r.repo);
  let failed = false;
  r.repo.revokeToken = async (id: string) => {
    if (id === "tok_1" && !failed) {
      failed = true;
      r.repo.revokes.push(id);
      throw internal();
    }
    return failFirst(id);
  };
  await alarm(r);
  assert.deepEqual(r.repo.revokes, Array.from({ length: 20 }, (_, i) => `tok_${i + 1}`), "the 20 earliest");
  assert.deepEqual(rows(r.sql).map((x) => x["token"]), ["tok_1", "tok_21"]);
  r.clock.advance(1_000);
  await alarm(r);
  assert.deepEqual(r.repo.revokes.slice(20), ["tok_21", "tok_1"], "earliest due first, not lowest row ID");
  assert.equal(rows(r.sql).length, 0);
});

test("(9) one pass at a time: while a revocation waits on its answer, no second pass starts, and the owed records are not due before that attempt's timeout", async () => {
  const r = room({ waitMs: 5_000 });
  r.repo.plans = Array.from({ length: 2 }, () => (t: Tok) => ({ id: t.id, scope: t.scope, expiresAt: new Date(t.expiresAt).toISOString() }));
  await assert.rejects(r.ledger.mint("a", "write", () => 86_400));
  await assert.rejects(r.ledger.mint("b", "write", () => 86_400));
  r.repo.holdRevokes = true;
  await r.ledger.reconcile();
  await until(() => r.repo.heldRevokes.length === 1, "the first revocation");
  const started = r.clock.t;
  await r.ledger.reconcile();
  await r.ledger.reconcile();
  assert.equal(r.repo.revokes.length, 1, "no second pass");
  assert.equal(r.ledger.nextDue(), started + 5_000, "not eligible before the attempt's timeout");
  r.repo.holdRevokes = false;
  r.repo.heldRevokes[0]!.gate.resolve();
  await r.ledger.idle();
  assert.deepEqual(r.repo.revokes, ["tok_1", "tok_2"]);
  assert.equal(rows(r.sql).length, 0);
});

// ------------------------------------------------------------------ (10)

/**
 * node:sqlite that counts rows read (returned) and written (per table), and
 * records every statement whose query plan scans the ledger's records table
 * rather than searching an index.
 */
function countingSql() {
  const inner = nodeSql();
  const stats = { on: false, read: 0, written: new Map<string, number>(), scans: new Set<string>(), countWrites: 0 };
  const sql: Sql = {
    transaction: (fn) => inner.transaction(fn),
    all(query, ...bindings) {
      const out = inner.all(query, ...bindings);
      if (!stats.on) return out;
      const w = /^\s*(?:INSERT INTO|UPDATE|DELETE FROM)\s+(\w+)/i.exec(query);
      if (/UPDATE artroom_mint_summary SET owed/.test(query)) stats.countWrites++;
      if (w) {
        const n = /RETURNING/i.test(query) ? out.length : Number(inner.db.prepare("SELECT changes() AS n").get()?.["n"]);
        stats.written.set(w[1]!, (stats.written.get(w[1]!) ?? 0) + n);
      } else stats.read += out.length;
      if (/^\s*(SELECT|UPDATE|DELETE)/i.test(query)) {
        for (const p of inner.db.prepare(`EXPLAIN QUERY PLAN ${query}`).all(...bindings)) {
          if (/^SCAN artroom_mint\b/.test(String((p as SqlRow)["detail"]))) stats.scans.add(query);
        }
      }
      return out;
    },
  };
  const reset = () => {
    stats.read = 0;
    stats.written.clear();
    stats.countWrites = 0;
  };
  return { sql, stats, reset };
}

test("(10) scale: 2,000 kept unknown records, 1,000 known IDs and new unknowns every turn; each turn's work is bounded by the batch, the page and the listing", async () => {
  const c = countingSql();
  const r = room({ sql: c.sql, waitMs: 2_000 });
  // 890 tokens other Room records hold.
  for (let i = 0; i < 890; i++) r.known.add(r.repo.foreign().id);
  // 2,000 unknown records: creates whose outcome was lost. More than a pass, a page or a listing may touch.
  r.repo.defaultPlan = "drop";
  for (let i = 0; i < 2_000; i++) await assert.rejects(r.ledger.mint(`bulk:${i}`, "read", ttl60));
  // A backlog of 100 owed records, all due at once, in due order: the other 100 known IDs. Then 10 more, due
  // earliest, whose readable expiry will have passed.
  for (let i = 0; i < 10; i++) {
    r.repo.plans = [idOnly];
    await assert.rejects(r.ledger.mint(`expiring:${i}`, "write", ttl60));
  }
  r.clock.advance(10);
  for (let i = 0; i < 100; i++) {
    r.repo.plans = [idOnly];
    await assert.rejects(r.ledger.mint(`owed:${i}`, "write", () => 86_400));
    r.clock.advance(10);
  }
  const owedIds = r.sql.all("SELECT token FROM artroom_mint WHERE state = 'owed' AND purpose LIKE 'owed:%' ORDER BY due, id").map((x) => String(x["token"]));
  assert.equal(owedIds.length, 100);
  assert.equal(r.ledger.duties().owed, 110);
  assert.equal(r.ledger.duties().unknown, 2_000);
  r.clock.advance(61_000);

  c.stats.on = true;
  const observations: number[] = [];
  let passes = 0;
  for (let turn = 0; turn < 40; turn++) {
    // A new unknown record arrives.
    await assert.rejects(r.ledger.mint(`turn:${turn}`, "read", ttl60));
    const next = r.ledger.nextDue();
    assert.ok(next !== null && next > r.clock.t, "the next wake-up is always in the future");
    r.clock.t = next;
    c.reset();
    const lists = r.repo.lists;
    const known = r.knownCalls;
    const revokes = r.repo.revokes.length;
    const seenAt = r.ledger.duties().observation.at;
    c.reset();
    await alarm(r);
    const s = c.stats;
    assert.ok(r.repo.lists - lists <= 1, "at most one listTokens()");
    assert.ok(r.knownCalls - known <= 1_000, "at most one lookup per listed token");
    assert.ok((s.written.get("artroom_mint") ?? 0) <= 20, `at most 20 record writes, not ${s.written.get("artroom_mint")}`);
    assert.ok((s.written.get("artroom_mint_summary") ?? 0) <= 3, "at most one summary write each: takeover, observation, the pass");
    assert.ok(s.countWrites <= 1, `one count write a pass, not ${s.countWrites}`);
    assert.ok(s.read <= 20 + 1_000 + 20, `rows read bounded by the batch and the listing, not ${s.read}`);
    if (r.repo.lists > lists) {
      observations.push(r.clock.t);
      assert.notEqual(r.ledger.duties().observation.at, seenAt);
      assert.equal(r.ledger.duties().observation.unaccounted, 0, "every listed token is known: 890 by other records, the rest by the ledger's own");
    }
    const revoked = r.repo.revokes.slice(revokes);
    if (turn === 0) {
      assert.deepEqual(revoked, [], "the first pass settles the 10 expired records only, with no call");
      assert.equal(r.ledger.duties().owed, 100);
      assert.equal(r.ledger.nextDue(), r.clock.t + 1_000);
    } else if (revoked.length > 0) {
      assert.deepEqual(revoked, owedIds.slice(passes * 20, passes * 20 + 20), "each pass takes the next 20, earliest due first");
      passes++;
      if (passes < 5) {
        assert.equal(r.ledger.nextDue(), r.clock.t + 1_000, "exactly 1 s ahead while any remain overdue");
        assert.equal(r.wakes[r.wakes.length - 1], r.clock.t + 1_000, "the pass stores that wake-up when it ends");
      }
    } else if (r.repo.lists > lists) {
      assert.equal(s.written.get("artroom_mint") ?? 0, 0, "an observation writes no record");
    }
  }
  assert.equal(passes, 5);
  assert.equal(r.ledger.duties().owed, 0);
  assert.ok(observations.length >= 5, `observed ${observations.length} times`);
  for (let i = 1; i < observations.length; i++) assert.ok(observations[i]! - observations[i - 1]! >= 60_000, "never sooner than 1 min after the last");
  assert.equal(r.ledger.duties().observation.unaccounted, 0, "1,000 listed, all known");
  assert.deepEqual([...c.stats.scans], [], "no statement scans the records");

  // Paging reaches every record once, each page bounded; the counts are exact.
  c.reset();
  const ids = new Set<number>();
  let after: number | null = 0;
  let pages = 0;
  while (after !== null) {
    const before = c.stats.read;
    const page = r.ledger.duties({ after, limit: 1_000 });
    assert.ok(c.stats.read - before <= 1_002);
    for (const d of page.records) {
      assert.ok(!ids.has(d.id), "once");
      ids.add(d.id);
    }
    after = page.next;
    pages++;
  }
  c.stats.on = false;
  const total = Number(r.sql.all("SELECT COUNT(*) AS n FROM artroom_mint")[0]!["n"]);
  assert.equal(ids.size, total);
  assert.equal(pages, Math.ceil(total / 1_000));
  const count = (state: string) => Number(r.sql.all("SELECT COUNT(*) AS n FROM artroom_mint WHERE state = ?", state)[0]!["n"]);
  assert.equal(r.ledger.duties().unknown, count("unknown"));
  assert.equal(r.ledger.duties().unknown, 2_040);
  assert.equal(r.ledger.duties().owed, count("owed"));
  assert.deepEqual([...c.stats.scans], []);
});

test("(10) a listing over 1,000 records counts nothing and settles nothing; an unreadable listing likewise", async () => {
  const r = room();
  for (let i = 0; i <= MINT_LISTING_MAX; i++) r.repo.foreign();
  r.repo.plans = ["lose"];
  await assert.rejects(r.ledger.mint("a", "read", ttl60));
  await alarm(r);
  const o = r.ledger.duties().observation;
  assert.match(String(o.result), /over 1000; nothing counted/);
  assert.equal(o.unaccounted, null);
  assert.equal(r.knownCalls, 0, "no lookups");
  assert.equal(only(r.sql)["state"], "unknown");
  r.repo.listTokens = async () => {
    throw internal();
  };
  r.clock.t = Number(o.nextAt);
  await alarm(r);
  assert.match(String(r.ledger.duties().observation.result), /no inventory/);
  assert.equal(only(r.sql)["state"], "unknown");
});

test("(10) the observation schedule doubles from 1 min to 6 h; a new unknown brings it forward, never sooner than 1 min after the last", async () => {
  const r = room();
  r.repo.defaultPlan = "lose";
  await assert.rejects(r.ledger.mint("a", "read", ttl60));
  const gaps: number[] = [];
  let last = r.clock.t;
  await alarm(r);
  for (let i = 0; i < 10; i++) {
    r.clock.t = Number(r.ledger.nextDue());
    await alarm(r);
    gaps.push(r.clock.t - last);
    last = r.clock.t;
  }
  assert.deepEqual(gaps.slice(0, 10), [1, 2, 4, 8, 16, 32, 64, 128, 256, 360].map((m) => m * 60_000));
  // A new unknown, 10 s after the last observation: the next is 1 min after it.
  r.clock.advance(10_000);
  await assert.rejects(r.ledger.mint("b", "read", ttl60));
  assert.equal(r.ledger.nextDue(), last + 60_000);
  // New unknowns every second for 110 s: one inventory, at 1 min after the last.
  const lists = r.repo.lists;
  for (let i = 0; i < 110; i++) {
    await assert.rejects(r.ledger.mint(`c${i}`, "read", ttl60));
    await alarm(r);
    if (r.repo.lists > lists) assert.equal(r.ledger.duties().observation.at, last + 60_000);
    r.clock.advance(1_000);
  }
  assert.equal(r.repo.lists - lists, 1, "one inventory in that minute, whatever the rate of new unknowns");
});

// ------------------------------------------------- checker's early findings on 658d10af

test("(checker 1) a repository lookup that never answers: mint sends nothing and writes no record, within the wait", async () => {
  const r = room({ waitMs: 10 });
  r.lookupHangs = true;
  await assert.rejects(r.ledger.mint("publish:op:1", "write", ttl60), /repository was not reached within 10 ms/);
  assert.equal(r.repo.creates.length, 0);
  assert.equal(rows(r.sql).length, 0);
  assert.equal(r.wakes.length, 0);
});

test("(checker 1) a repository lookup that never answers: the observation ends within the wait, records its result and next time, and settles nothing", async () => {
  const r = room({ waitMs: 10 });
  r.repo.plans = ["lose"];
  await assert.rejects(r.ledger.mint("a", "read", ttl60));
  r.lookupHangs = true;
  await alarm(r);
  const o = r.ledger.duties().observation;
  assert.equal(o.at, r.clock.t);
  assert.match(String(o.result), /repository was not reached/);
  assert.equal(o.unaccounted, null);
  assert.equal(o.nextAt, r.clock.t + 60_000);
  assert.equal(r.repo.lists, 0);
  assert.equal(only(r.sql)["state"], "unknown");
});

test("(checker 1) a repository lookup that never answers: the revocation pass ends within the wait; each record takes its backoff, stays owed, and is revoked later", async () => {
  const r = room({ waitMs: 10 });
  r.repo.plans = [(t) => ({ id: t.id, scope: t.scope, expiresAt: new Date(t.expiresAt).toISOString() })];
  await assert.rejects(r.ledger.mint("a", "write", () => 86_400));
  r.lookupHangs = true;
  await alarm(r);
  const rec = only(r.sql);
  assert.deepEqual([rec["state"], rec["backoff"], rec["due"]], ["owed", 1_000, r.clock.t + 1_000]);
  assert.match(String(rec["last_error"]), /repository was not reached/);
  assert.equal(r.repo.revokes.length, 0);
  r.clock.advance(100);
  assert.equal(r.ledger.nextDue(), r.clock.t + 900, "its backoff, not an overdue continuation");
  r.lookupHangs = false;
  r.clock.advance(900);
  await alarm(r);
  assert.deepEqual(r.repo.revokes, ["tok_1"]);
  assert.equal(rows(r.sql).length, 0);
});

/** Neither the stored rows, the summary nor duties() contain `secret`. */
function assertNoSecret(r: ReturnType<typeof room>, secret: string): void {
  const stored = JSON.stringify([rows(r.sql), summary(r.sql), r.ledger.duties()]);
  assert.equal(stored.includes(secret), false, `stored text contains ${secret}`);
}

/** An error that carries `secret` everywhere a thrower can put text: message, name and code. */
function leaky(secret: string): Error {
  return Object.assign(new Error(`Authorization: Bearer ${secret}`), { name: secret, code: secret, status: secret });
}

test("(checker 1) a repository lookup that answers only after the wait: the pass records its backoff and ends, a new pass can start, and the late lookup does nothing", async () => {
  const r = room({ waitMs: 10 });
  r.repo.plans = [(t) => ({ id: t.id, scope: t.scope, expiresAt: new Date(t.expiresAt).toISOString() })];
  await assert.rejects(r.ledger.mint("a", "write", () => 86_400));
  const late = deferred<void>();
  r.lookupGate = late;
  await alarm(r); // ends within the wait, though the lookup is still out
  let rec = only(r.sql);
  assert.deepEqual([rec["state"], rec["backoff"], rec["last_error"]], ["owed", 1_000, "the repository was not reached in time"]);
  assert.equal(r.ledger.nextDue(), Number(rec["due"]), "its backoff, not the pass's timeout or a continuation");
  // The pass's flag is released: the next pass starts while the first lookup is still out.
  const second = deferred<void>();
  r.lookupGate = second;
  r.clock.t = Number(rec["due"]);
  await alarm(r);
  assert.equal(r.lookups, 3, "the mint's lookup, then one per pass");
  rec = only(r.sql);
  assert.equal(rec["backoff"], 2_000);
  // The late lookups answer: they start no revocation and change nothing.
  const before = JSON.stringify(rows(r.sql));
  late.resolve();
  second.resolve();
  await new Promise((res) => setTimeout(res, 20));
  await r.ledger.idle();
  assert.equal(r.repo.revokes.length, 0);
  assert.equal(JSON.stringify(rows(r.sql)), before);
});

test("(checker 1) a held lookup never delays a record whose readable expiry has passed: it is settled before the repository is asked for", async () => {
  const r = room({ waitMs: 2_000 });
  r.repo.plans = [idOnly, idOnly];
  await assert.rejects(r.ledger.mint("expiring", "write", ttl60));
  await assert.rejects(r.ledger.mint("lasting", "write", () => 86_400));
  r.clock.advance(61_000);
  r.lookupHangs = true;
  void r.ledger.reconcile();
  await new Promise((res) => setImmediate(res));
  assert.deepEqual(rows(r.sql).map((x) => x["purpose"]), ["lasting"], "settled at once, while the lookup is held");
  assert.equal(r.ledger.duties().owed, 1);
});

test("(checker 1) an observation lookup that answers only after the wait: the result and next time are recorded, the flag is released, and the late lookup does nothing", async () => {
  const r = room({ waitMs: 10 });
  r.repo.plans = ["lose"];
  await assert.rejects(r.ledger.mint("a", "read", ttl60));
  const late = deferred<void>();
  r.lookupGate = late;
  await alarm(r);
  const o = r.ledger.duties().observation;
  assert.deepEqual([o.at, o.result, o.nextAt], [r.clock.t, "no inventory: the repository was not reached in time", r.clock.t + 60_000]);
  r.clock.t = Number(o.nextAt);
  r.lookupGate = null;
  await alarm(r);
  assert.equal(r.repo.lists, 1, "the next observation runs: the flag was released");
  late.resolve();
  await new Promise((res) => setTimeout(res, 20));
  assert.equal(r.repo.lists, 1, "the late lookup lists nothing");
  assert.equal(only(r.sql)["state"], "unknown");
});

test("(checker 2) the checker's control: an accepted token's text echoed in an Authorization: Bearer revocation error is neither stored nor shown", async () => {
  const r = room();
  const secret = "syntheticOpaqueCredentialOnly";
  r.repo.plans = [(t) => ({ ...(full(t) as object), plaintext: secret })];
  const t = await r.ledger.mint("a", "read", ttl60);
  assert.equal(t.plaintext, secret);
  r.repo.revokeError = () => new Error(`Authorization: Bearer ${secret}`);
  await t.release();
  assert.equal(only(r.sql)["state"], "owed");
  assert.equal(only(r.sql)["last_error"], "revocation failed: Error");
  assertNoSecret(r, secret);
});

test("(checker 2) every error sink stores safe metadata only: creation, release, the pass, repository lookups and the listing", async () => {
  const r = room();
  const secret = "k9"; // short, opaque, and in the message, the name, the code and the status
  r.repo.plans = [(t) => ({ ...(full(t) as object), plaintext: secret })];
  const held = await r.ledger.mint("held", "read", () => 86_400);
  // Creation.
  r.repo.createToken = async () => {
    throw leaky(secret);
  };
  await assert.rejects(r.ledger.mint("create", "read", ttl60));
  assert.equal(r.sql.all("SELECT last_error FROM artroom_mint WHERE purpose = 'create'")[0]!["last_error"], "create failed: an error of another kind");
  // Release.
  r.repo.revokeError = () => leaky(secret);
  await held.release();
  assert.equal(r.sql.all("SELECT last_error FROM artroom_mint WHERE purpose = 'held'")[0]!["last_error"], "revocation failed: an error of another kind");
  // The pass's revocation, and the listing, on the same alarm.
  r.repo.listTokens = async () => {
    throw leaky(secret);
  };
  r.clock.advance(1_000);
  await alarm(r);
  assert.equal(r.sql.all("SELECT last_error FROM artroom_mint WHERE purpose = 'held'")[0]!["last_error"], "revocation failed: an error of another kind");
  assert.equal(r.ledger.duties().observation.result, "no inventory: the listing failed: an error of another kind");
  assertNoSecret(r, secret);
  // Repository lookups, in the pass and the observation, on a new host.
  const looked = new MintLedger({
    sql: r.sql,
    repo: async () => {
      throw leaky(secret);
    },
    now: r.clock.now,
    wake: async () => {},
    known: () => false,
    waitMs: 2_000,
  });
  r.clock.advance(3_600_000);
  await looked.reconcile();
  await looked.idle();
  assert.equal(r.sql.all("SELECT last_error FROM artroom_mint WHERE purpose = 'held'")[0]!["last_error"], "repository lookup failed: an error of another kind");
  assert.equal(looked.duties().observation.result, "no inventory: repository lookup failed: an error of another kind");
  assertNoSecret(r, secret);
  assert.equal(JSON.stringify(looked.duties()).includes(secret), false);
});

test("(checker 2) errorNote keeps only the stage, an allowed name, a known Artifacts code and integer codes", () => {
  const e = Object.assign(new TypeError("Bearer abc art_v1_xyz"), { code: "INTERNAL_ERROR", numericCode: 10400, status: 503 });
  assert.equal(errorNote("revocation failed", e), "revocation failed: TypeError INTERNAL_ERROR (10400) status 503");
  assert.equal(errorNote("create failed", Object.assign(new Error("x"), { code: "SOMETHING_NEW", numericCode: 1.5, status: 9_999 })), "create failed: Error");
  assert.equal(errorNote("create failed", "a thrown string with a secret"), "create failed: not an error");
  assert.equal(errorNote("create failed", Object.assign(new Error("x"), { name: "ArtifactsError" })), "create failed: an error of another kind");
});

// ------------------------------------------------- the checker's extra controls on 19f6e389

/** Counts the summary writes that change the counts (`UPDATE artroom_mint_summary SET owed …`). */
function countWrites(sql: Sql): { n: number } {
  const c = { n: 0 };
  const all = sql.all.bind(sql);
  sql.all = (q, ...b) => {
    if (/UPDATE artroom_mint_summary SET owed/.test(q)) c.n++;
    return all(q, ...b);
  };
  return c;
}

test("(checker 3) a readable expiry that passes while the lookup is held is settled, never revoked: when the lookup answers, and when it times out", async () => {
  for (const answers of [true, false]) {
    const r = room({ waitMs: 40 });
    r.repo.plans = [idOnly];
    await assert.rejects(r.ledger.mint("a", "write", ttl60));
    const gate = deferred<void>();
    r.lookupGate = gate;
    const run = r.ledger.reconcile();
    await until(() => r.lookups === 2, "the pass's lookup");
    r.clock.advance(61_000); // the expiry passes during the hold
    if (answers) gate.resolve();
    await run;
    await r.ledger.idle();
    assert.equal(r.repo.revokes.length, 0, `no revocation (lookup ${answers ? "answered" : "timed out"})`);
    assert.equal(rows(r.sql).length, 0, "settled at its expiry");
    assert.equal(r.ledger.duties().owed, 0);
    gate.resolve();
  }
});

test("(checker 3) a mixed due batch, expired and revocable records: one summary write per pass, every record settled within two passes", async () => {
  const r = room();
  r.repo.plans = [idOnly, idOnly, idOnly, idOnly];
  await assert.rejects(r.ledger.mint("expiring-1", "write", ttl60));
  await assert.rejects(r.ledger.mint("lasting-1", "write", () => 86_400));
  await assert.rejects(r.ledger.mint("expiring-2", "write", ttl60));
  await assert.rejects(r.ledger.mint("lasting-2", "write", () => 86_400));
  r.clock.advance(61_000);
  const writes = countWrites(r.sql);
  // Pass 1: the expired records only, with no call and no wait.
  await alarm(r);
  assert.equal(writes.n, 1);
  assert.equal(r.repo.revokes.length, 0);
  assert.deepEqual(rows(r.sql).map((x) => x["purpose"]), ["lasting-1", "lasting-2"]);
  assert.equal(r.ledger.duties().owed, 2);
  assert.equal(r.ledger.nextDue(), r.clock.t + 1_000, "the rest continue 1 s later");
  // Pass 2: the revocations.
  r.clock.t = Number(r.ledger.nextDue());
  await alarm(r);
  assert.equal(writes.n, 2);
  assert.deepEqual(r.repo.revokes, ["tok_2", "tok_4"]);
  assert.equal(rows(r.sql).length, 0);
  assert.equal(r.ledger.duties().owed, 0);
  assert.equal(r.ledger.nextDue(), null);
});

test("(checker 3) a record that expires during a pass's revocations is settled in that pass's one summary write", async () => {
  const r = room({ waitMs: 2_000 });
  r.repo.plans = [idOnly, idOnly];
  await assert.rejects(r.ledger.mint("lasting", "write", () => 86_400));
  await assert.rejects(r.ledger.mint("expiring", "write", ttl60));
  const writes = countWrites(r.sql);
  r.repo.holdRevokes = true;
  const run = r.ledger.reconcile();
  await until(() => r.repo.heldRevokes.length === 1, "the first revocation");
  r.clock.advance(61_000); // the second record's expiry passes while the first revocation waits
  r.repo.heldRevokes[0]!.gate.resolve();
  await run;
  await r.ledger.idle();
  assert.deepEqual(r.repo.revokes, ["tok_1"], "the expired record is not revoked");
  assert.equal(rows(r.sql).length, 0);
  assert.equal(writes.n, 1);
});

// ------------------------------------------------- review 6a979799 (P3): one deadline per observation

test("(checker 4) an observation's lookup and listing share one deadline: a slow lookup leaves less time for the listing, and the observation ends by the deadline", async () => {
  const r = room({ waitMs: 300 });
  r.repo.plans = ["lose"];
  await assert.rejects(r.ledger.mint("a", "read", ttl60));
  const gate = deferred<void>();
  r.lookupGate = gate;
  r.repo.listTokens = () => new Promise(() => {}); // the listing never answers
  // The waits the ledger asks for, and the clock it reads: the lookup answers 280 ms into the 300.
  const realNow = Date.now;
  const realTimeout = globalThis.setTimeout;
  const asked: number[] = [];
  try {
    globalThis.setTimeout = ((fn: () => void, ms?: number) => {
      asked.push(ms ?? 0);
      return realTimeout(fn, ms);
    }) as typeof setTimeout;
    const run = r.ledger.reconcile();
    await until(() => r.lookups === 2, "the observation's lookup");
    Date.now = () => realNow() + 280;
    gate.resolve();
    await run;
  } finally {
    Date.now = realNow;
    globalThis.setTimeout = realTimeout;
  }
  assert.equal(asked.length, 2, "one wait for the lookup, one for the listing");
  assert.equal(asked[0], 300);
  assert.ok(asked[1]! > 0 && asked[1]! <= 20, `the listing waits for what is left of the deadline (about 20 ms), not a full 300 ms: ${asked[1]} ms`);
  assert.equal(r.ledger.duties().observation.result, "no inventory: the listing did not answer in time");
  assert.equal(only(r.sql)["state"], "unknown");
});

test("(checker 4) a lookup that uses the whole deadline leaves no time for the listing: it is not called", async () => {
  const r = room({ waitMs: 300 });
  r.repo.plans = ["lose"];
  await assert.rejects(r.ledger.mint("a", "read", ttl60));
  const gate = deferred<void>();
  r.lookupGate = gate;
  const realNow = Date.now;
  try {
    const run = r.ledger.reconcile();
    await until(() => r.lookups === 2, "the observation's lookup");
    const skew = 301;
    Date.now = () => realNow() + skew; // the deadline passes as the lookup answers
    gate.resolve();
    await run;
  } finally {
    Date.now = realNow;
  }
  assert.equal(r.repo.lists, 0, "no listing is started");
  assert.equal(r.ledger.duties().observation.result, "no inventory: no time was left for the listing");
});
