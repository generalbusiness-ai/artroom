import "./style.css";
document.title="dap - counting";
import { nativeGateway } from "./client.ts";
import { mountCountingStage } from "./app.ts";
import { deviceSigner, importDemoBundle, importLegacyDevice, type SavedDevice } from "./device-key.ts";
import { browserSpeech } from "./speech.ts";
import { browserLock, privateCommandStore, privateDeviceStore, privatePendingStore } from "./storage.ts";
const speech=browserSpeech(),custody=privateDeviceStore();
let custodyEpoch:string|undefined;
let active=0,devices:SavedDevice[]=[],selectedKey:string|undefined,selectedVoice:string|undefined,remember=true,busy=false;
const channel=typeof BroadcastChannel==="function"?new BroadcastChannel("dap-counter-device-custody"):undefined;
const app=mountCountingStage(document.querySelector<HTMLElement>("#counting")!,{speech,memberNames:()=>devices.map(device=>({member:device.binding.member,name:device.name})),connect:openDialog,changeIdentity:openDialog,forget:()=>{void forget();},selectedVoiceId:()=>selectedVoice,selectVoice:id=>{const changed=selectedVoice!==id;selectedVoice=id;if(changed){const at=active;void saveChoice().then(saved=>{if(!saved&&at===active){openDialog();message.textContent="refused because the remembered voice choice could not be saved";}});}}});
const dialog=document.createElement("dialog");dialog.className="join-dialog";
dialog.innerHTML=`<form><div class="dialog-heading"><h2>Join room</h2><button type="button" class="dialog-close" data-close aria-label="Close Join room">×</button></div>
<div class="demo-import-row"><p data-saved></p><button type="button" class="text-button" data-import>Import demo file</button><input data-bundle type="file" accept="application/json,.json" hidden></div>
<fieldset><legend>Choose this device’s identity</legend><div class="demo-identities" data-identities></div></fieldset>
<label>Voice · English (US)<select data-voice></select></label><label class="remember-choice"><input data-remember type="checkbox" checked>Remember my choice</label>
<p class="setup-message" role="status"></p><details class="setup-help"><summary>Setup help</summary><p>Import the demo file once in each browser. Each identity needs its existing supported counting binding and enrolled key. Joining uses that identity’s current permissions.</p>
<label>Public device binding<input data-binding type="file" accept="application/json,.json"></label><label>Own enrolled key file<input data-key type="file"></label><button type="button" data-legacy>Import legacy device</button></details>
<div class="dialog-controls"><button type="button" data-cancel>Cancel</button><button type="submit" class="primary" data-join>Join room</button></div></form>`;
document.body.append(dialog);
const form=dialog.querySelector<HTMLFormElement>("form")!,message=dialog.querySelector<HTMLElement>(".setup-message")!,identities=dialog.querySelector<HTMLElement>("[data-identities]")!,saved=dialog.querySelector<HTMLElement>("[data-saved]")!;
const voice=dialog.querySelector<HTMLSelectElement>("[data-voice]")!,rememberBox=dialog.querySelector<HTMLInputElement>("[data-remember]")!,bundle=dialog.querySelector<HTMLInputElement>("[data-bundle]")!,binding=dialog.querySelector<HTMLInputElement>("[data-binding]")!,key=dialog.querySelector<HTMLInputElement>("[data-key]")!,join=dialog.querySelector<HTMLButtonElement>("[data-join]")!;
let returnFocus:HTMLElement|null=null;
const currentDevice=()=>devices.find(d=>d.binding.publicKey===selectedKey);
function renderVoices(){
 const chosen=selectedVoice,available=speech.voices();voice.replaceChildren();
 if(chosen&&!available.some(v=>v.id===chosen)){const e=document.createElement("option");e.value=chosen;e.textContent="Selected English (US) voice unavailable";e.disabled=true;voice.append(e);}
 if(!available.length&&!chosen){const e=document.createElement("option");e.value="";e.textContent="No English (US) voice available";voice.append(e);}
 for(const item of available){const e=document.createElement("option");e.value=item.id;e.textContent=item.name;voice.append(e);}
 if(chosen)voice.value=chosen;
 join.disabled=busy||!currentDevice()||!available.some(v=>v.id===voice.value);
}
function renderPicker(){
 saved.textContent=devices.length?"Demo identities saved in this browser":"Import demo identities for this browser";identities.replaceChildren();
 for(const device of devices){const row=document.createElement("label");row.className="demo-identity";const input=document.createElement("input");input.type="radio";input.name="identity";input.value=device.binding.publicKey;input.checked=device.binding.publicKey===selectedKey;input.onchange=()=>{selectedKey=device.binding.publicKey;message.textContent="";join.disabled=busy||!speech.voices().some(v=>v.id===voice.value);};const initial=document.createElement("span");initial.className="avatar";initial.textContent=device.name.slice(0,1);const name=document.createElement("span");name.textContent=device.name;row.append(input,initial,name);identities.append(row);}
 renderVoices();
}
function openDialog(){active++;app.disconnect();returnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;message.textContent="";rememberBox.checked=remember;renderPicker();if(!dialog.open)dialog.showModal();}
function closeDialog(){if(busy)return;active++;dialog.close();returnFocus?.focus();}
dialog.querySelector<HTMLButtonElement>("[data-close]")!.onclick=closeDialog;dialog.querySelector<HTMLButtonElement>("[data-cancel]")!.onclick=closeDialog;
dialog.addEventListener("cancel",event=>{if(busy){event.preventDefault();return;}active++;});
voice.onchange=()=>{selectedVoice=voice.value;message.textContent="";join.disabled=busy||!currentDevice()||!speech.voices().some(v=>v.id===voice.value);};
globalThis.speechSynthesis?.addEventListener("voiceschanged",()=>{renderVoices();app.repaint();});
async function saveChoice(){const at=active;try{await custody.save(devices,remember&&selectedKey&&selectedVoice?{publicKey:selectedKey,voiceId:selectedVoice}:undefined,()=>at===active,custodyEpoch);return at===active;}catch{if(at===active)message.textContent="refused because the remembered choice could not be saved";return false;}}
async function mountDevice(device:SavedDevice){const at=++active;app.disconnect();try{const signer=await deviceSigner(device);if(at!==active)return false;const identity=device.binding,store=privatePendingStore(identity),lock=browserLock(identity,custodyEpoch),commandStore=privateCommandStore(identity),gateway=nativeGateway(identity,signer,{current:()=>at===active,lock,voiceStore:store,commandStore});await app.attach({identity,name:device.name,speech,gateway,store,lock,current:()=>at===active,dispose:()=>{if(at===active)active++;}});return at===active;}catch{if(at===active){openDialog();message.textContent="refused because remembered identity or original-request custody could not be restored; original requests remain intact";}return false;}}
async function importFile(legacy=false){
 if(busy)return;const at=++active;busy=true;renderPicker();message.textContent="Importing this browser’s demo identities";let first:Uint8Array|undefined,second:Uint8Array|undefined;
 try{const lease=await custody.load(()=>at===active);if(at!==active)return;if(legacy){const a=binding.files?.[0],b=key.files?.[0];if(!a||!b||a.size>16384||b.size>256)throw new Error();first=new Uint8Array(await a.arrayBuffer());second=new Uint8Array(await b.arrayBuffer());}else{const f=bundle.files?.[0];if(!f||f.size>65536)throw new Error();first=new Uint8Array(await f.arrayBuffer());}
 const imported=legacy?[await importLegacyDevice(first!,second!,location.origin)]:await importDemoBundle(first!,location.origin);if(at!==active)return;await custody.save(imported,undefined,()=>at===active,lease.epoch);if(at!==active)return;custodyEpoch=lease.epoch;devices=imported;selectedKey=devices[0]?.binding.publicKey;selectedVoice=undefined;message.textContent="";
 }catch{if(at===active)message.textContent="refused because this browser needs a supported demo file, matching enrolled keys and available private custody";}
 finally{first?.fill(0);second?.fill(0);bundle.value="";binding.value="";key.value="";busy=false;renderPicker();}
}
dialog.querySelector<HTMLButtonElement>("[data-import]")!.onclick=()=>bundle.click();
bundle.onchange=()=>{void importFile();};dialog.querySelector<HTMLButtonElement>("[data-legacy]")!.onclick=()=>{void importFile(true);};
form.addEventListener("submit",event=>{event.preventDefault();void(async()=>{
 if(busy)return;const device=currentDevice(),voiceId=voice.value;if(!device||!speech.voices().some(v=>v.id===voiceId)){message.textContent="refused because an identity and an available English (US) voice are required";return;}
 busy=true;remember=rememberBox.checked;selectedVoice=voiceId;renderPicker();message.textContent="Working on joining the room";
 try{if(!await mountDevice(device))return;if(!await saveChoice())return;await app.join(voiceId);if(app.joined()){dialog.close();returnFocus?.focus();}else message.textContent="The complete Join is not confirmed. Check the stage for its reason and recovery actions.";}catch{message.textContent="refused because this device could not complete its connection and Join; retained original requests remain available";}finally{busy=false;renderPicker();}
})();});
function clearMounted(){active++;app.disconnect();custodyEpoch=undefined;devices=[];selectedKey=undefined;selectedVoice=undefined;remember=false;form.reset();message.textContent="";renderPicker();}
async function forget(){clearMounted();const at=active;try{await custody.forget();channel?.postMessage({type:"forgotten"});}catch{if(at===active){openDialog();message.textContent="refused because remembered identity custody could not be cleared";}}}
// BroadcastChannel only updates presentation; the persisted epoch is authoritative.
channel?.addEventListener("message",event=>{if(event.data?.type==="forgotten")clearMounted();});
void(async()=>{const at=++active;try{const held=await custody.load(()=>at===active);if(at!==active)return;custodyEpoch=held.epoch;devices=held.devices;if(held.choice){selectedKey=held.choice.publicKey;selectedVoice=held.choice.voiceId;remember=true;const device=currentDevice();if(device)await mountDevice(device);}renderPicker();}catch{if(at===active){openDialog();message.textContent="refused because remembered identity custody is unavailable";}}})();
