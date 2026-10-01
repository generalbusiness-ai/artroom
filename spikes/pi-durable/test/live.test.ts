/**
 * The live run: the same agent and Room, with a real model on OpenRouter in
 * place of the scripted one. It runs only when OPENROUTER_API_KEY is in the
 * host environment (README, "Live run"); otherwise it is skipped.
 *
 * The run is reset once, after the room admitted the `propose` and before
 * the tool's result was committed. It prints one JSON summary line, with no
 * credential in it.
 */

import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { generateSigner, type PrivateJwk } from "@generalbusiness/artroom-client";
import type { DelegationId, LandOp, LogEntry, RosterRecord, RoomId } from "@generalbusiness/artroom-contract";
import { addMember, clock, day, iso, makeRoom, pushChange, tick } from "../vendor/artroom/packages/room/test/workerd/support.ts";
import { controls, type Agent } from "../src/agent.ts";

const e = env as unknown as { AGENTS: DurableObjectNamespace<Agent>; OPENROUTER_API_KEY?: string; SPIKE_LIVE_MODEL?: string };
const live = typeof e.OPENROUTER_API_KEY === "string" && e.OPENROUTER_API_KEY.length > 0;
const MODEL_ID = e.SPIKE_LIVE_MODEL ?? "openai/gpt-4.1-mini";

it.skipIf(!live)(`live: ${MODEL_ID} on OpenRouter claims, proposes and lands through a reset after propose`, { timeout: 300_000 }, async () => {
  controls.reset();
  const room = await makeRoom();
  const alice = await addMember(room, "@alice", "member");
  const { signer, jwk } = await generateSigner({ extractable: true });
  const grant = await alice.ok<RosterRecord>("roster", null, { op: "delegate", to: signer.key, kinds: ["claim", "propose", "land", "release", "note"], lanes: "*", expiresAt: iso(clock.now + day) });
  controls.workspace = (lane, files) => pushChange(room, lane, files);
  controls.now = () => clock.now;
  controls.crashes.add("propose:after-send");
  const name = `live-${crypto.randomUUID()}`;
  const stub = () => e.AGENTS.get(e.AGENTS.idFromName(name));
  await stub().setup(room.id as RoomId, jwk as PrivateJwk, grant.id as DelegationId, { provider: "openrouter", modelId: MODEL_ID });

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
  const log: LogEntry[] = [...(await room.admin.read({ q: "log", req: { limit: 500 } })).acts];
  const mine = log.flatMap((x) => (x.entry.type !== "system" && x.entry.act.envelope.actor === signer.key ? [x.entry] : []));
  const acts = mine.flatMap((x) => (x.type === "act" ? [x.act.envelope.kind] : []));
  const refusals = mine.flatMap((x) => (x.type === "refusal" ? [x.receipt.refusal.rule] : []));
  const lane = (await stub().lane())!;
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
