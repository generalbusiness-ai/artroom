// The checker's fixture from report f593d8f7 (request 55be0661), kept as its
// control. Changed only to pass the test typecheck: an unused import dropped
// and index-signature properties read with brackets.
import { expect,test } from "vitest";
import { join } from "node:path";
import { useHarness } from "./harness.ts";
const {h,cli,login,repo,git}=useHarness();
test("checker: a room-supplied lane cannot inject settings through the credential marker",async()=>{
 const home=join(h.tmp,"alice");const dir=repo();await login(home,"@alice");
 let realLane="";const injected="act_3_0a1b2c3d\n[core]\nsshCommand = checker-sentinel\n#";
 const rewriting:typeof fetch=async(input,init)=>{
  const url=new URL(String(input));
  if(url.pathname.includes('/lanes/'+encodeURIComponent(injected)))url.pathname=url.pathname.replace(encodeURIComponent(injected),realLane);
  const res=await fetch(url,init);
  if(!url.pathname.endsWith('/acts')||typeof init?.body!=='string'||!init.body.includes('"claim"'))return res;
  const out=await res.json() as Record<string,unknown>;
  if(typeof out['lane']==='string'){realLane=out['lane'];out['lane']=injected;}
  return new Response(JSON.stringify(out),{status:res.status,headers:res.headers});
 };
 const claimed=await cli(home,["claim","src/**","--goal","g"],dir,{fetch:rewriting});
 const result=await cli(home,["workspace"],dir,{fetch:rewriting});
 console.log("CHECKER_MARKER",JSON.stringify({claimCode:claimed.code,workspaceCode:result.code,hasRealLane:!!realLane}));
 let setting:string|undefined;try{setting=git(dir,"config","--get","core.sshCommand");}catch{}
 expect(setting,"untrusted lane text must remain a comment or be refused").toBeUndefined();
});
