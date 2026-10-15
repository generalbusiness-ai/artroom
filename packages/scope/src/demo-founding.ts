/** Two explicit demo roots at most. This projection grants nothing and wakes no work. */
import type { Head, ScopeRef } from "@generalbusiness/dap-contract";
import { canonicalize, parseStrict, utf8 } from "@generalbusiness/artroom-bytes";
import { isScopeRef } from "@generalbusiness/dap-derive";
import { DEMO_PURPOSE, DEMO_REGISTER, WEB_DEMO_REGISTER } from "@generalbusiness/dap-platform";
import type { Store } from "./store.ts";
const ORIGINS = new Set(["https://artroom-scope.inguz.workers.dev", "https://artroom-rehearsal.inguz.workers.dev"]);
export interface DemoFoundingBindings { DEMO_START_CONFIG?: string; DEPLOYMENT?: string }
export interface DemoFoundingConfig { v: 1; origin: string; deployment: string; register: ScopeRef; definition: typeof DEMO_REGISTER | typeof WEB_DEMO_REGISTER }
interface DemoFoundingSettings { current: DemoFoundingConfig; legacy: DemoFoundingConfig | null }
export interface DemoFoundingOffer extends Omit<DemoFoundingConfig, "deployment"> {
  at: Head;
  registerItem: { id: number; revision: number; state: "open"; host: string; namespace: string; policy: "open"; purpose: typeof DEMO_PURPOSE };
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export const registerRef = (value: unknown): value is ScopeRef => record(value) && Object.keys(value).length === 3 && isScopeRef(value) && value.kind === "register";
export function demoFoundingConfig(raw: string | undefined, deployment: string | undefined): DemoFoundingSettings | null {
  try {
    if (!raw || utf8(raw).length > 4096) return null;
    const value = parseStrict(raw);
    if (!record(value) || !["v", "origin", "deployment", "register", "definition", "legacy"].every(key => key === "legacy" || Object.hasOwn(value, key)) || Object.keys(value).some(key => !["v", "origin", "deployment", "register", "definition", "legacy"].includes(key))) return null;
    if (typeof deployment !== "string" || !deployment || deployment.length > 256 || value["deployment"] !== deployment || typeof value["origin"] !== "string" || !ORIGINS.has(value["origin"]) || !registerRef(value["register"])) return null;
    if (value["v"] === 1 ? Object.keys(value).length !== 5 || value["definition"] !== DEMO_REGISTER : value["v"] !== 2 || value["definition"] !== WEB_DEMO_REGISTER) return null;
    const current: DemoFoundingConfig = { v: 1, origin: value["origin"], deployment, register: structuredClone(value["register"]), definition: value["v"] === 1 ? DEMO_REGISTER : WEB_DEMO_REGISTER };
    let legacy: DemoFoundingConfig | null = null;
    const held = value["legacy"];
    if (held !== undefined && held !== null) {
      if (!record(held) || Object.keys(held).sort().join(",") !== "definition,register" || held["definition"] !== DEMO_REGISTER || !registerRef(held["register"]) || held["register"].scope === current.register.scope) return null;
      legacy = { ...current, register: structuredClone(held["register"]), definition: DEMO_REGISTER };
    }
    return { current, legacy };
  } catch { return null; }
}
/** Reads only recorded state, with no #first, alarm, dispatcher or provider call. */
export function demoFoundingOffer(store: Pick<Store, "scope" | "page">, pinned: string | undefined, config: DemoFoundingConfig): DemoFoundingOffer | null {
  const scope = store.scope();
  if (!scope || scope.status !== "active" || ![DEMO_REGISTER, WEB_DEMO_REGISTER].includes(config.definition) || pinned !== config.definition || canonicalize(scope.at) !== canonicalize(config.register)) return null;
  const page = store.page("register", ["open"], null, 1), item = page.items[0];
  if (page.more || page.items.length !== 1 || !item || item.type !== "register" || item.state !== "open" || item.values["purpose"] !== DEMO_PURPOSE || item.values["policy"] !== "open" || typeof item.values["host"] !== "string" || typeof item.values["namespace"] !== "string") return null;
  const offer: DemoFoundingOffer = { v: 1, origin: config.origin, register: structuredClone(config.register), definition: config.definition, at: structuredClone(scope.head), registerItem: { id: item.id, revision: item.revision, state: "open", host: item.values["host"], namespace: item.values["namespace"], policy: "open", purpose: DEMO_PURPOSE } };
  return utf8(canonicalize(offer)).length <= 16 * 1024 ? offer : null;
}
