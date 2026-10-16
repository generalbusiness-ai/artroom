/** Direct partition births only. These policies require authenticated native
 * Source frames or normally checked replay runs. Hash-valid arbitrary entries
 * are not proof of native execution. Old destination policies remain separate. */
import { PROPOSED_BOUNDS } from "@generalbusiness/dap-contract";
import type { Digest, Entry, FactRef, PlatformDefinition, ScopeRef } from "@generalbusiness/dap-contract";
import { canonicalize, deliveryCauseDigest, intentDigest, isDigest, isPlatformDefinition, isSeed, messageDigest, platformName, scopeIdOf, seedDigest, utf8, verifySignedIntent } from "@generalbusiness/artroom-bytes";
import { isEntryOf, isFactRef, isObject, isScopeRef, same, sentBy, type Fetched } from "@generalbusiness/dap-derive";
import { PARTITION_COHORT as COHORT, MAX_GENERATIONS, PARTITION_SPAN } from "./directory-partitions.ts";

/** Producer admission must bound raw bytes before parsing. This pure policy
 * also checks the finite decoded frame set. Runtime/replay wiring is separate. */
export const PARTITION_BASE_PROOF_BOUNDS = {
  facts: 8, entryBytes: PROPOSED_BOUNDS.entryBytes, bytes: 8 * PROPOSED_BOUNDS.entryBytes,
} as const;
/** Same finite decoded chain as the runtime collector, shared by replay. */
export const PARTITION_IDENTITY_BOUNDS = { facts: 16, laneDepth: 4, bytes: 16 * PROPOSED_BOUNDS.entryBytes } as const;
export interface PartitionNativeFrame { fact: FactRef; entry: Entry; named: Digest | PlatformDefinition; declarationName: string; native: boolean }
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
  const part = genesis(facts, partition, COHORT.partition), office = genesis(facts, root, COHORT.directory);
  if (part === null || office === null) return null;
  if (!part.ok || !office.ok) return invalid;
  const partBirth = part.value.entry.input, rootBirth = office.value.entry.input;
  if (partBirth.type !== "genesis" || rootBirth.type !== "genesis" || part.value.under !== "platform:directory-partition" || office.value.under !== "platform:directory"
    || partition.kind !== "directory" || root.kind !== "directory" || destination.kind !== "destination"
    || !same(partBirth.seed.creator, root) || rootBirth.seed.creator?.kind !== "register" || !isFactRef(rootBirth.source)
    || !same(rootBirth.source.at, rootBirth.seed.creator) || rootBirth.seed.ordinal !== 0
    || !isFactRef(partBirth.source) || !same(partBirth.source.at, root) || partBirth.seed.ordinal !== 0
    || partBirth.n !== 0 || !partBirth.message || partBirth.message.class !== "request" || partBirth.message.type !== "create" || !isObject(partBirth.message.body)) return invalid;
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
      || birth.seed.cause !== seedDigest(rootBirth.seed) || !same(birth.source, office.value.fact) || birth.n !== ordinal || !birth.message || birth.message.class !== "request" || birth.message.type !== "create"
      || !sentBy(office.value.entry, { from: office.value.fact, n: birth.n, to: birth.seed, message: birth.message })
      || !isObject(birth.message.body) || !isObject(birth.message.body["fields"]) || !same(birth.message.body["fields"]["directory"], root)) return invalid;
    const childFields = birth.message.body["fields"];
    if (ordinal > 0 && childFields["membership"] !== membership.scope || ordinal === 2 && childFields["rules"] !== rules.scope) return invalid;
  }
  return { ok: true, value: { root, partition, membership, rules, destination } };
}

function origin(from: FactRef, root: ScopeRef, destination: ScopeRef, facts: readonly Fetched[], kind: "application" | "change"): boolean | null {
  try {
    if (!bounded(facts)) return null;
    const child = first(facts, from.at);
    if (!child) return null;
    if (!isEntryOf(child.entry, child.fact) || child.entry.prev !== null || child.entry.input.type !== "genesis") return false;
    const born = child.entry.input, seed = born.seed;
    if (from.at.kind !== "lane" || born.decision !== "applied" || born.inc !== from.at.inc || !isSeed(seed) || seed.kind !== "lane"
      || !isDigest(seed.definition) || seed.ordinal !== 0 || scopeIdOf(seed) !== from.at.scope || !isScopeRef(seed.creator) || seed.creator.kind !== "directory"
      || !isFactRef(born.source) || !same(born.source.at, seed.creator) || born.n === null
      || !born.message || born.message.class !== "request" || born.message.type !== "create" || !isObject(born.message.body)) return false;
    const creator = frame(facts, born.source);
    if (!creator) return null;
    if (creator.under !== "platform:directory-partition" || !isEntryOf(creator.entry, creator.fact) || creator.entry.input.type !== "act") return false;
    const made = creator.entry.input.signed;
    if (made.intent.kind !== (kind === "application" ? "establish-application" : "open-pr") || !same(made.intent.to, seed.creator)
      || !verifySignedIntent(made) || made.intent.fields["definition"] !== seed.definition || intentDigest(made.intent) !== seed.cause
      || kind === "change" && born.kind !== "open"
      || !sentBy(creator.entry, { from: born.source, n: born.n, to: seed, message: born.message })) return false;
    const room = context(facts, seed.creator, root, destination);
    if (room === null) return null;
    if (!room.ok) return false;
    const body = born.message.body, fields = body["fields"];
    if (!isObject(fields) || !same(body["directory"], seed.creator) || !same(body["membership"], room.value.membership)) return false;
    if (kind === "application") return same(body["creationContext"], { v: 1 }) && (!("destination" in fields) || same(fields["destination"], destination));
    return same(fields["destination"], destination) && same(fields["rules"], room.value.rules);
  } catch { return false; }
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
