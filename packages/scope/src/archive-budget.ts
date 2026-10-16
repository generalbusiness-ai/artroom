/** One local inventory pass's admitted work, not a heap or custody proof.
 * Native callers must reserve SQL/parse work before touching the bodies. */
import type { Sql, SqlValue } from "./sqlite.ts";

export const ARCHIVE_BOUNDS = Object.freeze({ entries: 4096, attempts: 512, nodes: 64, calls: 16384, metadata: 4 * 1024 * 1024, inputWork: 64 * 1024 * 1024 });
export const ARCHIVE_SECONDS = 30;
export type ArchiveCost = { -readonly [K in keyof typeof ARCHIVE_BOUNDS]: number };
const keys = ["entries", "attempts", "nodes", "calls", "metadata", "inputWork"] as const;
export type ArchiveStopReason = "limit" | "timeout" | "unavailable";
export class ArchiveStopped extends Error {
  constructor(readonly reason: ArchiveStopReason) { super(`archive-${reason}`); }
}
const natural = (n: number): boolean => Number.isSafeInteger(n) && n >= 0 && !Object.is(n, -0);
const zero = (): ArchiveCost => ({ entries: 0, attempts: 0, nodes: 0, calls: 0, metadata: 0, inputWork: 0 });

/** Limits may only decrease in trusted tests/configuration. There is no
 * reset, top-up, per-entry allowance or uncharged cache path. */
export class ArchiveBudget {
  readonly #limits: ArchiveCost;
  readonly #used = zero();
  readonly #until: number;
  #last: number;
  #stopped: ArchiveStopReason | null = null;
  constructor(limits: Partial<ArchiveCost> = {}, readonly now: () => number = () => performance.now(), milliseconds = ARCHIVE_SECONDS * 1000) {
    if (!natural(milliseconds) || milliseconds > ARCHIVE_SECONDS * 1000 || Object.keys(limits).some(key => !(keys as readonly string[]).includes(key))) throw new ArchiveStopped("limit");
    this.#limits = { ...ARCHIVE_BOUNDS, ...limits };
    for (const key of keys) if (!natural(this.#limits[key]) || this.#limits[key] > ARCHIVE_BOUNDS[key]) throw new ArchiveStopped("limit");
    this.#last = now();
    if (!Number.isFinite(this.#last)) throw new ArchiveStopped("unavailable");
    this.#until = this.#last + milliseconds;
  }
  stop(reason: ArchiveStopReason): never { this.#stopped ??= reason; throw new ArchiveStopped(this.#stopped); }
  check(): void {
    if (this.#stopped) throw new ArchiveStopped(this.#stopped);
    const time = this.now();
    if (!Number.isFinite(time) || time < this.#last) this.stop("unavailable");
    this.#last = time;
    if (time >= this.#until) this.stop("timeout");
  }
  spend(cost: Partial<ArchiveCost>): void {
    this.check();
    if (Object.keys(cost).some(key => !(keys as readonly string[]).includes(key))) this.stop("limit");
    for (const key of keys) {
      const n = cost[key] ?? 0;
      if (!natural(n) || n > this.#limits[key] - this.#used[key]) this.stop("limit");
    }
    for (const key of keys) this.#used[key] += cost[key] ?? 0;
  }
  /** Includes projected metadata in the same cumulative input-work ledger.
   * The caller separately reserves repeated parsing/hashing work. */
  native(sql: Pick<Sql, "exec">, reservation: (query: string, args: readonly SqlValue[]) => { metadata: number; inputWork: number }): Pick<Sql, "exec"> {
    return { exec: (query, ...args) => {
      this.check();
      if (!query.startsWith("SELECT ") || query.includes(";")) this.stop("unavailable");
      try {
        const cost = reservation(query, args);
        if (!natural(cost.metadata) || !natural(cost.inputWork)) this.stop("limit");
        this.spend({ calls: 1, metadata: cost.metadata, inputWork: cost.inputWork + cost.metadata });
        const rows = sql.exec(query, ...args).toArray();
        this.check();
        return { toArray: () => { this.check(); return rows; } };
      } catch (error) { if (error instanceof ArchiveStopped) throw error; return this.stop("unavailable"); }
    } };
  }
  /** Uses the original remaining time. A late read cannot start another
   * SQL call or return a value for cache/manifest installation. Physical
   * cancellation of an uncooperative provider is outside this class. */
  async wait<T>(work: () => Promise<T>): Promise<T> {
    this.check();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expire = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { this.#stopped ??= "timeout"; reject(new ArchiveStopped(this.#stopped)); }, Math.max(0, this.#until - this.#last));
    });
    try {
      return await Promise.race([(async () => { this.check(); const value = await work(); this.check(); return value; })(), expire]);
    } catch (error) { if (error instanceof ArchiveStopped) throw error; return this.stop("unavailable"); }
    finally { if (timer !== undefined) clearTimeout(timer); }
  }
  admitted(): ArchiveCost { return { ...this.#used }; }
}
