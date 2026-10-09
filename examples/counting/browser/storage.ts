/** Private, bounded browser custody. Tokens and signing keys are never stored here. */
import { canonicalize, digestBytes, utf8 } from "@generalbusiness/artroom-bytes";
import type { AttemptJournal } from "./journal.ts";
import type { ActorIdentity, CustodyLock, PendingReport, PendingStore, PreparedEnvelope } from "./voice-controller.ts";
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
    clear:()=>transact<void>("readwrite",(store,set)=>{store.delete(key);set(undefined);}),
  };
}

export function privatePendingStore(identity:ActorIdentity):PendingStore{return privateSlot<PendingReport>(identity,"voice");}
export function privateCommandStore(identity:ActorIdentity){return privateSlot<{kind:string;envelope:PreparedEnvelope;journal?:AttemptJournal}>(identity,"command");}
