/**
 * A whole-tree job's canonical token mint is durable: it is recorded
 * (`mint:<job>` in `job_tokens`) before Artifacts is asked. A mint whose
 * answer is lost, or comes back malformed, may have made a token the Room
 * cannot name, or may still make one: nothing bounds when Artifacts applies
 * the request, and the token's expiry runs from then. So the record stays
 * an open duty, visible (`jobTokenDuties`) and checked with backoff, until
 * an answer settles it: a refusal that changed nothing, or a usable answer
 * whose token is then revoked. A clean inventory is an observation, never a
 * settlement. Nothing is ever sent on an unknown mint.
 *
 * Controls on the real Room Durable Object and SQLite.
 */

import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import type { Check, CheckerConfig, CheckJob, Claim, Proposal, Refusal, Result } from "@generalbusiness/artroom-contract";
import { policy, requireCheck } from "@generalbusiness/artroom-policy/helpers";
import type { Room } from "../../src/index.ts";
import { FakeArtifactsError } from "../../src/memory/artifacts.ts";
import { addMember, call, Client, clock, makeRoom, pushChange, tick, until, type TestRoom } from "./support.ts";

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


/** A fresh stub after the room's object is aborted, as after an eviction or a restart. */
async function restarted(before: TestRoom): Promise<TestRoom> {
  await runInDurableObject(before.stub as unknown as DurableObjectStub<Room>, (_room, state) => state.abort("restart")).catch(() => undefined);
  const stub = env.ROOMS.get(env.ROOMS.idFromName(before.id)) as unknown as TestRoom["stub"];
  return { ...before, stub, admin: new Client({ id: before.id, stub }, before.admin.keys) };
}

const duties = (r: TestRoom) => call<{ token: string; kind: string; status: string | null; nextAt: number }[]>(r.stub.jobTokenDuties());

