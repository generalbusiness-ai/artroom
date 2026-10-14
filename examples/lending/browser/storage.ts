/**
 * This origin's private storage for the lending interface: the device key, the
 * seat it joined, and the one kept request of each kind. IndexedDB holds the
 * key pair as WebCrypto made it; its private half cannot be read out, here or
 * anywhere. A Web Lock keeps other tabs out of a slot while one tab uses it.
 * No session token is stored.
 */
import type { CustodyLock, Kept, KeptStore, LendingIdentity } from "./custody.ts";
import type { DeviceKey, JoinStore, KeptJoin, Seat } from "./join.ts";

const DATABASE = "dap-lending-private-1", STORE = "slots", LOCK = "dap-lending-custody";
/** What this browser remembers of its place in a room. `identity` is set once the lending scope is found. */
export interface Remembered { v: 1; device: DeviceKey; seat?: Seat; identity?: LendingIdentity }

let opened: Promise<IDBDatabase> | undefined;
function database(): Promise<IDBDatabase> {
  return opened ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error("This browser has no private storage.")); return; }
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = request.onblocked = () => { opened = undefined; reject(new Error("Private storage could not be opened.")); };
  });
}
/** One transaction on one key. It resolves only when the transaction has committed. */
async function slot<T>(mode: IDBTransactionMode, key: string, work: (store: IDBObjectStore, done: (value: T) => void) => void): Promise<T> {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    let value: T | undefined;
    transaction.oncomplete = () => resolve(value as T);
    transaction.onerror = transaction.onabort = () => reject(new Error(`Private storage did not commit (${key}).`));
    work(transaction.objectStore(STORE), (result) => { value = result; });
  });
}
const get = <T>(key: string): Promise<T | null> => slot<T | null>("readonly", key, (store, done) => { const read = store.get(key); read.onsuccess = () => done((read.result as T | undefined) ?? null); });
const put = (key: string, value: unknown): Promise<void> => slot<void>("readwrite", key, (store, done) => { store.put(value, key); done(undefined); });
const remove = (key: string): Promise<void> => slot<void>("readwrite", key, (store, done) => { store.delete(key); done(undefined); });

/** Every use of a kept request, in every tab of this origin, takes this lock. */
export const browserLock: CustodyLock = {
  run: (work) => {
    if (!globalThis.navigator?.locks) return Promise.reject(new Error("This browser cannot keep a request safely: it has no Web Locks."));
    return navigator.locks.request(LOCK, work) as Promise<Awaited<ReturnType<typeof work>>>;
  },
};

export const remembered = {
  load: () => get<Remembered>("remembered"),
  save: (value: Remembered) => put("remembered", value),
  /** Forget the device key and the seat. Kept requests are left as they are. */
  forget: () => remove("remembered"),
};
export const joinStore: JoinStore = { load: () => get<KeptJoin>("join"), save: (value) => put("join", value), clear: () => remove("join") };
/** The kept lending request of one device key in one lending scope. */
export const actStore = (identity: LendingIdentity): KeptStore => {
  const key = `act:${identity.scope.scope}:${identity.publicKey}`;
  return { load: () => get<Kept>(key), save: (value) => put(key, value), clear: () => remove(key) };
};
