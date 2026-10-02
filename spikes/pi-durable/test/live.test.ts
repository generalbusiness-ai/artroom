/**
 * The live run: the same agent and Room, with a real model on OpenRouter in
 * place of the scripted one. It runs only when OPENROUTER_API_KEY is in the
 * host environment (README, "Live run"); otherwise it is skipped.
 *
 * The run is reset once, after the room admitted the `propose` and before
 * the tool's result was committed. It prints one JSON summary line, with no
 * credential in it. The landing's state is read from the room twice: when
 * the model has answered, and after the room's alarm has run. The model's
 * answer is not evidence of either.
 */

import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import type { LandOp } from "@generalbusiness/artroom-contract";
import { tick } from "../vendor/artroom/packages/room/test/workerd/support.ts";
import { controls } from "../src/agent.ts";
import { agentActs, landingNow, logOf, setup, stub as stubOf } from "./support.ts";

const e = env as unknown as { OPENROUTER_API_KEY?: string; SPIKE_LIVE_MODEL?: string };
const live = typeof e.OPENROUTER_API_KEY === "string" && e.OPENROUTER_API_KEY.length > 0;
const MODEL_ID = e.SPIKE_LIVE_MODEL ?? "openai/gpt-4.1-mini";

it.skipIf(!live)(`live: ${MODEL_ID} on OpenRouter claims, proposes and lands through a reset after propose`, { timeout: 300_000 }, async () => {
  controls.reset();
  const s = await setup({ provider: "openrouter", modelId: MODEL_ID });
  const room = s.room;
  controls.crashes.add("propose:after-send");
  const stub = () => stubOf(s.agentName);

  const task = "Add a file docs/pi-durable.md that says, in one sentence, that a pi-durable agent wrote it. Then land it.";
  const crashes: string[] = [];
  let out: { status: string; answer: string } | undefined;
  const started = Date.now();
  while (out === undefined) {
    try {
      out = await stub().run(task, "live-1");
    } catch (err) {
      crashes.push(String((err as Error).message ?? err).slice(0, 120));
      if (crashes.length > 2) throw err;
    }
  }
  const { acts, refusals } = agentActs(await logOf(room), s.agentKey);
  const lane = (await stub().lane())!;
  // What the room says when the model gives its answer, before the room's alarm has run: the answer is not proof of landing.
  const landingWhenAnswered = (await landingNow(s)) ?? null;
  await tick(room, 3);
  const op = lane.landOp ? ((await room.admin.read({ q: "op", op: lane.landOp as never })) as LandOp) : undefined;
  const transcript = await stub().transcript();
  const summary = {
    model: `openrouter/${MODEL_ID}`,
    seconds: Math.round((Date.now() - started) / 1000),
    crashes,
    opens: controls.opens,
    sends: Object.fromEntries(controls.sends),
    acts,
    refusals,
    landingWhenAnswered,
    landing: op?.state ?? null,
    mainIsHead: room.world.artifacts.main === lane.head,
    answer: out.answer,
    responseModels: [...new Set(transcript.flatMap((t) => (t.model ? [t.model] : [])))],
    transcript: transcript.filter((t) => t.role !== "system").map((t) => ({ role: t.role ?? t.kind, ...(t.tool ? { tool: t.tool } : {}), ...(t.error ? { error: true } : {}), text: t.text.slice(0, 200) })),
    usage: await stub().usage(),
  };
  console.log(`SPIKE-LIVE ${JSON.stringify(summary)}`);
  expect(crashes.length).toBe(1);
  expect(acts.filter((k) => k === "claim").length).toBe(1);
  expect(acts.filter((k) => k === "propose").length).toBe(1);
  expect(acts.filter((k) => k === "land").length).toBe(1);
  expect(op?.state).toBe("landed");
});
