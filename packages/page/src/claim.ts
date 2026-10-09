/** Native founding through the existing CLI workflow, with private browser recovery.
 * A typed label is local intent, not the repository name selected by the host.
 * This module never installs a register or imports an operator key. */
import type { PlatformDefinition, ScopeRef } from "@generalbusiness/artroom-contract";
import { b64url, canonicalize, isScopeRef, keyIdOfSecret, parseStrict, unb64url } from "@generalbusiness/artroom-bytes";
import { ScopeHandle, httpTransport, secretSigner, signedReads, type Fetch } from "@generalbusiness/artroom-client";
import { claim, type Config, type Context, type Outcome, type PendingClaim, type Repository, type Store } from "@generalbusiness/artroom-cli";
import { DIRECTORY_OF } from "@generalbusiness/artroom-platform";
import type { Session } from "./data.ts";

export interface ClaimRegister { register: ScopeRef; definition: PlatformDefinition }
/** Private same-origin storage. Its values include recovery key material;
 * they must never be exported as public config or included in diagnostics. */
export interface ClaimStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
/** Exclusive across all callers/tabs sharing the private record. Production
 * uses Web Locks; a test supplies its explicitly labelled lock stand-in. */
export interface ClaimLocks { request<T>(name: string, run: () => Promise<T>): Promise<T> }
export interface ClaimOptions extends Pick<Context, "pause" | "tries"> {
  handle?: string;
  locks?: ClaimLocks;
  /** True only while the Page still selects the captured room, key and register.
   * Checked after waiting for the lock and immediately before mutation delivery.
   * A changed context never discards or replaces a saved original envelope. */
  current?: () => boolean;
  /** New explicitly opens a different operation after verified completion.
   * For new, operation is the expected active predecessor (absent: none).
   * For resume, it names the exact existing operation, including an archive. */
  mode: "new" | "resume";
  operation?: string;
}
export interface ClaimedRoom {
  outcome: Outcome;
  operation: string;
  /** The original local label, kept across a retry; never a native name claim. */
  label: string;
  repository: Repository | null;
  pending: boolean;
}
interface Kept { v: 1; binding: string; label: string; config: Config; recovery?: string; completed?: PendingClaim }
interface Journal { v: 2; binding: string; active: string; claims: Record<string, string>; originalLegacy?: string }
export interface ClaimStatus { operation: string; label: string; state: "pending" | "complete" }
/** A client storage bound, not native founding permission or capacity. No
 * archived or unknown operation is evicted to admit another one. */
const MAX_CLAIMS = 64;
const operationId = (id: string): boolean => id === "legacy" || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);

function originOf(session: Session): void {
  const url = new URL(session.service);
  const browser = globalThis as { location?: { origin: string } };
  if (url.origin !== session.service || !["https:", "http:"].includes(url.protocol) || browser.location && browser.location.origin !== session.service) throw new Error("Claiming requires the exact origin of the Worker serving this page.");
}

function bindingOf(session: Session, configured: ClaimRegister): string {
  if (session.secret.length !== 32 || !isScopeRef(configured.register) || configured.register.kind !== "register" || !DIRECTORY_OF[configured.definition]) throw new Error("A valid key and an explicitly supported configured register are required.");
  // The browser caller passes location.origin; an arbitrary remote connection
  // is not selected from a saved setting, invitation, or claim record.
  originOf(session);
  return canonicalize([session.service, configured.register, configured.definition, keyIdOfSecret(session.secret)]);
}

function readKept(raw: string, binding: string, session: Session, configured: ClaimRegister): Kept {
  let got: Kept | null;
  try { got = parseStrict(raw) as unknown as Kept | null; } catch { throw new Error("The private claim record cannot be read. It is kept; nothing was submitted."); }
  if (!got || got.v !== 1 || got.binding !== binding || typeof got.label !== "string" || !got.config || got.config.v !== 1
    || got.config.service !== session.service || got.config.key !== "browser" || canonicalize(got.config.register) !== canonicalize(configured.register)
    || got.config.plan !== undefined || got.config.join !== undefined
    || (got.recovery !== undefined && unb64url(got.recovery)?.length !== 32)) throw new Error("The private claim record does not match this Worker, register and key. It is kept; nothing was submitted.");
  return got;
}
function readJournal(session: Session, configured: ClaimRegister, storage: ClaimStorage): { binding: string; storageKey: string; journal: Journal | null } {
  const binding = bindingOf(session, configured);
  const storageKey = `artroom-page-claim:${binding}`;
  const raw = storage.getItem(storageKey);
  if (raw === null) return { binding, storageKey, journal: null };
  let value: unknown;
  try { value = parseStrict(raw); } catch { throw new Error("The private claim journal cannot be read. It is kept; nothing was submitted."); }
  // Preserve every byte of the legacy record until a checked native workflow
  // updates that same operation. Migration never invents another found.
  if ((value as Kept | null)?.v === 1) {
    readKept(raw, binding, session, configured);
    return { binding, storageKey, journal: { v: 2, binding, active: "legacy", claims: { legacy: raw }, originalLegacy: raw } };
  }
  const got = value as Journal | null;
  if (!got || got.v !== 2 || got.binding !== binding || typeof got.active !== "string" || !operationId(got.active)
    || !got.claims || typeof got.claims !== "object" || Array.isArray(got.claims)
    || got.originalLegacy !== undefined && typeof got.originalLegacy !== "string"
    || Object.keys(got.claims).length > MAX_CLAIMS || !Object.hasOwn(got.claims, got.active)
    || Object.entries(got.claims).some(([id, bytes]) => !operationId(id) || typeof bytes !== "string")) throw new Error("The private claim journal does not match this context. It is kept; nothing was submitted.");
  return { binding, storageKey, journal: got };
}
/** A local descriptor only. It carries neither signing keys nor permission,
 * and a complete hint is revalidated natively before a new creation. */
