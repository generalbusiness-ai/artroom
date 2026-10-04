/**
 * Required evaluation calls (notes/2026-10-02-declared-acts.md section 4.4;
 * docs/protocol.md R-DECL-25). Recorded decisions alone do not show that
 * the room asked every question it had to: a receipt with none replays
 * nothing. So for each entry judged under a `v2` document, verify derives
 * the calls the room had to make, in order, rebuilds each call's input from
 * the fold, and makes each call itself with the evaluator's own functions
 * (`evaluateRefuse`, `evaluateRequire`, `evaluateCarry`, `evaluateLand`,
 * `evaluateNotify`), on one act meter, as admission does. The evaluator
 * decides which rules apply, in which order, where a call stops, and when a
 * call is skipped (a configuration-recovery thread, a roster act by an admin
 * or the recovery key). Then, call by call:
 * - a call that decides something with no recorded call of its kind in its
 *   place: `decision-missing`;
 * - a recorded call that no required call accounts for: `decision-extra`;
 * - a recorded call whose context digest is not the rebuilt one:
 *   `context-mismatch`. A plausible but false context fails here, even when
 *   it would replay consistently;
 * - the decisions themselves, as before: `policy-decision-mismatch`.
 *
 * Every input is rebuilt from the fold: the actor, lane, proposal and room
 * of each call (fold.ts, roster.ts); a land input's obligations and
 * reviews, a notify directory's reviewers, and each carry call's evidence,
 * policy comparison and revocation fact (obligations.ts). Which verdicts a
 * `carry` call is owed for is derived too, so an omitted call and a call
 * for evidence that is owed none both fail.
 *
 * What the log does not carry is taken from the context the room retained
 * for the matching call, and reported as a proof limit (`git-unwitnessed`):
 * a version's base and changed paths, and the paths changed since an
 * earlier verdict's head, when the Git objects are absent; and, for a check
 * on a filtered snapshot with no `prepared` event, whether it counts for
 * the integration asked about, and a check carry's new tree and snapshot.
 *
 * Each guard is one statement marked `// V:<id>`, a row of the mutation
 * table in plans/README.md ("Declared acts stage 3").
 */

import type { ActId, Authority, CarryFactsRecord, Decision, Digest, Envelope, NotifyDirectory, PolicyActor, PolicyProposal, ReplayContext, Step } from "@generalbusiness/artroom-contract";
import { ARTROOM_LEGACY_V1 } from "@generalbusiness/artroom-contract";
import {
  actMeter,
  evaluateCarry,
  evaluateLand,
  evaluateNotify,
  evaluateRefuse,
  evaluateRequire,
  type ActMeter,
  type ActivePolicy,
  type CarryResult,
  type InputOf,
  type LandResult,
  type NotifyResult,
  type RefuseResult,
  type RequireResult,
  type RuleEvaluation,
} from "@generalbusiness/artroom-policy";
import { canonicalize } from "./canonical.ts";
import type { RosterReplay } from "./roster.ts";
import type { Fold, Thread } from "./fold.ts";
import { actorOf } from "./obligations.ts";

export { actorOf };

type Ctx<K extends ReplayContext["kind"]> = Extract<ReplayContext, { readonly kind: K }>;
type Refusal = { readonly rule: string; readonly reason: string };

export type CallFailure = {
  readonly reason: "decision-missing" | "decision-extra" | "context-mismatch" | "policy-decision-mismatch" | "stamp-mismatch" | "policy-version-mismatch" | "input-missing" | "malformed";
  readonly detail: string;
};

export type Retained = (digest: Digest) => { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly reason: "input-missing" | "malformed"; readonly detail: string };

export interface Calls {
  readonly policy: ActivePolicy;
  /** The retained replay context for a digest, or why it cannot be read. */
  readonly retained: Retained;
  /** Whether a decision's stamp is the profile it must name. */
  readonly stampOk: (d: Decision) => boolean;
  /**
   * False under the legacy vocabulary: the calls are made, so the fold
   * follows what the room decided, but nothing is compared with the record
   * (R-DECL-1: verify judges `v1` entries as it did before declared acts).
   */
  readonly compare: boolean;
}

/** One call made: the evaluator's result, or why the record does not match it. */
export type Made<R> = { readonly ok: true; readonly result: R } | { readonly ok: false; readonly failure: CallFailure };

