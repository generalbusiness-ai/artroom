// Lane forks and lease-bound tokens (R-CRED-8, R-WS-1 to R-WS-5, R-LANE-8),
// against a fake Artifacts namespace with the binding's shape.
import { test } from "node:test";
import assert from "node:assert/strict";
import { TOKEN_MARGIN_S, Workspaces, forkName } from "../src/workspace/workspaces.ts";
import type { ArtifactsNamespace, MintedToken, RepoHandle, TokenInfo } from "../src/artifacts.ts";
import { WITHHELD, scrubLegacyErrors } from "../src/safe-errors.ts";
import { Clock, deferred, echoNote, echoing, everyRow, laneId, noEcho, nodeSql } from "./support.ts";

class ArtifactsError extends Error {
  readonly code: string;
  readonly numericCode: number;
  constructor(code: string, numericCode: number) {
    super(`${code} (${numericCode})`);
    this.code = code;
    this.numericCode = numericCode;
  }
}

class FakeRepo implements RepoHandle {
  readonly tokens = new Map<string, { plaintext: string; scope: "read" | "write"; state: TokenInfo["state"]; expiresAt: number; ttl: number }>();
  readonly ns: FakeNamespace;
  readonly name: string;
  readonly source: string | null;
  constructor(ns: FakeNamespace, name: string, source: string | null) {
    this.ns = ns;
    this.name = name;
    this.source = source;
  }
  mintRaw(scope: "read" | "write", ttl: number): MintedToken {
    const id = `tid_${++this.ns.counter}`;
    this.ns.minted.push(id);
    const plaintext = `art_v1_${id}${"a".repeat(30)}?expires=${ttl}`;
    const expiresAt = this.ns.clock.t + ttl * 1000;
    this.tokens.set(id, { plaintext, scope, state: "active", expiresAt, ttl });
    return { id, plaintext, scope, expiresAt: new Date(expiresAt).toISOString() };
  }
  async createToken(scope: "write" | "read" = "write", ttl = 86400) {
    if (ttl < 60) throw new ArtifactsError("INVALID_TTL", 10003);
    const delay = this.ns.mintDelays.shift();
    if (delay) await delay();
    const t = this.mintRaw(scope, ttl);
    // The token exists in Artifacts; its answer is still on the way back.
    const after = this.ns.mintAfter.shift();
    if (after) await after();
    return t;
  }
  async revokeToken(tokenOrId: string) {
    if (this.ns.failRevoke || this.ns.failRevokeOnly) throw new ArtifactsError("INTERNAL_ERROR", 10400);
    for (const [id, t] of this.tokens) {
      if ((id === tokenOrId || t.plaintext === tokenOrId) && t.state === "active") {
        t.state = "revoked";
        return true;
      }
    }
    return false;
  }
  async listTokens() {
    if (this.ns.failRevoke) throw new ArtifactsError("INTERNAL_ERROR", 10400);
    const tokens = [...this.tokens].map(([id, t]) => ({
      id,
      scope: t.scope,
      state: t.state === "active" && t.expiresAt <= this.ns.clock.t ? ("expired" as const) : t.state,
      expiresAt: new Date(t.expiresAt).toISOString(),
    }));
    if (this.ns.listingFault) return this.ns.listingFault(tokens) as never;
    return { tokens, total: tokens.length };
  }
  async info() {
    const hook = this.ns.infoHooks.shift();
    if (hook) await hook();
    return { name: this.name, remote: `https://acct.artifacts.cloudflare.net/git/ns/${this.name}.git`, source: this.source };
  }
  async fork(name: string) {
    this.ns.forkCalls++;
    const failure = this.ns.forkFailures.shift();
    if (failure === "lost-after-create") {
      this.ns.repos.set(name, new FakeRepo(this.ns, name, `artifacts:${this.ns.namespace}/${this.name}`));
      throw new ArtifactsError("INTERNAL_ERROR", 10400);
    }
    if (failure) throw failure;
    if (this.ns.repos.has(name)) throw new ArtifactsError("ALREADY_EXISTS", 10409);
    const repo = new FakeRepo(this.ns, name, `artifacts:${this.ns.namespace}/${this.name}`);
    this.ns.repos.set(name, repo);
    const t = repo.mintRaw("write", 86400);
    return { name, remote: (await repo.info()).remote, token: t.plaintext };
  }
  async readTree() {
    return null;
  }
  async readCommit() {
    return null;
  }
  /** Main, for the canonical repository's incarnations (public founding). */
  mainSha: string | null = null;
  async log(opts?: { ref?: string }) {
    return this.mainSha && (opts?.ref === "main" || opts?.ref === "refs/heads/main") ? [{ hash: this.mainSha }] : [];
  }
  live(): string[] {
    return [...this.tokens].filter(([, t]) => t.state === "active" && t.expiresAt > this.ns.clock.t).map(([id]) => id);
  }
}

class FakeNamespace implements ArtifactsNamespace {
  counter = 0;
  forkCalls = 0;
  readonly forkFailures: (Error | "lost-after-create")[] = [];
  readonly repos = new Map<string, FakeRepo>();
  readonly clock: Clock;
  createGate: Promise<void> | null = null;
  readonly namespace = "ns";
  readonly minted: string[] = [];
  /** Run after a token is minted, before its answer returns. */
  readonly mintAfter: (() => Promise<void>)[] = [];
  /** Run at the start of each info() call; may throw. */
  readonly infoHooks: (() => Promise<void>)[] = [];
  /** Each call of createToken first awaits the next of these, if any. */
  readonly mintDelays: (() => Promise<void>)[] = [];
  failRevoke = false;
  /** Revocation fails, listing works. */
  failRevokeOnly = false;
  /** While set, every listing answers this instead of the complete one (plan 001: an incomplete or malformed inventory). */
  listingFault: ((tokens: TokenInfo[]) => unknown) | null = null;
  constructor(clock: Clock) {
    this.clock = clock;
    this.repos.set("canon", new FakeRepo(this, "canon", null));
  }
  /** Names whose lookup answers "in progress" (FORK_IN_PROGRESS or CREATE_IN_PROGRESS). */
  readonly busy = new Map<string, string>();
  async get(name: string) {
    const busy = this.busy.get(name);
    if (busy) throw new ArtifactsError(busy, 10409);
    const r = this.repos.get(name);
    if (!r) throw new ArtifactsError("NOT_FOUND", 10404);
    if (this.createGate) await this.createGate;
    return r;
  }
  /** Public founding only (`createCanonical`): off unless a test turns it on. */
  allowCreate = false;
  /** Planned outcomes of the next creates: an error, or "lost-after-create" (applies, then the answer is lost). */
  readonly createFailures: (Error | "lost-after-create")[] = [];
  createCalls = 0;
  /** Run when a create is sent, before it applies. */
  readonly createHooks: (() => void)[] = [];
  async create(name: string) {
    if (!this.allowCreate) throw new Error("workspaces never create a repository");
    this.createCalls++;
    this.createHooks.shift()?.();
    const failure = this.createFailures.shift();
    if (failure && failure !== "lost-after-create") throw failure;
    if (this.repos.has(name)) throw new ArtifactsError("ALREADY_EXISTS", 10409);
    const repo = new FakeRepo(this, name, null);
    this.repos.set(name, repo);
    // As Artifacts' create: the answer carries a 24-hour write token.
    const t = repo.mintRaw("write", 86400);
    if (failure === "lost-after-create") throw new ArtifactsError("INTERNAL_ERROR", 10400);
    return { name, remote: (await repo.info()).remote, token: t.plaintext };
  }
  /** Public founding only (`retireCanonical`): off unless a test turns it on. */
  allowDelete = false;
  deleteCalls = 0;
  readonly deleteFailures: Error[] = [];
  async delete(name: string): Promise<boolean> {
    if (!this.allowDelete) throw new Error("workspaces never delete a repository");
    this.deleteCalls++;
    const failure = this.deleteFailures.shift();
    if (failure) throw failure;
    // As the binding: the repository and every token on it.
    return this.repos.delete(name);
  }
}

function setup() {
  const clock = new Clock();
  const ns = new FakeNamespace(clock);
  const ws = new Workspaces({ sql: nodeSql(), artifacts: ns, canonical: "canon", namespace: "ns", now: clock.now, sleep: async () => {} });
  const lane = laneId(1);
  return { clock, ns, ws, lane, fork: () => ns.repos.get(forkName("canon", lane))! };
}

const LEASE_MS = 15 * 60_000;

test("a workspace is a fork with one write token, scoped to it and expiring with the lease; the fork's own token is revoked", async () => {
  const { clock, ws, lane, fork } = setup();
  const opened = ws.open(lane, 1, clock.t + LEASE_MS);
  assert.equal("state" in opened && opened.state, "pending");
  const ready = await ws.provision(lane);
  assert.equal(ready.state, "ready");
  const g = ws.grant(lane, 1);
  assert.ok(!("refused" in g));
  if ("refused" in g) return;
  assert.match(g.remote, /canon--act_1001_/);
  // The token ends a few seconds inside the lease, so clock differences cannot carry it past.
  assert.equal(Date.parse(g.expiresAt), clock.t + LEASE_MS - TOKEN_MARGIN_S * 1000);
  const live = fork().live();
  assert.equal(live.length, 1, "only the lease's token is live");
  const t = fork().tokens.get(live[0]!)!;
  assert.equal(t.scope, "write");
  assert.equal(t.ttl, LEASE_MS / 1000 - TOKEN_MARGIN_S);
  assert.equal(t.plaintext, g.token);
});

test("B watches A's workspace: the operation view never holds a token, and an old lease gets none (R-WS-1, R-WS-2)", async () => {
  const { clock, ws, lane } = setup();
  ws.open(lane, 1, clock.t + LEASE_MS);
  const view = await ws.provision(lane);
  const g = ws.grant(lane, 1);
  assert.ok(!("refused" in g));
  const token = "refused" in g ? "" : g.token;
  assert.ok(!JSON.stringify(view).includes(token));
  assert.ok(!/art_v\d/.test(JSON.stringify([view, ws.view(lane)])));
  const old = ws.grant(lane, 0);
  assert.ok("refused" in old && old.rule === "lease-fenced");
});

