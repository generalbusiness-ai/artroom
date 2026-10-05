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

import { CAPABILITIES, PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { Bounds, Capability, CapabilityName, Digest, Entry, Timestamp } from "@generalbusiness/artroom-contract";
import type { Capabilities, Delivered, Recorded } from "@generalbusiness/artroom-derive";
import type { Authority, Clock, Ports, Readers, Resolver, Rules, Transport } from "./ports.ts";
import { production } from "./ports.ts";
import { READ_BOUNDS, type ReadBounds } from "./reads.ts";

/** A test authority: every presented grant is current. It proves nothing about real authority. */
export const testAuthority: Authority = { current: () => true };

/** A test reader port: every reader may read everything. */
export const testReaders: Readers = { allows: () => true };

/**
 * What a scripted test capability answers, as the test supplies it. Each
 * key is a capability version, a colon, and the name of one of its guards
 * or effects, as in `hold@1:staged`. A guard answers true, or the name of a
 * refusal that its version declares. An effect answers the records it
 * changes.
 */
export interface CapabilityScript {
  guards?: Record<string, (args: Readonly<Record<string, unknown>>) => true | string>;
  effects?: Record<string, (args: Readonly<Record<string, unknown>>) => readonly Recorded[]>;
}

/**
 * A scripted test capability: a stand-in for the code of `hold@1` and
 * `git-read@1`, which is not delivered. It answers every guard and every
 * effect from the table that the test supplies, and reads no record, no
 * hold, no Git repository and no provider. So it proves nothing about
 * staging, ancestry, pins, licenses or exports: a test that uses it shows
 * only what a definition does once a capability has answered.
 *
 * `script` is read at every call. While it gives null there is no
 * capability, as in production. With a table, a guard that the table does
 * not script is refused with the first refusal its version declares, and an
 * effect that it does not script changes no record.
 */
export function scriptedCapability(script: () => CapabilityScript | null): Capabilities {
  return {
    implements: () => script() !== null,
    guard: (capability: CapabilityName, guard, args) =>
      script()?.guards?.[`${capability}:${guard}`]?.(args) ?? (CAPABILITIES as Record<string, Capability>)[capability]!.guards[guard]!.refusals[0]!,
    effect: (capability, effect, args) => script()?.effects?.[`${capability}:${effect}`]?.(args) ?? [],
  };
}

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
  /** The table of the scripted test capability, a stand-in. Null: no capability, as in production. */
  capability: CapabilityScript | null;
}

const all = new Map<string, Controls>();

/** The controls of the scope with that name, made on first use with a clock at `start`. They outlive a restart of the object. */
export function controls(name: string, start: Timestamp = "2099-01-01T00:00:00Z"): Controls {
  let made = all.get(name);
  if (!made) all.set(name, (made = { clock: new ScriptedClock(start), gate: new Gate(), foreign: new Map(), bounds: PROPOSED_BOUNDS, reads: READ_BOUNDS, capability: null }));
  return made;
}

/**
 * Test ports over those controls: the test authority and readers, the
 * scripted clock, a resolver that reads from `foreign`, derive's rule
 * evaluator behind the gate, and the scripted test capability over the
 * controls' table, which is none until a test sets one. The random source
 * and the alarm stay the runtime's and the object's.
 */
export function testPorts(c: Controls): Partial<Ports> {
  const { rules } = production();
  const resolver: Resolver = { read: (fact) => Promise.resolve(c.foreign.get(fact.hash) ?? null) };
  const gated: Rules = { evaluate: async (asked) => { await c.gate.pass(); return rules.evaluate(asked); } };
  return { clock: c.clock, authority: testAuthority, readers: testReaders, resolver, rules: gated, capabilities: scriptedCapability(() => c.capability) };
}

// ---------------------------------------------------------------- several scopes in one namespace

/**
 * What a test holds of the scopes of one namespace: one clock for all of
 * them, and two ways to disturb transport. `hold`: a send it matches is not delivered, and its
 * attempt gets no answer. `deaf`: the next send it matches is delivered, and
 * the answer is lost.
 */
export interface Net {
  clock: ScriptedClock;
  bounds: Bounds;
  hold: ((envelope: Delivered) => boolean) | null;
  deaf: ((envelope: Delivered) => boolean) | null;
  /** The table of the scripted test capability, a stand-in, for every scope of the namespace. Null: no capability, as in production. */
  capability: CapabilityScript | null;
}

export const net: Net = { clock: new ScriptedClock("2099-01-01T00:00:00Z"), bounds: PROPOSED_BOUNDS, hold: null, deaf: null, capability: null };

/**
 * Test ports for a scope in that namespace: the test authority and readers,
 * the shared clock, the given transport behind `hold` and `deaf`, and the
 * scripted test capability over the namespace's table, which is none until
 * a test sets one. The resolver and the definitions port are not replaced:
 * a source entry, and a child's declaration, are read from the real object.
 */
export function netPorts(n: Net, transport: Transport): Partial<Ports> {
  const disturbed: Transport = {
    async send(envelope) {
      if (n.hold?.(envelope)) return null;
      const answer = await transport.send(envelope);
      if (!n.deaf?.(envelope)) return answer;
      n.deaf = null;
      return null;
    },
  };
  return { clock: n.clock, authority: testAuthority, readers: testReaders, transport: disturbed, capabilities: scriptedCapability(() => n.capability) };
}
