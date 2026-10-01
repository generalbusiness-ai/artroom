/**
 * The wire beneath the handle. `HttpWire` speaks the HTTPS routes of
 * `HttpRoutes` (R-API-3); `RpcWire` wraps a `RoomWire` service binding.
 * Both give the handle the same five calls, so the handle's code is the same
 * on every transport.
 */

import {
  isArtroomError,
  isRefusal,
  type ActRecord,
  type ArtroomError,
  type Cursor,
  type Joined,
  type ReadQuery,
  type ReadResults,
  type Redeemed,
  type Redemption,
  type Refusal,
  type Result,
  type RoomWire,
  type Session,
  type SessionToken,
  type SignedEnvelope,
  type SignedRequest,
  type Update,
  type WorkspaceGrant,
  type WorkspaceOp,
} from "@generalbusiness/artroom-contract";
import { artroomError, codeForStatus, Redactor } from "./errors.ts";

/** Options every entry point accepts besides the contract's arguments. */
export interface ClientOptions {
  /** The fetch to use. Default: the global `fetch`. */
  readonly fetch?: typeof fetch;
  /** The WebSocket constructor for `watch`. Default: the global `WebSocket`. */
  readonly WebSocket?: typeof WebSocket;
  /**
   * One line per request: method, route, status and time taken. It never
   * includes headers, bodies or tokens. For `--verbose` output.
   */
  readonly log?: (line: string) => void;
  /** Retries of an act after a retryable failure, with the same idempotency key (R-IDEM-6). Default 3. */
  readonly retries?: number;
  /** The clock, for tests. Default `Date.now`. */
  readonly now?: () => number;
}

export type RequestResult = WorkspaceOp | WorkspaceGrant | Session;

export interface Wire {
  submit(act: SignedEnvelope): Promise<Result<ActRecord>>;
  request(req: SignedRequest): Promise<Result<RequestResult>>;
  redeem(redemption: Redemption): Promise<Result<Joined | Redeemed>>;
  read<Q extends ReadQuery>(auth: string, query: Q): Promise<ReadResults[Q["q"]]>;
  dispose(): void;
}

/** True for a host that may use plain HTTP: this machine only. */
function isLoopback(host: string): boolean {
  return host === "localhost" || host === "[::1]" || /^127\.\d+\.\d+\.\d+$/.test(host);
}

/** Parses and checks an endpoint URL. Plain HTTP is allowed only on this machine, so tokens never cross a network in clear. */
export function endpointUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw artroomError("bad-request", `Not a URL: ${url}.`);
  }
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLoopback(parsed.hostname))) {
    throw artroomError("bad-request", "The room's URL must use https.");
  }
  parsed.hash = "";
  parsed.search = "";
  return parsed;
}

interface CallInit {
  readonly body?: unknown;
  readonly auth?: string;
  readonly query?: Readonly<Record<string, string | number | undefined>>;
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export class HttpWire implements Wire {
  readonly #base: URL;
  readonly #room: string;
  readonly #fetch: typeof fetch;
  readonly #log: ((line: string) => void) | undefined;
  readonly #now: () => number;
  readonly redactor: Redactor;

  constructor(base: URL, room: string, opts: ClientOptions, redactor: Redactor) {
    this.#base = base;
    this.#room = room;
    this.#fetch = opts.fetch ?? ((input, init) => fetch(input, init));
    this.#log = opts.log;
    this.#now = opts.now ?? Date.now;
    this.redactor = redactor;
  }

  /** The URL of a room route, for example `/acts`. */
  url(route: string, query?: CallInit["query"]): URL {
    const prefix = this.#base.pathname.replace(/\/+$/, "");
    const u = new URL(`${prefix}/v1/rooms/${encodeURIComponent(this.#room)}${route}`, this.#base);
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) u.searchParams.set(k, String(v));
    return u;
  }

  /**
   * One HTTPS exchange. Returns the status and parsed body, or throws an
   * `ArtroomError` when no complete response arrived. For a POST that may
   * have been admitted, the error says `maybeRecorded`.
   */
  async call(method: "GET" | "POST", route: string, init: CallInit = {}): Promise<{ status: number; body: unknown }> {
    const url = this.url(route, init.query);
    const headers: Record<string, string> = { accept: "application/json" };
    if (init.body !== undefined) headers["content-type"] = "application/json";
    if (init.auth !== undefined) headers["authorization"] = `Bearer ${init.auth}`;
    const started = this.#now();
    const post = method === "POST";
    let status = 0;
    try {
      const res = await this.#fetch(url, {
        method,
        headers,
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
        signal: AbortSignal.timeout(init.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        redirect: "manual", // never follow: a redirect could carry the credential elsewhere
      });
      status = res.status;
      const text = await res.text();
      let body: unknown = null;
      if (text.length > 0) {
        try {
          body = JSON.parse(text);
        } catch {
          // A cut-off or non-JSON body is not a response we can trust.
          if (res.ok || res.status === 409) throw lost("unavailable", post, "The response was incomplete.");
          body = null;
        }
      }
      return { status, body };
    } catch (e) {
      if (isArtroomError(e)) throw e;
      const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      throw lost(timedOut ? "timeout" : "unavailable", post, timedOut ? "The request timed out." : "The room could not be reached, or the connection closed before the response arrived.");
    } finally {
      this.#log?.(`${method} ${route.replace(/\?.*$/, "")} ${status === 0 ? "no response" : status} ${this.#now() - started}ms`);
    }
  }

