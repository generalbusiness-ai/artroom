/** Direct partition births only. These policies require authenticated native
 * Source frames or normally checked replay runs. Hash-valid arbitrary entries
 * are not proof of native execution. Old destination policies remain separate. */
import { PROPOSED_BOUNDS } from "@generalbusiness/dap-contract";
import type { DeclaredDefinition, Digest, Entry, FactRef, PlatformDefinition, Request, ScopeRef, Seed } from "@generalbusiness/dap-contract";
import { canonicalize, definitionDigest, deliveryCauseDigest, intentDigest, isDigest, isPlatformDefinition, isSeed, messageDigest, platformName, scopeIdOf, seedDigest, utf8, verifySignedIntent } from "@generalbusiness/artroom-bytes";
import { isEntryOf, isFactRef, isObject, isScopeRef, same, sentBy, type Fetched } from "@generalbusiness/dap-derive";
import { sourceName as legacySourceName } from "./publishing-provenance.ts";
import { PARTITION_COHORT as COHORT, MAX_GENERATIONS, PARTITION_SPAN } from "./directory-partitions.ts";

/** Producer admission must bound raw bytes before parsing. This pure policy
 * also checks the finite decoded frame set. Runtime/replay wiring is separate. */
export const PARTITION_BASE_PROOF_BOUNDS = {
  facts: 8, entryBytes: PROPOSED_BOUNDS.entryBytes, bytes: 8 * PROPOSED_BOUNDS.entryBytes,
} as const;
/** Same finite decoded chain as the runtime collector, shared by replay. */
export const PARTITION_IDENTITY_BOUNDS = { facts: 16, laneDepth: 4, bytes: 16 * PROPOSED_BOUNDS.entryBytes } as const;
export interface PartitionNativeFrame { fact: FactRef; entry: Entry; named: Digest | PlatformDefinition; declarationName: string; native: boolean }
export interface PartitionCreation { seed: Seed; source: FactRef; n: number; message: Request }
interface Context { root: ScopeRef; partition: ScopeRef; membership: ScopeRef; rules: ScopeRef; destination: ScopeRef }
type Checked<T> = { ok: true; value: T } | { ok: false } | null;
const invalid = { ok: false } as const;
const frame = (facts: readonly Fetched[], fact: FactRef): Fetched | undefined => facts.find(copy => same(copy.fact, fact));
const first = (facts: readonly Fetched[], at: ScopeRef): Fetched | undefined => facts.find(copy => copy.fact.seq === 0 && same(copy.fact.at, at));

function bounded(facts: readonly Fetched[], total = false): boolean {
  const limits = total ? PARTITION_IDENTITY_BOUNDS : PARTITION_BASE_PROOF_BOUNDS;
  if (facts.length > limits.facts) return false;
  let bytes = 0;
  const positions = new Set<string>();
  for (const copy of facts) {
    const position = canonicalize([copy.fact.at, copy.fact.seq]);
    if (positions.has(position)) return false;
    positions.add(position);
    const text = canonicalize(copy.entry);
    if (text.length > PARTITION_BASE_PROOF_BOUNDS.entryBytes) return false;
    const size = utf8(text).length;
    if (size > PARTITION_BASE_PROOF_BOUNDS.entryBytes || (bytes += size) > limits.bytes) return false;
  }
  return true;
}
function genesis(facts: readonly Fetched[], at: ScopeRef, pin: PlatformDefinition): Checked<Fetched> {
  const copy = first(facts, at);
  if (!copy) return null;
  if (!isEntryOf(copy.entry, copy.fact) || copy.entry.prev !== null || copy.entry.input.type !== "genesis") return invalid;
  const born = copy.entry.input;
  if (born.decision !== "applied" || born.kind !== (pin === COHORT.partition ? "establish-partition" : "establish")
    || born.inc !== at.inc || !isSeed(born.seed) || born.seed.kind !== at.kind || born.seed.definition !== pin
    || scopeIdOf(born.seed) !== at.scope) return invalid;
  return { ok: true, value: copy };
}
/** Verify the one known root/partition hop, plus each actual sibling birth.
 * Root's opening is a checked native entry under its checked exact genesis;
 * its copied refs must match all three accepted child incarnations. */
