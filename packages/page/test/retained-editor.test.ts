import { afterEach, expect, test, vi } from "vitest";
import { canonicalize, definitionDigest, digestBytes, keyIdOfSecret, newIncarnation, scopeIdOf, utf8 } from "@generalbusiness/artroom-bytes";
import type { ScopeRef } from "@generalbusiness/artroom-contract";
import { changeDemo } from "@generalbusiness/artroom-lanes";
import { secretSigner, signedIntent } from "@generalbusiness/artroom-client";
import { actAssociation, type ChangeView, type Room } from "../src/data.ts";
import { retainedEditor } from "../src/retained-editor.ts";
import { continueEdit, editFields, prepareEdit, type EditTask } from "../src/retained-editor-data.ts";
vi.mock("../src/retained-editor-data.ts", async () => ({ ...await vi.importActual<typeof import("../src/retained-editor-data.ts")>("../src/retained-editor-data.ts"), prepareEdit: vi.fn(async () => { throw new Error("Stopped at the read-only preparation boundary"); }), continueEdit: vi.fn() }));

// DOM STAND-IN only: native authority/signing is exercised in retained-editor.scope.test.ts.
class Element {
  children: (Element|string)[] = []; attrs = new Map<string,string>(); listeners = new Map<string, (()=>void)[]>(); disabled=false;
  constructor(readonly tag: string) {}
  setAttribute(k:string,v:string){this.attrs.set(k,v);} append(...c:(Element|string)[]){this.children.push(...c);} replaceChildren(...c:(Element|string)[]){this.children=c;}
  addEventListener(n:string,f:()=>void){this.listeners.set(n,[...this.listeners.get(n)??[],f]);}
  querySelector(t:string){return this.all().find(e=>e.tag===t) ?? null;} focus(){}
  get value(){const value=this.attrs.get("value") ?? this.textContent;return this.tag==="textarea"?value.replace(/\r\n?/g,"\n"):value;} set value(v:string){this.attrs.set("value",v);}
  get textContent():string{return this.children.map(c=>typeof c==="string"?c:c.textContent).join("");}
  all():Element[]{return [this,...this.children.flatMap(c=>typeof c==="string"?[]:c.all())];}
  event(n:string){for(const f of this.listeners.get(n)??[]) (f as unknown as (event:{preventDefault():void})=>void)({preventDefault(){}});}
}
let descriptor:PropertyDescriptor|undefined;
afterEach(()=>{if(descriptor)Object.defineProperty(globalThis,"document",descriptor);else Reflect.deleteProperty(globalThis,"document");});

