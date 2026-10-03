/**
 * Admission (R-ADM-1). One shared path for every act, on every transport:
 *
 *  1. parse, version, room ID and size          ArtroomError, nothing recorded
 *  2. signature (R-SIG-5)                        ArtroomError, nothing recorded
 *  3. idempotency (R-IDEM)                       the original result, or an unrecorded refusal
 *  4. authority by case (R-ADM-3, R-ADM-12)      unrecorded refusal
 * 4a. kind and binding, in a v2 room (R-DECL-16) unrecorded refusal
 *  5. body schema and sizes (R-SIG-4, R-SIG-6)   unrecorded refusal
 *  6. secret scan (R-SEC-1)                      unrecorded refusal
 *  7. lane and lease (R-LANE)                    recorded refusal
 *  8. platform invariants                        recorded refusal
 *  9. policy refuse, require (R-POL)             recorded refusal
 * 10. seal and commit, apply effects             one synchronous transaction
 * 11. notify, after the commit (R-LOG-13)        a later `notified` entry
 *
 * A refused `join` is never recorded, at any step: its body carries the
 * invitation's secret (R-GEN-6, R-ADM-8).
 *
 * What a room admits is its active document's vocabulary (R-DECL-1): the
 * legacy vocabulary under a `v1` document, the declarations under a `v2`
 * one. Steps 7 to 10 run by step, not by kind (`dispatch`): the legacy
 * kinds map onto the same steps, and the platform kinds `renew`, `roster`
 * and `recover` are judged by platform code.
 *
 * Steps 3 to 9 read state and may await policy evaluation. Step 10 runs in
 * one synchronous transaction that first checks the log head is unchanged;
 * if it moved, the decision is made again (R-ADM-6). A runtime failure at
 * any step records nothing (R-ADM-9).
 */

import type {
  ActDeclaration,
  AnyPolicyDocument,
  Digest,
  ActId,
  ActRecord,
  AdmissionPath,
  Authority,
  Carried,
  Check,
  CheckBody,
  Claim,
  ClaimBody,
  Decision,
  Delegation,
  Effect,
  Envelope,
  Flag,
  Generation,
  KeyId,
  Landing,
  LaneId,
  LanePurpose,
  LogEntry,
  MemberId,
  NotCarried,
  Note,
  NoteAnchor,
  ObligationId,
  OpId,
  PathChange,
  Proposal,
  ProposeBody,
  Receipt,
  ReclaimBody,
  Refusal,
  RefusalReceipt,
  Release,
  ReleaseBody,
  Renewal,
  RepoPath,
  Review,
  ReviewBody,
  RecoverOp,
  RosterOp,
  Role,
  RosterRecord,
  Sha,
  SignedEnvelope,
  Step,
} from "@generalbusiness/artroom-contract";
import type { InputOf } from "@generalbusiness/artroom-policy";
import { checkerInputs, declarationOf, delegableBy as grantable, isDeclared, isPlatformKind, stepsOf } from "@generalbusiness/artroom-policy";
import { bindingStale, kindUndeclared, worded, type RefusalFacts } from "./declared.ts";
import { canonicalize, utf8 } from "./canonical.ts";
import { b64url, digestJson, verify } from "./crypto.ts";
import { artroomError } from "./errors.ts";
import { iso, opIds, parseTime, pinnedRef, RE } from "./ids.ts";
import { idOf } from "./log.ts";
import { judge, laneOf, refusal, type Signer } from "./authority.ts";
import { matchesAny } from "./glob.ts";
import {
  changedPaths,
  evidenceByKey,
  generationRow,
  laneRow,
  overlapsFor,
  type EvidenceRow,
  type GenerationRow,
  type LaneRow,
} from "./model.ts";
import {
  ADMIN_APPROVAL,
  adminObligation,
  blocking,
  invalidity,
  obligationsFor,
  publicObligation,
  qualification,
  statusesOf,
  transitions,
  withAdvisory,
} from "./obligations.ts";
import type { ArtroomConfig, DiffResult, Evaluation, ObligationSpec } from "./ports.ts";
import { activeAdmins, activeKeys, delegableBy, delegation, invitation, keyRow, memberRow, recoveryKey, revocationOf, teamsOf } from "./roster.ts";
import { checkBody, checkEnvelopeSize, checkSignedEnvelope, ShapeError, checkDeclaredTarget } from "./schema.ts";
import { limitInvitation } from "./ratelimit.ts";
import { scanValue } from "./secrets.ts";
import { one, num, setMeta, str } from "./store.ts";
import { isConfigPath, Moved, type ActivePolicyFull, type RoomCore } from "./core.ts";

const MAX_INVITE_MS = 7 * 24 * 3600 * 1000;

/** Results of I/O done before admission (R-PROP-1 step 1). Never decides anything by itself. */
export interface Pre {
  readonly head?: { readonly inFork: boolean };
  readonly diff?: DiffResult;
  readonly main?: Sha | null;
  readonly config?: ArtroomConfig | null;
  /** Paths changed between each earlier generation's head and the new head, for carrying. */
  readonly since?: ReadonlyMap<Sha, readonly RepoPath[] | null>;
  /** The tree of a check's integration (R-OBL-3). */
  readonly tree?: Sha | null;
  /** The filtered snapshot of a check's integration over the paths the check names (R-CARRY-9). */
  readonly snapshot?: Digest | null;
}

/** Something to do inside the commit transaction with the room-held key of a room-custody join (R-CRED-3). */
export interface AdmitHooks {
  readonly heldKeys?: readonly { readonly key: KeyId; readonly seed: Uint8Array; readonly purpose: string }[];
}

/** What one admission did: its result, and whether it is the stored result of an earlier admission (R-IDEM). */
export interface Admitted {
  readonly result: ActRecord | Refusal;
  readonly replay: boolean;
}

/** A `join` carries its invitation's secret in the body (R-GEN-6). */
const isJoinOp = (env: Pick<Envelope, "kind" | "body">): boolean => env.kind === "roster" && (env.body as { op?: unknown }).op === "join";

interface Ctx {
  readonly core: RoomCore;
  readonly signed: SignedEnvelope;
  readonly env: Envelope;
  /** The active declaration of the act's kind, in a v2 room; null for the legacy vocabulary and platform kinds. */
  readonly decl: ActDeclaration | null;
  /** The `recover` op this act is (R-DECL-21), or null. */
  readonly recover: RecoverOp["op"] | null;
  /** Facts the room reports, for a declaration's refusal wording (R-DECL-13). */
  readonly facts: RefusalFacts;
  readonly path: AdmissionPath;
  readonly digest: string;
  readonly pre: Pre;
  readonly now: number;
  readonly policy: ActivePolicyFull;
  readonly budget: unknown;
  authority: Authority;
  flags: Flag[];
  readonly evaluations: Evaluation[];
  readonly invariants: { rule: `R-${string}`; held: boolean; detail?: string }[];
  /** The refuse input built for this act, kept so a later boundary can compare it (R-ADM-6). */
  refuseInput?: InputOf<"refuse">;
  /** A refuse evaluation made earlier, on the state this act will see (a redemption's `delegate`). */
  readonly precomputed?: { readonly input: InputOf<"refuse"> | null; readonly refusal: Refusal | null; readonly evaluations: readonly Evaluation[] };
}

/** Options for deciding one act. */
export interface DecideOptions {
  /** The authority judged on a simulated state, for an act that follows another in one transaction. */
  readonly authority?: Authority;
  readonly precomputed?: Ctx["precomputed"];
}

export type Plan =
  | { readonly t: "replay"; readonly result: ActRecord | Refusal }
  | { readonly t: "unrecorded"; readonly refusal: Refusal }
  | { readonly t: "refused"; readonly ctx: Ctx; readonly refusal: Refusal }
  | {
      readonly t: "accept";
      readonly ctx: Ctx;
      readonly effects: readonly Effect[];
      /** The entry creates a lane whose ID is its own (R-LOG-12). */
      readonly self?: boolean;
      readonly apply: (entry: LogEntry, id: ActId) => ActRecord;
      readonly notify: { readonly lane: LaneId | null; readonly proposal: InputOf<"notify">["proposal"] } | null;
      readonly afterCommit?: (id: ActId, entry: LogEntry) => void;
    };

const nope = (rule: Refusal["rule"], reason: string, fix?: string, current?: Refusal["current"]): Refusal =>
  refusal(rule, reason, fix, current ? { current } : {});

// =============================================================== entry point

/**
 * Admit one signed envelope on a path the room's own code chose (R-ADM-12).
 * Returns the record or a refusal; throws an `ArtroomError` for steps 1 and 2
 * and for runtime failures, which record nothing.
 */
export async function submit(core: RoomCore, input: unknown, path: AdmissionPath, hooks: AdmitHooks = {}): Promise<ActRecord | Refusal> {
  return (await admit(core, input, path, hooks)).result;
}

/**
 * As `submit`, and says whether the result is a replay: the stored result of
 * an earlier admission of the same envelope, which this call did not make.
 * A `join` refused at steps 7 to 9 is not recorded on any path, because its
 * body carries the invitation's secret (R-GEN-6, R-ADM-8). Every attempt to
 * join counts against the invitation's rate limit (R-CRED-9).
 */
export async function admit(core: RoomCore, input: unknown, path: AdmissionPath, hooks: AdmitHooks = {}): Promise<Admitted> {
  // Step 1: parse, version, room ID, size (R-SIG-4, R-SIG-5, R-SIG-6), under the active document's vocabulary.
  try {
    stepOne(input, core.founded ? core.activePolicy().doc : undefined);
  } catch (e) {
    // R-DECL-16: an exact retry of an accepted act gets its original receipt, even when the document now in force no
    // longer admits its version, kind or target. Only that exact envelope, with its signature, is answered.
    const prior = core.founded ? await acceptedBefore(core, input) : null; // G2:retry-before-shape
    if (prior) return { result: prior, replay: true };
    throw e;
  }
  const signed = input as SignedEnvelope;
  const env = signed.envelope;
  if (env.room !== core.roomId) throw artroomError("unauthenticated", "The envelope names a different room.");
  const join = isJoinOp(env);
  if (join) limitInvitation(core, (env.body as { invitation?: unknown }).invitation);
  let canonical: string;
  try {
    canonical = canonicalize(env);
  } catch (e) {
    throw artroomError("bad-request", `The envelope is outside the signed JSON profile: ${(e as Error).message}`);
  }
  try {
    checkEnvelopeSize(utf8(canonical).length);
  } catch (e) {
    throw artroomError("payload-too-large", (e as Error).message);
  }
  // Step 2: the signature, against `actor` (R-SIG-5).
  if (!(await verify(env.actor, "artroom-envelope-v1", env, signed.sig))) throw artroomError("unauthenticated", "The signature does not verify for the actor key.");

  // I/O before admission, only for an envelope that would reach step 7.
  const early = earlySteps(core, signed, path, digestJson(env));
  const pre: Pre = early ? {} : await preAdmission(core, env);

  return core.serial(async () => {
    for (let attempt = 0; attempt < 6; attempt++) {
      // Leases already past their expiry end before anything is decided on them (R-LANE-8).
      core.expireDueSync();
      const snap = core.headSeq();
      const plan = await decide(core, signed, path, pre);
      if (plan.t === "replay") return { result: plan.result, replay: true };
      if (plan.t === "unrecorded") return { result: plan.refusal, replay: false };
      if (plan.t === "refused" && join) return { result: plan.refusal, replay: false };
      try {
        const out = core.sql.transaction(() => {
          if (core.headSeq() !== snap) throw new Moved();
          const late = finalBoundary(core, plan);
          if (late) return { late };
          return { done: commit(core, plan, hooks) };
        });
        if ("late" in out) return { result: out.late, replay: false };
        core.committed();
        if (plan.t === "accept" && plan.afterCommit) plan.afterCommit(out.done.id, out.done.entry);
        return { result: out.done.result, replay: false };
      } catch (e) {
        if (e instanceof Moved) continue;
        throw e;
      }
    }
    throw artroomError("unavailable", "The room is busy. Retry with the same idempotency key.", { retryAfterMs: 100, maybeRecorded: false });
  });
}

/**
 * The stored result of an earlier admission of exactly this signed envelope,
 * or null. It is asked only when step 1 fails under the document in force:
 * the envelope was well formed under the document it was admitted under, so
 * it is read here without that document. It must be an object with a string
 * actor and idempotency key, inside the signed JSON profile and the size
 * limit, with a signature that verifies, and the same digest as the stored
 * act (R-IDEM-2).
 */
