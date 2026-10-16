/** Explicit partition cohort. Existing directories keep their original code. */
import type { Digest, FieldValue, PlatformData, ScopeId, Seed } from "@generalbusiness/dap-contract";
import { deliveryCauseDigest, hex, intentDigest, isScopeRef, messageDigest, seedDigest, unbase32 } from "@generalbusiness/artroom-bytes";
import { same, type Item, type RuleEffect, type RuleGiven, type Rules } from "@generalbusiness/dap-derive";
import { directory8, directoryRules8 } from "./application.ts";
import { SEEN } from "./directory.ts";

export const PARTITION_COHORT = {
  register: "platform:register@11", directory: "platform:directory@10", partition: "platform:directory-partition@1",
  membership: "platform:membership@6", rules: "platform:rules@3", destination: "platform:destination@6", inbox: "platform:inbox@1",
} as const;
export const MAX_GENERATIONS = 1000;
export const PARTITION_SPAN = 100000;
const generation = { type: "int", min: 1, max: MAX_GENERATIONS } as const;
const number = { type: "int", min: 1, max: MAX_GENERATIONS * PARTITION_SPAN } as const;
const count = { type: "int", min: 0, max: MAX_GENERATIONS * PARTITION_SPAN } as const;
const fixed = { fixed: true, required: true } as const;
const mutableFlag = { fixed: false, required: true, of: { type: "bool" }, default: false } as const;
const repository = { repository: { item: "repository", one: true } } as const;
const control = (given: RuleGiven): Item => {
  const item = given.state.page("repository", ["open"], null, 1).items[0];
  if (!item) throw new Error("a native directory retains its open control item");
  return item;
};
const form = { also: {}, fields: {}, guards: [], effects: [], sends: [], attention: [] } as const;
const createPartition = { code: "create-partition", row: "DP1", result: {
  applied: [{ ref: { slot: "scope", from: { sender: true } } }, { state: "active" }],
  refused: [{ state: "refused" }], undelivered: [{ state: "undelivered" }],
  conflict: [{ value: { slot: "conflict", from: { const: true } } }],
} } as const;
const opening = { code: "open-partition", row: "DP1" } as const;
const ready = [{ code: "partition-ready", row: "DP1" }] as const;
const baseRepository = directory8.items["repository"]!;
const establish = directory8.acts["establish"]!;

export const directory10: PlatformData = {
  ...directory8,
  standing: { item: "repository", slot: "generations", entries: 3, max: MAX_GENERATIONS },
  items: {
    repository: { ...baseRepository, values: {
      ...baseRepository.values, generations: { fixed: false, required: true, of: { type: "int", min: 0, max: MAX_GENERATIONS }, default: 0 },
    } },
    partition: { many: true, max: MAX_GENERATIONS, initial: "creating", indexes: ["generation"],
      states: { creating: { final: false }, active: { final: false }, sealed: { final: true }, refused: { final: true }, undelivered: { final: true } },
      parties: {}, refs: { scope: { fixed: false, required: false, to: { type: "scope", kind: "directory" } } },
      values: { generation: { ...fixed, of: generation }, base: { ...fixed, of: number }, conflict: mutableFlag },
    },
  },
  acts: {
    establish: { ...establish, sends: establish.sends.map(send => "create" in send && send.create.kind === "membership" ? { create: { ...send.create, definition: PARTITION_COHORT.membership } } : send) },
    "retry-import": directory8.acts["retry-import"]!,
    "open-partition": { ...form, step: "open", on: "partition", grant: "issue.open", also: repository, guards: ready, effects: [opening], sends: [createPartition] },
  },
  receives: {
    compromised: directory8.receives["compromised"]!,
    seal: { ...form, message: "seal", class: "tell", from: { kind: "directory", under: "platform:directory-partition" }, opens: "partition", also: repository,
      guards: [{ code: "active-partition", row: "DP1" }], effects: [opening], sends: [createPartition] },
  },
};

