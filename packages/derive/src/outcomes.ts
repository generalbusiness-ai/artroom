/**
 * The outcome entries of an operation that a platform definition owns
 * (scope contract, revision 15, section 6.1, place 7; section 4.3). The
 * data names each kind of operation that the definition owns, in
 * `outcomes`, with the mark of its rule. The rule decides each thing that
 * section 4.3 leaves to the owner: whether the kind selects, the owner's
 * local guard, whether another attempt is allowed, whether the evidence is
 * well formed, and the entry's effects and requests, as places 5 and 6.
 *
 * The ledger (`ledger.ts`) asks an owner's rules as `Owners`, for a
 * capability and for a platform definition alike. `ownersOf` answers for
 * the platform definition that a scope pins, from the rules of its marks,
 * and for every other owner as the given owners do.
 */

import type { EffectForm, Mark, PlatformData, Send, SendForm } from "@generalbusiness/artroom-contract";
import { deriveEffects } from "./effects.ts";
import type { Reading } from "./fields.ts";
import type { Judging } from "./guards.ts";
import type { OperationRules, OutcomeDerived, OutcomeInput, Owner, Owners } from "./ledger.ts";
import { RuleFault, givenTo, outside, ruleAt, run, type OutcomeGives, type PlatformRules, type Rules } from "./marks.ts";
import { deriveSends } from "./sends.ts";
import type { Operation, StateView } from "./state.ts";
import type { ValidDefinition } from "./validate/index.ts";
import { isObject, own } from "./values.ts";

/** What the judge of an outcome reads beside the state: the one reading, the bounds, the scope's own history, and whether a rule that reads the clock was run. */
export type OutcomeReading = Pick<Reading, "clock" | "bounds" | "own"> & { ran: { clock: boolean } };

/**
 * The owners' rules, with those of the platform definition that the scope
 * pins. `reading`: what the judge of an outcome gives a rule. Without it
 * the answer serves only what reads no outcome: whether an owner has rules
 * for a kind, and the closure that it declares (section 17.2, row 5).
 */
export function ownersOf(definition: ValidDefinition, platform: PlatformRules | null | undefined, owners: Owners | null | undefined, reading?: OutcomeReading): Owners | undefined {
  if (!platform) return owners ?? undefined;
  const kinds: Readonly<Record<string, Mark>> = (definition.declared as unknown as PlatformData).outcomes ?? {};
  return {
    rules(owner: Owner, kind: string): OperationRules | null {
      if (owner !== platform.named) return owners?.rules(owner, kind) ?? null;
      const mark = own(kinds, kind);
      const rule = mark ? ruleAt(platform.rules, mark.code, "outcome") : null;
      if (!mark || !rule) return null;
      const r = rule.rules;
      /** What a rule of this outcome entry is given: no field, no subject and no signer. */
      const judging = (view: StateView, outcome: OutcomeInput): Judging => {
        const scope = view.scope();
        if (!reading || !scope) throw new RuleFault(`the rule ${mark.code} is asked for an outcome that no judge is deriving`);
        if (rule.clock === true) reading.ran.clock = true;
        return {
          view, definition, bounds: reading.bounds, clock: reading.clock, scope, self: scope.head.seq + 1, kind, fields: {}, fieldTypes: {}, subjects: new Map(), signer: null,
          facts: new Map(), prepared: [], used: [], own: reading.own, platform, judged: { type: "outcome", operation: outcome.operation, attempt: outcome.attempt, owner: outcome.owner, kind: outcome.kind, result: outcome.result, evidence: outcome.evidence }, ran: reading.ran,
        };
      };
      const answer = (given: unknown): boolean => {
        if (typeof given !== "boolean") throw outside(mark, "no answer on an outcome");
        return given;
      };
      return {
        selects: r.selects === true, read: r.read === true, ...(r.closure === undefined ? {} : { closure: r.closure }),
        retries: (result, operation) => answer(run(mark, () => r.retries(result, operation))),
        ...(r.holds ? { holds: (view: StateView, operation: Operation, outcome: OutcomeInput) => answer(run(mark, () => r.holds!(givenTo(judging(view, outcome)), operation))) } : {}),
        ...(r.wellFormed ? { wellFormed: (result, evidence) => answer(run(mark, () => r.wellFormed!(result, evidence))) } : {}),
        ...(r.derives ? { derives: (view: StateView, operation: Operation, outcome: OutcomeInput, selected: boolean | null) => given(mark, judging(view, outcome), kinds, run(mark, () => r.derives!(givenTo(judging(view, outcome)), operation, selected))) } : {}),
      };
    },
    ...(owners?.reserves ? { reserves: (view: StateView, pinned: ValidDefinition) => owners.reserves!(view, pinned) } : {}),
  };
}

/**
 * What an outcome's rule gave, checked as the effects and the requests of
 * a mark are (section 6.1, places 5 and 6): each effect by the checks of the
 * joined list, and each request in the contract's form. An outcome entry is
 * never refused, so an effect that a check would refuse is a fault of the
 * rule, as every other value outside what a rule returns is.
 *
 * An operation that the outcome opens is stated in `opens`, with an owner
 * and a kind that `outcomes` lists. The ledger numbers it, so the effects
 * hold no `operation` and no `attempt`. A creation is not among the
 * requests: no cause is defined for a scope that an outcome entry creates
 * (the authority note's row P2, the fourth cause, which no source builds).
 */
function given(mark: Mark, j: Judging, kinds: Readonly<Record<string, Mark>>, gives: OutcomeGives): OutcomeDerived {
  if (!isObject(gives) || !Array.isArray(gives.effects) || !Array.isArray(gives.sends) || !Array.isArray(gives.opens)) throw outside(mark, "no effects, requests and openings");
  const { effects, sends, opens } = gives;
  if (effects.some((effect) => isObject(effect) && (effect["effect"] === "operation" || effect["effect"] === "attempt"))) throw outside(mark, "an operation among its effects: an outcome states the operations that it opens");
  if (sends.some((request) => isObject(request) && isObject(request["message"]) && request["message"]["type"] === "create")) throw outside(mark, "a creation, for which an outcome entry has no cause");
  for (const open of opens) {
    const { owner, kind, attempts }: { owner?: unknown; kind?: unknown; attempts?: unknown } = isObject(open) ? open : {};
    if (owner !== j.platform?.named || typeof kind !== "string" || own(kinds, kind) === undefined || typeof attempts !== "number" || !Number.isSafeInteger(attempts) || attempts < 1) throw outside(mark, "an operation that its definition does not own");
  }
  // The same derivation that a mark in a written list meets: one rule for the effects, and one for each request, in their order.
  const rules: [string, Rules[string]][] = [["effects", { place: "effect", most: effects.length, run: () => effects }], ...sends.map((request, n): [string, Rules[string]] => [`send.${n}`, { place: "send", run: () => request }])];
  const joining: Judging = { ...j, platform: { named: j.platform!.named, rules: Object.fromEntries(rules) } };
  const joined = deriveEffects(joining, [{ code: "effects", row: mark.row } as unknown as EffectForm], [], null);
  if (!joined.ok) throw outside(mark, `effects that the entry cannot hold: ${"reason" in joined ? joined.reason : joined.unavailable}`);
  const requests = deriveSends(joining, sends.map((_, n) => ({ code: `send.${n}`, row: mark.row }) as unknown as SendForm), joined.working, "sha256:" as never);
  if (!requests.ok) throw outside(mark, `requests that the entry cannot hold: ${"reason" in requests ? requests.reason : requests.unavailable}`);
  return { effects: joined.effects, sends: requests.sends satisfies Send[], opens };
}
