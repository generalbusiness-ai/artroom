/** Origin-private pending custody and non-extractable demo device keys. Session tokens remain volatile. */
import { canonicalize, digestBytes, utf8 } from "@generalbusiness/artroom-bytes";
import { terminalJournal, validAudioStart, validReport, type AttemptJournal } from "./journal.ts";
import { deviceSigner, type SavedDevice } from "./device-key.ts";
import type { ActorIdentity, AudioStart, CustodyLock, PendingReport, PendingStore, PreparedEnvelope } from "./voice-controller.ts";
const MOST=64*1024, IDENTITIES=32;
const keyOf=(identity:ActorIdentity)=>digestBytes(utf8(canonicalize(identity)));
export function browserLock(identity:ActorIdentity):CustodyLock {
  const key=`artroom-counting:${keyOf(identity)}`;
  return{run:async work=>{if(!navigator.locks)throw new Error("Private command locking is unavailable.");return navigator.locks.request(key,work);}};
}
let database: Promise<IDBDatabase> | undefined;
function privateDatabase(): Promise<IDBDatabase> {
  if(database)return database;
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error("Private browser custody is unavailable.")); return; }
    const request = indexedDB.open("artroom-counting-private-1", 2);
    let blocked = false;
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("pending")) request.result.createObjectStore("pending");
      if (!request.result.objectStoreNames.contains("devices")) request.result.createObjectStore("devices");
    };
    request.onblocked = () => { blocked = true; reject(new Error("Close other Counter tabs before connecting this device.")); };
    request.onerror = () => reject(new Error("Private browser custody is unavailable."));
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) { db.close(); return; }
      db.onversionchange = () => { db.close(); if(database===opening)database=undefined; };
      db.onclose = () => { if(database===opening)database=undefined; };
      resolve(db);
    };
  });
  database=opening;
  void opening.catch(()=>{if(database===opening)database=undefined;});
  return opening;
}
function privateSlot<T>(identity:ActorIdentity,purpose:"voice"|"command") {
  const key=keyOf(identity)+":"+purpose;
  const open=privateDatabase;
  const transact=async<T>(mode:IDBTransactionMode,work:(store:IDBObjectStore,set:(value:T)=>void,reject:(error:Error)=>void)=>void):Promise<T>=>{
    const db=await open();return new Promise<T>((resolve,reject)=>{const transaction=db.transaction("pending",mode);let value:T;transaction.oncomplete=()=>resolve(value!);transaction.onerror=transaction.onabort=()=>reject(new Error("Private pending storage did not commit."));work(transaction.objectStore("pending"),v=>{value=v;},error=>{transaction.abort();reject(error);});});
  };
  return{
    load:()=>transact<T|null>("readonly",(store,set,reject)=>{const request=store.get(key);request.onsuccess=()=>{const record=request.result as {identity?:ActorIdentity;pending?:T}|undefined;if(!record)return set(null);try{if(canonicalize(record.identity)!==canonicalize(identity)||!record.pending||utf8(canonicalize(record)).length>MOST)return reject(new Error("The private pending identity is unavailable."));set(record.pending);}catch{reject(new Error("The private pending identity is unavailable."));}};}),
    save:async (pending:T)=>{const record={identity,pending};if(utf8(canonicalize(record)).length>MOST)throw new Error("The private pending record exceeds its bound.");await transact<void>("readwrite",(store,set,reject)=>{const count=store.count();count.onsuccess=()=>{const current=store.getKey(key);current.onsuccess=()=>{if(current.result===undefined&&count.result>=IDENTITIES){reject(new Error("Private pending identity capacity is full."));return;}store.put(record,key);set(undefined);};};});},
    archive:async(pending:T,receiptConfirmed=false,audioOnly=false)=>{
      const candidate=pending as {envelope?:PreparedEnvelope;journal?:AttemptJournal};
      if(audioOnly){const record=pending as {audioStart?:unknown};if(Object.keys(record).length!==1||!validAudioStart(record.audioStart,identity))throw new Error("The audio-start history is malformed.");}
      else if(!candidate.envelope||!terminalJournal(candidate.journal,identity,candidate.envelope,receiptConfirmed))throw new Error("Only a fully resolved history can be archived.");
      // Same object store and transaction: commit an intact record before removing its active pointer.
      await transact<void>("readwrite",(store,set,reject)=>{
        const read=store.get(key);read.onsuccess=()=>{
          try {
          const record=read.result as {identity?:ActorIdentity;pending?:T}|undefined;
          if(!record||utf8(canonicalize(record)).length>MOST||canonicalize(record.identity)!==canonicalize(identity)||canonicalize(record.pending)!==canonicalize(pending)){reject(new Error("The exact terminal record changed before archive."));return;}
          const archiveKey=keyOf(identity)+":archive:"+digestBytes(utf8(canonicalize({purpose,pending})));
          const old=store.get(archiveKey);old.onsuccess=()=>{
            try {
            if(old.result!==undefined){if(canonicalize(old.result)!==canonicalize(record)){reject(new Error("The private archive does not match."));return;}store.delete(key);set(undefined);return;}
            const count=store.count();count.onsuccess=()=>{if(count.result>IDENTITIES){reject(new Error("Private terminal archive capacity is full."));return;}store.delete(key);store.put(record,archiveKey);set(undefined);};
            } catch { reject(new Error("The private archive does not match.")); }
          };
          } catch { reject(new Error("The exact terminal archive is unavailable.")); }
        };
      });
    },
    clear:()=>transact<void>("readwrite",(store,set)=>{store.delete(key);set(undefined);}),
  };
}

