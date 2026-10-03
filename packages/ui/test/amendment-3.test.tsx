/**
 * Contract amendment 3 (bc351fa8), lane F: advisory obligations never block
 * (R-OBL-7), check carry is shown from its `check-carried` event
 * (R-CARRY-13), and a live room has no per-change history (open point 39).
 */

import { cleanup, render, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, test } from "vitest";
import { App } from "../src/app.tsx";
import type { CheckCarriedEvent, RoomSnapshot } from "../src/room/adapter.ts";
import type { Carried, Cursor, HttpRoom, LogEntry, Obligation, Sha, Update } from "../src/room/contract.ts";
import { describeEntry } from "../src/room/live/describe.ts";
import { LiveRoom } from "../src/room/live/live-room.ts";
import { MockRoom } from "../src/room/mock/mock-room.ts";
import { DEFAULT_STEP, STEPS } from "../src/room/mock/scenario.ts";
import { World } from "../src/room/mock/world.ts";
import { laneId, renderAt, stepOf, waitFor } from "./helpers.tsx";

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

  test("a check judged and not carried is shown with why; a failed check is never judged", () => {
    const step = stepOf("Main moved: the rate limit prepares again");
    renderAt(`#/lane/${laneId(RATE, step)}/2`, { step });
    const tests = [...card("tests").querySelectorAll<HTMLElement>("[data-carry]")].map((x) => x.dataset["carry"]);
    expect(tests).toEqual(["carried", "not-carried"]);
    expect(card("tests").querySelector("[data-carry='not-carried']")!.textContent).toContain("Did not carry: The integration tree changed, so the check reruns.");
    // The advisory check failed, so there was nothing to carry and no judgment.
    expect(card("advisory-review").querySelectorAll("[data-carry]")).toHaveLength(0);
  });
});

/**
 * Review a4241e41: a carried check's reason is taken only from the event that
 * names the evidence's own destination (the generation's merge preview
 * operation and its integration) and the obligation's policy version.
 */
