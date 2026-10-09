// Actual SDK/W1/signing over FAKE service/session/history/memory custody; no native admission or speech.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Entry, Item, Receipt, ScopeRef, Summary } from "@generalbusiness/artroom-contract";
import { canonicalize, entryHash, factRefOf, intentDigest, keyIdOfSecret, newIncarnation, scopeIdOf, textDigest } from "@generalbusiness/artroom-bytes";
import type { Fetch, HeadStreamFetch } from "@generalbusiness/artroom-client";
import { COUNTING_DEFINITION } from "../pin.ts";
import { nativeGateway, type CommandStore } from "./client.ts";
import { activeAttempt, markActive, type DispatchPhase } from "./journal.ts";
import { attemptDispatcher } from "./dispatcher.ts";
import type { ActorIdentity } from "./voice-controller.ts";

async function fixture(joined=true) {
  const secret=new Uint8Array(32).fill(51),definition=COUNTING_DEFINITION;
  const ref=(kind:ScopeRef["kind"]):ScopeRef=>({scope:scopeIdOf({v:1,kind,definition,creator:null,cause:textDigest(`FAKE gateway ${kind}`),ordinal:0}),inc:newIncarnation(new Uint8Array(16).fill(8)),kind});
  const scope=ref("lane"),membership=ref("membership"),member={membership,member:"@ada" as const};
  const identity:ActorIdentity={origin:"https://gateway-fake.test",deployment:"FAKE gateway",scope,definition,membership,member,publicKey:keyIdOfSecret(secret)};
  const item=(type:string,id:number,state:string,values:Item["values"],parties:Item["parties"]):Item=>({type,id,state,revision:1,opened:null,values,parties,refs:{},attributed:[]});
  const summary:Summary={scope,status:"active",definition,time:new Date().toISOString(),counts:[],items:[item("configuration",0,"ready",{target:3},{controller:member}),item("board",1,"paused",{target:3,generation:0,serial:0,lastNumber:0,number:null,until:null},{controller:member,speaker:null,lastSpeaker:null}),...(joined?[item("participant",2,"joined",{}, {agent:member})]:[])]};
  const head={seq:1,hash:textDigest("FAKE head")};let held:Awaited<ReturnType<CommandStore["load"]>>=null,posts=0,settles=0,saves=0,clears=0;
  let metadata="trusted",reply:"refused"|"lost"="refused",failPhase:DispatchPhase|undefined,settleAccepted=false,entry:Entry|undefined,receipt:Receipt|undefined,race:"before-post"|"before-reply"|undefined;
  const snapshots:NonNullable<Awaited<ReturnType<CommandStore["load"]>>>[]=[];
  let queue=Promise.resolve();const lock={run:<T>(work:()=>Promise<T>):Promise<T>=>{const run=queue.then(work);queue=run.then(()=>undefined,()=>undefined);return run;}};
  const commands:CommandStore={load:async()=>held,save:async value=>{if(value.journal&&activeAttempt(value.journal).phase===failPhase)throw new Error("FAKE journal commit failure");held=structuredClone(value);snapshots.push(structuredClone(value));saves++;if(race==="before-post"&&held.journal&&activeAttempt(held.journal).phase==="inflight")held={...held,journal:markActive(held.journal,"unknown")};},clear:async()=>{held=null;clears++;}};
  const fake:Fetch=async(url,init)=>{
    const path=new URL(url).pathname;
    if(path.endsWith("/sessions")){const request=JSON.parse(init?.body??"{}").request;return Response.json({ok:true,token:"FAKE token",session:{v:1,deployment:identity.deployment,membership,member:member.member,key:identity.publicKey,reads:["summary","entry"],ends:request.notAfter}});}
    if(path.endsWith("/acts")){
      posts++;assert.ok(held?.journal,"custody must exist before POST");assert.equal(activeAttempt(held.journal).phase,"inflight");const submitted=JSON.parse(init?.body??"{}");assert.equal(canonicalize(submitted.signed),canonicalize(held.envelope.signed));
      // Scripted accepted history can later contradict an untrusted or lost response. It is NOT native admission proof.
      if(metadata!=="trusted"||reply==="lost"){entry={v:1,at:scope,seq:2,prev:head.hash,time:new Date().toISOString(),clamped:false,epoch:0,input:{type:"act",signed:submitted.signed,authority:[],presented:{}},uses:[],prepared:[],effects:[],sends:[]};receipt={fact:factRefOf(entry),definition,intent:intentDigest(submitted.signed.intent),effects:[],sends:[],epoch:0};}
      if(race==="before-reply"&&held.journal)held={...held,journal:markActive(held.journal,"unknown")};
      if(reply==="lost")throw new Error("FAKE lost response");return Response.json({answer:"refused",reason:"guard-failed",judgedAt:head},{status:422});
    }
    if(path.endsWith("/settle")){settles++;return settleAccepted&&receipt?Response.json({ok:true,at:head,complete:true,value:receipt}):Response.json({ok:false,reason:"not-found"});}
    if(path.includes("/entries/"))return entry?Response.json({ok:true,at:head,complete:true,value:{entry,hash:entryHash(entry)}}):Response.json({ok:false,reason:"not-found"});
    return Response.json({ok:true,at:head,complete:true,value:summary});
  };
  const stream:HeadStreamFetch=async(url,init)=>{assert.equal(init.redirect,"error");return{status:200,url,redirected:false,headers:new Headers({"content-type":"application/x-ndjson"}),body:new ReadableStream<Uint8Array>({start(c){c.enqueue(new TextEncoder().encode(JSON.stringify({at:head})+"\n"));}})};};
  const connect=async()=>{
    const gateway=nativeGateway(identity,secret,{current:()=>true,lock,voiceStore:{load:async()=>null,save:async()=>{throw new Error("unused fake voice");},clear:async()=>{}},commandStore:commands,fetch:fake,headFetch:stream,
      actFetch:async(url,init)=>{assert.equal(init.redirect,"error");const response=await fake(url,{...init,signal:init.signal as never});return{status:metadata==="wrong-status"?200:response.status,body:response.body,headers:new Headers({"content-type":metadata==="wrong-media"?"text/html":"application/json"}),url:metadata==="wrong-url"?url+"/different":url,redirected:metadata==="redirected"};}});
    await new Promise<void>((resolve,reject)=>gateway.observe(state=>{if(state.status==="current")resolve();else if(["error","forbidden","unsupported"].includes(state.status))reject(new Error(`Fake gateway setup ${state.status}`));}));return gateway;
  };
  return{identity,gateway:await connect(),connect,counters:()=>({posts,settles,saves,clears}),retained:()=>held?canonicalize(held):null,record:()=>held,snapshots,mode:(value:string)=>{metadata=value;},lose:()=>{reply="lost";},fail:(phase?:DispatchPhase)=>{failPhase=phase;},race:(value:"before-post"|"before-reply")=>{race=value;},acceptSettlement:()=>{settleAccepted=true;},corrupt:(change:(record:NonNullable<typeof held>)=>NonNullable<typeof held>)=>{if(held)held=change(held);},legacy:()=>{if(held)held={kind:held.kind,envelope:held.envelope};}};
}

