/** C1 uses made-up platform data and explicit authority/rule stand-ins.
 * The judges, complete prospective item projection, fold and entry ledger
 * are real. No directory pin or handoff policy is activated here. */
import { expect, test } from "vitest";
import type { Effect, PlatformDefinition } from "@generalbusiness/dap-contract";
import { PROPOSED_BOUNDS } from "@generalbusiness/dap-contract";
import { entryHash, factRefOf } from "@generalbusiness/artroom-bytes";
import { MemoryState, PROFILES, StandingError, applyEntry, checkStandingEntry, entryOf, fits, judgeCheckpoint, judgeDelivery, judgeDiagnosis, owed, standingCounter, standingEntries, checkpointOf, validateDefinition } from "../src/index.ts";
import type { PlatformRules, StateView } from "../src/index.ts";
import { arriving, desk, forged, founded, keys, on, valid } from "./fixtures.ts";

import { standingData } from "./fixtures-standing.ts";
const definition = () => valid(validateDefinition(standingData(), PROPOSED_BOUNDS, PROFILES, { platform: true }));
const total = (s: ReturnType<typeof founded>) => s.head.seq + 1 + owed(s.state, s.definition, s.last.input);
const projected = (s: ReturnType<typeof founded>, effects: readonly Effect[]) => checkStandingEntry(s.state, s.definition, effects, s.head.seq + 1);

// Closed metadata is platform-only; exact declaration constraints prevent
// a mutable/free-form selector or an unsafe reservation product.
test("standing grammar admits only the closed, safe platform singleton declaration", () => {
  expect(definition().standing).toEqual({ item: "repo", slot: "count", entries: 3, max: 2, states: ["done", "open"] });
  expect(validateDefinition(standingData(), PROPOSED_BOUNDS).ok).toBe(false);
  const old = structuredClone(desk);
  expect(valid(validateDefinition(old, PROPOSED_BOUNDS)).standing).toBeUndefined();
  const invalid = [
    (d: any) => { d.standing.extra = true; },
    (d: any) => { d.standing.item = "missing"; },
    (d: any) => { d.items.repo.many = true; },
    (d: any) => { d.items.repo.max = 2; },
    (d: any) => { d.items.repo.values.count.required = false; },
    (d: any) => { d.items.repo.values.count.fixed = true; },
    (d: any) => { d.items.repo.values.count.of.min = -1; },
    (d: any) => { d.items.repo.values.count.of.min = -0; },
    (d: any) => { d.items.repo.values.count.of.max = 3; },
    (d: any) => { d.items.repo.values.count.default = 1; },
    (d: any) => { d.items.repo.values.count.default = -0; },
    ...[0, -1, -0, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1].map(entries => (d: any) => { d.standing.entries = entries; }),
    ...[-1, -0, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1].map(max => (d: any) => { d.standing.max = max; }),
    (d: any) => { d.standing.entries = Number.MAX_SAFE_INTEGER; },
  ];
  for (const change of invalid) expect(validateDefinition(standingData(change), PROPOSED_BOUNDS, PROFILES, { platform: true }).ok, String(change)).toBe(false);
  const noDefault = standingData(d => { delete d.items.repo.values.count.default; d.acts.found.effects.push({ value: { slot: "count", from: { const: 0 } } }); });
  expect(validateDefinition(noDefault, PROPOSED_BOUNDS, PROFILES, { platform: true }).ok).toBe(true);
  const zero = standingData(d => { d.standing.max = 0; d.items.repo.values.count.of.max = 0; d.acts.set.fields.next.max = 0; d.acts.advance.fields.next.max = 0; });
  expect(validateDefinition(zero, PROPOSED_BOUNDS, PROFILES, { platform: true }).ok).toBe(true);
  expect(validateDefinition(standingData(), { ...PROPOSED_BOUNDS, scopeEntries: 5 }, PROFILES, { platform: true }).ok).toBe(false);
});

/** Bind methods to the real state; only the selected fault is scripted. */
function viewWith(view: StateView, over: Partial<StateView>): StateView {
  return new Proxy(view, { get(target, key) { const value = Reflect.get(over, key) ?? Reflect.get(target, key); return typeof value === "function" ? value.bind(key in over ? over : target) : value; } });
}