async function acceptedBefore(core: RoomCore, input: unknown): Promise<ActRecord | Refusal | null> {
  // The closed outer shape, as step 1 has it: exactly `envelope` and `sig`. An extra field is bad-request for a retry
  // as for a new act.
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const outer = Object.keys(input);
  if (outer.length !== 2 || !Object.hasOwn(input, "envelope") || !Object.hasOwn(input, "sig")) return null; // G2:retry-outer
  const signed = input as { envelope?: unknown; sig?: unknown };
  if (typeof signed.sig !== "string") return null;
  const env = signed.envelope as { actor?: unknown; idempotencyKey?: unknown; room?: unknown } | null;
  if (typeof env !== "object" || env === null || typeof env.actor !== "string" || typeof env.idempotencyKey !== "string" || env.room !== core.roomId) return null;
  let digest: string;
  try {
    checkEnvelopeSize(utf8(canonicalize(env)).length);
    digest = digestJson(env);
  } catch {
    return null;
  }
  const prior = one(core.sql, "SELECT digest, result FROM idem WHERE actor = ? AND ikey = ?", env.actor, env.idempotencyKey);
  if (!prior || str(prior, "digest") !== digest) return null;
  if (!(await verify(env.actor as never, "artroom-envelope-v1", env as never, signed.sig).catch(() => false))) return null;
  return JSON.parse(str(prior, "result")!) as ActRecord | Refusal;
}

/** Step 1's shape checks (R-ADM-1 step 1 as amended): an `ArtroomError` `bad-request` or `payload-too-large`, never recorded. */
function stepOne(input: unknown, doc: AnyPolicyDocument | undefined): void {
  try {
    checkSignedEnvelope(input, doc);
  } catch (e) {
    if (e instanceof ShapeError) throw artroomError(e.rule === "payload-too-large" ? "payload-too-large" : "bad-request", e.message);
    throw artroomError("bad-request", "The act is not a signed envelope.");
  }
}

/**
 * The last check before sealing, inside the write transaction and with the
 * room clock read now (R-ADM-6, P1.3 of review aabda1ed). Authority that
 * depends on time (a delegation's or an invitation's expiry) or on state is
 * judged again; a lease past its expiry makes the admission start over, so
 * the expiry is sealed first. Returns an unrecorded refusal, or null to seal.
 * Throws `Moved` to decide again.
 */
export function finalBoundary(core: RoomCore, plan: Extract<Plan, { t: "refused" | "accept" }>): Refusal | null {
  const ctx = plan.ctx;
  const j = judge(core.sql, ctx.env, ctx.path, core.now(), core.activePolicy().doc);
  // A refusal decided here is a platform refusal of the act like any other: in its declaration's words (R-DECL-13).
  if (!j.ok) return worded(j.refusal, ctx.decl, ctx.facts); // G2:boundary-wording
  if (canonicalize(j.authority) !== canonicalize(ctx.authority)) throw new Moved();
  const lane = laneOf(ctx.env);
  if (lane) {
    const row = laneRow(core.sql, lane);
    if (row && row.state === "held" && (row.expiresMs ?? Infinity) <= core.now()) throw new Moved();
  }
  return null;
}

// =============================================================== steps 3 to 6

/** Steps 3 to 6. Returns a plan when one of them decides the outcome, otherwise null. Synchronous. */
export function earlySteps(core: RoomCore, signed: SignedEnvelope, path: AdmissionPath, digest: string, authority?: Authority): Plan | null {
  const env = signed.envelope;
  const sql = core.sql;
  const policy = core.activePolicy();
  // Step 3: idempotency, scoped to the signing key (R-IDEM-1 to R-IDEM-4). An exact retry of an accepted act gets its
  // original receipt first of all, even after its binding has gone stale or the document stopped admitting its shape
  // (R-DECL-16).
  const prior = one(sql, "SELECT digest, seq, result FROM idem WHERE actor = ? AND ikey = ?", env.actor, env.idempotencyKey);
  if (prior && str(prior, "digest") === digest) return { t: "replay", result: JSON.parse(str(prior, "result")!) as ActRecord | Refusal }; // G2:retry-first
  // Step 1 again, under the document in force now: an activation may have changed the vocabulary since.
  stepOne(signed, policy.doc); // G2:step1-recheck
  if (prior) {
    const original = str(one(sql, "SELECT id FROM entries WHERE seq = ?", num(prior, "seq")!), "id");
    return {
      t: "unrecorded",
      refusal: nope("idempotency-mismatch", `This idempotency key was already used for a different act, ${original}.`, "Use a new idempotency key for a new act."),
    };
  }
  // Step 4: authority at admission (R-ADM-3, R-ADM-12).
  const j = authority ? ({ ok: true, authority } as const) : judge(sql, env, path, core.now(), policy.doc);
  if (!j.ok) return { t: "unrecorded", refusal: j.refusal };
  // Step 4a, in a v2 room (R-DECL-16): the kind is declared, and the act carries the active declaration's binding.
  if (isDeclared(policy.doc) && !isPlatformKind(env.kind)) { // G2:4a-platform
    const current = core.declaredBinding(env.kind);
    if (current === null) return { t: "unrecorded", refusal: kindUndeclared(env.kind, policy.version) }; // G2:undeclared
    const signedFor = (env as Signer).binding;
    if ((env.v as number) !== 2 || signedFor !== current) return { t: "unrecorded", refusal: bindingStale(env.kind, signedFor, current, policy.version) }; // G2:stale
    // The target, against the declaration the binding names (R-DECL-4): bad-request, thrown, as step 1's is.
    try {
      checkDeclaredTarget(policy.doc, env.kind, env.target); // G2:target-after-4a
    } catch (e) {
      if (e instanceof ShapeError) throw artroomError("bad-request", e.message);
      throw e;
    }
  }
  // Step 5: body schema and sizes (R-SIG-4, R-SIG-6, R-PATH-1).
  let fixed: ReadonlySet<string>;
  let exempt: ReadonlySet<string>;
  try {
    ({ fixed, exempt } = checkBody(env.kind, env.target, env.body, policy.doc));
  } catch (e) {
    if (e instanceof ShapeError) return { t: "unrecorded", refusal: nope(e.rule as Refusal["rule"], e.message, "Correct the body and sign it again.") };
    throw e;
  }
  const semantic = env.kind === "roster" ? rosterSemantics(core, env, j.authority, policy.doc) : null;
  if (semantic) return { t: "unrecorded", refusal: semantic };
  // Step 6: secret scan (R-SEC-1 to R-SEC-4). The reason names the field and detector, never the value.
  const finding = scanValue(env.body, "body", fixed, exempt);
  if (finding)
    return {
      t: "unrecorded",
      refusal: nope("secret-detected", `${finding.path} looks like a credential (detector ${finding.detector}).`, "Remove the secret; rotate it if it was shared elsewhere."),
    };
  return null;
}

/**
 * A `v2` grant's names and bindings (R-DECL-17), at its admission: each
 * platform kind and each declared kind of its map may be signed by `role`
 * and delegated, each declared kind is declared, and each binding is the
 * active declaration's. Unrecorded.
 */
function grantProblem(core: RoomCore, doc: AnyPolicyDocument, role: Role, kinds: readonly string[], acts: Readonly<Record<string, string>>, invalid: (reason: string) => Refusal): Refusal | null {
  const may = grantable(doc, role);
  for (const k of kinds) if (!may.platform.includes(k)) return invalid(`The role ${role} may not grant ${k}.`); // G2:grant-platform
  const policy = core.activePolicy();
  for (const [k, b] of Object.entries(acts)) {
    const current = core.declaredBinding(k);
    if (current === null) return kindUndeclared(k, policy.version); // G2:grant-undeclared
    if (!may.declared.includes(k)) return invalid(declarationOf(doc, k)!.who.delegable === false ? `${k} may not be delegated.` : `The role ${role} may not grant ${k}.`); // G2:grant-delegable
    if (b !== current) return bindingStale(k, b, current, policy.version); // G2:grant-stale
  }
  return null;
}

/** Step 5 checks that need the roster (unrecorded). */
function rosterSemantics(core: RoomCore, env: Envelope, by: Authority, doc: AnyPolicyDocument): Refusal | null {
  const sql = core.sql;
  const op = env.body as RosterOp;
  const bad = (reason: string) => nope("invalid-body", reason, "Correct the roster op and sign it again.");
  const now = core.now();
  switch (op.op) {
    case "invite": {
      const existing = memberRow(sql, op.member);
      if (existing && existing.state !== "active") return bad(`${op.member} was removed; a handle is never reused (R-ID-5).`);
      if (!existing && one(sql, "SELECT 1 AS x FROM teams WHERE team = ?", op.member)) return bad(`${op.member} is a team.`);
      if (!existing && op.role === undefined) return bad("An invitation for a new member must set the role.");
      if (existing && op.role !== undefined) return bad("An invitation that adds a key to an existing member must not set a role.");
      const exp = parseTime(op.expiresAt);
      if (exp === null || exp <= now || exp > now + MAX_INVITE_MS) return bad("An invitation must expire within 7 days of the room clock (R-GEN-6).");
      if (op.session) {
        const role = op.role ?? existing!.role;
        if (isDeclared(doc)) {
          const s = op.session as unknown as { kinds: readonly string[]; acts: Readonly<Record<string, string>> };
          return grantProblem(core, doc, role, s.kinds, s.acts, () => bad(`The role ${role} may not sign every kind the session lists.`)); // G2:session-grant
        }
        const may = delegableBy(role);
        if (op.session.kinds !== "*" && op.session.kinds.some((k) => !may.includes(k))) return bad(`The role ${role} may not sign every kind the session lists.`);
      }
      return null;
    }
    case "set-role":
    case "remove": {
      const m = memberRow(sql, op.member);
      if (!m || m.state !== "active") return bad(`${op.member} is not an active member.`);
      return null;
    }
    case "revoke-key": {
      const k = keyRow(sql, op.key);
      if (k && k.state === "revoked") return bad("That key is already revoked.");
      if (!k && one(sql, "SELECT 1 AS x FROM revoked_keys WHERE key = ?", op.key)) return bad("That key is already revoked.");
      if (op.key === recoveryKey(sql)) return bad("The recovery key is replaced with rotate-recovery, not revoked.");
      return null;
    }
    case "team": {
      if (memberRow(sql, op.team)) return bad(`${op.team} is a member, not a team.`);
      for (const m of op.members) if (!memberRow(sql, m)) return bad(`${m} is not a member.`);
      return null;
    }
    case "delegate": {
      const exp = parseTime(op.expiresAt);
      if (exp === null || exp <= now) return bad("A delegation must expire in the future.");
      if (op.to === env.actor) return bad("A key cannot delegate to itself.");
      // R-ADM-5: only kinds the grantor's role may sign, never roster; in a v2 room, by the signed map (R-DECL-17).
      if (isDeclared(doc)) {
        const g = op as unknown as { kinds: readonly string[]; acts: Readonly<Record<string, string>> };
        return grantProblem(core, doc, by.role!, g.kinds, g.acts, (reason) => nope("delegation-invalid", reason, "Grant only kinds your role may sign."));
      }
      const may = delegableBy(by.role!);
      if (op.kinds !== "*" && op.kinds.some((k) => !may.includes(k)))
        return nope("delegation-invalid", `The role ${by.role} may not grant every kind listed.`, "Grant only kinds your role may sign.");
      return null;
    }
    case "undelegate": {
      const d = delegation(sql, op.delegation);
      if (!d) return bad(`There is no delegation ${op.delegation}.`);
      if (d.grantor !== env.actor) return nope("delegation-invalid", "Only the grantor key can undelegate (R-GEN-4).", "Sign with the key that granted it.");
      if (d.revoked !== undefined) return bad("That delegation is already revoked.");
      return null;
    }
    case "rotate-recovery":
      if (op.key === recoveryKey(sql)) return bad("That is already the recovery key.");
      if (keyRow(sql, op.key)) return bad("A member's key cannot become the recovery key.");
      // P1.2: a key revoked for any reason, bound to a member or not, never becomes the recovery key (R-ADM-3).
      if (revocationOf(sql, op.key)) return bad("A revoked key can never become the recovery key.");
      return null;
    case "join":
      return null;
  }
}

// =============================================================== pre-admission I/O

