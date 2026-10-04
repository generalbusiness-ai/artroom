/**
 * A room simulator for declared-acts logs (stage 3 fixtures). Unlike
 * `RoomSim`, which seals whatever a test asks for, this one admits acts the
 * way the Room's admission does (packages/room/src/admission.ts and
 * core.ts at 815e3383), for the code-review declarations under a `v2`
 * document and for the legacy vocabulary under a `v1` one:
 * - every policy input is built as the Room builds it: `policyActor`,
 *   `policyLane` (with the thread's kind under a `v2` document, R-EVAL-3 as
 *   amended), `policyRoom`, `proposalInput` and `notifyDirectory`, from this
 *   simulator's own tables, not from verify's fold;
 * - every evaluation is the policy package's, on one act meter per act, in
 *   the Room's order: `refuse` (with the proposal, before the scope check,
 *   for a version), then `require`, then `land` at stage `land`;
 * - preparation seals `land-evaluated` at stage `reservation`, then
 *   `land-reserved` and `land-outcome`, and a landed `.artroom/` change
 *   activates its document at the next seq (R-POL-9);
 * - notifications are queued with the input built after the act, and sealed
 *   as `notified` events when drained (R-LOG-13);
 * - versions are real Git commits in `repo`, and their changed paths come
 *   from the commits' files.
 *
 * - obligations, evidence and carrying follow the Room's rules
 *   (support/room-obligations.ts, a port of the Room's obligations.ts): the
 *   one qualification rule, evidence validity after a key is revoked, the
 *   sole-admin flag, the status calculator behind the sealed `obligations`
 *   effects and the land input, verdicts carried to a new version at
 *   `propose` and judged again at a recomputation, and checks carried onto
 *   a landing's integration as `check-carried` events.
 *
 * Simplifications, none of which verify's stage-3 checks read: a check's
 * binding to a prepared integration is not checked at its admission, and
 * every check binds its integration by its whole tree; overlap is not
 * checked; previews are not built, except a `prepared` event when a test
 * asks for one; a landing's integration is the version's head, unless the
 * test gives one.
 */

import type {
  ActId,
  AnyPolicyDocument,
  Authority,
  Binding,
  Carried,
  CheckBody,
  CheckerConfig,
  CheckerConfigV2,
  Decision,
  Effect,
  EntryContent,
  Flag,
  Genesis,
  Glob,
  KeyId,
  LaneId,
  LanePurpose,
  LogEntry,
  MemberId,
  NotCarried,
  ObligationId,
  OpId,
  PathChange,
  PolicyActor,
  PolicyDocument,
  PolicyLane,
  PolicyProposal,
  PolicyVersion,
  Refusal,
  RepoPath,
  ReviewBody,
  RevocationReason,
  Role,
  RoomId,
  RuleInput,
  Sha,
  SignedEnvelope,
  SystemEvent,
  TeamId,
} from "@generalbusiness/artroom-contract";
import {
  actMeter,
  bindingsOf,
  checkerInputs,
  evaluateCarry,
  evaluateLand,
  evaluateRefuse,
  evaluateRequire,
  matchGlob,
  notifyContext,
  ownersFor,
  replay,
  type ActivePolicy,
  type ObligationSpec,
  type RuleEvaluation,
} from "@generalbusiness/artroom-policy";
import {
  ADMIN_APPROVAL,
  adminObligation,
  blocking,
  evidenceOn,
  invalidity,
  latestReviews,
  qualification,
  statusesOf,
  transitions,
  withAdvisory,
  type CheckCarryRow,
  type EvidenceRow,
  type GenerationRow,
  type Tables,
} from "./room-obligations.ts";
import { canonicalize, utf8 } from "../../src/canonical.ts";
import { b64url, digestJson, keyPairFromSeed, sha256Hex, sign, type KeyPair } from "../../src/crypto.ts";
import { entryId, makeCheckpoint, retain, retainedPath, roomIdOf, seal, logFiles, type Retained } from "../../src/entries.ts";
import { MemoryGit, buildTree, encodeCommit, gitObject } from "../../src/git.ts";
import { keys } from "./room-sim.ts";

const T0 = Date.parse("2026-10-03T09:00:00Z");
const LEASE_MS = 3_600_000;
type In<K extends RuleInput["kind"]> = Extract<RuleInput, { readonly kind: K }>;

interface LaneRow {
  id: LaneId;
  kind: string;
  purpose: LanePurpose;
  scope: readonly Glob[];
  state: "held" | "unheld";
  holder: MemberId | null;
  leaseGen: number;
  generation: number;
}

/** One act to admit. */
export interface Act {
  readonly signer: KeyPair;
  readonly kind: string;
  readonly target: unknown;
  readonly body: Readonly<Record<string, unknown>>;
  /** Override the envelope: a forged binding or format, for tests that need a signed act the room would not admit. */
  readonly envelope?: { readonly v?: 1 | 2; readonly binding?: string };
  readonly delegation?: ActId;
}

/** A test key from a one-byte seed, as room-sim's `keyPairFromSeed(seed(n))`. */
export function pair(n: number): KeyPair {
  return keyPairFromSeed(new Uint8Array(32).fill(n));
}

export class DeclaredRoom {
  readonly entries: LogEntry[] = [];
  readonly retained: Retained[] = [];
  readonly genesis: Genesis;
  readonly room: RoomId;
  /** The room's canonical repository: every proposed head and its base. */
  readonly repo = new MemoryGit();
  /** Files of each commit in `repo`, by commit. */
  private readonly trees = new Map<Sha, Readonly<Record<string, string>>>();
  main: Sha;
  policy!: { doc: AnyPolicyDocument; version: PolicyVersion; checkers: Record<string, string>; configs: Record<string, CheckerConfig>; bindings: Readonly<Record<string, Binding>> };
  private readonly policies = new Map<PolicyVersion, DeclaredRoom["policy"]>();
  private readonly members = new Map<MemberId, { role: Role; active: boolean }>();
  private readonly keyRows = new Map<KeyId, { member: MemberId; revoked: RevocationReason | null }>();
  /** Revocations of keys that belong to no member, such as delegate keys. */
  private readonly looseRevoked = new Map<KeyId, RevocationReason>();
  private readonly evidence: EvidenceRow[] = [];
  private readonly checkCarries: CheckCarryRow[] = [];
  private readonly checkJudged = new Set<string>();
  /** The integration each recorded snapshot commit was built for, by checker and commit (the Room's `check_snapshots`). */
  private readonly snapshotIntegration = new Map<string, Sha>();
  private readonly teams = new Map<TeamId, MemberId[]>();
  private readonly lanes = new Map<LaneId, LaneRow>();
  private readonly generations = new Map<string, GenerationRow>();
  private readonly entryLane = new Map<ActId, LaneId | null>();
  private readonly invitations = new Map<ActId, { member: MemberId; role: Role | undefined }>();
  private readonly landOps = new Map<OpId, { lane: LaneId; generation: number; authority: Authority; done: boolean; integration?: Sha }>();
  private readonly queue: { entry: ActId; policy: ActivePolicy; context: ReturnType<typeof notifyContext> }[] = [];
  private idem = 0;
  private publication = 0;

