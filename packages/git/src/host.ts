/**
 * The host port, and the driver of the token ledger (authority note,
 * sections 5.3, 5.4 and 5.7; I3 plan, step 19). It is the reviewed
 * successor of the earlier mint ledger and host adapter
 * (`notes/2026-10-05-i3-host-review.md`).
 *
 * A token is minted and revoked at a Git host as two operations of the
 * ledger of outside effects, which the scope keeps (`derive/src/ledger.ts`,
 * `scope/src/operations.ts`). That ledger records the duty before a request
 * is sent, sends the one request of an attempt at most once, and keeps an
 * outcome that is not known as `unknown`. This file adds no second ledger.
 * It is the port that the scope's driver gives one request to, for the two
 * kinds that the code of `hold@1` opens: `mint` and `revoke`.
 *
 * `GitHost` is the host's side: one call that mints and one that revokes.
 * No adapter for a real host is here. A deployment has none until the
 * installation design names the host (plan question Q6), and the
 * production ports of a scope send nothing outside the service. Test
 * support has a stand-in.
 *
 * **What a request names.** Only what the sealed entry that opened the
 * operation holds: the `token` record that names the operation as its mint
 * or as its revocation (section 5.4, rule 5). A revocation is sent for the
 * token ID in that record and for no other. Nothing is listed, swept or
 * guessed. An entry that holds no such record sends nothing, and the
 * attempt is answered `refused`, as not sent.
 *
 * **Where a token's plaintext lives, and for how long.**
 *
 * 1. It is first in the host's reply to a mint, in this process's memory.
 * 2. The driver keeps it in one private map, by the attempt that minted it,
 *    while the scope judges that attempt's answer. It is in no answer that
 *    the driver gives the scope, so it is in no entry, no row and no read.
 *    It is in no log line and no thrown error: the driver logs fixed words,
 *    and never passes on what a host threw.
 * 3. When the scope tells the driver that the outcome entry is sealed, the
 *    driver reads that entry. If the entry made the token `live`, with the
 *    ID that the reply gave, the plaintext is handed to `Custody`, which is
 *    the gateway's side (section 5.7, "The plaintext"). In every other case
 *    it is dropped: the entry made the token `revoking`, because its use
 *    had ended before the answer came; the answer was judged and wrote no
 *    entry; or the entry is not that attempt's `confirmed` outcome.
 * 4. From then on the driver holds nothing of it. A process that ends
 *    before step 3 loses it. Nobody then holds that token's plaintext, so
 *    nobody can use the token.
 *
 * **What an outcome that is not known owes.**
 *
 * - A mint: the token's record stays `minting`. Nothing is minted again for
 *   that operation, and nothing else settles it: not a restart, a listing,
 *   elapsed time or another token. Only that request's own answer may
 *   follow, given to `answered` when the host delivers it. No revocation is
 *   sent on a guess, because no ID is known.
 * - A revocation: the token's record stays `revoking`, and the operation is
 *   not settled. The duty stays. A further attempt is a new request with
 *   its own number, which the ledger opens, and its answer settles nothing
 *   about the earlier one. Only a `confirmed` revocation makes the record
 *   `ended`.
 *
 * A host's call that throws, that gives no reply, or that gives a reply
 * this file cannot read, is no answer: the attempt is `unknown`.
 */

import { timeMs } from "@generalbusiness/artroom-bytes";
import type { DecisiveEvidence, Digest, Effect, Entry, OperationId, ScopeRef, Timestamp } from "@generalbusiness/artroom-contract";

/** The owner and the two kinds of operation that this driver sends: the names that the code of `hold@1` states (`derive/src/capability/hold.ts`, `HOLD_KINDS`). */
export const TOKEN_OWNER = "hold@1";
export const TOKEN_KINDS = { mint: "mint", revoke: "revoke" } as const;

/**
 * The form of a token's ID at the host, as this package takes one: the form
 * that the gateway takes (`gateway.ts`, `open`). An ID is written in an
 * entry, so it is bounded, and it is never the plaintext.
 */
const TOKEN_ID = /^[A-Za-z0-9._:-]{1,200}$/;