/**
 * The reads before admission. Any failure is `unavailable` to the client,
 * with a fixed message; the step that failed and the error's name and
 * redacted message go to the Worker's log (request d268d249).
 */
async function preAdmission(core: RoomCore, env: Envelope): Promise<Pre> {
  const a = core.ports.artifacts;
  const unavailable = () => artroomError("unavailable", "The repository could not be read. Nothing was recorded; retry with the same idempotency key.", { maybeRecorded: false });
  let noMain = false;
  let step: string = env.kind;
  // The reads a step needs, by step (R-PROP-1 step 1, R-OBL-3, R-LAND-2).
  const runs = stepOfEnvelope(core.activePolicy().doc, env);
  try {
    if (runs === "version") {
      const lane = laneOf(env)!;
      const body = env.body as ProposeBody;
      if (!laneRow(core.sql, lane)) return {};
      step = "propose.headInFork";
      const inFork = await a.headInFork(lane, body.head);
      if (!inFork) return { head: { inFork } };
      step = "propose.pinObjects";
      await a.pinObjects(lane, body.head); // R-PROP-1 step 1: named by content, so repeating is harmless
      step = "propose.readMain";
      const main = await a.readMain();
      step = "propose.diff";
      const diff = await a.diff(main, body.head);
      let config: ArtroomConfig | null = null;
      step = "propose.readConfig";
      if (diff.kind === "ok" && changedPaths(diff.changed).some(isConfigPath)) config = await a.readConfig(body.head);
      step = "propose.changedBetween";
      const since = new Map<Sha, readonly RepoPath[] | null>();
      for (const r of core.sql.all("SELECT DISTINCT head FROM generations WHERE lane = ?", lane)) {
        const h = str(r, "head") as Sha;
        if (h !== body.head) since.set(h, await a.changedBetween(h, body.head));
        else since.set(h, []);
      }
      return { head: { inFork }, diff, main, config, since };
    }
    if (runs === "check") {
      const b = env.body as CheckBody;
      // A scoped check that binds a snapshot commit the room recorded: the room derived it, so nothing is read.
      if (b.input?.kind === "filtered" && one(core.sql, "SELECT 1 AS x FROM check_snapshots WHERE commit_sha = ?", b.integration)) return {};
      step = "check.treeOf";
      const tree = await a.treeOf(b.integration);
      // A scoped checker's input: the filtered snapshot of the integration over the paths it names (R-CARRY-9).
      step = "check.snapshot";
      if (b.input?.kind === "filtered" && Array.isArray(b.input.paths)) return { tree, snapshot: (await a.snapshot(b.integration, b.input.paths))?.digest ?? null };
      return { tree };
    }
    if (runs === "land" && core.landing.core.main() === null) {
      step = "land.readMain";
      if ((await a.readMain()) === null) noMain = true;
      else {
        step = "land.refreshMain";
        await core.landing.refreshMain();
      }
    }
  } catch (e) {
    core.diagnose("pre-admission-failed", step, e);
    throw unavailable();
  }
  // A repository with no main can take no landing, and a retry changes nothing (request b6b51de7).
  if (noMain)
    throw artroomError("not-found", "The room's repository has no main branch, so there is nothing to land onto (R-LAND-2). Nothing was recorded. Landing cannot succeed until main has a first commit.");
  return {};
}

// =============================================================== steps 7 to 9

/** The `recover` op that stands for each step (R-DECL-21). */
const RECOVER_STEP: Readonly<Record<RecoverOp["op"], Step>> = {
  open: "open",
  take: "take",
  version: "version",
  approve: "review",
  land: "land",
  release: "release",
  note: "comment",
};

/** The one step an envelope runs under this document, or null for `renew` and `roster`, which are not steps. */
export function stepOfEnvelope(doc: AnyPolicyDocument, env: Pick<Envelope, "kind" | "target" | "body">): Step | null {
  if (env.kind === "renew" || env.kind === "roster") return null;
  if ((env.kind as string) === "recover") {
    const op = (env.body as { op?: unknown }).op;
    return typeof op === "string" && Object.hasOwn(RECOVER_STEP, op) ? RECOVER_STEP[op as RecoverOp["op"]] : null;
  }
  const steps = stepsOf(doc, env.kind, env.target);
  return steps?.length === 1 ? steps[0] : null;
}

/**
 * A declared act's body, as the step handlers read it. The handlers were
 * written for the legacy kinds, whose `purpose` selects configuration
 * recovery and whose `goal`, `plan`, `summary` and `text` are text. A
 * declaration may give those names to fields of its own, of any type
 * (R-DECL-12). So `purpose` never reaches a handler from a declared act:
 * recovery is the platform kind `recover` (R-DECL-21). The other four reach
 * it only as text, which is what the thread and version rows hold.
 */
function handlerBody(body: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const { purpose: _purpose, ...kept } = body; // G2:declared-purpose
  void _purpose;
  const rest: Record<string, unknown> = kept;
  for (const name of ["goal", "plan", "summary", "text"]) if (rest[name] !== undefined && typeof rest[name] !== "string") delete rest[name]; // G2:declared-text
  return rest;
}

/** Facts every refusal of this envelope may report (R-DECL-13): its kind, and the lane and generation it names. */
function envelopeFacts(env: Envelope): RefusalFacts {
  // A declared kind's target is judged only after step 4a (`checkDeclaredTarget`), and refusals decided before that
  // are worded too. So a fact is taken from the target only if it has the form the room itself reports: a lane ID,
  // a generation number. Anything else fills its slot with nothing.
  const t = env.target as { lane?: unknown; generation?: unknown } | null;
  return {
    kind: env.kind,
    ...(t && typeof t.lane === "string" && RE.actId.test(t.lane) ? { lane: t.lane } : {}), // G2:fact-lane
    ...(t && Number.isSafeInteger(t.generation) && (t.generation as number) >= 1 ? { generation: String(t.generation) } : {}), // G2:fact-generation
  };
}

/** Refusals that policy rules made: they keep their own wording (R-DECL-13). */
const RULE_REFUSALS = new WeakSet<Refusal>();
const fromRule = <R extends Refusal | null>(r: R): R => {
  if (r) RULE_REFUSALS.add(r);
  return r;
};

/** A platform refusal of a declared act, in its declaration's words (R-DECL-13). */
function wordedPlan(plan: Plan, decl: ActDeclaration | null, facts: RefusalFacts): Plan {
  if (!decl || (plan.t !== "unrecorded" && plan.t !== "refused") || RULE_REFUSALS.has(plan.refusal)) return plan; // G2:wording
  const r = worded(plan.refusal, decl, facts);
  return r === plan.refusal ? plan : { ...plan, refusal: r };
}

export async function decide(core: RoomCore, signed: SignedEnvelope, path: AdmissionPath, pre: Pre, opts: DecideOptions = {}): Promise<Plan> {
  const digest = digestJson(signed.envelope);
  const policy = core.activePolicy();
  const env = signed.envelope;
  const decl = declarationOf(policy.doc, env.kind);
  const facts = envelopeFacts(env);
  const early = earlySteps(core, signed, path, digest, opts.authority);
  if (early) return wordedPlan(early, decl, facts);
  const j = opts.authority ? ({ ok: true, authority: opts.authority, flags: [] as Flag[] } as const) : judge(core.sql, env, path, core.now(), policy.doc);
  if (!j.ok) return wordedPlan({ t: "unrecorded", refusal: j.refusal }, decl, facts);
  const ctx: Ctx = {
    core,
    signed,
    env,
    decl,
    recover: (env.kind as string) === "recover" ? (env.body as RecoverOp).op : null,
    facts,
    path,
    digest,
    pre,
    now: core.now(),
    policy,
    budget: core.ports.policy.actBudget(),
    authority: j.authority,
    flags: [...j.flags],
    evaluations: [],
    invariants: [{ rule: "R-ADM-3", held: true, detail: `authority by case ${j.authority.via}` }],
    ...(opts.precomputed ? { precomputed: opts.precomputed } : {}),
  };
  // R-LAND-8: while the slot is held, every act is ordered after the reservation (open point 6).
  if (core.landing.after()) ctx.flags.push("after-reservation");
  return wordedPlan(await dispatch(ctx), decl, ctx.facts);
}

/**
 * Steps 7 to 10, by step (note section 8.1): the legacy kinds, the declared
 * kinds and `recover` ops all run the same step handlers. `renew` and
 * `roster` are platform kinds with their own.
 */
function dispatch(ctx: Ctx): Promise<Plan> {
  const env = ctx.env;
  if (env.kind === "renew") return renew(ctx, env.target.lane, (env.body as { lease: number }).lease);
  if (env.kind === "roster") return roster(ctx, env.body as RosterOp);
  const step = stepOfEnvelope(ctx.policy.doc, env);
  const t = env.target as { lane: LaneId; generation: Generation } & NoteAnchor;
  // A recover op's body is its step's, with `op` (R-DECL-21); an open is a configuration-recovery open.
  const b = (ctx.recover
    ? { ...(env.body as RecoverOp), op: undefined, ...(ctx.recover === "open" ? { purpose: "config-recovery" } : {}) } // G2:recover-open
    : ctx.decl
      ? handlerBody(env.body as unknown as Readonly<Record<string, unknown>>) // G2:declared-body
      : env.body) as never;
  switch (step) {
    case "open":
      return claimNew(ctx, b);
    case "take":
      return reclaim(ctx, t.lane, b);
    case "version":
      return propose(ctx, t.lane, b);
    case "comment":
      return note(ctx, env.target as NoteAnchor, b);
    case "review":
      return review(ctx, t.lane, t.generation, b);
    case "check":
      return check(ctx, t.lane, t.generation, b);
    case "land":
      return land(ctx, t.lane, t.generation, b);
    case "release":
      return release(ctx, t.lane, b);
    default:
      // Unreachable: step 1 accepts only targets the declaration names, and a document with steps this room does not run
      // yet never activates (`stagedProblems`).
      throw artroomError("internal", `The room cannot run ${env.kind} on this target.`);
  }
}

// --------------------------------------------------------------- helpers

function refused(ctx: Ctx, r: Refusal, invariant?: `R-${string}`): Plan {
  if (invariant) ctx.invariants.push({ rule: invariant, held: false, detail: r.reason });
  return { t: "refused", ctx, refusal: r };
}

/** Holder, lease and recovery-lane checks shared by holder acts (R-LANE-3, R-LANE-6, R-ADMIN-5). */
function holderCheck(ctx: Ctx, lane: LaneRow, lease: number): Refusal | null {
  if (lane.state !== "held" || lane.holder !== ctx.authority.member)
    return nope("not-holder", lane.state === "held" ? `${lane.id} is held by ${lane.holder}.` : `${lane.id} has no holder.`, "Claim the lane first.", {
      leaseGeneration: lane.leaseGen,
    });
  if (lease !== lane.leaseGen) return nope("lease-fenced", `The act carries lease generation ${lease}; the current one is ${lane.leaseGen}.`, "Act with the current lease.", { leaseGeneration: lane.leaseGen });
  return null;
}

/** The lease length a thread uses for renewal and expiry: recorded when it opened, or the room's current one (R-DECL-9). */
function leaseMsOf(core: RoomCore, lane: Pick<LaneRow, "leaseMs">): number {
  return lane.leaseMs ?? core.leaseMs; // G2:lease-of
}

/** The facts of a thread an act names, for refusal wording (R-DECL-13). */
function laneFacts(ctx: Ctx, lane: LaneRow): void {
  const f = ctx.facts as { -readonly [K in keyof RefusalFacts]: RefusalFacts[K] };
  f.lane = lane.id;
  if (lane.holder) f.holder = lane.holder;
  f.generation ??= String(lane.generation);
}

/**
 * R-DECL-8, recorded at step 7: in a v2 room, an act on a thread is refused
 * `wrong-thread` unless the thread's kind is in its declaration's `threads`.
 * A configuration-recovery thread takes only `recover` ops, and `recover`
 * acts only on one (R-DECL-21). `renew`, a platform kind, acts on any
 * thread. With `entry`, only the recovery rule applies: an entry target is
 * not a thread target.
 */
