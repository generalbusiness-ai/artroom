/**
 * Guard derivation (scope contract, section 6.5). Every guard is derived in
 * the commit from local state, the recorded inputs and the one clock reading.
 * A guard passes, fails, or is not judged; it never passes or fails on
 * evidence that the rest of an enumeration could overturn.
 */

import type { Bounds, Entry, FactRef, FieldType, FieldValue, Guard, MemberRef, Operand, Prepared, Range, Reason, ScopeRef, Subject, UnavailableReason, Digest } from "@generalbusiness/artroom-contract";
import { canonicalBytes, digestBytes } from "@generalbusiness/artroom-bytes";
import type { Signer } from "./attribution.ts";
import { capabilityGuard, type Capabilities } from "./capability.ts";
import type { Own, Snapshots } from "./fields.ts";
import { all, excepted, listGuard, scan, typeOfElement } from "./lists.ts";
import { guardByRule, markOf, type AtHand, type Declined, type JudgedInput, type PlatformRules } from "./marks.ts";
import { equal, kindOf, operand, slotOf } from "./operand.ts";
import type { Item, Party, ScopeState, StateView } from "./state.ts";
import { timeMs, type Clock } from "./time.ts";
import type { ValidDefinition } from "./validate/index.ts";
import { isFactRef, isLocalId, own, same } from "./values.ts";

export { operand, slotOf };

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
  fields: Readonly<Record<string, FieldValue>>;        // with defaults; an absent optional field has no key; a local fact in normal form
  fieldTypes: Readonly<Record<string, FieldType>>;
  subjects: ReadonlyMap<string, Item>;                 // `on` and each `also.<name>`, as they are before the effects
  signer: Signer | null;
  facts: ReadonlyMap<Digest, Fetched>;                 // the fetched facts the fields name, in the order of `uses`
  prepared: readonly Prepared[];
  used: Prepared[];                                    // the prepared results the guards read, for the entry
  asked?: RuleInput[] | undefined;                     // set by `prepareRules` only: collect each rule's input and judge nothing on it
  // What the operands of section 6.5 read beside the above. Each is absent where the input has none, and its operand is then none.
  own?: Own | undefined;                               // this scope's own history: a local fact, and a part of one
  snapshot?: Snapshots | undefined;                    // the snapshots of staged refs that this scope retains, by digest (section 16.4)
  intent?: Digest | undefined;                         // an act: the digest of the intent being judged
  sender?: ScopeRef | undefined;                       // a handler and a result clause: the envelope's source scope, as verified
  source?: Fetched | undefined;                        // a handler: the verified source entry
  update?: { state: string; item: FactRef; revision: number } | undefined;   // a `relate` handler: the update being applied
  result?: Reason | undefined;                         // a result clause: the reason on the result being recorded
  presented?: Readonly<Record<string, FieldValue>> | undefined;   // an act: the facts presented beside the intent
  elements?: ReadonlyMap<string, unknown> | undefined; // inside a list form: each element it binds, by its `as` name
  elementTypes?: ReadonlyMap<string, FieldType | null> | undefined;   // the type of each bound element, when the definition states it
  each?: Item | undefined;                             // a fan-out send: the item of that send
  capabilities?: Capabilities | undefined;             // the rules of the capabilities this judge can derive (section 6.11). Without them a capability form is not judged
  declined?: Map<Guard, string> | undefined;           // each capability guard that did not hold, with the refusal its capability names
  // Platform code (section 6.1). A declared definition holds no mark, so its judge needs none of these.
  platform?: PlatformRules | undefined;                // the rules of the platform definition that the scope pins. Without them a mark is a fault
  judged?: JudgedInput | undefined;                    // the input of the entry being judged, whole, as a rule is given it
  ran?: { clock: boolean } | undefined;                // one for a judgment: whether a rule that reads the clock was run for it
  coded?: Map<Guard, Declined> | undefined;            // each guard that is a mark and did not hold, with the refusal its rule states
  beside?: AtHand | undefined;                         // the further observations and the values at hand for this entry, and what its rules read of them (sections 4.1 and 6.2)
}

/** Passed, failed, or not judged, with the reason for the Unavailable answer (section 4.2). */
export type GuardResult = "pass" | "fail" | UnavailableReason;

const ok = (holds: boolean): GuardResult => (holds ? "pass" : "fail");