export function claimStatus(session: Session, configured: ClaimRegister, storage: ClaimStorage): ClaimStatus | null {
  const { binding, journal } = readJournal(session, configured, storage);
  if (!journal) return null;
  const kept = readKept(journal.claims[journal.active]!, binding, session, configured);
  return { operation: journal.active, label: kept.label, state: kept.completed ? "complete" : "pending" };
}

/** One journal write commits the operation ID and its complete private record
 * before a mutation can leave. Existing signing keys stay in Page settings;
 * each new operation generates and retains its own recovery key. */
function storeFor(session: Session, configured: ClaimRegister, storage: ClaimStorage, label: string, operation: string, fresh = false): { store: Store; kept(): Kept } {
  const read = readJournal(session, configured, storage);
  const { binding, storageKey } = read;
  let journal = read.journal ?? { v: 2 as const, binding, active: operation, claims: {} };
  if (!operationId(operation)) throw new Error("The creation operation ID is invalid. Nothing was submitted.");
  if (fresh && Object.keys(journal.claims).length >= MAX_CLAIMS) throw new Error("This browser's claim journal is full. Original proofs are kept; no new creation was submitted.");
  const raw = journal.claims[operation];
  if (fresh && raw !== undefined || !fresh && raw === undefined) throw new Error("The creation operation does not match the private journal. Nothing was submitted.");
  let record: Kept = raw !== undefined ? readKept(raw, binding, session, configured) : { v: 1, binding, label, config: { v: 1, service: session.service, key: "browser", register: configured.register } };
  const write = (next: Kept): void => {
    const nextJournal: Journal = { ...journal, ...(fresh ? { active: operation } : {}), claims: { ...journal.claims, [operation]: canonicalize(next) } };
    const bytes = canonicalize(nextJournal);
    storage.setItem(storageKey, bytes);
    // A storage adapter that silently drops the write must also stop before
    // sending. The complete old record survives an ordinary failed setItem.
    if (storage.getItem(storageKey) !== bytes) throw new Error("The browser could not retain the exact claim. Nothing further was submitted.");
    record = structuredClone(next);
    journal = nextJournal;
  };
  const store: Store = {
    config: async () => {
      const config = structuredClone(record.config);
      if (!record.completed) return config;
      const { repository: _repository, handle: _handle, ...base } = config;
      return { ...base, claim: structuredClone(record.completed) };
    },
    save: async (config) => write({ ...record, config, ...(config.repository && record.config.claim ? { completed: structuredClone(record.config.claim) } : {}) }),
    secret: async (name) => name === "browser" ? session.secret.slice() : name === "recovery" && record.recovery ? unb64url(record.recovery) : null,
    keep: async (name, secret) => {
      if (name !== "recovery" || secret.length !== 32 || record.recovery !== undefined) throw new Error("An existing browser or recovery key is never replaced.");
      write({ ...record, recovery: b64url(secret) });
    },
    private: async () => null,
    keepPrivate: async () => { throw new Error("Claiming does not create a private invitation record."); },
  };
  return { store, kept: () => structuredClone(record) };
}

/** Authoritative offer check for an explicitly configured full register ref.
 * Reads through the caller's existing key; no register installation or newest
 * version guess is used. The register still judges the eventual signed act. */
