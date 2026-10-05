import { describe, expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { Attempt, Input, Result, ScopeRef, Seed, Send } from "@generalbusiness/artroom-contract";
import { deliveryCauseDigest, factRefOf, intentDigest, messageDigest, scopeIdOf, seedDigest } from "@generalbusiness/artroom-bytes";
import { MemoryState, checkpointOf, clockOf, fits, judgeCheckpoint, judgeDelivery, judgeDiagnosis, judgeGenesis, judgeOutcome, owed, prepareRules, stateDigest, useOf } from "../src/index.ts";
import type { Creation, DeliveryContext, Judged, Source, ValidDefinition } from "../src/index.ts";
import { Ledger, Scope, arriving, born, creation, d, deliver, deskDefinition, fields, forged, founded, judged, keys, laneDefinition, on, sent, t, ticket, ticketDefinition, variant } from "./fixtures.ts";

const { rita, una } = keys;
const unverified = { result: "source-unverified" };
const reading = (s: Ledger) => ({ clock: clockOf(s.state, s.now), bounds: PROPOSED_BOUNDS, facts: [], prepared: [] });
/** A ticket lane, made by hand, that has asked `desk` for another: entry 2 opens request 2 and sends the `tell` at ordinal 0. */
function asker(desk: Ledger): Scope {
  const s = new Scope(ticketDefinition);
  s.did(una, "ask", fields({ desk: desk.at }));
  return s;
}
/** The same input and address in an entry of that scope with other sends: an entry that exists, and is not the one that was sealed. */
const resealed = (from: Ledger, seq: number, sends: readonly Send[]): Source => forged(from.at, seq, from.entries[seq]!.entry.input, sends);

describe("founding a directory and creating a child (sections 7.1 and 7.2)", () => {
  test("four entries, each derived by its judge: the act, a provisional genesis, the result with its applied clause, and the confirmation", () => {
    const D = founded();
    // A directory has no creator to confirm it. Its genesis holds the founding intent, whose digest is the seed's cause.
    const found = D.last.input as Extract<Input, { type: "genesis" }>;
    expect([D.state.scope()!.status, found.seed.creator, found.seed.cause, D.at.scope]).toEqual(["active", null, intentDigest(found.founding!.intent), scopeIdOf(found.seed)]);

    // D.1: the act. Its send is addressed by a seed whose cause is the act's intent digest.
    const act = D.did(rita, "open-issue", fields({ title: "A flaky test" }));
    const seed = act.sends[0]!.to as Seed;
    expect(seed).toEqual({ v: 1, kind: "lane", definition: ticketDefinition.digest, creator: D.at, cause: intentDigest((act.input as Extract<Input, { type: "act" }>).signed.intent), ordinal: 0 });

    // I.0: the genesis. Its name is the seed's digest; the opener is the member the creator judged; it sends one result, at ordinal 0.
    const { child: I } = born(D, 1);
    expect(I.last).toMatchObject({
      seq: 0, prev: null, at: { scope: scopeIdOf(seed), kind: "lane" },
      input: { type: "genesis", seed, founding: null, source: D.fact(1), n: 0, decision: "applied" },
      effects: [{ effect: "open", item: 0, type: "intent", state: "open" }, { effect: "party", item: 0, slot: "requester", member: rita.member }, { effect: "value", item: 0, slot: "title", value: "A flaky test" }],
      sends: [
        { n: 0, to: D.at, message: { class: "result", of: { from: D.fact(1), n: 0 }, outcome: "applied" } },
        { n: 1, to: D.at, message: { class: "advisory", type: "index", body: { fields: { title: "A flaky test" } } } },
      ],
    });
    // The index row its genesis act declares is sealed as a duty and held: only the result leaves a provisional scope.
    expect(I.state.scope()!.held).toEqual([1]);
    // While it is provisional it admits a repeat of its creation request, answered from its genesis, and nothing else.
    const P = new Scope(ticketDefinition);
    P.did(rita, "link", fields({ target: I.at, about: 0 }));
    expect([I.state.scope()!.status, judged(I, D, 1), I.act(rita, "ask", fields({ desk: D.at })), judged(I, P, 2)])
      .toEqual(["provisional", { result: "repeat", seq: 0 }, { result: "unavailable", reason: "scope-provisional" }, { result: "unavailable", reason: "scope-provisional" }]);

    // D.2: the result. The `applied` clause of the create send runs, the incarnation is held, and the confirmation names I.0.
    expect(deliver(D, I, 0).result).toBe("write");
    expect(D.last).toMatchObject({
      input: { type: "delivery", from: I.fact(0), n: 0, clause: "applied" }, effects: [{ effect: "state", item: 1, state: "created" }],
      sends: [{ n: 0, to: I.at, message: { class: "control", type: "confirm", genesis: I.fact(0) } }],
    });
    expect(D.state.creation(seedDigest(seed))).toEqual({ inc: I.at.inc, seq: 2 });

    // A confirmation is admitted only from the creator's entry that recorded this genesis's result: not from its act, D.1.
    const other = forged(D.at, 7, D.entries[1]!.entry.input, D.last.sends);
    expect(judged(I, D, 2, 0, { from: factRefOf(other.entry), source: other })).toMatchObject(unverified);

    // I.1: the confirmation. The scope is active from this entry; a repeat adds nothing; an act is now judged.
    expect(deliver(I, D, 2).result).toBe("write");
    expect([I.last.effects, I.last.sends, I.state.scope()!.status, I.state.scope()!.held]).toEqual([[{ effect: "activate" }], [], "active", []]);
    expect(deliver(I, D, 2)).toEqual({ result: "repeat", seq: 1 });
    expect(I.act(rita, "ask", fields({ desk: D.at })).result).toBe("write");
    for (const s of [D, I]) expect(s.replay().snapshot()).toBe(s.state.snapshot());
  });

  test("a refused genesis is terminal; a second incarnation's result runs `conflict` and gets no confirmation", () => {
    const D = founded();
    D.did(rita, "open-issue", fields({ title: "refuse" }));
    const { child: R } = born(D, 1);
    // The genesis act's guard refused: the entry is written with no effect, and sends its `refused` result and nothing else.
    expect(R.last).toMatchObject({ input: { decision: "refused" }, effects: [], sends: [{ n: 0, message: { class: "result", outcome: "refused", reason: { code: "guard-failed" } } }] });
    expect([R.state.scope()!.status, judged(R, D, 1)]).toEqual(["refused", { result: "repeat", seq: 0 }]);
    expect(R.act(rita, "ask", fields({ desk: D.at }))).toMatchObject({ result: "refused", reason: "scope-refused" });
    deliver(D, R, 0);
    expect([D.last.effects, D.last.sends]).toEqual([[{ effect: "state", item: 1, state: "refused" }], []]);

    // D.3 asks again. The first store's result is applied and confirmed. Another store answers the same creation with another incarnation.
    const seed = D.did(rita, "open-issue", fields({ title: "B" })).sends[0]!.to as Seed;
    const first = born(D, 3).child;
    deliver(D, first, 0);
    const second = born(D, 3, 0, 21).child;
    expect([second.at.scope, second.at.inc === first.at.inc]).toEqual([first.at.scope, false]);
    expect(deliver(D, second, 0).result).toBe("write");
    expect(D.last).toMatchObject({ input: { clause: "conflict" }, effects: [{ effect: "state", item: 3, state: "conflicted" }], sends: [] });
    // The incarnation held and the request's one result are still the first's. The second stays provisional for good.
    expect([D.state.creation(seedDigest(seed)), D.state.request(3, 0)!.result, second.state.scope()!.status]).toEqual([{ inc: first.at.inc, seq: 4 }, { seq: 4, clause: "applied" }, "provisional"]);
  });

  test("two deliveries with identical message bytes create two different children, and an exact repeat adds nothing", () => {
    const D = founded();
    const S = asker(D);
    S.did(una, "ask", fields({ desk: D.at }));
    const m = messageDigest(S.entries[2]!.entry.sends[0]!.message);
    expect(messageDigest(S.entries[3]!.entry.sends[0]!.message)).toBe(m);

    // D.1 decides S.2 and D.2 decides S.3. Each seed's cause is its own delivery cause: the source fact differs.
    for (const seq of [2, 3]) expect(deliver(D, S, seq).result).toBe("write");
    const seeds = [1, 2].map((seq) => D.entries[seq]!.entry.sends[0]!.to as Seed);
    expect(seeds.map((s) => s.cause)).toEqual([2, 3].map((seq) => deliveryCauseDigest({ v: 1, from: S.fact(seq), n: 0, message: m })));
    // Each deciding entry sends its create and then exactly one result, which names its own request.
    expect([1, 2].map((seq) => D.entries[seq]!.entry.sends.map((s) => (s.message.class === "result" ? s.message.of.from.seq : s.message.class)))).toEqual([["request", 2], ["request", 3]]);
    // Each child checks its cause against a source entry that is a delivery, and has its own scope ID.
    const children = [1, 2].map((seq) => born(D, seq));
    expect(children.map((c) => c.judgment.result)).toEqual(["write", "write"]);
    expect(new Set(children.map((c) => c.child.at.scope)).size).toBe(2);

    // The delivery from S.2 arrives again: no new entry, no second seed. The answer names D.1.
    const head = D.head;
    expect([deliver(D, S, 2), D.head]).toEqual([{ result: "repeat", seq: 1 }, head]);
    // The result returns to S and runs the `applied` clause of the `tell`.
    deliver(S, D, 1, 1);
    expect([S.item(2).state, S.state.request(2, 0)!.result]).toEqual(["answered", { seq: 4, clause: "applied" }]);
  });
});

describe("a relationship update (section 7.3)", () => {
  /** P.2 sets the link and P.3 removes it. The two updates of the one key reach a new receiver in the order given. */
  function arrive(order: readonly number[]) {
    const P = new Scope(ticketDefinition);
    const I = new Scope(ticketDefinition, rita.member, true, 1);
    P.did(rita, "link", fields({ target: I.at, about: 0 }));
    P.did(rita, "unlink", on(P, 2));
    const results = order.map((seq) => {
      deliver(I, P, seq);
      const result = I.last.sends.at(-1)!.message as Result;
      return [result.of.from.seq, result.outcome];
    });
    return { P, I, results };
  }

  test.each([
    ["in order", [2, 3], [[2, "applied"], [3, "applied"]]],
    ["out of order", [3, 2], [[3, "applied"], [2, "superseded"]]],
  ])("%s, the copy ends `removed` at the higher revision, and each request has one result", (_name, order, expected) => {
    const { P, I, results } = arrive(order);
    expect(results).toEqual(expected);
    // The copy is keyed by the owner's scope, incarnation, name and item; its revision is the owner entry's seq.
    expect(I.state.relation(P.at, "closes", 2)).toEqual({ owner: P.at, name: "closes", item: 2, state: "removed", revision: 3 });
    // The handler for `relate:closes` ran for each applied update, and not for a superseded one.
    expect(I.item(0).values["linked"]).toBe("removed");
    expect(deliver(I, P, order[1]!)).toEqual({ result: "repeat", seq: I.head.seq });
    expect(I.replay().snapshot()).toBe(I.state.snapshot());
  });

  test("a source entry with two relate sends for one key is not a valid owner entry; a wrong incarnation is refused by the resolver before anything is read", () => {
    const { P, I } = arrive([]);
    const send = P.entries[2]!.entry.sends[0]!;
    const twice = resealed(P, 2, [send, { ...send, n: 1 }]);
    const head = I.head;
    expect(judged(I, P, 2, 0, { from: factRefOf(twice.entry), source: twice })).toMatchObject(unverified);
    // The address names this scope ID with another incarnation, or another scope. No source entry is needed to say so.
    expect(judged(I, P, 2, 0, { to: { ...I.at, inc: P.at.inc }, source: null })).toEqual({ result: "routing", reason: "wrong-incarnation" });
    expect(judged(I, P, 2, 0, { to: P.at, source: null })).toEqual({ result: "routing", reason: "not-found" });
    expect(I.head).toEqual(head);
  });

  test("a handler whose sends hold two relate sends for one key gets a deciding entry `refused`, with no send but the result", () => {
    const D = founded();
    const X = new Scope(ticketDefinition);
    const tell: Send = { n: 0, to: D.at, message: { class: "request", type: "tell", body: { message: "echo", fields: { peer: X.at, a: 0, b: 0 } } } };
    const source = resealed(X, 1, [tell]);
    const arrival = { ...tell, from: factRefOf(source.entry) };
    expect(judgeDelivery(D.state, deskDefinition, arrival, arriving(D, arrival, source))).toMatchObject({
      result: "write", draft: { input: { decision: "refused", reason: { code: "duplicate-relation" } }, effects: [], sends: [{ n: 0, to: X.at, message: { class: "result", outcome: "refused", reason: { code: "duplicate-relation" } } }] },
    });
  });
});

describe("what a receiver checks in the source entry (section 7.4)", () => {
  test("a result that names an owned send is admitted only from the entry that decided it, in the scope and incarnation addressed", () => {
    const D = founded();
    const S = asker(D);
    deliver(D, S, 2);                                   // D.1 decides S.2 and sends its result at ordinal 1
    const { entry } = D.entries[1]!;
    const result = entry.sends[1]!;
    const other: ScopeRef = new Scope(ticketDefinition, rita.member, true, 5).at;
    const sources: readonly (readonly [string, Source])[] = [
      ["another scope", forged(other, 1, entry.input, [result])],
      ["another incarnation of the target", forged({ ...D.at, inc: other.inc }, 1, entry.input, [result])],
      ["an entry of the target that did not decide the request", resealed(D, 0, [result])],
    ];
    const head = S.head;
    for (const [name, source] of sources) {
      const arrival = { ...result, from: factRefOf(source.entry) };
      expect(judgeDelivery(S.state, ticketDefinition, arrival, arriving(S, arrival, source)), name).toMatchObject(unverified);
    }
    expect(S.head).toEqual(head);
    // The same message from the deciding entry is recorded.
    expect(deliver(S, D, 1, 1).result).toBe("write");
  });

  test("a source entry with the send removed, a message that is not the one sent, or a seed with another cause fails the genesis and the delivery checks", () => {
    const D = founded();
    D.did(rita, "open-issue", fields({ title: "A" }));
    const S = asker(D);
    const genesis = (asked: Creation, source: Source) => judgeGenesis(new MemoryState(), ticketDefinition, asked, { ...reading(D), source });
    const { asked, source } = creation(D, 1);
    const cut = resealed(D, 1, []);
    const tell = sent(S, 2);
    const cutTell = resealed(S, 2, []);
    const changed = { class: "request", type: "create", body: { fields: { opener: una.member, title: "A" } } } as const;
    // A source entry that does hold the send, for a seed whose cause is not that entry's intent digest.
    const seed: Seed = { ...asked.to, cause: d("1") };
    const miscaused = resealed(D, 1, [{ ...source.entry.sends[0]!, to: seed }]);
    expect([
      genesis({ ...asked, name: scopeIdOf(seed), to: seed, from: factRefOf(miscaused.entry) }, miscaused),
      genesis({ ...asked, from: factRefOf(cut.entry) }, cut),
      genesis({ ...asked, message: changed }, source),
      judged(D, S, 2, 0, { from: factRefOf(cutTell.entry), source: cutTell }),
      judged(D, S, 2, 0, { message: { ...tell.delivered.message, body: { message: "spawn", fields: {} } } as Send["message"] }),
    ].map((j) => j.result)).toEqual(Array(5).fill("source-unverified"));
    // The unchanged inputs pass the same checks.
    expect([genesis(asked, source).result, judged(D, S, 2).result]).toEqual(["write", "write"]);
  });
});

describe("what a written refusal or a later clause records of what it read (section 9.2)", () => {
  /** The creation that D.1 asks for, as it reaches a ticket under another definition, with `more` fields in its message. The source entry is made by hand. */
  function creationUnder(D: Ledger, definition: ValidDefinition, more: Record<string, unknown> = {}): { asked: Creation; context: DeliveryContext } {
    const { asked } = creation(D, 1);
    const seed: Seed = { ...asked.to, definition: definition.digest };
    const message = { ...asked.message, body: { fields: { ...(asked.message.body as { fields: object }).fields, ...more } } };
    const made = resealed(D, 1, [{ n: 0, to: seed, message }]);
    return { asked: { ...asked, name: scopeIdOf(seed), to: seed, message, from: factRefOf(made.entry) }, context: { ...reading(D), source: made } };
  }
  /** Each rule the input meets, prepared as false. */
  const falsely = (state: MemoryState, definition: ValidDefinition, judged: Judged) => prepareRules(state, definition, judged).map((a) => ({ rule: a.rule, input: a.digest, result: false }));

  test("a rule that is false: the refused genesis and the refused deciding entry of a request each record the result their guard read", () => {
    const strict = variant(ticket, (def) => {
      def.rules.never = "false";
      def.acts.file.guards.push({ rule: "never" });
      def.receives.closes.guards.push({ rule: "never" });
    });
    const D = founded();
    D.did(rita, "open-issue", fields({ title: "A" }));
    const { asked, context } = creationUnder(D, strict);
    const forGenesis = falsely(new MemoryState(), strict, { genesis: asked, context });
    expect(forGenesis).toHaveLength(1);
    expect(judgeGenesis(new MemoryState(), strict, asked, { ...context, prepared: forGenesis })).toMatchObject({
      result: "write", draft: { input: { decision: "refused" }, prepared: forGenesis, effects: [], sends: [{ n: 0, message: { outcome: "refused", reason: { code: "guard-failed" } } }] },
    });

    // A lane's update reaches a ticket whose handler for it is under the same rule.
    const I = new Scope(strict, rita.member, true, 1);
    const P = new Scope(ticketDefinition);
    P.did(rita, "link", fields({ target: I.at, about: 0 }));
    const { delivered, source } = sent(P, 2);
    const arrival = arriving(I, delivered, source);
    const forHandler = falsely(I.state, strict, { delivery: delivered, context: arrival });
    expect(forHandler).toHaveLength(1);
    expect(judgeDelivery(I.state, strict, delivered, { ...arrival, prepared: forHandler })).toMatchObject({
      result: "write", draft: { input: { decision: "refused", reason: { code: "guard-failed" } }, prepared: forHandler, effects: [] },
    });
  });

  test("a fact guard that is false, or a later field that names no item: the refused genesis records the named fact it read, and a later clause records the facts it reads again", () => {
    // P: a lane's `assign` entry, which names una as performer. The creation passes the reference on; the creator did not read P.
    const l = new Scope(laneDefinition);
    l.did(rita, "offer", { fields: { intent: 0 }, expected: { intent: 1 } });
    const entry = l.did(rita, "assign", { ...on(l, 2), ...fields({ performer: una.member }) });
    const fetched = { fact: l.fact(entry.seq), entry, under: "lane" };
    const proof = { type: "fact", kind: ["assign"], under: "lane", required: true };
    const cited = variant(ticket, (def) => {
      def.acts.file.fields.proof = proof;
      def.acts.file.guards.push({ fact: { field: "proof", where: [{ equals: { a: { field: "performer" }, b: { field: "opener" } } }] } });
    });
    const D = founded();
    D.did(rita, "open-issue", fields({ title: "A" }));
    const { asked, context } = creationUnder(D, cited, { proof: fetched.fact });
    // The opener is rita, so the guard is false. The entry holds the source entry and P: the child can derive the refusal again from its own retained bytes.
    expect(judgeGenesis(new MemoryState(), cited, asked, { ...context, facts: [fetched] })).toMatchObject({
      result: "write", draft: { input: { decision: "refused" }, uses: [useOf(asked.from, context.source!.entry), useOf(fetched.fact, entry)], sends: [{ message: { outcome: "refused", reason: { code: "guard-failed" } } }] },
    });

    // The same creation under a definition whose later field names a local item. No item exists before a genesis, so it is refused
    // `no-item`, after P was read: the entry holds P all the same.
    const itemised = variant(ticket, (def) => {
      def.acts.file.fields.proof = proof;
      def.acts.file.fields.zItem = { type: "item", of: "intent", required: true };
    });
    const early = creationUnder(D, itemised, { proof: fetched.fact, zItem: 0 });
    expect(judgeGenesis(new MemoryState(), itemised, early.asked, { ...early.context, facts: [fetched] })).toMatchObject({
      result: "write", draft: { input: { decision: "refused" }, uses: [useOf(early.asked.from, early.context.source!.entry), useOf(fetched.fact, entry)], sends: [{ message: { outcome: "refused", reason: { code: "no-item" } } }] },
    });

    // An `ask` whose fields name P. Its `undelivered` clause runs in a later entry and reads P again; the origin entry recorded P first.
    const asking = variant(ticket, (def) => { def.acts.ask.fields.proof = proof; });
    const S = new Scope(asking);
    expect(S.act(una, "ask", fields({ desk: D.at, proof: fetched.fact }), { facts: [fetched] }).result).toBe("write");
    expect(judgeDiagnosis(S.state, asking, { of: { seq: 2, n: 0 }, attempts: [{ at: t(0), answer: "not-found" }] }, { ...reading(S), facts: [fetched], origin: S.last })).toMatchObject({
      result: "write", draft: { input: { finding: "undelivered" }, uses: [useOf(fetched.fact, entry)], effects: [{ effect: "state", item: 2, state: "failed" }] },
    });
  });
});

describe("a clause run in a later entry (sections 6.6 and 6.7)", () => {
  test("it reads the member who signed the origin and no principal, so what it attributes is what the fold records", () => {
    // The request has a party slot that attributes, and a list that takes the request's attribution. The `applied` clause sets the
    // first from the signer and fills the second. Una asked, under a grant that names Paul.
    const owned = variant(ticket, (def) => {
      def.items.request.parties = { owner: { fixed: false, required: false, list: false, author: true }, authors: { fixed: false, required: false, list: true, max: 4, author: false } };
      def.acts.ask.sends[0].tell.result.applied = [{ state: "answered" }, { party: { slot: "owner", from: { signer: true } } }, { attribute: { slot: "authors", of: "on" } }];
    });
    const D = founded();
    const S = new Scope(owned);
    S.did(una, "ask", fields({ desk: D.at }));
    deliver(D, S, 2);
    expect(deliver(S, D, 1, 1).result).toBe("write");
    // The entry that records the result has no signer and judges no grant: Paul is in neither the list nor the item's history.
    const members = (list: unknown) => (list as readonly { member: string }[]).map((m) => m.member);
    expect([members(S.item(2).parties["authors"]), members(S.item(2).attributed)]).toEqual([["@una"], ["@una"]]);
    expect(S.replay().snapshot()).toBe(S.state.snapshot());
  });
});

describe("a diagnosis (section 7.4)", () => {
  const answers = (...list: Attempt["answer"][]): Attempt[] => list.map((answer, i) => ({ at: t(i), answer }));

  test("the finding follows from the log: `undelivered` only when every attempt was a routing refusal; `delivery-unavailable` leaves the request pending", () => {
    const D = founded();
    const S = asker(D);
    const diagnose = (attempts: Attempt[]) => judgeDiagnosis(S.state, ticketDefinition, { of: { seq: 2, n: 0 }, attempts }, { ...reading(S), origin: S.entries[2]!.entry });
    const found = (attempts: Attempt[]) => {
      const j = diagnose(attempts);
      return j.result === "write" && j.draft.input.type === "diagnosis" ? [j.draft.input.finding, j.draft.effects] : j;
    };
    // `undelivered` is terminal and runs the send's clause. The other finding runs none.
    expect(found(answers("wrong-incarnation", "not-found", "wrong-incarnation"))).toEqual(["undelivered", [{ effect: "state", item: 2, state: "failed" }]]);
    expect(found(answers("retry", "not-found"))).toEqual(["delivery-unavailable", []]);
    const lost = diagnose(answers("none", "not-found"));
    if (lost.result === "write") S.seal(lost.draft);
    expect(S.last.input).toMatchObject({ type: "diagnosis", finding: "delivery-unavailable" });
    expect([S.item(2).state, S.state.request(2, 0)]).toMatchObject(["asked", { result: null, diagnosis: { seq: 3, finding: "delivery-unavailable" } }]);
    expect(diagnose(answers("not-found"))).toEqual({ result: "repeat", seq: 3 });

    // The request had in fact been decided. Its late, authentic result is still recorded, and runs `applied`.
    deliver(D, S, 2);
    expect(deliver(S, D, 1, 1).result).toBe("write");
    expect([S.item(2).state, S.state.request(2, 0)!.result]).toEqual(["answered", { seq: 4, clause: "applied" }]);
    expect(S.replay().snapshot()).toBe(S.state.snapshot());
  });
});

describe("outcomes and checkpoints (sections 4.3 and 9.2)", () => {
  test("an outcome settles its own numbered attempt and no other, and is written clamped when the clock is behind", () => {
    const s = new Scope(ticketDefinition);
    const operation = "op_publish" as const;
    // No form of this step opens an operation: that is the authority note's. This entry is made by hand to carry the record of two opened attempts.
    s.fold({
      v: 1, at: s.at, seq: 2, prev: s.head.hash, time: t(10), clamped: false, epoch: 0, input: { type: "checkpoint", ...checkpointOf(s.state) }, uses: [], prepared: [],
      effects: [1, 2].map((attempt) => ({ effect: "operation", operation, attempt })), sends: [],
    });
    const outcome = (attempt: number, result: "confirmed" | "refused" | "unknown") => {
      const j = judgeOutcome(s.state, ticketDefinition, { type: "outcome", operation, attempt, result, evidence: { read: "nothing" } }, reading(s));
      if (j.result === "write") s.seal(j.draft);
      return j.result;
    };
    s.now = t(10);
    expect([outcome(1, "unknown"), outcome(2, "confirmed")]).toEqual(["write", "write"]);
    // The later attempt did not settle the earlier unknown one.
    expect(s.state.operation(operation)!.attempts.map((a) => a.outcome?.result)).toEqual(["unknown", "confirmed"]);
    // An attempt no entry opened, a settled attempt, and a repeat.
    expect([outcome(3, "confirmed"), outcome(2, "refused"), outcome(2, "confirmed")]).toEqual(["refused", "refused", "repeat"]);
    // An outcome judges no time condition (section 5.3): behind the history, it takes the previous entry's time.
    s.now = t(5);
    expect([outcome(1, "confirmed"), s.last.time, s.last.clamped]).toEqual(["write", t(10), true]);
    expect(s.replay().snapshot()).toBe(s.state.snapshot());
  });

  test("a checkpoint's digest is the digest of the state folded through its sequence; a wrong digest is refused", () => {
    const s = asker(founded());
    const at = checkpointOf(s.state);
    expect(judgeCheckpoint(s.state, ticketDefinition, { ...at, state: d("0") }, reading(s))).toMatchObject({ result: "refused", reason: "bad-input" });
    const j = judgeCheckpoint(s.state, ticketDefinition, at, reading(s));
    if (j.result === "write") s.seal(j.draft);
    expect(s.last.input).toEqual({ type: "checkpoint", through: 2, state: at.state });
    // A verifier folds entries 0 to 2 into a new state and gets the digest the entry carries. The entry after it changes the state.
    expect([stateDigest(s.replay(3).all()), stateDigest(s.state.all()) === at.state]).toEqual([at.state, false]);
  });
});

describe("room to settle (section 17.2 of the contract's revision 10, the adopted revision)", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  /** The ticket, with a request that a timed rule pauses at its `until`, which `ask` sets from a field. */
  const pausing = (d: any) => {
    d.items.request.states.paused = { final: false };
    d.items.request.values.until = { fixed: false, required: false, of: { type: "time" } };
    d.timed.pause = { on: "request", states: ["asked"], deadline: "until", effects: [{ state: "paused" }], attention: [] };
    d.acts.ask.fields.until = { type: "time", required: true };
    d.acts.ask.effects.push({ value: { slot: "until", from: { field: "until" } } });
  };
  /** The entries written, and the entries reserved at that head. */
  const row = (s: Ledger) => [s.entries.length, owed(s.state, s.definition, s.last.input)];

  test("a late result sets a timer again (the fifth witness of section 17.4): each request reserves its two entries and the deadline its clause can create, and every row is within the budget the act was admitted in", () => {
    // X12: `ask` sends two requests, and the `applied` clause of each sets `asked` again. The deadline has passed, so `asked` is due at once.
    const x12 = variant(ticket, (d) => {
      pausing(d);
      d.acts.ask.sends[0].tell.result = { applied: [{ state: "asked" }] };
      d.acts.ask.sends.push(structuredClone(d.acts.ask.sends[0]));
    });
    const D = founded();
    const S = new Scope(x12);                                  // entries 0 and 1: one more than the contract's table, which has a founding only
    const ask = S.did(una, "ask", fields({ desk: D.at, until: t(-60) }));
    // The act: a deadline that reserves 1, two requests that reserve 3 each, and the closing checkpoint. It fits in 11 entries and not in 10.
    expect([row(S), fits(S.state, x12, { scopeEntries: 11 }, ask.input), fits(S.state, x12, { scopeEntries: 10 }, ask.input)]).toEqual([[3, 8], true, false]);
    const rows = [];
    const paused = () => { expect(S.drain().map((j) => j.result)).toEqual(["write"]); rows.push(row(S)); };
    paused();
    for (const n of [0, 1]) {
      const diagnosis = judgeDiagnosis(S.state, x12, { of: { seq: 2, n }, attempts: [{ at: t(0), answer: "retry" }] }, { ...reading(S), origin: ask });
      if (diagnosis.result === "write") S.seal(diagnosis.draft);
    }
    rows.push(row(S));
    for (const n of [0, 1]) {
      // The desk decides the request late, and its result runs the clause: the item is `asked` again, and due.
      deliver(D, S, 2, n);
      expect(deliver(S, D, D.head.seq, 1).result).toBe("write");
      rows.push(row(S));
      paused();
    }
    const closing = judgeCheckpoint(S.state, x12, checkpointOf(S.state), reading(S));
    if (closing.result === "write") S.seal(closing.draft);
    rows.push(row(S));
    // Timed; both diagnoses; a result and its timed entry, twice; the closing checkpoint. Written and reserved are 11 in every row.
    expect(rows).toEqual([[4, 7], [6, 5], [7, 4], [8, 3], [9, 2], [10, 1], [11, 0]]);
  });

  test("a chain of timed rules (the table of section 17.3a): a deadline reserves one entry for each rule its rule leads to", () => {
    // Rule A, `asked` to `paused`; rule B, `paused` to `failed`, which is final. Both read one deadline.
    const x11 = variant(ticket, (d) => { pausing(d); d.timed.lapse = { ...d.timed.pause, states: ["paused"], effects: [{ state: "failed" }] }; });
    const S = new Scope(x11);
    S.did(una, "ask", fields({ desk: founded().at, until: t(-60) }));
    // The chain of 2, the request's 2, and the closing checkpoint. Both timed entries are then written from that reservation.
    expect([x11.deadlines, row(S), S.drain().length, row(S)]).toEqual([{ request: { asked: 2, paused: 1 } }, [3, 5], 2, [5, 3]]);
  });
});
