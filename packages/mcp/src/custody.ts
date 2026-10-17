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
 *   `mismatch` are terminal. `accepted` and `mismatch` are never sent again,
 *   even with `resubmit: true`. A `refused` record is sent again only when
 *   the caller asks with `resubmit: true`: the server first keeps a new
 *   attempt, unresolved (`sent`), with the refusal kept as history, so a lost
 *   or `unavailable` reply to the resend leaves the record unresolved and
 *   `settle` asks the scope.
 * - **The outcome**: always the newest decisive outcome of the current
 *   attempt, chronologically: an answer that is not `unavailable`, or a
 *   receipt from settlement. Every outcome is appended, never replacing an
 *   earlier one, and each carries its attempt.
 * - **What resolves `unknown`**: a receipt from settlement, or a definitive
 *   `accepted`, `refused` or `mismatch` from the same scope and incarnation.
 *   Never `unavailable`, never `not-found` from settlement, and never the
 *   passing of `notAfter`.
 * - **Preparation steps**: each under its own identity (the intent's
 *   digest, the resource and its incarnation, the capability and the step),
 *   with its own phase and answer, apart from the act's phase. A step's
 *   answer is never the act's receipt. A step keeps its first answer and its
 *   latest 63; answers between them are not kept. The act's outcomes are
 *   never dropped: that rule is for steps only.
 * - **Standalone steps** (a capability step with no act, such as
 *   `hold@1:instance`): the record's envelope is the step's own intent, and
 *   it is never submitted as an act. A decisive answer from the resource
 *   (accepted or refused) makes the step terminal: a later call returns
 *   that answer and sends nothing. When every step the record holds is
 *   decisive, the record is `settled`, which is terminal and archived like
 *   any other, and never an act's acceptance. A lost or unavailable answer
 *   leaves the step and the record unresolved, and a retry sends the exact
 *   signed step again.
 * - **Capacity**: at most 256 unresolved records, never evicted, counted and
 *   admitted under the store's exclusive section, so two processes cannot
 *   both admit the 256th. A record is at most 2 MiB: an act whose envelope
 *   would not fit is refused before it is signed, and outcomes that would
 *   push a record past the bound move to its segment, which keeps every one.
 *   Terminal records are archived by the store; outcomes past 64 inline move
 *   to the segment.
 *
 * The store is a port: `memoryStore` here for a process that keeps nothing,
 * and the file store of `node.ts` under `ARTROOM_HOME/private/mcp-custody/`.
 */

import type { Answer, Beside, DeclaredDefinition, Digest, KeyId, PlatformDefinition, Receipt, ScopeRef, SignedIntent } from "@generalbusiness/dap-contract";
import { canonicalize, digestBytes, intentDigest, utf8 } from "@generalbusiness/artroom-bytes";
import { custodyTransition } from "./metrics.ts";

export const UNRESOLVED_MOST = 256;
export const OUTCOMES_INLINE = 64;
/** The most canonical bytes the inline outcomes hold before the oldest spill to the segment (the hosted design, section 3.6). */
export const OUTCOMES_INLINE_BYTES = 256 * 1024;
export const RECORD_BYTES = 2 * 1024 * 1024;
export const KEY_BYTES = 128;
/** The most outcomes the search for a record's decisive outcome reads from its segment at once. */
export const DECIDED_SLICE = 64;

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

/**
 * `settled` is the terminal phase of a record that holds only standalone capability steps (steps with no act): every step it
 * holds has a decisive answer from its resource. It is never an act's acceptance: no act is kept under such a record.
 */
export type Phase = "prepared" | "sent" | "unknown" | "accepted" | "refused" | "mismatch" | "settled";
export const TERMINAL: ReadonlySet<Phase> = new Set(["accepted", "refused", "mismatch", "settled"]);

