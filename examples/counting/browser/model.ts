/** Proposals are convenience inputs. The native C1 declaration still checks authority and admission. */
import type { FieldValue, MemberRef, ScopeRef, Summary } from "@generalbusiness/artroom-contract";
import { canonicalize, isMemberRef, timeMs } from "@generalbusiness/artroom-bytes";
import { countingCommitments } from "../commitments.ts";
import { COUNTING_COMMITMENTS_DEFINITION } from "../commitments-pin.ts";
import type { ActorIdentity, Completion, TurnToken } from "./voice-controller.ts";

export interface Participant { id: number; revision: number; member: MemberRef; state: "inactive"|"active"|"removed" }
export const failureReasons = ["media-error", "process-error", "cancelled", "interrupted", "speech-uncertain"] as const;
export type FailureReason = typeof failureReasons[number];
export interface Pledge {
  id: number; revision: number; state: "pledged"; member: MemberRef; participant: number; admittedAt: number;
  generation: number; serial: number; n: number; until: number; basis: readonly {id:number;member:MemberRef}[];
}
export interface Board {
  id: number; revision: number; state: "paused"|"open"|"finished"; target: number;
  generation: number; serial: number; lastNumber: number; lastSpeaker: MemberRef|null;
  pledge: number|null; lastFulfilledAt: number|null;
  /** These display values come only from the current linked promise, never a scheduler. */
  number: number|null; speaker: MemberRef|null; until: number|null;
}
export interface CountingView {
  summary: Summary; configuration: {id:number;revision:number;target:number;controller:MemberRef};
  board: Board|null; participants: Participant[]; pledge: Pledge|null;
  /** May remain live briefly after the board's earlier expiry entry has cleared its link. */
  pendingPromise: Pledge|null;
}
/** Establish is genesis/bootstrap, not a command over an already-established view. */
export type Control = "initialize"|"participate"|"activate"|"deactivate"|"force-deactivate"|"remove-participant"|"start"|"commit"|"fulfill"|"fail"|"cancel"|"pause"|"reset";
export interface ProposalOptions { participant?:number; reason?:FailureReason }
export interface Proposal { kind:Control; on:number|null; fields:Record<string,FieldValue>; expected:Record<string,number> }
export const same = (a:unknown,b:unknown):boolean => canonicalize(a)===canonicalize(b);
const invalid = ():never => { throw new Error("The counting snapshot has invalid values."); };
const numeric = (v:unknown,min=0,max=Number.MAX_SAFE_INTEGER):number => typeof v==="number"&&Number.isSafeInteger(v)&&v>=min&&v<=max?v:invalid();
const member = (v:unknown):MemberRef|null => v===null||v===undefined?null:isMemberRef(v)?v:invalid();
const requiredMember = (v:unknown):MemberRef => member(v)??invalid();
const instant = (v:unknown):number => timeMs(v)??invalid();
const ref = (v:unknown):number|null => v==null?null:numeric(v);