function threadCheck(ctx: Ctx, lane: LaneRow | null, entry = false): Refusal | null {
  if (!isDeclared(ctx.policy.doc) || ctx.env.kind === "renew") return null;
  if (ctx.recover) {
    if (lane?.purpose === "config-recovery") return null; // G2:recover-ordinary
    return nope("wrong-thread", lane ? `${lane.id} is not a configuration-recovery thread; recover acts only on those.` : "recover acts only on a configuration-recovery thread.", "Act on it with the room's declared acts.");
  }
  if (!lane) return null;
  if (lane.purpose === "config-recovery")
    return nope("wrong-thread", `${lane.id} is a configuration-recovery thread, on which only recover ops act.`, "Use the platform kind recover, with an admin's own key."); // G2:recovery-thread
  if (entry || ctx.decl?.threads?.includes(lane.kind)) return null; // G2:thread-kind
  return nope("wrong-thread", `${lane.id} is a ${lane.kind} thread, which ${ctx.env.kind} does not act on.`, `Act on it with an act whose threads name ${lane.kind}.`);
}

/** R-ADMIN-5: every act on a configuration-recovery lane is an active admin's own key (case a). */
function recoveryLaneCheck(ctx: Ctx, lane: LaneRow | null): Refusal | null {
  if (!lane || lane.purpose !== "config-recovery") return null;
  ctx.flags.push("config-recovery");
  if (ctx.authority.via !== "member" || ctx.authority.role !== "admin")
    return nope("admin-required", "Only an active admin's own key may act on a configuration-recovery lane.", "Sign with an admin's own key, not a delegation.");
  return null;
}

/** Policy `refuse` rules (R-POL-2), skipped where the platform says so (R-ADMIN-3, R-ADMIN-5). */
async function policyRefuse(ctx: Ctx, lane: LaneRow | null, proposal: InputOf<"refuse">["proposal"] = null): Promise<Refusal | null> {
  const env = ctx.env;
  if (lane?.purpose === "config-recovery") {
    ctx.invariants.push({ rule: "R-ADMIN-5", held: true, detail: "configuration-recovery lane: policy rules are not evaluated" });
    return null;
  }
  const recoveryKey = ctx.authority.via === "recovery";
  if (env.kind === "roster" && (recoveryKey || ctx.authority.role === "admin")) {
    ctx.invariants.push({ rule: "R-ADMIN-3", held: true, detail: "roster act by an admin or the recovery key: refuse rules are not evaluated" });
    return null;
  }
  const input = refuseInput(ctx.core, env, ctx.authority, lane, proposal);
  ctx.refuseInput = input;
  if (ctx.precomputed) {
    ctx.evaluations.push(...ctx.precomputed.evaluations);
    return fromRule(ctx.precomputed.refusal);
  }
  const r = await ctx.core.ports.policy.refuse(ctx.policy, input, { budget: ctx.budget, recoveryKey });
  ctx.evaluations.push(...r.evaluations);
  return fromRule(r.refusal);
}

/** Whether policy `refuse` rules apply to this act at all (R-ADMIN-3). */
export function refuseApplies(env: Pick<Envelope, "kind">, by: Authority): boolean {
  return !(env.kind === "roster" && (by.via === "recovery" || by.role === "admin"));
}

/** The refuse rule input for an act, built synchronously from the current state (R-EVAL-3). */
export function refuseInput(core: RoomCore, env: Envelope, by: Authority, lane: LaneRow | null, proposal: InputOf<"refuse">["proposal"] = null): InputOf<"refuse"> {
  return {
    kind: "refuse",
    act: { kind: env.kind, target: env.target as never, body: env.body as never },
    actor: core.policyActor(by),
    lane: core.policyLane(lane),
    proposal,
    room: core.policyRoom(),
  };
}

/** R-ADM-11, R-LANE-5: renewal to the room clock plus the thread's lease length (R-DECL-9). */
function renewEffect(ctx: Ctx, lane: LaneRow): Effect {
  return { type: "renewed", lane: lane.id, expiresAt: iso(ctx.now + leaseMsOf(ctx.core, lane)) };
}

function renewLease(ctx: Ctx, lane: LaneId): void {
  const core = ctx.core;
  const before = laneRow(core.sql, lane);
  if (!before) return;
  const expires = ctx.now + leaseMsOf(core, before);
  core.sql.all("UPDATE lanes SET expires_ms = ? WHERE id = ? AND state = 'held'", expires, lane);
  // Lane B's workspace keeps the lease's deadline: a token is never minted past it (R-CRED-8).
  const l = laneRow(core.sql, lane);
  if (l?.state === "held" && one(core.sql, "SELECT 1 AS x FROM ws_leases WHERE lane = ? AND lease_gen = ? AND state = 'open'", lane, l.leaseGen)) core.workspaces.open(lane, l.leaseGen, expires);
}

/**
 * The fields every record shares. Its kind is the act's own: a legacy kind,
 * a declared kind, or `recover` (R-DECL-21); `kind` names the record shape
 * the step produces. A `recover` record names its op as `recover`, a field
 * no step's record has: a landing's own `op` is its landing operation.
 */
function recordBase<K extends ActRecord["kind"]>(ctx: Ctx, entry: LogEntry, id: ActId, kind: K, receipt: Receipt) {
  const because = (ctx.env.body as { because?: Claim["because"] }).because;
  void kind;
  return {
    id,
    seq: entry.seq,
    kind: ctx.env.kind as K,
    ...(ctx.recover ? { recover: ctx.recover } : {}), // G2:recover-record
    by: receipt.authority,
    at: entry.at,
    ...(receipt.after ? { after: receipt.after } : {}),
    flags: receipt.flags,
    ...(because ? { because } : {}),
  };
}

function receiptOf(entry: LogEntry): Receipt {
  if (entry.entry.type !== "act") throw new Error("not an act entry");
  return entry.entry.receipt;
}

// --------------------------------------------------------------- claim

async function claimNew(ctx: Ctx, body: ClaimBody): Promise<Plan> {
  const core = ctx.core;
  const purpose: LanePurpose = body.purpose ?? "ordinary";
  // R-DECL-6: the thread's kind and the opening act's binding; R-DECL-9: its lease length, resolved and recorded now in
  // a v2 room (a hold's leaseSeconds, or the room's lease), and left unset under the legacy vocabulary.
  const declared = isDeclared(ctx.policy.doc);
  const kind = ctx.recover ? "recover" : ctx.env.kind; // G2:thread-kind-record
  const binding = declared && !ctx.recover ? core.declaredBinding(kind) : null; // G2:binding-record
  const leaseSeconds = ctx.decl?.hold?.leaseSeconds;
  const recordedLease = declared ? (leaseSeconds !== undefined ? leaseSeconds * 1000 : core.leaseMs) : null; // G2:lease-record
  const leaseMs = recordedLease ?? core.leaseMs;
  // R-DECL-6: the conflict mode is fixed at open too: the hold's, else the policy's `lanes` now; a recovery thread is
  // by-scope to others. It is recorded here and judged from stage 4 (the either-side rule of R-DECL-9).
  const conflict = declared ? (ctx.recover ? "by-scope" : (ctx.decl?.hold?.conflict ?? (ctx.policy.doc as AnyPolicyDocument).lanes)) : null; // G2:conflict-record
  if (purpose === "config-recovery") {
    ctx.flags.push("config-recovery");
    if (ctx.authority.via !== "member" || ctx.authority.role !== "admin")
      return refused(ctx, nope("admin-required", "Only an active admin's own key may open a configuration-recovery lane.", "Ask an admin to claim it."), "R-ADMIN-5");
    if (!body.scope.every((g) => g.startsWith(".artroom/")))
      return refused(ctx, nope("recovery-scope", "A configuration-recovery claim may cover only .artroom/**.", "Claim the other paths on an ordinary lane."), "R-ADMIN-5");
  } else if (ctx.policy.doc.lanes === "exclusive") {
    const overlaps = overlapsFor(core.sql, null, body.scope);
    if (overlaps.length)
      return refused(ctx, nope("scope-overlap", `The scope may overlap ${overlaps[0]!.lane}, held by ${overlaps[0]!.holder}.`, "Narrow the scope, or wait for that lane."), "R-POL-8");
  }
  const lane = null;
  const r = purpose === "config-recovery" ? null : await policyRefuse(ctx, lane);
  if (r) return refused(ctx, r);
  const lease = { holder: ctx.authority.member!, generation: 1, expiresAt: iso(ctx.now + leaseMs) };
  // R-LOG-6 as amended: in a v2 room the opened effect names the thread's kind and the opening act's binding.
  const effect = { type: "opened" as const, purpose, lease, ...(declared ? { kind, binding } : {}) }; // G2:opened-kind
  return {
    t: "accept",
    ctx,
    self: true,
    effects: [effect],
    notify: { lane: null, proposal: null },
    apply: (entry, id) => {
      const overlaps = overlapsFor(core.sql, id, body.scope);
      core.sql.all(
        "INSERT INTO lanes (id, seq, purpose, goal, plan, scope, generation, lease_gen, holder, expires_ms, state, kind, binding, lease_ms, conflict) VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, ?, 'held', ?, ?, ?, ?)",
        id,
        entry.seq,
        purpose,
        body.goal ?? "",
        body.plan ?? null,
        JSON.stringify(body.scope),
        lease.holder,
        ctx.now + leaseMs,
        kind,
        binding,
        recordedLease,
        conflict,
      );
      const rec: Claim = {
        ...recordBase(ctx, entry, id, "claim", receiptOf(entry)),
        lane: id,
        purpose,
        goal: body.goal ?? "", // G2:record-goal
        ...(body.plan !== undefined ? { plan: body.plan } : {}),
        scope: body.scope,
        lease,
        overlaps,
        effect,
      };
      return rec;
    },
  };
}

async function reclaim(ctx: Ctx, laneId: LaneId, body: ReclaimBody): Promise<Plan> {
  const core = ctx.core;
  const lane = laneRow(core.sql, laneId);
  if (!lane) return refused(ctx, nope("lane-unknown", `There is no lane ${laneId}.`, "Name an existing lane."), "R-LANE-3");
  laneFacts(ctx, lane);
  const wrong = threadCheck(ctx, lane);
  if (wrong) return refused(ctx, wrong, "R-DECL-8");
  if (lane.purpose === "config-recovery") {
    const r = recoveryLaneCheck(ctx, lane);
    if (r) return refused(ctx, r, "R-ADMIN-5");
    if (!body.scope.every((g) => g.startsWith(".artroom/")))
      return refused(ctx, nope("recovery-scope", "A configuration-recovery lane may cover only .artroom/**.", "Claim the other paths on an ordinary lane."), "R-ADMIN-5");
  }
  const rescope = body.lease !== undefined;
  if (rescope) {
    if (lane.state !== "held") return refused(ctx, nope("lease-fenced", `${laneId} has no holder, so a lease cannot match.`, "Take the lane over: claim it without a lease.", { leaseGeneration: lane.leaseGen }), "R-LANE-7");
    const h = holderCheck(ctx, lane, body.lease!);
    if (h) return refused(ctx, h, "R-LANE-3");
  } else if (lane.state === "held") {
    return refused(ctx, nope("lane-held", `${laneId} is held by ${lane.holder}.`, "Wait for a release or expiry, or ask the holder."), "R-LANE-7");
  }
  if (body.expectedGeneration !== lane.generation)
    return refused(ctx, nope("generation-moved", `The lane is at generation ${lane.generation}, not ${body.expectedGeneration}.`, "Read the lane and act on its current generation.", { generation: lane.generation }), "R-LANE-4");
  if (lane.purpose !== "config-recovery" && ctx.policy.doc.lanes === "exclusive") {
    const overlaps = overlapsFor(core.sql, laneId, body.scope);
    if (overlaps.length) return refused(ctx, nope("scope-overlap", `The scope may overlap ${overlaps[0]!.lane}.`, "Narrow the scope."), "R-POL-8");
  }
  const r = await policyRefuse(ctx, lane);
  if (r) return refused(ctx, r);
  const expires = ctx.now + leaseMsOf(core, lane);
  const lease = { holder: ctx.authority.member!, generation: rescope ? lane.leaseGen : lane.leaseGen + 1, expiresAt: iso(expires) };
  const effect = rescope
    ? ({ type: "rescoped", lane: laneId, scope: body.scope, obligationsRecomputed: false } as const)
    : ({ type: "taken-over", lane: laneId, lease, previous: null } as const);
  const effects: Effect[] = rescope ? [effect, renewEffect(ctx, lane)] : [effect];
  return {
    t: "accept",
    ctx,
    effects,
    notify: { lane: laneId, proposal: null },
    apply: (entry, id) => {
      core.sql.all(
        "UPDATE lanes SET scope = ?, goal = ?, plan = ?, holder = ?, lease_gen = ?, expires_ms = ?, state = 'held', why = NULL WHERE id = ?",
        JSON.stringify(body.scope),
        body.goal ?? lane.goal,
        body.plan ?? lane.plan,
        lease.holder,
        lease.generation,
        expires,
        laneId,
      );
      if (!rescope) core.landing.laneChanged(laneId, "lease-changed");
      const now = laneRow(core.sql, laneId)!;
      const rec: Claim = {
        ...recordBase(ctx, entry, id, "claim", receiptOf(entry)),
        lane: laneId,
        purpose: now.purpose,
        goal: now.goal,
        ...(now.plan !== null ? { plan: now.plan } : {}),
        scope: now.scope,
        lease,
        overlaps: overlapsFor(core.sql, laneId, now.scope),
        effect,
      };
      return rec;
    },
  };
}

