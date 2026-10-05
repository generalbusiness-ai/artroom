/**
 * Receiving (scope contract, sections 7.2 and 7.4): one delivered message,
 * from the source checks to the entry that records it and the answer
 * transport gives the sender.
 *
 * Before anything is recorded, the receiver reads the source entry from the
 * source scope through the resolver port, and checks it against the hash in
 * the envelope's fact. Derive's judge then checks that the entry holds that
 * send, at that ordinal, to that address, with that message. The judgment
 * runs in the scope's turn like any other input: the same queue, drain,
 * snapshot, commit and budgets. An empty store that a `create` reaches
 * writes its genesis the same way, and mints its incarnation in that commit.
 *
 * The source entry's bytes are retained with the entry that used it, and the
 * message is inside that entry (section 9.2).
 */

import type { Bounds, Entry, Incarnation, ScopeId, Seed, UnavailableReason } from "@generalbusiness/artroom-contract";
import { canonicalize, isDigest, newIncarnation } from "@generalbusiness/artroom-bytes";
import { creationFields, factsNamed, isEntryOf, isFactRef, isLocalId, isObject, isScopeRef, judgeDelivery, judgeGenesis, prepareRules, readFields } from "@generalbusiness/artroom-derive";
import type { Clock as Reading, Creation, Delivered, DeliveryContext, Fetched, Judgment, StateView, ValidDefinition } from "@generalbusiness/artroom-derive";
import { NO_INCARNATION, retainedFacts, used, type Scope } from "./core.ts";
import type { Delivery, Ports } from "./ports.ts";
import type { Retained, Store } from "./store.ts";
import { LATE, fetchFacts, within, type Verdict } from "./turn.ts";

const retry = (reason: UnavailableReason | "scope-full"): Delivery => ({ answer: "retry", reason });
const UNVERIFIED: Delivery = { answer: "source-unverified" };
const said = (answer: Delivery): Verdict<Delivery> => ({ verdict: "answer", answer });

export class Deliveries {
  readonly #name: ScopeId | null;
  readonly #scope: Scope;
  readonly #store: Store;
  readonly #ports: Pick<Ports, "resolver" | "definitions" | "random">;
  readonly #bounds: Bounds;

  constructor(name: ScopeId | null, scope: Scope, store: Store, ports: Pick<Ports, "resolver" | "definitions" | "random">, bounds: Bounds) {
    this.#name = name;
    this.#scope = scope;
    this.#store = store;
    this.#ports = ports;
    this.#bounds = bounds;
  }

