/**
 * Send derivation (scope contract, sections 6.4, 6.6, 7.2 and 7.3). Sends
 * take their ordinals in the order written. Each is resolved from the fields
 * and from the primary item as the effects left it.
 */

import type { Digest, FactRef, FieldType, Seed, SelfMark, Send, SendForm, SendSource, ScopeRef } from "@generalbusiness/artroom-contract";
import type { Derived } from "./effects.ts";
import { slotOf, type Judging } from "./guards.ts";
import type { Item } from "./state.ts";
import { isLocalId, isScopeRef } from "./values.ts";

/**
 * `cause` is the seed cause of any scope this input creates (section 7.2):
 * for an act, its intent digest.
 */
export function deriveSends(j: Judging, forms: readonly SendForm[], working: ReadonlyMap<string, Item>, cause: Digest): Derived<{ sends: Send[] }> {
  const on = working.get("on") ?? null;
  const onType = on ? j.definition.declared.items[on.type]! : null;
  const slotType = (slot: string): FieldType | null => (onType?.refs[slot]?.to ?? onType?.values[slot]?.of ?? null);
  let unresolved: string | null = null;

  /** A source's value as it is held here, and its type when the definition states one. `self` is the entry being written. */
  const held = (s: SendSource): { value: unknown; type: FieldType | null } => {
    if (s === "self") return { value: j.self, type: { type: "item", of: "" } };
    if ("field" in s) return { value: j.fields[s.field] ?? null, type: j.fieldTypes[s.field] ?? null };
    if ("slot" in s) return { value: on ? slotOf(on, s.slot) : null, type: slotType(s.slot) };
    return { value: "signer" in s ? (j.signer?.member ?? null) : s.const, type: null };
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
  const wire = (s: SendSource): unknown => {
    const { value, type } = held(s);
    if (value === null) return null;
    if (type?.type === "item") return local(value);
    return type?.type === "list" && type.of.type === "item" && Array.isArray(value) ? value.map(local) : value;
  };
  /** An absent value is left out of a message, as an absent field is left out of an intent. */
  const fields = (sources: Record<string, SendSource>) => Object.fromEntries(Object.entries(sources).map(([name, s]) => [name, wire(s)] as const).filter(([, v]) => v !== null));

  const sends: Send[] = [];
  const relations = new Set<string>();
  let creations = 0;
  for (const [n, form] of forms.entries()) {
    const refuse = (what: string) => ({ ok: false, reason: "send-unresolved", detail: `sends.${n}: ${what}` }) as const;
    if ("create" in form) {
      // Section 7.2: the seed names this scope as creator, the input's cause, and which creation of that input this is.
      const seed: Seed = { v: 1, kind: form.create.kind, definition: form.create.definition, creator: j.scope.at, cause, ordinal: creations++ };
      sends.push({ n, to: seed, message: { class: "request", type: "create", body: { fields: fields(form.create.fields) } } });
    } else if ("tell" in form) {
      const to = on ? slotOf(on, form.tell.to) : null;
      if (!isScopeRef(to)) return refuse(`the slot ${form.tell.to} holds no scope`);
      sends.push({ n, to, message: { class: "request", type: "tell", body: { message: form.tell.message, fields: fields(form.tell.fields) } } });
    } else if ("relate" in form) {
      const to = held(form.relate.to).value;
      const item = held(form.relate.item).value;
      if (!isScopeRef(to)) return refuse("the target is not a scope");
      if (!isLocalId(item)) return refuse("the item is not a local item");
      // Section 6.4: the key is the target by its scope ID, the item by its local ID, and the name as written.
      const key = JSON.stringify([to.scope, item, form.relate.name]);
      if (relations.has(key)) return { ok: false, reason: "duplicate-relation", detail: `sends.${n}` };
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
