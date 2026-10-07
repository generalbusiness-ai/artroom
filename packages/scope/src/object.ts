/**
 * One scope as one Durable Object (scope contract, section 2.3): the object
 * named by the scope's ID in the one scope namespace, with SQLite storage.
 * This file only wires: the store over the object's storage, the ports, the
 * core, receiving, the dispatcher and the reads. Its public methods are the
 * scope's surface over RPC. It has no HTTP route; `worker.ts` has those.
 *
 * At genesis the scope checks that the digest of its seed equals this
 * object's name. An object that was not reached by a name has none, and
 * can be founded as nothing.
 *
 * With a transport, the object dispatches its outbox: after each call that
 * may have committed, without making the caller wait, and from its alarm.
 * With none, as this class is by default, its sends stay in the outbox.
 *
 * The operations driver runs at the same two moments (`operations.ts`), and
 * once more at the first call of the object's life, if an attempt is recorded
 * with no time to look at it next (`#first`). By default nothing is sent outside the service: the outside port of
 * `production()` sends nothing. The owners' rules of `production()` are
 * the capability code's, for the operations of `hold@1` and `git-read@1`.
 *
 * Four things here are no history, and no judgment reads any of them: the
 * read sessions that the object checks, and for a membership scope issues
 * (`sessions.ts`); the streams that it holds open; the serving limits of a
 * join, at the front of a membership scope (`limits.ts`); and the
 * operator's record (`operator.ts`). By default the object has no session
 * configuration: it issues no session, and its readers port is the
 * refusing one of `production()`.
 */

import { DurableObject } from "cloudflare:workers";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { SessionAnswer } from "@generalbusiness/artroom-contract";
import type { Answer, Beside, Bounds, Cursor, DeclaredDefinition, Digest, DutyId, Entry, Grant, Input, LogPage, OperationId, PlatformDefinition, Read, RetainedInput, ScopeId, Settlement, SignedIntent } from "@generalbusiness/artroom-contract";
import { isScopeId } from "@generalbusiness/artroom-bytes";
import { isEntryOf, timeMs, type Item } from "@generalbusiness/artroom-derive";
import type { ScopeState } from "@generalbusiness/artroom-derive";
import type { Delivered, StateView } from "@generalbusiness/artroom-derive";
import { Scope, type Checkpointed, type Founded } from "./core.ts";
import { Deliveries } from "./delivery.ts";
import { declaredBy, observedAt, routed, sentText, sourced, type Sourced } from "./namespace.ts";
import { JoinLimits, isJoin, type LimitConfig } from "./limits.ts";
import { Operations, type Outside } from "./operations.ts";
import { OperatorRecord, sendAgain, type Incident, type Resent } from "./operator.ts";
import { Dispatcher, Wakes } from "./outbox.ts";
import { production, type Alarm, type Authority, type Clock, type Delivery, type Ports, type Readers, type Transport } from "./ports.ts";
import { SessionRequests, Streams, issueSession, type Opened, type Sessions, type StreamRefusal } from "./sessions.ts";
import { READ_BOUNDS, Reads, type ReadBounds, type Summary } from "./reads.ts";
import { Chains, presentsSignedRead } from "./signed-reads.ts";
import { LATE, within } from "./turn.ts";
import { SqliteStore } from "./sqlite.ts";
import type { Duty, OperationStatus, Sealed, Store } from "./store.ts";

/**
 * What a deployment gives a scope in place of a default. `authority`: the
 * authority port, made once for the life of the object, which is one run
 * (authority note, section 3.3). It is made after the store, because a
 * scope reads its membership reference from its own genesis entry (the
 * contract's section 6.6). It is given the clock and the random source of
 * the ports as wired. With it, `ports.authority` is not used.
 *
 * `readers`: the readers port, made the same way, for a port that reads the
 * scope's own record: a read session is checked against the membership
 * reference that the scope records and against the time of its previous
 * entry (authority note, section 3.9). With it, `ports.readers` is not
 * used. `sessions`: the deployment's session configuration, asked at each
 * request for a session. Absent, or null: this object issues none.
 * `outside`: the outside port, made after the store, with live reads of
 * this scope's state, genesis and sealed entries. It is given no storage
 * writes or public RPC methods. With it, `ports.outside` is not used.
 * `limits`: the serving limits of a join, in place of the proposed ones.
 */
