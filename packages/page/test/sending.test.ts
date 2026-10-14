import { expect, test, vi } from "vitest";
import { digestBytes, newIncarnation, scopeIdOf } from "@generalbusiness/artroom-bytes";

// The real shell handlers over a minimal DOM and a scripted data boundary.
// No browser, native scope or transport runs; the submit-phase callback is
// the boundary under test, including navigation while the reply is pending.
test("the shell fences the whole scope during a submit and keeps a lost reply read-only after redraw", async () => {
  const gate = () => { let resolve!: () => void; const promise = new Promise<void>((done) => { resolve = done; }); return { promise, resolve }; };
  let rendered = gate();
  class Element {
    children: (Element | string)[] = [];
    attrs: Record<string, string> = {};
    parent: Element | null = null;
    handlers = new Map<string, (event: { preventDefault(): void }) => void>();
    constructor(readonly tag: string) {}
    setAttribute(name: string, value: string) { this.attrs[name] = value; }
    append(...children: (Element | string)[]) { for (const child of children) { if (child instanceof Element) { child.remove(); child.parent = this; } this.children.push(child); } }
    prepend(...children: (Element | string)[]) { for (const child of [...children].reverse()) { if (child instanceof Element) { child.remove(); child.parent = this; } this.children.unshift(child); } }
    replaceChildren(...children: (Element | string)[]) { for (const child of this.children) if (child instanceof Element) child.parent = null; this.children = []; this.append(...children); if (this === root && this.all().some(node => node.attrs["class"] === "rail")) rendered.resolve(); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null; }
    addEventListener(name: string, handler: (event: { preventDefault(): void }) => void) { this.handlers.set(name, handler); }
    focus() {}
    showModal() { this.setAttribute("open", ""); }
    close() { this.removeAttribute("open"); }
    contains(node: Element) { return this.all().includes(node); }
    removeAttribute(name: string) { delete this.attrs[name]; }
    hasAttribute(name: string) { return Object.hasOwn(this.attrs, name); }
    querySelector(selector: string) { return this.querySelectorAll(selector)[0] ?? null; }
    getAttribute(name: string) { return this.attrs[name] ?? null; }
    all(): Element[] { return [this, ...this.children.flatMap(child => typeof child === "string" ? [] : child.all())]; }
    matches(selector: string): boolean {
      const part = /^([a-z-]+)?(?:\[([^=\]]+)(?:="([^"]*)")?\])?$/.exec(selector);
      if (!part) return selector.startsWith(".") && (this.attrs["class"] ?? "").split(/\s+/).includes(selector.slice(1));
      return (!part[1] || this.tag === part[1]) && (!part[2] || this.hasAttribute(part[2]) && (part[3] === undefined || this.getAttribute(part[2]) === part[3]));
    }
    querySelectorAll(selector: string) {
      return this.all().slice(1).filter(node => selector.split(",").some(choice => {
        const [ancestor, descendant] = choice.trim().split(/\s+/, 2);
        if (!descendant) return node.matches(ancestor!);
        if (!node.matches(descendant)) return false;
        for (let parent = node.parent; parent; parent = parent.parent) if (parent.matches(ancestor!)) return true;
        return false;
      }));
    }
    set textContent(value: string) { this.children = [value]; }
    get textContent(): string { return this.children.map((child) => typeof child === "string" ? child : child.textContent).join(" "); }
  }
  const screen = (...slots: string[]) => {
    const main = new Element("main");
    for (const slot of slots) { const host = new Element("div"); host.setAttribute("data-action-slot", slot); main.append(host); }
    return main;
  };
  const root = new Element("div"), body = new Element("body"); body.append(root);
  const membershipDigest = digestBytes(new Uint8Array([5, 4, 3, 6]));
  const membership = { scope: scopeIdOf({ v: 1, kind: "membership", definition: membershipDigest, creator: null, cause: membershipDigest, ordinal: 0 }), kind: "membership", inc: newIncarnation(new Uint8Array(16).fill(54)) };
  type Place = { directory: string; membership: { scope: string; kind: string; inc: string } };
  let context: { place: Place; secret: string; label?: { text: string; place: Place } } = { place: { directory: "directory", membership }, secret: "device" };
  const room = { session: { service: "https://page.test", secret: new Uint8Array(32) }, ...context.place, rules: "rules", key: "key", me: { handle: "@reader", role: "member", actions: ["change.propose"], ref: { membership: context.place.membership, member: "@reader" } } };
  let redraw!: () => void;
  let send!: (kind: string, on: string, fields: Record<string, string>, accepted?: () => void) => void;
  const panels: { pending?: boolean; uncertain?: boolean; primary?: readonly string[]; blockedKinds?: readonly string[] }[] = [];
  let initialization: "configured" | "not-initialized" | "unknown" = "configured";
  let rulesUnavailable = false;
  let initializedDuringView = false;
  const rejects: ((error: Error) => void)[] = [];
  const posts = vi.fn();
  const attempt = gate();
  const dataAct = vi.fn(async (...args: unknown[]) => {
    (args[5] as () => void)();
    posts();
    attempt.resolve();
    return new Promise<never>((_resolve, reject) => { rejects.push(reject); });
  });
  const issueRead = vi.fn(async () => ({ state: "closed", intent: 0, requesterRef: room.me.ref }));
  // The scripted reads are resolved promises. Drain their finite microtask
  // chain before checking that a forbidden callback created no second act.
  const drain = async () => { for (let turn = 0; turn < 20; turn++) await Promise.resolve(); };
  vi.doMock("@generalbusiness/artroom-bytes", async () => ({ ...await vi.importActual<typeof import("@generalbusiness/artroom-bytes")>("@generalbusiness/artroom-bytes"), b64url: () => "device", unb64url: () => new Uint8Array(32), keyIdOfSecret: () => "key", isScopeRef: (value: unknown) => !!value && typeof value === "object" && "kind" in value }));
  vi.doMock("../src/data.ts", () => ({
    act: dataAct, actAssociation: (_room: unknown, scope: string) => `room/member/${scope}`, actsOn: async () => ({ acts: [...["comment", "close-own", "close-any", "reopen-own", "merge", "review-verdict", "ready-own", "open-pr"].map((kind) => ({ kind, fields: [] })), ...(initializedDuringView ? [{ kind: "open-issue", step: "open", on: "lane", line: "Open", fields: [{ name: "definition", type: "digest", required: true, choices: [{ label: "Issue", value: "SCRIPTED-current-definition" }] }, { name: "title", type: "text", required: true }, { name: "conditions", type: "list", required: true }] }] : [])], hidden: 0 }), fieldValue: (_room: unknown, _type: unknown, value: string) => value,
    initializationStillCurrent: async () => !initializedDuringView, roomInitialization: async () => initialization === "not-initialized" ? { state: initialization, scope: { scope: "rules", kind: "rules", inc: "one" }, head: { seq: 1, hash: "head" }, rulesItem: 0, definition: "platform:rules@3", context: "SCRIPTED-private-read-context" } : initialization === "unknown" ? { state: initialization, reason: "Scripted read unavailable" } : { state: initialization }, openRoom: async () => ({ ...room, directory: context.place.directory, membership: context.place.membership, name: `Recorded ${context.place.directory}` }), listLanes: async () => ({ issues: [], changes: [] }), siteAddress: () => "/site/", placeOf: () => null,
    joinRoom: vi.fn(), loadChange: async () => ({ state: "open", manifests: [{ id: 1, state: "current", file: { path: "../unsafe.md" } }], merges: [] }), loadIssue: issueRead, loadRules: async () => { if (rulesUnavailable) throw new Error("Scripted rules read unavailable"); return { scope: "rules", head: { seq: 1, hash: "head" }, revision: null, approvals: 1, ownerMayReview: false, singleControllerException: false, checks: [], labels: [], extents: null, definitions: [], controllers: [] }; },
  }));
  vi.doMock("../src/view.ts", () => ({
    whoLine: () => new Element("p"),
    icon: () => new Element("svg"),
    h: (tag: string, attrs: Record<string, string> = {}, ...children: unknown[]) => { const el = new Element(tag); el.attrs = attrs; el.append(...children.flat().filter((child) => child !== null && child !== false && child !== undefined) as (Element | string)[]); return el; },
    roomScreen: () => screen("create"), issueScreen: () => screen("comment", "next"), changeScreen: () => screen("comment", "next", "edit"), rulesScreen: () => screen(), failureScreen: vi.fn(), answerLine: (result: { kind: string; answer: { answer: string } }) => { const line = new Element("p"); line.append(`Known ${result.kind} ${result.answer.answer}`); return line; }, nonacceptedAnswerText: vi.fn(),
    actsPanel: (_offered: unknown, callback: typeof send, last: Element | null, options: (typeof panels)[number]) => { send = callback; panels.push(options); const panel = new Element("section"); if (last) panel.append(last); return panel; },
  }));
  vi.stubGlobal("document", { body, getElementById: () => root, createElement: (tag: string) => new Element(tag) });
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
    // A complete empty source list keeps Propose change disabled without a
    // second absence paragraph in the toolbar. The view owns the list copy.
    location.hash = "#/?kind=change"; rendered = gate(); redraw(); await rendered.promise;
    const propose = root.all().find(node => node.getAttribute("aria-label") === "Propose change")!;
    expect(propose.hasAttribute("disabled")).toBe(true);
    expect(root.textContent).not.toContain("No recorded change is available here as a text source");
    propose.handlers.get("click")?.({ preventDefault() {} });
    await drain(); expect(dataAct).not.toHaveBeenCalled();
    location.hash = "#/"; rendered = gate(); redraw(); await rendered.promise;
    initialization = "not-initialized";
    const banner = "This room is not initialized yet. Its creator initializes it before issues, changes and rules can be used.";
    for (const route of ["#/", "#/?kind=change", "#/rules"]) {
      location.hash = route; rendered = gate(); redraw(); await rendered.promise;
      expect(root.all().filter(node => node.attrs["class"] === "answer room-initialization")).toHaveLength(1);
      expect(root.textContent).toContain(banner);
    }
    initializedDuringView = true; location.hash = "#/"; rendered = gate(); redraw(); await rendered.promise;
    expect(root.textContent).not.toContain(banner);
    expect(root.querySelector('[data-task-act="open-issue"]')).not.toBeNull(); // Fresh native-shaped choices replace H0 suppression.
    expect(dataAct).not.toHaveBeenCalled();
    initializedDuringView = false; location.hash = "#/rules";
    rulesUnavailable = true; rendered = gate(); redraw(); await rendered.promise;
    expect(root.textContent).not.toContain(banner); // Later denial retires the earlier positive read.
    initialization = "unknown"; rendered = gate(); redraw(); await rendered.promise;
    expect(root.textContent).not.toContain(banner);
    expect(root.textContent).toContain("The complete rules could not be read. Check status before editing.");
    initialization = "configured"; rulesUnavailable = false; location.hash = "#/"; rendered = gate(); redraw(); await rendered.promise;
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
    const sourceReadsBefore = issueRead.mock.calls.length;
    issueRead.mockImplementationOnce(async () => { reading.resolve(); await releaseRead.promise; return { state: "closed", intent: 0, requesterRef: room.me.ref }; });
    location.hash = "#/issue/delayed";
    redraw(); await reading.promise;
    context = { ...context, place: { ...context.place, directory: "newest-room" } };
    context.label = { text: "Newest local label", place: context.place };
    rendered = gate(); releaseRead.resolve(); await rendered.promise;
    expect(issueRead).toHaveBeenCalledTimes(sourceReadsBefore + 2); // Old read retires; the existing draw opens the actual current room once.
    expect(root.textContent).toContain("Newest local label");
    expect(root.textContent).toContain("Recorded newest-room");
    expect(root.textContent).not.toContain("Recorded another-room");
    context = { ...context, secret: "device" };
    rendered = gate(); redraw(); await rendered.promise;
    const retired = vi.fn();
    for (const answer of ["refused", "accepted"] as const) {
      dataAct.mockImplementationOnce(async (...args: unknown[]) => {
        (args[5] as () => void)();
        const result = { kind: "comment", answer: answer === "refused" ? { answer, reason: "guard-failed", judgedAt: { seq: 2, hash: membershipDigest } } : { answer }, observation: null };
        (args[4] as (value: unknown) => void)(result);
        return result as never;
      });
      rendered = gate(); send("comment", "", { body: "Exact submission" }, retired); await drain();
      expect(retired).toHaveBeenCalledTimes(answer === "accepted" ? 1 : 0);
      if (answer === "refused") {
        const refusal = body.querySelector('[data-refusal-context]')!;
        expect(refusal.textContent).toContain("The scope did not supply a guard name.");
        expect(root.querySelector('[data-request-context]')!.textContent).toContain("Known comment refused");
        refusal.querySelector("button")!.handlers.get("click")!({ preventDefault() {} });
        expect(body.querySelector('[data-refusal-context]')).toBeNull();
      }
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
    getBoundingClientRect(){return {left:10,top:10,right:110,bottom:110};}
    emit(name:string, data: {target?:Node;clientX?:number;clientY?:number} = {}){for(const handler of this.handlers.get(name)??[])handler({preventDefault(){},...data});}
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
  const fixtureDigest=digestBytes(new Uint8Array([1]));
  const place={directory:'directory',membership:{scope:scopeIdOf({v:1,kind:'membership',definition:fixtureDigest,creator:null,cause:fixtureDigest,ordinal:0}),kind:'membership',inc:newIncarnation(new Uint8Array(16))}};
  const settings={place,secret:'device'};
  const room={session:{service:'https://page.test',secret:new Uint8Array(32)},...place,rules:'rules',destination:'destination',key:'key',me:{handle:'@reader',role:'maintainer',actions:['change.review','change.merge','issue.open'],ref:{membership:place.membership,member:'@reader'}},reader:{}};
  const issueScope=scopeIdOf({v:1,kind:'lane',definition:fixtureDigest,creator:null,cause:fixtureDigest,ordinal:2});
  const issue={scope:issueScope,ref:{scope:issueScope,kind:'lane',inc:newIncarnation(new Uint8Array(16).fill(2))},requesterRef:room.me.ref,definition:'definition',head:{seq:1,hash:'head'},intent:0,title:'Native issue',number:1,body:null,state:'open',requester:'@author',assignees:[],conditions:[],comments:[],closeReason:null};
  const changeScope=scopeIdOf({v:1,kind:'lane',definition:fixtureDigest,creator:null,cause:fixtureDigest,ordinal:0});
  const change={scope:changeScope,ref:{scope:changeScope,kind:'lane',inc:newIncarnation(new Uint8Array(16).fill(1))},definition:'definition',head:{seq:2,hash:'head'},proposal:0,title:'Selected change',number:2,body:null,state:'open',author:'@author',currentManifest:12,
    manifests:[{id:12,state:'current',authors:['@author'],integrator:'@author',base:'a'.repeat(40),integration:null,tree:null,complete:true,selectedReports:[],file:{path:'AGENTS.md',digest:'digest',size:4,page:'latest',content:'Text'}}],
    reviews:[],requests:[{id:6,state:'open',requested:'@reader',requester:'@author',requestedRef:room.me.ref,requesterRef:{membership:place.membership,member:'@author'}}],jobs:[],links:[],merges:[],comments:[],rules:{approvals:0,ownerMayReview:false,revision:1,checks:[],extents:[{name:'rules',approvals:1,approver:'rules.publish',checks:[],class:'authority'}]},
    // Synthetic presentation fixture; the native task-data case proves the real policy binding.
    reviewPolicy:{manifest:12,source:{at:{scope:'rules',kind:'rules',inc:'one'},seq:1,hash:'hash'},extents:[{name:'rules',patterns:['AGENTS.md'],approvals:1,approver:'rules.publish',checks:[],class:'authority'}]},
    reviewExtents:[{label:'rules',value:'rules'}],reviewMembers:[{label:'@reader',value:'@reader'}],reviewMembersByExtent:{rules:[{label:'@reader',value:'@reader'}]},
  };
  const comment={kind:'comment',step:'open',on:'comment',line:'Comment',fields:[{name:'body',type:'text',required:true}]};
  const review={kind:'review-verdict',step:'open',on:'review',line:'Review',fields:[{name:'manifest',type:'item',required:true},{name:'request',type:'item',required:false},{name:'extent',type:'text',required:false},{name:'verdict',type:'enum',required:true,choices:[{label:'Approve',value:'approve'}]},{name:'body',type:'text',required:false}]};
  const create={kind:'open-issue',step:'open',on:'lane',line:'Open',fields:[{name:'definition',type:'digest',required:true,choices:[{label:'Issue',value:'native-pin'}]},{name:'title',type:'text',required:true},{name:'conditions',type:'list',required:true}]};
  const otherRule={kind:'custom-rule-action',step:'open',on:'record',line:'Scripted custom rule action',fields:[]};
  let finishRule!:()=>void;
  const publish={kind:'publish',step:'transition',on:'rules',line:'Publish',fields:[]};
  const loadedRules={scope:'rules',head:{seq:2,hash:fixtureDigest},item:0,revision:1,approvals:1,ownerMayReview:false,singleControllerException:false,checks:[],labels:[],extents:[{name:'source',patterns:[],approvals:1,approver:'change.review',checks:[],class:'content'}],definitions:[],controllers:[]};
  const close={kind:'close-own',step:'transition',on:'intent',line:'Close',fields:[{name:'reason',type:'enum',required:false,choices:[{label:'Completed',value:'completed'},{label:'Not planned',value:'not-planned'}]}]};
  let listedIssue=false;
  const childRead=gate(), releaseChild=gate();
  let creationReads=0, childConfirmed=false;
  const createdChild=vi.fn(async(_room:unknown,_result:unknown)=>{if(++creationReads===2){childRead.resolve();await releaseChild.promise;}if(!childConfirmed)return {state:'pending'};listedIssue=true;return {state:'confirmed',child:issue.ref};});
  const posts=vi.fn();const attempts:{args:unknown[];finish:(answer:'accepted'|'refused')=>void;lose:()=>void}[]=[];
  let attempted=gate();
  const act=vi.fn((...args:unknown[])=>{
    (args[5]as()=>void)();posts();attempted.resolve();
    if(args[2]==='custom-rule-action')return new Promise(resolve=>{finishRule=()=>{const result={kind:'custom-rule-action',scope:'rules',on:null,answer:{answer:'refused',reason:'guard-failed',name:'scripted-rule-boundary',judgedAt:loadedRules.head},before:loadedRules.head,after:loadedRules.head,observation:null};(args[4]as(value:unknown)=>void)(result);resolve(result);};});
    if(args[2]==='close-own'){const result={kind:'close-own',scope:issue.scope,on:0,answer:{answer:'refused',reason:'guard-failed',name:'scripted-owner-guard',judgedAt:issue.head},before:issue.head,after:issue.head,observation:null};(args[4]as(value:unknown)=>void)(result);return Promise.resolve(result);}
    return new Promise((resolve,reject)=>attempts.push({args,finish:answer=>{const result={kind:args[2],scope:args[1],on:null,answer:answer==='accepted'?{answer,receipt:{fact:{at:{scope:args[1],inc:'one',kind:'lane'},seq:3,hash:'hash'}}}:{answer,reason:'guard-failed',name:'scripted-review-boundary',judgedAt:{seq:2,hash:fixtureDigest}},before:{seq:2,hash:'old'},after:{seq:3,hash:'new'},observation:null};(args[4]as(value:unknown)=>void)(result);resolve(result);},lose:()=>reject(new Error('Reply lost'))}));
  });
  vi.doMock('@generalbusiness/artroom-bytes',async()=>({...await vi.importActual<typeof import('@generalbusiness/artroom-bytes')>('@generalbusiness/artroom-bytes'),b64url:()=> 'device',unb64url:()=>new Uint8Array(32),keyIdOfSecret:()=> 'key'}));
  // resetModules keeps cached manual mocks. Use this case's actual view.
  vi.doMock('../src/view.ts', async () => vi.importActual<typeof import('../src/view.ts')>('../src/view.ts'));
  vi.doMock('../src/data.ts',()=>({Unreadable:class Unreadable extends Error{},act,actAssociation:(_room:unknown,scope:string)=>`room/member/${scope}`,fieldValue:(_room:unknown,_type:string,value:string)=>value,initializationStillCurrent:async()=>true,roomInitialization:async()=>({state:"configured"}),issueCreation:createdChild,openRoom:async()=>room,listLanes:async()=>({issues:listedIssue?[{scope:issue.scope,number:1,title:'Native issue',state:'open'}]:[],changes:[]}),actsOn:async(_room:unknown,scope:string)=>({acts:scope==='directory'?[create]:scope==='rules'?[publish,otherRule]:scope===change.scope?[comment,review]:[comment,close],hidden:0}),loadIssue:async()=>issue,loadChange:async()=>change,loadRules:async()=>loadedRules,siteAddress:()=>'/site/HEAD/',placeOf:vi.fn(),joinRoom:vi.fn(),enrollmentAssociation:vi.fn(),joinAssociation:vi.fn()}));
  vi.doMock('../src/retained-editor.ts',()=>({retainedEditor:()=>new Node('div')}));
  let redraw!:()=>void;const location={origin:'https://page.test',hash:'#/'};
  vi.stubGlobal('document',doc);vi.stubGlobal('location',location);vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify(settings)});vi.stubGlobal('window',{addEventListener:(_name:string,callback:()=>void)=>{redraw=callback;}});
  const refresh=async()=>{rendered=gate();redraw();await rendered.promise;};
  const done=async(index:number,answer:'accepted'|'refused')=>{rendered=gate();attempts[index]!.finish(answer);await rendered.promise;};
  const edit=(form:Node,name:string,value:string)=>{form.querySelector<Node>(`[name="field:${name}"]`)!.value=value;form.emit('input');};
  try {
    await import('../src/main.ts');await rendered.promise;
    let toolbar=root.querySelector<Node>('[data-action-slot="create"]')!;
    expect(toolbar.querySelector('[data-task-act="open-issue"]')).not.toBeNull();
    expect(toolbar.querySelectorAll<Node>('button').find(node=>node.getAttribute('aria-label')==='Inspect room record')??null).not.toBeNull();
    location.hash='#/rules';await refresh();
    toolbar=root.querySelector<Node>('[data-action-slot="next"]')!;
    const save=toolbar.querySelectorAll<Node>('button').find(node=>node.textContent==='Save changes')!;
    expect(save).toBeDefined();expect(save.hasAttribute('disabled')).toBe(true);
    expect(toolbar.querySelectorAll<Node>('button').find(node=>node.getAttribute('aria-label')==='Inspect rules record')??null).not.toBeNull();
    const rulesForm=root.querySelector<Node>('form[data-act="publish"]')!;
    expect(save.getAttribute('form')).toBe(rulesForm.getAttribute('id'));
    expect(rulesForm.querySelector('button[type=submit]')).toBeNull();
    rulesForm.querySelector<Node>('[name="approvals"]')!.value='2';rulesForm.emit('input');
    expect(save.hasAttribute('disabled')).toBe(false);
    toolbar.querySelectorAll<Node>('button').find(node=>node.getAttribute('aria-label')==='Inspect rules record')!.emit('click');
    const other=body.querySelector<Node>('form[data-act="custom-rule-action"]')!;
    attempted=gate();other.emit('submit');await attempted.promise;
    expect(save.hasAttribute('disabled')).toBe(true);
    rendered=gate();finishRule();await rendered.promise;
    body.querySelector<Node>('[data-refusal-context]')!.querySelectorAll<Node>('button').find(node=>node.textContent==='Dismiss')!.emit('click');
    location.hash='#/';await refresh();
    root.querySelector<Node>('[data-task-act="open-issue"]')!.emit('click');
    let dialog=body.querySelector<Node>('dialog')!;let form=dialog.querySelector<Node>('form[data-act="open-issue"]')!;
    edit(form,'title','Original creation draft');await refresh();
    attempted=gate();form.emit('submit');await attempted.promise;
    expect(root.textContent).toContain('Sending request');
    expect(root.querySelector<Node>('[data-task-act="open-issue"]')?.hasAttribute('disabled')).toBe(true);
    await done(0,'refused');
    expect(dialog.open).toBe(false); // The real refusal popup replaces the creation popup; its draft stays owned.
    expect(root.textContent).toContain('Refused:');
    let refusal=body.querySelector<Node>('[data-refusal-context]')!;
    expect(refusal.textContent).toContain('Guard: scripted-review-boundary');
    expect(root.querySelector<Node>('[data-request-context]')!.textContent).toContain('Refused: guard-failed');
    refusal.emit('click',{target:refusal,clientX:20,clientY:20});
    expect(body.querySelector('[data-refusal-context]')).toBe(refusal); // Dialog padding is inside the box.
    refusal.emit('click',{target:refusal,clientX:5,clientY:20});
    expect(body.querySelector('[data-refusal-context]')).toBeNull();
    await refresh();
    expect(root.querySelector<Node>('[data-request-context]')!.textContent).toContain('Refused: guard-failed');
    expect(body.querySelector('[data-refusal-context]')).toBeNull();
    root.querySelector<Node>('[data-task-act="open-issue"]')!.emit('click');
    dialog=body.querySelector<Node>('dialog')!;form=dialog.querySelector<Node>('form[data-act="open-issue"]')!;
    expect(form.querySelector<Node>('[name="field:title"]')!.value).toBe('Original creation draft');
    expect(body.querySelectorAll<Node>('dialog').filter(node=>node.open)).toHaveLength(1);
    attempted=gate();form.emit('submit');await attempted.promise;
    vi.useFakeTimers();
    rendered=gate();attempts[1]!.finish('accepted');await rendered.promise;
    expect(location.hash).toBe('#/');expect(root.textContent).not.toContain('Native issue');
    expect(createdChild).toHaveBeenCalledTimes(1); // First pending read publishes the actual manual Check button.
    const nativePosts = posts.mock.calls.length, nativeActs = act.mock.calls.length;
    await vi.advanceTimersByTimeAsync(500);await childRead.promise; // Hold the next real scheduled read, without a fake hashchange.
    expect(createdChild).toHaveBeenCalledTimes(2);
    root.querySelectorAll<Node>('button').find(node=>node.textContent==='Check created issue')!.emit('click');
    expect(createdChild).toHaveBeenCalledTimes(2); // Manual Check reuses the active read; there is no third lookup.
    expect(act.mock.calls.filter(call=>call[2]==='open-issue')).toHaveLength(2); // Original refused request, then accepted request; no replacement.
    releaseChild.resolve();await vi.advanceTimersByTimeAsync(0);
    expect(location.hash).toBe('#/');expect(root.textContent).not.toContain('Native issue');
    expect(createdChild).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(110_000); // Virtual time only: legitimate pending creation outlives the old twenty-read cutoff.
    expect(createdChild.mock.calls.length).toBeGreaterThan(20);
    expect(location.hash).toBe('#/');
    expect([posts.mock.calls.length,act.mock.calls.length]).toEqual([nativePosts,nativeActs]);
    childConfirmed=true;rendered=gate();await vi.advanceTimersByTimeAsync(5_000);await rendered.promise;
    vi.useRealTimers();
    expect(dialog.open).toBe(false);expect(root.textContent).toContain('Native issue');
    expect(createdChild.mock.calls.length).toBeGreaterThan(21);
    expect(createdChild.mock.calls[1]?.[1]).toBe(createdChild.mock.calls[0]?.[1]);
    expect([posts.mock.calls.length,act.mock.calls.length]).toEqual([nativePosts,nativeActs]);
    expect(createdChild.mock.calls[0]?.[0]).toBe(room);
    expect(location.hash).toBe(`#/issue/${issue.scope}`);
    location.hash='#/';await refresh();
    expect(root.textContent).toContain('Native issue');
    expect(root.querySelector<Node>('[data-request-context]')!.textContent).not.toContain('Refused:');

    location.hash=`#/issue/${issue.scope}`;await refresh();
    const cachedClose=root.querySelector<Node>('form[data-act="close-own"]')!;
    expect(cachedClose).not.toBeNull();
    const reason=cachedClose.querySelector<Node>('[name="field:reason"]')!;reason.value='completed';cachedClose.emit('change');
    const postsBeforeClose=posts.mock.calls.length;
    issue.requesterRef={...room.me.ref,membership:{...place.membership,inc:newIncarnation(new Uint8Array(16).fill(3))}};
    rendered=gate();cachedClose.emit('submit');await rendered.promise;
    expect(posts.mock.calls.length).toBe(postsBeforeClose);
    expect(root.querySelector<Node>('[data-action-slot="next"]')!.querySelector('form[data-act="close-own"]')).toBeNull();
    expect(root.querySelector<Node>('form[data-act="close-own"]')!.querySelector<Node>('button[type=submit]')!.hasAttribute('disabled')).toBe(true);
    issue.requesterRef=room.me.ref;await refresh();
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

    location.hash='#/change/'+change.scope;await refresh();
    root.querySelector<Node>('[data-task-act="review-verdict"]')!.emit('click');dialog=body.querySelector<Node>('dialog')!;form=dialog.querySelector<Node>('form[data-act="review-verdict"]')!;
    edit(form,'body','Keep this selected review');await refresh();
    expect(form.querySelector<Node>('[name="field:request"]')!.value).toBe('6');
    // A later request changes the unopened task's choices, never this dialog's original.
    change.requests.push({...change.requests[0]!,id:9});await refresh();
    expect(form.querySelector<Node>('[name="field:request"]')!.value).toBe('6');
    expect(form.querySelector<Node>('button[type=submit]')!.hasAttribute('disabled')).toBe(false);
    const before=act.mock.calls.length;
    change.requests[0]!.state='met';rendered=gate();form.emit('submit');await rendered.promise;
    expect(act).toHaveBeenCalledTimes(before);expect(posts).toHaveBeenCalledTimes(before);
    expect(form.querySelector<Node>('[name="field:body"]')!.value).toBe('Keep this selected review');
    change.requests[0]!.state='open';await refresh();
    const sameNameElsewhere={...room.me.ref,membership:{...place.membership,inc:newIncarnation(new Uint8Array(16).fill(2))}};
    change.requests[0]!.requestedRef=sameNameElsewhere;rendered=gate();form.emit('submit');await rendered.promise;
    expect(act).toHaveBeenCalledTimes(before);expect(posts).toHaveBeenCalledTimes(before);
    change.requests[0]!.requestedRef=room.me.ref;await refresh();

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
    attempted=gate();form.emit('submit');await attempted.promise;expect((attempts[6]!.args[3]as{fields:Record<string,string>}).fields['request']).toBe('6');await done(6,'refused');
    expect(dialog.open).toBe(false);
    body.querySelector<Node>('[data-refusal-context]')!.querySelectorAll<Node>('button').find(node=>node.textContent==='Dismiss')!.emit('click');
    root.querySelector<Node>('[data-task-act="review-verdict"]')!.emit('click');
    dialog=body.querySelector<Node>('dialog')!;form=dialog.querySelector<Node>('form[data-act="review-verdict"]')!;
    expect(form.querySelector<Node>('[name="field:body"]')!.value).toBe('Keep this selected review');
    expect(form.querySelector<Node>('[name="field:request"]')!.value).toBe('6');
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
    edit(form,'request','9');edit(form,'body','Keep unknown original review');attempted=gate();form.emit('submit');await attempted.promise;
    rendered=gate();attempts[8]!.lose();await rendered.promise;
    expect(form.querySelector<Node>('[name="field:body"]')!.value).toBe('Keep unknown original review');
    expect(form.querySelector<Node>('[name="field:body"]')!.hasAttribute('disabled')).toBe(true);
    expect(form.querySelector<Node>('button[type=submit]')!.hasAttribute('disabled')).toBe(true);
    const unknownAttempts=act.mock.calls.length;form.emit('submit');await refresh();expect(act).toHaveBeenCalledTimes(unknownAttempts);expect(posts).toHaveBeenCalledTimes(unknownAttempts);
  } finally {
    vi.clearAllTimers();vi.useRealTimers();
    // Every held fake attempt is drained before removing its document.
    for(const attempt of attempts)attempt.lose();for(let n=0;n<30;n++)await Promise.resolve();
    vi.unstubAllGlobals();vi.doUnmock('../src/view.ts');vi.doUnmock('../src/data.ts');vi.doUnmock('../src/retained-editor.ts');vi.doUnmock('@generalbusiness/artroom-bytes');vi.resetModules();
  }
});
