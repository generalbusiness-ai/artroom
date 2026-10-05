/**
 * Send derivation (scope contract, sections 6.4, 6.6, 7.2 and 7.3). Sends
 * take their ordinals in the order written. Each is resolved from the fields
 * and from the primary item as the effects left it.
 */

import type { Digest, FactRef, FieldType, Seed, SelfMark, Send, SendForm, SendSource, ScopeRef } from "@generalbusiness/artroom-contract";
import type { Derived } from "./effects.ts";
import { slotOf, type Judging } from "./guards.ts";
import type { Item } from "./state.ts";
import { unsupported } from "./unsupported.ts";
import { isLocalId, isScopeRef, own } from "./values.ts";

/**
 * `cause` is the seed cause of any scope this input creates (section 7.2):
 * an act's intent digest, a delivery's delivery cause digest, or a genesis's
 * own seed digest. `first` is the ordinal of the first written send: 1 in a
 * child's genesis, whose result is at ordinal 0.
 */
export function deriveSends(j: Judging, forms: readonly SendForm[], working: ReadonlyMap<string, Item>, cause: Digest, first = 0): Derived<{ sends: Send[] }> {
  const on = working.get("on") ?? null;
  const onType = on ? own(j.definition.declared.items, on.type)! : null;
  const slotType = (slot: string): FieldType | null => (own(onType?.refs, slot)?.to ?? own(onType?.values, slot)?.of ?? null);
  let unresolved: string | null = null;

  /** A source's value as it is held here, and its type when the definition states one. `self` is the entry being written. */
  const held = (s: SendSource): { value: unknown; type: FieldType | null } => {
    if (s === "self") return { value: j.self, type: { type: "item", of: "" } };
    if ("field" in s) return { value: own(j.fields, s.field) ?? null, type: own(j.fieldTypes, s.field) ?? null };
    if ("slot" in s) return { value: on ? slotOf(on, s.slot) : null, type: slotType(s.slot) };
    return { value: "signer" in s ? (j.signer?.member ?? null) : "const" in s ? s.const : unsupported("that source of a send"), type: null };
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
  const wire = (s: SendSource): unknown => {
    const { value, type } = held(s);
    if (value === null) return null;
    if (type?.type === "item") return local(value);
    if (type?.type === "fact") return fact(value);
    const each = type?.type === "list" && Array.isArray(value) ? (type.of.type === "item" ? local : type.of.type === "fact" ? fact : null) : null;
    return each ? (value as unknown[]).map(each) : value;
  };
  /** An absent value is left out of a message, as an absent field is left out of an intent. */
  const fields = (sources: Record<string, SendSource>) => Object.fromEntries(Object.entries(sources).map(([name, s]) => [name, wire(s)] as const).filter(([, v]) => v !== null));

  const sends: Send[] = [];
  const relations = new Set<string>();
  let creations = 0;
  for (const [i, form] of forms.entries()) {
    const n = first + i;
    const refuse = (what: string) => ({ ok: false, reason: "send-unresolved", detail: `sends.${i}: ${what}` }) as const;
    if ("create" in form) {
      // Section 7.2: the seed names this scope as creator, the input's cause, and which creation of that input this is.
      const definition = form.create.definition === "self" ? unsupported("a creation under the creator's own definition") : form.create.definition;
      const seed: Seed = { v: 1, kind: form.create.kind, definition, creator: j.scope.at, cause, ordinal: creations++ };
      sends.push({ n, to: seed, message: { class: "request", type: "create", body: { fields: fields(form.create.fields) } } });
    } else if ("tell" in form) {
      const slot = typeof form.tell.to === "string" ? form.tell.to : unsupported("a tell addressed by a slot of any subject");
      const to = on ? slotOf(on, slot) : null;
      if (!isScopeRef(to)) return refuse(`the slot ${slot} holds no scope`);
      sends.push({ n, to, message: { class: "request", type: "tell", body: { message: form.tell.message, fields: fields(form.tell.fields) } } });
    } else if ("relate" in form) {
      const to = held(form.relate.to).value;
      const item = held(form.relate.item).value;
      if (!isScopeRef(to)) return refuse("the target is not a scope");
      if (!isLocalId(item)) return refuse("the item is not a local item");
      // Section 6.4: the key is the target by its scope ID, the item by its local ID, and the name as written.
      const key = JSON.stringify([to.scope, item, form.relate.name]);
      if (relations.has(key)) return { ok: false, reason: "duplicate-relation", detail: `sends.${i}` };
      relations.add(key);
      sends.push({ n, to, message: { class: "request", type: "relate", body: { name: form.relate.name, item: local(item), state: form.relate.state, detail: fields(form.relate.detail) } } });
    } else {
      // Section 6.6: a projection row to the directory. A lane's directory is the scope that created it.
      const to: ScopeRef | null = j.scope.creator;
      if (!to) return refuse("this scope has no creator to index it");
      sends.push({ n, to, message: { class: "advisory", type: "index", body: { fields: fields(form.index.fields) } } });
    }
    if (unresolved !== null) return refuse(unresolved);
  }
  return { ok: true, sends };
}
