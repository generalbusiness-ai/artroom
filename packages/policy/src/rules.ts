/**
 * The five rule kinds over recorded inputs (R-POL-2 to R-POL-6). Each
 * evaluate function takes the active policy and one rule input, and returns
 * a deterministic outcome plus one `RuleEvaluation` per rule it evaluated.
 *
 * Each call first builds and freezes its replay context (context.ts): the
 * rule input and every side input that decides the outcome. Every decision
 * of the call records that context's digest, and `replay(policy, context)`
 * gives the same result (R-EVAL-6).
 *
 * Deterministic refusals (`policy-budget-exceeded`, `policy-type-error`)
 * are outcomes here. Runtime failures are thrown as `PolicyRuntimeFailure`,
 * and the caller records nothing (R-EVAL-5).
 */

import type {
  ActId,
  CarryRule,
  Carried,
  CheckObligation,
  Decision,
  Expr,
  MemberId,
  NotCarried,
  NotifyRule,
  NotifyTarget,
  ObligationId,
  PolicyDocument,
  PolicyVersion,
  Principal,
  Refusal,
  ReviewObligation,
  Role,
  Rule,
  RuleKind,
  TeamId,
  LanePurpose,
} from "@generalbusiness/artroom-contract";
import { actMeter, evaluate, type ActMeter, type Meter } from "./evaluator.ts";
import { prepareInput, type PreparedInput } from "./values.ts";
import { PolicyEvalError, type RefusalCode } from "./errors.ts";
import { digestJson } from "./integrity.ts";
import { STAMP } from "./profile.ts";
import { matching, matchGlob } from "./glob.ts";
import { checkConditions, reviewConditions, type CarryFacts, type CarryInput, type Invariant } from "./carry.ts";
import { ADMIN_SCOPE, adminObligation, isRecoveryBoundaryAct, skipsPolicy } from "./admin.ts";
import { budgetState, meterFrom, own, type NotifyDirectory, type ReplayContext } from "./context.ts";
import type { InputOf } from "./inputs.ts";

/** The active policy and its version: the ID of the event that activated it. */
export interface ActivePolicy {
  readonly doc: PolicyDocument;
  readonly version: PolicyVersion;
}

/** One rule's recorded decision, the context it was decided in, and one plain sentence. */
export interface RuleEvaluation {
  readonly decision: Decision;
  /** The owned, frozen replay context, retained with the log (R-LOG-7). `decision.input` is its digest. */
  readonly context: ReplayContext;
  readonly text: string;
}

/** Every evaluate function returns its evaluations and the platform invariants it checked. */
export interface Explained {
  readonly evaluations: readonly RuleEvaluation[];
  readonly invariants: readonly Invariant[];
}

type Outcome = Decision["outcome"];
type Ctx<K extends ReplayContext["kind"]> = Extract<ReplayContext, { readonly kind: K }>;

/** An expression's boolean result, or the deterministic refusal it produced. */
type Answer =
  | { readonly ok: true; readonly value: boolean; readonly usage: Decision["usage"] }
  | { readonly ok: false; readonly code: RefusalCode; readonly detail: string; readonly usage: Decision["usage"] };

const NO_USAGE: Decision["usage"] = Object.freeze({ steps: 0, inspectedBytes: 0 });

/** The rule input, checked, frozen and measured once for every rule of the call; or why it could not be. */
type Prepared = PreparedInput | PolicyEvalError;

/** One call in progress: the owned context, its digest, the prepared input and the call's own meter. */
interface Session<C extends ReplayContext> {
  readonly ctx: C;
  readonly digest: Decision["input"];
  readonly prepared: Prepared;
  readonly meter: ActMeter;
  readonly policy: ActivePolicy;
}

