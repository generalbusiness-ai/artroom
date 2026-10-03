/**
 * The thread fold: what verify re-derives about threads and their versions
 * from earlier entries, so that it can rebuild each policy input the room
 * built (R-EVAL-3, R-EVAL-8; notes/2026-10-02-declared-acts.md sections 4.3
 * and 4.4). It is built from envelopes, receipt effects and system events,
 * as the room's own tables are:
 * - a thread opens with the `opened` effect of the act that opened it, or
 *   with a `revert-lane` event (kind `room`), and keeps its kind, purpose
 *   and scope source for its life (R-DECL-6, R-DECL-7);
 * - `rescoped`, `taken-over`, `released`, `expired` and `handed-over`
 *   effects and `lease-expired` events move its holder, lease generation
 *   and current scope; `proposed` effects add its versions;
 * - `land-op` effects name each landing operation and the act behind it;
 * - `obligations-recomputed` events record a version's blocked refusal;
 * - `prepared` events record the integrations the room prepared (R-DECL-20);
 * - each version keeps the obligations its `require` call made, the policy
 *   version that made them and the verdicts carried onto it; each accepted
 *   review and check is an evidence row, with the facts fixed at its
 *   admission; each `check-carried` event is a judgement, and a carry when
 *   it carried (obligations.ts reads these).
 *
 * Stage 3 takes receipt effects as recorded; re-deriving them and comparing
 * (`effect-mismatch`) is stage 6. A version's base and changed paths are its
 * witness: checked against Git objects when they are present
 * (`gitChanges`), and otherwise taken from the context the room retained,
 * which the report names as `git-unwitnessed`.
 */

import type {
  ActId,
  Authority,
  Carried,
  CheckBody,
  Envelope,
  Flag,
  Glob,
  KeyId,
  LaneId,
  LanePurpose,
  MemberId,
  ObligationId,
  OpId,
  PathChange,
  PolicyDocument,
  PolicyLane,
  PolicyProposal,
  PolicyVersion,
  Receipt,
  RepoPath,
  ReviewBody,
  Sha,
  SystemEvent,
  TeamId,
  Verdict,
} from "@generalbusiness/artroom-contract";
import { ownersFor, type ObligationSpec } from "@generalbusiness/artroom-policy";
import { parseCommit, parseTree, type GitReader } from "./git.ts";
import { declarationOf, type Vocabulary } from "./declared.ts";

export interface Thread {
  readonly id: LaneId;
  /** The opening act's kind, or `room` for a revert thread (R-DECL-6). */
  readonly kind: string;
  readonly purpose: LanePurpose;
  /** `body.scope`, or `fixed` for a scope filled from the opening declaration's template (R-DECL-7). */
  readonly scopeSource: "body.scope" | "fixed";
  scope: readonly Glob[];
  state: "held" | "unheld";
  holder: MemberId | null;
  leaseGen: number;
  /** The latest version; 0 before the first. */
  generation: number;
}

/** A version's base and changed paths, as verify accepted them (R-PROP-3; note 4.3). */
export interface Witness {
  readonly base: Sha;
  readonly changed: readonly PathChange[];
}

/** One version of a thread, as the policy inputs read it (R-PROP-3). */
export interface Version {
  readonly lane: LaneId;
  readonly generation: number;
  readonly head: Sha;
  /** Null until a retained context of the version, or of a later call on it, names its base and changes. */
  witness: Witness | null;
  readonly proposer: MemberId;
  readonly act: ActId;
  /** The refusal that blocks landing, from the latest `obligations-recomputed` event (R-POL-9). */
  blocked: { readonly rule: string } | null;
  /** The policy version in force when it was proposed (the room's `generations.policy`). */
  readonly policy: PolicyVersion | null;
  /**
   * The obligations the `require` call made, at the proposal or at the
   * latest recomputation that was not blocked (R-POL-3, R-POL-9), with
   * advisory checks marked (R-OBL-7). The platform's `obl_admin-approval`
   * is added from the witness's paths (obligations.ts `specsOf`).
   */
  required: readonly ObligationSpec[];
  /** The policy version that made `required`. */
  specPolicy: PolicyVersion | null;
  /** Whether the proposal's receipt opened `obl_admin-approval`: used only while the version has no witness. */
  readonly adminOpened: boolean;
  /** Earlier verdicts carried onto this version, by obligation (R-CARRY-1 to 5). */
  carried: readonly { readonly obligation: ObligationId; readonly evidence: Carried }[];
  /**
   * Earlier verdicts whose carry onto this version the log cannot decide:
   * the paths changed since their head need Git objects that are absent,
   * and no carry call is recorded for them. Each either carried on the
   * platform's conditions alone, or did not.
   */
  maybe: readonly { readonly obligation: ObligationId; readonly act: ActId }[];
}

