/** Native identities are established by immutable creation facts, not declared names. */
import type { Digest, FactRef, PlatformDefinition, ScopeRef } from "@generalbusiness/dap-contract";
import { canonicalize, intentDigest, isDigest, isPlatformDefinition, isSeed, platformName, scopeIdOf, verifySignedIntent } from "@generalbusiness/artroom-bytes";
import { isEntryOf, isFactRef, isObject, isScopeRef, sentBy, type Fetched } from "@generalbusiness/dap-derive";

export const PUBLISHING_LANE_DIGESTS = [
  "sha256:3f0389ba644e6d58e96a352debcc77d01661ffcf349c6db53d0645c2513eae70",
  "sha256:d86c64ae0a570165660a6eb4d75153b8c2f59c9cdaec2ecc789e2c38524a17a2",
  "sha256:85cec888905722a8dd051b3eb3388a1b674d82500f1df80044b298d12a285930",
  "sha256:4945948396a0417aabc5bc66520036d39d179d131aaade1428da55ee96ed7b77",
] as const satisfies readonly Digest[];
export const ISSUE_LANE_DIGESTS = [
  "sha256:325cb4f33da9deb1a31d85ba0f1456068d4d9d08009978b779aed70cb08e00ad",
  "sha256:82a938c8f54ddcac7974ca688ebea7d51c35d2aa70f4e3729965e9f915bc464e",
] as const satisfies readonly Digest[];

const same = (a: unknown, b: unknown): boolean => canonicalize(a) === canonicalize(b);

/** Null means missing proof. False means positively non-native or invalid proof. */
function nativeOrigin(named: Digest, name: "change" | "issue", facts: readonly Fetched[], at?: ScopeRef): boolean | null {
  const genesis = facts.find(copy => copy.fact.seq === 0 && (!at || same(copy.fact.at, at)));
  if (!genesis) return null;
  if (!isEntryOf(genesis.entry, genesis.fact) || genesis.entry.input.type !== "genesis") return false;
  const born = genesis.entry.input, seed = born.seed;
  if (born.source === null || seed.creator === null) return false;
  if (!isFactRef(born.source)) return false;
  const creator = facts.find(copy => same(copy.fact, born.source));
  if (!creator) return null;
  if (!isEntryOf(creator.entry, creator.fact) || creator.entry.input.type !== "act" || creator.under !== "platform:directory") return false;
  const made = creator.entry.input;
  const route = name === "change" ? "open-pr" : "open-issue";
  if (born.decision !== "applied" || born.kind !== (name === "change" ? "open" : "file") || !isSeed(seed) || seed.kind !== "lane" || seed.ordinal !== 0
    || seed.definition !== named || genesis.fact.at.kind !== "lane" || born.inc !== genesis.fact.at.inc
    || !same(genesis.entry.at, genesis.fact.at) || scopeIdOf(seed) !== genesis.fact.at.scope
    || !isScopeRef(seed.creator) || seed.creator.kind !== "directory"
    || !same(seed.creator, born.source.at) || made.signed.intent.kind !== route
    || !same(made.signed.intent.to, seed.creator) || !verifySignedIntent(made.signed)
    || made.signed.intent.fields["definition"] !== named || intentDigest(made.signed.intent) !== seed.cause
    || born.n === null || born.message === null || born.message.class !== "request" || born.message.type !== "create") return false;
  const body = born.message.body;
  if (!isObject(body) || !same(body["directory"], seed.creator) || !isObject(body["fields"])) return false;
  const fields = body["fields"];
  if (name === "change" && (!isScopeRef(fields["destination"]) || fields["destination"].kind !== "destination")) return false;
  return sentBy(creator.entry, { from: born.source, n: born.n, to: seed, message: born.message });
}

/** A supported reserved name also requires its native factory's actual creation facts. */
export function sourceName(named: Digest | PlatformDefinition, declaredName: string, origin?: readonly Fetched[]): string | null {
  if (isPlatformDefinition(named)) return platformName(named);
  if (declaredName.startsWith("platform:")) return `declared:${declaredName}`;
  if (declaredName !== "change" && declaredName !== "issue") return declaredName;
  const supported = declaredName === "change" ? PUBLISHING_LANE_DIGESTS.some(digest => digest === named) : ISSUE_LANE_DIGESTS.some(digest => digest === named);
  if (!supported) return `declared:${declaredName}`;
  try {
    const native = nativeOrigin(named, declaredName, origin ?? []);
    return native === null ? null : native ? declaredName : `declared:${declaredName}`;
  } catch { return `declared:${declaredName}`; }
}

/** The additional destination admission boundary requires this room and destination. */
export function publishingLaneOrigin(from: FactRef, directory: ScopeRef, destination: ScopeRef, facts: readonly Fetched[]): boolean {
  try {
    const genesis = facts.find(copy => copy.fact.seq === 0 && same(copy.fact.at, from.at));
    if (!genesis || genesis.entry.input.type !== "genesis") return false;
    const born = genesis.entry.input;
    if (!isDigest(born.seed.definition) || !PUBLISHING_LANE_DIGESTS.some(digest => digest === born.seed.definition)
      || nativeOrigin(born.seed.definition, "change", facts, from.at) !== true
      || !same(born.seed.creator, directory) || directory.kind !== "directory" || destination.kind !== "destination"
      || !born.message || !isObject(born.message.body) || !isObject(born.message.body["fields"])) return false;
    return same(born.message.body["fields"]["destination"], destination);
  } catch { return false; }
}