function context(facts: readonly Fetched[], partition: ScopeRef, root: ScopeRef, destination: ScopeRef): Checked<Context> {
  const part = genesis(facts, partition, COHORT.partition);
  if (!part || !part.ok) return part;
  const born = part.value.entry.input;
  if (born.type !== "genesis" || part.value.under !== "platform:directory-partition" || partition.kind !== "directory"
    || !isFactRef(born.source) || born.n === null || !born.message) return invalid;
  const room = rootContext(facts, { seed: born.seed, source: born.source, n: born.n, message: born.message }, root, destination);
  return room?.ok ? { ok: true, value: { ...room.value, partition } } : room;
}
/** The same actual parent-send check is usable before a partition has a
 * genesis. No fabricated accepted child entry is needed for bootstrap. */
function rootContext(facts: readonly Fetched[], partBirth: PartitionCreation, root: ScopeRef, destination: ScopeRef): Checked<Omit<Context, "partition">> {
  const office = genesis(facts, root, COHORT.directory);
  if (!office || !office.ok) return office;
  const rootBirth = office.value.entry.input;
  if (rootBirth.type !== "genesis" || office.value.under !== "platform:directory"
    || root.kind !== "directory" || destination.kind !== "destination"
    || !isSeed(partBirth.seed) || partBirth.seed.kind !== "directory" || partBirth.seed.definition !== COHORT.partition
    || !same(partBirth.seed.creator, root) || rootBirth.seed.creator?.kind !== "register" || !isFactRef(rootBirth.source)
    || !same(rootBirth.source.at, rootBirth.seed.creator) || rootBirth.seed.ordinal !== 0
    || !isFactRef(partBirth.source) || !same(partBirth.source.at, root) || partBirth.seed.ordinal !== 0
    || !Number.isSafeInteger(partBirth.n) || partBirth.n < 0 || partBirth.message.class !== "request"
    || partBirth.message.type !== "create" || !isObject(partBirth.message.body)) return invalid;
  const opening = frame(facts, partBirth.source);
  if (!opening) return null;
  if (opening.under !== "platform:directory" || !isEntryOf(opening.entry, opening.fact)) return invalid;
  const input = opening.entry.input;
  if (input.type === "act") {
    if (input.signed.intent.kind !== "open-partition" || !same(input.signed.intent.to, root) || !verifySignedIntent(input.signed)
      || intentDigest(input.signed.intent) !== partBirth.seed.cause) return invalid;
  } else if (input.type === "delivery") {
    if (input.message.class !== "request" || input.message.type !== "tell" || !isObject(input.message.body) || input.message.body["message"] !== "seal"
      || input.from.at.kind !== "directory" || deliveryCauseDigest({ v: 1, from: input.from, n: input.n, message: messageDigest(input.message) }) !== partBirth.seed.cause) return invalid;
  } else return invalid;
  if (!sentBy(opening.entry, { from: partBirth.source, n: partBirth.n, to: partBirth.seed, message: partBirth.message })) return invalid;
  const body = partBirth.message.body, fields = body["fields"];
  if (!isObject(fields) || !same(body["directory"], root) || !same(fields["root"], root)
    || !isScopeRef(fields["membership"]) || fields["membership"].kind !== "membership"
    || !isScopeRef(fields["rules"]) || fields["rules"].kind !== "rules" || !same(fields["destination"], destination)
    || !same(body["membership"], fields["membership"]) || !Number.isSafeInteger(fields["generation"])
    || (fields["generation"] as number) < 1 || (fields["generation"] as number) > MAX_GENERATIONS
    || fields["base"] !== ((fields["generation"] as number) - 1) * PARTITION_SPAN + 1) return invalid;
  const membership = fields["membership"], rules = fields["rules"];
  for (const [ref, pin, ordinal] of [[membership, COHORT.membership, 0], [rules, COHORT.rules, 1], [destination, COHORT.destination, 2]] as const) {
    const child = genesis(facts, ref, pin);
    if (child === null) return null;
    if (!child.ok) return invalid;
    const birth = child.value.entry.input;
    if (birth.type !== "genesis" || !same(birth.seed.creator, root) || birth.seed.ordinal !== ordinal
      || birth.seed.cause !== seedDigest(rootBirth.seed) || !same(birth.source, office.value.fact) || birth.n === null || !birth.message || birth.message.class !== "request" || birth.message.type !== "create"
      || !sentBy(office.value.entry, { from: office.value.fact, n: birth.n, to: birth.seed, message: birth.message })
      || !isObject(birth.message.body) || !isObject(birth.message.body["fields"]) || !same(birth.message.body["fields"]["directory"], root)) return invalid;
    const childFields = birth.message.body["fields"];
    if (ordinal > 0 && childFields["membership"] !== membership.scope || ordinal === 2 && childFields["rules"] !== rules.scope) return invalid;
  }
  return { ok: true, value: { root, membership, rules, destination } };
}

