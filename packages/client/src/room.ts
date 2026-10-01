/**
 * The typed handle: the contract's `RoomApi`, with `HttpRoom` (long poll and
 * WebSocket) and `Room` (RPC stream) on top. One implementation of every act
 * and read; only the wire differs.
 */

import {
  isArtroomError,
  isRefusal,
  type ActId,
  type ActOptions,
  type ActRecord,
  type ArtroomError,
  type AttentionPage,
  type Check,
  type CheckActInput,
  type Claim,
  type ClaimInput,
  type Credentials,
  type Cursor,
  type EnvelopeKind,
  type IdempotencyKey,
  type SignedEnvelope,
  type Explanation,
  type Held,
  type HttpRoom,
  type Landing,
  type Lane,
  type LaneFilter,
  type LaneId,
  type LogPage,
  type LogRequest,
  type Note,
  type NoteAnchor,
  type NoteInput,
  type OpByKind,
  type OpKind,
  type OpRef,
  type OpState,
  type Page,
  type PageRequest,
  type Proposal,
  type ProposalAt,
  type ProposalRef,
  type ProposeInput,
  type ReadQuery,
  type ReadResults,
  type Reached,
  type Release,
  type ReleaseInput,
  type Renewal,
  type RequestBody,
  type Result,
  type Review,
  type ReviewInput,
  type Room,
  type RoomId,
  type RoomName,
  type Roster,
  type RosterOp,
  type RosterRecord,
  type Session,
  type Subscription,
  type ByteStream,
  type Update,
  type UpdateStream,
  type WaitOptions,
  type WorkspaceGrant,
  type WorkspaceOp,
} from "@generalbusiness/artroom-contract";
import { artroomError } from "./errors.ts";
import { buildEnvelope, checkIdempotencyKey, signEnvelope, signRequest, type Identity } from "./envelope.ts";
import { newIdempotencyKey } from "./keys.ts";
import type { BearerActor } from "./bearer.ts";
import type { ClientOptions, HttpWire, RequestResult, RpcWire, Wire } from "./wire.ts";

type Obj = Record<string, unknown>;

/** Copies only the named fields that are present, so bodies stay closed (R-SIG-4). */
function pick(source: object, keys: readonly string[]): Obj {
  const out: Obj = {};
  const s = source as Obj;
  for (const k of keys) if (s[k] !== undefined) out[k] = s[k];
  return out;
}

const SESSION_TTL_SECONDS = 3600;
const SESSION_MARGIN_MS = 60_000;
const WAIT_DEFAULT_MS = 30_000;
const WAIT_MAX_MS = 300_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retries `attempt` after retryable failures, then says how to retry safely. */
export async function withRetries<T>(attempt: () => Promise<T>, retries: number, idempotencyKey: string | undefined): Promise<T> {
  for (let n = 0; ; n++) {
    try {
      return await attempt();
    } catch (e) {
      if (!isArtroomError(e) || !e.retryable) throw e;
      if (n >= retries) {
        if (idempotencyKey === undefined) throw e;
        throw {
          ...e,
          maybeRecorded: e.maybeRecorded ?? false,
          message: `${e.message} Retry with idempotency key ${idempotencyKey}: if the act was recorded, the room returns the original result (R-IDEM-2).`,
        } satisfies ArtroomError;
      }
      await sleep(Math.min(e.retryAfterMs ?? 200 * 2 ** n, 5_000));
    }
  }
}

/** An act, resolved and, for a key, signed: everything needed to send it again unchanged. */
export interface PreparedAct {
  readonly kind: EnvelopeKind;
  readonly target: unknown;
  readonly body: unknown;
  readonly idempotencyKey: IdempotencyKey;
  /** The signed envelope; absent for a bearer session, where the room signs. */
  readonly signed?: SignedEnvelope;
}

/** `ActOptions`, plus a hook to persist the prepared act before it is first sent. */
export interface ClientActOptions extends ActOptions {
  readonly onPrepared?: (act: PreparedAct) => void | Promise<void>;
}

