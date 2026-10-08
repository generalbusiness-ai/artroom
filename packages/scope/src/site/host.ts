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
import { isScopeId, parseStrict, timeMs } from "@generalbusiness/artroom-bytes";
import { DIRECTORY } from "@generalbusiness/artroom-platform";
import type { GitSource } from "@generalbusiness/artroom-git";
import { GitHubApp, type GitHubAccount } from "@generalbusiness/artroom-git/github";
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
  /** True only when cleanup is confirmed. False leaves no durable cleanup record here. */
  close(): Promise<boolean>;
  /** The last request the source sent and what came back, query left out, for a log line. Empty before the first. */
  last(): string;
  /** The secrets this read holds, which a log line must not show. */
  secrets: readonly string[];
}

/** The steps of a read, as a refusal's `x-site-step` header and the log name them. */
export type SiteStep = "room" | "open" | "info" | "token" | "refs" | "objects" | "render" | "cleanup";

/** An error of one step of opening a repository. */
export class StepError extends Error {
  readonly step: SiteStep;
  constructor(step: SiteStep, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "StepError";
    this.step = step;
  }
}

/** A remote URL as compared with the service's report: no trailing `/`, and no `.git` at the end. */
export const sameRemote = (reported: unknown, expected: string): boolean => {
  const bare = (url: string) => url.replace(/\/+$/, "").replace(/\.git$/, "");
  return typeof reported === "string" && bare(reported) === bare(expected);
};

/** Run one step: an error of it is a `StepError` of that step, its class and message kept. */
async function step<T>(name: SiteStep, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof StepError) throw e;
    throw new StepError(name, e instanceof Error ? `${e.name}: ${e.message}` : String(e), { cause: e });
  }
}

/** The bindings the site reads: the scope namespace and the two hosts' settings. */
export interface SiteEnv extends GitHubBindings, ArtifactsBindings {
  SCOPES: Binding;
}

