/**
 * Test support for the workerd suite: rooms with real Durable Object SQLite,
 * the real policy runtime (lane C), and the real adapters (lane B's landing
 * engine, workspaces, pinning and diffs; lane L's log publisher; the Room's
 * Artifacts adapter) over fake remotes (`src/memory/artifacts.ts`).
 */

import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { entriesAfter } from "../../src/log.ts";
import type {
  ActRecord,
  DelegationId,
  Envelope,
  EnvelopeKind,
  Genesis,
  KeyId,
  LaneId,
  LogEntry,
  MemberId,
  PolicyDocument,
  ReadQuery,
  ReadResults,
  Refusal,
  RequestBody,
  RequestEnvelope,
  Role,
  RoomId,
  Sha,
  SignedEnvelope,
  SignedOnboardingGrant,
} from "@generalbusiness/artroom-contract";
import { isRefusal } from "@generalbusiness/artroom-contract";
import { FakeArtifactsHost, lanePolicy, setAlarmDelay, setClock, setServicesFactory, type ArtifactsPort, type PolicyPort, type Registry, type Room } from "../../src/index.ts";
import { forkName, type FaultPoint, type DiffBounds } from "@generalbusiness/artroom-git";
import { artifactsLogRemote } from "../../src/logremote.ts";
import type { ArtifactsBinding } from "../../src/artifacts.ts";
import { buildTree, encodeCommit, gitObject, readLogFiles } from "@generalbusiness/artroom-log";
import { b64url, digestBytes, hex, keyPairFromSeed, newKeyPair, randomBytes, randomToken, sign, type KeyPair } from "../../src/crypto.ts";
import { iso, roomIdOf } from "../../src/ids.ts";
import { unwire, type Wire } from "../../src/errors.ts";

// ------------------------------------------------------------ the clock

export const clock = { now: Date.UTC(2026, 9, 1, 12, 0, 0) };
setClock(() => clock.now);
// Alarms are scheduled as usual but run only when a test triggers them (tick or runDurableObjectAlarm).
setAlarmDelay(3600_000);
export function advance(ms: number): void {
  clock.now += ms;
}

// ------------------------------------------------------------ worlds: the ports of one room

/** The policy port with fault injection: a runtime failure is a thrown `policy-runtime` (R-EVAL-5). */
export interface FaultyPolicy extends PolicyPort {
  failures: { notify: number; refuse: number; require: number };
  calls: { notify: number; refuse: number };
  /** While set, `refuse` waits for it: a test holds an admission inside policy evaluation. */
  gate: Promise<void> | null;
  /** A port that ignores the lane purpose: only the Room's own platform rules then protect recovery lanes. */
  ignorePurpose: boolean;
  /** Called with each refuse input before evaluation; a test may throw from it (a runtime failure). */
  refuseHook: ((input: { act: { kind: string; body: unknown } }) => void) | null;
}

function faultyPolicy(): FaultyPolicy {
  const real = lanePolicy();
  const realLand = real.land;
  const runtime = () => Object.assign(new Error("injected engine fault"), { name: "ArtroomError", code: "policy-runtime", retryable: true, maybeRecorded: false });
  const p: FaultyPolicy = {
    ...real,
    failures: { notify: 0, refuse: 0, require: 0 },
    calls: { notify: 0, refuse: 0 },
    gate: null,
    ignorePurpose: false,
    refuseHook: null,
    refuse: async (policy, input, opts) => {
      p.calls.refuse++;
      if (p.gate) await p.gate;
      if (p.refuseHook) p.refuseHook(input as never);
      const a = [policy, p.ignorePurpose ? { ...input, lane: { ...input.lane, purpose: "ordinary" as const } } : input, opts] as const;
      if (p.failures.refuse > 0) {
        p.failures.refuse--;
        throw runtime();
      }
      return real.refuse(...a);
    },
    require: async (policy, input, opts) => {
      const a = [policy, p.ignorePurpose ? { ...input, lane: { ...input.lane, purpose: "ordinary" as const } } : input, opts] as const;
      if (p.failures.require > 0) {
        p.failures.require--;
        throw runtime();
      }
      return real.require(...a);
    },
    land: async (policy, input, opts) => realLand(policy, p.ignorePurpose ? { ...input, lane: { ...input.lane, purpose: "ordinary" } } : input, opts),
    notify: async (...a) => {
      p.calls.notify++;
      if (p.failures.notify > 0) {
        p.failures.notify--;
        throw runtime();
      }
      return real.notify(...a);
    },
  };
  return p;
}