const partitionOpen = { code: "partition-open", row: "DP2" } as const;
const opens = Object.fromEntries(["open-issue", "open-pr", "open-task", "establish-application"].map(name => {
  const act = directory8.acts[name]!;
  return [name, { ...act, guards: [...act.guards, partitionOpen] }];
}));
const lane = directory8.items["lane"]!;
export const directoryPartition1: PlatformData = {
  ...directory8, name: "platform:directory-partition", genesis: "establish-partition", outcomes: {},
  items: {
    lane: { ...lane, indexes: ["seed", "number"], values: { ...lane.values, seed: { ...fixed, of: { type: "digest" } }, number: { ...fixed, of: number } } },
    task: directory8.items["task"]!, application: directory8.items["application"]!,
    repository: { many: false, max: 1, initial: "open", states: { open: { final: false } }, parties: {},
      refs: Object.fromEntries((["root", "membership", "rules", "destination"] as const).map(name => [name, { ...fixed, to: { type: "scope", kind: name === "root" ? "directory" : name } }])),
      values: { generation: { ...fixed, of: generation }, base: { ...fixed, of: number }, lastNumber: { fixed: false, required: true, of: count },
        sealed: mutableFlag, handedOff: mutableFlag, sealRefused: mutableFlag, sealUndelivered: mutableFlag },
    },
  },
  acts: {
    "establish-partition": { ...form, step: "open", on: "repository", grant: "directory.establish", fields: {
      generation: { ...generation, required: true }, base: { ...number, required: true },
      ...Object.fromEntries((["root", "membership", "rules", "destination"] as const).map(name => [name, { type: "scope" as const, kind: name === "root" ? "directory" as const : name, required: true }])),
    }, guards: [{ code: "partition-birth", row: "DP2" }], effects: [
      ...(["root", "membership", "rules", "destination"] as const).map(slot => ({ ref: { slot, from: { field: slot } } })),
      ...(["generation", "base"] as const).map(slot => ({ value: { slot, from: { field: slot } } })),
      { code: "partition-first-number", row: "DP2" },
    ] },
    ...opens,
    seal: { ...form, step: "transition", on: "repository", grant: "issue.open", settles: { of: "on", sets: "sealed", in: ["open"] },
      guards: [{ equals: { a: { slot: "sealed" }, b: { const: false } }, reason: "partition-sealed" }, { code: "seal-ready", row: "DP2" }],
      effects: [{ value: { slot: "sealed", from: { const: true } } }], sends: [{ tell: { to: { slot: "root" }, message: "seal", fields: {}, result: {
        applied: [{ value: { slot: "handedOff", from: { const: true } } }], refused: [{ value: { slot: "sealRefused", from: { const: true } } }], undelivered: [{ value: { slot: "sealUndelivered", from: { const: true } } }],
      } } }],
    },
  },
  receives: { index: { ...directory8.receives["index"]!, guards: [{ code: "index-ready", row: "DP3" }] } },
};

