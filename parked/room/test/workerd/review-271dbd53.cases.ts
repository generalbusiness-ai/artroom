/**
 * Review 271dbd53: a known canonical token must always have a durable owner.
 * From the moment its ID is known it is owned by its `job_tokens` row,
 * written in the same transaction that settles the mint record; ending it
 * only makes that row due. Each control injects one failure of the Room's
 * own SQLite write at a handoff, then stops the room's object, and checks
 * that a fresh object still owns the token and revokes it.
 *
 * Since mint lane C (request 5ff58c9a), the token is the canonical mint
 * ledger's until the `job_tokens` row is written and the ledger's record
 * claimed, in one transaction (the transfer). A token that would outlive
 * the deadline is never claimed: the ledger owes it. A `job_tokens` row ends
 * when Artifacts answers its revocation, or once the token's known expiry
 * has passed, with no revocation (R-MINT-4): it is never dropped while the
 * token can still read.
 *
 * Controls on the real Room Durable Object and SQLite.
 */

import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import type { Check, CheckerConfig, CheckJob, Claim, Proposal, Refusal, Result } from "@generalbusiness/artroom-contract";
import { policy, requireCheck } from "@generalbusiness/artroom-policy/helpers";
import type { Room } from "../../src/index.ts";
import { artifactsErrors } from "../../src/memory/artifacts.ts";
import { addMember, call, Client, clock, makeRoom, pushChange, tick, until, type TestRoom } from "./support.ts";

const inDO = <T>(r: TestRoom, fn: (room: Room) => T | Promise<T>) => runInDurableObject(r.stub as unknown as DurableObjectStub<Room>, fn);
const R = `sha256:${"0".repeat(64)}` as const;
const whole: CheckerConfig = { format: "artroom-checker-v1", volatile: false, timeoutSeconds: 60, runner: R };
const refusal: Refusal = { refused: true, rule: "check-binding", reason: "refused by the test service", fix: "none" };
const ledger = (r: TestRoom) => inDO(r, (room) => room.core.sql.all("SELECT token_id, next_ms, last_error FROM job_tokens ORDER BY token_id"));
/** The canonical mint ledger's records. */
const mintRecords = async (r: TestRoom) => (await inDO(r, (room) => room.core.mints.duties({ limit: 1000 }))).records;
const jobsOf = (r: TestRoom) => inDO(r, (room) => room.core.sql.all("SELECT state, attempt, next_ms, token FROM check_jobs ORDER BY rowid"));
const tokenOf = (job: CheckJob) => /^Authorization: Bearer (.+)$/.exec(job.gitAuthEnv.GIT_CONFIG_VALUE_0)![1]!;

/** The token handoffs whose SQLite write a control fails, once. */
const TRANSFER = "VALUES (?, ?, ?, 'held')";
const END = "'ended') ON CONFLICT (token_id)";

/** Fail the Room's next SQLite statement containing `pattern`, once, as an injected persistence error. */
const failOnce = (r: TestRoom, pattern: string) =>
  inDO(r, (room) => {
    const sql = room.core.sql as { all: (q: string, ...b: unknown[]) => unknown };
    const real = sql.all;
    let armed = true;
    sql.all = (q: string, ...b: unknown[]) => {
      if (armed && q.includes(pattern)) {
        armed = false;
        throw new Error(`injected persistence failure (${pattern})`);
      }
      return real(q, ...b);
    };
  });

/** A fresh stub after the room's object is aborted, as after an eviction or a restart. */
async function restarted(before: TestRoom): Promise<TestRoom> {
  await runInDurableObject(before.stub as unknown as DurableObjectStub<Room>, (_room, state) => state.abort("restart")).catch(() => undefined);
  const stub = env.ROOMS.get(env.ROOMS.idFromName(before.id)) as unknown as TestRoom["stub"];
  return { ...before, stub, admin: new Client({ id: before.id, stub }, before.admin.keys) };
}

