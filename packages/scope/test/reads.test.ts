import { describe, expect, test } from "vitest";
import { otherLane } from "@generalbusiness/artroom-derive/testing";
import { HOLD, at, found, reader, rita } from "./support.ts";

describe("reads (section 9.1)", () => {
  test("a summary lists live items and counts every item exactly, retained final ones included; a page marked incomplete is not the whole", async () => {
    const s = await found({}, { retainedItems: 2, historyEntries: 10 });
    const holds = await s.holds(3);                           // entries 1 to 9
    s.c.clock.now = at(HOLD);
    await s.alarm();                                          // entries 10 to 12: every hold has ended, and is retained
    const link = await s.did(rita, "link", { fields: { target: otherLane, about: 0 } });   // entry 13: two sends

    const summary = await s.summary();
    expect([summary.at.seq, summary.complete, summary.value.items.map((i) => i.type)]).toEqual([13, true, ["intent", "commitment", "commitment", "commitment", "link"]]);
    // No ended hold is listed. The exact counts say there are three, and no hold held.
    expect(summary.value.counts.filter(([type]) => type === "hold")).toEqual([["hold", "ended", 3], ["hold", "held", 0]]);

    // The retained holds are read by pages, at one position. The first page is not complete: alone it supports no "none" and no count.
    const first = await s.stub.items(reader, "hold");
    expect(first).toMatchObject({ ok: true, at: summary.at, complete: false, next: String(holds[1]) });
    const rest = await s.stub.items(reader, "hold", String(holds[1]));
    expect(rest).toMatchObject({ ok: true, at: summary.at, complete: true });
    expect([first, rest].map((page) => (page.ok ? page.value.map((i) => [i.id, i.state]) : page))).toEqual([[[holds[0], "ended"], [holds[1], "ended"]], [[holds[2], "ended"]]]);
    expect("next" in rest).toBe(false);

    // A history page holds at most its bound and says where the next begins.
    const page = await s.stub.history(reader);
    const last = await s.stub.history(reader, "10");
    expect([page, last].map((p) => p.ok && [p.at.seq, p.value.map((e) => e.entry.seq), p.complete, p.next])).toEqual([
      [13, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], false, "10"], [13, [10, 11, 12, 13], true, undefined],
    ]);

    // The outbox has one row for each send of the entry, by its duty ID. Nothing has dispatched them.
    const duty = { held: false, attempts: [], result: null, diagnosis: null };
    expect(await s.stub.outbox(reader)).toMatchObject({
      ok: true, at: summary.at, complete: true,
      value: [{ ...duty, duty: link.sends[0], to: otherLane, class: "request" }, { ...duty, duty: link.sends[1], to: { kind: "lane", creator: s.at, ordinal: 0 }, class: "request" }],
    });
    expect(link.sends).toEqual(["13.0", "13.1"]);
  });
});