test("fork creation retries Artifacts' internal error 10400, and a fork whose response was lost is reused", async () => {
  const { clock, ns, ws, lane, fork } = setup();
  ns.forkFailures.push(new ArtifactsError("INTERNAL_ERROR", 10400), new ArtifactsError("INTERNAL_ERROR", 10400));
  ws.open(lane, 1, clock.t + LEASE_MS);
  assert.equal((await ws.provision(lane)).state, "ready");
  assert.equal(ns.forkCalls, 3);

  const s2 = setup();
  s2.ns.forkFailures.push("lost-after-create");
  s2.ws.open(s2.lane, 1, s2.clock.t + LEASE_MS);
  assert.equal((await s2.ws.provision(s2.lane)).state, "ready");
  assert.equal(s2.fork().live().length, 1);
  assert.equal(s2.fork().source, "artifacts:ns/canon", "the fork the lost create made, not a new one");
  void fork;
});

test("a fork that keeps failing ends in failed, with a retryable error and no token in its message", async () => {
  const { clock, ns, ws, lane } = setup();
  for (let i = 0; i < 5; i++) ns.forkFailures.push(new ArtifactsError("INTERNAL_ERROR", 10400));
  ws.open(lane, 1, clock.t + LEASE_MS);
  const v = await ws.provision(lane);
  assert.equal(v.state, "failed");
  assert.ok(v.state === "failed" && v.error.retryable && v.error.code === "unavailable");
  // Opening again retries.
  ws.open(lane, 1, clock.t + LEASE_MS);
  assert.equal((await ws.provision(lane)).state, "ready");
});

test("release, expiry or take-over revokes every active token on the fork, including one minted and never recorded (R-LANE-8, R-WS-3)", async () => {
  const { clock, ws, lane, fork } = setup();
  ws.open(lane, 1, clock.t + LEASE_MS);
  await ws.provision(lane);
  const orphan = fork().mintRaw("write", 600); // a crash between mint and record
  assert.equal(fork().live().length, 2);
  assert.equal(await ws.revoke(lane, 1), 0, "nothing owed");
  assert.deepEqual(fork().live(), []);
  assert.ok(fork().tokens.get(orphan.id)?.state === "revoked");
  assert.equal(ws.view(lane), null);
  const g = ws.grant(lane, 1);
  assert.ok("refused" in g && g.rule === "workspace-not-ready");
  // The next holder gets a new token for the next lease generation.
  ws.open(lane, 2, clock.t + LEASE_MS);
  assert.equal((await ws.provision(lane)).state, "ready");
  const g2 = ws.grant(lane, 2);
  assert.ok(!("refused" in g2) && g2.leaseGeneration === 2);
  assert.equal(fork().live().length, 1);
  const stale = ws.open(lane, 1, clock.t + LEASE_MS);
  assert.ok("refused" in stale && stale.rule === "lease-fenced");
});

test("a renewed lease gets a fresh token and the previous one is revoked", async () => {
  const { clock, ws, lane, fork } = setup();
  ws.open(lane, 1, clock.t + LEASE_MS);
  await ws.provision(lane);
  const first = ws.grant(lane, 1);
  clock.advance(LEASE_MS - 30_000);
  ws.open(lane, 1, clock.t + LEASE_MS);
  await ws.provision(lane);
  const second = ws.grant(lane, 1);
  assert.ok(!("refused" in first) && !("refused" in second));
  assert.notEqual(!("refused" in first) && first.token, !("refused" in second) && second.token);
  assert.equal(fork().live().length, 1);
});

test("a lease with under a minute left gets no token; a lease that ends during provisioning leaves no live token", async () => {
  const { clock, ns, ws, lane, fork } = setup();
  const r = ws.open(lane, 1, clock.t + 30_000);
  assert.ok("refused" in r && r.rule === "workspace-not-ready");

  ws.open(lane, 1, clock.t + LEASE_MS);
  await ws.provision(lane); // the fork exists now
  await ws.revoke(lane, 1);
  ws.open(lane, 2, clock.t + LEASE_MS);
  const gate = deferred();
  ns.createGate = gate.promise;
  const provisioning = ws.provision(lane);
  // The lease ends while provisioning waits on Artifacts.
  await new Promise((r) => setTimeout(r, 5));
  ns.createGate = null;
  const revoking = ws.revoke(lane, 2);
  gate.resolve();
  await Promise.all([provisioning, revoking]);
  assert.deepEqual(fork().live(), []);
  assert.ok("refused" in ws.grant(lane, 2));
});

// ------------------------------------------------------------------ review 50104b16, P1.2: provenance

test("a repository at the fork's name that is not a fork of this canonical repo is never used, changed or deleted", async () => {
  for (const source of [null, "artifacts:ns/other-canon", "artifacts:ns2/canon", "github:someone/canon"]) {
    const { clock, ns, ws, lane } = setup();
    const name = forkName("canon", lane);
    const squatter = new FakeRepo(ns, name, source);
    const theirs = squatter.mintRaw("write", 3600);
    ns.repos.set(name, squatter);
    ws.open(lane, 1, clock.t + LEASE_MS);
    const v = await ws.provision(lane);
    assert.equal(v.state, "failed", String(source));
    assert.ok(v.state === "failed" && v.error.code === "forbidden" && v.error.retryable === false);
    assert.equal(ns.repos.get(name), squatter, "not replaced");
    assert.deepEqual(squatter.live(), [theirs.id], "no token minted on it, and its own left alone");
    assert.ok("refused" in ws.grant(lane, 1));
    assert.equal(await ws.revoke(lane, 1), 0);
    assert.deepEqual(squatter.live(), [theirs.id], "release does not touch it either");
  }
});

// ------------------------------------------------------------------ review 50104b16, P1.3: tokens within the lease

test("a mint delayed 30 s past a 120 s lease's start: the overlong token is revoked and replaced by one that ends within the lease", async () => {
  const { clock, ns, ws, lane, fork } = setup();
  const leaseEnd = clock.t + 120_000;
  ws.open(lane, 1, leaseEnd);
  ns.mintDelays.push(async () => clock.advance(30_000));
  assert.equal((await ws.provision(lane)).state, "ready");
  const g = ws.grant(lane, 1);
  assert.ok(!("refused" in g) && Date.parse(g.expiresAt) <= leaseEnd, "the grant ends within the lease");
  const live = fork().live();
  assert.equal(live.length, 1, "only the valid token is live");
  assert.ok(fork().tokens.get(live[0]!)!.expiresAt <= leaseEnd, "the token itself ends within the lease");
});

test("a mint delayed 180 s past a 120 s lease's start: no token survives and no grant is given", async () => {
  const { clock, ns, ws, lane, fork } = setup();
  ws.open(lane, 1, clock.t + 120_000);
  ns.mintDelays.push(async () => clock.advance(180_000));
  const v = await ws.provision(lane);
  assert.equal(v.state, "failed");
  assert.deepEqual(fork().live(), []);
  const g = ws.grant(lane, 1);
  assert.ok("refused" in g && g.rule === "lease-fenced");
});

test("a new lease generation while the old one's token is being minted: the old token is revoked, the new holder gets its own", async () => {
  const { clock, ns, ws, lane, fork } = setup();
  ws.open(lane, 1, clock.t + LEASE_MS);
  await ws.provision(lane); // the fork exists
  await ws.revoke(lane, 1);
  ws.open(lane, 2, clock.t + LEASE_MS);
  let handoff!: () => void;
  ns.mintDelays.push(() => new Promise<void>((r) => (handoff = r)));
  const first = ws.provision(lane);
  while (!handoff) await new Promise((r) => setTimeout(r, 2));
  ws.open(lane, 3, clock.t + LEASE_MS); // taken over while lease 2's token is minted
  handoff();
  await first;
  const lease2Token = ns.minted[ns.minted.length - 1]!;
  assert.equal(fork().tokens.get(lease2Token)?.state, "revoked", "the token minted for lease 2 is revoked, not handed to lease 3");
  assert.equal((await ws.provision(lane)).state, "ready");
  const g = ws.grant(lane, 3);
  assert.ok(!("refused" in g) && g.leaseGeneration === 3);
  assert.equal(fork().live().length, 1, "only lease 3's token is live");
  assert.notEqual(fork().live()[0], lease2Token);
  assert.ok("refused" in ws.grant(lane, 2));
});

test("a revocation that fails is remembered, never granted again, and revoked by sweep", async () => {
  const { clock, ns, ws, lane, fork } = setup();
  ws.open(lane, 1, clock.t + LEASE_MS);
  await ws.provision(lane);
  ns.failRevoke = true;
  assert.ok((await ws.revoke(lane, 1)) > 0, "Artifacts is down: cleanup is owed");
  assert.ok((await ws.sweep()) > 0, "still owed");
  assert.ok(ws.nextDue() !== null, "the Room's alarm has work");
  assert.equal(fork().live().length, 1);
  assert.ok("refused" in ws.grant(lane, 1));
  ns.failRevoke = false;
  assert.equal(await ws.sweep(), 0);
  assert.deepEqual(fork().live(), []);
  assert.equal(ws.nextDue(), null);
});

test("grant refuses once the lease has expired, even with a token on record", async () => {
  const { clock, ws, lane } = setup();
  ws.open(lane, 1, clock.t + 120_000);
  await ws.provision(lane);
  assert.ok(!("refused" in ws.grant(lane, 1)));
  clock.advance(121_000);
  const g = ws.grant(lane, 1);
  assert.ok("refused" in g && g.rule === "lease-fenced");
});

// ------------------------------------------------------------------ review b78a837f, P1: one durable cleanup protocol

test("the fork's creation token: if its revocation fails, the workspace is not ready, the cleanup survives a restart, and the alarm finishes it", async () => {
  const { clock, ns, ws, lane, fork } = setup();
  ws.open(lane, 1, clock.t + LEASE_MS);
  ns.failRevoke = true; // Artifacts cannot revoke or list right after the fork is made
  const v = await ws.provision(lane);
  assert.equal(v.state, "failed");
  assert.ok(v.state === "failed" && v.error.retryable);
  assert.equal(fork().live().length, 1, "the 24 h creation token is still live");
  assert.ok("refused" in ws.grant(lane, 1));
  // Provisioning again while cleanup is owed does not hand out a second token.
  ws.open(lane, 1, clock.t + LEASE_MS);
  assert.equal((await ws.provision(lane)).state, "failed");
  assert.equal(fork().live().length, 1);
  // A restart: a new instance over the same storage.
  const restarted = new Workspaces({ sql: ws["sql"], artifacts: ns, canonical: "canon", namespace: "ns", now: clock.now, sleep: async () => {} });
  assert.ok(restarted.nextDue() !== null, "the alarm has work");
  assert.ok((await restarted.sweep()) > 0, "still owed while Artifacts is down");
  ns.failRevoke = false;
  clock.advance(600_000);
  assert.equal(await restarted.reconcile(), 0, "the alarm settles it");
  assert.deepEqual(fork().live(), [], "the creation token is revoked");
  restarted.open(lane, 1, clock.t + LEASE_MS);
  assert.equal((await restarted.provision(lane)).state, "ready");
  assert.equal(fork().live().length, 1, "exactly one live token: the lease's");
});