async function open<C extends ReplayContext>(policy: ActivePolicy, ctx: C): Promise<Session<C>> {
  const digest = await digestJson(ctx as never);
  let prepared: Prepared;
  try {
    prepared = prepareInput(ctx.input);
  } catch (error) {
    if (!(error instanceof PolicyEvalError)) throw error;
    prepared = error;
  }
  return { ctx, digest, prepared, meter: meterFrom(ctx.budget), policy };
}

/** Add what one call spent to the caller's act meter. */
function settle(caller: ActMeter | undefined, s: Session<ReplayContext>): void {
  if (!caller) return;
  caller.steps += s.meter.steps - s.ctx.budget.start.steps;
  caller.inspectedBytes += s.meter.inspectedBytes - s.ctx.budget.start.inspectedBytes;
}

async function ask(expr: Expr, s: Session<ReplayContext>): Promise<Answer> {
  const meter: Meter = { steps: 0, inspectedBytes: 0 };
  if (s.prepared instanceof PolicyEvalError)
    return { ok: false, code: s.prepared.refusal, detail: `${s.prepared.code}: ${s.prepared.message}`, usage: NO_USAGE };
  try {
    const { value } = await evaluate(expr, s.prepared, meter, s.meter);
    const usage = { steps: meter.steps, inspectedBytes: meter.inspectedBytes };
    if (typeof value !== "boolean")
      return { ok: false, code: "policy-type-error", detail: "result_type: the expression must return true or false", usage };
    return { ok: true, value, usage };
  } catch (error) {
    if (!(error instanceof PolicyEvalError)) throw error;
    return {
      ok: false,
      code: error.refusal,
      detail: `${error.code}: ${error.message}`,
      usage: { steps: meter.steps, inspectedBytes: meter.inspectedBytes },
    };
  }
}

function evaluation(s: Session<ReplayContext>, rule: Rule, outcome: Outcome, usage: Decision["usage"], text: string): RuleEvaluation {
  const decision: Decision = { rule: rule.id, kind: rule.kind, policy: s.policy.version, stamp: STAMP, input: s.digest, outcome, usage };
  return { decision, context: s.ctx, text };
}

function errorRefusal(rule: Rule, answer: Extract<Answer, { ok: false }>): Refusal {
  return {
    refused: true,
    rule: answer.code,
    reason: `Policy rule ${rule.id} could not be evaluated (${answer.detail}).`,
    fix: `Ask an admin to correct policy rule ${rule.id}.`,
  };
}

function rulesOf<K extends RuleKind>(doc: PolicyDocument, kind: K): Extract<Rule, { readonly kind: K }>[] {
  return doc.rules.filter((r): r is Extract<Rule, { readonly kind: K }> => r.kind === kind);
}

/**
 * Options for the evaluate functions that run before or at admission. The
 * lane purpose comes from `input.lane.purpose`; on a `config-recovery` lane,
 * `refuse`, `require`, `carry` and `land` rules are not evaluated (R-ADMIN-5).
 */
export interface BudgetOptions {
  /**
   * The act's shared budget (ACT_BUDGET). Pass the same meter to every
   * evaluate call for one act, for example `refuse` and `require` on a
   * propose. A fresh one is used when absent. Its state when the call
   * starts is recorded in the context.
   */
  readonly budget?: ActMeter;
}

const RECOVERY_LANE: Invariant = Object.freeze({
  rule: "R-ADMIN-5",
  held: true,
  detail: "configuration-recovery lane: policy rules are not evaluated; platform rules apply",
});

// ------------------------------------------------------------------ refuse

export interface RefuseOptions extends BudgetOptions {
  /** True when the act is signed by the recovery key (R-ADMIN-3). */
  readonly recoveryKey?: boolean;
}

export interface RefuseResult extends Explained {
  readonly refusal: Refusal | null;
}

