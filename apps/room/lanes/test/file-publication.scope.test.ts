import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";
import type { ScopeId } from "@generalbusiness/dap-contract";
import { canonicalize, definitionDigest, textDigest, factRefOf, isFactRef, isScopeRef, scopeIdOf, timeMs, utf8 } from "@generalbusiness/artroom-bytes";
import { command, memoryStore, type Context, type Outcome } from "../../../../packages/cli/src/index.ts";
import { FILE_PUBLICATION_COHORT, FIRST_ACTIONS_OF, fileReceiptRef, firstExtents, receiptRef } from "@generalbusiness/dap-platform";
import { changeDemo3 } from "../src/index.ts";
import { lending } from "../../../../examples/lending/definition.ts";
import { LENDING_DEFINITION } from "../../../../examples/lending/pin.ts";
import { siteFixtureLifetime } from "../../../../packages/scope/test/support/site-fixture-lifetime.ts";
import { dispatchFixture, driveFixture } from "../../../../packages/scope/test/support/native-fixture-lifetime.ts";
import { ownHost, readerOf } from "../../../../packages/scope/test/hosts.ts";
import { Platform, rita, routed } from "../../../../packages/scope/test/repository.ts";
import { net } from "../../../../packages/scope/src/testing.ts";
import { site } from "../../../../packages/scope/src/site/route.ts";
import type { Item } from "@generalbusiness/dap-derive";

