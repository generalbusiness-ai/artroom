// Snapshot repositories (R-CARRY-16): one new repository per snapshot commit,
// one read token per job bounded by its deadline, and durable retirement,
// against a fake Artifacts namespace with the binding's shape.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_RETAIN_MS, PREPARE_WINDOW_MS, SnapshotRepos, type SnapshotWriter } from "../src/snapshot/repos.ts";
import type { ArtifactsNamespace, MintedToken, RepoHandle, TokenInfo } from "../src/artifacts.ts";
import type { Sql } from "../src/sql.ts";
import { WITHHELD, scrubLegacyErrors } from "../src/safe-errors.ts";
import { Clock, echoNote, echoing, everyRow, noEcho, nodeSql } from "./support.ts";

class ArtifactsError extends Error {
  readonly code: string;
  readonly numericCode: number;
  constructor(code: string, numericCode: number) {
    super(`${code} (${numericCode})`);
    this.code = code;
    this.numericCode = numericCode;
  }
}

const outage = () => new ArtifactsError("INTERNAL_ERROR", 10400);

interface Tok {
  id: string;
  plaintext: string;
  scope: "read" | "write";
  state: TokenInfo["state"];
  expiresAt: number;
}

class Repo implements RepoHandle {
  readonly tokens: Tok[] = [];
  readonly ns: Fake;
  readonly name: string;
  constructor(ns: Fake, name: string) {
    this.ns = ns;
    this.name = name;
  }
  mint(scope: "read" | "write", ttl: number): Tok {
    const id = `tid_${++this.ns.counter}`;
    const t: Tok = { id, plaintext: `art_v1_${id}${"x".repeat(24)}?expires=${ttl}`, scope, state: "active", expiresAt: this.ns.clock.t + ttl * 1000 + this.ns.overlongMs };
    this.tokens.push(t);
    return t;
  }
  async createToken(scope: "write" | "read" = "write", ttl = 86400): Promise<MintedToken> {
    if (ttl < 60) throw new ArtifactsError("INVALID_TTL", 10003);
    const t = this.mint(scope, ttl);
    return { id: t.id, plaintext: t.plaintext, scope: t.scope, expiresAt: new Date(t.expiresAt).toISOString() };
  }
  async revokeToken(tokenOrId: string) {
    if (this.ns.down.revoke) throw outage();
    if (this.ns.revokeFailures > 0) {
      this.ns.revokeFailures--;
      throw outage();
    }
    const t = this.tokens.find((x) => x.id === tokenOrId || x.plaintext === tokenOrId);
    if (!t || t.state !== "active") return false;
    t.state = "revoked";
    return true;
  }
  async listTokens() {
    if (this.ns.down.list) throw outage();
    const tokens = this.tokens.map((t) => ({ id: t.id, scope: t.scope, state: t.state === "active" && t.expiresAt <= this.ns.clock.t ? ("expired" as const) : t.state, expiresAt: new Date(t.expiresAt).toISOString() }));
    if (this.ns.listingFault) return this.ns.listingFault(tokens) as never;
    return { tokens, total: tokens.length };
  }
  async info() {
    return { name: this.name, remote: `https://acct.artifacts.cloudflare.net/git/ns/${this.name}.git`, source: null };
  }
  async fork(): Promise<never> {
    throw new Error("not used");
  }
  async log() {
    return [];
  }
  async readTree() {
    return null;
  }
  async readCommit() {
    return null;
  }
  active(): Tok[] {
    return this.tokens.filter((t) => t.state === "active" && t.expiresAt > this.ns.clock.t);
  }
}