/** `refuse` rules, when an act of a listed kind arrives (R-POL-2). The first refusal stops evaluation. */
export async function evaluateRefuse(policy: ActivePolicy, input: InputOf<"refuse">, opts: RefuseOptions = {}): Promise<RefuseResult> {
  const budget = opts.budget ?? actMeter();
  const ctx = own<Ctx<"refuse">>({ kind: "refuse", input, budget: budgetState(budget), purpose: input.lane.purpose, recoveryKey: opts.recoveryKey ?? false });
  return runRefuse(policy, ctx, budget);
}

async function runRefuse(policy: ActivePolicy, ctx: Ctx<"refuse">, caller?: ActMeter): Promise<RefuseResult> {
  if (isRecoveryBoundaryAct(ctx.input, ctx.recoveryKey))
    return { refusal: null, evaluations: [], invariants: [{ rule: "R-ADMIN-3", held: true, detail: "roster act by an admin or the recovery key: refuse rules are not evaluated" }] };
  if (skipsPolicy(ctx.purpose)) return { refusal: null, evaluations: [], invariants: [RECOVERY_LANE] };
  const s = await open(policy, ctx);
  const evaluations: RuleEvaluation[] = [];
  let refusal: Refusal | null = null;
  for (const rule of rulesOf(policy.doc, "refuse")) {
    if (!rule.on.includes(ctx.input.act.kind)) continue;
    const answer = await ask(rule.refuse, s);
    if (!answer.ok) {
      evaluations.push(evaluation(s, rule, { result: "error", code: answer.code, detail: answer.detail }, answer.usage, `${rule.id} could not be evaluated, so the act is refused: ${answer.detail}`));
      refusal = errorRefusal(rule, answer);
      break;
    }
    if (answer.value) {
      evaluations.push(evaluation(s, rule, { result: "refuse", reason: rule.reason, fix: rule.fix }, answer.usage, `${rule.id} refused the act: ${rule.reason}`));
      refusal = { refused: true, rule: rule.id, reason: rule.reason, fix: rule.fix };
      break;
    }
    evaluations.push(evaluation(s, rule, { result: "pass" }, answer.usage, `${rule.id} did not refuse the act`));
  }
  settle(caller, s);
  return { refusal, evaluations, invariants: [] };
}

// ----------------------------------------------------------------- require

export type ObligationSpec = ReviewObligation | CheckObligation;

/** The documentation scopes in which `allowSelf` may take effect (R-OBL-2). */
export const SELF_REVIEW_SCOPES = Object.freeze(["docs/**", "**/*.md"] as const);

export type RequireOptions = BudgetOptions;

export interface RequireResult extends Explained {
  /**
   * The obligations, including the platform's `obl_admin-approval` (R-OBL-5).
   * Empty whenever `refusal` is set: a rule that failed never yields a
   * proposal with fewer obligations.
   */
  readonly obligations: readonly ObligationSpec[];
  /** Set when a `when` expression failed: the propose is refused (R-ADM-1 step 9). */
  readonly refusal: Refusal | null;
}

/** `require` rules, on `propose` and at activation (R-POL-3, R-OBL-5). */
export async function evaluateRequire(policy: ActivePolicy, input: InputOf<"require">, opts: RequireOptions = {}): Promise<RequireResult> {
  const budget = opts.budget ?? actMeter();
  const ctx = own<Ctx<"require">>({ kind: "require", input, budget: budgetState(budget), purpose: input.lane.purpose });
  return runRequire(policy, ctx, budget);
}