/** One outcome of one sending, in its attempt. `lost`: no answer could be read. */
export type Outcome = ({ at: string; answer: Answer } | { at: string; lost: true } | { at: string; settled: Receipt }) & { attempt: number };

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
  /** The attempt now current: 1, and one more for each deliberate resubmission of a refusal. */
  attempt: number;
  /** True for a record whose envelope is a standalone capability step's own intent, which is never submitted as an act. */
  standalone?: true;
  steps: Record<string, Step>;
  created: string;
  updated: string;
}

/** Where records live. Every write is whole and read back before the caller sends. */
export interface CustodyStore {
  /** An exclusive lock on one identity, or null when another holds it. */
  lock(id: string, notAfter: string): Promise<(() => Promise<void>) | null>;
  /** Run `work` alone among every process sharing the store: admission against the capacity. */
  exclusive<T>(work: () => Promise<T>): Promise<T>;
  read(id: string): Promise<CustodyRecord | null>;
  /**
   * Write whole, then read back and compare; throws when the bytes read back differ. `dispatch`: this write precedes a
   * dispatch (a send, a resubmit, a step), so a store that accounts capacity reserves the completion need before it, and
   * refuses with its own `full` before anything is sent; a write of a result consumes what was reserved and reserves nothing.
   */
  write(id: string, record: CustodyRecord, options?: { dispatch?: boolean }): Promise<void>;
  /** The records not yet terminal, oldest first: their identity digests and keys. */
  unresolved(): Promise<{ id: string; key: string; created: string }[]>;
  /**
   * A store that accounts capacity reserves a new identity's completion need here, under the exclusive admission, before the
   * envelope is built and signed; it throws its own `full` when the need cannot be reserved. `bytes` is the caller's account
   * of what the envelope will carry. A store without a budget leaves this out.
   */
  admit?(id: string, bytes: number): Promise<void>;
  /** Release what `admit` reserved for an identity whose preparation did not come to a record. */
  unadmit?(id: string): Promise<void>;
  /**
   * Put outcomes in the record's segment at position `at` (the count the segment holds by the record's account), in order.
   * Anything the segment holds past `at`, from an interrupted earlier append, is cut first, so a repeat is idempotent.
   */
  segment(id: string, at: number, outcomes: readonly Outcome[]): Promise<void>;
  /** At most `limit` outcomes of the segment from position `from`, in order, read as a bounded slice. */
  segmented(id: string, from: number, limit: number): Promise<Outcome[]>;
}

export const identityId = (identity: Identity): string => digestBytes(utf8(canonicalize(identity))).slice(7);
export const meaningOf = (asked: unknown): Digest => digestBytes(utf8(canonicalize(asked)));
export const stepId = (s: { intent: Digest; resource: ScopeRef; capability: string; step: string }): string =>
  digestBytes(utf8(canonicalize([s.intent, s.resource.scope, s.resource.inc, s.capability, s.step]))).slice(7);

/** Why custody sent nothing. */
export type HeldBack =
  | { held: "conflicting"; recorded: string }
  | { held: "full"; reason: "count"; keys: string[] }
  | { held: "full"; reason: "bytes"; bytes: number }
  /** The store's own budget admits no completion capacity for another dispatch (the hosted store, section 3.6 of its design). */
  | { held: "full"; reason: "budget"; bytes: number }
  | { held: "locked"; stale?: string }
  | { held: "unreadable" }
  /**
   * The envelope was sent and answered (or its reply was lost), and the store could not keep the outcome: the act may have taken
   * effect; the record stays `sent`. For a preparation step, `step` names it: the step was sent and the resource answered, and
   * the same step under the same key and arguments is the recovery, not the act's settlement.
   */
  | { held: "unkept"; answer: Answer["answer"] | "lost"; step?: { resource: string; capability: string; step: string } }
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

/** Bytes a record keeps beside its envelope: identity, binding, phase, times, and room for its first outcome. */
const RECORD_OVERHEAD = 64 * 1024;
const bytesOf = (value: unknown): number => utf8(canonicalize(value as never)).length;

