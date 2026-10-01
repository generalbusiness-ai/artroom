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
  ActId,
  CheckBody,
  ArtroomError,
  Authority,
  Carried,
  Checkpoint,
  CheckerConfig,
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
  PolicyDocument,
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
import { checkConditions, checkerInputs, ownersFor } from "@generalbusiness/artroom-policy";
import { canonicalize, parseStrict } from "./canonical.ts";
import { b64url, digestJson, keyPairFromSeed, unb64url, verify } from "./crypto.ts";
import { artroomError } from "./errors.ts";
import { iso, roomIdOf } from "./ids.ts";
import { checkpoint, entriesAfter, entryAt, idOf, seal } from "./log.ts";
import { changedPaths, evidenceByAct, evidenceOn, generationRow, laneRow, type GenerationRow, type LaneRow } from "./model.ts";
import { adminObligation, invalidity, latestReviews, obligationsFor, qualification, statusesOf, transitions } from "./obligations.ts";
import type { ActivePolicy, Evaluation, LandingHost, LandRecord, ObligationSpec, Ports, PublisherPort, Readiness, Remotes, RetainedFile, RoomServices, Sql } from "./ports.ts";
import { ContainerPublisher, Landing, Workspaces, canonicalTokens } from "@generalbusiness/artroom-git";
import { LogPublisher } from "@generalbusiness/artroom-log";
import { ArtifactsAdapter, locate, type RepoLocation } from "./artifacts.ts";
import { activeAdmins, activeMembers, teamsOf } from "./roster.ts";
import { createSchema, getMeta, head, headSeq, json, num, one, retain, setMeta, str } from "./store.ts";
import { judge } from "./authority.ts";
import { matchGlob } from "./glob.ts";

