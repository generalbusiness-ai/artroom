/** Session policy over an admitted operation frame. No roster or grant read. */
import type { ScopeRef } from "@generalbusiness/dap-contract";
import { same } from "@generalbusiness/dap-derive";
import type { Clock } from "./ports.ts";
import type { PreparedRead } from "./read-preparation.ts";
import { authenticateSession, sessionClock, type Sessions } from "./sessions.ts";

export type QueryVisibility = "live" | "final" | "mixed";
export function sessionAllowsVisibility(reads: readonly string[], visibility: QueryVisibility): boolean {
  return visibility === "live" ? reads.includes("summary") : visibility === "final" ? reads.includes("items") : visibility === "mixed" && reads.includes("summary") && reads.includes("items");
}

/** Called after the operation's last bounded storage/support phase. Issued
 * claims stay valid until expiry; there is no current roster/role lookup. */
export function preparedSessionAllows(config: { sessions(): Sessions | null; clock: Clock }, frame: PreparedRead, reader: unknown, visibility: QueryVisibility, membership: ScopeRef, resolvedBirth = false): boolean {
  if (!frame.budget.available) return false;
  const fresh = authenticateSession(() => config.sessions(), reader);
  return "claims" in fresh && same(fresh.claims.membership, membership) && sessionClock(config, frame.scope, fresh.claims) === null
    && sessionAllowsVisibility(fresh.claims.reads, visibility) && (!resolvedBirth || fresh.claims.reads.includes("summary"));
}
