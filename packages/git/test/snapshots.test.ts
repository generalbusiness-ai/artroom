// Snapshot repositories (R-CARRY-16): one new repository per snapshot commit,
// one read token per job bounded by its deadline, and durable retirement,
// against a fake Artifacts namespace with the binding's shape.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_RETAIN_MS, RetirementOwed, SnapshotRepos, type SnapshotWriter } from "../src/snapshot/repos.ts";
import type { ArtifactsNamespace, MintedToken, RepoHandle, TokenInfo } from "../src/artifacts.ts";
import { Clock, nodeSql } from "./support.ts";

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
    const t = this.tokens.find((x) => x.id === tokenOrId || x.plaintext === tokenOrId);
    if (!t || t.state !== "active") return false;
    t.state = "revoked";
    return true;
  }
  async listTokens() {
    if (this.ns.down.list) throw outage();
    const tokens = this.tokens.map((t) => ({ id: t.id, scope: t.scope, state: t.state === "active" && t.expiresAt <= this.ns.clock.t ? ("expired" as const) : t.state, expiresAt: new Date(t.expiresAt).toISOString() }));
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
  assert.equal(a.name, `canon--snap-${C1}`);
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
      ["delete", "done"],
      ["revoke", "done"],
      ["revoke", "done"],
    ],
  );
  await assert.rejects(snaps.mint(C1, "job_c", deadline()), /not ready/);
  // The same snapshot later: a new, empty repository.
  await snaps.prepare(C1, writer(C1));
  assert.deepEqual(ns.created, [r.name, r.name]);
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
  // Nothing is issued against a repository whose retirement is owed.
  await assert.rejects(snaps.mint(C1, "job_b", deadline()), /not ready/);
  await assert.rejects(snaps.prepare(C1, writer(C1)), RetirementOwed);
  clock.advance(60_000);
  assert.equal(await snaps.reconcile(), 2);
  assert.ok(snaps.duties().every((d) => d.state === "owed" && d.attempts >= 2));
  // Artifacts recovers.
  ns.down.delete = false;
  ns.down.revoke = false;
  clock.advance(MAX_RETAIN_MS);
  assert.equal(await snaps.reconcile(), 0);
  assert.equal(ns.repos.has(r.name), false);
  assert.equal(snaps.nextDue(), null);
});

test("the retirement duty is recorded before the repository exists: an interrupted preparation is deleted, never finished", async () => {
  const { clock, ns, snaps, writes, writer } = setup();
  const crash: SnapshotWriter = async () => {
    throw new Error("the publisher stopped");
  };
  await assert.rejects(snaps.prepare(C1, crash), /publisher stopped/);
  const name = `canon--snap-${C1}`;
  assert.equal(ns.repos.has(name), true, "the repository was created");
  assert.deepEqual(snaps.duties().map((d) => [d.kind, d.state]), [["delete", "owed"]]);
  await assert.rejects(snaps.mint(C1, "job_1", clock.t + 600_000), /not ready/);
  // The next preparation deletes it and starts again from a new, empty repository.
  await snaps.prepare(C1, writer(C1));
  assert.deepEqual(ns.deleted, [name]);
  assert.deepEqual(ns.created, [name, name]);
  assert.equal(writes.length, 1);
  // A repository no job ever uses is deleted 24 hours after it was made.
  const unused = await snaps.prepare(C3, writer(C3));
  clock.advance(MAX_RETAIN_MS - 1);
  await snaps.reconcile();
  assert.equal(ns.repos.has(unused.name), true);
  clock.advance(1);
  await snaps.reconcile();
  assert.equal(ns.repos.has(unused.name), false);
});

test("a publisher that writes any other commit: nothing is issued, and the repository is deleted", async () => {
  const { ns, snaps, writer, deadline } = setup();
  await assert.rejects(snaps.prepare(C1, writer(C1, C2)), /not the recorded/);
  assert.equal(ns.repos.has(`canon--snap-${C1}`), false);
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