export interface CoreOptions {
  readonly sql: Sql;
  readonly services: RoomServices;
  readonly clock: () => number;
  /** Lease length in milliseconds (R-LANE-5). */
  readonly leaseMs: number;
  /** Keep a promise alive after the response (`ctx.waitUntil`). */
  readonly defer: (p: Promise<unknown>) => void;
  /** Called after every commit that sealed entries: wake subscribers, reschedule the alarm. */
  readonly committed: () => void;
  /** Does the registry bind this repository to this room ID and name (R-GEN-13)? */
  readonly bound: (repo: string, room: RoomId, name: string) => Promise<boolean>;
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

let faultHook: ((point: string) => void) | null = null;

/** Tests only: throw at a named point inside a write, as a crash would. */
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
  readonly defer: (p: Promise<unknown>) => void;
  readonly committed: () => void;
  readonly bound: CoreOptions["bound"];
  readonly remotes: Remotes;
  /** Lane B's landing engine, on this room's SQLite. */
  readonly landing: Landing;
  private wsCache: Workspaces | null = null;
  /** The repository identity while `found` runs, before the genesis is stored. */
  private foundingRepo: string | null = null;
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
    this.clock = opts.clock;
    this.leaseMs = opts.leaseMs;
    this.defer = opts.defer;
    this.bound = opts.bound;
    this.committed = () => {
      opts.committed();
      for (const w of [...this.waiters]) w();
    };
    createSchema(this.sql);
    const r = this.remotes;
    const sleep = r.sleep ? { sleep: r.sleep } : {};
    const adapter = new ArtifactsAdapter({ binding: r.artifacts, stub: r.publisher, location: () => this.location(), ...(r.bounds ? { bounds: r.bounds } : {}), ...sleep });
    this.ports = {
      policy: opts.services.policy,
      artifacts: r.wrapArtifacts ? r.wrapArtifacts(adapter) : adapter,
      log: async () => LogPublisher.open(await r.logRemote(this.location())),
    };
    // The canonical repository, read when used: a room learns it at founding.
    const self = this;
    const canonical = {
      get name() {
        return self.location().name;
      },
      get remote() {
        return getMeta(self.sql, "canonical_remote") ?? "";
      },
    };
    this.landing = new Landing({
      sql: this.sql,
      room: this.host(),
      publisher: new ContainerPublisher({ stub: r.publisher, artifacts: r.artifacts, canonical, ...sleep }),
      tokens: canonicalTokens(() => r.artifacts.get(this.location().name), sleep),
      now: () => this.now(),
      ...(r.landingFault ? { fault: r.landingFault } : {}),
    });
  }

  /** The room's repository in this deployment's Artifacts namespace (R-GEN-12). */
  location(): RepoLocation {
    const identity = this.foundingRepo ?? (this.founded ? this.genesis.repo : null);
    const loc = identity ? locate(identity, this.remotes.namespace) : null;
    if (!loc) throw artroomError("unavailable", identity ? "This deployment has no Artifacts binding for the room's repository namespace." : "This room has not been founded.");
    return loc;
  }

  /** Lane B's workspaces (forks and lease tokens), on this room's SQLite. */
  get workspaces(): Workspaces {
    if (!this.wsCache) {
      const loc = this.location();
      this.wsCache = new Workspaces({
        sql: this.sql,
        artifacts: this.remotes.artifacts,
        canonical: loc.name,
        namespace: loc.namespace,
        now: () => this.now(),
        ...(this.remotes.sleep ? { sleep: this.remotes.sleep } : {}),
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
    let doc: PolicyDocument = this.ports.policy.defaultPolicy();
    let checkers: ActivePolicyFull["checkers"] = {};
    let main: Sha | null = null;
    let remote: string;
    this.foundingRepo = genesis.repo;
    try {
      if (!genesis.onboarding) await this.ports.artifacts.createRepo();
      main = await this.ports.artifacts.readMain();
      remote = await this.ports.artifacts.canonicalRemote();
    } catch {
      this.foundingRepo = null;
      throw artroomError("unavailable", "The canonical repository could not be created or read. Retry the same found.");
    }
    if (main !== null) {
      const cfg = await this.ports.artifacts.readConfig(main).catch(() => {
        this.foundingRepo = null;
        throw artroomError("unavailable", "The canonical repository could not be read. Try again.");
      });
      const parsed = this.parseConfig(cfg.policy, cfg.checkers);
      if (!parsed.ok) {
        this.foundingRepo = null;
        throw artroomError("bad-request", `The policy on main is invalid: ${parsed.problems[0]}`);
      }
      if (parsed.doc) doc = parsed.doc;
      checkers = parsed.checkers;
    }
    this.sql.transaction(() => {
      if (this.founded) return;
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
    this.foundingRepo = null;
    if (main !== null) await this.landing.refreshMain().catch(() => undefined);
    this.committed();
    return this.roomId;
  }

  /** Parse `.artroom/` files strictly and validate them (R-POL-1). `doc` is null when there is no policy file. */
  parseConfig(
    policyText: string | null,
    checkerTexts: Readonly<Record<string, string>>,
  ): { readonly ok: true; readonly doc: PolicyDocument | null; readonly checkers: ActivePolicyFull["checkers"] } | { readonly ok: false; readonly problems: readonly string[] } {
    let doc: PolicyDocument | null = null;
    if (policyText !== null) {
      let raw: unknown;
      try {
        raw = parseStrict(policyText);
      } catch (e) {
        return { ok: false, problems: [`.artroom/policy.json is not valid JSON: ${(e as Error).message}`] };
      }
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

  // ------------------------------------------------------------ policy

  /** The pinned, immutable active policy and its version (R-POL-9). */
  activePolicy(): ActivePolicyFull {
    const version = getMeta(this.sql, "policy") as PolicyVersion;
    return this.policyAt(version)!;
  }

  policyAt(version: PolicyVersion): ActivePolicyFull | null {
    const r = one(this.sql, "SELECT * FROM policies WHERE version = ?", version);
    if (!r) return null;
    return {
      version,
      doc: Object.freeze(JSON.parse(str(r, "doc")!)) as PolicyDocument,
      digest: str(r, "digest") as Digest,
      checkers: JSON.parse(str(r, "checkers")!) as ActivePolicyFull["checkers"],
    };
  }

  /** Seal `policy-activated` and make it active. Synchronous; inside a transaction (R-POL-9, R-PUB-9). */
  activate(doc: PolicyDocument, checkers: ActivePolicyFull["checkers"], commit: Sha | null, at: string): ActId {
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
      for (const o of r.obligations) if (!specs.some((s) => s.id === o.id)) specs.push(o);
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

  policyLane(lane: LaneRow | null): PolicyLane {
    if (!lane) return { id: null, claimed: false, holder: null, scope: [], generation: 0, purpose: "ordinary" };
    return { id: lane.id, claimed: lane.state === "held", holder: lane.holder, scope: lane.scope, generation: lane.generation, purpose: lane.purpose };
  }

  policyRoom(): PolicyRoom {
    return { admins: activeAdmins(this.sql).length, members: activeMembers(this.sql).length };
  }

  proposalInput(doc: PolicyDocument, g: Pick<GenerationRow, "generation" | "head" | "base" | "changed">): PolicyProposal {
    const paths = changedPaths(g.changed);
    return { generation: g.generation, head: g.head, base: g.base, changed: g.changed, paths, owners: ownersFor(doc, paths) };
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
    const j = judge(this.sql, env, "submitted", this.now());
    if (!j.ok) return { reason: "authority-lost", fix: `The land initiator's authority is no longer current (${j.refusal.rule}). Land again with current authority.` };
    const lane = laneRow(this.sql, op.lane);
    if (lane?.purpose === "config-recovery" && !(j.authority.via === "member" && j.authority.role === "admin"))
      return { reason: "authority-lost", fix: "Only an active admin may land a configuration-recovery lane (R-ADMIN-8)." };
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
    if (obligations.some((o) => o.kind === "review" && o.state !== "met"))
      return { reason: "obligation-open", fix: "A review obligation is open again. Meet it, then land again." };
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
      obligations: obligations.map((o) => ({ id: o.id, met: o.state === "met" })),
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
    const obligations = obligationsFor(this.sql, op.lane, op.generation, { doc: policy.doc, checkers: policy.checkers, integration });
    const openReview = obligations.find((o) => o.kind === "review" && o.state !== "met");
    if (openReview) return { kind: "retry", reason: "obligation-open", fix: `The obligation ${openReview.id} is open again. Meet it, then land again.` };
    const waiting: `obl_${string}`[] = [];
    for (const o of obligations) {
      if (o.kind !== "check" || o.state === "met") continue;
      const failed = evidenceOn(this.sql, op.lane, op.generation).find(
        (e) => e.kind === "check" && (e.body as { obligation: string; integration: string; ok: boolean }).obligation === o.id && (e.body as { integration: string }).integration === integration && !(e.body as { ok: boolean }).ok,
      );
      if (failed) return { kind: "failed", reason: { code: "check-failed", check: failed.act } };
      waiting.push(o.id);
    }
    if (waiting.length) return { kind: "waiting", obligations: waiting };
    const evidence = [...new Set(obligations.flatMap((o) => o.evidenceActs))];
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
   * Carry checks onto a new integration (R-CARRY-6 to 10): for each open
   * check obligation, an earlier check of the same obligation and checker on
   * this lane counts here if policy's `carry` keeps it, judged on the tree,
   * or the filtered snapshot for a scoped checker, of both integrations.
   */
  async carryChecks(op: LandRecord, integration: Sha, policy: ActivePolicyFull): Promise<void> {
    const gen = generationRow(this.sql, op.lane, op.generation);
    if (!gen || !policy.doc.carry.checks) return;
    // Policy `carry` rules may only stop evidence carrying, and there is no event to seal a check's carry decision
    // in (contract gap): with any carry rule in force, checks do not carry and rerun instead.
    if (policy.doc.rules.some((r) => r.kind === "carry")) return;
    const statuses = obligationsFor(this.sql, op.lane, op.generation, { doc: policy.doc, checkers: policy.checkers, integration });
    for (const spec of gen.obligations) {
      if (spec.kind !== "check" || statuses.find((s) => s.id === spec.id)?.state === "met") continue;
      const cfg = policy.checkers[spec.check];
      if (!cfg) continue;
      // Earlier passing checks of this obligation and checker on this lane, on another integration, newest first.
      const candidates = this.sql
        .all("SELECT * FROM evidence WHERE lane = ? AND kind = 'check' AND generation <= ? ORDER BY seq DESC", op.lane, op.generation)
        .map((r) => evidenceByAct(this.sql, str(r, "act")!)!)
        .filter((e) => {
          const b = e.body as { obligation: string; check: string; ok: boolean; integration: string };
          return b.ok && b.obligation === spec.id && b.check === spec.check && b.integration !== integration;
        });
      if (!candidates.length) continue;
      const inputs = checkerInputs(cfg.config.inputs, policy.doc.carry);
      const tree = await this.ports.artifacts.treeOf(integration);
      if (!tree) return;
      const snapshot = inputs ? ((await this.ports.artifacts.snapshot(integration, inputs))?.digest ?? null) : null;
      for (const ev of candidates) {
        const b = ev.body as CheckBody;
        const evGen = generationRow(this.sql, op.lane, ev.generation);
        const revoked = invalidity(this.sql, ev, policy.doc.retiredEvidence);
        const input = {
          kind: "carry" as const,
          evidence: { act: ev.act, kind: "check" as const, verdict: null, by: this.policyActor(ev.authority), from: { generation: ev.generation, head: evGen?.head ?? gen.head }, scope: [], dependsOn: [] },
          changedSince: [],
          proposal: this.proposalInput(policy.doc, gen),
          policy: { same: evGen?.policy === policy.version },
        };
        // R-CARRY-6, 9, 10, 12: the earlier check's binding against the new integration, under the active configuration.
        const facts = {
          revoked: revoked?.reason ?? null,
          check: {
            before: { integration: b.integration, config: b.config, runner: b.runner, input: b.input },
            now: { integration, tree, snapshot, config: cfg.digest, runner: b.runner },
            volatile: cfg.config.volatile,
          },
        };
        const platform = checkConditions(input, policy.doc, facts);
        if (!platform.carries) continue;
        const basis = platform.basis;
        if (basis.code === "paths-unchanged") continue;
        const text = basis.code === "tree-identical" ? "carried: the integration's tree is identical" : "carried: the filtered snapshot is identical";
        const carried: Carried = { basis: "carried", act: ev.act, kind: "check", from: input.evidence.from, reason: { ...basis, text } as Carried["reason"], rules: [] };
        this.sql.all(
          "INSERT INTO check_carries (lane, generation, integration, obligation, act, evidence) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING",
          op.lane,
          op.generation,
          integration,
          spec.id,
          ev.act,
          JSON.stringify(carried),
        );
        break;
      }
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
          const cfg = json<{ ok: boolean; policy: PolicyDocument | null; checkers: ActivePolicyFull["checkers"] }>(
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
      this.sql.all(
        "INSERT INTO lanes (id, seq, purpose, goal, plan, scope, generation, lease_gen, holder, expires_ms, state, why, handover, revert_of) VALUES (?, ?, 'ordinary', ?, NULL, ?, 0, 0, NULL, NULL, 'unheld', 'opened-by-room', NULL, ?)",
        act,
        seq,
        `Revert the landing of ${event.of}`,
        JSON.stringify(scope),
        event.of,
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
            ? { state: "clean", base: p.base, ...(p.integration ? { integration: p.integration } : {}) }
            : { state: "conflict", base: p.base, paths: p.paths };
      } catch {
        body = { state: "failed", error: artroomError("unavailable", "The preview could not be computed.") };
      }
      const prev = json<Record<string, unknown>>(one(this.sql, "SELECT body FROM previews WHERE id = ?", id), "body")!;
      this.sql.all("UPDATE previews SET state = ?, body = ?, main = ?, updated_ms = ? WHERE id = ?", body["state"] as string, JSON.stringify({ ...prev, ...body }), main, this.now(), id);
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

  /** End the workspace access of every lease that has ended: lane B revokes its token and sweeps the fork (R-WS-3, R-LANE-8). */
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
  async resumeWorkspaces(): Promise<void> {
    if (!this.founded) return;
    for (const r of this.sql.all("SELECT lane, lease_gen FROM ws_leases WHERE state = 'open' ORDER BY rowid")) {
      const laneId = str(r, "lane") as LaneId;
      const leaseGen = num(r, "lease_gen")!;
      if (!this.leaseCurrent(laneId, leaseGen)) {
        this.run("leases");
        this.run("tokens");
        continue;
      }
      if (this.workspaces.view(laneId)?.state === "pending") await this.workspaces.provision(laneId);
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
  async completePins(): Promise<void> {
    for (const r of this.sql.all("SELECT ref, head FROM pins WHERE done = 0")) {
      const m = /^refs\/artroom\/heads\/(.+)\/(\d+)$/.exec(str(r, "ref")!)!;
      await this.ports.artifacts.pinRef(m[1] as LaneId, Number(m[2]), str(r, "head") as Sha);
      this.sql.all("UPDATE pins SET done = 1 WHERE ref = ?", str(r, "ref")!);
    }
  }

  // ------------------------------------------------------------ notify (R-LOG-13)

  /** Queue `notify` for an accepted act. Inside its commit transaction. */
  enqueueNotify(entry: LogEntry, id: ActId, input: Parameters<RoomCore["ports"]["policy"]["notifyContext"]>[0], lane: LaneId | null): void {
    const policy = this.activePolicy();
    const kind = input.act.kind;
    if (!policy.doc.rules.some((r) => r.kind === "notify" && r.on.includes(kind))) return;
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
      const entries = entriesAfter(this.sql, -1, stored.through + 1);
      const last = entries[entries.length - 1];
      if (!last || last.seq !== stored.through || last.hash !== stored.hash) throw Object.assign(new Error("the pending cohort does not match the log"), { code: "cohort-mismatch" });
      const expected = publisher.commitFor(stored.parent, entries, stored.checkpoint, this.retainedFiles(stored.retained));
      const p: PendingPublication = { v: 2, parent: stored.parent, expected, through: stored.through, hash: stored.hash, checkpoint: stored.checkpoint, retained: stored.retained };
      setMeta(this.sql, "pending_publication", JSON.stringify(p));
      return p;
    });
  }

  /** Publication is due at 50 unpublished entries, or a minute after the oldest one (R-LOG-8, R-LOG-11). */
  publicationDue(): boolean {
    const through = Number(getMeta(this.sql, "published_through") ?? "-1");
    const lag = this.headSeq() - through;
    if (lag <= 0) return false;
    if (lag >= 50) return true;
    const oldest = str(one(this.sql, "SELECT at FROM entries WHERE seq = ?", through + 1), "at");
    return oldest !== null && this.now() - Date.parse(oldest) >= 60_000;
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
      if (!this.pendingPublication()) {
        if (this.headSeq() <= Number(getMeta(this.sql, "published_through") ?? "-1")) return null;
        if (!force && !this.publicationDue()) return null;
      }
      // R-PUB-10: publish only for the room the registry binds to this repository.
      if (!(await this.isBound())) throw artroomError("forbidden", "The registry does not bind this repository to this room; nothing is published.");
      let result: Awaited<ReturnType<PublisherPort["publish"]>>;
      let cohort: PendingPublication;
      try {
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
            const expected = publisher.commitFor(parent, entriesAfter(this.sql, -1, n + 1), cp, this.retainedFiles(digests));
            const p: PendingPublication = { v: 2, parent, expected, through: n, hash: through.hash, checkpoint: cp, retained: digests };
            setMeta(this.sql, "pending_publication", JSON.stringify(p));
            return p;
          });
        const entries = entriesAfter(this.sql, -1, cohort.through + 1);
        const retained = this.retainedFiles(cohort.retained);
        // The Room's own fence: the ref holds the parent it confirmed, or exactly the pending
        // commit (a push whose reply was lost). Anything else, even with the same entries, is
        // another writer, and publication stops; it is never built on (R-LOG-8).
        if (publisher.head !== cohort.parent && publisher.head !== cohort.expected)
          throw Object.assign(new Error("the log ref holds a commit the room did not write"), { code: "unexpected-writer" });
        result = await publisher.publish(entries, cohort.checkpoint, retained);
        if (result.commit !== cohort.expected) throw Object.assign(new Error("the publisher confirmed a commit other than the pending one"), { code: "unexpected-writer" });
      } catch (e) {
        // Reopen from the ref next time: the read-back decides what happened.
        this.publisherCache = null;
        const code = (e as { code?: string }).code ?? "transport";
        await this.serial(async () =>
          this.sql.transaction(() => {
            const was = getMeta(this.sql, "publication_error");
            setMeta(this.sql, "publication_error", code);
            if (code === "unexpected-writer" && was !== code)
              this.attendAdmins(this.headSeq(), null, { why: "publication-unresolved", op: "op_log", since: iso(this.now()) }, "Another writer moved refs/artroom/log. Publication of the log has stopped.");
          }),
        );
        // Wake subscriptions: the admins' item is new even though no entry is.
        this.committed();
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
          this.sql.all("DELETE FROM meta WHERE k IN ('pending_publication', 'publication_error')");
        }),
      );
      this.committed();
      return { through: done.through, commit: result.commit };
    } finally {
      this.publishing = false;
    }
  }

  private retainedFiles(digests: readonly Digest[]): RetainedFile[] {
    return digests.map((d) => {
      const r = one(this.sql, "SELECT kind, body FROM retained WHERE digest = ?", d)!;
      return { kind: str(r, "kind") === "input" ? ("input" as const) : ("policy" as const), body: str(r, "body")! };
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
    tokens: () => this.revokeEndedTokens(),
    pins: () => this.completePins(),
    previews: () => this.refreshPreviews(),
    workspaces: () => this.resumeWorkspaces(),
    recompute: () => this.recompute(),
    landing: () => this.resumeLanding(),
    abort: () => this.landing.enforceAbort().then(() => undefined),
    publication: () => this.publish().then(() => undefined),
  } as const;

  /** Start one durable step now, in the background. */
  run(step: keyof RoomCore["steps"]): void {
    this.kick(`step:${step}`, () => this.steps[step]());
  }

  /** Run every durable step once, in order. A step that fails is retried at the next alarm. */
  async runAll(): Promise<void> {
    for (const step of Object.keys(this.steps) as (keyof RoomCore["steps"])[]) await this.steps[step]().catch(() => undefined);
  }

  /** Evaluations asked for (after a check, a recomputation), then the engine's own work (R-PUB-7 first). */
  async resumeLanding(): Promise<void> {
    if (!this.founded) return;
    // R-PUB-10: canonical write tokens are minted, and main is pushed, only for the bound room.
    if (!(await this.isBound())) return;
    // An abort attempt is carried out at once, even while a push is in flight (R-REV-5): not behind the engine's queue.
    await this.landing.enforceAbort();
    for (const r of this.sql.all("SELECT op FROM land_reeval ORDER BY rowid")) {
      const op = str(r, "op") as OpId;
      await this.landing.evaluate(op);
      this.sql.all("DELETE FROM land_reeval WHERE op = ?", op);
    }
    await this.landing.reconcile();
  }

  /** When the alarm should next run, or null. */
  nextAlarm(): number | null {
    const times: number[] = [];
    const lease = num(one(this.sql, "SELECT MIN(expires_ms) AS t FROM lanes WHERE state = 'held'"), "t");
    if (lease !== null) times.push(lease);
    const notify = this.nextNotifyMs();
    if (notify !== null) times.push(notify);
    const landing = this.landing.nextDue();
    if (landing !== null) times.push(landing);
    // Lane B's workspace duties: cleanup owed, and checks on unanswered remote steps, on their capped backoff.
    let ws: Workspaces | null = null;
    try {
      ws = this.founded ? this.workspaces : null;
    } catch {
      ws = null;
    }
    const wsDue = ws?.nextDue() ?? null;
    if (wsDue !== null) times.push(wsDue);
    const now = this.now();
    const pending =
      this.endedWorkspaces().length > 0 ||
      !!one(this.sql, "SELECT 1 AS x FROM pins WHERE done = 0") ||
      !!one(this.sql, "SELECT 1 AS x FROM previews WHERE state = 'pending'") ||
      (ws !== null && !!one(this.sql, "SELECT 1 AS x FROM ws_leases w JOIN artroom_ws a ON a.lane = w.lane AND a.lease = w.lease_gen WHERE w.state = 'open' AND a.state = 'pending'")) ||
      !!one(this.sql, "SELECT 1 AS x FROM land_reeval") ||
      !!one(this.sql, "SELECT 1 AS x FROM generations WHERE recompute IS NOT NULL") ||
      this.pendingPublication() !== null;
    if (pending) times.push(now + 5_000);
    if (this.headSeq() > Number(getMeta(this.sql, "published_through") ?? "-1")) times.push(now + 60_000);
    return times.length ? Math.min(...times) : null;
  }

  /** A held member key's seed, for room-custody acts. Never returned to a caller. */
  heldSeed(key: KeyId): Uint8Array | null {
    const s = str(one(this.sql, "SELECT seed FROM held_keys WHERE key = ?", key), "seed");
    return s ? unb64url(s) : null;
  }
}
