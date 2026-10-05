/**
 * The ports of a scope: everything the core asks of the world outside its
 * storage, each as one narrow interface. `production()` gives the defaults.
 * A default that would decide something for another owner refuses: no grant
 * is current, no foreign entry can be read, no definition is supplied and
 * no reader may read. Transport, the dispatcher and the authority note's
 * rules replace them, each behind its own port.
 */

import type { Digest, Entry, FactRef, Grant, PlatformDefinition, Prepared, ScopeRef, Timestamp } from "@generalbusiness/artroom-contract";
import { timeOf, type RuleInput } from "@generalbusiness/artroom-derive";
import { evaluateRules } from "@generalbusiness/artroom-derive/rule";

/** One reading for each call (section 5.3). The core calls it once in a step 3 and once in a commit. */
export interface Clock { read(): Timestamp }

/** Random bytes, for the incarnation a scope mints with its first entry (section 2.2). */
export interface Random { bytes(length: number): Uint8Array }

/**
 * Held authority (section 5.1): whether a presented grant is current. It is
 * asked in the commit, with the commit's clock reading, so it is
 * synchronous. The freshness rule is the authority note's.
 */
export interface Authority { current(grant: Grant, scope: ScopeRef, reading: Timestamp): boolean }

/**
 * One foreign entry, by fact reference (section 5.2, step 1), with the name
 * of the definition its scope pins. Null: it cannot be read now. The core
 * also stops waiting after `seconds`.
 */
export interface Resolver { read(fact: FactRef, seconds: number): Promise<{ entry: Entry; under: string } | null> }

/** Evaluation of prepared rule inputs (section 5.2, step 5). A fault is thrown, and nothing is prepared. */
export interface Rules { evaluate(asked: readonly RuleInput[]): Promise<Prepared[]> }

/** The next wake time, or none (section 5.2). A convenience: a late or lost alarm delays a drain and loses nothing. */
export interface Alarm { set(at: Timestamp | null): void | Promise<void> }

/** A definition's declaration, by what a seed names (section 6.1). */
export type DefinitionRead = { ok: true; bytes: string } | { ok: false; reason: "unsupported-definition" | "unavailable" };
export interface Definitions { read(named: Digest | PlatformDefinition): Promise<DefinitionRead> }

/** The reads of section 9.1. */
export type ReadName = "summary" | "items" | "history" | "entry" | "outbox";

/** Who may read. `reader` is whatever the caller presented; sessions are the authority note's. */
export interface Readers { allows(reader: unknown, read: ReadName): boolean }

export interface Ports {
  clock: Clock; random: Random; authority: Authority; resolver: Resolver; rules: Rules; alarm: Alarm; definitions: Definitions; readers: Readers;
}

/**
 * The production defaults. The clock and the random source are the
 * runtime's. The rules are derive's evaluator. The alarm does nothing until
 * the object supplies its own. Every other port refuses.
 */
export function production(): Ports {
  return {
    clock: { read: () => timeOf(Date.now()) },
    random: { bytes: (length) => crypto.getRandomValues(new Uint8Array(length)) },
    authority: { current: () => false },
    resolver: { read: () => Promise.resolve(null) },
    rules: { evaluate: evaluateRules },
    alarm: { set: () => undefined },
    // A platform definition is supplied in code, and none is yet (section 6.1). No source of declared definitions is wired in this step.
    definitions: { read: (named) => Promise.resolve({ ok: false, reason: named.startsWith("platform:") ? "unsupported-definition" : "unavailable" }) },
    readers: { allows: () => false },
  };
}
