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
 * A preparation entry is derived with the rules of its capability step, and
 * an outcome entry with the rules of the owner of its operation, when the
 * caller supplies that code. Without it either entry is
 * `unsupported-definition`. What an outcome's evidence says of the world
 * outside the service is never derived: it is listed under `trusts`. The
 * walk of an ancestry record is not derived either, because the verifier
 * reads no commit: a history that holds such a record is `incomplete`.
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

import { DOMAINS, PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { Bounds, CapabilityName, Digest, Entry, FactRef, Grant, Head, KeyId, Observation, ObservationRequest, ObservationUse, MismatchName, PlatformData, PlatformDefinition, Report, RetainedInput, ScopeId, ScopeRef } from "@generalbusiness/artroom-contract";
import { canonicalize, definitionDigest, digestBytes, intentDigest, isDigest, isEntry, isObservationUse, isPlatformDefinition, parseStrict, platformName, scopeIdOf, textDigest, utf8, verifySignedIntent } from "@generalbusiness/artroom-bytes";
import {
  HOLD, HOLD_KINDS, MISMATCHES, MemoryState, WINDOWS, actionOf, agrees, applyEntry, drawsOf, clockOf, contentStates, entryOf, namedBy, observedName, retainsOf, headsOf, highestHead, inputTexts, isAncestryCheck, isFactRef, isLocalId, isObject, isScopeRef, judgeAct, judgeCheckpoint, judgeDelivery,
  judgeDiagnosis, evidenceValues, outcomeValueDomains, fixedBy, judgeGenesis, judgeGrant, judgeOutcome, judgePreparation, judgeTimed, membershipOf, nextDue, observedOf, own, ownersOf, placesOf, ruleAt, same, snapshotRead, stepsOf, timeMs, updateOf, validateDefinition, valueDigest, windowOf,
} from "@generalbusiness/artroom-derive";
import type { ActJudgment, AncestryCheck, Capabilities, Clock, Fetched, Judgment, Observing, Owners, PlatformRules, PreparationJudgment, RecordedRef, Retains, Rules, StateView, TimedJudgment, ValidDefinition, Window } from "@generalbusiness/artroom-derive";
import { RULE_PROFILES, evaluateRules } from "@generalbusiness/artroom-derive/rule";
import { PAGE_ENTRIES, PAGE_REPLY_BYTES, RETAINED_REPLY_BYTES, hashOfBytes, type HistorySource, type Stored } from "./source.ts";
import { View } from "./view.ts";

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
  /**
   * The rules of the owners of outside operations that this replay has code
   * for (sections 4.3 and 9.3, the row "Outcome"): for each owner and kind,
   * what an outcome entry of such an operation derives. A capability's
   * value may hold them beside its forms and its steps, as the code of
   * `hold@1` does, and is then given here too. With none, an outcome entry
   * of an operation that a capability owns is `unsupported-definition` at
   * that entry (section 9.3, point E13). The rules of the platform
   * definition that a scope pins are given with `platform`, and need no
   * member here. The package itself has none.
   */
  owners?: Owners | undefined;
  /**
   * The platform definitions this replay has code for, by name and version
   * (section 9.3, "A history under a platform definition"): the data and the
   * rules of each version, as a runtime is supplied them. A history under
   * a platform definition is derived with them, in the order of section
   * 4.2. With none, or with a version that lacks the rule of one mark of
   * its data, such a scope is `unsupported-definition` at its genesis. The
   * package itself has none.
   */
  platform?: ((named: PlatformDefinition) => Coded | null) | undefined;
  /**
   * How a recorded grant that holds no freshness proof is read. Such a
   * grant is no grant, and an entry that holds one is no entry (section
   * 15.6n, on the I3 delta E8): `proven`, a `mismatch` at that entry. The
   * command line always asks for that. `as-recorded` is for the histories
   * of tests that were written under the test authority of the scope
   * package's test support, a STAND-IN whose grants hold `fresh: null`:
   * each such grant is taken as current, as recorded, and the report lists
   * `authority` under `trusts`. A result with it proves nothing about
   * authority. A grant that holds a proof is derived again in either case.
   * The default is `proven`. `as-recorded` ends with the test authority.
   */
  grants?: "proven" | "as-recorded" | undefined;
}

/**
 * One version of a platform definition, as a replay is supplied it: its
 * data, its rules, and what a scope under it answers to an observation
 * read, from its folded state at one head. With `observed`, the value of a
 * retained observation of such a scope is derived again from that scope's
 * history (section 16.1, "Replay").
 */
export interface Coded {
  data: PlatformData;
  rules: Rules;
  observed?: ((state: StateView, asked: ObservationRequest) => unknown) | undefined;
  /**
   * Where a scope under this version records its membership reference,
   * when that is not its genesis entry (authority note, section 3.3, "Where
   * it records its membership reference"): a pure function of the folded
   * state before the entry that is judged. A directory holds it in a slot.
   * A rules scope and a destination hold the scope ID, with the incarnation
   * of the observations of that ID which their earlier entries retain, and
   * with none before the first (authority note, section 12.1, decided in
   * revision 25). Null: the scope records none yet. Absent: a scope under
   * this version records it in its genesis entry (section 6.6).
   */
  membership?: ((state: StateView) => RecordedRef | null) | undefined;
  /**
   * Where a scope under this version records its rules reference: the
   * rules scope that it observes (section 16.1, guard 1). A destination
   * holds the scope ID in the value `branch.rules`, with the incarnation
   * of the observations of that ID which its earlier entries retain
   * (authority note, section 12.1, the same table). Absent: this replay
   * has no rule for where such a scope records it, and an entry that
   * retains an observation of the rules is `unsupported-definition` (I3
   * deltas, entry EU5).
   */
  rulesScope?: ((state: StateView) => RecordedRef | null) | undefined;
  /**
   * The kind of the act whose position is the `revision` that an answer of
   * this version states (authority note, revision 28, section 12.1.4, "What
   * a replay derives"): for a rules scope, `publish`. With it, the revision
   * of each value that is derived from a history of this version is checked
   * against the last entry of that kind at or before the head, or against 0
   * where the history holds none. A difference is a `mismatch`.
   */
  revised?: string | undefined;
}

/**
 * A count of the work that a replay does over what it has already checked,
 * for a caller that wants it: a test counts work here, and never times it
 * (I3 deltas, section 31). Each member is a number of steps, and a replay
 * adds to it.
 *
 * - `folds`: entries of a source scope that were folded into its view, for
 *   the values of the observations that other scopes retain of it. Each
 *   entry of a source is folded there once, so this is at most the entries
 *   of the sources that were checked.
 * - `values`: values that the definition of a source scope answered from a
 *   state of its view. One for each distinct source scope, incarnation,
 *   head, definition and subject that a replayed entry names.
 * - `states`: states of a source that were built from its view's log, for
 *   a head before the one that the view was folded through.
 * - `runs`: lookups of the run of a retained observation among the runs
 *   that the scope's earlier entries name. One for each retained
 *   observation that is not of the run of the entry before it.
 * - `owed`: lookups of a text that a `redact` effect lists among the texts
 *   that the scope owes. One for each text that such an effect lists.
 */