/** What verify derived about a version when its proposal was admitted. */
export interface Made {
  readonly policy: PolicyVersion | null;
  readonly required: readonly ObligationSpec[];
  readonly carried: readonly { readonly obligation: ObligationId; readonly evidence: Carried }[];
  readonly maybe: readonly { readonly obligation: ObligationId; readonly act: ActId }[];
}

/**
 * One accepted review or check, with the facts fixed at its admission
 * (R-REV-1, R-OBL-2, R-OBL-3; the room's `evidence` table).
 */
export interface EvidenceRow {
  readonly act: ActId;
  readonly seq: number;
  readonly kind: "review" | "check";
  readonly lane: LaneId;
  readonly generation: number;
  readonly head: Sha;
  readonly member: MemberId;
  readonly key: KeyId;
  /** The grantor key, for a delegated act. */
  readonly grantor: KeyId | null;
  readonly verdict: Verdict | null;
  readonly flags: readonly Flag[];
  readonly authority: Authority;
  /** The member's teams when it was admitted. */
  readonly teams: readonly TeamId[];
  /** Whether the member was the version's proposer or the thread's holder when it was admitted. */
  readonly author: boolean;
  readonly body: ReviewBody | CheckBody;
  /**
   * For a check, the integration it counts for (R-CARRY-15 step 5): its own
   * `integration`, or the integration a `prepared` event names for the
   * snapshot commit it ran on. Null for a review. Undefined when the log
   * cannot say: a check on a filtered snapshot with no `prepared` event for
   * its version.
   */
  readonly canonical: Sha | null | undefined;
}

/** A check carried onto an integration by a `check-carried` event (R-CARRY-13; the room's `check_carries`). */
export interface CheckCarry {
  readonly lane: LaneId;
  readonly generation: number;
  readonly integration: Sha;
  readonly obligation: ObligationId;
  readonly act: ActId;
  readonly evidence: Carried;
  readonly policy: PolicyVersion;
}

/** A landing operation: the `land` act that started it (R-LAND-1). */
export interface LandOp {
  readonly lane: LaneId;
  readonly generation: number;
  readonly act: ActId;
  readonly authority: Authority;
}

/** A `prepared` event (`PreparedEvent`, R-DECL-20), as decoded. */
export interface Prepared {
  readonly owner: { readonly preview: { readonly lane: LaneId; readonly generation: number } } | { readonly op: OpId; readonly lane: LaneId; readonly generation: number };
  readonly integration: Sha;
  readonly tree: Sha;
  readonly snapshots: readonly { readonly check: string; readonly commit: Sha; readonly digest: string }[];
}

const key = (lane: string, generation: number) => `${lane}/${generation}`;

/** The key of a check carry: one per lane, generation, integration and obligation. */
export const carryKey = (lane: string, generation: number, integration: string, obligation: string) => `${lane}/${generation}/${integration}/${obligation}`;

/** Every path a change names: old and new for a rename (R-PROP-4); sorted and distinct, as the room's `changedPaths`. */
export function changedPaths(changed: readonly PathChange[]): RepoPath[] {
  const out = new Set<string>();
  for (const c of changed) {
    out.add(c.path);
    if (c.status === "renamed") out.add(c.from);
  }
  return [...out].sort();
}

export class Fold {
  readonly threads = new Map<LaneId, Thread>();
  readonly versions = new Map<string, Version>();
  /** The thread each entry belongs to, as the room indexes it (`entries.lane`). */
  readonly entryLane = new Map<ActId, LaneId | null>();
  readonly landOps = new Map<OpId, LandOp>();
  /** Kinds that have opened a thread in this log: the historical opening kinds of R-DECL-8. */
  readonly openingKinds = new Set<string>();
  readonly prepared: Prepared[] = [];
  /** Every accepted review and check: by version in seq order, and by act. Each lookup is one map read. */
  private readonly evidenceByVersion = new Map<string, EvidenceRow[]>();
  private readonly evidenceById = new Map<ActId, EvidenceRow>();
  /** The latest carry of a check onto each integration, by lane, generation and obligation. */
  private readonly checkCarries = new Map<string, Map<Sha, CheckCarry>>();
  /** Each `check-carried` judgement made: lane, generation, integration, obligation, act and policy (R-CARRY-13). */
  readonly checkJudged = new Set<string>();

