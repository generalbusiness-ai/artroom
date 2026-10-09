/** One authenticated scope observation. Invalidation notices never settle pending commands or prove current authority. */
import type { Digest, Head, KeyId, MemberId, PlatformDefinition, Read, ScopeRef, SessionRefusal, Summary } from "@generalbusiness/artroom-contract";
import { canonicalize, isHead, isScopeRef, timeMs, timeOf, type Expiry } from "@generalbusiness/artroom-bytes";
import type { Session } from "./session.ts";
import { headLines, observationOrigin, type HeadBodyResult } from "./head-stream.ts";

export interface ObservationContext { origin: string; scope: ScopeRef; definition: Digest | PlatformDefinition; membership: ScopeRef; member: MemberId; key: KeyId; deployment: string }
/** Adapter result from actual complete authenticated reads, not a new native wire/proof. */
export interface CompleteSnapshot<T> { scope: ScopeRef; definition: Digest | PlatformDefinition; at: Head; value: T }
export type ObservationState<T> =
  | { status: "connecting" | "refreshing" | "reconnecting"; retained?: CompleteSnapshot<T> }
  | { status: "current"; snapshot: CompleteSnapshot<T> }
  | { status: "retained"; snapshot: CompleteSnapshot<T>; reason: "newer-notice" | "older-snapshot" | "subscription-ended" }
  | { status: "unavailable" | "forbidden" | "expired" | "unsupported" | "error"; reason: string; retained?: CompleteSnapshot<T> }
  | { status: "cancelled" };
export interface ObservationOptions<T> {
  context: ObservationContext; current(): boolean;
  authenticate(signal: Expiry): Promise<{ ok: true; session: Session } | { ok: false; reason: SessionRefusal | "unavailable" | "unsupported" }>;
  snapshot(session: Session, signal: Expiry): Promise<Read<CompleteSnapshot<T>>>;
  open(session: Session, signal: Expiry): Promise<HeadBodyResult>;
  emit(state: ObservationState<T>): void;
  /** Bounds reauthentication, stream handshake and one complete snapshot. */
  seconds?: number; now?: () => number;
  reconnectDelay?(attempt: number, signal: Expiry): Promise<void>;
}
export interface Observation { refresh(): void; cancel(): void; done: Promise<void> }
/** Wrap an actual authenticated Summary read without synthesizing a head or native proof. */
export function completeSummary(read: Read<Summary>): Read<CompleteSnapshot<Summary>> {
  if (!read.ok) return read;
  return { ...read, value: { scope: read.value.scope, definition: read.value.definition, at: read.at, value: read.value } };
}

const same = (a: unknown,b: unknown) => canonicalize(a)===canonicalize(b);
class Stopped extends Error {}
class ObservationFailure extends Error { constructor(readonly status: "unavailable"|"forbidden"|"expired"|"unsupported"|"error",readonly reason:string){super(reason);} }

/** Callback expiry raced locally as existing takeBytes does; ignoring transports cannot repaint late data. */
async function bounded<T>(run:(signal:Expiry)=>Promise<T>, parent:Expiry, seconds:number, dispose?:(value:T)=>void):Promise<T>{
  const own=new AbortController();let stopped!:()=>void;let abandoned=false;
  const abort=new Promise<never>((_resolve,reject)=>{stopped=()=>{abandoned=true;own.abort();reject(new Stopped());};});
  parent.addEventListener("abort",stopped);let timeout:ReturnType<typeof setTimeout>|undefined;
  const elapsed=new Promise<never>((_resolve,reject)=>{timeout=setTimeout(()=>{abandoned=true;own.abort();reject(new ObservationFailure("unavailable","read-timeout"));},seconds*1000);});
  try{if(parent.aborted)throw new Stopped();const pending = run(own.signal);void pending.then(value=>{if(abandoned)dispose?.(value);},()=>undefined);return await Promise.race([pending,abort,elapsed]);}
  catch(error){abandoned=true;throw error;}
  finally{parent.removeEventListener("abort",stopped);clearTimeout(timeout);}
}
function delay(milliseconds:number,signal:Expiry):Promise<void>{return new Promise((resolve,reject)=>{let timer:ReturnType<typeof setTimeout>|undefined;const stop=()=>{clearTimeout(timer);signal.removeEventListener("abort",stop);reject(new Stopped());};signal.addEventListener("abort",stop);if(signal.aborted)return stop();timer=setTimeout(()=>{signal.removeEventListener("abort",stop);resolve();},milliseconds);});}

