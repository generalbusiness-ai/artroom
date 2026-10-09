/** Private attempt history; service judgments are not signed native receipts. */
import type { Answer, Digest } from "@generalbusiness/artroom-contract";
import { canonicalize, isFactRef, isGrant, isHead, isRecord, isSignedIntentShape, REFUSAL_REASONS, textDigest, utf8, verifySignedIntent } from "@generalbusiness/artroom-bytes";
import type { ActorIdentity, PendingReport, PreparedEnvelope } from "./voice-controller.ts";
export const MAX_ATTEMPTS=8, SLOT_BYTES=64*1024;
export type DispatchPhase="prepared"|"inflight"|"unknown"|"refused"|"recorded";
export interface RefusalJudgment {
  readonly answer:Extract<Answer,{answer:"refused"}>;
  readonly origin:string;
  readonly url:string;
  readonly request:Digest;
  readonly context:Digest;
}
export interface Attempt {readonly envelope:PreparedEnvelope;readonly phase:DispatchPhase;readonly refusal?:RefusalJudgment}
export interface AttemptJournal {readonly v:2;readonly attempts:readonly Attempt[];readonly active:number}
export const envelopeKey=(envelope:PreparedEnvelope):Digest=>textDigest(canonicalize(envelope));
export const contextKey=(identity:ActorIdentity):Digest=>textDigest(canonicalize(identity));
export const actURL=(identity:ActorIdentity):string=>`${identity.origin}/v1/scopes/${encodeURIComponent(identity.scope.scope)}/acts`;
export function activeAttempt(journal:AttemptJournal):Attempt {
  if(journal.v!==2||!Array.isArray(journal.attempts)||journal.attempts.length<1||journal.attempts.length>MAX_ATTEMPTS||journal.active!==journal.attempts.length-1)throw new Error("Private attempt history is unavailable.");
  return journal.attempts[journal.active]!;
}
export function appendPrepared(envelope:PreparedEnvelope,previous?:AttemptJournal):AttemptJournal {
  if(previous){activeAttempt(previous);if(previous.attempts.length>=MAX_ATTEMPTS||previous.attempts.some(a=>a.phase!=="refused"||!a.refusal))throw new Error("Prior private attempts must be known refused and within capacity.");}
  const attempts=[...(previous?.attempts??[]),{envelope,phase:"prepared" as const}];return{v:2,attempts,active:attempts.length-1};
}
export function markActive(journal:AttemptJournal,phase:DispatchPhase,refusal?:RefusalJudgment):AttemptJournal {
  const old=activeAttempt(journal);
  if(old.phase==="recorded"||(old.phase==="refused"&&phase!=="refused"))throw new Error("A terminal private attempt cannot be downgraded.");
  const allowed=old.phase==="prepared"?(phase==="inflight"||phase==="recorded"):old.phase==="inflight"?["unknown","refused","recorded"].includes(phase):old.phase==="unknown"?phase==="recorded":phase==="refused";
  if(!allowed||(phase==="refused"&&!refusal))throw new Error("Invalid private attempt transition.");
  return{...journal,attempts:journal.attempts.map((a,i)=>i===journal.active?{envelope:a.envelope,phase,...(refusal?{refusal}:{})}:a)};
}
export function legacyUnknown(envelope:PreparedEnvelope):AttemptJournal{return{v:2,active:0,attempts:[{envelope,phase:"unknown"}]};}
export function fitsPending(identity:ActorIdentity,pending:unknown):boolean {try{return utf8(canonicalize({identity,pending})).length<=SLOT_BYTES;}catch{return false;}}
/** Closed local wire shape. Native grant authority remains the scope's decision. */
export function validEnvelope(value:unknown,identity:ActorIdentity):value is PreparedEnvelope {
  try{
    if(!isRecord(value)||Object.keys(value).length!==3||!Object.hasOwn(value,"signed")||!Object.hasOwn(value,"grants")||!Object.hasOwn(value,"beside"))return false;
    const {signed,grants,beside}=value;
    if(!isSignedIntentShape(signed)||!verifySignedIntent(signed)||canonicalize(signed.intent.to)!==canonicalize(identity.scope)||signed.intent.actor!==identity.publicKey||!Array.isArray(grants)||!grants.every(isGrant)||!isRecord(beside))return false;
    if(Object.keys(beside).some(key=>!["texts","values","presented"].includes(key)))return false;
    for(const key of ["texts","values"]){if(Object.hasOwn(beside,key)&&(!Array.isArray(beside[key])||!(beside[key] as unknown[]).every(v=>typeof v==="string")))return false;}
    if(Object.hasOwn(beside,"presented")&&(!isRecord(beside.presented)||!Object.values(beside.presented).every(isFactRef)))return false;
    canonicalize(value);return true;
  }catch{return false;}
}
/** Explicit fields prevent restored Beside from replacing the original signed/grant values. */
export function requestBody(envelope:PreparedEnvelope):string {
  return JSON.stringify({signed:envelope.signed,grants:envelope.grants,
    ...(Object.hasOwn(envelope.beside,"texts")?{texts:envelope.beside.texts}:{}),
    ...(Object.hasOwn(envelope.beside,"values")?{values:envelope.beside.values}:{}),
    ...(Object.hasOwn(envelope.beside,"presented")?{presented:envelope.beside.presented}:{})});
}
const closed=(value:unknown,required:readonly string[],optional:readonly string[]=[]):boolean=>isRecord(value)&&required.every(key=>Object.hasOwn(value,key))&&Object.keys(value).every(key=>required.includes(key)||optional.includes(key));
export function validJournal(journal:AttemptJournal,identity:ActorIdentity,envelope:PreparedEnvelope):boolean {
  try{
    if(!closed(journal,["v","attempts","active"])||!validEnvelope(envelope,identity))return false;
    const active=activeAttempt(journal);if(envelopeKey(active.envelope)!==envelopeKey(envelope))return false;
    for(const [index,a]of journal.attempts.entries()){
      if(!closed(a,["envelope","phase"],["refusal"])||!validEnvelope(a.envelope,identity))return false;
      if(!["prepared","inflight","unknown","refused","recorded"].includes(a.phase)||index<journal.active&&a.phase!=="refused")return false;
      if(a.phase==="refused"){
        const r=a.refusal;if(!closed(r,["answer","origin","url","request","context"])||r.origin!==identity.origin||r.url!==actURL(identity)||r.context!==contextKey(identity)||r.request!==envelopeKey(a.envelope)||!closed(r.answer,["answer","reason","judgedAt"],["name"])||r.answer.answer!=="refused"||typeof r.answer.reason!=="string"||!Object.hasOwn(REFUSAL_REASONS,r.answer.reason)||!isHead(r.answer.judgedAt)||(Object.hasOwn(r.answer,"name")&&typeof r.answer.name!=="string"))return false;
      }else if(Object.hasOwn(a,"refusal"))return false;
    }
    return true;
  }catch{return false;}
}
export function knownRefusal(journal:AttemptJournal|undefined,identity:ActorIdentity,envelope:PreparedEnvelope):boolean {
  return !!journal&&validJournal(journal,identity,envelope)&&activeAttempt(journal).phase==="refused";
}
/** Only a completely validated resolved history can leave the active slot. */
export function terminalJournal(journal:AttemptJournal|undefined,identity:ActorIdentity,envelope:PreparedEnvelope):boolean {
  return !!journal&&validJournal(journal,identity,envelope)&&journal.attempts.every(a=>a.phase==="refused"||a.phase==="recorded");
}

