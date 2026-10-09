/** Navigation and room identity shared by the browser shell and its tests. */
export type Destination = "issues" | "changes" | "rules" | "settings";
export interface Route { destination: Destination; scope: string | null }

export function routeOf(hash: string): Route {
  const [path, query] = hash.replace(/^#/, "").split("?");
  const [, kind, scope] = (path || "/").split("/");
  if (kind === "settings" || kind === "rules") return { destination: kind, scope: null };
  if (kind === "issue" && scope) return { destination: "issues", scope };
  if (kind === "change" && scope) return { destination: "changes", scope };
  return { destination: new URLSearchParams(query).get("kind") === "change" ? "changes" : "issues", scope: null };
}

/** Membership incarnation and device key are part of a room's reading context. */
export function roomContext(origin: string, place: { directory: string; membership: { scope: string; inc: string; kind: string } }, secret: string): string {
  return JSON.stringify([origin, place.directory, place.membership.scope, place.membership.inc, place.membership.kind, secret]);
}

/** Cache the pending read, rather than allowing a late old read to replace the new room. */
export class RoomOpening<T> {
  private current: { key: string; value: Promise<T> } | null = null;
  clear(): void { this.current = null; }
  get(key: string, load: () => Promise<T>): Promise<T> {
    if (this.current?.key === key) return this.current.value;
    const pending = { key, value: load() };
    this.current = pending;
    void pending.value.catch(() => { if (this.current === pending) this.current = null; });
    return pending.value;
  }
}

export type SendingState = "preparing" | "submitting" | "unknown";
/** One mutation per room/member/scope. An attempted request is never replaced after an unknown outcome. */
export class ScopeSending {
  private states = new Map<string, { kind: string; state: SendingState }>();
  get(key: string): { kind: string; state: SendingState } | undefined { return this.states.get(key); }
  begin(key: string, kind: string): boolean {
    if (this.states.has(key)) return false;
    this.states.set(key, { kind, state: "preparing" });
    return true;
  }
  submitting(key: string): void {
    const current = this.states.get(key);
    if (current?.state === "preparing") current.state = "submitting";
  }
  answered(key: string): void { this.states.delete(key); }
  failed(key: string): void {
    const current = this.states.get(key);
    if (current?.state === "preparing") this.states.delete(key);
    else if (current) current.state = "unknown";
  }
}
