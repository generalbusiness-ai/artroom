/**
 * A whole-tree job's canonical token mint is durable: since mint lane C
 * (request 5ff58c9a) it is a record of the Room's canonical mint ledger
 * (`job:<job>`), with its wake-up stored before Artifacts is asked. A mint
 * whose answer is lost may have made a token the Room cannot name, or may
 * still make one: nothing bounds when Artifacts applies the request, and the
 * token's expiry runs from then. So the record stays `unknown`, visible
 * (`mints.duties`) and observed with backoff, until an answer settles it: a
 * refusal that changed nothing, or an answer with a token ID, whose token is
 * then revoked by that ID. A clean inventory is an observation, never a
 * settlement. Nothing is ever sent on an unknown mint.
 *
 * Controls on the real Room Durable Object and SQLite.
 */

import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
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
/** The ledger's records of check job mints (`job:<job>`), as admins see them: never a token's text. */
const ledger = async (r: TestRoom) => (await inDO(r, (room) => room.core.mints.duties({ limit: 1000 }))).records.filter((x) => x.purpose.startsWith("job:"));
const observation = async (r: TestRoom) => (await inDO(r, (room) => room.core.mints.duties())).observation;
const jobTokens = (r: TestRoom) => inDO(r, (room) => room.core.sql.all("SELECT token_id FROM job_tokens ORDER BY token_id"));
const step = (r: TestRoom) =>
  inDO(r, async (room) => {
    await room.core.steps.jobs();
    await room.core.idle();
  });
