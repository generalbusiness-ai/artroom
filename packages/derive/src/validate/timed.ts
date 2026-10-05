/**
 * Timed rules (scope contract, sections 5.2 and 6.4): what a rule may be,
 * the graph of the rules of one type (sections 17.2 and 17.3a), and the
 * static size of the entry a rule writes (section 7.5).
 */

import type { Bounds, TimedRule } from "@generalbusiness/artroom-contract";
import { isObject } from "../values.ts";
import { naming, type Ctx, type Defining, type Type } from "./context.ts";
import { effectBytes, effects } from "./effects.ts";
import { attention, notifyBytes } from "./sends.ts";
import { at } from "./shape.ts";
import { ENTRY_BYTES, RECORD_BYTES, memberBytes, mostBytes, stated } from "./sizes.ts";

/** What the kind of a timed entry begins with (section 6.2). Its rule's key follows. */
const TIMED = "timed:";

/**
 * Section 6.2: no act kind and no message name begins with `timed:`, so the
 * kind of a timed entry is the kind of no act and of no delivery. A message
 * is named where a handler receives it, and where a `tell` or a `relate`
 * sends it. A handler of the first delivery names a relationship after
 * `relate:`.
 */
export function timedKinds(d: Defining, acts: unknown, receives: unknown): void {
  const kept = (name: unknown) => typeof name === "string" && (name.startsWith(TIMED) || name.startsWith(`relate:${TIMED}`));
  const sent = (sends: unknown, path: string) => {
    if (Array.isArray(sends)) sends.forEach((s, i) => {
      const [tell, relate] = isObject(s) ? [s["tell"], s["relate"]] : [];
      if ((isObject(tell) && kept(tell["message"])) || (isObject(relate) && kept(relate["name"]))) d.bad("handler", at(path, i), "a message's name does not begin with timed:");
    });
  };
  for (const [name, a] of isObject(acts) ? Object.entries(acts) : []) {
    if (kept(name)) d.bad("shape", at("acts", name), "an act kind does not begin with timed:");
    if (isObject(a)) sent(a["sends"], at(at("acts", name), "sends"));
  }
  for (const [name, h] of isObject(receives) ? Object.entries(receives) : []) {
    if (!isObject(h)) continue;
    if (kept(h["message"])) d.bad("handler", at(at("receives", name), "message"), "a message's name does not begin with timed:");
    sent(h["sends"], at(at("receives", name), "sends"));
  }
}

/**
 * Every timed rule. Returns each rule that was read whole, as the graph
 * reads it, and adds each rule's type to `timedTypes`.
 */
export function timedRules(d: Defining, v: unknown, timedTypes: Set<string>): TimedMove[] {
  const { bounds, types, bad, rec, entries, names } = d;
  const moves: TimedMove[] = [];
  for (const [name, rv] of entries(v, "timed", bounds.timedRules)) {
    const path = at("timed", name);
    const o = rec(rv, path, ["on", "states", "deadline", "effects", "attention"]);
    if (!o) continue;
    const t = typeof o["on"] === "string" ? types.get(o["on"]) : undefined;
    if (!t) { bad("name", at(path, "on"), "names no item type"); continue; }
    timedTypes.add(t.name);
    const states = names(o["states"], at(path, "states"), t.states, "state");
    // Section 5.2: a deadline is held by a live item.
    if (states.some((s) => t.states.get(s) === true)) bad("timed", at(path, "states"), "a timed rule applies in live states only");
    const deadline = typeof o["deadline"] === "string" ? t.slots.get(o["deadline"]) : undefined;
    if (!(deadline?.kind === "value" && deadline.type.type === "time")) bad("name", at(path, "deadline"), "names no value slot of type time");
    // Section 6.2: the kind of the entry a rule writes is `timed:` and the rule's key. So an effect may set a slot of the rule's
    // item from `self` when the slot's kinds include that kind (section 6.4). It is then total, like a `state` effect.
    const ctx: Ctx = { ...naming(), on: t, fields: new Map(), timed: true, live: new Set(["on"]), kind: TIMED + name };
    // Section 6.4: a timed rule's effects are total. With no field, no signer and no other subject, what is left that a commit
    // could refuse is an effect that needs room in a party list, or a time derived from the commit clock, and `effect` refuses
    // each as `timed-partial`.
    effects(d, o["effects"], at(path, "effects"), ctx, false);
    // Otherwise the transition would be due again as soon as it was applied, and the drain would never end.
    const to = Array.isArray(o["effects"]) ? o["effects"].find((e) => isObject(e) && typeof e["state"] === "string" && !states.includes(e["state"])) : undefined;
    if (!isObject(to)) bad("timed", at(path, "effects"), "a timed rule takes its item out of the rule's states");
    else moves.push({ name, type: t.name, states, to: to["state"] as string, deadline: String(o["deadline"]) });
    attention(d, o["attention"], at(path, "attention"), ctx);
  }
  return moves;
}

// ---------------------------------------------------------------- the graph of timed rules (sections 17.2 and 17.3a)

/** A timed rule as the graph reads it: its type, the states it applies in, the state it leaves its item in, and its deadline slot. */
export interface TimedMove { name: string; type: string; states: readonly string[]; to: string; deadline: string }

export interface TimedGraph {
  /** The rules that lead back to themselves. With any, no chain is finite, and the lengths below are not to be used. */
  readonly cyclic: ReadonlySet<string>;
  /** For each rule, the rules of its longest chain, itself included. */
  readonly chain: ReadonlyMap<string, number>;
  /** By type, then state: the longest chain of a rule that applies in that state. */
  readonly fromState: ReadonlyMap<string, ReadonlyMap<string, number>>;
  /** By type, then deadline slot: the longest chain of a rule with that deadline. */
  readonly fromSlot: ReadonlyMap<string, ReadonlyMap<string, number>>;
  /** The work done: rules entered, and leads followed from one rule to another. Each is counted once. */
  readonly work: { readonly rules: number; readonly edges: number };
}

