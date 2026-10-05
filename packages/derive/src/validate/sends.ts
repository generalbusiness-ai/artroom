/** Send and attention forms, and the result clauses of a request (scope contract, sections 6.4 and 6.6). */

import type { Notify } from "@generalbusiness/artroom-contract";
import type { FieldType } from "@generalbusiness/artroom-contract";
import { canonicalize, isDigest, isPlatformDefinition, isScopeKind } from "@generalbusiness/artroom-bytes";
import { isObject } from "../values.ts";
import { subject, type Ctx, type Defining } from "./context.ts";
import { effects } from "./effects.ts";
import { fieldOf, landedOperand } from "./operands.ts";
import { at, type Rec } from "./shape.ts";
import { RECORD_BYTES, stated } from "./sizes.ts";

/** The message names a `tell` may not use: the platform runs a handler of that name for a `relate` or an advisory. */
export const keptMessage = (name: string): boolean => name.startsWith("relate:") || name === "index" || name === "notify";

/** A send's source: `self`, or an operand whose slot is a slot of the primary item. Returns its type when the definition states it. */
function source(d: Defining, v: unknown, path: string, ctx: Ctx): FieldType | null {
  if (v === "self") return null;
  const k = landedOperand(d, v, path, ctx, () => ctx.on ?? d.bad("name", path, "there is no primary item whose slot this could be"))?.form;
  return k === "field" ? fieldOf(v, ctx) : k === "slot" ? (ctx.on?.slots.get((v as Rec)["slot"] as string)?.type ?? null) : null;
}
const sources = (d: Defining, v: unknown, path: string, ctx: Ctx) => { for (const [name, s] of d.entries(v, path, d.bounds.sendFields)) source(d, s, at(path, name), ctx); };

/** The result clauses of one request. Each is its own list of effects, which run in a later entry. */
function clauses(d: Defining, v: unknown, path: string, ctx: Ctx, conflict: boolean): void {
  const r = d.rec(v, path, [], ["applied", "refused", "superseded", "undelivered", ...(conflict ? ["conflict"] : [])]);
  for (const [name, e] of Object.entries(r ?? {})) {
    // Section 17.2: a `conflict` is not reserved. Its entry is new work, and what its clause starts is counted when it is admitted.
    d.clause = name === "conflict" ? null : [];
    effects(d, e, at(path, name), { ...ctx, clause: true }, true);
    if (d.clause) d.clauseSets.push(d.clause);
    d.clause = null;
  }
}

/** The send forms of one act or handler, in the order written. */
export function sends(d: Defining, v: unknown, path: string, ctx: Ctx): void {
  const { bounds, problems, bad, rec, form, list, str } = d;
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
      if (!isScopeKind(r["kind"])) bad("shape", at(p, "kind"), "is not a scope kind");
      if (!isDigest(r["definition"]) && !isPlatformDefinition(r["definition"])) bad("shape", at(p, "definition"), "is a definition digest or a platform definition");
      sources(d, r["fields"], at(p, "fields"), ctx);
      clauses(d, r["result"], at(p, "result"), ctx, true);
    } else if (k === "tell") {
      const r = rec(x, p, ["to", "message", "fields", "result"]);
      if (!r) return;
      if (source(d, { slot: r["to"] }, at(p, "to"), ctx)?.type !== "scope") bad("name", at(p, "to"), "names no slot of the primary item that holds a scope");
      if (str(r["message"], at(p, "message")) !== null && keptMessage(r["message"] as string)) bad("handler", at(p, "message"), "is a name the platform keeps for a relate or an advisory");
      sources(d, r["fields"], at(p, "fields"), ctx);
      clauses(d, r["result"], at(p, "result"), ctx, false);
    } else if (k === "relate") {
      const r = rec(x, p, ["to", "name", "item", "state", "detail", "result"]);
      if (!r) return;
      const to = source(d, r["to"], at(p, "to"), ctx);
      if (r["to"] === "self" || (to ? to.type !== "scope" : !(isObject(r["to"]) && "field" in r["to"] && !ctx.fields))) bad("name", at(p, "to"), "names no field or slot that holds a scope");
      const item = source(d, r["item"], at(p, "item"), ctx);
      if (r["item"] === "self" ? !ctx.nascent : item ? item.type !== "item" : !(isObject(r["item"]) && "field" in r["item"] && !ctx.fields)) bad("name", at(p, "item"), "names no local item: self in an open act, or a field or slot that holds an item");
      str(r["name"], at(p, "name"));
      str(r["state"], at(p, "state"));
      sources(d, r["detail"], at(p, "detail"), ctx);
      clauses(d, r["result"], at(p, "result"), ctx, false);
      if (problems.length !== before) return;
      // Section 6.4: no two `relate` sends written with the same `to`, `item` and `name`.
      const key = canonicalize([r["to"], r["item"], r["name"]]);
      if (relations.has(key)) bad("duplicate-relation", p, "another relate send of this entry is written with the same to, item and name");
      relations.add(key);
    } else {
      const r = rec(x, p, ["fields"]);
      if (r) sources(d, r["fields"], at(p, "fields"), ctx);
    }
  });
}

/** The attention forms of one act, handler or timed rule. */
export function attention(d: Defining, v: unknown, path: string, ctx: Ctx): void {
  const { bounds, bad, rec, list, str } = d;
  list(v, path, bounds.attention).forEach((n, i) => {
    const o = rec(n, at(path, i), ["notify"]);
    const r = o && rec(o["notify"], at(path, i), ["slot", "of", "when", "reason"]);
    if (!r) return;
    const s = subject(d, r["of"], at(path, i), ctx, false);
    if (s && s !== "scope" && !(typeof r["slot"] === "string" && s.slots.get(r["slot"])?.kind === "party")) bad("name", at(path, i), "names no party slot");
    if (r["when"] !== "before" && r["when"] !== "after") bad("shape", at(path, i), "when is before or after");
    str(r["reason"], at(path, i));
  });
}

/**
 * The most canonical bytes of the attention record of one notice of a timed
 * rule (section 6.4, "a timed entry always fits"): the record, the reason
 * the definition states, and every member the slot can hold. `held` gives
 * the most bytes a slot of the rule's item holds.
 */
export const notifyBytes = ({ notify }: Notify, held: (slot: string) => number): number => RECORD_BYTES + stated(notify.reason) + 2 + held(notify.slot);