  /** 200 is the record; 409 is a `Refusal` value; anything else throws (R-API-1). */
  outcome<T>(res: { status: number; body: unknown }): Result<T> {
    if (res.status >= 200 && res.status < 300) return res.body as T;
    if (res.status === 409 && isRefusal(res.body)) return this.redactor.refusal(res.body);
    throw this.failure(res, true);
  }

  /**
   * The error for a non-success response. An `ArtroomError` body comes from
   * the room, which recorded nothing unless it says so. Any other body came
   * from something in between, so after a POST the act may have been
   * recorded.
   */
  failure(res: { status: number; body: unknown }, post = false): ArtroomError {
    if (isArtroomError(res.body)) return this.redactor.error(res.body);
    const code = codeForStatus(res.status);
    return artroomError(code, `The room answered with HTTP ${res.status}.`, post && res.status >= 500 ? { maybeRecorded: true } : {});
  }

  async submit(act: SignedEnvelope): Promise<Result<ActRecord>> {
    return this.outcome(await this.call("POST", "/acts", { body: act }));
  }

  async request(req: SignedRequest): Promise<Result<RequestResult>> {
    return this.outcome(await this.call("POST", "/requests", { body: req }));
  }

  async redeem(redemption: Redemption): Promise<Result<Joined | Redeemed>> {
    return this.outcome(await this.call("POST", "/redeem", { body: redemption }));
  }

  async read<Q extends ReadQuery>(auth: string, query: Q): Promise<ReadResults[Q["q"]]> {
    const get = async (route: string, q?: CallInit["query"], timeoutMs?: number, nullOn404 = false) => {
      const res = await this.call("GET", route, { auth, ...(q ? { query: q } : {}), ...(timeoutMs ? { timeoutMs } : {}) });
      if (res.status === 200) return res.body;
      if (nullOn404 && res.status === 404) return null;
      throw this.failure(res);
    };
    const enc = encodeURIComponent;
    let out: unknown;
    switch (query.q) {
      case "lane":
        out = await get(`/lanes/${enc(query.lane)}`, undefined, undefined, true);
        break;
      case "lanes": {
        const f = query.filter ?? {};
        out = await get("/lanes", { state: f.state, holder: f.holder, touches: f.touches, cursor: f.cursor, limit: f.limit });
        break;
      }
      case "proposal":
        out = await get(`/lanes/${enc(query.ref.lane)}/${query.ref.generation}`, undefined, undefined, true);
        break;
      case "op":
        out = await get(
          `/ops/${enc(query.op)}`,
          { until: query.until?.join(","), timeoutMs: query.timeoutMs },
          query.timeoutMs !== undefined ? query.timeoutMs + 10_000 : undefined,
        );
        break;
      case "attention":
        out = await get("/attention", { cursor: query.page?.cursor, limit: query.page?.limit });
        break;
      case "log":
        out = await get("/log", { after: query.req?.after, cursor: query.req?.cursor, limit: query.req?.limit });
        break;
      case "explain":
        out = await get(`/explain/${enc(query.act)}`, undefined, undefined, true);
        break;
      case "members":
        out = await get("/members");
        break;
    }
    return out as ReadResults[Q["q"]];
  }

  /** The HTTPS long poll (R-API-8). */
  async subscribe(auth: string, cursor: Cursor | undefined, waitMs: number): Promise<Update> {
    const res = await this.call("GET", "/subscribe", { auth, query: { cursor, waitMs }, timeoutMs: waitMs + 10_000 });
    if (res.status === 200) return res.body as Update;
    throw this.failure(res);
  }

  dispose(): void {}
}

function lost(code: "timeout" | "unavailable", post: boolean, message: string): ArtroomError {
  return artroomError(code, message, post ? { maybeRecorded: true } : {});
}

/** A `RoomWire` service binding (R-API-2). Its refusals already are values. */
export class RpcWire implements Wire {
  readonly #wire: RoomWire;
  readonly redactor: Redactor;

  constructor(wire: RoomWire, redactor: Redactor) {
    this.#wire = wire;
    this.redactor = redactor;
  }

  #clean<T>(value: Result<T>): Result<T> {
    return isRefusal(value) ? (this.redactor.refusal(value) as Refusal) : value;
  }

  async #guard<T>(f: () => Promise<T>): Promise<T> {
    try {
      return await f();
    } catch (e) {
      throw isArtroomError(e) ? this.redactor.error(e) : artroomError("internal", "The service binding failed.");
    }
  }

  submit(act: SignedEnvelope): Promise<Result<ActRecord>> {
    return this.#guard(async () => this.#clean(await this.#wire.submit(act)));
  }

  request(req: SignedRequest): Promise<Result<RequestResult>> {
    return this.#guard(async () => this.#clean(await this.#wire.request(req)));
  }

  redeem(redemption: Redemption): Promise<Result<Joined | Redeemed>> {
    return this.#guard(async () => this.#clean(await this.#wire.redeem(redemption)));
  }

  read<Q extends ReadQuery>(auth: string, query: Q): Promise<ReadResults[Q["q"]]> {
    return this.#guard(() => this.#wire.read(auth as SessionToken, query));
  }

  subscribe(auth: string, cursor?: Cursor) {
    return this.#guard(() => this.#wire.subscribe(auth as SessionToken, cursor));
  }

  dispose(): void {
    this.#wire[Symbol.dispose]();
  }
}