  /**
   * Section 7.2: the definition an empty store runs its genesis under, by the
   * digest its seed names, with the declaration's bytes. The definitions
   * port supplies them.
   */
  async #declared(seed: Seed): Promise<{ valid: ValidDefinition; bytes: string } | null> {
    if (!isObject(seed) || !isDigest(seed.definition)) return null;
    const read = await this.#ports.definitions.read(seed.definition);
    const valid = read.ok ? this.#scope.validate(read.bytes) : null;
    return read.ok && valid?.digest === seed.definition ? { valid, bytes: read.bytes } : null;
  }

  async deliver(delivered: Delivered): Promise<Delivery> {
    const name = this.#name;
    const bounds = this.#bounds;
    const store = this.#store;
    if (!name || !isObject(delivered) || !isFactRef(delivered.from) || !isLocalId(delivered.n) || !isObject(delivered.message)) return UNVERIFIED;
    const { from, message } = delivered;

    // Section 7.4, "What the receiver trusts at run time". The source scope is reached by its scope ID in the one namespace, the
    // answer's incarnation is checked against the envelope, and the entry's bytes against the hash. Nothing has been recorded.
    const read = await within(() => this.#ports.resolver.read(from, bounds.fetchSeconds), bounds.fetchSeconds);
    if (read === LATE || read === null) return retry("dependency-unavailable");
    if (!("entry" in read) || !isEntryOf(read.entry, from)) return UNVERIFIED;
    const source: Fetched = { fact: from, entry: read.entry, under: read.under };

    // An empty store: only a creation reaches it, and it needs the definition its seed names.
    const creates = message.class === "request" && message.type === "create" && !isScopeRef(delivered.to);
    const founding = this.#scope.pinned() || !creates ? null : await this.#declared(delivered.to as Seed);
    const pinned = this.#scope.pinned();
    if (pinned ? !pinned.definition : !founding) return retry("unavailable");

    // What the judgment reads beside the source entry. For a genesis: the foreign entries its fields name (section 5.2, step 1).
    // For a result: this scope's own entry that sent the request, and the foreign entries that entry read, from its retained inputs.
    let facts: Fetched[] = [];
    let origin: Entry | null = null;
    if (!pinned && founding) {
      const act = founding.valid.declared.acts[founding.valid.declared.genesis]!;
      const given = creationFields(message.class === "request" ? message : null, from);
      const fields = given ? readFields(act.fields, given, bounds) : null;
      const named = fields?.ok ? factsNamed(act.fields, fields.fields) : [];
      const fetched = named.length > bounds.usesPerEntry ? null : await fetchFacts(this.#ports.resolver, bounds, named);
      if (!fetched) return retry("dependency-unavailable");
      facts = fetched;
    } else if (message.class === "result" && isObject(message.of) && isFactRef(message.of.from)) {
      const kept = store.stored(message.of.from.seq);
      origin = kept ? JSON.parse(kept.bytes) as Entry : null;
      facts = origin ? retainedFacts(store, origin) : [];
    }

    const context = (clock: Reading): Omit<DeliveryContext, "prepared"> => ({ clock, bounds, facts, source: { entry: source.entry, under: source.under }, origin });
    /** The definition a section of the turn runs under: the pinned one, or before the genesis the one the seed names. */
    const definition = (): ValidDefinition => this.#scope.pinned()?.definition ?? founding!.valid;
    /** A `create` goes to the genesis judge, which answers a repeat from the genesis when the scope exists. */
    const judge = (view: StateView, inc: Incarnation, reading: DeliveryContext): Judgment =>
      (creates ? judgeGenesis(view, definition(), { name, inc, to: delivered.to as Seed, from, n: delivered.n, message } as Creation, reading) : judgeDelivery(view, definition(), delivered, reading));

    const end = await this.#scope.turns.run<Delivery>({
      asks: (view, clock) => {
        const reading = { ...context(clock), prepared: [] };
        return creates ? prepareRules(view, definition(), { genesis: { name, inc: NO_INCARNATION, to: delivered.to as Seed, from, n: delivered.n, message } as Creation, context: reading }) : prepareRules(view, definition(), { delivery: delivered, context: reading });
      },
      judge: (view, clock, prepared) => {
        const genesis = view.scope() === null;
        // Section 2.2: the incarnation is minted in the transaction that writes the first entry.
        const judged = judge(view, genesis ? newIncarnation(this.#ports.random.bytes(16)) : NO_INCARNATION, { ...context(clock), prepared });
        switch (judged.result) {
          case "write": {
            // Section 9.2: an entry that settles nothing is written only while the scope has room; one that settles is counted for.
            if ((view.scope()?.head.seq ?? -1) + 1 >= bounds.scopeEntries) return said(retry("scope-full"));
            const retain: Retained[] = used(judged.draft, [source, ...facts]);
            if (genesis && founding) {
              store.cover(founding.valid.indexes);
              retain.push({ kind: "definition", digest: founding.valid.digest, bytes: canonicalize(JSON.parse(founding.bytes)) });
            }
            return {
              verdict: "write", draft: judged.draft, retain,
              sealed: ({ entry, hash }) => ({ answer: "recorded", fact: { at: entry.at, seq: entry.seq, hash } }),
              // An entry that cannot be written now is not a decision: the sender keeps the duty.
              unfit: () => retry("unavailable"), full: () => retry("scope-full"),
            };
          }
          // A first decision and a repeat are answered alike: with the fact of the entry that recorded the message.
          case "repeat": {
            const kept = store.stored(judged.seq)!;
            return said({ answer: "recorded", fact: { at: view.scope()!.at, seq: kept.seq, hash: kept.hash } });
          }
          case "due": return { verdict: "stop" };
          case "routing": return said({ answer: "routing", reason: judged.reason });
          case "source-unverified": return said(UNVERIFIED);
          case "unavailable": return said(retry(judged.reason));
          // The resolver of the name answers for a scope whose genesis was refused before this judgment is reached.
          case "refused": return said(retry("unavailable"));
        }
      },
    }, founding?.valid);
    return end.end === "answer" ? end.answer : retry(end.end === "idle" ? "unavailable" : end.end);
  }
}