test("a token minted just before a crash, never recorded, is found by the cleanup the mint owed", async () => {
  const { clock, ns, ws, lane, fork } = setup();
  ws.open(lane, 1, clock.t + LEASE_MS);
  await ws.provision(lane);
  await ws.revoke(lane, 1);
  ws.open(lane, 2, clock.t + LEASE_MS);
  ns.mintAfter.push(() => new Promise<void>(() => {})); // the answer never arrives: the instance died
  void ws.provision(lane);
  for (let i = 0; i < 100 && ns.minted.length < 3; i++) await new Promise((r) => setTimeout(r, 2));
  const orphan = ns.minted[ns.minted.length - 1]!;
  assert.equal(fork().tokens.get(orphan)?.state, "active", "minted in Artifacts, unknown to the room");
  const restarted = new Workspaces({ sql: ws["sql"], artifacts: ns, canonical: "canon", namespace: "ns", now: clock.now, sleep: async () => {} });
  assert.equal(await restarted.reconcile(), 1, "the mint is still in flight: its outcome is not known");
  assert.equal(fork().tokens.get(orphan)?.state, "revoked", "but the token it made is found and revoked");
  assert.equal((await restarted.provision(lane)).state, "ready", "an unresolved old step does not block the lease");
  assert.equal(fork().live().length, 1);
  clock.advance(48 * 3_600_000); // no amount of elapsed time settles a step whose outcome is unknown
  assert.equal(await restarted.reconcile(), 1);
  assert.ok(restarted.nextDue() !== null, "the inventories keep running");
});

test("when the inventory on release fails, an unrecorded token is not forgotten: the cleanup stays owed until it is revoked", async () => {
  const { clock, ns, ws, lane, fork } = setup();
  ws.open(lane, 1, clock.t + LEASE_MS);
  await ws.provision(lane);
  const orphan = fork().mintRaw("write", 600); // an unrecorded token, from a crash window
  ns.failRevoke = true; // listing and revoking fail
  assert.ok((await ws.revoke(lane, 1)) > 0);
  assert.ok((await ws.sweep()) > 0, "not reported as settled");
  assert.equal(fork().tokens.get(orphan.id)?.state, "active");
  ns.failRevoke = false;
  assert.equal(await ws.sweep(), 0);
  assert.equal(fork().tokens.get(orphan.id)?.state, "revoked");
  assert.deepEqual(fork().live(), []);
});

test("cleanup owed on a fork name now held by another repository drops the debt and never touches that repository", async () => {
  const { clock, ns, ws, lane } = setup();
  ws.open(lane, 1, clock.t + LEASE_MS);
  await ws.provision(lane);
  ns.failRevoke = true;
  await ws.revoke(lane, 1);
  ns.failRevoke = false;
  const name = forkName("canon", lane);
  const squatter = new FakeRepo(ns, name, null);
  const theirs = squatter.mintRaw("write", 3600);
  ns.repos.set(name, squatter); // our fork was replaced by someone else's repository
  assert.equal(await ws.sweep(), 0);
  assert.deepEqual(squatter.live(), [theirs.id]);
});

// ------------------------------------------------------------------ review b78a837f, P2: results fenced by lease

test("a late error from lease 1's provisioning does not fail lease 2's workspace", async () => {
  const { clock, ns, ws, lane, fork } = setup();
  ws.open(lane, 1, clock.t + LEASE_MS);
  let fail!: (e: Error) => void;
  ns.mintDelays.push(() => new Promise<void>((_r, j) => (fail = j)));
  const old = ws.provision(lane); // lease 1 provisioning, waiting on Artifacts
  while (!fail) await new Promise((r) => setTimeout(r, 2));
  ws.open(lane, 2, clock.t + LEASE_MS); // taken over
  fail(new Error("the connection to Artifacts was reset"));
  const oldView = await old;
  assert.equal(oldView.state, "pending", "after lease 1's late error, the workspace (now lease 2's) is still pending");
  assert.equal(ws.view(lane)?.state, "pending", "lease 2 is not marked failed by lease 1's error");
  assert.equal((await ws.provision(lane)).state, "ready");
  assert.ok(!("refused" in ws.grant(lane, 2)));
  assert.equal(fork().live().length, 1);
});

test("a late release of lease 1 never revokes lease 2's token, in either order", async () => {
  for (const order of ["release-first", "provision-first"] as const) {
    const { clock, ns, ws, lane, fork } = setup();
    ws.open(lane, 1, clock.t + LEASE_MS);
    await ws.provision(lane);
    let go!: () => void;
    const gate = new Promise<void>((r) => (go = r));
    if (order === "release-first") {
      ns.infoHooks.push(() => gate); // the release's inventory is slow
      const releasing = ws.revoke(lane, 1);
      ws.open(lane, 2, clock.t + LEASE_MS);
      const provisioning = ws.provision(lane);
      go();
      await Promise.all([releasing, provisioning]);
    } else {
      ws.open(lane, 2, clock.t + LEASE_MS); // take-over first; lease 1's token is owed revocation
      ns.mintAfter.push(() => gate); // lease 2's token exists in Artifacts; its answer is slow
      const provisioning = ws.provision(lane);
      await new Promise((r) => setTimeout(r, 5));
      const releasing = ws.revoke(lane, 1); // the stale release arrives during the mint
      go();
      await Promise.all([releasing, provisioning]);
      await ws.sweep();
    }
    const g = ws.grant(lane, 2);
    assert.ok(!("refused" in g), order);
    const live = fork().live();
    assert.equal(live.length, 1, `${order}: one live token`);
    assert.equal(fork().tokens.get(live[0]!)?.plaintext, !("refused" in g) ? g.token : "", `${order}: the granted token is the live one`);
  }
});

// ------------------------------------------------------------------ review b78a837f, P2: renewal while pending

test("renewing the lease before provisioning: the new deadline is used", async () => {
  const { clock, ws, lane, fork } = setup();
  ws.open(lane, 1, clock.t + 120_000);
  clock.advance(61_000); // 59 s left: too short for a token
  ws.open(lane, 1, clock.t + 15 * 60_000); // renewed
  assert.equal((await ws.provision(lane)).state, "ready");
  const t = fork().tokens.get(fork().live()[0]!)!;
  assert.equal(t.ttl, 15 * 60 - TOKEN_MARGIN_S);
});

test("renewing the lease while its token is being minted: the token is checked against the new deadline", async () => {
  const { clock, ns, ws, lane } = setup();
  ws.open(lane, 1, clock.t + 120_000);
  let renewed = 0;
  ns.mintDelays.push(async () => {
    clock.advance(30_000); // the mint is slow: the 120 s token now overruns the old deadline...
    renewed = clock.t + 15 * 60_000;
    ws.open(lane, 1, renewed); // ...but the lease was renewed meanwhile
  });
  assert.equal((await ws.provision(lane)).state, "ready");
  const g = ws.grant(lane, 1);
  assert.ok(!("refused" in g) && Date.parse(g.expiresAt) <= renewed);
});

test("the alarm's cleanup waits for a token being installed: it never revokes the token a lease is about to receive", async () => {
  const { clock, ns, ws, lane, fork } = setup();
  ws.open(lane, 1, clock.t + LEASE_MS);
  await ws.provision(lane);
  await ws.revoke(lane, 1);
  ws.open(lane, 2, clock.t + LEASE_MS);
  let go!: () => void;
  ns.mintAfter.push(() => new Promise<void>((r) => (go = r))); // lease 2's token exists; its answer is slow
  const provisioning = ws.provision(lane);
  while (!go) await new Promise((r) => setTimeout(r, 2));
  const alarm = ws.sweep(); // the Room's alarm fires during the mint
  await new Promise((r) => setTimeout(r, 5));
  go();
  await Promise.all([provisioning, alarm]);
  const g = ws.grant(lane, 2);
  assert.ok(!("refused" in g));
  assert.deepEqual(fork().live().map((id) => fork().tokens.get(id)!.plaintext), [!("refused" in g) ? g.token : ""], "the granted token is the one live token");
});

test("an orphan the inventory finds but cannot revoke stays owed by its ID until it is revoked", async () => {
  const { clock, ns, ws, lane, fork } = setup();
  ws.open(lane, 1, clock.t + LEASE_MS);
  await ws.provision(lane);
  const orphan = fork().mintRaw("write", 600);
  ns.failRevokeOnly = true; // listing works; revoking does not
  assert.ok((await ws.revoke(lane, 1)) > 0);
  assert.ok((await ws.sweep()) > 0);
  assert.equal(fork().tokens.get(orphan.id)?.state, "active");
  ns.failRevokeOnly = false;
  assert.equal(await ws.sweep(), 0);
  assert.deepEqual(fork().live(), []);
});

// ------------------------------------------------------------------ review f2f25fda, P2: every mint attempt is accounted for

test("a mint attempt that applies and then answers with a retryable error: its token is swept before the workspace is ready", async () => {
  const { clock, ns, ws, lane, fork } = setup();
  ns.mintAfter.push(async () => {
    throw new ArtifactsError("INTERNAL_ERROR", 10400); // applied in Artifacts, then the answer failed
  });
  ws.open(lane, 1, clock.t + LEASE_MS);
  assert.equal((await ws.provision(lane)).state, "ready");
  assert.equal(fork().live().length, 1, "only the installed token is live");
  const g = ws.grant(lane, 1);
  assert.equal(fork().tokens.get(fork().live()[0]!)?.plaintext, !("refused" in g) ? g.token : "");
  // INTERNAL_ERROR is not a definite answer, so that attempt stays in flight and keeps being watched.
  assert.deepEqual(ws.duties().filter((d) => d.state !== "done").map((d) => [d.kind, d.state]), [["mint", "in-flight"]]);
  assert.ok(ws.nextDue() !== null);
});

