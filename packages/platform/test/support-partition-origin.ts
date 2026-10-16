/** SCRIPTED coherent immutable frames. No native factory judgment ran. */
import type { Digest, Entry, FactRef, Request, PlatformDefinition, ScopeRef, Seed } from "@generalbusiness/dap-contract";
import { factRefOf, intentDigest, newIncarnation, scopeIdOf, seedDigest, signIntent } from "@generalbusiness/artroom-bytes";
import { type Fetched } from "@generalbusiness/dap-derive";
import { d, keys, T0, t } from "@generalbusiness/dap-derive/testing";
import { PARTITION_COHORT as C } from "../src/directory-partitions.ts";

export function scriptedPartitionOrigin(name: "application" | "change" | "issue" = "change", concerns = 0, wrongConcernMembership = false, definition: Digest = d("f")) {
  let inc = 1;
  const address = (seed: Seed): ScopeRef => ({ kind: seed.kind, scope: scopeIdOf(seed), inc: newIncarnation(new Uint8Array(16).fill(inc++)) });
  const empty = (at: ScopeRef): Omit<Entry, "input"> => ({ v: 1, at, seq: 0, prev: null, time: T0, clamped: false, epoch: 0, uses: [], prepared: [], effects: [], sends: [] });
  const seedOf = (kind: ScopeRef["kind"], named: Digest | PlatformDefinition, creator: ScopeRef | null, cause: Digest, ordinal = 0): Seed => ({ v: 1, kind, definition: named, creator, cause, ordinal });
  const birth = (seed: Seed, at: ScopeRef, kind: string, source: FactRef | null, n: number | null, message: Request | null): Entry => ({ ...empty(at), input: { type: "genesis", seed, inc: at.inc, kind, founding: null, source, n, message, decision: "applied" } });
  const signed = (at: ScopeRef, kind: string, fields: Record<string, never> | { definition: Digest }, key: string) => signIntent({ v: 1, to: at, actor: keys.rita.key, kind, on: null, expected: {}, fields, idempotencyKey: key, notAfter: t(60) }, keys.rita.secret);
  const registerSeed = seedOf("register", C.register, null, d("1")), register = address(registerSeed);
  const rootSeed = seedOf("directory", C.directory, register, d("2")), root = address(rootSeed);
  const siblingPins = [["membership", C.membership], ["rules", C.rules], ["destination", C.destination]] as const;
  const siblingSeeds = siblingPins.map(([kind, pin], n) => seedOf(kind, pin, root, seedDigest(rootSeed), n));
  const [membership, rules, destination] = siblingSeeds.map(address) as [ScopeRef, ScopeRef, ScopeRef];
  const messages = siblingSeeds.map((_seed, n) => ({ class: "request", type: "create", body: { fields: { directory: root, ...(n > 0 ? { membership: membership.scope } : {}), ...(n === 2 ? { rules: rules.scope } : {}) } } }) as const);
  // Native genesis replies before its three creates: send n is not the
  // creation ordinal. These raw protocol fixtures retain the actual n=1..3.
  const rootGenesis: Entry = { ...birth(rootSeed, root, "establish", { at: register, seq: 1, hash: d("3") }, 0, { class: "request", type: "create", body: {} }), sends: siblingSeeds.map((to, n) => ({ n: n + 1, to, message: messages[n]! })) };
  const siblings = siblingSeeds.map((seed, n) => birth(seed, [membership, rules, destination][n]!, "establish", factRefOf(rootGenesis), n + 1, messages[n]!));
  const open = signed(root, "open-partition", {}, "scripted-partition-open"), partSeed = seedOf("directory", C.partition, root, intentDigest(open.intent)), partition = address(partSeed);
  const partMessage = { class: "request", type: "create", body: { directory: root, membership, fields: { root, membership, rules, destination, generation: 1, base: 1 } } } as const;
  const rootOpening: Entry = { ...empty(root), seq: 1, prev: factRefOf(rootGenesis).hash, input: { type: "act", signed: open, authority: [], presented: {} }, sends: [{ n: 0, to: partSeed, message: partMessage }] };
  const partGenesis = birth(partSeed, partition, "establish-partition", factRefOf(rootOpening), 0, partMessage);
  const route = name === "application" ? "establish-application" : name === "change" ? "open-pr" : "open-issue";
  const opening = signed(partition, route, { definition }, "scripted-lane-open"), laneSeed = seedOf("lane", definition, partition, intentDigest(opening.intent)), laneAt = address(laneSeed);
  const laneMessage = { class: "request", type: "create", body: { directory: partition, membership, ...(name === "application" ? { creationContext: { v: 1 } } : {}), fields: { ...(name === "issue" ? {} : { destination }), ...(name === "change" ? { rules } : {}) } } } as const;
  const laneCreating: Entry = { ...empty(partition), seq: 1, prev: factRefOf(partGenesis).hash, input: { type: "act", signed: opening, authority: [], presented: {} }, sends: [{ n: 0, to: laneSeed, message: laneMessage }] };
  let genesis = birth(laneSeed, laneAt, name === "issue" ? "file" : "open", factRefOf(laneCreating), 0, laneMessage);
  const frames: Fetched[] = [ { fact: factRefOf(genesis), entry: genesis, under: name }, { fact: factRefOf(laneCreating), entry: laneCreating, under: "platform:directory-partition" }, { fact: factRefOf(partGenesis), entry: partGenesis, under: "platform:directory-partition" }, { fact: factRefOf(rootOpening), entry: rootOpening, under: "platform:directory" }, { fact: factRefOf(rootGenesis), entry: rootGenesis, under: "platform:directory" }, ...siblings.map((entry, n) => ({ fact: factRefOf(entry), entry, under: `platform:${siblingPins[n]![0]}` })) ];
  for (let depth = 1; depth <= concerns; depth++) {
    const parent = genesis.at, concern = signed(parent, "add-concern", {}, `scripted-concern-${depth}`), seed = seedOf("lane", definition, parent, intentDigest(concern.intent)), at = address(seed);
    const message = { class: "request", type: "create", body: { directory: partition, membership: wrongConcernMembership && depth === concerns ? { ...membership, inc: newIncarnation(new Uint8Array(16).fill(31)) } : membership, fields: { origin: { self: true } } } } as const;
    const creating: Entry = { ...empty(parent), seq: 1, prev: factRefOf(genesis).hash, input: { type: "act", signed: concern, authority: [], presented: {} }, sends: [{ n: 0, to: seed, message }] };
    genesis = birth(seed, at, "file", factRefOf(creating), 0, message);
    frames.unshift({ fact: factRefOf(genesis), entry: genesis, under: "issue" }, { fact: factRefOf(creating), entry: creating, under: "issue" });
  }
  return { definition, root, partition, membership, rules, destination, genesis, from: factRefOf(genesis), frames };
}
