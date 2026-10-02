/**
 * Checker review f2212c63: the two external-effect windows the crash tests
 * did not reach. These began as the checker's workerd probes
 * (checker-unknown-outcome.test.ts and checker-push-window.test.ts), which
 * showed the faults; here they assert the corrected outcome.
 *
 * 1. A reply lost after the room admitted the act, through all of the
 *    client's attempts. The tool must not settle on an unknown outcome, and
 *    must never sign a replacement: it sends the stored envelope until the
 *    room answers, across a reset.
 * 2. A reset after the push reached the fork and before the tool recorded
 *    it. The commit and the head it replaces are saved before the first
 *    push, so a rerun finds that commit on the fork, or pushes the same one.
 */

import { runInDurableObject } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { artroomError } from "@generalbusiness/artroom-client";
import type { ActRecord, LaneId, Result, SignedEnvelope } from "@generalbusiness/artroom-contract";
import { pushChange } from "../vendor/artroom/packages/room/test/workerd/support.ts";
import { RpcWire } from "../vendor/artroom/packages/client/src/wire.ts";
import { controls, type CrashPoint } from "../src/agent.ts";
import { agentActs, landed, logOf, runThroughCrashes, setup, stub, TASK } from "./support.ts";

const send = RpcWire.prototype.submit;
const read = RpcWire.prototype.read;

/** Every `propose` the client hands the binding, how many of their replies to drop after the room has them, and how many reads to fail. */
const wire = { proposes: [] as string[], drop: 0, failReads: 0 };

beforeEach(() => {
  controls.reset();
  controls.retryMs = 0;
  wire.proposes = [];
  wire.drop = 0;
  wire.failReads = 0;
  RpcWire.prototype.read = function (this: RpcWire, ...args: Parameters<RpcWire["read"]>) {
    if (wire.failReads > 0) {
      wire.failReads--;
      return Promise.reject(artroomError("unavailable", "review f2212c63: read failed"));
    }
    return read.apply(this, args);
  } as RpcWire["read"];
  // The real Room admits the act; then the reply is lost, as a dropped connection would lose it.
  RpcWire.prototype.submit = async function (this: RpcWire, act: SignedEnvelope): Promise<Result<ActRecord>> {
    const receipt = await send.call(this, act);
    if (act.envelope.kind === "propose") {
      wire.proposes.push(JSON.stringify(act));
      if (wire.drop > 0) {
        wire.drop--;
        throw artroomError("unavailable", "review f2212c63: reply lost after admission", { retryAfterMs: 0, maybeRecorded: true });
      }
    }
    return receipt;
  };
});

afterEach(() => {
  RpcWire.prototype.submit = send;
  RpcWire.prototype.read = read;
});

/** The run's outcome, as the other tests check it: one act of each kind, the receipts, the landing, no error. */
async function expectLanded(s: Awaited<ReturnType<typeof setup>>) {
  expect(agentActs(await logOf(s.room), s.agentKey)).toEqual({ acts: ["claim", "propose", "land"], refusals: [] });
  const lane = (await stub(s.agentName).lane())!;
  expect(lane.acts.map((a) => a.kind)).toEqual(["claim", "propose", "land"]);
  expect((await landed(s)).state).toBe("landed");
  expect(s.room.world.artifacts.main).toBe(lane.head);
  expect((await stub(s.agentName).transcript()).filter((e) => e.error)).toEqual([]);
  expect(await stub(s.agentName).outbox()).toEqual(["claim", "propose", "land"].map((kind) => ({ kind, resolved: true })));
}

