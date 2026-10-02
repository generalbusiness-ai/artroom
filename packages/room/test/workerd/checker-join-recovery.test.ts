import {expect,it} from "vitest";
import {exports} from "cloudflare:workers";
import {evictDurableObject} from "cloudflare:test";
import {generateSigner,join,artroomError,isRefusal} from "@generalbusiness/artroom-client";
import type {ArtroomService,Joined,RosterRecord,RoomWire} from "@generalbusiness/artroom-contract";
import {b64url,clock,day,digestBytes,iso,makeRoom,randomBytes,call} from "./support.ts";

async function invitation(r:Awaited<ReturnType<typeof makeRoom>>,member:`@${string}`){
 const bytes=randomBytes(32);
 const inv=await r.admin.ok<RosterRecord>("roster",null,{op:"invite",member,role:"member",custody:"client",expiresAt:iso(clock.now+day),secretHash:digestBytes(bytes)});
 return {invitation:inv.id,secret:b64url(bytes)};
}

it("checker: actual Room RPC recovers a lost client join after eviction only with the joining key",async()=>{
 clock.now=Date.now();const r=await makeRoom();const inv=await invitation(r,"@checker-rpc");const {signer}=await generateSigner();
 let redemptions=0,submissions=0,requests=0;
 const service={room:async()=>{
  const wire=await (exports.default as unknown as ArtroomService).room(r.id);
  return {
   redeem:async(x:Parameters<RoomWire['redeem']>[0])=>{
    const out=await wire.redeem(x);redemptions++;
    if(redemptions===1){await evictDurableObject(r.stub);throw artroomError("unavailable","checker dropped reply",{retryAfterMs:1,maybeRecorded:true});}
    return out;
   },
   submit:async(x:Parameters<RoomWire['submit']>[0])=>{submissions++;return wire.submit(x);},
   request:async(x:Parameters<RoomWire['request']>[0])=>{requests++;return wire.request(x);},
   read:(...args:any[]) => (wire.read as any)(...args),subscribe:(...args:any[]) => (wire.subscribe as any)(...args),[Symbol.dispose]:()=>wire[Symbol.dispose]()
  };
 }} as unknown as ArtroomService;
 const out=await join(service,r.id,{...inv,signer},{retries:1});
 expect(isRefusal(out)).toBe(false);const joined=out as Joined;
 expect([redemptions,submissions,requests]).toEqual([2,1,1]);
 expect(joined.key).toBe(signer.key);expect(joined.member).toBe("@checker-rpc");expect(joined.session.member).toBe("@checker-rpc");
 const members=await call(r.stub.read(joined.session.token,{q:"members"}));
 expect((members as {members:{handle:string}[]}).members.some(m=>m.handle==="@checker-rpc")).toBe(true);
 const log=await r.admin.read({q:"log",req:{limit:500}});
 const joins=log.acts.filter(e=>e.entry.type==="act"&&(e.entry.act.envelope.body as {op?:string}).op==="join");
 expect(joins).toHaveLength(1);
});

it("checker: actual Room HTTPS recovers a dropped join reply and the recovered session reads the Room",async()=>{
 clock.now=Date.now();const r=await makeRoom();const inv=await invitation(r,"@checker-http");const {signer}=await generateSigner();
 let redemptions=0;
 const fetcher:typeof fetch=async(input,init)=>{
  const response=await exports.default.fetch(input,init);
  if(String(input).endsWith('/redeem')&&++redemptions===1)throw new TypeError("checker dropped HTTPS reply");
  return response;
 };
 const out=await join({url:"https://artroom.test"},r.id,{...inv,signer},{fetch:fetcher,retries:1});
 expect(isRefusal(out)).toBe(false);const joined=out as Joined;
 expect(redemptions).toBe(2);expect(joined.key).toBe(signer.key);expect(joined.session.member).toBe("@checker-http");
 const members=await call(r.stub.read(joined.session.token,{q:"members"}));
 expect((members as {members:{handle:string}[]}).members.some(m=>m.handle==="@checker-http")).toBe(true);
});

it("checker: join recovery honors the supplied client clock for its signed session request",async()=>{
 clock.now=Date.now()-day;
 const r=await makeRoom();const inv=await invitation(r,"@checker-clock");const {signer}=await generateSigner();
 let redemptions=0;
 const fetcher:typeof fetch=async(input,init)=>{
  const response=await exports.default.fetch(input,init);
  if(String(input).endsWith('/redeem')&&++redemptions===1)throw new TypeError("checker dropped HTTPS reply");
  return response;
 };
 const out=await join({url:"https://artroom.test"},r.id,{...inv,signer},{fetch:fetcher,retries:1,now:()=>clock.now});
 expect(isRefusal(out)).toBe(false);expect((out as Joined).session.member).toBe("@checker-clock");
 expect(redemptions).toBe(2);
});
