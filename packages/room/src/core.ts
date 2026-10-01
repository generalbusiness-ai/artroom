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
  ArtroomError,
  Authority,
  CheckerConfig,
  Digest,
  EntryContent,
  Genesis,
  KeyId,
  LaneId,
  LogEntry,
  MemberId,
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
import { ownersFor } from "@generalbusiness/artroom-policy";
import { canonicalize, parseStrict } from "./canonical.ts";
import { b64url, digestJson, keyPairFromSeed, unb64url, verify } from "./crypto.ts";
import { artroomError } from "./errors.ts";
import { iso, roomIdOf } from "./ids.ts";
import { idOf, seal } from "./log.ts";
import { changedPaths, evidenceOn, generationRow, laneRow, type GenerationRow, type LaneRow } from "./model.ts";
import { adminObligation, latestReviews, obligationsFor } from "./obligations.ts";
import type { ActivePolicy, Evaluation, LandingHost, LandingPort, LandRecordLike, ObligationSpec, Ports, Readiness, Sql } from "./ports.ts";
import { activeAdmins, activeMembers, teamsOf } from "./roster.ts";
import { createSchema, getMeta, head, headSeq, json, num, one, retain, setMeta, str } from "./store.ts";
import { judge } from "./authority.ts";
import { matchGlob } from "./glob.ts";

export interface CoreOptions {
  readonly sql: Sql;
  readonly ports: Ports;
  readonly clock: () => number;
  /** Lease length in milliseconds (R-LANE-5). */
  readonly leaseMs: number;
  /** Keep a promise alive after the response (`ctx.waitUntil`). */
  readonly defer: (p: Promise<unknown>) => void;
  /** Called after every commit that sealed entries: wake subscribers, reschedule the alarm. */
  readonly committed: () => void;
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

export class RoomCore {
  readonly sql: Sql;
  readonly ports: Ports;
  readonly clock: () => number;
  readonly leaseMs: number;
  readonly defer: (p: Promise<unknown>) => void;
  readonly committed: () => void;
  readonly landing: LandingPort;
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
    this.ports = opts.ports;
    this.clock = opts.clock;
    this.leaseMs = opts.leaseMs;
    this.defer = opts.defer;
    this.committed = () => {
      opts.committed();
      for (const w of [...this.waiters]) w();
    };
    createSchema(this.sql);
    this.landing = opts.ports.landing(this.sql, this.host());
  }

  // ------------------------------------------------------------ identity

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
    // The initial policy: main's .artroom/policy.json at import, or the default (R-POL-9).
    let doc: PolicyDocument = this.ports.policy.defaultPolicy();
    let checkers: ActivePolicyFull["checkers"] = {};
    let main: Sha | null = null;
    try {
      main = await this.ports.artifacts.readMain();
    } catch {
      throw artroomError("unavailable", "The canonical repository could not be read. Try again.");
    }
    if (main !== null) {
      const cfg = await this.ports.artifacts.readConfig(main).catch(() => {
        throw artroomError("unavailable", "The canonical repository could not be read. Try again.");
      });
      const parsed = this.parseConfig(cfg.policy, cfg.checkers);
      if (!parsed.ok) throw artroomError("bad-request", `The policy on main is invalid: ${parsed.problems[0]}`);
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
      { type: "policy-activated", policy: digest, commit, previous, recomputed: { proposals: open.length, reopened: 0, fenced } },
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
      if (open.length) this.kick("recompute", () => this.recompute());
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
   * After an activation: recompute each open proposal's obligations under the
   * new policy (R-POL-9). A failing `require` blocks landing until a new
   * generation or policy. Runs from the queue; retried by the alarm.
   */
  async recompute(): Promise<void> {
    await this.serial(async () => {
      const policy = this.activePolicy();
      for (const g of this.openGenerations()) {
        if (g.recompute !== policy.version) continue;
        const lane = laneRow(this.sql, g.lane)!;
        const paths = changedPaths(g.changed);
        const admin = adminObligation(policy.version, paths);
        let specs: ObligationSpec[] = admin ? [admin] : [];
        let blocked: Refusal | null = null;
        const evaluations: Evaluation[] = [];
        if (lane.purpose !== "config-recovery") {
          const r = await this.ports.policy.require(
            policy,
            { kind: "require", actor: this.policyActorOf(g.proposer), lane: this.policyLane(lane), proposal: this.proposalInput(policy.doc, g), room: this.policyRoom() },
            { budget: this.ports.policy.actBudget() },
          );
          evaluations.push(...r.evaluations);
          blocked = r.refusal;
          for (const o of r.obligations) if (!specs.some((s) => s.id === o.id)) specs.push(o);
        }
        if (blocked) specs = [...g.obligations];
        this.sql.transaction(() => {
          const now = generationRow(this.sql, g.lane, g.generation);
          if (!now || now.recompute !== policy.version || getMeta(this.sql, "policy") !== policy.version) return;
          this.retainEvaluations(evaluations);
          this.sql.all(
            "UPDATE generations SET obligations = ?, blocked = ?, recompute = NULL WHERE lane = ? AND generation = ?",
            JSON.stringify(specs),
            blocked ? JSON.stringify(blocked) : null,
            g.lane,
            g.generation,
          );
        });
        const op = this.activeLandOp(g.lane);
        if (op) this.landing.evaluate(op);
      }
    });
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
      if (l && l.generation > 0) for (const r of latestReviews(evidenceOn(this.sql, lane, l.generation))) if (r.qualifies.length) reviewers.add(r.member);
    }
    return { roles, reviewers: [...reviewers].sort() };
  }

