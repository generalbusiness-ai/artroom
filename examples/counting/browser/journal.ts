/** Private attempt history; service judgments are not signed native receipts. */
import type { Answer, Digest } from "@generalbusiness/artroom-contract";
import { canonicalize, isHead, REFUSAL_REASONS, textDigest, utf8, verifySignedIntent } from "@generalbusiness/artroom-bytes";
import type { ActorIdentity, PreparedEnvelope } from "./voice-controller.ts";
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
  const allowed=old.phase==="prepared"?phase==="inflight":old.phase==="inflight"?["unknown","refused","recorded"].includes(phase):old.phase==="unknown"?phase==="recorded":phase==="refused";
  if(!allowed||(phase==="refused"&&!refusal))throw new Error("Invalid private attempt transition.");
  return{...journal,attempts:journal.attempts.map((a,i)=>i===journal.active?{envelope:a.envelope,phase,...(refusal?{refusal}:{})}:a)};
}
export function legacyUnknown(envelope:PreparedEnvelope):AttemptJournal{return{v:2,active:0,attempts:[{envelope,phase:"unknown"}]};}
export function fitsPending(identity:ActorIdentity,pending:unknown):boolean {try{return utf8(canonicalize({identity,pending})).length<=SLOT_BYTES;}catch{return false;}}
export function validJournal(journal:AttemptJournal,identity:ActorIdentity,envelope:PreparedEnvelope):boolean {
  try{
    const active=activeAttempt(journal);if(envelopeKey(active.envelope)!==envelopeKey(envelope))return false;
    for(const [index,a]of journal.attempts.entries()){
      const intent=a.envelope.signed.intent;
      if(canonicalize(intent.to)!==canonicalize(identity.scope)||intent.actor!==identity.publicKey||!verifySignedIntent(a.envelope.signed))return false;
      if(!["prepared","inflight","unknown","refused","recorded"].includes(a.phase)||index<journal.active&&a.phase!=="refused")return false;
      if(a.phase==="refused"){
        const r=a.refusal;if(!r||r.origin!==identity.origin||r.url!==actURL(identity)||r.context!==contextKey(identity)||r.request!==envelopeKey(a.envelope)||r.answer.answer!=="refused"||!Object.hasOwn(REFUSAL_REASONS,r.answer.reason)||!isHead(r.answer.judgedAt)||(r.answer.name!==undefined&&typeof r.answer.name!=="string"))return false;
      }else if(a.refusal)return false;
    }
    return true;
  }catch{return false;}
}
