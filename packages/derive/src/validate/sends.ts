/** Send and attention forms, and the result clauses of a request (scope contract, sections 6.4 and 6.6). */

import type { Notify } from "@generalbusiness/artroom-contract";
import type { FieldType } from "@generalbusiness/artroom-contract";
import { canonicalize, isDigest, isPlatformDefinition, isScopeKind } from "@generalbusiness/artroom-bytes";
import { isObject, own } from "../values.ts";
import { subject, type ClauseSet, type Ctx, type Defining, type Duties, type Type } from "./context.ts";
import { effects } from "./effects.ts";
import { guards, range } from "./guards.ts";
import { operand } from "./operands.ts";
import { at, type Rec } from "./shape.ts";
import { RECORD_BYTES, stated } from "./sizes.ts";

/**
 * A range that a send reads whole: the items of a fan-out, and of a
 * `collect`. It is read as the range of a guard is, with the same `where`
 * and `except`. `live`: it lists no final state, so the type's `max` bounds
 * the items it covers.
 */
function ranged(d: Defining, v: unknown, path: string, ctx: Ctx): { type: Type; live: boolean } | null {
  const r = range(d, v, path, ctx, [], false);
  if (!r) return null;
  const states = Array.isArray(r.read["states"]) ? r.read["states"] : [];
  return { type: r.type, live: states.every((s) => typeof s !== "string" || r.type.states.get(s) !== true) };
}

/**
 * One source of a send (section 6.6): `self`, any operand, or in a field a
 * `collect`. A slot with no `of` is a slot of the primary item. Returns the
 * type of its value when the definition states it. Null: it is not a source
 * here, which is reported.
 */
function source(d: Defining, v: unknown, path: string, ctx: Ctx, field: boolean): { type: FieldType | null } | null {
  const { bounds, bad, rec, entries } = d;
  if (v === "self") return { type: null };
  if (isObject(v) && "collect" in v) {
    const c = field ? rec(v, path, ["collect"]) : bad("shape", path, "a collect is a field of a send");
    const r = c && rec(c["collect"], at(path, "collect"), ["items", "fields"]);
    if (!r) return null;
    const items = ranged(d, r["items"], at(at(path, "collect"), "items"), ctx);
    // Section 6.6: a `collect` needs complete evidence, and holds at most the type's `max` records.
    if (items && !items.live) bad("bound", at(at(path, "collect"), "items"), "a collect reads live items only: its range lists no final state");
    for (const [name, member] of entries(r["fields"], at(at(path, "collect"), "fields"), bounds.sendFields)) {
      if (items && !(member === "item" || member === "state" || (typeof member === "string" && items.type.slots.has(member)))) bad("name", at(at(at(path, "collect"), "fields"), name), `is item, state or a slot of ${items.type.name}`);
    }
    return { type: null };
  }
  const read = operand(d, v, path, ctx, () => ctx.on ?? bad("name", path, "there is no primary item whose slot this could be"), false);
  return read && { type: read.type };
}
const sources = (d: Defining, v: unknown, path: string, ctx: Ctx) => { for (const [name, s] of d.entries(v, path, d.bounds.sendFields)) source(d, s, at(path, name), ctx, true); };

/** True when a result clause list is written with an effect. */
const hasClause = (result: unknown): boolean => isObject(result) && Object.values(result).some((e) => Array.isArray(e) && e.length > 0);

/** The result clauses of one request. Each is its own list of effects, which run in a later entry. Returns what each reserved clause can set. */
function clauses(d: Defining, v: unknown, path: string, ctx: Ctx, conflict: boolean): ClauseSet[] {
  const r = d.rec(v, path, [], ["applied", "refused", "superseded", "undelivered", ...(conflict ? ["conflict"] : [])]);
  const reserved: ClauseSet[] = [];
  for (const [name, e] of Object.entries(r ?? {})) {
    // Section 17.2: a `conflict` is not reserved. Its entry is new work, and what its clause starts is counted when it is admitted.
    d.clause = name === "conflict" ? null : [];
    // Section 6.6: a clause's subjects are those of the entry that made the send, as that entry resolved them. A name that was
    // selected through a slot that is not fixed cannot be selected again when the clause runs, so a clause names none.
    const settled = new Map([...ctx.also].filter(([also]) => !ctx.unsettled?.has(also)));
    effects(d, e, at(path, name), { ...ctx, also: settled, clause: true }, true);
    if (d.clause) { d.clauseSets.push(d.clause); reserved.push(d.clause); }
    d.clause = null;
  }
  return reserved;
}

