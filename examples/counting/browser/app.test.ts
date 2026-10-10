// DOM surface, gateway, memory custody and speech are fake. No browser/native/audio execution.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DOMAINS } from "@generalbusiness/artroom-contract";
import { domainBytes, keyIdOfSecret, newIncarnation, scopeIdOf, sign, textDigest } from "@generalbusiness/artroom-bytes";
import type { Summary } from "@generalbusiness/artroom-contract";
import type { ObservationState } from "@generalbusiness/artroom-client";
import { COUNTING_COMMITMENTS_DEFINITION as COUNTING_DEFINITION } from "../commitments-pin.ts";
import { mountCountingStage } from "./app.ts";
import type { StageGateway } from "./client.ts";
import type { CountingView } from "./model.ts";
import type { ActorIdentity, AudioStart, PendingReport, PreparedEnvelope } from "./voice-controller.ts";
class Element {
  children:Element[]=[];dataset:Record<string,string>={};hidden=false;disabled=false;className="";textContent="";value="";onclick?:()=>void;onchange?:()=>void;
  classList={toggle:()=>{}};
  setAttribute(){} append(...elements:Element[]){this.children.push(...elements);} replaceChildren(...elements:Element[]){this.children=elements;}
  contains(element:Element):boolean{return this===element||this.children.some(child=>child.contains(element));}
  querySelectorAll(selector:string):Element[]{return this.children.flatMap(child=>[...(selector==="[data-focus-key]"&&child.dataset["focusKey"]?[child]:[]),...child.querySelectorAll(selector)]);}
  querySelector(){return null;}focus(){}remove(){}
}
const elements=(root:Element):Element[]=>[root,...root.children.flatMap(elements)];
test("Roster removal leaves the identity-owned original Check report reachable without signing, POST or speech",async()=>{
  const oldDocument=globalThis.document,oldHTMLElement=globalThis.HTMLElement,oldButton=globalThis.HTMLButtonElement;
  Object.assign(globalThis,{document:{createElement:()=>new Element(),createElementNS:()=>new Element(),activeElement:null},HTMLElement:Element,HTMLButtonElement:Element});
  const secret=new Uint8Array(32).fill(71);
  const ref=(kind:ActorIdentity["scope"]["kind"])=>({scope:scopeIdOf({v:1,kind,definition:COUNTING_DEFINITION,creator:null,cause:textDigest(`FAKE mount ${kind}`),ordinal:0}),inc:newIncarnation(new Uint8Array(16).fill(7)),kind});
  const scope=ref("lane"),membership=ref("membership"),member={membership,member:"@ada" as const},identity:ActorIdentity={origin:"https://fake-mount.test",deployment:"FAKE",scope,membership,member,definition:COUNTING_DEFINITION,publicKey:keyIdOfSecret(secret)};
  const turn={...identity,generation:0,serial:1,N:1,expiresAt:10_000};
  const intent:PreparedEnvelope["signed"]["intent"]={v:1,to:scope,actor:identity.publicKey,kind:"fulfill",on:1,expected:{},fields:{generation:0,serial:1,n:1},idempotencyKey:"FAKE retained",notAfter:"2099-01-01T00:00:00Z"};
  const envelope:PreparedEnvelope={signed:{intent,sig:sign(secret,domainBytes(DOMAINS.intent,intent))},grants:[],beside:{}};
  let held:PendingReport|null={completion:{turn,voiceId:"fake",completedAt:100},envelope,outcome:"unknown",journal:{v:2,active:0,attempts:[{envelope,phase:"unknown"}]}};
  let publish:((state:ObservationState<Summary>,view?:CountingView)=>void)|undefined,checks=0,prepares=0,posts=0,plays=0;
  const observation={refresh(){},cancel(){},done:Promise.resolve()};
  const gateway={observe(emit:typeof publish){publish=emit;return observation;},prepare:async()=>{prepares++;return envelope;},submit:async()=>{posts++;return{status:"unknown" as const};},reconcile:async(original:PreparedEnvelope)=>{assert.deepEqual(original,envelope);checks++;return{status:"unknown" as const};},command:async()=>({status:"unknown" as const}),checkCommand:async()=>null,resumeCommand:async()=>null,commandResumeReady:()=>false,pendingCommand:()=>null,restoreCommand:async()=>{},dispose(){}} as unknown as StageGateway;
  const speech={voices:()=>[{id:"fake",name:"Fake"}],play:()=>{plays++;return()=>{};}};
  const root=new Element(),app=mountCountingStage(root as unknown as HTMLElement,{speech,connect(){},now:()=>100});
  try{
    await app.attach({identity,speech,gateway,store:{load:async()=>held,save:async p=>{held=p;},clear:async()=>{held=null;}},lock:{run:async work=>work()},current:()=>true});
    const summary={scope,status:"active",definition:COUNTING_DEFINITION,time:"2099-01-01T00:00:00Z",counts:[],items:[]} as Summary;
    const view:CountingView={summary,configuration:{id:0,revision:1,target:3,controller:member},board:{id:1,revision:1,state:"paused",target:3,generation:0,serial:2,lastNumber:0,number:null,speaker:null,lastSpeaker:null,until:null,pledge:null,lastFulfilledAt:null},participants:[{id:2,revision:1,member,state:"active"}],pledge:null,pendingPromise:null};
    const state={status:"current",snapshot:{value:summary}} as unknown as ObservationState<Summary>;
    publish!(state,view);const button=elements(root).find(e=>e.textContent==="Check report")!;assert.equal(button.hidden,false);
    publish!(state,{...view,participants:[]});assert.equal(elements(root).find(e=>e.textContent==="Check report"),button);assert.equal(button.hidden,false);assert.equal(button.disabled,false);
    button.onclick!();await new Promise<void>(resolve=>setImmediate(resolve));
    assert.equal(checks,1);assert.deepEqual([prepares,posts,plays],[0,0,0]);assert.deepEqual(held?.envelope,envelope);
  }finally{app.dispose();Object.assign(globalThis,{document:oldDocument,HTMLElement:oldHTMLElement,HTMLButtonElement:oldButton});}
});

