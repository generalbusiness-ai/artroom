/** Effect forms, their conditions, and the rule that no two effects of one list set one thing (scope contract, sections 6.3, 6.6 and 6.7). */

import type { Bounds, EffectForm, FieldType } from "@generalbusiness/artroom-contract";
import { canonicalize } from "@generalbusiness/artroom-bytes";
import { LAST_MS } from "../time.ts";
import { isObject, isValue } from "../values.ts";
import { capabilityEffect } from "./capability.ts";
import { mark, marked, onSubject, subject, type Ctx, type Defining, type Slot, type Type } from "./context.ts";
import { assignable } from "./fields.ts";
import { guards, range } from "./guards.ts";
import { holdEffect } from "./hold.ts";
import { copy, isDetached, operand } from "./operands.ts";
import { at, type Rec } from "./shape.ts";
import { memberBytes, stated } from "./sizes.ts";

const EFFECTS = ["state", "party", "ref", "value", "attribute", "hold", "redact", "capability"];
const MEMBER: FieldType = { type: "member" };

/** The slot of the primary item that a written effect may set to a value, if any. An effect under a condition is one: the commit checks what was set. */
export const setsSlot = (e: unknown): unknown => {
  if (!isObject(e) || !onSubject(e["of"])) return null;
  for (const k of ["party", "ref", "value", "attribute"]) {
    const x = e[k];
    if (isObject(x) && x["from"] !== null && x["list"] !== "remove") return x["slot"];
  }
  return null;
};

/** What one effect sets, for the conflict check. `successive`: it adds one member to a party list, or removes one, so another such effect may follow it. */
interface Sets { what: string; successive: boolean }

