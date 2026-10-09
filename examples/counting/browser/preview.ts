/** FAKE transport/auth/scope/speech/clock for rendered source QA only. No audio or provider. */
import "./style.css";
import type { Entry, Item, MemberRef, Receipt, ScopeRef, SignedIntent, Summary } from "@generalbusiness/artroom-contract";
import { canonicalize, entryHash, factRefOf, intentDigest, keyIdOfSecret, newIncarnation, scopeIdOf, textDigest } from "@generalbusiness/artroom-bytes";
import type { Fetch, HeadStreamFetch } from "@generalbusiness/artroom-client";
import { COUNTING_DEFINITION } from "../pin.ts";
import { nativeGateway } from "./client.ts";
import { mountCountingStage } from "./app.ts";
import { browserLock, privateCommandStore, privatePendingStore } from "./storage.ts";
import type { ActorIdentity, SpeechPort } from "./voice-controller.ts";
const NOW=Date.now(),DEPLOYMENT="fake-u1",ORIGIN="https://counting-fake.test";
const reference=(name:string,kind:ScopeRef["kind"]):ScopeRef=>({scope:scopeIdOf({v:1,kind,definition:COUNTING_DEFINITION,creator:null,cause:textDigest(`fake ${name}`),ordinal:0}),inc:newIncarnation(new Uint8Array(16).fill(9)),kind});
const S=reference("scope","task"),M=reference("membership","membership");
const keys=[new Uint8Array(32).fill(41),new Uint8Array(32).fill(42),new Uint8Array(32).fill(43)];
const members:MemberRef[]=["@ada","@beau","@cleo"].map(member=>({membership:M,member:member as MemberRef["member"]}));
type FakeItem={-readonly [K in keyof Item]:Item[K]};
const make=(type:string,id:number,state:string,values:Item["values"],parties:Item["parties"]):FakeItem=>({type,id,state,revision:1,opened:null,values,parties,refs:{},attributed:[]});
const config=make("configuration",0,"ready",{target:100},{controller:members[0]!});
const board=make("board",1,"running",{target:100,generation:0,serial:43,lastNumber:42,number:43,basis:members.map((member,i)=>({id:i+2,member})),until:new Date(NOW+15_000).toISOString()},{controller:members[0]!,speaker:members[0]!,lastSpeaker:members[2]!});
let participants=members.map((member,i)=>make("participant",i+2,"joined",{}, {agent:member})),seq=48,lost=false,posts=0,settles=0,nextID=6,active=true;
const entries=new Map<number,Entry>(),receipts=new Map<string,Receipt>(),heads=new Set<ReadableStreamDefaultController<Uint8Array>>();
const head=()=>({seq,hash:textDigest(`fake head ${seq}`)});
const notify=()=>{const bytes=new TextEncoder().encode(JSON.stringify({at:head()})+"\n");for(const c of heads)try{c.enqueue(bytes);}catch{heads.delete(c);}};
const summary=():Summary=>({scope:S,status:"active",definition:COUNTING_DEFINITION,time:new Date(NOW).toISOString(),counts:[],items:[config,board,...participants]});
const read=(value:unknown)=>Response.json({ok:true,at:head(),complete:true,value});
const fakeFetch:Fetch=async(url,init)=>{
  const path=new URL(url).pathname;
  if(path.endsWith("/sessions")){const request=JSON.parse(init?.body??"{}").request as {actor:string};const i=keys.findIndex(k=>keyIdOfSecret(k)===request.actor);return i<0?Response.json({ok:false,reason:"unauthorized"}):Response.json({ok:true,token:"FAKE session only",session:{v:1,deployment:DEPLOYMENT,membership:M,member:members[i]!.member,key:request.actor,reads:["summary","entry","retained"],ends:new Date(Date.now()+60_000).toISOString()}});}
  if(path.endsWith("/settle")){settles++;const signed=JSON.parse(init?.body??"{}").signed as SignedIntent;const receipt=receipts.get(canonicalize(signed));return receipt?read(receipt):Response.json({ok:false,reason:"not-found"});}
  if(path.includes("/entries/")){const entry=entries.get(Number(path.split("/").at(-1)));return entry?read({entry,hash:entryHash(entry)}):Response.json({ok:false,reason:"not-found"});}
  if(!path.endsWith("/acts"))return read(structuredClone(summary()));
  posts++;const signed=JSON.parse(init?.body??"{}").signed as SignedIntent;const i=keys.findIndex(k=>keyIdOfSecret(k)===signed.intent.actor),actor=members[i];if(!actor)return Response.json({answer:"refused",reason:"unauthorized",judgedAt:head()});
  const f=signed.intent.fields,kind=signed.intent.kind;
  // Script only expected source-QA paths; this is NOT native guard/admission proof.
  if(kind==="spoken"){board.values={...board.values,lastNumber:f["n"]!,serial:f["nextSerial"]!,number:f["nextN"]!,basis:f["basis"]!};board.parties={...board.parties,lastSpeaker:actor,speaker:participants.find(p=>p.id===f["next"])!.parties["agent"]!};}
  else if(kind==="pause"){board.state="paused";board.values={...board.values,serial:f["nextSerial"]!,number:null,basis:null,until:null};board.parties={...board.parties,speaker:null};}
  else if(kind==="start"){board.state="running";board.values={...board.values,serial:f["nextSerial"]!,number:f["n"]!,basis:f["basis"]!,until:new Date(NOW+15_000).toISOString()};board.parties={...board.parties,speaker:participants.find(p=>p.id===f["next"])!.parties["agent"]!};}
  else if(kind==="reset"){board.state="paused";board.values={...board.values,generation:f["generation"]!,serial:0,lastNumber:0,number:null,basis:null,until:null};board.parties={...board.parties,speaker:null,lastSpeaker:null};}
  else if(kind==="leave"){const leaving=participants.find(p=>p.id===signed.intent.on);participants=participants.filter(p=>p.id!==signed.intent.on);if(leaving&&canonicalize(leaving.parties["agent"])===canonicalize(board.parties["speaker"])){board.values={...board.values,serial:f["nextSerial"]!,basis:f["basis"]!,until:f["replace"]?new Date(NOW+15_000).toISOString():null};board.parties={...board.parties,speaker:f["replace"]?participants.find(p=>p.id===f["next"])!.parties["agent"]!:null};if(!f["replace"]){board.state="paused";board.values={...board.values,number:null};}}}
  else if(kind==="join"){participants.push(make("participant",nextID++,"joined",{}, {agent:actor}));}
  seq++;board.revision++;const entry:Entry={v:1,at:S,seq,prev:textDigest("fake previous entry"),time:new Date(NOW).toISOString(),clamped:false,epoch:0,input:{type:"act",signed,authority:[],presented:{}},uses:[],prepared:[],effects:[],sends:[]};entries.set(seq,entry);const receipt:Receipt={fact:factRefOf(entry),definition:COUNTING_DEFINITION,intent:intentDigest(signed.intent),effects:[],sends:[],epoch:0};receipts.set(canonicalize(signed),receipt);notify();
  if(lost&&kind==="spoken"){lost=false;throw new Error("FAKE lost accepted reply");}return Response.json({answer:"accepted",receipt});
};
const fakeHeads:HeadStreamFetch=async(url,init)=>{if(init.redirect!=="error")throw new Error("Fake metadata contract requires redirect refusal.");const body=new ReadableStream<Uint8Array>({start(controller){heads.add(controller);controller.enqueue(new TextEncoder().encode(JSON.stringify({at:head()})+"\n"));},cancel(){for(const c of heads)try{c.close();}catch{}heads.clear();}});return{status:200,body,headers:new Headers({"content-type":"application/x-ndjson"}),url,redirected:false};};
let plays=0,cancels=0,callbacks:{end():void;error():void}|undefined;
const speech:SpeechPort={voices:()=>[{id:"fake-1",name:"Voice 1"},{id:"fake-2",name:"Voice 2"},{id:"fake-3",name:"Voice 3"}],play:(_text,_id,events)=>{plays++;callbacks=events;return()=>{cancels++;};}};
const identity:ActorIdentity={origin:ORIGIN,deployment:DEPLOYMENT,scope:S,definition:COUNTING_DEFINITION,membership:M,member:members[0]!,publicKey:keyIdOfSecret(keys[0]!)};
const store=privatePendingStore(identity),lock=browserLock(identity),commands=privateCommandStore(identity),gateway=nativeGateway(identity,keys[0]!,{current:()=>active,lock,voiceStore:store,commandStore:commands,fetch:fakeFetch,headFetch:fakeHeads});
const app=mountCountingStage(document.querySelector<HTMLElement>("#counting")!,{speech,connect:()=>{},fake:true,now:()=>NOW});
void app.attach({identity,speech,gateway,store,lock,current:()=>active,dispose:()=>{active=false;}});
// Public test hooks expose only events/counters, never credentials/envelopes.
Object.assign(window,{countingPreview:{end(){callbacks?.end();},error(){callbacks?.error();},loseNextReply(){lost=true;},counters(){return{plays,cancels,posts,settles,number:board.values["lastNumber"]};},staleEnd(){callbacks?.end();}}});
