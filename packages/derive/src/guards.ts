/**
 * Guard derivation (scope contract, section 6.5). Every guard is derived in
 * the commit from local state, the recorded inputs and the one clock reading.
 * A guard passes, fails, or is not judged; it never passes or fails on
 * evidence that the rest of an enumeration could overturn.
 */

import type { Bounds, Entry, FactRef, FieldType, FieldValue, Guard, MemberRef, Operand, Prepared, Range, UnavailableReason, Digest } from "@generalbusiness/artroom-contract";
import { canonicalBytes, digestBytes } from "@generalbusiness/artroom-bytes";
import type { Signer } from "./attribution.ts";
import type { Item, Party, ScopeState, StateView } from "./state.ts";
import { timeMs, type Clock } from "./time.ts";
import { unsupported } from "./unsupported.ts";
import type { ValidDefinition } from "./validate/index.ts";
import { own, same } from "./values.ts";

/** A foreign entry fetched before the turn, and the name of the definition its scope pins (section 6.2, the `fact` field). */
export interface Fetched { fact: FactRef; entry: Entry; under: string }

/**
 * One `rule` guard as preparation evaluates it (section 5.2, step 5):
 * the rule, its expression, and the input of section 6.5 with its digest.
 */
export interface RuleInput { rule: string; source: string; input: unknown; digest: Digest }

/** Everything the guards, effects and sends of one input read. Built once by a judge, inside the commit. */
export interface Judging {
  view: StateView;
  definition: ValidDefinition;
  bounds: Bounds;
  clock: Clock;
  scope: Pick<ScopeState, "at" | "creator">;           // a genesis is judged before its scope has a state
  self: number;                                        // the `seq` of the entry being written (section 6.4)
  kind: string;
  fields: Readonly<Record<string, FieldValue>>;        // with defaults; an absent optional field has no key
  fieldTypes: Readonly<Record<string, FieldType>>;
  subjects: ReadonlyMap<string, Item>;                 // `on` and each `also.<name>`, as they are before the effects
  signer: Signer | null;
  facts: ReadonlyMap<Digest, Fetched>;                 // the fetched facts the fields name, in the order of `uses`
  prepared: readonly Prepared[];
  used: Prepared[];                                    // the prepared results the guards read, for the entry
  asked?: RuleInput[] | undefined;                     // set by `prepareRules` only: collect each rule's input and judge nothing on it
}

/** Passed, failed, or not judged, with the reason for the Unavailable answer (section 4.2). */
export type GuardResult = "pass" | "fail" | UnavailableReason;

const ok = (holds: boolean): GuardResult => (holds ? "pass" : "fail");

/** What a slot holds, or null. An empty list is unset. */
export function slotOf(item: Item, slot: string): FieldValue | null {
  const v = own(item.parties, slot) ?? own(item.refs, slot) ?? own(item.values, slot) ?? null;
  return Array.isArray(v) && v.length === 0 ? null : (v as FieldValue | null);
}

export const members = (party: Party | undefined): readonly MemberRef[] => (party === null || party === undefined ? [] : Array.isArray(party) ? (party as readonly MemberRef[]) : [party as MemberRef]);

/** An operand's value. A slot is read from `item`. An absent field and an empty slot are null. */
export function operand(j: Judging, o: Operand, item: Item | null): unknown {
  if ("field" in o) return own(j.fields, o.field) ?? null;
  if ("slot" in o) return item ? slotOf(item, o.slot) : null;
  if ("signer" in o) return j.signer?.member ?? null;
  return "const" in o ? o.const : unsupported("that operand");
}

/**
 * A range guard (section 6.5). With no `where` it is answered from the exact
 * counts. With a `where` it reads pages of the indexed set, up to the work
 * limit. `decide` is the contract's table: a result that witnesses complete
 * is returned as soon as it is completed; every other result needs the whole
 * set, and without it the guard is not judged.
 */
function range(j: Judging, form: "some" | "none" | "count", r: Range & { min?: number | undefined; max?: number | undefined }): GuardResult {
  const decide = (n: number, complete: boolean): GuardResult | null => {
    if (form === "some") return n >= 1 ? "pass" : complete ? "fail" : null;
    if (form === "none") return n >= 1 ? "fail" : complete ? "pass" : null;
    if (r.max !== undefined && n > r.max) return "fail";
    if (complete) return ok(r.min === undefined || n >= r.min);
    // An upper bound that holds is never established by a partial scan; a `min` alone is met by `min` witnesses.
    return r.max === undefined && r.min !== undefined && n >= r.min ? "pass" : null;
  };
  const states = [...new Set(r.states)];
  const where = r.where ?? [];
  if (where.length === 0) return decide(states.reduce((n, s) => n + j.view.count(r.type, s), 0), true)!;
  let matched = 0;
  let read = 0;
  let after: number | null = null;
  for (;;) {
    const limit = Math.min(j.bounds.guardPage, j.bounds.guardScan - read);
    if (limit <= 0) return "guard-incomplete";
    const page = j.view.page(r.type, states, after, limit);
    for (const item of page.items) {
      read++;
      after = item.id;
      if (!where.every((w) => ("equals" in w ? same(operand(j, w.equals.a, item), operand(j, w.equals.b, item)) : unsupported("a where that is not equals")))) continue;
      const decided = decide(++matched, false);
      if (decided) return decided;
    }
    if (!page.more) return decide(matched, true)!;
    if (page.items.length === 0) return "guard-incomplete";
  }
}