for (const failure of ["inventory", "revocation"] as const) {
  test(`a retried mint whose sweep fails (${failure}): not ready, the orphan stays owed, and a later sweep finishes it`, async () => {
    const { clock, ns, ws, lane, fork } = setup();
    ns.mintAfter.push(async () => {
      throw new ArtifactsError("INTERNAL_ERROR", 10400);
    });
    ns.mintDelays.push(async () => {}); // attempt 1
    ns.mintDelays.push(async () => {
      if (failure === "inventory") ns.failRevoke = true; // listing (and revoking) fail from attempt 2 on
      else ns.failRevokeOnly = true; // listing works, revoking fails
    });
    ws.open(lane, 1, clock.t + LEASE_MS);
    const v = await ws.provision(lane);
    assert.equal(v.state, "failed");
    assert.ok(v.state === "failed" && v.error.retryable);
    assert.ok("refused" in ws.grant(lane, 1), "no credential while the orphan is live");
    assert.equal(fork().live().length, 2);
    assert.ok(ws.pendingCleanup() > 0 && ws.nextDue() !== null);
    ns.failRevoke = false;
    ns.failRevokeOnly = false;
    ws.open(lane, 1, clock.t + LEASE_MS);
    assert.equal((await ws.provision(lane)).state, "ready");
    assert.equal(fork().live().length, 1);
    assert.deepEqual(ws.duties().filter((d) => d.state !== "done").map((d) => d.kind), ["mint"], "only the ambiguous attempt is still watched");
  });
}

// ------------------------------------------------------------------ review f2f25fda, P1: remote steps with no answer

test("restart while a fork creation is outstanding: its 24-hour token is revoked when it appears, and the duty lasts until its bound", async () => {
  const { clock, ns, ws, lane, fork } = setup();
  const entered = deferred();
  const release = deferred();
  const remoteDone = deferred();
  const canon = ns.repos.get("canon")!;
  const realFork = canon.fork.bind(canon);
  canon.fork = async (name: string) => {
    entered.resolve();
    await release.promise;
    await realFork(name);
    remoteDone.resolve();
    return await new Promise<never>(() => {}); // the stopped host never hears back
  };
  ws.open(lane, 1, clock.t + LEASE_MS);
  void ws.provision(lane);
  await entered.promise;
  const restarted = new Workspaces({ sql: ws["sql"], artifacts: ns, canonical: "canon", namespace: "ns", now: clock.now, sleep: async () => {} });
  assert.equal(await restarted.reconcile(), 1, "an absent fork proves nothing while its creation is in flight");
  assert.ok(restarted.nextDue() !== null);
  release.resolve();
  await remoteDone.promise;
  assert.equal(fork().live().length, 1, "the creation token now exists");
  clock.t = Math.max(clock.t, restarted.nextDue()!); // the next scheduled inventory
  assert.equal(await restarted.reconcile(), 1, "still in flight: still owed");
  assert.deepEqual(fork().live(), [], "the creation token was revoked by the scheduled inventory");
  clock.advance(48 * 3_600_000);
  assert.equal(await restarted.reconcile(), 1, "elapsed time never settles it");
  assert.ok(restarted.nextDue() !== null);
});

// ------------------------------------------------------------------ review db683a1d: no fence without a definite answer

test("a fork creation that fails with a transport error, then applies late: the step stays in flight, and its 24-hour token is revoked when it appears", async () => {
  const { clock, ns, ws, lane, fork } = setup();
  const release = deferred();
  const remoteDone = deferred();
  const canon = ns.repos.get("canon")!;
  const realFork = canon.fork.bind(canon);
  let first = true;
  canon.fork = async (name: string) => {
    if (!first) throw new ArtifactsError("INTERNAL_ERROR", 10400);
    first = false;
    // The client sees a connection failure; the server work continues.
    void release.promise.then(async () => {
      await realFork(name);
      remoteDone.resolve();
    });
    throw new TypeError("connection lost after request sent");
  };
  ws.open(lane, 1, clock.t + LEASE_MS);
  assert.equal((await ws.provision(lane)).state, "failed");
  assert.ok(ws.duties().filter((d) => d.kind === "fork-create").every((d) => d.state === "in-flight"), "no attempt was answered");
  assert.ok((await ws.reconcile()) > 0 && ws.nextDue() !== null);
  release.resolve();
  await remoteDone.promise;
  assert.equal(fork().live().length, 1, "the creation token appeared late");
  clock.t = Math.max(clock.t, ws.nextDue()!); // the next scheduled inventory
  await ws.reconcile();
  assert.deepEqual(fork().live(), [], "found and revoked");
});

test("a mint that fails with a transport error, then applies late: the step stays in flight, and the token is revoked when it appears", async () => {
  const { clock, ws, lane, fork } = setup();
  ws.open(lane, 1, clock.t + LEASE_MS);
  await ws.provision(lane);
  await ws.revoke(lane, 1);
  ws.open(lane, 2, clock.t + LEASE_MS);
  const release = deferred();
  const remoteDone = deferred();
  const realCreate = fork().createToken.bind(fork());
  let first = true;
  fork().createToken = async (scope: "write" | "read" = "write", ttl = 86400) => {
    if (!first) return realCreate(scope, ttl);
    first = false;
    void release.promise.then(() => {
      fork().mintRaw(scope, ttl);
      remoteDone.resolve();
    });
    throw new TypeError("connection lost after request sent");
  };
  assert.equal((await ws.provision(lane)).state, "ready", "the retry is a new step and succeeds");
  const g = ws.grant(lane, 2);
  assert.deepEqual(ws.duties().filter((d) => d.state !== "done").map((d) => [d.kind, d.state]), [["mint", "in-flight"]]);
  release.resolve();
  await remoteDone.promise;
  assert.equal(fork().live().length, 2, "the first attempt applied late");
  clock.t = Math.max(clock.t, ws.nextDue()!); // the next scheduled inventory
  await ws.reconcile();
  const live = fork().live();
  assert.equal(live.length, 1);
  assert.equal(fork().tokens.get(live[0]!)?.plaintext, !("refused" in g) ? g.token : "", "the lease keeps its own token");
});

test("a paused fork creation that applies after 25 hours is still found, and an Artifacts refusal that changed nothing does close a step", async () => {
  const { clock, ns, ws, lane, fork } = setup();
  const entered = deferred();
  const release = deferred();
  const remoteDone = deferred();
  const canon = ns.repos.get("canon")!;
  const realFork = canon.fork.bind(canon);
  canon.fork = async (name: string) => {
    entered.resolve();
    await release.promise;
    await realFork(name);
    remoteDone.resolve();
    return await new Promise<never>(() => {});
  };
  ws.open(lane, 1, clock.t + LEASE_MS);
  void ws.provision(lane);
  await entered.promise;
  const restarted = new Workspaces({ sql: ws["sql"], artifacts: ns, canonical: "canon", namespace: "ns", now: clock.now, sleep: async () => {} });
  clock.advance(25 * 3_600_000 + 1);
  assert.equal(await restarted.reconcile(), 1);
  release.resolve();
  await remoteDone.promise;
  assert.equal(fork().live().length, 1);
  clock.t = Math.max(clock.t, restarted.nextDue()!); // the next scheduled inventory
  await restarted.reconcile();
  assert.deepEqual(fork().live(), []);

  // Control: a definite refusal (INVALID_TTL) closes the mint step at once.
  const s2 = setup();
  s2.ws.open(s2.lane, 1, s2.clock.t + LEASE_MS);
  await s2.ws.provision(s2.lane);
  await s2.ws.revoke(s2.lane, 1);
  s2.ws.open(s2.lane, 2, s2.clock.t + LEASE_MS);
  s2.ns.mintDelays.push(async () => {
    throw new ArtifactsError("INVALID_TTL", 10003);
  });
  assert.equal((await s2.ws.provision(s2.lane)).state, "failed");
  const mints = s2.ws.duties().filter((d) => d.kind === "mint");
  assert.equal(mints[mints.length - 1]!.state, "answered", "refused-unchanged is a definite answer");
  await s2.ws.sweep();
  assert.ok(s2.ws.duties().every((d) => d.state === "done"), "and the next inventory settles it");
});

test("restart while a mint is outstanding on a verified fork, then a later lease: the old token is revoked when it appears, the new lease keeps its own", async () => {
  const { clock, ns, ws, lane, fork } = setup();
  ws.open(lane, 1, clock.t + LEASE_MS);
  await ws.provision(lane); // the fork exists, verified
  await ws.revoke(lane, 1);
  ws.open(lane, 2, clock.t + LEASE_MS);
  const entered = deferred();
  const release = deferred();
  const remoteDone = deferred();
  const realCreate = fork().createToken.bind(fork());
  let held = true;
  fork().createToken = async (scope: "write" | "read" = "write", ttl = 86400) => {
    if (!held) return realCreate(scope, ttl);
    held = false;
    entered.resolve();
    await release.promise;
    fork().mintRaw(scope, ttl);
    remoteDone.resolve();
    return await new Promise<never>(() => {}); // no answer reaches the stopped host
  };
  void ws.provision(lane);
  await entered.promise;
  const restarted = new Workspaces({ sql: ws["sql"], artifacts: ns, canonical: "canon", namespace: "ns", now: clock.now, sleep: async () => {} });
  assert.equal(await restarted.reconcile(), 1, "the mint is in flight");
  // The lane is taken over: lease 3 provisions on the new host while the old mint is unresolved.
  restarted.open(lane, 3, clock.t + LEASE_MS);
  assert.equal((await restarted.provision(lane)).state, "ready");
  const g = restarted.grant(lane, 3);
  assert.ok(!("refused" in g));
  release.resolve();
  await remoteDone.promise;
  assert.equal(fork().live().length, 2, "the old mint has now applied");
  clock.t = Math.max(clock.t, restarted.nextDue()!); // the next scheduled inventory
  await restarted.reconcile();
  const live = fork().live();
  assert.equal(live.length, 1, "the late token is revoked");
  assert.equal(fork().tokens.get(live[0]!)?.plaintext, !("refused" in g) ? g.token : "", "lease 3 keeps its own");
});