// --------------------------------------------------------------- propose

async function propose(ctx: Ctx, laneId: LaneId, body: ProposeBody): Promise<Plan> {
  const core = ctx.core;
  const lane = laneRow(core.sql, laneId);
  if (!lane) return refused(ctx, nope("lane-unknown", `There is no lane ${laneId}.`, "Name an existing lane."), "R-LANE-3");
  laneFacts(ctx, lane);
  const wrong = threadCheck(ctx, lane);
  if (wrong) return refused(ctx, wrong, "R-DECL-8");
  const h = holderCheck(ctx, lane, body.lease);
  if (h) return refused(ctx, h, "R-LANE-3");
  if (body.expectedGeneration !== lane.generation)
    return refused(ctx, nope("generation-moved", `The lane is at generation ${lane.generation}, not ${body.expectedGeneration}.`, "Propose on the current generation.", { generation: lane.generation }), "R-LANE-4");
  const rec = recoveryLaneCheck(ctx, lane);
  if (rec) return refused(ctx, rec, "R-ADMIN-5");
  // Step 8: platform invariants.
  const pre = ctx.pre;
  if (!pre.head?.inFork) return refused(ctx, nope("head-unknown", `${body.head} is not reachable in the lane's fork.`, "Push the head to the lane's fork, then propose."), "R-PROP-1");
  if (!pre.diff) throw artroomError("unavailable", "The diff was not computed. Retry with the same idempotency key.");
  if (pre.diff.kind === "too-large")
    return refused(ctx, nope("diff-too-large", "The change is too large to evaluate.", "Split the change into smaller proposals."), "R-PROP-6");
  const changed: readonly PathChange[] = pre.diff.changed;
  const paths = changedPaths(changed);
  const generation = lane.generation + 1;
  const prospective = { generation, head: body.head, base: pre.diff.base, changed };
  const proposalInput = core.proposalInput(ctx.policy.doc, prospective);
  // R-ADM-1 step 8 as amended by 66d6fb14: with the head known and the changed paths computed and bounded
  // (R-PROP-1, R-PROP-3, R-PROP-6), policy `refuse` rules run before the claim check and the remaining
  // invariants, so a rule can name a cause that would otherwise show only as `outside-claim`. Skipped on a
  // recovery lane (R-ADMIN-5). `require` rules stay at step 9, on the same act meter (R-EVAL-9).
  const r = await policyRefuse(ctx, lane, proposalInput);
  if (r) return refused(ctx, r);
  // R-ADMIN-6 first on a recovery lane: its scope rule is the more specific one.
  if (lane.purpose === "config-recovery") {
    const bad = paths.filter((p) => !p.startsWith(".artroom/"));
    if (bad.length || !paths.length)
      return refused(ctx, nope("recovery-scope", `A configuration-recovery proposal may change only .artroom/**, and it changes ${bad.join(", ") || "nothing"}.`, "Propose the other changes on an ordinary lane."), "R-ADMIN-6");
  }
  const outside = paths.filter((p) => !matchesAny(p, lane.scope));
  if (outside.length) (ctx.facts as { path?: string }).path = outside[0]!;
  if (outside.length)
    return refused(ctx, nope("outside-claim", `${outside[0]} is outside the claim's scope${outside.length > 1 ? ` (and ${outside.length - 1} more)` : ""}.`, "Extend the claim."), "R-PROP-4");
  // R-POL-1: a proposed policy or checker configuration must be valid.
  if (paths.some(isConfigPath)) {
    const cfg = pre.config;
    const parsed = cfg ? core.parseConfig(cfg.policy, cfg.checkers) : { ok: false as const, problems: ["the configuration could not be read"] };
    if (!parsed.ok)
      return refused(ctx, nope("policy-invalid", `The proposed configuration is invalid: ${parsed.problems[0]}.`, "Correct the configuration and propose again."), "R-POL-1");
  }
  // Step 9: require (R-POL-3); none on a recovery lane (R-ADMIN-5, R-ADMIN-6).
  const admin = adminObligation(ctx.policy.version, paths);
  const specs: ObligationSpec[] = admin ? [admin] : [];
  if (admin) ctx.invariants.push({ rule: "R-ADMIN-1", held: true, detail: "a changed path matches .artroom/**: obl_admin-approval added" });
  if (lane.purpose !== "config-recovery") {
    const req = await core.ports.policy.require(
      ctx.policy,
      { kind: "require", actor: core.policyActor(ctx.authority), lane: core.policyLane(lane), proposal: proposalInput, room: core.policyRoom() },
      { budget: ctx.budget },
    );
    ctx.evaluations.push(...req.evaluations);
    if (req.refusal) return refused(ctx, fromRule(req.refusal));
    for (const o of withAdvisory(req.obligations, ctx.policy.checkers)) if (!specs.some((s) => s.id === o.id)) specs.push(o);
  }
  // Carrying earlier verdicts (R-CARRY), through the policy port: platform conditions first, then carry rules.
  const carried: { obligation: ObligationId; evidence: Carried }[] = [];
  const notCarried: NotCarried[] = [];
  if (lane.purpose !== "config-recovery" && lane.generation > 0) {
    const prev = generationRow(core.sql, laneId, lane.generation)!;
    const prevStatus = obligationsFor(core.sql, laneId, prev.generation, { doc: ctx.policy.doc, checkers: ctx.policy.checkers });
    const candidates = new Map<ActId, ObligationId[]>();
    for (const o of prevStatus) for (const act of o.evidenceActs) if (o.kind === "review") candidates.set(act, [...(candidates.get(act) ?? []), o.id]);
    for (const [act, obls] of candidates) {
      const row = one(core.sql, "SELECT * FROM evidence WHERE act = ?", act);
      if (!row) continue;
      const evGen = num(row, "generation")!;
      const evHead = str(row, "head") as Sha;
      const evBody = (JSON.parse(str(row, "body")!) as { authority: Authority; body: ReviewBody }).body;
      const evAuth = (JSON.parse(str(row, "body")!) as { authority: Authority }).authority;
      const since = pre.since?.get(evHead);
      if (since === undefined || since === null) {
        notCarried.push({ act, code: "scope-changed", text: "not carried: the changes since it could not be computed" });
        continue;
      }
      const evPolicy = generationRow(core.sql, laneId, evGen)?.policy;
      const revoked = invalidity(core.sql, { key: str(row, "key")!, grantor: str(row, "grantor") }, "reopens");
      const res = await core.ports.policy.carry(
        ctx.policy,
        {
          kind: "carry",
          evidence: {
            act,
            kind: "review",
            verdict: str(row, "verdict") as "approve",
            by: core.policyActor(evAuth),
            from: { generation: evGen, head: evHead },
            scope: evBody.scope,
            dependsOn: evBody.dependsOn ?? [],
          },
          changedSince: [...since],
          proposal: proposalInput,
          policy: { same: evPolicy === ctx.policy.version },
        },
        revoked ? { revoked: revoked.reason } : {},
        { budget: ctx.budget, purpose: lane.purpose },
      );
      ctx.evaluations.push(...res.evaluations);
      if (res.carried) for (const o of obls) if (specs.some((s) => s.id === o)) carried.push({ obligation: o, evidence: res.carried });
      if (res.notCarried) notCarried.push(res.notCarried);
    }
  }
  const previewId = opIds.preview(core.headSeq() + 1);
  return {
    t: "accept",
    ctx,
    effects: [
      { type: "proposed", lane: laneId, generation, head: body.head },
      ...(specs.length || carried.length ? [obligationsEffect(core, laneId, generation, specs, carried, ctx.policy)] : []),
      renewEffect(ctx, lane),
    ],
    notify: { lane: laneId, proposal: proposalInput },
    apply: (entry, id) => {
      core.sql.all(
        "INSERT INTO generations (lane, generation, act, seq, head, base, summary, proposer, changed, obligations, carried, not_carried, policy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        laneId,
        generation,
        id,
        entry.seq,
        body.head,
        prospective.base,
        body.summary ?? "",
        ctx.authority.member!,
        JSON.stringify(changed),
        JSON.stringify(specs),
        JSON.stringify(carried),
        JSON.stringify(notCarried),
        ctx.policy.version,
      );
      core.sql.all("UPDATE lanes SET generation = ? WHERE id = ?", generation, laneId);
      renewLease(ctx, laneId);
      const ref = pinnedRef(laneId, generation);
      core.sql.all("INSERT INTO pins (ref, head, done) VALUES (?, ?, 0) ON CONFLICT (ref) DO NOTHING", ref, body.head);
      // Spike measurement only (PIN_DELAY_MS): the pin is left to the alarm, due later.
      if (core.pinDelayMs > 0) setMeta(core.sql, `pin_due:${ref}`, String(ctx.now + core.pinDelayMs));
      const preview = { id: previewId, kind: "preview" as const, updatedAt: entry.at, lane: laneId, generation, state: "pending" as const };
      core.sql.all(
        "INSERT INTO previews (id, lane, generation, head, state, body, main, updated_ms) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)",
        previewId,
        laneId,
        generation,
        body.head,
        JSON.stringify(preview),
        pre.main ?? null,
        ctx.now,
      );
      // R-LAND-9: a new generation invalidates an unreserved landing on the lane.
      core.landing.laneChanged(laneId, "generation-moved");
      for (const s of specs) {
        if (s.kind === "review")
          for (const who of s.from)
            core.attend(who, entry.seq, laneId, { why: "review-requested", proposal: { lane: laneId, generation }, obligation: s.id, as: who }, `Review ${laneId} generation ${generation} for ${s.id}.`);
        else
          for (const who of s.by)
            core.attend(who, entry.seq, laneId, { why: "check-requested", proposal: { lane: laneId, generation }, obligation: s.id }, `Run ${s.check} on ${laneId} generation ${generation}.`);
      }
      return proposalRecord(core, recordBase(ctx, entry, id, "propose", receiptOf(entry)), laneId, generation, ctx.policy);
    },
    afterCommit: () => {
      // With the spike's PIN_DELAY_MS, the pins step leaves a pin that is not due yet.
      core.run("pins");
      core.run("previews");
    },
  };
}

function obligationsEffect(
  core: RoomCore,
  lane: LaneId,
  generation: Generation,
  specs: readonly ObligationSpec[],
  carried: readonly { obligation: ObligationId; evidence: Carried }[],
  policy: ActivePolicyFull,
): Effect {
  const gen: GenerationRow = {
    lane,
    generation,
    act: "act_0_00000000",
    seq: 0,
    head: "" as Sha,
    base: "" as Sha,
    summary: "",
    proposer: "@x" as MemberId,
    changed: [],
    obligations: specs,
    carried,
    notCarried: [],
    policy: policy.version,
    landed: null,
    blocked: null,
    recompute: null,
  };
  const { opened, met } = transitions([], statusesOf(core.sql, gen, { doc: policy.doc, checkers: policy.checkers }), true);
  return { type: "obligations", lane, generation, opened, met };
}

/** The `Proposal` record, as admitted or as read now. */
export function proposalRecord(core: RoomCore, base: ReturnType<typeof recordBase<"propose">>, lane: LaneId, generation: Generation, policy: ActivePolicyFull): Proposal {
  const g = generationRow(core.sql, lane, generation)!;
  const preview = JSON.parse(str(one(core.sql, "SELECT body FROM previews WHERE lane = ? AND generation = ?", lane, generation), "body")!) as Proposal["preview"];
  return {
    ...base,
    lane,
    generation,
    head: g.head,
    base: g.base,
    pinnedRef: pinnedRef(lane, generation),
    summary: g.summary,
    changed: g.changed,
    obligations: obligationsFor(core.sql, lane, generation, { doc: policy.doc, checkers: policy.checkers }).map(publicObligation),
    notCarried: g.notCarried,
    preview,
  };
}

