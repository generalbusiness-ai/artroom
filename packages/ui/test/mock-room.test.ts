import { describe, expect, test } from "vitest";
import { MockRoom } from "../src/room/mock/mock-room.ts";
import { STEPS } from "../src/room/mock/scenario.ts";
import { isCarried, isRefusal } from "../src/room/contract.ts";

const stepOf = (label: string) => STEPS.findIndex((s) => s.label.startsWith(label));

describe("mock room", () => {
  test("replay is deterministic", () => {
    const a = new MockRoom({ step: 20 }).snapshot();
    const b = new MockRoom({ step: 20 }).snapshot();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test("overlap is shown from claims, before any code", () => {
    const s = new MockRoom({ step: stepOf("@birch claims again") }).snapshot();
    expect(s.proposals).toHaveLength(0);
    const ash = s.lanes.find((l) => l.goal === "Rate-limit /api/login")!;
    expect(ash.overlaps).toEqual([expect.objectContaining({ mine: "src/lib/authz/check.ts", theirs: "src/lib/authz/**", certain: true })]);
  });

  test("a policy refusal names its rule and fix", () => {
    const s = new MockRoom({ step: stepOf("Policy refuses") }).snapshot();
    const r = s.feed.find((f) => f.type === "refusal")!.refusal!;
    expect(r.rule).toBe("agents-stay-out-of-migrations");
    expect(r.fix).toMatch(/Leave migrations/);
  });

  test("generation 2 carries one verdict and not the other", () => {
    const s = new MockRoom({ step: stepOf("@ash proposes generation 2") }).snapshot();
    const lane = s.lanes.find((l) => l.goal === "Rate-limit /api/login")!;
    const p = s.proposals.find((x) => x.lane === lane.lane && x.generation === 2)!;
    const platform = p.obligations.find((o) => o.rule === "platform-review")!;
    expect(platform.state).toBe("met");
    const ev = platform.evidence[0]!;
    expect(isCarried(ev) && ev.from.generation).toBe(1);
    expect(isCarried(ev) && ev.reason.text).toBe("reviewed paths and declared dependencies unchanged");
    const security = p.obligations.find((o) => o.rule === "security-review")!;
    expect(security.state).toBe("open");
    expect(p.notCarried.map((n) => n.code)).toEqual(["dependency-changed", "integration-changed"]);
    expect(p.notCarried[0]!.paths).toEqual(["src/lib/authz/check.ts"]);
    expect(s.attention.filter((a) => a.open).map((a) => a.why)).toContain("evidence-invalidated");
  });

  test("an unresolved publication holds the slot; the next landing waits ready", () => {
    const s = new MockRoom({ step: stepOf("Rate limit is ready") }).snapshot();
    expect(s.slot.state).toBe("held");
    expect(s.landOps.map((o) => o.state).sort()).toEqual(["ready", "unresolved"]);
    const sam = new MockRoom({ step: stepOf("Rate limit is ready"), viewer: "@sam" }).snapshot();
    expect(sam.attention.some((a) => a.open && a.why === "publication-unresolved")).toBe(true);
  });

  test("lease expiry hands the lane to another agent, who recuts it", () => {
    const end = new MockRoom().snapshot();
    const lane = end.lanes.find((l) => l.goal === "Move session checks into authz")!;
    expect(lane.state).toBe("held");
    expect(lane.state === "held" && lane.lease.holder).toBe("@cedar");
    expect(lane.state === "held" && lane.lease.generation).toBe(2);
    const p = end.proposals.filter((x) => x.lane === lane.lane);
    expect(p.map((x) => x.preview.state)).toEqual(["conflict", "clean"]);
    expect(end.landOps.every((o) => o.state === "landed")).toBe(true);
    expect(end.log.publishedThrough).toBe(end.log.head - 1);
  });

  test("the viewer's review is refused when they are not a reviewer this generation needs", async () => {
    const room = new MockRoom({ viewer: "@sam" });
    const s = room.snapshot();
    const lane = s.lanes.find((l) => l.goal === "Move session checks into authz")!;
    const p = s.proposals.find((x) => x.lane === lane.lane && x.generation === 2)!;
    const r = await room.review(p, { verdict: "approve", scope: ["src/**"], dependsOn: [], text: "ok" });
    expect(isRefusal(r) && r.rule).toBe("not-authorized-reviewer");
    expect(isRefusal(r) && r.fix).toBe("Ask @security to review it.");
  });

  test("the viewer's approval meets the obligation and survives replay", async () => {
    const room = new MockRoom({ viewer: "@maya" });
    const s = room.snapshot();
    const lane = s.lanes.find((l) => l.goal === "Move session checks into authz")!;
    const p = s.proposals.find((x) => x.lane === lane.lane && x.generation === 2)!;
    const r = await room.review(p, { verdict: "approve", scope: ["src/lib/authz/**", "src/api/session.ts"], dependsOn: [], text: "Reads well." });
    expect(isRefusal(r)).toBe(false);
    const after = room.snapshot();
    const q = after.proposals.find((x) => x.lane === lane.lane && x.generation === 2)!;
    expect(q.obligations.every((o) => o.state === "met")).toBe(true);
    expect(after.attention.filter((a) => a.open)).toHaveLength(0);
  });

  test("no snapshot carries a token", () => {
    for (let i = 0; i < STEPS.length; i++) {
      const json = JSON.stringify(new MockRoom({ step: i }).snapshot());
      expect(json).not.toMatch(/"(token|bearer|secret)"/i);
    }
  });
});
