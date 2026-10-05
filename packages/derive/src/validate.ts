/**
 * The definition validator (scope contract, sections 6.1 to 6.4). A scope
 * pins only a definition that passes, so every judge may rely on what is
 * checked here: names resolve, each form is one the contract defines, and
 * the static rules of sections 6.3 and 6.4 hold.
 *
 * The input is untrusted data. Any form or field the contract does not
 * define is refused, which refuses the forms of section 6.10.
 */

import type { Bounds, DeclaredDefinition, Digest, FieldType, ItemType, TimedRule } from "@generalbusiness/artroom-contract";
import { canonicalize, definitionDigest, isDigest, utf8 } from "@generalbusiness/artroom-bytes";
import { LAST_MS } from "./time.ts";
import { SCOPE_KINDS, isObject, isValue } from "./values.ts";

export type ProblemCode =
  | "shape"              // not the shape of the form, or a form or field the contract does not define
  | "bound"              // past a bound of sections 6.1 to 6.4
  | "name"               // a name that resolves to nothing, or to a thing of the wrong type
  | "one-item"           // an act or handler could open two items (section 4.1)
  | "required-unset"     // an opening leaves a required slot with no effect that sets it (section 6.3)
  | "nascent-guard"      // a guard reads the item its act opens (section 6.3)
  | "conflict"           // two effects set one slot, or the state, of one subject (section 6.3)
  | "fixed"              // an effect sets a fixed slot after the opening (section 6.3)
  | "final"              // a state effect that could leave a final state (section 6.3)
  | "duplicate-relation" // two `relate` sends written with one `to`, `item` and `name` (section 6.4)
  | "genesis"            // the genesis act is missing or is not an `open` act
  | "genesis-timed"      // the genesis act opens a timed item type or has a `hold` effect (section 6.4)
  | "timed"              // a timed rule that is not about its own live item, or that would stay due
  | "timed-partial"      // a timed rule with an effect that its commit could refuse (section 6.4)
  | "hold"               // the hold capability used without what it needs (section 6.8)
  | "handler"            // two handlers for one message from one kind of scope, or a name the platform keeps
  | "capability" | "profile" | "rule";

export interface Problem { code: ProblemCode; path: string; message: string }

/** What a `where` of one range guard reads: the slots an index on that type must cover (section 6.5). */
export interface RangeIndex { path: string; type: string; slots: readonly string[] }

/** A definition that passed, with what was derived from it. The judges and the fold take only this. */
export interface ValidDefinition {
  readonly declared: DeclaredDefinition;
  readonly digest: Digest;
  readonly timedTypes: readonly string[];   // section 5.2
  readonly holdTypes: readonly string[];    // section 6.8: the types a `hold: open` effect targets
  readonly indexes: readonly RangeIndex[];
}

export type Validation = { ok: true; definition: ValidDefinition } | { ok: false; problems: readonly Problem[] };

/**
 * An evaluator profile, by `name@version` (section 6.1). `admit` says why the
 * profile does not admit a rule's text, or null. It is synchronous. The
 * evaluator's own entry point, `@generalbusiness/artroom-derive/rule`, exports
 * the table that checks each rule; this one checks names and shapes only, so
 * that the judges never load the engine.
 */
export interface Profile { admit?: (source: string) => string | null }

export const PROFILES: Readonly<Record<string, Profile>> = { "restricted@1": {} };

/** The message names a `tell` may not use: the platform runs a handler of that name for a `relate` or an advisory. */
export const keptMessage = (name: string): boolean => name.startsWith("relate:") || name === "index" || name === "notify";

type Rec = Record<string, unknown>;
interface Slot { kind: "party" | "ref" | "value"; fixed: boolean; required: boolean; list: boolean; type: FieldType; hasDefault: boolean }
interface Type { name: string; states: Map<string, boolean>; initial: string; slots: Map<string, Slot> }
/** What the forms of one act, handler or timed rule may name. */
interface Ctx {
  on: Type | null;
  also: Map<string, Type>;
  nascent: boolean;                       // `on` is opened by this entry
  fields: Map<string, FieldType> | null;  // null: a handler, whose message fields the contract does not declare
  signer: boolean;
  timed: boolean;
  live: Set<string>;                      // subjects under a `state` guard that lists no final state
}

const GUARDS = ["state", "signer", "notIn", "set", "unset", "equals", "differs", "some", "none", "count", "every", "fact", "before", "after", "rule"];
const EFFECTS = ["state", "party", "ref", "value", "attribute", "hold"];
const FIELD_SHAPES: Readonly<Record<string, readonly string[]>> = {
  text: ["max"], int: ["min", "max"], bool: [], time: [], enum: ["of"], member: [], item: ["of"], fact: ["kind", "under"], scope: ["kind"], digest: [], commit: [], tree: [], list: ["of", "max"],
};

/**
 * Section 6.6: every value of `from` is a value of `to`. The two are the same
 * type, and the bounds of `from` are inside those of `to`: a text's `max`, an
 * integer's range, an enum's values, a reference's kind, a list's `max` and
 * its elements. A copy needs this; a comparison does not.
 */
function assignable(from: FieldType, to: FieldType): boolean {
  switch (from.type) {
    case "text": return to.type === "text" && from.max <= to.max;
    case "int": return to.type === "int" && from.min >= to.min && from.max <= to.max;
    case "enum": return to.type === "enum" && from.of.every((v) => to.of.includes(v));
    case "item": return to.type === "item" && from.of === to.of;
    case "scope": return to.type === "scope" && from.kind === to.kind;
    case "fact": return to.type === "fact" && from.kind === to.kind && from.under === to.under;
    case "list": return to.type === "list" && from.max <= to.max && assignable(from.of, to.of);
    default: return from.type === to.type;
  }
}
const onSubject = (of: unknown) => of === undefined || of === "on";
/** The slot of the primary item that a written effect sets to a value, if any. */
const setsSlot = (e: unknown): unknown => {
  if (!isObject(e) || !onSubject(e["of"])) return null;
  for (const k of ["party", "ref", "value", "attribute"]) {
    const x = e[k];
    if (isObject(x) && (k === "value" || k === "attribute" || (x["from"] !== null && x["list"] !== "remove"))) return x["slot"];
  }
  return null;
};
const holdDoes = (effects: unknown, what: string) => Array.isArray(effects) && effects.some((e) => isObject(e) && isObject(e["hold"]) && e["hold"]["do"] === what && onSubject(e["of"]));

