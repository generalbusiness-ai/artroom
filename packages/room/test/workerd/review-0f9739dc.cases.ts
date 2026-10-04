/**
 * Review 0f9739dc: two P2s in job delivery. The checker's diagnostic asserted
 * that a sent job left in flight blocked its deadline retry and left a past
 * alarm, and that a preview got no job. Each test here asserts the correct
 * outcome: one durable job per owner (a preview or a landing) with fenced
 * attempts and future due times (R-EXEC-8 to R-EXEC-10, R-OBL-7).
 */

import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import type { Check, CheckBody, CheckerConfig, CheckJob, Claim, Landing, LandOp, Proposal, Refusal, Result } from "@generalbusiness/artroom-contract";
import { policy, requireCheck } from "@generalbusiness/artroom-policy/helpers";
import type { Room } from "../../src/index.ts";
import { addMember, Client, clock, makeRoom, pushChange, tick, type TestRoom } from "./support.ts";

const inDO = <T>(r: TestRoom, fn: (room: Room) => T | Promise<T>) => runInDurableObject(r.stub as unknown as DurableObjectStub<Room>, fn);
const op = async (r: TestRoom, id: string) => (await r.admin.read({ q: "op", op: id as never })) as LandOp & { integration?: string; expectedMain: string };
const R = `sha256:${"0".repeat(64)}` as const;
const whole: CheckerConfig = { format: "artroom-checker-v1", volatile: false, timeoutSeconds: 60, runner: R };
const refusal: Refusal = { refused: true, rule: "check-binding", reason: "refused by the test service", fix: "none" };
const settled = (r: TestRoom) => inDO(r, (room) => room.core.idle());
const pause = () => new Promise((resolve) => setTimeout(resolve, 5));
const tokenOf = (job: CheckJob) => /^Authorization: Bearer (.+)$/.exec(job.gitAuthEnv.GIT_CONFIG_VALUE_0)![1]!;

async function checkRoom(cfg: CheckerConfig = whole) {
  const r = await makeRoom({ policy: policy(requireCheck("unit", { paths: "src/**", by: "@ci", id: "unit-tests" })), files: { ".artroom/checkers/unit.json": JSON.stringify(cfg), "package.json": "{}" } });
  return { r, alice: await addMember(r, "@alice", "member"), bob: await addMember(r, "@bob", "member"), ci: await addMember(r, "@ci", "checker") };
}

async function proposed(r: TestRoom, who: Client, scope: string[], changes: Record<string, string>, generation = 0) {
  const lane = generation === 0 ? (await who.ok<Claim>("claim", null, { goal: "work", scope })).lane : (scope[0] as never);
  const head = pushChange(r, lane, changes);
  await who.ok<Proposal>("propose", { lane }, { lease: 1, expectedGeneration: generation, head, summary: "change" });
  return { lane, head };
}

/** Hold the room's own start of these steps; a test runs them itself. */
const hold = (r: TestRoom, steps: readonly string[]) =>
  inDO(r, async (room) => {
    await room.core.idle();
    const run = room.core.run.bind(room.core);
    room.core.run = (step) => {
      if (!steps.includes(step)) run(step);
    };
  });

type Answer = "hang" | "refuse" | "sign";

/** Give a held call its late answer, from inside the room's object, where the call was made. */
const answer = (r: TestRoom, late: ((a: "refuse" | "sign") => void)[], i: number, a: "refuse" | "sign") => inDO(r, () => late[i]!(a));

/**
 * The checker's service. Each call answers by the plan, in order (then "sign"). "hang" answers only when the test
 * calls the resolver it leaves in `late`; "sign" signs the check and submits it to the room, as lane G's Checker does.
 */
function service(r: TestRoom, ci: Client, plan: Answer[] = []) {
  const seen: CheckJob[] = [];
  const late: ((answer: "refuse" | "sign") => void)[] = [];
  const sign = (job: CheckJob): Promise<Result<Check>> => {
    const signer = new Client({ id: r.id, stub: env.ROOMS.get(env.ROOMS.idFromName(r.id)) as never }, ci.keys);
    const body: CheckBody = { obligation: job.obligation, check: job.check, integration: job.integration, input: job.input, config: job.config, runner: job.runner ?? R, volatile: job.volatile, ok: true, detail: "Machine-run check", ...(job.landOp ? { landOp: job.landOp } : {}) };
    return signer.act<Check>("check", { lane: job.lane, generation: job.generation }, body);
  };
  r.world.checkers["unit"] = {
    handle(job) {
      seen.push(job);
      const answer = plan[seen.length - 1] ?? "sign";
      if (answer === "refuse") return Promise.resolve(refusal);
      if (answer === "sign") return sign(job);
      return new Promise((resolve) => late.push((a) => resolve(a === "refuse" ? refusal : sign(job))));
    },
  };
  return { seen, late };
}