/** One effect. `later`: it runs in a later entry, as a result clause does. Returns what it sets, for the conflict check. */
export function effect(d: Defining, v: unknown, path: string, ctx: Ctx, later: boolean): Sets | null {
  const { bounds, bad, rec, form, int, list, str } = d;
  const f = form(v, path, EFFECTS, ["of", "if", "unless"]);
  if (!f) return null;
  const [k, x] = f;
  const o = v as Rec;
  const of = o["of"];
  const p = at(path, k);
  // Section 6.6: a condition is judged on the state before the entry's effects, with the rules of the act's own guards. A clause's
  // condition is judged in the commit that records the result, when the item its act opened exists. A `state` guard in the effect's
  // own `if` that lists no final state shows a live subject to a `state` effect. One in an `unless` shows nothing.
  const live = new Set(ctx.live);
  const judged: Ctx = { ...ctx, nascent: ctx.nascent && !later };
  if ("if" in o) guards(d, o["if"], at(path, "if"), { ...judged, live });
  if ("unless" in o) guards(d, o["unless"], at(path, "unless"), { ...judged, live: new Set() });
  // Section 6.4: a timed rule's effects are total. A condition could leave its item due, and one that is not completed leaves the entry unwritten.
  if (ctx.timed && ("if" in o || "unless" in o)) bad("timed-partial", path, "a timed rule's effects take no condition");
  if (k === "capability") {
    // Section 6.11: a capability's effect changes its own records and no item, so it needs no subject and conflicts with no
    // other effect. A slot with no `of` is a slot of the subject it names, or of the primary item when there is one.
    const named = "of" in o ? subject(d, of, at(path, "of"), ctx, false) : null;
    if ("of" in o && (named === null || named === "scope")) return null;
    capabilityEffect(d, x, p, ctx, () => (named as Type | null) ?? ctx.on ?? bad("name", p, "there is no primary item whose slot this could be"));
    return { what: `the capability effect at ${p}`, successive: false };
  }
  const s = subject(d, of, at(path, "of"), ctx, false);
  if (s === null || s === "scope") return null;
  const nascent = ctx.nascent && !later && onSubject(of);
  const sk = (of as string | undefined) ?? "on";
  const sets = (name: unknown, successive = false): Sets => ({ what: `slot ${String(name)} of ${sk}`, successive });
  const slot = (name: unknown, kind: Slot["kind"]): Slot | null => {
    const found = typeof name === "string" ? s.slots.get(name) : undefined;
    if (found?.kind !== kind) return bad("name", p, `names no ${kind} slot of ${s.name}`);
    // Section 6.3: a fixed slot is set by the act that opens the item and never again.
    return found.fixed && !nascent ? bad("fixed", p, "a fixed slot is set only by the act that opens its item") : found;
  };
  /**
   * A source that is an operand (section 6.6). A slot with no `of` is a slot
   * of the effect's own subject. Where the definition states the type of
   * what the operand reads, it must be assignable to `to`. Where only the
   * commit knows it, the commit checks the value against the slot.
   */
  const source = (from: unknown, fp: string, to: FieldType): void => {
    const read = operand(d, from, fp, ctx, () => s, false, true);
    if (!read) return;
    if (read.form === "none") bad("shape", fp, "a source that is none is never applied; null empties a slot");
    // Section 6.2: the bytes of a detached text are kept for the field that names it. So a slot for one is set only from a
    // detached field or slot, whose bytes this scope then holds. A constant, or a value that only the commit knows, names bytes
    // that nothing came with.
    else if (isDetached(to) && !isDetached(read.type)) bad("shape", fp, "a slot for a detached text is set from a detached field or slot, or emptied");
    else if (read.form === "const") { if (!isValue(to, (from as Rec)["const"], bounds)) bad("shape", fp, "is not a value of the slot's type"); }
    // A position is an integer whose most the contract does not state. It goes in a slot of that type, and the commit checks its range.
    else if (read.open) { if (read.type?.type !== to.type) bad("name", fp, "names no source of the slot's type"); }
    else if (read.type !== null) copy(d, read.type, to, fp, "source");
    // Section 6.6: the source entry is a fact under the definition that the handler's `from.under` names, of a kind that only the
    // commit knows. So it is no copy into a slot whose `under` is another name. When `from` names none, the commit checks both.
    else if (read.form === "source" && (from as Rec)["source"] === "ref" && to.type === "fact" && ctx.handler?.under != null && ctx.handler.under !== to.under) bad("name", fp, "the source entry is under the definition that the handler's `from` names, and the slot is under another");
    // Section 6.4: a timed rule's effects are total, so each source is one whose value the validator has shown the slot can hold.
    if (ctx.timed && (read.type === null || read.open) && !(read.form === "const" && k === "value")) bad("timed-partial", fp, "a timed rule copies only what the validator can show the slot holds");
  };
  switch (k) {
    case "state":
      if (typeof x !== "string" || !s.states.has(x)) return bad("name", p, `names no state of ${s.name}`);
      // Section 6.3: an item in a final state refuses every transition. A later clause is checked when it runs.
      if (nascent ? s.states.get(s.initial) : !later && !live.has(sk)) bad("final", p, "a state effect needs a `state` guard on its subject that lists no final state, among the guards or in its own `if`");
      d.clause?.push({ subject: sk, type: s.name, state: x });
      return { what: `the state of ${sk}`, successive: false };
    case "party": {
      const r = rec(x, p, ["slot", "from"], ["list"]);
      const sl = r && slot(r["slot"], "party");
      if (!r || !sl) return null;
      const from = r["from"];
      const fp = at(p, "from");
      if ("list" in r) {
        // One member is added to a list, or removed from it.
        if (!sl.list || from === null || (r["list"] !== "add" && r["list"] !== "remove")) bad("shape", at(p, "list"), "is add or remove, of a member, on a list slot");
        else source(from, fp, MEMBER);
        if (ctx.timed && r["list"] === "add") bad("timed-partial", p, "a timed rule adds to no party list: a full list would refuse the transition");
      } else if (Array.isArray(from)) {
        // Section 6.6: a list slot may be set whole, from a list of member operands. There are no more than the list can hold.
        if (!sl.list) bad("shape", fp, "a list of members goes in a list slot");
        else list(from, fp, sl.type.type === "list" ? sl.type.max : 1).forEach((m, i) => source(m, at(fp, i), MEMBER));
      } else if (from !== null) source(from, fp, sl.type);
      // A list that is set whole is recorded as one record for each member that leaves or joins, which the static size of a timed entry does not count.
      if (ctx.timed && sl.list && !("list" in r) && from !== null) bad("timed-partial", p, "a timed rule sets no party list whole");
      return sets(r["slot"], "list" in r);
    }
    case "ref": {
      const r = rec(x, p, ["slot", "from"]);
      const sl = r && slot(r["slot"], "ref");
      if (!r || !sl) return null;
      const from = r["from"];
      if (from === "self") {
        // Section 6.4: `self` is a local reference to the entry being written, and so to the item it opens.
        const item = ctx.nascent && !later && ctx.on !== null && assignable({ type: "item", of: ctx.on.name }, sl.type);
        // Section 6.2: it may fill a slot of type `fact` when the slot's kinds include the kind of the entry being written, under this
        // definition's name: an act's kind, a handler's message, or `timed:` and a rule's key. The entry of an advisory has no kind.
        const fact = !later && ctx.kind !== null && sl.type.type === "fact" && sl.type.kind.includes(ctx.kind) && sl.type.under === d.name;
        if (!item && !fact) bad("name", at(p, "from"), "self is the item this entry opens, in a slot that refers to an item of that type; or this entry, in a slot for a fact of its kind under this definition");
      } else if (from !== null) source(from, at(p, "from"), sl.type);
      return sets(r["slot"]);
    }
    case "value": {
      const r = rec(x, p, ["slot", "from"]);
      const sl = r && slot(r["slot"], "value");
      if (!r || !sl) return null;
      const from = r["from"];
      if (isObject(from) && "time" in from) {
        const t = rec(from, at(p, "from"), ["time"]) && rec(from["time"], at(p, "from"), ["plusSeconds"]);
        // No offset is longer than the whole span a timestamp can name. So the sum with any reading is a number the runtime can
        // compare with that span, and effect derivation refuses a time past it; nothing throws.
        const plus = t && int(t["plusSeconds"], at(p, "from"));
        if (typeof plus === "number" && plus * 1000 > LAST_MS) bad("bound", at(p, "from"), "is longer than the span a timestamp can name");
        // Section 6.4: a timed rule's effects are total. A time derived from the commit clock can pass the last timestamp, which the
        // commit would refuse; and a timed rule ends its deadline by leaving its states, not by moving it.
        if (ctx.timed) bad("timed-partial", p, "a timed rule sets no time from the commit clock");
        if (sl.type.type !== "time") bad("name", p, "the commit time goes in a slot of type time");
      } else if (from !== null) source(from, at(p, "from"), sl.type);
      d.clause?.push({ subject: sk, type: s.name, slot: String(r["slot"]) });
      return sets(r["slot"]);
    }
    case "attribute": {
      const r = rec(x, p, ["slot", "of"], ["with"]);
      const sl = r && slot(r["slot"], "party");
      if (!r || !sl) return null;
      if (!sl.list) bad("name", p, "attribution fills a party list");
      if (ctx.timed) bad("timed-partial", p, "a timed rule takes no attribution: a full list would refuse the transition");
      subject(d, r["of"], at(p, "of"), ctx, false);
      /** A list of members, or a value whose type only the commit knows. */
      const members = (v: unknown, lp: string, inner: Ctx) => {
        const read = operand(d, v, lp, inner, () => s, false);
        if (read?.type && !(read.type.type === "list" && read.type.of.type === "member")) bad("name", lp, "names no list of members");
      };
      // Section 6.7: further sources. The result is the union of the base attribution and every source.
      if ("with" in r) list(r["with"], at(p, "with"), bounds.effects).forEach((w, i) => {
        const wp = at(at(p, "with"), i);
        // The form `each` has a member `list` too, so it is looked for first.
        const wk = isObject(w) ? ["each", "items", "subject", "list"].find((key) => key in w) : undefined;
        if (!wk) { bad("shape", wp, "must be one of: items, subject, each, list"); return; }
        const wo = rec(w, wp, wk === "each" ? ["each", "as", "list"] : wk === "list" ? ["list"] : [wk, "slot"]);
        if (!wo) return;
        if (wk === "each") {
          // A list read from each element of a list, as from each fetched fact that a field names.
          const read = operand(d, wo["each"], at(wp, "each"), ctx, () => s, false);
          const as = str(wo["as"], at(wp, "as"));
          if (as?.includes(".")) { bad("shape", at(wp, "as"), "a dot names a member of a record element, so the name has none"); return; }
          if (!read || as === null) return;
          if (read.type !== null && read.type.type !== "list") { bad("name", at(wp, "each"), "names no list"); return; }
          members(wo["list"], at(wp, "list"), { ...ctx, elements: new Map(ctx.elements).set(as, read.type?.type === "list" ? read.type.of : null) });
        } else if (wk === "list") members(wo["list"], at(wp, "list"), ctx);
        else {
          // A party slot of each local item that a range covers, or of another subject.
          const from: Type | "scope" | null = wk === "items" ? (range(d, wo["items"], at(wp, "items"), ctx, [], false)?.type ?? null) : subject(d, wo["subject"], at(wp, "subject"), ctx, false);
          if (from && from !== "scope" && !(typeof wo["slot"] === "string" && from.slots.get(wo["slot"])?.kind === "party")) bad("name", at(wp, "slot"), `names no party slot of ${from.name}`);
        }
      });
      return sets(r["slot"]);
    }
    case "redact": {
      // Section 6.6: the slot is a detached text. The effect removes the bytes of every text the slot has held, and sets nothing,
      // so a fixed slot may be named. Its entry is the tombstone: who removed the text, when, and under which grant. So it is
      // an act's effect, and no handler, timed rule or result clause has one.
      const r = rec(x, p, ["slot"]);
      if (!r) return null;
      const found = typeof r["slot"] === "string" ? s.slots.get(r["slot"]) : undefined;
      if (found?.kind !== "value" || !isDetached(found.type)) return bad("name", p, `names no value slot of ${s.name} that holds a detached text`);
      if (!ctx.signer || later) bad("shape", p, "a redaction is an effect of an act: its entry records who removed the text, and under which grant");
      return { what: `the texts of slot ${String(r["slot"])} of ${sk}`, successive: false };
    }
    default: {
      const what = holdEffect(d, x, p, s, sk, ctx, nascent);
      return what === null ? null : { what, successive: false };
    }
  }
}