export const members = (party: Party | undefined): readonly MemberRef[] => (party === null || party === undefined ? [] : Array.isArray(party) ? (party as readonly MemberRef[]) : [party as MemberRef]);

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
  if ((r.where ?? []).length === 0) {
    // The counts are exact. The items of the `except` subjects that they count are left out.
    const left = excepted(j, r).filter((i) => i.type === r.type && r.states.includes(i.state)).length;
    return decide([...new Set(r.states)].reduce((n, s) => n + j.view.count(r.type, s), 0) - left, true)!;
  }
  let matched = 0;
  let decided: GuardResult | null = null;
  const end = scan(j, r, () => (decided = decide(++matched, false)) !== null);
  return end === "stopped" ? decided! : end === "all" ? decide(matched, true)! : "guard-incomplete";
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

/** True when a field or a presented fact that the guard names is absent, which is what `ifPresent` asks: its operands, and an operand inside a part. */
function namesAbsent(j: Judging, g: Guard): boolean {
  const inPart = (o: Operand): boolean => ("part" in o && typeof o.part === "object" && "set" in o.part ? of(o.part.set.item) : "source" in o && typeof o.source === "object" && "set" in o.source ? of(o.source.set.item) : false);
  const of = (o: Operand): boolean => ("field" in o && own(j.fields, o.field) === undefined) || ("presented" in o && own(j.presented, o.presented) === undefined) || inPart(o);
  if ("equals" in g) return of(g.equals.a) || of(g.equals.b);
  if ("differs" in g) return of(g.differs.a) || of(g.differs.b);
  if ("every" in g) return Object.hasOwn(j.fieldTypes, g.every.list) && own(j.fields, g.every.list) === undefined;
  if ("fact" in g) return "field" in g.fact ? of({ field: g.fact.field }) || (g.fact.where ?? []).some((w) => "equals" in w && of(w.equals.b)) : "presented" in g.fact && of(g.fact);
  return false;
}

/**
 * Section 6.4: an `also` name is unbound when it selects no item. It is then
 * not among the subjects. A guard whose subject is unbound is not evaluated,
 * and the input does not rest on it.
 */
const unbound = (j: Pick<Judging, "subjects">, of: string): boolean => of.startsWith("also.") && !j.subjects.has(of);

/**
 * True when a written form reads an unbound `also` name as a subject: as an
 * `of`, or as the `item` of an operand. Section 6.4: an effect, a send or a
 * notice whose `if` reads one is not applied.
 */
export function readsUnbound(j: Pick<Judging, "subjects">, v: unknown): boolean {
  if (Array.isArray(v)) return v.some((x) => readsUnbound(j, x));
  if (typeof v !== "object" || v === null) return false;
  return Object.entries(v).some(([k, x]) => ((k === "of" || k === "item") && typeof x === "string" ? unbound(j, x) : readsUnbound(j, x)));
}

/**
 * The guards of one written list, by the three results of section 6.5: false
 * when one is false on a completed evaluation; otherwise not completed when
 * one is not; otherwise true. So a guard that is not completed does not end
 * the list: a later guard that is false still refuses. The guards of an act,
 * of a handler and of a condition are each such a list. `at`: the failed
 * guard, whose `reason` names a refusal; -1 when no guard is false.
 *
 * Section 4.2, check 10: in the written list of an act or a handler of
 * platform data, a mark is one guard of the list. Its rule is run at its
 * position: the guards before it were judged first, and it is not run after
 * one that is false. The validator lets a mark stand in no other list.
 */
export function judgeGuards(j: Judging, guards: readonly Guard[], of: Subject = "on"): { result: GuardResult; at: number } {
  let at = -1;
  const result = all(guards.map((g, i) => () => {
    const mark = markOf(g);
    const r = mark ? guardByRule(j, g, mark) : judgeGuard(j, g, of);
    if (r === "fail") at = i;
    return r;
  }));
  return { result, at };
}

