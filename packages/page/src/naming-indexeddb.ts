/** C4's browser-owned credential references and NAMING journal only.
 * No enrollment invitation, claim, transcript, session token or voice record. */
import type { Signer } from "@generalbusiness/artroom-client";
import { b64url, canonicalize, isKeyId, keyIdOf, utf8 } from "@generalbusiness/artroom-bytes";
import { NamingBlocked, isNamingContext, isNamingJournal, namingContextKey, namingCopy, namingOrigin, namingResolved, namingTransition, type NamingContext, type NamingJournal, type NamingLimits, type NamingStore } from "./naming-custody.ts";

export interface NamingDatabaseReference { name: string; epoch: string; origin: string }
interface Meta { v: 1; epoch: string; origin: string }
interface Credential { ref: string; key: Signer["key"]; generation: number; active: boolean; privateKey: CryptoKey; publicKey: CryptoKey }
const STORES = ["meta", "credentials", "contexts", "naming"] as const;
const identifier = (value: string): boolean => /^[A-Za-z0-9_-]{1,128}$/.test(value);
const refused = (why: string): never => { throw new NamingBlocked(why); };
const request = <T>(value: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error ?? new NamingBlocked("IndexedDB request failed.")); });
function validLimits(limits: NamingLimits): void {
  if (Object.keys(limits).sort().join(",") !== "contexts,credentials,recordBytes,records,totalBytes" || !Object.values(limits).every(n => Number.isSafeInteger(n) && n > 0) || limits.recordBytes > limits.totalBytes) refused("Explicit bounded naming limits are required.");
}
function logicalBytes(value: unknown): number { return utf8(canonicalize(value)).length; }
/** Only IDB requests may be awaited in work: no crypto, network or Web Lock wait.
 * Readback happens before transaction completion; failure aborts the whole CAS. */
async function transaction<T>(db: IDBDatabase, names: readonly string[], mode: IDBTransactionMode, work: (tx: IDBTransaction) => Promise<T>): Promise<T> {
  const tx = db.transaction([...names], mode);
  const completion = new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error ?? new NamingBlocked("Naming transaction aborted; original custody retained.")); tx.onerror = () => { /* The abort event carries the terminal failure. */ }; });
  // An early abort is observed even when work's request also rejects.
  void completion.catch(() => undefined);
  let result: T;
  try { result = await work(tx); }
  catch (error) { try { tx.abort(); } catch { /* Already aborted. */ } await completion.catch(() => undefined); throw error; }
  await completion; return result;
}
function open(name: string, creating: boolean): Promise<IDBDatabase> {
  if (!identifier(name)) return Promise.reject(new NamingBlocked("Invalid owned database name."));
  return new Promise((resolve, reject) => {
    let terminal = false;
    const opening = indexedDB.open(`artroom.c4.naming.${name}`, 1);
    opening.onupgradeneeded = () => {
      if (terminal || !creating) { opening.transaction?.abort(); return; }
      for (const store of STORES) opening.result.createObjectStore(store);
    };
    opening.onsuccess = () => { const db = opening.result; if (terminal) { db.close(); return; } terminal = true; db.onversionchange = () => db.close(); resolve(db); };
    opening.onerror = () => { if (!terminal) { terminal = true; reject(opening.error ?? new NamingBlocked("Private naming storage unavailable; do not replace an original.")); } };
    opening.onblocked = () => { if (!terminal) { terminal = true; reject(new NamingBlocked("Naming database upgrade blocked; no journal replacement.")); } };
  });
}
function credentialMeta(row: Credential): { ref: string; key: Signer["key"]; generation: number; active: boolean } {
  return { ref: row.ref, key: row.key, generation: row.generation, active: row.active };
}
function validCredential(value: unknown): value is Credential {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (Object.keys(value).sort().join(",") !== "active,generation,key,privateKey,publicKey,ref") return false;
  const row = value as Partial<Credential>;
  return typeof row.ref === "string" && identifier(row.ref) && isKeyId(row.key) && Number.isSafeInteger(row.generation) && row.generation! >= 0 && typeof row.active === "boolean"
    && row.privateKey instanceof CryptoKey && row.privateKey.type === "private" && row.privateKey.extractable === false && row.privateKey.algorithm.name === "Ed25519" && row.privateKey.usages.length === 1 && row.privateKey.usages[0] === "sign"
    && row.publicKey instanceof CryptoKey && row.publicKey.type === "public" && row.publicKey.algorithm.name === "Ed25519" && row.publicKey.usages.length === 1 && row.publicKey.usages[0] === "verify";
}

