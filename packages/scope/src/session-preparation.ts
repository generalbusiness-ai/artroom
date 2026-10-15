/** Session policy over an admitted operation frame. No roster or grant read. */
import type { ScopeRef } from "@generalbusiness/dap-contract";
import { isScopeRef, same, type Page, type StateView } from "@generalbusiness/dap-derive";
import { recordedMembership, repositorySessionBirth } from "./authority.ts";
import type { Clock } from "./ports.ts";
import { ReadPreparation, type PreparedRead } from "./read-preparation.ts";
import { PreparationFlights } from "./preparation-flight.ts";
import { PreparationBudget, PREPARATION_BOUNDS } from "./preparation-budget.ts";
import { encodeSessionReference, sessionReferenceReply, SESSION_REFERENCE_BOUNDS as B, type SessionReferenceSource } from "./session-reference.ts";
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

const freeze = (value: unknown): void => { if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } };
/** Exact current native callback pages, shared only within this full frame.
 * A cache hit spends a conservative call. No key crosses an operation/head. */
function referenceView(frame: PreparedRead): StateView {
  const pages = new Map<string, Page>();
  const methods = {
    scope: () => frame.view.scope(), incarnations: (scope: Parameters<StateView["incarnations"]>[0]) => frame.view.incarnations(scope),
    page(type: string, states: readonly string[], after: number | null, limit: number): Page {
      if (!Array.isArray(states) || after !== null || limit !== 1 || !(
        (type === "branch" && states.length === 2 && states[0] === "empty" && states[1] === "ready")
        || (type === "rules" && states.length === 1 && states[0] === "current")
        || (type === "repository" && states.length === 1 && states[0] === "open"))) return frame.budget.stop();
      const cached = pages.get(type);
      if (cached) { frame.budget.spend({ calls: 1 }); return cached; }
      const page = frame.view.page(type, states, after, limit); freeze(page); pages.set(type, page); return page;
    },
  };
  return new Proxy(Object.freeze(methods), { get(target, property) {
    return Object.prototype.hasOwnProperty.call(target, property) ? Reflect.get(target, property) : frame.budget.stop();
  } }) as unknown as StateView;
}

/** One local participant plus at most one exact native birth-directory
 * participant, each at its unchanged G2p-a hard maxima. No cross-operation
 * birth/standing cache, budget borrowing, retries or old summary fallback. */
export class SessionPreparation {
  constructor(readonly preparation: ReadPreparation, readonly sessions: () => Sessions | null, readonly clock: Clock, readonly source: SessionReferenceSource | null = null, readonly flights = new PreparationFlights()) {}
  eligible(reader: unknown, visibility: QueryVisibility): Promise<boolean> {
    return this.flights.run(async run => {
      if (typeof reader !== "string" || reader.length > 4104) return null;
      const authentic = authenticateSession(this.sessions, reader);
      if (!("claims" in authentic) || !sessionAllowsVisibility(authentic.claims.reads, visibility) || !run.active()) return null;
      const frame = this.preparation.capture(new PreparationBudget(PREPARATION_BOUNDS, run.active));
      if (!frame || !run.active()) return null;
      const context = { genesis: () => frame.genesis, state: referenceView(frame) };
      const recorded = frame.scope.at.kind === "membership" ? frame.scope.at : recordedMembership(context, frame.scope.at);
      if (!recorded || recorded.kind !== "membership" || recorded.scope !== authentic.claims.membership.scope
        || (recorded.inc !== null && recorded.inc !== authentic.claims.membership.inc) || sessionClock(this, frame.scope, authentic.claims) !== null || !run.active()) return null;
      let membership: ScopeRef, resolvedBirth = false;
      if (isScopeRef(recorded)) membership = recorded;
      else {
        if (!this.source || !authentic.claims.reads.includes("summary")) return null;
        const birth = repositorySessionBirth(context, frame.scope.at, recorded);
        if (!birth || !run.active()) return null;
        frame.budget.spend({ calls: 1, metadata: B.request + B.reply }); // one fixed RPC, never another participant/retry
        const request = encodeSessionReference({ v: 1, to: birth.directory, reader, maxBytes: B.reply, milliseconds: run.remaining() });
        if (!request || !run.active()) return null;
        const raw = await this.source.read(birth.directory, request);
        if (!run.active()) return null; // late task retains its slot but does no more local storage/support
        const reply = sessionReferenceReply(raw);
        if (!reply || !same(reply.directory, birth.directory) || !birth.definitions.includes(reply.definition) || !same(reply.membership, authentic.claims.membership)
          || reply.membership.scope !== recorded.scope || (recorded.inc !== null && reply.membership.inc !== recorded.inc)
          || (frame.scope.at.kind === "rules" && !same(reply.rules, frame.scope.at))) return null;
        membership = reply.membership; resolvedBirth = true;
      }
      // Full unchanged head/incarnation/genesis/status/time and current whole
      // support justify reusing this operation's native recorded/birth data.
      // A drift ends the operation; no recapture or hidden retry follows.
      if (!frame.current() || !run.active()) return null;
      return preparedSessionAllows(this, frame, reader, visibility, membership, resolvedBirth) && run.active();
    }).then(value => value === true);
  }
}
