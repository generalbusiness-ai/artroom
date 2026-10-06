/**
 * The amounts of a reservation, as pure functions (scope contract, revision
 * 23, sections 17.1, 17.2, 17.2a and 17.2b). An amount has the five
 * dimensions of section 17.1. Each function reads a `Counting`: what the
 * data of one platform definition states of its kinds, with what an item in
 * a state reserves. The validator builds it (`validate/holds.ts`), checks
 * the data against it, and keeps the amounts with the definition. The fold
 * and the admission read the amounts from there. Nothing here reads a
 * state, a clock or a budget.
 *
 * The words are the contract's.
 *
 * - n(k) is 2 times `attempts(k)`: the outcome entries that one operation
 *   of the kind k can have, a first outcome and a late answer for each
 *   attempt.
 * - C(k), the closure of one operation of a kind that no item holds, is
 *   n(k) times the sum of the outcome entry and of what the mark of k may
 *   start; and the request of its `send`, once or n(k) times.
 * - `one(k)`, for a held kind, is n(k) times the sum of the outcome entry,
 *   of C(j) for each kind j that its mark lists and that no item holds, and
 *   of what its changes of state start. A held kind that its mark lists,
 *   its item and its request count nothing there: each draws on a count.
 * - `req` is what one request of an account reserves, and `itm` what one
 *   item of an account reserves.
 *
 * What is counted at a stand-in, and what is not counted. In bytes, the
 * static size of an entry is the bound on one entry (section 17.2, "Bytes
 * of a reservation": "the entry size of section 7.5 stands in for this
 * whole amount"), and so is the bound on one foreign entry. What an item in
 * a state reserves is known in entries only: the validator counts no other
 * dimension of a settlement (section 17.5; request `cc570904`). So the
 * items, the records and the pending requests that a change of state or an
 * opened item starts are not in these amounts.
 */

import type { Held } from "@generalbusiness/artroom-contract";
import { isObject, own } from "./values.ts";

/** An amount in the five dimensions of section 17.1. `requests` is pending requests. */
export interface Amount { entries: number; items: number; records: number; bytes: number; requests: number }

export const NOTHING: Amount = { entries: 0, items: 0, records: 0, bytes: 0, requests: 0 };
const DIMENSIONS = ["entries", "items", "records", "bytes", "requests"] as const;
const each = (of: (dimension: (typeof DIMENSIONS)[number]) => number): Amount => ({ entries: of("entries"), items: of("items"), records: of("records"), bytes: of("bytes"), requests: of("requests") });

/** The sum of amounts, by dimension: distinct duties are summed. */
export const sum = (...amounts: readonly Amount[]): Amount => each((d) => amounts.reduce((n, a) => n + a[d], 0));
/** One amount, n times. */
export const times = (n: number, amount: Amount): Amount => each((d) => n * amount[d]);
/** The largest of amounts, by dimension: alternatives are counted for one duty. */
export const largest = (...amounts: readonly Amount[]): Amount => each((d) => Math.max(0, ...amounts.map((a) => a[d])));

/** What a mark may start, as its `most` states it (section 17.2, "What a mark may start"). A mark that states no `most` starts nothing by the data. */
export interface Starts { effects: number; operations: readonly string[]; opens: string | null }
export const STARTS_NOTHING: Starts = { effects: 0, operations: [], opens: null };

/** One clause of a result: its effect marks, and the bytes of the values that its rows of `observes` state under `retains`. */
export interface ClauseStarts { marks: readonly Starts[]; retains: number }

/**
 * One kind of `outcomes`, as its data states it. `attempts`: the most
 * attempts. `most`: what one outcome entry may start. `send`: its one send
 * mark, with `once` and each clause. `retains`: the bytes of the values
 * that its rows of `observes` state under `retains`.
 */
export interface KindStated { attempts: number; most: Starts; send: { once: boolean; clauses: readonly ClauseStarts[] } | null; retains: number }

/**
 * What the amounts are counted from. `kinds`: each kind of `outcomes` that
 * states its attempts. `held`: the kinds that the `holds` or the `adds` of
 * some form lists. `initial`: what an item of a type reserves in its
 * initial state, beside the item itself. `change`: the largest, over the
 * item types and their states, of what an item in a state reserves, which
 * one change of state by a rule counts. Both are the sum of rule 6 of "A
 * marker duty" with no mark completed. `entry`: the stand-in for the static
 * size of one entry, and for one foreign entry, in bytes. `written`: the
 * largest that the written effects of one result clause can start.
 */
export interface Counting {
  kinds: Readonly<Record<string, KindStated>>;
  held: ReadonlySet<string>;
  initial(type: string): Amount;
  change: Amount;
  entry: number;
  written: Amount;
}

/** n(k): the outcome entries that one operation of the kind can have. */
export const outcomes = (kind: Pick<KindStated, "attempts">): number => 2 * kind.attempts;

/** One entry that the platform builds: 1 entry, at its static size, with the bytes that it may newly retain. */
const entryOf = (c: Counting, retains = 0): Amount => ({ ...NOTHING, entries: 1, bytes: c.entry + retains });

/**
 * The closure C(k) of one operation of a kind that no item holds (section
 * 17.2, "The closure of an operation"). Null: it is not finite, because the
 * kind reaches itself, or because it reaches a kind whose attempts the data
 * does not state. A held kind is in no closure: where one is listed, it
 * counts nothing here, and the holder that the effect is `for` counts it.
 */
