/**
 * Acts and handlers: what each may name, and the forms it holds (scope
 * contract, section 6.4). The guards, effects, sends and attention of each
 * are read by their own families.
 */

import type { FieldType } from "@generalbusiness/artroom-contract";
import { canonicalize, isScopeKind } from "@generalbusiness/artroom-bytes";
import { isObject, own } from "../values.ts";
import { naming, onSubject, subject, type ClauseSet, type Ctx, type Defining, type Duties, type Type } from "./context.ts";
import { effects, setsSlot } from "./effects.ts";
import { declaredFields } from "./fields.ts";
import { guards } from "./guards.ts";
import { holdDoes, opensHold } from "./hold.ts";
import { attention, sends } from "./sends.ts";
import { at, type Rec } from "./shape.ts";

const members = (v: unknown): Rec => (isObject(v) ? v : {});
/** Whether an item type is `many`, as the definition writes it. */
const many = (top: Rec, type: string): unknown => members(own(members(top["items"]), type))["many"];

/**
 * True when every entry of that kind opens an item of that type, as the
 * definition writes it: the kind is an `open` act on the type, or the
 * message of handlers that open it, and of nothing that opens another type
 * or none.
 */
function opens(top: Rec, kind: string, type: string): boolean {
  const act = own(members(top["acts"]), kind);
  const found: unknown[] = isObject(act) ? [act["step"] === "open" ? act["on"] : null] : [];
  for (const h of Object.values(members(top["receives"]))) if (isObject(h) && h["message"] === kind && h["class"] !== "advisory") found.push(h["opens"]);
  return found.length > 0 && found.every((t) => t === type);
}

/**
 * The other local items an act or handler names, each with its type (section
 * 6.4). A name selects its item by a field, through a slot of another
 * subject, or as the one item of a type that is not `many`. `on`: the
 * primary item, when it exists before the entry, so that a `via` may read
 * its slots. `top` is the definition as written.
 *
 * `unsettled`: the names that are selected through a slot that is not
 * fixed. The slot may hold another item by the time a result clause runs,
 * so a clause cannot select the same item again, and may not name one.
 */
function also(d: Defining, v: unknown, path: string, fields: Map<string, FieldType>, on: Type | null, top: Rec): { types: Map<string, Type>; unsettled: Set<string> } {
  const { bounds, types, bad, rec, form, entries } = d;
  const out = new Map<string, Type>();
  const via = new Map<string, { of: string; slot: unknown; path: string }>();
  /** A value of that type names one item of type `t`: a local item of that type, or an entry of this definition that opened one. */
  const selects = (type: FieldType | undefined, t: Type): boolean =>
    (type?.type === "item" ? type.of === t.name : type?.type === "fact" && type.under === d.name && type.kind.every((k) => opens(top, k, t.name)));
  for (const [name, a] of entries(v, path, bounds.also)) {
    const p = at(path, name);
    // The intent's `expected` has the key `on` for the primary item, so no other item may take that name.
    if (name === "on") bad("shape", p, "an also entry is not named on");
    const f = form(a, p, ["by", "via", "one"], ["item"]);
    if (!f) continue;
    const item = (a as Rec)["item"];
    const t = typeof item === "string" ? types.get(item) : undefined;
    if (!t) { bad("name", p, "names no item type"); continue; }
    const [k, x] = f;
    if (k === "by") {
      // A field of type `item`, of that type; or a local fact, which selects the item that the named entry opened.
      if (typeof x !== "string" || !selects(fields.get(x), t)) bad("name", p, "must be named by a field of type item, of that type, or by a fact of this definition whose entry opens one");
    } else if (k === "via") {
      const r = rec(x, at(p, "via"), ["slot", "of"]);
      if (!r) continue;
      if (typeof r["of"] !== "string" || !(r["of"] === "on" || r["of"].startsWith("also."))) { bad("name", at(p, "via"), "reads a slot of `on` or of another `also` name"); continue; }
      via.set(name, { of: r["of"], slot: r["slot"], path: at(p, "via") });
    } else if (x !== true || many(top, t.name) !== false) bad("name", p, "`one` is true, and names a type that is not `many`");
    out.set(name, t);
  }
  // A canonical definition keeps no order of its names. So a `via` is resolved after the subject it reads, whatever the order, and
  // no chain of them may lead back to itself.
  const unsettled = new Set<string>();
  for (const [name, { of, slot, path: p }] of via) {
    const from = of === "on" ? on : out.get(of.slice(5));
    const read = typeof slot === "string" ? from?.slots.get(slot) : undefined;
    if (!from) bad("name", p, of === "on" ? "there is no primary item here that exists before the entry" : "names no subject");
    else if (!read || !selects(read.type, out.get(name)!)) bad("name", p, "names no slot that holds an item of that type, or a fact of this definition whose entry opens one");
    // The chain of `via` names from this one, to the first subject that is selected another way.
    let settled = true;
    const seen = new Set<string>();
    for (let link: string | null = name; link !== null && via.has(link);) {
      if (seen.has(link)) { bad("name", p, "leads back to itself"); break; }
      seen.add(link);
      const read: { of: string; slot: unknown } = via.get(link)!;
      const source = read.of === "on" ? on : out.get(read.of.slice(5));
      if (typeof read.slot !== "string" || source?.slots.get(read.slot)?.fixed !== true) settled = false;
      link = read.of === "on" ? null : read.of.slice(5);
    }
    if (!settled) unsettled.add(name);
  }
  return { types: out, unsettled };
}