// A controller mutation must fence callbacks before native dispatch, even before the next observation arrives.
test("Explicit Resume command fences active playback before dispatch and displays the trusted refusal",async()=>{
  const oldDocument=globalThis.document,oldHTMLElement=globalThis.HTMLElement,oldButton=globalThis.HTMLButtonElement;
  Object.assign(globalThis,{document:{createElement:()=>new Element(),createElementNS:()=>new Element(),activeElement:null},HTMLElement:Element,HTMLButtonElement:Element});
  const secret=new Uint8Array(32).fill(72);
  const ref=(kind:ActorIdentity["scope"]["kind"])=>({scope:scopeIdOf({v:1,kind,definition:COUNTING_DEFINITION,creator:null,cause:textDigest(`FAKE resume mount ${kind}`),ordinal:0}),inc:newIncarnation(new Uint8Array(16).fill(7)),kind});
  const scope=ref("lane"),membership=ref("membership"),member={membership,member:"@ada" as const},identity:ActorIdentity={origin:"https://fake-resume.test",deployment:"FAKE",scope,membership,member,definition:COUNTING_DEFINITION,publicKey:keyIdOfSecret(secret)};
  let audioStart:AudioStart|null=null;
  let publish:((state:ObservationState<Summary>,view?:CountingView)=>void)|undefined,commandPending=false,cancelled=false,resumes=0,prepares=0,posts=0,plays=0,end:(()=>void)|undefined;
  const observation={refresh(){},cancel(){},done:Promise.resolve()};
  const refusal="guard-failed: running-state — the native service refused Pause";
  const gateway={observe(emit:typeof publish){publish=emit;return observation;},prepare:async()=>{prepares++;throw new Error("stale playback must not prepare");},submit:async()=>{posts++;return{status:"unknown" as const};},reconcile:async()=>({status:"unknown" as const}),command:async()=>({status:"unknown" as const}),checkCommand:async()=>null,
    resumeCommand:async()=>{assert.equal(cancelled,true,"old playback is fenced before the command gateway runs");resumes++;commandPending=false;end?.();return{status:"refused" as const,reason:refusal};},commandResumeReady:()=>commandPending,pendingCommand:()=>commandPending?"pause":null,restoreCommand:async()=>{},dispose(){}} as unknown as StageGateway;
  const speech={voices:()=>[{id:"fake",name:"Fake"}],play:(_text:string,_voice:string,callbacks:{end():void;error():void})=>{plays++;end=callbacks.end;return()=>{cancelled=true;callbacks.end();callbacks.error();};}};
  const root=new Element(),app=mountCountingStage(root as unknown as HTMLElement,{speech,connect(){},now:()=>100});
  try{
    await app.attach({identity,speech,gateway,store:{load:async()=>null,loadStart:async()=>audioStart,saveStart:async marker=>{audioStart=structuredClone(marker);},save:async()=>{throw new Error("no new report expected");},clear:async()=>{}},lock:{run:async work=>work()},current:()=>true});
    const summary={scope,status:"active",definition:COUNTING_DEFINITION,time:"2099-01-01T00:00:00Z",counts:[],items:[]} as Summary;
    const view:CountingView={summary,configuration:{id:0,revision:1,target:3,controller:member},board:{id:1,revision:1,state:"open",target:3,generation:0,serial:1,lastNumber:0,number:1,speaker:member,lastSpeaker:null,until:10_000,pledge:3,lastFulfilledAt:null},participants:[{id:2,revision:1,member,state:"active"}],pledge:{id:3,revision:1,state:"pledged" as const,member,participant:2,admittedAt:3,generation:0,serial:1,n:1,until:10000,basis:[{id:2,member}]},pendingPromise:{id:3,revision:1,state:"pledged" as const,member,participant:2,admittedAt:3,generation:0,serial:1,n:1,until:10000,basis:[{id:2,member}]}};
    publish!({status:"current",snapshot:{value:summary}} as unknown as ObservationState<Summary>,view);
    elements(root).find(e=>e.textContent==="Arm voice")!.onclick!();await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(plays,1);assert.equal(cancelled,false);
    commandPending=true;app.repaint();const resume=elements(root).find(e=>e.textContent==="Resume original command")!;assert.equal(resume.hidden,false);resume.onclick!();
    await new Promise<void>(resolve=>setImmediate(resolve));
    assert.equal(resumes,1);assert.deepEqual([prepares,posts,plays],[0,0,1]);assert.equal(elements(root).some(e=>e.className==="notice"&&e.textContent===refusal),true);
  }finally{app.dispose();Object.assign(globalThis,{document:oldDocument,HTMLElement:oldHTMLElement,HTMLButtonElement:oldButton});}
});