  constructor() {
    this.genesis = {
      format: "artroom-log-v1",
      name: "demo/declared",
      repo: "declared-repo",
      admin: { handle: "@alice", key: keys.alice.key },
      recovery: keys.recovery.key,
      roomKey: keys.room.key,
      profile: { policy: "artroom-jsonata-v1", jsonata: "2.2.2" },
      createdAt: new Date(T0).toISOString(),
    };
    this.room = roomIdOf(this.genesis);
    this.members.set("@alice", { role: "admin", active: true });
    this.keyRows.set(keys.alice.key, { member: "@alice", revoked: null });
    this.main = this.commit({ "README.md": "# demo\n", "src/app.ts": "export const x = 1;\n" }, null);
    this.system({ type: "genesis", genesis: this.genesis, sig: sign(keys.alice.seed, "artroom-genesis-v1", this.genesis) });
  }

  // ------------------------------------------------------------ the log

  at(seq = this.entries.length): string {
    return new Date(T0 + seq * 1000).toISOString();
  }

  private seal(entry: EntryContent["entry"]): LogEntry {
    const seq = this.entries.length;
    const e = seal({ format: "artroom-log-v1", seq, prev: seq === 0 ? null : this.entries[seq - 1]!.hash, at: this.at(seq), entry }, keys.room.seed);
    this.entries.push(e);
    return e;
  }

  system(event: SystemEvent | Readonly<Record<string, unknown>>): LogEntry {
    const e = this.seal({ type: "system", event: event as SystemEvent });
    const ev = event as { lane?: unknown };
    this.entryLane.set(entryId(e.seq, e.hash), typeof ev.lane === "string" ? (ev.lane as LaneId) : null);
    return e;
  }

  /** A commit in the room's repository with exactly these files. */
  commit(files: Readonly<Record<string, string>>, parent: Sha | null = this.main): Sha {
    const { root, objects } = buildTree(Object.fromEntries(Object.entries(files).map(([p, t]) => [p, utf8(t)])));
    const c = gitObject("commit", encodeCommit({ tree: root, parents: parent ? [parent] : [], author: "x <x@x> 0 +0000", committer: "x <x@x> 0 +0000", message: "change\n" }));
    for (const o of [...objects, c]) this.repo.objects.set(o.sha, { type: o.type, data: o.data });
    this.trees.set(c.sha, files);
    return c.sha;
  }

  /** A head on top of main with these files changed (a null content deletes the file). */
  change(edits: Readonly<Record<string, string | null>>): Sha {
    const files: Record<string, string> = { ...this.trees.get(this.main)! };
    for (const [p, t] of Object.entries(edits)) {
      if (t === null) delete files[p];
      else files[p] = t;
    }
    return this.commit(files);
  }

  /** A new commit on top of `head` with the same files: the same tree under another head, as a rebase that changes nothing gives. */
  recommit(head: Sha): Sha {
    return this.commit(this.trees.get(head)!, head);
  }

  /** The tree of a commit in `repo`. */
  treeOf(commit: Sha): Sha {
    return /^tree ([0-9a-f]{40})/.exec(new TextDecoder().decode(this.repo.objects.get(commit)!.data))![1] as Sha;
  }

  /** The changes from `base` to `head`, from the commits' files (R-PROP-3). Renames are not simulated. */
  private diff(base: Sha, head: Sha): PathChange[] {
    const a = this.trees.get(base)!;
    const b = this.trees.get(head)!;
    const out: PathChange[] = [];
    for (const p of new Set([...Object.keys(a), ...Object.keys(b)]))
      if (!(p in a)) out.push({ status: "added", path: p });
      else if (!(p in b)) out.push({ status: "deleted", path: p });
      else if (a[p] !== b[p]) out.push({ status: "modified", path: p });
    return out.sort((x, y) => (x.path < y.path ? -1 : x.path > y.path ? 1 : 0));
  }

  // ------------------------------------------------------------ policy

  /** Activate `doc` with its checker configurations (R-POL-9). */
  async activate(doc: AnyPolicyDocument, checkers: Readonly<Record<string, CheckerConfig | CheckerConfigV2>> = {}, commit: Sha | null = null): Promise<PolicyVersion> {
    this.retained.push(retain("policy", doc));
    const named = Object.keys(checkers)
      .sort()
      .map((name) => {
        this.retained.push(retain("policy", checkers[name]));
        return { name, config: digestJson(checkers[name]) };
      });
    const e = this.system({ type: "policy-activated", policy: digestJson(doc), checkers: named, commit, previous: this.policy?.version ?? null, recomputed: { proposals: 0, reopened: 0, fenced: [] } });
    const version = entryId(e.seq, e.hash);
    const bindings = doc.format === "artroom-policy-v2" ? await bindingsOf(doc) : {};
    this.policy = { doc, version, checkers: Object.fromEntries(named.map((n) => [n.name, n.config])), configs: { ...checkers } as Record<string, CheckerConfig>, bindings };
    this.policies.set(version, this.policy);
    return version;
  }

  private get v2(): boolean {
    return this.policy.doc.format === "artroom-policy-v2";
  }

  private active(): ActivePolicy {
    return { doc: this.policy.doc as PolicyDocument, version: this.policy.version };
  }

  // ------------------------------------------------- policy inputs (core.ts)

  private teamsOf(member: MemberId): TeamId[] {
    return [...this.teams.keys()].sort().filter((t) => this.teams.get(t)!.includes(member));
  }

  policyActor(by: Authority): PolicyActor {
    return { member: by.member, role: by.role, teams: by.member ? this.teamsOf(by.member) : [], delegated: by.via === "delegation" };
  }