/**
 * What a `rule` reads, exactly (section 6.5): the subjects' records, the
 * kind and fields, the signer's member, and the content of each fetched
 * fact. No clock and no other item.
 */
export function ruleInput(j: Judging): unknown {
  return {
    kind: j.kind, fields: j.fields, signer: j.signer?.member ?? null,
    subjects: Object.fromEntries(j.subjects), facts: [...j.facts.values()].map((f) => f.entry),
  };
}

/** True when `kind` is the kind a `fact` type states. The validator takes one kind, written as a text; the contract's type is a list. */
const kindIs = (stated: readonly string[] | string, kind: string): boolean => (typeof stated === "string" ? stated === kind : stated.includes(kind));

/** The fields a guard names, for `ifPresent`. */
function fieldsNamed(j: Judging, g: Guard): string[] {
  const of = (o: Operand) => ("field" in o ? [o.field] : []);
  if ("equals" in g) return [...of(g.equals.a), ...of(g.equals.b)];
  if ("differs" in g) return [...of(g.differs.a), ...of(g.differs.b)];
  if ("every" in g) return Object.hasOwn(j.fieldTypes, g.every.list) ? [g.every.list] : [];
  if ("fact" in g) return "field" in g.fact ? [g.fact.field, ...(g.fact.where ?? []).flatMap((w) => ("equals" in w ? of(w.equals.b) : []))] : [];
  return [];
}

export function judgeGuard(j: Judging, g: Guard): GuardResult {
  if (g.ifPresent && fieldsNamed(j, g).some((f) => own(j.fields, f) === undefined)) return "pass";
  // The validator has shown that a guard which reads its subject has one, and that it is not the item being opened.
  const item = j.subjects.get(g.of ?? "on") ?? null;
  const inSlots = (slots: readonly string[], member: MemberRef | null | undefined) => !!member && !!item && slots.some((s) => members(own(item.parties, s)).some((m) => same(m, member)));
  if ("state" in g) return ok(!!item && g.state.includes(item.state));
  if ("signer" in g) return ok(inSlots(g.signer, j.signer?.member));
  if ("notIn" in g) return ok(!inSlots(g.notIn, j.signer?.member) && !inSlots(g.notIn, j.signer?.principal));
  if ("set" in g) return ok(!!item && slotOf(item, g.set) !== null);
  if ("unset" in g) return ok(!!item && slotOf(item, g.unset) === null);
  if ("equals" in g) return ok(same(operand(j, g.equals.a, item), operand(j, g.equals.b, item)));
  if ("differs" in g) return ok(!same(operand(j, g.differs.a, item), operand(j, g.differs.b, item)));
  if ("some" in g) return range(j, "some", g.some);
  if ("none" in g) return range(j, "none", g.none);
  if ("count" in g) {
    const { min, max } = g.count;
    return typeof min === "object" || typeof max === "object" ? unsupported("a count bound from an operand") : range(j, "count", { ...g.count, min, max });
  }
  if ("every" in g) {
    // A field of that name when the act has one; otherwise a slot of the subject. At most 32 point reads.
    const fromField = Object.hasOwn(j.fieldTypes, g.every.list);
    const list = fromField ? own(j.fields, g.every.list) : item ? slotOf(item, g.every.list) : null;
    if (list === undefined) return "fail";
    return ok((Array.isArray(list) ? list : []).every((id) => g.every.states.includes(j.view.item(id as number)?.state ?? "")));
  }
  if ("fact" in g) {
    const fact = "field" in g.fact ? g.fact : unsupported("a fact guard over no field");
    const ref = own(j.fields, fact.field) as FactRef | undefined;
    const type = own(j.fieldTypes, fact.field);
    if (!ref || type?.type !== "fact") return "fail";
    const fetched = j.facts.get(ref.hash);
    if (!fetched) return "dependency-unavailable";
    const input = fetched.entry.input;
    if (input.type !== "act" || !kindIs(type.kind, input.signed.intent.kind) || fetched.under !== type.under) return "fail";
    // `a` is a field of the foreign intent; `b` is read in this act.
    return ok((fact.where ?? []).every((w) => "equals" in w && same("field" in w.equals.a ? (own(input.signed.intent.fields, w.equals.a.field) ?? null) : null, operand(j, w.equals.b, item))));
  }
  if ("before" in g || "after" in g) {
    // Section 5.3: a reading that is behind the history proves nothing about a deadline.
    if (j.clock.behind) return "clock-behind";
    const deadline = item ? timeMs(own(item.values, "before" in g ? g.before.slot : g.after.slot)) : null;
    const now = timeMs(j.clock.reading)!;
    return ok(deadline !== null && ("before" in g ? now < deadline : now > deadline));
  }
  if (!("rule" in g)) return unsupported("that guard");
  const input = ruleInput(j);
  const digest = digestBytes(canonicalBytes(input));
  if (j.asked) {
    // Preparation: the result is not known yet, so the guard is passed over and the guards after it are met.
    if (!j.asked.some((a) => a.rule === g.rule && a.digest === digest)) j.asked.push({ rule: g.rule, source: own(j.definition.declared.rules, g.rule)!, input, digest });
    return "pass";
  }
  // Section 5.2, step 6.4: a rule's result from preparation is reused only when it was prepared over these inputs.
  const prepared = j.prepared.find((p) => p.rule === g.rule && p.input === digest);
  if (!prepared) return "unavailable";
  if (!j.used.includes(prepared)) j.used.push(prepared);
  return ok(prepared.result);
}
