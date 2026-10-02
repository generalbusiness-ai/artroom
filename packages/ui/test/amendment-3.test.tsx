/**
 * Contract amendment 3 (bc351fa8), lane F: advisory obligations never block
 * (R-OBL-7), check carry is shown from its `check-carried` event
 * (R-CARRY-13), and a live room has no per-change history (open point 39).
 */

import { cleanup, render, screen, waitFor, within } from "@testing-library/preact";
import { afterEach, describe, expect, test } from "vitest";
import { App } from "../src/app.tsx";
import type { CheckCarriedEvent, RoomSnapshot } from "../src/room/adapter.ts";
import type { Carried, Cursor, HttpRoom, LogEntry, Obligation, Sha, Update } from "../src/room/contract.ts";
import { describeEntry } from "../src/room/live/describe.ts";
import { LiveRoom } from "../src/room/live/live-room.ts";
import { MockRoom } from "../src/room/mock/mock-room.ts";
import { DEFAULT_STEP } from "../src/room/mock/scenario.ts";
import { laneId, renderAt, stepOf } from "./helpers.tsx";

afterEach(() => {
  cleanup();
  location.hash = "";
});

const RATE = "Rate-limit /api/login";
const LOGGING = "Structured request logging";

const card = (rule: string) => document.querySelector<HTMLElement>(`[data-obligation='${rule}']`)!;
const region = (name: string) => screen.getByRole("region", { name });

function proposalOf(s: RoomSnapshot, goal: string, generation: number) {
  const lane = s.lanes.find((l) => l.goal === goal)!;
  return s.proposals.find((p) => p.lane === lane.lane && p.generation === generation)!;
}

describe("advisory obligations never block (R-OBL-7)", () => {
  test("the advisory obligation comes from the checker configuration; others are not advisory", () => {
    const p = proposalOf(new MockRoom({ step: DEFAULT_STEP }).snapshot(), RATE, 2);
    const llm = p.obligations.find((o) => o.rule === "advisory-review")!;
    expect(llm.kind === "check" && llm.advisory).toBe(true);
    const tests = p.obligations.find((o) => o.rule === "tests")!;
    expect(tests.kind === "check" && "advisory" in tests).toBe(false);
  });

  test("an advisory obligation is listed apart from what a landing needs, and not counted", () => {
    renderAt(`#/lane/${laneId(RATE, DEFAULT_STEP)}/2`, { step: DEFAULT_STEP });
    const needs = region("Before it can land");
    const advisory = card("advisory-review");
    expect(advisory.dataset["advisory"]).toBe("true");
    // Not in the list of what the landing needs, and not in its count.
    const blocking = needs.querySelector<HTMLElement>("ol.obligations")!;
    expect(blocking.querySelector("[data-obligation='advisory-review']")).toBeNull();
    expect(within(blocking).getAllByRole("listitem").filter((li) => li.classList.contains("obl"))).toHaveLength(3);
    expect(needs.textContent).toContain("of 3 met");
    // Its own section says it never blocks.
    const section = screen.getByRole("heading", { name: "Advisory checks" }).closest("section")!;
    expect(section.contains(advisory)).toBe(true);
    expect(section.textContent).toContain("never blocking");
    expect(advisory.textContent).toContain("Advisory");
    expect(advisory.textContent).toContain("it never blocks a landing");
  });

  test("a failing advisory check reads as advisory, not as a blocked change", () => {
    renderAt(`#/lane/${laneId(RATE, DEFAULT_STEP)}/2`, { step: DEFAULT_STEP });
    const advisory = card("advisory-review");
    expect(advisory.textContent).toContain("ran llm-review: failed");
    expect(advisory.textContent).toContain("Advisory: this failure does not block a landing.");
    expect(advisory.textContent).not.toMatch(/block(ed|s) (the|this) landing|cannot land/i);
    expect(advisory.querySelector(".badge.bad")).toBeNull();
    // The required check passed, so nothing the landing needs is shown as failing.
    expect(card("tests").textContent).toContain("ran tests: passed");
  });

  test("the room's lane card counts only what blocks, and names the advisory check as not blocking", () => {
    renderAt("#/room", { step: DEFAULT_STEP });
    const lane = document.querySelector<HTMLElement>(`[data-lane='${RATE}']`)!;
    expect(lane.textContent).toMatch(/obligations? met of 3/);
    expect(lane.querySelector("[data-advisory-count]")!.textContent).toBe("1 advisory check, not blocking");
  });

  test("the landing never waits for the advisory check, and lands while it fails", () => {
    const again = new MockRoom({ step: stepOf("Main moved: the rate limit prepares again") }).snapshot();
    const op = again.landOps.find((o) => o.state === "preparing")!;
    expect(op.state === "preparing" && op.waiting).toEqual(["obl_tests"]);
    const first = new MockRoom({ step: stepOf("Rate limit is ready") }).snapshot();
    expect(first.landOps.map((o) => o.state)).toContain("ready");
    const done = new MockRoom({ step: stepOf("The rate limit lands") }).snapshot();
    const p = proposalOf(done, RATE, 2);
    const llm = p.obligations.find((o) => o.rule === "advisory-review")!;
    expect(llm.state).toBe("open");
    const failed = done.checks.filter((c) => c.check === "llm-review" && !c.ok);
    expect(failed.some((c) => c.landOp)).toBe(true);
    expect(done.lanes.find((l) => l.goal === RATE)!.generations.find((g) => g.generation === 2)!.landed).toBeTruthy();
  });
});

