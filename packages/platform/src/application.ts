/** Explicit supporting application cohort; legacy room pins and defaults stay unchanged. */
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { Bounds, DeclaredDefinition, Digest, FieldType, MemberRef, PlatformData, RulesObservation, Seed } from "@generalbusiness/artroom-contract";
import { canonicalize, intentDigest, isDigest, parseStrict, utf8 } from "@generalbusiness/artroom-bytes";
import { isObject, readFields, same, validateDefinition, type RuleGiven, type Rules } from "@generalbusiness/artroom-derive";
import { RULE_PROFILES } from "@generalbusiness/artroom-derive/rule";
import { DEFINITION_DOMAIN, directory2, directoryMembership, directoryRules, directoryRulesScope } from "./directory.ts";

export const APPLICATION_COHORT = {
  register: "platform:register@5", directory: "platform:directory@5", membership: "platform:membership@4",
  rules: "platform:rules@3", destination: "platform:destination@2", inbox: "platform:inbox@1",
} as const;
export const APPLICATION_VALUES_BYTES = 16 * 1024;
const RESERVED = new Set(["opener", "membership", "directory", "binding", "kind", "barrier"]);

// These types need preparation beside an ordinary typed intent. This first
// factory path supplies no detached texts or facts hidden in a JSON field.
function preparedType(type: FieldType): boolean {
  return type.type === "fact" || type.type === "item" || (type.type === "text" && type.detached === true)
    || (type.type === "record" && Object.values(type.of).some(preparedType))
    || (type.type === "list" && preparedType(type.of));
}
function reserved(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(reserved);
  return isObject(value) && Object.entries(value).some(([name, child]) => RESERVED.has(name) || reserved(child));
}

/** Raw input is bounded before parsing; final canonical values include the trusted opener. */
export function applicationValues(raw: unknown, declared: DeclaredDefinition, opener: MemberRef, bounds: Bounds): Record<string, import("@generalbusiness/artroom-contract").FieldValue> | null {
  if (typeof raw !== "string" || raw.length > APPLICATION_VALUES_BYTES || utf8(raw).length > APPLICATION_VALUES_BYTES) return null;
  let value: unknown;
  try { value = parseStrict(raw); } catch { return null; }
  if (!isObject(value) || reserved(value) || canonicalize(value) !== raw) return null;
  const genesis = declared.acts[declared.genesis];
  if (!genesis || Object.values(genesis.fields).some(preparedType)) return null;
  const openerType = genesis.fields["opener"];
  if (openerType && openerType.type !== "member") return null;
  const read = readFields(genesis.fields, { ...value, ...(openerType ? { opener } : {}) }, bounds);
  if (!read.ok || Object.keys(read.fields).length > bounds.sendFields || utf8(canonicalize(read.fields)).length > Math.min(APPLICATION_VALUES_BYTES, bounds.entryBytes)) return null;
  return read.fields;
}

/** Complete static declaration closure; every dependency is validated and retained by the existing value reader. */
function applicationDefinition(given: RuleGiven): { result: "ready"; definition: DeclaredDefinition } | { result: "unavailable" | "unsupported" } {
  const digest = given.resolved.fields["definition"];
  if (!isDigest(digest)) return { result: "unsupported" };
  const seen = new Set<Digest>(), queue = [digest];
  let root: DeclaredDefinition | undefined;
  while (queue.length) {
    const next = queue.shift()!;
    if (seen.has(next)) continue;
    if (seen.size >= given.resolved.bounds.namedDefinitions + 1) return { result: "unsupported" };
    seen.add(next);
    const value = given.value(DEFINITION_DOMAIN, next, given.resolved.bounds.definitionBytes);
    if (value === undefined) return { result: "unavailable" };
    const checked = validateDefinition(value, given.resolved.bounds, RULE_PROFILES);
    if (!checked.ok || checked.definition.digest !== next || checked.definition.declared.capabilities.length) return { result: "unsupported" };
    const declared = checked.definition.declared;
    if (next === digest) root = declared;
    for (const handler of [...Object.values(declared.acts), ...Object.values(declared.receives)]) {
      for (const send of handler.sends) {
        if (!("create" in send) || send.create.definition === "self") continue;
        if (!isDigest(send.create.definition)) return { result: "unsupported" };
        if (!seen.has(send.create.definition) && !queue.includes(send.create.definition)) queue.push(send.create.definition);
        if (seen.size + queue.length > given.resolved.bounds.namedDefinitions + 1) return { result: "unsupported" };
      }
    }
  }
  return root ? { result: "ready", definition: root } : { result: "unsupported" };
}

