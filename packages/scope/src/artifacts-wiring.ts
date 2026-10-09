/**
 * Opt-in wiring of the hosting's own Git service. It takes effect only with
 * the `ARTIFACTS` binding and the explicit setting `ARTIFACTS_CONFIG`, and
 * only for the one register pinned there, whose recorded host is
 * `artifacts` and whose namespace is the configured one, and for the
 * destinations born of that register's claims. Missing or invalid
 * configuration leaves every outside effect unsent. No configuration, token
 * or plaintext belongs in a scope's history.
 */
import type { ScopeId } from "@generalbusiness/artroom-contract";
import { canonicalize, isScopeId, parseStrict } from "@generalbusiness/artroom-bytes";
import { destinationBranch, isOf } from "@generalbusiness/artroom-platform";
import { ArtifactsProvider, type ArtifactsNamespace, type CreationCustody } from "./artifacts-host.ts";
import { CredentialStore } from "./credential-store.ts";
import { DestinationHost, type SnapshotReader, type DestinationRepository } from "./destination-host.ts";
import { credentialHandle, exact, hostBound } from "./host-wiring.ts";
import type { OutsideGiven } from "./object.ts";
import { NO_OUTSIDE, type EffectRequest, type Outside } from "./operations.ts";
import { RegisterHost } from "./register-host.ts";

/** The host that a register records, at install, for this service. */
export const ARTIFACTS_HOST = "artifacts";
/** Must match the one namespace of the deployed ARTIFACTS binding. */
export const ARTIFACTS_NAMESPACE = "artroom-demo";

export interface ArtifactsBindings {
  /** Nonsecret JSON; every field is explicit: `{ registerScope, namespace, host, maxBytes, credentialIdentity: "adapter-attempt" }`. Precompute the install's register scope ID and pin it here. */
  ARTIFACTS_CONFIG?: string;
  /** The Worker's binding to one namespace of the service. */
  ARTIFACTS?: unknown;
}
interface Configuration { registerScope: ScopeId; namespace: string; host: string; maxBytes: number; credentialIdentity: "adapter-attempt" }

function configuration(raw: string | undefined): Configuration | null {
  if (typeof raw !== "string" || raw.length > 4096) return null;
  const value = exact(parseStrict(raw), ["registerScope", "namespace", "host", "maxBytes", "credentialIdentity"]);
  if (!value || !isScopeId(value["registerScope"]) || typeof value["namespace"] !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(value["namespace"]) || typeof value["host"] !== "string" || value["host"].length > 253 || typeof value["maxBytes"] !== "number" || !Number.isSafeInteger(value["maxBytes"]) || value["maxBytes"] < 32 || value["credentialIdentity"] !== "adapter-attempt") return null;
  return value as unknown as Configuration;
}
function binding(value: unknown): ArtifactsNamespace | null {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) return null;
  const binding = value as Record<string, unknown>;
  return typeof binding["get"] === "function" && typeof binding["create"] === "function" && typeof binding["delete"] === "function" ? value as ArtifactsNamespace : null;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS private_creation_credential (
  scope TEXT NOT NULL, handle TEXT NOT NULL, name TEXT NOT NULL, plaintext TEXT,
  PRIMARY KEY (scope, handle)
) WITHOUT ROWID;
`;
/**
 * Private custody of a creation's write token, in the register object's own
 * storage, beside its history and never in it. A row's plaintext is dropped
 * when its revocation is confirmed. A row is written once.
 */
function creationCustody(sql: Pick<SqlStorage, "exec">, current: () => string | null): CreationCustody {
  sql.exec(SCHEMA).toArray();
  return {
    hold: (handle, name, plaintext) => {
      const scope = current();
      if (scope) sql.exec("INSERT OR IGNORE INTO private_creation_credential (scope, handle, name, plaintext) VALUES (?, ?, ?, ?)", scope, handle, name, plaintext).toArray();
    },
    take: (handle) => {
      const scope = current();
      const row = scope ? sql.exec("SELECT name, plaintext FROM private_creation_credential WHERE scope = ? AND handle = ?", scope, handle).toArray()[0] : undefined;
      return row && typeof row["plaintext"] === "string" ? { name: row["name"] as string, plaintext: row["plaintext"] } : null;
    },
    revoked: (handle) => {
      const scope = current();
      if (scope) sql.exec("UPDATE private_creation_credential SET plaintext = NULL WHERE scope = ? AND handle = ?", scope, handle).toArray();
    },
  };
}

/** Factory for one object life. Its scope/state reads stay live across genesis and later entries. */
export function artifactsOutside(given: OutsideGiven, sql: Pick<SqlStorage, "exec">, env: ArtifactsBindings, fetch?: (request: Request) => Promise<Response>, snapshotReader?: SnapshotReader): Outside {
  try {
    const config = configuration(env.ARTIFACTS_CONFIG);
    const namespaceBinding = binding(env.ARTIFACTS);
    if (!config || config.namespace !== ARTIFACTS_NAMESPACE || !namespaceBinding) return NO_OUTSIDE;
    const host = ARTIFACTS_HOST;
    const namespace = config.namespace;
    const current = () => { const scope = given.scope()?.at; return scope ? canonicalize(scope) : null; };
    const provider = new ArtifactsProvider({
      binding: namespaceBinding, host, namespace, service: config.host, maxBytes: config.maxBytes, ...(fetch === undefined ? {} : { fetch }),
      credentialHandle: async (repository, binding) => credentialHandle(given, repository, binding, "artroom.artifacts.credential-attempt.v1", "Artifacts credential binding"),
      creation: creationCustody(sql, current),
      repositoryOf: () => (destinationBranch(given.state)?.values["repository"] ?? null) as DestinationRepository | null,
    });
    const register = new RegisterHost(given, { host, namespace, provider });
    const custody = new CredentialStore(sql, () => given.scope()?.at ?? null);
    const destination = new DestinationHost(given, { host, namespace, provider, custody, ...(snapshotReader ? { snapshotReader } : {}) });
    const bound = hostBound(given, config.registerScope, host, namespace);
    const accepts = (owner: string, kind: string): boolean => bound(owner) && (isOf(owner, "platform:register") ? register.accepts(owner, kind) : destination.accepts(owner, kind));
    const send = (request: EffectRequest) => !accepts(request.owner, request.kind) ? Promise.resolve(null) : isOf(request.owner, "platform:register") ? register.send(request) : destination.send(request);
    // No `recovery`: each read of this service mints a read token, so a
    // repeated read is not free of mutation.
    return {
      accepts, send,
      snapshot: (asked) => bound(given.genesis()?.seed.definition ?? "") ? destination.snapshot(asked) : Promise.resolve(null),
      judged: (at, sealed) => destination.judged(at, sealed),
      replies: (limit) => bound(given.genesis()?.seed.definition ?? "") ? destination.replies(limit) : { answers: [], more: false },
      credential: (handle, key) => bound(given.genesis()?.seed.definition ?? "") ? destination.credential(handle, key) : null,
    };
  } catch { return NO_OUTSIDE; }
}