class Fake implements ArtifactsNamespace {
  counter = 0;
  overlongMs = 0;
  readonly repos = new Map<string, Repo>();
  readonly created: string[] = [];
  readonly deleted: string[] = [];
  /** Tokens of repositories that were deleted: deletion removes them all. */
  readonly gone: Tok[] = [];
  readonly down = { create: false, delete: false, revoke: false, list: false, get: false };
  /** The next this many revocations fail without an answer. */
  revokeFailures = 0;
  /** While set, every listing answers this instead of the complete one (plan 001). */
  listingFault: ((tokens: TokenInfo[]) => unknown) | null = null;
  readonly clock: Clock;
  constructor(clock: Clock) {
    this.clock = clock;
  }
  async get(name: string) {
    if (this.down.get) throw outage();
    const r = this.repos.get(name);
    if (!r) throw new ArtifactsError("NOT_FOUND", 10404);
    return r;
  }
  async create(name: string) {
    if (this.down.create) throw outage();
    if (this.repos.has(name)) throw new ArtifactsError("ALREADY_EXISTS", 10409);
    const r = new Repo(this, name);
    this.repos.set(name, r);
    this.created.push(name);
    const t = r.mint("write", 86400);
    return { name, remote: (await r.info()).remote, token: t.plaintext };
  }
  async delete(name: string) {
    if (this.down.delete) throw outage();
    const r = this.repos.get(name);
    if (!r) return false;
    for (const t of r.tokens) if (t.state === "active") this.gone.push(t);
    this.repos.delete(name);
    this.deleted.push(name);
    return true;
  }
}

const C1 = "1".repeat(40);
const C2 = "2".repeat(40);
const C3 = "3".repeat(40);

function setup(retainMs = 0) {
  const clock = new Clock();
  const ns = new Fake(clock);
  const snaps = new SnapshotRepos({ sql: nodeSql(), artifacts: ns, prefix: "canon", retainMs, now: clock.now, sleep: async () => {} });
  const writes: { name: string; commit: string }[] = [];
  /** The publisher: writes `commit` (or what `wrong` says) into the store it is given. */
  const writer =
    (commit: string, wrong?: string): SnapshotWriter =>
    async (store) => {
      writes.push({ name: store.name, commit });
      return wrong ?? commit;
    };
  const deadline = () => clock.t + 15 * 60_000;
  return { clock, ns, snaps, writes, writer, deadline };
}

test("one repository per snapshot commit: the same commit is reused with a token per job; another commit gets its own repository", async () => {
  const { ns, snaps, writes, writer, deadline } = setup();
  const a = await snaps.prepare(C1, writer(C1));
  assert.match(a.name, new RegExp(`^canon--snap-${C1}-\\d+$`));
  const again = await snaps.prepare(C1, writer(C1));
  assert.deepEqual(again, a);
  assert.deepEqual(writes, [{ name: a.name, commit: C1 }], "written once, into its own repository");
  // Nothing can write to it once it is ready: the creation token is gone.
  assert.deepEqual(ns.repos.get(a.name)!.active(), []);
  const b = await snaps.prepare(C2, writer(C2));
  assert.notEqual(b.name, a.name);
  assert.deepEqual(ns.created, [a.name, b.name]);
  assert.deepEqual(writes.map((w) => w.name), [a.name, b.name], "the second snapshot never went into the first one's repository");
  // Two jobs on one snapshot: one repository, two tokens, each on that repository only.
  const t1 = await snaps.mint(C1, "job_1", deadline());
  const t2 = await snaps.mint(C1, "job_2", deadline());
  const t3 = await snaps.mint(C2, "job_3", deadline());
  assert.notEqual(t1.id, t2.id);
  assert.deepEqual([t1.remote, t2.remote, t3.remote], [a.remote, a.remote, b.remote]);
  assert.deepEqual(ns.repos.get(a.name)!.active().map((t) => [t.id, t.scope]), [[t1.id, "read"], [t2.id, "read"]]);
  assert.deepEqual(ns.repos.get(b.name)!.active().map((t) => t.id), [t3.id]);
});

test("a job's token is read-only and expires by the job's deadline; one that would outlive the job is revoked and refused", async () => {
  const { clock, ns, snaps, writer } = setup();
  const r = await snaps.prepare(C1, writer(C1));
  const deadline = clock.t + 10 * 60_000;
  const t = await snaps.mint(C1, "job_1", deadline);
  assert.ok(t.expiresAt <= deadline, "bounded by the job");
  const held = ns.repos.get(r.name)!.tokens.find((x) => x.id === t.id)!;
  assert.equal(held.scope, "read");
  assert.ok(held.expiresAt <= deadline);
  // Artifacts answers with a longer life than asked for: refused, and revoked.
  ns.overlongMs = 3_600_000;
  await assert.rejects(snaps.mint(C1, "job_2", deadline), /outlive the job/);
  ns.overlongMs = 0;
  assert.deepEqual(ns.repos.get(r.name)!.active().map((x) => x.id), [t.id]);
  // A deadline too close for Artifacts' shortest token.
  await assert.rejects(snaps.mint(C1, "job_3", clock.t + 30_000), /too soon/);
});