async function runRequire(policy: ActivePolicy, ctx: Ctx<"require">, caller?: ActMeter): Promise<RequireResult> {
  const paths = ctx.input.proposal.paths;
  const invariants: Invariant[] = [{ rule: "R-PROP-5", held: true, detail: "obligations come from the actual changed paths" }];
  const admin = adminObligation(policy.version, paths);
  if (admin) invariants.push({ rule: "R-ADMIN-1", held: true, detail: "a changed path matches .artroom/**: obl_admin-approval added" });
  const obligations: ObligationSpec[] = admin ? [admin] : [];
  if (skipsPolicy(ctx.purpose)) {
    const outside = paths.filter((p) => !matchGlob(p, ADMIN_SCOPE));
    if (outside.length || !paths.length) {
      invariants.push({ rule: "R-ADMIN-6", held: false, detail: `changed paths outside .artroom/**: ${outside.join(", ")}` });
      const refusal: Refusal = {
        refused: true,
        rule: "recovery-scope",
        reason: `A configuration-recovery proposal may change only .artroom/**, and it changes ${outside.join(", ") || "nothing"}.`,
        fix: "Propose the other changes on an ordinary lane.",
      };
      return { obligations: [], refusal, evaluations: [], invariants };
    }
    invariants.push({ rule: "R-ADMIN-6", held: true, detail: "configuration-recovery lane: obl_admin-approval is the only obligation" });
    return { obligations, refusal: null, evaluations: [], invariants: [...invariants, RECOVERY_LANE] };
  }
  const s = await open(policy, ctx);
  const evaluations: RuleEvaluation[] = [];
  for (const rule of rulesOf(policy.doc, "require")) {
    const hit = matching(paths, rule.paths);
    if (!hit.length) {
      evaluations.push(evaluation(s, rule, { result: "pass" }, NO_USAGE, `${rule.id} does not apply: no changed path matches ${rule.paths.join(", ")}`));
      continue;
    }
    let usage = NO_USAGE;
    if (rule.when !== undefined) {
      const answer = await ask(rule.when, s);
      usage = answer.usage;
      if (!answer.ok) {
        evaluations.push(evaluation(s, rule, { result: "error", code: answer.code, detail: answer.detail }, usage, `${rule.id} could not be evaluated, so the proposal is refused: ${answer.detail}`));
        settle(caller, s);
        return { obligations: [], refusal: errorRefusal(rule, answer), evaluations, invariants };
      }
      if (!answer.value) {
        evaluations.push(evaluation(s, rule, { result: "pass" }, usage, `${rule.id} does not apply: its condition is false`));
        continue;
      }
    }
    const id: ObligationId = `obl_${rule.id}`;
    const base = { id, rule: rule.id, policy: policy.version, paths: hit };
    let spec: ObligationSpec;
    if (rule.obligation.type === "review") {
      const docsOnly = hit.every((p) => SELF_REVIEW_SCOPES.some((g) => matchGlob(p, g)));
      if (rule.obligation.allowSelf && !docsOnly)
        invariants.push({ rule: "R-OBL-2", held: true, detail: `${rule.id}: allowSelf ignored outside docs/** and **/*.md` });
      spec = { ...base, kind: "review", from: rule.obligation.from, count: rule.obligation.count, allowSelf: rule.obligation.allowSelf && docsOnly };
    } else {
      spec = { ...base, kind: "check", check: rule.obligation.check, by: rule.obligation.by };
    }
    obligations.push(spec);
    evaluations.push(evaluation(s, rule, { result: "obligation", obligation: id }, usage, `${rule.id} requires ${spec.kind === "review" ? `a review from ${spec.from.join(", ")}` : `the ${spec.check} check`} for ${hit.join(", ")}`));
  }
  settle(caller, s);
  return { obligations, refusal: null, evaluations, invariants };
}

// ------------------------------------------------------------------- carry

export interface CarryResult extends Explained {
  /** Exactly one of `carried` and `notCarried` is set. */
  readonly carried: Carried | null;
  readonly notCarried: NotCarried | null;
  /** True when nothing declared or defaulted a dependency. The policy dry run highlights it (plan section 7). */
  readonly highlight: boolean;
}

const CARRIED_TEXT = "carried: reviewed and declared paths unchanged";

/**
 * Whether earlier evidence counts for a new generation (R-POL-4, R-CARRY).
 * The platform conditions run first, in plain TypeScript. Only evidence that
 * meets them reaches the policy's `carry` rules, which can only stop it.
 */
