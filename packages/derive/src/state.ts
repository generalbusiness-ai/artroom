/**
 * The state a scope's entries fold into (scope contract, sections 6.3, 6.5,
 * 4.2, 7.2 to 7.4). It is behind an interface so that the runtime can keep it
 * in storage and a verifier in memory, and both run the same fold and the
 * same judges over it.
 */

import type { Digest, FieldValue, Head, Incarnation, KeyId, MemberRef, Request, ScopeRef, Seed, Timestamp } from "@generalbusiness/artroom-contract";
import { canonicalize } from "@generalbusiness/artroom-bytes";

export type Status = "provisional" | "active" | "refused";

/** What every judgment reads first. `time` is the last entry's time (section 5.3). */
export interface ScopeState { at: ScopeRef; creator: ScopeRef | null; status: Status; head: Head; time: Timestamp }

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

/** One request this scope sent, with what has been recorded about it (section 7.4). */
export interface OwnRequest {
  seq: number; n: number; type: Request["type"]; to: ScopeRef | Seed;
  result: { seq: number; clause: "applied" | "refused" | "superseded" | "conflict" } | null;
  diagnosis: { seq: number; finding: "undelivered" | "delivery-unavailable" } | null;
}

/** The applied creation result this scope holds for a seed (section 7.2). */
export interface HeldCreation { inc: Incarnation; seq: number }

/** Items in ascending ID order. `more`: the page stopped at its limit and further items may follow. */
export interface Page { items: readonly Item[]; more: boolean }

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
  /** The `seq` of the entry that recorded that incoming delivery. */
  decided(from: ScopeRef, seq: number, n: number): number | null;
  creation(seed: Digest): HeldCreation | null;
}

/** The changes an entry makes. Only the fold calls these. */
export interface StateWriter extends StateView {
  setScope(scope: ScopeState): void;
  putItem(item: Item): void;
  addCount(type: string, state: string, by: number): void;
  putRelation(relation: Relation): void;
  putAccepted(actor: KeyId, idempotencyKey: string, accepted: Accepted): void;
  putRequest(request: OwnRequest): void;
  putDecided(from: ScopeRef, seq: number, n: number, by: number): void;
  putCreation(seed: Digest, held: HeldCreation): void;
}

const key = (...parts: readonly (string | number)[]) => canonicalize(parts);

/** The state in memory, for a verifier and for tests. */
export class MemoryState implements StateWriter {
  #scope: ScopeState | null = null;
  readonly #items = new Map<number, Item>();
  readonly #counts = new Map<string, number>();
  readonly #relations = new Map<string, Relation>();
  readonly #accepted = new Map<string, Accepted>();
  readonly #requests = new Map<string, OwnRequest>();
  readonly #decided = new Map<string, number>();
  readonly #creations = new Map<string, HeldCreation>();

  scope() { return this.#scope; }
  item(id: number) { return this.#items.get(id) ?? null; }
  count(type: string, state: string) { return this.#counts.get(key(type, state)) ?? 0; }
  page(type: string, states: readonly string[], after: number | null, limit: number): Page {
    const all = [...this.#items.values()].filter((i) => i.type === type && states.includes(i.state) && (after === null || i.id > after)).sort((a, b) => a.id - b.id);
    return { items: all.slice(0, limit), more: all.length > limit };
  }
  relation(owner: ScopeRef, name: string, item: number) { return this.#relations.get(key(owner.scope, owner.inc, name, item)) ?? null; }
  accepted(actor: KeyId, idempotencyKey: string) { return this.#accepted.get(key(actor, idempotencyKey)) ?? null; }
  request(seq: number, n: number) { return this.#requests.get(key(seq, n)) ?? null; }
  decided(from: ScopeRef, seq: number, n: number) { return this.#decided.get(key(from.scope, from.inc, seq, n)) ?? null; }
  creation(seed: Digest) { return this.#creations.get(seed) ?? null; }

  setScope(scope: ScopeState) { this.#scope = scope; }
  putItem(item: Item) { this.#items.set(item.id, item); }
  addCount(type: string, state: string, by: number) { this.#counts.set(key(type, state), this.count(type, state) + by); }
  putRelation(r: Relation) { this.#relations.set(key(r.owner.scope, r.owner.inc, r.name, r.item), r); }
  putAccepted(actor: KeyId, idempotencyKey: string, accepted: Accepted) { this.#accepted.set(key(actor, idempotencyKey), accepted); }
  putRequest(r: OwnRequest) { this.#requests.set(key(r.seq, r.n), r); }
  putDecided(from: ScopeRef, seq: number, n: number, by: number) { this.#decided.set(key(from.scope, from.inc, seq, n), by); }
  putCreation(seed: Digest, held: HeldCreation) { this.#creations.set(seed, held); }

  /** The whole state as one canonical text, each index in key order. Two states with one text are equal. */
  snapshot(): string {
    const sorted = <T>(m: Map<string | number, T>) => [...m.entries()].sort(([a], [b]) => (typeof a === "number" && typeof b === "number" ? a - b : String(a) < String(b) ? -1 : 1));
    return canonicalize({
      scope: this.#scope, items: sorted(this.#items).map(([, v]) => v), counts: sorted(this.#counts).filter(([, n]) => n !== 0), relations: sorted(this.#relations).map(([, v]) => v),
      accepted: sorted(this.#accepted), requests: sorted(this.#requests).map(([, v]) => v), decided: sorted(this.#decided), creations: sorted(this.#creations),
    });
  }
}
