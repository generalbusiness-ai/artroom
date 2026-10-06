/**
 * The counts of a holder, as the entries move them (scope contract,
 * revision 23, section 17.2a: "The words", "A draw", "`for`", "Past a
 * count" and "Release"). One function says what one entry does to the
 * counts, on the state before it. The judges ask it of the entry that they
 * derived, and a fault leaves the input not judged. The fold asks it of the
 * entry that it applies, and writes what it gives. A verifier asks it of a
 * recorded entry, and reports a fault as a mismatch. So the three cannot
 * differ.
 *
 * | The entry | Its account | What it does to the counts |
 * |---|---|---|
 * | The entry that opens a holder: the taking entry | That item | Sets them to the type's `holds`. Then it draws. |
 * | An act whose form states `adds`, on a holder: an adding entry | That item | Adds the act's `adds`. Then it draws. |
 * | An outcome entry | The holder that its operation is `for`, or none | Draws. |
 * | A delivery of a result, and a diagnosis | The account of the entry that sent the request | Draws. |
 * | A bound delivery of a request | Its bound item | Draws 1 decision of that message, then draws for what it sends. |
 * | Every other entry | None | Nothing of an account. An `operation` effect still draws on the holder that it is `for`. |
 *
 * A draw is 1 from a count: of its kind, for an `operation` effect whose
 * `for` names the holder; of `requests`, for a request among the sends of
 * an entry that has an account; of `items`, for an item that such an entry
 * opens, other than the holder itself.
 */

import type { Bounds, Effect, Entry, Held } from "@generalbusiness/artroom-contract";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import { isPlatformDefinition } from "@generalbusiness/artroom-bytes";
import { operationSettled } from "./ledger.ts";
import { decisionBinding } from "./handlers.ts";
import type { PlatformRules } from "./marks.ts";
import type { Account, StateView } from "./state.ts";
import type { ValidDefinition } from "./validate/index.ts";
import { isLocalId, own } from "./values.ts";

/**
 * Section 17.2a, "Past a count": the entry would open an operation of a held
 * kind with no `for`, for an item that is no holder, or for a kind that no
 * item holds: `no-holder`. Or it would draw when the count is 0:
 * `past-count`. Nothing is written.
 */
export interface DrawFault { fault: "past-count" | "no-holder"; detail: string }

/**
 * What one entry does to the counts. `account`: the holder on whose
 * reservation the entry draws, or null. `holders`: each holder whose counts
 * the entry moves, with what it holds after the entry; null when it then
 * holds nothing. `for`: the holder of each operation that the entry opens
 * for one, by the operation's ordinal. `accounts`: the account of each
 * request that the entry sends.
 */
export interface Drawn { account: number | null; holders: ReadonlyMap<number, Held | null>; for: ReadonlyMap<number, number>; accounts: readonly Account[] }

const NO_DRAW: Drawn = { account: null, holders: new Map(), for: new Map(), accounts: [] };

interface Counts { operations: Map<string, number>; requests: number; items: number; decisions: Map<string, number> }
const countsOf = (held: Held | null): Counts => ({ operations: new Map(Object.entries(held?.operations ?? {})), requests: held?.requests ?? 0, items: held?.items ?? 0, decisions: new Map(Object.entries(held?.decisions ?? {})) });
const add = (counts: Counts, more: Held): void => {
  for (const [kind, n] of Object.entries(more.operations ?? {})) counts.operations.set(kind, (counts.operations.get(kind) ?? 0) + n);
  counts.requests += more.requests ?? 0;
  counts.items += more.items ?? 0;
  for (const [message, n] of Object.entries(more.decisions ?? {})) counts.decisions.set(message, (counts.decisions.get(message) ?? 0) + n);
};
/** The counts as the state keeps them: a count of 0 is left out, and so is a member that would be empty. Null: nothing is held. */
const heldOf = (counts: Counts): Held | null => {
  const operations = [...counts.operations].filter(([, n]) => n > 0);
  const decisions = [...counts.decisions].filter(([, n]) => n > 0);
  const held: Held = { ...(operations.length > 0 ? { operations: Object.fromEntries(operations) } : {}), ...(counts.requests > 0 ? { requests: counts.requests } : {}), ...(counts.items > 0 ? { items: counts.items } : {}), ...(decisions.length > 0 ? { decisions: Object.fromEntries(decisions) } : {}) };
  return Object.keys(held).length > 0 ? held : null;
};

