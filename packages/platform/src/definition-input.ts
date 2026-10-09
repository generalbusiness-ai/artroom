/** Supporting cohort's explicit bounded declaration closure, using existing value places. */
import { PROPOSED_BOUNDS, type DeclaredDefinition, type Digest } from "@generalbusiness/artroom-contract";
import { canonicalize, isDigest, utf8 } from "@generalbusiness/artroom-bytes";
import { validateDefinition, type RuleGiven } from "@generalbusiness/artroom-derive";
import { RULE_PROFILES } from "@generalbusiness/artroom-derive/rule";

export const DEFINITION_DEPENDENCIES = 16;
export const definitionDependencies = Object.fromEntries(Array.from({ length: DEFINITION_DEPENDENCIES }, (_, index) => [
  `dependency${index + 1}`, { type: "digest" as const, required: false, value: { domain: "artroom-definition-1", max: PROPOSED_BOUNDS.definitionBytes } },
]));

export type DefinitionClosure = { result: "ready"; root: DeclaredDefinition; declarations: readonly DeclaredDefinition[]; bytes: number }
  | { result: "unavailable" | "unsupported" };

/** Every static child is bound by a distinct declared input field; nothing is fetched from a latest cache. */
export function definitionClosure(given: RuleGiven, field: "digest" | "definition"): DefinitionClosure {
  const digest = given.resolved.fields[field];
  if (!isDigest(digest)) return { result: "unsupported" };
  const bindings = new Map<Digest, string>([[digest, field]]);
  for (const name of Object.keys(definitionDependencies)) {
    const value = given.resolved.fields[name];
    if (value === undefined) continue;
    if (!isDigest(value) || bindings.has(value)) return { result: "unsupported" };
    bindings.set(value, name);
  }
  if (bindings.size > Math.min(DEFINITION_DEPENDENCIES, given.resolved.bounds.namedDefinitions) + 1) return { result: "unsupported" };
  const declarations = new Map<Digest, DeclaredDefinition>(), queue = [digest];
  let bytes = 0;
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    if (declarations.has(next)) continue;
    const name = bindings.get(next);
    if (!name) return { result: "unavailable" };
    // Core bounds each actual raw value before its strict parse and matches
    // its canonical bytes/digest at this declared place. Validation below is
    // not a substitute for that predecode bound.
    const value = given.placed(name);
    if (value === undefined) return { result: "unavailable" };
    const checked = validateDefinition(value, given.resolved.bounds, RULE_PROFILES);
    if (!checked.ok || checked.definition.digest !== next) return { result: "unsupported" };
    bytes += utf8(canonicalize(value)).length;
    // Finite per-invocation closure allocation bound, not retained-history capacity.
    if (bytes > bindings.size * given.resolved.bounds.definitionBytes) return { result: "unsupported" };
    const declared = checked.definition.declared;
    declarations.set(next, declared);
    for (const handler of [...Object.values(declared.acts), ...Object.values(declared.receives)]) for (const send of handler.sends) {
      if (!("create" in send) || send.create.definition === "self") continue;
      const child = send.create.definition;
      if (!isDigest(child)) return { result: "unsupported" };
      if (!bindings.has(child)) return { result: "unavailable" };
      if (!declarations.has(child) && !queue.includes(child)) queue.push(child);
    }
  }
  if (declarations.size !== bindings.size) return { result: "unsupported" };
  return { result: "ready", root: declarations.get(digest)!, declarations: [...declarations.values()], bytes };
}
