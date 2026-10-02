/**
 * The spike: a pi-durable agent in a Durable Object claims a lane, pushes a
 * change, proposes it and lands it in lane A's Room, over a service binding,
 * under a delegation. Then the same run with the agent's Durable Object
 * reset at each point of each act, and two ablations.
 *
 * The room and its fakes are in ./support.ts.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { controls, type CrashPoint } from "../src/agent.ts";
import { agentActs, landed, logOf, runThroughCrashes, setup, stub, TASK } from "./support.ts";

beforeEach(() => controls.reset());

describe("a pi-durable agent through claim, propose and land", () => {
  it("runs the task end to end: one act of each kind, landed on main, the lane document matching the receipts", async () => {
    const s = await setup();
    const out = await runThroughCrashes(s.agentName, "task-1");
    expect(out).toMatchObject({ status: "done", crashes: [] });
    const log = await logOf(s.room);
    expect(agentActs(log, s.agentKey)).toEqual({ acts: ["claim", "propose", "land"], refusals: [] });
    const op = await landed(s);
    expect(op.state).toBe("landed");
    const lane = (await stub(s.agentName).lane())!;
    expect(s.room.world.artifacts.main).toBe(lane.head);
    expect(lane.acts.map((a) => a.kind)).toEqual(["claim", "propose", "land"]);
    // The room's attention reaches the conversation as a steer, exactly once by its request ID.
    const report = await stub(s.agentName).run(`Your landing ${lane.landOp} has landed.`, `attention:${lane.landOp}`);
    expect(report.answer).toMatch(/is landed/);
    const again = await stub(s.agentName).run(`Your landing ${lane.landOp} has landed.`, `attention:${lane.landOp}`);
    expect(again).toEqual(report);
    const t = await stub(s.agentName).transcript();
    expect(t.filter((e) => e.role === "user").length).toBe(2);
  });

  it("the same request ID after the run finished returns the same answer and sends nothing", async () => {
    const s = await setup();
    const first = await runThroughCrashes(s.agentName, "task-1");
    const sends = new Map(controls.sends);
    const second = await stub(s.agentName).run(TASK, "task-1");
    expect(second).toEqual({ status: first.status, answer: first.answer });
    expect(controls.sends).toEqual(sends);
  });
});

const points: CrashPoint[] = [
  "claim:before-send",
  "claim:after-send",
  "claim:after-receipt",
  "write:before-push",
  "write:after-push",
  "write:after-record",
  "propose:before-send",
  "propose:after-send",
  "propose:after-receipt",
  "land:before-send",
  "land:after-send",
  "land:after-receipt",
];

describe("crash and resume across an act: the agent's Durable Object is reset (ctx.abort) at each point", () => {
  it.each(points)("reset at %s: the run resumes, each act is admitted once, no refusal, the landing lands", async (point) => {
    const s = await setup();
    controls.crashes.add(point);
    const out = await runThroughCrashes(s.agentName, "task-1");
    expect(out.crashes.length).toBe(1);
    expect(out.crashes[0]).toMatch(new RegExp(point));
    expect(out.status).toBe("done");
    const log = await logOf(s.room);
    expect(agentActs(log, s.agentKey)).toEqual({ acts: ["claim", "propose", "land"], refusals: [] });
    // One reset: the instance that ran before it, and a new one after.
    expect(controls.opens).toBe(2);
    const [kind, when] = point.split(":");
    // Before the send, the rerun sent the envelope stored in the outbox; after it, the rerun found the stored outcome and sent nothing.
    const expected = { "before-send": ["replayed"], "after-send": ["prepared"], "after-receipt": ["prepared"] }[when!];
    if (kind !== "write") expect(controls.sends.get(kind!)).toEqual(expected);
    // One commit prepared and pushed once, whatever the point.
    expect(controls.pushes).toHaveLength(1);
    expect(await stub(s.agentName).outbox()).toEqual(["claim", "propose", "land"].map((k) => ({ kind: k, resolved: true })));
    for (const other of ["claim", "propose", "land"].filter((k) => k !== kind)) expect(controls.sends.get(other)).toEqual(["prepared"]);
    expect((await landed(s)).state).toBe("landed");
    const lane = (await stub(s.agentName).lane())!;
    expect(lane.acts.map((a) => a.kind)).toEqual(["claim", "propose", "land"]);
    expect(s.room.world.artifacts.main).toBe(lane.head);
    // The model saw no error: the interrupted call reran and returned the original receipt.
    const t = await stub(s.agentName).transcript();
    expect(t.filter((e) => e.error)).toEqual([]);
  });
});

describe("ablations: each half of the rule is needed", () => {
  it("without replay (pi-durable's default, unsafe): after a reset past the room, the model is told the call was interrupted; the act stands in the room, unknown to the conversation", async () => {
    const s = await setup();
    controls.replay = "unsafe";
    controls.crashes.add("propose:after-send");
    const out = await runThroughCrashes(s.agentName, "task-1");
    expect(out.answer).toMatch(/Stopped: artroom_propose failed: [^]*was interrupted and may have partially run/);
    expect(agentActs(await logOf(s.room), s.agentKey).acts).toEqual(["claim", "propose"]);
    const lane = (await stub(s.agentName).lane())!;
    expect(lane.acts.map((a) => a.kind)).toEqual(["claim"]);
  });

  it("without the stored envelope (no outbox): the rerun rebuilds the act from fresh reads, the bytes differ, and the room refuses it as idempotency-mismatch", async () => {
    const s = await setup();
    controls.outbox = false;
    controls.crashes.add("propose:after-send");
    const out = await runThroughCrashes(s.agentName, "task-1");
    expect(out.answer).toMatch(/Stopped: artroom_propose failed: Refused: idempotency-mismatch/);
    expect(controls.sends.get("propose")).toEqual(["prepared", "prepared"]);
    const acts = agentActs(await logOf(s.room), s.agentKey);
    // Still no double act, because the key is the same; but the receipt is lost to the conversation.
    expect(acts.acts).toEqual(["claim", "propose"]);
  });
});

describe("ablation: neither half", () => {
  it("without the stored envelope and with a fresh key per attempt: the rerun's propose is a second act, admitted as generation 2", async () => {
    const s = await setup();
    controls.outbox = false;
    controls.taskKey = false;
    controls.crashes.add("propose:after-send");
    await runThroughCrashes(s.agentName, "task-1");
    expect(agentActs(await logOf(s.room), s.agentKey).acts).toEqual(["claim", "propose", "propose", "land"]);
    expect((await stub(s.agentName).lane())!.generation).toBe(2);
  });
});