  // ------------------------------------------------------------ the queue

  /** Run admissions and room-written events one at a time (R-ADM-6). */
  serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(fn);
    this.chain = next.catch(() => undefined);
    return next;
  }

  /** Start deferred work once; the alarm retries anything that did not finish. */
  kick(key: string, fn: () => Promise<void>): void {
    if (this.inFlight.has(key)) return;
    this.inFlight.add(key);
    const p = fn()
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
      "INSERT INTO attention (id, seq, principal, lane, item, open) VALUES (?, ?, ?, ?, ?, 1)",
      `att_${seq}_${n}`,
      seq,
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
      revalidate: (op) => this.revalidate(op),
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
  landEnvelope(op: LandRecordLike): EntryContent["entry"] | null {
    const r = one(this.sql, "SELECT body FROM entries WHERE id = ?", op.act);
    return r ? (JSON.parse(str(r, "body")!) as LogEntry).entry : null;
  }

  /** R-LAND-7 step 1, the parts only the Room knows. Synchronous, inside the reservation transaction. */
  revalidate(op: LandRecordLike): { readonly reason: "authority-lost" | "evidence-invalid" | "obligation-open"; readonly fix: string } | null {
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
    const obligations = obligationsFor(this.sql, op.lane, op.generation, { doc: policy.doc, integration: op.integration ?? null });
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
      // bytes with the bytes retained at `ready`, from trusted storage. No hashing or evaluation here.
      const row = op.landInput ? json<{ retained: RetainedLandInput | null }>(one(this.sql, "SELECT body FROM land_evals WHERE op = ? AND digest = ?", op.id, op.landInput), "body") : null;
      const rebuilt = this.landInput(op, lane!, gen, policy, "reservation");
      if (!row?.retained || !this.ports.policy.matchesRetained(row.retained, rebuilt))
        return { reason: "obligation-open", fix: "The reviews or obligations changed after the landing was prepared. Land again." };
    }
    return null;
  }

  /** The land-rule input (R-POL-6, R-LAND-4 step 3). Pure: rebuilt at reservation and compared by digest. */
  landInput(op: Pick<LandRecordLike, "lane" | "generation" | "integration">, lane: LaneRow, gen: GenerationRow, policy: ActivePolicyFull, stage: "land" | "reservation", actor?: Authority) {
    const obligations = obligationsFor(this.sql, gen.lane, gen.generation, { doc: policy.doc, integration: op.integration ?? null });
    const reviews = latestReviews(evidenceOn(this.sql, gen.lane, gen.generation))
      .filter((r) => r.qualifies.length > 0)
      .map((r) => ({ act: r.act, verdict: r.verdict!, by: this.policyActor(r.authority), basis: "here" as const }));
    for (const o of obligations)
      for (const e of o.evidence)
        if (e.basis === "carried" && e.kind === "review" && !reviews.some((r) => r.act === e.act)) {
          const row = one(this.sql, "SELECT body, verdict FROM evidence WHERE act = ?", e.act);
          if (row) reviews.push({ act: e.act, verdict: str(row, "verdict") as "approve", by: this.policyActor((JSON.parse(str(row, "body")!) as { authority: Authority }).authority), basis: "carried" as never });
        }
    const initiator = actor ?? this.initiatorOf(op as LandRecordLike);
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

  private initiatorOf(op: LandRecordLike): Authority | null {
    const r = op.act ? one(this.sql, "SELECT body FROM entries WHERE id = ?", op.act) : undefined;
    if (!r) return null;
    const e = (JSON.parse(str(r, "body")!) as LogEntry).entry;
    return e.type === "act" ? e.receipt.authority : null;
  }

  /** R-LAND-4 steps 2 to 4 on a built integration. Synchronous; deferred work re-enters through `evaluate`. */
  readiness(op: LandRecordLike, integration: Sha): Readiness {
    const lane = laneRow(this.sql, op.lane);
    const gen = generationRow(this.sql, op.lane, op.generation);
    if (!lane || !gen) return { kind: "retry", reason: "lease-changed", fix: "Claim the lane, then land again." };
    if (gen.blocked) return { kind: "failed", reason: { code: "refused", refusal: gen.blocked } };
    if (gen.recompute) return { kind: "waiting", obligations: [] };
    const policy = this.activePolicy();
    // A change to .artroom/ configuration must be valid in the integration itself (R-POL-1, R-PUB-9).
    if (changedPaths(gen.changed).some(isConfigPath)) {
      const cfg = json<{ ok: boolean; problems?: string[] }>(one(this.sql, "SELECT body FROM configs WHERE commit_sha = ?", integration), "body");
      if (!cfg) {
        this.kick(`config:${integration}`, () => this.loadConfig(integration, op.id));
        return { kind: "waiting", obligations: [] };
      }
      if (!cfg.ok)
        return {
          kind: "failed",
          reason: { code: "refused", refusal: { refused: true, rule: "policy-invalid", reason: `The integrated configuration is invalid: ${cfg.problems?.[0] ?? "unknown problem"}.`, fix: "Correct the configuration and propose again." } },
        };
    }
    const obligations = obligationsFor(this.sql, op.lane, op.generation, { doc: policy.doc, integration });
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
    if (lane.purpose === "config-recovery") return { kind: "ready", evidence, landInput: null };
    const input = this.landInput({ ...op, integration }, lane, gen, policy, "reservation");
    const digest = digestJson(input);
    const cached = json<{ refusal: Refusal | null; retained: RetainedLandInput | null }>(one(this.sql, "SELECT body FROM land_evals WHERE op = ? AND digest = ?", op.id, digest), "body");
    if (!cached) {
      this.kick(`land:${op.id}:${digest}`, () => this.evaluateLandRules(op.id, input, digest, policy));
      return { kind: "waiting", obligations: [] };
    }
    if (cached.refusal) return { kind: "failed", reason: { code: "refused", refusal: cached.refusal } };
    // ready.landInput is the digest of the retained reservation-stage input (R-LAND-4).
    return { kind: "ready", evidence, landInput: cached.retained?.digest ?? digest };
  }

  private async loadConfig(integration: Sha, op: OpId): Promise<void> {
    const cfg = await this.ports.artifacts.readConfig(integration);
    const parsed = this.parseConfig(cfg.policy, cfg.checkers);
    const body = parsed.ok
      ? { ok: true, policy: parsed.doc ?? null, checkers: parsed.checkers }
      : { ok: false, problems: parsed.problems };
    this.sql.all("INSERT INTO configs (commit_sha, body) VALUES (?, ?) ON CONFLICT (commit_sha) DO NOTHING", integration, JSON.stringify(body));
    this.landing.evaluate(op);
  }

  private async evaluateLandRules(op: OpId, input: ReturnType<RoomCore["landInput"]>, digest: Digest, policy: ActivePolicyFull): Promise<void> {
    const r = await this.ports.policy.land(policy, input, { budget: this.ports.policy.actBudget() });
    this.sql.transaction(() => {
      this.retainEvaluations(r.evaluations);
      this.sql.all(
        "INSERT INTO land_evals (op, digest, body) VALUES (?, ?, ?) ON CONFLICT (op, digest) DO NOTHING",
        op,
        digest,
        JSON.stringify({ refusal: r.refusal, decisions: r.evaluations.map((e) => e.decision), retained: r.retained }),
      );
    });
    this.landing.evaluate(op);
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
        this.kick("previews", () => this.refreshPreviews());
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
    const main = await this.ports.artifacts.readMain();
    for (const r of this.sql.all("SELECT id, head FROM previews WHERE state = 'pending'")) {
      const id = str(r, "id")!;
      let body: Record<string, unknown>;
      try {
        const p = await this.ports.artifacts.preview(str(r, "head") as Sha, main);
        body = p.kind === "clean" ? { state: "clean", base: p.base, integration: p.integration } : { state: "conflict", base: p.base, paths: p.paths };
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
    return this.serial(async () => {
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
        this.kick(`revoke:${id}`, () => this.revokeTokens(id));
      }
      if (due.length) this.committed();
      return due.length;
    });
  }

  /** Revoke every live workspace token of a lane whose lease ended (R-WS-3, R-LANE-8). */
  async revokeTokens(lane: LaneId): Promise<void> {
    const l = laneRow(this.sql, lane);
    for (const r of this.sql.all("SELECT id, lease_gen FROM fork_tokens WHERE lane = ? AND revoked = 0", lane)) {
      if (l && l.state === "held" && num(r, "lease_gen") === l.leaseGen) continue;
      await this.ports.artifacts.revokeForkToken(lane, str(r, "id")!);
      this.sql.all("UPDATE fork_tokens SET revoked = 1 WHERE id = ?", str(r, "id")!);
    }
  }

  /** Lanes with live tokens that should be revoked. */
  tokensToRevoke(): LaneId[] {
    return this.sql
      .all("SELECT DISTINCT t.lane FROM fork_tokens t JOIN lanes l ON l.id = t.lane WHERE t.revoked = 0 AND (l.state = 'unheld' OR l.lease_gen != t.lease_gen)")
      .map((r) => str(r, "lane") as LaneId);
  }

  /** Complete pinned refs that were admitted but not yet written (R-PROP-1 step 2). */
  async completePins(): Promise<void> {
    for (const r of this.sql.all("SELECT ref, head FROM pins WHERE done = 0")) {
      await this.ports.artifacts.pinRef(str(r, "ref") as never, str(r, "head") as Sha);
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

  // ------------------------------------------------------------ alarm schedule

  /** When the alarm should next run, or null. */
  nextAlarm(): number | null {
    const times: number[] = [];
    const lease = num(one(this.sql, "SELECT MIN(expires_ms) AS t FROM lanes WHERE state = 'held'"), "t");
    if (lease !== null) times.push(lease);
    const notify = this.nextNotifyMs();
    if (notify !== null) times.push(notify);
    const landing = this.landing.nextDue();
    if (landing !== null) times.push(landing);
    const now = this.now();
    if (this.tokensToRevoke().length || one(this.sql, "SELECT 1 AS x FROM pins WHERE done = 0") || one(this.sql, "SELECT 1 AS x FROM previews WHERE state = 'pending'") || one(this.sql, "SELECT 1 AS x FROM generations WHERE recompute IS NOT NULL"))
      times.push(now + 5_000);
    return times.length ? Math.min(...times) : null;
  }

  /** A held member key's seed, for room-custody acts. Never returned to a caller. */
  heldSeed(key: KeyId): Uint8Array | null {
    const s = str(one(this.sql, "SELECT seed FROM held_keys WHERE key = ?", key), "seed");
    return s ? unb64url(s) : null;
  }
}