export interface CarryOptions extends BudgetOptions {
  /** The lane's purpose. The carry input has no lane, so the room passes it (R-ADMIN-5). Default `ordinary`. */
  readonly purpose?: LanePurpose;
}

export async function evaluateCarry(policy: ActivePolicy, input: CarryInput, facts: CarryFacts = {}, opts: CarryOptions = {}): Promise<CarryResult> {
  const budget = opts.budget ?? actMeter();
  const ctx = own<Ctx<"carry">>({
    kind: "carry",
    input,
    budget: budgetState(budget),
    purpose: opts.purpose ?? "ordinary",
    facts: { revoked: facts.revoked ?? null, check: facts.check ?? null },
  });
  return runCarry(policy, ctx, budget);
}

async function runCarry(policy: ActivePolicy, ctx: Ctx<"carry">, caller?: ActMeter): Promise<CarryResult> {
  const input = ctx.input;
  const facts: CarryFacts = {
    ...(ctx.facts.revoked ? { revoked: ctx.facts.revoked } : {}),
    ...(ctx.facts.check ? { check: ctx.facts.check } : {}),
  };
  const platform = input.evidence.kind === "review" ? reviewConditions(input, policy.doc, facts) : checkConditions(input, policy.doc, facts);
  if (!platform.carries)
    return { carried: null, notCarried: platform.notCarried, highlight: false, evaluations: [], invariants: platform.invariants };
  const invariants = [...platform.invariants];
  if (skipsPolicy(ctx.purpose)) invariants.push(RECOVERY_LANE);
  const evaluations: RuleEvaluation[] = [];
  const act: ActId = input.evidence.act;
  const applicable = skipsPolicy(ctx.purpose)
    ? []
    : rulesOf(policy.doc, "carry").filter((r: CarryRule) => r.evidence === "any" || r.evidence === input.evidence.kind);
  if (applicable.length) {
    const s = await open(policy, ctx);
    for (const rule of applicable) {
      const answer = await ask(rule.allow, s);
      if (!answer.ok || !answer.value) {
        const detail = answer.ok ? `policy rule ${rule.id} does not accept it` : `policy rule ${rule.id} could not be evaluated (${answer.detail})`;
        const outcome: Outcome = answer.ok ? { result: "no-carry", evidence: act } : { result: "error", code: answer.code, detail: answer.detail };
        evaluations.push(evaluation(s, rule, outcome, answer.usage, `not carried: ${detail}`));
        invariants.push({ rule: "R-CARRY-4", held: false, detail });
        settle(caller, s);
        const notCarried: NotCarried = { act, code: "policy-rejected", rule: rule.id, text: `not carried: ${detail}` };
        return { carried: null, notCarried, highlight: false, evaluations, invariants };
      }
      evaluations.push(evaluation(s, rule, { result: "carry", evidence: act }, answer.usage, `${rule.id} accepts carrying it`));
    }
    settle(caller, s);
  }
  invariants.push({ rule: "R-CARRY-4", held: true, detail: input.policy.same ? "same policy version" : "re-evaluated under the new policy version" });
  const basis = platform.basis;
  const from = input.evidence.from;
  const rules = evaluations.map((e) => e.decision.rule);
  let carried: Carried;
  if (basis.code === "paths-unchanged") {
    const policyBasis = input.policy.same ? "same" : "re-evaluated";
    const text = input.policy.same ? CARRIED_TEXT : `${CARRIED_TEXT}, and the new policy still accepts it`;
    carried = {
      basis: "carried",
      act,
      kind: input.evidence.kind,
      from,
      reason: { code: "paths-unchanged", changed: input.changedSince, tested: basis.tested, policy: policyBasis, text },
      rules,
    };
  } else if (basis.code === "tree-identical") {
    carried = { basis: "carried", act, kind: "check", from, reason: { ...basis, text: "carried: the integration tree, checker configuration and runner are unchanged" }, rules };
  } else {
    carried = { basis: "carried", act, kind: "check", from, reason: { ...basis, text: "carried: the filtered snapshot, checker configuration and runner are unchanged" }, rules };
  }
  invariants.push({ rule: "R-CARRY-11", held: true, detail: `shown as carried from generation ${from.generation}, head ${from.head}` });
  const highlight = basis.code === "paths-unchanged" && basis.undeclared;
  return { carried, notCarried: null, highlight, evaluations, invariants };
}

