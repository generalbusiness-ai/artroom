import * as L from "../../../packages/log/src/crypto.ts";
import * as R from "../../../packages/room/src/crypto.ts";
import * as C from "../../../packages/client/src/keys.ts";
import * as G from "../../../packages/git/src/publisher/log-push.ts";
import * as K from "../../../packages/checkers/src/signing.ts";
const eq=(a,b)=>a===null?b===null:b!==null&&a.length===b.length&&a.every((x,i)=>x===b[i]);
let enc=0; for(let n=0;n<200;n++){const b=crypto.getRandomValues(new Uint8Array(n)); const s=[L.b64url(b),R.b64url(b),C.toBase64Url(b),G.toB64url(b),K.b64url(b)]; if(new Set(s).size!==1) enc++;}
console.log("encoder mismatches",enc);
const tryf=(f,s)=>{try{return f(s)}catch(e){return "THROW:"+(e.code??e.name)}};
for (const s of ["AB","AA","A","AAAAA","AA==","A B","QQ","QR","", "AAAA\n"]) {
 const l=L.unb64url(s), r=R.unb64url(s);
 console.log(JSON.stringify(s), "log",l&&[...l], "room",r&&[...r], "client",(x=>typeof x==="string"?x:[...x])(tryf(C.fromBase64Url,s)), "git",(x=>typeof x==="string"?x:[...x])(tryf(G.fromB64url,s)), "checkers",(x=>typeof x==="string"?x:[...x])(tryf(K.fromB64url,s)));
}
let dm=0; for(let i=0;i<20000;i++){const n=Math.floor(Math.random()*60);let s="";for(let j=0;j<n;j++)s+="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"[Math.floor(Math.random()*64)]; if(!eq(L.unb64url(s),R.unb64url(s)))dm++;}
console.log("log vs room decoder mismatches", dm);
