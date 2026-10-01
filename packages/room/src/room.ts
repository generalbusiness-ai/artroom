/**
 * The Room Durable Object: one per repository, the authoritative sequencer.
 *
 * Its RPC methods return `Wire<T>` (a value or an `ArtroomError`) so that a
 * failure keeps its code across the Durable Object boundary; the Worker's
 * `RoomWire` unwraps it (R-API-1). The alarm runs lease expiry, notify
 * retries, token revocation, pins, previews, recomputation, the landing
 * engine and log publication (R-LANE-8, R-LOG-13, R-PUB-7, R-LOG-8).
 */

import { DurableObject } from "cloudflare:workers";
import type {
  ActRecord,
  Envelope,
  Genesis,
  Joined,
  MemberId,
  ReadQuery,
  ReadResults,
  Redeemed,
  Refusal,
  RoomId,
  Session,
  Sha,
  Update,
  WorkspaceGrant,
  WorkspaceOp,
} from "@generalbusiness/artroom-contract";
import { submit } from "./admission.ts";
import { alarmTime, clock, portsFor, type RoomEnv } from "./config.ts";
import { RoomCore } from "./core.ts";
import { unb64url } from "./crypto.ts";
import { artroomError, wire, type Wire } from "./errors.ts";
import { iso } from "./ids.ts";
import { checkpoint, entriesAfter, entryAt, publicationFiles } from "./log.ts";
import { liveCursor, publishedThrough, read, updateAfter } from "./reads.ts";
import { authenticateRead, bearerAct, redeem, request } from "./requests.ts";
import type { Sql } from "./ports.ts";
import { getMeta, setMeta, str } from "./store.ts";

/** Publish the log once this many entries are unpublished, or after a minute (R-LOG-8). */
const LOG_BATCH = 50;
const LOG_INTERVAL_MS = 60_000;

interface SocketState {
  readonly token: string | null;
  readonly member: MemberId | null;
  readonly cursor: string | null;
}

export class Room extends DurableObject<RoomEnv> {
  readonly core: RoomCore;
  private scheduled: number | null = null;
  private publishing = false;
  private lastPublishMs = clock();

  constructor(ctx: DurableObjectState, env: RoomEnv) {
    super(ctx, env);
    const sql: Sql = {
      all: (q, ...b) => ctx.storage.sql.exec(q, ...b).toArray() as ReturnType<Sql["all"]>,
      transaction: (fn) => ctx.storage.transactionSync(fn),
    };
    this.core = new RoomCore({
      sql,
      ports: portsFor(env, ctx.id.toString()),
      clock,
      leaseMs: Number(env.LEASE_SECONDS ?? "1800") * 1000,
      defer: (p) => ctx.waitUntil(p),
      committed: () => this.onCommit(),
    });
  }

  private get mcpBase(): string {
    return this.env.PUBLIC_URL ?? "https://artroom.example.workers.dev";
  }

  // ------------------------------------------------------------ RPC

  /** Found the room from a signed genesis (R-GEN-1). The seed is the room key's, derived by the Worker. */
  found(genesis: Genesis, sig: string, seed: string): Promise<Wire<RoomId>> {
    return wire(async () => {
      const raw = unb64url(seed);
      if (!raw || raw.length !== 32) throw artroomError("bad-request", "The room key seed is not 32 bytes.");
      return this.core.found(genesis, sig, raw);
    });
  }

  /** `RoomWire.submit` and `POST /acts`: admission path `submitted` (R-ADM-12). */
  submit(act: unknown): Promise<Wire<ActRecord | Refusal>> {
    return wire(() => submit(this.core, act, "submitted"));
  }

  request(req: unknown): Promise<Wire<WorkspaceOp | WorkspaceGrant | Session | Refusal>> {
    return wire(() => request(this.core, req));
  }

  redeem(redemption: unknown, address: string): Promise<Wire<Joined | Redeemed | Refusal>> {
    return wire(() => redeem(this.core, redemption, address, this.mcpBase));
  }

