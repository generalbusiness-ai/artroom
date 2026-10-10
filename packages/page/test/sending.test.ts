import { expect, test, vi } from "vitest";

// The real shell handlers over a minimal DOM and a scripted data boundary.
// No browser, native scope or transport runs; the submit-phase callback is
// the boundary under test, including navigation while the reply is pending.
test("the shell fences the whole scope during a submit and keeps a lost reply read-only after redraw", async () => {
  const gate = () => { let resolve!: () => void; const promise = new Promise<void>((done) => { resolve = done; }); return { promise, resolve }; };
  let rendered = gate();
  class Element {
    children: (Element | string)[] = [];
    attrs: Record<string, string> = {};
    handlers = new Map<string, (event: { preventDefault(): void }) => void>();
    constructor(readonly tag: string) {}
    setAttribute(name: string, value: string) { this.attrs[name] = value; }
    append(...children: (Element | string)[]) { this.children.push(...children); }
    prepend(...children: (Element | string)[]) { this.children.unshift(...children); }
    replaceChildren(...children: (Element | string)[]) { this.children = children; if (this === root) rendered.resolve(); }
    addEventListener(name: string, handler: (event: { preventDefault(): void }) => void) { this.handlers.set(name, handler); }
    focus() {}
    removeAttribute(name: string) { delete this.attrs[name]; }
    hasAttribute(name: string) { return Object.hasOwn(this.attrs, name); }
    querySelector(selector: string) { return selector.includes("data-action-slot") ? new Element("div") : this.querySelectorAll(selector)[0] ?? null; }
    getAttribute(name: string) { return this.attrs[name] ?? null; }
    all(): Element[] { return [this, ...this.children.flatMap(child => typeof child === "string" ? [] : child.all())]; }
    querySelectorAll(selector: string) {
      const attr = /^\[([^\]]+)\]$/.exec(selector)?.[1];
      return attr ? this.all().filter(node => node.hasAttribute(attr)) : [];
    }
    set textContent(value: string) { this.children = [value]; }
    get textContent(): string { return this.children.map((child) => typeof child === "string" ? child : child.textContent).join(" "); }
  }
  const root = new Element("div");
  type Place = { directory: string; membership: { scope: string; kind: string; inc: string } };
  let context: { place: Place; secret: string; label?: { text: string; place: Place } } = { place: { directory: "directory", membership: { scope: "membership", kind: "membership", inc: "one" } }, secret: "device" };
  const room = { session: { service: "https://page.test", secret: new Uint8Array(32) }, ...context.place, rules: "rules", key: "key", me: null };
  let redraw!: () => void;
  let send!: (kind: string, on: string, fields: Record<string, string>, accepted?: () => void) => void;
  const panels: { pending?: boolean; uncertain?: boolean; primary?: readonly string[]; blockedKinds?: readonly string[] }[] = [];
  const rejects: ((error: Error) => void)[] = [];
  const posts = vi.fn();
  const attempt = gate();
  const dataAct = vi.fn(async (...args: unknown[]) => {
    (args[5] as () => void)();
    posts();
    attempt.resolve();
    return new Promise<never>((_resolve, reject) => { rejects.push(reject); });
  });
  const issueRead = vi.fn(async () => ({ state: "closed", intent: 0 }));
  // The scripted reads are resolved promises. Drain their finite microtask
  // chain before checking that a forbidden callback created no second act.
  const drain = async () => { for (let turn = 0; turn < 20; turn++) await Promise.resolve(); };
  vi.doMock("@generalbusiness/artroom-bytes", async () => ({ ...await vi.importActual<typeof import("@generalbusiness/artroom-bytes")>("@generalbusiness/artroom-bytes"), b64url: () => "device", unb64url: () => new Uint8Array(32), keyIdOfSecret: () => "key", isScopeRef: (value: unknown) => !!value && typeof value === "object" && "kind" in value }));
  vi.doMock("../src/data.ts", () => ({
    act: dataAct, actAssociation: (_room: unknown, scope: string) => `room/member/${scope}`, actsOn: async () => ({ acts: ["comment", "close-own", "close-any", "reopen-own", "merge", "review-verdict", "ready-own"].map((kind) => ({ kind, fields: [] })), hidden: 0 }), fieldValue: (_room: unknown, _type: unknown, value: string) => value,
    openRoom: async () => ({ ...room, directory: context.place.directory, membership: context.place.membership }), listLanes: async () => ({ issues: [], changes: [] }), siteAddress: () => "/site/", placeOf: () => null,
    joinRoom: vi.fn(), loadChange: async () => ({ state: "open", manifests: [{ id: 1, state: "current", file: { path: "../unsafe.md" } }], merges: [] }), loadIssue: issueRead, loadRules: vi.fn(),
  }));
  vi.doMock("../src/view.ts", () => ({
    icon: () => new Element("svg"),
    h: (tag: string, attrs: Record<string, string> = {}, ...children: unknown[]) => { const el = new Element(tag); el.attrs = attrs; el.children = children.flat().filter((child) => child !== null && child !== false && child !== undefined) as (Element | string)[]; return el; },
    roomScreen: () => new Element("main"), issueScreen: () => new Element("main"), changeScreen: () => new Element("main"), rulesScreen: vi.fn(), failureScreen: vi.fn(), answerLine: (result: { kind: string; answer: { answer: string } }) => { const line = new Element("p"); line.append(`Known ${result.kind} ${result.answer.answer}`); return line; }, nonacceptedAnswerText: vi.fn(),
    actsPanel: (_offered: unknown, callback: typeof send, last: Element | null, options: (typeof panels)[number]) => { send = callback; panels.push(options); const panel = new Element("section"); if (last) panel.append(last); return panel; },
  }));
  vi.stubGlobal("document", { getElementById: () => root, createElement: (tag: string) => new Element(tag) });
  const location = { origin: "https://page.test", hash: "#/" };
  vi.stubGlobal("location", location);
  vi.stubGlobal("localStorage", { getItem: () => JSON.stringify(context) });
  vi.stubGlobal("window", { addEventListener: (_name: string, callback: () => void) => { redraw = callback; } });
  vi.stubGlobal("alert", vi.fn());
  try {
    await import("../src/main.ts");
    await rendered.promise;
    expect(panels.length).toBeGreaterThan(0);
    // Main owns these public association hosts; the view stand-in must expose them.
    expect(root.querySelectorAll('[data-request-context]').map(node=>node.getAttribute('data-request-context'))).toEqual(['room/member/directory']);
    expect(root.querySelectorAll('[data-task-context]').map(node=>node.getAttribute('data-task-context'))).toEqual(['room/member/directory']);
    const beforePending = panels.length;
    send("comment", "", Object.fromEntries([["__proto__", "literal field"]]));
    await attempt.promise;
    expect(panels.length).toBe(beforePending); // Local fencing preserves the subject without starting another view read.
    expect(root.textContent).toContain("Sending request");
    rendered = gate();
    redraw();
    await rendered.promise;
    expect(panels.at(-1)?.pending).toBe(true);
    send("comment", "", {});
    await drain();
    expect(dataAct).toHaveBeenCalledTimes(1);
    expect((dataAct.mock.calls[0]![3] as { fields: Record<string, unknown> }).fields["__proto__"]).toBe("literal field");
    rejects[0]!(new Error("Reply lost after submit"));
    await drain();
    rendered = gate(); redraw();
    await rendered.promise;
    expect(panels.at(-1)?.uncertain).toBe(true);
    expect(root.textContent).toContain("does not retain the exact signed request");
    const beforeRedraw = panels.length;
    rendered = gate();
    redraw();
    await rendered.promise;
    expect(panels.length).toBeGreaterThan(beforeRedraw);
    expect(panels.at(-1)?.pending).toBe(false);
    send("comment", "", {});
    await drain();
    expect(dataAct).toHaveBeenCalledTimes(1);
    location.hash = "#/issue/closed-issue";
    rendered = gate(); redraw(); await rendered.promise;
    expect(panels.at(-1)?.primary).toEqual([]); // Primary tasks live beside the subject, not the Inspect panel.
    expect(panels.at(-1)?.blockedKinds).toEqual(["close-own", "close-any"]);
    send("close-own", "0", {});
    await drain();
    expect(dataAct).toHaveBeenCalledTimes(1);
    location.hash = "#/change/invalid-change";
    rendered = gate(); redraw(); await rendered.promise;
    expect(panels.at(-1)?.primary).not.toContain("merge");
    expect(panels.at(-1)?.blockedKinds).toContain("merge");
    send("merge", "", {});
    await drain();
    expect(dataAct).toHaveBeenCalledTimes(1);
    const beforeSubmit = gate(), release = gate();
    dataAct.mockImplementationOnce(async (...args: unknown[]) => {
      beforeSubmit.resolve();
      await release.promise; // Models data.act's awaited reads/intent before POST.
      (args[5] as () => void)();
      posts();
      throw new Error("This would be a POST if the callback did not reject");
    });
    send("comment", "", {});
    await beforeSubmit.promise;
    context = { ...context, place: { ...context.place, directory: "another-room" }, secret: "another-key" };
    release.resolve(); await drain();
    rendered = gate(); redraw(); await rendered.promise;
    expect(posts).toHaveBeenCalledTimes(1); // Only the earlier lost-reply submission.
    expect(panels.at(-1)?.pending).toBe(false);
    expect(panels.at(-1)?.uncertain).toBe(false);
    expect(posts).toHaveBeenCalledTimes(1);
    const reading = gate(), releaseRead = gate();
    issueRead.mockImplementationOnce(async () => { reading.resolve(); await releaseRead.promise; return { state: "closed", intent: 0 }; });
    location.hash = "#/issue/delayed";
    redraw(); await reading.promise;
    context = { ...context, place: { ...context.place, directory: "newest-room" } };
    context.label = { text: "Newest local label", place: context.place };
    rendered = gate(); releaseRead.resolve(); await rendered.promise;
    expect(root.textContent).toContain("Newest local label");
    expect(root.textContent).toContain("Room est-room");
    expect(root.textContent).not.toContain("Room ther-roo");
    context = { ...context, secret: "device" };
    rendered = gate(); redraw(); await rendered.promise;
    const retired = vi.fn();
    for (const answer of ["refused", "accepted"] as const) {
      dataAct.mockImplementationOnce(async (...args: unknown[]) => {
        (args[5] as () => void)();
        const result = { kind: "comment", answer: { answer }, observation: null };
        (args[4] as (value: unknown) => void)(result);
        return result as never;
      });
      rendered = gate(); send("comment", "", { body: "Exact submission" }, retired); await drain();
      expect(retired).toHaveBeenCalledTimes(answer === "accepted" ? 1 : 0);
    }
    const answered = gate(), observation = gate();
    dataAct.mockImplementationOnce(async (...args: unknown[]) => {
      (args[5] as () => void)();
      const result = { kind: "held admission", answer: { answer: "accepted" }, observation: "Observation refresh pending." };
      (args[4] as (value: unknown) => void)(result); answered.resolve();
      await observation.promise; result.observation = "The observation could not be read."; return result as never;
    });
    const beforeAnswer = panels.length;
    send("comment", "", { body: "Known before observation" }, retired); await answered.promise;
    expect(root.textContent).toContain("Known held admission accepted");
    expect(panels.length).toBe(beforeAnswer);
    expect(retired).toHaveBeenCalledTimes(2);
    rendered = gate(); observation.resolve(); await rendered.promise;
    expect(panels.at(-1)?.uncertain).toBe(true);
    expect(root.textContent).toContain("Known held admission accepted");
  } finally {
    // Controls may admit forbidden extra attempts. Reject and drain every
    // one while its DOM remains installed, so a distinguishing assertion
    // never leaves a redraw running after the globals are restored.
    for (const reject of rejects) reject(new Error("End of scripted attempt"));
    await drain();
    vi.unstubAllGlobals();
    vi.doUnmock("../src/data.ts"); vi.doUnmock("../src/view.ts"); vi.doUnmock("@generalbusiness/artroom-bytes");
  }
});