test("each fork-creation retry is its own step: an earlier attempt's late side effect is still found", async () => {
  const { clock, ns, ws, lane, fork } = setup();
  const release = deferred();
  const remoteDone = deferred();
  const canon = ns.repos.get("canon")!;
  const realFork = canon.fork.bind(canon);
  let first = true;
  canon.fork = async (name: string) => {
    if (!first) return realFork(name);
    first = false;
    // Attempt 1 fails at the client; its server work later leaves a 24-hour token on the fork.
    void release.promise.then(() => {
      ns.repos.get(name)!.mintRaw("write", 86400);
      remoteDone.resolve();
    });
    throw new TypeError("connection lost after request sent");
  };
  ws.open(lane, 1, clock.t + LEASE_MS);
  assert.equal((await ws.provision(lane)).state, "ready", "attempt 2 created the fork");
  release.resolve();
  await remoteDone.promise;
  assert.equal(fork().live().length, 2);
  clock.t = Math.max(clock.t, ws.nextDue()!);
  await ws.reconcile();
  assert.equal(fork().live().length, 1, "attempt 1 was still watched, so its late token is revoked");
});

test("a known token's debt ends once that token has expired, even if Artifacts never confirms the revocation", async () => {
  const { clock, ns, ws, lane, fork } = setup();
  ws.open(lane, 1, clock.t + LEASE_MS);
  await ws.provision(lane);
  ns.failRevokeOnly = true;
  assert.ok((await ws.revoke(lane, 1)) > 0, "the release's token revocation is owed");
  clock.advance(LEASE_MS + 1_000); // the token has expired
  assert.equal(await ws.sweep(), 0);
  assert.ok(ws.duties().some((d) => d.kind === "token" && d.doneReason === "expired"));
  assert.deepEqual(fork().live(), []);
});

// ------------------------------------------------------------------ review 61c31068: a busy fork backs off

for (const code of ["FORK_IN_PROGRESS", "CREATE_IN_PROGRESS"] as const) {
  test(`while the fork lookup answers ${code}, cleanup backs off across repeated alarms and a restart, then finds the late tokens without disturbing the lease`, async () => {
    const { clock, ns, ws, lane, fork } = setup();
    const name = forkName("canon", lane);
    const canon = ns.repos.get("canon")!;
    const realFork = canon.fork.bind(canon);
    const late: (() => void)[] = [];
    canon.fork = async (n: string) => {
      // Each attempt fails at the client; its server work is held for later.
      late.push(() => {
        if (!ns.repos.has(n)) void realFork(n).catch(() => undefined);
        else ns.repos.get(n)!.mintRaw("write", 86400);
      });
      ns.busy.set(n, code); // from now on the name answers "in progress"
      throw new TypeError("connection lost after request sent");
    };
    ws.open(lane, 1, clock.t + LEASE_MS);
    assert.equal((await ws.provision(lane)).state, "failed");
    const steps = ws.duties().filter((d) => d.kind === "fork-create");
    assert.ok(steps.length >= 1 && steps.every((d) => d.state === "in-flight"));
    // Ten alarm firings, each at nextDue: the next check moves later every time, and nothing is settled.
    let previous = ws.nextDue()!;
    const gaps: number[] = [];
    for (let i = 0; i < 10; i++) {
      clock.t = Math.max(clock.t, ws.nextDue()!);
      await ws.reconcile();
      const due = ws.nextDue()!;
      assert.ok(due > clock.t, `firing ${i}: the next check is in the future`);
      gaps.push(due - previous);
      previous = due;
    }
    assert.ok(gaps[gaps.length - 1]! > gaps[0]!, "the backoff grows");
    assert.ok(Math.max(...gaps) <= 30 * 60_000 + 1, "and is capped at 30 minutes");
    assert.ok(ws.duties().filter((d) => d.kind === "fork-create").every((d) => d.state === "in-flight"), "busy never completes a step");
    // A restart: the new host's first alarm is not overdue in a loop either.
    const restarted = new Workspaces({ sql: ws["sql"], artifacts: ns, canonical: "canon", namespace: "ns", now: clock.now, sleep: async () => {} });
    clock.t = Math.max(clock.t, restarted.nextDue()!);
    await restarted.reconcile();
    assert.ok(restarted.nextDue()! > clock.t);
    // The name stops answering "in progress", and a lease provisions on the new host.
    ns.busy.delete(name);
    canon.fork = realFork;
    restarted.open(lane, 1, clock.t + 6 * 3_600_000); // long enough to outlast the next scheduled check
    assert.equal((await restarted.provision(lane)).state, "ready");
    const g = restarted.grant(lane, 1);
    assert.ok(!("refused" in g));
    // The held attempt applies late, leaving a 24-hour token on the fork.
    assert.equal(late.length, 1, "one attempt was sent while the name was absent");
    late.shift()!();
    assert.equal(fork().live().length, 2);
    clock.t = Math.max(clock.t, restarted.nextDue()!);
    await restarted.reconcile();
    const live = fork().live();
    assert.equal(live.length, 1, "the late tokens are revoked");
    assert.equal(fork().tokens.get(live[0]!)?.plaintext, !("refused" in g) ? g.token : "", "the lease keeps its own token");
    assert.ok(restarted.nextDue()! > clock.t, "the unresolved attempts keep being watched, on schedule");
  });
}

test("no open duty is left due after a run, whichever way the run ends", async () => {
  const { clock, ns, ws, lane } = setup();
  ws.open(lane, 1, clock.t + LEASE_MS);
  await ws.provision(lane);
  // Lookup fails with an unexpected error after the release is recorded.
  ns.infoHooks.push(async () => {
    throw new Error("something unexpected");
  });
  await ws.revoke(lane, 1);
  assert.ok(ws.pendingCleanup() > 0);
  assert.ok(ws.nextDue()! > clock.t, "the failed run scheduled its retry");
  // Listing fails.
  ns.failRevoke = true;
  clock.t = ws.nextDue()!;
  await ws.reconcile();
  assert.ok(ws.nextDue()! > clock.t);
});

// ------------------------------------------------------------------ plan 001: a fork inventory counts only when complete and well formed

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
  test(`plan 001: a fork inventory with ${label} proves nothing: the workspace is not ready and gets no grant; across a restart a complete one ends the creation token and keeps the lease's`, async () => {
    const { clock, ns, ws, lane, fork } = setup();
    const canon = ns.repos.get("canon")!.mintRaw("write", 3600); // the canonical repository's own token, unrelated
    ns.listingFault = listing;
    ws.open(lane, 1, clock.t + LEASE_MS);
    const v = await ws.provision(lane);
    assert.notEqual(v.state, "ready");
    assert.ok("refused" in ws.grant(lane, 1), "no grant");
    assert.equal(fork().live().length, 1, "the fork's 24-hour creation token is still live: nothing proved it gone");
    assert.ok(ws.pendingCleanup() > 0 && ws.nextDue() !== null, "the cleanup stays owed and scheduled");
    // A restart over the same storage: the incomplete observation still settles nothing, however often it is seen.
    const restarted = new Workspaces({ sql: ws["sql"], artifacts: ns, canonical: "canon", namespace: "ns", now: clock.now, sleep: async () => {} });
    for (let i = 0; i < 3; i++) {
      clock.t = Math.max(clock.t, restarted.nextDue()!);
      assert.ok((await restarted.reconcile()) > 0);
    }
    assert.ok(restarted.nextDue()! > clock.t, "the next check is in the future");
    restarted.open(lane, 1, clock.t + LEASE_MS);
    assert.notEqual((await restarted.provision(lane)).state, "ready");
    assert.ok("refused" in restarted.grant(lane, 1));
    // A complete listing: the creation token is ended, the lease's recorded token is kept, and the grant is given.
    ns.listingFault = null;
    restarted.open(lane, 1, clock.t + LEASE_MS);
    assert.equal((await restarted.provision(lane)).state, "ready");
    const g = restarted.grant(lane, 1);
    assert.ok(!("refused" in g));
    assert.deepEqual(fork().live(), [g.token.match(/art_v1_(tid_\d+)/)![1]], "exactly one live token: the lease's");
    assert.equal(restarted.pendingCleanup(), 0);
    assert.deepEqual(ns.repos.get("canon")!.live(), [canon.id], "the canonical repository is never swept");
  });
}

test("plan 001: an incomplete inventory after the lease token is minted: not ready, no grant; a complete one makes it ready with only the lease's token", async () => {
  const { clock, ns, ws, lane, fork } = setup();
  // Complete until the lease's token exists, then an empty page that claims a token.
  ns.listingFault = (t) => (ns.minted.length >= 2 ? { tokens: [], total: t.length } : { tokens: t, total: t.length });
  ws.open(lane, 1, clock.t + LEASE_MS);
  assert.notEqual((await ws.provision(lane)).state, "ready");
  assert.ok("refused" in ws.grant(lane, 1));
  ns.listingFault = null;
  ws.open(lane, 1, clock.t + LEASE_MS);
  assert.equal((await ws.provision(lane)).state, "ready");
  assert.equal(fork().live().length, 1);
  assert.ok(!("refused" in ws.grant(lane, 1)));
});

test("plan 001: an unrecorded token on a released fork, while inventories are incomplete: the cleanup stays owed across a restart until a complete one revokes it; the canonical token is untouched", async () => {
  const { clock, ns, ws, lane, fork } = setup();
  const canon = ns.repos.get("canon")!.mintRaw("write", 3600);
  ws.open(lane, 1, clock.t + LEASE_MS);
  assert.equal((await ws.provision(lane)).state, "ready");
  const orphan = fork().mintRaw("write", 3600); // minted, its answer lost: nobody recorded it
  ns.listingFault = (t) => ({ tokens: t.filter((x) => x.id !== orphan.id), total: t.length });
  assert.ok((await ws.revoke(lane, 1)) > 0, "the inventory owed on release is not settled");
  const restarted = new Workspaces({ sql: ws["sql"], artifacts: ns, canonical: "canon", namespace: "ns", now: clock.now, sleep: async () => {} });
  for (let i = 0; i < 4; i++) {
    clock.t = Math.max(clock.t, restarted.nextDue()!);
    assert.ok((await restarted.reconcile()) > 0);
    assert.ok(restarted.nextDue()! > clock.t);
  }
  assert.equal(fork().tokens.get(orphan.id)?.state, "active");
  ns.listingFault = null;
  clock.t = Math.max(clock.t, restarted.nextDue()!);
  assert.equal(await restarted.reconcile(), 0);
  assert.deepEqual(fork().live(), []);
  assert.equal(restarted.nextDue(), null);
  assert.deepEqual(ns.repos.get("canon")!.live(), [canon.id]);
});

