/**
 * The Room's core: one repository's sequencer over synchronous SQLite.
 *
 * - Every log write happens in one synchronous transaction that seals the
 *   entry and applies its effects (R-ADM-6, R-ADM-10, R-LOG-2).
 * - Admissions run one at a time through `serial`. The landing engine may
 *   write system events between an admission's reads and its write, so the
 *   write transaction re-checks the log head and decides again if it moved
 *   (R-ADM-6).
 * - External I/O (Artifacts, policy evaluation) never runs inside a
 *   transaction. Work that follows a commit (pins, previews, token
 *   revocation, notify, recomputation) is deferred and retried by the alarm.
 */

import type {
  AnyPolicyDocument,
  Binding,
  DeclaredPolicyLane,
  PolicyDocument,
  ActId,
  CheckBody,
  ArtroomError,
  Authority,
  Carried,
  Checkpoint,
  CheckerConfig,
  CheckerService,
  Digest,
  EntryContent,
  Genesis,
  KeyId,
  LaneId,
  LogEntry,
  MemberId,
  NotCarried,
  ObligationId,
  OpId,
  PolicyActor,
  NotifyDirectory,
  PolicyLane,
  PolicyProposal,
  PolicyRoom,
  RetainedLandInput,
  PolicyVersion,
  Refusal,
  RepoPath,
  Role,
  RoomId,
  Seq,
  Sha,
  SystemEvent,
} from "@generalbusiness/artroom-contract";
import { bindingSubject, checkerInputs, declarationOf, isDeclared, isPlatformKind, ownersFor, validatePolicyV2 } from "@generalbusiness/artroom-policy";
import { stagedProblems } from "./declared.ts";
import { canonicalize, parseStrict, utf8 } from "./canonical.ts";
import { b64url, digestJson, keyPairFromSeed, sha256Hex, unb64url, verify } from "./crypto.ts";
import { isArtroomError } from "@generalbusiness/artroom-contract";
import { artroomError } from "./errors.ts";
import { iso, roomIdOf } from "./ids.ts";
import { checkpoint, entryAt, idOf, logSource, seal } from "./log.ts";
import { changedPaths, evidenceByAct, evidenceOn, generationRow, laneRow, type GenerationRow, type LaneRow } from "./model.ts";
import { adminObligation, blocking, invalidity, latestReviews, obligationsFor, qualification, statusesOf, transitions, withAdvisory } from "./obligations.ts";
import type { ActivePolicy, Evaluation, LandingHost, LandRecord, ObligationSpec, Ports, PublisherPort, Readiness, Remotes, RetainedRef, RoomServices, SnapshotPort, Sql } from "./ports.ts";
import {
  ContainerPublisher,
  Landing,
  MintLedger,
  SnapshotRepos,
  Workspaces,
  knownArtifactsCode,
  publicationTokens,
  scrubBatch,
  type ForkTokens,
  type ScrubCursor,
} from "@generalbusiness/artroom-git";
import { LogPublisher } from "@generalbusiness/artroom-log";
import { ArtifactsAdapter, locate, type ArtifactsBinding, type RepoLocation } from "./artifacts.ts";
import { snapshotCommit, snapshotMessage } from "./snapshot.ts";
import { issueJobs, jobsDue, jobTokensDue, moveJobMints, oweJobs, revokeJobTokens } from "./jobs.ts";
import { activeAdmins, activeMembers, teamsOf } from "./roster.ts";
import { PUBLICATION_CODES, ROOM_SCRUB_TABLES, createSchema, getMeta, head, headSeq, json, num, one, retain, setMeta, str } from "./store.ts";
import { adminOwnKey, judge } from "./authority.ts";
import { report, toConsole } from "./diag.ts";
import { matchGlob } from "./glob.ts";
import { ALARM } from "./budgets.ts";

export interface CoreOptions {
  readonly sql: Sql;
  readonly services: RoomServices;
  readonly clock: () => number;
  /** Lease length in milliseconds (R-LANE-5). */
  readonly leaseMs: number;
  /** Spike measurement only (`PIN_DELAY_MS`): a pin is left to the alarm until this long after its propose. 0 or absent: off. */
  readonly pinDelayMs?: number;
  /** Keep a promise alive after the response (`ctx.waitUntil`). */
  readonly defer: (p: Promise<unknown>) => void;
  /** Called after every commit that sealed entries: wake subscribers, reschedule the alarm. */
  readonly committed: () => void;
  /** Does the registry bind this repository to this room ID and name (R-GEN-13)? */
  readonly bound: (repo: string, room: RoomId, name: string) => Promise<boolean>;
  /**
   * Persist the alarm at or before `at` (room clock), keeping an earlier one; resolves only once it is stored. Public
   * founding awaits it before each repository create (plan 004).
   */
  readonly wake?: (at: number) => Promise<void>;
}

export interface ActivePolicyFull extends ActivePolicy {
  readonly digest: Digest;
  readonly checkers: Readonly<Record<string, { readonly config: CheckerConfig; readonly digest: Digest }>>;
}

/** A configuration file under `.artroom/` that activates policy when it lands (R-PUB-9). */
export function isConfigPath(p: RepoPath): boolean {
  return p === ".artroom/policy.json" || matchGlob(p, ".artroom/checkers/**");
}

/** Thrown inside a commit when the log moved since the decision was made (R-ADM-6). */
export class Moved extends Error {
  constructor() {
    super("the log moved during admission");
  }
}

/** The publication in progress: its cohort, fixed before any remote write (R-LOG-8). */
export interface PendingPublication {
  /** The stored form's version. */
  readonly v: 2;
  /** The expected parent: the last log commit the Room confirmed. */
  readonly parent: Sha | null;
  /** The exact commit the publisher makes of this cohort on `parent`. */
  readonly expected: Sha;
  readonly through: Seq;
  readonly hash: Digest;
  readonly checkpoint: Checkpoint;
  readonly retained: readonly Digest[];
}

/**
 * A cohort as stored. Version 1 (before review 8faa2ef9) has no version
 * field and no expected commit; `publish` derives the commit and stores
 * version 2 before any further write (review 1249097f).
 */
export type StoredPublication = PendingPublication | (Omit<PendingPublication, "v" | "expected"> & { readonly v?: undefined; readonly expected?: undefined });

/** One open proposal's obligations recomputed under a new policy (R-POL-9). */
export interface Recomputation {
  readonly version: PolicyVersion;
  readonly lane: LaneId;
  readonly generation: number;
  readonly obligations: readonly ObligationSpec[];
  readonly carried: readonly { readonly obligation: ObligationId; readonly evidence: Carried }[];
  readonly notCarried: readonly NotCarried[];
  readonly blocked: Refusal | null;
  readonly evaluations: readonly Evaluation[];
}

/**
 * The kinds of work the alarm's 5-second loop retries. Each has its own
 * durable backoff after a failure (request 3da1d82b): an alarm that fires
 * early for other work skips a kind whose backoff has not ended.
 */
export const LOOP_KINDS = ["tokens", "pins", "previews", "provision", "recompute", "landing", "mints", "jobTokens", "forkTokens"] as const;
export type LoopKind = (typeof LOOP_KINDS)[number];
/** Whether a kind of loop work may run now. */
export type LoopDue = (kind: LoopKind) => boolean;
/** Loop work that needs the canonical repository. */
const NEEDS_REPOSITORY: ReadonlySet<LoopKind> = new Set(["pins", "previews", "provision", "landing", "mints", "jobTokens"]);
/**
 * Loop work timed by its own durable due times (`nextAlarm`), never pending
 * by the 5-second loop: the landing engine, the canonical mint ledger,
 * ended job tokens' revocations and the forks' read-token ledger.
 * Its backoff, after a failure of the step itself, ends only when it runs.
 */
const SELF_TIMED: ReadonlySet<LoopKind> = new Set(["landing", "mints", "jobTokens", "forkTokens"]);

let faultHook: ((point: string) => void) | null = null;

/** Tests only: throw at a named point inside a write, as a crash would. */
/** How many versions' parsed policies a Room keeps: the active one, and those of operations and jobs made under earlier ones. */
const POLICY_CACHE = 4;

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v); // G2:policy-frozen-deep
  }
  return value;
}

/** A failed publication's code: a known one, a known Artifacts code, or `transport`. Never other text (request d29c09fa). */
function publicationCode(e: unknown): string {
  const code = (e as { code?: unknown } | null | undefined)?.code;
  return typeof code === "string" && PUBLICATION_CODES.has(code) ? code : (knownArtifactsCode(e) ?? "transport");
}

export function setFault(f: ((point: string) => void) | null): void {
  faultHook = f;
}

export function fault(point: string): void {
  faultHook?.(point);
}

export class RoomCore {
  readonly sql: Sql;
  readonly ports: Ports;
  readonly clock: () => number;
  readonly leaseMs: number;
  readonly pinDelayMs: number;
  readonly defer: (p: Promise<unknown>) => void;
  readonly committed: () => void;
  readonly bound: CoreOptions["bound"];
  private readonly wake: CoreOptions["wake"];
  readonly remotes: Remotes;
  /** Each checker's service binding, which every job travels over (R-EXEC-8). */
  readonly checkers: (checker: string) => CheckerService | null;
  private readonly services: RoomServices;
  private snapReposCache: SnapshotRepos | null = null;

  /**
   * Lane B's snapshot repositories on this room's SQLite (R-CARRY-16): one
   * per snapshot commit, named after the canonical repository. Their create,
   * deletion and revocation duties are durable; the alarm runs them
   * (`steps.snapshots`, `nextAlarm`).
   */
  get snapshotRepos(): SnapshotRepos {
    if (!this.snapReposCache) {
      const name = this.location().name;
      this.snapReposCache = new SnapshotRepos({
        sql: this.sql,
        artifacts: this.artifacts,
        prefix: /^[A-Za-z0-9._-]{1,40}$/.test(name) ? name : `r${sha256Hex(utf8(name)).slice(0, 32)}`,
        // The persisted alarm (follow-up c9cd4cd8): resolves only once storage has it, before any snapshot create is sent.
        wake: this.wake ?? (async () => this.committed()),
        now: () => this.now(),
        ...(this.remotes.sleep ? { sleep: this.remotes.sleep } : {}),
      });
    }
    return this.snapReposCache;
  }

  /** The snapshot repositories filtered jobs read (R-CARRY-16). */
  get snapshots(): SnapshotPort {
    return this.services.snapshots ?? this.ownSnapshots;
  }

  private readonly ownSnapshots: SnapshotPort = {
    prepare: async (s) => {
      let written: string | null = null;
      // The publisher writes the snapshot into the new repository, reading the canonical one with a short read token.
      const repo = await this.snapshotRepos.prepare(s.commit, async (store) => {
        const snap = await this.ports.artifacts.snapshot(s.integration, s.paths);
        if (!snap) throw new Error("the integration's snapshot could not be read");
        const remote = await this.canonicalRemoteReady();
        // A 300-second canonical read token, through the mint ledger (R-MINT-1): revoked afterwards, or owed.
        written = await this.mints.withToken(`snapshot:${s.commit}`, "read", () => 300, (read) =>
          this.remotes.writeSnapshot({
            canonical: { remote, token: read.plaintext },
            store: { remote: store.remote, token: store.token },
            files: snap.entries,
            message: snapshotMessage(s.checker, s.digest),
          }),
        );
        return written;
      });
      // A reused repository was written for the same commit; a new one holds what the publisher wrote.
      return { commit: (written ?? repo.commit) as Sha, remote: repo.remote };
    },
    mint: (commit, job, deadline) => this.snapshotRepos.mint(commit, job, deadline),
    end: (commit, job) => this.snapshotRepos.end(commit, job),
  };
  /** Lane B's landing engine, on this room's SQLite. */
  readonly landing: Landing;
  /**
   * The canonical mint ledger (protocol section 32): it owns each token the
   * Room creates on its canonical repository, from before the request is
   * sent until the token's revocation is answered or another owner claims
   * it. Built once per object start, with the core: its constructor takes
   * over what a stopped object left (R-MINT-7). The alarm runs it
   * (`steps.mints`, `nextAlarm`).
   */
  readonly mints: MintLedger;
  private wsCache: Workspaces | null = null;
  /** The Artifacts binding for the room's repository namespace (`binding()`), resolved per call. */
  readonly artifacts: ArtifactsBinding;
  private chain: Promise<unknown> = Promise.resolve();
  private seedCache: Uint8Array | null = null;
  /** Deferred work already started, so a kick is not repeated. */
  private readonly inFlight = new Set<string>();
  private readonly waiters = new Set<() => void>();
  private readonly pending = new Set<Promise<void>>();

