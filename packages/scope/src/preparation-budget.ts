/** One shared allowance for read-only native preparation, including retries. */
export const PREPARATION_BOUNDS = { calls: 16, candidates: 16, bytes: 256 * 1024, metadata: 64 * 1024, genesis: 1024 * 1024, definition: 256 * 1024, keyBytes: 2048 } as const;
export type PreparationCost = { calls: number; candidates: number; bytes: number; metadata: number; genesis: number; definition: number };
const costs = ["calls", "candidates", "bytes", "metadata", "genesis", "definition"] as const;
export class PreparationUnavailable extends Error { constructor() { super("preparation-unavailable"); } }
export class PreparationBudget {
  readonly #left: PreparationCost;
  #failed = false;
  constructor(limits: PreparationCost = PREPARATION_BOUNDS) {
    for (const key of costs) {
      if (!Number.isSafeInteger(limits[key]) || limits[key] < 0 || limits[key] > PREPARATION_BOUNDS[key]) throw new PreparationUnavailable();
    }
    this.#left = { calls: limits.calls, candidates: limits.candidates, bytes: limits.bytes, metadata: limits.metadata, genesis: limits.genesis, definition: limits.definition };
  }
  invalidate(): void { this.#failed = true; }
  stop(): never { this.invalidate(); throw new PreparationUnavailable(); }
  spend(cost: Partial<PreparationCost>): void {
    if (this.#failed) this.stop();
    for (const key of costs) {
      const n = cost[key] ?? 0;
      if (!Number.isSafeInteger(n) || n < 0 || n > this.#left[key]) this.stop();
    }
    for (const key of costs) this.#left[key] -= cost[key] ?? 0;
  }
  get remaining(): PreparationCost { return { ...this.#left }; }
  get available(): boolean { return !this.#failed; }
}
