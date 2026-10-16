/** Real same-origin browser custody witness. Two pages share IDB and Web Locks,
 * deliberately without BroadcastChannel. Public TEST binding/key; protocol
 * dispatch and speech callbacks are stand-ins, never native/provider/audio proof. */
import { keyIdOfSecret, newIncarnation, scopeIdOf, textDigest } from "@generalbusiness/artroom-bytes";
import { signedIntent } from "@generalbusiness/artroom-client";
import type { ScopeRef } from "@generalbusiness/dap-contract";
import { COUNTING_COMMITMENTS_DEFINITION } from "../commitments-pin.ts";
import { deviceSigner, importLegacyDevice, type SavedDevice } from "./device-key.ts";
import { browserLock, privateDeviceStore, privateCommandStore, privatePendingStore } from "./storage.ts";
import { nativeGateway } from "./client.ts";
const custody=privateDeviceStore();
let channel:BroadcastChannel|undefined,notifications=0;
let held:{epoch:string;device:SavedDevice}|undefined;
let signs=0,dispatches=0,plays=0;
const ref=(kind:ScopeRef["kind"]):ScopeRef=>({scope:scopeIdOf({v:1,kind,definition:COUNTING_COMMITMENTS_DEFINITION,creator:null,cause:textDigest("TEST durable Forget "+kind),ordinal:0}),kind,inc:newIncarnation(new Uint8Array(16).fill(9))});
const membership=ref("membership"),scope=ref("lane");
const seed=new Uint8Array(32).fill(41);
const binding={origin:location.origin,deployment:"TEST durable Forget",scope,membership,member:{membership,member:"@ada"},publicKey:keyIdOfSecret(seed),definition:COUNTING_COMMITMENTS_DEFINITION,cohort:{directory:"platform:directory@6",membership:"platform:membership@5",rules:"platform:rules@3",destination:"platform:destination@2"}};
async function rejected(work:()=>Promise<unknown>){try{await work();return false;}catch{return true;}}
async function raw<T>(mode:IDBTransactionMode,work:(devices:IDBObjectStore,pending:IDBObjectStore,done:(value:T)=>void)=>void):Promise<T>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open("artroom-counting-private-1",2);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error("TEST database unavailable"));});
  try{return await new Promise<T>((resolve,reject)=>{const tx=db.transaction(["devices","pending"],mode);let result:T;tx.oncomplete=()=>resolve(result!);tx.onabort=tx.onerror=()=>reject(Error("TEST transaction failed"));work(tx.objectStore("devices"),tx.objectStore("pending"),value=>{result=value;});});}finally{db.close();}
}
export const durableForgetWitness={
  notificationMode(mode:"absent"|"delayed"){channel?.close();channel=undefined;notifications=0;if(mode==="delayed"){channel=new BroadcastChannel("TEST durable Forget delayed");channel.onmessage=()=>{notifications++;};}},
  notifications(){return notifications;},
  releaseNotification(){if(notifications)held=undefined;},
  async seedOriginal(){return raw<void>("readwrite",(_devices,pending,done)=>{pending.put({TEST:"opaque original command and audio retained"},"TEST original");done(undefined);});},
  async original(){return raw<unknown>("readonly",(_devices,pending,done)=>{const read=pending.get("TEST original");read.onsuccess=()=>done(read.result);});},
  async legacyFixture(){if(!held)throw Error("TEST mount absent");const device=held.device;await raw<void>("readwrite",(devices,_pending,done)=>{devices.delete("epoch");devices.put({v:1,devices:[device]},"current");done(undefined);});},
  async rawCounts(){return raw<{credentials:number;tombstones:number}>("readonly",(devices,_pending,done)=>{const row=devices.get("current");row.onsuccess=()=>{const epoch=devices.get("epoch");epoch.onsuccess=()=>done({credentials:row.result===undefined?0:1,tombstones:epoch.result===undefined?0:1});};});},
  async importDevice(){const lease=await custody.load();const device=await importLegacyDevice(new TextEncoder().encode(JSON.stringify(binding)),new Uint8Array(seed),location.origin);await custody.save([device],undefined,()=>true,lease.epoch);held={epoch:lease.epoch,device};return {epoch:lease.epoch};},
  async mount(){const saved=await custody.load();if(!saved.devices[0])throw Error("TEST device absent");held={epoch:saved.epoch,device:saved.devices[0]};return {epoch:saved.epoch};},
  async forget(){await custody.forget();channel?.postMessage({forgotten:true});return {forgotten:true};},
  async staleSave(){if(!held)throw Error("TEST mount absent");const lease=held;return {rejected:await rejected(()=>custody.save([lease.device],{publicKey:lease.device.binding.publicKey,voiceId:"TEST voice"},()=>true,lease.epoch))};},
  async freshActivity(){if(!held)throw Error("TEST mount absent");const lease=held;const signer=await deviceSigner(lease.device);const lock=browserLock(lease.device.binding,lease.epoch);
    const denied=await rejected(()=>lock.run(async()=>{await signedIntent({...signer,sign:async bytes=>{signs++;return signer.sign(bytes);}},{to:scope,kind:"start",fields:{},expected:{}});dispatches++;plays++;}));
    return {rejected:denied,signs,dispatches,plays};
  },
  async sessionActivity(){if(!held)throw Error("TEST mount absent");const lease=held;const base=await deviceSigner(lease.device);let requests=0;
    const gateway=nativeGateway(lease.device.binding,{...base,sign:async bytes=>{signs++;return base.sign(bytes);}},{current:()=>true,lock:browserLock(lease.device.binding,lease.epoch),voiceStore:privatePendingStore(lease.device.binding),commandStore:privateCommandStore(lease.device.binding),fetch:async()=>{requests++;return Response.json({ok:false,reason:"unauthorized"});}});
    try{const failed=await new Promise<boolean>(resolve=>{gateway.observe(state=>{if(["error","unavailable","forbidden"].includes(state.status))resolve(true);});});return {rejected:failed,signs,requests};}finally{gateway.dispose();}
  },
  async state(){const saved=await custody.load();return {epoch:saved.epoch,devices:saved.devices.length,choice:saved.choice??null};},
  async missingCoordination(){if(!held)throw Error("TEST mount absent");const descriptor=Object.getOwnPropertyDescriptor(navigator,"locks");Object.defineProperty(navigator,"locks",{configurable:true,value:undefined});try{return {saveRejected:await rejected(()=>custody.save([held!.device],undefined,()=>true,held!.epoch)),activityRejected:await rejected(()=>browserLock(held!.device.binding,held!.epoch).run(async()=>{dispatches++;})),forgetRejected:await rejected(()=>custody.forget())};}finally{if(descriptor)Object.defineProperty(navigator,"locks",descriptor);else Reflect.deleteProperty(navigator,"locks");}},
};
