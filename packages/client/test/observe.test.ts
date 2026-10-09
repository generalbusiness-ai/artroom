import { afterEach, expect, test, vi } from "vitest";
import type { Head, ScopeRef } from "@generalbusiness/artroom-contract";
import { base32, keyIdOfSecret, timeOf, utf8, type ByteStream } from "@generalbusiness/artroom-bytes";
import { Session } from "../src/session.ts";
import { headLines, openHttpHeadStream } from "../src/head-stream.ts";
import { observeScope, type CompleteSnapshot, type ObservationState } from "../src/observe.ts";
const gate=<T=void>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return{promise,resolve};};
const scope={scope:`sc_${base32(new Uint8Array(32))}`,inc:`in_${base32(new Uint8Array(16))}`,kind:"lane"} as ScopeRef;
const membership={...scope,kind:"membership"} as ScopeRef;const key=keyIdOfSecret(new Uint8Array(32));const definition="sha256:"+"1".repeat(64) as `sha256:${string}`;
const context={origin:"https://scope.test",scope,membership,definition,member:"@member" as const,key,deployment:"test"};
const head=(seq:number):Head=>({seq,hash:`sha256:${String(seq).padStart(64,"0")}`});
const session=()=>new Session("private-token",{v:1,deployment:"test",membership,member:"@member",key,reads:["summary"],ends:timeOf(Date.now()+60_000)});
const snapshot=(seq:number):CompleteSnapshot<number>=>({scope,definition,at:head(seq),value:seq});
function stream(){const queue:Uint8Array[]=[];let waiting:ReturnType<typeof gate<{done:boolean;value?:Uint8Array}>>|undefined;let cancelled=0;return{body:{getReader:()=>({read:()=>queue.length?Promise.resolve({done:false,value:queue.shift()!}):(waiting=gate()).promise,cancel:async()=>{cancelled++;waiting?.resolve({done:true});}})} as ByteStream,send(value:Uint8Array){if(waiting){const w=waiting;waiting=undefined;w.resolve({done:false,value});}else queue.push(value);},notice(seq:number){this.send(utf8(JSON.stringify({at:head(seq)})+"\n"));},end(){waiting?.resolve({done:true});},get cancelled(){return cancelled;}};}
afterEach(()=>vi.useRealTimers());
const drain=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};

test("head codec accepts fragmented frames but rejects oversized raw bytes, malformed UTF8 and truncated frames before yielding",async()=>{
 const body=stream(),abort=new AbortController(),lines=headLines(body.body,abort.signal);const first=lines.next();const bytes=utf8(JSON.stringify({at:head(1)})+"\n");body.send(bytes.slice(0,12));body.send(bytes.slice(12));expect((await first).value).toEqual(head(1));abort.abort();await lines.return(undefined);expect(body.cancelled).toBe(1);
 for(const bytes of[new Uint8Array(1025).fill(97),new Uint8Array([255,10]),utf8('{"at":')]){const broken=stream(),stop=new AbortController(),reading=headLines(broken.body,stop.signal).next();broken.send(bytes);await drain();if(bytes.length===6)broken.end();await expect(reading).rejects.toThrow();}
});

test("subscribe handshake precedes snapshot; newer notices during a read coalesce and publish useful retained data without regressing",async()=>{
 vi.useFakeTimers();
 const body=stream(),first=gate<ReturnType<typeof snapshot>>(),second=gate<ReturnType<typeof snapshot>>(),states:ObservationState<number>[]=[];let reads=0;const started=gate();
 const observer=observeScope({context,current:()=>true,authenticate:async()=>({ok:true,session:session()}),open:async()=>({ok:true,body:body.body}),snapshot:async()=>{reads++;started.resolve();const value=await(reads===1?first.promise:second.promise);return{ok:true,at:value.at,value,complete:true};},emit:s=>states.push(s)});
 await drain();expect(reads).toBe(0);body.notice(1);await started.promise;body.notice(2);body.notice(3);await drain();expect(reads).toBe(1);first.resolve(snapshot(1));await drain();
 expect(states.some(s=>s.status==="retained"&&s.snapshot.value===1&&s.reason==="newer-notice")).toBe(true);
 // The single coalesced reread starts after yielding once to the timer queue.
 await vi.advanceTimersByTimeAsync(0);expect(reads).toBe(2);second.resolve(snapshot(3));await drain();expect(states.at(-1)).toEqual({status:"current",snapshot:snapshot(3)});observer.cancel();await observer.done;expect(body.cancelled).toBe(1);
});

