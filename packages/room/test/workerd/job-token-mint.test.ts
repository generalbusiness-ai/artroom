/**
 * A whole-tree job's canonical token mint is durable: it is recorded
 * (`mint:<job>` in `job_tokens`) before Artifacts is asked. A mint whose
 * answer is lost, or comes back malformed, may have made a token the Room
 * cannot name: the record stays unresolved and visible until that token
 * could no longer be live (the attempt's deadline), and nothing is sent on
 * it. A definite refusal that changed nothing settles it at once.
 *
 * Controls on the real Room Durable Object and SQLite, with no other jobs
 * step running.
 */

import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import type { Check, CheckerConfig, CheckJob, Claim, Proposal, Refusal, Result } from "@generalbusiness/artroom-contract";
import { policy, requireCheck } from "@generalbusiness/artroom-policy/helpers";
import type { Room } from "../../src/index.ts";
import { FakeArtifactsError } from "../../src/memory/artifacts.ts";
import { addMember, Client, clock, makeRoom, pushChange, tick, until, type TestRoom } from "./support.ts";

const inDO = <T>(r: TestRoom, fn: (room: Room) => T | Promise<T>) => runInDurableObject(r.stub as unknown as DurableObjectStub<Room>, fn);
const R = `sha256:${"0".repeat(64)}` as const;
const whole: CheckerConfig = { format: "artroom-checker-v1", volatile: false, timeoutSeconds: 60, runner: R };
const refusal: Refusal = { refused: true, rule: "check-binding", reason: "refused by the test service", fix: "none" };
const jobsOf = (r: TestRoom) => inDO(r, (room) => room.core.sql.all("SELECT state, attempt, next_ms, token FROM check_jobs ORDER BY rowid"));
const ledger = (r: TestRoom) => inDO(r, (room) => room.core.sql.all("SELECT token_id, expires_at, next_ms, last_error FROM job_tokens ORDER BY token_id"));
const step = (r: TestRoom) =>
  inDO(r, async (room) => {
    await room.core.steps.jobs();
    await room.core.idle();
  });

async function owed() {
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
    async handle(job): Promise<Result<Check>> {
      seen.push(job);
      return refusal;
    },
  };
  const c = await alice.ok<Claim>("claim", null, { goal: "work", scope: ["src/**"] });
  const head = pushChange(r, c.lane, { "src/app.ts": "v2" });
  await alice.ok<Proposal>("propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "change" });
  await inDO(r, (room) => room.core.idle());
  expect(await jobsOf(r)).toMatchObject([{ state: "owed", attempt: 0 }]);
  return { r, seen, from: r.world.artifacts.canonicalRepo().tokens.size };
}

/** Canonical read tokens minted since `from` tokens existed. */
const readTokens = (r: TestRoom, from: number) => [...r.world.artifacts.canonicalRepo().tokens.values()].slice(from).filter((t) => t.scope === "read");