function origin(from: FactRef, root: ScopeRef, destination: ScopeRef, facts: readonly Fetched[], kind: "application" | "change", total = false): boolean | null {
  try {
    if (!bounded(facts, total)) return null;
    const child = first(facts, from.at);
    if (!child) return null;
    if (!isEntryOf(child.entry, child.fact) || child.entry.prev !== null || child.entry.input.type !== "genesis") return false;
    const born = child.entry.input, seed = born.seed;
    if (from.at.kind !== "lane" || born.decision !== "applied" || born.inc !== from.at.inc || !isSeed(seed) || seed.kind !== "lane"
      || !isDigest(seed.definition) || seed.ordinal !== 0 || scopeIdOf(seed) !== from.at.scope || !isScopeRef(seed.creator) || seed.creator.kind !== "directory"
      || !isFactRef(born.source) || !same(born.source.at, seed.creator) || born.n === null
      || !born.message || born.message.class !== "request" || born.message.type !== "create" || !isObject(born.message.body)) return false;
    if (kind === "change" && born.kind !== "open") return false;
    return directPublicationCreation({ seed, source: born.source, n: born.n, message: born.message }, root, destination, facts, kind);
  } catch { return false; }
}
function directPublicationCreation(born: PartitionCreation, root: ScopeRef, destination: ScopeRef, facts: readonly Fetched[], kind: "application" | "change"): boolean | null {
    const seed = born.seed;
    if (!isSeed(seed) || seed.kind !== "lane" || !isDigest(seed.definition) || seed.ordinal !== 0 || !isScopeRef(seed.creator) || seed.creator.kind !== "directory"
      || !isFactRef(born.source) || !same(born.source.at, seed.creator) || !Number.isSafeInteger(born.n) || born.n < 0
      || born.message.class !== "request" || born.message.type !== "create" || !isObject(born.message.body)) return false;
    const creator = frame(facts, born.source);
    if (!creator) return null;
    if (creator.under !== "platform:directory-partition" || !isEntryOf(creator.entry, creator.fact) || creator.entry.input.type !== "act") return false;
    const made = creator.entry.input.signed;
    if (made.intent.kind !== (kind === "application" ? "establish-application" : "open-pr") || !same(made.intent.to, seed.creator)
      || !verifySignedIntent(made) || made.intent.fields["definition"] !== seed.definition || intentDigest(made.intent) !== seed.cause
      || !sentBy(creator.entry, { from: born.source, n: born.n, to: seed, message: born.message })) return false;
    const room = context(facts, seed.creator, root, destination);
    if (room === null) return null;
    if (!room.ok) return false;
    const body = born.message.body, fields = body["fields"];
    if (!isObject(fields) || !same(body["directory"], seed.creator) || !same(body["membership"], room.value.membership)) return false;
    if (kind === "application") return same(body["creationContext"], { v: 1 }) && (!("destination" in fields) || same(fields["destination"], destination));
    return same(fields["destination"], destination) && same(fields["rules"], room.value.rules);
}
/** Not installed on any consumer until its receiver policy is selected. */
export const partitionApplicationPublicationOrigin = (from: FactRef, root: ScopeRef, destination: ScopeRef, facts: readonly Fetched[]): boolean | null => origin(from, root, destination, facts, "application");
export const partitionPublishingLaneOrigin = (from: FactRef, root: ScopeRef, destination: ScopeRef, facts: readonly Fetched[]): boolean | null => origin(from, root, destination, facts, "change");

