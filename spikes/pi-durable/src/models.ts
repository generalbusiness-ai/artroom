/**
 * The model providers the Agent can use, from what its Worker is given:
 *
 *   - `workers-ai`: Workers AI through the Worker's `AI` binding. pi-ai 1.0.0
 *     has no provider for the binding, so this is a small one: pi-ai's own
 *     OpenAI chat-completions client and Workers AI catalog, with a `fetch`
 *     that hands each request body to `AI.run(…, { returnRawResponse: true })`
 *     and returns the binding's response (a stream of OpenAI chunks) as it
 *     is. No key: the binding carries the account's identity.
 *   - `cloudflare-workers-ai`: pi-ai's provider for Workers AI's REST API,
 *     for a run outside a Worker; with CLOUDFLARE_API_KEY and
 *     CLOUDFLARE_ACCOUNT_ID.
 *   - `openrouter`: pi-ai's provider; with OPENROUTER_API_KEY.
 *
 * Keys reach pi-ai through its credential store, never through process.env
 * or a log line.
 */

import { createProvider, type CredentialStore, type FetchFunction, type MutableModels, type Provider } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { cloudflareWorkersAIProvider } from "@earendil-works/pi-ai/providers/cloudflare-workers-ai";
import { CLOUDFLARE_WORKERS_AI_MODELS } from "@earendil-works/pi-ai/providers/cloudflare-workers-ai.models";
import { openrouterProvider } from "@earendil-works/pi-ai/providers/openrouter";

/** The part of the Workers AI binding this module uses. `env.AI` is one. */
export interface AiRunner {
  run(model: string, inputs: Record<string, unknown>, options: { returnRawResponse: true; signal?: AbortSignal }): Promise<Response>;
}

export interface ModelEnv {
  readonly AI?: AiRunner;
  readonly CLOUDFLARE_API_KEY?: string;
  readonly CLOUDFLARE_ACCOUNT_ID?: string;
  readonly OPENROUTER_API_KEY?: string;
}

/** Where the binding provider's models point. The binding's `fetch` adapter answers every request; nothing is sent to this host. */
export const WORKERS_AI_BINDING_URL = "https://workers-ai.binding/v1";

/**
 * A `fetch` for the OpenAI client that sends each chat-completions request
 * through the binding. The body is the OpenAI request: `model` names the
 * Workers AI model, the rest are its inputs.
 */
export function workersAiFetch(ai: AiRunner): FetchFunction {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const path = new URL(req.url).pathname;
    if (req.method !== "POST" || !path.endsWith("/chat/completions")) {
      return new Response(JSON.stringify({ error: { message: `workers-ai binding: no route for ${req.method} ${path}` } }), { status: 404, headers: { "content-type": "application/json" } });
    }
    const { model, ...inputs } = (await req.json()) as { model: string } & Record<string, unknown>;
    return ai.run(model, inputs, { returnRawResponse: true, signal: req.signal });
  }) as FetchFunction;
}

/** The `workers-ai` provider: pi-ai's Workers AI catalog and OpenAI client, over the binding. */
export function workersAiBindingProvider(ai: AiRunner): Provider {
  const api = openAICompletionsApi();
  const fetch = workersAiFetch(ai);
  return createProvider({
    id: "workers-ai",
    name: "Workers AI (binding)",
    // The binding needs no key; the OpenAI client needs one to send, so it gets a placeholder the adapter never sends on.
    auth: { apiKey: { name: "Workers AI binding", resolve: async () => ({ auth: { apiKey: "workers-ai-binding" }, source: "AI binding" }) } },
    models: Object.values(CLOUDFLARE_WORKERS_AI_MODELS).map((m) => ({ ...m, provider: "workers-ai", baseUrl: WORKERS_AI_BINDING_URL })),
    api: {
      stream: (model, context, options) => api.stream(model, context, { ...options, fetch }),
      streamSimple: (model, context, options) => api.streamSimple(model, context, { ...options, fetch }),
    },
  });
}

/** Register a provider for each way to a model the Worker was given. Returns their IDs. */
export async function addProviders(models: MutableModels, credentials: CredentialStore, env: ModelEnv): Promise<string[]> {
  const added: string[] = [];
  if (env.AI) {
    models.setProvider(workersAiBindingProvider(env.AI));
    added.push("workers-ai");
  }
  const cfKey = env.CLOUDFLARE_API_KEY;
  const cfAccount = env.CLOUDFLARE_ACCOUNT_ID;
  if (cfKey && cfAccount) {
    await credentials.modify("cloudflare-workers-ai", async () => ({ type: "api_key", key: cfKey, env: { CLOUDFLARE_ACCOUNT_ID: cfAccount } }));
    models.setProvider(cloudflareWorkersAIProvider());
    added.push("cloudflare-workers-ai");
  }
  const orKey = env.OPENROUTER_API_KEY;
  if (orKey) {
    await credentials.modify("openrouter", async () => ({ type: "api_key", key: orKey }));
    models.setProvider(openrouterProvider());
    added.push("openrouter");
  }
  return added;
}
