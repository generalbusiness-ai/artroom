/**
 * Review 90f30a3b: a whole-tree job's canonical token must expire no later
 * than the job's deadline, and an attempt past its own deadline is never
 * sent. Controls on the real Room Durable Object and SQLite, with no other
 * jobs step running: the fake's `createToken` is held before the token is
 * minted (its expiry then runs from the late mint) or after (its expiry ran
 * from the request, and the answer comes late). Since mint lane C (request
 * 5ff58c9a) the token is minted through the canonical mint ledger with the
 * deadline as `notAfter`: a token that would outlive it is owed by the
 * ledger, never given to the job, and revoked by its ID at the ledger's next
 * pass (`pass`).
 */

import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import type { Check, CheckerConfig, CheckJob, Claim, Proposal, Refusal, Result } from "@generalbusiness/artroom-contract";
import { policy, requireCheck } from "@generalbusiness/artroom-policy/helpers";
import type { Room } from "../../src/index.ts";
import { artifactsErrors } from "../../src/memory/artifacts.ts";
import { addMember, Client, clock, makeRoom, pushChange, tick, until, type TestRoom } from "./support.ts";

const inDO = <T>(r: TestRoom, fn: (room: Room) => T | Promise<T>) => runInDurableObject(r.stub as unknown as DurableObjectStub<Room>, fn);
const R = `sha256:${"0".repeat(64)}` as const;
const whole: CheckerConfig = { format: "artroom-checker-v1", volatile: false, timeoutSeconds: 60, runner: R };
const refusal: Refusal = { refused: true, rule: "check-binding", reason: "refused by the test service", fix: "none" };
const tokenOf = (job: CheckJob) => /^Authorization: Bearer (.+)$/.exec(job.gitAuthEnv.GIT_CONFIG_VALUE_0)![1]!;
const jobsOf = (r: TestRoom) => inDO(r, (room) => room.core.sql.all("SELECT state, attempt, next_ms, token FROM check_jobs ORDER BY rowid"));
const ledger = (r: TestRoom) => inDO(r, (room) => room.core.sql.all("SELECT token_id, expires_at, attempts, last_error FROM job_tokens"));
/** The canonical mint ledger's records. */
const mintRecords = async (r: TestRoom) => (await inDO(r, (room) => room.core.mints.duties({ limit: 1000 }))).records;
/** The mint ledger's revocation pass, as its alarm runs it. */
const pass = (r: TestRoom) =>
  inDO(r, async (room) => {
    await room.core.steps.mints();
    await room.core.mints.idle();
  });

