/**
 * What the command keeps between runs: one config, and one Ed25519 secret
 * for each key it made, by name. A key is the 32-byte secret that the
 * client's `secretSigner` signs with, which the contract's signing needs.
 * The command reads a secret only to sign: it never prints one, and no
 * line it writes holds one.
 *
 * `files.ts` keeps both under the user's config directory, readable only by
 * the user. `memoryStore` keeps them in memory, for a test.
 */

import type { Digest, FactRef, ScopeId, ScopeRef, SignedIntent } from "@generalbusiness/artroom-contract";

/** The scopes of one repository, as `claim` or `join` learned them. */
export interface Repository {
  directory: ScopeRef;
  membership: ScopeRef;
  rules: ScopeId;
  destination: ScopeId;
  /** The caller's own inbox, once membership has created it. */
  inbox?: ScopeId;
}

/**
 * One exact mutation envelope, kept before it leaves. A missing accepted fact
 * means delivery is uncertain: retry these bytes, never a fresh signature.
 */
export interface ClaimStep { signed: SignedIntent; accepted?: FactRef }
/**
 * Public authorization data, not signing keys. `found` is optional only to
 * recognize older digest-only records: they cannot reconstruct their signature.
 * Learned repository references and enrollment steps survive interrupted runs.
 */
export interface PendingClaim {
  register: ScopeId; intent: Digest; handle: string;
  found?: ClaimStep;
  repository?: Repository;
  seat?: ClaimStep;
  firstKey?: ClaimStep;
}

export interface Config {
  v: 1;
  /** The scope service's base URL. */
  service: string;
  /** The name of the key that signs this caller's acts. */
  key: string;
  /** The register this command founded, as its receipt names it. */
  register?: ScopeRef;
  repository?: Repository;
  /** A claim that `claim` submitted and has not seen through yet. A later `claim` goes on from it. */
  claim?: PendingClaim;
  /** The caller's handle in membership, once it has one. */
  handle?: string;
}

export interface Store {
  config(): Promise<Config | null>;
  save(config: Config): Promise<void>;
  /** The secret of the named key, or null when there is none. */
  secret(name: string): Promise<Uint8Array | null>;
  /** Keep a new secret under the name. A name that holds one already is refused: a key is never replaced. */
  keep(name: string, secret: Uint8Array): Promise<void>;
}

/** A store in memory, for a test: each instance is one person's config directory. */
export function memoryStore(): Store {
  let config: Config | null = null;
  const secrets = new Map<string, Uint8Array>();
  return {
    config: async () => (config === null ? null : structuredClone(config)),
    save: async (next) => { config = structuredClone(next); },
    secret: async (name) => secrets.get(name) ?? null,
    keep: async (name, secret) => {
      if (secrets.has(name)) throw new Error(`a key named ${name} exists already; it is not replaced`);
      secrets.set(name, secret.slice());
    },
  };
}
