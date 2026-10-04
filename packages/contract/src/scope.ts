/**
 * Identifiers, the seed and the four reference classes (scope contract,
 * sections 2.1 and 3). Types only. The bytes package makes and checks the
 * identifiers.
 */

/** A SHA-256 digest: `sha256:` + 64 lowercase hex characters (section 2.1). */
export type Digest = `sha256:${string}`;

/** A scope's ID: `sc_` + the 52 base32 characters of its seed's digest (section 2.1). */
export type ScopeId = `sc_${string}`;

/** A scope's incarnation: `in_` + 26 base32 characters, random, minted with the first entry (section 2.2). */
export type Incarnation = `in_${string}`;

export type ScopeKind = "directory" | "membership" | "rules" | "destination" | "inbox" | "task" | "lane";

/** An Ed25519 public key: `key_` + unpadded base64url of its 32 raw bytes. */
export type KeyId = `key_${string}`;

/** A member's handle, for example `@alice`. */
export type MemberId = `@${string}`;

/** RFC 3339 UTC time with a `Z` suffix. */
export type Timestamp = string;

/** Unpadded base64url (RFC 4648 section 5). Used for keys and signatures. */
export type Base64Url = string;

/** An operation that writes outside the service. Stable across its attempts (section 4.3). */
export type OperationId = `op_${string}`;

/** A definition the platform supplies in code, by name and version (section 6.1). */
export type PlatformDefinition = `platform:${"directory" | "membership" | "rules" | "destination" | "inbox" | "task"}@${number}`;

/** What a scope ID is the digest of. It holds no sequence number and no hash of the creating entry (section 2.1). */
export interface Seed {
  v: 1;
  kind: ScopeKind;
  definition: Digest | PlatformDefinition;
  creator: ScopeRef | null;     // null for a repository's directory
  cause: Digest;                // identifies the one input that asked for this scope; section 7.2
  ordinal: number;              // which creation of that input, from 0
}

/** One incoming delivery, exactly. Built by the receiver from the verified envelope (section 2.1). */
export interface DeliveryCause {
  v: 1;
  from: FactRef;                // the source fact of the incoming envelope, as verified
  n: number;                    // the ordinal of the incoming send in that source entry
  message: Digest;              // the digest of the delivered message
}

/** Identity: this scope, this incarnation. Says nothing about its state. */
export interface ScopeRef { scope: ScopeId; inc: Incarnation; kind: ScopeKind }

/** Fact: one sealed entry, exactly. Always built after that entry is sealed. */
export interface FactRef { at: ScopeRef; seq: number; hash: Digest }

/** Which scopes a grant covers when it names more than one. Defined by the authority note. */
export type ScopeFilter = unknown;

/** What shows that a grant is current. Defined by the authority note. */
export type FreshnessProof = unknown;

/** Grant: permission issued by a fact in an authority scope. */
export interface Grant {
  issued: FactRef;
  subject: MemberRef;
  key: KeyId;                      // the key that may use it
  principal: MemberRef | null;     // when the key acts for another member
  actions: readonly string[];
  within: ScopeRef | ScopeFilter;
  notAfter: Timestamp | null;
  fresh: FreshnessProof;
}

/** Commitment: one exact operation its issuer has promised to complete. */
export interface Commitment {
  issued: FactRef;
  operation: OperationId;          // stable across attempts
  subject: FactRef;
  cancelBy: unknown;               // the point of no return; defined by the authority note
  result: FactRef | null;
}

export interface MemberRef { membership: ScopeRef; member: MemberId }
