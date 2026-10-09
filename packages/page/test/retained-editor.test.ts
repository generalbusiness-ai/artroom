import { afterEach, expect, test, vi } from "vitest";
import { digestBytes, keyIdOfSecret, utf8 } from "@generalbusiness/artroom-bytes";
import type { ChangeView, Room } from "../src/data.ts";
import { retainedEditor } from "../src/retained-editor.ts";
import { editFields, prepareEdit } from "../src/retained-editor-data.ts";
vi.mock("../src/retained-editor-data.ts", async () => ({ ...await vi.importActual<typeof import("../src/retained-editor-data.ts")>("../src/retained-editor-data.ts"), prepareEdit: vi.fn(async () => { throw new Error("Stopped at the read-only preparation boundary"); }) }));

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

test("invalid retained path offers a NEW correction with ordinary fields, preserved draft and honest source/base/reload limits",()=>{
  descriptor=Object.getOwnPropertyDescriptor(globalThis,"document"); Object.defineProperty(globalThis,"document",{configurable:true,value:{createElement:(t:string)=>new Element(t)}});
  const secret=new Uint8Array(32); const room={session:{service:"https://room.test",secret},directory:"sc_dir",membership:{scope:"sc_members",inc:"sha256:"+"1".repeat(64),kind:"membership"},key:keyIdOfSecret(secret)} as unknown as Room;
  const change={scope:"sc_change",manifests:[{id:4,state:"current",file:{path:"../outside.md",digest:digestBytes(utf8("<script>literal</script>")),size:24,content:"<script>literal</script>"}}]} as unknown as ChangeView;
  let rendered=retainedEditor(room,change,{current:()=>true}) as unknown as Element;
  expect(rendered.textContent).toContain("Create corrected proposal"); rendered.all().find(e=>e.tag==="button")!.event("click"); expect(rendered.textContent).toContain("Current file comparison is unavailable"); expect(rendered.textContent).toContain("Reloading or closing it loses");
  const inputs=rendered.all().filter(e=>e.tag==="input"); expect(inputs.map(e=>e.attrs.get("aria-label"))).toEqual(["Proposal title","Target file path"]);
  inputs[1]!.value="inside.md"; inputs[1]!.event("input");
  rendered=retainedEditor(room,change,{current:()=>true}) as unknown as Element;
  expect(rendered.all().find(e=>e.attrs.get("aria-label")==="Target file path")!.value).toBe("inside.md");
  expect(rendered.all().find(e=>e.tag==="textarea")!.value).toBe("<script>literal</script>");
  expect(rendered.all().some(e=>e.tag==="script")).toBe(false);
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
