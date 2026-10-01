/**
 * Worker `artroom-lb-git`: the publisher sandbox, and a harness Room for live
 * tests against real Artifacts repos.
 *
 * `HarnessRoom` is not the product Room (lane A). It hosts this package's
 * pieces the way the Room will — `Landing`, `Workspaces`, `Pinning`, the
 * bounded diff — with a stand-in for everything else: every lane it is told
 * about is held, there is no policy, and every landing is ready once built.
 * Every route needs the `x-lb-key` header to equal the `LB_KEY` secret.
 *
 * The harness returns workspace tokens to its caller, because the caller is
 * the test driver acting as the lane's agent. The product Room returns them
 * only to the current holder (R-WS-2).
 */

import { DurableObject } from "cloudflare:workers";
import type { ActId, LaneId, OpId, PolicyVersion, Seq, Sha, SystemEvent } from "@generalbusiness/artroom-contract";
import { durableSql, type Sql, text } from "./sql.ts";
import { Landing } from "./landing/engine.ts";
import type { LaneFacts, LandingRoom, LandRecord, Readiness } from "./landing/types.ts";
import { ContainerPublisher, Pinning, type PublisherStub } from "./publisher/client.ts";
import { Workspaces, forkName } from "./workspace/workspaces.ts";
import { type ArtifactsNamespace, canonicalTokens, withRetry } from "./artifacts.ts";
import { TreeCache, changedPaths, previewPlan } from "./diff/treediff.ts";
import { redact } from "./publisher/container.ts";

export { Publisher, ArtifactsGateway } from "./publisher/container.ts";

interface Env {
  readonly ARTIFACTS: Artifacts;
  readonly ARTIFACTS_HOST: string;
  readonly ARTIFACTS_NAMESPACE: string;
  readonly LB_KEY: string;
  readonly PUBLISHER: DurableObjectNamespace<import("./publisher/container.ts").Publisher>;
  readonly HARNESS: DurableObjectNamespace<HarnessRoom>;
}