/** A room whose proposal's preview owes one whole-tree job; the jobs and landing steps are the test's to run. */
async function owed() {
  const r = await makeRoom({
    policy: policy(requireCheck("unit", { paths: "src/**", by: "@ci", id: "unit-tests" })),
    files: { ".artroom/checkers/unit.json": JSON.stringify(whole), "package.json": "{}" },
  });
  await inDO(r, async (room) => {
    await room.core.idle();
    const run = room.core.run.bind(room.core);
    room.core.run = (step) => {
      if (step !== "jobs" && step !== "landing") run(step);
    };
  });
  const alice = await addMember(r, "@alice", "member");
  await addMember(r, "@ci", "checker");
  // The service records each job, what its token could read when it arrived, and the token's expiry; it refuses.
  const seen: { job: CheckJob; reads: boolean; expiresAt: number; now: number }[] = [];
  r.world.checkers["unit"] = {
    async handle(job): Promise<Result<Check>> {
      const t = [...r.world.artifacts.canonicalRepo().tokens.values()].find((x) => x.plaintext === tokenOf(job))!;
      seen.push({ job, reads: r.world.artifacts.canonicalRepo().admits(tokenOf(job), "read"), expiresAt: t.expiresAt, now: clock.now });
      return refusal;
    },
  };
  const c = await alice.ok<Claim>("claim", null, { goal: "work", scope: ["src/**"] });
  const head = pushChange(r, c.lane, { "src/app.ts": "v2" });
  await alice.ok<Proposal>("propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "change" });
  await inDO(r, (room) => room.core.idle());
  expect(await jobsOf(r)).toMatchObject([{ state: "owed", attempt: 0 }]);
  return { r, seen };
}

/** Canonical read tokens minted since `from` tokens existed. */
const readTokens = (r: TestRoom, from: number) => [...r.world.artifacts.canonicalRepo().tokens.values()].slice(from).filter((t) => t.scope === "read");

/** Run one jobs step with the token mint held, apply `meanwhile` while it is held, then let it finish. */
async function heldStep(r: TestRoom, hold: "request" | "reply", meanwhile: () => void) {
  const a = r.world.artifacts;
  const calls = a.remoteCalls.get("createToken") ?? 0;
  const held = (repo: string, scope: string) => scope === "read" && repo === a.canonical;
  if (hold === "request") a.holdToken = held;
  else a.holdTokenReply = held;
  const step = inDO(r, async (room) => {
    await room.core.steps.jobs();
    await room.core.idle();
  });
  await until(async () => (a.remoteCalls.get("createToken") ?? 0) > calls);
  meanwhile();
  a.holdToken = null;
  a.holdTokenReply = null;
  await step;
}

describe("review 90f30a3b: a whole-tree job's token expires by its deadline, and an attempt past its deadline is never sent", () => {
  it("healthy mint: the job is sent; its token reads the canonical repository, expires before the job's deadline, and is revoked after the answer", async () => {
    const { r, seen } = await owed();
    const from = r.world.artifacts.canonicalRepo().tokens.size;
    await inDO(r, async (room) => {
      await room.core.steps.jobs();
      await room.core.idle();
    });
    expect(seen).toHaveLength(1);
    const deadline = Date.parse(seen[0]!.job.deadline);
    expect(seen[0]!.reads).toBe(true);
    expect(seen[0]!.expiresAt).toBeLessThanOrEqual(deadline);
    expect(readTokens(r, from).every((t) => t.revoked)).toBe(true);
    expect(await ledger(r)).toEqual([]);
  });

  it("a mint delayed so that the token would outlive the deadline: the token is refused and revoked, nothing is sent, and the job is due again later", async () => {
    const { r, seen } = await owed();
    const from = r.world.artifacts.canonicalRepo().tokens.size;
    await heldStep(r, "request", () => (clock.now += 30_000));
    expect(seen).toEqual([]);
    const minted = readTokens(r, from);
    expect(minted).toHaveLength(1);
    expect(await mintRecords(r)).toEqual([expect.objectContaining({ state: "owed", tokenId: minted[0]!.id, lastError: "an expiry after notAfter" })]);
    await pass(r);
    expect(minted[0]!.revoked).toBe(true);
    expect(await mintRecords(r)).toEqual([]);
    const [row] = await jobsOf(r);
    expect(row).toMatchObject({ state: "owed", attempt: 1, token: null });
    expect(row!["next_ms"] as number).toBeGreaterThan(clock.now);
    expect(await ledger(r)).toEqual([]);
    // The next attempt, with a prompt mint, is sent with a token that expires by its own deadline.
    clock.now = row!["next_ms"] as number;
    await inDO(r, async (room) => {
      await room.core.steps.jobs();
      await room.core.idle();
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.job.id.endsWith("_2")).toBe(true);
    expect(seen[0]!.expiresAt).toBeLessThanOrEqual(Date.parse(seen[0]!.job.deadline));
  });

  it("a mint delayed by less than the room's margin: the token still expires by the deadline, and the job is sent", async () => {
    const { r, seen } = await owed();
    await heldStep(r, "request", () => (clock.now += 2_000));
    expect(seen).toHaveLength(1);
    expect(seen[0]!.expiresAt).toBeLessThanOrEqual(Date.parse(seen[0]!.job.deadline));
  });

  for (const [what, alter] of [
    ["a write token", (t: { scope: string; expiresAt: string }) => ({ ...t, scope: "write" })],
    ["a token with no readable expiry", (t: { scope: string; expiresAt: string }) => ({ ...t, expiresAt: "never" })],
  ] as const)
    it(`Artifacts answers with ${what}: it is refused and revoked, and nothing is sent`, async () => {
      const { r, seen } = await owed();
      const repo = r.world.artifacts.canonicalRepo();
      const from = repo.tokens.size;
      const mint = repo.createToken.bind(repo);
      (repo as { createToken: unknown }).createToken = async (scope: "read" | "write", ttl: number) => alter(await mint(scope, ttl));
      await inDO(r, async (room) => {
        await room.core.steps.jobs();
        await room.core.idle();
      });
      expect(seen).toEqual([]);
      const minted = readTokens(r, from);
      expect(minted).toHaveLength(1);
      expect(await mintRecords(r)).toEqual([expect.objectContaining({ state: "owed", tokenId: minted[0]!.id })]);
      await pass(r);
      expect(minted[0]!.revoked).toBe(true);
      expect(await mintRecords(r)).toEqual([]);
      expect(await jobsOf(r)).toMatchObject([{ state: "owed", attempt: 1, token: null }]);
      expect(await ledger(r)).toEqual([]);
    });

  it("an answer delayed past the attempt's deadline, with no other jobs step: nothing is sent, the token is ended (it expired by the deadline, so its record is settled with no revocation), and the job is due again later", async () => {
    const { r, seen } = await owed();
    const from = r.world.artifacts.canonicalRepo().tokens.size;
    let deadline = 0;
    await heldStep(r, "reply", () => {
      // The attempt claimed its deadline before the mint; the answer comes after it.
      deadline = clock.now + (whole.timeoutSeconds + 300) * 1000;
      clock.now = deadline + 1;
    });
    expect(seen).toEqual([]);
    const minted = readTokens(r, from);
    expect(minted).toHaveLength(1);
    expect(minted[0]!.expiresAt).toBeLessThanOrEqual(deadline);
    expect(r.world.artifacts.canonicalRepo().admits(minted[0]!.plaintext, "read")).toBe(false);
    expect(await ledger(r)).toEqual([]);
    expect(await mintRecords(r)).toEqual([]);
    const [row] = await jobsOf(r);
    expect(row).toMatchObject({ state: "owed", attempt: 1, token: null });
    expect(row!["next_ms"] as number).toBeGreaterThan(clock.now);
  });

  it("cleanup fails, and the room restarts: the refused token stays owed and retried, never dropped while it can still read, until Artifacts revokes it", async () => {
    const { r: before } = await owed();
    const a = before.world.artifacts;
    const from = a.canonicalRepo().tokens.size;
    for (let i = 0; i < 200; i++) a.failRemote("revokeToken", artifactsErrors.internal());
    await heldStep(before, "request", () => (clock.now += 30_000));
    const [refused] = readTokens(before, from);
    await pass(before);
    expect(refused!.revoked).toBe(false);
    expect(a.canonicalRepo().admits(refused!.plaintext, "read")).toBe(true);
    const [recorded] = await mintRecords(before);
    expect(recorded).toMatchObject({ state: "owed", tokenId: refused!.id, expiresAt: refused!.expiresAt, lastError: "revocation failed: an error of another kind INTERNAL_ERROR (10400)" });
    // The room stops; a new object finds the debt in its storage, and the alarm is set for it.
    await runInDurableObject(before.stub as unknown as DurableObjectStub<Room>, (_room, state) => state.abort("restart")).catch(() => undefined);
    const stub = env.ROOMS.get(env.ROOMS.idFromName(before.id)) as unknown as TestRoom["stub"];
    const r: TestRoom = { ...before, stub, admin: new Client({ id: before.id, stub }, before.admin.keys) };
    const due = (await mintRecords(r))[0]!.dueAt!;
    // Retried later, with backoff, not at once: the alarm never spins on it.
    expect(due).toBeGreaterThan(clock.now);
    expect(await inDO(r, (room) => room.core.nextAlarm())).toBeLessThanOrEqual(due);
    // Still failing: retried, and kept while the token can still read.
    clock.now = due;
    await tick(r);
    await inDO(r, (room) => room.core.mints.idle());
    const again = (await mintRecords(r))[0]!;
    expect(again).toMatchObject({ state: "owed", tokenId: refused!.id });
    expect(again.dueAt!).toBeGreaterThan(due);
    expect(refused!.expiresAt).toBeGreaterThan(clock.now);
    // Artifacts recovers: the next retry revokes it, and the record ends.
    a.recover();
    clock.now = again.dueAt!;
    await tick(r);
    await inDO(r, (room) => room.core.mints.idle());
    expect(refused!.revoked).toBe(true);
    expect(await mintRecords(r)).toEqual([]);
    expect(await ledger(r)).toEqual([]);
  });
});
