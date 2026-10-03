/**
 * The typed handle: the contract's `RoomApi`, with `HttpRoom` (long poll and
 * WebSocket) and `Room` (RPC stream) on top. One implementation of every act
 * and read; only the wire differs.
 */

import { canonicalize } from "./canonical.ts";
import {
  isArtroomError,
  isRefusal,
  type ActId,
  type ActOptions,
  type ActRecord,
  type AnySignedEnvelope,
  type ArtroomError,
  type Binding,
  type Catalogue,
  type CatalogueAt,
  type DeclaredRecord,
  type DeclaredTarget,
  type GenericActOptions,
  type Json,
  type KindName,
  type AttentionPage,
  type Check,
  type CheckActInput,
  type Claim,
  type ClaimInput,
  type Credentials,
  type Cursor,
  type EnvelopeKind,
  type IdempotencyKey,
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
import { builtForBinding, governs, isPlatformKind } from "@generalbusiness/artroom-policy/declared";
import { buildDeclaredEnvelope, buildEnvelope, checkBinding, checkIdempotencyKey, signEnvelope, signRequest, type Identity } from "./envelope.ts";
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
export async function withRetries<T>(attempt: () => Promise<T>, retries: number, idempotencyKey: string | undefined, backoff: ClientOptions["backoff"] = undefined): Promise<T> {
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
      const wait = Math.min(e.retryAfterMs ?? 200 * 2 ** n, 5_000);
      await sleep(backoff ? backoff(wait) : wait);
    }
  }
}

/** An act, resolved and, for a key, signed: everything needed to send it again unchanged. */
export interface PreparedAct {
  /** A legacy, platform or declared kind. */
  readonly kind: EnvelopeKind | KindName;
  readonly target: unknown;
  readonly body: unknown;
  readonly idempotencyKey: IdempotencyKey;
  /**
   * For a generic declared act: the binding the caller read (R-DECL-16). It
   * is kept with the act, so a resend carries the same binding and never a
   * newer one. Absent for the named methods.
   */
  readonly binding?: Binding;
  /** The signed envelope, of either version; absent for a bearer session, where the room signs. */
  readonly signed?: AnySignedEnvelope;
}

/** `value` and everything inside it, frozen. */
function frozen<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    Object.freeze(value);
    for (const inner of Object.values(value)) frozen(inner); // G5:intent-frozen-deep
  }
  return value;
}

/**
 * The handle's own copy of an act's target and body, deeply frozen. A
 * prepared act must stay the bytes that were signed, or for a bearer the
 * call that was made, whatever the caller does afterwards with the objects
 * it passed in: the envelope and the prepared act hold these copies, never
 * the caller's objects (R-IDEM-2).
 */
function ownedIntent<T, B>(target: T, body: B): { readonly target: T; readonly body: B } {
  let copy: { target: T; body: B };
  try {
    copy = { target: structuredClone(target), body: structuredClone(body) };
  } catch {
    throw artroomError("bad-request", "An act's target and body must be plain data: the handle keeps them, to send the act again unchanged."); // G5:intent-plain
  }
  return frozen(copy); // G5:intent-frozen
}

/** `ActOptions`, plus a hook to persist the prepared act before it is first sent. */
export interface ClientActOptions extends ActOptions {
  readonly onPrepared?: (act: PreparedAct) => void | Promise<void>;
}

/** The generic act's options: the binding is required; the hook is as for the named methods. */
export interface ClientGenericActOptions extends GenericActOptions {
  readonly onPrepared?: (act: PreparedAct) => void | Promise<void>;
}

