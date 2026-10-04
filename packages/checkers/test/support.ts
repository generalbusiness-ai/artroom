// Test support that starts nothing: the names tests share, and jobs.
import type { CheckJob, Digest, LaneId, RoomId, Sha } from "@generalbusiness/artroom-contract";
import { gitAuthEnvFor } from "../src/job.ts";

export const ROOM = `room_${"a".repeat(32)}` as RoomId;
export const LANE = "act_1001_abcdef01" as LaneId;
export const HOST = "acct.artifacts.cloudflare.net";
export const NS = "ns";
export const CONFIG = `sha256:${"c".repeat(64)}` as Digest;
export const TOKEN = "art_v1_readonlytoken0123456789?expires=1";

/** A token-shaped string, built at run time and never written as a literal. */
export const tok = (s: string) => ["art", "v1", s].join("_");
export const urlOf = (repo: string) => `https://${HOST}/git/${NS}/${repo}.git` as const;
/** What a service with one fixed room expects of a job. */
export const expectations = (checker = "tests") => ({ room: ROOM, checker, host: HOST, namespaces: [NS], now: Date.now });

let n = 0;
export function job(integration: Sha, input: CheckJob["input"], over: Partial<CheckJob> = {}): CheckJob {
  return {
    id: `job_t${++n}_${Date.now().toString(36)}`,
    room: ROOM,
    lane: LANE,
    generation: 1,
    head: integration,
    obligation: "obl_tests",
    check: "tests",
    integration,
    base: integration,
    input,
    readUrl: urlOf("canon"),
    gitAuthEnv: gitAuthEnvFor(TOKEN),
    config: CONFIG,
    volatile: false,
    advisory: false,
    runner: null,
    deadline: new Date(Date.now() + 600_000).toISOString(),
    ...over,
  };
}
