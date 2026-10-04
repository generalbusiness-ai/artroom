/**
 * Obligations and the evidence that meets them, re-derived from the fold
 * (docs/protocol.md R-OBL-1 to R-OBL-7, R-REV-1 to R-REV-4, R-ADMIN-1,
 * R-ADMIN-2, R-CARRY-1 to R-CARRY-15, R-POL-6, R-POL-7;
 * notes/2026-10-02-declared-acts.md section 4.4).
 *
 * Three policy inputs depend on them, and verify rebuilds each from earlier
 * entries instead of taking it from the context the room retained:
 * - a `land` input's `obligations` (each blocking obligation and whether it
 *   is met) and `reviews` (each qualifying reviewer's latest verdict, here
 *   or carried);
 * - a notify directory's `reviewers`;
 * - a `carry` call: which earlier verdicts one is owed for, its evidence,
 *   the policy comparison and the revocation fact.
 *
 * This is verify's own implementation of the room's rules
 * (packages/room/src/obligations.ts and core.ts `landInput`,
 * `notifyDirectory`, `recomputeOne`, `carryChecks`), so verify does not
 * trust the Room's code. It reads only the fold: each version's obligations
 * and carried verdicts, the evidence rows, the `check-carried` judgements
 * and the roster replay.
 *
 * Whether a review or check qualified is fixed at its admission, from its
 * recorded authority and the teams and authorship of that moment (R-REV-1).
 * Whether it still counts is judged now: a key revoked as `compromised`
 * stops its evidence counting; a `retired` key does so only under
 * `retiredEvidence: "reopens"`; a flagged sole-admin self-approval counts
 * only while the room has exactly one active admin (R-ADMIN-2).
 *
 * Each guard is one statement marked `// V:<id>`, a row of the mutation
 * table in plans/README.md ("Declared acts stage 3").
 */

import type {
  ActId,
  Authority,
  Carried,
  CheckBody,
  Digest,
  Evidence,
  MemberId,
  NotifyDirectory,
  ObligationId,
  PolicyActor,
  PolicyDocument,
  PolicyVersion,
  Principal,
  RepoPath,
  ReviewBody,
  RevocationReason,
  Role,
  Sha,
  TeamId,
  Verdict,
} from "@generalbusiness/artroom-contract";
import { ADMIN_APPROVAL, SELF_REVIEW_SCOPES, SOLE_ADMIN_FLAG, adminObligation, matchGlob, type InputOf, type ObligationSpec } from "@generalbusiness/artroom-policy";
import { changedPaths, type EvidenceRow, type Fold, type Version } from "./fold.ts";
import type { RosterReplay } from "./roster.ts";

/** What judging obligations reads besides the version: the fold, the roster now, and the policy in force. */
export interface Judging {
  readonly fold: Fold;
  readonly roster: RosterReplay;
  /** The document in force. */
  readonly doc: PolicyDocument;
  /** Its version: a check carry counts only under the version that judged it. */
  readonly version: PolicyVersion;
  /** Its checker configurations' digests, by checker name (R-CARRY-7). */
  readonly checkers: ReadonlyMap<string, Digest>;
}

/** The acting member as policy sees it (R-EVAL-3, the room's `policyActor`): the recorded role, today's teams. */
export function actorOf(roster: RosterReplay, by: Authority): PolicyActor {
  return { member: by.member, role: by.role, teams: by.member ? roster.teamsOf(by.member) : [], delegated: by.via === "delegation" };
}

// ------------------------------------------------------------ obligations

/**
 * A version's obligations: the platform's `obl_admin-approval` when a
 * changed path matches `.artroom/**` (R-ADMIN-1), then the ones its
 * `require` call made. The admin obligation comes from the witness's paths;
 * while the version has no witness, from whether its receipt opened it.
 */
