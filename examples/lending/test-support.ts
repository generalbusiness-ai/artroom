/** In-memory judges and fold. Membership grants and the destination reference are stand-ins; no delivery or Git host runs. */
import { PROPOSED_BOUNDS } from "@generalbusiness/dap-contract";
import { prepareRules, validateDefinition } from "@generalbusiness/dap-derive";
import { evaluateRules, RULE_PROFILES } from "@generalbusiness/dap-derive/rule";
import { created, keys, directory, valid, type Actor, type Ledger } from "@generalbusiness/dap-derive/testing";
import { lending } from "./definition.ts";
export const destination = { ...directory, kind: "destination" as const };
export const make = () => created(valid(validateDefinition(lending, PROPOSED_BOUNDS, RULE_PROFILES)), { opener: keys.rita.member, destination });
export async function submit(s: Ledger, who: Actor, kind: string, over: Parameters<Ledger["intent"]>[2] = {}, context: Parameters<Ledger["context"]>[0] = {}) {
  const signed = s.intent(who, kind, over), ctx = s.context(context);
  const prepared = await evaluateRules(prepareRules(s.state, s.definition, { act: signed, context: ctx }));
  return s.submit(signed, { ...context, prepared });
}
export const donation = (s: Ledger, name: string, description: string, page = `shelf/${s.entries.length.toString(16).padStart(16, "0")}.md`, content = "A signed page") => ({ expected: { "library": s.item(0).revision }, fields: { name, description, page, content } });
export const over = (s: Ledger, id: number, fields = {}) => ({ on: id, expected: { on: s.item(id).revision, "library": s.item(0).revision }, fields: { content: "A signed page", ...fields } });
