/**
 * A handle on one scope (scope contract, sections 4.2, 9.1 and 11.5), over a
 * `Transport`. It submits and settles signed intents, makes the bounded
 * reads, and follows a receipt and a duty.
 *
 * It derives no judgment. What a caller may do in a scope it learns by
 * reading: the summary, and the scope's published definition.
 *
 * **Retrying.** `submit` answers with the scope's `Answer`. When no answer
 * could be read, it rejects with `TransportError`: the act may or may not
 * have been recorded. After that, and after an `unavailable` answer, the
 * caller submits the SAME signed intent again. If the first was accepted,
 * the retry returns the same receipt. `settle` returns that receipt at any
 * later time, for the exact signed intent.
 */

import type {
  Answer, Cursor, DeclaredDefinition, Digest, Duty, DutyId, Entry, Founded, Grant, Head, Item, PlatformDefinition, Read, ReadRefusal, Receipt, ScopeApi, ScopeId, Sealed, Settlement,
  SignedIntent, Summary,
} from "@generalbusiness/artroom-contract";
import { definitionDigest, entryHash, isDigest, parseStrict } from "@generalbusiness/artroom-bytes";

/** How a handle reaches a scope service: the contract's `ScopeApi`. `http.ts` and `binding.ts` each make one. */
export type Transport = ScopeApi;

/** No answer could be read: the request or its reply was lost, or the reply was not an answer. Nothing is known about what was recorded. */
export class TransportError extends Error {
  override readonly name = "TransportError";
}

/**
 * The entry a receipt names, checked. `hash-mismatch`: the scope has an
 * entry at that position whose bytes do not hash to the receipt's fact, so
 * the receipt is not of this history.
 */
export type Followed = { ok: true; at: Head; entry: Entry } | { ok: false; reason: ReadRefusal | "hash-mismatch" };

export class ScopeHandle {
  readonly scope: ScopeId;
  readonly #transport: Transport;
  readonly #reader: unknown;

  /** `reader`: what this caller presents to the read port. What it must be is the authority note's. */
  constructor(transport: Transport, scope: ScopeId, reader: unknown = null) {
    this.#transport = transport;
    this.scope = scope;
    this.#reader = reader;
  }

  /** Submit a signed intent, with the grants it is presented under. See "Retrying" above. */
  submit(signed: SignedIntent, grants: readonly Grant[] = []): Promise<Answer> { return this.#transport.submit(this.scope, signed, grants); }

  /** The receipt of an accepted act, by its exact signed intent, or `not-found` (section 4.2). It admits nothing. */
  settle(signed: SignedIntent): Promise<Settlement> { return this.#transport.settle(this.scope, signed); }

  // The reads of section 9.1. Each is a statement about `at`; a page with `next` is read on with that cursor.

  summary(): Promise<Read<Summary>> { return this.#transport.summary(this.scope, this.#reader); }
  /** A page of the retained final items of one type. */
  items(type: string, cursor?: Cursor): Promise<Read<readonly Item[]>> { return this.#transport.items(this.scope, this.#reader, type, cursor); }
  history(cursor?: Cursor): Promise<Read<readonly Sealed[]>> { return this.#transport.history(this.scope, this.#reader, cursor); }
  entry(seq: number): Promise<Read<Sealed>> { return this.#transport.entry(this.scope, this.#reader, seq); }
  outbox(cursor?: Cursor): Promise<Read<readonly Duty[]>> { return this.#transport.outbox(this.scope, this.#reader, cursor); }

  /**
   * The scope's published definition: the declaration the scope retains
   * under the digest its summary names, checked against that digest. A
   * platform definition has no declaration to read.
   */
  async definition(): Promise<Read<DeclaredDefinition>> {
    const summary = await this.summary();
    if (!summary.ok) return summary;
    const named: Digest | PlatformDefinition = summary.value.definition;
    if (!isDigest(named)) return { ok: false, reason: "unsupported-definition" };
    const kept = await this.#transport.retained(this.scope, this.#reader, "definition", named);
    if (!kept.ok) return kept;
    try {
      const declared = parseStrict(kept.value.bytes) as DeclaredDefinition;
      if (definitionDigest(declared) === named) return { ok: true, at: kept.at, value: declared, complete: true };
    } catch { /* not canonical values */ }
    return { ok: false, reason: "unavailable" };
  }

  /**
   * Follow a receipt: read the entry it names, and check that the entry's
   * own bytes hash to the receipt's fact. The hash is computed here; the
   * hash the service sends beside the entry is not used.
   */
  async followReceipt(receipt: Receipt): Promise<Followed> {
    const { at, seq, hash } = receipt.fact;
    if (at.scope !== this.scope) return { ok: false, reason: "not-found" };
    const read = await this.entry(seq);
    if (!read.ok) return { ok: false, reason: read.reason };
    const entry = read.value.entry;
    let found: Digest | null = null;
    try {
      found = entryHash(entry);
    } catch { /* not canonical values */ }
    if (found !== hash) return { ok: false, reason: entry.at?.scope === at.scope && entry.at.inc !== at.inc ? "wrong-incarnation" : "hash-mismatch" };
    return { ok: true, at: read.at, entry };
  }

  /** Follow a duty: the outbox status of one send, by the duty ID a receipt lists. */
  followDuty(duty: DutyId): Promise<Read<Duty>> { return this.#transport.duty(this.scope, this.#reader, duty); }
}

/**
 * Found a repository's directory (section 7.1), and take a handle on it when
 * the founding is accepted. `definitions`: the declarations the directory's
 * definition names in `create` sends, which the directory retains for its
 * children. A founding is retried with the same signed intent, like an act.
 */
export async function found(
  transport: Transport, founding: SignedIntent, definition: DeclaredDefinition | Digest | PlatformDefinition, definitions: readonly DeclaredDefinition[] = [], reader: unknown = null,
): Promise<{ answer: Founded; scope: ScopeHandle | null }> {
  const answer = await transport.found(founding, definition, definitions);
  return { answer, scope: answer.answer === "accepted" ? new ScopeHandle(transport, answer.receipt.fact.at.scope, reader) : null };
}