/** These raw metadata frames come from authenticated native birth readers or
 * replay's checked runs. This validates their cross-frame binding; it does
 * not turn arbitrary hash-valid caller data into native execution proof. */
function rawFacts(frames: readonly PartitionNativeFrame[]): readonly Fetched[] | null {
  if (!Array.isArray(frames) || frames.length > PARTITION_IDENTITY_BOUNDS.facts) return null;
  const facts: Fetched[] = frames.map(copy => ({ fact: copy.fact, entry: copy.entry, under: copy.native && isPlatformDefinition(copy.named) ? platformName(copy.named) : copy.declarationName }));
  if (!bounded(facts, true)) return null;
  for (const copy of frames) {
    if (!isEntryOf(copy.entry, copy.fact) || copy.native !== isPlatformDefinition(copy.named)) return null;
    const birth = frames.find(row => row.fact.seq === 0 && same(row.fact.at, copy.fact.at));
    if (!birth || birth.named !== copy.named || birth.native !== copy.native || birth.declarationName !== copy.declarationName
      || birth.entry.input.type !== "genesis" || birth.entry.input.seed.definition !== copy.named) return null;
    if (frames.some(row => row.named === copy.named && (row.native !== copy.native || row.declarationName !== copy.declarationName))) return null;
  }
  return facts;
}
function nativeLane(named: Digest, name: "change" | "issue", at: ScopeRef, facts: readonly Fetched[], depth: number, seen: Set<string>): Checked<Context> {
  const key = canonicalize(at);
  if (depth > PARTITION_IDENTITY_BOUNDS.laneDepth) return null;
  if (seen.has(key)) return invalid;
  seen.add(key);
  const child = first(facts, at);
  if (!child) return null;
  if (!isEntryOf(child.entry, child.fact) || child.entry.prev !== null || child.entry.input.type !== "genesis") return invalid;
  const born = child.entry.input, seed = born.seed;
  if (at.kind !== "lane" || born.kind !== (name === "change" ? "open" : "file") || born.decision !== "applied" || born.inc !== at.inc
    || !isSeed(seed) || seed.kind !== "lane" || seed.definition !== named || seed.ordinal !== 0 || scopeIdOf(seed) !== at.scope
    || !isScopeRef(seed.creator) || !isFactRef(born.source) || !same(seed.creator, born.source.at) || born.n !== 0
    || !born.message || born.message.class !== "request" || born.message.type !== "create" || !isObject(born.message.body) || !isObject(born.message.body["fields"])) return invalid;
  return laneCreation(named, name, { seed, source: born.source, n: born.n, message: born.message }, facts, depth, seen);
}
function laneCreation(named: Digest, name: "change" | "issue", born: PartitionCreation, facts: readonly Fetched[], depth: number, seen: Set<string>): Checked<Context> {
  const seed = born.seed;
  if (depth > PARTITION_IDENTITY_BOUNDS.laneDepth) return null;
  if (!isSeed(seed) || seed.kind !== "lane" || seed.definition !== named || seed.ordinal !== 0
    || !isScopeRef(seed.creator) || !isFactRef(born.source) || !same(seed.creator, born.source.at) || born.n !== 0
    || born.message.class !== "request" || born.message.type !== "create" || !isObject(born.message.body)) return invalid;
  const creator = frame(facts, born.source);
  if (!creator) return null;
  if (!isEntryOf(creator.entry, creator.fact) || creator.entry.input.type !== "act") return invalid;
  const made = creator.entry.input.signed, body = born.message.body, fields = body["fields"];
  if (!isObject(fields)) return invalid;
  const concern = name === "issue" && seed.creator.kind === "lane";
  if (made.intent.kind !== (concern ? "add-concern" : name === "change" ? "open-pr" : "open-issue")
    || !same(made.intent.to, seed.creator) || !verifySignedIntent(made) || intentDigest(made.intent) !== seed.cause
    || !concern && made.intent.fields["definition"] !== named
    || !sentBy(creator.entry, { from: born.source, n: born.n, to: seed, message: born.message })) return invalid;
  if (concern) {
    const parent = first(facts, seed.creator);
    if (!parent) return null;
    const room = nativeLane(named, "issue", seed.creator, facts, depth + 1, seen);
    if (!room || !room.ok) return room;
    const origin = fields["origin"];
    if (parent.entry.input.type !== "genesis" || !parent.entry.input.message || !isObject(parent.entry.input.message.body)
      || !same(body["directory"], room.value.partition) || !same(body["membership"], room.value.membership)
      || !same(parent.entry.input.message.body["directory"], body["directory"])
      || !same(parent.entry.input.message.body["membership"], body["membership"])
      || !(isObject(origin) && Object.keys(origin).length === 1 && origin["self"] === true) && !same(origin, born.source)) return invalid;
    return room;
  }
  const part = first(facts, seed.creator);
  if (!part) return null;
  if (seed.creator.kind !== "directory" || creator.under !== "platform:directory-partition" || part.entry.input.type !== "genesis"
    || !part.entry.input.message || !isObject(part.entry.input.message.body) || !isObject(part.entry.input.message.body["fields"])) return invalid;
  const contextFields = part.entry.input.message.body["fields"];
  if (!isScopeRef(contextFields["root"]) || !isScopeRef(contextFields["destination"])) return invalid;
  const room = context(facts, seed.creator, contextFields["root"], contextFields["destination"]);
  if (!room || !room.ok) return room;
  if (!same(body["directory"], room.value.partition) || !same(body["membership"], room.value.membership)
    || name === "change" && (!same(fields["destination"], room.value.destination) || !same(fields["rules"], room.value.rules))) return invalid;
  return room;
}

