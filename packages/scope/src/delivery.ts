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
 *
 * A message carries a detached text as its digest, and the bytes travel
 * beside it (section 6.2). The receiver reads them from the sender through
 * the texts port before the turn, checks them against the digest, and
 * retains them with the entry that records the message. While a text
 * cannot be read the delivery is not decided, and the sender keeps the
 * duty.
 */

import type { Bounds, Digest, Entry, FactRef, Incarnation, ScopeId, Seed, UnavailableReason } from "@generalbusiness/artroom-contract";
import { canonicalize, isDigest, newIncarnation, parseStrict } from "@generalbusiness/artroom-bytes";
import { creationFields, factsNamed, isEntryOf, isFactRef, isLocalId, isObject, isScopeRef, judgeDelivery, judgeGenesis, messageFacts, messageTexts, own, prepareRules, readFields, textsNamed } from "@generalbusiness/artroom-derive";
import type { Clock as Reading, Creation, Delivered, DeliveryContext, Fetched, Judgment, StateView, ValidDefinition } from "@generalbusiness/artroom-derive";
import { NO_INCARNATION, Received, ownOf, retainedFacts, used, type Scope } from "./core.ts";
import { namedBy } from "./definitions.ts";
import type { DefinitionRead, Delivery, Ports } from "./ports.ts";
import type { Retained, Store } from "./store.ts";
import { LATE, fetchFacts, within, type Verdict } from "./turn.ts";

const retry = (reason: UnavailableReason | "scope-full" | "unsupported-definition"): Delivery => ({ answer: "retry", reason });
const UNVERIFIED: Delivery = { answer: "source-unverified" };
const said = (answer: Delivery): Verdict<Delivery> => ({ verdict: "answer", answer });

export class Deliveries {
  readonly #name: ScopeId | null;
  readonly #scope: Scope;
  readonly #store: Store;
  readonly #ports: Pick<Ports, "resolver" | "definitions" | "texts" | "random" | "capabilities">;
  readonly #bounds: Bounds;

  constructor(name: ScopeId | null, scope: Scope, store: Store, ports: Pick<Ports, "resolver" | "definitions" | "texts" | "random" | "capabilities">, bounds: Bounds) {
    this.#name = name;
    this.#scope = scope;
    this.#store = store;
    this.#ports = ports;
    this.#bounds = bounds;
  }

  /**
   * Sections 5.1, 7.2 and 9.2: the definition an empty store runs its genesis
   * under. Its declaration is immutable bytes named by the digest in the
   * seed, so it is read before the turn: from the creator the seed names,
   * which retains it, through the definitions port. The digest is checked
   * here. With it come the declarations this scope will retain for its own
   * children, read from the same creator.
   *
   * `dependency-unavailable`: the creator cannot be read now, or does not
   * hold the bytes. `unsupported-definition`: the seed names a platform
   * definition, which no code supplies yet, or the bytes are not a valid
   * declaration with that digest. Either way nothing is recorded.
   */
  async #declared(seed: Seed): Promise<{ valid: ValidDefinition; bytes: string; children: Retained[] } | "dependency-unavailable" | "unsupported-definition"> {
    if (!isObject(seed) || !isDigest(seed.definition) || !isScopeRef(seed.creator)) return "unsupported-definition";
    const { definitions } = this.#ports;
    const creator = seed.creator;
    const seconds = this.#bounds.fetchSeconds;
    const from = async (digest: typeof seed.definition): Promise<DefinitionRead> => {
      const read = await within(() => definitions.read(digest, creator), seconds);
      return read === LATE ? { ok: false, reason: "unavailable" } : read;
    };
    const read = await from(seed.definition);
    if (!read.ok) return read.reason === "unsupported-definition" ? "unsupported-definition" : "dependency-unavailable";
    const valid = this.#scope.validate(read.bytes);
    if (valid?.digest !== seed.definition) return "unsupported-definition";
    const children = await namedBy(valid, from, (text) => this.#scope.validate(text), this.#bounds.namedDefinitions);
    if (!children.ok) return children.reason === "unavailable" ? "dependency-unavailable" : "unsupported-definition";
    return { valid, bytes: read.bytes, children: children.retain };
  }

