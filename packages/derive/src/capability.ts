/**
 * Capability guards and effects, as the judges derive them (scope contract,
 * section 6.11). A capability is platform code with a name and a version. A
 * definition reaches its records only through the guards and effects that
 * the version declares, and a judge derives both in the commit, from the
 * arguments that the definition writes.
 *
 * This package holds no rule of a capability. A judge is given the rules as
 * `Capabilities`, with its reading. A runtime that has none answers
 * `unsupported-definition` for a definition that needs one (`derivable`),
 * so no judge of such a runtime meets a capability form. A judge that is
 * given a definition it cannot derive does not judge the input.
 */

import { CAPABILITIES } from "@generalbusiness/artroom-contract";
import type { Capability, CapabilityArg, CapabilityName, DeclaredDefinition, Effect, FieldValue, Guard, Operand, UnavailableReason } from "@generalbusiness/artroom-contract";
import type { GuardResult, Judging } from "./guards.ts";
import { bindEach, covered } from "./lists.ts";
import { operand, slotOf } from "./operand.ts";
import type { Item } from "./state.ts";
import type { ValidDefinition } from "./validate/index.ts";
import { own } from "./values.ts";

/** One change of one record, as a capability's effect derives it. The entry records it as a `record` effect of that capability. */
export interface Recorded { kind: string; key: readonly FieldValue[]; state: string; values: Readonly<Record<string, unknown>> }

/**
 * The rules of the capability versions that a runtime or a verifier has
 * code for. Each is a function of the arguments, which the judge reads from
 * the input, this scope's state and the entries in `uses`.
 */
export interface Capabilities {
  /** True when this value derives the guards and effects of that version. */
  implements(capability: CapabilityName): boolean;
  /** One guard: true when it holds, or the name of the refusal that the version declares for it. */
  guard(capability: CapabilityName, guard: string, args: Readonly<Record<string, unknown>>): true | string;
  /** One effect: the records it changes, in order. */
  effect(capability: CapabilityName, effect: string, args: Readonly<Record<string, unknown>>): readonly Recorded[];
}

/** What a capability version declares, or undefined for a version that the contract's tables do not have. */
export const declaredBy = (capability: string): Capability | undefined => own(CAPABILITIES as Readonly<Record<string, Capability>>, capability);

/** The version of a capability that a definition lists. The validator has shown that a definition which uses one lists it once. */
export function versionOf(declared: DeclaredDefinition, name: string): CapabilityName | null {
  const listed = declared.capabilities.find((c) => c.name === name);
  return listed ? `${listed.name}@${listed.version}` : null;
}

/**
 * True when every form of the definition can be derived with these rules:
 * each capability version that one of its forms needs a record of is one
 * the rules implement. With no rules, that is a definition that needs none.
 */
export const derivable = (definition: ValidDefinition, capabilities: Capabilities | null | undefined): boolean =>
  definition.underived.every((u) => capabilities?.implements(u.capability) === true);

/** The rules for the capability a form names. Null: the judge was given none for it, and the input is not judged. */
function rulesFor(j: Judging, name: string): { version: CapabilityName; rules: Capabilities; declared: Capability } | null {
  const version = versionOf(j.definition.declared, name);
  const declared = version ? declaredBy(version) : undefined;
  return version && declared && j.capabilities?.implements(version) ? { version, rules: j.capabilities, declared } : null;
}

/**
 * A capability guard (section 6.5). Its arguments are read as operands. An
 * argument may also be one value for each element of a list, or one slot of
 * each item that a range covers, which needs complete evidence. When the
 * guard does not hold, the refusal is `capability-refused` with the name
 * that the capability gives: `declined` keeps it for the judge.
 */
export function capabilityGuard(j: Judging, g: Extract<Guard, { capability: unknown }>, item: Item | null): GuardResult {
  const { name, guard, with: written } = g.capability;
  const found = rulesFor(j, name);
  if (!found) return "unavailable";
  const args: [string, unknown][] = [];
  for (const [arg, from] of Object.entries(written) as [string, CapabilityArg][]) {
    if ("each" in from) {
      const bound = bindEach(j, from.each, from.as, item);
      // A value that is not a list has no elements. It fails closed, as a list form does.
      if (bound === null) return "fail";
      args.push([arg, bound.map((b) => operand(b, from.value, item))]);
    } else if ("items" in from) {
      const range = covered(j, from.items);
      if (range === null) return "guard-incomplete";
      args.push([arg, range.map((i) => slotOf(i, from.slot))]);
    } else args.push([arg, operand(j, from, item)]);
  }
  const answer = found.rules.guard(found.version, guard, Object.fromEntries(args));
  if (answer === true) return "pass";
  if (!own(found.declared.guards, guard)?.refusals.includes(answer)) throw new Error(`${found.version} declares no refusal ${answer} for its guard ${guard}`);
  (j.declined ??= new Map()).set(g, answer);
  return "fail";
}

/**
 * A capability effect (section 6.6): the `record` effects that the
 * capability derives from the arguments. `unavailable`: the judge was given
 * no rules for that capability.
 */
export function capabilityEffect(j: Judging, form: { name: string; do: string; with: Readonly<Record<string, Operand>> }, item: Item | null): Extract<Effect, { effect: "record" }>[] | UnavailableReason {
  const found = rulesFor(j, form.name);
  if (!found) return "unavailable";
  const args = Object.fromEntries(Object.entries(form.with).map(([arg, from]) => [arg, operand(j, from, item)]));
  return found.rules.effect(found.version, form.do, args).map((r) => {
    const kind = own(found.declared.records, r.kind);
    if (!kind?.states.includes(r.state)) throw new Error(`${found.version} declares no record ${r.kind} with the state ${r.state}`);
    return { effect: "record", capability: found.version, kind: r.kind, key: r.key, state: r.state, values: r.values };
  });
}