/** A receiver must independently establish its eligible partition-v1 lineage
 * before calling this policy. No global producer identity is changed. Null
 * means missing/exhausted evidence; an invalid candidate stays declared. */
export function partitionSourceName(named: Digest, declaredName: string, at: ScopeRef, frames: readonly PartitionNativeFrame[]): string | null {
  if (declaredName !== "change" && declaredName !== "issue") return declaredName.startsWith("platform:") ? `declared:${declaredName}` : declaredName;
  try {
    const facts = rawFacts(frames);
    if (!facts) return null;
    const own = frames.find(copy => copy.fact.seq === 0 && same(copy.fact.at, at));
    if (!own) return null;
    if (own.native || own.named !== named || own.declarationName !== declaredName) return `declared:${declaredName}`;
    const result = nativeLane(named, declaredName, at, facts, 1, new Set());
    return result === null ? null : result.ok ? declaredName : `declared:${declaredName}`;
  } catch { return `declared:${declaredName}`; }
}

export interface PartitionReceiverLineage {
  at: ScopeRef;
  birth: FactRef;
  named: Digest | PlatformDefinition;
  root: ScopeRef;
}
export type PartitionReceiverPolicy = { mode: "legacy" } | { mode: "partition-v1"; lineage: PartitionReceiverLineage };
function rootSiblingCreation(creation: PartitionCreation, ordinal: number, facts: readonly Fetched[], root: Fetched): boolean {
  const checked = genesis(facts, root.fact.at, COHORT.directory), born = root.entry.input;
  return checked?.ok === true && born.type === "genesis" && same(creation.seed.creator, root.fact.at) && creation.seed.ordinal === ordinal
    && creation.seed.cause === seedDigest(born.seed) && same(creation.source, root.fact)
    && Number.isSafeInteger(creation.n) && creation.n >= 0 && creation.message.class === "request" && creation.message.type === "create"
    && isObject(creation.message.body) && isObject(creation.message.body["fields"])
    && same(creation.message.body["fields"]["directory"], root.fact.at)
    && sentBy(root.entry, { from: creation.source, n: creation.n, to: creation.seed, message: creation.message });
}
/** Receiver eligibility is separate from a sender's role. Inputs are raw
 * authenticated native metadata or replay's normally checked runs. A locator
 * in the creation message supplies no positive eligibility on its own. */