test("FAKE correlated trusted first refusal commits judgment before terminal control custody clears",async()=>{
  const f=await fixture();try{
    assert.equal((await f.gateway.command("start")).status,"refused");
    assert.equal(f.retained(),null);assert.deepEqual(f.counters(),{posts:1,settles:0,saves:3,clears:1});
    assert.deepEqual(f.snapshots.map(s=>activeAttempt(s.journal!).phase),["prepared","inflight","refused"]);
    const final=activeAttempt(f.snapshots.at(-1)!.journal!);assert.equal(final.refusal?.answer.answer,"refused");assert.equal(final.refusal?.origin,"https://gateway-fake.test");
  }finally{f.gateway.dispose();}
});

test("FAKE wrong-route first response stays unknown; later refusal/head cannot settle it, exact accepted history can",async()=>{
  const f=await fixture();try{
    f.mode("wrong-url");assert.equal((await f.gateway.command("start")).status,"unknown");
    const original=f.retained();assert.ok(original);assert.equal(activeAttempt(f.record()!.journal!).phase,"unknown");
    f.mode("trusted");assert.equal((await f.gateway.command("start")).status,"unknown");
    assert.equal((await f.gateway.checkCommand())?.status,"unknown");assert.equal(f.retained(),original);assert.equal(f.counters().posts,1);
    f.acceptSettlement();assert.equal((await f.gateway.checkCommand())?.status,"recorded");assert.equal(f.retained(),null);assert.equal(f.counters().posts,1);
  }finally{f.gateway.dispose();}
});