test("invalid retained path keeps its corrected draft through explicit unsent recovery; attempted or partial tasks keep their original custody",async()=>{
  vi.mocked(prepareEdit).mockClear(); vi.mocked(continueEdit).mockReset();
  descriptor=Object.getOwnPropertyDescriptor(globalThis,"document"); Object.defineProperty(globalThis,"document",{configurable:true,value:{createElement:(t:string)=>new Element(t)}});
  const secret=new Uint8Array(32), opening=digestBytes(utf8("scripted retained opening")), digest=definitionDigest(changeDemo);
  // Structurally valid identities only; these scripted seeds assert no native authority.
  const directory:ScopeRef={scope:scopeIdOf({v:1,kind:"directory",definition:"platform:directory@1",creator:null,cause:opening,ordinal:0}),inc:newIncarnation(new Uint8Array(16)),kind:"directory"};
  const sourceScope:ScopeRef={scope:scopeIdOf({v:1,kind:"lane",definition:digest,creator:directory,cause:opening,ordinal:3}),inc:newIncarnation(new Uint8Array(16).fill(3)),kind:"lane"};
  const room:Room={session:{service:"https://room.test",secret},directory:directory.scope,
    membership:{scope:scopeIdOf({v:1,kind:"membership",definition:"platform:membership@1",creator:directory,cause:opening,ordinal:0}),inc:newIncarnation(new Uint8Array(16).fill(1)),kind:"membership"},
    rules:scopeIdOf({v:1,kind:"rules",definition:"platform:rules@1",creator:directory,cause:opening,ordinal:1}),
    destination:scopeIdOf({v:1,kind:"destination",definition:"platform:destination@1",creator:directory,cause:opening,ordinal:2}),
    key:keyIdOfSecret(secret),me:null,reader:null,unsessioned:null,definitions:new Map()};
  const change={scope:sourceScope.scope,manifests:[{id:4,state:"current",file:{path:"../outside.md",digest:digestBytes(utf8("<script>literal</script>")),size:24,content:"<script>literal</script>"}}]} as unknown as ChangeView;
  let current=true;
  let rendered=retainedEditor(room,change,{current:()=>current}) as unknown as Element;
  expect(rendered.textContent).toContain("Create corrected proposal"); rendered.all().find(e=>e.tag==="button")!.event("click"); expect(rendered.textContent).toContain("Current file comparison is unavailable"); expect(rendered.textContent).toContain("Reloading or closing it loses");
  const inputs=rendered.all().filter(e=>e.tag==="input"); expect(inputs.map(e=>e.attrs.get("aria-label"))).toEqual(["Proposal title","Target file path"]);
  inputs[1]!.value="inside.md"; inputs[1]!.event("input");
  rendered=retainedEditor(room,change,{current:()=>current}) as unknown as Element;
  expect(rendered.all().find(e=>e.attrs.get("aria-label")==="Target file path")!.value).toBe("inside.md");
  expect(rendered.all().find(e=>e.tag==="textarea")!.value).toBe("<script>literal</script>");
  expect(rendered.all().some(e=>e.tag==="script")).toBe(false);

  // Lifecycle/DOM STAND-IN: native source/authority/base rejection and zero
  // mutation POSTs remain exercised unchanged in retained-editor.scope.test.ts.
  const draft={title:"Edit ../outside.md",path:"inside.md",content:"<script>literal</script>"};
  const makeTask=(base:string):EditTask=>({association:actAssociation(room,change.scope),
    source:{definition:digest,manifestFact:{at:sourceScope,seq:4,hash:opening},sourceFact:{at:sourceScope,seq:4,hash:opening},scope:sourceScope,manifest:4,opened:opening,base:"c".repeat(40),path:"../outside.md",digest:digestBytes(utf8(draft.content)),size:24,content:draft.content},
    draft:{...draft},base,definition:digest,definitionBytes:canonicalize(changeDemo),declared:changeDemo,
    context:{service:room.session.service,directory,membership:room.membership,key:room.key,rules:room.rules,destination:room.destination},
    workflow:"legacy",directory,steps:[],state:"prepared",message:"Confirm this freshly read base",busy:false});
  const button=(label:string)=>rendered.all().find(e=>e.tag==="button"&&e.textContent===label);
  const flush=async()=>{await Promise.resolve();await Promise.resolve();};
  const fields=()=>rendered.all().filter(e=>e.tag==="input"||e.tag==="textarea");
  const moved=makeTask("a".repeat(40));vi.mocked(prepareEdit).mockResolvedValueOnce(moved);
  rendered.all().find(e=>e.tag==="form")!.event("submit");await flush();
  expect(fields().every(e=>e.disabled)).toBe(true);expect(continueEdit).not.toHaveBeenCalled();
  vi.mocked(continueEdit).mockImplementationOnce(async(_room,task)=>{task.state="stopped";task.message="The published base moved. Nothing new was sent.";});
  button("Confirm new proposal")!.event("click");await flush();
  expect(moved.steps).toEqual([]);expect(rendered.textContent).toContain("published base moved");
  button("Back to edit")!.event("click");
  expect(fields().every(e=>!e.disabled)).toBe(true);expect(fields().map(e=>e.value)).toEqual([draft.title,draft.path,draft.content]);
  expect(prepareEdit).toHaveBeenCalledTimes(1);expect(continueEdit).toHaveBeenCalledTimes(1);

  const fresh=makeTask("b".repeat(40));vi.mocked(prepareEdit).mockResolvedValueOnce(fresh);
  rendered.all().find(e=>e.tag==="form")!.event("submit");await flush();
  expect(rendered.textContent).toContain(fresh.base);expect(vi.mocked(prepareEdit).mock.calls[1]![3]).toEqual(draft);
  expect(continueEdit).toHaveBeenCalledTimes(1); // Prepare never confirms.
  const signed=await signedIntent(secretSigner(secret),{to:directory,kind:"open-pr",on:null,fields:{definition:digest,title:draft.title,body:"scripted source reference",draft:false},expected:{}});
  vi.mocked(continueEdit).mockImplementationOnce(async(_room,task)=>{task.steps.push({kind:"open-pr",target:directory,signed,grants:[],beside:{},attempted:false});task.state="stopped";task.message="The first task-room read failed before submission.";});
  button("Confirm new proposal")!.event("click");await flush();
  expect(fresh.steps[0]!.attempted).toBe(false);expect(rendered.textContent).toContain("read failed");
  const oldBack=button("Back to edit")!;
  current=false;oldBack.event("click");expect(fields().every(e=>e.disabled)).toBe(true);
  current=true;fresh.busy=true;oldBack.event("click");expect(fields().every(e=>e.disabled)).toBe(true);
  fresh.busy=false;oldBack.event("click");expect(fields().every(e=>!e.disabled)).toBe(true);
  expect(fields().map(e=>e.value)).toEqual([draft.title,draft.path,draft.content]);

  const uncertain=makeTask("b".repeat(40));vi.mocked(prepareEdit).mockResolvedValueOnce(uncertain);
  rendered.all().find(e=>e.tag==="form")!.event("submit");await flush();
  oldBack.event("click");expect(fields().every(e=>e.disabled)).toBe(true); // Old control cannot clear a newer task.
  const offered=button("Back to edit")!;
  vi.mocked(continueEdit).mockImplementationOnce(async(_room,task)=>{task.steps.push({kind:"open-pr",target:directory,signed,grants:[],beside:{},attempted:true});task.state="unknown";task.message="Lost answer; original request retained.";});
  button("Confirm new proposal")!.event("click");await flush();
  const original=JSON.stringify(uncertain.steps);offered.event("click");
  expect(button("Back to edit")).toBeUndefined();expect(fields().every(e=>e.disabled)).toBe(true);expect(JSON.stringify(uncertain.steps)).toBe(original);
  expect(prepareEdit).toHaveBeenCalledTimes(3);expect(continueEdit).toHaveBeenCalledTimes(3);

  // Even a stopped tag cannot discard attempted/answered/unverified work or
  // partial native locators. Retain the same task; there is no fresh Prepare.
  const step=uncertain.steps[0]!;uncertain.state="stopped";
  const redraw=()=>{rendered=retainedEditor(room,change,{current:()=>current}) as unknown as Element;};
  redraw();expect(button("Back to edit")).toBeUndefined();
  step.answer={answer:"accepted",receipt:{fact:{at:directory,seq:1,hash:opening},definition:"platform:directory@1",intent:null,effects:[],sends:[],epoch:0}};
  uncertain.lane=scopeIdOf({v:1,kind:"lane",definition:digest,creator:directory,cause:opening,ordinal:4});uncertain.proposal=1;
  const partial=JSON.stringify(uncertain);redraw();expect(button("Back to edit")).toBeUndefined();offered.event("click");expect(JSON.stringify(uncertain)).toBe(partial);
  step.attempted=false;redraw();expect(button("Back to edit")).toBeUndefined(); // Answer alone still fences recovery.
  delete step.answer;step.receiptVerified=true;redraw();expect(button("Back to edit")).toBeUndefined();
  delete step.receiptVerified;redraw();expect(button("Back to edit")).toBeUndefined(); // Partial locators remain.
  delete uncertain.lane;delete uncertain.proposal;uncertain.version={at:sourceScope,seq:4,hash:opening};redraw();expect(button("Back to edit")).toBeUndefined();
  delete uncertain.version;uncertain.collectedSource={at:sourceScope,seq:4,hash:opening};redraw();expect(button("Back to edit")).toBeUndefined();
  delete uncertain.collectedSource;uncertain.state="refused";redraw();expect(button("Back to edit")).toBeUndefined();
  expect(prepareEdit).toHaveBeenCalledTimes(3);expect(continueEdit).toHaveBeenCalledTimes(3);
});