export function partitionReceiverPolicy(at: ScopeRef, frames: readonly PartitionNativeFrame[]): PartitionReceiverPolicy | null {
  try {
    const facts = rawFacts(frames), own = frames.find(copy => copy.fact.seq === 0 && same(copy.fact.at, at));
    if (!facts || !own || own.entry.input.type !== "genesis") return null;
    const born = own.entry.input;
    if (born.decision !== "applied" || born.inc !== at.inc || scopeIdOf(born.seed) !== at.scope) return null;
    const selected = (root: ScopeRef): PartitionReceiverPolicy => ({ mode: "partition-v1", lineage: { at, birth: own.fact, named: own.named, root } });
    const legacy = { mode: "legacy" } as const;
    if (own.native) {
      if (own.named === COHORT.directory) return genesis(facts, at, COHORT.directory)?.ok === true ? selected(at) : null;
      if (own.named === COHORT.partition) {
        const fields = isObject(born.message?.body) ? born.message.body["fields"] : null;
        if (!isObject(fields) || !isScopeRef(fields["root"]) || !isScopeRef(fields["destination"])) return null;
        const room = context(facts, at, fields["root"], fields["destination"]);
        return room === null ? null : room.ok ? selected(room.value.root) : null;
      }
      const ordinal = own.named === COHORT.membership ? 0 : own.named === COHORT.rules ? 1 : own.named === COHORT.destination ? 2 : null;
      if (ordinal !== null) {
        if (!isScopeRef(born.seed.creator)) return legacy;
        const root = frames.find(copy => copy.fact.seq === 0 && same(copy.fact.at, born.seed.creator));
        if (!root) return null;
        if (!root.native || root.named !== COHORT.directory) return legacy;
        if (!isFactRef(born.source) || born.n === null || !born.message
          || !rootSiblingCreation({ seed: born.seed, source: born.source, n: born.n, message: born.message }, ordinal, facts, frame(facts, root.fact)!)) return null;
        return selected(root.fact.at);
      }
      if (own.named === COHORT.inbox) {
        if (!isFactRef(born.source) || !isScopeRef(born.seed.creator) || !same(born.source.at, born.seed.creator)) return legacy;
        const parent = frames.find(copy => copy.fact.seq === 0 && same(copy.fact.at, born.seed.creator));
        if (!parent) return null;
        if (!parent.native || parent.named !== COHORT.membership) return legacy;
        const policy = partitionReceiverPolicy(parent.fact.at, frames);
        if (!policy || policy.mode === "legacy") return policy;
        const creating = frame(facts, born.source);
        if (!creating || born.n === null || !born.message || !isObject(born.message.body) || !isObject(born.message.body["fields"])
          || !same(born.message.body["membership"], parent.fact.at)
          || "directory" in born.message.body && !same(born.message.body["directory"], policy.lineage.root)
          || !same(born.message.body["fields"]["membership"], parent.fact.at)
          || !sentBy(creating.entry, { from: born.source, n: born.n, to: born.seed, message: born.message })) return null;
        return selected(policy.lineage.root);
      }
      return legacy;
    }
    const directory = isObject(born.message?.body) ? born.message.body["directory"] : null;
    if (!isScopeRef(directory)) return legacy;
    const part = frames.find(copy => copy.fact.seq === 0 && same(copy.fact.at, directory));
    if (!part) return null;
    // Refusing an upgrade leaves the existing policy. Only the complete
    // verified native partition/parent chain can choose partition-v1.
    if (!part.native || part.named !== COHORT.partition) return legacy;
    if (!isDigest(own.named)) return null;
    const fields = part.entry.input.type === "genesis" && isObject(part.entry.input.message?.body) ? part.entry.input.message.body["fields"] : null;
    if (!isObject(fields) || !isScopeRef(fields["root"]) || !isScopeRef(fields["destination"])) return null;
    const creating = isFactRef(born.source) ? frame(facts, born.source) : undefined;
    if (creating?.entry.input.type === "act" && creating.entry.input.signed.intent.kind === "establish-application") {
      return origin(own.fact, fields["root"], fields["destination"], facts, "application") === true ? selected(fields["root"]) : null;
    }
    if (own.declarationName === "issue" || own.declarationName === "change") {
      const room = nativeLane(own.named, own.declarationName, at, facts, 1, new Set());
      return room?.ok ? selected(room.value.root) : null;
    }
    return null;
  } catch { return null; }
}

