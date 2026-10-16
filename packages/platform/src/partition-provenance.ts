/** Direct partition births only. These policies require authenticated native
 * Source frames or normally checked replay runs. Hash-valid arbitrary entries
 * are not proof of native execution. Old destination policies remain separate. */
import { PROPOSED_BOUNDS } from "@generalbusiness/dap-contract";
import type { FactRef, PlatformDefinition, ScopeRef } from "@generalbusiness/dap-contract";
import { canonicalize, deliveryCauseDigest, intentDigest, isDigest, isSeed, messageDigest, scopeIdOf, utf8, verifySignedIntent } from "@generalbusiness/artroom-bytes";
import { isEntryOf, isFactRef, isObject, isScopeRef, same, sentBy, type Fetched } from "@generalbusiness/dap-derive";
import { PARTITION_COHORT as COHORT, MAX_GENERATIONS, PARTITION_SPAN } from "./directory-partitions.ts";

/** Producer admission must bound raw bytes before parsing. This pure policy
 * also checks the finite decoded frame set. Runtime/replay wiring is separate. */
export const PARTITION_BASE_PROOF_BOUNDS = {
  facts: 8, entryBytes: PROPOSED_BOUNDS.entryBytes, bytes: 8 * PROPOSED_BOUNDS.entryBytes,
  rpcCalls: 6, sourceDepth: 3,
} as const;
interface Context { root: ScopeRef; partition: ScopeRef; membership: ScopeRef; rules: ScopeRef; destination: ScopeRef }
type Checked<T> = { ok: true; value: T } | { ok: false } | null;
const invalid = { ok: false } as const;
const frame = (facts: readonly Fetched[], fact: FactRef): Fetched | undefined => facts.find(copy => same(copy.fact, fact));
const first = (facts: readonly Fetched[], at: ScopeRef): Fetched | undefined => facts.find(copy => copy.fact.seq === 0 && same(copy.fact.at, at));

function bounded(facts: readonly Fetched[]): boolean {
  if (facts.length > PARTITION_BASE_PROOF_BOUNDS.facts) return false;
  let bytes = 0;
  for (const copy of facts) {
    const text = canonicalize(copy.entry);
    if (text.length > PARTITION_BASE_PROOF_BOUNDS.entryBytes) return false;
    const size = utf8(text).length;
    if (size > PARTITION_BASE_PROOF_BOUNDS.entryBytes || (bytes += size) > PARTITION_BASE_PROOF_BOUNDS.bytes) return false;
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
    || partBirth.n === null || !partBirth.message || partBirth.message.class !== "request" || partBirth.message.type !== "create" || !isObject(partBirth.message.body)) return invalid;
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
      || !same(birth.source, office.value.fact) || birth.n === null || !birth.message || birth.message.class !== "request" || birth.message.type !== "create"
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