test("context cancellation rejects a late complete read and resolves despite an upstream reader ignoring cancel",async()=>{
 const read=gate<ReturnType<typeof snapshot>>(),reading=gate(),states:ObservationState<number>[]=[];let current=true;let cancelled=0;
 const body={getReader:()=>({read:()=>{if(cancelled===0){cancelled=-1;return Promise.resolve({done:false,value:utf8(JSON.stringify({at:head(1)})+"\n")});}return new Promise<{done:boolean}>(()=>{});},cancel:async()=>{cancelled=1;}})} as ByteStream;
 const observer=observeScope({context,current:()=>current,authenticate:async()=>({ok:true,session:session()}),open:async()=>({ok:true,body}),snapshot:async()=>{reading.resolve();const value=await read.promise;return{ok:true,at:value.at,value,complete:true};},emit:s=>states.push(s)});
 await reading.promise;const before=states.length;current=false;observer.refresh();observer.cancel();await observer.done;read.resolve(snapshot(2));await drain();expect(states).toHaveLength(before);expect(states.some(s=>s.status==="current")).toBe(false);expect(cancelled).toBe(1);
});

test("HTTP opener uses header custody and reports unsupported without binding or signed-read fallback",async()=>{
 let url="",authorization="";const opened=await openHttpHeadStream(context.origin,scope,session(),new AbortController().signal,{fetch:async(u,init)=>{url=u;authorization=init?.headers?.["authorization"]??"";return{status:404,body:null,headers:{get:()=>"application/json"},url:u,redirected:false};}});
 expect(opened).toEqual({ok:false,reason:"unsupported"});expect(url).toBe(`${context.origin}/v1/scopes/${scope.scope}/stream`);expect(url).not.toContain("token");expect(authorization).toBe("Session private-token");
});

test("EOF reconnects with new authentication and a complete current snapshot, then a denied renewal remains visible",async()=>{
 const first=stream(),second=stream(),states:ObservationState<number>[]=[];let auths=0,opens=0;const current1=gate(),current2=gate();
 const observer=observeScope({context,current:()=>true,authenticate:async()=>{auths++;return auths<3?{ok:true,session:session()}:{ok:false,reason:"unauthorized"};},open:async()=>({ok:true,body:++opens===1?first.body:second.body}),snapshot:async()=>{const value=snapshot(opens===1?1:5);return{ok:true,at:value.at,value,complete:true};},reconnectDelay:async()=>{},emit:s=>{states.push(s);if(s.status==="current")(s.snapshot.value===1?current1:current2).resolve();}});
 await drain();first.notice(1);await current1.promise;first.end();await drain();second.notice(5);await current2.promise;second.end();await observer.done;
 expect(auths).toBe(3);expect(opens).toBe(2);expect(states.at(-1)).toEqual({status:"forbidden",reason:"unauthorized",retained:snapshot(5)});expect(states.some(s=>s.status==="reconnecting")).toBe(true);
});

test("same sequence different hash and wrong snapshot incarnation are visible failures, never current views",async()=>{
 for(const changed of["hash","incarnation"]){const body=stream(),states:ObservationState<number>[]=[];const observer=observeScope({context,current:()=>true,authenticate:async()=>({ok:true,session:session()}),open:async()=>({ok:true,body:body.body}),snapshot:async()=>{const value=snapshot(1);if(changed==="hash")value.at={...value.at,hash:("sha256:"+"9".repeat(64)) as `sha256:${string}`};else value.scope={...scope,inc:`in_${base32(new Uint8Array(16).fill(1))}`};return{ok:true,at:value.at,value,complete:true};},emit:s=>states.push(s)});await drain();body.notice(1);await observer.done;expect(states.at(-1)?.status).toBe("error");expect(states.some(s=>s.status==="current")).toBe(false);}
});

test("first head waiting has a bound and cancels its body rather than waiting indefinitely",async()=>{
 vi.useFakeTimers();
 const body=stream(),states:ObservationState<number>[]=[];let observer:ReturnType<typeof observeScope<number>>;
 observer=observeScope<number>({context,current:()=>true,seconds:0.01,authenticate:async()=>({ok:true,session:session()}),open:async()=>({ok:true,body:body.body}),snapshot:async()=>{throw new Error("No head means no snapshot");},emit:s=>states.push(s),reconnectDelay:async()=>{observer.cancel();}});
 await drain();await vi.advanceTimersByTimeAsync(10);await observer.done;expect(states.some(s=>s.status==="unavailable"&&s.reason==="read-timeout")).toBe(true);expect(body.cancelled).toBe(1);
});


