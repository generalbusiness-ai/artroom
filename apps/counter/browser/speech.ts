/** Browser-native source adapter. Rendered QA injects fake speech instead. */
import type { SpeechPort } from "./voice-controller.ts";
export function browserSpeech():SpeechPort {
  const synth=globalThis.speechSynthesis;
  return{
    voices:()=>synth?synth.getVoices().filter(v=>v.lang==="en-US").map(v=>({id:v.voiceURI,name:`${v.name} · ${v.lang}`})):[],
    play:(text,id,callbacks)=>{
      if(!synth)throw new Error("Browser speech is unavailable.");
      const voice=synth.getVoices().find(v=>v.voiceURI===id&&v.lang==="en-US");if(!voice)throw new Error("The selected English (US) browser voice is unavailable.");
      const utterance=new SpeechSynthesisUtterance(text);utterance.voice=voice;utterance.lang=voice.lang;
      let cancelled=false;utterance.onend=()=>{if(!cancelled)callbacks.end();};utterance.onerror=()=>{if(!cancelled)callbacks.error();};
      synth.speak(utterance);return()=>{cancelled=true;utterance.onend=utterance.onerror=null;synth.cancel();};
    },
  };
}
