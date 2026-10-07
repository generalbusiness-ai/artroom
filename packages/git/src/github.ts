/**
 * GitHub.com REST primitives using Web APIs only. No retry, custody, grant,
 * operation identity or proof that an outside effect was retained lives here.
 * A mint returns plaintext privately to its caller; the caller must keep it
 * durably before using it and arrange cleanup even after a lost reply.
 *
 * Protocol sources (GitHub's own documentation):
 * https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app
 * https://docs.github.com/en/rest/apps/apps#create-an-installation-access-token-for-an-app
 * https://docs.github.com/en/rest/apps/installations#revoke-an-installation-access-token
 * https://docs.github.com/en/rest/repos/repos
 */

export type GitHubPermission = "read" | "write";
export type GitHubPermissions = Readonly<Record<string, GitHubPermission>>;
export interface GitHubAccount { id: number; login: string; type: "User" | "Organization" }
export interface GitHubRepository {
  id: number;
  owner: string;
  name: string;
  private: boolean;
  htmlUrl: string;
  gitUrl: string;
}
export interface GitHubTokenScope { repositoryIds: readonly number[]; permissions: GitHubPermissions }
/**
 * Secret value: never persist this answer in entries, logs or diagnostics.
 * Caller custody must preserve its validated scope beside the plaintext.
 */
export interface GitHubInstallationToken extends GitHubTokenScope { readonly plaintext: string; readonly expiresAt: string }
export interface GitHubAppOptions {
  /** GitHub recommends the App's client ID as JWT issuer. */
  issuer: string;
  /** PKCS8 PEM (BEGIN PRIVATE KEY), not GitHub's downloadable PKCS1 PEM. */
  privateKey: string;
  installationId: number;
  account: GitHubAccount;
  /** Trusted transport honoring the request's signal and redirect policy. */
  fetch?: (request: Request) => Promise<Response>;
  now?: () => number;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

export type GitHubFailureReason = "configuration" | "input" | "request" | "timeout" | "response" | "too-large";
/** Contains only fixed local words and a numeric status, never provider text. */
export class GitHubFailure extends Error {
  constructor(readonly reason: GitHubFailureReason, readonly status: number | null = null) {
    super(`GitHub ${reason}${status === null ? "" : ` (${status})`}`);
    this.name = "GitHubFailure";
  }
}

const fail = (reason: GitHubFailureReason, status: number | null = null): never => { throw new GitHubFailure(reason, status); };
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
const record = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return fail("response");
  return value as Record<string, unknown>;
};
const loginOK = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(value);
const nameOK = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_.-]{1,100}$/.test(value) && value !== "." && value !== ".." && !value.toLowerCase().endsWith(".git");
const credential = (value: unknown): string => {
  if (typeof value !== "string" || !/^[A-Za-z0-9_.-]{1,4096}$/.test(value)) return fail("input");
  return value;
};
const utf8 = new TextEncoder();
function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
const jsonPart = (value: unknown): string => base64url(utf8.encode(JSON.stringify(value)));

function scopeOf(value: GitHubTokenScope): { repositoryIds: number[]; permissions: Record<string, GitHubPermission> } {
  // Snapshot both inputs before any await. Never omit the repository scope.
  const ids = [...value.repositoryIds];
  const permissions = Object.fromEntries(Object.entries(value.permissions));
  if (ids.length === 0 || ids.length > 500 || !ids.every(positive) || new Set(ids).size !== ids.length || Object.keys(permissions).length === 0 || Object.keys(permissions).length > 50 || Object.entries(permissions).some(([key, level]) => !/^[a-z][a-z0-9_]{0,63}$/.test(key) || (level !== "read" && level !== "write"))) return fail("input");
  return { repositoryIds: ids, permissions };
}

export class GitHubApp {
  readonly #issuer: string;
  readonly #pem: string;
  readonly #installation: number;
  readonly #account: GitHubAccount;
  readonly #fetch: (request: Request) => Promise<Response>;
  readonly #now: () => number;
  readonly #timeout: number;
  readonly #maxBytes: number;
  #key: CryptoKey | undefined;