test("FAKE restored prepared command first-dispatches identical bytes; restored inflight and legacy commands never POST",async()=>{
  const f=await fixture();let next:Awaited<ReturnType<typeof f.connect>>|undefined,peer:Awaited<ReturnType<typeof f.connect>>|undefined;try{
    f.fail("inflight");assert.equal((await f.gateway.command("start")).status,"unknown");assert.equal(f.counters().posts,0);const original=f.record()!.envelope;
    f.gateway.dispose();f.fail();next=await f.connect();await next.restoreCommand();peer=await f.connect();await peer.restoreCommand();const results=await Promise.all([next.checkCommand(),peer.checkCommand()]);assert.deepEqual(results.map(r=>r?.status??null),["refused",null]);assert.equal(f.counters().posts,1);assert.equal(canonicalize(f.snapshots.at(-1)!.envelope),canonicalize(original));
  }finally{f.gateway.dispose();next?.dispose();peer?.dispose();}
  const lost=await fixture();let resumed:Awaited<ReturnType<typeof lost.connect>>|undefined;try{
    lost.lose();lost.fail("unknown");assert.equal((await lost.gateway.command("start")).status,"unknown");assert.equal(activeAttempt(lost.record()!.journal!).phase,"inflight");const original=lost.retained();
    lost.gateway.dispose();lost.fail();resumed=await lost.connect();await resumed.restoreCommand();assert.equal((await resumed.checkCommand())?.status,"unknown");assert.equal(lost.retained(),original);assert.equal(lost.counters().posts,1);
    lost.legacy();const legacy=lost.retained();assert.equal((await resumed.checkCommand())?.status,"unknown");assert.equal(lost.retained(),legacy);assert.equal(lost.counters().posts,1);
  }finally{lost.gateway.dispose();resumed?.dispose();}
});

test("FAKE known-refusal journal-save failure fences correction; unavailable local candidate never saves or POSTs",async()=>{
  const f=await fixture();try{
    f.fail("refused");assert.equal((await f.gateway.command("start")).status,"unknown");const original=f.retained();assert.ok(original);assert.equal(f.counters().clears,0);
    assert.equal((await f.gateway.command("start")).status,"unknown");assert.equal(f.retained(),original);assert.equal(f.counters().posts,1);
  }finally{f.gateway.dispose();}
  const blocked=await fixture(false);try{
    assert.equal((await blocked.gateway.command("start")).status,"blocked");assert.equal(blocked.retained(),null);assert.deepEqual(blocked.counters(),{posts:0,settles:0,saves:0,clears:0});
  }finally{blocked.gateway.dispose();}
});

// One coherent custody race: compare before POST and compare before known terminal commit.
test("FAKE changed active journal fences the first ticket and prevents a stale terminal overwrite",async()=>{
  const before=await fixture();try{
    before.race("before-post");assert.equal((await before.gateway.command("start")).status,"unknown");
    assert.equal(before.counters().posts,0);assert.equal(activeAttempt(before.record()!.journal!).phase,"unknown");assert.equal(before.counters().clears,0);
  }finally{before.gateway.dispose();}
  const after=await fixture();try{
    after.race("before-reply");assert.equal((await after.gateway.command("start")).status,"unknown");
    assert.equal(after.counters().posts,1);assert.equal(activeAttempt(after.record()!.journal!).phase,"unknown");assert.equal(after.counters().clears,0);
  }finally{after.gateway.dispose();}
});