/** Port-level instrumentation: calls by port method, and outages planned at the port. */
export type PortMethod = keyof ArtifactsPort;

/** The fake remotes of one room, with the helpers tests use to steer them. */
export interface TestArtifacts extends FakeArtifactsHost {
  /** Calls made, by Artifacts port method: tests check that refused acts did no I/O. */
  readonly calls: Map<PortMethod, number>;
  /** Make the next `count` calls of a port method fail, as an outage would. */
  failNext(method: PortMethod, count?: number): void;
}

/** The log ref on the canonical repository, and its transport faults. */
export interface LogFacet {
  readonly faults: FakeArtifactsHost["log"]["faults"];
  readonly pushes: number;
  ref: Sha | null;
  foreignWrite(): Sha;
  /** The files of a log commit. */
  files(commit: Sha): Promise<Map<string, string>>;
  /** Write a log-shaped commit of these files on `parent` (another writer's). */
  write(files: Readonly<Record<string, string>>, parent: Sha | null): Sha;
}

export interface World {
  readonly artifacts: TestArtifacts;
  readonly log: LogFacet;
  readonly policy: FaultyPolicy;
  /** Lane B's engine runs for real; tests steer only the sandbox's pushes. */
  readonly landing: { readonly controls: FakeArtifactsHost["controls"] };
  /** Diff bounds (R-PROP-6) the room's adapter uses; a test may lower them. */
  readonly bounds: { -readonly [K in keyof DiffBounds]?: DiffBounds[K] };
  /** Lane B's landing fault points: a test may throw from one, as a crash would. */
  landingFault: ((point: FaultPoint, op: string) => void) | null;
}

const worlds = new Map<string, World>();
const decoder = new TextDecoder();

function newWorld(): World {
  const host = new FakeArtifactsHost("artroom-public", () => clock.now);
  const calls = new Map<PortMethod, number>();
  const planned = new Map<PortMethod, number>();
  const artifacts = Object.assign(host, {
    calls,
    failNext(method: PortMethod, count = 1) {
      planned.set(method, count);
    },
  }) as TestArtifacts;
  const log: LogFacet = {
    faults: host.log.faults,
    get pushes() {
      return host.log.pushes;
    },
    get ref() {
      return host.logRef;
    },
    set ref(sha: Sha | null) {
      host.logRef = sha;
    },
    foreignWrite: () => host.foreignWrite(),
    files: async (commit) => {
      const files = await readLogFiles(host.canonicalRepo(), commit);
      return new Map([...files].map(([p, b]) => [p, decoder.decode(b)]));
    },
    write: (files, parent) => {
      const { root, objects } = buildTree(Object.fromEntries(Object.entries(files).map(([p, t]) => [p, new TextEncoder().encode(t)])));
      for (const o of objects) host.put(o);
      const who = "Another Writer <other@example.invalid> 1700000000 +0000";
      return host.put(gitObject("commit", encodeCommit({ tree: root, parents: parent ? [parent] : [], author: who, committer: who, message: "not the room\n" })));
    },
  };
  const world: World = { artifacts, log, policy: faultyPolicy(), landing: { controls: host.controls }, bounds: {}, landingFault: null };
  (world as { instrument?: unknown }).instrument = (a: ArtifactsPort): ArtifactsPort =>
    new Proxy(a, {
      get(target, prop, receiver) {
        const v = Reflect.get(target, prop, receiver);
        if (typeof v !== "function") return v;
        return (...args: unknown[]) => {
          const m = prop as PortMethod;
          calls.set(m, (calls.get(m) ?? 0) + 1);
          const n = planned.get(m) ?? 0;
          if (n > 0) {
            planned.set(m, n - 1);
            return Promise.reject(new Error(`Artifacts is unavailable (${String(m)})`));
          }
          return (v as (...a: unknown[]) => unknown).apply(target, args);
        };
      },
    });
  return world;
}