  /** Resolve at the next commit, or after `ms`. For waits and long polls. */
  changed(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.waiters.delete(done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      this.waiters.add(done);
    });
  }

  constructor(opts: CoreOptions) {
    this.sql = opts.sql;
    this.remotes = opts.services.remotes;
    this.checkers = opts.services.checkers ?? (() => null);
    this.services = opts.services;
    this.clock = opts.clock;
    this.leaseMs = opts.leaseMs;
    this.pinDelayMs = opts.pinDelayMs ?? 0;
    this.defer = opts.defer;
    this.bound = opts.bound;
    this.wake = opts.wake;
    this.committed = () => {
      opts.committed();
      for (const w of [...this.waiters]) w();
    };
    createSchema(this.sql);
    this.datePendingPins();
    const r = this.remotes;
    const sleep = r.sleep ? { sleep: r.sleep } : {};
    // The public namespace's binding, or the import namespace's (R-GEN-12): whichever holds the room's repository.
    this.artifacts = {
      get: (name) => this.binding().get(name),
      create: (name, o) => this.binding().create(name, o),
      delete: (name) => this.binding().delete(name),
    };
    const canonicalRepo = () => this.artifacts.get(this.location().name);
    this.mints = new MintLedger({
      sql: this.sql,
      repo: canonicalRepo,
      now: () => this.now(),
      // The persisted alarm: resolves only once storage has it, before any create is sent (R-MINT-2).
      wake: this.wake ?? (async () => this.committed()),
      // Point lookups in the Room's other records of token IDs: job tokens, and the landing's token rows (R-MINT-7).
      known: (id) => !!one(this.sql, "SELECT 1 AS x FROM job_tokens WHERE token_id = ?", id) || this.landing.core.knownToken(id),
      ...sleep,
    });
    // A room stored before mint lane C: its check jobs' own mint records move into the ledger, once.
    moveJobMints(this.sql, this.mints, this.now());
    // The forks' read-token ledger is the workspaces' (request 02836f9a), built with them once the room is founded.
    const forkTokens: Pick<ForkTokens, "withToken"> = {
      withToken: (fork, purpose, ttl, fn) => this.workspaces.forkTokens.withToken(fork, purpose, ttl, fn),
    };
    const adapter = new ArtifactsAdapter({
      binding: this.artifacts,
      stub: r.publisher,
      location: () => this.location(),
      mints: this.mints,
      forkTokens,
      ...(r.bounds ? { bounds: r.bounds } : {}),
      ...sleep,
    });
    this.ports = {
      policy: opts.services.policy,
      artifacts: r.wrapArtifacts ? r.wrapArtifacts(adapter) : adapter,
      log: async () => LogPublisher.open(await r.logRemote(this.location(), this.mints), r.logTransfer ? { maxTransfer: r.logTransfer } : {}),
    };
    // The canonical repository, read when used: a room learns it at founding.
    const self = this;
    const canonical = {
      get name() {
        return self.location().name;
      },
      get remote() {
        const remote = getMeta(self.sql, "canonical_remote");
        // Resolved and stored before any landing work (`canonicalRemoteReady`); never a guess.
        if (!remote) throw artroomError("unavailable", "The canonical repository's remote is not known yet.");
        return remote;
      },
    };
    this.landing = new Landing({
      sql: this.sql,
      room: this.host(),
      publisher: new ContainerPublisher({ stub: r.publisher, artifacts: this.artifacts, canonical, mints: this.mints, ...sleep }),
      tokens: publicationTokens({ mints: this.mints, repo: canonicalRepo, ...sleep }),
      now: () => this.now(),
      ...(r.landingFault ? { fault: r.landingFault } : {}),
    });
  }

  /**
   * The room's repository in one of this deployment's Artifacts namespaces
   * (R-GEN-12): the genesis's, or while `found` runs, the one it is founding.
   */
  location(): RepoLocation {
    const identity = this.founded ? this.genesis.repo : getMeta(this.sql, "founding_repo");
    const loc = identity ? locate(identity, [this.remotes.namespace, ...Object.keys(this.remotes.bindings ?? {})]) : null;
    if (!loc) throw artroomError("unavailable", identity ? "This deployment has no Artifacts binding for the room's repository namespace." : "This room has not been founded.");
    // A public founding stores the repository under the incarnation it prepared (review 3eb7bc44); a room founded before keeps its identity's name.
    const incarnation = getMeta(this.sql, "canonical_name");
    return incarnation ? { namespace: loc.namespace, name: incarnation } : loc;
  }

  private binding(): ArtifactsBinding {
    const ns = this.location().namespace;
    return ns === this.remotes.namespace ? this.remotes.artifacts : this.remotes.bindings![ns]!;
  }

  /**
   * The canonical repository's git remote, which lane B's publisher needs.
   * A room founded before it was stored (review a711f7b6) resolves it from
   * the bound repository identity itself, and stores it; an outage throws
   * and the work that needed it is retried.
   */
  async canonicalRemoteReady(): Promise<string> {
    const kept = getMeta(this.sql, "canonical_remote");
    if (kept) return kept;
    const remote = await this.ports.artifacts.canonicalRemote();
    setMeta(this.sql, "canonical_remote", remote);
    return remote;
  }

  /** Lane B's workspaces (forks and lease tokens), on this room's SQLite. */
  get workspaces(): Workspaces {
    if (!this.wsCache) {
      const loc = this.location();
      this.wsCache = new Workspaces({
        sql: this.sql,
        artifacts: this.artifacts,
        canonical: loc.name,
        namespace: loc.namespace,
        now: () => this.now(),
        ...(this.remotes.sleep ? { sleep: this.remotes.sleep } : {}),
        ...(this.wake ? { wake: this.wake } : {}),
      });
    }
    return this.wsCache;
  }

  // ------------------------------------------------------------ identity

  private boundCache = false;

  /**
   * Does the registry bind this room's repository to this room (R-GEN-13)?
   * Only then does the Room read the repository, mint a canonical
   * credential for it, or publish to it (R-GEN-12, R-PUB-10). A binding never
   * moves, so a confirmed answer is kept.
   */
  async isBound(genesis: Genesis = this.genesis): Promise<boolean> {
    if (this.boundCache) return true;
    const ok = await this.bound(genesis.repo, roomIdOf(genesis), genesis.name);
    if (ok) this.boundCache = true;
    return ok;
  }

  get founded(): boolean {
    return getMeta(this.sql, "room") !== null;
  }

  get roomId(): RoomId {
    const id = getMeta(this.sql, "room");
    if (!id) throw artroomError("not-found", "This room has not been founded.");
    return id as RoomId;
  }

  get genesis(): Genesis {
    return JSON.parse(getMeta(this.sql, "genesis")!) as Genesis;
  }

  /** The room key's seed. Never returned, logged or recorded (R-SEC-5). */
  seed(): Uint8Array {
    if (!this.seedCache) {
      const s = getMeta(this.sql, "room_seed");
      if (!s) throw artroomError("not-found", "This room has not been founded.");
      this.seedCache = unb64url(s)!;
    }
    return this.seedCache;
  }

  now(): number {
    return this.clock();
  }

  /**
   * Log a failure the client sees only as a fixed message: the step and the
   * error's name, with its message redacted and bounded (request d268d249).
   * Never throws.
   */
  diagnose(event: string, step: string, e: unknown): void {
    report(this.services.diagnose ?? toConsole, event, step, e);
  }

  // ------------------------------------------------------------ founding (R-GEN)

  /**
   * Found the room: verify the first admin's signature over the genesis
   * object, seal it as entry 0, and activate the initial policy at seq 1
   * from main, or the default (R-GEN-1, R-POL-9).
   */
  async found(genesis: Genesis, sig: string, roomSeed: Uint8Array): Promise<RoomId> {
    if (this.founded) {
      const id = this.roomId;
      if (id === roomIdOf(genesis)) return id;
      throw artroomError("bad-request", "This room was founded with a different genesis.");
    }
    if (keyPairFromSeed(roomSeed).key !== genesis.roomKey) throw artroomError("bad-request", "The genesis names a different room key.");
    if (!(await verify(genesis.admin.key, "artroom-genesis-v1", genesis, sig)))
      throw artroomError("unauthenticated", "The genesis is not signed by the first admin's key.");
    // R-GEN-10 step 6 runs only for the room the registry binds to this repository (R-GEN-13).
    if (!(await this.isBound(genesis))) throw artroomError("forbidden", "The registry does not bind this repository to this room.");
    // Create the repository (public founding) or read it (import). The initial policy is
    // main's .artroom/policy.json at import, or the default (R-POL-9).
    let doc: AnyPolicyDocument = this.ports.policy.defaultPolicy();
    let checkers: ActivePolicyFull["checkers"] = {};
    let main: Sha | null = null;
    let remote: string;
    setMeta(this.sql, "founding_repo", genesis.repo);
    let step = "newRepository";
    try {
      if (!genesis.onboarding) await this.newRepository(genesis);
      step = "readMain";
      main = await this.ports.artifacts.readMain();
      if (main === null && !genesis.onboarding) throw new Error("main has no first commit");
      step = "canonicalRemote";
      remote = await this.ports.artifacts.canonicalRemote();
    } catch (e) {
      this.diagnose("found-failed", step, e);
      // Wake the alarm: it settles whatever the new repository still owes (request b6b51de7).
      this.committed();
      throw artroomError("unavailable", "The canonical repository could not be created or read. Retry the same found.");
    }
    if (main !== null) {
      const cfg = await this.ports.artifacts.readConfig(main).catch((e: unknown) => {
        this.diagnose("found-failed", "readConfig", e);
        throw artroomError("unavailable", "The canonical repository could not be read. Try again.");
      });
      const parsed = this.parseConfig(cfg.policy, cfg.checkers);
      if (!parsed.ok) {
        throw artroomError("bad-request", `The policy on main is invalid: ${parsed.problems[0]}`);
      }
      if (parsed.doc) doc = parsed.doc;
      checkers = parsed.checkers;
    }
    this.sql.transaction(() => {
      if (this.founded) return;
      // A new repository is sealed only with nothing owed on it (review a35b4b61); this throws, and the seal aborts, otherwise.
      if (!genesis.onboarding) {
        try {
          this.workspaces.sealCanonical(getMeta(this.sql, "canonical_name") ?? "");
        } catch (e) {
          this.diagnose("found-failed", "sealCanonical", e);
          throw artroomError("unavailable", "The canonical repository still owes cleanup. Retry the same found.");
        }
      }
      const id = roomIdOf(genesis);
      setMeta(this.sql, "room", id);
      setMeta(this.sql, "genesis", canonicalize(genesis));
      setMeta(this.sql, "room_seed", b64url(roomSeed));
      setMeta(this.sql, "recovery", genesis.recovery);
      setMeta(this.sql, "published_through", "-1");
      setMeta(this.sql, "canonical_remote", remote);
      this.seedCache = roomSeed;
      const at = iso(this.now());
      seal(this.sql, roomSeed, at, { type: "system", event: { type: "genesis", genesis, sig } });
      this.sql.all("INSERT INTO members (handle, role, state, joined) VALUES (?, 'admin', 'active', 0)", genesis.admin.handle);
      this.sql.all("INSERT INTO keys (key, member, custody, added, state) VALUES (?, ?, 'client', 0, 'active')", genesis.admin.key, genesis.admin.handle);
      this.activate(doc, checkers, null, at);
    });
    if (main !== null) await this.landing.refreshMain().catch(() => undefined);
    this.committed();
    return this.roomId;
  }

  /**
   * Public founding, step 6 (R-GEN-12; request b6b51de7, review a35b4b61):
   * create the room's repository and give `main` its first commit, with no
   * files, so that the first landing has a main to land on (R-LAND-2,
   * R-PUB-4). Lane B's ledger records each remote step before it is sent,
   * pushes the first commit with the create's own token (no token is minted
   * here), confirms that token's revocation and a complete inventory with no
   * active token, and retires the repository whenever it cannot vouch for
   * every token. The genesis is sealed only after that (`sealCanonical`, in
   * the sealing transaction); until then `found` fails and the alarm settles
   * what is owed. One step at a time, and never after the room is founded,
   * when the Room's own tokens may be live there.
   */
  private newRepository(genesis: Genesis): Promise<void> {
    return this.serial(async () => {
      if (this.founded) return;
      const push = this.remotes.firstCommit;
      if (!push) throw new Error("this deployment cannot push a first commit");
      const base = locate(genesis.repo, [this.remotes.namespace, ...Object.keys(this.remotes.bindings ?? {})])!.name;
      fault("found:before-prepare");
      // A refused push leaves main as it is; the ledger reads it next.
      const name = await this.workspaces.prepareCanonical(base, (remote, token) => push(remote, token, Date.parse(genesis.createdAt)));
      // From here the room's repository is this incarnation: reads, forks, landing and the log all reach it.
      if (getMeta(this.sql, "canonical_name") !== name) {
        setMeta(this.sql, "canonical_name", name);
        this.wsCache = null;
      }
    });
  }

  /** Before founding, the alarm's only work: settle what a public founding's new repository still owes. */
  async settleFounding(): Promise<void> {
    if (this.founded || !getMeta(this.sql, "founding_repo")) return;
    await this.serial(async () => {
      if (!this.founded) await this.workspaces.settleCanonical();
    });
  }

  /** Before founding: when `settleFounding` is next due, or null. */
  foundingDue(): number | null {
    if (this.founded || !getMeta(this.sql, "founding_repo")) return null;
    try {
      return this.workspaces.canonicalDue();
    } catch {
      return null;
    }
  }

  /**
   * Before founding, the alarm's work: the error upgrade's next batch, if
   * one is due, and the founding debt. One failing does not stop the other.
   */
  async workUnfounded(): Promise<void> {
    try {
      this.scrubErrors();
    } catch (e) {
      this.diagnose("step-failed", "errors", e);
    }
    await this.settleFounding();
  }

  /** Before founding, when the alarm is next due: the founding debt, or the error upgrade (due at once while it lasts). */
  unfoundedDue(): number | null {
    const times = [this.foundingDue(), this.scrubDue()].filter((t): t is number => t !== null);
    return times.length ? Math.min(...times) : null;
  }

  /** When the error upgrade's next batch is due: now while its cursor is stored, else null (request d29c09fa). */
  scrubDue(): number | null {
    return getMeta(this.sql, "error_scrub") !== null ? this.now() : null;
  }

  /**
   * Parse `.artroom/` files strictly and validate them (R-POL-1). `doc` is
   * null when there is no policy file. A `v2` document is validated by the
   * acts validator with its checker configurations and this room's
   * historical opening kinds (R-DECL-24), and refused if it uses a step or
   * hold setting this room does not run yet (`stagedProblems`).
   */
  parseConfig(
    policyText: string | null,
    checkerTexts: Readonly<Record<string, string>>,
  ): { readonly ok: true; readonly doc: AnyPolicyDocument | null; readonly checkers: ActivePolicyFull["checkers"] } | { readonly ok: false; readonly problems: readonly string[] } {
    let doc: AnyPolicyDocument | null = null;
    if (policyText !== null) {
      let raw: unknown;
      try {
        raw = parseStrict(policyText);
      } catch (e) {
        return { ok: false, problems: [`.artroom/policy.json is not valid JSON: ${(e as Error).message}`] };
      }
      if (typeof raw === "object" && raw !== null && (raw as { format?: unknown }).format === "artroom-policy-v2") return this.parseDeclared(raw, checkerTexts); // G2:parse-declared
      const v = this.ports.policy.validatePolicy(raw);
      if (!v.ok) return { ok: false, problems: v.problems };
      doc = v.doc;
    }
    const checkers: Record<string, { config: CheckerConfig; digest: Digest }> = {};
    for (const [name, text] of Object.entries(checkerTexts)) {
      let raw: unknown;
      try {
        raw = parseStrict(text);
      } catch (e) {
        return { ok: false, problems: [`.artroom/checkers/${name}.json is not valid JSON: ${(e as Error).message}`] };
      }
      const v = this.ports.policy.validateChecker(raw);
      if (!v.ok) return { ok: false, problems: v.problems.map((p) => `.artroom/checkers/${name}.json: ${p}`) };
      checkers[name] = { config: v.config, digest: digestJson(v.config) };
    }
    return { ok: true, doc, checkers };
  }

  /** A `v2` document and its `artroom-checker-v2` configurations (R-DECL-24, R-DECL-18). */
  private parseDeclared(
    raw: unknown,
    checkerTexts: Readonly<Record<string, string>>,
  ): { readonly ok: true; readonly doc: AnyPolicyDocument; readonly checkers: ActivePolicyFull["checkers"] } | { readonly ok: false; readonly problems: readonly string[] } {
    const configs: Record<string, unknown> = {};
    for (const [name, text] of Object.entries(checkerTexts)) {
      try {
        configs[name] = parseStrict(text);
      } catch (e) {
        return { ok: false, problems: [`.artroom/checkers/${name}.json is not valid JSON: ${(e as Error).message}`] };
      }
    }
    const v = validatePolicyV2(raw, { historicalOpeningKinds: this.openingKinds(), checkers: configs }); // G2:historical
    if (!v.ok) return { ok: false, problems: v.problems };
    const staged = stagedProblems(v.value);
    if (staged.length) return { ok: false, problems: staged }; // G2:staged
    const checkers: Record<string, { config: CheckerConfig; digest: Digest }> = {};
    for (const [name, config] of Object.entries(configs)) checkers[name] = { config: config as CheckerConfig, digest: digestJson(config) };
    return { ok: true, doc: v.value, checkers };
  }

  /** The kinds that have opened a thread in this room (R-DECL-8): every thread's kind but `room` and the platform's `recover`. */
  openingKinds(): string[] {
    return this.sql.all("SELECT DISTINCT kind FROM lanes WHERE kind NOT IN ('room', 'recover') ORDER BY kind").map((r) => str(r, "kind")!);
  }

  /** The active declaration's binding of a kind, or null when it is not declared (R-DECL-15). Kept per policy version. */
  declaredBinding(kind: string): Binding | null {
    const policy = this.activePolicy();
    const doc = policy.doc as AnyPolicyDocument;
    if (!isDeclared(doc) || !Object.hasOwn(doc.acts, kind)) return null;
    if (this.bindingCache?.version !== policy.version) this.bindingCache = { version: policy.version, bindings: new Map() }; // G2:binding-cache
    let b = this.bindingCache.bindings.get(kind);
    if (b === undefined) {
      b = digestJson(bindingSubject(doc, kind)) as Binding;
      this.bindingCache.bindings.set(kind, b);
    }
    return b;
  }

  private bindingCache: { readonly version: PolicyVersion; readonly bindings: Map<string, Binding> } | null = null;

  // ------------------------------------------------------------ policy

  /** The pinned, immutable active policy and its version (R-POL-9). */
  activePolicy(): ActivePolicyFull {
    const version = getMeta(this.sql, "policy") as PolicyVersion;
    return this.policyAt(version)!;
  }

  policyAt(version: PolicyVersion): ActivePolicyFull | null {
    // A version is the ID of its `policy-activated` entry, so its row never changes: the parsed policy is kept, deeply
    // frozen, for the few versions in use. Without this the document is parsed once per kind a grant or a request
    // names (`declaredBinding`).
    const kept = this.policyCache.get(version);
    if (kept) return kept; // G2:policy-cache
    const r = one(this.sql, "SELECT * FROM policies WHERE version = ?", version);
    if (!r) return null;
    const policy: ActivePolicyFull = deepFreeze({
      version,
      doc: JSON.parse(str(r, "doc")!) as PolicyDocument,
      digest: str(r, "digest") as Digest,
      checkers: JSON.parse(str(r, "checkers")!) as ActivePolicyFull["checkers"],
    });
    if (this.policyCache.size >= POLICY_CACHE) this.policyCache.delete(this.policyCache.keys().next().value!); // G2:policy-cache-bound
    this.policyCache.set(version, policy);
    return policy;
  }

  private readonly policyCache = new Map<PolicyVersion, ActivePolicyFull>();

  /** Seal `policy-activated` and make it active. Synchronous; inside a transaction (R-POL-9, R-PUB-9). */
  activate(doc: AnyPolicyDocument, checkers: ActivePolicyFull["checkers"], commit: Sha | null, at: string): ActId {
    const previous = getMeta(this.sql, "policy") as PolicyVersion | null;
    const digest = digestJson(doc);
    // Fenced operations are known before sealing: every unreserved one (R-LAND-5).
    const fenced = this.landing.activeViews().filter((o) => o.state === "accepted" || o.state === "preparing" || o.state === "ready").map((o) => o.id);
    const open = previous ? this.openGenerations() : [];
    const entry = this.sealSystem(
      {
        type: "policy-activated",
        policy: digest,
        commit,
        previous,
        // R-POL-9: every active checker configuration, as name and digest pairs sorted by name.
        checkers: Object.keys(checkers)
          .sort()
          .map((name) => ({ name, config: checkers[name]!.digest })),
        recomputed: { proposals: open.length, reopened: 0, fenced },
      },
      at,
    );
    const version = idOf(entry);
    retain(this.sql, digest, "policy", canonicalize(doc));
    for (const c of Object.values(checkers)) retain(this.sql, c.digest, "checker", canonicalize(c.config));
    this.sql.all(
      "INSERT INTO policies (version, seq, digest, doc, checkers) VALUES (?, ?, ?, ?, ?)",
      version,
      entry.seq,
      digest,
      canonicalize(doc),
      JSON.stringify(checkers),
    );
    setMeta(this.sql, "policy", version);
    if (previous) {
      this.landing.policyActivated(version);
      for (const g of open) this.sql.all("UPDATE generations SET recompute = ?, blocked = NULL WHERE lane = ? AND generation = ?", version, g.lane, g.generation);
      if (open.length) this.run("recompute");
    }
    return version;
  }

  /** The latest generation of every lane that has not landed. */
  openGenerations(): GenerationRow[] {
    return this.sql
      .all("SELECT g.lane, g.generation FROM generations g JOIN lanes l ON l.id = g.lane AND l.generation = g.generation WHERE g.landed IS NULL ORDER BY g.seq")
      .map((r) => generationRow(this.sql, str(r, "lane")!, num(r, "generation")!)!);
  }

  /**
   * After an activation: recompute each open proposal under the new policy
   * (R-POL-9). Applicability comes from `require` on the actual changed paths;
   * carried verdicts are re-judged by `carry` with `policy.same` false; and the
   * one calculator re-judges every verdict and check against the new
   * requirements from its recorded admission facts. A failing `require` blocks
   * landing until a new generation or policy. Runs from the queue; durable,
   * so the alarm resumes it.
   */
  async recompute(): Promise<void> {
    await this.serial(async () => {
      const policy = this.activePolicy();
      for (const g of this.openGenerations()) {
        if (g.recompute !== policy.version) continue;
        const r = await this.recomputeOne(policy, g);
        this.sql.transaction(() => {
          const now = generationRow(this.sql, g.lane, g.generation);
          if (!now || now.recompute !== policy.version || getMeta(this.sql, "policy") !== policy.version) return;
          this.recordRecomputation(r);
        });
        const op = this.activeLandOp(g.lane);
        if (op) this.requestEvaluation(op);
      }
    });
  }

  private async recomputeOne(policy: ActivePolicyFull, g: GenerationRow): Promise<Recomputation> {
    const lane = laneRow(this.sql, g.lane)!;
    const paths = changedPaths(g.changed);
    const admin = adminObligation(policy.version, paths);
    let specs: ObligationSpec[] = admin ? [admin] : [];
    let blocked: Refusal | null = null;
    const evaluations: Evaluation[] = [];
    const budget = this.ports.policy.actBudget();
    const proposal = this.proposalInput(policy.doc, g);
    if (lane.purpose !== "config-recovery") {
      const r = await this.ports.policy.require(
        policy,
        { kind: "require", actor: this.policyActorOf(g.proposer), lane: this.policyLane(lane), proposal, room: this.policyRoom() },
        { budget },
      );
      evaluations.push(...r.evaluations);
      blocked = r.refusal;
      for (const o of withAdvisory(r.obligations, policy.checkers)) if (!specs.some((s) => s.id === o.id)) specs.push(o);
    }
    if (blocked) specs = [...g.obligations];
    const carried: { obligation: ObligationId; evidence: Carried }[] = [];
    const notCarried: NotCarried[] = [...g.notCarried];
    for (const c of g.carried) {
      if (!specs.some((s) => s.id === c.obligation) || lane.purpose === "config-recovery") continue;
      const ev = evidenceByAct(this.sql, c.evidence.act);
      if (!ev) continue;
      const since = await this.ports.artifacts.changedBetween(c.evidence.from.head, g.head);
      const revoked = invalidity(this.sql, ev, "reopens");
      const body = ev.body as { scope: readonly string[]; dependsOn?: readonly string[] };
      const res = await this.ports.policy.carry(
        policy,
        {
          kind: "carry",
          evidence: { act: ev.act, kind: "review", verdict: ev.verdict, by: this.policyActor(ev.authority), from: c.evidence.from, scope: body.scope, dependsOn: body.dependsOn ?? [] },
          changedSince: [...(since ?? paths)],
          proposal,
          policy: { same: false },
        },
        revoked ? { revoked: revoked.reason } : {},
        { budget, purpose: lane.purpose },
      );
      evaluations.push(...res.evaluations);
      if (res.carried) carried.push({ obligation: c.obligation, evidence: res.carried });
      else if (res.notCarried) notCarried.push(res.notCarried);
    }
    return { version: policy.version, lane: g.lane, generation: g.generation, obligations: specs, carried, notCarried, blocked, evaluations };
  }

  /**
   * Apply one recomputation. Its decisions are retained (R-LOG-7). When the
   * contract's obligations-recomputed event lands (amendment 2), this is the
   * one place that seals it.
   */
  recordRecomputation(r: Recomputation): void {
    this.retainEvaluations(r.evaluations);
    // Which obligations were met under the previous policy and are open now (R-POL-9).
    const gen = generationRow(this.sql, r.lane, r.generation)!;
    const prev = this.sql.all("SELECT version FROM policies WHERE seq < (SELECT seq FROM policies WHERE version = ?) ORDER BY seq DESC LIMIT 1", r.version)[0];
    const prevPolicy = prev ? this.policyAt(prev["version"] as PolicyVersion) : null;
    const before = prevPolicy ? statusesOf(this.sql, gen, { doc: prevPolicy.doc, checkers: prevPolicy.checkers }) : [];
    this.sql.all(
      "UPDATE generations SET obligations = ?, carried = ?, not_carried = ?, blocked = ?, recompute = NULL WHERE lane = ? AND generation = ?",
      JSON.stringify(r.obligations),
      JSON.stringify(r.carried),
      JSON.stringify(r.notCarried),
      r.blocked ? JSON.stringify(r.blocked) : null,
      r.lane,
      r.generation,
    );
    const active = this.policyAt(r.version)!;
    const after = statusesOf(this.sql, generationRow(this.sql, r.lane, r.generation)!, { doc: active.doc, checkers: active.checkers });
    const reopened = transitions(before, after).opened;
    // R-POL-9, R-LOG-5: one `obligations-recomputed` event per proposal, in this transaction.
    const blocked = r.blocked ? (({ act: _a, ...rest }) => (void _a, rest))(r.blocked) : undefined;
    this.sealSystem({
      type: "obligations-recomputed",
      policy: r.version,
      lane: r.lane,
      generation: r.generation,
      decisions: r.evaluations.map((e) => e.decision),
      obligations: r.obligations.map((o) => o.id),
      reopened,
      ...(blocked ? { blocked } : {}),
    });
    this.sql.all(
      "INSERT INTO recomputations (version, lane, generation, body) VALUES (?, ?, ?, ?) ON CONFLICT (version, lane, generation) DO NOTHING",
      r.version,
      r.lane,
      r.generation,
      JSON.stringify({ obligations: r.obligations, carried: r.carried, notCarried: r.notCarried, blocked: r.blocked, decisions: r.evaluations.map((e) => e.decision) }),
    );
  }

  retainEvaluations(evaluations: readonly Evaluation[]): void {
    for (const e of evaluations) retain(this.sql, e.decision.input, "input", canonicalize(e.context));
  }

  // ------------------------------------------------------------ policy inputs (R-EVAL-3)

  policyActor(by: Authority): PolicyActor {
    return { member: by.member, role: by.role, teams: by.member ? teamsOf(this.sql, by.member) : [], delegated: by.via === "delegation" };
  }

  policyActorOf(member: MemberId): PolicyActor {
    const role = (str(one(this.sql, "SELECT role FROM members WHERE handle = ?", member), "role") ?? null) as Role | null;
    return { member, role, teams: teamsOf(this.sql, member), delegated: false };
  }

  /**
   * The lane as policy sees it (R-EVAL-3). Under a `v2` document it also
   * carries the thread's kind, null for the room's null lane
   * (`DeclaredPolicyLane`, R-EVAL-3 as amended by section 33.3). Under a `v1`
   * document the input is as it always was, with no `kind`.
   */
  policyLane(lane: LaneRow | null): PolicyLane {
    const l: PolicyLane = lane
      ? { id: lane.id, claimed: lane.state === "held", holder: lane.holder, scope: lane.scope, generation: lane.generation, purpose: lane.purpose }
      : { id: null, claimed: false, holder: null, scope: [], generation: 0, purpose: "ordinary" };
    if (!isDeclared(this.activePolicy().doc)) return l;
    const declared: DeclaredPolicyLane = { ...l, kind: lane?.kind ?? null }; // G2:policy-lane-kind
    return declared;
  }

  policyRoom(): PolicyRoom {
    return { admins: activeAdmins(this.sql).length, members: activeMembers(this.sql).length };
  }

  proposalInput(doc: AnyPolicyDocument, g: Pick<GenerationRow, "generation" | "head" | "base" | "changed">): PolicyProposal {
    const paths = changedPaths(g.changed);
    return { generation: g.generation, head: g.head, base: g.base, changed: g.changed, paths, owners: ownersFor(doc as PolicyDocument, paths) };
  }

  notifyDirectory(lane: LaneId | null): NotifyDirectory {
    const roles: Partial<Record<Role, MemberId[]>> = {};
    for (const m of activeMembers(this.sql)) (roles[m.role] ??= []).push(m.handle);
    const reviewers = new Set<MemberId>();
    if (lane) {
      const l = laneRow(this.sql, lane);
      const g = l && l.generation > 0 ? generationRow(this.sql, lane, l.generation) : null;
      if (g) for (const r of latestReviews(evidenceOn(this.sql, lane, g.generation))) if (this.qualifiesAny(g, r)) reviewers.add(r.member);
    }
    return { roles, reviewers: [...reviewers].sort() };
  }

  /** Does a verdict qualify, under the active policy, for any review obligation of its generation (R-POL-7)? */
  qualifiesAny(gen: GenerationRow, r: Parameters<typeof qualification>[2]): boolean {
    const doc = this.activePolicy().doc;
    return gen.obligations.some((o) => o.kind === "review" && qualification(doc, o, r) === true);
  }

  // ------------------------------------------------------------ the queue

  /** Run admissions and room-written events one at a time (R-ADM-6). */
  serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(fn);
    this.chain = next.catch(() => undefined);
    return next;
  }

  /**
   * Run `fn` against the state it writes, then roll every write back. It
   * judges an act as it would be after another, without recording either.
   */
  simulate<T>(fn: () => T): T {
    const rollback = new Error("simulation");
    let out: { value: T } | null = null;
    try {
      this.sql.transaction(() => {
        out = { value: fn() };
        throw rollback;
      });
    } catch (e) {
      if (e !== rollback) throw e;
    }
    return (out as { value: T } | null)!.value;
  }

  /** Start deferred work once; the alarm retries anything that did not finish. */
  kick(key: string, fn: () => Promise<void>): void {
    if (this.inFlight.has(key)) return;
    this.inFlight.add(key);
    // Started after the caller's synchronous transaction, never inside it.
    const p = Promise.resolve()
      .then(fn)
      .catch(() => undefined)
      .finally(() => {
        this.inFlight.delete(key);
        this.pending.delete(p);
        this.committed();
      });
    this.pending.add(p);
    this.defer(p);
  }

  /** Wait until no deferred work is running. */
  async idle(): Promise<void> {
    while (this.pending.size) await Promise.all([...this.pending]);
  }

  // ------------------------------------------------------------ sealing

  /** Seal a system event and apply its effects. Must run inside a transaction. */
  sealSystem(event: SystemEvent, at: string = iso(this.now()), lane?: "self"): LogEntry {
    return seal(this.sql, this.seed(), at, { type: "system", event }, lane);
  }

  sealEntry(at: string, entry: EntryContent["entry"], lane?: "self"): LogEntry {
    return seal(this.sql, this.seed(), at, entry, lane);
  }

  head(): { readonly seq: Seq; readonly hash: Digest } {
    return head(this.sql)!;
  }

  headSeq(): Seq {
    return headSeq(this.sql);
  }

  // ------------------------------------------------------------ attention

  attend(principal: string, seq: Seq, lane: LaneId | null, item: Record<string, unknown> & { why: string }, text: string): void {
    const n = num(one(this.sql, "SELECT COUNT(*) AS n FROM attention WHERE seq = ?", seq), "n") ?? 0;
    this.sql.all(
      // pos increases with every item made, so an item made later is never behind an issued cursor.
      "INSERT INTO attention (id, seq, n, pos, principal, lane, item, open) VALUES (?, ?, ?, (SELECT COALESCE(MAX(pos), 0) + 1 FROM attention), ?, ?, ?, 1)",
      `att_${seq}_${n}`,
      seq,
      n,
      principal,
      lane,
      JSON.stringify({ ...item, text }),
    );
  }

  attendAdmins(seq: Seq, lane: LaneId | null, item: Record<string, unknown> & { why: string }, text: string): void {
    this.attend("role:admin", seq, lane, item, text);
  }

  // ------------------------------------------------------------ landing

  activeLandOp(lane: LaneId): OpId | null {
    return this.landing.activeViews().find((o) => o.lane === lane)?.id ?? null;
  }

  laneFacts(id: LaneId): ReturnType<LandingHost["lane"]> {
    const l = laneRow(this.sql, id);
    if (!l) return null;
    const g = l.generation > 0 ? generationRow(this.sql, id, l.generation) : null;
    return {
      generation: l.generation,
      head: g?.head ?? null,
      leaseGeneration: l.leaseGen,
      holder: l.state === "held" ? "held" : l.why === "expired" ? "expired" : "released",
    };
  }

  /** The Room's side of the landing operation (lane B's `LandingRoom`). */
  host(): LandingHost {
    return {
      lane: (id) => this.laneFacts(id),
      policyVersion: () => getMeta(this.sql, "policy") as PolicyVersion,
      revalidate: (op, retained) => this.revalidate(op, retained),
      readiness: (op, integration) => this.readiness(op, integration),
      revertScope: (op) => {
        const g = generationRow(this.sql, op.lane, op.generation);
        return g ? changedPaths(g.changed) : [];
      },
      record: (event) => {
        const entry = this.sealSystem(event, iso(this.now()), event.type === "revert-lane" ? "self" : undefined);
        const act = idOf(entry);
        this.afterSystem(event, entry, act);
        this.committed();
        return { seq: entry.seq, act };
      },
    };
  }

  /** The land act's envelope: what reservation re-judges (R-LAND-7). */
  landEnvelope(op: LandRecord): EntryContent["entry"] | null {
    const r = one(this.sql, "SELECT body FROM entries WHERE id = ?", op.act);
    return r ? (JSON.parse(str(r, "body")!) as LogEntry).entry : null;
  }

  /** R-LAND-7 step 1, the parts only the Room knows. Synchronous, inside the reservation transaction. */
  revalidate(op: LandRecord, retained: RetainedLandInput | null): { readonly reason: "authority-lost" | "evidence-invalid" | "obligation-open" | "land-input-changed"; readonly fix: string } | null {
    const entry = this.landEnvelope(op);
    if (!entry || entry.type !== "act") return { reason: "authority-lost", fix: "Land again." };
    const env = entry.act.envelope;
    const doc = this.activePolicy().doc as AnyPolicyDocument;
    const lane = laneRow(this.sql, op.lane);
    if (lane?.purpose === "config-recovery") {
      // R-DECL-21, R-ADMIN-8: platform code judges recovery, whatever the document in force declares and whatever
      // kind the landing's act had under the document it was admitted in: an active admin's own key.
      if (!adminOwnKey(this.sql, env)) return { reason: "authority-lost", fix: "Only an active admin may land a configuration-recovery lane (R-ADMIN-8)." }; // G2:revalidate-recovery
    } else {
      // Admission refuses an undeclared kind at step 4a; here there is no step 4a, and `judge` leaves that kind's role
      // and coverage unjudged. So a landing whose kind the active document no longer declares has lost its authority.
      if (isDeclared(doc) && !isPlatformKind(env.kind) && declarationOf(doc, env.kind) === null)
        return { reason: "authority-lost", fix: `The room's active policy no longer declares ${env.kind}, so the landing's authority cannot be judged. Land again with an act the room declares.` }; // G2:revalidate-undeclared
      const j = judge(this.sql, env, "submitted", this.now(), doc);
      if (!j.ok) return { reason: "authority-lost", fix: `The land initiator's authority is no longer current (${j.refusal.rule}). Land again with current authority.` };
      // R-LAND-7 judges authority "as for a new admission". A new act of this kind carries the active binding
      // (R-DECL-16), and a grant covers a kind only for the binding its grantor signed (R-DECL-17). So a landing
      // under a delegation whose binding is no longer the active one has lost its authority. A member's own key
      // needs no grant: its landing completes under the declaration it was admitted in (R-DECL-23).
      // (Under a v1 document, and for a platform kind, there is no active binding, and nothing to compare.)
      const active = this.declaredBinding(env.kind);
      if (j.authority.via === "delegation" && active !== null && (env as { binding?: string }).binding !== active) // G2:revalidate-binding
        return { reason: "authority-lost", fix: `The delegation was granted for an earlier meaning of ${env.kind}. Ask the grantor to delegate again, then land again.` };
    }
    const policy = this.activePolicy();
    const gen = generationRow(this.sql, op.lane, op.generation);
    if (!gen) return { reason: "authority-lost", fix: "Land again." };
    if (gen.blocked) return { reason: "obligation-open", fix: gen.blocked.fix ?? "Propose a new generation." };
    const obligations = obligationsFor(this.sql, op.lane, op.generation, { doc: policy.doc, checkers: policy.checkers, integration: op.integration ?? null });
    for (const act of op.evidence ?? []) {
      if (!obligations.some((o) => o.evidenceActs.includes(act))) {
        // Evidence stopped counting: a compromised key, retirement under "reopens", or a sole-admin flag that no longer holds.
        const flagged = one(this.sql, "SELECT flags FROM evidence WHERE act = ?", act);
        if (flagged && (JSON.parse(str(flagged, "flags")!) as string[]).includes("sole-admin-self-approval"))
          return { reason: "obligation-open", fix: "A sole-admin self-approval no longer counts because the room has another admin. Get another admin's approval, then land again." };
        return { reason: "evidence-invalid", fix: "Evidence this landing relied on no longer counts. Get a new review or check, then land again." };
      }
    }
    // An advisory obligation never holds up reservation (R-OBL-7).
    if (obligations.some((o) => blocking(o) && o.state !== "met"))
      return { reason: "obligation-open", fix: "An obligation is open again on this integration. Meet it, then land again." };
    if (lane?.purpose !== "config-recovery") {
      // R-LAND-7: rebuild the reservation-stage land input now and compare its canonical
      // bytes with the bytes the engine retained at `ready`. No hashing or evaluation here.
      const rebuilt = this.landInput(op, lane!, gen, policy, "reservation");
      if (!retained || !this.ports.policy.matchesRetained(retained, rebuilt))
        return { reason: "land-input-changed", fix: "The reviews or obligations changed after the landing was prepared. Land again." };
    }
    return null;
  }

  /** The land-rule input (R-POL-6, R-LAND-4 step 3). Pure: rebuilt at reservation and compared by digest. */
  landInput(op: Pick<LandRecord, "lane" | "generation" | "integration">, lane: LaneRow, gen: GenerationRow, policy: ActivePolicyFull, stage: "land" | "reservation", actor?: Authority) {
    const obligations = obligationsFor(this.sql, gen.lane, gen.generation, { doc: policy.doc, checkers: policy.checkers, integration: op.integration ?? null });
    const reviews = latestReviews(evidenceOn(this.sql, gen.lane, gen.generation))
      .filter((r) => this.qualifiesAny(gen, r))
      .map((r) => ({ act: r.act, verdict: r.verdict!, by: this.policyActor(r.authority), basis: "here" as const }));
    for (const o of obligations)
      for (const e of o.evidence)
        if (e.basis === "carried" && e.kind === "review" && !reviews.some((r) => r.act === e.act)) {
          const row = one(this.sql, "SELECT body, verdict FROM evidence WHERE act = ?", e.act);
          if (row) reviews.push({ act: e.act, verdict: str(row, "verdict") as "approve", by: this.policyActor((JSON.parse(str(row, "body")!) as { authority: Authority }).authority), basis: "carried" as never });
        }
    const initiator = actor ?? this.initiatorOf(op as LandRecord);
    return {
      kind: "land" as const,
      actor: initiator ? this.policyActor(initiator) : { member: null, role: null, teams: [], delegated: false },
      lane: this.policyLane(lane),
      proposal: this.proposalInput(policy.doc, gen),
      // Advisory obligations are left out: a land rule cannot make one block, and an advisory check arriving
      // between readiness and reservation does not change the input reservation compares (R-OBL-7).
      obligations: obligations.filter(blocking).map((o) => ({ id: o.id, met: o.state === "met" })),
      reviews: reviews.sort((a, b) => (a.act < b.act ? -1 : 1)),
      stage,
    };
  }

  private initiatorOf(op: Pick<LandRecord, "act">): Authority | null {
    const r = op.act ? one(this.sql, "SELECT body FROM entries WHERE id = ?", op.act) : undefined;
    if (!r) return null;
    const e = (JSON.parse(str(r, "body")!) as LogEntry).entry;
    return e.type === "act" ? e.receipt.authority : null;
  }

  /**
   * R-LAND-4 steps 2 to 4 on a built integration (lane B's `readiness`). It
   * may await: reading the integration's `.artroom/` configuration, and
   * evaluating land rules, whose decisions are sealed as `land-evaluated`.
   * The engine applies the answer only if the operation has not moved on.
   */
  async readiness(op: LandRecord, integration: Sha): Promise<Readiness> {
    const lane = laneRow(this.sql, op.lane);
    const gen = generationRow(this.sql, op.lane, op.generation);
    if (!lane || !gen) return { kind: "retry", reason: "lease-changed", fix: "Claim the lane, then land again." };
    if (gen.blocked) return { kind: "failed", reason: { code: "refused", refusal: gen.blocked } };
    // A recomputation under a newer policy is due; it asks for this evaluation again when it is recorded.
    if (gen.recompute) return { kind: "waiting", obligations: [] };
    const policy = this.activePolicy();
    // A change to .artroom/ configuration must be valid in the integration itself (R-POL-1, R-PUB-9).
    if (changedPaths(gen.changed).some(isConfigPath)) {
      const cfg = await this.integrationConfig(integration);
      if (!cfg.ok)
        return {
          kind: "failed",
          reason: { code: "refused", refusal: { refused: true, rule: "policy-invalid", reason: `The integrated configuration is invalid: ${cfg.problems?.[0] ?? "unknown problem"}.`, fix: "Correct the configuration and propose again." } },
        };
    }
    await this.carryChecks(op, integration, policy);
    await this.recordSnapshots(op.lane, op.generation, integration, policy);
    const obligations = obligationsFor(this.sql, op.lane, op.generation, { doc: policy.doc, checkers: policy.checkers, integration });
    const openReview = obligations.find((o) => o.kind === "review" && o.state !== "met");
    if (openReview) return { kind: "retry", reason: "obligation-open", fix: `The obligation ${openReview.id} is open again. Meet it, then land again.` };
    // Every check obligation still open on this integration gets a job, advisory ones too (R-EXEC-8, R-OBL-7).
    oweJobs(this, op.id, op.lane, op.generation, integration, op.expectedMain, policy);
    const waiting: `obl_${string}`[] = [];
    for (const o of obligations) {
      // An advisory obligation is neither waited for nor failed by its check (R-OBL-7).
      if (o.kind !== "check" || o.state === "met" || !blocking(o)) continue;
      const failed = evidenceOn(this.sql, op.lane, op.generation).find(
        (e) =>
          e.kind === "check" &&
          (e.body as { obligation: string }).obligation === o.id &&
          e.canonical === integration &&
          !(e.body as { ok: boolean }).ok,
      );
      if (failed) return { kind: "failed", reason: { code: "check-failed", check: failed.act } };
      waiting.push(o.id);
    }
    if (waiting.length) return { kind: "waiting", obligations: waiting };
    const evidence = [...new Set(obligations.filter(blocking).flatMap((o) => o.evidenceActs))];
    if (lane.purpose === "config-recovery") return { kind: "ready", evidence, retained: null };
    const input = this.landInput({ ...op, integration }, lane, gen, policy, "reservation");
    const digest = digestJson(input);
    const r = await this.evaluateLandRules(op.id, integration, input, digest, policy);
    if (r.refusal) return { kind: "failed", reason: { code: "refused", refusal: r.refusal } };
    // ready.landInput is the digest of the retained reservation-stage input (R-LAND-4).
    return { kind: "ready", evidence, retained: r.retained };
  }

  /** The integration's `.artroom/` configuration, read once and kept. */
  private async integrationConfig(integration: Sha): Promise<{ ok: boolean; problems?: string[] }> {
    const kept = json<{ ok: boolean; problems?: string[] }>(one(this.sql, "SELECT body FROM configs WHERE commit_sha = ?", integration), "body");
    if (kept) return kept;
    const cfg = await this.ports.artifacts.readConfig(integration);
    const parsed = this.parseConfig(cfg.policy, cfg.checkers);
    const body = parsed.ok ? { ok: true, policy: parsed.doc ?? null, checkers: parsed.checkers } : { ok: false, problems: [...parsed.problems] };
    this.sql.all("INSERT INTO configs (commit_sha, body) VALUES (?, ?) ON CONFLICT (commit_sha) DO NOTHING", integration, JSON.stringify(body));
    return body;
  }

  /** Land rules at the reservation stage, once per input: the decision is sealed as `land-evaluated` (R-LAND-4). */
  private async evaluateLandRules(
    op: OpId,
    integration: Sha,
    input: ReturnType<RoomCore["landInput"]>,
    digest: Digest,
    policy: ActivePolicyFull,
  ): Promise<{ refusal: Refusal | null; retained: RetainedLandInput | null }> {
    const kept = json<{ refusal: Refusal | null; retained: RetainedLandInput | null }>(one(this.sql, "SELECT body FROM land_evals WHERE op = ? AND digest = ?", op, digest), "body");
    if (kept) return kept;
    const r = await this.ports.policy.land(policy, input, { budget: this.ports.policy.actBudget() });
    this.sql.transaction(() => {
      if (one(this.sql, "SELECT 1 AS x FROM land_evals WHERE op = ? AND digest = ?", op, digest)) return;
      this.retainEvaluations(r.evaluations);
      this.sealSystem({ type: "land-evaluated", op, integration, landInput: r.retained?.digest ?? digest, decisions: r.evaluations.map((e) => e.decision) });
      this.sql.all(
        "INSERT INTO land_evals (op, digest, body) VALUES (?, ?, ?) ON CONFLICT (op, digest) DO NOTHING",
        op,
        digest,
        JSON.stringify({ refusal: r.refusal, decisions: r.evaluations.map((e) => e.decision), retained: r.retained }),
      );
    });
    this.committed();
    return json<{ refusal: Refusal | null; retained: RetainedLandInput | null }>(one(this.sql, "SELECT body FROM land_evals WHERE op = ? AND digest = ?", op, digest), "body")!;
  }

  /**
   * Carry checks onto a new integration (R-CARRY-6 to 14). For each open
   * check obligation, the earlier passing checks of the same obligation and
   * checker on this lane, newest first, are judged until one carries: lane
   * C's platform conditions on the tree, or the scoped checker's filtered
   * snapshot, of both integrations, then the policy's `carry` rules for
   * checks, with one act meter per judgment (R-CARRY-13, R-EVAL-9).
   *
   * Every judgment, carried or not, is sealed as a `check-carried` event in
   * the transaction that stores it, once per earlier check, integration and
   * policy version. A carry counts only with its event, on its integration,
   * under the policy version that judged it: after an activation it is
   * judged again (review a711f7b6).
   *
   * The current runner is the one the active configuration pins, never the
   * earlier check's own value. A checker with no pin never carries
   * (R-CARRY-14).
   */
  async carryChecks(op: LandRecord, integration: Sha, policy: ActivePolicyFull): Promise<void> {
    const gen = generationRow(this.sql, op.lane, op.generation);
    const lane = laneRow(this.sql, op.lane);
    if (!gen || !lane) return;
    const statuses = obligationsFor(this.sql, op.lane, op.generation, { doc: policy.doc, checkers: policy.checkers, integration });
    for (const spec of gen.obligations) {
      if (spec.kind !== "check" || statuses.find((s) => s.id === spec.id)?.state === "met") continue;
      const cfg = policy.checkers[spec.check];
      if (!cfg) continue;
      const judged = (act: ActId) =>
        !!one(this.sql, "SELECT 1 AS x FROM check_judged WHERE lane = ? AND generation = ? AND integration = ? AND obligation = ? AND act = ? AND policy = ?", op.lane, op.generation, integration, spec.id, act, policy.version);
      // Earlier passing checks of this obligation and checker on this lane, on another integration, newest first.
      const candidates = this.sql
        .all("SELECT act FROM evidence WHERE lane = ? AND kind = 'check' AND generation <= ? ORDER BY seq DESC", op.lane, op.generation)
        .map((r) => evidenceByAct(this.sql, str(r, "act")!)!)
        .filter((e) => {
          const b = e.body as { obligation: string; check: string; ok: boolean; integration: Sha };
          return b.ok && b.obligation === spec.id && b.check === spec.check && e.canonical !== integration;
        });
      if (!candidates.length) continue;
      const inputs = checkerInputs(cfg.config.inputs, policy.doc.carry);
      const tree = await this.ports.artifacts.treeOf(integration);
      if (!tree) return;
      const snapshot = inputs ? ((await this.ports.artifacts.snapshot(integration, inputs))?.digest ?? null) : null;
      for (const ev of candidates) {
        // A judgment already sealed under this policy stands; one that carried has met the obligation above.
        if (judged(ev.act)) continue;
        const b = ev.body as CheckBody;
        const evGen = generationRow(this.sql, op.lane, ev.generation);
        const revoked = invalidity(this.sql, ev, policy.doc.retiredEvidence);
        const runner = cfg.config.runner;
        const res = runner
          ? await this.ports.policy.carry(
              policy,
              {
                kind: "carry",
                evidence: { act: ev.act, kind: "check", verdict: null, by: this.policyActor(ev.authority), from: { generation: ev.generation, head: evGen?.head ?? gen.head }, scope: [], dependsOn: [] },
                changedSince: [],
                proposal: this.proposalInput(policy.doc, gen),
                policy: { same: evGen?.policy === policy.version },
              },
              {
                ...(revoked ? { revoked: revoked.reason } : {}),
                // R-CARRY-6, 9, 10, 12, 14: the earlier check's binding against the new integration, under the active configuration.
                check: {
                  before: { integration: b.integration, config: b.config, runner: b.runner, input: b.input },
                  now: { integration, tree, snapshot, config: cfg.digest, runner },
                  volatile: cfg.config.volatile,
                },
              },
              { budget: this.ports.policy.actBudget(), purpose: lane.purpose },
            )
          : { carried: null, notCarried: { act: ev.act, code: "runner-changed" as const, text: "No runner environment is pinned" }, evaluations: [] };
        const carried = res.carried;
        this.sql.transaction(() => {
          if (judged(ev.act)) return;
          this.retainEvaluations(res.evaluations);
          const entry = this.sealSystem({
            type: "check-carried",
            op: op.id,
            lane: op.lane,
            generation: op.generation,
            integration,
            obligation: spec.id,
            act: ev.act,
            policy: policy.version,
            outcome: carried ? { carried: true, reason: carried.reason } : { carried: false, notCarried: res.notCarried! },
            decisions: res.evaluations.map((e) => e.decision),
          });
          const event = idOf(entry);
          this.sql.all(
            "INSERT INTO check_judged (lane, generation, integration, obligation, act, policy, event) VALUES (?, ?, ?, ?, ?, ?, ?)",
            op.lane,
            op.generation,
            integration,
            spec.id,
            ev.act,
            policy.version,
            event,
          );
          if (carried)
            this.sql.all(
              "INSERT INTO check_carries (lane, generation, integration, obligation, act, evidence, policy, event) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (lane, generation, integration, obligation) DO UPDATE SET act = excluded.act, evidence = excluded.evidence, policy = excluded.policy, event = excluded.event",
              op.lane,
              op.generation,
              integration,
              spec.id,
              ev.act,
              JSON.stringify(carried),
              policy.version,
              event,
            );
        });
        this.committed();
        if (carried) break;
      }
    }
  }

  /**
   * Record the filtered snapshot commit of an integration for each scoped
   * checker an open check obligation waits on: what a job for that check is
   * built from, and what a contract-shaped scoped check binds as its
   * `integration` (R-OBL-3, R-CARRY-9; review a711f7b6).
   */
  async recordSnapshots(lane: LaneId, generation: number, integration: Sha, policy: ActivePolicyFull): Promise<void> {
    const gen = generationRow(this.sql, lane, generation);
    if (!gen) return;
    for (const spec of gen.obligations) {
      if (spec.kind !== "check") continue;
      const cfg = policy.checkers[spec.check];
      const inputs = cfg ? checkerInputs(cfg.config.inputs, policy.doc.carry) : null;
      if (!cfg || !inputs) continue;
      if (one(this.sql, "SELECT 1 AS x FROM check_snapshots WHERE integration = ? AND checker = ? AND config = ?", integration, spec.check, cfg.digest)) continue;
      const snap = await this.ports.artifacts.snapshot(integration, inputs);
      if (!snap) continue;
      const { commit } = snapshotCommit(snap.entries, spec.check, snap.digest);
      this.sql.all(
        "INSERT INTO check_snapshots (integration, checker, config, paths, digest, commit_sha) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING",
        integration,
        spec.check,
        cfg.digest,
        canonicalize([...inputs].sort()),
        snap.digest,
        commit,
      );
    }
  }

  /** Ask the engine to evaluate an operation again, after a check, a recomputation or new configuration. Durable. */
  requestEvaluation(op: OpId): void {
    this.sql.all("INSERT INTO land_reeval (op) VALUES (?) ON CONFLICT (op) DO NOTHING", op);
    this.run("landing");
  }

  /** Effects of a system event recorded by the landing engine. Inside its transaction. */
  private afterSystem(event: SystemEvent, entry: LogEntry, act: ActId): void {
    const seq = entry.seq;
    if (event.type === "land-outcome") {
      const op = this.landing.view(event.op);
      const lane = op ? laneRow(this.sql, op.lane) : null;
      const holder = lane?.holder ?? null;
      const target = holder ?? "role:admin";
      if (op && lane) {
        this.attend(target, seq, lane.id, { why: "land-outcome", op: event.op, state: event.outcome.state }, `Landing ${event.op} is ${event.outcome.state}.`);
        if (event.outcome.state === "failed" && event.outcome.reason.code === "conflict")
          this.attend(holder ?? "role:member", seq, lane.id, { why: "recut-needed", lane: lane.id, op: event.op, unheld: holder === null }, "The landing conflicts with main. Recut the lane on the new main.");
      }
      if (event.outcome.state === "landed" && op) {
        const commit = event.outcome.commit;
        this.sql.all("UPDATE generations SET landed = ? WHERE lane = ? AND generation = ?", JSON.stringify({ commit, at: seq }), op.lane, op.generation);
        // R-PUB-9: a landing that changes .artroom/ configuration is followed, at the next seq, by policy-activated.
        const gen = generationRow(this.sql, op.lane, op.generation);
        if (gen && changedPaths(gen.changed).some(isConfigPath)) {
          const integration = op.state === "landed" || op.state === "publishing" || op.state === "unresolved" ? op.integration : commit;
          const cfg = json<{ ok: boolean; policy: AnyPolicyDocument | null; checkers: ActivePolicyFull["checkers"] }>(
            one(this.sql, "SELECT body FROM configs WHERE commit_sha = ?", integration),
            "body",
          );
          if (cfg?.ok) this.activate(cfg.policy ?? this.ports.policy.defaultPolicy(), cfg.checkers, commit, entry.at);
        }
        // Main moved: previews of open proposals are recomputed (R-PROP-7).
        this.sql.all("UPDATE previews SET state = 'pending', body = json_set(body, '$.state', 'pending') WHERE id IN (SELECT p.id FROM previews p JOIN lanes l ON l.id = p.lane AND l.generation = p.generation)");
        this.run("previews");
      }
    } else if (event.type === "revert-lane") {
      // R-REV-6: an unheld lane whose ID is this event's ID.
      const scope = event.scope.length ? [...event.scope] : ["**"];
      // R-DECL-6: a thread of kind `room`. Under a v2 document the room's lease is resolved and recorded now.
      const leaseMs = isDeclared(this.activePolicy().doc) ? this.leaseMs : null; // G2:revert-lease
      // R-DECL-6: a room thread has the conflict mode of the policy in force when it opened.
      const conflict = isDeclared(this.activePolicy().doc) ? this.activePolicy().doc.lanes : null; // G2:revert-conflict
      this.sql.all(
        "INSERT INTO lanes (id, seq, purpose, goal, plan, scope, generation, lease_gen, holder, expires_ms, state, why, handover, revert_of, kind, binding, lease_ms, conflict) VALUES (?, ?, 'ordinary', ?, NULL, ?, 0, 0, NULL, NULL, 'unheld', 'opened-by-room', NULL, ?, 'room', NULL, ?, ?)",
        act,
        seq,
        `Revert the landing of ${event.of}`,
        JSON.stringify(scope),
        event.of,
        leaseMs,
        conflict,
      );
      this.attendAdmins(seq, act, { why: "revert-lane", lane: act, of: event.of }, `The room opened revert lane ${act} for ${event.of}. Any member may take it over.`);
    } else if (event.type === "publication-unresolved") {
      this.attendAdmins(seq, null, { why: "publication-unresolved", op: event.op, since: entry.at }, `Publication of ${event.op} is unresolved since ${entry.at}.`);
    }
  }

  /** Recompute pending previews against main (R-PROP-7). */
  async refreshPreviews(): Promise<void> {
    const pending = this.sql.all("SELECT id, lane, generation, head FROM previews WHERE state = 'pending'");
    if (!pending.length) return;
    const main = await this.ports.artifacts.readMain();
    for (const r of pending) {
      const id = str(r, "id")!;
      let body: Record<string, unknown>;
      try {
        const p = await this.ports.artifacts.preview(str(r, "lane") as LaneId, num(r, "generation")!, str(r, "head") as Sha, main);
        body =
          p.kind === "clean"
            ? { state: "clean", base: p.base, integration: p.integration }
            : { state: "conflict", base: p.base, paths: p.paths };
      } catch (e) {
        this.diagnose("preview-failed", "preview", e);
        body = { state: "failed", error: artroomError("unavailable", "The preview could not be computed.") };
      }
      const prev = json<Record<string, unknown>>(one(this.sql, "SELECT body FROM previews WHERE id = ?", id), "body")!;
      this.sql.all("UPDATE previews SET state = ?, body = ?, main = ?, updated_ms = ? WHERE id = ?", body["state"] as string, JSON.stringify({ ...prev, ...body }), main, this.now(), id);
      // A check obligation open on a clean preview of a generation not yet landed gets a job (R-EXEC-8). Its base is
      // the main commit the preview was built on (R-EXEC-10).
      const lane = str(r, "lane") as LaneId;
      const generation = num(r, "generation")!;
      if (body["state"] === "clean" && !generationRow(this.sql, lane, generation)?.landed)
        oweJobs(this, id as OpId, lane, generation, body["integration"] as Sha, main ?? (body["integration"] as Sha), this.activePolicy());
    }
  }

  // ------------------------------------------------------------ alarm work

  /** R-LANE-8: seal `lease-expired` for every lease past its expiry. */
  async expireLeases(): Promise<number> {
    return this.serial(async () => this.expireDueSync());
  }

  /**
   * Seal `lease-expired` for every lease past its expiry by the room clock
   * now. Synchronous: admission calls it inside the queue before deciding,
   * so no act is judged on a lease that has already run out (R-LANE-8).
   */
  expireDueSync(): number {
    const now = this.now();
    const due = this.sql.all("SELECT id FROM lanes WHERE state = 'held' AND expires_ms <= ?", now).map((r) => str(r, "id") as LaneId);
    for (const id of due) {
      this.sql.transaction(() => {
        const lane = laneRow(this.sql, id);
        if (!lane || lane.state !== "held" || (lane.expiresMs ?? 0) > now) return;
        const entry = this.sealSystem({ type: "lease-expired", lane: id, holder: lane.holder!, leaseGeneration: lane.leaseGen });
        this.sql.all("UPDATE lanes SET state = 'unheld', why = 'expired', holder = NULL, expires_ms = NULL, lease_gen = lease_gen + 1 WHERE id = ?", id);
        this.landing.laneChanged(id, "lease-changed");
        this.attend("role:member", entry.seq, id, { why: "lane-unheld", lane: id, reason: "expired" }, `The lease on ${id} expired. Any member may take the lane over.`);
      });
      this.run("tokens");
    }
    if (due.length) this.committed();
    return due.length;
  }

  /** Is this lease the lane's current one: held, the same generation, and before its deadline by the room clock now? */
  leaseCurrent(laneId: LaneId, leaseGen: number): boolean {
    const l = laneRow(this.sql, laneId);
    return !!l && l.state === "held" && l.leaseGen === leaseGen && (l.expiresMs ?? 0) > this.now();
  }

  /** Workspaces whose lease has ended: release, expiry (sealed or only due), take-over or fencing (R-WS-3). */
  endedWorkspaces(): { lane: LaneId; lease: number }[] {
    return this.sql
      .all("SELECT lane, lease_gen FROM ws_leases WHERE state = 'open'")
      .map((r) => ({ lane: str(r, "lane") as LaneId, lease: num(r, "lease_gen")! }))
      .filter((w) => !this.leaseCurrent(w.lane, w.lease));
  }

  /**
   * End the workspace access of every lease that has ended (R-WS-3, R-LANE-8).
   * Lane B revokes the token it minted for the lease and sweeps the fork.
   */
  async revokeEndedTokens(): Promise<void> {
    for (const w of this.endedWorkspaces()) {
      await this.workspaces.revoke(w.lane, w.lease);
      this.sql.all("UPDATE ws_leases SET state = 'ended' WHERE lane = ? AND lease_gen = ?", w.lane, w.lease);
    }
  }

  /**
   * Provision the workspaces of current leases (lane B's `Workspaces`), then
   * run its due cleanup duties. Durable: a provision interrupted at any point
   * is resumed for the same lease. A lease that ended, or ran past its
   * deadline, is never provisioned; its expiry is sealed and its access
   * ended as durable work (R-WS-2, R-WS-3).
   */
  async resumeWorkspaces(provision = true): Promise<void> {
    if (!this.founded) return;
    for (const r of this.sql.all("SELECT lane, lease_gen FROM ws_leases WHERE state = 'open' ORDER BY rowid")) {
      const laneId = str(r, "lane") as LaneId;
      const leaseGen = num(r, "lease_gen")!;
      if (!this.leaseCurrent(laneId, leaseGen)) {
        this.run("leases");
        this.run("tokens");
        continue;
      }
      if (provision && this.workspaces.view(laneId)?.state === "pending") await this.workspaces.provision(laneId);
      fault("workspace:after-provision");
      // The lease may have ended or run out during provisioning: seal it and end its access now (R-LANE-8, R-WS-3).
      if (!this.leaseCurrent(laneId, leaseGen)) {
        this.run("leases");
        this.run("tokens");
      }
    }
    await this.workspaces.reconcile();
  }

  /** Complete pinned refs that were admitted but not yet written (R-PROP-1 step 2). */
  /**
   * Write every pending pinned ref. With the spike's pin delay on, a pin is
   * written only once due, unless `force` (a read of the proposal, which must
   * find its pinned ref: R-PROP-1).
   */
  async completePins(force = false): Promise<void> {
    for (const r of this.sql.all("SELECT ref, head FROM pins WHERE done = 0")) {
      const ref = str(r, "ref")!;
      if (!force && this.pinDue(ref) > this.now()) continue;
      const m = /^refs\/artroom\/heads\/(.+)\/(\d+)$/.exec(ref)!;
      await this.ports.artifacts.pinRef(m[1] as LaneId, Number(m[2]), str(r, "head") as Sha);
      this.sql.all("UPDATE pins SET done = 1 WHERE ref = ?", ref);
      // Always, so a due time left by the switch is cleaned up even after the switch is unset.
      this.sql.all("DELETE FROM meta WHERE k = ?", `pin_due:${ref}`);
    }
  }

  /** When a pending pin is due: now, unless the spike's pin delay recorded a later time at its propose. */
  pinDue(ref: string): number {
    if (this.pinDelayMs <= 0) return this.now();
    return Number(getMeta(this.sql, `pin_due:${ref}`) ?? this.now());
  }

  /**
   * With the spike's PIN_DELAY_MS on, the earliest due time of a pending pin,
   * or null when none is pending: one aggregate over the pins' due-time rows
   * (`datePendingPins` gives every pending pin one), reading one row per
   * pending pin and never spreading them into a call. With the switch off it
   * is null and reads nothing: scheduling takes the ordinary path.
   */
  nextPinDue(): number | null {
    if (this.pinDelayMs <= 0) return null;
    return num(one(this.sql, "SELECT MIN(CAST(v AS INTEGER)) AS t FROM meta WHERE k >= 'pin_due:' AND k < 'pin_due;'"), "t");
  }

  /**
   * With PIN_DELAY_MS on, give every pending pin that has no due time (one
   * admitted before the switch was set) a due time of now, so `nextPinDue`'s
   * aggregate sees every pending pin. Run when the room starts; writes nothing
   * when every pending pin already has one, and nothing at all with the
   * switch off.
   */
  datePendingPins(): void {
    if (this.pinDelayMs <= 0) return;
    this.sql.all("INSERT INTO meta (k, v) SELECT 'pin_due:' || ref, ? FROM pins WHERE done = 0 ON CONFLICT (k) DO NOTHING", String(this.now()));
  }

  // ------------------------------------------------------------ notify (R-LOG-13)

  /** Queue `notify` for an accepted act. Inside its commit transaction. */
  enqueueNotify(entry: LogEntry, id: ActId, input: Parameters<RoomCore["ports"]["policy"]["notifyContext"]>[0], lane: LaneId | null): void {
    const policy = this.activePolicy();
    const kind = input.act.kind;
    if (!policy.doc.rules.some((r) => r.kind === "notify" && (r.on as readonly string[]).includes(kind))) return;
    const context = this.ports.policy.notifyContext(input, this.notifyDirectory(lane));
    this.sql.all(
      "INSERT INTO notify_queue (seq, entry, policy, context, attempts, next_ms) VALUES (?, ?, ?, ?, 0, ?)",
      entry.seq,
      id,
      policy.version,
      canonicalize(context),
      this.now(),
    );
  }

  /** Evaluate queued notifications and seal one `notified` entry each. A runtime failure leaves it queued. */
  async drainNotify(): Promise<void> {
    await this.serial(async () => {
      const now = this.now();
      const due = this.sql.all("SELECT * FROM notify_queue WHERE next_ms <= ? ORDER BY seq", now);
      for (const row of due) {
        const seq = num(row, "seq")!;
        const policy = this.policyAt(str(row, "policy") as PolicyVersion)!;
        const context = JSON.parse(str(row, "context")!) as Parameters<RoomCore["ports"]["policy"]["notify"]>[1];
        let result: Awaited<ReturnType<RoomCore["ports"]["policy"]["notify"]>>;
        try {
          result = await this.ports.policy.notify(policy, context);
        } catch (e) {
          const attempts = (num(row, "attempts") ?? 0) + 1;
          const wait = Math.min(1000 * 2 ** attempts, 300_000);
          const message = (e as ArtroomError).code === "policy-runtime" ? "policy runtime failure" : "runtime failure";
          this.sql.all("UPDATE notify_queue SET attempts = ?, next_ms = ?, last_error = ? WHERE seq = ?", attempts, this.now() + wait, message, seq);
          continue;
        }
        this.sql.transaction(() => {
          if (!one(this.sql, "SELECT 1 AS x FROM notify_queue WHERE seq = ?", seq)) return;
          const members = new Set<MemberId>();
          for (const n of result.notify) {
            const team = one(this.sql, "SELECT members FROM teams WHERE team = ?", n.to);
            if (team) for (const m of JSON.parse(str(team, "members")!) as MemberId[]) members.add(m);
            else members.add(n.to as MemberId);
          }
          this.retainEvaluations(result.evaluations);
          const entry = this.sealSystem({
            type: "notified",
            entry: str(row, "entry") as ActId,
            decisions: result.evaluations.map((e) => e.decision),
            to: [...members].sort(),
          });
          const lane = str(one(this.sql, "SELECT lane FROM entries WHERE seq = ?", seq), "lane") as LaneId | null;
          for (const n of result.notify)
            this.attend(n.to, entry.seq, lane, { why: "policy", rule: n.rule, act: str(row, "entry")! }, n.why);
          this.sql.all("DELETE FROM notify_queue WHERE seq = ?", seq);
        });
        this.committed();
      }
    });
  }

  nextNotifyMs(): number | null {
    return num(one(this.sql, "SELECT MIN(next_ms) AS t FROM notify_queue"), "t");
  }

  // ------------------------------------------------------------ log publication (R-LOG-8)

  private publisherCache: Promise<PublisherPort> | null = null;
  private publishing = false;

  /** The cohort chosen for the publication in progress, durable until its commit is confirmed. */
  pendingPublication(): StoredPublication | null {
    return json<StoredPublication>(one(this.sql, "SELECT v FROM meta WHERE k = 'pending_publication'"), "v");
  }

  /**
   * A version 1 cohort, upgraded: the exact commit derived by the publisher's
   * serialization from the cohort's recorded parent, entries, checkpoint and
   * retained bytes, and stored before anything else is written. Nothing is
   * inferred from what the ref holds, and the cohort is never discarded.
   */
  private upgradePublication(publisher: PublisherPort, stored: StoredPublication): PendingPublication {
    if (stored.v === 2) return stored;
    const version: unknown = (stored as { v?: unknown }).v;
    if (version !== undefined) throw Object.assign(new Error(`unknown pending publication version ${String(version)}`), { code: "unknown-version" });
    return this.sql.transaction(() => {
      const last = entryAt(this.sql, stored.through);
      if (!last || last.hash !== stored.hash) throw Object.assign(new Error("the pending cohort does not match the log"), { code: "cohort-mismatch" });
      const expected = publisher.commitFor(stored.parent, logSource(this.sql, stored.through), stored.checkpoint, this.retainedRefs(stored.retained));
      const p: PendingPublication = { v: 2, parent: stored.parent, expected, through: stored.through, hash: stored.hash, checkpoint: stored.checkpoint, retained: stored.retained };
      setMeta(this.sql, "pending_publication", JSON.stringify(p));
      return p;
    });
  }

  publishedThrough(): number {
    return Number(getMeta(this.sql, "published_through") ?? "-1");
  }

  /**
   * The first entry after `seq` that is not a `checkpoint` event, or null.
   * Each publication seals a `checkpoint` event that is itself unpublished
   * (R-LOG-8); a suffix of only those never makes the log due, or an idle
   * room would publish its own checkpoint every minute, forever
   * (request 3da1d82b). The next other entry publishes it.
   */
  private firstEntryAfter(seq: number): { readonly seq: number; readonly at: string } | null {
    const r = one(this.sql, "SELECT seq, at FROM entries WHERE seq > ? AND NOT (type = 'system' AND kind = 'checkpoint') ORDER BY seq LIMIT 1", seq);
    return r ? { seq: num(r, "seq")!, at: str(r, "at")! } : null;
  }

  /** The last failed publication's backoff: how many failures in a row, and when to try again. */
  private publicationRetry(): { readonly attempts: number; readonly next: number } | null {
    return json<{ attempts: number; next: number }>(one(this.sql, "SELECT v FROM meta WHERE k = 'publication_retry'"), "v");
  }

  /**
   * The canonical repository is gone: Artifacts answered NOT_FOUND for it
   * (request 3da1d82b). `head` is the log head when that was last seen;
   * only a later entry, or a forced publication, tries again.
   */
  canonicalGone(): { readonly since: string; readonly head: number } | null {
    return json<{ since: string; head: number }>(one(this.sql, "SELECT v FROM meta WHERE k = 'canonical_gone'"), "v");
  }

  /**
   * When publication is next due (room clock), or null when nothing needs
   * it: at 50 unpublished entries, or a minute after the oldest one that is
   * not a `checkpoint` event (R-LOG-8, R-LOG-11). A pending cohort is due at
   * once. After a failure, not before its backoff ends; while the canonical
   * repository is gone, not until a later entry is sealed.
   */
  publicationDueAt(): number | null {
    const pending = this.pendingPublication() !== null;
    const first = this.firstEntryAfter(this.publishedThrough());
    if (!pending && first === null) return null;
    const gone = this.canonicalGone();
    if (gone && this.firstEntryAfter(gone.head) === null) return null;
    const retry = this.publicationRetry();
    if (retry) return retry.next;
    if (pending || this.headSeq() - this.publishedThrough() >= 50) return this.now();
    return Date.parse(first!.at) + 60_000;
  }

  publicationDue(): boolean {
    const at = this.publicationDueAt();
    return at !== null && at <= this.now();
  }

  /**
   * Record a failed publication: the next try waits 5 s, doubling to the cap
   * (budgets.ts `ALARM`), never the 5-second loop. A gone repository also
   * attends the admins once (`repository-gone`).
   */
  private publicationFailed(code: string, gone: boolean): void {
    const retry = this.publicationRetry();
    const attempts = (retry?.attempts ?? 0) + 1;
    const next = this.now() + Math.min(ALARM.pendingIntervalMs * 2 ** (attempts - 1), ALARM.retryBackoffMaxMs);
    const was = getMeta(this.sql, "publication_error");
    if (was !== code) setMeta(this.sql, "publication_error", code);
    setMeta(this.sql, "publication_retry", JSON.stringify({ attempts, next }));
    if (code === "unexpected-writer" && was !== code)
      this.attendAdmins(this.headSeq(), null, { why: "publication-unresolved", op: "op_log", since: iso(this.now()) }, "Another writer moved refs/artroom/log. Publication of the log has stopped.");
    if (gone) {
      const known = this.canonicalGone();
      const since = known?.since ?? iso(this.now());
      setMeta(this.sql, "canonical_gone", JSON.stringify({ since, head: this.headSeq() }));
      if (!known) {
        const loc = this.location();
        this.attendAdmins(
          this.headSeq(),
          null,
          { why: "log-publication-stalled", reason: "repository-gone", detail: `Artifacts answers NOT_FOUND for ${loc.namespace}/${loc.name}.`, since },
          `The canonical repository ${loc.namespace}/${loc.name} is gone. The room has stopped publishing the log and landing; it keeps owed cleanup and tries again after the next act.`,
        );
      }
    }
  }

  /** Does Artifacts answer NOT_FOUND for the canonical repository itself? Any other answer, or none, is not gone. */
  private async canonicalMissing(): Promise<boolean> {
    try {
      await this.artifacts.get(this.location().name);
      return false;
    } catch (e) {
      this.diagnose("publication-failed", "canonicalProbe", e);
      return (e as { code?: unknown } | null)?.code === "NOT_FOUND";
    }
  }

  /**
   * One publication step (R-LOG-8). The cohort (entries through N, the signed
   * checkpoint and the retained files) is chosen once and stored before any
   * remote write. Until its commit is confirmed by the publisher's read-back,
   * every attempt, even after a restart, publishes that same cohort; only then
   * is the `checkpoint` event sealed and `publishedThrough` moved.
   */
  async publish(force = false): Promise<{ readonly through: number; readonly commit: Sha } | null> {
    if (this.publishing) return null;
    this.publishing = true;
    try {
      if (!this.pendingPublication() && this.headSeq() <= this.publishedThrough()) return null;
      // The alarm publishes only when due: never inside a failure's backoff, nor for a gone repository (request 3da1d82b).
      if (!force && !this.publicationDue()) return null;
      let result: Awaited<ReturnType<PublisherPort["publish"]>>;
      let cohort: PendingPublication;
      // Every await before and during the push is inside this handler, so any failure, the registry's included,
      // records the backoff (request 3da1d82b).
      const unbound = artroomError("forbidden", "The registry does not bind this repository to this room; nothing is published.");
      try {
        // R-PUB-10: publish only for the room the registry binds to this repository.
        if (!(await this.isBound())) throw unbound;
        this.publisherCache ??= this.ports.log();
        const publisher = await this.publisherCache;
        // The cohort and its exact commit are fixed and stored before any remote write: the
        // entries through N, the signed checkpoint, the retained files, the confirmed parent, and
        // the commit the publisher's own serialization makes of them (review 8faa2ef9).
        const stored = this.pendingPublication();
        cohort = stored
          ? this.upgradePublication(publisher, stored)
          : this.sql.transaction(() => {
            const n = this.headSeq();
            const through = entryAt(this.sql, n)!;
            const parent = (getMeta(this.sql, "log_commit") as Sha | null) ?? null;
            const cp = checkpoint(this.roomId, this.genesis.roomKey, this.seed(), through, iso(this.now()));
            const digests = this.sql.all("SELECT digest FROM retained ORDER BY digest").map((r) => str(r, "digest") as Digest);
            const expected = publisher.commitFor(parent, logSource(this.sql, n), cp, this.retainedRefs(digests));
            const p: PendingPublication = { v: 2, parent, expected, through: n, hash: through.hash, checkpoint: cp, retained: digests };
            setMeta(this.sql, "pending_publication", JSON.stringify(p));
            return p;
          });
        // Read in batches as the publisher needs them, never the whole log at once (request 5a7290b9).
        const entries = logSource(this.sql, cohort.through);
        const retained = this.retainedRefs(cohort.retained);
        // The Room's own fence: the ref holds the parent it confirmed, or exactly the pending
        // commit (a push whose reply was lost). Anything else, even with the same entries, is
        // another writer, and publication stops; it is never built on (R-LOG-8).
        if (publisher.head !== cohort.parent && publisher.head !== cohort.expected)
          throw Object.assign(new Error("the log ref holds a commit the room did not write"), { code: "unexpected-writer" });
        // A cohort larger than one transfer is staged in bounded parts by lane L, through the log remote's
        // required `stage`, and then pushed with no objects (lane B follow-up revision 3).
        result = await publisher.publish(entries, cohort.checkpoint, retained);
        if (result.commit !== cohort.expected) throw Object.assign(new Error("the publisher confirmed a commit other than the pending one"), { code: "unexpected-writer" });
      } catch (e) {
        // Reopen from the ref next time: the read-back decides what happened.
        this.publisherCache = null;
        const code = publicationCode(e);
        if (e !== unbound) this.diagnose("publication-failed", "publish", e);
        // A NOT_FOUND counts as gone only if the canonical repository itself is not found.
        const gone = code === "NOT_FOUND" && (await this.canonicalMissing());
        await this.serial(async () => this.sql.transaction(() => this.publicationFailed(code, gone)));
        // Wake subscriptions: the admins' item is new even though no entry is.
        this.committed();
        if (e === unbound) throw unbound;
        throw artroomError("unavailable", `The log could not be published (${code}); the same cohort is retried.`);
      }
      const done = cohort;
      await this.serial(async () =>
        this.sql.transaction(() => {
          const now = this.pendingPublication();
          if (!now || now.through !== done.through) return;
          this.sealSystem({ type: "checkpoint", through: done.through, hash: done.hash, commit: result.commit });
          setMeta(this.sql, "published_through", String(done.through));
          setMeta(this.sql, "log_commit", result.commit);
          this.sql.all("DELETE FROM meta WHERE k IN ('pending_publication', 'publication_error', 'publication_retry', 'canonical_gone')");
        }),
      );
      this.committed();
      return { through: done.through, commit: result.commit };
    } finally {
      this.publishing = false;
    }
  }

  /** The retained files by digest; each body is read only if the publisher needs its bytes. */
  private retainedRefs(digests: readonly Digest[]): RetainedRef[] {
    return digests.map((d) => {
      const kind = str(one(this.sql, "SELECT kind FROM retained WHERE digest = ?", d)!, "kind");
      const load = () => str(one(this.sql, "SELECT body FROM retained WHERE digest = ?", d)!, "body")!;
      return { kind: kind === "input" ? ("input" as const) : ("policy" as const), digest: d, load };
    });
  }

  // ------------------------------------------------------------ durable alarm work

  /**
   * The Room's one mechanism for work after a commit. Each step reads its own
   * durable rows, is idempotent, and may run at any time; the alarm runs them
   * all, and `run` starts one at once. Nothing depends on a promise surviving.
   */
  readonly steps = {
    leases: () => this.expireLeases().then(() => undefined),
    notify: () => this.drainNotify(),
    tokens: async (due: LoopDue = this.loopAllowed) => {
      if (due("tokens")) await this.revokeEndedTokens();
    },
    pins: async (due: LoopDue = this.loopAllowed) => {
      if (due("pins")) await this.completePins();
    },
    previews: async (due: LoopDue = this.loopAllowed) => {
      if (due("previews")) await this.refreshPreviews();
    },
    workspaces: (due: LoopDue = this.loopAllowed) => this.resumeWorkspaces(due("provision")),
    recompute: async (due: LoopDue = this.loopAllowed) => {
      if (due("recompute")) await this.recompute();
    },
    landing: async (due: LoopDue = this.loopAllowed) => {
      if (due("landing")) await this.resumeLanding();
    },
    jobs: () => issueJobs(this),
    // Ended check job tokens owed revocation (mint lane C): a bounded pass, started and never awaited.
    jobTokens: async (due: LoopDue = this.loopAllowed) => {
      if (due("jobTokens")) revokeJobTokens(this);
    },
    snapshots: async () => {
      if (this.founded) await this.snapshotRepos.reconcile();
    },
    abort: () => this.landing.enforceAbort().then(() => undefined),
    publication: () => this.publish().then(() => undefined),
    // Its own kind of loop work: `due` is that kind's fence after a failure of the step itself (request 3da1d82b);
    // the ledger's own durable due times are checked inside, at execution.
    mints: async (due: LoopDue = this.loopAllowed) => {
      if (due("mints")) await this.reconcileMints();
    },
    // The forks' read-token ledger (request 02836f9a): its own kind of loop work, fenced like the canonical ledger's; the
    // ledger's own durable due times are checked inside. Forks are not the canonical repository: it runs while that is gone.
    forkTokens: async (due: LoopDue = this.loopAllowed) => {
      if (this.founded && due("forkTokens")) await this.workspaces.forkTokens.reconcile();
    },
    // The one-time upgrade of error fields stored before request d29c09fa: one bounded batch per run.
    errors: async () => this.scrubErrors(),
  } as const;

  /** Start one durable step now, in the background. A commit's own work is not held back by an earlier failure's backoff. */
  run(step: keyof RoomCore["steps"]): void {
    this.kick(`step:${step}`, () => this.steps[step]());
  }

  /**
   * Run every durable step once, in order. Loop work whose backoff has not
   * ended is skipped, while every other due step still runs; afterwards each
   * kind's backoff is set or cleared (`loopSettled`). A failure that is not
   * an `ArtroomError` is logged under the step's name (requests d268d249,
   * 3da1d82b); a step that already logged its own failure throws an
   * `ArtroomError`.
   */
  async runAll(): Promise<void> {
    const backoff = this.loopBackoff();
    const now = this.now();
    const attempted = new Set<LoopKind>();
    const failed = new Set<LoopKind>();
    const due: LoopDue = (kind) => {
      const ok = this.loopAllowed(kind) && (backoff[kind]?.next ?? 0) <= now;
      if (ok) attempted.add(kind);
      return ok;
    };
    for (const step of Object.keys(this.steps) as (keyof RoomCore["steps"])[]) {
      const before = new Set(attempted);
      this.landingReached = false;
      await this.steps[step](due).catch((e: unknown) => {
        if (!isArtroomError(e)) this.diagnose("step-failed", step, e);
        // The landing engine times its own retries: only a failure before it ran backs the step off.
        for (const k of attempted) if (!before.has(k) && !(k === "landing" && this.landingReached)) failed.add(k);
      });
    }
    this.loopSettled(attempted, failed);
  }

  /** Set once `resumeLanding` has passed its checks and reached the engine, for `runAll`. */
  private landingReached = false;

  /** Evaluations asked for (after a check, a recomputation), then the engine's own work (R-PUB-7 first). */
  async resumeLanding(): Promise<void> {
    if (!this.founded) return;
    // R-PUB-10: canonical write tokens are minted, and main is pushed, only for the bound room. Not bound, or the
    // registry not answering, is a failure: the step backs off instead of running again at once (request 3da1d82b).
    if (!(await this.isBound())) throw artroomError("forbidden", "The registry does not bind this repository to this room; nothing lands.");
    await this.canonicalRemoteReady();
    this.landingReached = true;
    // An abort attempt is carried out at once, even while a push is in flight (R-REV-5): not behind the engine's queue.
    await this.landing.enforceAbort();
    for (const r of this.sql.all("SELECT op FROM land_reeval ORDER BY rowid")) {
      const op = str(r, "op") as OpId;
      await this.landing.evaluate(op);
      this.sql.all("DELETE FROM land_reeval WHERE op = ?", op);
    }
    await this.landing.reconcile();
  }

  /**
   * The canonical mint ledger's alarm work (R-MINT-7): move the takeover
   * time ahead while a request or token is in flight, start a revocation
   * pass if one is due (not awaited), and observe if due (bounded). Each
   * honours its own durable due time, so an alarm that runs early for other
   * work does nothing here, and an idle room writes nothing.
   */
  async reconcileMints(): Promise<void> {
    if (this.founded) await this.mints.reconcile();
  }

  /**
   * One batch of the upgrade migration 2 started (request d29c09fa): at most
   * `SCRUB_BATCH` rows of one table, in one transaction with its cursor. The
   * last batch deletes the cursor; with none stored this reads one meta row
   * and writes nothing.
   */
  scrubErrors(): void {
    const stored = getMeta(this.sql, "error_scrub");
    if (stored === null) return;
    this.sql.transaction(() => {
      const next = scrubBatch(this.sql, ROOM_SCRUB_TABLES, JSON.parse(stored) as ScrubCursor);
      if (next) setMeta(this.sql, "error_scrub", JSON.stringify(next));
      else this.sql.all("DELETE FROM meta WHERE k = 'error_scrub'");
    });
  }

  /**
   * May this kind of loop work run at all? Work that needs the canonical
   * repository (pins, previews, provisioning, landing and its evaluations,
   * the mint ledger's revocations and observations, ended job tokens'
   * revocations) waits, kept, while it is gone: it cannot succeed (request
   * 3da1d82b).
   */
  readonly loopAllowed: LoopDue = (kind) => !(NEEDS_REPOSITORY.has(kind) && this.canonicalGone() !== null);

  /** Each kind of loop work's backoff: failures in a row, and when it may run again (room clock). */
  loopBackoff(): Partial<Record<LoopKind, { readonly attempts: number; readonly next: number }>> {
    const v = getMeta(this.sql, "loop_backoff");
    let parsed: unknown = null;
    try {
      parsed = v === null ? null : JSON.parse(v);
    } catch {
      parsed = null;
    }
    // A single count, from before backoff was kept for each kind, is dropped: every kind is due.
    return parsed !== null && typeof parsed === "object" ? (parsed as Partial<Record<LoopKind, { attempts: number; next: number }>>) : {};
  }

  /** The kinds of loop work that are pending now. Landing's own work is timed by the engine, and the mint ledger's by the ledger (`nextAlarm`). */
  loopPendingKinds(pinDue: number | null = this.nextPinDue()): Set<LoopKind> {
    const kinds = new Set<LoopKind>();
    if (this.endedWorkspaces().length > 0) kinds.add("tokens");
    // A pin is loop work once due: with the switch off, any pending pin (a bounded existence check, which stops at
    // the first one); with the spike's PIN_DELAY_MS on, once its recorded due time has come (`pinDue`, computed once
    // by the caller, or here).
    if (this.pinDelayMs <= 0) {
      if (one(this.sql, "SELECT 1 AS x FROM pins WHERE done = 0 LIMIT 1")) kinds.add("pins");
    } else if (pinDue !== null && pinDue <= this.now()) kinds.add("pins");
    if (one(this.sql, "SELECT 1 AS x FROM previews WHERE state = 'pending'")) kinds.add("previews");
    if (one(this.sql, "SELECT 1 AS x FROM generations WHERE recompute IS NOT NULL")) kinds.add("recompute");
    if (one(this.sql, "SELECT 1 AS x FROM land_reeval")) kinds.add("landing");
    try {
      if (this.founded && one(this.sql, "SELECT 1 AS x FROM ws_leases w JOIN artroom_ws a ON a.lane = w.lane AND a.lease = w.lease_gen WHERE w.state = 'open' AND a.state = 'pending'"))
        kinds.add("provision");
    } catch {
      // lane B's tables are made with its first use
    }
    return kinds;
  }

  /**
   * After an alarm's work: each kind it ran that failed, or left its work
   * pending, waits 5 s, doubling to the cap (budgets.ts `ALARM`); a kind that
   * succeeded, or has nothing left, is cleared. Writes nothing when no
   * backoff changes.
   */
  loopSettled(attempted: ReadonlySet<LoopKind>, failed: ReadonlySet<LoopKind>): void {
    const backoff = { ...this.loopBackoff() };
    const pending = this.loopPendingKinds();
    const now = this.now();
    // A stored value with no kinds in it (the single count kept before) is removed.
    let changed = getMeta(this.sql, "loop_backoff") !== null && Object.keys(backoff).length === 0;
    for (const kind of LOOP_KINDS) {
      const stalled = attempted.has(kind) && (failed.has(kind) || pending.has(kind));
      if (stalled) {
        const attempts = (backoff[kind]?.attempts ?? 0) + 1;
        backoff[kind] = { attempts, next: now + Math.min(ALARM.pendingIntervalMs * 2 ** (attempts - 1), ALARM.retryBackoffMaxMs) };
        changed = true;
      } else if (backoff[kind] && (attempted.has(kind) || (!SELF_TIMED.has(kind) && !pending.has(kind)))) {
        // Run and succeeded, or its work was done meanwhile (a commit's own run). Landing's due time is the engine's,
        // and the mint ledger's its own, so their backoff ends only when they run.
        delete backoff[kind];
        changed = true;
      }
    }
    if (!changed) return;
    if (Object.keys(backoff).length === 0) this.sql.all("DELETE FROM meta WHERE k = 'loop_backoff'");
    else setMeta(this.sql, "loop_backoff", JSON.stringify(backoff));
  }

  /** When the alarm should next run, or null. */
  nextAlarm(): number | null {
    const times: number[] = [];
    const now = this.now();
    const gone = this.canonicalGone() !== null;
    const lease = num(one(this.sql, "SELECT MIN(expires_ms) AS t FROM lanes WHERE state = 'held'"), "t");
    if (lease !== null) times.push(lease);
    const notify = this.nextNotifyMs();
    if (notify !== null) times.push(notify);
    // The landing engine needs the canonical repository: while it is gone, its work is kept, not scheduled.
    // After a failure before the engine ran (the registry, say), not before the step's backoff ends.
    const backoff = this.loopBackoff();
    const landing = gone ? null : this.landing.nextDue();
    if (landing !== null) times.push(Math.max(landing, backoff.landing?.next ?? landing));
    // The canonical mint ledger: the takeover time while anything is in flight, owed revocations and the next
    // observation; a still-future time as it is, overdue work 1 s ahead, never sooner (R-MINT-7). It too needs the
    // canonical repository, and after a failure of its step waits for that step's backoff.
    const mints = gone ? null : this.mints.nextDue();
    if (mints !== null) times.push(Math.max(mints, backoff.mints?.next ?? mints));
    // Lane B's workspace duties: cleanup owed, and checks on unanswered remote steps, on their capped backoff.
    let ws: Workspaces | null = null;
    try {
      ws = this.founded ? this.workspaces : null;
    } catch {
      ws = null;
    }
    const wsDue = ws?.nextDue() ?? null;
    if (wsDue !== null) times.push(wsDue);
    // The forks' read-token ledger (request 02836f9a), as the canonical one: the takeover time while anything is in
    // flight, owed revocations and the next fork observation, overdue work 1 s ahead; after a failure of its step, not
    // before that step's backoff ends.
    const forkTokens = ws?.forkTokens.nextDue() ?? null;
    if (forkTokens !== null) times.push(Math.max(forkTokens, backoff.forkTokens?.next ?? forkTokens));
    // Snapshot repositories' durable duties: unknown creates, deletions and revocations (R-CARRY-16).
    let snap: number | null = null;
    try {
      snap = this.founded ? this.snapshotRepos.nextDue() : null;
    } catch {
      snap = null;
    }
    if (snap !== null) times.push(snap);
    // Check jobs owed, and jobs sent whose deadline passed with no answer; a batch left over 1 s ahead.
    const job = jobsDue(this);
    if (job !== null) times.push(job);
    // Ended job tokens whose revocation Artifacts has not confirmed yet: their own kind, which needs the canonical
    // repository and waits for its backoff after a failure of its step (mint lane C); a backlog 1 s ahead.
    const revoke = gone ? null : jobTokensDue(this);
    if (revoke !== null) times.push(Math.max(revoke, backoff.jobTokens?.next ?? revoke));
    // A pin the spike's PIN_DELAY_MS left for later (assert 66a41558) is a due time, under the pins loop's fence and
    // backoff. Read once, and only with the switch on (null otherwise, with no read).
    const pinDue = this.nextPinDue();
    // The 5-second loop, while its work makes progress; each kind on its own backoff after a failure (budgets.ts `ALARM`).
    for (const kind of this.loopPendingKinds(pinDue)) if (this.loopAllowed(kind)) times.push(backoff[kind]?.next ?? now + ALARM.pendingIntervalMs);
    if (pinDue !== null && pinDue > now && this.loopAllowed("pins")) times.push(Math.max(pinDue, backoff.pins?.next ?? pinDue));
    // The error upgrade (request d29c09fa), until its last batch.
    const scrub = this.scrubDue();
    if (scrub !== null) times.push(scrub);
    // Log publication: when due, never sooner than the loop's interval from now.
    const publication = this.publicationDueAt();
    if (publication !== null) times.push(Math.max(publication, now + ALARM.pendingIntervalMs));
    return times.length ? Math.min(...times) : null;
  }

  /** A held member key's seed, for room-custody acts. Never returned to a caller. */
  heldSeed(key: KeyId): Uint8Array | null {
    const s = str(one(this.sql, "SELECT seed FROM held_keys WHERE key = ?", key), "seed");
    return s ? unb64url(s) : null;
  }
}
