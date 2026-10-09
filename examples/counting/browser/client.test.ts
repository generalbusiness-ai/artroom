// Real SDK/W1 gateway over FAKE HTTP/session/history and memory custody; no native admission or audio.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Item, ScopeRef, Summary } from "@generalbusiness/artroom-contract";
import { canonicalize, keyIdOfSecret, newIncarnation, scopeIdOf, textDigest } from "@generalbusiness/artroom-bytes";
import type { Fetch, HeadStreamFetch } from "@generalbusiness/artroom-client";
import { COUNTING_DEFINITION } from "../pin.ts";
import { nativeGateway, type CommandStore } from "./client.ts";
import type { ActorIdentity } from "./voice-controller.ts";

async function fixture(joined:boolean) {
  const secret=new Uint8Array(32).fill(51),definition=COUNTING_DEFINITION;
  const ref=(kind:ScopeRef["kind"]):ScopeRef=>({scope:scopeIdOf({v:1,kind,definition,creator:null,cause:textDigest(`FAKE gateway ${kind}`),ordinal:0}),inc:newIncarnation(new Uint8Array(16).fill(8)),kind});
  const scope=ref("lane"),membership=ref("membership"),member={membership,member:"@ada" as const};
  const identity:ActorIdentity={origin:"https://gateway-fake.test",deployment:"FAKE gateway",scope,definition,membership,member,publicKey:keyIdOfSecret(secret)};
  const item=(type:string,id:number,state:string,values:Item["values"],parties:Item["parties"]):Item=>({type,id,state,revision:1,opened:null,values,parties,refs:{},attributed:[]});
  const summary:Summary={scope,status:"active",definition,time:new Date().toISOString(),counts:[],items:[
    item("configuration",0,"ready",{target:3},{controller:member}),
    item("board",1,"paused",{target:3,generation:0,serial:0,lastNumber:0,number:null,until:null},{controller:member,speaker:null,lastSpeaker:null}),
    ...(joined?[item("participant",2,"joined",{}, {agent:member})]:[]),
  ]};
  const head={seq:1,hash:textDigest("FAKE head")};let held:Awaited<ReturnType<CommandStore["load"]>>=null,posts=0,settles=0,saves=0,clears=0;
  const commands:CommandStore={load:async()=>held,save:async value=>{held=structuredClone(value);saves++;},clear:async()=>{held=null;clears++;}};
  const fake:Fetch=async(url,init)=>{
    const path=new URL(url).pathname;
    if(path.endsWith("/sessions")){const request=JSON.parse(init?.body??"{}").request;return Response.json({ok:true,token:"FAKE token",session:{v:1,deployment:identity.deployment,membership,member:member.member,key:identity.publicKey,reads:["summary","entry"],ends:request.notAfter}});}
    if(path.endsWith("/acts")){posts++;assert.ok(held,"exact signed custody must exist before POST");const submitted=JSON.parse(init?.body??"{}");assert.equal(canonicalize(submitted.signed),canonicalize(held.envelope.signed));return Response.json({answer:"refused",reason:"guard-failed",judgedAt:head});}
    if(path.endsWith("/settle")){settles++;return Response.json({ok:false,reason:"not-found"});}
    return Response.json({ok:true,at:head,complete:true,value:summary});
  };
  const stream:HeadStreamFetch=async(url,init)=>{assert.equal(init.redirect,"error");return{status:200,url,redirected:false,headers:new Headers({"content-type":"application/x-ndjson"}),body:new ReadableStream<Uint8Array>({start(c){c.enqueue(new TextEncoder().encode(JSON.stringify({at:head})+"\n"));}})};};
  const gateway=nativeGateway(identity,secret,{current:()=>true,lock:{run:async work=>work()},voiceStore:{load:async()=>null,save:async()=>{throw new Error("unused fake voice");},clear:async()=>{}},commandStore:commands,fetch:fake,headFetch:stream});
  await new Promise<void>((resolve,reject)=>gateway.observe(state=>{if(state.status==="current")resolve();else if(["error","forbidden","unsupported"].includes(state.status))reject(new Error(`Fake gateway setup ${state.status}`));}));
  return{gateway,counters:()=>({posts,settles,saves,clears}),retained:()=>held?canonicalize(held):null};
}

test("FAKE unbound refusal retains original custody and blocks a new command/signature",async()=>{
  const f=await fixture(true);try{
    assert.equal((await f.gateway.command("start")).status,"unknown");
    const original=f.retained();assert.ok(original);assert.equal(f.gateway.pendingCommand(),"start");
    assert.equal((await f.gateway.command("start")).status,"unknown");assert.equal(f.retained(),original);
    assert.equal((await f.gateway.checkCommand())?.status,"unknown");assert.equal(f.retained(),original);
    assert.deepEqual(f.counters(),{posts:1,settles:1,saves:1,clears:0});
  }finally{f.gateway.dispose();}
});

test("FAKE locally unavailable candidate is BLOCKED before signature, custody or POST",async()=>{
  const f=await fixture(false);try{
    assert.equal((await f.gateway.command("start")).status,"blocked");
    assert.equal(f.retained(),null);assert.equal(f.gateway.pendingCommand(),null);
    assert.deepEqual(f.counters(),{posts:0,settles:0,saves:0,clears:0});
  }finally{f.gateway.dispose();}
});
