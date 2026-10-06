/**
 * One scope's surface (scope contract, sections 4.2, 7.1 and 9.2): found a
 * directory, submit an act, settle an accepted act, run an alarm's turn,
 * and write a checkpoint. Each is a waiting input handed to the turn, or a
 * read of the history. The judges are derive's; this file builds what they
 * are given and turns what they answer into the caller's answer. `Founded`,
 * the answer to a founding, is the contract's, and is exported here again.
 */

import { DOMAINS } from "@generalbusiness/artroom-contract";
import type { ActType, Answer, Beside, Bounds, CapabilityName, DeclaredDefinition, Digest, DutyId, Entry, FactRef, Founded, Grant, ObservationUse, PlatformDefinition, Receipt, RefusalReason, ScopeId, Seed, Settlement, SignedIntent, UnavailableReason } from "@generalbusiness/artroom-contract";
import { canonicalize, definitionDigest, intentDigest, isDigest, isGrant, isPlatformDefinition, newIncarnation, parseStrict, platformName, textDigest, utf8 } from "@generalbusiness/artroom-bytes";
import { actNeeds, actionOf, checkpointOf, clockOf, counted, derivable, factsNamed, ownersOf, inputTexts, isObject, judgeAct, judgeCheckpoint, judgeGenesis, judgePreparation, own, placesOf, prepareRules, presentedTypes, readFields, runnable, stepsOf, validateDefinition, windowOf } from "@generalbusiness/artroom-derive";
import type { ActJudgment, Clock as Reading, Draft, Fetched, Founding, GrantDecision, JudgeContext, Needed, Observing, Own, Owners, Placed, PlatformRules, Presented, Snapshots, StateView, Texts, ValidDefinition, Window } from "@generalbusiness/artroom-derive";
import { RULE_PROFILES } from "@generalbusiness/artroom-derive/rule";
import { namedBy } from "./definitions.ts";
import type { Asked, DefinitionRead, Further, Ports, Standing } from "./ports.ts";
import type { Retained, Sealed, Store } from "./store.ts";
import { LATE, Turns, fetchFacts, isSigned, within, type Verdict } from "./turn.ts";

export type { Founded };

/** How a checkpoint is answered (section 9.2). It has no caller outside the scope. */
export type Checkpointed =
  | { answer: "written"; fact: FactRef }
  | { answer: "refused"; reason: RefusalReason }
  | { answer: "unavailable"; reason: UnavailableReason };

/**
 * The definition a scope pins: what its seed names, and the validated
 * declaration. Null: this runtime cannot run it, and the scope admits
 * nothing (section 6.1). `platform`: the rules of the platform definition
 * that the scope pins, which every judge of this scope is given, and which
 * the judges run at the place of each mark. Null: a declared definition,
 * which holds no mark, or a definition that this runtime cannot run.
 */
export interface Pinned { named: Digest | PlatformDefinition; definition: ValidDefinition | null; platform: PlatformRules | null }

/** A platform definition as this runtime can run it: the validated data, and its rules. */
export interface Supplied { definition: ValidDefinition; platform: PlatformRules }

/** The receipt of a sealed entry: a view, built after sealing (section 4.1). */
export function receiptOf({ entry, hash }: Sealed, definition: Digest | PlatformDefinition): Receipt {
  const input = entry.input;
  const intent = input.type === "act" ? intentDigest(input.signed.intent) : input.type === "genesis" && input.founding ? intentDigest(input.founding.intent) : null;
  return { fact: { at: entry.at, seq: entry.seq, hash }, definition, intent, effects: entry.effects, sends: entry.sends.map((s): DutyId => `${entry.seq}.${s.n}`), epoch: 0 };
}

/** This scope's own sealed entry at a position, from its stored history, for the judges (section 6.2, a local fact). */
/** The snapshots of staged refs that the scope retains, by digest, as the guard `ancestry` reads them (section 16.4). */
export const snapshotsOf = (store: Store): Snapshots => (digest) => store.retained("snapshot", digest)?.bytes ?? null;

export const ownOf = (store: Store): Own => (seq) => {
  const kept = store.stored(seq);
  return kept ? { entry: JSON.parse(kept.bytes) as Entry, hash: kept.hash } : null;
};

/** Section 9.2: the bytes of each foreign entry the draft's `uses` name, under its content digest. */
export function used(draft: Draft, facts: readonly Fetched[]): Retained[] {
  return draft.uses.map((use) => {
    const read = facts.find((f) => f.fact.hash === use.fact.hash);
    if (!read) throw new Error(`the foreign entry ${use.fact.hash} was not fetched before the turn`);
    return { kind: "entry", digest: use.content, bytes: canonicalize(read.entry), under: read.under };
  });
}

/**
 * The foreign entries an entry of this scope read, from the scope's own
 * retained inputs (section 9.2). A clause run in a later entry reads them
 * again (sections 6.6 and 7.4). One that is missing is left out, and the
 * clause is then not judged.
 */
export function retainedFacts(store: Store, entry: Entry): Fetched[] {
  return entry.uses.flatMap((use): Fetched[] => {
    const kept = store.retained("entry", use.content);
    return kept ? [{ fact: use.fact, entry: JSON.parse(kept.bytes) as Entry, under: kept.under ?? "" }] : [];
  });
}

/**
 * The detached texts at hand for one input (section 6.2), by the digest of
 * each, which is computed here: each as the JSON string that is retained,
 * with the number of UTF-8 bytes of the text.
 */
