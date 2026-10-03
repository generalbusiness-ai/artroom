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
 * What the fold cannot witness is taken from the context the room retained
 * for the matching call, and stated as a proof limit: a version's base and
 * changed paths when the Git objects are absent (`git-unwitnessed`), and,
 * until the obligation and evidence fold of stage 6, the `obligations` and
 * `reviews` of a land input, the `reviewers` of a notify directory, and each
 * `carry` call's evidence, changes since and facts. Which earlier verdicts a
 * `carry` call is owed for is not derived either: recorded `carry` calls are
 * accounted for where carrying may happen, and their proposal and budget are
 * rebuilt.
 *
 * Each guard is one statement marked `// V:<id>`, a row of the mutation
 * table in plans/README.md ("Declared acts stage 3").
 */

import type {
  Authority,
  Decision,
  Digest,
  Envelope,
  NotifyDirectory,
  PolicyActor,
  PolicyProposal,
  ReplayContext,
  Step,
} from "@generalbusiness/artroom-contract";
import { ARTROOM_LEGACY_V1 } from "@generalbusiness/artroom-contract";
import { actMeter, evaluateCarry, evaluateLand, evaluateNotify, evaluateRefuse, evaluateRequire, type ActMeter, type ActivePolicy, type InputOf, type RuleEvaluation } from "@generalbusiness/artroom-policy";
import { canonicalize } from "./canonical.ts";
import type { RosterReplay } from "./roster.ts";
import type { Fold, Thread } from "./fold.ts";

type Ctx<K extends ReplayContext["kind"]> = Extract<ReplayContext, { readonly kind: K }>;
type Refusal = { readonly rule: string; readonly reason: string };

/**
 * One call the room had to make. `input` rebuilds the call's input from the
 * fold; `from` is the context the room retained for the recorded call in
 * this place, used only for what the fold cannot witness.
 */
export type Call =
  | { readonly kind: "refuse"; readonly input: () => InputOf<"refuse">; readonly recoveryKey: boolean }
  | { readonly kind: "require"; readonly input: () => InputOf<"require"> }
  | { readonly kind: "carry"; readonly input: (from: Ctx<"carry">) => InputOf<"carry">; readonly purpose: Thread["purpose"] }
  | { readonly kind: "land"; readonly input: (from: Ctx<"land"> | null) => InputOf<"land"> }
  | { readonly kind: "notify"; readonly input: InputOf<"notify">; readonly directory: (from: Ctx<"notify"> | null) => NotifyDirectory };

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
}

export type CallsResult =
  | { readonly ok: true; readonly refusal: Refusal | null; readonly replayed: number }
  | { readonly ok: false; readonly failure: CallFailure };

const same = (a: unknown, b: unknown) => canonicalize(a) === canonicalize(b);

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

async function call(policy: ActivePolicy, c: Exclude<Call, { kind: "carry" }>, from: ReplayContext | null, meter: ActMeter) {
  switch (c.kind) {
    case "refuse":
      return evaluateRefuse(policy, c.input(), { budget: meter, recoveryKey: c.recoveryKey });
    case "require":
      return evaluateRequire(policy, c.input(), { budget: meter });
    case "land":
      return evaluateLand(policy, c.input(from as Ctx<"land"> | null), { budget: meter });
    case "notify":
      return evaluateNotify(policy, c.input, c.directory(from as Ctx<"notify"> | null));
  }
}

/**
 * Make the required calls of one entry, in order, and compare them with
 * the decisions it recorded. The plan stops at the first call that refuses,
 * as admission does; a recomputation does not stop (R-POL-9): its carry
 * calls follow a failed `require`. `refusal` is the first refusal.
 */