  constructor(options: GitHubAppOptions) {
    if (!/^[A-Za-z0-9_.-]{1,128}$/.test(options.issuer) || !positive(options.installationId) || !positive(options.account.id) || !loginOK(options.account.login) || (options.account.type !== "User" && options.account.type !== "Organization") || typeof options.privateKey !== "string" || options.privateKey.length > 16_384 || !/^-----BEGIN PRIVATE KEY-----\r?\n[A-Za-z0-9+/=\r\n]+\r?\n-----END PRIVATE KEY-----\s*$/.test(options.privateKey)) fail("configuration");
    this.#issuer = options.issuer;
    this.#pem = options.privateKey;
    this.#installation = options.installationId;
    this.#account = { ...options.account };
    this.#fetch = options.fetch ?? ((request) => fetch(request));
    this.#now = options.now ?? Date.now;
    this.#timeout = options.timeoutMs ?? 30_000;
    this.#maxBytes = options.maxResponseBytes ?? 512 * 1024;
    if (!positive(this.#timeout) || this.#timeout > 120_000 || !positive(this.#maxBytes) || this.#maxBytes > 4 * 1024 * 1024) fail("configuration");
  }

  /** RS256 JWT, issued 60s in the past and expiring 9 minutes from now. */
  async jwt(): Promise<string> {
    try {
      if (this.#key === undefined) {
        const encoded = this.#pem.replace(/-----[^\n]+-----/g, "").replace(/\s/g, "");
        const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
        this.#key = await crypto.subtle.importKey("pkcs8", bytes, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
      }
      const now = Math.floor(this.#now() / 1000);
      if (!positive(now)) return fail("configuration");
      const unsigned = `${jsonPart({ alg: "RS256", typ: "JWT" })}.${jsonPart({ iat: now - 60, exp: now + 540, iss: this.#issuer })}`;
      const signed = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", this.#key, utf8.encode(unsigned));
      return `${unsigned}.${base64url(new Uint8Array(signed))}`;
    } catch { return fail("configuration"); }
  }

  /**
   * Configuration/bootstrap check, separate from mint's single POST. A caller
   * must establish this binding before using configured installation authority.
   */
  async validateInstallation(): Promise<void> {
    const data = record(await this.#request(`/app/installations/${this.#installation}`, "GET", await this.jwt(), 200));
    if (data["id"] !== this.#installation) fail("response");
    this.#checkAccount(data["account"]);
    if (data["suspended_at"] !== null) fail("response");
  }

  /** One POST, explicit repository IDs and permissions; never an all-repo token. */
  async mintInstallationToken(value: GitHubTokenScope): Promise<GitHubInstallationToken> {
    const scope = scopeOf(value);
    const answer = record(await this.#request(`/app/installations/${this.#installation}/access_tokens`, "POST", await this.jwt(), 201, { repository_ids: scope.repositoryIds, permissions: scope.permissions }));
    if (answer["repository_selection"] !== "selected") fail("response");
    const plaintext = typeof answer["token"] === "string" && /^[A-Za-z0-9_.-]{1,4096}$/.test(answer["token"]) ? answer["token"] : fail("response");
    const expiresAt = answer["expires_at"];
    const time = typeof expiresAt === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(expiresAt) ? Date.parse(expiresAt) : NaN;
    const now = this.#now();
    if (!Number.isFinite(now) || !Number.isFinite(time) || time <= now || time > now + 65 * 60_000) fail("response");
    const permissions = record(answer["permissions"]);
    // GitHub implicitly grants metadata:read. No other extra permission or
    // a stronger returned permission can be accepted as the requested scope.
    if (Object.entries(permissions).some(([key, level]) => level !== scope.permissions[key] && !(key === "metadata" && level === "read" && scope.permissions[key] === undefined)) || Object.entries(scope.permissions).some(([key, level]) => permissions[key] !== level)) fail("response");
    const repositories = answer["repositories"];
    if (!Array.isArray(repositories) || repositories.length !== scope.repositoryIds.length) return fail("response");
    const ids = repositories.map((repository) => this.#repository(repository).id);
    if (new Set(ids).size !== ids.length || ids.some((id) => !scope.repositoryIds.includes(id))) fail("response");
    return Object.freeze({ plaintext, expiresAt: expiresAt as string, repositoryIds: Object.freeze(scope.repositoryIds), permissions: Object.freeze(scope.permissions) });
  }

  /** DELETE authenticated by the exact plaintext being revoked. */
  async revokeToken(plaintext: string): Promise<void> {
    await this.#request("/installation/token", "DELETE", credential(plaintext), 204);
  }

  /** A 404 means GitHub did not expose it; it is not proof of nonexistence. */
  async repository(name: string, plaintext: string): Promise<GitHubRepository | null> {
    const answer = await this.#request(this.#repoPath(name), "GET", credential(plaintext), 200, undefined, true);
    return answer === null ? null : this.#repository(answer, name);
  }

  /**
   * Caller supplies separately configured creation authority. A scoped mint
   * above is no promise of permission to create a new repository. Empty repo:
   * no auto-init, license, ignore template, fork or unrelated refs requested.
   */
  async createRepository(name: string, options: { private: boolean }, plaintext: string): Promise<GitHubRepository> {
    this.#repoPath(name);
    if (typeof options.private !== "boolean") return fail("input");
    const isPrivate = options.private;
    const path = this.#account.type === "Organization" ? `/orgs/${this.#account.login}/repos` : "/user/repos";
    const answer = this.#repository(await this.#request(path, "POST", credential(plaintext), 201, { name, private: isPrivate, auto_init: false }), name);
    if (answer.private !== isPrivate) fail("response");
    return answer;
  }

  /**
   * One DELETE with a token restricted to the exact recorded repository ID.
   * GitHub's ID-scoped authority cannot delete a replacement at the same name.
   * Caller binds the name from the sealed creation and preserves this wrapper
   * honestly from mint/custody; a wrapper is not a cryptographic token proof.
   * Caller owns the cleanup token's custody, revocation and retained evidence.
   */
  async deleteRepository(name: string, repositoryId: number, token: GitHubInstallationToken): Promise<void> {
    const scope = scopeOf(token);
    if (!positive(repositoryId) || scope.repositoryIds.length !== 1 || scope.repositoryIds[0] !== repositoryId || scope.permissions["administration"] !== "write" || Object.entries(scope.permissions).some(([key, level]) => key !== "administration" && !(key === "metadata" && level === "read")) || !Number.isFinite(Date.parse(token.expiresAt)) || Date.parse(token.expiresAt) <= this.#now()) fail("input");
    await this.#request(this.#repoPath(name), "DELETE", credential(token.plaintext), 204);
  }

  #repoPath(name: string): string {
    if (!nameOK(name)) return fail("input");
    return `/repos/${this.#account.login}/${name}`;
  }

  #checkAccount(value: unknown): string {
    const owner = record(value);
    const login = owner["login"];
    if (!loginOK(login) || login.toLowerCase() !== this.#account.login.toLowerCase() || owner["id"] !== this.#account.id || owner["type"] !== this.#account.type) return fail("response");
    return login;
  }

  #repository(value: unknown, expected?: string): GitHubRepository {
    const repository = record(value);
    const owner = this.#checkAccount(repository["owner"]);
    const name = repository["name"];
    const id = repository["id"];
    if (!nameOK(name) || !positive(id) || typeof repository["private"] !== "boolean" || (expected !== undefined && name.toLowerCase() !== expected.toLowerCase())) return fail("response");
    const htmlUrl = `https://github.com/${owner}/${name}`;
    const gitUrl = `${htmlUrl}.git`;
    if (repository["full_name"] !== `${owner}/${name}` || repository["html_url"] !== htmlUrl || repository["clone_url"] !== gitUrl) return fail("response");
    return { id, owner, name, private: repository["private"], htmlUrl, gitUrl };
  }

  async #request(path: string, method: "GET" | "POST" | "DELETE", token: string, status: number, body?: unknown, missing = false): Promise<unknown> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new GitHubFailure("timeout")); }, this.#timeout);
    });
    let response: Response | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const url = `https://api.github.com${path}`;
      const headers = new Headers({ accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "x-github-api-version": "2022-11-28", "user-agent": "Artroom-GitHub-App" });
      if (body !== undefined) headers.set("content-type", "application/json");
      const request = new Request(url, { method, headers, credentials: "omit", redirect: "error", signal: controller.signal, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const pending = this.#fetch(request);
      // Dispose a late response even if a supplied transport ignores abort.
      void pending.then((late) => { if (controller.signal.aborted) void late.body?.cancel().catch(() => undefined); }, () => undefined);
      response = await Promise.race([pending, deadline]);
      if (response.redirected || (response.url !== "" && response.url !== url)) return fail("response", response.status);
      if (missing && response.status === 404) return null;
      if (response.status !== status) return fail("response", response.status);
      if (status === 204) return undefined;
      if (response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json" || response.body === null) return fail("response", response.status);
      const length = response.headers.get("content-length");
      if (length !== null && (!/^\d+$/.test(length) || Number(length) > this.#maxBytes)) return fail("too-large");
      reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const chunk = await Promise.race([reader.read(), deadline]);
        if (chunk.done) break;
        size += chunk.value.length;
        if (size > this.#maxBytes) return fail("too-large");
        chunks.push(chunk.value);
      }
      const bytes = new Uint8Array(size);
      let at = 0;
      for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
      try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown; }
      catch { return fail("response"); }
    } catch (error) {
      if (error instanceof GitHubFailure) throw error;
      return fail(controller.signal.aborted ? "timeout" : "request");
    } finally {
      clearTimeout(timer);
      if (reader !== undefined) { void reader.cancel().catch(() => undefined); reader.releaseLock(); }
      else { void response?.body?.cancel().catch(() => undefined); }
    }
  }
}
