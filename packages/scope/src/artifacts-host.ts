/**
 * Ports for the hosting's own Git service, reached through the Worker's
 * `ARTIFACTS` binding, with no outside credential. The binding is described
 * here by structural types, so this package needs no Workers types.
 *
 * Every mutation is sent once. A refusal that the service states changed
 * nothing is the answer; any other failure leaves the outcome unknown. The
 * repository's ID is its name: the binding names a repository by its name
 * and gives no other identifier. No plaintext is recorded in an outside
 * answer.
 */
import type { RetainedInput } from "@generalbusiness/artroom-contract";
import { timeMs, timeOf } from "@generalbusiness/artroom-bytes";
import type { DestinationObject, RecordedJudgeEvidence } from "@generalbusiness/artroom-platform";
import { GitRefusal, READ_BOUNDS, Reader, type GitSource, type ReadBounds } from "@generalbusiness/artroom-git";
import { SmartHttpSource } from "@generalbusiness/artroom-git/http-read";
import type { DestinationBinding, DestinationInspection, DestinationProvider, DestinationRepository } from "./destination-host.ts";
import { inspectGit, sendOnce } from "./github-host.ts";
import type { RegisterProvider } from "./register-host.ts";

/** A repository handle of the binding: the parts this port uses. */
export interface ArtifactsRepository {
  /** `ttl` in seconds. Answers `{ id, plaintext, scope, expiresAt }`. */
  createToken(scope: "read" | "write", ttl: number): Promise<unknown>;
  /** A token's plaintext or its ID. True when revoked. */
  revokeToken(tokenOrId: string): Promise<unknown>;
  /** Answers `{ name, remote, ... }`. */
  info(): Promise<unknown>;
}
/** The binding: one namespace of the service. */
export interface ArtifactsNamespace {
  get(name: string): Promise<ArtifactsRepository>;
  /** A new, empty repository. Answers `{ name, remote, token }`; `token` is one write token in plaintext, which the caller must revoke. Throws `ALREADY_EXISTS` when the name is taken. */
  create(name: string): Promise<unknown>;
  /** True if deleted, false if there was none. */
  delete(name: string): Promise<unknown>;
}

/** Private custody of a creation's write token whose revocation did not confirm. Nonsecret handle in, plaintext held privately. */
export interface CreationCustody {
  hold(handle: string, name: string, plaintext: string): void;
  take(handle: string): { name: string; plaintext: string } | null;
  revoked(handle: string): void;
}

export interface ArtifactsProviderOptions {
  binding: ArtifactsNamespace;
  /** The register's recorded host for this service, and its namespace. */
  host: string;
  namespace: string;
  /** The hostname of the service's remote URLs. */
  service: string;
  /** Caller-chosen transport allowance, not a platform quota. */
  maxBytes: number;
  bounds?: ReadBounds;
  fetch?: (request: Request) => Promise<Response>;
  timeoutMs?: number;
  /** Caller's nonsecret, durable credential mapping, allocated BEFORE mint. Not the service's token ID. */
  credentialHandle(repository: DestinationRepository, binding: DestinationBinding): Promise<string>;
  /** Where a creation token is durably held. Without custody, an unconfirmed immediate revocation leaves creation unknown. */
  creation?: CreationCustody;
  /** The repository this object records, for a revocation, which names only the token. */
  repositoryOf?(): DestinationRepository | null;
}

/** Write tokens live long enough for one judged write; read tokens for one read. In seconds. */
export const WRITE_TTL = 900;
export const READ_TTL = 120;

const bad = (): never => { throw new GitRefusal("unreadable", "Artifacts provider"); };
/** Error codes that state the request was refused and changed nothing. Every other failure leaves the outcome unknown. */
const REFUSED_UNCHANGED = new Set(["ALREADY_EXISTS", "INVALID_INPUT", "INVALID_REPO_NAME", "INVALID_TTL", "NOT_FOUND"]);
const codeOf = (e: unknown): string | null => {
  try {
    const code = (e as { code?: unknown } | null)?.code;
    const numeric = (e as { numericCode?: unknown } | null)?.numericCode;
    return typeof code === "string" && REFUSED_UNCHANGED.has(code) && typeof numeric === "number" ? code : null;
  } catch { return null; }
};
const repositoryName = (name: unknown): name is string => typeof name === "string" && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(name) && !name.toLowerCase().endsWith(".git");
const plaintextOf = (value: unknown): string => typeof value === "string" && /^[!-~]{1,4096}$/.test(value) ? value : bad();
const handle = (value: string): string => typeof value === "string" && value.length > 0 && value.length <= 256 && !/[\u0000-\u001f\u007f]/.test(value) ? value : bad();
/** The binding's reported ISO expiry, normalized to the contract's one
 * instant text. No expiry is inferred from the requested TTL. */
