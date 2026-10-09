import { afterEach, expect, test } from "vitest";
import { digestBytes, keyIdOfSecret, utf8 } from "@generalbusiness/artroom-bytes";
import type { ChangeView, Room } from "../src/data.ts";
import { retainedEditor } from "../src/retained-editor.ts";
import { editFields } from "../src/retained-editor-data.ts";

// DOM STAND-IN only: native authority/signing is exercised in retained-editor.scope.test.ts.
class Element {
  children: (Element|string)[] = []; attrs = new Map<string,string>(); listeners = new Map<string, (()=>void)[]>(); disabled=false;
  constructor(readonly tag: string) {}
  setAttribute(k:string,v:string){this.attrs.set(k,v);} append(...c:(Element|string)[]){this.children.push(...c);} replaceChildren(...c:(Element|string)[]){this.children=c;}
  addEventListener(n:string,f:()=>void){this.listeners.set(n,[...this.listeners.get(n)??[],f]);}
  querySelector(t:string){return this.all().find(e=>e.tag===t) ?? null;} focus(){}
  get value(){return this.attrs.get("value") ?? this.textContent;} set value(v:string){this.attrs.set("value",v);}
  get textContent():string{return this.children.map(c=>typeof c==="string"?c:c.textContent).join("");}
  all():Element[]{return [this,...this.children.flatMap(c=>typeof c==="string"?[]:c.all())];}
  event(n:string){for(const f of this.listeners.get(n)??[]) f();}
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
