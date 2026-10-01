// Lane forks and lease-bound tokens (R-CRED-8, R-WS-1 to R-WS-5, R-LANE-8),
// against a fake Artifacts namespace with the binding's shape.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Workspaces, forkName } from "../src/workspace/workspaces.ts";
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
    const plaintext = `art_v1_${id}${"a".repeat(30)}?expires=${ttl}`;
    const expiresAt = this.ns.clock.t + ttl * 1000;
    this.tokens.set(id, { plaintext, scope, state: "active", expiresAt, ttl });
    return { id, plaintext, scope, expiresAt: new Date(expiresAt).toISOString() };
  }
  async createToken(scope: "write" | "read" = "write", ttl = 86400) {
    if (ttl < 60) throw new ArtifactsError("INVALID_TTL", 10003);
    return this.mintRaw(scope, ttl);
  }
  async revokeToken(tokenOrId: string) {
    for (const [id, t] of this.tokens) {
      if ((id === tokenOrId || t.plaintext === tokenOrId) && t.state === "active") {
        t.state = "revoked";
        return true;
      }
    }
    return false;
  }
  async listTokens() {
    const tokens = [...this.tokens].map(([id, t]) => ({ id, scope: t.scope, state: t.state, expiresAt: new Date(t.expiresAt).toISOString() }));
    return { tokens, total: tokens.length };
  }
  async info() {
    return { name: this.name, remote: `https://acct.artifacts.cloudflare.net/git/ns/${this.name}.git`, source: this.source };
  }
  async fork(name: string) {
    this.ns.forkCalls++;
    const failure = this.ns.forkFailures.shift();
    if (failure === "lost-after-create") {
      this.ns.repos.set(name, new FakeRepo(this.ns, name, `artifacts:ns/${this.name}`));
      throw new ArtifactsError("INTERNAL_ERROR", 10400);
    }
    if (failure) throw failure;
    if (this.ns.repos.has(name)) throw new ArtifactsError("ALREADY_EXISTS", 10409);
    const repo = new FakeRepo(this.ns, name, `artifacts:ns/${this.name}`);
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
  const ws = new Workspaces({ sql: nodeSql(), artifacts: ns, canonical: "canon", now: clock.now, sleep: async () => {} });
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
  assert.equal(Date.parse(g.expiresAt), clock.t + LEASE_MS);
  const live = fork().live();
  assert.equal(live.length, 1, "only the lease's token is live");
  const t = fork().tokens.get(live[0]!)!;
  assert.equal(t.scope, "write");
  assert.equal(t.ttl, LEASE_MS / 1000);
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
  assert.equal(await ws.revoke(lane), 2);
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
  await ws.revoke(lane);
  ws.open(lane, 2, clock.t + LEASE_MS);
  const gate = deferred();
  ns.createGate = gate.promise;
  const provisioning = ws.provision(lane);
  // The lease ends while provisioning waits on Artifacts.
  await new Promise((r) => setTimeout(r, 5));
  ns.createGate = null;
  const revoking = ws.revoke(lane);
  gate.resolve();
  await Promise.all([provisioning, revoking]);
  assert.deepEqual(fork().live(), []);
  assert.ok("refused" in ws.grant(lane, 2));
});
