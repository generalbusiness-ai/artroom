/** All data is literal text. The stage never displays private requests or keys. */
import { controllerOf, label, ownedParticipant, same, type Control, type ProposalOptions, type CountingView, type Participant } from "./model.ts";
import type { MemberRef } from "@generalbusiness/dap-contract";
import type { CommandOutcome } from "./client.ts";
import type { ActorIdentity, SpeechPort, VoiceState } from "./voice-controller.ts";
export interface StagePresentation {
  identity?:ActorIdentity; deviceName?:string; view?:CountingView; fresh:boolean; connection:string; voice?:VoiceState;
  command?:string; commandOutcome?:CommandOutcome["status"]; commandUnknown?:boolean;
  commandResumeReady?:boolean; commandBusy?:boolean; fake?:boolean;
  memberNames?:readonly {member:MemberRef;name:string}[]; joined?:boolean; selectedVoiceId?:string; joinBusy?:boolean; joinReason?:string;
}
export interface StageActions {
  control(kind:Control,details?:ProposalOptions):void; arm(voiceId:string):void; disarm():void;
  check():void; checkReport():void; resumeCommand():void; resumeReport():void; correct():void;
  connect():void; disconnect():void; join?(voiceId:string):void; leave?():void;
  forget?():void; changeIdentity?():void; selectVoice?(voiceId:string):void;
}
const make=<K extends keyof HTMLElementTagNameMap>(tag:K,className?:string,text?:string):HTMLElementTagNameMap[K]=>{
  const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;
};
const icon=(name:string)=>{
  const paths:Record<string,string>={start:"M7 4l14 8-14 8z",pause:"M8 4v16M16 4v16",reset:"M3 9V3m0 6h6M3 9a9 9 0 1 1 0 6"};
  const svg=document.createElementNS("http://www.w3.org/2000/svg","svg"),path=document.createElementNS(svg.namespaceURI,"path");
  svg.setAttribute("viewBox","0 0 24 24");svg.setAttribute("aria-hidden","true");path.setAttribute("d",paths[name]??"");
  for(const [key,value]of Object.entries({fill:"none",stroke:"currentColor","stroke-width":"1.8","stroke-linecap":"round","stroke-linejoin":"round"}))path.setAttribute(key,value);
  svg.append(path);return svg;
};
const keyedButton=(text:string,key:string,run:()=>void,className="text-button")=>{
  const button=make("button",className,text);button.type="button";button.dataset["focusKey"]=key;button.onclick=run;return button;
};
export function stageView(root:HTMLElement,actions:StageActions,speech:SpeechPort) {
  const header=make("header","masthead"),titleGroup=make("div","masthead-title"),title=make("h1",undefined,"Agents that count"),status=make("span","status");
  const wordmark=make("a","wordmark-link");wordmark.href="https://dap.generalbusiness.ai/";wordmark.setAttribute("aria-label","dap homepage");
  for(const [file,theme]of [["/brand/dap-wordmark.svg","light"],["/brand/dap-wordmark-white.svg","dark"]]as const){const image=make("img",`wordmark wordmark-${theme}`);image.src=file;image.alt="dap";wordmark.append(image);}
  titleGroup.append(wordmark,title);header.append(titleGroup,status);
  const main=make("main","stage"),numberArea=make("section","number-stage"),caption=make("p","caption","Count"),number=make("div","number"),assignment=make("p","assignment"),notice=make("p","notice"),acknowledgement=make("p","acknowledgement"),memberCount=make("p","member-count");
  numberArea.setAttribute("aria-label","Counting state");number.setAttribute("aria-live","polite");acknowledgement.setAttribute("role","status");notice.setAttribute("role","status");
  let latest:StagePresentation={fresh:false,connection:"Not connected"},selectedVoice:string|undefined,selectedFor:string|undefined,externalSelection:string|undefined;
  const join=()=>{if(latest.identity&&selectedVoice)actions.join?.(selectedVoice);else actions.connect();};
  const connect=keyedButton("Connect this device","connect",actions.connect,"control primary stage-connect");
  const joinStage=keyedButton("Join room","join-stage",()=>{if(latest.identity)actions.changeIdentity?.();else actions.connect();},"control primary stage-join");
  numberArea.append(caption,number,assignment,connect,joinStage,memberCount,notice,acknowledgement);
  const controls=make("nav","controls controller-controls");controls.setAttribute("aria-label","Room controls");
  const buttons=new Map<Control,HTMLButtonElement>();
  for(const [kind,text]of [["start","Start"],["pause","Pause"],["reset","Reset"]]as const){const button=keyedButton("",kind,()=>actions.control(kind),"control");button.append(icon(kind),make("span",undefined,text));buttons.set(kind,button);controls.append(button);}
  const initialize=keyedButton("Initialize","initialize",()=>actions.control("initialize"),"control primary");
  const initialization=make("div","initialization");initialization.append(initialize);
  const rosterSection=make("section","roster"),rosterLabel=make("h2","roster-label"),cards=make("div","agents");rosterSection.setAttribute("aria-label","Members");rosterSection.append(rosterLabel,cards);
  const personal=make("section","personal-strip");personal.setAttribute("aria-label","This device");
  const ownName=make("span","own-name"),field=make("label","voice-label","Your voice"),select=make("select");select.setAttribute("aria-label","Voice for this device");select.dataset["focusKey"]="voice";
  select.onchange=()=>{selectedVoice=select.value;if(actions.selectVoice)actions.selectVoice(select.value);else actions.disarm();};field.append(select);
  const changeIdentity=keyedButton("Change identity","change-identity",()=>actions.changeIdentity?.());
  const joinOwn=keyedButton("Join room","join",join,"control primary"),leave=keyedButton("Leave room","leave",()=>actions.leave?.(),"control");
  personal.append(ownName,field,changeIdentity,joinOwn,leave);
  const inspection=make("details","inspection"),summary=make("summary",undefined,"Record and definition"),record=make("p","record"),definition=make("p","definition");inspection.append(summary,record,definition);
  const footer=make("footer","footer"),disconnect=keyedButton("Disconnect device","disconnect",actions.disconnect),forget=keyedButton("Forget this device","forget",()=>actions.forget?.()),checkCommand=keyedButton("Check command","check-command",actions.check),checkReport=keyedButton("Check report","check-report",actions.checkReport),updateReport=keyedButton("Update report","update-report",actions.correct),resumeReport=keyedButton("Resume original report","resume-report",actions.resumeReport),resumeCommand=keyedButton("Resume original command","resume-command",actions.resumeCommand);
  const fail=keyedButton("Mark uncertain speech failed","fail",()=>actions.control("fail",{reason:"speech-uncertain"})),cancel=keyedButton("Cancel pledge","cancel",()=>actions.control("cancel"));
  const qualification=make("span","qualification","Fake transport · Fake speech · No audio");footer.append(disconnect,forget,fail,cancel,checkCommand,checkReport,updateReport,resumeReport,resumeCommand,qualification);
  main.append(numberArea,controls,initialization,rosterSection,personal,inspection,footer);root.replaceChildren(header,main);
  type Row={element:HTMLElement;avatar:HTMLElement;name:HTMLElement;device:HTMLElement;state:HTMLElement;deactivate:HTMLButtonElement;remove:HTMLButtonElement;management:HTMLElement;managementName:HTMLElement;agent:Participant};
  const rows=new Map<number,Row>();
  const createRow=(agent:Participant):Row=>{
    const element=make("article","agent"),avatar=make("span","avatar"),name=make("h2"),device=make("p","device"),names=make("div","agent-name"),state=make("p","joined"),management=make("div","member-management");names.append(name,device);
    const managementName=make("span","management-name");const row:Row={element,avatar,name,device,state,agent,management,managementName,deactivate:keyedButton("Deactivate","deactivate-"+agent.id,()=>actions.control("force-deactivate",{participant:row.agent.id})),remove:keyedButton("Remove","remove-"+agent.id,()=>actions.control("remove-participant",{participant:row.agent.id}),"text-button removal")};
    management.append(managementName,row.deactivate,row.remove);inspection.append(management);element.append(avatar,names,state);return row;
  };
  return{render(p:StagePresentation){
    latest=p;const memberLabel=(member:MemberRef)=>p.memberNames?.find(named=>same(named.member,member))?.name??(p.identity&&same(p.identity.member,member)?p.deviceName:undefined)??label(member);
    const b=p.view?.board,roster=(p.view?.participants??[]).filter(agent=>agent.state!=="removed"),own=p.identity&&p.view?ownedParticipant(p.view,p.identity):undefined;
    const isController=!!p.identity&&!!p.view&&controllerOf(p.view,p.identity),pending=p.voice?.pending,blocked=!p.fresh||!!pending||!!p.commandBusy||!!p.commandUnknown||!!p.joinBusy||!p.identity;
    const disconnected=!p.identity,waiting=!!p.identity&&!p.fresh&&["Connecting","Updating","Reconnecting"].includes(p.connection),confirmedEmpty=!!p.view&&p.fresh&&roster.length===0;
    status.textContent=p.fresh?b?.state==="open"?"Running":b?.state==="finished"?"Finished":b?"Paused":"Connected":p.connection;
    status.classList.toggle("running",p.fresh&&b?.state==="open");numberArea.classList.toggle("no-count",!b||confirmedEmpty);
    caption.hidden=!b||confirmedEmpty;number.hidden=false;number.textContent=disconnected?"No device connected":b&&!confirmedEmpty?String(b.lastNumber):waiting?"Awaiting the room":!p.fresh?"Connection unavailable":confirmedEmpty?"No members in the room":"Counting has not started";
    number.classList.toggle("retained",!!b&&!p.fresh);number.classList.toggle("empty-heading",!b||confirmedEmpty||disconnected);
    assignment.textContent=b?.state==="open"&&b.speaker&&b.number!==null?`${memberLabel(b.speaker)} promised ${b.number}`:b?.state==="finished"?"Target reached":b?"Ready for the next count":"";
    assignment.hidden=!assignment.textContent||disconnected||confirmedEmpty;
    connect.hidden=!disconnected;joinStage.hidden=!confirmedEmpty;memberCount.hidden=!confirmedEmpty;memberCount.textContent=confirmedEmpty?"0 members":"";
    const displayedCommand=p.commandOutcome==="recorded"?undefined:p.command;
    notice.textContent=p.joinReason??displayedCommand??(pending==="unknown"?"Report unknown. Check the original request.":pending==="refused"?"Report needs a current successor proposal.":p.voice?.phase==="speaking"?"Playing on this device":p.voice?.phase==="reporting"?"Reporting completed playback":!p.fresh&&b?`Last known count · ${waiting?"awaiting the room":p.connection.toLowerCase()}`:p.voice?.message??(!p.fresh&&!waiting&&!disconnected?p.connection:""));
    // Recorded is emitted only after verification of the exact native receipt.
    acknowledgement.textContent=p.fresh&&!p.commandUnknown&&!p.commandBusy&&!p.joinBusy&&!p.joinReason&&!pending&&(p.commandOutcome==="recorded"&&(!p.voice||p.voice.phase==="idle"||p.voice.phase==="recorded")||!p.command&&p.voice?.phase==="recorded")?"dap.":"";
    acknowledgement.hidden=!acknowledgement.textContent;notice.hidden=!!acknowledgement.textContent;notice.classList.toggle("refused",!!p.joinReason||!!displayedCommand&&p.commandOutcome==="refused"||!displayedCommand&&pending==="refused");
    controls.hidden=!isController;initialization.hidden=!isController||!p.view||!!b;initialize.disabled=blocked;
    for(const [kind,button]of buttons){button.disabled=blocked||!isController||!b||!!p.view?.pendingPromise||(kind==="start"?b.state!=="paused":kind==="pause"?b.state!=="open":!["paused","finished"].includes(b.state));button.classList.toggle("primary",kind==="start"&&b?.state==="paused"||kind==="pause"&&b?.state==="open");}
    const focused=document.activeElement instanceof HTMLElement&&root.contains(document.activeElement)?document.activeElement:undefined;
    for(const [id,row]of rows)if(!roster.some(agent=>agent.id===id)){row.element.remove();row.management.remove();rows.delete(id);}
    for(const agent of roster){let row=rows.get(agent.id);if(!row){row=createRow(agent);rows.set(agent.id,row);cards.append(row.element);}row.agent=agent;
      const ours=!!p.identity&&same(agent.member,p.identity.member),promised=!!b?.speaker&&same(agent.member,b.speaker);
      row.managementName.textContent=memberLabel(agent.member);row.avatar.textContent=memberLabel(agent.member).slice(0,1);row.name.textContent=memberLabel(agent.member);row.device.textContent=ours?"This device":"Another device";row.element.classList.toggle("active",promised);
      row.state.textContent=promised&&b?.number!==null?`Promised ${b?.number}`:ours?p.joined?"Joined":"Not joined":agent.state==="active"?"Joined":"Not joined";
      row.deactivate.hidden=!isController||ours||agent.state!=="active";row.remove.hidden=!isController||agent.state!=="inactive";
      const live=!!p.view?.pendingPromise&&same(p.view.pendingPromise.member,agent.member);row.deactivate.disabled=blocked||live;row.remove.disabled=blocked||live;
    }
    rosterSection.hidden=roster.length===0;rosterLabel.textContent=`${roster.length} ${roster.length===1?"member":"members"}`;
    personal.hidden=!p.identity;ownName.textContent=p.identity?`${memberLabel(p.identity.member)} · This device`:"";ownName.hidden=!!own;
    const identityKey=p.identity?JSON.stringify(p.identity.member):undefined;
    if(identityKey!==selectedFor){selectedFor=identityKey;selectedVoice=p.selectedVoiceId??p.voice?.voiceId;externalSelection=p.selectedVoiceId;}
    else if(p.selectedVoiceId!==externalSelection){selectedVoice=p.selectedVoiceId;externalSelection=p.selectedVoiceId;}
    const voices=speech.voices();select.replaceChildren();const available=!!selectedVoice&&voices.some(v=>v.id===selectedVoice);
    if(!available){const placeholder=make("option",undefined,selectedVoice?"Selected voice unavailable":"Choose an English (US) voice");placeholder.value=selectedVoice??"";select.append(placeholder);}
    for(const voice of voices){const option=make("option",undefined,voice.name);option.value=voice.id;select.append(option);}select.value=selectedVoice??"";select.disabled=!!pending||!!p.commandBusy||!!p.commandUnknown||!!p.joinBusy;
    joinOwn.hidden=!!p.joined;joinOwn.disabled=blocked||!available;joinOwn.textContent=p.joinBusy?"Joining…":"Join room";leave.hidden=!p.joined;leave.disabled=!!p.joinBusy||!!p.commandBusy;
    changeIdentity.disabled=!!p.joinBusy||!!p.commandBusy;forget.disabled=!!p.joinBusy||!!p.commandBusy;
    record.textContent=b?`Last recorded: ${b.lastNumber}${b.lastSpeaker?` · ${b.lastSpeaker.member}`:""}. Generation ${b.generation}, turn ${b.serial}.`:p.fresh&&p.view?"Counting has not started.":"No current counting record is loaded.";
    inspection.hidden=!p.identity;
    definition.textContent=p.identity?`counting-commitments · ${p.identity.definition}. The room records each promise and completion.`:"";
    disconnect.hidden=!p.identity;forget.hidden=!p.identity||!actions.forget;fail.hidden=!p.view?.pledge||!same(p.view.pledge.member,p.identity?.member);fail.disabled=(!p.fresh||!!p.commandBusy||!!p.commandUnknown||!!pending&&!p.voice?.audioUncertain);
    cancel.hidden=!isController||!p.view?.pledge;cancel.disabled=(!p.fresh||!!p.commandBusy||!!p.commandUnknown||!!pending&&!p.voice?.audioUncertain);
    checkCommand.hidden=!p.commandUnknown;checkReport.hidden=!p.identity||!pending;checkReport.disabled=p.voice?.phase==="reporting";
    updateReport.hidden=!p.identity||pending!=="refused";updateReport.disabled=!p.fresh||!p.voice?.correctionReady;
    resumeReport.hidden=!p.identity||!pending||!p.voice?.resumeReady;resumeReport.disabled=p.voice?.phase==="reporting";
    resumeCommand.hidden=!p.identity||!p.commandUnknown||!p.commandResumeReady;resumeCommand.disabled=!!p.commandBusy;qualification.hidden=!p.fake;
    // Stable nodes retain focus. If a removed row owned it, return to this device's strip.
    if(focused&&(!root.contains(focused)||focused.hidden)&&!personal.hidden&&!changeIdentity.disabled)changeIdentity.focus({preventScroll:true});
  }};
}
