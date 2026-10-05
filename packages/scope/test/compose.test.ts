import { describe, expect, test } from "vitest";
import type { Entry, Input, Seed } from "@generalbusiness/artroom-contract";
import { messageDigest, scopeIdOf } from "@generalbusiness/artroom-bytes";
import { timeMs } from "@generalbusiness/artroom-derive";
import { reader } from "./support.ts";
import { Node, desk, later, net, rita, settle, ticket, una } from "./net.ts";

/** What each entry of a history is: its input's type and, for a delivery, the message's class. */
const kinds = (entries: readonly Entry[]) => entries.map((e) => (e.input.type === "delivery" ? e.input.message.class : e.input.type));
type Decided = Extract<Input, { type: "delivery"; decision: string }>;
type Recorded = Extract<Input, { type: "delivery"; clause: string }>;
/** The deliveries of requests in a history, and of results. */
const decided = (entries: readonly Entry[]) => entries.flatMap((e) => (e.input.type === "delivery" && "decision" in e.input ? [{ entry: e, input: e.input as Decided }] : []));
const results = (entries: readonly Entry[]) => entries.flatMap((e) => (e.input.type === "delivery" && "clause" in e.input ? [e.input as Recorded] : []));
const approve = { on: 0, expected: { on: 1 } };

describe("creating a child (section 7.2), in two real objects, by the dispatchers alone", () => {
  test("four entries: the act, a provisional genesis, the result and the confirmation; the child admits no act until it is confirmed, and holds its other sends until then", async () => {
    const D = await desk();
    // The confirmation is held back, so the state between entries 3 and 4 of the exchange can be read.
    net.hold = (e) => e.message.class === "control";
    const act = await D.did(rita, "open-issue", { fields: { title: "A flaky test" } });   // D.1
    const I = await D.created(act.fact.seq);
    await settle(D, I);

    const [d, i] = [await D.sealed(), await I.sealed()];
    const fact = ({ entry, hash }: (typeof d)[number]) => ({ at: entry.at, seq: entry.seq, hash });
    expect([kinds(d.map((s) => s.entry)), kinds(i.map((s) => s.entry))]).toEqual([["genesis", "act", "result"], ["genesis"]]);
    // I.0 names its source, D.1, and minted its own incarnation. D.2 records its result from I.0 and sends the confirmation.
    expect(i[0]!.entry).toMatchObject({ at: { scope: I.name, kind: "lane" }, input: { type: "genesis", source: fact(d[1]!), n: 0, decision: "applied" } });
    expect(d[2]!.entry).toMatchObject({ input: { from: fact(i[0]!), clause: "applied" }, effects: [{ effect: "state", item: 1, state: "created" }], sends: [{ message: { class: "control", genesis: fact(i[0]!) } }] });
    // Provisional: the result was sent and acknowledged with D.2; the index row of the genesis act is held, and no attempt of it started.
    expect([(await I.summary()).value.status, await I.duties()]).toMatchObject(["provisional", [{ duty: "0.0", held: false, acknowledged: fact(d[2]!) }, { duty: "0.1", held: true, attempts: [], acknowledged: null }]]);
    expect(await I.act(una, "approve", approve)).toEqual({ answer: "unavailable", reason: "scope-provisional" });

    // The confirmation arrives on its next attempt. I.1 activates the scope, the held send goes out, and an act is accepted.
    net.hold = null;
    await later(1, D, I);
    expect([kinds(await D.entries()), kinds(await I.entries())]).toEqual([["genesis", "act", "result", "advisory"], ["genesis", "control"]]);
    expect([(await I.summary()).value.status, (await I.duties()).map((duty) => duty.held)]).toEqual(["active", [false, false]]);
    expect(await I.act(una, "approve", approve)).toMatchObject({ answer: "accepted", receipt: { fact: { seq: 2 } } });
  });

  test("two requests with identical message bytes create two children with different scope IDs; an exact repeated delivery adds no entry and is answered with the first fact", async () => {
    const D = await desk();
    const S = await ticket(D, "S");
    const asks = [];
    for (const _ of [1, 2]) {
      asks.push(await S.did(una, "ask", { fields: { desk: await D.at() } }));
      await settle(D, S);
    }
    const [first, second] = await Promise.all(asks.map((ask) => S.envelope(ask.fact.seq)));
    expect(messageDigest(first!.message)).toBe(messageDigest(second!.message));

    // Each request has its own deciding entry in D, whose `create` names a seed with its own cause, and so its own child.
    const spawned = decided(await D.entries());
    expect(spawned.map((x) => [x.input.from.seq, x.input.decision])).toEqual(asks.map((ask) => [ask.fact.seq, "applied"]));
    const seeds = spawned.map((x) => x.entry.sends[0]!.to as Seed);
    const children = seeds.map((seed) => new Node(scopeIdOf(seed), S.declared));
    await settle(D, S, ...children);
    expect([seeds[0]!.cause === seeds[1]!.cause, children[0]!.name === children[1]!.name, await Promise.all(children.map(async (c) => (await c.summary()).value.status))]).toEqual([false, false, ["active", "active"]]);
    // Each request got its one result, which ran the `applied` clause of its own send.
    expect((await S.duties()).filter((duty) => duty.class === "request").map((duty) => duty.result?.clause)).toEqual(["applied", "applied"]);

    // The first envelope again, exactly: D answers with the fact of the entry that decided it, and writes nothing.
    const head = (await D.summary()).at;
    const { entry, hash } = (await D.sealed())[spawned[0]!.entry.seq]!;
    expect([await D.stub.deliver(first!), (await D.summary()).at]).toEqual([{ answer: "recorded", fact: { at: entry.at, seq: entry.seq, hash } }, head]);
  });
});

