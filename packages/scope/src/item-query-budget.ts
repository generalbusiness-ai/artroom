/** Operation-wide admitted work. These counters are not heap or wire measurements. */
import type { Sql } from "./sqlite.ts";
import { PreparationBudget, PREPARATION_BOUNDS } from "./preparation-budget.ts";

const KiB = 1024, MiB = KiB * KiB;
export type ItemQueryMode = "signed" | "session";
export type ItemQueryPhase = "signer" | "causal" | "preparation" | "peerPreparation" | "page";
export interface ItemQueryCost {
  calls: number; metadata: number; candidates: number; historyBodies: number; historyBytes: number;
  genesisBytes: number; definitionBytes: number; foldBytes: number; bodies: number; payloadBytes: number;
  attempts: number; visits: number; rpcs: number;
}
const keys = ["calls", "metadata", "candidates", "historyBodies", "historyBytes", "genesisBytes", "definitionBytes", "foldBytes", "bodies", "payloadBytes", "attempts", "visits", "rpcs"] as const;
type Cost = Readonly<Partial<ItemQueryCost>>;
const preparation = Object.freeze({ calls: 16, metadata: 64 * KiB, candidates: 16, historyBodies: 1, historyBytes: MiB, genesisBytes: MiB, definitionBytes: 256 * KiB, foldBytes: 256 * KiB });
export const ITEM_QUERY_PHASE_BOUNDS = Object.freeze({
  signer: Object.freeze({ calls: 16, metadata: 64 * KiB, historyBodies: 1, historyBytes: MiB }),
  causal: Object.freeze({ calls: 128, metadata: 512 * KiB, historyBodies: 16, historyBytes: MiB, attempts: 64, visits: 512, rpcs: 16 }),
  preparation,
  peerPreparation: preparation,
  page: Object.freeze({ calls: 200, metadata: 128 * KiB, candidates: 1616, bodies: 100, payloadBytes: 256 * KiB }),
});
export const ITEM_QUERY_TOTAL_BOUNDS = Object.freeze({
  signed: Object.freeze({ calls: 360, metadata: 768 * KiB, candidates: 1632, historyBodies: 18, historyBytes: 3 * MiB, genesisBytes: MiB, definitionBytes: 256 * KiB, foldBytes: 256 * KiB, bodies: 100, payloadBytes: 256 * KiB, attempts: 64, visits: 512, rpcs: 16 }),
  session: Object.freeze({ calls: 232, metadata: 256 * KiB, candidates: 1648, historyBodies: 2, historyBytes: 2 * MiB, genesisBytes: 2 * MiB, definitionBytes: 512 * KiB, foldBytes: 512 * KiB, bodies: 100, payloadBytes: 256 * KiB, attempts: 0, visits: 0, rpcs: 1 }),
});
const zero = (): ItemQueryCost => ({ calls: 0, metadata: 0, candidates: 0, historyBodies: 0, historyBytes: 0, genesisBytes: 0, definitionBytes: 0, foldBytes: 0, bodies: 0, payloadBytes: 0, attempts: 0, visits: 0, rpcs: 0 });
export class ItemQueryUnavailable extends Error { constructor() { super("item-query-unavailable"); } }

/** One allowance, with no reset/top-up and no borrowing between phases. */
export class ItemQueryBudget {
  readonly #used = new Map<ItemQueryPhase, ItemQueryCost>();
  readonly #total = zero();
  #failed = false;
  constructor(readonly mode: ItemQueryMode, readonly active: () => boolean) {}
  #limit(phase: ItemQueryPhase): Cost | null {
    if (this.mode === "signed" && phase === "peerPreparation" || this.mode === "session" && (phase === "signer" || phase === "causal")) return null;
    return phase === "preparation" ? { ...preparation, rpcs: this.mode === "session" ? 1 : 0 } : ITEM_QUERY_PHASE_BOUNDS[phase];
  }
  stop(): never { this.#failed = true; throw new ItemQueryUnavailable(); }
  get available(): boolean { if (!this.active()) this.#failed = true; return !this.#failed; }
  spend(phase: ItemQueryPhase, cost: Cost): void {
    if (!this.available || Object.keys(cost).some(key => !(keys as readonly string[]).includes(key))) this.stop();
    const limit = this.#limit(phase);
    if (!limit) this.stop();
    const used = this.#used.get(phase) ?? zero(), total = ITEM_QUERY_TOTAL_BOUNDS[this.mode];
    for (const key of keys) {
      const n = cost[key] ?? 0;
      if (!Number.isSafeInteger(n) || n < 0 || n > (limit[key] ?? 0) - used[key] || n > total[key] - this.#total[key]) this.stop();
    }
    for (const key of keys) { const n = cost[key] ?? 0; used[key] += n; this.#total[key] += n; }
    this.#used.set(phase, used);
  }
  /** Wrap only an operation's read-only SQL; admission precedes native execution. */
  sql(phase: ItemQueryPhase, sql: Pick<Sql, "exec">, metadataPerCall = 0): Pick<Sql, "exec"> {
    return { exec: (query, ...bindings) => { this.spend(phase, { calls: 1, metadata: metadataPerCall }); return sql.exec(query, ...bindings); } };
  }
  /** Preserve the original G2p allowance; also charge every cost to this operation. */
  preparation(phase: "preparation" | "peerPreparation"): PreparationBudget {
    return new PreparationBudget(PREPARATION_BOUNDS, () => this.available, cost => {
      this.spend(phase, { calls: cost.calls ?? 0, metadata: cost.metadata ?? 0, candidates: cost.candidates ?? 0,
        foldBytes: cost.bytes ?? 0, genesisBytes: cost.genesis ?? 0, definitionBytes: cost.definition ?? 0,
        historyBytes: cost.genesis ?? 0, historyBodies: (cost.genesis ?? 0) > 0 ? 1 : 0 });
    });
  }
  /** Reserve the trusted receiver's complete unchanged allowance before a session-reference RPC. */
  reservePeerPreparation(): void {
    this.spend("peerPreparation", preparation);
  }
  /** Fixed numeric diagnostics only. A reservation is not actual transferred bytes. */
  admitted(): { total: ItemQueryCost; phases: Partial<Record<ItemQueryPhase, ItemQueryCost>> } {
    return { total: { ...this.#total }, phases: Object.fromEntries([...this.#used].map(([phase, cost]) => [phase, { ...cost }])) };
  }
}
