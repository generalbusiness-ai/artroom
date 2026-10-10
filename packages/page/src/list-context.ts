/** Tab-local list preferences. The context contains public room and key IDs,
 * never a signing secret, invitation, config blob or URL query parameter. */
import { isKeyId, isScopeId, isScopeRef } from "@generalbusiness/artroom-bytes";
import type { KeyId, ScopeId, ScopeRef } from "@generalbusiness/artroom-contract";

export interface ListContext { origin: string; directory: ScopeId; membership: ScopeRef; key: KeyId }
export type ListKind = "issue" | "change";
export type ListFilter = "open" | "closed" | "merged" | "all";
export interface ListState { query: string; filter: ListFilter }
export interface ListStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }

const STORAGE = "artroom-page-lists:v1";
const MAX_CONTEXTS = 64;
export const LIST_QUERY_LIMIT = 512;
const MAX_RECORD = 128 * 1024;
const initial = (): ListState => ({ query: "", filter: "open" });
const validKind = (kind: unknown): kind is ListKind => kind === "issue" || kind === "change";
const validState = (value: unknown, kind: ListKind): value is ListState => {
  if (!value || typeof value !== "object") return false;
  const state = value as ListState;
  return typeof state.query === "string" && state.query.length <= LIST_QUERY_LIMIT
    && ["open", "all", kind === "issue" ? "closed" : "merged"].includes(state.filter);
};
function keyOf(context: ListContext, kind: ListKind): string | null {
  try {
    const { origin, directory, membership, key } = context;
    if (origin.length > 2048 || new URL(origin).origin !== origin || !isScopeId(directory)
      || !isScopeRef(membership) || membership.kind !== "membership" || !isKeyId(key) || !validKind(kind)) return null;
    return JSON.stringify([origin, directory, membership.scope, membership.inc, membership.kind, key, kind]);
  } catch { return null; }
}
function kindOfKey(key: string): ListKind | null {
  try {
    const parts: unknown = JSON.parse(key);
    if (!Array.isArray(parts) || parts.length !== 7) return null;
    const [origin, directory, scope, inc, memberKind, keyId, kind] = parts;
    if (!validKind(kind)) return null;
    const context = { origin, directory, membership: { scope, inc, kind: memberKind }, key: keyId } as ListContext;
    return keyOf(context, kind) === key ? kind : null;
  } catch { return null; }
}

/** Storage is optional: unavailable or malformed persistence never prevents
 * a native task. Memory still keeps list state through same-document redraws. */
export class ListContexts {
  private readonly memory = new Map<string, ListState>();
  constructor(private readonly storage: () => ListStorage | null) {}
  private read(): Map<string, ListState> {
    const merged = new Map<string, ListState>();
    try {
      const raw = this.storage()?.getItem(STORAGE);
      if (raw && raw.length <= MAX_RECORD) {
        const saved: unknown = JSON.parse(raw);
        if (Array.isArray(saved) && saved.length <= MAX_CONTEXTS) for (const row of saved) {
          if (!Array.isArray(row) || row.length !== 2 || typeof row[0] !== "string") continue;
          const kind = kindOfKey(row[0]);
          if (kind && validState(row[1], kind)) merged.set(row[0], { ...row[1] });
        }
      }
    } catch { /* The list remains usable when browser storage is unavailable. */ }
    for (const [key, state] of this.memory) { merged.delete(key); merged.set(key, state); }
    while (merged.size > MAX_CONTEXTS) merged.delete(merged.keys().next().value!);
    return merged;
  }
  stateOf(context: ListContext, kind: ListKind): ListState {
    const key = keyOf(context, kind);
    return key ? { ...(this.read().get(key) ?? initial()) } : initial();
  }
  keepState(context: ListContext, kind: ListKind, state: ListState): void {
    const key = keyOf(context, kind);
    if (!key || !validState(state, kind)) return;
    this.memory.delete(key);
    this.memory.set(key, { ...state });
    while (this.memory.size > MAX_CONTEXTS) this.memory.delete(this.memory.keys().next().value!);
    const rows = [...this.read()];
    // Storage quotas and writes that fail are a persistence limit only.
    try { const bytes = JSON.stringify(rows); if (bytes.length <= MAX_RECORD) this.storage()?.setItem(STORAGE, bytes); }
    catch { /* Memory preserves this tab's current navigation state. */ }
  }
}
const lists = new ListContexts(() => globalThis.sessionStorage ?? null);
export const stateOf = (context: ListContext, kind: ListKind): ListState => lists.stateOf(context, kind);
export const keepState = (context: ListContext, kind: ListKind, state: ListState): void => lists.keepState(context, kind, state);