  /** Record an accepted review or check. Rows arrive in seq order. */
  addEvidence(row: EvidenceRow): void {
    const k = key(row.lane, row.generation);
    const rows = this.evidenceByVersion.get(k);
    if (rows) rows.push(row);
    else this.evidenceByVersion.set(k, [row]);
    this.evidenceById.set(row.act, row);
  }

  /** The evidence on one version, in seq order (the room's `evidenceOn`). */
  evidenceOn(lane: LaneId, generation: number): readonly EvidenceRow[] {
    return this.evidenceByVersion.get(key(lane, generation)) ?? [];
  }

  evidenceByAct(act: ActId): EvidenceRow | null {
    return this.evidenceById.get(act) ?? null;
  }

  /** Record a carried check: the latest carry onto its integration replaces an earlier one (the room's `check_carries`). */
  addCheckCarry(c: CheckCarry): void {
    const k = `${key(c.lane, c.generation)}/${c.obligation}`;
    const carries = this.checkCarries.get(k) ?? new Map<Sha, CheckCarry>();
    carries.set(c.integration, c);
    this.checkCarries.set(k, carries);
  }

  /** The checks carried onto integrations of one version for one obligation. */
  checkCarriesOn(lane: LaneId, generation: number, obligation: ObligationId): readonly CheckCarry[] {
    return [...(this.checkCarries.get(`${key(lane, generation)}/${obligation}`)?.values() ?? [])];
  }

  thread(lane: unknown): Thread | null {
    return typeof lane === "string" ? (this.threads.get(lane as LaneId) ?? null) : null;
  }

  version(lane: LaneId, generation: number): Version | null {
    return this.versions.get(key(lane, generation)) ?? null;
  }

  /**
   * The lane as policy sees it (R-EVAL-3), or the room's null lane. Under a
   * `v2` document it carries the thread's kind (`DeclaredPolicyLane`, R-EVAL-3
   * as amended).
   */
  policyLane(t: Thread | null, declared: boolean): PolicyLane {
    const lane: PolicyLane = t
      ? { id: t.id, claimed: t.state === "held", holder: t.holder, scope: t.scope, generation: t.generation, purpose: t.purpose }
      : { id: null, claimed: false, holder: null, scope: [], generation: 0, purpose: "ordinary" };
    return declared ? ({ ...lane, kind: t?.kind ?? null } as PolicyLane) : lane;
  }

  /**
   * The proposal as policy sees it, with owners under `doc` (R-EVAL-3, the
   * room's `proposalInput`). A version with no witness yet has none of its
   * changes: the call it is for then has no recorded context to compare.
   */
  static proposal(doc: PolicyDocument, v: Pick<Version, "generation" | "head" | "witness">): PolicyProposal {
    const changed = v.witness?.changed ?? [];
    const paths = changedPaths(changed);
    return { generation: v.generation, head: v.head, base: v.witness?.base ?? v.head, changed, paths, owners: ownersFor(doc, paths) };
  }

