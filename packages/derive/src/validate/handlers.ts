/**
 * Acts and handlers: what each may name, and the forms it holds (scope
 * contract, section 6.4). The guards, effects, sends and attention of each
 * are read by their own families.
 */

import type { FieldType } from "@generalbusiness/artroom-contract";
import { canonicalize, isScopeKind } from "@generalbusiness/artroom-bytes";
import type { Ctx, Defining, Type } from "./context.ts";
import { effects, setsSlot } from "./effects.ts";
import { declaredFields } from "./fields.ts";
import { guards } from "./guards.ts";
import { opensHold } from "./hold.ts";
import { attention, sends } from "./sends.ts";
import { at } from "./shape.ts";

/** The other local items an act or handler names, each with its type. `fields` null: a handler, whose fields are not declared. */
function also(d: Defining, v: unknown, path: string, fields: Map<string, FieldType> | null): Map<string, Type> {
  const { bounds, types, bad, rec, entries } = d;
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
}

/** Every act. `timed`: the timed rules as written, which the opening of a hold reads. */
export function acts(d: Defining, v: unknown, timed: Readonly<Record<string, unknown>>): void {
  const { bounds, types, bad, rec, entries, str } = d;
  for (const [name, av] of entries(v, "acts", bounds.acts)) {
    const path = at("acts", name);
    const o = rec(av, path, ["step", "on", "also", "fields", "grant", "guards", "effects", "sends", "attention"]);
    if (!o) continue;
    const step = o["step"];
    if (step !== "open" && step !== "transition" && step !== "comment") bad("shape", at(path, "step"), "is open, transition or comment");
    const on = typeof o["on"] === "string" ? (types.get(o["on"]) ?? null) : null;
    if (o["on"] !== null && !on) bad("name", at(path, "on"), "names no item type");
    if (o["on"] === null && step !== "comment") bad("shape", at(path, "on"), "an open or a transition has a primary item type");
    str(o["grant"], at(path, "grant"));
    const fields = declaredFields(d, o["fields"], at(path, "fields"));
    const ctx: Ctx = { on, also: also(d, o["also"], at(path, "also"), fields), nascent: step === "open", fields, signer: true, timed: false, live: new Set() };
    // Section 6.4: a comment changes no item and meets no guard.
    if (step === "comment") for (const k of ["guards", "effects", "sends"]) if (!Array.isArray(o[k]) || o[k].length > 0) bad("shape", at(path, k), "a comment has none");
    if (step === "comment" && ctx.also.size > 0) bad("shape", at(path, "also"), "a comment names no other item");
    guards(d, o["guards"], at(path, "guards"), ctx);
    effects(d, o["effects"], at(path, "effects"), ctx, false);
    sends(d, o["sends"], at(path, "sends"), ctx);
    attention(d, o["attention"], at(path, "attention"), ctx);
    if (step === "open" && on) {
      const set = new Set(Array.isArray(o["effects"]) ? o["effects"].map(setsSlot) : []);
      // Section 6.3: an opening sets every required slot.
      for (const [s, slot] of on.slots) if (slot.required && !slot.hasDefault && !set.has(s)) bad("required-unset", at(path, "effects"), `no effect sets the required slot ${s}`);
      opensHold(d, o["effects"], on, set, timed, at(path, "effects"));
    }
  }
}

/** Every handler. */
export function receives(d: Defining, v: unknown): void {
  const { bounds, bad, rec, entries, str } = d;
  const handled = new Set<string>();
  for (const [name, hv] of entries(v, "receives", bounds.receives)) {
    const path = at("receives", name);
    const o = rec(hv, path, ["message", "from", "also", "guards", "effects", "sends", "attention"]);
    if (!o) continue;
    str(o["message"], at(path, "message"));
    const from = rec(o["from"], at(path, "from"), ["kind"], ["under"]);
    // One message from one kind of scope runs one handler, so the handler an entry ran is found again from the entry alone.
    const key = canonicalize([String(o["message"]), String(from?.["kind"])]);
    if (handled.has(key)) bad("handler", path, "another handler receives this message from this kind of scope");
    handled.add(key);
    if (from && (!isScopeKind(from["kind"]) || ("under" in from && str(from["under"], at(path, "from")) === null))) bad("shape", at(path, "from"), "is a scope kind, and a definition name");
    // A handler has no signer and opens no item; its message fields are not declared, so a field name is not resolved.
    const ctx: Ctx = { on: null, also: also(d, o["also"], at(path, "also"), null), nascent: false, fields: null, signer: false, timed: false, live: new Set() };
    guards(d, o["guards"], at(path, "guards"), ctx);
    effects(d, o["effects"], at(path, "effects"), ctx, false);
    sends(d, o["sends"], at(path, "sends"), ctx);
    attention(d, o["attention"], at(path, "attention"), ctx);
  }
}
