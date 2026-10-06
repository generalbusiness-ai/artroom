import { expect, test } from "vitest";
import { PROPOSED_BOUNDS, type PlatformData } from "@generalbusiness/artroom-contract";
import { canonicalize } from "@generalbusiness/artroom-bytes";
import { validateDefinition, type StateView } from "@generalbusiness/artroom-derive";
import { d, founded, keys, on, valid } from "@generalbusiness/artroom-derive/testing";
import { View } from "../src/view.ts";

// Made-up platform data, with no marked rules. The fixture's test authority
// stands in for membership. Its genesis and acts are judged in memory;
// this witnesses historical StateView lookups, not a runtime observation.
const form = { also: {}, fields: {}, guards: [], effects: [], sends: [], attention: [] };
const digest = { type: "digest" } as const;
const data: PlatformData = {
  format: "artroom-definition-1", name: "platform:view-index", profile: { name: "restricted", version: 1 }, capabilities: [], genesis: "found",
  items: {
    board: { many: false, max: 1, initial: "open", states: { open: { final: false } }, parties: {}, refs: {}, values: {} },
    row: {
      many: true, max: 8, initial: "live", states: { live: { final: false }, done: { final: true } }, parties: {},
      refs: { key: { fixed: true, required: true, to: digest } },
      values: { category: { fixed: true, required: true, of: digest }, other: { fixed: true, required: true, of: digest } },
      indexes: ["key", "category"],
    },
  },
  acts: {
    found: { ...form, step: "open", on: "board", grant: "found" },
    add: {
      ...form, step: "open", on: "row", grant: "add", fields: { key: { ...digest, required: true }, category: { ...digest, required: true } },
      effects: [{ ref: { slot: "key", from: { field: "key" } } }, { value: { slot: "category", from: { field: "category" } } }, { value: { slot: "other", from: { field: "key" } } }],
    },
    finish: { ...form, step: "transition", on: "row", grant: "finish", guards: [{ state: ["live"] }], effects: [{ state: "done" }] },
  },
  receives: {}, timed: {}, rules: {}, outcomes: {},
};

test("historical declared indexes return exactly the live and final items of their head, in any order, and incomplete indexes answer no lookup", () => {
  // Invariant: the historical StateView has the same complete declared
  // indexes as the fold at that head, including final items and no future rows.
  const definition = valid(validateDefinition(data, PROPOSED_BOUNDS, undefined, { platform: true }));
  const history = founded(definition, {});
  const [x, y, category] = [d("1"), d("2"), d("3")];
  const add = (key: string) => history.did(keys.rita, "add", { fields: { key, category } }).seq;
  const first = add(x);
  const second = add(x);
  history.did(keys.rita, "finish", on(history, first));
  const third = add(y);
  history.did(keys.rita, "finish", on(history, second));
  const view = new View();
  const incomplete = new View();
  const absent = new View();
  expect([view.at(-1).state.scope(), view.at(-1).built]).toEqual([null, false]);
  for (const { entry, hash } of history.entries) {
    view.fold(definition, entry, hash);
    // Lose one opening's rows: the type still has two declared indexes,
    // but neither may answer even for the key of a row that is present.
    incomplete.fold(entry.seq === second ? { ...definition, keyed: {} } : definition, entry, hash);
    absent.fold({ ...definition, keyed: {} }, entry, hash);
    if (entry.seq === second) expect(view.at(first).state.lookup("row", "key", canonicalize(x), 9)).toEqual([first]);
  }
  const contents = (state: StateView) => [
    state.lookup("row", "key", canonicalize(x), 9),
    state.lookup("row", "key", canonicalize(y), 9),
    state.lookup("row", "category", canonicalize(category), 9),
    state.lookup("row", "key", canonicalize(x), 1),
    state.lookup("row", "key", canonicalize(d("4")), 9),
    state.lookup("row", "other", canonicalize(x), 9),
    state.all().items.filter((item) => item.type === "row").map((item) => [item.id, item.state]),
  ];
  const expected = new Map([
    [-1, [[], [], [], [], [], [], []]],
    [0, [[], [], [], [], [], [], []]],
    [1, [[first], [], [first], [first], [], null, [[first, "live"]]]],
    [2, [[first, second], [], [first, second], [first], [], null, [[first, "live"], [second, "live"]]]],
    [3, [[first, second], [], [first, second], [first], [], null, [[first, "done"], [second, "live"]]]],
    [4, [[first, second], [third], [first, second, third], [first], [], null, [[first, "done"], [second, "live"], [third, "live"]]]],
    [5, [[first, second], [third], [first, second, third], [first], [], null, [[first, "done"], [second, "done"], [third, "live"]]]],
  ]);
  for (const seq of [5, 2, 2, 4, 0, -1, 1, 1, 3, 5]) {
    const got = view.at(seq);
    expect(contents(got.state), `head ${seq}`).toEqual(expected.get(seq));
    expect(contents(got.state), `fold through head ${seq}`).toEqual(contents(history.replay(seq + 1)));
    expect(view.at(seq).built).toBe(false);
    expect(absent.at(seq).state.lookup("row", "key", canonicalize(x), 9)).toEqual(seq < 1 ? [] : null);
    const missing = incomplete.at(seq).state;
    expect([missing.lookup("row", "key", canonicalize(x), 9), missing.lookup("row", "category", canonicalize(category), 9)]).toEqual(seq < 1 ? [[], []] : seq === 1 ? [[first], [first]] : [null, null]);
  }
  expect([view.through, view.at(5).state === view, view.at(5).built]).toEqual([5, true, false]);
});
