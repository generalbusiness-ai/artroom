/**
 * The five rule kinds over recorded inputs (R-POL-2 to R-POL-6). Each
 * function takes the active policy and one `RuleInput`, and returns a
 * deterministic outcome plus one `RuleEvaluation` per rule it evaluated.
 * Each evaluation carries the recorded `Decision` and the retained input.
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
  Json,
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
  RuleInput,
  RuleKind,
  TeamId,
} from "@generalbusiness/artroom-contract";
import { actMeter, evaluate, type ActMeter, type Meter } from "./evaluator.ts";
import { prepareInput, type PreparedInput } from "./values.ts";
import { PolicyEvalError, PolicyRuntimeFailure, type RefusalCode } from "./errors.ts";
import { digestJson } from "./integrity.ts";
import { STAMP } from "./profile.ts";
import { matching, matchGlob } from "./glob.ts";
import { checkConditions, reviewConditions, type CarryFacts, type CarryInput, type Invariant } from "./carry.ts";
import { adminObligation, isBoundaryProposal, isRecoveryBoundaryAct } from "./admin.ts";

/** The active policy and its version: the ID of the event that activated it. */
export interface ActivePolicy {
  readonly doc: PolicyDocument;
  readonly version: PolicyVersion;
}

/** One rule's recorded decision, the input it saw, and one plain sentence. */
export interface RuleEvaluation {
  readonly decision: Decision;
  /** The canonical rule input, retained with the log (R-LOG-7). `decision.input` is its digest. */
  readonly input: Json;
  readonly text: string;
}

/** Every evaluate function returns its evaluations and the platform invariants it checked. */
export interface Explained {
  readonly evaluations: readonly RuleEvaluation[];
  readonly invariants: readonly Invariant[];
}

type Input<K extends RuleKind> = Extract<RuleInput, { readonly kind: K }>;
type Outcome = Decision["outcome"];

/** An expression's boolean result, or the deterministic refusal it produced. */
type Answer =
  | { readonly ok: true; readonly value: boolean; readonly usage: Decision["usage"] }
  | { readonly ok: false; readonly code: RefusalCode; readonly detail: string; readonly usage: Decision["usage"] };

const NO_USAGE: Decision["usage"] = Object.freeze({ steps: 0, inspectedBytes: 0 });

/** The rule input, checked, frozen and measured once for every rule of the act; or why it could not be. */
type Prepared = PreparedInput | PolicyEvalError;

