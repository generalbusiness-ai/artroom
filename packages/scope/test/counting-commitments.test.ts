import { runDurableObjectAlarm } from "cloudflare:test";
import { expect, test } from "vitest";
import type { Answer, FieldValue, Intent, Item, Read, ScopeId, Seed, SignedIntent, SignedReadName } from "@generalbusiness/artroom-contract";
import { b64url, canonicalize, intentDigest, isSeed, scopeIdOf, seedDigest, signIntent, textDigest, timeMs } from "@generalbusiness/artroom-bytes";
import { requestSession, secretSigner, sessionRequest, signedReader, type Fetch } from "@generalbusiness/artroom-client";
import { keys, type Actor } from "@generalbusiness/artroom-derive/testing";
import { COUNTING_COHORT, FIRST_ACTIONS_OF, platform, repositoryName } from "@generalbusiness/artroom-platform";
import { httpSource, verify } from "@generalbusiness/artroom-replay";
import { countingCommitments } from "../../../examples/counting/commitments.ts";
import { COUNTING_COMMITMENTS_DEFINITION } from "../../../examples/counting/commitments-pin.ts";
import { NO_OUTSIDE } from "../src/index.ts";
import { soon } from "./net.ts";
import { outsideOf } from "./outside.ts";
import { Platform, rita, routed } from "./repository.ts";
import { beginSessionFixture } from "./session-settings.ts";
import { dispatchFixture, effectFixture, nativeFixtureLifetime } from "./support/native-fixture-lifetime.ts";

const SERVICE = "https://scopes.test";

