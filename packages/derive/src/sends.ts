/**
 * Send derivation (scope contract, sections 6.4, 6.6, 7.2 and 7.3). Each
 * send that is made takes the next ordinal, in the order of the forms, and a
 * fan-out's sends in the order of their items. A send reads the fields and
 * each subject as the entry's effects left it. Its condition is judged on
 * the state before them.
 */

import type { Digest, FactRef, FieldType, Guard, Input, Notify, Operand, Range, Seed, SelfMark, Send, SendForm, SendSource, ScopeRef, UnavailableReason } from "@generalbusiness/artroom-contract";
import type { Derived } from "./effects.ts";
import { judgeGuards, readsUnbound, slotOf, type Judging } from "./guards.ts";
import { equal, operand } from "./operand.ts";
import type { Item } from "./state.ts";
import type { ValidDefinition } from "./validate/index.ts";
import { isLocalId, isObject, isScopeRef, own } from "./values.ts";

/** What the send forms of one input made. */
export type Sends = Derived<{ sends: Send[] }>;

/**
 * Section 6.6, "Where an `index` send goes": the directory that a scope
 * records at its genesis. It is its creator, when that is a directory;
 * otherwise the directory that its creator recorded, which the platform puts
 * in every `create` of a lane. Null: the scope has none.
 */
export function directoryOf(genesis: Pick<Extract<Input, { type: "genesis" }>, "seed" | "message">): ScopeRef | null {
  const creator = genesis.seed.creator;
  if (creator?.kind === "directory") return creator;
  const named = isObject(genesis.message?.body) ? genesis.message.body["directory"] : null;
  return isScopeRef(named) && named.kind === "directory" ? named : null;
}

/** True when a guard of the list, as written at the top of it, reads the clock. */
export const readsClock = (guards: readonly Guard[] | undefined): boolean => (guards ?? []).some((g) => "before" in g || "after" in g);

/** True when the condition of a send or of a notice reads the clock: the entry then judges time (section 5.3). */
export const conditionsReadClock = (sends: readonly SendForm[], attention: readonly Notify[]): boolean =>
  sends.some((s) => readsClock("tell" in s ? s.tell.if : "relate" in s ? s.relate.if : undefined)) || attention.some((n) => readsClock(n.notify.if));

/**
 * Section 6.6: a send with `if` is made only when every guard holds, on the
 * state before the entry's effects. One whose `if` reads an unbound subject
 * is not made. The guards are one list with three results: when none is
 * false and one is not completed, the input is not judged. Effect derivation
 * judges the `if` of a notice by the same rule.
 */
function holds(j: Judging, guards: readonly Guard[] | undefined): boolean | UnavailableReason {
  if (readsUnbound(j, guards ?? [])) return false;
  const { result } = judgeGuards(j, guards ?? []);
  return result === "pass" ? true : result === "fail" ? false : result;
}

/**
 * `cause` is the seed cause of any scope this input creates (section 7.2):
 * an act's intent digest, a delivery's delivery cause digest, or a genesis's
 * own seed digest. `first` is the ordinal of the first written send: 1 in a
 * child's genesis, whose result is at ordinal 0. `recorded`: the directory
 * that the scope records, when the entry being written is its genesis. Any
 * later entry reads it from the genesis entry.
 */