setServicesFactory((_env, objectId) => {
  let w = worlds.get(objectId);
  if (!w) {
    w = newWorld();
    worlds.set(objectId, w);
  }
  const world = w;
  const host = world.artifacts;
  return {
    policy: world.policy,
    remotes: {
      artifacts: host.binding,
      get namespace() {
        return host.namespace;
      },
      publisher: host.stub,
      // The production log remote, over the fake binding and the fake sandbox's pushLog and readLogRef.
      logRemote: async (loc) => artifactsLogRemote(host.binding as unknown as ArtifactsBinding, host.logStub, loc),
      sleep: async () => {},
      bounds: world.bounds,
      wrapArtifacts: (world as unknown as { instrument: (a: ArtifactsPort) => ArtifactsPort }).instrument,
      landingFault: (point, op) => world.landingFault?.(point, op),
    },
  };
});

/** The git remote of a lane's fork (lane B's fork name, in the room's namespace). */
export function forkRemote(room: TestRoom, lane: string): string {
  const a = room.world.artifacts;
  return `https://artifacts.test/${a.namespace}/${forkName(a.canonical, lane as LaneId)}.git`;
}

/** Whether a workspace token is live on the lane's fork. */
export function tokenLive(room: TestRoom, lane: string, token: string): boolean {
  const a = room.world.artifacts;
  return a.repo(forkName(a.canonical, lane as LaneId)).admits(token, "read");
}

/**
 * A workspace opened in lane B's `Workspaces` and recorded by the Room for
 * the lane's current lease, as if the host stopped before provisioning
 * began. Returns the workspace operation's ID.
 */
export async function openedWorkspace(room: TestRoom, lane: string): Promise<string> {
  return runInDurableObject(room.stub as unknown as DurableObjectStub<Room>, (r: Room) => {
    const l = r.core.sql.all("SELECT lease_gen, expires_ms FROM lanes WHERE id = ?", lane)[0]!;
    const op = r.core.workspaces.open(lane as LaneId, Number(l["lease_gen"]), Number(l["expires_ms"]));
    r.core.sql.all("INSERT INTO ws_leases (lane, lease_gen, state) VALUES (?, ?, 'open')", lane, Number(l["lease_gen"]));
    return (op as { id: string }).id;
  });
}

/** Point a world's fake Artifacts at a repository identity `<namespace>/<name>`. */
export function placeRepo(world: World, identity: string): void {
  const [ns, name] = identity.split("/") as [string, string];
  world.artifacts.namespace = ns;
  world.artifacts.canonical = name;
}

// ------------------------------------------------------------ rooms and clients

export type RoomStub = DurableObjectStub<Room>;

export interface TestRoom {
  readonly id: RoomId;
  readonly genesis: Genesis;
  readonly stub: RoomStub;
  readonly world: World;
  readonly admin: Client;
  readonly recovery: Client;
  readonly roomKey: KeyId;
}

export async function call<T>(p: Promise<unknown>): Promise<T> {
  return unwire((await p) as Wire<T>);
}

/** The thrown failure of a call, or a test failure if it succeeded. */
export async function failure(p: Promise<unknown>): Promise<{ code: string; message: string; retryable: boolean }> {
  const w = (await p) as Wire<unknown>;
  if ("ok" in w) throw new Error(`expected a failure, got ${JSON.stringify(w.ok).slice(0, 300)}`);
  return w.error;
}

export class Client {
  constructor(
    readonly room: TestRoom | { readonly id: RoomId; readonly stub: RoomStub },
    readonly keys: KeyPair,
    readonly delegation?: DelegationId,
  ) {}

  get key(): KeyId {
    return this.keys.key;
  }