/** A `carry` call for one earlier verdict or check. */
export interface CarryStep {
  /** The evidence the call is for: a recorded carry call is this one's only if it names the same act. */
  readonly act: ActId;
  /** The rebuilt input, or null when it cannot be rebuilt without the retained context `from` and there is none. */
  readonly input: (from: Ctx<"carry"> | null) => InputOf<"carry"> | null;
  /** The platform facts: the revocation, and for a check its binding and the new integration. Null as for `input`. */
  readonly facts: (from: Ctx<"carry"> | null) => Partial<CarryFactsRecord> | null;
  readonly purpose: Thread["purpose"];
  /** A check carry has its own act budget (the room's `carryChecks`); a verdict's is the act's. */
  readonly ownBudget?: boolean;
  /** True when the call may not have been owed (obligations.ts `Candidate.maybe`): made only if a recorded call names its evidence. */
  readonly optional?: boolean;
}

/** Equal as canonical JSON. A field one side lacks is a difference, never an error. */
const same = (a: unknown, b: unknown) => (a === undefined || b === undefined ? a === b : canonicalize(a) === canonicalize(b));

/** Recorded decisions, in calls: consecutive decisions with one context digest are one call. */
function callsOf(decisions: readonly Decision[]): { readonly digest: Digest; readonly kind: Decision["kind"]; readonly decisions: Decision[] }[] {
  const out: { digest: Digest; kind: Decision["kind"]; decisions: Decision[] }[] = [];
  for (const d of decisions) {
    const last = out.at(-1);
    if (last && last.digest === d.input) last.decisions.push(d);
    else out.push({ digest: d.input, kind: d.kind, decisions: [d] });
  }
  return out;
}

/** Where two contexts differ, as dotted paths, for a `context-mismatch` detail. */
function differences(a: unknown, b: unknown, at = "", out: string[] = []): string[] {
  if (out.length >= 4) return out;
  if (typeof a === "object" && a !== null && typeof b === "object" && b !== null && !Array.isArray(a) && !Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)]))
      if (!same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) differences((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], at ? `${at}.${k}` : k, out);
  } else if (!same(a, b)) out.push(at || "the context");
  return out;
}

/**
 * The required calls of one entry, made in order on one act meter, each
 * compared with the recorded call in its place. The caller makes the calls
 * admission had to make, stops where admission stops, and then calls
 * `finish`, which fails any recorded call left over.
 */
export class CallSession {
  private readonly groups: ReturnType<typeof callsOf>;
  private readonly meter: ActMeter = actMeter();
  private next = 0;
  /** Decisions compared and found equal. */
  replayed = 0;
  /** The first refusal a call made. */
  refusal: Refusal | null = null;

  private readonly c: Calls;

  private constructor(recorded: readonly Decision[], c: Calls) {
    this.groups = callsOf(recorded);
    this.c = c;
  }

  /** Open a session, after checking that every recorded decision names the profile and policy in force. */
  static open(recorded: readonly Decision[], c: Calls): Made<CallSession> {
    if (c.compare)
      for (const d of recorded) {
        if (!c.stampOk(d)) return { ok: false, failure: { reason: "stamp-mismatch", detail: `${d.rule}: stamp ${d.stamp.profile} ${d.stamp.jsonata} is not the profile in force` } };
        if (d.policy !== c.policy.version) return { ok: false, failure: { reason: "policy-version-mismatch", detail: `${d.rule} names policy ${d.policy}; the policy in force is ${c.policy.version}` } };
      }
    return { ok: true, result: new CallSession(recorded, c) };
  }

  private fail<R>(reason: CallFailure["reason"], detail: string): Made<R> {
    return { ok: false, failure: { reason, detail } };
  }

  /** The retained context of the recorded call at `next`, when it is of `kind`. */
  private fromNext<K extends Decision["kind"]>(kind: K): Made<Ctx<K> | null> {
    const g = this.groups[this.next];
    if (!g || g.kind !== kind) return { ok: true, result: null };
    const r = this.c.retained(g.digest);
    // Under the legacy vocabulary the record is followed, never judged here: replaying it is the caller's.
    if (!this.c.compare) return { ok: true, result: r.ok && (r.value as ReplayContext).kind === kind ? (r.value as Ctx<K>) : null };
    if (!r.ok) return this.fail(r.reason, r.detail);
    // A decision that names a context of another kind has no context of its own: the rebuilt digest will not match it.
    const v = r.value as ReplayContext;
    return { ok: true, result: v.kind === kind ? (v as Ctx<K>) : null };
  }

