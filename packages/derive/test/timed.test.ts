import { describe, expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import { clockOf, judgeTimed, nextDue, validateDefinition } from "../src/index.ts";
import { Scope, fields, keys, lane, laneDefinition, on, t, valid } from "./fixtures.ts";

const { rita, una, vic, sam } = keys;

/** Two commitments, and a hold under each, both opened at T0: holds 6 and 7 share the deadline T0 + 600 s. */
function twoHolds(definition = laneDefinition): Scope {
  const s = new Scope(definition);
  for (const performer of [una, vic]) {
    const commitment = s.did(rita, "offer", { fields: { intent: 0 }, expected: { intent: 1 } }).seq;
    s.did(rita, "assign", { ...on(s, commitment), ...fields({ performer: performer.member }) });
  }
  s.did(una, "take-hold", { fields: { commitment: 2 }, expected: { commitment: 2 } });
  s.did(vic, "take-hold", { fields: { commitment: 4 }, expected: { commitment: 2 } });
  return s;
}
const remark = (s: Scope, reading = s.now) => s.act(sam, "remark", { on: 0, fields: { text: "now" }, notAfter: t(900) }, { reading });
const end = { item: 6, rule: "hold-end", due: t(600) };

describe("the order of due transitions (section 5.2)", () => {
  test("a transition is due when its deadline is not later than the reading; of two items with one deadline the lower ID is next", () => {
    const s = twoHolds();
    expect([s.item(6).values["until"], s.item(7).values["until"]]).toEqual([t(600), t(600)]);
    expect(nextDue(s.state, laneDefinition, t(599))).toBeNull();
    expect(nextDue(s.state, laneDefinition, t(600))).toEqual(end);
  });

  test("of two rules on one item with one deadline, the rule whose name is first in byte order is next", () => {
    // U+E000 sorts before U+1F600 by UTF-8 bytes and after it by UTF-16 code units.
    const rule = lane.timed["hold-end"]!;
    const s = twoHolds(valid(validateDefinition({ ...lane, timed: { "\u{1F600}": rule, "": rule } }, PROPOSED_BOUNDS)));
    expect(nextDue(s.state, s.definition, t(600))).toEqual({ item: 6, rule: "", due: t(600) });
  });

  test("an act meets `due` at a reading where a transition is due, and is judged once the drain has applied it", () => {
    const s = twoHolds();
    expect(remark(s, t(599)).result).toBe("write");
    const head = s.head;
    s.now = t(600);
    expect(remark(s)).toEqual({ result: "due", next: end });
    expect(s.head).toEqual(head);
    // The drain applies each as its own entry, lower ID first; each is the exception for itself only.
    expect(s.drain().map((j) => j.result)).toEqual(["write", "write"]);
    expect(s.entries.slice(-2).map(({ entry }) => entry.input)).toEqual([{ type: "timed", ...end }, { type: "timed", ...end, item: 7 }]);
    expect(s.entries.at(-2)!.entry.effects.slice(0, 2)).toEqual([{ effect: "state", item: 6, state: "ended" }, { effect: "hold", item: 6, change: "end", epoch: 2 }]);
    expect(remark(s).result).toBe("write");
    expect(s.replay().snapshot()).toBe(s.state.snapshot());
  });

  test("a selected transition is written only when it still holds its deadline, the reading has reached it, and nothing earlier in the order is due", () => {
    const s = twoHolds();
    const judge = (selected: typeof end, reading: string) => judgeTimed(s.state, laneDefinition, selected, { clock: clockOf(s.state, reading), bounds: PROPOSED_BOUNDS });
    expect(judge(end, t(599))).toEqual({ result: "dropped", failed: "reached" });
    expect(judge({ ...end, item: 7 }, t(600))).toEqual({ result: "dropped", failed: "next" });
    expect(judge({ ...end, due: t(601) }, t(601))).toEqual({ result: "dropped", failed: "held" });
    // All three hold for item 6, although item 7 is also due, later in the order.
    const first = judge(end, t(600));
    expect(first.result).toBe("write");
    if (first.result === "write") s.seal(first.draft, t(600));
    // Item 6 no longer holds the deadline: the same selection is dropped. Item 7 is now the next.
    expect(judge(end, t(600))).toEqual({ result: "dropped", failed: "held" });
    expect(judge({ ...end, item: 7 }, t(600)).result).toBe("write");
  });
});

describe("a hold's epoch (section 6.8)", () => {
  test("a renewal moves the end; the epoch rises only when another member takes the hold, and that member joins the attribution", () => {
    const s = twoHolds();
    s.now = t(300);
    const own = s.did(una, "renew", on(s, 6));
    expect(own.effects.at(-1)).toEqual({ effect: "hold", item: 6, change: "renew", epoch: 1 });
    // The deadline is derived from the commit's reading, so at the old end only hold 7 is due.
    expect(s.item(6).values["until"]).toBe(t(900));
    expect(nextDue(s.state, laneDefinition, t(600))).toEqual({ ...end, item: 7 });
    const taken = s.did(vic, "renew", on(s, 6));
    expect(taken.effects.at(-1)).toEqual({ effect: "hold", item: 6, change: "renew", epoch: 2 });
    // Commitment 2 is the item hold 6 is under: una, for paul, held it; then vic, for quinn. Its revision did not rise for that.
    expect([s.item(2).attributed.map((m) => m.member), s.item(2).revision]).toEqual([["@una", "@paul", "@vic", "@quinn"], 2]);
    expect(s.replay().snapshot()).toBe(s.state.snapshot());
  });
});

describe("the clock (section 5.3)", () => {
  test("when the clock is behind, what is due is judged at the previous entry's time, and nothing that judges time is written", () => {
    const s = twoHolds();
    s.now = t(600);
    const first = judgeTimed(s.state, laneDefinition, end, s.context());
    if (first.result === "write") s.seal(first.draft);
    // The head's time is T0 + 600 s. Item 7 is still due at that time. The clock now reads earlier than the head.
    const behind = clockOf(s.state, t(10));
    expect(behind).toEqual({ reading: t(10), behind: true, asOf: t(600) });
    // By the reading alone nothing would be due. The previous entry's time makes item 7 due: more, never fewer.
    expect(nextDue(s.state, laneDefinition, behind.reading)).toBeNull();
    expect(nextDue(s.state, laneDefinition, behind.asOf)).toEqual({ ...end, item: 7 });
    // A timed entry is never clamped, and no act passes the due transition.
    expect(judgeTimed(s.state, laneDefinition, { ...end, item: 7 }, { clock: behind, bounds: PROPOSED_BOUNDS })).toEqual({ result: "unavailable", reason: "clock-behind" });
    expect(remark(s, t(10))).toEqual({ result: "due", next: { ...end, item: 7 } });
    // With nothing due, an act still judges its notAfter and its grant on the clock, so it is not written behind.
    expect(s.drain().map((j) => j.result)).toEqual(["write"]);
    expect(remark(s, t(10))).toEqual({ result: "unavailable", reason: "clock-behind" });
    expect(remark(s, t(600)).result).toBe("write");
  });
});
