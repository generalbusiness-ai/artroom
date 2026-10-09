/** Test-only ownership for the clone and Page claim fixtures. No native cancellation. */
import { onTestFinished } from "vitest";
import { timeMs, timeOf } from "@generalbusiness/artroom-bytes";
import type { Digest, ScopeId } from "@generalbusiness/artroom-contract";
import { net } from "../../src/testing.ts";
import type { SessionOwner } from "../session-settings.ts";
import { Platform } from "../repository.ts";
import { wired } from "../outside.ts";
import { platformOutside } from "../worker.ts";

type PortFactory = NonNullable<ReturnType<typeof wired.get>>;
type OutsideFactory = NonNullable<ReturnType<typeof platformOutside.get>>;
const retired = new WeakSet<object>();
const predecessors = new WeakMap<object, object | null>();
/** A nested owner can finish after its parent: skip retired tokens to the
 * first still-owned predecessor, rather than restoring a retired parent. */
const previousLive = <V extends object>(value: V | undefined | null): V | null => {
  let previous: object | null = value ?? null;
  while (previous && retired.has(previous)) previous = predecessors.get(previous) ?? null;
  return previous as V | null;
};
function resources<K, V extends object>(map: Map<K, V>) {
  const installed = new Map<K, { previous: V | undefined; value: V }>();
  return {
    set(key: K, value: V): void {
      const prior = installed.get(key);
      if (prior) retired.add(prior.value);
      const previous = prior ? prior.previous : map.get(key);
      predecessors.set(value, previous ?? null);
      installed.set(key, { previous, value });
      map.set(key, value);
    },
    remove(key: K): void {
      const record = installed.get(key);
      if (!record) return;
      retired.add(record.value);
      if (map.get(key) === record.value) {
        const previous = previousLive(record.previous);
        if (previous) map.set(key, previous);
        else map.delete(key);
      }
      installed.delete(key);
    },
    release(): void {
      for (const [key, record] of installed) {
        retired.add(record.value);
        if (map.get(key) !== record.value) continue;
        const previous = previousLive(record.previous);
        if (previous) map.set(key, previous);
        else map.delete(key);
      }
    },
  };
}

/** Existing callers require real-session leases. Explicit older inspector
 * phases preserve their mode-off settings rather than acquiring one. */