type Drawing = Pick<Entry, "seq" | "input" | "effects" | "sends">;
/** Pinned rules and bounds, needed only when a binding selector is derived. */
export interface DrawOptions { bounds?: Bounds | undefined; platform?: PlatformRules | undefined }

/** What that entry does to the counts of the holders, on the state before it; or the fault of an entry that draws past a count, or opens a held operation with no holder. */
export function drawsOf(view: StateView, definition: ValidDefinition, entry: Drawing, options: DrawOptions = {}, binding?: { item: number; message: string } | null): Drawn | DrawFault {
  const r = definition.reserving;
  const operations = entry.effects.filter((effect): effect is Extract<Effect, { effect: "operation" }> => effect.effect === "operation");
  if ((!r || (Object.keys(r.holders).length === 0)) && operations.every((effect) => effect.for === undefined)) return NO_DRAW;
  const fault = (name: DrawFault["fault"], detail: string): DrawFault => ({ fault: name, detail });
  const input = entry.input;
  const decided = binding === undefined ? decisionBinding(view, definition, entry, options.bounds ?? PROPOSED_BOUNDS, options.platform) : binding;
  const working = new Map<number, Counts>();
  /** The counts of that item, as the entry has moved them so far. Null: the item is no holder. */
  const counts = (item: number): Counts | null => {
    const held = working.get(item);
    if (held) return held;
    const of = view.item(item);
    if (!of || own(r?.holders, of.type) === undefined) return null;
    const read = countsOf(view.holder(item));
    working.set(item, read);
    return read;
  };

  // The taking entry, and an adding entry.
  let account: number | null = null;
  const opening = entry.effects.find((effect) => effect.effect === "open");
  const taken = opening?.effect === "open" ? own(r?.holders, opening.type) : undefined;
  if (opening?.effect === "open" && taken) {
    working.set(opening.item, countsOf(taken.holds));
    account = opening.item;
  } else if (input.type === "act" && own(r?.adds, input.signed.intent.kind)) {
    const added = own(r?.adds, input.signed.intent.kind)!;
    const on = input.signed.intent.on;
    const item = isLocalId(on) ? view.item(on) : null;
    const held = item && item.type === added.on && !own(own(definition.declared.items, item.type)?.states, item.state)?.final ? counts(item.id) : null;
    if (!held) return fault("no-holder", `the act ${input.signed.intent.kind} adds to a holder, and it is on none that is not final`);
    add(held, added.adds);
    account = item!.id;
  } else if (decided) {
    account = decided.item;
    const of = counts(account);
    if (!of) return fault("no-holder", `the decision is bound to item ${account}, which is no holder`);
    const left = of.decisions.get(decided.message) ?? 0;
    if (left < 1) return fault("past-count", `item ${account} holds no decision for ${decided.message}`);
    of.decisions.set(decided.message, left - 1);
  } else if (input.type === "outcome") account = view.operation(input.operation)?.for ?? null;
  else if (input.type === "delivery" && "clause" in input) account = view.account(input.message.of.from.seq, input.message.of.n);
  else if (input.type === "diagnosis") account = view.account(input.of.seq, input.of.n);

  // Each `operation` effect of a held kind draws on the holder that it is `for`, whatever the account of the entry is.
  const holders = new Map<number, number>();
  for (const effect of operations) {
    const held = isPlatformDefinition(effect.owner) && own(r?.kinds, effect.kind)?.held === true;
    if (effect.for === undefined) {
      if (held) return fault("no-holder", `operation ${effect.k} is of the held kind ${effect.kind}, and states no holder that it is for`);
      continue;
    }
    if (!held) return fault("no-holder", `operation ${effect.k} states a holder, and no item holds its kind ${effect.kind}`);
    if (effect.for === "self" && (opening?.effect !== "open" || opening.item !== entry.seq)) return fault("no-holder", `operation ${effect.k} is for the item that its entry opens, and the entry opens none`);
    const item = effect.for === "self" ? entry.seq : effect.for;
    const of = counts(item);
    if (!of) return fault("no-holder", `operation ${effect.k} is for item ${item}, which is no holder`);
    const left = of.operations.get(effect.kind) ?? 0;
    if (left < 1) return fault("past-count", `operation ${effect.k} is for item ${item}, which holds no count of the kind ${effect.kind}`);
    of.operations.set(effect.kind, left - 1);
    holders.set(effect.k, item);
  }

  const accounts: Account[] = [];
  if (account !== null) {
    const of = counts(account);
    if (!of) return fault("no-holder", `the account of the entry is item ${account}, which is no holder`);
    for (const send of entry.sends) {
      if (send.message.class !== "request") continue;
      if (of.requests < 1) return fault("past-count", `the entry sends a request of the account of item ${account}, which holds no count of requests`);
      of.requests -= 1;
      accounts.push({ seq: entry.seq, n: send.n, item: account });
    }
    for (const effect of entry.effects) {
      if (effect.effect !== "open" || effect.item === account) continue;
      if (of.items < 1) return fault("past-count", `the entry opens an item of the account of item ${account}, which holds no count of items`);
      of.items -= 1;
    }
  }
  return { account, holders: new Map([...working].map(([item, of]) => [item, heldOf(of)])), for: holders, accounts };
}

