/**
 * Custody of signed envelopes (plan 031, section 7). Every act tool,
 * `create` and `prepare` require a caller's `idempotencyKey`. The server
 * keeps the exact signed envelope it sends under that key, before it sends
 * it, and a repeat under the same key either resends those same bytes or
 * returns the outcome it kept. The server never chooses a key.
 *
 * - **Identity**: service, the membership standing is read from with its
 *   incarnation, the signer's key, the target scope and incarnation (or the
 *   definition of a creation), and the key. A record is named by a digest of
 *   its identity.
 * - **Binding**: the binding identity and the definition digest the target
 *   was under. Never a surface name, so a change of words changes nothing
 *   here.
 * - **Requested meaning**: a digest of what was asked. The same key with
 *   another meaning is refused as `conflicting`, and nothing is sent.
 * - **Phase**: `prepared`, `sent` and `unknown` are unresolved, and are
 *   recovered by resending the same bytes. `accepted`, `refused` and
 *   `mismatch` are terminal: their outcome is returned and nothing is sent,
 *   unless the caller asks with `resubmit: true`; every later outcome is
 *   appended, never replacing an earlier one.
 * - **What resolves `unknown`**: a receipt from settlement, or a definitive
 *   `accepted`, `refused` or `mismatch` from the same scope and incarnation.
 *   Never `unavailable`, never `not-found` from settlement, and never the
 *   passing of `notAfter`.
 * - **Preparation steps**: each under its own identity (the intent's
 *   digest, the resource and its incarnation, the capability and the step),
 *   with its own phase and answer, apart from the act's phase. A step's
 *   answer is never the act's receipt.
 * - **Capacity**: at most 256 unresolved records, never evicted. Terminal
 *   records are archived by the store; outcomes past 64 move to a segment.
 *
 * The store is a port: `memoryStore` here for a process that keeps nothing,
 * and the file store of `node.ts` under `ARTROOM_HOME/private/mcp-custody/`.
 */

import type { Answer, Beside, DeclaredDefinition, Digest, KeyId, PlatformDefinition, Receipt, ScopeRef, SignedIntent } from "@generalbusiness/artroom-contract";
import { canonicalize, digestBytes, intentDigest, utf8 } from "@generalbusiness/artroom-bytes";

export const UNRESOLVED_MOST = 256;
export const OUTCOMES_INLINE = 64;
export const RECORD_BYTES = 2 * 1024 * 1024;
export const KEY_BYTES = 128;

export interface Identity {
  service: string;
  membership: ScopeRef | null;
  signer: KeyId;
  target: ScopeRef | { create: Digest | PlatformDefinition };
  key: string;
}

export interface BindingRecord { definition: string; kind: string; declaration: Digest | null; pinned: Digest | PlatformDefinition }

/** The exact bytes that were sent, and what travelled beside them. A creation also keeps its definition and the definitions it names. */
export interface Envelope {
  signed: SignedIntent;
  beside: Beside;
  creation?: { definition: DeclaredDefinition | Digest | PlatformDefinition; definitions: readonly DeclaredDefinition[] };
}

export type Phase = "prepared" | "sent" | "unknown" | "accepted" | "refused" | "mismatch";
export const TERMINAL: ReadonlySet<Phase> = new Set(["accepted", "refused", "mismatch"]);

/** One outcome of one sending. `lost`: no answer could be read. */
export type Outcome = { at: string; answer: Answer } | { at: string; lost: true } | { at: string; settled: Receipt };

export interface Step {
  intent: Digest;
  resource: ScopeRef;
  capability: string;
  step: string;
  phase: "prepared" | "sent" | "unknown" | "answered";
  answers: { at: string; answer: Answer | null }[];
}

export interface CustodyRecord {
  v: 1;
  identity: Identity;
  binding: BindingRecord;
  meaning: Digest;
  envelope: Envelope;
  phase: Phase;
  /** The latest outcomes, at most `OUTCOMES_INLINE`; `count` is how many there have been. Older ones are in the record's segment. */
  outcomes: Outcome[];
  count: number;
  steps: Record<string, Step>;
  created: string;
  updated: string;
}

/** Where records live. Every write is whole and read back before the caller sends. */
export interface CustodyStore {
  /** An exclusive lock on one identity, or null when another holds it. */
  lock(id: string, notAfter: string): Promise<(() => Promise<void>) | null>;
  read(id: string): Promise<CustodyRecord | null>;
  /** Write whole, then read back and compare; throws when the bytes read back differ. */
  write(id: string, record: CustodyRecord): Promise<void>;
  /** The records not yet terminal, oldest first: their identity digests and keys. */
  unresolved(): Promise<{ id: string; key: string; created: string }[]>;
  /** Append outcomes to the record's segment, in order. */
  segment(id: string, outcomes: readonly Outcome[]): Promise<void>;
  /** Every outcome the segment holds, in order. */
  segmented(id: string): Promise<Outcome[]>;
}

