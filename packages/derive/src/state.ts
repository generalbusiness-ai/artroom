/**
 * The state a scope's entries fold into (scope contract, sections 6.3, 6.5,
 * 4.2, 7.2 to 7.4). It is behind an interface so that the runtime can keep it
 * in storage and a verifier in memory, and both run the same fold and the
 * same judges over it.
 */

import type { Digest, FactRef, FieldValue, Head, Incarnation, KeyId, MemberRef, OperationId, Request, ScopeRef, Seed, Timestamp } from "@generalbusiness/artroom-contract";
import { canonicalBytes, canonicalize, digestBytes } from "@generalbusiness/artroom-bytes";
import { byteOrder } from "./values.ts";

export type Status = "provisional" | "active" | "refused";

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

/** A party slot holds one member, or a list of members. An empty slot is `null`; an empty list is unset. */
export type Party = MemberRef | readonly MemberRef[] | null;

export interface Item {
  readonly id: number;                     // the `seq` of its opening entry (section 4.1)
  readonly type: string;
  readonly state: string;
  readonly revision: number;               // section 6.3
  /** The hash of its opening entry, so a send can name it by fact. Null only while that entry is being judged. */
  readonly opened: Digest | null;
  readonly parties: Readonly<Record<string, Party>>;
  readonly refs: Readonly<Record<string, FieldValue | null>>;
  readonly values: Readonly<Record<string, FieldValue | null>>;
  /**
   * The history attribution needs (section 6.7): every member ever in one of
   * its `author` slots, every holder of a hold whose `under` names it, and
   * the principal of each who signed under one.
   */
  readonly attributed: readonly MemberRef[];
  readonly epoch?: number;                 // a hold item only (section 6.8)
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

/** One numbered attempt of an operation that writes outside the service: the entry that opened it and its outcome, if recorded (section 4.3). */
export interface AttemptState { attempt: number; opened: number; outcome: { seq: number; result: "confirmed" | "refused" | "unknown" } | null }
export interface Operation { id: OperationId; attempts: readonly AttemptState[] }

/** Items in ascending ID order. `more`: the page stopped at its limit and further items may follow. */
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
  operations: readonly Operation[];                                     // by ID
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
  /** At most `limit` items of that type in those states with an ID above `after`. */
  page(type: string, states: readonly string[], after: number | null, limit: number): Page;
  relation(owner: ScopeRef, name: string, item: number): Relation | null;
  accepted(actor: KeyId, idempotencyKey: string): Accepted | null;
  request(seq: number, n: number): OwnRequest | null;
  /** The record of the incoming delivery from that scope, entry and ordinal, if one was recorded. */
  decided(from: ScopeRef, seq: number, n: number): Decided | null;
  creation(seed: Digest): HeldCreation | null;
  operation(id: OperationId): Operation | null;
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

/** The state in memory, for a verifier and for tests. */
export class MemoryState implements StateWriter {
  #scope: ScopeState | null = null;
  readonly #items = new Map<number, Item>();
  readonly #counts = new Map<string, readonly [string, string, number]>();
  readonly #relations = new Map<string, Relation>();
  readonly #accepted = new Map<string, readonly [KeyId, string, Accepted]>();
  readonly #requests = new Map<string, OwnRequest>();
  readonly #decided = new Map<string, Decided>();
  readonly #creations = new Map<Digest, HeldCreation>();
  readonly #operations = new Map<OperationId, Operation>();

  scope() { return this.#scope; }
  item(id: number) { return this.#items.get(id) ?? null; }
  count(type: string, state: string) { return this.#counts.get(key(type, state))?.[2] ?? 0; }
  page(type: string, states: readonly string[], after: number | null, limit: number): Page {
    const all = [...this.#items.values()].filter((i) => i.type === type && states.includes(i.state) && (after === null || i.id > after)).sort((a, b) => a.id - b.id);
    return { items: all.slice(0, limit), more: all.length > limit };
  }
  relation(owner: ScopeRef, name: string, item: number) { return this.#relations.get(key(owner.scope, owner.inc, name, item)) ?? null; }
  accepted(actor: KeyId, idempotencyKey: string) { return this.#accepted.get(key(actor, idempotencyKey))?.[2] ?? null; }
  request(seq: number, n: number) { return this.#requests.get(key(seq, n)) ?? null; }
  decided(from: ScopeRef, seq: number, n: number) { return this.#decided.get(key(from.scope, from.inc, seq, n)) ?? null; }
  creation(seed: Digest) { return this.#creations.get(seed) ?? null; }
  operation(id: OperationId) { return this.#operations.get(id) ?? null; }

  setScope(scope: ScopeState) { this.#scope = scope; }
  putItem(item: Item) { this.#items.set(item.id, item); }
  addCount(type: string, state: string, by: number) { this.#counts.set(key(type, state), [type, state, this.count(type, state) + by]); }
  putRelation(r: Relation) { this.#relations.set(key(r.owner.scope, r.owner.inc, r.name, r.item), r); }
  putAccepted(actor: KeyId, idempotencyKey: string, accepted: Accepted) { this.#accepted.set(key(actor, idempotencyKey), [actor, idempotencyKey, accepted]); }
  putRequest(r: OwnRequest) { this.#requests.set(key(r.seq, r.n), r); }
  putDecided(from: FactRef, n: number, by: number) { this.#decided.set(key(from.at.scope, from.at.inc, from.seq, n), { from: { scope: from.at.scope, inc: from.at.inc }, seq: from.seq, hash: from.hash, n, by }); }
  putCreation(seed: Digest, held: HeldCreation) { this.#creations.set(seed, held); }
  putOperation(operation: Operation) { this.#operations.set(operation.id, operation); }

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
      operations: sorted(this.#operations.values(), (o) => [o.id]),
    };
  }
  /** The snapshot as one canonical text, to compare two states. */
  snapshot(): string {
    return canonicalize(this.all());
  }
}
