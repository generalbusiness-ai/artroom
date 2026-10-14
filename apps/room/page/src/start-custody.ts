/** Page raw-key custody for one explicit demo Start. The claim journal alone
 * retains signed stages and the separate internal recovery key. */
import type { KeyId } from "@generalbusiness/dap-contract";
import { b64url, canonicalize, isRecord, isScopeRef, keyIdOfSecret, unb64url, utf8 } from "@generalbusiness/artroom-bytes";
import { isFoundingOffer, type FoundingOffer, type Fetch } from "@generalbusiness/artroom-client";
import { claimRoom, claimStatus, type ClaimOptions, type ClaimRegister, type ClaimStorage, type ClaimedRoom } from "./claim.ts";

interface KeptStart { v: 1; origin: string; secret: string; configured: ClaimRegister; label: string; handle: "@founder"; operation?: string; recoverySaved?: true }
export interface StartStatus { key: KeyId; configured: ClaimRegister; label: string; handle: "@founder"; state: "prepared" | "pending" | "complete"; operation?: string; recoverySaved?: true }
export interface StartOptions extends Pick<ClaimOptions, "locks" | "current" | "pause" | "tries" | "foundingOffer"> {
  mode: "new" | "continue" | "check";
  offer?: FoundingOffer;
  label?: string;
  fetch?: Fetch;
  now?: () => number;
}
export interface StartedRoom extends ClaimedRoom { key: KeyId; configured: ClaimRegister; handle: "@founder"; /** Private verified-settings handoff only. */ secret?: Uint8Array }
const keyOf = (origin: string) => `artroom-page-start:${origin}`;
const unavailable = () => new Error("The original private Start key or claim is unavailable. Nothing was replaced or submitted.");
function originOf(origin: string): void {
  const url = new URL(origin);
  const browser = globalThis as { location?: { origin: string } };
  if (url.origin !== origin || !["https:", "http:"].includes(url.protocol) || browser.location && browser.location.origin !== origin) throw unavailable();
}
function read(origin: string, storage: ClaimStorage): KeptStart | null {
  originOf(origin);
  const raw = storage.getItem(keyOf(origin));
  if (raw === null) return null;
  let secret: Uint8Array | null = null;
  try {
    if (utf8(raw).length > 4096) throw unavailable();
    const row: unknown = JSON.parse(raw);
    if (!isRecord(row) || !Object.keys(row).every(key => ["v", "origin", "secret", "configured", "label", "handle", "operation", "recoverySaved"].includes(key)) || row["v"] !== 1 || row["origin"] !== origin || row["handle"] !== "@founder" || typeof row["label"] !== "string" || !row["label"].trim() || row["label"].length > 256 || typeof row["secret"] !== "string") throw unavailable();
    if (row["operation"] !== undefined && (typeof row["operation"] !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(row["operation"]))) throw unavailable();
    if (row["recoverySaved"] !== undefined && row["recoverySaved"] !== true) throw unavailable();
    const configured = row["configured"];
    if (!isRecord(configured) || Object.keys(configured).sort().join(",") !== "definition,register" || !["platform:register@7", "platform:register@8"].includes(configured["definition"] as string) || !isScopeRef(configured["register"]) || configured["register"].kind !== "register") throw unavailable();
    secret = unb64url(row["secret"]);
    if (!secret || secret.length !== 32 || b64url(secret) !== row["secret"]) throw unavailable();
    return row as unknown as KeptStart;
  } catch { throw unavailable(); }
  finally { secret?.fill(0); }
}
function current(options: StartOptions): void { if (options.current?.() === false) throw unavailable(); }
function save(row: KeptStart, storage: ClaimStorage, options: StartOptions): KeptStart {
  current(options);
  const bytes = canonicalize(row);
  read(row.origin, { getItem: () => bytes, setItem: () => { throw unavailable(); } });
  storage.setItem(keyOf(row.origin), bytes);
  if (storage.getItem(keyOf(row.origin)) !== bytes) throw unavailable();
  current(options);
  return read(row.origin, storage)!;
}
function publicOf(row: KeptStart, storage: ClaimStorage): StartStatus {
  const secret = unb64url(row.secret)!;
  try {
    const status = claimStatus({ service: row.origin, secret }, row.configured, storage, row.operation);
    // Never infer never-dispatched from a missing or mismatched journal.
    // The descriptor binds the reserved operation before the CLI can sign.
    if (row.operation ? !status || status.operation !== row.operation : status !== null) throw unavailable();
    return { key: keyIdOfSecret(secret), configured: structuredClone(row.configured), label: row.label, handle: row.handle, state: status?.state ?? "prepared", ...(status ? { operation: status.operation } : {}), ...(row.recoverySaved ? { recoverySaved: true } : {}) };
  } finally { secret.fill(0); }
}
export function originalStart(origin: string, storage: ClaimStorage): StartStatus | null {
  const row = read(origin, storage);
  return row ? publicOf(row, storage) : null;
}
export async function startRoom(origin: string, storage: ClaimStorage, options: StartOptions): Promise<StartedRoom> {
  originOf(origin);
  const browser = globalThis as { navigator?: { locks?: import("./claim.ts").ClaimLocks } };
  const locks = options.locks ?? browser.navigator?.locks;
  if (!locks) throw new Error("Private Start locking is unavailable. Nothing was submitted.");
  return locks.request(`artroom-page-start:${origin}`, async () => {
    current(options);
    let row = read(origin, storage);
    if (options.mode === "new") {
      if (row) throw new Error("An original Start is already retained. Check status or explicitly Continue that original creation.");
      if (!options.offer || !isFoundingOffer(options.offer, origin) || options.offer.definition !== "platform:register@8") throw new Error("A current same-origin register8 demo founding offer is required. Nothing was submitted.");
      const label = options.label?.trim() ?? "";
      if (!label || label.length > 256) throw new Error("Enter a personal room label of at most 256 characters.");
      const secret = crypto.getRandomValues(new Uint8Array(32));
      try { row = save({ v: 1, origin, secret: b64url(secret), configured: { register: structuredClone(options.offer.register), definition: options.offer.definition }, label, handle: "@founder" }, storage, options); }
      finally { secret.fill(0); }
    }
    if (!row) throw unavailable();
    let held = row;
    const secret = unb64url(held.secret)!;
    try {
      const status = publicOf(held, storage);
      const stillCurrent = () => options.current?.() !== false && storage.getItem(keyOf(origin)) === canonicalize(held);
      if (!stillCurrent()) throw unavailable();
      if (options.mode === "check" && !status.operation) return { key: status.key, configured: status.configured, handle: held.handle, operation: "", label: held.label, repository: null, pending: true, outcome: { code: 1, lines: ["The Start key is retained, but no original claim has been prepared. Check sent nothing. Continue explicitly to prepare the first request."] } };
      const result = await claimRoom({ service: origin, secret, ...(options.fetch ? { fetch: options.fetch } : {}), ...(options.now ? { now: options.now } : {}) }, held.configured, storage, held.label, {
        ...(options.pause ? { pause: options.pause } : {}), ...(options.tries !== undefined ? { tries: options.tries } : {}), ...(options.foundingOffer ? { foundingOffer: async (register: ClaimRegister["register"]) => {
          const offered = await options.foundingOffer!(register);
          if (!isFoundingOffer(offered, origin, held.configured.register) || offered.definition !== held.configured.definition) throw unavailable();
          return offered;
        } } : {}), mode: status.operation ? "resume" : "new", ...(status.operation ? { operation: status.operation } : {}),
        handle: held.handle, readOnlyCheck: options.mode === "check", locks,
        retainOperation: operation => {
          if (!stillCurrent() || held.operation && held.operation !== operation) throw unavailable();
          if (!held.operation) held = save({ ...held, operation }, storage, options);
        },
        current: stillCurrent
      });
      if (!stillCurrent()) throw unavailable();
      return { ...result, key: status.key, configured: status.configured, handle: held.handle, ...(result.repository ? { secret: secret.slice() } : {}) };
    } finally { secret.fill(0); }
  });
}

/** One optional recovery-download attempt, separately from CLI connection files.
 * The caller must first reverify the enrolled founder; this binds that public
 * key/operation and reads back the once marker before releasing key bytes. */
export async function recoveryKeyOnce(origin: string, storage: ClaimStorage, expected: { key: KeyId; operation: string }, options: Pick<StartOptions, "locks" | "current"> = {}): Promise<string> {
  originOf(origin);
  const browser = globalThis as { navigator?: { locks?: import("./claim.ts").ClaimLocks } };
  const locks = options.locks ?? browser.navigator?.locks;
  if (!locks) throw unavailable();
  return locks.request(`artroom-page-start:${origin}`, async () => {
    const guard: StartOptions = { ...options, mode: "check" };
    current(guard);
    const row = read(origin, storage);
    if (!row) throw unavailable();
    const status = publicOf(row, storage);
    if (status.state !== "complete" || status.key !== expected.key || status.operation !== expected.operation || row.recoverySaved) throw new Error("The optional recovery file was already offered or its verified founder context changed. No key was exported.");
    const saved = save({ ...row, recoverySaved: true }, storage, guard);
    return saved.secret + "\n";
  });
}