export function nativeFixtureLifetime(owner: SessionOwner, options: { required?: false } = {}) {
  const clock = net.clock;
  const before = { hold: net.hold, deaf: net.deaf };
  let hold: NonNullable<typeof net.hold> = () => false;
  const deaf: NonNullable<typeof net.deaf> = () => false;
  let released = false;
  const ports = resources(wired), outsides = resources(platformOutside), peers = resources(net.peers);
  const cleanups = new Set<() => void>();
  net.hold = hold; net.deaf = deaf;
  predecessors.set(hold, before.hold); predecessors.set(deaf, before.deaf);
  const intact = () => {
    if (released || net.clock !== clock || net.hold !== hold || net.deaf !== deaf) throw new Error("Native fixture resources ended before the continuation completed.");
  };
  const activeFor = (actor: SessionOwner) => {
    actor.active();
    if (!actor.belongsTo(owner)) throw new Error("Native fixture resources belong to another session owner.");
    intact();
  };
  const active = () => activeFor(owner);
  const waitFor = async <T>(actor: SessionOwner, action: () => Promise<T>): Promise<T> => {
    activeFor(actor);
    const value = await (options.required === false ? action() : actor.required(action));
    // required permits a still-live explicit descendant on completion. Do not
    // replace that check with exact-current active; a new action still needs it.
    if (!actor.belongsTo(owner) || !actor.ownsCurrentFrame()) throw new Error("Native fixture session ownership ended during its continuation.");
    intact();
    return value;
  };
  const wait = <T>(action: () => Promise<T>): Promise<T> => waitFor(owner, action);
  const release = () => {
    if (released) return;
    released = true;
    owner.close();
    let cleanupFailed = false;
    try {
      for (const cleanup of cleanups) {
        try { cleanup(); } catch { cleanupFailed = true; }
      }
    } finally {
      cleanups.clear();
      retired.add(hold); retired.add(deaf);
      if (net.hold === hold) net.hold = previousLive(before.hold);
      if (net.deaf === deaf) net.deaf = previousLive(before.deaf);
      ports.release(); outsides.release(); peers.release();
    }
    // Every gate and provider is released even if one cleanup failed. Do not
    // expose arbitrary cleanup errors, which may contain private fixture data.
    if (cleanupFailed) throw new Error("Native fixture cleanup failed after releasing all owned resources.");
    // Same clock persists, including any legitimate advances. No physical drain.
  };
  onTestFinished(release);
  class OwnedPlatform extends Platform {
    override get stub() {
      active();
      const source = super.stub;
      return new Proxy(source, { get(target, key) {
        active();
        const value: unknown = Reflect.get(target, key, target);
        return typeof value === "function" ? (...args: unknown[]) => wait(() => Promise.resolve(Reflect.apply(value, target, args))) : value;
      } });
    }
    override at(): ReturnType<Platform["at"]> { return wait(() => super.at()); }
    override intent(...args: Parameters<Platform["intent"]>): ReturnType<Platform["intent"]> { return wait(() => super.intent(...args)); }
    override restart(): Promise<void> { return wait(() => super.restart()); }
    override async created(seq: number, n = 0): Promise<Platform> { const made = await super.created(seq, n); active(); return new OwnedPlatform(made.name); }
  }
  return {
    owner, active, activeFor, wait, waitFor, release,
    /** Cleanup can retire resources without starting an RPC under a successor. */
    current(): boolean { return !released && owner.isCurrent() && net.clock === clock && net.hold === hold && net.deaf === deaf; },
    unWire: (name: string): void => { active(); ports.remove(name); },
    unOutside: (name: string): void => { active(); outsides.remove(name); },
    platform: (name: ScopeId): Platform => { active(); return new OwnedPlatform(name); },
    cleanup(run: () => void): void { if (released) run(); else cleanups.add(run); },
    setHold(next: NonNullable<typeof net.hold>): void { active(); if (next === hold) return; retired.add(hold); predecessors.set(next, before.hold); hold = next; net.hold = hold; },
    wire(name: string, factory: PortFactory): void { active(); ports.set(name, () => { active(); return factory(); }); },
    outside(name: string, factory: OutsideFactory): void { active(); outsides.set(name, (given, sql) => { active(); return factory(given, sql); }); },
    /** Scripted anchors stay available until the owning scenario has finished. */
    peer(hash: Digest, value: Parameters<typeof net.peers.set>[1]): void { active(); peers.set(hash, value); },
    now(): number { active(); return timeMs(clock.now)!; },
    nowFor(actor: SessionOwner): number { activeFor(actor); return timeMs(clock.now)!; },
    advance(milliseconds: number): void {
      active(); if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new Error("Fixture clock advance must be nonnegative.");
      clock.now = timeOf(timeMs(clock.now)! + milliseconds);
    },
  };
}

/** Finite fixture scheduler, not a transitive native quiescence or drain proof. */
async function fixturePasses(nodes: readonly Platform[], wait: <T>(action: () => Promise<T>) => Promise<T>, mode: "drive" | "effect" | "dispatch"): Promise<void> {
  const distinct = [...new Map(nodes.map(node => [node.name, node])).values()];
  // At most two rooms, one native creation per scheduler call, and finite
  // enrollment/token effects are expected here. 4096 counted actions is an
  // intentionally generous failure ceiling, not an expected acceptance count
  // or a proof that all native background work has drained.
  let work = 0;
  const count = (value: number): void => {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("Native fixture driver returned an invalid work count.");
    work += value;
    if (work > 4096) throw new Error("Native fixture exceeded its finite work budget.");
  };
  for (let pass = 0; pass < 64; pass++) {
    let made = 0;
    for (const node of distinct) {
      if (mode !== "dispatch") {
        for (;;) {
          const effects = await wait(() => (node.stub as unknown as { effect(): Promise<number> }).effect());
          count(effects);
          if (effects === 0) break;
          made += effects;
        }
      }
      if (mode !== "effect") {
        const dispatched = await wait(() => node.stub.dispatch());
        count(dispatched); made += dispatched;
      }
    }
    if (!made) return;
  }
  throw new Error("Native fixture exceeded its finite scheduler passes.");
}

/** Effect and dispatch rounds, preserving the existing driver order. */
export const driveFixture = (nodes: readonly Platform[], wait: <T>(action: () => Promise<T>) => Promise<T>): Promise<void> => fixturePasses(nodes, wait, "drive");
/** Dispatch-only settling never starts outside effects earlier than its caller. */
export const dispatchFixture = (nodes: readonly Platform[], wait: <T>(action: () => Promise<T>) => Promise<T>): Promise<void> => fixturePasses(nodes, wait, "dispatch");
/** Effect-only phases never dispatch creation duties before their assertions. */
export const effectFixture = (nodes: readonly Platform[], wait: <T>(action: () => Promise<T>) => Promise<T>): Promise<void> => fixturePasses(nodes, wait, "effect");
