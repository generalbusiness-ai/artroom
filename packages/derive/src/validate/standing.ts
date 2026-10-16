/** C1's closed platform declaration and its bounded native read plan. */
import type { StandingReservation } from "@generalbusiness/dap-contract";
import { byteOrder, isObject, own } from "../values.ts";
import type { Defining } from "./context.ts";

export interface Standing extends StandingReservation { readonly states: readonly string[] }
const natural = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);

export function standingOf(d: Defining, value: unknown, rawItems: unknown): Standing | null {
  const o = d.rec(value, "standing", ["item", "slot", "entries", "max"]);
  if (!o) return null;
  const ill = (path: string, message: string): null => d.bad("unsupported-definition", `standing.${path}`, message);
  const item = typeof o["item"] === "string" ? d.types.get(o["item"]) : undefined;
  const rawItem = isObject(rawItems) && typeof o["item"] === "string" ? own(rawItems, o["item"]) : null;
  if (!item || !isObject(rawItem) || rawItem["many"] !== false || rawItem["max"] !== 1) return ill("item", "names one singleton item type with many:false and max:1");
  const slot = typeof o["slot"] === "string" ? item.slots.get(o["slot"]) : undefined;
  if (!slot || slot.kind !== "value" || !slot.required || slot.fixed || slot.type.type !== "int" || slot.type.min !== 0 || Object.is(slot.type.min, -0) || Object.is(slot.type.max, -0)) return ill("slot", "names a required mutable integer value slot with min:0");
  if (!natural(o["entries"]) || o["entries"] < 1) return ill("entries", "is a positive safe integer");
  if (!natural(o["max"]) || slot.type.max !== o["max"]) return ill("max", "is the slot's exact nonnegative safe integer maximum");
  const rawSlots = rawItem["values"], rawSlot = isObject(rawSlots) ? own(rawSlots, o["slot"] as string) : null;
  if (slot.hasDefault && (!isObject(rawSlot) || rawSlot["default"] !== 0 || Object.is(rawSlot["default"], -0))) return ill("slot", "has no default or exactly the default 0");
  const total = o["entries"] * o["max"];
  if (!Number.isSafeInteger(total) || total > d.bounds.scopeEntries) return ill("entries", "entries times max fits the safe scope-entry bound");
  return { item: item.name, slot: o["slot"] as string, entries: o["entries"], max: o["max"], states: [...item.states.keys()].sort(byteOrder) };
}
