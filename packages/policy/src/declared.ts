/**
 * The declared-acts functions a client needs, with no evaluator behind them
 * (declared acts stage 5): the binding identity, the code-review
 * declarations, the shared vocabulary, the steps' field table and the
 * catalogue helpers. Import it as `@generalbusiness/artroom-policy/declared`.
 */

export { TARGET_ORDER, bindingOf, bindingSubject, bindingsOf } from "./binding.ts";
export { CODE_REVIEW_ACTS } from "./codereview.ts";
export { DELEGABLE_PLATFORM, PLATFORM_KIND_LIST, delegableBy, isPlatformKind, shapeOf } from "./vocabulary.ts";
export { STEP_FIELD_SPECS, type StepFieldSpec, type StepFieldType } from "./steps.ts";
export {
  builtForBinding,
  expandGrant,
  fieldsOf,
  governs,
  meaningOf,
  targetsOf,
  threadTitle,
  titleOf,
  type ActField,
  type ExpandedGrant,
  type GrantExpansion,
} from "./catalogue.ts";