/** The canonical text of a value, or null when it has none. */
const canon = (v: unknown): string | null => {
  try { return canonicalize(v); } catch { return null; }
};

/** True when two guards cannot both hold: an `equals` of one operand with two different constants, or a `state` guard on one subject with two lists that share no state. */
function excludes(a: unknown, b: unknown): boolean {
  if (!isObject(a) || !isObject(b) || "ifPresent" in a || "ifPresent" in b || (a["of"] ?? "on") !== (b["of"] ?? "on")) return false;
  if (Array.isArray(a["state"]) && Array.isArray(b["state"])) return !a["state"].some((state) => (b["state"] as unknown[]).includes(state));
  /** The operand that an `equals` compares with a constant, and that constant. */
  const compared = (g: Rec): [string, string] | null => {
    const e = g["equals"];
    if (!isObject(e) || !isObject(e["a"]) || !isObject(e["b"])) return null;
    const [value, constant] = "const" in e["b"] ? [e["a"], e["b"]] : [e["b"], e["a"]];
    const [x, c] = [canon(value), "const" in constant ? canon(constant["const"]) : null];
    return x === null || c === null || "const" in value ? null : [x, c];
  };
  const [x, y] = [compared(a), compared(b)];
  return x !== null && y !== null && x[0] === y[0] && x[1] !== y[1];
}

