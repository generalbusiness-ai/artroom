/**
 * Operands: what a guard, an effect or a send reads (scope contract,
 * section 6.5), and the rule for copying what one reads into a slot
 * (section 6.6). Every family of forms validates its operands here.
 */

import type { FieldType } from "@generalbusiness/artroom-contract";
import { canonicalize } from "@generalbusiness/artroom-bytes";
import { isObject } from "../values.ts";
import type { Ctx, Defining, Type } from "./context.ts";
import { assignable } from "./fields.ts";

/** One operand. A slot is read from the item that `owner` gives. Returns the operand's form. */
export function operand(d: Defining, v: unknown, path: string, ctx: Ctx, owner: () => Type | null): string | null {
  const { bad } = d;
  const f = d.form(v, path, ["field", "slot", "signer", "const"]);
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
}

/** The declared type of the field that a field operand names, when the definition states it. */
export const fieldOf = (v: unknown, ctx: Ctx): FieldType | null => (isObject(v) && typeof v["field"] === "string" ? (ctx.fields?.get(v["field"]) ?? null) : null);

/** Section 6.6: a slot never holds a value outside its type, so a copy needs a source whose every value the slot can hold. */
export function copy(d: Defining, from: FieldType | null | undefined, to: FieldType, path: string, what: string): void {
  if (from?.type !== to.type) d.bad("name", path, `names no ${what} of the slot's type`);
  else if (!assignable(from, to)) d.bad("bound", path, `the ${what} admits a value outside the slot's type`);
}