// Real native factory, R6/D6/M5, enrollment, membership authority, C1 evaluator,
// SQLite, HTTP sessions and replay, with one admin person and two independently enrolled agents.
// Git-host answers and the monotonic clock are
// labelled stand-ins. No inspector, fabricated grant, child founding or speech:
// a refused competitor has no native pledge; physical silence is a browser duty.
test("native Counting admits one competing pledge, fulfills its exact holder, applies current activity and fairness, then expires board before promise and resets without losing proven history", async () => {
  const owner=beginSessionFixture({secret:b64url(crypto.getRandomValues(new Uint8Array(32))),sessions:true,inspector:null});
  const lifetime=nativeFixtureLifetime(owner),fetch:Fetch=(url,init)=>lifetime.wait(()=>routed(url,init));
  // The bootstrap uses actual signed birth-chain reads, never the fixture inspector.
  // Later reads use the founder's real requested membership session.
  class Native extends Platform {
    reader:string|null=null;
    constructor(name:ScopeId,readonly signer:Actor=rita){super(name);}
    override get stub(){
      lifetime.active();const target=super.stub;
      return new Proxy(target,{get(source,key){const value:unknown=Reflect.get(source,key,source);return typeof value==="function"?(...args:unknown[])=>lifetime.wait(()=>Promise.resolve(Reflect.apply(value,source,args))):value;}});
    }
    async header(read:SignedReadName,arg:string){return this.reader??lifetime.wait(()=>signedReader(secretSigner(this.signer.secret),this.name,read,arg,{now:()=>lifetime.now()}));}
    override async summary():ReturnType<Platform["summary"]>{const read=await this.stub.summary(await this.header("summary","summary"));expect(read.ok).toBe(true);if(!read.ok)throw new Error("Native bootstrap summary was refused.");return read;}
    override async sealed():ReturnType<Platform["sealed"]>{const read=await this.stub.history(await this.header("history","0"));expect(read.ok).toBe(true);if(!read.ok)throw new Error("Native bootstrap history was refused.");return read.value;}
    override async created(seq:number,n=0):Promise<Native>{const send=(await this.entries())[seq]?.sends.find(s=>s.n===n);if(!send||!isSeed(send.to))throw new Error("Native creation must supply its actual seed.");return new Native(scopeIdOf(send.to));}
    override restart(){return lifetime.wait(()=>super.restart());}
  }
  const settle=(...nodes:Native[])=>dispatchFixture(nodes,lifetime.wait);
  try {
    const install:Intent={v:1,to:null,actor:keys.paul.key,kind:"install",on:null,expected:{},fields:{host:"git.example",namespace:"counter-native",policy:"keys",founders:[rita.key]},idempotencyKey:crypto.randomUUID(),notAfter:soon(60)};
    const R=new Native(scopeIdOf({v:1,kind:"register",definition:COUNTING_COHORT.register,creator:null,cause:intentDigest(install),ordinal:0}),keys.paul);
    const host=outsideOf(R.name);
    lifetime.wire(R.name,()=>({outside:{accepts:()=>{lifetime.active();return host.accepts();},send:request=>lifetime.wait(()=>host.send(request)),late:deliver=>{lifetime.active();host.late(deliver);}}}));
    expect(await R.stub.found(signIntent(install,keys.paul.secret),COUNTING_COHORT.register)).toMatchObject({answer:"accepted"});
    const claim=await R.intent(rita,"found",{expected:await R.expected({register:0}),fields:{branch:"main",founderHandle:"@rita",recoveryKey:keys.sam.key}});
    const seed:Seed={v:1,kind:"directory",definition:COUNTING_COHORT.directory,creator:await R.at(),cause:intentDigest(claim.intent),ordinal:0};
    const D=new Native(scopeIdOf(seed));
    lifetime.active();host.answer("1:0",1,{result:"confirmed",evidence:{basis:"own-answer",body:{name:repositoryName(seedDigest(seed),1),id:"counter-native-fixture"}}});
    expect(await R.stub.submit(claim,[])).toMatchObject({answer:"accepted"});await effectFixture([R],lifetime.wait);await settle(R,D);
    const sends=(await D.entries())[0]!.sends;
    const child=(kind:Seed["kind"])=>{const send=sends.find(s=>isSeed(s.to)&&s.to.kind===kind);if(!send||!isSeed(send.to))throw new Error("Native directory child was not created.");return new Native(scopeIdOf(send.to));};
    const M=child("membership"),Q=child("rules"),G=child("destination");await settle(R,D,M,Q,G);
    expect([(await D.summary()).value.definition,(await M.summary()).value.definition,(await Q.summary()).value.definition,(await G.summary()).value.definition]).toEqual([COUNTING_COHORT.directory,COUNTING_COHORT.membership,COUNTING_COHORT.rules,COUNTING_COHORT.destination]);
    const seat=await M.did(rita,"seat",{expected:await M.expected({roster:0})});
    await M.did(rita,"first-key",{fields:{member:seat},expected:await M.expected({roster:0,member:seat})});
    const membership=await M.at();
    for(const [who,handle] of [[keys.una,"@una"],[keys.vic,"@vic"]] as const){
      const secret=`native-counter-${handle}-invitation-secret-of-at-least-32-bytes`;
      const member=await M.did(rita,"add-member",{fields:{handle,kind:"agent",controller:{membership,member:"@rita"}}});
      const invitation=await M.did(rita,"invite-key",{fields:{member,kind:"agent",inviteHash:textDigest(secret),inviteEnds:soon(60)},expected:await M.expected({member})});
      await M.did(who,"enrol",{on:0,fields:{invitation,secret},expected:await M.expected({on:0,member})});
      expect(await M.item(member)).toMatchObject({state:"active",values:{kind:"agent",role:"agent"},parties:{controller:{membership,member:"@rita"}}});
      expect((await M.summary()).value.items.find(i=>i.type==="key"&&i.values["id"]===who.key)).toMatchObject({state:"active",values:{kind:"agent"},refs:{member}});
    }
    const bytes=canonicalize(countingCommitments);
    expect(await Q.stub.submit(await Q.intent(rita,"activate",{fields:{digest:COUNTING_COMMITMENTS_DEFINITION,name:countingCommitments.name}}),[],{values:[bytes]})).toMatchObject({answer:"accepted"});
    const application=await D.intent(rita,"establish-application",{expected:await D.expected({repository:0}),fields:{definition:COUNTING_COMMITMENTS_DEFINITION,values:'{"target":2}',execution:"recorded-do"}});
    const established=await D.stub.submit(application,[],{values:[bytes]});expect(established.answer).toBe("accepted");if(established.answer!=="accepted")throw new Error("Native application factory was refused.");
    const creation=established.receipt.fact.seq;
    const C=await D.created(creation);lifetime.outside(C.name,()=>NO_OUTSIDE);await settle(D,C);
    expect((await C.summary()).value.definition).toBe(COUNTING_COMMITMENTS_DEFINITION);
    // The factory's admission of genesis grants no domain control by implication.
    expect(await C.act(rita,"initialize",{expected:await C.expected({configuration:0})})).toMatchObject({answer:"refused",reason:"unauthorized"});
    const domain=["counting.participate","counting.activity","counting.commit","counting.fulfill","counting.fail"];
    for(const role of ["admin","agent"] as const)await M.did(rita,"set-actions",{on:0,expected:await M.expected({on:0}),fields:{role,actions:[...FIRST_ACTIONS_OF[COUNTING_COHORT.membership]![role],...domain,...(role==="admin"?["counting.control"]:[])]}});
    lifetime.advance(301000); // End the previous native authority reuse window, without a revocation claim.
    const readers=new Map<Actor,string>();
    for(const who of [rita,keys.una,keys.vic]){
      const issued=await lifetime.wait(()=>requestSession(SERVICE,M.name,sessionRequest(membership,who.secret,soon(60),crypto.randomUUID()),{fetch}));
      expect(issued.ok).toBe(true);if(!issued.ok)throw new Error("Native enrolled member session was refused.");
      expect([issued.session.claims.membership,issued.session.claims.key,issued.session.claims.member]).toEqual([membership,who.key,who===rita?"@rita":who===keys.una?"@una":"@vic"]);readers.set(who,issued.session.reader());
    }
    M.reader=readers.get(rita)!;D.reader=M.reader;C.reader=M.reader;
    const submit=async(signed:SignedIntent,who:Actor):Promise<Answer>=>{
      const response=await fetch(`${SERVICE}/v1/scopes/${C.name}/acts`,{method:"POST",headers:{"content-type":"application/json",authorization:readers.get(who)!},body:JSON.stringify({signed,grants:[]})});
      return await response.json() as Answer;
    };
    const act=async(who:Actor,kind:string,on:number|null=null,fields:Record<string,FieldValue>={},also:Record<string,number>={})=>submit(await C.intent(who,kind,{on,fields,expected:await C.expected({...(on===null?{}:{on}),...also})}),who);
    const wrote=async(answer:Promise<Answer>)=>{const value=await answer;expect(value.answer).toBe("accepted");if(value.answer!=="accepted")throw new Error("Native Counting act was not admitted.");return value.receipt.fact.seq;};
    const board=async()=>(await C.summary()).value.items.find(i=>i.type==="board")!;
    const current=async()=>(await C.summary()).value.items.find(i=>i.type==="promise"&&i.state==="pledged")!;
    const claimFields=async(participant:number)=>{const summary=(await C.summary()).value,b=summary.items.find(i=>i.type==="board")!;return{participant,generation:b.values["generation"]!,serial:Number(b.values["serial"])+1,n:Number(b.values["lastNumber"])+1,basis:summary.items.filter(i=>i.type==="participant"&&i.state==="active").map(i=>({id:i.id,member:i.parties["agent"] as FieldValue}))};};
    const resolution=(p:Item)=>({generation:p.values["generation"]!,serial:p.values["serial"]!,n:p.values["n"]!});
    const b=await wrote(act(rita,"initialize",null,{}, {configuration:0}));
    const participants=new Map<Actor,number>();for(const who of [rita,keys.una,keys.vic])participants.set(who,await wrote(act(who,"participate")));
    for(const who of [keys.una,keys.vic])await wrote(act(who,"activate",participants.get(who)!));
    await wrote(act(rita,"start",b));
    // Both independently signed requests retain the same observed board revision.
    const claims=await Promise.all([keys.una,keys.vic].map(async who=>C.intent(who,"commit",{fields:await claimFields(participants.get(who)!),expected:await C.expected({board:b,participant:participants.get(who)!})})));
    const answers=await Promise.all(claims.map((signed,i)=>submit(signed,[keys.una,keys.vic][i]!)));
    expect(answers.map(a=>a.answer).sort()).toEqual(["accepted","refused"]);
    const holder=answers[0]!.answer==="accepted"?keys.una:keys.vic,loser=holder===keys.una?keys.vic:keys.una;
    const first=await current();expect([first.parties["agent"],first.refs["participant"],first.refs["admittedAt"],(await board()).refs["pledge"],(await board()).values["lastNumber"]]).toEqual([{membership,member:holder===keys.una?"@una":"@vic"},participants.get(holder),first.id,first.id,0]);
    expect((await C.entries()).filter(e=>e.input.type==="act"&&e.input.signed.intent.kind==="commit")).toHaveLength(1);
    expect(await act(loser,"fulfill",first.id,resolution(first),{board:b})).toMatchObject({answer:"refused"});
    expect(await act(holder,"fulfill",first.id,{...resolution(first),serial:Number(first.values["serial"])+1},{board:b})).toMatchObject({answer:"refused"});
    await wrote(act(holder,"fulfill",first.id,resolution(first),{board:b}));expect((await board()).values["lastNumber"]).toBe(1);
    await wrote(act(rita,"activate",participants.get(rita)!));
    expect(await act(holder,"commit",null,await claimFields(participants.get(holder)!),{board:b,participant:participants.get(holder)!})).toMatchObject({answer:"refused"});
    await wrote(act(loser,"commit",null,await claimFields(participants.get(loser)!),{board:b,participant:participants.get(loser)!}));
    const second=await current();expect((second.values["basis"] as readonly FieldValue[]).length).toBe(3);
    expect(await act(rita,"reset",b,{generation:1})).toMatchObject({answer:"refused"});
    expect(await act(loser,"cancel",second.id,resolution(second),{board:b})).toMatchObject({answer:"refused"});
    await wrote(act(rita,"cancel",second.id,resolution(second),{board:b}));expect((await board()).state).toBe("paused");
    await wrote(act(rita,"start",b));await wrote(act(loser,"commit",null,await claimFields(participants.get(loser)!),{board:b,participant:participants.get(loser)!}));
    const expiring=await current();expect(timeMs(expiring.values["until"])!-lifetime.now()).toBe(30000);
    const beforeExpiry=(await C.summary()).at.seq;lifetime.advance(30000);
    expect(await lifetime.wait(()=>runDurableObjectAlarm(C.object))).toBe(true);
    const timed=(await C.entries()).filter(e=>e.seq>beforeExpiry&&e.input.type==="timed").map(e=>e.input);
    expect(timed).toEqual([{type:"timed",item:b,rule:"commitment-expired",due:expiring.values["until"]},{type:"timed",item:expiring.id,rule:"promise-expired",due:expiring.values["until"]}]);
    expect([(await board()).state,(await board()).values["lastNumber"],(await board()).refs["pledge"]]).toEqual(["paused",1,null]);
    const promises=await lifetime.wait(()=>(C.stub as unknown as {items(reader:unknown,type:string):Promise<Read<readonly Item[]>>}).items(C.reader,"promise"));
    expect(promises.ok&&promises.value.find(p=>p.id===expiring.id)?.state).toBe("expired");
    await wrote(act(rita,"reset",b,{generation:1}));await C.restart();
    expect([(await board()).state,(await board()).values["generation"],(await board()).values["serial"],(await board()).values["lastNumber"]]).toEqual(["paused",1,0,0]);
    await wrote(act(rita,"start",b));
    await wrote(act(holder,"commit",null,await claimFields(participants.get(holder)!),{board:b,participant:participants.get(holder)!}));
    const failed=await current();
    await wrote(act(holder,"fail",failed.id,{...resolution(failed),reason:"process-error"},{board:b}));
    expect([(await board()).state,(await board()).values["lastNumber"],(await board()).refs["pledge"]]).toEqual(["paused",0,null]);
    const failures=await lifetime.wait(()=>(C.stub as unknown as {items(reader:unknown,type:string):Promise<Read<readonly Item[]>>}).items(C.reader,"promise"));
    expect(failures.ok&&failures.value.find(p=>p.id===failed.id)).toMatchObject({state:"failed",values:{reason:"process-error",n:1}});
    const removed=participants.get(holder)!;
    await wrote(act(holder,"deactivate",removed));
    await wrote(act(rita,"force-deactivate",participants.get(loser)!,{}, {configuration:0}));
    await wrote(act(rita,"remove-participant",removed,{}, {configuration:0}));
    const history=await lifetime.wait(()=>(C.stub as unknown as {items(reader:unknown,type:string):Promise<Read<readonly Item[]>>}).items(C.reader,"participant"));
    expect(history.ok&&history.value.find(p=>p.id===removed)?.state).toBe("removed");
    const replacement=await wrote(act(holder,"participate"));expect(replacement).not.toBe(removed);participants.set(holder,replacement);
    await wrote(act(holder,"activate",replacement));await wrote(act(loser,"activate",participants.get(loser)!));
    expect((await C.summary()).value.items.filter(i=>i.type==="participant"&&i.state==="active").map(i=>i.id)).toEqual([...participants.values()].sort((a,b)=>a-b));
    await wrote(act(rita,"start",b));await wrote(act(rita,"pause",b));expect((await board()).state).toBe("paused");await wrote(act(rita,"start",b));
    for(const who of [holder,loser]){await wrote(act(who,"commit",null,await claimFields(participants.get(who)!),{board:b,participant:participants.get(who)!}));const p=await current();await wrote(act(who,"fulfill",p.id,resolution(p),{board:b}));}
    expect([(await board()).state,(await board()).values["lastNumber"]]).toEqual(["finished",2]);
    const kinds=(await C.entries()).flatMap(e=>e.input.type==="act"?[e.input.signed.intent.kind]:[]);
    expect([...new Set(kinds)].sort()).toEqual(["initialize","participate","activate","deactivate","force-deactivate","remove-participant","start","commit","fulfill","fail","cancel","pause","reset"].sort());
    expect((await C.entries()).filter(e=>e.input.type==="act"&&e.input.signed.intent.kind==="commit").every(e=>e.input.type==="act"&&e.input.authority.some(g=>g.actions.includes("counting.commit")))).toBe(true);
    expect((await fetch(`${SERVICE}/v1/scopes/${C.name}`)).status).toBe(403);
    for(const who of [rita,keys.una,keys.vic])expect((await fetch(`${SERVICE}/v1/scopes/${C.name}`,{headers:{authorization:readers.get(who)!}})).status).toBe(200);
    const head=(await C.summary()).at;
    const replay=await lifetime.wait(()=>verify(httpSource(SERVICE,{fetch,reader:C.reader!}),{mode:"replay",platform,grants:"proven",scope:C.name,head}));
    expect([replay.report.result,replay.why]).toEqual(["consistent",null]);
  } finally {lifetime.release();}
});