  private policyActorOf(member: MemberId): PolicyActor {
    return { member, role: this.members.get(member)?.role ?? null, teams: this.teamsOf(member), delegated: false };
  }

  private policyLane(lane: LaneRow | null): PolicyLane {
    const l: PolicyLane = lane
      ? { id: lane.id, claimed: lane.state === "held", holder: lane.holder, scope: lane.scope, generation: lane.generation, purpose: lane.purpose }
      : { id: null, claimed: false, holder: null, scope: [], generation: 0, purpose: "ordinary" };
    return this.v2 ? ({ ...l, kind: lane?.kind ?? null } as PolicyLane) : l;
  }

  private activeAdmins(): number {
    let admins = 0;
    for (const [handle, m] of this.members) if (m.active && m.role === "admin" && [...this.keyRows.values()].some((k) => k.member === handle && k.revoked === null)) admins++;
    return admins;
  }

  private policyRoom() {
    let members = 0;
    for (const m of this.members.values()) if (m.active) members++;
    return { admins: this.activeAdmins(), members };
  }

  private proposalInput(doc: AnyPolicyDocument, g: Pick<GenerationRow, "generation" | "head" | "base" | "changed">): PolicyProposal {
    const paths = [...new Set(g.changed.flatMap((c) => (c.status === "renamed" ? [c.path, c.from] : [c.path])))].sort();
    return { generation: g.generation, head: g.head, base: g.base, changed: g.changed, paths, owners: ownersFor(doc as PolicyDocument, paths) };
  }

  // ---------------------------------------- obligations (room-obligations.ts)

  /** The simulator's tables, as the Room's obligation rules read them. */
  private tables(): Tables {
    return {
      evidence: this.evidence,
      checkCarries: this.checkCarries,
      policy: this.policy.version,
      revocationOf: (key) => this.keyRows.get(key as KeyId)?.revoked ?? this.looseRevoked.get(key as KeyId) ?? null,
      activeAdmins: () => this.activeAdmins(),
    };
  }

  /** The active checker configurations, as the Room keeps them: configuration and digest by name. */
  private checkers(): Record<string, { config: CheckerConfig; digest: string }> {
    return Object.fromEntries(Object.keys(this.policy.checkers).map((name) => [name, { config: this.policy.configs[name]!, digest: this.policy.checkers[name]! }]));
  }

  private statusOpts(integration?: Sha | null) {
    return { doc: this.policy.doc as PolicyDocument, checkers: this.checkers(), ...(integration !== undefined ? { integration } : {}) };
  }

  /** Does a verdict qualify, under the active policy, for any review obligation of its generation (core.ts `qualifiesAny`)? */
  private qualifiesAny(g: GenerationRow, r: EvidenceRow): boolean {
    return g.obligations.some((o) => o.kind === "review" && qualification(this.policy.doc as PolicyDocument, o, r) === true);
  }

  private notifyDirectory(lane: LaneId | null) {
    const roles: Partial<Record<Role, MemberId[]>> = {};
    for (const handle of [...this.members.keys()].sort()) {
      const m = this.members.get(handle)!;
      if (m.active) (roles[m.role] ??= []).push(handle);
    }
    const reviewers = new Set<MemberId>();
    const l = lane ? this.lanes.get(lane) : undefined;
    const g = l && l.generation > 0 ? this.generations.get(`${l.id}/${l.generation}`) : undefined;
    if (g) for (const r of latestReviews(evidenceOn(this.tables(), g.lane, g.generation))) if (this.qualifiesAny(g, r)) reviewers.add(r.member);
    return { roles, reviewers: [...reviewers].sort() };
  }

  /** The land input (core.ts `landInput`): blocking obligations and each qualifying reviewer's latest verdict, here or carried. */
  private landInput(lane: LaneRow, g: GenerationRow, actor: Authority, stage: "land" | "reservation", integration: Sha | null): In<"land"> {
    const t = this.tables();
    const obligations = statusesOf(t, g, this.statusOpts(integration));
    const reviews = latestReviews(evidenceOn(t, g.lane, g.generation))
      .filter((r) => this.qualifiesAny(g, r))
      .map((r) => ({ act: r.act, verdict: r.verdict!, by: this.policyActor(r.authority), basis: "here" as "here" | "carried" }));
    for (const o of obligations)
      for (const e of o.evidence)
        if (e.basis === "carried" && e.kind === "review" && !reviews.some((r) => r.act === e.act)) {
          const row = this.evidence.find((x) => x.act === e.act);
          if (row) reviews.push({ act: e.act, verdict: row.verdict!, by: this.policyActor(row.authority), basis: "carried" });
        }
    return {
      kind: "land",
      actor: this.policyActor(actor),
      lane: this.policyLane(lane),
      proposal: this.proposalInput(this.policy.doc, g),
      obligations: obligations.filter(blocking).map((o) => ({ id: o.id, met: o.state === "met" })),
      reviews: reviews.sort((a, b) => (a.act < b.act ? -1 : 1)),
      stage,
    };
  }

  /** The paths changed between two commits of `repo` (artifacts.ts `changedBetween`). */
  private changedBetween(from: Sha, to: Sha): RepoPath[] {
    return [...new Set(this.diff(from, to).map((c) => c.path))].sort();
  }

  // ------------------------------------------------------------ envelopes

  envelope(a: Act): SignedEnvelope {
    const declared = this.v2 && Object.hasOwn((this.policy.doc as { acts?: object }).acts ?? {}, a.kind);
    const v = a.envelope?.v ?? (declared ? 2 : 1);
    const envelope = {
      v,
      room: this.room,
      actor: a.signer.key,
      kind: a.kind,
      ...(v === 2 ? { binding: a.envelope?.binding ?? this.policy.bindings[a.kind] } : {}),
      target: a.target,
      body: a.body,
      idempotencyKey: `idem-${++this.idem}`,
      ...(a.delegation ? { delegation: a.delegation } : {}),
    };
    return { envelope, sig: sign(a.signer.seed, "artroom-envelope-v1", envelope) } as unknown as SignedEnvelope;
  }

  private keep(evaluations: readonly RuleEvaluation[]): Decision[] {
    for (const e of evaluations) this.retained.push(retain("input", e.context));
    return evaluations.map((e) => e.decision);
  }

  /** A member's own key, by case (a). */
  authority(signer: KeyPair): Authority {
    const k = this.keyRows.get(signer.key)!;
    return { via: "member", member: k.member, role: this.members.get(k.member)!.role, key: signer.key } as Authority;
  }