/**
 * The graph of the timed rules: rule r leads to rule s when they are of one
 * type and r sets a state that the `states` of s list.
 *
 * One traversal answers both questions asked of it. It enters each rule
 * once and follows each lead once, so its work is in proportion to the rules
 * and the leads, and not to the paths, of which a small graph that parts and
 * joins again has very many. A rule is `cyclic` when it is one of several
 * rules that reach one another. Otherwise its chain is one more than the
 * longest chain of a rule it leads to, which is final by the time the rule
 * is left. The traversal keeps its own stack, so a long chain of rules is
 * no deeper a call.
 */
export function timedGraph(moves: readonly TimedMove[]): TimedGraph {
  // The rules that apply in each state of each type, in the order declared. A rule that leads to that state leads to each of them.
  const listed = new Map<string, Map<string, number[]>>();
  moves.forEach((m, i) => {
    let states = listed.get(m.type);
    if (!states) listed.set(m.type, states = new Map());
    for (const state of m.states) {
      let rules = states.get(state);
      if (!rules) states.set(state, rules = []);
      if (rules.at(-1) !== i) rules.push(i);
    }
  });
  const none: readonly number[] = [];
  const next = moves.map((m) => listed.get(m.type)?.get(m.to) ?? none);

  // Tarjan's strongly connected components, with a stack of frames in place of recursion.
  const order = new Array<number>(moves.length).fill(-1);
  const low = new Array<number>(moves.length).fill(0);
  const open = new Array<boolean>(moves.length).fill(false);
  const chain = new Array<number>(moves.length).fill(0);
  const cyclic = new Set<string>();
  const path: number[] = [];
  let rules = 0;
  let edges = 0;
  for (let root = 0; root < moves.length; root++) {
    if (order[root] !== -1) continue;
    /** One rule being read: the next lead to follow, the longest chain among the rules it leads to, and whether it leads to itself. */
    const frames: { rule: number; lead: number; most: number; self: boolean }[] = [];
    const enter = (rule: number): void => {
      order[rule] = low[rule] = rules++;
      open[rule] = true;
      path.push(rule);
      frames.push({ rule, lead: 0, most: 0, self: false });
    };
    enter(root);
    while (frames.length > 0) {
      const frame = frames.at(-1)!;
      const v = frame.rule;
      const leads = next[v]!;
      if (frame.lead < leads.length) {
        const w = leads[frame.lead++]!;
        edges++;
        if (order[w] === -1) enter(w);
        else if (open[w]) { low[v] = Math.min(low[v]!, order[w]!); frame.self ||= w === v; }
        else frame.most = Math.max(frame.most, chain[w]!);
        continue;
      }
      frames.pop();
      chain[v] = 1 + frame.most;
      if (low[v] === order[v]) {
        // Every rule from here to the top of the path reaches every other. One rule alone is a cycle only if it leads to itself.
        const alone = path.at(-1) === v && !frame.self;
        for (;;) {
          const w = path.pop()!;
          open[w] = false;
          if (!alone) cyclic.add(moves[w]!.name);
          if (w === v) break;
        }
      }
      const parent = frames.at(-1);
      if (parent) {
        low[parent.rule] = Math.min(low[parent.rule]!, low[v]!);
        parent.most = Math.max(parent.most, chain[v]!);
      }
    }
  }

  const fromState = new Map<string, Map<string, number>>();
  for (const [type, states] of listed) {
    const most = new Map<string, number>();
    for (const [state, at] of states) most.set(state, Math.max(...at.map((i) => chain[i]!)));
    fromState.set(type, most);
  }
  const fromSlot = new Map<string, Map<string, number>>();
  moves.forEach((m, i) => {
    let slots = fromSlot.get(m.type);
    if (!slots) fromSlot.set(m.type, slots = new Map());
    slots.set(m.deadline, Math.max(slots.get(m.deadline) ?? 0, chain[i]!));
  });
  return { cyclic, chain: new Map(moves.map((m, i) => [m.name, chain[i]!])), fromState, fromSlot, work: { rules, edges } };
}

// ---------------------------------------------------------------- the size of a timed entry (sections 5.2 and 7.5)

/**
 * An upper bound on the canonical bytes of the entry a timed rule writes,
 * whatever its item holds. A timed rule has no field and no signer, so each
 * effect carries a name or a constant the definition states, or a copy of a
 * slot, which its type bounds. Attention lists the members of a party slot,
 * each within the bound of a handle, with a reason the definition states.
 *
 * `type` is the item type as the validator read it: each slot with the type
 * of what it holds. A party list is a list of members with its declared
 * `max`, so a copy of it, and a notice to it, are counted at every member it
 * can hold.
 */
export function timedEntryBytes(name: string, rule: TimedRule, type: Type, bounds: Bounds): number {
  // A party list is counted at its own `max`, which the fold enforces. A list value is counted at the bound on a list's elements.
  const held = (slot: string): number => {
    const s = type.slots.get(slot);
    return !s ? 0 : s.kind === "party" && s.type.type === "list" ? 2 + s.type.max * (1 + memberBytes(bounds)) : mostBytes(s.type, bounds);
  };
  let bytes = ENTRY_BYTES + stated(name);
  for (const e of rule.effects) bytes += RECORD_BYTES + effectBytes(e, held, bounds);
  for (const notice of rule.attention) bytes += notifyBytes(notice, held);
  return bytes;
}