// ------------------------------------------------------------------ plan 002: a foreign occupant is an observation, not an unknown step's answer

/** A repository not of this canonical repo, recording every call made on it. Only `info` (the provenance check) may be. */
function foreign(ns: FakeNamespace, name: string): { repo: FakeRepo; calls: string[]; theirs: string } {
  const repo = new FakeRepo(ns, name, "artifacts:ns/other-canon");
  const theirs = repo.mintRaw("write", 7 * 24 * 3600).id;
  const calls: string[] = [];
  const methods = repo as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
  for (const m of ["createToken", "revokeToken", "listTokens", "info", "fork", "log", "readTree", "readCommit"]) {
    const real = methods[m]!.bind(repo);
    methods[m] = async (...a: unknown[]) => {
      calls.push(m);
      return real(...a);
    };
  }
  return { repo, calls, theirs };
}

/** A fork creation sent by a host that then stops: no answer ever arrives. Returns a function that applies it late. */
function lostForkCreate(ns: FakeNamespace): { sent: Promise<void>; apply: () => Promise<void> } {
  const canon = ns.repos.get("canon")!;
  const realFork = canon.fork.bind(canon);
  const sent = deferred();
  let name = "";
  canon.fork = async (n: string) => {
    name = n;
    canon.fork = realFork;
    sent.resolve();
    return await new Promise<never>(() => {});
  };
  return {
    sent: sent.promise,
    apply: async () => {
      await realFork(name);
    },
  };
}

const restartOf = (ws: Workspaces, ns: FakeNamespace, clock: Clock) =>
  new Workspaces({ sql: ws["sql"], artifacts: ns, canonical: "canon", namespace: "ns", now: clock.now, sleep: async () => {} });
const forkCreates = (ws: Workspaces) => ws.duties().filter((d) => d.kind === "fork-create").map((d) => d.state);

test("plan 002: a fork creation whose answer is lost, a foreign repository at the name, swept and removed, then the old create applies: the step stays in flight and a restarted host revokes the late creation token", async () => {
  const { clock, ns, ws, lane, fork } = setup();
  const name = forkName("canon", lane);
  const late = lostForkCreate(ns);
  ws.open(lane, 1, clock.t + LEASE_MS);
  void ws.provision(lane);
  await late.sent;
  const host = restartOf(ws, ns, clock);
  const other = foreign(ns, name);
  ns.repos.set(name, other.repo);
  assert.equal(await host.sweep(), 1, "the unknown create is still open");
  assert.deepEqual(forkCreates(host), ["in-flight"]);
  assert.ok(host.nextDue() !== null && host.nextDue()! > clock.t, "and scheduled in the future");
  assert.ok(other.calls.every((c) => c === "info"), `only provenance was read: ${other.calls.join(", ")}`);
  assert.deepEqual(other.repo.live(), [other.theirs], "the foreign repository is unchanged");
  assert.equal(ns.deleteCalls, 0);
  // The foreign repository goes away, and the old request applies: a fork of ours, with its 24-hour token.
  ns.repos.delete(name);
  await late.apply();
  assert.equal(fork().live().length, 1);
  const again = restartOf(ws, ns, clock);
  clock.t = Math.max(clock.t, again.nextDue()!);
  await again.reconcile();
  assert.deepEqual(fork().live(), [], "the late creation token is revoked");
  assert.deepEqual(forkCreates(again), ["in-flight"], "still never settled: it was never answered");
  assert.ok(again.nextDue()! > clock.t);
});

test("plan 002: foreign, absent, foreign and ours again, each seen by a restarted host: the unknown create stays in flight on a growing, capped backoff, and the foreign repository is never touched", async () => {
  const { clock, ns, ws, lane, fork } = setup();
  const name = forkName("canon", lane);
  const late = lostForkCreate(ns);
  ws.open(lane, 1, clock.t + LEASE_MS);
  void ws.provision(lane);
  await late.sent;
  const other = foreign(ns, name);
  const gaps: number[] = [];
  const observe = async (occupant: "foreign" | "absent" | "ours") => {
    if (occupant === "foreign") ns.repos.set(name, other.repo);
    else if (occupant === "absent") ns.repos.delete(name);
    const host = restartOf(ws, ns, clock);
    clock.t = Math.max(clock.t, host.nextDue()!);
    await host.reconcile();
    assert.deepEqual(forkCreates(host), ["in-flight"], occupant);
    const due = host.nextDue()!;
    assert.ok(due > clock.t, `${occupant}: the next check is in the future`);
    gaps.push(due - clock.t);
  };
  for (const o of ["foreign", "foreign", "absent", "foreign", "foreign", "absent", "foreign", "foreign"] as const) await observe(o);
  assert.ok(gaps[gaps.length - 1]! > gaps[0]!, "the backoff grows");
  assert.ok(Math.max(...gaps) <= 30 * 60_000, "and is capped at 30 minutes");
  assert.ok(other.calls.every((c) => c === "info"), other.calls.join(", "));
  assert.deepEqual(other.repo.live(), [other.theirs]);
  // The name frees and the late create applies: ours, and its token is revoked when next checked.
  ns.repos.delete(name);
  await late.apply();
  await observe("ours");
  assert.deepEqual(fork().live(), []);
  assert.equal(ns.deleteCalls, 0);
});

test("plan 002: a fork creation refused unchanged, then a foreign occupant: the definite answer settles the step, and nothing is owed or touched", async () => {
  const { clock, ns, ws, lane } = setup();
  const name = forkName("canon", lane);
  const canon = ns.repos.get("canon")!;
  const other = foreign(ns, name);
  canon.fork = async () => {
    ns.repos.set(name, other.repo); // another creator took the name first
    throw new ArtifactsError("ALREADY_EXISTS", 10409);
  };
  ws.open(lane, 1, clock.t + LEASE_MS);
  const v = await ws.provision(lane);
  assert.ok(v.state === "failed" && v.error.code === "forbidden");
  assert.equal(await ws.sweep(), 0);
  assert.deepEqual(forkCreates(ws), ["done"]);
  assert.equal(ws.nextDue(), null);
  assert.ok(other.calls.every((c) => c === "info"));
  assert.deepEqual(other.repo.live(), [other.theirs]);
});

test("plan 002: an ordinary fork creation that answered, not yet swept, then a foreign occupant: the answered step settles; only in-flight steps are kept", async () => {
  const { clock, ns, ws, lane } = setup();
  const name = forkName("canon", lane);
  ns.failRevoke = true; // the sweep after the create cannot run, so the answered step stays open
  ws.open(lane, 1, clock.t + LEASE_MS);
  assert.equal((await ws.provision(lane)).state, "failed");
  assert.deepEqual(forkCreates(ws), ["answered"]);
  ns.failRevoke = false;
  const other = foreign(ns, name);
  ns.repos.set(name, other.repo); // our fork, and every token on it, is gone; another repository holds the name
  assert.equal(await ws.sweep(), 0);
  assert.deepEqual(forkCreates(ws), ["done"]);
  assert.equal(ws.nextDue(), null);
  assert.ok(other.calls.every((c) => c === "info"));
  assert.deepEqual(other.repo.live(), [other.theirs]);
});

// ------------------------------------------------------------------ request b6b51de7, reviews a35b4b61 and 3eb7bc44: the canonical repository at public founding

const FIRST = "f".repeat(40);

function setupFounding() {
  const clock = new Clock();
  const ns = new FakeNamespace(clock);
  ns.repos.delete("canon");
  ns.allowCreate = true;
  ns.allowDelete = true;
  const sql = nodeSql();
  const make = () => new Workspaces({ sql, artifacts: ns, canonical: "canon", namespace: "ns", now: clock.now, sleep: async () => {} });
  const ws = make();
  const world = { pushes: 0 };
  const repoAt = (remote: string) => ns.repos.get(/\/([^/]+)\.git$/.exec(remote)![1]!)!;
  // The first commit needs a live write token on the incarnation it is pushed to.
  const firstCommit = async (remote: string, token: string) => {
    world.pushes++;
    const repo = repoAt(remote);
    const t = [...repo.tokens.values()].find((x) => x.plaintext === token);
    assert.ok(t && t.state === "active" && t.scope === "write", "the first commit is pushed with a live write token");
    repo.mainSha = FIRST;
  };
  const prep = (w: Workspaces = ws, push = firstCommit) => w.prepareCanonical("canon", push);
  /** Every incarnation in the namespace. */
  const incarnations = () => [...ns.repos.keys()].filter((n) => n.startsWith("canon-"));
  return { clock, ns, sql, ws, make, world, prep, firstCommit, repoAt, incarnations };
}

const open = (ws: Workspaces) => ws.duties().filter((d) => d.state !== "done").map((d) => [d.kind, d.state]);

/** Make the next delete lose its answer before it applies; returns a function that applies it late. */
function loseNextDelete(ns: FakeNamespace): () => Promise<unknown> {
  const real = ns.delete.bind(ns);
  let late: (() => Promise<unknown>) | null = null;
  ns.delete = async (name: string) => {
    ns.delete = real;
    late = () => real(name);
    throw new TypeError("the delete's answer was lost; it may still apply");
  };
  return () => late!();
}

test("public founding, healthy: one incarnation, named before its create is sent; its own token pushes the first commit and is revoked; nothing is minted; sealed with nothing open", async () => {
  const { ns, ws, world, prep, incarnations } = setupFounding();
  ns.createHooks.push(() => assert.deepEqual(open(ws), [["repo-create", "in-flight"]], "on record before Artifacts sees it"));
  const name = await prep();
  assert.match(name, /^canon-\d+$/);
  assert.deepEqual(incarnations(), [name]);
  const repo = ns.repos.get(name)!;
  assert.equal(repo.mainSha, FIRST);
  assert.equal(world.pushes, 1);
  assert.equal(ns.minted.length, 1, "only the create's own token: nothing is minted on the canonical repository");
  assert.deepEqual(repo.live(), []);
  ws.sealCanonical(name);
  assert.equal(ws.sealedIncarnation(), name);
  assert.deepEqual(open(ws), []);
  assert.equal(ws.canonicalDue(), null);
  assert.equal(ws.nextDue(), null);
  assert.equal(ns.deleteCalls, 0);
});

