/**
 * The ports of a scope: everything the core asks of the world outside its
 * storage, each as one narrow interface. `production()` gives the defaults.
 * A default that would decide something for another owner refuses: no grant
 * is read, no foreign entry can be read, no declared definition can be read
 * and no reader may read, no sent text can be read, and nothing is sent
 * outside the service. Transport, the dispatcher and the authority note's
 * rules replace them, each behind its own port. The platform definitions
 * are the platform package's, which is code of this runtime.
 */

import type { Digest, Entry, FactRef, Grant, PlatformDefinition, Prepared, RoutingRefusal, ScopeRef, SignedIntent, Timestamp, UnavailableReason } from "@generalbusiness/artroom-contract";
import { timeOf, type Capabilities, type Clock as Reading, type Delivered, type Owners, type Presented, type RuleInput, type StateView, type Window } from "@generalbusiness/artroom-derive";
import { evaluateRules } from "@generalbusiness/artroom-derive/rule";
import { platform, type Platform } from "@generalbusiness/artroom-platform";
import { NO_OUTSIDE, type Outside } from "./operations.ts";

/** One reading for each call (section 5.3). The core calls it once in a step 3 and once in a commit. */
export interface Clock { read(): Timestamp }

/** Random bytes, for the incarnation a scope mints with its first entry (section 2.2). */
export interface Random { bytes(length: number): Uint8Array }

/**
 * What the read phase of the authority port is asked: the judgment that one
 * act needs (authority note, section 3.3).
 */
export interface Asked {
  /** The scope that judges, with its incarnation. */
  scope: ScopeRef;
  /** The act, or the intent that a capability's step prepares for, with its signature and shape checked. Its signer is the intent's `actor`. */
  signed: SignedIntent;
  /** The action that the act's row names in `grant`, or that the capability names for the step. Null: the pinned definition has no act of that kind. */
  action: string | null;
  /** The grants presented beside the intent, each of a grant's form. Nothing signs them. */
  grants: readonly Grant[];
  /** The freshness window of this kind of commit, which the pinned definition and the scope's kind give (derive's `windowOf`), or which the capability names for the step. Null: none is stated for it. */
  window: Window | null;
}

/**
 * What one read of the authority port obtained for one act: phase two of the
 * port, which decides in the commit.
 *
 * `held` is given the folded state at the commit's head and the commit's one
 * reading. It answers each grant that the act may be judged on, with whether
 * it is current at that reading. The judge then looks for one that is to
 * the signing key, names the action and covers the scope (section 4.2,
 * check 9). Null: what was read cannot serve this commit, as when its window
 * has passed or it must be read again: `authority-unavailable`.
 *
 * It is a function of those two and of what was read. It is
 * synchronous, so it cannot wait on a read. The judge of a replay does not
 * call it: it derives the same decision from the grant that the entry
 * records (section 9.3).
 *
 * A `Standing` is working memory of one input's turn (section 5.2, step 2).
 * The core holds it in the call that read it and nowhere else. It is never
 * stored, so none outlives the process (authority note, section 3.3), and no
 * other input is judged on it.
 *
 * `sealed`: the commit tells the port, inside its transaction, the entry
 * that it wrote on an answer of `held`. A port that keeps a read for a later
 * commit learns here which entry used it last (authority note, section 3.3,
 * guard 3). A commit that wrote nothing tells nothing: it is not a use.
 * `held` changes nothing but what the port holds for reuse, and only to
 * discard from it: an observation that failed a guard is read again.
 */
export interface Standing {
  held(view: StateView, clock: Reading): readonly Presented[] | null;
  sealed?(sealed: { entry: Entry; hash: Digest }): void;
}

/**
 * Held authority, in two phases (section 5.1, the rows "Held authority" and
 * "Retained judgment input"; section 16.1; authority note, section 3.3).
 *
 * `read` is phase one. It runs before the turn, off the scope's queue, for
 * one act. It obtains what the judgment needs, and notes its own clock when
 * it begins. The core stops waiting after `seconds`. Null, a late answer or
 * a failure: nothing was read, and the act is not judged at check 9.
 *
 * Phase two is the method of what phase one returns. So no commit decides
 * on authority without a read that was made for its own input.
 */