  envelope(kind: EnvelopeKind, target: unknown, body: unknown, idempotencyKey = randomToken().slice(0, 24)): Envelope {
    return {
      v: 1,
      room: this.room.id,
      actor: this.keys.key,
      kind,
      target,
      body,
      idempotencyKey,
      ...(this.delegation ? { delegation: this.delegation } : {}),
    } as Envelope;
  }

  signed(kind: EnvelopeKind, target: unknown, body: unknown, idempotencyKey?: string): SignedEnvelope {
    const envelope = this.envelope(kind, target, body, idempotencyKey);
    return { envelope, sig: sign(this.keys.seed, "artroom-envelope-v1", envelope) };
  }

  /** Submit an act; returns the record or the refusal; a thrown failure fails the test. */
  async act<T extends ActRecord = ActRecord>(kind: EnvelopeKind, target: unknown, body: unknown, idempotencyKey?: string): Promise<T | Refusal> {
    return call<T | Refusal>(this.room.stub.submit(this.signed(kind, target, body, idempotencyKey)));
  }

  /** Submit and expect acceptance. */
  async ok<T extends ActRecord = ActRecord>(kind: EnvelopeKind, target: unknown, body: unknown, idempotencyKey?: string): Promise<T> {
    const r = await this.act<T>(kind, target, body, idempotencyKey);
    if (isRefusal(r)) throw new Error(`refused: ${r.rule}: ${r.reason}`);
    return r;
  }

  signedRequest(request: RequestBody, nonce = randomToken().slice(0, 32), notAfter = iso(clock.now + 60_000)) {
    const r: RequestEnvelope = { v: 1, room: this.room.id, actor: this.keys.key, request, nonce, notAfter, ...(this.delegation ? { delegation: this.delegation } : {}) };
    return { request: r, sig: sign(this.keys.seed, "artroom-request-v1", r) };
  }

  async request<T>(request: RequestBody): Promise<T | Refusal> {
    return call<T | Refusal>(this.room.stub.request(this.signedRequest(request)));
  }

  /** A read session for this key (R-CRED-5). */
  async session(): Promise<string> {
    const s = await this.request<{ token: string }>({ kind: "session", ttlSeconds: 3600 });
    if (isRefusal(s)) throw new Error(`session refused: ${s.rule}`);
    return s.token;
  }

  async read<Q extends ReadQuery>(q: Q, token?: string): Promise<ReadResults[Q["q"]]> {
    return call<ReadResults[Q["q"]]>(this.room.stub.read(token ?? (await this.session()), q));
  }
}

/** The world a room will use, registered before it is founded through the Worker. */
export function worldFor(roomId: string): World {
  const id = env.ROOMS.idFromName(roomId).toString();
  let w = worlds.get(id);
  if (!w) {
    w = newWorld();
    worlds.set(id, w);
  }
  return w;
}

/** A room's log, read inside its Durable Object (no session needed). */
export async function logOf(roomId: string): Promise<LogEntry[]> {
  const stub = env.ROOMS.get(env.ROOMS.idFromName(roomId)) as unknown as DurableObjectStub<Room>;
  return runInDurableObject(stub, (room: Room) => entriesAfter(room.core.sql, -1, 1000));
}

/** The test operator key; its key ID is in the workerd config's OPERATOR_KEYS. */
export const operator = keyPairFromSeed(new Uint8Array(32).fill(0x0b));

/** An onboarding grant from the test operator (R-GEN-12). */
export function grant(repo: string, admin: KeyId, notAfter = iso(clock.now + day), by: KeyPair = operator): SignedOnboardingGrant {
  const g = { v: 1 as const, repo, admin, operator: by.key, notAfter };
  return { grant: g, sig: sign(by.seed, "artroom-onboarding-v1", g) };
}

