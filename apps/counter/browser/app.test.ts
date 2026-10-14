// DOM surface, gateway, memory custody and speech are fake. No browser/native/audio execution.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DOMAINS } from "@generalbusiness/dap-contract";
import { domainBytes, keyIdOfSecret, newIncarnation, scopeIdOf, sign, textDigest } from "@generalbusiness/artroom-bytes";
import type { Summary } from "@generalbusiness/dap-contract";
import { secretSigner, type ObservationState } from "@generalbusiness/artroom-client";
import { COUNTING_COMMITMENTS_DEFINITION as COUNTING_DEFINITION } from "../commitments-pin.ts";
import { mountCountingStage } from "./app.ts";
import { browserSpeech } from "./speech.ts";
import { stageView, type StagePresentation } from "./view.ts";
import { nativeGateway, type CommandStore, type StageGateway } from "./client.ts";
import type { CountingView } from "./model.ts";
import type { ActorIdentity, AudioStart, PendingReport, PreparedEnvelope } from "./voice-controller.ts";
class Element {
  constructor(readonly tag="div") {}
  href="";attrs:Record<string,string>={};
  children:Element[]=[];dataset:Record<string,string>={};hidden=false;disabled=false;className="";textContent="";value="";onclick?:()=>void;onchange?:()=>void;
  classes=new Set<string>();classList={toggle:(name:string,on:boolean)=>{if(on)this.classes.add(name);else this.classes.delete(name);}};
  setAttribute(name:string,value:string){this.attrs[name]=value;} append(...elements:Element[]){this.children.push(...elements);} replaceChildren(...elements:Element[]){this.children=elements;}
  contains(element:Element):boolean{return this===element||this.children.some(child=>child.contains(element));}
  querySelectorAll(selector:string):Element[]{return this.children.flatMap(child=>[...(selector==="[data-focus-key]"&&child.dataset["focusKey"]?[child]:[]),...child.querySelectorAll(selector)]);}
  querySelector(){return null;}focus(){}remove(){}
}
const elements=(root:Element):Element[]=>[root,...root.children.flatMap(elements)];
// Browser speech inventory and utterances are stand-ins; no physical audio.
test("Counter demo offers and plays only en-US voices, including after inventory changes",()=>{
  const oldSynth=globalThis.speechSynthesis,oldUtterance=globalThis.SpeechSynthesisUtterance;
  const us={voiceURI:"us",name:"American",lang:"en-US"},british={voiceURI:"gb",name:"British",lang:"en-GB"},french={voiceURI:"fr",name:"French",lang:"fr-FR"};
  let inventory=[british,us,french];const played:SpeechSynthesisUtterance[]=[];
  class FakeUtterance {constructor(public text:string){}voice?:SpeechSynthesisVoice;lang="";onend?:()=>void;onerror?:()=>void;}
  Object.assign(globalThis,{speechSynthesis:{getVoices:()=>inventory,speak:(utterance:SpeechSynthesisUtterance)=>{played.push(utterance);},cancel(){}},SpeechSynthesisUtterance:FakeUtterance});
  try{
    const speech=browserSpeech(),callbacks={end(){},error(){}};
    assert.deepEqual(speech.voices(),[{id:"us",name:"American · en-US"}]);
    assert.throws(()=>speech.play("1","gb",callbacks),/English \(US\).*unavailable/);assert.equal(played.length,0);
    speech.play("1","us",callbacks);assert.equal(played[0]?.voice,us);assert.equal(played[0]?.lang,"en-US");assert.equal(played[0]?.text,"1");
    played.length=0;inventory=[british,french];assert.deepEqual(speech.voices(),[]);
    assert.throws(()=>speech.play("2","us",callbacks),/unavailable/);assert.equal(played.length,0);
  }finally{Object.assign(globalThis,{speechSynthesis:oldSynth,SpeechSynthesisUtterance:oldUtterance});}
});
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
  const root=new Element(),app=mountCountingStage(root as unknown as HTMLElement,{speech,connect(){},now:()=>100,runner:{acquire:async()=>()=>{}}});
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
  let publish:((state:ObservationState<Summary>,view?:CountingView)=>void)|undefined,commandPending=false,cancelled=false,resumes=0,prepares=0,posts=0,plays=0,commands=0,end:(()=>void)|undefined;
  let audioResolved=false,voicesAvailable=true;const archivedStarts:AudioStart[]=[];
  let refreshes=0,settleRefresh:(()=>void)|undefined,releaseRefresh:(()=>void)|undefined;
  const observation={refresh(){refreshes++;releaseRefresh=settleRefresh;},cancel(){},done:Promise.resolve()};
  const refusal="guard-failed: running-state — the native service refused Pause";
  const gateway={observe(emit:typeof publish){publish=emit;return observation;},prepare:async()=>{prepares++;throw new Error("stale playback must not prepare");},submit:async()=>{posts++;return{status:"unknown" as const};},reconcile:async()=>({status:"unknown" as const}),command:async()=>{commands++;return{status:"unknown" as const};},checkCommand:async()=>null,
    resumeCommand:async()=>{assert.equal(cancelled,true,"old playback is fenced before the command gateway runs");resumes++;commandPending=false;end?.();return{status:"refused" as const,reason:refusal};},commandResumeReady:()=>commandPending,pendingCommand:()=>commandPending?"pause":null,restoreCommand:async()=>{},audioObsolete:()=>audioResolved,dispose(){}} as unknown as StageGateway;
  let playedVoice:string|undefined;
  const speech={voices:()=>voicesAvailable?[{id:"fake",name:"Fake"},{id:"alternate",name:"Alternate"}]:[],play:(_text:string,voiceId:string,callbacks:{end():void;error():void})=>{plays++;playedVoice=voiceId;end=callbacks.end;return()=>{cancelled=true;callbacks.end();callbacks.error();};}};
  const root=new Element(),app=mountCountingStage(root as unknown as HTMLElement,{speech,connect(){},now:()=>100,runner:{acquire:async()=>()=>{}}});
  try{
    await app.attach({identity,speech,gateway,store:{load:async()=>null,loadStart:async()=>audioStart,saveStart:async marker=>{audioStart=structuredClone(marker);},archiveStart:async marker=>{assert.equal(audioResolved,true);assert.deepEqual(marker,audioStart);archivedStarts.push(structuredClone(marker));audioStart=null;},save:async()=>{throw new Error("no new report expected");},clear:async()=>{}},lock:{run:async work=>work()},current:()=>true});
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
      const restored=nativeGateway(identity,secretSigner(secret),{current:()=>true,lock:{run:async work=>work()},voiceStore:{load:async()=>null,save:async()=>{voiceWrites++;},clear:async()=>{clears++;}},commandStore,fetch:async()=>{posts++;throw new Error("No malformed command transport");},actFetch:async()=>{posts++;throw new Error("No malformed command POST");}});
      const mountedGateway={...gateway,observe(callback:typeof publish){emit=callback;return observation;},command:async(...args:Parameters<StageGateway["command"]>)=>{controls++;return restored.command(...args);},checkCommand:()=>restored.checkCommand(),resumeCommand:()=>restored.resumeCommand(),commandResumeReady:()=>restored.commandResumeReady(),pendingCommand:()=>restored.pendingCommand(),restoreCommand:()=>restored.restoreCommand(),dispose:()=>restored.dispose()};
      const blockedRoot=new Element(),blocked=mountCountingStage(blockedRoot as unknown as HTMLElement,{speech,connect(){},now:()=>100,runner:{acquire:async()=>()=>{}}});
      try{
        await blocked.attach({identity,speech,gateway:mountedGateway,store:{load:async()=>null,loadStart:async()=>blockedAudioStart,saveStart:async marker=>{voiceWrites++;blockedAudioStart=structuredClone(marker);},save:async()=>{voiceWrites++;},clear:async()=>{clears++;}},lock:{run:async work=>work()},current:()=>true});
        const current={status:"current",snapshot:{value:summary}} as unknown as ObservationState<Summary>;
        emit!(current,view);elements(blockedRoot).find(e=>e.dataset["focusKey"]==="join")!.onclick!();await new Promise<void>(resolve=>setImmediate(resolve));
        assert.equal(plays,0,"malformed command presence fences sound before any voice marker");
        assert.equal(elements(blockedRoot).find(e=>e.dataset["focusKey"]==="join")!.disabled,true);assert.equal(elements(blockedRoot).find(e=>e.textContent==="Check command")!.hidden,false);
        assert.equal(elements(blockedRoot).find(e=>e.textContent==="Resume original command")!.hidden,true);
        elements(blockedRoot).find(e=>e.textContent==="Check command")!.onclick!();await new Promise<void>(resolve=>setImmediate(resolve));
        assert.equal((await restored.resumeCommand())?.status,"blocked");blocked.repaint();emit!(current,view);
        elements(blockedRoot).find(e=>e.dataset["focusKey"]==="join")!.onclick!();blocked.repaint();await new Promise<void>(resolve=>setImmediate(resolve));
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
    const select=elements(root).find(e=>e.dataset["focusKey"]==="voice")!;
    select.value="alternate";select.onchange!();
    assert.equal(elements(root).find(e=>e.dataset["focusKey"]==="join")!.disabled,true,"selection waits for the requested native observation");
    await new Promise<void>(resolve=>setImmediate(resolve));
    assert.deepEqual([plays,prepares,posts],[0,0,0]);assert.equal(audioStart,null,"no speech marker is saved before a fresh native observation");
    assert.equal(refreshes,1);assert.equal(typeof releaseRefresh,"function");releaseRefresh!();
    assert.equal(elements(root).find(e=>e.dataset["focusKey"]==="join")!.disabled,false);assert.equal(plays,0,"fresh observation does not automatically Join");
    elements(root).find(e=>e.dataset["focusKey"]==="join")!.onclick!();await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(plays,1);assert.equal(playedVoice,"alternate");assert.equal(cancelled,false);
    commandPending=true;app.repaint();const resume=elements(root).find(e=>e.textContent==="Resume original command")!;assert.equal(resume.hidden,false);resume.onclick!();
    await new Promise<void>(resolve=>setImmediate(resolve));
    assert.equal(resumes,1);assert.deepEqual([prepares,posts,plays],[0,0,1]);assert.equal(elements(root).some(e=>e.className==="notice"&&e.textContent===refusal&&e.classes.has("refused")),true);
    // Actual controller recovery consumes the intact marker only after the
    // scripted current record proves its native pledge obsolete. No replay.
    const originalStart=structuredClone(audioStart);assert.ok(originalStart);assert.equal(app.joined(),true);
    const resolved:CountingView={...view,board:{...view.board!,state:"paused",serial:2,pledge:null,number:null,speaker:null,until:null},pledge:null,pendingPromise:null};
    audioResolved=true;publish!(current,resolved);
    elements(root).find(e=>e.textContent==="Check report")!.onclick!();await new Promise<void>(resolve=>setImmediate(resolve));
    assert.deepEqual(archivedStarts,[originalStart]);assert.equal(audioStart,null);assert.equal(app.joined(),false);
    const rejoin=elements(root).find(e=>e.dataset["focusKey"]==="join")!;assert.equal(rejoin.hidden,false);assert.equal(rejoin.disabled,false,"resolved custody exposes a new explicit Join");
    assert.deepEqual([prepares,posts,plays,commands],[0,0,1,0]);
    await app.join("alternate");assert.equal(app.joined(),true);assert.equal(plays,1,"paused explicit Join never replays obsolete audio");
    // voiceschanged uses repaint. An absent armed URI must also fence a
    // later fresh eligible snapshot before the first automatic commit.
    voicesAvailable=false;app.repaint();assert.equal(app.joined(),false);assert.equal(elements(root).find(e=>e.dataset["focusKey"]==="join")!.hidden,false);
    publish!(current,{...resolved,board:{...resolved.board!,state:"open"}});await new Promise<void>(resolve=>setImmediate(resolve));
    assert.deepEqual([prepares,posts,plays,commands],[0,0,1,0]);
    voicesAvailable=true;app.repaint();assert.equal(elements(root).find(e=>e.dataset["focusKey"]==="join")!.disabled,false);assert.equal(app.joined(),false,"restored inventory still requires explicit Join");

  }finally{app.dispose();Object.assign(globalThis,{document:oldDocument,HTMLElement:oldHTMLElement,HTMLButtonElement:oldButton});}
});

