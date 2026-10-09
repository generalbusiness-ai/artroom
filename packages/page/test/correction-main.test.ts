import { expect, test, vi } from "vitest";

// Actual Main + changeScreen/editor mount. Data/DOM stand-ins show the
// integration boundary only; native correction remains editor-list1.scope.
test("Main mounts a new corrected-proposal control for verified invalid-path text and keeps publication/review unavailable", async () => {
  vi.resetModules();
  let rendered!: () => void;
  const done = new Promise<void>(resolve => { rendered = resolve; });
  class Element {
    attrs: Record<string,string> = {}; children:(Element|string)[]=[]; handlers=new Map<string,()=>void>();
    constructor(readonly tag:string){} setAttribute(n:string,v:string){this.attrs[n]=v;} hasAttribute(n:string){return Object.hasOwn(this.attrs,n);}
    append(...c:(Element|string)[]){this.children.push(...c);} replaceChildren(...c:(Element|string)[]){this.children=c;if(this===root)rendered();}
    addEventListener(n:string,f:()=>void){this.handlers.set(n,f);} focus(){}
    all():Element[]{return[this,...this.children.flatMap(c=>typeof c==='string'?[]:c.all())];}
    querySelector(selector:string){const slot=/^\[data-action-slot="([^"]+)"\]$/.exec(selector)?.[1];return slot?this.all().find(e=>e.attrs['data-action-slot']===slot)??null:null;}
    querySelectorAll(){return[];} get value(){return this.attrs['value']??'';} set value(v:string){this.attrs['value']=v;} get textContent():string{return this.children.map(c=>typeof c==='string'?c:c.textContent).join(' ');}
  }
  const root=new Element('div');
  const place={directory:'directory',membership:{scope:'membership',kind:'membership',inc:'one'}};
  const room={session:{service:'https://page.test',secret:new Uint8Array(32)},...place,rules:'rules',destination:'destination',key:'key',me:{handle:'@member',role:'member',actions:['change.open','change.propose']},reader:{}};
  const change={scope:'invalid-change',definition:'definition',head:{seq:1,hash:'head'},number:7,title:'Invalid original',body:null,state:'open',author:'@member',currentManifest:12,manifests:[{id:12,state:'current',integrator:'@member',authors:['@member'],base:'a'.repeat(40),integration:null,tree:null,complete:true,file:{path:'../outside.md',digest:'digest',size:8,page:'not-a-preview',content:'original\r\n'}}],reviews:[],requests:[],jobs:[],links:[],merges:[],rules:null,comments:[]};
  vi.doMock('@generalbusiness/artroom-bytes',async()=>({...await vi.importActual<typeof import('@generalbusiness/artroom-bytes')>('@generalbusiness/artroom-bytes'),b64url:()=> 'device',unb64url:()=>new Uint8Array(32),keyIdOfSecret:()=> 'key'}));
  vi.doMock('../src/data.ts',()=>({act:vi.fn(),actAssociation:()=> 'context',actsOn:async(_room:unknown,scope:string)=>({acts:scope==='directory'?[{kind:'open-issue',step:'open',on:'lane',line:'Open',fields:[{name:'definition',type:'digest',required:true,choices:[{label:'Issue',value:'one'}]},{name:'title',type:'text',required:true},{name:'conditions',type:'list',required:true},{name:'custom',type:'text',required:true}]}]:[],hidden:0}),fieldValue:vi.fn(),openRoom:async()=>room,listLanes:async()=>({issues:[],changes:[]}),siteAddress:()=>'/site/HEAD/',placeOf:vi.fn(),joinRoom:vi.fn(),joinAssociation:vi.fn(),enrollmentAssociation:vi.fn(),loadChange:async()=>change,loadIssue:vi.fn(),loadRules:vi.fn()}));
  const editor=vi.fn(()=>{const e=new Element('button');e.append('Create corrected proposal');return e;});
  vi.doMock('../src/retained-editor.ts',()=>({retainedEditor:editor}));
  vi.doMock('../src/claim.ts',()=>({allowedClaim:vi.fn(),claimRoom:vi.fn(),claimStatus:vi.fn()}));
  vi.stubGlobal('document',{getElementById:()=>root,createElement:(tag:string)=>new Element(tag)});
  const location={origin:'https://page.test',hash:'#/change/invalid-change'};vi.stubGlobal('location',location);
  vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify({place,secret:'device'}),setItem:vi.fn()});
  let redraw!:()=>void;vi.stubGlobal('window',{addEventListener:(_name:string,handler:()=>void)=>{redraw=handler;}});
  try {
    await import('../src/main.ts'); await done;
    expect(editor).toHaveBeenCalledTimes(1);expect(editor.mock.calls[0]?.slice(0,2)).toEqual([room,change]);
    expect(root.textContent).toContain('Create corrected proposal');
    expect(root.all().filter(e=>e.attrs['data-action-slot']==='edit')).toHaveLength(1);
    expect(root.all().some(e=>e.tag==='a'&&e.textContent==='Open latest page')).toBe(false);
    let finished!:()=>void;const listDone=new Promise<void>(resolve=>{finished=resolve;});rendered=finished;
    location.hash='#/';redraw();await listDone;
    expect(root.textContent).toContain('Create issue is unavailable');
    // The actual panel retains the native action for the custom declaration.
    expect(root.all().some(e=>e.tag==='form'&&e.attrs['data-act']==='open-issue')).toBe(true);
    expect(root.all().some(e=>e.attrs['name']==='field:custom')).toBe(true);

  } finally { vi.unstubAllGlobals();vi.doUnmock('../src/data.ts');vi.doUnmock('../src/retained-editor.ts');vi.doUnmock('../src/claim.ts');vi.doUnmock('@generalbusiness/artroom-bytes');vi.resetModules(); }
});
