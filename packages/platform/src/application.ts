/** Explicit supporting application cohort; legacy room pins and defaults stay unchanged. */
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { Bounds, DeclaredDefinition, Digest, FieldType, MemberRef, PlatformData, RulesObservation, Seed } from "@generalbusiness/artroom-contract";
import { canonicalize, intentDigest, parseStrict, utf8 } from "@generalbusiness/artroom-bytes";
import { isObject, readFields, same, type Rules } from "@generalbusiness/artroom-derive";
import { definitionClosure, definitionDependencies } from "./definition-input.ts";
import { DEFINITION_DOMAIN, directory2, directoryMembership, directoryRules, directoryRulesScope } from "./directory.ts";

export const APPLICATION_COHORT = {
  register: "platform:register@5", directory: "platform:directory@5", membership: "platform:membership@4",
  rules: "platform:rules@3", destination: "platform:destination@2", inbox: "platform:inbox@1",
} as const;
export const APPLICATION_VALUES_BYTES = 16 * 1024;
// Only opener is injected into domain fields. Authoritative membership and
// directory live in the separate create body and never come from this record.
const RESERVED = new Set(["opener"]);
function rawFits(raw: string): boolean {
  if (raw.length > APPLICATION_VALUES_BYTES) return false;
  let bytes = 0;
  for (const char of raw) {
    const code = char.codePointAt(0)!;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
    if (bytes > APPLICATION_VALUES_BYTES) return false;
  }
  return true;
}

// These types need preparation beside an ordinary typed intent. This first
// factory path supplies no detached texts or facts hidden in a JSON field.
function preparedType(type: FieldType): boolean {
  return type.type === "fact" || type.type === "item" || (type.type === "text" && type.detached === true)
    || (type.type === "record" && Object.values(type.of).some(preparedType))
    || (type.type === "list" && preparedType(type.of));
}

/** Raw input is bounded before parsing; final canonical values include the trusted opener. */
export function applicationValues(raw: unknown, declared: DeclaredDefinition, opener: MemberRef, bounds: Bounds): Record<string, import("@generalbusiness/artroom-contract").FieldValue> | null {
  if (typeof raw !== "string" || !rawFits(raw)) return null;
  let value: unknown;
  try { value = parseStrict(raw); } catch { return null; }
  if (!isObject(value) || Object.keys(value).some((name) => RESERVED.has(name)) || canonicalize(value) !== raw) return null;
  const genesis = declared.acts[declared.genesis];
  if (!genesis || Object.values(genesis.fields).some(preparedType)) return null;
  const openerType = genesis.fields["opener"];
  if (openerType && openerType.type !== "member") return null;
  const read = readFields(genesis.fields, { ...value, ...(openerType ? { opener } : {}) }, bounds);
  if (!read.ok || Object.keys(read.fields).length > bounds.sendFields || utf8(canonicalize(read.fields)).length > Math.min(APPLICATION_VALUES_BYTES, bounds.entryBytes)) return null;
  return read.fields;
}

const establishment: PlatformData["acts"][string] = {
  step: "open", on: "application", grant: "application.establish",
  also: { repository: { item: "repository", one: true } },
  fields: {
    ...definitionDependencies,
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
    const checked = definitionClosure(given, "definition");
    if (checked.result === "unavailable") return unavailable;
    if (checked.result !== "ready" || checked.declarations.some((declared) => declared.capabilities.length > 0) || !applicationValues(given.resolved.fields["values"], checked.root, signer.member, given.resolved.bounds)) return unsupported;
    return { holds: true };
  } },
  "create-application": { place: "send", run: (given) => {
    const checked = definitionClosure(given, "definition"), signer = given.resolved.signer;
    if (given.input.type !== "act" || checked.result !== "ready" || !signer) throw new Error("application creation follows its validated admission");
    const fields = applicationValues(given.resolved.fields["values"], checked.root, signer.member, given.resolved.bounds);
    if (!fields) throw new Error("application creation retains its validated genesis values");
    const membership = directoryMembership(given.state);
    if (!membership) throw new Error("application creation retains its confirmed native membership");
    const seed: Seed = { v: 1, kind: "lane", definition: given.resolved.fields["definition"] as Digest, creator: given.resolved.at, cause: intentDigest(given.input.signed.intent), ordinal: 0 };
    return { to: seed, message: { class: "request", type: "create", body: { fields, directory: given.resolved.at, membership, creationContext: { v: 1 } } } };
  } },
};