/** The newest decisive outcome of the record's current attempt, chronologically; null while the attempt is unresolved. */
export function decisive(outcomes: readonly Outcome[], attempt: number): { at: string; answer: Answer } | null {
  for (let i = outcomes.length - 1; i >= 0; i--) {
    const o = outcomes[i]!;
    if (o.attempt !== attempt) return null;
    if ("settled" in o) return { at: o.at, answer: { answer: "accepted", receipt: o.settled } };
    if ("answer" in o && o.answer.answer !== "unavailable") return { at: o.at, answer: o.answer };
  }
  return null;
}

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

  /**
   * Keep what came of a dispatch. The envelope left and was answered (or its reply was lost) before this write; a store that
   * fails here settles nothing, and what is reported must say so: the record stays `sent` on disk, the act may have taken
   * effect, and settle under the same key resolves it. It is never "nothing was sent".
   */
  async #outcomeKept(id: string, record: CustodyRecord, answer: Answer["answer"] | "lost", outcome: () => Promise<void>, from: Phase): Promise<void> {
    try {
      await outcome();
      record.updated = this.now();
      await this.#write(id, record, false, from);
    } catch (error) {
      if (error instanceof CustodyError && error.why.held === "too-large") throw error;
      throw new CustodyError({ held: "unkept", answer });
    }
  }

  async #write(id: string, record: CustodyRecord, dispatch = false, from: Phase | null = record.phase): Promise<void> {
    if (bytesOf(record) > RECORD_BYTES) throw new CustodyError({ held: "too-large" });
    // A store may refuse a write by its own account (`full`: the hosted store's budget, before anything is dispatched); any
    // other failure is a storage failure, which settles nothing.
    try { await this.store.write(id, record, dispatch ? { dispatch: true } : {}); } catch (error) { throw error instanceof CustodyError ? error : new CustodyError({ held: "unreadable" }); }
    custodyTransition(from, record.phase);
  }

  /**
   * Keep an outcome: inline up to 64 and within the record's byte bound; the oldest move to the segment, which loses none. An
   * outcome that alone would push the record past the bound goes to the segment directly.
   */
  async #outcome(id: string, record: CustodyRecord, outcome: Outcome): Promise<void> {
    record.outcomes.push(outcome);
    record.count++;
    let spill = Math.max(0, record.outcomes.length - OUTCOMES_INLINE);
    while (spill < record.outcomes.length && (bytesOf(record.outcomes.slice(spill)) > OUTCOMES_INLINE_BYTES || bytesOf({ ...record, outcomes: record.outcomes.slice(spill) }) > RECORD_BYTES)) spill++;
    if (spill > 0) {
      const inSegment = record.count - record.outcomes.length;
      await this.store.segment(id, inSegment, record.outcomes.splice(0, spill));
    }
  }

  /** The outcomes of a record from position `from` (0 is the first ever), at most `limit`: the segment's, then the inline ones. */
  async outcomes(id: string, record: CustodyRecord, from = 0, limit = record.count): Promise<Outcome[]> {
    const inSegment = record.count - record.outcomes.length;
    const out: Outcome[] = [];
    if (from < inSegment) out.push(...await this.store.segmented(id, from, Math.min(limit, inSegment - from)));
    const inline = Math.max(0, from - inSegment);
    out.push(...record.outcomes.slice(inline, inline + (limit - out.length)));
    return out;
  }

  /** The decisive outcome of a record's current attempt, reading the segment only when the inline outcomes do not reach back far enough. */
  async decided(id: string, record: CustodyRecord): Promise<{ at: string; answer: Answer } | null> {
    // Newest first: the inline outcomes, then the segment's slices from its end backward, one slice held at a time. The search
    // stops at the newest decisive outcome of the current attempt, or at an outcome of an older attempt, which ends it.
    const inSegment = record.count - record.outcomes.length;
    const search = (list: readonly Outcome[]): { at: string; answer: Answer } | "older" | null => {
      for (let i = list.length - 1; i >= 0; i--) {
        const o = list[i]!;
        if (o.attempt !== record.attempt) return "older";
        if ("settled" in o) return { at: o.at, answer: { answer: "accepted", receipt: o.settled } };
        if ("answer" in o && o.answer.answer !== "unavailable") return { at: o.at, answer: o.answer };
      }
      return null;
    };
    const inline = search(record.outcomes);
    if (inline === "older") return null;
    if (inline) return inline;
    for (let end = inSegment; end > 0; end -= DECIDED_SLICE) {
      const from = Math.max(0, end - DECIDED_SLICE);
      const matched = search(await this.store.segmented(id, from, end - from));
      if (matched === "older") return null;
      if (matched) return matched;
    }
    return null;
  }

  /** The record under an identity, or null. */
  find(identity: Identity): Promise<CustodyRecord | null> { return this.#read(identityId(identity)); }

  /**
   * Keep the envelope under its identity without sending it: the first
   * preparation. The record that holds it already is returned, when its
   * meaning is the same; another meaning is refused. `bytes` is the caller's
   * account of what the envelope will carry (fields, texts, presented facts
   * and values); it is checked against the record's bound before signing.
   */
  async keep(identity: Identity, meaning: Digest, build: () => Promise<{ binding: BindingRecord; envelope: Envelope }>, notAfter: string, bytes = 0, options: { standalone?: boolean } = {}): Promise<CustodyRecord> {
    const id = identityId(identity);
    return this.#locked(id, notAfter, async () => this.#kept(id, identity, meaning, build, bytes, options.standalone === true));
  }

  async #kept(id: string, identity: Identity, meaning: Digest, build: () => Promise<{ binding: BindingRecord; envelope: Envelope }>, bytes: number, standalone = false): Promise<CustodyRecord> {
    const matched = await this.#read(id);
    if (matched) {
      if (matched.meaning !== meaning) throw new CustodyError({ held: "conflicting", recorded: `${matched.envelope.signed.intent.kind} on ${matched.identity.target && "scope" in matched.identity.target ? matched.identity.target.scope : "a creation"}` });
      return matched;
    }
    // Before signing: the envelope must fit a record with room for its first outcome.
    if (bytes + RECORD_OVERHEAD > RECORD_BYTES) throw new CustodyError({ held: "full", reason: "bytes", bytes });
    return this.store.exclusive(async () => {
      const open = await this.store.unresolved();
      if (open.length >= UNRESOLVED_MOST) throw new CustodyError({ held: "full", reason: "count", keys: open.slice(0, 8).map((o) => o.key) });
      // A store with a budget admits the new identity's completion need now, before anything is signed.
      await this.store.admit?.(id, bytes + RECORD_OVERHEAD);
      try {
        const { binding, envelope } = await build();
        const at = this.now();
        const record: CustodyRecord = { v: 1, identity, binding, meaning, envelope, phase: "prepared", outcomes: [], count: 0, attempt: 1, steps: {}, created: at, updated: at, ...(standalone ? { standalone: true as const } : {}) };
        const size = bytesOf(record);
        if (size + RECORD_OVERHEAD > RECORD_BYTES) throw new CustodyError({ held: "full", reason: "bytes", bytes: size });
        await this.#write(id, record, false, null);
        return record;
      } catch (error) {
        // No record came of it: what was admitted for this identity is released.
        await this.store.unadmit?.(id).catch(() => undefined);
        throw error;
      }
    });
  }

  /**
   * Send under custody. First preparation: keep, read back, send. A record
   * that is unresolved: resend the same bytes. An accepted or mismatch
   * record: return its outcome and send nothing, whatever is asked. A refused
   * record: return its refusal, or with `resubmit` keep a new unresolved
   * attempt first and then send the same bytes.
   */
  async send(identity: Identity, meaning: Digest, build: () => Promise<{ binding: BindingRecord; envelope: Envelope }>, deliver: (envelope: Envelope) => Promise<Answer>, options: { resubmit?: boolean; notAfter: string; bytes?: number }): Promise<Sent> {
    const id = identityId(identity);
    return this.#locked(id, options.notAfter, async () => {
      const record = await this.#kept(id, identity, meaning, build, options.bytes ?? 0);
      const previous = record.phase;
      if (TERMINAL.has(record.phase)) {
        const last = await this.decided(id, record);
        if (record.phase !== "refused" || !options.resubmit) {
          if (!last) throw new CustodyError({ held: "unreadable" });
          return { record, answer: last.answer, retained: true };
        }
        // A deliberate resubmission of a refusal makes the record unresolved again: it is admitted against the capacity under the
        // shared lease, and the new attempt is kept there, before anything is sent. A store that is full keeps the refusal as it was.
        await this.store.exclusive(async () => {
          const open = await this.store.unresolved();
          if (open.length >= UNRESOLVED_MOST) throw new CustodyError({ held: "full", reason: "count", keys: open.slice(0, 8).map((o) => o.key) });
          record.attempt++;
          record.phase = "sent";
          record.updated = this.now();
          await this.#write(id, record, true, previous);
        });
      } else {
        record.phase = "sent";
        record.updated = this.now();
        await this.#write(id, record, true, previous);
      }
      let answer: Answer;
      try {
        answer = await deliver(record.envelope);
      } catch (error) {
        if (!(error instanceof Lost)) throw error;
        record.phase = "unknown";
        await this.#outcomeKept(id, record, "lost", async () => { await this.#outcome(id, record, { at: this.now(), lost: true, attempt: record.attempt }); }, "sent");
        return { record, lost: true };
      }
      // `unavailable` resolves nothing; a definitive answer does.
      record.phase = answer.answer === "unavailable" ? "unknown" : answer.answer;
      await this.#outcomeKept(id, record, answer.answer, async () => { await this.#outcome(id, record, { at: this.now(), answer, attempt: record.attempt }); }, "sent");
      return { record, answer, retained: false };
    });
  }

  /**
   * Settle: a terminal record's outcome, or the scope's settlement of the
   * recorded envelope. A receipt resolves the record as accepted; `not-found`
   * and a lost reply resolve nothing. Signs nothing, sends no act. The
   * outcome given is always the newest decisive one of the current attempt.
   */
  async settle(identity: Identity, read: (envelope: Envelope) => Promise<Receipt | null>): Promise<{ record: CustodyRecord; receipt: Receipt | null; decided: { at: string; answer: Answer } | null } | null> {
    const id = identityId(identity);
    const record = await this.#read(id);
    if (!record) return null;
    if (TERMINAL.has(record.phase)) return { record, receipt: null, decided: await this.decided(id, record) };
    return this.#locked(id, record.envelope.signed.intent.notAfter, async () => {
      const fresh = (await this.#read(id))!;
      if (TERMINAL.has(fresh.phase)) return { record: fresh, receipt: null, decided: await this.decided(id, fresh) };
      let receipt: Receipt | null = null;
      try { receipt = await read(fresh.envelope); } catch (error) { if (!(error instanceof Lost)) throw error; }
      if (receipt) {
        const previous = fresh.phase;
        fresh.phase = "accepted";
        await this.#outcome(id, fresh, { at: this.now(), settled: receipt, attempt: fresh.attempt });
        fresh.updated = this.now();
        await this.#write(id, fresh, false, previous);
      }
      return { record: fresh, receipt, decided: await this.decided(id, fresh) };
    });
  }

  /**
   * One preparation step, under its own identity in the record: send the
   * request, record the resource's answer or `unknown`. The act's phase does
   * not move. A step that has an answer is asked again only when the caller
   * asks again: the resource answers the same step with its first entry.
   */
  async step(identity: Identity, resource: ScopeRef, capability: string, step: string, deliver: (signed: SignedIntent) => Promise<Answer>): Promise<{ record: CustodyRecord; step: Step; answer: Answer | null; retained: boolean }> {
    const id = identityId(identity);
    const record = await this.#read(id);
    if (!record) throw new CustodyError({ held: "unreadable" });
    return this.#locked(id, record.envelope.signed.intent.notAfter, async () => {
      const fresh = (await this.#read(id))!;
      const before = fresh.phase;
      const intent = intentDigest(fresh.envelope.signed.intent);
      const sid = stepId({ intent, resource, capability, step });
      const entry: Step = fresh.steps[sid] ?? { intent, resource, capability, step, phase: "prepared", answers: [] };
      // A standalone step with a decisive answer is terminal: its answer is returned again, and nothing is sent.
      if (fresh.standalone && entry.phase === "answered") {
        const kept = [...entry.answers].reverse().find((a) => a.answer !== null && a.answer.answer !== "unavailable")?.answer ?? null;
        return { record: fresh, step: entry, answer: kept, retained: true };
      }
      // Kept as sent before anything is sent: a restart between here and the answer finds the step sent, and a retry sends the
      // same signed intent again.
      entry.phase = "sent";
      fresh.steps[sid] = entry;
      if (fresh.standalone) fresh.phase = "sent";
      await this.#write(id, fresh, true, before);
      let answer: Answer | null = null;
      try { answer = await deliver(fresh.envelope.signed); } catch (error) { if (!(error instanceof Lost)) throw error; }
      entry.phase = answer === null || answer.answer === "unavailable" ? "unknown" : "answered";
      entry.answers.push({ at: this.now(), answer });
      // A step keeps its first answer and its latest 63 (see the header): the first is what the resource repeats for the same step.
      if (entry.answers.length > OUTCOMES_INLINE) entry.answers.splice(1, entry.answers.length - OUTCOMES_INLINE);
      // A standalone record is settled, and terminal, when every step it holds is decided; until then it stays unresolved.
      const previous = fresh.phase;
      if (fresh.standalone) fresh.phase = Object.values(fresh.steps).every((st) => st.phase === "answered") ? "settled" : "unknown";
      // The step was sent and answered before this write: a store that fails here keeps the step `sent`, and what is reported
      // says so, with the step's identity, never that nothing was sent (the same rule as a dispatch's outcome).
      try {
        fresh.updated = this.now();
        await this.#write(id, fresh, false, previous);
      } catch (error) {
        if (error instanceof CustodyError && error.why.held === "too-large") throw error;
        throw new CustodyError({ held: "unkept", answer: answer === null ? "lost" : answer.answer, step: { resource: resource.scope, capability, step } });
      }
      return { record: fresh, step: entry, answer, retained: false };
    });
  }
}