  /** Compare one made call with the recorded call at `next`. */
  private compare(what: string, made: readonly RuleEvaluation[], from: ReplayContext | null): CallFailure | null {
    const g = this.groups[this.next];
    if (!this.c.compare) {
      // Keep step with the record, so a later call can read its retained context.
      if (g && g.kind === made[0]!.decision.kind) this.next++;
      return null;
    }
    const fail = (reason: CallFailure["reason"], detail: string): CallFailure => ({ reason, detail });
    if (!g || g.kind !== made[0]!.decision.kind)
      return fail("decision-missing", `the ${what} call decides ${made.map((e) => `${e.decision.rule} (${e.decision.outcome.result})`).join(", ")}, and no ${made[0]!.decision.kind} decision is recorded in its place`); // V:missing
    const digest = made[0]!.decision.input;
    if (g.digest !== digest) return fail("context-mismatch", `the ${what} call's retained context ${g.digest} is not the one rebuilt from the log, ${digest}; they differ at ${differences(from, made[0]!.context).join(", ")}`); // V:context
    const expected = made.map((e) => e.decision);
    if (!same(expected, g.decisions)) return fail("policy-decision-mismatch", `recorded ${canonicalize(g.decisions.map((d) => [d.rule, d.outcome]))}, made ${canonicalize(expected.map((d) => [d.rule, d.outcome]))}`); // V:outcome
    this.replayed += g.decisions.length;
    this.next++;
    return null;
  }

  /** Make one call, and compare it when it decided something: the evaluator asks nothing when it is skipped or no rule applies. */
  private async made<R extends { readonly evaluations: readonly RuleEvaluation[] }>(what: string, kind: Decision["kind"], call: (from: ReplayContext | null) => Promise<R>): Promise<Made<R>> {
    const from = this.fromNext(kind);
    if (!from.ok) return from;
    let r: R;
    try {
      r = await call(from.result);
    } catch (e) {
      // A context the evaluator cannot own (not profile JSON) is not the room's context.
      if (!this.c.compare) throw e;
      return this.fail("context-mismatch", `a required call could not be rebuilt: ${(e as Error).message}`);
    }
    if (r.evaluations.length) {
      const bad = this.compare(what, r.evaluations, from.result);
      if (bad) return { ok: false, failure: bad };
    }
    const refusal = (r as { refusal?: { rule: string; reason: string } | null }).refusal;
    if (refusal && this.refusal === null) this.refusal = { rule: refusal.rule, reason: refusal.reason };
    return { ok: true, result: r };
  }

  refuse(input: InputOf<"refuse">, recoveryKey: boolean): Promise<Made<RefuseResult>> {
    return this.made("refuse", "refuse", () => evaluateRefuse(this.c.policy, input, { budget: this.meter, recoveryKey }));
  }

  require(input: InputOf<"require">): Promise<Made<RequireResult>> {
    return this.made("require", "require", () => evaluateRequire(this.c.policy, input, { budget: this.meter }));
  }

  /** A land call. `input` may read the retained context for what the log cannot decide (see the module note). */
  land(input: (from: Ctx<"land"> | null) => InputOf<"land">): Promise<Made<LandResult>> {
    return this.made("land", "land", (from) => evaluateLand(this.c.policy, input(from as Ctx<"land"> | null), { budget: this.meter }));
  }

  notify(input: InputOf<"notify">, directory: NotifyDirectory): Promise<Made<NotifyResult>> {
    return this.made("notify", "notify", () => evaluateNotify(this.c.policy, input, directory));
  }

  /**
   * A carry call for one earlier verdict or check. The result is null when
   * the call cannot be rebuilt without Git objects and no recorded call
   * names its evidence: nothing is compared then, and the caller reports
   * the limit. A recorded carry call that names this evidence where the
   * evaluator decides nothing is `decision-extra`.
   */
  async carry(step: CarryStep): Promise<Made<CarryResult | null>> {
    const from = this.fromNext("carry");
    if (!from.ok) return from;
    const mine = from.result !== null && from.result.input.evidence.act === step.act ? from.result : null;
    if (step.optional && !mine) return { ok: true, result: null };
    let r: CarryResult;
    try {
      const input = step.input(mine);
      const facts = step.facts(mine);
      if (input === null || facts === null) return { ok: true, result: null };
      r = await evaluateCarry(this.c.policy, input, facts, { budget: step.ownBudget ? actMeter() : this.meter, purpose: step.purpose });
    } catch (e) {
      if (!this.c.compare) throw e;
      return this.fail("context-mismatch", `a required call could not be rebuilt: ${(e as Error).message}`);
    }
    if (r.evaluations.length === 0) {
      if (mine) return this.fail("decision-extra", `a carry call for ${step.act} is recorded where the evaluator decides nothing`); // V:carry-extra
      return { ok: true, result: r };
    }
    const bad = this.compare("carry", r.evaluations, from.result);
    return bad ? { ok: false, failure: bad } : { ok: true, result: r };
  }

