import { expect, test } from "vitest";
import { timeMs } from "@generalbusiness/artroom-bytes";
import { Gate, net } from "../../scope/src/testing.ts";
import { graph, onCode, rita, una } from "./support/graph.ts";
import { siteFixtureLifetime } from "../../scope/test/support/site-fixture-lifetime.ts";

// Deterministic lifetime model, not a reproduction of the 676 timeout.
// Native offer admission; scripted authority/clock and peer rules.
test("a released Site continuation cannot advance the shared clock past a new native offer deadline", async () => {
  const clock = net.clock;
  const old = siteFixtureLifetime();
  old.advance(1);
  old.advance(0.013); // Exercise a subsecond floor independently of test order.
  const legitimateAdvance = clock.now;
  const gate = new Gate(); gate.hold();
  let stopped = false;
  const continuing = old.wait(() => gate.pass()).then(() => old.advance(1800), () => { stopped = true; });
  await gate.held();
  old.release();
  expect(net.clock).toBe(clock);
  expect(clock.now).toBe(legitimateAdvance); // Release does not rewind a floor.
  try {
    const g = await graph(); onCode();
    const C = await g.change();
    expect(await C.stub.deliver(g.rules.relate(C.at, "rules", "published", { approvals: 0, checks: [], ownerMayReview: true }))).toMatchObject({ answer: "recorded" });
    const signed = await C.signed(rita, "offer", { fields: { offeree: una.member, terms: "Integrate." } });
    const sampled = timeMs(clock.now)!;
    // Client deadlines use whole seconds; legitimate earlier fixture advances
    // may leave the shared clock between those seconds.
    expect(timeMs(signed.signed.intent.notAfter)).toBe(Math.floor(sampled / 1000) * 1000 + 300_000);
    gate.release(); await continuing;
    const answer = await C.submit(signed);
    expect(answer.answer).toBe("accepted"); // Old unguarded +1800 yields expired.
    expect(stopped).toBe(true);
    expect(timeMs(clock.now)).toBe(sampled);
  } finally { gate.release(); await continuing; old.release(); }
});