test("pre-opening absence reserves the full amount, old definitions make no standing reads, and selection pages only the sole positive state", () => {
  const d = definition(), empty = new MemoryState();
  expect(standingEntries(empty, d)).toBe(6);
  const forbidden = new Proxy({} as StateView, { get() { throw new Error("old definition read state"); } });
  expect(standingEntries(forbidden, valid(validateDefinition(desk, PROPOSED_BOUNDS)))).toBe(0);
  const s = founded(d), calls: unknown[] = [];
  const bounded = viewWith(s.state, {
    count(type, state) { calls.push(["count", type, state]); return s.state.count(type, state); },
    page(type, states, after, limit) { calls.push(["page", type, states, after, limit]); return s.state.page(type, states, after, limit); },
    all() { throw new Error("inventory fallback"); },
  });
  expect(standingEntries(bounded, d)).toBe(6);
  expect(calls).toEqual([["count", "repo", "done"], ["count", "repo", "open"], ["page", "repo", ["open"], null, 1]]);
  expect(total(s)).toBe(8);
  expect(fits(s.state, d, { scopeEntries: 8 }, s.last.input)).toBe(true);
  expect(fits(s.state, d, { scopeEntries: 7 }, s.last.input)).toBe(false);
  s.did(keys.rita, "finish", on(s, 0));
  expect(s.item(0).state).toBe("done");
  expect(standingEntries(s.state, d)).toBe(6);
});

test("counter/count/page corruption fails closed, including settlement capacity shortcuts", () => {
  const s = founded(definition());
  for (const count of [-1, -0, 0.5, NaN, Infinity, 2]) {
    expect(() => standingCounter(viewWith(s.state, { count: () => count }), s.definition)).toThrow(StandingError);
  }
  expect(() => standingCounter(viewWith(s.state, { count: () => 1 }), s.definition)).toThrow(StandingError);
  const item = s.item(0);
  for (const count of [undefined, null, -1, -0, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 3]) {
    const values = { ...item.values, count };
    const bad = viewWith(s.state, { page: () => ({ items: [{ ...item, values: values as never }], more: false }) });
    expect(() => standingEntries(bad, s.definition), String(count)).toThrow(StandingError);
    expect(() => fits(bad, s.definition, { scopeEntries: 1 }, s.last.input, true)).toThrow(StandingError);
  }
  for (const page of [{ items: [], more: false }, { items: [item], more: true }, { items: [item, item], more: false }, { items: [{ ...item, state: "done" }], more: false }]) {
    expect(() => standingCounter(viewWith(s.state, { page: () => page }), s.definition)).toThrow(StandingError);
  }
});

test("global prospective monotonicity checks complete written and marked effects, and independent fold rejects a recorded decrease without writes", () => {
  const s = founded(definition());
  s.did(keys.rita, "set", { ...on(s, 0), fields: { next: 1 } });
  const before = s.state.snapshot();
  expect(s.act(keys.rita, "set", { ...on(s, 0), fields: { next: 0 } })).toEqual({ result: "unavailable", reason: "unavailable" });
  expect(s.state.snapshot()).toBe(before);
  for (const effects of [
    [{ effect: "value", item: 0, slot: "count", value: 0 }],
    [{ effect: "value", item: 0, slot: "count", value: null }],
    [{ effect: "open", item: s.head.seq + 1, type: "repo", state: "open" }],
    [{ effect: "open", item: 0, type: "issue", state: "asked" }],
    [{ effect: "state", item: 0, state: "unknown" }],
  ] as readonly Effect[][]) expect(() => projected(s, effects)).toThrow(StandingError);
  const good = s.judge(s.intent(keys.rita, "chatter", on(s, 0)));
  if (good.result !== "write") return expect.fail(JSON.stringify(good));
  const bad = entryOf(s.state, { ...good.draft, effects: [{ effect: "value", item: 0, slot: "count", value: 0 }] }, s.context().clock);
  expect(() => applyEntry(s.state, s.definition, bad, entryHash(bad), s.foldOptions)).toThrow(/standing counter cannot decrease/);
  expect(s.state.snapshot()).toBe(before);
  const rebuilt = s.replay();
  expect(rebuilt.snapshot()).toBe(before);
  expect(() => applyEntry(rebuilt, s.definition, bad, entryHash(bad), s.foldOptions)).toThrow(/standing counter cannot decrease/);
  expect(rebuilt.snapshot()).toBe(before);
});