async function ask(expr: Expr, input: Prepared, budget: ActMeter): Promise<Answer> {
  const meter: Meter = { steps: 0, inspectedBytes: 0 };
  if (input instanceof PolicyEvalError)
    return { ok: false, code: input.refusal, detail: `${input.code}: ${input.message}`, usage: NO_USAGE };
  try {
    const { value } = await evaluate(expr, input, meter, budget);
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

/**
 * The retained input, its digest, and one prepared copy for every rule.
 * A malformed input is the platform's bug: fail without recording. An input
 * over the profile's size or depth caps is a deterministic budget refusal.
 */
async function retain(input: RuleInput): Promise<{ json: Json; digest: Decision["input"]; prepared: Prepared }> {
  const json = input as unknown as Json;
  let digest: Decision["input"];
  try {
    digest = await digestJson(json);
  } catch (error) {
    if (error instanceof PolicyEvalError)
      throw new PolicyRuntimeFailure("engine_error", `The room built a rule input that is not profile JSON: ${error.message}`);
    throw error;
  }
  let prepared: Prepared;
  try {
    prepared = prepareInput(json);
  } catch (error) {
    if (!(error instanceof PolicyEvalError)) throw error;
    prepared = error;
  }
  return { json, digest, prepared };
}

/** Options every evaluate function takes. */
export interface BudgetOptions {
  /**
   * The act's shared budget (ACT_BUDGET). Pass the same meter to every
   * evaluate call for one act, for example `refuse` and `require` on a
   * propose. A fresh one is used when absent.
   */
  readonly budget?: ActMeter;
}

function evaluation(
  policy: ActivePolicy,
  rule: Rule,
  digest: Decision["input"],
  json: Json,
  outcome: Outcome,
  usage: Decision["usage"],
  text: string,
): RuleEvaluation {
  const decision: Decision = { rule: rule.id, kind: rule.kind, policy: policy.version, stamp: STAMP, input: digest, outcome, usage };
  return { decision, input: json, text };
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

// ------------------------------------------------------------------ refuse

export interface RefuseOptions extends BudgetOptions {
  /** True when the act is signed by the recovery key (R-ADMIN-3). */
  readonly recoveryKey?: boolean;
  /** True when the act's proposal has its `obl_admin-approval` met (R-ADMIN-3). */
  readonly adminApprovalMet?: boolean;
}

export interface RefuseResult extends Explained {
  readonly refusal: Refusal | null;
}

/** `refuse` rules, when an act of a listed kind arrives (R-POL-2). The first refusal stops evaluation. */
export async function evaluateRefuse(policy: ActivePolicy, input: Input<"refuse">, opts: RefuseOptions = {}): Promise<RefuseResult> {
  if (isRecoveryBoundaryAct(input, opts.recoveryKey ?? false))
    return { refusal: null, evaluations: [], invariants: [{ rule: "R-ADMIN-3", held: true, detail: "roster act by an admin or the recovery key: refuse rules are not evaluated" }] };
  if (input.proposal && isBoundaryProposal(input.proposal.paths, opts.adminApprovalMet ?? false))
    return { refusal: null, evaluations: [], invariants: [{ rule: "R-ADMIN-3", held: true, detail: "admin-approved change to .artroom/** only: refuse rules are not evaluated" }] };
  const { json, digest, prepared } = await retain(input);
  const budget = opts.budget ?? actMeter();
  const evaluations: RuleEvaluation[] = [];
  for (const rule of rulesOf(policy.doc, "refuse")) {
    if (!rule.on.includes(input.act.kind)) continue;
    const answer = await ask(rule.refuse, prepared, budget);
    if (!answer.ok) {
      evaluations.push(evaluation(policy, rule, digest, json, { result: "error", code: answer.code, detail: answer.detail }, answer.usage, `${rule.id} could not be evaluated, so the act is refused: ${answer.detail}`));
      return { refusal: errorRefusal(rule, answer), evaluations, invariants: [] };
    }
    if (answer.value) {
      evaluations.push(evaluation(policy, rule, digest, json, { result: "refuse", reason: rule.reason, fix: rule.fix }, answer.usage, `${rule.id} refused the act: ${rule.reason}`));
      return { refusal: { refused: true, rule: rule.id, reason: rule.reason, fix: rule.fix }, evaluations, invariants: [] };
    }
    evaluations.push(evaluation(policy, rule, digest, json, { result: "pass" }, answer.usage, `${rule.id} did not refuse the act`));
  }
  return { refusal: null, evaluations, invariants: [] };
}

// ----------------------------------------------------------------- require

export type ObligationSpec = ReviewObligation | CheckObligation;

/** The documentation scopes in which `allowSelf` may take effect (R-OBL-2). */
export const SELF_REVIEW_SCOPES = Object.freeze(["docs/**", "**/*.md"] as const);

export interface RequireOptions extends BudgetOptions {
  /** True when the proposal's `obl_admin-approval` is met (R-ADMIN-3, at activation). */
  readonly adminApprovalMet?: boolean;
}

export interface RequireResult extends Explained {
  /** The obligations, including the platform's `obl_admin-approval` (R-OBL-5). */
  readonly obligations: readonly ObligationSpec[];
  /** Set when a `when` expression failed: the propose is refused (R-ADM-1 step 9). */
  readonly refusal: Refusal | null;
}

/** `require` rules, on `propose` and at activation (R-POL-3, R-OBL-5). */
export async function evaluateRequire(policy: ActivePolicy, input: Input<"require">, opts: RequireOptions = {}): Promise<RequireResult> {
  const paths = input.proposal.paths;
  const invariants: Invariant[] = [{ rule: "R-PROP-5", held: true, detail: "obligations come from the actual changed paths" }];
  const admin = adminObligation(policy.version, paths);
  if (admin) invariants.push({ rule: "R-ADMIN-1", held: true, detail: "a changed path matches .artroom/**: obl_admin-approval added" });
  const obligations: ObligationSpec[] = admin ? [admin] : [];
  if (isBoundaryProposal(paths, opts.adminApprovalMet ?? false)) {
    invariants.push({ rule: "R-ADMIN-3", held: true, detail: "admin-approved change to .artroom/** only: require rules are not evaluated" });
    return { obligations, refusal: null, evaluations: [], invariants };
  }
  const { json, digest, prepared } = await retain(input);
  const budget = opts.budget ?? actMeter();
  const evaluations: RuleEvaluation[] = [];
  for (const rule of rulesOf(policy.doc, "require")) {
    const hit = matching(paths, rule.paths);
    if (!hit.length) {
      evaluations.push(evaluation(policy, rule, digest, json, { result: "pass" }, NO_USAGE, `${rule.id} does not apply: no changed path matches ${rule.paths.join(", ")}`));
      continue;
    }
    let usage = NO_USAGE;
    if (rule.when !== undefined) {
      const answer = await ask(rule.when, prepared, budget);
      usage = answer.usage;
      if (!answer.ok) {
        evaluations.push(evaluation(policy, rule, digest, json, { result: "error", code: answer.code, detail: answer.detail }, usage, `${rule.id} could not be evaluated, so the proposal is refused: ${answer.detail}`));
        return { obligations, refusal: errorRefusal(rule, answer), evaluations, invariants };
      }
      if (!answer.value) {
        evaluations.push(evaluation(policy, rule, digest, json, { result: "pass" }, usage, `${rule.id} does not apply: its condition is false`));
        continue;
      }
    }
    const id: ObligationId = `obl_${rule.id}`;
    const base = { id, rule: rule.id, policy: policy.version, paths: hit };
    let spec: ObligationSpec;
    if (rule.obligation.type === "review") {
      const docsOnly = hit.every((p) => SELF_REVIEW_SCOPES.some((s) => matchGlob(p, s)));
      if (rule.obligation.allowSelf && !docsOnly)
        invariants.push({ rule: "R-OBL-2", held: true, detail: `${rule.id}: allowSelf ignored outside docs/** and **/*.md` });
      spec = { ...base, kind: "review", from: rule.obligation.from, count: rule.obligation.count, allowSelf: rule.obligation.allowSelf && docsOnly };
    } else {
      spec = { ...base, kind: "check", check: rule.obligation.check, by: rule.obligation.by };
    }
    obligations.push(spec);
    evaluations.push(evaluation(policy, rule, digest, json, { result: "obligation", obligation: id }, usage, `${rule.id} requires ${spec.kind === "review" ? `a review from ${spec.from.join(", ")}` : `the ${spec.check} check`} for ${hit.join(", ")}`));
  }
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
export async function evaluateCarry(policy: ActivePolicy, input: CarryInput, facts: CarryFacts = {}, opts: BudgetOptions = {}): Promise<CarryResult> {
  const platform = input.evidence.kind === "review" ? reviewConditions(input, policy.doc, facts) : checkConditions(input, policy.doc, facts);
  if (!platform.carries)
    return { carried: null, notCarried: platform.notCarried, highlight: false, evaluations: [], invariants: platform.invariants };
  const invariants = [...platform.invariants];
  const { json, digest, prepared } = await retain(input);
  const budget = opts.budget ?? actMeter();
  const evaluations: RuleEvaluation[] = [];
  const act: ActId = input.evidence.act;
  const applicable = rulesOf(policy.doc, "carry").filter((r: CarryRule) => r.evidence === "any" || r.evidence === input.evidence.kind);
  for (const rule of applicable) {
    const answer = await ask(rule.allow, prepared, budget);
    if (!answer.ok || !answer.value) {
      const detail = answer.ok ? `policy rule ${rule.id} does not accept it` : `policy rule ${rule.id} could not be evaluated (${answer.detail})`;
      const outcome: Outcome = answer.ok ? { result: "no-carry", evidence: act } : { result: "error", code: answer.code, detail: answer.detail };
      evaluations.push(evaluation(policy, rule, digest, json, outcome, answer.usage, `not carried: ${detail}`));
      invariants.push({ rule: "R-CARRY-4", held: false, detail });
      const notCarried: NotCarried = { act, code: "policy-rejected", rule: rule.id, text: `not carried: ${detail}` };
      return { carried: null, notCarried, highlight: false, evaluations, invariants };
    }
    evaluations.push(evaluation(policy, rule, digest, json, { result: "carry", evidence: act }, answer.usage, `${rule.id} accepts carrying it`));
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

export interface LandOptions extends BudgetOptions {
  /** True when the proposal's `obl_admin-approval` is met (R-ADMIN-3). */
  readonly adminApprovalMet?: boolean;
}

export interface LandResult extends Explained {
  readonly refusal: Refusal | null;
}

/** `land` rules, on `land`, at `ready` and at reservation (R-POL-6). The first block stops evaluation. */
export async function evaluateLand(policy: ActivePolicy, input: Input<"land">, opts: LandOptions = {}): Promise<LandResult> {
  if (isBoundaryProposal(input.proposal.paths, opts.adminApprovalMet ?? false))
    return { refusal: null, evaluations: [], invariants: [{ rule: "R-ADMIN-3", held: true, detail: "admin-approved change to .artroom/** only: land rules are not evaluated" }] };
  const { json, digest, prepared } = await retain(input);
  const budget = opts.budget ?? actMeter();
  const evaluations: RuleEvaluation[] = [];
  for (const rule of rulesOf(policy.doc, "land")) {
    const answer = await ask(rule.block, prepared, budget);
    if (!answer.ok) {
      evaluations.push(evaluation(policy, rule, digest, json, { result: "error", code: answer.code, detail: answer.detail }, answer.usage, `${rule.id} could not be evaluated, so landing is blocked: ${answer.detail}`));
      return { refusal: errorRefusal(rule, answer), evaluations, invariants: [] };
    }
    if (answer.value) {
      evaluations.push(evaluation(policy, rule, digest, json, { result: "block", reason: rule.reason, fix: rule.fix }, answer.usage, `${rule.id} blocks landing: ${rule.reason}`));
      return { refusal: { refused: true, rule: rule.id, reason: rule.reason, fix: rule.fix }, evaluations, invariants: [] };
    }
    evaluations.push(evaluation(policy, rule, digest, json, { result: "pass" }, answer.usage, `${rule.id} does not block landing`));
  }
  return { refusal: null, evaluations, invariants: [] };
}

// ------------------------------------------------------------------ notify

/** What the room supplies to turn notify targets into members and teams. */
export interface NotifyDirectory {
  /** Active members by role, to expand `role:<role>` principals. */
  readonly roles: Readonly<Partial<Record<Role, readonly MemberId[]>>>;
  /** The qualifying reviewers of the proposal, for the `reviewers` target. */
  readonly reviewers: readonly MemberId[];
}

export interface NotifyResult extends Explained {
  /** Each notified member or team, with the `why` of every rule that chose it. */
  readonly notify: readonly { readonly to: MemberId | TeamId; readonly rule: string; readonly why: string }[];
}

function expand(principal: Principal, dir: NotifyDirectory): (MemberId | TeamId)[] {
  if (principal.startsWith("role:")) return [...(dir.roles[principal.slice(5) as Role] ?? [])];
  return [principal as MemberId | TeamId];
}

function targets(rule: NotifyRule, input: Input<"notify">, dir: NotifyDirectory): (MemberId | TeamId)[] {
  const out = new Set<MemberId | TeamId>();
  const add = (target: NotifyTarget) => {
    if (target === "holder") {
      if (input.lane?.holder) out.add(input.lane.holder);
    } else if (target === "reviewers") {
      for (const m of dir.reviewers) out.add(m);
    } else if (target === "owners") {
      for (const principals of Object.values(input.proposal?.owners ?? {})) for (const p of principals) for (const m of expand(p, dir)) out.add(m);
    } else for (const m of expand(target, dir)) out.add(m);
  };
  rule.to.forEach(add);
  return [...out].sort();
}

/** `notify` rules, after an act is recorded (R-POL-5). They never refuse. An error notifies nobody for that rule. */
export async function evaluateNotify(policy: ActivePolicy, input: Input<"notify">, dir: NotifyDirectory, opts: BudgetOptions = {}): Promise<NotifyResult> {
  const { json, digest, prepared } = await retain(input);
  const budget = opts.budget ?? actMeter();
  const evaluations: RuleEvaluation[] = [];
  const notify: { to: MemberId | TeamId; rule: string; why: string }[] = [];
  for (const rule of rulesOf(policy.doc, "notify")) {
    if (!rule.on.includes(input.act.kind)) continue;
    let usage = NO_USAGE;
    if (rule.when !== undefined) {
      const answer = await ask(rule.when, prepared, budget);
      usage = answer.usage;
      if (!answer.ok) {
        evaluations.push(evaluation(policy, rule, digest, json, { result: "error", code: answer.code, detail: answer.detail }, usage, `${rule.id} could not be evaluated, so it notified nobody: ${answer.detail}`));
        continue;
      }
      if (!answer.value) {
        evaluations.push(evaluation(policy, rule, digest, json, { result: "pass" }, usage, `${rule.id} does not apply: its condition is false`));
        continue;
      }
    }
    const to = targets(rule, input, dir);
    for (const t of to) notify.push({ to: t, rule: rule.id, why: rule.why });
    evaluations.push(evaluation(policy, rule, digest, json, { result: "notify", to }, usage, `${rule.id} notified ${to.length ? to.join(", ") : "nobody"}: ${rule.why}`));
  }
  return { notify, evaluations, invariants: [] };
}

// ------------------------------------------------------------------ inputs

/** The owners policy assigns to each path: every owners pattern that matches it (R-PROP-5). */
export function ownersFor(doc: PolicyDocument, paths: readonly string[]): Record<string, readonly Principal[]> {
  const out: Record<string, readonly Principal[]> = {};
  for (const path of paths) {
    const who = new Set<Principal>();
    for (const [pattern, principals] of Object.entries(doc.owners)) if (matchGlob(path, pattern)) for (const p of principals) who.add(p);
    out[path] = [...who];
  }
  return out;
}
