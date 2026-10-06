/**
 * How the validator reads untrusted data, and what it reports (scope
 * contract, section 6). Every family of forms reads a definition through
 * these readers. Each records a problem and goes on, so that one run
 * reports every problem it can.
 */

import type { Bounds } from "@generalbusiness/artroom-contract";
import { isObject } from "../values.ts";

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
  | "reserve-unbounded"  // what a duty can start is not finite: timed rules of one type that lead to one another in a cycle (section 17.2); kinds that no item holds and that open each other in a circle, or one that reaches a held kind (section 17.2a, checks 4 and 5)
  | "hold"               // the hold capability used without what it needs (section 6.8)
  | "holds"              // a `holds` or an `adds` that is stated ill, or a type that states `holds` and is opened by an entry that is not new work (section 17.2a, checks 1 and 2). No scope is founded under such data: `unsupported-definition`
  | "handler"            // two handlers for one class and message from one kind of scope
  | "advisory-sends"     // a handler of class `advisory` declares a send or a notice (section 6.4)
  | "fan-out-unbounded"  // a fan-out over a final state or over a type whose `max` is past the bound, or a second fan-out in one list (section 6.6)
  | "attention-unbounded" // the attention forms of one act, handler or timed rule could tell more members than one entry may (section 6.6)
  | "redactable-read"    // a guard, a rule, a send to a scope that is no lane, or an index send reads a detached text (section 6.2)
  | "capability" | "profile" | "rule";

export interface Problem { code: ProblemCode; path: string; message: string }

export type Rec = Record<string, unknown>;

/** The path of a member: the path of what holds it, a dot, and its name or position. */
export const at = (path: string, key: string | number) => (path === "" ? String(key) : `${path}.${key}`);

/** The readers of one validation, over one list of problems. */
export function shapes(bounds: Bounds) {
  const problems: Problem[] = [];
  const bad = (code: ProblemCode, path: string, message: string): null => {
    problems.push({ code, path, message });
    return null;
  };

  /** An object with every required key and no key outside the two lists. */
  const rec = (v: unknown, path: string, required: readonly string[], optional: readonly string[] = []): Rec | null => {
    if (!isObject(v)) return bad("shape", path, "must be an object");
    let ok = true;
    for (const k of required) if (!Object.hasOwn(v, k)) ok = bad("shape", at(path, k), "is missing") ?? false;
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
    if (Object.hasOwn(v, "")) bad("shape", path, "has an empty name");
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

  return { problems, bad, rec, form, entries, list, str, int, bool, names };
}

export type Shapes = ReturnType<typeof shapes>;