/** Transient bootstrap binding, before any receiver incarnation or accepted
 * genesis exists. Only the exact authenticated parent create selects it. */
export interface PartitionCreationPolicy {
  mode: "partition-v1";
  /** The newborn Root has no incarnation yet. Its binding is the seed. */
  root: ScopeRef | null;
  creation: PartitionCreation;
}
export function partitionCreationPolicy(creation: PartitionCreation, frames: readonly PartitionNativeFrame[]): PartitionCreationPolicy | null {
  try {
    const facts = rawFacts(frames), fields = isObject(creation.message.body) ? creation.message.body["fields"] : null;
    if (!facts || !isObject(fields) || !isScopeRef(fields["root"]) || !isScopeRef(fields["destination"])) return null;
    const room = rootContext(facts, creation, fields["root"], fields["destination"]);
    return room?.ok ? { mode: "partition-v1", root: room.value.root, creation } : null;
  } catch { return null; }
}

/** The caller supplies the receiver's own declaration bytes, as checked by
 * normal genesis admission. Hash binding prevents a requested role name
 * from selecting the policy for another definition. */
export function partitionDeclaredCreationPolicy(creation: PartitionCreation, definition: DeclaredDefinition, frames: readonly PartitionNativeFrame[]): PartitionCreationPolicy | null {
  try {
    if (!isDigest(creation.seed.definition) || definitionDigest(definition) !== creation.seed.definition) return null;
    const facts = rawFacts(frames);
    if (!facts) return null;
    const creating = frame(facts, creation.source);
    if (creating?.entry.input.type !== "act") return null;
    let room: Checked<Context>;
    if (creating.entry.input.signed.intent.kind === "establish-application") {
      const part = isScopeRef(creation.seed.creator) ? first(facts, creation.seed.creator) : null;
      const fields = part?.entry.input.type === "genesis" && isObject(part.entry.input.message?.body) ? part.entry.input.message.body["fields"] : null;
      if (!isObject(fields) || !isScopeRef(fields["root"]) || !isScopeRef(fields["destination"])
        || directPublicationCreation(creation, fields["root"], fields["destination"], facts, "application") !== true) return null;
      return { mode: "partition-v1", root: fields["root"], creation };
    }
    if (definition.name !== "issue" && definition.name !== "change" || definition.genesis !== (definition.name === "issue" ? "file" : "open")) return null;
    room = laneCreation(creation.seed.definition, definition.name, creation, facts, 1, new Set());
    return room?.ok ? { mode: "partition-v1", root: room.value.root, creation } : null;
  } catch { return null; }
}


export type PartitionCreationSelection = { mode: "legacy" } | PartitionCreationPolicy;
/** Native bootstrap uses the actual parent code pin and exact create. Root's
 * own incarnation does not exist yet; no caller-supplied root can replace it.
 * Normal genesis still proves cause, target address and every domain field. */
