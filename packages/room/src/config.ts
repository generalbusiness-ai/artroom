/**
 * Which ports a Room uses, and its clock.
 *
 * Production: lane C's policy runtime, and Artifacts and landing left
 * "unwired" until lane B's engine and Artifacts helpers are connected (see
 * README, "Integration"). Tests replace the factory with in-memory ports.
 */

import type { LaneId, OpId, PolicyVersion, PublicationSlot, Refusal, Sha } from "@generalbusiness/artroom-contract";
import { UnwiredArtifacts } from "./memory/artifacts.ts";
import { lanePolicy } from "./policy.ts";
import type { LandingPort, LandRecordLike, Ports } from "./ports.ts";

export interface RoomEnv {
  readonly ROOMS: DurableObjectNamespace;
  /** The deployment's one registry (R-GEN-13). */
  readonly REGISTRY: DurableObjectNamespace;
  /** Operator key IDs, comma-separated, whose onboarding grants this deployment accepts (R-GEN-12). */
  readonly OPERATOR_KEYS?: string;
  /** The repository namespace reserved for public founding (R-GEN-12). */
  readonly PUBLIC_NAMESPACE?: string;
  readonly LEASE_SECONDS?: string;
  readonly PUBLIC_URL?: string;
  readonly ROOM_KEY_SECRET?: string;
}

/** A landing port for a deployment whose engine is not wired: `land` fails as unavailable. */
export class UnwiredLanding implements LandingPort {
  accept(): LandRecordLike | Refusal {
    throw new Error("The landing engine is not wired into this deployment yet.");
  }
  laneChanged(): readonly LandRecordLike[] {
    return [];
  }
  policyActivated(_v: PolicyVersion): readonly OpId[] {
    return [];
  }
  abort(): LandRecordLike | null {
    return null;
  }
  evaluate(): LandRecordLike | null {
    return null;
  }
  after(): null {
    return null;
  }
  view(): null {
    return null;
  }
  slot(): PublicationSlot {
    return { state: "free", last: 0 };
  }
  activeViews(): readonly never[] {
    return [];
  }
  nextDue(): null {
    return null;
  }
  main(): Sha | null {
    return null;
  }
  async refreshMain(): Promise<Sha> {
    throw new Error("The landing engine is not wired into this deployment yet.");
  }
  async reconcile(): Promise<void> {}
}

export type PortsFactory = (env: RoomEnv, roomObject: string) => Ports;

const productionPorts: PortsFactory = () => ({
  policy: lanePolicy(),
  artifacts: new UnwiredArtifacts(),
  landing: () => new UnwiredLanding(),
  log: async () => {
    throw new Error("The log publisher is not wired into this deployment yet.");
  },
});

let factory: PortsFactory = productionPorts;
let clockFn: () => number = () => Date.now();

/** Tests and local development only: replace the ports every new Room object uses. */
export function setPortsFactory(f: PortsFactory | null): void {
  factory = f ?? productionPorts;
}

export function portsFor(env: RoomEnv, roomObject: string): Ports {
  return factory(env, roomObject);
}

let alarmDelay: number | null = null;

/**
 * Tests only: schedule every alarm this many milliseconds of real time ahead,
 * so that it runs only when a test triggers it.
 */
export function setAlarmDelay(ms: number | null): void {
  alarmDelay = ms;
}

/** The real time at which to set an alarm the room wants at `due` (room clock). */
export function alarmTime(due: number): number {
  return alarmDelay !== null ? Date.now() + alarmDelay : Math.max(due, Date.now() + 10);
}

/** Tests only: replace the room clock. */
export function setClock(f: (() => number) | null): void {
  clockFn = f ?? (() => Date.now());
}

export function clock(): number {
  return clockFn();
}

export type { LaneId };