export interface Authority { read(asked: Asked, seconds: number): Promise<Standing | null> }

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
 * A definition, by what a seed names (section 6.1).
 *
 * `read`: a declaration. It is immutable bytes named by their digest, so it
 * is read before the turn (section 5.1), and the reader checks the digest
 * itself. `holder` is the scope that retains the bytes (section 9.2): for a
 * child, the creator its seed names. Null: nobody is named, as for a
 * founding. `absent`: the holder answered, and it retains no bytes under
 * that digest. `unavailable`: the bytes cannot be read now, and may be
 * later.
 *
 * `platform`: a platform definition, which is code that the runtime
 * supplies. It is pinned by its name and version, no scope retains it and
 * nothing is read, so it is synchronous. It comes with the rows of each
 * entry that are code, and the rules written for them. Null: this runtime
 * does not implement that version: `unsupported-definition`. The core
 * answers the same when a row that is code has no rule.
 */
export type DefinitionRead = { ok: true; bytes: string } | { ok: false; reason: "unsupported-definition" | "unavailable" | "absent" };
export interface Definitions {
  read(named: Digest, holder: ScopeRef | null): Promise<DefinitionRead>;
  platform(named: PlatformDefinition): Platform | null;
}

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
/** `operations` is the read of a scope's outside operations, which the contract does not list (I3 deltas, entry EB9). */
export type ReadName = "summary" | "items" | "history" | "entry" | "outbox" | "operations" | "log" | "retained";

/** Who may read. `reader` is whatever the caller presented; sessions are the authority note's. */
export interface Readers { allows(reader: unknown, read: ReadName): boolean }

export interface Ports {
  clock: Clock; random: Random; authority: Authority; resolver: Resolver; rules: Rules; alarm: Alarm; definitions: Definitions; texts: SentTexts; readers: Readers;
  /** Null: this scope has no transport. Its sends stay in the outbox and nothing dispatches them. */
  transport: Transport | null;
  /**
   * The rules of the capability forms this runtime has code for (section
   * 6.11), which derive a `capability` guard and effect. Each rule is a pure
   * function of its arguments, the folded state, which holds the
   * capability's records, and the input being judged: derive's
   * `Capabilities`. A value may also hold the rules of a capability's steps
   * (derive's `Steps`), what a hold's entries derive for its workspace, and
   * the binding of a reserved request. Null: it has none. A scope is not
   * founded or created under a definition that uses a form with no rule
   * here: `unsupported-definition`.
   */
  capabilities: Capabilities | null;
  /** The port for effects outside the service: one request of one attempt of an operation (`operations.ts`; section 4.3). */
  outside: Outside;
  /**
   * The rules of the owners of outside operations that this runtime has
   * code for (section 4.3; derive's `Owners`): a capability version or a
   * platform definition, by the kind of operation. Null: it has none. Then
   * no outcome is judged, and no attempt is sent.
   */
  owners: Owners | null;
}

/**
 * What the production authority reads: no grant. The membership scope
 * cannot be read yet, so no grant is current, and every act that needs one
 * is refused `unauthorized`.
 */
const NO_GRANT: Standing = { held: () => [] };

/**
 * The production defaults. The clock and the random source are the
 * runtime's. The rules are derive's evaluator. The alarm does nothing until
 * the object supplies its own. There is no transport until a namespace
 * supplies one, and no declaration and no sent text can be read until a
 * namespace supplies the scope that retains it. The platform definitions
 * are the platform package's. No code for a capability form is wired here.
 * Derive has the rules of `hold@1` over its records and the guard
 * `ancestry` of `git-read@1` (`holdCapability` and `gitRead`), and this
 * port does not hold them until plan step 16: the I3 deltas note, entries
 * EH6 to EH12, lists what an owner must decide first. Nothing is sent
 * outside the service, and no owner of an
 * outside operation has rules: a host port and the owners' rules replace
 * them (plan steps 19 and 16). Every other port refuses.
 */
export function production(): Ports {
  return {
    clock: { read: () => timeOf(Date.now()) },
    random: { bytes: (length) => crypto.getRandomValues(new Uint8Array(length)) },
    authority: { read: () => Promise.resolve(NO_GRANT) },
    resolver: { read: () => Promise.resolve(null) },
    rules: { evaluate: evaluateRules },
    alarm: { set: () => undefined },
    // A platform definition is supplied in code (section 6.1). A declared one is read from the scope that retains it, through the
    // namespace; with no namespace none can be read.
    definitions: { read: () => Promise.resolve({ ok: false, reason: "unavailable" }), platform },
    texts: { read: () => Promise.resolve({ ok: false, reason: "unavailable" }) },
    readers: { allows: () => false },
    transport: null,
    capabilities: null,
    outside: NO_OUTSIDE,
    owners: null,
  };
}
