import { describe, expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { ActType, DeclaredDefinition, FactRef, FieldValue, Guard, Operand } from "@generalbusiness/artroom-contract";
import { intentDigest } from "@generalbusiness/artroom-bytes";
import { validateDefinition, type Fetched, type ProblemCode } from "../src/index.ts";
import { Scope, deliver, fields, keys, on, ticket, valid, variant } from "./fixtures.ts";

const { rita, una } = keys;

/**
 * A lane of asks, made up for these tests. An ask keeps `termsAt`: the entry
 * that last stated its text, set from `self`. `accept` names that entry as a
 * fact. A block waits on an ask of another lane, and is released by an
 * answer to that same ask.
 */
const fact = (...kind: string[]) => ({ type: "fact", kind, under: "asks" }) as const;
const text = { type: "text", max: 100 } as const;
const slot = { fixed: false, required: false } as const;
const act = (a: Partial<ActType> & Pick<ActType, "step" | "on" | "grant">): ActType => ({ also: {}, fields: {}, guards: [], effects: [], sends: [], attention: [], ...a });
const asks: DeclaredDefinition = {
  format: "artroom-definition-1", name: "asks", profile: { name: "restricted", version: 1 }, capabilities: [], genesis: "start",
  items: {
    desk: { many: false, max: 1, states: { open: { final: false } }, initial: "open", parties: { owner: { fixed: true, required: true, list: false, author: false } }, refs: {}, values: {} },
    ask: {
      many: true, max: 8, states: { asked: { final: false }, answered: { final: false }, accepted: { final: true } }, initial: "asked",
      parties: { asker: { fixed: true, required: true, list: false, author: false }, watchers: { ...slot, list: true, max: 4, author: false } },
      refs: { termsAt: { fixed: false, required: true, to: fact("ask", "revise") } }, values: { text: { ...slot, of: text } },
    },
    block: { many: true, max: 8, states: { blocked: { final: false }, released: { final: true } }, initial: "blocked", parties: {}, refs: { on: { fixed: true, required: true, to: fact("ask") } }, values: {} },
  },
  acts: {
    start: act({ step: "open", on: "desk", grant: "start", fields: { opener: { type: "member", required: true } }, effects: [{ party: { slot: "owner", from: { field: "opener" } } }] }),
    ask: act({
      step: "open", on: "ask", grant: "ask", fields: { text: { ...text, required: true } },
      effects: [{ party: { slot: "asker", from: { signer: true } } }, { party: { slot: "watchers", from: { signer: true }, list: "add" } }, { value: { slot: "text", from: { field: "text" } } }, { ref: { slot: "termsAt", from: "self" } }],
    }),
    revise: act({
      step: "transition", on: "ask", grant: "ask", fields: { text: { ...text, required: true } }, guards: [{ state: ["asked"] }],
      effects: [{ value: { slot: "text", from: { field: "text" } } }, { ref: { slot: "termsAt", from: "self" } }],
    }),
    answer: act({ step: "transition", on: "ask", grant: "answer", guards: [{ state: ["asked"] }], effects: [{ state: "answered" }] }),
    accept: act({
      step: "transition", on: "ask", grant: "accept", fields: { terms: { ...fact("ask", "revise"), required: true } },
      guards: [{ state: ["asked", "answered"] }, { equals: { a: { field: "terms" }, b: { slot: "termsAt" } }, reason: "terms-differ" }], effects: [{ state: "accepted" }],
    }),
    block: act({ step: "open", on: "block", grant: "block", fields: { on: { ...fact("ask"), required: true } }, effects: [{ ref: { slot: "on", from: { field: "on" } } }] }),
    // Names the entry that opened a lane of asks: a genesis, whose kind is the genesis act's.
    trace: act({ step: "transition", on: "ask", grant: "ask", fields: { origin: { ...fact("start"), required: true } }, guards: [{ fact: { field: "origin" } }] }),
    "release-block": act({
      step: "transition", on: "block", grant: "block", fields: { answer: { ...fact("answer"), required: true } },
      guards: [
        { state: ["blocked"] }, { fact: { field: "answer" } },
        { equals: { a: { field: "answer", part: "scope" }, b: { slot: "on", part: "scope" } }, reason: "not-this-lane" },
        { equals: { a: { field: "answer", part: "on" }, b: { slot: "on", part: "seq" } }, reason: "not-this-ask" },
      ],
      effects: [{ state: "released" }],
    }),
  },
  receives: {}, timed: {}, rules: {},
};
const asksDefinition = valid(validateDefinition(asks, PROPOSED_BOUNDS));

/** An entry of `s` as another scope fetches it: by fact, with its bytes and the name its scope's definition states. */
const fetched = (s: Scope, seq: number): Fetched => ({ fact: s.fact(seq), entry: s.entries[seq]!.entry, under: s.under });
const equals = (a: Operand, b: Operand, reason: string): Guard => ({ equals: { a, b }, reason });

/** M, another lane of asks: M.2 and M.3 open asks 2 and 3, and M.4 and M.5 answer them. */
function other(): Scope {
  const M = new Scope(asksDefinition, rita.member, true, 1);
  M.did(una, "ask", fields({ text: "why" }));
  M.did(una, "ask", fields({ text: "when" }));
  M.did(rita, "answer", on(M, 2));
  M.did(rita, "answer", on(M, 3));
  return M;
}
/** L opens a block on an ask of M, which it fetched. Returns the block's ID, which is the position of its entry. */
function blockOn(L: Scope, M: Scope, ask = 2): number {
  expect(L.act(rita, "block", fields({ on: M.fact(ask) }), { facts: [fetched(M, ask)] }).result).toBe("write");
  return L.last.seq;
}

describe("operands, parts and a local fact (sections 6.2 and 6.5; witness 18.1)", () => {
  test("a block is released only by an answer to the ask it waits on, read from the fetched entry; a refusal carries the name its guard declares", () => {
    const M = other();
    const L = new Scope(asksDefinition);
    const block = blockOn(L, M);
    const release = (answer: number, facts = [fetched(M, answer)]) => L.act(rita, "release-block", { ...on(L, block), ...fields({ answer: M.fact(answer) }) }, { facts });

    // M.5 answers ask 3. Its `on` is 3, and the block waits on the entry at position 2.
    expect(release(5)).toMatchObject({ result: "refused", reason: "guard-failed", name: "not-this-ask", detail: "guards.3" });
    // M.2 is an `ask`, which is not a kind the field states: the `fact` guard fails, and it declares no name.
    const asked = L.act(rita, "release-block", { ...on(L, block), ...fields({ answer: M.fact(2) }) }, { facts: [fetched(M, 2)] });
    expect([asked.result, "name" in asked]).toEqual(["refused", false]);
    // M.4 answers ask 2: its scope is M and its `on` is 2. Only the entry that was read is in `uses`. The slot's fact was compared and not read.
    expect(release(4).result).toBe("write");
    expect([L.last.uses.map((u) => u.fact), L.item(block).state]).toEqual([[M.fact(4)], "released"]);
    expect(L.replay().snapshot()).toBe(L.state.snapshot());
  });

  test("a fact that names this scope's own entry is checked against its history, is not fetched, and equals the slot that entry set from `self`; another hash is `fact-mismatch`", () => {
    const L = new Scope(asksDefinition);
    const first = L.did(una, "ask", fields({ text: "why" }));
    const ask = first.seq;
    // The slot holds a local entry reference: the position of the entry that set it.
    expect([first.effects.at(-1), L.item(ask).refs["termsAt"]]).toEqual([{ effect: "ref", item: ask, slot: "termsAt", to: ask }, ask]);
    const accept = (terms: FactRef) => L.act(rita, "accept", { ...on(L, ask), ...fields({ terms }) }, { facts: [] });

    // A fact with that position and another hash is not this scope's entry.
    expect(accept({ ...L.fact(ask), hash: L.fact(0).hash })).toMatchObject({ result: "refused", reason: "fact-mismatch" });
    expect(accept({ ...L.fact(ask), seq: L.head.seq + 1 })).toMatchObject({ result: "refused", reason: "fact-mismatch" });
    // Without its own history the scope cannot check the fact, so the act is not judged.
    expect(L.act(rita, "accept", { ...on(L, ask), ...fields({ terms: L.fact(ask) }) }, { own: undefined }).result).toBe("unavailable");

    // After a revision the slot names the revising entry. The earlier entry is still this scope's, and is no longer the terms.
    const revised = L.did(una, "revise", { ...on(L, ask), ...fields({ text: "why not" }) }).seq;
    expect(accept(L.fact(ask))).toMatchObject({ result: "refused", reason: "guard-failed", name: "terms-differ" });
    // The entry that states the terms is accepted. Nothing was fetched, and nothing is in `uses`.
    expect(accept(L.fact(revised)).result).toBe("write");
    expect([L.last.uses, L.item(ask).state]).toEqual([[], "accepted"]);
    expect(L.replay().snapshot()).toBe(L.state.snapshot());
  });

  test("each part reads what its entry holds: a fetched entry's bytes, this scope's own history, and none where the entry has no such part", () => {
    const M = other();
    const asked = M.entries[2]!.entry;
    const intent = asked.input.type === "act" ? intentDigest(asked.input.signed.intent) : null;
    const proof = (part: NonNullable<Extract<Operand, { field: string }>["part"]>): Operand => ({ field: "proof", part });
    const is = (name: string, a: Operand, value: FieldValue): Guard => equals(a, { const: value }, name);
    const none = (name: string, a: Operand): Guard => equals(a, { none: true }, name);
    // `proof` is M.2, the `ask` that opened ask 2. `second` is M.6, a block whose field `on` names L.2, this scope's own ask. `origin` is M.0, M's genesis.
    const parts: Guard[] = [
      is("ref", proof("ref"), M.fact(2)), is("scope", proof("scope"), M.at), is("seq", proof("seq"), 2),
      is("kind", proof("kind"), "ask"), is("intent", proof("intent"), intent!), is("on", proof("on"), 2),
      is("field", proof({ field: "text" }), "why"),
      is("opened state", proof({ opened: "state" }), "asked"), is("opened party", proof({ opened: "asker" }), una.member),
      is("opened list", proof({ opened: "watchers" }), [una.member]), is("opened ref", proof({ opened: "termsAt" }), 2),
      is("set", proof({ set: { item: proof("on"), slot: "text" } }), "why"),
      is("then seq", { field: "second", part: { of: { field: "on" }, then: "seq" } }, 2), equals({ field: "second", part: { of: { field: "on" }, then: "scope" } }, { scope: true }, "then scope"),
      // A fact that a fetched entry holds, and that names this scope's own entry, equals the local reference to that entry in a slot of another subject.
      equals({ field: "second", part: { field: "on" } }, { slot: "termsAt", of: "also.mine" }, "names my entry"),
      // What an entry does not hold is none: an unknown field or slot, an item it did not change, a value that is no fact, and the intent of a created scope.
      none("no field", proof({ field: "title" })), none("no slot", proof({ opened: "title" })), none("no item", proof({ set: { item: { const: 9 }, slot: "text" } })),
      none("no fact", proof({ of: { field: "text" }, then: "seq" })), none("no intent", { field: "origin", part: "intent" }),
      // The block waits on M.3. That fact is held in a slot and is not named by this input, so its bytes were not fetched:
      // its position is read from the reference, and a part of its bytes is none.
      is("slot seq", { slot: "on", part: "seq" }, 3), none("slot bytes", { slot: "on", part: "kind" }),
    ];
    const probing = variant(asks, (d) => {
      d.acts.probe = act({
        step: "transition", on: "block", grant: "block", also: { mine: { item: "ask", by: "mine" } }, guards: parts,
        fields: { proof: { ...fact("ask"), required: true }, second: { ...fact("block"), required: true }, origin: { ...fact("start"), required: true }, mine: { type: "item", of: "ask", required: true } },
      });
      // On this scope's own entry: the parts are read from its history, and compared with what this scope holds.
      d.acts.own = act({
        step: "transition", on: "ask", grant: "ask", fields: { terms: { ...fact("ask", "revise"), required: true } },
        guards: [
          equals({ field: "terms", part: "kind" }, { const: "ask" }, "kind"), equals({ field: "terms", part: "scope" }, { scope: true }, "scope"),
          equals({ field: "terms", part: "seq" }, { item: "on" }, "seq"), equals({ field: "terms", part: { opened: "termsAt" } }, { slot: "termsAt" }, "opened"),
          equals({ field: "terms", part: { opened: "asker" } }, { signer: true }, "signer"), equals({ field: "terms", part: "intent" }, { intent: true }, "another intent"),
        ],
      });
    });
    const L = new Scope(probing);
    const ask = L.did(una, "ask", fields({ text: "why" })).seq;   // L.2
    expect(M.act(rita, "block", fields({ on: L.fact(ask) }), { facts: [fetched(L, ask)] }).result).toBe("write");   // M.6
    const block = blockOn(L, M, 3);
    const probe = L.act(rita, "probe", { ...on(L, block, { mine: ask }), ...fields({ proof: M.fact(2), second: M.fact(6), origin: M.fact(0), mine: ask }) }, { facts: [fetched(M, 2), fetched(M, 6), fetched(M, 0)] });
    // A guard that fails names the part it read.
    expect("name" in probe ? probe.name : probe.result).toBe("write");

    // Every guard but the last holds: the entry's intent is not the intent being judged.
    expect(L.act(una, "own", { ...on(L, ask), ...fields({ terms: L.fact(ask) }) })).toMatchObject({ result: "refused", reason: "guard-failed", name: "another intent", detail: "guards.5" });
  });

  test("witness 18.26: the kind of a genesis entry is read from the entry. A lane under another definition accepts a fact that names it when the type's kinds include that kind and its `under` is the name the source answered; it refuses when the kinds omit it, and when the name differs although the kind passes", () => {
    const M = other();
    const trace = (L: Scope, origin: Scope) => {
      const ask = L.did(una, "ask", fields({ text: "why" })).seq;
      return L.act(una, "trace", { ...on(L, ask), ...fields({ origin: origin.fact(0) }) }, { facts: origin === L ? [] : [fetched(origin, 0)] });
    };
    // This scope's own genesis, and the genesis of another lane under the same definition.
    const L = new Scope(asksDefinition);
    expect([trace(L, L).result, trace(L, M).result]).toEqual(["write", "write"]);
    // P pins another definition, with another name and another genesis act. It holds no bytes of M's definition: the kind `start` is in M.0.
    // A definition with another name: the slot that an ask sets from `self` holds a fact under its own definition.
    const named = (name: string, change: (d: any) => void = () => {}) => variant(asks, (d) => { d.name = name; d.items.ask.refs.termsAt.to = { ...d.items.ask.refs.termsAt.to, under: name }; change(d); });   // eslint-disable-line @typescript-eslint/no-explicit-any
    const elsewhere = (change: (d: any) => void = () => {}) => named("elsewhere", (d) => { d.genesis = "begin"; d.acts.begin = d.acts.start; delete d.acts.start; change(d); });   // eslint-disable-line @typescript-eslint/no-explicit-any
    const P = new Scope(elsewhere());
    expect([(M.entries[0]!.entry.input as { kind?: string }).kind, trace(P, M).result, P.last.uses]).toEqual(["start", "write", [{ fact: M.fact(0), content: expect.any(String) }]]);
    // Q differs from P in one thing: the kinds of the field omit that genesis act.
    const Q = new Scope(elsewhere((d) => { d.acts.trace.fields.origin.kind = ["ask"]; }));
    expect(trace(Q, M)).toMatchObject({ result: "refused", reason: "guard-failed", detail: "guards.0" });
    // A lane whose definition has another name and the same genesis act: the kind passes, and the name does not. A kind does not excuse a name.
    const O = new Scope(named("other"));
    expect([(O.entries[0]!.entry.input as { kind?: string }).kind, trace(P, O)]).toEqual(["start", expect.objectContaining({ result: "refused", reason: "guard-failed", detail: "guards.0" })]);
  });

  test("a handler reads its sender, the source entry and the update; a refused delivery records the name its guard declares, and the result carries it; the delivery's kind is its message's name; a field of a foreign delivery is read as its bytes hold it, whatever handler its reader declares", () => {
    const change = (d: any) => {   // eslint-disable-line @typescript-eslint/no-explicit-any
      d.receives.closes.guards = [
        equals({ update: "state" }, { const: "set" }, "not-set"),
        equals({ sender: true }, { source: "scope" }, "sender"), equals({ update: "revision" }, { source: "seq" }, "revision"),
        equals({ update: "item" }, { source: "ref" }, "item"), equals({ source: "kind" }, { const: "link" }, "kind"), equals({ source: { field: "about" } }, { field: "about" }, "about"),
      ];
      // `cite` names a delivery of `closes`, and may compare the `madeAt` that it delivered with a fact, or with a record.
      const madeAt = (b: string): Guard => ({ fact: { field: "closed", where: [{ equals: { a: { field: "madeAt" }, b: { field: b } } }] }, ifPresent: true, reason: b });
      // `peek` compares the same field of an entry whose kind it does not ask for.
      d.acts.peek = act({
        step: "transition", on: "intent", grant: "link", fields: { closed: { type: "fact", kind: ["closes"], under: "ticket", required: true }, by: { type: "fact", kind: ["link"], under: "ticket", required: true } },
        guards: [equals({ field: "closed", part: { field: "madeAt" } }, { field: "by" }, "peek")],
      });
      d.acts.cite = act({
        step: "transition", on: "intent", grant: "link", guards: [{ state: ["open"] }, { fact: { field: "closed" } }, madeAt("by"), madeAt("flag")],
        fields: {
          closed: { type: "fact", kind: ["closes"], under: "ticket", required: true }, by: { type: "fact", kind: ["link"], under: "ticket", required: false },
          flag: { type: "record", of: { self: { type: "bool", required: true } }, required: false },
        },
      });
      // The link keeps the entry that made it, set from `self`, and its update carries that slot, a fact that the act names, and a fact that it is presented.
      d.items.link.refs.madeAt = { fixed: true, required: true, to: { type: "fact", kind: ["link"], under: "ticket" } };
      d.acts.link.fields.because = { type: "fact", kind: ["file"], under: "ticket", required: true };
      d.acts.link.effects.push({ ref: { slot: "madeAt", from: "self" } });
      d.acts.link.presents = { shown: { kind: ["file"], under: "ticket", required: false } };
      Object.assign(d.acts.link.sends[0].relate.detail, { madeAt: { slot: "madeAt" }, because: { field: "because" }, shown: { presented: "shown" } });
      const filed = { type: "fact", kind: ["file"], under: "ticket", required: false };
      Object.assign(d.receives.closes.fields, { madeAt: { type: "fact", kind: ["link"], under: "ticket", required: false }, because: filed, shown: filed });
      d.receives.closes.guards.push(equals({ field: "madeAt" }, { source: "ref" }, "made at"));
    };
    const definition = variant(ticket, change);
    const P = new Scope(definition);
    const I = new Scope(definition, rita.member, true, 1);
    // P.2 opens link 2 and sends its update, `set`. The source entry is that `link` act, and the owner's item is the entry itself.
    expect(P.act(rita, "link", fields({ target: I.at, about: 0, because: P.fact(0) }), { presented: { shown: P.fact(0) } }).result).toBe("write");
    // Section 6.4: a local entry reference is not sent as a position. The entry being written is sent as the `self` mark, which the
    // receiver reads as the envelope's source, and an earlier entry as its fact reference: one that a field names, and one that is presented.
    expect(P.last.sends[0]!.message).toMatchObject({ body: { detail: { madeAt: { self: true }, because: P.fact(0), shown: P.fact(0) } } });
    expect(deliver(I, P, 2)).toMatchObject({ result: "write", draft: { input: { decision: "applied" } } });
    const applied = I.head.seq;
    // P.3 removes the link. The handler's first guard fails, so the deciding entry is `refused`, with the code and the guard's name, and so is its result.
    P.did(rita, "unlink", on(P, 2));
    deliver(I, P, 3);
    const reason = { code: "guard-failed", name: "not-set" };
    expect(I.last).toMatchObject({ input: { decision: "refused", reason }, effects: [], sends: [{ message: { class: "result", outcome: "refused", reason } }] });
    // The sender records that result as it came.
    deliver(P, I, I.head.seq);
    expect(P.last.input).toMatchObject({ clause: "refused", message: { reason } });

    // The entry that recorded the first update is a delivery of the request `closes`: that is its kind, for a fact of this scope's own.
    const cite = (seq: number) => I.act(rita, "cite", { ...on(I, 0), ...fields({ closed: I.fact(seq) }) }).result;
    expect([cite(applied), cite(0)]).toEqual(["write", "refused"]);

    // A field of this scope's own delivery is read by the types of the handler that received it: I's `madeAt` is a fact, so the mark is P.2.
    const cited = (closed: Fetched | FactRef, given: Record<string, FieldValue>, link = 2) => {
      const judgment = I.act(rita, "cite", { ...on(I, 0), ...fields({ closed: "fact" in closed ? closed.fact : closed, ...given }) }, { facts: ["fact" in closed ? [closed] : [], "by" in given ? [fetched(P, link)] : []].flat() });
      return "name" in judgment ? judgment.name : judgment.result;
    };
    expect([cited(I.fact(applied), { by: P.fact(2) }), cited(I.fact(applied), { flag: { self: true } })]).toEqual(["write", "flag"]);
    // J is a lane under a definition of the same name, whose `closes` takes `madeAt` as a record with a boolean member `self`. P.5 sends
    // it the same bytes, and J admits a record. I reads J's entry, and declares a handler of that name whose `madeAt` is a fact. That
    // handler says nothing of J's entry: the field is the record that the bytes hold, and it equals no reference to P.5.
    const J = new Scope(variant(ticket, (d) => { change(d); d.receives.closes.guards.pop(); d.receives.closes.fields.madeAt = { type: "record", of: { self: { type: "bool", required: true } }, required: false }; }), rita.member, true, 2);
    const link = P.did(rita, "link", fields({ target: J.at, about: 0, because: P.fact(0) })).seq;
    expect([deliver(J, P, link).result, J.last.input]).toMatchObject(["write", { decision: "applied", message: { body: { detail: { madeAt: { self: true } } } } }]);
    expect([cited(fetched(J, J.head.seq), { by: P.fact(link) }, link), cited(fetched(J, J.head.seq), { flag: { self: true } })]).toEqual(["by", "write"]);
    // K's handler is for a sender under another definition, so K decides the same update `unknown-message`. No handler of K received
    // the field, and the handler of that name does not read it afterwards: in K's own entry it is the record too.
    const K = new Scope(variant(ticket, (d) => { change(d); d.receives.closes.from.under = "board"; }), rita.member, true, 3);
    const unread = P.did(rita, "link", fields({ target: K.at, about: 0, because: P.fact(0) })).seq;
    deliver(K, P, unread);
    expect([K.last.input, K.act(rita, "peek", { ...on(K, 0), ...fields({ closed: K.fact(K.head.seq), by: P.fact(unread) }) }, { facts: [fetched(P, unread)] })]).toMatchObject([{ decision: "refused", reason: { code: "unknown-message" } }, { result: "refused", name: "peek" }]);
  });

  test("an operand names only what its place has, and a part only what an entry can hold", () => {
    const refusal = (base: DeclaredDefinition, change: (d: any) => void) => {   // eslint-disable-line @typescript-eslint/no-explicit-any
      const d = structuredClone(base);
      change(d);
      const result = validateDefinition(d, PROPOSED_BOUNDS);
      return result.ok ? null : [...new Set(result.problems.map((p) => p.code))];
    };
    const inAct = (guard: Guard) => refusal(asks, (d) => d.acts.accept.guards.push(guard));
    const inHandler = (guard: Guard) => refusal(ticket, (d) => d.receives.closes.guards.push(guard));
    const about = (a: Operand): Guard => ({ equals: { a, b: { const: 1 } } });
    const rows: [string, ProblemCode[] | null, ProblemCode][] = [
      ["a sender in an act", inAct(about({ sender: true })), "name"],
      ["a source entry in an act", inAct(about({ source: "kind" })), "name"],
      ["an update in an act", inAct(about({ update: "state" })), "name"],
      ["a result outside a result clause", inHandler(about({ result: "reason" })), "name"],
      ["a signer in a handler", inHandler(about({ signer: true })), "name"],
      ["an intent in a handler", inHandler(about({ intent: true })), "name"],
      ["an update in a handler of a tell", refusal(variant(ticket, () => {}).declared, (d) => { d.receives.closes.class = "tell"; delete d.receives.closes.copies; d.receives.closes.guards.push(about({ update: "state" })); }), "name"],
      ["a presented fact that the act does not present", inAct(about({ presented: "pin" })), "name"],
      ["an element with no form that binds it", inAct(about({ element: "e" })), "name"],
      ["a slot of each item with no fan-out", inAct(about({ slot: "text", of: "each" })), "name"],
      ["a subject on an operand that is not a slot", inAct(about({ field: "terms", of: "on" } as never)), "shape"],
      ["a part of an operand that names no entry", inAct(about({ signer: true, part: "seq" } as never)), "shape"],
      ["a part of a value that is no fact", inAct(about({ slot: "text", part: "seq" })), "name"],
      ["a part the contract does not define", inAct(about({ field: "terms", part: "hash" as never })), "shape"],
      ["a part of a part that is not a scope or a position", inAct(about({ field: "terms", part: { of: "ref", then: "kind" as never } })), "shape"],
      ["a part of a capability record, in a definition that lists no capability with such a record", inAct(about({ field: "terms", part: { carried: "check.commit" } })), "capability"],
      ["a guard that reads a slot of the item its act opens, named by `of`", refusal(asks, (d) => d.acts.ask.guards.push(about({ slot: "text", of: "on" }))), "nascent-guard"],
      ["a guard that reads the item its act opens", refusal(asks, (d) => d.acts.ask.guards.push(about({ item: "on" }))), "nascent-guard"],
      ["a reason that is not a text", refusal(asks, (d) => { d.acts.accept.guards[1].reason = 7; }), "shape"],
      ["`self` in a fact slot whose kinds do not include the act's kind", refusal(asks, (d) => { d.items.ask.refs.termsAt.to.kind = ["ask"]; }), "name"],
      ["`self` in a fact slot under another definition's name", refusal(asks, (d) => { d.items.ask.refs.termsAt.to.under = "others"; d.acts.accept.fields.terms.under = "others"; }), "name"],
    ];
    expect(rows.filter(([, found, code]) => found?.length !== 1 || found[0] !== code).map(([name, found]) => [name, found])).toEqual([]);
  });
});