const jobsOf = (r: TestRoom) => inDO(r, (room) => room.core.sql.all("SELECT owner, integration, base, state, attempt, next_ms, outcome FROM check_jobs ORDER BY rowid"));

// ------------------------------------------------------------------ P2 1: attempts under the durable scheduler

describe("review 0f9739dc P2 1: an unanswered attempt expires at its deadline under the durable scheduler", () => {
  async function sentAndHanging(plan: Answer[]) {
    const { r, alice, ci } = await checkRoom();
    await hold(r, ["jobs", "landing"]);
    const { lane, head } = await proposed(r, alice, ["src/**"], { "src/app.ts": "v2" });
    await settled(r);
    const s = service(r, ci, plan);
    const land = await alice.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
    await inDO(r, async (room) => {
      await room.core.landing.prepare(land.op.id);
      await room.core.steps.jobs();
    });
    await pause();
    expect(s.seen).toHaveLength(1);
    const first = s.seen[0]!;
    const deadline = Date.parse(first.deadline);
    expect(await jobsOf(r)).toMatchObject([{ owner: land.op.id, state: "sent", attempt: 1, next_ms: deadline }]);
    // While it is in flight, the alarm is due at the deadline, in the future.
    const due = await inDO(r, (room) => room.core.nextAlarm());
    expect(due).toBeGreaterThan(clock.now);
    expect(due).toBeLessThanOrEqual(deadline);
    return { r, land, first, deadline, ...s };
  }

  it("a slow call past its deadline: the next jobs step issues a new attempt with a new token, ends the expired one, and leaves nothing past due; a late refusal of the first attempt changes nothing", async () => {
    const { r, land, first, deadline, seen, late } = await sentAndHanging(["hang", "hang"]);
    clock.now = deadline + 1;
    await inDO(r, (room) => room.core.steps.jobs());
    await pause();
    expect(seen).toHaveLength(2);
    const second = seen[1]!;
    expect([first.id.endsWith("_1"), second.id.endsWith("_2"), second.id.slice(0, -2) === first.id.slice(0, -2)]).toEqual([true, true, true]);
    expect(Date.parse(second.deadline)).toBeGreaterThan(clock.now);
    const canonical = r.world.artifacts.canonicalRepo();
    // Ended: it expired by its deadline, so its record is settled with no revocation needed (R-MINT-4), and it reads nothing.
    const old = [...canonical.tokens.values()].find((t) => t.plaintext === tokenOf(first))!;
    expect(old.expiresAt).toBeLessThanOrEqual(deadline);
    expect(canonical.admits(tokenOf(first), "read")).toBe(false);
    expect(await inDO(r, (room) => room.core.sql.all("SELECT token_id FROM job_tokens WHERE token_id = ?", old.id))).toEqual([]);
    expect(canonical.admits(tokenOf(second), "read")).toBe(true);
    expect(await jobsOf(r)).toMatchObject([{ state: "sent", attempt: 2, next_ms: Date.parse(second.deadline) }]);
    expect(await inDO(r, (room) => room.core.nextAlarm())).toBeGreaterThan(clock.now);
    // The first attempt's wait has ended: only the second is still in flight.
    await answer(r, late, 0, "refuse");
    await pause();
    expect(await jobsOf(r)).toMatchObject([{ state: "sent", attempt: 2, outcome: null }]);
    // The second attempt answers with a check; the job is done and the landing lands.
    await answer(r, late, 1, "sign");
    await settled(r);
    expect(await jobsOf(r)).toMatchObject([{ state: "done", attempt: 2, outcome: expect.stringMatching(/^act_/) }]);
    await tick(r, 3);
    expect(await op(r, land.op.id)).toMatchObject({ state: "landed" });
  });

  it("the expired attempt's wait is released by the jobs step: the room has no work left waiting on it", async () => {
    const { r, deadline, late } = await sentAndHanging(["hang", "refuse"]);
    clock.now = deadline + 1;
    // Without the release, idle() would wait for the first attempt forever.
    const done = await Promise.race([
      inDO(r, async (room) => {
        await room.core.steps.jobs();
        await room.core.idle();
        return "idle";
      }),
      new Promise((resolve) => setTimeout(() => resolve("still waiting"), 2_000)),
    ]);
    expect(done).toBe("idle");
    expect(await jobsOf(r)).toMatchObject([{ state: "done", attempt: 2, outcome: "refused: check-binding" }]);
    await answer(r, late, 0, "refuse");
  });

  it("restart: an attempt in flight when the room stops is issued again at its deadline, and its check lands the change", async () => {
    const { r: before, land, deadline, seen, late } = await sentAndHanging(["hang", "sign"]);
    // The object stops with the call in flight; a new stub reaches a new object with nothing in memory.
    await runInDurableObject(before.stub as unknown as DurableObjectStub<Room>, (_room, state) => state.abort("restart")).catch(() => undefined);
    const stub = env.ROOMS.get(env.ROOMS.idFromName(before.id)) as unknown as TestRoom["stub"];
    const r: TestRoom = { ...before, stub, admin: new Client({ id: before.id, stub }, before.admin.keys) };
    expect(await jobsOf(r)).toMatchObject([{ state: "sent", attempt: 1 }]);
    expect(await inDO(r, (room) => room.core.nextAlarm())).toBeLessThanOrEqual(deadline);
    clock.now = deadline + 1;
    await tick(r, 3);
    expect(seen).toHaveLength(2);
    expect(await jobsOf(r)).toMatchObject([{ state: "done", attempt: 2, outcome: expect.stringMatching(/^act_/) }]);
    expect(await op(r, land.op.id)).toMatchObject({ state: "landed" });
    // Nothing in memory ended the first attempt: the step that found it expired ended its token, which had expired by
    // its deadline; its record is settled, and it reads nothing.
    const firstToken = [...r.world.artifacts.canonicalRepo().tokens.values()].find((t) => t.plaintext === tokenOf(seen[0]!))!;
    expect(r.world.artifacts.canonicalRepo().admits(firstToken.plaintext, "read")).toBe(false);
    expect(await inDO(r, (room) => room.core.sql.all("SELECT token_id FROM job_tokens WHERE token_id = ?", firstToken.id))).toEqual([]);
    void late; // The first attempt's call belonged to the stopped object.
  });
});