/**
 * Section 7.5: every send of one entry is counted: those its forms declare,
 * with a fan-out at its most, the platform's own, and one for each member
 * that its attention can tell.
 */
function entrySends(d: Defining, path: string, declared: number, told: number, platform: number): void {
  const most = declared + told + platform;
  if (most > d.bounds.sendsPerEntry) d.bad("bound", path, `its entry could have ${most} sends; at most ${d.bounds.sendsPerEntry}`);
}

/**
 * Section 6.4, `settles`: an act or handler declares that it settles an
 * item in stated states, or a relationship copy in stated states. An item
 * is named by a subject that exists before the entry. A copy is the one
 * that a `relate` handler's update is for: `copy` gives the relationship's
 * name and the kind of scope that owns it. Null: it declares none, or what
 * it declares is refused.
 */
function settling(d: Defining, v: unknown, path: string, ctx: Ctx, copy: { name: string; kind: string } | null): Duties["settles"] {
  const { bad, form, rec, names, list } = d;
  const f = form(v, path, ["of", "copy"], ["in"]);
  if (!f) return null;
  if (f[0] === "copy") {
    if (!rec(v, path, ["copy"])) return null;
    if (!copy) return bad("shape", at(path, "copy"), "only a relate handler settles a copy");
    const states = list(f[1], at(path, "copy"), d.bounds.listElements);
    if (states.length === 0 || !states.every((s) => typeof s === "string" && s !== "")) return bad("shape", at(path, "copy"), "is a list of states of the relationship, and is not empty");
    return { copy: states as string[], ...copy };
  }
  const r = rec(v, path, ["of", "in"]);
  const s = r && subject(d, r["of"], at(path, "of"), ctx, false);
  if (!r || !s || s === "scope") return null;
  // The item it opens is in no state before the entry, so it awaits nothing.
  if (ctx.nascent && onSubject(r["of"])) return bad("name", at(path, "of"), "an entry settles an item that exists before it, and not the one it opens");
  const states = names(r["in"], at(path, "in"), s.states, "state");
  return states.length === 0 || states.some((state) => !s.states.has(state)) ? null : { subject: r["of"] as string, type: s.name, states };
}

/** What a list of effects can set, read while `read` validates it, with the item the entry opens in its initial state. */
function setsOf(d: Defining, opens: Type | null, read: () => void): ClauseSet {
  const sets: ClauseSet = opens ? [{ subject: "on", type: opens.name, state: opens.initial }] : [];
  d.clause = sets;
  read();
  d.clause = null;
  return sets;
}

