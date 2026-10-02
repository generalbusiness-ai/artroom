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
  TeamId,
} from "@generalbusiness/artroom-contract";
import { matchGlob } from "./glob.ts";
import { evidenceByAct, evidenceOn, generationRow, type EvidenceRow, type GenerationRow } from "./model.ts";
import type { ObligationSpec, Sql } from "./ports.ts";
import { activeAdmins, revocationOf } from "./roster.ts";
import { getMeta } from "./store.ts";

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

/** Does a principal include this member, by the role and teams recorded at admission? */
export function principalIncludes(principal: Principal, member: MemberId | null, role: Role | null, teams: readonly TeamId[]): boolean {
  if (member === null) return false;
  if (principal.startsWith("role:")) return role === principal.slice(5);
  return principal === member || teams.includes(principal as TeamId);
}

/** Does a recorded authority match an obligation's `from` or `by` (R-OBL-2, R-OBL-3)? Owners come from the given policy. */
export function principalMatches(doc: PolicyDocument, spec: ObligationSpec, by: Authority, teams: readonly TeamId[]): boolean {
  const list = spec.kind === "review" ? spec.from : spec.by;
  for (const p of list) {
    if (p === "owners") {
      if (ownersOf(doc, spec.paths).some((o) => principalIncludes(o, by.member, by.role, teams))) return true;
    } else if (principalIncludes(p as Principal, by.member, by.role, teams)) return true;
  }
  return false;
}

/**
 * Whether one piece of evidence qualifies for one obligation: the single
 * rule, used at admission, for status, after a policy activation and at
 * reservation. It reads only facts recorded at the evidence's admission
 * (authority, teams, authorship, flags, the act's body) and the requirement
 * it is judged against, never today's roles (R-REV-1, R-OBL-2, R-OBL-3).
 * `"self"` means the principal matches but the author may not meet it.
 */
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
    // R-ADMIN-2: a sole admin's own approval of `.artroom/**`, flagged at admission.
    if (spec.id === ADMIN_APPROVAL && ev.flags.includes("sole-admin-self-approval")) return true;
    return "self";
  }
  if (ev.kind !== "check") return "binding";
  const b = ev.body as CheckBody;
  if (b.obligation !== spec.id || b.check !== spec.check) return "binding";
  if (!principalMatches(doc, spec, ev.authority, ev.admission.teams)) return "principal";
  if (ev.admission.author) return "self";
  // R-OBL-3, R-CARRY-7: the configuration digest of the active policy version.
  if (checkers && checkers[spec.check]?.digest !== b.config) return "binding";
  return true;
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
  /** The active checker configuration digests: a check counts only under the configuration in force (R-CARRY-7). */
  readonly checkers?: Readonly<Record<string, { readonly digest: string }>>;
  /** For check obligations: the integration the checks must bind (R-OBL-3). Absent: any integration of this generation. */
  readonly integration?: Sha | null;
  /** Evidence to treat as invalid, to compute what a revocation would reopen (R-REV-3). */
  readonly exclude?: ReadonlySet<ActId>;
  /** Evidence not yet stored, judged as if it were: what an act being admitted would change (sealed effects). */
  readonly extra?: readonly EvidenceRow[];
}

/** Each member's latest review on this generation (R-POL-7: "latest verdict"). */
export function latestReviews(rows: readonly EvidenceRow[]): EvidenceRow[] {
  const latest = new Map<string, EvidenceRow>();
  for (const r of rows) if (r.kind === "review") latest.set(r.member, r);
  return [...latest.values()];
}

export type Status = Obligation & { readonly evidenceActs: readonly ActId[] };

/**
 * One obligation's status: the single calculator behind the projection,
 * sealed effects, land admission, readiness and reservation.
 */
