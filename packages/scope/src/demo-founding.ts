/** One configured demo offer. This projection neither grants authority nor wakes work. */
import type { Head, ScopeRef } from "@generalbusiness/artroom-contract";
import { canonicalize, parseStrict, utf8 } from "@generalbusiness/artroom-bytes";
import { isScopeRef } from "@generalbusiness/artroom-derive";
import { DEMO_PURPOSE, DEMO_REGISTER } from "@generalbusiness/artroom-platform";
import type { Binding } from "./namespace.ts";
import type { Store } from "./store.ts";
const ORIGINS = new Set(["https://artroom-scope.inguz.workers.dev", "https://artroom-rehearsal.inguz.workers.dev"]);
export const DEMO_OFFER_PATH = "/v1/demo/founding-offer";
export interface DemoFoundingBindings { DEMO_START_CONFIG?: string; DEPLOYMENT?: string }
export interface DemoFoundingConfig { v: 1; origin: string; deployment: string; register: ScopeRef; definition: typeof DEMO_REGISTER }
export interface DemoFoundingOffer extends Omit<DemoFoundingConfig, "deployment"> {
  at: Head;
  registerItem: { id: number; revision: number; state: "open"; host: string; namespace: string; policy: "open"; purpose: typeof DEMO_PURPOSE };
}
export function demoFoundingConfig(raw: string | undefined, deployment: string | undefined): DemoFoundingConfig | null {
  try {
    if (!raw || utf8(raw).length > 4096) return null;
    const value = parseStrict(raw);
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 5) return null;
    const config = value as unknown as DemoFoundingConfig;
    if (typeof deployment !== "string" || !deployment || deployment.length > 256 || config.deployment !== deployment || config.v !== 1 || !ORIGINS.has(config.origin) || config.definition !== DEMO_REGISTER || !isScopeRef(config.register) || config.register.kind !== "register" || Object.keys(config.register).length !== 3) return null;
    return structuredClone(config);
  } catch { return null; }
}
/** Reads only recorded state, with no #first, alarm, dispatcher or provider call. */
export function demoFoundingOffer(store: Pick<Store, "scope" | "page">, pinned: string | undefined, config: DemoFoundingConfig): DemoFoundingOffer | null {
  const scope = store.scope();
  if (!scope || scope.status !== "active" || pinned !== DEMO_REGISTER || config.definition !== DEMO_REGISTER || canonicalize(scope.at) !== canonicalize(config.register)) return null;
  const page = store.page("register", ["open"], null, 1), item = page.items[0];
  if (page.more || page.items.length !== 1 || !item || item.type !== "register" || item.state !== "open" || item.values["purpose"] !== DEMO_PURPOSE || item.values["policy"] !== "open" || typeof item.values["host"] !== "string" || typeof item.values["namespace"] !== "string") return null;
  const offer: DemoFoundingOffer = { v: 1, origin: config.origin, register: structuredClone(config.register), definition: DEMO_REGISTER, at: structuredClone(scope.head), registerItem: { id: item.id, revision: item.revision, state: "open", host: item.values["host"], namespace: item.values["namespace"], policy: "open", purpose: DEMO_PURPOSE } };
  return utf8(canonicalize(offer)).length <= 16 * 1024 ? offer : null;
}
export async function demoFoundingRoute(request: Request, env: DemoFoundingBindings & { SCOPES: Binding }): Promise<Response> {
  const url = new URL(request.url), config = demoFoundingConfig(env.DEMO_START_CONFIG, env.DEPLOYMENT);
  const reply = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  if (url.pathname !== DEMO_OFFER_PATH || !config || url.origin !== config.origin || url.search || url.hash) return reply(404, { error: "not-found" });
  if (request.method !== "GET") return reply(405, { error: "method-not-allowed" });
  const stub = env.SCOPES.get(env.SCOPES.idFromName(config.register.scope)) as unknown as { demoFoundingOffer(config: DemoFoundingConfig): DemoFoundingOffer | null | Promise<DemoFoundingOffer | null> };
  const offer = await stub.demoFoundingOffer(config);
  return offer ? reply(200, offer) : reply(404, { error: "not-found" });
}