/** Every act. `timed`: the timed rules as written, which the opening of a hold reads. `top`: the definition as written. */
export function acts(d: Defining, v: unknown, timed: Readonly<Record<string, unknown>>, top: Rec): void {
  const { bounds, types, bad, rec, entries, str } = d;
  for (const [name, av] of entries(v, "acts", bounds.acts)) {
    const path = at("acts", name);
    const o = rec(av, path, ["step", "on", "also", "fields", "grant", "guards", "effects", "sends", "attention"], ["settles"]);
    if (!o) continue;
    const step = o["step"];
    if (step !== "open" && step !== "transition" && step !== "comment") bad("shape", at(path, "step"), "is open, transition or comment");
    const on = typeof o["on"] === "string" ? (types.get(o["on"]) ?? null) : null;
    if (o["on"] !== null && !on) bad("name", at(path, "on"), "names no item type");
    if (o["on"] === null && step !== "comment") bad("shape", at(path, "on"), "an open or a transition has a primary item type");
    str(o["grant"], at(path, "grant"));
    const fields = declaredFields(d, o["fields"], at(path, "fields"));
    // A transition's primary item exists before the entry, so a `via` may read its slots. The item an `open` act opens does not.
    const named = also(d, o["also"], at(path, "also"), fields, step === "transition" ? on : null, top);
    const ctx: Ctx = { ...naming(), on, also: named.types, nascent: step === "open", fields, signer: true, kind: name, unsettled: named.unsettled };
    // Section 6.4: a comment changes no item and meets no guard.
    if (step === "comment") for (const k of ["guards", "effects", "sends"]) if (!Array.isArray(o[k]) || o[k].length > 0) bad("shape", at(path, k), "a comment has none");
    if (step === "comment" && ctx.also.size > 0) bad("shape", at(path, "also"), "a comment names no other item");
    guards(d, o["guards"], at(path, "guards"), ctx);
    const duties: Duties = { path, settles: "settles" in o ? settling(d, o["settles"], at(path, "settles"), ctx, null) : null, sets: [], requests: [] };
    duties.sets = setsOf(d, step === "open" ? on : null, () => effects(d, o["effects"], at(path, "effects"), ctx, false));
    // A child's genesis sends the platform's one result beside what its act declares.
    entrySends(d, path, sends(d, o["sends"], at(path, "sends"), ctx, top, duties.requests), attention(d, o["attention"], at(path, "attention"), ctx), name === top["genesis"] ? 1 : 0);
    d.duties.push(duties);
    if (step === "open" && on) {
      const set = new Set(Array.isArray(o["effects"]) ? o["effects"].map(setsSlot) : []);
      // Section 6.3: an opening sets every required slot.
      for (const [s, slot] of on.slots) if (slot.required && !slot.hasDefault && !set.has(s)) bad("required-unset", at(path, "effects"), `no effect sets the required slot ${s}`);
      opensHold(d, o["effects"], on, set, timed, at(path, "effects"));
    }
  }
}

/** The classes of a handler, and for an advisory the types its message may be (section 6.4). */
const CLASSES = ["tell", "relate", "advisory"];
const ADVISORIES = ["index", "notify"];

