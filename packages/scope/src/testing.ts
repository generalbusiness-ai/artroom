/**
 * For tests only. Nothing here is exported from the package's main entry,
 * and `object.ts` does not import it. A test worker's object class returns
 * these from `wiring`.
 *
 * A test and the object it drives run in one isolate, so a test steers an
 * object through the `Controls` it shares with it by name. The gate is a
 * flag that the object polls: a promise that one request resolves for
 * another does not wake a Durable Object reliably.
 */

import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { Bounds, Digest, Entry, Timestamp } from "@generalbusiness/artroom-contract";
import type { Authority, Clock, Ports, Readers, Resolver, Rules } from "./ports.ts";
import { production } from "./ports.ts";
import { READ_BOUNDS, type ReadBounds } from "./reads.ts";

/** A test authority: every presented grant is current. It proves nothing about real authority. */
export const testAuthority: Authority = { current: () => true };

/** A test reader port: every reader may read everything. */
export const testReaders: Readers = { allows: () => true };

/** A scripted clock. Each reading is the next of `script`, or `now` when the script is empty. */
export class ScriptedClock implements Clock {
  readonly script: Timestamp[] = [];
  constructor(public now: Timestamp) {}
  read(): Timestamp { return this.script.shift() ?? this.now; }
}

const tick = () => new Promise<void>((resolve) => { setTimeout(resolve, 1); });

/**
 * Pauses preparation (section 5.2, step 5). After `hold()`, the next rule
 * evaluation waits at the gate until `release()`; later ones pass. `held()`
 * resolves when an evaluation is waiting there.
 */
export class Gate {
  #armed = false;
  #waiting = false;
  hold(): void { this.#armed = true; }
  release(): void { this.#waiting = false; }
  async held(): Promise<void> { while (!this.#waiting) await tick(); }
  async pass(): Promise<void> {
    if (!this.#armed) return;
    this.#armed = false;
    this.#waiting = true;
    while (this.#waiting) await tick();
  }
}

/** What a test holds of one scope: its clock, its gate, the foreign entries its resolver can read, and its bounds. */
export interface Controls {
  clock: ScriptedClock;
  gate: Gate;
  /** By the hash of the fact that names it. */
  foreign: Map<Digest, { entry: Entry; under: string }>;
  bounds: Bounds;
  reads: ReadBounds;
}

const all = new Map<string, Controls>();

/** The controls of the scope with that name, made on first use with a clock at `start`. They outlive a restart of the object. */
export function controls(name: string, start: Timestamp = "2099-01-01T00:00:00Z"): Controls {
  let made = all.get(name);
  if (!made) all.set(name, (made = { clock: new ScriptedClock(start), gate: new Gate(), foreign: new Map(), bounds: PROPOSED_BOUNDS, reads: READ_BOUNDS }));
  return made;
}

/**
 * Test ports over those controls: the test authority and readers, the
 * scripted clock, a resolver that reads from `foreign`, and derive's rule
 * evaluator behind the gate. The random source and the alarm stay the
 * runtime's and the object's.
 */
export function testPorts(c: Controls): Partial<Ports> {
  const { rules } = production();
  const resolver: Resolver = { read: (fact) => Promise.resolve(c.foreign.get(fact.hash) ?? null) };
  const gated: Rules = { evaluate: async (asked) => { await c.gate.pass(); return rules.evaluate(asked); } };
  return { clock: c.clock, authority: testAuthority, readers: testReaders, resolver, rules: gated };
}
