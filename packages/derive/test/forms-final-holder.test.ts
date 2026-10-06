import { expect, test } from "vitest";
import type { Entry } from "@generalbusiness/artroom-contract";
import { entryHash } from "@generalbusiness/artroom-bytes";
import { FoldError, applyEntry, drawsOf, stateDigest } from "../src/index.ts";
import { on, valid } from "./fixtures.ts";
import { OWNER, TELL, Works, changed, opened, works } from "./fixtures-holds.ts";

// Made-up platform data and callback rules in memory. These witnesses run
// the real judges, admission and fold; no Artroom platform scope or host is reached.
const clause = { applied: [{ code: "after", row: "P16", most: { effects: 0, operations: ["tidy"] } }] };
const definition = valid(changed(works, (data) => {
  data.items.job.refs.peer = { fixed: true, required: true, to: { type: "scope", kind: "lane" } };
  data.receives.start.effects.push({ ref: { slot: "peer", from: { sender: true } } });
  data.acts.finish.sends = [{ tell: { to: { slot: "peer" }, message: "hello", fields: {}, result: clause } }];
  data.acts.ask = { ...data.acts.finish, effects: [] };
  data.outcomes.step.send.result = clause;
}));
const started = () => {
  const s = new Works(definition);
  s.script.begin = ({ resolved }) => opened(0, "step", 1, resolved.self);
  expect(s.start()).toBe("written");
  const job = s.last.seq;
  return { s, job, step: s.opened()[0]! };
};

test("a no-account result clause cannot draw a retained positive count from a final holder: nothing is written, the result stays offered, and the fold rejects the same draw", () => {
  const { s, job, step } = started();
  expect(s.outcome(step, 1, "unknown")).toBe("written");
  expect(s.does("finish", on(s, job))).toBe("written");
  const sent = s.last.seq;
  expect([s.state.account(sent, 0), s.item(job).state, s.state.holder(job)?.operations?.["tidy"]]).toEqual([null, "done", 1]);
  s.script.after = () => opened(0, "tidy", 1, job);
  const before = [s.entries.length, stateDigest(s.state.all())];
  expect([s.answered(sent), s.entries.length, stateDigest(s.state.all()), s.state.request(sent, 0)!.result]).toEqual(["unavailable", ...before, null]);

  // The fold and a replay use the same boundary: even this sealed-looking result cannot spend the final holder's count.
  const seq = s.last.seq + 1;
  const invalid: Entry = { ...s.last, seq, prev: s.head.hash, input: { type: "delivery", from: s.fact(0), n: 0, message: { class: "result", of: { from: s.fact(sent), n: 0 }, outcome: "applied" }, clause: "applied" },
    effects: [{ effect: "operation", k: 0, owner: OWNER, kind: "tidy", attempts: 1, for: job }, { effect: "attempt", operation: `${seq}:0`, attempt: 1, result: "opened", selected: null }], sends: [] };
  const copy = s.replay();
  expect(drawsOf(copy, definition, invalid)).toMatchObject({ fault: "no-holder" });
  expect(() => applyEntry(copy, definition, invalid, entryHash(invalid))).toThrow(FoldError);
  expect(stateDigest(copy.all())).toBe(before[1]);
});

test("a no-account result clause may draw from a holder that is still open", () => {
  const { s, job } = started();
  expect(s.does("ask", on(s, job))).toBe("written");
  const sent = s.last.seq;
  expect([s.state.account(sent, 0), s.item(job).state]).toEqual([null, "open"]);
  s.script.after = () => opened(0, "tidy", 1, job);
  expect([s.answered(sent), s.state.operation(s.opened()[0]!)!.for, s.state.holder(job)?.operations?.["tidy"] ?? 0]).toEqual(["written", job, 0]);
});

test("a final holder still funds an own-account result clause and its own outcome's late cleanup", () => {
  const answered = started();
  answered.s.script.report = () => TELL;
  expect(answered.s.does("finish", on(answered.s, answered.job))).toBe("written");
  expect(answered.s.outcome(answered.step, 1, "confirmed")).toBe("written");
  const sent = answered.s.last.seq;
  expect(answered.s.state.account(sent, 0)).toBe(answered.job);
  answered.s.script.after = () => opened(0, "tidy", 1, answered.job);
  expect([answered.s.answered(sent), answered.s.state.operation(answered.s.opened()[0]!)!.for]).toEqual(["written", answered.job]);

  const late = started();
  expect(late.s.outcome(late.step, 1, "unknown")).toBe("written");
  expect(late.s.does("finish", on(late.s, late.job))).toBe("written");
  late.s.script.derives = (_kind, _given, operation) => ({ effects: [], sends: [], opens: [{ owner: OWNER, kind: "tidy", attempts: 1, for: operation.for! }] });
  expect([late.s.outcome(late.step, 1, "confirmed"), late.s.state.operation(late.s.opened()[0]!)!.for]).toEqual(["written", late.job]);
});
