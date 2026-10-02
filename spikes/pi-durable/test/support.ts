/**
 * What the spike's tests share: a room with a member who delegates to the
 * agent's key, the agent's Durable Object, a retry loop through resets, and
 * readers of the room's log.
 *
 * The Room is lane A's (request/laneA-room at 4a7c4af6), with lane B's
 * landing engine and lane L's log publisher, over lane A's fake Artifacts
 * remotes. Its test support (vendor/.../test/workerd/support.ts) founds the
 * room, adds members and steers the fakes.
 */

import { env } from "cloudflare:workers";
import { generateSigner, type PrivateJwk } from "@generalbusiness/artroom-client";
import type { DelegationId, LandOp, LaneId, LogEntry, RosterRecord, RoomId, Sha } from "@generalbusiness/artroom-contract";
import { forkName } from "@generalbusiness/artroom-git";
import { addMember, clock, day, iso, makeRoom, tick, type TestRoom } from "../vendor/artroom/packages/room/test/workerd/support.ts";
import { controls, type Agent, type Workspace } from "../src/agent.ts";

type Agents = DurableObjectNamespace<Agent>;
const agents = () => (env as unknown as { AGENTS: Agents }).AGENTS;

export const TASK = "Add docs/pi-durable.md to the repository, then land it.";

export interface Setup {
  room: TestRoom;
  agentName: string;
  agentKey: string;
}

/**
 * A lane's fork in lane A's fake Artifacts. The commit is built on main, as
 * lane A's `pushChange` builds it; the push is a compare-and-swap on the
 * fork's head. The workspace token path is not exercised.
 */
export function fakeWorkspace(room: TestRoom): Workspace {
  const a = room.world.artifacts;
  const head = (lane: LaneId): Sha | null => (a.repos.get(forkName(a.canonical, lane))?.refs.get("refs/heads/main") as Sha | undefined) ?? null;
  return {
    prepare: (lane, files) => ({ commit: a.commit(a.main!, files), expected: head(lane) }),
    head,
    push: (lane, commit, expected) => {
      const now = head(lane);
      if (now !== expected) throw new Error(`fork moved: expected ${expected}, found ${now}`);
      a.push(lane, commit);
    },
  };
}

export async function setup(model?: { provider: string; modelId: string }): Promise<Setup> {
  const room = await makeRoom();
  const alice = await addMember(room, "@alice", "member");
  // The agent's own key, as a Worker secret would hold it (R-CRED-4). It never joins.
  const { signer, jwk } = await generateSigner({ extractable: true });
  const grant = await alice.ok<RosterRecord>("roster", null, { op: "delegate", to: signer.key, kinds: ["claim", "propose", "land", "release", "note"], lanes: "*", expiresAt: iso(clock.now + day) });
  controls.workspace = fakeWorkspace(room);
  controls.now = () => clock.now;
  const agentName = `agent-${crypto.randomUUID()}`;
  await stub(agentName).setup(room.id as RoomId, jwk as PrivateJwk, grant.id as DelegationId, model);
  return { room, agentName, agentKey: signer.key };
}

/** A fresh stub: after a reset, the old one is broken, as a caller's would be. */
export const stub = (name: string) => agents().get(agents().idFromName(name));

/** Run the task; after a crash, call again with the same request ID, as any client retrying would. */
export async function runThroughCrashes(name: string, requestId: string, maxCrashes = 3, task = TASK): Promise<{ status: string; answer: string; crashes: string[] }> {
  const crashes: string[] = [];
  for (;;) {
    try {
      const out = await stub(name).run(task, requestId);
      return { ...out, crashes };
    } catch (e) {
      crashes.push(String((e as Error).message ?? e));
      if (crashes.length > maxCrashes) throw e;
    }
  }
}

export async function logOf(room: TestRoom): Promise<LogEntry[]> {
  return [...(await room.admin.read({ q: "log", req: { limit: 500 } })).acts];
}

/** Acts in the log signed by the agent's key, by kind; and the rules of its recorded refusals. */
export function agentActs(log: LogEntry[], key: string) {
  const mine = log.flatMap((e) => (e.entry.type !== "system" && e.entry.act.envelope.actor === key ? [e.entry] : []));
  return {
    acts: mine.flatMap((e) => (e.type === "act" ? [e.act.envelope.kind] : [])),
    refusals: mine.flatMap((e) => (e.type === "refusal" ? [e.receipt.refusal.rule] : [])),
  };
}

/** The landing's state as the room has it now, without running the room's alarm. */
export async function landingNow(s: Setup): Promise<string | undefined> {
  const lane = await stub(s.agentName).lane();
  if (lane?.landOp === undefined) return undefined;
  return ((await s.room.admin.read({ q: "op", op: lane.landOp as never })) as LandOp).state;
}

/** The landing after the room's alarm has run. */
export async function landed(s: Setup): Promise<LandOp> {
  const lane = await stub(s.agentName).lane();
  await tick(s.room, 3);
  return (await s.room.admin.read({ q: "op", op: lane!.landOp as never })) as LandOp;
}