export const identityId = (identity: Identity): string => digestBytes(utf8(canonicalize(identity))).slice(7);
export const meaningOf = (asked: unknown): Digest => digestBytes(utf8(canonicalize(asked)));
export const stepId = (s: { intent: Digest; resource: ScopeRef; capability: string; step: string }): string =>
  digestBytes(utf8(canonicalize([s.intent, s.resource.scope, s.resource.inc, s.capability, s.step]))).slice(7);

/** Why custody sent nothing. */
export type HeldBack =
  | { held: "conflicting"; recorded: string }
  | { held: "full"; keys: string[] }
  | { held: "locked" }
  | { held: "unreadable" }
  | { held: "too-large" };

export class CustodyError extends Error {
  constructor(readonly why: HeldBack) { super(`custody: ${why.held}`); }
}

/** No answer could be read for a sending, so its outcome is unknown. The record says `unknown`. */
export class Lost extends Error {}

const keyBytes = (key: unknown): boolean => typeof key === "string" && utf8(key).length >= 1 && utf8(key).length <= KEY_BYTES;
export const validKey = keyBytes;

/** What a call under custody gives back: the outcome, and whether it was sent now or kept from before. */
export type Sent = { record: CustodyRecord; answer: Answer; retained: boolean } | { record: CustodyRecord; lost: true };

export class Custody {
  constructor(readonly store: CustodyStore, private readonly now: () => string) {}

  async #locked<T>(id: string, notAfter: string, work: () => Promise<T>): Promise<T> {
    const release = await this.store.lock(id, notAfter);
    if (!release) throw new CustodyError({ held: "locked" });
    try { return await work(); } finally { await release(); }
  }

  async #read(id: string): Promise<CustodyRecord | null> {
    try { return await this.store.read(id); } catch { throw new CustodyError({ held: "unreadable" }); }
  }

  async #write(id: string, record: CustodyRecord): Promise<void> {
    if (utf8(canonicalize(record)).length > RECORD_BYTES) throw new CustodyError({ held: "too-large" });
    try { await this.store.write(id, record); } catch { throw new CustodyError({ held: "unreadable" }); }
  }

  /** Keep the outcome: inline up to the bound, the oldest moved to the segment. */
  async #outcome(id: string, record: CustodyRecord, outcome: Outcome): Promise<void> {
    record.outcomes.push(outcome);
    record.count++;
    if (record.outcomes.length > OUTCOMES_INLINE) await this.store.segment(id, record.outcomes.splice(0, record.outcomes.length - OUTCOMES_INLINE));
  }

  /** Every outcome of a record, the segment's first. */
  async outcomes(id: string, record: CustodyRecord): Promise<Outcome[]> {
    return [...(record.count > record.outcomes.length ? await this.store.segmented(id) : []), ...record.outcomes];
  }

  /** The record under an identity, or null. */
  find(identity: Identity): Promise<CustodyRecord | null> { return this.#read(identityId(identity)); }

  /**
   * Keep the envelope under its identity without sending it: the first
   * preparation. The record that holds it already is returned, when its
   * meaning is the same; another meaning is refused.
   */
  async keep(identity: Identity, meaning: Digest, build: () => Promise<{ binding: BindingRecord; envelope: Envelope }>, notAfter: string): Promise<CustodyRecord> {
    const id = identityId(identity);
    return this.#locked(id, notAfter, async () => this.#kept(id, identity, meaning, build));
  }

  async #kept(id: string, identity: Identity, meaning: Digest, build: () => Promise<{ binding: BindingRecord; envelope: Envelope }>): Promise<CustodyRecord> {
    const found = await this.#read(id);
    if (found) {
      if (found.meaning !== meaning) throw new CustodyError({ held: "conflicting", recorded: `${found.envelope.signed.intent.kind} on ${found.identity.target && "scope" in found.identity.target ? found.identity.target.scope : "a creation"}` });
      return found;
    }
    const open = await this.store.unresolved();
    if (open.length >= UNRESOLVED_MOST) throw new CustodyError({ held: "full", keys: open.slice(0, 8).map((o) => o.key) });
    const { binding, envelope } = await build();
    const at = this.now();
    const record: CustodyRecord = { v: 1, identity, binding, meaning, envelope, phase: "prepared", outcomes: [], count: 0, steps: {}, created: at, updated: at };
    await this.#write(id, record);
    return record;
  }

  /**
   * Send under custody. First preparation: keep, read back, send. A record
   * that is unresolved: resend the same bytes. A terminal record: return its
   * outcome and send nothing, unless `resubmit`.
   */
  async send(identity: Identity, meaning: Digest, build: () => Promise<{ binding: BindingRecord; envelope: Envelope }>, deliver: (envelope: Envelope) => Promise<Answer>, options: { resubmit?: boolean; notAfter: string }): Promise<Sent> {
    const id = identityId(identity);
    return this.#locked(id, options.notAfter, async () => {
      const record = await this.#kept(id, identity, meaning, build);
      if (TERMINAL.has(record.phase) && !options.resubmit) {
        const last = [...record.outcomes].reverse().find((o): o is { at: string; answer: Answer } => "answer" in o)
          ?? [...record.outcomes].reverse().filter((o): o is { at: string; settled: Receipt } => "settled" in o).map((o) => ({ at: o.at, answer: { answer: "accepted", receipt: o.settled } as Answer }))[0];
        if (last) return { record, answer: last.answer, retained: true };
      }
      if (!TERMINAL.has(record.phase)) record.phase = "sent";
      record.updated = this.now();
      await this.#write(id, record);
      let answer: Answer;
      try {
        answer = await deliver(record.envelope);
      } catch (error) {
        if (!(error instanceof Lost)) throw error;
        if (!TERMINAL.has(record.phase)) record.phase = "unknown";
        await this.#outcome(id, record, { at: this.now(), lost: true });
        record.updated = this.now();
        await this.#write(id, record);
        return { record, lost: true };
      }
      // `unavailable` resolves nothing; a definitive answer does.
      if (answer.answer === "unavailable") { if (!TERMINAL.has(record.phase)) record.phase = "unknown"; }
      else record.phase = answer.answer;
      await this.#outcome(id, record, { at: this.now(), answer });
      record.updated = this.now();
      await this.#write(id, record);
      return { record, answer, retained: false };
    });
  }

  /**
   * Settle: a terminal record's outcome, or the scope's settlement of the
   * recorded envelope. A receipt resolves the record as accepted; `not-found`
   * and a lost reply resolve nothing. Signs nothing, sends no act.
   */
  async settle(identity: Identity, read: (envelope: Envelope) => Promise<Receipt | null>): Promise<{ record: CustodyRecord; receipt: Receipt | null } | null> {
    const id = identityId(identity);
    const record = await this.#read(id);
    if (!record) return null;
    if (TERMINAL.has(record.phase)) return { record, receipt: null };
    return this.#locked(id, record.envelope.signed.intent.notAfter, async () => {
      const fresh = (await this.#read(id))!;
      if (TERMINAL.has(fresh.phase)) return { record: fresh, receipt: null };
      let receipt: Receipt | null = null;
      try { receipt = await read(fresh.envelope); } catch (error) { if (!(error instanceof Lost)) throw error; }
      if (receipt) {
        fresh.phase = "accepted";
        await this.#outcome(id, fresh, { at: this.now(), settled: receipt });
        fresh.updated = this.now();
        await this.#write(id, fresh);
      }
      return { record: fresh, receipt };
    });
  }

  /**
   * One preparation step, under its own identity in the record: send the
   * request, record the resource's answer or `unknown`. The act's phase does
   * not move. A step that has an answer is asked again only when the caller
   * asks again: the resource answers the same step with its first entry.
   */
  async step(identity: Identity, resource: ScopeRef, capability: string, step: string, deliver: (signed: SignedIntent) => Promise<Answer>): Promise<{ record: CustodyRecord; step: Step; answer: Answer | null }> {
    const id = identityId(identity);
    const record = await this.#read(id);
    if (!record) throw new CustodyError({ held: "unreadable" });
    return this.#locked(id, record.envelope.signed.intent.notAfter, async () => {
      const fresh = (await this.#read(id))!;
      const intent = intentDigest(fresh.envelope.signed.intent);
      const sid = stepId({ intent, resource, capability, step });
      const entry: Step = fresh.steps[sid] ?? { intent, resource, capability, step, phase: "prepared", answers: [] };
      entry.phase = "sent";
      fresh.steps[sid] = entry;
      await this.#write(id, fresh);
      let answer: Answer | null = null;
      try { answer = await deliver(fresh.envelope.signed); } catch (error) { if (!(error instanceof Lost)) throw error; }
      entry.phase = answer === null || answer.answer === "unavailable" ? "unknown" : "answered";
      entry.answers.push({ at: this.now(), answer });
      if (entry.answers.length > OUTCOMES_INLINE) entry.answers.splice(0, entry.answers.length - OUTCOMES_INLINE);
      fresh.updated = this.now();
      await this.#write(id, fresh);
      return { record: fresh, step: entry, answer };
    });
  }
}

