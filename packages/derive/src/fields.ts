/**
 * How the fields of an input are read (scope contract, sections 5.2 and
 * 6.2): each field against its declared type, the foreign facts the fields
 * name, and the local items they name. The judges share this, with the one
 * reading of a commit that every judge is given.
 */

import type { ActType, Bounds, Digest, Entry, FactRef, FactUse, FieldType, FieldValue, Prepared } from "@generalbusiness/artroom-contract";
import { canonicalBytes, digestBytes, entryHash, isIntent } from "@generalbusiness/artroom-bytes";
import type { Fetched, RuleInput } from "./guards.ts";
import type { StateView } from "./state.ts";
import type { Clock } from "./time.ts";
import { byteOrder, isValue, own, same } from "./values.ts";

/** What every judge is given: the one reading of the commit, the bounds, and the retained inputs. */
export interface Reading {
  clock: Clock;                         // the one reading of this commit (section 5.3); see `clockOf`
  bounds: Bounds;
  facts: readonly Fetched[];            // fetched before the turn; each entry's bytes already checked against its hash
  prepared: readonly Prepared[];        // the rule results of preparation (section 5.2, step 5)
  asked?: RuleInput[] | undefined;      // set by `prepareRules` only
}

/** The shape of section 2.1, which the bytes package guards beside the contract's other fixed records. */
export { isIntent };

/** Each value in a field with the type it must have: the field itself, or each element of a list. */
function leaves(type: FieldType, value: FieldValue): [FieldType, FieldValue][] {
  return type.type === "list" ? (value as readonly FieldValue[]).flatMap((v) => leaves(type.of, v)) : [[type, value]];
}

/** Section 6.2: each field is required or optional, an optional field may have a default, and an unknown field is refused. */
export function readFields(types: ActType["fields"], given: Readonly<Record<string, unknown>>, bounds: Bounds): { ok: true; fields: Record<string, FieldValue> } | { ok: false; detail: string } {
  // Each name is set as an own property, whatever the name is (`own`, in values.ts).
  const fields: [string, FieldValue][] = [];
  for (const name of Object.keys(given)) if (!Object.hasOwn(types, name)) return { ok: false, detail: `${name} is not a field of this act` };
  for (const [name, type] of Object.entries(types)) {
    const value = Object.hasOwn(given, name) ? given[name] : type.default;
    if (value === undefined && type.required) return { ok: false, detail: `${name} is required` };
    if (value === undefined) continue;
    if (!isValue(type, value, bounds)) return { ok: false, detail: `${name} is not a value of its type` };
    fields.push([name, value as FieldValue]);
  }
  return { ok: true, fields: Object.fromEntries(fields) };
}

/**
 * Every foreign fact the fields name, once each, in the byte order of the
 * field names: what step 1 of section 5.2 fetches before the turn. `fields`
 * are values of their types, as `readFields` returns them.
 */
export function factsNamed(types: ActType["fields"], fields: Readonly<Record<string, FieldValue>>): FactRef[] {
  const named = new Map<Digest, FactRef>();
  for (const name of Object.keys(fields).sort(byteOrder)) {
    const declared = own(types, name);
    if (!declared) continue;
    for (const [type, value] of leaves(declared, fields[name]!)) if (type.type === "fact" && !named.has((value as FactRef).hash)) named.set((value as FactRef).hash, value as FactRef);
  }
  return [...named.values()];
}

/** `no-item` carries the foreign facts read before the missing item, so an entry that records that refusal records them (section 9.2). */
export type Facts = { result: "read"; facts: Map<Digest, Fetched>; uses: FactUse[] } | { result: "no-item"; detail: string; uses: FactUse[] } | { result: "unavailable" };

/** What a use records of a foreign entry: the entry by fact, and the digest of its canonical bytes (section 9.2). */
export const useOf = (fact: FactRef, entry: Entry): FactUse => ({ fact, content: digestBytes(canonicalBytes(entry)) });

/** True when `entry` is the entry that `fact` names. */
export const isEntryOf = (entry: Entry, fact: FactRef): boolean => entry.seq === fact.seq && same(entry.at, fact.at) && entryHash(entry) === fact.hash;

/**
 * What the fields name: local items, which must exist, and foreign facts,
 * which must have been fetched. In the byte order of the field names.
 *
 * Section 6.5: a fact reference is verified whole. Every reference is checked
 * against the fetched entry, by scope, incarnation, position and hash, before
 * anything is deduplicated. So a later reference with the hash of a verified
 * one and another scope or position is not taken for it, and two references
 * that both pass are one reference: the map by hash and the list of uses
 * then hold that fact once.
 */
export function readFacts(view: StateView, types: ActType["fields"], fields: Readonly<Record<string, FieldValue>>, available: readonly Fetched[]): Facts {
  const facts = new Map<Digest, Fetched>();
  const uses: FactUse[] = [];
  for (const name of Object.keys(fields).sort(byteOrder)) {
    // A field with no declared type, as a handler's message has, names no item and no fact here.
    const declared = own(types, name);
    if (!declared) continue;
    for (const [type, value] of leaves(declared, fields[name]!)) {
      if (type.type === "item" && view.item(value as number)?.type !== type.of) return { result: "no-item", detail: `${name} names no ${type.of}`, uses };
      if (type.type !== "fact") continue;
      const ref = value as FactRef;
      const fetched = available.find((f) => f.fact.hash === ref.hash);
      // Section 5.2, step 1: a foreign entry that was not fetched, or is not the entry the reference names, is a dependency that is not available.
      if (!fetched || !isEntryOf(fetched.entry, ref)) return { result: "unavailable" };
      if (facts.has(ref.hash)) continue;
      facts.set(ref.hash, fetched);
      uses.push(useOf(ref, fetched.entry));
    }
  }
  return { result: "read", facts, uses };
}
