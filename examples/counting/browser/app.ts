/** One independently enrolled device owns this mounted stage. No shared Settings identity. */
import type { Summary } from "@generalbusiness/artroom-contract";
import type { Observation, ObservationState } from "@generalbusiness/artroom-client";
import { countingView, assignedTurn, type CountingView, type Control } from "./model.ts";
import { createVoiceController, type ActorIdentity, type PendingStore, type SpeechPort, type CustodyLock, type VoiceState } from "./voice-controller.ts";
import type { StageGateway } from "./client.ts";
import { stageView } from "./view.ts";
export interface MountedDevice {identity:ActorIdentity;speech:SpeechPort;gateway:StageGateway;store:PendingStore;lock:CustodyLock;current():boolean;dispose?():void}
export function mountCountingStage(root:HTMLElement,options:{speech:SpeechPort;connect():void;fake?:boolean;now?:()=>number}) {
  let device:MountedDevice|undefined,view:CountingView|undefined,fresh=false,connection="Not connected",voiceState:VoiceState|undefined,command:string|undefined,commandBusy=false,observation:Observation|undefined;
  let voice:ReturnType<typeof createVoiceController>|undefined,epoch=0,unsubscribe:(()=>void)|undefined;
  const render=()=>ui.render({...(device?{identity:device.identity}:{}),...(view?{view}:{}),fresh,connection,...(voiceState?{voice:voiceState}:{}),...(command?{command}:{}),commandBusy,...(device?.gateway.pendingCommand()?{commandUnknown:true}:{}),...(options.fake?{fake:true}:{})});
  const invalidate=()=>voice?.invalidate();
  const controls=async(kind:Control)=>{if(!device||!fresh||commandBusy)return;const at=epoch;invalidate();commandBusy=true;command="Submitting this device's command";render();try{const result=await device.gateway.command(kind);if(at!==epoch)return;command=result.status==="unknown"?result.reason??"Command unknown. Check its original request.":undefined;if(result.status==="blocked"||result.status==="refused")command=result.reason??"The configured service refused this first attempt.";}catch{if(at===epoch)command="No complete answer was verified.";}if(at===epoch){commandBusy=false;render();}};
  const check=async()=>{if(!device)return;const at=epoch;try{const result=await device.gateway.checkCommand();if(at!==epoch)return;if(result){command=result.status==="unknown"?result.reason??"Command remains unresolved.":undefined;}else await voice?.checkPending();}catch{if(at===epoch)command="The original request remains unresolved.";}if(at===epoch)render();};
  const disconnect=()=>{const held=device;epoch++;device=undefined;fresh=false;view=undefined;connection="Not connected";unsubscribe?.();unsubscribe=undefined;voice?.dispose();voice=undefined;held?.gateway.dispose();held?.dispose?.();observation?.cancel();observation=undefined;voiceState=undefined;command=undefined;commandBusy=false;render();};
  const ui=stageView(root,{control:kind=>{void controls(kind);},arm:id=>{voice?.arm(id);},disarm:()=>voice?.disarm(),check:()=>{void check();},correct:()=>{void voice?.correctReport();},connect:options.connect,disconnect},options.speech);
  render();
  return{
    async attach(next:MountedDevice){disconnect();const at=epoch;device=next;connection="Connecting";
      voice=createVoiceController({identity:next.identity,speech:next.speech,reporter:next.gateway,store:next.store,lock:next.lock,current:()=>at===epoch&&next.current(),...(options.now?{now:options.now}:{})});
      unsubscribe=voice.subscribe(state=>{if(at!==epoch||!next.current())return;voiceState=state;render();});
      await voice.ready;if(at!==epoch||!next.current())return;await next.gateway.restoreCommand();if(at!==epoch||!next.current())return;if(next.gateway.pendingCommand())command="Command unknown. Check its original request.";
      observation=next.gateway.observe((state:ObservationState<Summary>,given?:CountingView)=>{
        if(at!==epoch||!next.current())return;
        fresh=state.status==="current";
        if(given)view=given;else if(state.status==="current")try{view=countingView(state.snapshot.value,next.identity.scope);}catch{view=undefined;fresh=false;}
        connection=fresh?"Connected":state.status==="retained"?"Updating":state.status==="refreshing"?"Updating":state.status==="reconnecting"?"Reconnecting":state.status==="connecting"?"Connecting":state.status==="forbidden"?"Access unavailable":state.status==="expired"?"Session expired":state.status==="unsupported"?"Setup unsupported":state.status==="cancelled"?"Disconnected":"Connection unavailable";
        const authorized=!["forbidden","expired","error","unsupported","cancelled"].includes(state.status);
        const turn=view&&fresh?assignedTurn(view,next.identity):undefined;
        voice?.observe({fresh:fresh&&!next.gateway.pendingCommand(),authorized,...(turn?{turn}:{})});render();
      });render();
    },
    disconnect,
    dispose(){disconnect();},
    repaint:render,
  };
}
