/**
 * What the site route reads before it renders: the room that a directory
 * scope ID names, and the room's repository at its Git host.
 *
 * The room is read from the directory's genesis entry: the repository
 * record `{ host, namespace, name, id }` and the published branch, which
 * the register's `create` gave it. The entry is read through the object's
 * `source` method, the one that scopes use to check each other's sends: it
 * checks no reader. Only a directory that the register pinned in the host's
 * setting created is a room here, as only that register and its
 * destinations may use the host (`host-wiring.ts`, `hostBound`).
 *
 * The repository is read over smart HTTP, as the destinations read it: on
 * the hosting's own Git service with a read token minted for the read and
 * revoked after; on GitHub with the deployment's `GITHUB_READ_TOKEN`, or
 * with none when the setting says reads are public.
 */
import type { Entry, ScopeId } from "@generalbusiness/artroom-contract";
import { isScopeId, parseStrict } from "@generalbusiness/artroom-bytes";
import { DIRECTORY } from "@generalbusiness/artroom-platform";
import type { GitSource } from "@generalbusiness/artroom-git";
import { SmartHttpSource } from "@generalbusiness/artroom-git/http-read";
import { READ_TTL, type ArtifactsNamespace } from "../artifacts-host.ts";
import { ARTIFACTS_HOST, type ArtifactsBindings } from "../artifacts-wiring.ts";
import type { DestinationRepository } from "../destination-host.ts";
import type { GitHubBindings } from "../github-wiring.ts";
import type { Binding, Sourced } from "../namespace.ts";

export const GITHUB_HOST = "github.com";

/** A room as its directory's genesis records it. */
export interface Room {
  /** The register that created the directory. */
  register: ScopeId;
  repository: DestinationRepository;
  /** The published branch's name, without `refs/heads/`. */
  branch: string;
}

/** A source for one repository, and how to end it: a minted read token is revoked. */
export interface Opened {
  source: GitSource;
  close(): Promise<void>;
}

/** The bindings the site reads: the scope namespace and the two hosts' settings. */
export interface SiteEnv extends GitHubBindings, ArtifactsBindings {
  SCOPES: Binding;
}

const REPOSITORY_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;
const record = (value: unknown): Record<string, unknown> | null => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null);

/**
 * The room that the directory `directory` is, or null when it is none: no
 * such scope, no directory, a genesis that was refused, or a record out of
 * form. A source that cannot answer rejects.
 */
export async function roomOf(scopes: Binding, directory: string): Promise<Room | null> {
  if (!isScopeId(directory)) return null;
  const object = scopes.get(scopes.idFromName(directory)) as { source(seq: number): Promise<Sourced | null> };
  const sourced = await object.source(0);
  if (!sourced || sourced.at.kind !== "directory" || sourced.at.scope !== directory || sourced.bytes === null) return null;
  const entry = parseStrict(sourced.bytes) as unknown as Entry;
  const input = entry.input;
  if (input.type !== "genesis" || input.decision !== "applied" || input.seed.definition !== DIRECTORY || input.seed.creator?.kind !== "register") return null;
  const fields = record(record(input.message?.body)?.["fields"]);
  const repository = record(fields?.["repository"]);
  const branch = fields?.["branch"];
  if (!repository || typeof branch !== "string") return null;
  const { host, namespace, name, id } = repository;
  if (Object.keys(repository).length !== 4 || typeof host !== "string" || typeof namespace !== "string" || typeof name !== "string" || typeof id !== "string") return null;
  return { register: input.seed.creator.scope, repository: { host, namespace, name, id }, branch };
}

interface Setting { registerScope: ScopeId; namespace: string; maxBytes: number }

/** The fields of a host's setting that the site reads. The host's own wiring checks the whole setting; this reads only these. */
function setting(raw: string | undefined): (Setting & Record<string, unknown>) | null {
  try {
    const value = typeof raw === "string" && raw.length <= 4096 ? record(parseStrict(raw)) : null;
    if (!value || !isScopeId(value["registerScope"]) || typeof value["maxBytes"] !== "number" || !Number.isSafeInteger(value["maxBytes"]) || value["maxBytes"] < 32) return null;
    return value as Setting & Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * How to read a room's repository at its host, or null when this
 * deployment cannot: the host is not configured, the room was not created
 * by the host's pinned register, or the record is not at the host's
 * namespace.
 */
export function readerOf(env: SiteEnv, room: Room, fetch?: (request: Request) => Promise<Response>): (() => Promise<Opened>) | null {
  const { repository } = room;
  const transport = (remote: string, maxBytes: number, authorization?: string) =>
    new SmartHttpSource({ remote, maxBytes, ...(authorization === undefined ? {} : { authorization }), ...(fetch === undefined ? {} : { fetch }) });
  if (repository.host === ARTIFACTS_HOST) {
    const config = setting(env.ARTIFACTS_CONFIG);
    const binding = env.ARTIFACTS as ArtifactsNamespace | undefined;
    const service = config?.["host"];
    if (!config || typeof binding?.get !== "function" || typeof service !== "string" || config["namespace"] !== repository.namespace || config.registerScope !== room.register) return null;
    if (!REPOSITORY_NAME.test(repository.name) || repository.name.toLowerCase().endsWith(".git") || repository.id !== repository.name) return null;
    const remote = `https://${service}/git/${repository.namespace}/${repository.name}.git`;
    return async () => {
      const handle = await binding.get(repository.name);
      // The service's own report of the remote must be the expected one before a token is minted.
      if (record(await handle.info())?.["remote"] !== remote) throw new Error("the service reports another remote");
      const plaintext = record(await handle.createToken("read", READ_TTL))?.["plaintext"];
      if (typeof plaintext !== "string" || !/^[!-~]{1,4096}$/.test(plaintext)) throw new Error("no read token");
      return {
        source: transport(remote, config.maxBytes, `Bearer ${plaintext}`),
        close: async () => {
          try { await handle.revokeToken(plaintext); } catch { /* it ends at its expiry */ }
        },
      };
    };
  }
  if (repository.host === GITHUB_HOST) {
    const config = setting(env.GITHUB_APP_CONFIG);
    const login = record(config?.["account"])?.["login"];
    const token = env.GITHUB_READ_TOKEN;
    if (!config || login !== repository.namespace || config.registerScope !== room.register) return null;
    if (!/^[A-Za-z0-9_.-]{1,100}$/.test(repository.name) || repository.name === "." || repository.name === ".." || repository.name.toLowerCase().endsWith(".git")) return null;
    const publicReads = config["publicReads"] === true;
    if (!publicReads && (typeof token !== "string" || !/^[A-Za-z0-9_.-]{1,4096}$/.test(token))) return null;
    const remote = `https://github.com/${repository.namespace}/${repository.name}.git`;
    const authorization = publicReads ? undefined : `Basic ${btoa(`x-access-token:${token!}`)}`;
    return async () => ({ source: transport(remote, config.maxBytes, authorization), close: async () => {} });
  }
  return null;
}