export interface Tally { folds: number; values: number; states: number; runs: number; owed: number }

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
  authority: "authority: that each recorded grant with no freshness proof was current, and the fact that issued it. Such a grant is a stand-in's, and this result proves nothing about authority",
  observed: "observation-read: that each read behind a retained observation was made as recorded, that it began at the stated time, that a fresh value was not held from an earlier read under a new number, and that no restart came between two entries of one run",
  attempts: "each diagnosis's attempt log, which is the sender's own record",
  outcomes: "each outcome's evidence, and that the outside write happened: the answer of the outside system is taken as the entry records it. `own-answer`: that an answer was that attempt's own. `host-read`: that a read returned what was recorded",
  dispatched: "that the outside effects which a preparation entry opened were dispatched only after that entry was sealed",
  staged: "staged-ref-read: that the Git host returned the snapshot of staged refs and the head that each ancestry record names, when the staging lane read them, and that the lane kept what was returned",
  anchors: "each anchor as the caller supplied it, and the definition name retained with each anchored entry",
  bounds: "the bounds: each scope is taken to run under the bounds this replay was given",
  redacted: "each redacted text: its bytes are gone, so nothing shows that they were the text its digest names, or that they were within the bound of their field",
} as const;
type Trust = keyof typeof TRUSTS;

/**
 * What the report lists under `trusts` for each platform definition whose
 * rules the replay ran (section 9.3, "What it trusts"). A platform
 * definition is pinned by a name and a version, and no digest names its
 * rules. So a replay shows that the rules it holds derive the same bytes,
 * and not that they are the ones that the runtime ran.
 */
export const platformCode = (named: PlatformDefinition): string => `platform-code: that the rules this replay ran for ${named} are the rules of that name and version`;

/** Ends the traversal with a result that is not `consistent`. */
/** The six named mismatches (section 9.5, as revision 21 reconciles it; row I3-57). */
const NAMED: readonly MismatchName[] = ["genesis-kind", "genesis-timed", "observation-older", "run-returned", "observation-not-moved", "observation-reused"];

/**
 * The `name` of a report: there exactly when the result is `mismatch` and
 * the failure is one of the six that the contract names. The finding's
 * sentence begins with the name and a colon, and the name is read from
 * there, so the report and the sentence cannot differ.
 */
const nameOf = (stop: Stop): { name?: MismatchName } => {
  const name = stop.result === "mismatch" ? NAMED.find((known) => stop.why.startsWith(`${known}: `)) : undefined;
  return name ? { name } : {};
};

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
  /** The rules of the platform definition that the scope pins, which each judge is given. Null: a declared definition. */
  platform: PlatformRules | null;
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
  /** Section 9.3: each detached text whose bytes are not at hand, with the first entry that names it, in the order of the history. A later tombstone of this scope answers for it. */
  owed: Map<Digest, FactRef>;
  /** Section 16.1: the latest checked entry that retains each read, by its run and its number, with the observation as that entry retains it. */
  reads: Map<string, Retains>;
  /** The runs of the retained observations: each run that an entry so far names, and the run of the latest such entry. */
  runs: { seen: Set<string>; last: string | null };
  /** The answer of the pinned platform definition to an observation read, when the replay was given one. */
  observed: Coded["observed"];
  /** This scope's states at its heads, for the value of an observation that another scope retains of it: each checked entry folded once more, as far as an observation names (`View`). */
  viewed: View | null;
  /** Where a scope under the pinned platform definition records its membership reference, when the replay was given that. */
  membership: Coded["membership"];
  /** Where a scope under the pinned platform definition records its rules reference, when the replay was given that. */
  rulesScope: Coded["rulesScope"];
  /** The kind of the act whose position is the revision of an answer, when the replay was given one, and the positions of the checked entries of that kind, in order. */
  revised: { kind: string; at: number[] } | null;
  /** Section 16.4: the bytes of each snapshot of staged refs that a checked outcome entry names, by digest, each checked against its digest. */
  snapshots: Map<Digest, string>;
}

/**
 * The membership reference that a scope records (authority note, section
 * 3.3, "Where it records its membership reference"), as the production
 * authority reads it (`repositoryAuthority`, in the scope package). A scope
 * whose platform version records it in its state: from the state folded
 * through the entry before the one that is judged, as a directory's slot
 * `repository.membership` (I3 deltas, entry EP14). Every other scope: from
 * its genesis entry, the first that the replay checked (section 6.6).
 *
 * A rules scope and a destination record the ID with no incarnation until
 * an entry retains an observation of it. A grant there is judged by guard 1
 * for such a scope: its observation is of that ID, and the entry fixes the
 * incarnation (`fixedIn`). That the incarnation is the one that the
 * directory confirmed, by the directory's history, is not checked here (I3
 * deltas, entry EY8).
 */
const recordedMembership = (run: Run): RecordedRef | null => {
  if (run.membership) return run.state.scope() ? run.membership(run.state) : null;
  const genesis = run.sealed[0]?.entry.input;
  return genesis?.type === "genesis" && run.at ? membershipOf(genesis, run.at) : null;
};

/** Each observation that an entry retains: the freshness proof of the one grant of an act or of a preparation, and the records of `observed` of an act, of an outcome and of a delivery of a result (section 4.1). */
const retainedBy = (input: Entry["input"]): ObservationUse[] => {
  const proofs: unknown[] = input.type === "act" || input.type === "preparation" ? input.authority.map((grant) => grant.fresh) : [];
  const further: unknown[] = input.type === "act" || input.type === "outcome" || (input.type === "delivery" && "clause" in input) ? [...(input.observed ?? [])] : [];
  return [...proofs, ...further].filter(isObservationUse);
};

/**
 * A reference with its incarnation, for one entry that is judged: the one
 * recorded before it, or, while no incarnation is recorded, the `of` of the
 * first observation of the recorded scope ID that the entry itself retains,
 * in its grant or in `observed`, which fixes it.
 */
const fixedFor = (recorded: RecordedRef | null, input: Entry["input"]): ScopeRef | null => {
  if (recorded === null || recorded.inc !== null) return recorded as ScopeRef | null;
  return fixedBy(recorded, retainedBy(input).map((use) => use.observation.of).find((of) => observedOf(of, recorded)) ?? null);
};
/** The membership reference, so. */
const fixedIn = (run: Run, input: Entry["input"]): ScopeRef | null => fixedFor(recordedMembership(run), input);