// --------------------------------------------------------------- note

async function note(ctx: Ctx, anchor: NoteAnchor, body: { text: string; replyTo?: ActId }): Promise<Plan> {
  const core = ctx.core;
  let lane: LaneRow | null = null;
  if ("act" in anchor) {
    const e = one(core.sql, "SELECT id, lane FROM entries WHERE id = ?", anchor.act);
    if (!e) return refused(ctx, nope("lane-unknown", `There is no entry ${anchor.act}.`, "Anchor the note to an existing act."), "R-LANE-3");
    const l = str(e, "lane");
    lane = l ? laneRow(core.sql, l) : null;
    if (lane) laneFacts(ctx, lane);
    const wrong = threadCheck(ctx, lane, true);
    if (wrong) return refused(ctx, wrong, "R-DECL-8");
  } else {
    lane = laneRow(core.sql, anchor.lane);
    if (!lane) return refused(ctx, nope("lane-unknown", `There is no lane ${anchor.lane}.`, "Anchor the note to an existing lane."), "R-LANE-3");
    laneFacts(ctx, lane);
    const wrong = threadCheck(ctx, lane);
    if (wrong) return refused(ctx, wrong, "R-DECL-8");
    const g = generationRow(core.sql, anchor.lane, anchor.generation);
    if (!g) return refused(ctx, nope("lane-unknown", `${anchor.lane} has no generation ${anchor.generation}.`, "Anchor the note to an existing generation."), "R-LANE-3");
    if (g.head !== anchor.head) return refused(ctx, nope("head-mismatch", `Generation ${anchor.generation}'s head is ${g.head}.`, "Anchor the note to the head you read."), "R-OBL-1");
  }
  const rec = recoveryLaneCheck(ctx, lane);
  if (rec) return refused(ctx, rec, "R-ADMIN-5");
  const r = await policyRefuse(ctx, lane);
  if (r) return refused(ctx, r);
  const byHolder = lane && lane.state === "held" && lane.holder === ctx.authority.member;
  return {
    t: "accept",
    ctx,
    effects: byHolder ? [renewEffect(ctx, lane!)] : [],
    notify: { lane: lane?.id ?? null, proposal: null },
    apply: (entry, id) => {
      if (byHolder) renewLease(ctx, lane!.id);
      if (lane?.holder && lane.holder !== ctx.authority.member)
        core.attend(lane.holder, entry.seq, lane.id, { why: "note", note: id, ...(body.replyTo ? { replyTo: body.replyTo } : {}) }, `New note on ${lane.id}.`);
      if (body.replyTo) {
        const to = str(one(core.sql, "SELECT by_member FROM entries WHERE id = ?", body.replyTo), "by_member");
        if (to && to !== ctx.authority.member && to !== lane?.holder) core.attend(to, entry.seq, lane?.id ?? null, { why: "note", note: id, replyTo: body.replyTo }, "A reply to your note.");
      }
      const recd: Note = {
        ...recordBase(ctx, entry, id, "note", receiptOf(entry)),
        anchor,
        text: body.text ?? "",
        ...(body.replyTo ? { replyTo: body.replyTo } : {}),
      };
      return recd;
    },
  };
}

// --------------------------------------------------------------- review

async function review(ctx: Ctx, laneId: LaneId, generation: Generation, body: ReviewBody): Promise<Plan> {
  const core = ctx.core;
  const lane = laneRow(core.sql, laneId);
  if (!lane) return refused(ctx, nope("lane-unknown", `There is no lane ${laneId}.`, "Name an existing lane."), "R-LANE-3");
  laneFacts(ctx, lane);
  const wrong = threadCheck(ctx, lane);
  if (wrong) return refused(ctx, wrong, "R-DECL-8");
  const g = generationRow(core.sql, laneId, generation);
  if (!g) return refused(ctx, nope("lane-unknown", `${laneId} has no generation ${generation}.`, "Review an existing generation."), "R-LANE-3");
  const rec = recoveryLaneCheck(ctx, lane);
  if (rec) return refused(ctx, rec, "R-ADMIN-5");
  // R-OBL-1: the review binds the head the reviewer saw.
  if (body.head !== g.head) return refused(ctx, nope("head-mismatch", `Generation ${generation}'s head is ${g.head}, not ${body.head}.`, "Review the head of that generation."), "R-OBL-1");
  // R-OBL-2: who may meet which review obligation, by the one qualification rule.
  const member = ctx.authority.member!;
  const author = member === g.proposer || (lane.state === "held" && lane.holder === member);
  const admins = activeAdmins(core.sql).length;
  const admission = { teams: ctx.authority.member ? teamsOf(core.sql, ctx.authority.member) : [], author };
  const reviewObls = g.obligations.filter((o) => o.kind === "review");
  // R-ADMIN-2, R-ADMIN-7: a sole active admin's own approval of `.artroom/**` is admitted, flagged.
  const flags = [...ctx.flags];
  if (author && body.verdict === "approve" && admins === 1 && ctx.authority.role === "admin" && reviewObls.some((o) => o.id === ADMIN_APPROVAL))
    flags.push("sole-admin-self-approval");
  const prospective = (act: ActId, seq: number): EvidenceRow => ({
    act,
    seq,
    kind: "review",
    lane: laneId,
    generation,
    head: body.head,
    member,
    key: ctx.env.actor,
    grantor: ctx.authority.via === "delegation" ? ctx.authority.grantor : null,
    verdict: body.verdict,
    qualifies: [],
    flags,
    authority: ctx.authority,
    admission,
    body,
    canonical: null,
  });
  const judged = reviewObls.map((o) => qualification(ctx.policy.doc, o, prospective("act_0_00000000", 0)));
  if (!judged.some((q) => q === true || q === "self"))
    return refused(ctx, nope("not-authorized-reviewer", `${ctx.authority.member ?? "This signer"} qualifies for no review obligation on this generation.`, "Ask a qualifying reviewer."), "R-OBL-2");
  const usable = reviewObls.filter((_, i) => judged[i] === true);
  if (!usable.length)
    return refused(ctx, nope("self-review", "The author cannot meet these obligations on their own lane.", admins > 1 ? "Ask another admin or reviewer." : "Ask another reviewer."), "R-OBL-2");
  ctx.flags = flags;
  const r = await policyRefuse(ctx, lane);
  if (r) return refused(ctx, r);
  const qualifiesIds = usable.map((o) => o.id);
  // P2.7: the sealed effect comes from the same calculator as the projection, before and after this verdict.
  const statusOpts = { doc: ctx.policy.doc, checkers: ctx.policy.checkers };
  const before = statusesOf(core.sql, g, statusOpts);
  const after = statusesOf(core.sql, g, { ...statusOpts, extra: [prospective(`act_${core.headSeq() + 1}_00000000`, core.headSeq() + 1)] });
  // Both directions: an approval can meet an obligation, and an objection can reopen one (review 8faa2ef9).
  const moved = transitions(before, after);
  return {
    t: "accept",
    ctx,
    effects: moved.opened.length || moved.met.length ? [{ type: "obligations", lane: laneId, generation, opened: moved.opened, met: moved.met }] : [],
    notify: { lane: laneId, proposal: core.proposalInput(ctx.policy.doc, g) },
    apply: (entry, id) => {
      core.sql.all(
        "INSERT INTO evidence (act, seq, kind, lane, generation, head, member, key, grantor, verdict, qualifies, flags, body) VALUES (?, ?, 'review', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        id,
        entry.seq,
        laneId,
        generation,
        body.head,
        member,
        ctx.env.actor,
        ctx.authority.via === "delegation" ? ctx.authority.grantor : null,
        body.verdict,
        JSON.stringify(qualifiesIds),
        JSON.stringify(ctx.flags),
        JSON.stringify({ authority: ctx.authority, admission, body }),
      );
      if (body.verdict === "object" && lane.holder)
        core.attend(lane.holder, entry.seq, laneId, { why: "objection", proposal: { lane: laneId, generation }, review: id }, `${member} objected to generation ${generation}.`);
      // R-LAND-9: a new verdict changes the land-rule input. The landing's next step or
      // reservation sees it: reservation compares the rebuilt input's bytes (R-LAND-7).
      const rv: Review = {
        ...recordBase(ctx, entry, id, "review", receiptOf(entry)),
        lane: laneId,
        generation,
        head: body.head,
        verdict: body.verdict,
        scope: body.scope,
        dependsOn: body.dependsOn ?? [],
        text: body.text ?? "", // G2:record-text
        fulfils:
          body.verdict === "approve"
            ? qualifiesIds.map((o) => ({ obligation: o, evidence: { basis: "here" as const, act: id, kind: "review" as const, generation, head: body.head } }))
            : [],
      };
      return rv;
    },
  };
}

// --------------------------------------------------------------- check

