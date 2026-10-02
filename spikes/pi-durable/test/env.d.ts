// The bindings of wrangler.jsonc and vitest.config.ts, for `cloudflare:workers`' `env` in tests.
import type { Agent } from "../src/agent.ts";
import type { Scratch } from "../src/scratch.ts";

declare global {
  namespace Cloudflare {
    interface Env {
      ROOMS: DurableObjectNamespace;
      REGISTRY: DurableObjectNamespace;
      AGENTS: DurableObjectNamespace<Agent>;
      SCRATCH: DurableObjectNamespace<Scratch>;
      ARTROOM: Fetcher;
      AI: Ai;
      CLOUDFLARE_API_KEY?: string;
      CLOUDFLARE_ACCOUNT_ID?: string;
      OPENROUTER_API_KEY?: string;
      SPIKE_LIVE?: string;
      SPIKE_LIVE_MODEL?: string;
    }
  }
}
