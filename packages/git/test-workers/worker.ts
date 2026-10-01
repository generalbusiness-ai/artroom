// A test Worker for the workerd tests: a Room Durable Object hosting the
// landing engine on Durable Object SQLite and alarms, and a fake canonical
// repository in another Durable Object, so that it survives the Room's crash
// and can apply a push the Room never hears about.
import { DurableObject } from "cloudflare:workers";
import type { ActId, LaneId, OpId, PolicyVersion, Seq, Sha, SystemEvent } from "@generalbusiness/artroom-contract";
import { Landing, type FaultPoint, type PublisherPort } from "../src/landing/engine.ts";
import type { LaneFacts, LandingRoom, Readiness } from "../src/landing/types.ts";
import { durableSql, type Sql } from "../src/sql.ts";
import type { PushOutcome } from "../src/publisher/push-outcome.ts";

export { ArtifactsGateway } from "../src/publisher/container.ts";

interface Env {
  ROOM: DurableObjectNamespace<TestRoom>;
  REMOTE: DurableObjectNamespace<FakeRemote>;
}

export const BASE = "1".repeat(40) as Sha;

async function sha1ish(s: string): Promise<Sha> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].slice(0, 20).map((b) => b.toString(16).padStart(2, "0")).join("") as Sha;
}

/** A canonical repo's main, with git's compare-and-swap, and pushes a test can hold. */
export class FakeRemote extends DurableObject<Env> {
  private readonly waiters = new Map<number, (o: PushOutcome) => void>();

  async main(): Promise<Sha> {
    return ((await this.ctx.storage.get<string>("main")) ?? BASE) as Sha;
  }
  async setHold(on: boolean): Promise<void> {
    await this.ctx.storage.put("hold", on);
  }
  async pushes(): Promise<number> {
    return (await this.ctx.storage.get<number>("pushes")) ?? 0;
  }
  async pending(): Promise<number[]> {
    return [...(await this.ctx.storage.list<unknown>({ prefix: "pending:" })).keys()].map((k) => Number(k.slice(8)));
  }
  private async apply(expected: Sha, integration: Sha): Promise<PushOutcome> {
    const main = await this.main();
    if (main === integration) return { outcome: "landed", detail: "= [up to date]" };
    if (main !== expected) return { outcome: "rejected", reason: "lease", detail: "! [remote rejected] (stale ref)" };
    await this.ctx.storage.put("main", integration);
    return { outcome: "landed", detail: "updated" };
  }
  /** A push. When held, it is recorded as received and applied only on `release`. */
  async push(n: number, expected: Sha, integration: Sha): Promise<PushOutcome> {
    await this.ctx.storage.put("pushes", (await this.pushes()) + 1);
    if (await this.ctx.storage.get<boolean>("hold")) {
      await this.ctx.storage.put(`pending:${n}`, { expected, integration });
      return new Promise((resolve) => this.waiters.set(n, resolve));
    }
    return this.apply(expected, integration);
  }
  /** Apply a held push now, whether or not anyone still waits for its answer. */
  async release(n: number): Promise<PushOutcome> {
    const p = await this.ctx.storage.get<{ expected: Sha; integration: Sha }>(`pending:${n}`);
    if (!p) throw new Error(`no pending push ${n}`);
    await this.ctx.storage.delete(`pending:${n}`);
    const out = await this.apply(p.expected, p.integration);
    this.waiters.get(n)?.(out);
    return out;
  }
}

const POLICY = "act_1_00000001" as PolicyVersion;