/** A ScopeId is the base32 encoding of its immutable seed digest. */
export function partitionSeedKey(scope: ScopeId): Digest {
  const bytes = unbase32(scope.slice(3));
  if (!bytes || bytes.length !== 32) throw new Error("a lane index requires a canonical native scope ID");
  return `sha256:${hex(bytes)}`;
}
/** Null is incomplete coverage; no fallback scans an index. */
export function partitionLane(state: RuleGiven["state"], scope: ScopeId): Item | null | undefined {
  const rows = state.lookup("lane", "seed", partitionSeedKey(scope), 2);
  if (rows === null || rows.length > 1) return null;
  return rows[0] === undefined ? undefined : state.item(rows[0]) ?? null;
}
function nextNumber(given: RuleGiven, row: number): RuleEffect[] {
  const item = control(given), next = Number(item.values["lastNumber"]) + 1;
  if (!Number.isSafeInteger(next) || next < Number(item.values["base"]) || next >= Number(item.values["base"]) + PARTITION_SPAN) throw new Error("a partition's native entry bound preserves its number range");
  return [{ effect: "value", item: row, slot: "number", value: next }, { effect: "value", item: item.id, slot: "lastNumber", value: next }];
}
function active(given: RuleGiven): Item | undefined { return given.state.page("partition", ["active"], null, 1).items[0]; }
function rootReady(given: RuleGiven) {
  const item = control(given);
  if (!["membership", "rules", "destination"].every(name => isScopeRef(item.refs[name]))) return { holds: null, reason: "dependency-unavailable" } as const;
  if (Number(item.values["generations"]) >= MAX_GENERATIONS) return { holds: false, name: "root-exhausted" } as const;
  return { holds: true } as const;
}
export const directoryRules10: Rules = {
  ...directoryRules8,
  "partition-ready": { place: "guard", refusals: ["partition-pending", "root-exhausted"], run: given => {
    if (given.state.count("partition", "creating") + given.state.count("partition", "active") !== 0) return { holds: false, name: "partition-pending" };
    return rootReady(given);
  } },
  "active-partition": { place: "guard", refusals: ["not-the-active-partition", "root-exhausted"], run: given => {
    if (given.input.type !== "delivery" || !same(active(given)?.refs["scope"], given.input.from.at)) return { holds: false, name: "not-the-active-partition" };
    return rootReady(given);
  } },
  "open-partition": { place: "effect", most: 4, run: given => {
    const item = control(given), g = Number(item.values["generations"]) + 1;
    const previous = given.input.type === "delivery" ? active(given) : undefined;
    return [
      ...(previous ? [{ effect: "state" as const, item: previous.id, state: "sealed" }] : []),
      { effect: "value", item: given.resolved.self, slot: "generation", value: g },
      { effect: "value", item: given.resolved.self, slot: "base", value: (g - 1) * PARTITION_SPAN + 1 },
      { effect: "value", item: item.id, slot: "generations", value: g },
    ];
  } },
  "create-partition": { place: "send", run: given => {
    if (given.input.type !== "act" && given.input.type !== "delivery") throw new Error("a handoff has an act or native delivery cause");
    const item = control(given), g = Number(item.values["generations"]) + 1;
    const seed: Seed = { v: 1, kind: "directory", definition: PARTITION_COHORT.partition, creator: given.resolved.at,
      cause: given.input.type === "act" ? intentDigest(given.input.signed.intent) : deliveryCauseDigest({ v: 1, from: given.input.from, n: given.input.n, message: messageDigest(given.input.message) }), ordinal: 0 };
    return { to: seed, message: { class: "request", type: "create", body: { directory: given.resolved.at, membership: item.refs["membership"], fields: {
      root: given.resolved.at, membership: item.refs["membership"], rules: item.refs["rules"], destination: item.refs["destination"], generation: g, base: (g - 1) * PARTITION_SPAN + 1,
    } } } };
  } },
};