export function countingView(summary:Summary,scope:ScopeRef):CountingView {
  if(!same(summary.scope,scope)||summary.definition!==COUNTING_COMMITMENTS_DEFINITION||summary.status!=="active")throw new Error("This is not the configured counting scope and pin.");
  const configurations=summary.items.filter(i=>i.type==="configuration"),boards=summary.items.filter(i=>i.type==="board");
  if(configurations.length!==1||boards.length>1||new Set(summary.items.map(i=>i.id)).size!==summary.items.length)invalid();
  const c=configurations[0]!,controller=requiredMember(c.parties["controller"]),target=numeric(c.values["target"],1,100);
  if(c.state!=="ready")invalid();
  const participants=summary.items.filter(i=>i.type==="participant").map(i=>{
    if(!["inactive","active","removed"].includes(i.state))invalid();
    return{id:numeric(i.id),revision:numeric(i.revision),member:requiredMember(i.parties["agent"]),state:i.state as Participant["state"]};
  }).sort((a,b)=>a.id-b.id);
  const live=participants.filter(p=>p.state!=="removed");
  if(live.length>16||new Set(live.map(p=>canonicalize(p.member))).size!==live.length)invalid();
  const pending=summary.items.filter(i=>i.type==="promise"&&i.state==="pledged");if(pending.length>1)invalid();
  let pendingPromise:Pledge|null=null;
  if(pending.length){
    const p=pending[0]!,raw=p.values["basis"];if(!Array.isArray(raw)||!raw.length||raw.length>16)invalid();
    const basis=raw.map(v=>{
      if(v===null||typeof v!=="object"||Array.isArray(v)||!("id" in v)||!("member" in v))invalid();
      return{id:numeric(v.id),member:requiredMember(v.member)};
    });
    if(basis.some((p,i)=>i>0&&p.id<=basis[i-1]!.id)||new Set(basis.map(p=>canonicalize(p.member))).size!==basis.length)invalid();
    pendingPromise={id:numeric(p.id),revision:numeric(p.revision),state:"pledged",member:requiredMember(p.parties["agent"]),participant:numeric(p.refs["participant"]),admittedAt:numeric(p.refs["admittedAt"]),generation:numeric(p.values["generation"],0,1000000),serial:numeric(p.values["serial"],1,1000000),n:numeric(p.values["n"],1,target),until:instant(p.values["until"]),basis};
    const owner=participants.find(i=>i.id===pendingPromise!.participant);
    if(pendingPromise.admittedAt!==pendingPromise.id||!owner||owner.state!=="active"||!same(owner.member,pendingPromise.member)||!basis.some(i=>i.id===owner.id&&same(i.member,owner.member)))invalid();
  }
  let board:Board|null=null,pledge:Pledge|null=null;
  if(boards.length){
    const b=boards[0]!;if(!["paused","open","finished"].includes(b.state)||!same(b.parties["controller"],controller)||b.values["target"]!==target)invalid();
    const linked=ref(b.refs["pledge"]),until=b.values["until"]==null?null:instant(b.values["until"]);
    board={id:numeric(b.id),revision:numeric(b.revision),state:b.state as Board["state"],target,generation:numeric(b.values["generation"],0,1000000),serial:numeric(b.values["serial"],0,1000000),lastNumber:numeric(b.values["lastNumber"],0,target),lastSpeaker:member(b.parties["lastSpeaker"]),pledge:linked,lastFulfilledAt:ref(b.refs["lastFulfilledAt"]),number:null,speaker:null,until:null};
    if(linked!==null){
      const p=pendingPromise;
      if(!p||p.id!==linked||board.state!=="open"||p.generation!==board.generation||p.serial!==board.serial||p.n!==board.lastNumber+1||p.until!==until)invalid();
      pledge=p;board.number=p.n;board.speaker=p.member;board.until=p.until;
    }else {
      if(until!==null)invalid();
      if(pendingPromise&&(board.state!=="paused"||pendingPromise.generation!==board.generation||pendingPromise.serial!==board.serial||pendingPromise.n!==board.lastNumber+1))invalid();
    }
    if(board.state==="finished"&&board.lastNumber!==target)invalid();
  }else if(pendingPromise)invalid();
  return{summary,configuration:{id:numeric(c.id),revision:numeric(c.revision),target,controller},board,participants,pledge,pendingPromise};
}
const matchesIdentity=(view:CountingView,actor:ActorIdentity):boolean=>actor.definition===COUNTING_COMMITMENTS_DEFINITION&&same(actor.scope,view.summary.scope)&&same(actor.member.membership,actor.membership);
export function ownedParticipant(view:CountingView,actor:ActorIdentity):Participant|undefined{return view.participants.find(p=>p.state!=="removed"&&same(p.member,actor.member));}
export function controllerOf(view:CountingView,actor:ActorIdentity):boolean{return same(view.configuration.controller,actor.member);}
/** Eligibility is a convenience hint; grants, signer and fairness are still checked natively. */
export function canCommit(view:CountingView,actor:ActorIdentity):boolean {
  const b=view.board,p=ownedParticipant(view,actor),active=view.participants.filter(p=>p.state==="active");
  return matchesIdentity(view,actor)&&!!b&&b.state==="open"&&b.pledge===null&&!view.pendingPromise&&!!p&&p.state==="active"&&b.lastNumber<b.target&&b.serial<1000000&&(active.length===1||!same(b.lastSpeaker,actor.member));
}
export function assignedTurn(view:CountingView,actor:ActorIdentity):TurnToken|undefined {
  const b=view.board,p=view.pledge;
  if(!matchesIdentity(view,actor)||!b||b.state!=="open"||!p||b.pledge!==p.id||!same(p.member,actor.member)||p.generation!==b.generation||p.serial!==b.serial||p.n!==b.lastNumber+1||p.until!==b.until)return undefined;
  return{...actor,generation:p.generation,serial:p.serial,N:p.n,expiresAt:p.until};
}
const basis=(roster:Participant[]):FieldValue[]=>roster.filter(p=>p.state==="active").sort((a,b)=>a.id-b.id).map(p=>({id:p.id,member:p.member}));
const unavailable=(message:string):never=>{throw new Error(message);};
/** No proposal mutates this snapshot or grants permission to the signing device. */
export function proposal(view:CountingView,actor:ActorIdentity,kind:Control,completion?:Completion,options:ProposalOptions={}):Proposal {
  if(!matchesIdentity(view,actor))unavailable("This device does not match the counting scope.");
  const b=view.board,own=ownedParticipant(view,actor);let on:number|null=null,fields:Record<string,FieldValue>={};
  const control=()=>{if(!controllerOf(view,actor))unavailable("This member is not the controller.");};
  const empty=()=>{if(!b||b.pledge!==null||view.pendingPromise)unavailable("Resolve the live promise first.");};
  if(kind==="initialize"){control();if(b)unavailable("The board is already initialized.");}
  else if(kind==="participate"){
    if(own)unavailable("This member already participates.");
    if(view.participants.filter(p=>p.state!=="removed").length>=16)unavailable("The participant roster is full.");
  }else if(["activate","deactivate","force-deactivate","remove-participant"].includes(kind)){
    const p=options.participant===undefined?own:view.participants.find(p=>p.id===options.participant);
    if(!p||p.state==="removed")unavailable("The participant is unavailable.");on=p.id;
    if(kind==="activate"||kind==="deactivate"){
      if(!same(p.member,actor.member))unavailable("This member does not own the participant.");
    }else {control();if(kind==="force-deactivate"&&same(p.member,actor.member))unavailable("Use Deactivate for your own participant.");}
    if(p.state!==(kind==="activate"||kind==="remove-participant"?"inactive":"active"))unavailable("The participant state has changed.");
    if(kind!=="activate"&&view.pendingPromise&&same(view.pendingPromise.member,p.member))unavailable("Resolve this participant's live promise first.");
  }else {
    if(!b)unavailable("Initialize the counting board first.");on=b.id;
    if(kind==="commit"){
      if(!canCommit(view,actor))unavailable("This member cannot commit the next number.");on=null;
      fields={participant:own!.id,generation:b.generation,serial:b.serial+1,n:b.lastNumber+1,basis:basis(view.participants)};
    }else if(kind==="fulfill"||kind==="fail"||kind==="cancel"){
      const p=view.pledge;if(!p||b.state!=="open"||b.pledge!==p.id)unavailable("The linked promise is unavailable.");on=p.id;
      if(kind==="cancel")control();else if(!same(p.member,actor.member))unavailable("This member does not own the promise.");
      if(completion&&!same(assignedTurn(view,actor),completion.turn))unavailable("The retained completion is no longer current.");
      if(kind==="fulfill"&&!completion)unavailable("The retained completion is unavailable.");
      fields={generation:p.generation,serial:p.serial,n:p.n};
      if(kind==="fail"){
        if(!options.reason||!failureReasons.includes(options.reason))unavailable("Choose a declared failure reason.");fields["reason"]=options.reason;
      }
    }else {
      control();empty();
      if(kind==="start"&&(b.state!=="paused"||b.lastNumber>=b.target))unavailable("The board cannot start.");
      if(kind==="pause"&&b.state!=="open")unavailable("The board is not open.");
      if(kind==="reset"){
        if(!["paused","finished"].includes(b.state)||b.generation>=1000000)unavailable("Pause the board before resetting.");fields={generation:b.generation+1};
      }
    }
  }
  const expected:Record<string,number>={},act=countingCommitments.acts[kind]!;
  if(act.step==="transition"&&on!==null){const i=view.summary.items.find(i=>i.id===on);if(!i)unavailable("The selected item is unavailable.");expected["on"]=i.revision;}
  for(const [name,rule]of Object.entries(act.also)){
    const selected="one"in rule?view.summary.items.find(i=>i.type===rule.item):"by"in rule?view.summary.items.find(i=>i.id===fields[rule.by]):undefined;
    if(!selected)unavailable("A required counting item is unavailable.");expected[name]=selected.revision;
  }
  return{kind,on,fields,expected};
}
export function label(memberRef:MemberRef):string{const text=memberRef.member.slice(1);return text.charAt(0).toUpperCase()+text.slice(1);}
