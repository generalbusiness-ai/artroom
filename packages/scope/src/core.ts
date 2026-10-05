/**
 * One scope's surface (scope contract, sections 4.2, 7.1 and 9.2): found a
 * directory, submit an act, settle an accepted act, run an alarm's turn,
 * and write a checkpoint. Each is a waiting input handed to the turn, or a
 * read of the history. The judges are derive's; this file builds what they
 * are given and turns what they answer into the caller's answer.
 */

import type { Answer, Bounds, DeclaredDefinition, Digest, DutyId, Entry, FactRef, Grant, PlatformDefinition, Receipt, RefusalReason, DeliveryRefusal, ScopeId, Seed, Settlement, SignedIntent, UnavailableReason } from "@generalbusiness/artroom-contract";
import { canonicalize, intentDigest, isDigest, newIncarnation, parseStrict } from "@generalbusiness/artroom-bytes";
import { checkpointOf, factsNamed, isFactRef, isMemberRef, isObject, judgeAct, judgeCheckpoint, judgeGenesis, prepareRules, readFields, timeMs, validateDefinition } from "@generalbusiness/artroom-derive";
import type { ActJudgment, Clock as Reading, Draft, Fetched, Founding, JudgeContext, ValidDefinition } from "@generalbusiness/artroom-derive";
import { RULE_PROFILES } from "@generalbusiness/artroom-derive/rule";
import type { Ports } from "./ports.ts";
import type { Retained, Sealed, Store } from "./store.ts";
import { Turns, fetchFacts, isSigned, type Verdict } from "./turn.ts";

/**
 * How a founding is answered (section 7.1). `accepted`: the genesis entry is
 * sealed, now or by an earlier call with the same intent, and its act
 * applied. `scope-refused`: the genesis entry is sealed and its act refused;
 * the scope is terminal. Every other refusal wrote nothing.
 */
export type Founded =
  | { answer: "accepted"; receipt: Receipt }
  | { answer: "refused"; reason: RefusalReason | DeliveryRefusal | "unsupported-definition" }
  | { answer: "unavailable"; reason: UnavailableReason };

/** How a checkpoint is answered (section 9.2). It has no caller outside the scope. */
export type Checkpointed =
  | { answer: "written"; fact: FactRef }
  | { answer: "refused"; reason: RefusalReason }
  | { answer: "unavailable"; reason: UnavailableReason };

/** The definition a scope pins: what its seed names, and the validated declaration. Null: this runtime cannot run it. */
export interface Pinned { named: Digest | PlatformDefinition; definition: ValidDefinition | null }

/** The receipt of a sealed entry: a view, built after sealing (section 4.1). */
export function receiptOf({ entry, hash }: Sealed, definition: Digest | PlatformDefinition): Receipt {
  const input = entry.input;
  const intent = input.type === "act" ? intentDigest(input.signed.intent) : input.type === "genesis" && input.founding ? intentDigest(input.founding.intent) : null;
  return { fact: { at: entry.at, seq: entry.seq, hash }, definition, intent, effects: entry.effects, sends: entry.sends.map((s): DutyId => `${entry.seq}.${s.n}`), epoch: 0 };
}

/** The shape of a grant, as far as the judge and the entry read it. `within` and `fresh` are the authority note's. */
const isGrant = (g: unknown): g is Grant =>
  isObject(g) && isFactRef(g["issued"]) && isMemberRef(g["subject"]) && typeof g["key"] === "string" && (g["principal"] === null || isMemberRef(g["principal"]))
  && Array.isArray(g["actions"]) && g["actions"].every((a) => typeof a === "string") && (g["notAfter"] === null || timeMs(g["notAfter"]) !== null);

/** Section 9.2: the bytes of each foreign entry the draft's `uses` name, under its content digest. */
function used(draft: Draft, facts: readonly Fetched[]): Retained[] {
  return draft.uses.map((use) => {
    const read = facts.find((f) => f.fact.hash === use.fact.hash);
    if (!read) throw new Error(`the foreign entry ${use.fact.hash} was not fetched before the turn`);
    return { kind: "entry", digest: use.content, bytes: canonicalize(read.entry), under: read.under };
  });
}

