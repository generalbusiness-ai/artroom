import { describe, expect, test } from "vitest";
import type { Entry, OperationId, Receipt, Seed } from "@generalbusiness/artroom-contract";
import { b64url, canonicalize, entryHash, intentDigest, newIncarnation, scopeIdOf, seedDigest, textDigest, timeMs, timeOf } from "@generalbusiness/artroom-bytes";
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

  test("the attempted marker precedes submission; accepted reply or config-save loss recovers the same founding after expiry, while an unsent expired plan sends nothing and an attempted unaccepted expired founding is refused", async () => {
    const clock = net.clock.now;
    platformNet.secret = b64url(crypto.getRandomValues(new Uint8Array(32)));
    platformNet.sessions = true;
    platformNet.inspector = reader;
    try { await recovering(); }
    finally {
      net.clock.now = clock;
      platformNet.secret = null;
      platformNet.sessions = false;
      platformNet.inspector = null;
    }
  });
});

async function recovering(): Promise<void> {
  // The real routed transport is explicitly trusted for its native service
  // acknowledgement. Injected response faults are not history proof. No Git
  // host runs; the command never obtains a genesis read for recovery.
  const scenario = (mode: "reply" | "save" | "unaccepted" | "unsent") => {
    const store = memoryStore();
    const submissions: string[] = [];
    let fault = true;
    let badReceipt: "hash" | "incarnation" | "definition" | "intent" | "kind" | "position" | "malformed-inc" | "malformed-hash" | null = null;
    let entryReads = 0;
    const ctx: Context = {
      now: () => timeMs(net.clock.now)!,
      store: { ...store, save: async (config) => {
        if (mode === "save" && fault && config.register) { fault = false; throw new Error("simulated config-save loss"); }
        await store.save(config);
      } },
      fetch: (async (url: string, init?: RequestInit) => {
        if (url.includes("/entries/")) entryReads++;
        const founding = url.endsWith("/v1/scopes") && init?.method === "POST";
        if (founding) {
          expect((await store.config())!.plan!.attempted).toMatch(/^sha256:/);
          submissions.push(String(init!.body));
          if (mode === "unaccepted" && fault) { fault = false; throw new Error("simulated request loss before delivery"); }
        }
        const response = await routed(url, init);
        if (founding && mode === "reply" && fault) { fault = false; throw new Error("simulated accepted reply loss"); }
        if (founding && badReceipt) {
          const answer = await response.json() as { receipt: Receipt };
          if (badReceipt === "hash") answer.receipt.fact.hash = textDigest("another entry");
          if (badReceipt === "definition") answer.receipt.definition = answer.receipt.definition === "platform:register@1" ? "platform:register@2" : "platform:register@1";
          if (badReceipt === "intent") answer.receipt.intent = textDigest("another intent");
          if (badReceipt === "kind") answer.receipt.fact.at.kind = "directory";
          if (badReceipt === "position") answer.receipt.fact.seq = 1;
          if (badReceipt === "incarnation") answer.receipt.fact.at.inc = newIncarnation(new Uint8Array(16).fill(9));
          if (badReceipt === "malformed-inc") answer.receipt.fact.at.inc = "malformed" as never;
          if (badReceipt === "malformed-hash") answer.receipt.fact.hash = "malformed" as never;
          return new Response(JSON.stringify(answer), { headers: { "content-type": "application/json" } });
        }
        return response;
      }) as Fetch,
    };
    ctx.trustedFoundingService = { service: SERVICE, fetch: ctx.fetch! };
    return { ctx, store, submissions, entryReads: () => entryReads, receipt: (bad: typeof badReceipt) => { badReceipt = bad; } };
  };
  for (const mode of ["reply", "save"] as const) {
    const s = scenario(mode);
    expect((await command(s.ctx, ["install", "--plan", SERVICE])).code).toBe(0);
    const original = (await s.store.config())!.plan!;
    // Capture the deliberately injected save failure only for this witness.
    const lost = await command(s.ctx, ["install", "--planned"]).catch(() => ({ code: 1 }));
    const pending = (await s.store.config())!;
    expect([lost.code, pending.register, pending.plan?.founding]).toEqual([1, undefined, original.founding]);
    expect(pending.plan?.attempted).toMatch(/^sha256:/);
    // A supported version and its recomputed ID still cannot replace the
    // exact version/ID bound by a prior attempt's marker.
    const changed = { ...pending.plan!, definition: "platform:register@1" as const, register: scopeIdOf({ v: 1, kind: "register", definition: "platform:register@1", creator: null, cause: intentDigest(original.founding.intent), ordinal: 0 }) };
    await s.store.save({ ...pending, plan: changed });
    expect([(await command(s.ctx, ["install", "--planned"])).lines[0]?.split(".")[0], s.submissions.length]).toEqual(["Refused: plan-mismatch", 1]);
    await s.store.save(pending);
    for (const replacement of [["install", "--plan", SERVICE], ["install", SERVICE]]) {
      expect((await command(s.ctx, replacement)).lines[0]).toMatch(/^Refused: install-pending\./);
      expect(await s.store.config()).toEqual(pending);
    }
    net.clock.now = timeOf(Date.parse(original.founding.intent.notAfter) + 901_000);
    const sends = s.submissions.length;
    const untrusted = { ...s.ctx };
    delete untrusted.trustedFoundingService;
    expect((await command(untrusted, ["install", "--planned"])).lines[0]).toMatch(/^Held: this injected transport/);
    expect([s.submissions.length, await s.store.config()]).toEqual([sends, pending]);
    if (mode === "reply") {
      for (const field of ["definition", "intent", "kind", "position", "malformed-inc", "malformed-hash"] as const) {
        s.receipt(field);
        expect((await command(s.ctx, ["install", "--planned"])).code).toBe(1);
        expect(await s.store.config()).toEqual(pending);
      }
      s.receipt(null);
    } else {
      // Acceptance was durably retained before the injected final-save loss.
      expect(pending.plan!.acknowledged).toMatchObject({ status: "service-acknowledged", service: SERVICE, receipt: { definition: original.definition, intent: intentDigest(original.founding.intent) } });
      for (const field of ["hash", "incarnation"] as const) {
        s.receipt(field);
        expect((await command(s.ctx, ["install", "--planned"])).lines[0]).toMatch(/^Held: the install acknowledgement conflicts/);
        expect(await s.store.config()).toEqual(pending);
      }
      s.receipt(null);
    }
    const recovered = await command(s.ctx, ["install", "--planned"]);
    const installed = (await s.store.config())!;
    expect([recovered.code, installed.register?.scope, s.entryReads()]).toEqual([0, original.register, 0]);
    expect(recovered.lines[1]).toMatch(/^Service-acknowledged identity recovery\./);
    expect(installed.plan).toMatchObject({ ...original, attempted: pending.plan!.attempted, acknowledged: { status: "service-acknowledged", service: SERVICE } });
    expect(new Set(s.submissions).size).toBe(1);
    const entries = await new Platform(original.register).entries();
    const genesis = entries[0]!;
    expect([entries.length, genesis.input.type === "genesis" && canonicalize(genesis.input.founding)]).toEqual([1, canonicalize(original.founding)]);
    expect(installed.plan!.acknowledged!.receipt.fact).toEqual({ at: genesis.at, seq: 0, hash: entryHash(genesis) });
    expect(timeMs(net.clock.now)! - timeMs(genesis.time)!).toBeGreaterThan(900_000);
  }
  const unsent = scenario("unsent");
  expect((await command(unsent.ctx, ["install", "--plan", SERVICE])).code).toBe(0);
  const unsentPlan = (await unsent.store.config())!.plan!;
  net.clock.now = timeOf(Date.parse(unsentPlan.founding.intent.notAfter) + 1000);
  expect([(await command(unsent.ctx, ["install", "--planned"])).lines[0]?.split(".")[0], unsent.submissions]).toEqual(["Refused: plan-expired", []]);

  const unaccepted = scenario("unaccepted");
  expect((await command(unaccepted.ctx, ["install", "--plan", SERVICE])).code).toBe(0);
  expect((await command(unaccepted.ctx, ["install", "--planned"])).code).toBe(1);
  const unacceptedPlan = (await unaccepted.store.config())!.plan!;
  net.clock.now = timeOf(Date.parse(unacceptedPlan.founding.intent.notAfter) + 1000);
  expect((await command(unaccepted.ctx, ["install", "--planned"])).lines[0]).toMatch(/^Refused: expired/);
  expect([(await unaccepted.store.config())!.register, new Set(unaccepted.submissions).size, unaccepted.submissions.length]).toEqual([undefined, 1, 2]);
}

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
  const sam: Context = { store: memoryStore(), fetch, now, trustedFoundingService: { service: SERVICE, fetch } };
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
  const rita: Context = { store: memoryStore(), fetch, now, pause, tries: 3, trustedFoundingService: { service: SERVICE, fetch } };
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
  expect([installed.code, installed.lines[0], (await rita.store.config())!.register?.scope]).toEqual([0, `Installed: register ${R.name}, under ${kept1.plan!.definition}, as planned.`, R.name]);
  expect((await rita.store.config())!.plan).toMatchObject({ ...kept1.plan!, acknowledged: { status: "service-acknowledged", service: SERVICE } });
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
