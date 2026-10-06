/**
 * The state a scope's entries fold into (scope contract, sections 6.3, 6.5,
 * 4.2, 7.2 to 7.4). It is behind an interface so that the runtime can keep it
 * in storage and a verifier in memory, and both run the same fold and the
 * same judges over it. The shapes a read returns, `Item`, `Party` and
 * `Status`, are the contract's, and are exported here again.
 */

import type { CapabilityName, Digest, FactRef, FieldValue, Head, Held, Incarnation, Item, KeyId, OperationId, Party, PlatformDefinition, Request, ScopeId, ScopeKind, ScopeRef, Seed, Status, Timestamp } from "@generalbusiness/artroom-contract";
import { canonicalBytes, canonicalize, digestBytes } from "@generalbusiness/artroom-bytes";
import { pendingOf } from "./ledger.ts";
import { byteOrder } from "./values.ts";

export type { Item, Party, Status };

/** What every judgment reads first. `time` is the last entry's time (section 5.3). */
export interface ScopeState {
  at: ScopeRef; creator: ScopeRef | null; status: Status; head: Head; time: Timestamp;
  /** The hash of the genesis entry and, for a child, the creation request it answered: the creator's entry and send (section 7.2). */
  genesis: { hash: Digest; source: FactRef | null; n: number | null };
  /**
   * The ordinals of the genesis entry's sends that are sealed as duties and
   * not dispatched: every send of a provisional scope's genesis but its
   * result. The entry that records the confirmation empties it (section 7.2).
   */
  held: readonly number[];
}

/** This scope's copy of a relationship another scope owns (section 7.3). `revision` is the `seq` of the owner's entry. */
export interface Relation { owner: ScopeRef; name: string; item: number; state: string; revision: number }

/** An accepted intent: the entry that holds it, and its digest (section 4.2). */
export interface Accepted { seq: number; intent: Digest }

/**
 * One request this scope sent, with what has been recorded about it (section
 * 7.4). `hash` is the hash of the entry that sent it, so a result can name
 * the request by fact. `result` is the first result recorded; a later
 * `conflict` does not replace it.
 */
export interface OwnRequest {
  seq: number; n: number; hash: Digest; type: Request["type"]; to: ScopeRef | Seed;
  result: { seq: number; clause: "applied" | "refused" | "superseded" | "conflict" } | null;
  diagnosis: { seq: number; finding: "undelivered" | "delivery-unavailable" } | null;
}

/** The applied creation result this scope holds for a seed (section 7.2). */
export interface HeldCreation { inc: Incarnation; seq: number }

/**
 * An incoming delivery this scope recorded: the source scope and incarnation,
 * the source entry by `seq` and hash, the ordinal, and `by`, the entry that
 * recorded it. An owner entry is consumed once (section 7.3).
 */
export interface Decided { from: Pick<ScopeRef, "scope" | "inc">; seq: number; hash: Digest; n: number; by: number }

/**
 * One recorded outcome of an attempt (section 4.3): the entry that holds it,
 * its result, the digest of its evidence, and `selected` as that entry
 * derived it. The evidence itself is in the entry.
 */
export interface OutcomeState { seq: number; result: "confirmed" | "refused" | "unknown"; evidence: Digest; selected: boolean | null }

/**
 * One numbered attempt of an operation that writes outside the service: the
 * entry that opened it, and its outcomes in the order recorded (section 4.3,
 * item 3). It has at most two. The second is the late answer, and follows
 * only an `unknown`, which stays as it was written.
 */
export interface AttemptState { attempt: number; opened: number; outcomes: readonly OutcomeState[] }

/**
 * One operation (section 4.3): its ID, which is the entry that opened it and
 * its ordinal there; its owner and kind; `most`, the most attempts its owner
 * allows; the attempts opened so far, in order from 1; and `selected`, the
 * number of the attempt whose result was selected, which is set once and
 * never moves (item 7). An operation with no attempt is a held duty of a
 * provisional scope's genesis (item 1).
 *
 * `for` (section 17.2a, "What holds the count"): the holder that the
 * operation is for, by its item's ID, as its `operation` effect states it.
 * Only an operation of a kind that an item holds has it. `sent` (section
 * 17.2, "A request that an outcome sends"): an outcome entry of the
 * operation made the request of its kind's `send`. It is kept only for a
 * kind whose send states `once`. So an operation of any other kind has the
 * bytes it had.
 */
