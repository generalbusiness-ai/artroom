/**
 * Checks that every Git host wiring shares: which register and which
 * destination may use a host's authority, and the adapter's local credential
 * handle. They read the scope's own history only. No configuration, key,
 * token or plaintext is read or written here.
 */
import type { Entry, FieldValue, ScopeId } from "@generalbusiness/artroom-contract";
import { canonicalize, entryHash, isDigest, isFactRef, isOperationId, parseStrict } from "@generalbusiness/artroom-bytes";
import { isEntryOf, valueDigest } from "@generalbusiness/artroom-derive";
import { DESTINATION, DESTINATION_KINDS, REGISTER, destinationBranch, destinationWrite, directoryIdOf } from "@generalbusiness/artroom-platform";
import type { DestinationBinding, DestinationRepository } from "./destination-host.ts";
import type { OutsideGiven } from "./object.ts";

export const same = (a: unknown, b: unknown): boolean => canonicalize(a) === canonicalize(b);
export function exact(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)) ? value as Record<string, unknown> : null;
}

/** The creator is the actual directory derived by this verified register claim,
 * not an independently founded directory that merely cites the same claim. */
export function destinationBirth(given: OutsideGiven, registerScope: ScopeId): boolean {
  try {
    const genesis = given.own(0)?.entry;
    const branch = destinationBranch(given.state);
    const claim = branch?.refs["claim"];
    if (genesis?.input.type !== "genesis" || genesis.input.seed.creator?.kind !== "directory" || !same(branch?.refs["directory"], genesis.input.seed.creator) || !isFactRef(claim) || claim.at.kind !== "register" || claim.at.scope !== registerScope) return false;
    const use = genesis.uses.find((use) => same(use.fact, claim));
    const retained = use ? given.retained("entry", use.content) : null;
    if (!retained) return false;
    const opening = parseStrict(retained.bytes) as unknown as Entry;
    if (!isEntryOf(opening, claim) || opening.input.type !== "act" || opening.input.signed.intent.kind !== "found") return false;
    const seeds = opening.effects.filter((effect) => effect.effect === "value" && effect.item === claim.seq && effect.slot === "seed");
    const seed = seeds.length === 1 && seeds[0]?.effect === "value" ? seeds[0].value : null;
    return isDigest(seed) && directoryIdOf(seed) === genesis.input.seed.creator.scope;
  } catch { return false; }
}

/**
 * Whether this object may use one host's authority for an owner: the pinned
 * register, when its recorded host and namespace are this host's; or a
 * destination born of that register's claim, whose recorded repository is
 * at this host and namespace.
 */
export function hostBound(given: OutsideGiven, registerScope: ScopeId, host: string, namespace: string): (owner: string) => boolean {
  return (owner) => {
    const scope = given.scope();
    const genesis = given.genesis();
    if (owner === REGISTER && scope?.at.kind === "register" && scope.at.scope === registerScope && genesis?.seed.definition === REGISTER) {
      const item = given.state.page("register", ["open"], null, 1).items[0];
      return item?.values["host"] === host && item.values["namespace"] === namespace;
    }
    if (owner === DESTINATION && scope?.at.kind === "destination" && genesis?.seed.definition === DESTINATION) {
      const repository = destinationBranch(given.state)?.values["repository"] as Record<string, unknown> | undefined;
      return destinationBirth(given, registerScope) && repository?.["host"] === host && repository["namespace"] === namespace;
    }
    return false;
  };
}

/** The host that this object's own history records: the register's, or the destination's repository's. Null for any other scope. */
export function recordedHost(given: OutsideGiven): string | null {
  try {
    const scope = given.scope();
    const definition = given.genesis()?.seed.definition;
    const host = scope?.at.kind === "register" && definition === REGISTER ? given.state.page("register", ["open"], null, 1).items[0]?.values["host"]
      : scope?.at.kind === "destination" && definition === DESTINATION ? (destinationBranch(given.state)?.values["repository"] as Record<string, unknown> | undefined)?.["host"]
      : null;
    return typeof host === "string" ? host : null;
  } catch { return null; }
}

/**
 * A deterministic local handle backed by the scope's already sealed mint.
 * The explicit adapter-attempt choice does NOT identify a host-issued token
 * ID. The sealed operation/current incarnation is its durable binding before
 * the mint request; the host reply's plaintext later enters private custody.
 * `domain` names the host's handle space; `label` is the error's text.
 */
export function credentialHandle(given: OutsideGiven, repository: DestinationRepository, binding: DestinationBinding, domain: string, label: string): string {
  const scope = given.scope();
  const mint = given.state.operation(binding.mint);
  const origin = isOperationId(binding.mint) ? given.own(Number(binding.mint.split(":")[0])) : null;
  const write = mint ? destinationWrite(given.state, given.own, mint) : null;
  const recorded = destinationBranch(given.state)?.values["repository"];
  if (!scope || scope.at.kind !== "destination" || given.genesis()?.seed.definition !== DESTINATION || !same(scope.at, binding.scope) || !mint || mint.owner !== DESTINATION || mint.kind !== DESTINATION_KINDS.mint || binding.attempt !== 1 || !origin || entryHash(origin.entry) !== origin.hash || !same(origin.entry.at, scope.at) || !write || write.write.id !== binding.write || write.attempt !== binding.writeAttempt || !same(recorded, repository)) throw new Error(label);
  const effect = origin.entry.effects.find((effect) => effect.effect === "operation" && effect.k === Number(binding.mint.split(":")[1]));
  if (effect?.effect !== "operation" || effect.owner !== DESTINATION || effect.kind !== DESTINATION_KINDS.mint || !mint.attempts.some((attempt) => attempt.attempt === binding.attempt)) throw new Error(label);
  const digest = valueDigest(domain, { scope: scope.at, operation: mint.id, attempt: binding.attempt, origin: origin.hash, repository, write: binding.write, writeAttempt: binding.writeAttempt } as unknown as FieldValue);
  return `adapter:${digest}`;
}
