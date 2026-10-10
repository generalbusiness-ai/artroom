/** Private, bounded browser custody. Tokens and signing keys are never stored here. */
import { canonicalize, digestBytes, utf8 } from "@generalbusiness/artroom-bytes";
import { terminalJournal, validAudioStart, validReport, type AttemptJournal } from "./journal.ts";
import type { ActorIdentity, AudioStart, CustodyLock, PendingReport, PendingStore, PreparedEnvelope } from "./voice-controller.ts";
const MOST=64*1024, IDENTITIES=32;
const keyOf=(identity:ActorIdentity)=>digestBytes(utf8(canonicalize(identity)));
export function browserLock(identity:ActorIdentity):CustodyLock {
  const key=`artroom-counting:${keyOf(identity)}`;
  return{run:async work=>{if(!navigator.locks)throw new Error("Private command locking is unavailable.");return navigator.locks.request(key,work);}};
}
function privateSlot<T>(identity:ActorIdentity,purpose:"voice"|"command") {
  const key=keyOf(identity)+":"+purpose;let database:Promise<IDBDatabase>|undefined;
  const open=()=>database??=new Promise<IDBDatabase>((resolve,reject)=>{if(!globalThis.indexedDB)return reject(new Error("Private pending storage is unavailable."));const request=indexedDB.open("artroom-counting-private-1",1);request.onupgradeneeded=()=>request.result.createObjectStore("pending");request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error("Private pending storage is unavailable."));});
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
