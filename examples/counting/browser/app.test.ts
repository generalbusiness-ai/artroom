// DOM surface, gateway, memory custody and speech are fake. No browser/native/audio execution.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DOMAINS } from "@generalbusiness/artroom-contract";
import { domainBytes, keyIdOfSecret, newIncarnation, scopeIdOf, sign, textDigest } from "@generalbusiness/artroom-bytes";
import type { Summary } from "@generalbusiness/artroom-contract";
import type { ObservationState } from "@generalbusiness/artroom-client";
import { COUNTING_COMMITMENTS_DEFINITION as COUNTING_DEFINITION } from "../commitments-pin.ts";
import { mountCountingStage } from "./app.ts";
import { stageView, type StagePresentation } from "./view.ts";
import { nativeGateway, type CommandStore, type StageGateway } from "./client.ts";
import type { CountingView } from "./model.ts";
import type { ActorIdentity, AudioStart, PendingReport, PreparedEnvelope } from "./voice-controller.ts";
class Element {
  children:Element[]=[];dataset:Record<string,string>={};hidden=false;disabled=false;className="";textContent="";value="";onclick?:()=>void;onchange?:()=>void;
  classes=new Set<string>();classList={toggle:(name:string,on:boolean)=>{if(on)this.classes.add(name);else this.classes.delete(name);}};
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
  let refreshes=0,settleRefresh:(()=>void)|undefined,releaseRefresh:(()=>void)|undefined;
  const observation={refresh(){refreshes++;releaseRefresh=settleRefresh;},cancel(){},done:Promise.resolve()};
  const refusal="guard-failed: running-state — the native service refused Pause";
  const gateway={observe(emit:typeof publish){publish=emit;return observation;},prepare:async()=>{prepares++;throw new Error("stale playback must not prepare");},submit:async()=>{posts++;return{status:"unknown" as const};},reconcile:async()=>({status:"unknown" as const}),command:async()=>({status:"unknown" as const}),checkCommand:async()=>null,
    resumeCommand:async()=>{assert.equal(cancelled,true,"old playback is fenced before the command gateway runs");resumes++;commandPending=false;end?.();return{status:"refused" as const,reason:refusal};},commandResumeReady:()=>commandPending,pendingCommand:()=>commandPending?"pause":null,restoreCommand:async()=>{},dispose(){}} as unknown as StageGateway;
  let playedVoice:string|undefined;
  const speech={voices:()=>[{id:"fake",name:"Fake"},{id:"alternate",name:"Alternate"}],play:(_text:string,voiceId:string,callbacks:{end():void;error():void})=>{plays++;playedVoice=voiceId;end=callbacks.end;return()=>{cancelled=true;callbacks.end();callbacks.error();};}};
  const root=new Element(),app=mountCountingStage(root as unknown as HTMLElement,{speech,connect(){},now:()=>100});
  try{
    await app.attach({identity,speech,gateway,store:{load:async()=>null,loadStart:async()=>audioStart,saveStart:async marker=>{audioStart=structuredClone(marker);},save:async()=>{throw new Error("no new report expected");},clear:async()=>{}},lock:{run:async work=>work()},current:()=>true});
    const summary={scope,status:"active",definition:COUNTING_DEFINITION,time:"2099-01-01T00:00:00Z",counts:[],items:[]} as Summary;
    const view:CountingView={summary,configuration:{id:0,revision:1,target:3,controller:member},board:{id:1,revision:1,state:"open",target:3,generation:0,serial:1,lastNumber:0,number:1,speaker:member,lastSpeaker:null,until:10_000,pledge:3,lastFulfilledAt:null},participants:[{id:2,revision:1,member,state:"active"}],pledge:{id:3,revision:1,state:"pledged" as const,member,participant:2,admittedAt:3,generation:0,serial:1,n:1,until:10000,basis:[{id:2,member}]},pendingPromise:{id:3,revision:1,state:"pledged" as const,member,participant:2,admittedAt:3,generation:0,serial:1,n:1,until:10000,basis:[{id:2,member}]}};
    // Production gateway restoration with bounded corrupt memory payloads;
    // observation, DOM and speech remain fake. Each original remains intact.
    const intent:PreparedEnvelope["signed"]["intent"]={v:1,to:scope,actor:identity.publicKey,kind:"pause",on:1,expected:{on:1},fields:{},idempotencyKey:"FAKE malformed command",notAfter:"2099-01-01T00:00:00Z"};
    const envelope:PreparedEnvelope={signed:{intent,sig:sign(secret,domainBytes(DOMAINS.intent,intent))},grants:[],beside:{}};
    for(const missing of [true,false]){
      const held:unknown=missing?{envelope}:{kind:"",envelope};const original=JSON.stringify(held);
      let writes=0,clears=0,voiceWrites=0,controls=0,emit:typeof publish,blockedAudioStart:AudioStart|null=null;
      const commandStore:CommandStore={load:async()=>held as Awaited<ReturnType<CommandStore["load"]>>,save:async()=>{writes++;},clear:async()=>{clears++;}};
      const restored=nativeGateway(identity,secret,{current:()=>true,lock:{run:async work=>work()},voiceStore:{load:async()=>null,save:async()=>{voiceWrites++;},clear:async()=>{clears++;}},commandStore,fetch:async()=>{posts++;throw new Error("No malformed command transport");},actFetch:async()=>{posts++;throw new Error("No malformed command POST");}});
      const mountedGateway={...gateway,observe(callback:typeof publish){emit=callback;return observation;},command:async(...args:Parameters<StageGateway["command"]>)=>{controls++;return restored.command(...args);},checkCommand:()=>restored.checkCommand(),resumeCommand:()=>restored.resumeCommand(),commandResumeReady:()=>restored.commandResumeReady(),pendingCommand:()=>restored.pendingCommand(),restoreCommand:()=>restored.restoreCommand(),dispose:()=>restored.dispose()};
      const blockedRoot=new Element(),blocked=mountCountingStage(blockedRoot as unknown as HTMLElement,{speech,connect(){},now:()=>100});
      try{
        await blocked.attach({identity,speech,gateway:mountedGateway,store:{load:async()=>null,loadStart:async()=>blockedAudioStart,saveStart:async marker=>{voiceWrites++;blockedAudioStart=structuredClone(marker);},save:async()=>{voiceWrites++;},clear:async()=>{clears++;}},lock:{run:async work=>work()},current:()=>true});
        const current={status:"current",snapshot:{value:summary}} as unknown as ObservationState<Summary>;
        emit!(current,view);elements(blockedRoot).find(e=>e.textContent==="Arm voice")!.onclick!();await new Promise<void>(resolve=>setImmediate(resolve));
        assert.equal(plays,0,"malformed command presence fences sound before any voice marker");
        assert.equal(elements(blockedRoot).find(e=>e.textContent==="Arm voice")!.disabled,true);assert.equal(elements(blockedRoot).find(e=>e.textContent==="Check command")!.hidden,false);
        assert.equal(elements(blockedRoot).find(e=>e.textContent==="Resume original command")!.hidden,true);
        elements(blockedRoot).find(e=>e.textContent==="Check command")!.onclick!();await new Promise<void>(resolve=>setImmediate(resolve));
        assert.equal((await restored.resumeCommand())?.status,"blocked");blocked.repaint();emit!(current,view);
        elements(blockedRoot).find(e=>e.textContent==="Arm voice")!.onclick!();elements(blockedRoot).find(e=>e.dataset["focusKey"]==="commit")!.onclick!();await new Promise<void>(resolve=>setImmediate(resolve));
        assert.equal(restored.pendingCommand(),"unknown");assert.equal(plays,0);assert.deepEqual([writes,clears,voiceWrites,controls,prepares,posts],[0,0,0,0,0,0]);assert.equal(JSON.stringify(held),original);
      }finally{blocked.dispose();}
    }
    // Truly empty command custody still reaches the existing playback/refusal
    // journey below; malformed originals were not cleared to obtain it.
    const current={status:"current",snapshot:{value:summary}} as unknown as ObservationState<Summary>;
    publish!(current,view);
    // A real selector change invalidates local voice freshness even though no
    // native head changed. Its requested observation stays deferred here.
    settleRefresh=()=>publish!(current,view);
    const staleArm=elements(root).find(e=>e.textContent==="Arm voice")!,select=elements(root).find(e=>e.dataset["focusKey"]==="voice")!;
    select.value="alternate";select.onchange!();
    assert.equal(elements(root).find(e=>e.textContent==="Arm voice")!.disabled,true,"selection waits for the requested native observation");
    staleArm.onclick!();await new Promise<void>(resolve=>setImmediate(resolve));
    assert.deepEqual([plays,prepares,posts],[0,0,0]);assert.equal(audioStart,null,"no speech marker is saved before a fresh native observation");
    assert.equal(refreshes,1);assert.equal(typeof releaseRefresh,"function");releaseRefresh!();
    assert.equal(elements(root).find(e=>e.textContent==="Arm voice")!.disabled,false);assert.equal(plays,0,"fresh observation does not automatically Arm");
    elements(root).find(e=>e.textContent==="Arm voice")!.onclick!();await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(plays,1);assert.equal(playedVoice,"alternate");assert.equal(cancelled,false);
    commandPending=true;app.repaint();const resume=elements(root).find(e=>e.textContent==="Resume original command")!;assert.equal(resume.hidden,false);resume.onclick!();
    await new Promise<void>(resolve=>setImmediate(resolve));
    assert.equal(resumes,1);assert.deepEqual([prepares,posts,plays],[0,0,1]);assert.equal(elements(root).some(e=>e.className==="notice"&&e.textContent===refusal&&e.classes.has("refused")),true);
  }finally{app.dispose();Object.assign(globalThis,{document:oldDocument,HTMLElement:oldHTMLElement,HTMLButtonElement:oldButton});}
});

