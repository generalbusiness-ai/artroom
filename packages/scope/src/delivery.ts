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

import type { Bounds, Digest, Entry, FactRef, Incarnation, PlatformDefinition, ScopeId, Seed, UnavailableReason } from "@generalbusiness/dap-contract";
import { canonicalize, isDigest, isPlatformDefinition, newIncarnation, isSeed, parseStrict, platformName } from "@generalbusiness/artroom-bytes";
import { applicationPublicationOrigin, publishingLaneAffiliation } from "@generalbusiness/dap-platform";
import { clockOf, creationFields, factsNamed, isEntryOf, isFactRef, isLocalId, isObject, isScopeRef, judgeDelivery, judgeGenesis, messageFacts, messageTexts, own, prepareRules, readFields, textsNamed } from "@generalbusiness/dap-derive";
import type { Clock as Reading, Creation, Delivered, DeliveryContext, Fetched, Judgment, PlatformRules, StateView, ValidDefinition } from "@generalbusiness/dap-derive";
import { NO_INCARNATION, Observes, Received, ownOf, retainedFacts, snapshotsOf, used, valuesOf, type Scope } from "./core.ts";
import { carryProducerName } from "./receiver-facts.ts";
import { ReceiverReads } from "./receiver-reads.ts";
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
  readonly #ports: Pick<Ports, "resolver" | "proofs" | "births" | "definitions" | "texts" | "random" | "capabilities" | "clock">;
  readonly #bounds: Bounds;

  constructor(name: ScopeId | null, scope: Scope, store: Store, ports: Pick<Ports, "resolver" | "proofs" | "births" | "definitions" | "texts" | "random" | "capabilities" | "clock">, bounds: Bounds) {
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
   * A seed that names a platform definition pins the runtime's own code, by
   * that name and version (section 6.1): its data and its rules, as
   * `Scope.platform` reads them for a founding. Nothing of it is read from
   * the creator, and no bytes are retained for it. The declarations that
   * its data names by digest in `create` sends are read from the creator.
   *
   * `dependency-unavailable`: the creator cannot be read now, or does not
   * hold the bytes. `unsupported-definition`: the bytes are not a valid
   * declaration with that digest, or the seed names a platform definition
   * that this runtime cannot run whole: a version that it lacks, or one
   * with a mark and no rule. Either way nothing is recorded.
   */
  async #declared(seed: Seed): Promise<{ valid: ValidDefinition; bytes: string | null; children: Retained[]; platform: PlatformRules | null } | "dependency-unavailable" | "unsupported-definition"> {
    if (!isObject(seed) || !isScopeRef(seed.creator)) return "unsupported-definition";
    const { definitions } = this.#ports;
    const creator = seed.creator;
    const seconds = this.#bounds.fetchSeconds;
    const from = async (digest: Digest): Promise<DefinitionRead> => {
      const read = await within(() => definitions.read(digest, creator), seconds);
      return read === LATE ? { ok: false, reason: "unavailable" } : read;
    };
    let valid: ValidDefinition | null;
    let bytes: string | null = null;
    let platform: PlatformRules | null = null;
    if (isPlatformDefinition(seed.definition)) {
      const supplied = this.#scope.platform(seed.definition);
      if (!supplied) return "unsupported-definition";
      ({ definition: valid, platform } = supplied);
    } else {
      if (!isDigest(seed.definition)) return "unsupported-definition";
      const read = await from(seed.definition);
      if (!read.ok) return read.reason === "unsupported-definition" ? "unsupported-definition" : "dependency-unavailable";
      valid = this.#scope.validate(read.bytes);
      if (valid?.digest !== seed.definition) return "unsupported-definition";
      bytes = read.bytes;
    }
    const children = await namedBy(valid, from, (text) => this.#scope.validate(text), this.#bounds.namedDefinitions);
    if (!children.ok) return children.reason === "unavailable" ? "dependency-unavailable" : "unsupported-definition";
    return { valid, bytes, children: children.retain, platform };
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
    const receiving = this.#scope.pinned();
    const reserve = receiving && isPlatformDefinition(receiving.named) && platformName(receiving.named) === "platform:destination"
      && message.class === "request" && message.type === "tell" && isObject(message.body) && message.body["message"] === "reserve";
    const file = ["platform:destination@4", "platform:destination@5", "platform:destination@6"].includes(receiving?.named ?? "") && message.class === "request" && message.type === "tell"
      && isObject(message.body) && message.body["message"] === "publish-file";
    const known = store.decided(from.at, from.seq, delivered.n) !== null;
    const creates = message.class === "request" && message.type === "create" && !isScopeRef(delivered.to);
    if (creates && !isSeed(delivered.to)) return UNVERIFIED;
    let reader = !known && message.class !== "control" && receiving ? await this.#scope.receiverReads() : null;
    if (!known && message.class !== "control" && receiving && !reader) return retry("dependency-unavailable");
    // An empty new receiver collects raw bytes before interpreting a name.
    // A locator selects this read strategy only; bootstrap below must prove
    // the actual native parent create before any label reaches a judge.
    const probe = !receiving && creates && message.class === "request" ? await ReceiverReads.probeCreation(this.#ports, { seed: delivered.to as Seed, source: from, n: delivered.n, message }) : undefined;
    if (probe === null) return retry("dependency-unavailable");
    const read = probe?.source ? { entry: probe.source, under: "" }
      : await within(() => reader && message.class === "result" ? reader.result(delivered, bounds.fetchSeconds) : (reader ?? this.#ports.resolver).read(from, bounds.fetchSeconds, !!reserve || file), bounds.fetchSeconds);
    if (read === LATE || read === null) return retry("dependency-unavailable");
    if (!("entry" in read) || !isEntryOf(read.entry, from)) return UNVERIFIED;
    let source: Fetched = carryProducerName({ fact: from, entry: read.entry, under: read.under }, read);

    // The definition is read only after authenticating the source bytes.
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
    // message's class. A send that this scope has recorded is answered from that entry. The source entry is still read and checked.
    // The answer reads no other foreign entry and no text, so none is fetched for it, and a text that both scopes have redacted since
    // cannot hide it. The judge still makes every check in that order, and gives the answer. A recorded decision stays recorded, so
    // the judge finds it too. A repeated creation is under the same rule: its scope has a genesis, so the founding branch below,
    // which reads a creation's texts, is not taken.
    if (!known && message.class !== "control") {
      reader ??= !pinned && founding && message.class === "request" && message.type === "create"
        ? await ReceiverReads.forCreation(this.#ports, { seed: delivered.to as Seed, source: from, n: delivered.n, message }, isPlatformDefinition((delivered.to as Seed).definition) ? (delivered.to as Seed).definition as PlatformDefinition : founding.valid.declared, probe?.operation)
        : await this.#scope.receiverReads();
      if (!reader) return retry("dependency-unavailable");
      const named = probe?.source ? await reader.read(from, bounds.fetchSeconds) : source;
      if (named === null || !("entry" in named)) return retry("dependency-unavailable");
      source = carryProducerName({ fact: from, entry: named.entry, under: named.under }, named);
    }
    const resolver = reader ?? this.#ports.resolver;
    if (file && !known) {
      const directory = store.page("branch", ["empty", "ready"], null, 1).items[0]?.refs["directory"];
      const destination = store.scope()?.at;
      if (!isScopeRef(directory) || !destination) return retry("dependency-unavailable");
      const native = reader?.mode === "partition-v1" ? await reader.publication(from, directory, destination, "application") : applicationPublicationOrigin(from, directory, destination, read.origin ?? []);
      if (native === null) return retry("dependency-unavailable");
      if (!native) return UNVERIFIED;
    }
    // A legitimate activated extension may choose an arbitrary send target.
    // Verify its immutable room before new reserve admission. This is a source
    // check, not a changed historical judgment or a manufactured refusal entry.
    // An already recorded decision remains recorded and answers its repeat.
    if (reserve && !known && source.under === "change") {
      const directory = store.page("branch", ["empty", "ready"], null, 1).items[0]?.refs["directory"];
      const destination = store.scope()?.at;
      if (!isScopeRef(directory) || !destination) return retry("dependency-unavailable");
      const native = reader?.mode === "partition-v1" ? await reader.publication(from, directory, destination, "change") : read.origin ? publishingLaneAffiliation(from, directory, destination, read.origin) : null;
      if (native === null) return retry("dependency-unavailable");
      if (!native) return UNVERIFIED;
    }
    if (!pinned && founding) {
      const act = own(founding.valid.declared.acts, founding.valid.declared.genesis)!;
      const given = creationFields(message.class === "request" ? message : null, from, act.fields);
      carried = textsNamed(act.fields, given);
      const fields = given ? readFields(act.fields, given, bounds) : null;
      // The scope has no genesis yet, so no fact can name it: every fact a creation names is foreign.
      const named = fields?.ok ? factsNamed(act.fields, fields.fields, null) : [];
      const fetched = named.length > bounds.usesPerEntry ? null : await fetchFacts(resolver, bounds, named);
      if (!fetched) return retry("dependency-unavailable");
      facts = fetched;
    } else if (message.class === "result" && isObject(message.of) && isFactRef(message.of.from)) {
      const kept = store.stored(message.of.from.seq);
      origin = kept ? JSON.parse(kept.bytes) as Entry : null;
      const retained = origin ? retainedFacts(store, origin) : [];
      const interpreted = reader ? await reader.retained(retained) : retained;
      if (!interpreted) return retry("dependency-unavailable");
      facts = interpreted;
    } else if (!known && pinned?.definition && (message.class === "request" || message.class === "advisory")) {
      // Section 6.4: the foreign entries that the declared fields of the message name. More than one entry may use are not fetched:
      // the judge refuses that message, `bad-field`, before it reads any.
      const wanted = messageFacts(store, pinned.definition, message, from, bounds, source.under);
      const fetched = wanted.length >= bounds.usesPerEntry ? [] : await fetchFacts(resolver, bounds, wanted);
      if (!fetched) return retry("dependency-unavailable");
      facts = fetched;
      carried = messageTexts(pinned.definition, message, from, source.under);
    }
    const texts = await this.#texts(from, carried);
    if (!texts) return retry("dependency-unavailable");

    // Scope contract, revision 20, section 16.1 (row I3-40): for a result, under a definition whose data states rows of `observes`,
    // the scope reads one observation for each subject of the rows of the clause that runs, before the turn, and the commit
    // derives the list again (`Observes`). No other delivery may hold `observed`, so nothing is read for one.
    const rows = message.class === "result" && !known ? this.#scope.observes() : new Observes(null, bounds);
    const context = (clock: Reading): Omit<DeliveryContext, "prepared"> =>
      ({ clock, bounds, facts, own: ownOf(store), snapshot: snapshotsOf(store), texts: texts.sizes, capabilities: this.#ports.capabilities ?? undefined, platform: (this.#scope.pinned() ?? founding)?.platform ?? undefined, source: { entry: source.entry, under: source.under }, origin, ...rows.hand() });
    /** The definition a section of the turn runs under: the pinned one, or before the genesis the one the seed names. */
    const definition = (): ValidDefinition => this.#scope.pinned()?.definition ?? founding!.valid;
    /** A `create` goes to the genesis judge, which answers a repeat from the genesis when the scope exists. */
    const judge = (view: StateView, inc: Incarnation, reading: DeliveryContext): Judgment =>
      (creates ? judgeGenesis(view, definition(), { name, inc, to: delivered.to as Seed, from, n: delivered.n, message } as Creation, reading) : judgeDelivery(view, definition(), delivered, reading));

    if (pinned?.definition && !creates) {
      const at = pinned.definition;
      await rows.before(() => { const planned = judgeDelivery(store, at, delivered, { ...context(clockOf(store, this.#ports.clock.read())), prepared: [] }); return planned.result === "unavailable" ? planned.missing : undefined; });
    }
    const end = await rows.turn((stop) => this.#scope.turns.run<Delivery>({
      asks: (view, clock) => {
        const reading = { ...context(clock), prepared: [] };
        return creates ? prepareRules(view, definition(), { genesis: { name, inc: NO_INCARNATION, to: delivered.to as Seed, from, n: delivered.n, message } as Creation, context: reading }) : prepareRules(view, definition(), { delivery: delivered, context: reading });
      },
      judge: (view, clock, prepared) => {
        const genesis = view.scope() === null;
        // Section 2.2: the incarnation is minted in the transaction that writes the first entry.
        const judged = judge(view, genesis ? newIncarnation(this.#ports.random.bytes(16)) : NO_INCARNATION, { ...context(clock), prepared });
        // Section 16.1, "In the commit": a subject of the commit's list with no observation at hand stops the commit. The scope
        // reads what is missing, and the turn starts again. The delivery is tried again.
        stop(judged.result === "unavailable" ? judged.missing : undefined);
        switch (judged.result) {
          case "write": {
            // Section 9.2: an entry that settles nothing is written only while the scope has room; one that settles is counted for.
            if ((view.scope()?.head.seq ?? -1) + 1 >= bounds.scopeEntries) return said(retry("scope-full"));
            // Section 16.1, "A value that a row may retain": each value that a retained observation names is kept with the entry.
            const retain: Retained[] = [...used(judged.draft, [source, ...facts]), ...texts.retain(definition(), judged.draft, source.under), ...valuesOf(judged.draft)];
            if (genesis && founding) {
              store.cover(founding.valid.indexes);
              // A platform definition is pinned by its name and version, and no bytes are retained for it.
              if (founding.bytes !== null) retain.push({ kind: "definition", digest: founding.valid.digest, bytes: canonicalize(JSON.parse(founding.bytes)) });
              retain.push(...founding.children);
            }
            return {
              verdict: "write", draft: judged.draft, facts: [source, ...facts], retain,
              sealed: ({ entry, hash }) => { rows.sealed({ entry, hash }); return { answer: "recorded", fact: { at: entry.at, seq: entry.seq, hash } }; },
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
    }, founding?.valid));
    return end.end === "answer" ? end.answer : retry(end.end === "idle" ? "unavailable" : end.end);
  }
}