test("retirement: each job's token is revoked when it ends, and the repository with every token is deleted when the last one ends", async () => {
  const { ns, snaps, writer, deadline } = setup();
  const r = await snaps.prepare(C1, writer(C1));
  const a = await snaps.mint(C1, "job_a", deadline());
  const b = await snaps.mint(C1, "job_b", deadline());
  assert.equal(await snaps.end(C1, "job_a"), 1, "the repository's retirement is still owed");
  const repo = ns.repos.get(r.name)!;
  assert.deepEqual(repo.active().map((t) => t.id), [b.id], "only the ended job's token is revoked");
  assert.equal(await snaps.end(C1, "job_b"), 0);
  assert.equal(ns.repos.has(r.name), false);
  assert.deepEqual(ns.deleted, [r.name]);
  assert.ok(repo.tokens.every((t) => t.state !== "active"), "every token was revoked first");
  assert.equal(snaps.pending(), 0);
  assert.deepEqual(
    snaps.duties().map((d) => [d.kind, d.state]),
    [
      ["create", "done"],
      ["delete", "done"],
      ["revoke", "done"],
      ["revoke", "done"],
    ],
  );
  await assert.rejects(snaps.mint(C1, "job_c", deadline()), /not ready/);
  // The same snapshot later: a new, empty repository.
  const again = await snaps.prepare(C1, writer(C1));
  assert.notEqual(again.name, r.name);
  assert.deepEqual(ns.created, [r.name, again.name]);
  void a;
});

test("retirement during an Artifacts outage stays owed, blocks reuse, and is retried until Artifacts confirms", async () => {
  const { clock, ns, snaps, writer, deadline } = setup();
  const r = await snaps.prepare(C1, writer(C1));
  const t = await snaps.mint(C1, "job_a", deadline());
  ns.down.delete = true;
  ns.down.revoke = true;
  assert.equal(await snaps.end(C1, "job_a"), 2, "the revocation and the deletion are both owed");
  assert.equal(ns.repos.has(r.name), true);
  assert.deepEqual(ns.repos.get(r.name)!.active().map((x) => x.id), [t.id]);
  assert.deepEqual(snaps.duties().filter((d) => d.state === "owed").map((d) => d.kind).sort(), ["delete", "revoke"]);
  assert.ok(snaps.nextDue()! > clock.t, "retried later, with backoff");
  // Nothing is issued against a repository whose retirement is owed. A new preparation gets a new
  // repository, which cannot be made ready while its creation token cannot be revoked.
  await assert.rejects(snaps.mint(C1, "job_b", deadline()), /not ready/);
  await assert.rejects(snaps.prepare(C1, writer(C1)), /INTERNAL_ERROR/);
  assert.equal(ns.created.length, 2);
  clock.advance(60_000);
  await snaps.reconcile();
  assert.ok(snaps.duties().filter((d) => d.state === "owed" && d.name === r.name).every((d) => d.attempts >= 2));
  assert.equal(ns.repos.has(r.name), true);
  // Artifacts recovers.
  ns.down.delete = false;
  ns.down.revoke = false;
  clock.advance(PREPARE_WINDOW_MS);
  assert.equal(await snaps.reconcile(), 0);
  assert.deepEqual([...ns.repos.keys()], []);
  assert.equal(snaps.nextDue(), null);
});