  /** An MCP agent's act, signed by the room under the bearer's delegation (R-CRED-3). */
  bearerAct(bearer: string, act: Pick<Envelope, "kind" | "target" | "body" | "idempotencyKey">): Promise<Wire<ActRecord | Refusal>> {
    return wire(() => bearerAct(this.core, bearer, act));
  }

  read<Q extends ReadQuery>(token: string, query: Q): Promise<Wire<ReadResults[Q["q"]]>> {
    return wire(async () => read(this.core, authenticateRead(this.core, token), query));
  }

  /** The HTTPS long poll: the next update after `cursor`, or an empty one after `waitMs` (R-API-8). */
  poll(token: string, cursor: string | undefined, waitMs: number): Promise<Wire<Update>> {
    return wire(async () => {
      const member = authenticateRead(this.core, token);
      const from = cursor ?? liveCursor(this.core);
      const deadline = Date.now() + Math.min(Math.max(waitMs, 0), 60_000);
      for (;;) {
        const u = updateAfter(this.core, member, from);
        if (u.entries.length || u.attention.length || Date.now() >= deadline) return u;
        await this.core.changed(deadline - Date.now());
        authenticateRead(this.core, token);
      }
    });
  }

  /**
   * The RPC subscription (R-API-8): a byte stream of newline-delimited JSON
   * `Update`s, because Workers RPC streams carry bytes. It ends when the
   * session stops being valid.
   */
  async subscribe(token: string, cursor?: string): Promise<ReadableStream<Uint8Array>> {
    const member = authenticateRead(this.core, token);
    const { readable, writable } = new IdentityTransformStream();
    const writer = writable.getWriter();
    const enc = new TextEncoder();
    let c: string = cursor ?? liveCursor(this.core);
    const pump = async () => {
      for (;;) {
        try {
          authenticateRead(this.core, token);
        } catch {
          break;
        }
        const u = updateAfter(this.core, member, c);
        if (u.entries.length || u.attention.length) {
          c = u.cursor;
          await writer.ready;
          await writer.write(enc.encode(`${JSON.stringify(u)}\n`));
        } else await this.core.changed(25_000);
      }
      await writer.close();
    };
    this.ctx.waitUntil(pump().catch(() => writer.abort().catch(() => undefined)));
    return readable;
  }

  /** Publish the log now (R-LOG-8). Also run by the alarm. */
  publishLog(): Promise<Wire<{ readonly through: number; readonly commit: Sha } | null>> {
    return wire(() => this.publish());
  }

  /** Run the alarm's work once, now. For tests and operators; the alarm calls the same code. */
  tick(): Promise<Wire<null>> {
    return wire(async () => {
      await this.work();
      await this.core.idle();
      return null;
    });
  }

  // ------------------------------------------------------------ alarm

  override async alarm(): Promise<void> {
    this.scheduled = null;
    await this.work().catch(() => undefined);
    this.schedule();
  }

  private async work(): Promise<void> {
    const core = this.core;
    if (!core.founded) return;
    await core.expireLeases();
    await core.drainNotify();
    for (const lane of core.tokensToRevoke()) await core.revokeTokens(lane).catch(() => undefined);
    await core.completePins().catch(() => undefined);
    await core.refreshPreviews().catch(() => undefined);
    await core.recompute().catch(() => undefined);
    // R-PUB-7: the engine resolves a held slot before any other landing work.
    await core.landing.reconcile().catch(() => undefined);
    const lag = core.headSeq() - publishedThrough(core);
    if (lag >= LOG_BATCH || (lag > 0 && clock() - this.lastPublishMs >= LOG_INTERVAL_MS)) await this.publish().catch(() => undefined);
  }

  private schedule(): void {
    if (!this.core.founded) return;
    const next = this.core.nextAlarm();
    if (next === null) return;
    if (this.scheduled !== null && this.scheduled <= next) return;
    this.scheduled = next;
    void this.ctx.storage.setAlarm(alarmTime(next));
  }

  private onCommit(): void {
    this.schedule();
    this.broadcast();
  }

  // ------------------------------------------------------------ log publication (R-LOG-8)

