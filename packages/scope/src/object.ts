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
 */

import { DurableObject } from "cloudflare:workers";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { Answer, Beside, Bounds, Cursor, DeclaredDefinition, Digest, DutyId, Grant, LogPage, PlatformDefinition, Read, RetainedInput, ScopeId, Settlement, SignedIntent } from "@generalbusiness/artroom-contract";
import { isScopeId } from "@generalbusiness/artroom-bytes";
import { timeMs, type Item } from "@generalbusiness/artroom-derive";
import type { Delivered } from "@generalbusiness/artroom-derive";
import { Scope, type Checkpointed, type Founded } from "./core.ts";
import { Deliveries } from "./delivery.ts";
import { declaredBy, routed, sentText, sourced, type Sourced } from "./namespace.ts";
import { Dispatcher, Wakes } from "./outbox.ts";
import { production, type Alarm, type Delivery, type Ports } from "./ports.ts";
import { READ_BOUNDS, Reads, type ReadBounds, type Summary } from "./reads.ts";
import { SqliteStore } from "./sqlite.ts";
import type { Duty, Sealed } from "./store.ts";

/** What a deployment gives a scope in place of a default. */
export interface Wiring { ports?: Partial<Ports>; bounds?: Bounds; reads?: ReadBounds }

export class ScopeObject<Env = unknown> extends DurableObject<Env> {
  readonly #name: ScopeId | null;
  readonly #store: SqliteStore;
  readonly #scope: Scope;
  readonly #reads: Reads;
  readonly #deliveries: Deliveries;
  readonly #dispatcher: Dispatcher | null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const name = ctx.id.name;
    const wiring = this.wiring(name);
    const bounds = wiring.bounds ?? PROPOSED_BOUNDS;
    const store = new SqliteStore({
      exec: (query, ...bindings) => ctx.storage.sql.exec(query, ...bindings),
      transaction: (closure) => ctx.storage.transactionSync(closure),
    });
    // This object's one alarm. Its handler below starts the alarm's turn and a dispatch pass.
    const alarm: Alarm = { set: (at) => (at === null ? ctx.storage.deleteAlarm() : ctx.storage.setAlarm(timeMs(at)!)) };
    const given: Ports = { ...production(), alarm, ...wiring.ports };
    // With a transport, the one alarm serves the earliest deadline and the next dispatch. Without one it serves the deadline alone.
    const wakes = given.transport ? new Wakes(store, given.alarm) : null;
    const ports: Ports = wakes ? { ...given, alarm: wakes.deadline } : given;
    this.#name = isScopeId(name) ? name : null;
    this.#store = store;
    this.#scope = new Scope(this.#name, store, ports, bounds);
    this.#reads = new Reads(store, () => this.#scope.pinned(), ports.readers, wiring.reads ?? READ_BOUNDS);
    this.#deliveries = new Deliveries(this.#name, this.#scope, store, ports, bounds);
    this.#dispatcher = wakes && given.transport ? new Dispatcher(this.#scope, store, { transport: given.transport, clock: ports.clock, capabilities: ports.capabilities }, wakes, bounds) : null;
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
    return answer;
  }

  async found(founding: SignedIntent, definition: DeclaredDefinition | Digest | PlatformDefinition, definitions: readonly DeclaredDefinition[] = [], beside: Beside = {}): Promise<Founded> { return this.#sent(await this.#scope.found(founding, definition, definitions, beside)); }
  async submit(signed: SignedIntent, grants: readonly Grant[], beside: Beside = {}): Promise<Answer> { return this.#sent(await this.#scope.submit(signed, grants, beside)); }
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

  /** A dispatch pass now, or the one in flight. Resolves when it ends, with the number of dispatches and diagnoses it made. */
  dispatch(): Promise<number> { return this.#dispatcher ? this.#dispatcher.run() : Promise.resolve(0); }
  /** The alarm: a turn with no waiting input, at the earliest deadline (section 5.2), and then a dispatch pass. */
  override async alarm(): Promise<void> {
    await this.#scope.alarm();
    await this.dispatch();
  }

  summary(reader: unknown): Read<Summary> { return this.#reads.summary(reader); }
  items(reader: unknown, type: string, cursor?: Cursor): Read<readonly Item[]> { return this.#reads.items(reader, type, cursor); }
  history(reader: unknown, cursor?: Cursor): Read<readonly Sealed[]> { return this.#reads.history(reader, cursor); }
  entry(reader: unknown, seq: number): Read<Sealed> { return this.#reads.entry(reader, seq); }
  outbox(reader: unknown, cursor?: Cursor): Read<readonly Duty[]> { return this.#reads.outbox(reader, cursor); }
  duty(reader: unknown, duty: DutyId): Read<Duty> { return this.#reads.duty(reader, duty); }
  log(reader: unknown, cursor?: Cursor): Read<LogPage> { return this.#reads.log(reader, cursor); }
  retained(reader: unknown, kind: RetainedInput["kind"], digest: Digest): Read<RetainedInput> { return this.#reads.retained(reader, kind, digest); }
}