test("an interrupted preparation is deleted, never finished; a repository no job uses is deleted after the preparation window", async () => {
  const { clock, ns, snaps, writes, writer } = setup();
  const crash: SnapshotWriter = async () => {
    throw new Error("the publisher stopped");
  };
  await assert.rejects(snaps.prepare(C1, crash), /publisher stopped/);
  const [name] = ns.created;
  assert.equal(ns.repos.has(name!), true, "the repository was created");
  assert.deepEqual(snaps.duties().map((d) => [d.kind, d.state]), [["create", "done"], ["delete", "owed"]]);
  await assert.rejects(snaps.mint(C1, "job_1", clock.t + 600_000), /not ready/);
  // The next preparation starts again in a new, empty repository; the interrupted one's deletion is due now.
  const next = await snaps.prepare(C1, writer(C1));
  assert.notEqual(next.name, name);
  assert.equal(writes.length, 1);
  await snaps.reconcile();
  assert.deepEqual(ns.deleted, [name]);
  assert.equal(ns.repos.has(next.name), true);
  // A repository no job ever uses is deleted when the preparation window ends.
  const unused = await snaps.prepare(C3, writer(C3));
  clock.advance(PREPARE_WINDOW_MS - 1);
  await snaps.reconcile();
  assert.equal(ns.repos.has(unused.name), true);
  clock.advance(1);
  await snaps.reconcile();
  assert.equal(ns.repos.has(unused.name), false);
});

test("a publisher that writes any other commit: nothing is issued, and the repository is deleted", async () => {
  const { ns, snaps, writer, deadline } = setup();
  await assert.rejects(snaps.prepare(C1, writer(C1, C2)), /not the recorded/);
  assert.equal(ns.repos.size, 0);
  await assert.rejects(snaps.mint(C1, "job_1", deadline()), /not ready/);
});

test("every token on a new repository is revoked before it is ready; if that fails, it is not ready", async () => {
  const { ns, snaps, deadline } = setup();
  // A publisher that leaves another write token behind.
  const leaky: SnapshotWriter = async (store) => {
    ns.repos.get(store.name)!.mint("write", 3600);
    return C1;
  };
  const r = await snaps.prepare(C1, leaky);
  assert.deepEqual(ns.repos.get(r.name)!.active(), []);
  // Revocation fails while preparing another: it stays unready, and no job token is minted for it.
  ns.down.revoke = true;
  await assert.rejects(snaps.prepare(C2, async () => C2));
  await assert.rejects(snaps.mint(C2, "job_1", deadline()), /not ready/);
});

test("a job that never reports its end still bounds the repository: it is deleted once the job's deadline has passed", async () => {
  const { clock, ns, snaps, writer } = setup();
  const r = await snaps.prepare(C1, writer(C1));
  const deadline = clock.t + 20 * 60_000;
  const t = await snaps.mint(C1, "job_lost", deadline);
  clock.advance(t.expiresAt - clock.t - 1);
  await snaps.reconcile();
  assert.equal(ns.repos.has(r.name), true, "kept while the job may still run");
  clock.advance(deadline - clock.t);
  await snaps.reconcile();
  assert.equal(ns.repos.has(r.name), false);
});

// ------------------------------------------------------------------ plan 001: a snapshot is ready only after a complete inventory

const FAR = new Date(2e12).toISOString();
/** Listings that do not account for every token: each proves nothing is absent. */
const INCOMPLETE: readonly (readonly [string, (tokens: TokenInfo[]) => unknown])[] = [
  ["an empty page and a positive total", (t) => ({ tokens: [], total: Math.max(t.length, 1) })],
  ["no total", (t) => ({ tokens: t })],
  ["no list of records", (t) => ({ total: t.length })],
  ["a record with no ID", (t) => ({ tokens: [...t, { scope: "write", state: "active", expiresAt: FAR }], total: t.length + 1 })],
  ["a record with an empty ID", (t) => ({ tokens: [...t, { id: "", scope: "write", state: "active", expiresAt: FAR }], total: t.length + 1 })],
  ["a record of an unknown scope", (t) => ({ tokens: [...t, { id: "tid_odd", scope: "admin", state: "active", expiresAt: FAR }], total: t.length + 1 })],
  ["a record of an unknown state", (t) => ({ tokens: [...t, { id: "tid_odd", scope: "write", state: "live", expiresAt: FAR }], total: t.length + 1 })],
  ["a record with no readable expiry", (t) => ({ tokens: [...t, { id: "tid_odd", scope: "write", state: "active", expiresAt: "soon" }], total: t.length + 1 })],
  ["a record whose expiry is not a timestamp string", (t) => ({ tokens: [...t, { id: "tid_odd", scope: "write", state: "active", expiresAt: 2026 }], total: t.length + 1 })],
];

