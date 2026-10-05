/**
 * One good set of histories for every test of this package, made by derive's
 * fixture scopes in memory, which judge, seal and fold as a commit does: a
 * desk D, and two tickets it creates and confirms, P and I. P links to I,
 * which is a relationship update. A test copies the set and changes the
 * copy.
 *
 *   D: 0 genesis, 1 act (creates P), 2 P's result, 3 P's index row,
 *      4 act (creates I), 5 I's result, 6 I's index row
 *   P: 0 genesis, 1 confirmation, 2 act `link`, 3 I's result
 *   I: 0 genesis, 1 confirmation, 2 P's update
 */

import type { Entry, RetainedInput } from "@generalbusiness/artroom-contract";
import { canonicalize, digestBytes, utf8 } from "@generalbusiness/artroom-bytes";
import { born, deliver, fields, founded, keys, type Ledger } from "@generalbusiness/artroom-derive/testing";
import { MemorySource, hashOfBytes, type MemoryScope } from "../src/index.ts";

function written(judgment: { result: string }): void {
  if (judgment.result !== "write") throw new Error(`the fixture history was not written: ${JSON.stringify(judgment)}`);
}

function histories(): Record<"D" | "P" | "I", Ledger> {
  const D = founded();
  const ticket = (title: string, mint: number): Ledger => {
    const act = D.did(keys.rita, "open-issue", fields({ title }));
    const { child, judgment } = born(D, act.seq, 0, mint);
    written(judgment);
    written(deliver(D, child, 0, 0));            // the result of the creation; D sends the confirmation
    written(deliver(child, D, D.head.seq, 0));   // the confirmation
    written(deliver(D, child, 0, 1));            // the index row the genesis held until then
    return child;
  };
  const P = ticket("P", 20);
  const I = ticket("I", 21);
  const link = P.did(keys.rita, "link", fields({ target: I.at, about: 0 }));
  written(deliver(I, P, link.seq, 0));
  written(deliver(P, I, I.head.seq, 0));
  return { D, P, I };
}

/** What a scope's object would serve: each entry's canonical bytes and hash, its declaration, and the bytes of each foreign entry it used. */
export function served(ledger: Ledger, all: readonly Ledger[]): MemoryScope {
  const retained: RetainedInput[] = [{ kind: "definition", digest: ledger.definition.digest, bytes: canonicalize(ledger.definition.declared) }];
  for (const { entry } of ledger.entries) {
    for (const use of entry.uses) {
      const owner = all.find((other) => other.at.scope === use.fact.at.scope)!;
      retained.push({ kind: "entry", digest: use.content, bytes: canonicalize(owner.entries[use.fact.seq]!.entry), under: owner.definition.declared.name });
    }
  }
  return { scope: ledger.at, entries: ledger.entries.map(({ entry, hash }) => ({ seq: entry.seq, hash, bytes: canonicalize(entry) })), retained };
}

const GOOD = (() => {
  const { D, P, I } = histories();
  const all = [D, P, I];
  return { D: served(D, all), P: served(P, all), I: served(I, all) };
})();

export type World = typeof GOOD;

/** A copy of the good histories, to change. */
export const world = (): World => structuredClone(GOOD);
export const sourceOf = (w: World, pageSize = 2): MemorySource => new MemorySource(Object.values(w), pageSize);
export const entryOf = (scope: MemoryScope, seq: number): Entry => JSON.parse(scope.entries[seq]!.bytes) as Entry;

/**
 * Change entry `seq` and seal the history again from there: each later entry
 * takes the new hash of the one before it. The scope's own chain is then
 * intact, and only what the entries say has changed.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rewrite(scope: MemoryScope, seq: number, change: (entry: any) => void): void {
  let prev: string | null = null;
  for (let i = seq; i < scope.entries.length; i++) {
    const entry = entryOf(scope, i) as { prev: string | null };
    if (i === seq) change(entry);
    else entry.prev = prev;
    const bytes = canonicalize(entry);
    prev = hashOfBytes(bytes);
    scope.entries[i] = { seq: i, hash: prev as never, bytes };
  }
}

/** The digest a `uses` records for a foreign entry: of its canonical bytes. */
export const contentOf = (bytes: string) => digestBytes(utf8(bytes));