export function obligationStatus(sql: Sql, gen: GenerationRow, spec: ObligationSpec, opts: StatusOptions): Status {
  const exclude = opts.exclude ?? new Set<ActId>();
  const evidence: Evidence[] = [];
  const acts: ActId[] = [];
  let reopened: Reopened | undefined;
  const valid = (ev: EvidenceRow): boolean => {
    if (exclude.has(ev.act)) return false;
    const bad = invalidity(sql, ev, opts.doc.retiredEvidence);
    if (bad) {
      if (bad.revocation) reopened ??= { because: bad.reason === "compromised" ? "key-compromised" : "key-retired", key: bad.key as `key_${string}`, revocation: bad.revocation };
      return false;
    }
    // R-ADMIN-2: a flagged sole-admin self-approval counts only while there is exactly one active admin.
    if (ev.flags.includes("sole-admin-self-approval") && spec.id === ADMIN_APPROVAL && ev.admission.author) {
      const admins = activeAdmins(sql).length;
      if (admins !== 1) {
        reopened ??= { because: "sole-admin-ended", approval: ev.act, activeAdmins: admins };
        return false;
      }
    }
    return true;
  };
  const rows = [...evidenceOn(sql, gen.lane, gen.generation), ...(opts.extra ?? [])];

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
      const r = evidenceByAct(sql, c.evidence.act);
      if (!r || qualification(opts.doc, spec, r) !== true || !valid(r) || members.has(r.member)) continue;
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

  for (const r of rows) {
    if (r.kind !== "check") continue;
    const b = r.body as CheckBody;
    if (!b.ok || qualification(opts.doc, spec, r, opts.checkers) !== true) continue;
    // The canonical integration fixed at admission (R-CARRY-15 step 5), never a lookup by snapshot commit (review 95323c2b).
    if (opts.integration && r.canonical !== opts.integration) continue;
    if (!valid(r)) continue;
    acts.push(r.act);
    evidence.push({ basis: "here", act: r.act, kind: "check", generation: gen.generation, head: gen.head });
  }
  // Checks carried onto an integration of this generation (R-CARRY-6 to 10), still valid evidence (R-REV-1).
  // A carry counts only on the integration and under the policy version that judged it (review a711f7b6).
  const version = getMeta(sql, "policy");
  const carriedRows = opts.integration
    ? sql.all("SELECT act, evidence FROM check_carries WHERE lane = ? AND generation = ? AND obligation = ? AND integration = ? AND policy = ?", gen.lane, gen.generation, spec.id, opts.integration, version)
    : sql.all("SELECT act, evidence FROM check_carries WHERE lane = ? AND generation = ? AND obligation = ? AND policy = ?", gen.lane, gen.generation, spec.id, version);
  for (const c of carriedRows) {
    const r = evidenceByAct(sql, c["act"] as string);
    if (!r || exclude.has(r.act) || acts.includes(r.act) || !valid(r)) continue;
    if (qualification(opts.doc, spec, r, opts.checkers) !== true) continue;
    acts.push(r.act);
    evidence.push(JSON.parse(c["evidence"] as string) as Evidence);
  }
  return acts.length
    ? { ...spec, state: "met", evidence, evidenceActs: acts }
    : { ...spec, state: "open", evidence, ...(reopened ? { reopened } : {}), evidenceActs: acts };
}

export function statusesOf(sql: Sql, gen: GenerationRow, opts: StatusOptions): Status[] {
  return gen.obligations.map((spec) => obligationStatus(sql, gen, spec, opts));
}

export function obligationsFor(sql: Sql, lane: string, generation: number, opts: StatusOptions): Status[] {
  const gen = generationRow(sql, lane, generation);
  return gen ? statusesOf(sql, gen, opts) : [];
}

/** The `obligations` effect between two status lists of one generation: what opened and what became met. */
export function transitions(before: readonly Status[], after: readonly Status[], all = false): { readonly opened: ObligationId[]; readonly met: ObligationId[] } {
  const was = new Map(before.map((o) => [o.id, o.state]));
  const opened = after.filter((o) => o.state !== "met" && (all || was.get(o.id) === "met")).map((o) => o.id);
  const met = after.filter((o) => o.state === "met" && was.get(o.id) !== "met").map((o) => o.id);
  return { opened, met };
}

/** Strip the internal field for the public view. */
export function publicObligation(o: Obligation & { readonly evidenceActs?: readonly ActId[] }): Obligation {
  const { evidenceActs, ...rest } = o;
  void evidenceActs;
  return rest as Obligation;
}