export function specsOf(v: Pick<Version, "witness" | "required" | "specPolicy" | "adminOpened">): ObligationSpec[] {
  const policy = v.specPolicy as PolicyVersion;
  const admin = v.witness
    ? adminObligation(policy, changedPaths(v.witness.changed)) // V:admin-obligation
    : v.adminOpened
      ? ({ id: ADMIN_APPROVAL, rule: "admin-approval", policy, paths: [], kind: "review", from: ["role:admin"], count: 1, allowSelf: false } as ObligationSpec)
      : null;
  const out: ObligationSpec[] = admin ? [admin] : [];
  // The `require` call lists the admin obligation too, when it knew the paths: it is decided here, once.
  for (const o of v.required) if (o.id !== ADMIN_APPROVAL && !out.some((s) => s.id === o.id)) out.push(o);
  return out;
}

/** An advisory check obligation never holds up a landing (R-OBL-7). */
export function blocking(o: ObligationSpec): boolean {
  return !(o.kind === "check" && o.advisory === true); // V:advisory
}

/** Mark each check obligation whose checker's configuration says `advisory: true` (R-OBL-7). */
export function withAdvisory(specs: readonly ObligationSpec[], configs: ReadonlyMap<string, { readonly advisory?: boolean }>): ObligationSpec[] {
  return specs.map((s) => (s.kind === "check" && configs.get(s.check)?.advisory === true ? { ...s, advisory: true as const } : s));
}

// ----------------------------------------------------------- qualification

/** `allowSelf` takes effect only when every path is documentation (R-OBL-2). */
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

/** Does the evidence's recorded authority match the obligation's `from` or `by` (R-OBL-2, R-OBL-3)? */
function principalMatches(doc: PolicyDocument, spec: ObligationSpec, ev: Pick<EvidenceRow, "authority" | "teams">): boolean {
  const list: readonly string[] = spec.kind === "review" ? spec.from : spec.by;
  for (const p of list) {
    if (p === "owners") {
      if (ownersOf(doc, spec.paths).some((o) => principalIncludes(o, ev.authority.member, ev.authority.role, ev.teams))) return true;
    } else if (principalIncludes(p as Principal, ev.authority.member, ev.authority.role, ev.teams)) return true;
  }
  return false;
}

/**
 * Whether one piece of evidence qualifies for one obligation (R-REV-1,
 * R-OBL-2, R-OBL-3): the room's single rule. It reads only the facts
 * recorded at the evidence's admission and the requirement, never today's
 * roles. `self`: the principal matches, but the author may not meet it.
 */
export function qualification(
  doc: PolicyDocument,
  spec: ObligationSpec,
  ev: Pick<EvidenceRow, "kind" | "authority" | "teams" | "author" | "flags" | "body">,
  checkers?: ReadonlyMap<string, Digest>,
): true | "principal" | "self" | "binding" {
  if (spec.kind === "review") {
    if (ev.kind !== "review") return "binding";
    if (!principalMatches(doc, spec, ev)) return "principal"; // V:review-principal
    if (!ev.author) return true;
    if (selfAllowed(spec)) return true;
    if (spec.id === ADMIN_APPROVAL && ev.flags.includes(SOLE_ADMIN_FLAG)) return true;
    return "self"; // V:review-self
  }
  if (ev.kind !== "check") return "binding";
  const b = ev.body as CheckBody;
  if (b.obligation !== spec.id || b.check !== spec.check) return "binding"; // V:check-binding
  if (!principalMatches(doc, spec, ev)) return "principal";
  if (ev.author) return "self";
  if (checkers && checkers.get(spec.check) !== b.config) return "binding"; // V:check-config
  return true;
}

/** The revocation that stops evidence counting, of its signing key or its grantor's (R-REV-1); null when it counts. */
export function invalidity(roster: RosterReplay, ev: Pick<EvidenceRow, "key" | "grantor">, retiredEvidence: PolicyDocument["retiredEvidence"]): RevocationReason | null {
  for (const key of [ev.key, ev.grantor]) {
    if (!key) continue;
    const r = roster.revocationOf(key);
    if (r && (r === "compromised" || retiredEvidence === "reopens")) return r; // V:evidence-revoked
  }
  return null;
}

/** Each member's latest review among `rows`, in the order of each member's first (R-POL-7; the room's `latestReviews`). */
export function latestReviews(rows: readonly EvidenceRow[]): EvidenceRow[] {
  const latest = new Map<string, EvidenceRow>();
  for (const r of rows) if (r.kind === "review") latest.set(r.member, r);
  return [...latest.values()];
}

