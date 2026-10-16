/** Session policy over an admitted operation frame. No roster or grant read. */
import type { ScopeRef } from "@generalbusiness/dap-contract";
import { isScopeRef, same, type Page, type StateView } from "@generalbusiness/dap-derive";
import { recordedMembership, repositorySessionBirth } from "./authority.ts";
import type { Clock } from "./ports.ts";
import { ReadPreparation, type PreparedRead } from "./read-preparation.ts";
import { PreparationFlights, type PreparationRun } from "./preparation-flight.ts";
import { PreparationBudget, PREPARATION_BOUNDS } from "./preparation-budget.ts";
import { encodeSessionReference, sessionReferenceReply, SESSION_REFERENCE_BOUNDS as B, type SessionReferenceSource } from "./session-reference.ts";
import { authenticateSession, sessionClock, type Sessions } from "./sessions.ts";

export type QueryVisibility = "live" | "final" | "mixed" | "empty";
export function sessionAllowsVisibility(reads: readonly string[], visibility: QueryVisibility): boolean {
  return visibility === "empty" ? reads.includes("summary") || reads.includes("items") : visibility === "live" ? reads.includes("summary") : visibility === "final" ? reads.includes("items") : visibility === "mixed" && reads.includes("summary") && reads.includes("items");
}
/** Preparation data, not a reusable grant. The owner owes currentness, its synchronous page and fresh final authority. */
export interface PreparedSessionRead { frame: PreparedRead; membership: ScopeRef; resolvedBirth: boolean; visibility: QueryVisibility }
export type SessionPreparationResult = { ok: true; prepared: PreparedSessionRead } | { ok: false; reason: "forbidden" | "sessions-unavailable" | "clock-behind" | "unavailable" };
const refused = (reason: Extract<SessionPreparationResult, { ok: false }>["reason"]): SessionPreparationResult => ({ ok: false, reason });

/** Called after the operation's last bounded storage/support phase. Issued
 * claims stay valid until expiry; there is no current roster/role lookup. */
export function preparedSessionAllows(config: { sessions(): Sessions | null; clock: Clock }, frame: PreparedRead, reader: unknown, visibility: QueryVisibility, membership: ScopeRef, resolvedBirth = false): boolean {
  return preparedSessionRefusal(config, frame, reader, visibility, membership, resolvedBirth) === null;
}
export function preparedSessionRefusal(config: { sessions(): Sessions | null; clock: Clock }, frame: PreparedRead, reader: unknown, visibility: QueryVisibility, membership: ScopeRef, resolvedBirth = false): "unavailable" | "forbidden" | "sessions-unavailable" | "clock-behind" | null {
  if (!frame.budget.available) return "unavailable";
  const fresh = authenticateSession(() => config.sessions(), reader);
  if (!("claims" in fresh)) return fresh.refused || "forbidden";
  if (!same(fresh.claims.membership, membership)) return "forbidden";
  const clock = sessionClock(config, frame.scope, fresh.claims);
  if (clock !== null) return clock === "clock-behind" ? clock : "forbidden";
  return sessionAllowsVisibility(fresh.claims.reads, visibility) && (!resolvedBirth || fresh.claims.reads.includes("summary")) ? null : "forbidden";
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
      const result = await this.prepare(reader, visibility, run);
      if (!result.ok) return null;
      const { prepared } = result;
      if (!prepared.frame.current() || !run.active()) return null;
      return preparedSessionAllows(this, prepared.frame, reader, prepared.visibility, prepared.membership, prepared.resolvedBirth) && run.active();
    }).then(value => value === true);
  }
  /** Joins the caller's existing operation. This starts no timer/flight and grants no later read. */
  async prepare(reader: unknown, visibility: QueryVisibility | ((frame: PreparedRead) => QueryVisibility), run: PreparationRun,
    budget = new PreparationBudget(PREPARATION_BOUNDS, run.active), beforePeer: (() => void) | null = null): Promise<SessionPreparationResult> {
      if (typeof reader !== "string" || reader.length > 4104) return refused("forbidden");
      const authentic = authenticateSession(this.sessions, reader);
      if (!("claims" in authentic)) return refused(authentic.refused || "forbidden");
      if (!run.active()) return refused("unavailable");
      if (!sessionAllowsVisibility(authentic.claims.reads, typeof visibility === "function" ? "empty" : visibility)) return refused("forbidden");
      const frame = this.preparation.capture(budget);
      if (!frame || !run.active()) return refused("unavailable");
      const selected = typeof visibility === "function" ? visibility(frame) : visibility;
      if (!run.active()) return refused("unavailable");
      if (!sessionAllowsVisibility(authentic.claims.reads, selected)) return refused("forbidden");
      const context = { genesis: () => frame.genesis, state: referenceView(frame) };
      const recorded = frame.scope.at.kind === "membership" ? frame.scope.at : recordedMembership(context, frame.scope.at);
      if (!recorded || recorded.kind !== "membership") return refused("unavailable");
      if (recorded.scope !== authentic.claims.membership.scope || (recorded.inc !== null && recorded.inc !== authentic.claims.membership.inc)) return refused("forbidden");
      const clock = sessionClock(this, frame.scope, authentic.claims);
      if (clock !== null) return refused(clock === "clock-behind" ? clock : "forbidden");
      if (!run.active()) return refused("unavailable");
      let membership: ScopeRef, resolvedBirth = false;
      if (isScopeRef(recorded)) membership = recorded;
      else {
        if (!authentic.claims.reads.includes("summary")) return refused("forbidden");
        if (!this.source) return refused("unavailable");
        const birth = repositorySessionBirth(context, frame.scope.at, recorded);
        if (!birth || !run.active()) return refused("unavailable");
        beforePeer?.();
        frame.budget.spend({ calls: 1, metadata: B.request + B.reply }); // one fixed RPC, never another participant/retry
        const request = encodeSessionReference({ v: 1, to: birth.directory, reader, maxBytes: B.reply, milliseconds: run.remaining() });
        if (!request || !run.active()) return refused("unavailable");
        const raw = await this.source.read(birth.directory, request);
        if (!run.active()) return refused("unavailable"); // late task retains its slot but does no more local storage/support
        const reply = sessionReferenceReply(raw);
        if (!reply || !same(reply.directory, birth.directory) || !birth.definitions.includes(reply.definition)
          || reply.membership.scope !== recorded.scope || (recorded.inc !== null && reply.membership.inc !== recorded.inc)
          || (frame.scope.at.kind === "rules" && !same(reply.rules, frame.scope.at))) return refused("unavailable");
        if (!same(reply.membership, authentic.claims.membership)) return refused("forbidden");
        membership = reply.membership; resolvedBirth = true;
      }
      return run.active() && frame.budget.available ? { ok: true, prepared: { frame, membership, resolvedBirth, visibility: selected } } : refused("unavailable");
  }
}