test("review 3eb7bc44: a delete whose answer is lost and that applies late, across a restart, reaches only its abandoned incarnation; the sealed one survives", async () => {
  const { clock, ns, ws, make, prep, incarnations } = setupFounding();
  // The first incarnation is abandoned (its first commit is refused), and its delete's answer is lost.
  const lateDelete = loseNextDelete(ns);
  let refusals = 1;
  const refuseOnce = async (remote: string, token: string) => {
    if (refusals-- > 0) return;
    const repo = ns.repos.get(/\/([^/]+)\.git$/.exec(remote)![1]!)!;
    assert.ok([...repo.tokens.values()].some((t) => t.plaintext === token && t.state === "active"));
    repo.mainSha = FIRST;
  };
  const sealed = await prep(ws, refuseOnce);
  const [abandoned] = incarnations().filter((n) => n !== sealed);
  assert.ok(abandoned && abandoned !== sealed, "a new name, never the abandoned one");
  assert.ok(open(ws).some(([k]) => k === "repo-delete"), "the lost delete stays owed");
  // A restart, then the seal.
  const restarted = make();
  restarted.sealCanonical(sealed);
  // The lost delete applies late: it removes only the abandoned incarnation.
  await lateDelete();
  assert.equal(ns.repos.has(sealed), true);
  assert.equal(ns.repos.get(sealed)!.mainSha, FIRST);
  // The alarm, after founding, finds the abandoned incarnation gone and settles it; the sealed one is never touched.
  clock.t = restarted.nextDue()!;
  assert.equal(await restarted.reconcile(), 0);
  assert.deepEqual(open(restarted), []);
  assert.equal(ns.repos.has(sealed), true);
});

test("review 3eb7bc44: the same after the seal and a normal landing: the canonical repository and its later contents survive the late delete", async () => {
  const { clock, ns, ws, prep, incarnations } = setupFounding();
  // A create whose answer is lost, applied: its incarnation is abandoned and its delete's answer is lost too.
  ns.createFailures.push("lost-after-create");
  const lateDelete = loseNextDelete(ns);
  const sealed = await prep();
  ws.sealCanonical(sealed);
  const abandoned = incarnations().find((n) => n !== sealed)!;
  assert.ok(abandoned);
  // Ordinary work: a landing moves main, and the Room mints its own publishing token.
  const repo = ns.repos.get(sealed)!;
  repo.mainSha = "a".repeat(40);
  repo.mintRaw("write", 60);
  await lateDelete();
  assert.equal(ns.repos.has(abandoned), false);
  assert.equal(ns.repos.get(sealed), repo, "the live canonical repository is still there");
  assert.equal(repo.mainSha, "a".repeat(40), "with its landed main");
  assert.equal(repo.live().length, 1, "and the Room's own token");
  clock.t = ws.nextDue()!;
  assert.equal(await ws.reconcile(), 0);
  assert.deepEqual(open(ws), []);
  assert.equal(ns.repos.get(sealed), repo);
});

test("review 3eb7bc44: a lost delete, then NOT_FOUND: the abandoned incarnation is settled as gone, and nothing else is touched", async () => {
  const { clock, ns, ws, prep, incarnations } = setupFounding();
  ns.createFailures.push("lost-after-create");
  // This delete applies, and its answer is lost.
  const real = ns.delete.bind(ns);
  ns.delete = async (name: string) => {
    ns.delete = real;
    await real(name);
    throw new TypeError("the delete applied; its answer was lost");
  };
  const sealed = await prep();
  ws.sealCanonical(sealed);
  const abandoned = incarnations().find((n) => n !== sealed);
  assert.equal(abandoned, undefined, "the abandoned incarnation is gone");
  assert.ok(open(ws).some(([k]) => k === "repo-delete"), "but no answer has said so yet");
  clock.t = ws.nextDue()!;
  assert.equal(await ws.reconcile(), 0, "the next run reads NOT_FOUND and settles it");
  assert.deepEqual(open(ws), []);
  assert.equal(ns.repos.get(sealed)!.mainSha, FIRST);
});

test("public founding: no canonical token is ever minted, so no mint can be left with an unknown outcome (review a35b4b61, 1)", async () => {
  const { ns, ws, prep } = setupFounding();
  const realCreate = ns.create.bind(ns);
  ns.create = async (name: string) => {
    const r = await realCreate(name);
    ns.repos.get(name)!.createToken = async () => {
      throw new Error("a canonical token was minted during founding");
    };
    return r;
  };
  const name = await prep();
  ws.sealCanonical(name);
  assert.equal(ns.minted.length, 1);
  assert.equal(ws.duties().filter((d) => d.kind === "mint").length, 0);
});

test("public founding: a create whose answer is lost and that applied, across a restart: a new incarnation is made; the unvouched one is deleted with its token", async () => {
  const { ns, ws, make, prep, incarnations } = setupFounding();
  ns.createFailures.push("lost-after-create");
  const restarted = make();
  void ws;
  const name = await prep(restarted);
  assert.equal(incarnations().length, 1, "the lost one was deleted, with its 24-hour token");
  assert.equal(incarnations()[0], name);
  restarted.sealCanonical(name);
  assert.deepEqual(open(restarted), []);
  assert.deepEqual(ns.repos.get(name)!.live(), []);
});

test("public founding: a create whose answer is lost and that applies only after the seal: a different name, so the late create cannot touch the room's repository; the alarm deletes it", async () => {
  const { clock, ns, ws, prep, incarnations } = setupFounding();
  let late: (() => Promise<unknown>) | null = null;
  const realCreate = ns.create.bind(ns);
  ns.create = async (name: string) => {
    ns.create = realCreate;
    late = () => realCreate(name);
    throw new TypeError("connection lost before the answer");
  };
  const sealed = await prep();
  ws.sealCanonical(sealed);
  assert.ok(open(ws).some(([k, st]) => k === "repo-create" && st === "in-flight"), "absence never settles a create in flight");
  assert.notEqual(ws.nextDue(), null, "after founding, the alarm keeps watching it");
  await late!();
  const stray = incarnations().find((n) => n !== sealed)!;
  assert.equal(ns.repos.get(stray)!.live().length, 1);
  clock.t = ws.nextDue()!;
  assert.equal(await ws.reconcile(), 0);
  assert.equal(ns.repos.has(stray), false, "deleted, with its token");
  assert.equal(ns.repos.get(sealed)!.mainSha, FIRST);
  assert.deepEqual(open(ws), []);
});

test("public founding, refused control: a create Artifacts refuses changed nothing; its step is closed and the next name is used", async () => {
  const { ns, ws, prep } = setupFounding();
  ns.createFailures.push(new ArtifactsError("INVALID_REPO_NAME", 10002));
  const name = await prep();
  assert.equal(ns.createCalls, 2);
  ws.sealCanonical(name);
  assert.deepEqual(open(ws), []);
  assert.ok(ws.duties().some((d) => d.kind === "repo-create" && d.doneReason === "refused"));
});

test("public founding: an unconfirmed revocation stays owed and blocks the seal; the alarm confirms it; the retry then seals the same incarnation", async () => {
  const { ns, ws, prep } = setupFounding();
  ns.failRevokeOnly = true;
  await assert.rejects(prep(), /INTERNAL_ERROR/);
  const name = [...ns.repos.keys()][0]!;
  assert.equal(ns.repos.get(name)!.live().length, 1);
  assert.throws(() => ws.sealCanonical(name), /still owes/);
  ns.failRevokeOnly = false;
  assert.equal(await ws.settleCanonical(), 0);
  assert.deepEqual(ns.repos.get(name)!.live(), []);
  assert.equal(await prep(), name);
  ws.sealCanonical(name);
  assert.deepEqual(open(ws), []);
});

test("public founding: when the token is spent and main has no first commit, the incarnation is abandoned and a new one made", async () => {
  const { ns, ws, prep, incarnations } = setupFounding();
  await assert.rejects(ws.prepareCanonical("canon", async () => { throw new Error("push failed"); }), /push failed/);
  assert.equal(await ws.settleCanonical(), 0);
  const name = await prep();
  assert.equal(ns.deleteCalls, 1);
  assert.deepEqual(incarnations(), [name]);
  ws.sealCanonical(name);
});

test("public founding: a refused first commit is not retried with a token that may be dead: a new incarnation is made", async () => {
  const { ns, ws, firstCommit, incarnations } = setupFounding();
  let refusals = 1;
  const name = await ws.prepareCanonical("canon", async (remote, token) => (refusals-- > 0 ? undefined : firstCommit(remote, token)));
  assert.equal(ns.createCalls, 2);
  assert.deepEqual(incarnations(), [name]);
  ws.sealCanonical(name);
});

for (const [label, listing] of [
  ["incomplete (total larger than the page)", (tokens: unknown[]) => ({ tokens, total: tokens.length + 1 })],
  ["missing its total", (tokens: unknown[]) => ({ tokens })],
  ["with a record that has no ID", (tokens: unknown[]) => ({ tokens: [...tokens, { scope: "write", state: "active", expiresAt: new Date(2e12).toISOString() }], total: tokens.length + 1 })],
  ["with a record of an unknown state", (tokens: unknown[]) => ({ tokens: [...tokens, { id: "x", scope: "write", state: "live", expiresAt: new Date(2e12).toISOString() }], total: tokens.length + 1 })],
] as const) {
  test(`public founding: a token inventory ${label} proves nothing; founding waits, and seals once a complete inventory is clean (review a35b4b61, 2)`, async () => {
    const { ns, ws, prep } = setupFounding();
    let broken = true;
    const create = ns.create.bind(ns);
    ns.create = async (name: string) => {
      const r = await create(name);
      const repo = ns.repos.get(name)!;
      const real = repo.listTokens.bind(repo);
      repo.listTokens = async () => (broken ? (listing((await real()).tokens) as never) : real());
      return r;
    };
    await assert.rejects(prep(), /incomplete or malformed/);
    const name = [...ns.repos.keys()][0]!;
    assert.throws(() => ws.sealCanonical(name), /still owes/);
    assert.ok(open(ws).some(([k, st]) => k === "inventory" && st === "owed"));
    assert.ok(ws.canonicalDue() !== null);
    broken = false;
    assert.equal(await prep(), name);
    ws.sealCanonical(name);
  });
}