// -------------------------------------------------------------------- land

export type LandOptions = BudgetOptions;

export interface LandResult extends Explained {
  readonly refusal: Refusal | null;
}

/** `land` rules, on `land`, at `ready` and at reservation (R-POL-6). The first block stops evaluation. */
export async function evaluateLand(policy: ActivePolicy, input: InputOf<"land">, opts: LandOptions = {}): Promise<LandResult> {
  const budget = opts.budget ?? actMeter();
  const ctx = own<Ctx<"land">>({ kind: "land", input, budget: budgetState(budget), purpose: input.lane.purpose });
  return runLand(policy, ctx, budget);
}

async function runLand(policy: ActivePolicy, ctx: Ctx<"land">, caller?: ActMeter): Promise<LandResult> {
  if (skipsPolicy(ctx.purpose)) return { refusal: null, evaluations: [], invariants: [RECOVERY_LANE] };
  const s = await open(policy, ctx);
  const evaluations: RuleEvaluation[] = [];
  let refusal: Refusal | null = null;
  for (const rule of rulesOf(policy.doc, "land")) {
    const answer = await ask(rule.block, s);
    if (!answer.ok) {
      evaluations.push(evaluation(s, rule, { result: "error", code: answer.code, detail: answer.detail }, answer.usage, `${rule.id} could not be evaluated, so landing is blocked: ${answer.detail}`));
      refusal = errorRefusal(rule, answer);
      break;
    }
    if (answer.value) {
      evaluations.push(evaluation(s, rule, { result: "block", reason: rule.reason, fix: rule.fix }, answer.usage, `${rule.id} blocks landing: ${rule.reason}`));
      refusal = { refused: true, rule: rule.id, reason: rule.reason, fix: rule.fix };
      break;
    }
    evaluations.push(evaluation(s, rule, { result: "pass" }, answer.usage, `${rule.id} does not block landing`));
  }
  settle(caller, s);
  return { refusal, evaluations, invariants: [] };
}

// ------------------------------------------------------------------ notify

export interface NotifyResult extends Explained {
  /** Each notified member or team, with the `why` of every rule that chose it. */
  readonly notify: readonly { readonly to: MemberId | TeamId; readonly rule: string; readonly why: string }[];
}

function expand(principal: Principal, dir: NotifyDirectory): (MemberId | TeamId)[] {
  if (principal.startsWith("role:")) return [...(dir.roles[principal.slice(5) as Role] ?? [])];
  return [principal as MemberId | TeamId];
}

function targets(rule: NotifyRule, input: InputOf<"notify">, dir: NotifyDirectory): (MemberId | TeamId)[] {
  const out = new Set<MemberId | TeamId>();
  const add = (target: NotifyTarget) => {
    if (target === "holder") {
      if (input.lane?.holder) out.add(input.lane.holder);
    } else if (target === "reviewers") {
      for (const m of dir.reviewers) out.add(m);
    } else if (target === "owners") {
      for (const entry of input.proposal?.owners ?? []) for (const p of entry.owners) for (const m of expand(p, dir)) out.add(m);
    } else for (const m of expand(target, dir)) out.add(m);
  };
  rule.to.forEach(add);
  return [...out].sort();
}