test("text limits count UTF-8 bytes losslessly, preserve BOM and allow empty file without delete",()=>{
  const content="\ufeff"+"é".repeat(32766)+"x";
  const fields=editFields({title:"Exact",path:"docs/a.md",content},"a".repeat(40));
  expect(fields["size"]).toBe(65536); expect(fields["digest"]).toBe(digestBytes(utf8(content))); expect(fields["content"]).toBe(content);
  expect(()=>editFields({title:"Too long",path:"a.md",content:content+"x"},"a".repeat(40))).toThrow("65,536");
  expect(editFields({title:"Empty",path:"a.md",content:""},"a".repeat(40))["size"]).toBe(0);
  for(const invalid of ["\ud800","a\0b"])expect(()=>editFields({title:"No",path:"a.md",content:invalid},"a".repeat(40))).toThrow("UTF-8");
});


// The DOM stand-in models the real textarea API newline normalization;
// final browser proof must still use an actual textarea under root's QA.
test("title/path-only input preserves untouched BOM CRLF/CR bytes while deliberate text input uses the edited textarea value",async()=>{
  vi.mocked(prepareEdit).mockClear();
  descriptor=Object.getOwnPropertyDescriptor(globalThis,"document");Object.defineProperty(globalThis,"document",{configurable:true,value:{createElement:(tag:string)=>new Element(tag)}});
  const secret=new Uint8Array(32);const room={session:{service:"https://room.test",secret},directory:"sc_crlf_dir",membership:{scope:"sc_members",inc:"one",kind:"membership"},key:keyIdOfSecret(secret)} as unknown as Room;
  const exact="\ufefffirst\r\nsecond\rthird";
  const change={scope:"sc_crlf_change",manifests:[{id:7,state:"current",file:{path:"a.md",digest:digestBytes(utf8(exact)),size:utf8(exact).length,content:exact}}]} as unknown as ChangeView;
  let shown=retainedEditor(room,change,{current:()=>true}) as unknown as Element;shown.all().find(e=>e.tag==="button")!.event("click");
  const textarea=shown.all().find(e=>e.tag==="textarea")!;expect(textarea.value).toBe("\ufefffirst\nsecond\nthird");
  shown.all().find(e=>e.attrs.get("aria-label")==="Proposal title")!.value="Title edit";shown.all().find(e=>e.attrs.get("aria-label")==="Proposal title")!.event("input");
  shown.all().find(e=>e.attrs.get("aria-label")==="Target file path")!.value="b.md";shown.all().find(e=>e.attrs.get("aria-label")==="Target file path")!.event("input");
  shown=retainedEditor(room,change,{current:()=>true}) as unknown as Element;
  expect(shown.all().find(e=>e.tag==="textarea")!.textContent).toBe(exact);
  shown.all().find(e=>e.tag==="form")!.event("submit");
  await Promise.resolve(); await Promise.resolve();
  expect(vi.mocked(prepareEdit).mock.calls[0]![3]).toEqual({title:"Title edit",path:"b.md",content:exact});
  expect(editFields(vi.mocked(prepareEdit).mock.calls[0]![3],"a".repeat(40))["digest"]).toBe(digestBytes(utf8(exact)));

  shown=retainedEditor(room,change,{current:()=>true}) as unknown as Element;
  const edited=shown.all().find(e=>e.tag==="textarea")!;edited.value="new\r\ntext";edited.event("input");
  shown=retainedEditor(room,change,{current:()=>true}) as unknown as Element;
  expect(shown.all().find(e=>e.tag==="textarea")!.textContent).toBe("new\ntext");
});
