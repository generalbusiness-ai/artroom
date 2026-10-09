/** Synthetic test settings only. No production imports, clocks or I/O. */
export interface SessionSettings { secret: string | null; sessions: boolean; inspector: string | null }
export interface SessionReadChoice { phase: "prepare" | "allows"; sessions: boolean; ownerMatches: boolean; requiredLeases: number; nullReader: boolean; inspectorPresent: boolean; branch: "mode-off" | "inspector" | "real" }
interface Owned { parent: SessionOwner | null; root: SessionOwner; settings: SessionSettings; leases: Set<object>; closed: boolean; superseded: boolean }
const owned = new WeakMap<SessionOwner, Owned>();
const stateOf = (owner: SessionOwner): Owned => owned.get(owner)!;
const baseline: Readonly<SessionSettings> = Object.freeze({ secret: null, sessions: false, inspector: null });
let current: SessionOwner | null = null;
let observer: { owner: SessionOwner; record: (choice: SessionReadChoice) => void } | null = null;
const within = (owner: SessionOwner, descendant: SessionOwner | null): boolean => {
  for (let at = descendant; at; at = stateOf(at).parent) if (at === owner) return true;
  return false;
};
const live = (owner: SessionOwner): boolean => {
  for (let at: SessionOwner | null = owner; at; at = stateOf(at).parent) if (stateOf(at).closed || stateOf(stateOf(at).root).superseded) return false;
  return true;
};
const ancestry = (): SessionOwner[] => { const owners: SessionOwner[] = []; for (let owner = current; owner; owner = stateOf(owner).parent) if (live(owner)) owners.push(owner); return owners; };
const requiredCount = (): number => ancestry().reduce((count, owner) => count + stateOf(owner).leases.size, 0);
export function sessionSettings(): Readonly<SessionSettings> {
  return current && live(current) ? { ...stateOf(current).settings, sessions: stateOf(current).settings.sessions || requiredCount() > 0 } : baseline;
}
export class SessionOwner {
  constructor(parent: SessionOwner | null, settings: SessionSettings) { owned.set(this, { parent, root: parent ? stateOf(parent).root : this, settings: { ...settings }, leases: new Set(), closed: false, superseded: false }); }
  isCurrent(): boolean { return live(this) && current === this; }
  /** Live ownership ancestry only; it grants no read mode or required lease. */
  belongsTo(ancestor: SessionOwner): boolean { return live(this) && within(ancestor, this); }
  active(): void { if (!this.isCurrent()) throw new Error("Session fixture ownership ended before its continuation completed."); }
  close = (): void => {
    const state = stateOf(this); state.closed = true; state.leases.clear();
    // Closing an ancestor ends its descendants too; stale closes cannot
    // publish a baseline or restore an old root over a newer owner.
    if (within(this, current)) {
      let parent = state.parent;
      while (parent && !live(parent)) parent = stateOf(parent).parent;
      current = parent;
    }
  };
  configure(patch: Partial<SessionSettings>): void {
    this.active();
    if (patch.sessions === false && requiredCount() > 0) throw new Error("A live required-session lease cannot be disabled.");
    stateOf(this).settings = { ...stateOf(this).settings, ...patch };
  }
  acquireRequired(): { close(): void } {
    this.active(); const lease = {}, leases = stateOf(this).leases; leases.add(lease);
    return { close: () => { leases.delete(lease); } };
  }
  async required<T>(action: () => Promise<T>): Promise<T> {
    const lease = this.acquireRequired();
    try {
      const value = await action();
      // A live explicit child may still be current when a parent lease ends.
      // Do not borrow another root or re-enable a closed ancestor.
      if (!live(this) || !within(this, current)) throw new Error("Session fixture ownership ended before its continuation completed.");
      return value;
    }
    finally { lease.close(); }
  }
  async withSettings<T>(patch: Partial<SessionSettings>, action: (child: SessionOwner) => Promise<T>): Promise<T> {
    const child = beginSessionChild(this, patch);
    try { return await action(child); } finally { child.close(); }
  }
}
export function beginSessionFixture(settings: Partial<SessionSettings> = {}): SessionOwner {
  if (current) stateOf(stateOf(current).root).superseded = true;
  const owner = new SessionOwner(null, { ...baseline, ...settings }); current = owner; return owner;
}
export function beginSessionChild(parent: SessionOwner, settings: Partial<SessionSettings> = {}): SessionOwner {
  parent.active();
  if (settings.sessions === false && requiredCount() > 0) throw new Error("A live required-session lease cannot be disabled.");
  const owner = new SessionOwner(parent, { ...stateOf(parent).settings, ...settings }); current = owner; return owner;
}
/** Read-only facade; no raw setter survives through aliases/Object.assign. */
export const sessionFields = Object.freeze({
  get secret(): string | null { return sessionSettings().secret; },
  get sessions(): boolean { return sessionSettings().sessions; },
  get inspector(): string | null { return sessionSettings().inspector; },
});
export function observeSessionReads(owner: SessionOwner, record: (choice: SessionReadChoice) => void): () => void {
  if (observer) throw new Error("Session read observer already owned.");
  const watched = { owner, record }; observer = watched;
  return () => { if (observer === watched) observer = null; };
}
export function testSessionBypass(reader: unknown, phase: SessionReadChoice["phase"]): boolean {
  const settings = sessionSettings();
  const branch = !settings.sessions ? "mode-off" : settings.inspector !== null && reader === settings.inspector ? "inspector" : "real";
  if (observer && live(observer.owner)) observer.record({ phase, sessions: settings.sessions, ownerMatches: observer.owner.isCurrent(), requiredLeases: requiredCount(), nullReader: reader === null, inspectorPresent: settings.inspector !== null, branch });
  return branch !== "real";
}