export interface Operation {
  id: OperationId; owner: CapabilityName | PlatformDefinition; kind: string; most: number;
  attempts: readonly AttemptState[]; selected: number | null;
  for?: number; sent?: true;
}

/**
 * What one holder still holds (section 17.2a): the item, and its three
 * counts. A holder that holds nothing has no record: one whose every count
 * is drawn, and one that is final and has released what it held.
 */
export interface Holder { item: number; held: Held }

/** The account of one request that this scope sent (section 17.2a): the holder on whose reservation the sending entry drew. */
export interface Account { seq: number; n: number; item: number }

/**
 * The duties that are open and are not items (section 9.2). `requests`: sent
 * requests with no result and no diagnosis. `unavailable`: those with a
 * `delivery-unavailable` diagnosis and no result. Of the operations that are
 * not settled (`pendingOf`, in `ledger.ts`): `opened`, attempts with no
 * outcome; `unknown`, attempts whose latest outcome is `unknown`; and
 * `unopened`, attempts that may still be opened. `outcomes`: for each owner
 * and kind of those operations, in no stated order, the outcome entries
 * that they may still write: 2 for each attempt that is opened or may be,
 * and 1 for each that is `unknown`. `unsent`: how many of those operations
 * have not made the request of their kind's `send`, which a kind that
 * states `once` reserves once for each (section 17.2).
 */
export interface Outstanding {
  requests: number; unavailable: number; opened: number; unknown: number; unopened: number;
  outcomes: readonly { owner: CapabilityName | PlatformDefinition; kind: string; entries: number; unsent: number }[];
}

/**
 * One preparation entry, as the scope indexes it (section 5.5, "A repeat"):
 * by the digest of the signed intent, the capability and the step. `seq` is
 * the entry. The same three again are answered with it and write nothing.
 */
export interface PreparedStep { intent: Digest; capability: CapabilityName; step: string; seq: number }

/**
 * One capability record, as the fold keeps it (section 6.11, "Records"):
 * local state that is not an item. It changes only by a `record` effect of
 * a sealed entry, which states the record's state and its values whole
 * (I3 deltas, entry EF5). `seq` is the entry that last recorded it. A key is
 * never reused, and a record is never removed.
 */
export interface RecordState {
  capability: CapabilityName; kind: string; key: readonly FieldValue[]; state: string;
  values: Readonly<Record<string, unknown>>; seq: number;
}

/**
 * The highest head that the entries of this scope retain for one subject of
 * an observation (section 16.1, "The fold holds the highest head"): the
 * observed scope, with its incarnation; the subject, which is a key, a
 * member, or `rules`; and the highest position `head.seq` that an entry
 * retained for it. An observation of a key counts under its key and under
 * its member. It is derived from the entries alone, as the index of
 * accepted keys is. The commit judges the order of heads against it, so a
 * lower head is refused in every run, also after a restart.
 */
export interface ObservedHead { of: Pick<ScopeRef, "scope" | "inc">; subject: string; seq: number }

/** Which records of one kind a read asks for: those in one of `states`, and those whose value `member` equals `value`. Absent: every one. */
export interface RecordsWhere { states?: readonly string[]; member?: string; value?: unknown }

/** Items in ascending ID order. `more`: the page stopped at its limit and at least one further item follows. */
export interface Page { items: readonly Item[]; more: boolean }

/**
 * The whole folded state as one value (section 9.2, a checkpoint). Each list
 * is in the order of its key: a number by value, a text by its UTF-8 bytes.
 * A count of zero is left out. Two states with one snapshot are equal.
 */