export function privatePendingStore(identity:ActorIdentity):PendingStore {
  const slot=privateSlot<PendingReport|{audioStart:AudioStart}>(identity,"voice");
  const marker=(value:PendingReport|{audioStart:AudioStart}|null):AudioStart|null=>{
    if(value&&Object.keys(value).length===1&&"audioStart" in value){if(!validAudioStart(value.audioStart,identity))throw new Error("The original audio start is malformed.");return value.audioStart;}
    if(value&&!validReport(value,identity))throw new Error("The original voice record is malformed.");return null;
  };
  return {
    load:async()=>{const value=await slot.load();return marker(value)?null:value as PendingReport|null;},
    loadStart:async()=>marker(await slot.load()),
    saveStart:async audioStart=>{if(!validAudioStart(audioStart,identity)||await slot.load())throw new Error("A voice record already exists or the start is invalid.");await slot.save({audioStart});},
    save:async pending=>{if(!validReport(pending,identity))throw new Error("The exact completed voice report is invalid.");const value=await slot.load(),held=marker(value);
      if(held&&(!pending.audioStart||canonicalize(pending.audioStart)!==canonicalize(held)))throw new Error("The original audio start must remain with its completion.");
      if(value&&!held&&(!validReport(value,identity)||canonicalize(value.completion)!==canonicalize(pending.completion)))throw new Error("The prior voice completion must remain intact.");await slot.save(pending);},
    clear:slot.clear,
    archive:(pending,confirmed)=>slot.archive(pending,confirmed),
    // Native obsolescence is checked by the current gateway/controller; this store owns only atomic custody.
    archiveStart:async audioStart=>{const value=await slot.load();if(!value||!marker(value)||canonicalize(marker(value))!==canonicalize(audioStart))throw new Error("The original audio start changed.");await slot.archive(value,false,true);},
  };
}
export function privateCommandStore(identity:ActorIdentity){return privateSlot<{kind:string;envelope:PreparedEnvelope;journal?:AttemptJournal}>(identity,"command");}