/** The ledger's own alarm work: revocations owed, and an observation if due. */
const mints = (r: TestRoom) =>
  inDO(r, async (room) => {
    await room.core.steps.mints();
    await room.core.mints.idle();
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
  r.world.checkers["unit"] = { handle: async (job): Promise<Result<Check>> => (seen.push(job), refusal) };
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

describe("a whole-tree job's token mint whose outcome is unknown stays an open duty until an answer settles it", () => {
  it("applied, then the answer lost: nothing is sent; the next attempt is sent; the record stays open, visible, past the deadline and after the token has expired, with what each inventory saw", async () => {
    const { r, seen, from } = await owed();
    r.world.artifacts.loseReply("createToken");
    await step(r);
    expect(seen).toEqual([]);
    const [lost] = readTokens(r, from);
    expect(r.world.artifacts.canonicalRepo().admits(lost!.plaintext, "read")).toBe(true);
    const [row] = await jobsOf(r);
    expect(row).toMatchObject({ state: "owed", attempt: 1, token: null });
    const [recorded] = await ledger(r);
    expect(recorded).toMatchObject({ purpose: expect.stringMatching(/^job:job_[0-9a-f]+_1$/), state: "unknown", tokenId: null, expiresAt: null, lastError: "create failed: Error" });
    // The next attempt is sent, with a token the Room knows.
    clock.now = row!["next_ms"] as number;
    await step(r);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.id.endsWith("_2")).toBe(true);
    // Past the deadline, and after the lost token has expired, the inventory is clean: noted, not settled.
    clock.now = Math.max(recorded!.notAfter!, lost!.expiresAt) + 1;
    await mints(r);
    expect(await ledger(r)).toEqual([expect.objectContaining({ id: recorded!.id, state: "unknown" })]);
    const seenBy = await observation(r);
    expect(seenBy).toMatchObject({ at: clock.now, unaccounted: 0, result: "0 live token(s) on the canonical repository not accounted for" });
    expect(seenBy.nextAt!).toBeGreaterThan(clock.now);
    expect(await inDO(r, (room) => room.core.nextAlarm())).toBeLessThanOrEqual(seenBy.nextAt!);
  });

  it("the observations back off, to at most six hours, and never stop", async () => {
    const { r } = await owed();
    r.world.artifacts.loseReply("createToken");
    await step(r);
    let gap = 0;
    for (let i = 0; i < 16; i++) {
      clock.now = Math.max(clock.now, (await observation(r)).nextAt!);
      await mints(r);
      expect(await ledger(r)).toEqual([expect.objectContaining({ state: "unknown" })]);
      gap = (await observation(r)).nextAt! - clock.now;
    }
    expect(gap).toBe(6 * 3600_000);
  });

  for (const late of ["lost", "usable", "usable, minted in time"] as const)
    it(`review 013dad0c: the mint is held past its deadline, a second jobs step sends the next attempt, then the mint applies with a ${late} answer`, async () => {
      const { r: before, seen, from } = await owed();
      const a = before.world.artifacts;
      const calls = a.remoteCalls.get("createToken") ?? 0;
      // Attempt 1's mint (this call alone) is held before Artifacts applies it.
      // ("minted in time": Artifacts applies it at once, with an expiry within the deadline, and only its answer is held.)
      let heldCall = 0;
      const hold = (repo: string, scope: string, _ttl: number, n: number) => {
        if (scope === "read" && repo === a.canonical && heldCall === 0) heldCall = n;
        return n === heldCall;
      };
      if (late === "usable, minted in time") a.holdTokenReply = hold;
      else a.holdToken = hold;
      const held = step(before);
      await until(async () => (a.remoteCalls.get("createToken") ?? 0) > calls);
      const [recorded] = await ledger(before);
      expect(recorded).toMatchObject({ state: "sent", notAfter: expect.any(Number) });
      // Past its deadline a second jobs step issues attempt 2, which is sent and answered.
      clock.now = recorded!.notAfter! + 1;
      await step(before);
      expect(seen.map((j) => j.id.slice(-2))).toEqual(["_2"]);
      // Now Artifacts applies attempt 1's mint.
      if (late === "lost") a.loseReply("createToken");
      a.holdToken = null;
      a.holdTokenReply = null;
      await held;
      const lateToken = readTokens(before, from).find((t) => t.plaintext !== /^Authorization: Bearer (.+)$/.exec(seen[0]!.gitAuthEnv.GIT_CONFIG_VALUE_0)![1]);
      expect(lateToken).toBeDefined();
      // Never sent.
      expect(seen.map((j) => j.id.slice(-2))).toEqual(["_2"]);
      if (late === "usable") {
        // Applied after the deadline: its expiry is after `notAfter`, so its ID is owed and revoked, never given out.
        expect(await ledger(before)).toEqual([expect.objectContaining({ id: recorded!.id, state: "owed", tokenId: lateToken!.id, lastError: "an expiry after notAfter" })]);
        await mints(before);
        expect(lateToken!.revoked).toBe(true);
        expect(await ledger(before)).toEqual([]);
        expect(await jobTokens(before)).toEqual([]);
        return;
      }
      if (late === "usable, minted in time") {
        // Its expiry is by the deadline: claimed by the superseded attempt, then ended; it can no longer read, and no record is left.
        expect(a.canonicalRepo().admits(lateToken!.plaintext, "read")).toBe(false);
        expect(await ledger(before)).toEqual([]);
        expect(await jobTokens(before)).toEqual([]);
        return;
      }
      // Lost: the late token is live past the deadline, and the record is still open, saying so.
      expect(lateToken!.expiresAt).toBeGreaterThan(recorded!.notAfter!);
      expect(a.canonicalRepo().admits(lateToken!.plaintext, "read")).toBe(true);
      expect(await ledger(before)).toEqual([expect.objectContaining({ id: recorded!.id, state: "unknown", lastError: "create failed: Error" })]);
      // It survives the room's restart, with its alarm, and stays open after the late token has expired too.
      const r = await restarted(before);
      const due = (await observation(r)).nextAt!;
      expect(await inDO(r, (room) => room.core.nextAlarm()!)).toBeLessThanOrEqual(await inDO(r, (room) => room.core.mints.nextDue()!));
      clock.now = Math.max(due, lateToken!.expiresAt + 1);
      await tick(r);
      expect(await ledger(r)).toEqual([expect.objectContaining({ id: recorded!.id, state: "unknown" })]);
      expect((await observation(r)).at).toBe(clock.now);
    });

  it("the room stops while a mint's answer is outstanding: the record survives as an unknown one, and the next attempt goes on", async () => {
    const { r: before, seen, from } = await owed();
    const a = before.world.artifacts;
    const calls = a.remoteCalls.get("createToken") ?? 0;
    a.holdTokenReply = (repo, scope) => scope === "read" && repo === a.canonical;
    void step(before).catch(() => undefined);
    await until(async () => (a.remoteCalls.get("createToken") ?? 0) > calls);
    const [recorded] = await ledger(before);
    expect(recorded).toMatchObject({ state: "sent", tokenId: null });
    const r = await restarted(before);
    a.holdTokenReply = null;
    const [minted] = readTokens(r, from);
    expect(minted!.revoked).toBe(false);
    // The new object took it over: unknown, never settled by the owner's end.
    expect(await ledger(r)).toEqual([expect.objectContaining({ id: recorded!.id, state: "unknown" })]);
    expect(await jobsOf(r)).toMatchObject([{ state: "sent", attempt: 1, token: null }]);
    clock.now = recorded!.notAfter!;
    await tick(r);
    expect(seen.length).toBeGreaterThan(0);
    expect((await ledger(r)).map((x) => x.id)).toContain(recorded!.id);
  });

  it("an inventory that is incomplete is noted as such; a live token the Room knows is not counted", async () => {
    const { r, seen, from } = await owed();
    const a = r.world.artifacts;
    a.loseReply("createToken");
    await step(r);
    const [recorded] = await ledger(r);
    const [lost] = readTokens(r, from);
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
    await mints(r);
    expect(await observation(r)).toMatchObject({ result: "no inventory: the listing is incomplete or malformed", unaccounted: null });
    (repo as { listTokens: unknown }).listTokens = list;
    clock.now = Math.max((await observation(r)).nextAt!, lost!.expiresAt + 1);
    await mints(r);
    // The sent attempt's token is live and known by its job token row; the lost one has expired, so none is unaccounted for. Still open.
    expect(repo.admits(/^Authorization: Bearer (.+)$/.exec(seen[0]!.gitAuthEnv.GIT_CONFIG_VALUE_0)![1]!, "read")).toBe(true);
    expect(await observation(r)).toMatchObject({ unaccounted: 0 });
    expect(await ledger(r)).toEqual([expect.objectContaining({ id: recorded!.id, state: "unknown" })]);
    await inDO(r, () => answer!());
    await inDO(r, (room) => room.core.idle());
  });

  it("an answer without token text: nothing is sent; the token is owed by its ID and revoked", async () => {
    const { r, seen, from } = await owed();
    const repo = r.world.artifacts.canonicalRepo();
    const mint = repo.createToken.bind(repo);
    (repo as { createToken: unknown }).createToken = async (scope: "read" | "write", ttl: number) => ({ ...(await mint(scope, ttl)), plaintext: undefined });
    await step(r);
    (repo as { createToken: unknown }).createToken = mint;
    expect(seen).toEqual([]);
    const [t] = readTokens(r, from);
    expect(await ledger(r)).toEqual([expect.objectContaining({ state: "owed", tokenId: t!.id, lastError: "no token text" })]);
    expect(await jobsOf(r)).toMatchObject([{ state: "owed", attempt: 1, token: null }]);
    await mints(r);
    expect(t!.revoked).toBe(true);
    expect(await ledger(r)).toEqual([]);
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

  it("an answer still outstanding: the mint stays recorded, nothing is sent; when it comes after the deadline, the token is ended and the record settled", async () => {
    const { r, seen, from } = await owed();
    const a = r.world.artifacts;
    const calls = a.remoteCalls.get("createToken") ?? 0;
    a.holdTokenReply = (repo, scope) => scope === "read" && repo === a.canonical;
    const running = step(r);
    await until(async () => (a.remoteCalls.get("createToken") ?? 0) > calls);
    const [recorded] = await ledger(r);
    expect(recorded).toMatchObject({ state: "sent" });
    expect(seen).toEqual([]);
    clock.now = recorded!.notAfter! + 1;
    a.holdTokenReply = null;
    await running;
    expect(seen).toEqual([]);
    expect(readTokens(r, from).every((t) => !a.canonicalRepo().admits(t.plaintext, "read"))).toBe(true);
    expect(await ledger(r)).toEqual([]);
    expect(await jobTokens(r)).toEqual([]);
  });
});

// ------------------------------------------------------------------ follow-up c9cd4cd8 (2) and (3)

describe("follow-up c9cd4cd8: an unknown mint's observation", () => {
  const storage = <T>(r: TestRoom, fn: (state: DurableObjectState) => Promise<T>) =>
    runInDurableObject(r.stub as unknown as DurableObjectStub<Room>, (_room: Room, state: DurableObjectState) => fn(state));

  for (const [label, odd] of [
    ["a record of an unknown scope", { scope: "admin" }],
    ["a record whose expiry is not a timestamp string", { expiresAt: 2026 }],
  ] as const)
    it(`(3) an inventory with ${label} is noted as incomplete, never counted; the unknown mint stays open`, async () => {
      const { r } = await owed();
      const a = r.world.artifacts;
      a.loseReply("createToken");
      await step(r);
      const [recorded] = await ledger(r);
      const repo = a.canonicalRepo();
      const list = repo.listTokens.bind(repo);
      (repo as { listTokens: unknown }).listTokens = async () => {
        const inv = await list();
        const record = { id: "tid_odd", scope: "read", state: "active", expiresAt: new Date(clock.now + 3_600_000).toISOString(), ...odd };
        return { tokens: [...inv.tokens, record], total: inv.total + 1 };
      };
      clock.now = recorded!.notAfter!;
      await mints(r);
      expect(await observation(r)).toMatchObject({ at: clock.now, result: "no inventory: the listing is incomplete or malformed", unaccounted: null });
      expect((await observation(r)).nextAt!).toBeGreaterThan(clock.now);
      expect(await ledger(r)).toEqual([expect.objectContaining({ id: recorded!.id, state: "unknown" })]);
      (repo as { listTokens: unknown }).listTokens = list;
    });

  it("(2) with no alarm stored, a fresh object stores one, and its alarm observes the unknown mint without settling it", async () => {
    const { r } = await owed();
    r.world.artifacts.loseReply("createToken");
    await step(r);
    const [recorded] = await ledger(r);
    await storage(r, (s) => s.storage.deleteAlarm());
    const after = await restarted(r);
    expect(await storage(after, (s) => s.storage.getAlarm()), "the fresh object stored an alarm").not.toBeNull();
    clock.now = Math.max(recorded!.notAfter!, (await observation(after)).nextAt!) + 1;
    expect(await runDurableObjectAlarm(after.stub as unknown as DurableObjectStub<Room>)).toBe(true);
    await inDO(after, (room) => room.core.mints.idle());
    expect(await ledger(after), "never settled by time or a clean inventory").toEqual([expect.objectContaining({ id: recorded!.id, state: "unknown" })]);
    expect(await observation(after)).toMatchObject({ at: clock.now, unaccounted: 0 });
    expect((await observation(after)).nextAt!).toBeGreaterThan(clock.now);
  });
});