test("an old observer cannot clear a shared renderer after context switch, while explicit current cancellation emits once",async()=>{
 const body=stream(),pending=gate<ReturnType<typeof snapshot>>(),started=gate();let current=true;let rendered="old";let emits=0;
 const observer=observeScope({context,current:()=>current,authenticate:async()=>({ok:true,session:session()}),open:async()=>({ok:true,body:body.body}),snapshot:async()=>{started.resolve();const value=await pending.promise;return{ok:true,at:value.at,value,complete:true};},emit:state=>{emits++;rendered=state.status;}});
 await drain();body.notice(1);await started.promise;current=false;rendered="new-context-view";const before=emits;observer.cancel();await observer.done;pending.resolve(snapshot(2));await drain();expect(rendered).toBe("new-context-view");expect(emits).toBe(before);expect(body.cancelled).toBe(1);
 const statuses:ObservationState<number>[]=[];const second=observeScope<number>({context,current:()=>true,authenticate:async()=>({ok:true,session:session()}),open:async()=>({ok:false,reason:"unavailable"}),snapshot:async()=>{throw new Error("not reached");},emit:s=>statuses.push(s)});second.cancel();second.cancel();await second.done;expect(statuses.filter(s=>s.status==="cancelled")).toHaveLength(1);
});

test("HTTP stream opener requires exact response route, no redirect and native NDJSON media type before reading",async()=>{
 for(const variant of["html","redirected","wrong-url"]){let cancels=0,reads=0;let policy="";
  const body={getReader:()=>({read:async()=>{reads++;return{done:true};},cancel:async()=>{cancels++;}})} as ByteStream;
  const opened=await openHttpHeadStream(context.origin,scope,session(),new AbortController().signal,{fetch:async(url,init)=>{policy=init.redirect;return{status:200,body,headers:{get:()=>variant==="html"?"text/html":"application/x-ndjson"},url:variant==="wrong-url"?url+"/another":url,redirected:variant==="redirected"};}});
  expect(opened).toEqual({ok:false,reason:"unsupported"});expect(policy).toBe("error");expect(cancels).toBe(1);expect(reads).toBe(0);
 }
});

test("nonempty head floods yield after bounded task work and reject oversized concatenated chunks",async()=>{
 vi.useFakeTimers();const body=stream(),stop=new AbortController();let notices=0;const yielded=gate();const reading=(async()=>{for await(const _head of headLines(body.body,stop.signal)){notices++;if(notices===32)yielded.resolve();}})();
 body.send(utf8(Array.from({length:100},(_,i)=>JSON.stringify({at:head(i)})+"\n").join("")));await yielded.promise;await drain();expect(notices).toBe(32);
 stop.abort();await vi.advanceTimersByTimeAsync(0);await reading;expect(notices).toBe(32);expect(body.cancelled).toBe(1);
 const huge=stream(),abort=new AbortController(),first=headLines(huge.body,abort.signal).next();huge.send(new Uint8Array(65537));await expect(first).rejects.toThrow("chunk");expect(huge.cancelled).toBe(1);
});

test("EOF aborts the old attempt before a pending snapshot may paint current, and late open bodies are disposed without waiting",async()=>{
 const body=stream(),read=gate<ReturnType<typeof snapshot>>(),started=gate(),states:ObservationState<number>[]=[];let observer:ReturnType<typeof observeScope<number>>;
 observer=observeScope({context,current:()=>true,authenticate:async()=>({ok:true,session:session()}),open:async()=>({ok:true,body:body.body}),snapshot:async()=>{started.resolve();const value=await read.promise;return{ok:true,at:value.at,value,complete:true};},emit:s=>states.push(s),reconnectDelay:async()=>{observer.cancel();}});
 await drain();body.notice(1);await started.promise;body.end();read.resolve(snapshot(1));await observer.done;await drain();expect(states.some(s=>s.status==="current")).toBe(false);expect(body.cancelled).toBe(1);
 const opening=gate<{ok:true;body:ByteStream}>(),opened=gate();let cancels=0;const lateBody={getReader:()=>({read:async()=>({done:true}),cancel:()=>{cancels++;return new Promise(()=>{});}})}as ByteStream;
 const late=observeScope<number>({context,current:()=>true,authenticate:async()=>({ok:true,session:session()}),open:async()=>{opened.resolve();return opening.promise;},snapshot:async()=>{throw new Error("not reached");},emit:()=>{}});
 await opened.promise;late.cancel();await late.done;opening.resolve({ok:true,body:lateBody});await drain();expect(cancels).toBe(1);
});

test("expected deployment is verified before opening or reading the captured scope",async()=>{
 let opens=0;const states:ObservationState<number>[]=[];const observer=observeScope<number>({context:{...context,deployment:"another-trusted-deployment"},current:()=>true,authenticate:async()=>({ok:true,session:session()}),open:async()=>{opens++;return{ok:false,reason:"unavailable"};},snapshot:async()=>{throw new Error("not reached");},emit:s=>states.push(s)});await observer.done;expect(opens).toBe(0);expect(states.at(-1)).toEqual({status:"error",reason:"session-context-mismatch"});
});