for (const [label, listing] of INCOMPLETE) {
  test(`plan 001: the creation token's revocation fails and the inventory has ${label}: no snapshot is issued, its deletion stays owed, and a complete inventory recovers`, async () => {
    const { ns, snaps, writer, deadline } = setup();
    ns.repos.set("canon", new Repo(ns, "canon"));
    const canon = ns.repos.get("canon")!.mint("write", 3600); // unrelated: snapshots never touch it
    ns.revokeFailures = 1; // the creation token's revocation by plaintext has no answer
    ns.listingFault = listing;
    await assert.rejects(snaps.prepare(C1, writer(C1)), /incomplete or malformed/);
    const [first] = ns.created;
    assert.equal(ns.repos.get(first!)!.active().length, 1, "the creation write token is still active");
    await assert.rejects(snaps.mint(C1, "job_1", deadline()), /not ready/);
    assert.deepEqual(snaps.duties().map((d) => [d.kind, d.state]), [["create", "done"], ["delete", "owed"]], "its deletion debt is kept");
    ns.listingFault = null;
    const r = await snaps.prepare(C1, writer(C1));
    assert.notEqual(r.name, first, "the unready repository is never finished or reused");
    assert.deepEqual(ns.repos.get(r.name)!.active(), []);
    await snaps.reconcile();
    assert.equal(ns.repos.has(first!), false, "deleted, with its creation token");
    assert.ok(await snaps.mint(C1, "job_1", deadline()));
    assert.deepEqual(ns.repos.get("canon")!.active().map((t) => t.id), [canon.id]);
    assert.ok(!ns.deleted.includes("canon"));
  });
}

test("plan 001: across a restart, an incomplete inventory never makes a snapshot ready; a complete one does, the unready repositories are deleted, and the canonical token is untouched", async () => {
  const { clock, ns, host } = durable();
  ns.repos.set("canon", new Repo(ns, "canon"));
  const canon = ns.repos.get("canon")!.mint("write", 3600);
  const writer: SnapshotWriter = async () => C1;
  ns.revokeFailures = 1;
  ns.listingFault = (t) => ({ tokens: t.filter((x) => x.scope !== "write"), total: t.length });
  await assert.rejects(host().prepare(C1, writer), /incomplete or malformed/);
  // A new host over the same storage, while listings are still incomplete.
  const again = host();
  await assert.rejects(again.mint(C1, "job_1", clock.t + 600_000), /not ready/);
  await assert.rejects(again.prepare(C1, writer), /incomplete or malformed/);
  assert.equal(ns.created.length, 2);
  ns.listingFault = null;
  const third = host();
  const r = await third.prepare(C1, writer);
  assert.deepEqual(ns.repos.get(r.name)!.active(), []);
  await third.reconcile();
  assert.deepEqual(ns.deleted.sort(), ns.created.filter((n) => n !== r.name).sort(), "both unready repositories are deleted");
  assert.ok(await third.mint(C1, "job_1", clock.t + 600_000));
  assert.deepEqual(ns.repos.get("canon")!.active().map((t) => t.id), [canon.id]);
});

// ------------------------------------------------------------------ review 96d1fbc9

/** One durable SQL store and Artifacts, and a host that can stop and start again over them. */
function durable() {
  const clock = new Clock();
  const ns = new Fake(clock);
  const sql: Sql = nodeSql();
  const wakes: number[] = [];
  const host = () => new SnapshotRepos({ sql, artifacts: ns, prefix: "canon", now: clock.now, sleep: async () => {}, wake: async (at) => void wakes.push(at) });
  return { clock, ns, sql, wakes, host };
}

const never = () => new Promise<never>(() => {});
const RECHECK_FIRST = 60_000;
const transport = () => new Error("lost transport reply; the request may still apply");

/** Run alarms as the Room would until nothing is due for a while. */
async function drain(clock: Clock, snaps: SnapshotRepos, rounds = 12) {
  for (let i = 0; i < rounds; i++) {
    const due = snaps.nextDue();
    if (due === null) return;
    clock.t = Math.max(clock.t, due);
    await snaps.reconcile();
  }
}