/** The condition of a send or a notice: guards, judged on the state before the entry's effects (section 6.6). */
function condition(d: Defining, r: Rec, path: string, ctx: Ctx): void {
  // A state guard here shows nothing to the effects of the act, so what it finds live is not kept.
  if ("if" in r) guards(d, r["if"], at(path, "if"), { ...ctx, live: new Set(ctx.live) });
}

/** The `also` names that a written form reads as a subject: every `of`, and every `item` of an operand, that names one. */
function alsoRead(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap(alsoRead);
  if (!isObject(v)) return [];
  return Object.entries(v).flatMap(([k, x]) => ((k === "of" || k === "item") && typeof x === "string" && x.startsWith("also.") ? [x] : alsoRead(x)));
}

/**
 * The send forms of one act or handler, in the order written. Returns the
 * most sends that they can make in one entry: one for each form, and for a
 * fan-out one for each live item of its type. `top` is the definition as
 * written, which holds each type's `max`. `requests` takes each request
 * form, for the reservations of section 17.2.
 */
export function sends(d: Defining, v: unknown, path: string, ctx: Ctx, top: Rec, requests: Duties["requests"]): number {
  const { bounds, problems, bad, rec, form, list, str } = d;
  const relations = new Set<string>();
  /** For each kind of message a form makes: whether every form of that kind always makes exactly one send, and whether one has a clause. */
  const kinds = new Map<string, { always: boolean; clause: boolean }[]>();
  let fanOuts = 0;
  let most = 0;
  list(v, path, bounds.sends).forEach((s, i) => {
    const f = form(s, at(path, i), ["create", "tell", "relate", "index"]);
    if (!f) return;
    const [k, x] = f;
    const p = at(at(path, i), k);
    const before = problems.length;
    let kind: unknown[] = [k];
    let always = true;
    let made = 1;
    let result: unknown = null;
    if (k === "create") {
      const r = rec(x, p, ["kind", "definition", "fields", "result"]);
      if (!r) return;
      if (!isScopeKind(r["kind"])) bad("shape", at(p, "kind"), "is not a scope kind");
      // Section 6.6: a definition cannot hold its own digest, so `self` names the creating scope's own pinned definition.
      if (r["definition"] !== "self" && !isDigest(r["definition"]) && !isPlatformDefinition(r["definition"])) bad("shape", at(p, "definition"), "is a definition digest, a platform definition, or self");
      sources(d, r["fields"], at(p, "fields"), ctx);
      requests.push({ most: 1, clauses: clauses(d, r["result"], at(p, "result"), ctx, true) });
      [kind, result] = [[k, r["kind"], r["definition"]], r["result"]];
    } else if (k === "tell") {
      const r = rec(x, p, ["to", "message", "fields", "result"], ["if"]);
      if (!r) return;
      // Section 6.6: a `tell` is addressed by a reference slot, of any subject. A field is not an address.
      const to = rec(r["to"], at(p, "to"), ["slot"], ["of"]) && source(d, r["to"], at(p, "to"), ctx, false);
      if (to && to.type?.type !== "scope") bad("name", at(p, "to"), "names no slot that holds a scope");
      str(r["message"], at(p, "message"));
      condition(d, r, p, ctx);
      sources(d, r["fields"], at(p, "fields"), ctx);
      requests.push({ most: 1, clauses: clauses(d, r["result"], at(p, "result"), ctx, false) });
      [kind, result, always] = [[k, r["message"]], r["result"], !("if" in r) && alsoRead(r["to"]).length === 0];
    } else if (k === "relate") {
      const r = rec(x, p, ["to", "name", "item", "state", "detail", "result"], ["each", "if"]);
      if (!r) return;
      // Section 6.6: a fan-out makes one send for each item its range covers. Its sends are bounded because the range reads live items
      // only, and the type's `max` bounds those.
      const each = "each" in r ? ranged(d, r["each"], at(p, "each"), ctx) : null;
      if ("each" in r && ++fanOuts > 1) bad("fan-out-unbounded", at(p, "each"), "another send of this list is a fan-out; a list has at most one");
      const written = each && isObject(top["items"]) ? own(top["items"], each.type.name) : null;
      const max = !each ? 1 : isObject(written) && typeof written["max"] === "number" ? written["max"] : Infinity;
      if (each && (!each.live || max > bounds.fanOut)) bad("fan-out-unbounded", at(p, "each"), `a fan-out reads live items only, of a type whose max is at most ${bounds.fanOut}`);
      const within: Ctx = each ? { ...ctx, each: each.type } : ctx;
      const to = source(d, r["to"], at(p, "to"), within, false);
      if (r["to"] === "self" || (to?.type && to.type.type !== "scope")) bad("name", at(p, "to"), "names nothing that holds a scope");
      const item = source(d, r["item"], at(p, "item"), within, false);
      if (r["item"] === "self" ? !ctx.nascent : item?.type && item.type.type !== "item") bad("name", at(p, "item"), "names no local item: self in an entry that opens one, or an operand that holds an item");
      str(r["name"], at(p, "name"));
      str(r["state"], at(p, "state"));
      condition(d, r, p, within);
      sources(d, r["detail"], at(p, "detail"), within);
      // Section 6.6: a clause of a fan-out send may read `each`, the item of that send. The entry records the item of each update and
      // nothing else of the range. So `each` is found again, when the result is recorded, only where the update's `item` is `each`.
      requests.push({ most: Number.isFinite(max) ? max : 0, clauses: clauses(d, r["result"], at(p, "result"), each && canonicalize(r["item"]) === canonicalize({ item: "each" }) ? within : ctx, false) });
      [kind, result, always, made] = [[k, r["name"], r["state"]], r["result"], !("if" in r) && !each && alsoRead([r["to"], r["item"]]).length === 0, Number.isFinite(max) ? max : 0];
      if (problems.length === before) {
        // Section 6.4: no two `relate` sends written with the same `to`, `item` and `name`.
        const key = canonicalize([r["to"], r["item"], r["name"]]);
        if (relations.has(key)) bad("duplicate-relation", p, "another relate send of this entry is written with the same to, item and name");
        relations.add(key);
      }
    } else {
      const r = rec(x, p, ["fields"]);
      if (r) sources(d, r["fields"], at(p, "fields"), ctx);
    }
    most += made;
    if (problems.length !== before) return;
    // A request's result names it by its ordinal, and a send that is not made takes none. So the form that made a recorded send is
    // found again from what the message says: its type and its name. Two forms that say the same are told apart only by their
    // order, which holds when each always makes exactly one send.
    const said = canonicalize(kind);
    const others = kinds.get(said) ?? [];
    const clause = hasClause(result);
    if (others.some((o) => (o.clause || clause) && !(o.always && always))) bad("shape", p, "another send of this list makes a message of the same type and name, one of the two is not always made, and one has a result clause: the clause of a result could not be found again");
    kinds.set(said, [...others, { always, clause }]);
  });
  return most;
}