/**
 * `notify` rules, after the act's entry is sealed (R-POL-5, R-LOG-13).
 *
 * They never refuse. A deterministic error notifies nobody for that rule
 * and is recorded. Notify always uses its own fresh act budget: it runs
 * after the act, so it never inherits the act's meter. The directory is
 * part of the replay context.
 *
 * A runtime failure throws `PolicyRuntimeFailure`: the act stays recorded.
 * The room keeps the context it built and retries with
 * `replay(policy, context)`, which uses the same directory and a fresh
 * budget, before it seals the `notified` entry.
 */
export async function evaluateNotify(policy: ActivePolicy, input: InputOf<"notify">, directory: NotifyDirectory): Promise<NotifyResult> {
  const ctx = notifyContext(input, directory);
  return runNotify(policy, ctx);
}

/** The context a notify retry must reuse. Build it once, store it with the queue entry. */
export function notifyContext(input: InputOf<"notify">, directory: NotifyDirectory): Ctx<"notify"> {
  return own<Ctx<"notify">>({ kind: "notify", input, budget: budgetState(actMeter()), directory });
}

async function runNotify(policy: ActivePolicy, ctx: Ctx<"notify">): Promise<NotifyResult> {
  const s = await open(policy, ctx);
  const evaluations: RuleEvaluation[] = [];
  const notify: { to: MemberId | TeamId; rule: string; why: string }[] = [];
  for (const rule of rulesOf(policy.doc, "notify")) {
    if (!rule.on.includes(ctx.input.act.kind)) continue;
    let usage = NO_USAGE;
    if (rule.when !== undefined) {
      const answer = await ask(rule.when, s);
      usage = answer.usage;
      if (!answer.ok) {
        evaluations.push(evaluation(s, rule, { result: "error", code: answer.code, detail: answer.detail }, usage, `${rule.id} could not be evaluated, so it notified nobody: ${answer.detail}`));
        continue;
      }
      if (!answer.value) {
        evaluations.push(evaluation(s, rule, { result: "pass" }, usage, `${rule.id} does not apply: its condition is false`));
        continue;
      }
    }
    const to = targets(rule, ctx.input, ctx.directory);
    for (const t of to) notify.push({ to: t, rule: rule.id, why: rule.why });
    evaluations.push(evaluation(s, rule, { result: "notify", to }, usage, `${rule.id} notified ${to.length ? to.join(", ") : "nobody"}: ${rule.why}`));
  }
  return { notify, evaluations, invariants: [] };
}

// ------------------------------------------------------------------ replay

export type AnyResult = RefuseResult | RequireResult | CarryResult | LandResult | NotifyResult;

/**
 * Reconstruct an evaluate call from its retained context (R-EVAL-6). With
 * the same policy version and profile, it returns the same result. The
 * context is copied and frozen first, so the caller's copy is never used.
 */
export function replay(policy: ActivePolicy, context: Ctx<"refuse">): Promise<RefuseResult>;
export function replay(policy: ActivePolicy, context: Ctx<"require">): Promise<RequireResult>;
export function replay(policy: ActivePolicy, context: Ctx<"carry">): Promise<CarryResult>;
export function replay(policy: ActivePolicy, context: Ctx<"land">): Promise<LandResult>;
export function replay(policy: ActivePolicy, context: Ctx<"notify">): Promise<NotifyResult>;
export function replay(policy: ActivePolicy, context: ReplayContext): Promise<AnyResult>;
export function replay(policy: ActivePolicy, context: ReplayContext): Promise<AnyResult> {
  const ctx = own(context);
  switch (ctx.kind) {
    case "refuse":
      return runRefuse(policy, ctx);
    case "require":
      return runRequire(policy, ctx);
    case "carry":
      return runCarry(policy, ctx);
    case "land":
      return runLand(policy, ctx);
    case "notify":
      return runNotify(policy, ctx);
  }
}

export { ownersFor } from "./inputs.ts";
export type { NotifyDirectory } from "./context.ts";