export interface StateSnapshot {
  v: 1;
  scope: ScopeState | null;
  items: readonly Item[];                                               // by ID
  counts: readonly (readonly [type: string, state: string, n: number])[];   // by type, then state
  relations: readonly Relation[];                                       // by owner scope, owner incarnation, name, item
  accepted: readonly (readonly [actor: KeyId, idempotencyKey: string, accepted: Accepted])[];   // by actor, then key
  requests: readonly OwnRequest[];                                      // by seq, then n
  decided: readonly Decided[];                                          // by source scope, incarnation, seq, n
  creations: readonly (readonly [seed: Digest, held: HeldCreation])[];  // by seed digest
  operations: readonly Operation[];                                     // by the entry that opened each, then its ordinal there
  texts: readonly (readonly [item: number, slot: string, texts: readonly Digest[]])[];   // by item, then slot; a slot that holds none is left out
  /**
   * The index of preparation entries, by intent digest, capability and step
   * (section 5.5). Absent: the scope has none. A state with none has no
   * member, so its digest is the one it had before a scope could prepare.
   */
  prepared?: readonly PreparedStep[];
  /** The capability records, by capability, kind and the canonical bytes of the key (section 6.11). Absent: the scope has none. */
  records?: readonly RecordState[];
  /**
   * The highest head for each subject of a retained observation, by observed
   * scope, incarnation and subject (section 16.1). Absent: no entry of the
   * scope retains an observation. A state with none has no member, so its
   * digest is the one it had before the fold held this.
   */
  observed?: readonly ObservedHead[];
  /**
   * What each holder still holds, by item (section 17.2a, "What holds the
   * count"). Absent: no item of the scope holds anything. A state with none
   * has no member, so its digest is the one it had before the fold held
   * this. The holder of each operation is the member `for` of the operation.
   */
  holders?: readonly Holder[];
  /** The account of each request that an entry with an account sent, by the sending entry and the send's ordinal (section 17.2a). Absent: none. */
  accounts?: readonly Account[];
}

/** The digest a checkpoint entry carries: SHA-256 of the snapshot's canonical JSON. */
export function stateDigest(snapshot: StateSnapshot): Digest {
  return digestBytes(canonicalBytes(snapshot));
}

export interface StateView {
  /** Null before the genesis entry. */
  scope(): ScopeState | null;
  item(id: number): Item | null;
  /** The exact number of items of that type in that state, live or retained final (section 6.5). */
  count(type: string, state: string): number;
  /**
   * At most `limit` items of that type in those states with an ID above
   * `after`, lowest ID first. `after` is the cursor: the ID of the last item
   * of the page before, or null for the first page. An item's ID never
   * changes, so the cursor stays good across writes.
   *
   * Section 6.5: the index is ordered by type, state and ID. An
   * implementation reads this page from that index, so the page costs the
   * items it returns and not the items the scope retains. Retained final
   * items are not bounded and nothing is evicted.
   */
  page(type: string, states: readonly string[], after: number | null, limit: number): Page;
  relation(owner: ScopeRef, name: string, item: number): Relation | null;
  /**
   * The exact number of keys this scope keeps a copy for, of the relationship
   * of that name, whose owner is a scope of that kind (section 7.3). With
   * `states`: only the copies in one of those states.
   */
  copies(name: string, kind: ScopeKind, states?: readonly string[]): number;
  accepted(actor: KeyId, idempotencyKey: string): Accepted | null;
  request(seq: number, n: number): OwnRequest | null;
  /** The record of the incoming delivery from that scope, entry and ordinal, if one was recorded. */
  decided(from: ScopeRef, seq: number, n: number): Decided | null;
  creation(seed: Digest): HeldCreation | null;
  operation(id: OperationId): Operation | null;
  /**
   * The digests of the detached texts that a value slot of an item has held
   * and that no entry has redacted, in the order in which the slot first
   * held them (section 6.6). A `redact` effect lists exactly these.
   */
  texts(item: number, slot: string): readonly Digest[];
  /** The preparation entry with that intent digest, capability and step, if one is sealed (section 5.5). */
  prepared(intent: Digest, capability: CapabilityName, step: string): PreparedStep | null;
  /** This scope's preparation entries for one intent: at most one for each capability step (section 9.1), in the order of capability, then step. */
  preparations(intent: Digest): readonly PreparedStep[];
  /** One capability record, by its kind and key (section 6.11). */
  record(capability: CapabilityName, kind: string, key: readonly FieldValue[]): RecordState | null;
  /**
   * The records of one kind, in the order of the canonical bytes of their
   * keys. The scope indexes records by kind and state (section 6.11). No
   * adopted text bounds the records of one kind, so this read is bounded
   * only by what the scope holds (I3 deltas, entry EF6).
   */
  records(capability: CapabilityName, kind: string, where?: RecordsWhere): readonly RecordState[];
  /** The exact number of records of that kind: in that state, or in any state when none is named. A key is never reused, so the second is the capability's counter. */
  recordCount(capability: CapabilityName, kind: string, state?: string): number;
  /** The highest head that an entry of this scope retains for that subject of that observed scope, with that incarnation (section 16.1). Null: no entry retains an observation of it. */
  observed(of: Pick<ScopeRef, "scope" | "inc">, subject: string): number | null;
  /**
   * The incarnations in `of` of the observations of that scope ID that the entries of this scope retain, once each, in byte order
   * (authority note, section 12.1, "Where the rules scope and the destination record their membership reference": the folded state
   * holds a head for each subject that an entry observed, with its `of`). None: no entry retains an observation of that scope ID.
   */
  incarnations(scope: ScopeId): readonly Incarnation[];
  /** How many duties are open, for the room they need to settle (section 9.2); see `Outstanding`. */
  outstanding(): Outstanding;
  /** What that item still holds (section 17.2a). Null: it holds nothing, or it is no holder. */
  holder(item: number): Held | null;
  /** Every holder that still holds something, in the order of the items. A holder that holds nothing has no record, so this reads the reservations that are open. */
  holders(): readonly Holder[];
  /**
   * The operations that are for that holder, in the order in which they were
   * opened (section 17.2a, "What holds the count"): the index of operations
   * by item, which a rule is given with the rest of the state (I3 deltas,
   * entry FA5). A holder's counts bound how many there are.
   */
  operationsFor(item: number): readonly Operation[];
  /** The account of that request of this scope. Null: its sending entry had none. */
  account(seq: number, n: number): number | null;
  /** The requests of that account, in the order of the sending entry, then the ordinal. */
  accountsOf(item: number): readonly Account[];
  /** Everything, for a checkpoint. This is the one read that is not bounded. */
  all(): StateSnapshot;
}