/** A store in memory: for a process that keeps nothing, and for a test in the Workers runtime. Each write is a whole copy, read back. */
export function memoryStore(): CustodyStore & { records: Map<string, string> } {
  const records = new Map<string, string>();
  const segments = new Map<string, Outcome[]>();
  const locks = new Set<string>();
  let queue: Promise<unknown> = Promise.resolve();
  return {
    records,
    lock: async (id) => {
      if (locks.has(id)) return null;
      locks.add(id);
      return async () => { locks.delete(id); };
    },
    exclusive: <T>(work: () => Promise<T>): Promise<T> => {
      const run = queue.then(work, work);
      queue = run.catch(() => undefined);
      return run;
    },
    read: async (id) => { const text = records.get(id); return text === undefined ? null : JSON.parse(text) as CustodyRecord; },
    write: async (id, record) => {
      const text = canonicalize(record);
      records.set(id, text);
      if (records.get(id) !== text) throw new Error("read back differs");
    },
    unresolved: async () => [...records.entries()].map(([id, text]) => [id, JSON.parse(text) as CustodyRecord] as const)
      .filter(([, r]) => !TERMINAL.has(r.phase)).sort(([, a], [, b]) => (a.created < b.created ? -1 : 1)).map(([id, r]) => ({ id, key: r.identity.key, created: r.created })),
    segment: async (id, at, outcomes) => { segments.set(id, [...(segments.get(id) ?? []).slice(0, at), ...structuredClone(outcomes as Outcome[])]); },
    segmented: async (id, from, limit) => structuredClone((segments.get(id) ?? []).slice(from, from + limit)),
  };
}
