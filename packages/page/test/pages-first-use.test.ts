import { afterEach, expect, test } from "vitest";
import { canonicalize, definitionDigest, digestBytes, keyIdOfSecret, utf8 } from "@generalbusiness/artroom-bytes";
import { DIGESTS } from "@generalbusiness/artroom-lanes";
import { holdsRulesExtent } from "@generalbusiness/artroom-platform";
import { PAGES_PRESET, PAGES_PRESET_BYTES, PAGES_PRESET_DIGEST, PAGES_RULES } from "../src/pages-preset.ts";
import { invitationTask, type InvitationTaskState } from "../src/invitation-task.ts";
import { setupPages } from "../src/pages-setup.ts";
import type { Room } from "../src/data.ts";

// Descriptor-only witness; no activation, provider or seeded-fixture readiness claim.
test("Pages descriptor pins full exported definition closure and explicit @2 with independent human review and fixed authority extent",()=>{
  expect(PAGES_PRESET_DIGEST).toBe(digestBytes(utf8(PAGES_PRESET_BYTES)));
  expect(PAGES_PRESET.definitions.map(d=>[d.name,d.digest,definitionDigest(JSON.parse(d.bytes)),utf8(d.bytes).length])).toEqual([["issue",DIGESTS.issue,DIGESTS.issue,46160],["change",DIGESTS.change,DIGESTS.change,59715]]);
  expect(PAGES_PRESET.runtime.cohort).toEqual({register:"platform:register@2",directory:"platform:directory@2",membership:"platform:membership@2",rules:"platform:rules@2",destination:"platform:destination@2"});
  expect(PAGES_RULES).toMatchObject({approvals:1,ownerMayReview:false,singleControllerException:false,checks:[],labels:[]});
  expect(holdsRulesExtent(PAGES_RULES.extents)).toBe(true); expect(PAGES_RULES.extents.every(e=>e.approvals===1&&e.checks.length===0)).toBe(true);
  expect(PAGES_PRESET_BYTES).toBe(canonicalize(PAGES_PRESET));
});

test("unreviewed preset cannot reach activation, storage or transport",async()=>{
  let stores=0; let reads=0;const secret=new Uint8Array(32);
  const room={session:{service:"https://room.test",secret,fetch:async()=>{reads++;return new Response(JSON.stringify({ok:false,reason:"forbidden"}));}},directory:"sc_dir",membership:{scope:"sc_members",kind:"membership",inc:"in_test"},rules:"sc_rules",key:keyIdOfSecret(secret)} as unknown as Room;
  await expect(setupPages(room,{getItem(){stores++;return null;},setItem(){stores++;}},{current:()=>true,approvedDescriptor:"unreviewed",locks:{request:async(_name,run)=>run()}})).rejects.toThrow("reviewed");
  expect(stores).toBe(0);expect(reads).toBe(0);
});

class Element { children:(Element|string)[]=[]; attrs=new Map<string,string>();listeners=new Map<string,((e:{preventDefault():void})=>void)[]>();disabled=false;constructor(readonly tag:string){}setAttribute(k:string,v:string){this.attrs.set(k,v);}append(...c:(Element|string)[]){this.children.push(...c);}replaceChildren(...c:(Element|string)[]){this.children=c;}addEventListener(n:string,f:(e:{preventDefault():void})=>void){this.listeners.set(n,[...this.listeners.get(n)??[],f]);}get textContent():string{return this.children.map(c=>typeof c==="string"?c:c.textContent).join("");}get value(){return this.attrs.get("value")??this.textContent;}set value(v:string){this.attrs.set("value",v);}all():Element[]{return[this,...this.children.flatMap(c=>typeof c==="string"?[]:c.all())];}event(n:string){for(const f of this.listeners.get(n)??[])f({preventDefault(){}});}}
let descriptor:PropertyDescriptor|undefined;
afterEach(()=>{if(descriptor)Object.defineProperty(globalThis,"document",descriptor);else Reflect.deleteProperty(globalThis,"document");});

test("ordinary invitation task delegates one enrollment, has no raw-key fields and unknown exposes only owned exact reconciliation",async()=>{
  descriptor=Object.getOwnPropertyDescriptor(globalThis,"document");Object.defineProperty(globalThis,"document",{configurable:true,value:{createElement:(t:string)=>new Element(t)}});
  let state:InvitationTaskState={invitation:"artroom-invite:private-fragment",status:"",phase:"idle"};let joins=0;let checks=0;let release!:()=>void;
  const boundary=new Promise<void>(resolve=>{release=resolve;});
  const opts={state:()=>state,draft:(v:string)=>{state.invitation=v;},join:async()=>{joins++;await boundary;state={...state,phase:"unknown",status:"Original enrollment outcome unknown",canCheck:true};},check:async()=>{checks++;}};
  const host=invitationTask(opts)as unknown as Element;
  expect(host.all().filter(e=>e.tag==="textarea").map(e=>e.attrs.get("name"))).toEqual(["invitation"]);
  expect(host.all().some(e=>e.tag==="input")).toBe(false);
  const form=host.all().find(e=>e.tag==="form")!;form.event("submit");form.event("submit");expect(joins).toBe(1);
  release();await boundary;await Promise.resolve();await Promise.resolve();
  expect(host.textContent).toContain("Check original request");host.all().find(e=>e.tag==="form")!.event("submit");expect(joins).toBe(1);
  host.all().find(e=>e.tag==="button"&&e.textContent==="Check original request")!.event("click");await Promise.resolve();expect(checks).toBe(1);
});