const establishment: PlatformData["acts"][string] = {
  step: "open", on: "application", grant: "application.establish",
  also: { repository: { item: "repository", one: true } },
  fields: {
    definition: { type: "digest", required: true, value: { domain: DEFINITION_DOMAIN, max: PROPOSED_BOUNDS.definitionBytes } },
    values: { type: "text", max: APPLICATION_VALUES_BYTES, required: true },
    execution: { type: "enum", of: ["recorded-do"], required: true },
  },
  observes: [{ of: "definitions", window: 300, use: "reuse" }],
  guards: [{ code: "application-ready", row: "F1" }],
  effects: [
    { party: { slot: "author", from: { signer: true } } },
    { value: { slot: "definition", from: { field: "definition" } } },
  ],
  sends: [{ code: "create-application", row: "F1", result: {
    applied: [{ ref: { slot: "scope", from: { sender: true } } }, { state: "created" }],
    refused: [{ state: "refused" }], conflict: [{ state: "conflict" }],
  } }],
  attention: [],
};
const genesis = directory2.acts["establish"]!;
export const directory5: PlatformData = {
  ...directory2,
  items: { ...directory2.items, application: {
    many: true, max: 1000, initial: "creating",
    states: { creating: { final: false }, created: { final: false }, refused: { final: true }, conflict: { final: true } },
    parties: { author: { fixed: true, required: true, list: false, author: true } },
    refs: { scope: { fixed: false, required: false, to: { type: "scope", kind: "lane" } } },
    values: { definition: { fixed: true, required: true, of: { type: "digest" } } },
  } },
  acts: { ...directory2.acts, establish: { ...genesis, sends: genesis.sends.map((send) =>
    "create" in send && send.create.kind === "membership" ? { create: { ...send.create, definition: APPLICATION_COHORT.membership } } : send) },
    "establish-application": establishment },
};
export const directoryRules5: Rules = {
  ...directoryRules,
  "application-ready": { place: "guard", refusals: ["not-activated", "unsupported-application"], run: (given) => {
    const unavailable = { holds: null, reason: "dependency-unavailable" } as const;
    const unsupported = { holds: false, name: "unsupported-application", code: "unsupported-definition" } as const;
    const rules = directoryRulesScope(given.state), membership = directoryMembership(given.state), signer = given.resolved.signer;
    const observation = given.observed({ asked: "definitions" })?.observation as RulesObservation | undefined;
    if (!rules || !membership || !signer || !same(signer.member.membership, membership) || !observation || !same(observation.of, rules) || observation.content.asked !== "definitions") return unavailable;
    if (!observation.content.active.some((active) => active.digest === given.resolved.fields["definition"])) return { holds: false, name: "not-activated" };
    const checked = applicationDefinition(given);
    if (checked.result === "unavailable") return unavailable;
    if (checked.result !== "ready" || !applicationValues(given.resolved.fields["values"], checked.definition, signer.member, given.resolved.bounds)) return unsupported;
    return { holds: true };
  } },
  "create-application": { place: "send", run: (given) => {
    const checked = applicationDefinition(given), signer = given.resolved.signer;
    if (given.input.type !== "act" || checked.result !== "ready" || !signer) throw new Error("application creation follows its validated admission");
    const fields = applicationValues(given.resolved.fields["values"], checked.definition, signer.member, given.resolved.bounds);
    if (!fields) throw new Error("application creation retains its validated genesis values");
    const seed: Seed = { v: 1, kind: "lane", definition: given.resolved.fields["definition"] as Digest, creator: given.resolved.at, cause: intentDigest(given.input.signed.intent), ordinal: 0 };
    return { to: seed, message: { class: "request", type: "create", body: { fields, directory: given.resolved.at, membership: directoryMembership(given.state) } } };
  } },
};
