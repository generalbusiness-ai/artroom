/**
 * The verifier (scope contract, sections 9.3 to 9.5). It reads a scope's
 * history through a `HistorySource` and reports whether the history is
 * consistent, in one of two modes.
 *
 * **Integrity** checks the chain (`seq`, `prev`, the order of times), each
 * entry's canonical bytes and hash, that the scope ID is the digest of the
 * genesis's seed, and the actors' signatures. No judgment is derived again.
 *
 * **Replay** also folds the history from its genesis. For each entry it
 * derives the judgment again, with the judge of `@generalbusiness/artroom-derive`
 * for that input, from the folded state, the entry's recorded input, its
 * retained inputs and its recorded time; compares what it derives with what
 * the entry records; and proves each foreign fact the entry used, by replay
 * of the source scope up to that entry or by an anchor the caller supplies.
 *
 * A detached text is checked against the digest that names it. A text whose
 * bytes are gone is reported as redacted when a later entry of the same
 * scope is its tombstone, and is not derived again. With no tombstone the
 * replay is `incomplete` (section 9.3).
 *
 * It runs none of the runtime's code. The judges and the fold are the pure
 * functions the runtime also calls; the turn, the store and transport are
 * not here.
 *
 * A caller says what it expects: the target scope's ID, and a known head or
 * receipt if it has one. A history that does not reach that head, or has
 * another entry there, is a mismatch. With no known head the report says,
 * under `trusts`, that the head is the service's answer.
 */

import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { Bounds, Digest, Entry, FactRef, Head, PlatformDefinition, Report, RetainedInput, ScopeId, ScopeRef } from "@generalbusiness/artroom-contract";
import { canonicalize, definitionDigest, digestBytes, isDigest, isEntry, parseStrict, scopeIdOf, textDigest, utf8, verifySignedIntent } from "@generalbusiness/artroom-bytes";
import {
  MemoryState, applyEntry, clockOf, entryOf, inputTexts, isFactRef, isLocalId, isObject, isScopeRef, judgeAct, judgeCheckpoint, judgeDelivery, judgeDiagnosis, judgeGenesis, judgeTimed,
  nextDue, timeMs, updateOf, validateDefinition,
} from "@generalbusiness/artroom-derive";
import type { ActJudgment, Capabilities, Clock, Fetched, Judgment, TimedJudgment, ValidDefinition } from "@generalbusiness/artroom-derive";
import { RULE_PROFILES, evaluateRules } from "@generalbusiness/artroom-derive/rule";
import { PAGE_ENTRIES, PAGE_REPLY_BYTES, RETAINED_REPLY_BYTES, hashOfBytes, type HistorySource, type Stored } from "./source.ts";

/**
 * The bounds of one traversal (section 9.4). A limit reached is `incomplete`,
 * with what was covered. Each is counted as the source's replies arrive,
 * before anything in them is kept.
 */
export interface Limits {
  scopes: number;    // scopes whose history is read
  entries: number;   // entries checked, over all scopes
  bytes: number;     // raw bytes read from the source: every reply of a page or of a retained input, as it arrived
  depth: number;     // how far a chain of foreign facts is followed from the target, also while the texts that are owed are settled
}
/** Defaults for a command-line run. They are this package's choice; the contract owes the numbers to the proof plan. */
export const LIMITS: Limits = { scopes: 64, entries: 100_000, bytes: 256 * 1024 * 1024, depth: 16 };

/** A fact the caller says it trusts: one entry of a source scope, by position and hash (section 9.4). */
export interface Anchor { scope: ScopeId; seq: number; hash: Digest }

export interface Options {
  mode: Report["mode"];
  /** The target: the scope whose history is checked. */
  scope: ScopeId;
  /** A head or receipt the caller holds from elsewhere. The history must reach it and have that entry there. */
  head?: Head | undefined;
  /** Facts taken on trust. An anchor covers exactly the entry it names. */
  anchors?: readonly Anchor[] | undefined;
  limits?: Partial<Limits> | undefined;
  /** The bounds the scopes run under. A replay scans every range guard to its end, whatever `guardScan` says (section 9.3). */
  bounds?: Bounds | undefined;
  /**
   * The rules of the capability versions this replay has code for (section
   * 9.3). With none, a scope whose definition needs a capability record is
   * `unsupported-definition`. The package itself has none.
   */
  capabilities?: Capabilities | undefined;
}

/** A report, and in words why its result is not `consistent`. */
export interface Verification { report: Report; why: string | null }

/** The target's history could not be read at all, so there is nothing to report on. */
export class SourceError extends Error {
  override readonly name = "SourceError";
}

