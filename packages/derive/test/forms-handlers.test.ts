import { describe, expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { ActType, DeclaredDefinition, FieldValue, Request, Result } from "@generalbusiness/artroom-contract";
import { validateDefinition, type Fetched, type ProblemCode } from "../src/index.ts";
import { Scope, arrive, decided, deliver, fields, keys, on, ticket, ticketDefinition, valid, variant } from "./fixtures.ts";

const { rita } = keys;

/**
 * A board of cards, made up for these tests. A card may name a parent card,
 * the board may pin one card, and a lane may post a card or count on the
 * board's one tally. `note` reads three items that may not be there: the
 * pinned card, through the board's slot; the tally, which only a handler
 * opens; and, in `add`, the parent that an optional field names.
 */
const text = { type: "text", max: 100 } as const;
const slot = { fixed: false, required: false } as const;
const live = { open: { final: false }, done: { final: true } };
const act = (a: Partial<ActType> & Pick<ActType, "step" | "on" | "grant">): ActType => ({ also: {}, fields: {}, guards: [], effects: [], sends: [], attention: [], ...a });
const board: DeclaredDefinition = {
  format: "artroom-definition-1", name: "board", profile: { name: "restricted", version: 1 }, capabilities: [], genesis: "start",
  items: {
    board: { many: false, max: 1, states: { open: { final: false } }, initial: "open", parties: { owner: { fixed: true, required: true, list: false, author: false } }, refs: { pinned: { ...slot, to: { type: "item", of: "card" } } }, values: {} },
    card: {
      many: true, max: 3, states: live, initial: "open", parties: {},
      refs: { parent: { fixed: true, required: false, to: { type: "item", of: "card" } }, postedAt: { ...slot, to: { type: "fact", kind: ["post"], under: "board" } }, peer: { ...slot, to: { type: "scope", kind: "lane" } } },
      values: { note: { ...slot, of: text }, echo: { ...slot, of: text } },
    },
    tally: { many: false, max: 1, states: { kept: { final: false }, shut: { final: true } }, initial: "kept", parties: {}, refs: {}, values: { last: { ...slot, of: text } } },
  },
  acts: {
    start: act({ step: "open", on: "board", grant: "start", fields: { opener: { type: "member", required: true } }, effects: [{ party: { slot: "owner", from: { field: "opener" } } }] }),
    add: act({
      step: "open", on: "card", grant: "write", fields: { parent: { type: "item", of: "card", required: false }, note: { ...text, required: true } },
      also: { parent: { item: "card", by: "parent" }, board: { item: "board", one: true } },
      guards: [{ of: "also.parent", state: ["open"], reason: "parent-done" }], effects: [{ value: { slot: "note", from: { field: "note" } } }],
    }),
    // By a local fact: the card that the named `add` entry opened.
    reply: act({
      step: "open", on: "card", grant: "write", fields: { to: { type: "fact", kind: ["add"], under: "board", required: true } }, also: { to: { item: "card", by: "to" } },
      guards: [{ of: "also.to", state: ["open"], reason: "parent-done" }],
    }),
    pin: act({ step: "transition", on: "board", grant: "write", fields: { card: { type: "item", of: "card", required: true } }, guards: [{ state: ["open"] }], effects: [{ ref: { slot: "pinned", from: { field: "card" } } }] }),
    done: act({ step: "transition", on: "card", grant: "write", guards: [{ state: ["open"] }], effects: [{ state: "done" }] }),
    shut: act({ step: "transition", on: "tally", grant: "write", guards: [{ state: ["kept"] }], effects: [{ state: "shut" }] }),
    recount: act({ step: "open", on: "tally", grant: "write" }),
    note: act({
      step: "transition", on: "card", grant: "write", fields: { note: { ...text, required: true } },
      also: { pinned: { item: "card", via: { slot: "pinned", of: "also.board" } }, board: { item: "board", one: true }, tally: { item: "tally", one: true } },
      // The guard on the tally is nested in a form. The last effect's condition reads the tally, and would hold on none.
      guards: [{ state: ["open"] }, { of: "also.pinned", state: ["open"], reason: "pinned-done" }, { anyOf: [[{ of: "also.tally", equals: { a: { slot: "last" }, b: { field: "note" } } }]], reason: "not-the-last" }],
      effects: [
        { value: { slot: "note", from: { field: "note" } } }, { of: "also.pinned", value: { slot: "note", from: { field: "note" } } },
        { value: { slot: "echo", from: { field: "note" } }, if: [{ differs: { a: { slot: "last", of: "also.tally" }, b: { field: "note" } } }] },
      ],
    }),
  },
  receives: {
    post: {
      message: "post", class: "tell", from: { kind: "lane" }, opens: "card",
      fields: { text: { ...text, required: true }, about: { type: "item", of: "card", required: false }, proof: { type: "fact", kind: ["link"], under: "ticket", required: false } },
      also: { about: { item: "card", by: "about" } },
      guards: [{ of: "also.about", state: ["open"], reason: "about-done" }, { equals: { a: { field: "proof", part: "kind" }, b: { const: "link" } }, ifPresent: true, reason: "not-a-link" }],
      effects: [{ value: { slot: "note", from: { field: "text" } } }, { ref: { slot: "postedAt", from: "self" } }], sends: [], attention: [],
    },
    count: {
      message: "count", class: "tell", from: { kind: "lane" }, opens: "tally", fields: { text: { ...text, required: true } }, also: {}, guards: [],
      effects: [{ value: { slot: "last", from: { field: "text" } } }], sends: [], attention: [],
    },
    // Opens a card and tells the lane that asked. The clause of that request changes the card, and the tally if this entry found one.
    relay: {
      message: "relay", class: "tell", from: { kind: "lane" }, opens: "card", fields: { peer: { type: "scope", kind: "lane", required: true } }, also: { tally: { item: "tally", one: true } }, guards: [],
      effects: [{ ref: { slot: "peer", from: { field: "peer" } } }], attention: [],
      sends: [{ tell: { to: { slot: "peer" }, message: "seen", fields: {}, result: { applied: [{ value: { slot: "note", from: { const: "answered" } } }, { of: "also.tally", value: { slot: "last", from: { const: "answered" } } }] } } }],
    },
  },
  timed: {}, rules: {},
};
const boardDefinition = valid(validateDefinition(board, PROPOSED_BOUNDS));

/** A board B, and a lane X whose entries are made by hand: each holds one send to B, and nothing judged it. */
function lanes() {
  const B = new Scope(boardDefinition);
  const X = new Scope(ticketDefinition, rita.member, true, 1);
  const tell = (message: string, given: Record<string, FieldValue>, facts: readonly Fetched[] = []) => arrive(B, X, { class: "request", type: "tell", body: { message, fields: given } }, undefined, facts);
  const told = (message: string, given: Record<string, FieldValue>) => { tell(message, given); return decided(B); };
  return { B, X, tell, told };
}

describe("subjects and handlers (sections 6.4 and 7.3)", () => {
  test("an `also` name with no item is unbound: its guards are not evaluated, its effects are not applied, and `expected` has no key for it; once bound, all three hold again", () => {
    const B = new Scope(boardDefinition);
    const note = (card: number, also: Record<string, number>) => B.act(rita, "note", { ...on(B, card, also), ...fields({ note: "seen" }) });
    // No parent is named, so `parent` is unbound and its guard is not evaluated. The board is the one item of its type.
    const a = B.did(rita, "add", { ...fields({ note: "a" }), expected: { board: 1 } }).seq;
    const b = B.did(rita, "add", { ...fields({ note: "b", parent: a }), expected: { board: 1, parent: 1 } }).seq;
    // A key for a name that is unbound is refused, as any unknown key is.
    expect(B.act(rita, "add", { ...fields({ note: "c" }), expected: { board: 1, parent: 1 } })).toMatchObject({ result: "refused", reason: "bad-intent" });

    // Nothing is pinned and the scope has no tally: both names are unbound. The entry changes its own card and nothing else. The guard
    // on the tally is not evaluated, though it is nested, and the effect whose `if` reads the tally is not applied.
    expect(note(a, { board: 0 }).result).toBe("write");
    expect(B.last.effects).toEqual([{ effect: "value", item: a, slot: "note", value: "seen" }]);
    // The board pins b. The slot now selects b: `expected` needs its key, and the effect on it is applied.
    B.did(rita, "pin", { ...on(B, 0), ...fields({ card: b }) });
    expect(note(a, { board: 0 })).toMatchObject({ result: "refused", reason: "bad-intent" });
    expect(note(a, { board: 0, pinned: b }).result).toBe("write");
    expect([B.last.effects.length, B.item(b).values["note"]]).toEqual([2, "seen"]);
    // The pinned card is itself: two names, one item.
    expect(note(b, { board: 0, pinned: b })).toMatchObject({ result: "refused", reason: "alias" });
    // Its guard is evaluated again: b is done.
    B.did(rita, "done", on(B, b));
    expect(note(a, { board: 0, pinned: b })).toMatchObject({ result: "refused", reason: "guard-failed", name: "pinned-done" });

    // A local fact selects the item that its entry opened: a is open and b is done.
    const reply = (to: number) => B.act(rita, "reply", { ...fields({ to: B.fact(to) }), expected: { to: B.item(to).revision } });
    expect([reply(a).result, reply(b)]).toMatchObject(["write", { result: "refused", name: "parent-done" }]);
    // An entry that opened no item selects none.
    expect(B.act(rita, "reply", { ...fields({ to: B.fact(1) }), expected: {} })).toMatchObject({ result: "refused", reason: "no-item" });
    expect(B.replay().snapshot()).toBe(B.state.snapshot());
  });

  test("a relationship update runs the handler of its name: a first update past `copies` is `type-full`, an update of a key that is held is not, and an update with no handler keeps no copy", () => {
    const once = variant(ticket, (d) => {
      d.receives.closes.copies = 1;
      d.acts.follow = structuredClone(d.acts.link);
      d.acts.follow.sends[0].relate.name = "follows";
      // A `tell` of the same name is another message, with its own handler, which takes no field.
      const { copies: _, ...closes } = structuredClone(d.receives.closes);
      d.receives = { told: { ...closes, class: "tell", fields: {}, effects: [] }, ...d.receives };
    });
    const P = new Scope(once);
    const I = new Scope(once, rita.member, true, 1);
    const link = (kind = "link") => P.did(rita, kind, fields({ target: I.at, about: 0 })).seq;
    const [first, second] = [link(), link()];
    deliver(I, P, first);
    expect([decided(I), I.state.copies("closes", "lane")]).toEqual([["applied"], 1]);
    // A second key is one more than the handler keeps. The deciding entry has no effect, and no copy is kept.
    deliver(I, P, second);
    expect([decided(I), I.last.effects, I.state.relation(P.at, "closes", second), I.item(0).values["linked"]]).toEqual([["refused", "type-full"], [], null, "set"]);
    // The first key is held, so its next update is applied.
    deliver(I, P, P.did(rita, "unlink", on(P, first)).seq);
    expect([decided(I), I.state.relation(P.at, "closes", first)?.state]).toEqual([["applied"], "removed"]);

    // No handler is for the relationship `follows`. And one whose `from` names another definition is not for this sender.
    deliver(I, P, link("follow"));
    const other = new Scope(variant(ticket, (d) => { d.receives.closes.from.under = "board"; }), rita.member, true, 2);
    deliver(other, P, P.did(rita, "link", fields({ target: other.at, about: 0 })).seq);
    for (const s of [I, other]) expect([decided(s), s.last.effects, s.state.all().relations.length]).toEqual([["refused", "unknown-message"], [], s === I ? 1 : 0]);
    expect(I.replay().snapshot()).toBe(I.state.snapshot());
  });

  test("a handler reads the fields it declares, and opens its item: one for each delivery of a type that is `many`, up to its `max`; the one item of a type that is not, once", () => {
    const { B, X, tell, told } = lanes();

    // An ill-typed field and an unknown one. Neither opens anything.
    expect([told("post", { text: 7 }), told("post", { text: "a", more: true }), B.state.count("card", "open")]).toEqual([["refused", "bad-field"], ["refused", "bad-field"], 0]);
    // The delivery opens a card, which is its `on`, and sets a slot from `self`: the kind of this entry is the message's name.
    expect(told("post", { text: "a" })).toEqual(["applied"]);
    const a = B.last.seq;
    expect(B.item(a)).toMatchObject({ type: "card", revision: 1, values: { note: "a" }, refs: { postedAt: a } });
    // A message names its receiver's item by the fact of the entry that opened it. A fact with another hash names none.
    expect([told("post", { text: "b", about: { ...B.fact(a), hash: B.fact(0).hash } }), told("post", { text: "b", about: B.fact(a) })]).toEqual([["refused", "bad-field"], ["applied"]]);
    // The named card is done: the guard on it is evaluated, and the refusal carries its name.
    B.did(rita, "done", on(B, a));
    tell("post", { text: "c", about: B.fact(a) });
    expect(B.last.input).toMatchObject({ decision: "refused", reason: { code: "guard-failed", name: "about-done" } });
    // A card is live until it is done, and the type takes three live cards.
    expect([told("post", { text: "c" }), told("post", { text: "d" }), told("post", { text: "e" }), B.state.count("card", "open")]).toEqual([["applied"], ["applied"], ["refused", "type-full"], 3]);

    // The tally is not `many`. The first delivery opens it. The second finds it, changes it, and opens nothing.
    expect(told("count", { text: "x" })).toEqual(["applied"]);
    const tally = B.last.seq;
    expect(told("count", { text: "y" })).toEqual(["applied"]);
    expect([B.last.effects, B.item(tally)]).toMatchObject([[{ effect: "value", item: tally, slot: "last", value: "y" }], { revision: 2, values: { last: "y" } }]);
    // The tally is now bound in `note`, and its guard is evaluated: the note is not the last count.
    const card = B.last.seq - 3;
    const note = () => B.act(rita, "note", { ...on(B, card, { board: 0, tally }), ...fields({ note: "z" }) });
    expect(note()).toMatchObject({ result: "refused", name: "not-the-last" });
    // The tally is shut. It is still the one item of its type, so no delivery opens another, and none changes it.
    B.did(rita, "shut", on(B, tally));
    expect(told("count", { text: "z" })).toEqual(["refused", "final"]);
    // An act opens a second tally. Now `one` selects no one item, for a handler and for an act.
    B.did(rita, "recount");
    expect([told("count", { text: "z" }), note()]).toMatchObject([["refused", "no-item"], { result: "refused", reason: "no-item" }]);
    expect(B.replay().snapshot()).toBe(B.state.snapshot());

    // A fact that a field names is fetched before the turn, like a fact that an act names. Until it is, the delivery is not decided.
    X.did(rita, "link", fields({ target: B.at, about: 0 }));
    const proof = { fact: X.fact(2), entry: X.entries[2]!.entry, under: X.under };
    B.did(rita, "done", on(B, card));
    expect(tell("post", { text: "f", proof: proof.fact })).toEqual({ result: "unavailable", reason: "dependency-unavailable" });
    // The entry records it beside the source entry. One entry uses only so many foreign entries, and the source entry is one of them.
    B.bounds = { ...PROPOSED_BOUNDS, usesPerEntry: 1 };
    tell("post", { text: "f", proof: proof.fact }, [proof]);
    expect([decided(B), B.last.uses.length]).toEqual([["refused", "bad-field"], 1]);
    B.bounds = PROPOSED_BOUNDS;
    tell("post", { text: "f", proof: proof.fact }, [proof]);
    expect([decided(B), B.last.uses.map((u) => u.fact).at(-1), B.last.uses.length]).toEqual([["applied"], proof.fact, 2]);
  });

  test("a result clause changes the items that its entry selected, read as they are now, and not an item that the entry did not find", () => {
    const { B, X, tell, told } = lanes();
    // B.2 opens a card and tells X. The scope has no tally yet, so `tally` is unbound in that entry.
    tell("relay", { peer: X.at });
    const asked = B.last.seq;
    expect(told("count", { text: "x" })).toEqual(["applied"]);
    const tally = B.last.seq;
    // X decides the request, and its result returns. The clause runs on the card that B.2 opened. The tally came later: it is not changed.
    const request = { from: B.fact(asked), n: 0 };
    const result: Result = { class: "result", of: request, outcome: "applied" };
    expect(arrive(B, X, result, { type: "delivery", ...request, message: B.entries[asked]!.entry.sends[0]!.message as Request, decision: "applied" }).result).toBe("write");
    expect([B.last.effects, B.item(tally).values["last"]]).toEqual([[{ effect: "value", item: asked, slot: "note", value: "answered" }], "x"]);
    expect(B.replay().snapshot()).toBe(B.state.snapshot());
  });

  test("the validator refuses a name that selects nothing it can check, and a handler that is not the form of its class", () => {
    const refusal = (base: DeclaredDefinition, change: (d: any) => void) => {   // eslint-disable-line @typescript-eslint/no-explicit-any
      const d = structuredClone(base);
      change(d);
      const result = validateDefinition(d, PROPOSED_BOUNDS);
      return result.ok ? null : [...new Set(result.problems.map((p) => p.code))];
    };
    const inBoard = (change: (d: any) => void) => refusal(board, change);   // eslint-disable-line @typescript-eslint/no-explicit-any
    const rows: [string, ProblemCode[] | null, ProblemCode | null][] = [
      ["a field of a fact whose entry opens another type", inBoard((d) => { d.acts.reply.fields.to.kind = ["start"]; }), "name"],
      ["a field of a fact under another definition", inBoard((d) => { d.acts.reply.fields.to.under = "ticket"; }), "name"],
      ["a slot that holds no item of that type", inBoard((d) => { d.acts.note.also.pinned.item = "board"; }), "name"],
      ["the slots of an item that the act opens", inBoard((d) => { d.acts.add.also.next = { item: "card", via: { slot: "parent", of: "on" } }; }), "name"],
      ["two names that each read the other's slot", inBoard((d) => { d.acts.note.also = { x: { item: "card", via: { slot: "parent", of: "also.y" } }, y: { item: "card", via: { slot: "parent", of: "also.x" } } }; d.acts.note.guards.length = 1; d.acts.note.effects.length = 1; }), "name"],
      ["a name that reads a slot of an earlier name, in any order of the names, passes", inBoard((d) => { d.acts.note.also = { a: { item: "card", via: { slot: "parent", of: "also.z" } }, z: { item: "card", via: { slot: "parent", of: "on" } } }; d.acts.note.guards.length = 1; d.acts.note.effects.length = 1; }), null],
      ["`one` of a type that is `many`", inBoard((d) => { d.acts.add.also.board.item = "card"; }), "name"],
      ["two ways to select one name", inBoard((d) => { d.acts.add.also.board.by = "parent"; }), "shape"],
      ["a result clause that names an item selected through a slot which may change", inBoard((d) => {
        d.items.board.refs.peer = { fixed: false, required: false, to: { type: "scope", kind: "lane" } };
        d.acts.note.sends = [{ tell: { to: { slot: "peer" }, message: "seen", fields: {}, result: { applied: [{ of: "also.pinned", value: { slot: "note", from: { const: "told" } } }] } } }];
        d.acts.note.on = "board"; d.acts.note.guards = []; d.acts.note.effects = []; d.acts.note.also = { pinned: { item: "card", via: { slot: "pinned", of: "on" } } };
      }), "name"],

      ["a handler with no class", inBoard((d) => { delete d.receives.post.class; }), "shape"],
      ["a class the contract does not define", inBoard((d) => { d.receives.post.class = "ask"; }), "shape"],
      ["a tell and a relate handler for one name pass", inBoard((d) => { d.receives.again = { ...structuredClone(d.receives.count), class: "relate", copies: 1 }; }), null],
      ["a relate handler that states no number of copies", refusal(ticket, (d) => { delete d.receives.closes.copies; }), "shape"],
      ["a number of copies on a tell handler", inBoard((d) => { d.receives.post.copies = 2; }), "shape"],
      ["an advisory handler for a message that is no advisory type", inBoard((d) => { d.receives.count.class = "advisory"; }), "name"],
      ["an advisory handler that tells a member", inBoard((d) => { Object.assign(d.receives.count, { class: "advisory", message: "index", attention: [{ notify: { slot: "owner", of: "also.board", when: "after", reason: "counted" } }], also: { board: { item: "board", one: true } } }); }), "advisory-sends"],
      ["a field of a message with a default", inBoard((d) => { d.receives.post.fields.about.default = 1; }), "shape"],
      ["a handler that opens no item type", inBoard((d) => { d.receives.post.opens = "page"; }), "name"],
      ["a handler's guard on the item it opens", inBoard((d) => { d.receives.post.guards.push({ state: ["open"] }); }), "nascent-guard"],
      ["a handler whose opening leaves a required slot unset", inBoard((d) => { d.items.card.values.note.required = true; d.receives.post.effects.shift(); }), "required-unset"],
      ["a handler that sets a fixed slot of the one item of its type, which may exist already", inBoard((d) => { d.items.tally.values.last.fixed = true; }), "fixed"],
      ["a handler that sets the state of the one item of its type, which may be final already", inBoard((d) => { d.items.tally.states.shut = { final: true }; d.receives.count.effects.push({ state: "kept" }); }), "final"],
      ["`self` from a handler into a fact slot whose kinds do not include its message", inBoard((d) => { d.items.card.refs.postedAt.to.kind = ["count"]; }), "name"],
    ];
    expect(rows.filter(([, found, code]) => (code === null ? found !== null : found?.length !== 1 || found[0] !== code)).map(([name, found]) => [name, found])).toEqual([]);
  });
});
