/**
 * The ports of a scope: everything the core asks of the world outside its
 * storage, each as one narrow interface. `production()` gives the defaults.
 * A default that would decide something for another owner refuses: no grant
 * is current, no foreign entry can be read, no definition can be read and
 * no reader may read, and no sent text can be read. Transport, the dispatcher and the authority note's
 * rules replace them, each behind its own port.
 */

import type { Digest, Entry, FactRef, Grant, PlatformDefinition, Prepared, RoutingRefusal, ScopeRef, Timestamp, UnavailableReason } from "@generalbusiness/artroom-contract";
import { timeOf, type Delivered, type RuleInput } from "@generalbusiness/artroom-derive";
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
 * One foreign entry, by fact reference (section 5.2, step 1, and section
 * 7.4), with the name of the definition its scope pins. Null: it cannot be
 * read now, and may be later. `absent`: the object with that name answered,
 * and it does not hold that entry: it is empty, it is another incarnation,
 * or it has no entry there. The core also stops waiting after `seconds`,
 * and checks the entry against the fact's hash itself.
 */
export type Foreign = { entry: Entry; under: string } | { absent: true } | null;
export interface Resolver { read(fact: FactRef, seconds: number): Promise<Foreign> }

/**
 * How transport answers one delivery (section 7.4). None of these is an
 * entry. `recorded`: the fact of the entry that recorded the message, now or
 * before; a repeat gets the same fact. `retry`: not decided yet; the sender
 * keeps the duty. Its reason `unsupported-definition`: a creation whose
 * definition, as its creator holds it, is not one this runtime can pin. `routing`: the resolver of the name refused it before it
 * reached the scope's judgment, and nothing was recorded. `source-unverified`:
 * a source check failed, and nothing was recorded.
 */
export type Delivery =
  | { answer: "recorded"; fact: FactRef }
  | { answer: "retry"; reason: UnavailableReason | "scope-full" | "unsupported-definition" }
  | { answer: "routing"; reason: RoutingRefusal }
  | { answer: "source-unverified" };

/**
 * One dispatch of one send to the object its address names: by a reference's
 * scope ID or, for a creation, by the digest of the seed. Null: no answer.
 * It makes one dispatch for each call, and never retries or forwards.
 */
export interface Transport { send(envelope: Delivered): Promise<Delivery | null> }

/** Evaluation of prepared rule inputs (section 5.2, step 5). A fault is thrown, and nothing is prepared. */
export interface Rules { evaluate(asked: readonly RuleInput[]): Promise<Prepared[]> }

/** The next wake time, or none (section 5.2). A convenience: a late or lost alarm delays a drain and loses nothing. */
export interface Alarm { set(at: Timestamp | null): void | Promise<void> }

/**
 * A definition's declaration, by what a seed names (section 6.1). A
 * declaration is immutable bytes named by their digest, so it is read before
 * the turn (section 5.1), and the reader checks the digest itself.
 *
 * `holder` is the scope that retains the bytes (section 9.2): for a child,
 * the creator its seed names. Null: nobody is named, as for a founding.
 * `absent`: the holder answered, and it retains no bytes under that digest.
 * `unavailable`: the bytes cannot be read now, and may be later.
 */
export type DefinitionRead = { ok: true; bytes: string } | { ok: false; reason: "unsupported-definition" | "unavailable" | "absent" };
export interface Definitions { read(named: Digest | PlatformDefinition, holder: ScopeRef | null): Promise<DefinitionRead> }

/**
 * A detached text that a delivered message names by digest (section 6.2),
 * read from the scope that sent the message: the bytes travel beside the
 * message, and the receiver asks its sender for them before the turn.
 * `from` is the entry that sent the message. The reader checks the digest
 * itself. `absent`: the sender answered, and it holds no such text for that
 * entry. `unavailable`: it cannot be read now, and may be later.
 */
export type TextRead = { ok: true; text: string } | { ok: false; reason: "absent" | "unavailable" };
export interface SentTexts { read(from: FactRef, digest: Digest): Promise<TextRead> }

/** The reads of section 9.1. */
/** `log` and `retained` are what a verifier reads (sections 9.2 and 9.4): the stored bytes of entries, and retained inputs. */
export type ReadName = "summary" | "items" | "history" | "entry" | "outbox" | "log" | "retained";

/** Who may read. `reader` is whatever the caller presented; sessions are the authority note's. */
export interface Readers { allows(reader: unknown, read: ReadName): boolean }

export interface Ports {
  clock: Clock; random: Random; authority: Authority; resolver: Resolver; rules: Rules; alarm: Alarm; definitions: Definitions; texts: SentTexts; readers: Readers;
  /** Null: this scope has no transport. Its sends stay in the outbox and nothing dispatches them. */
  transport: Transport | null;
}

/**
 * The production defaults. The clock and the random source are the
 * runtime's. The rules are derive's evaluator. The alarm does nothing until
 * the object supplies its own. There is no transport until a namespace
 * supplies one, and no declaration and no sent text can be read until a
 * namespace supplies the scope that retains it. Every other port refuses.
 */
export function production(): Ports {
  return {
    clock: { read: () => timeOf(Date.now()) },
    random: { bytes: (length) => crypto.getRandomValues(new Uint8Array(length)) },
    authority: { current: () => false },
    resolver: { read: () => Promise.resolve(null) },
    rules: { evaluate: evaluateRules },
    alarm: { set: () => undefined },
    // A platform definition is supplied in code, and none is yet (section 6.1). A declared one is read from the scope that
    // retains it, through the namespace; with no namespace none can be read.
    definitions: { read: (named) => Promise.resolve({ ok: false, reason: named.startsWith("platform:") ? "unsupported-definition" : "unavailable" }) },
    texts: { read: () => Promise.resolve({ ok: false, reason: "unavailable" }) },
    readers: { allows: () => false },
    transport: null,
  };
}