// ------------------------------------------------------------------ P2 2: preview jobs

describe("review 0f9739dc P2 2: a preview's integration gets jobs (R-EXEC-8)", () => {
  it("preview before land: the preview's job, with the preview's base and no landOp, meets the obligation, and the landing lands on it without another job", async () => {
    const { r, alice, bob, ci } = await checkRoom();
    const { seen } = service(r, ci);
    const { lane, head } = await proposed(r, alice, ["src/**"], { "src/app.ts": "v2" });
    await tick(r);
    const pv = (await r.admin.read({ q: "proposal", ref: { lane, generation: 1 } }))!.preview as { state: string; base: string; integration: string };
    expect(pv.state).toBe("clean");
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ integration: pv.integration, base: r.world.artifacts.main, input: { kind: "tree" } });
    expect(seen[0]).not.toHaveProperty("landOp");
    expect(await jobsOf(r)).toMatchObject([{ owner: expect.stringMatching(/^op_preview_/), state: "done", outcome: expect.stringMatching(/^act_/) }]);
    const l = await alice.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
    await tick(r, 3);
    expect(await op(r, l.op.id)).toMatchObject({ state: "landed", integration: pv.integration });
    expect(seen).toHaveLength(1);
    // Main moves again: the landed generation's preview is computed again, and owns no job.
    const other = await proposed(r, bob, ["docs/**"], { "docs/guide.md": "more" });
    const second = await bob.ok<Landing>("land", { lane: other.lane, generation: 1 }, { lease: 1, head: other.head });
    await tick(r, 4);
    expect(await op(r, second.op.id)).toMatchObject({ state: "landed" });
    expect(seen).toHaveLength(1);
    expect((await jobsOf(r)).filter((j) => j["state"] !== "done")).toEqual([]);
  });

  it("a room the registry does not bind issues no job, and its jobs wait in the future rather than due now", async () => {
    const { r, alice, ci } = await checkRoom();
    await hold(r, ["jobs"]);
    const { seen } = service(r, ci);
    await proposed(r, alice, ["src/**"], { "src/app.ts": "v2" });
    await settled(r);
    const out = await inDO(r, async (room) => {
      (room.core as { isBound: () => Promise<boolean> }).isBound = async () => false;
      await room.core.steps.jobs();
      return { rows: room.core.sql.all("SELECT state, next_ms FROM check_jobs"), alarm: room.core.nextAlarm() };
    });
    expect(seen).toEqual([]);
    expect(out.rows).toMatchObject([{ state: "owed" }]);
    expect(out.rows[0]!["next_ms"] as number).toBeGreaterThan(clock.now);
    expect(out.alarm).toBeGreaterThan(clock.now);
  });

  it("preview refresh after main moves: the new preview integration gets its own job, with the new base", async () => {
    const { r, alice, bob, ci } = await checkRoom();
    const { seen } = service(r, ci, ["refuse", "refuse"]);
    const main0 = r.world.artifacts.main;
    const mine = await proposed(r, alice, ["src/**"], { "src/app.ts": "v2" });
    await tick(r);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.base).toBe(main0);
    const other = await proposed(r, bob, ["docs/**"], { "docs/guide.md": "more" });
    const first = await bob.ok<Landing>("land", { lane: other.lane, generation: 1 }, { lease: 1, head: other.head });
    await tick(r, 4);
    expect(await op(r, first.op.id)).toMatchObject({ state: "landed" });
    const pv = (await r.admin.read({ q: "proposal", ref: { lane: mine.lane, generation: 1 } }))!.preview as { integration: string };
    expect(seen).toHaveLength(2);
    expect(seen[1]).toMatchObject({ lane: mine.lane, integration: pv.integration, base: r.world.artifacts.main });
    expect(seen[1]!.integration).not.toBe(seen[0]!.integration);
    expect(seen[1]!.base).not.toBe(seen[0]!.base);
  });

  it("an owed preview job whose lane moved to a new generation is not issued; the new generation's job is", async () => {
    const { r, alice, ci } = await checkRoom();
    await hold(r, ["jobs"]);
    const { seen } = service(r, ci, ["refuse"]);
    const g1 = await proposed(r, alice, ["src/**"], { "src/app.ts": "v2" });
    await settled(r);
    await proposed(r, alice, [g1.lane], { "src/app.ts": "v3" }, 1);
    await settled(r);
    expect((await jobsOf(r)).map((j) => j["state"])).toEqual(["owed", "owed"]);
    await inDO(r, async (room) => {
      await room.core.steps.jobs();
      await room.core.idle();
    });
    expect((await jobsOf(r)).map((j) => [j["state"], j["outcome"]])).toEqual([
      ["done", "not-needed"],
      ["done", "refused: check-binding"],
    ]);
    expect(seen.map((j) => j.generation)).toEqual([2]);
  });

  it("R-OBL-7 an advisory job still queued when its landing lands is delivered, and its check is recorded on the landed integration", async () => {
    const advisory: CheckerConfig = { ...whole, advisory: true };
    const { r, alice, ci } = await checkRoom(advisory);
    await hold(r, ["jobs", "landing"]);
    const { lane, head } = await proposed(r, alice, ["src/**"], { "src/app.ts": "v2" });
    await settled(r);
    const { seen } = service(r, ci);
    const l = await alice.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
    await inDO(r, async (room) => {
      await room.core.landing.prepare(l.op.id);
      await room.core.landing.evaluate(l.op.id);
      room.core.sql.transaction(() => room.core.landing.reserve(l.op.id));
      await room.core.landing.publish();
    });
    const landed = await op(r, l.op.id);
    expect(landed).toMatchObject({ state: "landed" });
    expect(await jobsOf(r)).toMatchObject([{ owner: l.op.id, state: "owed" }]);
    await inDO(r, async (room) => {
      await room.core.steps.jobs();
      await room.core.idle();
    });
    expect(seen).toEqual([expect.objectContaining({ landOp: l.op.id, advisory: true, integration: landed.integration })]);
    expect(await jobsOf(r)).toMatchObject([{ state: "done", outcome: expect.stringMatching(/^act_/) }]);
    const evidence = await inDO(r, (room) => room.core.sql.all("SELECT body FROM evidence WHERE kind = 'check'"));
    expect(evidence.map((e) => JSON.parse(e["body"] as string).canonical)).toEqual([landed.integration]);
  });
});