  /**
   * Fold an accepted act's effects. `witness` is the base and changed paths
   * of a version it made, as verify accepted them.
   */
  applyAct(id: ActId, env: Envelope, receipt: Receipt, vocab: Vocabulary, witness: Witness | null, made: Made = { policy: null, required: [], carried: [], maybe: [] }): void {
    const target = env.target as { lane?: unknown; generation?: unknown } | null;
    const lane = target && typeof target.lane === "string" ? (target.lane as LaneId) : null;
    let self = false;
    for (const effect of receipt.effects) {
      switch (effect.type) {
        case "opened": {
          self = true;
          const body = env.body as { scope?: readonly Glob[] };
          const hold = declarationOf(vocab, env.kind)?.hold;
          const fixed = hold !== undefined && hold.scope !== "body.scope";
          // A template's slots are filled from the act's own fields (R-DECL-7).
          const scope = fixed ? (hold!.scope as readonly Glob[]).map((g) => g.replace(/\{([^{}]*)\}/g, (_, f: string) => String((env.body as Record<string, unknown>)[f]))) : (body.scope ?? []);
          this.threads.set(id, {
            id,
            kind: env.kind,
            purpose: effect.purpose,
            scopeSource: fixed ? "fixed" : "body.scope",
            scope,
            state: "held",
            holder: effect.lease.holder,
            leaseGen: effect.lease.generation,
            generation: 0,
          });
          this.openingKinds.add(env.kind);
          break;
        }
        case "rescoped": {
          const t = this.threads.get(effect.lane);
          if (t) t.scope = effect.scope;
          break;
        }
        case "taken-over": {
          const t = this.threads.get(effect.lane);
          if (!t) break;
          t.state = "held";
          t.holder = effect.lease.holder;
          t.leaseGen = effect.lease.generation;
          const scope = (env.body as { scope?: readonly Glob[] }).scope;
          if (scope) t.scope = scope;
          break;
        }
        case "proposed": {
          const t = this.threads.get(effect.lane);
          if (t) t.generation = effect.generation;
          this.versions.set(key(effect.lane, effect.generation), {
            lane: effect.lane,
            generation: effect.generation,
            head: effect.head,
            witness,
            proposer: receipt.authority.member!,
            act: id,
            blocked: null,
            policy: made.policy,
            required: made.required,
            specPolicy: made.policy,
            adminOpened: receipt.effects.some((x) => x.type === "obligations" && x.generation === effect.generation && x.opened.includes("obl_admin-approval" as ObligationId)),
            carried: made.carried,
            maybe: made.maybe,
          });
          break;
        }
        case "released":
        case "expired": {
          const t = this.threads.get(effect.lane);
          if (!t) break;
          t.state = "unheld";
          t.holder = null;
          t.leaseGen = effect.leaseGeneration + 1;
          break;
        }
        case "land-op":
          if (lane && typeof target?.generation === "number") this.landOps.set(effect.op, { lane, generation: target.generation, act: id, authority: receipt.authority });
          break;
        default: {
          // `handed-over` (R-DECL-10, stage 4) ends the hold at the new lease generation.
          const e = effect as { type: string; lane?: LaneId; leaseGeneration?: number };
          if (e.type === "handed-over" && e.lane) {
            const t = this.threads.get(e.lane);
            if (t) {
              t.state = "unheld";
              t.holder = null;
              t.leaseGen = e.leaseGeneration ?? t.leaseGen + 1;
            }
          }
        }
      }
    }
    this.entryLane.set(id, self ? id : lane);
  }

  /** Index a recorded refusal: it belongs to the thread it names (`entries.lane`). */
  applyRefusal(id: ActId, env: Envelope): void {
    const target = env.target as { lane?: unknown } | null;
    this.entryLane.set(id, target && typeof target.lane === "string" ? (target.lane as LaneId) : null);
  }

  applySystem(id: ActId, ev: SystemEvent): void {
    const e = ev as SystemEvent | { readonly type: "prepared" } | { readonly type: "reservation-ended"; readonly lane: LaneId };
    this.entryLane.set(id, "lane" in e && typeof e.lane === "string" ? (e.lane as LaneId) : null);
    switch (e.type) {
      case "lease-expired": {
        const t = this.threads.get(e.lane);
        if (!t) break;
        t.state = "unheld";
        t.holder = null;
        t.leaseGen = e.leaseGeneration + 1;
        break;
      }
      case "revert-lane":
        this.entryLane.set(id, id);
        this.threads.set(id, { id, kind: "room", purpose: "ordinary", scopeSource: "body.scope", scope: e.scope, state: "unheld", holder: null, leaseGen: 0, generation: 0 });
        break;
      case "obligations-recomputed": {
        const v = this.versions.get(key(e.lane, e.generation));
        if (v) v.blocked = e.blocked ? { rule: e.blocked.rule } : null;
        break;
      }
      case "prepared":
        this.prepared.push(e as unknown as Prepared);
        break;
      default:
        break;
    }
  }

  /** The `prepared` events for a check's version, or its landing operation (R-DECL-20). */
  preparedFor(lane: LaneId, generation: number, op: OpId | undefined): readonly Prepared[] {
    return this.prepared.filter((p) =>
      op !== undefined ? "op" in p.owner && p.owner.op === op : "preview" in p.owner && p.owner.preview.lane === lane && p.owner.preview.generation === generation,
    );
  }
}

// ------------------------------------------------------------- the witness

