/**
 * Opt-in production GitHub.com wiring. Bindings select authority, repository
 * visibility, read authority and the adapter's local credential identity.
 * Missing or invalid configuration leaves every outside effect unsent.
 * No configuration, key, token or plaintext belongs in a scope's history.
 */
import type { Entry, FieldValue, ScopeId } from "@generalbusiness/artroom-contract";
import { canonicalize, entryHash, isDigest, isFactRef, isOperationId, isScopeId, parseStrict, timeMs } from "@generalbusiness/artroom-bytes";
import { isEntryOf, valueDigest } from "@generalbusiness/artroom-derive";
import { DESTINATION, DESTINATION_KINDS, REGISTER, destinationBranch, destinationWrite, directoryIdOf } from "@generalbusiness/artroom-platform";
import type { GitHubAccount, GitHubInstallationToken } from "@generalbusiness/artroom-git/github";
import { CredentialStore } from "./credential-store.ts";
import { DestinationHost, type DestinationBinding, type DestinationRepository } from "./destination-host.ts";
import { GitHubProvider } from "./github-host.ts";
import type { OutsideGiven } from "./object.ts";
import { NO_OUTSIDE, type EffectRequest, type Outside } from "./operations.ts";
import { RegisterHost } from "./register-host.ts";

export interface GitHubBindings {
  /** Nonsecret JSON; every field is explicit. Precompute the install's register scope ID and pin it here before deployment. */
  GITHUB_APP_CONFIG?: string;
  /** Deployment secrets; no default creation or private read authority. */
  GITHUB_APP_PRIVATE_KEY?: string;
  GITHUB_CREATION_TOKEN?: string;
  GITHUB_READ_TOKEN?: string;
  /** Secret JSON: repository ID -> {name, plaintext, expiresAt}. Each token is operator-attested as restricted to that one ID and administration:write. */
  GITHUB_CLEANUP_TOKENS?: string;
}
interface Configuration {
  issuer: string; installationId: number; account: GitHubAccount; maxBytes: number;
  /** Pins host authority only. Installation authorization (N5) remains unimplemented. */
  registerScope: ScopeId;
  privateRepositories: boolean; publicReads: boolean; credentialIdentity: "adapter-attempt";
}
interface Cleanup { name: string; token: GitHubInstallationToken }
const positive = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const secret = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_.-]{1,4096}$/.test(value);
const same = (a: unknown, b: unknown): boolean => canonicalize(a) === canonicalize(b);
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)) ? value as Record<string, unknown> : null;
}
function configuration(raw: string | undefined): Configuration | null {
  if (!raw || raw.length > 4096) return null;
  const value = exact(parseStrict(raw), ["issuer", "installationId", "account", "maxBytes", "registerScope", "privateRepositories", "publicReads", "credentialIdentity"]);
  const account = exact(value?.["account"], ["id", "login", "type"]);
  if (!value || !account || typeof value["issuer"] !== "string" || !/^[A-Za-z0-9_.-]{1,128}$/.test(value["issuer"]) || !positive(value["installationId"]) || !isScopeId(value["registerScope"]) || !positive(account["id"]) || typeof account["login"] !== "string" || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(account["login"]) || (account["type"] !== "User" && account["type"] !== "Organization") || !positive(value["maxBytes"]) || value["maxBytes"] < 32 || typeof value["privateRepositories"] !== "boolean" || typeof value["publicReads"] !== "boolean" || value["credentialIdentity"] !== "adapter-attempt" || (value["privateRepositories"] && value["publicReads"])) return null;
  return value as unknown as Configuration;
}
function cleanupTokens(raw: string | undefined): ReadonlyMap<string, Cleanup> | null {
  const cleanup = new Map<string, Cleanup>();
  if (raw === undefined) return cleanup;
  if (raw.length > 1024 * 1024) return null;
  const parsed = parseStrict(raw);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  for (const [id, entry] of Object.entries(parsed)) {
    const value = exact(entry, ["name", "plaintext", "expiresAt"]);
    if (!/^[1-9][0-9]*$/.test(id) || !positive(Number(id)) || String(Number(id)) !== id || !value || typeof value["name"] !== "string" || !/^[A-Za-z0-9_.-]{1,100}$/.test(value["name"]) || value["name"] === "." || value["name"] === ".." || value["name"].toLowerCase().endsWith(".git") || !secret(value["plaintext"]) || typeof value["expiresAt"] !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value["expiresAt"]) || !Number.isFinite(Date.parse(value["expiresAt"]))) return null;
    cleanup.set(id, { name: value["name"], token: { plaintext: value["plaintext"], expiresAt: value["expiresAt"], repositoryIds: [Number(id)], permissions: { administration: "write" } } });
  }
  return cleanup;
}

/** The creator is the actual directory derived by this verified register claim,
 * not an independently founded directory that merely cites the same claim. */
