/**
 * What a Room is given, and its clock.
 *
 * Production: lane C's policy runtime; the Artifacts bindings for the
 * deployment's namespaces (public founding, and imports); lane B's
 * publisher sandbox (one Durable Object per room); and lane L's log remote
 * over both. The Room builds the real
 * adapters over them (see `core.ts`). Tests replace the factory with fake
 * remotes.
 */

import { pushFirstCommit, type PublisherStub } from "@generalbusiness/artroom-git";
import type { CheckerService, LaneId } from "@generalbusiness/artroom-contract";
import type { ArtifactsBinding } from "./artifacts.ts";
import { artifactsLogRemote, type LogRemoteStub } from "./logremote.ts";
import { lanePolicy } from "./policy.ts";
import type { RoomServices, SnapshotWrite } from "./ports.ts";

export interface RoomEnv {
  readonly ROOMS: DurableObjectNamespace;
  /** The deployment's one registry (R-GEN-13). */
  readonly REGISTRY: DurableObjectNamespace;
  /** The Artifacts binding, for one namespace: the public founding namespace. */
  readonly ARTIFACTS?: unknown;
  /** The namespace the binding reaches. Default: `PUBLIC_NAMESPACE`. */
  readonly ARTIFACTS_NAMESPACE?: string;
  /**
   * The Artifacts binding for imported repositories, in `IMPORT_NAMESPACE`.
   * An import's repository must be outside the public founding namespace
   * (R-GEN-12), so a deployment that both founds public rooms and imports
   * needs this second binding. Without it, imports are refused at `draft`.
   */
  readonly IMPORT_ARTIFACTS?: unknown;
  /** The namespace `IMPORT_ARTIFACTS` reaches, and the only one an onboarding grant may name. */
  readonly IMPORT_NAMESPACE?: string;
  /** Lane B's publisher sandbox (its `Publisher` Durable Object class). */
  readonly PUBLISHER?: DurableObjectNamespace;
  /** Operator key IDs, comma-separated, whose onboarding grants this deployment accepts (R-GEN-12). */
  readonly OPERATOR_KEYS?: string;
  /** The repository namespace reserved for public founding (R-GEN-12). */
  readonly PUBLIC_NAMESPACE?: string;
  readonly LEASE_SECONDS?: string;
  /**
   * Spike measurement only (request 8bd623cc; hugh's approval, assert
   * 66a41558): leave each proposal's pin to the alarm, due this many
   * milliseconds after its propose, so the alarm tick that completes a
   * pending pin can be measured on its own. Unset (the default, and always in
   * production): the propose's commit runs the pin at once, as before.
   */
  readonly PIN_DELAY_MS?: string;
  /** Required: the deployment's own `https://` origin, where `Redeemed.mcp` sends a bearer token. No default. */
  readonly PUBLIC_URL?: string;
  readonly ROOM_KEY_SECRET?: string;
}

/**
 * The deployment's public origin, from `PUBLIC_URL`. A Worker or Room
 * without one refuses to start: there is no fallback host to send a bearer
 * token to (request 55be0661). It must be an `https://` origin, with no
 * path, query, fragment or credentials, so `${publicUrl}/v1/...` is exact.
 */
export function publicUrl(env: Pick<RoomEnv, "PUBLIC_URL">): `https://${string}` {
  const v = env.PUBLIC_URL;
  let origin: string | undefined;
  try {
    const u = new URL(v ?? "");
    if (u.protocol === "https:") origin = u.origin;
  } catch {
    origin = undefined;
  }
  if (!v || origin !== v) throw new Error(`PUBLIC_URL must be this deployment's https:// origin, such as https://room.example.com, with nothing after the host; it is ${v === undefined ? "not set" : JSON.stringify(v)}.`);
  return v as `https://${string}`;
}

export type ServicesFactory = (env: RoomEnv, roomObject: string) => RoomServices;

function missing(what: string): never {
  throw Object.assign(new Error(`This deployment has no ${what} binding.`), { code: "unavailable" });
}

const productionServices: ServicesFactory = (env, roomObject) => {
  const artifacts = (env.ARTIFACTS ?? null) as ArtifactsBinding | null;
  const namespace = env.ARTIFACTS_NAMESPACE ?? env.PUBLIC_NAMESPACE ?? "artroom-public";
  type Sandbox = PublisherStub & LogRemoteStub & { writeSnapshot: SnapshotWrite };
  const publisher = (): Sandbox => (env.PUBLISHER ? (env.PUBLISHER.get(env.PUBLISHER.idFromName(roomObject)) as unknown as Sandbox) : missing("PUBLISHER"));
  const absent = (name: string): ArtifactsBinding => ({ get: async () => missing(name), create: async () => missing(name), delete: async () => missing(name) });
  const binding: ArtifactsBinding = artifacts ?? absent("ARTIFACTS");
  // The import namespace's own binding (R-GEN-12): repositories there are imported, never created.
  const bindings: Record<string, ArtifactsBinding> = {};
  // Only a binding the deployment has: a configured namespace without one has no repository here (review a35b4b61).
  if (env.IMPORT_NAMESPACE && env.IMPORT_NAMESPACE !== namespace && env.IMPORT_ARTIFACTS) bindings[env.IMPORT_NAMESPACE] = env.IMPORT_ARTIFACTS as ArtifactsBinding;
  const bindingOf = (ns: string): ArtifactsBinding => (ns === namespace ? binding : bindings[ns] ?? absent(`Artifacts binding for ${ns}`));
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
    remotes: {
      artifacts: binding,
      namespace,
      bindings,
      publisher: stub,
      writeSnapshot: (r) => publisher().writeSnapshot(r),
      logRemote: async (repo, mints) => artifactsLogRemote(bindingOf(repo.namespace), logStub, repo, mints),
      firstCommit: (remote, token, at) => pushFirstCommit(remote, token, at),
    },
    // Each checker's service binding, by name (R-EXEC-8).
    checkers: (name) => ((env as unknown as Record<string, CheckerService | undefined>)[checkerBinding(name)] ?? null),
  };
};

/** The service binding a deployment gives a checker: `CHECKER_` and its name in capitals, `-` as `_` (`llm-review` is `CHECKER_LLM_REVIEW`). */
export function checkerBinding(name: string): string {
  return `CHECKER_${name.toUpperCase().replaceAll("-", "_")}`;
}

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

let pinDelayOverride: number | null = null;

/** Tests only: the pin delay every Room made from now on uses, whatever its env says; null to read the env again. */
export function setPinDelay(ms: number | null): void {
  pinDelayOverride = ms;
}

/**
 * The pin delay from `PIN_DELAY_MS`, in milliseconds; 0 (off) when unset or
 * empty. Any other value that is not a whole number of milliseconds stops the
 * Room from starting, rather than measuring with a switch it did not mean.
 */
export function pinDelayMs(env: Pick<RoomEnv, "PIN_DELAY_MS">): number {
  if (pinDelayOverride !== null) return pinDelayOverride;
  const v = env.PIN_DELAY_MS;
  if (v === undefined || v === "") return 0;
  const n = Number(v);
  if (!/^\d+$/.test(v) || !Number.isSafeInteger(n)) throw new Error("PIN_DELAY_MS must be a whole number of milliseconds, or unset.");
  return n;
}

/** Tests only: replace the room clock. */
export function setClock(f: (() => number) | null): void {
  clockFn = f ?? (() => Date.now());
}

export function clock(): number {
  return clockFn();
}

export type { LaneId };
