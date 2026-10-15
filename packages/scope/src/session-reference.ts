/** Small deployment-internal session reference witness; no public route. */
import type { PlatformDefinition, ScopeRef } from "@generalbusiness/dap-contract";
import { canonicalize, isPlatformDefinition, parseStrict, utf8, wellFormed } from "@generalbusiness/artroom-bytes";
import { isObject, isScopeRef, same, type StateView } from "@generalbusiness/dap-derive";
import { platform, SIBLINGS_OF } from "@generalbusiness/dap-platform";
import type { Clock } from "./ports.ts";
import { ReadPreparation } from "./read-preparation.ts";
import { PREPARATION_MILLISECONDS } from "./preparation-flight.ts";
import { PreparationBudget, PREPARATION_BOUNDS } from "./preparation-budget.ts";
import { authenticateSession, sessionClock, type Sessions } from "./sessions.ts";

export const SESSION_REFERENCE_BOUNDS = { request: 8192, reply: 2048, milliseconds: PREPARATION_MILLISECONDS, peers: 1 } as const;
export interface SessionReferenceRequest { v: 1; to: ScopeRef; reader: string; maxBytes: number; milliseconds: number }
export interface SessionReference { v: 1; directory: ScopeRef; definition: PlatformDefinition; membership: ScopeRef; rules: ScopeRef | null }
export interface SessionReferenceSource { read(directory: ScopeRef, request: string): Promise<unknown> }
const only = (value: object, names: string) => Object.keys(value).sort().join() === names;
const reference = (value: ScopeRef): ScopeRef => ({ scope: value.scope, inc: value.inc, kind: value.kind });
const parsed = (raw: unknown, limit: number): unknown => {
  if (typeof raw !== "string" || raw.length > limit || utf8(raw).length > limit) return null;
  try { const value: unknown = parseStrict(raw); return canonicalize(value) === raw ? value : null; } catch { return null; }
};
/** Native sender preflights fields before serialization. Numeric inputs can
 * only reduce the receiver's fixed hard caps, never increase them. */
export function encodeSessionReference(request: SessionReferenceRequest): string | null {
  if (request.v !== 1 || !isScopeRef(request.to) || request.to.kind !== "directory" || typeof request.reader !== "string" || request.reader.length > 4104 || !wellFormed(request.reader)
    || !Number.isSafeInteger(request.maxBytes) || request.maxBytes < 1 || !Number.isSafeInteger(request.milliseconds) || request.milliseconds < 1) return null;
  const bytes = canonicalize({ v: 1, to: reference(request.to), reader: request.reader, maxBytes: Math.min(request.maxBytes, SESSION_REFERENCE_BOUNDS.reply), milliseconds: Math.min(request.milliseconds, SESSION_REFERENCE_BOUNDS.milliseconds) });
  return bytes.length <= SESSION_REFERENCE_BOUNDS.request && utf8(bytes).length <= SESSION_REFERENCE_BOUNDS.request ? bytes : null;
}
export function sessionReferenceRequest(raw: unknown): SessionReferenceRequest | null {
  const value = parsed(raw, SESSION_REFERENCE_BOUNDS.request);
  return isObject(value) && only(value, "maxBytes,milliseconds,reader,to,v") && value["v"] === 1 && isScopeRef(value["to"]) && value["to"].kind === "directory"
    && typeof value["reader"] === "string" && value["reader"].length <= 4104 && typeof value["maxBytes"] === "number" && Number.isSafeInteger(value["maxBytes"]) && value["maxBytes"] > 0
    && typeof value["milliseconds"] === "number" && Number.isSafeInteger(value["milliseconds"]) && value["milliseconds"] > 0
    ? value as unknown as SessionReferenceRequest : null;
}
export function sessionReferenceReply(raw: unknown): SessionReference | null {
  const value = parsed(raw, SESSION_REFERENCE_BOUNDS.reply);
  return isObject(value) && only(value, "definition,directory,membership,rules,v") && value["v"] === 1
    && isScopeRef(value["directory"]) && value["directory"].kind === "directory" && isScopeRef(value["membership"]) && value["membership"].kind === "membership"
    && (value["rules"] === null || (isScopeRef(value["rules"]) && value["rules"].kind === "rules"))
    && isPlatformDefinition(value["definition"]) && SIBLINGS_OF[value["definition"]] !== undefined && platform(value["definition"]) !== null
    ? value as unknown as SessionReference : null;
}

/** A receiver has no peer port: authentication can never recursively discover one. */
export class SessionReferences {
  constructor(readonly preparation: ReadPreparation, readonly sessions: () => Sessions | null, readonly clock: Clock, readonly now: () => number = () => Date.now()) {}
  read(raw: unknown): string | null {
    const began = this.now(); let ends = began + SESSION_REFERENCE_BOUNDS.milliseconds;
    const active = () => Number.isFinite(began) && Number.isFinite(ends) && this.now() < ends;
    try {
      const request = sessionReferenceRequest(raw);
      if (!request || !active()) return null;
      // Relative remaining time, not a cross-isolate clock epoch. Parsing
      // and all receiver work consume this same subordinate allowance.
      ends = Math.min(ends, began + request.milliseconds);
      if (!active()) return null;
      const authentic = authenticateSession(this.sessions, request.reader);
      if (!("claims" in authentic) || !authentic.claims.reads.includes("summary") || !active()) return null;
      const frame = this.preparation.capture(new PreparationBudget(PREPARATION_BOUNDS, active));
      if (!frame || !active() || !same(frame.scope.at, request.to) || frame.scope.status !== "active" || !isPlatformDefinition(frame.pinned.named) || !SIBLINGS_OF[frame.pinned.named]) return null;
      const page = frame.view.page("repository", ["open"], null, 1);
      // The lookahead is a cardinality proof, never a truncated inventory.
      if (page.items.length !== 1 || page.more) return null;
      frame.budget.spend({ calls: 1 }); // exact native callback over the already admitted page
      const view = new Proxy({}, { get(_target, property) {
        if (property !== "page") return frame.budget.stop();
        return (type: string, states: readonly string[], after: number | null, limit: number) => {
          if (type !== "repository" || states.length !== 1 || states[0] !== "open" || after !== null || limit !== 1) return frame.budget.stop();
          return page;
        };
      } }) as StateView;
      const membership = platform(frame.pinned.named)?.membership?.(view);
      if (!isScopeRef(membership) || membership.kind !== "membership" || !same(membership, authentic.claims.membership)
        || sessionClock(this, frame.scope, authentic.claims) !== null || !active()) return null;
      const heldRules = page.items[0]!.refs["rules"];
      const rules = isScopeRef(heldRules) && heldRules.kind === "rules" ? reference(heldRules) : null;
      const witness: SessionReference = { v: 1, directory: reference(frame.scope.at), definition: frame.pinned.named, membership: reference(membership), rules };
      if (!frame.current() || !active()) return null;
      // No storage or support phase follows the last fresh authority check.
      const fresh = authenticateSession(this.sessions, request.reader);
      if (!("claims" in fresh) || !same(fresh.claims, authentic.claims) || !fresh.claims.reads.includes("summary") || sessionClock(this, frame.scope, fresh.claims) !== null || !active()) return null;
      const bytes = canonicalize(witness), cap = Math.min(request.maxBytes, SESSION_REFERENCE_BOUNDS.reply);
      return bytes.length <= cap && utf8(bytes).length <= cap && active() ? bytes : null;
    } catch { return null; }
  }
}