// ------------------------------------------------------------------ status

export interface Status {
  readonly spec: ObligationSpec;
  readonly met: boolean;
  readonly evidence: readonly Evidence[];
  /** The acts counted, in the room's order. */
  readonly acts: readonly ActId[];
  /**
   * True when a check that would otherwise count ran on a filtered snapshot
   * whose integration the log does not name, so whether it counts for the
   * integration asked about cannot be rebuilt (fold.ts `EvidenceRow.canonical`).
   */
  readonly unwitnessed: boolean;
}

/**
 * One obligation's status now (the room's `obligationStatus`): for a review
 * obligation, the qualifying members' latest approvals here, then carried
 * verdicts, against `count`; for a check obligation, a passing qualifying
 * check on the integration, or one carried onto it under the policy in
 * force. With `integration`, checks count only for that integration.
 */
export function statusOf(j: Judging, v: Version, spec: ObligationSpec, integration?: Sha | null): Status {
  const evidence: Evidence[] = [];
  const acts: ActId[] = [];
  let unwitnessed = false;
  const valid = (ev: EvidenceRow): boolean => {
    if (invalidity(j.roster, ev, j.doc.retiredEvidence)) return false;
    // R-ADMIN-2: a flagged sole-admin self-approval counts only while there is exactly one active admin.
    if (ev.flags.includes(SOLE_ADMIN_FLAG) && spec.id === ADMIN_APPROVAL && ev.author && j.roster.counts().admins !== 1) return false; // V:sole-admin
    return true;
  };
  const rows = j.fold.evidenceOn(v.lane, v.generation);
  if (spec.kind === "review") {
    const here = latestReviews(rows.filter((r) => r.kind === "review" && qualification(j.doc, spec, r) === true));
    const members = new Set<string>();
    for (const r of here) {
      if (r.verdict !== "approve" || !valid(r)) continue; // V:review-approves
      members.add(r.member);
      acts.push(r.act);
      evidence.push({ basis: "here", act: r.act, kind: "review", generation: v.generation, head: v.head });
    }
    for (const c of v.carried) {
      if (c.obligation !== spec.id) continue;
      const r = j.fold.evidenceByAct(c.evidence.act);
      if (!r || qualification(j.doc, spec, r) !== true || !valid(r) || members.has(r.member)) continue;
      // A member's later verdict here replaces a carried one.
      if (here.some((h) => h.member === r.member)) continue; // V:carried-replaced
      members.add(r.member);
      acts.push(r.act);
      evidence.push(c.evidence);
    }
    // A verdict whose carry the log cannot decide (fold.ts `Version.maybe`) leaves the status undecided, if it could count.
    for (const c of v.maybe) {
      if (c.obligation !== spec.id) continue;
      const r = j.fold.evidenceByAct(c.act);
      if (r && qualification(j.doc, spec, r) === true && valid(r) && !members.has(r.member) && !here.some((h) => h.member === r.member)) unwitnessed = true;
    }
    return { spec, met: members.size >= spec.count, evidence, acts, unwitnessed }; // V:review-count
  }
  for (const r of rows) {
    if (r.kind !== "check") continue;
    const b = r.body as CheckBody;
    if (!b.ok || qualification(j.doc, spec, r, j.checkers) !== true) continue; // V:check-ok
    if (integration && r.canonical !== integration) {
      if (r.canonical === undefined && valid(r)) unwitnessed = true;
      continue; // V:check-integration
    }
    if (!valid(r)) continue;
    acts.push(r.act);
    evidence.push({ basis: "here", act: r.act, kind: "check", generation: v.generation, head: v.head });
  }
  // Checks carried onto an integration of this version (R-CARRY-6 to 10): only on that integration, and only under
  // the policy version that judged the carry (R-CARRY-13).
  for (const c of j.fold.checkCarriesOn(v.lane, v.generation, spec.id)) {
    if (c.policy !== j.version) continue; // V:carry-policy
    if (integration && c.integration !== integration) continue;
    const r = j.fold.evidenceByAct(c.act);
    if (!r || acts.includes(r.act) || !valid(r)) continue;
    if (qualification(j.doc, spec, r, j.checkers) !== true) continue;
    acts.push(r.act);
    evidence.push(c.evidence);
  }
  return { spec, met: acts.length > 0, evidence, acts, unwitnessed };
}

