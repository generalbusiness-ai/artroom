/**
 * The states of one checked scope at each of its heads, for the value of an
 * observation that another scope retains of it (scope contract, section
 * 16.1, "Replay"; I3 deltas, section 31).
 *
 * A view is a state in memory that the fold writes, as any other. It also
 * keeps a log: for each record, every write of it, with the position of the
 * entry that made the write. Each entry of the scope is folded into the
 * view once, in order. The state at the head that was folded last is the
 * view itself. The state at an earlier head is built from the log: for each
 * record, its last write at or before that head. No entry is folded again
 * for it.
 *
 * So the work to answer for any heads, asked in any order, is one fold of
 * each entry, and for each run of questions about one earlier head one
 * pass over the log's records. An answer of a definition reads through the
 * items of a state itself, so a build is of the order of an answer.
 */

import type { Digest, Entry, KeyId } from "@generalbusiness/artroom-contract";
import { canonicalize } from "@generalbusiness/artroom-bytes";
import { MemoryState, applyEntry } from "@generalbusiness/artroom-derive";
import type { StateView, ValidDefinition } from "@generalbusiness/artroom-derive";

/** One write of one record: the position of the entry that made it, and the write, to make again on another state. */
interface Write { from: number; again: (state: MemoryState) => void }
type Put<Name extends keyof MemoryState> = MemoryState[Name] extends (...given: infer Given) => void ? Given : never;

export class View extends MemoryState {
  /** The writes of each record, by its table and its key there, in the order of the history. */
  readonly #log = new Map<string, Write[]>();
  /** The position of the entry that is being folded, and of the last one folded. */
  #writing = -1;
  #through = -1;
  /** The state that was built last for an earlier head: the next question is often about the same head. */
  #built: { through: number; state: MemoryState } | null = null;

  /** The head that the view is folded through. Before the genesis: -1. */
  get through(): number { return this.#through; }

  /** Fold the next entry of the scope. */
  fold(definition: ValidDefinition, entry: Entry, hash: Digest): void {
    this.#writing = entry.seq;
    applyEntry(this, definition, entry, hash);
    this.#through = entry.seq;
  }

  /**
   * The state at the head `seq`, which is at or before the head that the
   * view is folded through. `built`: true when a state was built from the
   * log for it, which is the work that a caller counts.
   */
  at(seq: number): { state: StateView; built: boolean } {
    if (seq === this.#through) return { state: this, built: false };
    if (seq > this.#through) throw new Error(`the view is folded through entry ${this.#through}, and not yet through entry ${seq}`);
    if (this.#built?.through === seq) return { state: this.#built.state, built: false };
    const state = new MemoryState();
    for (const writes of this.#log.values()) {
      // The last write at or before `seq`. The writes of one record are in the order of their positions.
      let [low, high] = [0, writes.length];
      while (low < high) {
        const mid = (low + high) >>> 1;
        if (writes[mid]!.from <= seq) low = mid + 1;
        else high = mid;
      }
      if (low > 0) writes[low - 1]!.again(state);
    }
    this.#built = { through: seq, state };
    return { state, built: true };
  }

  /** Keep one write. A later write of the same record by the same entry replaces the earlier one. */
  #keep(table: string, key: readonly (string | number)[], again: Write["again"]): void {
    const at = canonicalize([table, ...key]);
    const writes = this.#log.get(at) ?? [];
    if (writes.length === 0) this.#log.set(at, writes);
    if (writes.at(-1)?.from === this.#writing) writes.pop();
    writes.push({ from: this.#writing, again });
  }

  override setScope(...given: Put<"setScope">) { super.setScope(...given); this.#keep("scope", [], (state) => state.setScope(...given)); }
  override putItem(...given: Put<"putItem">) { super.putItem(...given); this.#keep("item", [given[0].id], (state) => state.putItem(...given)); }
  override addCount(type: string, state: string, by: number) {
    super.addCount(type, state, by);
    // A count is written as a change. The log keeps the count that the change gave, which a new state takes whole.
    const count = this.count(type, state);
    this.#keep("count", [type, state], (to) => to.addCount(type, state, count));
  }
  override putRelation(...given: Put<"putRelation">) { super.putRelation(...given); const [r] = given; this.#keep("relation", [r.owner.scope, r.owner.inc, r.name, r.item], (state) => state.putRelation(...given)); }
  override putAccepted(...given: Put<"putAccepted">) { super.putAccepted(...given); this.#keep("accepted", [given[0] as KeyId, given[1]], (state) => state.putAccepted(...given)); }
  override putRequest(...given: Put<"putRequest">) { super.putRequest(...given); this.#keep("request", [given[0].seq, given[0].n], (state) => state.putRequest(...given)); }
  override putDecided(...given: Put<"putDecided">) { super.putDecided(...given); const [from, n] = given; this.#keep("decided", [from.at.scope, from.at.inc, from.seq, n], (state) => state.putDecided(...given)); }
  override putCreation(...given: Put<"putCreation">) { super.putCreation(...given); this.#keep("creation", [given[0]], (state) => state.putCreation(...given)); }
  override putOperation(...given: Put<"putOperation">) { super.putOperation(...given); this.#keep("operation", [given[0].id], (state) => state.putOperation(...given)); }
  override putTexts(...given: Put<"putTexts">) { super.putTexts(...given); this.#keep("texts", [given[0], given[1]], (state) => state.putTexts(...given)); }
  override putPrepared(...given: Put<"putPrepared">) { super.putPrepared(...given); const [p] = given; this.#keep("prepared", [p.intent, p.capability, p.step], (state) => state.putPrepared(...given)); }
  override putRecord(...given: Put<"putRecord">) { super.putRecord(...given); const [r] = given; this.#keep("record", [r.capability, r.kind, canonicalize(r.key)], (state) => state.putRecord(...given)); }
  override putObserved(...given: Put<"putObserved">) { super.putObserved(...given); const [h] = given; this.#keep("observed", [h.of.scope, h.of.inc, h.subject], (state) => state.putObserved(...given)); }
}
