/** Session policy over an admitted operation frame. No roster or grant read. */
import type { ScopeRef } from "@generalbusiness/dap-contract";
import { isScopeRef, same } from "@generalbusiness/dap-derive";
import { recordedMembership } from "./authority.ts";
import type { Clock } from "./ports.ts";
import { ReadPreparation, type PreparedRead } from "./read-preparation.ts";
import { PreparationFlights } from "./preparation-flight.ts";
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

/** Object-owned internal preparation, with no public query or legacy switch.
 * Until composite support is adopted, unresolved birth fails unavailable. */
export class SessionPreparation {
  constructor(readonly preparation: ReadPreparation, readonly sessions: () => Sessions | null, readonly clock: Clock, readonly flights = new PreparationFlights()) {}
  eligible(reader: unknown, visibility: QueryVisibility): Promise<boolean> {
    return this.flights.run(async run => {
      if (typeof reader !== "string" || reader.length > 4104) return null;
      const authentic = authenticateSession(this.sessions, reader);
      if (!("claims" in authentic) || !sessionAllowsVisibility(authentic.claims.reads, visibility) || !run.active()) return null;
      const frame = this.preparation.capture();
      if (!frame || !run.active()) return null;
      const membership = frame.scope.at.kind === "membership" ? frame.scope.at : recordedMembership({ genesis: () => frame.genesis, state: frame.view }, frame.scope.at);
      if (!isScopeRef(membership) || membership.kind !== "membership" || !same(membership, authentic.claims.membership)
        || sessionClock(this, frame.scope, authentic.claims) !== null || !run.active()) return null;
      if (!frame.current() || !run.active()) return null;
      return preparedSessionAllows(this, frame, reader, visibility, membership) && run.active();
    }).then(value => value === true);
  }
}