describe("a relationship update (section 7.3) between two real objects", () => {
  test.each([
    ["in order", false, ["applied", "applied"], ["applied", "applied"]],
    ["out of order", true, ["applied", "superseded"], ["superseded", "applied"]],
  ])("%s, the copy ends at the higher revision and each request has one recorded result", async (_name, late, arrivals, clauses) => {
    const D = await desk();
    const P = await ticket(D, "P");
    const I = await ticket(D, "I");
    // P.2 sets the link and a later entry removes it. Out of order: the first update is held back until the second has arrived.
    net.hold = late ? (e) => e.message.class === "request" && (e.message.body as { state?: string }).state === "set" : null;
    // The link names the entry that filed P as its cause. To P that is a local fact. To I it is a foreign entry, fetched before the turn.
    const filed = (await P.sealed())[0]!;
    const set = await P.did(rita, "link", { fields: { target: await I.at(), about: 0, because: { at: filed.entry.at, seq: 0, hash: filed.hash } } });
    await settle(P, I);
    const removed = await P.did(rita, "unlink", { on: set.fact.seq, expected: { on: 1 } });
    await settle(P, I);
    net.hold = null;
    await later(1, P, I);

    // In the receiver: one deciding entry for each update, in the order of arrival, and the copy as the last applied one left it.
    const copies = decided(await I.entries());
    expect(copies.map((x) => x.input.decision)).toEqual(arrivals);
    expect(copies.flatMap((x) => x.entry.effects.filter((e) => e.effect === "relation")).at(-1)).toMatchObject({ item: set.fact.seq, name: "closes", state: "removed", revision: removed.fact.seq });
    expect((await I.item(0))!.values["linked"]).toBe("removed");
    // In the owner: one result recorded for each request, by the request it names.
    const recorded = results(await P.entries()).filter((r) => r.message.of.from.seq >= set.fact.seq).sort((a, b) => a.message.of.from.seq - b.message.of.from.seq);
    expect(recorded.map((r) => [r.message.of.from.seq, r.clause])).toEqual([[set.fact.seq, clauses[0]], [removed.fact.seq, clauses[1]]]);
    if (late) return;
    // The entry that applied the link used the source entry and the entry its field named. The removal named none.
    expect(copies.map((x) => x.entry.uses.map((u) => u.fact.seq))).toEqual([[set.fact.seq, 0], [removed.fact.seq]]);
    // A ticket keeps a copy for two keys, and the store counts the copies it holds: a second link is kept, and a third is refused.
    for (const _ of [2, 3]) {
      await P.did(rita, "link", { fields: { target: await I.at(), about: 0 } });
      await settle(P, I);
    }
    expect(decided(await I.entries()).slice(-2).map((x) => [x.input.decision, x.input.reason?.code])).toEqual([["applied", undefined], ["refused", "type-full"]]);
  });
});