// One mounted Main/actions journey over scripted data and a DOM stand-in.
// It is not a browser, SDK preparation, native authority or transport witness.
test("retained dialogs use the live scope; accepted draft retirement and refreshed review qualification survive redraw", async () => {
  vi.resetModules();
  const gate = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };
  let rendered = gate();
  let focused: Node | null = null;
  class Node {
    parent: Node | null = null; children: (Node | string)[] = []; attrs: Record<string,string> = Object.create(null);
    handlers = new Map<string, ((event: { preventDefault(): void }) => void)[]>();
    textValue: string | null = null; private inputValue: string | null = null;
    selectionStart = 0; selectionEnd = 0; selectionDirection = "none";
    open = false;
    constructor(readonly tag: string) {}
    get tagName() { return this.tag.toUpperCase(); }
    setAttribute(n:string,v:string) { this.attrs[n]=v; if(n==='value')this.inputValue=v; }
    getAttribute(n:string) { return this.attrs[n]??null; } hasAttribute(n:string) { return Object.hasOwn(this.attrs,n); } removeAttribute(n:string){delete this.attrs[n];}
    append(...children:(Node|string)[]) { for(const child of children){ if(child instanceof Node){child.remove();child.parent=this;}this.children.push(child); } }
    prepend(...children:(Node|string)[]) { for(const child of [...children].reverse()){if(child instanceof Node){child.remove();child.parent=this;}this.children.unshift(child);} }
    replaceChildren(...children:(Node|string)[]) { for(const child of this.children)if(child instanceof Node)child.parent=null;this.children=[];this.textValue=null;this.append(...children);if(this===root)rendered.resolve(); }
    remove() { if(this.parent){this.parent.children=this.parent.children.filter(child=>child!==this);this.parent=null;} }
    replaceWith(node:Node) {const parent=this.parent;if(!parent)return;const index=parent.children.indexOf(this);node.remove();parent.children[index]=node;node.parent=parent;this.parent=null;}
    all():Node[]{return[this,...this.children.flatMap(child=>typeof child==='string'?[]:child.all())];}
    contains(node:Node){return this.all().includes(node);}
    match(compound:string):boolean {
      const not=/:not\(([^)]+)\)/.exec(compound)?.[1];if(not&&this.match(not))return false;
      const clean=compound.replace(/:not\([^)]+\)/g,'');const tag=/^[a-z]+/.exec(clean)?.[0];if(tag&&this.tag!==tag)return false;
      for(const cls of clean.matchAll(/\.([\w-]+)/g))if(!(this.attrs['class']??'').split(' ').includes(cls[1]!))return false;
      for(const attr of clean.matchAll(/\[([^=\]]+)(?:="([^"]*)"|=([^\]]+))?\]/g)){if(!this.hasAttribute(attr[1]!))return false;const expected=attr[2]??attr[3];if(expected!==undefined&&this.attrs[attr[1]!]!==expected)return false;}
      return true;
    }
    selected(selector:string):boolean {const parts=selector.trim().split(/\s+/);if(!this.match(parts.pop()!))return false;let at=this.parent;while(parts.length){const part=parts.pop()!;while(at&&!at.match(part))at=at.parent;if(!at)return false;at=at.parent;}return true;}
    querySelectorAll<T=Node>(selector:string):T[]{return this.all().slice(1).filter(node=>selector.split(',').some(part=>node.selected(part))) as T[];}
    querySelector<T=Node>(selector:string):T|null{return this.querySelectorAll<T>(selector)[0]??null;}
    addEventListener(name:string,handler:(event:{preventDefault():void})=>void){this.handlers.set(name,[...this.handlers.get(name)??[],handler]);}
    emit(name:string){for(const handler of this.handlers.get(name)??[])handler({preventDefault(){}});}
    focus(){focused=this;} setSelectionRange(start:number,end:number){this.selectionStart=start;this.selectionEnd=end;}
    getClientRects(){let at:Node|null=this;while(at){if(at.hasAttribute('hidden'))return[];at=at.parent;}return[{}];}
    showModal(){this.open=true;}close(){this.open=false;}
    get name(){return this.attrs['name']??'';}
    get value():string {if(this.tag==='select'){const options=this.querySelectorAll<Node>('option');return this.inputValue===null?(options.find(option=>option.hasAttribute('selected'))??options[0])?.attrs['value']??'':options.some(option=>option.attrs['value']===this.inputValue)?this.inputValue:'';}return this.inputValue??(this.tag==='textarea'?this.textContent:this.attrs['value']??'');}
    set value(value:string){this.inputValue=value;}
    set textContent(value:string){this.children=[];this.textValue=value;}
    get textContent():string{return this.textValue??this.children.map(child=>typeof child==='string'?child:child.textContent).join(' ');}
  }
  const root=new Node('div'),body=new Node('body');body.append(root);
  const doc={createElement:(tag:string)=>new Node(tag),createElementNS:(_ns:string,tag:string)=>new Node(tag),getElementById:(id:string)=>id==='page'?root:body.all().find(node=>node.attrs['id']===id)??null,querySelectorAll:(selector:string)=>body.querySelectorAll(selector),body,get activeElement(){return focused;}};
  const place={directory:'directory',membership:{scope:'membership',kind:'membership',inc:'one'}};
  const settings={place,secret:'device'};
  const room={session:{service:'https://page.test',secret:new Uint8Array(32)},...place,rules:'rules',destination:'destination',key:'key',me:{handle:'@reader',role:'maintainer',actions:['change.review','change.merge','issue.open']},reader:{}};
  const issue={scope:'issue',definition:'definition',head:{seq:1,hash:'head'},intent:0,title:'Native issue',number:1,body:null,state:'open',requester:'@author',assignees:[],conditions:[],comments:[],closeReason:null};
  const change={scope:'change',definition:'definition',head:{seq:2,hash:'head'},proposal:0,title:'Selected change',number:2,body:null,state:'open',author:'@author',currentManifest:12,
    manifests:[{id:12,state:'current',authors:['@author'],integrator:'@author',base:'a'.repeat(40),integration:null,tree:null,complete:true,selectedReports:[],file:{path:'AGENTS.md',digest:'digest',size:4,page:'latest',content:'Text'}}],
    reviews:[],requests:[],jobs:[],links:[],merges:[],comments:[],rules:{approvals:0,ownerMayReview:false,revision:1,checks:[],extents:[{name:'rules',patterns:['AGENTS.md'],approvals:1,approver:'rules.publish',checks:[],class:'authority'}]},
    reviewExtents:[{label:'rules',value:'rules'}],reviewMembers:[{label:'@reader',value:'@reader'}],reviewMembersByExtent:{rules:[{label:'@reader',value:'@reader'}]},
  };
  const comment={kind:'comment',step:'open',on:'comment',line:'Comment',fields:[{name:'body',type:'text',required:true}]};
  const review={kind:'review-verdict',step:'open',on:'review',line:'Review',fields:[{name:'manifest',type:'item',required:true},{name:'extent',type:'text',required:false},{name:'verdict',type:'enum',required:true,choices:[{label:'Approve',value:'approve'}]},{name:'body',type:'text',required:false}]};
  const create={kind:'open-issue',step:'open',on:'lane',line:'Open',fields:[{name:'definition',type:'digest',required:true,choices:[{label:'Issue',value:'native-pin'}]},{name:'title',type:'text',required:true},{name:'conditions',type:'list',required:true}]};
  const posts=vi.fn();const attempts:{args:unknown[];finish:(answer:'accepted'|'refused')=>void;lose:()=>void}[]=[];
  let attempted=gate();
  const act=vi.fn((...args:unknown[])=>{
    (args[5]as()=>void)();posts();attempted.resolve();
    return new Promise((resolve,reject)=>attempts.push({args,finish:answer=>{const result={kind:args[2],scope:args[1],on:null,answer:answer==='accepted'?{answer,receipt:{fact:{at:{scope:args[1],inc:'one',kind:'lane'},seq:3,hash:'hash'}}}:{answer,reason:'guard-failed'},before:{seq:2,hash:'old'},after:{seq:3,hash:'new'},observation:null};(args[4]as(value:unknown)=>void)(result);resolve(result);},lose:()=>reject(new Error('Reply lost'))}));
  });
  vi.doMock('@generalbusiness/artroom-bytes',async()=>({...await vi.importActual<typeof import('@generalbusiness/artroom-bytes')>('@generalbusiness/artroom-bytes'),b64url:()=> 'device',unb64url:()=>new Uint8Array(32),keyIdOfSecret:()=> 'key'}));
  vi.doMock('../src/data.ts',()=>({Unreadable:class Unreadable extends Error{},act,actAssociation:(_room:unknown,scope:string)=>`room/member/${scope}`,fieldValue:(_room:unknown,_type:string,value:string)=>value,openRoom:async()=>room,listLanes:async()=>({issues:[{scope:'issue',number:1,title:'Native issue',state:'open'}],changes:[]}),actsOn:async(_room:unknown,scope:string)=>({acts:scope==='directory'?[create]:scope==='change'?[comment,review]:[comment],hidden:0}),loadIssue:async()=>issue,loadChange:async()=>change,loadRules:vi.fn(),siteAddress:()=>'/site/HEAD/',placeOf:vi.fn(),joinRoom:vi.fn(),enrollmentAssociation:vi.fn(),joinAssociation:vi.fn()}));
  vi.doMock('../src/retained-editor.ts',()=>({retainedEditor:()=>new Node('div')}));
  let redraw!:()=>void;const location={origin:'https://page.test',hash:'#/'};
  vi.stubGlobal('document',doc);vi.stubGlobal('location',location);vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify(settings)});vi.stubGlobal('window',{addEventListener:(_name:string,callback:()=>void)=>{redraw=callback;}});
  const refresh=async()=>{rendered=gate();redraw();await rendered.promise;};
  const done=async(index:number,answer:'accepted'|'refused')=>{rendered=gate();attempts[index]!.finish(answer);await rendered.promise;};
  const edit=(form:Node,name:string,value:string)=>{form.querySelector<Node>(`[name="field:${name}"]`)!.value=value;form.emit('input');};
  try {
    await import('../src/main.ts');await rendered.promise;
    root.querySelector<Node>('[data-task-act="open-issue"]')!.emit('click');
    let dialog=body.querySelector<Node>('dialog')!;let form=dialog.querySelector<Node>('form[data-act="open-issue"]')!;
    edit(form,'title','Original creation draft');await refresh();
    attempted=gate();form.emit('submit');await attempted.promise;
    expect(root.textContent).toContain('Sending request');
    expect(root.querySelector<Node>('[data-task-act="open-issue"]')?.hasAttribute('disabled')).toBe(true);
    await done(0,'refused');
    expect(dialog.textContent).toContain('Refused:');expect(form.querySelector<Node>('button[type=submit]')!.hasAttribute('disabled')).toBe(false);
    attempted=gate();form.emit('submit');await attempted.promise;await done(1,'accepted');
    expect(dialog.open).toBe(false);expect(root.textContent).toContain('Native issue');

    location.hash='#/issue/issue';await refresh();
    form=root.querySelector<Node>('form[data-act="comment"]')!;
    edit(form,'body','Exactly accepted text');form.querySelector<Node>('[name="field:body"]')!.focus();
    attempted=gate();form.emit('submit');await attempted.promise;await done(2,'accepted');
    let current=root.querySelector<Node>('form[data-act="comment"] [name="field:body"]')!;
    expect([current.value,focused]).toEqual(['',current]);
    form=root.querySelector<Node>('form[data-act="comment"]')!;edit(form,'body','Earlier submission');
    attempted=gate();form.emit('submit');await attempted.promise;
    // Scripted newer input models the existing draft producer while reply is held.
    edit(form,'body','Newer unsent text');form.querySelector<Node>('[name="field:body"]')!.focus();await done(3,'accepted');
    current=root.querySelector<Node>('form[data-act="comment"] [name="field:body"]')!;expect(current.value).toBe('Newer unsent text');
    form=root.querySelector<Node>('form[data-act="comment"]')!;edit(form,'body','Refused text');attempted=gate();form.emit('submit');await attempted.promise;await done(4,'refused');
    expect(root.querySelector<Node>('form[data-act="comment"] [name="field:body"]')!.value).toBe('Refused text');
    form=root.querySelector<Node>('form[data-act="comment"]')!;attempted=gate();form.emit('submit');await attempted.promise;
    rendered=gate();attempts[5]!.lose();await rendered.promise;
    expect(root.querySelector<Node>('form[data-act="comment"] [name="field:body"]')!.value).toBe('Refused text');

    location.hash='#/change/change';await refresh();
    root.querySelector<Node>('[data-task-act="review-verdict"]')!.emit('click');dialog=body.querySelector<Node>('dialog')!;form=dialog.querySelector<Node>('form[data-act="review-verdict"]')!;
    edit(form,'body','Keep this selected review');await refresh();
    const before=act.mock.calls.length;
    // FIRST failure has no prior native refusal whose branch could repair the controls.
    change.reviewMembersByExtent={rules:[]};rendered=gate();form.emit('submit');await rendered.promise;
    expect(act).toHaveBeenCalledTimes(before);expect(posts).toHaveBeenCalledTimes(before);
    expect(form.querySelector<Node>('[name="field:body"]')!.hasAttribute('disabled')).toBe(false);
    expect(form.querySelector<Node>('[name="field:extent"]')!.hasAttribute('disabled')).toBe(false);
    expect(form.querySelector<Node>('button[type=submit]')!.hasAttribute('disabled')).toBe(true);
    expect(form.querySelector<Node>('[name="field:manifest"]')!.value).toBe('12');
    expect(form.querySelector<Node>('[name="field:extent"]')!.value).toBe('rules');
    edit(form,'body','Corrected definitely-unsent review');
    change.reviewMembersByExtent={rules:[{label:'@reader',value:'@reader'}]};await refresh();
    expect(form.querySelector<Node>('button[type=submit]')!.hasAttribute('disabled')).toBe(false);
    expect(form.querySelector<Node>('[name="field:body"]')!.value).toBe('Corrected definitely-unsent review');
    edit(form,'body','Keep this selected review');
    // Generic change.review remains offered while the specific requirement loses eligibility.
    change.reviewMembersByExtent={rules:[]};await refresh();
    expect(form.querySelector<Node>('button[type=submit]')!.hasAttribute('disabled')).toBe(true);
    form.emit('submit');expect(act).toHaveBeenCalledTimes(before);
    expect(form.querySelector<Node>('[name="field:manifest"]')!.value).toBe('12');expect(form.querySelector<Node>('[name="field:extent"]')!.value).toBe('rules');
    expect(form.querySelector<Node>('[name="field:body"]')!.value).toBe('Keep this selected review');
    change.reviewMembersByExtent={rules:[{label:'@reader',value:'@reader'}]};change.state='closed';await refresh();
    form.emit('submit');expect(act).toHaveBeenCalledTimes(before);expect(dialog.textContent).toContain('no longer open');
    change.state='open';await refresh();
    attempted=gate();form.emit('submit');await attempted.promise;await done(6,'refused');
    expect(form.querySelector<Node>('button[type=submit]')!.hasAttribute('disabled')).toBe(false);
    // A role/controller loss between the last draw and submit is caught BEFORE data.act.
    change.reviewMembersByExtent={rules:[]};rendered=gate();form.emit('submit');await rendered.promise;
    expect(act).toHaveBeenCalledTimes(before+1);expect(posts).toHaveBeenCalledTimes(before+1);
    expect(form.querySelector<Node>('[name="field:body"]')!.value).toBe('Keep this selected review');
    change.reviewMembersByExtent={rules:[{label:'@reader',value:'@reader'}]};await refresh();
    // Lifecycle can also change after the draw, with the same generic offer.
    change.state='cancelled';rendered=gate();form.emit('submit');await rendered.promise;
    expect(act).toHaveBeenCalledTimes(before+1);expect(posts).toHaveBeenCalledTimes(before+1);
    expect(form.querySelector<Node>('[name="field:manifest"]')!.value).toBe('12');
    expect(form.querySelector<Node>('[name="field:extent"]')!.value).toBe('rules');
    change.state='open';await refresh();
    attempted=gate();form.emit('submit');await attempted.promise;await done(7,'accepted');
    expect(dialog.open).toBe(false);expect(root.textContent).toContain('Selected change');
    // A submitted unknown report remains fenced; definite-unsent recovery does not release it.
    root.querySelector<Node>('[data-task-act="review-verdict"]')!.emit('click');dialog=body.querySelector<Node>('dialog')!;form=dialog.querySelector<Node>('form[data-act="review-verdict"]')!;
    edit(form,'body','Keep unknown original review');attempted=gate();form.emit('submit');await attempted.promise;
    rendered=gate();attempts[8]!.lose();await rendered.promise;
    expect(form.querySelector<Node>('[name="field:body"]')!.value).toBe('Keep unknown original review');
    expect(form.querySelector<Node>('[name="field:body"]')!.hasAttribute('disabled')).toBe(true);
    expect(form.querySelector<Node>('button[type=submit]')!.hasAttribute('disabled')).toBe(true);
    const unknownAttempts=act.mock.calls.length;form.emit('submit');await refresh();expect(act).toHaveBeenCalledTimes(unknownAttempts);expect(posts).toHaveBeenCalledTimes(unknownAttempts);
  } finally {
    // Every held fake attempt is drained before removing its document.
    for(const attempt of attempts)attempt.lose();for(let n=0;n<30;n++)await Promise.resolve();
    vi.unstubAllGlobals();vi.doUnmock('../src/data.ts');vi.doUnmock('../src/retained-editor.ts');vi.doUnmock('@generalbusiness/artroom-bytes');vi.resetModules();
  }
});