describe("a whole-tree job's token mint whose answer is lost stays recorded, unresolved, until the token it may have made has expired", () => {
  it("applied, then the answer lost: nothing is sent; the mint stays recorded until the attempt's deadline; the next attempt is sent with its own token", async () => {
    const { r, seen, from } = await owed();
    r.world.artifacts.loseReply("createToken");
    await step(r);
    expect(seen).toEqual([]);
    // Artifacts made a token the Room never learned: it is live, and the Room keeps the mint on record.
    const [lost] = readTokens(r, from);
    expect(r.world.artifacts.canonicalRepo().admits(lost!.plaintext, "read")).toBe(true);
    const [row] = await jobsOf(r);
    expect(row).toMatchObject({ state: "owed", attempt: 1, token: null });
    const recorded = await ledger(r);
    expect(recorded).toEqual([{ token_id: expect.stringMatching(/^mint:job_[0-9a-f]+_1$/), expires_at: expect.any(Number), next_ms: expect.any(Number), last_error: expect.stringMatching(/^answer lost/) }]);
    const until_ = recorded[0]!["expires_at"] as number;
    // It could be live until then: the token Artifacts made expires no later.
    expect(lost!.expiresAt).toBeLessThanOrEqual(until_);
    expect(await inDO(r, (room) => room.core.nextAlarm())).toBeLessThanOrEqual(until_);
    // The next attempt is sent, with a token the Room knows; the lost mint is still recorded.
    clock.now = row!["next_ms"] as number;
    await step(r);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.id.endsWith("_2")).toBe(true);
    expect((await ledger(r)).map((x) => x["token_id"])).toEqual([recorded[0]!["token_id"]]);
    // Still recorded just before the deadline; settled once it has passed, when the token has expired too.
    clock.now = until_ - 1;
    await step(r);
    expect(await ledger(r)).toHaveLength(1);
    clock.now = until_;
    await step(r);
    expect(await ledger(r)).toEqual([]);
    expect(r.world.artifacts.canonicalRepo().admits(lost!.plaintext, "read")).toBe(false);
  });

  it("applied, the answer lost, and the room restarts: the record survives, the alarm is set for it, and it is settled at the deadline", async () => {
    const { r: before, seen, from } = await owed();
    before.world.artifacts.loseReply("createToken");
    await step(before);
    const [recorded] = await ledger(before);
    expect(recorded).toMatchObject({ token_id: expect.stringMatching(/^mint:/), last_error: expect.stringMatching(/^answer lost/) });
    await runInDurableObject(before.stub as unknown as DurableObjectStub<Room>, (_room, state) => state.abort("restart")).catch(() => undefined);
    const stub = env.ROOMS.get(env.ROOMS.idFromName(before.id)) as unknown as TestRoom["stub"];
    const r: TestRoom = { ...before, stub, admin: new Client({ id: before.id, stub }, before.admin.keys) };
    expect(await ledger(r)).toEqual([recorded]);
    const until_ = recorded!["expires_at"] as number;
    expect(await inDO(r, (room) => room.core.nextAlarm())).toBeLessThanOrEqual(until_);
    clock.now = until_;
    await tick(r);
    expect((await ledger(r)).filter((x) => x["token_id"] === recorded!["token_id"])).toEqual([]);
    const [lost] = readTokens(r, from);
    expect(r.world.artifacts.canonicalRepo().admits(lost!.plaintext, "read")).toBe(false);
    // The job itself went on: an attempt with a token the Room knows was sent.
    expect(seen.length).toBeGreaterThan(0);
  });

  it("review 1701f73e: a mint applied 30 seconds late, its answer lost: nothing is sent; the mint stays recorded while its token is live past the attempt's deadline, across a restart, and settles only when an inventory shows it expired", async () => {
    const { r: before, seen, from } = await owed();
    const a = before.world.artifacts;
    const calls = a.remoteCalls.get("createToken") ?? 0;
    a.holdToken = (repo, scope) => scope === "read" && repo === a.canonical;
    const running = step(before);
    await until(async () => (a.remoteCalls.get("createToken") ?? 0) > calls);
    clock.now += 30_000;
    a.loseReply("createToken");
    a.holdToken = null;
    await running;
    expect(seen).toEqual([]);
    const [lost] = readTokens(before, from);
    const [recorded] = await ledger(before);
    expect(recorded).toMatchObject({ token_id: expect.stringMatching(/^mint:/), last_error: expect.stringMatching(/^answer lost/) });
    const deadline = recorded!["expires_at"] as number;
    // Minted late, the token outlives the attempt's deadline.
    expect(lost!.expiresAt).toBeGreaterThan(deadline);
    // The room stops; a new object keeps the duty, with its alarm.
    await runInDurableObject(before.stub as unknown as DurableObjectStub<Room>, (_room, state) => state.abort("restart")).catch(() => undefined);
    const stub = env.ROOMS.get(env.ROOMS.idFromName(before.id)) as unknown as TestRoom["stub"];
    const r: TestRoom = { ...before, stub, admin: new Client({ id: before.id, stub }, before.admin.keys) };
    expect(await ledger(r)).toEqual([recorded]);
    expect(await inDO(r, (room) => room.core.nextAlarm())).toBeLessThanOrEqual(deadline);
    // Past the deadline, the token still reads: the inventory shows a live token the Room cannot account for, so
    // the duty stays, saying so, and is tried again later.
    clock.now = deadline + 1;
    await tick(r);
    expect(a.canonicalRepo().admits(lost!.plaintext, "read")).toBe(true);
    const kept = (await ledger(r)).find((x) => x["token_id"] === recorded!["token_id"]);
    expect(kept).toMatchObject({ last_error: expect.stringMatching(/not accounted for/) });
    expect(kept!["next_ms"] as number).toBeGreaterThan(clock.now);
    // The job itself went on, with a token the Room knows; that one does not hold the duty open.
    expect(seen.length).toBeGreaterThan(0);
    // Once the late token has expired, the next inventory shows nothing unaccounted, and the duty settles.
    clock.now = lost!.expiresAt;
    await tick(r);
    clock.now = ((await ledger(r)).find((x) => x["token_id"] === recorded!["token_id"])?.["next_ms"] as number | undefined) ?? clock.now;
    await tick(r);
    expect((await ledger(r)).filter((x) => x["token_id"] === recorded!["token_id"])).toEqual([]);
    expect(a.canonicalRepo().admits(lost!.plaintext, "read")).toBe(false);
  });

  it("the room stops while a mint's answer is outstanding: the mint record survives, and an inventory after the deadline reconciles it", async () => {
    const { r: before, from } = await owed();
    const a = before.world.artifacts;
    const calls = a.remoteCalls.get("createToken") ?? 0;
    a.holdTokenReply = (repo, scope) => scope === "read" && repo === a.canonical;
    void step(before).catch(() => undefined);
    await until(async () => (a.remoteCalls.get("createToken") ?? 0) > calls);
    const [recorded] = await ledger(before);
    expect(recorded).toMatchObject({ token_id: expect.stringMatching(/^mint:/), last_error: "minting" });
    await runInDurableObject(before.stub as unknown as DurableObjectStub<Room>, (_room, state) => state.abort("restart")).catch(() => undefined);
    a.holdTokenReply = null;
    const stub = env.ROOMS.get(env.ROOMS.idFromName(before.id)) as unknown as TestRoom["stub"];
    const r: TestRoom = { ...before, stub, admin: new Client({ id: before.id, stub }, before.admin.keys) };
    // The token was minted, and the Room never learned its ID.
    const [minted] = readTokens(r, from);
    expect(minted!.revoked).toBe(false);
    expect(await ledger(r)).toEqual([recorded]);
    expect(await jobsOf(r)).toMatchObject([{ state: "sent", attempt: 1, token: null }]);
    clock.now = recorded!["expires_at"] as number;
    await tick(r);
    // Its expiry ran from the request, so it has expired by the deadline: the inventory accounts for every live
    // token, and the duty settles.
    expect(a.canonicalRepo().admits(minted!.plaintext, "read")).toBe(false);
    expect((await ledger(r)).filter((x) => x["token_id"] === recorded!["token_id"])).toEqual([]);
  });

  it("an inventory that is incomplete does not settle the duty; a live token the Room knows does not hold it open", async () => {
    const { r, seen } = await owed();
    const a = r.world.artifacts;
    a.loseReply("createToken");
    await step(r);
    const [recorded] = await ledger(r);
    const deadline = recorded!["expires_at"] as number;
    // The next attempt is sent, and its call is still with the service: its token is live, and known.
    let answer: (() => void) | null = null;
    r.world.checkers["unit"] = {
      handle(job): Promise<Result<Check>> {
        seen.push(job);
        return new Promise((resolve) => (answer = () => resolve(refusal)));
      },
    };
    clock.now = ((await jobsOf(r))[0]!["next_ms"] as number);
    await inDO(r, (room) => room.core.steps.jobs());
    await until(async () => seen.length === 1);
    // An inventory with fewer tokens than its total proves nothing.
    const repo = a.canonicalRepo();
    const list = repo.listTokens.bind(repo);
    (repo as { listTokens: unknown }).listTokens = async () => {
      const inv = await list();
      return { ...inv, total: inv.total + 1 };
    };
    clock.now = deadline;
    await inDO(r, (room) => room.core.steps.jobs());
    expect((await ledger(r)).find((x) => x["token_id"] === recorded!["token_id"])).toMatchObject({ last_error: expect.stringMatching(/incomplete or malformed/) });
    // A complete one, with only the sent attempt's live token in it, settles the duty.
    (repo as { listTokens: unknown }).listTokens = list;
    clock.now = (await ledger(r)).find((x) => x["token_id"] === recorded!["token_id"])!["next_ms"] as number;
    await inDO(r, (room) => room.core.steps.jobs());
    expect(repo.admits(/^Authorization: Bearer (.+)$/.exec(seen[0]!.gitAuthEnv.GIT_CONFIG_VALUE_0)![1]!, "read")).toBe(true);
    expect((await ledger(r)).filter((x) => x["token_id"] === recorded!["token_id"])).toEqual([]);
    await inDO(r, () => answer!());
    await inDO(r, (room) => room.core.idle());
  });

  it("a malformed answer (no token text) is as unknown as a lost one: nothing is sent, and the mint stays recorded", async () => {
    const { r, seen } = await owed();
    const repo = r.world.artifacts.canonicalRepo();
    const mint = repo.createToken.bind(repo);
    (repo as { createToken: unknown }).createToken = async (scope: "read" | "write", ttl: number) => ({ ...(await mint(scope, ttl)), plaintext: undefined });
    await step(r);
    expect(seen).toEqual([]);
    expect(await ledger(r)).toEqual([expect.objectContaining({ token_id: expect.stringMatching(/^mint:/), last_error: "malformed answer" })]);
    expect(await jobsOf(r)).toMatchObject([{ state: "owed", attempt: 1, token: null }]);
  });

  it("a refusal that changed nothing settles the mint at once", async () => {
    const { r, seen, from } = await owed();
    r.world.artifacts.failRemote("createToken", new FakeArtifactsError("INVALID_TTL", 10003));
    await step(r);
    expect(seen).toEqual([]);
    expect(readTokens(r, from)).toEqual([]);
    expect(await ledger(r)).toEqual([]);
    expect(await jobsOf(r)).toMatchObject([{ state: "owed", attempt: 1, token: null }]);
  });

  it("an answer still outstanding: the mint stays recorded, nothing is sent; when it comes after the deadline, the token is ended and the mint settled", async () => {
    const { r, seen, from } = await owed();
    const a = r.world.artifacts;
    const calls = a.remoteCalls.get("createToken") ?? 0;
    a.holdTokenReply = (repo, scope) => scope === "read" && repo === a.canonical;
    const running = step(r);
    await until(async () => (a.remoteCalls.get("createToken") ?? 0) > calls);
    const [recorded] = await ledger(r);
    expect(recorded).toMatchObject({ token_id: expect.stringMatching(/^mint:/), last_error: "minting" });
    expect(seen).toEqual([]);
    clock.now = (recorded!["expires_at"] as number) + 1;
    a.holdTokenReply = null;
    await running;
    expect(seen).toEqual([]);
    expect(readTokens(r, from).every((t) => t.revoked)).toBe(true);
    expect(await ledger(r)).toEqual([]);
  });
});
