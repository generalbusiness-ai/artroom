/**
 * Request 5a7290b9's live harness: the real Room Worker (Room, Registry,
 * lane B's Publisher sandbox, the Artifacts binding) with a key-protected
 * `/lb/` route for measurement, deployed as `artroom-lb-logbig` on the
 * `gitseq-spike` namespace. It serves nothing else.
 *
 * The Room class here is the real one with four harness methods added:
 * `lbNotified` seals large `notified` events (near the 2 MB row bound)
 * through the Room's own sealing; `lbPublishStart` starts the Room's real
 * publication (`RoomCore.publish`) and records its outcome; `lbAbortAfter`
 * resets the instance (`ctx.abort`) mid-publication; `lbStatus` reports the
 * log state, the publisher's own buffer counters and a heap probe.
 * Claims go through the Room's real admission (`submit`).
 */

import { Room as BaseRoom, setAlarmDelay } from "../../src/index.ts";
import { draftRoom, foundRoom } from "../../src/founding.ts";
import { keyPairFromSeed, sign } from "../../src/crypto.ts";
import { unwire, type Wire } from "../../src/errors.ts";
import { getMeta } from "../../src/store.ts";
import type { RoomEnv } from "../../src/config.ts";
import type { RoomCore } from "../../src/core.ts";
import type { ActId, MemberId } from "@generalbusiness/artroom-contract";

export { Registry } from "../../src/index.ts";
export { Publisher, ArtifactsGateway } from "@generalbusiness/artroom-git/publisher";

// The driver decides when to publish: no alarm publishes on its own.
setAlarmDelay(24 * 3600_000);

interface Outcome {
  readonly startedAt: number;
  finishedAt?: number;
  result?: unknown;
  error?: string;
}

const fromHex = (h: string) => new Uint8Array(h.match(/../g)!.map((b) => parseInt(b, 16)));

export class Room extends BaseRoom {
  private lbLast: Outcome | null = null;
  /** The publisher this instance last opened: the Room drops its own reference after a failure. */
  private lbPublisher: { stats: unknown; head: string | null; publishedThrough: number } | null = null;

  constructor(ctx: DurableObjectState, env: RoomEnv) {
    super(ctx, env);
    const ports = this.core.ports as unknown as { log: () => Promise<{ stats: unknown; head: string | null; publishedThrough: number }> };
    const open = ports.log;
    ports.log = async () => (this.lbPublisher = await open());
  }

  /** Seal one `notified` event for each act, with about `bytes` of recipient handles (no decisions). */
  async lbNotified(acts: readonly ActId[], bytes: number): Promise<{ seqs: number[]; bytes: number[] }> {
    const core = this.core;
    const seqs: number[] = [];
    const sizes: number[] = [];
    for (const act of acts) {
      const to = Array.from({ length: Math.floor(bytes / 62) }, (_, i) => `@member${String(i).padStart(6, "0")}${"m".repeat(48)}` as MemberId);
      const e = await core.serial(async () => core.sql.transaction(() => core.sealSystem({ type: "notified", entry: act, decisions: [], to })));
      seqs.push(e.seq);
      sizes.push(new TextEncoder().encode(JSON.stringify(e)).length);
    }
    core.committed();
    return { seqs, bytes: sizes };
  }

  /** Start the Room's own publication, as its alarm would, and keep its outcome for `lbStatus`. */
  async lbPublishStart(): Promise<Outcome> {
    const run: Outcome = { startedAt: Date.now() };
    this.lbLast = run;
    void this.core.publish(true).then(
      (r) => {
        run.result = r;
        run.finishedAt = Date.now();
      },
      (e: unknown) => {
        const x = e as { name?: string; message?: string; code?: string };
        run.error = `${x.name ?? "error"} ${x.code ?? ""}: ${x.message ?? JSON.stringify(e)}`;
        run.finishedAt = Date.now();
      },
    );
    return run;
  }

  /** Reset this instance after `ms`: a restart in the middle of whatever it is doing. */
  async lbAbortAfter(ms: number): Promise<{ at: number }> {
    const at = Date.now() + ms;
    setTimeout(() => this.ctx.abort("lb: restart mid-publication"), ms);
    return { at };
  }

  /** Push the pending commit through the Room's own log remote, with no objects, and return lane B's answer in full. */
  async lbPushProbe(): Promise<unknown> {
    const core = this.core as unknown as { remotes: { logRemote: (l: unknown, m: unknown) => Promise<{ push: (o: [], ref: string, next: string, lease: string | null) => Promise<unknown> }> }; location(): unknown; mints: unknown; sql: RoomCore["sql"] };
    const pending = getMeta(core.sql, "pending_publication");
    if (!pending) return { pending: null };
    const expected = (JSON.parse(pending) as { expected: string }).expected;
    const lease = getMeta(core.sql, "log_commit");
    const remote = await core.remotes.logRemote(core.location(), core.mints);
    return { expected, lease, outcome: await remote.push([], "refs/artroom/log", expected, lease) };
  }

  /**
   * Reset this instance just after the `k`th staging call that carries parts, in the next
   * publication: a restart in the middle of staging, whatever the timing.
   */
  async lbAbortAfterStages(k: number): Promise<{ armed: number }> {
    type Remote = { stage: (...a: unknown[]) => Promise<unknown> } & Record<string, unknown>;
    const core = this.core as unknown as { remotes: { logRemote: (l: unknown, m: unknown) => Promise<Remote> }; publisherCache: unknown };
    const remotes = core.remotes;
    const original = remotes.logRemote;
    let n = 0;
    remotes.logRemote = async (l, m) => {
      const remote = await original(l, m);
      return {
        ...remote,
        stage: async (...a: unknown[]) => {
          const answer = await remote.stage(...a);
          if ((a[2] as unknown[]).length > 0 && ++n >= k) this.ctx.abort("lb: restart mid-staging");
          return answer;
        },
      };
    };
    core.publisherCache = null; // the next publication opens a publisher over the wrapped remote
    return { armed: k };
  }