describe("a request that cannot be delivered (section 7.4)", () => {
  test("another incarnation is refused by the resolver of the name and records nothing; three refusals end `undelivered`, and a log with one unanswered attempt ends `delivery-unavailable` with the request pending", async () => {
    const D = await desk();
    const S = await ticket(D, "S");
    const head = (await D.summary()).at;
    // A reference to the desk's scope ID with an incarnation the desk does not have.
    const lost = { ...(await D.at()), inc: (await S.at()).inc };
    const refusedEach = await S.did(una, "ask", { fields: { desk: lost } });
    await settle(S);
    // The first attempt of a second request gets no answer. Every later attempt of both is refused.
    net.hold = () => true;
    const unanswered = await S.did(una, "ask", { fields: { desk: lost } });
    await settle(S);
    net.hold = null;
    for (const seconds of [1, 2, 4]) await later(seconds, S);

    const diagnoses = (await S.entries()).flatMap((e) => (e.input.type === "diagnosis" ? [{ of: e.input.of.seq, finding: e.input.finding, log: e.input.attempts.map((a) => a.answer), effects: e.effects }] : []));
    const wrong = "wrong-incarnation";
    expect(diagnoses).toEqual([
      { of: refusedEach.fact.seq, finding: "undelivered", log: [wrong, wrong, wrong], effects: [{ effect: "state", item: refusedEach.fact.seq, state: "failed" }] },
      { of: unanswered.fact.seq, finding: "delivery-unavailable", log: ["none", wrong, wrong, wrong], effects: [] },
    ]);
    // The second request is still pending: its item has not moved and it has no result. Nothing reached the desk.
    expect([(await S.item(unanswered.fact.seq))!.state, (await S.duties()).find((duty) => duty.duty === `${unanswered.fact.seq}.0`), (await D.summary()).at]).toMatchObject(["asked", { result: null, diagnosis: { finding: "delivery-unavailable" } }, head]);
  });

  test("a forged delivery is `source-unverified` and records nothing: a message the source entry does not hold, and a hash the source entry does not have", async () => {
    const D = await desk();
    const I = await ticket(D, "I");
    const head = (await D.summary()).at;
    const result = await I.envelope(0);                       // a real send: I.0's result, which D has recorded
    const confirmed = (await I.sealed())[1]!;                 // I.1, a real entry that sends nothing
    const from = { at: confirmed.entry.at, seq: 1, hash: confirmed.hash };
    const spawn = { class: "request", type: "tell", body: { message: "spawn", fields: { opener: rita.member, title: "forged" } } } as const;
    expect([
      await D.stub.deliver({ to: await D.at(), from, n: 0, message: spawn }),
      await D.stub.deliver({ ...result, from: { ...result.from, hash: confirmed.hash } }),
      (await D.summary()).at,
    ]).toEqual([{ answer: "source-unverified" }, { answer: "source-unverified" }, head]);
  });
});

describe("a restart of the sender (sections 7.2 and 7.4)", () => {
  test("a send written before the object is evicted is dispatched after it reloads, from the alarm stored with its entry; a second delivery of it is answered from the receiver's history", async () => {
    const D = await desk();
    // The dispatch pass that follows the commit reads an earlier time than the entry's, so it finds nothing due and sends nothing.
    const now = net.clock.now;
    net.clock.script.push(now, now, "2098-12-31T23:59:59Z");
    const act = await D.did(rita, "open-issue", { fields: { title: "A" } });
    await settle();
    const I = await D.created(act.fact.seq);
    expect([(await D.duties()).map((duty) => duty.attempts), await D.alarmAt(), await I.stub.summary(reader)]).toEqual([[[]], timeMs(now), { ok: false, reason: "not-found" }]);

    await D.restart();
    // After the reload the alarm dispatches the send. The receiver records it, and the answer is lost on the way back.
    net.deaf = () => true;
    net.hold = (e) => e.message.class === "result";
    expect(await D.alarm()).toBe(true);
    await settle(D, I);
    const genesis = (await I.sealed())[0]!;
    expect([(await D.duties())[0], (await I.summary()).at.seq]).toMatchObject([{ attempts: [{ answer: "none" }], acknowledged: null }, 0]);
    // The next attempt is a duplicate. The receiver answers it with the fact of its genesis and writes nothing.
    await later(1, D, I);
    expect([(await D.duties())[0], (await I.summary()).at.seq]).toMatchObject([
      { attempts: [{ answer: "none" }, { answer: "acknowledged" }], acknowledged: { at: genesis.entry.at, seq: 0, hash: genesis.hash } }, 0,
    ]);
  });
});