/** The one namespace of the deployed ARTIFACTS binding; not selected by a request. */
const ARTIFACTS_NAMESPACE = "artroom-demo";
const SERVICE_NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
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
export function readerOf(env: SiteEnv, room: Room, fetch?: (request: Request) => Promise<Response>, now: () => number = Date.now): (() => Promise<Opened>) | null {
  const { repository } = room;
  const send = fetch ?? ((request: Request) => globalThis.fetch(request));
  // Each source records its last request and answer, for the log line of a failed read. No header and no query is kept.
  const transport = (remote: string, maxBytes: number, authorization?: string, alive?: () => boolean) => {
    let last = "";
    const traced = async (request: Request): Promise<Response> => {
      if (alive && !alive()) throw new StepError("token", "the read token expiry has passed");
      const url = new URL(request.url);
      const asked = `${request.method} ${url.origin}${url.pathname}`;
      try {
        const response = await send(request);
        last = `${asked} -> ${response.status} ${response.headers.get("content-type") ?? "no content-type"}`;
        return response;
      } catch (e) {
        last = `${asked} -> ${e instanceof Error ? e.name : "error"}`;
        throw e;
      }
    };
    return { source: new SmartHttpSource({ remote, maxBytes, ...(authorization === undefined ? {} : { authorization }), fetch: traced }), last: () => last };
  };
  if (repository.host === ARTIFACTS_HOST) {
    const config = setting(env.ARTIFACTS_CONFIG);
    const binding = env.ARTIFACTS as ArtifactsNamespace | undefined;
    const service = config?.["host"];
    if (!config || typeof binding?.get !== "function" || typeof service !== "string" || !SERVICE_NAME.test(service) || config["namespace"] !== ARTIFACTS_NAMESPACE || config["namespace"] !== repository.namespace || config.registerScope !== room.register) return null;
    if (!REPOSITORY_NAME.test(repository.name) || repository.name.toLowerCase().endsWith(".git") || repository.id !== repository.name) return null;
    const remote = `https://${service}/git/${repository.namespace}/${repository.name}.git`;
    return async () => {
      const handle = await step("open", () => binding.get(repository.name));
      // The service's own report of the remote must be the expected one before a token is minted. A trailing `/` and a
      // final `.git` are not compared: either form names the same repository.
      const info = await step("info", () => handle.info());
      if (!sameRemote(record(info)?.["remote"], remote)) throw new StepError("info", `the service reports another remote, ${typeof record(info)?.["remote"]}`);
      // The minted token's plaintext is `plaintext`, or `token` where the service names it so.
      let minted: Record<string, unknown> | null;
      try { minted = record(await handle.createToken("read", READ_TTL)); }
      catch { throw new StepError("token", "the read token request did not give an answer"); }
      const plaintext = typeof minted?.["plaintext"] === "string" ? minted["plaintext"] : minted?.["token"];
      if (typeof plaintext !== "string" || !/^[!-~]{1,4096}$/.test(plaintext)) throw new StepError("token", "no usable read token in the answer");
      // One cleanup attempt for this read, shared by every close call.
      // A confirmed result is kept; an unconfirmed result is not retried.
      let cleanup: Promise<boolean> | undefined;
      const close = (): Promise<boolean> => cleanup ??= (async () => {
        try { return await handle.revokeToken(plaintext) === true; } catch { return false; }
      })();
      // The service must actually report read scope and a real ISO instant.
      // The requested TTL is no evidence of its grant or of cleanup.
      const expiry = minted?.["expiresAt"];
      const ends = typeof expiry === "string" ? timeMs(expiry.replace(/\.000Z$/, "Z")) : null;
      if (minted?.["scope"] !== "read" || ends === null || !Number.isFinite(now()) || ends <= now()) {
        if (!await close()) throw new StepError("cleanup", "revocation of an unusable read token was not confirmed");
        throw new StepError("token", "the token reply states no valid read scope and ISO expiry");
      }
      const { source, last } = transport(remote, config.maxBytes, `Bearer ${plaintext}`, () => Number.isFinite(now()) && now() < ends);
      return {
        source, last, secrets: [plaintext],
        close,
      };
    };
  }
  if (repository.host === GITHUB_HOST) {
    const config = setting(env.GITHUB_APP_CONFIG);
    const account = record(config?.["account"]);
    const login = account?.["login"];
    const token = env.GITHUB_READ_TOKEN;
    if (!config || login !== repository.namespace || config.registerScope !== room.register) return null;
    if (!/^[A-Za-z0-9_.-]{1,100}$/.test(repository.name) || repository.name === "." || repository.name === ".." || repository.name.toLowerCase().endsWith(".git")) return null;
    const id = Number(repository.id);
    if (!/^[1-9][0-9]*$/.test(repository.id) || !Number.isSafeInteger(id) || String(id) !== repository.id) return null;
    let app: GitHubApp;
    try {
      app = new GitHubApp({ issuer: config["issuer"] as string, installationId: config["installationId"] as number, account: account as unknown as GitHubAccount, privateKey: env.GITHUB_APP_PRIVATE_KEY!, fetch: send });
    } catch { return null; }
    const publicReads = config["publicReads"] === true;
    if (!publicReads && (typeof token !== "string" || !/^[A-Za-z0-9_.-]{1,4096}$/.test(token))) return null;
    const remote = `https://github.com/${repository.namespace}/${repository.name}.git`;
    const authorization = publicReads ? undefined : `Basic ${btoa(`x-access-token:${token!}`)}`;
    return async () => {
      // Reuse the provider's account/name/remote checks, then compare the
      // recorded stable ID. A name replacement cannot inherit the room.
      const seen = await step("info", () => app.repository(repository.name, publicReads ? undefined : token!));
      if (seen === null || seen.id !== id) throw new StepError("info", "the repository lookup did not confirm the recorded ID");
      return { ...transport(remote, config.maxBytes, authorization), secrets: publicReads ? [] : [token!], close: async () => true };
    };
  }
  return null;
}
