/** Actual SDK adapter. Bootstrap/enrollment belongs to F1/C4, never this stage. */
import type { Receipt, Summary } from "@generalbusiness/artroom-contract";
import { b64url, canonicalize, intentDigest, keyIdOfSecret, timeOf, verifySignedIntent } from "@generalbusiness/artroom-bytes";
import { ScopeHandle, completeSummary, httpTransport, observeScope, openHttpHeadStream, requestSession, secretSigner, sessionRequest, shapeDeclaredAct, signedIntent, type Fetch, type HeadStreamFetch, type Observation, type ObservationState, type Session } from "@generalbusiness/artroom-client";
import { counting } from "../definition.ts";
import { COUNTING_DEFINITION } from "../pin.ts";
import { assignedTurn, countingView, proposal, same, type Control, type CountingView } from "./model.ts";
import type { ActorIdentity, Completion, PreparedEnvelope, Reporter, ReportOutcome, CustodyLock, PendingStore } from "./voice-controller.ts";

export interface CommandStore {load():Promise<{kind:string;envelope:PreparedEnvelope}|null>;save(value:{kind:string;envelope:PreparedEnvelope}):Promise<void>;clear():Promise<void>}
export type CommandOutcome=ReportOutcome|{readonly status:"blocked";readonly reason:string};
export interface StageGateway extends Reporter {
  observe(emit:(state:ObservationState<Summary>,view?:CountingView)=>void):Observation;
  command(kind:Control):Promise<CommandOutcome>;
  checkCommand():Promise<ReportOutcome|null>;
  pendingCommand():string|null;
  restoreCommand():Promise<void>;
  dispose():void;
}
export function nativeGateway(identity:ActorIdentity,secret:Uint8Array,options:{current():boolean;lock:CustodyLock;voiceStore:PendingStore;commandStore:CommandStore;fetch?:Fetch;headFetch?:HeadStreamFetch}):StageGateway {
  if(identity.definition!==COUNTING_DEFINITION||keyIdOfSecret(secret)!==identity.publicKey||!same(identity.member.membership,identity.membership))throw new Error("This enrolled device does not match the configured counting identity.");
  // Copies stay in this device's closure; no key/token reaches a URL or view.
  const ownSecret=Uint8Array.from(secret),signer=secretSigner(ownSecret);
  const lifetime=new AbortController();let alive=true;
  const transport=httpTransport(identity.origin,{fetch:options.fetch??((url,init)=>fetch(url,{...init,redirect:"error",signal:init?.signal?AbortSignal.any([init.signal,lifetime.signal]):lifetime.signal}))});
  let session:Session|null=null,view:CountingView|undefined,observer:Observation|undefined,pending:string|null=null,fresh=false;
  const handle=()=>new ScopeHandle(transport,identity.scope.scope,session?.reader()??null);
  const usable=()=>alive&&options.current();
  const current=()=>{if(!usable())throw new Error("This device context is no longer current.");};
  const exact=(envelope:PreparedEnvelope)=>{current();const i=envelope.signed.intent;if(!same(i.to,identity.scope)||i.actor!==identity.publicKey||!verifySignedIntent(envelope.signed))throw new Error("The private request identity is unavailable.");};
  const verified=async(receipt:Receipt,envelope:PreparedEnvelope):Promise<ReportOutcome>=>{
    if(receipt.definition!==identity.definition||receipt.intent!==intentDigest(envelope.signed.intent)||!same(receipt.fact.at,identity.scope))return{status:"unknown",reason:"The acceptance did not match this request."};
    const followed=await handle().followReceipt(receipt);current();
    if(!followed.ok||followed.entry.input.type!=="act"||canonicalize(followed.entry.input.signed)!==canonicalize(envelope.signed))return{status:"unknown",reason:"The original recorded request could not be verified."};
    observer?.refresh();return{status:"recorded"};
  };
  const send=async(envelope:PreparedEnvelope):Promise<ReportOutcome>=>{try{exact(envelope);const answer=await handle().submit(envelope.signed,envelope.grants,envelope.beside);current();if(answer.answer==="accepted")return verified(answer.receipt,envelope);if(answer.answer==="refused"){observer?.refresh();return{status:"unknown",reason:"A refusal reply cannot prove this exact request was not recorded. Check the retained original request."};}return{status:"unknown",reason:"No acceptance is confirmed. The original request is retained."};}catch{return{status:"unknown",reason:"The original request has no verified answer."};}};
  const reconcile=async(envelope:PreparedEnvelope):Promise<ReportOutcome>=>{try{exact(envelope);const answer=await handle().settle(envelope.signed);current();return answer.ok?verified(answer.value,envelope):{status:"unknown",reason:"The original request remains unresolved."};}catch{return{status:"unknown",reason:"The original request remains unresolved."};}};
  const prepare=async(kind:Control|"spoken",completion?:Completion):Promise<PreparedEnvelope>=>{
    current();if(!view||!fresh)throw new Error("A current counting snapshot is required.");
    const plan=proposal(view,identity,kind,completion),shaped=shapeDeclaredAct(counting,kind,{on:plan.on,fields:plan.fields});
    const signed=await signedIntent(signer,{to:identity.scope,kind,on:shaped.on,fields:shaped.fields,expected:plan.expected});current();return{signed,grants:[],beside:shaped.beside};
  };
  return{
    observe(emit){
      observer=observeScope<Summary>({context:{origin:identity.origin,deployment:identity.deployment,scope:identity.scope,definition:identity.definition,membership:identity.membership,member:identity.member.member,key:identity.publicKey},current:usable,
        authenticate:async()=>{const answer=await requestSession(identity.origin,identity.membership.scope,sessionRequest(identity.membership,ownSecret,timeOf(Date.now()+60_000),b64url(crypto.getRandomValues(new Uint8Array(16)))),options.fetch?{fetch:options.fetch}:{});if(answer.ok)session=answer.session;return answer.ok?{ok:true,session:answer.session}:answer;},
        snapshot:async next=>{session=next;return completeSummary(await handle().summary());},
        open:(next,signal)=>openHttpHeadStream(identity.origin,identity.scope,next,signal,options.headFetch?{fetch:options.headFetch}:{}),
        emit:state=>{if(!usable())return;fresh=state.status==="current";if(fresh&&state.status==="current"){try{view=countingView(state.snapshot.value,identity.scope);}catch{view=undefined;fresh=false;emit({status:"error",reason:"The counting snapshot is invalid."});return;}}emit(state,view);},
      });return observer;
    },
    async prepare(completion){if(await options.commandStore.load())throw new Error("Another exact command remains pending.");const turn=view&&assignedTurn(view,identity);if(!turn||!same(turn,completion.turn))throw new Error("The completed turn is no longer current.");return prepare("spoken",completion);},
    submit:send,reconcile,
    async command(kind){return options.lock.run(async()=>{current();if(await options.voiceStore.load()||await options.commandStore.load())return{status:"unknown",reason:"Check the retained request before another command."};let envelope:PreparedEnvelope;try{envelope=await prepare(kind);}catch{return{status:"blocked",reason:"This candidate is unavailable locally. Nothing was signed or submitted."};}try{await options.commandStore.save({kind,envelope});}catch{return{status:"blocked",reason:"Private command custody is unavailable. Nothing was submitted."};}current();pending=kind;const result=await send(envelope);if(result.status!=="unknown"){await options.commandStore.clear();pending=null;observer?.refresh();}return result;});},
    async checkCommand(){return options.lock.run(async()=>{current();const held=await options.commandStore.load();if(!held){pending=null;return null;}pending=held.kind;const result=await reconcile(held.envelope);if(result.status==="recorded"){await options.commandStore.clear();pending=null;observer?.refresh();}return result;});},
    pendingCommand:()=>pending,
    async restoreCommand(){const held=await options.commandStore.load();current();pending=held?.kind??null;},
    dispose(){alive=false;lifetime.abort();observer?.cancel();session=null;view=undefined;ownSecret.fill(0);},
  };
}
