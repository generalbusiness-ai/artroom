import { expect, test } from "vitest";
import { timeMs } from "@generalbusiness/artroom-derive";
import { capable, graph, net, rita, soon, una, vic } from "./support/graph.ts";

/** A commit and a tree, as a report names them. Nothing reads a repository here. */
const COMMIT = "c".repeat(40);
const TREE = "d".repeat(40);
/** The seconds a hold of the lane definitions lasts. */
const HOLD = 3600;

test("T1, responsibility is not a hold: a hold ends by time before the act that waits, its commitment keeps its performer and its terms, another commitment's hold is untouched, and a withdrawn commitment ends its hold in the same entry", async () => {
  // One real `issue` lane, on the turn and the store. No capability and no peer is used. Not proved: anything a real hold has
  // outside the lane, such as a fork, a token or the fence of its epoch. Those are the capability's records, which are not delivered.
  const g = await graph();
  const G = await g.goal();
  const terms = await G.fact(0);
  // Two commitments, each accepted by its own performer on the goal's terms fact, and a hold under each, ten seconds apart.
  const c1 = (await G.did(rita, "offer", { fields: { offeree: una.member } })).fact.seq;
  await G.did(una, "accept", { on: c1, fields: { terms } });
  const c2 = (await G.did(rita, "offer", {})).fact.seq;
  await G.did(vic, "accept", { on: c2, fields: { terms } });
  const first = soon(HOLD);
  const h1 = (await G.did(una, "take-hold", { fields: { commitment: c1 } })).fact.seq;
  net.clock.now = soon(10);
  const h2 = (await G.did(vic, "take-hold", { fields: { commitment: c2, extent: "the parser" } })).fact.seq;
  // A second hold under a commitment that has one is refused, and the alarm is stored for the earliest end.
  expect([await G.asks(una, "take-hold", { fields: { commitment: c1 } }), await G.alarmAt()]).toEqual(["guard-failed: hold-held", timeMs(first)]);
  const [before, other] = [await G.item(c1), await G.item(h2)];

  // At the first end una asks for a new hold. The turn writes the timed end first, so the act is judged after it and is accepted.
  net.clock.now = first;
  const h3 = (await G.did(una, "take-hold", { fields: { commitment: c1 } })).fact.seq;
  expect((await G.entries()).slice(-2).map((e) => [e.seq, e.time, e.input.type, e.effects[0]])).toEqual([
    [h3 - 1, first, "timed", { effect: "hold", item: h1, change: "end", epoch: 2 }],
    [h3, first, "act", { effect: "open", item: h3, type: "hold", state: "held" }],
  ]);
  // The ended hold keeps its holder and its epoch rose. The commitment is as it was: accepted, the same performer, the same terms
  // fact, the same revision. The hold under the other commitment is as it was.
  expect(await G.item(h1)).toMatchObject({ state: "ended", parties: { holder: una.member }, refs: { under: c1 }, values: { epoch: 2 } });
  expect([await G.item(c1), await G.item(h2)]).toEqual([before, other]);
  expect(before).toMatchObject({ state: "accepted", parties: { performer: una.member }, refs: { termsAt: 0 } });

  // A withdrawal is another act than the end of a hold. Its one entry ends the hold under the commitment, and no other hold.
  const withdrawn = await G.did(vic, "withdraw", { on: c2 });
  expect(withdrawn.effects).toEqual([
    { effect: "state", item: c2, state: "withdrawn" },
    { effect: "hold", item: h2, change: "end", epoch: 2 },
    { effect: "attention", item: c2, members: [rita.member], reason: "withdrawn" },
  ]);
  expect((await G.item(h3)).state).toBe("held");
});

test("T4, a handover: the same accepted commitment gets a new performer only when no hold is held and on the same terms fact; the former performer is then refused, and the successor's report carries both in its authors (the report rows run on the SCRIPTED test capability)", async () => {
  // One real `issue` lane. STAND-IN: `report` asks the capability whether the commit is staged and what its ancestry is, and the
  // scripted test capability answers yes. So this shows who may report after a handover, and what the report attributes. It shows
  // nothing about staging, ancestry, a pin, or what a former performer's old credential can still do outside the lane.
  const g = await graph();
  const G = await g.goal();
  const terms = await G.fact(0);
  const c = (await G.did(rita, "offer", { fields: { offeree: una.member } })).fact.seq;
  await G.did(una, "accept", { on: c, fields: { terms } });
  const h = (await G.did(una, "take-hold", { fields: { commitment: c } })).fact.seq;
  await G.did(una, "offer-handover", { on: c, fields: { successor: vic.member } });
  // Another terms fact of this lane: the goal revised. The commitment's own terms stay the fact it was accepted on.
  const revised = (await G.did(rita, "revise", { on: 0, fields: { conditions: ["it works", "and it is fast"] } })).fact;

  // While una holds, the handover is refused. After the release it is refused on any other terms fact, and to anyone but the successor.
  expect(await G.asks(vic, "accept-handover", { on: c, fields: { terms } })).toBe("guard-failed: hold-held");
  await G.did(una, "release-hold", { on: h });
  expect([await G.asks(vic, "accept-handover", { on: c, fields: { terms: revised } }), await G.asks(rita, "accept-handover", { on: c, fields: { terms } })]).toEqual(["guard-failed: terms-differ", "guard-failed"]);
  const before = await G.item(c);
  const handed = await G.did(vic, "accept-handover", { on: c, fields: { terms } });
  expect(handed.effects).toEqual([
    { effect: "party", item: c, slot: "performer", member: vic.member },
    { effect: "party", item: c, slot: "successor", member: null },
    { effect: "attention", item: c, members: [una.member], reason: "handed-over" },
    { effect: "attention", item: c, members: [rita.member], reason: "handed-over" },
  ]);
  // The same commitment: still accepted, with the terms, the conditions and the requester it had. Only the performer changed.
  const after = await G.item(c);
  expect([after.state, after.refs, after.values, after.parties["requester"]]).toEqual(["accepted", before.refs, before.values, before.parties["requester"]]);
  expect([before.parties["performer"], after.parties["performer"], (await G.item(h)).parties["holder"]]).toEqual([una.member, vic.member, una.member]);

  // The former performer may neither hold nor report. The same report by the successor is accepted, so it was the signer that refused.
  net.capability = capable;
  const report = { fields: { commitment: c, terms, commit: COMMIT, tree: TREE } };
  expect([await G.asks(una, "take-hold", { fields: { commitment: c } }), await G.asks(una, "report", report)]).toEqual(["guard-failed", "guard-failed"]);
  const reported = await G.did(vic, "report", report);
  // Its authors are everyone the commitment was ever performed by, each with the member it acts for, in byte order of handle.
  expect(reported.effects.flatMap((e) => (e.effect === "list" && e.slot === "authors" ? [e.member.member] : []))).toEqual(["@paul", "@quinn", "@una", "@vic"]);
  expect(reported.effects.at(-2)).toEqual({ effect: "record", capability: "hold@1", kind: "pin", key: [COMMIT], state: "held", values: { commit: COMMIT } });
});
