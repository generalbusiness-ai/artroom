/**
 * The parts of the Artifacts Workers binding this package uses, as
 * structural types, so the core needs no Workers types. A real `Artifacts`
 * binding and `ArtifactsRepo` handle satisfy them.
 */

import type { TreeReader } from "./diff/treediff.ts";

export interface TokenInfo {
  readonly id: string;
  readonly scope: "read" | "write";
  readonly state: "active" | "expired" | "revoked";
  readonly expiresAt: string;
}

export interface MintedToken {
  readonly id: string;
  readonly plaintext: string;
  readonly scope: "read" | "write";
  readonly expiresAt: string;
}

export interface RepoHandle extends TreeReader {
  createToken(scope?: "write" | "read", ttl?: number): Promise<MintedToken>;
  revokeToken(tokenOrId: string): Promise<boolean>;
  listTokens(): Promise<{ readonly tokens: readonly TokenInfo[]; readonly total: number }>;
  info(): Promise<{ readonly name: string; readonly remote: string; readonly source: string | null }>;
  fork(
    name: string,
    opts?: { description?: string; readOnly?: boolean; defaultBranchOnly?: boolean },
  ): Promise<{ readonly name: string; readonly remote: string; readonly token: string }>;
  log(opts?: { ref?: string; limit?: number }): Promise<readonly { readonly hash: string }[]>;
}

export interface ArtifactsNamespace {
  get(name: string): Promise<RepoHandle>;
  /**
   * Create a new, empty repository (no refs). The answer carries one write
   * token, in plaintext, which the caller must revoke when done with it.
   * Throws `ALREADY_EXISTS` if the name is taken.
   */
  create(name: string, opts?: { readonly description?: string; readonly setDefaultBranch?: string }): Promise<CreatedRepo>;
  /** Delete a repository and every token minted for it. True if deleted, false if there was none. */
  delete(name: string): Promise<boolean>;
}

/** What `create` answers (a subset of the binding's `ArtifactsCreateRepoResult`). */
export interface CreatedRepo {
  readonly name: string;
  readonly remote: string;
  readonly token: string;
}

/**
 * Every token of a complete, well-formed listing: as many records as its
 * total, each with an ID, a known scope and state, and a readable expiry.
 * Anything else throws: an incomplete or malformed listing proves nothing is
 * absent, so no caller may treat it as an inventory. The caller applies its
 * own active and expiry filter to what this returns.
 */
export function completeInventory(listing: unknown, what = "the token inventory"): readonly TokenInfo[] {
  const r = listing as { tokens?: unknown; total?: unknown } | null;
  const tokens = r?.tokens;
  const wellFormed = (t: unknown): t is TokenInfo => {
    const x = t as Partial<TokenInfo> | null;
    return (
      !!x &&
      typeof x.id === "string" &&
      x.id.length > 0 &&
      (x.scope === "read" || x.scope === "write") &&
      (x.state === "active" || x.state === "expired" || x.state === "revoked") &&
      typeof x.expiresAt === "string" &&
      Number.isFinite(Date.parse(x.expiresAt))
    );
  };
  if (!Array.isArray(tokens) || r?.total !== tokens.length || !tokens.every(wellFormed)) {
    throw new Error(`${what} is incomplete or malformed`);
  }
  return tokens;
}

/** An Artifacts error, as thrown by the binding. */
export function artifactsCode(e: unknown): string | null {
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : null;
}

/**
 * Artifacts error codes that mean the request was refused and changed
 * nothing: a definite remote answer. Every other failure, including
 * Artifacts' INTERNAL_ERROR (10400, which has been seen after a fork was
 * created) and any transport failure (a lost connection, a reset RPC),
 * leaves the outcome unknown: the request may still apply.
 */
const REFUSED_UNCHANGED = new Set(["ALREADY_EXISTS", "INVALID_INPUT", "INVALID_REPO_NAME", "INVALID_TTL", "NOT_FOUND"]);

/** True only for an Artifacts error that says the request was refused and changed nothing. */
export function refusedUnchanged(e: unknown): boolean {
  const code = artifactsCode(e);
  const numeric = (e as { numericCode?: unknown } | null)?.numericCode;
  return code !== null && REFUSED_UNCHANGED.has(code) && typeof numeric === "number";
}

/**
 * Artifacts creation sometimes fails with an internal error (10400) that
 * succeeds on retry (plan section 2: about 5 in 70). Retry those, and only
 * those, with backoff.
 */
export function retriable(e: unknown): boolean {
  const code = artifactsCode(e);
  const numeric = (e as { numericCode?: unknown } | null)?.numericCode;
  return code === "INTERNAL_ERROR" || code === "UPSTREAM_UNAVAILABLE" || numeric === 10400 || /10400/.test(String(e));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { readonly attempts?: number; readonly firstMs?: number; readonly sleep?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 5;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let wait = opts.firstMs ?? 500;
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= attempts || !retriable(e)) throw e;
      await sleep(wait);
      wait *= 2;
    }
  }
}

/** Main on a repo, read through the binding. */
export async function readMainVia(repo: RepoHandle): Promise<string> {
  // The binding's `log` takes a branch name; a full ref name is tried as well.
  for (const ref of ["main", "refs/heads/main"]) {
    const [top] = await repo.log({ ref, limit: 1 });
    if (top) return top.hash;
  }
  throw new Error("main is missing");
}