describe("a whole-tree job's token mint whose outcome is unknown stays an open duty until an answer settles it", () => {
  it("applied, then the answer lost: nothing is sent; the next attempt is sent; the duty stays open, visible, past the deadline and after the token has expired, with what each inventory saw", async () => {
    const { r, seen, from } = await owed();
    r.world.artifacts.loseReply("createToken");
    await step(r);
    expect(seen).toEqual([]);
    const [lost] = readTokens(r, from);
    expect(r.world.artifacts.canonicalRepo().admits(lost!.plaintext, "read")).toBe(true);
    const [row] = await jobsOf(r);
    expect(row).toMatchObject({ state: "owed", attempt: 1, token: null });
    const [recorded] = await ledger(r);
    expect(recorded).toMatchObject({ token_id: expect.stringMatching(/^mint:job_[0-9a-f]+_1$/), last_error: expect.stringMatching(/^answer lost/) });
    expect(await duties(r)).toEqual([expect.objectContaining({ token: recorded!["token_id"], kind: "unknown-mint" })]);
    // The next attempt is sent, with a token the Room knows.
    clock.now = row!["next_ms"] as number;
    await step(r);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.id.endsWith("_2")).toBe(true);
    // Past the deadline, and after the lost token has expired, the inventory is clean: noted, not settled.
    clock.now = Math.max(recorded!["expires_at"] as number, lost!.expiresAt) + 1;
    await step(r);
    const after = (await ledger(r)).find((x) => x["token_id"] === recorded!["token_id"]);
    expect(after).toMatchObject({ last_error: expect.stringMatching(/^outcome unknown; 0 live token\(s\) on the canonical repository not accounted for/) });
    expect(after!["next_ms"] as number).toBeGreaterThan(clock.now);
    expect(await inDO(r, (room) => room.core.nextAlarm())).toBeLessThanOrEqual(after!["next_ms"] as number);
  });

  it("the checks back off, to at most six hours, and never stop", async () => {
    const { r } = await owed();
    r.world.artifacts.loseReply("createToken");
    await step(r);
    let gap = 0;
    for (let i = 0; i < 16; i++) {
      const [row] = (await ledger(r)).filter((x) => String(x["token_id"]).startsWith("mint:"));
      clock.now = Math.max(clock.now, row!["next_ms"] as number);
      await inDO(r, (room) => room.core.steps.jobs());
      const [next] = (await ledger(r)).filter((x) => String(x["token_id"]).startsWith("mint:"));
      expect(next).toBeDefined();
      gap = (next!["next_ms"] as number) - clock.now;
    }
    expect(gap).toBe(6 * 3600_000);
  });

  for (const late of ["lost", "usable"] as const)
    it(`review 013dad0c: the mint is held past its deadline, a second jobs step sends the next attempt and sees a clean inventory, then the mint applies with a ${late} answer`, async () => {
      const { r: before, seen, from } = await owed();
      const a = before.world.artifacts;
      const calls = a.remoteCalls.get("createToken") ?? 0;
      // Attempt 1's mint (this call alone) is held before Artifacts applies it.
      let heldCall = 0;
      a.holdToken = (repo, scope, _ttl, n) => {
        if (scope === "read" && repo === a.canonical && heldCall === 0) heldCall = n;
        return n === heldCall;
      };
      const held = step(before);
      await until(async () => (a.remoteCalls.get("createToken") ?? 0) > calls);
      const [recorded] = await ledger(before);
      const mint = recorded!["token_id"] as string;
      // Past its deadline a second jobs step issues attempt 2, which is sent and answered; its inventory is clean.
      clock.now = (recorded!["expires_at"] as number) + 1;
      await inDO(before, async (room) => {
        await room.core.steps.jobs();
        await room.core.idle();
      });
      expect(seen.map((j) => j.id.slice(-2))).toEqual(["_2"]);
      const observed = (await ledger(before)).find((x) => x["token_id"] === mint);
      expect(observed).toMatchObject({ last_error: expect.stringMatching(/^outcome unknown; 0 live token/) });
      // Now Artifacts applies attempt 1's mint.
      if (late === "lost") a.loseReply("createToken");
      a.holdToken = null;
      await held;
      const lateToken = readTokens(before, from).find((t) => t.plaintext !== /^Authorization: Bearer (.+)$/.exec(seen[0]!.gitAuthEnv.GIT_CONFIG_VALUE_0)![1]);
      expect(lateToken).toBeDefined();
      // Never sent.
      expect(seen.map((j) => j.id.slice(-2))).toEqual(["_2"]);
      if (late === "usable") {
        // The answer finds the duty: its token is recorded by its ID and revoked, and the duty settles.
        expect(lateToken!.revoked).toBe(true);
        expect((await ledger(before)).filter((x) => x["token_id"] === mint)).toEqual([]);
        expect(await ledger(before)).toEqual([]);
        return;
      }
      // Lost: the late token is live past the deadline, and the duty is still open, saying so.
      expect(lateToken!.expiresAt).toBeGreaterThan(recorded!["expires_at"] as number);
      expect(a.canonicalRepo().admits(lateToken!.plaintext, "read")).toBe(true);
      expect((await ledger(before)).find((x) => x["token_id"] === mint)).toMatchObject({ last_error: expect.stringMatching(/^answer lost/) });
      // It survives the room's restart, with its alarm, and stays open after the late token has expired too.
      const r = await restarted(before);
      expect((await duties(r)).map((d) => d.token)).toContain(mint);
      const due = (await ledger(r)).find((x) => x["token_id"] === mint)!["next_ms"] as number;
      expect(await inDO(r, (room) => room.core.nextAlarm())).toBeLessThanOrEqual(due);
      clock.now = Math.max(due, lateToken!.expiresAt + 1);
      await tick(r);
      expect((await duties(r)).find((d) => d.token === mint)).toMatchObject({ kind: "unknown-mint", status: expect.stringMatching(/^outcome unknown/) });
    });

  it("the room stops while a mint's answer is outstanding: the mint record survives as an open duty, and the next attempt goes on", async () => {
    const { r: before, seen, from } = await owed();
    const a = before.world.artifacts;
    const calls = a.remoteCalls.get("createToken") ?? 0;
    a.holdTokenReply = (repo, scope) => scope === "read" && repo === a.canonical;
    void step(before).catch(() => undefined);
    await until(async () => (a.remoteCalls.get("createToken") ?? 0) > calls);
    const [recorded] = await ledger(before);
    expect(recorded).toMatchObject({ token_id: expect.stringMatching(/^mint:/), last_error: "minting" });
    const r = await restarted(before);
    a.holdTokenReply = null;
    const [minted] = readTokens(r, from);
    expect(minted!.revoked).toBe(false);
    expect(await ledger(r)).toEqual([recorded]);
    expect(await jobsOf(r)).toMatchObject([{ state: "sent", attempt: 1, token: null }]);
    clock.now = recorded!["expires_at"] as number;
    await tick(r);
    expect(seen.length).toBeGreaterThan(0);
    expect((await duties(r)).map((d) => d.token)).toContain(recorded!["token_id"]);
  });

  it("an inventory that is incomplete is noted as such; a live token the Room knows is not counted against the duty", async () => {
    const { r, seen } = await owed();
    const a = r.world.artifacts;
    a.loseReply("createToken");
    await step(r);
    const [recorded] = await ledger(r);
    const deadline = recorded!["expires_at"] as number;
    let answer: (() => void) | null = null;
    r.world.checkers["unit"] = {
      handle(job): Promise<Result<Check>> {
        seen.push(job);
        return new Promise((resolve) => (answer = () => resolve(refusal)));
      },
    };
    clock.now = (await jobsOf(r))[0]!["next_ms"] as number;
    await inDO(r, (room) => room.core.steps.jobs());
    await until(async () => seen.length === 1);
    const repo = a.canonicalRepo();
    const list = repo.listTokens.bind(repo);
    (repo as { listTokens: unknown }).listTokens = async () => {
      const inv = await list();
      return { ...inv, total: inv.total + 1 };
    };
    clock.now = deadline;
    await inDO(r, (room) => room.core.steps.jobs());
    expect((await ledger(r)).find((x) => x["token_id"] === recorded!["token_id"])).toMatchObject({ last_error: expect.stringMatching(/incomplete or malformed/) });
    (repo as { listTokens: unknown }).listTokens = list;
    clock.now = (await ledger(r)).find((x) => x["token_id"] === recorded!["token_id"])!["next_ms"] as number;
    await inDO(r, (room) => room.core.steps.jobs());
    // The sent attempt's token is live and known: the lost one has expired, so none is unaccounted for. Still open.
    expect(repo.admits(/^Authorization: Bearer (.+)$/.exec(seen[0]!.gitAuthEnv.GIT_CONFIG_VALUE_0)![1]!, "read")).toBe(true);
    expect((await ledger(r)).find((x) => x["token_id"] === recorded!["token_id"])).toMatchObject({ last_error: expect.stringMatching(/^outcome unknown; 0 live token/) });
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
