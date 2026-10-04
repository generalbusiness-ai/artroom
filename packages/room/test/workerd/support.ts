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
  CheckerService,
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
import { FakeArtifactsHost, lanePolicy, setAlarmDelay, setClock, setServicesFactory, type ArtifactsPort, type PolicyPort, type Registry, type Room, type SnapshotPort } from "../../src/index.ts";
import { forkName, type FaultPoint, type DiffBounds } from "@generalbusiness/artroom-git";
import { artifactsLogRemote } from "../../src/logremote.ts";
import type { ArtifactsBinding } from "../../src/artifacts.ts";
import { buildTree, encodeCommit, gitObject, readLogFiles } from "@generalbusiness/artroom-log";
import { b64url, digestBytes, hex, keyPairFromSeed, newKeyPair, randomBytes, randomToken, sign, type KeyPair } from "../../src/crypto.ts";
import { iso, roomIdOf } from "../../src/ids.ts";
import { unwire, type Wire } from "../../src/errors.ts";
import type { Diagnosis } from "../../src/diag.ts";
import { actInVocabulary, filesInVocabulary, inVocabulary, noteRecovery, refresh } from "./vocabulary.ts";

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
  /** Make the next `count` calls of a port method fail, as an outage would; with `error`, by throwing it. */
  failNext(method: PortMethod, count?: number, error?: unknown): void;
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
  /** Checker services by checker name, as service bindings would give them (R-EXEC-8); none by default. */
  checkers: Record<string, CheckerService>;
  /** Snapshot repositories (R-CARRY-16); none by default, as in production, so no filtered job is issued. */
  snapshots: SnapshotPort | null;
  /** The most one log push may carry; lane L's default when null. */
  logTransfer: { objects: number; bytes: number } | null;
  /**
   * A second namespace this deployment binds, for imports (request
   * b6b51de7): the room reaches it through `Remotes.bindings`, and the
   * sandbox and log remote follow the repository's namespace.
   */
  imports: FakeArtifactsHost | null;
  /** What the room logged as diagnoses (`src/diag.ts`), in order (request d268d249). */
  readonly diagnoses: Diagnosis[];
}

const worlds = new Map<string, World>();
const decoder = new TextDecoder();

