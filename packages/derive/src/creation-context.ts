/** Reserved native create metadata. Domain fields do not select this protocol. */
import type { ScopeRef } from "@generalbusiness/artroom-contract";
import { isObject, isScopeRef } from "./values.ts";

export type CreationContext = { kind: "legacy" } | { kind: "invalid" } | { kind: "marked"; membership: ScopeRef };

/** Read only after source/message/seed proof, or from the scope's retained genesis. */
export function creationContextOf(body: unknown): CreationContext {
  if (!isObject(body) || !Object.hasOwn(body, "creationContext")) return { kind: "legacy" };
  const marker = body["creationContext"], membership = body["membership"];
  return isObject(marker) && Object.keys(marker).length === 1 && Object.hasOwn(marker, "v") && marker["v"] === 1
    && isScopeRef(membership) && membership.kind === "membership"
    ? { kind: "marked", membership } : { kind: "invalid" };
}
