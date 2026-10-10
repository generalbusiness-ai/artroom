/** Proposals are convenience inputs. The pinned scope checks every selection and change. */
import type { FieldValue, MemberRef, ScopeRef, Summary } from "@generalbusiness/artroom-contract";
import { canonicalize, isMemberRef, timeMs } from "@generalbusiness/artroom-bytes";
import { counting } from "../definition.ts";
import { COUNTING_DEFINITION } from "../pin.ts";
import type { ActorIdentity, Completion, TurnToken } from "./voice-controller.ts";

export interface Participant { id: number; revision: number; member: MemberRef }
export interface Board { id: number; revision: number; state: "paused"|"running"|"finished"; target: number; generation: number; serial: number; lastNumber: number; number: number|null; speaker: MemberRef|null; lastSpeaker: MemberRef|null; until: number|null; lastSpokenAt: FieldValue|null }
export interface CountingView { summary: Summary; configuration: {id:number;revision:number;target:number;controller:MemberRef}; board: Board|null; participants: Participant[] }
export type Control = "initialize"|"join"|"leave"|"start"|"pause"|"reset";
export interface Proposal { kind:string; on:number|null; fields:Record<string,FieldValue>; expected:Record<string,number> }
export const same = (a:unknown,b:unknown):boolean => canonicalize(a)===canonicalize(b);
const numeric = (v:unknown,min:number,max:number):number => { if(typeof v!=="number"||!Number.isSafeInteger(v)||v<min||v>max)throw new Error("The counting snapshot has invalid values.");return v; };
const member = (v:unknown):MemberRef|null => v===null||v===undefined?null:isMemberRef(v)?v:(()=>{throw new Error("The counting snapshot has an invalid member.");})();

export function countingView(summary:Summary,scope:ScopeRef):CountingView {
  if(!same(summary.scope,scope)||summary.definition!==COUNTING_DEFINITION||summary.status!=="active")throw new Error("This is not the configured counting scope and pin.");
  const configurations=summary.items.filter(i=>i.type==="configuration");
  const boards=summary.items.filter(i=>i.type==="board");
  if(configurations.length!==1||boards.length>1)throw new Error("The counting configuration is unavailable.");
  const c=configurations[0]!,controller=member(c.parties["controller"]);if(!controller)throw new Error("The counting controller is unavailable.");
  const participants=summary.items.filter(i=>i.type==="participant"&&i.state==="joined").map(i=>{const agent=member(i.parties["agent"]);if(!agent)throw new Error("A counting participant is unavailable.");return{id:i.id,revision:i.revision,member:agent};}).sort((a,b)=>a.id-b.id);
  if(participants.length>8||new Set(participants.map(p=>canonicalize(p.member))).size!==participants.length)throw new Error("The counting roster is invalid.");
  let board:Board|null=null;
  if(boards.length){const b=boards[0]!;if(!["paused","running","finished"].includes(b.state))throw new Error("The counting state is invalid.");const target=numeric(b.values["target"],1,100);board={id:b.id,revision:b.revision,state:b.state as Board["state"],target,generation:numeric(b.values["generation"],0,1000000),serial:numeric(b.values["serial"],0,1000000),lastNumber:numeric(b.values["lastNumber"],0,target),number:b.values["number"]==null?null:numeric(b.values["number"],1,target),speaker:member(b.parties["speaker"]),lastSpeaker:member(b.parties["lastSpeaker"]),until:b.values["until"]==null?null:timeMs(b.values["until"]),lastSpokenAt:b.refs["lastSpokenAt"]??null};if(board.state==="running"&&(!board.number||!board.speaker||board.until===null))throw new Error("The assigned turn is incomplete.");}
  return{summary,configuration:{id:c.id,revision:c.revision,target:numeric(c.values["target"],1,100),controller},board,participants};
}
export function ownedParticipant(view:CountingView,actor:ActorIdentity):Participant|undefined{return view.participants.find(p=>same(p.member,actor.member));}
export function controllerOf(view:CountingView,actor:ActorIdentity):boolean{return same(view.configuration.controller,actor.member);}
export function assignedTurn(view:CountingView,actor:ActorIdentity):TurnToken|undefined {
  const b=view.board;if(!b||b.state!=="running"||!b.speaker||!same(b.speaker,actor.member)||b.number===null||b.until===null)return undefined;
  return{...actor,generation:b.generation,serial:b.serial,N:b.number,expiresAt:b.until};
}
const basis=(roster:Participant[]):FieldValue[]=>roster.map(p=>({id:p.id,member:p.member}));
/** No proposal mutates this snapshot or decides which submitted fields are admitted. */
export function proposal(view:CountingView,actor:ActorIdentity,kind:Control|"spoken",completion?:Completion):Proposal {
  const b=view.board;let on:number|null=null;let fields:Record<string,FieldValue>={};
  if(kind==="initialize"){if(b)throw new Error("The board is already initialized.");}
  else if(kind==="join"){if(!b)throw new Error("Initialize the counting board first.");if(ownedParticipant(view,actor))throw new Error("This member is already joined.");}
  else{
    if(!b)throw new Error("Initialize the counting board first.");
    on=b.id;
    if(kind==="pause")fields={nextSerial:b.serial+1};
    else if(kind==="reset")fields={generation:b.generation+1};
    else if(kind==="leave"){
      const own=ownedParticipant(view,actor);if(!own)throw new Error("This member is not joined.");on=own.id;const remaining=view.participants.filter(p=>p.id!==own.id);fields={generation:b.generation,serial:b.serial,nextSerial:b.serial+1,basis:basis(remaining),replace:remaining.length>0,...(remaining.length?{next:remaining[b.lastNumber%remaining.length]!.id}:{})};
    }else{
      const roster=view.participants;if(!roster.length)throw new Error("Join a participant before starting.");
      const n=kind==="spoken"?completion?.turn.N:b.lastNumber+1;if(n===undefined)throw new Error("The retained completion is unavailable.");
      const nextN=n===b.target?b.target:n+1;
      const next=roster[((kind==="spoken"?nextN:n)-1)%roster.length]!;
      fields=kind==="spoken"?{generation:completion!.turn.generation,serial:completion!.turn.serial,n,nextN,nextSerial:b.serial+1,basis:basis(roster),next:next.id}:{n,nextSerial:b.serial+1,basis:basis(roster),next:next.id};
    }
  }
  const expected:Record<string,number>={};const act=counting.acts[kind]!;
  if(act.step==="transition"&&on!==null){const i=view.summary.items.find(i=>i.id===on);if(i)expected["on"]=i.revision;}
  for(const [name,rule]of Object.entries(act.also)){const selected="one"in rule?view.summary.items.find(i=>i.type===rule.item):"by"in rule?view.summary.items.find(i=>i.id===fields[rule.by]):undefined;if(selected)expected[name]=selected.revision;}
  return{kind,on,fields,expected};
}
export function label(memberRef:MemberRef):string{const text=memberRef.member.slice(1);return text.charAt(0).toUpperCase()+text.slice(1);}