/** What the report lists under `trusts`, in the order it lists them. */
export const TRUSTS = {
  judgments: "every judgment as recorded: in this mode no guard, effect, send or rule was derived again",
  facts: "every foreign fact as recorded: in this mode no source history and no retained input was read",
  clock: "the service clock: each entry's time is taken as recorded",
  head: "the service's answer for the head of the target's history: no known head or receipt was given to check it against",
  sources: "the service's answer for each source history that was replayed: no anchor was given for it",
  minted: "that each incarnation was minted once",
  held: "that a provisional scope dispatched no held send before its confirmation",
  delivered: "delivery times: when each message was delivered",
  authority: "authority: that each recorded grant was current, and the fact that issued it",
  attempts: "each diagnosis's attempt log, which is the sender's own record",
  outcomes: "each outcome's evidence, and that the outside write happened",
  anchors: "each anchor as the caller supplied it, and the definition name retained with each anchored entry",
  bounds: "the bounds: each scope is taken to run under the bounds this replay was given",
  redacted: "each redacted text: its bytes are gone, so nothing shows that they were the text its digest names, or that they were within the bound of their field",
} as const;
type Trust = keyof typeof TRUSTS;

/** Ends the traversal with a result that is not `consistent`. */
class Stop extends Error {
  readonly result: Exclude<Report["result"], "consistent">;
  readonly why: string;
  readonly at: FactRef | null;
  readonly missing: FactRef | null;
  constructor(result: Exclude<Report["result"], "consistent">, why: string, at: FactRef | null = null, missing: FactRef | null = null) {
    super(why);
    this.result = result;
    this.why = why;
    this.at = at;
    this.missing = missing;
  }
}

/** A scope's history ends, or cannot be read, before the entry that is needed. */
class Gap extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(reason);
    this.reason = reason;
  }
}

/** One scope, as far as it has been checked. */
interface Run {
  id: ScopeId;
  /** What the source says the scope is, and its head when the first page was read. */
  said: ScopeRef;
  head: Head;
  /** From the genesis, once that is checked. */
  at: ScopeRef | null;
  named: Digest | PlatformDefinition | null;
  definition: ValidDefinition | null;
  state: MemoryState;
  /** The checked entries, by `seq`. */
  sealed: { entry: Entry; hash: Digest }[];
  /** Entries read and not yet checked, by `seq`, and where the next page begins. */
  read: Map<number, Stored>;
  next: number | null;
  /** Being advanced now. A reference that needs a later entry of it is a circle (section 3). */
  busy: boolean;
  /** How many foreign facts lead to this scope from the target, by the shortest chain that was followed. The target is at 0. */
  depth: number;
  /** Section 9.3: each detached text whose bytes are not at hand, with the entry that names it. A later tombstone of this scope answers for it. */
  owed: { text: Digest; at: FactRef }[];
}

const sameScope = (a: ScopeRef, b: ScopeRef): boolean => a.scope === b.scope && a.inc === b.inc && a.kind === b.kind;
const named = (ref: ScopeRef): string => `${ref.scope} (incarnation ${ref.inc})`;

class Verifier {
  readonly #source: HistorySource;
  readonly #mode: Report["mode"];
  readonly #target: ScopeId;
  readonly #expected: Head | null;
  readonly #anchors: readonly Anchor[];
  readonly #limits: Limits;
  readonly #bounds: Bounds;
  readonly #capabilities: Capabilities | undefined;
  readonly #runs = new Map<ScopeId, Run>();
  readonly #trusts = new Set<Trust>();
  /** The foreign facts proven, by scope, position and hash: by replay of their source, or by an anchor. */
  readonly #proven = new Map<string, "replayed" | "anchored">();
  readonly #anchored: FactRef[] = [];
  /** Each tombstone that answered for a text whose bytes are gone, with the slot that held the text. */
  readonly #redacted: Report["redacted"][number][] = [];
  #entries = 0;
  #bytes = 0;

  constructor(source: HistorySource, options: Options) {
    this.#source = source;
    this.#mode = options.mode;
    this.#target = options.scope;
    this.#expected = options.head ?? null;
    this.#anchors = options.anchors ?? [];
    this.#limits = { ...LIMITS, ...options.limits };
    // Section 9.3: each range guard is derived over every item it covers, so the scan never stops unfinished.
    this.#bounds = { ...(options.bounds ?? PROPOSED_BOUNDS), guardScan: Number.MAX_SAFE_INTEGER };
    this.#capabilities = options.capabilities;
  }