export async function compareCalls(plan: readonly Call[], recorded: readonly Decision[], c: Calls, stopAtRefusal = true): Promise<CallsResult> {
  const groups = callsOf(recorded);
  const fail = (reason: CallFailure["reason"], detail: string): CallsResult => ({ ok: false, failure: { reason, detail } });
  for (const g of groups)
    for (const d of g.decisions) {
      if (!c.stampOk(d)) return fail("stamp-mismatch", `${d.rule}: stamp ${d.stamp.profile} ${d.stamp.jsonata} is not the profile in force`);
      if (d.policy !== c.policy.version) return fail("policy-version-mismatch", `${d.rule} names policy ${d.policy}; the policy in force is ${c.policy.version}`);
    }
  const meter = actMeter();
  let next = 0;
  let replayed = 0;
  let refusal: Refusal | null = null;
  /** The retained context of the recorded call at `next`, when it is of `kind`. */
  const fromNext = (kind: Decision["kind"]): { ok: true; value: ReplayContext | null } | { ok: false; result: CallsResult } => {
    const g = groups[next];
    if (!g || g.kind !== kind) return { ok: true, value: null };
    const r = c.retained(g.digest);
    if (!r.ok) return { ok: false, result: fail(r.reason, r.detail) };
    const v = r.value as ReplayContext;
    if (v.kind !== kind) return { ok: false, result: fail("context-mismatch", `a ${kind} decision names a ${String(v.kind)} context`) }; // V:context-kind
    return { ok: true, value: v };
  };
  /** Compare one made call with the recorded call at `next`. */
  const compare = (what: string, made: readonly RuleEvaluation[], from: ReplayContext | null): CallsResult | null => {
    const g = groups[next];
    if (!g || g.kind !== made[0]!.decision.kind)
      return fail("decision-missing", `the ${what} call decides ${made.map((e) => `${e.decision.rule} (${e.decision.outcome.result})`).join(", ")}, and no ${made[0]!.decision.kind} decision is recorded in its place`); // V:missing
    const digest = made[0]!.decision.input;
    if (g.digest !== digest) return fail("context-mismatch", `the ${what} call's retained context ${g.digest} is not the one rebuilt from the log, ${digest}; they differ at ${differences(from, made[0]!.context).join(", ")}`); // V:context
    const expected = made.map((e) => e.decision);
    if (!same(expected, g.decisions)) return fail("policy-decision-mismatch", `recorded ${canonicalize(g.decisions.map((d) => [d.rule, d.outcome]))}, made ${canonicalize(expected.map((d) => [d.rule, d.outcome]))}`); // V:outcome
    replayed += g.decisions.length;
    next++;
    return null;
  };
  try {
    for (const step of plan) {
      if (step.kind === "carry") {
        // Carrying: each recorded carry call here is accounted for, its proposal and budget rebuilt (see the module note).
        while (groups[next]?.kind === "carry") {
          const from = fromNext("carry");
          if (!from.ok) return from.result;
          const ctx = from.value as Ctx<"carry">;
          const facts = { ...(ctx.facts?.revoked ? { revoked: ctx.facts.revoked } : {}), ...(ctx.facts?.check ? { check: ctx.facts.check } : {}) };
          const r = await evaluateCarry(c.policy, step.input(ctx), facts, { budget: meter, purpose: step.purpose });
          if (r.evaluations.length === 0) return fail("decision-extra", `a carry call is recorded where the evaluator decides nothing`); // V:carry-extra
          const bad = compare("carry", r.evaluations, ctx);
          if (bad) return bad;
        }
        continue;
      }
      const from = fromNext(step.kind);
      if (!from.ok) return from.result;
      const r = await call(c.policy, step, from.value, meter);
      if (r.evaluations.length === 0) continue; // the evaluator asks nothing here: skipped, or no rule applies
      const bad = compare(step.kind, r.evaluations, from.value);
      if (bad) return bad;
      if ("refusal" in r && r.refusal && refusal === null) {
        refusal = { rule: r.refusal.rule, reason: r.refusal.reason };
        if (stopAtRefusal) break;
      }
    }
  } catch (e) {
    // A context the evaluator cannot own (not profile JSON) is not the room's context.
    return fail("context-mismatch", `a required call could not be rebuilt: ${(e as Error).message}`);
  }
  if (next < groups.length) {
    const g = groups[next]!;
    return fail("decision-extra", `the ${g.kind} decisions ${g.decisions.map((d) => d.rule).join(", ")} (context ${g.digest}) answer no call the room had to make`); // V:extra
  }
  return { ok: true, refusal, replayed };
}

// ----------------------------------------------------------------- inputs

/** The acting member as policy sees it (R-EVAL-3, the room's `policyActor`). */
export function actorOf(roster: RosterReplay, by: Authority): PolicyActor {
  return { member: by.member, role: by.role, teams: by.member ? roster.teamsOf(by.member) : [], delegated: by.via === "delegation" };
}

/** A member as policy sees them when no act is theirs (the room's `policyActorOf`, for recomputation). */
export function memberActor(roster: RosterReplay, member: PolicyActor["member"]): PolicyActor {
  return { member, role: member ? roster.roleOf(member) : null, teams: member ? roster.teamsOf(member) : [], delegated: false };
}

/** What a plan needs from verify's state. */
export interface World {
  readonly fold: Fold;
  readonly roster: RosterReplay;
  readonly doc: ActivePolicy["doc"];
}

/** A `refuse` call for an act, on its thread (or none), before it (R-POL-2, R-ADM-1 step 9). */
export function refuseCall(w: World, env: Envelope, by: Authority, thread: Thread | null, proposal: PolicyProposal | null): Call {
  const input: InputOf<"refuse"> = {
    kind: "refuse",
    act: { kind: env.kind as never, target: env.target as never, body: env.body as never },
    actor: actorOf(w.roster, by),
    lane: w.fold.policyLane(thread, true),
    proposal,
    room: w.roster.counts(),
  };
  return { kind: "refuse", input: () => input, recoveryKey: by.via === "recovery" };
}

/** A `require` call for a version (R-POL-3), by its proposer or the act's signer. */
export function requireCall(w: World, actor: PolicyActor, thread: Thread, proposal: PolicyProposal): Call {
  const input: InputOf<"require"> = { kind: "require", actor, lane: w.fold.policyLane(thread, true), proposal, room: w.roster.counts() };
  return { kind: "require", input: () => input };
}

/** `carry` calls for a version, each on its recorded evidence, with the version's proposal (R-POL-4). */
export function carryCall(thread: Thread, proposal: PolicyProposal): Call {
  return { kind: "carry", purpose: thread.purpose, input: (from) => ({ ...from.input, proposal }) };
}

/** A `land` call at `stage` (R-POL-6). Its obligations and reviews are the retained context's (see the module note). */
export function landCall(w: World, actor: PolicyActor, thread: Thread, proposal: PolicyProposal, stage: "land" | "reservation"): Call {
  return {
    kind: "land",
    input: (from) => ({
      kind: "land",
      actor,
      lane: w.fold.policyLane(thread, true),
      proposal,
      obligations: from?.input.obligations ?? [],
      reviews: from?.input.reviews ?? [],
      stage,
    }),
  };
}

/** A `notify` call for an act, with the input the room built when it was sealed (R-POL-5, R-LOG-13). */
export function notifyCall(input: InputOf<"notify">, roles: NotifyDirectory["roles"]): Call {
  return { kind: "notify", input, directory: (from) => ({ roles, reviewers: from?.directory.reviewers ?? [] }) };
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