/** A Room stand-in that hosts `Landing` the way lane A's Room will. */
export class TestRoom extends DurableObject<Env> implements LandingRoom {
  private readonly sql: Sql;
  private readonly engine: Landing;
  private crashAt: FaultPoint | null = null;
  failRecordOf: SystemEvent["type"] | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = durableSql(ctx.storage);
    this.sql.all("CREATE TABLE IF NOT EXISTS t_log (seq INTEGER PRIMARY KEY, type TEXT NOT NULL, op TEXT, body TEXT NOT NULL)");
    this.sql.all("CREATE TABLE IF NOT EXISTS t_lane (lane TEXT PRIMARY KEY, generation INTEGER, head TEXT, lease INTEGER, holder TEXT)");
    this.sql.all("CREATE TABLE IF NOT EXISTS t_tokens (id TEXT PRIMARY KEY, live INTEGER NOT NULL)");
    const remote = () => env.REMOTE.getByName("canonical");
    const publisher: PublisherPort = {
      integrate: async (req) => ({ kind: "clean", integration: await sha1ish(`${req.expectedMain}+${req.head}`), ref: `refs/artroom/integration/${req.op}/${req.attempt}` }),
      push: (req) => remote().push(req.n, req.expectedMain, req.integration),
      readMain: () => remote().main(),
    };
    this.engine = new Landing({
      sql: this.sql,
      room: this,
      publisher,
      tokens: {
        mint: async () => {
          const id = `tok_${crypto.randomUUID()}`;
          this.sql.all("INSERT INTO t_tokens (id, live) VALUES (?, 1)", id);
          return { id, plaintext: `art_v1_${id.replace(/-/g, "")}?expires=60` };
        },
        revoke: async (id) => {
          this.sql.all("UPDATE t_tokens SET live = 0 WHERE id = ?", id);
          return true;
        },
      },
      fault: (point) => {
        if (point === this.crashAt) {
          this.crashAt = null;
          throw new Error(`crash at ${point}`);
        }
      },
    });
  }

  // LandingRoom
  lane(lane: LaneId): LaneFacts | null {
    const r = this.sql.all("SELECT * FROM t_lane WHERE lane = ?", lane)[0];
    return r ? { generation: Number(r["generation"]), head: r["head"] as Sha, leaseGeneration: Number(r["lease"]), holder: r["holder"] as LaneFacts["holder"] } : null;
  }
  policyVersion(): PolicyVersion {
    return POLICY;
  }
  revalidate(): null {
    return null;
  }
  readiness(): Readiness {
    return { kind: "ready", evidence: [], landInput: null };
  }
  revertScope(): readonly string[] {
    return [];
  }
  record(event: SystemEvent): { seq: Seq; act: ActId } {
    if (event.type === this.failRecordOf) throw new Error(`log append failed for ${event.type}`);
    const seq = Number(this.sql.all("SELECT COALESCE(MAX(seq), 0) + 1 AS s FROM t_log")[0]?.["s"]);
    this.sql.all("INSERT INTO t_log (seq, type, op, body) VALUES (?, ?, ?, ?)", seq, event.type, (event as { op?: string }).op ?? null, JSON.stringify(event));
    return { seq, act: `act_${seq}_0000abcd` as ActId };
  }

  // RPC for the tests
  async setup(lane: LaneId, head: Sha): Promise<void> {
    this.sql.all("INSERT OR REPLACE INTO t_lane (lane, generation, head, lease, holder) VALUES (?, 1, ?, 1, 'held')", lane, head);
    await this.engine.refreshMain();
  }
  accept(id: OpId, lane: LaneId, head: Sha): string {
    const r = this.engine.accept({ id, lane, generation: 1, head, act: "act_900_00000000" as ActId, leaseGeneration: 1, policyVersion: POLICY });
    return "refused" in r ? "refused" : r.state;
  }
  async prepare(id: OpId): Promise<string | undefined> {
    return (await this.engine.prepare(id))?.state;
  }
  /** Reserve and set the alarm in the same synchronous block, so a crash after it still finds the alarm (R-PUB-7). */
  async reserve(id: OpId): Promise<string> {
    try {
      const r = this.engine.reserve(id);
      if (r.kind === "reserved") await this.ctx.storage.setAlarm(Date.now() + 60_000);
      return r.kind;
    } catch (err) {
      return `error: ${(err as Error).message}`;
    }
  }
  /** Errors come back as values, so a crash is an answer the test can check. */
  async publish(): Promise<string> {
    try {
      return String(await this.engine.publish());
    } catch (err) {
      return `error: ${(err as Error).message}`;
    }
  }
  setCrash(point: FaultPoint | null): void {
    this.crashAt = point;
  }
  setFailRecord(type: SystemEvent["type"] | null): void {
    this.failRecordOf = type;
  }
  view(id: OpId): { state: string | undefined; slot: string } {
    return { state: this.engine.view(id)?.state, slot: this.engine.slot().state };
  }
  log(): { type: string; op: string | null }[] {
    return this.sql.all("SELECT type, op FROM t_log ORDER BY seq").map((r) => ({ type: String(r["type"]), op: r["op"] as string | null }));
  }
  liveTokens(): number {
    return Number(this.sql.all("SELECT COUNT(*) AS n FROM t_tokens WHERE live = 1")[0]?.["n"]);
  }
  /** Nested transactions: an inner failure rolls back only the inner part. */
  nested(): string[] {
    this.sql.all("CREATE TABLE IF NOT EXISTS t_nest (v TEXT)");
    this.sql.transaction(() => {
      this.sql.all("INSERT INTO t_nest VALUES ('outer')");
      try {
        this.sql.transaction(() => {
          this.sql.all("INSERT INTO t_nest VALUES ('inner')");
          throw new Error("inner fails");
        });
      } catch {
        // expected
      }
    });
    return this.sql.all("SELECT v FROM t_nest").map((r) => String(r["v"]));
  }

  override async alarm(): Promise<void> {
    await this.engine.reconcile();
    const due = this.engine.nextDue();
    if (due !== null) await this.ctx.storage.setAlarm(Math.max(due, Date.now() + 1000));
  }
}

export default {
  fetch(): Response {
    return new Response("test worker");
  },
};
