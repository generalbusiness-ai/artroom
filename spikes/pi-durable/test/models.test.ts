/**
 * Provider selection: which live provider and model SPIKE_LIVE picks
 * (src/live.ts), which providers the Agent registers from its bindings, and
 * the Workers AI binding provider's request and response, over a fake
 * binding (src/models.ts). No network.
 */

import { describe, expect, it } from "vitest";
import { createModels, InMemoryCredentialStore, Type, type Context } from "@earendil-works/pi-ai";
import { DEFAULT_LIVE_PROVIDER, liveModel, WORKERS_AI_MODEL } from "../src/live.ts";
import { addProviders, workersAiFetch, type AiRunner, type ModelEnv } from "../src/models.ts";

describe("liveModel", () => {
  it("is off unless SPIKE_LIVE is set", () => {
    expect(liveModel({})).toBeUndefined();
    expect(liveModel({ SPIKE_LIVE: "" })).toBeUndefined();
    // A key alone does not start a live run.
    expect(liveModel({ OPENROUTER_API_KEY: "k" })).toBeUndefined();
  });

  it("defaults to Workers AI through the binding, with GLM-4.7-Flash, and needs no key", () => {
    expect(DEFAULT_LIVE_PROVIDER).toBe("workers-ai");
    expect(WORKERS_AI_MODEL).toBe("@cf/zai-org/glm-4.7-flash");
    expect(liveModel({ SPIKE_LIVE: "1" })).toEqual({ provider: "workers-ai", modelId: "@cf/zai-org/glm-4.7-flash" });
    expect(liveModel({ SPIKE_LIVE: "workers-ai" })).toEqual({ provider: "workers-ai", modelId: "@cf/zai-org/glm-4.7-flash" });
    // An OpenRouter key present does not change the default.
    expect(liveModel({ SPIKE_LIVE: "1", OPENROUTER_API_KEY: "k" })).toEqual({ provider: "workers-ai", modelId: "@cf/zai-org/glm-4.7-flash" });
  });

  it("selects OpenRouter by configuration, with its key", () => {
    expect(liveModel({ SPIKE_LIVE: "openrouter", OPENROUTER_API_KEY: "k" })).toEqual({ provider: "openrouter", modelId: "openai/gpt-4.1-mini" });
    expect(() => liveModel({ SPIKE_LIVE: "openrouter" })).toThrow(/needs OPENROUTER_API_KEY/);
  });

  it("selects Workers AI over REST with both Cloudflare variables", () => {
    const both = { CLOUDFLARE_API_KEY: "k", CLOUDFLARE_ACCOUNT_ID: "a" };
    expect(liveModel({ SPIKE_LIVE: "cloudflare-workers-ai", ...both })).toEqual({ provider: "cloudflare-workers-ai", modelId: "@cf/zai-org/glm-4.7-flash" });
    expect(() => liveModel({ SPIKE_LIVE: "cloudflare-workers-ai", CLOUDFLARE_API_KEY: "k" })).toThrow(/needs CLOUDFLARE_ACCOUNT_ID in/);
    expect(() => liveModel({ SPIKE_LIVE: "cloudflare-workers-ai", CLOUDFLARE_ACCOUNT_ID: "a" })).toThrow(/needs CLOUDFLARE_API_KEY in/);
  });

  it("takes SPIKE_LIVE_MODEL over the provider's default", () => {
    expect(liveModel({ SPIKE_LIVE: "1", SPIKE_LIVE_MODEL: "@cf/google/gemma-4-26b-a4b-it" })).toEqual({ provider: "workers-ai", modelId: "@cf/google/gemma-4-26b-a4b-it" });
    expect(liveModel({ SPIKE_LIVE: "1", SPIKE_LIVE_MODEL: "" })?.modelId).toBe(WORKERS_AI_MODEL);
  });

  it("refuses an unknown provider", () => {
    expect(() => liveModel({ SPIKE_LIVE: "anthropic" })).toThrow(/not one of/);
    expect(() => liveModel({ SPIKE_LIVE: "toString" })).toThrow(/not one of/);
  });
});

/** A fake binding: records each run, and answers with an OpenAI chunk stream holding one tool call. */
function fakeAi() {
  const runs: { model: string; inputs: Record<string, unknown>; options: unknown }[] = [];
  const chunk = (delta: unknown, extra: Record<string, unknown> = {}) => `data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", created: 1, model: WORKERS_AI_MODEL, choices: [{ index: 0, delta, finish_reason: null }], ...extra })}\n\n`;
  const body = [
    chunk({ role: "assistant", content: null, tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "artroom_claim", arguments: "" } }] }),
    chunk({ tool_calls: [{ index: 0, function: { arguments: '{"goal":"g","scope":["docs/**"]}' } }] }),
    `data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", created: 1, model: WORKERS_AI_MODEL, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] })}\n\n`,
    `data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", created: 1, model: WORKERS_AI_MODEL, choices: [], usage: { prompt_tokens: 1000, completion_tokens: 100, total_tokens: 1100 } })}\n\n`,
    "data: [DONE]\n\n",
  ].join("");
  const ai: AiRunner = {
    run: async (model, inputs, options) => {
      runs.push({ model, inputs, options });
      return new Response(body, { headers: { "content-type": "text/event-stream" } });
    },
  };
  return { ai, runs };
}