test("a create whose answer is lost and which applies after 24 hours and a restart is still found and deleted (P2: the checker's diagnostic)", async () => {
  const { clock, ns, sql, host } = durable();
  let snaps = host();
  const original = ns.create.bind(ns);
  let applyLater: (() => Promise<unknown>) | undefined;
  ns.create = async (name) => {
    applyLater = () => original(name);
    throw transport();
  };
  await assert.rejects(snaps.prepare(C1, async () => C1), /lost transport/);
  assert.equal(snaps.pending(), 1);
  assert.equal(ns.repos.size, 0);
  clock.advance(MAX_RETAIN_MS + 1);
  snaps = host();
  // Absent, after more than 24 hours: still unresolved, still scheduled.
  assert.equal(await snaps.reconcile(), 1);
  assert.notEqual(snaps.nextDue(), null);
  assert.deepEqual(snaps.duties().map((d) => [d.kind, d.state]), [["create", "in-flight"]]);
  // The old creation applies now, with its write token.
  await applyLater!();
  const [name] = ns.created;
  assert.equal(ns.repos.get(name!)!.active().filter((t) => t.scope === "write").length, 1);
  await drain(clock, snaps);
  assert.equal(ns.repos.has(name!), false, "the late repository was deleted");
  assert.ok(ns.gone.length >= 0 && [...ns.repos.values()].every((r) => r.active().length === 0));
  assert.equal(snaps.pending(), 0);
  assert.equal(snaps.nextDue(), null);
  assert.equal(sql.all("SELECT * FROM artroom_snap").length, 0);
});

test("every create attempt is its own step and name: a retry succeeds, and the lost first attempt applying later never touches it", async () => {
  const { clock, ns, host } = durable();
  const snaps = host();
  const original = ns.create.bind(ns);
  let applyLater: (() => Promise<unknown>) | undefined;
  ns.create = async (name) => {
    applyLater = () => original(name);
    ns.create = original;
    throw transport();
  };
  await assert.rejects(snaps.prepare(C1, async () => C1), /lost transport/);
  const r = await snaps.prepare(C1, async () => C1);
  const t = await snaps.mint(C1, "job_1", clock.t + 15 * 60_000);
  await applyLater!();
  const late = ns.created.find((n) => n !== r.name)!;
  assert.notEqual(late, r.name);
  await snaps.sweep();
  assert.equal(ns.repos.has(late), false, "the late attempt's repository is deleted");
  assert.equal(ns.repos.has(r.name), true, "the retry's repository is untouched");
  assert.deepEqual(ns.repos.get(r.name)!.active().map((x) => x.id), [t.id]);
  assert.ok((await snaps.mint(C1, "job_2", clock.t + 15 * 60_000)).id);
});

test("an unresolved create stays open while absent or in progress, on a capped backoff; only a definite refusal settles it without a repository", async () => {
  const { clock, ns, host } = durable();
  const snaps = host();
  ns.create = async () => {
    throw transport();
  };
  await assert.rejects(snaps.prepare(C1, async () => C1));
  const gaps: number[] = [];
  for (let i = 0; i < 8; i++) {
    const due = snaps.nextDue()!;
    gaps.push(due - clock.t);
    clock.t = due;
    ns.down.get = i % 2 === 1; // absent, or no answer
    assert.equal(await snaps.reconcile(), 1);
  }
  // The workspace backoff: 1, 1, 2, 4, 8, then every 16 minutes.
  assert.deepEqual(gaps, [60_000, 60_000, 120_000, 240_000, 480_000, 960_000, 960_000, 960_000]);
  // A definite refusal of a create (nothing changed) closes its own step.
  const refused = Object.assign(new Error("INVALID_REPO_NAME (10006)"), { code: "INVALID_REPO_NAME", numericCode: 10006 });
  ns.create = async () => {
    throw refused;
  };
  await assert.rejects(snaps.prepare(C2, async () => C2));
  assert.deepEqual(
    snaps.duties().filter((d) => d.kind === "create").map((d) => [d.state, d.doneReason]),
    [
      ["in-flight", null],
      ["done", "refused"],
    ],
  );
});