test("at B a handoff exchanges three standing entries for one entry and two request duties; diagnosis then late result still settle after a bad marked clause", () => {
  const s = founded(definition()), peer = founded(undefined, undefined, "peer");
  let reached = 0, next = 0;
  const platform: PlatformRules = { named: "platform:task@1" as PlatformDefinition, rules: { "settle-counter": { place: "effect", most: 1, run() { reached++; return [{ effect: "value", item: 0, slot: "count", value: next }]; } } } };
  expect(total(s)).toBe(8);
  const ordinary = s.judge(s.intent(keys.rita, "chatter", on(s, 0)));
  if (ordinary.result !== "write") return expect.fail(JSON.stringify(ordinary));
  const copy = s.replay(), ordinaryEntry = entryOf(copy, ordinary.draft, s.context().clock);
  applyEntry(copy, s.definition, ordinaryEntry, entryHash(ordinaryEntry), s.foldOptions);
  expect(fits(copy, s.definition, { scopeEntries: 8 }, ordinaryEntry.input)).toBe(false);
  s.did(keys.rita, "advance", { ...on(s, 0), fields: { next: 1, peer: peer.at } });
  expect(total(s)).toBe(8);
  expect(fits(s.state, s.definition, { scopeEntries: 8 }, s.last.input)).toBe(true);
  const request = { seq: s.head.seq, n: 0 }, origin = s.last;
  const badDiagnosis = judgeDiagnosis(s.state, s.definition, { of: request, attempts: [{ at: s.now, answer: "not-found" }] }, { ...s.context({ platform }), origin });
  expect(badDiagnosis).toEqual({ result: "unavailable", reason: "unavailable" });
  expect(reached).toBe(1);
  const before = s.state.snapshot();
  const unavailable = judgeDiagnosis(s.state, s.definition, { of: request, attempts: [{ at: s.now, answer: "none" }] }, { ...s.context({ platform }), origin });
  if (unavailable.result !== "write") return expect.fail(JSON.stringify(unavailable));
  s.seal(unavailable.draft);
  expect(total(s)).toBe(8);
  const message = { class: "result", of: { from: s.fact(request.seq), n: 0 }, outcome: "applied" } as const;
  const requestMessage = origin.sends[0]!.message;
  if (requestMessage.class !== "request") return expect.fail("advance sent no request");
  const source = forged(peer.at, 2, { type: "delivery", from: s.fact(request.seq), n: 0, message: requestMessage, decision: "applied" }, [{ n: 0, to: s.at, message }]);
  const delivered = { to: s.at, from: factRefOf(source.entry), n: 0, message };
  const resultContext = { ...arriving(s, delivered, source), platform };
  const bad = judgeDelivery(s.state, s.definition, delivered, resultContext);
  expect(bad).toEqual({ result: "unavailable", reason: "unavailable" });
  expect(reached).toBe(2);
  expect(s.state.request(request.seq, 0)?.result).toBeNull();
  expect(s.replay().snapshot()).toBe(s.state.snapshot());
  next = 1;
  const good = judgeDelivery(s.state, s.definition, delivered, resultContext);
  if (good.result !== "write") return expect.fail(JSON.stringify(good));
  s.seal(good.draft);
  expect(reached).toBe(3);
  expect(total(s)).toBe(8);
  expect(fits(s.state, s.definition, { scopeEntries: 1 }, s.last.input)).toBe(true);
  expect(s.state.snapshot()).not.toBe(before);
  const checkpoint = judgeCheckpoint(s.state, s.definition, checkpointOf(s.state), s.context());
  if (checkpoint.result !== "write") return expect.fail(JSON.stringify(checkpoint));
  s.seal(checkpoint.draft);
  expect(standingEntries(s.state, s.definition)).toBe(3);
  expect(s.replay().snapshot()).toBe(s.state.snapshot());
});


