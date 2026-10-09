/** Narrow native Pages setup. Exact descriptor approval and legitimate admin authority are required; no install/founding. */
import type { Answer, Beside, FieldValue, ScopeRef, SignedIntent } from "@generalbusiness/artroom-contract";
import { b64url, canonicalize, definitionDigest, keyIdOfSecret, parseStrict, verifySignedIntent } from "@generalbusiness/artroom-bytes";
import { ScopeHandle, httpTransport, secretSigner, shapeDeclaredAct, signedIntent, signedReads } from "@generalbusiness/artroom-client";
import { expectedOf, type DefinitionShape } from "@generalbusiness/artroom-cli";
import { platform } from "@generalbusiness/artroom-platform";
import { openRoom, Unreadable, type Room } from "./data.ts";
import { PAGES_PRESET, PAGES_PRESET_DIGEST, PAGES_RULES } from "./pages-preset.ts";
import type { ClaimLocks, ClaimStorage } from "./claim.ts";

interface SetupStep { kind: "activate" | "publish"; name: string; signed: SignedIntent; beside: Beside; attempted: boolean; answer?: Answer }
interface SetupRecord { v: 1; binding: string; descriptor: string; rules: ScopeRef; steps: SetupStep[] }
export interface SetupOptions { current(): boolean; /** Exact review authorizes this immutable descriptor; caller must supply its approved digest. */ approvedDescriptor: string; locks?: ClaimLocks }
export interface PagesReadiness { ready: boolean; missing: string[] }
export interface PagesSetupResult { state: "ready" | "waiting" | "unknown" | "refused"; message: string; steps: number }
const association = (room: Room) => canonicalize([room.session.service.replace(/\/+$/, ""), room.directory, room.membership, keyIdOfSecret(room.session.secret), room.rules]);
const h = (room: Room, scope = room.rules) => new ScopeHandle(signedReads(httpTransport(room.session.service, room.session.fetch ? { fetch: room.session.fetch } : {}), secretSigner(room.session.secret), room.session.now ? { now: room.session.now } : {}), scope, room.reader?.reader() ?? null);
async function read(room: Room, scope = room.rules) { const r = await h(room, scope).summary(); if (!r.ok || !r.complete || r.next !== undefined) throw new Unreadable(`Cannot completely read ${scope}${!r.ok ? `: ${r.reason}` : ""}.`); return r.value; }
const check = (options: SetupOptions) => { if (!options.current()) throw new Unreadable("The room or key changed. No new Pages setup action was sent."); };
async function original(room: Room, options: SetupOptions): Promise<Room> { check(options); const fresh = await openRoom(room.session, { directory: room.directory, membership: room.membership }); check(options); if (association(fresh) !== association(room) || fresh.destination !== room.destination || fresh.me?.handle !== room.me?.handle) throw new Unreadable("The original room/member/key binding changed."); return fresh; }

/** Ready means exact retained activated definitions plus all reviewed rules fields, not merely scope creation. */
export async function pagesReadiness(room: Room): Promise<PagesReadiness> {
  const missing: string[] = [];
  const [D,M,R,G] = await Promise.all([read(room,room.directory),read(room,room.membership.scope),read(room),read(room,room.destination)]);
  if (D.definition !== PAGES_PRESET.runtime.cohort.directory || M.definition !== PAGES_PRESET.runtime.cohort.membership || R.definition !== PAGES_PRESET.runtime.cohort.rules || G.definition !== PAGES_PRESET.runtime.cohort.destination) missing.push("This room does not use the supported explicit @2 cohort.");
  for (const definition of PAGES_PRESET.definitions) {
    const active = R.items.find(i => i.type === "definition" && i.state === "active" && i.values["name"] === definition.name && i.values["digest"] === definition.digest);
    if (!active) { missing.push(`An admin must activate the reviewed ${definition.name} definition.`); continue; }
    const newest = R.items.filter(i => i.type === "definition" && i.state === "active" && i.values["name"] === definition.name).sort((a,b)=>b.id-a.id)[0];
    if (newest?.values["digest"] !== definition.digest) missing.push(`A newer ${definition.name} selection differs from this preset.`);
    const kept = await signedReads(httpTransport(room.session.service, room.session.fetch ? { fetch: room.session.fetch } : {}),secretSigner(room.session.secret),room.session.now ? { now: room.session.now } : {}).retained(room.rules, room.reader?.reader() ?? null, "definition", definition.digest);
    if (!kept.ok || kept.value.bytes !== definition.bytes || definitionDigest(parseStrict(kept.value.bytes) as never) !== definition.digest) missing.push(`The exact active ${definition.name} bytes could not be verified.`);
  }
  const rules = R.items.find(i=>i.type==="rules");
  if (!rules?.refs["published"] || Object.entries(PAGES_RULES).some(([name,value])=>canonicalize(rules.values[name]??null)!==canonicalize(value))) missing.push("An admin must publish the complete reviewed Pages rules; one distinct human approval, exceptions off and no unprovisioned machine checks.");
  if (typeof G.items.find(i=>i.type==="branch")?.values["head"] !== "string") missing.push("The destination's founding/publication head is not ready.");
  return {ready:missing.length===0,missing};
}

