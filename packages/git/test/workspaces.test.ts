// Lane forks and lease-bound tokens (R-CRED-8, R-WS-1 to R-WS-5, R-LANE-8),
// against a fake Artifacts namespace with the binding's shape.
import { test } from "node:test";
import assert from "node:assert/strict";
import { TOKEN_MARGIN_S, Workspaces, forkName } from "../src/workspace/workspaces.ts";
import type { ArtifactsNamespace, MintedToken, RepoHandle, TokenInfo } from "../src/artifacts.ts";
import { Clock, deferred, laneId, nodeSql } from "./support.ts";

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
    const tokens = [...this.tokens].map(([id, t]) => ({ id, scope: t.scope, state: t.state, expiresAt: new Date(t.expiresAt).toISOString() }));
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
  async log() {
    return [];
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
  constructor(clock: Clock) {
    this.clock = clock;
    this.repos.set("canon", new FakeRepo(this, "canon", null));
  }
  async get(name: string) {
    const r = this.repos.get(name);
    if (!r) throw new ArtifactsError("NOT_FOUND", 10404);
    if (this.createGate) await this.createGate;
    return r;
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

test("a fork of this canonical repo whose creation response was lost is reused", async () => {
  const { clock, ns, ws, lane, fork } = setup();
  ns.forkFailures.push("lost-after-create");
  ws.open(lane, 1, clock.t + LEASE_MS);
  assert.equal((await ws.provision(lane)).state, "ready");
  assert.equal(fork().source, "artifacts:ns/canon");
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