test("C1 rejects unsafe/negative operands before summing and before settlement exemption, while a valid above-capacity total is ordinary scope-full", () => {
  const s = founded(definition());
  for (const requests of [-1, -0, 0.5, Infinity, Number.MAX_SAFE_INTEGER]) {
    const bad = viewWith(s.state, { outstanding: () => ({ ...s.state.outstanding(), requests, unavailable: 10 }) });
    expect(() => owed(bad, s.definition, s.last.input)).toThrow(StandingError);
    expect(() => fits(bad, s.definition, { scopeEntries: 8 }, s.last.input, true)).toThrow(StandingError);
  }
  for (const amount of [-1, -0, 0.5, Infinity, Number.MAX_SAFE_INTEGER]) {
    expect(() => owed(s.state, s.definition, s.last.input, { rules: () => null, reserves: () => amount })).toThrow(StandingError);
  }
  const owner = { rules: () => null, reserves: () => 100 };
  expect(fits(s.state, s.definition, { scopeEntries: 8 }, s.last.input, false, owner)).toBe(false);
  expect(fits(s.state, s.definition, { scopeEntries: 8 }, s.last.input, true, owner)).toBe(true);
});

test("a standing singleton distinct from genesis remains fully reserved until it opens; a checkpoint snapshot rebuild retains its counter term", () => {
  const data = standingData(d => {
    d.standing.item = "issue";
    d.items.issue.many = false; d.items.issue.max = 1;
    d.items.issue.values.count = { fixed: false, required: true, default: 0, of: { type: "int", min: 0, max: 2 } };
  });
  const d = valid(validateDefinition(data, PROPOSED_BOUNDS, PROFILES, { platform: true }));
  const s = founded(d);
  expect(standingCounter(s.state, d)).toEqual({ item: null, count: 0 });
  expect(total(s)).toBe(8);
  const pending = s.judge(s.intent(keys.rita, "open-issue", { fields: { title: "not a counter advance" } }));
  if (pending.result !== "write") return expect.fail(JSON.stringify(pending));
  const entry = entryOf(s.state, pending.draft, s.context().clock);
  s.fold(entry);
  expect(standingEntries(s.state, d)).toBe(6);
  expect(fits(s.state, d, { scopeEntries: 8 }, entry.input)).toBe(false);
  const loaded = new MemoryState(), snapshot = s.state.all();
  loaded.setScope(snapshot.scope!);
  for (const item of snapshot.items) loaded.putItem(item);
  for (const [type, state, count] of snapshot.counts) loaded.addCount(type, state, count);
  expect(standingEntries(loaded, d)).toBe(6);
});


test("at max the standing term reaches zero, the closing checkpoint releases its own reservation, and later work reserves closing again", () => {
  const s = founded(definition());
  s.did(keys.rita, "set", { ...on(s, 0), fields: { next: 2 } });
  expect(standingEntries(s.state, s.definition)).toBe(0);
  expect(owed(s.state, s.definition, s.last.input)).toBe(1);
  const judged = judgeCheckpoint(s.state, s.definition, checkpointOf(s.state), s.context());
  if (judged.result !== "write") return expect.fail(JSON.stringify(judged));
  s.seal(judged.draft);
  expect(owed(s.state, s.definition, s.last.input)).toBe(0);
  expect(fits(s.state, s.definition, { scopeEntries: 3 }, s.last.input)).toBe(true);
  s.did(keys.rita, "chatter", on(s, 0));
  expect(owed(s.state, s.definition, s.last.input)).toBe(1);
  expect(fits(s.state, s.definition, { scopeEntries: 4 }, s.last.input)).toBe(false);
  const snapshot = s.state.all(), loaded = new MemoryState();
  loaded.setScope(snapshot.scope!);
  for (const item of snapshot.items) loaded.putItem(item);
  for (const [type, state, count] of snapshot.counts) loaded.addCount(type, state, count);
  expect(standingCounter(loaded, s.definition).count).toBe(2);
  expect(standingEntries(loaded, s.definition)).toBe(0);
});