async function check(ctx: Ctx, laneId: LaneId, generation: Generation, body: CheckBody): Promise<Plan> {
  const core = ctx.core;
  const lane = laneRow(core.sql, laneId);
  if (!lane) return refused(ctx, nope("lane-unknown", `There is no lane ${laneId}.`, "Name an existing lane."), "R-LANE-3");
  laneFacts(ctx, lane);
  const wrong = threadCheck(ctx, lane);
  if (wrong) return refused(ctx, wrong, "R-DECL-8");
  (ctx.facts as { obligation?: string }).obligation = body.obligation;
  const g = generationRow(core.sql, laneId, generation);
  if (!g) return refused(ctx, nope("lane-unknown", `${laneId} has no generation ${generation}.`, "Check an existing generation."), "R-LANE-3");
  const rec = recoveryLaneCheck(ctx, lane);
  if (rec) return refused(ctx, rec, "R-ADMIN-5");
  // R-OBL-3: binding and authority.
  const spec = g.obligations.find((o) => o.id === body.obligation);
  if (!spec || spec.kind !== "check") return refused(ctx, nope("obligation-unknown", `Generation ${generation} has no check obligation ${body.obligation}.`, "Name an open check obligation."), "R-OBL-3");
  const member = ctx.authority.member;
  const admission = { teams: member ? teamsOf(core.sql, member) : [], author: member === g.proposer || (lane.state === "held" && member === lane.holder) };
  const prospective = (act: ActId, seq: number, canonical: Sha | null = null): EvidenceRow => ({
    act,
    seq,
    kind: "check",
    lane: laneId,
    generation,
    head: g.head,
    member: member!,
    key: ctx.env.actor,
    grantor: ctx.authority.via === "delegation" ? ctx.authority.grantor : null,
    verdict: null,
    qualifies: [],
    flags: ctx.flags,
    authority: ctx.authority,
    admission,
    body,
    canonical,
  });
  // R-OBL-3 by the one qualification rule: the holder or proposer never meets its own check.
  const q = qualification(ctx.policy.doc, spec, prospective("act_0_00000000", 0), ctx.policy.checkers);
  if (q === "principal" || q === "self")
    return refused(ctx, nope("not-authorized-checker", `${member ?? "This signer"} may not meet ${spec.id}.`, "Ask an authorized checker."), "R-OBL-3");
  const binding = (why: string) => refused(ctx, nope("check-binding", why, "Run the check on the integration the room prepared, with the active configuration."), "R-OBL-3");
  if (body.check !== spec.check) return binding(`The obligation needs the ${spec.check} checker, not ${body.check}.`);
  // The integrations the room prepared for this generation: its clean preview's, and each active landing's. A check
  // that names a land operation was run for that landing's job, and binds only that landing's integration.
  const prepared: { integration: string; op: string | null }[] = [];
  const preview = one(core.sql, "SELECT body FROM previews WHERE lane = ? AND generation = ?", laneId, generation);
  const pv = preview ? (JSON.parse(str(preview, "body")!) as { state: string; integration?: string }) : null;
  if (pv?.state === "clean" && pv.integration) prepared.push({ integration: pv.integration, op: null });
  for (const op of core.landing.activeViews())
    if (op.lane === laneId && op.generation === generation && "integration" in op && op.integration) prepared.push({ integration: op.integration, op: op.id });
  // A job the landing did not wait for (an advisory obligation, R-OBL-7) may answer after it landed: its check binds
  // the landed integration, when it names that operation.
  const landed = body.landOp !== undefined ? core.landing.view(body.landOp) : null;
  if (landed?.state === "landed" && landed.lane === laneId && landed.generation === generation) prepared.push({ integration: landed.integration, op: landed.id });
  const jobs = body.landOp === undefined ? prepared : prepared.filter((p) => p.op === body.landOp);
  if (body.landOp !== undefined && !jobs.length) return binding(`The check names ${body.landOp}, which is not an active or landed landing of this generation.`);
  // R-CARRY-15 step 5: a scoped check may bind a snapshot commit the room recorded for one of these integrations. Several
  // integrations can share one snapshot commit, so the commit alone never names the canonical integration (review 95323c2b).
  const snapshotRows = core.sql.all("SELECT * FROM check_snapshots WHERE commit_sha = ?", body.integration);
  const recorded = snapshotRows.filter((r) => jobs.some((j) => j.integration === str(r, "integration")));
  if (snapshotRows.length ? !recorded.length : !jobs.some((j) => j.integration === body.integration))
    return binding("The check does not bind an integration the room prepared for this generation.");
  const cfg = ctx.policy.checkers[body.check];
  if (!cfg || cfg.digest !== body.config) return binding("The check's configuration digest is not the active configuration's.");
  // R-CARRY-10: the signed flag must be the configuration's; a check is never carried on a flag it contradicts.
  if (body.volatile !== cfg.config.volatile) return binding(`The check says volatile ${String(body.volatile)}, but the checker's configuration says ${String(cfg.config.volatile)}.`);
  // R-CARRY-14: a configuration that pins a runner environment admits only checks that state it.
  if (cfg.config.runner !== undefined && body.runner !== cfg.config.runner)
    return binding(`The check says runner ${body.runner}, but the checker's configuration pins ${cfg.config.runner}.`);
  let canonical = body.integration;
  if (snapshotRows.length) {
    const input = body.input;
    const mine = recorded.filter((r) => str(r, "checker") === body.check && str(r, "config") === cfg.digest);
    if (input.kind !== "filtered" || !mine.length) return binding("The snapshot commit was recorded for another checker or configuration.");
    const paths = canonicalize([...input.paths].sort());
    const exact = mine.filter((r) => str(r, "paths") === paths && str(r, "digest") === input.snapshot);
    if (!exact.length) return binding("The check's snapshot is not the one the room recorded for this snapshot commit.");
    // Exactly one with `landOp` (one row per integration, checker and configuration). Without it, more than one only if
    // this generation's preview and landing integrations differ and share the snapshot: fail closed rather than choose.
    if (exact.length > 1) return binding("The snapshot commit was recorded for more than one integration of this generation. Name the land operation the check ran for.");
    canonical = str(exact[0]!, "integration") as Sha;
  } else if (body.input.kind === "tree") {
    if (ctx.pre.tree === undefined || body.input.tree !== ctx.pre.tree) return binding("The check's input is not the integration's tree.");
  } else {
    // R-OBL-3, R-CARRY-8, R-CARRY-9: a scoped checker's snapshot covers exactly its declared inputs plus the global
    // inputs, from the active configuration; the room builds the snapshot itself and compares digests.
    const inputs = checkerInputs(cfg.config.inputs, ctx.policy.doc.carry);
    if (!inputs || canonicalize([...body.input.paths].sort()) !== canonicalize([...inputs].sort()))
      return binding("The check's inputs are not the checker's declared inputs plus the global inputs.");
    if (!ctx.pre.snapshot || body.input.snapshot !== ctx.pre.snapshot) return binding("The check's input is not the room's filtered snapshot of the integration.");
  }
  if (q !== true) return binding("The check does not bind this obligation under the active configuration.");
  const r = await policyRefuse(ctx, lane);
  if (r) return refused(ctx, r);
  const statusOpts = { doc: ctx.policy.doc, checkers: ctx.policy.checkers };
  const moved = transitions(
    statusesOf(core.sql, g, statusOpts),
    statusesOf(core.sql, g, { ...statusOpts, extra: [prospective(`act_${core.headSeq() + 1}_00000000`, core.headSeq() + 1, canonical)] }),
  );
  return {
    t: "accept",
    ctx,
    effects: moved.opened.length || moved.met.length ? [{ type: "obligations", lane: laneId, generation, opened: moved.opened, met: moved.met }] : [],
    notify: { lane: laneId, proposal: core.proposalInput(ctx.policy.doc, g) },
    apply: (entry, id) => {
      core.sql.all(
        "INSERT INTO evidence (act, seq, kind, lane, generation, head, member, key, grantor, verdict, qualifies, flags, body) VALUES (?, ?, 'check', ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)",
        id,
        entry.seq,
        laneId,
        generation,
        g.head,
        member!,
        ctx.env.actor,
        ctx.authority.via === "delegation" ? ctx.authority.grantor : null,
        JSON.stringify([spec.id]),
        JSON.stringify(ctx.flags),
        JSON.stringify({ authority: ctx.authority, admission, body, canonical }),
      );
      const op = core.activeLandOp(laneId);
      if (op) core.requestEvaluation(op);
      const c: Check = {
        ...recordBase(ctx, entry, id, "check", receiptOf(entry)),
        lane: laneId,
        generation,
        obligation: body.obligation,
        check: body.check,
        integration: body.integration,
        input: body.input,
        config: body.config,
        runner: body.runner,
        volatile: body.volatile,
        ok: body.ok,
        detail: body.detail,
        ...(body.landOp ? { landOp: body.landOp } : {}),
      };
      return c;
    },
  };
}

// --------------------------------------------------------------- land

async function land(ctx: Ctx, laneId: LaneId, generation: Generation, body: { lease: number; head: Sha }): Promise<Plan> {
  const core = ctx.core;
  const lane = laneRow(core.sql, laneId);
  if (!lane) return refused(ctx, nope("lane-unknown", `There is no lane ${laneId}.`, "Name an existing lane."), "R-LANE-3");
  laneFacts(ctx, lane);
  const wrong = threadCheck(ctx, lane);
  if (wrong) return refused(ctx, wrong, "R-DECL-8");
  const h = holderCheck(ctx, lane, body.lease);
  if (h) return refused(ctx, h, "R-LAND-1");
  const rec = recoveryLaneCheck(ctx, lane);
  if (rec) return refused(ctx, rec, "R-ADMIN-8");
  if (generation !== lane.generation)
    return refused(ctx, nope("generation-moved", `The latest generation is ${lane.generation}.`, "Land the latest generation.", { generation: lane.generation }), "R-LAND-1");
  const g = generationRow(core.sql, laneId, generation);
  if (!g) return refused(ctx, nope("lane-unknown", "Nothing has been proposed on this lane.", "Propose first."), "R-LAND-1");
  if (body.head !== g.head) return refused(ctx, nope("head-mismatch", `Generation ${generation}'s head is ${g.head}.`, "Land the head you reviewed."), "R-LAND-1");
  const inFlight = core.activeLandOp(laneId);
  if (inFlight) return refused(ctx, nope("land-in-progress", "This lane already has a landing operation in flight.", "Wait for it to finish.", { op: inFlight }), "R-LANE-10");
  if (g.blocked) return refused(ctx, fromRule({ ...g.blocked, refused: true }), "R-POL-9");
  if (g.recompute) return refused(ctx, nope("obligation-open", "The obligations are being recomputed under a new policy.", "Try again shortly."), "R-POL-9");
  const obligations = obligationsFor(core.sql, laneId, generation, { doc: ctx.policy.doc, checkers: ctx.policy.checkers });
  const open = obligations.find((o) => o.kind === "review" && o.state !== "met");
  if (open) (ctx.facts as { obligation?: string }).obligation = open.id;
  if (open) return refused(ctx, nope("obligation-open", `The obligation ${open.id} is open.`, "Meet it, then land."), "R-LAND-1");
  // Step 9: refuse rules on `land`, then land rules at stage "land" (R-POL-6); neither on a recovery lane (R-ADMIN-8).
  const r = await policyRefuse(ctx, lane);
  if (r) return refused(ctx, r);
  if (lane.purpose !== "config-recovery") {
    const input = core.landInput({ lane: laneId, generation }, lane, g, ctx.policy, "land", ctx.authority);
    const lr = await core.ports.policy.land(ctx.policy, input, { budget: ctx.budget });
    ctx.evaluations.push(...lr.evaluations);
    if (lr.refusal) return refused(ctx, fromRule(lr.refusal));
  }
  const opId = opIds.land(core.headSeq() + 1);
  return {
    t: "accept",
    ctx,
    effects: [{ type: "land-op", op: opId, state: "accepted" }, renewEffect(ctx, lane)],
    notify: { lane: laneId, proposal: core.proposalInput(ctx.policy.doc, g) },
    apply: (entry, id) => {
      renewLease(ctx, laneId);
      // R-LAND-1: the operation is written in the same transaction as the act, before any external I/O.
      const accepted = core.landing.accept({ id: opId, lane: laneId, generation, head: g.head, act: id, leaseGeneration: lane.leaseGen, policyVersion: ctx.policy.version });
      if ("refused" in accepted) throw new Moved();
      const l: Landing = { ...recordBase(ctx, entry, id, "land", receiptOf(entry)), lane: laneId, generation, op: core.landing.view(opId)! };
      return l;
    },
  };
}

// --------------------------------------------------------------- release and renew

async function release(ctx: Ctx, laneId: LaneId, body: ReleaseBody): Promise<Plan> {
  const core = ctx.core;
  const lane = laneRow(core.sql, laneId);
  if (!lane) return refused(ctx, nope("lane-unknown", `There is no lane ${laneId}.`, "Name an existing lane."), "R-LANE-3");
  laneFacts(ctx, lane);
  const wrong = threadCheck(ctx, lane);
  if (wrong) return refused(ctx, wrong, "R-DECL-8");
  const h = holderCheck(ctx, lane, body.lease);
  if (h) return refused(ctx, h, "R-LANE-3");
  const rec = recoveryLaneCheck(ctx, lane);
  if (rec) return refused(ctx, rec, "R-ADMIN-5");
  const r = await policyRefuse(ctx, lane);
  if (r) return refused(ctx, r);
  return {
    t: "accept",
    ctx,
    effects: [{ type: "released", lane: laneId, leaseGeneration: lane.leaseGen }],
    notify: { lane: laneId, proposal: null },
    apply: (entry, id) => {
      core.sql.all(
        "UPDATE lanes SET state = 'unheld', why = 'released', holder = NULL, expires_ms = NULL, lease_gen = lease_gen + 1, handover = ? WHERE id = ?",
        body.note !== undefined ? id : null,
        laneId,
      );
      core.landing.laneChanged(laneId, "released");
      core.attend("role:member", entry.seq, laneId, { why: "lane-unheld", lane: laneId, reason: "released" }, `${laneId} was released.`);
      const rl: Release = { ...recordBase(ctx, entry, id, "release", receiptOf(entry)), lane: laneId, ...(body.note !== undefined ? { note: body.note } : {}) };
      return rl;
    },
    afterCommit: () => core.run("tokens"),
  };
}

async function renew(ctx: Ctx, laneId: LaneId, lease: number): Promise<Plan> {
  const core = ctx.core;
  const lane = laneRow(core.sql, laneId);
  if (!lane) return refused(ctx, nope("lane-unknown", `There is no lane ${laneId}.`, "Name an existing lane."), "R-LANE-3");
  const h = holderCheck(ctx, lane, lease);
  if (h) return refused(ctx, h, "R-LANE-5");
  const rec = recoveryLaneCheck(ctx, lane);
  if (rec) return refused(ctx, rec, "R-ADMIN-5");
  const r = await policyRefuse(ctx, lane);
  if (r) return refused(ctx, r);
  const effect = renewEffect(ctx, lane);
  return {
    t: "accept",
    ctx,
    effects: [effect],
    notify: { lane: laneId, proposal: null },
    apply: (entry, id) => {
      renewLease(ctx, laneId);
      const rn: Renewal = {
        ...recordBase(ctx, entry, id, "renew", receiptOf(entry)),
        lane: laneId,
        lease: { holder: lane.holder!, generation: lane.leaseGen, expiresAt: iso(ctx.now + leaseMsOf(core, lane)) },
      };
      return rn;
    },
  };
}

// --------------------------------------------------------------- roster