  // ------------------------------------------------------------ admission

  /**
   * Admit one act as the Room would, and seal it: accepted, or a recorded
   * refusal when policy or a recorded platform guard refuses it. Returns the
   * entry and its ID.
   */
  async act(a: Act, authority: Authority = this.authority(a.signer)): Promise<{ entry: LogEntry; id: ActId; refused: boolean }> {
    const signed = this.envelope(a);
    const env = signed.envelope as unknown as { kind: string; target: unknown; body: Record<string, unknown> };
    const flags: Flag[] = [];
    const meter = actMeter();
    const decisions: Decision[] = [];
    const policy = this.active();
    const refuse = async (lane: LaneRow | null, proposal: PolicyProposal | null): Promise<Refusal | null> => {
      // policyRefuse: never on a configuration-recovery lane; never for an admin's or the recovery key's roster act.
      if (lane?.purpose === "config-recovery") return null;
      if (env.kind === "roster" && (authority.via === "recovery" || authority.role === "admin")) return null;
      const input: In<"refuse"> = { kind: "refuse", act: { kind: env.kind as never, target: env.target as never, body: env.body as never }, actor: this.policyActor(authority), lane: this.policyLane(lane), proposal, room: this.policyRoom() };
      const r = await evaluateRefuse(policy, input, { budget: meter, recoveryKey: authority.via === "recovery" });
      decisions.push(...this.keep(r.evaluations));
      return r.refusal;
    };
    const refused = (r: Pick<Refusal, "rule" | "reason" | "fix">) => {
      const entry = this.seal({ type: "refusal", act: signed, receipt: { outcome: "refused", authority, decisions, refusal: { refused: true, rule: r.rule, reason: r.reason, fix: r.fix ?? "" } } });
      const id = entryId(entry.seq, entry.hash);
      this.entryLane.set(id, typeof (env.target as { lane?: unknown } | null)?.lane === "string" ? ((env.target as { lane: LaneId }).lane) : null);
      return { entry, id, refused: true };
    };
    const now = T0 + this.entries.length * 1000;
    const expiresAt = new Date(now + LEASE_MS).toISOString();
    const lane = (id: unknown) => (typeof id === "string" ? this.lanes.get(id as LaneId) ?? null : null);
    const recovery = (l: LaneRow | null) => {
      if (l?.purpose === "config-recovery") flags.push("config-recovery");
    };
    const step = this.stepOf(env.kind, env.target, env.body);
    let effects: Effect[] = [];
    let apply: (id: ActId) => void = () => {};
    let notify: { lane: LaneId | "self" | null; proposal: PolicyProposal | null } | null = { lane: null, proposal: null };
    switch (step) {
      case "open": {
        const purpose: LanePurpose = (env.body["purpose"] as LanePurpose | undefined) ?? "ordinary";
        if (purpose === "config-recovery") flags.push("config-recovery");
        else {
          const r = await refuse(null, null);
          if (r) return refused(r);
        }
        effects = [{ type: "opened", purpose, lease: { holder: authority.member!, generation: 1, expiresAt } }];
        notify = { lane: "self", proposal: null };
        apply = (id) => this.lanes.set(id, { id, kind: env.kind, purpose, scope: env.body["scope"] as Glob[], state: "held", holder: authority.member!, leaseGen: 1, generation: 0 });
        break;
      }
      case "version": {
        const l = lane((env.target as { lane: string }).lane)!;
        recovery(l);
        const head = env.body["head"] as Sha;
        const changed = this.diff(this.main, head);
        const paths = [...new Set(changed.map((c) => c.path))].sort();
        const generation = l.generation + 1;
        const prospective = { generation, head, base: this.main, changed };
        const proposal = this.proposalInput(this.policy.doc, prospective);
        const r = await refuse(l, proposal);
        if (r) return refused(r);
        if (l.purpose === "config-recovery") {
          if (!paths.length || paths.some((p) => !p.startsWith(".artroom/")))
            return refused({ rule: "recovery-scope", reason: "A configuration-recovery proposal may change only .artroom/**.", fix: "Propose the other changes on an ordinary lane." });
        }
        const outside = paths.filter((p) => !l.scope.some((g) => matchGlob(p, g)));
        if (outside.length) return refused({ rule: "outside-claim", reason: `${outside[0]} is outside the claim's scope.`, fix: "Extend the claim." });
        // Step 9: require (R-POL-3); none on a recovery lane.
        const admin = adminObligation(policy.version, paths);
        const specs: ObligationSpec[] = admin ? [admin] : [];
        if (l.purpose !== "config-recovery") {
          const req = await evaluateRequire(policy, { kind: "require", actor: this.policyActor(authority), lane: this.policyLane(l), proposal, room: this.policyRoom() }, { budget: meter });
          decisions.push(...this.keep(req.evaluations));
          if (req.refusal) return refused(req.refusal);
          for (const o of withAdvisory(req.obligations, this.checkers())) if (!specs.some((x) => x.id === o.id)) specs.push(o);
        }
        // Carrying earlier verdicts (R-CARRY), as admission.ts `propose`: platform conditions first, then carry rules.
        const carried: { obligation: ObligationId; evidence: Carried }[] = [];
        const notCarried: NotCarried[] = [];
        if (l.purpose !== "config-recovery" && l.generation > 0) {
          const prev = this.generations.get(`${l.id}/${l.generation}`)!;
          const candidates = new Map<ActId, ObligationId[]>();
          for (const o of statusesOf(this.tables(), prev, this.statusOpts())) for (const act of o.evidenceActs) if (o.kind === "review") candidates.set(act, [...(candidates.get(act) ?? []), o.id]);
          for (const [act, obls] of candidates) {
            const row = this.evidence.find((e) => e.act === act);
            if (!row) continue;
            const body = row.body as ReviewBody;
            const since = row.head === head ? [] : this.changedBetween(row.head, head);
            const revoked = invalidity(this.tables(), row, "reopens");
            const res = await evaluateCarry(
              policy,
              {
                kind: "carry",
                evidence: { act, kind: "review", verdict: row.verdict, by: this.policyActor(row.authority), from: { generation: row.generation, head: row.head }, scope: body.scope, dependsOn: body.dependsOn ?? [] },
                changedSince: [...since],
                proposal,
                policy: { same: this.generations.get(`${l.id}/${row.generation}`)?.policy === policy.version },
              },
              revoked ? { revoked: revoked.reason } : {},
              { budget: meter, purpose: l.purpose },
            );
            decisions.push(...this.keep(res.evaluations));
            if (res.carried) for (const o of obls) if (specs.some((x) => x.id === o)) carried.push({ obligation: o, evidence: res.carried });
            if (res.notCarried) notCarried.push(res.notCarried);
          }
        }
        const row: GenerationRow = { lane: l.id, generation, act: "act_0_00000000" as ActId, head, base: this.main, changed, proposer: authority.member!, obligations: specs, carried, notCarried, policy: policy.version, blocked: null, landed: false };
        const moved = transitions([], statusesOf(this.tables(), row, this.statusOpts()), true);
        effects = [
          { type: "proposed", lane: l.id, generation, head },
          ...(specs.length || carried.length ? [{ type: "obligations" as const, lane: l.id, generation, opened: moved.opened, met: moved.met }] : []),
          { type: "renewed", lane: l.id, expiresAt },
        ];
        notify = { lane: l.id, proposal };
        apply = (id) => {
          this.generations.set(`${l.id}/${generation}`, { ...row, act: id });
          l.generation = generation;
        };
        break;
      }
      case "review": {
        const t = env.target as { lane: LaneId; generation: number };
        const l = lane(t.lane)!;
        const g = this.generations.get(`${t.lane}/${t.generation}`)!;
        recovery(l);
        const body = env.body as unknown as ReviewBody;
        const member = authority.member!;
        const author = member === g.proposer || (l.state === "held" && l.holder === member);
        const admins = this.activeAdmins();
        const admission = { teams: this.teamsOf(member), author };
        const reviewObls = g.obligations.filter((o) => o.kind === "review");
        if (author && body.verdict === "approve" && admins === 1 && authority.role === "admin" && reviewObls.some((o) => o.id === ADMIN_APPROVAL)) flags.push("sole-admin-self-approval");
        const prospective = (act: ActId, seq: number): EvidenceRow => ({
          act,
          seq,
          kind: "review",
          lane: l.id,
          generation: g.generation,
          head: body.head,
          member,
          key: a.signer.key,
          grantor: authority.via === "delegation" ? (authority as { grantor: KeyId }).grantor : null,
          verdict: body.verdict,
          flags: [...flags],
          authority,
          admission,
          body,
          canonical: null,
        });
        // R-OBL-2: who may meet which review obligation, by the one qualification rule; both refusals are before policy.
        const judged = reviewObls.map((o) => qualification(this.policy.doc as PolicyDocument, o, prospective("act_0_00000000" as ActId, 0)));
        if (!judged.some((q) => q === true || q === "self"))
          return refused({ rule: "not-authorized-reviewer", reason: `${member} qualifies for no review obligation on this generation.`, fix: "Ask a qualifying reviewer." });
        if (!judged.some((q) => q === true)) return refused({ rule: "self-review", reason: "The author cannot meet these obligations on their own lane.", fix: "Ask another reviewer." });
        const r = await refuse(l, null);
        if (r) return refused(r);
        const seq = this.entries.length;
        const before = statusesOf(this.tables(), g, this.statusOpts());
        const after = statusesOf(this.tables(), g, { ...this.statusOpts(), extra: [prospective(`act_${seq}_00000000` as ActId, seq)] });
        const moved = transitions(before, after);
        effects = moved.opened.length || moved.met.length ? [{ type: "obligations", lane: l.id, generation: g.generation, opened: moved.opened, met: moved.met }] : [];
        notify = { lane: l.id, proposal: this.proposalInput(this.policy.doc, g) };
        apply = (id) => this.evidence.push(prospective(id, seq));
        break;
      }
      case "check": {
        const t = env.target as { lane: LaneId; generation: number };
        const l = lane(t.lane)!;
        const g = this.generations.get(`${t.lane}/${t.generation}`)!;
        const body = env.body as unknown as CheckBody;
        const spec = g.obligations.find((o) => o.id === body.obligation);
        if (!spec || spec.kind !== "check") return refused({ rule: "obligation-unknown", reason: `Generation ${g.generation} has no check obligation ${body.obligation}.`, fix: "Name an open check obligation." });
        const member = authority.member!;
        const admission = { teams: this.teamsOf(member), author: member === g.proposer || (l.state === "held" && member === l.holder) };
        const prospective = (act: ActId, seq: number): EvidenceRow => ({
          act,
          seq,
          kind: "check",
          lane: l.id,
          generation: g.generation,
          head: g.head,
          member,
          key: a.signer.key,
          grantor: authority.via === "delegation" ? (authority as { grantor: KeyId }).grantor : null,
          verdict: null,
          flags: [...flags],
          authority,
          admission,
          body,
          // R-CARRY-15 step 5: a check on a recorded snapshot commit counts for the integration it was recorded for.
          canonical: (body.input.kind === "filtered" ? this.snapshotIntegration.get(`${body.check}/${body.integration}`) : undefined) ?? body.integration,
        });
        const q = qualification(this.policy.doc as PolicyDocument, spec, prospective("act_0_00000000" as ActId, 0), this.checkers());
        if (q === "principal" || q === "self") return refused({ rule: "not-authorized-checker", reason: `${member} may not meet ${spec.id}.`, fix: "Ask an authorized checker." });
        if (q !== true) return refused({ rule: "check-binding", reason: "The check does not bind this obligation under the active configuration.", fix: "Run the check on the integration the room prepared, with the active configuration." });
        const r = await refuse(l, null);
        if (r) return refused(r);
        const seq = this.entries.length;
        const moved = transitions(statusesOf(this.tables(), g, this.statusOpts()), statusesOf(this.tables(), g, { ...this.statusOpts(), extra: [prospective(`act_${seq}_00000000` as ActId, seq)] }));
        effects = moved.opened.length || moved.met.length ? [{ type: "obligations", lane: l.id, generation: g.generation, opened: moved.opened, met: moved.met }] : [];
        notify = { lane: l.id, proposal: this.proposalInput(this.policy.doc, g) };
        apply = (id) => this.evidence.push(prospective(id, seq));
        break;
      }
      case "land": {
        const t = env.target as { lane: LaneId; generation: number };
        const l = lane(t.lane)!;
        const g = this.generations.get(`${t.lane}/${t.generation}`)!;
        recovery(l);
        if (g.blocked) return refused(g.blocked);
        const open = statusesOf(this.tables(), g, this.statusOpts()).find((o) => o.kind === "review" && o.state !== "met");
        if (open) return refused({ rule: "obligation-open", reason: `The obligation ${open.id} is open.`, fix: "Meet it, then land." });
        const r = await refuse(l, null);
        if (r) return refused(r);
        if (l.purpose !== "config-recovery") {
          const lr = await evaluateLand(policy, this.landInput(l, g, authority, "land", null), { budget: meter });
          decisions.push(...this.keep(lr.evaluations));
          if (lr.refusal) return refused(lr.refusal);
        }
        const op = `op_land_${this.entries.length}` as OpId;
        effects = [{ type: "land-op", op, state: "accepted" }, { type: "renewed", lane: l.id, expiresAt }];
        notify = { lane: l.id, proposal: this.proposalInput(this.policy.doc, g) };
        apply = () => this.landOps.set(op, { lane: l.id, generation: g.generation, authority, done: false });
        break;
      }
      case "release": {
        const l = lane((env.target as { lane: string }).lane)!;
        recovery(l);
        const r = await refuse(l, null);
        if (r) return refused(r);
        effects = [{ type: "released", lane: l.id, leaseGeneration: l.leaseGen }];
        notify = { lane: l.id, proposal: null };
        apply = () => {
          l.state = "unheld";
          l.holder = null;
          l.leaseGen += 1;
        };
        break;
      }
      case "comment": {
        const t = env.target as { act?: ActId; lane?: LaneId } | null;
        const l = t === null ? null : t.act ? lane(this.entryLane.get(t.act) ?? null) : lane(t.lane);
        recovery(l);
        const r = await refuse(l, null);
        if (r) return refused(r);
        effects = l && l.state === "held" && l.holder === authority.member ? [{ type: "renewed", lane: l.id, expiresAt }] : [];
        notify = { lane: l?.id ?? null, proposal: null };
        break;
      }
      case "renew": {
        const l = lane((env.target as { lane: string }).lane)!;
        recovery(l);
        const r = await refuse(l, null);
        if (r) return refused(r);
        effects = [{ type: "renewed", lane: l.id, expiresAt }];
        notify = { lane: l.id, proposal: null };
        break;
      }
      case "recover-release": {
        // R-DECL-21: an admin's own key, platform rules only, the config-recovery flag; no policy rule.
        const l = lane((env.target as { lane: string }).lane)!;
        flags.push("config-recovery");
        effects = [{ type: "released", lane: l.id, leaseGeneration: l.leaseGen }];
        notify = { lane: l.id, proposal: null };
        apply = () => {
          l.state = "unheld";
          l.holder = null;
          l.leaseGen += 1;
        };
        break;
      }
      case "roster": {
        const op = env.body as { op: string } & Record<string, unknown>;
        const r = await refuse(null, null);
        if (r) return refused(r);
        notify = null;
        apply = (id) => {
          if (op.op === "invite") this.invitations.set(id, { member: op["member"] as MemberId, role: op["role"] as Role | undefined });
          if (op.op === "join") {
            const inv = this.invitations.get(op["invitation"] as ActId)!;
            if (!this.members.has(inv.member)) this.members.set(inv.member, { role: inv.role ?? "member", active: true });
            this.keyRows.set(a.signer.key, { member: inv.member, revoked: null });
          }
          if (op.op === "team") this.teams.set(op["team"] as TeamId, [...(op["members"] as MemberId[])].sort());
          if (op.op === "set-role") this.members.get(op["member"] as MemberId)!.role = op["role"] as Role;
          if (op.op === "remove") this.members.get(op["member"] as MemberId)!.active = false;
          if (op.op === "revoke-key") {
            const k = this.keyRows.get(op["key"] as KeyId);
            if (k) k.revoked = op["reason"] as RevocationReason;
            else this.looseRevoked.set(op["key"] as KeyId, op["reason"] as RevocationReason);
          }
        };
        break;
      }
      default:
        throw new Error(`the simulator does not admit ${env.kind} (${step})`);
    }
    const entry = this.seal({ type: "act", act: signed, receipt: { outcome: "accepted", authority, decisions, effects, flags: [...new Set(flags)] } });
    const id = entryId(entry.seq, entry.hash);
    const self = effects.some((x) => x.type === "opened");
    this.entryLane.set(id, self ? id : typeof (env.target as { lane?: unknown } | null)?.lane === "string" ? (env.target as { lane: LaneId }).lane : null);
    apply(id);
    if (notify && this.policy.doc.rules.some((r) => r.kind === "notify" && (r.on as readonly string[]).includes(env.kind))) {
      const laneId = notify.lane === "self" ? id : notify.lane;
      const l = laneId ? this.lanes.get(laneId) ?? null : null;
      const input: In<"notify"> = {
        kind: "notify",
        act: { id, kind: env.kind as never, target: env.target as never, body: env.body as never },
        actor: this.policyActor(authority),
        lane: l ? this.policyLane(l) : null,
        proposal: notify.proposal,
      };
      this.queue.push({ entry: id, policy, context: notifyContext(input, this.notifyDirectory(laneId)) });
    }
    return { entry, id, refused: false };
  }

