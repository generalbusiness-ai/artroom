/**
 * @generalbusiness/artroom-policy
 *
 * The policy runtime: the `artroom-jsonata-v1` evaluator ported from atseq,
 * the five rule kinds, the platform's carry conditions, the admin boundary,
 * policy activation, `explain()` data, and the authoring helpers.
 */

export { ACCOUNTING, ACT_BUDGET, PROFILE, JSONATA_VERSION, STAMP } from "./profile.ts";
export {
  BUDGET_CODES,
  TYPE_CODES,
  PolicyEvalError,
  PolicyRuntimeFailure,
  isPolicyEvalError,
  refusalCode,
  type BudgetCode,
  type EvalCode,
  type RefusalCode,
  type TypeCode,
} from "./errors.ts";
export { actMeter, admit, assertEngine, evaluate, ENGINE_FINGERPRINT, type ActMeter, type Evaluation, type Meter } from "./evaluator.ts";
export { budgetState, meterFrom, own, type BudgetState, type CarryFactsRecord, type NotifyDirectory, type ReplayContext, type Usage } from "./context.ts";
export { ownersFor, type InputOf } from "./inputs.ts";
export { PreparedInput, prepareInput } from "./values.ts";
export { canonicalize, digestJson, sha256Hex, snapshotDigest, type SnapshotEntry } from "./integrity.ts";
export { globProblem, globsOverlap, isGlob, matchGlob, matchesAny, matching } from "./glob.ts";
export {
  PLATFORM_GLOBAL_INPUTS,
  checkConditions,
  checkerInputs,
  defaultDependsOn,
  filterSnapshot,
  globalInputs,
  reviewConditions,
  type CarryFacts,
  type CarryInput,
  type Invariant,
  type PlatformCarry,
} from "./carry.ts";
export {
  SELF_REVIEW_SCOPES,
  evaluateCarry,
  evaluateLand,
  evaluateNotify,
  evaluateRefuse,
  evaluateRequire,
  matchesRetainedLandInput,
  notifyContext,
  replay,
  type ActivePolicy,
  type BudgetOptions,
  type CarryOptions,
  type CarryResult,
  type Explained,
  type LandOptions,
  type LandResult,
  type AnyResult,
  type NotifyResult,
  type ObligationSpec,
  type RefuseOptions,
  type RefuseResult,
  type RequireOptions,
  type RequireResult,
  type RuleEvaluation,
} from "./rules.ts";
export {
  ADMIN_APPROVAL,
  ADMIN_SCOPE,
  SOLE_ADMIN_FLAG,
  adminObligation,
  isRecoveryBoundaryAct,
  judgeAdminApproval,
  judgeInitiator,
  skipsPolicy,
  type AdminApproval,
  type AdminApprovalFacts,
  type InitiatorFacts,
} from "./admin.ts";
export { activate, type Activation, type ActivationResult, type OpenProposal } from "./activation.ts";
export { explain, type ExplainData } from "./explain.ts";
export { isPrincipal, validateCheckerConfig, validatePolicy, type Validation } from "./validate.ts";
export {
  OBJECTION_OPEN,
  carry,
  defaultPolicy,
  lanes,
  owners,
  policy,
  requireCheck,
  requireReview,
  retiredEvidence,
  rule,
} from "./helpers.ts";
