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
 * The operations driver runs at the same two moments (`operations.ts`). By
 * default nothing is sent outside the service: the outside port of
 * `production()` sends nothing, and there are no owner rules.
 */

import { DurableObject } from "cloudflare:workers";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { Answer, Beside, Bounds, Cursor, DeclaredDefinition, Digest, DutyId, Entry, Grant, Input, LogPage, OperationId, PlatformDefinition, Read, RetainedInput, ScopeId, Settlement, SignedIntent } from "@generalbusiness/artroom-contract";
import { isScopeId } from "@generalbusiness/artroom-bytes";
import { timeMs, type Item } from "@generalbusiness/artroom-derive";
import type { Delivered, StateView } from "@generalbusiness/artroom-derive";
import { Scope, type Checkpointed, type Founded } from "./core.ts";
import { Deliveries } from "./delivery.ts";
import { declaredBy, observedAt, routed, sentText, sourced, type Sourced } from "./namespace.ts";
import { Operations } from "./operations.ts";
import { Dispatcher, Wakes } from "./outbox.ts";
import { production, type Alarm, type Authority, type Delivery, type Ports } from "./ports.ts";
import { READ_BOUNDS, Reads, type ReadBounds, type Summary } from "./reads.ts";
import { SqliteStore } from "./sqlite.ts";
import type { Duty, OperationStatus, Sealed } from "./store.ts";

/**
 * What a deployment gives a scope in place of a default. `authority`: the
 * authority port, made once for the life of the object, which is one run
 * (authority note, section 3.3). It is made after the store, because a
 * scope reads its membership reference from its own genesis entry (the
 * contract's section 6.6). It is given the clock and the random source of
 * the ports as wired. With it, `ports.authority` is not used.
 */
export interface Wiring {
  ports?: Partial<Ports>; bounds?: Bounds; reads?: ReadBounds;
  authority?: (given: Pick<Ports, "clock" | "random"> & { genesis(): Extract<Input, { type: "genesis" }> | null; state: Pick<StateView, "page"> }) => Authority;
}

export class ScopeObject<Env = unknown> extends DurableObject<Env> {
  readonly #name: ScopeId | null;
  readonly #store: SqliteStore;
  readonly #scope: Scope;
  readonly #reads: Reads;
  readonly #deliveries: Deliveries;
  readonly #dispatcher: Dispatcher | null;
  readonly #operations: Operations;

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
    const authority = wiring.authority?.({ clock: given.clock, random: given.random, genesis, state: store });
    const ports: Ports = { ...given, alarm: wakes.deadline, ...(authority ? { authority } : {}) };
    this.#name = isScopeId(name) ? name : null;
    this.#store = store;
    this.#scope = new Scope(this.#name, store, ports, bounds);
    this.#reads = new Reads(store, () => this.#scope.pinned(), ports.readers, wiring.reads ?? READ_BOUNDS);
    this.#deliveries = new Deliveries(this.#name, this.#scope, store, ports, bounds);
    this.#dispatcher = given.transport ? new Dispatcher(this.#scope, store, { transport: given.transport, clock: ports.clock, capabilities: ports.capabilities }, wakes, bounds) : null;
    this.#operations = new Operations(this.#scope, store, ports, wakes, bounds);
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
   * alarm.
   */
  #sent<A>(answer: A): A {
    if (this.#dispatcher) this.ctx.waitUntil(this.#dispatcher.run().catch(() => 0));
    this.ctx.waitUntil(this.#operations.run().catch(() => 0));
    return answer;
  }

  async found(founding: SignedIntent, definition: DeclaredDefinition | Digest | PlatformDefinition, definitions: readonly DeclaredDefinition[] = [], beside: Beside = {}): Promise<Founded> { return this.#sent(await this.#scope.found(founding, definition, definitions, beside)); }
  async submit(signed: SignedIntent, grants: readonly Grant[], beside: Beside = {}): Promise<Answer> { return this.#sent(await this.#scope.submit(signed, grants, beside)); }
  /** One step of a capability, asked for with the signed intent that it prepares for (section 5.5). */
  async prepare(signed: SignedIntent, grants: readonly Grant[], capability: string, step: string): Promise<Answer> { return this.#sent(await this.#scope.prepare(signed, grants, capability, step)); }
  settle(signed: SignedIntent): Settlement { return this.#scope.settle(signed); }
  checkpoint(): Promise<Checkpointed> { return this.#scope.checkpoint(); }

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
  source(seq: number): Sourced | null { return sourced(this.#store, this.#scope.pinned(), seq); }
  /** The bytes of one declaration this scope retains, for a child that is about to write its genesis (sections 7.2 and 9.2). */
  declared(digest: Digest): string | null { return declaredBy(this.#store, digest); }
  /** A detached text that a send of this scope's entry at `seq` names, for the scope that received that send (section 6.2). */
  text(seq: number, digest: Digest): string | null { return sentText(this.#store, seq, digest); }

  /**
   * The standing of one key or of one member, for a scope of this repository that reads it before its turn (authority note,
   * section 3.3). Only a membership scope that is active answers. Nothing is written, and no caller is named or checked.
   */
  observe(asked: unknown): unknown { return observedAt(this.#store, this.#scope.pinned(), asked); }

  /** A dispatch pass now, or the one in flight. Resolves when it ends, with the number of dispatches and diagnoses it made. */
  dispatch(): Promise<number> { return this.#dispatcher ? this.#dispatcher.run() : Promise.resolve(0); }
  /** A pass of the operations driver now, or the one in flight. Resolves when it ends, with the number of requests it sent and outcomes it offered. */
  effect(): Promise<number> { return this.#operations.run(); }
  /** The alarm: a turn with no waiting input, at the earliest deadline (section 5.2), then a dispatch pass, then a pass of the operations driver. */
  override async alarm(): Promise<void> {
    await this.#scope.alarm();
    await this.dispatch();
    await this.effect();
  }

  summary(reader: unknown): Read<Summary> { return this.#reads.summary(reader); }
  items(reader: unknown, type: string, cursor?: Cursor): Read<readonly Item[]> { return this.#reads.items(reader, type, cursor); }
  history(reader: unknown, cursor?: Cursor): Read<readonly Sealed[]> { return this.#reads.history(reader, cursor); }
  entry(reader: unknown, seq: number): Read<Sealed> { return this.#reads.entry(reader, seq); }
  outbox(reader: unknown, cursor?: Cursor): Read<readonly Duty[]> { return this.#reads.outbox(reader, cursor); }
  duty(reader: unknown, duty: DutyId): Read<Duty> { return this.#reads.duty(reader, duty); }
  operations(reader: unknown, cursor?: Cursor, open = false): Read<readonly OperationStatus[]> { return this.#reads.operations(reader, cursor, open); }
  operation(reader: unknown, operation: OperationId): Read<OperationStatus> { return this.#reads.operation(reader, operation); }
  log(reader: unknown, cursor?: Cursor): Read<LogPage> { return this.#reads.log(reader, cursor); }
  retained(reader: unknown, kind: RetainedInput["kind"], digest: Digest): Read<RetainedInput> { return this.#reads.retained(reader, kind, digest); }
}
