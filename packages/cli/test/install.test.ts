import { expect, test } from "vitest";
import { signIntent } from "@generalbusiness/artroom-bytes";
import type { Fetch } from "@generalbusiness/artroom-client";
import { command, memoryStore, type Context } from "../src/index.ts";

// A saved plan is authorization for one service and operator, not merely
// metadata whose ID happens to hash. Malformed or substituted plans send
// nothing and leave the exact saved bytes available for diagnosis.
test("a malformed or substituted planned install is refused without network or config changes", async () => {
  let requests = 0;
  const fetch = (async () => { requests++; throw new Error("unexpected network"); }) as Fetch;
  const ctx: Context = { store: memoryStore(), fetch, now: () => Date.parse("2026-10-08T12:00:00Z") };
  expect((await command(ctx, ["install", "--plan", "https://scopes.test"])).code).toBe(0);
  const original = (await ctx.store.config())!;
  const plan = original.plan!;
  const foreign = signIntent({ ...plan.founding.intent, kind: "found" }, (await ctx.store.secret("operator"))!);
  for (const altered of [
    { ...plan, founding: { intent: null, sig: plan.founding.sig } },
    { ...plan, founding: foreign },
    { ...plan, service: "https://another.test" },
    { ...plan, founding: { ...plan.founding, sig: foreign.sig } },
  ]) {
    const saved = { ...original, plan: altered } as typeof original;
    await ctx.store.save(saved);
    const answer = await command(ctx, ["install", "--planned"]);
    expect([answer.code, answer.lines[0]?.startsWith("Refused: plan-mismatch."), requests]).toEqual([1, true, 0]);
    expect(await ctx.store.config()).toEqual(saved);
  }
  await ctx.store.save({ ...original, key: "device" });
  expect((await command(ctx, ["install", "--planned"])).lines[0]).toMatch(/^Refused: plan-mismatch\./);
  expect(requests).toBe(0);
});
