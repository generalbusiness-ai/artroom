/** Small deployment-internal session reference witness; no public route. */
import type { PlatformDefinition, ScopeRef } from "@generalbusiness/dap-contract";
import { canonicalize, isPlatformDefinition, parseStrict, utf8 } from "@generalbusiness/artroom-bytes";
import { isObject, isScopeRef, same, type StateView } from "@generalbusiness/dap-derive";
import { platform, SIBLINGS_OF } from "@generalbusiness/dap-platform";
import type { Clock } from "./ports.ts";
import { ReadPreparation } from "./read-preparation.ts";
import { authenticateSession, sessionClock, type Sessions } from "./sessions.ts";

export const SESSION_REFERENCE_BOUNDS = { request: 8192, reply: 2048, milliseconds: 10_000, peers: 1 } as const;
export interface SessionReferenceRequest { v: 1; to: ScopeRef; reader: string; maxBytes: number }
export interface SessionReference { v: 1; directory: ScopeRef; definition: PlatformDefinition; membership: ScopeRef; rules: ScopeRef | null }
const only = (value: object, names: string) => Object.keys(value).sort().join() === names;
const reference = (value: ScopeRef): ScopeRef => ({ scope: value.scope, inc: value.inc, kind: value.kind });
const parsed = (raw: unknown, limit: number): unknown => {
  if (typeof raw !== "string" || raw.length > limit || utf8(raw).length > limit) return null;
  try { const value: unknown = parseStrict(raw); return canonicalize(value) === raw ? value : null; } catch { return null; }
};
export function sessionReferenceRequest(raw: unknown): SessionReferenceRequest | null {
  const value = parsed(raw, SESSION_REFERENCE_BOUNDS.request);
  return isObject(value) && only(value, "maxBytes,reader,to,v") && value["v"] === 1 && isScopeRef(value["to"]) && value["to"].kind === "directory"
    && typeof value["reader"] === "string" && value["reader"].length <= 4104 && typeof value["maxBytes"] === "number" && Number.isSafeInteger(value["maxBytes"]) && value["maxBytes"] > 0
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
    const began = this.now(), ends = began + SESSION_REFERENCE_BOUNDS.milliseconds;
    const active = () => Number.isFinite(began) && Number.isFinite(ends) && this.now() < ends;
    try {
      const request = sessionReferenceRequest(raw);
      if (!request || !active()) return null;
      const authentic = authenticateSession(this.sessions, request.reader);
      if (!("claims" in authentic) || !authentic.claims.reads.includes("summary") || !active()) return null;
      const frame = this.preparation.capture();
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
