/**
 * Operands and parts: what a guard, an effect or a send reads (scope
 * contract, section 6.5), and the rule for copying what one reads into a
 * slot (section 6.6). Every family of forms validates its operands here.
 *
 * `operand` reads the whole grammar. What an operand may name depends on
 * where it is written, which `Ctx` says: a signer in an act, a sender and a
 * source entry in a handler, an update in a `relate` handler, a result in a
 * clause, and the names that an act presents or a list form binds.
 */

import type { FieldType } from "@generalbusiness/artroom-contract";
import { canonicalize } from "@generalbusiness/artroom-bytes";
import { isObject } from "../values.ts";
import { onSubject, subject, type Ctx, type Defining, type Type } from "./context.ts";
import { assignable, memberType } from "./fields.ts";
import { at, type Rec } from "./shape.ts";

/**
 * One operand as the validator read it. `type`: the type of its value when
 * the definition states it; null when only the commit knows, as for a
 * constant or a part of a fetched entry. `open`: the value is of that type,
 * and nothing states its bounds: a position. `fields`: every field it names,
 * also inside a part. `slot`: the name of the slot, when it is a slot of the
 * form's own subject with no part.
 */
export interface Read { form: string; type: FieldType | null; open: boolean; fields: readonly string[]; slot: string | null }

const OPERANDS = ["field", "presented", "slot", "element", "item", "signer", "sender", "source", "update", "result", "scope", "intent", "none", "const"];
/** The operands that hold a value a part may read inside. */
const WITH_PART = ["field", "presented", "slot", "element"];
/** The parts that are one word. The first three are read from the reference, and the others from the entry's bytes. */
const WORDS = ["ref", "scope", "seq", "kind", "intent", "on"];
/**
 * A position: the `seq` of an entry, and the revision of an update. It is an
 * integer of at least 0. The contract states no most for it, so the
 * validator cannot show that a slot of a narrower range holds it, and the
 * commit checks the value (section 6.6).
 */
const POSITION: FieldType = { type: "int", min: 0, max: Number.MAX_SAFE_INTEGER };

/**
 * One operand. A slot with no `of` is read from the item that `owner` gives:
 * the form's own subject, or in the `where` of a range each item the range
 * covers. `guard`: the operand is read by a guard, which may not read the
 * item that its act opens (section 6.3). `detached`: the place may read a
 * detached text, which is its digest: the source of an effect, and a field
 * of a send. Every other place is refused one, as `redactable-read`
 * (section 6.2). Null: it is not an operand here, which is reported.
 */
