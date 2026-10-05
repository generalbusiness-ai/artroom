/** Effect forms, and the rule that no two effects of one list set one thing (scope contract, sections 6.3 and 6.6). */

import type { Bounds, EffectForm } from "@generalbusiness/artroom-contract";
import { LAST_MS } from "../time.ts";
import { isObject, isValue } from "../values.ts";
import { onSubject, subject, type Ctx, type Defining, type Slot } from "./context.ts";
import { assignable } from "./fields.ts";
import { holdEffect } from "./hold.ts";
import { copy, fieldOf, operand } from "./operands.ts";
import { at, type Rec } from "./shape.ts";
import { memberBytes, stated } from "./sizes.ts";

const EFFECTS = ["state", "party", "ref", "value", "attribute", "hold"];

/** The slot of the primary item that a written effect sets to a value, if any. */
export const setsSlot = (e: unknown): unknown => {
  if (!isObject(e) || !onSubject(e["of"])) return null;
  for (const k of ["party", "ref", "value", "attribute"]) {
    const x = e[k];
    if (isObject(x) && (k === "value" || k === "attribute" || (x["from"] !== null && x["list"] !== "remove"))) return x["slot"];
  }
  return null;
};

/** One effect. `later`: it runs in a later entry, as a result clause does. Returns what it sets, for the conflict check. */
export function effect(d: Defining, v: unknown, path: string, ctx: Ctx, later: boolean): string | null {
  const { bounds, bad, rec, form, int } = d;
  const f = form(v, path, EFFECTS, ["of"]);
  if (!f) return null;
  const [k, x] = f;
  const of = (v as Rec)["of"];
  const p = at(path, k);
  const s = subject(d, of, at(path, "of"), ctx, false);
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
      d.clause?.push({ subject: sk, type: s.name, state: x });
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
        } else if (fk && operand(d, from, at(p, "from"), ctx, () => null) === "field" && ctx.fields && fieldOf(from, ctx)?.type !== "member") bad("name", at(p, "from"), "names no field of type member");
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
        if (fk?.[0] === "slot") copy(d, typeof fk[1] === "string" ? s.slots.get(fk[1])?.type : undefined, sl.type, at(p, "from"), "slot");
        else if (fk && ctx.fields) copy(d, fieldOf(from, ctx), sl.type, at(p, "from"), "field");
      }
      return `slot ${String(r["slot"])} of ${sk}`;
    }
    case "value": {
      const r = rec(x, p, ["slot", "from"]);
      const sl = r && slot(r["slot"], "value");
      if (!r || !sl) return null;
      const fk = form(r["from"], at(p, "from"), ["field", "const", "time"]);
      if (fk?.[0] === "field" && ctx.fields) copy(d, fieldOf(r["from"], ctx), sl.type, at(p, "from"), "field");
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
      d.clause?.push({ subject: sk, type: s.name, slot: String(r["slot"]) });
      return `slot ${String(r["slot"])} of ${sk}`;
    }
    case "attribute": {
      const r = rec(x, p, ["slot", "of"]);
      const sl = r && slot(r["slot"], "party");
      if (!r || !sl) return null;
      if (!sl.list) bad("name", p, "attribution fills a party list");
      if (ctx.timed) bad("timed-partial", p, "a timed rule takes no attribution: a full list would refuse the transition");
      subject(d, r["of"], at(p, "of"), ctx, false);
      return `slot ${String(r["slot"])} of ${sk}`;
    }
    default:
      return holdEffect(d, x, p, s, sk, ctx, nascent);
  }
}

/** The effects of one act, handler, timed rule or result clause, in the order written. */
export function effects(d: Defining, v: unknown, path: string, ctx: Ctx, later: boolean): void {
  const { bounds, bad, list } = d;
  const set = new Set<string>();
  list(v, path, bounds.effects).forEach((e, i) => {
    const what = effect(d, e, at(path, i), ctx, later);
    if (what === null) return;
    if (ctx.timed && isObject(e) && !onSubject(e["of"])) bad("timed", at(path, i), "a timed rule changes its own item only");
    // Section 6.3: no two effects set the same slot of the same subject, or its state.
    if (set.has(what)) bad("conflict", at(path, i), `another effect also sets ${what}`);
    set.add(what);
  });
}

/**
 * The most canonical bytes that the record of one effect of a timed rule
 * carries, beside the record itself (section 6.4, "a timed entry always
 * fits"). A timed rule has no field and no signer, so its effect carries a
 * name or a constant the definition states, or a copy of a slot. `held`
 * gives the most bytes a slot of the rule's item holds.
 */
export function effectBytes(e: EffectForm, held: (slot: string) => number, bounds: Bounds): number {
  if ("state" in e) return stated(e.state);
  if ("party" in e) return stated(e.party.slot) + memberBytes(bounds);
  if ("ref" in e) return stated(e.ref.slot) + (e.ref.from !== null && e.ref.from !== "self" && "slot" in e.ref.from ? held(e.ref.from.slot) : 20);
  if ("value" in e) return stated(e.value.slot) + (e.value.from !== null && "const" in e.value.from ? stated(e.value.from.const) : 26);
  return 0;
}