export function partitionNativeCreationPolicy(creation: PartitionCreation, frames: readonly PartitionNativeFrame[]): PartitionCreationSelection | null {
  try {
    const facts = rawFacts(frames), seed = creation.seed;
    if (!facts || !isSeed(seed) || !isPlatformDefinition(seed.definition) || !isScopeRef(seed.creator)
      || !isFactRef(creation.source) || !same(creation.source.at, seed.creator) || !Number.isSafeInteger(creation.n) || creation.n < 0
      || creation.message.class !== "request" || creation.message.type !== "create") return null;
    if (seed.definition === COHORT.partition) return partitionCreationPolicy(creation, frames);
    const source = frames.find(copy => same(copy.fact, creation.source));
    if (!source || !sentBy(source.entry, { from: creation.source, n: creation.n, to: seed, message: creation.message })) return null;
    const selected = (root: ScopeRef | null): PartitionCreationPolicy => ({ mode: "partition-v1", root, creation });
    const legacy = { mode: "legacy" } as const;
    if (seed.definition === COHORT.directory) {
      return seed.kind === "directory" && seed.ordinal === 0 && source.native && source.named === COHORT.register && source.fact.at.kind === "register" ? selected(null) : null;
    }
    const ordinal = seed.definition === COHORT.membership ? 0 : seed.definition === COHORT.rules ? 1 : seed.definition === COHORT.destination ? 2 : null;
    if (ordinal !== null) {
      if (!source.native || source.named !== COHORT.directory) return seed.definition === COHORT.destination ? null : legacy;
      return rootSiblingCreation(creation, ordinal, facts, frame(facts, source.fact)!) ? selected(source.fact.at) : null;
    }
    if (seed.definition === COHORT.inbox) {
      const parent = frames.find(copy => copy.fact.seq === 0 && same(copy.fact.at, seed.creator));
      if (!parent) return null;
      if (!parent.native || parent.named !== COHORT.membership) return legacy;
      const policy = partitionReceiverPolicy(parent.fact.at, frames);
      if (!policy || policy.mode === "legacy") return policy;
      const body = creation.message.body;
      return seed.kind === "inbox" && isObject(body) && isObject(body["fields"])
        && same(body["membership"], parent.fact.at) && same(body["fields"]["membership"], parent.fact.at)
        && (!("directory" in body) || same(body["directory"], policy.lineage.root)) ? selected(policy.lineage.root) : null;
    }
    return legacy;
  } catch { return null; }
}


/** Extended receiver policy over raw authenticated metadata, with the same
 * total decoded-frame limit as receiver selection and foreign fact reads. */
export function partitionPublicationOrigin(from: FactRef, root: ScopeRef, destination: ScopeRef, kind: "application" | "change", frames: readonly PartitionNativeFrame[]): boolean | null {
  try {
    const facts = rawFacts(frames);
    return facts ? origin(from, root, destination, facts, kind, true) : null;
  } catch { return false; }
}


/** Reconstruct the unchanged producer policy from this bounded raw operation.
 * The default Source API is untouched. No retained under label enters the
 * recursive concern check, and no receiver mode selects a producer identity. */
export function partitionProducerName(at: ScopeRef, frames: readonly PartitionNativeFrame[]): string | null {
  try {
    const facts = rawFacts(frames);
    if (!facts) return null;
    const seen = new Set<string>();
    const name = (scope: ScopeRef, depth: number): string | null => {
      const own = frames.find(copy => copy.fact.seq === 0 && same(copy.fact.at, scope));
      if (!own || own.entry.input.type !== "genesis") return null;
      const direct = legacySourceName(own.named, own.declarationName);
      if (direct !== null) return direct;
      const key = canonicalize(scope);
      if (depth > PARTITION_IDENTITY_BOUNDS.laneDepth || seen.has(key)) return null;
      seen.add(key);
      const origin: Fetched[] = [{ fact: own.fact, entry: own.entry, under: own.declarationName }];
      const from = own.entry.input.source;
      if (from) {
        const creating = frame(facts, from);
        if (!creating) return null;
        const parentName = name(from.at, depth + 1);
        if (parentName === null) return null;
        origin.push({ ...creating, under: parentName });
        if (parentName === "issue") {
          const parent = first(facts, from.at);
          if (!parent) return null;
          origin.push({ ...parent, under: parentName });
        }
      }
      return legacySourceName(own.named, own.declarationName, origin);
    };
    return name(at, 1);
  } catch { return null; }
}
