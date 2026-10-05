/**
 * One scope as one Durable Object (scope contract, section 2.3): the object
 * named by the scope's ID in the one scope namespace, with SQLite storage.
 * This file only wires: the store over the object's storage, the ports, the
 * core and the reads. Its public methods are the scope's surface over RPC.
 * It has no HTTP route.
 *
 * At genesis the scope checks that the digest of its seed equals this
 * object's name. An object that was not reached by a name has none, and
 * can be founded as nothing.
 */

import { DurableObject } from "cloudflare:workers";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { Answer, Bounds, Cursor, DeclaredDefinition, Digest, Grant, PlatformDefinition, Read, Settlement, SignedIntent } from "@generalbusiness/artroom-contract";
import { isScopeId } from "@generalbusiness/artroom-bytes";
import { timeMs, type Item } from "@generalbusiness/artroom-derive";
import { Scope, type Checkpointed, type Founded } from "./core.ts";
import { production, type Ports } from "./ports.ts";
import { READ_BOUNDS, Reads, type ReadBounds, type Summary } from "./reads.ts";
import { SqliteStore } from "./sqlite.ts";
import type { Duty, Sealed } from "./store.ts";

/** What a deployment gives a scope in place of a default. */
export interface Wiring { ports?: Partial<Ports>; bounds?: Bounds; reads?: ReadBounds }

export class ScopeObject<Env = unknown> extends DurableObject<Env> {
  readonly #scope: Scope;
  readonly #reads: Reads;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const name = ctx.id.name;
    const wiring = this.wiring(name);
    const store = new SqliteStore({
      exec: (query, ...bindings) => ctx.storage.sql.exec(query, ...bindings),
      transaction: (closure) => ctx.storage.transactionSync(closure),
    });
    const ports: Ports = {
      ...production(),
      // The earliest deadline is this object's alarm. Its handler below starts the alarm's turn.
      alarm: { set: (at) => (at === null ? ctx.storage.deleteAlarm() : ctx.storage.setAlarm(timeMs(at)!)) },
      ...wiring.ports,
    };
    this.#scope = new Scope(isScopeId(name) ? name : null, store, ports, wiring.bounds ?? PROPOSED_BOUNDS);
    this.#reads = new Reads(store, () => this.#scope.pinned(), ports.readers, wiring.reads ?? READ_BOUNDS);
  }

  /**
   * The ports, bounds and read bounds of the scope with this name. This
   * class gives every default: the production ports of `ports.ts`, with this
   * object's alarm, and the contract's proposed bounds. It is called once,
   * while the object is constructed.
   */
  protected wiring(_name: string | undefined): Wiring { return {}; }

  found(founding: SignedIntent, definition: DeclaredDefinition | Digest | PlatformDefinition): Promise<Founded> { return this.#scope.found(founding, definition); }
  submit(signed: SignedIntent, grants: readonly Grant[]): Promise<Answer> { return this.#scope.submit(signed, grants); }
  settle(signed: SignedIntent): Settlement { return this.#scope.settle(signed); }
  checkpoint(): Promise<Checkpointed> { return this.#scope.checkpoint(); }
  /** The alarm at the earliest deadline: a turn with no waiting input (section 5.2). */
  override alarm(): Promise<void> { return this.#scope.alarm(); }

  summary(reader: unknown): Read<Summary> { return this.#reads.summary(reader); }
  items(reader: unknown, type: string, cursor?: Cursor): Read<readonly Item[]> { return this.#reads.items(reader, type, cursor); }
  history(reader: unknown, cursor?: Cursor): Read<readonly Sealed[]> { return this.#reads.history(reader, cursor); }
  entry(reader: unknown, seq: number): Read<Sealed> { return this.#reads.entry(reader, seq); }
  outbox(reader: unknown, cursor?: Cursor): Read<readonly Duty[]> { return this.#reads.outbox(reader, cursor); }
}
