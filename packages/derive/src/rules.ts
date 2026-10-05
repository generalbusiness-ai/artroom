/**
 * Preparation of `rule` guards (scope contract, section 5.2, step 5, and
 * section 6.5). This file builds what each rule reads. It evaluates nothing:
 * evaluation is asynchronous and is exported from
 * `@generalbusiness/artroom-derive/rule`. A judge takes the results as
 * `Prepared` records and reuses one only when its input digest is the digest
 * of what the rule would read in the commit.
 */

import type { SignedIntent } from "@generalbusiness/artroom-contract";
import { judgeDelivery, type Delivered, type DeliveryContext } from "./delivery.ts";
import { judgeGenesis, type Creation, type Founding } from "./genesis.ts";
import type { RuleInput } from "./guards.ts";
import { judgeAct, type JudgeContext } from "./judge.ts";
import type { StateView } from "./state.ts";
import type { ValidDefinition } from "./validate/index.ts";

/** An input whose guards may name a rule, with the context its judge takes. */
export type Judged =
  | { act: SignedIntent; context: JudgeContext }
  | { delivery: Delivered; context: DeliveryContext }
  | { genesis: Founding | Creation; context: DeliveryContext };

/**
 * For each `rule` guard the input would meet over this state: the rule, its
 * expression, exactly the input section 6.5 lists, and that input's digest.
 * The input is judged as in a commit, with each rule guard passed over, so
 * a guard after a failed one is not prepared. Nothing is written.
 */
export function prepareRules(view: StateView, definition: ValidDefinition, judged: Judged): RuleInput[] {
  const asked: RuleInput[] = [];
  const collecting = { prepared: [], asked };
  if ("act" in judged) judgeAct(view, definition, judged.act, { ...judged.context, ...collecting });
  else if ("delivery" in judged) judgeDelivery(view, definition, judged.delivery, { ...judged.context, ...collecting });
  else judgeGenesis(view, definition, judged.genesis, { ...judged.context, ...collecting });
  return asked;
}