  /** The step an act runs: the declared step under a `v2` document, the legacy kind's under a `v1` one. */
  private stepOf(kind: string, target: unknown, body: Record<string, unknown>): string {
    if (kind === "roster") return "roster";
    if (kind === "renew") return "renew";
    if (kind === "recover") return `recover-${String(body["op"])}`;
    if (this.v2) {
      const decl = (this.policy.doc as unknown as { acts: Record<string, { targets: Record<string, readonly string[]> }> }).acts[kind];
      if (!decl) return "undeclared";
      const t = target as { lane?: unknown; generation?: unknown; act?: unknown; head?: unknown } | null;
      const shape = t === null ? "none" : "act" in t ? "entry" : "head" in t ? "line" : "generation" in t ? "version" : "thread";
      const steps = decl.targets[shape] ?? [];
      return steps.includes("version") ? "version" : steps[0]!;
    }
    return { claim: target === null ? "open" : "take", propose: "version", note: "comment", review: "review", check: "check", land: "land", release: "release" }[kind] ?? kind;
  }

  /** Seal every queued notification (R-LOG-13), with the context built when its act was sealed. */
  async drainNotify(): Promise<void> {
    for (const q of this.queue.splice(0)) {
      const r = await replay(q.policy, q.context);
      const to = [...new Set(r.notify.map((n) => n.to as MemberId))];
      this.system({ type: "notified", entry: q.entry, decisions: this.keep(r.evaluations), to });
    }
  }

