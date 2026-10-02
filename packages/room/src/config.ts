/**
 * What a Room is given, and its clock.
 *
 * Production: lane C's policy runtime; the Artifacts binding for the
 * deployment's namespace; lane B's publisher sandbox (one Durable Object
 * per room); and lane L's log remote over both. The Room builds the real
 * adapters over them (see `core.ts`). Tests replace the factory with fake
 * remotes.
 */

import type { PublisherStub } from "@generalbusiness/artroom-git";
import type { LaneId } from "@generalbusiness/artroom-contract";
import type { ArtifactsBinding } from "./artifacts.ts";
import { artifactsLogRemote, type LogRemoteStub } from "./logremote.ts";
import { lanePolicy } from "./policy.ts";
import type { RoomServices } from "./ports.ts";

export interface RoomEnv {
  readonly ROOMS: DurableObjectNamespace;
  /** The deployment's one registry (R-GEN-13). */
  readonly REGISTRY: DurableObjectNamespace;
  /** The Artifacts binding, for one namespace. */
  readonly ARTIFACTS?: unknown;
  /** The namespace the binding reaches. Default: `PUBLIC_NAMESPACE`. */
  readonly ARTIFACTS_NAMESPACE?: string;
  /** Lane B's publisher sandbox (its `Publisher` Durable Object class). */
  readonly PUBLISHER?: DurableObjectNamespace;
  /** Operator key IDs, comma-separated, whose onboarding grants this deployment accepts (R-GEN-12). */
  readonly OPERATOR_KEYS?: string;
  /** The repository namespace reserved for public founding (R-GEN-12). */
  readonly PUBLIC_NAMESPACE?: string;
  readonly LEASE_SECONDS?: string;
  readonly PUBLIC_URL?: string;
  readonly ROOM_KEY_SECRET?: string;
}

export type ServicesFactory = (env: RoomEnv, roomObject: string) => RoomServices;

function missing(what: string): never {
  throw Object.assign(new Error(`This deployment has no ${what} binding.`), { code: "unavailable" });
}

const productionServices: ServicesFactory = (env, roomObject) => {
  const artifacts = (env.ARTIFACTS ?? null) as ArtifactsBinding | null;
  const namespace = env.ARTIFACTS_NAMESPACE ?? env.PUBLIC_NAMESPACE ?? "artroom-public";
  const publisher = (): PublisherStub & LogRemoteStub => (env.PUBLISHER ? (env.PUBLISHER.get(env.PUBLISHER.idFromName(roomObject)) as unknown as PublisherStub & LogRemoteStub) : missing("PUBLISHER"));
  const binding: ArtifactsBinding = artifacts ?? {
    get: async () => missing("ARTIFACTS"),
    create: async () => missing("ARTIFACTS"),
  };
  // The stub is resolved per call, so a deployment without the sandbox still founds rooms and admits acts that need no repository work.
  const stub: PublisherStub = {
    pinObjects: (r) => publisher().pinObjects(r),
    pinRef: (r) => publisher().pinRef(r),
    preview: (r) => publisher().preview(r),
    integrate: (r) => publisher().integrate(r),
    push: (r) => publisher().push(r),
  };
  const logStub: LogRemoteStub = {
    pushLog: (r) => publisher().pushLog(r),
    stageLog: (r) => publisher().stageLog(r),
    readLogRef: (r) => publisher().readLogRef(r),
  };
  return {
    policy: lanePolicy(),
    remotes: { artifacts: binding, namespace, publisher: stub, logRemote: async (repo) => artifactsLogRemote(binding, logStub, repo) },
  };
};

let factory: ServicesFactory = productionServices;
let clockFn: () => number = () => Date.now();

/** Tests and local development only: replace the services every new Room object uses. */
export function setServicesFactory(f: ServicesFactory | null): void {
  factory = f ?? productionServices;
}

export function servicesFor(env: RoomEnv, roomObject: string): RoomServices {
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