  async run(): Promise<Verification> {
    // A limit that stops the first read of the target leaves nothing to report on: it is a read error, like a target that cannot be read.
    const target = await this.#open(this.#target).catch((error: unknown) => {
      throw error instanceof Stop ? new SourceError(`the history of ${this.#target} was not read: ${error.why}`) : error;
    });
    if (!target) throw new SourceError(`the history of ${this.#target} cannot be read`);
    this.#trusts.add("clock");
    if (this.#mode === "integrity") { this.#trusts.add("judgments"); this.#trusts.add("facts"); } else this.#trusts.add("bounds");
    if (!this.#expected) this.#trusts.add("head");

    let stop: Stop | null = null;
    try {
      const expected = this.#expected;
      // A known head that the history does not reach: nothing after the service's head can match it.
      if (expected && expected.seq > target.head.seq) {
        throw new Stop("mismatch", `the history ends at entry ${target.head.seq} and does not reach the expected head, entry ${expected.seq}`, { at: target.said, seq: target.head.seq, hash: target.head.hash });
      }
      try {
        await this.#advance(target, target.head.seq, 0);
      } catch (error) {
        if (!(error instanceof Gap)) throw error;
        throw new Stop("incomplete", `the history could not be read through its head, entry ${target.head.seq}: ${error.reason}`);
      }
      const last = target.sealed[target.head.seq]!;
      if (last.hash !== target.head.hash) throw new Stop("mismatch", "the head the source states is not the hash of its last entry", { at: target.at!, seq: last.entry.seq, hash: last.hash });
      await this.#settle();
    } catch (error) {
      if (!(error instanceof Stop)) throw error;
      stop = error;
    }
    return this.#report(target, stop);
  }

  #report(target: Run, stop: Stop | null): Verification {
    const through = target.sealed.at(-1);
    const at = target.at ?? target.said;
    const covered = [target, ...[...this.#runs.values()].filter((run) => run !== target)].filter((run) => run.sealed.length > 0);
    const proven = [...this.#proven.values()];
    const report: Report = {
      mode: this.#mode,
      // Consistent: the head checked through. Otherwise: the head the check was aiming for.
      target: stop || !through ? { at, seq: target.head.seq, hash: target.head.hash } : { at, seq: through.entry.seq, hash: through.hash },
      coverage: covered.map((run) => ({ scope: run.at!, from: 0, through: run.sealed.length - 1 })),
      anchors: this.#anchored,
      dependencies: { verified: proven.filter((how) => how === "replayed").length, anchored: proven.filter((how) => how === "anchored").length, missing: stop?.missing ? [stop.missing] : [] },
      trusts: (Object.keys(TRUSTS) as Trust[]).filter((trust) => this.#trusts.has(trust)).map((trust) => TRUSTS[trust]),
      redacted: this.#redacted,
      result: stop ? stop.result : "consistent",
      ...(stop?.at ? { at: stop.at } : {}),
    };
    return { report, why: stop ? stop.why : null };
  }

  // ---------------------------------------------------------------- reading

  /** Start on a scope: its first page. Null: the source holds no such history, or it cannot be read. */
  async #open(id: ScopeId): Promise<Run | null> {
    if (this.#runs.size >= this.#limits.scopes) throw new Stop("incomplete", `the limit of ${this.#limits.scopes} scopes was reached`);
    const got = await this.#page(id, 0);
    if (!got.ok) return null;
    const run: Run = { id, said: got.page.scope, head: got.page.head, at: null, named: null, definition: null, state: new MemoryState(), sealed: [], read: new Map(), next: 0, busy: false, depth: Number.POSITIVE_INFINITY, owed: [] };
    if (!this.#take(run, 0, got.page.entries, got.page.next)) return null;
    this.#runs.set(id, run);
    return run;
  }

  /**
   * One page, read within what is left of the byte limit. The bytes are
   * counted as read whether or not the page is then used. A reply past the
   * limit is not taken in, and ends the traversal `incomplete`; one past the
   * bound on a single page is a page that cannot be read. A read that ran
   * past its deadline is a read error.
   */
  async #page(id: ScopeId, from: number) {
    const left = this.#limits.bytes - this.#bytes;
    const got = await this.#source.page(id, from, { bytes: Math.min(left, PAGE_REPLY_BYTES), entries: PAGE_ENTRIES });
    if (got.ok) this.#count(got.bytes);
    else this.#unread(got.reason, left < PAGE_REPLY_BYTES, `a page of ${id} from entry ${from}`);
    return got;
  }

  /** What every failed read meets first: a deadline is a read error, and a reply past what was left of the byte limit is the limit reached. */
  #unread(reason: string, limited: boolean, what: string): void {
    if (reason === "timeout") throw new SourceError(`${what} was not read within the deadline`);
    if (reason === "too-large" && limited) throw new Stop("incomplete", `the limit of ${this.#limits.bytes} bytes was reached`);
  }

  /** Keep a page's entries until they are checked. A page is the entries from `from` on, in order and no others; any other page is not kept. */
  #take(run: Run, from: number, entries: readonly Stored[], next: number | null): boolean {
    if (entries.length > PAGE_ENTRIES || entries.some((stored, i) => stored.seq !== from + i)) return false;
    for (const stored of entries) run.read.set(stored.seq, stored);
    run.next = next;
    return true;
  }

  /** The stored entry at `seq`, read by pages as needed. */
  async #stored(run: Run, seq: number): Promise<Stored> {
    while (!run.read.has(seq)) {
      if (run.next === null || run.next > seq) throw new Gap(`the source holds no entry ${seq} of ${run.id}`);
      const from = run.next;
      const got = await this.#page(run.id, from);
      if (!got.ok) throw new Gap(`entry ${seq} of ${run.id} could not be read: ${got.reason}`);
      // A page that holds nothing, or does not lead on, would be read for ever.
      if (got.page.entries.length === 0 || (got.page.next !== null && got.page.next <= from)) throw new Gap(`the source holds no entry ${seq} of ${run.id}`);
      if (!this.#take(run, from, got.page.entries, got.page.next)) throw new Gap(`the source's page of ${run.id} from entry ${from} is not those entries in order`);
    }
    const stored = run.read.get(seq)!;
    run.read.delete(seq);
    return stored;
  }

  /** Section 9.2: an input an entry names by digest. One that is missing makes the replay `incomplete`. */
  async #retained(run: Run, at: FactRef, kind: RetainedInput["kind"], digest: Digest, what: string): Promise<RetainedInput> {
    const left = this.#limits.bytes - this.#bytes;
    const got = await this.#source.retained(run.id, kind, digest, { bytes: Math.min(left, RETAINED_REPLY_BYTES) });
    if (!got.ok) {
      this.#unread(got.reason, left < RETAINED_REPLY_BYTES, `a retained input of ${run.id}`);
      throw new Stop("incomplete", `a retained input is missing: ${what}, ${digest} (${got.reason})`, at);
    }
    this.#count(got.bytes);
    return got.input;
  }

  /**
   * Section 9.3: a detached text that an entry names, checked against its
   * digest. Returns the number of UTF-8 bytes of the text. Null: the scope
   * holds no bytes under that digest, or holds bytes that are not that
   * text. Such a text is owed until a tombstone answers for it.
   */
  async #text(run: Run, digest: Digest): Promise<number | null> {
    const left = this.#limits.bytes - this.#bytes;
    const got = await this.#source.retained(run.id, "text", digest, { bytes: Math.min(left, RETAINED_REPLY_BYTES) });
    if (!got.ok) {
      this.#unread(got.reason, left < RETAINED_REPLY_BYTES, `a retained input of ${run.id}`);
      return null;
    }
    this.#count(got.bytes);
    try {
      const text: unknown = parseStrict(got.input.bytes);
      return typeof text === "string" && textDigest(text) === digest ? utf8(text).length : null;
    } catch {
      return null;
    }
  }

  /**
   * Section 9.3: a text whose bytes are gone is redacted when a tombstone of
   * its scope lists it, and is otherwise a missing retained input. A source
   * scope is checked only as far as a reference needs, and its tombstone may
   * come later, so its history is read on to its head before the answer.
   *
   * Reading a scope on may prove a fact of a scope that was not read before,
   * or read an earlier scope further, and either may owe a text. So this
   * goes on until no scope that was read owes one. It ends: a round that
   * does not stop the traversal has checked at least one more entry, the
   * tombstone that left its scope owing nothing, and the entries checked
   * are within the limit on entries, as the scopes are within theirs.
   *
   * The limit on depth counts from the target here too. A scope is read on
   * at the depth at which the traversal reached it, so a fact that its
   * later entries use is one step further from the target, and a chain
   * that would pass the limit ends the replay `incomplete`.
   */
  async #settle(): Promise<void> {
    const owing = () => [...this.#runs.values()].find((run) => run.owed.length > 0);
    for (let run = owing(); run; run = owing()) {
      try {
        await this.#advance(run, run.head.seq, run.depth);
      } catch (error) {
        if (!(error instanceof Gap)) throw error;
      }
      const owed = run.owed[0];
      if (owed) throw new Stop("incomplete", `a retained input is missing: the detached text ${owed.text}, which no later entry of ${run.id} redacts`, owed.at);
    }
  }

  #count(bytes: number): void {
    this.#bytes += bytes;
    if (this.#bytes > this.#limits.bytes) throw new Stop("incomplete", `the limit of ${this.#limits.bytes} bytes was reached`);
  }

  // ---------------------------------------------------------------- one scope, in order

  /**
   * Check the scope's entries, in order, through `through`. Each scope is
   * checked once, as far as the highest `seq` any reference needs (section
   * 9.4). `expect`: the hash a reference gives for the entry at `through`,
   * checked against that entry's bytes before its content is read.
   */
  async #advance(run: Run, through: number, depth: number, expect?: { hash: Digest; user: FactRef }): Promise<void> {
    run.depth = Math.min(run.depth, depth);
    if (through < run.sealed.length) return;
    // A fact names a sealed entry, so no entry can need one that is sealed after it (section 3).
    if (run.busy) throw new Stop("mismatch", `a reference names entry ${through} of ${run.id}, which is not sealed before the entry that uses it`, expect?.user ?? null);
    run.busy = true;
    try {
      while (run.sealed.length <= through) await this.#step(run, depth, run.sealed.length === through ? expect : undefined);
    } finally {
      run.busy = false;
    }
  }

  async #step(run: Run, depth: number, expect?: { hash: Digest; user: FactRef }): Promise<void> {
    const seq = run.sealed.length;
    if (this.#entries >= this.#limits.entries) throw new Stop("incomplete", `the limit of ${this.#limits.entries} entries was reached`);
    const stored = await this.#stored(run, seq);
    this.#entries++;

    // The bytes and the hash, before anything in them is read (section 9.4).
    const hash = hashOfBytes(stored.bytes);
    const where: FactRef = { at: run.at ?? run.said, seq, hash: stored.hash };
    const mismatch = (why: string): Stop => new Stop("mismatch", why, where);
    if (hash !== stored.hash) throw mismatch("the entry's bytes do not hash to the hash the source gives for it");
    if (expect && hash !== expect.hash) throw new Stop("mismatch", `the reference names another entry than the source scope has at that position: entry ${seq} of ${run.id} has the hash ${hash}`, expect.user);
    let value: unknown;
    try {
      value = parseStrict(stored.bytes);
    } catch {
      throw mismatch("the entry's bytes are not canonical JSON");
    }
    if (canonicalize(value) !== stored.bytes) throw mismatch("the entry's bytes are not canonical JSON");
    if (!isEntry(value)) throw mismatch("the bytes are not an entry");
    // Section 7.5: the runtime seals no entry over the entry size bound. A history that holds one is not a history a scope wrote
    // under these bounds, whatever its derivation gives. This is not the traversal's byte limit, which ends `incomplete`.
    const size = utf8(stored.bytes).length;
    if (this.#mode === "replay" && size > this.#bounds.entryBytes) throw mismatch(`the entry has ${size} bytes, and a scope under these bounds seals none over ${this.#bounds.entryBytes}`);
    const entry = value;
    const input = entry.input;

    // The chain.
    const before = run.sealed.at(-1);
    if (!before) {
      if (input.type !== "genesis" || entry.seq !== 0 || entry.prev !== null) throw mismatch("a history begins with its genesis");
      let id: ScopeId | null = null;
      try {
        id = scopeIdOf(input.seed);
      } catch { /* not a seed */ }
      if (id !== run.id) throw mismatch("the scope ID is not the digest of the genesis's seed");
      const at: ScopeRef = { scope: run.id, inc: input.inc, kind: input.seed.kind };
      if (!sameScope(entry.at, at)) throw mismatch("the genesis is not at the scope, incarnation and kind its input names");
      run.at = at;
      run.named = input.seed.definition;
      where.at = at;
    } else {
      if (input.type === "genesis") throw mismatch("a history has one genesis");
      if (entry.seq !== seq || entry.prev !== before.hash) throw mismatch(`the entry does not follow entry ${seq - 1}: its prev is not that entry's hash`);
      if (!sameScope(entry.at, run.at!)) throw mismatch("the entry names another scope or incarnation than its history");
      const [time, last] = [timeMs(entry.time)!, timeMs(before.entry.time)!];
      if (time < last) throw mismatch("the entry's time is earlier than the time of the entry before it");
      if (entry.clamped && time !== last) throw mismatch("a clamped entry has the time of the entry before it");
    }
    if (!before && entry.clamped) throw mismatch("a genesis is not clamped");
    // A known head: the history must have that entry there (section 9.5, equivocation).
    if (run.id === this.#target && this.#expected?.seq === seq && this.#expected.hash !== hash) throw mismatch(`the history forks from the expected head: entry ${seq} has another hash than ${this.#expected.hash}`);

    // The actors' signatures.
    if (input.type === "act" && !verifySignedIntent(input.signed)) throw mismatch("the act's signature is not its actor's over its intent");
    if (input.type === "genesis" && input.founding !== null && !verifySignedIntent(input.founding)) throw mismatch("the founding signature is not its actor's over its intent");

    if (this.#mode === "replay") {
      try {
        await this.#replay(run, entry, hash, stored.bytes, where, depth);
      } catch (error) {
        if (error instanceof Stop || error instanceof Gap || error instanceof SourceError) throw error;
        // A judge or the fold could not take the entry at all.
        throw mismatch(`the entry cannot be derived again: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    run.sealed.push({ entry, hash });
  }

  // ---------------------------------------------------------------- replay of one entry

  /** The pinned definition, from the retained declaration the genesis's seed names (sections 6.1 and 9.2). */
  async #pin(run: Run, where: FactRef): Promise<ValidDefinition> {
    const digest = run.named;
    if (!isDigest(digest)) throw new Stop("unsupported-definition", `the scope pins ${String(digest)}, which this replay has no code for`, where);
    const kept = await this.#retained(run, where, "definition", digest, "the definition's declaration");
    let declared: unknown;
    try {
      declared = parseStrict(kept.bytes);
      if (definitionDigest(declared as never) !== digest) declared = undefined;
    } catch {
      declared = undefined;
    }
    // Bytes that do not parse, or do not hash to the value named, are rejected before anything in them is read (section 9.4).
    if (declared === undefined) throw new Stop("incomplete", `a retained input is not the one named: the definition's declaration, ${digest}`, where);
    const checked = validateDefinition(declared, this.#bounds, RULE_PROFILES);
    // Section 9.3: a capability version that the verifier does not implement gives `unsupported-definition`.
    const needs = checked.ok ? checked.definition.underived.find((u) => !this.#capabilities?.implements(u)) : undefined;
    if (needs) throw new Stop("unsupported-definition", `the pinned definition needs ${needs.capability}, which this replay has no code for: ${needs.form} ${needs.name} at ${needs.path}`, where);
    if (checked.ok) return checked.definition;
    // Section 9.3: a history whose genesis opens a timed item is invalid.
    if (checked.problems.some((p) => p.code === "genesis-timed")) throw new Stop("mismatch", "genesis-timed: the pinned definition's genesis act opens a timed item", where);
    throw new Stop("unsupported-definition", `the pinned definition does not pass validation under the bounds given: ${checked.problems[0]?.code ?? "unknown"} at ${checked.problems[0]?.path ?? ""}`, where);
  }

  /**
   * Prove one foreign fact (section 9.4): by an anchor that names exactly
   * that entry, or by replay of the source scope up to it. `user` is the
   * entry that used the fact.
   */
  async #prove(fact: FactRef, user: FactRef, depth: number): Promise<"replayed" | "anchored"> {
    const key = `${fact.at.scope}:${fact.seq}:${fact.hash}`;
    const known = this.#proven.get(key);
    const run = this.#runs.get(fact.at.scope);
    if (known && (known === "anchored" || (run?.at && sameScope(run.at, fact.at)))) return known;

    if (this.#anchors.some((a) => a.scope === fact.at.scope && a.seq === fact.seq && a.hash === fact.hash)) {
      this.#proven.set(key, "anchored");
      this.#anchored.push(fact);
      this.#trusts.add("anchors");
      return "anchored";
    }
    if (depth >= this.#limits.depth) throw new Stop("incomplete", `the limit of ${this.#limits.depth} on the depth of foreign facts was reached`, user);
    const source = run ?? await this.#open(fact.at.scope);
    if (!source) throw new Stop("missing-dependency", `the history of the source scope ${fact.at.scope} cannot be read, and no anchor names its entry ${fact.seq}`, user, fact);
    try {
      await this.#advance(source, fact.seq, depth + 1, { hash: fact.hash, user });
    } catch (error) {
      if (!(error instanceof Gap)) throw error;
      throw new Stop("missing-dependency", `${error.reason}, and no anchor names it`, user, fact);
    }
    if (!sameScope(source.at!, fact.at)) throw new Stop("mismatch", `the reference names ${named(fact.at)}, ${fact.at.kind}; the source scope's genesis is ${named(source.at!)}, ${source.at!.kind}: a wrong incarnation or kind`, user);
    if (source.sealed[fact.seq]!.hash !== fact.hash) throw new Stop("mismatch", `the reference names another entry than the source scope has at that position: entry ${fact.seq} of ${fact.at.scope}`, user);
    this.#proven.set(key, "replayed");
    this.#trusts.add("sources");
    return "replayed";
  }

  async #replay(run: Run, entry: Entry, hash: Digest, bytes: string, where: FactRef, depth: number): Promise<void> {
    const mismatch = (why: string): Stop => new Stop("mismatch", why, where);
    const input = entry.input;
    const state = run.state;
    const definition = run.definition ?? (run.definition = await this.#pin(run, where));
    const bounds = this.#bounds;
    // Sections 4.1 and 9.4: a genesis states the genesis act of the definition that it pins. Integrity mode reads no definition, and does not check this.
    if (input.type === "genesis" && input.kind !== definition.declared.genesis) throw mismatch(`genesis-kind: the genesis records the kind ${input.kind}, and the genesis act of the pinned definition is ${definition.declared.genesis}`);

    // The retained copy of each foreign entry this entry used, by its content digest (section 9.2).
    const facts: Fetched[] = [];
    for (const use of entry.uses) {
      const kept = await this.#retained(run, where, "entry", use.content, `the foreign entry ${use.fact.seq} of ${use.fact.at.scope}`);
      let copy: unknown;
      try {
        copy = digestBytes(utf8(kept.bytes)) === use.content ? parseStrict(kept.bytes) : undefined;
      } catch {
        copy = undefined;
      }
      if (copy === undefined) throw new Stop("incomplete", `a retained input is not the one named: the foreign entry ${use.fact.seq} of ${use.fact.at.scope}`, where);
      if (!isEntry(copy)) throw mismatch("a used foreign entry is not an entry");
      facts.push({ fact: use.fact, entry: copy, under: kept.under ?? "" });
    }

    // Section 9.4: a retained copy lets this judgment be derived again. It does not show that the source admitted the entry.
    const foreign = [...entry.uses.map((use) => use.fact), ...(input.type === "delivery" ? [input.from] : []), ...(input.type === "genesis" && input.source ? [input.source] : [])];
    for (const fact of foreign) {
      if (!isFactRef(fact)) throw mismatch("a reference is not a fact reference");
      const how = await this.#prove(fact, where, depth);
      // The name of the definition the source pins, which a `fact` field and a handler may read, is the source's own genesis's to say:
      // the name that the declaration its seed names states (section 6.1). A source that was replayed has that declaration pinned.
      const pinned = this.#runs.get(fact.at.scope)?.definition?.declared.name;
      for (const copy of facts) if (copy.fact.hash === fact.hash && how === "replayed" && copy.under !== pinned) throw mismatch(`the retained copy of entry ${fact.seq} of ${fact.at.scope} names another definition than that scope pins`);
    }

    // Section 9.3, for every entry: before one that is not timed, no deadline at or before its time is unapplied.
    if (input.type !== "timed" && state.scope() && nextDue(state, definition, entry.time)) throw mismatch("a transition was due at or before this entry's time and was not applied first");
    // Section 9.3, for every entry: no two `relate` sends for one key.
    const keys = new Set<string>();
    for (const send of entry.sends) {
      const update = send.message.class === "request" && send.message.type === "relate" && isScopeRef(send.to) ? updateOf(send.message, { at: entry.at, seq: entry.seq, hash }) : null;
      if (!update || !isScopeRef(send.to)) continue;
      const key = canonicalize([send.to.scope, update.item.seq, update.name]);
      if (keys.has(key)) throw mismatch("the entry has two relate sends for one key");
      keys.add(key);
    }

    // Each rule result the entry records, from the rule's retained input (sections 6.5 and 9.3).
    for (const p of entry.prepared) {
      const source = typeof p.rule === "string" && Object.hasOwn(definition.declared.rules, p.rule) ? definition.declared.rules[p.rule]! : null;
      if (source === null || !isDigest(p.input)) throw mismatch("the entry records the result of a rule its definition does not declare");
      const kept = await this.#retained(run, where, "rule", p.input, `the input of rule ${p.rule}`);
      let read: unknown;
      try {
        read = digestBytes(utf8(kept.bytes)) === p.input ? parseStrict(kept.bytes) : undefined;
      } catch {
        read = undefined;
      }
      if (read === undefined) throw new Stop("incomplete", `a retained input is not the one named: the input of rule ${p.rule}`, where);
      const [again] = await evaluateRules([{ rule: p.rule, source, input: read, digest: p.input }]);
      if (again?.result !== p.result) throw mismatch(`rule ${p.rule}, evaluated again over its retained input, does not give the recorded result`);
    }

    // The judgment, derived again on the entry's recorded time. A clamped entry was judged on a reading behind its history
    // (section 5.3): the reading is not recorded, and an entry that judges time is never written clamped.
    const clock: Clock = entry.clamped ? { reading: entry.time, behind: true, asOf: entry.time } : clockOf(state, entry.time);
    // Section 9.3: each detached text that the input names, against its digest. One whose bytes are gone is not asked for again
    // by the judge: it is owed, and a tombstone must answer for it.
    const texts = new Map<Digest, number | null>();
    // A message that no handler received names none: a handler whose `from` names another definition than the sender pins did not.
    for (const text of inputTexts(definition, input, input.type === "delivery" ? facts.find((f) => f.fact.hash === input.from.hash)?.under : undefined)) {
      const size = await this.#text(run, text);
      texts.set(text, size);
      if (size === null) run.owed.push({ text, at: where });
    }
    // Section 6.2: a local fact, and a part of one, are read from this scope's own history: the entries checked so far.
    const reading = { clock, bounds, facts, prepared: entry.prepared, own: (at: number) => run.sealed[at] ?? null, texts: (digest: Digest) => texts.get(digest) ?? null, capabilities: this.#capabilities };
    const copyOf = (fact: FactRef | null) => facts.find((f) => f.fact.hash === fact?.hash) ?? null;
    const own = (seq: unknown): Entry | null => (isLocalId(seq) ? (run.sealed[seq]?.entry ?? null) : null);
    let judged: ActJudgment | Judgment | TimedJudgment;
    switch (input.type) {
      case "genesis": {
        this.#trusts.add("minted");
        if (input.founding) judged = judgeGenesis(state, definition, { name: run.id, inc: input.inc, seed: input.seed, founding: input.founding }, { ...reading, source: null });
        else {
          if (!input.source || input.n === null || !input.message) throw mismatch("a genesis has a founding intent or a creation request");
          this.#trusts.add("held");
          const source = copyOf(input.source);
          judged = judgeGenesis(state, definition, { name: run.id, inc: input.inc, to: input.seed, from: input.source, n: input.n, message: input.message }, { ...reading, source: source && { entry: source.entry, under: source.under } });
        }
        break;
      }
      case "act":
        // Section 9.3: that a grant was fresh is not checked, beyond its recorded form. The authority port's verdict is trusted.
        this.#trusts.add("authority");
        judged = judgeAct(state, definition, input.signed, { ...reading, presented: input.presented, grants: input.authority.map((grant) => ({ grant, current: true })) });
        break;
      case "delivery": {
        this.#trusts.add("delivered");
        const source = copyOf(input.from);
        // The address is the one the sender wrote: the source entry's send at that ordinal.
        const to = source?.entry.sends.find((send) => send.n === input.n)?.to;
        if (!source || to === undefined) throw mismatch("the source entry holds no send at that ordinal");
        const origin = input.message.class === "result" && isObject(input.message.of) && isObject(input.message.of.from) ? own(input.message.of.from.seq) : null;
        judged = judgeDelivery(state, definition, { to, from: input.from, n: input.n, message: input.message }, { ...reading, source: { entry: source.entry, under: source.under }, origin });
        break;
      }
      case "diagnosis":
        this.#trusts.add("attempts");
        judged = judgeDiagnosis(state, definition, { of: input.of, attempts: input.attempts }, { ...reading, prepared: [], origin: own(input.of.seq) });
        break;
      case "timed":
        judged = judgeTimed(state, definition, { item: input.item, rule: input.rule, due: input.due }, { clock, bounds });
        break;
      case "preparation":
        // Section 9.3 gives the preparation entry its rules, and I3 step 16a has not built them here. A verifier that does not
        // derive a capability form answers `unsupported-definition` (sections 6.1 and 9.3, "A capability guard or effect").
        // The contract does not name this entry for a verifier without preparation rules: recorded as I3 delta E13.
        throw new Stop("unsupported-definition", `entry ${entry.seq} is a preparation, and this replay has no rules for one`, where);
      case "outcome":
        // Section 9.3, point E13, and section 9.4: an outcome entry of an operation whose rules the verifier does not derive is
        // `unsupported-definition` at that entry, and never `consistent`. This verifier is given the rules of no owner, so it
        // derives the outcome of no operation.
        // I3 merge: step 22 gives the verifier the owners' rules, and judges an outcome that has them with `judgeOutcome`.
        throw new Stop("unsupported-definition", `entry ${entry.seq} is an outcome, and this replay has no rules of the owner of its operation`, where);
      case "checkpoint":
        // Checked against the fold through that sequence. It is never taken as proof of the prefix (section 9.2).
        judged = judgeCheckpoint(state, definition, { through: input.through, state: input.state }, { clock, bounds });
        break;
    }
    if (judged.result !== "write") {
      const said = [judged.result, "reason" in judged ? judged.reason : "", "detail" in judged ? judged.detail : "", "failed" in judged ? judged.failed : ""].filter((part) => part !== "").join(", ");
      throw mismatch(`derived again, this input writes no entry: ${said}`);
    }

    // What was derived, against what is recorded.
    const derived = entryOf(state, judged.draft, clock);
    if (canonicalize(derived.input) !== canonicalize(input)) throw mismatch("the recorded input, with its decision, is not the one derived again");
    for (const part of ["uses", "prepared", "effects", "sends"] as const) {
      if (canonicalize(derived[part]) !== canonicalize(entry[part])) throw mismatch(`the recorded ${part} are not the ones derived again`);
    }
    if (canonicalize(derived) !== bytes) throw mismatch("the recorded entry is not the one derived again");
    applyEntry(state, definition, entry, hash);
    // Section 9.3: this entry is the tombstone of each text that its `redact` effects list. The judge derived the list again from
    // what the slot had held. A text that an earlier entry names, and whose bytes are gone, is reported as redacted.
    for (const effect of entry.effects) {
      if (effect.effect !== "redact") continue;
      const answered = run.owed.filter((owed) => effect.texts.includes(owed.text));
      if (answered.length === 0) continue;
      run.owed = run.owed.filter((owed) => !answered.includes(owed));
      this.#redacted.push({ tombstone: where, item: effect.item, slot: effect.slot });
      this.#trusts.add("redacted");
    }
  }
}

/**
 * Check the history of `options.scope`, as `source` serves it. Rejects with
 * `SourceError` when that history cannot be read at all. Every other end is
 * a report.
 */
export function verify(source: HistorySource, options: Options): Promise<Verification> {
  return new Verifier(source, options).run();
}