  /**
   * Judge carrying earlier checks onto a landing's integration (R-CARRY-6
   * to 14, core.ts `carryChecks`): for each check obligation not met on the
   * integration, each earlier passing check of it on another integration,
   * newest first, until one carries; every judgement is a `check-carried`
   * event. `now` is the integration's tree and, for a scoped checker, its
   * filtered snapshot, as the Room reads them from the repository.
   */
  async carryChecks(op: OpId, integration: Sha, now: { readonly tree: Sha; readonly snapshot?: Record<string, string> }): Promise<void> {
    const o = this.landOps.get(op)!;
    o.integration = integration;
    const l = this.lanes.get(o.lane)!;
    const g = this.generations.get(`${o.lane}/${o.generation}`)!;
    const policy = this.active();
    const checkers = this.checkers();
    const statuses = statusesOf(this.tables(), g, this.statusOpts(integration));
    for (const spec of g.obligations) {
      if (spec.kind !== "check" || statuses.find((x) => x.id === spec.id)?.state === "met") continue;
      const cfg = checkers[spec.check];
      if (!cfg) continue;
      const judgedKey = (act: ActId) => `${o.lane}/${o.generation}/${integration}/${spec.id}/${act}/${policy.version}`;
      const candidates = this.evidence
        .filter((e) => e.lane === o.lane && e.kind === "check" && e.generation <= o.generation)
        .sort((x, y) => y.seq - x.seq)
        .filter((e) => {
          const b = e.body as CheckBody;
          return b.ok && b.obligation === spec.id && b.check === spec.check && e.canonical !== integration;
        });
      if (!candidates.length) continue;
      const inputs = checkerInputs(cfg.config.inputs, (this.policy.doc as PolicyDocument).carry);
      const snapshot = inputs ? ((now.snapshot?.[spec.check] ?? null) as `sha256:${string}` | null) : null;
      for (const ev of candidates) {
        if (this.checkJudged.has(judgedKey(ev.act))) continue;
        const b = ev.body as CheckBody;
        const evGen = this.generations.get(`${o.lane}/${ev.generation}`);
        const revoked = invalidity(this.tables(), ev, (this.policy.doc as PolicyDocument).retiredEvidence);
        const runner = cfg.config.runner;
        const res = runner
          ? await evaluateCarry(
              policy,
              {
                kind: "carry",
                evidence: { act: ev.act, kind: "check", verdict: null, by: this.policyActor(ev.authority), from: { generation: ev.generation, head: evGen?.head ?? g.head }, scope: [], dependsOn: [] },
                changedSince: [],
                proposal: this.proposalInput(this.policy.doc, g),
                policy: { same: evGen?.policy === policy.version },
              },
              {
                ...(revoked ? { revoked: revoked.reason } : {}),
                check: { before: { integration: b.integration, config: b.config, runner: b.runner, input: b.input }, now: { integration, tree: now.tree, snapshot, config: cfg.digest as `sha256:${string}`, runner }, volatile: cfg.config.volatile },
              },
              { budget: actMeter(), purpose: l.purpose },
            )
          : { carried: null, notCarried: { act: ev.act, code: "runner-changed" as const, text: "No runner environment is pinned" }, evaluations: [] };
        const carried = res.carried;
        this.system({
          type: "check-carried",
          op,
          lane: o.lane,
          generation: o.generation,
          integration,
          obligation: spec.id,
          act: ev.act,
          policy: policy.version,
          outcome: carried ? { carried: true, reason: carried.reason } : { carried: false, notCarried: res.notCarried! },
          decisions: this.keep(res.evaluations),
        });
        this.checkJudged.add(judgedKey(ev.act));
        if (carried) {
          const at = this.checkCarries.findIndex((c) => c.lane === o.lane && c.generation === o.generation && c.integration === integration && c.obligation === spec.id);
          const row: CheckCarryRow = { lane: o.lane, generation: o.generation, integration, obligation: spec.id, act: ev.act, evidence: carried, policy: policy.version };
          if (at >= 0) this.checkCarries[at] = row;
          else this.checkCarries.push(row);
          break;
        }
      }
    }
  }