// Real CLI-created R9/D8/M4/Q3/G4, real change and Lending scopes, factory
// proofs, authority, SQLite, queue, objects, receipts and immutable Site reads.
// OwnGit's maps and wire packs, finite scheduler, clock and local key store
// are labelled STAND-INS. No provider, deployment or browser runs here.
test("a real change and Lending tell share one slot: the held change finishes first and the later file wins with its own receipt", async () => {
  const life = siteFixtureLifetime(), host = ownHost(), nodes: Platform[] = [];
  let register: Platform | undefined;
  const wire = (name: ScopeId) => life.wire(name, (given, sql) => host.outside(given, sql, host.bindings(register!.name)));
  const pause = async (waiting: readonly string[]) => driveFixture([...nodes, ...waiting.filter(name => !nodes.some(node => node.name === name)).map(name => new Platform(name as ScopeId))], life.wait);
  const path = "shelf/0123456789abcdef.md", fromChange = "# From the real change\n", fromLending = "# Later Lending page\n";
  const files = { "change.json": utf8(canonicalize(changeDemo3)), "change.md": utf8(fromChange) };
  const store = memoryStore();
  await store.keep("operator", rita.secret);
  const fetch = ((url: string, init?: RequestInit) => life.wait(() => routed(url, init))) as NonNullable<Context["fetch"]>;
  const ctx: Context = { store, fetch, trustedFoundingService: { service: "https://scopes.test", fetch },
    now: () => timeMs(net.clock.now)!, pause, read: async name => files[name as keyof typeof files] ?? null };
  const run = (...args: string[]) => life.wait(() => command(ctx, args));
  const ok = (result: Outcome) => { expect(result.code, result.lines.join("\n")).toBe(0); return result; };
  const retained = (G: Platform): Promise<Item[]> => life.wait(() => runInDurableObject(G.object, (_object, state) => state.storage.sql.exec<{record:string}>("SELECT record FROM item ORDER BY id").toArray().map(row => JSON.parse(row.record) as Item)));
  let release = () => {}, originalEdit: Promise<Outcome> | undefined;
    // Exactly one actual receive-pack answer is held after the stand-in applied
    // the change's main compare-and-swap. No reply is lost or operation resent.
    let held = false, armed = false;
    let entered!: () => void;
    const enteredPush = new Promise<void>(resolve => { entered=resolve; });
    const released = new Promise<void>(resolve => { release=resolve; });
    const actualFetch = host.stand.fetch;
    host.stand.fetch = async request => {
      let main=false;
      if(armed && !held && request.method==="POST" && new URL(request.url).pathname.endsWith("/git-receive-pack")) {
        const data=new Uint8Array(await request.clone().arrayBuffer()), size=parseInt(new TextDecoder().decode(data.subarray(0,4)),16);
        main=new TextDecoder().decode(data.subarray(4,size)).includes(" refs/heads/main\0");
      }
      const response=await actualFetch(request);
      if(main){held=true;entered();await released;}
      return response;
    };
  try {
    ok(await run("install", "https://scopes.test", "--cohort", "application-publication", "--host", host.host, "--namespace", host.namespace));
    const R = register = new Platform((await store.config())!.register!.scope); wire(R.name); await R.restart(); nodes.push(R);
    life.setHold(envelope => { if ("definition" in envelope.to) wire(scopeIdOf(envelope.to)); return false; });
    ok(await run("claim", "Mixed publication", "--handle", "@rita"));
    const config = (await store.config())!, room = config.repository!;
    const D = new Platform(room.directory.scope), M = new Platform(room.membership.scope), Q = new Platform(room.rules), G = new Platform(room.destination);
    nodes.push(D, M, Q, G);
    await G.restart(); await pause([]);
    expect((await G.summary()).value.definition).toBe(FILE_PUBLICATION_COHORT.destination);
    expect(host.stand.refs.get("refs/heads/main")).toBeDefined();
    ok(await run("act", "publish", "--on", "rules", "--target", "0", "--set", "approvals=0", "--set", "ownerMayReview=false", "--set", "checks=[]", "--set", "labels=[]", "--set", `extents=${JSON.stringify(firstExtents({approvals:0,checks:[]}))}`));
    ok(await run("act", "activate", "--on", "rules", "--set", `digest=${definitionDigest(changeDemo3)}`, "--set", "name=change", "--value", "change.json"));
    expect(await Q.stub.submit(await Q.intent(rita,"activate",{fields:{digest:LENDING_DEFINITION,name:lending.name}}),[],{values:[canonicalize(lending)]})).toMatchObject({answer:"accepted"});
    const creation = await D.stub.submit(await D.intent(rita,"establish-application",{expected:await D.expected({repository:0}),fields:{definition:LENDING_DEFINITION,values:"{}",execution:"recorded-do"}}),[],{values:[canonicalize(lending)]});
    expect(creation.answer).toBe("accepted");
    if(creation.answer!=="accepted") throw new Error("The actual application factory must create Lending.");
    const L = await D.created(creation.receipt.fact.seq);nodes.push(L); await pause([]);
    expect((await L.item(0)).refs["destination"]).toEqual(await G.at());
    await M.did(rita,"set-actions",{on:0,expected:await M.expected({on:0}),fields:{role:"admin",actions:[...FIRST_ACTIONS_OF[FILE_PUBLICATION_COHORT.membership]!.admin,"lending.member"]}});
    life.advance(301); // End the earlier membership observation's reuse window, as the existing role witness does.

    armed=true;
    originalEdit=run("edit",path,"--file","change.md");
    await Promise.race([enteredPush, originalEdit.then(result => { ok(result); throw new Error("The change completed without reaching the held main push."); })]);
    const busy=await retained(G), change=busy.find(item=>item.type==="publication"&&item.state==="publishing")!;
    expect(change).toBeDefined();
    expect(busy.find(item=>item.type==="branch")!.values["slot"]).toBe(change.id);
    const operation=change.refs["operation"];
    expect(isFactRef(operation)).toBe(true);
    if(!isFactRef(operation)) throw new Error("The real change publication names its actual merge entry.");
    const changedRow=(await D.summary()).value.items.find(item=>item.type==="lane"&&item.values["kind"]==="pr")!;
    const changedScope=changedRow.refs["scope"];
    expect(isScopeRef(changedScope)).toBe(true);
    if(!isScopeRef(changedScope)) throw new Error("The actual Directory records its native change child.");
    const changed=new Platform(changedScope.scope), actualMerge=(await changed.entries()).find(entry=>entry.input.type==="act"&&entry.input.signed.intent.kind==="merge")!;
    expect((await changed.summary()).value.definition).toBe(definitionDigest(changeDemo3));
    expect(operation).toEqual(factRefOf(actualMerge));
    const lendingAct=await L.did(rita,"donate",{expected:await L.expected({library:0}),fields:{name:"Pot",description:"Copper",page:path,content:fromLending}});
    await dispatchFixture([L,G],life.wait);
    const queued=await retained(G), file=queued.find(item=>item.type==="file-publication")!;
    expect(file).toMatchObject({state:"queued",values:{sourceSeq:lendingAct,sourceOrdinal:0,path}});
    expect(queued.find(item=>item.type==="branch")!.values["slot"]).toBe(change.id);
    // The first push really landed outside, but its held answer has not settled
    // the Native attempt. Only the initial head and that change may be pushed.
    expect(host.stand.pushes.filter(push=>push.ref==="refs/heads/main")).toHaveLength(2);
    const changePush=host.stand.refs.get("refs/heads/main")!;
    expect(host.stand.pushes.filter(push=>push.ref==="refs/heads/main"&&push.commit===changePush)).toHaveLength(1);
    release(); ok(await originalEdit); await pause([]);
    const final=await retained(G), finalFile=final.find(item=>item.id===file.id)!;
    expect(final.find(item=>item.id===change.id)?.state).toBe("cleaned");
    expect(finalFile.state).toBe("published");
    expect(final.find(item=>item.type==="branch")!.values["slot"]??null).toBeNull();
    expect(file.id).toBeGreaterThan(change.id); // Admission is destination entry order.
    const reserving=(await G.entries())[finalFile.values["reservedAt"] as number]!;
    expect(reserving.input).toMatchObject({type:"outcome",kind:"file-judge"});
    const laterCommit=finalFile.values["integration"] as string;
    expect(host.stand.refs.get("refs/heads/main")).toBe(laterCommit);
    expect(host.stand.pushes.filter(push=>push.ref==="refs/heads/main"&&push.commit===laterCommit)).toHaveLength(1);
    const read=readerOf(host.stand), later=await read.commit(laterCommit);
    expect(later.parents).toEqual([changePush]);
    const source=factRefOf((await L.entries())[lendingAct]!);
    const receipt = async (ref: string) => {
      const commit=await read.commit(host.stand.refs.get(ref)!);
      const tree=await read.tree(commit.tree);
      expect(tree).toHaveLength(1);
      return JSON.parse(new TextDecoder().decode(await read.blob(tree[0]!.id))) as Record<string,unknown>;
    };
    const changeReceipt=await receipt(receiptRef(operation)!), fileReceipt=await receipt(fileReceiptRef({from:source,n:0}));
    expect(changeReceipt).toMatchObject({operation,commit:changePush});
    expect(fileReceipt).toMatchObject({cause:{from:source,n:0},path,contentDigest:textDigest(fromLending),commit:laterCommit});
    expect(final.filter(item=>item.type==="receipt"&&item.values["commit"]===changePush)).toMatchObject([{state:"written"}]);
    expect(final.filter(item=>item.type==="receipt"&&item.values["commit"]===laterCommit)).toMatchObject([{state:"written"}]);
    const page=async(commit:string)=>site(new Request(`https://scopes.test/site/${D.name}/${commit}/${path}`),{SCOPES:env.PLATFORM,...host.bindings(R.name)},host.stand.fetch);
    const earlier=await page(changePush), newest=await page(laterCommit);
    expect(earlier.status).toBe(200);expect(await earlier.text()).toContain("From the real change");
    expect(newest.status).toBe(200);expect(await newest.text()).toContain("Later Lending page");
  } finally { release();if(originalEdit) await originalEdit.catch(()=>undefined);life.release(); }
});
