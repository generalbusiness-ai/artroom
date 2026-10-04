/**
 * Contract amendment 3 (bc351fa8), lane F, on the page: advisory obligations
 * are shown as never blocking (R-OBL-7), and check carry is shown from its
 * `check-carried` event (R-CARRY-13), whose reason is taken only from the
 * event that names the evidence's own destination and policy (review
 * a4241e41). A live room's own check-carried events are in
 * live-room.test.tsx.
 */

import { cleanup, screen, within } from "@testing-library/preact";
import { afterEach, describe, expect, test } from "vitest";
import type { CheckCarriedEvent, RoomSnapshot } from "../src/room/adapter.ts";
import type { Carried, Obligation, Sha } from "../src/room/contract.ts";
import { MockRoom } from "../src/room/mock/mock-room.ts";
import { DEFAULT_STEP } from "../src/room/mock/scenario.ts";
import { laneId, renderAt, stepOf } from "./helpers.tsx";

afterEach(() => {
  cleanup();
  location.hash = "";
});

const sha = (c: string) => c.repeat(40) as Sha;
const RATE = "Rate-limit /api/login";
const LOGGING = "Structured request logging";

const card = (rule: string) => document.querySelector<HTMLElement>(`[data-obligation='${rule}']`)!;
const region = (name: string) => screen.getByRole("region", { name });

function proposalOf(s: RoomSnapshot, goal: string, generation: number) {
  const lane = s.lanes.find((l) => l.goal === goal)!;
  return s.proposals.find((p) => p.lane === lane.lane && p.generation === generation)!;
}

describe("advisory obligations never block (R-OBL-7)", () => {
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
