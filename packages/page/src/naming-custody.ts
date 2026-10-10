/** C4's private naming operation domain. Native authority remains the scope's.
 * No claim, invitation, voice or general outbox record belongs to this journal. */
import type { Answer, Beside, Grant, Head, KeyId, MemberRef, PlatformDefinition, Read, Receipt, ScopeRef, Sealed, Settlement, SignedIntent } from "@generalbusiness/artroom-contract";
import { REFUSAL_REASONS, canonicalize, entryHash, intentDigest, isFactRef, isGrant, isHead, isKeyId, isMemberRef, isPlatformDefinition, isRead, isReceipt, isRecord, isScopeRef, isSealed, isSignedIntentShape, parseStrict, textDigest, timeMs, utf8, verifySignedIntent } from "@generalbusiness/artroom-bytes";
import { newIdempotencyKey, signedIntent, type Signer, type Signing } from "@generalbusiness/artroom-client";

export interface NamingContext {
  origin: string;
  directory: ScopeRef;
  membership: ScopeRef;
  member: MemberRef;
  key: KeyId;
  credential: string;
  generation: number;
  epoch: string;
}
export type NamingSample = {
  /** Native summary's retained time at head; not a fresh authority lease. */
  context: NamingContext; definition: PlatformDefinition; head: Head; time: string;
} & ({ state: "uninitialized" } | { state: "profile"; profile: { id: number; revision: number; opening: import("@generalbusiness/artroom-contract").FactRef; name: string } });
/** Presentation read status. A last sample is explicitly stale and cannot be
 * passed off as absence, current enrollment or mutation permission. */
export type NamingProjection = { state: "supported"; sample: NamingSample }
  | { state: "unsupported"; context: NamingContext; definition: PlatformDefinition }
  | { state: "unavailable"; lastSample?: NamingSample };
export interface NamingConfirmation { id: string; sample: NamingSample; name: string }
export interface NamingEnvelope { signed: SignedIntent; grants: readonly Grant[]; beside: Beside }
export interface NamingRecord {
  v: 1; domain: "room-name"; confirmation: NamingConfirmation; envelope: NamingEnvelope;
  phase: "prepared" | "attempted";
  answer?: Answer;
  /** First response stays intact. Original settlement is separate evidence. */
  settlement?: Settlement;
  verified?: Sealed;
  latest?: { state: "available" | "conflicting"; sample: NamingSample } | { state: "unavailable" };
}
export interface NamingJournal { v: 1; epoch: string; revision: number; context: string; records: readonly NamingRecord[] }
export interface NamingLimits { contexts: number; credentials: number; records: number; recordBytes: number; totalBytes: number }

/** Implementation must commit CAS + bounded whole-record readback atomically.
 * A rejected commit leaves the preceding journal intact; it never evicts. */
export interface NamingStore {
  read(context: NamingContext): Promise<NamingJournal>;
  current(context: NamingContext): Promise<void>;
  credential(context: NamingContext): Promise<Signer>;
  commit(context: NamingContext, before: NamingJournal, next: NamingJournal): Promise<void>;
}
/** Reviewed native adapter seam. capture reads authenticated enrollment/name
 * and current grant data; it cannot treat a local catalog or an offer as authority.
 * No backend pin is guessed here. The future native adapter owns supported pins. */