  async lbStatus(): Promise<unknown> {
    const core = this.core;
    const sql = core.sql;
    const head = sql.all("SELECT MAX(seq) AS n FROM entries")[0]?.["n"] ?? -1;
    const seg = Number(getMeta(sql, "published_through") ?? "-1");
    const active = Math.floor(Math.max(0, Number(head)) / 1000) * 1000;
    // Stored bytes of the active segment's entries (each line's canonical body), and the largest entry.
    const sizes = sql.all("SELECT SUM(length(CAST(body AS BLOB))) AS total, COUNT(*) AS n, MAX(length(CAST(body AS BLOB))) AS largest FROM entries WHERE seq >= ?", active)[0] ?? {};
    const p = this.lbPublisher;
    const publisher = p ? { stats: p.stats, head: p.head, publishedThrough: p.publishedThrough } : null;
    let heap: unknown;
    try {
      const proc = (globalThis as { process?: { memoryUsage?: () => unknown } }).process;
      heap = proc?.memoryUsage ? proc.memoryUsage() : "process.memoryUsage is not available";
    } catch (e) {
      heap = `process.memoryUsage threw: ${e instanceof Error ? e.message : String(e)}`;
    }
    return {
      head,
      publishedThrough: seg,
      logCommit: getMeta(sql, "log_commit"),
      pending: getMeta(sql, "pending_publication") ? JSON.parse(getMeta(sql, "pending_publication")!) : null,
      publicationError: getMeta(sql, "publication_error"),
      activeSegment: { first: active, entries: Number(sizes["n"] ?? 0), bytes: Number(sizes["total"] ?? 0) + Math.max(0, Number(sizes["n"] ?? 1) - 1), largestEntry: Number(sizes["largest"] ?? 0) },
      publisher,
      last: this.lbLast,
      heap,
    };
  }
}

type RoomStub = DurableObjectStub<Room>;

function json(v: unknown, status = 200): Response {
  return new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });
}

export default {
  async fetch(req: Request, env: RoomEnv & { LB_KEY?: string }): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/lb/") || req.method !== "POST" || !env.LB_KEY || req.headers.get("x-lb-key") !== env.LB_KEY) return json({ error: "not found" }, 404);
    const body = (await req.json()) as Record<string, unknown>;
    const stub = (room: unknown) => env.ROOMS.get(env.ROOMS.idFromName(String(room))) as unknown as RoomStub;
    try {
      switch (url.pathname) {
        case "/lb/found": {
          // A public founding: the Room creates a fresh repository in the binding's namespace.
          const admin = keyPairFromSeed(fromHex(String(body["adminSeed"])));
          const recovery = keyPairFromSeed(fromHex(String(body["recoverySeed"])));
          const { genesis, draft } = await draftRoom(env, { name: String(body["name"]), repo: { kind: "new" }, admin: { handle: "@lb", key: admin.key }, recovery: recovery.key }, Date.now());
          const room = await foundRoom(env, genesis, sign(admin.seed, "artroom-genesis-v1", genesis), draft);
          return json({ room, repo: genesis.repo });
        }
        case "/lb/claims": {
          // Claims through the Room's real admission, each envelope near `target` canonical bytes (R-SIG-6: 64 KiB).
          const admin = keyPairFromSeed(fromHex(String(body["adminSeed"])));
          const room = String(body["room"]);
          const target = Number(body["target"]);
          const out: { seq: number; id: string }[] = [];
          const t0 = Date.now();
          for (let i = Number(body["start"]); i < Number(body["start"]) + Number(body["count"]); i++) {
            const make = (n: number) => {
              const because = Array.from({ length: n }, (_, k) => ({ url: `https://example.com/lb/${i}/${k}/${"r".repeat(2000)}` }));
              const envelope = { v: 1, room, actor: admin.key, kind: "claim", target: null, body: { goal: `Large claim ${i}`, scope: [`lb/${i}/**`], because }, idempotencyKey: `lb-claim-${i}` };
              return envelope;
            };
            let n = 1;
            while (n < 64 && new TextEncoder().encode(JSON.stringify(make(n + 1))).length <= target) n++;
            const envelope = make(n);
            const rec = unwire((await stub(room).submit({ envelope, sig: sign(admin.seed, "artroom-envelope-v1", envelope) })) as Wire<{ id?: string; seq?: number; rule?: string }>);
            if (rec.seq === undefined) return json({ error: "refused", rec, at: i }, 500);
            out.push({ seq: rec.seq, id: String(rec.id) });
          }
          return json({ first: out[0], last: out.at(-1), count: out.length, ms: Date.now() - t0 });
        }
        case "/lb/notified":
          return json(await stub(body["room"]).lbNotified(body["acts"] as ActId[], Number(body["bytes"])));
        case "/lb/publish":
          return json(await stub(body["room"]).lbPublishStart());
        case "/lb/abortstages":
          return json(await stub(body["room"]).lbAbortAfterStages(Number(body["k"])));
        case "/lb/abort":
          return json(await stub(body["room"]).lbAbortAfter(Number(body["ms"])));
        case "/lb/pushprobe":
          return json(await stub(body["room"]).lbPushProbe());
        case "/lb/status":
          return json(await stub(body["room"]).lbStatus());
        default:
          return json({ error: "no such route" }, 404);
      }
    } catch (e) {
      return json({ error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) }, 500);
    }
  },
};