/** The changes an entry makes. Only the fold calls these. */
export interface StateWriter extends StateView {
  setScope(scope: ScopeState): void;
  putItem(item: Item): void;
  addCount(type: string, state: string, by: number): void;
  putRelation(relation: Relation): void;
  putAccepted(actor: KeyId, idempotencyKey: string, accepted: Accepted): void;
  putRequest(request: OwnRequest): void;
  putDecided(from: FactRef, n: number, by: number): void;
  putCreation(seed: Digest, held: HeldCreation): void;
  putOperation(operation: Operation): void;
  /** The texts that a slot has held and that are not redacted. An empty list holds none. */
  putTexts(item: number, slot: string, texts: readonly Digest[]): void;
  putPrepared(prepared: PreparedStep): void;
  putRecord(record: RecordState): void;
  /** The highest head of one subject. The fold calls it only with a head that is higher than the one held. */
  putObserved(head: ObservedHead): void;
  /** What a holder still holds. Null: it holds nothing more, and its record is removed. */
  putHolder(item: number, held: Held | null): void;
  /** The account of one request, set by the fold of the entry that sends it. */
  putAccount(account: Account): void;
}

type Key = readonly (string | number)[];
const key = (...parts: Key) => canonicalize(parts);
/** The order of a snapshot's lists: part by part, a number by value and a text by its UTF-8 bytes. */
function keyOrder(a: Key, b: Key): number {
  for (let i = 0; i < a.length && i < b.length; i++) {
    const [x, y] = [a[i]!, b[i]!];
    const by = typeof x === "number" && typeof y === "number" ? x - y : byteOrder(String(x), String(y));
    if (by !== 0) return by;
  }
  return a.length - b.length;
}