export class Received {
  readonly #texts = new Map<Digest, { bytes: string; size: number }>();

  /**
   * The texts that came beside an intent. At most as many are read as
   * `fields` has detached texts, and none longer than a text may be. A
   * value that is no text, or has no canonical bytes, is not one.
   */
  static beside(texts: unknown, fields: ActType["fields"] | undefined, bounds: Bounds): Received {
    const received = new Received();
    const most = Object.values(fields ?? {}).filter((type) => type.type === "text" && type.detached).length;
    for (const text of Array.isArray(texts) ? texts.slice(0, most) : []) if (typeof text === "string" && text.length <= bounds.textBytes) received.add(text);
    return received;
  }

  /** One text. Returns its digest, or null when the text has no canonical bytes. */
  add(text: string): Digest | null {
    try {
      const digest = textDigest(text);
      this.#texts.set(digest, { bytes: canonicalize(text), size: utf8(text).length });
      return digest;
    } catch {
      return null;
    }
  }

  /** What a judge asks: the size of the text under a digest, or undefined when none came. */
  readonly sizes: Texts = (digest) => this.#texts.get(digest)?.size;

  /** Section 9.2: the bytes of each text that the entry's input names, under its digest, to be retained with the entry. `under`: for a delivery, the name of the definition that its sender pins. */
  retain(definition: ValidDefinition, draft: Draft, under?: string): Retained[] {
    return inputTexts(definition, draft.input, under).flatMap((digest): Retained[] => {
      const text = this.#texts.get(digest);
      return text ? [{ kind: "text", digest, bytes: text.bytes }] : [];
    });
  }
}

/**
 * The kind of the scope that a founding under that definition makes
 * (section 7.1; I3 delta EP2): the register's platform definition founds a
 * register, and no other definition does. The genesis judge checks the
 * three together: the kind `register`, an intent of the kind `install`, and
 * the register's definition, each only with the other two. The Worker
 * builds the same seed to find the object's name.
 */
export const foundedKind = (definition: unknown): "register" | "directory" =>
  (isPlatformDefinition(definition) && platformName(definition) === "platform:register" ? "register" : "directory");

/** What came beside an intent, as a caller over a transport sent it: untrusted, so anything that is not a record is nothing. */
const besideOf = (beside: unknown): { texts?: unknown; presented?: unknown; values?: unknown } => (isObject(beside) ? beside : {});

/**
 * The values that came beside an intent, as the scope reads them before the
 * turn (section 6.2, "What the member bounds, before the turn", revision
 * 19). `places`: the places of the act that the intent sets, from the
 * pinned data. At most as many values are read as those places name, and
 * none past the largest `max` among them. The judge matches each by its
 * digest in the domain of a place, and by that place's own bound. An act
 * with no place, as every act of a declared definition, reads none.
 */
function valuesBeside(values: unknown, places: readonly Placed[]): string[] {
  const most = Math.max(0, ...places.map((place) => place.max));
  return (Array.isArray(values) ? values.slice(0, places.length) : []).filter((value): value is string => typeof value === "string" && value.length <= most && utf8(value).length <= most);
}

/**
 * Sections 6.2 and 9.2: each value that the entry names, as one retained
 * input under its domain and its digest: the kind `value`, or `definition`
 * for a value in the domain of a definition.
 */
export const valuesOf = (draft: Draft): Retained[] => (draft.values ?? []).map((value) =>
  (value.domain === DOMAINS.definition ? { kind: "definition", digest: value.digest, bytes: value.bytes } : { kind: "value", domain: value.domain, digest: value.digest, bytes: value.bytes }));

/** Asked for while rules are found in preparation, where nothing is written. The commit mints the real one. */
export const NO_INCARNATION = newIncarnation(new Uint8Array(16));

const unavailable = (reason: UnavailableReason) => ({ answer: "unavailable", reason }) as const;
const said = <A>(answer: A): Verdict<A> => ({ verdict: "answer", answer });

/**
 * Phase two of the authority port, in the commit (section 5.1): what the
 * read of this input's own turn holds, at this head and this reading. Null:
 * it cannot serve this commit. A port that fails here has decided nothing,
 * so the act is not judged.
 */
function heldBy(standing: Standing, view: StateView, clock: Reading): readonly Presented[] | null {
  try {
    const held = standing.held(view, clock);
    return Array.isArray(held) ? held as readonly Presented[] : null;
  } catch {
    return null;
  }
}

/** The entry that was written on what `held` answered, for a port that keeps its read. A port that fails here has changed nothing in the entry. */
function told(standing: Standing, sealed: Sealed): void {
  try {
    standing.sealed?.(sealed);
  } catch {
    // The entry stands. What the port then holds of this read is its own to judge at the next read.
  }
}

/**
 * The further observations of one input, before its turn and in its commit
 * (scope contract, revision 20, section 16.1, "The order before the turn"
 * and "In the commit"; source row I3-40). The reads are the authority
 * port's (`Further`). This counts the rounds, and contains a port that
 * fails or is late: such a read gave nothing.
 *
 * - **Before the turn.** The judge's own derivation, over the state at the
 *   head that the scope holds, says which subjects have no observation at
 *   hand. The scope reads one for each. For an outcome whose rows state
 *   `second` that is done twice, the second time with the observations of
 *   the first. It judges nothing, and its list is never trusted.
 * - **In the commit.** The judge derives the list again. Where it names a
 *   subject with no observation that passes the guards, the commit stops,
 *   nothing is written, the scope reads what is missing and the turn starts
 *   again, inside the bound on restarts (section 7.5). After that bound no
 *   more is read: each subject that is still missing cannot be had, and what
 *   follows is the row's.
 *
 * With no port for further observations, as under the production default,
 * nothing is read and nothing is at hand: each row that needs a subject is
 * absent.
 */
