import { health } from "../../packages/scope/src/health.ts";
/** Application dispatch. Imported framework functions are used only when fetch runs. */
import { mcpRoute, route, type Env, type McpEnv } from "../../packages/scope/src/worker.ts";
import { admittedRequestUrl } from "../../packages/scope/src/item-query-wire.ts";
import { credentialInUrl } from "../../packages/scope/src/sessions.ts";
import { DEMO_OFFER_PATH, demoCreationRoute } from "./demo-founding.ts";
import { isSite, site } from "../../packages/scope/src/site/route.ts";
import { isPage, page } from "./page/route.ts";
import { isCounting, countingPage } from "../counter/src/counting.ts";
import { isLending, lendingPage } from "../../examples/lending/worker/route.ts";
import { isBrand, brand } from "./brand/route.ts";
import { measuredRequest } from "../../packages/scope/src/operational.ts";
const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export default {
  fetch: async (request: Request, env: Env & Partial<Pick<McpEnv, "REGISTRIES" | "AGENTS">>): Promise<Response> => {
    return measuredRequest(request, env, async () => {
    if (!admittedRequestUrl(request.url)) return json(413, { error: "too-large" });
    if (credentialInUrl(new URL(request.url))) return json(400, { error: "credential-in-url" });
    const healthy = await health(request, env);
    if (healthy) return healthy;
    const hosted = await mcpRoute(request, env);
    if (hosted) return hosted;
    return new URL(request.url).pathname === DEMO_OFFER_PATH ? demoCreationRoute(request, env) : isSite(request) ? site(request, env) : isPage(request) ? page(request) : isCounting(request) ? countingPage(request) : isLending(request) ? lendingPage(request) : isBrand(request) ? brand(request) : route(request, env.SCOPES);
    });
  },
};
