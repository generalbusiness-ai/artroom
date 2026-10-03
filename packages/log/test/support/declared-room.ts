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
 * Simplifications, none of which verify's stage-3 checks read: obligation
 * qualification is by principal only; carrying is not simulated (fixtures
 * propose one version per thread); overlap is not checked; previews are not
 * built, except a `prepared` event when a test asks for one.
 */

import type {
  ActId,
  AnyPolicyDocument,
  Authority,
  Binding,
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
  ObligationId,
  OpId,
  PathChange,
  PolicyActor,
  PolicyDocument,
  PolicyLane,
  PolicyProposal,
  PolicyVersion,
  Refusal,
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
  evaluateLand,
  evaluateRefuse,
  evaluateRequire,
  matchGlob,
  notifyContext,
  ownersFor,
  replay,
  type ActivePolicy,
  type RuleEvaluation,
} from "@generalbusiness/artroom-policy";
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

interface Obligation {
  readonly id: ObligationId;
  readonly kind: "review" | "check";
  readonly from: readonly string[];
}

interface GenerationRow {
  readonly lane: LaneId;
  readonly generation: number;
  readonly head: Sha;
  readonly base: Sha;
  readonly changed: readonly PathChange[];
  readonly proposer: MemberId;
  readonly obligations: readonly Obligation[];
  readonly met: Set<ObligationId>;
  readonly reviews: { act: ActId; member: MemberId; verdict: "approve" | "object"; authority: Authority }[];
  /** A recomputation's failed `require`: landing is refused with it (R-POL-9). */
  blocked: Pick<Refusal, "rule" | "reason" | "fix"> | null;
  landed: boolean;
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
  policy!: { doc: AnyPolicyDocument; version: PolicyVersion; checkers: Record<string, string>; bindings: Readonly<Record<string, Binding>> };
  private readonly policies = new Map<PolicyVersion, DeclaredRoom["policy"]>();
  private readonly members = new Map<MemberId, { role: Role; active: boolean }>();
  private readonly keyRows = new Map<KeyId, { member: MemberId; revoked: boolean }>();
  private readonly teams = new Map<TeamId, MemberId[]>();
  private readonly lanes = new Map<LaneId, LaneRow>();
  private readonly generations = new Map<string, GenerationRow>();
  private readonly entryLane = new Map<ActId, LaneId | null>();
  private readonly invitations = new Map<ActId, { member: MemberId; role: Role | undefined }>();
  private readonly landOps = new Map<OpId, { lane: LaneId; generation: number; authority: Authority; done: boolean }>();
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
    this.keyRows.set(keys.alice.key, { member: "@alice", revoked: false });
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
    this.policy = { doc, version, checkers: Object.fromEntries(named.map((n) => [n.name, n.config])), bindings };
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

  private policyRoom() {
    let admins = 0;
    let members = 0;
    for (const [handle, m] of this.members) {
      if (!m.active) continue;
      members++;
      if (m.role === "admin" && [...this.keyRows.values()].some((k) => k.member === handle && !k.revoked)) admins++;
    }
    return { admins, members };
  }

  private proposalInput(doc: AnyPolicyDocument, g: Pick<GenerationRow, "generation" | "head" | "base" | "changed">): PolicyProposal {
    const paths = [...new Set(g.changed.flatMap((c) => (c.status === "renamed" ? [c.path, c.from] : [c.path])))].sort();
    return { generation: g.generation, head: g.head, base: g.base, changed: g.changed, paths, owners: ownersFor(doc as PolicyDocument, paths) };
  }

  private qualifies(o: Obligation, member: MemberId): boolean {
    const role = this.members.get(member)?.role;
    return o.from.some((p) => p === member || p === `role:${role}`);
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
    if (g) for (const r of g.reviews) if (g.obligations.some((o) => o.kind === "review" && this.qualifies(o, r.member))) reviewers.add(r.member);
    return { roles, reviewers: [...reviewers].sort() };
  }