/** Asked for while rules are found in preparation, where nothing is written. The commit mints the real one. */
const NO_INCARNATION = newIncarnation(new Uint8Array(16));

const unavailable = (reason: UnavailableReason) => ({ answer: "unavailable", reason }) as const;
const said = <A>(answer: A): Verdict<A> => ({ verdict: "answer", answer });

export class Scope {
  readonly #name: ScopeId | null;
  readonly #store: Store;
  readonly #ports: Ports;
  readonly #bounds: Bounds;
  readonly #turns: Turns;
  #pinned: Pinned | null = null;

  /** `name`: the name of the object that holds this scope (section 2.3), or null when it has none. */
  constructor(name: ScopeId | null, store: Store, ports: Ports, bounds: Bounds) {
    this.#name = name;
    this.#store = store;
    this.#ports = ports;
    this.#bounds = bounds;
    this.#turns = new Turns(store, ports, bounds, () => { const pinned = this.pinned(); return pinned ? pinned.definition : undefined; });
  }

  /** A declaration, validated as its canonical bytes parse, so a scope reads one value before and after a restart. */
  #validate(bytes: string): ValidDefinition | null {
    try {
      const checked = validateDefinition(parseStrict(bytes), this.#bounds, RULE_PROFILES);
      return checked.ok ? checked.definition : null;
    } catch {
      return null;
    }
  }

