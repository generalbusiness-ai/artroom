/** Real platform field codec and genesis judgment in memory. No scope runtime,
 * provider, install operation or hosted admission runs here. */
import { expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import { intentDigest, newIncarnation, scopeIdOf, signIntent } from "@generalbusiness/artroom-bytes";
import { PROFILES, clockOf, judgeGenesis, validateDefinition } from "@generalbusiness/artroom-derive";
import { Ledger, T0 } from "@generalbusiness/artroom-derive/testing";
import { DEMO_PURPOSE, DEMO_REGISTER, platform } from "../src/index.ts";
import { installing, paul, rita } from "./support-founding.ts";

test("demo install admits open founding without an allow-list and refuses a closed founding policy through the real genesis judge", () => {
  const supplied=platform(DEMO_REGISTER)!;
  const checked=validateDefinition(supplied.data,PROPOSED_BOUNDS,PROFILES,{platform:true});
  if(!checked.ok)throw Error("The demo definition failed validation");
  const judged=(policy:"open"|"keys",founders:string[]|undefined)=>{
    const source=installing(paul,policy,founders).intent;
    const signed=signIntent({...source,fields:{...source.fields,purpose:DEMO_PURPOSE}},paul.secret);
    const seed={v:1 as const,kind:"register" as const,definition:DEMO_REGISTER,creator:null,cause:intentDigest(signed.intent),ordinal:0};
    const ledger=new Ledger(checked.definition,"platform:register");
    return judgeGenesis(ledger.state,checked.definition,{name:scopeIdOf(seed),inc:newIncarnation(new Uint8Array(16).fill(7)),seed,founding:signed},{clock:clockOf(ledger.state,T0),bounds:PROPOSED_BOUNDS,facts:[],prepared:[],source:null,platform:{named:DEMO_REGISTER,rules:supplied.rules}});
  };
  expect(judged("open",undefined).result).toBe("write");
  // Both requests carry a valid singleton-enum purpose. This assertion reaches
  // the install policy rule rather than failing the shared field codec.
  expect(judged("keys",[rita.key])).toMatchObject({result:"refused",reason:"unauthorized"});
});