  /**
   * Prepare and publish a landing operation (R-LAND-4 to R-PUB-5): land
   * rules at stage `reservation` on an ordinary lane, on the operation's
   * integration (the version's head, unless `carryChecks` set another),
   * then reservation and a fast-forward outcome. A landed
   * `.artroom/policy.json` activates at the next seq, with the checker
   * configurations under `.artroom/checkers/`. With `stop`, only the land
   * rules are evaluated: the landing stays prepared.
   */
  async land(op: OpId, stop = false): Promise<void> {
    const o = this.landOps.get(op)!;
    const l = this.lanes.get(o.lane)!;
    const g = this.generations.get(`${o.lane}/${o.generation}`)!;
    const integration = o.integration ?? g.head;
    // The Room evaluates the land rules only once no blocking obligation is open on the integration (core.ts
    // `readiness`): until then the landing waits, and nothing is sealed.
    if (l.purpose !== "config-recovery" && this.landInput(l, g, o.authority, "reservation", integration).obligations.some((x) => !x.met)) return;
    if (l.purpose !== "config-recovery" && this.policy.doc.rules.some((r) => r.kind === "land")) {
      const input = this.landInput(l, g, o.authority, "reservation", integration);
      const r = await evaluateLand(this.active(), input, { budget: actMeter() });
      this.system({ type: "land-evaluated", op, integration, landInput: r.retained?.digest ?? digestJson(input), decisions: this.keep(r.evaluations) });
    }
    if (stop) return;
    const publication = ++this.publication;
    const reviews = evidenceOn(this.tables(), g.lane, g.generation).filter((e) => e.kind === "review");
    this.system({ type: "land-reserved", op, lane: o.lane, generation: o.generation, integration: g.head, expectedMain: this.main, evidence: [...reviews.map((r) => r.act)], publication });
    this.system({ type: "land-outcome", op, outcome: { state: "landed", commit: g.head, publication } });
    o.done = true;
    g.landed = true;
    this.main = g.head;
    if (g.changed.some((c) => c.path === ".artroom/policy.json")) {
      const files = this.trees.get(g.head)!;
      const checkers = Object.fromEntries(
        Object.entries(files)
          .filter(([p]) => p.startsWith(".artroom/checkers/") && p.endsWith(".json"))
          .map(([p, t]) => [p.slice(".artroom/checkers/".length, -".json".length), JSON.parse(t) as CheckerConfigV2]),
      );
      await this.activate(JSON.parse(files[".artroom/policy.json"]!) as AnyPolicyDocument, checkers, g.head);
    }
  }