export interface DeviceChoice { publicKey: string; voiceId: string }
export interface SavedDevices { devices: SavedDevice[]; choice?: DeviceChoice }
let deviceGeneration = 0;
const deviceWrites = new Set<IDBTransaction>();
const custodyError = () => new Error("The remembered device custody is unavailable or no longer current.");
async function checkedDevices(devices: SavedDevice[]): Promise<void> {
  if (!Array.isArray(devices) || ![1, 3].includes(devices.length)) throw custodyError();
  if (new Set(devices.map(d => d.binding.publicKey)).size !== devices.length || new Set(devices.map(d => d.name)).size !== devices.length) throw custodyError();
  if (utf8(canonicalize(devices.map(d => ({ name: d.name, binding: d.binding })))).length > MOST) throw custodyError();
  for (const device of devices) await deviceSigner(device);
}
function checkedChoice(choice: DeviceChoice | undefined, devices: SavedDevice[]): void {
  if (choice === undefined) return;
  if (!choice || Object.keys(choice).length !== 2 || !Object.hasOwn(choice, "publicKey") || !Object.hasOwn(choice, "voiceId") || !devices.some(d => d.binding.publicKey === choice.publicKey) || typeof choice.voiceId !== "string" || !choice.voiceId || choice.voiceId.length > 512) throw custodyError();
}
export function privateDeviceStore() {
  const transact = async <T>(mode: IDBTransactionMode, generation: number, current: () => boolean, work: (store: IDBObjectStore, done: (value: T) => void, check: () => void) => void): Promise<T> => {
    const db = await privateDatabase();
    if (generation !== deviceGeneration || !current()) throw custodyError();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("devices", mode);
      if (mode === "readwrite") deviceWrites.add(tx);
      let value: T;
      const cleanup = () => deviceWrites.delete(tx);
      const check = () => {
        if (generation !== deviceGeneration || !current()) { tx.abort(); throw custodyError(); }
      };
      tx.oncomplete = () => { cleanup(); if (generation !== deviceGeneration || !current()) reject(custodyError()); else resolve(value!); };
      tx.onabort = tx.onerror = () => { cleanup(); reject(custodyError()); };
      try { check(); work(tx.objectStore("devices"), next => { value = next; }, check); }
      catch { try { tx.abort(); } catch { /* Already aborted. */ } reject(custodyError()); }
    });
  };
  return {
    async load(current: () => boolean = () => true): Promise<SavedDevices> {
      const generation = deviceGeneration;
      const record = await transact<unknown>("readonly", generation, current, (store, done) => {
        const read = store.get("current"); read.onsuccess = () => done(read.result);
      });
      if (generation !== deviceGeneration || !current()) throw custodyError();
      if (record === undefined) return { devices: [] };
      if (!record || typeof record !== "object" || Array.isArray(record) || Object.keys(record).some(k => !["v", "devices", "choice"].includes(k))) throw custodyError();
      const saved = record as { v?: unknown; devices?: unknown; choice?: DeviceChoice };
      if (saved.v !== 1 || !Array.isArray(saved.devices)) throw custodyError();
      const devices = saved.devices as SavedDevice[];
      await checkedDevices(devices);
      if (generation !== deviceGeneration || !current()) throw custodyError();
      checkedChoice(saved.choice, devices);
      return { devices, ...(saved.choice ? { choice: saved.choice } : {}) };
    },
    async save(devices: SavedDevice[], choice?: DeviceChoice, current: () => boolean = () => true): Promise<void> {
      const generation = deviceGeneration;
      // Freeze caller-owned metadata before asynchronous key validation.
      const snapshot: SavedDevice[] = devices.map(d => ({ name: d.name, binding: structuredClone(d.binding), key: d.key }));
      const selected = choice ? structuredClone(choice) : undefined;
      await checkedDevices(snapshot); checkedChoice(selected, snapshot);
      if (generation !== deviceGeneration || !current()) throw custodyError();
      await transact<void>("readwrite", generation, current, (store, done, check) => {
        const write = store.put({ v: 1, devices: snapshot, ...(selected ? { choice: selected } : {}) }, "current");
        write.onsuccess = () => { try { check(); done(undefined); } catch { /* Transaction aborted by check. */ } };
      });
    },
    async forget(): Promise<void> {
      // Fence validation already underway and abort only device writes.
      // Pending requests and audio custody never participate in this deletion.
      const generation = ++deviceGeneration;
      for (const tx of deviceWrites) { try { tx.abort(); } catch { /* Already terminal. */ } }
      await transact<void>("readwrite", generation, () => true, (store, done) => { store.delete("current"); done(undefined); });
    },
  };
}