test("a wake-up is persisted before every remote effect, and a host stopped at any await leaves its debt to be cleaned after a restart", async () => {
  type Point = "create" | "write" | "inventory" | "mint";
  for (const point of ["create", "write", "inventory", "mint"] as Point[]) {
    const { clock, ns, host, wakes } = durable();
    const first = host();
    const seen: { pending: number; wake: number | undefined; due: number | null }[] = [];
    const stop = async (): Promise<never> => {
      seen.push({ pending: first.pending(), wake: wakes.at(-1), due: first.nextDue() });
      return never();
    };
    // Each stop happens once: the call's effect applies, and its answer never reaches the stopped host.
    const original = ns.create.bind(ns);
    if (point === "create") {
      ns.create = async (name) => {
        ns.create = original;
        await original(name);
        return stop();
      };
    }
    if (point === "inventory") {
      ns.create = async (name) => {
        ns.create = original;
        const made = await original(name);
        const repo = ns.repos.get(name)!;
        const list = repo.listTokens.bind(repo);
        repo.listTokens = async () => {
          repo.listTokens = list;
          return stop();
        };
        return made;
      };
    }
    const writer: SnapshotWriter = point === "write" ? stop : async () => C1;
    if (point === "mint") {
      await first.prepare(C1, writer);
      const repo = ns.repos.get(ns.created[0]!)!;
      const mint = repo.createToken.bind(repo);
      repo.createToken = async (scope, ttl) => {
        repo.createToken = mint;
        await mint(scope, ttl);
        return stop();
      };
      void first.mint(C1, "job_1", clock.t + 15 * 60_000);
    } else void first.prepare(C1, writer);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(seen.length, 1, `${point}: the host stopped there`);
    const at = seen[0]!;
    assert.ok(at.pending >= 1, `${point}: the debt was durable before the effect`);
    assert.ok(at.wake !== undefined && at.due !== null && at.wake <= at.due, `${point}: its wake-up was persisted before the effect`);
    // The host is gone. The alarm fires on a new one, as often as it is set.
    const second = host();
    await drain(clock, second, 20);
    assert.equal(ns.created.every((n) => !ns.repos.has(n)), true, `${point}: every repository it made is deleted`);
    assert.equal(second.pending(), 0, `${point}: nothing is left owed`);
  }
});

test("a late callback from a stopped host cannot finish or settle a later attempt (fenced by name)", async () => {
  const { clock, ns, host } = durable();
  const gated = () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const writer: SnapshotWriter = async () => (await gate, C1);
    return { writer, release };
  };
  const a = gated();
  const slow = host().prepare(C1, a.writer);
  await new Promise((r) => setTimeout(r, 0));
  // A new host takes over after the preparation window and prepares the same snapshot again; its write is still running.
  clock.advance(PREPARE_WINDOW_MS + 1);
  const fresh = host();
  const b = gated();
  const next = fresh.prepare(C1, b.writer);
  await new Promise((r) => setTimeout(r, 0));
  // The stopped host's writer returns first: it must not make the new attempt's row ready.
  a.release();
  await assert.rejects(slow, /superseded/);
  b.release();
  const r = await next;
  const t = await fresh.mint(C1, "job_1", clock.t + 15 * 60_000);
  assert.deepEqual([t.name, t.remote], [r.name, r.remote], "the job reads the current attempt's repository");
  await fresh.reconcile();
  assert.deepEqual(ns.created.filter((n) => ns.repos.has(n)), [r.name], "the superseded attempt's repository is deleted");
});

test("a job with a short deadline brings the wake-up forward to that deadline", async () => {
  const { clock, ns, host, wakes } = durable();
  const snaps = host();
  const r = await snaps.prepare(C1, async () => C1);
  clock.advance(RECHECK_FIRST);
  await snaps.reconcile(); // the alarm set before the create has fired; the next is the preparation window's end
  assert.equal(wakes.at(-1), clock.t - RECHECK_FIRST + PREPARE_WINDOW_MS);
  const deadline = clock.t + 3 * 60_000;
  await snaps.mint(C1, "job_short", deadline);
  assert.equal(wakes.at(-1), deadline, "woken at the job's deadline, not the window's end");
  clock.t = deadline;
  await snaps.reconcile();
  assert.equal(ns.repos.has(r.name), false);
});

// ------------------------------------------------------------------ follow-up c9cd4cd8 (1): a wake-up that cannot be stored