/** Private same-origin record; no device secret is stored here, but exact requests/definition texts must not be printed. */
export async function setupPages(room: Room, store: ClaimStorage, options: SetupOptions): Promise<PagesSetupResult> {
  if (options.approvedDescriptor !== PAGES_PRESET_DIGEST) throw new Unreadable("The exact Pages preset must be reviewed before activation.");
  const locks = options.locks ?? (globalThis as unknown as {navigator?:{locks?:ClaimLocks}}).navigator?.locks;
  if (!locks) throw new Unreadable("Pages setup needs browser Web Locks to protect its exact saved stages.");
  const binding = association(room); const key = `artroom-pages-setup:${b64url(new TextEncoder().encode(binding))}`;
  return locks.request(key,async()=>{
    const fresh = await original(room,options); const rs=await read(fresh); check(options);
    if (rs.definition!=="platform:rules@2" || fresh.me?.role!=="admin" || !fresh.me.actions.includes("rules.activate") || !fresh.me.actions.includes("rules.publish")) throw new Unreadable("An authorized room admin with rules.activate and rules.publish must prepare Pages.");
    const saved=store.getItem(key); let record:SetupRecord;
    if(saved){record=parseStrict(saved) as SetupRecord;if(record.v!==1||record.binding!==binding||record.descriptor!==PAGES_PRESET_DIGEST||canonicalize(record.rules)!==canonicalize(rs.scope)||!Array.isArray(record.steps)||record.steps.length>3||new Set(record.steps.map(s=>`${s.kind}:${s.name}`)).size!==record.steps.length||record.steps.some(s=>!verifySignedIntent(s.signed)||s.signed.intent.actor!==room.key||canonicalize(s.signed.intent.to)!==canonicalize(rs.scope)||s.signed.intent.kind!==s.kind||!["activate","publish"].includes(s.kind)))throw new Unreadable("The retained Pages setup binding is inconsistent; nothing was replaced.");}
    else record={v:1,binding,descriptor:PAGES_PRESET_DIGEST,rules:rs.scope,steps:[]};
    for (const step of record.steps) {
      const definition = PAGES_PRESET.definitions.find(d => d.name === step.name);
      const fields = step.kind === "activate" && definition ? { digest: definition.digest, name: definition.name } : step.kind === "publish" && step.name === "rules" ? PAGES_RULES : null;
      const expectedBeside = step.kind === "activate" && definition ? { values: [definition.bytes] } : {};
      if (!fields || canonicalize(step.signed.intent.fields) !== canonicalize(fields) || canonicalize(step.beside) !== canonicalize(expectedBeside) || typeof step.attempted !== "boolean") throw new Unreadable("The retained Pages stage differs from its exact descriptor. Nothing was replaced.");
    }
    const keep=()=>{const bytes=canonicalize(record);store.setItem(key,bytes);if(store.getItem(key)!==bytes)throw new Unreadable("The exact Pages stage could not be retained. Check storage before sending.");};
    const result=(state:PagesSetupResult["state"],message:string):PagesSetupResult=>({state,message,steps:record.steps.length});
    for(const step of record.steps){
      if(step.answer?.answer==="refused")return result("refused",`${step.kind} refused: ${step.answer.reason}. Retained stages were not replaced.`);
      if(step.attempted&&step.answer?.answer!=="accepted"){
        const settled=await h(fresh).settle(step.signed);if(!settled.ok)return result("unknown","An original Pages request remains unknown. No new stage was signed.");
        step.answer={answer:"accepted",receipt:settled.value};keep();
      }
      if(step.answer?.answer==="accepted"){
        const followed=await h(fresh).followReceipt(step.answer.receipt);
        if(!followed.ok||followed.entry.input.type!=="act"||canonicalize(followed.entry.input.signed)!==canonicalize(step.signed))return result("unknown","An accepted Pages answer is retained; its entry readback is unavailable. No new stage was sent.");
      }
    }
    const stages=[...PAGES_PRESET.definitions.map(d=>({kind:"activate" as const,name:d.name,fields:{digest:d.digest,name:d.name} as Record<string,FieldValue>,beside:{values:[d.bytes]} as Beside})),{kind:"publish" as const,name:"rules",fields:PAGES_RULES as unknown as Record<string,FieldValue>,beside:{} as Beside}];
    for(const stage of stages){
      const existing=record.steps.find(s=>s.kind===stage.kind&&s.name===stage.name); if(existing?.answer?.answer==="accepted")continue;
      const current=await original(room,options);if(current.me?.role!=="admin"||!current.me.actions.includes("rules.activate")||!current.me.actions.includes("rules.publish"))throw new Unreadable("Pages setup authority changed; no new stage was sent.");const state=await read(current);check(options);if(canonicalize(state.scope)!==canonicalize(record.rules))throw new Unreadable("The original rules incarnation changed.");
      if(stage.kind==="activate"&&state.items.some(i=>i.type==="definition"&&i.state==="active"&&i.values["name"]===stage.name&&i.values["digest"]===stage.fields["digest"]))continue;
      let step=existing;
      if(!step){const supplied=platform(state.definition)!;const shape=supplied.data as unknown as DefinitionShape;const on=stage.kind==="publish"?state.items.find(i=>i.type==="rules")?.id??null:null;const shaped=shapeDeclaredAct(supplied.data as never,stage.kind,{on,fields:stage.fields} as never);const signed=await signedIntent(secretSigner(current.session.secret),{to:state.scope,kind:stage.kind,on,fields:shaped.fields,expected:expectedOf(shape.acts[stage.kind]!,state.items,on,stage.fields)},current.session.now?{now:current.session.now()}:{});step={kind:stage.kind,name:stage.name,signed,beside:{...shaped.beside,...stage.beside},attempted:false};record.steps.push(step);keep();}
      const beforeSend=await original(room,options);const beforeRules=await read(beforeSend);check(options);if(beforeSend.me?.role!=="admin"||!beforeSend.me.actions.includes("rules.activate")||!beforeSend.me.actions.includes("rules.publish")||canonicalize(beforeRules.scope)!==canonicalize(record.rules))throw new Unreadable("The original setup authority or rules incarnation changed before sending.");step.attempted=true;keep();
      try{step.answer=await h(current).submit(step.signed,[],step.beside);keep();}catch{return result("unknown","The Pages request/reply is unavailable. Its exact stage is retained; no next stage was sent.");}
      if(step.answer.answer!=="accepted")return result(step.answer.answer==="refused"?"refused":"unknown",`${stage.kind}: ${step.answer.answer}. Keep the original request before another mutation.`);
      const followed=await h(current).followReceipt(step.answer.receipt);if(!followed.ok||followed.entry.input.type!=="act"||canonicalize(followed.entry.input.signed)!==canonicalize(step.signed))return result("unknown","Pages stage recorded; verification read unavailable. No next stage was sent.");
    }
    const ready=await pagesReadiness(await original(room,options));return result(ready.ready?"ready":"waiting",ready.ready?"Pages definitions and complete reviewed rules verified in the native room.":ready.missing.join(" "));
  });
}
