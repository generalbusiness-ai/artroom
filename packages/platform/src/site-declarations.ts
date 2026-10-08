/** Adopted f60 declarations only. Parsing establishes neither authority nor
 * registration, key custody, current policy, expiry or publication proof. */
import type { Digest, FactRef, KeyId, ScopeRef, Timestamp } from "@generalbusiness/artroom-contract";
import { CanonicalError, canonicalBytes, canonicalize, isDigest, isFactRef, isKeyId, isRecord, isScopeRef, parseStrictBytes, timeMs, wellFormed } from "@generalbusiness/artroom-bytes";
import { isObjectId } from "./reservation.ts";

export const SITE_DELEGATION_DOMAIN = "artroom-site-delegation-1";
export const SITE_CONFIGURATION_DOMAIN = "artroom-site-configuration-1";

/** Caller supplies these identities from its own verified context. Equality
 * here is a declaration check, not verification of that context. */
export interface SiteDeclarationContext {
  directory: ScopeRef & { kind: "directory" };
  membership: ScopeRef & { kind: "membership" };
  rules: ScopeRef & { kind: "rules" };
  destination: ScopeRef & { kind: "destination" };
  repository: { host: string; namespace: string; name: string; id: string };
}
export interface SiteDelegation extends SiteDeclarationContext {
  v: 1;
  renderer: { installation: Digest; key: KeyId };
  actions: ["repository.read"];
  notAfter: Timestamp;
}
export interface SiteConfiguration extends SiteDeclarationContext {
  v: 1;
  audience: "public" | "members";
  versions: { mode: "latest-published"; ref: "HEAD" }
    | { mode: "pinned-published"; commit: string; publication: FactRef; receipt: FactRef };
  rendering: "site-safe@1";
  delegation: FactRef;
}

const REALM = ["directory", "membership", "rules", "destination"] as const;
const CONTEXT = [...REALM, "repository"];
const exact = (value: unknown, names: readonly string[]): value is Record<string, unknown> =>
  isRecord(value) && Object.keys(value).length === names.length && names.every((name) => Object.hasOwn(value, name));
const text = (value: unknown): value is string => typeof value === "string" && wellFormed(value);
const same = (a: unknown, b: unknown): boolean => canonicalize(a) === canonicalize(b);

function context(value: unknown): value is SiteDeclarationContext {
  if (!isRecord(value) || !REALM.every((name) => isScopeRef(value[name]) && value[name].kind === name)) return false;
  const repository = value["repository"];
  // Names and stable IDs are opaque provider text. No URL, numeric-ID or
  // repository-privacy policy is inferred from their declaration shape.
  return exact(repository, ["host", "namespace", "name", "id"]) && Object.values(repository).every(text);
}
function bound(value: unknown, expected: SiteDeclarationContext): value is SiteDeclarationContext {
  return context(value) && context(expected) && CONTEXT.every((name) => same(value[name as keyof SiteDeclarationContext], expected[name as keyof SiteDeclarationContext]));
}
function factAt(value: unknown, at: ScopeRef): value is FactRef {
  return isFactRef(value) && same(value.at, at);
}

function delegation(value: unknown, expected: SiteDeclarationContext): value is SiteDelegation {
  return exact(value, ["v", ...CONTEXT, "renderer", "actions", "notAfter"]) && bound(value, expected) && value["v"] === 1
    && exact(value["renderer"], ["installation", "key"]) && isDigest(value["renderer"]["installation"]) && isKeyId(value["renderer"]["key"])
    && Array.isArray(value["actions"]) && value["actions"].length === 1 && value["actions"][0] === "repository.read"
    && timeMs(value["notAfter"]) !== null;
}
function configuration(value: unknown, expected: SiteDeclarationContext): value is SiteConfiguration {
  if (!exact(value, ["v", ...CONTEXT, "audience", "versions", "rendering", "delegation"]) || !bound(value, expected) || value["v"] !== 1
    || (value["audience"] !== "public" && value["audience"] !== "members") || value["rendering"] !== "site-safe@1"
    || !factAt(value["delegation"], expected.rules)) return false;
  const versions = value["versions"];
  return (exact(versions, ["mode", "ref"]) && versions["mode"] === "latest-published" && versions["ref"] === "HEAD")
    || (exact(versions, ["mode", "commit", "publication", "receipt"]) && versions["mode"] === "pinned-published" && isObjectId(versions["commit"])
      && factAt(versions["publication"], expected.destination) && factAt(versions["receipt"], expected.destination));
}

function read<T>(domain: string, wanted: string, bytes: Uint8Array, expected: SiteDeclarationContext, maxBytes: number, guard: (v: unknown, e: SiteDeclarationContext) => v is T): T | null {
  if (domain !== wanted || !(bytes instanceof Uint8Array) || !Number.isSafeInteger(maxBytes) || maxBytes < 0 || bytes.byteLength > maxBytes) return null;
  try {
    const value = parseStrictBytes(bytes);
    const canonical = canonicalBytes(value);
    if (bytes.length !== canonical.length || !bytes.every((byte, i) => byte === canonical[i])) return null;
    return guard(value, expected) ? value : null;
  } catch (error) {
    if (error instanceof CanonicalError) return null;
    throw error;
  }
}

/** Strict canonical payload bytes in the explicit domain and caller budget.
 * A returned expiry/key is declared data; it proves no current right or custody. */
export function parseSiteDelegation(domain: string, bytes: Uint8Array, expected: SiteDeclarationContext, maxBytes: number): SiteDelegation | null {
  return read(domain, SITE_DELEGATION_DOMAIN, bytes, expected, maxBytes, delegation);
}
/** Fact references are checked for form and exact owner only. Their history,
 * causal admission, current pointer and written receipt remain to be proved. */
export function parseSiteConfiguration(domain: string, bytes: Uint8Array, expected: SiteDeclarationContext, maxBytes: number): SiteConfiguration | null {
  return read(domain, SITE_CONFIGURATION_DOMAIN, bytes, expected, maxBytes, configuration);
}