describe("review f2212c63, finding 1: an act whose reply is lost through every client attempt", () => {
  it("the checker's case: the room admits propose, all four replies are lost, the Agent is reset while the outcome is unknown; the same request recovers the original receipt", async () => {
    const s = await setup();
    wire.drop = Infinity;
    controls.crashes.add("propose:unresolved");
    let first: unknown;
    try {
      await stub(s.agentName).run(TASK, "checker-unknown");
    } catch (e) {
      first = e;
    }
    // The tool did not settle on the unknown outcome: the reset came while it waited to send again.
    expect(String((first as Error).message)).toMatch(/propose:unresolved/);
    expect(wire.proposes).toHaveLength(4);
    expect(agentActs(await logOf(s.room), s.agentKey).acts).toEqual(["claim", "propose"]);
    expect(await stub(s.agentName).outbox()).toEqual([
      { kind: "claim", resolved: true },
      { kind: "propose", resolved: false },
    ]);
    // The wire is restored; the caller retries the same request.
    wire.drop = 0;
    const out = await runThroughCrashes(s.agentName, "checker-unknown");
    expect(out).toMatchObject({ status: "done", crashes: [] });
    // Five sends of one signed envelope, never a replacement; the room answered the fifth from its idempotency record.
    expect(wire.proposes).toHaveLength(5);
    expect(new Set(wire.proposes).size).toBe(1);
    expect(controls.sends.get("propose")).toEqual(["prepared", "replayed"]);
    await expectLanded(s);
  });

  it("after the reset, connecting to the room fails once: the tool connects again, and recovers the receipt", async () => {
    const s = await setup();
    wire.drop = Infinity;
    controls.crashes.add("propose:unresolved");
    const first = await stub(s.agentName).run(TASK, "task-1").then(
      () => "",
      (e: Error) => e.message,
    );
    expect(first).toMatch(/propose:unresolved/);
    wire.drop = 0;
    // The new instance's first connection reads the room's log; that read fails.
    wire.failReads = 1;
    const out = await runThroughCrashes(s.agentName, "task-1");
    expect(out).toMatchObject({ status: "done", crashes: [] });
    expect(wire.failReads).toBe(0);
    expect(new Set(wire.proposes).size).toBe(1);
    await expectLanded(s);
  });

  it("replies lost for one round of client attempts, then restored: the same run sends the stored envelope again and goes on", async () => {
    const s = await setup();
    wire.drop = 4;
    const out = await runThroughCrashes(s.agentName, "task-1");
    expect(out).toMatchObject({ status: "done", crashes: [] });
    expect(wire.proposes).toHaveLength(5);
    expect(new Set(wire.proposes).size).toBe(1);
    expect(controls.sends.get("propose")).toEqual(["prepared", "replayed"]);
    await expectLanded(s);
  });

  it("a definite failure (an error that says nothing was recorded) settles the tool at once, and is not sent again", { timeout: 15_000 }, async () => {
    const s = await setup();
    RpcWire.prototype.submit = async function (this: RpcWire, act: SignedEnvelope): Promise<Result<ActRecord>> {
      if (act.envelope.kind === "propose") {
        wire.proposes.push(JSON.stringify(act));
        throw artroomError("forbidden", "review f2212c63: refused before admission");
      }
      return send.call(this, act);
    };
    const out = await runThroughCrashes(s.agentName, "task-1");
    expect(out.answer).toMatch(/Stopped: artroom_propose failed/);
    expect(wire.proposes).toHaveLength(1);
    expect(controls.sends.get("propose")).toEqual(["prepared"]);
    expect(agentActs(await logOf(s.room), s.agentKey).acts).toEqual(["claim"]);
    expect(await stub(s.agentName).outbox()).toEqual([
      { kind: "claim", resolved: true },
      { kind: "propose", resolved: true },
    ]);
  });
});

describe("review f2212c63, finding 2: the push and the record of it", () => {
  /** Count what the write tool asks of the fork. */
  function counting() {
    const ws = controls.workspace!;
    const seen = { prepared: 0, pushed: [] as string[] };
    controls.workspace = {
      prepare: (lane, files) => (seen.prepared++, ws.prepare(lane, files)),
      head: (lane) => ws.head(lane),
      push: (lane, commit, expected) => (seen.pushed.push(commit), ws.push(lane, commit, expected)),
    };
    return seen;
  }

  it("the checker's case: the Agent is reset inside the push, after the fork has the commit and before the call returns; the rerun finds that commit and lands it", async () => {
    const s = await setup();
    const seen = counting();
    const ws = controls.workspace!;
    await runInDurableObject(stub(s.agentName), async (_instance, state) => {
      controls.workspace = {
        ...ws,
        push: (lane, commit, expected) => {
          ws.push(lane, commit, expected);
          controls.workspace = ws;
          state.abort("review f2212c63: the fork has the commit; the push has not returned");
          throw new Error("review f2212c63: the fork has the commit; the push has not returned");
        },
      };
    });
    const out = await runThroughCrashes(s.agentName, "checker-push");
    expect(out.crashes).toHaveLength(1);
    expect(out.status).toBe("done");
    expect(seen.prepared).toBe(1);
    expect(seen.pushed).toHaveLength(1);
    const lane = (await stub(s.agentName).lane())!;
    expect(lane.head).toBe(seen.pushed[0]);
    await expectLanded(s);
  });

  it.each<CrashPoint>(["write:before-push", "write:after-push", "write:after-record"])("reset at %s: one commit prepared, pushed once, and landed", async (point) => {
    const s = await setup();
    const seen = counting();
    controls.crashes.add(point);
    const out = await runThroughCrashes(s.agentName, "task-1");
    expect(out.crashes).toEqual([`injected crash at ${point}`]);
    expect(seen.prepared).toBe(1);
    expect(seen.pushed).toHaveLength(1);
    expect((await stub(s.agentName).lane())!.head).toBe(seen.pushed[0]);
    await expectLanded(s);
  });

  it("the fork moved between preparation and the push: the tool pushes nothing over it, and fails", async () => {
    const s = await setup();
    const seen = counting();
    controls.crashes.add("write:before-push");
    let lane: LaneId | undefined;
    try {
      await stub(s.agentName).run(TASK, "task-1");
    } catch {
      lane = (await stub(s.agentName).lane())!.lane as LaneId;
    }
    const other = pushChange(s.room, lane!, { "docs/other.md": "Someone else.\n" });
    const out = await runThroughCrashes(s.agentName, "task-1");
    expect(out.answer).toMatch(/Stopped: artroom_write failed: [^]*fork moved/);
    expect(controls.workspace!.head(lane!)).toBe(other);
    expect(seen.prepared).toBe(1);
    expect(agentActs(await logOf(s.room), s.agentKey).acts).toEqual(["claim"]);
  });
});
