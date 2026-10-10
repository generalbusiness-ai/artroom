import "./style.css";
import { isKeyId, isMemberRef, isScopeRef, unb64url } from "@generalbusiness/artroom-bytes";
import { COUNTING_DEFINITION } from "../pin.ts";
import { nativeGateway } from "./client.ts";
import { mountCountingStage } from "./app.ts";
import { browserSpeech } from "./speech.ts";
import { browserLock, privateCommandStore, privatePendingStore } from "./storage.ts";
import type { ActorIdentity } from "./voice-controller.ts";
const root=document.querySelector<HTMLElement>("#counting")!;
const speech=browserSpeech();let active=0;
const app=mountCountingStage(root,{speech,connect:()=>dialog.showModal()});
globalThis.speechSynthesis?.addEventListener("voiceschanged",()=>app.repaint());
const dialog=document.createElement("dialog");dialog.innerHTML='<form method="dialog"><h2>Connect this device</h2><p>Use a verified F1 counting binding and this member’s own enrolled signing key. This stage does not create or enroll a member.</p><label>Public device binding<input name="binding" type="file" accept="application/json,.json" required></label><label>Own enrolled key file<input name="key" type="file" required></label><p class="setup-message" role="status"></p><div class="dialog-controls"><button type="button" data-close>Cancel</button><button type="submit">Connect</button></div></form>';
document.body.append(dialog);dialog.querySelector<HTMLButtonElement>("[data-close]")!.onclick=()=>{active++;dialog.close();};
dialog.addEventListener("cancel",()=>{active++;});
const form=dialog.querySelector<HTMLFormElement>("form")!,message=dialog.querySelector<HTMLElement>(".setup-message")!;
form.addEventListener("submit",event=>{event.preventDefault();void(async()=>{
  let secret:Uint8Array|null|undefined;app.disconnect();const attempt=++active;
  try{
    const binding=(form.elements.namedItem("binding") as HTMLInputElement).files?.[0],keyFile=(form.elements.namedItem("key") as HTMLInputElement).files?.[0];
    if(!binding||!keyFile||binding.size>16*1024||keyFile.size>256)throw new Error();
    const data=JSON.parse(await binding.text()) as ActorIdentity&{cohort?:{directory?:string;membership?:string;rules?:string;destination?:string}};
    const url=new URL(data.origin);if(url.origin!==data.origin||url.username||url.password||url.pathname!=="/"||url.search||url.hash||!["https:","http:"].includes(url.protocol))throw new Error();
    if(data.definition!==COUNTING_DEFINITION||typeof data.deployment!=="string"||!data.deployment||data.deployment.length>128||!isScopeRef(data.scope)||!isScopeRef(data.membership)||!isMemberRef(data.member)||!isKeyId(data.publicKey))throw new Error();
    if(data.cohort?.directory!=="platform:directory@5"||data.cohort.membership!=="platform:membership@4"||data.cohort.rules!=="platform:rules@3"||data.cohort.destination!=="platform:destination@2")throw new Error();
    const raw=new Uint8Array(await keyFile.arrayBuffer()),parsed=raw.length===32?raw:unb64url(new TextDecoder().decode(raw).trim());secret=parsed;if(!secret||secret.length!==32)throw new Error();
    const identity:ActorIdentity={origin:data.origin,deployment:data.deployment,scope:data.scope,definition:data.definition,membership:data.membership,member:data.member,publicKey:data.publicKey};
    if(attempt!==active)return;const at=attempt,store=privatePendingStore(identity),lock=browserLock(identity),commandStore=privateCommandStore(identity);
    const gateway=nativeGateway(identity,secret,{current:()=>at===active,lock,voiceStore:store,commandStore});
    await app.attach({identity,speech,gateway,store,lock,current:()=>at===active,dispose:()=>{if(at===active)active++;}});
    if(attempt===active){form.reset();dialog.close();}
  }catch{if(attempt===active)message.textContent="This device needs a valid supported binding, its matching enrolled key and available private custody. F1/enrollment remains a separate prerequisite.";}finally{secret?.fill(0);}
})();});
