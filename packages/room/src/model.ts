/**
 * Lanes, generations and evidence as stored, and their public views
 * (R-LANE, R-PROP, R-OBL). All reads are synchronous.
 */

import type {
  ActId,
  Authority,
  Carried,
  CheckBody,
  Flag,
  Generation,
  GenerationSummary,
  Glob,
  Lane,
  LaneId,
  LanePurpose,
  LeaseGeneration,
  MemberId,
  NotCarried,
  ObligationId,
  OpId,
  Overlap,
  PathChange,
  PolicyVersion,
  Refusal,
  ReviewBody,
  Seq,
  Sha,
  TeamId,
  Verdict,
} from "@generalbusiness/artroom-contract";
import { globsOverlap, overlapIsCertain } from "./glob.ts";
import { iso } from "./ids.ts";
import type { ObligationSpec, Sql, SqlRow } from "./ports.ts";
import { json, num, one, str } from "./store.ts";

export interface LaneRow {
  readonly id: LaneId;
  readonly seq: Seq;
  readonly purpose: LanePurpose;
  readonly goal: string;
  readonly plan: string | null;
  readonly scope: readonly Glob[];
  readonly generation: Generation;
  /** The current lease generation while held; the last one while unheld. */
  readonly leaseGen: LeaseGeneration;
  readonly holder: MemberId | null;
  readonly expiresMs: number | null;
  readonly state: "held" | "unheld";
  readonly why: "released" | "expired" | "opened-by-room" | null;
  readonly handover: ActId | null;
  readonly revertOf: OpId | null;
}

export function laneRow(sql: Sql, id: string): LaneRow | null {
  const r = one(sql, "SELECT * FROM lanes WHERE id = ?", id);
  if (!r) return null;
  return {
    id: str(r, "id") as LaneId,
    seq: num(r, "seq")!,
    purpose: str(r, "purpose") as LanePurpose,
    goal: str(r, "goal")!,
    plan: str(r, "plan"),
    scope: json<Glob[]>(r, "scope")!,
    generation: num(r, "generation")!,
    leaseGen: num(r, "lease_gen")!,
    holder: str(r, "holder") as MemberId | null,
    expiresMs: num(r, "expires_ms"),
    state: str(r, "state") as "held" | "unheld",
    why: str(r, "why") as LaneRow["why"],
    handover: str(r, "handover") as ActId | null,
    revertOf: str(r, "revert_of") as OpId | null,
  };
}

export function heldLanes(sql: Sql): LaneRow[] {
  return sql.all("SELECT id FROM lanes WHERE state = 'held' ORDER BY seq").map((r) => laneRow(sql, str(r, "id")!)!);
}

export function allLaneIds(sql: Sql): LaneId[] {
  return sql.all("SELECT id FROM lanes ORDER BY seq").map((r) => str(r, "id") as LaneId);
}

export interface GenerationRow {
  readonly lane: LaneId;
  readonly generation: Generation;
  readonly act: ActId;
  readonly seq: Seq;
  readonly head: Sha;
  readonly base: Sha;
  readonly summary: string;
  readonly proposer: MemberId;
  readonly changed: readonly PathChange[];
  readonly obligations: readonly ObligationSpec[];
  readonly carried: readonly { readonly obligation: ObligationId; readonly evidence: Carried }[];
  readonly notCarried: readonly NotCarried[];
  readonly policy: PolicyVersion;
  readonly landed: { readonly commit: Sha; readonly at: Seq } | null;
  /** Set when a `require` rule failed at a later activation: no landing until a new generation or policy (R-POL-9). */
  readonly blocked: Refusal | null;
  /** The policy version whose obligations are still being recomputed after activation, if any. */
  readonly recompute: PolicyVersion | null;
}

export function generationRow(sql: Sql, lane: string, generation: number): GenerationRow | null {
  const r = one(sql, "SELECT * FROM generations WHERE lane = ? AND generation = ?", lane, generation);
  if (!r) return null;
  return {
    lane: str(r, "lane") as LaneId,
    generation: num(r, "generation")!,
    act: str(r, "act") as ActId,
    seq: num(r, "seq")!,
    head: str(r, "head") as Sha,
    base: str(r, "base") as Sha,
    summary: str(r, "summary")!,
    proposer: str(r, "proposer") as MemberId,
    changed: json<PathChange[]>(r, "changed")!,
    obligations: json<ObligationSpec[]>(r, "obligations")!,
    carried: json<GenerationRow["carried"]>(r, "carried")!,
    notCarried: json<NotCarried[]>(r, "not_carried")!,
    policy: str(r, "policy") as PolicyVersion,
    landed: json<GenerationRow["landed"]>(r, "landed"),
    blocked: json<Refusal>(r, "blocked"),
    recompute: str(r, "recompute") as PolicyVersion | null,
  };
}

/** Old and new paths of a change list (R-PROP-3). */
export function changedPaths(changed: readonly PathChange[]): string[] {
  const out = new Set<string>();
  for (const c of changed) {
    out.add(c.path);
    if (c.status === "renamed") out.add(c.from);
  }
  return [...out].sort();
}