/** A store in memory: for a process that keeps nothing, and for a test in the Workers runtime. Each write is a whole copy, read back. */
export function memoryStore(): CustodyStore & { records: Map<string, string> } {
  const records = new Map<string, string>();
  const segments = new Map<string, Outcome[]>();
  const locks = new Set<string>();
  return {
    records,
    lock: async (id) => {
      if (locks.has(id)) return null;
      locks.add(id);
      return async () => { locks.delete(id); };
    },
    read: async (id) => { const text = records.get(id); return text === undefined ? null : JSON.parse(text) as CustodyRecord; },
    write: async (id, record) => {
      const text = canonicalize(record);
      records.set(id, text);
      if (records.get(id) !== text) throw new Error("read back differs");
    },
    unresolved: async () => [...records.entries()].map(([id, text]) => [id, JSON.parse(text) as CustodyRecord] as const)
      .filter(([, r]) => !TERMINAL.has(r.phase)).sort(([, a], [, b]) => (a.created < b.created ? -1 : 1)).map(([id, r]) => ({ id, key: r.identity.key, created: r.created })),
    segment: async (id, outcomes) => { segments.set(id, [...(segments.get(id) ?? []), ...structuredClone(outcomes as Outcome[])]); },
    segmented: async (id) => structuredClone(segments.get(id) ?? []),
  };
}