export interface NamingNative {
  capture(context: NamingContext): Promise<{ sample: NamingSample; grants: readonly Grant[]; beside: Beside }>;
  submit(context: NamingContext, envelope: NamingEnvelope): Promise<Answer>;
  settle(context: NamingContext, signed: SignedIntent): Promise<Settlement>;
  entry(context: NamingContext, receipt: Receipt): Promise<Read<Sealed>>;
  latest(context: NamingContext): Promise<NamingSample | null>;
}
export interface NamingLocks { request<T>(name: string, work: () => Promise<T>): Promise<T> }
export class NamingBlocked extends Error { override readonly name = "NamingBlocked"; }
const fail = (why: string): never => { throw new NamingBlocked(why); };
const same = (a: unknown, b: unknown): boolean => canonicalize(a) === canonicalize(b);
export const namingCopy = <T>(value: T): T => parseStrict(canonicalize(value)) as T;
const exact = (value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean => required.every(name => Object.hasOwn(value, name)) && Object.keys(value).every(name => (required.includes(name) || optional.includes(name)) && value[name] !== undefined);
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const reference = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
export function namingOrigin(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try { const url = new URL(value); return url.origin === value && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash && (url.protocol === "https:" || url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)); } catch { return false; }
}
export function isNamingContext(value: unknown): value is NamingContext {
  return isRecord(value) && exact(value, ["origin", "directory", "membership", "member", "key", "credential", "generation", "epoch"])
    && namingOrigin(value["origin"]) && isScopeRef(value["directory"]) && value["directory"].kind === "directory"
    && isScopeRef(value["membership"]) && value["membership"].kind === "membership" && isMemberRef(value["member"])
    && same(value["member"].membership, value["membership"]) && isKeyId(value["key"]) && reference(value["credential"]) && integer(value["generation"]) && reference(value["epoch"]);
}
/** Logical slot is the enrolled member's room, not a device key or generation.
 * Replacing a credential therefore cannot hide another retained original. */
export function namingContextKey(context: NamingContext): string {
  if (!isNamingContext(context)) return fail("Malformed naming context.");
  return textDigest(canonicalize([context.origin, context.directory, context.membership, context.member]));
}
export function isConfirmedName(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 256 || value.trim() !== value) return false;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c < 32 || c === 127 || c === 0x2028 || c === 0x2029) return false;
    if (c >= 0xd800 && c <= 0xdbff) { const next = value.charCodeAt(++i); if (!(next >= 0xdc00 && next <= 0xdfff)) return false; }
    else if (c >= 0xdc00 && c <= 0xdfff) return false;
  }
  return utf8(value).length <= 256;
}
export function isNamingSample(value: unknown): value is NamingSample {
  if (!isRecord(value) || !exact(value, ["context", "definition", "head", "time", "state"], ["profile"]) || !isNamingContext(value["context"]) || !isPlatformDefinition(value["definition"]) || !value["definition"].startsWith("platform:directory@") || !isHead(value["head"]) || typeof value["time"] !== "string" || timeMs(value["time"]) === null) return false;
  if (value["state"] === "uninitialized") return !Object.hasOwn(value, "profile");
  const p = value["profile"];
  return value["state"] === "profile" && isRecord(p) && exact(p, ["id", "revision", "opening", "name"]) && integer(p["id"]) && p["id"] > 0 && p["id"] <= value["head"].seq && integer(p["revision"]) && p["revision"] > 0 && p["revision"] <= value["head"].seq - p["id"] + 1 && isFactRef(p["opening"]) && p["opening"].seq === p["id"] && same(p["opening"].at, value["context"].directory) && isConfirmedName(p["name"]);
}
export function isNamingProjection(value: unknown): value is NamingProjection {
  if (!isRecord(value)) return false;
  if (value["state"] === "supported") return exact(value, ["state", "sample"]) && isNamingSample(value["sample"]);
  if (value["state"] === "unsupported") return exact(value, ["state", "context", "definition"]) && isNamingContext(value["context"]) && isPlatformDefinition(value["definition"]);
  return value["state"] === "unavailable" && exact(value, ["state"], ["lastSample"]) && (!Object.hasOwn(value, "lastSample") || isNamingSample(value["lastSample"]));
}
/** Presentation helper only. Caller obtains an authenticated supported sample
 * and deliberately confirms this returned immutable proposal before start. */
