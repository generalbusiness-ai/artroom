/** The demo's HTTP route; the native read-only projection stays with ScopeObject. */
import { canonicalize } from "@generalbusiness/artroom-bytes";
import type { Binding } from "../../packages/scope/src/namespace.ts";
import { demoCreationConfig, registerRef, type DemoCreationBindings, type DemoCreationConfig, type DemoCreationOffer } from "../../packages/scope/src/demo-creation.ts";
export { demoCreationConfig, type DemoCreationOffer } from "../../packages/scope/src/demo-creation.ts";
export const DEMO_OFFER_PATH = "/v1/demo/creation-offer";
export async function demoCreationRoute(request: Request, env: DemoCreationBindings & { SCOPES: Binding }): Promise<Response> {
  const url = new URL(request.url), settings = demoCreationConfig(env.DEMO_START_CONFIG, env.DEPLOYMENT);
  const reply = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  if (url.pathname !== DEMO_OFFER_PATH || !settings || url.origin !== settings.current.origin || url.hash) return reply(404, { error: "not-found" });
  let config = settings.current;
  if (url.search) {
    if ([...url.searchParams.keys()].sort().join(",") !== "inc,register") return reply(404, { error: "not-found" });
    const selected = { scope: url.searchParams.get("register"), inc: url.searchParams.get("inc"), kind: "register" };
    if (!registerRef(selected)) return reply(404, { error: "not-found" });
    const match = canonicalize(selected) === canonicalize(config.register) ? config : settings.legacy && canonicalize(selected) === canonicalize(settings.legacy.register) ? settings.legacy : null;
    if (!match) return reply(404, { error: "not-found" });
    config = match;
  }
  if (request.method !== "GET") return reply(405, { error: "method-not-allowed" });
  const stub = env.SCOPES.get(env.SCOPES.idFromName(config.register.scope)) as unknown as { demoCreationOffer(config: DemoCreationConfig): DemoCreationOffer | null | Promise<DemoCreationOffer | null> };
  const offer = await stub.demoCreationOffer(config);
  return offer ? reply(200, offer) : reply(404, { error: "not-found" });
}
