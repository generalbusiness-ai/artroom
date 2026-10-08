import { expect, test } from "vitest";
import { b64url, entryHash, intentDigest, keyIdOfSecret, textDigest, timeMs } from "@generalbusiness/artroom-bytes";
import type { Fetch } from "@generalbusiness/artroom-client";
import { net } from "@generalbusiness/artroom-scope/testing";
import { platformNet } from "@generalbusiness/artroom-scope/testing/worker";
import { Platform, routed } from "../../scope/test/repository.ts";
import { command, memoryStore, type Context } from "../../cli/src/index.ts";
import { INSTALL_ACKNOWLEDGEMENT, judged, plannedOperator, rehearse } from "../../../scripts/demo/rehearse.ts";

// Real native install routes and retained accepted receipt. Only transport
// selection/clock are scripted; no host/provider or browser activity occurs.
// This boundary is run on the separate current-CLI + reviewed-install API
// composition; the older runner predecessor cannot emit the new interface.
test("rehearsal binds its public operator identity to the signed plan and exact service acknowledgement", async () => {
  const service = "https://scopes.test";
  const stage = { service, host: "artifacts", namespace: "demo-interface" };
  const reader = "a test reader";
  const fetch = ((url: string, init?: RequestInit) => routed(url, init)) as unknown as Fetch;
  const context = { store: memoryStore(), fetch, trustedFoundingService: { service, fetch }, now: () => timeMs(net.clock.now)! };
  const ctx: Context = context;
  platformNet.secret = b64url(crypto.getRandomValues(new Uint8Array(32)));
  platformNet.sessions = true;
  platformNet.inspector = reader;
  try {
    expect((await command(ctx, ["install", "--plan", service, "--host", stage.host, "--namespace", stage.namespace])).code).toBe(0);
    const before = (await ctx.store.config())! as NonNullable<Awaited<ReturnType<typeof ctx.store.config>>> & { plan: { register: string; definition: string; founding: { intent: { actor: string } } } };
    const { register, definition } = before.plan;
    const actor = keyIdOfSecret((await ctx.store.secret(before.key))!);
    expect(await plannedOperator(ctx, stage, register, definition, false)).toBe(actor);
    expect(await plannedOperator(ctx, { ...stage, namespace: "another namespace" }, register, definition, false)).toBeNull();
    const installed = await command(ctx, ["install", "--planned"]);
    expect(judged({ code: 0, lines: [`Installed: register ${register}, under ${definition}, as planned.`, INSTALL_ACKNOWLEDGEMENT] }, installed, {})).toBeNull();
    const config = (await ctx.store.config())!;
    expect(await plannedOperator(ctx, stage, register, definition, true)).toBe(actor);
    const genesis = (await new Platform(register as never).entries())[0]!;
    const saved = config as typeof config & { plan: { acknowledged: { receipt: { intent: string; fact: unknown } } } };
    expect(saved.plan.acknowledged.receipt.fact).toEqual({ at: genesis.at, seq: 0, hash: entryHash(genesis) });
    expect(genesis.input.type === "genesis" && genesis.input.founding?.intent.actor).toBe(actor);
    expect(genesis.input.type === "genesis" && intentDigest(genesis.input.founding!.intent)).toBe(saved.plan.acknowledged.receipt.intent);
    const changed = structuredClone(saved);
    changed.plan.acknowledged.receipt.intent = textDigest("another founding");
    const wrong = { ...ctx, store: { ...ctx.store, config: async () => changed } };
    expect(await plannedOperator(wrong, stage, register, definition, true)).toBeNull();
    const text = installed.lines.join("\n");
    expect(text).not.toContain(b64url((await ctx.store.secret(before.key))!));
    expect(text).not.toContain("independently verified");
    // The real planning command prints its own derived ID. A substituted
    // saved ID must not drive the pin hook or any later shot.
    const store = memoryStore();
    let pins = 0;
    const stopped = await rehearse({ ...stage, name: "held install", person: () => ({ ...context, store: { ...store, save: async (saved) => {
      const value = structuredClone(saved) as typeof saved & { plan?: { register: string } };
      if (value.plan) value.plan.register = register;
      await store.save(value);
    } } }), pin: async () => { pins++; return "unexpected pin"; }, get: async () => { throw new Error("unexpected page read"); }, log: async () => { throw new Error("unexpected git"); } });
    expect([pins, stopped.shots[0]!.why, stopped.shots.slice(1).every((shot) => shot.code === -1)]).toEqual([0, "planned install identity is missing or inconsistent", true]);
  } finally {
    platformNet.secret = null;
    platformNet.sessions = false;
    platformNet.inspector = null;
  }
});