export function confirmNaming(sample: NamingSample, raw: string): NamingConfirmation {
  if (!isNamingSample(sample) || typeof raw !== "string" || raw.length > 512) return fail("Naming sample or draft is unavailable.");
  // Reject invalid scalars/line controls BEFORE trimming, with a bounded walk.
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if (c < 32 || c === 127 || c === 0x2028 || c === 0x2029) return fail("The name must be scalar text on one line.");
    if (c >= 0xd800 && c <= 0xdbff) { const next = raw.charCodeAt(++i); if (!(next >= 0xdc00 && next <= 0xdfff)) return fail("The name contains an invalid scalar."); }
    else if (c >= 0xdc00 && c <= 0xdfff) return fail("The name contains an invalid scalar.");
  }
  const name = raw.trim();
  if (!isConfirmedName(name)) return fail("The confirmed name exceeds its native bound.");
  return namingCopy({ id: newIdempotencyKey(), sample, name });
}
const isConfirmation = (value: unknown): value is NamingConfirmation => isRecord(value) && exact(value, ["id", "sample", "name"]) && reference(value["id"]) && isNamingSample(value["sample"]) && isConfirmedName(value["name"]);
/** Naming declares no detached text, presented fact or retained value. */
function isNamingBeside(value: unknown): value is Beside {
  return isRecord(value) && exact(value, [], ["texts", "presented", "values"])
    && (!Object.hasOwn(value, "texts") || Array.isArray(value["texts"]) && value["texts"].length === 0)
    && (!Object.hasOwn(value, "values") || Array.isArray(value["values"]) && value["values"].length === 0)
    && (!Object.hasOwn(value, "presented") || isRecord(value["presented"]) && Object.keys(value["presented"]).length === 0);
}
const unavailable = new Set(["dependency-unavailable", "busy", "clock-behind", "scope-provisional", "guard-incomplete", "authority-unavailable", "unavailable", "rate-limited"]);
/** Complete naming journal Answer validator; no partial refusal is terminal. */
export function isNamingAnswer(value: unknown): value is Answer {
  if (!isRecord(value)) return false;
  if (value["answer"] === "accepted") return exact(value, ["answer", "receipt"]) && isReceipt(value["receipt"]);
  if (value["answer"] === "refused") return exact(value, ["answer", "reason", "judgedAt"], ["name"]) && typeof value["reason"] === "string" && Object.hasOwn(REFUSAL_REASONS, value["reason"]) && isHead(value["judgedAt"]) && (!Object.hasOwn(value, "name") || typeof value["name"] === "string");
  return exact(value, ["answer", "reason"]) && (value["answer"] === "unavailable" && typeof value["reason"] === "string" && unavailable.has(value["reason"]) || value["answer"] === "mismatch" && value["reason"] === "idempotency-mismatch");
}
function receiptMatches(record: NamingRecord, receipt: Receipt): boolean {
  return same(receipt.fact.at, record.confirmation.sample.context.directory) && receipt.definition === record.confirmation.sample.definition && receipt.intent === intentDigest(record.envelope.signed.intent);
}
function receiptReadHead(head: Head, receipt: Receipt): boolean { return head.seq >= receipt.fact.seq && (head.seq !== receipt.fact.seq || head.hash === receipt.fact.hash); }
export function namingRecordVerified(record: NamingRecord): boolean {
  const receipt = namingReceipt(record), sealed = record.verified;
  if (!receipt || !sealed || !receiptMatches(record, receipt)) return false;
  const { entry, hash } = sealed;
  return entryHash(entry) === hash && hash === receipt.fact.hash && entry.seq === receipt.fact.seq && same(entry.at, receipt.fact.at) && entry.input.type === "act" && same(entry.input.signed, record.envelope.signed)
    && entry.epoch === receipt.epoch && same(entry.effects, receipt.effects) && same(entry.sends.map(send => `${entry.seq}.${send.n}`), receipt.sends);
}
export function namingReceipt(record: NamingRecord): Receipt | null {
  return record.settlement?.ok ? record.settlement.value : record.answer?.answer === "accepted" ? record.answer.receipt : null;
}
export function namingResolved(record: NamingRecord): boolean { return record.answer?.answer === "refused" || namingRecordVerified(record); }
export function isNamingRecord(value: unknown): value is NamingRecord {
  if (!isRecord(value) || !exact(value, ["v", "domain", "confirmation", "envelope", "phase"], ["answer", "settlement", "verified", "latest"]) || value["v"] !== 1 || value["domain"] !== "room-name" || !isConfirmation(value["confirmation"]) || !["prepared", "attempted"].includes(String(value["phase"]))) return false;
  if (value["phase"] === "prepared" && ["answer", "settlement", "verified", "latest"].some(name => Object.hasOwn(value, name))) return false;
  const c = value["confirmation"], e = value["envelope"];
  if (!isRecord(e) || !exact(e, ["signed", "grants", "beside"]) || !isSignedIntentShape(e["signed"]) || !verifySignedIntent(e["signed"]) || !Array.isArray(e["grants"]) || e["grants"].length > 8 || !e["grants"].every(grant => isGrant(grant) && grant.key === c.sample.context.key && same(grant.subject, c.sample.context.member)) || !isNamingBeside(e["beside"])) return false;
  const intent = e["signed"].intent;
  if (!same(intent.to, c.sample.context.directory) || intent.actor !== c.sample.context.key || intent.idempotencyKey !== c.id || !same(intent.fields, { name: c.name })) return false;
  if (c.sample.state === "uninitialized" ? intent.kind !== "name-room" || intent.on !== null || !same(intent.expected, {}) : intent.kind !== "set-room-name" || intent.on !== c.sample.profile.id || !same(intent.expected, { on: c.sample.profile.revision })) return false;
  const retainedAnswer = value["answer"], retainedSettlement = value["settlement"];
  if (retainedAnswer !== undefined && (value["phase"] !== "attempted" || !isNamingAnswer(retainedAnswer))) return false;
  const answer = isNamingAnswer(retainedAnswer) ? retainedAnswer : undefined;
  if (retainedSettlement !== undefined && (value["phase"] !== "attempted" || !isRead(isReceipt)(retainedSettlement))) return false;
  const settlement = isRead(isReceipt)(retainedSettlement) ? retainedSettlement : undefined;
  if (settlement !== undefined && (!settlement.ok || !settlement.complete || settlement.next !== undefined || !receiptReadHead(settlement.at, settlement.value) || answer?.answer === "mismatch" || answer?.answer === "refused")) return false;
  const partial = value as unknown as NamingRecord;
  if (answer?.answer === "accepted" && !receiptMatches(partial, answer.receipt) || settlement?.ok && !receiptMatches(partial, settlement.value)) return false;
  if (answer?.answer === "accepted" && settlement?.ok && !same(answer.receipt, settlement.value)) return false;
  if (Object.hasOwn(value, "verified") && (!isSealed(value["verified"]) || !(answer?.answer === "accepted" || settlement?.ok))) return false;
  if (Object.hasOwn(value, "latest")) { const latest = value["latest"]; if (!isRecord(latest) || !(latest["state"] === "unavailable" && exact(latest, ["state"]) || ["available", "conflicting"].includes(String(latest["state"])) && exact(latest, ["state", "sample"]) && isNamingSample(latest["sample"]) && same(latest["sample"].context, c.sample.context) && latest["sample"].definition === c.sample.definition)) return false; }
  return !Object.hasOwn(value, "verified") || namingRecordVerified(value as unknown as NamingRecord);
}
export function isNamingJournal(value: unknown): value is NamingJournal {
  if (!isRecord(value) || !exact(value, ["v", "epoch", "revision", "context", "records"]) || value["v"] !== 1 || !reference(value["epoch"]) || !integer(value["revision"]) || typeof value["context"] !== "string" || !Array.isArray(value["records"]) || !value["records"].every(isNamingRecord)) return false;
  const records = value["records"];
  return records.every((record, i) => record.confirmation.sample.context.epoch === value["epoch"] && namingContextKey(record.confirmation.sample.context) === value["context"] && (i === records.length - 1 || namingResolved(record))) && new Set(records.map(record => record.confirmation.id)).size === records.length;
}
export function namingTransition(before: NamingJournal, next: NamingJournal): boolean {
  if (!isNamingJournal(before) || !isNamingJournal(next) || before.epoch !== next.epoch || before.context !== next.context || next.revision !== before.revision + 1 || next.records.length < before.records.length || next.records.length > before.records.length + 1) return false;
  if (next.records.length > before.records.length && next.records.at(-1)?.phase !== "prepared") return false;
  return before.records.every((record, i) => {
    const after = next.records[i]!;
    if (i < before.records.length - 1 || next.records.length > before.records.length) return namingResolved(record) && same(record, after);
    return same(record.confirmation, after.confirmation) && same(record.envelope, after.envelope) && !(record.phase === "attempted" && after.phase !== "attempted") && (record.answer === undefined || same(record.answer, after.answer)) && (record.settlement === undefined || same(record.settlement, after.settlement)) && (record.verified === undefined || same(record.verified, after.verified));
  });
}
export function namingWebLocks(): NamingLocks {
  if (!navigator.locks) return fail("Web Locks are unavailable; naming is blocked.");
  return { request: (name, work) => navigator.locks.request(name, { mode: "exclusive" }, work) };
}