  /** The land input (core.ts `landInput`): blocking obligations and each qualifying reviewer's latest verdict. */
  private landInput(lane: LaneRow, g: GenerationRow, actor: Authority, stage: "land" | "reservation"): In<"land"> {
    const latest = new Map<MemberId, GenerationRow["reviews"][number]>();
    for (const r of g.reviews) latest.set(r.member, r);
    const reviews = [...latest.values()]
      .filter((r) => g.obligations.some((o) => o.kind === "review" && this.qualifies(o, r.member)))
      .map((r) => ({ act: r.act, verdict: r.verdict, by: this.policyActor(r.authority), basis: "here" as const }))
      .sort((a, b) => (a.act < b.act ? -1 : 1));
    return {
      kind: "land",
      actor: this.policyActor(actor),
      lane: this.policyLane(lane),
      proposal: this.proposalInput(this.policy.doc, g),
      obligations: g.obligations.map((o) => ({ id: o.id, met: g.met.has(o.id) })),
      reviews,
      stage,
    };
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
        const obligations: Obligation[] = paths.some((p) => matchGlob(p, ".artroom/**")) ? [{ id: "obl_admin-approval", kind: "review", from: ["role:admin"] }] : [];
        if (l.purpose !== "config-recovery") {
          const req = await evaluateRequire(policy, { kind: "require", actor: this.policyActor(authority), lane: this.policyLane(l), proposal, room: this.policyRoom() }, { budget: meter });
          decisions.push(...this.keep(req.evaluations));
          if (req.refusal) return refused(req.refusal);
          for (const o of req.obligations) if (!obligations.some((x) => x.id === o.id)) obligations.push({ id: o.id, kind: o.kind, from: o.kind === "review" ? o.from : o.by });
        }
        effects = [
          { type: "proposed", lane: l.id, generation, head },
          ...(obligations.length ? [{ type: "obligations" as const, lane: l.id, generation, opened: obligations.map((o) => o.id), met: [] }] : []),
          { type: "renewed", lane: l.id, expiresAt },
        ];
        notify = { lane: l.id, proposal };
        apply = () => {
          this.generations.set(`${l.id}/${generation}`, { lane: l.id, generation, head, base: this.main, changed, proposer: authority.member!, obligations, met: new Set(), reviews: [], blocked: null, landed: false });
          l.generation = generation;
        };
        break;
      }
      case "review": {
        const t = env.target as { lane: LaneId; generation: number };
        const l = lane(t.lane)!;
        const g = this.generations.get(`${t.lane}/${t.generation}`)!;
        recovery(l);
        const member = authority.member!;
        const author = member === g.proposer || (l.state === "held" && l.holder === member);
        if (author && env.body["verdict"] === "approve" && this.policyRoom().admins === 1 && authority.role === "admin" && g.obligations.some((o) => o.id === "obl_admin-approval")) flags.push("sole-admin-self-approval");
        const r = await refuse(l, null);
        if (r) return refused(r);
        const meets = env.body["verdict"] === "approve" ? g.obligations.filter((o) => o.kind === "review" && !g.met.has(o.id) && this.qualifies(o, member)).map((o) => o.id) : [];
        effects = meets.length ? [{ type: "obligations", lane: l.id, generation: g.generation, opened: [], met: meets }] : [];
        notify = { lane: l.id, proposal: this.proposalInput(this.policy.doc, g) };
        apply = (id) => {
          for (const o of meets) g.met.add(o);
          g.reviews.push({ act: id, member, verdict: env.body["verdict"] as "approve", authority });
        };
        break;
      }
      case "check": {
        const t = env.target as { lane: LaneId; generation: number };
        const l = lane(t.lane)!;
        const g = this.generations.get(`${t.lane}/${t.generation}`)!;
        const r = await refuse(l, null);
        if (r) return refused(r);
        const o = env.body["obligation"] as ObligationId;
        effects = env.body["ok"] === true && !g.met.has(o) ? [{ type: "obligations", lane: l.id, generation: g.generation, opened: [], met: [o] }] : [];
        notify = { lane: l.id, proposal: this.proposalInput(this.policy.doc, g) };
        apply = () => {
          if (env.body["ok"] === true) g.met.add(o);
        };
        break;
      }
      case "land": {
        const t = env.target as { lane: LaneId; generation: number };
        const l = lane(t.lane)!;
        const g = this.generations.get(`${t.lane}/${t.generation}`)!;
        recovery(l);
        if (g.blocked) return refused(g.blocked);
        const open = g.obligations.find((o) => o.kind === "review" && !g.met.has(o.id));
        if (open) return refused({ rule: "obligation-open", reason: `The obligation ${open.id} is open.`, fix: "Meet it, then land." });
        const r = await refuse(l, null);
        if (r) return refused(r);
        if (l.purpose !== "config-recovery") {
          const lr = await evaluateLand(policy, this.landInput(l, g, authority, "land"), { budget: meter });
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
            this.keyRows.set(a.signer.key, { member: inv.member, revoked: false });
          }
          if (op.op === "team") this.teams.set(op["team"] as TeamId, [...(op["members"] as MemberId[])].sort());
          if (op.op === "set-role") this.members.get(op["member"] as MemberId)!.role = op["role"] as Role;
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
   * Prepare and publish a landing operation (R-LAND-4 to R-PUB-5): land
   * rules at stage `reservation` on an ordinary lane, then reservation and a
   * fast-forward outcome. A landed `.artroom/policy.json` activates at the
   * next seq, with the checker configurations under `.artroom/checkers/`.
   */
  async land(op: OpId): Promise<void> {
    const o = this.landOps.get(op)!;
    const l = this.lanes.get(o.lane)!;
    const g = this.generations.get(`${o.lane}/${o.generation}`)!;
    if (l.purpose !== "config-recovery" && this.policy.doc.rules.some((r) => r.kind === "land")) {
      const input = this.landInput(l, g, o.authority, "reservation");
      const r = await evaluateLand(this.active(), input, { budget: actMeter() });
      this.system({ type: "land-evaluated", op, integration: g.head, landInput: r.retained?.digest ?? digestJson(input), decisions: this.keep(r.evaluations) });
    }
    const publication = ++this.publication;
    this.system({ type: "land-reserved", op, lane: o.lane, generation: o.generation, integration: g.head, expectedMain: this.main, evidence: [...g.reviews.map((r) => r.act)], publication });
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
   * Recompute each version not yet landed under the document in force
   * (R-POL-9, core.ts `recomputeOne`): `require` by its proposer, on one
   * meter; a failed `require` blocks landing. Carrying is not simulated.
   */
  async recompute(): Promise<void> {
    const policy = this.active();
    for (const g of this.generations.values()) {
      if (g.landed) continue;
      const l = this.lanes.get(g.lane)!;
      let decisions: Decision[] = [];
      let blocked: Refusal | null = null;
      if (l.purpose !== "config-recovery") {
        const r = await evaluateRequire(policy, { kind: "require", actor: this.policyActorOf(g.proposer), lane: this.policyLane(l), proposal: this.proposalInput(this.policy.doc, g), room: this.policyRoom() }, { budget: actMeter() });
        decisions = this.keep(r.evaluations);
        blocked = r.refusal;
      }
      g.blocked = blocked ? { rule: blocked.rule, reason: blocked.reason, fix: blocked.fix ?? "" } : null;
      this.system({
        type: "obligations-recomputed",
        policy: policy.version,
        lane: g.lane,
        generation: g.generation,
        decisions,
        obligations: g.obligations.map((o) => o.id),
        reopened: [],
        ...(g.blocked ? { blocked: { refused: true, ...g.blocked } } : {}),
      });
    }
  }

  /** Seal a `prepared` event for a version's preview (R-DECL-20, stage 4): the integration is the head, as for a fast-forward. */
  prepared(lane: LaneId, generation: number): LogEntry {
    const g = this.generations.get(`${lane}/${generation}`)!;
    const tree = (/^tree ([0-9a-f]{40})/.exec(new TextDecoder().decode(this.repo.objects.get(g.head)!.data))![1]) as Sha;
    return this.system({ type: "prepared", owner: { preview: { lane, generation } }, integration: g.head, base: g.base, tree, snapshots: [] });
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