// Conditional storage corruption must fail before inflight commit or any wire side effect.
test("FAKE malformed restored PreparedEnvelope and refusal stay blocked without POST or terminal clear",async()=>{
  const f=await fixture();try{
    f.fail("inflight");await f.gateway.command("start");assert.equal(f.counters().posts,0);f.fail();
    f.corrupt(record=>({...record,envelope:{...record.envelope,beside:{...record.envelope.beside,signed:record.envelope.signed}} as never}));
    const original=f.retained();assert.equal((await f.gateway.checkCommand())?.status,"blocked");assert.equal(f.retained(),original);assert.equal(f.counters().posts,0);assert.equal(f.counters().clears,0);
  }finally{f.gateway.dispose();}
  const g=await fixture();try{
    await g.gateway.command("start");
    const refused=structuredClone(g.snapshots.at(-1)!);
    g.fail("inflight");await g.gateway.command("start");g.fail();
    g.corrupt(()=>({...refused,journal:{...refused.journal!,attempts:refused.journal!.attempts.map(a=>({...a,refusal:{...a.refusal!,answer:{...a.refusal!.answer,judgedAt:{seq:-1,hash:"bad"}}}}))}} as never));
    const original=g.retained(),before=g.counters();assert.equal((await g.gateway.checkCommand())?.status,"blocked");assert.equal(g.retained(),original);assert.deepEqual(g.counters(),before);
  }finally{g.gateway.dispose();}
});


test("FAKE prepared structural mismatch blocks dispatcher before inflight and preserves the whole original",async()=>{
  const f=await fixture();try{
    f.fail("inflight");await f.gateway.command("start");const original=f.record()!;
    const malformed={...original,envelope:{...original.envelope,beside:{...original.envelope.beside,grants:[]}}} as unknown as typeof original;
    let record=structuredClone(malformed),writes=0,posts=0,settles=0;
    const dispatcher=attemptDispatcher({identity:f.identity,current:()=>true,fetch:async()=>{posts++;throw new Error("must not POST");},accepted:async()=>({status:"unknown"}),settle:async()=>{settles++;return{ok:false};},refresh(){}});
    const answer=await dispatcher.run({load:async()=>record,save:async next=>{writes++;record=next;}},malformed.envelope);
    assert.equal(answer.status,"blocked");assert.deepEqual([writes,posts,settles],[0,0,0]);assert.deepEqual(record,malformed);
  }finally{f.gateway.dispose();}
});


test("FAKE read-only dispatcher Check leaves valid prepared custody unsent; original resume consumes it once",async()=>{
  const f=await fixture();try{
    f.fail("inflight");await f.gateway.command("start");let record=structuredClone(f.record()!),posts=0,writes=0,settles=0;
    const dispatcher=attemptDispatcher({identity:f.identity,current:()=>true,fetch:async(url,init)=>{posts++;assert.deepEqual(JSON.parse(init.body),{signed:record.envelope.signed,grants:record.envelope.grants});return{status:422,url,redirected:false,headers:new Headers({"content-type":"application/json"}),body:Response.json({answer:"refused",reason:"guard-failed",judgedAt:{seq:1,hash:textDigest("FAKE resume head")}}).body};},accepted:async()=>({status:"unknown"}),settle:async()=>{settles++;return{ok:false};},refresh(){}});
    const store={load:async()=>record,save:async(next:typeof record)=>{writes++;record=next;}};
    const original=structuredClone(record);assert.equal((await dispatcher.check(store,record.envelope)).status,"unknown");assert.deepEqual(record,original);assert.deepEqual([posts,writes,settles],[0,0,1]);
    assert.equal((await dispatcher.run(store,record.envelope)).status,"refused");assert.equal(posts,1);assert.equal(activeAttempt(record.journal!).phase,"refused");assert.equal((await dispatcher.run(store,record.envelope)).status,"refused");assert.equal(posts,1);
  }finally{f.gateway.dispose();}
});