/**
 * Section 6.6, "Conditions that exclude each other": at most one of the two
 * effects can apply. An `if` and an `unless` with the same guards; or two
 * `if` lists with a guard each that cannot both hold.
 */
function exclusive(a: Rec, b: Rec): boolean {
  const same = (x: unknown, y: unknown) => x !== undefined && y !== undefined && canon(x) !== null && canon(x) === canon(y);
  if (same(a["if"], b["unless"]) || same(a["unless"], b["if"])) return true;
  const [x, y] = [a["if"], b["if"]];
  return Array.isArray(x) && Array.isArray(y) && x.some((g) => y.some((h) => excludes(g, h)));
}

/** The effects of one act, handler, timed rule or result clause, in the order written. */
export function effects(d: Defining, v: unknown, path: string, ctx: Ctx, later: boolean): void {
  const { bounds, bad, list } = d;
  const set: (Sets & { written: Rec })[] = [];
  list(v, path, bounds.effects).forEach((e, i) => {
    if (d.platform && marked(e)) {
      // Section 6.1, place 5: a mark is one effect of the written list of an act, a handler or a result clause. It has no `of`,
      // `if` or `unless`. A timed rule's effects are total (section 6.4), and no rule is shown to be total, so a timed rule holds
      // none. Nothing is derived from a mark: it conflicts with no written effect, and what it can set is not counted here (the
      // contract's point R1-59).
      if (ctx.timed) bad("timed-partial", at(path, i), "a timed rule's effects are total, so none is a mark");
      else mark(d, e, at(path, i), "effect");
      return;
    }
    const sets = effect(d, e, at(path, i), ctx, later);
    if (sets === null) return;
    if (ctx.timed && isObject(e) && !onSubject(e["of"])) bad("timed", at(path, i), "a timed rule changes its own item only");
    // Section 6.3: no two effects set the same slot of the same subject, or its state. Section 6.6 allows a pair whose conditions
    // exclude each other, and successive changes of one party list, which apply in the order written.
    const other = set.find((earlier) => earlier.what === sets.what && !(earlier.successive && sets.successive) && !exclusive(earlier.written, e as Rec));
    if (other) bad("conflict", at(path, i), `another effect also sets ${sets.what}`);
    set.push({ ...sets, written: e as Rec });
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
  if ("value" in e) return stated(e.value.slot) + (e.value.from !== null && "const" in e.value.from ? stated(e.value.from.const) : e.value.from !== null && "slot" in e.value.from ? held(e.value.from.slot) : 26);
  return 0;
}
