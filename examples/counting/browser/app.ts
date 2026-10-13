/** One independently enrolled device owns this mounted stage. No shared Settings identity. */
import type { Summary, MemberRef } from "@generalbusiness/dap-contract";
import { canonicalize } from "@generalbusiness/artroom-bytes";
import type { Observation, ObservationState } from "@generalbusiness/artroom-client";
import { countingView, assignedTurn, canCommit, ownedParticipant, same, type CountingView, type Control, type ProposalOptions } from "./model.ts";
import { createVoiceController, type ActorIdentity, type PendingStore, type SpeechPort, type CustodyLock, type VoiceState } from "./voice-controller.ts";
import type { StageGateway, CommandOutcome } from "./client.ts";
import { stageView } from "./view.ts";
export interface MountedDevice {name?:string;identity:ActorIdentity;speech:SpeechPort;gateway:StageGateway;store:PendingStore;lock:CustodyLock;current():boolean;dispose?():void}
export interface RunnerLease { acquire(identity:ActorIdentity):Promise<(()=>void)|null> }
/** A live runner owns a different lock from the short private-command lock. */
export function browserRunnerLease():RunnerLease {
  return {acquire:identity=>new Promise(resolve=>{
    if(typeof navigator==="undefined"||!navigator.locks){resolve(null);return;}
    const name=`artroom-counting-runner:${canonicalize(identity)}`;
    void navigator.locks.request(name,{ifAvailable:true},async lock=>{
      if(!lock){resolve(null);return;}
      await new Promise<void>(released=>{resolve(released);});
    }).catch(()=>resolve(null));
  })};
}
export interface CountingStageOptions {
  speech:SpeechPort;connect():void;fake?:boolean;now?:()=>number;memberNames?():readonly {member:MemberRef;name:string}[];
  selectedVoiceId?:string|(()=>string|undefined);selectVoice?(id:string):void;
  forget?():void;changeIdentity?():void;runner?:RunnerLease;freshWaitMilliseconds?:number;
}
export function mountCountingStage(root:HTMLElement,options:CountingStageOptions) {
  let device:MountedDevice|undefined,view:CountingView|undefined,fresh=false,connection="Not connected",voiceState:VoiceState|undefined,command:string|undefined,commandOutcome:CommandOutcome["status"]|undefined,commandBusy=false,observation:Observation|undefined;
  let voice:ReturnType<typeof createVoiceController>|undefined,epoch=0,unsubscribe:(()=>void)|undefined;
  let joined=false,joinBusy=false,joinReason:string|undefined,joinEpoch=0,releaseRunner:(()=>void)|undefined,selectedVoiceId:string|undefined;
  type CandidateOutcome = "pending" | "recorded" | "refused" | "unsent" | "unknown" | "blocked";
  interface CommitCandidate { key:string; tuple:string; outcome:CandidateOutcome }
  // Notification suppression is separate from the controller's played-token
  // memory. Keep every attempted state in this mounted context, bounded.
  const candidates=new Map<string,CommitCandidate>(),latestCandidates=new Map<string,CommitCandidate>();
  const candidateLimit=512;
  let originalCandidate:CommitCandidate|undefined;
  const waiters=new Set<()=>void>();
  const candidateOutcome=(result:CommandOutcome):CandidateOutcome=>result.status==="blocked"&&"definitelyUnsent" in result&&result.definitelyUnsent===true?"unsent":result.status;
  const rememberCandidate=(candidate:CommitCandidate|undefined,result:CommandOutcome|undefined)=>{
    if(candidate&&result&&candidates.get(candidate.key)===candidate)candidate.outcome=candidateOutcome(result);
  };
  const runner=options.runner??browserRunnerLease();
  const selected=()=>selectedVoiceId??(typeof options.selectedVoiceId==="function"?options.selectedVoiceId():options.selectedVoiceId);
  const current=(at:number)=>at===epoch&&!!device&&device.current();
  const render=()=>{const chosen=selected();ui.render({...(device?{identity:device.identity,...(device.name?{deviceName:device.name}:{})}:{}),...(view?{view}:{}),fresh,connection,...(voiceState?{voice:voiceState}:{}),...(command?{command}:{}),...(commandOutcome?{commandOutcome}:{}),commandBusy,joined,joinBusy,...(options.memberNames?{memberNames:options.memberNames()}:{}),...(joinReason?{joinReason}:{}),...(chosen?{selectedVoiceId:chosen}:{}),...(device?.gateway.commandResumeReady()?{commandResumeReady:true}:{}),...(device?.gateway.pendingCommand()?{commandUnknown:true}:{}),...(options.fake?{fake:true}:{})});};
  const wake=()=>{for(const waiter of [...waiters])waiter();};
  const usableVoice=(id:string)=>!!device?.speech.voices().some(v=>v.id===id);
  const release=()=>{releaseRunner?.();releaseRunner=undefined;};
  const refuse=(reason:string)=>{joinReason=`Refused because ${reason}`;render();};
  // Local Join is valid only while this controller remains armed with a live
  // voice. Disarming never discards the original audio/report custody.
  const reconcileRunner=()=>{
    if(!joined)return;
    if(!voiceState?.armed){joined=false;release();return;}
    const id=voiceState.voiceId??selected();
    if(!id||!usableVoice(id)){
      joined=false;release();joinReason="Refused because the selected English (US) voice is unavailable. Choose a usable voice and Join again.";
      voice?.disarm();wake();
    }
  };
  const custodyAvailable=()=>!!voiceState&&!voiceState.pending&&!voiceState.audioUncertain&&!["loading","blocked","unknown","refused","disposed"].includes(voiceState.phase)&&!device?.gateway.pendingCommand();
  const waitFresh=(at:number,attempt:number,predicate:(snapshot:CountingView)=>boolean=()=>true):Promise<boolean>=>new Promise(resolve=>{
    let ended=false;let timer:ReturnType<typeof setTimeout>|undefined;
    const finish=(answer:boolean)=>{if(ended)return;ended=true;if(timer!==undefined)clearTimeout(timer);waiters.delete(check);resolve(answer);};
    const check=()=>{if(!current(at)||attempt!==joinEpoch){finish(false);return;}if(["Access unavailable","Session expired","Setup unsupported","Disconnected","Connection unavailable"].includes(connection)||device?.gateway.pendingCommand()||voiceState?.pending||voiceState?.audioUncertain){finish(false);return;}if(fresh&&view&&predicate(view))finish(true);};
    waiters.add(check);timer=setTimeout(()=>finish(false),options.freshWaitMilliseconds??15_000);check();
  });
  const observeVoice=()=>{reconcileRunner();if(!device)return;const authorized=!["Access unavailable","Session expired","Setup unsupported","Disconnected","Connection unavailable"].includes(connection);const turn=view&&fresh?assignedTurn(view,device.identity):undefined;voice?.observe({fresh:fresh&&!device.gateway.pendingCommand()&&!commandBusy,authorized,...(turn?{turn}:{})});};
  const invalidate=()=>voice?.invalidate();
  const controls=async(kind:Control,details:ProposalOptions={},candidate?:CommitCandidate):Promise<CommandOutcome|undefined>=>{
    if(!device||!device.current()||!fresh||commandBusy||device.gateway.pendingCommand())return;
    const at=epoch,held=device;commandBusy=true;fresh=false;invalidate();command="Working on it";commandOutcome=undefined;render();
    let result:CommandOutcome;
    try{result=await held.gateway.command(kind,details);}catch{result={status:"unknown",reason:"No complete answer was verified. Check the original request."};}
    if(!current(at))return;
    rememberCandidate(candidate,result);
    commandOutcome=result.status;command=result.status==="recorded"?"dap.":result.reason??"The original request remains unresolved.";
    commandBusy=false;observeVoice();wake();render();
    if(!fresh)observation?.refresh();
    claim();return result;
  };
  const claim=()=>{
    reconcileRunner();
    if(!joined||joinBusy||!releaseRunner||!device?.current()||!device||!view||!fresh||commandBusy||!voiceState?.armed||voiceState.pending||voiceState.audioUncertain||["blocked","loading","unknown","refused"].includes(voiceState.phase)||!canCommit(view,device.identity)||device.gateway.pendingCommand())return;
    const b=view.board!;
    const tuple=JSON.stringify([joinEpoch,b.generation,b.serial,b.lastNumber+1]);
    const relevantState=canonicalize([b.id,b.revision,view.participants.filter(p=>p.state==="active").sort((a,b)=>a.id-b.id).map(p=>[p.id,p.revision,p.member])]);
    const key=JSON.stringify([tuple,relevantState]);
    if(candidates.has(key))return; // A new head alone never retries this state.
    const previous=latestCandidates.get(tuple);
    if(previous&&previous.outcome!=="refused"&&previous.outcome!=="unsent")return;
    if(candidates.size>=candidateLimit){joined=false;voice?.disarm();release();refuse("automatic candidate memory is full. Reconnect before another Join; original private custody is retained.");return;}
    const candidate:CommitCandidate={key,tuple,outcome:"pending"};
    candidates.set(key,candidate);latestCandidates.set(tuple,candidate);originalCandidate=candidate;
    void controls("commit",{},candidate);
  };
  const join=async(voiceId:string):Promise<void>=>{
    if(joinBusy||!device?.current())return;
    const at=epoch,attempt=++joinEpoch;joinBusy=true;joinReason=undefined;selectedVoiceId=voiceId;options.selectVoice?.(voiceId);render();
    const alive=()=>current(at)&&attempt===joinEpoch;
    const stop=(reason:string)=>{if(!alive())return;joined=false;voice?.disarm();release();refuse(reason);};
    try{
      if(!usableVoice(voiceId)){stop("the selected English (US) voice is unavailable. Choose a usable voice.");return;}
      if(!await waitFresh(at,attempt)){stop("a fresh record is unavailable. Earlier recorded work and original requests are retained.");return;}
      if(!custodyAvailable()){stop("private voice or original-request custody is unavailable. Check the retained request.");return;}
      if(!releaseRunner){const acquired=await runner.acquire(device!.identity);if(!alive()){acquired?.();return;}if(!acquired){stop("this identity is running in another tab, or browser locking is unavailable.");return;}releaseRunner=acquired;}
      let own=ownedParticipant(view!,device!.identity);
      if(!own){const result=await controls("participate");if(!alive())return;if(result?.status!=="recorded"){stop(`participation was not confirmed. ${result?.reason??"Check the original request."}`);return;}if(!await waitFresh(at,attempt,snapshot=>!!ownedParticipant(snapshot,device!.identity))){stop("participation was recorded, but its fresh record is unavailable.");return;}own=ownedParticipant(view!,device!.identity);}
      if(own?.state==="inactive"){const result=await controls("activate");if(!alive())return;if(result?.status!=="recorded"){stop(`participation remains recorded, but activation was not confirmed. ${result?.reason??"Check the original request."}`);return;}if(!await waitFresh(at,attempt,snapshot=>ownedParticipant(snapshot,device!.identity)?.state==="active")){stop("activation was recorded, but its fresh record is unavailable.");return;}}
      if(!alive())return;
      if(ownedParticipant(view!,device!.identity)?.state!=="active"||!usableVoice(voiceId)||!custodyAvailable()){stop("the active participant, usable voice or private custody changed. Earlier acts remain recorded.");return;}
      observeVoice();
      if(!voice?.arm(voiceId)){stop("the voice cannot be armed safely. Earlier participation and activation remain recorded.");return;}
      joined=true;joinReason=undefined;
    }catch{stop("local setup could not complete. Earlier recorded acts and private originals are retained.");}
    finally{if(alive()){joinBusy=false;wake();render();claim();}}
  };
  const leave=async():Promise<void>=>{
    const at=epoch;joinEpoch++;joinBusy=false;joined=false;voice?.disarm();release();wake();render();
    if(!device?.current())return;
    if(commandBusy||device.gateway.pendingCommand()||voiceState?.pending){refuse("speech stopped locally, but a private request or audio attempt remains unresolved. Resolve it from the footer before leaving the recorded participant.");return;}
    const attempt=joinEpoch;
    if(!await waitFresh(at,attempt)){if(current(at))refuse("speech stopped locally, but a fresh record is unavailable.");return;}
    if(!current(at))return;
    const own=ownedParticipant(view!,device!.identity);
    if(!own||own.state==="inactive"){joinReason=undefined;render();return;}
    if(view!.pendingPromise&&same(view!.pendingPromise.member,device!.identity.member)){refuse("speech stopped locally, but this participant still has a live promise. Resolve it from the footer before leaving.");return;}
    const result=await controls("deactivate");if(!current(at))return;
    if(result?.status!=="recorded")refuse(`speech stopped locally, but deactivation was not confirmed. ${result?.reason??"Check the original request."}`);
    else {joinReason=undefined;render();}
  };
  const selectVoice=(id:string)=>{selectedVoiceId=id;options.selectVoice?.(id);joined=false;joinBusy=false;joinEpoch++;voice?.disarm();release();fresh=false;wake();observation?.refresh();render();};
  const check=async()=>{if(!device)return;const at=epoch,originalKind=device.gateway.pendingCommand();try{const result=await device.gateway.checkCommand();if(at!==epoch)return;if(result){if(originalKind==="commit")rememberCandidate(originalCandidate,result);commandOutcome=result.status;command=result.status==="recorded"?"dap.":result.reason??"The original command remains unresolved.";}else {command=undefined;commandOutcome=undefined;await voice?.checkPending();}}catch{if(at===epoch){command="The original request remains unresolved.";commandOutcome="unknown";}}if(at===epoch){observeVoice();render();claim();}};
  const resumeCommand=async()=>{if(!device||commandBusy)return;const at=epoch,originalKind=device.gateway.pendingCommand();commandBusy=true;fresh=false;invalidate();command="Working on the original command";commandOutcome=undefined;render();try{const result=await device.gateway.resumeCommand();if(at===epoch){if(originalKind==="commit")rememberCandidate(originalCandidate,result??undefined);commandOutcome=result?.status;command=result?.status==="recorded"?"dap.":result?.reason??"The original command remains unresolved.";}}catch{if(at===epoch){command="The original command remains unresolved.";commandOutcome="unknown";}}finally{if(at===epoch){commandBusy=false;observeVoice();wake();observation?.refresh();render();claim();}}};
  const checkReport=async()=>{if(!device)return;const at=epoch;try{await voice?.checkPending();}catch{ /* Retain blocked original custody. */ }if(at===epoch){render();claim();}};
  const disconnect=()=>{const held=device;epoch++;joinEpoch++;joined=false;joinBusy=false;joinReason=undefined;release();device=undefined;fresh=false;view=undefined;connection="Not connected";unsubscribe?.();unsubscribe=undefined;voice?.dispose();voice=undefined;held?.gateway.dispose();held?.dispose?.();observation?.cancel();observation=undefined;voiceState=undefined;command=undefined;commandOutcome=undefined;commandBusy=false;candidates.clear();latestCandidates.clear();originalCandidate=undefined;selectedVoiceId=undefined;wake();render();};
  const ui=stageView(root,{control:(kind,details)=>{void controls(kind,details);},join:id=>{void join(id);},leave:()=>{void leave();},selectVoice,forget:()=>{disconnect();options.forget?.();},changeIdentity:()=>{disconnect();(options.changeIdentity??options.connect)();},arm:id=>{if(device?.gateway.pendingCommand()||commandBusy)return;voice?.arm(id);},disarm:()=>{joined=false;joinBusy=false;joinEpoch++;release();fresh=false;voice?.disarm();wake();observation?.refresh();render();},check:()=>{void check();},checkReport:()=>{void checkReport();},resumeCommand:()=>{void resumeCommand();},resumeReport:()=>{void voice?.resumePending();},correct:()=>{void voice?.correctReport();},connect:options.connect,disconnect},options.speech);
  render();
  return{
    async attach(next:MountedDevice){disconnect();const at=epoch;device=next;connection="Connecting";
      voice=createVoiceController({identity:next.identity,speech:next.speech,reporter:next.gateway,store:next.store,lock:next.lock,current:()=>at===epoch&&next.current(),...(options.now?{now:options.now}:{})});
      unsubscribe=voice.subscribe(state=>{if(at!==epoch||!next.current())return;voiceState=state;reconcileRunner();render();wake();claim();});
      await voice.ready;if(at!==epoch||!next.current())return;await next.gateway.restoreCommand();if(at!==epoch||!next.current())return;if(next.gateway.pendingCommand()){command="Command unknown. Check its original request.";commandOutcome="unknown";}
      observation=next.gateway.observe((state:ObservationState<Summary>,given?:CountingView)=>{
        if(at!==epoch||!next.current())return;
        fresh=state.status==="current";
        if(given)view=given;else if(state.status==="current")try{view=countingView(state.snapshot.value,next.identity.scope);}catch{view=undefined;fresh=false;}
        connection=fresh?"Connected":state.status==="retained"||state.status==="refreshing"?"Updating":state.status==="reconnecting"?"Reconnecting":state.status==="connecting"?"Connecting":state.status==="forbidden"?"Access unavailable":state.status==="expired"?"Session expired":state.status==="unsupported"?"Setup unsupported":state.status==="cancelled"?"Disconnected":"Connection unavailable";
        observeVoice();wake();render();claim();
      });render();
    },
    join,leave,joined:()=>joined,getJoined:()=>joined,getSelectedVoice:()=>selected(),joinStatus:()=>({joined,busy:joinBusy,...(joinReason?{reason:joinReason}:{})}),
    disconnect,dispose(){disconnect();},repaint(){reconcileRunner();render();},
  };
}