/** Loaded operation owns a known reply even when private persistence fails.
 * A new instance may only recover the durable original; it never guesses unsent. */
export class NamingCustody {
  #loaded: NamingRecord | null = null;
  #storageBlocked = false;
  #context: NamingContext;
  #malformedResponse = false;
  constructor(context: NamingContext, readonly store: NamingStore, readonly locks: NamingLocks, readonly native: NamingNative, readonly current: () => void) { if (!isNamingContext(context)) fail("Malformed context."); this.#context = namingCopy(context); }
  get context(): NamingContext { return namingCopy(this.#context); }
  get loaded(): NamingRecord | null { return this.#loaded && namingCopy(this.#loaded); }
  get persistenceUnavailable(): boolean { return this.#storageBlocked; }
  #locked<T>(work: () => Promise<T>): Promise<T> {
    return this.locks.request(`artroom:c4:credential:${this.context.credential}`, () => this.locks.request(`artroom:c4:naming-context:${namingContextKey(this.context)}`, () => this.locks.request(`artroom:c4:naming-operation:${namingContextKey(this.context)}`, work)));
  }
  async #current(): Promise<void> { this.current(); await this.store.current(this.context); this.current(); }
  async #load(): Promise<NamingJournal> { const journal = await this.store.read(this.context); if (!isNamingJournal(journal) || journal.epoch !== this.context.epoch || journal.context !== namingContextKey(this.context)) return fail("Malformed or foreign retained naming custody; keep the original."); return namingCopy(journal); }
  async #save(journal: NamingJournal, record: NamingRecord, append = false): Promise<NamingJournal> {
    const records = [...journal.records]; if (append) records.push(record); else records[records.length - 1] = record;
    const next: NamingJournal = { ...journal, revision: journal.revision + 1, records };
    try { await this.store.commit(this.context, journal, next); }
    catch { this.#storageBlocked = true; return fail("Durable naming persistence unavailable; loaded answer and original kept. No replacement or retry."); }
    return next;
  }
  async start(confirmation: NamingConfirmation, signing: Signing = {}): Promise<NamingRecord | null> {
    // Freeze presentation intent BEFORE waiting for a lock or any other await.
    // Authoritative sampling/credential resolution/signing remain inside locks.
    if (!isConfirmation(confirmation)) return fail("Naming confirmation is malformed.");
    const frozen = namingCopy(confirmation), selectedSigning = { ...signing };
    return this.#locked(async () => {
      if (this.#storageBlocked) return fail("Durable naming persistence remains unavailable.");
      await this.#current(); const journal = await this.#load(); await this.#current();
      if (journal.records.some(record => !namingResolved(record))) { this.#loaded = namingCopy(journal.records.at(-1)!); return fail("An unresolved original blocks a new naming signature."); }
      if (!same(frozen.sample.context, this.context) || journal.records.some(record => record.confirmation.id === frozen.id)) return fail("Use a new explicit read, comparison and confirmation.");
      const signer = await this.store.credential(this.context); await this.#current();
      if (signer.key !== this.context.key) return fail("The credential names another enrolled key.");
      const captured = namingCopy(await this.native.capture(this.context)); await this.#current();
      if (!isNamingSample(captured.sample) || !same(captured.sample.context, this.context) || captured.sample.definition !== frozen.sample.definition || captured.sample.head.seq < frozen.sample.head.seq || captured.sample.head.seq === frozen.sample.head.seq && captured.sample.head.hash !== frozen.sample.head.hash || captured.sample.state !== frozen.sample.state || (captured.sample.state === "profile" && (frozen.sample.state !== "profile" || !same(captured.sample.profile, frozen.sample.profile)))) return fail("The confirmed native sample changed; compare and confirm deliberately.");
      if (frozen.sample.state === "uninitialized" ? frozen.name === "" : frozen.name === frozen.sample.profile.name) return null; // Explicit local no-op, not an accepted entry.
      if (!Array.isArray(captured.grants) || captured.grants.length > 8 || !captured.grants.every(grant => isGrant(grant) && grant.key === this.context.key && same(grant.subject, this.context.member)) || !isNamingBeside(captured.beside)) return fail("Unsupported naming preparation.");
      const grants = namingCopy(captured.grants), beside = namingCopy(captured.beside);
      const envelope: NamingEnvelope = { signed: await signedIntent(signer, { to: this.context.directory, kind: frozen.sample.state === "uninitialized" ? "name-room" : "set-room-name", on: frozen.sample.state === "uninitialized" ? null : frozen.sample.profile.id, expected: frozen.sample.state === "uninitialized" ? {} : { on: frozen.sample.profile.revision }, fields: { name: frozen.name } }, { ...selectedSigning, idempotencyKey: frozen.id }), grants, beside };
      await this.#current(); const record: NamingRecord = { v: 1, domain: "room-name", confirmation: frozen, envelope, phase: "prepared" };
      if (!isNamingRecord(record)) return fail("The exact naming envelope failed validation.");
      this.#loaded = record; const kept = await this.#save(journal, record, true); await this.#current();
      await this.#dispatch(kept, record); this.current(); return this.loaded;
    });
  }
  /** Explicit owner action only for the retained definitely-unsent envelope. */
  async resumePrepared(): Promise<NamingRecord | null> {
    return this.#locked(async () => {
      if (this.#storageBlocked) return fail("Persistence failure is not permission to resend.");
      await this.#current(); const journal = await this.#load(), record = journal.records.at(-1); if (!record) return null;
      this.#loaded = namingCopy(record);
      if (record.phase !== "prepared" || record.answer !== undefined || !same(record.confirmation.sample.context, this.context)) return fail("Only an exact definitely-unsent original can be resumed.");
      const capture = namingCopy(await this.native.capture(this.context)); await this.#current();
      if (!isNamingSample(capture.sample) || capture.sample.definition !== record.confirmation.sample.definition || capture.sample.head.seq < record.confirmation.sample.head.seq || capture.sample.head.seq === record.confirmation.sample.head.seq && capture.sample.head.hash !== record.confirmation.sample.head.hash || capture.sample.state !== record.confirmation.sample.state || !same(capture.sample.context, this.context) || capture.sample.state === "profile" && (record.confirmation.sample.state !== "profile" || !same(capture.sample.profile, record.confirmation.sample.profile))) return fail("The original frozen context/revision changed.");
      await this.#dispatch(journal, record); this.current(); return this.loaded;
    });
  }
  async #dispatch(journal: NamingJournal, prepared: NamingRecord): Promise<void> {
    await this.#current(); const attempted: NamingRecord = { ...prepared, phase: "attempted" }; this.#loaded = attempted;
    const kept = await this.#save(journal, attempted); await this.#current();
    let answer: Answer;
    try { answer = await this.native.submit(attempted.confirmation.sample.context, namingCopy(attempted.envelope)); }
    catch { return; } // Durable attempted original remains unknown; no blind POST retry.
    this.#loaded = { ...attempted, answer }; // Whole known Answer BEFORE any awaited work.
    if (!isNamingAnswer(answer)) { this.#malformedResponse = true; return fail("Malformed response; original remains blocked for reconciliation."); }
    const known = namingCopy(this.#loaded); this.#loaded = known; await this.#save(kept, known);
  }
  /** Read-only original settlement. Missing/not-found never releases unknown.
   * A later context/read does not retarget or re-sign the retained operation. */
  async reconcile(): Promise<NamingRecord | null> {
    return this.#locked(async () => {
      if (this.#storageBlocked) return fail("Persistence unavailable; reload settles only the durable original.");
      let journal = await this.#load(), record = journal.records.at(-1); if (!record) return null;
      this.#loaded = namingCopy(record); this.#malformedResponse = false;
      if (record.phase === "prepared") return this.loaded;
      if (record.answer?.answer === "mismatch") return this.loaded; // Quarantined identity conflict, never another intent.
      if (record.answer?.answer !== "refused" && !namingReceipt(record)) {
        const response = await this.native.settle(record.confirmation.sample.context, namingCopy(record.envelope.signed));
        if (!isRead(isReceipt)(response) || !response.ok || !response.complete || response.next !== undefined || !receiptReadHead(response.at, response.value) || !receiptMatches(record, response.value)) return this.loaded;
        const settled = namingCopy(response);
        record = { ...record, settlement: settled }; this.#loaded = record;
        journal = await this.#save(journal, record);
      }
      const receipt = namingReceipt(record);
      if (receipt && !namingRecordVerified(record)) {
        const read = await this.native.entry(record.confirmation.sample.context, receipt);
        if (!isRead(isSealed)(read) || !read.ok || !read.complete || read.next !== undefined || read.at.seq < read.value.entry.seq || read.at.seq === read.value.entry.seq && read.at.hash !== read.value.hash) return this.loaded;
        const verified = { ...record, verified: namingCopy(read.value) }; if (!namingRecordVerified(verified)) return this.loaded;
        record = verified; this.#loaded = record; journal = await this.#save(journal, record);
      }
      if (namingResolved(record)) {
        let sample: NamingSample | null = null;
        try { sample = await this.native.latest(record.confirmation.sample.context); } catch { /* Current read is independently unavailable. */ }
        const actual = sample && isNamingSample(sample) && same(sample.context, record.confirmation.sample.context) && sample.definition === record.confirmation.sample.definition && (!record.verified || sample.head.seq >= record.verified.entry.seq && (sample.head.seq !== record.verified.entry.seq || sample.head.hash === record.verified.hash)) ? namingCopy(sample) : null;
        const agrees = actual && actual.state === "profile" && actual.profile.name === record.confirmation.name;
        record = { ...record, latest: actual ? { state: agrees ? "available" : "conflicting", sample: actual } : { state: "unavailable" } };
        this.#loaded = record; await this.#save(journal, record);
      }
      this.current(); return this.loaded;
    });
  }
  /** Explicit PUBLIC evidence projection: no draft/name, credentials, grants,
   * signatures, session headers, known Answer bodies or context catalog. */
  publicStatus(): { phase: string; persistence: string; latest: string; intent: string | null } {
    const record = this.#loaded;
    const phase = this.#malformedResponse ? "blocked-malformed-response" : !record ? "none" : record.answer?.answer === "mismatch" ? "quarantined" : namingRecordVerified(record) ? "recorded-verified" : namingReceipt(record) ? "accepted-unverified" : record.answer?.answer === "refused" ? "refused" : record.phase === "prepared" ? "prepared" : "unknown";
    return { phase, persistence: this.#storageBlocked ? "unavailable" : "available", latest: record?.latest?.state ?? "not-read", intent: record ? intentDigest(record.envelope.signed.intent) : null };
  }
}