describe("check carry is shown from its check-carried event (R-CARRY-13)", () => {
  test("check-carried events appear in the activity feed", () => {
    renderAt("#/room", { step: DEFAULT_STEP });
    const feed = screen.getByRole("region", { name: "Activity" });
    expect(feed.textContent).toMatch(/The check in entry \d+ carried to integration [0-9a-f]{7} \(generation 1\) because the integration tree, the checker configuration and the runner are all unchanged\./);
  });

  test("a carried check shows the reason from its event", () => {
    renderAt(`#/lane/${laneId(LOGGING, DEFAULT_STEP)}/1`, { step: DEFAULT_STEP });
    const carried = card("tests").querySelector<HTMLElement>("[data-carry='carried']")!;
    expect(carried.querySelector("[data-carry-reason]")!.textContent).toBe("It counts there: the integration tree, the checker configuration and the runner are all unchanged.");
    expect(within(carried).getByRole("button", { name: /Why/ })).toBeTruthy();
  });

  test("a check judged and not carried is shown with why", () => {
    const step = stepOf("Main moved: the rate limit prepares again");
    renderAt(`#/lane/${laneId(RATE, step)}/2`, { step });
    const tests = [...card("tests").querySelectorAll<HTMLElement>("[data-carry]")].map((x) => x.dataset["carry"]);
    expect(tests).toEqual(["carried", "not-carried"]);
    expect(card("tests").querySelector("[data-carry='not-carried']")!.textContent).toContain("Did not carry: The integration tree changed, so the check reruns.");
    const llm = card("advisory-review").querySelectorAll<HTMLElement>("[data-carry='not-carried']");
    expect(llm).toHaveLength(2);
    expect(llm[0]!.textContent).toContain("The checker uses volatile inputs, so it reruns.");
  });

  test("carried check evidence takes its reason from the event, not from the evidence record", () => {
    const room = new MockRoom({ step: DEFAULT_STEP });
    const base = room.snapshot();
    const p = proposalOf(base, RATE, 2);
    const tests = p.obligations.find((o) => o.rule === "tests")!;
    const act = base.checks.find((c) => c.lane === p.lane && c.check === "tests" && c.generation === 1)!.id;
    const carried: Carried = {
      basis: "carried",
      act,
      kind: "check",
      from: { generation: 1, head: proposalOf(base, RATE, 1).head },
      reason: { code: "tree-identical", tree: sha("1"), config: `sha256:${"2".repeat(64)}`, runner: `sha256:${"3".repeat(64)}`, text: "a reason the event did not give" },
      rules: [],
    };
    const event: CheckCarriedEvent = {
      type: "check-carried",
      op: "op_land_99",
      lane: p.lane,
      generation: 2,
      integration: sha("4"),
      obligation: tests.id,
      act,
      policy: base.policy.version!,
      outcome: { carried: true, reason: { ...carried.reason, text: "the reason the room sealed" } },
      decisions: [],
    };
    const withEvidence = (s: RoomSnapshot, events: RoomSnapshot["checkCarries"]): RoomSnapshot => ({
      ...s,
      checkCarries: events,
      proposals: s.proposals.map((x) => (x.id === p.id ? { ...x, obligations: x.obligations.map((o) => (o.id === tests.id ? ({ ...o, evidence: [carried] } as Obligation) : o)) } : x)),
    });

    room.snapshot = () => withEvidence(base, [...base.checkCarries, { id: "act_99_aaaaaaaa", seq: 99, at: base.now, event }]);
    renderAt(`#/lane/${p.lane}/2`, room);
    const reason = card("tests").querySelector("[data-basis='carried'] [data-carry-reason]")!;
    expect(reason.textContent).toBe("Carried to generation 2 by entry 99: the reason the room sealed.");
    expect(card("tests").textContent).not.toContain("a reason the event did not give");
    cleanup();

    // Without a loaded event the UI shows no reason at all, rather than the evidence record's.
    room.snapshot = () => withEvidence(base, []);
    renderAt(`#/lane/${p.lane}/2`, room);
    const none = card("tests").querySelector("[data-basis='carried'] [data-carry-reason]")!;
    expect(none.textContent).toBe("No check-carried event for this carry is loaded here, so its reason is not shown.");
    expect(card("tests").textContent).not.toContain("a reason the event did not give");
  });
});