export function validateDefinition(input: unknown, bounds: Bounds, profiles: Readonly<Record<string, Profile>> = PROFILES): Validation {
  const problems: Problem[] = [];
  const bad = (code: ProblemCode, path: string, message: string): null => {
    problems.push({ code, path, message });
    return null;
  };
  const at = (path: string, key: string | number) => (path === "" ? String(key) : `${path}.${key}`);

  // ------------------------------------------------------------ shapes

  /** An object with every required key and no key outside the two lists. */
  const rec = (v: unknown, path: string, required: readonly string[], optional: readonly string[] = []): Rec | null => {
    if (!isObject(v)) return bad("shape", path, "must be an object");
    let ok = true;
    for (const k of required) if (!(k in v)) ok = bad("shape", at(path, k), "is missing") ?? false;
    for (const k of Object.keys(v)) if (!required.includes(k) && !optional.includes(k)) ok = bad("shape", at(path, k), "is not a field or form the contract defines") ?? false;
    return ok ? v : null;
  };
  /** An object that is exactly one of `forms`, beside the optional keys. */
  const form = (v: unknown, path: string, forms: readonly string[], optional: readonly string[] = []): [string, unknown] | null => {
    if (!isObject(v)) return bad("shape", path, "must be an object");
    const named = Object.keys(v).filter((k) => !optional.includes(k));
    const k = named[0];
    if (named.length !== 1 || k === undefined || !forms.includes(k)) return bad("shape", path, `must be exactly one of: ${forms.join(", ")}`);
    return [k, v[k]];
  };
  const entries = (v: unknown, path: string, max: number | null): [string, unknown][] => {
    if (!isObject(v)) return bad("shape", path, "must be an object") ?? [];
    const all = Object.entries(v);
    if (max !== null && all.length > max) bad("bound", path, `has ${all.length}; at most ${max}`);
    if ("" in v) bad("shape", path, "has an empty name");
    return all;
  };
  const list = (v: unknown, path: string, max: number): unknown[] => {
    if (!Array.isArray(v)) return bad("shape", path, "must be a list") ?? [];
    if (v.length > max) bad("bound", path, `has ${v.length}; at most ${max}`);
    return v;
  };
  const str = (v: unknown, path: string): string | null => (typeof v === "string" && v !== "" ? v : bad("shape", path, "must be a non-empty string"));
  const int = (v: unknown, path: string, min = 0): number | null => (typeof v === "number" && Number.isSafeInteger(v) && v >= min ? v : bad("shape", path, `must be an integer of at least ${min}`));
  const bool = (v: unknown, path: string): boolean | null => (typeof v === "boolean" ? v : bad("shape", path, "must be true or false"));
  /** A non-empty list of names, each one of `among`. */
  const names = (v: unknown, path: string, among: { has(k: string): boolean }, what: string): string[] => {
    const all = list(v, path, bounds.listElements);
    if (all.length === 0 && Array.isArray(v)) bad("shape", path, "must not be empty");
    all.forEach((n, i) => { if (typeof n !== "string" || !among.has(n)) bad("name", at(path, i), `names no ${what}`); });
    return all.filter((n): n is string => typeof n === "string");
  };

  const top = rec(input, "", ["format", "profile", "capabilities", "genesis", "items", "acts", "receives", "timed", "rules"]);
  if (!top) return { ok: false, problems };
  if (top["format"] !== "artroom-definition-1") bad("shape", "format", "must be artroom-definition-1");

  const profile = rec(top["profile"], "profile", ["name", "version"]);
  const evaluator = (profile && profiles[`${String(profile["name"])}@${String(profile["version"])}`]) || null;
  if (profile && !evaluator) bad("profile", "profile", "is not a profile this runtime implements");
  // Section 6.5: a rule is a named expression in the profile's language.
  const rules = new Set<string>();
  for (const [name, source] of entries(top["rules"], "rules", null)) {
    const text = str(source, at("rules", name));
    const refusal = text === null ? null : (evaluator?.admit?.(text) ?? null);
    if (refusal !== null) bad("rule", at("rules", name), refusal);
    rules.add(name);
  }

  let holds = false;
  list(top["capabilities"], "capabilities", 2).forEach((c, i) => {
    const o = rec(c, at("capabilities", i), ["name", "version"]);
    if (!o) return;
    if (o["name"] === "hold" && o["version"] === 1) holds = true;
    else bad("capability", at("capabilities", i), "is not a capability this runtime implements");
  });

  // ------------------------------------------------------------ fields and items (sections 6.2 and 6.3)

  const typeNames = new Set(isObject(top["items"]) ? Object.keys(top["items"]) : []);

  const fieldType = (v: unknown, path: string, extra: readonly string[] = [], nested = false): FieldType | null => {
    const before = problems.length;
    const keys = isObject(v) && typeof v["type"] === "string" ? FIELD_SHAPES[v["type"]] : undefined;
    if (!keys) return bad("shape", path, "must be a field type");
    const o = rec(v, path, ["type", ...keys], extra);
    if (!o) return null;
    switch (o["type"]) {
      case "text":
        if ((int(o["max"], at(path, "max")) ?? 0) > bounds.textBytes) bad("bound", at(path, "max"), `at most ${bounds.textBytes} bytes`);
        break;
      case "int":
        if (!Number.isSafeInteger(o["min"]) || !Number.isSafeInteger(o["max"]) || (o["min"] as number) > (o["max"] as number)) bad("shape", path, "min and max must be integers, min not above max");
        break;
      case "enum":
        if (!Array.isArray(o["of"]) || o["of"].length === 0 || o["of"].some((e) => typeof e !== "string") || new Set(o["of"]).size !== o["of"].length) bad("shape", at(path, "of"), "must be a list of distinct strings");
        break;
      case "item":
        if (typeof o["of"] !== "string" || !typeNames.has(o["of"])) bad("name", at(path, "of"), "names no item type");
        break;
      case "fact":
        str(o["kind"], at(path, "kind"));
        str(o["under"], at(path, "under"));
        break;
      case "scope":
        if (!SCOPE_KINDS.includes(o["kind"] as never)) bad("shape", at(path, "kind"), "is not a scope kind");
        break;
      case "list":
        if (nested) bad("shape", path, "a list of lists is not a field type");
        else fieldType(o["of"], at(path, "of"), [], true);
        if ((int(o["max"], at(path, "max")) ?? 0) > bounds.listElements) bad("bound", at(path, "max"), `at most ${bounds.listElements} elements`);
        break;
    }
    return problems.length === before ? (v as unknown as FieldType) : null;
  };

  const types = new Map<string, Type>();
  for (const [name, v] of entries(top["items"], "items", bounds.items)) {
    const path = at("items", name);
    const before = problems.length;
    const o = rec(v, path, ["many", "max", "states", "initial", "parties", "refs", "values"]);
    if (!o) continue;
    const many = bool(o["many"], at(path, "many"));
    const max = int(o["max"], at(path, "max"), 1);
    if (many === false && max !== null && max !== 1) bad("shape", at(path, "max"), "a type that is not `many` has max 1");
    const states = new Map<string, boolean>();
    for (const [s, sv] of entries(o["states"], at(path, "states"), bounds.states)) {
      const so = rec(sv, at(at(path, "states"), s), ["final"]);
      if (so && bool(so["final"], at(at(path, "states"), s)) !== null) states.set(s, so["final"] as boolean);
    }
    if (typeof o["initial"] !== "string" || !states.has(o["initial"])) bad("name", at(path, "initial"), "names no state");
    const slots = new Map<string, Slot>();
    const slot = (kind: Slot["kind"], bound: number, required: readonly string[], optional: readonly string[]) => {
      for (const [s, sv] of entries(o[kind === "party" ? "parties" : `${kind}s`], at(path, kind === "party" ? "parties" : `${kind}s`), bound)) {
        const p = at(at(path, kind === "party" ? "parties" : `${kind}s`), s);
        const so = rec(sv, p, ["fixed", "required", ...required], optional);
        if (!so || bool(so["fixed"], at(p, "fixed")) === null || bool(so["required"], at(p, "required")) === null) continue;
        if (slots.has(s)) { bad("shape", p, "one item type has two slots of this name"); continue; }
        let type: FieldType | null;
        if (kind === "party") {
          if (bool(so["list"], at(p, "list")) === null || bool(so["author"], at(p, "author")) === null) continue;
          if ("max" in so && (!so["list"] || (int(so["max"], at(p, "max"), 1) ?? 0) > bounds.listElements)) bad("bound", at(p, "max"), `only a list has a max, of at most ${bounds.listElements}`);
          type = so["list"] ? { type: "list", of: { type: "member" }, max: (so["max"] as number | undefined) ?? bounds.listElements } : { type: "member" };
        } else type = fieldType(so[kind === "ref" ? "to" : "of"], at(p, kind === "ref" ? "to" : "of"));
        if (!type) continue;
        if ("default" in so && !isValue(type, so["default"], bounds)) bad("shape", at(p, "default"), "is not a value of the slot's type");
        slots.set(s, { kind, fixed: so["fixed"] as boolean, required: so["required"] as boolean, list: so["list"] === true, type, hasDefault: "default" in so });
      }
    };
    slot("party", bounds.parties, ["list", "author"], ["max"]);
    slot("ref", bounds.refs, ["to"], []);
    slot("value", bounds.values, ["of"], ["default"]);
    if (problems.length === before) types.set(name, { name, states, initial: o["initial"] as string, slots });
  }
  // Every later check resolves names against the item types, so a problem above would only repeat itself below.
  if (problems.length > 0) return { ok: false, problems };

  // ------------------------------------------------------------ subjects and operands (section 6.4)

  const subject = (of: unknown, path: string, ctx: Ctx, scopeToo: boolean): Type | "scope" | null => {
    if (onSubject(of)) return ctx.on ?? bad("name", path, "there is no primary item here; name a subject with `of`");
    if (of === "scope") return scopeToo ? "scope" : bad("name", path, "the scope is not an item");
    const named = typeof of === "string" && of.startsWith("also.") ? ctx.also.get(of.slice(5)) : undefined;
    return named ?? bad("name", path, "names no subject");
  };

  /** One operand. A slot is read from the item that `owner` gives. Returns the operand's form. */
  const operand = (v: unknown, path: string, ctx: Ctx, owner: () => Type | null): string | null => {
    const f = form(v, path, ["field", "slot", "signer", "const"]);
    if (!f) return null;
    const [k, x] = f;
    if (k === "field" && (typeof x !== "string" || (ctx.fields && !ctx.fields.has(x)))) return bad("name", path, "names no field");
    if (k === "slot") {
      const t = owner();
      if (!t) return null;
      if (typeof x !== "string" || !t.slots.has(x)) return bad("name", path, `names no slot of ${t.name}`);
    }
    if (k === "signer" && (x !== true || !ctx.signer)) return bad("name", path, "there is no signer here");
    if (k === "const") {
      try { canonicalize(x); } catch { return bad("shape", path, "is not a value"); }
    }
    return k;
  };
  const fieldOf = (v: unknown, ctx: Ctx): FieldType | null => (isObject(v) && typeof v["field"] === "string" ? (ctx.fields?.get(v["field"]) ?? null) : null);
  /** Section 6.6: a slot never holds a value outside its type, so a copy needs a source whose every value the slot can hold. */
  const copy = (from: FieldType | null | undefined, to: FieldType, path: string, what: string): void => {
    if (from?.type !== to.type) bad("name", path, `names no ${what} of the slot's type`);
    else if (!assignable(from, to)) bad("bound", path, `the ${what} admits a value outside the slot's type`);
  };

  // ------------------------------------------------------------ guards (section 6.5)

  const indexes: RangeIndex[] = [];

  const guard = (v: unknown, path: string, ctx: Ctx): void => {
    const f = form(v, path, GUARDS, ["of", "ifPresent"]);
    if (!f) return;
    const [k, x] = f;
    const o = v as Rec;
    const p = at(path, k);
    if ("of" in o && subject(o["of"], at(path, "of"), ctx, true) === null) return;
    /** The subject as an item this guard reads. The item an `open` act opens has nothing to read yet. */
    const item = (): Type | null => {
      const s = subject(o["of"], path, ctx, false);
      if (s === null || s === "scope") return null;
      if (ctx.nascent && onSubject(o["of"])) return bad("nascent-guard", path, "a guard may not read the item its act opens");
      return s;
    };
    let namesField = false;
    const pair = (e: unknown, ep: string, a: (v: unknown, path: string) => string | null) => {
      const r = rec(e, ep, ["a", "b"]);
      if (!r) return;
      // Section 6.5: each operand is validated by itself. A valid first operand excuses nothing about the second.
      const forms = [a(r["a"], at(ep, "a")), operand(r["b"], at(ep, "b"), ctx, item)];
      if (forms.includes("field")) namesField = true;
    };
    switch (k) {
      case "state": {
        const t = item();
        if (t && names(x, p, t.states, "state").every((s) => t.states.get(s) === false)) ctx.live.add((o["of"] as string | undefined) ?? "on");
        break;
      }
      case "signer": case "notIn": {
        if (!ctx.signer) bad("name", p, "there is no signer here");
        const t = item();
        if (t) names(x, p, { has: (s) => t.slots.get(s)?.kind === "party" }, "party slot");
        break;
      }
      case "set": case "unset": {
        const t = item();
        if (t && (typeof x !== "string" || !t.slots.has(x))) bad("name", p, "names no slot");
        break;
      }
      case "equals": case "differs":
        pair(x, p, (a, ap) => operand(a, ap, ctx, item));
        break;
      case "some": case "none": case "count": {
        const r = rec(x, p, ["type", "states"], k === "count" ? ["where", "min", "max"] : ["where"]);
        if (!r) break;
        const t = typeof r["type"] === "string" ? types.get(r["type"]) : undefined;
        if (!t) { bad("name", at(p, "type"), "names no item type"); break; }
        names(r["states"], at(p, "states"), t.states, "state");
        const slots = new Set<string>();
        list(r["where"] ?? [], at(p, "where"), bounds.guards).forEach((w, i) => {
          const wo = rec(w, at(at(p, "where"), i), ["equals"]);
          const eq = wo && rec(wo["equals"], at(at(p, "where"), i), ["a", "b"]);
          if (!eq) return;
          // In a `where`, a slot is a slot of each item the range covers.
          for (const side of ["a", "b"]) if (operand(eq[side], at(at(at(p, "where"), i), side), ctx, () => t) === "slot") slots.add((eq[side] as Rec)["slot"] as string);
        });
        if (slots.size > 0 || (Array.isArray(r["where"]) && r["where"].length > 0)) indexes.push({ path: p, type: t.name, slots: [...slots].sort() });
        if (k === "count") {
          const min = "min" in r ? int(r["min"], at(p, "min")) : undefined;
          const max = "max" in r ? int(r["max"], at(p, "max")) : undefined;
          if (min === undefined && max === undefined) bad("shape", p, "a count needs a min or a max");
          if (typeof min === "number" && typeof max === "number" && min > max) bad("shape", p, "min is above max");
        }
        break;
      }
      case "every": {
        const r = rec(x, p, ["list", "states"]);
        if (!r) break;
        // A field of that name, when the act has one; otherwise a slot of the subject.
        let type = fieldOf({ field: r["list"] }, ctx);
        if (type) namesField = true;
        else {
          const t = item();
          if (!t) break;
          type = (typeof r["list"] === "string" && t.slots.get(r["list"])?.type) || null;
        }
        const of = type?.type === "list" && type.of.type === "item" ? types.get(type.of.of) : undefined;
        if (!of) bad("name", at(p, "list"), "names no field or slot that is a list of items");
        else names(r["states"], at(p, "states"), of.states, "state");
        break;
      }
      case "fact": {
        const r = rec(x, p, ["field"], ["where"]);
        if (!r) break;
        namesField = true;
        if (fieldOf(r, ctx)?.type !== "fact") bad("name", at(p, "field"), "names no field of type fact");
        // `a` is a field of the foreign intent, which this definition cannot resolve; `b` is read in this act.
        list(r["where"] ?? [], at(p, "where"), bounds.guards).forEach((w, i) => {
          const wo = rec(w, at(at(p, "where"), i), ["equals"]);
          if (wo) pair(wo["equals"], at(at(p, "where"), i), (a, ap) => (isObject(a) && Object.keys(a).length === 1 && typeof a["field"] === "string" ? null : bad("shape", ap, "must be a field of the foreign intent")));
        });
        break;
      }
      case "before": case "after": {
        const r = rec(x, p, ["slot"]);
        const t = r && item();
        const s = t && typeof r["slot"] === "string" ? t.slots.get(r["slot"]) : undefined;
        if (t && !(s?.kind === "value" && s.type.type === "time")) bad("name", p, "names no value slot of type time");
        break;
      }
      case "rule":
        if (typeof x !== "string" || !rules.has(x)) bad("rule", p, "names no rule the definition declares");
        break;
    }
    if ("ifPresent" in o && (bool(o["ifPresent"], at(path, "ifPresent")) === null || !namesField)) bad("shape", at(path, "ifPresent"), "is for a guard that names a field");
  };

  // ------------------------------------------------------------ effects (section 6.6)

  /** One effect. `later`: it runs in a later entry, as a result clause does. Returns what it sets, for the conflict check. */
  const effect = (v: unknown, path: string, ctx: Ctx, later: boolean): string | null => {
    const f = form(v, path, EFFECTS, ["of"]);
    if (!f) return null;
    const [k, x] = f;
    const of = (v as Rec)["of"];
    const p = at(path, k);
    const s = subject(of, at(path, "of"), ctx, false);
    if (s === null || s === "scope") return null;
    const nascent = ctx.nascent && !later && onSubject(of);
    const sk = (of as string | undefined) ?? "on";
    const slot = (name: unknown, kind: Slot["kind"]): Slot | null => {
      const found = typeof name === "string" ? s.slots.get(name) : undefined;
      if (found?.kind !== kind) return bad("name", p, `names no ${kind} slot of ${s.name}`);
      // Section 6.3: a fixed slot is set by the act that opens the item and never again.
      return found.fixed && !nascent ? bad("fixed", p, "a fixed slot is set only by the act that opens its item") : found;
    };
    switch (k) {
      case "state":
        if (typeof x !== "string" || !s.states.has(x)) return bad("name", p, `names no state of ${s.name}`);
        // Section 6.3: an item in a final state refuses every transition. A later clause is checked when it runs.
        if (nascent ? s.states.get(s.initial) : !later && !ctx.live.has(sk)) bad("final", p, "a state effect needs a `state` guard on its subject that lists no final state");
        return `the state of ${sk}`;
      case "party": {
        const r = rec(x, p, ["slot", "from"], ["list"]);
        const sl = r && slot(r["slot"], "party");
        if (!r || !sl) return null;
        const from = r["from"];
        if ("list" in r && (!sl.list || from === null || (r["list"] !== "add" && r["list"] !== "remove"))) bad("shape", at(p, "list"), "is add or remove, of a member, on a list slot");
        if (ctx.timed && r["list"] === "add") bad("timed-partial", p, "a timed rule adds to no party list: a full list would refuse the transition");
        if (!("list" in r) && sl.list && from !== null) bad("shape", p, "a list slot takes add or remove, or null to empty it");
        if (isObject(from) && "fact" in from) {
          if (rec(from, at(p, "from"), ["fact", "field"]) && (fieldOf({ field: from["fact"] }, ctx)?.type !== "fact" || typeof from["field"] !== "string")) bad("name", at(p, "from"), "names no field of type fact");
        } else if (from !== null) {
          const fk = form(from, at(p, "from"), ["signer", "field", "slot"]);
          if (fk?.[0] === "slot") {
            const other = typeof fk[1] === "string" ? s.slots.get(fk[1]) : undefined;
            if (other?.kind !== "party" || other.list) bad("name", at(p, "from"), "names no party slot that holds one member");
          } else if (fk && operand(from, at(p, "from"), ctx, () => null) === "field" && ctx.fields && fieldOf(from, ctx)?.type !== "member") bad("name", at(p, "from"), "names no field of type member");
        }
        return `slot ${String(r["slot"])} of ${sk}`;
      }
      case "ref": {
        const r = rec(x, p, ["slot", "from"]);
        const sl = r && slot(r["slot"], "ref");
        if (!r || !sl) return null;
        const from = r["from"];
        if (from === "self") {
          // Section 6.4: `self` is a local reference to the entry being written, and so to the item it opens.
          if (!ctx.nascent || later || !ctx.on || !assignable({ type: "item", of: ctx.on.name }, sl.type)) bad("name", at(p, "from"), "self is the item this entry opens, in a slot that refers to an item of that type");
        } else if (from !== null) {
          const fk = form(from, at(p, "from"), ["field", "slot"]);
          // A slot source is any slot of the subject, of whatever kind: the effect reads the slot of that name.
          if (fk?.[0] === "slot") copy(typeof fk[1] === "string" ? s.slots.get(fk[1])?.type : undefined, sl.type, at(p, "from"), "slot");
          else if (fk && ctx.fields) copy(fieldOf(from, ctx), sl.type, at(p, "from"), "field");
        }
        return `slot ${String(r["slot"])} of ${sk}`;
      }
      case "value": {
        const r = rec(x, p, ["slot", "from"]);
        const sl = r && slot(r["slot"], "value");
        if (!r || !sl) return null;
        const fk = form(r["from"], at(p, "from"), ["field", "const", "time"]);
        if (fk?.[0] === "field" && ctx.fields) copy(fieldOf(r["from"], ctx), sl.type, at(p, "from"), "field");
        if (fk?.[0] === "const" && !isValue(sl.type, fk[1], bounds)) bad("shape", at(p, "from"), "is not a value of the slot's type");
        if (fk?.[0] === "time") {
          const t = rec(fk[1], at(p, "from"), ["plusSeconds"]);
          // No offset is longer than the whole span a timestamp can name. So the sum with any reading is a number the runtime can
          // compare with that span, and effect derivation refuses a time past it; nothing throws.
          const plus = t && int(t["plusSeconds"], at(p, "from"));
          if (typeof plus === "number" && plus * 1000 > LAST_MS) bad("bound", at(p, "from"), "is longer than the span a timestamp can name");
          // Section 6.4: a timed rule's effects are total. A time derived from the commit clock can pass the last timestamp, which the
          // commit would refuse; and a timed rule ends its deadline by leaving its states, not by moving it.
          if (ctx.timed) bad("timed-partial", p, "a timed rule sets no time from the commit clock");
          if (sl.type.type !== "time") bad("name", p, "the commit time goes in a slot of type time");
        }
        return `slot ${String(r["slot"])} of ${sk}`;
      }
      case "attribute": {
        const r = rec(x, p, ["slot", "of"]);
        const sl = r && slot(r["slot"], "party");
        if (!r || !sl) return null;
        if (!sl.list) bad("name", p, "attribution fills a party list");
        if (ctx.timed) bad("timed-partial", p, "a timed rule takes no attribution: a full list would refuse the transition");
        subject(r["of"], at(p, "of"), ctx, false);
        return `slot ${String(r["slot"])} of ${sk}`;
      }
      default: {
        const r = rec(x, p, ["do"], ["extent"]);
        if (!r) return null;
        if (!holds) bad("capability", p, "the definition does not list hold@1");
        // Section 4.1: a hold is opened by an `open` act whose primary item is the hold. Any other opening would be a second item.
        if (r["do"] === "open") { if (!nascent || ctx.timed) bad("one-item", p, "a hold is opened only as the primary item of an open act"); }
        else if (r["do"] !== "renew" && r["do"] !== "end") bad("shape", at(p, "do"), "is open, renew or end");
        else if (!holdTypes.has(s.name)) bad("hold", p, `${s.name} is not a type that a hold: open effect targets`);
        else if (r["do"] === "renew" && (ctx.timed || nascent)) bad("hold", p, "a hold is renewed by an act on the hold");
        if ("extent" in r) {
          const e = form(r["extent"], at(p, "extent"), ["field", "slot"]);
          if (e) operand(r["extent"], at(p, "extent"), ctx, () => s);
        }
        return `the hold of ${sk}`;
      }
    }
  };

  const effects = (v: unknown, path: string, ctx: Ctx, later: boolean): void => {
    const set = new Set<string>();
    list(v, path, bounds.effects).forEach((e, i) => {
      const what = effect(e, at(path, i), ctx, later);
      if (what === null) return;
      if (ctx.timed && isObject(e) && !onSubject(e["of"])) bad("timed", at(path, i), "a timed rule changes its own item only");
      // Section 6.3: no two effects set the same slot of the same subject, or its state.
      if (set.has(what)) bad("conflict", at(path, i), `another effect also sets ${what}`);
      set.add(what);
    });
  };

  // ------------------------------------------------------------ sends and attention (section 6.6)

  /** A send's source: `self`, or an operand whose slot is a slot of the primary item. Returns its type when the definition states it. */
  const source = (v: unknown, path: string, ctx: Ctx): FieldType | null => {
    if (v === "self") return null;
    const k = operand(v, path, ctx, () => ctx.on ?? bad("name", path, "there is no primary item whose slot this could be"));
    return k === "field" ? fieldOf(v, ctx) : k === "slot" ? (ctx.on?.slots.get((v as Rec)["slot"] as string)?.type ?? null) : null;
  };
  const sources = (v: unknown, path: string, ctx: Ctx) => { for (const [name, s] of entries(v, path, bounds.listElements)) source(s, at(path, name), ctx); };
  const clauses = (v: unknown, path: string, ctx: Ctx, conflict: boolean) => {
    const r = rec(v, path, [], ["applied", "refused", "superseded", "undelivered", ...(conflict ? ["conflict"] : [])]);
    for (const [name, e] of Object.entries(r ?? {})) effects(e, at(path, name), ctx, true);
  };

  const sends = (v: unknown, path: string, ctx: Ctx): void => {
    const relations = new Set<string>();
    list(v, path, bounds.sends).forEach((s, i) => {
      const f = form(s, at(path, i), ["create", "tell", "relate", "index"]);
      if (!f) return;
      const [k, x] = f;
      const p = at(at(path, i), k);
      const before = problems.length;
      if (k === "create") {
        const r = rec(x, p, ["kind", "definition", "fields", "result"]);
        if (!r) return;
        if (!SCOPE_KINDS.includes(r["kind"] as never)) bad("shape", at(p, "kind"), "is not a scope kind");
        if (!isDigest(r["definition"]) && !(typeof r["definition"] === "string" && /^platform:(directory|membership|rules|destination|inbox|task)@(0|[1-9][0-9]*)$/.test(r["definition"]))) bad("shape", at(p, "definition"), "is a definition digest or a platform definition");
        sources(r["fields"], at(p, "fields"), ctx);
        clauses(r["result"], at(p, "result"), ctx, true);
      } else if (k === "tell") {
        const r = rec(x, p, ["to", "message", "fields", "result"]);
        if (!r) return;
        if (source({ slot: r["to"] }, at(p, "to"), ctx)?.type !== "scope") bad("name", at(p, "to"), "names no slot of the primary item that holds a scope");
        if (str(r["message"], at(p, "message")) !== null && keptMessage(r["message"] as string)) bad("handler", at(p, "message"), "is a name the platform keeps for a relate or an advisory");
        sources(r["fields"], at(p, "fields"), ctx);
        clauses(r["result"], at(p, "result"), ctx, false);
      } else if (k === "relate") {
        const r = rec(x, p, ["to", "name", "item", "state", "detail", "result"]);
        if (!r) return;
        const to = source(r["to"], at(p, "to"), ctx);
        if (r["to"] === "self" || (to ? to.type !== "scope" : !(isObject(r["to"]) && "field" in r["to"] && !ctx.fields))) bad("name", at(p, "to"), "names no field or slot that holds a scope");
        const item = source(r["item"], at(p, "item"), ctx);
        if (r["item"] === "self" ? !ctx.nascent : item ? item.type !== "item" : !(isObject(r["item"]) && "field" in r["item"] && !ctx.fields)) bad("name", at(p, "item"), "names no local item: self in an open act, or a field or slot that holds an item");
        str(r["name"], at(p, "name"));
        str(r["state"], at(p, "state"));
        sources(r["detail"], at(p, "detail"), ctx);
        clauses(r["result"], at(p, "result"), ctx, false);
        if (problems.length !== before) return;
        // Section 6.4: no two `relate` sends written with the same `to`, `item` and `name`.
        const key = canonicalize([r["to"], r["item"], r["name"]]);
        if (relations.has(key)) bad("duplicate-relation", p, "another relate send of this entry is written with the same to, item and name");
        relations.add(key);
      } else {
        const r = rec(x, p, ["fields"]);
        if (r) sources(r["fields"], at(p, "fields"), ctx);
      }
    });
  };

  const attention = (v: unknown, path: string, ctx: Ctx): void => {
    list(v, path, bounds.attention).forEach((n, i) => {
      const o = rec(n, at(path, i), ["notify"]);
      const r = o && rec(o["notify"], at(path, i), ["slot", "of", "when", "reason"]);
      if (!r) return;
      const s = subject(r["of"], at(path, i), ctx, false);
      if (s && s !== "scope" && !(typeof r["slot"] === "string" && s.slots.get(r["slot"])?.kind === "party")) bad("name", at(path, i), "names no party slot");
      if (r["when"] !== "before" && r["when"] !== "after") bad("shape", at(path, i), "when is before or after");
      str(r["reason"], at(path, i));
    });
  };

  const also = (v: unknown, path: string, fields: Map<string, FieldType> | null): Map<string, Type> => {
    const out = new Map<string, Type>();
    for (const [name, a] of entries(v, path, bounds.also)) {
      // The intent's `expected` has the key `on` for the primary item, so no other item may take that name.
      if (name === "on") bad("shape", at(path, name), "an also entry is not named on");
      const o = rec(a, at(path, name), ["item", "by"]);
      const t = o && typeof o["item"] === "string" ? types.get(o["item"]) : undefined;
      if (!o) continue;
      if (!t) { bad("name", at(path, name), "names no item type"); continue; }
      const by = typeof o["by"] === "string" ? fields?.get(o["by"]) : undefined;
      // Section 6.4: each `also` entry names a field of type `item`, and its type must match.
      if (typeof o["by"] !== "string" || (fields && !(by?.type === "item" && by.of === t.name))) bad("name", at(path, name), "must be named by a field of type item, of that type");
      out.set(name, t);
    }
    return out;
  };

  // ------------------------------------------------------------ acts, handlers and timed rules (sections 6.4 and 5.2)

  const acts = isObject(top["acts"]) ? top["acts"] : {};
  const timed = isObject(top["timed"]) ? top["timed"] : {};
  // The hold types are needed before any effect is read: a `hold: open` effect on the primary item of an `open` act.
  const holdTypes = new Set<string>();
  for (const a of Object.values(acts)) if (isObject(a) && a["step"] === "open" && typeof a["on"] === "string" && holdDoes(a["effects"], "open")) holdTypes.add(a["on"]);

  for (const [name, v] of entries(top["acts"], "acts", bounds.acts)) {
    const path = at("acts", name);
    const o = rec(v, path, ["step", "on", "also", "fields", "grant", "guards", "effects", "sends", "attention"]);
    if (!o) continue;
    const step = o["step"];
    if (step !== "open" && step !== "transition" && step !== "comment") bad("shape", at(path, "step"), "is open, transition or comment");
    const on = typeof o["on"] === "string" ? (types.get(o["on"]) ?? null) : null;
    if (o["on"] !== null && !on) bad("name", at(path, "on"), "names no item type");
    if (o["on"] === null && step !== "comment") bad("shape", at(path, "on"), "an open or a transition has a primary item type");
    str(o["grant"], at(path, "grant"));
    const fields = new Map<string, FieldType>();
    for (const [f, fv] of entries(o["fields"], at(path, "fields"), null)) {
      const p = at(at(path, "fields"), f);
      const type = fieldType(fv, p, ["required", "default"]);
      if (!type) continue;
      const fo = fv as Rec;
      if (bool(fo["required"], at(p, "required")) === null) continue;
      // Section 6.2: an optional field may have a default.
      if ("default" in fo && (fo["required"] === true || !isValue(type, fo["default"], bounds))) bad("shape", at(p, "default"), "is a value of the field's type, on an optional field");
      fields.set(f, type);
    }
    const ctx: Ctx = { on, also: also(o["also"], at(path, "also"), fields), nascent: step === "open", fields, signer: true, timed: false, live: new Set() };
    // Section 6.4: a comment changes no item and meets no guard.
    if (step === "comment") for (const k of ["guards", "effects", "sends"]) if (!Array.isArray(o[k]) || o[k].length > 0) bad("shape", at(path, k), "a comment has none");
    if (step === "comment" && ctx.also.size > 0) bad("shape", at(path, "also"), "a comment names no other item");
    list(o["guards"], at(path, "guards"), bounds.guards).forEach((g, i) => guard(g, at(at(path, "guards"), i), ctx));
    effects(o["effects"], at(path, "effects"), ctx, false);
    sends(o["sends"], at(path, "sends"), ctx);
    attention(o["attention"], at(path, "attention"), ctx);
    if (step === "open" && on) {
      const set = new Set(Array.isArray(o["effects"]) ? o["effects"].map(setsSlot) : []);
      // Section 6.3: an opening sets every required slot.
      for (const [s, slot] of on.slots) if (slot.required && !slot.hasDefault && !set.has(s)) bad("required-unset", at(path, "effects"), `no effect sets the required slot ${s}`);
      // Section 6.8, as far as this step needs it: the hold's end is a time slot under a timed rule that ends the hold, set at the opening.
      if (holdDoes(o["effects"], "open") && !Object.values(timed).some((r) => isObject(r) && r["on"] === on.name && holdDoes(r["effects"], "end") && set.has(r["deadline"]))) {
        bad("hold", at(path, "effects"), "an act that opens a hold sets the deadline slot of a timed rule that ends it");
      }
    }
  }

  const handled = new Set<string>();
  for (const [name, v] of entries(top["receives"], "receives", bounds.receives)) {
    const path = at("receives", name);
    const o = rec(v, path, ["message", "from", "also", "guards", "effects", "sends", "attention"]);
    if (!o) continue;
    str(o["message"], at(path, "message"));
    const from = rec(o["from"], at(path, "from"), ["kind"], ["under"]);
    // One message from one kind of scope runs one handler, so the handler an entry ran is found again from the entry alone.
    const key = canonicalize([String(o["message"]), String(from?.["kind"])]);
    if (handled.has(key)) bad("handler", path, "another handler receives this message from this kind of scope");
    handled.add(key);
    if (from && (!SCOPE_KINDS.includes(from["kind"] as never) || ("under" in from && str(from["under"], at(path, "from")) === null))) bad("shape", at(path, "from"), "is a scope kind, and a definition name");
    // A handler has no signer and opens no item; its message fields are not declared, so a field name is not resolved.
    const ctx: Ctx = { on: null, also: also(o["also"], at(path, "also"), null), nascent: false, fields: null, signer: false, timed: false, live: new Set() };
    list(o["guards"], at(path, "guards"), bounds.guards).forEach((g, i) => guard(g, at(at(path, "guards"), i), ctx));
    effects(o["effects"], at(path, "effects"), ctx, false);
    sends(o["sends"], at(path, "sends"), ctx);
    attention(o["attention"], at(path, "attention"), ctx);
  }

  const timedTypes = new Set<string>(holdTypes);
  for (const [name, v] of entries(top["timed"], "timed", null)) {
    const path = at("timed", name);
    const o = rec(v, path, ["on", "states", "deadline", "effects", "attention"]);
    if (!o) continue;
    const t = typeof o["on"] === "string" ? types.get(o["on"]) : undefined;
    if (!t) { bad("name", at(path, "on"), "names no item type"); continue; }
    timedTypes.add(t.name);
    const states = names(o["states"], at(path, "states"), t.states, "state");
    // Section 5.2: a deadline is held by a live item.
    if (states.some((s) => t.states.get(s) === true)) bad("timed", at(path, "states"), "a timed rule applies in live states only");
    const deadline = typeof o["deadline"] === "string" ? t.slots.get(o["deadline"]) : undefined;
    if (!(deadline?.kind === "value" && deadline.type.type === "time")) bad("name", at(path, "deadline"), "names no value slot of type time");
    const ctx: Ctx = { on: t, also: new Map(), nascent: false, fields: new Map(), signer: false, timed: true, live: new Set(["on"]) };
    // Section 6.4: a timed rule's effects are total. With no field, no signer and no other subject, what is left that a commit
    // could refuse is an effect that needs room in a party list, or a time derived from the commit clock, and `effect` refuses
    // each as `timed-partial`.
    effects(o["effects"], at(path, "effects"), ctx, false);
    // Otherwise the transition would be due again as soon as it was applied, and the drain would never end.
    if (!(Array.isArray(o["effects"]) && o["effects"].some((e) => isObject(e) && typeof e["state"] === "string" && !states.includes(e["state"])))) bad("timed", at(path, "effects"), "a timed rule takes its item out of the rule's states");
    attention(o["attention"], at(path, "attention"), ctx);
  }

  for (const name of holdTypes) {
    const t = types.get(name);
    if (!t) continue;
    const holder = t.slots.get("holder");
    const under = t.slots.get("under");
    if (!(holder?.kind === "party" && !holder.list)) bad("hold", at("items", name), "a hold type has a party slot `holder` that holds one member");
    if (under && !(under.kind === "ref" && under.type.type === "item")) bad("hold", at("items", name), "a hold's `under` is a reference to a local item");
  }

  // Section 6.4: a genesis opens no timed item.
  const genesis = typeof top["genesis"] === "string" ? acts[top["genesis"]] : undefined;
  if (!isObject(genesis) || genesis["step"] !== "open") bad("genesis", "genesis", "names no open act");
  else if (timedTypes.has(genesis["on"] as string) || (Array.isArray(genesis["effects"]) && genesis["effects"].some((e) => isObject(e) && "hold" in e))) {
    bad("genesis-timed", "genesis", "the genesis act opens a timed item type or has a hold effect");
  }

  if (problems.length > 0) return { ok: false, problems };
  const declared = input as DeclaredDefinition;
  // Section 5.2: a due transition is always written, so its entry must fit whatever its item holds by then.
  for (const [name, rule] of Object.entries(declared.timed)) {
    const most = timedEntryBytes(name, rule, declared.items[rule.on]!, bounds);
    if (most > bounds.entryBytes) bad("bound", at("timed", name), `its entry could take ${most} bytes; at most ${bounds.entryBytes}`);
  }
  if (problems.length > 0) return { ok: false, problems };
  try {
    return { ok: true, definition: { declared, digest: definitionDigest(declared), timedTypes: [...timedTypes].sort(), holdTypes: [...holdTypes].sort(), indexes } };
  } catch {
    return { ok: false, problems: [{ code: "shape", path: "", message: "has no canonical bytes" }] };
  }
}