/** Would this op leave no active admin (R-GEN-8)? */
function leavesNoAdmin(core: RoomCore, op: RosterOp): boolean {
  const admins = activeAdmins(core.sql);
  if (op.op === "set-role") return op.role !== "admin" && admins.length === 1 && admins[0] === op.member;
  if (op.op === "remove") return admins.length === 1 && admins[0] === op.member;
  if (op.op === "revoke-key") {
    const k = keyRow(core.sql, op.key);
    return !!k && admins.length === 1 && admins[0] === k.member && activeKeys(core.sql, k.member).length === 1;
  }
  return false;
}

async function roster(ctx: Ctx, op: RosterOp): Promise<Plan> {
  const core = ctx.core;
  const sql = core.sql;
  // R-GEN-8: never leave the room without an active admin, except by the recovery key.
  if (ctx.authority.via !== "recovery" && leavesNoAdmin(core, op))
    return refused(ctx, nope("last-admin", "This would leave the room with no active admin.", "Make another member an admin first."), "R-GEN-8");
  const r = await policyRefuse(ctx, null);
  if (r) return refused(ctx, r);

  let effects: Effect[] = [];
  let invalidated: RosterRecord["invalidated"] | undefined;
  let compromised: { readonly evidence: readonly EvidenceRow[]; readonly delegations: readonly Delegation["id"][] } | null = null;
  if (op.op === "revoke-key" && op.reason === "compromised") {
    // R-REV-3: what stops counting, and which obligations reopen.
    const evidence = evidenceByKey(sql, op.key);
    const exclude = new Set(evidence.map((e) => e.act));
    const reopened: { lane: LaneId; generation: Generation; obligation: ObligationId }[] = [];
    const byGen = new Map<string, { lane: LaneId; generation: Generation }>();
    for (const e of evidence) byGen.set(`${e.lane}/${e.generation}`, { lane: e.lane, generation: e.generation });
    // Carried evidence counts on later generations too.
    for (const g of core.openGenerations())
      if (g.carried.some((c) => exclude.has(c.evidence.act))) byGen.set(`${g.lane}/${g.generation}`, { lane: g.lane, generation: g.generation });
    for (const { lane, generation } of byGen.values()) {
      const g = generationRow(sql, lane, generation);
      if (!g || g.landed) continue;
      const opts = { doc: ctx.policy.doc, checkers: ctx.policy.checkers };
      const { opened } = transitions(obligationsFor(sql, lane, generation, opts), obligationsFor(sql, lane, generation, { ...opts, exclude }));
      for (const o of opened) reopened.push({ lane, generation, obligation: o });
      if (opened.length) effects.push({ type: "obligations", lane, generation, opened, met: [] });
    }
    const delegations = sql
      .all("SELECT id FROM delegations WHERE (grantor = ? OR grantee = ?) AND revoked IS NULL", op.key, op.key)
      .map((row) => str(row, "id") as Delegation["id"]);
    compromised = { evidence, delegations };
    invalidated = { evidence: evidence.map((e) => e.act), reopened };
  }
  return {
    t: "accept",
    ctx,
    effects,
    notify: null,
    apply: (entry, id) => {
      const seq = entry.seq;
      let abortAttempt: OpId | undefined;
      switch (op.op) {
        case "invite": {
          const exp = parseTime(op.expiresAt)!;
          sql.all(
            "INSERT INTO invitations (id, member, role, custody, expires_at, expires_ms, secret_hash, session, declared) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            id,
            op.member,
            op.role ?? null,
            op.custody,
            op.expiresAt,
            exp,
            op.secretHash,
            op.session ? JSON.stringify(op.session) : null,
            // R-DECL-17: what an invitation with no session grants was fixed by the vocabulary it was admitted under.
            isDeclared(ctx.policy.doc) ? 1 : null, // G2:invitation-era
          );
          break;
        }
        case "join": {
          const inv = invitation(sql, op.invitation)!;
          const by = ctx.authority as Extract<Authority, { via: "join" }>;
          if (!memberRow(sql, inv.member)) sql.all("INSERT INTO members (handle, role, state, joined) VALUES (?, ?, 'active', ?)", inv.member, by.role, seq);
          sql.all("INSERT INTO keys (key, member, custody, added, state) VALUES (?, ?, ?, ?, 'active')", ctx.env.actor, inv.member, inv.custody, seq);
          sql.all("UPDATE invitations SET used = ? WHERE id = ?", seq, op.invitation);
          break;
        }
        case "set-role":
          sql.all("UPDATE members SET role = ? WHERE handle = ?", op.role, op.member);
          break;
        case "remove":
          sql.all("UPDATE members SET state = 'removed' WHERE handle = ?", op.member);
          break;
        case "revoke-key": {
          if (keyRow(sql, op.key))
            sql.all("UPDATE keys SET state = 'revoked', reason = ?, revoked_at = ?, revoked_by = ? WHERE key = ?", op.reason, seq, id, op.key);
          else sql.all("INSERT INTO revoked_keys (key, reason, revoked_at, revoked_by) VALUES (?, ?, ?, ?)", op.key, op.reason, seq, id);
          if (compromised) {
            for (const d of compromised.delegations) sql.all("UPDATE delegations SET revoked = ? WHERE id = ?", seq, d);
            const acts = new Set(compromised.evidence.map((e) => e.act));
            // R-REV-3: unreserved landings that depend on the evidence become retryable. An advisory obligation
            // that reopens is shown, but never holds up a landing (R-OBL-7).
            const blocks = (x: { lane: LaneId; generation: Generation; obligation: ObligationId }) =>
              !!generationRow(sql, x.lane, x.generation)?.obligations.some((o) => o.id === x.obligation && blocking(o));
            for (const v of core.landing.activeViews()) {
              if (v.state !== "accepted" && v.state !== "preparing" && v.state !== "ready") continue;
              const uses = ("evidence" in v && v.evidence.some((a) => acts.has(a))) || (invalidated?.reopened ?? []).some((x) => x.lane === v.lane && blocks(x));
              if (uses) core.landing.laneChanged(v.lane, "evidence-invalid");
            }
            // R-REV-5: a compromised key behind the reserved landing starts a recorded abort attempt.
            const after = core.landing.after();
            if (after) {
              const held = core.landing.view(after.op);
              if (held && (held.state === "publishing" || held.state === "unresolved")) {
                const initiator = landAuthority(core, held.act);
                const keys = new Set<string>();
                for (const a of held.evidence) {
                  const row = one(sql, "SELECT key, grantor FROM evidence WHERE act = ?", a);
                  if (row) {
                    keys.add(str(row, "key")!);
                    const gr = str(row, "grantor");
                    if (gr) keys.add(gr);
                  }
                }
                if (initiator) {
                  keys.add(initiator.key);
                  if (initiator.via === "delegation") keys.add(initiator.grantor);
                }
                if (keys.has(op.key) && core.landing.abort(id, op.key, seq)) {
                  abortAttempt = held.id;
                  core.run("abort");
                }
              }
            }
            // R-REV-8: completed landings that relied on the key go to the admins.
            for (const e of compromised.evidence) {
              const g = generationRow(sql, e.lane, e.generation);
              if (g?.landed)
                for (const o of g.obligations)
                  if (e.qualifies.includes(o.id))
                    core.attendAdmins(seq, e.lane, { why: "evidence-invalidated", proposal: { lane: e.lane, generation: e.generation }, obligation: o.id }, `Evidence for a landed change on ${e.lane} came from a compromised key.`);
            }
          }
          break;
        }
        case "team":
          sql.all("INSERT INTO teams (team, members) VALUES (?, ?) ON CONFLICT (team) DO UPDATE SET members = excluded.members", op.team, JSON.stringify([...op.members].sort()));
          break;
        case "delegate": {
          const exp = parseTime(op.expiresAt)!;
          // R-DECL-17: a grant in a v2 room keeps its signed map from declared kind to binding.
          const acts = (op as { acts?: unknown }).acts; // G2:grant-store
          sql.all(
            "INSERT INTO delegations (id, grantor, grantee, kinds, lanes, expires_at, expires_ms, acts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            id,
            ctx.env.actor,
            op.to,
            // R-ADM-5, R-LOG-10: "*" is fixed at the grant to the kinds the grantor's role may sign now.
            JSON.stringify(op.kinds === "*" ? delegableBy(ctx.authority.role!) : op.kinds),
            JSON.stringify(op.lanes),
            op.expiresAt,
            exp,
            acts === undefined ? null : JSON.stringify(acts),
          );
          break;
        }
        case "undelegate":
          sql.all("UPDATE delegations SET revoked = ? WHERE id = ?", seq, op.delegation);
          break;
        case "rotate-recovery":
          sql.all("INSERT INTO meta (k, v) VALUES ('recovery', ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v", op.key);
          break;
      }
      const rr: RosterRecord = {
        ...recordBase(ctx, entry, id, "roster", receiptOf(entry)),
        op,
        ...(op.op === "invite" ? { invitation: id } : {}),
        ...(invalidated ? { invalidated: { ...invalidated, ...(abortAttempt ? { abortAttempt } : {}) } } : {}),
      };
      return rr;
    },
  };
}

function landAuthority(core: RoomCore, act: ActId): Authority | null {
  const r = one(core.sql, "SELECT body FROM entries WHERE id = ?", act);
  if (!r) return null;
  const e = (JSON.parse(str(r, "body")!) as LogEntry).entry;
  return e.type === "act" ? e.receipt.authority : null;
}

// =============================================================== step 10

export function commit(core: RoomCore, plan: Extract<Plan, { t: "refused" | "accept" }>, hooks: AdmitHooks): { result: ActRecord | Refusal; id: ActId; entry: LogEntry } {
  const ctx = plan.ctx;
  const sql = core.sql;
  const at = iso(ctx.now);
  const decisions: Decision[] = ctx.evaluations.map((e) => e.decision);
  core.retainEvaluations(ctx.evaluations);
  const after = core.landing.after();
  if (plan.t === "refused") {
    const { act: _drop, ...rest } = plan.refusal;
    void _drop;
    const receipt: RefusalReceipt = { outcome: "refused", authority: ctx.authority, decisions, refusal: rest };
    const entry = core.sealEntry(at, { type: "refusal", act: ctx.signed, receipt });
    const id = idOf(entry);
    const result: Refusal = { ...plan.refusal, act: id };
    sql.all("INSERT INTO idem (actor, ikey, digest, seq, result) VALUES (?, ?, ?, ?, ?)", ctx.env.actor, ctx.env.idempotencyKey, ctx.digest, entry.seq, JSON.stringify(result));
    sql.all("INSERT INTO explain (seq, invariants) VALUES (?, ?)", entry.seq, JSON.stringify(ctx.invariants));
    return { result, id, entry };
  }
  const receipt: Receipt = {
    outcome: "accepted",
    authority: ctx.authority,
    decisions,
    effects: plan.effects,
    flags: [...new Set(ctx.flags)],
    ...(after ? { after: after.op } : {}),
  };
  const entry = core.sealEntry(at, { type: "act", act: ctx.signed, receipt }, plan.self ? "self" : undefined);
  const id = idOf(entry);
  for (const k of hooks.heldKeys ?? []) sql.all("INSERT INTO held_keys (key, seed, purpose) VALUES (?, ?, ?)", k.key, b64url(k.seed), k.purpose);
  const record = plan.apply(entry, id);
  sql.all("INSERT INTO records (id, seq, kind, body) VALUES (?, ?, ?, ?)", id, entry.seq, ctx.env.kind, JSON.stringify(record));
  sql.all("INSERT INTO idem (actor, ikey, digest, seq, result) VALUES (?, ?, ?, ?, ?)", ctx.env.actor, ctx.env.idempotencyKey, ctx.digest, entry.seq, JSON.stringify(record));
  sql.all("INSERT INTO explain (seq, invariants) VALUES (?, ?)", entry.seq, JSON.stringify(ctx.invariants));
  if (plan.notify) {
    const lane = plan.notify.lane ?? (plan.self ? id : null);
    const laneR = lane ? laneRow(sql, lane) : null;
    core.enqueueNotify(
      entry,
      id,
      {
        kind: "notify",
        act: { id, kind: ctx.env.kind, target: ctx.env.target as never, body: ctx.env.body as never },
        actor: core.policyActor(ctx.authority),
        lane: laneR ? core.policyLane(laneR) : null,
        proposal: plan.notify.proposal,
      },
      lane,
    );
  }
  return { result: record, id, entry };
}
