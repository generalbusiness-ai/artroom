/** Actual SDK adapter. Bootstrap/enrollment belongs to F1/C4, never this stage. */
import type { Receipt, Summary } from "@generalbusiness/artroom-contract";
import { b64url, canonicalize, intentDigest, keyIdOfSecret, isRecord, timeOf } from "@generalbusiness/artroom-bytes";
import { ScopeHandle, completeSummary, httpTransport, observeScope, openHttpHeadStream, requestSession, secretSigner, sessionRequest, shapeDeclaredAct, signedIntent, type Fetch, type HeadStreamFetch, type Observation, type ObservationState, type Session } from "@generalbusiness/artroom-client";
import { counting } from "../definition.ts";
import { COUNTING_DEFINITION } from "../pin.ts";
import { assignedTurn, countingView, ownedParticipant, proposal, same, type Control, type CountingView } from "./model.ts";
import { appendPrepared, activeAttempt, envelopeKey, fitsPending, resumableJournal, validEnvelope, validReport, validJournal, type AttemptJournal } from "./journal.ts";
import { attemptDispatcher, type TrustedActFetch } from "./dispatcher.ts";
import type { ActorIdentity, Completion, PreparedEnvelope, Reporter, ReportOutcome, CustodyLock, PendingStore } from "./voice-controller.ts";

