/** Adopted b74 content/signature framing. Hash/signature correctness is not trust or access. */
import type { Digest } from "@generalbusiness/artroom-contract";
import { canonicalize, CanonicalError, utf8 } from "./canonical.ts";
import { digestBytes } from "./hash.ts";

export const SEMANTIC_CONTENT_DOMAINS = [
  "artroom-semantic-bundle-1", "artroom-source-binding-1", "artroom-source-binding-set-1",
  "artroom-semantic-signature-1", "artroom-bundle-trust-anchor-1", "artroom-bundle-anchor-change-1",
] as const;
export type SemanticContentDomain = typeof SEMANTIC_CONTENT_DOMAINS[number];
/** Exact domain-newline-canonical bytes, used for content IDs and Ed25519 signatures, never the intent domain. */
export function semanticContentBytes(domain: SemanticContentDomain, payload: unknown): Uint8Array {
  if (!SEMANTIC_CONTENT_DOMAINS.includes(domain)) throw new CanonicalError("unknown semantic content domain");
  return utf8(`${domain}\n${canonicalize(payload)}`);
}
export function semanticContentId(domain: SemanticContentDomain, payload: unknown): Digest {
  return digestBytes(semanticContentBytes(domain, payload));
}
