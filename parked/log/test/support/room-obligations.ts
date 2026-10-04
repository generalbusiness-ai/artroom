/**
 * The Room's obligation rules, for the simulator (support/declared-room.ts):
 * a port of packages/room/src/obligations.ts at main a04c774b, reading the
 * simulator's own tables instead of SQL. It is test support, written from
 * the Room's code and kept apart from verify's own implementation
 * (src/obligations.ts), so the fixtures are not made by the code they test.
 */

import type {
  ActId,
  Authority,
  Carried,
  CheckBody,
  CheckerConfig,
  Evidence,
  Flag,
  LaneId,
  MemberId,
  NotCarried,
  ObligationId,
  PathChange,
  PolicyDocument,
  PolicyVersion,
  Principal,
  Refusal,
  RepoPath,
  ReviewBody,
  RevocationReason,
  Role,
  Sha,
  TeamId,
  Verdict,
} from "@generalbusiness/artroom-contract";
import { matchGlob, type ObligationSpec } from "@generalbusiness/artroom-policy";

export const ADMIN_APPROVAL = "obl_admin-approval" as ObligationId;
const ADMIN_SCOPE = ".artroom/**";
const SELF_REVIEW_SCOPES = ["docs/**", "**/*.md"] as const;

export interface EvidenceRow {
  readonly act: ActId;
  readonly seq: number;
  readonly kind: "review" | "check";
  readonly lane: LaneId;
  readonly generation: number;
  readonly head: Sha;
  readonly member: MemberId;
  readonly key: string;
  readonly grantor: string | null;
  readonly verdict: Verdict | null;
  readonly flags: readonly Flag[];
  readonly authority: Authority;
  readonly admission: { readonly teams: readonly TeamId[]; readonly author: boolean };
  readonly body: ReviewBody | CheckBody;
  readonly canonical: Sha | null;
}

export interface GenerationRow {
  readonly lane: LaneId;
  readonly generation: number;
  readonly act: ActId;
  readonly head: Sha;
  readonly base: Sha;
  readonly changed: readonly PathChange[];
  readonly proposer: MemberId;
  obligations: readonly ObligationSpec[];
  carried: readonly { readonly obligation: ObligationId; readonly evidence: Carried }[];
  notCarried: readonly NotCarried[];
  readonly policy: PolicyVersion;
  blocked: Pick<Refusal, "rule" | "reason" | "fix"> | null;
  landed: boolean;
}

export interface CheckCarryRow {
  readonly lane: LaneId;
  readonly generation: number;
  readonly integration: Sha;
  readonly obligation: ObligationId;
  readonly act: ActId;
  readonly evidence: Carried;
  readonly policy: PolicyVersion;
}

/** The simulator's tables, as the rules read them. */
export interface Tables {
  readonly evidence: readonly EvidenceRow[];
  readonly checkCarries: readonly CheckCarryRow[];
  /** The active policy version (`meta.policy`). */
  readonly policy: PolicyVersion;
  revocationOf(key: string): RevocationReason | null;
  activeAdmins(): number;
}

export function adminObligation(policy: PolicyVersion, paths: readonly RepoPath[]): ObligationSpec | null {
  const hit = paths.filter((p) => matchGlob(p, ADMIN_SCOPE));
  if (!hit.length) return null;
  return { id: ADMIN_APPROVAL, rule: "admin-approval", policy, paths: hit, kind: "review", from: ["role:admin"], count: 1, allowSelf: false };
}

export function withAdvisory(specs: readonly ObligationSpec[], checkers: Readonly<Record<string, { readonly config: CheckerConfig }>>): ObligationSpec[] {
  return specs.map((s) => (s.kind === "check" && checkers[s.check]?.config.advisory === true ? { ...s, advisory: true as const } : s));
}

export function blocking(o: ObligationSpec): boolean {
  return !(o.kind === "check" && o.advisory === true);
}

function selfAllowed(spec: ObligationSpec): boolean {
  return spec.kind === "review" && spec.allowSelf && spec.paths.length > 0 && spec.paths.every((p) => SELF_REVIEW_SCOPES.some((g) => matchGlob(p, g)));
}

function ownersOf(doc: PolicyDocument, paths: readonly RepoPath[]): Principal[] {
  const out = new Set<Principal>();
  for (const p of paths) for (const [pattern, who] of Object.entries(doc.owners)) if (matchGlob(p, pattern)) for (const w of who) out.add(w);
  return [...out];
}

function principalIncludes(principal: Principal, member: MemberId | null, role: Role | null, teams: readonly TeamId[]): boolean {
  if (member === null) return false;
  if (principal.startsWith("role:")) return role === principal.slice(5);
  return principal === member || teams.includes(principal as TeamId);
}

function principalMatches(doc: PolicyDocument, spec: ObligationSpec, by: Authority, teams: readonly TeamId[]): boolean {
  const list: readonly string[] = spec.kind === "review" ? spec.from : spec.by;
  for (const p of list) {
    if (p === "owners") {
      if (ownersOf(doc, spec.paths).some((o) => principalIncludes(o, by.member, by.role, teams))) return true;
    } else if (principalIncludes(p as Principal, by.member, by.role, teams)) return true;
  }
  return false;
}