/** One guard. `of`: the subject of the guard that holds it, which a nested guard takes unless it names its own. */
export function judgeGuard(j: Judging, g: Guard, of: Subject = "on"): GuardResult {
  if (g.ifPresent && namesAbsent(j, g)) return "pass";
  // The validator has shown that a guard which reads its subject has one, and that it is not the item being opened.
  const subject = g.of ?? of;
  // Section 6.4: a guard whose subject is unbound is not evaluated, at the top of a list or nested in a form. It fails no list.
  if (unbound(j, subject)) return "pass";
  const item = j.subjects.get(subject) ?? null;
  const inSlots = (slots: readonly string[], member: MemberRef | null | undefined) => !!member && !!item && slots.some((s) => members(own(item.parties, s)).some((m) => same(m, member)));
  if ("state" in g) return ok(!!item && g.state.includes(item.state));
  if ("signer" in g) return ok(inSlots(g.signer, j.signer?.member));
  if ("notIn" in g) return ok(!inSlots(g.notIn, j.signer?.member) && !inSlots(g.notIn, j.signer?.principal));
  if ("set" in g) return ok(!!item && slotOf(item, g.set) !== null);
  if ("unset" in g) return ok(!!item && slotOf(item, g.unset) === null);
  if ("equals" in g) return ok(equal(j, operand(j, g.equals.a, item), operand(j, g.equals.b, item)));
  if ("differs" in g) return ok(!equal(j, operand(j, g.differs.a, item), operand(j, g.differs.b, item)));
  if ("some" in g) return range(j, "some", g.some);
  if ("none" in g) return range(j, "none", g.none);
  if ("count" in g) {
    // A bound is a number, or an operand that reads one. A bound that reads no count, as from an empty slot, fails the guard.
    const bound = (b: number | Operand | undefined): number | null | undefined => {
      if (b === undefined || typeof b === "number") return b;
      const read = operand(j, b, item);
      return typeof read === "number" && Number.isSafeInteger(read) && read >= 0 ? read : null;
    };
    const [min, max] = [bound(g.count.min), bound(g.count.max)];
    return min === null || max === null ? "fail" : range(j, "count", { ...g.count, min, max });
  }
  if ("every" in g) {
    // A field of that name when the act has one; otherwise a slot of the subject. At most 32 point reads.
    const fromField = Object.hasOwn(j.fieldTypes, g.every.list);
    const list = fromField ? own(j.fields, g.every.list) : item ? slotOf(item, g.every.list) : null;
    if (list === undefined) return "fail";
    return ok((Array.isArray(list) ? list : []).every((id) => g.every.states.includes(j.view.item(id as number)?.state ?? "")));
  }
  if ("fact" in g) {
    // The entry is named by a field, by a fact presented beside the intent, or by an element that a list form binds.
    const fact = g.fact;
    const ref = "field" in fact ? own(j.fields, fact.field) : operand(j, fact, item);
    const presents = "presented" in fact ? own(own(j.definition.declared.acts, j.kind)?.presents, fact.presented) : undefined;
    const type: FieldType | null | undefined = "field" in fact ? own(j.fieldTypes, fact.field) : "element" in fact ? typeOfElement(j, fact.element) : presents && { type: "fact", ...presents };
    if (ref === undefined || ref === null || type?.type !== "fact") return "fail";
    // Section 6.2: a local fact is in normal form, and is read from this scope's own history. Its kind and definition are this scope's own.
    // A foreign fact was fetched before the turn, with the name of the definition its scope pins.
    const local = isLocalId(ref);
    const read = local ? j.own?.(ref) : isFactRef(ref) ? j.facts.get(ref.hash) : undefined;
    if (!read) return local ? "unavailable" : "dependency-unavailable";
    // The kind of the entry, as section 6.2 defines it: an act's kind, the kind a genesis records, or the name of a delivered request.
    const kind = kindOf(read.entry);
    const under = "under" in read ? read.under : j.definition.declared.name;
    if (kind === null || !type.kind.includes(kind) || under !== type.under) return "fail";
    if (!("field" in fact)) return "pass";
    // `a` is a field of the entry's intent, or of the message it delivered; `b` is read in this act.
    const named: Operand = { field: fact.field };
    return ok((fact.where ?? []).every((w) => "equals" in w && "field" in w.equals.a && equal(j, operand(j, { ...named, part: { field: w.equals.a.field } }, item), operand(j, w.equals.b, item))));
  }
  if ("before" in g || "after" in g) {
    // Section 5.3: a reading that is behind the history proves nothing about a deadline.
    if (j.clock.behind) return "clock-behind";
    const deadline = item ? timeMs(own(item.values, "before" in g ? g.before.slot : g.after.slot)) : null;
    const now = timeMs(j.clock.reading)!;
    return ok(deadline !== null && ("before" in g ? now < deadline : now > deadline));
  }
  if ("each" in g || "has" in g || "anyOf" in g || "distinct" in g || "sameSet" in g) return listGuard(j, g, subject, item, judgeGuard);
  // Section 6.11: a guard that a capability declares, derived by the capability's own rules.
  if ("capability" in g) return capabilityGuard(j, g, item);
  if (!("rule" in g)) return "fail";
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
