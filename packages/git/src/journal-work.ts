/** Internal archive layout work. The native caller owns the original
 * inventory allowance/deadline; layout never creates or tops it up. */
export interface JournalCost {
  entries: number;
  attempts: number;
  nodes: number;
  calls: number;
  metadata: number;
  inputWork: number;
}

/** Structural port of the existing native ArchiveBudget. No Git-to-Scope
 * runtime dependency or caller-supplied admission certificate. */
export interface JournalBudget {
  check(): void;
  spend(cost: Partial<JournalCost>): void;
  wait<T>(work: () => Promise<T>): Promise<T>;
  admitted(): JournalCost;
}

export const JOURNAL_LAYOUT_LIMITS = Object.freeze({
  objects: 8192,
  trees: 2048,
  files: 8192,
  names: 32768,
  depth: 64,
  objectBytes: 8 * 1024 * 1024,
  outputWork: 64 * 1024 * 1024,
});
export type JournalLayoutLimits = { -readonly [K in keyof typeof JOURNAL_LAYOUT_LIMITS]: number };
export type JournalLayoutReason = "limit" | "timeout" | "unavailable" | "format" | "object-id" | "missing-object" | "object-mismatch" | "tree" | "commit" | "timestamp" | "manifest" | "input" | "missing-input" | "input-mismatch" | "parent";
export class JournalLayoutRefusal extends Error {
  constructor(readonly reason: JournalLayoutReason, readonly where?: string) { super(`journal-layout-${reason}`); }
}
export function refuseJournal(reason: JournalLayoutReason, where?: string): never { throw new JournalLayoutRefusal(reason, where); }
const natural = (n: number): boolean => Number.isSafeInteger(n) && n >= 0 && !Object.is(n, -0);
const keys = Object.keys(JOURNAL_LAYOUT_LIMITS) as (keyof JournalLayoutLimits)[];

/** Counts attempts, including repeated/cached object construction. Output
 * work reserves header+body bytes before copying/hashing, even if the
 * resulting object is deduplicated. It is not unique output size or heap. */
export class JournalWork {
  readonly limits: Readonly<JournalLayoutLimits>;
  #stopped = false;
  readonly used: JournalLayoutLimits = { objects: 0, trees: 0, files: 0, names: 0, depth: 0, objectBytes: 0, outputWork: 0 };
  constructor(readonly budget: JournalBudget, limits: Partial<JournalLayoutLimits> = {}) {
    if (Object.keys(limits).some(k => !Object.hasOwn(JOURNAL_LAYOUT_LIMITS, k))) refuseJournal("limit");
    const chosen = { ...JOURNAL_LAYOUT_LIMITS, ...limits };
    for (const k of keys) if (!natural(chosen[k]) || chosen[k] > JOURNAL_LAYOUT_LIMITS[k]) refuseJournal("limit");
    this.limits = Object.freeze(chosen);
    budget.check();
  }
  check(): void { if (this.#stopped) refuseJournal("limit"); this.budget.check(); }
  stop(): never { this.#stopped = true; return refuseJournal("limit"); }
  spend(cost: Partial<Pick<JournalLayoutLimits, "objects" | "trees" | "files" | "names" | "outputWork">>): void {
    this.check();
    for (const [key, n] of Object.entries(cost)) {
      const k = key as keyof typeof cost;
      if (!["objects", "trees", "files", "names", "outputWork"].includes(key) || !natural(n) || n > this.limits[k] - this.used[k]) this.stop();
    }
    for (const [key, n] of Object.entries(cost)) this.used[key as keyof typeof cost] += n;
  }
  maximumSize(n: number): void {
    this.check();
    if (!natural(n) || n > this.limits.objectBytes) this.stop();
  }
  size(n: number): void {
    this.maximumSize(n);
    this.used.objectBytes = Math.max(this.used.objectBytes, n);
  }
  depth(n: number): void {
    this.check();
    if (!natural(n) || n > this.limits.depth) this.stop();
    this.used.depth = Math.max(this.used.depth, n);
  }
  input(bytes: number, passes = 1): void {
    this.check();
    if (!natural(bytes) || !natural(passes) || !Number.isSafeInteger(bytes * passes)) this.stop();
    this.budget.spend({ inputWork: bytes * passes });
  }
  metadata(bytes: number): void {
    this.check();
    if (!natural(bytes)) this.stop();
    this.budget.spend({ metadata: bytes, inputWork: bytes });
  }
}