export function qualification(
  doc: PolicyDocument,
  spec: ObligationSpec,
  ev: Pick<EvidenceRow, "kind" | "authority" | "admission" | "flags" | "body">,
  checkers?: Readonly<Record<string, { readonly digest: string }>>,
): true | "principal" | "self" | "binding" {
  if (spec.kind === "review") {
    if (ev.kind !== "review") return "binding";
    if (!principalMatches(doc, spec, ev.authority, ev.admission.teams)) return "principal";
    if (!ev.admission.author) return true;
    if (selfAllowed(spec)) return true;
    if (spec.id === ADMIN_APPROVAL && ev.flags.includes("sole-admin-self-approval")) return true;
    return "self";
  }
  if (ev.kind !== "check") return "binding";
  const b = ev.body as CheckBody;
  if (b.obligation !== spec.id || b.check !== spec.check) return "binding";
  if (!principalMatches(doc, spec, ev.authority, ev.admission.teams)) return "principal";
  if (ev.admission.author) return "self";
  if (checkers && checkers[spec.check]?.digest !== b.config) return "binding";
  return true;
}

export function invalidity(t: Tables, ev: Pick<EvidenceRow, "key" | "grantor">, retiredEvidence: PolicyDocument["retiredEvidence"]): { readonly key: string; readonly reason: RevocationReason } | null {
  for (const key of [ev.key, ev.grantor]) {
    if (!key) continue;
    const reason = t.revocationOf(key);
    if (!reason) continue;
    if (reason === "compromised" || retiredEvidence === "reopens") return { key, reason };
  }
  return null;
}

export interface StatusOptions {
  readonly doc: PolicyDocument;
  readonly checkers?: Readonly<Record<string, { readonly digest: string }>>;
  readonly integration?: Sha | null;
  readonly extra?: readonly EvidenceRow[];
}

export function latestReviews(rows: readonly EvidenceRow[]): EvidenceRow[] {
  const latest = new Map<string, EvidenceRow>();
  for (const r of rows) if (r.kind === "review") latest.set(r.member, r);
  return [...latest.values()];
}

export type Status = ObligationSpec & { readonly state: "open" | "met"; readonly evidence: readonly Evidence[]; readonly evidenceActs: readonly ActId[] };

export function evidenceOn(t: Tables, lane: LaneId, generation: number): EvidenceRow[] {
  return t.evidence.filter((e) => e.lane === lane && e.generation === generation).sort((a, b) => a.seq - b.seq);
}

export function obligationStatus(t: Tables, gen: GenerationRow, spec: ObligationSpec, opts: StatusOptions): Status {
  const evidence: Evidence[] = [];
  const acts: ActId[] = [];
  const valid = (ev: EvidenceRow): boolean => {
    if (invalidity(t, ev, opts.doc.retiredEvidence)) return false;
    if (ev.flags.includes("sole-admin-self-approval") && spec.id === ADMIN_APPROVAL && ev.admission.author) {
      if (t.activeAdmins() !== 1) return false;
    }
    return true;
  };
  const rows = [...evidenceOn(t, gen.lane, gen.generation), ...(opts.extra ?? [])];
  if (spec.kind === "review") {
    const here = latestReviews(rows.filter((r) => r.kind === "review" && qualification(opts.doc, spec, r) === true));
    const members = new Set<string>();
    for (const r of here) {
      if (r.verdict !== "approve" || !valid(r)) continue;
      members.add(r.member);
      acts.push(r.act);
      evidence.push({ basis: "here", act: r.act, kind: "review", generation: gen.generation, head: gen.head });
    }
    for (const c of gen.carried) {
      if (c.obligation !== spec.id) continue;
      const r = t.evidence.find((e) => e.act === c.evidence.act);
      if (!r || qualification(opts.doc, spec, r) !== true || !valid(r) || members.has(r.member)) continue;
      if (here.some((h) => h.member === r.member)) continue;
      members.add(r.member);
      acts.push(r.act);
      evidence.push(c.evidence);
    }
    return { ...spec, state: members.size >= spec.count ? "met" : "open", evidence, evidenceActs: acts };
  }
  for (const r of rows) {
    if (r.kind !== "check") continue;
    const b = r.body as CheckBody;
    if (!b.ok || qualification(opts.doc, spec, r, opts.checkers) !== true) continue;
    if (opts.integration && r.canonical !== opts.integration) continue;
    if (!valid(r)) continue;
    acts.push(r.act);
    evidence.push({ basis: "here", act: r.act, kind: "check", generation: gen.generation, head: gen.head });
  }
  const carriedRows = t.checkCarries.filter(
    (c) => c.lane === gen.lane && c.generation === gen.generation && c.obligation === spec.id && c.policy === t.policy && (!opts.integration || c.integration === opts.integration),
  );
  for (const c of carriedRows) {
    const r = t.evidence.find((e) => e.act === c.act);
    if (!r || acts.includes(r.act) || !valid(r)) continue;
    if (qualification(opts.doc, spec, r, opts.checkers) !== true) continue;
    acts.push(r.act);
    evidence.push(c.evidence);
  }
  return { ...spec, state: acts.length ? "met" : "open", evidence, evidenceActs: acts };
}

export function statusesOf(t: Tables, gen: GenerationRow, opts: StatusOptions): Status[] {
  return gen.obligations.map((spec) => obligationStatus(t, gen, spec, opts));
}

export function transitions(before: readonly Status[], after: readonly Status[], all = false): { readonly opened: ObligationId[]; readonly met: ObligationId[] } {
  const was = new Map(before.map((o) => [o.id, o.state]));
  const opened = after.filter((o) => o.state !== "met" && (all || was.get(o.id) === "met")).map((o) => o.id);
  const met = after.filter((o) => o.state === "met" && was.get(o.id) !== "met").map((o) => o.id);
  return { opened, met };
}
