import { expect, test } from "vitest";
import type { PlatformDefinition, Receipt, SignedIntent } from "@generalbusiness/artroom-contract";
import { canonicalize, intentDigest, newIncarnation, scopeIdOf, textDigest } from "@generalbusiness/artroom-bytes";
import type { Fetch } from "@generalbusiness/artroom-client";
import { APPLICATION_COHORT, COUNTING_COHORT, ROOM_NAME_COHORT } from "@generalbusiness/artroom-platform";
import { command, install, installPlanned, memoryStore, planInstall, type Config, type Context, type Store } from "../src/index.ts";

const SERVICE = "https://cohort.test";
const COHORT = "counting-commitments" as const;
const COHORTS = [
  { name: COHORT, definition: COUNTING_COHORT.register, other: "application" },
  { name: "application", definition: APPLICATION_COHORT.register, other: COHORT },
  { name: "shared-name", definition: ROOM_NAME_COHORT.register, other: "application" },
] as const;
// Fake service answers and memory storage: no native authority or host proof.
function scenario(fault: "none" | "reply" | "save" = "none") {
  const store = memoryStore();
  const bodies: string[] = [];
  let failed = false;
  let saves = 0;
  let keyReads = 0;
  let keyWrites = 0;
  let receipt: Receipt | null = null;
  const wrapped: Store = {
    ...store,
    secret: async name => { keyReads++; return store.secret(name); },
    keep: async (name, key) => { keyWrites++; await store.keep(name, key); },
    save: async config => {
      saves++;
      if (fault === "save" && !failed && config.register) { failed = true; throw new Error("fake final config-save loss"); }
      await store.save(config);
    },
  };
  const ctx: Context = {
    store: wrapped, now: () => Date.parse("2026-10-09T12:00:00Z"),
    fetch: (async (_url, init) => {
      const body = String(init?.body);
      const request = JSON.parse(body) as { founding: SignedIntent; definition: PlatformDefinition };
      const kept = (await store.config())!;
      if (request.definition === COUNTING_COHORT.register || request.definition === APPLICATION_COHORT.register || request.definition === ROOM_NAME_COHORT.register) {
        expect(kept.plan?.attempted).toMatch(/^sha256:/);
        expect(canonicalize(kept.plan?.founding)).toBe(canonicalize(request.founding));
        expect(kept.plan?.definition).toBe(request.definition);
      }
      bodies.push(body);
      receipt ??= {
        fact: { at: { kind: "register", scope: scopeIdOf({ v: 1, kind: "register", definition: request.definition, creator: null, cause: intentDigest(request.founding.intent), ordinal: 0 }), inc: newIncarnation(new Uint8Array(16).fill(9)) }, seq: 0, hash: textDigest("fake service acknowledgement") },
        definition: request.definition, intent: intentDigest(request.founding.intent), effects: [], sends: [], epoch: 0,
      };
      if (fault === "reply" && !failed) { failed = true; throw new Error("fake accepted reply loss"); }
      return new Response(JSON.stringify({ answer: "accepted", receipt }));
    }) as Fetch,
  };
  ctx.trustedFoundingService = { service: SERVICE, fetch: ctx.fetch! };
  return { ctx, store, bodies, metrics: () => ({ saves, keyReads, keyWrites }) };
}

