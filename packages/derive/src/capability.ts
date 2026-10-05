/**
 * Capability guards and effects, as the judges derive them (scope contract,
 * section 6.11). A capability is platform code with a name and a version. A
 * definition reaches its records only through the guards and effects that
 * the version declares, and a judge derives both in the commit, from the
 * arguments that the definition writes.
 *
 * This package holds no rule of a capability. A judge is given the rules as
 * `Capabilities`, with its reading. Each rule is a pure function of its
 * arguments and of what the judge gives it: the folded state before the
 * entry, where the capability's records are, and the input being judged. A
 * runtime that lacks the rule of a form that a definition uses answers
 * `unsupported-definition` for that definition (`derivable`), so no judge of
 * such a runtime meets that form. A judge that is given a definition it
 * cannot derive does not judge the input.
 */

import { CAPABILITIES } from "@generalbusiness/artroom-contract";
import type { Capability, CapabilityArg, CapabilityName, DeclaredDefinition, Effect, FieldValue, Guard, Operand, UnavailableReason } from "@generalbusiness/artroom-contract";
import type { GuardResult, Judging } from "./guards.ts";
import type { Underived } from "./validate/capability.ts";
import { bindEach, covered } from "./lists.ts";
import { operand, slotOf } from "./operand.ts";
import type { Item } from "./state.ts";
import type { ValidDefinition } from "./validate/index.ts";
import { own } from "./values.ts";

/** One change of one record, as a capability's effect derives it. The entry records it as a `record` effect of that capability. */
export interface Recorded { kind: string; key: readonly FieldValue[]; state: string; values: Readonly<Record<string, unknown>> }

/**
 * What a capability's rule is given beside its arguments (sections 6.11 and
 * 9.3, "A capability guard or effect"): the folded state before the entry,
 * which holds the capability's records, and the input being judged. They
 * are the judge's own, so a runtime and a verifier give a rule the same.
 * A rule reads nothing else: no clock but this reading, no storage and no
 * network.
 *
 * - `view`: the folded state before the entry.
 * - `definition`: the pinned definition, which says which item types are
 *   holds (authority note, section 5.7, "Who derives them").
 * - `scope` and `self`: this scope, and the `seq` of the entry being written.
 * - `own`: this scope's own sealed entries, by position.
 * - `kind`, `fields`, `signer` and `intent`: the input, as the judge read it.
 * - `facts` and `source`: the entries in `uses` that the input names, and
 *   for a handler the verified source entry.
 * - `clock`: the one reading of the commit.
 */
export type CapabilityGiven = Pick<Judging, "view" | "definition" | "scope" | "self" | "kind" | "fields" | "signer" | "intent" | "facts" | "source" | "own" | "clock">;

/** One form that needs a capability's own code, as the validator lists it (section 6.1): the version, the kind of form and its name. */
export type CapabilityForm = Pick<Underived, "capability" | "form" | "name">;

/**
 * The rules of the capability forms that a runtime or a verifier has code
 * for. Each is a pure function of the arguments, which the judge reads from
 * the input, this scope's state and the entries in `uses`, and of `given`.
 */
export interface Capabilities {
  /**
   * True when this value has the code of that form (section 6.1, "A
   * capability form with no code"). The rule is on each form that a
   * definition uses, and not on the name of a version alone.
   */
  implements(form: CapabilityForm): boolean;
  /** One guard: true when it holds, or the name of the refusal that the version declares for it. */
  guard(capability: CapabilityName, guard: string, args: Readonly<Record<string, unknown>>, given: CapabilityGiven): true | string;
  /** One effect: the records it changes, in order. */
  effect(capability: CapabilityName, effect: string, args: Readonly<Record<string, unknown>>, given: CapabilityGiven): readonly Recorded[];
}

const given = ({ view, definition, scope, self, kind, fields, signer, intent, facts, source, own, clock }: Judging): CapabilityGiven => ({ view, definition, scope, self, kind, fields, signer, intent, facts, source, own, clock });

/** What a capability version declares, or undefined for a version that the contract's tables do not have. */
export const declaredBy = (capability: string): Capability | undefined => own(CAPABILITIES as Readonly<Record<string, Capability>>, capability);

/** The version of a capability that a definition lists. The validator has shown that a definition which uses one lists it once. */
export function versionOf(declared: DeclaredDefinition, name: string): CapabilityName | null {
  const listed = declared.capabilities.find((c) => c.name === name);
  return listed ? `${listed.name}@${listed.version}` : null;
}

/**
 * True when every form of the definition can be derived with these rules:
 * each form that needs a capability's own code is one the rules implement.
 * With no rules, that is a definition that needs none.
 */
export const derivable = (definition: ValidDefinition, capabilities: Capabilities | null | undefined): boolean =>
  definition.underived.every((u) => capabilities?.implements(u) === true);

/** The rules for one guard or effect of the capability a form names. Null: the judge was given none for it, and the input is not judged. */
function rulesFor(j: Judging, name: string, form: "guard" | "effect", of: string): { version: CapabilityName; rules: Capabilities; declared: Capability } | null {
  const version = versionOf(j.definition.declared, name);
  const declared = version ? declaredBy(version) : undefined;
  return version && declared && j.capabilities?.implements({ capability: version, form, name: of }) ? { version, rules: j.capabilities, declared } : null;
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
  const found = rulesFor(j, name, "guard", guard);
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
  const answer = found.rules.guard(found.version, guard, Object.fromEntries(args), given(j));
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
  const found = rulesFor(j, form.name, "effect", form.do);
  if (!found) return "unavailable";
  const args = Object.fromEntries(Object.entries(form.with).map(([arg, from]) => [arg, operand(j, from, item)]));
  return found.rules.effect(found.version, form.do, args, given(j)).map((r) => {
    const kind = own(found.declared.records, r.kind);
    if (!kind?.states.includes(r.state)) throw new Error(`${found.version} declares no record ${r.kind} with the state ${r.state}`);
    return { effect: "record", capability: found.version, kind: r.kind, key: r.key, state: r.state, values: r.values };
  });
}
