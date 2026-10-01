/**
 * Obligations and the evidence that meets them (R-OBL-1 to R-OBL-6), and
 * evidence validity (R-REV-1 to R-REV-4, R-ADMIN-2).
 *
 * Whether a review or check qualified is fixed at its admission, from its
 * recorded authority (R-REV-1). Validity is judged now: a key revoked as
 * `compromised` at any time stops its evidence counting; a `retired` key
 * does too only under `retiredEvidence: "reopens"`. A flagged sole-admin
 * self-approval counts only while the room has exactly one active admin
 * (R-ADMIN-2).
 */

import type {
  ActId,
  Authority,
  CheckBody,
  Evidence,
  MemberId,
  Obligation,
  ObligationId,
  PolicyDocument,
  Principal,
  Reopened,
  RepoPath,
  Role,
  Sha,
} from "@generalbusiness/artroom-contract";
import { matchGlob } from "./glob.ts";
import { evidenceByAct, evidenceOn, generationRow, type EvidenceRow, type GenerationRow } from "./model.ts";
import type { ObligationSpec, Sql } from "./ports.ts";
import { activeAdmins, revocationOf, teamMembers } from "./roster.ts";

export const ADMIN_APPROVAL: ObligationId = "obl_admin-approval";
export const ADMIN_SCOPE = ".artroom/**";
/** The documentation scopes where `allowSelf` may take effect (R-OBL-2, open point 18). */
export const SELF_REVIEW_SCOPES = ["docs/**", "**/*.md"] as const;

/** `obl_admin-approval` when a changed path matches `.artroom/**` (R-ADMIN-1, R-OBL-5). Platform code. */
export function adminObligation(policy: string, paths: readonly RepoPath[]): ObligationSpec | null {
  const hit = paths.filter((p) => matchGlob(p, ADMIN_SCOPE));
  if (!hit.length) return null;
  return { id: ADMIN_APPROVAL, rule: "admin-approval", policy: policy as ObligationSpec["policy"], paths: hit, kind: "review", from: ["role:admin"], count: 1, allowSelf: false };
}

/** `allowSelf` takes effect only when every path is documentation (R-OBL-2). */
export function selfAllowed(spec: ObligationSpec): boolean {
  return spec.kind === "review" && spec.allowSelf && spec.paths.length > 0 && spec.paths.every((p) => SELF_REVIEW_SCOPES.some((g) => matchGlob(p, g)));
}

/** The owners policy assigns to a set of paths. */
export function ownersOf(doc: PolicyDocument, paths: readonly RepoPath[]): Principal[] {
  const out = new Set<Principal>();
  for (const p of paths) for (const [pattern, who] of Object.entries(doc.owners)) if (matchGlob(p, pattern)) for (const w of who) out.add(w);
  return [...out];
}

/** Does a principal include this member, with the role recorded at admission? */
export function principalIncludes(sql: Sql, principal: Principal, member: MemberId | null, role: Role | null): boolean {
  if (member === null) return false;
  if (principal.startsWith("role:")) return role === principal.slice(5);
  if (principal === member) return true;
  return teamMembers(sql, principal).includes(member);
}

/** Does a recorded authority match an obligation's `from` or `by` (R-OBL-2, R-OBL-3)? */
export function qualifies(sql: Sql, doc: PolicyDocument, spec: ObligationSpec, by: Authority): boolean {
  const list = spec.kind === "review" ? spec.from : spec.by;
  for (const p of list) {
    if (p === "owners") {
      if (ownersOf(doc, spec.paths).some((o) => principalIncludes(sql, o, by.member, by.role))) return true;
    } else if (principalIncludes(sql, p as Principal, by.member, by.role)) return true;
  }
  return false;
}

export type Invalid = { readonly key: string; readonly reason: "compromised" | "retired"; readonly revocation: ActId | null };

/** Is a piece of evidence still valid (R-REV-1)? Null when valid. */
export function invalidity(sql: Sql, ev: Pick<EvidenceRow, "key" | "grantor">, retiredEvidence: PolicyDocument["retiredEvidence"]): Invalid | null {
  for (const key of [ev.key, ev.grantor]) {
    if (!key) continue;
    const r = revocationOf(sql, key);
    if (!r) continue;
    if (r.reason === "compromised" || retiredEvidence === "reopens") {
      const by = sql.all("SELECT id FROM entries WHERE seq = ?", r.at)[0]?.["id"];
      return { key, reason: r.reason, revocation: (typeof by === "string" ? by : null) as ActId | null };
    }
  }
  return null;
}