/** The index in an ascending list of the first ID above `after`. */
function firstAbove(ids: readonly number[], after: number): number {
  let [low, high] = [0, ids.length];
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (ids[mid]! <= after) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** The state in memory, for a verifier and for tests. */
export class MemoryState implements StateWriter {
  #scope: ScopeState | null = null;
  readonly #items = new Map<number, Item>();
  /**
   * The index of section 6.5: for each type and state, the IDs of its items
   * in ascending order. `putItem` keeps it. A new item has the highest ID,
   * so it is appended; an item that changes state is found and placed by
   * binary search.
   */
  readonly #index = new Map<string, number[]>();
  readonly #counts = new Map<string, readonly [string, string, number]>();
  readonly #relations = new Map<string, Relation>();
  readonly #accepted = new Map<string, readonly [KeyId, string, Accepted]>();
  readonly #requests = new Map<string, OwnRequest>();
  readonly #decided = new Map<string, Decided>();
  readonly #creations = new Map<Digest, HeldCreation>();
  readonly #operations = new Map<OperationId, Operation>();
  readonly #texts = new Map<string, readonly [number, string, readonly Digest[]]>();
  readonly #prepared = new Map<string, PreparedStep>();
  readonly #records = new Map<string, RecordState>();
  readonly #observed = new Map<string, ObservedHead>();
  readonly #holders = new Map<number, Held>();
  readonly #accounts = new Map<string, Account>();
  /**
   * For each observed scope ID, the incarnations of the observed heads that are held, once each, in byte order. `putObserved`
   * keeps it, and no head is ever removed. So `incarnations` reads one list, and not every head that the scope holds: a scope
   * reads it for each entry that it judges on its membership reference (I3 deltas, section 31, entry FD5).
   */
  readonly #incarnations = new Map<ScopeId, readonly Incarnation[]>();

  /**
   * For each relationship name and kind of owner, the number of keys that this scope keeps a copy for. `putRelation` keeps it,
   * and no copy is ever removed. So `copies` with no states reads one number, and not every copy that the scope holds: a scope
   * reads it at the first update for each key (I3 deltas, section 31, entry FD6).
   */
  readonly #copies = new Map<string, number>();

  /** `tally`, when it is given, counts what `incarnations` and `copies` read, for a test of their bounds. Nothing else is counted. */
  readonly tally: { steps: number } | undefined;
  constructor(tally?: { steps: number }) { this.tally = tally; }

  scope() { return this.#scope; }
  item(id: number) { return this.#items.get(id) ?? null; }
  count(type: string, state: string) { return this.#counts.get(key(type, state))?.[2] ?? 0; }
  page(type: string, states: readonly string[], after: number | null, limit: number): Page {
    // One position in each listed state's bucket, from the cursor; then a merge by ID. No other item is read.
    const buckets = [...new Set(states)].map((state) => {
      const ids = this.#index.get(key(type, state)) ?? [];
      return { ids, at: after === null ? 0 : firstAbove(ids, after) };
    });
    const items: Item[] = [];
    for (;;) {
      let next: (typeof buckets)[number] | null = null;
      for (const b of buckets) if (b.at < b.ids.length && (next === null || b.ids[b.at]! < next.ids[next.at]!)) next = b;
      if (next === null || items.length >= limit) return { items, more: next !== null };
      items.push(this.#items.get(next.ids[next.at++]!)!);
    }
  }
  relation(owner: ScopeRef, name: string, item: number) { return this.#relations.get(key(owner.scope, owner.inc, name, item)) ?? null; }
  copies(name: string, kind: ScopeKind, states?: readonly string[]) {
    if (this.tally) this.tally.steps += states ? this.#relations.size : 1;
    if (!states) return this.#copies.get(key(name, kind)) ?? 0;
    return [...this.#relations.values()].filter((r) => r.name === name && r.owner.kind === kind && states.includes(r.state)).length;
  }
  accepted(actor: KeyId, idempotencyKey: string) { return this.#accepted.get(key(actor, idempotencyKey))?.[2] ?? null; }
  request(seq: number, n: number) { return this.#requests.get(key(seq, n)) ?? null; }
  decided(from: ScopeRef, seq: number, n: number) { return this.#decided.get(key(from.scope, from.inc, seq, n)) ?? null; }
  creation(seed: Digest) { return this.#creations.get(seed) ?? null; }
  operation(id: OperationId) { return this.#operations.get(id) ?? null; }
  texts(item: number, slot: string) { return this.#texts.get(key(item, slot))?.[2] ?? []; }
  prepared(intent: Digest, capability: CapabilityName, step: string) { return this.#prepared.get(key(intent, capability, step)) ?? null; }
  preparations(intent: Digest) { return this.#steps().filter((p) => p.intent === intent); }
  #steps() { return [...this.#prepared.values()].sort((a, b) => keyOrder([a.intent, a.capability, a.step], [b.intent, b.capability, b.step])); }
  record(capability: CapabilityName, kind: string, at: readonly FieldValue[]) { return this.#records.get(key(capability, kind, canonicalize(at))) ?? null; }
  records(capability: CapabilityName, kind: string, where: RecordsWhere = {}) {
    return this.#kept().filter((r) => r.capability === capability && r.kind === kind && (!where.states || where.states.includes(r.state))
      && (where.member === undefined || (Object.hasOwn(r.values, where.member) && canonicalize(r.values[where.member]) === canonicalize(where.value))));
  }
  recordCount(capability: CapabilityName, kind: string, state?: string) { return this.records(capability, kind, state === undefined ? {} : { states: [state] }).length; }
  #kept() { return [...this.#records.values()].sort((a, b) => keyOrder([a.capability, a.kind, canonicalize(a.key)], [b.capability, b.kind, canonicalize(b.key)])); }
  observed(of: Pick<ScopeRef, "scope" | "inc">, subject: string) { return this.#observed.get(key(of.scope, of.inc, subject))?.seq ?? null; }
  incarnations(scope: ScopeId) {
    const held = this.#incarnations.get(scope) ?? [];
    if (this.tally) this.tally.steps += 1 + held.length;
    return held;
  }
  outstanding(): Outstanding {
    const open = [...this.#requests.values()].filter((r) => r.result === null);
    const operations = [...this.#operations.values()];
    const pending = operations.map(pendingOf);
    const sum = (of: (p: ReturnType<typeof pendingOf>) => number) => pending.reduce((n, p) => n + of(p), 0);
    const outcomes = new Map<string, Outstanding["outcomes"][number]>();
    operations.forEach(({ owner, kind }, i) => {
      const entries = 2 * (pending[i]!.opened + pending[i]!.unopened) + pending[i]!.unknown;
      const at = key(owner, kind);
      if (entries > 0) outcomes.set(at, { owner, kind, entries: (outcomes.get(at)?.entries ?? 0) + entries, unsent: (outcomes.get(at)?.unsent ?? 0) + (operations[i]!.sent === true ? 0 : 1) });
    });
    return {
      requests: open.filter((r) => r.diagnosis === null).length, unavailable: open.filter((r) => r.diagnosis?.finding === "delivery-unavailable").length,
      opened: sum((p) => p.opened), unknown: sum((p) => p.unknown), unopened: sum((p) => p.unopened),
      outcomes: [...outcomes.values()],
    };
  }

  holder(item: number) { return this.#holders.get(item) ?? null; }
  holders(): Holder[] { return [...this.#holders].sort(([a], [b]) => a - b).map(([item, held]) => ({ item, held })); }
  operationsFor(item: number) { return [...this.#operations.values()].filter((o) => o.for === item).sort((a, b) => keyOrder(a.id.split(":").map(Number), b.id.split(":").map(Number))); }
  account(seq: number, n: number) { return this.#accounts.get(key(seq, n))?.item ?? null; }
  accountsOf(item: number) { return [...this.#accounts.values()].filter((a) => a.item === item).sort((a, b) => keyOrder([a.seq, a.n], [b.seq, b.n])); }

  setScope(scope: ScopeState) { this.#scope = scope; }
  putItem(item: Item) {
    const was = this.#items.get(item.id);
    this.#items.set(item.id, item);
    if (was?.type === item.type && was.state === item.state) return;
    if (was) {
      const ids = this.#index.get(key(was.type, was.state))!;
      ids.splice(firstAbove(ids, item.id - 1), 1);
    }
    const at = key(item.type, item.state);
    const ids = this.#index.get(at) ?? [];
    this.#index.set(at, ids);
    ids.splice(firstAbove(ids, item.id), 0, item.id);
  }
  addCount(type: string, state: string, by: number) { this.#counts.set(key(type, state), [type, state, this.count(type, state) + by]); }
  putRelation(r: Relation) {
    const at = key(r.owner.scope, r.owner.inc, r.name, r.item);
    if (!this.#relations.has(at)) this.#copies.set(key(r.name, r.owner.kind), (this.#copies.get(key(r.name, r.owner.kind)) ?? 0) + 1);
    this.#relations.set(at, r);
  }
  putAccepted(actor: KeyId, idempotencyKey: string, accepted: Accepted) { this.#accepted.set(key(actor, idempotencyKey), [actor, idempotencyKey, accepted]); }
  putRequest(r: OwnRequest) { this.#requests.set(key(r.seq, r.n), r); }
  putDecided(from: FactRef, n: number, by: number) { this.#decided.set(key(from.at.scope, from.at.inc, from.seq, n), { from: { scope: from.at.scope, inc: from.at.inc }, seq: from.seq, hash: from.hash, n, by }); }
  putCreation(seed: Digest, held: HeldCreation) { this.#creations.set(seed, held); }
  putOperation(operation: Operation) { this.#operations.set(operation.id, operation); }
  putTexts(item: number, slot: string, texts: readonly Digest[]) {
    if (texts.length === 0) this.#texts.delete(key(item, slot));
    else this.#texts.set(key(item, slot), [item, slot, texts]);
  }
  putPrepared(p: PreparedStep) { this.#prepared.set(key(p.intent, p.capability, p.step), p); }
  putRecord(r: RecordState) { this.#records.set(key(r.capability, r.kind, canonicalize(r.key)), r); }
  putObserved(h: ObservedHead) {
    this.#observed.set(key(h.of.scope, h.of.inc, h.subject), { of: { scope: h.of.scope, inc: h.of.inc }, subject: h.subject, seq: h.seq });
    const held = this.#incarnations.get(h.of.scope) ?? [];
    if (!held.includes(h.of.inc)) this.#incarnations.set(h.of.scope, [...held, h.of.inc].sort(byteOrder));
  }
  putHolder(item: number, held: Held | null) {
    if (held === null) this.#holders.delete(item);
    else this.#holders.set(item, held);
  }
  putAccount(a: Account) { this.#accounts.set(key(a.seq, a.n), { seq: a.seq, n: a.n, item: a.item }); }

  all(): StateSnapshot {
    const sorted = <T>(values: Iterable<T>, of: (value: T) => Key) => [...values].sort((a, b) => keyOrder(of(a), of(b)));
    return {
      v: 1, scope: this.#scope,
      items: sorted(this.#items.values(), (i) => [i.id]),
      counts: sorted(this.#counts.values(), ([type, state]) => [type, state]).filter(([, , n]) => n !== 0),
      relations: sorted(this.#relations.values(), (r) => [r.owner.scope, r.owner.inc, r.name, r.item]),
      accepted: sorted(this.#accepted.values(), ([actor, k]) => [actor, k]),
      requests: sorted(this.#requests.values(), (r) => [r.seq, r.n]),
      decided: sorted(this.#decided.values(), (d) => [d.from.scope, d.from.inc, d.seq, d.n]),
      creations: sorted(this.#creations.entries(), ([seed]) => [seed]),
      operations: sorted(this.#operations.values(), (o) => o.id.split(":").map(Number)),
      texts: sorted(this.#texts.values(), ([item, slot]) => [item, slot]),
      // A member that would be empty is left out, so a state that holds none has the digest it had before these members existed.
      ...(this.#prepared.size === 0 ? {} : { prepared: this.#steps() }),
      ...(this.#records.size === 0 ? {} : { records: this.#kept() }),
      ...(this.#observed.size === 0 ? {} : { observed: sorted(this.#observed.values(), (h) => [h.of.scope, h.of.inc, h.subject]) }),
      ...(this.#holders.size === 0 ? {} : { holders: this.holders() }),
      ...(this.#accounts.size === 0 ? {} : { accounts: sorted(this.#accounts.values(), (a) => [a.seq, a.n]) }),
    };
  }
  /** The snapshot as one canonical text, to compare two states. */
  snapshot(): string {
    return canonicalize(this.all());
  }
}
