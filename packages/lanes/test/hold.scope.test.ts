import { expect, test } from "vitest";
import { timeMs } from "@generalbusiness/artroom-derive";
import { graph, net, rita, soon, una, vic } from "./support/graph.ts";

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