export interface Given extends Pick<Ports, "clock" | "random"> {
  genesis(): Extract<Input, { type: "genesis" }> | null;
  state: StateView;
  /** The scope's record: its reference, its head and the time of its previous entry. */
  scope(): ScopeState | null;
}
export interface OutsideGiven extends Given {
  /** One sealed entry of this scope, or null. No other scope is read. */
  own(seq: number): Sealed | null;
  /** One input already retained by this scope. No network read or storage write. */
  retained: Store["retained"];
}
export interface Wiring {
  ports?: Partial<Ports>; bounds?: Bounds; reads?: ReadBounds;
  authority?: (given: Given) => Authority;
  readers?: (given: Given) => Readers;
  outside?: (given: OutsideGiven) => Outside;
  sessions?: () => Sessions | null;
  limits?: LimitConfig;
}

export class ScopeObject<Env = unknown> extends DurableObject<Env> {
  readonly #name: ScopeId | null;
  readonly #store: SqliteStore;
  readonly #scope: Scope;
  readonly #reads: Reads;
  readonly #deliveries: Deliveries;
  readonly #dispatcher: Dispatcher | null;
  readonly #operations: Operations;
  readonly #clock: Clock;
  readonly #transport: Transport | null;
  readonly #seconds: number;
  readonly #record: OperatorRecord;
  readonly #streams: Streams;
  readonly #limits: JoinLimits;
  readonly #sessions: () => Sessions | null;
  readonly #requests: SessionRequests;
  /** The roots of this scope's cause chains, each found once (`signed-reads.ts`). */
  readonly #chains: Chains;
  /** The outside port as wired, for the one-time read of a member's read credential (`credential`). */
  readonly #outside: Outside;
  readonly #readers: Readers;
  /** True until this object's first turn: its first call or its alarm (`#first`). In memory, so a restart sets it again. */
  #fresh = true;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const name = ctx.id.name;
    const wiring = this.wiring(name);
    const bounds = wiring.bounds ?? PROPOSED_BOUNDS;
    // Authority note, section 5.4, rule 7: the attempts of one operation are spaced by a backoff, to a cap. The first is due at its
    // entry's time. The texts state no numbers for it: the delays are the dispatcher's (I3 deltas, entry EB8).
    const spacing = (attempt: number) => (attempt < 2 ? 0 : Math.min(bounds.dispatchRetrySeconds * 2 ** Math.min(attempt - 2, 30), bounds.dispatchRetryMaxSeconds) * 1000);
    const store = new SqliteStore({
      exec: (query, ...bindings) => ctx.storage.sql.exec(query, ...bindings),
      transaction: (closure) => ctx.storage.transactionSync(closure),
    }, spacing);
    // This object's one alarm. Its handler below starts the alarm's turn and a dispatch pass.
    const alarm: Alarm = { set: (at) => (at === null ? ctx.storage.deleteAlarm() : ctx.storage.setAlarm(timeMs(at)!)) };
    const given: Ports = { ...production(), alarm, ...wiring.ports };
    // The one alarm serves the earliest deadline, the next attempt of an outside operation and, with a transport, the next dispatch.
    const wakes = new Wakes(store, given.alarm, given.transport !== null);
    // The authority of a deployed scope reads this scope's own genesis entry, for the membership scope that it records.
    const genesis = (): Extract<Input, { type: "genesis" }> | null => {
      const kept = store.stored(0);
      const input = kept ? (JSON.parse(kept.bytes) as Entry).input : null;
      return input?.type === "genesis" ? input : null;
    };
    // A directory records its membership reference in an item, so the authority is also given the folded state (authority note, section 3.3).
    const made: Given = { clock: given.clock, random: given.random, genesis, state: store, scope: () => store.scope() };
    const authority = wiring.authority?.(made);
    const readers = wiring.readers?.(made);
    // The outside port reads the current record when it sends, outside any commit. A facade gives it only state reads, not the store.
    const outsideState: StateView = {
      scope: () => store.scope(), item: (...args) => store.item(...args), count: (...args) => store.count(...args), page: (...args) => store.page(...args),
      relation: (...args) => store.relation(...args), copies: (...args) => store.copies(...args), accepted: (...args) => store.accepted(...args),
      request: (...args) => store.request(...args), decided: (...args) => store.decided(...args), creation: (...args) => store.creation(...args),
      operation: (...args) => store.operation(...args), texts: (...args) => store.texts(...args), prepared: (...args) => store.prepared(...args),
      preparations: (...args) => store.preparations(...args), record: (...args) => store.record(...args), records: (...args) => store.records(...args),
      recordCount: (...args) => store.recordCount(...args), observed: (...args) => store.observed(...args), incarnations: (...args) => store.incarnations(...args),
      outstanding: () => store.outstanding(), holder: (...args) => store.holder(...args), holders: () => store.holders(),
      operationsFor: (...args) => store.operationsFor(...args), account: (...args) => store.account(...args), accountsOf: (...args) => store.accountsOf(...args),
      lookup: (...args) => store.lookup(...args), all: () => store.all(),
    };
    const outside = wiring.outside?.({
      ...made, state: outsideState,
      retained: (...args) => store.retained(...args),
      own: (seq) => {
        const kept = Number.isSafeInteger(seq) && seq >= 0 ? store.stored(seq) : null;
        return kept ? { entry: JSON.parse(kept.bytes) as Entry, hash: kept.hash } : null;
      },
    });
    const ports: Ports = { ...given, alarm: wakes.deadline, ...(authority ? { authority } : {}), ...(readers ? { readers } : {}), ...(outside ? { outside } : {}) };
    // The operator's record: two tables of this object's storage that are no part of the store, and that no judgment is given.
    const record = new OperatorRecord({ exec: (query, ...bindings) => ctx.storage.sql.exec(query, ...bindings) }, ports.clock, () => store.scope()?.at ?? null);
    this.#name = isScopeId(name) ? name : null;
    this.#store = store;
    this.#scope = new Scope(this.#name, store, ports, bounds);
    // A signed read is judged on this scope's clock, within the authority window of an intent (`signed-reads.ts`).
    // An entry that an entry of a cause chain names: one of this scope's own, one it retains, or one read from its own scope.
    this.#chains = new Chains(store, async (use) => {
      const own = use.fact.at.scope === this.#name ? store.stored(use.fact.seq) : null;
      const kept = own ?? store.retained("entry", use.content);
      const local = kept ? (JSON.parse(kept.bytes) as Entry) : null;
      if (local && isEntryOf(local, use.fact)) return local;
      const read = await within(() => ports.resolver.read(use.fact, bounds.fetchSeconds), bounds.fetchSeconds);
      return read !== LATE && read !== null && "entry" in read && isEntryOf(read.entry, use.fact) ? read.entry : null;
    });
    this.#reads = new Reads(store, () => this.#scope.pinned(), ports.readers, wiring.reads ?? READ_BOUNDS, record, { clock: ports.clock, window: bounds.intentLifetimeSeconds, chains: this.#chains });
    this.#deliveries = new Deliveries(this.#name, this.#scope, store, ports, bounds);
    this.#dispatcher = given.transport ? new Dispatcher(this.#scope, store, { transport: given.transport, clock: ports.clock, capabilities: ports.capabilities }, wakes, bounds) : null;
    this.#operations = new Operations(this.#scope, store, ports, wakes, bounds, (operation, attempt, seq) => { record.found("outcome-conflict", [{ operation, attempt }, { entry: seq }]); });
    this.#clock = ports.clock;
    this.#outside = ports.outside;
    this.#readers = ports.readers;
    this.#transport = given.transport;
    this.#seconds = bounds.dispatchSeconds;
    this.#record = record;
    this.#streams = new Streams(ports.readers, () => store.scope()?.head ?? null);
    // Every commit that seals an entry is followed at once, whoever asked for its turn: a pass in the background and a late answer
    // of an outside operation write their entries in no caller's request, and nothing guarantees an alarm after the last of them.
    this.#scope.turns.onSealed(() => this.#followed());
    this.#limits = new JoinLimits(wiring.limits);
    this.#sessions = wiring.sessions ?? (() => null);
    // The session requests that this scope has answered, each until its `notAfter`: one more table that is no part of the store.
    this.#requests = new SessionRequests({ exec: (query, ...bindings) => ctx.storage.sql.exec(query, ...bindings) });
  }

  /**
   * The ports, bounds and read bounds of the scope with this name. This
   * class gives every default: the production ports of `ports.ts`, with this
   * object's alarm, and the contract's proposed bounds. It is called once,
   * while the object is constructed.
   */
  protected wiring(_name: string | undefined): Wiring { return {}; }

  /**
   * After a call that may have committed: a dispatch pass that the caller
   * does not wait for. The commit set the alarm for the same sends, so a
   * pass that is cut short loses nothing. A pass that fails is left to the
   * alarm. An entry that either pass writes is followed when it is
   * committed (`Turns.onSealed`), and not from here.
   */
  #sent<A>(answer: A): A {
    this.#fresh = false;
    this.#followed();
    if (this.#dispatcher) this.ctx.waitUntil(this.#dispatcher.run().catch(() => 0));
    this.ctx.waitUntil(this.#operations.run().catch(() => 0));
    return answer;
  }

  /**
   * The first turn of this object's life, when that turn runs no pass of its own: one pass of the operations driver, which the
   * caller does not wait for, if an attempt is recorded and has no time to be looked at next (`Store.parked`). Such an attempt
   * asks for no wake-up (`operations.ts`, rule 7), so without this pass it waits for the next commit. So a deployment whose outside
   * port changed, as when the Git host's settings are added, and which is restarted, sends what it recorded and did not send, at
   * the first call that reaches the object. The pass sends nothing twice: an attempt marked sent is never sent again.
   */
  #first(): void {
    if (!this.#fresh) return;
    this.#fresh = false;
    if (this.#store.parked(null, 1).length > 0) this.ctx.waitUntil(this.#operations.run().catch(() => 0));
  }

  /**
   * What is no history follows the commits: the operator's record reads the entries that are new, from its own mark, and each open stream
   * is sent the head. Neither can change an answer: a failure of either is dropped here. It runs after every commit that seals an entry
   * (`Turns.onSealed`), so a stream that waits is sent the head of an entry that a pass in the background or a late answer wrote, with
   * no further call and no alarm. It also runs after each call and each alarm, which costs nothing when the head has not moved: a stream
   * is sent a head once, and the record reads from its mark. A stream's own rules are unchanged (`sessions.ts`, `Streams`): the session
   * is checked before every send, a reader that went away is sent nothing, one line waits unread at most, and the line is the latest head.
   */
  #followed(): void {
    try {
      this.#record.follow(this.#store);
      this.#streams.publish();
    } catch { /* a notice or a stream line was lost, and no fact */ }
  }

  async found(founding: SignedIntent, definition: DeclaredDefinition | Digest | PlatformDefinition, definitions: readonly DeclaredDefinition[] = [], beside: Beside = {}): Promise<Founded> { return this.#sent(await this.#scope.found(founding, definition, definitions, beside)); }
  /**
   * `address`: the caller's address as the Worker's route had it, or null. Only the serving limits of a join read it (`limits.ts`):
   * at a membership scope a join is served through them, and no other act and no other scope is.
   */
  async submit(signed: SignedIntent, grants: readonly Grant[], beside: Beside = {}, address: unknown = null): Promise<Answer> {
    const scope = this.#store.scope();
    const judged = () => this.#scope.submit(signed, grants, beside);
    if (scope?.at.kind !== "membership" || !isJoin(signed)) return this.#sent(await judged());
    return this.#sent(await this.#limits.serve({ address: typeof address === "string" ? address : null, now: timeMs(this.#clock.read()) ?? 0, head: scope.head }, signed, judged));
  }
  /** One step of a capability, asked for with the signed intent that it prepares for (section 5.5). */
  async prepare(signed: SignedIntent, grants: readonly Grant[], capability: string, step: string): Promise<Answer> { return this.#sent(await this.#scope.prepare(signed, grants, capability, step)); }
  settle(signed: SignedIntent): Settlement { this.#first(); return this.#scope.settle(signed); }
  checkpoint(): Promise<Checkpointed> { this.#first(); return this.#scope.checkpoint(); }

  /**
   * One delivery from another scope (section 7.4). The resolver of this
   * name answers first, from the scope's record alone: a refusal there
   * reached no judgment and recorded nothing.
   */
  async deliver(envelope: Delivered): Promise<Delivery> {
    const refusal = routed(this.#name, this.#store.scope(), envelope);
    if (refusal) return { answer: "routing", reason: refusal };
    return this.#sent(await this.#deliveries.deliver(envelope));
  }
  /** One entry of this scope, for a scope that received a send of it and checks its source (section 7.4). */
  source(seq: number): Sourced | null { this.#first(); return sourced(this.#store, this.#scope.pinned(), seq); }
  /** The bytes of one declaration this scope retains, for a child that is about to write its genesis (sections 7.2 and 9.2). */
  declared(digest: Digest): string | null { this.#first(); return declaredBy(this.#store, digest); }
  /** A detached text that a send of this scope's entry at `seq` names, for the scope that received that send (section 6.2). */
  text(seq: number, digest: Digest): string | null { this.#first(); return sentText(this.#store, seq, digest); }

  /**
   * The standing of one key or of one member, for a scope of this repository that reads it before its turn (authority note,
   * section 3.3). Only a membership scope that is active answers. Nothing is written, and no caller is named or checked.
   */
  observe(asked: unknown): unknown { this.#first(); return observedAt(this.#store, this.#scope.pinned(), asked); }

  /**
   * A read session, for a device that asks with a signed request (authority note, section 3.9). Only an active membership scope
   * answers one, from its head and its own clock. It is an answer and no entry: nothing is written.
   */
  session(asked: unknown): SessionAnswer { this.#first(); return issueSession({ sessions: this.#sessions(), clock: this.#clock, requests: this.#requests }, this.#store, this.#scope.pinned(), asked); }
  /** A stream of this scope's head, for a read session that may read the summary; or why none is opened (`sessions.ts`, `Streams`). */
  stream(reader: unknown): Opened | StreamRefusal { this.#first(); return this.#streams.open(reader); }
  /** The reader of the stream with that ID went away. Its subscription is released at once. */
  release(id: unknown): void { this.#streams.release(id); }
  /** The streams open now and the subscriptions released in this run, and the windows and waiting joins of the serving limits. Counts only. */
  serving(): { streams: { open: number; released: number }; limits: { windows: number; waiting: number } } { return { streams: this.#streams.counts(), limits: this.#limits.counts() }; }
  /**
   * The operator's instruction to send one waiting request again, by its duty ID (authority note, section 12, G17; `operator.ts`).
   * It has no route: who an operator is, and how one is authenticated, is the installation design's. It is reached over the
   * namespace binding, as `dispatch` is.
   */
  resend(duty: unknown): Promise<Resent> { this.#first(); return sendAgain(this.#store, this.#transport, this.#clock, this.#record, duty, this.#seconds); }

  /** A dispatch pass now, or the one in flight. Resolves when it ends, with the number of dispatches and diagnoses it made. */
  dispatch(): Promise<number> { this.#first(); return this.#dispatcher ? this.#dispatcher.run() : Promise.resolve(0); }
  /** A pass of the operations driver now, or the one in flight. Resolves when it ends, with the number of requests it sent and outcomes it offered. */
  effect(): Promise<number> { this.#fresh = false; return this.#operations.run(); }
  /** The alarm: a turn with no waiting input, at the earliest deadline (section 5.2), then a dispatch pass, then a pass of the operations driver. */
  override async alarm(): Promise<void> {
    this.#fresh = false;
    await this.#scope.alarm();
    await this.dispatch();
    await this.effect();
    this.#followed();
  }

  /**
   * Before a read that may be limited by the cause chain: a signed read, or a session at a register (`signed-reads.ts`, `Chains`).
   * The roots of the entries that are new are found and kept. A chain that cannot be read now is looked for again at the next such
   * read, and this one is judged without the roots from there on.
   */
  async #rooted(reader: unknown): Promise<void> {
    if (presentsSignedRead(reader) || (typeof reader === "string" && this.#store.scope()?.at.kind === "register")) await this.#chains.update();
  }

  async summary(reader: unknown): Promise<Read<Summary>> { this.#first(); await this.#rooted(reader); return this.#reads.summary(reader); }
  items(reader: unknown, type: string, cursor?: Cursor): Read<readonly Item[]> { this.#first(); return this.#reads.items(reader, type, cursor); }
  async history(reader: unknown, cursor?: Cursor): Promise<Read<readonly Sealed[]>> { this.#first(); await this.#rooted(reader); return this.#reads.history(reader, cursor); }
  async entry(reader: unknown, seq: number): Promise<Read<Sealed>> { this.#first(); await this.#rooted(reader); return this.#reads.entry(reader, seq); }
  outbox(reader: unknown, cursor?: Cursor): Read<readonly Duty[]> { this.#first(); return this.#reads.outbox(reader, cursor); }
  duty(reader: unknown, duty: DutyId): Read<Duty> { this.#first(); return this.#reads.duty(reader, duty); }
  operations(reader: unknown, cursor?: Cursor, open = false): Read<readonly OperationStatus[]> { this.#first(); return this.#reads.operations(reader, cursor, open); }
  operation(reader: unknown, operation: OperationId): Read<OperationStatus> { this.#first(); return this.#reads.operation(reader, operation); }
  async log(reader: unknown, cursor?: Cursor): Promise<Read<LogPage>> { this.#first(); await this.#rooted(reader); return this.#reads.log(reader, cursor); }
  async retained(reader: unknown, kind: RetainedInput["kind"], digest: Digest, domain?: string): Promise<Read<RetainedInput>> { this.#first(); await this.#rooted(reader); return this.#reads.retained(reader, kind, digest, domain); }
  incidents(reader: unknown, cursor?: Cursor): Read<readonly Incident[]> { this.#first(); return this.#reads.incidents(reader, cursor); }
  waiting(reader: unknown, list: "diagnosed" | "unanswered", cursor?: Cursor): Read<readonly Duty[]> { this.#first(); return this.#reads.waiting(reader, list, cursor); }

  /**
   * The one-time read of a member's read token at a destination, by its handle (the planner's decision for I5). Only a session
   * may read it, and only the session of the key that signed the `read-token` act whose `mint-read` minted it; the outside port
   * judges the rest, and drops the plaintext as it answers. A second read, another key's session, a read after the end, a
   * handle that names nothing and a scope that is no destination are each `forbidden`. Nothing is written.
   */
  credential(reader: unknown, handle: unknown): Read<{ token: string; ends: string; remote: string }> {
    this.#first();
    const key = this.#readers.holder?.(reader, "credential") ?? false;
    if (key === "sessions-unavailable" || key === "clock-behind") return { ok: false, reason: key };
    const scope = this.#store.scope();
    const answer = key !== false && typeof handle === "string" && scope?.at.kind === "destination" ? this.#outside.credential?.(handle, key) ?? null : null;
    return answer && scope ? { ok: true, at: scope.head, value: answer, complete: true } : { ok: false, reason: "forbidden" };
  }
}
