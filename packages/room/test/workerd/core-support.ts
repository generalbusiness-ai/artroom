/**
 * Helpers shared by acts.test.ts, worker.test.ts and log-tokens.test.ts: the
 * scenes most tests start from, the small reads they repeat, and the
 * object's restarts and alarms. They sit beside `support.ts`, which makes
 * rooms and clients.
 */

import { env } from "cloudflare:workers";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import type { Claim, Landing, LandOp, LaneId, LogEntry, Proposal, ReadQuery, ReadResults, Redeemed, RosterRecord, Sha, SystemEvent } from "@generalbusiness/artroom-contract";
import { setAlarmDelay, type Room } from "../../src/index.ts";
import { digestJson } from "../../src/crypto.ts";
import { b64url, call, Client, clock, day, digestBytes, iso, logOf, pushChange, randomBytes, type TestRoom } from "./support.ts";

export type State = DurableObjectState;
export const stubOf = (r: TestRoom) => r.stub as unknown as DurableObjectStub<Room>;

/** Run inside the room's Durable Object. */
export const inDO = <T>(r: TestRoom, fn: (room: Room, state: State) => T | Promise<T>) => runInDurableObject(stubOf(r), fn);

/** A value made on first use and kept: a room that several tests of one group share. */
export function once<T>(make: () => Promise<T>): () => Promise<T> {
  let made: Promise<T> | null = null;
  return () => (made ??= make());
}

// ------------------------------------------------------------ the log

/** The room's whole log, read inside its object. */
export const entries = (r: TestRoom): Promise<LogEntry[]> => logOf(r.id);
export const headSeq = (r: TestRoom) => inDO(r, (room) => room.core.headSeq());
export const idOf = (e: LogEntry) => `act_${e.seq}_${e.hash.slice(7, 15)}`;
export const kindOf = (e: LogEntry) => (e.entry.type === "system" ? e.entry.event.type : e.entry.act.envelope.kind);

/** The system events of one type, with their seq. */
export function events<T extends SystemEvent["type"]>(log: readonly LogEntry[], type: T): { seq: number; id: string; event: Extract<SystemEvent, { type: T }> }[] {
  return log.filter((e) => e.entry.type === "system" && e.entry.event.type === type).map((e) => ({ seq: e.seq, id: idOf(e), event: (e.entry as unknown as { event: Extract<SystemEvent, { type: T }> }).event }));
}

/** R-LOG-1, R-LOG-2: seqs count from 0 with no gap, each hash is its content's digest, and each entry names the one before. */
export function chained(log: readonly LogEntry[]): boolean {
  let prev: string | null = null;
  return log.every((e, i) => {
    const { hash, roomSig: _sig, ...content } = e;
    void _sig;
    const ok = e.seq === i && e.prev === prev && digestJson(content) === hash;
    prev = hash;
    return ok;
  });
}

// ------------------------------------------------------------ reads

const sessions = new Map<string, { token: string; until: number }>();

/** A read as the room's admin, with one session per room for as long as it lasts. */
export async function read<Q extends ReadQuery>(r: TestRoom, q: Q): Promise<ReadResults[Q["q"]]> {
  let s = sessions.get(r.id);
  if (!s || clock.now >= s.until) sessions.set(r.id, (s = { token: await r.admin.session(), until: clock.now + 3000_000 }));
  return call<ReadResults[Q["q"]]>(r.stub.read(s.token, q));
}

export type Op = LandOp & { integration?: Sha; waiting?: string[]; expectedMain: Sha };
export const opOf = async (r: TestRoom, id: string) => (await read(r, { q: "op", op: id as never })) as Op;

// ------------------------------------------------------------ scenes

/** Claim `scope`, push `changes` to the lane's fork and propose them. */
export async function proposed(r: TestRoom, who: Client, scope: string[], changes: Record<string, string>, goal = "work") {
  const claim = await who.ok<Claim>("claim", null, { goal, scope });
  const head = pushChange(r, claim.lane, changes);
  const proposal = await who.ok<Proposal>("propose", { lane: claim.lane }, { lease: 1, expectedGeneration: 0, head, summary: "change" });
  return { claim, lane: claim.lane as LaneId, head, proposal };
}

export const land = (who: Client, lane: string, head: string) => who.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });

/** A room-custody invitation, redeemed: the bearer an MCP agent gets (R-CRED-3). */
export async function roomBearer(r: TestRoom, kinds: string[] | "*", handle: `@${string}` = "@agent"): Promise<Redeemed> {
  const bytes = randomBytes(32);
  const inv = await r.admin.ok<RosterRecord>("roster", null, {
    op: "invite",
    member: handle,
    role: "agent",
    custody: "room",
    expiresAt: iso(clock.now + day),
    secretHash: digestBytes(bytes),
    session: { kinds, lanes: "*", ttlSeconds: 3600 },
  });
  return call<Redeemed>(r.stub.redeem({ custody: "room", invitation: inv.id, secret: b64url(bytes) }, "x"));
}

// ------------------------------------------------------------ the object's life and its alarms

/** The room's object aborted, as after an eviction or a crash, and a fresh stub to it. */
export async function restarted(before: TestRoom): Promise<TestRoom> {
  await inDO(before, (_room, state) => state.abort("restart")).catch(() => undefined);
  const stub = env.ROOMS.get(env.ROOMS.idFromName(before.id)) as unknown as TestRoom["stub"];
  return { ...before, stub, admin: new Client({ id: before.id, stub }, before.admin.keys) };
}

/**
 * Run with the room clock a week ahead of real time and no test alarm
 * delay, so a stored alarm is the Room's own time and never fires by
 * itself. The delay is restored after.
 */
export async function ahead<T>(fn: () => Promise<T>): Promise<T> {
  clock.now = Math.max(clock.now, Date.now() + 7 * day); // never backwards
  setAlarmDelay(null);
  try {
    return await fn();
  } finally {
    setAlarmDelay(3600_000);
  }
}

type Step = keyof Room["core"]["steps"];

/** On this object, these steps run only when the test runs them. */
export const hold = (r: TestRoom, ...steps: Step[]) =>
  inDO(r, async (room) => {
    await room.core.idle();
    const run = room.core.run.bind(room.core);
    room.core.run = (s) => {
      if (!steps.includes(s)) run(s);
    };
  });

/** Let the work a commit started finish, and the ledgers' passes with it. */
export const settle = (r: TestRoom) =>
  inDO(r, async (room) => {
    await room.core.idle();
    await room.core.mints.idle();
    await room.core.workspaces.forkTokens.idle();
  });

/** Run the object's stored alarm now; false when none is stored. */
export const alarm = (r: TestRoom) => runDurableObjectAlarm(stubOf(r));
export const storedAlarm = (r: TestRoom) => inDO(r, (_room, state) => state.storage.getAlarm());
