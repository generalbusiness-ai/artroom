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
import { alarmTime, clock, pinDelayMs, publicUrl, servicesFor, type RoomEnv } from "./config.ts";
import { RoomCore, fault } from "./core.ts";
import { jobTokenDuties } from "./jobs.ts";
import { checkGenesis } from "./founding.ts";
import { registry } from "./registry.ts";
import { unb64url } from "./crypto.ts";
import { artroomError, wire, type Wire } from "./errors.ts";
import { liveCursor, read, updateAfter } from "./reads.ts";
import { authenticateHash, authenticateRead, bearerAct, bearerRequest, callerOf, redeem, request, tokenHash, type CallerView } from "./requests.ts";
import type { Sql } from "./ports.ts";

interface SocketState {
  /** The token's hash, never the token (R-API-12). */
  readonly hash: string;
  readonly member: MemberId;
  readonly cursor: string;
}

export class Room extends DurableObject<RoomEnv> {
  readonly core: RoomCore;
  /** `PUBLIC_URL`, the base of `Redeemed.mcp`. Required: the object refuses to start without it. */
  private readonly mcpBase: string;
  /** An alarm is stored at or before this time (room clock), or null when that is not known. Set only once storage has it. */
  private scheduled: number | null = null;
  /** `wake` calls, one at a time: each reads the stored alarm and only ever moves it earlier. */
  private wakes: Promise<unknown> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: RoomEnv) {
    super(ctx, env);
    this.mcpBase = publicUrl(env);
    const sql: Sql = {
      all: (q, ...b) => ctx.storage.sql.exec(q, ...b).toArray() as ReturnType<Sql["all"]>,
      transaction: (fn) => ctx.storage.transactionSync(fn),
    };
    this.core = new RoomCore({
      sql,
      services: servicesFor(env, ctx.id.toString()),
      clock,
      leaseMs: Number(env.LEASE_SECONDS ?? "1800") * 1000,
      pinDelayMs: pinDelayMs(env),
      defer: (p) => ctx.waitUntil(p),
      committed: () => this.onCommit(),
      bound: async (repo, room, name) => {
        const b = await registry(env).byRepo(repo);
        return b !== null && b.room === room && b.name === name;
      },
      wake: (at) => this.wake(at),
    });
    // A fresh object schedules the founding debt it finds, with no new found request (plan 004).
    void ctx.blockConcurrencyWhile(() => this.recover().catch(() => undefined));
  }

  // ------------------------------------------------------------ RPC

  /** `wire`, and a failure that is not an `ArtroomError` is logged under the method's name (request d268d249). */
  private wire<T>(method: string, fn: () => Promise<T>): Promise<Wire<T>> {
    return wire(fn, (e) => this.core.diagnose("rpc-failed", method, e));
  }

  /** Found the room from a signed genesis (R-GEN-1). The seed is the room key's, derived by the Worker. */
  found(genesis: Genesis, sig: string, seed: string): Promise<Wire<RoomId>> {
    return this.wire("found", async () => {
      checkGenesis(genesis);
      const raw = unb64url(seed);
      if (!raw || raw.length !== 32) throw artroomError("bad-request", "The room key seed is not 32 bytes.");
      return this.core.found(genesis, sig, raw);
    });
  }

  /** `RoomWire.submit` and `POST /acts`: admission path `submitted` (R-ADM-12). */
  submit(act: unknown): Promise<Wire<ActRecord | Refusal>> {
    return this.wire("submit", () => submit(this.core, act, "submitted"));
  }

  request(req: unknown): Promise<Wire<WorkspaceOp | WorkspaceGrant | Session | Refusal>> {
    return this.wire("request", () => request(this.core, req));
  }

  /** `address` is the HTTPS client's, or null for a Worker over a service binding (R-CRED-9). */
  redeem(redemption: unknown, address: string | null): Promise<Wire<Joined | Redeemed | Refusal>> {
    return this.wire("redeem", () => redeem(this.core, redemption, address, this.mcpBase));
  }

  /** An MCP agent's act, signed by the room under the bearer's delegation (R-CRED-3, R-CRED-10). */
  bearerAct(bearer: string, act: unknown): Promise<Wire<ActRecord | Refusal>> {
    return this.wire("bearerAct", () => bearerAct(this.core, bearer, act));
  }

  /** `workspace` or `workspace-token` for a bearer session (R-CRED-10). */
  bearerRequest(bearer: string, req: unknown): Promise<Wire<WorkspaceOp | WorkspaceGrant | Refusal>> {
    return this.wire("bearerRequest", () => bearerRequest(this.core, bearer, req));
  }

  /** The authorization behind a session or bearer token, for the MCP endpoint's `tools/list` (R-API-14). A read. */
  caller(token: string): Promise<Wire<CallerView>> {
    return this.wire("caller", async () => callerOf(this.core, token));
  }

  read<Q extends ReadQuery>(token: string, query: Q): Promise<Wire<ReadResults[Q["q"]]>> {
    return this.wire("read", async () => read(this.core, authenticateRead(this.core, token), query));
  }

  /** The HTTPS long poll: the next update after `cursor`, or an empty one after `waitMs` (R-API-8). */
  poll(token: string, cursor: string | undefined, waitMs: number): Promise<Wire<Update>> {
    return this.wire("poll", async () => {
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
    return this.wire("publishLog", () => this.core.publish(true));
  }

  /** The open cleanup duties for job tokens, for operators: ended tokens still owed revocation, and mints whose outcome is unknown. */
  jobTokenDuties(): Promise<Wire<ReturnType<typeof jobTokenDuties>>> {
    return this.wire("jobTokenDuties", async () => jobTokenDuties(this.core));
  }

  /** Run the alarm's work once, now. For tests and operators; the alarm calls the same code. */
  tick(): Promise<Wire<null>> {
    return this.wire("tick", async () => {
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

  /**
   * The alarm's work: every durable step once (R-LANE-8, R-LOG-13, R-PUB-7, R-LOG-8).
   * Before founding, only the cleanup a new repository still owes (request b6b51de7),
   * and the error upgrade, which runs in every state (request d29c09fa).
   */
  private async work(): Promise<void> {
    if (!this.core.founded) return this.core.workUnfounded();
    await this.core.runAll();
  }

  private schedule(): void {
    const next = this.core.founded ? this.core.nextAlarm() : this.core.unfoundedDue();
    if (next === null) return;
    if (this.scheduled !== null && this.scheduled <= next) return;
    this.scheduled = next;
    // A rejected store claims nothing: the next schedule tries again.
    this.storeAlarm(alarmTime(next)).catch(() => {
      if (this.scheduled === next) this.scheduled = null;
    });
  }

  /** Store the alarm. The call to storage is made now, in the caller's turn. */
  private storeAlarm(when: number): Promise<void> {
    try {
      fault("room:set-alarm");
      return this.ctx.storage.setAlarm(when);
    } catch (e) {
      return Promise.reject(e);
    }
  }

  /**
   * Persist an alarm at or before `at` (room clock), and resolve once storage
   * has it (plan 004). An alarm already stored at or before that time is kept:
   * it runs, and every alarm run schedules the next. Calls run one at a time,
   * so a later request never replaces an earlier one. A rejection leaves the
   * cache as it was.
   */
  private wake(at: number): Promise<void> {
    const run = this.wakes.then(async () => {
      const want = alarmTime(at);
      const stored = await this.ctx.storage.getAlarm();
      if (stored === null || stored > want) await this.storeAlarm(want);
      if (this.scheduled === null || at < this.scheduled) this.scheduled = at;
    });
    this.wakes = run.catch(() => undefined);
    return run;
  }

  /**
   * On a fresh object: whatever the ledgers owe gets an alarm, though no
   * request comes. Before founding, the founding debt (plan 004); after, all
   * the alarm's work, including snapshot, workspace and job-token cleanup
   * (follow-up c9cd4cd8).
   */
  private async recover(): Promise<void> {
    const due = this.core.founded ? this.core.nextAlarm() : this.core.unfoundedDue();
    if (due !== null) await this.wake(due);
  }

  private onCommit(): void {
    this.schedule();
    this.broadcast();
  }

  // ------------------------------------------------------------ WebSocket (R-API-12)

  /**
   * The token travels as the `artroom.token.<token>` subprotocol and is judged
   * before the upgrade: 401 and no socket when it is missing or not valid.
   * The room answers `artroom.v1`, never the token subprotocol, reads the
   * cursor from `?cursor=`, and keeps only the token's hash.
   */
  override async fetch(req: Request): Promise<Response> {
    if (req.headers.get("Upgrade") !== "websocket") return new Response("Not found", { status: 404 });
    const deny = (code: "unauthenticated" | "bad-request", message: string) =>
      new Response(JSON.stringify(artroomError(code, message)), { status: code === "bad-request" ? 400 : 401, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    const offered = (req.headers.get("Sec-WebSocket-Protocol") ?? "").split(",").map((p) => p.trim());
    const tokenProtocol = offered.find((p) => p.startsWith("artroom.token."));
    if (!offered.includes("artroom.v1") || !tokenProtocol) return deny("unauthenticated", "Offer the subprotocols artroom.v1 and artroom.token.<token>.");
    const hash = tokenHash(tokenProtocol.slice("artroom.token.".length));
    let member: MemberId;
    try {
      member = authenticateHash(this.core, hash);
    } catch {
      return deny("unauthenticated", "The session or bearer token is not valid.");
    }
    const cursor = new URL(req.url).searchParams.get("cursor") ?? liveCursor(this.core);
    try {
      updateAfter(this.core, member, cursor);
    } catch {
      return deny("bad-request", "The cursor is not valid.");
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ hash, member, cursor } satisfies SocketState);
    this.sendUpdate(server);
    return new Response(null, { status: 101, webSocket: client, headers: { "Sec-WebSocket-Protocol": "artroom.v1" } });
  }

  /** The room ignores messages from the client (R-API-12). */
  override async webSocketMessage(): Promise<void> {}

  override async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code, "closed");
    } catch {
      // already closed
    }
  }

  /** Judge the token again, by its hash, before each update; close with 1008 when it is no longer valid. */
  private sendUpdate(ws: WebSocket): void {
    const s = ws.deserializeAttachment() as SocketState | null;
    if (!s?.hash) return;
    try {
      authenticateHash(this.core, s.hash);
    } catch {
      ws.close(1008, "session ended");
      return;
    }
    const u = updateAfter(this.core, s.member, s.cursor);
    if (!u.entries.length && !u.attention.length) return;
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
