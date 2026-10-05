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
import { platform, type EntryRules, type Platform, type PlatformRule } from "@generalbusiness/artroom-platform";
import type { Authority, Clock, Definitions, Ports, Readers, Resolver, Rules, Transport } from "./ports.ts";
import { production } from "./ports.ts";
import { READ_BOUNDS, type ReadBounds } from "./reads.ts";

/**
 * A test authority: a stand-in for the authority port, over its two phases.
 * Its read phase reads no membership scope. It keeps the grants that were
 * presented beside the intent, and its commit phase calls each of them
 * current. So it proves nothing about real authority, an observation or a
 * window: a test that uses it shows what a scope does once a grant is held.
 *
 * `answers` is read at each read. While it gives false, the read gives
 * nothing, as when membership does not answer.
 */
export function testAuthority(answers: () => boolean = () => true): Authority {
  return { read: (asked) => Promise.resolve(answers() ? { held: () => asked.grants.map((grant) => ({ grant, current: true })) } : null) };
}

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
 * effect from the table that the test supplies. The port also gives a rule
 * the folded state and the input, and this stand-in reads neither: no
 * record, no hold, no Git repository and no provider. So it proves nothing about
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

/**
 * A stand-in for a platform rule: it adds nothing to its entry. It is not
 * the rule of any row, and no judge runs it. It shows only what a scope
 * does once every row that is code has a rule supplied.
 */
const STAND_IN_RULE: PlatformRule = () => ({ result: "applied", effects: [], sends: [] });

/**
 * A stand-in for the platform package's table of rules: the platform
 * definition of that name as the package supplies it, with `STAND_IN_RULE`
 * for every row that the package marks as code. So it proves nothing about
 * the real rule of any row, such as P22 of the inbox, which a later step
 * writes.
 */
export function standInPlatform(named: string): Platform | null {
  const supplied = platform(named);
  if (!supplied) return null;
  const rules = Object.fromEntries(Object.entries(supplied.code).map(([entry, rows]): [string, EntryRules] => [entry, Object.fromEntries(rows.map((row) => [row, STAND_IN_RULE]))]));
  return { ...supplied, rules };
}

/** A scripted clock. Each reading is the next of `script`, or `now` when the script is empty. */
export class ScriptedClock implements Clock {
  readonly script: Timestamp[] = [];
  constructor(public now: Timestamp) {}
  read(): Timestamp { return this.script.shift() ?? this.now; }
}

/**
 * Pauses preparation (section 5.2, step 5). After `hold()`, the next rule
 * evaluation waits at the gate until `release()`; later ones pass. `held()`
 * resolves when an evaluation is waiting there. Each is a promise the other
 * side resolves: nothing here polls or waits on a timer.
 */
