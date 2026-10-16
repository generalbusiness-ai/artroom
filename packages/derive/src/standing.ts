/** C1's bounded singleton selection and shared prospective counter check. */
import type { Effect } from "@generalbusiness/dap-contract";
import { changeItem, newItem } from "./item-effects.ts";
import type { Item, StateView } from "./state.ts";
import type { ValidDefinition } from "./validate/index.ts";
import { isObject, own } from "./values.ts";

export class StandingError extends Error { override readonly name = "StandingError"; }
const invalid = (message: string): never => { throw new StandingError(message); };
const natural = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
export interface StandingCounter { readonly item: Item | null; readonly count: number }

/** No state reads for an old definition. For C1, count each declared state
 * and page only the sole positive one, at limit1 (at most2 native bodies,
 * including its ambiguity detector). Final items remain participants. */
export function standingCounter(view: StateView, definition: ValidDefinition): StandingCounter {
  const term = definition.standing;
  if (!term) return { item: null, count: 0 };
  try {
    let total = 0, selected: string | null = null;
    for (const state of term.states) {
      const count = view.count(term.item, state);
      if (!natural(count) || count > 1 || total + count > 1) return invalid("standing singleton count is invalid");
      total += count;
      if (count === 1) selected = state;
    }
    if (total === 0) return { item: null, count: 0 };
    const page = view.page(term.item, [selected!], null, 1);
    if (page.more !== false || !Array.isArray(page.items) || page.items.length !== 1) return invalid("standing singleton page disagrees with its count");
    const item = page.items[0]!;
    if (!isObject(item as unknown) || !natural(item.id) || item.type !== term.item || item.state !== selected || !isObject(item.values)) return invalid("standing singleton item is invalid");
    const count = own(item.values, term.slot);
    if (!natural(count) || count > term.max) return invalid("standing counter is invalid");
    return { item, count };
  } catch (error) {
    if (error instanceof StandingError) throw error;
    return invalid("standing singleton cannot be read");
  }
}

export function standingEntries(view: StateView, definition: ValidDefinition): number {
  const term = definition.standing;
  if (!term) return 0;
  const amount = term.entries * (term.max - standingCounter(view, definition).count);
  if (!natural(amount)) return invalid("standing entry amount is invalid");
  return amount;
}

/** Uses the existing item transformations, never a second slot interpreter.
 * Judgment checks derived effects; fold independently checks recorded ones
 * before writing them. Only the participating singleton is projected. */
export function checkStandingEntry(view: StateView, definition: ValidDefinition, effects: readonly Effect[], seq: number): void {
  const term = definition.standing;
  if (!term) return;
  const before = standingCounter(view, definition);
  let current = before.item;
  try {
    for (const effect of effects) {
      if (effect.effect === "open") {
        if (effect.type === term.item) {
          if (current || effect.item !== seq) return invalid("standing singleton cannot be replaced or opened twice");
          current = newItem(effect, definition.declared.items[term.item]!, null);
        } else if (current && effect.item === current.id) return invalid("standing singleton identity cannot change");
        continue;
      }
      switch (effect.effect) {
        case "state": case "party": case "list": case "ref": case "value": case "hold":
          if (current && effect.item === current.id) current = changeItem(current, effect, definition, null);
      }
    }
    if (!current) {
      if (before.item) return invalid("standing singleton cannot disappear");
      return; // pre-opening absence reserves the full term
    }
    const count = own(current.values, term.slot);
    if (!natural(current.id) || current.type !== term.item || !term.states.includes(current.state) || !natural(count) || count > term.max) return invalid("prospective standing counter is invalid");
    if (before.item && current.id !== before.item.id || count < before.count) return invalid("standing counter cannot decrease or change identity");
  } catch (error) {
    if (error instanceof StandingError) throw error;
    return invalid("prospective standing singleton cannot be read");
  }
}