/** The shared core of every handle. */
abstract class RoomCore {
  readonly id: RoomId;
  #name: RoomName;
  protected readonly wire: Wire & { redactor: import("./errors.ts").Redactor };
  protected readonly creds: Credentials;
  protected readonly opts: ClientOptions;
  protected readonly bearer: BearerActor | undefined;
  #session: Session | undefined;
  #sessionPending: Promise<Session> | undefined;

  constructor(wire: Wire & { redactor: import("./errors.ts").Redactor }, creds: Credentials, id: RoomId, name: RoomName, opts: ClientOptions, bearer?: BearerActor) {
    this.wire = wire;
    this.creds = creds;
    this.id = id;
    this.#name = name;
    this.opts = opts;
    this.bearer = bearer;
    if (creds.kind === "bearer") wire.redactor.add(creds.token);
  }

  get name(): RoomName {
    return this.#name;
  }

  /** Set once by `connect`, from the room's genesis entry. */
  learnName(name: RoomName): void {
    this.#name = name;
  }

  protected now(): number {
    return (this.opts.now ?? Date.now)();
  }

  protected get identity(): Identity {
    if (this.creds.kind === "bearer") throw artroomError("internal", "A bearer session has no signing key.");
    return this.creds.kind === "delegation" ? { signer: this.creds.signer, delegation: this.creds.as } : { signer: this.creds.signer };
  }

  // ------------------------------------------------------------- credentials