export class Gate {
  #armed = false;
  #waiting = false;
  /** Resolvers of the `held()` calls that wait for an evaluation to arrive, and of the evaluation that waits to be released. */
  #arrivals: (() => void)[] = [];
  #releases: (() => void)[] = [];
  hold(): void { this.#armed = true; }
  release(): void {
    this.#waiting = false;
    for (const resume of this.#releases.splice(0)) resume();
  }
  async held(): Promise<void> {
    if (!this.#waiting) await new Promise<void>((resolve) => { this.#arrivals.push(resolve); });
  }
  async pass(): Promise<void> {
    if (!this.#armed) return;
    this.#armed = false;
    this.#waiting = true;
    for (const arrived of this.#arrivals.splice(0)) arrived();
    await new Promise<void>((resolve) => { this.#releases.push(resolve); });
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
  /** False: the read of the test authority, a stand-in, gives nothing, as when membership does not answer. */
  authority: boolean;
  /** True: a platform definition is supplied with the stand-in rules of `standInPlatform`. False: as the platform package supplies it, as in production. */
  platformRules: boolean;
}

const all = new Map<string, Controls>();

/** The controls of the scope with that name, made on first use with a clock at `start`. They outlive a restart of the object. */
export function controls(name: string, start: Timestamp = "2099-01-01T00:00:00Z"): Controls {
  let made = all.get(name);
  if (!made) all.set(name, (made = { clock: new ScriptedClock(start), gate: new Gate(), foreign: new Map(), bounds: PROPOSED_BOUNDS, reads: READ_BOUNDS, capability: null, authority: true, platformRules: false }));
  return made;
}

/**
 * Test ports over those controls: the test authority, a stand-in that the
 * controls can silence, the test readers, the
 * scripted clock, a resolver that reads from `foreign`, derive's rule
 * evaluator behind the gate, and the scripted test capability over the
 * controls' table, which is none until a test sets one. The platform
 * definitions are the platform package's, as in production, until a test
 * asks for the stand-in rules. The random source and the alarm stay the
 * runtime's and the object's.
 */
export function testPorts(c: Controls): Partial<Ports> {
  const { rules, definitions: given } = production();
  const definitions: Definitions = { read: given.read, platform: (named) => (c.platformRules ? standInPlatform(named) : given.platform(named)) };
  const resolver: Resolver = { read: (fact) => Promise.resolve(c.foreign.get(fact.hash) ?? null) };
  const gated: Rules = { evaluate: async (asked) => { await c.gate.pass(); return rules.evaluate(asked); } };
  return { clock: c.clock, authority: testAuthority(() => c.authority), readers: testReaders, resolver, rules: gated, definitions, capabilities: scriptedCapability(() => c.capability) };
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
  /** The bounds of one scope, by the name of its object, in place of `bounds`. They are read once, when the object is constructed. */
  sized: Map<string, Bounds>;
  hold: ((envelope: Delivered) => boolean) | null;
  deaf: ((envelope: Delivered) => boolean) | null;
  /** The table of the scripted test capability, a stand-in, for every scope of the namespace. Null: no capability, as in production. */
  capability: CapabilityScript | null;
  /**
   * The entries of scripted platform peers, by the hash of the fact that
   * names each, with the name of the definition that the peer is said to
   * pin. A scripted peer is a stand-in for a scope of a platform kind that
   * is not delivered, such as a rules scope or a destination. Its entries
   * are written by the test, and nothing judged them. A scope of the
   * namespace reads one as it reads any source entry, so a test that uses
   * one shows the receiver's side of a delivery and nothing about the peer.
   */
  peers: Map<Digest, { entry: Entry; under: string }>;
}

export const net: Net = { clock: new ScriptedClock("2099-01-01T00:00:00Z"), bounds: PROPOSED_BOUNDS, sized: new Map(), hold: null, deaf: null, capability: null, peers: new Map() };

/**
 * Test ports for a scope in that namespace: the test authority and readers,
 * the shared clock, the given transport behind `hold` and `deaf`, and the
 * scripted test capability over the namespace's table, which is none until
 * a test sets one. The definitions port is not replaced: a child's
 * declaration is read from the real object. Given the namespace's
 * `resolver`, an entry of a scripted peer is read from `peers`, and every
 * other source entry from the real object.
 */
export function netPorts(n: Net, transport: Transport, resolver?: Resolver): Partial<Ports> {
  const disturbed: Transport = {
    async send(envelope) {
      if (n.hold?.(envelope)) return null;
      const answer = await transport.send(envelope);
      if (!n.deaf?.(envelope)) return answer;
      n.deaf = null;
      return null;
    },
  };
  const scripted: Partial<Ports> = resolver ? { resolver: { read: (fact, seconds) => { const peer = n.peers.get(fact.hash); return peer ? Promise.resolve(peer) : resolver.read(fact, seconds); } } } : {};
  return { clock: n.clock, authority: testAuthority(), readers: testReaders, transport: disturbed, capabilities: scriptedCapability(() => n.capability), ...scripted };
}
