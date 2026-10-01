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
import { liveCursor, read, updateAfter } from "./reads.ts";
import { authenticateRead, bearerAct, redeem, request } from "./requests.ts";
import type { Sql } from "./ports.ts";

interface SocketState {
  readonly token: string | null;
  readonly member: MemberId | null;
  readonly cursor: string | null;
}

export class Room extends DurableObject<RoomEnv> {
  readonly core: RoomCore;
  private scheduled: number | null = null;

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
    return wire(() => this.core.publish(true));
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

  /** The alarm's work: every durable step once (R-LANE-8, R-LOG-13, R-PUB-7, R-LOG-8). */
  private async work(): Promise<void> {
    if (!this.core.founded) return;
    await this.core.runAll();
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