async function modelsFor(env: ModelEnv) {
  const credentials = new InMemoryCredentialStore();
  const models = createModels({ credentials });
  const added = await addProviders(models, credentials, env);
  return { models, added };
}

describe("addProviders", () => {
  it("registers nothing without a binding or a key", async () => {
    expect((await modelsFor({})).added).toEqual([]);
  });

  it("registers workers-ai from the AI binding alone, with the catalog's models", async () => {
    const { models, added } = await modelsFor({ AI: fakeAi().ai });
    expect(added).toEqual(["workers-ai"]);
    const m = models.getModel("workers-ai", WORKERS_AI_MODEL);
    expect(m?.provider).toBe("workers-ai");
    expect(m?.cost).toEqual({ input: 0.0605, output: 0.4, cacheRead: 0, cacheWrite: 0 });
    expect(await models.checkAuth("workers-ai")).toBeDefined();
  });

  it("registers cloudflare-workers-ai only with both the key and the account", async () => {
    expect((await modelsFor({ CLOUDFLARE_API_KEY: "k" })).added).toEqual([]);
    expect((await modelsFor({ CLOUDFLARE_ACCOUNT_ID: "a" })).added).toEqual([]);
    const { models, added } = await modelsFor({ CLOUDFLARE_API_KEY: "k", CLOUDFLARE_ACCOUNT_ID: "acct" });
    expect(added).toEqual(["cloudflare-workers-ai"]);
    const auth = await models.getAuth("cloudflare-workers-ai");
    expect(auth?.auth).toEqual({ apiKey: "k" });
    expect(auth?.env).toEqual({ CLOUDFLARE_ACCOUNT_ID: "acct" });
  });

  it("registers openrouter with its key", async () => {
    const { models, added } = await modelsFor({ OPENROUTER_API_KEY: "k" });
    expect(added).toEqual(["openrouter"]);
    expect((await models.getAuth("openrouter"))?.auth).toEqual({ apiKey: "k" });
  });

  it("registers each it is given", async () => {
    expect((await modelsFor({ AI: fakeAi().ai, CLOUDFLARE_API_KEY: "k", CLOUDFLARE_ACCOUNT_ID: "a", OPENROUTER_API_KEY: "k" })).added).toEqual(["workers-ai", "cloudflare-workers-ai", "openrouter"]);
  });
});

describe("the Workers AI binding provider", () => {
  const context: Context = {
    systemPrompt: "You work in an Artroom room.",
    messages: [{ role: "user", content: "Claim a lane.", timestamp: 1 }],
    tools: [{ name: "artroom_claim", description: "Claim a lane.", parameters: Type.Object({ goal: Type.String(), scope: Type.Array(Type.String()) }) }],
  };

  it("sends the OpenAI request body to AI.run and reads the tool call and usage from its stream", async () => {
    const { ai, runs } = fakeAi();
    const { models } = await modelsFor({ AI: ai });
    const out = await models.complete(models.getModel("workers-ai", WORKERS_AI_MODEL)!, context);
    expect(out.errorMessage).toBeUndefined();
    expect(runs).toHaveLength(1);
    const run = runs[0]!;
    expect(run.model).toBe(WORKERS_AI_MODEL);
    expect(run.inputs).not.toHaveProperty("model");
    expect(run.inputs["stream"]).toBe(true);
    expect((run.inputs["messages"] as { role: string }[]).map((m) => m.role)).toEqual(["system", "user"]);
    expect((run.inputs["tools"] as { function: { name: string } }[]).map((t) => t.function.name)).toEqual(["artroom_claim"]);
    expect(run.options).toMatchObject({ returnRawResponse: true });
    expect(out.stopReason).toBe("toolUse");
    expect(out.content.filter((c) => c.type === "toolCall")).toEqual([expect.objectContaining({ name: "artroom_claim", arguments: { goal: "g", scope: ["docs/**"] } })]);
    expect(out.usage.input).toBe(1000);
    expect(out.usage.output).toBe(100);
    // pi-ai's price table for the model: 1000 * 0.0605 / 1e6 + 100 * 0.4 / 1e6.
    expect(out.usage.cost.total).toBeCloseTo(0.0000605 + 0.00004, 10);
  });

  it("answers anything other than a chat completion with 404, without a run", async () => {
    const { ai, runs } = fakeAi();
    const f = workersAiFetch(ai);
    expect((await f("https://workers-ai.binding/v1/models")).status).toBe(404);
    expect((await f("https://workers-ai.binding/v1/chat/completions")).status).toBe(404);
    expect(runs).toHaveLength(0);
  });
});