/**
 * Section 17.2a, "Past a count", for a judge: an entry that would draw past
 * a count, or open a held operation with no holder, is a fault of its rule.
 * The input is not judged and nothing is written: `unavailable`, as for
 * every fault of a rule (section 6.1). An outcome then stays offered.
 */
export function withinCounts<J extends { result: string }>(view: StateView, definition: ValidDefinition, judged: J): J | { result: "unavailable"; reason: "unavailable" } {
  if (judged.result !== "write" || !("draft" in judged)) return judged;
  const draft = judged.draft as Pick<Entry, "input" | "effects" | "sends"> & { bound?: { item: number; message: string } };
  // The judge has just derived this binding. The fold and replay derive it
  // from the recorded message instead, never from a Draft.
  const drawn = drawsOf(view, definition, { seq: (view.scope()?.head.seq ?? -1) + 1, input: draft.input, effects: draft.effects, sends: draft.sends }, {}, draft.bound ?? null);
  return "fault" in drawn ? { result: "unavailable", reason: "unavailable" } : judged;
}

/**
 * Section 17.2a, "Release": what a holder still holds, by its item's state
 * and what can still draw on it. It is derived from the state, and no flag
 * is kept.
 *
 * - While the holder is not final, it holds every count.
 * - A final holder holds no decisions: a request for it is never bound.
 * - When it is final, it holds the count of a kind only while the kind can
 *   still be reached: from the kind of an operation that is for it and is
 *   not settled, and from a clause of a pending request of its account. It
 *   holds `requests` and `items` only while such an operation exists, or
 *   such a request is pending.
 *
 * What a kind reaches is the validator's (`KindReserved.reach`). It counts
 * the kinds that a clause of the kind's own send lists, beside those that
 * its mark lists: an outcome of an open operation may still send that
 * request, and its clause then draws. That is never less than the rule.
 *
 * Returns what the holder holds after the release, or null for nothing.
 */
export function released(view: StateView, definition: ValidDefinition, item: number): Held | null {
  const held = view.holder(item);
  const of = view.item(item);
  const r = definition.reserving;
  if (!held || !of || !r) return held;
  if (!own(own(definition.declared.items, of.type)?.states, of.state)?.final) return held;
  const open = view.operationsFor(item).filter((operation) => !operationSettled(operation));
  const pending = view.accountsOf(item).some((account) => {
    const request = view.request(account.seq, account.n);
    return request !== null && request.result === null && request.diagnosis?.finding !== "undelivered";
  });
  const reached = new Set([...open.flatMap((operation) => own(r.kinds, operation.kind)?.reach ?? []), ...(pending ? r.reach : [])]);
  const counts = countsOf(held);
  counts.decisions.clear();
  for (const kind of [...counts.operations.keys()]) if (!reached.has(kind)) counts.operations.delete(kind);
  if (open.length === 0 && !pending) [counts.requests, counts.items] = [0, 0];
  return heldOf(counts);
}
