// Test support: SQLite through node:sqlite, real git through child_process,
// a fake Room, fake publication tokens, and a canonical repo on disk.
import { DatabaseSync } from "node:sqlite";
import { execFile } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import type { ActId, LaneId, OpId, PolicyVersion, Sha, SystemEvent } from "@generalbusiness/artroom-contract";
import type { Sql, SqlValue, SqlRow } from "../src/sql.ts";
import type { Exec } from "../src/publisher/gitops.ts";
import { GitOps, pinnedRef } from "../src/publisher/gitops.ts";
import type { LaneFacts, LandRecord, LandingRoom, Readiness } from "../src/landing/types.ts";
import type { PublicationTokens, PublisherPort } from "../src/landing/engine.ts";
import type { PushOutcome } from "../src/publisher/push-outcome.ts";

/** node:sqlite as `Sql`. Nested transactions use savepoints, like a Durable Object's transactionSync. */
export function nodeSql(path = ":memory:"): Sql & { db: DatabaseSync } {
  const db = new DatabaseSync(path);
  let depth = 0;
  return {
    db,
    all(query: string, ...bindings: SqlValue[]): SqlRow[] {
      return db.prepare(query).all(...bindings) as SqlRow[];
    },
    transaction<T>(fn: () => T): T {
      const name = `sp${depth++}`;
      db.exec(`SAVEPOINT ${name}`);
      try {
        const out = fn();
        db.exec(`RELEASE ${name}`);
        return out;
      } catch (e) {
        db.exec(`ROLLBACK TO ${name}`);
        db.exec(`RELEASE ${name}`);
        throw e;
      } finally {
        depth--;
      }
    },
  };
}

