import { describe, expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { ActType, DeclaredDefinition, Input, Request, Result, ScopeRef, Seed } from "@generalbusiness/artroom-contract";
import { intentDigest } from "@generalbusiness/artroom-bytes";
import { validateDefinition, type ProblemCode } from "../src/index.ts";
import { Scope, arrive, born, decided, deliver, desk, directory, fields, founded, keys, on, ticketDefinition, valid, variant } from "./fixtures.ts";

const { rita, una } = keys;

/**
 * A pull request lane, made up for these tests. It links issues, may name a
 * lane that staged its work, and merges. `merge` tells the staging lane what
 * it merges, when there is one, and tells a peer. It may name one link, and
 * then tells that link's issue. The handler `published`
 * tells each linked issue, by one fan-out; then the staging lane, when there
 * is one; and sends an index row.
 */
const text = { type: "text", max: 100 } as const;
const slot = { fixed: false, required: false } as const;
const lane = { type: "scope", kind: "lane" } as const;
const staged = [{ of: "also.proposal", set: "staging" }] as const;
const act = (a: Partial<ActType> & Pick<ActType, "step" | "on" | "grant">): ActType => ({ also: {}, fields: {}, guards: [], effects: [], sends: [], attention: [], ...a });
const pull: DeclaredDefinition = {
  format: "artroom-definition-1", name: "pull", profile: { name: "restricted", version: 1 }, capabilities: [], genesis: "open",
  items: {
    proposal: {
      many: false, max: 1, states: { open: { final: false } }, initial: "open",
      parties: { author: { fixed: true, required: true, list: false, author: false }, watchers: { ...slot, list: true, max: 2, author: false } },
      refs: { staging: { ...slot, to: lane }, closed: { ...slot, to: { type: "item", of: "link" } } }, values: {},
    },
    link: {
      many: true, max: 3, states: { set: { final: false }, removed: { final: true } }, initial: "set", parties: {},
      refs: { issue: { fixed: true, required: true, to: lane }, madeAt: { fixed: true, required: true, to: { type: "fact", kind: ["link"], under: "pull" } } }, values: { how: { ...slot, of: text } },
    },
    merge: { many: true, max: 4, states: { intended: { final: false }, done: { final: true }, refused: { final: true } }, initial: "intended", parties: {}, refs: { peer: { ...slot, to: lane } }, values: {} },
  },
  acts: {
    open: act({ step: "open", on: "proposal", grant: "open", fields: { opener: { type: "member", required: true } }, effects: [{ party: { slot: "author", from: { field: "opener" } } }] }),
    stage: act({
      step: "transition", on: "proposal", grant: "write", fields: { staging: { ...lane, required: true }, watcher: { type: "member", required: true } }, guards: [{ state: ["open"] }],
      effects: [{ ref: { slot: "staging", from: { field: "staging" } } }, { party: { slot: "watchers", from: { field: "watcher" }, list: "add" } }],
    }),
    link: act({
      step: "open", on: "link", grant: "write", fields: { issue: { ...lane, required: true }, how: { ...text, required: false } },
      effects: [{ ref: { slot: "issue", from: { field: "issue" } } }, { ref: { slot: "madeAt", from: "self" } }, { value: { slot: "how", from: { field: "how" } } }],
    }),
    merge: act({
      step: "open", on: "merge", grant: "merge", also: { proposal: { item: "proposal", one: true }, link: { item: "link", by: "link" } },
      fields: { peer: { ...lane, required: false }, link: { type: "item", of: "link", required: false } }, effects: [{ ref: { slot: "peer", from: { field: "peer" } } }],
      sends: [
        {
          tell: {
            to: { slot: "staging", of: "also.proposal" }, message: "reserve", if: staged,
            fields: {
              operation: "self", by: { signer: true }, lane: { scope: true }, intent: { intent: true }, why: { const: "ready" }, proposal: { item: "also.proposal" }, author: { slot: "author", of: "also.proposal" },
              links: { collect: { items: { type: "link", states: ["set"], where: [{ differs: { a: { slot: "how" }, b: { const: "manual" } } }] }, fields: { link: "item", state: "state", issue: "issue", how: "how" } } },
            },
            result: { refused: [{ state: "refused" }] },
          },
        },
        // Addressed by a slot of the item this entry opens, which its own effect sets.
        { tell: { to: { slot: "peer" }, message: "note", fields: {}, result: { applied: [{ state: "done" }] } } },
        // The address of the first reads the link that the act may name, and so does the condition of the second.
        { relate: { to: { slot: "issue", of: "also.link" }, name: "blocks", item: { item: "also.link" }, state: "set", detail: {}, result: {} } },
        { tell: { to: { slot: "peer" }, message: "unexplained", if: [{ equals: { a: { slot: "how", of: "also.link" }, b: { none: true } } }], fields: {}, result: {} } },
      ],
      // The watchers are told only of a merge that names a link which states how it was made.
      attention: [{ notify: { slot: "watchers", of: "also.proposal", when: "after", reason: "merging", if: [{ differs: { a: { slot: "how", of: "also.link" }, b: { none: true } } }] } }],
    }),
  },
  receives: {
    published: {
      message: "published", class: "tell", from: { kind: "lane" }, opens: null, fields: { outcome: { type: "enum", of: ["published", "refused"], required: true }, commit: { ...text, required: false } },
      also: { proposal: { item: "proposal", one: true } }, guards: [], effects: [],
      attention: [{ notify: { slot: "watchers", of: "also.proposal", when: "after", reason: "published", if: [{ equals: { a: { field: "outcome" }, b: { const: "published" } } }] } }],
      sends: [
        {
          relate: {
            each: { type: "link", states: ["set"] }, to: { slot: "issue", of: "each" }, name: "closes", item: { item: "each" }, state: "merged", if: [{ equals: { a: { field: "outcome" }, b: { const: "published" } } }],
            detail: { commit: { field: "commit" }, how: { slot: "how", of: "each" }, from: { sender: true }, by: { source: "ref" }, made: { slot: "madeAt", of: "each" }, seq: { slot: "madeAt", of: "each", part: "seq" } },
            // The clause of one send of the fan-out reads the item of that send.
            result: { applied: [{ of: "also.proposal", ref: { slot: "closed", from: { item: "each" } } }] },
          },
        },
        { tell: { to: { slot: "staging", of: "also.proposal" }, message: "unpin", if: staged, fields: { because: { const: "published" } }, result: {} } },
        { index: { fields: { merge: { field: "outcome" } } } },
      ],
    },
  },
  timed: {}, rules: {},
};
/** The fan-out is at its limit here: the type takes three live links, and one fan-out makes at most three sends. */
const tight = { ...PROPOSED_BOUNDS, fanOut: 3 };
const pullDefinition = valid(validateDefinition(pull, tight));

/** A lane that is only an address: an issue, a staging lane, a peer. */
const address = (n: number): ScopeRef => new Scope(ticketDefinition, rita.member, true, n).at;
/** Each send of an entry: its ordinal, what kind of message it is, and the scope it goes to. */
const sent = (s: Scope) => s.last.sends.map((send) => [send.n, send.message.class === "request" ? (send.message.body as { message?: string; name?: string }).message ?? (send.message.body as { name?: string }).name : send.message.class, (send.to as ScopeRef).scope]);
const published = (P: Scope, X: Scope, outcome = "published") => arrive(P, X, { class: "request", type: "tell", body: { message: "published", fields: { outcome, commit: "c1" } } });
/** The result of send `n` of entry `seq` of P, from an entry of the scope it was sent to, which decided it. */
function answer(P: Scope, from: Scope, seq: number, n: number, outcome: "applied" | "refused") {
  const request = { from: P.fact(seq), n };
  const result: Result = { class: "result", of: request, outcome };
  return arrive(P, from, result, { type: "delivery", ...request, message: P.entries[seq]!.entry.sends.find((s) => s.n === n)!.message as Request, decision: outcome }).result;
}
const told = (s: Scope) => s.last.effects.filter((e) => e.effect === "attention");

describe("sends (section 6.6)", () => {
  test("a fan-out at its limit makes one send for each item, in order of item ID, before the sends written after it; a send that is not made takes no ordinal (witness 18.6, at a configured limit)", () => {
    const [X, issue] = [9, 1].map((n) => new Scope(ticketDefinition, rita.member, true, n)) as [Scope, Scope];
    const [A, B, C, S] = [issue.at, ...[2, 3, 4].map(address)] as [ScopeRef, ScopeRef, ScopeRef, ScopeRef];
    const P = new Scope(pullDefinition);
    const links = [C, A, B].map((to, i) => P.did(rita, "link", fields(i === 0 ? { issue: to, how: "keyword" } : { issue: to })).seq);
    // No lane staged this work, so the `unpin` is not made: the index row takes the next ordinal, and the result the one after.
    published(P, X);
    expect(sent(P)).toEqual([[0, "closes", C.scope], [1, "closes", A.scope], [2, "closes", B.scope], [3, "advisory", directory.scope], [4, "result", X.at.scope]]);
    // Each send names its own item and reads its own slots. An empty slot is left out. A local entry reference is sent as that entry's
    // fact, and its position as a number. A handler reads its sender and its source entry.
    const source = P.last.input as Extract<Input, { type: "delivery" }>;
    const sealed = P.last.seq;
    const [first, second] = [links[0]!, links[1]!];
    expect(P.last.sends.slice(0, 2).map((s) => s.message.class === "request" && s.message.body)).toEqual([
      { name: "closes", item: P.fact(first), state: "merged", detail: { commit: "c1", how: "keyword", from: X.at, by: source.from, made: P.fact(first), seq: first } },
      { name: "closes", item: P.fact(second), state: "merged", detail: { commit: "c1", from: X.at, by: source.from, made: P.fact(second), seq: second } },
    ]);
    // The second send of the fan-out went to A. Its result is recorded: the request at that ordinal is found again as the fan-out's.
    // Its clause reads `each`, which is the second link, and no other item of the range.
    expect([answer(P, issue, sealed, 1, "applied"), P.item(0).refs["closed"]]).toEqual(["write", second]);
    // With the work staged, the `unpin` is made after the three updates, at ordinal 3.
    P.did(rita, "stage", { ...on(P, 0), ...fields({ staging: S, watcher: una.member }) });
    published(P, X);
    expect([sent(P).slice(3), told(P)]).toEqual([[[3, "unpin", S.scope], [4, "advisory", directory.scope], [5, "result", X.at.scope]], [{ effect: "attention", item: 0, members: [una.member], reason: "published" }]]);
    // The condition of the fan-out is false: no update is sent. The notice has the same condition, and nobody is told.
    published(P, X, "refused");
    expect([sent(P).map(([, kind]) => kind), told(P)]).toEqual([["unpin", "advisory", "result"], []]);

    // Each send of a fan-out has its own key. Two links to one issue, sent for one item, are one key: the delivery is refused, and sends its result alone.
    const same = new Scope(valid(validateDefinition({ ...pull, receives: { published: { ...pull.receives["published"]!, sends: [{ relate: { ...(pull.receives["published"]!.sends[0] as { relate: object }).relate, item: { item: "also.proposal" }, result: {} } }] } } }, tight)));
    for (const issue of [A, A]) same.did(rita, "link", fields({ issue }));
    published(same, X);
    expect([decided(same), same.last.sends.length]).toEqual([["refused", "duplicate-relation"], 1]);
  });

  test("a send reads any operand, as the entry's effects left each subject; a `tell` is addressed by a slot; a `collect` lists the items of a range; and a result finds the clause of the form that made its request", () => {
    const [X, staging] = [9, 4].map((n) => new Scope(ticketDefinition, rita.member, true, n)) as [Scope, Scope];
    const [A, B, C] = [1, 2, 3].map(address) as [ScopeRef, ScopeRef, ScopeRef];
    const S = staging.at;
    const P = new Scope(pullDefinition);
    const merge = (peer?: ScopeRef) => P.act(rita, "merge", { ...fields(peer ? { peer } : {}), expected: { proposal: P.item(0).revision } });
    // No lane staged this work: the first `tell` is not made, and nobody is told. The second is at ordinal 0, to the peer that this entry's effect set.
    // The act names no link. So the send whose address reads the link is not made, and neither is the one whose condition reads it.
    expect(merge(X.at).result).toBe("write");
    const first = P.last.seq;
    expect(sent(P)).toEqual([[0, "note", X.at.scope]]);
    // Its result names ordinal 0. The clause is the one of the form that made the send, which is the second form.
    expect([answer(P, X, first, 0, "applied"), P.item(first).state]).toEqual(["write", "done"]);
    // A send with no condition needs its target.
    expect(merge()).toMatchObject({ result: "refused", reason: "send-unresolved" });

    const [a, , c] = [{ issue: A, how: "keyword" }, { issue: B, how: "manual" }, { issue: C }].map((given) => P.did(rita, "link", fields(given)).seq);
    P.did(rita, "stage", { ...on(P, 0), ...fields({ staging: S, watcher: una.member }) });
    // A `collect` needs every item of its range. A page that is more than one guard may read completes nothing, and the act is not judged.
    P.bounds = { ...tight, guardScan: 2 };
    expect(merge(X.at)).toEqual({ result: "unavailable", reason: "guard-incomplete" });
    P.bounds = tight;
    const signed = P.intent(rita, "merge", { ...fields({ peer: X.at, link: c! }), expected: { proposal: P.item(0).revision, link: 1 } });
    expect(P.submit(signed).result).toBe("write");
    const second = P.last.seq;
    // All four are made now, in the order written. The link does not state how it was made: the last send's condition holds, and
    // the notice's does not.
    expect([sent(P), told(P)]).toEqual([[[0, "reserve", S.scope], [1, "note", X.at.scope], [2, "blocks", C.scope], [3, "unexplained", X.at.scope]], []]);
    // The same act for the link that does state it: that send is not made and takes no ordinal, and the watchers of the proposal are told.
    expect(P.act(rita, "merge", { ...fields({ peer: X.at, link: a! }), expected: { proposal: P.item(0).revision, link: 1 } }).result).toBe("write");
    expect([sent(P).map(([, kind]) => kind), told(P)]).toEqual([["reserve", "note", "blocks"], [{ effect: "attention", item: 0, members: [una.member], reason: "merging" }]]);
    // `self` is the mark. An item is the fact of the entry that opened it. A range covers the items its `where` passes, in order
    // of item ID, and a record leaves out a member whose slot is empty.
    expect((P.entries[second]!.entry.sends[0]!.message as Request).body).toEqual({
      message: "reserve",
      fields: {
        operation: { self: true }, by: rita.member, lane: P.at, intent: intentDigest(signed.intent), why: "ready", proposal: P.fact(0), author: rita.member,
        links: [{ link: P.fact(a!), state: "set", issue: A, how: "keyword" }, { link: P.fact(c!), state: "set", issue: C }],
      },
    });
    // Each result runs the clause of its own form.
    expect([answer(P, staging, second, 0, "refused"), P.item(second).state]).toEqual(["write", "refused"]);
    expect(P.replay().snapshot()).toBe(P.state.snapshot());
  });

  test("a record that holds a reference to this scope's own entry is sent with the full reference, and a receiver with the same record type accepts it", () => {
    // `note` is a comment: its entry is the own fact that the record names. `cite` sends a record of it to the staging lane.
    const proof = { type: "fact", kind: ["note"], under: "pull" } as const;
    const evidence = { type: "record", of: { proof: { ...proof, required: true } } } as const;
    const cited = valid(validateDefinition((() => {
      const d = structuredClone(pull) as any;   // eslint-disable-line @typescript-eslint/no-explicit-any
      d.acts.note = act({ step: "comment", on: null, grant: "write" });
      d.acts.cite = act({
        step: "transition", on: "proposal", grant: "write", fields: { evidence: { ...evidence, required: true } }, guards: [{ state: ["open"] }],
        sends: [{ tell: { to: { slot: "staging" }, message: "evidence", fields: { evidence: { field: "evidence" } }, result: {} } }],
      });
      d.receives.evidence = { message: "evidence", class: "tell", from: { kind: "lane" }, opens: null, fields: { evidence: { ...evidence, required: true } }, also: {}, guards: [], effects: [], sends: [], attention: [] };
      return d as DeclaredDefinition;
    })(), tight));
    const R = new Scope(cited, rita.member, true, 5);
    const P = new Scope(cited);
    P.did(rita, "stage", { ...on(P, 0), ...fields({ staging: R.at, watcher: una.member }) });
    const q = P.did(rita, "note").seq;
    // The act holds the reference to its own entry, which is not the genesis: the fold reads it as the number q.
    expect(P.act(rita, "cite", { ...on(P, 0), ...fields({ evidence: { proof: P.fact(q) } }) }).result).toBe("write");
    const cite = P.last;
    expect((cite.sends[0]!.message as Request).body).toEqual({ message: "evidence", fields: { evidence: { proof: P.fact(q) } } });
    expect([deliver(R, P, cite.seq).result, decided(R)]).toEqual(["write", ["applied"]]);
    // The receiver still refuses a number in the record: its shape check is as it was.
    arrive(R, P, { class: "request", type: "tell", body: { message: "evidence", fields: { evidence: { proof: q } } } });
    expect(decided(R)).toEqual(["refused", "bad-field"]);
  });

  test("a scope created under `self` pins its creator's definition, and its index row goes to the directory that its creator recorded; a scope with no directory sends none", () => {
    const D = founded();
    D.did(rita, "open-issue", fields({ title: "whole" }));
    const C = born(D, 1).child;
    deliver(D, C, 0);
    deliver(C, D, 2);
    // C is a lane of the desk. Its `split` creates a lane of its own: under C's definition, with the desk as its directory.
    const split = C.did(rita, "split", fields({ title: "part" }));
    expect(split.sends[0]).toMatchObject({ to: { kind: "lane", definition: ticketDefinition.digest, creator: C.at } satisfies Partial<Seed>, message: { body: { fields: { title: "part" }, directory: D.at } } });
    // The directory is read from the scope's genesis entry. Without its own history the act is not judged.
    expect(C.act(rita, "split", fields({ title: "other" }), { own: undefined })).toEqual({ result: "unavailable", reason: "unavailable" });
    // K's creator is C, which is no directory. Its genesis answers C, and sends its index row to the desk.
    const K = born(C, split.seq).child;
    expect(K.last.sends.map((s) => [s.n, s.message.class, s.to])).toEqual([[0, "result", C.at], [1, "advisory", D.at]]);
    // A directory records no directory of its own. The index row of its genesis act is not made.
    expect(founded(variant(desk, (d) => { d.acts.found.sends = [{ index: { fields: {} } }]; })).last.sends).toEqual([]);
  });

  test("the validator bounds what one entry can send and tell, and refuses a send that it cannot bound or address", () => {
    const refusal = (change: (d: any) => void, bounds = tight) => {   // eslint-disable-line @typescript-eslint/no-explicit-any
      const d = structuredClone(pull) as any;   // eslint-disable-line @typescript-eslint/no-explicit-any
      change(d);
      const result = validateDefinition(d, bounds);
      return result.ok ? null : [...new Set(result.problems.map((p) => p.code))];
    };
    const fanOut = (d: any) => d.receives.published.sends[0].relate;   // eslint-disable-line @typescript-eslint/no-explicit-any
    const reserve = (d: any) => d.acts.merge.sends[0].tell;   // eslint-disable-line @typescript-eslint/no-explicit-any
    const rows: [string, ProblemCode[] | null, ProblemCode][] = [
      ["a fan-out over a type that takes more live items than a fan-out may send", refusal(() => {}, { ...tight, fanOut: 2 }), "fan-out-unbounded"],
      ["a fan-out over a final state", refusal((d) => { fanOut(d).each.states.push("removed"); }), "fan-out-unbounded"],
      ["two fan-outs in one list", refusal((d) => { d.receives.published.sends.push({ relate: { ...fanOut(d), name: "follows" } }); }), "fan-out-unbounded"],
      ["a clause that reads `each`, of a fan-out whose update is for another item than `each`", refusal((d) => { fanOut(d).item = { item: "also.proposal" }; }), "name"],
      ["`each` outside a fan-out", refusal((d) => { reserve(d).fields.how = { slot: "how", of: "each" }; }), "name"],
      ["a tell addressed by the name of a slot, as the first delivery wrote it", refusal((d) => { reserve(d).to = "staging"; }), "shape"],
      ["a tell addressed by a slot that holds no scope", refusal((d) => { reserve(d).to = { slot: "author", of: "also.proposal" }; }), "name"],
      ["an update for something that is no local item", refusal((d) => { fanOut(d).item = { slot: "issue", of: "each" }; }), "name"],
      ["`self` inside a record: the mark is the value of a whole field and of no member", refusal((d) => { reserve(d).fields.how = { proof: "self" }; }), "shape"],
      ["a collect as an address", refusal((d) => { fanOut(d).to = { collect: reserve(d).fields.links.collect }; }), "shape"],
      ["a collect over a final state", refusal((d) => { reserve(d).fields.links.collect.items.states.push("removed"); }), "bound"],
      ["a collect of a member that is no slot of the type", refusal((d) => { reserve(d).fields.links.collect.fields.peer = "peer"; }), "name"],
      ["a condition that reads the item its entry opens", refusal((d) => { reserve(d).if = [{ set: "peer" }]; }), "nascent-guard"],
      ["a definition to create under that is no digest, platform name or `self`", refusal((d) => { d.acts.merge.sends.push({ create: { kind: "lane", definition: "pull", fields: {}, result: {} } }); }), "shape"],
      ["two sends of one type and name, one of them conditional and one with a clause", refusal((d) => { d.acts.merge.sends[1].tell.message = "reserve"; }), "shape"],
      ["a condition on a notice of a timed rule", refusal((d) => {
        d.items.merge.values.until = { fixed: false, required: false, of: { type: "time" } };
        d.timed.lapse = { on: "merge", states: ["intended"], deadline: "until", effects: [{ state: "refused" }], attention: [{ notify: { slot: "watchers", of: "on", when: "after", reason: "lapsed", if: [{ state: ["intended"] }] } }] };
        d.items.merge.parties.watchers = { fixed: false, required: false, list: true, max: 2, author: false };
      }), "timed"],
      ["attention that could tell more members than one entry may", refusal(() => {}, { ...tight, attentionMembers: 1 }), "attention-unbounded"],
      ["an entry that could have more sends than one entry may: a fan-out of three, two more forms, two members told and the result", refusal(() => {}, { ...tight, sendsPerEntry: 7 }), "bound"],
    ];
    expect(rows.filter(([, found, code]) => found?.length !== 1 || found[0] !== code).map(([name, found]) => [name, found])).toEqual([]);
    // At the limit itself each passes: three sends of a fan-out, two members told, and eight sends in all.
    expect(refusal(() => {}, { ...tight, attentionMembers: 2, sendsPerEntry: 8 })).toBeNull();
  });
});