export interface StatusOptions {
  readonly doc: PolicyDocument;
  /** For check obligations: the integration the checks must bind (R-OBL-3). Absent: any integration of this generation. */
  readonly integration?: Sha | null;
  /** Evidence to treat as invalid, to compute what a revocation would reopen (R-REV-3). */
  readonly exclude?: ReadonlySet<ActId>;
}

/** Each member's latest review on this generation (R-POL-7: "latest verdict"). */
export function latestReviews(rows: readonly EvidenceRow[]): EvidenceRow[] {
  const latest = new Map<string, EvidenceRow>();
  for (const r of rows) if (r.kind === "review") latest.set(r.member, r);
  return [...latest.values()];
}

/** One obligation with its current status. */
export function obligationStatus(sql: Sql, gen: GenerationRow, spec: ObligationSpec, opts: StatusOptions): Obligation & { readonly evidenceActs: readonly ActId[] } {
  const exclude = opts.exclude ?? new Set<ActId>();
  const evidence: Evidence[] = [];
  const acts: ActId[] = [];
  let reopened: Reopened | undefined;
  const valid = (ev: EvidenceRow): boolean => {
    if (exclude.has(ev.act)) return false;
    const bad = invalidity(sql, ev, opts.doc.retiredEvidence);
    if (bad) {
      if (bad.reason === "compromised" && bad.revocation) reopened ??= { because: "key-compromised", key: bad.key as `key_${string}`, revocation: bad.revocation };
      return false;
    }
    // R-ADMIN-2: a flagged sole-admin self-approval counts only while there is exactly one active admin.
    if (ev.flags.includes("sole-admin-self-approval") && spec.id === ADMIN_APPROVAL && activeAdmins(sql).length !== 1) return false;
    return true;
  };

  if (spec.kind === "review") {
    const here = latestReviews(evidenceOn(sql, gen.lane, gen.generation)).filter((r) => r.qualifies.includes(spec.id));
    const members = new Set<string>();
    for (const r of here) {
      if (r.verdict !== "approve" || !valid(r)) continue;
      members.add(r.member);
      acts.push(r.act);
      evidence.push({ basis: "here", act: r.act, kind: "review", generation: gen.generation, head: gen.head });
    }
    for (const c of gen.carried) {
      if (c.obligation !== spec.id) continue;
      const r = evidenceByAct(sql, c.evidence.act);
      if (!r || !valid(r) || members.has(r.member)) continue;
      // A member's later verdict here replaces a carried one.
      if (here.some((h) => h.member === r.member)) continue;
      members.add(r.member);
      acts.push(r.act);
      evidence.push(c.evidence);
    }
    const met = members.size >= spec.count;
    return met
      ? { ...spec, state: "met", evidence, evidenceActs: acts }
      : { ...spec, state: "open", evidence, ...(reopened ? { reopened } : {}), evidenceActs: acts };
  }

  for (const r of evidenceOn(sql, gen.lane, gen.generation)) {
    if (r.kind !== "check") continue;
    const b = r.body as CheckBody;
    if (b.obligation !== spec.id || b.check !== spec.check || !b.ok) continue;
    if (opts.integration && b.integration !== opts.integration) continue;
    if (!r.qualifies.includes(spec.id) || !valid(r)) continue;
    acts.push(r.act);
    evidence.push({ basis: "here", act: r.act, kind: "check", generation: gen.generation, head: gen.head });
  }
  return acts.length
    ? { ...spec, state: "met", evidence, evidenceActs: acts }
    : { ...spec, state: "open", evidence, ...(reopened ? { reopened } : {}), evidenceActs: acts };
}

export function obligationsFor(sql: Sql, lane: string, generation: number, opts: StatusOptions): (Obligation & { readonly evidenceActs: readonly ActId[] })[] {
  const gen = generationRow(sql, lane, generation);
  if (!gen) return [];
  return gen.obligations.map((spec) => obligationStatus(sql, gen, spec, opts));
}

/** Strip the internal field for the public view. */
export function publicObligation(o: Obligation & { readonly evidenceActs?: readonly ActId[] }): Obligation {
  const { evidenceActs, ...rest } = o;
  void evidenceActs;
  return rest as Obligation;
}
