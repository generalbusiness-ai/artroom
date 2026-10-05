/**
 * Capability forms, as the validator reads them (scope contract, section
 * 6.11): the capabilities a definition lists, a `capability` guard and
 * effect, the part `carried`, and the kind of a preparation entry. Each is
 * checked against what the listed version declares, in the contract
 * package's `CAPABILITIES`. A form that names what the version does not
 * declare is refused, as `capability`.
 *
 * The validator reads these forms and derives none. For each one it adds a
 * line to `underived`: what a runtime needs the capability's own code for.
 * A runtime that lacks that code answers `unsupported-definition` for the
 * whole definition (section 6.1).
 */

import type { Capability, CapabilityName } from "@generalbusiness/artroom-contract";
import { declaredBy } from "../capability.ts";
import { isObject, own } from "../values.ts";
import type { Ctx, Defining, Type } from "./context.ts";
import { range } from "./guards.ts";
import { operand } from "./operands.ts";
import { at } from "./shape.ts";

/**
 * One form of a definition that this package does not derive by itself,
 * with the capability version whose code derives it. `listed`: the version
 * is in the list, and no part of it is derived here. `kind`: a fact type
 * names the entries of a preparation step, which only the capability writes.
 */
export interface Underived { path: string; capability: CapabilityName; form: "listed" | "guard" | "effect" | "carried" | "kind"; name: string }

/** The versions whose item form this package derives (section 6.8). Listing one of them alone needs no other code. */
const ITEM_FORMS: readonly string[] = ["hold@1"];

/** The capabilities a definition lists (section 6.1): each a version that the contract's tables have, and each name once. */
export function capabilities(d: Defining, v: unknown): void {
  const { bad, rec, list } = d;
  list(v, "capabilities", 2).forEach((c, i) => {
    const p = at("capabilities", i);
    const o = rec(c, p, ["name", "version"]);
    if (!o) return;
    const version = `${String(o["name"])}@${String(o["version"])}`;
    if (typeof o["name"] !== "string" || !Number.isSafeInteger(o["version"]) || !declaredBy(version)) { bad("capability", p, "is not a capability version the contract declares"); return; }
    if (d.capabilities.has(o["name"])) { bad("capability", p, "is listed twice"); return; }
    d.capabilities.set(o["name"], version as CapabilityName);
    if (version === "hold@1") d.holds = true;
    if (!ITEM_FORMS.includes(version)) d.underived.push({ path: p, capability: version as CapabilityName, form: "listed", name: version });
  });
}

/** The listed version of the capability a form names, with what it declares. Null: the definition does not list it, which is reported. */
function listed(d: Defining, name: unknown, path: string): { version: CapabilityName; declared: Capability } | null {
  const version = typeof name === "string" ? d.capabilities.get(name) : undefined;
  const declared = version && declaredBy(version);
  return version && declared ? { version, declared } : d.bad("capability", path, "names no capability that the definition lists");
}

/**
 * A `capability` guard (section 6.5): a guard that the listed version
 * declares, with arguments that it names. An argument is an operand; or one
 * value for each element of a list; or one slot of each item a range covers.
 * `item`: the guard's own subject, whose slot an operand with no `of` reads.
 */
