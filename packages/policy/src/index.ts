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
export { globCovers, globProblem, globsOverlap, isGlob, matchGlob, matchesAny, matching } from "./glob.ts";
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
  DECLARATION_BOUNDS,
  PLATFORM_KINDS,
  REFUSAL_SLOTS,
  RESERVED_KINDS,
  STEP_FIELDS,
  STEPS_FOR_TARGET,
  STEPS_VERSIONS,
  validateCheckerConfigV2,
  validatePolicyV2,
  type PolicyV2Context,
  type PolicyV2Validation,
} from "./acts.ts";
export { TARGET_ORDER, bindingOf, bindingSubject, bindingsOf } from "./binding.ts";
// Declared acts stage 5: reading a catalogue as a client does. Also at `@generalbusiness/artroom-policy/declared`, without the evaluator.
export { builtForBinding, expandGrant, fieldsOf, governs, meaningOf, targetsOf, threadTitle, titleOf, type ActField, type ExpandedGrant, type GrantExpansion } from "./catalogue.ts";
export { STEP_FIELD_SPECS, type StepFieldSpec, type StepFieldType } from "./steps.ts";
export { CODE_REVIEW_ACTS } from "./codereview.ts";
export {
  DELEGABLE_PLATFORM,
  LEGACY_DELEGABLE,
  LEGACY_KINDS,
  LEGACY_ROLE_KINDS,
  PLATFORM_KIND_LIST,
  ROSTER_OPS,
  codeReviewPolicy,
  declarationOf,
  delegableBy,
  isDeclared,
  isPlatformKind,
  kindsOf,
  roleMaySign,
  shapeOf,
  stepsOf,
} from "./vocabulary.ts";
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