async function owed(answer: (job: CheckJob) => Promise<Result<Check>> = async () => refusal) {
  const r = await makeRoom({
    policy: policy(requireCheck("unit", { paths: "src/**", by: "@ci", id: "unit-tests" })),
    files: { ".artroom/checkers/unit.json": JSON.stringify(whole), "package.json": "{}" },
  });
  await inDO(r, async (room) => {
    await room.core.idle();
    const run = room.core.run.bind(room.core);
    room.core.run = (s) => {
      if (s !== "jobs" && s !== "landing") run(s);
    };
  });
  const alice = await addMember(r, "@alice", "member");
  await addMember(r, "@ci", "checker");
  const seen: CheckJob[] = [];
  r.world.checkers["unit"] = {
    handle(job): Promise<Result<Check>> {
      seen.push(job);
      return answer(job);
    },
  };
  const c = await alice.ok<Claim>("claim", null, { goal: "work", scope: ["src/**"] });
  const head = pushChange(r, c.lane, { "src/app.ts": "v2" });
  await alice.ok<Proposal>("propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "change" });
  await inDO(r, (room) => room.core.idle());
  return { r, seen, lane: c.lane, from: r.world.artifacts.canonicalRepo().tokens.size };
}

const readTokens = (r: TestRoom, from: number) => [...r.world.artifacts.canonicalRepo().tokens.values()].slice(from).filter((t) => t.scope === "read");
const step = (r: TestRoom) =>
  inDO(r, async (room) => {
    await room.core.steps.jobs().catch(() => undefined);
    await room.core.idle();
  });

/** After a restart, run the alarm's work at each due record until none is left, or until `limit` runs. */
async function settle(r: TestRoom, limit = 6) {
  for (let i = 0; i < limit; i++) {
    const rows = await ledger(r);
    if (!rows.length) return;
    clock.now = Math.max(clock.now, ...rows.map((x) => x["next_ms"] as number));
    await tick(r);
  }
}

describe("review 271dbd53: a known token keeps a durable owner across every handoff", () => {
  it("normal completion (the checker's second control): the cleanup write after the answer fails once; after a restart the token is still owned, and revoked", async () => {
    const { r: before, seen, from } = await owed();
    await failOnce(before, END);
    await step(before);
    expect(seen).toHaveLength(1);
    expect(await jobsOf(before)).toMatchObject([{ state: "done", token: null }]);
    const [token] = readTokens(before, from);
    expect(token!.plaintext).toBe(tokenOf(seen[0]!));
    expect(token!.revoked).toBe(false);
    expect(await ledger(before)).toEqual([{ token_id: token!.id, next_ms: token!.expiresAt, last_error: "held" }]);
    const r = await restarted(before);
    // The operators' view: a held token, with its real expiry.
    expect(await call(r.stub.jobTokenDuties())).toEqual([expect.objectContaining({ token: token!.id, kind: "held", expiresAt: token!.expiresAt, nextCheckAt: token!.expiresAt })]);
    expect(await inDO(r, (room) => room.core.nextAlarm())).toBeLessThanOrEqual(token!.expiresAt);
    // Owned while it can still read; settled once its known expiry has passed, with no revocation needed.
    expect(r.world.artifacts.canonicalRepo().admits(token!.plaintext, "read")).toBe(true);
    await settle(r);
    expect(r.world.artifacts.canonicalRepo().admits(token!.plaintext, "read")).toBe(false);
    expect(clock.now).toBeGreaterThanOrEqual(token!.expiresAt);
    expect(await ledger(r)).toEqual([]);
  });

  it("an attempt in flight when the room restarts, then expired by the next jobs step with its cleanup write failing once: the token's record still ends it", async () => {
    const { r: before, seen, from } = await owed(() => new Promise<Result<Check>>(() => undefined));
    await inDO(before, (room) => room.core.steps.jobs());
    await until(async () => seen.length === 1);
    const [token] = readTokens(before, from);
    const [row] = await jobsOf(before);
    expect(row).toMatchObject({ state: "sent", attempt: 1, token: token!.id });
    // The record that owns the held token is due at the token's expiry, no later than the attempt's deadline.
    expect(await ledger(before)).toEqual([{ token_id: token!.id, next_ms: token!.expiresAt, last_error: "held" }]);
    const r = await restarted(before);
    expect((await ledger(r)).map((x) => x["token_id"])).toEqual([token!.id]);
    r.world.checkers["unit"] = { handle: async () => refusal };
    clock.now = (row!["next_ms"] as number) + 1;
    await failOnce(r, END);
    await inDO(r, (room) => room.core.steps.jobs().catch(() => undefined));
    await inDO(r, (room) => room.core.idle());
    // The job token pass (its own alarm step since mint lane C) takes the row, now due.
    await inDO(r, async (room) => {
      await room.core.steps.jobTokens();
      await room.core.idle();
    });
    // Past the deadline the token has expired (it expires by the deadline): its record is settled, with no revocation needed.
    expect(r.world.artifacts.canonicalRepo().admits(token!.plaintext, "read")).toBe(false);
    expect((await ledger(r)).filter((x) => x["token_id"] === token!.id)).toEqual([]);
  });

  it("work no longer current at dispatch: ending the prepared token fails once; the token stays owned across a restart, and is revoked", async () => {
    const { r: before, seen, from, lane } = await owed();
    const a = before.world.artifacts;
    const calls = a.remoteCalls.get("createToken") ?? 0;
    a.holdTokenReply = (repo, scope) => scope === "read" && repo === a.canonical;
    const running = step(before);
    await until(async () => (a.remoteCalls.get("createToken") ?? 0) > calls);
    await inDO(before, (room) => room.core.sql.all("UPDATE previews SET body = json_set(body, '$.integration', ?) WHERE lane = ?", "e".repeat(40), lane));
    await failOnce(before, END);
    a.holdTokenReply = null;
    await running;
    expect(seen).toEqual([]);
    const [token] = readTokens(before, from);
    expect(token!.revoked).toBe(false);
    expect((await ledger(before)).map((x) => x["token_id"])).toEqual([token!.id]);
    const r = await restarted(before);
    // Owned while it can still read; settled once its known expiry has passed.
    expect(r.world.artifacts.canonicalRepo().admits(token!.plaintext, "read")).toBe(true);
    expect((await ledger(r)).map((x) => x["token_id"])).toEqual([token!.id]);
    await settle(r);
    expect(r.world.artifacts.canonicalRepo().admits(token!.plaintext, "read")).toBe(false);
    expect(await ledger(r)).toEqual([]);
  });

  it("the transfer itself fails once: the ledger keeps the token and revokes it by its ID; nothing is sent", async () => {
    const { r, seen, from } = await owed();
    await failOnce(r, TRANSFER);
    await step(r);
    expect(seen).toEqual([]);
    const [token] = readTokens(r, from);
    expect(token!.revoked).toBe(true);
    expect(await ledger(r)).toEqual([]);
    expect(await mintRecords(r)).toEqual([]);
    expect(await jobsOf(r)).toMatchObject([{ state: "owed", attempt: 1, token: null }]);
  });

  it("the transfer fails once and the revocation fails too: the ledger's record owes it, across a restart; the token is never sent", async () => {
    const { r: before, seen, from } = await owed();
    for (let i = 0; i < 40; i++) before.world.artifacts.failRemote("revokeToken", artifactsErrors.internal());
    await failOnce(before, TRANSFER);
    await step(before);
    expect(seen).toEqual([]);
    const [token] = readTokens(before, from);
    expect(token!.revoked).toBe(false);
    expect(await ledger(before)).toEqual([]);
    const [kept] = await mintRecords(before);
    expect(kept).toMatchObject({ state: "owed", tokenId: token!.id, purpose: expect.stringMatching(/^job:/) });
    const r = await restarted(before);
    expect(await mintRecords(r)).toEqual([expect.objectContaining({ id: kept!.id, state: "owed", tokenId: token!.id })]);
  });
});