/**
 * The attention forms of one act, handler or timed rule. Returns the most
 * members that they can tell in one entry (section 6.6): 1 for a single
 * slot, and the slot's `max` for a list.
 */
export function attention(d: Defining, v: unknown, path: string, ctx: Ctx): number {
  const { bounds, bad, rec, list, str } = d;
  let told = 0;
  list(v, path, bounds.attention).forEach((n, i) => {
    const o = rec(n, at(path, i), ["notify"]);
    const r = o && rec(o["notify"], at(path, i), ["slot", "of", "when", "reason"], ["if"]);
    if (!r) return;
    const s = subject(d, r["of"], at(path, i), ctx, false);
    const slot = s && s !== "scope" && typeof r["slot"] === "string" ? s.slots.get(r["slot"]) : undefined;
    if (s && s !== "scope" && slot?.kind !== "party") bad("name", at(path, i), "names no party slot");
    if (slot?.kind === "party") told += slot.type.type === "list" ? slot.type.max : 1;
    if (r["when"] !== "before" && r["when"] !== "after") bad("shape", at(path, i), "when is before or after");
    str(r["reason"], at(path, i));
    // A timed entry is always written (section 6.4). A condition that is not completed would leave it not judged, so a timed rule's notice has none.
    if ("if" in r && ctx.timed) bad("timed", at(at(path, i), "if"), "a notice of a timed rule has no condition");
    else condition(d, r, at(path, i), ctx);
  });
  // Section 6.6: attention is bounded by the definition, so no entry has to drop a notice.
  if (told > bounds.attentionMembers) bad("attention-unbounded", path, `could tell ${told} members; at most ${bounds.attentionMembers}`);
  return told;
}

/**
 * The most canonical bytes of the attention record of one notice of a timed
 * rule (section 6.4, "a timed entry always fits"): the record, the reason
 * the definition states, and every member the slot can hold. `held` gives
 * the most bytes a slot of the rule's item holds.
 */
export const notifyBytes = ({ notify }: Notify, held: (slot: string) => number): number => RECORD_BYTES + stated(notify.reason) + 2 + held(notify.slot);