/** What one tree holds at each path: blob ID and whether it is a tree. */
async function readTree(reader: GitReader, sha: Sha): Promise<Map<string, { sha: Sha; tree: boolean }> | null> {
  try {
    const o = await reader.readObject(sha);
    if (o.type !== "tree") return null;
    return new Map(parseTree(o.data).map((e) => [e.name, { sha: e.sha, tree: e.mode === "40000" }]));
  } catch {
    return null;
  }
}

/** A commit's tree, or null when the commit object is absent. */
export async function treeOf(reader: GitReader, commit: Sha): Promise<Sha | null> {
  try {
    const o = await reader.readObject(commit);
    return o.type === "commit" ? parseCommit(o.data).tree : null;
  } catch {
    return null;
  }
}

/** The most tree entries a witness diff reads before it gives up as unwitnessed (the room's diff bound, R-PROP-6). */
const WITNESS_ENTRIES = 100_000;

/**
 * The changes from `base` to `head` that Git objects show, with exact
 * renames paired as the room's diff pairs them (a deleted and an added path
 * with the same blob ID, in path order); or null when any object needed is
 * absent, which leaves the version `git-unwitnessed`.
 */
export async function gitChanges(reader: GitReader, base: Sha, head: Sha): Promise<PathChange[] | null> {
  const [a, b] = await Promise.all([treeOf(reader, base), treeOf(reader, head)]);
  if (!a || !b) return null;
  const added = new Map<string, Sha>();
  const deleted = new Map<string, Sha>();
  const modified = new Set<string>();
  let seen = 0;
  const all = async (tree: Sha, prefix: string, into: Map<string, Sha>): Promise<boolean> => {
    const t = await readTree(reader, tree);
    if (!t) return false;
    for (const [name, e] of t) {
      if (++seen > WITNESS_ENTRIES) return false;
      if (e.tree) {
        if (!(await all(e.sha, `${prefix}${name}/`, into))) return false;
      } else into.set(prefix + name, e.sha);
    }
    return true;
  };
  const walk = async (x: Sha, y: Sha, prefix: string): Promise<boolean> => {
    if (x === y) return true;
    const [ta, tb] = await Promise.all([readTree(reader, x), readTree(reader, y)]);
    if (!ta || !tb) return false;
    for (const [name, e] of ta) {
      if (++seen > WITNESS_ENTRIES) return false;
      const f = tb.get(name);
      const p = prefix + name;
      if (f && f.sha === e.sha && f.tree === e.tree) continue;
      if (f && e.tree && f.tree) {
        if (!(await walk(e.sha, f.sha, `${p}/`))) return false;
      } else if (f && !e.tree && !f.tree) modified.add(p);
      else {
        if (e.tree) {
          if (!(await all(e.sha, `${p}/`, deleted))) return false;
        } else deleted.set(p, e.sha);
        if (f) {
          if (f.tree) {
            if (!(await all(f.sha, `${p}/`, added))) return false;
          } else added.set(p, f.sha);
        }
      }
    }
    for (const [name, f] of tb) {
      if (ta.has(name)) continue;
      const p = prefix + name;
      if (f.tree) {
        if (!(await all(f.sha, `${p}/`, added))) return false;
      } else added.set(p, f.sha);
    }
    return true;
  };
  if (!(await walk(a, b, ""))) return null;
  const cmp = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
  const byBlob = new Map<string, string[]>();
  for (const [path, blob] of [...deleted].sort(([x], [y]) => cmp(x, y))) byBlob.set(blob, [...(byBlob.get(blob) ?? []), path]);
  const out: PathChange[] = [];
  const renamedFrom = new Set<string>();
  for (const [path, blob] of [...added].sort(([x], [y]) => cmp(x, y))) {
    const from = byBlob.get(blob)?.shift();
    if (from !== undefined) {
      renamedFrom.add(from);
      out.push({ status: "renamed", path, from });
    } else out.push({ status: "added", path });
  }
  for (const path of deleted.keys()) if (!renamedFrom.has(path)) out.push({ status: "deleted", path });
  for (const path of modified) out.push({ status: "modified", path });
  return out.sort((x, y) => cmp(x.path, y.path) || cmp(x.status, y.status));
}

/** The changes Git shows that a recorded list leaves out (the dangerous direction: fewer paths, fewer obligations). */
export function missingChanges(recorded: readonly PathChange[], git: readonly PathChange[]): PathChange[] {
  const id = (c: PathChange) => `${c.status}\u0000${c.path}\u0000${c.status === "renamed" ? c.from : ""}`;
  const have = new Set(recorded.map(id));
  return git.filter((c) => !have.has(id(c)));
}