export interface EvidenceRow {
  readonly act: ActId;
  readonly seq: Seq;
  readonly kind: "review" | "check";
  readonly lane: LaneId;
  readonly generation: Generation;
  readonly head: Sha;
  readonly member: MemberId;
  readonly key: string;
  readonly grantor: string | null;
  readonly verdict: Verdict | null;
  /** Obligations this act's recorded authority qualified for at admission (R-REV-1). */
  readonly qualifies: readonly ObligationId[];
  readonly flags: readonly Flag[];
  readonly authority: Authority;
  /** Facts fixed at admission: the member's teams, and whether the member was an author (R-REV-1, R-OBL-2). */
  readonly admission: EvidenceAdmission;
  readonly body: ReviewBody | CheckBody;
  /**
   * For a check, the canonical integration it counts for, fixed at admission
   * (R-CARRY-15 step 5): its own `integration`, or, for a recorded snapshot
   * commit, the integration of its land operation or preview that the room
   * recorded the snapshot for. Never looked up again from the snapshot
   * commit, which several integrations can share (review 95323c2b). Null for
   * a review.
   */
  readonly canonical: Sha | null;
}

export interface EvidenceAdmission {
  readonly teams: readonly TeamId[];
  /** The proposer of that generation, or the lane's holder, when the evidence was admitted. */
  readonly author: boolean;
}

function evidenceFrom(r: SqlRow): EvidenceRow {
  const body = JSON.parse(r["body"] as string) as { authority: Authority; admission?: EvidenceAdmission; body: ReviewBody | CheckBody; canonical?: Sha };
  const kind = r["kind"] as "review" | "check";
  return {
    act: r["act"] as ActId,
    seq: r["seq"] as number,
    kind,
    lane: r["lane"] as LaneId,
    generation: r["generation"] as number,
    head: r["head"] as Sha,
    member: r["member"] as MemberId,
    key: r["key"] as string,
    grantor: (r["grantor"] as string | null) ?? null,
    verdict: (r["verdict"] as Verdict | null) ?? null,
    qualifies: JSON.parse(r["qualifies"] as string) as ObligationId[],
    flags: JSON.parse(r["flags"] as string) as Flag[],
    authority: body.authority,
    // Migration 4 records these for earlier evidence; a missing record is judged as an author, which can only take eligibility away.
    admission: body.admission ?? { teams: [], author: true },
    body: body.body,
    // A check admitted before review 95323c2b counts only for the commit it names: a snapshot commit is no
    // integration, so such a scoped check counts for nothing, and the obligation waits for a new one.
    canonical: kind === "check" ? (body.canonical ?? (body.body as CheckBody).integration) : null,
  };
}

export function evidenceOn(sql: Sql, lane: string, generation: number): EvidenceRow[] {
  return sql.all("SELECT * FROM evidence WHERE lane = ? AND generation = ? ORDER BY seq", lane, generation).map(evidenceFrom);
}

export function evidenceByAct(sql: Sql, act: string): EvidenceRow | null {
  const r = one(sql, "SELECT * FROM evidence WHERE act = ?", act);
  return r ? evidenceFrom(r) : null;
}

/** Evidence signed by a key, or by a delegate of it (R-REV-3). */
export function evidenceByKey(sql: Sql, key: string): EvidenceRow[] {
  return sql.all("SELECT * FROM evidence WHERE key = ? OR grantor = ? ORDER BY seq", key, key).map(evidenceFrom);
}

/** Overlaps between a scope and every other held lane (R-PATH-3). */
export function overlapsFor(sql: Sql, lane: LaneId | null, scope: readonly Glob[]): Overlap[] {
  const out: Overlap[] = [];
  for (const other of heldLanes(sql)) {
    if (other.id === lane) continue;
    for (const mine of scope)
      for (const theirs of other.scope)
        if (globsOverlap(mine, theirs)) out.push({ lane: other.id, holder: other.holder, mine, theirs, certain: overlapIsCertain(mine, theirs) });
  }
  return out;
}

export function generationSummaries(sql: Sql, lane: string): GenerationSummary[] {
  return sql
    .all("SELECT generation FROM generations WHERE lane = ? ORDER BY generation", lane)
    .map((r) => generationRow(sql, lane, num(r, "generation")!)!)
    .map((g) => ({ generation: g.generation, head: g.head, act: g.act, ...(g.landed ? { landed: g.landed } : {}) }));
}

/** The public view of a lane (contract `Lane`). */
export function laneView(sql: Sql, row: LaneRow, landing: OpId | undefined): Lane {
  const base = {
    lane: row.id,
    purpose: row.purpose,
    goal: row.goal,
    ...(row.plan !== null ? { plan: row.plan } : {}),
    scope: row.scope,
    generation: row.generation,
    generations: generationSummaries(sql, row.id),
    overlaps: overlapsFor(sql, row.id, row.scope),
    ...(landing ? { landing } : {}),
    ...(row.revertOf ? { revertOf: row.revertOf } : {}),
  };
  if (row.state === "held")
    return { ...base, state: "held", lease: { holder: row.holder!, generation: row.leaseGen, expiresAt: iso(row.expiresMs!) } };
  return {
    ...base,
    state: "unheld",
    lease: null,
    leaseGeneration: row.leaseGen,
    why: row.why ?? "released",
    ...(row.handover ? { handover: row.handover } : {}),
  };
}