function destinationBirth(given: OutsideGiven, registerScope: ScopeId): boolean {
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
 * A deterministic local handle backed by the scope's already sealed mint.
 * The explicit adapter-attempt choice does NOT identify a GitHub-issued token
 * ID. The sealed operation/current incarnation is its durable binding before
 * the mint request; the host reply's plaintext later enters private custody.
 */
function credentialHandle(given: OutsideGiven, repository: DestinationRepository, binding: DestinationBinding): string {
  const scope = given.scope();
  const mint = given.state.operation(binding.mint);
  const origin = isOperationId(binding.mint) ? given.own(Number(binding.mint.split(":")[0])) : null;
  const write = mint ? destinationWrite(given.state, given.own, mint) : null;
  const recorded = destinationBranch(given.state)?.values["repository"];
  if (!scope || scope.at.kind !== "destination" || given.genesis()?.seed.definition !== DESTINATION || !same(scope.at, binding.scope) || !mint || mint.owner !== DESTINATION || mint.kind !== DESTINATION_KINDS.mint || binding.attempt !== 1 || !origin || entryHash(origin.entry) !== origin.hash || !same(origin.entry.at, scope.at) || !write || write.write.id !== binding.write || write.attempt !== binding.writeAttempt || !same(recorded, repository)) throw new Error("GitHub credential binding");
  const effect = origin.entry.effects.find((effect) => effect.effect === "operation" && effect.k === Number(binding.mint.split(":")[1]));
  if (effect?.effect !== "operation" || effect.owner !== DESTINATION || effect.kind !== DESTINATION_KINDS.mint || !mint.attempts.some((attempt) => attempt.attempt === binding.attempt)) throw new Error("GitHub credential binding");
  const digest = valueDigest("artroom.github.credential-attempt.v1", { scope: scope.at, operation: mint.id, attempt: binding.attempt, origin: origin.hash, repository, write: binding.write, writeAttempt: binding.writeAttempt } as unknown as FieldValue);
  return `adapter:${digest}`;
}

/** Factory for one object life. Its scope/state reads stay live across genesis and later entries. */
export function gitHubOutside(given: OutsideGiven, sql: Pick<SqlStorage, "exec">, env: GitHubBindings, fetch?: (request: Request) => Promise<Response>): Outside {
  try {
    const config = configuration(env.GITHUB_APP_CONFIG);
    const cleanups = cleanupTokens(env.GITHUB_CLEANUP_TOKENS);
    const key = env.GITHUB_APP_PRIVATE_KEY;
    const creation = env.GITHUB_CREATION_TOKEN;
    const read = env.GITHUB_READ_TOKEN;
    if (!config || !cleanups || typeof key !== "string" || (!config.publicReads && !secret(read)) || (creation !== undefined && !secret(creation)) || (read !== undefined && !secret(read))) return NO_OUTSIDE;
    const host = "github.com";
    const namespace = config.account.login;
    const provider = new GitHubProvider({
      app: { issuer: config.issuer, privateKey: key, installationId: config.installationId, account: config.account, now: () => timeMs(given.clock.read()) ?? NaN, ...(fetch === undefined ? {} : { fetch }) },
      host, namespace, maxBytes: config.maxBytes,
      readCredential: async () => config.publicReads ? undefined : read!,
      credentialHandle: async (repository, binding) => credentialHandle(given, repository, binding),
      ...(creation === undefined ? {} : { creation: { plaintext: creation, private: config.privateRepositories } }),
      cleanupRepository: async (id) => cleanups.get(id) ?? null,
    });
    const register = new RegisterHost(given, { host, namespace, provider });
    const custody = new CredentialStore(sql, () => given.scope()?.at ?? null);
    const destination = new DestinationHost(given, { host, namespace, provider, custody });
    const bound = (owner: string): boolean => {
      const scope = given.scope();
      const genesis = given.genesis();
      if (owner === REGISTER && scope?.at.kind === "register" && scope.at.scope === config.registerScope && genesis?.seed.definition === REGISTER) {
        const item = given.state.page("register", ["open"], null, 1).items[0];
        return item?.values["host"] === host && item.values["namespace"] === namespace;
      }
      if (owner === DESTINATION && scope?.at.kind === "destination" && genesis?.seed.definition === DESTINATION) {
        const repository = destinationBranch(given.state)?.values["repository"] as Record<string, unknown> | undefined;
        return destinationBirth(given, config.registerScope) && repository?.["host"] === host && repository["namespace"] === namespace;
      }
      return false;
    };
    // accepts names a kind, not one operation. A nonempty cleanup map enables
    // that kind; a missing exact ID/name within it still yields no answer.
    // With no cleanup map, deletion stays recorded and unmarked.
    const accepts = (owner: string, kind: string): boolean => bound(owner) && (owner === REGISTER
      ? register.accepts(owner, kind) && (kind === "create-repository" ? creation !== undefined : kind === "delete-repository" && cleanups.size > 0)
      : destination.accepts(owner, kind));
    const send = (request: EffectRequest) => {
      if (!accepts(request.owner, request.kind)) return Promise.resolve(null);
      if (request.owner !== REGISTER) return destination.send(request);
      if (request.kind === "delete-repository") {
        const input = request.origin.entry.input;
        const body = input.type === "outcome" ? input.evidence.body as Record<string, unknown> | null : null;
        const cleanup = typeof body?.["id"] === "string" ? cleanups.get(body["id"]) : null;
        if (!cleanup || cleanup.name !== body?.["name"]) return Promise.resolve(null);
      }
      return register.send(request);
    };
    return {
      accepts, send,
      judged: (at, sealed) => destination.judged(at, sealed),
      recovery: { accepts: (owner, kind) => accepts(owner, kind) && destination.recovery.accepts(owner, kind), read: (request) => accepts(request.owner, request.kind) ? destination.recovery.read(request) : Promise.resolve(null) },
      replies: (limit) => bound(DESTINATION) ? destination.replies(limit) : { answers: [], more: false },
    };
  } catch { return NO_OUTSIDE; }
}