export function observeScope<T>(options:ObservationOptions<T>):Observation{
  const context=JSON.parse(canonicalize(options.context)) as ObservationContext;
  Object.freeze(context.scope);Object.freeze(context.membership);Object.freeze(context);
  const seconds=options.seconds??30;if(!Number.isFinite(seconds)||seconds<=0||seconds>300)throw new RangeError("An observation read bound is more than zero and at most300seconds.");
  if(!observationOrigin(context.origin)||!isScopeRef(context.scope)||!isScopeRef(context.membership)||typeof context.deployment!=="string"||!context.deployment||context.deployment.length>128)throw new Error("Observation needs an exact origin and full native references.");
  const lifetime=new AbortController();let attempt:AbortController|undefined;let last:CompleteSnapshot<T>|undefined;let latest:Head|undefined;let dirty=false;let refreshRunning=false;let refreshAgain:(()=>void)|undefined;let generation=0;let cancelled=false;
  const now=options.now??Date.now;
  const usable=()=>!lifetime.signal.aborted&&options.current();
  const emit=(state:ObservationState<T>)=>{if(usable())options.emit(state);else cancel();};
  const retained=()=>last?{retained:last}:{};
  const check=(at:number)=>{if(!usable()||at!==generation)throw new Stopped();};
  function cancel(){if(cancelled)return;cancelled=true;generation++;lifetime.abort();attempt?.abort();if(options.current())options.emit({status:"cancelled"});}
  const done=(async()=>{
    let failures=0;
    while(usable()){
      const at=++generation;attempt=new AbortController();const active=attempt;let renewal:ReturnType<typeof setTimeout>|undefined;let openedBody:HeadBodyResult|undefined;let readerOwned=false;let streamAlive=true;let streamEnd!:()=>void;
      const connectionEnded=new Promise<void>(resolve=>{streamEnd=resolve;});
      const lifeAbort=()=>active.abort();lifetime.signal.addEventListener("abort",lifeAbort);
      try{
        emit({status:failures?"reconnecting":"connecting",...retained()});
        const auth=await bounded(signal=>options.authenticate(signal),active.signal,seconds);check(at);
        if(!auth.ok)throw new ObservationFailure(auth.reason==="unauthorized"?"forbidden":auth.reason==="expired"?"expired":auth.reason==="unsupported"?"unsupported":"unavailable",auth.reason);
        const session=auth.session;
        if(session.claims.deployment!==context.deployment||!same(session.claims.membership,context.membership)||session.claims.member!==context.member||session.claims.key!==context.key||!session.claims.reads.includes("summary"))throw new ObservationFailure("error","session-context-mismatch");
        const ends=timeMs(session.claims.ends);if(ends===null||session.endedBy(timeOf(now())))throw new ObservationFailure("expired","session-expired");
        renewal=setTimeout(()=>{active.abort();streamEnd();},Math.max(1,ends-now()));
        const opened=await bounded(signal=>options.open(session,signal),active.signal,seconds,value=>{if(value.ok){try{void value.body.getReader().cancel().catch(()=>undefined);}catch{/* Late body's upstream may refuse disposal. */}}});openedBody=opened;check(at);
        if(!opened.ok)throw new ObservationFailure(opened.reason==="forbidden"?"forbidden":opened.reason==="unsupported"?"unsupported":"unavailable",opened.reason);
        const lines=headLines(opened.body,active.signal);latest=undefined;
        readerOwned=true;const first=await bounded(()=>lines.next(),active.signal,seconds);check(at);
        if(first.done)throw new ObservationFailure("unavailable","stream-ended-before-head");
        if(last&&first.value.seq===last.at.seq&&first.value.hash!==last.at.hash)throw new ObservationFailure("error","head-hash-conflict");
        latest=first.value;
        let streamFailure:ObservationFailure|undefined;
        const pump=(async()=>{try{for await(const notice of lines){check(at);if(latest&&notice.seq===latest.seq&&notice.hash!==latest.hash||last&&notice.seq===last.at.seq&&notice.hash!==last.at.hash)throw new ObservationFailure("error","head-hash-conflict");if(!latest||notice.seq>latest.seq){latest=notice;refreshAgain?.();}}}catch(error){if(!(error instanceof Stopped)&&!active.signal.aborted)streamFailure=error instanceof ObservationFailure?error:new ObservationFailure("error","malformed-head-stream");}finally{streamAlive=false;active.abort();streamEnd();}})();
        const refresh=async()=>{
          if(refreshRunning){dirty=true;return;}refreshRunning=true;
          try{do{
            dirty=false;check(at);emit({status:"refreshing",...retained()});
            const read=await bounded(signal=>options.snapshot(session,signal),active.signal,seconds);check(at);
            if(!read.ok)throw new ObservationFailure(read.reason==="forbidden"?"forbidden":"unavailable",read.reason);
            const snapshot=read.value;
            if(!read.complete||read.next!==undefined||!isHead(snapshot.at)||!isScopeRef(snapshot.scope)||!isHead(read.at)||!same(read.at,snapshot.at)||!same(snapshot.scope,context.scope)||snapshot.definition!==context.definition)throw new ObservationFailure("error","incomplete-or-mismatched-snapshot");
            if(last&&snapshot.at.seq===last.at.seq&&snapshot.at.hash!==last.at.hash||latest&&snapshot.at.seq===latest.seq&&snapshot.at.hash!==latest.hash)throw new ObservationFailure("error","head-hash-conflict");
            if(last&&snapshot.at.seq<last.at.seq){emit({status:"retained",snapshot:last,reason:"older-snapshot"});}
            else{last=snapshot;if(!streamAlive){emit({status:"retained",snapshot,reason:"subscription-ended"});}else if(latest&&snapshot.at.seq<latest.seq){emit({status:"retained",snapshot,reason:"newer-notice"});dirty=true;}else emit({status:"current",snapshot});}
            if(dirty)await delay(0,active.signal);
          }while(dirty);
          }finally{refreshRunning=false;}
        };
        let pending:Promise<void>|undefined;let refreshFailure:ObservationFailure|undefined;
        refreshAgain=()=>{dirty=true;if(!pending&&!refreshRunning){pending=refresh().catch(error=>{if(!(error instanceof Stopped))refreshFailure=error instanceof ObservationFailure?error:new ObservationFailure("unavailable","snapshot-read-failed");active.abort();streamEnd();}).finally(()=>{
          pending=undefined;
          if(dirty&&streamAlive&&!active.signal.aborted&&usable()&&at===generation){
            // Hand off completion-boundary invalidations after a task yield;
            // they may arrive after refreshRunning clears but before this slot.
            void delay(0,active.signal).then(()=>{
              if(dirty&&streamAlive&&!active.signal.aborted&&usable()&&at===generation)refreshAgain?.();
            },()=>undefined);
          }
        });}};
        refreshAgain();await connectionEnded;active.abort();await pump;await pending;refreshAgain=undefined;
        if(streamFailure)throw streamFailure;if(refreshFailure)throw refreshFailure;
        check(at);failures++;emit({status:"reconnecting",...retained()});
      }catch(error){
        if(error instanceof Stopped){if(!usable())break;failures++;}
        else{const failure=error instanceof ObservationFailure?error:new ObservationFailure("unavailable","observation-transport-failed");emit({status:failure.status,reason:failure.reason,...retained()});if(["forbidden","unsupported","error"].includes(failure.status))break;failures++;}
      }finally{active.abort();if(openedBody?.ok&&!readerOwned) { try { void openedBody.body.getReader().cancel().catch(()=>undefined); } catch { /* Iterator owns a locked native body and observes active.abort. */ } }clearTimeout(renewal);lifetime.signal.removeEventListener("abort",lifeAbort);refreshAgain=undefined;}
      if(usable()){try{await bounded(signal=>options.reconnectDelay?.(failures,signal)??delay(Math.min(5000,500*2**Math.min(failures-1,4)),signal),lifetime.signal,seconds);}catch{break;}}
    }
    if(!options.current()&&!cancelled)cancel();
  })();
  return{refresh(){if(!usable()){cancel();return;}dirty=true;refreshAgain?.();},cancel,done};
}