function newWorld(): World {
  const host = new FakeArtifactsHost("artroom-public", () => clock.now);
  const calls = new Map<PortMethod, number>();
  const planned = new Map<PortMethod, number>();
  const errors = new Map<PortMethod, unknown>();
  const artifacts = Object.assign(host, {
    calls,
    failNext(method: PortMethod, count = 1, error?: unknown) {
      planned.set(method, count);
      if (error === undefined) errors.delete(method);
      else errors.set(method, error);
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
  const world: World = { artifacts, log, policy: faultyPolicy(), landing: { controls: host.controls }, bounds: {}, landingFault: null, checkers: {}, snapshots: null, logTransfer: null, imports: null, diagnoses: [] };
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
            return Promise.reject(errors.has(m) ? errors.get(m) : new Error(`Artifacts is unavailable (${String(m)})`));
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
  // The host holding a repository: the import namespace's, by remote or by location, or the room's own.
  const hostFor = (where: string): FakeArtifactsHost => (world.imports && (where === world.imports.namespace || where.includes(`/${world.imports.namespace}/`)) ? world.imports : host);
  const publisher = new Proxy(host.stub, {
    get: (_t, k) => (req: { canonical: { remote: string } }) => (hostFor(req.canonical.remote).stub as unknown as Record<string | symbol, (r: unknown) => unknown>)[k]!(req),
  });
  return {
    policy: world.policy,
    checkers: (checker: string) => world.checkers[checker] ?? null,
    get snapshots() {
      return world.snapshots ?? undefined;
    },
    diagnose: (d) => world.diagnoses.push(d),
    remotes: {
      artifacts: host.binding,
      get namespace() {
        return host.namespace;
      },
      get bindings() {
        return world.imports ? { [world.imports.namespace]: world.imports.binding as unknown as ArtifactsBinding } : {};
      },
      publisher,
      // The sandbox writes a snapshot into a repository beside the canonical one: in the import namespace for an imported room.
      writeSnapshot: (req) => hostFor(req.store.remote).writeSnapshot(req),
      // The production log remote, over the fake binding and the fake sandbox's pushLog and readLogRef.
      logRemote: async (loc, mints) => artifactsLogRemote(hostFor(loc.namespace).binding as unknown as ArtifactsBinding, hostFor(loc.namespace).logStub, loc, mints),
      firstCommit: (remote, token, at) => hostFor(remote).firstCommit(remote, token, at),
      sleep: async () => {},
      get logTransfer(): { objects: number; bytes: number } | undefined {
        return world.logTransfer ?? undefined;
      },
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

  /** The envelope of an act, in the run's vocabulary (test/workerd/vocabulary.ts): as written in the legacy run. */
  envelope(kind: EnvelopeKind, target: unknown, body: unknown, idempotencyKey = randomToken().slice(0, 24)): Envelope {
    const a = actInVocabulary(this.room.id, this.keys.key, kind, target, body);
    return {
      v: a.v,
      room: this.room.id,
      actor: this.keys.key,
      kind: a.kind,
      ...(a.binding !== undefined ? { binding: a.binding } : {}),
      target: a.target,
      body: a.body,
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
    await refresh(this.room.id, this.room.stub);
    const signed = this.signed(kind, target, body, idempotencyKey);
    const out = await call<T | Refusal>(this.room.stub.submit(signed));
    if ((signed.envelope.kind as string) === "recover" && !isRefusal(out)) noteRecovery(this.room.id, out as unknown as { id: string; lane?: string });
    return out;
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

  /** The session `read` made when a test gave it no token, and the room times between which it is used again. */
  private kept: { readonly token: string; readonly from: number; readonly until: number } | null = null;

  /**
   * A read. With no token, the client makes a read session and keeps it for
   * its later reads: a session request is a signed write, about 2.5 ms, and
   * a test reads many times. If the room no longer accepts the kept session
   * (its key was revoked, or it ran out), the client asks for a new one, so
   * the caller sees what a new session request gives, as before.
   */
  async read<Q extends ReadQuery>(q: Q, token?: string): Promise<ReadResults[Q["q"]]> {
    if (token !== undefined) return call<ReadResults[Q["q"]]>(this.room.stub.read(token, q));
    const kept = this.kept;
    if (kept && clock.now >= kept.from && clock.now < kept.until) {
      const w = (await this.room.stub.read(kept.token, q)) as unknown as Wire<ReadResults[Q["q"]]>;
      if (!("error" in w) || w.error.code !== "unauthenticated") return unwire(w);
    }
    this.kept = null;
    const from = clock.now;
    const fresh = await this.session();
    // A session lasts an hour of room time; the last minute is left unused.
    this.kept = { token: fresh, from, until: from + 59 * 60_000 };
    return call<ReadResults[Q["q"]]>(this.room.stub.read(fresh, q));
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
export async function makeRoom(opts: { policy?: PolicyDocument; files?: Record<string, string>; importNamespace?: string } = {}): Promise<TestRoom> {
  const world = newWorld();
  // An imported repository, with an operator's grant (R-GEN-12), bound in the registry before founding (R-GEN-13).
  // With `importNamespace`, it is in the deployment's second namespace (`world.imports`), and the primary is left empty.
  const repo = `${opts.importNamespace ?? "test-import"}/${hex(randomBytes(16))}`;
  // In the declared run every room has a v2 document (test/workerd/vocabulary.ts); the legacy run is unchanged.
  const policyDoc = opts.policy ?? (DECLARED ? defaultPolicy() : undefined);
  const files: Record<string, string> = filesInVocabulary({ "README.md": "# test\n", "src/app.ts": "export const app = 1;\n", ...(opts.files ?? {}) });
  if (policyDoc) files[".artroom/policy.json"] = JSON.stringify(inVocabulary(policyDoc));
  if (opts.importNamespace) {
    const imports = new FakeArtifactsHost(opts.importNamespace, () => clock.now);
    imports.canonical = repo.split("/")[1]!;
    imports.main = imports.commit(null, files);
    world.imports = imports;
  } else {
    placeRepo(world, repo);
    world.artifacts.main = world.artifacts.commit(null, files);
  }
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
  await refresh(id, stub);
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
  const head = a.commit(parent ?? a.main!, filesInVocabulary(changes));
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

export { DECLARED, checkerInVocabulary, configDigest, converted, coveredKinds, defaultDocument, inVocabulary } from "./vocabulary.ts";
import { DECLARED } from "./vocabulary.ts";
import { defaultPolicy } from "@generalbusiness/artroom-policy";

export const hour = 3600 * 1000;
export const day = 24 * hour;
export { b64url, digestBytes, iso, newKeyPair, randomBytes, randomToken, sign, isRefusal };