export function operand(d: Defining, v: unknown, path: string, ctx: Ctx, owner: () => Type | null, guard = true, detached = false): Read | null {
  const { bad, rec, str } = d;
  const f = d.form(v, path, OPERANDS, ["of", "part"]);
  if (!f) return null;
  const [k, x] = f;
  const o = v as Rec;
  if ("of" in o && k !== "slot") return bad("shape", at(path, "of"), "only a slot names a subject");
  if ("part" in o && !WITH_PART.includes(k)) return bad("shape", at(path, "part"), "a part is read from a field, a presented fact, a slot or an element");
  const fields: string[] = [];
  const nascent = (of: unknown) => guard && ctx.nascent && onSubject(of);

  /** One part that is not `{ of, then }`. Returns the type of what it reads when the definition states it. */
  const entryPart = (p: unknown, pp: string, base: FieldType | null): FieldType | null | undefined => {
    if (typeof p === "string") {
      if (!WORDS.includes(p)) return bad("shape", pp, `must be one of: ${WORDS.join(", ")}, or a part with a name`) ?? undefined;
      return p === "ref" ? base : p === "seq" ? POSITION : p === "intent" ? { type: "digest" } : null;
    }
    const pf = d.form(p, pp, ["field", "opened", "set", "carried"]);
    if (!pf) return undefined;
    // Section 6.11: a part of a capability record is read from a `record` effect, which no source derives yet.
    if (pf[0] === "carried") return bad("capability", pp, "reads a capability record, which no source derives yet") ?? undefined;
    if (pf[0] !== "set") return str(pf[1], at(pp, pf[0])) === null ? undefined : null;
    const r = rec(pf[1], at(pp, "set"), ["item", "slot"]);
    // The item is an operand of this judgment: it gives a local ID in the entry's own scope.
    const item = r && operand(d, r["item"], at(at(pp, "set"), "item"), ctx, owner, guard);
    if (!r || !item || str(r["slot"], at(at(pp, "set"), "slot")) === null) return undefined;
    fields.push(...item.fields);
    return null;
  };
  /** A part of the entry that the value of type `base` names. */
  const part = (p: unknown, pp: string, base: FieldType | null): FieldType | null | undefined => {
    // A part reads inside an entry that a fact reference names. Where the definition states the type, it is a fact.
    if (base && base.type !== "fact") return bad("name", pp, "a part reads inside an entry that a fact names") ?? undefined;
    if (!isObject(p) || !("of" in p)) return entryPart(p, pp, base);
    const r = rec(p, pp, ["of", "then"]);
    if (!r || entryPart(r["of"], at(pp, "of"), base) === undefined) return undefined;
    if (r["then"] !== "scope" && r["then"] !== "seq") return bad("shape", at(pp, "then"), "is scope or seq") ?? undefined;
    return r["then"] === "seq" ? POSITION : null;
  };

  let type: FieldType | null = null;
  let slot: string | null = null;
  switch (k) {
    case "field":
      if (typeof x !== "string" || (ctx.fields && !ctx.fields.has(x))) return bad("name", path, "names no field");
      fields.push(x);
      type = ctx.fields?.get(x) ?? null;
      break;
    case "presented": {
      const presented = typeof x === "string" ? ctx.presented.get(x) : undefined;
      if (!presented) return bad("name", path, "names no fact that the act presents");
      type = presented;
      break;
    }
    case "slot": {
      let t: Type | null;
      if (!("of" in o)) t = owner();
      else if (o["of"] === "each") t = ctx.each ?? bad("name", at(path, "of"), "there is no fan-out here");
      else {
        const s = subject(d, o["of"], at(path, "of"), ctx, false);
        t = s === "scope" ? null : s;
        if (t && nascent(o["of"])) return bad("nascent-guard", path, "a guard may not read the item its act opens");
      }
      if (!t) return null;
      const found = typeof x === "string" ? t.slots.get(x) : undefined;
      if (!found) return bad("name", path, `names no slot of ${t.name}`);
      type = found.type;
      if (!("of" in o) && !("part" in o)) slot = x as string;
      break;
    }
    case "element": {
      // Section 6.2: a member of a record element is named after the element, with a dot.
      // I2 merge: a member of a record field, and of a record slot, is not read yet. `ifPresent` in guards.ts reads a field's name whole.
      const element = typeof x === "string" ? memberType((name) => (ctx.elements.has(name) ? ctx.elements.get(name) : undefined), x) : undefined;
      if (element === undefined) return bad("name", path, "names no element that an enclosing form binds, and no member of one");
      type = element;
      break;
    }
    case "item": {
      const s = x === "each" ? (ctx.each ?? bad("name", path, "there is no fan-out here")) : subject(d, x, path, ctx, false);
      if (s === null || s === "scope") return null;
      if (x !== "each" && nascent(x)) return bad("nascent-guard", path, "a guard may not read the item its act opens");
      type = { type: "item", of: s.name };
      break;
    }
    case "signer":
      if (x !== true || !ctx.signer) return bad("name", path, "there is no signer here");
      type = { type: "member" };
      break;
    case "sender":
      if (x !== true || !(ctx.handler || ctx.clause)) return bad("name", path, "there is no sender here: a handler and a result clause have one");
      break;
    case "source": {
      if (!ctx.handler) return bad("name", path, "there is no source entry here: a handler has one");
      const read = entryPart(x, at(path, "source"), null);
      if (read === undefined) return null;
      type = read;
      break;
    }
    case "update":
      if (!ctx.handler?.update) return bad("name", path, "there is no update here: a relate handler has one");
      if (x !== "state" && x !== "item" && x !== "revision") return bad("shape", path, "is state, item or revision");
      if (x === "revision") type = POSITION;
      break;
    case "result":
      if (!ctx.clause) return bad("name", path, "there is no result here: a result clause has one");
      if (x !== "reason") return bad("shape", path, "is reason");
      break;
    case "intent":
      if (x !== true || !ctx.signer) return bad("name", path, "there is no intent here: an act has one");
      type = { type: "digest" };
      break;
    case "scope": case "none":
      if (x !== true) return bad("shape", path, "is true");
      break;
    case "const":
      try { canonicalize(x); } catch { return bad("shape", path, "is not a value"); }
      break;
  }
  // Section 6.2: no guard, and no form that only compares or lists, reads a detached value.
  if (!detached && isDetached(type)) return bad("redactable-read", path, "reads a detached text, which only the source of an effect and a field of a send to a lane may read");
  if ("part" in o) {
    const read = part(o["part"], at(path, "part"), type);
    if (read === undefined) return null;
    type = read;
  }
  return { form: k, type, open: type === POSITION, fields, slot };
}

/** True for the type of a detached text (section 6.2). */
export const isDetached = (type: FieldType | null | undefined): boolean => type?.type === "text" && type.detached === true;

/** The declared type of the field that a field operand names, when the definition states it. */
export const fieldOf = (v: unknown, ctx: Ctx): FieldType | null => (isObject(v) && typeof v["field"] === "string" ? (ctx.fields?.get(v["field"]) ?? null) : null);

/** Section 6.6: a slot never holds a value outside its type, so a copy needs a source whose every value the slot can hold. */
export function copy(d: Defining, from: FieldType | null | undefined, to: FieldType, path: string, what: string): void {
  if (from?.type !== to.type) d.bad("name", path, `names no ${what} of the slot's type`);
  else if (!assignable(from, to)) d.bad("bound", path, `the ${what} admits a value outside the slot's type`);
}
