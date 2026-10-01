/**
 * The spike: a pi-durable agent in a Durable Object claims a lane, pushes a
 * change, proposes it and lands it in lane A's Room, over a service binding,
 * under a delegation. Then the same run with the agent's Durable Object
 * reset at each point of each act, and two ablations.
 *
 * The Room is lane A's (request/laneA-room at 4a7c4af6), with lane B's
 * landing engine and lane L's log publisher, over lane A's fake Artifacts
 * remotes. Its test support (vendor/.../test/workerd/support.ts) founds the
 * room, adds members and steers the fakes.
 */

import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { generateSigner, type PrivateJwk } from "@generalbusiness/artroom-client";
import type { DelegationId, LandOp, LogEntry, RosterRecord, RoomId } from "@generalbusiness/artroom-contract";
import { addMember, clock, day, iso, makeRoom, pushChange, tick, type TestRoom } from "../vendor/artroom/packages/room/test/workerd/support.ts";
import { controls, type Agent, type CrashPoint } from "../src/agent.ts";

type Agents = DurableObjectNamespace<Agent>;
const agents = () => (env as unknown as { AGENTS: Agents }).AGENTS;

const TASK = "Add docs/pi-durable.md to the repository, then land it.";

interface Setup {
  room: TestRoom;
  agentName: string;
  agentKey: string;
}

async function setup(): Promise<Setup> {
  const room = await makeRoom();
  const alice = await addMember(room, "@alice", "member");
  // The agent's own key, as a Worker secret would hold it (R-CRED-4). It never joins.
  const { signer, jwk } = await generateSigner({ extractable: true });
  const grant = await alice.ok<RosterRecord>("roster", null, { op: "delegate", to: signer.key, kinds: ["claim", "propose", "land", "release", "note"], lanes: "*", expiresAt: iso(clock.now + day) });
  controls.workspace = (lane, files) => pushChange(room, lane, files);
  controls.now = () => clock.now;
  const agentName = `agent-${crypto.randomUUID()}`;
  await stub(agentName).setup(room.id as RoomId, jwk as PrivateJwk, grant.id as DelegationId);
  return { room, agentName, agentKey: signer.key };
}

/** A fresh stub: after a reset, the old one is broken, as a caller's would be. */
const stub = (name: string) => agents().get(agents().idFromName(name));

/** Run the task; after a crash, call again with the same request ID, as any client retrying would. */
async function runThroughCrashes(name: string, requestId: string, maxCrashes = 3): Promise<{ status: string; answer: string; crashes: string[] }> {
  const crashes: string[] = [];
  for (;;) {
    try {
      const out = await stub(name).run(TASK, requestId);
      return { ...out, crashes };
    } catch (e) {
      crashes.push(String((e as Error).message ?? e));
      if (crashes.length > maxCrashes) throw e;
    }
  }
}

async function logOf(room: TestRoom): Promise<LogEntry[]> {
  return [...(await room.admin.read({ q: "log", req: { limit: 500 } })).acts];
}

/** Acts in the log signed by the agent's key, by kind; and the rules of its recorded refusals. */
function agentActs(log: LogEntry[], key: string) {
  const mine = log.flatMap((e) => (e.entry.type !== "system" && e.entry.act.envelope.actor === key ? [e.entry] : []));
  return {
    acts: mine.flatMap((e) => (e.type === "act" ? [e.act.envelope.kind] : [])),
    refusals: mine.flatMap((e) => (e.type === "refusal" ? [e.receipt.refusal.rule] : [])),
  };
}

async function landed(s: Setup): Promise<LandOp> {
  const lane = await stub(s.agentName).lane();
  await tick(s.room, 3);
  return (await s.room.admin.read({ q: "op", op: lane!.landOp as never })) as LandOp;
}

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
  "write:after-push",
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
    // The rerun found the envelope stored before the first send, and sent those bytes again; the room answered from its idempotency record.
    const expected = { "before-send": ["replayed"], "after-send": ["prepared", "replayed"], "after-receipt": ["prepared", "replayed"] }[when!];
    if (kind !== "write") expect(controls.sends.get(kind!)).toEqual(expected);
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

  it("without the stored envelope: the rerun rebuilds the act from fresh reads, the bytes differ, and the room refuses it as idempotency-mismatch", async () => {
    const s = await setup();
    controls.memo = false;
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
    controls.memo = false;
    controls.taskKey = false;
    controls.crashes.add("propose:after-send");
    await runThroughCrashes(s.agentName, "task-1");
    expect(agentActs(await logOf(s.room), s.agentKey).acts).toEqual(["claim", "propose", "propose", "land"]);
    expect((await stub(s.agentName).lane())!.generation).toBe(2);
  });
});