/** A room founded from a signed genesis, with main holding `files` (R-GEN-1). */
export async function makeRoom(opts: { policy?: PolicyDocument; files?: Record<string, string> } = {}): Promise<TestRoom> {
  const world = newWorld();
  // An imported repository, with an operator's grant (R-GEN-12), bound in the registry before founding (R-GEN-13).
  const repo = `test-import/${hex(randomBytes(16))}`;
  placeRepo(world, repo);
  const files: Record<string, string> = { "README.md": "# test\n", "src/app.ts": "export const app = 1;\n", ...(opts.files ?? {}) };
  if (opts.policy) files[".artroom/policy.json"] = JSON.stringify(opts.policy);
  world.artifacts.main = world.artifacts.commit(null, files);
  const admin = newKeyPair();
  const recovery = newKeyPair();
  const seed = randomBytes(32);
  const genesis: Genesis = {
    format: "artroom-log-v1",
    name: `test/${randomToken().slice(0, 8)}`,
    repo,
    onboarding: grant(repo, admin.key),
    admin: { handle: "@admin", key: admin.key },
    recovery: recovery.key,
    roomKey: keyPairFromSeed(seed).key,
    profile: { policy: "artroom-jsonata-v1", jsonata: "2.2.2" },
    createdAt: iso(clock.now),
  };
  const id = roomIdOf(genesis);
  const objectId = env.ROOMS.idFromName(id);
  worlds.set(objectId.toString(), world);
  await call((env.REGISTRY.get(env.REGISTRY.idFromName("registry")) as unknown as DurableObjectStub<Registry>).bind(repo, id, genesis.name));
  const stub = env.ROOMS.get(objectId) as unknown as RoomStub;
  await call(stub.found(genesis, sign(admin.seed, "artroom-genesis-v1", genesis), b64url(seed)));
  const base = { id, stub };
  const room: TestRoom = {
    id,
    genesis,
    stub,
    world,
    admin: new Client(base, admin),
    recovery: new Client(base, recovery),
    roomKey: genesis.roomKey,
  };
  return room;
}

/** Invite and join a new member with a client-held key (R-GEN-6, R-ADM-3c). */
export async function addMember(room: TestRoom, handle: MemberId, role: Role): Promise<Client> {
  const secret = randomBytes(32);
  const inv = await room.admin.ok("roster", null, {
    op: "invite",
    member: handle,
    role,
    custody: "client",
    expiresAt: iso(clock.now + 24 * 3600 * 1000),
    secretHash: digestBytes(secret),
  });
  const key = newKeyPair();
  const c = new Client(room, key);
  await c.ok("roster", null, { op: "join", invitation: inv.id, secret: b64url(secret) });
  return c;
}

/** Commit on top of main and push it to a lane's fork. */
export function pushChange(room: TestRoom, lane: LaneId, changes: Record<string, string | null>, parent?: Sha): Sha {
  const a = room.world.artifacts;
  const head = a.commit(parent ?? a.main!, changes);
  a.push(lane, head);
  return head;
}

/** Poll until `ok` holds, while other work (a held push) is in flight. */
export async function until(ok: () => Promise<boolean>, timeoutMs = 5_000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (!(await ok())) {
    if (Date.now() > end) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 5));
  }
}

/** Run the room's alarm work once. */
export async function tick(room: TestRoom, times = 1): Promise<void> {
  for (let i = 0; i < times; i++) await call(room.stub.tick());
}

/** A thrown policy runtime failure, as lane C's evaluator throws it (R-EVAL-5). */
export function runtimeFailure(): Error {
  return Object.assign(new Error("injected engine fault"), { name: "ArtroomError", code: "policy-runtime", retryable: true, maybeRecorded: false });
}

export function expectRefusal(r: unknown, rule: string): Refusal {
  if (!isRefusal(r)) throw new Error(`expected refusal ${rule}, got ${JSON.stringify(r).slice(0, 400)}`);
  if (r.rule !== rule) throw new Error(`expected refusal ${rule}, got ${r.rule}: ${r.reason}`);
  return r;
}

export function expectOk<T>(r: T | Refusal): T {
  if (isRefusal(r)) throw new Error(`unexpected refusal ${r.rule}: ${r.reason}`);
  return r;
}

export const hour = 3600 * 1000;
export const day = 24 * hour;
export { b64url, digestBytes, iso, newKeyPair, randomBytes, randomToken, sign, isRefusal };
