/** All data is literal text. The stage never displays private requests or keys. */
import { controllerOf, label, ownedParticipant, same, type Control, type CountingView } from "./model.ts";
import type { ActorIdentity, SpeechPort, VoiceState } from "./voice-controller.ts";
export interface StagePresentation {identity?:ActorIdentity;view?:CountingView;fresh:boolean;connection:string;voice?:VoiceState;command?:string;commandUnknown?:boolean;commandBusy?:boolean;fake?:boolean}
export interface StageActions {control(kind:Control):void;arm(voiceId:string):void;disarm():void;check():void;correct():void;connect():void;disconnect():void}
const make=<K extends keyof HTMLElementTagNameMap>(tag:K,className?:string,text?:string):HTMLElementTagNameMap[K]=>{const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;};
const icon=(name:string)=>{const paths:Record<string,string>={join:"M15 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 8v6M16 11h6",leave:"M9 4H5v16h4M12 12h10M18 8l4 4-4 4",start:"M7 4l14 8-14 8z",pause:"M8 4v16M16 4v16",reset:"M3 9V3m0 6h6M3 9a9 9 0 1 1 0 6"};const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");svg.setAttribute("viewBox","0 0 24 24");svg.setAttribute("aria-hidden","true");const path=document.createElementNS(svg.namespaceURI,"path");path.setAttribute("d",paths[name]??"");path.setAttribute("fill","none");path.setAttribute("stroke","currentColor");path.setAttribute("stroke-width","1.8");path.setAttribute("stroke-linecap","round");path.setAttribute("stroke-linejoin","round");svg.append(path);return svg;};
export function stageView(root:HTMLElement,actions:StageActions,speech:SpeechPort) {
  const header=make("header","masthead"),title=make("h1",undefined,"Agents that count"),status=make("span","status");header.append(title,status);
  const main=make("main","stage"),numberArea=make("section","number-stage"),caption=make("p","caption","Recorded number"),number=make("div","number","—"),assignment=make("p","assignment"),notice=make("p","notice");numberArea.setAttribute("aria-label","Counting state");number.setAttribute("aria-live","polite");numberArea.append(caption,number,assignment,notice);
  const cards=make("section","agents");cards.setAttribute("aria-label","Agents");const controls=make("nav","controls");controls.setAttribute("aria-label","Counting controls");
  const inspection=make("details","inspection"),summary=make("summary",undefined,"Record and definition"),record=make("p","record"),definition=make("p","definition");inspection.append(summary,record,definition);
  const footer=make("footer","footer"),connect=make("button","text-button","Connect this device"),disconnect=make("button","text-button","Disconnect device"),checkCommand=make("button","text-button","Check command");connect.onclick=actions.connect;disconnect.onclick=actions.disconnect;checkCommand.onclick=actions.check;footer.append(connect,disconnect,checkCommand);
  main.append(numberArea,cards,controls,inspection,footer);root.replaceChildren(header,main);
  let selectedVoice:string|undefined;
  return{render(p:StagePresentation){
    const b=p.view?.board;status.textContent=p.fresh?b?.state==="running"?"Running":b?.state==="finished"?"Finished":b?"Paused":"Initialize first":p.connection;
    status.classList.toggle("running",p.fresh&&b?.state==="running");number.textContent=b?String(b.lastNumber):"—";
    number.classList.toggle("retained",!!b&&!p.fresh);
    assignment.textContent=b?.state==="running"&&b.speaker&&b.number?`${label(b.speaker)} is assigned ${b.number}`:b?.state==="finished"?"Target reached":b?"Ready for the next turn":"Connect an enrolled device to begin";
    const pending=p.voice?.pending;notice.textContent=p.command??(pending==="unknown"?"Report unknown. Check the original request.":pending==="refused"?"Report needs a current successor proposal.":p.voice?.phase==="speaking"?"Playing on this device":p.voice?.phase==="reporting"?"Reporting completed playback":!p.fresh&&b?"Last known count · awaiting the scope":p.voice?.message??"");
    cards.replaceChildren();const roster=p.view?.participants??[];
    if(!roster.length){const empty=make("p","empty","Join with your own enrolled device. Each agent chooses a voice.");cards.append(empty);}
    for(const [index,agent]of roster.entries()){
      const own=!!p.identity&&same(agent.member,p.identity.member),active=!!b?.speaker&&same(agent.member,b.speaker);
      const card=make("article",`agent${active?" active":""}`),heading=make("div","agent-heading"),initial=make("span",`avatar color-${index%3}`,label(agent.member).slice(0,1)),names=make("div"),name=make("h2",undefined,label(agent.member)),handle=make("p","handle",agent.member.member);names.append(name,handle);heading.append(initial,names);card.append(heading,make("p","device",own?"This device":"Another device"));
      if(own){const voices=speech.voices(),field=make("label","voice-label","Voice"),select=make("select");select.setAttribute("aria-label","Voice for this device");for(const voice of voices){const option=make("option",undefined,voice.name);option.value=voice.id;select.append(option);}selectedVoice=voices.some(v=>v.id===selectedVoice)?selectedVoice:voices[0]?.id;if(selectedVoice)select.value=selectedVoice;select.onchange=()=>{selectedVoice=select.value;actions.disarm();};field.append(select);const arm=make("button","arm",p.voice?.armed?"Voice armed":"Arm voice");arm.disabled=!p.fresh||!voices.length||!!pending||!!p.commandBusy||!!p.commandUnknown;arm.onclick=()=>{if(selectedVoice)actions.arm(selectedVoice);};card.append(field,arm);
        if(pending){const check=make("button","text-button",pending==="unknown"?"Check report":"Update report");check.onclick=pending==="unknown"?actions.check:actions.correct;check.disabled=!p.fresh||pending==="refused"&&!p.voice?.correctionReady;card.append(check);}
      }else card.append(make("p","joined","Joined"));cards.append(card);
    }
    controls.replaceChildren();const own=p.identity&&p.view?ownedParticipant(p.view,p.identity):undefined,isController=!!p.identity&&!!p.view&&controllerOf(p.view,p.identity);
    const add=(kind:Control,text:string,disabled:boolean,primary=false)=>{const button=make("button",`control${primary?" primary":""}`,undefined);button.append(icon(kind),make("span",undefined,text));button.disabled=disabled;button.onclick=()=>actions.control(kind);controls.append(button);};const blocked=!p.fresh||!!pending||!!p.commandBusy||!!p.commandUnknown||!p.identity;
    if(p.view&&!b)add("initialize","Initialize",blocked||!isController,true);
    add("join","Join",blocked||!!own||!b||roster.length>=8);add("leave","Leave",blocked||!own||!b);
    add("start","Start",blocked||!isController||b?.state!=="paused"||!roster.length,b?.state==="paused");add("pause","Pause",blocked||!isController||b?.state!=="running",b?.state==="running");add("reset","Reset",blocked||!isController||!b);
    record.textContent=b?`Last recorded: ${b.lastNumber}${b.lastSpeaker?` · ${b.lastSpeaker.member}`:""}. Generation ${b.generation}, turn ${b.serial}.`:"No initialized native board is loaded.";
    definition.textContent=p.identity?`counting · ${p.identity.definition}. Join · Leave · Start · Pause · Reset · Spoken.`:"A verified counting scope and this device's own enrollment are required. Factory/enrollment setup is separate.";
    connect.hidden=!!p.identity;disconnect.hidden=!p.identity;checkCommand.hidden=!p.commandUnknown;footer.querySelector(".qualification")?.remove();if(p.fake)footer.append(make("span","qualification","Fake transport · Fake speech · No audio"));
  }};
}