  /** The read credential: the bearer token, or a session from a signed `session` request (R-CRED-5). */
  protected async auth(fresh = false): Promise<string> {
    if (this.creds.kind === "bearer") return this.creds.token;
    const s = this.#session;
    if (!fresh && s !== undefined && Date.parse(s.expiresAt) - this.now() > SESSION_MARGIN_MS) return s.token;
    this.#sessionPending ??= (async () => {
      try {
        const out = await this.#signedRequest({ kind: "session", ttlSeconds: SESSION_TTL_SECONDS });
        if (isRefusal(out)) throw artroomError("unauthenticated", `No read session: ${out.rule}: ${out.reason}`);
        const session = out as Session;
        this.wire.redactor.add(session.token);
        this.#session = session;
        return session;
      } finally {
        this.#sessionPending = undefined;
      }
    })();
    return (await this.#sessionPending).token;
  }

  /** Use a session the room already gave, for example with `Joined`. */
  adoptSession(session: Session): void {
    this.wire.redactor.add(session.token);
    this.#session = session;
  }

  protected async read<Q extends ReadQuery>(query: Q): Promise<ReadResults[Q["q"]]> {
    try {
      return await this.wire.read(await this.auth(), query);
    } catch (e) {
      // A session can end early, for example when a key is rotated (R-CRED-7). Start one more, once.
      if (isArtroomError(e) && e.code === "unauthenticated" && this.creds.kind !== "bearer") {
        return await this.wire.read(await this.auth(true), query);
      }
      throw e;
    }
  }

  async #signedRequest(body: RequestBody): Promise<Result<RequestResult>> {
    if (this.bearer !== undefined) return this.bearer.request(body);
    // Each attempt is signed afresh: the room refuses a nonce it has seen (R-CRED-6).
    return withRetries(async () => this.wire.request(await signRequest(this.id, this.identity, body, this.now())), this.opts.retries ?? 3, undefined);
  }

  // -------------------------------------------------------------------- acts

  protected async act<T>(kind: EnvelopeKind, target: unknown, body: unknown, opts?: ClientActOptions): Promise<Result<T>> {
    const idempotencyKey = checkIdempotencyKey(opts?.idempotencyKey ?? newIdempotencyKey());
    const prepared: PreparedAct =
      this.bearer !== undefined
        ? { kind, target, body, idempotencyKey }
        : { kind, target, body, idempotencyKey, signed: await signEnvelope(buildEnvelope(this.id, this.identity, kind, target, body, idempotencyKey), this.identity.signer) };
    await opts?.onPrepared?.(prepared);
    return (await this.replay(prepared)) as Result<T>;
  }

  /**
   * Sends a prepared act, unchanged: the same signed bytes, or for a bearer
   * the same tool call, with the same idempotency key. If the room recorded
   * it before, it returns the original result (R-IDEM-2). Use it to finish
   * an act after a restart, without reading or rebuilding anything.
   */
  async replay(act: PreparedAct): Promise<Result<ActRecord>> {
    const retries = this.opts.retries ?? 3;
    if (act.signed === undefined) {
      if (this.bearer === undefined) throw artroomError("bad-request", "This act was prepared for a bearer session; it has no signature.");
      const bearer = this.bearer;
      return withRetries(() => bearer.act(act.kind, act.target, act.body, act.idempotencyKey), retries, act.idempotencyKey);
    }
    if (act.signed.envelope.room !== this.id) throw artroomError("bad-request", "This act was prepared for another room.");
    const signed = act.signed;
    // The same signed bytes on every attempt: a retry is the same request (R-IDEM-1, R-IDEM-2).
    return withRetries(() => this.wire.submit(signed), retries, act.idempotencyKey);
  }

  claim(input: ClaimInput, opts?: ClientActOptions): Promise<Result<Claim>> {
    const lane = (input as { lane?: LaneId | Held }).lane;
    if (lane === undefined) {
      return this.act("claim", null, pick(input, ["goal", "scope", "purpose", "plan", "because"]), opts);
    }
    const body = pick(input, ["scope", "goal", "plan", "because", "expectedGeneration"]);
    if (typeof lane === "string") return this.act("claim", { lane }, body, opts); // take-over (R-LANE-7)
    return this.act("claim", { lane: lane.lane }, { ...body, lease: lane.lease.generation }, opts); // rescope (R-LANE-2)
  }

  propose(held: Held, input: ProposeInput, opts?: ClientActOptions): Promise<Result<Proposal>> {
    return this.act("propose", { lane: held.lane }, { ...pick(input, ["expectedGeneration", "head", "summary", "because"]), lease: held.lease.generation }, opts);
  }

  note(anchor: NoteAnchor, input: NoteInput, opts?: ClientActOptions): Promise<Result<Note>> {
    const target = "act" in anchor ? { act: anchor.act } : pick(anchor, ["lane", "generation", "head", "path", "line", "endLine"]);
    return this.act("note", target, pick(input, ["text", "replyTo"]), opts);
  }

  review(proposal: ProposalAt, input: ReviewInput, opts?: ClientActOptions): Promise<Result<Review>> {
    return this.act(
      "review",
      { lane: proposal.lane, generation: proposal.generation },
      { head: proposal.head, ...pick(input, ["verdict", "scope", "dependsOn", "text"]) },
      opts,
    );
  }

  check(proposal: ProposalRef, input: CheckActInput, opts?: ClientActOptions): Promise<Result<Check>> {
    return this.act(
      "check",
      { lane: proposal.lane, generation: proposal.generation },
      pick(input, ["obligation", "check", "integration", "input", "config", "runner", "volatile", "ok", "detail", "landOp"]),
      opts,
    );
  }

  land(held: Held, proposal: ProposalAt, opts?: ClientActOptions): Promise<Result<Landing>> {
    if (held.lane !== proposal.lane) return Promise.reject(artroomError("bad-request", "The proposal is not on the held lane."));
    return this.act("land", { lane: proposal.lane, generation: proposal.generation }, { lease: held.lease.generation, head: proposal.head }, opts);
  }

  release(held: Held, input?: ReleaseInput, opts?: ClientActOptions): Promise<Result<Release>> {
    return this.act("release", { lane: held.lane }, { lease: held.lease.generation, ...pick(input ?? {}, ["note"]) }, opts);
  }

  renew(held: Held, opts?: ClientActOptions): Promise<Result<Renewal>> {
    return this.act("renew", { lane: held.lane }, { lease: held.lease.generation }, opts);
  }

  roster(op: RosterOp, opts?: ClientActOptions): Promise<Result<RosterRecord>> {
    return this.act("roster", null, op, opts);
  }

  async workspace(held: Held): Promise<Result<WorkspaceOp>> {
    return (await this.#signedRequest({ kind: "workspace", lane: held.lane, lease: held.lease.generation })) as Result<WorkspaceOp>;
  }

  /** Judged afresh at each call, and never cached (R-WS-2, R-WS-4). */
  async workspaceToken(held: Held): Promise<Result<WorkspaceGrant>> {
    const out = (await this.#signedRequest({ kind: "workspace-token", lane: held.lane, lease: held.lease.generation })) as Result<WorkspaceGrant>;
    if (!isRefusal(out)) this.wire.redactor.add(out.token);
    return out;
  }

  // ------------------------------------------------------------------- reads

  lane(id: LaneId): Promise<Lane | null> {
    return this.read({ q: "lane", lane: id });
  }

  lanes(filter?: LaneFilter & PageRequest): Promise<Page<Lane>> {
    return this.read(filter === undefined ? { q: "lanes" } : { q: "lanes", filter });
  }

  proposal(ref: ProposalRef): Promise<Proposal | null> {
    return this.read({ q: "proposal", ref: { lane: ref.lane, generation: ref.generation } });
  }

  async op<K extends OpKind>(ref: OpRef<K>): Promise<OpByKind[K]> {
    return (await this.read({ q: "op", op: ref.id })) as OpByKind[K];
  }

  /** Resolves when the operation reaches one of `until`; throws `timeout` after `timeoutMs` (R-API-5). */
  async wait<K extends OpKind, const S extends OpState<K>>(op: OpRef<K>, opts: WaitOptions<S>): Promise<Reached<K, S>> {
    const total = Math.min(Math.max(opts.timeoutMs ?? WAIT_DEFAULT_MS, 0), WAIT_MAX_MS);
    const deadline = this.now() + total;
    const until = opts.until as readonly string[];
    for (;;) {
      const remaining = deadline - this.now();
      let current: OpByKind[OpKind] | undefined;
      try {
        current = await this.read({ q: "op", op: op.id, until, timeoutMs: Math.max(remaining, 0) });
      } catch (e) {
        if (!(isArtroomError(e) && e.code === "timeout")) throw e;
      }
      if (current !== undefined && until.includes(current.state)) return current as Reached<K, S>;
      if (deadline - this.now() <= 0) {
        throw artroomError("timeout", `Operation ${op.id} did not reach ${until.join(" or ")} within ${total} ms${current ? `; it is ${current.state}` : ""}.`);
      }
      if (current !== undefined) await sleep(Math.min(250, Math.max(deadline - this.now(), 0)));
    }
  }

  /** The attention queue, with `publishedThrough` from the same read (R-API-9). */
  attention(page?: PageRequest): Promise<AttentionPage> {
    return this.read(page === undefined ? { q: "attention" } : { q: "attention", page });
  }

  log(req?: LogRequest): Promise<LogPage> {
    return this.read(req === undefined ? { q: "log" } : { q: "log", req });
  }

  explain(act: ActId): Promise<Explanation | null> {
    return this.read({ q: "explain", act });
  }

  members(): Promise<Roster> {
    return this.read({ q: "members" });
  }

  /** Releases the client side only: the room holds no state for a handle (R-API-2). */
  [Symbol.dispose](): void {
    this.#session = undefined;
    this.wire.dispose();
  }
}

/** The handle over HTTPS (`HttpRoom`). */
export class HttpRoomClient extends RoomCore implements HttpRoom {
  readonly #http: HttpWire;
  readonly #watches = new Set<WatchSubscription>();

  constructor(wire: HttpWire, creds: Credentials, id: RoomId, name: RoomName, opts: ClientOptions, bearer?: BearerActor) {
    super(wire, creds, id, name, opts, bearer);
    this.#http = wire;
  }

  /** The HTTPS long poll: the next update after `cursor`, or an empty one after `waitMs` (R-API-8). */
  async subscribe(cursor?: Cursor, opts?: { readonly waitMs?: number }): Promise<Update> {
    const waitMs = Math.min(Math.max(opts?.waitMs ?? 25_000, 0), WAIT_MAX_MS);
    try {
      return await this.#http.subscribe(await this.auth(), cursor, waitMs);
    } catch (e) {
      if (isArtroomError(e) && e.code === "unauthenticated" && this.creds.kind !== "bearer") {
        return await this.#http.subscribe(await this.auth(true), cursor, waitMs);
      }
      throw e;
    }
  }

  /**
   * A WebSocket that calls `onUpdate` for each update and reconnects from
   * the last cursor it saw, so no update is skipped or repeated (R-API-6,
   * R-API-8).
   *
   * When a socket cannot open, the handle checks its credential over HTTPS
   * before trying again: an ended read session is replaced (R-CRED-7); a
   * credential the room no longer accepts stops the watch, sets `error`, and
   * calls `onError` once, rather than retrying forever.
   */
  watch(cursor: Cursor | undefined, onUpdate: (update: Update) => void, onError?: (error: ArtroomError) => void): Watch {
    const Ws = this.opts.WebSocket ?? globalThis.WebSocket;
    if (Ws === undefined) throw artroomError("bad-request", "This runtime has no WebSocket; use subscribe() instead.");
    const sub: WatchSubscription = new WatchSubscription(cursor, {
      open: async (from) => {
        const url = this.#http.url("/ws", from === undefined ? {} : { cursor: from });
        url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
        // Browsers cannot set headers on a WebSocket, so the credential travels as a subprotocol, never in the URL.
        return new Ws(url, [WS_PROTOCOL, `${WS_TOKEN_PREFIX}${await this.auth()}`]);
      },
      // A read with the current credential. `read` replaces an ended session once, and throws if the room refuses again.
      check: async () => {
        await this.read({ q: "log", req: { limit: 1 } });
      },
      onUpdate,
      onError: onError ?? (() => {}),
      onClose: () => this.#watches.delete(sub),
    });
    this.#watches.add(sub);
    return sub;
  }

  override [Symbol.dispose](): void {
    for (const w of [...this.#watches]) w.close();
    super[Symbol.dispose]();
  }
}

/** The subprotocol a `watch` socket asks for. */
export const WS_PROTOCOL = "artroom.v1";
/** The prefix of the subprotocol that carries the read credential. */
export const WS_TOKEN_PREFIX = "artroom.token.";

/** A live `watch`: the contract's `Subscription`, and why it stopped, if it did. */
export interface Watch extends Subscription {
  /** Set when the room stopped accepting the credential; the watch has then closed. */
  readonly error: ArtroomError | undefined;
  readonly closed: boolean;
}

interface WatchDeps {
  open(cursor: Cursor | undefined): Promise<WebSocket>;
  check(): Promise<void>;
  onUpdate(update: Update): void;
  onError(error: ArtroomError): void;
  onClose(): void;
}

class WatchSubscription implements Watch {
  #cursor: Cursor | undefined;
  #socket: WebSocket | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #closed = false;
  #failures = 0;
  #error: ArtroomError | undefined;
  readonly #deps: WatchDeps;

  constructor(cursor: Cursor | undefined, deps: WatchDeps) {
    this.#cursor = cursor;
    this.#deps = deps;
    void this.#connect();
  }

  /** The cursor after the last update delivered; pass it to `watch` or `subscribe` to resume. */
  get cursor(): Cursor {
    return (this.#cursor ?? "") as Cursor;
  }

  get error(): ArtroomError | undefined {
    return this.#error;
  }

  get closed(): boolean {
    return this.#closed;
  }

  async #connect(): Promise<void> {
    this.#timer = undefined;
    if (this.#closed) return;
    let socket: WebSocket;
    try {
      socket = await this.#deps.open(this.#cursor);
    } catch (e) {
      this.#failed(e);
      return;
    }
    if (this.#closed) {
      socket.close(1000);
      return;
    }
    this.#socket = socket;
    let opened = false;
    socket.onopen = () => {
      opened = true;
      this.#failures = 0;
    };
    socket.onmessage = (event: MessageEvent) => {
      let update: Update;
      try {
        update = JSON.parse(typeof event.data === "string" ? event.data : String(event.data)) as Update;
      } catch {
        return;
      }
      if (typeof update !== "object" || update === null || typeof update.cursor !== "string") return;
      this.#cursor = update.cursor;
      this.#deps.onUpdate(update);
    };
    socket.onclose = () => {
      if (this.#socket === socket) this.#socket = undefined;
      if (this.#closed) return;
      if (opened) this.#retry();
      // It never opened: perhaps the credential ended. Check it over HTTPS before trying again.
      else void this.#deps.check().then(() => this.#retry(), (e: unknown) => this.#failed(e));
    };
    socket.onerror = () => {};
  }

  /** A retryable failure tries again later; any other failure ends the watch, observably. */
  #failed(e: unknown): void {
    if (this.#closed) return;
    if (isArtroomError(e) && !e.retryable) {
      this.#error = e;
      this.close();
      this.#deps.onError(e);
      return;
    }
    this.#retry();
  }

  #retry(): void {
    if (this.#closed) return;
    const delay = Math.min(250 * 2 ** this.#failures++, 10_000);
    this.#timer = setTimeout(() => void this.#connect(), delay);
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#socket?.close(1000);
    this.#socket = undefined;
    this.#deps.onClose();
  }

  [Symbol.dispose](): void {
    this.close();
  }
}

/** The handle over a service binding (`Room`). */
export class RpcRoomClient extends RoomCore implements Room {
  readonly #rpc: RpcWire;

  constructor(wire: RpcWire, creds: Credentials, id: RoomId, name: RoomName, opts: ClientOptions, bearer?: BearerActor) {
    super(wire, creds, id, name, opts, bearer);
    this.#rpc = wire;
  }

  /** The room's newline-delimited JSON bytes, decoded into updates (R-API-8). */
  async subscribe(cursor?: Cursor): Promise<UpdateStream> {
    return decodeUpdates(await this.#rpc.subscribe(await this.auth(), cursor));
  }
}

/**
 * Decodes a `ByteStream` of UTF-8, newline-delimited JSON `Update`s into an
 * `UpdateStream` (R-API-8). A line may arrive across several chunks; a
 * chunk may hold several lines. A line that is not an update is an error,
 * not a silent gap.
 */
export function decodeUpdates(bytes: ByteStream): UpdateStream {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  const queue: Update[] = [];
  let ended = false;
  const reader = bytes.getReader();
  const parse = (line: string) => {
    if (line.trim() === "") return;
    let u: unknown;
    try {
      u = JSON.parse(line);
    } catch {
      throw artroomError("internal", "The room's update stream held a line that is not JSON.");
    }
    if (typeof u !== "object" || u === null || typeof (u as Update).cursor !== "string") throw artroomError("internal", "The room's update stream held a line that is not an update.");
    queue.push(u as Update);
  };
  return {
    getReader: () => ({
      read: async () => {
        while (queue.length === 0 && !ended) {
          const chunk = await reader.read();
          if (chunk.done) {
            ended = true;
            buffer += decoder.decode();
            if (buffer.length > 0) parse(buffer);
            buffer = "";
            break;
          }
          buffer += decoder.decode(chunk.value, { stream: true });
          for (let nl = buffer.indexOf("\n"); nl >= 0; nl = buffer.indexOf("\n")) {
            parse(buffer.slice(0, nl));
            buffer = buffer.slice(nl + 1);
          }
        }
        const next = queue.shift();
        return next === undefined ? { done: true as const } : { done: false as const, value: next };
      },
      releaseLock: () => reader.releaseLock(),
    }),
    cancel: (reason?: unknown) => bytes.cancel(reason),
  };
}

export type { ActRecord };
