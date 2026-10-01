/**
 * Test support for the workerd suite: rooms with real Durable Object SQLite,
 * the real policy runtime (lane C), and in-memory Artifacts and landing.
 */

import { env } from "cloudflare:workers";
import type {
  ActRecord,
  DelegationId,
  Envelope,
  EnvelopeKind,
  Genesis,
  KeyId,
  LaneId,
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
} from "@generalbusiness/artroom-contract";
import { isRefusal } from "@generalbusiness/artroom-contract";
import { MemoryArtifacts, MemoryLanding, lanePolicy, setAlarmDelay, setClock, setPortsFactory, type PolicyPort, type Room } from "../../src/index.ts";
import { b64url, digestBytes, keyPairFromSeed, newKeyPair, randomBytes, randomToken, sign, type KeyPair } from "../../src/crypto.ts";
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
    refuse: async (policy, input, opts) => {
      p.calls.refuse++;
      if (p.gate) await p.gate;
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

export interface World {
  readonly artifacts: MemoryArtifacts;
  readonly policy: FaultyPolicy;
  landing: MemoryLanding | null;
}

const worlds = new Map<string, World>();

function newWorld(): World {
  return { artifacts: new MemoryArtifacts(), policy: faultyPolicy(), landing: null };
}

setPortsFactory((_env, objectId) => {
  let w = worlds.get(objectId);
  if (!w) {
    w = newWorld();
    worlds.set(objectId, w);
  }
  const world = w;
  return {
    policy: world.policy,
    artifacts: world.artifacts,
    landing: (sql, host) => (world.landing = new MemoryLanding(sql, host, world.artifacts, () => clock.now)),
  };
});

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

/** A room founded from a signed genesis, with main holding `files` (R-GEN-1). */
export async function makeRoom(opts: { policy?: PolicyDocument; files?: Record<string, string> } = {}): Promise<TestRoom> {
  const world = newWorld();
  const files: Record<string, string> = { "README.md": "# test\n", "src/app.ts": "export const app = 1;\n", ...(opts.files ?? {}) };
  if (opts.policy) files[".artroom/policy.json"] = JSON.stringify(opts.policy);
  world.artifacts.main = world.artifacts.commit(null, files);
  const admin = newKeyPair();
  const recovery = newKeyPair();
  const seed = randomBytes(32);
  const genesis: Genesis = {
    format: "artroom-log-v1",
    name: `test/${randomToken().slice(0, 8)}`,
    repo: "test-repo",
    admin: { handle: "@admin", key: admin.key },
    recovery: recovery.key,
    roomKey: keyPairFromSeed(seed).key,
    profile: { policy: "artroom-jsonata-v1", jsonata: "2.2.2" },
    createdAt: iso(clock.now),
  };
  const id = roomIdOf(genesis);
  const objectId = env.ROOMS.idFromName(id);
  worlds.set(objectId.toString(), world);
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

/** Run the room's alarm work once. */
export async function tick(room: TestRoom, times = 1): Promise<void> {
  for (let i = 0; i < times; i++) await call(room.stub.tick());
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