export async function allowedClaim(session: Session, register: ScopeRef): Promise<ClaimRegister> {
  originOf(session);
  if (session.secret.length !== 32 || !isScopeRef(register) || register.kind !== "register") throw new Error("A valid browser key and full configured register reference are required.");
  const transport = signedReads(httpTransport(session.service, session.fetch ? { fetch: session.fetch } : {}), secretSigner(session.secret), session.now ? { now: session.now } : {});
  const read = await new ScopeHandle(transport, register.scope).summary();
  if (!read.ok) throw new Error(`The configured register cannot be read: ${read.reason}. Nothing was submitted.`);
  if (!read.complete || read.next !== undefined || canonicalize(read.value.scope) !== canonicalize(register) || !DIRECTORY_OF[read.value.definition]) throw new Error("The register read does not match the complete configured reference and a supported pinned version. Nothing was submitted.");
  const registers = read.value.items.filter((item) => item.type === "register" && item.state === "open");
  const policy = registers[0]?.values["policy"];
  const founders = registers[0]?.values["founders"];
  if (registers.length !== 1 || !(policy === "open" || policy === "keys" && Array.isArray(founders) && founders.includes(keyIdOfSecret(session.secret)))) throw new Error("This browser key is not eligible under the configured register's founding policy. Nothing was submitted.");
  return { register, definition: read.value.definition as PlatformDefinition };
}

/** A saved pending envelope skips offer preflight so an aged accepted request
 * can be settled by the native workflow without refreshing its deadline. */
export async function claimRoom(session: Session, configured: ClaimRegister, storage: ClaimStorage, label: string, options: ClaimOptions): Promise<ClaimedRoom> {
  const binding = bindingOf(session, configured);
  const browser = globalThis as { navigator?: { locks?: ClaimLocks } };
  const locks = options.locks ?? browser.navigator?.locks;
  if (!locks) throw new Error("This browser cannot lock private claim recovery across tabs. Nothing was submitted.");
  return locks.request(`artroom-page-claim:${binding}`, async () => {
    const checkCurrent = (): void => {
      if (options.current?.() === false) throw new Error("The Page room, key or register changed. This continuation sends no new mutation. Any saved original claim is kept; its earlier outcome may be accepted or unknown.");
    };
    checkCurrent();
    if (!label.trim() || label.length > 256) throw new Error("Enter a local room label of at most 256 characters.");
    const { handle, locks: _locks, current: _current, mode: _mode, operation: _operation, ...waiting } = options;
    let blocked = false;
    const send = session.fetch ?? (globalThis as { fetch?: Fetch }).fetch;
    const guardedFetch: Fetch = (url, init) => {
      const path = new URL(url).pathname;
      if (init?.method === "POST" && (path.endsWith("/acts") || path.endsWith("/preparations") || path === "/v1/scopes")) {
        try { checkCurrent(); } catch (error) { blocked = true; throw error; }
      }
      if (!send) throw new Error("This runtime has no fetch; nothing was sent.");
      return send(url, init);
    };
    async function runNative(privateStore: ReturnType<typeof storeFor>, localLabel: string): Promise<Outcome> {
      return claim({ store: privateStore.store, fetch: guardedFetch, ...session.now ? { now: session.now } : {}, ...waiting }, localLabel, handle !== undefined ? { handle } : {});
    }
    const loaded = readJournal(session, configured, storage);
    const active = loaded.journal?.active;
    let operation: string;
    let fresh = false;
    if (options.mode === "resume") {
      operation = options.operation ?? active ?? "";
      if (!operation) throw new Error("There is no saved creation to resume. Choose Create room explicitly.");
    } else {
      if (options.operation !== active) throw new Error("Another creation changed this browser's journal. Inspect the saved operation before creating another room.");
      if (loaded.journal && Object.keys(loaded.journal.claims).length >= MAX_CLAIMS) throw new Error("This browser's claim journal is full. Original proofs are kept; no new creation was submitted.");
      if (active) {
        const previous = storeFor(session, configured, storage, label.trim(), active);
        const kept = previous.kept();
        if (!kept.completed) return { outcome: { code: 1, lines: ["A creation is already in progress. Resume that exact original operation before creating another room."] }, operation: active, label: kept.label, repository: null, pending: true };
        const verified = await runNative(previous, kept.label);
        if (verified.code !== 0) return { outcome: verified, operation: active, label: kept.label, repository: null, pending: true };
      }
      checkCurrent();
      const eligible = await allowedClaim(session, configured.register);
      if (eligible.definition !== configured.definition) throw new Error("The register read does not match the configured pinned version. Nothing was submitted.");
      checkCurrent();
      operation = crypto.randomUUID();
      fresh = true;
    }
    const privateStore = storeFor(session, configured, storage, label.trim(), operation, fresh);
    const before = privateStore.kept();
    if (before.config.repository && !before.completed) throw new Error("The saved room has no exact native claim recovery proof. It is kept; nothing was submitted.");
    checkCurrent();
    const native = await runNative(privateStore, before.label);
    const outcome: Outcome = blocked ? { code: 1, lines: ["The Page room, key or register changed. This continuation sent no new mutation after the context changed. The exact saved original claim is kept; earlier steps may already be accepted or unknown. Inspect or resume only under its original context."] } : native;
    const after = privateStore.kept();
    return { outcome, operation, label: after.label, repository: outcome.code === 0 ? after.config.repository ?? null : null, pending: outcome.code !== 0 && (after.config.claim !== undefined || after.completed !== undefined) };
  });
}