export interface CommandStore {load():Promise<{kind:string;envelope:PreparedEnvelope;journal?:AttemptJournal}|null>;save(value:{kind:string;envelope:PreparedEnvelope;journal?:AttemptJournal}):Promise<void>;clear():Promise<void>}
export type CommandOutcome=ReportOutcome|{readonly status:"blocked";readonly reason:string};
export interface StageGateway extends Reporter {
  observe(emit:(state:ObservationState<Summary>,view?:CountingView)=>void):Observation;
  command(kind:Control):Promise<CommandOutcome>;
  checkCommand():Promise<ReportOutcome|null>;
  resumeCommand():Promise<ReportOutcome|null>;
  commandResumeReady():boolean;
  pendingCommand():string|null;
  restoreCommand():Promise<void>;
  dispose():void;
}
export function nativeGateway(configured:ActorIdentity,secret:Uint8Array,options:{current():boolean;lock:CustodyLock;voiceStore:PendingStore;commandStore:CommandStore;fetch?:Fetch;headFetch?:HeadStreamFetch;actFetch?:TrustedActFetch}):StageGateway {
  const identity=JSON.parse(JSON.stringify(configured)) as ActorIdentity;
  const origin=new URL(identity.origin);if(origin.origin!==identity.origin||origin.pathname!=="/"||origin.search||origin.hash||origin.username||origin.password||!["https:","http:"].includes(origin.protocol))throw new Error("The configured service must be an exact trusted origin.");
  if(identity.definition!==COUNTING_DEFINITION||keyIdOfSecret(secret)!==identity.publicKey||!same(identity.member.membership,identity.membership))throw new Error("This enrolled device does not match the configured counting identity.");
  // Copies stay in this device's closure; no key/token reaches a URL or view.
  const ownSecret=Uint8Array.from(secret),signer=secretSigner(ownSecret);
  const lifetime=new AbortController();let alive=true;
  const transport=httpTransport(identity.origin,{fetch:options.fetch??((url,init)=>fetch(url,{...init,redirect:"error",signal:init?.signal?AbortSignal.any([init.signal,lifetime.signal]):lifetime.signal}))});
  let session:Session|null=null,view:CountingView|undefined,observer:Observation|undefined,pending:string|null=null,fresh=false,commandPrepared=false;
  const handle=()=>new ScopeHandle(transport,identity.scope.scope,session?.reader()??null);
  const usable=()=>alive&&options.current();
  const current=()=>{if(!usable())throw new Error("This device context is no longer current.");};
  const exact=(envelope:PreparedEnvelope)=>{current();if(!validEnvelope(envelope,identity))throw new Error("The private request identity is unavailable.");};
  const verified=async(receipt:Receipt,envelope:PreparedEnvelope):Promise<ReportOutcome>=>{
    if(receipt.definition!==identity.definition||receipt.intent!==intentDigest(envelope.signed.intent)||!same(receipt.fact.at,identity.scope))return{status:"unknown",reason:"The acceptance did not match this request."};
    const followed=await handle().followReceipt(receipt);current();
    if(!followed.ok||followed.entry.input.type!=="act"||canonicalize(followed.entry.input.signed)!==canonicalize(envelope.signed))return{status:"unknown",reason:"The original recorded request could not be verified."};
    observer?.refresh();return{status:"recorded"};
  };
  const trusted:TrustedActFetch|undefined=options.actFetch??(options.fetch?undefined:typeof globalThis.fetch==="function"?((url,init)=>fetch(url,{...init,signal:AbortSignal.any([init.signal,lifetime.signal])})):undefined);
  const dispatcher=attemptDispatcher({identity,current:usable,...(trusted?{fetch:trusted}:{}),accepted:verified,settle:async envelope=>{exact(envelope);const answer=await handle().settle(envelope.signed);current();return answer.ok?{ok:true,receipt:answer.value}:{ok:false};},refresh:()=>observer?.refresh()});
  const candidate=(kind:Control|"spoken",completion?:Completion)=>{if(!view||!fresh)throw new Error("A current counting snapshot is required.");const plan=proposal(view,identity,kind,completion),shaped=shapeDeclaredAct(counting,kind,{on:plan.on,fields:plan.fields});return{plan,shaped};};
  const reservation=(report:import("./voice-controller.ts").PendingReport):boolean=>{
    try{
      current();if(!dispatcher.supported()||!report.journal||!validJournal(report.journal,identity,report.envelope)||activeAttempt(report.journal).phase!=="refused"||!["guard-failed","revision-moved"].includes(activeAttempt(report.journal).refusal!.answer.reason))return false;
      const turn=view&&assignedTurn(view,identity);if(!turn||!same(turn,report.completion.turn))return false;
      const {plan,shaped}=candidate("spoken",report.completion);
      // Actual SDK fields have fixed-size22-char operation IDs,86-char signatures and20-char timestamps.
      const envelope:PreparedEnvelope={signed:{intent:{v:1,to:identity.scope,actor:identity.publicKey,kind:"spoken",on:shaped.on??null,expected:plan.expected,fields:shaped.fields,idempotencyKey:"x".repeat(22),notAfter:"2099-01-01T00:00:00Z"},sig:"x".repeat(86)},grants:[],beside:shaped.beside};
      const journal=appendPrepared(envelope,report.journal);
      const next={...report,envelope,journal,outcome:"unknown" as const};
      return fitsPending(identity,next);
    }catch{return false;}
  };
  const prepare=async(kind:Control|"spoken",completion?:Completion):Promise<PreparedEnvelope>=>{
    current();if(!dispatcher.supported())throw new Error("Trusted submit transport is unavailable.");
    const {plan,shaped}=candidate(kind,completion);
    const signed=await signedIntent(signer,{to:identity.scope,kind,on:shaped.on,fields:shaped.fields,expected:plan.expected});current();return{signed,grants:[],beside:shaped.beside};
  };
  const commandRecord=(held:unknown):held is NonNullable<Awaited<ReturnType<CommandStore["load"]>>>=>{
    if(!isRecord(held)||Object.keys(held).some(k=>!["kind","envelope","journal"].includes(k))||!Object.hasOwn(held,"kind")||!Object.hasOwn(held,"envelope")||typeof held["kind"]!=="string"||!["initialize","join","leave","start","pause","reset"].includes(held["kind"])||!validEnvelope(held["envelope"],identity)||held["envelope"].signed.intent.kind!==held["kind"]||!fitsPending(identity,held))return false;
    return !Object.hasOwn(held,"journal")||validJournal(held["journal"] as AttemptJournal,identity,held["envelope"]);
  };
  const clearCommand=async(envelope:PreparedEnvelope,result:ReportOutcome):Promise<ReportOutcome>=>{
    if(result.status==="unknown"||result.status==="blocked")return result;
    current();const retained=await options.commandStore.load();current();
    if(!retained?.journal||!commandRecord(retained)||envelopeKey(retained.envelope)!==envelopeKey(envelope)||!validJournal(retained.journal,identity,envelope)||activeAttempt(retained.journal).phase!==result.status)return{status:"unknown",reason:"The exact terminal command could not be recovered."};
    await options.commandStore.clear();current();pending=null;commandPrepared=false;observer?.refresh();return result;
  };
  const dispatchReport=async(envelope:PreparedEnvelope,readOnly:boolean):Promise<ReportOutcome>=>options.lock.run(async()=>{
    const result=await (readOnly?dispatcher.check(options.voiceStore,envelope):dispatcher.run(options.voiceStore,envelope));
    current();const held=await options.voiceStore.load();current();
    return held&&validReport(held,identity)&&envelopeKey(held.envelope)===envelopeKey(envelope)?{...result,custody:structuredClone(held)}:result;
  });
  return{
    observe(emit){
      observer=observeScope<Summary>({context:{origin:identity.origin,deployment:identity.deployment,scope:identity.scope,definition:identity.definition,membership:identity.membership,member:identity.member.member,key:identity.publicKey},current:usable,
        authenticate:async()=>{const answer=await requestSession(identity.origin,identity.membership.scope,sessionRequest(identity.membership,ownSecret,timeOf(Date.now()+60_000),b64url(crypto.getRandomValues(new Uint8Array(16)))),options.fetch?{fetch:options.fetch}:{});if(answer.ok)session=answer.session;return answer.ok?{ok:true,session:answer.session}:answer;},
        snapshot:async next=>{session=next;return completeSummary(await handle().summary());},
        open:(next,signal)=>openHttpHeadStream(identity.origin,identity.scope,next,signal,options.headFetch?{fetch:options.headFetch}:{}),
        emit:state=>{if(!usable())return;fresh=state.status==="current";if(fresh&&state.status==="current"){try{view=countingView(state.snapshot.value,identity.scope);}catch{view=undefined;fresh=false;emit({status:"error",reason:"The counting snapshot is invalid."});return;}}emit(state,view);},
      });return observer;
    },
    obsolete:completion=>{if(!usable()||!fresh||!view||!view.board)return false;const t=completion.turn,b=view.board,turn=assignedTurn(view,identity);return !ownedParticipant(view,identity)||b.generation!==t.generation||b.serial!==t.serial||b.lastNumber>=t.N||!!turn&&(turn.N!==t.N||turn.expiresAt!==t.expiresAt);},
    resumeReady:report=>{const turn=view&&assignedTurn(view,identity);return usable()&&fresh&&!!view&&!!ownedParticipant(view,identity)&&!!turn&&Date.now()<turn.expiresAt&&same(turn,report.completion.turn)&&validReport(report,identity)&&resumableJournal(report.journal,identity,report.envelope);},
    resume:envelope=>options.lock.run(async()=>{current();const held=await options.voiceStore.load();if(!fresh||!held||!validReport(held,identity)||!resumableJournal(held.journal,identity,envelope)||!view||!ownedParticipant(view,identity)||Date.now()>=held.completion.turn.expiresAt||!same(assignedTurn(view,identity),held.completion.turn))return{status:"blocked",reason:"The original report has no current definitely-unsent dispatch proof."};const result=await dispatcher.run(options.voiceStore,envelope);const after=await options.voiceStore.load();current();return after&&validReport(after,identity)&&envelopeKey(after.envelope)===envelopeKey(envelope)?{...result,custody:structuredClone(after)}:result;}),
    correctionReady:reservation,refresh:()=>observer?.refresh(),
    async prepare(completion){if(await options.commandStore.load())throw new Error("Another exact command remains pending.");const held=await options.voiceStore.load();if(held&&!reservation(held))throw new Error("Private correction capacity or a known refusal is unavailable.");const turn=view&&assignedTurn(view,identity);if(!turn||!same(turn,completion.turn))throw new Error("The completed turn is no longer current.");return prepare("spoken",completion);},
    submit:envelope=>dispatchReport(envelope,false),
    reconcile:envelope=>dispatchReport(envelope,true),
    async command(kind){return options.lock.run(async()=>{current();if(await options.voiceStore.load()||await options.commandStore.load())return{status:"unknown",reason:"Check the retained request before another command."};let envelope:PreparedEnvelope;try{envelope=await prepare(kind);}catch{return{status:"blocked",reason:"This candidate is unavailable locally. Nothing was signed or submitted."};}try{const journal=appendPrepared(envelope);const held={kind,envelope,journal};if(!fitsPending(identity,held))throw new Error();await options.commandStore.save(held);}catch{return{status:"blocked",reason:"Private command custody is unavailable. Nothing was submitted."};}current();pending=kind;const result=await dispatcher.run(options.commandStore,envelope);const retained=await options.commandStore.load();current();commandPrepared=!!retained&&commandRecord(retained)&&resumableJournal(retained.journal,identity,retained.envelope);return clearCommand(envelope,result);});},
    async checkCommand(){return options.lock.run(async()=>{current();const held=await options.commandStore.load();if(!held){pending=null;commandPrepared=false;return null;}pending=held.kind;if(!commandRecord(held)){commandPrepared=false;return{status:"blocked",reason:"The malformed original command remains in private custody."};}commandPrepared=resumableJournal(held.journal,identity,held.envelope);const result=await dispatcher.check(options.commandStore,held.envelope);return clearCommand(held.envelope,result);});},
    async resumeCommand(){return options.lock.run(async()=>{current();const held=await options.commandStore.load();if(!held){pending=null;commandPrepared=false;return null;}pending=held.kind;
      const voiceHeld=await options.voiceStore.load();current();if(!fresh||voiceHeld||!commandRecord(held)||!resumableJournal(held.journal,identity,held.envelope)){commandPrepared=false;return{status:"blocked",reason:"The original command has no current definitely-unsent dispatch proof."};}
      commandPrepared=false;const result=await dispatcher.run(options.commandStore,held.envelope);return clearCommand(held.envelope,result);
    });},
    commandResumeReady:()=>usable()&&fresh&&commandPrepared,
    pendingCommand:()=>pending,
    async restoreCommand(){const held=await options.commandStore.load();current();pending=held?.kind??null;commandPrepared=!!held&&commandRecord(held)&&resumableJournal(held.journal,identity,held.envelope);},
    dispose(){alive=false;lifetime.abort();observer?.cancel();session=null;view=undefined;ownSecret.fill(0);},
  };
}