  /**
   * Section 6.2: the detached texts that a message names, each at hand
   * before the turn. One that this scope already retains is read from its
   * own retained inputs. Any other is read from the sender, within the fetch
   * time limit, and checked against its digest. Null: one could not be read,
   * or the sender does not hold it, or what it sent is not that text. The
   * delivery is then not decided.
   */
  async #texts(from: FactRef, named: readonly Digest[]): Promise<Received | null> {
    const received = new Received();
    for (const digest of named) {
      const kept = this.#store.retained("text", digest);
      const read = kept ? null : await within(() => this.#ports.texts.read(from, digest), this.#bounds.fetchSeconds);
      if (read === LATE || (read && !read.ok)) return null;
      const text: unknown = kept ? parseStrict(kept.bytes) : read!.text;
      if (typeof text !== "string" || text.length > this.#bounds.textBytes || received.add(text) !== digest) return null;
    }
    return received;
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
    const declared = this.#scope.pinned() || !creates ? null : await this.#declared(delivered.to as Seed);
    if (typeof declared === "string") return retry(declared);
    const founding = declared;
    const pinned = this.#scope.pinned();
    if (pinned ? !pinned.definition : !founding) return retry("unavailable");

    // What the judgment reads beside the source entry. For a genesis: the foreign entries its fields name (section 5.2, step 1).
    // For a result: this scope's own entry that sent the request, and the foreign entries that entry read, from its retained inputs.
    // For a request or an advisory that a handler receives: the foreign entries that the message's declared fields name.
    let facts: Fetched[] = [];
    let origin: Entry | null = null;
    let carried: Digest[] = [];
    // Section 7.4, the order of a delivery's checks: a repeat is found after the source entry is read, and before the checks of the
    // message's class. A send that this scope has recorded is answered from that entry. That answer reads no foreign entry and no
    // text, so none is fetched for it, and a text that both scopes have redacted since cannot hide it. The judge still makes every
    // check in that order, and gives the answer. A recorded decision stays recorded, so the judge finds it too. A repeated creation
    // is under the same rule: its scope has a genesis, so the founding branch below, which reads a creation's texts, is not taken.
    const known = store.decided(from.at, from.seq, delivered.n) !== null;
    if (!pinned && founding) {
      const act = own(founding.valid.declared.acts, founding.valid.declared.genesis)!;
      const given = creationFields(message.class === "request" ? message : null, from, act.fields);
      carried = textsNamed(act.fields, given);
      const fields = given ? readFields(act.fields, given, bounds) : null;
      // The scope has no genesis yet, so no fact can name it: every fact a creation names is foreign.
      const named = fields?.ok ? factsNamed(act.fields, fields.fields, null) : [];
      const fetched = named.length > bounds.usesPerEntry ? null : await fetchFacts(this.#ports.resolver, bounds, named);
      if (!fetched) return retry("dependency-unavailable");
      facts = fetched;
    } else if (message.class === "result" && isObject(message.of) && isFactRef(message.of.from)) {
      const kept = store.stored(message.of.from.seq);
      origin = kept ? JSON.parse(kept.bytes) as Entry : null;
      facts = origin ? retainedFacts(store, origin) : [];
    } else if (!known && pinned?.definition && (message.class === "request" || message.class === "advisory")) {
      // Section 6.4: the foreign entries that the declared fields of the message name. More than one entry may use are not fetched:
      // the judge refuses that message, `bad-field`, before it reads any.
      const wanted = messageFacts(store, pinned.definition, message, from, bounds);
      const fetched = wanted.length >= bounds.usesPerEntry ? [] : await fetchFacts(this.#ports.resolver, bounds, wanted);
      if (!fetched) return retry("dependency-unavailable");
      facts = fetched;
      carried = messageTexts(pinned.definition, message, from);
    }
    const texts = await this.#texts(from, carried);
    if (!texts) return retry("dependency-unavailable");

    const context = (clock: Reading): Omit<DeliveryContext, "prepared"> =>
      ({ clock, bounds, facts, own: ownOf(store), texts: texts.sizes, capabilities: this.#ports.capabilities ?? undefined, source: { entry: source.entry, under: source.under }, origin });
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
            const retain: Retained[] = [...used(judged.draft, [source, ...facts]), ...texts.retain(definition(), judged.draft)];
            if (genesis && founding) {
              store.cover(founding.valid.indexes);
              retain.push({ kind: "definition", digest: founding.valid.digest, bytes: canonicalize(JSON.parse(founding.bytes)) }, ...founding.children);
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
