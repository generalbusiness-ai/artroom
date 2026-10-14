/** Real native register judgments/SQLite/RPC with the fixture clock. No provider,
 * repository creation, directory/enrollment completion, production credentials, browser or hosted admission runs here. */
import { env } from "cloudflare:test";
import { expect, test } from "vitest";
import { b64url, canonicalize, intentDigest, newIncarnation, scopeIdOf } from "@generalbusiness/artroom-bytes";
import { secretSigner, signedIntent } from "@generalbusiness/artroom-client";
import { DEMO_PURPOSE, DEMO_REGISTER, WEB_DEMO_REGISTER } from "@generalbusiness/dap-platform";
import type { Seed } from "@generalbusiness/dap-contract";
import type { Binding } from "../src/namespace.ts";
import { demoFoundingConfig, demoFoundingRoute, type DemoFoundingOffer } from "../../../apps/room/demo-founding.ts";
import { beginSessionFixture } from "./session-settings.ts";
import { nativeFixtureLifetime } from "./support/native-fixture-lifetime.ts";
import { routed } from "./repository.ts";
import { reader } from "./support.ts";

test("demo offer exposes only its configured register and admits a previously unseen founding key without changing protected reads or waking parked work", async () => {
  const owner=beginSessionFixture({secret:b64url(crypto.getRandomValues(new Uint8Array(32))),sessions:true,inspector:reader});
  const lifetime=nativeFixtureLifetime(owner);
  try {
    const installer=secretSigner(crypto.getRandomValues(new Uint8Array(32))), newcomer=secretSigner(crypto.getRandomValues(new Uint8Array(32)));
    const install=await signedIntent(installer,{to:null,kind:"install",fields:{host:"github.com",namespace:"generalbusiness-ai",policy:"open",purpose:DEMO_PURPOSE}},{now:lifetime.now()});
    const seed:Seed={v:1,kind:"register",definition:WEB_DEMO_REGISTER,creator:null,cause:intentDigest(install.intent),ordinal:0};
    const register=lifetime.platform(scopeIdOf(seed));
    // Park create-repository rather than sending any provider request.
    lifetime.outside(register.name,()=>({accepts:()=>false,send:async()=>null}));
    expect((await lifetime.wait(()=>register.stub.found(install,WEB_DEMO_REGISTER))).answer).toBe("accepted");
    const at=await lifetime.wait(()=>register.at()), origin="https://artroom-rehearsal.inguz.workers.dev";
    const deployment="TEST demo runtime identity", config={v:2 as const,origin,deployment,register:at,definition:WEB_DEMO_REGISTER};
    const bindings={DEPLOYMENT:deployment,SCOPES:env.PLATFORM as unknown as Binding,DEMO_START_CONFIG:canonicalize(config)};
    const get=()=>demoFoundingRoute(new Request(origin+"/v1/demo/founding-offer"),bindings);
    expect((await lifetime.wait(()=>routed(`https://scopes.test/v1/scopes/${at.scope}`))).status).toBe(403);
    const first=await lifetime.wait(get), offer=await first.json() as DemoFoundingOffer;
    expect((await lifetime.wait(()=>demoFoundingRoute(new Request(origin+"/v1/demo/founding-offer"),{...bindings,DEPLOYMENT:"TEST unrelated runtime"}))).status).toBe(404);
    expect(first.headers.get("cache-control")).toBe("no-store");
    expect([first.status,offer]).toEqual([200,{v:1,origin,register:at,definition:WEB_DEMO_REGISTER,at:{seq:0,hash:(await lifetime.wait(()=>register.summary())).at.hash},registerItem:{id:0,revision:1,state:"open",host:"github.com",namespace:"generalbusiness-ai",policy:"open",purpose:DEMO_PURPOSE}}]);
    expect(JSON.stringify(offer)).not.toContain(newcomer.key);
    // Native found is the judgment; the anonymous offer grants no authority.
    const found=await signedIntent(newcomer,{to:at,kind:"found",expected:{register:offer.registerItem.revision},fields:{branch:"main",founderHandle:"@newcomer",recoveryKey:installer.key}},{now:lifetime.now()});
    const answer=await lifetime.wait(()=>register.stub.submit(found,[]));
    expect(answer.answer).toBe("accepted");
    if(answer.answer!=="accepted")throw Error("Native demo admission failed");
    // The new pin does not relax an existing keys-only register.
    const oldInstall=await signedIntent(installer,{to:null,kind:"install",fields:{host:"github.com",namespace:"generalbusiness-ai",policy:"keys",founders:[installer.key]}},{now:lifetime.now()});
    const oldSeed:Seed={v:1,kind:"register",definition:"platform:register@3",creator:null,cause:intentDigest(oldInstall.intent),ordinal:0};
    const old=lifetime.platform(scopeIdOf(oldSeed));lifetime.outside(old.name,()=>({accepts:()=>false,send:async()=>null}));
    expect((await lifetime.wait(()=>old.stub.found(oldInstall,"platform:register@3"))).answer).toBe("accepted");
    const oldAt=await lifetime.wait(()=>old.at());
    const forbidden=await signedIntent(newcomer,{to:oldAt,kind:"found",expected:{register:1},fields:{branch:"main",founderHandle:"@newcomer",recoveryKey:installer.key}},{now:lifetime.now()});
    expect(await lifetime.wait(()=>old.stub.submit(forbidden,[]))).toMatchObject({answer:"refused",reason:"unauthorized"});
    // A separately retained register7 remains available only at its exact full reference.
    const legacyInstall=await signedIntent(installer,{to:null,kind:"install",fields:{host:"github.com",namespace:"generalbusiness-ai",policy:"open",purpose:DEMO_PURPOSE}},{now:lifetime.now()});
    const legacySeed:Seed={v:1,kind:"register",definition:DEMO_REGISTER,creator:null,cause:intentDigest(legacyInstall.intent),ordinal:0};
    const legacy=lifetime.platform(scopeIdOf(legacySeed));lifetime.outside(legacy.name,()=>({accepts:()=>false,send:async()=>null}));
    expect((await lifetime.wait(()=>legacy.stub.found(legacyInstall,DEMO_REGISTER))).answer).toBe("accepted");
    const legacyAt=await lifetime.wait(()=>legacy.at());
    bindings.DEMO_START_CONFIG=canonicalize({...config,legacy:{register:legacyAt,definition:DEMO_REGISTER}});
    const selected=()=>demoFoundingRoute(new Request(`${origin}/v1/demo/founding-offer?register=${legacyAt.scope}&inc=${legacyAt.inc}`),bindings);
    const legacyResponse=await lifetime.wait(selected),legacyOffer=await legacyResponse.json() as DemoFoundingOffer;
    expect([legacyResponse.status,legacyOffer.register,legacyOffer.definition]).toEqual([200,legacyAt,DEMO_REGISTER]);
    const legacyV1={...bindings,DEMO_START_CONFIG:canonicalize({...config,v:1,register:legacyAt,definition:DEMO_REGISTER})};
    const legacyDefault=await lifetime.wait(()=>demoFoundingRoute(new Request(origin+"/v1/demo/founding-offer"),legacyV1));
    expect([legacyDefault.status,(await legacyDefault.json() as DemoFoundingOffer).definition]).toEqual([200,DEMO_REGISTER]);
    for(const query of [`?register=${legacyAt.scope}&inc=${newIncarnation(new Uint8Array(16).fill(12))}`,`?register=${legacyAt.scope}&inc=${legacyAt.inc}&register=${at.scope}`,`?register=${oldAt.scope}&inc=${oldAt.inc}`,`?register=${legacyAt.scope}`,`?register=${legacyAt.scope}&inc=${legacyAt.inc}&scope=${legacyAt.scope}`])expect((await lifetime.wait(()=>demoFoundingRoute(new Request(origin+"/v1/demo/founding-offer"+query),bindings))).status).toBe(404);
    expect(demoFoundingConfig(canonicalize({...config,legacy:{register:legacyAt,definition:"platform:register@3"}}),deployment)).toBeNull();
    expect(demoFoundingConfig(canonicalize({...config,legacy:[{register:legacyAt,definition:DEMO_REGISTER}]}),deployment)).toBeNull();
    expect(demoFoundingConfig(canonicalize({...config,legacy:{register:at,definition:DEMO_REGISTER}}),deployment)).toBeNull();
    let calls=0;
    lifetime.outside(register.name,()=>({accepts:()=>true,send:async()=>{calls++;return null;}}));
    await lifetime.wait(()=>register.restart());
    const after=await lifetime.wait(get), projection=await after.json() as DemoFoundingOffer;
    expect([after.status,projection.at,calls]).toEqual([200,{seq:1,hash:answer.receipt.fact.hash},0]);
    expect(Object.keys(projection).sort()).toEqual(["at","definition","origin","register","registerItem","v"]);
    expect(JSON.stringify(projection)).not.toContain(newcomer.key);
    const wrong={...bindings,DEMO_START_CONFIG:canonicalize({...config,register:{...at,inc:newIncarnation(new Uint8Array(16).fill(11))}})};
    // A separate actual incarnation is not selected by the offer route.
    expect((await lifetime.wait(()=>demoFoundingRoute(new Request(origin+"/v1/demo/founding-offer"),wrong))).status).toBe(404);
    expect((await lifetime.wait(()=>demoFoundingRoute(new Request("https://dap.generalbusiness.ai/v1/demo/founding-offer"),bindings))).status).toBe(404);
    expect((await lifetime.wait(()=>demoFoundingRoute(new Request(origin+"/v1/demo/founding-offer?scope="+at.scope),bindings))).status).toBe(404);
    expect(demoFoundingConfig(canonicalize({...config,definition:"platform:register@3"}),deployment)).toBeNull();
  } finally {lifetime.release();}
});