export function deriveSends(j: Judging, forms: readonly SendForm[], working: ReadonlyMap<string, Item>, cause: Digest, first = 0, recorded?: ScopeRef | null): Sends {
  const items = j.definition.declared.items;
  const on = working.get("on") ?? null;
  let unresolved: string | null = null;
  /** A send reads each subject as the effects left it. `each`: the item of a fan-out send. */
  const reading = (each: Item | null): Judging => ({ ...j, subjects: working, each: each ?? undefined });

  // I2 merge: the directory could be a member of the scope's state, which the fold sets from the genesis entry. The fold is
  // another step's module, so it is read from the genesis entry here.
  let directory = recorded;
  /** The directory this scope records. Undefined: its genesis entry cannot be read now. */
  const recordedDirectory = (): ScopeRef | null | undefined => {
    const genesis = directory === undefined ? j.own?.(0)?.entry.input : undefined;
    if (genesis?.type === "genesis") directory = directoryOf(genesis);
    return directory;
  };

  const slotType = (item: Item | null | undefined, slot: string): FieldType | null => {
    const type = item ? own(items, item.type) : undefined;
    return own(type?.refs, slot)?.to ?? own(type?.values, slot)?.of ?? null;
  };
  /**
   * The type of an operand's value, when the definition states it: what tells a
   * local reference, which is not sent as a number, from a number. A part
   * reads inside an entry of some scope, and what it finds there is sent as it
   * is; the part `ref` is the reference itself.
   */
  const typeOf = (o: Operand, each: Item | null): FieldType | null => {
    if ("item" in o) return { type: "item", of: "" };
    if (!("field" in o || "slot" in o) || (o.part !== undefined && o.part !== "ref")) return null;
    return "field" in o ? (own(j.fieldTypes, o.field) ?? null) : slotType(o.of === undefined ? on : o.of === "each" ? each : working.get(o.of), o.slot);
  };
  /**
   * Section 6.4: a local reference is not sent as a number. The entry being
   * written is sent as the `self` mark, which the receiver reads as the
   * envelope's `from`; an earlier entry is sent as its fact reference, whose
   * hash already exists.
   */
  const local = (id: unknown): SelfMark | FactRef | null => {
    if (id === j.self) return { self: true };
    const opened = isLocalId(id) ? j.view.item(id)?.opened : null;
    if (!opened) unresolved = `item ${String(id)}`;
    return opened ? { at: j.scope.at, seq: id as number, hash: opened } : null;
  };
  /**
   * Section 6.4: a local entry reference is sent as that entry's fact
   * reference, and as the `self` mark when it is the entry being written. A
   * fact that names another scope is sent as it is.
   */
  const fact = (v: unknown): unknown => {
    if (!isLocalId(v)) return v;
    if (v === j.self) return { self: true } satisfies SelfMark;
    const kept = j.own?.(v);
    if (!kept) unresolved = `entry ${v}`;
    return kept ? ({ at: j.scope.at, seq: v, hash: kept.hash } satisfies FactRef) : null;
  };
  const wire = (value: unknown, type: FieldType | null): unknown => {
    if (value === null) return null;
    if (type?.type === "item") return local(value);
    if (type?.type === "fact") return fact(value);
    const each = type?.type === "list" && Array.isArray(value) ? (type.of.type === "item" ? local : type.of.type === "fact" ? fact : null) : null;
    return each ? (value as unknown[]).map(each) : value;
  };

  /**
   * The items a range covers, in ascending order of item ID, as the index
   * holds them: the items of the state before this entry. The range lists live
   * states only, and a type's `max` bounds its live items, so one page is all
   * of them. Null: the page is more than one guard may read, so the range has
   * no complete evidence.
   */
  const covered = (range: Range, reading: Judging): readonly Item[] | null => {
    const most = own(items, range.type)!.max;
    const page = most > j.bounds.guardScan ? null : j.view.page(range.type, range.states, null, most);
    if (!page || page.more) return null;
    const except = new Set((range.except ?? []).map((s) => working.get(s)?.id));
    return page.items.filter((item) => !except.has(item.id) && (range.where ?? []).every((w) =>
      ("equals" in w ? equal(reading, operand(reading, w.equals.a, item), operand(reading, w.equals.b, item)) : !equal(reading, operand(reading, w.differs.a, item), operand(reading, w.differs.b, item)))));
  };

  let incomplete = false;
  /** A source's value as it is sent. `each`: the item of a fan-out send. */
  const sent = (s: SendSource, each: Item | null): unknown => {
    if (s === "self") return wire(j.self, { type: "item", of: "" });
    if (!("collect" in s)) return wire(operand(reading(each), s, on), typeOf(s, each));
    // Section 6.6: one record for each item the range covers, with the named members. A member whose slot is empty is left out.
    const all = covered(s.collect.items, reading(each));
    if (!all) incomplete = true;
    return (all ?? []).map((item) => Object.fromEntries(Object.entries(s.collect.fields)
      .map(([name, member]) => [name, member === "item" ? local(item.id) : member === "state" ? item.state : wire(slotOf(item, member), slotType(item, member))] as const)
      .filter(([, v]) => v !== null)));
  };
  /** An absent value is left out of a message, as an absent field is left out of an intent. */
  const fields = (sources: Record<string, SendSource>, each: Item | null = null) => Object.fromEntries(Object.entries(sources).map(([name, s]) => [name, sent(s, each)] as const).filter(([, v]) => v !== null));

  const sends: Send[] = [];
  const relations = new Set<string>();
  let creations = 0;
  for (const [i, form] of forms.entries()) {
    const refuse = (what: string) => ({ ok: false, reason: "send-unresolved", detail: `sends.${i}: ${what}` }) as const;
    const next = () => first + sends.length;
    if ("create" in form) {
      // Section 7.2: the seed names this scope as creator, the input's cause, and which creation of that input this is.
      // Section 6.6: `self` is this scope's own pinned definition, which a definition cannot name by digest.
      const definition = form.create.definition === "self" ? j.definition.digest : form.create.definition;
      const seed: Seed = { v: 1, kind: form.create.kind, definition, creator: j.scope.at, cause, ordinal: creations++ };
      // Section 6.6: the platform puts the directory in every `create` of a lane: this scope, when it is one, or the one it records.
      const lanes = form.create.kind !== "lane" ? null : j.scope.at.kind === "directory" ? j.scope.at : recordedDirectory();
      if (lanes === undefined) return { ok: false, unavailable: "unavailable" };
      sends.push({ n: next(), to: seed, message: { class: "request", type: "create", body: { fields: fields(form.create.fields), ...(lanes ? { directory: lanes } : {}) } } });
    } else if ("tell" in form) {
      // Section 6.4: a send whose subject is unbound is not made.
      if (readsUnbound(reading(null), form.tell.to)) continue;
      const made = holds(j, form.tell.if);
      if (typeof made === "string") return { ok: false, unavailable: made };
      if (!made) continue;
      // Section 6.6: a `tell` is addressed by a reference slot, read after the entry's effects.
      const to = sent(form.tell.to, null);
      if (!isScopeRef(to)) return refuse(`the slot ${form.tell.to.slot} holds no scope`);
      sends.push({ n: next(), to, message: { class: "request", type: "tell", body: { message: form.tell.message, fields: fields(form.tell.fields) } } });
    } else if ("relate" in form) {
      const { relate } = form;
      if (readsUnbound(reading(null), [relate.to, relate.item])) continue;
      // Section 6.6: a fan-out makes one send for each item that its range covers, in ascending order of item ID.
      const all = relate.each ? covered(relate.each, reading(null)) : [null];
      if (!all) return { ok: false, unavailable: "guard-incomplete" };
      for (const each of all) {
        const made = holds(each ? { ...j, each } : j, relate.if);
        if (typeof made === "string") return { ok: false, unavailable: made };
        if (!made) continue;
        const to = relate.to === "self" || "collect" in relate.to ? null : operand(reading(each), relate.to, on);
        const item = relate.item === "self" ? j.self : "collect" in relate.item ? null : operand(reading(each), relate.item, on);
        if (!isScopeRef(to)) return refuse("the target is not a scope");
        if (!isLocalId(item)) return refuse("the item is not a local item");
        // Section 6.4: the key is the target by its scope ID, the item by its local ID, and the name as written.
        const key = JSON.stringify([to.scope, item, relate.name]);
        if (relations.has(key)) return { ok: false, reason: "duplicate-relation", detail: `sends.${i}` };
        relations.add(key);
        sends.push({ n: next(), to, message: { class: "request", type: "relate", body: { name: relate.name, item: local(item), state: relate.state, detail: fields(relate.detail, each) } } });
      }
    } else {
      // Section 6.6: a projection row goes to the scope's directory. A scope with no directory has no `index` send.
      const to = recordedDirectory();
      if (to === undefined) return { ok: false, unavailable: "unavailable" };
      if (to !== null) sends.push({ n: next(), to, message: { class: "advisory", type: "index", body: { fields: fields(form.index.fields) } } });
    }
    if (incomplete) return { ok: false, unavailable: "guard-incomplete" };
    if (unresolved !== null) return refuse(unresolved);
  }
  return { ok: true, sends };
}