export function closure(c: Counting, kind: string, open: ReadonlySet<string> = new Set()): Amount | null {
  const stated = own(c.kinds, kind);
  if (!stated || open.has(kind)) return null;
  const within = new Set([...open, kind]);
  const started = starts(c, stated.most, { item: true, within });
  const request = stated.send ? requestOf(c, stated.send.clauses, { item: true, within }) : NOTHING;
  if (!started || !request) return null;
  const n = outcomes(stated);
  // The request of the `send`: once where the mark states `once`, and otherwise once for each outcome entry.
  return sum(times(n, sum(entryOf(c, stated.retains), started)), times(stated.send ? (stated.send.once ? 1 : n) : 0, request));
}

/**
 * What one mark may start, at the worst case of its `most` (section 17.2,
 * "What a mark may start"): the closure of one operation of each listed
 * kind that no item holds; one item of the type `opens`, with what it
 * reserves in its initial state; and one change of state for each effect.
 * `item`: false where the item draws on a count of a holder. Null: a listed
 * kind has no finite closure.
 */
export function starts(c: Counting, most: Starts, how: { item: boolean; within?: ReadonlySet<string> }): Amount | null {
  let amount = times(most.effects, c.change);
  for (const kind of most.operations) {
    if (c.held.has(kind)) continue;
    const child = closure(c, kind, how.within);
    if (!child) return null;
    amount = sum(amount, child);
  }
  return how.item && most.opens !== null ? sum(amount, { ...NOTHING, items: 1 }, c.initial(most.opens)) : amount;
}

/**
 * What one request reserves (section 17.2, row 1, and "A request's
 * clauses"): 1 pending request; 2 entries, a diagnosis and a result; the
 * source entry that the result's delivery newly retains; and the largest,
 * over the clauses, of what the clause's entry may newly retain and of what
 * the clause can start, by its written effects and by its marks.
 */
export function requestOf(c: Counting, clauses: readonly ClauseStarts[], how: { item: boolean; within?: ReadonlySet<string> }): Amount | null {
  const byClause: Amount[] = [];
  for (const clause of clauses) {
    let started = sum(c.written, { ...NOTHING, bytes: clause.retains });
    for (const mark of clause.marks) {
      const more = starts(c, mark, how);
      if (!more) return null;
      started = sum(started, more);
    }
    byClause.push(started);
  }
  return sum({ ...NOTHING, entries: 2, requests: 1, bytes: 3 * c.entry }, largest(c.written, ...byClause));
}

/**
 * `one(k)`: what one operation of a held kind reserves (section 17.2a,
 * "What a holder reserves, in full"). For each of its n(k) outcome entries:
 * the entry; C(j) for each kind j of its mark that no item holds; and what
 * its changes of state start. Nothing for a held kind that the mark lists,
 * for the item of `most.opens` or for the request of the `send`: each of
 * those draws on a count. Null: a listed kind has no finite closure.
 */
export function one(c: Counting, kind: string): Amount | null {
  const stated = own(c.kinds, kind);
  const started = stated ? starts(c, stated.most, { item: false }) : null;
  return stated && started ? times(outcomes(stated), sum(entryOf(c, stated.retains), started)) : null;
}

/** `itm`: what one item of an account reserves: 1 item, and the largest, over the types that may be opened, of what an item of the type reserves in its initial state. */
export const itemOf = (c: Counting, types: readonly string[]): Amount => sum({ ...NOTHING, items: 1 }, largest(...types.map((type) => c.initial(type))));

/**
 * What a holder that still holds those counts reserves, in each dimension:
 * the sum over k of c(k) times `one(k)`; q times `req`; i times `itm`;
 * and each decision count times the amount `dec(m)` of its message.
 * A count of a kind that has no amount counts nothing: the validator refuses
 * the data that states one.
 */
export function holding(held: Held, amounts: { one: Readonly<Record<string, Amount>>; req: Amount; itm: Amount; dec?: Readonly<Record<string, Amount>> }): Amount {
  const byKind = Object.entries(held.operations ?? {}).map(([kind, n]) => times(n, own(amounts.one, kind) ?? NOTHING));
  const byMessage = Object.entries(held.decisions ?? {}).map(([message, n]) => times(n, own(amounts.dec, message) ?? NOTHING));
  return sum(...byKind, ...byMessage, times(held.requests ?? 0, amounts.req), times(held.items ?? 0, amounts.itm));
}

/**
 * The capacity side of a value that an observation names (section 17.2, "A
 * value that an observation names"; section 17.1, the row of revision 21):
 * every form that states a row of `observes` with `retains` counts, in what
 * its entry may newly retain, one value for each record of `retains`, at
 * that record's `max`. This is the number of bytes, from the rows alone.
 * For a request it is taken as the largest over the clauses (`requestOf`).
 *
 * The validator of this source reads no member `observes` yet, so the
 * number is 0 for every definition that validates today. It is called for
 * each kind of `outcomes` and for each clause of each send
 * (`validate/holds.ts`), so that the declaration is counted from the first
 * definition that states it.
 */
export function retainedBytes(rows: unknown): number {
  if (!Array.isArray(rows)) return 0;
  let bytes = 0;
  for (const row of rows) {
    const retains = isObject(row) ? row["retains"] : null;
    for (const value of Array.isArray(retains) ? retains : []) if (isObject(value) && typeof value["max"] === "number" && Number.isSafeInteger(value["max"]) && value["max"] > 0) bytes += value["max"];
  }
  return bytes;
}