/** The seven code-review kinds the named methods sign. `renew` and `roster` are platform kinds and stay `v: 1`. */
const NAMED_DECLARED: ReadonlySet<string> = new Set(["claim", "propose", "note", "review", "check", "land", "release"]);

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
  /** The active catalogue the named methods sign under, read once and kept until the room says it is stale. */
  #vocabulary: Catalogue | undefined;
  /**
   * Catalogues of ended policy versions this handle read, for `actsAt`. An
   * ended version is not final: a later activation can set `retired` on its
   * kinds. So every one is dropped when the handle sees a later activation
   * than the latest it knew.
   */
  readonly #ended: Catalogue[] = [];
  /** The seq of the latest `policy-activated` entry this handle has seen, by any read. */
  #activation = -1;
  /**
   * Named acts this handle sent and got no answer for, by idempotency key.
   * A caller that repeats the call with the same key gets the same bytes
   * sent again, as first built, also when the room's vocabulary changed in
   * between (R-IDEM-2, R-DECL-16). Building the act again under the
   * vocabulary now in force would be a different act under the same key.
   */
  readonly #unanswered = new Map<string, PreparedAct>();

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
    return withRetries(async () => this.wire.request(await signRequest(this.id, this.identity, body, this.now())), this.opts.retries ?? 3, undefined, this.opts.backoff);
  }

  // -------------------------------------------------------------------- acts

  /**
   * The binding a named method signs with, or undefined for envelope `v: 1`
   * (R-API-9 as amended). `renew` and `roster` are platform kinds: always
   * `v: 1`. For the seven code-review kinds the handle reads the room's
   * active catalogue once. Under a `v1` document they are `v: 1`, as before.
   * Under a `v2` document each is `v: 2` with the binding of the code-review
   * declaration the method was built for, under the room's steps version
   * and `lanes`. It is never the room's own declaration's binding: where the
   * two differ the room refuses `binding-stale`.
   */
  async #builtFor(kind: string): Promise<Binding | undefined> {
    if (!NAMED_DECLARED.has(kind)) return undefined; // G5:named-platform-v1
    this.#vocabulary ??= await this.acts();
    const c = this.#vocabulary;
    if (c.vocabulary !== "declared") return undefined; // G5:named-legacy-v1
    return (await builtForBinding(c, kind)) ?? undefined;
  }

  /**
   * Note an activation at `seq`. If it is later than any this handle knew,
   * the ended catalogues it kept are dropped: their `retired` marks were
   * read before it (R-DECL-23).
   */
  #sawActivation(seq: number): void {
    if (seq <= this.#activation) return; // G5:cache-later
    this.#activation = seq;
    this.#ended.length = 0; // G5:cache-drop
  }

  /** The seq inside an entry ID, `act_<seq>_<hash>`: a policy version is its `policy-activated` entry's ID. */
  static #seqOf(id: unknown): number | undefined {
    const m = typeof id === "string" ? /^act_(\d+)_/.exec(id) : null;
    return m ? Number(m[1]) : undefined;
  }

  /** Activations named by what the room just answered: a refusal's current policy version, an update's or a log page's entries. */
  protected sawRefusal(out: unknown): void {
    const seq = isRefusal(out) ? RoomCore.#seqOf(out.current?.policy) : undefined;
    if (seq !== undefined) this.#sawActivation(seq); // G5:cache-refusal
  }

  protected sawUpdate(update: Update): void {
    for (const e of update.entries) if (e.type === "system" && e.kind === "policy-activated") this.#sawActivation(e.seq); // G5:cache-update
  }

  /**
   * Forget the catalogue the named methods sign under. Called when the room
   * says an act's vocabulary or binding is not the active one, so the
   * caller's next call reads again. The refused act itself is never sent
   * again by the handle (R-DECL-16).
   */
  #vocabularyStale(out: unknown): void {
    if (isRefusal(out) && (out.rule === "binding-stale" || out.rule === "kind-undeclared")) this.#vocabulary = undefined; // G5:named-forget
  }

  /** One of the named methods' acts: built, signed for a key, and sent. */
  protected async named<T>(kind: EnvelopeKind, givenTarget: unknown, givenBody: unknown, opts?: ClientActOptions): Promise<Result<T>> {
    const idempotencyKey = checkIdempotencyKey(opts?.idempotencyKey ?? newIdempotencyKey());
    const { target, body } = ownedIntent(givenTarget, givenBody); // G5:named-owned
    const kept = this.#unanswered.get(idempotencyKey);
    let prepared: PreparedAct;
    if (kept !== undefined && kept.kind === kind && canonicalize(kept.target) === canonicalize(target) && canonicalize(kept.body) === canonicalize(body)) {
      prepared = kept; // G5:named-retry-kept
    } else if (this.bearer !== undefined) {
      // The room signs. For a named tool in a `v2` room it adds the built-for binding itself (R-CRED-10).
      prepared = { kind, target, body, idempotencyKey };
    } else {
      const binding = await this.#builtFor(kind);
      const envelope =
        binding === undefined
          ? buildEnvelope(this.id, this.identity, kind, target, body, idempotencyKey)
          : buildDeclaredEnvelope(this.id, this.identity, kind, binding, target as DeclaredTarget, body, idempotencyKey); // G5:named-v2
      prepared = { kind, target, body, idempotencyKey, signed: await signEnvelope(envelope, this.identity.signer) };
    }
    await opts?.onPrepared?.(prepared);
    let out: Result<ActRecord>;
    try {
      out = await this.replay(prepared);
    } catch (e) {
      // A room that left the vocabulary this handle read answers `bad-request` at step 1: read again next time.
      if (isArtroomError(e) && e.code === "bad-request") {
        this.#vocabulary = undefined; // G5:named-forget-vocabulary
        // The room answers an exact retry of an accepted act before step 1, so it never accepted this one.
        this.#unanswered.delete(idempotencyKey);
      } else {
        // No answer: the room may have recorded it. A repeat with this key sends these bytes.
        if (this.#unanswered.size >= 64 && !this.#unanswered.has(idempotencyKey)) this.#unanswered.delete(this.#unanswered.keys().next().value!);
        this.#unanswered.set(idempotencyKey, prepared); // G5:named-retry-keep
      }
      throw e;
    }
    this.#unanswered.delete(idempotencyKey);
    this.#vocabularyStale(out);
    this.sawRefusal(out);
    return out as Result<T>;
  }

  /**
   * An act of any declared kind (R-DECL-16, R-API-9 as amended). The caller
   * gives the binding it read from `acts()`: the meaning it intends. The
   * handle signs exactly this kind, target, body and binding in envelope
   * `v: 2`, or for a bearer session passes them to the room unchanged.
   *
   * It never reads the catalogue, never replaces the binding and never
   * signs again. If the room refuses `binding-stale`, the refusal's
   * `current` names the active binding and policy version; the caller reads
   * the declaration, decides, and calls again with that binding if the new
   * meaning is still what it intends. An exact retry (the same idempotency
   * key and bytes, by `replay`) of an act the room accepted returns the
   * original record, also after an activation (R-IDEM-2).
   */
  async act(
    kind: KindName,
    givenTarget: DeclaredTarget,
    givenBody: { readonly [field: string]: Json },
    opts: GenericActOptions & Pick<ClientGenericActOptions, "onPrepared">,
  ): Promise<Result<DeclaredRecord>> {
    const binding = checkBinding(opts?.binding);
    if (typeof kind !== "string" || isPlatformKind(kind))
      throw artroomError("bad-request", `${String(kind)} is a platform kind, signed in envelope v: 1 with no binding. Use its own method.`); // G5:generic-platform
    const idempotencyKey = checkIdempotencyKey(opts.idempotencyKey ?? newIdempotencyKey());
    const { target, body } = ownedIntent(givenTarget, givenBody); // G5:act-owned
    const prepared: PreparedAct =
      this.bearer !== undefined
        ? { kind, target, body, idempotencyKey, binding }
        : {
            kind,
            target,
            body,
            idempotencyKey,
            binding,
            signed: await signEnvelope(buildDeclaredEnvelope(this.id, this.identity, kind, binding, target, body, idempotencyKey), this.identity.signer),
          };
    await opts.onPrepared?.(prepared);
    const out = await this.replay(prepared);
    this.sawRefusal(out);
    return out as Result<DeclaredRecord>;
  }

  /**
   * Sends a prepared act, unchanged: the same signed bytes, or for a bearer
   * the same tool call, with the same idempotency key and, for a generic
   * act, the same binding. If the room recorded it before, it returns the
   * original result (R-IDEM-2). Use it to finish an act after a restart,
   * without reading or rebuilding anything.
   */
  async replay(act: PreparedAct): Promise<Result<ActRecord>> {
    const retries = this.opts.retries ?? 3;
    if (act.signed === undefined) {
      if (this.bearer === undefined) throw artroomError("bad-request", "This act was prepared for a bearer session; it has no signature.");
      const bearer = this.bearer;
      return withRetries(() => bearer.act(act.kind, act.target, act.body, act.idempotencyKey, act.binding), retries, act.idempotencyKey, this.opts.backoff); // G5:replay-binding
    }
    if (act.signed.envelope.room !== this.id) throw artroomError("bad-request", "This act was prepared for another room.");
    const signed = act.signed;
    // The same signed bytes on every attempt: a retry is the same request (R-IDEM-1, R-IDEM-2).
    return withRetries(() => this.wire.submit(signed), retries, act.idempotencyKey, this.opts.backoff);
  }

  claim(input: ClaimInput, opts?: ClientActOptions): Promise<Result<Claim>> {
    const lane = (input as { lane?: LaneId | Held }).lane;
    if (lane === undefined) {
      return this.named("claim", null, pick(input, ["goal", "scope", "purpose", "plan", "because"]), opts);
    }
    const body = pick(input, ["scope", "goal", "plan", "because", "expectedGeneration"]);
    if (typeof lane === "string") return this.named("claim", { lane }, body, opts); // take-over (R-LANE-7)
    return this.named("claim", { lane: lane.lane }, { ...body, lease: lane.lease.generation }, opts); // rescope (R-LANE-2)
  }

  propose(held: Held, input: ProposeInput, opts?: ClientActOptions): Promise<Result<Proposal>> {
    return this.named("propose", { lane: held.lane }, { ...pick(input, ["expectedGeneration", "head", "summary", "because"]), lease: held.lease.generation }, opts);
  }

  note(anchor: NoteAnchor, input: NoteInput, opts?: ClientActOptions): Promise<Result<Note>> {
    const target = "act" in anchor ? { act: anchor.act } : pick(anchor, ["lane", "generation", "head", "path", "line", "endLine"]);
    return this.named("note", target, pick(input, ["text", "replyTo"]), opts);
  }

  review(proposal: ProposalAt, input: ReviewInput, opts?: ClientActOptions): Promise<Result<Review>> {
    return this.named(
      "review",
      { lane: proposal.lane, generation: proposal.generation },
      { head: proposal.head, ...pick(input, ["verdict", "scope", "dependsOn", "text"]) },
      opts,
    );
  }

  check(proposal: ProposalRef, input: CheckActInput, opts?: ClientActOptions): Promise<Result<Check>> {
    return this.named(
      "check",
      { lane: proposal.lane, generation: proposal.generation },
      pick(input, ["obligation", "check", "integration", "input", "config", "runner", "volatile", "ok", "detail", "landOp"]),
      opts,
    );
  }

  land(held: Held, proposal: ProposalAt, opts?: ClientActOptions): Promise<Result<Landing>> {
    if (held.lane !== proposal.lane) return Promise.reject(artroomError("bad-request", "The proposal is not on the held lane."));
    return this.named("land", { lane: proposal.lane, generation: proposal.generation }, { lease: held.lease.generation, head: proposal.head }, opts);
  }

  release(held: Held, input?: ReleaseInput, opts?: ClientActOptions): Promise<Result<Release>> {
    return this.named("release", { lane: held.lane }, { lease: held.lease.generation, ...pick(input ?? {}, ["note"]) }, opts);
  }

  renew(held: Held, opts?: ClientActOptions): Promise<Result<Renewal>> {
    return this.named("renew", { lane: held.lane }, { lease: held.lease.generation }, opts);
  }

  roster(op: RosterOp, opts?: ClientActOptions): Promise<Result<RosterRecord>> {
    return this.named("roster", null, op, opts);
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

  async log(req?: LogRequest): Promise<LogPage> {
    const page = await this.read(req === undefined ? { q: "log" } : { q: "log", req });
    for (const e of page.acts) if (e.entry.type === "system" && e.entry.event.type === "policy-activated") this.#sawActivation(e.seq); // G5:cache-log
    return page;
  }

  explain(act: ActId): Promise<Explanation | null> {
    return this.read({ q: "explain", act });
  }

  members(): Promise<Roster> {
    return this.read({ q: "members" });
  }

  /**
   * The active policy version's declarations, with each kind's binding
   * (R-API-9 as amended). A room whose active document is `v1` answers with
   * the legacy catalogue. Always read from the room: this is what a caller
   * looks at before it prepares an act.
   */
  async acts(): Promise<Catalogue> {
    const c = await this.read({ q: "acts" });
    if (c === null) throw artroomError("internal", "The room has no active policy version.");
    this.#sawActivation(c.since); // G5:cache-active
    return c;
  }

  /**
   * The declarations in force at an entry's seq, `D(s)`, or of a named
   * policy version (R-DECL-23). Readers show a record with these labels and
   * fields, never the active ones. Null when the room retains no such
   * version.
   *
   * The handle keeps an ended version it read and answers later questions
   * about its interval without a read. An ended version's declarations and
   * bindings never change, but its `retired` marks can: a later activation
   * may drop one of its kinds. So the kept versions are dropped whenever
   * the handle sees a later activation: in a read of the active catalogue,
   * a log page, an update, or a refusal that names the active policy
   * version. A reader that follows the room therefore sees current marks.
   * An answer that arrives after the handle has learnt of a later activation
   * from another answer is returned to its caller but not kept, since it
   * may have been read before that activation.
   * `{ fresh: true }` reads from the room whatever the handle kept.
   */
  async actsAt(at: CatalogueAt, opts: { readonly fresh?: boolean } = {}): Promise<Catalogue | null> {
    const kept = opts.fresh === true ? undefined : this.#ended.find((c) => (at.seq !== undefined ? governs(c, at.seq) : c.policy === at.policy)); // G5:catalogue-cache
    if (kept) return kept;
    const known = this.#activation;
    const c = await this.read(at.seq !== undefined ? { q: "acts", at: at.seq } : { q: "acts", policy: at.policy });
    if (c === null) return null;
    // An answer is kept only if nothing else told the handle of a later activation while it was on its way. If
    // something did, this answer may have been read before that activation, and its `retired` marks are then older
    // than what the handle already knows: keeping it would bring them back.
    const overtaken = this.#activation !== known; // G5:cache-overtaken
    // What this answer says about activations: its own, and the one that ended it.
    this.#sawActivation(c.until ?? c.since); // G5:cache-read
    if (c.until !== null && !overtaken) {
      const i = this.#ended.findIndex((k) => k.policy === c.policy);
      if (i >= 0) this.#ended[i] = c; // G5:cache-replace
      else this.#ended.push(c);
    }
    return c;
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
    let update: Update;
    try {
      update = await this.#http.subscribe(await this.auth(), cursor, waitMs);
    } catch (e) {
      if (!(isArtroomError(e) && e.code === "unauthenticated" && this.creds.kind !== "bearer")) throw e;
      update = await this.#http.subscribe(await this.auth(true), cursor, waitMs);
    }
    this.sawUpdate(update);
    return update;
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
      onUpdate: (update) => {
        this.sawUpdate(update);
        onUpdate(update);
      },
      onError: onError ?? (() => {}),
      onClose: () => this.#watches.delete(sub),
      backoff: this.opts.backoff ?? ((ms) => ms),
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
  backoff(ms: number): number;
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
    this.#timer = setTimeout(() => void this.#connect(), this.#deps.backoff(delay));
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
    const updates = decodeUpdates(await this.#rpc.subscribe(await this.auth(), cursor));
    // Each update is looked at for a later activation as it is read (see `actsAt`).
    return {
      getReader: () => {
        const reader = updates.getReader();
        return {
          read: async () => {
            const r = await reader.read();
            if (!r.done) this.sawUpdate(r.value);
            return r;
          },
          releaseLock: () => reader.releaseLock(),
        };
      },
      cancel: (reason) => updates.cancel(reason),
    };
  }
}

/**
 * Decodes a `ByteStream` of UTF-8, newline-delimited JSON `Update`s into an
 * `UpdateStream` (R-API-8), with standard streams: the bytes are piped
 * through a `TextDecoderStream` and a line-splitting `TransformStream`. A
 * line may arrive across several chunks; a chunk may hold several lines.
 *
 * Ownership: the pipe owns the source; the caller owns the decoded stream.
 * `cancel()` ends the subscription whether or not the caller holds a
 * reader: a pending read resolves as done, and the cancel reaches the
 * source. Every failure, whether a bad byte, a line that is not an update,
 * or a failing source, rejects with an `ArtroomError`, never a raw error.
 */
export function decodeUpdates(bytes: ByteStream): UpdateStream {
  const updates = asReadable(bytes).pipeThrough(new TextDecoderStream("utf-8", { fatal: true }) as unknown as ReadableWritablePair<string, Uint8Array>).pipeThrough(splitUpdates());
  let active: ReadableStreamDefaultReader<Update> | undefined;
  return {
    getReader: () => {
      const reader = updates.getReader();
      active = reader;
      return {
        read: async () => {
          try {
            const r = await reader.read();
            return r.done ? { done: true as const } : { done: false as const, value: r.value };
          } catch (e) {
            throw streamError(e);
          }
        },
        releaseLock: () => {
          if (active === reader) active = undefined;
          reader.releaseLock();
        },
      };
    },
    cancel: async (reason?: unknown) => {
      try {
        if (active !== undefined) {
          const reader = active;
          active = undefined;
          await reader.cancel(reason); // resolves pending reads as done, and cancels back through the pipe
          reader.releaseLock();
        } else if (!updates.locked) await updates.cancel(reason);
      } catch (e) {
        throw streamError(e);
      }
    },
  };
}

/** A native `ReadableStream` as it is; a structural `ByteStream` wrapped, taking its reader only on the first pull. */
function asReadable(bytes: ByteStream): ReadableStream<Uint8Array> {
  if (typeof (bytes as Partial<ReadableStream>).pipeThrough === "function") return bytes as unknown as ReadableStream<Uint8Array>;
  let reader: ReturnType<ByteStream["getReader"]> | undefined;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      reader ??= bytes.getReader();
      const r = await reader.read();
      if (r.done) controller.close();
      else controller.enqueue(r.value);
    },
    async cancel(reason) {
      reader?.releaseLock();
      await bytes.cancel(reason);
    },
  });
}

