import { describe, expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { ActType, Bounds, DeclaredDefinition, EffectForm, FieldValue, Guard, MemberRef, Notify, Send } from "@generalbusiness/artroom-contract";
import { factRefOf } from "@generalbusiness/artroom-bytes";
import { clockOf, deriveEffects, judgeDelivery, judgeGuards, validateDefinition, type ActJudgment, type Judging, type ProblemCode } from "../src/index.ts";
import { Scope, arriving, deliver, desk, fields, forged, founded, keys, member, on, ticket, ticketDefinition, valid, variant, type Actor, type Over } from "./fixtures.ts";

const { rita, una, vic, paul, sam } = keys;

/**
 * Cards, made up for these tests. A card has an owner, a helper, a team, a
 * parent, a text and a size. A summary takes the attribution of a card,
 * with further sources.
 */
const text = { type: "text", max: 40 } as const;
const size = { type: "int", min: 0, max: 9 } as const;
const slot = { fixed: false, required: false } as const;
const one = { fixed: true, required: true, list: false, author: false } as const;
const act = (a: Partial<ActType> & Pick<ActType, "step" | "on" | "grant">): ActType => ({ also: {}, fields: {}, guards: [], effects: [], sends: [], attention: [], ...a });
const fact = (...kind: string[]) => ({ type: "fact", kind, under: "cards" }) as const;
const parent = { also: { parent: { item: "card", by: "parent" } }, fields: { parent: { type: "item", of: "card", required: true } } } as const;
const owner: EffectForm = { party: { slot: "owner", from: { signer: true } } };
const cleared: Guard[] = [{ equals: { a: { field: "clear" }, b: { const: true } } }];
const change = (a: Partial<ActType>) => act({ step: "transition", on: "card", grant: "write", ...a });
const cards: DeclaredDefinition = {
  format: "artroom-definition-1", name: "cards", profile: { name: "restricted", version: 1 }, capabilities: [], genesis: "start",
  items: {
    deck: { many: false, max: 1, states: { open: { final: false } }, initial: "open", parties: { owner: one }, refs: {}, values: {} },
    card: {
      many: true, max: 8, states: { draft: { final: false }, done: { final: true } }, initial: "draft",
      parties: { owner: { ...one, author: true }, helper: { ...slot, list: false, author: false }, team: { ...slot, list: true, max: 3, author: false } },
      refs: { parent: { ...slot, to: { type: "item", of: "card" } } }, values: { text: { ...slot, of: text }, size: { ...slot, of: size }, tags: { ...slot, of: { type: "list", of: text, max: 2 } } },
    },
    summary: {
      many: true, max: 8, states: { made: { final: false } }, initial: "made",
      parties: { owner: one, authors: { fixed: true, required: true, list: true, max: 8, author: false } }, refs: { of: { ...slot, to: { type: "item", of: "card" } } }, values: {},
    },
  },
  acts: {
    start: act({ step: "open", on: "deck", grant: "start", fields: { opener: { type: "member", required: true } }, effects: [{ party: { slot: "owner", from: { field: "opener" } } }] }),
    add: act({ step: "open", on: "card", grant: "write", fields: { text: { ...text, required: false } }, effects: [owner, { value: { slot: "text", from: { field: "text" } } }] }),
    // A card that copies from its parent: a slot of another subject, into a party, a reference and two values. Its team is its own helper,
    // which an earlier effect of the same entry set.
    child: act({
      step: "open", on: "card", grant: "write", ...parent,
      effects: [
        owner, { party: { slot: "helper", from: { slot: "owner", of: "also.parent" } } }, { ref: { slot: "parent", from: { item: "also.parent" } } },
        { value: { slot: "text", from: { slot: "text", of: "also.parent" } } }, { value: { slot: "size", from: { slot: "size", of: "also.parent" } } },
        { party: { slot: "team", from: [{ slot: "helper", of: "on" }] } },
      ],
    }),
    // The size is emptied when `clear` is true, and is otherwise set from the field: an `if` and an `unless` with the same guards.
    edit: change({
      fields: { text: { ...text, required: false }, size: { ...size, required: false }, clear: { type: "bool", required: false } },
      effects: [{ value: { slot: "text", from: { field: "text" } } }, { value: { slot: "size", from: null }, if: cleared }, { value: { slot: "size", from: { field: "size" } }, unless: cleared }],
    }),
    // The second effect's condition reads the state that the first effect changes.
    finish: change({ guards: [{ state: ["draft"] }], effects: [{ state: "done" }, { value: { slot: "text", from: { const: "finished" } }, if: [{ state: ["draft"] }] }] }),
    // On the deck, with an effect on another card, which may be final.
    touch: act({
      step: "transition", on: "deck", grant: "write", also: { other: { item: "card", by: "other" } }, fields: { other: { type: "item", of: "card", required: true }, text: { ...text, required: false } },
      effects: [{ of: "also.other", value: { slot: "text", from: { field: "text" } } }],
    }),
    staff: change({ fields: { team: { type: "list", of: { type: "member" }, max: 3, required: true } }, effects: [{ party: { slot: "team", from: { field: "team" } } }] }),
    pair: change({ effects: [{ party: { slot: "team", from: [{ signer: true }, { slot: "helper" }, { slot: "owner" }] } }] }),
    // Each source is a part of the entry that `proof` names. The definition states no type for it, so the commit checks each value.
    borrow: change({
      fields: { proof: { ...fact("add", "staff"), required: true } },
      effects: [
        { value: { slot: "text", from: { field: "proof", part: { field: "text" } } } }, { party: { slot: "helper", from: { field: "proof", part: { opened: "owner" } } } },
        { party: { slot: "team", from: { field: "proof", part: { field: "team" } } } },
      ],
    }),
    misread: change({ fields: { proof: { ...fact("add"), required: true } }, effects: [{ value: { slot: "size", from: { field: "proof", part: { field: "text" } } } }] }),
    // A position is an integer, and no text states its most. The slot holds 0 to 9.
    rank: change({ fields: { proof: { ...fact("add"), required: true } }, effects: [{ value: { slot: "size", from: { field: "proof", part: "seq" } } }] }),
    sum: act({
      step: "open", on: "summary", grant: "write", ...parent, fields: { ...parent.fields, earlier: { type: "list", of: fact("sum"), max: 4, required: false }, staffed: { ...fact("staff"), required: false } },
      effects: [owner, { ref: { slot: "of", from: { item: "also.parent" } } }, {
        attribute: {
          slot: "authors", of: "also.parent", with: [
            { items: { type: "card", states: ["done"], where: [{ equals: { a: { slot: "parent" }, b: { item: "also.parent" } } }] }, slot: "team" },
            { subject: "also.parent", slot: "team" },
            { each: { field: "earlier" }, as: "e", list: { element: "e", part: { opened: "authors" } } },
            { list: { field: "staffed", part: { field: "team" } } },
          ],
        },
      }],
    }),
  },
  receives: {}, timed: {}, rules: {},
};
const definition = valid(validateDefinition(cards, PROPOSED_BOUNDS));

const names = (list: unknown) => (list as readonly MemberRef[]).map((m) => m.member);
/** An act on a card, and an act that names its parent card. */
const at = (s: Scope, card: number, f: Record<string, FieldValue> = {}): Over => ({ ...on(s, card), ...fields(f) });
const under = (s: Scope, card: number, f: Record<string, FieldValue> = {}): Over => ({ fields: { parent: card, ...f }, expected: { parent: s.item(card).revision } });
const listed = (item: number, change: "add" | "remove", who: Actor) => ({ effect: "list", item, slot: "team", change, member: who.member });
/** The effects of the entry that a judgment wrote, or the judgment when nothing was written. */
const written = (s: Scope, j: ActJudgment) => (j.result === "write" ? s.last.effects : j);

describe("effects: sources, conditions and what is not applied (section 6.6)", () => {
  test("an effect is applied when its source is present and its condition lets it through: a slot of another subject is copied, an absent source changes nothing, and `null` empties a slot", () => {
    const s = new Scope(definition);
    const p = s.did(una, "add", fields({ text: "p" })).seq;
    // The parent's owner, its ID and its text are copied. The parent has no size, so that effect is not applied, and records nothing.
    // The last source reads the new card as the effects before it left it: its helper is set by then.
    const child = s.did(rita, "child", under(s, p));
    const c = child.seq;
    expect(child.effects).toEqual([
      { effect: "open", item: c, type: "card", state: "draft" }, { effect: "party", item: c, slot: "owner", member: rita.member },
      { effect: "party", item: c, slot: "helper", member: una.member }, { effect: "ref", item: c, slot: "parent", to: p }, { effect: "value", item: c, slot: "text", value: "p" },
      listed(c, "add", una),
    ]);

    const edit = (f: Record<string, FieldValue>) => written(s, s.act(rita, "edit", at(s, p, f)));
    expect(edit({ size: 3 })).toEqual([{ effect: "value", item: p, slot: "size", value: 3 }]);
    // No field is given: each source is absent. Before, such an effect emptied its slot.
    expect([edit({}), s.item(p).values]).toEqual([[], { text: "p", size: 3, tags: null }]);
    // `clear` is true: the `if` applies and the `unless` with the same guards does not, though its source is present.
    expect(edit({ clear: true, size: 5 })).toEqual([{ effect: "value", item: p, slot: "size", value: null }]);
    expect(edit({ clear: false, size: 5 })).toEqual([{ effect: "value", item: p, slot: "size", value: 5 }]);

    // A condition is judged on the state before the entry's effects: the card was a draft, so the text is set in the entry that finishes it.
    expect(s.did(rita, "finish", at(s, c)).effects).toEqual([{ effect: "state", item: c, state: "done" }, { effect: "value", item: c, slot: "text", value: "finished" }]);
    // The card is now final. An effect on it that is not applied is not judged, and one that is applied refuses the input.
    const touch = (f: Record<string, FieldValue>) => s.judge(s.intent(rita, "touch", { ...on(s, 0, { other: c }), ...fields({ other: c, ...f }) }));
    expect([touch({}).result, touch({ text: "late" })]).toMatchObject(["write", { result: "refused", reason: "final" }]);
    expect(s.replay().snapshot()).toBe(s.state.snapshot());
  });

  test("a party list is set whole from a list field, from a list of operands and from a part: one record for each member that leaves and then for each that joins, in byte order of member identifier", () => {
    const s = new Scope(definition);
    const p = s.did(una, "add", fields({ text: "p" })).seq;
    const staff = (...team: Actor[]) => written(s, s.act(rita, "staff", at(s, p, { team: team.map((a) => a.member) })));
    expect(staff(vic, una)).toEqual([listed(p, "add", una), listed(p, "add", vic)]);
    const first = s.head.seq;
    expect(staff(sam, una)).toEqual([listed(p, "remove", vic), listed(p, "add", sam)]);
    // The same set, written with a member twice: nothing changes, and nothing is recorded.
    expect(staff(una, sam, una)).toEqual([]);
    expect(staff(paul)).toEqual([listed(p, "remove", sam), listed(p, "remove", una), listed(p, "add", paul)]);

    // The signer, the helper and the owner. The parent has no helper, which gives no member, and its signer is its owner: one member.
    expect(written(s, s.act(una, "pair", at(s, p)))).toEqual([listed(p, "remove", paul), listed(p, "add", una)]);
    // The child's team holds una already. The signer and the owner join it.
    const c = s.did(vic, "child", under(s, p)).seq;
    expect([written(s, s.act(rita, "pair", at(s, c))), names(s.item(c).parties["team"])]).toEqual([[listed(c, "add", rita), listed(c, "add", vic)], ["@una", "@rita", "@vic"]]);

    // Parts of an entry of this scope. The `add` entry has a text and opened an owner; it has no field `team`, so that effect is not applied.
    const b = s.did(rita, "add").seq;
    const borrow = (seq: number, bounds: Bounds = PROPOSED_BOUNDS) => s.act(rita, "borrow", at(s, b, { proof: s.fact(seq) }), { bounds });
    expect([borrow(p).result, s.last.effects]).toEqual(["write", [{ effect: "value", item: b, slot: "text", value: "p" }, { effect: "party", item: b, slot: "helper", member: una.member }]]);
    // The first `staff` entry has a list of two members in its field. A list that can hold one refuses it: nothing is cut short.
    expect(borrow(first, { ...PROPOSED_BOUNDS, partyMembers: 1 })).toMatchObject({ result: "refused", reason: "slot-full" });
    expect([borrow(first).result, s.last.effects]).toEqual(["write", [listed(b, "add", una), listed(b, "add", vic)]]);
    // A text is not a value of a slot that holds a size. The commit checks it, because the validator could not.
    expect(s.judge(s.intent(rita, "misread", at(s, b, { proof: s.fact(p) })))).toMatchObject({ result: "refused", reason: "bad-field" });
    // A position goes in an integer slot of any range. The commit checks the value: entry 2 is within the slot's range, and this one is not.
    const rank = (seq: number) => s.judge(s.intent(rita, "rank", at(s, b, { proof: s.fact(seq) })));
    expect([p, b > 9, rank(p).result, rank(b)]).toMatchObject([2, true, "write", { result: "refused", reason: "bad-field" }]);
    expect(s.replay().snapshot()).toBe(s.state.snapshot());
  });
});

interface Given { given?: Record<string, FieldValue>; opens?: string; bounds?: Bounds; attention?: Notify[] }
/** What a judge gives the forms of that act on the scope as it stands, with those subjects bound and rita as the signer. */
const judging = (s: Scope, kind: string, bound: Record<string, number>, more: Given = {}): Judging => ({
  view: s.state, definition: s.definition, bounds: more.bounds ?? PROPOSED_BOUNDS, clock: clockOf(s.state, s.now), scope: s.state.scope()!, self: s.head.seq + 1, kind,
  fields: more.given ?? {}, fieldTypes: s.definition.declared.acts[kind]!.fields, subjects: new Map(Object.entries(bound).map(([name, id]) => [name, s.item(id)])),
  signer: { member: rita.member, principal: null }, facts: new Map(), prepared: [], used: [], own: s.own,
});
/** What those effects derive there. Nothing is written. */
const derived = (s: Scope, kind: string, forms: readonly EffectForm[], bound: Record<string, number>, more: Given = {}) => deriveEffects(judging(s, kind, bound, more), forms, more.attention ?? [], more.opens ?? null);

describe("attribution: its sources and its order (section 6.7)", () => {
  /**
   * Card p is una's, who acts for paul, and its team is sam and una. Card c
   * is a finished child of p, with wes in its team. Card q is vic's, who
   * acts for quinn. Entry `staffed` gave q's team zed.
   */
  function deck() {
    const s = new Scope(definition);
    const p = s.did(una, "add").seq;
    s.did(rita, "staff", at(s, p, { team: [sam.member, una.member] }));
    const c = s.did(rita, "child", under(s, p)).seq;
    s.did(rita, "staff", at(s, c, { team: [member("wes")] }));
    s.did(rita, "finish", at(s, c));
    const q = s.did(vic, "add").seq;
    const staffed = s.did(rita, "staff", at(s, q, { team: [member("zed")] })).seq;
    return { s, p, q, staffed };
  }

  test("the list is the union of the subject's attribution and every source, each member once, in byte order of member identifier; a longer list than the slot holds is refused", () => {
    const { s, p, q, staffed } = deck();
    // Of q. Base: its owner vic, vic's principal quinn, and the signer, who is vic. The subject's own team: zed. No field is given, so the last two sources read nothing.
    const earlier = s.did(vic, "sum", under(s, q));
    expect(names(s.item(earlier.seq).parties["authors"])).toEqual(["@quinn", "@vic", "@zed"]);

    // Of p. Base: una, paul, and the signer rita. The finished child's team: wes. The subject's own team: sam, and una again.
    // The authors that the earlier summary opened: quinn, vic and zed. The team in the `staffed` entry's field: zed again.
    const given = under(s, p, { earlier: [s.fact(earlier.seq)], staffed: s.fact(staffed) });
    expect(s.act(rita, "sum", given, { bounds: { ...PROPOSED_BOUNDS, partyMembers: 7 } })).toMatchObject({ result: "refused", reason: "slot-full" });
    const sum = s.did(rita, "sum", given);
    const all = ["@paul", "@quinn", "@rita", "@sam", "@una", "@vic", "@wes", "@zed"];
    expect([names(s.item(sum.seq).parties["authors"]), names(sum.effects.slice(3).map((e) => "member" in e && e.member))]).toEqual([all, all]);
    expect(s.replay().snapshot()).toBe(s.state.snapshot());
  });

  test("an input is not judged on a condition or a range that is not completed; an effect on an unbound subject is not applied, so an opening whose attribution names one leaves its required list unset", () => {
    const { s, p, q } = deck();
    const sum = cards.acts["sum"]!.effects;
    const stopped = { ...PROPOSED_BOUNDS, guardScan: 0 };
    const some: Guard = { some: { type: "card", states: ["done"], where: [{ equals: { a: { slot: "parent" }, b: { item: "also.parent" } } }] } };
    const set: EffectForm = { value: { slot: "text", from: { const: "x" } } };
    const notice: Notify = { notify: { slot: "owner", of: "on", when: "after", reason: "told" } };
    expect([
      // The range of the first source is not read whole. It is an exact set, so the input is not judged.
      derived(s, "sum", sum, { "also.parent": p }, { opens: "summary", bounds: stopped }),
      // A condition that is not completed, on an effect and on a notice. With every page read, the guard holds, and both are made.
      derived(s, "sum", [{ ...set, of: "also.parent", if: [some] }], { "also.parent": p }, { bounds: stopped }),
      derived(s, "sum", [], { on: p, "also.parent": p }, { bounds: stopped, attention: [{ notify: { ...notice.notify, if: [some] } }] }),
      derived(s, "sum", [{ ...set, of: "also.parent", if: [some] }], { on: p, "also.parent": p }, { attention: [{ notify: { ...notice.notify, if: [some] } }] }),
      // A condition that fails makes no notice.
      derived(s, "sum", [], { on: p, "also.parent": p }, { attention: [{ notify: { ...notice.notify, if: [{ unset: "owner" }] } }] }),
      // No subject is bound to `also.parent`: an effect on it is not applied. Nor is an attribution of it, which has no base, and the list is required.
      derived(s, "sum", [{ ...set, of: "also.parent" }], {}),
      derived(s, "sum", sum, {}, { opens: "summary" }),
    ]).toMatchObject([
      { ok: false, unavailable: "guard-incomplete" }, { ok: false, unavailable: "guard-incomplete" }, { ok: false, unavailable: "guard-incomplete" },
      { ok: true, effects: [{ effect: "value", item: p, slot: "text", value: "x" }, { effect: "attention", item: p, members: [una.member], reason: "told" }] },
      { ok: true, effects: [] }, { ok: true, effects: [] }, { ok: false, reason: "required-unset", detail: "authors" },
    ]);
    // The judge answers that the act is not judged. It is no refusal, and nothing is written.
    expect(s.act(rita, "sum", under(s, p), { bounds: stopped })).toEqual({ result: "unavailable", reason: "guard-incomplete" });

    // A source that reads no member, or no list of members, refuses the input: a further source of an attribution, and the source of a
    // party slot. The validator cannot know what a constant, the scope's own reference or a field with no declared type holds.
    const sourced = (source: object) => derived(s, "sum", [{ attribute: { slot: "authors", of: "also.parent", with: [source as never] } }], { "also.parent": p }, { opens: "summary" });
    const party = (to: string, from: object, given: Record<string, FieldValue> = {}) => derived(s, "pair", [{ party: { slot: to, from: from as never } }], { on: p }, { given });
    expect([
      ...[{ list: { const: "sam" } }, { list: { const: [7] } }, { each: { const: "sam" }, as: "e", list: { element: "e" } }].map((w) => sourced(w)),
      party("team", { scope: true }), party("team", { field: "sent" }, { sent: [7] }), party("helper", { field: "sent" }, { sent: "sam" }),
    ]).toMatchObject(Array(6).fill({ ok: false, reason: "bad-field" }));

    // A value that the definition gives no type, as a field of a message has none, is checked against the slot when it is copied. A
    // card is named by its ID, or by the fact of the entry that opened it, with that entry's hash; the deck is no card, and 99 is no item. A list is within its bound.
    const copy = (to: "ref" | "value", name: string, sent: FieldValue) => {
      const r = derived(s, "pair", [{ [to]: { slot: name, from: { field: "sent" } } } as never], { on: p }, { given: { sent } });
      return r.ok ? r.effects.map((e) => ("to" in e ? e.to : "value" in e ? e.value : e)) : "reason" in r ? r.reason : r.unavailable;
    };
    const forged = { ...s.fact(q), hash: s.fact(0).hash };
    expect([copy("ref", "parent", q), copy("ref", "parent", s.fact(q)), copy("ref", "parent", forged), copy("ref", "parent", 0), copy("ref", "parent", 99)]).toEqual([[q], [q], "bad-field", "bad-field", "bad-field"]);
    expect([copy("value", "tags", ["a", "b"]), copy("value", "tags", ["a", "b", "c"]), copy("value", "tags", ["a", 7])]).toEqual([[["a", "b"]], "bad-field", "bad-field"]);

    // The guards of one written list: the first is not completed and the second is false, so the list is false, by its second guard.
    expect(judgeGuards(judging(s, "sum", { on: p, "also.parent": p }, { bounds: stopped }), [some, { unset: "owner" }])).toEqual({ result: "fail", at: 1 });
  });
});

describe("effects in a handler and in a result clause (sections 6.6 and 7.4)", () => {
  test("a handler copies the source entry into a fact slot only when that entry is of a kind and a definition the slot states", () => {
    const audited = (kind: string, under: string) => variant(desk, (d) => {
      d.items.repo.refs.asked = { fixed: false, required: false, to: { type: "fact", kind: [kind], under } };
      d.receives.audit = { message: "audit", class: "tell", from: { kind: "lane" }, fields: { repo: { type: "item", of: "repo", required: true } }, opens: null, also: { repo: { item: "repo", by: "repo" } }, guards: [], effects: [{ of: "also.repo", ref: { slot: "asked", from: { source: "ref" } } }], sends: [], attention: [] };
    });
    const D = founded();
    const X = new Scope(ticketDefinition);
    X.did(una, "ask", fields({ desk: D.at }));   // X.2: an `ask` act of a ticket
    const tell: Send = { n: 0, to: D.at, message: { class: "request", type: "tell", body: { message: "audit", fields: { repo: 0 } } } };
    const source = forged(X.at, 2, X.entries[2]!.entry.input, [tell]);
    const arrival = { ...tell, from: factRefOf(source.entry) };
    const decided = (kind: string, under = "ticket") => {
      const j = judgeDelivery(D.state, audited(kind, under), arrival, arriving(D, arrival, source));
      return j.result === "write" && j.draft.input.type === "delivery" && "decision" in j.draft.input ? [j.draft.input.decision, j.draft.input.reason?.code, j.draft.effects] : j.result;
    };
    const refused = ["refused", "bad-field", []];
    expect([decided("ask"), decided("file"), decided("ask", "desk")]).toEqual([["applied", undefined, [{ effect: "ref", item: 0, slot: "asked", to: arrival.from }]], refused, refused]);
  });

  test("a clause's condition is judged when the result is recorded, and reads the name of the result's reason", () => {
    const refusing = variant(ticket, (d) => {
      d.acts.link.fields.why = { type: "int", min: 0, max: 9, required: true };
      d.acts.link.sends[0].relate.detail.why = { field: "why" };
      const set = { some: { type: "link", states: ["set"], where: [{ equals: { a: { slot: "me" }, b: { item: "on" } } }] } };
      d.acts.link.sends[0].relate.result = { refused: [{ state: "removed", if: [{ equals: { a: { result: "reason" }, b: { const: "one" } } }, set] }] };
      d.receives.closes.fields.why = { type: "int", min: 0, max: 9, required: true };
      d.receives.closes.guards = [{ differs: { a: { field: "why" }, b: { const: 1 } }, reason: "one" }, { differs: { a: { field: "why" }, b: { const: 2 } }, reason: "two" }];
    });
    const P = new Scope(refusing);
    const I = new Scope(refusing, rita.member, true, 1);
    const recorded = (why: number) => {
      const link = P.did(rita, "link", fields({ target: I.at, about: 0, why })).seq;
      deliver(I, P, link);            // the receiver refuses, with the name its guard declares
      deliver(P, I, I.head.seq);      // the sender records the result, and runs its `refused` clause
      return [(P.last.input as { message: { reason?: { name?: string } } }).message.reason?.name, P.last.effects, P.item(link).state];
    };
    expect([recorded(1), recorded(2)]).toEqual([["one", [{ effect: "state", item: 2, state: "removed" }], "removed"], ["two", [], "set"]]);

    // A condition that is not completed leaves the result not recorded. It is offered again, and is recorded when the range is read whole.
    deliver(I, P, P.did(rita, "link", fields({ target: I.at, about: 0, why: 1 })).seq);
    P.bounds = { ...PROPOSED_BOUNDS, guardScan: 0 };
    expect(deliver(P, I, I.head.seq)).toEqual({ result: "unavailable", reason: "guard-incomplete" });
    P.bounds = PROPOSED_BOUNDS;
    expect([deliver(P, I, I.head.seq).result, P.last.effects.length]).toEqual(["write", 1]);
  });
});

describe("the validator: effect forms (section 6.6)", () => {
  test("it takes a pair of effects on one slot only when their conditions exclude each other, or both change one list; and it refuses a source the slot cannot hold", () => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const refusal = (change: (d: any) => void, base: DeclaredDefinition = cards) => {
      const d = structuredClone(base);
      change(d);
      const result = validateDefinition(d, PROPOSED_BOUNDS);
      return result.ok ? null : [...new Set(result.problems.map((p) => p.code))];
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */
    const edit = (...effects: unknown[]) => refusal((d) => { d.acts.edit.effects = effects; });
    const say = (said: string, condition: object = {}) => ({ value: { slot: "text", from: { const: said } }, ...condition });
    const sized = (n: number): Guard => ({ equals: { a: { field: "size" }, b: { const: n } } });
    const team = (from: unknown, list?: string) => ({ party: { slot: "team", from, ...(list ? { list } : {}) } });
    const who = { field: "who" };
    const staffing = (...effects: unknown[]) => refusal((d) => { d.acts.staff.fields.who = { type: "member", required: false }; d.acts.staff.effects = effects; });
    const timed = (...effects: unknown[]) => refusal((d) => {
      d.items.card.values.due = { fixed: false, required: false, of: { type: "time" } };
      d.timed.expire = { on: "card", states: ["draft"], deadline: "due", effects: [{ state: "done" }, ...effects], attention: [] };
    });
    const attributed = (source: unknown) => refusal((d) => { d.acts.sum.effects[2].attribute.with = [source]; });
    const rows: [string, ProblemCode[] | null, ProblemCode | null][] = [
      // Conditions that exclude each other.
      ["two effects on one slot, one under a condition", edit(say("a"), say("b", { if: cleared })), "conflict"],
      ["an `if` and an `unless` with the same guards", edit(say("a", { if: cleared }), say("b", { unless: cleared })), null],
      ["an `if` and an `unless` with other guards", edit(say("a", { if: cleared }), say("b", { unless: [sized(1)] })), "conflict"],
      ["two `if` lists with an `equals` of one operand and two constants", edit(say("a", { if: [sized(1)] }), say("b", { if: [{ state: ["draft"] }, sized(2)] })), null],
      ["the same with one constant", edit(say("a", { if: [sized(1)] }), say("b", { if: [sized(1)] })), "conflict"],
      ["the same with `ifPresent`, which lets both hold", edit(say("a", { if: [{ ...sized(1), ifPresent: true }] }), say("b", { if: [{ ...sized(2), ifPresent: true }] })), "conflict"],
      ["two `if` lists with `state` guards that share no state", edit(say("a", { if: [{ state: ["draft"] }] }), say("b", { if: [{ state: ["done"] }] })), null],
      ["the same with a shared state", edit(say("a", { if: [{ state: ["draft"] }] }), say("b", { if: [{ state: ["draft", "done"] }] })), "conflict"],
      // Successive changes of one party list.
      ["an `add` and a `remove` on one party list", staffing(team(who, "add"), team({ signer: true }, "remove")), null],
      ["a list set whole beside an `add`", staffing(team({ field: "team" }), team(who, "add")), "conflict"],
      // A state effect needs a live subject.
      ["a state effect whose live-state guard is in its own `if`", edit({ state: "done", if: [{ state: ["draft"] }] }), null],
      ["a state effect whose live-state guard is in its `unless`", edit({ state: "done", unless: [{ state: ["draft"] }] }), "final"],
      // Conditions are guards of the entry.
      ["a condition that reads the item its act opens", refusal((d) => { d.acts.add.effects[1].if = [{ unset: "text" }]; }), "nascent-guard"],
      ["a clause's condition reads the item its act opened, and the result", refusal((d) => { d.acts.ask.sends[0].tell.result.applied = [{ state: "answered", if: [{ state: ["asked"] }, { differs: { a: { result: "reason" }, b: { const: "late" } } }] }]; }, ticket), null],
      ["a condition on an effect of a timed rule", timed(say("late", { if: [{ unset: "size" }] })), "timed-partial"],
      ["a party list set whole by a timed rule", timed(team([{ slot: "owner" }])), "timed-partial"],
      ["a source of a timed rule whose type only the commit knows", timed({ value: { slot: "text", from: { scope: true } } }), "timed-partial"],
      ["a timed rule that copies one slot of its item into another, and empties a third", timed({ party: { slot: "helper", from: { slot: "owner" } } }, { value: { slot: "text", from: null } }), null],
      // Sources.
      ["an opening whose only effect on a required slot empties it", refusal((d) => { d.acts.found.effects[0].value.from = null; }, desk), "required-unset"],
      ["a source that is none", edit({ value: { slot: "text", from: { none: true } } }), "shape"],
      ["a constant that is not a value of the slot", edit({ value: { slot: "size", from: { const: "big" } } }), "shape"],
      ["a position into a slot that is no integer", refusal((d) => { d.acts.rank.effects[0].value.slot = "text"; }), "name"],
      ["a source of another type: the signer into a text", edit({ value: { slot: "text", from: { signer: true } } }), "name"],
      ["the first delivery's form of a member from a fetched fact", refusal((d) => { d.acts.borrow.effects[1].party.from = { fact: "proof", field: "owner" }; }), "shape"],
      ["a list of operands into a slot that holds one member", staffing({ party: { slot: "helper", from: [who] } }), "shape"],
      ["more operands than the list can hold", staffing(team([who, who, who, who])), "bound"],
      ["an `add` of a list of operands", staffing(team([who], "add")), "shape"],
      ["a list set whole from a list that can hold more", refusal((d) => { d.acts.staff.fields.team.max = 4; }), "bound"],
      ["one member into a list slot, with no `add`", staffing(team(who)), "name"],
      // Further sources of an attribution.
      ["a further source that is no form", attributed({ members: { field: "earlier" } }), "shape"],
      ["a further source from a slot that is no party slot", attributed({ subject: "also.parent", slot: "text" }), "name"],
      ["a further source over each element of a value that is no list", attributed({ each: { field: "staffed" }, as: "e", list: { element: "e" } }), "name"],
      ["a further source whose list holds no members", attributed({ list: { field: "earlier" } }), "name"],
    ];
    expect(rows.filter(([, found, code]) => (code === null ? found !== null : found?.length !== 1 || found[0] !== code)).map(([name, found]) => [name, found])).toEqual([]);
  });
});