test("closed cohort selection preserves legacy defaults and refuses retained binding conflicts without replacing custody", async () => {
  const bad = scenario();
  for (const args of [["install", SERVICE, "--cohort"], ["install", SERVICE, "--cohort", "latest"], ["install", SERVICE, "--cohort", ""], ["install", SERVICE, "--cohort", COHORT, "--cohort", COHORT], ["install", SERVICE, "--cohort", "application", "--cohort", COHORT]]) {
    expect((await command(bad.ctx, args)).code).toBe(2);
  }
  expect((await install(bad.ctx, SERVICE, { cohort: "latest" as never })).code).toBe(2);
  expect([bad.metrics(), bad.bodies, await bad.store.config()]).toEqual([{ saves: 0, keyReads: 0, keyWrites: 0 }, [], null]);
  const legacy = scenario();
  expect((await command(legacy.ctx, ["install", "--plan", SERVICE])).code).toBe(0);
  const legacyPlan = (await legacy.store.config())!.plan!;
  expect(legacyPlan.definition).toBe("platform:register@3");
  for (const { name } of COHORTS) {
    const metrics = legacy.metrics();
    expect((await command(legacy.ctx, ["install", SERVICE, "--cohort", name])).code).toBe(1);
    expect((await command(legacy.ctx, ["install", "--planned", "--cohort", name])).code).toBe(1);
    expect([(await legacy.store.config())!.plan, legacy.metrics(), legacy.bodies]).toEqual([legacyPlan, metrics, []]);
  }
  expect((await command(legacy.ctx, ["install", SERVICE])).code).toBe(0);
  expect((await legacy.store.config())!.register!.scope).not.toBe(legacyPlan.register);

  for (const { name, definition, other } of COHORTS) {
    const s = scenario();
    expect((await command(s.ctx, ["install", "--plan", SERVICE, "--cohort", name, "--host", "artifacts", "--namespace", "room"])).code).toBe(0);
    const original = (await s.store.config())!;
    expect([original.plan!.definition, s.bodies]).toEqual([definition, []]);
    expect((await command(s.ctx, ["install", "--plan", SERVICE, "--cohort", name])).code).toBe(0);
    expect(await s.store.config()).toEqual(original);
    const metrics = s.metrics();
    for (const args of [
      ["install", SERVICE, "--cohort", name, "--host", "github.com"],
      ["install", "--plan", SERVICE, "--cohort", name, "--namespace", "other"],
      ["install", "https://other.test", "--cohort", name],
      ["install", SERVICE, "--cohort", other], ["install", "--plan", SERVICE, "--cohort", other],
      ["install", "--planned", "--cohort", other],
      ["install", SERVICE], ["install", "--plan", SERVICE],
    ]) {
      expect((await command(s.ctx, args)).code).toBe(1);
      expect(await s.store.config()).toEqual(original);
    }
    expect([s.metrics(), s.bodies]).toEqual([metrics, []]);
    expect((await command(s.ctx, ["install", "--planned", "--host", "artifacts", "--cohort", name])).code).toBe(2);
    expect((await command(s.ctx, ["install", "--planned"])).code).toBe(0);
    expect(canonicalize((await s.store.config())!.plan!.founding)).toBe(canonicalize(original.plan!.founding));
    expect((await s.store.config())!.register!.scope).toBe(original.plan!.register);
  }
});

test("selected delivery requires exact plan and attempt readback and recovers the original envelope after reply or final-save loss", async () => {
  for (const { name } of COHORTS) {
    for (const mode of ["reply", "save"] as const) {
      const s = scenario(mode);
      const first = await install(s.ctx, SERVICE, { cohort: name }).catch(() => ({ code: 1 }));
      expect(first.code).toBe(1);
      const pending = (await s.store.config())!;
      expect([pending.register, pending.plan?.attempted]).toEqual([undefined, expect.stringMatching(/^sha256:/)]);
      const original = canonicalize(pending.plan!.founding);
      expect((await install(s.ctx, SERVICE, { cohort: name })).code).toBe(0);
      const kept = (await s.store.config())!;
      expect([kept.register!.scope, canonicalize(kept.plan!.founding), new Set(s.bodies).size]).toEqual([pending.plan!.register, original, 1]);
    }
    // A store that silently drops the attempted marker provides no custody.
    const s = scenario();
    expect((await planInstall(s.ctx, SERVICE, { cohort: name })).code).toBe(0);
    const original: Config = (await s.store.config())!;
    s.ctx.store = { ...s.ctx.store, save: async next => { if (!next.plan?.attempted) await s.store.save(next); } };
    expect((await installPlanned(s.ctx, { cohort: name })).code).toBe(1);
    expect([s.bodies, await s.store.config()]).toEqual([[], original]);
    // A save callback mutating its argument cannot replace the signed plan.
    const changed = scenario();
    changed.ctx.store = { ...changed.ctx.store, save: async next => {
      if (next.plan) next.plan.service = "https://substituted.test";
      await changed.store.save(next);
    } };
    expect((await install(changed.ctx, SERVICE, { cohort: name })).code).toBe(1);
    expect(changed.bodies).toEqual([]);
  }
});