describe("carried check evidence binds its reason to its destination and policy (review a4241e41)", () => {
  function fixture() {
    const room = new MockRoom({ step: DEFAULT_STEP });
    const base = room.snapshot();
    const p = proposalOf(base, RATE, 2);
    if (p.preview.state !== "clean") throw new Error("the fixture needs a clean preview");
    const preview = p.preview;
    const tests = p.obligations.find((o) => o.rule === "tests")!;
    const act = base.checks.find((c) => c.lane === p.lane && c.check === "tests" && c.generation === 1)!.id;
    const reason = { code: "tree-identical", tree: sha("1"), config: `sha256:${"2".repeat(64)}`, runner: `sha256:${"3".repeat(64)}` } as const;
    const carried: Carried = {
      basis: "carried",
      act,
      kind: "check",
      from: { generation: 1, head: proposalOf(base, RATE, 1).head },
      reason: { ...reason, text: "a reason the event did not give" },
      rules: [],
    };
    /** An event for this evidence; by default it names the preview, its integration and the obligation's policy. */
    const event = (seq: number, text: string, over: Partial<Pick<CheckCarriedEvent, "op" | "integration" | "policy">> = {}) => ({
      id: `act_${seq}_aaaaaaaa` as const,
      seq,
      at: base.now,
      event: {
        type: "check-carried",
        op: preview.id,
        lane: p.lane,
        generation: 2,
        integration: preview.integration,
        obligation: tests.id,
        act,
        policy: tests.policy,
        outcome: { carried: true, reason: { ...reason, text } },
        decisions: [],
        ...over,
      } satisfies CheckCarriedEvent,
    });
    const show = (events: RoomSnapshot["checkCarries"], previewOver?: RoomSnapshot["proposals"][number]["preview"]) => {
      cleanup();
      room.snapshot = () => ({
        ...base,
        checkCarries: events,
        proposals: base.proposals.map((x) =>
          x.id === p.id
            ? { ...x, ...(previewOver ? { preview: previewOver } : {}), obligations: x.obligations.map((o) => (o.id === tests.id ? ({ ...o, evidence: [carried] } as Obligation) : o)) }
            : x,
        ),
      });
      renderAt(`#/lane/${p.lane}/2`, room);
      const text = card("tests").querySelector("[data-basis='carried'] [data-carry-reason]")!.textContent;
      expect(card("tests").textContent).not.toContain("a reason the event did not give");
      return text;
    };
    return { base, p, preview, tests, event, show };
  }

  const NONE = "No check-carried event for this carry, on this generation's integration and under this policy, is loaded here, so its reason is not shown.";
  const OTHER_OP = "op_land_77" as const;

  test("the event naming the preview, its integration and the obligation's policy gives the reason", () => {
    const f = fixture();
    expect(f.show([...f.base.checkCarries, f.event(99, "the reason the room sealed")])).toBe("Carried to generation 2 by entry 99: the reason the room sealed.");
  });

  test("successive integrations: only the event for the current integration counts, earlier or later", () => {
    const f = fixture();
    const earlier = f.event(98, "carried to an earlier integration", { op: "op_preview_5", integration: sha("5") });
    const current = f.event(99, "carried to the current integration");
    const later = f.event(100, "carried to a landing integration", { op: OTHER_OP, integration: sha("6") });
    expect(f.show([earlier, current, later])).toBe("Carried to generation 2 by entry 99: carried to the current integration.");
    // The same integration under another operation is not this destination.
    expect(f.show([f.event(101, "same commit, other operation", { op: OTHER_OP })])).toBe(NONE);
    // The preview is recomputed under the same operation when main moves: its earlier integration is not this one.
    expect(f.show([f.event(102, "same preview, earlier integration", { integration: sha("5") })])).toBe(NONE);
    // Every judgment stays in the history list.
    f.show([earlier, current, later]);
    expect(card("tests").querySelectorAll("[data-carry='carried']")).toHaveLength(3);
  });

  test("policy activation: an event under an earlier policy is history, not the current reason", () => {
    const f = fixture();
    const old = "act_1_deadbeef" as const;
    expect(f.tests.policy).not.toBe(old);
    const before = f.event(98, "carried under the earlier policy", { policy: old });
    expect(f.show([before])).toBe(NONE);
    const judged = card("tests").querySelector<HTMLElement>("[data-carry='carried']")!;
    expect(judged.textContent).toContain("under another policy version, so it does not count under this one");
    // Judged again under the new version, with a new event: that one is the reason.
    expect(f.show([before, f.event(99, "carried under the current policy")])).toBe("Carried to generation 2 by entry 99: carried under the current policy.");
  });

  test("the reviewer's case: an older-policy event for another integration is not shown as the reason", () => {
    const f = fixture();
    expect(f.show([f.event(99, "a reason from a different policy and integration", { op: "op_land_99", integration: sha("4"), policy: "act_1_deadbeef" })])).toBe(NONE);
  });

  test("only historical events loaded, or none: no reason is shown", () => {
    const f = fixture();
    expect(f.show([f.event(98, "carried to an earlier integration", { op: "op_preview_5", integration: sha("5") })])).toBe(NONE);
    expect(f.show([])).toBe(NONE);
  });

  test("a preview without an integration cannot identify the destination, so no event is matched", () => {
    const f = fixture();
    const pending = { id: f.preview.id, kind: "preview", updatedAt: f.preview.updatedAt, lane: f.preview.lane, generation: f.preview.generation, state: "pending" } as const;
    expect(f.show([f.event(99, "carried to the current integration")], pending)).toBe(NONE);
  });
});

describe("a failed required check keeps the landing waiting (review a4241e41)", () => {
  test("preparing never carries a failed required check, and the obligation waits", () => {
    const w = new World();
    const stop = STEPS.findIndex((s) => s.label.startsWith("@cedar lands the logging lane"));
    expect(stop).toBeGreaterThan(0);
    for (const step of STEPS.slice(0, stop)) {
      w.t = step.minute;
      step.run(w);
    }
    w.check("@ci", "L3", 1, false, "required tests failed");
    const failed = w.checks.at(-1)!;
    expect(failed.ok).toBe(false);
    w.land("@cedar", "L3");
    w.prepare("L3");
    expect(w.checkCarries.filter((c) => c.event.act === failed.id)).toEqual([]);
    expect(w.checkCarries.some((c) => c.event.lane === w.lane("L3").id && c.event.outcome.carried)).toBe(false);
    const op = w.landOp("L3");
    expect(op.state).toBe("preparing");
    expect(op.state === "preparing" && op.waiting).toEqual([failed.obligation]);
  });

  test("control: a failed advisory check still never holds up preparation", () => {
    const s = new MockRoom({ step: stepOf("@ash lands the rate limit") }).snapshot();
    const p = proposalOf(s, RATE, 2);
    const advisory = p.obligations.find((o) => o.rule === "advisory-review")!;
    const latest = s.checks.filter((c) => c.obligation === advisory.id).at(-1)!;
    expect(latest.ok).toBe(false);
    const op = s.landOps.find((o) => o.lane === p.lane)!;
    expect(op.state === "preparing" && op.waiting).toEqual([]);
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