test("follow-up c9cd4cd8: a wake-up that cannot be stored sends no create; the step is closed as never sent, and the next attempt prepares", async () => {
  const clock = new Clock();
  const ns = new Fake(clock);
  let fail = 1;
  const wakes: { createdBefore: number }[] = [];
  const snaps = new SnapshotRepos({
    sql: nodeSql(),
    artifacts: ns,
    prefix: "canon",
    now: clock.now,
    sleep: async () => {},
    wake: async () => {
      wakes.push({ createdBefore: ns.created.length });
      if (fail-- > 0) throw new Error("the alarm could not be stored");
    },
  });
  await assert.rejects(snaps.prepare(C1, async () => C1), /alarm could not be stored/);
  assert.deepEqual(ns.created, [], "nothing was sent");
  assert.deepEqual(snaps.duties().map((d) => [d.kind, d.state, d.doneReason]), [["create", "done", "not-sent"]]);
  assert.equal(snaps.pending(), 0, "no unknown create is left to watch");
  const r = await snaps.prepare(C1, async () => C1);
  assert.deepEqual(ns.created, [r.name]);
  assert.equal(wakes[1]!.createdBefore, 0, "the wake-up came before the create");
});

// ------------------------------------------------------------------ request d29c09fa: safe metadata at durable sinks

const dutyErrors = (sql: Sql) => sql.all("SELECT kind, last_error FROM artroom_snap_duty WHERE last_error IS NOT NULL ORDER BY id").map((r) => [r["kind"], r["last_error"]]);

test("d29c09fa: a create that fails with the provider's text keeps safe metadata only, and so does the next check of it", async () => {
  const { clock, ns, sql, host } = durable();
  const snaps = host();
  ns.create = async () => {
    throw echoing();
  };
  await assert.rejects(snaps.prepare(C1, async () => C1));
  assert.deepEqual(dutyErrors(sql), [["create", echoNote("snapshot create failed")]]);
  noEcho("a failed create", everyRow(sql), snaps.duties());
  // The unresolved create is checked again; that lookup fails with the provider's text too.
  ns.get = async () => {
    throw echoing();
  };
  clock.t = snaps.nextDue()!;
  assert.equal(await snaps.reconcile(), 1);
  assert.deepEqual(dutyErrors(sql), [["create", echoNote("snapshot create not yet seen")]]);
  noEcho("an unresolved create's check", everyRow(sql), snaps.duties());
});

test("d29c09fa: retirement that fails with the provider's text stays owed, and its rows keep safe metadata only", async () => {
  const { clock, ns, sql, host } = durable();
  const snaps = host();
  const r = await snaps.prepare(C1, async () => C1);
  await snaps.mint(C1, "job_a", clock.t + 15 * 60_000);
  ns.repos.get(r.name)!.revokeToken = async () => {
    throw echoing();
  };
  ns.delete = async () => {
    throw echoing();
  };
  assert.equal(await snaps.end(C1, "job_a"), 2, "the revocation and the deletion are both owed");
  const errors = dutyErrors(sql);
  assert.deepEqual(errors.map(([k]) => k).sort(), ["delete", "revoke"]);
  for (const [, e] of errors) assert.equal(e, echoNote("snapshot cleanup failed"));
  noEcho("failed retirement", everyRow(sql), snaps.duties());
});

test("d29c09fa, reopen: snapshot steps stored with provider text are rewritten once by the scrub; safe ones stay", async () => {
  const { ns, sql, host } = durable();
  const snaps = host();
  ns.create = async () => {
    throw echoing();
  };
  await assert.rejects(snaps.prepare(C1, async () => C1));
  await assert.rejects(snaps.prepare(C2, async () => C2));
  // One legacy row; the other keeps its safe metadata.
  const [first] = sql.all("SELECT id FROM artroom_snap_duty ORDER BY id").map((r) => r["id"] as number);
  sql.all("UPDATE artroom_snap_duty SET last_error = ? WHERE id = ?", `snapshot create failed: ${echoing().message}`, first!);
  host(); // reopen
  scrubLegacyErrors(sql);
  assert.deepEqual(dutyErrors(sql), [
    ["create", `snapshot create failed: ${WITHHELD}`],
    ["create", echoNote("snapshot create failed")],
  ]);
  noEcho("the scrubbed rows", everyRow(sql));
  {
    const once = everyRow(sql);
    scrubLegacyErrors(sql); // a second run changes nothing
    assert.equal(everyRow(sql), once);
  }
});