export class IndexedNamingStore implements NamingStore {
  #db: IDBDatabase;
  #reference: NamingDatabaseReference;
  #limits: NamingLimits;
  private constructor(db: IDBDatabase, reference: NamingDatabaseReference, limits: NamingLimits) { this.#db = db; this.#reference = namingCopy(reference); this.#limits = namingCopy(limits); }
  get reference(): NamingDatabaseReference { return namingCopy(this.#reference); }
  close(): void { this.#db.close(); }
  /** Deliberate first-domain creation only; never invoked by reload recovery.
   * It does not establish native enrollment or authorize a context. */
  static async create(name: string, limits: NamingLimits): Promise<IndexedNamingStore> {
    const bounded = namingCopy(limits); validLimits(bounded);
    const origin = location.origin; if (!namingOrigin(origin)) return refused("The key-owning origin is unsupported.");
    const db = await open(name, true), reference = { name, origin, epoch: crypto.randomUUID() };
    try {
      await transaction(db, ["meta"], "readwrite", async tx => {
        const meta = tx.objectStore("meta"); if (await request(meta.get("domain")) !== undefined) return refused("Existing private naming domain must be opened with its original reference.");
        const value: Meta = { v: 1, origin, epoch: reference.epoch }; await request(meta.add(value, "domain"));
        if (canonicalize(await request(meta.get("domain"))) !== canonicalize(value)) return refused("Naming domain readback failed.");
      });
      return new IndexedNamingStore(db, reference, bounded);
    } catch (error) { db.close(); throw error; }
  }
  /** Missing DB/meta, epoch drift or storage clearing is unavailable, NOT empty.
   * No automatic domain recreation, key replacement or native resend. */
  static async restore(reference: NamingDatabaseReference, limits: NamingLimits): Promise<IndexedNamingStore> {
    const frozen = namingCopy(reference), bounded = namingCopy(limits); validLimits(bounded);
    if (Object.keys(frozen).sort().join(",") !== "epoch,name,origin" || frozen.origin !== location.origin || !identifier(frozen.epoch) || !namingOrigin(frozen.origin)) return refused("The retained credential domain names another origin.");
    const db = await open(frozen.name, false), store = new IndexedNamingStore(db, frozen, bounded);
    try { await transaction(db, ["meta"], "readonly", tx => store.#meta(tx)); return store; } catch (error) { db.close(); throw error; }
  }
  async #meta(tx: IDBTransaction): Promise<void> {
    const meta: unknown = await request(tx.objectStore("meta").get("domain"));
    if (canonicalize(meta ?? null) !== canonicalize({ v: 1, origin: this.#reference.origin, epoch: this.#reference.epoch })) return refused("Private storage was cleared, changed or unavailable. Retain original external custody; re-enrollment is a separate owner task.");
  }
  async #binding(tx: IDBTransaction, context: NamingContext): Promise<Credential> {
    await this.#meta(tx);
    if (!isNamingContext(context) || context.origin !== this.#reference.origin || context.epoch !== this.#reference.epoch) return refused("Wrong original context or database epoch.");
    const local: unknown = await request(tx.objectStore("contexts").get(namingContextKey(context)));
    const credential: unknown = await request(tx.objectStore("credentials").get(context.credential));
    if (canonicalize(local ?? null) !== canonicalize(context) || !validCredential(credential) || !credential.active || credential.key !== context.key || credential.generation !== context.generation) return refused("The enrolled credential reference or generation changed; no new signature or POST.");
    return credential;
  }
  async #budget(tx: IDBTransaction): Promise<void> {
    const contexts: unknown[] = await request(tx.objectStore("contexts").getAll()), credentials: unknown[] = await request(tx.objectStore("credentials").getAll()), journals: unknown[] = await request(tx.objectStore("naming").getAll());
    if (contexts.length > this.#limits.contexts || credentials.length > this.#limits.credentials || !contexts.every(isNamingContext) || !credentials.every(validCredential) || !journals.every(isNamingJournal)) return refused("Private naming catalog is malformed or full; nothing is evicted.");
    for (const journal of journals) if (journal.records.length > this.#limits.records || journal.records.some(record => logicalBytes(record) > this.#limits.recordBytes)) return refused("Naming record quota exceeded; original retained.");
    // Logical serialized metadata budget; browser disk overhead is not measured.
    const bytes = logicalBytes({ v: 1, origin: this.#reference.origin, epoch: this.#reference.epoch }) + logicalBytes(contexts) + logicalBytes(credentials.map(credentialMeta)) + logicalBytes(journals);
    if (bytes > this.#limits.totalBytes) return refused("Naming logical byte quota exceeded; original retained.");
  }
  /** Generate once and persist a nonextractable Ed25519 pair. Public key/ref
   * metadata does NOT prove membership; retainContext requires enrolled capture. */
  async createCredential(ref: string): Promise<{ credential: string; key: Signer["key"]; generation: number }> {
    if (!identifier(ref)) return refused("Invalid credential reference.");
    const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, false, ["sign", "verify"]);
    if (!("privateKey" in pair) || !("publicKey" in pair) || !(pair.privateKey instanceof CryptoKey) || !(pair.publicKey instanceof CryptoKey)) return refused("Ed25519 credential pair unavailable.");
    const key = keyIdOf(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
    const row: Credential = { ref, key, generation: 0, active: true, privateKey: pair.privateKey, publicKey: pair.publicKey };
    await transaction(this.#db, STORES, "readwrite", async tx => {
      await this.#meta(tx); const credentials = tx.objectStore("credentials");
      if (await request(credentials.get(ref)) !== undefined) return refused("Credential reference already exists; no replacement.");
      await request(credentials.add(row, ref)); await this.#budget(tx);
      const held: unknown = await request(credentials.get(ref)); if (!validCredential(held) || canonicalize(credentialMeta(held)) !== canonicalize(credentialMeta(row))) return refused("Nonextractable credential readback failed.");
    });
    return { credential: ref, key, generation: 0 };
  }
  /** Owner supplies a legitimately enrolled full context. This local catalog is
   * never native authority: NamingNative.capture rechecks enrollment under locks.
   * Context/credential changes cannot hide unresolved originals in this slot. */
  async retainContext(captured: NamingContext): Promise<void> {
    const context = namingCopy(captured);
    if (!isNamingContext(context) || context.origin !== this.#reference.origin || context.epoch !== this.#reference.epoch) return refused("Wrong enrolled context.");
    await transaction(this.#db, STORES, "readwrite", async tx => {
      await this.#meta(tx);
      const credential: unknown = await request(tx.objectStore("credentials").get(context.credential));
      if (!validCredential(credential) || !credential.active || credential.key !== context.key || credential.generation !== context.generation) return refused("Credential reference unavailable.");
      const key = namingContextKey(context), names = tx.objectStore("naming"), old: unknown = await request(names.get(key));
      const previousContext: unknown = await request(tx.objectStore("contexts").get(key));
      if (old === undefined && previousContext !== undefined) return refused("The existing context lost its naming journal; do not recreate empty custody.");
      if (old !== undefined && (!isNamingJournal(old) || old.records.some(record => !namingResolved(record)))) return refused("Unresolved original blocks context replacement.");
      await request(tx.objectStore("contexts").put(namingCopy(context), key));
      if (old === undefined) { const empty: NamingJournal = { v: 1, epoch: this.#reference.epoch, revision: 0, context: key, records: [] }; await request(names.add(empty, key)); }
      await this.#budget(tx); await this.#binding(tx, context);
    });
  }
  /** Local generation invalidation can interrupt an outstanding await. It keeps
   * all crypto/journal custody and claims no instantaneous native revocation. */
  async invalidateCredential(ref: string): Promise<void> {
    await transaction(this.#db, ["meta", "credentials"], "readwrite", async tx => {
      await this.#meta(tx); const store = tx.objectStore("credentials"), value: unknown = await request(store.get(ref));
      if (!validCredential(value) || !Number.isSafeInteger(value.generation + 1)) return refused("Credential unavailable.");
      await request(store.put({ ...value, active: false, generation: value.generation + 1 }, ref));
    });
  }
  async current(captured: NamingContext): Promise<void> { const context = namingCopy(captured); await transaction(this.#db, ["meta", "credentials", "contexts"], "readonly", async tx => { await this.#binding(tx, context); }); }
  async credential(captured: NamingContext): Promise<Signer> {
    const context = namingCopy(captured);
    const row = await transaction(this.#db, ["meta", "credentials", "contexts"], "readonly", tx => this.#binding(tx, context));
    // Prove the structured-cloned private pair matches the retained public key.
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", row.publicKey));
    if (keyIdOf(raw) !== context.key) return refused("Retained public key changed.");
    const challenge = new Uint8Array(utf8(`artroom-c4-naming-credential-check\n${context.credential}`)).buffer;
    const signature = await crypto.subtle.sign({ name: "Ed25519" }, row.privateKey, challenge);
    if (!await crypto.subtle.verify({ name: "Ed25519" }, row.publicKey, signature, challenge)) return refused("Retained private key does not match.");
    await this.current(context);
    return { key: context.key, sign: async bytes => { await this.current(context); return b64url(new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, row.privateKey, new Uint8Array(bytes).buffer))); } };
  }
  async read(captured: NamingContext): Promise<NamingJournal> {
    const context = namingCopy(captured);
    // Read-only original recovery does not require a still usable signer.
    return transaction(this.#db, ["meta", "naming"], "readonly", async tx => {
      await this.#meta(tx);
      if (!isNamingContext(context) || context.epoch !== this.#reference.epoch || context.origin !== this.#reference.origin) return refused("Wrong original domain.");
      const value: unknown = await request(tx.objectStore("naming").get(namingContextKey(context)));
      if (!isNamingJournal(value) || value.epoch !== this.#reference.epoch || value.context !== namingContextKey(context) || value.records.length > this.#limits.records || value.records.some(record => logicalBytes(record) > this.#limits.recordBytes)) return refused("Missing, malformed or over-bound original naming journal; no empty fallback.");
      return namingCopy(value);
    });
  }
  async commit(captured: NamingContext, previous: NamingJournal, proposed: NamingJournal): Promise<void> {
    const context = namingCopy(captured), before = namingCopy(previous), next = namingCopy(proposed);
    if (!isNamingContext(context) || context.origin !== this.#reference.origin || context.epoch !== this.#reference.epoch || !namingTransition(before, next)) return refused("Illegal original naming custody transition.");
    await transaction(this.#db, STORES, "readwrite", async tx => {
      await this.#meta(tx); const key = namingContextKey(context), names = tx.objectStore("naming");
      const actual: unknown = await request(names.get(key));
      if (!isNamingJournal(actual) || actual.epoch !== this.#reference.epoch || actual.context !== key || !sameJournal(actual, before)) return refused("Naming CAS conflict; old journal retained.");
      // New preparation/dispatch needs the current enrolled credential generation.
      // Exact original answer/receipt/entry settlement remains possible after it
      // changes, and cannot append or turn an attempted request back into unsent.
      const oldLast = before.records.at(-1), newLast = next.records.at(-1);
      if (next.records.length > before.records.length || oldLast?.phase === "prepared" && newLast?.phase === "attempted") await this.#binding(tx, context);
      await request(names.put(namingCopy(next), key)); await this.#budget(tx);
      const readback: unknown = await request(names.get(key)); if (!isNamingJournal(readback) || !sameJournal(readback, next)) return refused("Naming CAS readback failed; transaction aborted.");
    });
  }
}
const sameJournal = (a: NamingJournal, b: NamingJournal): boolean => canonicalize(a) === canonicalize(b);
