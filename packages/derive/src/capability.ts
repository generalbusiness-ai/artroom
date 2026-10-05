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
import type { Bounds, Capability, CapabilityArg, CapabilityName, DeclaredDefinition, Effect, FieldValue, Guard, Operand, ScopeRef, UnavailableReason } from "@generalbusiness/artroom-contract";
import type { GuardResult, Judging } from "./guards.ts";
import type { Underived } from "./validate/capability.ts";
import { bindEach, covered } from "./lists.ts";
import { operand, slotOf } from "./operand.ts";
import type { HoldEffect } from "./hold.ts";
import type { Most } from "./ledger.ts";
import type { Item, StateView } from "./state.ts";
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
 * - `snapshot`: the snapshots of staged refs that this scope retains, by
 *   digest (section 16.4), which the guard `ancestry` reads.
 * - `from`, for an effect: for each argument that the definition writes as
 *   a slot of an item, with no part, the ID of that item: the subject of
 *   the slot operand. An argument that is read from anything else has no
 *   member. The effect `pin-release` finds its pin by it (authority note,
 *   section 5.7, "Which pin a commit alone releases").
 */
export type CapabilityGiven = Pick<Judging, "view" | "definition" | "scope" | "self" | "kind" | "fields" | "signer" | "intent" | "facts" | "source" | "own" | "snapshot" | "clock"> & { from?: Readonly<Record<string, number>> };

/**
 * One declared maximum of a capability version's code (section 6.1, "A
 * declared maximum for everything that derives"): what derives, and the
 * most effects, requests and operations that it returns in one entry. An
 * `operation` effect and its first `attempt` effect are each an effect.
 *
 * - `effect`: one written effect form, by its name.
 * - `step`: the preparation entry of one step.
 * - `outcome`: what the owner's rule adds to one outcome entry of that kind
 *   of operation.
 * - `bound`: the one record of a bound request that is refused.
 * - `workspace`: what one hold of the entry derives. An entry may touch
 *   several holds, so the count takes it once for each hold that may be
 *   live.
 *
 * A number is a constant of the version, or a constant times a state bound
 * that the version states, such as the tokens of one hold. The code states
 * the product.
 */
export interface Maximum extends Most { form: "effect" | "step" | "outcome" | "bound" | "workspace"; capability: CapabilityName; name: string }

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
  /**
   * What an entry with `hold` effects also derives when the definition's
   * holds have a workspace (authority note, section 5.7, "What is derived,
   * and at which entry"): `workspaceEffects` of `capability/hold.ts`.
   * `holds` are the entry's `hold` effects, `working` gives an item as the
   * entry's effects left it, and `k` is the ordinal of the first operation
   * that the entry has not opened. Absent: these rules have no such code,
   * and an entry holds the item form only.
   */
  workspace?(view: StateView, definition: ValidDefinition, self: number, k: number, holds: readonly HoldEffect[], working: (id: number) => Item | null): readonly Effect[];
  /**
   * Whether a request is bound to a pending record that reserved an entry
   * for it (section 6.11, "Reserved requests"; authority note, section 4.2,
   * "A reserved license decision"). `from` is the envelope's source scope,
   * as verified, and `fields` the message's own fields, read by themselves.
   * The answer is the one record that the deciding entry holds when it
   * refuses the request. Null: the request is not bound, and its deciding
   * entry is new work. Absent: these rules have no such code, and no
   * request is bound.
   */
  bound?(capability: CapabilityName, view: StateView, at: ScopeRef, from: ScopeRef, fields: unknown): Recorded | null;
  /**
   * The maxima that this code declares (section 6.1). `counted` adds them
   * into each entry of a definition, and a judge refuses to write what
   * passes one. Absent: this value declares none, and nothing of it is
   * counted. Only a stand-in of test support is such a value.
   */
  maxima?: readonly Maximum[];
}

/** The declared maximum of one piece of a capability's code, or null when the value declares none for it. */
export const maximumOf = (capabilities: Pick<Capabilities, "maxima"> | null | undefined, form: Maximum["form"], capability: string, name: string): Maximum | null =>
  capabilities?.maxima?.find((m) => m.form === form && m.capability === capability && m.name === name) ?? null;