export class Observes {
  readonly #further: Further | null;
  readonly #bounds: Bounds;
  constructor(further: Further | null, bounds: Bounds) {
    this.#further = further;
    this.#bounds = bounds;
  }
  /** What the judge is given: the observations at hand, the bytes of each value beside one, and what the commit holds for the rows. */
  hand(): { observed?: readonly ObservationUse[]; values?: readonly string[]; observing?: Observing } {
    const further = this.#further;
    if (!further) return {};
    try {
      return { observed: further.observed(), values: further.values(), observing: further.observing() };
    } catch {
      return {};
    }
  }
  async #read(missing: readonly Needed[]): Promise<void> {
    const seconds = this.#bounds.fetchSeconds;
    // One read for each subject, in the order of the list, each within the fetch time limit of step 1.
    await within(() => this.#further!.read(missing, seconds), seconds * Math.max(1, missing.length));
  }
  /** Before the turn: `plan` is the judge's derivation at the head, with what is at hand. `steps`: 2 for an outcome, which may have a second step. */
  async before(plan: () => readonly Needed[] | undefined, steps = 1): Promise<void> {
    for (let step = 0; this.#further && step < steps; step++) {
      const missing = plan() ?? [];
      if (missing.length === 0) return;
      await this.#read(missing);
    }
  }
  /**
   * The turn of the input, started again while its commit stops for a subject that is missing. `stop` is called by the commit's
   * judge with the subjects that it lacks.
   */
  async turn<E>(run: (stop: (missing: readonly Needed[] | undefined) => void) => Promise<E>): Promise<E> {
    for (let round = 0; ; round++) {
      let missing: readonly Needed[] = [];
      const end = await run((needed) => { missing = needed ?? []; });
      if (missing.length === 0 || !this.#further) return end;
      await this.#read(missing);
      if (round + 1 >= this.#bounds.turnRestarts) {
        try { this.#further.close(); } catch { /* a port that fails here is asked nothing more */ }
      }
    }
  }
  /** The entry that the commit wrote, for a port that keeps a read for a later commit. A port that fails here has changed nothing in the entry. */
  sealed(sealed: Sealed): void {
    try {
      this.#further?.sealed(sealed);
    } catch {
      // The entry stands.
    }
  }
}

export class Scope {
  readonly #name: ScopeId | null;
  readonly #store: Store;
  readonly #ports: Ports;
  readonly #bounds: Bounds;
  readonly #turns: Turns;
  #pinned: Pinned | null = null;

  /** The one queue of this scope. Every writer's input waits in it: an act here, a delivery and a diagnosis from their own modules. */
  get turns(): Turns { return this.#turns; }

  /**
   * The further observations of one input of this scope (`Observes`). Under a definition whose data states no row, and with a
   * port that reads none, nothing is read.
   */
  observes(): Observes {
    const scope = this.#store.scope();
    const observing = this.pinned()?.definition?.observing === true;
    let further: Further | null = null;
    try {
      further = (scope && observing ? this.#ports.authority.further?.(scope.at) : null) ?? null;
    } catch {
      further = null;
    }
    return new Observes(further, this.#bounds);
  }

  /** `name`: the name of the object that holds this scope (section 2.3), or null when it has none. */
  constructor(name: ScopeId | null, store: Store, ports: Ports, bounds: Bounds) {
    this.#name = name;
    this.#store = store;
    this.#ports = ports;
    this.#bounds = bounds;
    this.#turns = new Turns(store, ports, bounds, () => { const pinned = this.pinned(); return pinned ? pinned.definition : undefined; }, () => this.owners(), () => this.pinned()?.platform ?? undefined);
  }

  /** True when this runtime has the code of every form that the definition uses, and each entry of it fits the bound on derived effects with that code. */
  #derives(definition: ValidDefinition): boolean {
    const capabilities = this.#ports.capabilities;
    return derivable(definition, capabilities) && counted(definition, capabilities, this.#bounds) === null;
  }

  /**
   * A declaration, validated as its canonical bytes parse, so a scope reads
   * one value before and after a restart. Null: it does not validate; or it
   * needs a capability record that this runtime has no code for (section
   * 6.11); or an entry of it, counted with the most that this runtime's
   * capability code declares, passes the bound on the derived effects of
   * one entry (section 6.1, "A declared maximum for everything that
   * derives"). Each way this runtime cannot pin it: `unsupported-definition`.
   */
  validate(bytes: string): ValidDefinition | null {
    try {
      const checked = validateDefinition(parseStrict(bytes), this.#bounds, RULE_PROFILES);
      return checked.ok && this.#derives(checked.definition) ? checked.definition : null;
    } catch {
      return null;
    }
  }

  /**
   * A platform definition, as this runtime's code supplies it through the
   * definitions port (section 6.1): its data, validated, and its rules.
   * Null: the runtime does not implement that version, or cannot run it
   * whole: `unsupported-definition`.
   *
   * The data is the platform package's, so it is validated with the
   * validator's platform option, which lets a name begin `platform:`. This
   * is the one use of that option, and no input reaches it: an input names
   * a platform definition and never supplies one. Bytes that an input, a
   * peer or this scope's storage gave are validated by `validate`, without
   * the option.
   *
   * The rule of section 6.1 is of the whole scope, for a platform
   * definition as for a capability form with no code: "a scope runs every
   * turn under its whole pinned definition, or none". The data holds a mark
   * at each place that is code, and the validator lists the marks. When one
   * mark of that list has no rule, the definition is null: no scope is
   * founded under it, and a scope that exists under it admits nothing (I3
   * deltas, entry EC4).
   */
  platform(named: PlatformDefinition): Supplied | null {
    const supplied = this.#ports.definitions.platform(named);
    if (!supplied) return null;
    try {
      const checked = validateDefinition(parseStrict(canonicalize(supplied.data)), this.#bounds, RULE_PROFILES, { platform: true });
      // Section 6.1: the name of a platform definition is its platform name without the version, which is what `under` compares.
      if (!checked.ok || checked.definition.declared.name !== platformName(named) || !this.#derives(checked.definition)) return null;
      // The marks are in the data, and the validator lists them: no table beside the data says which entries are code.
      // Section 6.1, "A mark with no rule: the whole scope": every mark needs a rule of that name, of the kind of the mark's place.
      if (!runnable(checked.definition, supplied.rules)) return null;
      // A scope whose every rule is supplied runs every row of its definition: the judges run each rule at the place of its mark.
      return { definition: checked.definition, platform: { named, rules: supplied.rules } };
    } catch {
      return null;
    }
  }

  /** The pinned definition, read from the genesis entry and the retained declaration, or from the runtime's code. Null before the genesis. */
  pinned(): Pinned | null {
    if (this.#pinned) return this.#pinned;
    const genesis = this.#store.stored(0);
    if (!genesis) return null;
    const input = (JSON.parse(genesis.bytes) as Entry).input as Extract<Entry["input"], { type: "genesis" }>;
    const named = input.seed.definition;
    // A platform definition is pinned by its name and version. No bytes are retained for it: it is read from the code again.
    const supplied = isPlatformDefinition(named) ? this.platform(named) : null;
    const kept = isDigest(named) ? this.#store.retained("definition", named) : null;
    const definition = supplied ? supplied.definition : kept ? this.validate(kept.bytes) : null;
    if (definition) this.#store.cover(definition.indexes);
    return (this.#pinned = { named, definition, platform: supplied?.platform ?? null });
  }

  /**
   * The rules of the owners of outside operations, for this scope: those of
   * the owners port, and, under a platform definition, the rules that its
   * data names in `outcomes` for the operations that it owns (section 6.1,
   * place 7). Undefined: no owner has rules here.
   */
  owners(): Owners | undefined {
    const pinned = this.pinned();
    return pinned?.definition ? ownersOf(pinned.definition, pinned.platform, this.#ports.owners) : (this.#ports.owners ?? undefined);
  }

  #receipt(seq: number, named: Digest | PlatformDefinition): Receipt {
    const kept = this.#store.stored(seq)!;
    return receiptOf({ entry: JSON.parse(kept.bytes) as Entry, hash: kept.hash }, named);
  }

  /**
   * Found a scope with no creator (section 7.1). Under the register's
   * platform definition it is the founding register, of the kind `register`,
   * which an `install` intent asks for. Under any other definition it is a
   * directory with no creator, by a `found` intent: the first delivery's
   * stand-in for a register, which stays until a repository's founding by
   * its register is whole (I3 plan, step 10). The seed is built from the
   * signed intent and the definition, and the genesis judge checks that its
   * digest is this object's name. The incarnation is minted in the commit.
   * The entry's sends are written to the outbox. `definition` is a
   * declaration, or the digest or platform name of one, which the
   * definitions port is asked for. A platform name pins the runtime's own
   * code, by that name: the seed holds the name, and no bytes are retained
   * for it.
   *
   * `definitions`: the declarations of the definitions this one names in
   * `create` sends, and of those they name in turn. Each that is named is
   * retained by its digest with the genesis (section 9.2), so that a child
   * can read it from this scope. One that is named and not supplied is not
   * retained, and a creation under it waits. One that is supplied and is not
   * a valid declaration is refused `unsupported-definition`.
   *
   * `beside`: the detached texts that the founding intent's fields name
   * (section 6.2). Each is checked against its digest and retained with the
   * genesis.
   *
   * No grant is asked for: who may found a repository is the authority
   * note's (section 7.1).
   */
  async found(founding: SignedIntent, definition: DeclaredDefinition | Digest | PlatformDefinition, definitions: readonly DeclaredDefinition[] = [], beside: Beside = {}): Promise<Founded> {
    const refused = (reason: Extract<Founded, { answer: "refused" }>["reason"]): Founded => ({ answer: "refused", reason });
    const name = this.#name;
    if (!name || !isSigned(founding)) return refused("source-unverified");
    const { random, resolver } = this.#ports;
    const bounds = this.#bounds;

    // Null: a platform definition, which has no bytes to retain.
    let bytes: string | null = null;
    let valid: ValidDefinition | null;
    let platform: PlatformRules | null = null;
    if (typeof definition === "string" && definition.startsWith("platform:")) {
      // Section 6.1: the founding names a platform definition, and the runtime's code supplies it. Nothing of it comes from the input.
      const supplied = isPlatformDefinition(definition) ? this.platform(definition) : null;
      // Null: a mark of the definition has no rule, so nothing is founded under it.
      if (!supplied) return refused("unsupported-definition");
      ({ definition: valid, platform } = supplied);
    } else {
      if (typeof definition === "string") {
        const read = await this.#ports.definitions.read(definition as Digest, null);
        if (!read.ok) return read.reason === "unavailable" ? unavailable("dependency-unavailable") : refused("unsupported-definition");
        bytes = read.bytes;
      } else {
        try {
          bytes = canonicalize(definition);
        } catch {
          return refused("unsupported-definition");
        }
      }
      valid = this.validate(bytes);
    }
    if (!valid || (typeof definition === "string" && isDigest(definition) && valid.digest !== definition)) return refused("unsupported-definition");
    // What the seed names: the platform name, or the digest of the declaration.
    const names: Digest | PlatformDefinition = bytes === null ? definition as PlatformDefinition : valid.digest;

    // Section 9.2: the declarations this scope retains for its children, from what the founder supplied.
    const supplied = new Map<Digest, string>();
    try {
      for (const declared of Array.isArray(definitions) ? definitions : []) supplied.set(definitionDigest(declared), canonicalize(declared));
    } catch {
      return refused("unsupported-definition");   // not values that have canonical bytes
    }
    const children = await namedBy(valid, (digest): Promise<DefinitionRead> => {
      const given = supplied.get(digest);
      return Promise.resolve(given === undefined ? { ok: false, reason: "absent" } : { ok: true, bytes: given });
    }, (text) => this.validate(text), bounds.namedDefinitions);
    if (!children.ok) return refused("unsupported-definition");

    const seed: Seed = { v: 1, kind: foundedKind(names), definition: names, creator: null, cause: intentDigest(founding.intent), ordinal: 0 };
    // Step 1: the facts the founding intent's fields name. A scope that has its genesis is asked again, a repeat: the judge answers it
    // from the genesis, or refuses it as another founding, and reads no fact. So none is fetched, and a fact that cannot be read
    // now does not hide the receipt (section 7.4, as for a delivery that the store has decided).
    const act = own(valid.declared.acts, valid.declared.genesis)!;
    const fields = readFields(act.fields, founding.intent.fields, bounds);
    // No scope exists yet, so no fact can name it: every fact a founding names is foreign.
    const named = fields.ok && !this.#store.scope() ? factsNamed(act.fields, fields.fields, null) : [];
    const facts = named.length > bounds.usesPerEntry ? null : await fetchFacts(resolver, bounds, named);
    if (!facts) return unavailable("dependency-unavailable");

    const texts = Received.beside(besideOf(beside).texts, act.fields, bounds);
    const asked = (inc: Founding["inc"]): Founding => ({ name, inc, seed, founding });
    const context = (clock: Reading) => ({ clock, bounds, facts, source: null, texts: texts.sizes, capabilities: this.#ports.capabilities ?? undefined, platform: platform ?? undefined });
    const pinned = (): Pinned => this.pinned() ?? { named: names, definition: valid, platform };
    const answer = (sealed: Sealed): Founded =>
      (sealed.entry.input.type === "genesis" && sealed.entry.input.decision === "applied" ? { answer: "accepted", receipt: receiptOf(sealed, pinned().named) } : refused("scope-refused"));

    const end = await this.#turns.run<Founded>({
      asks: (view, clock) => prepareRules(view, valid, { genesis: asked(NO_INCARNATION), context: { ...context(clock), prepared: [] } }),
      judge: (view, clock, prepared) => {
        // Section 2.2: the incarnation is minted in the transaction that writes the first entry.
        const judged = judgeGenesis(view, valid, asked(newIncarnation(random.bytes(16))), { ...context(clock), prepared });
        switch (judged.result) {
          case "write":
            // The item the genesis opens is indexed as this definition says, from its first write.
            this.#store.cover(valid.indexes);
            return {
              verdict: "write", draft: judged.draft, retain: [...(bytes === null ? [] : [{ kind: "definition", digest: valid.digest, bytes } as const]), ...children.retain, ...used(judged.draft, facts), ...texts.retain(valid, judged.draft)],
              sealed: answer, unfit: () => refused("bad-field"), full: () => refused("scope-full"),
            };
          case "repeat": {
            const kept = this.#store.stored(0)!;
            return said(answer({ entry: JSON.parse(kept.bytes) as Entry, hash: kept.hash }));
          }
          case "source-unverified": return said(refused("source-unverified"));
          case "refused": return said(refused(judged.reason));
          case "unavailable": return said<Founded>(unavailable(judged.reason));
          default: return said<Founded>(unavailable("unavailable"));
        }
      },
    }, valid);
    return end.end === "answer" ? end.answer : unavailable(end.end === "idle" ? "unavailable" : end.end);
  }

  /**
   * Submit an act (sections 4.2 and 5.2). Step 1 is here: the signature and
   * the shape, then the foreign entries that the fields and the presented
   * facts name, then what the authority port reads about the signer. The
   * turn does the rest. A refusal is a statement about the head it names and
   * writes nothing.
   *
   * `grants`: the grants presented beside the intent. The authority port's
   * read is given them, and the commit decides on what that read holds.
   *
   * `beside`: what travels beside the intent and is not signed (sections 6.2
   * and 6.4). Each detached text is checked against the digest that a field
   * names, and is retained with the entry. Each presented fact is fetched
   * like a fact field, and the entry records it. Each value is read only
   * for a place that the pinned platform data states, is matched by its
   * digest in that place's domain, and is retained with the entry under
   * that domain.
   *
   * Under a definition whose data states rows of `observes` (revision 20,
   * section 16.1; row I3-40), the scope reads one observation for each
   * subject of the act's rows before the turn, after the signer's, and the
   * commit derives the list again (`Observes`). Under any other, no further
   * observation is read: a rule that reads one is given none here.
   */
  async submit(signed: SignedIntent, grants: readonly Grant[], beside: Beside = {}): Promise<Answer> {
    const pinned = this.pinned();
    const scope = this.#store.scope();
    if (!pinned?.definition || !scope) return unavailable("unavailable");
    const { definition, named } = pinned;
    const platform = pinned.platform ?? undefined;
    const bounds = this.#bounds;
    const { resolver } = this.#ports;
    if (!isSigned(signed)) return { answer: "refused", reason: "bad-intent", judgedAt: scope.head };

    const intent = signed.intent;
    const act = own(definition.declared.acts, intent.kind);
    const fields = act ? readFields(act.fields, intent.fields, bounds) : null;
    // Section 4.2: a key on a sealed entry is answered from history, with the same receipt or a mismatch. That answer reads no
    // foreign entry, so none is fetched for it, and a lost dependency cannot hide it. The turn still drains first, and the
    // judge gives the answer; an intent with a key that is not accepted is new work and meets every check below.
    const known = this.#store.accepted(intent.actor, intent.idempotencyKey) !== null;
    // Section 6.2: a fact that names this scope is a local fact. It is not fetched: the judge reads this scope's own history.
    // Section 6.4: a presented fact is fetched before the turn like a fact field. One that the act does not declare is fetched for
    // nothing: the judge refuses the input.
    const presented = besideOf(beside).presented;
    const offered: Readonly<Record<string, unknown>> = isObject(presented) ? presented : {};
    const presents = presentedTypes(act?.presents);
    const shown = readFields(presents, offered, bounds);
    const wanted = !known && act && fields?.ok ? [...factsNamed(act.fields, fields.fields, scope.at), ...(shown.ok ? factsNamed(presents, shown.fields, scope.at) : [])].filter((fact, i, all) => all.findIndex((f) => f.hash === fact.hash) === i) : [];
    if (wanted.length > bounds.usesPerEntry) return { answer: "refused", reason: "bad-field", judgedAt: scope.head };
    // Section 6.2: the scope receives the bytes of each detached text with the intent, and the judge checks them against the field.
    const texts = Received.beside(besideOf(beside).texts, act?.fields, bounds);
    // Section 6.2, revision 19: a value beside the intent is read only for a place that the pinned data states, and only platform
    // data states one. So a scope under a declared definition reads no value and keeps none.
    const places = act && fields?.ok ? placesOf(act.fields, fields.fields) : [];
    const values = valuesBeside(besideOf(beside).values, places);
    const facts = await fetchFacts(resolver, bounds, wanted);
    if (!facts) return unavailable("dependency-unavailable");

    // Section 5.1, held authority, in two phases. Phase one is here, the last read before the turn: what the judgment of this
    // signer needs, read for this input and held by this call alone. It is never stored, and no other input's turn is given it.
    // An accepted key is answered from history at check 3, so nothing is read for it (section 5.2, step 1). A read that fails or
    // is late leaves nothing: the act is then not judged at check 9, `authority-unavailable`, and no earlier check is hidden.
    const given = (Array.isArray(grants) ? grants : []).filter(isGrant);
    const standing = known ? null : await this.#standing({ scope: scope.at, signed, action: act ? actionOf(act) : null, grants: given, window: windowOf(definition, scope.at.kind, intent.kind) });
    // Phase two is in the commit: what that read holds at the commit's head, on the commit's one reading. The judge is given the
    // answer and reads nothing.
    // Section 16.1, "The order before the turn": the rows of the act, under a definition whose data states rows. The observations
    // at hand are given to the judge as they are, and it makes the six guards with each row's window and use.
    const rows = known ? new Observes(null, bounds) : this.observes();
    const reading = (clock: Reading): Omit<JudgeContext, "prepared" | "grants"> => {
      const hand = rows.hand();
      const beside = [...(places.length > 0 ? values : []), ...(hand.values ?? [])];
      return {
        clock, bounds, facts, own: ownOf(this.#store), snapshot: snapshotsOf(this.#store), texts: texts.sizes, presented: offered, capabilities: this.#ports.capabilities ?? undefined, platform, membership: standing?.membership ?? null,
        ...(places.length > 0 || beside.length > 0 ? { values: beside } : {}), ...(hand.observed ? { observed: hand.observed } : {}), ...(hand.observing ? { observing: hand.observing } : {}),
      };
    };
    const context = (view: StateView, clock: Reading): Omit<JudgeContext, "prepared"> => ({ ...reading(clock), grants: standing === null ? null : heldBy(standing, view, clock) });
    // Parts 3 and 4, before the turn: the subject list at the head that the scope holds, and one read for each subject of it.
    await rows.before(() => actNeeds(this.#store, definition, signed, { ...reading(clockOf(this.#store, this.#ports.clock.read())), grants: null, prepared: [] }));

    const end = await rows.turn((stop) => this.#turns.run<Answer>({
      // The walk that finds the rules judges nothing (section 5.2, step 4), so what it is given of phase two decides nothing.
      asks: (view, clock) => prepareRules(view, definition, { act: signed, context: { ...context(view, clock), prepared: [] } }),
      judge: (view, clock, prepared) => {
        const judged: ActJudgment = judgeAct(view, definition, signed, { ...context(view, clock), prepared });
        switch (judged.result) {
          case "write": {
            const head = view.scope()!.head;
            return {
              // Section 6.2, "Retention": each value that the entry names is kept with it, in the entry's own transaction.
              verdict: "write", draft: judged.draft, retain: [...used(judged.draft, facts), ...texts.retain(definition, judged.draft), ...valuesOf(judged.draft)],
              // The entry now retains the grant that was judged. A port that keeps a read for a later commit learns here, inside the
              // transaction, which entry used it last (authority note, section 3.3, guard 3). A transaction that then does not commit
              // breaks the object, and what the port holds in memory is gone with it.
              sealed: (sealed) => {
                if (standing) told(standing, sealed);
                rows.sealed(sealed);
                return { answer: "accepted", receipt: receiptOf(sealed, named) };
              },
              // An entry over the size bound, or a grant that is not canonical values, is never written.
              unfit: (why) => ({ answer: "refused", reason: why === "size" ? "bad-field" : "unauthorized", judgedAt: head }),
              // Section 9.2: an act is refused when the duties it would admit, with those already admitted, have no room to settle.
              full: () => ({ answer: "refused", reason: "scope-full", judgedAt: head }),
            };
          }
          case "due": return { verdict: "stop" };
          case "accepted-before": return said<Answer>({ answer: "accepted", receipt: this.#receipt(judged.seq, named) });
          case "refused": return said<Answer>({ answer: "refused", reason: judged.reason, ...(judged.name === undefined ? {} : { name: judged.name }), judgedAt: judged.judgedAt });
          case "unavailable":
            // Section 16.1, "In the commit": the list names a subject with no observation at hand. The commit stops, the scope
            // reads what is missing, and the turn starts again.
            stop(judged.missing);
            return said<Answer>(unavailable(judged.reason));
          case "mismatch": return said<Answer>({ answer: "mismatch", reason: judged.reason });
        }
      },
    }));
    return end.end === "answer" ? end.answer : unavailable(end.end === "idle" ? "unavailable" : end.end);
  }

  /**
   * Ask for one step of a capability (section 5.5): the preparation path.
   * The request is the signed intent that the step prepares for, the
   * capability and the step. It goes through the same turn as every other
   * input, and what it writes is a `preparation` entry: the capability's
   * records and the operations that the step opens. Nothing outside the
   * service is caused here: the operations driver sends each attempt after
   * the entry is sealed.
   *
   * The answer has the forms of an act's. `accepted`: the entry is sealed,
   * now or by an earlier call with the same intent, capability and step. A
   * refusal is an answer and no entry. The act's idempotency key is not
   * consumed: the intent's own turn is still to come.
   *
   * With no code for the step, nothing is judged and nothing is written:
   * `unavailable`. That is a wiring whose capabilities port is null. The
   * production ports are no such wiring: they hold the code of `hold@1` and
   * `git-read@1` (`CAPABILITY_CODE`, in `ports.ts`).
   */
  async prepare(signed: SignedIntent, grants: readonly Grant[], capability: string, step: string): Promise<Answer> {
    const pinned = this.pinned();
    const scope = this.#store.scope();
    if (!pinned?.definition || !scope) return unavailable("unavailable");
    const { definition, named } = pinned;
    const bounds = this.#bounds;
    if (!isSigned(signed)) return { answer: "refused", reason: "bad-intent", judgedAt: scope.head };
    const steps = stepsOf(this.#ports.capabilities);
    const asked = { signed, capability, step };

    // Section 5.1, held authority, phase one: one read for this request, before the turn, as for an act. The action and the window
    // are the ones that the capability names for the step: ten seconds for a step that a write outside the service follows, and the
    // ordinary window for one that writes nothing outside (section 6.11; authority note, section 5.7, the table of steps). They are
    // read from the pinned definition and from an item's type, which never change. With no action nothing is read, and the judge
    // answers.
    let needs: { action: string; window: Window } | null = null;
    try {
      needs = steps && typeof capability === "string" && typeof step === "string" && steps.implements(capability as CapabilityName, step)
        ? steps.grant(capability as CapabilityName, step, { view: this.#store, definition, scope, self: scope.head.seq + 1, intent: signed.intent, digest: intentDigest(signed.intent), clock: { reading: scope.time, behind: false, asOf: scope.time } })
        : null;
    } catch {
      needs = null;   // a request that the rules cannot read names no action
    }
    const given = (Array.isArray(grants) ? grants : []).filter(isGrant);
    const standing = needs === null ? null : await this.#standing({ scope: scope.at, signed, action: needs.action, grants: given, window: needs.window });
    // Phase two, in the commit: the decision on the grant. It is the grant guard of `derive/src/grant.ts`, which the port's second
    // phase runs on the observation that the read obtained, at the commit's head and on the commit's one reading (section 16.1, "The
    // guards, in the commit"). The read was made for one action and one window. A commit that asks another is not judged on it.
    const granted = (view: StateView, clock: Reading): GrantDecision => (wanted) => {
      if (standing === null || needs === null || wanted.action !== needs.action || wanted.window.seconds !== needs.window.seconds || wanted.window.once !== needs.window.once) return { result: "unavailable" };
      const held = heldBy(standing, view, clock);
      if (held === null) return { result: "unavailable" };
      const found = held.find(({ grant, current }) => current && grant.key === wanted.key && grant.actions.includes(wanted.action));
      return found ? { result: "granted", grant: found.grant } : { result: "refused" };
    };

    const end = await this.#turns.run<Answer>({
      asks: () => [],
      judge: (view, clock) => {
        const judged = judgePreparation(view, definition, asked, { clock, bounds, steps, own: ownOf(this.#store), granted: granted(view, clock), membership: standing?.membership ?? null });
        switch (judged.result) {
          case "write": {
            const head = view.scope()!.head;
            return {
              verdict: "write", draft: judged.draft, retain: [],
              // The entry retains the grant that was judged, and the port learns which entry used its read, as for an act.
              sealed: (sealed) => {
                if (standing) told(standing, sealed);
                return { answer: "accepted", receipt: receiptOf(sealed, named) };
              },
              unfit: (why) => ({ answer: "refused", reason: why === "size" ? "bad-field" : "unauthorized", judgedAt: head }),
              // Section 17.3: a preparation is new work. It is admitted only with the room of what it reserves.
              full: () => ({ answer: "refused", reason: "scope-full", judgedAt: head }),
            };
          }
          case "due": return { verdict: "stop" };
          case "repeat": return said<Answer>({ answer: "accepted", receipt: this.#receipt(judged.seq, named) });
          case "refused": return said<Answer>({ answer: "refused", reason: judged.reason, ...(judged.name === undefined ? {} : { name: judged.name }), judgedAt: judged.judgedAt });
          case "unavailable": return said<Answer>(unavailable(judged.reason));
        }
      },
    });
    return end.end === "answer" ? end.answer : unavailable(end.end === "idle" ? "unavailable" : end.end);
  }

  /**
   * Phase one of the authority port (section 5.1; authority note, section
   * 3.3): one read for one act, within the fetch time limit of step 1. Null:
   * nothing was read. The port failed, was late, or gave no answer.
   */
  async #standing(asked: Asked): Promise<Standing | null> {
    const seconds = this.#bounds.fetchSeconds;
    const read = await within(() => this.#ports.authority.read(asked, seconds), seconds);
    return read === LATE || !isObject(read) || typeof read.held !== "function" ? null : read;
  }

  /**
   * Settlement (section 4.2): the receipt of an accepted act, for a caller
   * who presents its exact signed intent. It reads the history. It admits
   * nothing, judges no grant and no time, and starts no turn.
   */
  settle(signed: SignedIntent): Settlement {
    const pinned = this.pinned();
    const scope = this.#store.scope();
    if (!pinned || !scope || !isSigned(signed)) return { ok: false, reason: "not-found" };
    const { to, actor, idempotencyKey } = signed.intent;
    if (to?.scope !== scope.at.scope) return { ok: false, reason: "not-found" };
    if (to.inc !== scope.at.inc) return { ok: false, reason: "wrong-incarnation" };
    const accepted = this.#store.accepted(actor, idempotencyKey);
    if (!accepted || accepted.intent !== intentDigest(signed.intent)) return { ok: false, reason: "not-found" };
    return { ok: true, at: scope.head, value: this.#receipt(accepted.seq, pinned.named), complete: true };
  }

  /** An alarm's turn (section 5.2): no input waits, and the drain runs alone under the same budget. It has no answer. */
  async alarm(): Promise<void> {
    const definition = this.pinned()?.definition;
    if (definition) await this.#turns.run(null);
  }

  /**
   * Write a checkpoint through the head (section 9.2). It judges no time, so
   * it may be written clamped (section 5.3). Written with no other duty
   * pending, it is the closing checkpoint and uses the entry reserved for
   * one. Written beside a pending duty it is new work and needs a free
   * entry (derive's `fits`); without one it is `unavailable` and nothing is
   * written.
   * Reading the whole state is the one read that is not bounded.
   */
  async checkpoint(): Promise<Checkpointed> {
    const definition = this.pinned()?.definition;
    if (!definition) return unavailable("unavailable");
    const bounds = this.#bounds;
    const end = await this.#turns.run<Checkpointed>({
      asks: () => [],
      judge: (view, clock) => {
        const judged = judgeCheckpoint(view, definition, checkpointOf(view), { clock, bounds });
        switch (judged.result) {
          case "write":
            if (view.scope()!.head.seq + 1 >= bounds.scopeEntries) return said<Checkpointed>(unavailable("unavailable"));
            return { verdict: "write", draft: judged.draft, retain: [], sealed: ({ entry, hash }) => ({ answer: "written", fact: { at: entry.at, seq: entry.seq, hash } }), unfit: () => unavailable("unavailable"), full: () => unavailable("unavailable") };
          case "due": return { verdict: "stop" };
          case "refused": return said<Checkpointed>({ answer: "refused", reason: judged.reason });
          case "unavailable": return said<Checkpointed>(unavailable(judged.reason));
          default: return said<Checkpointed>(unavailable("unavailable"));
        }
      },
    });
    return end.end === "answer" ? end.answer : unavailable(end.end === "idle" ? "unavailable" : end.end);
  }
}