/**
 * The ancestry record that an outcome entry holds as its evidence (section
 * 16.4, "Typed domain"): the body of the evidence of a `confirmed` outcome
 * of an operation `check` of `hold@1`. Null: the entry holds none, as a
 * check whose read was cut short does.
 */
const ancestryOf = (input: Extract<Entry["input"], { type: "outcome" }>): AncestryCheck | null => {
  const body: unknown = isObject(input.evidence) ? input.evidence["body"] : null;
  const record = input.owner === HOLD && input.kind === HOLD_KINDS.check && input.result === "confirmed" && isObject(body) ? body["record"] : null;
  return isAncestryCheck(record) ? record : null;
};

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
  readonly #owners: Owners | undefined;
  readonly #platform: Options["platform"];
  readonly #grants: "proven" | "as-recorded";
  readonly #runs = new Map<ScopeId, Run>();
  readonly #trusts = new Set<Trust>();
  /** Each platform definition whose rules this replay ran, by name and version. */
  readonly #coded = new Set<PlatformDefinition>();
  /** The foreign facts proven, by scope, position and hash: by replay of their source, or by an anchor. */
  readonly #proven = new Map<string, "replayed" | "anchored">();
  readonly #anchored: FactRef[] = [];
  /** Each tombstone that answered for a text whose bytes are gone, with the slot that held the text. */
  readonly #redacted: Report["redacted"][number][] = [];
  /**
   * Sections 9.3 and 16.4: each check entry whose ancestry record was read and whose walk was not derived. The verifier has no
   * source of commits, so it makes no claim for such a check: once every other check has run, the result is `incomplete`.
   */
  readonly #unwalked: FactRef[] = [];
  /**
   * The value of each observation that was derived from the history of its source: what the source's definition answers, by the
   * exact source scope, incarnation, head, definition and subject. A later entry that names the same is compared with it, and
   * nothing is derived again. Every entry is still compared: this holds what the history gives, and never that an entry agreed.
   */
  readonly #values = new Map<string, unknown>();
  readonly #tally: Tally;
  #entries = 0;
  #bytes = 0;

  constructor(source: HistorySource, options: Options, tally: Tally = { folds: 0, values: 0, states: 0, runs: 0, owed: 0 }) {
    this.#tally = tally;
    this.#source = source;
    this.#mode = options.mode;
    this.#target = options.scope;
    this.#expected = options.head ?? null;
    this.#anchors = options.anchors ?? [];
    this.#limits = { ...LIMITS, ...options.limits };
    // Section 9.3: each range guard is derived over every item it covers, so the scan never stops unfinished.
    this.#bounds = { ...(options.bounds ?? PROPOSED_BOUNDS), guardScan: Number.MAX_SAFE_INTEGER };
    this.#capabilities = options.capabilities;
    this.#owners = options.owners;
    this.#platform = options.platform;
    this.#grants = options.grants ?? "proven";
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
      // Section 16.4: a check whose walk cannot be derived gets no claim. It is said last, so that every mismatch that the history
      // shows is reported first: of the record's snapshot, and of the act that the guard `ancestry` admitted on the record.
      const unwalked = this.#unwalked[0];
      if (unwalked) throw new Stop("incomplete", `the walk of the ancestry record in entry ${unwalked.seq} of ${unwalked.at.scope} was not derived: this replay reads no commit, so the stops, the basis of the start, \`published\`, the list F and the count of visited commits are not shown`, unwalked);
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
      trusts: [...(Object.keys(TRUSTS) as Trust[]).filter((trust) => this.#trusts.has(trust)).map((trust) => TRUSTS[trust]), ...[...this.#coded].sort().map(platformCode)],
      redacted: this.#redacted,
      result: stop ? stop.result : "consistent",
      ...(stop?.at ? { at: stop.at } : {}),
      ...(stop ? nameOf(stop) : {}),
    };
    return { report, why: stop ? stop.why : null };
  }

  // ---------------------------------------------------------------- reading

  /** Start on a scope: its first page. Null: the source holds no such history, or it cannot be read. */
  async #open(id: ScopeId): Promise<Run | null> {
    if (this.#runs.size >= this.#limits.scopes) throw new Stop("incomplete", `the limit of ${this.#limits.scopes} scopes was reached`);
    const got = await this.#page(id, 0);
    if (!got.ok) return null;
    const run: Run = { id, said: got.page.scope, head: got.page.head, at: null, named: null, definition: null, platform: null, state: new MemoryState(), sealed: [], read: new Map(), next: 0, busy: false, depth: Number.POSITIVE_INFINITY, owed: new Map(), reads: new Map(), runs: { seen: new Set(), last: null }, observed: undefined, viewed: null, membership: undefined, rulesScope: undefined, revised: null, snapshots: new Map() };
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
  async #retained(run: Run, at: FactRef, kind: RetainedInput["kind"], digest: Digest, what: string, domain?: string): Promise<RetainedInput> {
    const left = this.#limits.bytes - this.#bytes;
    const got = await this.#source.retained(run.id, kind, digest, { bytes: Math.min(left, RETAINED_REPLY_BYTES) }, domain);
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
    const owing = () => [...this.#runs.values()].find((run) => run.owed.size > 0);
    for (let run = owing(); run; run = owing()) {
      try {
        await this.#advance(run, run.head.seq, run.depth);
      } catch (error) {
        if (!(error instanceof Gap)) throw error;
      }
      const [owed] = run.owed;
      if (owed) throw new Stop("incomplete", `a retained input is missing: the detached text ${owed[0]}, which no later entry of ${run.id} redacts`, owed[1]);
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
    // Section 9.5: a preparation entry carries a signed intent too, and owes the same check in both modes.
    if (input.type === "preparation" && !verifySignedIntent(input.signed)) throw mismatch("the preparation's signature is not its actor's over its intent");

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
    if (run.revised && entry.input.type === "act" && entry.input.signed.intent.kind === run.revised.kind) run.revised.at.push(entry.seq);
  }

  // ---------------------------------------------------------------- replay of one entry

  /** The pinned definition, from the retained declaration the genesis's seed names (sections 6.1 and 9.2). */
  async #pin(run: Run, where: FactRef): Promise<ValidDefinition> {
    const digest = run.named;
    if (isPlatformDefinition(digest)) return this.#code(run, digest, where);
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
   * A platform definition, pinned by its name and version (sections 6.1 and
   * 9.3). The replay derives its history with the data and the rules of
   * that version, as the caller supplied them. The data is validated as a
   * runtime validates it, with the validator's platform option, which no
   * input reaches: the caller's code supplies the data, and the history
   * supplies only the name. A replay that lacks the version, or the rule of
   * one mark of its data, answers `unsupported-definition` at the genesis:
   * every mark is in the data, so whether a history can hold an entry of a
   * rule is a function of the definition. It is never `consistent`.
   */
  #code(run: Run, named: PlatformDefinition, where: FactRef): ValidDefinition {
    const supplied = this.#platform?.(named) ?? null;
    if (!supplied) throw new Stop("unsupported-definition", `the scope pins ${named}, which this replay has no code for`, where);
    let checked: ReturnType<typeof validateDefinition> | null = null;
    try {
      checked = validateDefinition(parseStrict(canonicalize(supplied.data)), this.#bounds, RULE_PROFILES, { platform: true, outcomeValues: outcomeValueDomains(supplied.data, supplied.rules) });
    } catch { /* data with no canonical bytes is no definition */ }
    if (!checked?.ok || checked.definition.declared.name !== platformName(named)) throw new Stop("unsupported-definition", `the data that this replay was given for ${named} is not a platform definition of that name under the bounds given`, where);
    const needs = checked.definition.underived.find((u) => !this.#capabilities?.implements(u));
    if (needs) throw new Stop("unsupported-definition", `the pinned definition needs ${needs.capability}, which this replay has no code for: ${needs.form} ${needs.name} at ${needs.path}`, where);
    const lacks = checked.definition.marks.find((mark) => ruleAt(supplied.rules, mark.code, mark.kind) === null);
    if (lacks) throw new Stop("unsupported-definition", `the pinned definition ${named} has the mark ${lacks.code} at ${lacks.path}, and this replay has no rule of that name for that place`, where);
    run.platform = { named, rules: supplied.rules };
    run.observed = supplied.observed;
    run.membership = supplied.membership;
    run.rulesScope = supplied.rulesScope;
    run.revised = supplied.revised === undefined ? null : { kind: supplied.revised, at: [] };
    // Section 9.3, "What it trusts": that the rules which it ran are the rules of that name and version.
    this.#coded.add(named);
    return checked.definition;
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

  /**
   * The state of a checked scope at one of its heads: what it would answer
   * an observation from there. The entries are the checked ones, each
   * folded once more into the scope's view, in order, as far as the highest
   * head that an observation names. A head before that is read from the
   * view's log, and no entry is folded again for it (`View`).
   */
  #viewAt(source: Run, seq: number): StateView {
    const view = source.viewed ?? (source.viewed = new View());
    while (view.through < seq) {
      const next = source.sealed[view.through + 1]!;
      view.fold(source.definition!, next.entry, next.hash);
      this.#tally.folds++;
    }
    const { state, built } = view.at(seq);
    if (built) this.#tally.states++;
    return state;
  }

  /**
   * Section 16.1, "How one observation follows another", rules 1 and 2, for
   * one retained observation of one entry: the entries that retain an
   * observation of one run are not separated by an entry of another run. A
   * history where a run returns is a `mismatch`, `run-returned`.
   */
  #inRun(run: Run, use: ObservationUse, where: FactRef): void {
    const id = use.read.run;
    if (run.runs.last === id) return;
    this.#tally.runs++;
    if (run.runs.seen.has(id)) throw new Stop("mismatch", `run-returned: the entry retains an observation of the run ${id}, and an entry of another run lies between it and that run's earlier entries`, where);
    run.runs.seen.add(id);
    run.runs.last = id;
  }

  /** After an entry is checked: it is the latest entry that retains each of its reads. */
  #retains(run: Run, entry: Entry, hash: Digest, uses: readonly ObservationUse[]): void {
    for (const use of uses) run.reads.set(`${use.read.run}:${use.read.n}`, { entry: { seq: entry.seq, hash }, time: entry.time, observation: use.observation as Observation });
  }

  /**
   * The value of an observation, against the history of the scope that it
   * is of, at the recorded head (section 16.1, "Replay"): what that scope's
   * pinned definition answers for the key, for the member or for the rules
   * from its state folded through that entry. An observation that a membership
   * scope retains of itself is of the head before the entry, and is derived
   * from the state that this replay holds there. Any other is proved as a
   * foreign fact is: by replay of the membership scope up to that head, or
   * by an anchor, which covers the entry and leaves the value on trust.
   * Without the history and with no anchor the report is
   * `missing-dependency`.
   *
   * What the history of another scope gives is derived once for each exact
   * source scope, incarnation, head, definition and subject, and kept
   * (`#values`). The head is proved for every entry, and every retained
   * observation is compared with the value, whether it was derived for
   * this entry or for an earlier one (I3 deltas, section 31).
   */
  async #standing(run: Run, entry: Entry, o: ObservationUse["observation"], where: FactRef, depth: number): Promise<void> {
    const mismatch = (why: string): Stop => new Stop("mismatch", why, where);
    // The holders of an action: the answer lists the first of them, as many as the row's `most` or all. The judge checks the list's
    // length against the row, so the value is asked here for as many as the record lists.
    const asked: ObservationRequest = !("subject" in o) ? { of: o.of, key: o.key } : o.subject === "member" ? { of: o.of, member: o.member } : o.subject === "holders" ? { of: o.of, holders: o.action, most: o.holders.length } : { of: o.of, asked: o.content.asked };
    const unanswered = (): Stop => new Stop("unsupported-definition", `the observed scope ${o.of.scope} pins a definition for which this replay has no answer to an observation`, where);
    let derived: unknown;
    if (o.of.scope === run.id) {
      if (o.head.seq !== entry.seq - 1 || o.head.hash !== entry.prev || o.at !== entry.time) throw mismatch("a membership scope judges its own act on the head before the entry, at the entry's time, and the retained observation states another");
      if (!run.observed) throw unanswered();
      // The state that this replay holds at the head before the entry. Nothing is folded for it, and each entry names another head.
      derived = run.observed(run.state, asked);
    } else {
      const fact: FactRef = { at: o.of, seq: o.head.seq, hash: o.head.hash };
      if (await this.#prove(fact, where, depth) === "anchored") return;
      const source = this.#runs.get(o.of.scope)!;
      if (!source.observed) throw unanswered();
      // The head is proved: the source has that incarnation, and that hash at that position. So the key names one state and one question.
      const key = canonicalize([o.of.scope, o.of.inc, o.head.seq, o.head.hash, source.named, asked]);
      if (this.#values.has(key)) derived = this.#values.get(key);
      else {
        derived = source.observed(this.#viewAt(source, o.head.seq), asked);
        // Authority note, section 12.1.4, "What a replay derives": the revision that the folded state gives is the position of the
        // last entry of the stated kind at or before the head, or 0 where there is none.
        if (source.revised && isObject(derived)) {
          let last = 0;
          for (let i = source.revised.at.length - 1; i >= 0 && last === 0; i--) if (source.revised.at[i]! <= o.head.seq) last = source.revised.at[i]!;
          if (derived["revision"] !== last) throw mismatch(`the state of ${o.of.scope} at its entry ${o.head.seq} gives the revision ${String(derived["revision"])}, and the last entry of the kind ${source.revised.kind} at or before it is at ${last}`);
        }
        this.#tally.values++;
        this.#values.set(key, derived);
      }
    }
    if (!isObject(derived) || canonicalize({ ...derived, at: o.at }) !== canonicalize(o)) throw mismatch(`the retained observation is not what the history of ${o.of.scope} gives ${"key" in asked ? "that key" : "member" in asked ? "that member" : "holders" in asked ? "the holders of that action" : "the rules"} at its entry ${o.head.seq}`);
  }

  /**
   * The one grant that an act or a preparation records, derived again from
   * the observation that it retains (section 9.3, the rows "Act",
   * "Preparation" and "An observation";
   * section 16.1, the row "Replay path"), with derive's own functions:
   * that the grant agrees with the observation; the guards of the
   * observation and the grant guard, on the entry's time, for the signing
   * key and the action asked, with the window of this kind of commit (an
   * act's by its row, a preparation's by its step), the latest earlier entry that retains the read
   * and the highest head that the earlier entries retain; and the value,
   * against membership's history at the recorded head. What it cannot
   * derive is that the read was made: `trusted: observation-read`.
   *
   * A grant with no freshness proof is no grant (section 15.6n, on E8). It
   * is a `mismatch`, unless the caller said that the history was written
   * under the test authority, a stand-in: then it is taken as recorded.
   */
  async #granted(run: Run, entry: Entry, grant: Grant, asked: { key: KeyId; action: string | null; window: Window | null }, where: FactRef, depth: number): Promise<void> {
    const mismatch = (why: string): Stop => new Stop("mismatch", why, where);
    const use: unknown = grant.fresh;
    if (use === null && this.#grants === "as-recorded") {
      this.#trusts.add("authority");
      return;
    }
    if (!isObservationUse(use) || "subject" in use.observation) throw mismatch("the recorded grant holds no freshness proof of a key's standing: it is no grant");
    const o = use.observation;
    if (!agrees(grant)) throw mismatch("the recorded grant is not the grant that the observation it retains gives");
    if (entry.clamped) throw mismatch("an entry that retains an observation judges time, and is never clamped");
    const { action, window } = asked;
    const membership = recordedMembership(run);
    if (action === null || membership === null || window === null) throw mismatch("the entry records a grant, and its row or its step names no action, its scope records no membership scope, or no window is stated for it");
    this.#inRun(run, use, where);
    const judged = judgeGrant(use, {
      scope: run.at!, membership, key: asked.key, action, window, clock: { reading: entry.time, behind: false, asOf: entry.time },
      last: run.reads.get(`${use.read.run}:${use.read.n}`) ?? null, highest: highestHead(run.state, o),
    });
    if (judged.result !== "current") {
      const name = judged.result === "authority-unavailable" ? MISMATCHES[judged.failed] : undefined;
      throw mismatch(`${name ? `${name}: ` : ""}derived again on the entry's time, the retained observation does not give the grant: ${judged.failed}`);
    }
    await this.#standing(run, entry, o, where, depth);
    this.#trusts.add("observed");
  }

  /**
   * The further observations that an act, an outcome or a delivery of a
   * result retains in `observed` (sections 4.1 and 16.1, "The guards, in
   * the commit" and "Replay"), each derived again from the entry and the
   * earlier entries: guard 1, that it is of the scope's own membership
   * reference, or of its rules reference; guard 3, that a ten-second kind
   * is `fresh`; guard 4, `fresh` or `reused` as the earlier entries make
   * it, and that the clock has moved; guard 5, the age inside the window;
   * guard 6, that no head goes back; that the runs do not return; and the
   * value, against the history of the observed scope at the recorded head.
   * That the entry holds exactly those that its judgment reads is the
   * judge's derivation.
   *
   * **The window.** No form of platform data states the window of an entry
   * and a subject (the contract's point R1-67). The authority note's
   * section 3.3 states each in a table of entries, and the rule here is
   * read from its rows (I3 deltas, entries EU4 and FC4). For an act: the
   * window of the act's own grant, which every row for an act states. For
   * an outcome and for a delivery of a result: ten seconds, and `fresh`,
   * which both rows of that table state (the outcome of `judge`, and the
   * delivery of a license result), as the contract's own table of section
   * 16.1 does. With no window stated, the entry is a `mismatch`.
   *
   * **The rules reference.** Where a scope records it is code of its
   * version (`Coded.rulesScope`). With none, an observation of the rules is
   * `unsupported-definition` (entry EU5). Its value needs the answer of the
   * rules scope's version to a read, which no version has yet (entry FB10):
   * with an anchor for the head it is taken on trust, and without one the
   * replay is `unsupported-definition` there.
   */
  async #observed(run: Run, entry: Entry, uses: readonly ObservationUse[], window: Window | null, where: FactRef, depth: number): Promise<void> {
    const mismatch = (why: string): Stop => new Stop("mismatch", why, where);
    if (entry.clamped) throw mismatch("an entry that retains an observation judges time, and is never clamped");
    const membership = fixedIn(run, entry.input);
    for (const use of uses) {
      const o = use.observation;
      if ("subject" in o && o.subject === "rules") {
        if (!run.rulesScope) throw new Stop("unsupported-definition", "the entry retains an observation of the rules, and this replay has no rule for where a scope records its rules reference", where);
        const rules = fixedFor(run.state.scope() ? run.rulesScope(run.state) : null, entry.input);
        if (rules === null || !same(o.of, rules)) throw mismatch("a retained observation of the rules is not of the rules scope that the scope records, with that incarnation");
      } else if (membership === null || !same(o.of, membership)) throw mismatch("a retained observation is not of the membership scope that the scope records, with that incarnation");
      this.#inRun(run, use, where);
      if (window === null) throw mismatch("the entry retains an observation, and no window is stated for it");
      if (window.once && use.use !== "fresh") throw mismatch("observation-reused: an observation of a ten-second kind serves one commit, and the entry retains it as reused");
      const last = run.reads.get(`${use.read.run}:${use.read.n}`) ?? null;
      if (last === null ? use.use !== "fresh" || use.prior !== null : use.use !== "reused" || canonicalize(use.prior) !== canonicalize(last.entry) || canonicalize(use.observation) !== canonicalize(last.observation)) {
        throw mismatch("a retained observation is `fresh` only when no earlier entry retains its read, and `reused` only with the latest such entry and the same bytes");
      }
      if (last !== null && timeMs(entry.time)! <= timeMs(last.time)!) throw mismatch("observation-not-moved: the entry reuses a read, and its time is not later than the time of the latest entry that retains it");
      const began = timeMs(o.at);
      const age = began === null ? -1 : timeMs(entry.time)! - began;
      if (age < 0 || age >= window.seconds * 1000) throw mismatch(`derived again on the entry's time, a retained observation is outside its window of ${window.seconds} seconds`);
      for (const head of headsOf(use)) {
        const held = run.state.observed(head.of, head.subject);
        if (held !== null && head.seq < held) throw mismatch(`observation-older: the entry retains an observation of ${head.subject} from a lower head than an earlier entry retains`);
      }
      await this.#standing(run, entry, o, where, depth);
      this.#trusts.add("observed");
    }
  }

  /**
   * What a judge is given for the rows of `observes` of one entry, under a
   * definition whose data states rows (revision 20, section 16.1,
   * "Replay"): the records of the entry's own `observed`; the two
   * references that the scope records, as the state before the entry has
   * them; the latest earlier entry that retains each read; what the data of
   * a rules definition states; and the bytes of each value that a record
   * names, which the scope keeps by its domain and its digest. No subject
   * can be read: a row with none is absent on the runtime's word.
   *
   * A replay without the bytes of a named value is `incomplete` (witness
   * 18.48, case 10, and 18.50, case 11). The value is asked in each domain
   * that a row of the pinned data states under `retains`: the judge then
   * holds it to the row of the entry's own form.
   */
  async #hand(run: Run, entry: Entry, recorded: readonly ObservationUse[] | undefined, where: FactRef): Promise<{ observed: readonly ObservationUse[]; values: string[]; observing: Observing }> {
    const observed = recorded ?? [];
    if (observed.length > 0 && entry.clamped) throw new Stop("mismatch", "an entry that retains an observation judges time, and is never clamped", where);
    for (const use of observed) this.#inRun(run, use, where);
    const values: string[] = [];
    const domains = retainsOf(run.definition!);
    for (const digest of observed.flatMap((use) => namedBy(use.observation))) {
      let found: string | null = null;
      for (const domain of domains) {
        const left = this.#limits.bytes - this.#bytes;
        const got = await this.#source.retained(run.id, "value", digest, { bytes: Math.min(left, RETAINED_REPLY_BYTES) }, domain);
        if (!got.ok) { this.#unread(got.reason, left < RETAINED_REPLY_BYTES, `a retained input of ${run.id}`); continue; }
        this.#count(got.bytes);
        try { if (valueDigest(domain, parseStrict(got.input.bytes)) === digest) found = got.input.bytes; } catch { /* not the one named */ }
        if (found !== null) break;
      }
      if (found === null) throw new Stop("incomplete", `a retained input is missing: the value that an observation of the entry names, ${digest}`, where);
      values.push(found);
    }
    const state = run.state;
    return {
      observed, values,
      observing: {
        membership: recordedMembership(run), rules: run.rulesScope && state.scope() ? run.rulesScope(state) : null,
        last: (use) => run.reads.get(`${use.read.run}:${use.read.n}`) ?? null,
        content: (named) => { const data = this.#platform?.(named)?.data; return data ? contentStates(data) : null; },
      },
    };
  }

  /**
   * The records of `observed` of one entry, against what the rows of its
   * form came to when the judge derived them again (section 16.1, "What a
   * replay derives"). A record of a subject that no row gives, and one that
   * serves no row, are each a `mismatch`: a guard that failed is named as
   * the authority note names it, `observation-reused`,
   * `observation-not-moved` or `observation-older`. Then the value of each
   * record, against the history of the observed scope at its head. That
   * the entry holds exactly the subjects of the whole rows, and that no
   * absent row states `wait`, is the judge's derivation, which the caller
   * compares with the entry. That a subject of an absent row could not be
   * read is the runtime's word, under `observation-read`.
   */
  async #byRows(run: Run, entry: Entry, judged: ActJudgment | Judgment, recorded: readonly ObservationUse[], where: FactRef, depth: number): Promise<void> {
    const settled = judged.result === "write" ? judged.draft.rows : judged.result === "unavailable" ? judged.rows : undefined;
    for (const use of settled ? recorded : []) {
      if (!settled!.listed.has(observedName(use.observation))) throw new Stop("mismatch", "the entry holds a record of `observed` of a subject that no row of its form gives", where);
      const why = settled!.unserved.get(use);
      if (why === undefined) continue;
      const name = why === "record" || why === "value" ? undefined : MISMATCHES[why];
      throw new Stop("mismatch", `${name ? `${name}: ` : ""}derived again on the entry's time, a retained observation serves no row of the entry's form: ${why}`, where);
    }
    for (const use of recorded) await this.#standing(run, entry, use.observation, where, depth);
    if (recorded.length > 0 || (settled && [...settled.status.values()].includes("absent"))) this.#trusts.add("observed");
  }

  /**
   * The snapshots of staged refs that an outcome entry's evidence names by
   * digest (section 16.4): each is a retained input of the scope, stored
   * before the entry that names it. Its bytes are read by that digest and
   * checked against it, and are then the ones that the guard `ancestry`
   * reads at a later act. With the bytes gone the replay is `incomplete`
   * for that check, and makes no claim (witness 18.10).
   *
   * Of an ancestry record this derives what the bytes alone give: the
   * snapshot's digest and its count. The staged refs and the branch as
   * they are now are never read. The commits are not read either, so the
   * walk is not derived again. The contract asks for the walk, or for
   * `incomplete` (sections 9.3 and 16.4): the entry is noted, and the
   * replay ends `incomplete` for it once every other check has run (I3
   * deltas, entry EU2).
   */
  async #snapshots(run: Run, input: Extract<Entry["input"], { type: "outcome" }>, owners: Owners | undefined, owner: unknown, kind: unknown, where: FactRef): Promise<void> {
    let named: readonly Digest[] = [];
    try {
      named = (typeof owner === "string" && typeof kind === "string" ? owners?.rules(owner as never, kind)?.retains?.(input.evidence) : undefined) ?? [];
    } catch { /* evidence that its owner cannot read names nothing, and the judge answers for it */ }
    // An ancestry record names its snapshot, whatever the owner's rules list.
    const record = ancestryOf(input);
    for (const digest of record ? [...named, record.snapshot.digest] : named) {
      if (run.snapshots.has(digest)) continue;
      const kept = await this.#retained(run, where, "snapshot", digest, "the snapshot of staged refs");
      if (snapshotRead(digest, kept.bytes) === null) throw new Stop("incomplete", `a retained input is not the one named: the snapshot of staged refs, ${digest}`, where);
      run.snapshots.set(digest, kept.bytes);
    }
    if (!record) return;
    const pairs = snapshotRead(record.snapshot.digest, run.snapshots.get(record.snapshot.digest)!);
    if (pairs && pairs.length !== record.snapshot.count) throw new Stop("mismatch", `the ancestry record states ${record.snapshot.count} staged refs, and the snapshot that it names holds ${pairs.length}`, where);
    this.#trusts.add("staged");
    this.#unwalked.push(where);
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
      if (size === null && !run.owed.has(text)) run.owed.set(text, where);
    }
    // Section 6.2: a local fact, and a part of one, are read from this scope's own history: the entries checked so far.
    // Section 9.3: a rule of a platform definition is given only what section 6.1 lists. All of it is in the history, in the retained
    // inputs or in the caller's bounds.
    // Section 16.4: the guard `ancestry` reads a snapshot of staged refs from the bytes that the scope retains. Here they are the
    // bytes that an earlier outcome entry of this scope named, which were read and checked against their digest at that entry.
    const reading = {
      clock, bounds, facts, prepared: entry.prepared, own: (at: number) => run.sealed[at] ?? null, texts: (digest: Digest) => texts.get(digest) ?? null, snapshot: (digest: Digest) => run.snapshots.get(digest) ?? null,
      capabilities: this.#capabilities, platform: run.platform ?? undefined,
    };
    // Section 17.2a, "What a verifier does": the counts of each holder, the account of each entry and each `for` are derived again
    // from the history. The fold derives each draw and each release, and the checkpoint's digest covers what it keeps. An entry
    // that draws past a count, or that opens an operation of a held kind for no holder, is a mismatch with its own name, whatever
    // a judge would say of its input.
    const drawn = drawsOf(state, definition, entry);
    if ("fault" in drawn) throw mismatch(`${drawn.fault === "past-count" ? "draw-past-count" : "held-without-holder"}: ${drawn.detail}`);
    const copyOf = (fact: FactRef | null) => facts.find((f) => f.fact.hash === fact?.hash) ?? null;
    const sealed = (seq: unknown): Entry | null => (isLocalId(seq) ? (run.sealed[seq]?.entry ?? null) : null);
    let judged: ActJudgment | Judgment | TimedJudgment | PreparationJudgment;
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
        // Section 9.3, the row "Act": the one grant judged, against the observation that it retains. It is derived again here, and
        // the judge is then given it as current. An act that a rule at `grant` passed records none, and the judge runs that rule.
        if (input.authority.length > 1) throw mismatch("an act records the one grant that was judged");
        for (const grant of input.authority) {
          const row = own(definition.declared.acts, input.signed.intent.kind);
          // Authority note, section 3.3: a membership scope judges its own act on an observation that serves that one commit.
          const window = run.at!.kind === "membership" ? WINDOWS.once : windowOf(definition, run.at!.kind, input.signed.intent.kind);
          await this.#granted(run, entry, grant, { key: input.signed.intent.actor, action: row ? actionOf(row) : null, window }, where, depth);
        }
        // Revision 20, section 16.1, "Replay": under a definition whose data states rows, the check is by the rows (`#byRows`, below).
        // Under any other, the older rule stands as a stand-in: the window of the act's own grant.
        if (input.observed && !definition.observing) await this.#observed(run, entry, input.observed, windowOf(definition, run.at!.kind, input.signed.intent.kind), where, depth);
        const actRows = definition.observing ? await this.#hand(run, entry, input.observed, where) : null;
        // Section 16.1, "Replay": that `within` covers the observing scope is checked by the reference that its genesis records.
        // Section 16.1, "Replay": the entry holds exactly the observations that its judgment reads. The judge is given the recorded
        // ones, and derives an input with those that a rule read: one that no rule reads, and one that a rule reads and the entry
        // lacks, are each a mismatch.
        // Sections 6.2 and 9.2, revision 19: each place of the act that the pinned data states names a value, which the scope keeps
        // under its domain and its digest: the kind `value`, or `definition` for a value in the domain of a definition. A replay
        // without the bytes is `incomplete`, and not a mismatch. The judge is given the values that the entry retains.
        // I3 merge: a row whose rule holds the domain and the bound in its own code states no place in its data, so this replay
        // gives its judge no value, and an entry whose rule read one so is not derived again (I3 deltas, entries EM4 and EX5).
        const values: string[] = [];
        for (const place of placesOf(own(definition.declared.acts, input.signed.intent.kind)?.fields, input.signed.intent.fields)) {
          const what = `the value that the field ${place.field} names, in the domain ${place.domain}`;
          const kept = place.domain === DOMAINS.definition ? await this.#retained(run, where, "definition", place.digest, what) : await this.#retained(run, where, "value", place.digest, what, place.domain);
          let named = false;
          try { named = valueDigest(place.domain, parseStrict(kept.bytes)) === place.digest; } catch { /* not the one named */ }
          if (!named) throw new Stop("incomplete", `a retained input is not the one named: ${what}, ${place.digest}`, where);
          values.push(kept.bytes);
        }
        if (actRows) values.push(...actRows.values);
        judged = judgeAct(state, definition, input.signed, { ...reading, presented: input.presented, grants: input.authority.map((grant) => ({ grant, current: true })), membership: fixedIn(run, input), ...(input.observed ? { observed: input.observed } : {}), ...(values.length > 0 ? { values } : {}), ...(actRows ? { observed: actRows.observed, observing: actRows.observing } : {}) });
        if (actRows) await this.#byRows(run, entry, judged, actRows.observed, where, depth);
        break;
      case "delivery": {
        this.#trusts.add("delivered");
        const source = copyOf(input.from);
        // The address is the one the sender wrote: the source entry's send at that ordinal.
        const to = source?.entry.sends.find((send) => send.n === input.n)?.to;
        if (!source || to === undefined) throw mismatch("the source entry holds no send at that ordinal");
        const origin = input.message.class === "result" && isObject(input.message.of) && isObject(input.message.of.from) ? sealed(input.message.of.from.seq) : null;
        // Sections 4.1 and 16.1: a delivery of a result may retain observations, each of the ten-second kind. Each is derived again,
        // and the judge is given the recorded ones: its clause's rules read them, and it derives an input with those that were read.
        const further = "clause" in input ? input.observed : undefined;
        // Revision 20: under a definition whose data states rows, the check is by the rows of the clause that ran. Under any other,
        // the ten-second window of the two rows of the authority note's table stands, as a stand-in.
        if (further && !definition.observing) await this.#observed(run, entry, further, WINDOWS.once, where, depth);
        const clauseRows = definition.observing && "clause" in input ? await this.#hand(run, entry, further, where) : null;
        judged = judgeDelivery(state, definition, { to, from: input.from, n: input.n, message: input.message }, { ...reading, source: { entry: source.entry, under: source.under }, origin, ...(further ? { observed: further } : {}), ...(clauseRows ?? {}) });
        if (clauseRows) await this.#byRows(run, entry, judged, clauseRows.observed, where, depth);
        break;
      }
      case "diagnosis":
        this.#trusts.add("attempts");
        judged = judgeDiagnosis(state, definition, { of: input.of, attempts: input.attempts }, { ...reading, prepared: [], origin: sealed(input.of.seq) });
        break;
      case "timed":
        judged = judgeTimed(state, definition, { item: input.item, rule: input.rule, due: input.due }, { clock, bounds, capabilities: this.#capabilities });
        break;
      case "preparation": {
        // Section 9.3, the row "Preparation", and point E13: the entry is derived with the rules of its step, which the capability's
        // code holds. A verifier that does not derive the step answers `unsupported-definition` at the entry, and is never
        // `consistent`: whether a history holds a preparation of a step is no function of the definition's bytes.
        const steps = stepsOf(this.#capabilities);
        const [capability, step] = [input.capability as CapabilityName, input.step];
        if (!steps?.implements(capability, step)) throw new Stop("unsupported-definition", `entry ${entry.seq} is a preparation, and this replay has no rules for the step ${step} of ${capability}`, where);
        if (input.authority.length !== 1) throw mismatch("a preparation records the one grant that was judged");
        const grant = input.authority[0]!;
        // Section 5.5, "What is judged": the grant for the action that the capability names for the step, on an observation of the
        // kind that the step needs. Both are the step's own answer over the state before the entry, as the runtime asked it before
        // its read. The grant is derived again against them here, and the judge is then given it for exactly that action and window.
        let needs: { action: string; window: Window } | null = null;
        try {
          needs = steps.grant(capability, step, { view: state, definition, scope: state.scope()!, self: entry.seq, intent: input.signed.intent, digest: intentDigest(input.signed.intent), clock, own: reading.own });
        } catch { /* a request that the rules cannot read names no action, and the judge refuses it */ }
        if (needs) await this.#granted(run, entry, grant, { key: input.signed.intent.actor, ...needs }, where, depth);
        this.#trusts.add("dispatched");
        judged = judgePreparation(state, definition, { signed: input.signed, capability, step }, {
          clock, bounds, steps, own: reading.own, membership: fixedIn(run, input),
          granted: (wanted) => (needs !== null && wanted.action === needs.action && wanted.window.seconds === needs.window.seconds && wanted.window.once === needs.window.once ? { result: "granted", grant } : { result: "unavailable" }),
        });
        break;
      }
      case "outcome": {
        // Section 9.3, the row "Outcome": the entry is derived with the rules of the owner of its operation. They are the rule that
        // the pinned platform definition names in `outcomes` for the operation's kind, or the rules that the caller gave for a
        // capability. The owner and the kind are those of the `operation` effect that opened the operation, which the fold holds.
        // The judge refuses an input that states others (witness 18.41, case 7).
        const operation = state.operation(input.operation);
        const [owner, kind] = operation ? [operation.owner, operation.kind] : [input.owner, input.kind];
        const owners = ownersOf(definition, run.platform, this.#owners);
        // Section 9.3, point E13, and section 9.4: an outcome entry of an operation whose rules the verifier does not derive is
        // `unsupported-definition` at that entry, and never `consistent`.
        if (!owners?.rules(owner, kind)) throw new Stop("unsupported-definition", `entry ${entry.seq} is an outcome, and this replay has no rules of the owner of its operation`, where);
        this.#trusts.add("outcomes");
        await this.#snapshots(run, input, owners, owner, kind, where);
        // Sections 4.1 and 16.1, "Replay": each observation that the outcome retains, of the ten-second kind, is derived again. The
        // judge is given the recorded ones and the retained copy of each entry in `uses`, as a rule of the outcome reads them, and
        // derives an input with the observations that a rule read: one that no rule reads, and one that a rule reads and the entry
        // lacks, are each a mismatch (I3 deltas, entries EU4 and FC4).
        // Revision 20, sections 6.1 and 16.1, "Replay": under a definition whose data states rows or an origin, the judge finds the
        // origin again, by the operation's ID or by the rule, and copies its `uses`; it derives both subject lists, the second from
        // the recorded observations of the first; and the check of each record is by the rows of the kind. Under any other, the
        // ten-second window stands, as a stand-in.
        if (input.observed && !definition.observing) await this.#observed(run, entry, input.observed, WINDOWS.once, where, depth);
        const kindRows = definition.observing ? await this.#hand(run, entry, input.observed, where) : null;
        let named;
        try { named = evidenceValues(owners.rules(owner, kind), input.evidence); } catch { named = null; }
        if (named === null) throw mismatch("the evidence names a value outside its owner declaration");
        const values = [...(kindRows?.values ?? [])];
        for (const value of named) {
          const kept = await this.#retained(run, where, "value", value.digest, "the value named by outcome evidence", value.domain);
          try {
            if (utf8(kept.bytes).length > value.max || canonicalize(parseStrict(kept.bytes)) !== kept.bytes || valueDigest(value.domain, parseStrict(kept.bytes)) !== value.digest) throw new Error();
          } catch { throw new Stop("incomplete", `a retained input is not the one named: the outcome evidence value, ${value.digest}`, where); }
          values.push(kept.bytes);
        }
        judged = judgeOutcome(state, definition, input, { clock, bounds, owners: this.#owners, platform: run.platform ?? undefined, own: reading.own, facts, ...(input.observed ? { observed: input.observed } : {}), ...(kindRows ?? {}), values });
        if (kindRows) await this.#byRows(run, entry, judged, kindRows.observed, where, depth);
        break;
      }
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
    // Section 16.1: this entry is now the latest that retains each of its reads, in its grant and in `observed`. A preparation retains one in its grant,
    // and an outcome and a delivery of a result in `observed` alone.
    this.#retains(run, entry, hash, retainedBy(input));
    // Section 9.3: this entry is the tombstone of each text that its `redact` effects list. The judge derived the list again from
    // what the slot had held. A text that an earlier entry names, and whose bytes are gone, is reported as redacted.
    for (const effect of entry.effects) {
      if (effect.effect !== "redact") continue;
      this.#tally.owed += effect.texts.length;
      if (effect.texts.filter((text) => run.owed.delete(text)).length === 0) continue;
      this.#redacted.push({ tombstone: where, item: effect.item, slot: effect.slot });
      this.#trusts.add("redacted");
    }
  }
}

/**
 * Check the history of `options.scope`, as `source` serves it. Rejects with
 * `SourceError` when that history cannot be read at all. Every other end is
 * a report. `tally`, when it is given, counts the work of the replay over
 * what it has already checked (`Tally`).
 */
export function verify(source: HistorySource, options: Options, tally?: Tally): Promise<Verification> {
  return new Verifier(source, options, tally).run();
}