// ---------------------------------------------------------------- the size of a timed entry (sections 5.2 and 7.5)

/** The canonical bytes of a value that the definition states. */
const stated = (v: unknown): number => utf8(canonicalize(v)).length;

/** More than the canonical bytes of a scope reference, and of a fact reference. */
const SCOPE_BYTES = 160;
const FACT_BYTES = SCOPE_BYTES + 128;
/** More than the bytes of one effect record without the values it carries, and of an entry without its effects and its rule's name. */
const RECORD_BYTES = 128;
const ENTRY_BYTES = 768;

/** The most bytes a member reference takes: each byte of a handle may be written as a six-byte escape. */
const memberBytes = (bounds: Bounds): number => SCOPE_BYTES + 64 + 6 * bounds.memberBytes;

/** The most canonical bytes a value of that type takes. */
function mostBytes(type: FieldType, bounds: Bounds): number {
  switch (type.type) {
    case "text": return 2 + 6 * type.max;
    case "int": return 20;
    case "bool": return 5;
    case "time": return 26;
    case "enum": return Math.max(2, ...type.of.map(stated));
    case "member": return memberBytes(bounds);
    case "item": return 20;
    case "fact": return FACT_BYTES;
    case "scope": return SCOPE_BYTES;
    case "digest": return 73;
    case "commit": case "tree": return 66;
    case "list": return 2 + Math.min(type.max, bounds.listElements) * (1 + mostBytes(type.of, bounds));
  }
}