/**
 * The form that made one recorded send of an entry (section 7.4): a result
 * names its request by ordinal, and a send that was not made took none. The
 * forms and the entry's sends are in one order, so each send is matched to
 * the first form, at or after the last one matched, that makes a message of
 * its type and name. A fan-out may have made the next send too. The
 * validator refuses a list in which that could find the wrong clause.
 */
export function formOf(definition: ValidDefinition, forms: readonly SendForm[], entry: { sends: readonly Send[] }, n: number): SendForm | null {
  const made = (form: SendForm, { to, message }: Send): boolean => {
    if (message.class === "advisory") return "index" in form && message.type === "index";
    if (message.class !== "request" || !isObject(message.body)) return false;
    if ("create" in form) return message.type === "create" && !isScopeRef(to) && to.kind === form.create.kind && to.definition === (form.create.definition === "self" ? definition.digest : form.create.definition);
    if ("tell" in form) return message.type === "tell" && message.body["message"] === form.tell.message;
    return "relate" in form && message.type === "relate" && message.body["name"] === form.relate.name && message.body["state"] === form.relate.state;
  };
  let at = 0;
  for (const send of entry.sends.filter((s) => s.message.class === "request" || s.message.class === "advisory").sort((a, b) => a.n - b.n)) {
    while (at < forms.length && !made(forms[at]!, send)) at++;
    const form = forms[at];
    if (!form) return null;
    if (send.n === n) return form;
    if (!("relate" in form && form.relate.each)) at++;
  }
  return null;
}
