/**
 * Opt-in production GitHub.com wiring. Bindings select authority, repository
 * visibility, read authority and the adapter's local credential identity.
 * Missing or invalid configuration leaves every outside effect unsent.
 * No configuration, key, token or plaintext belongs in a scope's history.
 */
import type { ScopeId } from "@generalbusiness/artroom-contract";
import { isScopeId, parseStrict, timeMs } from "@generalbusiness/artroom-bytes";
import { isOf } from "@generalbusiness/artroom-platform";
import type { GitHubAccount, GitHubInstallationToken } from "@generalbusiness/artroom-git/github";
import { CredentialStore } from "./credential-store.ts";
import { DestinationHost } from "./destination-host.ts";
import { GitHubProvider } from "./github-host.ts";
import { credentialHandle, exact, hostBound } from "./host-wiring.ts";
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
      credentialHandle: async (repository, binding) => credentialHandle(given, repository, binding, "artroom.github.credential-attempt.v1", "GitHub credential binding"),
      ...(creation === undefined ? {} : { creation: { plaintext: creation, private: config.privateRepositories } }),
      cleanupRepository: async (id) => cleanups.get(id) ?? null,
    });
    const register = new RegisterHost(given, { host, namespace, provider });
    const custody = new CredentialStore(sql, () => given.scope()?.at ?? null);
    const destination = new DestinationHost(given, { host, namespace, provider, custody });
    const bound = hostBound(given, config.registerScope, host, namespace);
    // accepts names a kind, not one operation. A nonempty cleanup map enables
    // that kind; a missing exact ID/name within it still yields no answer.
    // With no cleanup map, deletion stays recorded and unmarked.
    const accepts = (owner: string, kind: string): boolean => bound(owner) && (isOf(owner, "platform:register")
      ? register.accepts(owner, kind) && (kind === "create-repository" ? creation !== undefined : kind === "delete-repository" && cleanups.size > 0)
      : destination.accepts(owner, kind));
    const send = (request: EffectRequest) => {
      if (!accepts(request.owner, request.kind)) return Promise.resolve(null);
      if (!isOf(request.owner, "platform:register")) return destination.send(request);
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
      replies: (limit) => bound(given.genesis()?.seed.definition ?? "") ? destination.replies(limit) : { answers: [], more: false },
      credential: (handle, key) => bound(given.genesis()?.seed.definition ?? "") ? destination.credential(handle, key) : null,
    };
  } catch { return NO_OUTSIDE; }
}