// Fake DOM and already classified presentation inputs: no native receipt or audio proof.
test("Counter acknowledgement requires a recorded local effect and keeps playback, unknown and refusal messages",()=>{
  const oldDocument=globalThis.document,oldHTMLElement=globalThis.HTMLElement,oldButton=globalThis.HTMLButtonElement;
  Object.assign(globalThis,{document:{createElement:()=>new Element(),createElementNS:()=>new Element(),activeElement:null},HTMLElement:Element,HTMLButtonElement:Element});
  const root=new Element(),noop=()=>{},ui=stageView(root as unknown as HTMLElement,{control:noop,arm:noop,disarm:noop,check:noop,checkReport:noop,resumeCommand:noop,resumeReport:noop,correct:noop,connect:noop,disconnect:noop},{voices:()=>[],play:()=>noop});
  try{
    const base:StagePresentation={fresh:true,connection:"Connected"};
    const acknowledgement=()=>elements(root).find(e=>e.className==="acknowledgement")!.textContent;
    ui.render(base);assert.equal(acknowledgement(),"");
    ui.render({...base,voice:{phase:"recorded",message:"Verified report",armed:false}});assert.equal(acknowledgement(),"dap.");
    ui.render({...base,command:"dap.",commandOutcome:"recorded"});assert.equal(acknowledgement(),"dap.");
    ui.render({...base,command:"dap.",commandOutcome:"recorded",voice:{phase:"speaking",message:"Playing",armed:true}});assert.equal(acknowledgement(),"");assert.equal(elements(root).find(e=>e.className==="notice")!.textContent,"Playing on this device");
    ui.render({...base,command:"dap.",commandOutcome:"recorded",commandUnknown:true});assert.equal(acknowledgement(),"");
    ui.render({...base,fresh:false,command:"dap.",commandOutcome:"recorded",voice:{phase:"idle",message:"Awaiting the scope",armed:false}});assert.equal(acknowledgement(),"");assert.equal(elements(root).find(e=>e.className==="notice")!.hidden,false);assert.equal(elements(root).find(e=>e.className==="notice")!.textContent,"Awaiting the scope");
    ui.render({...base,command:"dap.",commandOutcome:"recorded",voice:{phase:"refused",message:"Refused",armed:false,pending:"refused"}});assert.equal(acknowledgement(),"");assert.equal(elements(root).find(e=>e.className==="notice")!.classes.has("refused"),true);
    ui.render({...base,voice:{phase:"unknown",message:"Check",armed:false,pending:"unknown"}});assert.equal(acknowledgement(),"");assert.equal(elements(root).find(e=>e.className==="notice")!.textContent,"Report unknown. Check the original request.");
    ui.render({...base,voice:{phase:"refused",message:"Refused",armed:false,pending:"refused"}});assert.equal(acknowledgement(),"");assert.equal(elements(root).find(e=>e.className==="notice")!.textContent,"Report needs a current successor proposal.");
    ui.render({...base,command:"Same message",commandOutcome:"refused"});assert.equal(acknowledgement(),"");assert.equal(elements(root).find(e=>e.className==="notice")!.classes.has("refused"),true);
    for(const commandOutcome of ["unknown","blocked"] as const){ui.render({...base,command:"Same message",commandOutcome});assert.equal(acknowledgement(),"");assert.equal(elements(root).find(e=>e.className==="notice")!.classes.has("refused"),false);}
    ui.render({...base,command:"The original command remains unresolved.",voice:{phase:"recorded",message:"Verified report",armed:false}});assert.equal(acknowledgement(),"");
  }finally{Object.assign(globalThis,{document:oldDocument,HTMLElement:oldHTMLElement,HTMLButtonElement:oldButton});}
});