export function statusesOf(j: Judging, v: Version, integration?: Sha | null): Status[] {
  return specsOf(v).map((spec) => statusOf(j, v, spec, integration));
}

/** Does a verdict qualify, under the document in force, for any review obligation of its version (R-POL-7)? */
function qualifiesAny(doc: PolicyDocument, specs: readonly ObligationSpec[], r: EvidenceRow): boolean {
  return specs.some((o) => o.kind === "review" && qualification(doc, o, r) === true);
}

// -------------------------------------------------------------- land input

type LandInput = InputOf<"land">;

/**
 * The `obligations` and `reviews` of a land input (R-POL-6, the room's
 * `landInput`): each blocking obligation and whether it is met; and each
 * qualifying reviewer's latest verdict on the version, reviewed here or
 * carried, by act ID. `unwitnessed` names the obligations whose `met` the
 * log cannot decide (see `Status.unwitnessed`).
 */
export function landEvidence(
  j: Judging,
  v: Version,
  integration: Sha | null,
): { readonly obligations: LandInput["obligations"]; readonly reviews: LandInput["reviews"]; readonly unwitnessed: readonly ObligationId[]; readonly maybeReviews: readonly LandInput["reviews"][number][] } {
  const statuses = statusesOf(j, v, integration);
  const specs = statuses.map((s) => s.spec);
  const reviews: { act: ActId; verdict: Verdict; by: PolicyActor; basis: "here" | "carried" }[] = latestReviews(j.fold.evidenceOn(v.lane, v.generation))
    .filter((r) => qualifiesAny(j.doc, specs, r)) // V:land-reviews
    .map((r) => ({ act: r.act, verdict: r.verdict!, by: actorOf(j.roster, r.authority), basis: "here" as const }));
  for (const s of statuses)
    for (const e of s.evidence)
      if (e.basis === "carried" && e.kind === "review" && !reviews.some((r) => r.act === e.act)) {
        const row = j.fold.evidenceByAct(e.act);
        if (row) reviews.push({ act: e.act, verdict: row.verdict!, by: actorOf(j.roster, row.authority), basis: "carried" });
      }
  const blockingOnes = statuses.filter((s) => blocking(s.spec));
  // Verdicts whose carry is undecided: each is listed as carried exactly when the room listed it (see `patchLand`).
  const maybeReviews: LandInput["reviews"][number][] = [];
  for (const s of statuses)
    if (s.unwitnessed && s.spec.kind === "review")
      for (const c of v.maybe) {
        const row = c.obligation === s.spec.id ? j.fold.evidenceByAct(c.act) : null;
        if (row && !reviews.some((r) => r.act === row.act) && !maybeReviews.some((r) => r.act === row.act))
          maybeReviews.push({ act: row.act, verdict: row.verdict!, by: actorOf(j.roster, row.authority), basis: "carried" });
      }
  return {
    obligations: blockingOnes.map((s) => ({ id: s.spec.id, met: s.met })),
    reviews: reviews.sort((a, b) => (a.act < b.act ? -1 : 1)),
    unwitnessed: blockingOnes.filter((s) => s.unwitnessed && !s.met).map((s) => s.spec.id),
    maybeReviews,
  };
}

/**
 * A land input's evidence, with what the log cannot decide taken from the
 * context the room retained (`from`): whether each undecided obligation is
 * met, and whether each undecided verdict is listed as carried. Everything
 * else stays the rebuilt value; the listed verdict's content is the fold's.
 */
