/** Native founding through the existing CLI workflow, with private browser recovery.
 * A typed label is local intent, not the repository name selected by the host.
 * This module never installs a register or imports an operator key. */
import type { PlatformDefinition, ScopeRef } from "@generalbusiness/artroom-contract";
import { b64url, canonicalize, isScopeRef, keyIdOfSecret, parseStrict, unb64url } from "@generalbusiness/artroom-bytes";
import { ScopeHandle, httpTransport, secretSigner, signedReads } from "@generalbusiness/artroom-client";
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
export interface ClaimOptions extends Pick<Context, "pause" | "tries"> { handle?: string; locks?: ClaimLocks }
export interface ClaimedRoom {
  outcome: Outcome;
  /** The original local label, kept across a retry; never a native name claim. */
  label: string;
  repository: Repository | null;
  pending: boolean;
}
interface Kept { v: 1; binding: string; label: string; config: Config; recovery?: string; completed?: PendingClaim }

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

/** One complete record is committed before the workflow can submit a mutation.
 * The caller's existing signing key stays in its existing browser settings;
 * only a separately generated recovery key is kept in this record. */
function storeFor(session: Session, configured: ClaimRegister, storage: ClaimStorage, label: string): { store: Store; kept(): Kept } {
  const binding = bindingOf(session, configured);
  const storageKey = `artroom-page-claim:${binding}`;
  const raw = storage.getItem(storageKey);
  let record: Kept;
  if (raw !== null) {
    let value: unknown;
    try { value = parseStrict(raw); } catch { throw new Error("The private claim record cannot be read. It is kept; nothing was submitted."); }
    const got = value as Kept | null;
    if (!got || got.v !== 1 || got.binding !== binding || typeof got.label !== "string" || !got.config || got.config.v !== 1
      || got.config.service !== session.service || got.config.key !== "browser" || canonicalize(got.config.register) !== canonicalize(configured.register)
      || got.config.plan !== undefined || got.config.join !== undefined
      || (got.recovery !== undefined && unb64url(got.recovery)?.length !== 32)) throw new Error("The private claim record does not match this Worker, register and key. It is kept; nothing was submitted.");
    record = got;
  } else {
    record = { v: 1, binding, label, config: { v: 1, service: session.service, key: "browser", register: configured.register } };
  }
  const write = (next: Kept): void => {
    const bytes = canonicalize(next);
    storage.setItem(storageKey, bytes);
    // A storage adapter that silently drops the write must also stop before
    // sending. The complete old record survives an ordinary failed setItem.
    if (storage.getItem(storageKey) !== bytes) throw new Error("The browser could not retain the exact claim. Nothing further was submitted.");
    record = structuredClone(next);
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
export async function claimRoom(session: Session, configured: ClaimRegister, storage: ClaimStorage, label: string, options: ClaimOptions = {}): Promise<ClaimedRoom> {
  const binding = bindingOf(session, configured);
  const browser = globalThis as { navigator?: { locks?: ClaimLocks } };
  const locks = options.locks ?? browser.navigator?.locks;
  if (!locks) throw new Error("This browser cannot lock private claim recovery across tabs. Nothing was submitted.");
  return locks.request(`artroom-page-claim:${binding}`, async () => {
    if (!label.trim() || label.length > 256) throw new Error("Enter a local room label of at most 256 characters.");
    const privateStore = storeFor(session, configured, storage, label.trim());
    const before = privateStore.kept();
    if (!before.config.claim && !before.config.repository) {
      const eligible = await allowedClaim(session, configured.register);
      if (eligible.definition !== configured.definition) throw new Error("The register read does not match the configured pinned version. Nothing was submitted.");
    }
    if (before.config.repository && !before.completed) throw new Error("The saved room has no exact native claim recovery proof. It is kept; nothing was submitted.");
    const { handle, locks: _locks, ...waiting } = options;
    const outcome = await claim({ store: privateStore.store, ...session.fetch ? { fetch: session.fetch } : {}, ...session.now ? { now: session.now } : {}, ...waiting }, before.label, handle !== undefined ? { handle } : {});
    const after = privateStore.kept();
    return { outcome, label: after.label, repository: outcome.code === 0 ? after.config.repository ?? null : null, pending: outcome.code !== 0 && (after.config.claim !== undefined || after.completed !== undefined) };
  });
}