// ------------------------------------------------------------- live room

const sha = (c: string) => c.repeat(40) as Sha;

function systemEntry(seq: number, event: LogEntry["entry"] & { type: "system" }): LogEntry {
  return { format: "artroom-log-v1", seq, prev: `sha256:${"0".repeat(64)}`, at: "2026-10-01T09:30:00Z", hash: `sha256:cccccccc${String(seq).padStart(56, "0")}`, roomSig: "sig", entry: event };
}

const LIVE_EVENTS: CheckCarriedEvent[] = [
  {
    type: "check-carried",
    op: "op_land_40",
    lane: "act_9_aaaaaaaa",
    generation: 2,
    integration: sha("d"),
    obligation: "obl_tests",
    act: "act_31_bbbbbbbb",
    policy: "act_1_cccccccc",
    outcome: { carried: true, reason: { code: "tree-identical", tree: sha("e"), config: `sha256:${"1".repeat(64)}`, runner: `sha256:${"2".repeat(64)}`, text: "the tree is the same" } },
    decisions: [],
  },
  {
    type: "check-carried",
    op: "op_land_40",
    lane: "act_9_aaaaaaaa",
    generation: 2,
    integration: sha("d"),
    obligation: "obl_lint",
    act: "act_32_dddddddd",
    policy: "act_1_cccccccc",
    outcome: { carried: false, notCarried: { act: "act_32_dddddddd", code: "runner-changed", text: "No runner environment is pinned." } },
    decisions: [],
  },
];

function liveRoom(): HttpRoom {
  const entries = LIVE_EVENTS.map((event, i) => systemEntry(41 + i, { type: "system", event }));
  const room = {
    id: "room_live",
    name: "acme/web",
    members: async () => ({ at: 42, members: [], teams: {}, delegations: [], recovery: "key_r", soleAdmin: false }),
    lanes: async () => ({ items: [], cursor: "c" as Cursor, more: false }),
    attention: async () => ({ items: [], cursor: "c" as Cursor, more: false }),
    log: async () => ({ acts: entries, cursor: "c" as Cursor, more: false, publishedThrough: 42, head: 42 }),
    explain: async () => null,
    watch: (_c: Cursor | undefined, _fn: (u: Update) => void) => ({ cursor: "c" as Cursor, close: () => {}, [Symbol.dispose]: () => {} }),
  };
  return room as unknown as HttpRoom;
}

describe("a live room", () => {
  test("describes check-carried events, carried and not, in plain sentences", () => {
    const [carried, not] = LIVE_EVENTS.map((event, i) => describeEntry(systemEntry(41 + i, { type: "system", event })));
    expect(carried!.kind).toBe("check-carried");
    expect(carried!.text).toBe("The check in entry 31 carried to integration ddddddd (generation 2) because the tree is the same.");
    expect(carried!.lane).toBe("act_9_aaaaaaaa");
    expect(carried!.op).toBe("op_land_40");
    expect(not!.text).toBe("The check in entry 32 did not carry to integration ddddddd (generation 2). No runner environment is pinned.");
  });

  test("loads check-carried events from the log and shows them in the feed", async () => {
    const live = new LiveRoom(liveRoom(), "@maya");
    await live.start();
    const s = live.snapshot()!;
    expect(s.checkCarries.map((c) => [c.seq, c.event.outcome.carried])).toEqual([
      [41, true],
      [42, false],
    ]);
    location.hash = "#/room";
    render(<App adapter={live} />);
    await waitFor(() => expect(screen.getByRole("region", { name: "Activity" }).textContent).toContain("did not carry to integration ddddddd"));
    live.stop();
  });

  test("has no per-change history: the contract has no read of a generation's commits (open point 39)", () => {
    const live = new LiveRoom(liveRoom(), "@maya");
    expect("commits" in live).toBe(false);
    expect(Object.getOwnPropertyNames(LiveRoom.prototype).filter((n) => /commit|history/i.test(n))).toEqual([]);
  });
});
