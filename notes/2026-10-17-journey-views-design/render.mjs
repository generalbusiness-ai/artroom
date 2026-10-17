// Browser proof for static examples only; no host, service or signing is exercised.
// Supply an already installed, pinned Playwright module and Chrome executable.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url));
const base=new URL(process.env.DESIGN_BASE_URL||'http://127.0.0.1:63452/notes/2026-10-17-journey-views-design/');
assert.equal(base.hostname,'127.0.0.1');assert.equal(base.protocol,'http:');
assert(process.env.PLAYWRIGHT_MODULE&&process.env.CHROME_PATH,'Use existing pinned tools; do not install in the checkout');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);
const out=process.env.DESIGN_RENDER_DIR||path.join(root,'renders');
try {await access(out);throw new Error('Evidence directory already exists; use a new directory');} catch(e){if(e.code!=='ENOENT')throw e;}
await mkdir(out,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(await readFile(path.join(root,'mockups.json'),'utf8'));
const inputs={};
for(const name of ['build.py','mockups.css','mockups.json','render.mjs',...manifest.pages.map(p=>p.path),'index-light.html','index-dark.html'])inputs[name]=hash(await readFile(path.join(root,name)));
const report={kind:'static-design-browser-proof',started:new Date().toISOString(),base:base.href,tools:{playwrightModule:process.env.PLAYWRIGHT_MODULE,chrome:process.env.CHROME_PATH},limits:'Fictional static navigation, rendered in isolated headless Chrome. No real room, service, signing, custody, provider, MCP bridge or host conformance.',inputs,checks:[],renders:[],failures:[]};
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
report.tools.browserVersion=browser.version();
const contexts=[];
async function context(viewport,deviceScaleFactor=1){
 const c=await browser.newContext({viewport,deviceScaleFactor});contexts.push(c);
 await c.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==base.origin){report.failures.push({kind:'unexpected-network',url:u.href});return route.abort();}return route.continue();});return c;
}
async function open(c,key,theme='light'){
 const p=await c.newPage();p.errors=[];p.on('pageerror',e=>p.errors.push(String(e)));p.on('console',m=>{if(['error','warning'].includes(m.type()))p.errors.push(m.text())});
 const r=await p.goto(new URL(`${key}-${theme}.html`,base).href);assert.equal(r.status(),200);await p.evaluate(async()=>{await Promise.all(['Open Runde','Sometype Mono','Teletype33'].map(name=>document.fonts.load('16px \"'+name+'\"')));await document.fonts.ready;});return p;
}
async function metrics(p){return p.evaluate(()=>({width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,title:document.title,scripts:document.scripts.length,forms:document.forms.length,fonts:document.fonts.check('16px "Open Runde"')&&document.fonts.check('16px "Sometype Mono"'),images:[...document.images].every(i=>i.complete&&i.naturalWidth>0),externalLinks:[...document.querySelectorAll('a[href]')].filter(a=>a.origin!==location.origin).map(a=>a.href),csp:document.querySelector('meta[http-equiv="Content-Security-Policy"]').content}));}
async function clean(p,label){const m=await metrics(p);assert(m.scrollWidth<=m.width,`${label}: horizontal overflow ${m.scrollWidth}/${m.width}`);assert.equal(m.scripts,0);assert.equal(m.forms,0);assert(m.fonts&&m.images,`${label}: fonts or images missing`);assert.equal(m.externalLinks.length,0);assert(m.csp.includes("connect-src 'none'"));assert.deepEqual(p.errors,[],`${label}: browser errors`);m.targets=[];for(const control of await p.locator('a,button,summary').all()){if(!await control.isVisible())continue;const box=await control.boundingBox();const name=(await control.getAttribute('aria-label'))||(await control.innerText());assert(box.width>=44&&box.height>=44,`${label}: small standalone control ${name}: ${box.width} × ${box.height}`);m.targets.push({name,width:box.width,height:box.height});}return m;}
async function shot(p,name,fullPage=true,extra={}){const file=name+'.png';await p.screenshot({path:path.join(out,file),fullPage});const bytes=await readFile(path.join(out,file));report.renders.push({file,bytes:bytes.length,sha256:hash(bytes),fullPage,...extra});}
async function check(name,body){try{await body();report.checks.push({name,status:'passed'});}catch(e){report.failures.push({name,error:e.stack});report.checks.push({name,status:'failed'});}}
async function contains(p,text){assert((await p.locator('main').innerText()).includes(text),`Missing ${text} at ${p.url()}`);}
async function click(p,name){await p.getByRole('link',{name,exact:true}).click();await p.evaluate(()=>document.fonts.ready);}
async function state(p,key){assert.equal(await p.locator('body').getAttribute('data-example'),key);}
try{
 await check('All local link and image targets exist',async()=>{
  for(const file of [...manifest.pages.map(p=>p.path),'index-light.html','index-dark.html']){
   const s=await readFile(path.join(root,file),'utf8');for(const match of s.matchAll(/(?:href|src)="([^"]+)"/g)){assert(!/^[a-z]+:/i.test(match[1]));await access(path.resolve(root,match[1]));}
  }
 });
 // Every design state, both themes, at a desktop and a phone width.
 for(const viewport of [{width:1536,height:1024},{width:390,height:844}]){
  const c=await context(viewport);
  for(const item of [...manifest.pages,{key:'index',theme:'light'},{key:'index',theme:'dark'}]){
   const label=`${item.key}-${item.theme}-${viewport.width}`;
   await check(label,async()=>{const p=await open(c,item.key,item.theme);try{const m=await clean(p,label);await shot(p,label,true,{key:item.key,theme:item.theme,viewport,metrics:m});}finally{await p.close();}});
  }
  await c.close();
 }
 const primary=[['needs-you','light'],['work-active','light'],['decision-requested','light'],['change-review','light'],['file-diff','light'],['needs-you','dark'],['change-unknown','light'],['file-interdiff','light']];
 await check('Native viewport comparisons and all primary actions',async()=>{
  for(let i=0;i<primary.length;i++){
   const [key,theme]=primary[i],viewport=i<5?{width:1536,height:1024}:{width:390,height:844};const c=await context(viewport),p=await open(c,key,theme);await clean(p,key);await shot(p,`${key}-${theme}-${viewport.width}-viewport`,false,{key,theme,viewport});
   if(key==='needs-you'&&viewport.width===390){const rect=await p.getByRole('link',{name:'Read decision',exact:true}).boundingBox();assert(rect.y+rect.height<=844,'First queue action must fit phone viewport');}
   await c.close();
  }
 });
 await check('320 px reflow and 200 percent browser-zoom-equivalent layout',async()=>{
  for(const [viewport,scale,label] of [[{width:320,height:844},1,'320'],[{width:640,height:450},2,'zoom200-equivalent']]){
   const c=await context(viewport,scale);
   for(const key of ['needs-you','work-active','decision-requested','change-review','file-interdiff']){const p=await open(c,key);await clean(p,key+label);await shot(p,`${key}-${label}`,true,{key,theme:'light',viewport,deviceScaleFactor:scale,note:label==='320'?'Narrow reflow':'1280 × 900 physical pixels represented by 640 × 450 CSS pixels at scale 2; layout equivalent, not a real host zoom setting'});await p.close();}await c.close();
  }
 });
 await check('Keyboard focus, target sizes, full commits and reader tabs',async()=>{
  const c=await context({width:390,height:844}),p=await open(c,'file-interdiff');
  await p.keyboard.press('Tab');assert.equal(await p.locator(':focus').getAttribute('aria-label'),'dap Needs you');
  const focus=await p.locator(':focus').evaluate(e=>({style:getComputedStyle(e).outlineStyle,width:getComputedStyle(e).outlineWidth}));assert.equal(focus.style,'solid');assert.equal(focus.width,'3px');
  await p.getByText('Full commits',{exact:true}).focus();await p.keyboard.press('Enter');assert(await p.locator('details').getAttribute('open')!==null);await contains(p,manifest.commits['Version 1 integration']);await contains(p,manifest.commits['Version 2 integration']);
  assert.deepEqual(await p.locator('.tabs a').allTextContents(),['File','Diff','Interdiff']);
  for(const a of await p.locator('.button,.nav a,.tabs a,summary').all()){const r=await a.boundingBox();assert(r.width>=44&&r.height>=44,`Small target ${await a.textContent()}`);}
  await shot(p,'file-interdiff-keyboard-full-commits',true,{viewport:{width:390,height:844}});await c.close();
 });
 await check('Sandboxed fixed-height iframe scrolls without host SDK',async()=>{
  const c=await context({width:430,height:680}),p=await c.newPage();await p.setContent(`<iframe title="Design view" sandbox="allow-same-origin" style="width:390px;height:600px;border:0" src="${new URL('change-review-dark.html',base)}"></iframe>`);
  const iframe=await p.locator('iframe').elementHandle(),f=await iframe.contentFrame();await f.waitForSelector('h1');await f.evaluate(()=>document.fonts.ready);
  const m=await f.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,scripts:document.scripts.length}));assert(m.scroll<=m.width);assert(m.height>600);assert.equal(m.scripts,0);await f.getByRole('link',{name:'Approve version 2',exact:true}).scrollIntoViewIfNeeded();assert(await f.getByRole('link',{name:'Approve version 2',exact:true}).isVisible());await shot(p,'sandbox-iframe-dark',false,{iframe:m,viewport:{width:430,height:680},limits:'Layout only. No MCP handshake, bridge or host integration.'});await c.close();
 });
 for(const theme of ['light','dark']){
 const c=await context({width:390,height:844});
 await check(`Handoff agents (${theme})`,async()=>{const p=await open(c,'work-ready',theme);await p.locator('.work-row').nth(0).getByRole('link',{name:'Offer work',exact:true}).click();await state(p,'work-offered-interface');await p.locator('.work-row').nth(1).getByRole('link',{name:'Offer work',exact:true}).click();await state(p,'work-offered');assert.equal(await p.getByText('The offeree accepts',{exact:true}).count(),2);await click(p,'Read latest record');await state(p,'work-active');await contains(p,'v1 · accepted');await p.close();});
 await check(`Return and catch up (${theme})`,async()=>{const p=await open(c,'needs-you',theme);await click(p,'Read decision');await click(p,'Needs you');await contains(p,'7 new entries');await click(p,'Mark reviewed');await contains(p,'0 new entries');assert.equal(await p.locator('.needs-row').count(),3);await contains(p,'Keep completed tasks in history?');await p.goto(new URL(`needs-partial-${theme}.html`,base).href);await contains(p,'6 new entries loaded; more may remain');await contains(p,'2 of 3 scopes checked');assert(await p.getByRole('button',{name:'Mark reviewed',exact:true}).isDisabled());await contains(p,'Last known item');await click(p,'Load more');await contains(p,'7 new entries');await p.close();});
 await check(`Review, changes and pinned readers (${theme})`,async()=>{const p=await open(c,'change-review',theme);await click(p,'Read diff');await state(p,'file-diff');await contains(p,'8475e1b');await click(p,'Interdiff');await contains(p,'62a6ace');await contains(p,'6ef5643');assert.deepEqual(await p.locator('.diff-line .new').allTextContents(),['12','','13','14','15','16']);await click(p,'File');await contains(p,'lines 12–16');await click(p,'Back to change');await click(p,'Request changes');await state(p,'change-changes');await contains(p,'Changes requested on version 2');assert(await p.getByRole('button',{name:'Merge version 2',exact:true}).isDisabled());await p.goto(new URL(`change-stale-${theme}.html`,base).href);await contains(p,'older version');assert.equal(await p.getByRole('link',{name:'Approve version 2',exact:true}).count(),0);await click(p,'Read version 2');await state(p,'change-review');await p.close();});
 await check(`Requested person approval and separate revision (${theme})`,async()=>{const p=await open(c,'decision-requested',theme);assert(await p.getByRole('button',{name:'Record decision',exact:true}).isDisabled());await click(p,'Approve text v2');await state(p,'decision-approved');await contains(p,'Conditions are still unchanged');await click(p,'Record decision');await state(p,'decision-decided');await contains(p,'still name v1');await click(p,'Revise the work conditions');await state(p,'work-terms-changed');await contains(p,'Terms v2');await contains(p,'v1 · accepted');await p.locator('.work-row').nth(0).getByRole('link',{name:'Offer current terms',exact:true}).click();await p.locator('.work-row').nth(1).getByRole('link',{name:'Offer current terms',exact:true}).click();await state(p,'work-reoffered');assert.equal(await p.getByText('Old commitment: v1 · still accepted. This offer is a new commitment.',{exact:true}).count(),2);await click(p,'Read latest record');await contains(p,'v2 · accepted');for(const key of ['work-resumed','work-delivered']){await p.goto(new URL(`${key}-${theme}.html`,base).href);await contains(p,'Terms v2');assert.equal(await p.locator('a[href^="work-ready-"]').count(),0);assert.equal(await p.getByRole('link',{name:'Offer work',exact:true}).count(),0);assert.equal(await p.locator('[data-prototype-action=offer]').count(),0);}await p.close();});
 await check(`Confirmed publication retains each change (${theme})`,async()=>{const p=await open(c,'change-review',theme);await click(p,'Approve version 2');await click(p,'Merge version 2');await state(p,'change-published');await contains(p,manifest.commits['Version 2 integration']);await contains(p,'refs/heads/main');await click(p,'Read Work');await contains(p,'Delivered by Change 12');await p.goto(new URL(`needs-you-${theme}.html`,base).href);await click(p,'Review change');await state(p,'change-secondary');await click(p,'Read this change’s diff');await contains(p,'d664779');await click(p,'Back to Change 18');await click(p,'Approve version 2');await click(p,'Merge version 2');await contains(p,manifest.commits['Change 18 integration']);await contains(p,'Change 18');await p.close();});
 await check(`Refusals, stalls and original-request recovery (${theme})`,async()=>{const p=await open(c,'decision-refused',theme);assert(await p.getByRole('button',{name:'Approve text v2',exact:true}).isDisabled());await contains(p,'cannot stand in for Ari');await p.goto(new URL(`decision-unrequested-${theme}.html`,base).href);await contains(p,'Rin is not a requested approver');assert(await p.getByRole('button',{name:'Approve text v2',exact:true}).isDisabled());await p.goto(new URL(`decision-stale-${theme}.html`,base).href);await contains(p,'delete completed tasks permanently');assert.equal(await p.locator('[data-prototype-action]').count(),0);await p.goto(new URL(`work-stalled-${theme}.html`,base).href);await contains(p,'cause of the stall is not known');await p.goto(new URL(`change-unknown-${theme}.html`,base).href);assert.deepEqual(await p.locator('[data-prototype-action]').evaluateAll(es=>es.map(e=>e.dataset.prototypeAction)),['settle-original']);await click(p,'Check original request');await contains(p,manifest.commits['Change 9 integration']);await contains(p,'refs/heads/main');await p.goto(new URL(`change-recovery-unavailable-${theme}.html`,base).href);await contains(p,'no replacement merge');assert.equal(await p.locator('[data-prototype-action]').count(),0);for(const key of ['no-checks','check-failed']){await p.goto(new URL(`change-${key}-${theme}.html`,base).href);assert(await p.getByRole('button',{name:'Merge version 2',exact:true}).isDisabled());assert(!(await p.locator('main').innerText()).includes('Passed for integration'));}await p.goto(new URL(`file-truncated-${theme}.html`,base).href);await contains(p,'Truncated');assert.equal(await p.locator('.diff-line').count(),3);await p.goto(new URL(`file-unavailable-${theme}.html`,base).href);assert.equal(await p.locator('.code-pane').count(),0);await p.close();});
 await c.close();
 }
 for(const [name,digest] of Object.entries(inputs))assert.equal(hash(await readFile(path.join(root,name))),digest,`Input changed during run: ${name}`);
} catch(e){report.failures.push({kind:'runner',error:e.stack});}
finally{for(const c of contexts)await c.close().catch(()=>{});await browser.close();report.finished=new Date().toISOString();report.status=report.failures.length?'failed':'passed';await writeFile(path.join(out,'render-index.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,renders:report.renders.length,checks:report.checks.length,failures:report.failures}));}
if(report.failures.length)process.exitCode=1;