/** Runs a process with exactly the given environment plus PATH. */
export const localExec: Exec = (argv, opts) =>
  new Promise((resolve) => {
    const [cmd, ...args] = argv;
    execFile(
      cmd!,
      args,
      { cwd: opts.cwd, env: { ...opts.env, PATH: process.env["PATH"] ?? "/usr/bin:/bin" }, timeout: opts.timeoutMs, maxBuffer: 64 << 20 },
      (err, stdout, stderr) => {
        const code = err ? (typeof (err as { code?: unknown }).code === "number" ? ((err as { code: number }).code) : 1) : 0;
        resolve({ code, stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });

export function tmp(prefix = "artroom-git-"): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

/** A plain git helper for building test repositories (not hardened; test data only). */
export async function sh(cwd: string, ...args: string[]): Promise<string> {
  const r = await localExec(["git", "-c", "init.defaultBranch=main", ...args], {
    cwd,
    env: {
      HOME: cwd,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_AUTHOR_NAME: "test",
      GIT_AUTHOR_EMAIL: "test@invalid",
      GIT_COMMITTER_NAME: "test",
      GIT_COMMITTER_EMAIL: "test@invalid",
      GIT_AUTHOR_DATE: "@1700000000 +0000",
      GIT_COMMITTER_DATE: "@1700000000 +0000",
    },
  });
  if (r.code !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}

/** A canonical bare repo with one commit on main, a work clone, and GitOps for the "publisher". */
export class Fixture {
  readonly root = tmp();
  readonly canonical = join(this.root, "canonical.git");
  readonly work = join(this.root, "work");
  readonly ops: GitOps;
  main!: Sha;

  constructor(exec: Exec = localExec) {
    this.ops = new GitOps({ exec, workdir: join(this.root, "publisher"), config: ["protocol.file.allow=always"] });
  }

  async init(files: Record<string, string> = { "README.md": "hello\n", "src/a.txt": lines("a"), "src/b.txt": lines("b") }): Promise<this> {
    mkdirSync(join(this.root, "publisher"));
    await sh(this.root, "init", "-q", "--bare", this.canonical);
    await sh(this.root, "init", "-q", this.work);
    this.write(files);
    await sh(this.work, "add", "-A");
    await sh(this.work, "commit", "-q", "-m", "base");
    await sh(this.work, "push", "-q", this.canonical, "HEAD:refs/heads/main");
    this.main = (await sh(this.work, "rev-parse", "HEAD")) as Sha;
    return this;
  }

  write(files: Record<string, string | null>): void {
    for (const [path, body] of Object.entries(files)) {
      const full = join(this.work, path);
      if (body === null) rmSync(full, { force: true });
      else {
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, body);
      }
    }
  }

  /** Commit `files` on top of `base` and pin it as (lane, generation) in the canonical repo. */
  async propose(lane: string, generation: number, base: string, files: Record<string, string | null>, message = `${lane} g${generation}`): Promise<Sha> {
    await sh(this.work, "checkout", "-q", "--detach", base);
    this.write(files);
    await sh(this.work, "add", "-A");
    await sh(this.work, "commit", "-q", "-m", message);
    const head = (await sh(this.work, "rev-parse", "HEAD")) as Sha;
    await sh(this.work, "push", "-q", this.canonical, `${head}:${pinnedRef(lane, generation)}`);
    return head;
  }

  async canonicalMain(): Promise<string> {
    return sh(this.root, "--git-dir", this.canonical, "rev-parse", "refs/heads/main");
  }

  async show(rev: string, path: string): Promise<string> {
    return sh(this.root, "--git-dir", this.canonical, "show", `${rev}:${path}`);
  }

  dispose(): void {
    cleanup(this.root);
  }
}

export function lines(tag: string, n = 20): string {
  return Array.from({ length: n }, (_, i) => `${tag} line ${i + 1}\n`).join("");
}

export function edit(text: string, line: number, replacement: string): string {
  const ls = text.split("\n");
  ls[line - 1] = replacement;
  return ls.join("\n");
}

const hex8 = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 8);
export const actId = (seq: number): ActId => `act_${seq}_${hex8(String(seq))}`;
export const laneId = (n: number): LaneId => actId(1000 + n);

/** The Room's side, with every fact a test may change. */
export class FakeRoom implements LandingRoom {
  seq = 100;
  readonly log: { seq: number; act: ActId; event: SystemEvent }[] = [];
  readonly lanes = new Map<LaneId, LaneFacts>();
  policy: PolicyVersion = actId(1);
  /** Per-operation re-validation failures (authority, evidence, land input). */
  readonly invalid = new Map<OpId, { reason: "authority-lost" | "evidence-invalid" | "obligation-open"; fix: string }>();
  /** Per-operation readiness; default: ready with one approval. */
  readonly readinessOf = new Map<OpId, (integration: Sha) => Readiness>();
  readinessCalls = 0;

  lane(lane: LaneId): LaneFacts | null {
    return this.lanes.get(lane) ?? null;
  }
  policyVersion(): PolicyVersion {
    return this.policy;
  }
  revalidate(op: LandRecord) {
    return this.invalid.get(op.id) ?? null;
  }
  readiness(op: LandRecord, integration: Sha): Readiness {
    this.readinessCalls++;
    const f = this.readinessOf.get(op.id);
    return f ? f(integration) : { kind: "ready", evidence: [actId(50)], landInput: `sha256:${"0".repeat(64)}` };
  }
  revertScope(): readonly string[] {
    return ["src/**"];
  }
  record(event: SystemEvent): { seq: number; act: ActId } {
    const seq = ++this.seq;
    const act = actId(seq);
    this.log.push({ seq, act, event });
    return { seq, act };
  }
  /** Events of one type, optionally for one operation. */
  events<T extends SystemEvent["type"]>(type: T, op?: OpId): Extract<SystemEvent, { type: T }>[] {
    return this.log
      .map((e) => e.event)
      .filter((e): e is Extract<SystemEvent, { type: T }> => e.type === type && (op === undefined || (e as { op?: OpId }).op === op));
  }
  hold(lane: LaneId, generation: number, head: Sha, leaseGeneration = 1): void {
    this.lanes.set(lane, { generation, head, leaseGeneration, holder: "held" });
  }
}

/** Publication tokens that only count. `live` is every minted, unrevoked token. */
export class FakeTokens implements PublicationTokens {
  minted = 0;
  readonly live = new Set<string>();
  readonly revoked: string[] = [];
  failMint = false;
  async mint() {
    if (this.failMint) throw new Error("Artifacts unavailable (mint)");
    const id = `tok_${++this.minted}`;
    this.live.add(id);
    return { id, plaintext: `art_v1_${"f".repeat(40)}${this.minted}?expires=1` };
  }
  async revoke(id: string) {
    if (this.failRevoke) throw new Error("Artifacts unavailable (revoke)");
    this.revoked.push(id);
    return this.live.delete(id);
  }
  failRevoke = false;
  /** True if this plaintext belongs to a minted, unrevoked token. */
  isLive(plaintext: string): boolean {
    const n = /f{40}(\d+)\?/.exec(plaintext)?.[1];
    return n !== undefined && this.live.has(`tok_${n}`);
  }
}

/** A deferred promise. */
export function deferred<T = void>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}

/**
 * Wraps a publisher so a test can:
 * - hold any push before it reaches the remote (`pausePushes`), then release
 *   it, or make the engine stop waiting for it (`abandon`) while the push
 *   itself still runs later, as a push that outlives its caller would;
 * - make pushes, integrations or reads of main fail (`pushDown`, `down`,
 *   `readMainDown`);
 * - check the push's token when it reaches the remote (`authAtRemote`):
 *   a revoked token is refused before anything is sent (`error`).
 */
export class ControlledPublisher implements PublisherPort {
  readonly inner: PublisherPort;
  pausePushes = false;
  pauseIntegrations = false;
  down = false;
  pushDown = false;
  readMainDown = false;
  authAtRemote: FakeTokens | null = null;
  pushes = 0;
  integrations = 0;
  readonly paused: { n: number; release: () => void; abandon: () => void; done: Promise<unknown> }[] = [];
  readonly pausedIntegrations: { release: () => void }[] = [];
  /** Every push that reached the remote, settled or not. */
  readonly inFlight: Promise<unknown>[] = [];
  private waiters: (() => void)[] = [];

  constructor(inner: PublisherPort) {
    this.inner = inner;
  }

  async integrate(req: Parameters<PublisherPort["integrate"]>[0]) {
    this.integrations++;
    if (this.down) throw new Error("publisher sandbox unavailable");
    if (this.pauseIntegrations) {
      const gate = deferred();
      this.pausedIntegrations.push({ release: () => gate.resolve() });
      for (const w of this.waiters.splice(0)) w();
      await gate.promise;
    }
    return this.inner.integrate(req);
  }

  private remote(req: Parameters<PublisherPort["push"]>[0]): Promise<PushOutcome> {
    if (this.authAtRemote && !this.authAtRemote.isLive(req.token)) {
      return Promise.resolve({ outcome: "error", detail: "HTTP 401 at discovery: token revoked" });
    }
    return this.inner.push(req);
  }

  push(req: Parameters<PublisherPort["push"]>[0]): Promise<PushOutcome> {
    this.pushes++;
    if (this.down || this.pushDown) return Promise.reject(new Error("publisher sandbox unavailable"));
    if (!this.pausePushes) {
      const p = this.remote(req);
      this.inFlight.push(p);
      return p;
    }
    const gate = deferred();
    const answer = deferred<PushOutcome>();
    const done = (async () => {
      await gate.promise;
      return this.remote(req);
    })();
    this.inFlight.push(done);
    done.then((o) => answer.resolve(o), (e) => answer.reject(e));
    this.paused.push({
      n: req.n,
      release: () => gate.resolve(),
      abandon: () => answer.resolve({ outcome: "unknown", detail: "no answer before the deadline" }),
      done,
    });
    for (const w of this.waiters.splice(0)) w();
    return answer.promise;
  }

  async readMain() {
    if (this.down || this.readMainDown) throw new Error("Artifacts unavailable (read main)");
    return this.inner.readMain();
  }

  /** Resolves when `count` pushes (or integrations) are paused. */
  async waitPaused(count: number, what: "push" | "integration" = "push"): Promise<void> {
    const list = () => (what === "push" ? this.paused.length : this.pausedIntegrations.length);
    while (list() < count) await new Promise<void>((r) => this.waiters.push(r));
  }

  /** Wait for every push that reached the remote to finish. */
  async drain(): Promise<void> {
    await Promise.allSettled(this.inFlight);
  }
}

/** A clock tests move by hand. */
export class Clock {
  t = 1_800_000_000_000;
  now = () => this.t;
  advance(ms: number): void {
    this.t += ms;
  }
}

export const opId = (n: number): OpId => `op_land_${n}`;
