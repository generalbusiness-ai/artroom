/**
 * Which provider and model the live run uses. This module imports nothing,
 * so `vitest.config.ts` (in Node) and the tests (in workerd) share it.
 *
 * `SPIKE_LIVE` turns the live run on and names its provider:
 *
 *   - `1` or `workers-ai`: Workers AI through the Worker's `AI` binding. The
 *     default. No model key: the binding carries the account's identity.
 *   - `cloudflare-workers-ai`: Workers AI over its REST API, through pi-ai's
 *     provider of that name, for a run outside a Worker. Needs
 *     CLOUDFLARE_API_KEY and CLOUDFLARE_ACCOUNT_ID.
 *   - `openrouter`: OpenRouter, through pi-ai's provider. Needs
 *     OPENROUTER_API_KEY.
 *
 * `SPIKE_LIVE_MODEL` replaces the provider's default model.
 */

export type ModelRef = { provider: string; modelId: string };

/**
 * GLM-4.7-Flash: Workers AI lists it with multi-turn tool calling, answers in
 * the OpenAI chat-completion shape through the binding, has a 131,072-token
 * context, and costs USD 0.0605 per million input tokens and USD 0.40 per
 * million output tokens. Why this one: README, "Live run".
 */
export const WORKERS_AI_MODEL = "@cf/zai-org/glm-4.7-flash";

/** Each live provider, its default model, and the host variables it needs. */
export const LIVE_PROVIDERS = {
  "workers-ai": { modelId: WORKERS_AI_MODEL, needs: [] },
  "cloudflare-workers-ai": { modelId: WORKERS_AI_MODEL, needs: ["CLOUDFLARE_API_KEY", "CLOUDFLARE_ACCOUNT_ID"] },
  openrouter: { modelId: "openai/gpt-4.1-mini", needs: ["OPENROUTER_API_KEY"] },
} as const satisfies Record<string, { modelId: string; needs: readonly string[] }>;

export type LiveProvider = keyof typeof LIVE_PROVIDERS;

export const DEFAULT_LIVE_PROVIDER: LiveProvider = "workers-ai";

/**
 * The live run's provider and model, or undefined when `SPIKE_LIVE` is unset
 * or empty. Throws on an unknown provider, or when a variable the provider
 * needs is missing, so a live run that was asked for is never skipped.
 */
export function liveModel(vars: Readonly<Record<string, string | undefined>>): ModelRef | undefined {
  const asked = vars["SPIKE_LIVE"];
  if (asked === undefined || asked === "") return undefined;
  const provider = asked === "1" ? DEFAULT_LIVE_PROVIDER : asked;
  if (!Object.hasOwn(LIVE_PROVIDERS, provider)) {
    throw new Error(`SPIKE_LIVE=${asked}: not one of 1, ${Object.keys(LIVE_PROVIDERS).join(", ")}`);
  }
  const p = LIVE_PROVIDERS[provider as LiveProvider];
  const missing = p.needs.filter((k) => !vars[k]);
  if (missing.length > 0) throw new Error(`SPIKE_LIVE=${asked} needs ${missing.join(" and ")} in the environment`);
  return { provider, modelId: vars["SPIKE_LIVE_MODEL"] || p.modelId };
}
