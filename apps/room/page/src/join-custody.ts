import { isInvitationRedemptionFields } from "@generalbusiness/artroom-client";
/** One bounded origin-private enrollment slot. Page's existing raw-key policy remains. */
import type { Answer, KeyId, Receipt } from "@generalbusiness/dap-contract";
import { b64url, canonicalize, intentDigest, isHead, isReceipt, isRecord, isScopeId, isScopeRef, isSignedIntentShape, keyIdOfSecret, unb64url, utf8, verifySignedIntent } from "@generalbusiness/artroom-bytes";
import type { Fetch } from "@generalbusiness/artroom-client";
import { invitationTarget, prepareJoin, settleJoin, submitJoin, verifyJoinReceipt, type Place, type PreparedJoin, type Session } from "./data.ts";

export interface JoinStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export interface JoinLock { run<T>(work: () => Promise<T>): Promise<T> }
export interface JoinOptions { secret?: Uint8Array; fetch?: Fetch; now?: () => number; current?: () => boolean; lock?: JoinLock }
export interface OriginalJoin { status: "prepared" | "unknown" | "refused" | "verified"; key: KeyId; place: Place; handle: string }
export type JoinResult = (Omit<OriginalJoin, "status"> & { status: "unknown" | "refused" | "blocked"; reason: string; answer?: Answer }) | (Omit<OriginalJoin, "status"> & { status: "verified"; /** Private Settings handoff, never render or log. */ secret: Uint8Array; answer: Extract<Answer, { answer: "accepted" }> });
interface PriorRefusal { prepared: PreparedJoin; refusal: Extract<Answer, { answer: "refused" }> }
interface RecordJoin { history?: PriorRefusal[]; v: 1; origin: string; secret: string; prepared: PreparedJoin; phase: OriginalJoin["status"]; receipt?: Receipt; refusal?: Extract<Answer, { answer: "refused" }> }
const MOST = 64 * 1024, MAX_REFUSALS = 8;
const error = () => new Error("The original private enrollment is unavailable or no longer current. Nothing was replaced.");
const closed = (value: unknown, required: string[], optional: string[] = []): value is Record<string, unknown> => isRecord(value) && required.every(k => Object.hasOwn(value, k)) && Object.keys(value).every(k => required.includes(k) || optional.includes(k));
function originOf(origin: string): void {
  const url = new URL(origin);
  const browser = globalThis as { location?: { origin: string } };
  if (url.origin !== origin || !["https:", "http:"].includes(url.protocol) || browser.location && browser.location.origin !== origin) throw error();
}
const storageKey = (origin: string) => `artroom-page-enrollment:${origin}`;
function read(origin: string, storage: JoinStorage): RecordJoin | null {
  originOf(origin);
  const raw = storage.getItem(storageKey(origin));
  if (raw === null) return null;
  let seed: Uint8Array | null = null;
  try {
    if (utf8(raw).length > MOST) throw error();
    const row: unknown = JSON.parse(raw);
    if (!closed(row, ["v", "origin", "secret", "prepared", "phase"], ["receipt", "refusal", "history"]) || row["v"] !== 1 || row["origin"] !== origin || typeof row["secret"] !== "string" || !["prepared", "unknown", "refused", "verified"].includes(String(row["phase"]))) throw error();
    seed = unb64url(row["secret"]);
    if (!seed || seed.length !== 32 || b64url(seed) !== row["secret"]) throw error();
    const p = row["prepared"];
    if (!closed(p, ["place", "definition", "handle", "link", "signed"]) || !closed(p["place"], ["directory", "membership"]) || !isScopeId(p["place"]["directory"]) || !isScopeRef(p["place"]["membership"]) || p["place"]["membership"].kind !== "membership" || !["platform:membership@1", "platform:membership@2", "platform:membership@6"].includes(String(p["definition"])) || typeof p["handle"] !== "string" || !p["handle"] || typeof p["link"] !== "string" || !/^sha256:[0-9a-f]{64}$/.test(p["link"]) || !isSignedIntentShape(p["signed"]) || !verifySignedIntent(p["signed"]) || p["signed"].intent.actor !== keyIdOfSecret(seed) || p["signed"].intent.kind !== "join" || canonicalize(p["signed"].intent.to) !== canonicalize(p["place"]["membership"]) || Object.keys(p["signed"].intent.expected).length !== 0 || !isInvitationRedemptionFields(String(p["definition"]), p["signed"].intent.fields)) throw error();
    seed.fill(0);
    if (row["receipt"] !== undefined && (!isReceipt(row["receipt"]) || row["receipt"].definition !== p["definition"] || row["receipt"].intent !== intentDigest(p["signed"].intent) || canonicalize(row["receipt"].fact.at) !== canonicalize(p["place"]["membership"]))) throw error();
    if (row["phase"] === "verified" && !row["receipt"]) throw error();
    if (row["refusal"] !== undefined && (!closed(row["refusal"], ["answer", "reason", "judgedAt"], ["name"]) || row["refusal"]["answer"] !== "refused" || typeof row["refusal"]["reason"] !== "string" || !isHead(row["refusal"]["judgedAt"]))) throw error();
    if (row["phase"] === "refused" && !row["refusal"]) throw error();
    if (row["history"] !== undefined) {
      if (!Array.isArray(row["history"]) || row["history"].length > MAX_REFUSALS) throw error();
      for (const prior of row["history"]) {
        if (!closed(prior, ["prepared", "refusal"])) throw error();
        // Each retained request must still verify under this same origin/key.
        // No nested history is admitted and no original signed bytes change.
        const bytes = canonicalize({ v: 1, origin, secret: row["secret"], prepared: prior["prepared"], phase: "refused", refusal: prior["refusal"] });
        read(origin, { getItem: () => bytes, setItem: () => { throw error(); } });
      }
    }
    return row as unknown as RecordJoin;
  } catch { throw error(); } finally { seed?.fill(0); }
}
function current(options: JoinOptions): void { if (options.current?.() === false) throw error(); }
function write(row: RecordJoin, storage: JoinStorage, options: JoinOptions): RecordJoin {
  current(options);
  const raw = canonicalize(row);
  if (utf8(raw).length > MOST) throw error();
  // Validate the candidate before touching the retained original slot.
  read(row.origin, { getItem: () => raw, setItem: () => { throw error(); } });
  storage.setItem(storageKey(row.origin), raw);
  if (storage.getItem(storageKey(row.origin)) !== raw) throw error();
  current(options);
  return read(row.origin, storage)!;
}
function locked<T>(origin: string, options: JoinOptions, work: () => Promise<T>): Promise<T> {
  if (options.lock) return options.lock.run(work);
  if (typeof navigator === "undefined" || !navigator.locks) throw new Error("Private enrollment locking is unavailable. Nothing was submitted.");
  return navigator.locks.request(`artroom-page-enrollment:${origin}`, work);
}
function publicOf(row: RecordJoin): OriginalJoin {
  const seed = unb64url(row.secret)!;
  try { return { status: row.phase, key: keyIdOfSecret(seed), place: structuredClone(row.prepared.place), handle: row.prepared.handle }; }
  finally { seed.fill(0); }
}
export function originalJoin(origin: string, storage: JoinStorage): OriginalJoin | null { const row = read(origin, storage); return row ? publicOf(row) : null; }
function sessionOf(row: RecordJoin, options: JoinOptions): Session { return { service: row.origin, secret: unb64url(row.secret)!, ...(options.fetch ? { fetch: options.fetch } : {}), ...(options.now ? { now: options.now } : {}) }; }
const unknown = (row: RecordJoin, reason: string): JoinResult => ({ ...publicOf(row), status: "unknown", reason });
async function checked(row: RecordJoin, storage: JoinStorage, options: JoinOptions): Promise<JoinResult> {
  current(options);
  if (row.phase === "refused") return { ...publicOf(row), status: "refused", reason: `Refused because ${row.refusal!.reason}.`, answer: row.refusal! };
  const session = sessionOf(row, options);
  try {
    const receipt = await settleJoin(session, row.prepared); current(options);
    if (!receipt || !await verifyJoinReceipt(session, row.prepared, receipt)) return unknown(row, "The original enrollment remains unknown. No replacement was sent.");
    current(options);
    const saved = write({ ...row, phase: "verified", receipt }, storage, options);
    return { ...publicOf(saved), status: "verified", secret: session.secret.slice(), answer: { answer: "accepted", receipt } };
  } catch { current(options); return unknown(row, "The original enrollment could not be checked. No replacement was sent."); }
  finally { session.secret.fill(0); }
}
export async function checkOriginal(origin: string, storage: JoinStorage, options: JoinOptions = {}): Promise<JoinResult | null> {
  originOf(origin);
  return locked(origin, options, async () => { current(options); const row = read(origin, storage); return row ? checked(row, storage, options) : null; });
}
export async function joinInvitation(origin: string, invitation: string, storage: JoinStorage, options: JoinOptions = {}): Promise<JoinResult> {
  originOf(origin);
  const target = invitationTarget(origin, invitation);
  return locked(origin, options, async () => {
    current(options);
    let row = read(origin, storage);
    // Only a terminal current slot may expose an archived terminal answer.
    // Unknown/prepared custody must remain the UI's unresolved original.
    if (row && (row.phase === "refused" || row.phase === "verified")) {
      const prior = row.history?.find(prior => prior.prepared.link === target.link);
      if (prior) return {
        ...publicOf(row), place: structuredClone(prior.prepared.place), handle: prior.prepared.handle,
        status: "refused", reason: `Refused because ${prior.refusal.reason}.`, answer: structuredClone(prior.refusal)
      };
    }
    if (row?.phase === "refused") {
      if (row.prepared.link === target.link) return checked(row, storage, options);
      if ((row.history?.length ?? 0) >= MAX_REFUSALS) throw new Error("Private enrollment refusal history is full. Nothing was replaced.");
      const secret = unb64url(row.secret)!;
      try {
        const prepared = await prepareJoin({ service: origin, secret, ...(options.now ? { now: options.now } : {}) }, invitation);
        current(options);
        const history = [...(row.history ?? []), { prepared: row.prepared, refusal: row.refusal! }];
        row = write({ v: 1, origin, secret: row.secret, prepared, phase: "prepared", history }, storage, options);
      } finally { secret.fill(0); }
    }
    if (row && row.phase !== "prepared" && row.phase !== "verified") return unknown(row, "The original enrollment is retained. Check its status before another invitation.");
    if (row && row.prepared.link !== target.link) {
      if (row.phase !== "verified") return { ...publicOf(row), status: "blocked", reason: "Another original enrollment is retained. Nothing was replaced." };
      const prior = await checked(row, storage, options);
      if (prior.status !== "verified") return prior;
      prior.secret.fill(0);
      row = null;
    }
    if (row?.phase === "verified") return checked(row, storage, options);
    if (!row) {
      const secret = options.secret ? Uint8Array.from(options.secret) : crypto.getRandomValues(new Uint8Array(32));
      try {
        if (secret.length !== 32) throw error();
        const prepared = await prepareJoin({ service: origin, secret, ...(options.now ? { now: options.now } : {}) }, invitation);
        current(options);
        row = write({ v: 1, origin, secret: b64url(secret), prepared, phase: "prepared" }, storage, options);
      } finally { secret.fill(0); }
    }
    // Read back the complete key/envelope before marking dispatch ambiguous,
    // then read back that marker before the only allowed first submission.
    row = write({ ...row, phase: "unknown" }, storage, options);
    const session = sessionOf(row, options);
    try {
      current(options);
      const answer = await submitJoin(session, row.prepared); current(options);
      if (answer.answer === "refused") {
        const saved = write({ ...row, phase: "refused", refusal: answer }, storage, options);
        return { ...publicOf(saved), status: "refused", reason: `Refused because ${answer.reason}.`, answer };
      }
      if (answer.answer !== "accepted") return unknown(row, "The original enrollment remains unknown. Check its original request; no replacement will be sent.");
      row = write({ ...row, receipt: answer.receipt }, storage, options);
      if (!await verifyJoinReceipt(session, row.prepared, answer.receipt)) return unknown(row, "The original accepted enrollment could not be verified. Check its status.");
      current(options);
      const saved = write({ ...row, phase: "verified" }, storage, options);
      return { ...publicOf(saved), status: "verified", secret: session.secret.slice(), answer };
    } catch { return unknown(row, "The original enrollment remains unknown. Check its status; nothing was replaced."); }
    finally { session.secret.fill(0); }
  });
}