test("public founding: an active token nobody owes makes the incarnation unvouched: abandoned, deleted, and a new one made", async () => {
  const { ns, ws, prep, incarnations } = setupFounding();
  const realCreate = ns.create.bind(ns);
  ns.create = async (name: string) => {
    const r = await realCreate(name);
    if (ns.createCalls === 1) ns.repos.get(name)!.mintRaw("write", 3600); // someone else's token
    return r;
  };
  const name = await prep();
  assert.equal(ns.deleteCalls, 1);
  assert.deepEqual(incarnations(), [name]);
  assert.deepEqual(ns.repos.get(name)!.live(), []);
  ws.sealCanonical(name);
});

test("the seal refuses an incarnation that is not the holder, or that is abandoned", async () => {
  const { ws, prep } = setupFounding();
  const name = await prep();
  assert.throws(() => ws.sealCanonical(`${name}x`), /still owes/);
  ws.sealCanonical(name);
  assert.throws(() => ws.sealCanonical(name), /still owes/, "sealed once");
});

test("after founding, nothing touches the sealed incarnation: the Room's own tokens are never swept", async () => {
  const { ns, ws, prep } = setupFounding();
  const name = await prep();
  ws.sealCanonical(name);
  const repo = ns.repos.get(name)!;
  repo.mintRaw("write", 60);
  assert.equal(await ws.settleCanonical(), 0);
  assert.equal(await ws.reconcile(), 0);
  assert.equal(ws.nextDue(), null);
  assert.equal(ws.canonicalDue(), null);
  assert.equal(repo.live().length, 1, "untouched");
  assert.equal(ns.deleteCalls, 0);
});

// ------------------------------------------------------------------ an import's canonical repository

test("a canonical repository with no founding ledger (an import): nothing reaches it, and its work and publishing token survive", async () => {
  const clock = new Clock();
  const ns = new FakeNamespace(clock);
  ns.allowDelete = true;
  const canon = ns.repos.get("canon")!;
  canon.mainSha = "a".repeat(40);
  canon.mintRaw("write", 60);
  const ws = new Workspaces({ sql: nodeSql(), artifacts: ns, canonical: "canon", namespace: "ns", now: clock.now, sleep: async () => {} });
  assert.equal(await ws.settleCanonical(), 0);
  assert.equal(await ws.reconcile(), 0);
  assert.equal(await ws.sweep(), 0);
  assert.equal(ws.nextDue(), null);
  assert.equal(ws.canonicalDue(), null);
  assert.equal(ns.deleteCalls, 0);
  assert.equal(canon.live().length, 1);
  assert.equal(canon.mainSha, "a".repeat(40));
});

// ------------------------------------------------------------------ plan 004: a wake-up is stored before each founding create is sent

/** Public founding with a `wake` that records what was on record when it was called, and rejects the calls numbered in `fail` (from 0). */
function setupWaking(fail: readonly number[] = []) {
  const base = setupFounding();
  const wakes: { at: number; createCalls: number; storedBeforeCreate: boolean; open: string[][] }[] = [];
  const ws: Workspaces = new Workspaces({
    sql: base.sql,
    artifacts: base.ns,
    canonical: "canon",
    namespace: "ns",
    now: base.clock.now,
    sleep: async () => {},
    wake: async (at) => {
      const w = { at, createCalls: base.ns.createCalls, storedBeforeCreate: false, open: open(ws) };
      wakes.push(w);
      await new Promise((r) => setTimeout(r, 1)); // storage takes a moment
      if (fail.includes(wakes.length - 1)) throw new Error("the alarm could not be stored");
      w.storedBeforeCreate = base.ns.createCalls === w.createCalls; // nothing was sent while it was being stored
    },
  });
  return { ...base, ws, wakes };
}

test("plan 004: the founding wake-up is stored after the create step is on record and before the create is sent, for the earliest outstanding work", async () => {
  const { clock, ns, ws, wakes, firstCommit } = setupWaking();
  ns.createFailures.push("lost-after-create"); // the first create applies and its answer is lost: a second is made
  const name = await ws.prepareCanonical("canon", firstCommit);
  assert.equal(ns.createCalls, 2);
  assert.equal(wakes.length, 2, "one wake-up before each create");
  assert.deepEqual(wakes.map((w) => w.createCalls), [0, 1], "each before its create was sent");
  assert.ok(wakes.every((w) => w.storedBeforeCreate), "and each create waited until its wake-up was stored");
  assert.deepEqual(wakes[0]!.open, [["repo-create", "in-flight"]], "after the step was recorded");
  assert.ok(wakes.every((w) => w.at <= clock.t), "at the earliest outstanding work: the new step is due now");
  ws.sealCanonical(name);
});

test("plan 004: a wake-up that cannot be stored sends no create; the step is closed as never sent, the debt already recorded is kept, and the next attempt founds", async () => {
  const { ns, ws, wakes, firstCommit } = setupWaking([1]);
  // The first create applies and its answer is lost: its incarnation is recorded debt before the second create.
  ns.createFailures.push("lost-after-create");
  await assert.rejects(ws.prepareCanonical("canon", firstCommit), /alarm could not be stored/);
  assert.equal(ns.createCalls, 1, "the second create was not sent");
  assert.equal(wakes.length, 2);
  assert.deepEqual(
    ws.duties().map((d) => [d.kind, d.state, d.reason, d.doneReason]),
    [
      ["repo-create", "in-flight", "repo-create", null],
      ["repo-create", "done", "repo-create", "not-sent"],
    ],
  );
  assert.ok(ws.canonicalDue() !== null, "the recorded debt stays scheduled for the alarm");
  const name = await ws.prepareCanonical("canon", firstCommit);
  assert.equal(ns.createCalls, 2);
  ws.sealCanonical(name);
});

// ------------------------------------------------------------------ request d29c09fa: safe metadata at durable sinks

/** Every row, the lane's view and the duties: none may hold the provider's text. */
function clean(what: string, ws: Workspaces, lane: ReturnType<typeof laneId>, ...more: unknown[]): void {
  noEcho(what, everyRow(ws["sql"]), ws.view(lane), ws.duties(), ...more);
}
const stepErrors = (ws: Workspaces) => ws["sql"].all("SELECT kind, last_error FROM artroom_ws_duty WHERE last_error IS NOT NULL ORDER BY id").map((r) => [r["kind"], r["last_error"]]);

test("d29c09fa: a fork that keeps failing with the provider's text: the failed view, its stored row and the steps keep safe metadata only", async () => {
  const { clock, ns, ws, lane } = setup();
  for (let i = 0; i < 5; i++) ns.forkFailures.push(echoing());
  ws.open(lane, 1, clock.t + LEASE_MS);
  const v = await ws.provision(lane);
  assert.ok(v.state === "failed");
  assert.equal(v.error.message, echoNote("could not provision the workspace"));
  assert.equal(v.error.code, "unavailable");
  const steps = stepErrors(ws);
  assert.equal(steps.length, 5);
  for (const s of steps) assert.deepEqual(s, ["fork-create", echoNote("workspace step failed")]);
  clean("a failed provisioning", ws, lane, v);
});

test("d29c09fa: a step refused with the provider's text is answered, and its row keeps safe metadata only", async () => {
  const { clock, ns, ws, lane } = setup();
  ns.forkFailures.push(echoing({ code: "INVALID_INPUT", numericCode: 10001, status: 400 }));
  ws.open(lane, 1, clock.t + LEASE_MS);
  const v = await ws.provision(lane);
  assert.ok(v.state === "failed");
  assert.equal(v.error.message, "could not provision the workspace: Error INVALID_INPUT (10001) status 400");
  assert.deepEqual(stepErrors(ws), [["fork-create", "workspace step failed: Error INVALID_INPUT (10001) status 400"]]);
  clean("a refused step", ws, lane, v);
});

test("d29c09fa: cleanup that fails with the provider's text stays owed, and its row keeps safe metadata only", async () => {
  const { clock, ws, lane, fork } = setup();
  ws.open(lane, 1, clock.t + LEASE_MS);
  assert.equal((await ws.provision(lane)).state, "ready");
  fork().revokeToken = async () => {
    throw echoing();
  };
  assert.ok((await ws.revoke(lane, 1)) > 0, "cleanup is owed");
  const owed = stepErrors(ws);
  assert.ok(owed.length > 0);
  for (const [, e] of owed) assert.equal(e, echoNote("workspace cleanup failed"));
  clean("failed cleanup", ws, lane);
});

test("d29c09fa, reopen: a failed workspace and steps stored with provider text show only safe metadata before any retry, and the scrub rewrites them once", async () => {
  const { clock, ns, ws, lane } = setup();
  for (let i = 0; i < 5; i++) ns.forkFailures.push(echoing());
  ws.open(lane, 1, clock.t + LEASE_MS);
  assert.equal((await ws.provision(lane)).state, "failed");
  // Legacy rows, as stored before the rule: the provider's message, with only the token pattern redacted.
  const sql = ws["sql"];
  const legacyText = `Could not provision the workspace: ${echoing().message}`;
  const error = JSON.parse(String(sql.all("SELECT error FROM artroom_ws WHERE lane = ?", lane)[0]!["error"]));
  sql.all("UPDATE artroom_ws SET error = ? WHERE lane = ?", JSON.stringify({ ...error, message: legacyText }), lane);
  sql.all("UPDATE artroom_ws_duty SET last_error = ?", echoing().message);
  // Reopen: a new instance on the same storage, before any step runs.
  const reopened = new Workspaces({ sql, artifacts: ns, canonical: "canon", namespace: "ns", now: clock.now, sleep: async () => {} });
  const v = reopened.view(lane);
  assert.ok(v?.state === "failed");
  assert.equal(v.error.message, `could not provision the workspace: ${WITHHELD}`);
  noEcho("the reopened view", v, reopened.duties());
  // Ending the workspace does not erase its row: a revoked row keeps its error, and the upgrade covers it too.
  sql.all("UPDATE artroom_ws SET state = 'revoked' WHERE lane = ?", lane);
  scrubLegacyErrors(sql);
  assert.equal(JSON.parse(String(sql.all("SELECT error FROM artroom_ws WHERE lane = ?", lane)[0]!["error"])).message, `could not provision the workspace: ${WITHHELD}`);
  for (const [, e] of stepErrors(reopened)) assert.equal(e, `workspace step failed: ${WITHHELD}`);
  noEcho("the scrubbed rows", everyRow(sql));
  {
    const once = everyRow(sql);
    scrubLegacyErrors(sql); // a second run changes nothing
    assert.equal(everyRow(sql), once);
  }
});
