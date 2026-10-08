import { describe, expect, test } from "vitest";
import type { Entry, OperationId, Seed } from "@generalbusiness/artroom-contract";
import { b64url, intentDigest, seedDigest, timeMs } from "@generalbusiness/artroom-bytes";
import type { EffectRequest } from "../../scope/src/operations.ts";
import type { Fetch } from "@generalbusiness/artroom-client";
import { DIRECTORY, repositoryName } from "@generalbusiness/artroom-platform";
import { net } from "@generalbusiness/artroom-scope/testing";
import { platformNet } from "@generalbusiness/artroom-scope/testing/worker";
import { Platform, routed, settle } from "../../scope/test/repository.ts";
import { outsideOf, wired } from "../../scope/test/outside.ts";
import { command, memoryStore, type Context } from "../src/index.ts";

const SERVICE = "https://scopes.test";
/** The test's own reader, which the command never presents. */
const reader = "a test reader";

// Invariant: the register ID that `install --plan` prints is the one that `install --planned` founds, so the Git host's setting
// can pin it before the register exists, and a claim then creates its repository with no restart and no second run; a plan
// whose ID is not the one its intent makes, or whose time is over, is refused by name and nothing is sent; the config never
// holds a secret.
//
// Every scope is a Durable Object of the namespace `PLATFORM`, and every request of the command goes through the Worker's HTTP
// routes, as in `claim.scope.test.ts`. The readers are the real read sessions and signed reads, under a TEST SECRET. Three
// STAND-INs: the Git host is `OutsideDouble`, the register's outside port, wired by the planned ID before the register exists,
// as the Worker's host setting is when it pins that ID; it answers each creation as it is sent, with the name the register asks
// for; the scheduler is `pause`, which runs the dispatchers only; and the clock is the namespaces' scripted clock.
describe("install --plan and --planned. The Git host and the scheduler are STAND-INs", () => {
  test("the planned register ID is the founded one; with the host pinned to it before the install, a claim creates its repository in one run with no restart, sent once; a mismatched or expired plan is refused by name and sends nothing; a plain install founds another register; the config holds no secret", async () => {
    net.hold = net.deaf = null;
    platformNet.secret = b64url(crypto.getRandomValues(new Uint8Array(32)));
    platformNet.sessions = true;
    platformNet.inspector = reader;
    try {
      await planned();
    } finally {
      platformNet.secret = null;
      platformNet.sessions = false;
      platformNet.inspector = null;
    }
  });
});

