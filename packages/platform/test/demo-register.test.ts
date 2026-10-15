/** Real platform field codecs, judgments, and folded scopes in memory.
 * The Git creation answer is scripted. No scope runtime, provider, or hosted
 * admission runs here. */
import { expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/dap-contract";
import { intentDigest, isDigest, newIncarnation, scopeIdOf, signIntent } from "@generalbusiness/artroom-bytes";
import { PROFILES, clockOf, judgeGenesis, judgeOutcome, validateDefinition } from "@generalbusiness/dap-derive";
import { Ledger, T0, creation } from "@generalbusiness/dap-derive/testing";
import { DEMO_PURPOSE, DEMO_REGISTER, WEB_DEMO_COHORT, WEB_DEMO_REGISTER, platform, repositoryName } from "../src/index.ts";
import { installing, paul, rita } from "./support-founding.ts";

test("demo install admits open founding without an allow-list and refuses a closed founding policy through the real genesis judge", () => {
  const supplied=platform(DEMO_REGISTER)!;
  const checked=validateDefinition(supplied.data,PROPOSED_BOUNDS,PROFILES,{platform:true});
  if(!checked.ok)throw Error("The demo definition failed validation");
  const definitionOf = (named: string) => {
    const result = validateDefinition(platform(named)!.data, PROPOSED_BOUNDS, PROFILES, { platform: true });
    if (!result.ok) expect.fail(`The selected platform definition failed validation: ${named}`);
    return result.definition;
  };
  const judged=(policy:"open"|"keys",founders:string[]|undefined,named:typeof DEMO_REGISTER|typeof WEB_DEMO_REGISTER=DEMO_REGISTER)=>{
    const selected = platform(named)!;
    const definition = named === DEMO_REGISTER ? checked.definition : definitionOf(named);
    const source=installing(paul,policy,founders).intent;
    const signed=signIntent({...source,fields:{...source.fields,purpose:DEMO_PURPOSE}},paul.secret);
    const seed={v:1 as const,kind:"register" as const,definition:named,creator:null,cause:intentDigest(signed.intent),ordinal:0};
    const ledger=new Ledger(definition,"platform:register");
    return judgeGenesis(ledger.state,definition,{name:scopeIdOf(seed),inc:newIncarnation(new Uint8Array(16).fill(7)),seed,founding:signed},{clock:clockOf(ledger.state,T0),bounds:PROPOSED_BOUNDS,facts:[],prepared:[],source:null,platform:{named,rules:selected.rules}});
  };
  const original = judged("open",undefined);
  expect(original.result).toBe("write");
  // Both requests carry a valid singleton-enum purpose. This assertion reaches
  // the install policy rule rather than failing the shared field codec.
  expect(judged("keys",[rita.key])).toMatchObject({result:"refused",reason:"unauthorized"});
  expect(judged("keys",[rita.key],WEB_DEMO_REGISTER)).toMatchObject({result:"refused",reason:"unauthorized"});

  // Shared judges/folds in memory. The confirmed Git creation answer below is
  // scripted; no provider or scope runtime runs. The child sends are real rules.
  const born = [DEMO_REGISTER, WEB_DEMO_REGISTER].map(named => {
    const selected = platform(named)!, definition = definitionOf(named);
    const register = new Ledger(definition, "platform:register");
    const genesis = named === DEMO_REGISTER ? original : judged("open", undefined, named);
    if (genesis.result !== "write") expect.fail("The selected demo genesis was refused.");
    register.seal(genesis.draft);
    const authority = { named, rules: selected.rules };
    expect(register.act(rita, "found", { expected: { register: register.item(0).revision }, fields: { branch: "main", founderHandle: "@rita", recoveryKey: paul.key } }, { platform: authority, grants: [] }).result).toBe("write");
    const found = register.head.seq, claimSeed = register.item(found).values["seed"];
    if (!isDigest(claimSeed)) expect.fail("The recorded founding seed is missing.");
    const outcome = judgeOutcome(register.state, definition, { type: "outcome", operation: `${found}:0`, attempt: 1, result: "confirmed", evidence: { basis: "own-answer", body: { name: repositoryName(claimSeed, 1), id: "demo-repository" } } }, { clock: clockOf(register.state, T0), bounds: PROPOSED_BOUNDS, platform: authority, own: register.own });
    if (outcome.result !== "write") expect.fail("The scripted creation answer was refused.");
    register.seal(outcome.draft);
    const directoryCreation = creation(register, register.head.seq);
    const directoryName = named === DEMO_REGISTER ? "platform:directory@3" : WEB_DEMO_COHORT.directory;
    expect(directoryCreation.asked.to.definition).toBe(directoryName);
    const directoryDefinition = definitionOf(directoryName);
    const directory = new Ledger(directoryDefinition, "platform:directory");
    const directoryGenesis = judgeGenesis(directory.state, directoryDefinition, directoryCreation.asked, { clock: clockOf(directory.state, T0), bounds: PROPOSED_BOUNDS, prepared: [], facts: [{ fact: register.fact(found), entry: register.entries[found]!.entry, under: register.under }], source: directoryCreation.source, platform: { named: directoryName, rules: platform(directoryName)!.rules } });
    if (directoryGenesis.result !== "write") expect.fail("The selected directory genesis was refused.");
    directory.seal(directoryGenesis.draft);
    expect(directory.last.sends.slice(1).map(send => "definition" in send.to ? send.to.definition : null)).toEqual(["platform:membership@2", named === DEMO_REGISTER ? "platform:rules@2" : WEB_DEMO_COHORT.rules, "platform:destination@3"]);
    const rulesCreation = creation(directory, 0, 2), rulesName = named === DEMO_REGISTER ? "platform:rules@2" : WEB_DEMO_COHORT.rules;
    expect(rulesCreation.asked.to.definition).toBe(rulesName);
    const rulesDefinition = definitionOf(rulesName), rules = new Ledger(rulesDefinition, "platform:rules");
    const rulesGenesis = judgeGenesis(rules.state, rulesDefinition, rulesCreation.asked, { clock: clockOf(rules.state, T0), bounds: PROPOSED_BOUNDS, facts: [], prepared: [], source: rulesCreation.source, platform: { named: rulesName, rules: platform(rulesName)!.rules } });
    if (rulesGenesis.result !== "write") expect.fail("The selected rules genesis was refused.");
    rules.seal(rulesGenesis.draft);
    return [rulesName, rules.item(0).values["ownerMayReview"]];
  });
  expect(born).toEqual([["platform:rules@2", false], [WEB_DEMO_COHORT.rules, true]]);
});