/** What a token is for, as its record states it (section 5.7): a hold and one instance of it, or one attempt of an operation on a staged root. */
export type TokenFor = { hold: number; instance: string } | { root: number; operation: OperationId; attempt: number };

/** One mint, as the host is asked. Every member is read from the sealed entry that opened the operation. */
export interface MintAsk {
  scope: ScopeRef; operation: OperationId; attempt: number;
  /** The token's number in the scope's ledger: the key of its record. */
  token: number;
  /** `workspace`, `fork-read` or `staging`, as the record states it. */
  purpose: string;
  for: TokenFor;
}

/** One revocation, by the token's ID at the host. The ID is the one in the sealed record, and no other. */
export interface RevokeAsk { scope: ScopeRef; operation: OperationId; attempt: number; token: number; id: string }

/** The host's own answer to a mint: a token, with its ID, its end time on the host's clock and its plaintext; or its refusal, which minted nothing. */
export type MintReply = { minted: true; id: string; ends: Timestamp; plaintext: string } | { minted: false };

/** The host's own answer to a revocation by ID: revoked; or that no such token is live. */
export type RevokeReply = { revoked: true } | { revoked: false };

/**
 * A Git host's token interface. Each call makes one request and never
 * repeats it. A call that fails or is not answered rejects, or never
 * resolves: the driver then has no answer. An implementation presents the
 * host account's credential itself (section 5.5), and never returns it.
 */
export interface GitHost {
  mint(ask: MintAsk): Promise<MintReply>;
  revoke(ask: RevokeAsk): Promise<RevokeReply>;
}

/** A token that its sealed outcome entry made `live`, with its plaintext: what the gateway's side is handed. */
export interface LiveToken { scope: ScopeRef; token: number; id: string; ends: Timestamp; purpose: string; for: TokenFor; state: "live"; plaintext: string }

/** The gateway's side of the handoff (section 5.3, "Held where"). After `take` returns, the driver holds nothing of the plaintext. */
export interface Custody { take(token: LiveToken): void }

/** The scope's request of one attempt, as its driver gives it (`scope/src/operations.ts`, `EffectRequest`). */
export interface TokenRequest { scope: ScopeRef; operation: OperationId; attempt: number; owner: string; kind: string; origin: { entry: Entry; hash: Digest } }
/** The answer that the scope's driver takes (`EffectAnswer`). It never holds a plaintext. */
export interface TokenAnswer { result: "confirmed" | "refused"; evidence: DecisiveEvidence }
/** One attempt, as the scope's driver names it. */
export interface AttemptOf { scope: ScopeRef; operation: OperationId; attempt: number }

export interface TokenDriverOptions {
  host: GitHost;
  custody: Custody;
  /** Told each failure, by fixed words only: the kind of call and what happened. Never a host's text. */
  log?: (event: { step: "mint" | "revoke" | "handoff"; event: string }) => void;
}

type Recorded = Extract<Effect, { effect: "record" }>;

const keyOf = (at: AttemptOf): string => `${at.scope.scope}/${at.scope.inc}/${at.operation}#${at.attempt}`;
const position = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const isOperation = (value: unknown): value is OperationId => typeof value === "string" && /^(0|[1-9][0-9]{0,15}):(0|[1-9][0-9]{0,15})$/.test(value);

/** The `token` record of the sealed entry that names the operation in the member `by`. Null: the entry holds none, or more than one. */
function tokenOf(entry: Entry, by: "mint" | "revocation", operation: OperationId): Recorded | null {
  const found = entry.effects.filter((e): e is Recorded => e.effect === "record" && e.capability === TOKEN_OWNER && e.kind === "token" && e.values[by] === operation);
  return found.length === 1 && position(found[0]!.key[0]) ? found[0]! : null;
}

/** What the record says the token is for, or null when it says neither form. */
function forOf(values: Readonly<Record<string, unknown>>): TokenFor | null {
  if (position(values["hold"]) && typeof values["instance"] === "string") return { hold: values["hold"], instance: values["instance"] };
  if (position(values["root"]) && isOperation(values["operation"]) && position(values["attempt"])) return { root: values["root"], operation: values["operation"], attempt: values["attempt"] };
  return null;
}