  /** After the last required call: a recorded call left over answers no call the room had to make. */
  finish(): CallFailure | null {
    if (!this.c.compare || this.next >= this.groups.length) return null;
    const g = this.groups[this.next]!;
    return { reason: "decision-extra", detail: `the ${g.kind} decisions ${g.decisions.map((d) => d.rule).join(", ")} (context ${g.digest}) answer no call the room had to make` }; // V:extra
  }
}

// ----------------------------------------------------------------- inputs

/** A member as policy sees them when no act is theirs (the room's `policyActorOf`, for recomputation). */
export function memberActor(roster: RosterReplay, member: PolicyActor["member"]): PolicyActor {
  return { member, role: member ? roster.roleOf(member) : null, teams: member ? roster.teamsOf(member) : [], delegated: false };
}

/** What an input needs from verify's state. */
export interface World {
  readonly fold: Fold;
  readonly roster: RosterReplay;
  /** True under a `v2` document: the lane carries its thread's kind (R-EVAL-3 as amended). */
  readonly declared: boolean;
}

/** A `refuse` input for an act, on its thread (or none), before it (R-POL-2, R-ADM-1 step 9). */
export function refuseInput(w: World, env: Envelope, by: Authority, thread: Thread | null, proposal: PolicyProposal | null): InputOf<"refuse"> {
  return {
    kind: "refuse",
    act: { kind: env.kind as never, target: env.target as never, body: env.body as never },
    actor: actorOf(w.roster, by),
    lane: w.fold.policyLane(thread, w.declared),
    proposal,
    room: w.roster.counts(),
  };
}

/** A `require` input for a version (R-POL-3), by its proposer or the act's signer. */
export function requireInput(w: World, actor: PolicyActor, thread: Thread, proposal: PolicyProposal): InputOf<"require"> {
  return { kind: "require", actor, lane: w.fold.policyLane(thread, w.declared), proposal, room: w.roster.counts() };
}

/** A `land` input at `stage` (R-POL-6), with the obligations and reviews rebuilt from the fold (obligations.ts). */
export function landInput(
  w: World,
  actor: PolicyActor,
  thread: Thread,
  proposal: PolicyProposal,
  evidence: Pick<InputOf<"land">, "obligations" | "reviews">,
  stage: "land" | "reservation",
): InputOf<"land"> {
  return { kind: "land", actor, lane: w.fold.policyLane(thread, w.declared), proposal, obligations: evidence.obligations, reviews: evidence.reviews, stage };
}

// ------------------------------------------------------- where admission stops

/** Every platform refusal code (`PlatformRule`): the legacy vocabulary's and declared acts' (R-DECL-1, section 33.4). */
const PLATFORM_CODES: ReadonlySet<string> = new Set([...ARTROOM_LEGACY_V1.refusals, "kind-undeclared", "binding-stale", "wrong-thread", "scope-fixed", "reserved"]);
/** Deterministic evaluation failures: refusals a rule produced (R-EVAL-5). */
const POLICY_ERRORS: ReadonlySet<string> = new Set(["policy-budget-exceeded", "policy-type-error"]);
/** Platform refusals a `version` step decides after its `refuse` rules (R-ADM-1 step 8 as amended by 66d6fb14). */
const AFTER_REFUSE: ReadonlySet<string> = new Set(["outside-claim", "recovery-scope", "policy-invalid"]);

/**
 * Where admission stopped, from a recorded refusal's code (R-ADM-1):
 * - `none`: a platform guard before any policy call, so no call was owed;
 *   this includes a `land` refused with its version's recorded
 *   recomputation refusal (R-POL-9);
 * - `refuse`: a `version` step's platform guard after its `refuse` rules;
 * - `policy`: a rule refused it, so the calls run until one refuses.
 * Whether that guard really failed is stage 6's `refusal-mismatch` on the fold.
 */
export function stoppedAt(code: string, steps: readonly Step[], blocked: string | null): "none" | "refuse" | "policy" {
  if (POLICY_ERRORS.has(code) || !PLATFORM_CODES.has(code)) return steps.includes("land") && !steps.includes("version") && blocked === code ? "none" : "policy"; // V:stop-blocked
  if (steps.includes("version") && AFTER_REFUSE.has(code)) return "refuse"; // V:stop-after-refuse
  return "none";
}
