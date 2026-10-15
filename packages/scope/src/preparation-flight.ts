/** One admitted completion deadline and one owned outstanding task. */
import type { ProofTimer } from "./genesis-proof.ts";

export const PREPARATION_MILLISECONDS = 10_000;
const timer: ProofTimer = { now: () => Date.now(), after(ms, work) { const id = setTimeout(work, ms); return () => clearTimeout(id); } };
export interface PreparationRun { readonly ends: number; active(): boolean; remaining(): number }

export class PreparationFlights {
  #pending: object | null = null;
  constructor(readonly clock: ProofTimer = timer) {}
  run<T>(work: (run: PreparationRun) => Promise<T | null>): Promise<T | null> {
    // This precedes request validation, local storage and any peer choice.
    const began = this.clock.now(), ends = began + PREPARATION_MILLISECONDS;
    if (this.#pending || !Number.isFinite(began) || !Number.isFinite(ends)) return Promise.resolve(null);
    const slot = {}; this.#pending = slot;
    let abandoned = false, complete!: (value: T | null) => void;
    const answer = new Promise<T | null>(resolve => { complete = resolve; });
    const run: PreparationRun = {
      ends, active: () => !abandoned && this.clock.now() < ends,
      remaining: () => abandoned ? 0 : Math.max(0, Math.min(PREPARATION_MILLISECONDS, Math.floor(ends - this.clock.now()))),
    };
    const cancel = this.clock.after(run.remaining(), () => { abandoned = true; complete(null); });
    void Promise.resolve().then(() => run.active() ? work(run) : null).then(value => {
      complete(run.active() ? value : null);
    }, () => complete(null)).finally(() => {
      cancel();
      // A caller timeout never releases an unresolved native task's slot.
      if (this.#pending === slot) this.#pending = null;
    });
    return answer;
  }
}