// Fake DOM and already classified presentation inputs: no native receipt or audio proof.
test("Counter acknowledgement requires a recorded local effect and keeps playback, unknown and refusal messages",()=>{
  const oldDocument=globalThis.document,oldHTMLElement=globalThis.HTMLElement,oldButton=globalThis.HTMLButtonElement;
  Object.assign(globalThis,{document:{createElement:(tag:string)=>new Element(tag),createElementNS:()=>new Element(),activeElement:null},HTMLElement:Element,HTMLButtonElement:Element});
  const root=new Element(),noop=()=>{},ui=stageView(root as unknown as HTMLElement,{control:noop,arm:noop,disarm:noop,check:noop,checkReport:noop,resumeCommand:noop,resumeReport:noop,correct:noop,connect:noop,disconnect:noop,forget:noop},{voices:()=>[],play:()=>noop});
  try{
    const logos=elements(root).filter(e=>e.tag==="a"&&e.attrs["aria-label"]==="dap homepage");
    assert.equal(logos.length,1);assert.equal(logos[0]!.href,"https://dap.generalbusiness.ai/");assert.equal(logos[0]!.children.length,2);
    const base:StagePresentation={fresh:true,connection:"Connected"};
    const acknowledgement=()=>elements(root).find(e=>e.className==="acknowledgement")!.textContent;
    ui.render(base);assert.equal(acknowledgement(),"");
    // The real view hides device-only inspection and Forget while identity is absent,
    // exposes both on attach, and hides them again when identity is cleared.
    const inspection=elements(root).find(e=>e.className==="inspection")!;
    const forget=elements(root).find(e=>e.dataset["focusKey"]==="forget")!;
    assert.equal(inspection.hidden,true);assert.equal(forget.hidden,true);
    const secret=new Uint8Array(32).fill(79);
    const ref=(kind:ActorIdentity["scope"]["kind"])=>({scope:scopeIdOf({v:1,kind,definition:COUNTING_DEFINITION,creator:null,cause:textDigest(`FAKE view ${kind}`),ordinal:0}),inc:newIncarnation(new Uint8Array(16).fill(13)),kind});
    const membership=ref("membership");
    const identity:ActorIdentity={origin:"https://fake-view.test",deployment:"FAKE",scope:ref("lane"),membership,member:{membership,member:"@ada"},definition:COUNTING_DEFINITION,publicKey:keyIdOfSecret(secret)};
    ui.render({...base,identity});assert.equal(inspection.hidden,false);assert.equal(forget.hidden,false);
    ui.render(base);assert.equal(inspection.hidden,true);assert.equal(forget.hidden,true);

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

// Mounted orchestration over scripted observations, commands and fake speech.
// No native admission, browser storage, provider or physical sound is proved.
async function mountedJourney(work:(f:Awaited<ReturnType<typeof journeyFixture>>)=>Promise<void>) {
  const oldDocument=globalThis.document,oldHTMLElement=globalThis.HTMLElement,oldButton=globalThis.HTMLButtonElement;
  Object.assign(globalThis,{document:{createElement:()=>new Element(),createElementNS:()=>new Element(),activeElement:null},HTMLElement:Element,HTMLButtonElement:Element});
  const f=await journeyFixture();
  try{await work(f);}finally{f.app.dispose();Object.assign(globalThis,{document:oldDocument,HTMLElement:oldHTMLElement,HTMLButtonElement:oldButton});}
}
async function journeyFixture() {
  const secret=new Uint8Array(32).fill(73);
  const ref=(kind:ActorIdentity["scope"]["kind"])=>({scope:scopeIdOf({v:1,kind,definition:COUNTING_DEFINITION,creator:null,cause:textDigest(`FAKE join ${kind}`),ordinal:0}),inc:newIncarnation(new Uint8Array(16).fill(9)),kind});
  const scope=ref("lane"),membership=ref("membership"),member={membership,member:"@ada" as const};
  const identity:ActorIdentity={origin:"https://fake-join.test",deployment:"FAKE",scope,membership,member,definition:COUNTING_DEFINITION,publicKey:keyIdOfSecret(secret)};
  const summary={scope,status:"active",definition:COUNTING_DEFINITION,time:"2099-01-01T00:00:00Z",counts:[],items:[]} as Summary;
  let view:CountingView={summary,configuration:{id:0,revision:1,target:3,controller:member},board:{id:1,revision:1,state:"paused",target:3,generation:0,serial:0,lastNumber:0,lastSpeaker:null,number:null,speaker:null,until:null,pledge:null,lastFulfilledAt:null},participants:[],pledge:null,pendingPromise:null};
  let publish:((state:ObservationState<Summary>,view?:CountingView)=>void)|undefined,head=0,owns=true,leaseAvailable=true,pending:string|null=null;
  let commandResult:"recorded"|"refused"|"unknown"|"blocked"|"unsent"="recorded",speechAvailable=true,plays=0,releases=0;
  let beforeReply:(()=>void)|undefined,replyObservation=true;
  const calls:string[]=[];
  let commandGate:Promise<void>|undefined,entered:(()=>void)|undefined;
  const emit=(status="current")=>publish!({status,...(status==="current"?{snapshot:{value:summary,at:{seq:head++,hash:textDigest("FAKE head")}}}:{})} as unknown as ObservationState<Summary>,view);
  const gateway={observe(callback:typeof publish){publish=callback;return{refresh(){emit();},cancel(){},done:Promise.resolve()};},restoreCommand:async()=>{},pendingCommand:()=>pending,commandResumeReady:()=>false,checkCommand:async()=>null,resumeCommand:async()=>null,dispose(){},
    command:async(kind:string)=>{calls.push(kind);entered?.();if(commandGate)await commandGate;const hook=beforeReply;beforeReply=undefined;hook?.();if(commandResult==="unknown"){pending=kind;return{status:"unknown" as const,reason:"Check the original request."};}if(commandResult==="refused"){if(replyObservation)emit();return{status:"refused" as const,reason:"native guard-failed"};}
      if(commandResult==="blocked"||commandResult==="unsent"){if(replyObservation)emit();return{status:"blocked" as const,reason:"Local preparation stopped",...(commandResult==="unsent"?{definitelyUnsent:true as const}:{})};}
      if(kind==="participate")view={...view,participants:[{id:2,revision:1,member,state:"inactive"}]};
      if(kind==="activate"||kind==="deactivate")view={...view,participants:view.participants.map(p=>({...p,state:kind==="activate"?"active" as const:"inactive" as const,revision:p.revision+1}))};
      emit();return{status:"recorded" as const};},prepare:async()=>{throw new Error("No fulfilled report in this fixture");},submit:async()=>({status:"unknown" as const}),reconcile:async()=>({status:"unknown" as const})} as StageGateway;
  const speech={voices:()=>speechAvailable?[{id:"us",name:"American · en-US"}]:[],play:()=>{plays++;return()=>{};}};
  const root=new Element(),app=mountCountingStage(root as unknown as HTMLElement,{speech,connect(){},now:()=>100,runner:{acquire:async()=>leaseAvailable?()=>{releases++;}:null}});
  const store={load:async()=>null,loadStart:async()=>null,save:async()=>{},clear:async()=>{}};
  await app.attach({name:"Ada",identity,speech,gateway,store,lock:{run:async work=>work()},current:()=>owns});
  return{app,calls,emit,identity,gateway,speech,store,root,get view(){return view;},set view(next:CountingView){view=next;},get plays(){return plays;},get releases(){return releases;},set result(next:typeof commandResult){commandResult=next;},beforeReply(work:()=>void){beforeReply=work;},set replyObservation(next:boolean){replyObservation=next;},set voiceAvailable(next:boolean){speechAvailable=next;},set leaseAvailable(next:boolean){leaseAvailable=next;},set owns(next:boolean){owns=next;},holdCommand(){let release!:()=>void;commandGate=new Promise<void>(resolve=>{release=resolve;});const requested=new Promise<void>(resolve=>{entered=resolve;});return{requested,release};}};
}
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));

test("One Join waits for a fresh record, records participation and own activation, then arms; Leave deactivates after stopping local speech",async()=>mountedJourney(async f=>{
  const joining=f.app.join("us");await flush();assert.deepEqual(f.calls,[],"connecting is not a mutation permission");assert.equal(f.app.joined(),false);
  f.emit();await joining;assert.deepEqual(f.calls,["participate","activate"]);assert.equal(f.app.joined(),true);assert.equal(f.plays,0,"paused Join does not speak");
  await f.app.leave();assert.equal(f.app.joined(),false);assert.deepEqual(f.calls,["participate","activate","deactivate"]);assert.equal(f.releases,1);
}));

test("Join refuses unusable voices and duplicate runner ownership before mutation, and keeps partial unknown participation as an original",async()=>mountedJourney(async f=>{
  f.emit();f.voiceAvailable=false;await f.app.join("us");assert.deepEqual(f.calls,[]);assert.match(f.app.joinStatus().reason!,/Refused because/);
  f.voiceAvailable=true;f.leaseAvailable=false;await f.app.join("us");assert.deepEqual(f.calls,[]);assert.equal(f.app.joined(),false);
  f.leaseAvailable=true;f.result="unknown";await f.app.join("us");assert.deepEqual(f.calls,["participate"]);assert.equal(f.app.joined(),false);assert.match(f.app.joinStatus().reason!,/participation was not confirmed/);
  f.emit();await f.app.join("us");assert.deepEqual(f.calls,["participate"],"head advance cannot sign a fresh original");assert.equal(f.plays,0);
}));

test("Automatic commits keep native fairness and do not retry a refused turn when only the observed head advances",async()=>mountedJourney(async f=>{
  f.emit();await f.app.join("us");f.calls.length=0;f.result="refused";
  f.view={...f.view,board:{...f.view.board!,state:"open",lastSpeaker:f.identity.member}};f.emit();await flush();assert.deepEqual(f.calls,["commit"],"the native solo exception permits consecutive turns");
  f.emit();f.emit();await flush();assert.deepEqual(f.calls,["commit"],"the same accepted board and roster never retry after a head-only notification");
  const peer={membership:f.identity.membership,member:"@beau" as const};f.view={...f.view,board:{...f.view.board!,serial:1},participants:[...f.view.participants,{id:4,revision:1,member:peer,state:"active"}]};f.emit();await flush();assert.deepEqual(f.calls,["commit"],"two active participants forbid the previous speaker");
  f.view={...f.view,board:{...f.view.board!,lastSpeaker:peer}};f.emit();await flush();assert.deepEqual(f.calls,["commit","commit"],"a distinct native serial and eligible speaker admit the next attempt");
}));

test("A Pause-winning refused automatic commit recovers after Start at a new accepted revision without Leave or Join",async()=>mountedJourney(async f=>{
  f.emit();await f.app.join("us");f.calls.length=0;f.result="refused";
  const tuple=()=>[f.view.board!.generation,f.view.board!.serial,f.view.board!.lastNumber+1];
  const originalTuple=tuple();
  f.beforeReply(()=>{f.view={...f.view,board:{...f.view.board!,state:"paused",revision:3}};});
  f.view={...f.view,board:{...f.view.board!,state:"open",revision:2}};
  f.emit();await flush();assert.deepEqual(f.calls,["commit"]);assert.equal(f.app.joined(),true);
  f.emit();f.emit();await flush();assert.deepEqual(f.calls,["commit"],"Pause and repeated heads do not admit a commit");
  f.view={...f.view,board:{...f.view.board!,state:"open",revision:4}};
  f.emit();await flush();assert.deepEqual(tuple(),originalTuple);assert.deepEqual(f.calls,["commit","commit"]);
  assert.equal(f.app.joined(),true);assert.equal(f.releases,0);assert.equal(f.plays,0);
  f.emit();await flush();assert.deepEqual(f.calls,["commit","commit"],"the corrected state also gets one attempt");
}));

for(const outcome of ["refused","unsent"] as const){
  test(`Automatic ${outcome} correction wakes from a relevant accepted state received while the original command was busy`,async()=>mountedJourney(async f=>{
    f.emit();await f.app.join("us");f.calls.length=0;f.result=outcome;f.replyObservation=false;
    f.beforeReply(()=>{
      f.view={...f.view,board:{...f.view.board!,state:"paused",revision:3}};f.emit();
      f.view={...f.view,board:{...f.view.board!,state:"open",revision:4}};f.emit();
      assert.deepEqual(f.calls,["commit"],"accepted Pause/Start observations cannot submit while the original is busy");
    });
    f.view={...f.view,board:{...f.view.board!,state:"open",revision:2}};f.emit();
    await flush();
    assert.deepEqual(f.calls,["commit","commit"],"the terminal outcome wakes the already fresh corrected state without another observation");
    assert.equal(f.app.joined(),true);assert.equal(f.releases,0);assert.equal(f.plays,0);
    await flush();assert.deepEqual(f.calls,["commit","commit"],"the corrected state does not loop on its own terminal outcome");
  }));
}

test("A refused automatic commit corrects its accepted roster basis once while preserving fairness",async()=>mountedJourney(async f=>{
  f.emit();await f.app.join("us");f.calls.length=0;f.result="refused";
  const peer={membership:f.identity.membership,member:"@beau" as const};
  f.view={...f.view,board:{...f.view.board!,state:"open",revision:2,lastSpeaker:peer},participants:[...f.view.participants,{id:4,revision:1,member:peer,state:"active"}]};
  f.emit();await flush();assert.deepEqual(f.calls,["commit"]);
  f.view={...f.view,participants:f.view.participants.map(p=>p.id===4?{...p,revision:2}:p)};
  f.emit();await flush();assert.deepEqual(f.calls,["commit","commit"],"new accepted active basis permits a corrected proposal at the same board tuple");
  f.view={...f.view,participants:[...f.view.participants].reverse()};
  f.emit();await flush();assert.deepEqual(f.calls,["commit","commit"],"display order and new heads are not accepted basis changes");
  f.view={...f.view,board:{...f.view.board!,revision:3,lastSpeaker:f.identity.member}};
  f.emit();await flush();assert.deepEqual(f.calls,["commit","commit"],"a previous speaker still cannot take the next turn with two active participants");
}));

for(const outcome of ["unsent","blocked","unknown","recorded"] as const){
  test(`Automatic ${outcome} outcome only permits relevant-state correction when definitely unsent`,async()=>mountedJourney(async f=>{
    f.emit();await f.app.join("us");f.calls.length=0;f.result=outcome;
    f.view={...f.view,board:{...f.view.board!,state:"open",revision:2}};
    f.emit();await flush();assert.deepEqual(f.calls,["commit"]);
    f.emit();await flush();assert.deepEqual(f.calls,["commit"],"same state never retries");
    f.view={...f.view,board:{...f.view.board!,revision:3}};
    f.emit();await flush();assert.deepEqual(f.calls,outcome==="unsent"?["commit","commit"]:["commit"]);
    assert.equal(f.app.joined(),true);assert.equal(f.releases,0);assert.equal(f.plays,0);
  }));
}

test("A stale Join context cannot activate, arm or repaint after its pending participation returns",async()=>mountedJourney(async f=>{
  f.emit();const gate=f.holdCommand();const joining=f.app.join("us");await gate.requested;f.app.disconnect();gate.release();await joining;
  assert.deepEqual(f.calls,["participate"]);assert.equal(f.app.joined(),false);assert.equal(f.plays,0);assert.equal(f.releases,1);
}));