export function capabilityGuard(d: Defining, x: unknown, p: string, ctx: Ctx, item: () => Type | null): void {
  const { bad, rec, entries, str } = d;
  const r = rec(x, p, ["name", "guard", "with"]);
  const cap = r && listed(d, r["name"], at(p, "name"));
  if (!r || !cap) return;
  const declared = typeof r["guard"] === "string" ? own(cap.declared.guards, r["guard"]) : undefined;
  if (!declared) { bad("capability", at(p, "guard"), `is not a guard that ${cap.version} declares`); return; }
  for (const [name, arg] of entries(r["with"], at(p, "with"), null)) {
    const ap = at(at(p, "with"), name);
    if (!declared.with.includes(name)) bad("capability", ap, `is not an argument of the guard ${String(r["guard"])} of ${cap.version}`);
    else if (isObject(arg) && "each" in arg) {
      const e = rec(arg, ap, ["each", "as", "value"]);
      const read = e && operand(d, e["each"], at(ap, "each"), ctx, item);
      const as = e && str(e["as"], at(ap, "as"));
      if (!e || !read || !as) continue;
      if (as.includes(".")) bad("shape", at(ap, "as"), "a dot names a member of a record element, so the name has none");
      else if (read.type !== null && read.type.type !== "list") bad("name", at(ap, "each"), "names no list");
      else operand(d, e["value"], at(ap, "value"), { ...ctx, elements: new Map(ctx.elements).set(as, read.type?.type === "list" ? read.type.of : null) }, item);
    } else if (isObject(arg) && "items" in arg) {
      const e = rec(arg, ap, ["items", "slot"]);
      const items = e && range(d, e["items"], at(ap, "items"), ctx);
      if (items && !(typeof e["slot"] === "string" && items.type.slots.has(e["slot"]))) bad("name", at(ap, "slot"), `names no slot of ${items.type.name}`);
    } else operand(d, arg, ap, ctx, item);
  }
  d.underived.push({ path: p, capability: cap.version, form: "guard", name: String(r["guard"]) });
}

/**
 * A `capability` effect (section 6.6): an effect that the listed version
 * declares, with one of the sets of arguments that its table allows, or a
 * part of one. Each argument is an operand. It changes the capability's own
 * records and no item, so it needs no subject: `owner` gives the item whose
 * slot an operand with no `of` reads, when the form has one.
 */
export function capabilityEffect(d: Defining, x: unknown, p: string, ctx: Ctx, owner: () => Type | null): void {
  const { bad, rec, entries } = d;
  const r = rec(x, p, ["name", "do", "with"]);
  const cap = r && listed(d, r["name"], at(p, "name"));
  if (!r || !cap) return;
  const declared = typeof r["do"] === "string" ? own(cap.declared.effects, r["do"]) : undefined;
  if (!declared) { bad("capability", at(p, "do"), `is not an effect that ${cap.version} declares`); return; }
  const written = entries(r["with"], at(p, "with"), null);
  if (!declared.with.some((allowed) => written.every(([name]) => allowed.includes(name)))) bad("capability", at(p, "with"), `is no set of arguments that the effect ${String(r["do"])} of ${cap.version} takes`);
  for (const [name, arg] of written) operand(d, arg, at(at(p, "with"), name), ctx, owner, false);
  // Section 6.4: a timed rule's effects are total, and what a capability's effect does is not this package's to show.
  if (ctx.timed) bad("timed-partial", p, "a timed rule has no capability effect");
  d.underived.push({ path: p, capability: cap.version, form: "effect", name: String(r["do"]) });
}

/**
 * The part `{ carried }` (section 6.5): a member of a capability record that
 * the entry's effects hold, written `kind.member`. The kind is a record of
 * one listed capability. The contract's tables give a record's values in
 * prose, so the member is any name. Returns false when it is refused.
 */
export function carried(d: Defining, v: unknown, path: string): boolean {
  const [kind, ...member] = typeof v === "string" ? v.split(".") : [];
  if (!kind || member.join(".") === "") return d.bad("shape", path, "is a record kind, a dot and a member, as in check.commit") ?? false;
  const of = [...d.capabilities.values()].filter((version) => own(declaredBy(version)?.records, kind));
  if (of.length !== 1) return d.bad("capability", path, of.length === 0 ? `names no record kind of a capability that the definition lists` : "names a record kind that two listed capabilities declare") ?? false;
  d.underived.push({ path, capability: of[0]!, form: "carried", name: String(v) });
  return true;
}

/**
 * The kind of a preparation entry or of its outcome entries (section 6.2):
 * the capability and the step, written `hold@1:check`. A kind of that form
 * must name a step of a listed version. Any other kind is an act kind or a
 * message name, which this check does not read.
 */
export function stepKind(d: Defining, kind: string, path: string): void {
  const found = /^([^:@]+)@([^:@]+):(.*)$/.exec(kind);
  if (!found) return;
  const version = d.capabilities.get(found[1]!);
  if (version !== `${found[1]}@${found[2]}` || !own(declaredBy(version)?.steps, found[3]!)) { d.bad("capability", path, "names no step of a capability version that the definition lists"); return; }
  d.underived.push({ path, capability: version, form: "kind", name: kind });
}