export function patchLand(e: ReturnType<typeof landEvidence>, from: Pick<LandInput, "obligations" | "reviews"> | null): Pick<LandInput, "obligations" | "reviews"> {
  if (!from || (e.unwitnessed.length === 0 && e.maybeReviews.length === 0)) return { obligations: e.obligations, reviews: e.reviews };
  const obligations = e.obligations.map((o) => (e.unwitnessed.includes(o.id) ? { id: o.id, met: from.obligations.find((x) => x.id === o.id)?.met ?? o.met } : o));
  const listed = e.maybeReviews.filter((m) => from.reviews.some((r) => r.act === m.act));
  return { obligations, reviews: [...e.reviews, ...listed].sort((a, b) => (a.act < b.act ? -1 : 1)) };
}

// --------------------------------------------------------------- reviewers

/**
 * The `reviewers` of a notify directory (R-POL-5, the room's
 * `notifyDirectory`): the members whose latest verdict on the thread's
 * latest version qualifies for one of its review obligations, in handle
 * order. `rows` are that version's evidence when the act was sealed, and
 * `specs` its obligations then.
 */
export function reviewersOf(doc: PolicyDocument, specs: readonly ObligationSpec[], rows: readonly EvidenceRow[]): NotifyDirectory["reviewers"] {
  const out = new Set<MemberId>();
  for (const r of latestReviews(rows)) if (qualifiesAny(doc, specs, r)) out.add(r.member); // V:reviewers
  return [...out].sort();
}

// ------------------------------------------------------------------- carry

/** An earlier verdict a `carry` call is owed for when a new version is proposed, and the obligations it met. */
export interface Candidate {
  readonly row: EvidenceRow;
  readonly obligations: readonly ObligationId[];
  /** True when the verdict's own carry onto the previous version is undecided: a call for it is accepted, not required. */
  readonly maybe: boolean;
}

/**
 * The verdicts a new version's `carry` calls are owed for (R-CARRY-1, the
 * room's `propose`): every act counted for a review obligation of the
 * previous version, under the policy in force, in the room's order.
 */
export function carryCandidates(j: Judging, previous: Version): Candidate[] {
  const byAct = new Map<ActId, ObligationId[]>();
  for (const s of statusesOf(j, previous)) if (s.spec.kind === "review") for (const act of s.acts) byAct.set(act, [...(byAct.get(act) ?? []), s.spec.id]); // V:carry-candidates
  const out: Candidate[] = [];
  for (const [act, obligations] of byAct) {
    const row = j.fold.evidenceByAct(act);
    if (row) out.push({ row, obligations, maybe: false });
  }
  const specs = specsOf(previous);
  for (const m of previous.maybe) {
    const row = j.fold.evidenceByAct(m.act);
    if (!row || !specs.some((s) => s.id === m.obligation && s.kind === "review")) continue;
    const have = out.find((c) => c.row.act === m.act);
    if (have) {
      if (have.maybe && !have.obligations.includes(m.obligation)) (have.obligations as ObligationId[]).push(m.obligation);
    } else out.push({ row, obligations: [m.obligation], maybe: true });
  }
  return out;
}

/** The `evidence` of a carry input for a verdict (R-POL-4), from its row: the recorded role, today's teams. */
export function verdictEvidence(roster: RosterReplay, row: EvidenceRow, from: Carried["from"] = { generation: row.generation, head: row.head }): InputOf<"carry">["evidence"] {
  const body = row.body as ReviewBody;
  return { act: row.act, kind: "review", verdict: row.verdict, by: actorOf(roster, row.authority), from, scope: body.scope, dependsOn: body.dependsOn ?? [] };
}

/** The `evidence` of a carry input for a check (R-CARRY-6): no verdict, scope or dependencies. */
export function checkEvidence(roster: RosterReplay, row: EvidenceRow, head: Sha): InputOf<"carry">["evidence"] {
  return { act: row.act, kind: "check", verdict: null, by: actorOf(roster, row.authority), from: { generation: row.generation, head }, scope: [], dependsOn: [] };
}

/** The revocation fact of a verdict's carry call: any revocation of its key or its grantor's (R-REV-2, R-REV-3). */
export function revokedFact(roster: RosterReplay, row: Pick<EvidenceRow, "key" | "grantor">): RevocationReason | null {
  return invalidity(roster, row, "reopens");
}