export const directoryPartitionRules1: Rules = {
  ...directoryRules8,
  "partition-birth": { place: "guard", refusals: ["partition-context-mismatch"], run: given => {
    const { fields } = given.resolved;
    const source = given.input.type === "genesis" ? given.uses.find(copy => same(copy.fact, given.input.type === "genesis" ? given.input.source : null)) : undefined;
    return { holds: given.input.type === "genesis" && source?.under === "platform:directory" && given.input.seed.definition === PARTITION_COHORT.partition
      && given.input.seed.creator !== null && same(fields["root"], given.input.seed.creator)
      && fields["base"] === (Number(fields["generation"]) - 1) * PARTITION_SPAN + 1,
    name: "partition-context-mismatch" };
  } },
  "partition-first-number": { place: "effect", most: 1, run: given => [{ effect: "value", item: given.resolved.self, slot: "lastNumber", value: Number(given.resolved.fields["base"]) - 1 }] },
  "partition-open": { place: "guard", refusals: ["partition-sealed", "partition-full"], run: given => {
    if (control(given).values["sealed"] !== false) return { holds: false, name: "partition-sealed" };
    return (given.state.scope()?.head.seq ?? -1) + 1 < Math.floor(given.resolved.bounds.scopeEntries / 4) ? { holds: true } : { holds: false, name: "partition-full" };
  } },
  "seal-ready": { place: "guard", refusals: ["partition-not-full"], run: given => (given.state.scope()?.head.seq ?? -1) + 1 >= Math.floor(given.resolved.bounds.scopeEntries / 4) ? { holds: true } : { holds: false, name: "partition-not-full" } },
  "next-number": { place: "effect", most: 3, run: given => {
    if (given.input.type !== "act") throw new Error("a native lane opening retains its signed intent");
    const seed: Seed = { v: 1, kind: "lane", definition: given.resolved.fields["definition"] as Digest, creator: given.resolved.at, cause: intentDigest(given.input.signed.intent), ordinal: 0 };
    return [...nextNumber(given, given.resolved.self), { effect: "value", item: given.resolved.self, slot: "seed", value: seedDigest(seed) }];
  } },
  "index-ready": { place: "guard", refusals: [], run: given => given.input.type !== "delivery" || partitionLane(given.state, given.input.from.at.scope) === null ? { holds: null, reason: "dependency-unavailable" } : { holds: true } },
  "index-row": { place: "effect", most: 36, run: given => {
    if (given.input.type !== "delivery") throw new Error("a lane index is a native delivery");
    const from = given.input.from, held = partitionLane(given.state, from.at.scope);
    if (held === null) throw new Error("index coverage was checked before effects");
    const source = given.uses.find(use => same(use.fact, from))?.entry;
    if (!source) throw new Error("the source entry is retained");
    const row = held?.id ?? given.resolved.self, fields = given.resolved.fields;
    const effects: RuleEffect[] = held ? [] : [{ effect: "open", item: row, type: "lane", state: "listed" }, { effect: "ref", item: row, slot: "scope", to: from.at as unknown as FieldValue }, { effect: "value", item: row, slot: "seed", value: partitionSeedKey(from.at.scope) }];
    if (fields["kind"] !== undefined && held?.values["kind"] == null) effects.push({ effect: "value", item: row, slot: "kind", value: fields["kind"] });
    if (fields["author"] !== undefined && !held?.parties["author"]) effects.push({ effect: "party", item: row, slot: "author", member: fields["author"] as never });
    const before = (held?.values["seen"] ?? {}) as Record<string, number>, seen = { ...before };
    for (const field of SEEN) {
      const value = fields[field];
      if (value === undefined || (before[field] !== undefined && before[field] >= from.seq)) continue;
      seen[field] = from.seq;
      if (field !== "assignees") effects.push({ effect: "value", item: row, slot: field, value });
      else {
        const was = (held?.parties["assignees"] ?? []) as readonly import("@generalbusiness/dap-contract").MemberRef[];
        const next = value as unknown as typeof was;
        for (const member of was) if (!next.some(other => same(other, member))) effects.push({ effect: "list", item: row, slot: field, change: "remove", member });
        for (const member of next) if (!was.some(other => same(other, member))) effects.push({ effect: "list", item: row, slot: field, change: "add", member });
      }
    }
    const first = held?.values["first"], latest = held?.values["latest"];
    if (typeof first !== "string" || source.time < first) effects.push({ effect: "value", item: row, slot: "first", value: source.time });
    if (typeof latest !== "string" || source.time > latest) effects.push({ effect: "value", item: row, slot: "latest", value: source.time });
    if (Object.keys(seen).some(field => seen[field] !== before[field])) effects.push({ effect: "value", item: row, slot: "seen", value: seen });
    return effects;
  } },
  "index-number": { place: "effect", most: 2, run: given => {
    if (given.input.type !== "delivery") throw new Error("a lane index is a native delivery");
    return partitionLane(given.state, given.input.from.at.scope) ? [] : nextNumber(given, given.resolved.self);
  } },
};