/** Completion custody is local and must stay bound to the same full device identity. */
export function validReport(value:unknown,identity:ActorIdentity):value is PendingReport {
  try{
    if(!isRecord(value)||!closed(value,["completion","envelope","outcome"],["journal"])||!["unknown","refused"].includes(value.outcome as string)||!closed(value.completion,["turn","voiceId","completedAt"]))return false;
    const c=value.completion as Record<string,unknown>,t=c.turn;
    if(typeof c.voiceId!=="string"||!c.voiceId||typeof c.completedAt!=="number"||!Number.isSafeInteger(c.completedAt)||c.completedAt<0||!isRecord(t)||!closed(t,["origin","deployment","scope","definition","membership","member","publicKey","generation","serial","N","expiresAt"]))return false;
    const {generation,serial,N,expiresAt,...context}=t;
    if(canonicalize(context)!==canonicalize(identity)||![generation,serial,N,expiresAt].every(v=>typeof v==="number"&&Number.isSafeInteger(v))||(generation as number)<0||(serial as number)<1||(N as number)<1||(expiresAt as number)<0||!validEnvelope(value.envelope,identity)||!fitsPending(identity,value))return false;
    return !Object.hasOwn(value,"journal")||validJournal(value.journal as AttemptJournal,identity,value.envelope);
  }catch{return false;}
}