/**
 * An upper bound on the canonical bytes of the entry a timed rule writes,
 * whatever its item holds. A timed rule has no field and no signer, so each
 * effect carries a name or a constant the definition states, or a copy of a
 * slot, which its type bounds. Attention lists the members of a party slot,
 * each within the bound of a handle, with a reason the definition states.
 */
function timedEntryBytes(name: string, rule: TimedRule, type: ItemType, bounds: Bounds): number {
  const slotType = (slot: string): FieldType | null => type.refs[slot]?.to ?? type.values[slot]?.of ?? (type.parties[slot] ? { type: "member" } : null);
  const held = (slot: string): number => { const t = slotType(slot); return t ? mostBytes(t, bounds) : 0; };
  const listed = (slot: string): number => (type.parties[slot]?.list ? Math.min(type.parties[slot]!.max ?? bounds.listElements, bounds.listElements) : 1);
  let bytes = ENTRY_BYTES + stated(name);
  for (const e of rule.effects) {
    bytes += RECORD_BYTES;
    if ("state" in e) bytes += stated(e.state);
    else if ("party" in e) bytes += stated(e.party.slot) + memberBytes(bounds);
    else if ("ref" in e) bytes += stated(e.ref.slot) + (e.ref.from !== null && e.ref.from !== "self" && "slot" in e.ref.from ? held(e.ref.from.slot) : 20);
    else if ("value" in e) bytes += stated(e.value.slot) + ("const" in e.value.from ? stated(e.value.from.const) : 26);
  }
  for (const { notify } of rule.attention) bytes += RECORD_BYTES + stated(notify.reason) + listed(notify.slot) * (1 + memberBytes(bounds));
  return bytes;
}