/** I3 deltas, entry EG7: an answer that nothing was sent, or that the host refused, as plain data. No body holds a host's text. */
const notSent = (why: string): TokenAnswer => ({ result: "refused", evidence: { basis: "own-answer", body: { send: "not-sent", why } } });

export class TokenDriver {
  readonly #host: GitHost;
  readonly #custody: Custody;
  readonly #log: NonNullable<TokenDriverOptions["log"]>;
  /**
   * The plaintexts in hand, by the attempt that minted each: step 2 of the
   * custody, above. In memory only. An entry leaves when the scope has
   * judged that attempt's answer, or with the process.
   */
  readonly #minted = new Map<string, { id: string; plaintext: string }>();
  #deliver: ((operation: OperationId, attempt: number, answer: TokenAnswer) => Promise<unknown>) | null = null;

  constructor(options: TokenDriverOptions) {
    this.#host = options.host;
    this.#custody = options.custody;
    this.#log = options.log ?? (() => undefined);
  }

  /** How many plaintexts the driver holds now. A count, and never a value. */
  get holding(): number { return this.#minted.size; }

  /** Only a mint and a revocation of `hold@1`. No other owner's token has a record that a request could be read from (I3 deltas, entry ET4). */
  accepts(owner: string, kind: string): boolean {
    return owner === TOKEN_OWNER && (kind === TOKEN_KINDS.mint || kind === TOKEN_KINDS.revoke);
  }

  /** The scope's driver gives the function that takes an answer which arrives by itself, after its request. */
  late(deliver: (operation: OperationId, attempt: number, answer: TokenAnswer) => Promise<unknown>): void { this.#deliver = deliver; }

  /** One request of one attempt, and its answer, or null for none. It never rejects, and what a host threw goes nowhere. */
  async send(request: TokenRequest): Promise<TokenAnswer | null> {
    if (!this.accepts(request.owner, request.kind)) return notSent("not-a-token-operation");
    if (request.kind === TOKEN_KINDS.mint) {
      const ask = this.#mintAsk(request);
      if (ask === null) return notSent("no-token-record");
      let reply: unknown;
      try {
        reply = await this.#host.mint(ask);
      } catch {
        // Not the error: its text may hold a credential. The request may have reached the host, so this is no answer.
        this.#log({ step: "mint", event: "host-failed" });
        return null;
      }
      return this.#minting(request, reply);
    }
    const record = tokenOf(request.origin.entry, "revocation", request.operation);
    const id = record?.values["id"];
    // Rule 5: a revocation names the ID that this scope's own sealed record holds. With none, nothing is sent.
    if (!record || record.state !== "revoking" || typeof id !== "string" || !TOKEN_ID.test(id)) return notSent("no-token-record");
    let reply: unknown;
    try {
      reply = await this.#host.revoke({ scope: request.scope, operation: request.operation, attempt: request.attempt, token: record.key[0] as number, id });
    } catch {
      this.#log({ step: "revoke", event: "host-failed" });
      return null;
    }
    return this.#revoking(id, reply);
  }

  /**
   * That request's own answer, when the host delivers it by itself: after
   * the attempt was recorded `unknown`, or after a restart. `ask` is the
   * request as it was sent. The reply is read as a reply of `send` is, and
   * given to the scope's driver, which judges whether it is that attempt's
   * answer: an attempt that was never sent has none. What the scope's driver
   * answers is returned, or null when the reply is no answer.
   */
  async answered(ask: MintAsk | RevokeAsk, reply: MintReply | RevokeReply): Promise<unknown> {
    const answer = "id" in ask ? (TOKEN_ID.test(ask.id) ? this.#revoking(ask.id, reply) : null) : this.#minting(ask, reply);
    if (answer === null || this.#deliver === null) {
      this.#minted.delete(keyOf(ask));
      return null;
    }
    return this.#deliver(ask.operation, ask.attempt, answer);
  }

  /**
   * The scope has judged the answer that this port gave for an attempt.
   * `sealed`: the outcome entry that the answer wrote, after its commit, or
   * null when it wrote none: a copy, a contradiction, or no answer. Step 3
   * of the custody, above.
   */
  judged(at: AttemptOf, sealed: { entry: Entry; hash: Digest } | null): void {
    const key = keyOf(at);
    const held = this.#minted.get(key);
    if (held === undefined) return;
    this.#minted.delete(key);
    const input = sealed?.entry.input;
    if (!sealed || input?.type !== "outcome" || input.operation !== at.operation || input.attempt !== at.attempt || input.result !== "confirmed") return;
    // Section 5.7: only when that entry made the token `live`. An entry that made it `revoking` gives the plaintext to nobody.
    const record = tokenOf(sealed.entry, "mint", at.operation);
    const of = record ? forOf(record.values) : null;
    if (!record || !of || record.state !== "live" || record.values["id"] !== held.id || timeMs(record.values["ends"]) === null || typeof record.values["purpose"] !== "string") return;
    try {
      this.#custody.take({ scope: at.scope, token: record.key[0] as number, id: held.id, ends: record.values["ends"] as Timestamp, purpose: record.values["purpose"], for: of, state: "live", plaintext: held.plaintext });
    } catch {
      // The gateway's side did not take it. The plaintext is dropped here all the same: the token is `live` and nobody can use it.
      this.#log({ step: "handoff", event: "custody-failed" });
    }
  }

  /** A host's reply to a revocation by ID, as an answer for the scope. */
  #revoking(id: string, reply: unknown): TokenAnswer | null {
    const revoked = (reply as { revoked?: unknown } | null)?.revoked;
    if (revoked === true) return { result: "confirmed", evidence: { basis: "own-answer", body: { token: id } } };
    // Section 5.7, "Evidence of each outside effect": the host's own answer that no such token is live shows that this attempt did nothing.
    if (revoked === false) return { result: "refused", evidence: { basis: "own-answer", body: { token: id, send: "refused", why: "not-live" } } };
    this.#log({ step: "revoke", event: "no-answer" });
    return null;
  }

  #mintAsk(request: TokenRequest): MintAsk | null {
    const record = tokenOf(request.origin.entry, "mint", request.operation);
    const of = record ? forOf(record.values) : null;
    if (!record || !of || record.state !== "minting" || typeof record.values["purpose"] !== "string") return null;
    return { scope: request.scope, operation: request.operation, attempt: request.attempt, token: record.key[0] as number, purpose: record.values["purpose"], for: of };
  }

  /**
   * A host's reply to a mint, as an answer for the scope. The plaintext is
   * taken into the driver's hand here and is no part of the answer.
   *
   * `confirmed` needs the token's ID and its end time (section 5.7,
   * "Evidence of each outside effect"). A reply with no ID in the form
   * above, with no end time, or whose ID is or holds its own plaintext, is
   * no answer: the attempt is `unknown`, and nothing of the reply is kept
   * (I3 deltas, entry ET5). A token with an ID, an end time and no
   * plaintext is `confirmed`: the ledger then knows the ID, and can revoke
   * it, and nobody can use it.
   */
  #minting(at: AttemptOf, reply: unknown): TokenAnswer | null {
    const r = reply as { minted?: unknown; id?: unknown; ends?: unknown; plaintext?: unknown } | null;
    if (r?.minted === false) return { result: "refused", evidence: { basis: "own-answer", body: { send: "refused", why: "host-refused" } } };
    const plaintext = typeof r?.plaintext === "string" ? r.plaintext : "";
    if (r?.minted !== true || typeof r.id !== "string" || !TOKEN_ID.test(r.id) || timeMs(r.ends) === null || (plaintext !== "" && r.id.includes(plaintext))) {
      this.#log({ step: "mint", event: "no-answer" });
      return null;
    }
    if (plaintext !== "") this.#minted.set(keyOf(at), { id: r.id, plaintext });
    return { result: "confirmed", evidence: { basis: "own-answer", body: { token: r.id, ends: r.ends as Timestamp } } };
  }
}