  /**
   * Recompute each open version under the document in force (R-POL-9,
   * core.ts `recomputeOne`): `require` by its proposer, then a `carry` call
   * for each carried verdict whose obligation still holds, with
   * `policy.same` false, on one meter. A failed `require` keeps the earlier
   * obligations and blocks landing.
   */
  async recompute(): Promise<void> {
    const policy = this.active();
    for (const g of this.generations.values()) {
      const l = this.lanes.get(g.lane)!;
      if (g.landed || l.generation !== g.generation) continue;
      const paths = [...new Set(g.changed.map((c) => c.path))].sort();
      const admin = adminObligation(policy.version, paths);
      let specs: ObligationSpec[] = admin ? [admin] : [];
      let decisions: Decision[] = [];
      let blocked: Refusal | null = null;
      const meter = actMeter();
      const proposal = this.proposalInput(this.policy.doc, g);
      if (l.purpose !== "config-recovery") {
        const r = await evaluateRequire(policy, { kind: "require", actor: this.policyActorOf(g.proposer), lane: this.policyLane(l), proposal, room: this.policyRoom() }, { budget: meter });
        decisions = this.keep(r.evaluations);
        blocked = r.refusal;
        for (const o of withAdvisory(r.obligations, this.checkers())) if (!specs.some((x) => x.id === o.id)) specs.push(o);
      }
      if (blocked) specs = [...g.obligations];
      const carried: { obligation: ObligationId; evidence: Carried }[] = [];
      const notCarried: NotCarried[] = [...g.notCarried];
      for (const c of g.carried) {
        if (!specs.some((x) => x.id === c.obligation) || l.purpose === "config-recovery") continue;
        const ev = this.evidence.find((e) => e.act === c.evidence.act);
        if (!ev) continue;
        const since = c.evidence.from.head === g.head ? [] : this.changedBetween(c.evidence.from.head, g.head);
        const revoked = invalidity(this.tables(), ev, "reopens");
        const body = ev.body as ReviewBody;
        const res = await evaluateCarry(
          policy,
          {
            kind: "carry",
            evidence: { act: ev.act, kind: "review", verdict: ev.verdict, by: this.policyActor(ev.authority), from: c.evidence.from, scope: body.scope, dependsOn: body.dependsOn ?? [] },
            changedSince: [...since],
            proposal,
            policy: { same: false },
          },
          revoked ? { revoked: revoked.reason } : {},
          { budget: meter, purpose: l.purpose },
        );
        decisions.push(...this.keep(res.evaluations));
        if (res.carried) carried.push({ obligation: c.obligation, evidence: res.carried });
        else if (res.notCarried) notCarried.push(res.notCarried);
      }
      g.obligations = specs;
      g.carried = carried;
      g.notCarried = notCarried;
      g.blocked = blocked ? { rule: blocked.rule, reason: blocked.reason, fix: blocked.fix ?? "" } : null;
      this.system({
        type: "obligations-recomputed",
        policy: policy.version,
        lane: g.lane,
        generation: g.generation,
        decisions,
        obligations: specs.map((o) => o.id),
        reopened: [],
        ...(g.blocked ? { blocked: { refused: true, ...g.blocked } } : {}),
      });
    }
  }

  /**
   * Seal a `prepared` event (R-DECL-20, stage 4) for a version's preview, or
   * with `op` for a landing: the integration (the head, as for a
   * fast-forward, unless given), its tree, and for each scoped checker the
   * snapshot commit and digest the room recorded for it (R-CARRY-15). A
   * check that runs on such a snapshot commit counts for the integration.
   */
  prepared(lane: LaneId, generation: number, opts: { readonly op?: OpId; readonly integration?: Sha; readonly snapshots?: readonly { readonly check: string; readonly commit: Sha; readonly digest: string }[] } = {}): LogEntry {
    const g = this.generations.get(`${lane}/${generation}`)!;
    const integration = opts.integration ?? g.head;
    const snapshots = opts.snapshots ?? [];
    for (const x of snapshots) this.snapshotIntegration.set(`${x.check}/${x.commit}`, integration);
    if (opts.op) this.landOps.get(opts.op)!.integration = integration;
    return this.system({ type: "prepared", owner: opts.op ? { op: opts.op, lane, generation } : { preview: { lane, generation } }, integration, base: g.base, tree: this.treeOf(integration), snapshots });
  }

  /** Invite a member and seal their join, by their own key (R-GEN-6). */
  async join(member: MemberId, role: Role, key: KeyPair): Promise<void> {
    const secret = new Uint8Array(32).fill(key.seed[0]! + 100);
    const inv = await this.act({ signer: keys.alice, kind: "roster", target: null, body: { op: "invite", member, role, custody: "client", expiresAt: this.at(this.entries.length + 3600), secretHash: `sha256:${sha256Hex(secret)}` } });
    await this.act(
      { signer: key, kind: "roster", target: null, body: { op: "join", invitation: inv.id, secret: b64url(secret) } },
      { via: "join", member, role, key: key.key, invitation: inv.id, custody: "client" } as Authority,
    );
  }

  /** The policy version in force. */
  get version(): PolicyVersion {
    return this.policy.version;
  }

  /** The fixture: entries as canonical lines, retained files, and the repository's objects. */
  fixture(about: string): Fixture {
    return {
      about,
      entries: this.entries.map((e) => canonicalize(e)),
      retained: [...new Map(this.retained.map((r) => [retainedPath(r), r])).values()],
      repo: Object.fromEntries([...this.repo.objects].map(([sha, o]) => [sha, { type: o.type, data: b64url(o.data) }])),
    };
  }
}

/** A committed declared-acts fixture (test/fixtures/declared-*.json). */
export interface Fixture {
  readonly about: string;
  readonly entries: readonly string[];
  readonly retained: readonly Retained[];
  /** The room's repository objects: proposed heads and their bases. */
  readonly repo: Readonly<Record<string, { readonly type: "blob" | "tree" | "commit"; readonly data: string }>>;
}

export { logFiles, makeCheckpoint };