  private async publish(): Promise<{ readonly through: number; readonly commit: Sha } | null> {
    if (this.publishing) return null;
    this.publishing = true;
    try {
      const core = this.core;
      const sql = core.sql;
      // Step 1: choose N.
      const n = core.headSeq();
      if (n <= publishedThrough(core)) return null;
      const through = entryAt(sql, n)!;
      // Step 2: the checkpoint names entry N's hash, never a commit.
      const cp = checkpoint(core.roomId, core.genesis.roomKey, core.seed(), through, iso(clock()));
      const retained = sql.all("SELECT digest, kind, body FROM retained ORDER BY digest").map((r) => ({
        digest: str(r, "digest") as `sha256:${string}`,
        kind: str(r, "kind")!,
        body: str(r, "body")!,
      }));
      const files = publicationFiles(core.genesis, entriesAfter(sql, -1, n + 1), retained, cp);
      // Steps 3 and 4: the commit, whose parent is the previous log commit, pushed with a lease on it.
      const parent = (getMeta(sql, "log_commit") as Sha | null) ?? null;
      const commit = await core.ports.artifacts.commitLog(files, parent);
      await core.ports.artifacts.pushLog(commit, parent);
      // Step 5: read the ref back, then seal the checkpoint event and move publishedThrough.
      if ((await core.ports.artifacts.readLogRef()) !== commit) throw artroomError("unavailable", "The log ref did not move.");
      await core.serial(async () =>
        sql.transaction(() => {
          core.sealSystem({ type: "checkpoint", through: through.seq, hash: through.hash, commit });
          setMeta(sql, "published_through", String(through.seq));
          setMeta(sql, "log_commit", commit);
        }),
      );
      this.lastPublishMs = clock();
      core.committed();
      return { through: through.seq, commit };
    } finally {
      this.publishing = false;
    }
  }

  // ------------------------------------------------------------ WebSocket (R-API-8)

  override async fetch(req: Request): Promise<Response> {
    if (req.headers.get("Upgrade") !== "websocket") return new Response("Not found", { status: 404 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ token: null, member: null, cursor: null } satisfies SocketState);
    return new Response(null, { status: 101, webSocket: client });
  }

  /** The first message authenticates: `{ "session": token, "cursor"?: cursor }`. Tokens never travel in URLs. */
  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    let msg: { session?: unknown; cursor?: unknown };
    try {
      msg = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message)) as typeof msg;
    } catch {
      ws.close(1003, "expected JSON");
      return;
    }
    if (typeof msg.session !== "string") {
      ws.close(1008, "expected a session");
      return;
    }
    try {
      const member = authenticateRead(this.core, msg.session);
      const cursor = typeof msg.cursor === "string" ? msg.cursor : liveCursor(this.core);
      ws.serializeAttachment({ token: msg.session, member, cursor } satisfies SocketState);
      this.sendUpdate(ws, true);
    } catch {
      ws.close(1008, "unauthenticated");
    }
  }

  override async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code, "closed");
    } catch {
      // already closed
    }
  }

  private sendUpdate(ws: WebSocket, always = false): void {
    const s = ws.deserializeAttachment() as SocketState | null;
    if (!s?.token || !s.member) return;
    try {
      authenticateRead(this.core, s.token);
    } catch {
      ws.close(1008, "session ended");
      return;
    }
    const u = updateAfter(this.core, s.member, s.cursor ?? undefined);
    if (!u.entries.length && !u.attention.length && !always) return;
    ws.send(JSON.stringify(u));
    ws.serializeAttachment({ ...s, cursor: u.cursor } satisfies SocketState);
  }

  private broadcast(): void {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        this.sendUpdate(ws);
      } catch {
        // a socket that fails is dropped by the runtime
      }
    }
  }
}

/** Maps a room name to its current room ID. A name can be reused; an ID cannot (R-ID-3). */
export class RoomNames extends DurableObject<RoomEnv> {
  async get(): Promise<RoomId | null> {
    return ((await this.ctx.storage.get<string>("room")) ?? null) as RoomId | null;
  }
  async set(room: RoomId): Promise<void> {
    await this.ctx.storage.put("room", room);
  }
}