const endsOf = (value: unknown): string => {
  const ms = typeof value === "string" ? timeMs(value.replace(/\.000Z$/, "Z")) : null;
  return ms !== null && ms > 0 ? timeOf(ms) : bad();
};
function own(reply: unknown, key: string): unknown {
  if (typeof reply !== "object" || reply === null) return undefined;
  try { return Object.hasOwn(reply, key) ? (reply as Record<string, unknown>)[key] : undefined; } catch { return undefined; }
}

export class ArtifactsProvider implements RegisterProvider, DestinationProvider {
  readonly #options: ArtifactsProviderOptions;
  readonly #bounds: ReadBounds;
  constructor(options: ArtifactsProviderOptions) {
    if (!repositoryName(options.namespace) || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(options.service) || !Number.isSafeInteger(options.maxBytes) || options.maxBytes < 32) bad();
    this.#options = { ...options };
    this.#bounds = { ...(options.bounds ?? READ_BOUNDS) };
  }

  /** One create. Its write token is revoked at once; if that is not confirmed, the answer names the token's handle, which the register owes. */
  async createRepository(name: string): Promise<unknown> {
    if (!repositoryName(name)) return null;
    let created: unknown;
    try { created = await this.#options.binding.create(name); }
    catch (e) {
      const code = codeOf(e);
      return code === null ? null : { created: false, name, nameExists: code === "ALREADY_EXISTS" };
    }
    if (own(created, "name") !== name) return null;
    let plaintext: string;
    try { plaintext = plaintextOf(own(created, "token")); } catch { return null; }
    const credential = `creation:${name}`;
    let held = false;
    try {
      this.#options.creation?.hold(credential, name, plaintext);
      const stored = this.#options.creation?.take(credential);
      held = stored?.name === name && stored.plaintext === plaintext;
    } catch { /* Immediate revocation can still confirm; otherwise no answer. */ }
    let revoked = false;
    try { revoked = await (await this.#options.binding.get(name)).revokeToken(plaintext) === true; } catch { revoked = false; }
    if (revoked) {
      try { this.#options.creation?.revoked(credential); } catch { /* the plaintext is revoked; a held copy is no authority */ }
    }
    if (own(created, "remote") !== this.#remote({ host: this.#options.host, namespace: this.#options.namespace, name, id: name })) return null;
    if (revoked) return { created: true, name, id: name };
    // A local cleanup handle is an answer only while its exact plaintext is
    // durably held. Failed custody and failed revocation remain unknown.
    return held ? { created: true, name, id: name, credential } : null;
  }
  async deleteRepository(id: string, name: string): Promise<unknown> {
    if (id !== name || !repositoryName(name)) return null;
    try {
      const deleted = await this.#options.binding.delete(name);
      return typeof deleted === "boolean" ? { deleted, id } : null;
    } catch (e) { return codeOf(e) === null ? null : { deleted: false, id }; }
  }
  async revokeCredential(id: string): Promise<unknown> {
    try {
      const held = this.#options.creation?.take(handle(id));
      if (!held) return null;
      const revoked = await this.#revoke(held.name, held.plaintext);
      if (revoked === null) return null;
      if (revoked) try { this.#options.creation!.revoked(id); } catch { /* revoked: a held copy is no authority */ }
      return { revoked, credential: id };
    } catch { return null; }
  }

  async mint(repository: DestinationRepository, binding: DestinationBinding): Promise<unknown> {
    repository = { ...repository };
    this.#remote(repository);
    const id = handle(await this.#options.credentialHandle({ ...repository }, { ...binding, scope: { ...binding.scope } }));
    const handleOf = await this.#options.binding.get(repository.name);
    let token: unknown;
    try { token = await handleOf.createToken("write", WRITE_TTL); }
    catch (e) { if (codeOf(e) !== null) return { minted: false }; throw e; }
    if (own(token, "scope") !== "write") return bad();
    // DestinationHost puts the plaintext in private custody before answering.
    // Lost replies or failed custody remain pending; this port never remints.
    return { id, ends: endsOf(own(token, "expiresAt")), plaintext: plaintextOf(own(token, "plaintext")) };
  }
  async revoke(id: string, plaintext: string): Promise<unknown> {
    handle(id);
    const repository = this.#options.repositoryOf?.() ?? null;
    if (!repository) return bad();
    this.#remote(repository);
    const revoked = await this.#revoke(repository.name, plaintext);
    return revoked === null ? bad() : { revoked, id };
  }
  async format(repository: DestinationRepository): Promise<"sha1"> {
    // The complete advertisement is checked; the source rejects SHA-256.
    await this.#read(repository, (source) => source.refs("refs/heads/", this.#bounds.refs));
    return "sha1";
  }
  ref(repository: DestinationRepository, ref: string): Promise<string | null> {
    return this.#read(repository, (source) => new Reader(source, this.#bounds).ref(ref));
  }
  objects(repository: DestinationRepository, commit: string): Promise<readonly DestinationObject[]> {
    return this.#read(repository, async (source) => {
      const collected = new Map<string, DestinationObject>();
      const recording: GitSource = {
        object: async (id, limit) => {
          const object = await source.object(id, limit);
          if (object.data !== null && (object.type === "blob" || object.type === "tree" || object.type === "commit")) collected.set(id, { id, kind: object.type, body: new Uint8Array(object.data) });
          return object;
        },
        ref: (ref) => source.ref(ref), refs: (prefix, limit) => source.refs(prefix, limit),
      };
      if (!(await new Reader(recording, this.#bounds).closure(commit)).complete) return bad();
      return [...collected.values()];
    });
  }
  async send(request: Parameters<DestinationProvider["send"]>[0]): Promise<unknown> {
    request = { ...request, repository: { ...request.repository }, binding: { ...request.binding, scope: { ...request.binding.scope } } };
    const remote = this.#remote(request.repository);
    return sendOnce(request, { ...this.#transport(remote), authorization: `Bearer ${plaintextOf(request.token)}` }, () => this.ref(request.repository, request.ref));
  }
  async inspect(context: DestinationInspection): Promise<{ evidence: RecordedJudgeEvidence; retain?: readonly RetainedInput[] }> {
    context = { ...context, repository: { ...context.repository }, reports: [...context.reports] };
    return this.#read(context.repository, (source) => inspectGit(new Reader(source, this.#bounds), context, this.#bounds));
  }

  /** The remote URL of a recorded repository at this host and namespace. */
  #remote(repository: DestinationRepository): string {
    if (repository.host !== this.#options.host || repository.namespace !== this.#options.namespace || !repositoryName(repository.name) || repository.id !== repository.name) return bad();
    return `https://${this.#options.service}/git/${this.#options.namespace}/${repository.name}.git`;
  }
  #transport(remote: string) {
    return { remote, maxBytes: this.#options.maxBytes, bounds: this.#bounds, ...(this.#options.fetch === undefined ? {} : { fetch: this.#options.fetch }), ...(this.#options.timeoutMs === undefined ? {} : { timeoutMs: this.#options.timeoutMs }) };
  }
  /** One revocation: true, false, or null when the outcome is unknown. */
  async #revoke(name: string, plaintext: string): Promise<boolean | null> {
    try {
      const revoked = await (await this.#options.binding.get(name)).revokeToken(plaintext);
      return typeof revoked === "boolean" ? revoked : null;
    } catch (e) { return codeOf(e) === null ? null : false; }
  }
  /**
   * One read over smart HTTP, with a read token minted for it and revoked
   * after. The service's own report of the remote must be the expected one.
   * The reply must state read scope and an actual expiry. A failed
   * revocation is not proof that the requested TTL was honored.
   */
  async #read<T>(repository: DestinationRepository, read: (source: SmartHttpSource) => Promise<T>): Promise<T> {
    repository = { ...repository };
    const remote = this.#remote(repository);
    const handleOf = await this.#options.binding.get(repository.name);
    if (own(await handleOf.info(), "remote") !== remote) return bad();
    const token = await handleOf.createToken("read", READ_TTL);
    const plaintext = plaintextOf(own(token, "plaintext"));
    try {
      if (own(token, "scope") !== "read") return bad();
      endsOf(own(token, "expiresAt"));
      return await read(new SmartHttpSource({ ...this.#transport(remote), authorization: `Bearer ${plaintext}` }));
    } finally {
      try { await handleOf.revokeToken(plaintext); } catch { /* no confirmed revocation; the reported expiry remains the service's assertion */ }
    }
  }
}