/**
 * The count of section 6.1, "What the validator counts", for the code of
 * the capabilities: the most effects that code derives in one entry of the
 * definition, against the bound on the derived effects of one entry. Null:
 * every entry fits. Otherwise the entry that does not, and its count. A
 * definition whose count does not fit beside this code is not run:
 * `unsupported-definition`.
 *
 * - For each act and each handler: the declared maximum of each capability
 *   effect that the row writes, in any of its lists, and what a hold's
 *   workspace derives, once for each hold that may be live. Which holds an
 *   entry ends with what they are under is known only in the commit, so
 *   the count takes every hold type's `max`.
 * - For each timed rule: the workspace, counted the same way.
 * - For an entry that no row writes: the declared maximum of each step, of
 *   each kind of outcome and of a bound request.
 *
 * Requests are counted against the sends of one entry. The entry's size is
 * checked when the entry is sealed, on its bytes.
 */
export function counted(definition: ValidDefinition, capabilities: Capabilities | null | undefined, bounds: Pick<Bounds, "derivedEffects" | "sendsPerEntry">): { entry: string; effects: number; requests: number } | null {
  const maxima = capabilities?.maxima;
  if (!maxima) return null;
  const { declared, underived, holdTypes } = definition;
  const listed = new Set<string>(declared.capabilities.map((c) => `${c.name}@${c.version}`));
  const mine = maxima.filter((m) => listed.has(m.capability));
  const holds = holdTypes.reduce((n, type) => n + (own(declared.items, type)?.max ?? 0), 0);
  const workspace = mine.filter((m) => m.form === "workspace").reduce((sum, m) => ({ effects: sum.effects + holds * m.effects, requests: sum.requests + holds * m.requests }), { effects: 0, requests: 0 });
  const entries = new Map<string, { effects: number; requests: number }>();
  const add = (entry: string, m: { effects: number; requests: number }) => { const sum = entries.get(entry) ?? { effects: 0, requests: 0 }; entries.set(entry, { effects: sum.effects + m.effects, requests: sum.requests + m.requests }); };
  for (const list of ["acts", "receives", "timed"] as const) for (const name of Object.keys(declared[list])) add(`${list}.${name}`, workspace);
  for (const u of underived) {
    const m = u.form === "effect" ? maximumOf(capabilities, "effect", u.capability, u.name) : null;
    if (m) add(u.path.split(".").slice(0, 2).join("."), m);
  }
  for (const m of mine) if (m.form === "step" || m.form === "outcome" || m.form === "bound") add(`${m.capability}:${m.form}:${m.name}`, m);
  for (const [entry, sum] of entries) if (sum.effects > bounds.derivedEffects || sum.requests > bounds.sendsPerEntry) return { entry, ...sum };
  return null;
}

const given = ({ view, definition, scope, self, kind, fields, signer, intent, facts, source, own, snapshot, clock }: Judging): CapabilityGiven => ({ view, definition, scope, self, kind, fields, signer, intent, facts, source, own, snapshot, clock });

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
  // The subject of each argument that is a slot operand: the form's own subject, the item of a range, or the subject it names.
  const from = Object.fromEntries(Object.entries(form.with).flatMap(([arg, o]): [string, number][] => {
    if (!("slot" in o) || o.part !== undefined) return [];
    const of = o.of === undefined ? item : o.of === "each" ? (j.each ?? null) : (j.subjects.get(o.of) ?? null);
    return of ? [[arg, of.id]] : [];
  }));
  const made = found.rules.effect(found.version, form.do, args, { ...given(j), from });
  // Section 6.1, "In the commit": code that returns more than it declared has a fault, and the input is not judged.
  const most = maximumOf(found.rules, "effect", found.version, form.do);
  if (most && made.length > most.effects) throw new Error(`${found.version} declares at most ${most.effects} effects for its effect ${form.do}, and it returned ${made.length}`);
  return made.map((r) => {
    const kind = own(found.declared.records, r.kind);
    if (!kind?.states.includes(r.state)) throw new Error(`${found.version} declares no record ${r.kind} with the state ${r.state}`);
    return { effect: "record", capability: found.version, kind: r.kind, key: r.key, state: r.state, values: r.values };
  });
}