const POLICY = "act_0_00000000" as PolicyVersion;
const json = (body: unknown, status = 200) =>
  new Response(redactJson(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
/** Workspace grants are the only tokens a response may carry; everything else is redacted. */
function redactJson(body: unknown): string {
  return JSON.stringify(body, (k, v) => (typeof v === "string" && k !== "token" && k !== "seedToken" ? redact(v) : v));
}

export class HarnessRoom extends DurableObject<Env> implements LandingRoom {
  private readonly sql: Sql;
  private readonly cache = new TreeCache();
  private landing: Landing | null = null;
  private workspaces: Workspaces | null = null;
  private pinning: Pinning | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = durableSql(ctx.storage);
    this.sql.all("CREATE TABLE IF NOT EXISTS h_log (seq INTEGER PRIMARY KEY, act TEXT NOT NULL, event TEXT NOT NULL)");
    this.sql.all("CREATE TABLE IF NOT EXISTS h_lane (lane TEXT PRIMARY KEY, generation INTEGER, head TEXT, lease INTEGER, holder TEXT)");
    this.sql.all("CREATE TABLE IF NOT EXISTS h_meta (k TEXT PRIMARY KEY, v TEXT)");
    const repo = this.meta("repo");
    const remote = this.meta("remote");
    if (repo && remote) this.wire(repo, remote);
  }

  private meta(k: string): string | null {
    return text(this.sql.all("SELECT v FROM h_meta WHERE k = ?", k)[0], "v");
  }

  private wire(repo: string, remote: string): void {
    const stub = this.env.PUBLISHER.getByName(repo) as unknown as PublisherStub;
    const artifacts = this.env.ARTIFACTS as unknown as ArtifactsNamespace;
    const opts = { stub, artifacts, canonical: { name: repo, remote } };
    this.pinning = new Pinning(opts);
    this.workspaces = new Workspaces({ sql: this.sql, artifacts, canonical: repo });
    this.landing = new Landing({
      sql: this.sql,
      room: this,
      publisher: new ContainerPublisher(opts),
      tokens: canonicalTokens(() => withRetry(() => artifacts.get(repo))),
    });
  }

  // ------------------------------------------------ LandingRoom (stand-in)

  lane(lane: LaneId): LaneFacts | null {
    const r = this.sql.all("SELECT * FROM h_lane WHERE lane = ?", lane)[0];
    if (!r) return null;
    return {
      generation: Number(r["generation"]),
      head: text(r, "head") as Sha | null,
      leaseGeneration: Number(r["lease"]),
      holder: (text(r, "holder") ?? "held") as LaneFacts["holder"],
    };
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
  private seqCounter: number | null = null;
  record(event: SystemEvent): { seq: Seq; act: ActId } {
    if (this.seqCounter === null) this.seqCounter = Number(this.sql.all("SELECT COALESCE(MAX(seq), 0) AS m FROM h_log")[0]?.["m"] ?? 0);
    const seq = ++this.seqCounter;
    const body = JSON.stringify(event);
    // A synchronous stand-in for the entry hash: the log is not this harness's subject.
    let h = 0;
    for (let i = 0; i < body.length; i++) h = (h * 31 + body.charCodeAt(i)) >>> 0;
    const act = `act_${seq}_${h.toString(16).padStart(8, "0").slice(0, 8)}` as ActId;
    this.sql.all("INSERT INTO h_log (seq, act, event) VALUES (?, ?, ?)", seq, act, body);
    return { seq, act };
  }

  // ------------------------------------------------ alarm

  override async alarm(): Promise<void> {
    if (!this.landing) return;
    await this.landing.reconcile();
    await this.schedule();
  }

  private async schedule(): Promise<void> {
    const due = this.landing?.nextDue();
    if (due != null) await this.ctx.storage.setAlarm(Math.max(due, Date.now() + 50));
  }

  // ------------------------------------------------ routes

  private need<T>(v: T | null, what: string): T {
    if (v === null) throw new Error(`${what}: call /h/init first`);
    return v;
  }

  async handle(route: string, body: Record<string, unknown>): Promise<unknown> {
    const t0 = Date.now();
    const lap = () => Date.now() - t0;
    switch (route) {
      case "create": {
        const name = String(body["repo"]);
        const made = await withRetry(() => this.env.ARTIFACTS.create(name, { setDefaultBranch: "main" }));
        return { remote: made.remote, seedToken: made.token, ms: lap() };
      }
      case "init": {
        const repo = String(body["repo"]);
        const info = await (await this.env.ARTIFACTS.get(repo)).info();
        this.sql.all("INSERT OR REPLACE INTO h_meta (k, v) VALUES ('repo', ?), ('remote', ?)", repo, info.remote);
        // Seal: revoke every token on the canonical repo. From here only per-operation tokens exist.
        const r = await this.env.ARTIFACTS.get(repo);
        let revoked = 0;
        for (const t of (await r.listTokens()).tokens) if (t.state === "active" && (await r.revokeToken(t.id))) revoked++;
        this.wire(repo, info.remote);
        const main = await this.need(this.landing, "landing").refreshMain();
        return { remote: info.remote, main, revoked, ms: lap() };
      }
      case "workspace": {
        const ws = this.need(this.workspaces, "workspaces");
        const lane = body["lane"] as LaneId;
        const lease = Number(body["lease"] ?? 1);
        this.sql.all(
          "INSERT INTO h_lane (lane, generation, head, lease, holder) VALUES (?, 0, NULL, ?, 'held') ON CONFLICT (lane) DO UPDATE SET lease = excluded.lease, holder = 'held'",
          lane,
          lease,
        );
        const opened = ws.open(lane, lease, Date.now() + Number(body["leaseMs"] ?? 15 * 60_000));
        if ("refused" in opened) return { refused: opened };
        const view = await ws.provision(lane);
        const grant = ws.grant(lane, lease);
        return { view, grant, fork: forkName(this.need(this.meta("repo"), "repo"), lane), ms: lap() };
      }
      case "propose": {
        const pin = this.need(this.pinning, "pinning");
        const lane = body["lane"] as LaneId;
        const generation = Number(body["generation"]);
        const head = String(body["head"]) as Sha;
        const repo = this.need(this.meta("repo"), "repo");
        const fork = forkName(repo, lane);
        const forkInfo = await (await this.env.ARTIFACTS.get(fork)).info();
        const step1 = await pin.pinObjects({ name: fork, remote: forkInfo.remote }, head);
        const pinMs = lap();
        if (step1.kind !== "pinned") return { refused: step1, ms: lap() };
        const step2 = await pin.pinRef(lane, generation, head);
        const pinRefMs = lap() - pinMs;
        this.sql.all("UPDATE h_lane SET generation = ?, head = ? WHERE lane = ?", generation, head, lane);
        const canonical = await this.env.ARTIFACTS.get(repo);
        const main = await this.need(this.landing, "landing").refreshMain();
        const d0 = Date.now();
        const diff = await changedPaths(canonical, main, head, { cache: this.cache });
        const diffMs = Date.now() - d0;
        const p0 = Date.now();
        const plan = await previewPlan(canonical, main, head, { cache: this.cache });
        const planMs = Date.now() - p0;
        let preview: unknown = null;
        let previewMs = 0;
        if (plan.kind === "overlap" || body["forcePreview"]) {
          const v0 = Date.now();
          preview = await pin.preview(lane, generation, head);
          previewMs = Date.now() - v0;
        }
        return { pinned: [step1, step2], diff, plan: plan.kind, preview, ms: { pinObjects: pinMs, pinRef: pinRefMs, diff: diffMs, plan: planMs, preview: previewMs, total: lap() } };
      }
      case "land": {
        const landing = this.need(this.landing, "landing");
        const lane = body["lane"] as LaneId;
        const facts = this.lane(lane);
        if (!facts?.head) return { refused: "no proposal" };
        const id = (body["op"] as OpId | undefined) ?? (`op_land_${lane}_${facts.generation}` as OpId);
        await landing.refreshMain().catch(() => undefined);
        const accepted = landing.accept({
          id,
          lane,
          generation: facts.generation,
          head: facts.head,
          act: `act_${900000 + facts.generation}_00000000` as ActId,
          leaseGeneration: facts.leaseGeneration,
          policyVersion: POLICY,
        });
        if ("refused" in accepted) return { refused: accepted };
        if (body["drive"] === false) {
          await this.schedule();
          return { op: landing.view(id), ms: lap() };
        }
        const prep0 = Date.now();
        await landing.prepare(id);
        const prepareMs = Date.now() - prep0;
        const r = landing.reserve(id);
        const pub0 = Date.now();
        if (r.kind === "reserved") await landing.publish();
        const publishMs = Date.now() - pub0;
        await this.schedule();
        return { op: landing.view(id), reserve: r, ms: { prepare: prepareMs, publish: publishMs, total: lap() } };
      }
      case "settle": {
        const landing = this.need(this.landing, "landing");
        await landing.settle(Number(body["rounds"] ?? 20));
        await this.schedule();
        return { slot: landing.slot(), active: landing.activeViews(), ms: lap() };
      }
      case "release": {
        const lane = body["lane"] as LaneId;
        this.sql.all("UPDATE h_lane SET holder = 'released' WHERE lane = ?", lane);
        const invalidated = this.need(this.landing, "landing").laneChanged(lane, "released").map((o: LandRecord) => o.id);
        const revoked = await this.need(this.workspaces, "workspaces").revoke(lane);
        return { invalidated, revoked, after: this.landing?.after() ?? null, ms: lap() };
      }
      case "view": {
        const landing = this.need(this.landing, "landing");
        return { op: body["op"] ? landing.view(body["op"] as OpId) : null, slot: landing.slot(), status: landing.status(), active: landing.activeViews() };
      }
      case "log": {
        return this.sql.all("SELECT seq, act, event FROM h_log ORDER BY seq").map((r) => ({ seq: r["seq"], act: r["act"], event: JSON.parse(String(r["event"])) }));
      }
      case "diff": {
        const repo = await this.env.ARTIFACTS.get(this.need(this.meta("repo"), "repo"));
        const cache = body["cold"] ? new TreeCache() : this.cache;
        const d0 = Date.now();
        const r = await changedPaths(repo, String(body["from"]), String(body["to"]), { cache, ...(body["bounds"] ? { bounds: body["bounds"] as object } : {}) });
        return { kind: r.kind, changes: r.kind === "ok" ? r.changes.length : null, stats: r.stats, bound: r.kind === "too-large" ? r.bound : null, ms: Date.now() - d0 };
      }
      case "reset": {
        const repo = this.need(this.meta("repo"), "repo");
        return { wasRunning: await (this.env.PUBLISHER.getByName(repo) as unknown as { reset(): Promise<boolean> }).reset() };
      }
      default:
        throw new Error(`unknown route ${route}`);
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const m = /^\/h\/([a-z-]+)$/.exec(url.pathname);
    if (request.method !== "POST" || !m) return new Response("Not found\n", { status: 404 });
    if (!env.LB_KEY || request.headers.get("x-lb-key") !== env.LB_KEY) return new Response("Forbidden\n", { status: 403 });
    const body = (await request.json()) as Record<string, unknown>;
    const room = String(body["room"] ?? "");
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(room)) return json({ error: "bad room" }, 400);
    try {
      const stub = env.HARNESS.getByName(room) as unknown as { handle(route: string, body: Record<string, unknown>): Promise<unknown> };
      return json(await stub.handle(m[1]!, body));
    } catch (e) {
      return json({ error: redact(e instanceof Error ? e.message : String(e)) }, 500);
    }
  },
};