async function planned(): Promise<void> {
  const fetch = ((url: string, init?: RequestInit) => routed(url, init)) as unknown as Fetch;
  const now = () => timeMs(net.clock.now)!;
  const founds = async (R: Platform) => (await R.entries()).filter((entry): entry is Entry & { input: { type: "act" } } => entry.input.type === "act" && entry.input.signed.intent.kind === "found");
  const exists = async (name: string) => (await new Platform(name as never).stub.summary(reader)).ok;
  const noSecret = async (ctx: Context) => {
    const text = JSON.stringify(await ctx.store.config());
    for (const name of ["operator", "recovery"]) {
      const secret = await ctx.store.secret(name);
      if (secret) expect(text).not.toContain(b64url(secret));
    }
  };

  // A mismatched plan: its kept register ID is not the one its intent makes. Refused by name; nothing is sent, so no register exists.
  const sam: Context = { store: memoryStore(), fetch, now };
  expect((await command(sam, ["install", "--plan", SERVICE, "--host", "git.example", "--namespace", "artroom"])).code).toBe(0);
  const samPlan = (await sam.store.config())!.plan!;
  const other = samPlan.register.replace(/.$/, (c) => (c === "a" ? "b" : "a"));
  await sam.store.save({ ...(await sam.store.config())!, plan: { ...samPlan, register: other as never } });
  const mismatched = await command(sam, ["install", "--planned"]);
  expect([mismatched.code, mismatched.lines[0]?.split(".")[0]]).toEqual([1, "Refused: plan-mismatch"]);
  expect([(await sam.store.config())!.register, await exists(samPlan.register), await exists(other)]).toEqual([undefined, false, false]);
  // Control: the same plan, unchanged, founds.
  await sam.store.save({ ...(await sam.store.config())!, plan: samPlan });

  // An expired plan: refused by name before anything is sent.
  const late: Context = { ...sam, now: () => Date.parse(samPlan.founding.intent.notAfter) };
  const expired = await command(late, ["install", "--planned"]);
  expect([expired.code, expired.lines[0]?.split(".")[0], await exists(samPlan.register)]).toEqual([1, "Refused: plan-expired", false]);
  const kept = await command(sam, ["install", "--planned"]);
  expect([kept.code, (await sam.store.config())!.register?.scope]).toEqual([0, samPlan.register]);

  // Control: a plan, then a plain install, founds another register than the planned one.
  const paul: Context = { store: memoryStore(), fetch, now };
  expect((await command(paul, ["install", "--plan", SERVICE])).code).toBe(0);
  const paulPlan = (await paul.store.config())!.plan!;
  expect((await command(paul, ["install", SERVICE])).code).toBe(0);
  expect((await paul.store.config())!.register!.scope).not.toBe(paulPlan.register);

  // The new order. Plan: the register ID and the seed's time are printed, and the plan is kept with no secret.
  const host: { R: Platform | null } = { R: null };
  // STAND-IN for the Git host: each creation is answered as it is sent, with the name the register asks for.
  const answering = async () => {
    if (!host.R) return;
    for (const request of outsideOf(host.R.name).sent) answer(request, await host.R.at());
  };
  const answer = (request: EffectRequest, at: Awaited<ReturnType<Platform["at"]>>) => {
    const entry = request.origin.entry;
    if (entry.input.type !== "act") return;
    const seed: Seed = { v: 1, kind: "directory", definition: DIRECTORY, creator: at, cause: intentDigest(entry.input.signed.intent), ordinal: 0 };
    outsideOf(host.R!.name).answer(request.operation, request.attempt, { result: "confirmed", evidence: { basis: "own-answer", body: { name: repositoryName(seedDigest(seed), 1), id: `repo-${entry.seq}` } } });
  };
  const pause = async (waiting: readonly string[]) => { await answering(); await settle(...waiting.map((scope) => new Platform(scope as never))); };
  const rita: Context = { store: memoryStore(), fetch, now, pause, tries: 3 };
  const run = (...argv: string[]) => command(rita, argv);
  const plan = await run("install", "--plan", SERVICE, "--host", "git.example", "--namespace", "artroom");
  const kept1 = (await rita.store.config())!;
  expect([plan.code, kept1.register, kept1.plan?.register]).toEqual([0, undefined, expect.stringMatching(/^sc_/)]);
  expect(plan.lines).toEqual([
    `Planned: register ${kept1.plan!.register}, under ${kept1.plan!.definition}, on host git.example, namespace artroom. The seed's time is ${kept1.plan!.founding.intent.notAfter}.`,
    `Set registerScope to ${kept1.plan!.register} in the Worker's host setting, then run artroom install --planned before ${kept1.plan!.founding.intent.notAfter}.`,
  ]);
  await noSecret(rita);

  // The setting pins the planned ID before the register exists: the port of that name accepts, from the object's first life.
  const R = new Platform(kept1.plan!.register);
  const port = outsideOf(R.name);
  port.accepting = true;
  wired.set(R.name, () => ({ outside: port }));
  host.R = R;

  // Install as planned: the founded register is the planned one.
  const installed = await run("install", "--planned");
  expect([installed.code, installed.lines[0], (await rita.store.config())!.register?.scope, (await rita.store.config())!.plan]).toEqual([0, `Installed: register ${R.name}, under ${kept1.plan!.definition}, as planned.`, R.name, undefined]);
  await noSecret(rita);

  // Claim: one run, no restart, and the creation is sent once.
  const claimed = await run("claim", "demo", "--handle", "@rita");
  expect(claimed.code, `${claimed.lines.join("\n")} sent: ${port.attempts.join(" ")}`).toBe(0);
  const [found] = await founds(R);
  expect([(await founds(R)).length, port.attempts]).toEqual([1, [`${found!.seq}:0#1` as OperationId]]);
  expect((await rita.store.config())!.handle).toBe("@rita");
  await noSecret(rita);
  wired.delete(R.name);
}