  /** The pinned definition, read from the genesis entry and the retained declaration. Null before the genesis. */
  pinned(): Pinned | null {
    if (this.#pinned) return this.#pinned;
    const genesis = this.#store.stored(0);
    if (!genesis) return null;
    const input = (JSON.parse(genesis.bytes) as Entry).input as Extract<Entry["input"], { type: "genesis" }>;
    const named = input.seed.definition;
    const kept = isDigest(named) ? this.#store.retained("definition", named) : null;
    const definition = kept ? this.#validate(kept.bytes) : null;
    if (definition) this.#store.cover(definition.indexes);
    return (this.#pinned = { named, definition });
  }

  #receipt(seq: number, named: Digest | PlatformDefinition): Receipt {
    const kept = this.#store.stored(seq)!;
    return receiptOf({ entry: JSON.parse(kept.bytes) as Entry, hash: kept.hash }, named);
  }

  /**
   * Found a repository's directory (section 7.1). The seed is built from the
   * signed intent and the definition, and the genesis judge checks that its
   * digest is this object's name. The incarnation is minted in the commit.
   * The entry's sends are written to the outbox. `definition` is a
   * declaration, or the digest or platform name of one, which the
   * definitions port is asked for.
   *
   * No grant is asked for: who may found a repository is the authority
   * note's (section 7.1).
   */
  async found(founding: SignedIntent, definition: DeclaredDefinition | Digest | PlatformDefinition): Promise<Founded> {
    const refused = (reason: Extract<Founded, { answer: "refused" }>["reason"]): Founded => ({ answer: "refused", reason });
    const name = this.#name;
    if (!name || !isSigned(founding)) return refused("source-unverified");
    const { random, definitions, resolver } = this.#ports;
    const bounds = this.#bounds;

    let bytes: string;
    if (typeof definition === "string") {
      const read = await definitions.read(definition);
      if (!read.ok) return read.reason === "unavailable" ? unavailable("dependency-unavailable") : refused("unsupported-definition");
      bytes = read.bytes;
    } else {
      try {
        bytes = canonicalize(definition);
      } catch {
        return refused("unsupported-definition");
      }
    }
    const valid = this.#validate(bytes);
    if (!valid || (typeof definition === "string" && isDigest(definition) && valid.digest !== definition)) return refused("unsupported-definition");

    const seed: Seed = { v: 1, kind: "directory", definition: valid.digest, creator: null, cause: intentDigest(founding.intent), ordinal: 0 };
    // Step 1: the facts the founding intent's fields name.
    const act = valid.declared.acts[valid.declared.genesis]!;
    const fields = readFields(act.fields, founding.intent.fields, bounds);
    const named = fields.ok ? factsNamed(act.fields, fields.fields) : [];
    const facts = named.length > bounds.usesPerEntry ? null : await fetchFacts(resolver, bounds, named);
    if (!facts) return unavailable("dependency-unavailable");

    const asked = (inc: Founding["inc"]): Founding => ({ name, inc, seed, founding });
    const context = (clock: Reading) => ({ clock, bounds, facts, source: null });
    const pinned = (): Pinned => this.pinned() ?? { named: valid.digest, definition: valid };
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
            return { verdict: "write", draft: judged.draft, retain: [{ kind: "definition", digest: valid.digest, bytes }, ...used(judged.draft, facts)], sealed: answer, unfit: () => refused("bad-field"), full: () => refused("scope-full") };
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
   * the shape, then the foreign entries the fields name. The turn does the
   * rest. A refusal is a statement about the head it names and writes
   * nothing.
   */
  async submit(signed: SignedIntent, grants: readonly Grant[]): Promise<Answer> {
    const pinned = this.pinned();
    const scope = this.#store.scope();
    if (!pinned?.definition || !scope) return unavailable("unavailable");
    const { definition, named } = pinned;
    const bounds = this.#bounds;
    const { authority, resolver } = this.#ports;
    if (!isSigned(signed)) return { answer: "refused", reason: "bad-intent", judgedAt: scope.head };

    const intent = signed.intent;
    const act = Object.hasOwn(definition.declared.acts, intent.kind) ? definition.declared.acts[intent.kind] : undefined;
    const fields = act ? readFields(act.fields, intent.fields, bounds) : null;
    // Section 4.2: a key on a sealed entry is answered from history, with the same receipt or a mismatch. That answer reads no
    // foreign entry, so none is fetched for it, and a lost dependency cannot hide it. The turn still drains first, and the
    // judge gives the answer; an intent with a key that is not accepted is new work and meets every check below.
    const known = this.#store.accepted(intent.actor, intent.idempotencyKey) !== null;
    const wanted = !known && act && fields?.ok ? factsNamed(act.fields, fields.fields) : [];
    if (wanted.length > bounds.usesPerEntry) return { answer: "refused", reason: "bad-field", judgedAt: scope.head };
    const facts = await fetchFacts(resolver, bounds, wanted);
    if (!facts) return unavailable("dependency-unavailable");

    // Section 5.1: held authority is read with the clock. The verdict on each grant is asked for on the reading it is used with.
    const presented = (Array.isArray(grants) ? grants : []).filter(isGrant);
    const context = (clock: Reading): Omit<JudgeContext, "prepared"> =>
      ({ clock, bounds, facts, grants: presented.map((grant) => ({ grant, current: authority.current(grant, scope.at, clock.reading) })) });

    const end = await this.#turns.run<Answer>({
      asks: (view, clock) => prepareRules(view, definition, { act: signed, context: { ...context(clock), prepared: [] } }),
      judge: (view, clock, prepared) => {
        const judged: ActJudgment = judgeAct(view, definition, signed, { ...context(clock), prepared });
        switch (judged.result) {
          case "write": {
            const head = view.scope()!.head;
            return {
              verdict: "write", draft: judged.draft, retain: used(judged.draft, facts),
              sealed: (sealed) => ({ answer: "accepted", receipt: receiptOf(sealed, named) }),
              // An entry over the size bound, or a grant that is not canonical values, is never written.
              unfit: (why) => ({ answer: "refused", reason: why === "size" ? "bad-field" : "unauthorized", judgedAt: head }),
              // Section 9.2: an act is refused when the duties it would admit, with those already admitted, have no room to settle.
              full: () => ({ answer: "refused", reason: "scope-full", judgedAt: head }),
            };
          }
          case "due": return { verdict: "stop" };
          case "accepted-before": return said<Answer>({ answer: "accepted", receipt: this.#receipt(judged.seq, named) });
          case "refused": return said<Answer>({ answer: "refused", reason: judged.reason, judgedAt: judged.judgedAt });
          case "unavailable": return said<Answer>(unavailable(judged.reason));
          case "mismatch": return said<Answer>({ answer: "mismatch", reason: judged.reason });
        }
      },
    });
    return end.end === "answer" ? end.answer : unavailable(end.end === "idle" ? "unavailable" : end.end);
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
   * it may be written clamped (section 5.3), and it may use the reserve.
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