test("same-turn abort before ignoring open resolution disposes its late body once without old-context paint or waiting for physical cancel",async()=>{
 const opening=gate<{ok:true;body:ByteStream}>(),started=gate();let current=true,cancels=0;const states:ObservationState<number>[]=[];
 const body={getReader:()=>({read:()=>new Promise<{done:boolean}>(()=>{}),cancel:()=>{cancels++;return new Promise(()=>{});}})}as ByteStream;
 const observer=observeScope<number>({context,current:()=>current,authenticate:async()=>({ok:true,session:session()}),open:()=>{started.resolve();return opening.promise;},snapshot:async()=>{throw new Error("not reached");},emit:s=>states.push(s)});
 await started.promise;const before=states.length;current=false;observer.cancel();opening.resolve({ok:true,body});
 await observer.done;await drain();expect(cancels).toBe(1);expect(states).toHaveLength(before);
});


test("refresh requested by a public completion callback is handed off when the occupied slot clears",async()=>{
 vi.useFakeTimers();const body=stream(),states:ObservationState<number>[]=[];let reads=0;let observer:ReturnType<typeof observeScope<number>>;
 observer=observeScope({context,current:()=>true,authenticate:async()=>({ok:true,session:session()}),open:async()=>({ok:true,body:body.body}),snapshot:async()=>{const value=snapshot(++reads);return{ok:true,at:value.at,value,complete:true};},emit:state=>{states.push(state);if(state.status==="current"&&state.snapshot.value===1)queueMicrotask(()=>observer.refresh());}});
 await drain();body.notice(1);await drain();await vi.advanceTimersByTimeAsync(0);await drain();expect(reads).toBe(2);expect(states.at(-1)).toEqual({status:"current",snapshot:snapshot(2)});observer.cancel();await observer.done;
});

test("synchronous reader cancellation failure cannot prevent local done when its pending read ignores shutdown",async()=>{
 let first=true,cancels=0;const started=gate(),states:ObservationState<number>[]=[];
 const body={getReader:()=>({read:()=>{if(first){first=false;return Promise.resolve({done:false,value:utf8(JSON.stringify({at:head(1)})+"\n")});}return new Promise<{done:boolean}>(()=>{});},cancel:()=>{cancels++;throw new Error("Upstream disposal unavailable");}})}as ByteStream;
 const observer=observeScope<number>({context,current:()=>true,authenticate:async()=>({ok:true,session:session()}),open:async()=>({ok:true,body}),snapshot:async()=>{started.resolve();return new Promise(()=>{});},emit:s=>states.push(s)});
 await started.promise;let done=false;void observer.done.then(()=>{done=true;});observer.cancel();await drain();expect(done).toBe(true);await observer.done;expect(cancels).toBe(1);expect(states.at(-1)).toEqual({status:"cancelled"});
});

test("a conflicting head notice at the retained snapshot sequence fails even when the previous notice is older",async()=>{
 const body=stream(),current=gate(),states:ObservationState<number>[]=[];let reads=0;
 const observer=observeScope({context,current:()=>true,authenticate:async()=>({ok:true,session:session()}),open:async()=>({ok:true,body:body.body}),snapshot:async()=>{reads++;const value=snapshot(reads===1?5:6);return{ok:true,at:value.at,value,complete:true};},emit:state=>{states.push(state);if(state.status==="current")current.resolve();}});
 await drain();body.notice(1);await current.promise;body.send(utf8(JSON.stringify({at:{seq:5,hash:"sha256:"+"9".repeat(64)}})+"\n"));await observer.done;expect(reads).toBe(1);expect(states.at(-1)).toEqual({status:"error",reason:"head-hash-conflict",retained:snapshot(5)});
});


test("a conflicting FIRST reconnect head cannot be hidden by an offered newer snapshot",async()=>{
 const first=stream(),second=stream(),initial=gate(),reopened=gate();const states:ObservationState<number>[]=[];let opens=0,reads=0;
 const observer=observeScope({context,current:()=>true,authenticate:async()=>({ok:true,session:session()}),open:async()=>{opens++;if(opens===2)reopened.resolve();return{ok:true,body:opens===1?first.body:second.body};},snapshot:async()=>{const value=snapshot(++reads===1?5:6);return{ok:true,at:value.at,value,complete:true};},emit:state=>{states.push(state);if(state.status==="current")initial.resolve();},reconnectDelay:async()=>{}});
 await drain();first.notice(1);await initial.promise;first.end();await reopened.promise;
 second.send(utf8(JSON.stringify({at:{seq:5,hash:"sha256:"+"9".repeat(64)}})+"\n"));await observer.done;
 expect(reads).toBe(1);expect(states.filter(state=>state.status==="current")).toHaveLength(1);expect(states.at(-1)).toEqual({status:"error",reason:"head-hash-conflict",retained:snapshot(5)});expect(second.cancelled).toBe(1);
});