/** Every handler. `top`: the definition as written. */
export function receives(d: Defining, v: unknown, top: Rec): void {
  const { bounds, types, bad, rec, entries, str, int } = d;
  const handled = new Set<string>();
  for (const [name, hv] of entries(v, "receives", bounds.receives)) {
    const path = at("receives", name);
    const o = rec(hv, path, ["message", "class", "from", "fields", "opens", "also", "guards", "effects", "sends", "attention"], ["copies", "settles"]);
    if (!o) continue;
    const message = str(o["message"], at(path, "message"));
    const cls = o["class"];
    if (typeof cls !== "string" || !CLASSES.includes(cls)) bad("shape", at(path, "class"), `is one of: ${CLASSES.join(", ")}`);
    if (cls === "advisory" && message !== null && !ADVISORIES.includes(message)) bad("name", at(path, "message"), `an advisory handler's message is its type: ${ADVISORIES.join(" or ")}`);
    const from = rec(o["from"], at(path, "from"), ["kind"], ["under"]);
    // Section 7.4: a handler is found by the message's class and name and the sender's kind, so no two handlers are for one of
    // those. The handler an entry ran is then found again from the entry alone.
    const key = canonicalize([String(cls), String(o["message"]), String(from?.["kind"])]);
    if (handled.has(key)) bad("handler", path, "another handler receives this class and message from this kind of scope");
    handled.add(key);
    if (from && (!isScopeKind(from["kind"]) || ("under" in from && str(from["under"], at(path, "from")) === null))) bad("shape", at(path, "from"), "is a scope kind, and a definition name");
    // Section 7.3: a `relate` handler states the most keys the scope keeps a copy for. No other handler keeps a copy.
    if (cls === "relate") int(o["copies"], at(path, "copies"), 1);
    else if ("copies" in o) bad("shape", at(path, "copies"), "only a relate handler keeps copies");

    // Section 6.4: a `tell` handler declares the fields of its message, and a `relate` handler those of the update's detail.
    const fields = declaredFields(d, o["fields"], at(path, "fields"));
    for (const [f, fv] of Object.entries(members(o["fields"]))) if (isObject(fv) && "default" in fv) bad("shape", at(at(at(path, "fields"), f), "default"), "a field of a message has no default");
    const on = typeof o["opens"] === "string" ? (types.get(o["opens"]) ?? null) : null;
    if (o["opens"] !== null && !on) bad("name", at(path, "opens"), "names no item type");
    // Section 6.8: a hold is opened by an `open` act whose primary item is the hold.
    if ((on && d.holdTypes.has(on.name)) || holdDoes(o["effects"], "open")) bad("hold", at(path, "opens"), "a hold is opened only as the primary item of an open act");

    // A handler has no signer. Section 6.5: it has a sender and a source entry, and a handler of a relationship has the update being
    // applied. The item it opens may not exist before the entry, so no guard and no `via` reads it. The kind of its entry is its
    // message's name (section 6.2); the entry of an advisory has none.
    const named = also(d, o["also"], at(path, "also"), fields, null, top);
    const ctx: Ctx = { ...naming(), on, also: named.types, nascent: on !== null, fields, kind: cls === "advisory" ? null : message, handler: { update: cls === "relate", under: typeof from?.["under"] === "string" ? from["under"] : null }, unsettled: named.unsettled };
    guards(d, o["guards"], at(path, "guards"), ctx);
    const copy = cls === "relate" && message !== null && isScopeKind(from?.["kind"]) ? { name: message, kind: from["kind"] } : null;
    const duties: Duties = { path, settles: "settles" in o ? settling(d, o["settles"], at(path, "settles"), ctx, copy) : null, sets: [], requests: [] };
    duties.sets = setsOf(d, on, () => effects(d, o["effects"], at(path, "effects"), ctx, false));
    // The entry that decides a request sends the platform's one result.
    entrySends(d, path, sends(d, o["sends"], at(path, "sends"), ctx, top, duties.requests), attention(d, o["attention"], at(path, "attention"), ctx), cls === "advisory" ? 0 : 1);
    d.duties.push(duties);
    // Section 6.4: an advisory has no result, so its handler ends the exchange: it sends nothing and tells nobody.
    if (cls === "advisory") for (const k of ["sends", "attention"]) if (Array.isArray(o[k]) && o[k].length > 0) bad("advisory-sends", at(path, k), "a handler of class advisory declares none");
    if (!on) continue;
    const written = Array.isArray(o["effects"]) ? o["effects"] : [];
    const set = new Set(written.map(setsSlot));
    // Section 6.3: an opening sets every required slot.
    for (const [s, slot] of on.slots) if (slot.required && !slot.hasDefault && !set.has(s)) bad("required-unset", at(path, "effects"), `no effect sets the required slot ${s}`);
    if (many(top, on.name) === true) continue;
    // Section 6.4: a type that is not `many` is opened only if the scope has none. Otherwise `on` is the one that exists, which
    // this entry did not open: its fixed slots are set, and nothing shows that its state is not final.
    for (const [i, e] of written.entries()) {
      if (!isObject(e) || !onSubject(e["of"])) continue;
      const fixed = [...on.slots].some(([s, slot]) => slot.fixed && ["party", "ref", "value", "attribute"].some((k) => isObject(e[k]) && e[k]["slot"] === s));
      if (fixed) bad("fixed", at(at(path, "effects"), i), "the one item of this type may exist before the entry, and a fixed slot is set only by the entry that opens its item");
      if ("state" in e && [...on.states.values()].some((final) => final)) bad("final", at(at(path, "effects"), i), "the one item of this type may exist before the entry, in a final state");
    }
  }
}