/** Splits decoded text into lines and parses each as an `Update`. */
function splitUpdates(): TransformStream<string, Update> {
  let buffer = "";
  const parse = (line: string, controller: TransformStreamDefaultController<Update>) => {
    if (line.trim() === "") return;
    let u: unknown;
    try {
      u = JSON.parse(line);
    } catch {
      throw artroomError("internal", "The room's update stream held a line that is not JSON.");
    }
    if (typeof u !== "object" || u === null || typeof (u as Update).cursor !== "string") throw artroomError("internal", "The room's update stream held a line that is not an update.");
    controller.enqueue(u as Update);
  };
  return new TransformStream<string, Update>({
    transform(chunk, controller) {
      buffer += chunk;
      for (let nl = buffer.indexOf("\n"); nl >= 0; nl = buffer.indexOf("\n")) {
        parse(buffer.slice(0, nl), controller);
        buffer = buffer.slice(nl + 1);
      }
    },
    flush(controller) {
      parse(buffer, controller);
    },
  });
}

/** Any failure inside the update stream, as an `ArtroomError` whose message holds no stream content. */
function streamError(e: unknown): ArtroomError {
  if (isArtroomError(e)) return e;
  if (e instanceof TypeError && /encod|decod|utf/i.test(e.message)) return artroomError("internal", "The room's update stream held bytes that are not valid UTF-8.");
  return artroomError("unavailable", "The room's update stream failed. Subscribe again from your last cursor.");
}

export type { ActRecord };
